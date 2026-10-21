// debug

// Whether achievements may unlock during debug runs
window.debugAllowAchievements = false;
let originalUnlockAchievement = null;

// Random integer between min and max, inclusive
function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Leave a debug run and restore saving, panels and factions
window.exitDebugElectionToMenu = function() {
    debugRestoreSaving();
    window.debugHorseActive = false;
    if (window.OppositionEngine) OppositionEngine.reset();
    const mprDash = document.getElementById('mpr-dashboard');
    const leftPanel = document.getElementById('left-panel');
    const mainPanel = document.getElementById('main-panel');

    if (mprDash) mprDash.style.display = '';
    if (leftPanel) leftPanel.style.display = '';
    if (mainPanel) mainPanel.style.width = '70%';

    if (typeof initialFactionsSnapshot !== 'undefined' && Object.keys(initialFactionsSnapshot).length > 0) {
        factions = JSON.parse(JSON.stringify(initialFactionsSnapshot));
    }
    if (typeof INITIAL_PORTRAIT_FACTIONS !== 'undefined') {
        portraitFactions = [...INITIAL_PORTRAIT_FACTIONS];
    }

    gameStarted = false;
    updateUI();
    showStartMenu();
};

window.givePC = function(amount = 100) {
    if (typeof stats === 'undefined') {
        console.warn("Start the game first!");
        return;
    }

    const prev = stats.PC;
    // Tops you off cleanly to 100 (or whatever max is)
    stats.PC = typeof clampPC === 'function' ? clampPC(stats.PC + amount) : Math.min(100, stats.PC + amount);

    if (typeof logPCChange === 'function') {
        logPCChange(stats.PC - prev, 'debug_cheat');
    }
    if (typeof updateUI === 'function') {
        updateUI();
    }
    if (typeof saveCampaignState === 'function') {
        saveCampaignState();
    }

    console.log(`[DEBUG] Granted ${stats.PC - prev} PC. Current PC: ${stats.PC}`);
};

// Start a debug MPR election with randomized national metrics and faction loyalty
window.runDebugElection = function(preset = 'pure_random') {
    debugDisableSaving();
    if (typeof window.skipTally === 'function') {
        try { window.skipTally(); } catch (e) {}
    }

    if (typeof initialFactionsSnapshot !== 'undefined' && Object.keys(initialFactionsSnapshot).length > 0) {
        factions = JSON.parse(JSON.stringify(initialFactionsSnapshot));
    }
    if (typeof INITIAL_PORTRAIT_FACTIONS !== 'undefined') {
        portraitFactions = [...INITIAL_PORTRAIT_FACTIONS];
    } else {
        portraitFactions = ['pdip', 'golkar_akbar', 'poros_tengah', 'abri', 'ppp', 'pkb', 'golkar_habibie', 'utusan_daerah', 'utusan_golongan', 'other_parties'];
    }

    // Apply the Oct 7 Poros Tengah merger so the 700 seats match Election Day
    if (factions['poros_tengah'] && factions['poros_tengah'].transformed) {
        const t = factions['poros_tengah'].transformed;
        factions['poros_tengah'].name = t.name;
        factions['poros_tengah'].seats = t.seats;
        factions['poros_tengah'].summary = t.summary;
        factions['poros_tengah'].biography = t.biography;
        factions['poros_tengah'].moods = t.moods;
        factions['poros_tengah'].interactions = t.interactions;

        if (factions['ppp']) factions['ppp'].seats = 0;
        const pppIdx = portraitFactions.indexOf('ppp');
        if (pppIdx > -1) portraitFactions.splice(pppIdx, 1);

        if (factions['pkb']) factions['pkb'].seats = 0;
        const pkbIdx = portraitFactions.indexOf('pkb');
        if (pkbIdx > -1) portraitFactions.splice(pkbIdx, 1);

        if (factions['other_parties']) {
            factions['other_parties'].seats = 26;
        }
    }

    let minAff = 5, maxAff = 95;
    if (preset === 'nailbiter') {
        minAff = 42;
        maxAff = 68;
    } else if (preset === 'landslide_win') {
        minAff = 65;
        maxAff = 98;
    } else if (preset === 'landslide_loss') {
        minAff = 5;
        maxAff = 38;
    } else if (preset === 'pure_random') {
        const rollArchetype = Math.random();
        if (rollArchetype < 0.25) { minAff = 10; maxAff = 55; }
        else if (rollArchetype < 0.75) { minAff = 35; maxAff = 75; }
        else { minAff = 55; maxAff = 95; }
    }

    stats.PC = randInt(0, 80);
    stats.pop = randInt(minAff, maxAff);
    stats.ref = randInt(minAff, maxAff);
    stats.econ = randInt(minAff, maxAff);
    stats.intl = randInt(minAff, maxAff);
    stats.stab = randInt(minAff, maxAff);
    stats.cendana = randInt(100 - maxAff, 100 - minAff);

    portraitFactions.forEach(key => {
        if (!factions[key]) return;
        if (key === 'golkar_habibie') {
            factions[key].affinity = randInt(Math.max(50, minAff), Math.min(100, maxAff + 20));
        } else {
            factions[key].affinity = randInt(minAff, maxAff);
        }
        factions[key].favor = Math.random() < 0.35 ? randInt(1, 2) : 0;
    });

    if (factions['abri']) {
        stats.mil = Math.round(factions['abri'].affinity);
    }

    if (window.OppositionEngine) OppositionEngine.reset();
    gameStarted = true;
    currentTurn = events.length + 1;
    updateUI();

    if (!originalUnlockAchievement && typeof window.unlockAchievement === 'function') {
        originalUnlockAchievement = window.unlockAchievement;
    }
    if (originalUnlockAchievement) {
        window.unlockAchievement = function(id) {
            if (window.debugAllowAchievements) {
                originalUnlockAchievement(id);
            }
        };
    }

    runElection();
    injectDebugTallyControls(preset);
};

