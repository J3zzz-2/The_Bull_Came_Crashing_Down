// settings.js: Settings menu and customization: effects, accessibility, wallpaper, sound, and data backup.

// Support links
const SUPPORT_LINKS = {
    kofi: "https://ko-fi.com/meniir/",
    trakteer: "https://trakteer.id/meniir_suss",
    twitter: "https://x.com/MeniirIII"
};

// Default values of the extended settings
window.extraSettings = {
    autoAdvanceTurn: true,
    defaultTallySpeed: 1,
    sfxEnabled: true,
    desktopBg: 'teal',
    leftMode: false,
    leftWidth: 70
};

// SETTINGS > EFFECTS
function fxSwitchHTML(id, label, desc, on, action, extraHTML) {
    return `<div class="settings-row">
        <div class="fx-row">
            <button type="button" role="switch" aria-checked="${on}" id="fx-sw-${id}" class="fx-switch ${on ? 'is-on' : ''}" onclick="${action}"><span class="fx-knob"></span></button>
            <label for="fx-sw-${id}" class="fx-text"><b>${label}</b><span class="settings-hint">${desc}</span></label>
        </div>
        ${extraHTML || ''}
    </div>`;
}

// Build the Effects settings card
function renderEffectsCard() {
    const allOn = EFFECTS.every(e => isEffectOn(e.id));
    let rows = fxSwitchHTML('all', 'All Effects', 'Switch every effect on or off together. You can still change each one below.', allOn, `setAllEffects(${!allOn})`);
    EFFECTS.forEach(e => {
        const on = isEffectOn(e.id);
        const slider = (e.id === 'crt' && on) ? `
            <div class="settings-sunken-well" style="margin-top: 8px;">
                <span>Scanline Intensity:</span>
                <input type="range" id="crt-slider" min="5" max="100" value="${crtIntensity}" oninput="updateCRTIntensity()">
                <span id="crt-display">${crtIntensity}%</span>
            </div>` : '';
        rows += fxSwitchHTML(e.id, e.label, e.desc, on, `setEffect('${e.id}', ${!on})`, slider);
    });
    return `<div class="settings-card fx-card">
        <div class="settings-card-header">Effects</div>
        <div class="settings-card-body">${rows}
        </div>
    </div>`;
}

// ACCESSIBILITY: LEFT-SIDE TOUCH MODE
window.applyAccessibility = function() {
    const root = document.documentElement;
    const s = window.extraSettings || {};
    if (s.leftMode) {
        const w = Math.min(95, Math.max(40, parseInt(s.leftWidth, 10) || 70));
        root.setAttribute('data-left', '1');
        root.style.setProperty('--left-pct', w);
    } else {
        root.removeAttribute('data-left');
        root.style.removeProperty('--left-pct');
    }
};

// Turn left-side touch mode on or off
window.setLeftMode = function(on) {
    window.extraSettings.leftMode = Boolean(on);
    applyAccessibility();
    saveExtendedSettings();
    showSettingsMenu(true);
};

// Set how much screen width left-side mode may use
window.setLeftWidth = function(pct) {
    window.extraSettings.leftWidth = pct;
    applyAccessibility();
    saveExtendedSettings();
    showSettingsMenu(true);
};

// Sound effects: news.js checks isSfxEnabled() before playing, so no wrapping is needed
window.isSfxEnabled = function() {
    return !window.extraSettings || window.extraSettings.sfxEnabled !== false;
};

// SAVE & LOAD EXTENDED SETTINGS
function saveExtendedSettings() {
    saveUserSettings();
}

// Load saved extended settings, migrating the old storage key
function loadExtendedSettings() {
    // One-time migration from the old separate key
    try {
        const legacy = localStorage.getItem('habibie_extra_settings');
        if (legacy) {
            const current = JSON.parse(localStorage.getItem('habibie_settings') || '{}');
            if (!current.extra) {
                window.extraSettings = Object.assign({}, window.extraSettings, JSON.parse(legacy));
            }
            localStorage.removeItem('habibie_extra_settings');
            saveUserSettings();
        }
    } catch (e) { console.warn('Settings migration failed:', e); }

    paintDesktopBackground(window.extraSettings.desktopBg);
    window.tallySpeed = window.extraSettings.defaultTallySpeed || 1;
    applyAccessibility();
}

