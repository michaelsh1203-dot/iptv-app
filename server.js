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
    const protocol = parsedTarget.protocol === 'https:' ? https : http;

    const options = {
        hostname: parsedTarget.hostname,
        port: parsedTarget.port || (parsedTarget.protocol === 'https:' ? 443 : 80),
        path: parsedTarget.path,
        method: req.method,
        headers: {
            'User-Agent': 'IPTVSmartersPro',
            'Accept': '*/*',
            'Connection': 'keep-alive'
        }
    };

    const proxyReq = protocol.request(options, (proxyRes) => {
        // טיפול בהפניות (Redirects 301/302)
        if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
            let redirectUrl = proxyRes.headers.location;
            if (!redirectUrl.startsWith('http')) {
                redirectUrl = urlModule.resolve(targetUrl, redirectUrl);
            }
            return res.redirect(`/proxy?url=${encodeURIComponent(redirectUrl)}`);
        }

        const contentType = proxyRes.headers['content-type'] || '';
        
        // אם מדובר בקובץ M3U8 (פלייליסט), נשכתב את הקישורים הפנימיים שיעברו דרך ה-Proxy
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
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(rewrittenBody);
            });
        } else {
            // עבור וידאו רגיל (.ts / .mp4) או קריאות JSON
            res.writeHead(proxyRes.statusCode, {
                ...proxyRes.headers,
                'Access-Control-Allow-Origin': '*'
            });
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
