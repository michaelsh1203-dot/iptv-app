/**
 * IPTV Web Player - Frontend Client JavaScript (app.js)
 * Fully dynamic IPTV provider management with automatic 511 error handling
 */

const DEFAULT_PROVIDER = {
    server: 'http://thy30188.wd.business-cloud-8.ru',
    user: 'd48e6682bdb8',
    pass: 'a6af461b63'
};

let currentTab = 'live';
let categories = [];
let streams = [];
let hls = null;
let currentView = 'countries';
let selectedCountryName = '';
let selectedProviderName = '';
let hiddenItems = JSON.parse(localStorage.getItem('iptv_hidden') || '[]');
let customOrder = JSON.parse(localStorage.getItem('iptv_order') || '{}');
let draggedItemKey = null;

let currentActiveChannelList = [];
let currentChannelIndex = -1;
let overlayTimeout = null;
let isPlayerCollapsed = false;

/**
 * Retrieve active IPTV credentials from localStorage
 */
function getIptvCredentials() {
    const server = (localStorage.getItem('iptv_server') || '').trim().replace(/\/+$/, '');
    const user = (localStorage.getItem('iptv_user') || '').trim();
    const pass = (localStorage.getItem('iptv_pass') || '').trim();
    const hasCredentials = Boolean(server && user && pass);
    return { server, user, pass, hasCredentials };
}

/**
 * Build dynamic API URL strictly from current credentials
 */
function buildApiUrl(action) {
    const { server, user, pass, hasCredentials } = getIptvCredentials();
    if (!hasCredentials) return null;
    return `${server}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}&action=${encodeURIComponent(action)}`;
}

/**
 * Build dynamic stream URL strictly from current credentials
 */
function buildStreamUrl(streamId, type = 'live', ext = 'mp4') {
    const { server, user, pass, hasCredentials } = getIptvCredentials();
    if (!hasCredentials) return null;
    if (type === 'live') {
        return `${server}/live/${encodeURIComponent(user)}/${encodeURIComponent(pass)}/${streamId}.m3u8`;
    } else if (type === 'movies') {
        return `${server}/movie/${encodeURIComponent(user)}/${encodeURIComponent(pass)}/${streamId}.${ext || 'mp4'}`;
    } else {
        return `${server}/series/${encodeURIComponent(user)}/${encodeURIComponent(pass)}/${streamId}.${ext || 'mp4'}`;
    }
}

/**
 * Handle HTTP 511 (Network Authentication Required)
 * Clears cached credentials, stops playback, and opens settings for re-authentication
 */
function handle511Error(details = '') {
    console.warn('HTTP 511 Network Authentication Required received. Clearing cached credentials.', details);

    // Clear cached credentials from localStorage
    localStorage.removeItem('iptv_server');
    localStorage.removeItem('iptv_user');
    localStorage.removeItem('iptv_pass');

    // Stop any active video playback
    if (hls) {
        try { hls.destroy(); } catch (e) {}
        hls = null;
    }
    const video = document.getElementById('video-player');
    if (video) {
        try {
            video.pause();
            video.removeAttribute('src');
            video.load();
        } catch (e) {}
    }

    // Reset data state
    categories = [];
    streams = [];
    document.getElementById('current-title').textContent = 'נדרש אימות ספק IPTV (511)';
    document.getElementById('current-mode').textContent = 'שגיאת אימות רשת';

    // Update UI with informative message
    document.getElementById('grid-container').innerHTML = `
        <div class="text-center text-amber-400 py-10 col-span-full">
            <div class="text-4xl mb-3">⚠️</div>
            <p class="font-bold mb-2 text-base">שגיאת אימות ספק (511 Network Authentication Required)</p>
            <p class="text-xs text-slate-400 mb-4 max-w-md mx-auto">
                הספק החיצוני דורש אימות או שפג תוקף החיבור הישן. הפרטים הישנים הוסרו מהזיכרון. אנא עדכן את פרטי הספק החדשים במסך ההגדרות.
            </p>
            <button onclick="openModal()" class="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 active:scale-95 text-white font-semibold text-xs rounded-xl transition shadow-lg">
                הגדר פרטים חדשים
            </button>
        </div>`;

    showStatus('שגיאה 511: נדרש אימות מול ספק ה-IPTV. הנתונים אופסו.');

    // Pre-populate modal with default provider credentials and open
    document.getElementById('cfg-server').value = DEFAULT_PROVIDER.server;
    document.getElementById('cfg-user').value = DEFAULT_PROVIDER.user;
    document.getElementById('cfg-pass').value = DEFAULT_PROVIDER.pass;
    openModal();
}

