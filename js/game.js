// game.js: core game logic: state, stats and factions, asset loading, menus, events, action phase and turn flow.

// National metrics that give each faction its leverage over the president
const FACTION_LEVERAGE_METRICS = {
    'pdip': ['pop', 'ref'],
    'golkar_akbar': ['econ', 'stab', 'cendana'],
    'golkar_habibie': ['ref', 'econ', 'intl'],
    'poros_tengah': ['ref', 'pop'],
    'ppp': ['stab', 'pop'],
    'pkb': ['pop', 'ref'],
    'abri': ['mil', 'stab'],
    'utusan_daerah': ['econ', 'stab'],
    'utusan_golongan': ['ref', 'intl'],
    'other_parties': ['pop', 'stab']
};

// NIGHT OF THE LONG KNIVES: HORSE-TRADING COSTS (tweak these)
const HORSE_TRADE_SINGLE_COST = 1;
const HORSE_TRADE_BLOC_COST = 3;
const HORSE_TRADE_BLOC_OVERTURES = 5;

// PC cost of one overture, or of a whole bloc of overtures
function getHorseTradeCost(overtures) {
    return overtures >= HORSE_TRADE_BLOC_OVERTURES ? HORSE_TRADE_BLOC_COST : overtures * HORSE_TRADE_SINGLE_COST;
}

// Horse-trading gain per overture = BASE x nationalMult x stanceMult x fatigue x jitter
const HORSE_TRADE_BASE_GAIN = 0.20;
const HORSE_TRADE_NATIONAL_MIN = 0.50;
const HORSE_TRADE_NATIONAL_RANGE = 1.00;
const HORSE_TRADE_MOOD_PEAK = 0.45;
const HORSE_TRADE_MOOD_FLOOR = 0.35;

// Horse-trading multiplier from Government Stability (average of all national metrics, with Cendana inverted)
function getHorseTradeNationalMult() {
    return HORSE_TRADE_NATIONAL_MIN + (getGovStability() / 100) * HORSE_TRADE_NATIONAL_RANGE;
}

// Horse-trading receptiveness from the faction's own mood tier: middle tiers are most persuadable, the extremes least
function getHorseTradeReceptiveness(factionKey, affinity) {
    const f = factions[factionKey];
    const mood = getMoodData(factionKey, affinity);
    let pos = 0.5;
    if (f && Array.isArray(f.moods) && f.moods.length > 1) {
        const idx = Math.max(0, f.moods.indexOf(mood));
        pos = idx / (f.moods.length - 1);
    }
    const maxDist = Math.max(HORSE_TRADE_MOOD_PEAK, 1 - HORSE_TRADE_MOOD_PEAK);
    const d = (pos - HORSE_TRADE_MOOD_PEAK) / maxDist;
    const mult = HORSE_TRADE_MOOD_FLOOR + (1 - HORSE_TRADE_MOOD_FLOOR) * (1 - d * d);
    return { mult, text: mood.text, color: mood.color };
}

// Factions shown in the portrait strip at the start of a campaign
const INITIAL_PORTRAIT_FACTIONS = [
    'pdip', 'golkar_akbar', 'golkar_habibie', 'poros_tengah', 'abri',
    'ppp', 'pkb', 'utusan_daerah',
    'utusan_golongan', 'other_parties'
];

// Escape ampersands and double quotes for use in HTML attributes
function escapeAttr(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

// Deep copy an object (structuredClone with a JSON fallback)
function deepClone(obj) {
    if (typeof structuredClone === 'function') {
        try { return structuredClone(obj); } catch (e) { console.warn(e); }
    }
    return JSON.parse(JSON.stringify(obj));
}

// Compute a faction's leverage over the president from its metrics
function getFactionLeverage(factionKey) {
    if (window.OppositionEngine) {
        const override = OppositionEngine.getLeverageOverride(factionKey);
        if (override) return override;
    }

    const metrics = FACTION_LEVERAGE_METRICS[factionKey];
    if (!metrics) {
        return {
            val: 50,
            text: 'Moderate',
            desc: 'Standard negotiating terms',
            color: '#B8860B',
            costMult: 1.0,
            gainMult: 1.0
        };
    }

    let sum = 0;
    for (let i = 0; i < metrics.length; i++) {
        sum += (stats[metrics[i]] || 0);
    }
    const avg = Math.round(sum / metrics.length);

    if (avg >= 80) {
        return {
            val: avg,
            text: "Absolute",
            desc: "Greatly reduces lobbying costs & greatly boosts goodwill gained",
            color: "#006400",
            costMult: 0.75,
            gainMult: 1.50
        };
    }
    if (avg >= 60) {
        return {
            val: avg,
            text: "Strong",
            desc: "Moderately reduces lobbying costs & boosts goodwill gained",
            color: "#009000",
            costMult: 0.85,
            gainMult: 1.25
        };
    }
    if (avg >= 40) {
        return {
            val: avg,
            text: "Moderate",
            desc: "Standard lobbying costs & slightly improved goodwill",
            color: "#B8860B",
            costMult: 1.00,
            gainMult: 1.10
        };
    }
    if (avg >= 20) {
        return {
            val: avg,
            text: "Weak",
            desc: "Moderately increases lobbying costs & dampens goodwill gained",
            color: "#FF4500",
            costMult: 1.15,
            gainMult: 0.90
        };
    }
    return {
        val: avg,
        text: "Nonexistent",
        desc: "Significantly increases lobbying costs & severely dampens goodwill",
        color: "#8B0000",
        costMult: 1.30,
        gainMult: 0.75
    };
}

// Display names of the stats used in effect text
const EFFECT_DISPLAY_NAMES = {
    'PC': 'Political Capital',
    'pop': 'Popularity',
    'mil': 'Military Support',
    'ref': 'Reformasi Credibility',
    'econ': 'Economic Health',
    'intl': 'International Standing',
    'stab': 'National Stability',
    'cendana': 'Cendana Influence',
    'pdip': 'PDI-P Loyalty',
    'golkar_akbar': 'Golkar (Akbar) Loyalty',
    'golkar_habibie': 'Loyalist Golkar Loyalty',
    'poros_tengah': 'PAN / Central Axis Loyalty',
    'ppp': 'PPP Loyalty',
    'pkb': 'PKB Loyalty',
    'abri': 'ABRI Loyalty',
    'utusan_daerah': 'Utusan Daerah Loyalty',
    'utusan_golongan': 'Utusan Golongan Loyalty',
    'other_parties': 'Minor Parties Loyalty'
};

// Turn a numeric change into a word (Slightly to Greatly)
function getQualitativeMagnitude(absVal) {
    if (absVal <= 3) return "Slightly";
    if (absVal <= 8) return "Moderately";
    if (absVal <= 14) return "Significantly";
    return "Greatly";
}

// Look up the descriptive tier name for a stat value
function getPlainStatTierName(statKey, val) {
    const statTiers = dashboardStats[statKey];
    if (!statTiers || statTiers.length === 0) return "a stable level";
    for (let i = 0; i < statTiers.length; i++) {
        if (val >= statTiers[i].min) return statTiers[i].text;
    }
    return statTiers[statTiers.length - 1].text;
}

function getNationalBetrayalPressure() {
    return window.OppositionEngine ? OppositionEngine.getBetrayalPressure() : 0;
}

function getFactionDefectionRate(key, effAff) {
    return window.OppositionEngine ? OppositionEngine.getDefectionRate(key, effAff) : 0;
}
// Estimated vote margin over the majority mark (the real vote's model without variance); null before the Assembly convenes
function getWhipMargin() {
    if (!gameStarted) return null;

    const govStability = getGovStability();
    const cendanaSabotage = Math.round((stats.cendana - 50) / 10);
    const stabilityFloorMod = Math.round((govStability - 50) / 10);

    let estVotes = 0;
    let activeTotalSeats = 0;

    for (let i = 0; i < portraitFactions.length; i++) {
        const key = portraitFactions[i];
        const f = factions[key];
        if (!f || f.seats <= 0 || bannedFactions[key]) continue;

        activeTotalSeats += f.seats;
        const favorBonus = (f.favor || 0) * 8;
        const advAdj = window.AdversaryEngine ? AdversaryEngine.affinityAdjust(key) : 0;
        const effAff = clampFaction(key, f.affinity + favorBonus + stabilityFloorMod - cendanaSabotage + advAdj);

        let baselineTurnout = 0;
        if (key === 'pdip' || key === 'poros_tengah' || key === 'abri') {
            if (effAff >= 80) baselineTurnout = 0.96;
            else if (effAff >= 65) baselineTurnout = 0.72;
            else if (effAff >= 50) baselineTurnout = 0.42;
            else if (effAff >= 35) baselineTurnout = 0.15;
        } else {
            baselineTurnout = effAff / 100;
        }

        // Hotfix 0.1.2
        const defectionRate = getFactionDefectionRate(key, effAff);
        const actualVoteRate = Math.max(0, baselineTurnout - defectionRate);

        estVotes += f.seats * actualVoteRate;
        if (window.AdversaryEngine) estVotes -= AdversaryEngine.taintLoss(key, actualVoteRate);
    }

    const majorityMark = Math.floor(activeTotalSeats / 2) + 1;
    return estVotes - majorityMark;
}

// Qualitative Palace Whip Projection for the MPR Dashboard (No Raw Numbers)
function getVagueWhipProjection() {
    const margin = getWhipMargin();
    if (margin === null) return `<font color=\"#555555\">Assembly Not Yet Convened</font>`;

    if (margin >= 65) return `<font color=\"#006400\"><b>We might have a commanding lead</b></font>`;
    if (margin >= 15) return `<font color=\"#009000\"><b>We are leading</b></font>`;
    if (margin >= -20) return `<font color=\"#B8860B\"><b>This is too close to call</b></font>`;
    if (margin >= -85) return `<font color=\"#FF4500\"><b>Our influence is waning</b></font>`;
    return `<font color=\"#8B0000\"><b>We are very unpopular among the delegates</b></font>`;
}

// Small arrow showing which way the whip projection moved since the last refresh
function getWhipTrendHTML() {
    const m = getWhipMargin();
    let html = '';
    if (m !== null && typeof window.lastWhipMargin === 'number') {
        const d = m - window.lastWhipMargin;
        if (d >= 0.5) html = ' <span title="Support has improved since your last move" style="color:#006400;">&#9650;</span>';
        else if (d <= -0.5) html = ' <span title="Support has slipped since your last move" style="color:#8B0000;">&#9660;</span>';
    }
    window.lastWhipMargin = m;
    return html;
}

// GAME STATE & CONFIGURATION
let currentTurn = 1;
let MAX_TURNS = 20;
let isActionPhase = false;
let gameStarted = false;
let globalMalus = 0;
let libraryData = [];
let tutorialPages = [];
let historyPages = [];
let creditsData = {};
let gameConfig = {};
let selectedDifficulty = 'historical';
let showOptionEffects = false;
let musicEnabled = true;
// Appearance = three independent settings: window style, color scheme, CRT scanlines
const WINDOW_STYLES = {
    default: { label: 'Default Win95', css: null },
    win98:   { label: 'Windows 98',    css: 'css/windows98/styles.css' },
    macos8:  { label: 'Mac OS 8',      css: 'css/macos8/styles.css' }
};
// Available color schemes with their swatches and groups
const COLOR_SCHEMES = {
    standard: { label: 'Standard', swatch: '#000080', group: 'light' },
    cherry: { label: 'Cherry Blossom', swatch: '#F29BB8', group: 'light' },
    exusiai: { label: 'Exusiai', swatch: '#A3171F', group: 'light' },
    mint: { label: 'Mint Soda', swatch: '#6CC3A0', group: 'light' },
    sky: { label: 'Sky Blue', swatch: '#6FB1E6', group: 'light' },
    peach: { label: 'Peach Sorbet', swatch: '#F2A36B', group: 'light' },
    brick: { label: 'Brick', swatch: '#7A1F1F', group: 'light' },
    desert: { label: 'Desert', swatch: '#5E5A2B', group: 'light' },
    lilac: { label: 'Lilac', swatch: '#4B3A7A', group: 'light' },
    marine: { label: 'Marine', swatch: '#003B5C', group: 'light' },
    rose: { label: 'Rose', swatch: '#7A2646', group: 'light' },
    slate: { label: 'Slate', swatch: '#2F3E5C', group: 'light' },
    spruce: { label: 'Spruce', swatch: '#1F4D2B', group: 'light' },
    wheat: { label: 'Wheat', swatch: '#6B4A12', group: 'light' },
    dark: { label: 'Dark', swatch: '#2B2B2B', group: 'dark' },
    midnight: { label: 'Midnight', swatch: '#0B1E5B', group: 'dark' },
    obsidian: { label: 'Obsidian (black)', swatch: '#3A3A52', group: 'dark' },
    nord: { label: 'Nord', swatch: '#5E81AC', group: 'dark' },
    amethyst: { label: 'Amethyst', swatch: '#8A5FD6', group: 'dark' },
    forest: { label: 'Forest', swatch: '#3E9A66', group: 'dark' },
    darkcherry: { label: 'Dark Cherry', swatch: '#C0507A', group: 'dark' },
    exusiainight: { label: 'Exusiai Night', swatch: '#D17A2A', group: 'dark' },
    amber: { label: 'Amber Terminal', swatch: '#B87800', group: 'dark' },
    greenterm: { label: 'Green Phosphor', swatch: '#1F9940', group: 'dark' },
    contrast: { label: 'High Contrast', swatch: '#FFFF00', group: 'dark' }
};
// Current appearance selections
let windowStyle = 'default';
let colorScheme = 'standard';
let crtEnabled = false;
let crtIntensity = 30;

// Effects: independent switches (Settings > Effects). 'crt' is crtEnabled; the rest live in effectsOn.
const EFFECTS = [
    { id: 'crt',        label: 'CRT Scanlines',
      desc: 'Fine horizontal scanlines across the whole screen.' },
    { id: 'glow',       label: 'Phosphor Glow &amp; Bloom',
      desc: 'Text gets a soft glowing halo and the screen a faint bloom of light.' },
    { id: 'flicker',    label: 'Screen Flicker &amp; Static',
      desc: 'A faint brightness flicker, moving static noise and a slow rolling bar. Flickering can bother people who are sensitive to flashing light.' },
    { id: 'curve',      label: 'Curved Glass Vignette (Curvature)',
      desc: 'Darkened edges, rounded glass corners and a hint of glare, like a curved tube.' },
    { id: 'aberration', label: 'RGB Chromatic Aberration (Glitch Effect)',
      desc: 'Text splits into red and cyan fringes, with a brief glitch shake every few seconds.' }
];
// Current on/off state of each effect
let effectsOn = { glow: false, flicker: false, curve: false, aberration: false };
let textScale = 110;
let currentLang = 'en';
let updatesData = null;

// Turn & Action Economy Tracking
let actionCooldowns = {};
let actionUsageCount = {};
let factionCooldowns = {};
let factionUsageCount = {};
let turnExecutiveUsed = false;
let turnFactionUsed = false;
let prevStatsSnapshot = null;
let lastRenderedPortraitSignature = "";

// Decree Locks, Banned Factions, Limits & JSON Data
let activeDecrees = {};
let bannedFactions = {};
let completedInteractions = {};
let minStats = { pop: 0, mil: 0, ref: 0, econ: 0, intl: 0, stab: 0 };
let maxCendana = 100;
let minFactions = {};
let actionsData = { routine: [], decrees: [] };

// Base stats & Faction snapshots
let stats = { PC: 0, pop: 30, mil: 35, ref: 40, econ: 20, intl: 30, stab: 25, cendana: 75 };
let factions = {};
let initialFactionsSnapshot = {};
let events = [];
let musicTracks = [];
let dashboardStats = {};
let portraitFactions = [...INITIAL_PORTRAIT_FACTIONS];

// Tally Speed, Military Lock & Mobile Touch State
window.tallySpeed = 1;
window.activeTallyInterval = null;
window.wirantoLocked = true;
window.wirantoStrain = 0;
window.mobileSelectedParliamentFaction = null;
window.lastElectionSummary = null;
// Hotfix 1
// Cendana is now active
window.lastTurnCendana = 95;



// GOVERNMENT STABILITY WORDING (desktop panel + mobile status bar)
const GOV_WORD_COLORS = {
    SECURE: '#006400', STABLE: '#009000', PRECARIOUS: '#B8860B', UNSTABLE: '#FF4500', COLLAPSING: '#8B0000'
};

// Word describing the current Government Stability
function getGovStabilityWord() {
    const g = getGovStability();
    if (g >= 80) return "SECURE";
    if (g >= 60) return "STABLE";
    if (g >= 40) return "PRECARIOUS";
    if (g >= 20) return "UNSTABLE";
    return "COLLAPSING";
}


// MENU NAVIGATION: one place decides where "Back" goes
window.electionPanelSnapshot = null;

// Call at the top of every full-panel menu; returns false when the menu must not open (vote tally running)
window.enterMenuView = function() {
    if (window.activeTallyInterval) {
        showCustomAlert('The roll call is still in progress. Let it finish, or press SKIP ANIMATION first.', null);
        return false;
    }
    // A finished election screen is built once by runElection(); remember it so Back can restore it.
    const mainPanel = document.getElementById('main-panel');
    if (gameStarted && mainPanel && mainPanel.querySelector('#election-result-container')) {
        window.electionPanelSnapshot = mainPanel.innerHTML;
    }
    return true;
};

// Go back to the view the current menu was opened from
window.returnToPreviousView = function() {
    if (!gameStarted) { showStartMenu(); return; }
    if (currentTurn > events.length) {
        const mainPanel = document.getElementById('main-panel');
        if (window.electionPanelSnapshot && mainPanel) {
            mainPanel.innerHTML = window.electionPanelSnapshot;
            scrollMainPanelToTop();
        } else {
            returnToTitleScreen();
        }
        return;
    }
    if (isActionPhase) showActionMenu(); else renderEventMenu();
};


// Show or hide the side panels to match the game state
function syncSidebarVisibility() {
    const leftPanel = document.getElementById('left-panel');
    const mainPanel = document.getElementById('main-panel');
    const mprDashboard = document.getElementById('mpr-dashboard');
    if (!leftPanel || !mainPanel || !mprDashboard) return;

    if (gameStarted) {
        leftPanel.style.display = '';
        mainPanel.style.width = '';
        mprDashboard.style.display = '';
    } else {
        leftPanel.style.display = 'none';
        mainPanel.style.width = '100%';
        mprDashboard.style.display = 'none';
    }
}

// Return to the main menu after an election without reloading the page
window.returnToTitleScreen = function() {
    clearTallyInterval();
    if (Object.keys(initialFactionsSnapshot).length > 0) {
        factions = deepClone(initialFactionsSnapshot);
    }
    portraitFactions = [...INITIAL_PORTRAIT_FACTIONS];
    bannedFactions = {};
    gameStarted = false;
    prevStatsSnapshot = null;
    lastRenderedPortraitSignature = "";
    window.lastElectionSummary = null;
    window.electionPanelSnapshot = null;
    window.epilogueActive = false;

    syncSidebarVisibility();
    updateUI();
    showStartMenu();
};

// Built-in config used when config.json fails to load
const fallbackConfig = {
    systemModifiers: {
        lowStatThreshold: 40, highStatThreshold: 60,
        malusMultiplier: 0.45, malusDecayNormal: 0.5, malusDecayHigh: 1.5, maxGlobalMalus: 10.0,
        bonusMultiplier: 0.3, maxBonusDrift: 2.0,
        loyalistDrainMitigation: 0.35, routineRepeatDecay: 0.15
    },
    difficultySettings: {
        easy: { name: "Easy", pc: 75, statMod: 15, cendana: 40, malusCap: 0.0, actionCostMod: -5, passivePCMod: 2, description: "Highly forgiving experience." },
        medium: { name: "Medium", pc: 50, statMod: 5, cendana: 60, malusCap: 0.35, actionCostMod: 0, passivePCMod: 1, description: "Standard action costs and moderate metrics." },
        high: { name: "High", pc: 35, statMod: 0, cendana: 75, malusCap: 0.75, actionCostMod: 0, passivePCMod: 0, description: "The standard difficult experience." },
        historical: { name: "Historical", pc: 20, statMod: 0, cendana: 95, malusCap: 1.25, actionCostMod: 5, passivePCMod: 0, description: "A nightmare. RECOMMENDED WAY TO PLAY." }
    }
};

// PARALLELIZED INITIALIZATION & AUTOMATIC ENGLISH FALLBACK
async function fetchJSONSafe(url, fallbackVal = null) {
    try {
        const res = await fetch(url);
        if (!res.ok) return fallbackVal;
        return await res.json();
    } catch (e) {
        console.log(`${url} missing or invalid, using fallback.`);
        return fallbackVal;
    }
}

// Fetches files in data/*, but if the current language is Indonesian, it will first try to fetch from data/id/* and fall back to English if that fails. Returns fallbackVal if both fail.
async function fetchLocalizedJSON(url, fallbackVal = null) {
    if (currentLang === 'id') {
        try {
            const locRes = await fetch(`data/id/${url}`);
            if (locRes.ok) {
                return await locRes.json();
            }
        } catch (e) {
            // Silently fall back to the default English file below
        }
    }
    return await fetchJSONSafe(`data/${url}`, fallbackVal);
}

// Persistent cache so the browser never garbage-collects decoded images mid-campaign
window.__preloadedImages = window.__preloadedImages || [];

// Recursively scans loaded JSON data (including inline HTML <img> tags) for image URLs
function collectAllGameImageUrls(rootObj, urlSet) {
    if (!rootObj) return;
    if (typeof rootObj === 'string') {
        const trimmed = rootObj.trim();
        if (/^[^<>]+\.(?:png|jpe?g|gif|webp|svg|bmp)$/i.test(trimmed)) {
            urlSet.add(trimmed);
        }
        const imgTagRegex = /src=["']([^"']+\.(?:png|jpe?g|gif|webp|svg|bmp))["']/gi;
        let match;
        while ((match = imgTagRegex.exec(trimmed)) !== null) {
            urlSet.add(match[1]);
        }
        return;
    }
    if (Array.isArray(rootObj)) {
        for (let i = 0; i < rootObj.length; i++) {
            collectAllGameImageUrls(rootObj[i], urlSet);
        }
        return;
    }
    if (typeof rootObj === 'object') {
        for (const key in rootObj) {
            if (Object.prototype.hasOwnProperty.call(rootObj, key)) {
                collectAllGameImageUrls(rootObj[key], urlSet);
            }
        }
    }
}

// Preloads and decodes a single image into persistent memory; resolves even on 404
function preloadSingleImage(src) {
    return new Promise((resolve) => {
        const img = new Image();
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            resolve(img);
        };

        img.onload = () => {
            if (typeof img.decode === 'function') {
                img.decode().then(finish).catch(finish);
            } else {
                finish();
            }
        };
        img.onerror = finish;
        img.src = src;
        window.__preloadedImages.push(img);
    });
}

