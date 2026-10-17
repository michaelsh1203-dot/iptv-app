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

    // הגדרת CORS חופשי
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }

    const client = targetUrl.startsWith('https') ? https : http;

    const options = {
        headers: {
            'User-Agent': 'IPTVSmarters/3.1.5 (iPad; iOS 16.0; Scale/2.00)',
            'Accept': '*/*',
            'Connection': 'keep-alive'
        }
    };

    const proxyReq = client.get(targetUrl, options, (proxyRes) => {
        // העברת כל הכותרות (Headers) שהתקבלו מספק ה-IPTV
        res.status(proxyRes.statusCode);
        Object.keys(proxyRes.headers).forEach((key) => {
            res.setHeader(key, proxyRes.headers[key]);
        });

        // דריסת CORS למניעת חסימות דפדפן
        res.setHeader('Access-Control-Allow-Origin', '*');

        proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
        console.error('Proxy error:', err.message);
        if (!res.headersSent) {
            res.status(500).send('Proxy error: ' + err.message);
        }
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
