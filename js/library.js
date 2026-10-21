// library.js: in-game Library glossary screen with category filters and search.

// Current category filter and search text
let currentLibraryCategory = 'All';
let currentLibrarySearch = '';

// Category filter buttons shown in the Library
const LIBRARY_CATEGORIES = [
    'All',
    'Persons',
    'Institutions',
    'Laws & Decrees',
    'Parties & Factions',
    'Military & Security',
    'Economy & KKN',
    'Society & Movements',
    'Political Terms'
];

// Render the Library screen with search box, category filters and entries
window.showLibraryMenu = function(category = null, preserveScroll = false) {
    if (typeof enterMenuView === 'function' && !enterMenuView()) return;
    if (!preserveScroll && typeof scrollMainPanelToTop === 'function') scrollMainPanelToTop();
    if (category !== null) {
        currentLibraryCategory = category;
    }

    let html = '<center><h2>LIBRARY</h2></center>';

    // Full-Width Search Bar & Category Filter Box
    html += `<div class="library-controls-box">
        <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px; width: 100%;">
            <input type="text" id="library-search-input" class="library-search-input" style="width: 100%; flex: 1;" placeholder="Search laws, terms, acronyms, or organizations (e.g., UU No. 23/1999, ABRI, BLBI, Cendana)..." value="${escapeAttr(currentLibrarySearch)}" oninput="filterLibraryEntries(this.value)">
            <button style="width: auto; display: inline-block; --py: 4px; --px: 12px; margin: 0; font-size: 11px; text-align: center; flex-shrink: 0;" onclick="clearLibrarySearch()">Clear</button>
        </div>
        <div style="text-align: center; border-top: 1px solid #808080; padding-top: 6px;">`;

    LIBRARY_CATEGORIES.forEach(cat => {
        const isCur = (currentLibraryCategory === cat);
        html += `<button class="${isCur ? 'is-selected' : ''}" style="width: auto; display: inline-block; margin: 2px; --py: 4px; --px: 9px; font-size: 11px;" onclick="selectLibraryCategory('${cat}')">${cat}</button>`;
    });

    html += `</div></div>`;

    // Entries Container
    html += `<div id="library-entries-container">${renderLibraryEntriesHTML()}</div>`;

    html += `<center><button style="width: 250px; margin-top: 16px; background-color: #ff9999; text-align: center;" onclick="returnToPreviousView()">${gameStarted ? 'Back to Game' : 'Back'}</button></center>`;

    document.getElementById('main-panel').innerHTML = html;
};

// Switch the category filter and redraw
window.selectLibraryCategory = function(cat) {
    showLibraryMenu(cat, true);
};

// Update the search text and refresh the entry list
window.filterLibraryEntries = function(query) {
    currentLibrarySearch = query || '';
    const container = document.getElementById('library-entries-container');
    if (container) {
        container.innerHTML = renderLibraryEntriesHTML();
    }
};

// Clear the search box and refresh the entry list
window.clearLibrarySearch = function() {
    currentLibrarySearch = '';
    const input = document.getElementById('library-search-input');
    if (input) input.value = '';
    const container = document.getElementById('library-entries-container');
    if (container) {
        container.innerHTML = renderLibraryEntriesHTML();
    }
};

// Build the HTML for the entries matching the current category and search
function renderLibraryEntriesHTML() {
    if (typeof libraryData === 'undefined' || !libraryData || libraryData.length === 0) {
        return `<div class="faction-summary" style="text-align: center; color: #8B0000;">Library data (<b>localization/library.json</b>) not loaded or empty.</div>`;
    }

    const q = currentLibrarySearch.trim().toLowerCase();
    const filtered = libraryData.filter(item => {
        const matchesCat = (currentLibraryCategory === 'All') || (item.category === currentLibraryCategory);
        if (!matchesCat) return false;
        if (!q) return true;
        const termMatch = (item.term || '').toLowerCase().includes(q);
        const subMatch = (item.subtitle || '').toLowerCase().includes(q);
        const descMatch = (item.desc || '').toLowerCase().includes(q);
        return termMatch || subMatch || descMatch;
    });

    if (filtered.length === 0) {
        return `<div class="faction-summary" style="text-align: center; font-style: italic; color: #555;">No matching glossary entries found for "<b>${escapeAttr(currentLibrarySearch)}</b>" in <b>${currentLibraryCategory}</b>.</div>`;
    }

    let html = `<div style="font-size: 11px; color: #444; margin-bottom: 6px; text-align: right;">Showing <b>${filtered.length}</b> ${filtered.length === 1 ? 'entry' : 'entries'}</div>`;
    html += `<div class="library-list-well">`;

    filtered.forEach(item => {
        const hasPortrait = Boolean(item.image || item.category === 'Persons');
        const imgSrc = item.image || '';
        const shortLabel = escapeAttr((item.term || 'PHOTO').split('(')[0].trim().toUpperCase());

        if (hasPortrait) {
            html += `<div class="library-entry-card library-entry-with-portrait">
                <div class="library-person-portrait">
                    <span>[ PHOTO:<br>${shortLabel} ]</span>
                    ${imgSrc ? `<img src="${imgSrc}" class="portrait-img" alt="${shortLabel}" onerror="this.style.display='none'">` : ''}
                </div>
                <div class="library-entry-content">
                    <div class="library-entry-header">
                        <span class="library-entry-term">${item.term}</span>
                    </div>
                    ${item.subtitle ? `<div class="library-entry-sub">${item.subtitle}</div>` : ''}
                    <div class="library-entry-desc">${item.desc}</div>
                </div>
            </div>`;
        } else {
            html += `<div class="library-entry-card">
                <div class="library-entry-header">
                    <span class="library-entry-term">${item.term}</span>
                </div>
                ${item.subtitle ? `<div class="library-entry-sub">${item.subtitle}</div>` : ''}
                <div class="library-entry-desc">${item.desc}</div>
            </div>`;
        }
    });

    html += `</div>`;
    return html;
}