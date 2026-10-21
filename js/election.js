// election.js: October 19-20, 1999 MPR roll call, hemicycle, TAP MPR No. III/MPR/1999 text and the post-election verdict.

// Tuning knobs for election-night unpredictability
const ELECTION_DRAMA = {
    moodSwing: 7,          // max shared "mood of the hall" shift, in affinity points (triangular, so usually small)
    wildcardChance: 0.16,  // chance a whole caucus has a sudden change of heart or a fit of nerves
    wildcardMin: 8,        // wildcard size range, in affinity points
    wildcardMax: 20,
    crossoverRate: 0.06,   // max share of a caucus that quietly votes against its line in the secret ballot
    surgeBias: 9,          // how strongly a surge favours one side's ballots surfacing next
    blocBias: 12           // how strongly a bloc run favours one caucus' ballots surfacing next
};

// Stop the running vote-tally animation timer
function clearTallyInterval() {
    if (window.activeTallyInterval) {
        clearInterval(window.activeTallyInterval);
        window.activeTallyInterval = null;
    }
}

// Set the tally animation speed and redraw the speed buttons
window.setTallySpeed = function(speed) {
    window.tallySpeed = speed;
    const speedBtnsContainer = document.getElementById('speed-controls-container');
    if (speedBtnsContainer) {
        let html = '<b style="font-family: MS Sans Serif; font-size: 12px;">Speed: </b>';
        [1, 2, 5, 10].forEach(s => {
            html += `<button class="${window.tallySpeed === s ? 'is-selected' : ''}" style="width: 45px; --py: 3px; --px: 3px; margin: 0 3px; display: inline-block; text-align: center;" onclick="setTallySpeed(${s})">${s}x</button>`;
        });
        speedBtnsContainer.innerHTML = html;
    }
};

// Strips leader names or notes inside parentheses — e.g. "Golkar (Akbar Tandjung)" -> "Golkar"
function stripLeaderParentheses(nameStr) {
    if (!nameStr) return '';
    return String(nameStr)
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/\s*\([^)]*\)/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// Renders a color-coded party label without leader names in parentheses
function renderElectionPartyBadge(factionKey, fallbackName) {
    const f = (typeof factions !== 'undefined' && factions[factionKey]) ? factions[factionKey] : null;
    const rawName = (f && f.name) ? f.name : (fallbackName || factionKey);
    const cleanName = stripLeaderParentheses(rawName);
    const col = (typeof FACTION_HISTORICAL_COLORS !== 'undefined' && FACTION_HISTORICAL_COLORS[factionKey])
        ? FACTION_HISTORICAL_COLORS[factionKey]
        : { fill: '#808080' };
    const textCol = (typeof FACTION_TEXT_COLORS !== 'undefined' && FACTION_TEXT_COLORS[factionKey])
        ? FACTION_TEXT_COLORS[factionKey]
        : '#111111';

    return `<span style="display: inline-flex; align-items: center; gap: 6px;">
        <span class="faction-color-swatch" style="background-color: ${col.fill};"></span>
        <b style="color: ${textCol};">${cleanName}</b>
    </span>`;
}

// Generates the 700-seat semi-circular MPR hemicycle coordinates
function generateHemicycleLayout(totalSeats) {
    const numRows = 13;
    const radiiX = [];
    let weightSum = 0;

    for (let r = 0; r < numRows; r++) {
        const rx = 21 + (r / (numRows - 1)) * 26.5;
        radiiX.push(rx);
        weightSum += rx;
    }

    const rowCounts = [];
    const remainders = [];
    let allocated = 0;

    for (let r = 0; r < numRows; r++) {
        const exact = (radiiX[r] / weightSum) * totalSeats;
        const flo = Math.floor(exact);
        rowCounts.push(flo);
        remainders.push({ r: r, rem: exact - flo });
        allocated += flo;
    }

    remainders.sort((a, b) => b.rem - a.rem);
    for (let i = 0; i < totalSeats - allocated; i++) {
        rowCounts[remainders[i].r]++;
    }

    const seats = [];
    const numSectors = 5;
    const aisleGap = 0.032;
    const totalAisleAngle = (numSectors - 1) * aisleGap;
    const startMargin = 0.05;
    const usableSpan = Math.PI - (2 * startMargin) - totalAisleAngle;

    for (let r = 0; r < numRows; r++) {
        const count = rowCounts[r];
        const rx = radiiX[r];
        const ry = rx * 1.90;

        for (let j = 0; j < count; j++) {
            const u = count > 1 ? j / (count - 1) : 0.5;
            const sector = Math.min(numSectors - 1, Math.floor((j / count) * numSectors));
            const theta = (Math.PI - startMargin) - (u * usableSpan + sector * aisleGap);

            const xPct = 50 + rx * Math.cos(theta);
            const yPct = 92 - ry * Math.sin(theta);
            seats.push({ x: xPct, y: yPct, theta: theta, row: r });
        }
    }

    seats.sort((a, b) => (b.theta - a.theta) || (a.row - b.row));
    return seats;
}

