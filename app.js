/**
 * IPTV Web Player - Frontend Client JavaScript (app.js)
 * Fully dynamic IPTV provider management with advanced debugging and fallbacks
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

function getIptvCredentials() {
    let server = (localStorage.getItem('iptv_server') || DEFAULT_PROVIDER.server).trim().replace(/\/+$/, '');
    let user = (localStorage.getItem('iptv_user') || DEFAULT_PROVIDER.user).trim();
    let pass = (localStorage.getItem('iptv_pass') || DEFAULT_PROVIDER.pass).trim();
    return { server, user, pass, hasCredentials: Boolean(server && user && pass) };
}

function buildApiUrl(action) {
    const { server, user, pass, hasCredentials } = getIptvCredentials();
    if (!hasCredentials) return null;
    return `${server}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}&action=${encodeURIComponent(action)}`;
}

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

function getProxyUrl(targetUrl) {
    if (!targetUrl) return '';
    let proxyBase = '/proxy';
    return `${proxyBase}?url=${encodeURIComponent(targetUrl)}`;
}

function showStatus(msg) {
    const el = document.getElementById('player-status');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('opacity-0');
    clearTimeout(window.statusTimer);
    window.statusTimer = setTimeout(() => el.classList.add('opacity-0'), 5000);
}

async function initApp() {
    console.log("initApp started...");
    const { server, user, pass } = getIptvCredentials();
    
    if (!localStorage.getItem('iptv_server')) {
        localStorage.setItem('iptv_server', server);
        localStorage.setItem('iptv_user', user);
        localStorage.setItem('iptv_pass', pass);
    }

    const container = document.getElementById('grid-container');
    if (container) {
        container.innerHTML = '<div class="text-center text-slate-400 py-10 col-span-full animate-pulse">טוען נתונים מהשרת דרך הפרוקסי...</div>';
    }

    try {
        let catAction = currentTab === 'movies' ? 'get_vod_categories' : currentTab === 'series' ? 'get_series_categories' : 'get_live_categories';
        const catApiUrl = buildApiUrl(catAction);
        console.log("Fetching categories via proxy:", getProxyUrl(catApiUrl));
        
        const catRes = await fetch(getProxyUrl(catApiUrl));
        console.log("Categories response status:", catRes.status);
        
        let catData = [];
        if (catRes.ok) {
            try { catData = await catRes.json(); } catch(e) { console.warn("Failed to parse categories JSON"); }
        }
        console.log("Categories loaded data:", catData);

        if (!Array.isArray(catData) || catData.length === 0) {
            categories = [
                { category_id: '1', category_name: 'IL: General Channels' },
                { category_id: '2', category_name: 'IL: Sports & Movies' }
            ];
        } else {
            categories = catData;
        }

        let streamAction = currentTab === 'movies' ? 'get_vod_streams' : currentTab === 'series' ? 'get_series' : 'get_live_streams';
        const streamApiUrl = buildApiUrl(streamAction);
        console.log("Fetching streams via proxy:", getProxyUrl(streamApiUrl));

        const streamRes = await fetch(getProxyUrl(streamApiUrl));
        console.log("Streams response status:", streamRes.status);

        let streamData = [];
        if (streamRes.ok) {
            try { streamData = await streamRes.json(); } catch(e) { console.warn("Failed to parse streams JSON"); }
        }
        console.log("Streams loaded data length:", Array.isArray(streamData) ? streamData.length : 'Not an array');

        if (!Array.isArray(streamData) || streamData.length === 0) {
            streams = [
                { stream_id: '101', name: 'ערוץ בדיקה ראשון (Live)', category_id: '1' },
                { stream_id: '102', name: 'ערוץ בדיקה שני (Sports)', category_id: '2' }
            ];
        } else {
            streams = streamData;
        }

        goHome();
    } catch (err) {
        console.error('Error in initApp catch block:', err);
        categories = [{ category_id: '1', category_name: 'IL: General' }];
        streams = [{ stream_id: '101', name: 'ערוץ חירום ראשי', category_id: '1' }];
        goHome();
    }
}

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
    initApp();
}

function parseCategoryName(name) {
    let parts = (name || '').split(/[:|–-]/);
    if (parts.length > 1) {
        let country = parts[0].trim().toUpperCase();
        let provider = parts.slice(1).join(' ').trim();
        return { country, provider };
    }
    return { country: 'ישראל / כללי', provider: (name || '').trim() };
}

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
        tile.className = 'bg-slate-800/90 hover:bg-slate-800 active:scale-[0.98] border border-slate-700/60 hover:border-cyan-500 p-3 sm:p-4 rounded-xl sm:rounded-2xl cursor-pointer transition flex flex-col justify-between shadow-lg group relative select-none';
        
        tile.innerHTML = `
            <div class="flex justify-between items-start mb-2 sm:mb-3">
                <span class="text-xl sm:text-2xl">🌍</span>
            </div>
            <div>
                <h3 class="text-sm sm:text-base font-bold text-slate-100 group-hover:text-cyan-400 transition truncate">${country}</h3>
                <span class="text-[11px] sm:text-xs text-slate-400">${count || streams.length} ערוצים</span>
            </div>
        `;

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

    const frag = document.createDocumentFragment();
    countryCats.forEach(cat => {
        let parsed = parseCategoryName(cat.category_name);
        let catStreams = streams.filter(s => String(s.category_id) === String(cat.category_id));
        if (catStreams.length === 0) catStreams = streams;

        const tile = document.createElement('div');
        tile.className = 'bg-slate-800/90 hover:bg-slate-800 active:scale-[0.98] border border-slate-700/60 hover:border-cyan-500 p-3 sm:p-4 rounded-xl sm:rounded-2xl cursor-pointer transition flex flex-col justify-between shadow-lg group relative select-none';
        
        tile.innerHTML = `
            <div class="flex justify-between items-start mb-2 sm:mb-3">
                <span class="text-xl sm:text-2xl">📡</span>
            </div>
            <div>
                <h3 class="text-sm sm:text-base font-bold text-slate-100 group-hover:text-cyan-400 transition truncate">${parsed.provider}</h3>
                <span class="text-[11px] sm:text-xs text-slate-400">${catStreams.length} ערוצים</span>
            </div>
        `;

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
        items = streams;
    }

    currentActiveChannelList = items;

    const frag = document.createDocumentFragment();
    items.forEach((item, index) => {
        const tile = document.createElement('div');
        tile.className = 'bg-slate-800/90 hover:bg-cyan-950/60 active:scale-[0.98] border border-slate-700/60 hover:border-cyan-500 p-2.5 sm:p-3 rounded-xl cursor-pointer transition flex flex-col justify-between group select-none min-h-[75px] sm:min-h-[90px]';
        
        const title = item.name || item.title || 'ערוץ שידור';

        tile.innerHTML = `
            <div class="flex items-center justify-between mb-1 sm:mb-2">
                <span class="text-[10px] bg-slate-900 text-cyan-400 px-1.5 py-0.5 rounded">▶ נגן</span>
            </div>
            <div class="text-xs sm:text-sm font-medium text-slate-200 group-hover:text-cyan-300 transition line-clamp-2 leading-snug">${title}</div>
        `;

        tile.onclick = () => playStreamByIndex(index);
        frag.appendChild(tile);
    });

    container.appendChild(frag);
}

function playStreamByIndex(index) {
    if (!currentActiveChannelList || index < 0 || index >= currentActiveChannelList.length) return;
    currentChannelIndex = index;
    const item = currentActiveChannelList[index];

    const title = item.name || item.title || 'ערוץ';
    const streamId = item.stream_id || item.series_id || '101';
    const ext = item.container_extension || 'mp4';

    playStream(streamId, title, ext);
}

function playStream(streamId, title, ext) {
    const rawUrl = buildStreamUrl(streamId, currentTab, ext);
    if (!rawUrl) {
        showStatus('פרטי ספק חסרים');
        return;
    }

    const titleEl = document.getElementById('current-title');
    if (titleEl) titleEl.textContent = title;

    const video = document.getElementById('video-player');
    if (!video) return;

    if (hls) {
        hls.destroy();
        hls = null;
    }

    const proxiedUrl = getProxyUrl(rawUrl);
    const modeEl = document.getElementById('current-mode');
    if (modeEl) modeEl.textContent = 'מנגן דרך פרוקסי';
    showStatus(`מתחבר ל-${title}...`);

    const isM3u8 = rawUrl.includes('.m3u8') || currentTab === 'live';

    if (isM3u8 && typeof Hls !== 'undefined' && Hls.isSupported()) {
        hls = new Hls({ enableWorker: true, lowLatencyMode: true });
        hls.loadSource(proxiedUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            video.play().catch(e => console.log('Autoplay prevented:', e));
        });
        hls.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
                showStatus('שגיאת נגן, מנסה שוב...');
                hls.startLoad();
            }
        });
    } else {
        video.src = proxiedUrl;
        video.play().catch(e => console.log('Autoplay prevented:', e));
    }
}

function filterContent() {
    const query = document.getElementById('search-input').value.trim().toLowerCase();
    if (!query) {
        if (currentView === 'countries') renderCountriesView();
        return;
    }
    const filtered = streams.filter(s => (s.name || s.title || '').toLowerCase().includes(query));
    currentView = 'channels';
    document.getElementById('back-btn').classList.remove('hidden');
    document.getElementById('breadcrumb').innerHTML = `<span onclick="goHome()" class="cursor-pointer hover:text-cyan-400">ראשי</span> / <span class="text-cyan-400">תוצאות חיפוש</span>`;
    renderChannelsView(filtered, 'search');
}

// Auto-initialize app on load
window.addEventListener('DOMContentLoaded', () => {
    initApp();
});