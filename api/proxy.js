const http = require('http');
const https = require('https');
const { URL } = require('url');

/**
 * Helper to fetch with redirect support, custom headers, and streaming/rewriting
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

        const lib = parsedUrl.protocol === 'https:' ? https : http;
        const headers = {
            'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
            'Accept': '*/*',
            'Connection': 'keep-alive',
            'Host': parsedUrl.host,
            ...extraHeaders
        };

        const options = {
            headers,
            timeout: 20000
        };

        const req = lib.get(targetUrl, options, (res) => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                const redirectUrl = new URL(res.headers.location, targetUrl).toString();
                res.resume();
                return resolve(fetchWithRedirects(redirectUrl, maxRedirects - 1, extraHeaders));
            }

            resolve({ res, finalUrl: targetUrl, upstreamReq: req });
        });

        req.on('timeout', () => {
            req.destroy(new Error('Connection timed out'));
        });

        req.on('error', reject);
    });
}

module.exports = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Expose-Headers', '*');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).send('Missing url parameter');
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

        req.on('close', () => {
            if (!upstreamRes.complete) {
                upstreamRes.destroy();
            }
            if (upstreamReq && !upstreamReq.destroyed) {
                upstreamReq.destroy();
            }
        });

        const contentType = (upstreamRes.headers['content-type'] || '').toLowerCase();
        const isM3u8 = targetUrl.includes('.m3u8') ||
                       finalUrl.includes('.m3u8') ||
                       contentType.includes('mpegurl') ||
                       contentType.includes('application/x-mpegurl');

        Object.keys(upstreamRes.headers).forEach(key => {
            const lowerKey = key.toLowerCase();
            if (isM3u8 && ['content-length', 'content-encoding'].includes(lowerKey)) {
                return;
            }
            res.setHeader(key, upstreamRes.headers[key]);
        });

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Expose-Headers', '*');
        res.status(upstreamRes.statusCode);

        if (isM3u8 && upstreamRes.statusCode >= 200 && upstreamRes.statusCode < 300) {
            const chunks = [];
            upstreamRes.on('data', chunk => chunks.push(chunk));
            upstreamRes.on('end', () => {
                const body = Buffer.concat(chunks).toString('utf-8');
                const baseUrl = new URL(finalUrl);

                const rewritten = body.split('\n').map(line => {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith('#')) {
                        return line;
                    }
                    try {
                        const fullUrl = new URL(trimmed, baseUrl).toString();
                        return `/proxy?url=${encodeURIComponent(fullUrl)}`;
                    } catch (e) {
                        return line;
                    }
                }).join('\n');

                res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
                res.send(rewritten);
            });
        } else {
            upstreamRes.pipe(res);
        }

        upstreamRes.on('error', (err) => {
            if (!res.headersSent) {
                res.status(500).send('Upstream Error: ' + err.message);
            }
        });

    } catch (err) {
        if (!res.headersSent) {
            res.status(500).send('Proxy Error: ' + err.message);
        }
    }
};
