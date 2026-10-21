// news.js: newspapers, mini-browser and telex popups, plus the sound effects engine.

// Popup state: pending callback, whether the popup is news, and queued alerts
let alertCallback = null;
let currentAlertIsNews = false;
const alertQueue = [];

// True while a popup alert is visible
function isAlertOpen() {
    const overlay = document.getElementById('custom-alert-overlay');
    return Boolean(overlay && overlay.style.display === 'flex');
}

// MOBILE DETECTION HELPER
function isMobileDevice() {
    return window.innerWidth <= 820 ||
        (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
}

// AMBIENT WEB AUDIO ENGINE (Prevents ducking Spotify/music on mobile)
const SFX_PATHS = {
    click: 'audio/sfx/click.wav',
    notification: 'audio/sfx/notification.mp3',
    news: 'audio/sfx/news.mp3',
    achievement: 'audio/sfx/notif2.wav',
    blocked: 'audio/sfx/blocked.wav'
};

// Web Audio context, decoded buffers and fallback audio elements for sound effects
let sfxAudioCtx = null;
const sfxBuffers = {};
const sfxFallbackElements = {};

// Tell mobile browsers (iOS 17+ / mobile webviews) to mix audio without ducking Spotify
if (typeof navigator !== 'undefined' && navigator.audioSession) {
    try {
        navigator.audioSession.type = 'ambient';
    } catch (e) {}
}

// Create the shared audio context on first use
function getOrCreateAudioContext() {
    if (!sfxAudioCtx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
            sfxAudioCtx = new AudioCtx();
        }
    }
    if (sfxAudioCtx && sfxAudioCtx.state === 'suspended') {
        sfxAudioCtx.resume().catch(() => {});
    }
    return sfxAudioCtx;
}

// Fetch and decode all sound effect files
async function preloadSfxBuffers() {
    const ctx = getOrCreateAudioContext();
    for (const [key, path] of Object.entries(SFX_PATHS)) {
        try {
            const res = await fetch(path);
            if (!res.ok) continue;
            const arrayBuf = await res.arrayBuffer();
            if (ctx) {
                sfxBuffers[key] = await new Promise((resolve, reject) => {
                    ctx.decodeAudioData(arrayBuf, resolve, reject);
                });
            }
        } catch (e) {
            // Fallback for local file:// testing on desktop where fetch() may be blocked
            if (!isMobileDevice()) {
                sfxFallbackElements[key] = new Audio(path);
            }
        }
    }
}

// Preload sound effects on page load
window.addEventListener('load', preloadSfxBuffers);

// Play a sound effect by key through Web Audio, with an audio element fallback
function playSfxByKey(key, volumeMultiplier = 1.3) {
    try {
        if (typeof window.isSfxEnabled === 'function' && !window.isSfxEnabled()) return;

        const bgAudio = document.getElementById('bg-music');
        const baseVol = (bgAudio && typeof bgAudio.volume === 'number') ? bgAudio.volume : 0.4;
        const vol = Math.min(1.0, baseVol * volumeMultiplier);
        if (vol <= 0) return;

        // Keep ambient session active on mobile so external music never ducks
        if (typeof navigator !== 'undefined' && navigator.audioSession) {
            try { navigator.audioSession.type = 'ambient'; } catch (e) {}
        }

        const ctx = getOrCreateAudioContext();
        if (ctx && sfxBuffers[key]) {
            const source = ctx.createBufferSource();
            const gainNode = ctx.createGain();
            source.buffer = sfxBuffers[key];
            gainNode.gain.value = vol;
            source.connect(gainNode);
            gainNode.connect(ctx.destination);
            source.start(0);
            return;
        }

        // Desktop-only fallback if Web Audio buffer isn't decoded yet
        if (!isMobileDevice()) {
            if (!sfxFallbackElements[key] && SFX_PATHS[key]) {
                sfxFallbackElements[key] = new Audio(SFX_PATHS[key]);
            }
            const el = sfxFallbackElements[key];
            if (el) {
                el.volume = vol;
                el.currentTime = 0;
                el.play().catch(() => {});
            }
        }
    } catch (e) {
        console.warn(e);
    }
}

