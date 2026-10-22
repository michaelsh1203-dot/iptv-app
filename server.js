const express = require('express');
const path = require('path');
const http = require('http');
const https = require('https');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/proxy', (req, res) => {
    let targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).json({ error: 'Missing target URL' });
    }

    try {
        // Fix potential double-encoded or malformed URLs
        if (targetUrl.includes('%3A') || targetUrl.includes('%2F')) {
            targetUrl = decodeURIComponent(targetUrl);
        }

        const client = targetUrl.startsWith('https') ? https : http;
        
        const proxyReq = client.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*'
            }
        }, (proxyRes) => {
            let status = proxyRes.statusCode;
            if (!status || status < 100 || status > 599) {
                status = 500;
            }

            res.status(status);
            
            Object.keys(proxyRes.headers).forEach((key) => {
                const lowerKey = key.toLowerCase();
                if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(lowerKey)) {
                    res.setHeader(key, proxyRes.headers[key]);
                }
            });

            proxyRes.pipe(res);
        });

        proxyReq.on('error', (err) => {
            console.error('Proxy Request Error:', err.message);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Proxy request failed', details: err.message });
            }
        });

    } catch (err) {
        console.error('Server Error:', err.message);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal server error', details: err.message });
        }
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});