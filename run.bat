@echo off
chcp 65001 >nul
echo מפעיל את שרת ה-IPTV...
start /min cmd /c "node server.js"
timeout /t 2 >nul
echo פותח את האפליקציה בדפדפן...
start http://localhost:3000