// Play the popup notification sound
window.playPopupChime = function() {
    playSfxByKey('notification', 1.3);
};

// Play the achievement sound
window.playAchievementSfx = function() {
    playSfxByKey('achievement', 1.35);
};

// Play the sound for continuing past a news popup
window.playNewsContinueSfx = function() {
    playSfxByKey('news', 1.3);
};

// Play the blocked-action sound
window.playBlockedSfx = function() {
    playSfxByKey('blocked', 1.35);
};

// Play the click sound
window.playClickSfx = function() {
    // Do not play click sound on mobile devices
    if (isMobileDevice()) return;
    playSfxByKey('click', 1.0);
};

// Global click listener: plays blocked.wav on disabled/banned items, or click.wav on desktop
document.addEventListener('click', function(e) {
    if (e.target && e.target.closest) {
        const blockedEl = e.target.closest('button:disabled, .action-image-disabled, .portrait-banned, .mpr-legend-banned');
        if (blockedEl) {
            window.playBlockedSfx();
            return;
        }
    }
    window.playClickSfx();
}, true);

// Helper to detect if a popup message is an insufficient-PC or blocked-action alert
function isBlockedAlertMessage(msg) {
    if (typeof msg !== 'string') return false;
    return /Insufficient Political Capital|Start the game first|Resolve the current crisis|Invalid backup|Please write a brief message/i.test(msg);
}