// Add debug re-run and menu buttons to the election screen
function injectDebugTallyControls(lastPreset) {
    const mainPanel = document.getElementById('main-panel');
    if (!mainPanel) return;

    const debugBar = document.createElement('div');
    debugBar.id = 'debug-election-toolbar';
    debugBar.style.cssText = 'max-width: 800px; margin: 10px auto 0 auto; padding: 10px; background-color: #E0DFE3; border: 2px ridge #808080; text-align: center; font-family: "MS Sans Serif", sans-serif; font-size: 12px;';

    debugBar.innerHTML = `
        <div style="color: #000080; font-weight: bold; margin-bottom: 6px;">[ DEBUG ELECTION CONTROLS ]</div>
        <button style="width: 190px; display: inline-block; text-align: center; font-weight: bold; margin: 3px; background-color: #d0e8d0;" onclick="runDebugElection('pure_random')">&#127922; Re-Roll Pure Random</button>
        <button style="width: 190px; display: inline-block; text-align: center; margin: 3px;" onclick="runDebugElection('nailbiter')">&#9878; Roll Nail-Biter (~351)</button>
        <button style="width: 160px; display: inline-block; text-align: center; margin: 3px;" onclick="runDebugElection('landslide_win')">&#128200; Roll Landslide Win</button>
        <button style="width: 160px; display: inline-block; text-align: center; margin: 3px;" onclick="runDebugElection('landslide_loss')">&#128201; Roll Landslide Loss</button>
        <br>
        <button style="width: 220px; display: inline-block; text-align: center; margin-top: 6px; background-color: #ff9999; font-weight: bold;" onclick="exitDebugElectionToMenu()">&laquo; Exit Debug to Start Menu</button>
    `;

    mainPanel.appendChild(debugBar);
}

// DEBUG: JUMP TO THE NIGHT OF THE LONG KNIVES (HORSE-TRADING)

// State of the horse-trading tester (active flag, settings, saving backup)
window.debugHorseActive = false;
window.debugHorseSettings = { mood: 'mixed', national: 'mid', pc: 40 };
let debugSaveBackup = null;