// DESKTOP BACKGROUND & CUSTOM UPLOAD APPLIERS
function paintDesktopBackground(bgKey) {
    const b = document.body;
    if (!b) return;

    b.style.backgroundImage = 'none';
    if (bgKey === 'teal') {
        b.style.backgroundColor = '#008080';
    } else if (bgKey === 'slate') {
        b.style.backgroundColor = '#2F4F4F';
    } else if (bgKey === 'navy') {
        b.style.backgroundColor = '#001B3A';
    } else if (bgKey === 'crimson') {
        b.style.backgroundColor = '#4A1212';
    } else if (bgKey === 'cherry') {
        b.style.backgroundColor = '#E48FAE';
    } else if (bgKey === 'piecrust') {
        b.style.backgroundColor = '#B07A3A';
    } else if (bgKey === 'custom') {
        b.style.backgroundColor = '#008080';
        try {
            const savedBg = localStorage.getItem('habibie_custom_bg');
            if (savedBg) {
                b.style.backgroundImage = `url('${savedBg}')`;
            } else {
                window.extraSettings.desktopBg = 'teal';
            }
        } catch (e) { console.warn(e); }
    }
}

// Choose a desktop wallpaper and save it
window.applyDesktopBackground = function(bgKey) {
    window.extraSettings.desktopBg = bgKey;
    paintDesktopBackground(bgKey);
    saveExtendedSettings();
};

// Store an uploaded wallpaper image and apply it
function storeAndApplyWallpaper(dataUrl) {
    try {
        localStorage.setItem('habibie_custom_bg', dataUrl);
    } catch (err) {
        console.warn('Wallpaper not persisted:', err);
        showCustomAlert("Image file is too large to save permanently in browser storage, but it has been applied for this session.", null);
    }
    window.extraSettings.desktopBg = 'custom';
    if (document.body) {
        document.body.style.backgroundImage = `url('${dataUrl}')`;
    }
    saveExtendedSettings();
    showSettingsMenu(true);
}

// Read an uploaded image file as a custom wallpaper
window.uploadCustomWallpaper = function(inputElem) {
    if (!inputElem || !inputElem.files || !inputElem.files[0]) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const rawUrl = e.target.result;
        const img = new Image();
        img.onload = function() {
            let dataUrl = rawUrl;
            try {
                const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(img.width * scale));
                canvas.height = Math.max(1, Math.round(img.height * scale));
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#008080';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const small = canvas.toDataURL('image/jpeg', 0.8);
                if (small.length < rawUrl.length) dataUrl = small;
            } catch (err) {}
            storeAndApplyWallpaper(dataUrl);
        };
        img.onerror = function() { storeAndApplyWallpaper(rawUrl); };
        img.src = rawUrl;
    };
    reader.readAsDataURL(inputElem.files[0]);
};

// Delete the custom wallpaper and fall back to the default
window.clearCustomWallpaper = function() {
    try {
        localStorage.removeItem('habibie_custom_bg');
    } catch (e) { console.warn(e); }
    applyDesktopBackground('teal');
    showSettingsMenu(true);
};

// SETTINGS CONTROLS HANDLERS
window.toggleAutoAdvanceSetting = function(cb) {
    window.extraSettings.autoAdvanceTurn = cb.checked;
    saveExtendedSettings();
};

// Enable or disable sound effects
window.toggleSfxSetting = function(cb) {
    window.extraSettings.sfxEnabled = cb.checked;
    saveExtendedSettings();
};

// Set the default vote tally speed
window.setDefaultTallySpeedSetting = function(spd) {
    window.extraSettings.defaultTallySpeed = spd;
    window.tallySpeed = spd;
    saveExtendedSettings();
    showSettingsMenu(true);
};