// 1999 INDONESIAN & FOREIGN PRESS PROFILES
const NEWSPAPER_PROFILES = [
    {
        match: ['TEMPO'],
        isBrowser: false,
        windowTitle: "MAJALAH BERITA MINGGUAN TEMPO",
        paperClass: "paper-tempo",
        headlineClass: "",
        mastheadHTML: `<div class="masthead-tempo">
            <div class="masthead-tempo-box">TEMPO</div>
            <div class="masthead-tempo-motto">MAJALAH BERITA MINGGUAN &bull; ENAK DIBACA DAN PERLU</div>
        </div>`,
        leftMeta: "LAPORAN UTAMA // NASIONAL",
        rightMeta: "HARGA RP 9.800,-",
        datelinePrefix: "JAKARTA, TEMPO — ",
        editionFooter: "ISSN 0126-4273 &bull; EDISI KHUSUS REFORMASI 1999"
    },
    {
        match: ['KOMPAS'],
        isBrowser: false,
        windowTitle: "HARIAN PAGI KOMPAS",
        paperClass: "paper-broadsheet",
        headlineClass: "",
        mastheadHTML: `<div class="masthead-kompas">
            <div class="masthead-kompas-ears">
                <span>TERBIT 24 HALAMAN</span>
                <span>AMANAT HATI NURANI RAKYAT</span>
                <span>EDISI NASIONAL</span>
            </div>
            <div class="masthead-kompas-title">KOMPAS</div>
        </div>`,
        leftMeta: "TAHUN XXXV &bull; HALAMAN 1",
        rightMeta: "ECERAN RP 1.500,-",
        datelinePrefix: "JAKARTA, KOMPAS — ",
        editionFooter: "PT KOMPAS MEDIA NUSANTARA &bull; PALMERAH SELATAN, JAKARTA"
    },
    {
        match: ['RAKYAT MERDEKA'],
        isBrowser: false,
        windowTitle: "HARIAN POLITIK RAKYAT MERDEKA",
        paperClass: "paper-tabloid",
        headlineClass: "headline-screaming",
        mastheadHTML: `<div class="masthead-rakyat-merdeka">
            <div class="masthead-rm-title">RAKYAT MERDEKA</div>
        </div>`,
        leftMeta: "KORAN POLITIK PALING BERANI",
        rightMeta: "ECERAN RP 1.000,-",
        datelinePrefix: "JAKARTA, RM — ",
        editionFooter: "EDISI PAGI &bull; SUARA TANPA SENSOR DARI SENAYAN"
    },
    {
        match: ['POS KOTA'],
        isBrowser: false,
        windowTitle: "HARIAN IBUKOTA POS KOTA",
        paperClass: "paper-tabloid",
        headlineClass: "headline-screaming",
        mastheadHTML: `<div class="masthead-pos-kota">
            <div class="masthead-pk-title">POS KOTA</div>
        </div>`,
        leftMeta: "HARIAN IBUKOTA &bull; SUARA ASPIRASI RAKYAT",
        rightMeta: "ECERAN RP 1.000,-",
        datelinePrefix: "JAKARTA, POS KOTA — ",
        editionFooter: "JALAN GAJAH MADA NO. 98–100 &bull; JAKARTA BARAT"
    },
    {
        match: ['REPUBLIKA'],
        isBrowser: false,
        windowTitle: "HARIAN UMUM REPUBLIKA",
        paperClass: "paper-broadsheet",
        headlineClass: "",
        mastheadHTML: `<div class="masthead-republika">
            <div class="masthead-republika-title">REPUBLIKA</div>
            <div class="masthead-republika-motto">KORAN MASYARAKAT BARU</div>
        </div>`,
        leftMeta: "EDISI NASIONAL &bull; HALAMAN UTAMA",
        rightMeta: "HARGA RP 1.500,-",
        datelinePrefix: "JAKARTA, REPUBLIKA — ",
        editionFooter: "PT ABDI BANGSA &bull; WARUNG BUNCIT RAYA, JAKARTA"
    },
    {
        match: ['JAKARTA POST'],
        isBrowser: false,
        windowTitle: "THE JAKARTA POST",
        paperClass: "paper-broadsheet",
        headlineClass: "",
        mastheadHTML: `<div class="masthead-jakarta-post">
            <div class="masthead-jp-title">The Jakarta Post</div>
            <div class="masthead-jp-motto">The Journal of Indonesia Today</div>
        </div>`,
        leftMeta: "VOL. 17 &bull; FRONT PAGE",
        rightMeta: "PRICE RP 2,500",
        datelinePrefix: "JAKARTA (JP): ",
        editionFooter: "PUBLISHED BY PT BINA MEDIA TENGGARA &bull; JAKARTA"
    },
    {
        match: ['MEDIA INDONESIA'],
        isBrowser: false,
        windowTitle: "HARIAN UMUM MEDIA INDONESIA",
        paperClass: "paper-broadsheet",
        headlineClass: "",
        mastheadHTML: `<div class="masthead-media-indonesia">
            <div class="masthead-mi-title">MEDIA INDONESIA</div>
        </div>`,
        leftMeta: "PEMBAWA SUARA RAKYAT",
        rightMeta: "HARGA RP 1.500,-",
        datelinePrefix: "JAKARTA, MI — ",
        editionFooter: "KEDOYA, JAKARTA BARAT &bull; EDISI PAGI"
    },
    {
        match: ['SUARA PEMBARUAN'],
        isBrowser: false,
        windowTitle: "HARIAN SORE SUARA PEMBARUAN",
        paperClass: "paper-broadsheet",
        headlineClass: "",
        mastheadHTML: `<div class="masthead-suara-pembaruan">
            <div class="masthead-sp-title">SUARA PEMBARUAN</div>
        </div>`,
        leftMeta: "HARIAN SORE &bull; EDISI JAKARTA",
        rightMeta: "HARGA RP 1.400,-",
        datelinePrefix: "JAKARTA, SP — ",
        editionFooter: "CAWANG, JAKARTA TIMUR &bull; KORAN SORE UTAMA"
    },
    {
        match: ['DETIK'],
        isBrowser: true,
        windowTitle: "detikcom: berita cepat & akurat - Microsoft Internet Explorer",
        datelinePrefix: "detikcom - Jakarta, "
    },
    {
        match: ['SUARA KARYA'],
        isBrowser: false,
        windowTitle: "HARIAN SUARA KARYA",
        paperClass: "paper-broadsheet",
        headlineClass: "",
        mastheadHTML: `<div class="masthead-suara-karya">
            <div class="masthead-sk-title">SUARA KARYA</div>
        </div>`,
        leftMeta: "SUARA GOLONGAN KARYA",
        rightMeta: "EDISI PAGI",
        datelinePrefix: "SLIPI, SUARA KARYA — ",
        editionFooter: "KANTOR PUSAT DPP GOLKAR / SLIPI &bull; JAKARTA"
    }
];

