const express = require('express');
const path = require('path');
const http = require('http');
const https = require('https');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/proxy', (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).json({ error: 'Missing target URL' });
    }

    try {
        const client = targetUrl.startsWith('https') ? https : http;
        
        client.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        }, (proxyRes) => {
            let status = proxyRes.statusCode;
            if (!status || status < 100 || status > 599) {
                status = 500;
            }

            res.status(status);
            
            Object.keys(proxyRes.headers).forEach((key) => {
                if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(key.toLowerCase())) {
                    res.setHeader(key, proxyRes.headers[key]);
                }
            });

            proxyRes.pipe(res);
        }).on('error', (err) => {
            console.error('Proxy Request Error:', err.message);
            res.status(500).json({ error: 'Proxy request failed', details: err.message });
        });

    } catch (err) {
        console.error('Server Error:', err.message);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});