// DATA BACKUP & RESET
window.exportAchievementsBackup = function() {
    try {
        const data = JSON.stringify(unlockedAchievements || []);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'twilight_banyan_achievements.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) { console.warn(e); }
};

// Import unlocked achievements from a backup file
window.importAchievementsBackup = function(inputElem) {
    if (!inputElem || !inputElem.files || !inputElem.files[0]) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        let ids = null;
        try {
            const arr = JSON.parse(e.target.result);
            if (Array.isArray(arr)) ids = Array.from(new Set(arr.filter(x => typeof x === 'string')));
        } catch (err) {}

        if (!ids) {
            showCustomAlert("Invalid backup file format.", () => showSettingsMenu(true));
            return;
        }
        // Merge with current progress and keep only IDs the game knows about
        const known = new Set((typeof ACHIEVEMENTS !== 'undefined' ? ACHIEVEMENTS : []).map(a => a.id));
        if (known.size > 0) ids = ids.filter(id => known.has(id));
        const before = unlockedAchievements.length;
        unlockedAchievements = Array.from(new Set([...unlockedAchievements, ...ids]));
        try {
            localStorage.setItem('habibie_achievements', JSON.stringify(unlockedAchievements));
        } catch (err) { console.warn(err); }
        const added = unlockedAchievements.length - before;
        showCustomAlert(`Achievements backup merged. ${added} new achievement(s) restored.`, () => showSettingsMenu(true));
    };
    reader.readAsText(inputElem.files[0]);
};

// Confirm, then reset all unlocked achievements
window.resetAllAchievementsPrompt = function() {
    if (confirm("Are you sure you want to permanently reset all unlocked Achievements?")) {
        unlockedAchievements = [];
        localStorage.removeItem('habibie_achievements');
        showSettingsMenu(true);
    }
};