// Load all localized JSON data with an English fallback
async function loadLocalizedAssets(onStepProgress) {
    const step = (typeof onStepProgress === 'function') ? onStepProgress : () => {};
    const trackedFetch = (url, fallback) => fetchLocalizedJSON(url, fallback).then(res => {
        step();
        return res;
    });

    const [
        cfgData, achvData, evData, routData, decData,
        tutData, histData, libData, persData, stData, credData, updData, advData,
        ...factionResults
    ] = await Promise.all([
        trackedFetch('config.json', fallbackConfig),
        trackedFetch('achievements.json', []),
        trackedFetch('events.json', []),
        trackedFetch('actionphase/routine.json', []),
        trackedFetch('actionphase/decrees.json', []),
        trackedFetch('localization/tutorial.json', []),
        trackedFetch('localization/history.json', []),
        trackedFetch('localization/library.json', []),
        trackedFetch('localization/persons.json', []),
        trackedFetch('stats.json', {}),
        trackedFetch('credits.json', {}),
        trackedFetch('updates.json', null),
        fetchJSONSafe('data/language/english/opposition.json', null).then(res => { step(); return res; }),
        ...INITIAL_PORTRAIT_FACTIONS.map(key => trackedFetch(`fraksi/${key}.json`, null))
    ]);

    gameConfig = cfgData || fallbackConfig;
    gameConfig.systemModifiers = Object.assign({}, fallbackConfig.systemModifiers, gameConfig.systemModifiers || {});
    ACHIEVEMENTS = achvData || [];

    const formatFactionNames = (obj) => {
        if (!obj || !obj.name) return;
        const clean = obj.name.replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim();
        obj.portraitName = /<br\s*\/?>/i.test(obj.name)
            ? obj.name
            : clean.replace(/\s+\(/, '<br>(');
        obj.name = clean;
    };

    const loadedFactions = {};
    INITIAL_PORTRAIT_FACTIONS.forEach((key, idx) => {
        if (factionResults[idx]) {
            const fac = factionResults[idx];
            formatFactionNames(fac);
            if (fac.transformed) formatFactionNames(fac.transformed);
            loadedFactions[key] = fac;
        }
    });

    events = evData || [];
    MAX_TURNS = events.length + 1;
    const maxTurnEl = document.getElementById('max-turn-display');
    if (maxTurnEl) maxTurnEl.innerText = events.length;

    const totalEventTurns = events.length;
    const axisTurnIdx = Math.max(1, events.findIndex(e => e.id === 'ev_central_axis') + 1);

    for (const fk in loadedFactions) {
        const fac = loadedFactions[fk];
        if (fac && Array.isArray(fac.interactions)) {
            fac.interactions.forEach(inter => {
                if (String(inter.id || '').includes('final')) {
                    inter.minTurn = Math.max(1, totalEventTurns - 2);
                    inter.maxTurn = totalEventTurns;
                } else if (inter.maxTurn && inter.maxTurn >= 17) {
                    inter.maxTurn = totalEventTurns;
                }
                if (inter.minTurn && inter.minTurn > totalEventTurns) {
                    inter.minTurn = Math.max(1, totalEventTurns - 3);
                }
            });
        }
        if (fac && fac.transformed && Array.isArray(fac.transformed.interactions)) {
            fac.transformed.interactions.forEach(inter => {
                if (String(inter.id || '').includes('final')) {
                    inter.minTurn = Math.max(1, totalEventTurns - 2);
                    inter.maxTurn = totalEventTurns;
                } else {
                    inter.minTurn = axisTurnIdx;
                    inter.maxTurn = totalEventTurns;
                }
            });
        }
    }

    initialFactionsSnapshot = deepClone(loadedFactions);
    if (!gameStarted) {
        factions = deepClone(loadedFactions);
    }

    actionsData = {
        routine: routData || [],
        decrees: decData || []
    };
    tutorialPages = tutData || [];
    historyPages = histData || [];
    libraryData = [...(libData || []), ...(persData || [])];
    dashboardStats = stData || {};
    creditsData = credData || {};
    updatesData = updData || null;
    window.advTextData = advData || null;   // opposition moves + historical background news (adversaries.js)
    lastRenderedPortraitSignature = "";
    window.oppLocData = advData || null;
    window.advTextData = advData || null;
}

// Preload and decode every referenced image behind the loading screen
async function preloadAllAssetsWithWin95Modal(titleOverride) {
    const overlay = document.getElementById('win95-loader-overlay');
    const titleEl = document.getElementById('win95-loader-title');
    const flavorEl = document.getElementById('win95-loader-flavor');
    const pctEl = document.getElementById('win95-loader-pct');
    const barEl = document.getElementById('win95-loader-bar-fill');
    const fileEl = document.getElementById('win95-loader-file');

    if (titleEl) titleEl.innerText = titleOverride || 'LOADING ASSETS';
    if (pctEl) pctEl.innerText = '0%';
    if (barEl) barEl.style.width = '0%';
    if (fileEl) fileEl.innerText = 'Loading...';
    if (overlay) overlay.style.display = 'flex';

    const loadingMeta = await fetchJSONSafe('data/loading.json', null);
    const messages = (loadingMeta && loadingMeta.messages && loadingMeta.messages[currentLang])
        || (loadingMeta && loadingMeta.messages && loadingMeta.messages.en)
        || ['Loading...'];
    const fakeFiles = (loadingMeta && Array.isArray(loadingMeta.files) && loadingMeta.files.length > 0)
        ? loadingMeta.files
        : ['Loading...'];

    let fileTick = 0;
    const updateModalUI = (fraction) => {
        const clamped = Math.max(0, Math.min(1, fraction));
        const pct = Math.round(clamped * 100);
        if (pctEl) pctEl.innerText = pct + '%';
        if (barEl) barEl.style.width = pct + '%';

        const msgIdx = Math.min(messages.length - 1, Math.floor(clamped * messages.length));
        if (flavorEl && messages[msgIdx]) flavorEl.innerText = messages[msgIdx];

        const fIdx = Math.min(
            fakeFiles.length - 1,
            Math.max(Math.floor(clamped * fakeFiles.length), fileTick % fakeFiles.length)
        );
        fileTick++;
        if (fileEl && fakeFiles[fIdx]) fileEl.innerText = fakeFiles[fIdx];
    };

    // STAGE 1: Load all JSON data files (0% -> 25% of progress bar)
    const totalJsonCount = 13 + INITIAL_PORTRAIT_FACTIONS.length + 1;
    let loadedJsonCount = 0;
    const onJsonStep = () => {
        loadedJsonCount++;
        updateModalUI((loadedJsonCount / totalJsonCount) * 0.25);
    };

    const [_, musData] = await Promise.all([
        loadLocalizedAssets(onJsonStep),
        fetchJSONSafe('audio/music.json', []).then(res => { onJsonStep(); return res; })
    ]);
    musicTracks = musData || [];

    // STAGE 2: Harvest every image path referenced across UI & JSON data (25% -> 100%)
    const imageUrlSet = new Set([
        'photo/icon.png',
        'photo/habibi.png',
        'photo/mpr.png',
        'photo/pancasila.png',
        'photo/title_banner.png',
        'photo/routine.png',
        'photo/decree.png',
        'photo/victory.png',
        'photo/defeat.png'
    ]);

    collectAllGameImageUrls(gameConfig, imageUrlSet);
    collectAllGameImageUrls(ACHIEVEMENTS, imageUrlSet);
    collectAllGameImageUrls(events, imageUrlSet);
    collectAllGameImageUrls(actionsData, imageUrlSet);
    collectAllGameImageUrls(tutorialPages, imageUrlSet);
    collectAllGameImageUrls(historyPages, imageUrlSet);
    collectAllGameImageUrls(libraryData, imageUrlSet);
    collectAllGameImageUrls(factions, imageUrlSet);
    collectAllGameImageUrls(updatesData, imageUrlSet);

    const allImages = Array.from(imageUrlSet).filter(Boolean);
    const totalImages = allImages.length;

    if (totalImages > 0) {
        let loadedImages = 0;
        await Promise.all(allImages.map(src =>
            preloadSingleImage(src).then(() => {
                loadedImages++;
                updateModalUI(0.25 + (loadedImages / totalImages) * 0.75);
            })
        ));
    } else {
        updateModalUI(1);
    }

    updateModalUI(1);
    await new Promise(r => setTimeout(r, 180));
    if (overlay) overlay.style.display = 'none';
}

// Start the game: load assets and settings, then show the start menu
async function initGame() {
    try {
        loadUserSettings();
        setupMobileLeftPanelToggle();
        wireMusicStateEvents();

        await preloadAllAssetsWithWin95Modal('LOADING ASSETS');

        if (musicTracks.length > 0) setupMusicPlayer();

        updateUI();
        showStartMenu();
    } catch (error) {
        console.error("Failed to load game assets:", error);
        const overlay = document.getElementById('win95-loader-overlay');
        if (overlay) overlay.style.display = 'none';
        document.getElementById('main-panel').innerHTML =
            `<h3>Fatal Error Loading Assets</h3>
             <p style="font-family: MS Sans Serif, sans-serif; font-size: 12px; color: red;">
             Failed to fetch local JSON files. Check the console for missing files or syntax errors.
             </p>`;
    }
}

// Run initGame when the page loads
window.addEventListener('load', initGame);

// Audio player: Play/Pause button and taskbar speaker are driven by the audio element's own events
window.syncMusicUI = function() {
    const audio = document.getElementById('bg-music');
    const btn = document.getElementById('play-pause-btn');
    if (btn && audio) btn.innerText = (audio.paused || !musicEnabled) ? "\u23F5 Play" : "\u23F8 Pause";
    if (typeof updateWin95Taskbar === 'function') updateWin95Taskbar();
};

// Keep the music buttons in sync with the audio element's events
function wireMusicStateEvents() {
    const audio = document.getElementById('bg-music');
    if (!audio || audio.dataset.wired) return;
    audio.dataset.wired = '1';
    ['play', 'pause', 'emptied'].forEach(evt => audio.addEventListener(evt, window.syncMusicUI));
    window.syncMusicUI();
}

// Set up the music player and its track list
function setupMusicPlayer() {
    if (musicTracks.length === 0) return;
    const select = document.getElementById('music-select');
    const audio = document.getElementById('bg-music');

    select.innerHTML = '';
    musicTracks.forEach((track) => {
        const opt = document.createElement('option');
        opt.value = track.file;
        opt.text = track.title;
        select.appendChild(opt);
    });

    audio.src = musicTracks[0].file;
    if (!window.volumeUserSet) audio.volume = 0.3;

    audio.onended = function() {
        if (musicTracks.length > 1) {
            const currentIndex = select.selectedIndex;
            let nextIndex = currentIndex;
            while (nextIndex === currentIndex) {
                nextIndex = Math.floor(Math.random() * musicTracks.length);
            }
            select.selectedIndex = nextIndex;
            audio.src = musicTracks[nextIndex].file;
            audio.play().catch(() => {});
        } else if (musicTracks.length === 1) {
            audio.currentTime = 0;
            audio.play().catch(() => {});
        }
    };

    if (!musicEnabled) {
        audio.pause();
        window.syncMusicUI();
        return;
    }

    window.syncMusicUI();
}

// Start the background music the first time a campaign begins or is resumed
let musicAutoStarted = false;
function startBackgroundMusic() {
    if (musicAutoStarted) return;
    const audio = document.getElementById('bg-music');
    if (!audio || !musicEnabled || musicTracks.length === 0) return;
    musicAutoStarted = true;
    const playPromise = audio.play();
    if (playPromise !== undefined) {
        playPromise.catch(() => {
            window.syncMusicUI();
            const unlockAudio = () => {
                if (audio.paused && musicEnabled) {
                    audio.play().catch(() => {});
                }
                document.removeEventListener('click', unlockAudio);
                document.removeEventListener('keydown', unlockAudio);
                document.removeEventListener('touchstart', unlockAudio);
            };
            document.addEventListener('click', unlockAudio);
            document.addEventListener('keydown', unlockAudio);
            document.addEventListener('touchstart', unlockAudio);
        });
    }
}

// Switch to the selected music track
window.changeMusic = function() {
    const select = document.getElementById('music-select');
    const audio = document.getElementById('bg-music');

    audio.src = select.value;
    if (gameStarted) audio.play().catch(() => {});
};

// Play or pause the music
window.toggleMusic = function() {
    const audio = document.getElementById('bg-music');
    // Respect "Enable Music Player" and a missing track list (taskbar speaker also calls this)
    if (!audio || !musicEnabled || musicTracks.length === 0) return;

    if (audio.paused) {
        if (gameStarted) audio.play().catch(() => {});
    } else {
        audio.pause();
    }
};

// CLAMPING & CALCULATION HELPERS
function clampPC(val) {
    return Math.max(0, Math.min(100, Math.round(val)));
}

// Clamp a dashboard stat to its allowed range
function clampDashboard(key, val) {
    const rounded = Math.round(val);
    if (key === 'cendana') return Math.max(0, Math.min(maxCendana, rounded));
    const min = minStats[key] || 0;
    return Math.max(min, Math.min(100, rounded));
}

// Clamp a faction affinity to its allowed range
function clampFaction(key, val) {
    const min = minFactions[key] || 0;
    return Math.max(min, Math.min(100, Math.round(val * 10) / 10));
}

// Government Stability: average of all national metrics with Cendana inverted
function getGovStability() {
    return Math.round((stats.pop + stats.mil + stats.ref + stats.econ + stats.intl + stats.stab + (100 - stats.cendana)) / 7);
}

// Extra action cost caused by low or high National Stability
function getStabilityCostModifier() {
    if (stats.stab < 40) {
        return Math.ceil((40 - stats.stab) / 6);
    }
    if (stats.stab >= 75) {
        return -2;
    }
    return 0;
}

// Final PC cost of a decree after difficulty and stability modifiers
function computeDecreeCost(baseCost) {
    const diffMod = gameConfig.difficultySettings[selectedDifficulty].actionCostMod || 0;
    const stabMod = getStabilityCostModifier();
    return Math.max(5, Math.round(baseCost + diffMod + stabMod));
}

// Final PC cost of a faction action, including leverage
function computeFactionActionCost(factionKey, baseCost) {
    if (baseCost <= 0) return 0;
    const diffMod = gameConfig.difficultySettings[selectedDifficulty].actionCostMod || 0;
    const stabMod = getStabilityCostModifier();
    const leverage = getFactionLeverage(factionKey);
    return Math.max(3, Math.round((baseCost + diffMod + stabMod) * leverage.costMult));
}

// VAGUE EFFECT FORMATTER FOR TOOLTIPS (NO NUMBERS OR PERCENTAGES)
function formatEffectString(effects) {
    if (!effects) return "";
    const parts = [];
    const skipKeys = {};

    const hasBothMilAndAbri = (effects.mil !== undefined && effects.abri !== undefined);

    for (const statKey in effects) {
        if (skipKeys[statKey]) continue;

        if (statKey.endsWith('_favor')) {
            const facKey = statKey.replace('_favor', '');
            const facName = (factions[facKey] && factions[facKey].short) ? factions[facKey].short : (EFFECT_DISPLAY_NAMES[facKey] || facKey);
            parts.push(`<span style="color: #0000FF;">Grants a Favor with ${facName}</span>`);
            continue;
        }

        const rawVal = effects[statKey];
        let numVal = 0;

        if (Array.isArray(rawVal) && rawVal.length === 2) {
            numVal = (Number(rawVal[0]) + Number(rawVal[1])) / 2;
        } else if (typeof rawVal === 'string' && rawVal.includes('..')) {
            const nums = rawVal.split(/\.+/).map(n => parseInt(n, 10)).filter(n => !isNaN(n));
            if (nums.length === 2) numVal = (nums[0] + nums[1]) / 2;
        } else if (typeof rawVal === 'number') {
            numVal = rawVal;
        }

        if (numVal === 0) continue;

        let label = EFFECT_DISPLAY_NAMES[statKey] || statKey;
        if (hasBothMilAndAbri && (statKey === 'mil' || statKey === 'abri')) {
            label = 'Military (ABRI) Support';
            skipKeys['mil'] = true;
            skipKeys['abri'] = true;
        }

        const adverb = getQualitativeMagnitude(Math.abs(numVal));
        const verb = numVal > 0 ? "increases" : "reduces";

        const isGood = (statKey === 'cendana') ? (numVal < 0) : (numVal > 0);
        const color = isGood ? "#006400" : "#8B0000";

        parts.push(`<span style="color: ${color};">${adverb} ${verb} ${label}</span>`);
    }

    if (parts.length === 0) return "";
    return `<br><span style="font-size: 10px; font-family: MS Sans Serif; font-weight: normal;">[ ${parts.join(" &bull; ")} ]</span>`;
}

// CORE LOGIC FUNCTIONS (WITH QUALITATIVE TREND ARROWS)
function getVagueStatText(statKey, val) {
    const statTiers = dashboardStats[statKey];
    let baseHTML = `<font color="#8B0000">Unknown</font>`;
    if (statTiers) {
        for (let i = 0; i < statTiers.length; i++) {
            if (val >= statTiers[i].min) {
                baseHTML = `<font color="${statTiers[i].color}">${statTiers[i].text}</font>`;
                break;
            }
        }
    }

    if (gameStarted && prevStatsSnapshot && prevStatsSnapshot[statKey] !== undefined) {
        const diff = val - prevStatsSnapshot[statKey];
        if (Math.abs(diff) >= 1) {
            const isUp = diff > 0;
            const isGood = (statKey === 'cendana') ? !isUp : isUp;
            const arrowColor = isGood ? "#006400" : "#8B0000";
            const arrowChar = isUp ? "&#9650;" : "&#9660;";
            baseHTML += ` <span style="font-size: 9px; color: ${arrowColor};" title="Recent shift">${arrowChar}</span>`;
        }
    }
    return baseHTML;
}

// Mood tier (text, color, overlay) for a faction's affinity
function getMoodData(factionKey, aff) {
    const f = factions[factionKey];
    if (!f || !f.moods || f.moods.length === 0) {
        return { overlay: "rgba(139, 0, 0, 0.25)", text: "Unknown", color: "#8B0000" };
    }
    for (let i = 0; i < f.moods.length; i++) {
        if (aff >= f.moods[i].min) return f.moods[i];
    }
    return f.moods[f.moods.length - 1];
}

// MPR DASHBOARD TABS & PARLIAMENT HEMICYCLE
let mprDashboardTab = 'factions';

// Historical party swatch color for each faction
const FACTION_HISTORICAL_COLORS = {
    'pdip':            { fill: '#C0392B', border: '#FF7777', label: 'PDI-P' },
    'utusan_golongan': { fill: '#7F8C8D', border: '#BDC3C7', label: 'U. Golongan' },
    'pkb':             { fill: '#006400', border: '#55CC55', label: 'PKB' },
    'poros_tengah':    { fill: '#0055A4', border: '#66B2FF', label: 'PAN / Poros Tengah' },
    'ppp':             { fill: '#2E8B57', border: '#77DDAA', label: 'PPP' },
    'other_parties':   { fill: '#00838F', border: '#66E0EB', label: 'Other Parties' },
    'utusan_daerah':   { fill: '#6E6E6E', border: '#B0B0B0', label: 'U. Daerah' },
    'golkar_habibie':  { fill: '#D49B00', border: '#FFE066', label: 'Golkar (Iramasuka)' },
    'golkar_akbar':    { fill: '#F1C40F', border: '#FFFF99', label: 'Golkar (DPP Slipi)' },
    'abri':            { fill: '#556B2F', border: '#A3C266', label: 'ABRI' }
};

// Order in which factions are seated in the hemicycle
const PARLIAMENT_SEATING_ORDER = [
    'pdip', 'poros_tengah', 'pkb', 'ppp', 'golkar_habibie', 'golkar_akbar',
    'other_parties', 'utusan_daerah', 'utusan_golongan', 'abri'
];

// Switch between the MPR dashboard tabs
window.switchMPRTab = function(tabName) {
    if (mprDashboardTab === tabName) return;
    mprDashboardTab = tabName;
    window.mobileSelectedParliamentFaction = null;
    lastRenderedPortraitSignature = "";
    updateUI();
};

// Highlight one faction's seats in the hemicycle
window.highlightParliamentFaction = function(factionKey, isMobileTap = false) {
    const f = factions[factionKey];
    if (!f) return;
    const mood = getMoodData(factionKey, f.affinity);
    const infoBar = document.getElementById('mpr-parliament-hover-info');
    if (infoBar) {
        if (isMobileTap) {
            infoBar.innerHTML = `<b>${f.name}</b> (${f.seats} Seats) &bull; <font color="${mood.color}"><b>${mood.text}</b></font> &nbsp;<button style="width: auto; display: inline-block; --py: 2px; --px: 8px; margin: 0; font-size: 11px; " onclick="openFactionMenu('${factionKey}')">Negotiate</button>`;
        } else {
            infoBar.innerHTML = `<b>${f.name}</b> &mdash; <b>${f.seats} Delegates</b> &bull; Current Stance: <font color="${mood.color}"><b>${mood.text}</b></font> <i>(Click to negotiate)</i>`;
        }
    }
    const container = document.getElementById('mpr-dashboard-hemicycle');
    if (!container) return;
    const dots = container.querySelectorAll('.mpr-seat-dot');
    dots.forEach(d => {
        if (d.getAttribute('data-faction') === factionKey) {
            d.classList.add('seat-faction-hover');
            d.classList.remove('seat-faction-dim');
        } else {
            d.classList.add('seat-faction-dim');
            d.classList.remove('seat-faction-hover');
        }
    });
};

// Remove the hemicycle highlight
window.clearParliamentHighlight = function() {
    if (window.innerWidth <= 820 && window.mobileSelectedParliamentFaction) return;
    const infoBar = document.getElementById('mpr-parliament-hover-info');
    if (infoBar) {
        infoBar.innerHTML = `Hover or tap any seat block or legend item to inspect caucus strength &bull; Click to initiate negotiations.`;
    }
    const container = document.getElementById('mpr-dashboard-hemicycle');
    if (!container) return;
    container.querySelectorAll('.mpr-seat-dot').forEach(d => {
        d.classList.remove('seat-faction-hover', 'seat-faction-dim');
    });
};

// Handle a tap or click on a hemicycle seat
window.handleParliamentSeatClick = function(factionKey) {
    if (window.innerWidth <= 820) {
        if (window.mobileSelectedParliamentFaction !== factionKey) {
            window.mobileSelectedParliamentFaction = factionKey;
            highlightParliamentFaction(factionKey, true);
            return;
        }
    }
    openFactionMenu(factionKey);
};

// Draw the 700-seat hemicycle and the faction legend
function renderParliamentHemicycleTab() {
    const activeOrder = PARLIAMENT_SEATING_ORDER.filter(k => portraitFactions.includes(k));
    let totalSeats = 0;
    activeOrder.forEach(k => {
        const f = factions[k];
        if (f && !bannedFactions[k] && f.seats > 0) {
            totalSeats += f.seats;
        }
    });

    const hemicycleCoords = generateHemicycleLayout(Math.max(1, totalSeats));
    let html = `<div class="mpr-chamber-box" style="margin-top: 6px; margin-bottom: 4px;">`;

    html += `<div id="mpr-parliament-hover-info" class="mpr-parliament-readout">
        Hover or tap any seat block or legend item to inspect caucus strength &bull; Click to initiate negotiations.
    </div>`;

    html += `<div id="mpr-dashboard-hemicycle" class="mpr-hemicycle-wrap">`;

    let seatCursor = 0;
    activeOrder.forEach(key => {
        const f = factions[key];
        if (!f || bannedFactions[key] || f.seats <= 0) return;

        const col = FACTION_HISTORICAL_COLORS[key] || { fill: '#808080', border: '#CCCCCC' };
        const mood = getMoodData(key, f.affinity);
        const seatTitle = escapeAttr(`${f.name} (${f.seats} Delegates) — ${mood.text}`);

        for (let s = 0; s < f.seats && seatCursor < hemicycleCoords.length; s++) {
            const pt = hemicycleCoords[seatCursor++];
            html += `<div class="mpr-seat-dot mpr-interactive-seat"
                data-faction="${key}"
                style="left: ${pt.x.toFixed(2)}%; top: ${pt.y.toFixed(2)}%; background-color: ${col.fill}; border-top-color: ${col.border}; border-left-color: ${col.border};"
                title="${seatTitle}"
                onmouseenter="highlightParliamentFaction('${key}')"
                onmouseleave="clearParliamentHighlight()"
                onclick="handleParliamentSeatClick('${key}')"></div>`;
        }
    });

    html += `<div class="mpr-rostrum">MPR ROSTRUM</div>`;
    html += `</div>`;

    // Interactive Faction Legend below the Hemicycle
    html += `<div class="mpr-parliament-legend">`;
    activeOrder.forEach(key => {
        const f = factions[key];
        if (!f) return;
        const col = FACTION_HISTORICAL_COLORS[key] || { fill: '#808080', border: '#CCCCCC', label: f.short };
        const isBanned = bannedFactions[key] === true || f.seats <= 0;
        const mood = getMoodData(key, f.affinity);

        if (isBanned) {
            html += `<div class="mpr-legend-item mpr-legend-banned" title="${escapeAttr(f.name + ' — Dissolved')}">
                <span class="mpr-legend-swatch" style="background-color: #555555;"></span>
                <span style="text-decoration: line-through; color: #777;">${f.short} (0)</span>
            </div>`;
        } else {
            html += `<div class="mpr-legend-item"
                onmouseenter="highlightParliamentFaction('${key}')"
                onmouseleave="clearParliamentHighlight()"
                onclick="handleParliamentSeatClick('${key}')"
                title="${escapeAttr('Click to interact with ' + f.name + ' (' + mood.text + ')')}">
                <span class="mpr-legend-swatch" style="background-color: ${col.fill};"></span>
                <span><b>${f.short}</b> (${f.seats}) &bull; <font color="${mood.color}">${mood.text}</font></span>
            </div>`;
        }
    });
    html += `</div></div>`;

    return html;
}

// Cached lookup of UI elements by id
const _uiElCache = {};
function uiEl(id) {
    let el = _uiElCache[id];
    if (!el || !el.isConnected) {
        el = document.getElementById(id);
        _uiElCache[id] = el;
    }
    return el;
}

// Redraw the status panel, MPR dashboard and portraits
function updateUI() {
    uiEl('val-pc').innerText = stats.PC;

    uiEl('val-pop').innerHTML = getVagueStatText('pop', stats.pop);
    uiEl('val-mil').innerHTML = getVagueStatText('mil', stats.mil);
    uiEl('val-ref').innerHTML = getVagueStatText('ref', stats.ref);
    uiEl('val-econ').innerHTML = getVagueStatText('econ', stats.econ);
    uiEl('val-intl').innerHTML = getVagueStatText('intl', stats.intl);
    uiEl('val-stab').innerHTML = getVagueStatText('stab', stats.stab);
    uiEl('val-cendana').innerHTML = getVagueStatText('cendana', stats.cendana);

    const govStabElement = uiEl('val-gov-stab');
    if (govStabElement) {
        if (gameStarted) {
            const govStability = getGovStability();
            if (govStability >= 80) govStabElement.innerHTML = `<div style="color: #006400;">SECURE</div>`;
            else if (govStability >= 60) govStabElement.innerHTML = `<div style="color: #009000;">STABLE</div>`;
            else if (govStability >= 40) govStabElement.innerHTML = `<div style="color: #B8860B;">PRECARIOUS</div>`;
            else if (govStability >= 20) govStabElement.innerHTML = `<div style="color: #FF4500;">UNSTABLE</div>`;
            else govStabElement.innerHTML = `<div style="color: #8B0000;">COLLAPSING</div>`;
        } else {
            govStabElement.innerHTML = `<div style="color: #000;">-</div>`;
        }
    }

    updateMobileToggleLabel();
    updateMobileStatusBar();

    const whipElem = uiEl('whip-projection-display');
    if (whipElem) {
        window.whipTrendHTML = getWhipTrendHTML();
        whipElem.innerHTML = getVagueWhipProjection() + window.whipTrendHTML;
    }

    if (gameStarted) {
        uiEl('turn-display').innerText = currentTurn;
        if (currentTurn <= events.length) {
            uiEl('date-display').innerText = events[currentTurn - 1].date;
        } else {
            uiEl('date-display').innerText = "Oct 19, 1999 (General Session)";
        }
    } else {
        uiEl('turn-display').innerText = "-";
        uiEl('date-display').innerText = "June 1999";
    }

    const isParliamentTab = (mprDashboardTab === 'parliament');
    const currentSignature = `${mprDashboardTab}||` + portraitFactions.map(k => {
        const f = factions[k];
        const banned = bannedFactions[k] === true || !f || f.seats <= 0;
        // The parliament view shows mood text, so it must rebuild when a mood changes
        const moodKey = (isParliamentTab && f && !banned) ? getMoodData(k, f.affinity).text : '';
        return `${k}:${banned ? 'B' : 'A'}:${f ? f.seats : 0}:${f ? f.name : ''}:${moodKey}`;
    }).join('|');

    const portraitsArea = uiEl('portraits-area');

    const sameView = portraitsArea && lastRenderedPortraitSignature === currentSignature && portraitsArea.children.length > 0;

    if (sameView && isParliamentTab) {
        // Nothing visible changed: keep the 700-seat hemicycle (and any hover highlight) as it is
    } else if (sameView && mprDashboardTab === 'factions') {
        for (let i = 0; i < portraitFactions.length; i++) {
            const key = portraitFactions[i];
            const f = factions[key];
            if (!f || bannedFactions[key] === true || f.seats <= 0) continue;

            const mood = getMoodData(key, f.affinity);
            const overlayEl = uiEl(`p-overlay-${key}`);
            const seatsEl = uiEl(`p-seats-${key}`);
            const moodEl = uiEl(`p-mood-${key}`);

            if (overlayEl) overlayEl.style.backgroundColor = mood.overlay;
            if (seatsEl) seatsEl.innerText = `${f.seats} Delegates`;
            if (moodEl) moodEl.innerHTML = `<font color="${mood.color}"><b>${mood.text}</b></font>`;
        }
    } else if (portraitsArea) {
        const isFacTab = (mprDashboardTab === 'factions');
        const isParlTab = (mprDashboardTab === 'parliament');

        let pHTML = `<div class="mpr-view-tabs">
            <button class="mpr-tab-btn ${isFacTab ? 'is-selected' : ''}" onclick="switchMPRTab('factions')">
                Faction View
            </button>
            <button class="mpr-tab-btn ${isParlTab ? 'is-selected' : ''}" onclick="switchMPRTab('parliament')">
                Parliament View
            </button>
        </div>`;

        if (isParlTab) {
            pHTML += renderParliamentHemicycleTab();
        } else {
            const colsPerRow = Math.max(1, Math.ceil(portraitFactions.length / 2));
            const cellWidth = Math.floor(100 / colsPerRow) + '%';

            pHTML += '<table class="portraits-table" cellpadding="5"><tr>';
            for (let i = 0; i < portraitFactions.length; i++) {
                if (i > 0 && i % colsPerRow === 0) pHTML += '</tr><tr>';

                const key = portraitFactions[i];
                const f = factions[key];
                if (!f) continue;

                const isBanned = bannedFactions[key] === true || f.seats <= 0;
                const mood = getMoodData(key, f.affinity);
                const displayPortraitName = f.portraitName || f.name;

                if (isBanned) {
                    pHTML += '<td width="' + cellWidth + '" valign="top" class="portrait-cell portrait-banned" title="This faction has been dissolved and stripped of its MPR seats.">';
                    pHTML += '<div class="portrait-container" style="filter: grayscale(100%); opacity: 0.45;">';
                    pHTML += '<span>[ PHOTO:<br>' + f.short.toUpperCase() + ' ]</span>';
                    pHTML += '<img src="' + f.image + '" class="portrait-img" alt="[' + f.short + ']">';
                    pHTML += '<div class="portrait-overlay" style="background-color: rgba(40, 40, 40, 0.55); display: flex; align-items: center; justify-content: center;">';
                    pHTML += '<span class="portrait-dissolved-stamp">DISSOLVED</span>';
                    pHTML += '</div>';
                    pHTML += '</div>';
                    pHTML += '<div class="portrait-name" style="color: #777; text-decoration: line-through;">' + displayPortraitName + '</div>';
                    pHTML += '<div class="portrait-seats" style="color: #888;">0 Delegates</div>';
                    pHTML += '<div class="portrait-mood"><font color="#666666"><b>Banned / Dissolved</b></font></div>';
                    pHTML += '</td>';
                } else {
                    pHTML += '<td width="' + cellWidth + '" valign="top" class="portrait-cell" onclick="openFactionMenu(\'' + key + '\')">';
                    pHTML += '<div class="portrait-container">';
                    pHTML += '<span>[ PHOTO:<br>' + f.short.toUpperCase() + ' ]</span>';
                    pHTML += '<img src="' + f.image + '" class="portrait-img" alt="[' + f.short + ']">';
                    pHTML += '<div id="p-overlay-' + key + '" class="portrait-overlay" style="background-color: ' + mood.overlay + ';"></div>';
                    pHTML += '</div>';
                    pHTML += '<div class="portrait-name">' + displayPortraitName + '</div>';
                    pHTML += '<div id="p-seats-' + key + '" class="portrait-seats">' + f.seats + ' Delegates</div>';
                    pHTML += '<div id="p-mood-' + key + '" class="portrait-mood"><font color="' + mood.color + '"><b>' + mood.text + '</b></font></div>';
                    pHTML += '</td>';
                }
            }
            pHTML += '</tr></table>';
        }

        portraitsArea.innerHTML = pHTML;
        lastRenderedPortraitSignature = currentSignature;
    }

    checkAchievements();
    if (typeof updateWin95Taskbar === 'function') updateWin95Taskbar();
}

// Resolve [min, max] effect ranges into random values
function rollEffectRanges(eff) {
    const resolved = {};
    for (const key in eff) {
        const v = eff[key];
        if (Array.isArray(v) && v.length === 2) {
            const lo = Math.min(Number(v[0]), Number(v[1]));
            const hi = Math.max(Number(v[0]), Number(v[1]));
            resolved[key] = Math.floor(Math.random() * (hi - lo + 1)) + lo;
        } else if (typeof v === 'string' && v.includes('..')) {
            const parts = v.split(/\.+/).map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
            if (parts.length === 2) {
                const lo = Math.min(parts[0], parts[1]);
                const hi = Math.max(parts[0], parts[1]);
                resolved[key] = Math.floor(Math.random() * (hi - lo + 1)) + lo;
            } else {
                resolved[key] = parseInt(v, 10) || 0;
            }
        } else {
            resolved[key] = Number(v) || 0;
        }
    }
    return resolved;
}

// PC INCOME/SPEND DEBUG LOGGER
window.pcLog = [];
// Record a PC change in the PC log
function logPCChange(delta, reason) {
    if (!delta) return;
    window.pcLog.push({ turn: currentTurn, delta: delta, reason: reason, balanceAfter: stats.PC });
}
// Show the PC income and spend log
window.showPCLog = function() {
    console.log('--- Full PC Ledger ---');
    console.table(window.pcLog);
    const byTurn = {};
    window.pcLog.forEach(e => {
        byTurn[e.turn] = byTurn[e.turn] || { income: 0, spend: 0, net: 0 };
        if (e.delta > 0) byTurn[e.turn].income += e.delta;
        else byTurn[e.turn].spend += -e.delta;
        byTurn[e.turn].net += e.delta;
    });
    console.log('--- Per-Turn Income vs Spend ---');
    console.table(byTurn);
};

function applyMilitaryDelta(delta) {
    if (window.OppositionEngine) {
        OppositionEngine.applyMilitaryDelta(delta);
        return;
    }
    if (!factions['abri'] || !delta) return;
    factions['abri'].affinity = clampFaction('abri', factions['abri'].affinity + delta);
    stats.mil = Math.round(factions['abri'].affinity);
}

// Apply an effects object to stats and factions
function applyEffects(eff, updateSnapshot = true) {
    if (!eff) return;
    const advSnap = window.AdversaryEngine ? AdversaryEngine.beforeEffects() : null;
    if (updateSnapshot) prevStatsSnapshot = { ...stats };
    eff = rollEffectRanges(eff);

    if (eff.PC !== undefined) {
        const nextPC = clampPC(stats.PC + eff.PC);
        logPCChange(nextPC - stats.PC, 'effect');
        stats.PC = nextPC;
    }
    if (eff.pop !== undefined) stats.pop = clampDashboard('pop', stats.pop + eff.pop);
    if (eff.ref !== undefined) stats.ref = clampDashboard('ref', stats.ref + eff.ref);
    if (eff.econ !== undefined) stats.econ = clampDashboard('econ', stats.econ + eff.econ);
    if (eff.intl !== undefined) stats.intl = clampDashboard('intl', stats.intl + eff.intl);
    if (eff.stab !== undefined) stats.stab = clampDashboard('stab', stats.stab + eff.stab);
    if (eff.cendana !== undefined) stats.cendana = clampDashboard('cendana', stats.cendana + eff.cendana);

    const milDelta = (eff.abri !== undefined ? eff.abri : 0) + (eff.mil !== undefined ? eff.mil : 0);
    if (milDelta !== 0) {
        applyMilitaryDelta(milDelta);
    }

    for (const key in eff) {
        if (key === 'abri' || key === 'mil') continue;
        if (key.endsWith('_favor')) {
            const facKey = key.replace('_favor', '');
            if (factions[facKey] && !bannedFactions[facKey]) {
                factions[facKey].favor = (factions[facKey].favor || 0) + eff[key];
            }
        } else if (factions[key] && !bannedFactions[key]) {
            factions[key].affinity = clampFaction(key, factions[key].affinity + eff[key]);
        }
    }

    if (factions['abri']) {
        stats.mil = Math.round(factions['abri'].affinity);
    }
    if (advSnap) AdversaryEngine.afterEffects(advSnap);
}

// Show the credits screen
window.showCredits = function() {
    if (!enterMenuView()) return;
    scrollMainPanelToTop();
    let html = '<center><h2>CREDITS</h2></center>';
    html += '<div class="faction-summary" style="text-align: center; margin-bottom: 16px;">';

    if (creditsData && creditsData.main) {
        creditsData.main.forEach(line => { html += `<p>${line}</p>`; });
    } else {
        html += '<p>Credits data missing.</p>';
    }

    html += '</div>';
    html += '<center>';
    html += '<button style="width: 250px; text-align: center; margin-bottom: 8px;" onclick="showMusicCredits()">Music</button><br>';
    html += '<button style="width: 250px; text-align: center; margin-bottom: 8px;" onclick="showSfxCredits()">Sound Effects</button><br>';
    html += '<button style="width: 250px; text-align: center; margin-bottom: 8px;" onclick="showImageCredits()">Images &amp; Photography</button><br>';
    html += '<button style="width: 250px; text-align: center; margin-bottom: 8px;" onclick="showSources()">Historical Sources</button><br>';
    html += '</center>';

    const returnFunc = gameStarted ? (isActionPhase ? 'showActionMenu()' : 'renderEventMenu()') : 'showStartMenu()';
    html += `<center><button style="width: 250px; margin-top: 15px; background-color: #ff9999; text-align: center;" onclick="${returnFunc}">${gameStarted ? 'Back to Game' : 'Back'}</button></center>`;
    document.getElementById('main-panel').innerHTML = html;
};

// Show the sound effect credits
window.showSfxCredits = function() {
    scrollMainPanelToTop();
    let html = '<center><h2>SOUND EFFECTS</h2></center>';
    html += '<div class="faction-summary" style="text-align: left; margin-bottom: 20px;">';
    if (creditsData && creditsData.sfx) {
        creditsData.sfx.forEach(line => { html += `<p>${line}</p>`; });
    } else {
        html += '<p>Sound effects credits data missing.</p>';
    }
    html += '</div>';
    html += '<center><button style="width: 250px; background-color: #ff9999; text-align: center;" onclick="showCredits()">Back</button></center>';
    document.getElementById('main-panel').innerHTML = html;
};

// Show the image credits
window.showImageCredits = function() {
    scrollMainPanelToTop();
    let html = '<center><h2>IMAGES &amp; ARCHIVAL PHOTOGRAPHY</h2></center>';
    html += '<div class="faction-summary" style="text-align: left; margin-bottom: 20px;">';
    html += '<p><b>Press Archives, Photojournalism &amp; Visual Sources:</b></p><ul>';
    if (creditsData && creditsData.images) {
        creditsData.images.forEach(line => { html += `<li style="margin-bottom: 8px;">${line}</li>`; });
    } else {
        html += '<li>Image credits data missing.</li>';
    }
    html += '</ul></div>';
    html += '<center><button style="width: 250px; background-color: #ff9999; text-align: center;" onclick="showCredits()">Back</button></center>';
    document.getElementById('main-panel').innerHTML = html;
};

// Show the music credits
window.showMusicCredits = function() {
    scrollMainPanelToTop();
    let html = '<center><h2>MUSIC &amp; AUDIO</h2></center>';
    html += '<div class="faction-summary" style="text-align: left; margin-bottom: 20px;">';
    if (creditsData && creditsData.music) {
        creditsData.music.forEach(line => { html += `<p>${line}</p>`; });
    } else {
        html += '<p>Music credits data missing.</p>';
    }
    html += '</div>';
    html += '<center><button style="width: 250px; background-color: #ff9999; text-align: center;" onclick="showCredits()">Back</button></center>';
    document.getElementById('main-panel').innerHTML = html;
};

// Show the sources screen
window.showSources = function() {
    scrollMainPanelToTop();
    let html = '<center><h2>HISTORICAL SOURCES</h2></center>';
    html += '<div class="faction-summary" style="text-align: left; margin-bottom: 20px;">';
    html += '<p><b>Primary Memoirs, Academic Literature &amp; Archival Sources:</b></p><ul>';
    if (creditsData && creditsData.sources) {
        creditsData.sources.forEach(line => { html += `<li style="margin-bottom: 8px;">${line}</li>`; });
    } else {
        html += '<li>Sources data missing.</li>';
    }
    html += '</ul></div>';
    html += '<center><button style="width: 250px; background-color: #ff9999; text-align: center;" onclick="showCredits()">Back</button></center>';
    document.getElementById('main-panel').innerHTML = html;
};

// Expand or collapse the Effects settings card
window.toggleSettingsEffects = function() {
    const cb = document.getElementById('settings-effects-toggle');
    if (cb) {
        showOptionEffects = cb.checked;
        saveUserSettings();
    }
};

// Enable or disable the music player
window.toggleMusicEnabled = function() {
    const cb = document.getElementById('settings-music-toggle');
    if (cb) {
        musicEnabled = cb.checked;
        const player = document.querySelector('.music-player');
        const audio = document.getElementById('bg-music');

        if (musicEnabled) {
            if (player) player.style.display = 'block';
        } else {
            if (player) player.style.display = 'none';
            if (audio && !audio.paused) audio.pause();
        }
        window.syncMusicUI();
        saveUserSettings();
        showSettingsMenu(true);
    }
};

// Applies all three appearance settings to the page. Safe to call repeatedly.
window.applyAppearance = function() {
    const root = document.documentElement;
    root.setAttribute('data-wstyle', windowStyle);
    root.setAttribute('data-scheme', colorScheme);

    // Window style = one extra stylesheet appended after news.css (so it wins); Default Win95 has none
    let link = document.getElementById('theme-css');
    const href = WINDOW_STYLES[windowStyle] && WINDOW_STYLES[windowStyle].css;
    if (!href) {
        if (link) link.remove();
    } else {
        if (!link) {
            link = document.createElement('link');
            link.id = 'theme-css';
            link.rel = 'stylesheet';
            document.head.appendChild(link);
        }
        if (link.getAttribute('href') !== href) link.setAttribute('href', href);
    }

    // CRT scanlines are an overlay, independent of the two above
    const overlay = document.getElementById('crt-overlay');
    if (overlay) {
        overlay.style.display = crtEnabled ? 'block' : 'none';
        overlay.style.opacity = crtIntensity / 100;
    }

    // The other effects are pure CSS: data-fx lists the active ones (see css/effects.css)
    const active = EFFECTS.filter(e => isEffectOn(e.id)).map(e => e.id);
    if (active.length) root.setAttribute('data-fx', active.join(' '));
    else root.removeAttribute('data-fx');
};

// Whether an effect is switched on
window.isEffectOn = function(id) {
    return id === 'crt' ? crtEnabled : Boolean(effectsOn[id]);
};

// Turn one effect on or off and apply it
window.setEffect = function(id, on) {
    if (id === 'crt') crtEnabled = Boolean(on);
    else if (Object.prototype.hasOwnProperty.call(effectsOn, id)) effectsOn[id] = Boolean(on);
    else return;
    applyAppearance();
    saveUserSettings();
    showSettingsMenu(true);
};

// Master switch: every effect on, or every effect off
window.setAllEffects = function(on) {
    crtEnabled = Boolean(on);
    Object.keys(effectsOn).forEach(k => { effectsOn[k] = Boolean(on); });
    applyAppearance();
    saveUserSettings();
    showSettingsMenu(true);
};

// Choose a window style and apply it
window.setWindowStyle = function(id) {
    if (!WINDOW_STYLES[id]) return;
    windowStyle = id;
    applyAppearance();
    saveUserSettings();
    showSettingsMenu(true);
};

// Choose a color scheme and apply it
window.setColorScheme = function(id) {
    if (!COLOR_SCHEMES[id]) return;
    colorScheme = id;
    applyAppearance();
    saveUserSettings();
    showSettingsMenu(true);
};

// Turn CRT scanlines on or off
window.setCRT = function(on) { setEffect('crt', on); };

// Apply the CRT intensity slider
window.updateCRTIntensity = function() {
    const slider = document.getElementById('crt-slider');
    const display = document.getElementById('crt-display');
    const overlay = document.getElementById('crt-overlay');
    if (slider && overlay) {
        crtIntensity = Number(slider.value);
        overlay.style.opacity = crtIntensity / 100;
        if (display) display.innerText = crtIntensity + '%';
        saveUserSettings();
    }
};

// Apply the volume slider to the music
window.updateVolume = function() {
    const slider = document.getElementById('volume-slider');
    const audio = document.getElementById('bg-music');
    const display = document.getElementById('volume-display');
    if (slider && audio) {
        audio.volume = slider.value / 100;
        window.volumeUserSet = true;
        if (display) display.innerText = slider.value + '%';
        saveUserSettings();
    }
};

// Apply the text size setting to the page
function applyTextScale(scaleValue) {
    textScale = Number(scaleValue);
    const scale = textScale / 100;

    let style = document.getElementById('dynamic-text-scale');
    if (!style) {
        style = document.createElement('style');
        style.id = 'dynamic-text-scale';
        document.head.appendChild(style);
    }

    style.innerHTML = `
        .stat-label, .stat-value, .portrait-seats, .portrait-mood { font-size: ${Math.round(12 * scale)}px !important; }
        .update-notice-body { font-size: ${Math.round(14 * scale)}px !important; }
        .left-tab-btn, .music-header, .coffee-btn, .toast-title { font-size: ${Math.round(13 * scale)}px !important; }
        #main-panel button, #left-panel button, #mpr-dashboard button, .portrait-name, .achievement-desc { font-size: ${Math.round(14 * scale)}px !important; }
        .faction-summary, #custom-alert-message, .achievement-title, #main-panel p, #left-panel p { font-size: ${Math.round(15 * scale)}px !important; line-height: 1.7 !important; }
        #main-panel > div:not(.tally-box):not(#speed-controls-container) { font-size: ${Math.round(15 * scale)}px !important; line-height: 1.7 !important; }
        #main-panel font[size="2"], #mpr-dashboard font[size="2"] { font-size: ${Math.round(13 * scale)}px !important; }
        #main-panel font[size="3"], #mpr-dashboard font[size="3"] { font-size: ${Math.round(17 * scale)}px !important; }
        #main-panel font[size="4"], #mpr-dashboard font[size="4"] { font-size: ${Math.round(19 * scale)}px !important; }
        #main-panel h2 { font-size: ${Math.round(24 * scale)}px !important; }
        #main-panel h3 { font-size: ${Math.round(18 * scale)}px !important; }
        .pc-display { font-size: ${Math.round(22 * scale)}px !important; }
    `;
}

// Apply the text size slider
window.updateTextScale = function() {
    const slider = document.getElementById('text-scale-slider');
    const display = document.getElementById('text-scale-display');
    if (slider) {
        applyTextScale(slider.value);
        if (display) display.innerText = textScale + '%';
        saveUserSettings();
    }
};

// Show a page of the history screen
window.showHistory = function(pageIndex) {
    clearTallyInterval();
    scrollMainPanelToTop();
    if (!historyPages || historyPages.length === 0) {
        showCustomAlert("Error: history.json not loaded.", showStartMenu);
        return;
    }

    const pageData = historyPages[pageIndex];
    const pageText = typeof pageData === 'string' ? pageData : pageData.text;
    const pageTitle = (typeof pageData === 'object' && pageData.title)
        ? pageData.title
        : `Chapter ${pageIndex + 1} of ${historyPages.length}`;
    const pageImg = (typeof pageData === 'object' && pageData.image) ? pageData.image : null;

    let html = '<center><h2>HOW DID IT COME TO THIS?</h2></center>';

    const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
    html += '<div style="text-align: center; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid #808080;">';
    html += '<span style="font-size: 11px; font-weight: bold; color: #000080; margin-right: 6px;">CHAPTER:</span>';
    for (let i = 0; i < historyPages.length; i++) {
        const isCur = (i === pageIndex);
        const label = romanNumerals[i] || (i + 1);
        const chapTitleAttr = escapeAttr((typeof historyPages[i] === 'object' && historyPages[i].title) ? historyPages[i].title : `Chapter ${i + 1}`);
        html += `<button class="${isCur ? 'is-selected' : ''}" title="${chapTitleAttr}" style="width: 34px; display: inline-block; text-align: center; --py: 3px; --px: 0; margin: 2px; font-size: 11px; " onclick="showHistory(${i})">${label}</button>`;
    }
    html += '</div>';

    html += `<h3 style="text-align: center; color: #000080; margin-bottom: 12px;">${pageTitle}</h3>`;

    if (pageImg) {
        html += `<center><img src="${pageImg}" class="content-image" style="width: 400px; height: 200px; object-fit: cover; border: 3px inset #FFFFFF; background-color: #A9A9A9; margin-bottom: 15px;" alt="${escapeAttr(pageTitle)}"></center>`;
    }

    html += '<div class="faction-summary" style="padding: 15px; margin-bottom: 12px; min-height: 220px;">' + pageText + '</div>';

    html += '<div style="text-align: center; margin-top: 10px;">';
    if (pageIndex > 0) {
        html += `<button style="width: 130px; text-align: center; display: inline-block; margin-right: 10px; " onclick="showHistory(${pageIndex - 1})">Previous</button>`;
    }
    html += `<span style="font-size: 12px; font-weight: bold; color: #333; margin: 0 8px;">${pageIndex + 1} / ${historyPages.length}</span>`;
    if (pageIndex < historyPages.length - 1) {
        html += `<button style="width: 130px; text-align: center; display: inline-block; margin-left: 10px; " onclick="showHistory(${pageIndex + 1})">Next</button>`;
    }
    html += '</div>';

    html += '<center><button style="width: 250px; text-align: center; margin-top: 16px; background-color: #ff9999; " onclick="showStartMenu()">Back</button></center>';
    document.getElementById('main-panel').innerHTML = html;
};

// Show a page of the tutorial
window.showTutorial = function(pageIndex) {
    clearTallyInterval();
    scrollMainPanelToTop();
    if (!tutorialPages || tutorialPages.length === 0) {
        showCustomAlert("Error: tutorial.json not loaded.", showStartMenu);
        return;
    }

    const pageData = tutorialPages[pageIndex];
    const pageText = typeof pageData === 'string' ? pageData : pageData.text;
    const pageTitle = (typeof pageData === 'object' && pageData.title)
        ? pageData.title
        : `Topic ${pageIndex + 1} of ${tutorialPages.length}`;

    let html = '<center><h2>HOW TO PLAY</h2></center>';

    const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
    html += '<div style="text-align: center; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid #808080;">';
    html += '<span style="font-size: 11px; font-weight: bold; color: #000080; margin-right: 6px;">HELP TOPIC:</span>';
    for (let i = 0; i < tutorialPages.length; i++) {
        const isCur = (i === pageIndex);
        const label = romanNumerals[i] || (i + 1);
        const topTitle = escapeAttr((typeof tutorialPages[i] === 'object' && tutorialPages[i].title) ? tutorialPages[i].title : `Topic ${i + 1}`);
        html += `<button class="${isCur ? 'is-selected' : ''}" title="${topTitle}" style="width: 36px; display: inline-block; text-align: center; --py: 3px; --px: 0; margin: 2px; font-size: 11px; " onclick="showTutorial(${i})">${label}</button>`;
    }
    html += '</div>';

    html += `<h3 style="text-align: center; color: #000080; margin-bottom: 12px;">${pageTitle}</h3>`;
    html += '<div class="faction-summary" style="padding: 15px; margin-bottom: 12px; min-height: 220px;">' + pageText + '</div>';

    html += '<div style="text-align: center; margin-top: 10px;">';
    if (pageIndex > 0) {
        html += `<button style="width: 130px; text-align: center; display: inline-block; margin-right: 10px; " onclick="showTutorial(${pageIndex - 1})">Previous</button>`;
    }
    html += `<span style="font-size: 12px; font-weight: bold; color: #333; margin: 0 8px;">${pageIndex + 1} / ${tutorialPages.length}</span>`;
    if (pageIndex < tutorialPages.length - 1) {
        html += `<button style="width: 130px; text-align: center; display: inline-block; margin-left: 10px; " onclick="showTutorial(${pageIndex + 1})">Next</button>`;
    }
    html += '</div>';

    html += '<center><button style="width: 250px; text-align: center; margin-top: 16px; background-color: #ff9999; " onclick="showStartMenu()">Back</button></center>';
    document.getElementById('main-panel').innerHTML = html;
};

// Switch the game language (locked to English)
window.setLanguage = async function(lang) {
    if (lang !== 'en' || currentLang === lang) return;
    currentLang = 'en';
    saveUserSettings();
    await loadLocalizedAssets();
    updateUI();
    showStartMenu();
};

// Build the HTML for one update or announcement entry
function renderUpdateEntry(u, isID) {
    const versionLabel = isID ? 'Versi' : 'Version';
    const meta = [u.version ? `${versionLabel} <b>${u.version}</b>` : '', u.date || ''].filter(Boolean).join(' &bull; ');

    let html = '<div class="update-entry">';
    if (meta) html += `<div class="update-notice-meta">${meta}</div>`;
    if (u.title) html += `<div class="update-notice-heading">${u.title}</div>`;
    html += '<ul>' + u.notes.map(n => `<li>${n}</li>`).join('') + '</ul>';
    html += '</div>';
    return html;
}

// updates.json can be a list (newest first) or a single update object
function renderUpdateNotice(isID) {
    const raw = Array.isArray(updatesData) ? updatesData : (updatesData ? [updatesData] : []);
    const list = raw.filter(u => u && Array.isArray(u.notes) && u.notes.length > 0);
    if (list.length === 0) return '';

    const heading = isID ? 'Pembaruan Terbaru' : "What's New";
    const olderLabel = isID ? 'Pembaruan sebelumnya' : 'Previous updates';

    let html = '<div class="update-notice">';
    html += `<div class="update-notice-title">${heading}</div>`;
    html += '<div class="update-notice-body">';
    html += renderUpdateEntry(list[0], isID);
    if (list.length > 1) {
        html += `<details class="update-older"><summary>${olderLabel} (${list.length - 1})</summary>`;
        html += list.slice(1).map(u => renderUpdateEntry(u, isID)).join('');
        html += '</details>';
    }
    html += '</div></div>';
    return html;
}

// Render the main menu
window.showStartMenu = function() {
    clearTallyInterval();
    scrollMainPanelToTop();
    const savedRun = hasSavedCampaign();
    const isID = (currentLang === 'id');

    const btnStyle = 'width: 280px; text-align: center; margin-bottom: 8px; --py: 10px; --px: 10px;';

    const titleImg = (gameConfig && gameConfig.titleBannerImage) ? gameConfig.titleBannerImage : 'photo/title_banner.png';
    let html = `<div class="title-screen-banner">
        <div class="title-screen-banner-placeholder-text">
            Why did it break nya.... :(<br>
            <span style="font-size: 11px; font-weight: normal;">Kenapa gk bekerja ya?? :(((</span>
        </div>
        <img src="${titleImg}" alt="[Title Banner]" onerror="this.style.display='none'">
    </div>`;
    html += '<div class="start-menu-layout">';

    // LEFT: update / announcement box
    html += `<div class="start-menu-left">${renderUpdateNotice(isID)}</div>`;

    // RIGHT: buttons (kept as a <center> so debug.js can still attach its button here)
    html += '<center class="start-menu-right">';

    if (savedRun) {
        const savedTurn = savedRun.currentTurn || 1;
        const savedDate = (events[savedTurn - 1] && events[savedTurn - 1].date) ? events[savedTurn - 1].date : `Turn ${savedTurn}`;
        const savedPhase = savedRun.isActionPhase
            ? (isID ? 'Fase Aksi Politik' : 'Action Phase')
            : (isID ? 'Krisis Nasional' : 'Crisis Event');
        const contLabel = isID ? 'Lanjutkan Permainan' : 'Continue Game';
        const turnWord = isID ? 'Giliran' : 'Turn';
        html += `<button style="width: 280px; text-align: center; margin-bottom: 10px; --py: 10px; --px: 10px; background-color: #d0e8d0; color: #004d00;" onclick="continueSavedCampaign()">${contLabel}<br><span style="font-size: 11px; font-weight: normal; color: #222;">(${turnWord} ${savedTurn} / ${events.length} &bull; ${savedDate} &bull; ${savedPhase})</span></button><br>`;
    }

    const playLabel = savedRun
        ? (isID ? 'Permainan Baru' : 'New Game')
        : (isID ? 'Main' : 'Play');
    const tutLabel = isID ? 'Cara bermain' : 'How to play';
    const histLabel = isID ? 'Bagaimana bisa sampai begini?' : 'How did it come to this?';
    const savesLabel = isID ? 'Permainan Tersimpan' : 'Saved Games';

    html += `<button style="${btnStyle}" onclick="showDifficultyMenu()">${playLabel}</button><br>`;
    html += `<button style="${btnStyle}" onclick="showSaveGames()">${savesLabel}</button><br>`;
    html += `<button style="${btnStyle}" onclick="showTutorial(0)">${tutLabel}</button><br>`;
    html += `<button style="${btnStyle}" onclick="showHistory(0)">${histLabel}</button><br>`;

    // Menus that used to be reachable only from the in-game sidebar
    html += `<button style="${btnStyle}" onclick="showLibraryMenu()">Library</button><br>`;
    html += `<button style="${btnStyle}" onclick="showAchievementsMenu()">Achievements</button><br>`;
    html += `<button style="${btnStyle}" onclick="showSettingsMenu()">Settings</button><br>`;
    html += `<button style="${btnStyle}" onclick="showCredits()">Credits</button><br>`;

    const enActive = !isID;
    const idActive = isID;
    html += `<div style="width: 280px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 6px;">
        <button class="is-selected" style="width: 100%; margin-bottom: 0; --py: 6px; --px: 4px; font-size: 11px; text-align: center;" onclick="setLanguage('en')">English</button>
        <button disabled title="Bahasa Indonesia unnavailable." style="width: 100%; margin-bottom: 0; --py: 6px; --px: 4px; font-size: 11px; text-align: center; background-color: #ff9999; color: #660000; text-shadow: none; cursor: not-allowed; opacity: 0.85;">Bahasa Indonesia</button>
    </div>`;
    

    html += '</center></div>';
    html += '<div style="min-height: 80px;"></div>';
    document.getElementById('main-panel').innerHTML = html;
};

// Render the difficulty selection menu
window.showDifficultyMenu = function() {
    scrollMainPanelToTop();
    let html = '<center><h2>SELECT DIFFICULTY</h2></center>';
    html += '<div style="text-align:center; margin-bottom: 15px;">';
    ['easy', 'medium', 'high', 'historical'].forEach(diff => {
        const def = gameConfig.difficultySettings[diff];
        const color = diff === 'historical' ? '#8B0000' : '#000000';
        html += `<button class="${diff === selectedDifficulty ? 'is-selected' : ''}" style="width: 100px; color: ${color}; display:inline-block; margin: 0 5px;" onclick="selectDifficulty('${diff}')"><center>${def.name}</center></button>`;
    });
    html += '</div>';

    const selDef = gameConfig.difficultySettings[selectedDifficulty];
    if (selDef.image) {
        html += `<center><img src="${selDef.image}" class="content-image" style="width: 400px; height: 200px; object-fit: cover; border: 3px inset #FFFFFF; background-color: #A9A9A9; margin-bottom: 15px;" alt="${escapeAttr(selDef.name)} Difficulty"></center>`;
    }

    html += '<div style="padding: 10px; background-color: #FFFFFF; border: none; margin-bottom: 15px; font-family: MS Sans Serif; font-size: 13px; line-height: 1.4; text-align: justify;">';
    html += `${selDef.description}</div>`;

    const toggleDisabled = selectedDifficulty === 'historical' ? 'disabled' : '';
    const toggleChecked = (showOptionEffects && selectedDifficulty !== 'historical') ? 'checked' : '';
    const toggleStyle = selectedDifficulty === 'historical' ? 'color: #888;' : 'color: #000;';

    html += `<div style="text-align:center; margin-bottom: 25px; font-family: MS Sans Serif; font-size: 12px; ${toggleStyle}">`;
    html += `<label style="cursor: pointer;"><input type="checkbox" id="effects-toggle" ${toggleChecked} ${toggleDisabled} onchange="toggleEffects()"> Enable Outcome Forecast Tooltips (Unavailable in Historical)</label>`;
    html += `</div>`;

    html += '<center><button style="width: 250px; font-size: 14px; --py: 10px; --px: 10px; text-align: center;" onclick="showSituation()">Continue</button></center>';
    html += '<center><button style="width: 250px; margin-top: 10px; background-color: #ff9999; text-align: center;" onclick="showStartMenu()">Back</button></center>';
    document.getElementById('main-panel').innerHTML = html;
};

// Render the opening situation briefing
window.showSituation = function() {
    scrollMainPanelToTop();
    let html = '<center><h2>THE SITUATION</h2></center>';
    if (gameConfig && gameConfig.situationImage) {
        html += `<center><img src="${gameConfig.situationImage}" class="content-image" style="width: 400px; height: 200px; object-fit: cover; border: 3px inset #FFFFFF; background-color: #A9A9A9; margin-bottom: 15px;" alt="The Situation"></center>`;
    }
    html += '<div style="padding: 15px; margin-bottom: 20px; font-family: MS Sans Serif, sans-serif; font-size: 13px; line-height: 1.6; color: #333; text-align: justify;">';
    html += '<b>Dear Mr. President,</b><br><br>';
    html += 'The regime that ruled Indonesia for 32 years did not fall so much as it rotted through and gutted in the span of months by the <font color="#B22222"><b>Asian Financial Crisis</b></font> that hit in July 1997. On May 12, 1998, soldiers and police opened live rounds into a crowd of retreating Trisakti University students. <font color="#B22222"><b>Four were shot dead</b></font> in a university parking lot. They are <b>Elang Mulia Lesmana</b>, <b>Hery Hartanto</b>, <b>Hafidin Royan</b>, and <b>Hendriawan Sie</b>, none of them were armed, and all of them were shot dead within sight of their own campus gate.<br><br>';
    html += 'For three days Jakarta, Medan, and Surakarta burned. Mobs formed spontaneously on the streets, whereas some others were trucked in and were a lot more unsettlingly organized. They torched more than 4,000 shops and homes, most of them belonging to <b>ethnic Chinese-Indonesians</b> publicly scapegoated for the crisis by both government officials deflecting the blame, and class resentment from the native population. People were trapped inside burning malls as the exits were blocked from outside; an upward of a thousand of the dead burned alive, many of them looters caught in fires they helped set. Chinese Indonesian women and girls were hunted down in their own homes and gang-raped in front of their families in numbers investigators place at close to 400 in Jakarta alone over those 3 days. Some mutilated afterward, <font color="#B22222"><b><u>not one perpetrator was ever convicted.</u></b></font> On May 18, students broke through the gates of the MPR/DPR complex and refused to leave until Suharto resigned. Three days later, at nine in the morning on May 21, 1998, he did. Within the hour, you, Bacharuddin Jusuf Habibie, a German-trained aeronautical engineer and Suharto\'s own handpicked protege, were sworn in as the third President of the Republic by the Chief Justice, inheriting a government most foreign observers gave little chance of surviving the year.<br><br>';
    html += 'You inherited a currency in freefall and an economy being flayed alive in real time. The rupiah, worth roughly 2,400 to the US dollar before the crisis, had cratered to nearly 16,800 by mid-1998, a collapse of almost 85% that liquidated savings accounts overnight, bankrupted every import-dependent business in the archipelago, and forced Jakarta back to the <font color="#004C97"><b>IMF</b></font>, hat in hand, for a fourth bailout. Inflation tore past 60%. Cooking oil, rice, and medicine climbed out of reach for families who had spent a decade climbing into the middle class, and millions were shoved back into poverty inside a single year, the worst economic collapse Southeast Asia had seen in a generation, and you were the one left holding it.<br><br>';
    html += 'In response, your nearly 13 months in office produced a pace of change the old regime would have crushed in its crib. You emptied prisons of political detainees held for years without ever facing a charge. You abolished the SIUPP licensing system that let a single minister shutter any newspaper on a whim, and let 48 parties register for a multi-party election the country had not held since 1955. You lifted the military\'s Darurat Operasi Militer (DOM) designation over Aceh and stood in Banda Aceh yourself to apologize, in person, for decades of army abuses whose mass graves were still being dug up as you spoke. And in January 1999, you agreed to let East Timor choose between autonomy and outright independence, a step so radical that no one in the New Order would have dared float it, let alone survive attempting it.<br><br>';
    html += 'It is now June 1999. On the seventh of the month, more than 105 million voters turned out for the first free national election since 1955, and the count is not kind to you. <font color="#C0392B"><b>Megawati Sukarnoputri\'s PDI-P</b></font> has swept to a commanding plurality with roughly a third of the vote, and her red-shirted supporters are dancing in the streets, openly declaring the New Order dead and your presidency buried alongside it. The rupiah has clawed its way back to somewhere near 6,000 to 7,000 to the dollar, a shadow of its former strength, still one bad headline away from another slide into the abyss it just climbed out of.<br><br>';
    html += 'None of the old wounds have closed, unfortunately, they have only scabbed over badly. In <font color="#FF0000"><b>Aceh</b></font>, GAM insurgents and army units are trading fire again despite your apology, and bodies are still turning up in rivers from operations everyone insists have stopped. In <font color="#FF0000"><b>East Timor</b></font>, pro-integration militias armed and shielded by local ABRI commanders are terrorizing the countryside ahead of the August 30 referendum you promised the world would be free and fair. And in the barracks, General Wiranto\'s officers watch you the way a creditor watches a debtor who has started asking too many questions. Uneasy that a president who never won a single vote for the office he holds might trade away the military\'s political privileges, its economic empire, or its immunity for 30 years of buried sins just to keep himself alive politically a few months longer.<br><br>';
    html += 'You have perhaps four months. In 19 October, all 700 delegates of the People\'s Consultative Assembly (MPR) will convene in Senayan to hear and vote on your <i>Pidato Pertanggungjawaban</i>. The banyan tree that has shaded, and strangled, Indonesian politics for 32-years is dying with its roots still tangled through every institution in the country. What grows in its place, and whether you are still standing to see it, is not yet decided.';
    html += '</div>';

    html += '<center>';
    html += '<button style="width: 300px; text-align: center; margin-bottom: 8px; --py: 10px; --px: 10px;" onclick="startGame()">My country is burning...</button><br>';
    html += '<button style="width: 300px; text-align: center; background-color: #ff9999; --py: 10px; --px: 10px;" onclick="showDifficultyMenu()">Back</button>';
    html += '</center>';
    document.getElementById('main-panel').innerHTML = html;
};

// Select a difficulty and refresh the menu
window.selectDifficulty = function(diff) {
    selectedDifficulty = diff;
    if (diff === 'historical') showOptionEffects = false;
    saveUserSettings();
    showDifficultyMenu();
};

// Toggle whether option effects are shown
window.toggleEffects = function() {
    const cb = document.getElementById('effects-toggle');
    if (cb) {
        showOptionEffects = cb.checked;
        saveUserSettings();
    }
};

// Reset state and begin a new campaign
window.startGame = function() {
    clearTallyInterval();
    startBackgroundMusic();
    const def = gameConfig.difficultySettings[selectedDifficulty];

    clearCampaignSave();

    currentTurn = 1;
    globalMalus = 0;
    activeDecrees = {};
    bannedFactions = {};
    completedInteractions = {};
    actionCooldowns = {};
    actionUsageCount = {};
    turnExecutiveUsed = false;
    turnFactionUsed = false;
    prevStatsSnapshot = null;
    lastRenderedPortraitSignature = "";
    minStats = { pop: 0, mil: 0, ref: 0, econ: 0, intl: 0, stab: 0 };
    maxCendana = 100;
    minFactions = {};
    window.tallySpeed = (window.extraSettings && window.extraSettings.defaultTallySpeed) || 1;
    window.wirantoLocked = true;
    window.wirantoStrain = 0;
    window.pcLog = [];
    window.lastElectionSummary = null;
    window.electionPanelSnapshot = null;
    window.resolvedEventTurn = 0;
    window.horseTradeCounts = {};
    window.lastHorseTradeTicker = "";
    window.inFinalFloorPhase = false;

    factions = deepClone(initialFactionsSnapshot);
    portraitFactions = [...INITIAL_PORTRAIT_FACTIONS];
    events.forEach(ev => { delete ev.shuffledIndices; });

    stats.PC = clampPC(def.pc);
    stats.pop = clampDashboard('pop', 30 + def.statMod);
    stats.mil = clampDashboard('mil', 35 + def.statMod);
    stats.ref = clampDashboard('ref', 40 + def.statMod);
    stats.econ = clampDashboard('econ', 20 + def.statMod);
    stats.intl = clampDashboard('intl', 30 + def.statMod);
    stats.stab = clampDashboard('stab', 25 + def.statMod);
    stats.cendana = clampDashboard('cendana', def.cendana);

    for (const key in factions) {
        factions[key].affinity = clampFaction(key, factions[key].affinity + def.statMod);
        factions[key].favor = 0;
        if (key === 'abri') factions[key].affinity = 50;
    }

    if (factions['abri']) stats.mil = Math.round(factions['abri'].affinity);

    lowestGovStability = getGovStability();
    bankBaliCleanSteps = {};
    timorPromiseSteps = {};
    sp3UpheldWithHighCendana = false;
    helpedRaisSpeaker = false;
    if (window.AdversaryEngine) AdversaryEngine.reset();

    gameStarted = true;
    syncSidebarVisibility();
    updateUI();
    loadPhase();
};

// Show Habibie's biography
window.showHabibieBio = function() {
    if (!enterMenuView()) return;
    scrollMainPanelToTop();
    let html = '<h2>B.J. Habibie</h2>';
    if (gameConfig && gameConfig.habibieCoverImage) {
        html += `<center><img src="${gameConfig.habibieCoverImage}" class="content-image" style="width: 400px; height: 200px; object-fit: cover; border: 3px inset #FFFFFF; background-color: #A9A9A9; margin-bottom: 15px;" alt="B.J. Habibie"></center>`;
    }
    html += '<div class="faction-summary"><p>Bacharuddin Jusuf Habibie was born on June 25, 1936, in Parepare, South Sulawesi, the fourth of eight children in a family of Gorontalese and Bugis descent. His father, an agricultural official, died of a heart attack in 1950 when Habibie was just 14, and his mother sold off family land to keep him in school. After a year studying mechanical engineering at Bandung Institute of Technology, he won a government scholarship in 1955 to study aviation in Europe. He had hoped to attend Delft in the Netherlands, but the ongoing dispute between Jakarta and The Hague over West New Guinea made that impossible, and he was redirected instead to RWTH Aachen in West Germany, where he would spend the next decade of his life.</p><p>Living on a strict budget through brutal German winters, Habibie earned his Diplom-Ingenieur in 1960 and his doctorate in 1965, graduating summa cum laude with a dissertation so highly rated it became something of a legend at the university. He joined the aircraft manufacturer Messerschmitt-Bolkow-Blohm, rising over the following years to vice president and head of its technology division. There he developed pioneering methods for calculating how cracks propagate through aircraft fuselages under structural stress, work still referenced in aviation engineering today and the origin of his lifelong nickname, Mr. Crack. In 1974, Suharto sent an emissary to Aachen to summon him home, and Habibie returned to lead Indonesia\'s fledgling aircraft industry, founding what would become PT Industri Pesawat Terbang Nusantara, IPTN, in 1976.</p><p>For the next two decades, from 1978 to 1998, he served as State Minister of Research and Technology, using that post and his chairmanship of the government\'s technology and strategic industries agencies to build an entire generation of Indonesian engineers and pour state funding into ambitious, sometimes extravagant projects, most famously the N-250 turboprop, which he watched fly for the first time on August 10, 1995, as living proof that Indonesia could compete with the developed world on its own terms. In 1990 he founded the Association of Indonesian Muslim Intellectuals, ICMI, with Suharto\'s blessing, and it quickly became both a genuine incubator for modernist Muslim technocrats and a political base that reached far beyond the world of engineering. Suharto named him Vice President on March 10, 1998, a choice international investors and reform activists alike treated with open skepticism. Barely ten weeks later, as the Asian Financial Crisis gutted the rupiah and students occupied the grounds of the DPR building demanding an end to three decades of authoritarian rule, Suharto resigned on May 21, 1998, and Habibie was sworn in as president that same afternoon, inheriting a government he had spent twenty years helping to build and now found himself tasked with dismantling from the inside, stabilizing an economy in freefall, and defending a mandate that neither the old guard nor the secular nationalist opposition ever fully accepted as legitimate.</p></div>';

    html += '<button style="background-color: #ff9999; text-align: center;" onclick="returnToPreviousView()">Back</button>';
    document.getElementById('main-panel').innerHTML = html;
};

// Show a faction's biography
window.showFactionBio = function(factionKey) {
    scrollMainPanelToTop();
    const f = factions[factionKey];
    let html = '<h2> ' + f.name + '</h2>';
    if (f.coverImage) {
        html += `<center><img src="${f.coverImage}" class="content-image" style="width: 400px; height: 200px; object-fit: cover; border: 3px inset #FFFFFF; background-color: #A9A9A9; margin-bottom: 15px;" alt="${escapeAttr(f.name)} Biography"></center>`;
    }
    html += '<div class="faction-summary">' + f.biography + '</div>';
    html += '<button style="background-color: #ff9999; text-align: center;" onclick="openFactionMenu(\'' + factionKey + '\')">Back</button>';
    document.getElementById('main-panel').innerHTML = html;
};

// Readable text colors paired with FACTION_HISTORICAL_COLORS swatches
const FACTION_TEXT_COLORS = {
    'pdip':            '#9E1F14',
    'utusan_golongan': '#555555',
    'pkb':             '#005500',
    'poros_tengah':    '#004488',
    'ppp':             '#1E6840',
    'other_parties':   '#006068',
    'utusan_daerah':   '#555555',
    'golkar_habibie':  '#8A5A00',
    'golkar_akbar':    '#7D6000',
    'abri':            '#3E5022'
};

// Decrees that change MPR composition, ban parties or rewrite rules are locked after the Accountability Speech
const POST_SPEECH_LOCKED_DECREES = new Set([
    'abolish_abri_mpr_seats',
    'dissolve_golkar_old_guard',
    'ban_pdip_subversion',
    'enforce_asas_tunggal_ban',
    'purge_utusan_golongan',
    'direct_presidential_amendment',
    'regional_autonomy',
    'maluku_irja_division',
    'civil_service_neutrality',
    'invoke_supersemar_ii',
    'cendana_restoration_pact'
]);

// Horse-trading fatigue counts and the last ticker message
window.horseTradeCounts = window.horseTradeCounts || {};
window.lastHorseTradeTicker = "";

// Turn number of the Accountability Speech
function getSpeechTurnNumber() {
    if (!events || events.length === 0) return 20;
    const idx = events.findIndex(e => e.id === 'ev_the_speech');
    return idx >= 0 ? (idx + 1) : Math.max(1, events.length - 2);
}

// True from the Accountability Speech (Oct 14) onward — locks seat decrees & non-final faction actions
function isPastAccountabilitySpeech() {
    return gameStarted && currentTurn >= getSpeechTurnNumber();
}

// True ONLY during the "Night of the Long Knives" (ev_eve_of_vote, Oct 18) turn
function isNightOfLongKnivesTurn() {
    if (!gameStarted || !events || currentTurn < 1 || currentTurn > events.length) return false;
    const ev = events[currentTurn - 1];
    return Boolean(ev && ev.id === 'ev_eve_of_vote');
}

// Senayan floor assessment is visible only from the Night of the Long Knives turn until the hide turn
const SENAYAN_ASSESSMENT_HIDE_TURN = 23;

// Turn number of the Night of the Long Knives
function getLongKnivesTurnNumber() {
    if (!events || events.length === 0) return Infinity;
    const idx = events.findIndex(e => e.id === 'ev_eve_of_vote');
    return idx >= 0 ? (idx + 1) : events.length;
}

// Whether the Senayan floor assessment is currently shown
function isSenayanAssessmentVisible() {
    return Boolean(gameStarted) &&
        currentTurn >= getLongKnivesTurnNumber() &&
        currentTurn < SENAYAN_ASSESSMENT_HIDE_TURN;
}

// Whether a decree is locked because the MPR has already convened
function isDecreeLockedBySession(decree) {
    if (!isPastAccountabilitySpeech() || !decree) return false;
    if (Array.isArray(decree.banFactions) && decree.banFactions.length > 0) return true;
    if (decree.seatChanges || decree.seatRecipients) return true;
    return POST_SPEECH_LOCKED_DECREES.has(decree.id);
}

// Hide a decree until the event named in its unlockEvent field is reached
function isDecreeEventUnlocked(decree) {
    if (!decree || !decree.unlockEvent) return true;
    if (!gameStarted || !events) return false;
    const idx = events.findIndex(e => e.id === decree.unlockEvent);
    if (idx < 0) return true;
    return currentTurn >= (idx + 1);
}

// Check a decree's faction-loyalty requirements, waiving factions that were banned or merged away
function getDecreeFactionReqFailures(decree) {
    const fails = [];
    if (window.AdversaryEngine) AdversaryEngine.getDecreeGateFailures(decree).forEach(r => fails.push(r));
    if (!decree || !Array.isArray(decree.reqFactions)) return fails;
    decree.reqFactions.forEach(req => {
        const f = factions[req.key];
        if (!f || f.seats <= 0 || bannedFactions[req.key]) return;
        const op = req.op || '>=';
        const ok = (op === '<=') ? (f.affinity <= req.val) : (f.affinity >= req.val);
        if (ok) return;
        const label = EFFECT_DISPLAY_NAMES[req.key] || req.key;
        const tier = getMoodData(req.key, req.val).text;
        fails.push(op === '<='
            ? `Requires ${label} to fall to '${tier}' or lower.`
            : `Requires ${label} to reach at least '${tier}'.`);
    });
    return fails;
}

// Renders a color-coded faction pill with its historical party swatch (No leader names in parentheses, no stance text)
function renderColorCodedFactionTag(factionKey) {
    const f = factions[factionKey];
    if (!f) return '';
    const col = FACTION_HISTORICAL_COLORS[factionKey] || { fill: '#808080' };
    const textCol = FACTION_TEXT_COLORS[factionKey] || '#111111';
    const cleanPartyName = (typeof stripLeaderParentheses === 'function')
        ? stripLeaderParentheses(f.name)
        : String(f.name).replace(/\s*\([^)]*\)/g, '').trim();

    return `<span class="faction-color-tag">
        <span class="faction-color-swatch" style="background-color: ${col.fill};"></span>
        <b style="color: ${textCol};">${cleanPartyName}</b>
    </span>`;
}

