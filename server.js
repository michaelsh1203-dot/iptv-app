const express = require('express');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }
    next();
});

app.use(express.static(path.join(__dirname)));

function fetchWithRedirects(targetUrl, maxRedirects = 5) {
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
        const options = {
            headers: {
                'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
                'Accept': '*/*',
                'Connection': 'keep-alive',
                'Host': parsedUrl.host
            }
        };

        const req = lib.get(targetUrl, options, (res) => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                const redirectUrl = new URL(res.headers.location, targetUrl).toString();
                res.resume();
                return resolve(fetchWithRedirects(redirectUrl, maxRedirects - 1));
            }
            resolve({ res, finalUrl: targetUrl });
        });

        req.on('error', reject);
    });
}

app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).send('Missing url parameter');
    }

    try {
        const { res: upstreamRes, finalUrl } = await fetchWithRedirects(targetUrl);

        const contentType = (upstreamRes.headers['content-type'] || '').toLowerCase();
        const isM3u8 = targetUrl.includes('.m3u8') ||
                       finalUrl.includes('.m3u8') ||
                       contentType.includes('mpegurl') ||
                       contentType.includes('application/x-mpegurl');

        Object.keys(upstreamRes.headers).forEach(key => {
            if (!['content-length', 'content-encoding'].includes(key.toLowerCase())) {
                res.setHeader(key, upstreamRes.headers[key]);
            }
        });
        res.setHeader('Access-Control-Allow-Origin', '*');
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
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
