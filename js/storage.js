// storage.js: localStorage saving and loading: campaign autosave, user settings and unlocked achievements.
// Load order: before achievements.js and game.js.

// localStorage keys
const SETTINGS_KEY = 'habibie_settings';
const ACHIEVEMENTS_KEY = 'habibie_achievements';
const CUSTOM_BG_KEY = 'habibie_custom_bg';

// AUTOMATIC MID-RUN CAMPAIGN SAVE & RESUME SYSTEM (localStorage)
const CAMPAIGN_SAVE_KEY = 'habibie_active_campaign_v1';
const CAMPAIGN_SLOTS_KEY = 'habibie_campaign_slots_v1';

// Save the current campaign to localStorage
// Save the current campaign to localStorage
window.saveCampaignState = function() {
    if (!gameStarted || currentTurn >= MAX_TURNS) return false;
    try {
        const curEv = events[currentTurn - 1];
        const oppState = window.OppositionEngine ? OppositionEngine.getState() : null;
        const payload = {
            timestamp: Date.now(),
            currentTurn,
            isActionPhase,
            globalMalus,
            selectedDifficulty,
            showOptionEffects,
            actionCooldowns,
            actionUsageCount,
            factionCooldowns: typeof factionCooldowns !== 'undefined' ? factionCooldowns : {},
            factionUsageCount: typeof factionUsageCount !== 'undefined' ? factionUsageCount : {},
            turnExecutiveUsed,
            turnFactionUsed,
            activeDecrees,
            bannedFactions,
            completedInteractions,
            minStats,
            maxCendana,
            minFactions,
            stats,
            factions,
            portraitFactions,
            wirantoLocked: window.wirantoLocked,
            wirantoStrain: window.wirantoStrain,
            lowestGovStability,
            bankBaliCleanSteps,
            timorPromiseSteps,
            sp3UpheldWithHighCendana,
            helpedRaisSpeaker,
            pcLog: window.pcLog || [],
            opposition: oppState,
            adversary: oppState, // Legacy key kept for backward compatibility
            lang: currentLang,
            curEventShuffledIndices: curEv ? curEv.shuffledIndices : null
        };
        localStorage.setItem(CAMPAIGN_SAVE_KEY, JSON.stringify(payload));
        return true;
    } catch (e) {
        console.warn('Could not save campaign:', e);
        return false;
    }
};

// Return the saved campaign if a valid one exists, otherwise null
window.hasSavedCampaign = function() {
    try {
        const raw = localStorage.getItem(CAMPAIGN_SAVE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (data && data.currentTurn && data.currentTurn < MAX_TURNS && data.stats && data.factions) {
            return data;
        }
    } catch (e) { console.warn(e); }
    return null;
};

// Delete the saved campaign
window.clearCampaignSave = function() {
    try {
        localStorage.removeItem(CAMPAIGN_SAVE_KEY);
    } catch (e) { console.warn(e); }
};

function readCampaignSlots() {
    try {
        const raw = localStorage.getItem(CAMPAIGN_SLOTS_KEY);
        const slots = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(slots)) throw new Error('Saved game list is not an array.');
        return slots.filter(slot =>
            slot && typeof slot.id === 'string' && /^[a-zA-Z0-9-]+$/.test(slot.id) && typeof slot.name === 'string' &&
            slot.data && slot.data.stats && slot.data.factions
        );
    } catch (e) {
        console.warn('Could not read saved game files:', e);
        return null;
    }
}

function escapeSaveHTML(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
}

function getSaveTurnLabel(data) {
    const event = events[data.currentTurn - 1];
    const date = event && event.date ? event.date : `Turn ${data.currentTurn}`;
    return `${date} · ${data.isActionPhase ? 'Action Phase' : 'Crisis Event'}`;
}