// Pick the newspaper profile that matches a source name
window.getNewspaperProfile = function(rawSource) {
    const s = (rawSource || '').toUpperCase();

    for (let i = 0; i < NEWSPAPER_PROFILES.length; i++) {
        const p = NEWSPAPER_PROFILES[i];
        if (p.match.some(keyword => s.includes(keyword))) {
            return p;
        }
    }

    if (s.includes('FORUM') || s.includes('GAMMA') || s.includes('PANJI')) {
        const magTitle = s.includes('GAMMA')
            ? 'MAJALAH GAMMA'
            : (s.includes('PANJI') ? 'PANJI MASYARAKAT' : 'FORUM KEADILAN');
        return {
            isBrowser: false,
            windowTitle: magTitle,
            paperClass: "paper-tempo",
            headlineClass: "",
            mastheadHTML: `<div class="masthead-forum">
                <div class="masthead-forum-title">${magTitle}</div>
            </div>`,
            leftMeta: "INVESTIGASI KHUSUS &bull; POLITIK &amp; HUKUM",
            rightMeta: "EDISI 1999",
            datelinePrefix: `JAKARTA, ${magTitle} — `,
            editionFooter: `LAPORAN UTAMA ${magTitle} &bull; JAKARTA 1999`
        };
    }

    if (s.includes('BISNIS INDONESIA') || s.includes('KONTAN') || s.includes('FINANCIAL TIMES') || s.includes('WALL STREET') || s.includes('BLOOMBERG')) {
        return {
            isBrowser: false,
            windowTitle: s,
            paperClass: "paper-financial",
            headlineClass: "",
            mastheadHTML: `<div class="masthead-financial">
                <div class="masthead-fin-title">${s}</div>
            </div>`,
            leftMeta: "BURSA &amp; MONETER // KURS RUPIAH",
            rightMeta: "FINANCIAL DESK",
            datelinePrefix: `JAKARTA (${s}) — `,
            editionFooter: "MARKET &amp; SOVEREIGN DEBT DESK &bull; 1999"
        };
    }

    if (s.includes('WASPADA') || s.includes('SERAMBI')) {
        const acehPaper = s.includes('SERAMBI') ? 'SERAMBI INDONESIA' : 'HARIAN WASPADA';
        return {
            isBrowser: false,
            windowTitle: acehPaper,
            paperClass: "paper-broadsheet",
            headlineClass: "",
            mastheadHTML: `<div class="masthead-waspada">
                <div class="masthead-waspada-title">${acehPaper}</div>
            </div>`,
            leftMeta: "DEMI KEBENARAN DAN KEADILAN",
            rightMeta: "EDISI SUMATERA",
            datelinePrefix: `BANDA ACEH / MEDAN — `,
            editionFooter: `${acehPaper} &bull; BIRO SUMATERA UTARA &amp; ACEH`
        };
    }

    return {
        isBrowser: false,
        windowTitle: s || "PRESS DISPATCH",
        paperClass: "paper-broadsheet",
        headlineClass: "",
        mastheadHTML: `<div class="masthead-foreign">
            <div class="masthead-foreign-title">${s || "PRESS DISPATCH"}</div>
        </div>`,
        leftMeta: "SPECIAL DISPATCH &bull; INDONESIA DESK",
        rightMeta: "1999 EDITION",
        datelinePrefix: "JAKARTA — ",
        editionFooter: "INTERNATIONAL WIRE SERVICE &bull; SOUTHEAST ASIA BUREAU"
    };
};

