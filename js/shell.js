// shell.js: Windows 95 shell: loading screen, taskbar and Start menu.

// Loader state: cached loading.json data, the running timer and the function that finishes it
let loadingDataCache = null;
let activeLoaderTimer = null;
let activeLoaderFinish = null;

// Fallback list of file names shown on the loading screen
const DEFAULT_LOADING_FILES = [
    "config.json",
    "achievements.json",
    "events.json",
    "actionphase/routine.json",
    "actionphase/decrees.json",
    "localization/tutorial.json",
    "localization/history.json",
    "localization/library.json",
    "stats.json",
    "credits.json",
    "updates.json",
    "fraksi/pdip.json",
    "fraksi/golkar_akbar.json",
    "fraksi/poros_tengah.json",
    "fraksi/abri.json",
    "fraksi/ppp.json",
    "fraksi/pkb.json",
    "fraksi/golkar_habibie.json",
    "fraksi/utusan_daerah.json",
    "fraksi/utusan_golongan.json",
    "fraksi/other_parties.json",
    "audio/music.json"
];

// Fetch and cache data/loading.json, falling back to built-in messages if it fails
async function ensureLoadingData() {
    if (loadingDataCache) return loadingDataCache;
    try {
        const res = await fetch('data/loading.json');
        if (res.ok) {
            loadingDataCache = await res.json();
            return loadingDataCache;
        }
    } catch (e) { console.warn(e); }

    // Fetch failed: use a built-in fallback for this call only, so a later call can retry loading.json
    return {
        messages: {
            en: [
                "Investigating Bank Bali cessie transfers...",
                "Establishing encrypted telex to Cilangkap...",
                "Drafting the President's Accountability Speech..."
            ]
        },
        files: DEFAULT_LOADING_FILES
    };
}

// Return a shuffled selection of loading messages in the current language
function getShuffledFlavorMessages(count = 6, data = loadingDataCache) {
    const lang = (typeof currentLang !== 'undefined' && currentLang === 'id') ? 'id' : 'en';
    const msgObj = (data && data.messages) || {};
    const pool = msgObj[lang] || msgObj.en || ["Loading assets..."];
    const copy = [...pool];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = copy[i];
        copy[i] = copy[j];
        copy[j] = tmp;
    }
    return copy.slice(0, Math.max(1, Math.min(count, copy.length)));
}

// Return the loading file list, using id/ paths for Indonesian
function getActualFileList(data = loadingDataCache) {
    const rawFiles = (data && Array.isArray(data.files) && data.files.length > 0)
        ? data.files
        : DEFAULT_LOADING_FILES;
    const isID = (typeof currentLang !== 'undefined' && currentLang === 'id');

    return rawFiles.map(f => {
        if (isID && f.endsWith('.json') && !f.startsWith('audio/')) {
            return `id/${f}`;
        }
        return f;
    });
}

// WIN95 SEGMENTED LOADING BAR SEQUENCE
window.runWin95LoadingScreen = async function(options = {}) {
    const durationMs = options.duration || 1800;
    const headerTitle = options.title || "Loading Assets";
    const onComplete = typeof options.onComplete === 'function' ? options.onComplete : null;

    const loaded = await ensureLoadingData();
    const dataForThisRun = loaded;

    // A loader that is still running must be finished first so its promise/callback are never lost
    if (activeLoaderFinish) activeLoaderFinish();

    const overlay = document.getElementById('win95-loader-overlay');
    const titleEl = document.getElementById('win95-loader-title');
    const flavorEl = document.getElementById('win95-loader-flavor');
    const fileEl = document.getElementById('win95-loader-file');
    const barFill = document.getElementById('win95-loader-bar-fill');
    const pctEl = document.getElementById('win95-loader-pct');

    if (!overlay || !barFill) {
        if (onComplete) onComplete();
        return;
    }

    const flavorMessages = getShuffledFlavorMessages(5, dataForThisRun);
    const fileList = getActualFileList(dataForThisRun);
    const totalTicks = fileList.length;
    const tickInterval = Math.max(30, Math.round(durationMs / totalTicks));
    let currentTick = 0;

    if (titleEl) titleEl.innerText = headerTitle;
    overlay.style.display = 'flex';
    barFill.style.width = '0%';
    if (pctEl) pctEl.innerText = '0%';

    const updateStepDisplay = (tickIdx) => {
        const fileIdx = Math.min(fileList.length - 1, tickIdx);
        const flavorIdx = Math.min(flavorMessages.length - 1, Math.floor((tickIdx / totalTicks) * flavorMessages.length));
        if (flavorEl) flavorEl.innerText = flavorMessages[flavorIdx];
        if (fileEl) fileEl.innerText = `Loading: ${fileList[fileIdx]}`;
    };

    updateStepDisplay(0);

    return new Promise((resolve) => {
        let finished = false;
        let finishTimeout = null;

        // Single exit path: normal completion or being superseded by another loader.
        const finish = () => {
            if (finished) return;
            finished = true;
            if (activeLoaderTimer) { clearInterval(activeLoaderTimer); activeLoaderTimer = null; }
            if (finishTimeout) { clearTimeout(finishTimeout); finishTimeout = null; }
            activeLoaderFinish = null;
            overlay.style.display = 'none';
            try {
                if (onComplete) onComplete();
            } catch (err) {
                console.error('Loader onComplete failed:', err);
            } finally {
                resolve();
            }
        };
        activeLoaderFinish = finish;

        activeLoaderTimer = setInterval(() => {
            currentTick++;
            const pct = Math.min(100, Math.round((currentTick / totalTicks) * 100));
            barFill.style.width = pct + '%';
            if (pctEl) pctEl.innerText = pct + '%';

            if (currentTick < totalTicks) {
                updateStepDisplay(currentTick);
            } else {
                clearInterval(activeLoaderTimer);
                activeLoaderTimer = null;
                finishTimeout = setTimeout(finish, 150);
            }
        }, tickInterval);
    });
};

