// storage.js: localStorage saving and loading: campaign autosave, user settings and unlocked achievements.
// Load order: before achievements.js and game.js.

// localStorage keys
const SETTINGS_KEY = 'habibie_settings';
const ACHIEVEMENTS_KEY = 'habibie_achievements';
const CUSTOM_BG_KEY = 'habibie_custom_bg';

// AUTOMATIC MID-RUN CAMPAIGN SAVE & RESUME SYSTEM (localStorage)
const CAMPAIGN_SAVE_KEY = 'habibie_active_campaign_v1';

// Save the current campaign to localStorage
// Save the current campaign to localStorage
window.saveCampaignState = function() {
    if (!gameStarted || currentTurn >= MAX_TURNS) return;
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
    } catch (e) { console.warn('Could not save campaign:', e); }
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