// Render standalone 1999 detikcom Mini Web Browser (No corner X)
function buildDetikBrowserHTML(profile, curDate, headline, bodyText) {
    return `<div class="detik-browser-window">
        <div class="detik-browser-titlebar">
            <span>&#127760; ${profile.windowTitle}</span>
        </div>

        <div class="detik-browser-menubar">
            <span><u>F</u>ile</span>
            <span><u>E</u>dit</span>
            <span><u>V</u>iew</span>
            <span><u>G</u>o</span>
            <span><u>F</u>avorites</span>
            <span><u>H</u>elp</span>
        </div>

        <div class="detik-browser-toolbar">
            <span class="detik-tool-btn">&#9664; Back</span>
            <span class="detik-tool-btn">&#9654; Forward</span>
            <span class="detik-tool-btn">&#10006; Stop</span>
            <span class="detik-tool-btn">&#8635; Refresh</span>
            <span class="detik-tool-btn">&#8962; Home</span>
        </div>

        <div class="detik-browser-addressbar">
            <span class="detik-addr-label">Address</span>
            <div class="detik-addr-input">http://www.detik.com/berita-utama/1999/nasional.shtml</div>
        </div>

        <div class="detik-browser-viewport">
            <div class="detik-portal-banner">
                <div class="detik-portal-logo"><font color="#CC0000">detik</font><font color="#003399">com</font></div>
                <div class="detik-portal-tagline">berita cepat &amp; akurat &bull; real-time online news</div>
            </div>

            <div class="detik-portal-grid">
                <div class="detik-portal-sidebar">
                    <div class="detik-nav-header">KANAL</div>
                    <div class="detik-nav-item active">&raquo; Berita Utama</div>
                    <div class="detik-nav-item">&raquo; Nasional</div>
                    <div class="detik-nav-item">&raquo; Sidang MPR</div>
                    <div class="detik-nav-item">&raquo; Ekonomi/Kurs</div>
                    <div class="detik-nav-item">&raquo; Kolom &amp; Opini</div>
                    <div class="detik-kurs-box">
                        <b>KURS RUPIAH</b><br>
                        USD 1 = Rp 6.850<br>
                        IHSG: 542.10
                    </div>
                </div>

                <div class="detik-portal-main">
                    <div class="detik-timestamp">${curDate} &bull; 14:22 WIB</div>
                    <div class="detik-article-headline">${headline}</div>
                    <div class="detik-article-body">
                        <b>${profile.datelinePrefix}</b>${bodyText}
                    </div>
                </div>
            </div>
        </div>

        <div class="detik-browser-footer">
            <div class="detik-status-well">&#10003; Done &mdash; Connected via TelkomNet@Instan (28.8 kbps)</div>
            <button type="button" class="detik-continue-btn" onclick="closeCustomAlert()">CONTINUE</button>
        </div>
    </div>`;
}

// Render standalone Vertical Physical Newspaper / Magazine Front Page (No corner X)
function buildVerticalNewspaperHTML(profile, curDate, headline, bodyText) {
    return `<div class="standalone-newspaper-sheet ${profile.paperClass}">
        <div class="newspaper-top-trim"></div>
        ${profile.mastheadHTML}

        <div class="newspaper-dateline">
            <span>${profile.leftMeta}</span>
            <span>${curDate.toUpperCase()}</span>
            <span>${profile.rightMeta}</span>
        </div>

        <div class="newspaper-headline ${profile.headlineClass}">&ldquo;${headline}&rdquo;</div>

        <div class="newspaper-subrule"></div>

        <div class="newspaper-body">
            <span class="newspaper-lead-city">${profile.datelinePrefix}</span>${bodyText}
        </div>

        <div class="newspaper-fold-crease"></div>

        <div class="newspaper-sheet-footer">
            <div class="newspaper-edition-meta">${profile.editionFooter || 'ARSIP KLIPING PERS ISTANA // JAKARTA 1999'}</div>
            <button type="button" class="newspaper-continue-btn" onclick="closeCustomAlert()">CONTINUE</button>
        </div>
    </div>`;
}

