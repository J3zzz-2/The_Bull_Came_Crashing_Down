// mobile.js: mobile-only UI: collapsible status panel, sticky status bar, touch notes and scrolling.
// Load order: before game.js.

// Whether the left status panel is collapsed on mobile
window.mobileLeftPanelCollapsed = false;

// MOBILE COLLAPSIBLE LEFT PANEL & TOUCH TOOLTIP HELPERS
function setupMobileLeftPanelToggle() {
    const leftPanel = document.getElementById('left-panel');
    if (!leftPanel || document.getElementById('mobile-left-toggle')) return;

    const btn = document.createElement('button');
    btn.id = 'mobile-left-toggle';
    btn.className = 'mobile-panel-toggle-btn';
    btn.onclick = function() {
        window.mobileLeftPanelCollapsed = !window.mobileLeftPanelCollapsed;
        updateMobileToggleLabel();
    };
    leftPanel.insertBefore(btn, leftPanel.firstChild);
    updateMobileToggleLabel();
}

// Refresh the toggle button label and the collapsed state
function updateMobileToggleLabel() {
    const leftPanel = document.getElementById('left-panel');
    const btn = document.getElementById('mobile-left-toggle');
    if (!leftPanel || !btn) return;

    if (window.mobileLeftPanelCollapsed) {
        leftPanel.classList.add('mobile-collapsed');
        const govText = gameStarted ? getGovStabilityWord() : '-';
        btn.innerHTML = `[+] Expand Presidential Status (PC: ${stats.PC} &bull; Gov: ${govText})`;
    } else {
        leftPanel.classList.remove('mobile-collapsed');
        btn.innerHTML = `[&ndash;] Minimize Presidential Status Panel`;
    }
}

// Metric keys and labels listed in the mobile status sheet
const MOBILE_STATUS_METRICS = [
    ['pop', 'Popularity'],
    ['mil', 'Military Support'],
    ['ref', 'Reformasi Credibility'],
    ['econ', 'Economic Health'],
    ['intl', 'International Standing'],
    ['stab', 'National Stability'],
    ['cendana', 'Cendana Influence']
];

// Sticky top bar shown on small screens during a campaign (hidden by CSS on desktop)
function updateMobileStatusBar() {
    const bar = document.getElementById('mobile-status-bar');
    if (!bar) return;

    const leftPanel = document.getElementById('left-panel');
    const visible = gameStarted && !(leftPanel && leftPanel.style.display === 'none');
    bar.classList.toggle('active', visible);
    if (!visible) {
        setMobileStatusSheetOpen(false);
        return;
    }

    document.getElementById('msb-pc').innerText = stats.PC;
    const govWord = getGovStabilityWord();
    const govEl = document.getElementById('msb-gov');
    govEl.innerText = govWord;
    govEl.style.color = GOV_WORD_COLORS[govWord] || '#000000';
    document.getElementById('msb-turn').innerText = `${Math.min(currentTurn, events.length)}/${events.length}`;

    if (bar.classList.contains('open')) renderMobileStatusSheet();
}

// Fill the status sheet with the current metric values
function renderMobileStatusSheet() {
    const sheet = document.getElementById('msb-sheet');
    if (!sheet) return;
    let html = '';
    MOBILE_STATUS_METRICS.forEach(([key, label]) => {
        const valEl = document.getElementById('val-' + key);
        html += `<div class="msb-row"><span>${label}</span><span>${valEl ? valEl.innerHTML : ''}</span></div>`;
    });
    sheet.innerHTML = html;
}

// Open or close the status sheet and update its accessibility state
function setMobileStatusSheetOpen(open) {
    const bar = document.getElementById('mobile-status-bar');
    if (!bar) return;
    bar.classList.toggle('open', open);
    const toggle = document.getElementById('msb-toggle');
    if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    const caret = document.getElementById('msb-caret');
    if (caret) caret.innerHTML = open ? '&#9650;' : '&#9660;';
    if (open) renderMobileStatusSheet();
}

// Toggle the status sheet open or closed
window.toggleMobileStatusSheet = function() {
    const bar = document.getElementById('mobile-status-bar');
    if (bar) setMobileStatusSheetOpen(!bar.classList.contains('open'));
};

// Tapping anywhere outside the bar closes the metrics sheet
document.addEventListener('click', function(e) {
    const bar = document.getElementById('mobile-status-bar');
    if (bar && bar.classList.contains('open') && !bar.contains(e.target)) {
        setMobileStatusSheetOpen(false);
    }
});

// Show a tooltip note in the mobile note box
window.showMobileTooltipNote = function(text) {
    const box = document.getElementById('mobile-status-tooltip-box');
    if (!box || !text) return;
    box.innerHTML = `<b>&#9432; Note:</b> ${text}`;
    box.classList.add('active');
};

// Scroll the main panel to the top, offset for the sticky status bar on mobile
function scrollMainPanelToTop() {
    if (window.innerWidth <= 820) {
        const mainPanel = document.getElementById('main-panel');
        if (mainPanel) {
            const bar = document.getElementById('mobile-status-bar');
            const barHeight = (bar && bar.classList.contains('active')) ? bar.offsetHeight : 0;
            const y = mainPanel.getBoundingClientRect().top + window.scrollY - 8 - barHeight;
            window.scrollTo({ top: Math.max(0, y), behavior: 'instant' });
            return;
        }
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
}