/**
 * Proxy URL construction helper
 */
function getProxyUrl(targetUrl) {
    if (!targetUrl) return '';
    let proxyBase = localStorage.getItem('iptv_proxy') || '/proxy';
    if (!proxyBase.trim()) proxyBase = '/proxy';
    const separator = proxyBase.includes('?') ? '&' : '?';
    let url = `${proxyBase}${separator}url=${encodeURIComponent(targetUrl)}`;
    const appPass = localStorage.getItem('iptv_app_pass');
    if (appPass) {
        url += `&auth=${encodeURIComponent(appPass)}`;
    }
    return url;
}

/**
 * Check backend password protection status
 */
async function checkAuthStatus() {
    try {
        const res = await fetch('/api/auth/status');
        if (res.ok) {
            const data = await res.json();
            if (data.protected && data.authenticated) {
                const logoutBtn = document.getElementById('btn-logout');
                if (logoutBtn) logoutBtn.classList.remove('hidden');
            }
        }
    } catch (e) {}
}

/**
 * Logout from backend APP_PASSWORD
 */
async function logoutApp() {
    if (confirm('האם ברצונך להתנתק מהמערכת?')) {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
        } catch (e) {}
        localStorage.removeItem('iptv_app_pass');
        window.location.reload();
    }
}

/**
 * Toast / Status overlay notification
 */
function showStatus(msg) {
    const el = document.getElementById('player-status');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('opacity-0');
    clearTimeout(window.statusTimer);
    window.statusTimer = setTimeout(() => el.classList.add('opacity-0'), 5000);
}

/**
 * Initialize application - strictly validates credentials before sending proxy requests
 */
async function initApp() {
    const { server, user, pass, hasCredentials } = getIptvCredentials();

    // Verification before loading: If any credential is missing, do not send requests
    if (!hasCredentials) {
        document.getElementById('grid-container').innerHTML = `
            <div class="text-center text-slate-400 py-12 col-span-full">
                <div class="text-4xl mb-3">📡</div>
                <p class="font-bold mb-2 text-base text-slate-200">פרטי ספק IPTV חסרים</p>
                <p class="text-xs text-slate-400 mb-4 max-w-sm mx-auto">יש להגדיר כתובת שרת, שם משתמש וסיסמה כדי להתחיל בצפייה.</p>
                <button onclick="openModal()" class="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 active:scale-95 text-white font-semibold text-xs rounded-xl transition shadow-lg">
                    פתח הגדרות
                </button>
            </div>`;
        openModal();
        return;
    }

    document.getElementById('grid-container').innerHTML = '<div class="text-center text-slate-400 py-10 col-span-full animate-pulse">טוען נתונים מהשרת...</div>';

    try {
        let catAction = currentTab === 'movies' ? 'get_vod_categories' : currentTab === 'series' ? 'get_series_categories' : 'get_live_categories';
        const catApiUrl = buildApiUrl(catAction);
        const catRes = await fetch(getProxyUrl(catApiUrl));

        if (catRes.status === 511) {
            handle511Error('Category request returned 511');
            return;
        }

        if (catRes.status === 401) {
            document.getElementById('grid-container').innerHTML = `
                <div class="text-center text-amber-400 py-10 col-span-full">
                    <p class="font-bold mb-2 text-base">🔒 נדרשת סיסמת גישה למערכת (401 Unauthorized)</p>
                    <p class="text-xs text-slate-400 mb-4">שרת הפרוקסי מוגן באמצעות APP_PASSWORD. הזן את הסיסמה בהגדרות או התחבר מחדש.</p>
                    <div class="flex justify-center gap-3">
                        <button onclick="openModal()" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs rounded-xl text-cyan-400">פתח הגדרות</button>
                        <button onclick="location.reload()" class="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-xs rounded-xl text-white font-semibold">התחבר מחדש</button>
                    </div>
                </div>`;
            return;
        }

        if (!catRes.ok) {
            throw new Error(`Category fetch failed: HTTP ${catRes.status}`);
        }

        categories = await catRes.json();

        let streamAction = currentTab === 'movies' ? 'get_vod_streams' : currentTab === 'series' ? 'get_series' : 'get_live_streams';
        const streamApiUrl = buildApiUrl(streamAction);
        const streamRes = await fetch(getProxyUrl(streamApiUrl));

        if (streamRes.status === 511) {
            handle511Error('Stream request returned 511');
            return;
        }

        if (!streamRes.ok) {
            throw new Error(`Stream fetch failed: HTTP ${streamRes.status}`);
        }

        streams = await streamRes.json();
        goHome();

    } catch (err) {
        console.error('Error fetching IPTV data:', err);
        document.getElementById('grid-container').innerHTML = `
            <div class="text-center text-red-400 py-10 col-span-full">
                <p class="font-bold mb-2">שגיאה בטעינת נתונים.</p>
                <p class="text-xs text-slate-400 mb-4">בדוק את כתובת השרת, פרטי המשתמש או כתובת הפרוקסי בהגדרות.</p>
                <button onclick="openModal()" class="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-xs rounded-xl text-cyan-400 transition">
                    פתח הגדרות
                </button>
            </div>`;
    }
}

