const express = require('express');
const https = require('https');
const http = require('http');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

app.use('/proxy', (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).send('Missing target URL');
    }

    const client = targetUrl.startsWith('https') ? https : http;

    const proxyReq = client.get(targetUrl, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
        console.error('Proxy error:', err);
        res.status(500).send('Proxy error');
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