// WIN95 TASKBAR & START MENU LOGIC
window.toggleWin95StartMenu = function(evt) {
    if (evt) evt.stopPropagation();
    const menu = document.getElementById('win95-start-menu');
    const btn = document.getElementById('win95-start-btn');
    if (!menu || !btn) return;

    const isOpen = menu.style.display === 'block';
    menu.style.display = isOpen ? 'none' : 'block';
    btn.classList.toggle('active-depressed', !isOpen);
};

// Close the Start menu
window.closeWin95StartMenu = function() {
    const menu = document.getElementById('win95-start-menu');
    const btn = document.getElementById('win95-start-btn');
    if (menu) menu.style.display = 'none';
    if (btn) btn.classList.remove('active-depressed');
};

// Run a Start menu action, confirming first if it would leave a campaign in progress
window.runStartMenuAction = function(fnName) {
    closeWin95StartMenu();

    // Leaving the epilogue screen: restore the title state before running the action
    if (window.epilogueActive && fnName !== 'returnToTitleScreen' && typeof returnToTitleScreen === 'function') returnToTitleScreen();

    // Leaving a campaign that is in progress: confirm first (progress is auto-saved, so Continue still works)
    const leavesCampaign = (fnName === 'showDifficultyMenu' || fnName === 'returnToTitleScreen');
    const midCampaign = (typeof gameStarted !== 'undefined' && gameStarted &&
        typeof events !== 'undefined' && typeof currentTurn !== 'undefined' && currentTurn <= events.length);
    if (leavesCampaign && midCampaign &&
        !confirm('Leave the current campaign? Your progress is auto-saved and can be resumed with Continue.')) {
        return;
    }

    if (typeof window[fnName] === 'function') {
        window[fnName]();
    }
    updateWin95Taskbar();
};

// Return the in-game date shown in the taskbar
function getTaskbarGameDate() {
    if (typeof gameStarted !== 'undefined' && gameStarted && typeof events !== 'undefined' && typeof currentTurn !== 'undefined') {
        if (currentTurn <= events.length && events[currentTurn - 1] && events[currentTurn - 1].date) {
            return events[currentTurn - 1].date;
        }
        if (currentTurn > events.length) return 'Oct 19, 1999';
    }
    return 'Jun 1999';
}

// Refresh the taskbar title, date and time tray, and audio icon
window.updateWin95Taskbar = function() {
    const statusTextEl = document.getElementById('taskbar-window-title');
    const dateTrayEl = document.getElementById('taskbar-tray-date');
    const audioTrayBtn = document.getElementById('taskbar-tray-audio');

    if (statusTextEl) {
        let text = 'Twilight of the Banyan Tree';
        if (typeof gameStarted !== 'undefined' && gameStarted) {
            const phaseLabel = (typeof isActionPhase !== 'undefined' && isActionPhase)
                ? 'Political Action Phase'
                : (currentTurn > events.length ? 'MPR General Session' : `Turn ${currentTurn} Crisis`);
            text = `Twilight of the Banyan Tree \u2014 [${phaseLabel}]`;
        }
        if (statusTextEl.textContent !== text) statusTextEl.textContent = text;
    }

    if (dateTrayEl) {
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const text = `${getTaskbarGameDate()} | ${timeStr}`;
        if (dateTrayEl.textContent !== text) dateTrayEl.textContent = text;
    }

    if (audioTrayBtn) {
        const audio = document.getElementById('bg-music');
        const disabled = (typeof musicEnabled !== 'undefined' && !musicEnabled);
        const silent = disabled || !audio || audio.paused;
        audioTrayBtn.innerHTML = silent ? '&#128263;' : '&#128266;';
        audioTrayBtn.title = disabled ? 'Music is disabled in Settings'
            : (silent ? 'Music Paused (Click to Play)' : 'Music Playing (Click to Pause)');
    }
};

// Close the Start menu when clicking outside it
document.addEventListener('click', function(e) {
    const menu = document.getElementById('win95-start-menu');
    const btn = document.getElementById('win95-start-btn');
    if (menu && menu.style.display === 'block') {
        if (!menu.contains(e.target) && (!btn || !btn.contains(e.target))) {
            closeWin95StartMenu();
        }
    }
});

// Close the Start menu on Escape
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeWin95StartMenu();
});

// Update the taskbar on page load and every second
window.addEventListener('load', function() {
    updateWin95Taskbar();
    setInterval(updateWin95Taskbar, 1000);
});