/**
 * Switch tabs: Live TV, Movies, Series
 */
function switchTab(tab) {
    currentTab = tab;
    ['live', 'movies', 'series'].forEach(t => {
        const btn = document.getElementById(`tab-${t}`);
        if (!btn) return;
        if (t === tab) {
            btn.className = 'flex-1 sm:px-6 py-2 rounded-lg text-xs sm:text-sm font-bold text-cyan-400 bg-slate-800 transition active:scale-95';
        } else {
            btn.className = 'flex-1 sm:px-6 py-2 rounded-lg text-xs sm:text-sm font-medium text-slate-400 hover:text-white transition active:scale-95';
        }
    });
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';
    initApp();
}

/**
 * Parse category string (Country: Provider format)
 */
function parseCategoryName(name) {
    let parts = (name || '').split(/[:|–-]/);
    if (parts.length > 1) {
        let country = parts[0].trim().toUpperCase();
        let provider = parts.slice(1).join(' ').trim();
        return { country, provider };
    }
    return { country: 'אחר', provider: (name || '').trim() };
}

/**
 * Reset view to countries
 */
function goHome() {
    currentView = 'countries';
    selectedCountryName = '';
    selectedProviderName = '';
    const backBtn = document.getElementById('back-btn');
    if (backBtn) backBtn.classList.add('hidden');
    const breadcrumb = document.getElementById('breadcrumb');
    if (breadcrumb) breadcrumb.innerHTML = '<span class="cursor-pointer hover:text-cyan-400">ראשי</span>';
    renderCountriesView();
}

/**
 * Render Countries / Top-level tiles
 */
function renderCountriesView() {
    const container = document.getElementById('grid-container');
    if (!container) return;
    container.innerHTML = '';

    let countryMap = {};
    (categories || []).forEach(cat => {
        if (hiddenItems.includes(cat.category_id)) return;
        let parsed = parseCategoryName(cat.category_name);
        if (!countryMap[parsed.country]) {
            countryMap[parsed.country] = [];
        }
        countryMap[parsed.country].push(cat);
    });

    let countries = Object.keys(countryMap);
    const orderKey = `countries_${currentTab}`;
    if (customOrder[orderKey]) {
        countries.sort((a, b) => {
            let idxA = customOrder[orderKey].indexOf(a);
            let idxB = customOrder[orderKey].indexOf(b);
            if (idxA === -1) idxA = 999;
            if (idxB === -1) idxB = 999;
            return idxA - idxB;
        });
    }

    if (countries.length === 0) {
        container.innerHTML = '<div class="text-center text-slate-500 py-10 col-span-full">אין קטגוריות זמינות</div>';
        return;
    }

    const frag = document.createDocumentFragment();
    countries.forEach((country) => {
        let count = countryMap[country].reduce((acc, cat) => {
            return acc + streams.filter(s => String(s.category_id) === String(cat.category_id)).length;
        }, 0);

        const tile = document.createElement('div');
        tile.draggable = true;
        tile.dataset.key = country;
        tile.className = 'bg-slate-800/90 hover:bg-slate-800 active:scale-[0.98] border border-slate-700/60 hover:border-cyan-500 p-3 sm:p-4 rounded-xl sm:rounded-2xl cursor-grab transition flex flex-col justify-between shadow-lg group relative select-none';
        
        tile.innerHTML = `
            <div class="flex justify-between items-start mb-2 sm:mb-3">
                <span class="text-xl sm:text-2xl">🌍</span>
                <div class="flex items-center gap-1.5">
                    <span class="text-slate-500 text-xs cursor-move px-1 py-0.5 rounded hover:bg-slate-700 touch-drag-handle" title="גרור לסידור">⋮⋮</span>
                    <button onclick="event.stopPropagation(); hideItem('${country}', 'country')" class="text-slate-400 hover:text-red-400 text-xs px-2 py-1 rounded bg-slate-900/80 active:scale-90" title="הסתר">✕</button>
                </div>
            </div>
            <div>
                <h3 class="text-sm sm:text-base font-bold text-slate-100 group-hover:text-cyan-400 transition truncate">${country}</h3>
                <span class="text-[11px] sm:text-xs text-slate-400">${count} פריטים</span>
            </div>
        `;

        attachDnDEvents(tile, orderKey, () => renderCountriesView());
        tile.onclick = () => selectCountry(country, countryMap[country]);
        frag.appendChild(tile);
    });

    container.appendChild(frag);
}

