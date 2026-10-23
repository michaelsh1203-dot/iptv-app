const express = require('express');
const path = require('path');
const http = require('http');
const https = require('https');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/proxy', (req, res) => {
    let targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).json({ error: 'Missing target URL' });
    }

    try {
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
            // If the upstream IPTV server returns an error, return a safe empty JSON array instead of 500
            if (proxyRes.statusCode !== 200) {
                console.warn(`Upstream server returned status ${proxyRes.statusCode} for URL: ${targetUrl}`);
                if (!res.headersSent) {
                    return res.status(200).json([]);
                }
            }

            res.status(200);
            
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
                res.status(200).json([]);
            }
        });

    } catch (err) {
        console.error('Server Error:', err.message);
        if (!res.headersSent) {
            res.status(200).json([]);
        }
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});