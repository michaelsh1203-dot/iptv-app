const express = require('express');
const https = require('https');
const http = require('http');
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
    const client = parsedTarget.protocol === 'https:' ? https : http;

    const options = {
        hostname: parsedTarget.hostname,
        port: parsedTarget.port || (parsedTarget.protocol === 'https:' ? 443 : 80),
        path: parsedTarget.path,
        method: req.method,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Connection': 'keep-alive',
            'Referer': `${parsedTarget.protocol}//${parsedTarget.hostname}/`
        }
    };

    const proxyReq = client.request(options, (proxyRes) => {
        // אם מדובר בקובץ M3U8, נטפל בנתיבים הפנימיים
        if (targetUrl.includes('.m3u8')) {
            let body = '';
            proxyRes.setEncoding('utf8');
            proxyRes.on('data', chunk => body += chunk);
            proxyRes.on('end', () => {
                const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
                const rewritten = body.split('\n').map(line => {
                    if (line.trim() && !line.startsWith('#')) {
                        const segmentUrl = line.startsWith('http') ? line : baseUrl + line;
                        return `/proxy?url=${encodeURIComponent(segmentUrl)}`;
                    }
                    return line;
                }).join('\n');

                res.writeHead(proxyRes.statusCode, {
                    'Content-Type': 'application/vnd.apple.mpegurl',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(rewritten);
            });
        } else {
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