// Spend 1 PC (or 5 PC) to slightly nudge a faction's goodwill ONLY during Night of the Long Knives
window.lobbyDelegatesWithPC = function(factionKey, pcToSpend = 1, returnView = 'action') {
    if (!gameStarted || !isActionPhase || !isNightOfLongKnivesTurn()) return;
    if (!factions[factionKey] || bannedFactions[factionKey] || factions[factionKey].seats <= 0) return;

    // The second argument is now the number of overtures (1 or 5); the PC cost comes from getHorseTradeCost().
    const overtures = (Number(pcToSpend) >= HORSE_TRADE_BLOC_OVERTURES) ? HORSE_TRADE_BLOC_OVERTURES : 1;
    const cost = getHorseTradeCost(overtures);
    if (stats.PC < cost) {
        showCustomAlert("Our Political Capital is exhausted. The floor whips have nothing left to trade tonight.", null);
        return;
    }
    if (factions[factionKey].affinity >= 100) {
        showCustomAlert(`${factions[factionKey].name} is already completely committed to the Palace.`, null);
        return;
    }

    prevStatsSnapshot = { ...stats };
    stats.PC = clampPC(stats.PC - cost);
    logPCChange(-cost, `horse_trade:${factionKey}`);

    const nationalMult = getHorseTradeNationalMult();
    const stanceMult = getHorseTradeReceptiveness(factionKey, factions[factionKey].affinity).mult;

    let totalGain = 0;
    window.horseTradeCounts[factionKey] = window.horseTradeCounts[factionKey] || 0;

    for (let i = 0; i < overtures; i++) {
        const priorUses = window.horseTradeCounts[factionKey];
        const fatigue = Math.max(0.45, 1 - (priorUses * 0.025));
        const jitter = 0.9 + (Math.random() * 0.2);
        totalGain += HORSE_TRADE_BASE_GAIN * nationalMult * stanceMult * fatigue * jitter;
        window.horseTradeCounts[factionKey]++;
    }

    if (factionKey === 'abri') {
        applyMilitaryDelta(totalGain);
    } else {
        factions[factionKey].affinity = clampFaction(factionKey, factions[factionKey].affinity + totalGain);
    }

    lastRenderedPortraitSignature = "";
    saveCampaignState();
    updateUI();

    if (returnView === 'faction') {
        openFactionMenu(factionKey, true);
    } else {
        showActionMenu(true);
    }
};

