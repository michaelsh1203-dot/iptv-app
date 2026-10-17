const express = require('express');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));

app.get('/proxy', (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).send('Missing url parameter');
    }

    try {
        const parsedUrl = new URL(targetUrl);
        const lib = parsedUrl.protocol === 'https:' ? https : http;

        const proxyReq = lib.get(targetUrl, {
            headers: {
                'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
                'Accept': '*/*',
                'Connection': 'keep-alive'
            }
        }, (proxyRes) => {
            // העתקת כותרות והגדרת CORS
            Object.keys(proxyRes.headers).forEach(key => {
                res.setHeader(key, proxyRes.headers[key]);
            });
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.status(proxyRes.statusCode);

            proxyRes.pipe(res);
        });

        proxyReq.on('error', (err) => {
            res.status(500).send('Proxy Error: ' + err.message);
        });

    } catch (err) {
        res.status(500).send('Invalid URL: ' + err.message);
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