function selectCountry(countryName, countryCats) {
    currentView = 'providers';
    selectedCountryName = countryName;
    document.getElementById('back-btn').classList.remove('hidden');
    document.getElementById('breadcrumb').innerHTML = `<span onclick="goHome()" class="cursor-pointer hover:text-cyan-400">ראשי</span> / <span class="text-cyan-400 truncate">${countryName}</span>`;
    renderProvidersView(countryCats);
}

function renderProvidersView(countryCats) {
    const container = document.getElementById('grid-container');
    if (!container) return;
    container.innerHTML = '';

    const orderKey = `providers_${selectedCountryName}_${currentTab}`;
    let catsToRender = [...countryCats];

    if (customOrder[orderKey]) {
        catsToRender.sort((a, b) => {
            let idxA = customOrder[orderKey].indexOf(String(a.category_id));
            let idxB = customOrder[orderKey].indexOf(String(b.category_id));
            if (idxA === -1) idxA = 999;
            if (idxB === -1) idxB = 999;
            return idxA - idxB;
        });
    }

    const frag = document.createDocumentFragment();
    catsToRender.forEach(cat => {
        if (hiddenItems.includes(cat.category_id)) return;
        let parsed = parseCategoryName(cat.category_name);
        let catStreams = streams.filter(s => String(s.category_id) === String(cat.category_id));

        const tile = document.createElement('div');
        tile.draggable = true;
        tile.dataset.key = String(cat.category_id);
        tile.className = 'bg-slate-800/90 hover:bg-slate-800 active:scale-[0.98] border border-slate-700/60 hover:border-cyan-500 p-3 sm:p-4 rounded-xl sm:rounded-2xl cursor-grab transition flex flex-col justify-between shadow-lg group relative select-none';
        
        tile.innerHTML = `
            <div class="flex justify-between items-start mb-2 sm:mb-3">
                <span class="text-xl sm:text-2xl">📡</span>
                <div class="flex items-center gap-1.5">
                    <span class="text-slate-500 text-xs cursor-move px-1 py-0.5 rounded hover:bg-slate-700 touch-drag-handle" title="גרור לסידור">⋮⋮</span>
                    <button onclick="event.stopPropagation(); hideItem('${cat.category_id}', 'category')" class="text-slate-400 hover:text-red-400 text-xs px-2 py-1 rounded bg-slate-900/80 active:scale-90" title="הסתר">✕</button>
                </div>
            </div>
            <div>
                <h3 class="text-sm sm:text-base font-bold text-slate-100 group-hover:text-cyan-400 transition truncate">${parsed.provider}</h3>
                <span class="text-[11px] sm:text-xs text-slate-400">${catStreams.length} ערוצים</span>
            </div>
        `;

        attachDnDEvents(tile, orderKey, () => renderProvidersView(countryCats));
        tile.onclick = () => selectProvider(cat.category_id, parsed.provider, catStreams);
        frag.appendChild(tile);
    });

    container.appendChild(frag);
}

function selectProvider(catId, providerName, catStreams) {
    currentView = 'channels';
    selectedProviderName = providerName;
    document.getElementById('breadcrumb').innerHTML = `<span onclick="goHome()" class="cursor-pointer hover:text-cyan-400">ראשי</span> / <span onclick="selectCountryByBreadcrumb()" class="cursor-pointer hover:text-cyan-400">${selectedCountryName}</span> / <span class="text-cyan-400 truncate">${providerName}</span>`;
    renderChannelsView(catStreams, catId);
}