// Build the horse-trading desk HTML
function renderHorseTradingDeskHTML(returnView = 'action') {
    const tickerText = window.lastHorseTradeTicker
        || "[HOTEL MULIA & SENAYAN FLOOR DESK] It is the final night before the ballot boxes open. Dispatch your floor whips from suite to suite to court wavering delegates (1 PC per overture).";

    let html = `<div class="horse-trade-box">
        <div class="music-header">Night of the Long Knives</div>`;

    for (let i = 0; i < portraitFactions.length; i++) {
        const key = portraitFactions[i];
        const f = factions[key];
        if (!f || f.seats <= 0 || bannedFactions[key]) continue;

        const tagHTML = renderColorCodedFactionTag(key);
        const recept = getHorseTradeReceptiveness(key, f.affinity);
        const maxed = f.affinity >= 100;
        const canSpend1 = stats.PC >= HORSE_TRADE_SINGLE_COST && !maxed;
        const canSpend5 = stats.PC >= HORSE_TRADE_BLOC_COST && !maxed;

        html += `<div class="horse-trade-row">
            <div class="horse-trade-info">
                ${tagHTML}
                <div style="font-size: 10.5px; color: #444; margin-top: 2px;">
                    <b>${f.seats} Delegates</b> &bull; Stance: <font color="${recept.color}"><b>${recept.text}</b></font>
                </div>
            </div>
            <div class="horse-trade-actions">
                <button type="button" class="horse-trade-btn" ${canSpend1 ? '' : 'disabled'} onclick="lobbyDelegatesWithPC('${key}', 1, '${returnView}')">
                    A Quiet Word (${HORSE_TRADE_SINGLE_COST} PC)
                </button>
                <button type="button" class="horse-trade-btn" ${canSpend5 ? '' : 'disabled'} onclick="lobbyDelegatesWithPC('${key}', 5, '${returnView}')">
                    Midnight Dinner (${HORSE_TRADE_BLOC_COST} PC)
                </button>
            </div>
        </div>`;
    }

    html += `</div>`;
    return html;
}