// Builds the condensed English translation of TAP MPR No. III/MPR/1999
function buildTapMprDocumentHTML(accepted, forVotes, againstVotes, blankVotes) {
    const verdictWord = accepted ? 'ACCEPTED' : 'REJECTED';
    const verdictColor = accepted ? '#006400' : '#8B0000';

    return `<div class="tap-mpr-document">
        <div class="tap-mpr-header">
            <img src="photo/pancasila.png" alt="[Garuda]" style="width: 96px; height: auto; display: block; margin: 0 auto 8px auto;" onerror="this.style.display='none'">
            <div style="font-size: 13px; font-weight: bold; letter-spacing: 0.5px;">PEOPLE'S CONSULTATIVE ASSEMBLY OF THE REPUBLIC OF INDONESIA</div>
            <div style="font-size: 12px; font-weight: bold; margin-top: 26px;">DECREE OF THE PEOPLE'S CONSULTATIVE ASSEMBLY<br>OF THE REPUBLIC OF INDONESIA<br>NUMBER III/MPR/1999</div>
            <div style="font-size: 11px; font-weight: bold; margin-top: 13px;">CONCERNING<br><br>THE ACCOUNTABILITY OF THE PRESIDENT OF THE REPUBLIC OF INDONESIA<br>Prof. Dr. Ing. BACHARUDDIN JUSUF HABIBIE</div>
        </div>

        <hr style="border-top: 1px solid #444; margin: 10px 0;">

        <div class="tap-mpr-body">
            <div style="text-align: center; font-weight: bold; margin-bottom: 8px;">BY THE GRACE OF GOD ALMIGHTY<br>THE PEOPLE'S CONSULTATIVE ASSEMBLY OF THE REPUBLIC OF INDONESIA,</div>

            <p style="margin: 6px 0;"><b>Considering:</b></p>
            <ol type="a" style="margin: 4px 0 8px 18px; padding-left: 6px;">
                <li style="margin-bottom: 4px;">that the President elected and appointed by the People's Consultative Assembly of the Republic of Indonesia is subordinate and accountable to the Assembly and, at the conclusion of his term, delivers an accounting for the implementation of the Outlines of State Policy established by the 1945 Constitution and/or by the Assembly;</li>
                <li style="margin-bottom: 4px;">that Prof. Dr. Ing. Bacharuddin Jusuf Habibie has held office as President of the Republic of Indonesia since taking the oath of office on May 21, 1998;</li>
                <li style="margin-bottom: 4px;">that the President of the Republic of Indonesia Prof. Dr. Ing. Bacharuddin Jusuf Habibie delivered his Accountability Speech before the 8th Plenary Meeting on October 14, 1999, and his formal reply to the General Views of the Factions before the 11th Plenary Meeting on October 17, 1999;</li>
                <li style="margin-bottom: 4px;">that the People's Consultative Assembly must evaluate and render a binding decision upon the accountability of President Prof. Dr. Ing. Bacharuddin Jusuf Habibie during his tenure in office.</li>
            </ol>

            <p style="margin: 6px 0;"><b>Having Observed:</b> The deliberations of Commission D (October 17–18, 1999) and the secret-ballot decision of the 12th Plenary Meeting on October 19–20, 1999 (${forVotes} Accept, ${againstVotes} Reject, ${blankVotes} Blank votes).</p>

            <div style="text-align: center; font-weight: bold; margin: 10px 0 6px 0; letter-spacing: 0.5px;">DECIDES</div>
            <p style="margin: 4px 0;"><b>To Enact:</b> DECREE OF THE PEOPLE'S CONSULTATIVE ASSEMBLY OF THE REPUBLIC OF INDONESIA CONCERNING THE ACCOUNTABILITY OF THE PRESIDENT OF THE REPUBLIC OF INDONESIA Prof. Dr. Ing. BACHARUDDIN JUSUF HABIBIE.</p>

            <div class="tap-mpr-article-bo">
                <div style="text-align: center; font-weight: bold; margin-bottom: 4px;">Article 1</div>
                <div>The Accountability of the President of the Republic of Indonesia, <b>Prof. Dr. Ing. Bacharuddin Jusuf Habibie</b>, delivered before the 8th Plenary Meeting on October 14, 1999, together with the President's reply to the General Views of the Factions before the 11th Plenary Meeting on October 17, 1999 at the General Session of the People's Consultative Assembly, is hereby declared <span style="color: ${verdictColor}; font-weight: bold; text-decoration: underline;">${verdictWord}</span>.</div>
                <div style="text-align: center; font-weight: bold; margin-top: 8px; margin-bottom: 2px;">Article 2</div>
                <div style="text-align: center;">This Decree shall enter into force on the date of its enactment.</div>
            </div>

            <div class="tap-mpr-signatures">
                <div style="text-align: right; margin-bottom: 8px;">
                    Enacted in Jakarta<br>
                    on October 19, 1999
                </div>
                <div style="text-align: center; font-weight: bold; margin-bottom: 8px;">
                    PEOPLE'S CONSULTATIVE ASSEMBLY OF THE REPUBLIC OF INDONESIA<br>
                    CHAIRMAN,<br>
                    <span style="font-weight: normal; font-style: italic;">[Signed]</span><br>
                    <b>Prof. Dr. H. M. Amien Rais, M.A.</b>
                </div>
                <div style="font-size: 10.5px; color: #333; text-align: center; line-height: 1.45;">
                    <b>VICE CHAIRMEN:</b> Prof. Dr. Ir. Ginandjar Kartasasmita &bull; Drs. Kwik Kian Gie &bull; H. Matori Abdul Djalil &bull; Drs. H. M. Husnie Thamrin &bull; Hari Sabarno, S.IP., M.B.A., M.M. &bull; Prof. Dr. Jusuf Amir Feisal, S.Pd. &bull; Drs. H. A. Nazri Adlani
                </div>
            </div>
        </div>
    </div>`; 
}