function selectCountryByBreadcrumb() {
    let countryCats = categories.filter(cat => parseCategoryName(cat.category_name).country === selectedCountryName);
    selectCountry(selectedCountryName, countryCats);
}

function renderChannelsView(items, catId) {
    const container = document.getElementById('grid-container');
    if (!container) return;
    container.innerHTML = '';

    if (!Array.isArray(items) || items.length === 0) {
        container.innerHTML = '<div class="text-center text-slate-500 py-10 col-span-full">לא נמצאו ערוצים או שידורים</div>';
        return;
    }

    const orderKey = `channels_${catId}_${currentTab}`;
    let channelsToRender = [...items];

    if (customOrder[orderKey]) {
        channelsToRender.sort((a, b) => {
            let idA = String(a.stream_id || a.series_id);
            let idB = String(b.stream_id || b.series_id);
            let idxA = customOrder[orderKey].indexOf(idA);
            let idxB = customOrder[orderKey].indexOf(idB);
            if (idxA === -1) idxA = 999;
            if (idxB === -1) idxB = 999;
            return idxA - idxB;
        });
    }

    currentActiveChannelList = channelsToRender;

    const frag = document.createDocumentFragment();
    channelsToRender.forEach((item, index) => {
        const tile = document.createElement('div');
        const streamId = String(item.stream_id || item.series_id);
        tile.draggable = true;
        tile.dataset.key = streamId;
        tile.className = 'bg-slate-800/90 hover:bg-cyan-950/60 active:scale-[0.98] border border-slate-700/60 hover:border-cyan-500 p-2.5 sm:p-3 rounded-xl cursor-grab transition flex flex-col justify-between group select-none min-h-[75px] sm:min-h-[90px]';
        
        const title = item.name || item.title || 'ערוץ';

        tile.innerHTML = `
            <div class="flex items-center justify-between mb-1 sm:mb-2">
                <span class="text-[10px] bg-slate-900 text-slate-400 px-1.5 py-0.5 rounded group-hover:text-cyan-300">▶ נגן</span>
                <span class="text-slate-600 text-xs px-1 py-0.5 rounded touch-drag-handle">⋮⋮</span>
            </div>
            <div class="text-xs sm:text-sm font-medium text-slate-200 group-hover:text-cyan-300 transition line-clamp-2 leading-snug">${title}</div>
        `;

        attachDnDEvents(tile, orderKey, () => renderChannelsView(items, catId));
        tile.onclick = () => playStreamByIndex(index);
        frag.appendChild(tile);
    });

    container.appendChild(frag);
}

/**
 * Touch & Mouse Drag-and-Drop Handler
 */
function attachDnDEvents(element, orderKey, refreshCallback) {
    element.addEventListener('dragstart', (e) => {
        draggedItemKey = element.dataset.key;
        element.classList.add('tile-dragging');
        e.dataTransfer.effectAllowed = 'move';
    });

    element.addEventListener('dragend', () => {
        element.classList.remove('tile-dragging');
        document.querySelectorAll('#grid-container > div').forEach(el => el.classList.remove('tile-drag-over'));
    });

    element.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        element.classList.add('tile-drag-over');
    });

    element.addEventListener('dragleave', () => {
        element.classList.remove('tile-drag-over');
    });

    element.addEventListener('drop', (e) => {
        e.preventDefault();
        element.classList.remove('tile-drag-over');
        const targetKey = element.dataset.key;

        if (draggedItemKey && draggedItemKey !== targetKey) {
            reorderItems(orderKey, draggedItemKey, targetKey);
            refreshCallback();
        }
    });

    // Touch Drag Polyfill for Mobile Screens
    const handle = element.querySelector('.touch-drag-handle') || element;
    let touchTimer = null;
    let isTouchDragging = false;
    let currentHoverTarget = null;

    handle.addEventListener('touchstart', (e) => {
        touchTimer = setTimeout(() => {
            isTouchDragging = true;
            draggedItemKey = element.dataset.key;
            element.classList.add('tile-dragging');
            if (navigator.vibrate) navigator.vibrate(40);
        }, 200);
    }, { passive: true });

    handle.addEventListener('touchmove', (e) => {
        if (!isTouchDragging) {
            clearTimeout(touchTimer);
            return;
        }
        e.preventDefault();
        const touch = e.touches[0];
        const elemBelow = document.elementFromPoint(touch.clientX, touch.clientY);
        const tileBelow = elemBelow ? elemBelow.closest('#grid-container > div') : null;

        document.querySelectorAll('#grid-container > div').forEach(el => el.classList.remove('tile-drag-over'));
        if (tileBelow && tileBelow !== element) {
            currentHoverTarget = tileBelow;
            tileBelow.classList.add('tile-drag-over');
        } else {
            currentHoverTarget = null;
        }
    }, { passive: false });

    handle.addEventListener('touchend', () => {
        clearTimeout(touchTimer);
        if (isTouchDragging) {
            element.classList.remove('tile-dragging');
            document.querySelectorAll('#grid-container > div').forEach(el => el.classList.remove('tile-drag-over'));
            if (currentHoverTarget && currentHoverTarget.dataset.key) {
                const targetKey = currentHoverTarget.dataset.key;
                if (draggedItemKey && draggedItemKey !== targetKey) {
                    reorderItems(orderKey, draggedItemKey, targetKey);
                    refreshCallback();
                }
            }
            isTouchDragging = false;
            currentHoverTarget = null;
        }
    });
}