// INLINE LOGOS (KO-FI, TRAKTEER, X/TWITTER)
const SETTINGS_ICONS = {
    kofi: `<svg width="15" height="15" viewBox="0 0 24 24" style="vertical-align: -2px; margin-right: 6px;"><path fill="#FFFFFF" d="M20 3H4v10c0 2.21 1.79 4 4 4h6c2.21 0 4-1.79 4-4v-3h2c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 5h-2V5h2v3z"/><path fill="#FF5E5B" d="M11 13.5l-3.3-3.1c-.9-.9-.9-2.3 0-3.2.8-.8 2.2-.8 3 0l.3.3.3-.3c.8-.8 2.2-.8 3 0 .9.9.9 2.3 0 3.2L11 13.5z"/></svg>`,
    trakteer: `<svg width="15" height="15" viewBox="0 0 24 24" style="vertical-align: -2px; margin-right: 6px;"><path fill="#FFFFFF" d="M12 2L14.8 8.5L22 9.3L16.5 14L18.2 21L12 17.3L5.8 21L7.5 14L2 9.3L9.2 8.5L12 2Z"/></svg>`,
    twitter: `<svg width="14" height="14" viewBox="0 0 24 24" style="vertical-align: -2px; margin-right: 6px;"><path fill="#FFFFFF" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
};

// SETTINGS > COLOR SCHEME DROPDOWN
(function injectSchemePickerStyles() {
    if (document.getElementById('scheme-picker-css')) return;
    const st = document.createElement('style');
    st.id = 'scheme-picker-css';
    st.textContent = `
.cs-wrap { position: relative; }
button.cs-trigger {
    --py: 3px; --px: 6px; --nudge: 0px;
    display: flex; align-items: center;
    width: 100%; min-height: 24px; margin: 0;
    background-color: var(--win95-window);
    background-image: none;
    box-shadow: var(--bevel-sunken);
    border-radius: 0;
    color: var(--win95-text);
    filter: none;
}
button.cs-trigger:hover:not(:disabled),
button.cs-trigger:active:not(:disabled) { filter: none; box-shadow: var(--bevel-sunken); }
button.cs-trigger:disabled { color: var(--win95-text-dim); text-shadow: none; cursor: not-allowed; }
button.cs-trigger:focus-visible { outline: 1px dotted var(--win95-text); outline-offset: -4px; }
.cs-arrow {
    margin-left: auto; flex: 0 0 auto;
    width: 16px; height: 16px; line-height: 16px;
    text-align: center; font-size: 8px;
    background-color: var(--win95-bg);
    box-shadow: var(--bevel-raised);
    color: var(--win95-text);
}
.cs-list {
    display: none;
    position: absolute; left: 0; right: 0; top: 100%;
    margin-top: 2px; padding: 2px;
    max-height: 280px; overflow-y: auto;
    z-index: 60;
    background-color: var(--win95-window);
    box-shadow: var(--bevel-sunken), 3px 3px 0 rgba(0, 0, 0, 0.35);
}
.cs-wrap.open .cs-list { display: block; }
.cs-group {
    font-size: 11px; font-weight: bold;
    color: var(--win95-text-dim);
    padding: 4px 6px 2px 6px;
}
.cs-item {
    display: flex; align-items: center;
    padding: 3px 6px; font-size: 12px;
    color: var(--win95-text);
    cursor: pointer;
}
.cs-item.is-current { font-weight: bold; }
.cs-item:hover, .cs-item:focus {
    background-color: var(--win95-navy);
    color: #FFFFFF;
    outline: none;
}`;
    document.head.appendChild(st);
})();

function renderSchemePicker(disabled) {
    const cur = COLOR_SCHEMES[colorScheme] || { label: colorScheme, swatch: '#C0C0C0' };
    const groups = [['Light', 'light'], ['Dark', 'dark']].map(([title, grp]) => {
        const items = Object.keys(COLOR_SCHEMES).filter(id => COLOR_SCHEMES[id].group === grp).map(id =>
            `<div class="cs-item ${colorScheme === id ? 'is-current' : ''}" role="option" tabindex="-1" aria-selected="${colorScheme === id}" data-scheme="${id}" onclick="pickColorScheme('${id}')"><span class="settings-color-dot" style="background-color: ${COLOR_SCHEMES[id].swatch};"></span>${COLOR_SCHEMES[id].label}</div>`
        ).join('');
        return `<div class="cs-group">${title}</div>${items}`;
    }).join('');
    return `<div class="cs-wrap" id="cs-wrap">
        <button type="button" class="cs-trigger" id="cs-trigger" aria-haspopup="listbox" aria-expanded="false" ${disabled ? 'disabled' : ''} onclick="toggleSchemeDropdown(event)">
            <span class="settings-color-dot" id="cs-dot" style="background-color: ${cur.swatch};"></span><span id="cs-label">${cur.label}</span><span class="cs-arrow">&#9660;</span>
        </button>
        <div class="cs-list" role="listbox" id="cs-list">${groups}</div>
    </div>`;
}

window.closeSchemeDropdown = function() {
    const w = document.getElementById('cs-wrap');
    if (!w) return;
    w.classList.remove('open');
    const t = document.getElementById('cs-trigger');
    if (t) t.setAttribute('aria-expanded', 'false');
};

window.toggleSchemeDropdown = function(evt) {
    if (evt) evt.stopPropagation();
    const w = document.getElementById('cs-wrap');
    if (!w) return;
    const open = !w.classList.contains('open');
    w.classList.toggle('open', open);
    const t = document.getElementById('cs-trigger');
    if (t) t.setAttribute('aria-expanded', String(open));
    if (open) {
        const cur = w.querySelector('.cs-item.is-current') || w.querySelector('.cs-item');
        if (cur) { cur.focus(); cur.scrollIntoView({ block: 'nearest' }); }
    }
};

window.pickColorScheme = function(id) {
    closeSchemeDropdown();
    if (typeof setColorScheme === 'function') setColorScheme(id);
    // The menu may or may not be re-rendered by setColorScheme
    const s = COLOR_SCHEMES[id];
    const dot = document.getElementById('cs-dot');
    const label = document.getElementById('cs-label');
    if (s && dot && label) {
        dot.style.backgroundColor = s.swatch;
        label.textContent = s.label;
        document.querySelectorAll('#cs-list .cs-item').forEach(el => {
            const on = el.getAttribute('data-scheme') === id;
            el.classList.toggle('is-current', on);
            el.setAttribute('aria-selected', String(on));
        });
    }
};

// Close on outside click / Escape; arrow keys, Enter and Space work inside the list
document.addEventListener('click', function(e) {
    const w = document.getElementById('cs-wrap');
    if (w && w.classList.contains('open') && !w.contains(e.target)) closeSchemeDropdown();
});
document.addEventListener('keydown', function(e) {
    const w = document.getElementById('cs-wrap');
    if (!w || !w.classList.contains('open')) return;
    if (e.key === 'Escape') {
        closeSchemeDropdown();
        const t = document.getElementById('cs-trigger');
        if (t) t.focus();
        return;
    }
    const items = Array.from(w.querySelectorAll('.cs-item'));
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); (items[i + 1] || items[0]).focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); (items[i - 1] || items[items.length - 1]).focus(); }
    else if ((e.key === 'Enter' || e.key === ' ') && i >= 0) { e.preventDefault(); pickColorScheme(items[i].getAttribute('data-scheme')); }
});

// RENDER SETTINGS MENU
window.showSettingsMenu = function(keepScroll) {
    if (!enterMenuView()) return;
    if (keepScroll !== true && typeof scrollMainPanelToTop === 'function') scrollMainPanelToTop();

    let html = '<h2>SETTINGS</h2>';
    html += '<div class="settings-panel-wrap">';

    // 0. ACCESSIBILITY (first, so it is the easiest thing to reach)
    const leftOn = Boolean(window.extraSettings.leftMode);
    const leftW = parseInt(window.extraSettings.leftWidth, 10) || 70;
    html += `<div class="settings-card">
        <div class="settings-card-header">Accessibility</div>
        <div class="settings-card-body">
            <div class="settings-row" ${leftOn ? '' : 'style="border-bottom: none; padding-bottom: 0; margin-bottom: 0;"'}>
                <button class="${leftOn ? 'is-selected' : ''}" style="width: 100%; max-width: 100%; text-align: left; min-height: 44px; margin: 0 0 6px 0; font-weight: bold;" onclick="setLeftMode(${!leftOn})">Left-Side Touch Mode: ${leftOn ? 'ON' : 'OFF'}</button>
                <div class="settings-hint">For phones and tablets. Squeezes the whole game, including pop-ups, the loading window and notifications, into the left part of the screen, so every button can be reached when the rest of the screen cannot be used. Tap the button above to switch it on or off. It has no effect with a mouse on a wide window.</div>
            </div>
            ${leftOn ? `<div class="settings-row" style="border-bottom: none; padding-bottom: 0; margin-bottom: 0;">
                <div style="margin-bottom: 6px;">Usable width of the screen:</div>
                ${[50, 60, 70, 80, 90].map(w => `<button class="settings-pill-btn ${leftW === w ? 'is-selected' : ''}" style="min-height: 40px;" onclick="setLeftWidth(${w})">${w}%</button>`).join('')}
                <div class="settings-hint">The shaded strip on the right is the part the game no longer uses. Pick the largest width that still sits inside the area your screen responds to.</div>
            </div>` : ''}
        </div>
    </div>`;

    // 1. GAMEPLAY & SIMULATION
    const toggleChecked = showOptionEffects ? 'checked' : '';
    const diffDisabled = selectedDifficulty === 'historical' ? 'disabled' : '';
    const autoAdvChecked = window.extraSettings.autoAdvanceTurn ? 'checked' : '';

    html += `<div class="settings-card">
        <div class="settings-card-header">Gameplay</div>
        <div class="settings-card-body">
            <div class="settings-row">
                <label style="cursor: pointer;">
                    <input type="checkbox" id="settings-effects-toggle" ${toggleChecked} ${diffDisabled} onchange="toggleSettingsEffects()">
                    Enable Outcome Forecast Tooltips
                </label>
                ${selectedDifficulty === 'historical' ? '<div class="settings-hint">(Locked: Forecast tooltips are disabled on Historical difficulty)</div>' : '<div class="settings-hint">Displays stat impact previews beneath crisis and faction choices.</div>'}
            </div>
            <div class="settings-row">
                <label style="cursor: pointer;">
                    <input type="checkbox" ${autoAdvChecked} onchange="toggleAutoAdvanceSetting(this)">
                    Auto-Advance Turn when both Action Phase slots are spent
                </label>
                <div class="settings-hint">Automatically proceeds to the next crisis once an Executive Action and Faction Engagement are completed.</div>
            </div>
            <div class="settings-row" style="border-bottom: none; padding-bottom: 0; margin-bottom: 0;">
                <span style="margin-right: 8px;">Default MPR Roll-Call Speed:</span>`;

    [1, 2, 5, 10].forEach(spd => {
        const isSel = (window.extraSettings.defaultTallySpeed === spd);
        html += `<button class="settings-pill-btn ${isSel ? 'is-selected' : ''}" onclick="setDefaultTallySpeedSetting(${spd})">${spd}x</button>`;
    });

    html += `</div></div></div>`;

    // 2. DISPLAY, THEME & AUDIO (2-Column Grid on Desktop)
    html += `<div class="settings-two-col">`;

    // Left Column: Display & Desktop Wallpaper
    html += `<div class="settings-card" style="margin-bottom: 0;">
        <div class="settings-card-header">Display</div>
        <div class="settings-card-body">
            <div class="settings-row">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                    <span>Text &amp; UI Scale:</span>
                    <span>
                        <input type="range" id="text-scale-slider" min="80" max="150" value="${textScale}" oninput="updateTextScale()">
                        <span id="text-scale-display" style="display: inline-block; width: 38px; text-align: right;">${textScale}%</span>
                    </span>
                </div>
            </div>
            <div class="settings-row">
                <div style="margin-bottom: 6px;">Desktop Wallpaper Color:</div>
                <div style="display: flex; flex-wrap: wrap; gap: 6px;">`;

    const bgs = [
        { id: 'teal',    label: 'Win95 Teal',    hex: '#008080' },
        { id: 'slate',   label: 'Slate Gray',    hex: '#2F4F4F' },
        { id: 'navy',    label: 'Midnight Navy', hex: '#001B3A' },
        { id: 'crimson', label: 'Crimson',       hex: '#4A1212' },
        { id: 'cherry',  label: 'Cherry Pink',   hex: '#E48FAE' },
        { id: 'piecrust', label: 'Pie Crust',    hex: '#B07A3A' }
    ];
    bgs.forEach(bg => {
        const isCur = (window.extraSettings.desktopBg === bg.id);
        html += `<button class="settings-swatch-btn ${isCur ? 'is-selected' : ''}" onclick="applyDesktopBackground('${bg.id}'); showSettingsMenu(true);">
            <span class="settings-color-dot" style="background-color: ${bg.hex};"></span>${bg.label}
        </button>`;
    });

    html += `   </div>
                <div style="margin-top: 8px;">
                    <button class="settings-inline-btn" onclick="document.getElementById('custom-bg-upload').click()">Custom</button>
                    <input type="file" id="custom-bg-upload" accept="image/*" style="display: none;" onchange="uploadCustomWallpaper(this)">
                    ${window.extraSettings.desktopBg === 'custom' ? `<button class="settings-inline-btn" style="background-color: #ffcccc;" onclick="clearCustomWallpaper()">Clear Custom</button>` : ''}
                </div>
            </div>
            <div class="settings-row">
                <div style="margin-bottom: 5px;">Window Style:</div>
                ${Object.keys(WINDOW_STYLES).map(id => `<button class="settings-inline-btn ${windowStyle === id ? 'is-selected' : ''}" onclick="setWindowStyle('${id}')">${WINDOW_STYLES[id].label}</button>`).join('')}
            </div>
            <div class="settings-row" style="border-bottom: none; padding-bottom: 0; margin-bottom: 0;">
                <div style="margin-bottom: 6px;">Color Scheme:</div>
                ${renderSchemePicker(windowStyle === 'macos8')}
                ${windowStyle === 'macos8' ? `<div class="settings-hint" style="margin-left: 0; margin-top: 6px;">Mac OS 8 keeps its own Platinum gray. Schemes apply to the Windows styles.</div>` : ''}
            </div>
        </div>
    </div>`;

    html += renderEffectsCard();

    // Right Column: Audio & Data Management
    const musicChecked = musicEnabled ? 'checked' : '';
    const sfxChecked = window.extraSettings.sfxEnabled !== false ? 'checked' : '';
    const audioElem = document.getElementById('bg-music');
    const currentVolume = audioElem ? Math.round(audioElem.volume * 100) : 30;
    const volumeDisabled = musicEnabled ? '' : 'disabled';

    html += `<div class="settings-card" style="margin-bottom: 0;">
        <div class="settings-card-header">Audio &amp; Save Data</div>
        <div class="settings-card-body">
            <div class="settings-row">
                <label style="cursor: pointer; display: block; margin-bottom: 6px;">
                    <input type="checkbox" id="settings-music-toggle" ${musicChecked} onchange="toggleMusicEnabled()">
                    Enable Background Music Player
                </label>
                <label style="cursor: pointer; display: block; margin-bottom: 8px;">
                    <input type="checkbox" id="settings-sfx-toggle" ${sfxChecked} onchange="toggleSfxSetting(this)">
                    Enable Sound Effects (Alerts &amp; Chimes)
                </label>
                <div style="${musicEnabled ? '' : 'color: #888;'}">
                    <span>Music Volume:</span>
                    <input type="range" id="volume-slider" min="0" max="100" value="${currentVolume}" oninput="updateVolume()" ${volumeDisabled}>
                    <span id="volume-display">${currentVolume}%</span>
                </div>
            </div>
            <div class="settings-row" style="border-bottom: none; padding-bottom: 0; margin-bottom: 0;">
                <div style="margin-bottom: 6px;">Data:</div>
                <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px;">
                    <button class="settings-inline-btn" onclick="exportAchievementsBackup()">Export Achievements</button>
                    <button class="settings-inline-btn" onclick="document.getElementById('import-achv-input').click()">Import Achievements</button>
                    <input type="file" id="import-achv-input" accept=".json" style="display: none;" onchange="importAchievementsBackup(this)">
                </div>
                <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                    <button class="settings-inline-btn" style="background-color: #ffd6d6;" onclick="if(confirm('Delete your saved campaign? This cannot be undone.')){ clearCampaignSave(); showCustomAlert('Saved campaign cleared.', () => showSettingsMenu(true)); }">Clear Saved Campaign</button>
                    <button class="settings-inline-btn" style="background-color: #ff9999;" onclick="resetAllAchievementsPrompt()">Reset All Achievements</button>
                </div>
            </div>
        </div>
    </div>`;

    html += `</div>`;

    // 3. COMMUNITY & SUPPORT
    html += `<div class="settings-card">
        <div class="settings-card-header">Support</div>
        <div class="settings-card-body">
            <div style="margin-bottom: 12px;">
                <div class="settings-brand-btn-row">
                    <button class="brand-btn brand-btn-kofi" onclick="window.open('${SUPPORT_LINKS.kofi}', '_blank')">
                        ${SETTINGS_ICONS.kofi}Buy me a coffee
                    </button>
                    <button class="brand-btn brand-btn-trakteer" onclick="window.open('${SUPPORT_LINKS.trakteer}', '_blank')">
                        ${SETTINGS_ICONS.trakteer}Support on Trakteer
                    </button>
                    <button class="brand-btn brand-btn-twitter" onclick="window.open('${SUPPORT_LINKS.twitter}', '_blank')">
                        ${SETTINGS_ICONS.twitter}X / Twitter
                    </button>
                </div>
            </div>
        </div>
    </div>`;

    html += '</div>';

    html += `<center><button style="width: 250px; margin-top: 6px; background-color: #ff9999; text-align: center;" onclick="returnToPreviousView()">Back</button></center>`;

    document.getElementById('main-panel').innerHTML = html;
};

// Apply saved settings immediately at load, since the DOM already exists (scripts sit at the end of body)
loadUserSettings();
loadExtendedSettings();
if (textScale !== 100) applyTextScale(textScale);