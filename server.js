const express = require('express');
const path = require('path');
const http = require('http');
const https = require('https');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const IPTV_SERVER = 'http://thy30188.wd.business-cloud-8.ru';
const IPTV_USER = 'd48e6682bdb8';
const IPTV_PASS = 'a6af461b63';

app.get('/api/channels', (req, res) => {
    const targetUrl = `${IPTV_SERVER}/player_api.php?username=${IPTV_USER}&password=${IPTV_PASS}&action=get_live_streams`;
    
    const client = targetUrl.startsWith('https') ? https : http;
    
    let rawData = '';
    const proxyReq = client.get(targetUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json'
        }
    }, (proxyRes) => {
        proxyRes.on('data', (chunk) => {
            rawData += chunk;
        });

        proxyRes.on('end', () => {
            try {
                const jsonParsed = JSON.parse(rawData);
                
                // ודא שאנחנו מחזירים מערך נקי תמיד ללקוח
                let channelsArray = [];
                if (Array.isArray(jsonParsed)) {
                    channelsArray = jsonParsed;
                } else if (jsonParsed && typeof jsonParsed === 'object') {
                    // אם זה אובייקט מעטפת, נמצא את המערך בפנים או נמיר את הערכים
                    const foundKey = Object.keys(jsonParsed).find(k => Array.isArray(jsonParsed[k]));
                    if (foundKey) {
                        channelsArray = jsonParsed[foundKey];
                    } else {
                        channelsArray = Object.values(jsonParsed);
                    }
                }

                res.setHeader('Content-Type', 'application/json');
                res.status(200).json(channelsArray);
            } catch (e) {
                res.status(500).json({ error: 'Failed to parse JSON' });
            }
        });
    });

    proxyReq.on('error', (err) => {
        res.status(500).json({ error: err.message });
    });
});

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
                'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
                'Accept': '*/*'
            }
        }, (proxyRes) => {
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
            if (!res.headersSent) {
                res.status(500).send('Proxy error');
            }
        });
    } catch (err) {
        if (!res.headersSent) {
            res.status(500).send('Server error');
        }
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