window.showSaveGames = function() {
    if (gameStarted && !enterMenuView()) return;
    scrollMainPanelToTop();
    const storedSlots = readCampaignSlots();
    const slots = storedSlots || [];
    const autosave = hasSavedCampaign();
    let html = '<h2>Saved Games</h2>';
    html += '<p>Save a campaign to a named file, or load or delete an existing file.</p>';
    if (!storedSlots) {
        html += '<p class="save-game-error">Saved game files could not be read from browser storage.</p>';
    }

    if (gameStarted) {
        html += `<form class="save-game-form" onsubmit="return createCampaignSlot(event)">
            <label for="save-game-name">Save current campaign as</label>
            <div class="save-game-controls">
                <input id="save-game-name" name="saveName" type="text" maxlength="40" required placeholder="Campaign name">
                <button type="submit">Save Game</button>
            </div>
        </form>`;
    }
    }

    html += '<div class="save-game-list">';
    if (autosave) {
        html += `<div class="save-game-item">
            <div><strong>Autosave</strong><div class="save-game-meta">Turn ${autosave.currentTurn} · ${escapeSaveHTML(getSaveTurnLabel(autosave))}</div></div>
            <button type="button" onclick="continueSavedCampaign()">Load</button>
        </div>`;
    }
    slots.forEach(slot => {
        const timestamp = new Date(slot.savedAt).toLocaleString();
        html += `<div class="save-game-item">
            <div><strong>${escapeSaveHTML(slot.name)}</strong><div class="save-game-meta">Turn ${slot.data.currentTurn} · ${escapeSaveHTML(getSaveTurnLabel(slot.data))} · Saved ${escapeSaveHTML(timestamp)}</div></div>
            <div class="save-game-actions">
                <button type="button" onclick="loadCampaignSlot('${escapeSaveHTML(slot.id)}')">Load</button>
                <button type="button" onclick="if(confirm('Delete this saved game?')) deleteCampaignSlot('${escapeSaveHTML(slot.id)}')">Delete</button>
            </div>
        </div>`;
    });
    if (!autosave && slots.length === 0) {
        html += '<p class="save-game-empty">No saved games yet. Start a campaign and save it here.</p>';
    }
    html += '</div>';
    html += '<center><button type="button" style="width: 250px; text-align: center; margin-top: 16px;" onclick="returnToPreviousView()">Back</button></center>';
    document.getElementById('main-panel').innerHTML = html;
};
    if (gameStarted) {
        html += '<center><button type="button" onclick="returnToTitleScreen()" style="width: 250px; text-align: center; margin-top: 16px; background-color: #ff9999;"><b>Return to title screen</b></button></center>';
}
window.createCampaignSlot = function(event) {
    event.preventDefault();
    const input = document.getElementById('save-game-name');
    const name = input ? input.value.trim() : '';
    if (!name) {
        showCustomAlert('Enter a name for this save file.');
        return false;
    }
    if (!saveCampaignState()) {
        showCustomAlert('This campaign cannot be saved right now.');
        return false;
    }

    const data = hasSavedCampaign();
    if (!data) {
        showCustomAlert('The campaign could not be saved. Please try again.');
        return false;
    }

    const slots = readCampaignSlots();
    if (!slots) {
        showCustomAlert('Saved game files could not be read from browser storage.');
        return false;
    }
    slots.unshift({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, savedAt: Date.now(), data });
    try {
        localStorage.setItem(CAMPAIGN_SLOTS_KEY, JSON.stringify(slots));
    } catch (e) {
        console.warn('Could not create saved game file:', e);
        showCustomAlert('Could not create the save file. Your browser storage may be full.');
        return false;
    }
    showSaveGames();
    return false;
};

window.loadCampaignSlot = function(id) {
    const slots = readCampaignSlots();
    if (!slots) {
        showCustomAlert('Saved game files could not be read from browser storage.');
        return;
    }
    const slot = slots.find(item => item.id === id);
    if (!slot) {
        showCustomAlert('That save file could not be found.');
        showSaveGames();
        return;
    }
    try {
        localStorage.setItem(CAMPAIGN_SAVE_KEY, JSON.stringify(slot.data));
    } catch (e) {
        console.warn('Could not load saved game file:', e);
        showCustomAlert('Could not load this save file. Your browser storage may be full.');
        return;
    }
    continueSavedCampaign();
};