// While a debug scenario is running, the autosave is switched off so the player's real campaign is never overwritten or deleted.
function debugDisableSaving() {
    if (debugSaveBackup) return;
    debugSaveBackup = { save: window.saveCampaignState, clear: window.clearCampaignSave };
    window.saveCampaignState = function() {};
    window.clearCampaignSave = function() {};
}

// Restore the real campaign save functions after a debug run
function debugRestoreSaving() {
    if (!debugSaveBackup) return;
    window.saveCampaignState = debugSaveBackup.save;
    window.clearCampaignSave = debugSaveBackup.clear;
    debugSaveBackup = null;
}

// Preset faction mood ranges for the horse-trading tester
const DEBUG_HORSE_MOODS = {
    mixed:    { label: 'Mixed (full spread, shows the curve)', min: 5,  max: 95 },
    hostile:  { label: 'Hostile (5-35)',                       min: 5,  max: 35 },
    wavering: { label: 'Wavering (40-60)',                     min: 40, max: 60 },
    loyal:    { label: 'Loyal (65-98)',                        min: 65, max: 98 }
};

// Preset national metric ranges for the horse-trading tester
const DEBUG_HORSE_NATIONAL = {
    low:  { label: 'Low (15-40)',  min: 15, max: 40 },
    mid:  { label: 'Mid (40-65)',  min: 40, max: 65 },
    high: { label: 'High (65-90)', min: 65, max: 90 }
};

// Jump straight to the Night of the Long Knives with randomized factions and national metrics
window.runDebugHorseTrading = function(mood, national, pc) {
    const cfg = window.debugHorseSettings;
    if (mood && DEBUG_HORSE_MOODS[mood]) cfg.mood = mood;
    if (national && DEBUG_HORSE_NATIONAL[national]) cfg.national = national;
    if (pc !== undefined && pc !== null && !isNaN(Number(pc))) cfg.pc = Math.max(0, Math.min(999, Math.round(Number(pc))));

    const nightIdx = events.findIndex(e => e.id === 'ev_eve_of_vote');
    if (nightIdx < 0) {
        alert('Debug: could not find the event "ev_eve_of_vote" in events.json.');
        return;
    }

    if (typeof window.skipTally === 'function') {
        try { window.skipTally(); } catch (e) {}
    }
    debugDisableSaving();

    // Fresh factions, then the Oct 7 Poros Tengah merger (mirrors the real game before Oct 18)
    if (typeof initialFactionsSnapshot !== 'undefined' && Object.keys(initialFactionsSnapshot).length > 0) {
        factions = JSON.parse(JSON.stringify(initialFactionsSnapshot));
    }
    portraitFactions = (typeof INITIAL_PORTRAIT_FACTIONS !== 'undefined')
        ? [...INITIAL_PORTRAIT_FACTIONS]
        : ['pdip', 'golkar_akbar', 'poros_tengah', 'abri', 'ppp', 'pkb', 'golkar_habibie', 'utusan_daerah', 'utusan_golongan', 'other_parties'];

    if (factions['poros_tengah'] && factions['poros_tengah'].transformed) {
        const t = factions['poros_tengah'].transformed;
        const pt = factions['poros_tengah'];
        pt.hasMerged = true;
        pt.name = t.name;
        pt.portraitName = t.portraitName || t.name;
        pt.seats = t.seats;
        pt.summary = t.summary;
        pt.biography = t.biography;
        pt.moods = t.moods;
        pt.interactions = t.interactions;
        if (factions['ppp']) factions['ppp'].seats = 0;
        if (factions['pkb']) factions['pkb'].seats = 0;
        portraitFactions = portraitFactions.filter(k => k !== 'ppp' && k !== 'pkb');
        if (factions['other_parties']) factions['other_parties'].seats = 26;
    }

    // Clean campaign state
    bannedFactions = {};
    activeDecrees = {};
    completedInteractions = {};
    actionCooldowns = {};
    actionUsageCount = {};
    minStats = { pop: 0, mil: 0, ref: 0, econ: 0, intl: 0, stab: 0 };
    maxCendana = 100;
    minFactions = {};
    globalMalus = 0;
    turnExecutiveUsed = false;
    turnFactionUsed = false;
    prevStatsSnapshot = null;
    lastRenderedPortraitSignature = "";
    window.horseTradeCounts = {};
    window.lastHorseTradeTicker = "";
    window.horseTradeCounts = {};
    window.lastHorseTradeTicker = "";
    window.pcLog = [];
    if (window.OppositionEngine) OppositionEngine.reset();
    window.pcLog = [];

    // Randomized national metrics and faction loyalty
    const nat = DEBUG_HORSE_NATIONAL[cfg.national];
    const mo = DEBUG_HORSE_MOODS[cfg.mood];
    stats.PC = cfg.pc;
    stats.pop = randInt(nat.min, nat.max);
    stats.ref = randInt(nat.min, nat.max);
    stats.econ = randInt(nat.min, nat.max);
    stats.intl = randInt(nat.min, nat.max);
    stats.stab = randInt(nat.min, nat.max);
    stats.cendana = randInt(100 - nat.max, 100 - nat.min);

    portraitFactions.forEach(key => {
        if (!factions[key]) return;
        factions[key].affinity = randInt(mo.min, mo.max);
        factions[key].favor = 0;
    });
    if (factions['abri']) stats.mil = Math.round(factions['abri'].affinity);
    else stats.mil = randInt(nat.min, nat.max);

    // Jump to the Night of the Long Knives turn, already in the action phase
    gameStarted = true;
    currentTurn = nightIdx + 1;
    window.resolvedEventTurn = currentTurn;
    isActionPhase = true;

    // Achievements stay locked in debug runs unless the debug menu box is ticked
    if (!originalUnlockAchievement && typeof window.unlockAchievement === 'function') {
        originalUnlockAchievement = window.unlockAchievement;
    }
    if (originalUnlockAchievement) {
        window.unlockAchievement = function(id) {
            if (window.debugAllowAchievements) originalUnlockAchievement(id);
        };
    }

    window.debugHorseActive = true;
    if (typeof syncSidebarVisibility === 'function') syncSidebarVisibility();
    updateUI();
    showActionMenu();
};

