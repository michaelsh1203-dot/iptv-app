const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Password Authentication Middleware (Optional)
const APP_PASSWORD = process.env.APP_PASSWORD || null;

app.use('/proxy', async (req, res) => {
    if (APP_PASSWORD) {
        const clientAuth = req.headers['x-app-auth'] || req.query.auth;
        if (clientAuth !== APP_PASSWORD) {
            return res.status(401).json({ error: 'Unauthorized: Invalid App Password' });
        }
    }

    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).json({ error: 'Missing target URL' });
    }

    try {
        const fetchOptions = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*'
            }
        };

        const response = await fetch(targetUrl, fetchOptions);

        // Normalize non-standard or error status codes to prevent client/proxy loops
        let status = response.status;
        if (!status || status < 100 || status > 599 || status === 511) {
            status = 500;
        }

        res.status(status);
        response.headers.forEach((val, key) => {
            if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(key.toLowerCase())) {
                res.setHeader(key, val);
            }
        });

        const arrayBuffer = await response.arrayBuffer();
        res.send(Buffer.from(arrayBuffer));
    } catch (err) {
        console.error('Proxy Error:', err.message);
        res.status(500).json({ error: 'Proxy request failed', details: err.message });
    }
});

// Fallback to index.html for SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});