// Show a popup (telex, news or plain alert), queuing it if one is already open
window.showCustomAlert = function(msg, callback) {
    if (isAlertOpen()) {
        alertQueue.push({ msg, callback });
        return;
    }

    // Play blocked.wav if this alert is an insufficient PC / blocked warning, otherwise notification.mp3
    if (isBlockedAlertMessage(msg)) {
        window.playBlockedSfx();
    } else {
        window.playPopupChime();
    }

    const curDate = (typeof gameStarted !== 'undefined' && gameStarted && typeof currentTurn !== 'undefined' && typeof events !== 'undefined' && currentTurn <= events.length && events[currentTurn - 1])
        ? events[currentTurn - 1].date
        : "Jakarta, 1999";

    const alertBox = document.getElementById('custom-alert-box');
    const titleBar = document.getElementById('custom-alert-titlebar');
    const msgElem = document.getElementById('custom-alert-message');
    const defaultBtn = document.getElementById('custom-alert-btn');

    const newsMatch = (typeof msg === 'string')
        ? msg.match(/^([A-Z0-9\s.&'/\-]{2,45}):\s*['"](.+?)['"]\s*<br><br>([\s\S]+)$/i)
        : null;

    if (newsMatch) {
        currentAlertIsNews = true;
        const sourceName = newsMatch[1].trim();
        const headline = newsMatch[2].trim();
        const bodyText = newsMatch[3].trim();
        const profile = getNewspaperProfile(sourceName);

        if (alertBox) alertBox.className = profile.isBrowser ? 'alert-box-frameless mode-browser' : 'alert-box-frameless mode-newspaper';
        if (titleBar) titleBar.style.display = 'none';
        if (defaultBtn) defaultBtn.style.display = 'none';

        if (msgElem) {
            msgElem.className = 'frameless-message-container';
            msgElem.innerHTML = profile.isBrowser
                ? buildDetikBrowserHTML(profile, curDate, headline, bodyText)
                : buildVerticalNewspaperHTML(profile, curDate, headline, bodyText);
            msgElem.scrollTop = 0;
        }
    } else {
        currentAlertIsNews = false;
        if (alertBox) alertBox.className = '';
        if (titleBar) {
            titleBar.style.display = 'flex';
            titleBar.innerHTML = `<span>EXECUTIVE DISPATCH</span><button type="button" class="win95-close-btn" onclick="closeCustomAlert()" title="Close">&#10005;</button>`;
        }
        if (defaultBtn) defaultBtn.style.display = 'block';

        if (msgElem) {
            msgElem.className = '';
            msgElem.innerHTML = `<div class="telex-dispatch">
                <div class="telex-header">
                    <span>PRESIDENTIAL DISPATCH</span>
                    <span>${curDate.toUpperCase()}</span>
                </div>
                <div style="text-align: justify; line-height: 1.55;">${msg}</div>
            </div>`;
            msgElem.scrollTop = 0;
        }
    }

    document.getElementById('custom-alert-overlay').style.display = 'flex';
    alertCallback = callback;
};

// Close the popup, run its callback and show the next queued alert
window.closeCustomAlert = function() {
    if (currentAlertIsNews) {
        window.playNewsContinueSfx();
        currentAlertIsNews = false;
    }

    document.getElementById('custom-alert-overlay').style.display = 'none';
    if (alertCallback) {
        const cb = alertCallback;
        alertCallback = null;
        try {
            cb();
        } catch (err) {
            console.error('Alert callback failed:', err);
        }
    }
    if (alertQueue.length > 0 && !isAlertOpen()) {
        const next = alertQueue.shift();
        showCustomAlert(next.msg, next.callback);
    }
};

// Allow Enter / Space / Escape to close any popup
document.addEventListener('keydown', function(e) {
    const overlay = document.getElementById('custom-alert-overlay');
    if (overlay && overlay.style.display === 'flex' && !e.repeat) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
            e.preventDefault();
            closeCustomAlert();
        }
    }
});