// Read the debug menu's horse-trading settings and start the tester
window.launchDebugHorseFromMenu = function() {
    const mood = (document.getElementById('dbg-horse-mood') || {}).value;
    const national = (document.getElementById('dbg-horse-national') || {}).value;
    const pc = (document.getElementById('dbg-horse-pc') || {}).value;
    runDebugHorseTrading(mood, national, pc);
};

// Refill PC to the configured amount
window.debugHorseRefill = function() {
    stats.PC = window.debugHorseSettings.pc;
    updateUI();
    showActionMenu(true);
};

// Clear the horse-trading fatigue counts
window.debugHorseResetFatigue = function() {
    window.horseTradeCounts = {};
    window.lastHorseTradeTicker = "";
    showActionMenu(true);
};

// Toolbar shown under the action menu: live gain readout for tuning, plus re-roll / refill / exit buttons.
function injectDebugHorseBar() {
    const mainPanel = document.getElementById('main-panel');
    if (!mainPanel || !window.debugHorseActive) return;
    const old = document.getElementById('debug-horse-toolbar');
    if (old) old.remove();

    const bar = document.createElement('div');
    bar.id = 'debug-horse-toolbar';
    bar.style.cssText = 'max-width: 800px; margin: 14px auto 0 auto; padding: 10px; background-color: #E0DFE3; border: 2px ridge #808080; font-family: "MS Sans Serif", sans-serif; font-size: 12px;';

    let readout = '';
    const hasMath = (typeof getGovStability === 'function' && typeof getHorseTradeNationalMult === 'function' &&
                     typeof getHorseTradeReceptiveness === 'function' && typeof HORSE_TRADE_BASE_GAIN !== 'undefined');
    if (hasMath) {
        const natMult = getHorseTradeNationalMult();
        readout += `<div style="margin-bottom: 4px;">Government Stability <b>${getGovStability()}</b> &rarr; national &times;<b>${natMult.toFixed(2)}</b> &bull; base gain <b>${HORSE_TRADE_BASE_GAIN.toFixed(2)}</b></div>`;
        readout += '<table cellpadding="2" cellspacing="0" style="width: 100%; font-size: 11px; border-top: 1px solid #808080;"><tr style="text-align: left;"><th>Faction</th><th>Loyalty</th><th>Stance (&times;)</th><th>Est. gain / overture</th></tr>';
        portraitFactions.forEach(key => {
            const f = factions[key];
            if (!f || f.seats <= 0 || bannedFactions[key]) return;
            const r = getHorseTradeReceptiveness(key, f.affinity);
            const est = HORSE_TRADE_BASE_GAIN * natMult * r.mult;
            readout += `<tr><td>${f.short || key}</td><td>${f.affinity.toFixed(1)}</td><td><font color="${r.color}"><b>${r.text}</b></font> (&times;${r.mult.toFixed(2)})</td><td>${est.toFixed(3)}</td></tr>`;
        });
        readout += '</table>';
    } else {
        readout = '<div>(Gain readout needs the new horse-trading functions in game.js.)</div>';
    }

    bar.innerHTML = `
        <div style="color: #000080; font-weight: bold; margin-bottom: 6px; text-align: center;">[ DEBUG: NIGHT OF THE LONG KNIVES ]</div>
        ${readout}
        <div style="text-align: center; margin-top: 8px;">
            <button style="width: 170px; display: inline-block; text-align: center; margin: 3px; background-color: #d0e8d0; font-weight: bold;" onclick="runDebugHorseTrading()">&#127922; Re-Roll Scenario</button>
            <button style="width: 150px; display: inline-block; text-align: center; margin: 3px;" onclick="debugHorseRefill()">&#128176; Refill PC (${window.debugHorseSettings.pc})</button>
            <button style="width: 170px; display: inline-block; text-align: center; margin: 3px;" onclick="debugHorseResetFatigue()">&#8635; Reset Fatigue</button>
            <button style="width: 200px; display: inline-block; text-align: center; margin: 3px; background-color: #ff9999; font-weight: bold;" onclick="exitDebugElectionToMenu()">&laquo; Exit Debug to Start Menu</button>
        </div>`;
    mainPanel.appendChild(bar);
}