function reorderItems(orderKey, sourceKey, targetKey) {
    const container = document.getElementById('grid-container');
    const currentKeys = Array.from(container.children).map(child => child.dataset.key).filter(Boolean);

    const sourceIdx = currentKeys.indexOf(sourceKey);
    const targetIdx = currentKeys.indexOf(targetKey);

    if (sourceIdx !== -1 && targetIdx !== -1) {
        currentKeys.splice(sourceIdx, 1);
        currentKeys.splice(targetIdx, 0, sourceKey);
        customOrder[orderKey] = currentKeys;
        localStorage.setItem('iptv_order', JSON.stringify(customOrder));
    }
}

function hideItem(id) {
    if (!hiddenItems.includes(id)) {
        hiddenItems.push(id);
        localStorage.setItem('iptv_hidden', JSON.stringify(hiddenItems));
        updateHiddenCount();
        if (currentView === 'countries') renderCountriesView();
        else if (currentView === 'providers') {
            let countryCats = categories.filter(cat => parseCategoryName(cat.category_name).country === selectedCountryName);
            renderProvidersView(countryCats);
        }
    }
}

function unhideItem(id) {
    hiddenItems = hiddenItems.filter(item => item !== id);
    localStorage.setItem('iptv_hidden', JSON.stringify(hiddenItems));
    updateHiddenCount();
    renderHiddenList();
    if (currentView === 'countries') renderCountriesView();
}

function updateHiddenCount() {
    const el = document.getElementById('hidden-count');
    if (el) el.textContent = hiddenItems.length;
}

function renderHiddenList() {
    const listEl = document.getElementById('hidden-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    if (hiddenItems.length === 0) {
        listEl.innerHTML = '<div class="text-center text-slate-500 py-6">אין אריחים מוסתרים</div>';
        return;
    }

    hiddenItems.forEach(id => {
        let name = id;
        let foundCat = categories.find(c => String(c.category_id) === String(id));
        if (foundCat) name = foundCat.category_name;

        const row = document.createElement('div');
        row.className = 'flex justify-between items-center bg-slate-900 p-2.5 rounded-xl border border-slate-800';
        row.innerHTML = `<span class="text-xs text-slate-200 truncate max-w-[200px]">${name}</span>
                         <button onclick="unhideItem('${id}')" class="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 active:scale-95 text-white text-xs rounded-lg transition">החזר</button>`;
        listEl.appendChild(row);
    });
}

function filterContent() {
    const query = document.getElementById('search-input').value.trim().toLowerCase();
    if (!query) {
        if (currentView === 'countries') renderCountriesView();
        return;
    }

    const filteredStreams = streams.filter(s => (s.name || s.title || '').toLowerCase().includes(query));
    currentView = 'channels';
    document.getElementById('back-btn').classList.remove('hidden');
    document.getElementById('breadcrumb').innerHTML = `<span onclick="goHome()" class="cursor-pointer hover:text-cyan-400">ראשי</span> / <span class="text-cyan-400">חיפוש</span>`;
    renderChannelsView(filteredStreams, 'search');
}

function handlePlayerMouseMove() {
    const overlay = document.getElementById('player-overlay');
    if (!overlay) return;
    overlay.classList.remove('opacity-0');

    clearTimeout(overlayTimeout);
    overlayTimeout = setTimeout(() => {
        overlay.classList.add('opacity-0');
    }, 3000);
}

