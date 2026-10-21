// achievements.js: achievement flags, unlock rules, toast queue and the Achievements screen.
// Load order: after storage.js, before game.js.

// Achievement Tracking Flags
let lowestGovStability = 100;
let bankBaliCleanSteps = {};
let timorPromiseSteps = {};
let sp3UpheldWithHighCendana = false;
let helpedRaisSpeaker = false;

// ACHIEVEMENTS SYSTEM
let unlockedAchievements = [];
let ACHIEVEMENTS = [];

// Load the ids of previously unlocked achievements from storage
unlockedAchievements = loadUnlockedAchievements();

// Evaluate every achievement unlock rule against the current game state
function checkAchievements() {
    if (!gameStarted) return;

    const curGovStab = getGovStability();
    if (curGovStab < lowestGovStability) {
        lowestGovStability = curGovStab;
    }

    const isEligibleDifficulty = ['medium', 'high', 'historical'].includes(selectedDifficulty);
    if (isEligibleDifficulty) {
        if (stats.pop >= 100) unlockAchievement('pop_max');
        if (stats.cendana <= 0) unlockAchievement('cendana_zero');
        if (factions['pdip'] && factions['pdip'].affinity >= 100) unlockAchievement('pdip_max');

        const hasIMFDurability = activeDecrees['imf_fuel_subsidy'] && activeDecrees['imf_bulog_deregulation'] && activeDecrees['imf_ibra_liquidation'];
        if (stats.intl >= 100 && stats.econ <= 15 && stats.pop <= 30 && hasIMFDurability) {
            unlockAchievement('always_more_austerity');
        }
    }

    if (sp3UpheldWithHighCendana) {
        unlockAchievement('halo_andi');
    }

    if (bankBaliCleanSteps.frozeEGP && bankBaliCleanSteps.pwcAccess && completedInteractions['pdip_pansus_bankbali'] && bankBaliCleanSteps.declassifiedPwC) {
        unlockAchievement('baligate_clean');
    }

    // Alt-History & Party-Banning Achievements
    if (activeDecrees['ban_pdip_subversion']) {
        unlockAchievement('kudatuli_redux');
    }
    if (activeDecrees['dissolve_golkar_old_guard']) {
        unlockAchievement('beringin_tumbang');
    }
    if (activeDecrees['abolish_abri_mpr_seats'] && activeDecrees['abolish_kodam_territorial']) {
        unlockAchievement('back_to_the_barracks');
    }
    if (activeDecrees['enforce_asas_tunggal_ban']) {
        unlockAchievement('asas_tunggal_restored');
    }
    if (activeDecrees['unify_golkar_slipi']) {
        unlockAchievement('unify_golkar');
    }
    if (activeDecrees['rainbow_coalition_accord']) {
        unlockAchievement('rainbow_coalition');
    }
}

// Unlock an achievement once, save it and show its toast
function unlockAchievement(id) {
    if (!unlockedAchievements.includes(id)) {
        unlockedAchievements.push(id);
        saveUnlockedAchievements();
        const achv = ACHIEVEMENTS.find(a => a.id === id);
        if (achv) showAchievementToast(achv);
    }
}

// Toast queue state: toasts are shown one at a time
const achievementToastQueue = [];
let achievementToastBusy = false;

// Queue an achievement toast and start showing it if idle
function showAchievementToast(achv) {
    achievementToastQueue.push(achv);
    if (!achievementToastBusy) showNextAchievementToast();
}

// Show the next queued toast with its sound, then hide it after 3.5 seconds
function showNextAchievementToast() {
    const toast = document.getElementById('achievement-toast');
    const achv = achievementToastQueue.shift();
    if (!toast || !achv) {
        achievementToastBusy = false;
        achievementToastQueue.length = 0;
        return;
    }
    achievementToastBusy = true;
    document.getElementById('toast-name').innerText = achv.title;
    toast.style.display = 'block';
    if (typeof window.playAchievementSfx === 'function') window.playAchievementSfx();
    else if (typeof window.playPopupChime === 'function') window.playPopupChime();
    setTimeout(() => {
        toast.style.display = 'none';
        if (achievementToastQueue.length > 0) setTimeout(showNextAchievementToast, 250);
        else achievementToastBusy = false;
    }, 3500);
}

// ACHIEVEMENTS SCREEN
window.showAchievementsMenu = function() {
    if (!enterMenuView()) return;
    scrollMainPanelToTop();
    let html = '<center><h2>Achievements</h2></center>';
    html += '<p style="font-family: MS Sans Serif; font-size: 13px; color: #333; text-align: center; margin-bottom: 20px;">Review your achievements below.</p>';

    ACHIEVEMENTS.forEach(achv => {
        const isUnlocked = unlockedAchievements.includes(achv.id);
        const iconClass = isUnlocked ? 'unlocked' : 'locked';

        html += `<div class="achievement-row">
                    <div class="achievement-icon ${iconClass}"><img src="${achv.icon}" alt="Achv"></div>
                    <div class="achievement-details">
                        <div class="achievement-title">${achv.title}</div>
                        <div class="achievement-desc">${achv.desc}</div>
                    </div>
                 </div>`;
    });

    html += `<center><button style="width: 250px; margin-top: 20px; background-color: #ff9999; text-align: center;" onclick="returnToPreviousView()">Back</button></center>`;
    document.getElementById('main-panel').innerHTML = html;
};