// Color-coded Palace Whip Intelligence Report for the final turns (no stance text)
function getPreVoteFactionStanceHTML() {
    if (!isSenayanAssessmentVisible()) return '';
    const backing = [];
    const hedging = [];
    const opposing = [];
    const indebtedTags = [];

    for (let i = 0; i < portraitFactions.length; i++) {
        const key = portraitFactions[i];
        const f = factions[key];
        if (!f || f.seats <= 0 || bannedFactions[key]) continue;

        const badge = renderColorCodedFactionTag(key);

        if (f.affinity >= 60) backing.push(badge);
        else if (f.affinity >= 42) hedging.push(badge);
        else opposing.push(badge);

        if (f.favor && f.favor > 0) {
            indebtedTags.push(badge);
        }
    }

    const cendanaNote = window.OppositionEngine ? OppositionEngine.getCendanaWhipNoteHTML() : "";

    return `<div class="pre-vote-whip-box">
        <div class="music-header">Senayan Floor Assessment</div>
        <div style="padding: 8px 10px; font-size: 12px; line-height: 1.55; background-color: #DFDFDF; box-shadow: var(--bevel-sunken);">
            <div style="margin-bottom: 6px; background-color: #FFFFFF; padding: 5px 8px; box-shadow: var(--bevel-status-well);">
                As the Assembly prepares to vote, our floor managers assess that ${getVagueWhipProjection()}${window.whipTrendHTML || ''}.
            </div>

            <div class="whip-group-block">
                <span class="whip-group-title" style="color: #006400;">&#9632; Caucuses Leaning Toward Accepting the Speech:</span>
                ${backing.length > 0 ? backing.join(' ') : '<i style="color:#555;">No parliamentary caucuses are firmly in our column yet.</i>'}
            </div>

            <div class="whip-group-block">
                <span class="whip-group-title" style="color: #B8860B;">&#9632; Wavering &amp; Divided Caucuses in the Hotel Suites:</span>
                ${hedging.length > 0 ? hedging.join(' ') : '<i style="color:#555;">No caucuses remain on the fence; lines have hardened across the hall.</i>'}
            </div>

            <div class="whip-group-block" style="margin-bottom: 4px;">
                <span class="whip-group-title" style="color: #8B0000;">&#9632; Caucuses Preparing to Reject the Speech:</span>
                ${opposing.length > 0 ? opposing.join(' ') : '<i style="color:#555;">No caucuses are openly mobilizing against the speech.</i>'}
            </div>

            <div style="border-top: 1px dotted #808080; margin-top: 6px; padding-top: 5px; font-size: 11.5px;">
                <b>Backroom Commitments &amp; Past Goodwill:</b>
                ${indebtedTags.length > 0
                    ? `Floor managers report that past political accommodations are helping steady delegates within ${indebtedTags.join(' ')}.`
                    : `<i style="color: #555;">No uncollected political obligations are currently anchoring the floor.</i>`}
            </div>
            ${cendanaNote}
        </div>
    </div>`;
}

