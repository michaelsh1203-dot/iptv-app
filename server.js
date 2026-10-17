const express = require('express');
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
    // תמיד נפתח חיבור HTTP מול שרת ה־IPTV החיצוני שפועל ב־HTTP בלבד
    const options = {
        hostname: parsedTarget.hostname,
        port: parsedTarget.port || 80,
        path: parsedTarget.path,
        method: req.method,
        headers: {
            'User-Agent': 'IPTVSmartersPro',
            'Accept': '*/*',
            'Connection': 'keep-alive'
        }
    };

    const proxyReq = http.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, {
            ...proxyRes.headers,
            'Access-Control-Allow-Origin': '*'
        });
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
