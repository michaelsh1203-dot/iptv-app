const express = require('express');
const path = require('path');
const http = require('http');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

// נתוני חיבור לשרת ה-IPTV
const IPTV_SERVER = 'http://thy30188.wd.business-cloud-8.ru';
const IPTV_USER = 'd48e6682bdb8';
const IPTV_PASS = 'a6af461b63';

// API לשליפת רשימת הערוצים משרת הספק
app.get('/api/channels', (req, res) => {
    const targetUrl = `${IPTV_SERVER}/player_api.php?username=${IPTV_USER}&password=${IPTV_PASS}&action=get_live_streams`;
    
    http.get(targetUrl, (externalRes) => {
        let data = '';
        externalRes.on('data', (chunk) => {
            data += chunk;
        });
        externalRes.on('end', () => {
            try {
                const jsonData = JSON.parse(data);
                res.json(jsonData);
            } catch (e) {
                res.status(500).json({ error: 'Failed to parse JSON from IPTV provider' });
            }
        });
    }).on('error', (err) => {
        res.status(500).json({ error: err.message });
    });
});

// פרוקסי מתוקן שמעביר כותרות כדי למנוע חסימת 511 מצד הספק
app.get('/proxy', (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).send('Missing url parameter');
    }

    const client = targetUrl.startsWith('https') ? https : http;

    const options = {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    };

    client.get(targetUrl, options, (streamRes) => {
        res.writeHead(streamRes.statusCode, streamRes.headers);
        streamRes.pipe(res);
    }).on('error', (err) => {
        if (!res.headersSent) {
            res.status(500).send('Proxy error');
        }
    });
});

// שליחת קובץ ה-app.html הראשי
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'app.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