// Render the current event and its options
function renderEventMenu() {
    clearTallyInterval();
    scrollMainPanelToTop();
    const ev = events[currentTurn - 1];
    if (!ev) { returnToPreviousView(); return; }
    let html = '<h2>' + ev.title + '</h2>';
    if (ev.image) {
        html += `<center><img src="${ev.image}" class="event-image" style="width: 400px; height: 200px; object-fit: cover; border: 3px inset #FFFFFF; background-color: #A9A9A9; margin-bottom: 15px;" alt="${escapeAttr(ev.title)}"></center>`;
    }

    // Strip any meta turn/mechanic references from event descriptions so the narrative stays purely in-universe
    const cleanDesc = String(ev.desc || '').replace(/<br><br><font color="#0000FF"><b>Your speech tonight grants[\s\S]*?<\/b><\/font>/i, '');
    html += '<p style="text-align: justify; font-family: MS Sans Serif, sans-serif; font-size: 13px; line-height: 1.5; color: #333;">' + cleanDesc + '</p><br>';

    // Show the color-coded Bina Graha Whip Intelligence Report from the Accountability Speech onward
    if (currentTurn >= getSpeechTurnNumber()) {
        html += getPreVoteFactionStanceHTML();
    }

    if (!ev.shuffledIndices) {
        const indices = [];
        for (let i = 0; i < ev.options.length; i++) indices.push(i);
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const temp = indices[i];
            indices[i] = indices[j];
            indices[j] = temp;
        }
        ev.shuffledIndices = indices;
    }

    for (let i = 0; i < ev.shuffledIndices.length; i++) {
        const originalIndex = ev.shuffledIndices[i];
        const opt = ev.options[originalIndex];
        const effectString = (showOptionEffects && opt.effects) ? formatEffectString(opt.effects) : "";
        html += `<button onclick="resolveEvent(${originalIndex})">${opt.text}${effectString}</button>`;
    }

    document.getElementById('main-panel').innerHTML = html;
    saveCampaignState();
}

// Load the current turn: event phase or MPR session
function loadPhase() {
    if (currentTurn >= MAX_TURNS) {
        runElection();
        return;
    }
    isActionPhase = false;
    turnExecutiveUsed = false;
    turnFactionUsed = false;

    for (const key in actionCooldowns) {
        if (actionCooldowns[key] > 0) actionCooldowns[key]--;
    }
    
    for (const key in factionCooldowns) {
    if (factionCooldowns[key] > 0) factionCooldowns[key]--;
    }

    // TRIGGER DYNAMIC FACTION CHANGE ON CENTRAL AXIS EVENT (WITH SEAT-WEIGHTED AFFINITY & BANNED GUARD)
    const ev = events[currentTurn - 1];
    if (ev && ev.id === 'ev_central_axis' && factions['poros_tengah'] && !bannedFactions['poros_tengah'] && !factions['poros_tengah'].hasMerged && factions['poros_tengah'].transformed) {
        factions['poros_tengah'].hasMerged = true;
        const panSeats = factions['poros_tengah'].seats;
        const pppSeats = (factions['ppp'] && !bannedFactions['ppp']) ? factions['ppp'].seats : 0;
        const pkbSeats = (factions['pkb'] && !bannedFactions['pkb']) ? factions['pkb'].seats : 0;
        const othTransfer = (factions['other_parties'] && !bannedFactions['other_parties']) ? Math.min(20, factions['other_parties'].seats) : 0;
        const totalMergedSeats = panSeats + pppSeats + pkbSeats + othTransfer;

        const panAff = factions['poros_tengah'].affinity;
        const pppAff = factions['ppp'] ? factions['ppp'].affinity : panAff;
        const pkbAff = factions['pkb'] ? factions['pkb'].affinity : panAff;
        const othAff = factions['other_parties'] ? factions['other_parties'].affinity : panAff;

        const weightedAffinity = totalMergedSeats > 0
            ? ((panAff * panSeats) + (pppAff * pppSeats) + (pkbAff * pkbSeats) + (othAff * othTransfer)) / totalMergedSeats
            : panAff;

        const t = factions['poros_tengah'].transformed;
        factions['poros_tengah'].name = t.name;
        factions['poros_tengah'].portraitName = t.portraitName || t.name;
        factions['poros_tengah'].seats = totalMergedSeats;
        factions['poros_tengah'].affinity = clampFaction('poros_tengah', weightedAffinity);
        factions['poros_tengah'].summary = t.summary;
        factions['poros_tengah'].biography = t.biography;
        factions['poros_tengah'].moods = t.moods;
        factions['poros_tengah'].interactions = t.interactions;

        // Hotfix 1 Central Axis Nerf
        const pppFavors = (factions['ppp'] && !bannedFactions['ppp']) ? (factions['ppp'].favor || 0) : 0;
        const pkbFavors = (factions['pkb'] && !bannedFactions['pkb']) ? (factions['pkb'].favor || 0) : 0;
        const rawFavors = pppFavors + pkbFavors;
        const inheritedFavor = Math.min(2, Math.floor(rawFavors * 0.5));
        factions['poros_tengah'].favor = Math.min(3, (factions['poros_tengah'].favor || 0) + inheritedFavor);

        if (factions['ppp']) factions['ppp'].seats = 0;
        const pppIndex = portraitFactions.indexOf('ppp');
        if (pppIndex > -1) portraitFactions.splice(pppIndex, 1);

        if (factions['pkb']) factions['pkb'].seats = 0;
        const pkbIndex = portraitFactions.indexOf('pkb');
        if (pkbIndex > -1) portraitFactions.splice(pkbIndex, 1);

        if (factions['other_parties'] && othTransfer > 0) {
            factions['other_parties'].seats = Math.max(0, factions['other_parties'].seats - othTransfer);
        }
    }

    renderEventMenu();
    updateUI();
}

// Apply the chosen option's effects and move on
window.resolveEvent = function(optIndex) {
    const ev = events[currentTurn - 1];
    if (!ev || window.resolvedEventTurn === currentTurn) return;
    const option = ev.options[optIndex];
    if (!option) return;
    window.resolvedEventTurn = currentTurn;

    // Hostile army: peaceful Timor / Aceh options backfire (see adversaries.js)
    const advHook = window.AdversaryEngine ? AdversaryEngine.onEventChoice(ev, optIndex, option) : null;
    const advSabotaged = Boolean(advHook && advHook.sabotaged);
    const advReaction = (option.reaction || '') + (advHook ? advHook.suffix : '');

    // Track specific historical choices for achievements
    if (ev.id === 'ev_bank_bali' && optIndex === 0) bankBaliCleanSteps.frozeEGP = true;
    if (ev.id === 'ev_imf_ultimatum' && optIndex === 0) bankBaliCleanSteps.pwcAccess = true;
    if (ev.id === 'ev_imf_ultimatum' && optIndex === 4) bankBaliCleanSteps.defiedIMF = true;
    if (ev.id === 'ev_pwc_audit' && optIndex === 0) bankBaliCleanSteps.declassifiedPwC = true;

    if (!advSabotaged && ev.id === 'ev_referendum_countdown' && optIndex === 0) timorPromiseSteps.countdown = true;
    if (!advSabotaged && ev.id === 'ev_timor_votes' && optIndex === 0) timorPromiseSteps.votes = true;
    if (!advSabotaged && ev.id === 'ev_peacekeeper_decision' && (optIndex === 0 || optIndex === 1)) timorPromiseSteps.peacekeepers = true;

    if (ev.id === 'ev_assembly_convenes' && optIndex === 0) helpedRaisSpeaker = true;
    if (ev.id === 'ev_suharto_probe' && optIndex === 1 && stats.cendana >= 80) {
        sp3UpheldWithHighCendana = true;
    }

    applyEffects(advSabotaged ? advHook.effects : option.effects);
    updateUI();

    if (currentTurn >= events.length) {
        showCustomAlert(advReaction, () => {
            currentTurn++;
            runElection();
        });
    } else {
        isActionPhase = true;
        saveCampaignState();
        showCustomAlert(advReaction, showActionMenu);
    }
    if (window.AdversaryEngine) AdversaryEngine.flushPopups();
};

function applyEndOfTurnEconomy() {
    const mods = gameConfig.systemModifiers;
    const diffDef = gameConfig.difficultySettings[selectedDifficulty];
    const govStability = getGovStability();

    let severityMalus = 0;
    let severityBonus = 0;

    if (govStability < mods.lowStatThreshold) {
        const deficit = mods.lowStatThreshold - govStability;
        severityMalus = Math.ceil(deficit / 5);
        const maxMalus = mods.maxGlobalMalus || 10.0;
        globalMalus = Math.min(maxMalus, globalMalus + (severityMalus * mods.malusMultiplier));
    } else if (govStability >= mods.highStatThreshold) {
        const highSurplus = govStability - mods.highStatThreshold;
        severityBonus = Math.ceil(highSurplus / 5);
        globalMalus = Math.max(0, globalMalus - (mods.malusDecayHigh || 1.5));
    } else {
        globalMalus = Math.max(0, globalMalus - (mods.malusDecayNormal || 0.5));
    }

    const cap = diffDef.malusCap;
    const currentDrain = Math.min(cap, globalMalus / 2);
    const pcPenalty = Math.floor(globalMalus * 0.75);

    let currentBonus = 0;
    if (severityBonus > 0) {
        currentBonus = Math.min(mods.maxBonusDrift, severityBonus * mods.bonusMultiplier);
    }

    let passivePC = (diffDef.passivePCMod || 0);
    if (govStability >= 60) {
        passivePC += severityBonus;
    } else if (govStability < 35 && cap > 0) {
        passivePC -= Math.min(3, Math.ceil((35 - govStability) / 8));
    }

    if (factions['golkar_habibie'] && !bannedFactions['golkar_habibie']) {
        if (factions['golkar_habibie'].affinity >= 70) {
            passivePC += 2;
        } else if (factions['golkar_habibie'].affinity < 40) {
            passivePC -= 1;
        }
    }

    if (passivePC !== 0) {
        const nextPC = clampPC(stats.PC + passivePC);
        logPCChange(nextPC - stats.PC, 'end-of-turn passive ledger');
        stats.PC = nextPC;
    }

    if (stats.econ <= 20) {
        stats.pop = clampDashboard('pop', stats.pop - 2);
        stats.stab = clampDashboard('stab', stats.stab - 2);
    } else if (stats.econ >= 75) {
        stats.pop = clampDashboard('pop', stats.pop + 1);
        stats.stab = clampDashboard('stab', stats.stab + 1);
    }

    if (stats.intl <= 20) {
        stats.econ = clampDashboard('econ', stats.econ - 2);
    } else if (stats.intl >= 75) {
        stats.econ = clampDashboard('econ', stats.econ + 2);
    }

    if (stats.ref <= 20) {
        stats.stab = clampDashboard('stab', stats.stab - 2);
        stats.pop = clampDashboard('pop', stats.pop - 1);
    }

    let popDriftMod = 0;
    if (stats.pop >= 75) popDriftMod = 0.5;
    else if (stats.pop <= 20 && cap > 0) popDriftMod = -0.5;

    const netDrift = currentBonus - currentDrain + popDriftMod;

    for (const key in factions) {
        if (factions[key].seats <= 0 || bannedFactions[key]) continue;
        if (key === 'abri' && window.wirantoLocked) continue;

        const noise = (Math.random() * 2.0) - 1.0;
        if (key === 'golkar_habibie' && netDrift < 0) {
            const loyalistDrain = Math.min(mods.loyalistDrainMitigation, Math.abs(netDrift));
            factions[key].affinity = clampFaction(key, factions[key].affinity - loyalistDrain + noise);
        } else {
            factions[key].affinity = clampFaction(key, factions[key].affinity + netDrift + noise);
        }
    }

    const gravityRate = 2;
    ['pop', 'ref', 'econ', 'intl', 'stab'].forEach(key => {
        if (stats[key] > 78) {
            stats[key] = clampDashboard(key, stats[key] - gravityRate);
        } else if (stats[key] < 22 && (selectedDifficulty === 'easy' || selectedDifficulty === 'medium')) {
            stats[key] = clampDashboard(key, stats[key] + 1);
        }
    });

    if (factions['abri']) {
        stats.mil = Math.round(factions['abri'].affinity);
    }

    return { pcPenalty: pcPenalty, passivePC: passivePC };
}

// Preview the malus or bonus that will apply at the end of this turn
function getCurrentPenaltyPreview() {
    const mods = gameConfig.systemModifiers;
    const govStability = getGovStability();
    let projectedMalus = globalMalus;
    if (govStability < mods.lowStatThreshold) {
        const deficit = mods.lowStatThreshold - govStability;
        projectedMalus = Math.min(mods.maxGlobalMalus || 10, globalMalus + Math.ceil(deficit / 5) * mods.malusMultiplier);
    }
    return Math.floor(projectedMalus * 0.75);
}

// Build the gazette listing the enacted decrees
function getStateGazetteHTML() {
    const enactedList = [];
    if (actionsData && Array.isArray(actionsData.decrees)) {
        actionsData.decrees.forEach(dec => {
            if (activeDecrees[dec.id]) {
                enactedList.push(`<span style="display: inline-block; background-color: #FFFFFF; padding: 2px 7px; margin: 2px 4px 2px 0; font-size: 11px; font-weight: bold; color: #000080; box-shadow: var(--bevel-status-well);">&#10003; ${dec.text}</span>`);
            }
        });
    }

    if (enactedList.length === 0) {
        return `<div class="state-gazette-box">
            <div style="font-size: 11px; font-weight: bold; color: #000080; margin-bottom: 3px;">LEMBARAN NEGARA</div>
            <div style="font-size: 11px; color: #555; font-style: italic;">No extraordinary decrees or omnibus bills have been signed into the State Gazette yet.</div>
        </div>`;
    }

    return `<div class="state-gazette-box">
        <div style="font-size: 11px; font-weight: bold; color: #000080; margin-bottom: 4px;">LEMBARAN NEGARA</div>
        <div>${enactedList.join("")}</div>
    </div>`;
}