function togglePlayerPanel() {
    const container = document.getElementById('player-container');
    const btn = document.getElementById('toggle-player-btn');
    isPlayerCollapsed = !isPlayerCollapsed;

    if (isPlayerCollapsed) {
        container.classList.add('hidden');
        btn.textContent = '🔽';
    } else {
        container.classList.remove('hidden');
        btn.textContent = '🔼';
    }
}

function toggleCustomFullscreen(e) {
    if (e) e.stopPropagation();
    const container = document.getElementById('player-container');
    const video = document.getElementById('video-player');

    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (container.requestFullscreen) {
            container.requestFullscreen();
        } else if (container.webkitRequestFullscreen) {
            container.webkitRequestFullscreen();
        } else if (video && video.webkitEnterFullscreen) {
            video.webkitEnterFullscreen();
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        }
    }
}

function playStreamByIndex(index) {
    if (!currentActiveChannelList || index < 0 || index >= currentActiveChannelList.length) return;
    currentChannelIndex = index;
    const item = currentActiveChannelList[index];

    const title = item.name || item.title || 'ערוץ';
    const streamId = item.stream_id || item.series_id;
    const ext = item.container_extension || 'mp4';

    if (isPlayerCollapsed) togglePlayerPanel();
    playStream(streamId, title, ext);
}

function playNextChannel(event) {
    if (event) event.stopPropagation();
    if (currentActiveChannelList.length === 0) return;
    let nextIndex = (currentChannelIndex + 1) % currentActiveChannelList.length;
    playStreamByIndex(nextIndex);
    handlePlayerMouseMove();
}

function playPrevChannel(event) {
    if (event) event.stopPropagation();
    if (currentActiveChannelList.length === 0) return;
    let prevIndex = (currentChannelIndex - 1 + currentActiveChannelList.length) % currentActiveChannelList.length;
    playStreamByIndex(prevIndex);
    handlePlayerMouseMove();
}

function showAutoplayPrompt() {
    const prompt = document.getElementById('autoplay-prompt');
    if (!prompt) return;
    prompt.classList.remove('hidden');
    prompt.classList.add('flex');
}

function hideAutoplayPrompt() {
    const prompt = document.getElementById('autoplay-prompt');
    if (!prompt) return;
    prompt.classList.add('hidden');
    prompt.classList.remove('flex');
}

function resumeBlockedAutoplay() {
    hideAutoplayPrompt();
    const video = document.getElementById('video-player');
    if (video) video.play().catch(e => console.log('Playback error:', e));
}

function triggerVideoPlay(video) {
    const playPromise = video.play();
    if (playPromise !== undefined) {
        playPromise.then(() => {
            hideAutoplayPrompt();
            showStatus('מנגן בהצלחה!');
        }).catch(err => {
            console.warn('Autoplay blocked by mobile browser:', err);
            showAutoplayPrompt();
            showStatus('לחץ להפעלת השידור');
        });
    }
}

/**
 * Play selected stream - uses dynamic buildStreamUrl
 */
function playStream(streamId, title, ext) {
    const rawUrl = buildStreamUrl(streamId, currentTab, ext);
    if (!rawUrl) {
        showStatus('פרטי ספק חסרים');
        openModal();
        return;
    }

    document.getElementById('current-title').textContent = title;
    hideAutoplayPrompt();

    const video = document.getElementById('video-player');
    if (hls) {
        hls.destroy();
        hls = null;
    }

    const proxiedUrl = getProxyUrl(rawUrl);
    document.getElementById('current-mode').textContent = 'מנגן דרך פרוקסי';
    showStatus(`מתחבר ל-${title}...`);
    handlePlayerMouseMove();

    const isM3u8 = rawUrl.includes('.m3u8');

    if (isM3u8) {
        if (Hls.isSupported()) {
            hls = new Hls({
                enableWorker: true,
                lowLatencyMode: true,
                backBufferLength: 30
            });
            hls.loadSource(proxiedUrl);
            hls.attachMedia(video);

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                triggerVideoPlay(video);
            });

            hls.on(Hls.Events.ERROR, (event, data) => {
                // If upstream returned 511 during playback, clear cache and prompt
                if (data.response && data.response.code === 511) {
                    handle511Error('HLS error 511');
                    return;
                }

                if (data.fatal) {
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            showStatus('שגיאת תקשורת בטעינת השידור');
                            hls.startLoad();
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            showStatus('משחזר תקלת מדיה...');
                            hls.recoverMediaError();
                            break;
                        default:
                            showStatus('שגיאה בשידור');
                            hls.destroy();
                            break;
                    }
                }
            });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            // iOS Safari Native HLS Support
            video.src = proxiedUrl;
            video.addEventListener('loadedmetadata', () => {
                triggerVideoPlay(video);
            }, { once: true });
        } else {
            video.src = proxiedUrl;
            triggerVideoPlay(video);
        }
    } else {
        // Direct MP4 / VOD
        video.src = proxiedUrl;
        triggerVideoPlay(video);
    }
}