// Render the MPR election debugger menu
window.showDebugMenu = function() {
    let html = '<center><h2>MPR ELECTION DEBUGGER</h2></center>';
    html += '<div style="padding: 15px; margin-bottom: 15px; background-color: #F5F5F5; border: 2px solid #808080; font-family: MS Sans Serif; font-size: 13px; line-height: 1.6;">';
    html += '<p style="margin-top: 0;">Jump straight to the <b>October 19, 1999 MPR General Session</b> tally with randomized national metrics, faction stances, and favors. Each click generates a brand-new 700-delegate roll call inside the semi-circular chamber.</p>';

    const achvChecked = window.debugAllowAchievements ? 'checked' : '';
    html += `<label style="cursor: pointer; font-weight: bold;"><input type="checkbox" ${achvChecked} onchange="window.debugAllowAchievements = this.checked"> Allow Achievements to unlock during Debug Elections</label>`;
    html += '</div>';

    // Night of the Long Knives (horse-trading) tester
    const hs = window.debugHorseSettings;
    const opt = (obj, sel) => Object.keys(obj).map(k => `<option value="${k}" ${k === sel ? 'selected' : ''}>${obj[k].label}</option>`).join('');
    html += '<div style="padding: 15px; margin-bottom: 15px; background-color: #F5F5F5; border: 2px solid #808080; font-family: MS Sans Serif; font-size: 13px; line-height: 1.8;">';
    html += '<b>NIGHT OF THE LONG KNIVES: HORSE-TRADING TESTER</b>';
    html += '<p style="margin: 4px 0 8px 0;">Jump straight to the October 18 floor-whip night with randomized stats and faction loyalty. Your real autosave is left untouched.</p>';
    html += `Faction loyalty: <select id="dbg-horse-mood">${opt(DEBUG_HORSE_MOODS, hs.mood)}</select><br>`;
    html += `National metrics: <select id="dbg-horse-national">${opt(DEBUG_HORSE_NATIONAL, hs.national)}</select><br>`;
    html += `Political Capital: <input type="number" id="dbg-horse-pc" min="0" max="999" value="${hs.pc}" style="width: 70px;"><br>`;
    html += '<button style="width: 320px; text-align: center; font-weight: bold; padding: 8px; margin-top: 6px; background-color: #d0e8d0;" onclick="launchDebugHorseFromMenu()">&#127769; Launch Night of the Long Knives</button>';
    html += '</div>';

    html += '<center>';
    html += '<button style="width: 320px; text-align: center; font-weight: bold; padding: 10px; background-color: #d0e8d0; margin-bottom: 8px;" onclick="runDebugElection(\'pure_random\')">&#127922; Launch Instant Random MPR Election</button><br>';
    html += '<button style="width: 320px; text-align: center; padding: 8px; margin-bottom: 8px;" onclick="runDebugElection(\'nailbiter\')">&#9878; Launch Razor-Thin Tossup</button><br>';
    html += '<button style="width: 320px; text-align: center; padding: 8px; margin-bottom: 8px;" onclick="runDebugElection(\'landslide_win\')">&#128200; Launch Overwhelming Victory</button><br>';
    html += '<button style="width: 320px; text-align: center; padding: 8px; margin-bottom: 15px;" onclick="runDebugElection(\'landslide_loss\')">&#128201; Launch Total Repudiation</button><br>';
    html += '<button style="width: 250px; text-align: center; background-color: #ff9999;" onclick="showStartMenu()">Back to Start Menu</button>';
    html += '</center>';

    document.getElementById('main-panel').innerHTML = html;
};

