// js/oppositionAI/opposition.js
// General Opposition AI & State Framework (Pure Code — No Hardcoded Text).
// All localization strings reside in data/language/<lang>/opposition.json.
// Effects are currently stripped (no-op) to establish the general opposition architecture first.

(function () {
    'use strict';

    //  CONFIG
    const OPP_CONFIG = {
        scale: { easy: 0.25, medium: 0.6, high: 0.85, historical: 1.0 },
        incidentChance: { 1: 0.45, 2: 0.8, 3: 0.95 },
        newsKeepTurns: 1,
        maxNewsShown: 5,
        historicalPerTurn: 2,
        historicalGraceDays: 10,
        taintedWalkoutRate: 0.0,        // Effects disabled (was 0.30)
        grievanceCap: 20,
        grievanceDriftPerPoint: 0.0,    // Effects disabled (was 0.15)
        grievanceElectionPenalty: 0.0,  // Effects disabled (was 1.2)
        rivalryEcho: 0.0,               // Effects disabled (was 0.5)
        tensionThreshold: 62,
        tensionDrift: 0.0,              // Effects disabled (was 2)
        wireBetrayalIntoVote: false,    // Effects disabled
        betrayalVoteFactor: 0.0,
        drama: {
            easy:       { moodSwing: 7,  wildcardChance: 0.16, crossoverRate: 0.06 },
            medium:     { moodSwing: 7,  wildcardChance: 0.16, crossoverRate: 0.06 },
            high:       { moodSwing: 9,  wildcardChance: 0.19, crossoverRate: 0.07 },
            historical: { moodSwing: 11, wildcardChance: 0.22, crossoverRate: 0.08 }
        }
    };

    const GRIEVANCE_DECREES = {
        police_military_separation: 2,
        civilian_defense_ministry: 2,
        abolish_kodam_territorial: 3,
        aceh_special_status_law: 2,
        regional_autonomy: 1,
        maluku_irja_division: 1
    };
    const REGIONAL_DECREES = new Set(['aceh_special_status_law', 'regional_autonomy', 'maluku_irja_division']);
    const SECULAR_ACTIONS = new Set(['chinatown_reconciliation', 'womens_commission', 'sbkri_review']);
    const ISLAMIST_ACTIONS = new Set([]);
    const KNOWN_PEACEFUL = {
        ev_referendum_countdown: [0],
        ev_timor_votes: [0],
        ev_peacekeeper_decision: [0, 1]
    };

    // Incident definitions (effects cleared for base opposition script)
    const INCIDENTS = [
        { id: 'kostrad_gates',        minLevel: 2, weight: 3, effects: {} },
        { id: 'bais_cash',            minLevel: 2, weight: 2, cond: () => stats.cendana < 95,  effects: {} },
        { id: 'armed_protesters',     minLevel: 2, weight: 2, cond: () => stats.cendana >= 55, effects: {} },
        { id: 'shops_burning',        minLevel: 2, weight: 2, cond: () => stats.stab < 60,     effects: {} },
        { id: 'minority_scapegoat',   minLevel: 2, weight: 2, cond: () => stats.cendana >= 60, effects: {} },
        { id: 'dossier_leak',         minLevel: 2, weight: 2, effects: {} },
        { id: 'banyuwangi_ninjas',    minLevel: 2, weight: 2, effects: {} },
        { id: 'maluku_ammo',          minLevel: 2, weight: 2, effects: {} },
        { id: 'capital_flight_panic', minLevel: 2, weight: 2, cond: () => stats.econ < 65,     effects: {} },
        { id: 'censure_talks',        minLevel: 3, weight: 3, effects: {} },
        { id: 'grumbling',            minLevel: 1, maxLevel: 1, weight: 3, effects: {} },
        { id: 'timor_militia',        minLevel: 0, weight: 0, effects: {} },
        { id: 'aceh_flare',           minLevel: 0, weight: 0, effects: {} }
    ];

    //  STATE
    function freshState() {
        return {
            wirantoLocked: true,
            wirantoStrain: 0,
            lastTurnCendana: 95,
            grievance: 0,
            tainted: {},
            crisis: false,
            abriAbolished: false,
            timorFlare: 0,
            acehFlare: 0,
            disruptionTurn: -1,
            firedOnce: {},
            lastVariant: {},
            news: [],
            historyShown: {},
            historyTurn: -1,
            coalitionTicks: 0,
            incidentCount: 0,
            grievancePopupTier: 0,
            rivalryPopupTurn: -1,
            log: []
        };
    }

    let state = freshState();

    // Sync legacy globals so existing UI / save code remains compatible
    function syncGlobals() {
        window.wirantoLocked = state.wirantoLocked;
        window.wirantoStrain = state.wirantoStrain;
        window.lastTurnCendana = state.lastTurnCendana;
    }

    function sc() {
        return OPP_CONFIG.scale[selectedDifficulty] !== undefined ? OPP_CONFIG.scale[selectedDifficulty] : 1;
    }
    function active(key) {
        const f = (typeof factions !== 'undefined') ? factions[key] : null;
        return Boolean(f && f.seats > 0 && !bannedFactions[key]);
    }
    function markDisruption() { state.disruptionTurn = currentTurn; }
    function quietTurn() { return state.disruptionTurn !== currentTurn; }
    function flareRunning() { return state.timorFlare > 0 || state.acehFlare > 0; }

    function applyDrama() {
        if (typeof ELECTION_DRAMA === 'undefined') return;
        const d = OPP_CONFIG.drama[selectedDifficulty] || OPP_CONFIG.drama.high;
        Object.assign(ELECTION_DRAMA, d);
    }

    // PARADOX-STYLE LOCALIZATION (UNFINISHED)
    function getLocRoot() {
        return window.oppLocData || window.advTextData || {};
    }

    function resolveNode(path) {
        let node = getLocRoot();
        for (const k of String(path).split('.')) {
            node = (node && typeof node === 'object') ? node[k] : undefined;
        }
        return node;
    }

    function formatTokens(str, params) {
        if (typeof str !== 'string' || !params) return str;
        return str
            .replace(/\$([A-Z0-9_]+)\$/gi, (_, k) => (params[k] !== undefined ? params[k] : `$${k}$`))
            .replace(/\{([a-zA-Z0-9_]+)\}/g, (_, k) => (params[k] !== undefined ? params[k] : `{${k}}`));
    }

    // Returns localized string for key, or the raw key if missing
    function loc(key, params) {
        const node = resolveNode(key);
        if (typeof node === 'string') return formatTokens(node, params);
        return formatTokens(key, params);
    }

    // Returns a rotating entry from a localization array, or a key placeholder object
    function pickLocEntry(poolKey, path) {
        const list = resolveNode(path);
        const fallbackEntry = {
            source: loc('ui.fallback_source'),
            headline: path,
            body: loc('ui.fallback_body')
        };
        if (!Array.isArray(list) || list.length === 0) return fallbackEntry;
        if (list.length === 1) return list[0];
        const last = state.lastVariant[poolKey];
        let idx = Math.floor(Math.random() * list.length);
        if (idx === last) idx = (idx + 1) % list.length;
        state.lastVariant[poolKey] = idx;
        return list[idx];
    }

    function turnDateLabel(turn) {
        const ev = (typeof events !== 'undefined' && events) ? events[turn - 1] : null;
        return (ev && ev.date) ? ev.date : '';
    }

    function addNews(kind, entry, id) {
        if (!entry) return;
        state.news.push({
            kind,
            id: id || null,
            source: entry.source || loc('ui.fallback_source'),
            headline: entry.headline || '',
            body: entry.body || '',
            turn: currentTurn,
            date: turnDateLabel(currentTurn)
        });
        if (state.news.length > 40) state.news.shift();
    }

    function flushPopups() {}

    //  EFFECT APPLICATION (DISABLED)
    // Stubbed out: effects are intentionally disabled while building the general opposition script.
    function applyIncidentEffects(_eff) {
        return {};
    }

    function addGrievance(n, why) {
        if (!n) return;
        state.grievance = Math.max(0, Math.min(OPP_CONFIG.grievanceCap, state.grievance + n));
        if (why) state.log.push({ turn: currentTurn, grievance: n, why });
    }

    //  MILITARY PACT & HOSTILITY
    function milHostility() {
        if (typeof factions === 'undefined' || !factions['abri']) return 0;
        if (state.abriAbolished || bannedFactions['abri']) return 3;
        const aff = factions['abri'].affinity;
        if (!state.wirantoLocked) {
            if (aff < 25) return 3;
            if (aff < 55) return 2;
            if (aff < 70) return 1;
            return 0;
        }
        if (aff < 40) return 2;
        if (Math.abs(state.wirantoStrain || 0) >= 12) return 1;
        return 0;
    }

    // Tracks military affinity and Wiranto pact state without applying opposition stat penalties
    function applyMilitaryDelta(delta) {
        if (typeof factions === 'undefined' || !factions['abri'] || !delta) return;

        if (state.wirantoLocked) {
            if (delta <= -15) {
                state.wirantoLocked = false;
                const totalDrop = delta + state.wirantoStrain;
                state.wirantoStrain = 0;
                factions['abri'].affinity = clampFaction('abri', factions['abri'].affinity + totalDrop);
            } else if (delta < 0) {
                state.wirantoStrain += delta;
                if (state.wirantoStrain <= -20) {
                    state.wirantoLocked = false;
                    factions['abri'].affinity = clampFaction('abri', 50 + state.wirantoStrain);
                    state.wirantoStrain = 0;
                } else {
                    factions['abri'].affinity = Math.max(50, clampFaction('abri', factions['abri'].affinity + delta));
                }
            } else {
                state.wirantoStrain = Math.min(0, state.wirantoStrain + Math.round(delta * 0.5));
                factions['abri'].affinity = clampFaction('abri', Math.max(50, factions['abri'].affinity + delta));
            }
        } else {
            factions['abri'].affinity = clampFaction('abri', factions['abri'].affinity + delta);
        }

        stats.mil = Math.round(factions['abri'].affinity);
        syncGlobals();
    }

    //  INCIDENTS & THEATRES
    function fireIncident(inc) {
        if (!inc) return;
        applyIncidentEffects(inc.effects);
        markDisruption();
        state.log.push({ turn: currentTurn, incident: inc.id });
        state.incidentCount = (state.incidentCount || 0) + 1;
        addNews('opposition', pickLocEntry('inc_' + inc.id, 'opposition.incidents.' + inc.id));
    }

    function startFlare(theatre) {
        if (flareRunning()) return;
        if (theatre === 'timor') state.timorFlare = 3;
        else state.acehFlare = 3;
    }

    function runMilitaryIncidents() {
        if (!quietTurn()) return false;

        if (state.timorFlare > 0) {
            fireIncident(INCIDENTS.find(i => i.id === 'timor_militia'));
            state.timorFlare--;
            return true;
        }
        if (state.acehFlare > 0) {
            fireIncident(INCIDENTS.find(i => i.id === 'aceh_flare'));
            state.acehFlare--;
            return true;
        }

        const lvl = milHostility();
        if (lvl === 0) return false;

        if (lvl >= 2 && !state.firedOnce.silence) {
            state.firedOnce.silence = true;
            markDisruption();
            addNews('opposition', pickLocEntry('silence', 'opposition.silence'));
            return true;
        }

        const chance = (OPP_CONFIG.incidentChance[lvl] || 0.5) * Math.min(1, 0.4 + 0.6 * sc());
        if (Math.random() > chance) return false;

        const pool = INCIDENTS.filter(i =>
            i.weight > 0 &&
            lvl >= i.minLevel &&
            (i.maxLevel === undefined || lvl <= i.maxLevel) &&
            (!i.cond || i.cond())
        );
        if (pool.length === 0) return false;

        const total = pool.reduce((a, i) => a + i.weight, 0);
        let r = Math.random() * total;
        let pick = pool[0];
        for (const inc of pool) {
            r -= inc.weight;
            if (r <= 0) { pick = inc; break; }
        }
        fireIncident(pick);
        return true;
    }

    function detectTheatre(evId) {
        const id = String(evId || '').toLowerCase();
        if (/timor|referendum|peacekeeper|interfet|dili/.test(id)) return 'timor';
        if (/aceh|\bgam\b/.test(id)) return 'aceh';
        return null;
    }

    function isPeacefulOption(ev, idx, option) {
        if (KNOWN_PEACEFUL[ev.id] && KNOWN_PEACEFUL[ev.id].indexOf(idx) >= 0) return true;
        const e = option.effects || {};
        const cred = (Number(e.intl) || 0) + (Number(e.ref) || 0);
        const mil = (Number(e.mil) || 0) + (Number(e.abri) || 0);
        return cred > 0 && mil <= 0;
    }

    // Event choice hook (sabotage stat overrides disabled)
    function onEventChoice(ev, idx, option) {
        const out = { sabotaged: false, effects: null, suffix: '' };
        const theatre = detectTheatre(ev && ev.id);
        if (!theatre || !option) return out;
        if (!isPeacefulOption(ev, idx, option)) return out;

        addGrievance(2, theatre + '_concession');
        return out;
    }

    //  DECREES, RIVALRY & COERCION
    function getDecreeGateFailures(_decree) {
        // Extra opposition decree gates disabled while opposition effects are off
        return [];
    }

    function triggerConstitutionalCrisis() {
        state.crisis = true;
        state.abriAbolished = true;
        state.wirantoLocked = false;
        state.wirantoStrain = 0;
        syncGlobals();
        addGrievance(6, 'abolished_abri_seats');
        markDisruption();
        addNews('opposition', pickLocEntry('crisis', 'opposition.constitutionalCrisis'));
    }

    function snapshotSeats() {
        const snap = {};
        for (const k in factions) snap[k] = factions[k].seats || 0;
        return snap;
    }

    function recordSeatTransfer(snap, _decreeId) {
        if (!snap) return;
        for (const k in factions) {
            const gain = (factions[k].seats || 0) - (snap[k] || 0);
            if (gain > 0) state.tainted[k] = (state.tainted[k] || 0) + gain;
        }
    }

    function rivalTrigger(kind) {
        if (!kind || sc() <= 0.25) return;
        if (kind === 'secular' && active('poros_tengah')) {
            addNews('opposition', pickLocEntry('poros_sec', 'opposition.rivalry.porosSecular'));
        } else if (kind === 'islamic' && active('pdip')) {
            addNews('opposition', pickLocEntry('pdip_isl', 'opposition.rivalry.pdipIslamic'));
        }
    }

    function onDecreeEnacted(type, _def) {
        if (GRIEVANCE_DECREES[type]) addGrievance(GRIEVANCE_DECREES[type], 'decree:' + type);
        if (type === 'abolish_abri_mpr_seats') triggerConstitutionalCrisis();

        if (REGIONAL_DECREES.has(type) && milHostility() >= 2 && quietTurn()) {
            markDisruption();
            if (type === 'aceh_special_status_law') {
                startFlare('aceh');
                addNews('opposition', pickLocEntry('reg_aceh', 'opposition.regionalSabotage.aceh'));
            } else {
                addNews('opposition', pickLocEntry('reg_sabotage', 'opposition.regionalSabotage.default'));
            }
            addGrievance(2, 'regional_reform');
        }
        rivalTrigger(SECULAR_ACTIONS.has(type) ? 'secular' : (ISLAMIST_ACTIONS.has(type) ? 'islamic' : null));
    }

    function onActionExecuted(type) {
        rivalTrigger(SECULAR_ACTIONS.has(type) ? 'secular' : (ISLAMIST_ACTIONS.has(type) ? 'islamic' : null));
    }

    function beforeEffects() {
        return {
            pdip: active('pdip') ? factions.pdip.affinity : null,
            pt: active('poros_tengah') ? factions.poros_tengah.affinity : null
        };
    }

    function afterEffects(_snap) {
        // Rivalry echo affinity subtraction disabled
    }

    // Faction leverage override hook (e.g. Central Axis Kingmaker Extortion); returns null while disabled
    function getLeverageOverride(_factionKey) {
        return null;
    }

    // Faction interaction backfire hook (Akbar blackmail, Kiemas dinners, Axis walkout); effects disabled
    function evaluateFactionInteraction(_factionKey, _interactionId, _timesUsed) {
        return {
            isThreatBurned: false,
            isKiemasDulled: false,
            suppressLeverage: false,
            cancelFactionGain: false,
            overrideAlertMsg: null,
            appendAlertMsg: null,
            abortTurnAdvance: false
        };
    }

    //  END OF TURN
    function onEndOfTurn() {
        if (!gameStarted) return;
        const lvl = milHostility();
        state.log = state.log.slice(-60);

        runMilitaryIncidents();
        const quiet = quietTurn();

        if (lvl >= 2) addGrievance(lvl === 3 ? 2 : 1, 'hostile_military');
        else if (lvl === 0 && state.grievance > 0 && !state.crisis) state.grievance = Math.max(0, state.grievance - 0.5);

        if (active('pdip') && state.grievance > 0) {
            const tier = state.grievance >= 12 ? 3 : (state.grievance >= 8 ? 2 : (state.grievance >= 4 ? 1 : 0));
            if (tier > state.grievancePopupTier && quiet) {
                state.grievancePopupTier = tier;
                addNews('opposition', pickLocEntry('grievance_t' + tier, 'opposition.grievance.tier' + tier));
            }
        }

        if (sc() > 0.25 && active('pdip') && active('poros_tengah')) {
            const a = factions.pdip;
            const b = factions.poros_tengah;
            if (a.affinity >= OPP_CONFIG.tensionThreshold && b.affinity >= OPP_CONFIG.tensionThreshold) {
                state.coalitionTicks++;
                if (state.coalitionTicks % 2 === 1 && quiet) {
                    addNews('opposition', pickLocEntry('both_courted', 'opposition.coalitionTension'));
                }
            }
        }

        state.lastTurnCendana = stats.cendana;
        syncGlobals();
        flushPopups();
    }

    //  UI & NEWS RENDERING (LOCALIZED)
    function getMilitaryStatusLineHTML() {
        let key = 'status.abri.collapsed';
        let color = '#8B0000';
        let bold = true;

        if (typeof bannedFactions !== 'undefined' && bannedFactions['abri']) {
            key = 'status.abri.dissolved';
            color = '#666666';
        } else if (state.wirantoLocked) {
            const s = Math.abs(state.wirantoStrain || 0);
            if (s === 0) {
                key = 'status.abri.firm';
                color = '#006400';
                bold = false;
            } else if (s <= 6) {
                key = 'status.abri.uneasy';
                color = '#4682B4';
                bold = false;
            } else if (s <= 13) {
                key = 'status.abri.strained';
                color = '#FF8C00';
            } else {
                key = 'status.abri.breaking';
                color = '#8B0000';
            }
        }

        const tip = escapeAttr(loc(key + '_tip'));
        const text = loc(key + '_line');
        const weight = bold ? 'font-weight: bold; ' : '';
        return `<span style="color: ${color}; ${weight}cursor: help; border-bottom: 1px dotted ${color};" title="${tip}" onclick="showMobileTooltipNote(this.title)">${text}</span>`;
    }

    function getPdipStreetStatusHTML(affinity) {
        let tier = 'standing_down';
        let color = '#006400';
        if (affinity < 25) { tier = 'riots'; color = '#8B0000'; }
        else if (affinity < 40) { tier = 'unrest'; color = '#FF4500'; }
        else if (affinity < 60) { tier = 'watchful'; color = '#B8860B'; }

        const label = loc(`status.pdip_street.${tier}_label`);
        const note = loc(`status.pdip_street.${tier}_note`);
        return `<b>${loc('status.pdip_street.heading')}:</b> <font color="${color}"><b>${label}</b></font> <span style="font-size: 11px; color: #555;"><i>(${note})</i></span><br>`;
    }

    function getCendanaWhipNoteHTML() {
        if (stats.cendana >= 70) {
            return `<div style="margin-top: 6px; color: #8B0000; font-weight: bold;">&#9888; ${loc('status.cendana_whip.high')}</div>`;
        }
        if (stats.cendana <= 30) {
            return `<div style="margin-top: 6px; color: #006400; font-weight: bold;">&#10003; ${loc('status.cendana_whip.low')}</div>`;
        }
        return '';
    }

    function parseTurnDate(turn) {
        const t = Date.parse(turnDateLabel(turn));
        return isNaN(t) ? null : t;
    }

    function ensureHistorical() {
        if (state.historyTurn === currentTurn) return;
        state.historyTurn = currentTurn;
        const list = resolveNode('historical');
        const t = parseTurnDate(currentTurn);
        if (!Array.isArray(list) || t === null) return;
        const grace = OPP_CONFIG.historicalGraceDays * 86400000;
        list.filter(h => !state.historyShown[h.id] && Date.parse(h.from) <= t && t <= Date.parse(h.to) + grace)
            .sort((a, b) => Date.parse(b.from) - Date.parse(a.from))
            .slice(0, OPP_CONFIG.historicalPerTurn)
            .forEach(h => {
                state.historyShown[h.id] = currentTurn;
                addNews('historical', h, h.id);
            });
    }

    function renderNewsPanel() {
        ensureHistorical();
        const fromTurn = currentTurn - OPP_CONFIG.newsKeepTurns;
        const items = state.news.filter(n => n.turn >= fromTurn).slice(-OPP_CONFIG.maxNewsShown).reverse();
        if (items.length === 0) return '';
        const countKey = items.length === 1 ? 'ui.news_report_May' : 'ui.news_report_plural';
        let html = `<div class="adv-news"><div class="adv-news-head"><span>${loc('ui.news_panel_title')}</span><span>${loc(countKey, { COUNT: items.length, count: items.length })}</span></div>`;
        items.forEach((n, i) => {
            html += `<details class="adv-news-item ${n.kind === 'opposition' ? 'adv-opp' : 'adv-hist'}"${i === 0 ? ' open' : ''}>
                <summary><span class="adv-news-src">${n.source}${n.date ? ' &bull; ' + n.date : ''}</span>${n.headline}</summary>
                <div class="adv-news-body">${n.body}</div>
            </details>`;
        });
        return html + '</div>';
    }

    //  ELECTION & WHIP HOOKS (EFFECTS DISABLED)
    function getBetrayalPressure() {
        return 0;
    }

    function getDefectionRate(_key, _effAff) {
        return 0;
    }

    function affinityAdjust(_key) {
        return 0;
    }

    function taintLoss(_key, _voteRate) {
        return 0;
    }

    function electionSeatAdjust(_key, _f, _finalAffinity, votesFor, votesAgainst, blankVotes) {
        return { votesFor, votesAgainst, blankVotes };
    }

    function meetsQuorum(_forVotes) {
        return true;
    }

    function quorumFailureHTML(forVotes) {
        return `<div class="faction-summary" style="text-align:justify;color:var(--tone-bad);margin-bottom:8px;">${loc('election.quorum_failure', { VOTES: forVotes, votes: forVotes })}</div>`;
    }

    function achievementsOnWin() {
        if (typeof unlockAchievement !== 'function') return;
        if (state.crisis) unlockAchievement('crisis_survivor');
        if (state.incidentCount >= 12) unlockAchievement('under_siege');
        if (active('pdip') && active('poros_tengah') && state.coalitionTicks >= 2 &&
            factions.pdip.affinity >= 70 && factions.poros_tengah.affinity >= 70) {
            unlockAchievement('odd_bedfellows');
        }
    }

    //  SAVE / RESTORE / DEBUG
    function reset() {
        state = freshState();
        syncGlobals();
        applyDrama();
    }

    function getState() {
        return JSON.parse(JSON.stringify(state));
    }

    function restoreState(s) {
        state = Object.assign(freshState(), s || {});
        syncGlobals();
        applyDrama();
    }

    const engine = {
        config: OPP_CONFIG,
        loc,
        reset,
        getState,
        restoreState,
        milHostility,
        applyMilitaryDelta,
        getDecreeGateFailures,
        getLeverageOverride,
        evaluateFactionInteraction,
        onEndOfTurn,
        onEventChoice,
        onDecreeEnacted,
        onActionExecuted,
        flushPopups,
        renderNewsPanel,
        getMilitaryStatusLineHTML,
        getPdipStreetStatusHTML,
        getCendanaWhipNoteHTML,
        getNews: () => state.news.slice(),
        beforeEffects,
        afterEffects,
        snapshotSeats,
        recordSeatTransfer,
        getBetrayalPressure,
        getDefectionRate,
        affinityAdjust,
        taintLoss,
        electionSeatAdjust,
        meetsQuorum,
        quorumFailureHTML,
        achievementsOnWin,
        debug: {
            list: () => INCIDENTS.map(i => i.id),
            fire: id => { const i = INCIDENTS.find(x => x.id === id); if (i) fireIncident(i); },
            crisis: () => { triggerConstitutionalCrisis(); flushPopups(); },
            news: () => state.news,
            state: () => state
        }
    };

    window.OppositionEngine = engine;
    window.AdversaryEngine = engine; // Legacy alias
})();