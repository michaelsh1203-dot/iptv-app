const express = require('express');
const path = require('path');
const http = require('http');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

// נתוני חיבור לשרת ה-IPTV (בשימוש בכתובת http המקורית של הספק)
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

// פרוקסי שרת שמוריד את הזרם מהספק ב-http ומעביר לדפדפן בצורה חלקה
app.get('/proxy', (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).send('Missing url parameter');
    }

    const options = {
        headers: {
            'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
            'Accept': '*/*'
        }
    };

    http.get(targetUrl, options, (streamRes) => {
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