window.deleteCampaignSlot = function(id) {
    const slots = readCampaignSlots();
    if (!slots) {
        showCustomAlert('Saved game files could not be read from browser storage.');
        return;
    }
    const remaining = slots.filter(slot => slot.id !== id);
    if (remaining.length === slots.length) {
        showCustomAlert('That save file could not be found.');
        showSaveGames();
        return;
    }
    try {
        localStorage.setItem(CAMPAIGN_SLOTS_KEY, JSON.stringify(remaining));
    } catch (e) {
        console.warn('Could not delete saved game file:', e);
        showCustomAlert('Could not delete the save file.');
        return;
    }
    showSaveGames();
};

// Restore the saved campaign into the game state and resume it
window.continueSavedCampaign = async function() {
    const data = hasSavedCampaign();
    if (!data) {
        showStartMenu();
        return;
    }

    clearTallyInterval();

    // The save holds text in the language it was played in; reload matching assets first
    if ((data.lang === 'en' || data.lang === 'id') && data.lang !== currentLang) {
        currentLang = data.lang;
        saveUserSettings();
        await loadLocalizedAssets();
    }

    currentTurn = data.currentTurn || 1;
    isActionPhase = Boolean(data.isActionPhase);
    globalMalus = Number(data.globalMalus) || 0;
    selectedDifficulty = data.selectedDifficulty || selectedDifficulty;
    if (typeof data.showOptionEffects === 'boolean') showOptionEffects = data.showOptionEffects;

    actionCooldowns = data.actionCooldowns || {};
    actionUsageCount = data.actionUsageCount || {};
    factionCooldowns = data.factionCooldowns || {};
    factionUsageCount = data.factionUsageCount || {};
    turnExecutiveUsed = Boolean(data.turnExecutiveUsed);
    turnFactionUsed = Boolean(data.turnFactionUsed);
    activeDecrees = data.activeDecrees || {};
    bannedFactions = data.bannedFactions || {};
    completedInteractions = data.completedInteractions || {};
    minStats = data.minStats || { pop: 0, mil: 0, ref: 0, econ: 0, intl: 0, stab: 0 };
    maxCendana = data.maxCendana !== undefined ? data.maxCendana : 100;
    minFactions = data.minFactions || {};
    stats = Object.assign({ PC: 20, pop: 30, mil: 35, ref: 40, econ: 20, intl: 30, stab: 25, cendana: 75 }, data.stats);
    factions = data.factions;
    portraitFactions = Array.isArray(data.portraitFactions) ? data.portraitFactions : [...INITIAL_PORTRAIT_FACTIONS];

    lowestGovStability = data.lowestGovStability !== undefined ? data.lowestGovStability : 100;
    bankBaliCleanSteps = data.bankBaliCleanSteps || {};
    timorPromiseSteps = data.timorPromiseSteps || {};
    sp3UpheldWithHighCendana = Boolean(data.sp3UpheldWithHighCendana);
    helpedRaisSpeaker = Boolean(data.helpedRaisSpeaker);
    window.pcLog = Array.isArray(data.pcLog) ? data.pcLog : [];

    // Restore opposition state (supports both new `opposition` key and legacy `adversary` + top-level Wiranto fields)
    const savedOpp = Object.assign({}, data.opposition || data.adversary || {});
    if (savedOpp.wirantoLocked === undefined && data.wirantoLocked !== undefined) {
        savedOpp.wirantoLocked = Boolean(data.wirantoLocked);
    }
    if (savedOpp.wirantoStrain === undefined && data.wirantoStrain !== undefined) {
        savedOpp.wirantoStrain = Number(data.wirantoStrain) || 0;
    }
    if (window.OppositionEngine) {
        OppositionEngine.restoreState(savedOpp);
    } else {
        window.wirantoLocked = savedOpp.wirantoLocked !== undefined ? Boolean(savedOpp.wirantoLocked) : true;
        window.wirantoStrain = Number(savedOpp.wirantoStrain) || 0;
    }

    window.resolvedEventTurn = 0;
    window.electionPanelSnapshot = null;

    if (data.curEventShuffledIndices && events[currentTurn - 1]) {
        events[currentTurn - 1].shuffledIndices = data.curEventShuffledIndices;
    }

    prevStatsSnapshot = null;
    lastRenderedPortraitSignature = "";
    gameStarted = true;
    startBackgroundMusic();
    syncSidebarVisibility();
    updateUI();

    if (isActionPhase) {
        showActionMenu();
    } else {
        renderEventMenu();
    }
};