// Run the MPR roll call: build the chamber, animate the tally and show the verdict
function runElection() {
    clearTallyInterval();
    window.electionPanelSnapshot = null;
    clearCampaignSave();
    scrollMainPanelToTop();
    document.getElementById('mpr-dashboard').style.display = 'none';
    document.getElementById('left-panel').style.display = 'none';
    document.getElementById('main-panel').style.width = '100%';
    updateMobileStatusBar();

    const finalData = [];
    let grandTotalFor = 0;
    let grandTotalAgainst = 0;
    let grandTotalBlank = 0;
    const govStability = getGovStability();

    const cendanaSabotage = Math.round((stats.cendana - 50) / 10);
    const stabilityFloorMod = Math.round((govStability - 50) / 10);

    // The mood of the hall on the night: one shared swing that moves every caucus together
    const chamberMood = Math.round((Math.random() + Math.random() - 1) * ELECTION_DRAMA.moodSwing);

    for (let i = 0; i < portraitFactions.length; i++) {
        const key = portraitFactions[i];
        const f = factions[key];
        if (!f || f.seats <= 0 || bannedFactions[key]) continue;

        let blankVotes = Math.floor(Math.random() * (f.seats * 0.015 + 1));
        if (blankVotes > 2) blankVotes = Math.floor(Math.random() * 3);
        const activeSeats = f.seats - blankVotes;

        const unspentFavor = f.favor || 0;
        const favorBonus = unspentFavor * 8;

        // Wildcard: now and then a whole caucus has a sudden change of heart, or a fit of nerves
        let wildcard = 0;
        if (Math.random() < ELECTION_DRAMA.wildcardChance) {
            const span = ELECTION_DRAMA.wildcardMax - ELECTION_DRAMA.wildcardMin + 1;
            wildcard = (ELECTION_DRAMA.wildcardMin + Math.floor(Math.random() * span)) * (Math.random() < 0.5 ? 1 : -1);
        }
        const rawVariance = (Math.floor(Math.random() * 17) - 9) + stabilityFloorMod - cendanaSabotage + chamberMood + wildcard;
        const cushionedVariance = (rawVariance < 0 && unspentFavor > 0)
            ? Math.round(rawVariance / (1 + unspentFavor * 0.5))
            : rawVariance;

        const advAdj = window.AdversaryEngine ? AdversaryEngine.affinityAdjust(key) : 0;
        const finalAffinity = clampFaction(key, f.affinity + favorBonus + cushionedVariance + advAdj);

        let votesFor = 0;
        if (key === 'pdip' || key === 'poros_tengah' || key === 'abri') {
            if (finalAffinity >= 80) votesFor = Math.round(activeSeats * 0.96);
            else if (finalAffinity >= 65) votesFor = Math.round(activeSeats * 0.72);
            else if (finalAffinity >= 50) votesFor = Math.round(activeSeats * 0.42);
            else if (finalAffinity >= 35) votesFor = Math.round(activeSeats * 0.15);
            else votesFor = 0;
        } else {
            votesFor = Math.round(activeSeats * (finalAffinity / 100));
        }

        votesFor = Math.max(0, Math.min(activeSeats, votesFor));
        let votesAgainst = activeSeats - votesFor;

        // Secret ballot: some members quietly vote against their caucus line. Unspent favor keeps more of them loyal.
        let crossovers = Math.floor(Math.random() * (activeSeats * ELECTION_DRAMA.crossoverRate + 1));
        if (unspentFavor > 0) crossovers = Math.floor(crossovers / 2);
        if (votesFor >= votesAgainst) {
            crossovers = Math.min(crossovers, votesFor);
            votesFor -= crossovers;
            votesAgainst += crossovers;
        } else {
            crossovers = Math.min(crossovers, votesAgainst);
            votesFor += crossovers;
            votesAgainst -= crossovers;
        }

        if (window.AdversaryEngine) {
            const adv = AdversaryEngine.electionSeatAdjust(key, f, finalAffinity, votesFor, votesAgainst, blankVotes);
            votesFor = adv.votesFor; votesAgainst = adv.votesAgainst; blankVotes = adv.blankVotes;
        }

        let rebel = null;
        if (wildcard > 0) rebel = 'surge';
        else if (wildcard < 0) rebel = 'revolt';
        else if (crossovers >= 4) rebel = 'crossvote';

        grandTotalFor += votesFor;
        grandTotalAgainst += votesAgainst;
        grandTotalBlank += blankVotes;

        finalData.push({
            key: key,
            name: stripLeaderParentheses(f.name),
            short: stripLeaderParentheses(f.short || f.name),
            totalSeats: f.seats,
            targetFor: votesFor,
            targetAgainst: votesAgainst,
            targetBlank: blankVotes,
            rebel: rebel,
            curFor: 0,
            curAgainst: 0,
            curBlank: 0,
            seatPool: []
        });
    }

    const totalChamberSeats = Math.max(1, grandTotalFor + grandTotalAgainst + grandTotalBlank);
    const hemicycleCoords = generateHemicycleLayout(totalChamberSeats);

    // Give each faction a contiguous seat block, then shuffle its seat indices so votes light up randomly
    let runningSeatOffset = 0;
    for (let i = 0; i < finalData.length; i++) {
        const pool = [];
        for (let s = 0; s < finalData[i].totalSeats; s++) {
            pool.push(runningSeatOffset + s);
        }
        for (let j = pool.length - 1; j > 0; j--) {
            const r = Math.floor(Math.random() * (j + 1));
            const tmp = pool[j];
            pool[j] = pool[r];
            pool[r] = tmp;
        }
        finalData[i].seatPool = pool;
        runningSeatOffset += finalData[i].totalSeats;
    }

    let clockTime = new Date("1999-10-19T20:30:00");
    let electionFinished = false;

    let html = '<div class="tally-box">';
    html += '<center><h2>12th Plenary Meeting of the 1999 MPR General Session</h2></center>';

    html += `<center><div id="tally-clock" class="tally-clock-fixed">OCT 19, 08:30 PM</div></center>`;

    html += '<div id="speed-controls-container" style="text-align: center; margin-bottom: 12px;">';
    html += '<b style="font-family: MS Sans Serif; font-size: 12px;">Speed: </b>';
    [1, 2, 5, 10].forEach(s => {
        html += `<button class="${window.tallySpeed === s ? 'is-selected' : ''}" style="width: 45px; --py: 3px; --px: 3px; margin: 0 3px; display: inline-block; text-align: center;" onclick="setTallySpeed(${s})">${s}x</button>`;
    });
    html += '</div>';

    // Chamber Visual Box: Tug-of-War Bar + 700-Seat Semi-Circular Hemicycle
    html += '<div class="mpr-chamber-box">';
    html += '<div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: bold; margin-bottom: 3px;">';
    html += '<span style="color: #006400;">ACCEPT: <span id="bar-label-for">0</span></span>';
    html += '<span style="color: #333333;"></span>';
    html += '<span style="color: #8B0000;">REJECT: <span id="bar-label-against">0</span></span>';
    html += '</div>';

    html += '<div class="mpr-tug-container">';
    html += '<div id="tug-for" class="mpr-tug-for" style="width: 0%;"></div>';
    html += '<div id="tug-blank" class="mpr-tug-blank" style="width: 0%;"></div>';
    html += '<div id="tug-against" class="mpr-tug-against" style="width: 0%;"></div>';
    html += '<div class="mpr-majority-marker" title="Majority Threshold"></div>';
    html += '</div>';

    html += '<div id="mpr-hemicycle" class="mpr-hemicycle-wrap">';
    for (let s = 0; s < hemicycleCoords.length; s++) {
        const pt = hemicycleCoords[s];
        html += `<div id="seat-dot-${s}" class="mpr-seat-dot" style="left: ${pt.x.toFixed(2)}%; top: ${pt.y.toFixed(2)}%;"></div>`;
    }
    html += '<div class="mpr-rostrum">MPR ROSTRUM</div>';
    html += '</div>';
    html += '</div>';

    // Faction Whiteboard Tally Table (Color-Coded Party Rows, No Parenthetical Leader Names)
    html += '<table width="100%" border="1" cellpadding="7" cellspacing="0" bordercolor="#808080">';
    html += '<tr bgcolor="#000080"><td width="36%"><font color="#FFFFFF"><b>Caucus</b></font></td><td width="16%" align="center"><font color="#FFFFFF"><b>ACCEPT</b></font></td><td width="16%" align="center"><font color="#FFFFFF"><b>REJECT</b></font></td><td width="16%" align="center"><font color="#FFFFFF"><b>BLANK</b></font></td><td width="16%" align="center"><font color="#FFFFFF"><b>SEATS</b></font></td></tr>';

    for (let i = 0; i < finalData.length; i++) {
        const d = finalData[i];
        const partyBadge = renderElectionPartyBadge(d.key, d.name);
        html += `<tr>
            <td>
                ${partyBadge}
                <div class="faction-mini-bar-wrap">
                    <div id="fbar-for-${i}" class="faction-mini-for" style="width: 0%;"></div>
                    <div id="fbar-against-${i}" class="faction-mini-against" style="width: 0%;"></div>
                </div>
            </td>
            <td align="center"><font color="#008000"><b id="f-for-${i}">0</b></font></td>
            <td align="center"><font color="#FF0000"><b id="f-against-${i}">0</b></font></td>
            <td align="center"><font color="#808080"><b id="f-blank-${i}">0</b></font></td>
            <td align="center"><b>${d.totalSeats}</b></td>
        </tr>`;
    }

    html += `<tr bgcolor="#FFFF00">
        <td><b>TALLY:</b></td>
        <td align="center"><font color="#008000" size="4"><b id="tot-for">0</b></font></td>
        <td align="center"><font color="#FF0000" size="4"><b id="tot-against">0</b></font></td>
        <td align="center"><font color="#808080" size="4"><b id="tot-blank">0</b></font></td>
        <td align="center"><b id="tot-counted">0 / ${totalChamberSeats}</b></td>
    </tr></table><br>`;

    html += '<div id="skip-btn-wrap" style="text-align: center;"><button id="skip-tally-btn" style="width: 250px; background-color: #ff9999; text-align: center;" onclick="skipTally()">SKIP ANIMATION</button></div>';
    html += '<div id="election-result-container"></div>';
    html += '</div>';

    document.getElementById('main-panel').innerHTML = html;

    const seatDots = [];
    for (let s = 0; s < hemicycleCoords.length; s++) {
        seatDots.push(document.getElementById(`seat-dot-${s}`));
    }
    const tallyEls = {
        totFor: document.getElementById('tot-for'),
        totAgainst: document.getElementById('tot-against'),
        totBlank: document.getElementById('tot-blank'),
        totCounted: document.getElementById('tot-counted'),
        labelFor: document.getElementById('bar-label-for'),
        labelAgainst: document.getElementById('bar-label-against'),
        tugFor: document.getElementById('tug-for'),
        tugBlank: document.getElementById('tug-blank'),
        tugAgainst: document.getElementById('tug-against'),
        clock: document.getElementById('tally-clock'),
        rows: finalData.map((d, i) => ({
            for: document.getElementById(`f-for-${i}`),
            against: document.getElementById(`f-against-${i}`),
            blank: document.getElementById(`f-blank-${i}`),
            barFor: document.getElementById(`fbar-for-${i}`),
            barAgainst: document.getElementById(`fbar-against-${i}`)
        }))
    };

    function formatFixedClock(dt) {
        const dayLabel = dt.getDate() === 20 ? "OCT 20, " : "OCT 19, ";
        let hrs = dt.getHours();
        const mins = String(dt.getMinutes()).padStart(2, '0');
        const ampm = hrs >= 12 ? 'PM' : 'AM';
        hrs = hrs % 12;
        if (hrs === 0) hrs = 12;
        const hrsStr = String(hrs).padStart(2, '0');
        return `${dayLabel}${hrsStr}:${mins} ${ampm}`;
    }

    function updateTallyDOM() {
        if (!tallyEls.totFor || !tallyEls.totFor.isConnected) {
            clearTallyInterval();
            return;
        }

        let curTotalFor = 0, curTotalAgainst = 0, curTotalBlank = 0;

        for (let i = 0; i < finalData.length; i++) {
            const d = finalData[i];
            const row = tallyEls.rows[i];
            curTotalFor += d.curFor;
            curTotalAgainst += d.curAgainst;
            curTotalBlank += d.curBlank;

            if (row.for) row.for.innerText = d.curFor;
            if (row.against) row.against.innerText = d.curAgainst;
            if (row.blank) row.blank.innerText = d.curBlank;
            if (row.barFor && d.totalSeats > 0) row.barFor.style.width = `${(d.curFor / d.totalSeats) * 100}%`;
            if (row.barAgainst && d.totalSeats > 0) row.barAgainst.style.width = `${(d.curAgainst / d.totalSeats) * 100}%`;
        }

        const curCounted = curTotalFor + curTotalAgainst + curTotalBlank;
        tallyEls.totFor.innerText = curTotalFor;
        tallyEls.totAgainst.innerText = curTotalAgainst;
        tallyEls.totBlank.innerText = curTotalBlank;
        tallyEls.totCounted.innerText = `${curCounted} / ${totalChamberSeats}`;

        tallyEls.labelFor.innerText = curTotalFor;
        tallyEls.labelAgainst.innerText = curTotalAgainst;

        tallyEls.tugFor.style.width = `${(curTotalFor / totalChamberSeats) * 100}%`;
        tallyEls.tugBlank.style.width = `${(curTotalBlank / totalChamberSeats) * 100}%`;
        tallyEls.tugAgainst.style.width = `${(curTotalAgainst / totalChamberSeats) * 100}%`;

        if (tallyEls.clock) {
            tallyEls.clock.innerText = formatFixedClock(clockTime);
        }

        if (curTotalFor === grandTotalFor && curTotalAgainst === grandTotalAgainst && curTotalBlank === grandTotalBlank) {
            finalizeElectionResult();
        }
    }

    function finalizeElectionResult() {
        if (electionFinished) return;
        electionFinished = true;
        clearTallyInterval();

        const speedCtrl = document.getElementById('speed-controls-container');
        if (speedCtrl) speedCtrl.style.display = 'none';
        const skipWrap = document.getElementById('skip-btn-wrap');
        if (skipWrap) skipWrap.style.display = 'none';

        unlockAchievement('complete_run');

        if (
            factions['pdip'] && factions['pdip'].affinity >= 60 &&
            factions['poros_tengah'] && factions['poros_tengah'].affinity >= 60 &&
            factions['golkar_akbar'] && factions['golkar_akbar'].affinity >= 60 &&
            factions['abri'] && factions['abri'].affinity >= 60
        ) {
            unlockAchievement('bhinneka_coalition');
        }

        if (
            bankBaliCleanSteps.defiedIMF &&
            activeDecrees['currency_board'] &&
            stats.econ >= 60
        ) {
            unlockAchievement('camdessus_arms');
        }

        const accepted = grandTotalFor > grandTotalAgainst && (!window.AdversaryEngine || AdversaryEngine.meetsQuorum(grandTotalFor));
        let resHTML = '';
        if (!accepted && grandTotalFor > grandTotalAgainst && window.AdversaryEngine) resHTML += AdversaryEngine.quorumFailureHTML(grandTotalFor);

        if (accepted) {
            unlockAchievement('win_any');
            if (window.AdversaryEngine) AdversaryEngine.achievementsOnWin();
            if (selectedDifficulty === 'historical') unlockAchievement('win_historical');

            const hasIMFDurability = activeDecrees['imf_fuel_subsidy'] && activeDecrees['imf_bulog_deregulation'] && activeDecrees['imf_ibra_liquidation'];
            if (stats.intl >= 100 && stats.econ <= 15 && stats.pop <= 30 && hasIMFDurability) {
                unlockAchievement('bruning_impressed');
            }

            if (lowestGovStability < 35) unlockAchievement('mr_crack');
            if (completedInteractions['loyalist_bppt'] && completedInteractions['loyalist_n250']) unlockAchievement('cleared_for_takeoff');
            if (!window.wirantoLocked && activeDecrees['police_military_separation'] && activeDecrees['human_rights_commission_powers']) {
                unlockAchievement('dwifungsi_kaput');
            }
            if (timorPromiseSteps.countdown && timorPromiseSteps.votes && timorPromiseSteps.peacekeepers) {
                unlockAchievement('thankless_burden');
            }
            if (stats.cendana >= 85 && stats.ref <= 25) unlockAchievement('enak_jamanku');
            if (stats.PC === 0) unlockAchievement('fumes_in_the_tank');
            if (
                factions['poros_tengah'] && factions['poros_tengah'].affinity >= 85 &&
                factions['utusan_golongan'] && factions['utusan_golongan'].affinity >= 80 &&
                factions['other_parties'] && factions['other_parties'].affinity >= 80
            ) {
                unlockAchievement('habibi_ya_habibi');
            }

            if (stats.ref >= 85 && stats.cendana <= 25) {
                unlockAchievement('singa_reformasi');
            }
            if (activeDecrees['invoke_supersemar_ii'] && activeDecrees['cendana_restoration_pact']) {
                unlockAchievement('orba_jilid_dua');
            }

            let title = "HABIBIE HOLDS ON";
            let desc = "";

            if (grandTotalFor >= 450) {
                title = "OVERWHELMING VICTORY";
                desc = "An absolute landslide. Against all expectations, the MPR has embraced your Accountability Speech with a commanding majority, cementing your mandate through 2004.";
                unlockAchievement('win_overwhelming');
            } else if (grandTotalFor >= 380) {
                title = "COMFORTABLE MAJORITY";
                desc = "A comfortable victory. The MPR has accepted your Accountability Speech, securing your mandate with room to spare as your coalition holds firm.";
                unlockAchievement('win_comfortable');
            } else {
                title = "NARROW UPSET";
                desc = "A nail-biting upset in the dead of night. By the thinnest of margins, you have reversed the historical verdict of October 1999 and survived the General Session.";
                unlockAchievement('win_narrow');
            }

            const winImg = (gameConfig && gameConfig.victoryImage) ? gameConfig.victoryImage : 'photo/victory.png';
            resHTML += `<center><h1 style="color:#008000; margin-bottom: 5px;">${title} (${grandTotalFor} – ${grandTotalAgainst})</h1></center>
                <p align="center" style="font-family: MS Sans Serif; font-size: 13px; line-height: 1.5;">${desc}</p>
                <center><img src="${winImg}" class="content-image" style="width: 400px; height: 200px; object-fit: cover; border: 3px inset #FFFFFF; background-color: #A9A9A9; margin-top: 10px; margin-bottom: 15px;" alt="Victory"></center>`;
        } else {
            if (grandTotalFor >= 318 && grandTotalFor <= 326) {
                unlockAchievement('deja_vu_322');
            }
            if (
                factions['golkar_habibie'] && factions['golkar_habibie'].affinity >= 85 &&
                factions['golkar_akbar'] && factions['golkar_akbar'].affinity < 35
            ) {
                unlockAchievement('et_tu_akbar');
            }
            if (helpedRaisSpeaker && factions['poros_tengah'] && factions['poros_tengah'].affinity >= 65) {
                unlockAchievement('gus_dur_twist');
            }

            let title = "MPR REJECTS ACCOUNTABILITY SPEECH";
            let desc = "";

            if (grandTotalFor >= 320) {
                title = "NARROWLY DEFEATED";
                desc = "A razor-thin loss echoing the real history of October 20, 1999. Betrayed behind the secret-ballot curtain by last-minute defections, your Accountability Speech falls just short, prompting you to withdraw your presidential candidacy before dawn.";
                unlockAchievement('lose_narrow');
            } else if (grandTotalFor >= 200) {
                title = "DECISIVE DEFEAT";
                desc = "A decisive rejection. The MPR has formally voted down your Accountability Speech, ending your seventeen-month caretaker presidency.";
                unlockAchievement('lose_decisive');
            } else {
                title = "A RESOUNDING 'NO'";
                desc = "A historic repudiation. United across ideological lines, the MPR has resoundingly rejected your Accountability Speech in an overwhelming landslide.";
                unlockAchievement('lose_overwhelming');
            }

            const loseImg = (gameConfig && gameConfig.defeatImage) ? gameConfig.defeatImage : 'photo/defeat.png';
            resHTML += `<center><h1 style="color:#FF0000; margin-bottom: 5px;">${title} (${grandTotalFor} – ${grandTotalAgainst})</h1></center>
                <p align="center" style="font-family: MS Sans Serif; font-size: 13px; line-height: 1.5;">${desc}</p>
                <center><img src="${loseImg}" class="content-image" style="width: 400px; height: 200px; object-fit: cover; border: 3px inset #FFFFFF; background-color: #A9A9A9; margin-top: 10px; margin-bottom: 15px;" alt="Defeat"></center>`;
        }

        // Append the official English translation of TAP MPR No. III/MPR/1999
        resHTML += buildTapMprDocumentHTML(accepted, grandTotalFor, grandTotalAgainst, grandTotalBlank);

        window.lastElectionSummary = {
            won: accepted,
            forVotes: grandTotalFor,
            againstVotes: grandTotalAgainst,
            blankVotes: grandTotalBlank,
            totalSeats: totalChamberSeats,
            factionBreakdown: finalData.map(d => ({
                key: d.key,
                name: d.name,
                short: d.short,
                seats: d.totalSeats,
                forVotes: d.targetFor,
                againstVotes: d.targetAgainst,
                blankVotes: d.targetBlank,
                note: d.rebel
            })),
            verdictHTML: resHTML
        };

        resHTML += getPostElectionNavHTML('verdict');
        const resContainer = document.getElementById('election-result-container');
        if (resContainer) resContainer.innerHTML = resHTML;
    }

    window.skipTally = function() {
        clearTallyInterval();
        for (let i = 0; i < finalData.length; i++) {
            const d = finalData[i];
            const remFor = d.targetFor - d.curFor;
            const remAgainst = d.targetAgainst - d.curAgainst;
            const remBlank = d.targetBlank - d.curBlank;

            const outcomes = [];
            for (let f = 0; f < remFor; f++) outcomes.push('for');
            for (let a = 0; a < remAgainst; a++) outcomes.push('against');
            for (let b = 0; b < remBlank; b++) outcomes.push('blank');

            // Shuffle remaining outcomes so skipped seats also light up randomly across the bloc
            for (let j = outcomes.length - 1; j > 0; j--) {
                const r = Math.floor(Math.random() * (j + 1));
                const tmp = outcomes[j];
                outcomes[j] = outcomes[r];
                outcomes[r] = tmp;
            }

            for (let k = 0; k < outcomes.length; k++) {
                const seatIdx = d.seatPool.pop();
                const dot = seatDots[seatIdx];
                if (!dot) continue;
                if (outcomes[k] === 'for') dot.className = 'mpr-seat-dot seat-for';
                else if (outcomes[k] === 'against') dot.className = 'mpr-seat-dot seat-against';
                else dot.className = 'mpr-seat-dot seat-blank';
            }

            d.curFor = d.targetFor;
            d.curAgainst = d.targetAgainst;
            d.curBlank = d.targetBlank;
        }
        clockTime = new Date("1999-10-20T00:53:00");
        updateTallyDOM();
    };

    // Drama engine. The final totals are already decided; what changes is the ORDER the ballots surface in.
    // The count moves in phases (surges, caucus runs, hushed lulls) instead of a smooth random drip,
    // and a side that is trailing is more likely to see a sudden surge.
    const drama = { phase: 'neutral', last: '', left: 14, favorType: null, blocIdx: -1, pace: 1, paceAcc: 0 };

    function pickFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
    function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

    function currentTotals() {
        let f = 0, a = 0, b = 0;
        for (let i = 0; i < finalData.length; i++) {
            f += finalData[i].curFor;
            a += finalData[i].curAgainst;
            b += finalData[i].curBlank;
        }
        return { f: f, a: a, b: b };
    }

    function beginNextPhase() {
        const t = currentTotals();
        const lead = t.f - t.a;
        const remFor = grandTotalFor - t.f;
        const remAgainst = grandTotalAgainst - t.a;

        // The trailing side is the more likely to find a sudden surge
        const opts = [];
        if (remFor > 0) opts.push({ kind: 'surge_for', w: lead < 0 ? 4 + Math.min(6, Math.abs(lead) / 6) : 1.2 });
        if (remAgainst > 0) opts.push({ kind: 'surge_against', w: lead > 0 ? 3 + Math.min(5, lead / 6) : 1.2 });
        opts.push({ kind: 'bloc', w: 3 }, { kind: 'lull', w: 1.5 }, { kind: 'neutral', w: 2.5 });

        const usable = opts.filter(o => o.kind !== drama.last || o.kind === 'neutral');
        let roll = Math.random() * usable.reduce((s, o) => s + o.w, 0);
        let kind = usable[usable.length - 1].kind;
        for (let i = 0; i < usable.length; i++) {
            roll -= usable[i].w;
            if (roll <= 0) { kind = usable[i].kind; break; }
        }

        drama.phase = kind;
        drama.last = kind;
        drama.favorType = null;
        drama.blocIdx = -1;

        if (kind === 'surge_for') {
            drama.favorType = 'for';
            drama.left = randInt(14, 34);
            drama.pace = 1.6;
        } else if (kind === 'surge_against') {
            drama.favorType = 'against';
            drama.left = randInt(14, 34);
            drama.pace = 1.6;
        } else if (kind === 'bloc') {
            const cands = [];
            for (let i = 0; i < finalData.length; i++) {
                const d = finalData[i];
                const rem = (d.targetFor - d.curFor) + (d.targetAgainst - d.curAgainst) + (d.targetBlank - d.curBlank);
                if (rem >= 3) cands.push({ idx: i, rem: rem, rebel: d.rebel });
            }
            if (cands.length === 0) {
                drama.phase = 'neutral';
                drama.left = randInt(8, 16);
                drama.pace = 1;
                return;
            }
            const rebels = cands.filter(c => c.rebel);
            const chosen = (rebels.length > 0 && Math.random() < 0.55) ? pickFrom(rebels) : pickFrom(cands);
            drama.blocIdx = chosen.idx;
            drama.left = Math.min(chosen.rem, randInt(8, 22));
            drama.pace = 1.15;
        } else if (kind === 'lull') {
            drama.left = randInt(5, 12);
            drama.pace = 0.35;
        } else {
            drama.left = randInt(12, 28);
            drama.pace = 1;
        }
    }

    // Reveal one ballot, weighted by the current phase. Returns false once nothing is left.
    function castOneBallot() {
        const avail = [];
        let totalW = 0;
        for (let i = 0; i < finalData.length; i++) {
            const d = finalData[i];
            const blocBoost = (drama.phase === 'bloc' && drama.blocIdx === i) ? ELECTION_DRAMA.blocBias : 1;
            const rems = {
                for: d.targetFor - d.curFor,
                against: d.targetAgainst - d.curAgainst,
                blank: d.targetBlank - d.curBlank
            };
            ['for', 'against', 'blank'].forEach(type => {
                if (rems[type] <= 0) return;
                const typeBoost = (type === drama.favorType) ? ELECTION_DRAMA.surgeBias : 1;
                const w = rems[type] * blocBoost * typeBoost;
                avail.push({ idx: i, type: type, w: w });
                totalW += w;
            });
        }
        if (avail.length === 0) return false;

        let roll = Math.random() * totalW;
        let pick = avail[avail.length - 1];
        for (let k = 0; k < avail.length; k++) {
            roll -= avail[k].w;
            if (roll <= 0) { pick = avail[k]; break; }
        }

        const facData = finalData[pick.idx];
        // Pop a random seat index from this faction's shuffled pool so seats light up unpredictably
        const dot = seatDots[facData.seatPool.pop()];

        if (pick.type === 'for') {
            facData.curFor++;
            if (dot) dot.className = 'mpr-seat-dot seat-for';
        } else if (pick.type === 'against') {
            facData.curAgainst++;
            if (dot) dot.className = 'mpr-seat-dot seat-against';
        } else {
            facData.curBlank++;
            if (dot) dot.className = 'mpr-seat-dot seat-blank';
        }

        clockTime.setSeconds(clockTime.getSeconds() + 22);

        // End the phase early when its target runs dry
        drama.left--;
        if (drama.phase === 'bloc') {
            const b = finalData[drama.blocIdx];
            if (b.curFor >= b.targetFor && b.curAgainst >= b.targetAgainst && b.curBlank >= b.targetBlank) drama.left = 0;
        } else if (drama.favorType === 'for' && finalData.every(d => d.curFor >= d.targetFor)) {
            drama.left = 0;
        } else if (drama.favorType === 'against' && finalData.every(d => d.curAgainst >= d.targetAgainst)) {
            drama.left = 0;
        }
        if (drama.left <= 0) beginNextPhase();
        return true;
    }

    window.activeTallyInterval = setInterval(() => {
        // Phase pace stretches or squeezes the player's chosen speed (surges rush, lulls crawl)
        drama.paceAcc += window.tallySpeed * drama.pace;
        const steps = Math.floor(drama.paceAcc);
        drama.paceAcc -= steps;

        for (let s = 0; s < steps; s++) {
            if (!castOneBallot()) {
                clearTallyInterval();
                updateTallyDOM();
                return;
            }
        }

        if (!electionFinished) {
            updateTallyDOM();
        }
    }, 120);
}