// On page load, wrap showStartMenu so the debug button is added to the start menu
window.addEventListener('load', function() {
    const baseShowStartMenu = window.showStartMenu;
    if (typeof baseShowStartMenu === 'function') {
        window.showStartMenu = function() {
            if (originalUnlockAchievement) {
                window.unlockAchievement = originalUnlockAchievement;
            }
            debugRestoreSaving();
            window.debugHorseActive = false;
            baseShowStartMenu();
            const mainPanel = document.getElementById('main-panel');
            if (mainPanel) {
                const btnContainer = mainPanel.querySelector('.start-menu-right');
                if (btnContainer) {
                    const dbgBtn = document.createElement('button');
                    dbgBtn.style.cssText = 'width: 250px; font-weight: bold; text-align: center; margin-top: 8px; padding: 10px; background-color: #e6d8ad; color: #000080;';
                    dbgBtn.innerHTML = '&#9881; Debug: Random MPR Election';
                    dbgBtn.onclick = function() { runDebugElection('pure_random'); };
                    btnContainer.appendChild(document.createElement('br'));
                    btnContainer.appendChild(dbgBtn);
                    const horseBtn = document.createElement('button');
                    horseBtn.style.cssText = 'width: 250px; font-weight: bold; text-align: center; margin-top: 8px; padding: 10px; background-color: #e6d8ad; color: #000080;';
                    horseBtn.innerHTML = '&#127769; Debug: Horse-Trading Night';
                    horseBtn.onclick = function() { runDebugHorseTrading(); };
                    btnContainer.appendChild(document.createElement('br'));
                    btnContainer.appendChild(horseBtn);
                }
            }
        };
        if (!gameStarted) {
            window.showStartMenu();
        }
    }

    const baseShowActionMenu = window.showActionMenu;
    if (typeof baseShowActionMenu === 'function') {
        window.showActionMenu = function() {
            const result = baseShowActionMenu.apply(this, arguments);
            if (window.debugHorseActive) injectDebugHorseBar();
            return result;
        };
    }

    const miscBox = document.querySelector('.achievements-container');
    if (miscBox) {
        const sideBtn = document.createElement('button');
        sideBtn.style.cssText = 'width: 100%; text-align: center; font-weight: bold; margin-top: 8px; margin-bottom: 0; background-color: #e6d8ad; color: #000080;';
        sideBtn.innerHTML = '&#9881; Debug MPR Election';
        sideBtn.onclick = function() { showDebugMenu(); };
        miscBox.appendChild(sideBtn);
    }
});