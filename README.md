# IPTV Web Player & Cloud Proxy

אפליקציית Web IPTV מתקדמת ורספונסיבית עם שרת פרוקסי מובנה, מותאמת לסמארטפונים (iOS / Android) ולמחשב.

## תכונות עיקריות
- 📱 **מותאמת מלאה לסמארטפונים**: ממשק Touch רספונסיבי, תמיכה בהוספה למסך הבית (PWA), תמיכה במחוות Swipe להחלפת ערוצים.
- 📺 **נגן וידאו מובנה וגמיש**: תמיכה בשידורי HLS (`.m3u8`), סרטים וסדרות (MP4/VOD), נגן עליון בסלולר ומסך מלא.
- ⚡ **תמיכה מובנית ב-iOS Safari & Android Chrome**: טיפול במגבלות Autoplay ושימוש ב-HLS המקורי של Apple עבור מכשירי אייפון/אייפד.
- 🔀 **סידור ומיון במגע (Touch Drag & Drop)**: אפשרות לגרור ולסדר אריחי מדינות, ספקים וערוצים ישירות במסך המגע.
- 🌐 **מעקף CORS וחסימות ספקים**: שרת פרוקסי עם `User-Agent` מותאם אישית (VLC) ושכתוב כתובות M3U8 בזמן אמת.
- ⏩ **תמיכה ב-Range Requests**: מעבר חופשי (Seek) בסרטים ובסדרות ללא טעינה מחדש של הקובץ כולו.

---

## 🚀 אפשרויות פריסה אונליין (עבודה ללא מחשב פועל)

כדי להשתמש באפליקציה בטלפון מכל מקום ללא צורך במחשב ביתי שפועל ברקע, ניתן להעלות את הפרויקט לאחד משירותי הענן הבאים:

### אפשרות 1: פריסה ב-Render (מומלץ ביותר - חינם ומתאים במיוחד להזרמת וידאו)
1. צור חשבון חינמי ב-[Render.com](https://render.com).
2. חבר את חשבון ה-GitHub שלך והעלה את תיקיית הפרויקט למאגר (Repository) ב-GitHub.
3. ב-Render לחץ על **New +** -> **Web Service**.
4. בחר את המאגר של הפרויקט. Render יזהה אוטומטית את `render.yaml` או את הגדרות ברירת המחדל:
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. לחץ **Deploy Web Service**.
6. בסיום תקבל כתובת מאובטחת חינמית (למשל: `https://my-iptv.onrender.com`). פתח כתובת זו בטלפון הנייד שלך!

---

### אפשרות 2: פריסה ב-Vercel (חינם ומהיר)
1. התקן את Vercel CLI (`npm i -g vercel`) או חבר את המאגר ב-[Vercel.com](https://vercel.com).
2. הפרויקט כולל כבר קובץ הגדרות [vercel.json](file:///C:/Users/User/iptv-app/vercel.json) ופונקציית שרת [api/proxy.js](file:///C:/Users/User/iptv-app/api/proxy.js).
3. הרץ `vercel` או בצע Import למאגר ב-Vercel Dashboard.
4. האתר ייפרס מיידית עם CDN עולמי וכתובת HTTPS.

---

### אפשרות 3: Docker / Railway / Fly.io / VPS
הפרויקט כולל [Dockerfile](file:///C:/Users/User/iptv-app/Dockerfile) מוכן. ניתן להריץ:
```bash
docker build -t iptv-app .
docker run -p 3000:3000 iptv-app
```

---

## 📲 התקנה בסמארטפון כאפליקציה (PWA)
1. פתח את כתובת האתר בדפדפן הסמארטפון (Safari באייפון, Chrome באנדרואיד).
2. **באייפון (Safari)**: לחץ על כפתור השיתוף (ריבוע עם חץ למעלה) ובחר **"הוסף למסך הבית" (Add to Home Screen)**.
3. **באנדרואיד (Chrome)**: לחץ על שלוש הנקודות ובחר **"הוסף למסך הבית"** או **"התקן אפליקציה"**.
4. האפליקציה תיפתח במסך מלא בדיוק כמו אפליקציה מקורית (Native App).

---

## ⚙️ הגדרת שרת ה-IPTV
1. בפתיחה הראשונה לחץ על כפתור **הגדרות (⚙️)**.
2. הזן את כתובת שרת ה-IPTV (למשל `http://tv.example.com`), שם משתמש וסיסמה.
3. **שרת פרוקסי**:
   - אם האתר והפרוקסי מאוחסנים באותה כתובת (כגון Render או Vercel), השאר את שדה הפרוקסי **ריק** (הוא ישתמש אוטומטית ב-`/proxy`).
   - אם אחסנת את ה-Frontend בנפרד (לדוגמה ב-GitHub Pages), תוכל להזין בשדה זה את כתובת הפרוקסי שלך ב-Render.


---

## 🔒 אבטחה והגנה בסיסמה (`APP_PASSWORD`)

ניתן להגן על השרת, ממשק המשתמש ונתיבי הפרוקסי באמצעות משתנה סביבה בשם `APP_PASSWORD`:
- **הפעלה מקומית / VPS**:
  ```bash
  # Windows PowerShell:
  $env:APP_PASSWORD="your-strong-password"; node server.js

  # Linux / macOS:
  APP_PASSWORD="your-strong-password" node server.js
  ```
- **ב-Render / Vercel / Railway / Docker**:
  הוסף משתנה סביבה (Environment Variable) בשם `APP_PASSWORD` עם הסיסמה הרצויה.

כאשר משתנה זה מוגדר:
1. כניסה לאתר תציג מסך התחברות מעוצב הדורש הזנת הסיסמה.
2. נתיב ה-`/proxy` מוגן לחלוטין וידרוש אימות (Cookie, כותרת `X-App-Password`, או פרמטר `?auth=`).
3. בהגדרות האפליקציה (⚙️) ניתן לשמור את סיסמת ה-`APP_PASSWORD` או להתנתק באמצעות כפתור ההתנתקות (🔒).
