const express = require('express');
const path = require('path');
const { Readable } = require('stream');

const app = express();
const PORT = process.env.PORT || 3000;

// הגשת קבצי האפליקציה
app.use(express.static(path.join(__dirname)));

// נתיב הפרוקסי המקומי בשרת
app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).send('Missing url parameter');
    }

    try {
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
                'Accept': '*/*',
                'Connection': 'keep-alive'
            },
            redirect: 'follow'
        });

        // העתקת כותרות והגדרת CORS
        response.headers.forEach((value, name) => {
            res.setHeader(name, value);
        });
        
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(response.status);

        // הזרמת הוידאו/נתונים בצורה רציפה ללקוח
        if (response.body) {
            const nodeStream = Readable.fromWeb(response.body);
            nodeStream.pipe(res);
        } else {
            res.end();
        }
    } catch (err) {
        res.status(500).send('Proxy Error: ' + err.message);
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