// POST-ELECTION VERDICT & STATE OF THE REPUBLIC DOSSIER
function getPostElectionNavHTML(activeView) {
    const isVerdict = activeView === 'verdict';
    const isDossier = activeView === 'dossier';

    return `<div style="margin-top: 14px; padding-top: 12px; border-top: 2px solid #808080; text-align: center;">
        <button class="${isVerdict ? 'is-selected' : ''}" style="width: 220px; display: inline-block; text-align: center; margin: 4px;" onclick="showPostElectionSection('verdict')">Verdict &amp; Decree</button>
        <button class="${isDossier ? 'is-selected' : ''}" style="width: 230px; display: inline-block; text-align: center; margin: 4px;" onclick="showPostElectionSection('dossier')">State of the Republic</button>
        <br>
        <button style="width: 250px; display: inline-block; text-align: center; margin-top: 10px; background-color: #d0e8d0;" onclick="showEpilogue()">Continue</button>
    </div>`;
}

// Show the chosen section of the post-election screen
window.showPostElectionSection = function(section) {
    const container = document.getElementById('election-result-container');
    if (!container || !window.lastElectionSummary) return;

    if (section === 'verdict') {
        container.innerHTML = window.lastElectionSummary.verdictHTML + getPostElectionNavHTML('verdict');
    } else if (section === 'dossier') {
        container.innerHTML = buildStateOfTheRepublicHTML() + getPostElectionNavHTML('dossier');
    }

    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
};