// Render the action phase menu
window.showActionMenu = function(preserveScroll = false) {
    clearTallyInterval();
    if (!preserveScroll) scrollMainPanelToTop();
    isActionPhase = true;
    saveCampaignState();

    const pastSpeech = isPastAccountabilitySpeech();
    const isLongKnives = isNightOfLongKnivesTurn();

    let html = isLongKnives
        ? '<h2>Night of the Long Knives</h2>'
        : (pastSpeech ? '<h2>MPR General Session &mdash; Backroom Phase</h2>' : '<h2>Political Action Phase</h2>');

    const execLine = !turnExecutiveUsed
        ? `<font color="#006400"><b>We can enact an executive action or decree.</b></font>`
        : `<font color="#8B0000"><b>We cannot enact another executive action or decree this turn.</b></font>`;

    let facLine = !turnFactionUsed
        ? `<font color="#006400"><b>We can engage with a faction.</b></font>`
        : `<font color="#8B0000"><b>We cannot engage with another faction this turn.</b></font>`;

    if (isLongKnives) {
        facLine = !turnFactionUsed
            ? `<font color="#006400"><b>Midnight floor horse-trading (1 PC) is active tonight, and we may deliver one Final Faction Appeal.</b></font>`
            : `<font color="#000080"><b>Final Faction Appeal used; 1-PC midnight floor horse-trading remains open until you advance the turn.</b></font>`;
    } else if (pastSpeech) {
        facLine = !turnFactionUsed
            ? `<font color="#006400"><b>We may deliver one Final Faction Appeal this turn.</b></font>`
            : `<font color="#8B0000"><b>We have already delivered a Final Faction Appeal this turn.</b></font>`;
    }

    const stabMod = getStabilityCostModifier();
    let frictionTip = "The machinery of state is operating under normal conditions. Negotiating with factions and passing decrees requires the standard amount of Political Capital.";
    let frictionLine = `<span style="color: #333333; cursor: help; border-bottom: 1px dotted #666666;" title="${frictionTip}" onclick="showMobileTooltipNote(this.title)">The machinery of state is operating normally.</span>`;
    if (stabMod > 0) {
        frictionTip = "Unrest in the streets is making politicians nervous and hesitant to be seen with the Palace, driving up the Political Capital required to pass decrees or court factions.";
        frictionLine = `<span style="color: #8B0000; font-weight: bold; cursor: help; border-bottom: 1px dotted #8B0000;" title="${frictionTip}" onclick="showMobileTooltipNote(this.title)">Unrest in the streets is making backroom negotiations costlier to secure.</span>`;
    } else if (stabMod < 0) {
        frictionTip = "Calm across the country gives the Palace a stronger hand, reducing the Political Capital required to pass decrees or court factions.";
        frictionLine = `<span style="color: #006400; font-weight: bold; cursor: help; border-bottom: 1px dotted #006400;" title="${frictionTip}" onclick="showMobileTooltipNote(this.title)">Calm across the country is smoothing the Palace's negotiations.</span>`;
    }

    const malusDrag = getCurrentPenaltyPreview();
    let authorityTip = "Your cabinet is coherent, and routine executive directives are yielding their full share of Political Capital.";
    let authorityLine = `<span style="color: #006400; cursor: help; border-bottom: 1px dotted #006400;" title="${authorityTip}" onclick="showMobileTooltipNote(this.title)">Cabinet authority across the ministries remains intact.</span>`;
    if (malusDrag >= 5) {
        authorityTip = "Compounding national crises have paralyzed the bureaucracy, severely reducing the Political Capital gained from routine directives and drifting factions away.";
        authorityLine = `<span style="color: #8B0000; font-weight: bold; cursor: help; border-bottom: 1px dotted #8B0000;" title="${authorityTip}" onclick="showMobileTooltipNote(this.title)">The administration is mired in deep institutional paralysis.</span>`;
    } else if (malusDrag >= 3) {
        authorityTip = "Mounting instability is eroding your authority, noticeably reducing the Political Capital gained from routine directives.";
        authorityLine = `<span style="color: #FF4500; font-weight: bold; cursor: help; border-bottom: 1px dotted #FF4500;" title="${authorityTip}" onclick="showMobileTooltipNote(this.title)">Mounting crises are visibly eroding the Palace's authority.</span>`;
    } else if (malusDrag >= 1) {
        authorityTip = "Lingering weaknesses in your administration are slightly blunting the Political Capital gained from routine directives.";
        authorityLine = `<span style="color: #B8860B; cursor: help; border-bottom: 1px dotted #B8860B;" title="${authorityTip}" onclick="showMobileTooltipNote(this.title)">Whispers of doubt are beginning to slow the bureaucracy.</span>`;
    }

    const abriLine = window.OppositionEngine ? OppositionEngine.getMilitaryStatusLineHTML() : '';

    html += `<div style="background-color: #E0DFE3; border: 2px inset #FFFFFF; padding: 10px 12px; margin-bottom: 14px; font-size: 12px; line-height: 1.65;">
        • ${execLine}<br>
        • ${facLine}<br>
        • ${frictionLine}<br>
        • ${authorityLine}<br>
        • ${abriLine}
        <div id="mobile-status-tooltip-box" class="mobile-tooltip-readout"></div>
    </div>`;

   // if (window.AdversaryEngine) html += AdversaryEngine.renderNewsPanel();   // Recent News: opposition moves + background events

    const routineImg = (gameConfig && gameConfig.routineActionsImage) ? gameConfig.routineActionsImage : 'photo/routine.png';
    const decreesImg = (gameConfig && gameConfig.decreesImage) ? gameConfig.decreesImage : 'photo/decree.png';
    const disabledCls = turnExecutiveUsed ? ' action-image-disabled' : '';
    const routineClick = turnExecutiveUsed ? '' : 'onclick="showRoutineActions()"';
    const decreesClick = turnExecutiveUsed ? '' : 'onclick="showDecreesMenu()"';

    html += `<div class="action-image-cards-grid">
        <div class="action-image-card${disabledCls}" ${routineClick}>
            <div class="action-image-frame">
                <span>[ PHOTO:<br>ROUTINE ACTIONS ]</span>
                <img src="${routineImg}" class="portrait-img" alt="[Routine Executive Actions]">
            </div>
            <div class="action-image-title">Routine Executive Actions</div>
        </div>

        <div class="action-image-card${disabledCls}" ${decreesClick}>
            <div class="action-image-frame">
                <span>[ PHOTO:<br>EXTRAORDINARY DECREES ]</span>
                <img src="${decreesImg}" class="portrait-img" alt="[Extraordinary Decrees]">
            </div>
            <div class="action-image-title">Extraordinary Decrees</div>
        </div>
    </div>`;

    // Show the 1-PC Horse-Trading Desk ONLY during the Night of the Long Knives turn
    if (isLongKnives) {
        html += renderHorseTradingDeskHTML('action');
    } else if (!pastSpeech) {
        const newFactions = [];
        for (const key in factions) {
            const f = factions[key];
            if (f && f.seats > 0 && !bannedFactions[key] && f.interactions) {
                for (let i = 0; i < f.interactions.length; i++) {
                    if (f.interactions[i].minTurn === currentTurn) {
                        newFactions.push(f.name);
                        break;
                    }
                }
            }
        }

        if (newFactions.length > 0) {
            let factionListStr = "";
            if (newFactions.length === 1) factionListStr = newFactions[0];
            else if (newFactions.length === 2) factionListStr = newFactions.join(" and ");
            else {
                const lastFaction = newFactions.pop();
                factionListStr = newFactions.join(", ") + ", and " + lastFaction;
            }
            html += `<p style="margin: 8px 0;"><font face="MS Sans Serif" size="2" color="#0000FF"><b class="flashing-text-blue">[!] New faction interactions for ${factionListStr} have become available this turn.</b></font></p>`;
        }
    }

    // Senayan floor assessment (returns '' unless it is the Night of the Long Knives); redrawn after every button press
    html += getPreVoteFactionStanceHTML();
    html += getStateGazetteHTML();

    html += '<p style="margin-top: 10px; margin-bottom: 6px; text-align: center;"><font face="MS Sans Serif" size="2" color="#000080"><b>Select a delegate portrait below to initiate negotiations.</b></font></p>';

    html += `<center><button style="width: 300px; text-align: center; background-color: #d0e8d0; margin-top: 6px;" onclick="finishActionPhase()">NEXT TURN</button></center>`;

    document.getElementById('main-panel').innerHTML = html;
};

// End the action phase and advance the turn
window.finishActionPhase = function() {
    applyEndOfTurnEconomy();
    if (window.AdversaryEngine) AdversaryEngine.onEndOfTurn();
    updateUI();
    nextTurn();
};

// Advance the turn automatically when no actions remain
function checkAutoAdvanceTurn() {
    // Do not auto-advance during the Night of the Long Knives if the player still has PC for horse-trading
    if (isNightOfLongKnivesTurn() && stats.PC > 0) {
        showActionMenu();
        return;
    }
    const autoAdvance = !window.extraSettings || window.extraSettings.autoAdvanceTurn;
    if (turnExecutiveUsed && turnFactionUsed && autoAdvance) {
        finishActionPhase();
    } else {
        showActionMenu();
    }
}

// Render the routine actions menu
window.showRoutineActions = function(activeTab = 'Economy') {
    scrollMainPanelToTop();
    if (turnExecutiveUsed) {
        showActionMenu();
        return;
    }

    let html = '<h2>Routine Executive Actions</h2>';

    const categories = {
        'Economy': [
            'taipans', 'privatization', 'bureaucratic_squeeze', 'economy',
            'urban_relief_program', 'foreign_roadshow', 'diaspora_outreach',
            'jps_expansion', 'batam_technopark', 'seize_cendana_tolls',
            'dakab_supersemar_bailout'
        ],
        'Civil Society': [
            'clerics', 'student_dialogue', 'trisakti_semanggi_commemoration',
            'chinatown_reconciliation', 'sbkri_review', 'ciganjur_dialogue',
            'womens_commission', 'declassify_1965_files'
        ],
        'Security': [
            'leak', 'military', 'kamra_deployment', 'kostrad_rotation',
            'maluku_peace_envoy', 'audit_kodam_foundations', 'mobilize_pam_swakarsa'
        ],
        'Politics': [
            'slushfund', 'campaign', 'address', 'icmi_caucus',
            'wednesday_cabinet', 'litsus_screening'
        ],
        'Regional Affairs': [
            'papua_dialogue', 'sultan_outreach', 'kalimantan_accord',
            'riau_kaltim_summit'
        ]
    };

    html += '<div style="margin-bottom: 15px; border-bottom: 2px solid #808080; padding-bottom: 5px; text-align: center;">';
    for (const cat in categories) {
        html += `<button class="${activeTab === cat ? 'is-selected' : ''}" style="width: auto; display: inline-block; margin: 2px; --py: 5px; --px: 10px; text-align: center;" onclick="showRoutineActions('${cat}')">${cat}</button>`;
    }
    html += '</div>';

    let actionsInTabCount = 0;
    const pcPenaltyPreview = getCurrentPenaltyPreview();
    const repeatDecay = gameConfig.systemModifiers.routineRepeatDecay || 0.15;

    if (actionsData && actionsData.routine) {
        actionsData.routine.forEach(action => {
            if (categories[activeTab] && categories[activeTab].includes(action.id)) {
                actionsInTabCount++;
                const timesUsed = actionUsageCount[action.id] || 0;
                const fatigueFactor = Math.max(0.4, 1 - (timesUsed * repeatDecay));
                let estPC = 0;
                if (action.dynamicPC) {
                    estPC = Math.max(action.dynamicPC.min, Math.round((action.dynamicPC.base * fatigueFactor) - pcPenaltyPreview));
                }

                let pcTierWord = "MODEST";
                if (estPC >= 20) pcTierWord = "SUBSTANTIAL";
                else if (estPC >= 12) pcTierWord = "MODERATE";

                const pcBadge = action.dynamicPC
                    ? ` <span style="color: #0000FF; font-weight: bold;"><font color="black">( grants</font> ${pcTierWord} PC${timesUsed > 0 ? ' &mdash; <font color="#FF5F15">Diminished by Repetition' : ''}</font><font color="black"> )</font></span>`
                    : '';

                let effectString = "";
                if (showOptionEffects) {
                    if (action.effects) effectString += formatEffectString(action.effects);
                    if (action.conditionalEffects) {
                        for (const cond of action.conditionalEffects) {
                            const statVal = stats[cond.condition.stat];
                            const isMatch = cond.condition.operator === '>=' ? (statVal >= cond.condition.value) : (statVal < cond.condition.value);
                            if (isMatch && cond.effects) {
                                effectString += formatEffectString(cond.effects);
                                break;
                            }
                        }
                    }
                    if (action.dynamicScaling) {
                        const scale = action.dynamicScaling;
                        const offsetVal = stats[scale.scaleFrom] + scale.scaleOffset;
                        const calcGain = Math.max(scale.min, scale.base + Math.floor(offsetVal / scale.scaleDivisor));
                        const dynObj = {};
                        dynObj[scale.target] = calcGain;
                        effectString += formatEffectString(dynObj);
                    }
                }

                let cooldownText = "";
                let disabledState = "";
                let btnStyle = "";

                if (actionCooldowns[action.id] > 0) {
                    disabledState = "disabled";
                    cooldownText = ` <span style="color: #8B0000; font-weight: bold; font-size: 10px; margin-left: 5px;">[UNAVAILABLE FOR ${actionCooldowns[action.id]} TURN(S)]</span>`;
                    btnStyle = "opacity: 0.5; cursor: not-allowed; filter: grayscale(100%);";
                }

                html += `<button ${disabledState} style="${btnStyle}" onclick="executeAction('${action.id}')">
                    <b>${action.short_name || 'Action'}</b>${pcBadge}${cooldownText}<br><br>
                    <span style="font-weight:normal;">${action.description}</span>${effectString}
                </button>`;
            }
        });
    }

    if (actionsInTabCount === 0) {
        html += '<p><font face="MS Sans Serif" size="2"><i>No routine actions available in this category.</i></font></p>';
    }

    html += '<br><button style="background-color: #ff9999; text-align: center;" onclick="showActionMenu()">Back</button>';
    document.getElementById('main-panel').innerHTML = html;
};

// Render the decrees menu
window.showDecreesMenu = function(activeTab = 'Economy') {
    scrollMainPanelToTop();
    if (turnExecutiveUsed) {
        showActionMenu();
        return;
    }

    let html = '<h2>Extraordinary Decrees &amp; Bills</h2>';

    if (isPastAccountabilitySpeech()) {
        html += `<div style="background-color: #FFF3CD; box-shadow: var(--bevel-sunken); padding: 8px 10px; align-items: justify; margin-bottom: 12px; font-size: 12px; color: #664D03;">
            <b>Because the 700 delegates have already convened and heard the Accountability Speech, decrees that alter parliamentary seat counts, dissolve party caucuses, or rewrite constitutional election rules are now locked.
        </div>`;
    }

    const categories = {
        'Economy': [
            'economic_bailout', 'currency_board', 'central_bank_independence',
            'ibra_extraordinary_powers', 'imf_fuel_subsidy', 'imf_bulog_deregulation',
            'imf_ibra_liquidation', 'anti_monopoly_law', 'peoples_economy_charter',
            'timor_national_car_seizure'
        ],
        'Civil Society': [
            'political_prisoner_release', 'human_rights_commission_powers',
            'chinese_cultural_ban_repeal', 'broadcast_liberalization',
            'reinstate_siupp_censorship', 'purge_utusan_golongan'
        ],
        'Security': [
            'police_military_separation', 'civilian_defense_ministry',
            'ratify_kamra_militia_bill', 'abolish_kodam_territorial',
            'invoke_supersemar_ii'
        ],
        'Politics': [
            'anti_corruption', 'civil_service_neutrality',
            'direct_presidential_amendment', 'suharto_asset_seizure_tribunal',
            'abolish_abri_mpr_seats', 'dissolve_golkar_old_guard',
            'cendana_restoration_pact', 'ban_pdip_subversion',
            'enforce_asas_tunggal_ban', 'unify_golkar_slipi', 'rainbow_coalition_accord'
        ],
        'Regional Affairs': [
            'regional_autonomy', 'aceh_special_status_law', 'maluku_irja_division'
        ]
    };

    html += '<div style="margin-bottom: 15px; border-bottom: 2px solid #808080; padding-bottom: 5px; text-align: center;">';
    for (const cat in categories) {
        html += `<button class="${activeTab === cat ? 'is-selected' : ''}" style="width: auto; display: inline-block; margin: 2px; --py: 5px; --px: 10px; text-align: center;" onclick="showDecreesMenu('${cat}')">${cat}</button>`;
    }
    html += '</div>';

    let allActiveInTab = true;
    let decreesInTabCount = 0;

    if (actionsData && actionsData.decrees) {
        actionsData.decrees.forEach(decree => {
            if (categories[activeTab] && categories[activeTab].includes(decree.id)) {
                if (!isDecreeEventUnlocked(decree)) return;
                decreesInTabCount++;
                const displayCost = computeDecreeCost(decree.baseCost);
                const isPassed = activeDecrees[decree.id] === true;
                const isSessionLocked = !isPassed && isDecreeLockedBySession(decree);

                let isMutexLocked = false;
                if (decree.mutexDecree && activeDecrees[decree.mutexDecree] === true) {
                    isMutexLocked = true;
                }
                if (Array.isArray(decree.mutexDecrees)) {
                    for (const mId of decree.mutexDecrees) {
                        if (activeDecrees[mId] === true) {
                            isMutexLocked = true;
                            break;
                        }
                    }
                }

                const failReasons = [];

                if (decree.reqDecree && !activeDecrees[decree.reqDecree]) {
                    let reqName = decree.reqDecree;
                    const found = actionsData.decrees.find(d => d.id === decree.reqDecree);
                    if (found) reqName = found.text;
                    failReasons.push(`Requires we first enact '${reqName}'.`);
                }

                const statReqs = [];
                if (decree.reqStat) statReqs.push(decree.reqStat);
                if (Array.isArray(decree.reqStats)) statReqs.push(...decree.reqStats);

                statReqs.forEach(req => {
                    const sk = req.key;
                    const sv = req.val;
                    const op = req.op || '>=';
                    const statLabel = EFFECT_DISPLAY_NAMES[sk] || sk.toUpperCase();
                    const tierLabel = getPlainStatTierName(sk, sv);

                    if (op === '>=' && stats[sk] < sv) {
                        if (sk === 'cendana') {
                            failReasons.push(`Requires ${statLabel} to be '${tierLabel}' or stronger.`);
                        } else {
                            failReasons.push(`Requires ${statLabel} to reach at least '${tierLabel}'.`);
                        }
                    } else if (op === '<=' && stats[sk] > sv) {
                        if (sk === 'cendana') {
                            failReasons.push(`Requires ${statLabel} to be reduced to '${tierLabel}' or lower.`);
                        } else {
                            failReasons.push(`Requires ${statLabel} to fall to '${tierLabel}' or lower.`);
                        }
                    }
                });

                getDecreeFactionReqFailures(decree).forEach(r => failReasons.push(r));

                if (Array.isArray(decree.banFactions)) {
                    const allAlreadyBanned = decree.banFactions.every(fk => bannedFactions[fk] || !factions[fk] || factions[fk].seats <= 0);
                    if (allAlreadyBanned && !isPassed) {
                        isMutexLocked = true;
                    }
                }

                if (isPassed || isMutexLocked || isSessionLocked) {
                    const overlayText = isPassed ? "PASSED" : "LOCKED";
                    const overlayBg = isPassed ? "rgba(0, 140, 0, 0.22)" : "rgba(220, 20, 60, 0.25)";
                    const textColor = isPassed ? "rgba(0, 80, 0, 0.9)" : "rgba(139, 0, 0, 0.9)";
                    const flexLetters = overlayText.split('').map(char => `<span>${char}</span>`).join('');
                    const sessionNote = isSessionLocked
                        ? `<div style="margin-top: 6px; color: #8B0000; font-size: 11px; font-weight: bold;">[MPR Session Underway: Delegate seats and party credentials are already ratified.]</div>`
                        : '';

                    html += `<button disabled style="position: relative; cursor: not-allowed; text-align: left; overflow: hidden; margin-bottom: 8px; border-color: ${textColor};">
                        <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; z-index: 10; pointer-events: none; padding: 0 10px; box-sizing: border-box; background-color: ${overlayBg}; overflow: hidden;">
                            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; font-family: 'MS Sans Serif', sans-serif; color: ${textColor}; font-size: clamp(35px, 6vw, 75px); mix-blend-mode: multiply; opacity: 0.85; text-shadow: 0px 0px 1px ${textColor}; pointer-events: none;">
                                ${flexLetters}
                            </div>
                        </div>
                        <div style="opacity: 0.65; position: relative; z-index: 1;">
                            <b>${decree.text}</b> (Cost: ${displayCost} PC)<br><br>
                            <span style="font-weight:normal;">${decree.description}</span>
                            ${sessionNote}
                        </div>
                    </button>`;
                } else if (failReasons.length > 0) {
                    allActiveInTab = false;
                    const reasonHtml = failReasons.map(r => `<li style="margin-bottom: 2px;">${r}</li>`).join('');
                    html += `<button disabled style="opacity: 0.5; cursor: not-allowed; filter: grayscale(100%); text-align: left; margin-bottom: 8px;">
                        <b>${decree.text}</b> (Cost: ${displayCost} PC) <span style="color: #8B0000; font-weight: bold; font-size: 10px; margin-left: 5px;">[UNAVAILABLE]</span><br><br>
                        <span style="font-weight:normal;">${decree.description}</span>
                        <div style="margin-top: 8px; color: #8B0000; font-family: 'MS Sans Serif', sans-serif; font-size: 11px; font-weight: bold;">
                            <ul style="margin: 0; padding-left: 20px;">${reasonHtml}</ul>
                        </div>
                    </button>`;
                } else {
                    allActiveInTab = false;
                    const canAfford = stats.PC >= displayCost;
                    const affordStyle = canAfford ? '' : 'opacity: 0.65;';
                    html += `<button style="${affordStyle}" onclick="executeDecree('${decree.id}')">
                        <b>${decree.text}</b> (Cost: ${displayCost} PC)<br><br>
                        <span style="font-weight:normal;">${decree.description}</span>
                    </button>`;
                }
            }
        });
    }

    if (decreesInTabCount === 0) {
        html += '<p><font face="MS Sans Serif" size="2"><i>No decrees available in this category.</i></font></p>';
    } else if (allActiveInTab) {
        html += '<p><font face="MS Sans Serif" size="2" color="#8B0000"><i>All available extraordinary measures in this category have been enacted or locked.</i></font></p>';
    }

    html += '<br><button style="background-color: #ff9999; text-align: center;" onclick="showActionMenu()">Back</button>';
    document.getElementById('main-panel').innerHTML = html;
};

