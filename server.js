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
            'User-Agent': 'IPTVSmartersPro',
            'Accept': '*/*',
            'Connection': 'keep-alive',
            'Host': parsedTarget.hostname
        }
    };

    const proxyReq = client.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
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
