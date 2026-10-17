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

    const options = {
        headers: {
            'User-Agent': 'IPTVSmartersPro',
            'Accept': '*/*',
            'Connection': 'keep-alive'
        }
    };

    const proxyReq = client.get(targetUrl, options, (proxyRes) => {
        if (proxyRes.statusCode === 511) {
            console.error('Upstream returned 511 for URL:', targetUrl);
        }
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
        console.error('Proxy error:', err.message);
        res.status(500).send('Proxy error: ' + err.message);
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