// Epilogue: image id, caption, heading and text (images are optional: photo/epilogue_<id>.png)
const EPILOGUE_SECTIONS = [
    {
        id: 'end',
        caption: 'Epilogue',
        title: '',
        text: 'In the history that actually happened, the People’s Consultative Assembly voted 355 to 322 shortly after midnight on October 20, 1999, with nine abstentions and four spoiled ballots, to reject B.J. Habibie’s accountability speech. He withdrew from the presidential race the same day. Hours later, Abdurrahman Wahid, the nearly blind Nahdlatul Ulama cleric everyone called Gus Dur, defeated Megawati Sukarnoputri 373 to 313 in the first contested presidential vote in the republic’s history. Megawati, whose party had won the most seats in June, was elected vice president the following day, after her supporters had spent a night angry in the streets. Whatever happened in your version of that hall, the larger fact is the same. A seventeen month caretaker presidency ended in a vote, counted on green slips of paper, and not by a decree, a coup, or a crowd storming the gates.<br><br>To see how far that was from where the country had been, it helps to remember the numbers. The rupiah had traded at roughly 2,400 to the dollar in mid-1997. By June 1998 it was near 17,000. Real GDP fell by about 13 percent in 1998, a collapse the IMF itself later described as possibly the largest single-year fall of any country in modern economic history. Inflation approached 80 percent. Suharto had signed his second letter of intent with the Fund on January 15, 1998, while Michel Camdessus stood watching with folded arms. The closure of sixteen banks in November 1997 had been meant to restore confidence and instead set off a run. Then came the Trisakti shootings on May 12, 1998, the riots of May 13 to 15 in which well over a thousand people died, many in burning shopping malls, and the sexual violence against ethnic Chinese women documented by the Joint Fact-Finding Team. On May 21, Suharto resigned after thirty-two years, nine days after students had occupied the parliament building.<br><br>The government recapitalized the banking system at a cost of about Rp 658 trillion, equal to more than half of a year’s GDP, and public debt rose from roughly 24 percent of GDP before the crisis to about 93 percent. The Indonesian Bank Restructuring Agency, created in January 1998, spent six years selling off seized assets and chasing the owners of banks that had looted their own depositors, with mixed success, before it was dissolved in 2004. Four state banks were merged into Bank Mandiri in 1999. The IMF programs themselves ran from 1997 to the end of 2003, and Indonesia drew about SDR 7.4 billion, around $11.1 billion. The government of Susilo Bambang Yudhoyono, who had won the presidency in 2004, decided not to extend the arrangement. It paid $3.75 billion in June 2006, then announced on October 5 that it would settle the remaining SDR 2.2 billion, about $3.2 billion, and the payment cleared that month. The original schedule had run to December 2010. A commodity boom, a current account surplus, and tighter budgets made it possible. In January 2007 Jakarta also asked for the Consultative Group on Indonesia, the donor forum that had met under World Bank leadership since 1967, to be disbanded. Its own Independent Evaluation Office reviewed the episode in 2003, and critics such as Joseph Stiglitz argued that the early bank closures and tight money deepened the panic. What no one disputes is that Indonesia came out of the decade owing the IMF nothing and growing at around 5 to 6 percent a year.<br><br>Between 1999 and 2002 the MPR amended the 1945 Constitution four times. It limited presidents to two terms, moved to direct presidential elections, created the Constitutional Court, and ended the military’s appointed seats in the legislatures by 2004. Regional autonomy took effect on January 1, 2001, and from 2005 governors, mayors, and regents were elected directly. The Press Law of September 1999 abolished the licensing regime that had let information ministers shut newspapers, and Tempo, Detik, and Editor, banned in 1994, were back on the stands. The Corruption Eradication Commission, the KPK, was founded in 2002 and spent its first decade jailing ministers, governors, and a police general, which no one in the Suharto era would have thought possible.<br><br>Habibie had offered East Timor a choice in January 1999, and on August 30, 78.5 percent voted against autonomy within Indonesia. Militias backed by elements of the army burned Dili and drove hundreds of thousands from their homes before the Australian-led INTERFET force under Major General Peter Cosgrove landed on September 20. The Assembly formally accepted the result in October, and Timor-Leste became independent on May 20, 2002.<br><br>Aceh took longer. After the tsunami of December 26, 2004 killed roughly 170,000 people in the province, the Finnish mediator Martti Ahtisaari helped broker the Helsinki memorandum between Jakarta and the Free Aceh Movement, signed on August 15, 2005. The Malino agreements had already calmed the communal killing in Poso and Ambon, though the Bali bombings of October 12, 2002, which killed 202 people, showed that new dangers had arrived alongside the old ones. No senior officer was convicted for May 1998, the disappearance of activists such as Wiji Thukul remained unresolved, and Suharto died on January 27, 2008 without ever standing trial.<br><br>Habibie lived to see much of it. He founded The Habibie Center in 1999 to promote democracy and technology, and he died on September 11, 2019, at 83. In the years between, Yudhoyono won a second term in 2009, and in 2014 Joko Widodo, a furniture seller from Solo with no ties to the old elite, won the presidency.<br><br>But the reform era was never a straight line. In September 2019, weeks before Habibie’s death, parliament revised the KPK law in a way that most observers believed weakened it, and students returned to the streets. Prabowo Subianto, a former special forces commander and Suharto’s former son-in-law, whose dismissal from the army in 1998 was part of the story you have just played, won the presidency in February 2024 and was inaugurated on October 20, 2024, twenty-five years to the day after Wahid. In March 2025 parliament unanimously passed a revision of the armed forces law that widened the list of civilian posts open to active-duty officers, and in August 2025 protests spread to more than a hundred cities after the killing of Affan Kurniawan, a 21-year-old ride-hailing driver, under a police armored vehicle. Human Rights Watch’s 2026 report counted the growing role of military officers in civilian affairs among the year’s chief concerns. Against that, hundreds of thousands of mostly young people took to the streets and the press kept reporting, which is a different picture from 1997.'
    }
];

