const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).send('Missing URL parameter');
    }

    try {
        const response = await fetch(targetUrl);
        const contentType = response.headers.get('content-type');
        
        if (contentType) {
            res.setHeader('content-type', contentType);
        }

        const data = await response.text();
        res.send(data);
    } catch (err) {
        console.error('Proxy error:', err);
        res.status(500).send('Proxy error: ' + err.message);
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