/**
 * Mobile Swipe Gesture on Player
 */
function setupPlayerTouchGestures() {
    const player = document.getElementById('player-container');
    if (!player) return;
    let startX = 0;
    let startY = 0;

    player.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        handlePlayerMouseMove();
    }, { passive: true });

    player.addEventListener('touchend', (e) => {
        const diffX = e.changedTouches[0].clientX - startX;
        const diffY = e.changedTouches[0].clientY - startY;

        if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY)) {
            if (diffX < 0) {
                playNextChannel();
            } else {
                playPrevChannel();
            }
        }
    }, { passive: true });
}

/**
 * Modal handlers
 */
function openModal() {
    const modal = document.getElementById('account-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeModal() {
    const modal = document.getElementById('account-modal');
    if (modal) modal.classList.add('hidden');
}

function openHiddenManager() {
    renderHiddenList();
    const modal = document.getElementById('hidden-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeHiddenManager() {
    const modal = document.getElementById('hidden-modal');
    if (modal) modal.classList.add('hidden');
}

/**
 * Save account settings and connect
 */
function saveAccount() {
    let server = document.getElementById('cfg-server').value.trim();
    if (server.endsWith('/')) server = server.slice(0, -1);

    let proxy = document.getElementById('cfg-proxy').value.trim();
    if (proxy.endsWith('/')) proxy = proxy.slice(0, -1);

    const user = document.getElementById('cfg-user').value.trim();
    const pass = document.getElementById('cfg-pass').value.trim();
    const appPass = document.getElementById('cfg-app-pass').value.trim();

    localStorage.setItem('iptv_server', server);
    localStorage.setItem('iptv_user', user);
    localStorage.setItem('iptv_pass', pass);
    localStorage.setItem('iptv_proxy', proxy);
    localStorage.setItem('iptv_app_pass', appPass);

    closeModal();
    initApp();
}

/**
 * Reset all stored data
 */
function resetAccountData() {
    if (confirm('האם אתה בטוח שברצונך לאפס את כל הנתונים השמורים?')) {
        localStorage.clear();
        location.reload();
    }
}

/**
 * DOM Ready entry point
 */
document.addEventListener('DOMContentLoaded', () => {
    const { server, user, pass, hasCredentials } = getIptvCredentials();
    const proxy = localStorage.getItem('iptv_proxy') || '';
    const appPass = localStorage.getItem('iptv_app_pass') || '';

    // Populate inputs with stored value OR default provider
    document.getElementById('cfg-server').value = server || DEFAULT_PROVIDER.server;
    document.getElementById('cfg-user').value = user || DEFAULT_PROVIDER.user;
    document.getElementById('cfg-pass').value = pass || DEFAULT_PROVIDER.pass;
    document.getElementById('cfg-proxy').value = proxy;
    document.getElementById('cfg-app-pass').value = appPass;

    checkAuthStatus();
    updateHiddenCount();
    setupPlayerTouchGestures();

    // Verification before loading: Only send requests if credentials exist in localStorage
    if (hasCredentials) {
        initApp();
    } else {
        document.getElementById('grid-container').innerHTML = `
            <div class="text-center text-slate-400 py-12 col-span-full">
                <div class="text-4xl mb-3">📡</div>
                <p class="font-bold mb-2 text-base text-slate-200">ברוכים הבאים ל-IPTV Player</p>
                <p class="text-xs text-slate-400 mb-4 max-w-sm mx-auto">אנא הזן את פרטי שרת ה-IPTV בהגדרות כדי להתחיל בצפייה.</p>
                <button onclick="openModal()" class="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 active:scale-95 text-white font-semibold text-xs rounded-xl transition shadow-lg">
                    פתח הגדרות התחברות
                </button>
            </div>`;
        openModal();
    }
});
