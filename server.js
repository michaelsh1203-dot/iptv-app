const express = require('express');
const http = require('http');
const https = require('https');
const urlModule = require('url');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

app.use('/proxy', (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).send('Missing target URL');
    }

    const parsedTarget = urlModule.parse(targetUrl);
    const isHttps = parsedTarget.protocol === 'https:';
    const protocol = isHttps ? https : http;

    // הגדרת Headers מלאים המתחזים לנגן IPTV מקורי
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive'
    };

    if (req.headers['range']) {
        headers['Range'] = req.headers['range'];
    }

    const options = {
        hostname: parsedTarget.hostname,
        port: parsedTarget.port || (isHttps ? 443 : 80),
        path: parsedTarget.path,
        method: req.method,
        headers: headers
    };

    const proxyReq = protocol.request(options, (proxyRes) => {
        // טיפול בהפניות (Redirects)
        if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
            let redirectUrl = proxyRes.headers.location;
            if (!redirectUrl.startsWith('http')) {
                redirectUrl = urlModule.resolve(targetUrl, redirectUrl);
            }
            return res.redirect(`/proxy?url=${encodeURIComponent(redirectUrl)}`);
        }

        const contentType = proxyRes.headers['content-type'] || '';
        
        // אם מדובר ב-M3U8 (פלייליסט), נשכתב את השורות כך שכל סגמנט (.ts) יעבור גם הוא דרך הפרוקסי
        if (contentType.includes('mpegurl') || targetUrl.includes('.m3u8')) {
            let body = '';
            proxyRes.setEncoding('utf8');
            proxyRes.on('data', chunk => { body += chunk; });
            proxyRes.on('end', () => {
                const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
                const rewrittenBody = body.split('\n').map(line => {
                    line = line.trim();
                    if (!line || line.startsWith('#')) return line;
                    let fullSegmentUrl = line.startsWith('http') ? line : baseUrl + line;
                    return `/proxy?url=${encodeURIComponent(fullSegmentUrl)}`;
                }).join('\n');

                res.writeHead(proxyRes.statusCode, {
                    'Content-Type': 'application/vnd.apple.mpegurl',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': '*'
                });
                res.end(rewrittenBody);
            });
        } else {
            // הזרמת ה-stream באופן ישיר
            const responseHeaders = {
                ...proxyRes.headers,
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': '*'
            };
            res.writeHead(proxyRes.statusCode, responseHeaders);
            proxyRes.pipe(res);
        }
    });

    proxyReq.on('error', (err) => {
        console.error('Proxy error:', err.message);
        if (!res.headersSent) {
            res.status(500).send('Proxy error: ' + err.message);
        }
    });

    req.pipe(proxyReq);
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
