const express = require('express');
const https = require('https');
const http = require('http');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

app.get('/proxy', (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).send('Missing URL parameter');
    }

    const client = targetUrl.startsWith('https') ? https : http;

    client.get(targetUrl, (proxyRes) => {
        let contentType = proxyRes.headers['content-type'];
        if (contentType) {
            res.setHeader('content-type', contentType);
        }
        res.writeHead(proxyRes.statusCode);
        proxyRes.pipe(res);
    }).on('error', (err) => {
        console.error('Proxy error:', err);
        res.status(500).send('Proxy error: ' + err.message);
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
