(function() {
    // 0. UI REMOVAL
    const existingUi = document.getElementById("tp-automation-ui");
    if (existingUi) existingUi.remove();

    // 1. DATA PERSISTENCE
    const LOGS_KEY = '1day_teenpatti_logs';
    const STATS_KEY = '1day_teenpatti_stats';
    window.tpLogs = JSON.parse(localStorage.getItem(LOGS_KEY)) || [];
    window.tpStats = JSON.parse(localStorage.getItem(STATS_KEY)) || { wins: 0, losses: 0, units: 0 };
    
    let activeMid = null;
    let activePrediction = null;

    const saveData = () => {
        localStorage.setItem(LOGS_KEY, JSON.stringify(window.tpLogs));
        localStorage.setItem(STATS_KEY, JSON.stringify(window.tpStats));
    };

    /* ---------------- POKER EVALUATOR ---------------- */
    function calculateWin(cardStr) {
        const cards = cardStr.split(',');
        const parseCard = c => {
            let rankStr = c.substring(0, c.length - 2);
            let ranks = {"2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14};
            return { r: ranks[rankStr] || 0, s: c.slice(-2) };
        };
        const getScore = (hand) => {
            hand.sort((a,b) => b.r - a.r);
            const isFlush = hand[0].s === hand[1].s && hand[1].s === hand[2].s;
            let isStraight = (hand[0].r === hand[1].r + 1 && hand[1].r === hand[2].r + 1);
            if (hand[0].r === 14 && hand[1].r === 3 && hand[2].r === 2) isStraight = true;
            const tie = (hand[0].r * 10000) + (hand[1].r * 100) + hand[2].r;
            if (hand[0].r === hand[1].r && hand[1].r === hand[2].r) return 60000000 + tie;
            if (isStraight && isFlush) return 50000000 + tie;
            if (isStraight) return 40000000 + tie;
            if (isFlush) return 30000000 + tie;
            if (hand[0].r === hand[1].r || hand[1].r === hand[2].r) return 20000000 + tie;
            return 10000000 + tie;
        };
        let hA = [parseCard(cards[0]), parseCard(cards[2]), parseCard(cards[4])];
        let hB = [parseCard(cards[1]), parseCard(cards[3]), parseCard(cards[5])];
        let sA = getScore(hA), sB = getScore(hB);
        return sA > sB ? "A" : (sB > sA ? "B" : "TIE");
    }

    /* ---------------- CORE ENGINES (1:1 RAW) ---------------- */
    function fullMarkov1(history) {
        let AA = 1, AB = 1, BA = 1, BB = 1;
        for (let i = 1; i < history.length; i++) {
            const p = history[i - 1], c = history[i];
            if (p === "A" && c === "A") AA++; else if (p === "A" && c === "B") AB++;
            else if (p === "B" && c === "A") BA++; else if (p === "B" && c === "B") BB++;
        }
        const last = history[history.length - 1];
        let pA = (last === "A") ? AA / (AA + AB) : BA / (BA + BB);
        let pB = (last === "A") ? AB / (AA + AB) : BB / (BA + BB);
        return { side: pA > pB ? "A" : "B", conf: Math.max(pA, pB) };
    }

    function fullMarkov2(history) {
        let counts = {AAA:1,AAB:1,ABA:1,ABB:1,BAA:1,BAB:1,BBA:1,BBB:1};
        for (let i = 2; i < history.length; i++) {
            const key = history[i-2] + history[i-1] + history[i];
            if (counts[key] !== undefined) counts[key]++;
        }
        const last2 = history.slice(-2).join("");
        const a = counts[last2 + "A"], b = counts[last2 + "B"];
        const pA = a / (a + b), pB = b / (a + b);
        return { side: pA > pB ? "A" : "B", conf: Math.max(pA, pB) };
    }

    function fullSniper(historyStr) {
        const depths = [5, 4, 3];
        for (let d of depths) {
            const seq = historyStr.slice(-d);
            const firstOccur = historyStr.slice(0, -d).lastIndexOf(seq); // Boundary fix
            if (firstOccur !== -1 && historyStr[firstOccur + d]) {
                return { side: historyStr[firstOccur + d], depth: d };
            }
        }
        return null;
    }

    /* ---------------- REGIME DETECTION ---------------- */
    function alternationScore(history) {
        let alt = 0;
        for(let i=1; i<history.length; i++) { if(history[i] !== history[i-1]) alt++; }
        return alt / (history.length - 1 || 1);
    }

    function streakStrength(history) {
        let streak = 1, max = 1;
        for(let i=1; i<history.length; i++) {
            if(history[i] === history[i-1]) { streak++; if(streak > max) max = streak; }
            else { streak = 1; }
        }
        return max;
    }

    /* ---------------- META-CONTROLLER ---------------- */
    function getDynamicPrediction(data) {
        const history = data.map(r => r.winner).filter(x => x === "A" || x === "B");
        if (history.length < 20) return { win: "WAIT", reason: "COLLECTING" };

        const historyStr = history.join('');
        const recent = history.slice(-10);
        const alt = alternationScore(recent);
        const streak = streakStrength(recent);

        if (alt > 0.45 && alt < 0.65 && streak < 3) return { win: "WAIT", reason: "UNCERTAIN" };

        let res; let label;
        if (streak >= 4 || alt < 0.35) {
            res = fullMarkov2(history); label = "MARKOV-2";
        } else if (alt > 0.7) {
            const snp = fullSniper(historyStr);
            if (snp) return { win: snp.side, reason: `SNIPER | ${snp.depth}d` };
            res = { side: history[history.length-1] === "A" ? "B" : "A", conf: 0.71 }; label = "SNIPER-FADE";
        } else {
            res = fullMarkov1(history); label = "MARKOV-1";
        }

        if (res.conf < 0.52) return { win: "WAIT", reason: "LOW EDGE" };
        return { win: res.side, reason: `${label} | ${Math.round(res.conf*100)}%` };
    }

    /* ---------------- LORDS ORDER PLACEMENT ---------------- */
    function executeWager() {
        let attempts = 0;
        const fillSlip = setInterval(() => {
            attempts++; if (attempts > 20) { clearInterval(fillSlip); return; }
            const stakeInput = document.querySelector('input[placeholder="Enter Stake"]');
            const submitBtn = document.querySelector('.p-4.bg-card.border-t button');
            if (stakeInput && submitBtn && stakeInput.offsetParent !== null) {
                const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                setter.call(stakeInput, "50"); // STAKE 50
                stakeInput.dispatchEvent(new Event('input', { bubbles: true }));
                stakeInput.dispatchEvent(new Event('change', { bubbles: true }));
                setTimeout(() => { if(!submitBtn.disabled) submitBtn.click(); }, 350);
                clearInterval(fillSlip);
            }
        }, 100);
    }

    function clickBet(side) {
        const target = "Player " + side;
        let attempts = 0;
        const scan = setInterval(() => {
            attempts++; if (attempts > 25) { clearInterval(scan); return; }
            const cards = document.querySelectorAll('.bg-background.border-2.overflow-hidden');
            for (let c of cards) {
                if (c.innerText.includes(target)) {
                    const backBtn = c.querySelector('.bg-back');
                    if (backBtn && !backBtn.classList.contains('cursor-not-allowed')) {
                        clearInterval(scan);
                        setTimeout(() => { backBtn.click(); executeWager(); }, 1500);
                        return;
                    }
                }
            }
        }, 500);
    }

    /* ---------------- DATA PROCESSORS ---------------- */
    function recordRound(mid, winner) {
        if (!mid || winner === "TIE") return;
        if (window.tpLogs.some(r => String(r.mid) === String(mid))) return;
        
        if (activePrediction && activePrediction.win !== "WAIT") {
            if (activePrediction.win === winner) { window.tpStats.wins++; window.tpStats.units += 0.98; }
            else { window.tpStats.losses++; window.tpStats.units -= 1.0; }
        }
        window.tpLogs.push({ mid: String(mid), winner: winner });
        saveData();
    }

    function processGameData(node) {
        if (!node.mid || !node.card) return;
        if (String(node.mid) !== activeMid) {
            activeMid = String(node.mid);
            activePrediction = getDynamicPrediction(window.tpLogs);
            updateUI();
            if (activePrediction?.win !== "WAIT") clickBet(activePrediction.win);
        }
        const cards = node.card.split(',');
        if (cards.length === 6 && !cards.includes("1")) {
            const winner = calculateWin(node.card);
            recordRound(node.mid, winner);
            updateUI();
        }
    }

    /* ---------------- NETWORK & UI ---------------- */
    function updateUI() {
        const total = window.tpStats.wins + window.tpStats.losses;
        const rate = total > 0 ? ((window.tpStats.wins / total) * 100).toFixed(1) : 0;
        const intelEl = document.getElementById('tp-intel-box');
        if (!intelEl) return;
        intelEl.innerHTML = `
            <b style="color:#0ff;">V8.4 UNITY AUTO (LORDS)</b><br>
            <div style="text-align:center;padding:10px;">
                <span style="font-size:24px;color:${activePrediction?.win === 'A' ? '#f44' : (activePrediction?.win === 'B' ? '#4af' : '#ff0')};font-weight:bold;">
                    ${activePrediction?.win === "WAIT" ? "WAITING..." : "PLAYER " + activePrediction?.win}
                </span><br>
                <span style="font-size:11px;color:#ffd700;">${activePrediction?.reason || "STANDBY"}</span>
            </div>
            <div style="background:#111;padding:8px;border-radius:6px;font-size:11px;">
                W: ${window.tpStats.wins} | L: ${window.tpStats.losses} | <b>${rate}%</b><br>
                PNL: <b style="color:#ffd700;">${window.tpStats.units.toFixed(2)} U</b>
            </div>
            <div style="font-size:9px;color:#666;margin-top:4px;">DB: ${window.tpLogs.length} | MID: *${activeMid ? activeMid.slice(-5) : "0"}</div>
        `;
    }

    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const response = await originalFetch.apply(this, args);
        try {
            response.clone().json().then(json => {
                const traverse = (n) => {
                    if (!n || typeof n !== 'object') return;
                    if (n.mid && n.card) processGameData(n);
                    if (Array.isArray(n) && n[0]?.mid && n[0]?.win) {
                        n.forEach(r => recordRound(r.mid, r.win === "1" ? "A" : (r.win === "2" ? "B" : "TIE")));
                    }
                    for (let k in n) traverse(n[k]);
                };
                traverse(json);
            });
        } catch(e) {}
        return response;
    };

    const uiContainer = document.createElement("div");
    uiContainer.id = "tp-intel-box";
    uiContainer.style = "background:#000;color:#00ff00;padding:15px;border-radius:8px;font-size:12px;border:2px solid #00ff00;box-shadow:0 0 15px rgba(0,255,0,0.3);line-height:1.6;";
    container.appendChild(uiContainer);

    updateUI();
    console.log("%c V8.4 UNITY AUTO-BET LOADED ", "color:#0f0;font-weight:bold;");
})();