// Render a faction's interaction menu
window.openFactionMenu = function(factionKey, preserveScroll = false) {
    if (!gameStarted) {
        showCustomAlert("Start the game first.", null);
        return;
    }
    if (bannedFactions[factionKey] || (factions[factionKey] && factions[factionKey].seats <= 0)) {
        return;
    }
    if (!isActionPhase) {
        showCustomAlert("Resolve the current crisis before interacting with the factions.", null);
        return;
    }

    if (!preserveScroll) scrollMainPanelToTop();
    const f = factions[factionKey];
    const mood = getMoodData(factionKey, f.affinity);
    const favorCount = f.favor || 0;
    const leverage = getFactionLeverage(factionKey);
    const pastSpeech = isPastAccountabilitySpeech();

    let favorDesc = "None banked";
    if (favorCount === 1) favorDesc = "1 past political accommodation (Can be called in during a Final Appeal or held to steady delegates during the roll call)";
    else if (favorCount > 1) favorDesc = `${favorCount} past political accommodations (Can be called in during a Final Appeal or held to steady delegates during the roll call)`;

    let html = '<h2>Interact with ' + f.name + '</h2>';
    if (f.coverImage) {
        html += `<center><img src="${f.coverImage}" class="content-image" style="width: 400px; height: 200px; object-fit: cover; border: 3px inset #FFFFFF; background-color: #A9A9A9; margin-bottom: 15px;" alt="${escapeAttr(f.name)}"></center>`;
    }

    html += '<p><font face="MS Sans Serif" size="2"><b>Delegates Controlled:</b> ' + f.seats + '<br>';
    html += '<b>Current Faction Stance:</b> <font color="' + mood.color + '"><b>' + mood.text + '</b></font><br>';

    if (factionKey === 'pdip' && window.OppositionEngine) {
        html += OppositionEngine.getPdipStreetStatusHTML(f.affinity);
    }

    html += '<b>Bargaining Leverage:</b> <font color="' + leverage.color + '"><b>' + leverage.text + '</b></font> <i>(' + leverage.desc + ')</i><br>';
    html += '<b>Political Goodwill Owed:</b> <font color="#0000FF">' + favorDesc + '</font></p>';

    html += '<div class="faction-summary">' + f.summary + '</div>';

    if (turnFactionUsed) {
        html += '<p><font face="MS Sans Serif" size="2" color="#8B0000"><b>[!] You have already completed a formal Parliamentary Engagement this turn.</b></font></p>';
    }

    let availableInteractions = [];
    if (f.interactions) {
        availableInteractions = f.interactions.filter(interaction => {
            const meetsMin = !interaction.minTurn || currentTurn >= interaction.minTurn;
            const meetsMax = !interaction.maxTurn || currentTurn <= interaction.maxTurn;
            return meetsMin && meetsMax;
        });
    }

    if (availableInteractions.length > 0) {
        const sortedInteractions = [...availableInteractions].sort((a, b) => {
            const aFinal = String(a.id || '').includes('final') ? 1 : 0;
            const bFinal = String(b.id || '').includes('final') ? 1 : 0;
            return bFinal - aFinal;
        });

        sortedInteractions.forEach(interaction => {
            const isFinalRequest = String(interaction.id || '').includes('final');
            const isLockedByPostSpeech = pastSpeech && !isFinalRequest;
            const displayCost = computeFactionActionCost(factionKey, interaction.cost);
            const effectString = (showOptionEffects && interaction.effects) ? formatEffectString(interaction.effects) : "";

            const failReasons = [];
            const meetsAffinity = interaction.minAffinity === undefined || f.affinity >= interaction.minAffinity;
            if (!meetsAffinity) {
                const reqMood = getMoodData(factionKey, interaction.minAffinity);
                failReasons.push(`Requires Faction Stance to be at least '${reqMood.text}'.`);
            }

            const meetsDecree = interaction.reqDecree === undefined || activeDecrees[interaction.reqDecree] === true;
            if (!meetsDecree) {
                let reqDecreeName = "a specific decree";
                if (actionsData && actionsData.decrees) {
                    const foundDecree = actionsData.decrees.find(d => d.id === interaction.reqDecree);
                    if (foundDecree) reqDecreeName = foundDecree.text;
                }
                failReasons.push(`Requires we first enact '${reqDecreeName}'.`);
            }

            let meetsStat = true;
            if (interaction.minStat) {
                const statKey = interaction.minStat.key;
                const statVal = interaction.minStat.val;
                const displayStatName = EFFECT_DISPLAY_NAMES[statKey] || statKey.toUpperCase();
                const reqTierName = getPlainStatTierName(statKey, statVal);

                if (statKey === 'cendana') {
                    if (stats[statKey] > statVal) {
                        meetsStat = false;
                        failReasons.push(`Our ${displayStatName} is too entrenched (Must be reduced to '${reqTierName}' or lower).`);
                    }
                } else {
                    if (stats[statKey] < statVal) {
                        meetsStat = false;
                        failReasons.push(`Our ${displayStatName} is too weak (Must reach at least '${reqTierName}').`);
                    }
                }
            }

            const isConditionMet = meetsAffinity && meetsDecree && meetsStat;
            const isSided = !interaction.repeatable && completedInteractions[interaction.id];
            const isLocked = (interaction.mutexGroup && completedInteractions[interaction.mutexGroup] && !isSided) || isLockedByPostSpeech;

            // Usage & cooldown tracking
            const actionKey = factionKey + ':' + interaction.id;
            const currentCooldown = (typeof factionCooldowns !== 'undefined' && factionCooldowns[actionKey]) ? factionCooldowns[actionKey] : 0;
            const timesUsed = (typeof factionUsageCount !== 'undefined' && factionUsageCount[actionKey]) ? factionUsageCount[actionKey] : 0;

            const oppCheck = window.OppositionEngine
                    ? OppositionEngine.evaluateFactionInteraction(factionKey, interaction.id, timesUsed)
                    : { isThreatBurned: false, isKiemasDulled: false };
            const isThreatBurned = oppCheck.isThreatBurned;
            const isKiemasDulled = oppCheck.isKiemasDulled;

            if (isSided || isLocked || isThreatBurned) {
                const overlayText = isThreatBurned ? "BURNED" : (isSided ? "COMMITTED" : "LOCKED");
                const overlayBg = isSided ? "rgba(0, 160, 0, 0.25)" : "rgba(220, 20, 60, 0.25)";
                const textColor = isSided ? "rgba(0, 80, 0, 0.9)" : "rgba(139, 0, 0, 0.9)";
                const flexLetters = overlayText.split('').map(char => `<span>${char}</span>`).join('');
                
                const burnedNote = isThreatBurned
                    ? `<div style="margin-top: 6px; color: #8B0000; font-size: 11px; font-weight: bold;">[Akbar has called your bluff. This avenue of coercion is permanently closed.]</div>`
                    : '';
                const postSpeechNote = isLockedByPostSpeech
                    ? `<div style="margin-top: 6px; color: #8B0000; font-size: 11px; font-weight: bold;">[Routine pre-session overtures are closed; only Last-Minute Appeals remain open.]</div>`
                    : '';

                html += `<button disabled style="position: relative; cursor: not-allowed; text-align: left; overflow: hidden; margin-bottom: 8px; border-color: ${textColor};">
                    <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; z-index: 10; pointer-events: none; padding: 0 10px; box-sizing: border-box; background-color: ${overlayBg}; overflow: hidden;">
                        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; font-family: 'MS Sans Serif', sans-serif; color: ${textColor}; font-size: clamp(35px, 6vw, 75px); mix-blend-mode: multiply; opacity: 0.85; text-shadow: 0px 0px 1px ${textColor}; pointer-events: none;">
                            ${flexLetters}
                        </div>
                    </div>
                    <div style="opacity: 0.65; position: relative; z-index: 1;">
                        <b>${interaction.text}</b> (Cost: ${displayCost} PC)<br><br>
                        <span style="font-weight:normal;">${interaction.description}</span>
                        ${burnedNote}
                        ${postSpeechNote}
                    </div>
                </button>`;
            } else if (currentCooldown > 0) {
                // Grayed-out cooldown button
                html += `<button disabled style="opacity: 0.5; cursor: not-allowed; filter: grayscale(100%); text-align: left; margin-bottom: 8px;">
                    <b>${interaction.text}</b> (Cost: ${displayCost} PC) <span style="color: #8B0000; font-weight: bold; font-size: 10px; margin-left: 5px;">[ON COOLDOWN: ${currentCooldown} TURN(S)]</span><br><br>
                    <span style="font-weight:normal;">${interaction.description}</span>
                </button>`;
            } else if (!isConditionMet) {
                const reasonHtml = failReasons.map(r => `<li style="margin-bottom: 2px;">${r}</li>`).join('');
                html += `<button disabled style="opacity: 0.5; cursor: not-allowed; filter: grayscale(100%); text-align: left; margin-bottom: 8px;">
                    <b>${interaction.text}</b> (Cost: ${displayCost} PC) <span style="color: #8B0000; font-weight: bold; font-size: 10px; margin-left: 5px;">[UNAVAILABLE]</span><br><br>
                    <span style="font-weight:normal;">${interaction.description}</span>
                    <div style="margin-top: 8px; color: #8B0000; font-family: 'MS Sans Serif', sans-serif; font-size: 11px; font-weight: bold;">
                        <ul style="margin: 0; padding-left: 20px;">${reasonHtml}</ul>
                    </div>
                </button>`;
            } else {
                const isNew = (interaction.minTurn === currentTurn) || (pastSpeech && isFinalRequest);
                const btnClass = (isNew && !turnFactionUsed) ? ' class="new-action-btn" onmouseenter="this.classList.remove(\'new-action-btn\')"' : '';
                const disabledAttr = turnFactionUsed ? 'disabled style="opacity: 0.55; cursor: not-allowed;"' : '';
                const dulledNotice = isKiemasDulled ? '<br><span style="color: #777; font-size: 11px;">Dinner pleasantries have run their course.</span>' : '';

                html += `<button${btnClass} ${disabledAttr} onclick="executeFactionAction('${factionKey}', '${interaction.id}', ${displayCost})">
                    <b>${interaction.text}</b> (Cost: ${displayCost} PC)<br><br>
                    <span style="font-weight:normal;">${interaction.description}</span>${dulledNotice}${effectString}
                </button>`;
            }
        });
    } else {
        html += '<p><font face="MS Sans Serif" size="2"><i>No formal negotiations are currently available with this faction at this time.</i></font></p>';
    }

    html += '<br><button onclick="showFactionBio(\'' + factionKey + '\')">Faction information</button>';
    html += '<button style="background-color: #ff9999; text-align: center;" onclick="showActionMenu()">Back</button>';
    document.getElementById('main-panel').innerHTML = html;
};

// Pay for and apply a faction interaction
window.executeFactionAction = function(factionKey, interactionId, finalCost) {
    if (turnFactionUsed) return;
    const isFinalAction = String(interactionId || '').includes('final');
    if (isPastAccountabilitySpeech() && !isFinalAction) {
        showCustomAlert("The MPR General Session has already convened. Only Final Appeals may be used now.", null);
        return;
    }
    if (stats.PC < finalCost) {
        showCustomAlert(`Insufficient Political Capital.`, null);
        return;
    }

    const f = factions[factionKey];
    const interactionDef = f.interactions.find(i => i.id === interactionId);
    if (!interactionDef) return;

    // Declare alertMsg right at the start so all checks can safely use it!
    let alertMsg = interactionDef.alertMsg || "Negotiation completed.";

    stats.PC = clampPC(stats.PC - finalCost);
    logPCChange(-finalCost, 'faction:' + factionKey + ':' + interactionId);
    turnFactionUsed = true;

    if (!interactionDef.repeatable) {
        completedInteractions[interactionId] = true;
    }
    if (interactionDef.locksGroup && interactionDef.mutexGroup) {
        completedInteractions[interactionDef.mutexGroup] = true;
    }

    // Cooldown & usage tracking
    const actionKey = factionKey + ':' + interactionId;
    if (typeof factionUsageCount === 'undefined') window.factionUsageCount = {};
    if (typeof factionCooldowns === 'undefined') window.factionCooldowns = {};

    factionUsageCount[actionKey] = (factionUsageCount[actionKey] || 0) + 1;
    const timesUsed = factionUsageCount[actionKey];

    if (interactionDef.repeatable) {
        factionCooldowns[actionKey] = 3;
    }

    // Evaluate opposition pushback / coercion limits via OppositionEngine
    const oppEval = window.OppositionEngine
        ? OppositionEngine.evaluateFactionInteraction(factionKey, interactionId, timesUsed)
        : {
            isThreatBurned: false,
            isKiemasDulled: false,
            suppressLeverage: false,
            cancelFactionGain: false,
            overrideAlertMsg: null,
            appendAlertMsg: null,
            abortTurnAdvance: false
        };

    const isLineCrossed = Boolean(oppEval.suppressLeverage);

    let deltaFromLeverage = 0;
    const leverage = isLineCrossed ? { gainMult: 1.0 } : getFactionLeverage(factionKey);

    if (interactionDef.effects) {
        const effectsToApply = rollEffectRanges(interactionDef.effects);

        if (oppEval.cancelFactionGain) {
            delete effectsToApply[factionKey];
        }

        if (!isLineCrossed && effectsToApply[factionKey] && effectsToApply[factionKey] > 0) {
            const originalVal = effectsToApply[factionKey];
            const modifiedVal = Math.max(1, Math.round(originalVal * leverage.gainMult));
            deltaFromLeverage = modifiedVal - originalVal;
            effectsToApply[factionKey] = modifiedVal;
        }
        applyEffects(effectsToApply);
    }

    let favorBonus = 0;
    if (isFinalAction && f.favor > 0) {
        favorBonus = Math.min(28, Math.round(Math.sqrt(f.favor) * 14));
        f.favor = 0;
        f.affinity = clampFaction(factionKey, f.affinity + favorBonus);
    }

    if (factions['abri']) {
        stats.mil = Math.round(factions['abri'].affinity);
    }

    if (oppEval.overrideAlertMsg) {
        alertMsg = oppEval.overrideAlertMsg;
    }
    if (oppEval.appendAlertMsg) {
        alertMsg += oppEval.appendAlertMsg;
    }

    saveCampaignState();
    updateUI();

    if (oppEval.abortTurnAdvance) {
        showCustomAlert(alertMsg, checkAutoAdvanceTurn);
        if (window.OppositionEngine) OppositionEngine.flushPopups();
        return;
    }

    // Deletes leverage note if line is crossed
    if (!isLineCrossed) {
        if (deltaFromLeverage > 0) {
            alertMsg += `<br><br><font color="#006400"><b>Your strong bargaining leverage significantly amplified the impact of your overture!</b></font>`;
        } else if (deltaFromLeverage < 0) {
            alertMsg += `<br><br><font color="#8B0000"><b>Your weak bargaining leverage blunted the effectiveness of your overture.</b></font>`;
        }
    }

    if (favorBonus > 0) {
        alertMsg += `<br><br><font color="#0000FF"><b>Past political commitments were redeemed during negotiations!</b></font>`;
    }

    showCustomAlert(alertMsg, checkAutoAdvanceTurn);
    if (window.OppositionEngine) OppositionEngine.flushPopups();
};

// Pay for and enact a decree
window.executeDecree = function(type) {
    if (turnExecutiveUsed) return;
    const decreeDef = actionsData.decrees ? actionsData.decrees.find(d => d.id === type) : null;
    if (!decreeDef) return;

    if (isDecreeLockedBySession(decreeDef)) {
        showCustomAlert("The MPR General Session is already underway and delegate credentials are ratified; this decree can no longer be enacted.", null);
        return;
    }
    if (!isDecreeEventUnlocked(decreeDef) || getDecreeFactionReqFailures(decreeDef).length > 0) {
        showCustomAlert("The conditions for this decree have not been met.", null);
        return;
    }

    const actionCost = computeDecreeCost(decreeDef.baseCost);
    if (stats.PC < actionCost) {
        showCustomAlert(`Insufficient Political Capital to enact this decree.`, null);
        return;
    }

    stats.PC = clampPC(stats.PC - actionCost);
    logPCChange(-actionCost, 'decree:' + type);
    activeDecrees[type] = true;
    turnExecutiveUsed = true;

    const advSeatSnap = window.AdversaryEngine ? AdversaryEngine.snapshotSeats() : null;

    // 1. Handle Faction Bans & Dynamic Seat Redistribution
    if (Array.isArray(decreeDef.banFactions)) {
        let totalBannedSeats = 0;
        decreeDef.banFactions.forEach(fk => {
            bannedFactions[fk] = true;
            if (factions[fk] && factions[fk].seats > 0) {
                totalBannedSeats += factions[fk].seats;
                factions[fk].seats = 0;
                factions[fk].favor = 0;
            }
        });

        if (decreeDef.seatRecipients && totalBannedSeats > 0) {
            const recipientKeys = Object.keys(decreeDef.seatRecipients).filter(rk => factions[rk] && !bannedFactions[rk]);
            let weightTotal = 0;
            recipientKeys.forEach(rk => { weightTotal += decreeDef.seatRecipients[rk]; });

            let seatsDistributed = 0;
            recipientKeys.forEach((rk, idx) => {
                if (idx === recipientKeys.length - 1) {
                    factions[rk].seats += (totalBannedSeats - seatsDistributed);
                } else {
                    const share = Math.round((decreeDef.seatRecipients[rk] / weightTotal) * totalBannedSeats);
                    factions[rk].seats += share;
                    seatsDistributed += share;
                }
            });
        }
    }

    // 2. Apply explicit fixed seatChanges if specified
    if (decreeDef.seatChanges) {
        for (const facKey in decreeDef.seatChanges) {
            if (factions[facKey] && !bannedFactions[facKey]) {
                factions[facKey].seats = Math.max(0, factions[facKey].seats + decreeDef.seatChanges[facKey]);
            }
        }
    }

    if (window.AdversaryEngine) AdversaryEngine.recordSeatTransfer(advSeatSnap, type);

    // 3. Apply Locks, Floors, Caps & Penalties
    const locks = decreeDef.locks;
    if (locks) {
        prevStatsSnapshot = { ...stats };
        if (locks.statPenalties) {
            applyEffects(locks.statPenalties, false);
        }
        if (locks.factionPenalties) {
            applyEffects(locks.factionPenalties, false);
        }
        if (locks.minStats) {
            for (const stat in locks.minStats) {
                minStats[stat] = Math.max(minStats[stat] || 0, locks.minStats[stat]);
                stats[stat] = clampDashboard(stat, Math.max(stats[stat], minStats[stat]));
            }
        }
        if (locks.maxCendana !== undefined) {
            maxCendana = Math.min(maxCendana, locks.maxCendana);
            stats.cendana = clampDashboard('cendana', Math.min(stats.cendana, maxCendana));
        }
        if (locks.minFactions) {
            for (const fac in locks.minFactions) {
                minFactions[fac] = Math.max(minFactions[fac] || 0, locks.minFactions[fac]);
                if (factions[fac]) {
                    factions[fac].affinity = clampFaction(fac, Math.max(factions[fac].affinity, minFactions[fac]));
                }
            }
        }
    }

    if (factions['abri']) {
        stats.mil = Math.round(factions['abri'].affinity);
    }

    if (window.AdversaryEngine) AdversaryEngine.onDecreeEnacted(type, decreeDef);

    lastRenderedPortraitSignature = "";
    saveCampaignState();
    updateUI();
    showCustomAlert(decreeDef.alertMsg || "Decree enacted.", checkAutoAdvanceTurn);
    if (window.AdversaryEngine) AdversaryEngine.flushPopups();
};

// Pay for and apply a routine action
window.executeAction = function(type) {
    if (turnExecutiveUsed) return;
    const actionDef = actionsData.routine ? actionsData.routine.find(a => a.id === type) : null;
    if (!actionDef) return;

    turnExecutiveUsed = true;
    prevStatsSnapshot = { ...stats };
    const pcPenalty = getCurrentPenaltyPreview();
    const timesUsed = actionUsageCount[type] || 0;
    const repeatDecay = gameConfig.systemModifiers.routineRepeatDecay || 0.15;
    const fatigueFactor = Math.max(0.4, 1 - (timesUsed * repeatDecay));
    actionUsageCount[type] = timesUsed + 1;

    let alertMsg = actionDef.alertMsg || "";

    if (actionDef.effects) applyEffects(actionDef.effects, false);

    if (actionDef.conditionalEffects) {
        for (const cond of actionDef.conditionalEffects) {
            const statVal = stats[cond.condition.stat];
            let isMatch = false;
            if (cond.condition.operator === '>=') isMatch = (statVal >= cond.condition.value);
            else if (cond.condition.operator === '<') isMatch = (statVal < cond.condition.value);

            if (isMatch) {
                if (cond.effects) applyEffects(cond.effects, false);
                if (cond.alertMsg) alertMsg = cond.alertMsg;
                break;
            }
        }
    }

    if (actionDef.dynamicScaling) {
        const scale = actionDef.dynamicScaling;
        const offsetVal = stats[scale.scaleFrom] + scale.scaleOffset;
        const calculatedGain = scale.base + Math.floor(offsetVal / scale.scaleDivisor);
        const finalGain = Math.max(scale.min, calculatedGain);

        const dynamicEffect = {};
        dynamicEffect[scale.target] = finalGain;
        applyEffects(dynamicEffect, false);

        if (actionDef.alertMsgs) {
            alertMsg = (finalGain > 0) ? actionDef.alertMsgs.success : actionDef.alertMsgs.failure;
        }
    }

    if (actionDef.dynamicPC) {
        const pcGained = Math.max(actionDef.dynamicPC.min, Math.round((actionDef.dynamicPC.base * fatigueFactor) - pcPenalty));
        const nextPC = clampPC(stats.PC + pcGained);
        logPCChange(nextPC - stats.PC, 'routine:' + type);
        stats.PC = nextPC;
        if (alertMsg.includes("{pcGained}")) {
            alertMsg = alertMsg.replace("{pcGained}", pcGained);
        }
    }

    actionCooldowns[type] = actionDef.cooldown || 2;

    if (window.AdversaryEngine) AdversaryEngine.onActionExecuted(type);
    saveCampaignState();
    updateUI();
    showCustomAlert(alertMsg, checkAutoAdvanceTurn);
    if (window.AdversaryEngine) AdversaryEngine.flushPopups();
};


// Advance to the next turn
function nextTurn() {
    currentTurn++;
    loadPhase();
}