// SETTINGS PERSISTENCE (single key; includes the extended settings from settings.js)
function saveUserSettings() {
    try {
        const audioElem = document.getElementById('bg-music');
        const payload = {
            selectedDifficulty,
            showOptionEffects,
            musicEnabled,
            volume: audioElem ? audioElem.volume : 0.3,
            volumeSet: Boolean(window.volumeUserSet),
            windowStyle,
            colorScheme,
            crtEnabled,
            crtIntensity,
            effects: effectsOn,
            textScale,
            currentLang,
            extra: getPersistableExtraSettings()
        };
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload));
    } catch (e) { console.warn('Could not save settings:', e); }
}

// Collect the extended settings to save, dropping a custom wallpaper that has no stored image
function getPersistableExtraSettings() {
    const extra = Object.assign({}, window.extraSettings || {});
    // Never persist "custom" wallpaper when the image itself could not be stored
    if (extra.desktopBg === 'custom') {
        let hasImage = false;
        try { hasImage = Boolean(localStorage.getItem(CUSTOM_BG_KEY)); } catch (e) { console.warn(e); }
        if (!hasImage) extra.desktopBg = 'teal';
    }
    return extra;
}

// Load saved settings and apply them
function loadUserSettings() {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (!raw) {
            currentLang = 'en';
            return;
        }
        const s = JSON.parse(raw);
        if (s.selectedDifficulty) selectedDifficulty = s.selectedDifficulty;
        if (typeof s.showOptionEffects === 'boolean') showOptionEffects = s.showOptionEffects;
        if (typeof s.musicEnabled === 'boolean') musicEnabled = s.musicEnabled;
        // Appearance (older saves stored one combined 'currentTheme': default | crt | win98)
        if (WINDOW_STYLES[s.windowStyle]) windowStyle = s.windowStyle;
        else if (WINDOW_STYLES[s.currentTheme]) windowStyle = s.currentTheme;
        if (COLOR_SCHEMES[s.colorScheme]) colorScheme = s.colorScheme;
        if (typeof s.crtEnabled === 'boolean') crtEnabled = s.crtEnabled;
        else if (s.currentTheme === 'crt') crtEnabled = true;
        if (s.effects && typeof s.effects === 'object') {
            Object.keys(effectsOn).forEach(k => { if (typeof s.effects[k] === 'boolean') effectsOn[k] = s.effects[k]; });
        }
        if (s.extra && typeof s.extra === 'object' && window.extraSettings) {
            window.extraSettings = Object.assign({}, window.extraSettings, s.extra);
            if (typeof applyAccessibility === 'function') applyAccessibility();
        }
        if (s.crtIntensity !== undefined) crtIntensity = Number(s.crtIntensity);
        if (s.textScale !== undefined) textScale = Number(s.textScale);
        currentLang = 'en';

        const audioElem = document.getElementById('bg-music');
        if (audioElem && s.volume !== undefined && (s.volumeSet || Number(s.volume) !== 1)) {
            audioElem.volume = Number(s.volume);
            window.volumeUserSet = true;
        }
        applyAppearance();
        const player = document.querySelector('.music-player');
        if (player) {
            player.style.display = musicEnabled ? 'block' : 'none';
        }
    } catch (e) { console.warn(e); }
}

// ACHIEVEMENT PROGRESS (the list of unlocked ids; the achievement logic is in achievements.js)
function loadUnlockedAchievements() {
    try {
        const list = JSON.parse(localStorage.getItem(ACHIEVEMENTS_KEY) || '[]');
        return Array.isArray(list) ? list : [];
    } catch (e) {
        return [];
    }
}

// Save the unlocked achievement ids to localStorage
function saveUnlockedAchievements() {
    try {
        localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(unlockedAchievements));
    } catch (e) { console.warn(e); }
}