// Epilogue image block: shows a placeholder until the real image exists
function buildEpilogueImageHTML(sec) {
    const src = (gameConfig && gameConfig.epilogueImages && gameConfig.epilogueImages[sec.id]) || `photo/epilogue/epilogue_${sec.id}.png`;
    const cap = escapeAttr(sec.caption);
    return `<center><div style="position: relative; width: 100%; max-width: 880px; aspect-ratio: 2 / 1; max-height: 440px; box-sizing: border-box; border: 3px inset #FFFFFF; background-color: #A9A9A9; margin-bottom: 15px; overflow: hidden;">
        <span style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; text-align: center; font-size: 11px; color: #555; padding: 6px;">[ PHOTO:<br>${cap} ]</span>
        <img src="${escapeAttr(src)}" alt="${cap}" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'">
    </div></center>`;
}

// Show the epilogue: replaces the whole game window with a Situation-style panel
window.showEpilogue = function() {
    const sum = window.lastElectionSummary;
    const mainPanel = document.getElementById('main-panel');
    const leftPanel = document.getElementById('left-panel');
    const mprDashboard = document.getElementById('mpr-dashboard');
    if (!mainPanel) return;

    if (mainPanel.querySelector('#election-result-container')) window.electionPanelSnapshot = mainPanel.innerHTML;
    window.epilogueActive = true;
    if (leftPanel) leftPanel.style.display = 'none';
    if (mprDashboard) mprDashboard.style.display = 'none';
    mainPanel.style.width = '100%';
    if (typeof updateMobileStatusBar === 'function') updateMobileStatusBar();

    const won = Boolean(sum && sum.won);
    const intro = won
        ? 'The Assembly accepted your <i>Pidato Pertanggungjawaban</i>. A president had stood before the MPR and been held to account, and the answer came in a vote, not by decree or by force.'
        : 'The Assembly did not accept your <i>Pidato Pertanggungjawaban</i>. It stung, but the verdict was delivered by vote in a hall of seven hundred delegates, and power passed the way it should in a republic: peacefully, under the rules.';

    let html = '<center><h2>EPILOGUE</h2></center>';
    const bodyStyle = 'padding: 15px; margin-bottom: 10px; font-family: MS Sans Serif, sans-serif; font-size: 13px; line-height: 1.6; color: #333; text-align: justify;';

    html += `<div style="${bodyStyle}"><b>Dear Mr. President,</b><br><br>${intro} You inherited a nation on the edge. You leave it with a free press, free parties and a ballot box that works. What follows is not your doing alone, but it could not have begun without the doors you opened.</div>`;

    EPILOGUE_SECTIONS.forEach(sec => {
        html += buildEpilogueImageHTML(sec);
        html += `<center><h3 style="margin: 0 0 4px 0;">${sec.title}</h3></center>`;
        html += `<div style="${bodyStyle}">${sec.text}</div>`;
    });

    html += `<div style="${bodyStyle} text-align: center; font-style: italic;">Indonesia is still unfinished, and still hopeful. Thank you for playing.</div>`;
    html += '<center>';
    html += '<button style="width: 300px; text-align: center; margin-bottom: 8px; --py: 10px; --px: 10px;" onclick="returnToTitleScreen()">Return to Title Screen</button><br>';
    html += '<button style="width: 300px; text-align: center; background-color: #ff9999; --py: 10px; --px: 10px;" onclick="closeEpilogue()">Back to Results</button>';
    html += '</center>';
    mainPanel.innerHTML = html;
    scrollMainPanelToTop();
};

// Leave the epilogue and restore the election results with the side panels
window.closeEpilogue = function() {
    window.epilogueActive = false;
    syncSidebarVisibility();
    if (typeof updateMobileStatusBar === 'function') updateMobileStatusBar();
    const mainPanel = document.getElementById('main-panel');
    if (window.electionPanelSnapshot && mainPanel) {
        mainPanel.innerHTML = window.electionPanelSnapshot;
        scrollMainPanelToTop();
    } else {
        returnToTitleScreen();
    }
};