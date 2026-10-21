const http = require('http');
const https = require('https');
const { URL } = require('url');
const zlib = require('zlib');
const crypto = require('crypto');

// Standard User-Agent & HTTP headers for upstream IPTV servers
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// Hop-by-hop headers to strip when proxying
const HOP_BY_HOP = [
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
    'content-security-policy'
];

/**
 * Cookie parsing helper
 */
function parseCookies(req) {
    const list = {};
    const cookieHeader = req.headers && req.headers.cookie;
    if (!cookieHeader) return list;

    cookieHeader.split(';').forEach(cookie => {
        let [name, ...rest] = cookie.split('=');
        name = name?.trim();
        if (!name) return;
        const value = rest.join('=').trim();
        try {
            list[name] = decodeURIComponent(value);
        } catch (e) {
            list[name] = value;
        }
    });
    return list;
}

/**
 * Compute SHA-256 token for APP_PASSWORD
 */
function computeAuthToken(password) {
    if (!password) return '';
    return crypto.createHash('sha256').update(password + '_iptv_salt_2026').digest('hex');
}

/**
 * Check if request is authenticated against APP_PASSWORD
 */
function isAuthenticated(req) {
    const appPassword = process.env.APP_PASSWORD ? process.env.APP_PASSWORD.trim() : '';
    if (!appPassword) {
        return true; // Password protection disabled if APP_PASSWORD is not set
    }

    const expectedToken = computeAuthToken(appPassword);

    // 1. Check Cookie
    const cookies = parseCookies(req);
    const authCookie = cookies['app_auth'];
    if (authCookie && (authCookie === expectedToken || authCookie === appPassword)) {
        return true;
    }

    // 2. Check X-App-Password header
    const headerPass = req.headers['x-app-password'];
    if (headerPass && (headerPass === appPassword || headerPass === expectedToken)) {
        return true;
    }

    // 3. Check Authorization header
    const authHeader = req.headers['authorization'];
    if (authHeader) {
        const parts = authHeader.split(' ');
        if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
            const token = parts[1];
            if (token === appPassword || token === expectedToken) {
                return true;
            }
        }
    }

    // 4. Check Query Parameter: ?auth=... or ?password=...
    const queryPass = req.query && (req.query.auth || req.query.password || req.query.app_password);
    if (queryPass && (queryPass === appPassword || queryPass === expectedToken)) {
        return true;
    }

    return false;
}

/**
 * Safely extract and decode target URL from request
 */
function extractTargetUrl(req) {
    let target = req.query && req.query.url;
    if (!target) return null;

    // Check if the URL had unencoded '&' causing Express/Vercel to split query parameters
    const fullUrl = req.originalUrl || req.url || '';
    const urlIdx = fullUrl.indexOf('url=');
    if (urlIdx !== -1) {
        let remainder = fullUrl.slice(urlIdx + 4);
        remainder = remainder.replace(/&(?:auth|password|app_password)=[^&]*/g, '');

        try {
            const dec = decodeURIComponent(remainder);
            if (dec.startsWith('http://') || dec.startsWith('https://')) {
                target = dec;
            }
        } catch (e) {
            if (remainder.startsWith('http://') || remainder.startsWith('https://')) {
                target = remainder;
            }
        }
    }

    if (typeof target !== 'string') return null;

    // Safely handle decodeURIComponent in case of single/double encoding
    try {
        let prev = '';
        while (target !== prev && (target.startsWith('http%3A') || target.startsWith('https%3A') || target.includes('%3A%2F%2F') || target.includes('%3a%2f%2f') || target.startsWith('http%3a') || target.startsWith('https%3a'))) {
            prev = target;
            target = decodeURIComponent(target);
        }
    } catch (e) {}

    target = target.trim();
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
        try {
            const dec = decodeURIComponent(target);
            if (dec.startsWith('http://') || dec.startsWith('https://')) {
                target = dec;
            }
        } catch (e) {}
    }

    return target;
}

/**
 * Helper to fetch with redirect support, standard HTTP headers, and streaming/rewriting
 */
function fetchWithRedirects(targetUrl, maxRedirects = 5, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
        if (maxRedirects < 0) {
            return reject(new Error('Too many redirects'));
        }

        let parsedUrl;
        try {
            parsedUrl = new URL(targetUrl);
        } catch (e) {
            return reject(new Error('Invalid URL: ' + targetUrl));
        }

        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            return reject(new Error('Unsupported protocol: ' + parsedUrl.protocol));
        }

        const lib = parsedUrl.protocol === 'https:' ? https : http;
        const headers = {
            'User-Agent': DEFAULT_USER_AGENT,
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Connection': 'keep-alive',
            'Host': parsedUrl.host,
            'Referer': `${parsedUrl.protocol}//${parsedUrl.host}/`,
            ...extraHeaders
        };

        const options = {
            headers,
            timeout: 25000,
            rejectUnauthorized: false
        };

        const req = lib.get(targetUrl, options, (res) => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                res.resume();
                try {
                    const redirectUrl = new URL(res.headers.location, targetUrl).toString();
                    return resolve(fetchWithRedirects(redirectUrl, maxRedirects - 1, extraHeaders));
                } catch (e) {
                    return reject(new Error('Invalid redirect Location: ' + res.headers.location));
                }
            }

            resolve({ res, finalUrl: targetUrl, upstreamReq: req });
        });

        req.on('timeout', () => {
            req.destroy(new Error('Connection timed out'));
        });

        req.on('error', (err) => {
            reject(err);
        });
    });
}