// no order
(function() {
    const existingUi = document.getElementById("tp-automation-ui");
    if (existingUi) existingUi.remove();

    const LOGS_KEY = '1day_teenpatti_logs';
    const STATS_KEY = '1day_teenpatti_stats';
    window.tpLogs = JSON.parse(localStorage.getItem(LOGS_KEY)) || [];
    window.tpStats = JSON.parse(localStorage.getItem(STATS_KEY)) || { wins: 0, losses: 0, units: 0 };
    
    let activeMid = null;
    let activePrediction = null;

    const saveData = () => {
        localStorage.setItem(LOGS_KEY, JSON.stringify(window.tpLogs));
        localStorage.setItem(STATS_KEY, JSON.stringify(window.tpStats));
    };

    /* ---------------- POKER EVALUATOR (NEW) ---------------- */
    function calculateWin(cardStr) {
        const cards = cardStr.split(',');
        const parseCard = c => {
            let rankStr = c.substring(0, c.length - 2);
            let ranks = {"2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14};
            return { r: ranks[rankStr] || 0, s: c.slice(-2) };
        };
        const getScore = (hand) => {
            hand.sort((a,b) => b.r - a.r);
            const isFlush = hand[0].s === hand[1].s && hand[1].s === hand[2].s;
            let isStraight = (hand[0].r === hand[1].r + 1 && hand[1].r === hand[2].r + 1);
            if (hand[0].r === 14 && hand[1].r === 3 && hand[2].r === 2) isStraight = true;
            const tie = (hand[0].r * 10000) + (hand[1].r * 100) + hand[2].r;
            if (hand[0].r === hand[1].r && hand[1].r === hand[2].r) return 60000000 + tie;
            if (isStraight && isFlush) return 50000000 + tie;
            if (isStraight) return 40000000 + tie;
            if (isFlush) return 30000000 + tie;
            if (hand[0].r === hand[1].r || hand[1].r === hand[2].r) return 20000000 + tie;
            return 10000000 + tie;
        };
        let hA = [parseCard(cards[0]), parseCard(cards[2]), parseCard(cards[4])];
        let hB = [parseCard(cards[1]), parseCard(cards[3]), parseCard(cards[5])];
        let sA = getScore(hA), sB = getScore(hB);
        return sA > sB ? "A" : (sB > sA ? "B" : "TIE");
    }

    /* ---------------- CORE ENGINES (1:1) ---------------- */
    function fullMarkov1(history) {
        let AA = 1, AB = 1, BA = 1, BB = 1;
        for (let i = 1; i < history.length; i++) {
            const p = history[i - 1], c = history[i];
            if (p === "A" && c === "A") AA++; else if (p === "A" && c === "B") AB++;
            else if (p === "B" && c === "A") BA++; else if (p === "B" && c === "B") BB++;
        }
        const last = history[history.length - 1];
        let pA = (last === "A") ? AA / (AA + AB) : BA / (BA + BB);
        let pB = (last === "A") ? AB / (AA + AB) : BB / (BA + BB);
        return { side: pA > pB ? "A" : "B", conf: Math.max(pA, pB) };
    }

    function fullMarkov2(history) {
        let counts = {AAA:1,AAB:1,ABA:1,ABB:1,BAA:1,BAB:1,BBA:1,BBB:1};
        for (let i = 2; i < history.length; i++) {
            const key = history[i-2] + history[i-1] + history[i];
            if (counts[key] !== undefined) counts[key]++;
        }
        const last2 = history.slice(-2).join("");
        const a = counts[last2 + "A"], b = counts[last2 + "B"];
        const pA = a / (a + b), pB = b / (a + b);
        return { side: pA > pB ? "A" : "B", conf: Math.max(pA, pB) };
    }

    function fullSniper(historyStr) {
        const depths = [5, 4, 3];
        const searchRange = historyStr.slice(0, -1); // Fixed leakage
        for (let d of depths) {
            const seq = historyStr.slice(-d);
            const firstOccur = historyStr.slice(0, -d).lastIndexOf(seq);
            if (firstOccur !== -1 && historyStr[firstOccur + d]) {
                return { side: historyStr[firstOccur + d], depth: d };
            }
        }
        return null;
    }

    /* ---------------- REGIME DETECTION ---------------- */
    function alternationScore(history) {
        let alt = 0;
        for(let i=1; i<history.length; i++) { if(history[i] !== history[i-1]) alt++; }
        return alt / (history.length - 1 || 1);
    }

    function streakStrength(history) {
        let streak = 1, max = 1;
        for(let i=1; i<history.length; i++) {
            if(history[i] === history[i-1]) { streak++; if(streak > max) max = streak; }
            else { streak = 1; }
        }
        return max;
    }

    /* ---------------- META-CONTROLLER ---------------- */
    function getDynamicPrediction(data) {
        const history = data.map(r => r.winner).filter(x => x === "A" || x === "B");
        if (history.length < 20) return { win: "WAIT", reason: "COLLECTING" };

        const historyStr = history.join('');
        const recent = history.slice(-10);
        const alt = alternationScore(recent);
        const streak = streakStrength(recent);

        if (alt > 0.45 && alt < 0.65 && streak < 3) return { win: "WAIT", reason: "UNCERTAIN" };

        let res;
        let label;
        if (streak >= 4 || alt < 0.35) {
            res = fullMarkov2(history);
            label = "MARKOV-2";
        } else if (alt > 0.7) {
            const snp = fullSniper(historyStr);
            if (snp) return { win: snp.side, reason: `SNIPER | ${snp.depth}d` };
            res = { side: history[history.length-1] === "A" ? "B" : "A", conf: 0.71 };
            label = "SNIPER-FADE";
        } else {
            res = fullMarkov1(history);
            label = "MARKOV-1";
        }

        if (res.conf < 0.52) return { win: "WAIT", reason: "LOW EDGE" };
        return { win: res.side, reason: `${label} | ${Math.round(res.conf*100)}%` };
    }

    /* ---------------- DATA PROCESSORS (FIXED) ---------------- */
    function recordRound(mid, winner) {
        if (!mid || winner === "TIE") return;
        const already = window.tpLogs.some(r => String(r.mid) === String(mid));
        if (already) return;

        // Simulation update
        if (activePrediction && activePrediction.win !== "WAIT") {
            if (activePrediction.win === winner) { window.tpStats.wins++; window.tpStats.units += 0.98; }
            else { window.tpStats.losses++; window.tpStats.units -= 1.0; }
        }

        window.tpLogs.push({ mid: mid, winner: winner });
        saveData();
    }

    function processGameData(node) {
        if (!node.mid || !node.card) return;
        const mid = String(node.mid);
        const cardStr = String(node.card);

        if (mid !== activeMid) {
            activeMid = mid;
            activePrediction = getDynamicPrediction(window.tpLogs);
            updateUI();
        }

        const cards = cardStr.split(',');
        if (cards.length === 6 && !cards.includes("1")) {
            const winner = calculateWin(cardStr);
            recordRound(mid, winner);
            updateUI();
        }
    }

    /* ---------------- NETWORK & UI ---------------- */
    function updateUI() {
        const total = window.tpStats.wins + window.tpStats.losses;
        const rate = total > 0 ? ((window.tpStats.wins / total) * 100).toFixed(1) : 0;
        const intelEl = document.getElementById('tp-intel-box');
        if (!intelEl) return;
        intelEl.innerHTML = `
            <b style="color:#0ff;">V8.3 UNITY CORE (LORDS)</b><br>
            <div style="text-align:center;padding:10px;">
                <span style="font-size:24px;color:${activePrediction?.win === 'A' ? '#f44' : (activePrediction?.win === 'B' ? '#4af' : '#ff0')};font-weight:bold;">
                    ${activePrediction?.win === "WAIT" ? "WAITING..." : "PLAYER " + activePrediction?.win}
                </span><br>
                <span style="font-size:11px;color:#ffd700;">${activePrediction?.reason || "STANDBY"}</span>
            </div>
            <div style="background:#111;padding:8px;border-radius:6px;font-size:11px;">
                W: ${window.tpStats.wins} | L: ${window.tpStats.losses} | <b>${rate}%</b><br>
                PNL: <b style="color:#ffd700;">${window.tpStats.units.toFixed(2)} U</b>
            </div>
            <div style="font-size:9px;color:#666;margin-top:4px;">DB Size: ${window.tpLogs.length} rounds</div>
        `;
    }

    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const response = await originalFetch.apply(this, args);
        try {
            response.clone().json().then(json => {
                const traverse = (n) => {
                    if (!n || typeof n !== 'object') return;
                    if (n.mid && n.card) processGameData(n);
                    if (Array.isArray(n) && n[0]?.mid && n[0]?.win) {
                        n.forEach(r => recordRound(r.mid, r.win === "1" ? "A" : (r.win === "2" ? "B" : "TIE")));
                    }
                    for (let k in n) traverse(n[k]);
                };
                traverse(json);
            });
        } catch(e) {}
        return response;
    };

    const intelBox_container = document.createElement("div");
    intelBox_container.style = "background:#000;color:#00ff00;padding:15px;border-radius:8px;font-size:12px;border:2px solid #00ff00;box-shadow:0 0 15px rgba(0,255,0,0.3);line-height:1.6;";
    intelBox_container.id = "tp-intel-box";
    container.appendChild(intelBox_container);

    updateUI();
    console.log("%c V8.3 UNITY CORE ONLINE | LOGGING FIXED ", "color:#0f0;font-weight:bold;");
})();