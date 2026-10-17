const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

// מעקף גלובלי לבעיות תאימות SSL של שרתי סטרימינג חיצוניים
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// הגדרת מפתח אבטחה סודי (יילקח ממשתני הסביבה בענן, או ברירת מחדל לפיתוח מקומי)
const SECRET_TOKEN = process.env.SECRET_TOKEN || 'my-super-secret-token-12345';

function fetchUrl(targetUrl, res, req, maxRedirects = 5) {
    const lib = targetUrl.startsWith('https') ? https : http;

    lib.get(targetUrl, (proxyRes) => {
        if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode)) {
            let redirectUrl = proxyRes.headers.location;
            if (redirectUrl) {
                if (!redirectUrl.startsWith('http')) {
                    const parsed = url.parse(targetUrl);
                    redirectUrl = `${parsed.protocol}//${parsed.host}${redirectUrl}`;
                }
                if (maxRedirects > 0) {
                    return fetchUrl(redirectUrl, res, req, maxRedirects - 1);
                }
            }
        }

        let data = [];
        proxyRes.on('data', (chunk) => {
            data.push(chunk);
        });

        proxyRes.on('end', () => {
            let buffer = Buffer.concat(data);
            const contentType = proxyRes.headers['content-type'] || '';

            // בדיקה האם מדובר בקובץ מניפסט (m3u8 או טקסט)
            if (targetUrl.includes('.m3u8') || contentType.includes('mpegurl') || contentType.includes('text') || buffer.includes('#EXTM3U')) {
                let m3u8Content = buffer.toString('utf8');
                
                const lastSlashIdx = targetUrl.lastIndexOf('/');
                const baseUrl = targetUrl.substring(0, lastSlashIdx + 1);

                const currentHost = req.headers.host || 'localhost:3000';
                const lines = m3u8Content.split('\n');
                const rewrittenLines = lines.map(line => {
                    let trimmed = line.trim();
                    if (trimmed && !trimmed.startsWith('#')) {
                        let absoluteTsUrl;
                        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
                            absoluteTsUrl = trimmed;
                        } else if (trimmed.startsWith('/')) {
                            const parsedOriginal = url.parse(targetUrl);
                            absoluteTsUrl = `${parsedOriginal.protocol}//${parsedOriginal.host}${trimmed}`;
                        } else {
                            absoluteTsUrl = baseUrl + trimmed;
                        }
                        // הוספת מפתח האבטחה לכל בקשת פרוקסי פנימית
                        return `http://${currentHost}/proxy?url=${encodeURIComponent(absoluteTsUrl)}&token=${SECRET_TOKEN}`;
                    }
                    return line;
                });

                buffer = Buffer.from(rewrittenLines.join('\n'), 'utf8');
            }

            res.writeHead(proxyRes.statusCode, {
                'Content-Type': contentType,
                'Content-Length': buffer.length,
                'Access-Control-Allow-Origin': '*'
            });
            res.end(buffer);
        });

    }).on('error', (err) => {
        console.error("שגיאת פרוקסי:", err.message);
        if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Proxy error: ' + err.message);
        }
    });
}

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);
    
    if (parsedUrl.pathname === '/proxy') {
        // בדיקת אבטחה: האם הגיע טוקן תקין בבקשה?
        const clientToken = parsedUrl.query.token;
        if (clientToken !== SECRET_TOKEN) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('Access Denied: Invalid or missing token');
            return;
        }

        const targetUrl = parsedUrl.query.url;
        if (!targetUrl) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Missing url parameter');
            return;
        }

        console.log("מתווך:", targetUrl);
        fetchUrl(targetUrl, res, req);

    } else {
        let filePath = path.join(__dirname, parsedUrl.pathname === '/' ? 'index.html' : parsedUrl.pathname);
        fs.readFile(filePath, (err, content) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Not Found');
            } else {
                let ext = path.extname(filePath);
                let contentType = 'text/html';
                if (ext === '.js') contentType = 'application/javascript';
                else if (ext === '.css') contentType = 'text/css';
                
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content);
            }
        });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`שרת הפרוקסי המאובטח רץ בפורט ${PORT}`);
});