module.exports = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Expose-Headers', '*');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (!isAuthenticated(req)) {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Password authentication required. Provide valid APP_PASSWORD via cookie, header, or query parameter.'
        });
    }

    const targetUrl = extractTargetUrl(req);
    if (!targetUrl) {
        return res.status(400).json({ error: 'Bad Request', message: 'Missing or invalid url parameter' });
    }

    const extraHeaders = {};
    if (req.headers['range']) {
        extraHeaders['Range'] = req.headers['range'];
    }

    let upstreamReq = null;

    try {
        const fetched = await fetchWithRedirects(targetUrl, 5, extraHeaders);
        const upstreamRes = fetched.res;
        const finalUrl = fetched.finalUrl;
        upstreamReq = fetched.upstreamReq;

        if (typeof req.on === 'function') {
            req.on('close', () => {
                if (!upstreamRes.destroyed) {
                    upstreamRes.destroy();
                }
                if (upstreamReq && !upstreamReq.destroyed) {
                    upstreamReq.destroy();
                }
            });
        }

        if (typeof res.on === 'function') {
            res.on('error', () => {
                if (!upstreamRes.destroyed) upstreamRes.destroy();
                if (upstreamReq && !upstreamReq.destroyed) upstreamReq.destroy();
            });
        }

        const contentType = (upstreamRes.headers['content-type'] || '').toLowerCase();
        const isPlaylist = targetUrl.includes('.m3u8') ||
                           targetUrl.includes('.m3u') ||
                           finalUrl.includes('.m3u8') ||
                           finalUrl.includes('.m3u') ||
                           contentType.includes('mpegurl') ||
                           contentType.includes('application/x-mpegurl');

        Object.keys(upstreamRes.headers).forEach(key => {
            const lowerKey = key.toLowerCase();
            if (HOP_BY_HOP.includes(lowerKey)) return;
            if (isPlaylist && ['content-length', 'content-encoding'].includes(lowerKey)) {
                return;
            }
            try {
                res.setHeader(key, upstreamRes.headers[key]);
            } catch (e) {}
        });

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');
        res.setHeader('Access-Control-Expose-Headers', '*');
        res.status(upstreamRes.statusCode);

        if (isPlaylist && upstreamRes.statusCode >= 200 && upstreamRes.statusCode < 300) {
            const chunks = [];
            upstreamRes.on('data', chunk => chunks.push(chunk));
            upstreamRes.on('error', (err) => {
                if (!res.headersSent) {
                    res.status(502).json({ error: 'Upstream Stream Error', message: err.message });
                }
            });
            upstreamRes.on('end', () => {
                let buffer = Buffer.concat(chunks);
                const encoding = (upstreamRes.headers['content-encoding'] || '').toLowerCase();
                if (encoding.includes('gzip')) {
                    try {
                        buffer = zlib.gunzipSync(buffer);
                    } catch (e) {}
                } else if (encoding.includes('deflate')) {
                    try {
                        buffer = zlib.inflateSync(buffer);
                    } catch (e) {}
                } else if (encoding.includes('br')) {
                    try {
                        buffer = zlib.brotliDecompressSync(buffer);
                    } catch (e) {}
                }

                const body = buffer.toString('utf-8');
                let baseUrl;
                try {
                    baseUrl = new URL(finalUrl);
                } catch (e) {
                    baseUrl = new URL(targetUrl);
                }

                const proxyBase = '/proxy';
                const authParam = req.query.auth ? `&auth=${encodeURIComponent(req.query.auth)}` : 
                                 req.query.password ? `&password=${encodeURIComponent(req.query.password)}` : '';

                const rewritten = body.split('\n').map(line => {
                    const trimmed = line.trim();
                    if (!trimmed) return line;

                    if (trimmed.startsWith('#EXT-X-KEY')) {
                        return line.replace(/URI=["']([^"']+)["']/, (match, keyUrl) => {
                            try {
                                const fullKeyUrl = new URL(keyUrl, baseUrl).toString();
                                return `URI="${proxyBase}?url=${encodeURIComponent(fullKeyUrl)}${authParam}"`;
                            } catch (e) {
                                return match;
                            }
                        });
                    }

                    if (trimmed.startsWith('#')) {
                        return line;
                    }

                    try {
                        const fullUrl = new URL(trimmed, baseUrl).toString();
                        return `${proxyBase}?url=${encodeURIComponent(fullUrl)}${authParam}`;
                    } catch (e) {
                        return line;
                    }
                }).join('\n');

                res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
                res.send(rewritten);
            });
        } else {
            upstreamRes.on('error', (err) => {
                if (!res.headersSent) {
                    res.status(502).json({ error: 'Upstream Error', message: err.message });
                } else {
                    res.destroy();
                }
            });

            upstreamRes.pipe(res);
        }

    } catch (err) {
        if (!res.headersSent) {
            const isInvalidUrl = err.message && err.message.includes('Invalid URL');
            const statusCode = isInvalidUrl ? 400 : 502;
            res.status(statusCode).json({
                error: 'Proxy Error',
                message: err.message
            });
        }
    }
};
