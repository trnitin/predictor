
// with order
(function () {
    // 0. PREVENT DUPLICATE UIs
    const existingUi = document.getElementById("tp-automation-ui");
    if (existingUi) existingUi.remove();

    // 1. DATA & STATS PERSISTENCE (STRICTLY LORDS)
    const LOGS_KEY = '1day_teenpatti_logs';
    const STATS_KEY = '1day_teenpatti_stats';
    
    window.tpLogs = [];
    window.tpStats = { wins: 0, losses: 0, streak: 0, units: 0 };
    window.engineMemory = { markov: [], diff: [], bias: [], fade: [], rider: [] };
    
    let activeMid = null;
    let activePrediction = null;

    const saveData = () => {
        localStorage.setItem(LOGS_KEY, JSON.stringify(window.tpLogs));
        localStorage.setItem(STATS_KEY, JSON.stringify(window.tpStats));
    };

    const getStorageStats = () => {
        let total = 0;
        for (let x in localStorage) { if (localStorage.hasOwnProperty(x)) total += ((localStorage[x].length + x.length) * 2); }
        const usedKB = (total / 1024).toFixed(2);
        return { percent: ((usedKB / 5120) * 100).toFixed(2) };
    };

    // 2. UI SETUP
    const container = document.createElement("div");
    container.id = "tp-automation-ui";
    container.style = "position:fixed;top:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:8px;font-family:monospace;width:250px;";
    document.body.appendChild(container);

    const btn = document.createElement("button");
    btn.id = "dl-btn";
    btn.style = "padding:12px;background:#ffd700;color:#000;border:2px solid #000;cursor:pointer;font-weight:bold;border-radius:4px;";
    container.appendChild(btn);

    const clearBtn = document.createElement("button");
    clearBtn.innerHTML = "🗑️ WIPE ALL DATA";
    clearBtn.style = "padding:5px;background:#ff4444;color:#fff;border:none;cursor:pointer;font-size:10px;border-radius:4px;font-weight:bold;";
    clearBtn.onclick = () => { 
        if(confirm("Wipe all data and PNL?")) { 
            window.tpLogs = []; 
            window.tpStats = { wins: 0, losses: 0, streak: 0, units: 0 };
            window.engineMemory = { markov: [], diff: [], bias: [], fade: [], rider: [] };
            activePrediction = null;
            saveData(); 
            updateEngineUI();
        }
    };
    container.appendChild(clearBtn);

    const intelBox = document.createElement("div");
    intelBox.id = "tp-intel-box";
    intelBox.style = "background:#000;color:#00ff00;padding:15px;border-radius:8px;font-size:12px;border:2px solid #00ff00;box-shadow:0 0 15px rgba(0,255,0,0.3);line-height:1.6;user-select:none;";
    container.appendChild(intelBox);

    /* ---------------- 3. CORE V11.2 MATH ---------------- */
    function getMarkov(h) { if (h.length < 5) return "A"; let counts = { AAA: 1, AAB: 1, ABA: 1, ABB: 1, BAA: 1, BAB: 1, BBA: 1, BBB: 1 }; for (let i = 2; i < h.length; i++) { const k = h[i-2] + h[i-1] + h[i]; if (counts[k]) counts[k]++; } const l2 = h.slice(-2).join(""); return counts[l2+"A"] > counts[l2+"B"] ? "A" : "B"; }
    function getDiff(h) { if (h.length < 5) return "A"; const deltas = h.slice(1).map((v, i) => v === h[i] ? "S" : "D"); let counts = { S: 1, D: 1 }; const l2d = deltas.slice(-2).join(""); for (let i = 2; i < deltas.length; i++) { if (deltas[i-2] + deltas[i-1] === l2d) counts[deltas[i]]++; } const nextD = counts.S > counts.D ? "S" : "D"; return nextD === "S" ? h[h.length-1] : (h[h.length-1] === "A" ? "B" : "A"); }
    function getBias(h) { return h.slice(-20).filter(x => x === "A").length > 10 ? "A" : "B"; }
    function getFade(h) { let streak = 1; const last = h[h.length-1]; for (let i = h.length-2; i >= 0; i--) { if (h[i] === last) streak++; else break; } return streak >= 3 ? (last === "A" ? "B" : "A") : last; }
    function getRider(h) { let streak = 1; const last = h[h.length-1]; for (let i = h.length-2; i >= 0; i--) { if (h[i] === last) streak++; else break; } return streak >= 2 ? last : (last === "B" ? "A" : "B"); }

    /* ---------------- 4. V11.5 HYBRID TURBO ENGINE ---------------- */
    function getTurboPrediction(data) {
        const h = data.map(r => r.winner).filter(w => w === 'A' || w === 'B');
        if (h.length < 10) return { win: "WAIT", reason: "COLLECTING" };

        const preds = { markov: getMarkov(h), diff: getDiff(h), bias: getBias(h), fade: getFade(h), rider: getRider(h) };
        const getAcc = (arr) => { const slice = arr.slice(-15); return slice.length === 0 ? 0 : slice.filter(Boolean).length / slice.length; };
        const accs = { markov: getAcc(window.engineMemory.markov), diff: getAcc(window.engineMemory.diff), bias: getAcc(window.engineMemory.bias), fade: getAcc(window.engineMemory.fade), rider: getAcc(window.engineMemory.rider) };
        
        let bestEngine = null, maxAcc = 0;
        for (const [engine, acc] of Object.entries(accs)) { if (acc > maxAcc) { maxAcc = acc; bestEngine = engine; } }

        if (maxAcc >= 0.60 && bestEngine) return { win: preds[bestEngine], reason: `${bestEngine.toUpperCase()} (HOT)` };

        const lastWinner = h[h.length - 1];
        const last10 = h.slice(-10);
        if (h.slice(-3).every(x => x === lastWinner)) return { win: lastWinner, reason: "V2 STREAK" };
        if (last10.filter(x => x === "A").length >= 7) return { win: "A", reason: "V2 A-BIAS" };
        if (last10.filter(x => x === "B").length >= 7) return { win: "B", reason: "V2 B-BIAS" };
        
        return { win: lastWinner === "A" ? "B" : "A", reason: "V2 TURBO CHOP" };
    }

    // 4B. POKER EVALUATOR
    function calculateWin(cardStr) {
        const cards = cardStr.split(',');
        const parseCard = c => { let rStr = c.substring(0, c.length - 2); let ranks = {"2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14}; return { r: ranks[rStr] || 0, s: c.slice(-2) }; };
        const getScore = (h) => { h.sort((a,b) => b.r - a.r); const isF = h[0].s === h[1].s && h[1].s === h[2].s; let isS = (h[0].r === h[1].r + 1 && h[1].r === h[2].r + 1); if (h[0].r === 14 && h[1].r === 3 && h[2].r === 2) isS = true; const tie = (h[0].r * 10000) + (h[1].r * 100) + h[2].r; if (h[0].r === h[1].r && h[1].r === h[2].r) return 60000000 + tie; if (isS && isF) return 50000000 + tie; if (isS) return 40000000 + tie; if (isF) return 30000000 + tie; if (h[0].r === h[1].r || h[0].r === h[2].r) return 20000000 + tie; return 10000000 + tie; };
        let sA = getScore([parseCard(cards[0]), parseCard(cards[2]), parseCard(cards[4])]), sB = getScore([parseCard(cards[1]), parseCard(cards[3]), parseCard(cards[5])]);
        return sA > sB ? "A" : (sB > sA ? "B" : "TIE");
    }

    // 5. UI UPDATER
    function updateEngineUI() {
        const data = window.tpLogs, stats = window.tpStats, total = stats.wins + stats.losses, rate = total > 0 ? ((stats.wins / total) * 100).toFixed(1) : 0, storage = getStorageStats();
        let displayWin = "WAITING...", displayReason = "STANDBY";
        if (activePrediction) { displayWin = activePrediction.win === "WAIT" ? "WAITING..." : "PLAYER " + activePrediction.win; displayReason = activePrediction.reason; }
        if (document.getElementById('dl-btn')) document.getElementById('dl-btn').innerHTML = `💾 DOWNLOAD LOG (${data.length})`;
        const intelEl = document.getElementById('tp-intel-box');
        if (!intelEl) return;
        intelEl.style.borderColor = stats.streak >= 2 ? "#0f0" : (stats.streak <= -2 ? "#f00" : "#00ff00");
        intelEl.innerHTML = `
            <div style="display:flex;justify-content:space-between;border-bottom:1px solid #333;padding-bottom:5px;margin-bottom:8px;"><b style="color:#f0f;">V11.5 HYBRID (TURBO)</b><span style="font-size:10px;color:#888;">${storage.percent}% DB</span></div>
            <div style="text-align:center;margin-bottom:10px;">
                <span style="font-size:24px;color:${activePrediction?.win === 'A' ? '#ff4444' : (activePrediction?.win === 'B' ? '#44aaff' : '#ffff00')};font-weight:bold;">${displayWin}</span><br>
                <span style="font-size:11px;color:#ffd700;">MODE: ${displayReason}</span>
            </div>
            <div style="background:#111;padding:8px;border-radius:6px;border:1px solid #333;">
                <div style="display:flex;justify-content:space-between;font-size:11px;"><span>W: ${stats.wins} | L: ${stats.losses}</span><span style="font-weight:bold;">${rate}%</span></div>
                <div style="text-align:center;margin-top:5px;"><span style="font-size:18px;color:#ffd700;font-weight:bold;">${stats.units.toFixed(2)} U</span></div>
            </div>
        `;
    }

    /* ---------------- 6. AUTO-BET EXECUTION ---------------- */
    function executeWager() {
        let attempts = 0;
        const slip = setInterval(() => {
            attempts++; if (attempts > 20) { clearInterval(slip); return; }
            const stake = document.querySelector('input[placeholder="Enter Stake"]');
            const sub = document.querySelector('.p-4.bg-card.border-t button');
            if (stake && sub && stake.offsetParent !== null) {
                const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                setter.call(stake, "50"); // <--- STAKE AMOUNT
                stake.dispatchEvent(new Event('input', { bubbles: true }));
                stake.dispatchEvent(new Event('change', { bubbles: true }));
                setTimeout(() => { if (!sub.disabled) sub.click(); }, 350);
                clearInterval(slip);
            }
        }, 100);
    }

    function clickBet(side) {
        if (side !== "A" && side !== "B") return;
        const target = "Player " + side;
        const scan = setInterval(() => {
            const containers = document.querySelectorAll('.bg-background.border-2.overflow-hidden');
            for (let c of containers) { 
                if (c.innerText.includes(target)) {
                    const backBtn = c.querySelector('.bg-back');
                    if (backBtn && !backBtn.classList.contains('cursor-not-allowed')) {
                        clearInterval(scan);
                        setTimeout(() => { backBtn.click(); executeWager(); }, 1800); 
                        return;
                    }
                } 
            }
        }, 500);
        setTimeout(() => clearInterval(scan), 15000); 
    }

    /* ---------------- 7. DATA PIPELINE ---------------- */
    function processHistoryArray(historyArray) {
        if (!Array.isArray(historyArray)) return;
        const recent = [...historyArray].reverse();
        recent.forEach(d => {
            if (!d.mid || !d.win || window.tpLogs.some(l => l.mid === String(d.mid))) return;
            let winner = String(d.win) === "1" ? "A" : (String(d.win) === "2" ? "B" : "TIE");
            const h = window.tpLogs.map(r => r.winner).filter(x => x === "A" || x === "B");
            if (h.length >= 10 && winner !== "TIE") {
                const simPred = getTurboPrediction(window.tpLogs);
                if (simPred.win !== "WAIT") {
                    if (simPred.win === winner) { window.tpStats.wins++; window.tpStats.units += 0.98; window.tpStats.streak = Math.max(1, window.tpStats.streak + 1); }
                    else { window.tpStats.losses++; window.tpStats.units -= 1.0; window.tpStats.streak = Math.min(-1, window.tpStats.streak - 1); }
                }
                const rP = { markov: getMarkov(h), diff: getDiff(h), bias: getBias(h), fade: getFade(h), rider: getRider(h) };
                window.engineMemory.markov.push(rP.markov === winner); window.engineMemory.diff.push(rP.diff === winner); window.engineMemory.bias.push(rP.bias === winner); window.engineMemory.fade.push(rP.fade === winner); window.engineMemory.rider.push(rP.rider === winner);
            }
            window.tpLogs.push({ mid: String(d.mid), winner, cards_A: "HIST", cards_B: "HIST" });
        });
        saveData(); updateEngineUI();
    }

    function processGameData(d) {
        if (!d.mid || !d.card) return;
        if (String(d.mid) !== activeMid) { 
            activeMid = String(d.mid); 
            activePrediction = getTurboPrediction(window.tpLogs); 
            updateEngineUI(); 
            if (activePrediction.win !== "WAIT") clickBet(activePrediction.win); 
        }
        const cardsArr = d.card.split(',');
        if (cardsArr.length === 6 && !cardsArr.includes("1") && !window.tpLogs.some(l => l.mid === String(d.mid))) {
            const winner = calculateWin(d.card), h = window.tpLogs.map(r => r.winner).filter(x => x === "A" || x === "B");
            if (h.length >= 10 && winner !== "TIE") {
                if (activePrediction && activePrediction.win !== "WAIT") {
                    if (activePrediction.win === winner) { window.tpStats.wins++; window.tpStats.units += 0.98; window.tpStats.streak = Math.max(1, window.tpStats.streak + 1); }
                    else { window.tpStats.losses++; window.tpStats.units -= 1.0; window.tpStats.streak = Math.min(-1, window.tpStats.streak - 1); }
                }
                const rP = { markov: getMarkov(h), diff: getDiff(h), bias: getBias(h), fade: getFade(h), rider: getRider(h) };
                window.engineMemory.markov.push(rP.markov === winner); window.engineMemory.diff.push(rP.diff === winner); window.engineMemory.bias.push(rP.bias === winner); window.engineMemory.fade.push(rP.fade === winner); window.engineMemory.rider.push(rP.rider === winner);
            }
            window.tpLogs.push({ mid: String(d.mid), winner, cards_A: `${cardsArr[0]}`, cards_B: `${cardsArr[1]}` });
            saveData(); activePrediction = getTurboPrediction(window.tpLogs); updateEngineUI();
        }
    }

    function parseAndRoute(text) {
        try { 
            const payload = JSON.parse(text); 
            function traverse(n) { 
                if (!n || typeof n !== 'object') return; 
                if (n.p && Array.isArray(n.p.k) && Array.isArray(n.p.v)) { 
                    const k = n.p.k, v = n.p.v, mI = k.indexOf("mid"), cI = k.indexOf("card"), wI = k.indexOf("win"); 
                    if (mI !== -1 && cI !== -1) processGameData({ mid: v[mI]?.s ?? v[mI], card: v[cI]?.s ?? v[cI] }); 
                    if (mI !== -1 && wI !== -1) processHistoryArray([{ mid: v[mI]?.s ?? v[mI], win: v[wI]?.s ?? v[wI] }]); 
                } 
                if (n.mid && n.card) processGameData({ mid: n.mid, card: n.card }); 
                if (Array.isArray(n) && n.length > 0 && n[0].mid && n[0].win) processHistoryArray(n); 
                for (let k in n) traverse(n[k]); 
            } 
            traverse(payload); 
        } catch(e) {}
    }

    const originalFetch = window.fetch; window.fetch = async function(...args) { const response = await originalFetch.apply(this, args); try { response.clone().text().then(text => parseAndRoute(text)); } catch(e) {} return response; };
    const originalXHR = window.XMLHttpRequest.prototype.open; window.XMLHttpRequest.prototype.open = function(m, u, ...rest) { this.addEventListener('load', function() { try { parseAndRoute(this.responseText); } catch(e) {} }); originalXHR.call(this, m, u, ...rest); };

    btn.onclick = (e) => { e.preventDefault(); const logs = JSON.parse(localStorage.getItem(LOGS_KEY)) || []; if (logs.length === 0) return alert("No data!"); const content = logs.map(r => `${r.mid},${r.winner}`).join("\n"); const blob = new Blob([content], { type: "text/plain" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `lords_turbo_v11_5.csv`; link.click(); };

    function performBackfill() {
        const raw = JSON.parse(localStorage.getItem(LOGS_KEY)) || [];
        window.tpLogs = []; window.tpStats = { wins: 0, losses: 0, streak: 0, units: 0 }; window.engineMemory = { markov: [], diff: [], bias: [], fade: [], rider: [] };
        raw.forEach(r => processHistoryArray([{ mid: r.mid, win: r.winner === "A" ? "1" : (r.winner === "B" ? "2" : "0") }]));
        saveData(); updateEngineUI();
    }

    performBackfill();
    console.log("%c V11.5 HYBRID TURBO FULL AUTO-BET LOADED ", "background:#000; color:#f0f; font-weight:bold;");
})();














// without order
(function () {
    // 0. PREVENT DUPLICATE UIs
    const existingUi = document.getElementById("tp-automation-ui");
    if (existingUi) existingUi.remove();

    // 1. DATA & STATS PERSISTENCE (STRICTLY LORDS)
    const LOGS_KEY = '1day_teenpatti_logs';
    const STATS_KEY = '1day_teenpatti_stats';
    
    window.tpLogs = [];
    window.tpStats = { wins: 0, losses: 0, streak: 0, units: 0 };
    window.engineMemory = { markov: [], diff: [], bias: [], fade: [], rider: [] };
    
    let activeMid = null;
    let activePrediction = null;

    const saveData = () => {
        localStorage.setItem(LOGS_KEY, JSON.stringify(window.tpLogs));
        localStorage.setItem(STATS_KEY, JSON.stringify(window.tpStats));
    };

    const getStorageStats = () => {
        let total = 0;
        for (let x in localStorage) { if (localStorage.hasOwnProperty(x)) total += ((localStorage[x].length + x.length) * 2); }
        const usedKB = (total / 1024).toFixed(2);
        return { percent: ((usedKB / 5120) * 100).toFixed(2) };
    };

    // 2. UI SETUP
    const container = document.createElement("div");
    container.id = "tp-automation-ui";
    container.style = "position:fixed;top:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:8px;font-family:monospace;width:250px;";
    document.body.appendChild(container);

    const btn = document.createElement("button");
    btn.id = "dl-btn";
    btn.style = "padding:12px;background:#ffd700;color:#000;border:2px solid #000;cursor:pointer;font-weight:bold;border-radius:4px;";
    container.appendChild(btn);

    const clearBtn = document.createElement("button");
    clearBtn.innerHTML = "🗑️ WIPE ALL DATA";
    clearBtn.style = "padding:5px;background:#ff4444;color:#fff;border:none;cursor:pointer;font-size:10px;border-radius:4px;font-weight:bold;";
    clearBtn.onclick = () => { 
        if(confirm("Wipe PNL?")) { 
            window.tpLogs = []; 
            window.tpStats = { wins: 0, losses: 0, streak: 0, units: 0 };
            window.engineMemory = { markov: [], diff: [], bias: [], fade: [], rider: [] };
            activePrediction = null;
            saveData(); 
            updateEngineUI();
        }
    };
    container.appendChild(clearBtn);

    const intelBox = document.createElement("div");
    intelBox.id = "tp-intel-box";
    intelBox.style = "background:#000;color:#00ff00;padding:15px;border-radius:8px;font-size:12px;border:2px solid #00ff00;box-shadow:0 0 15px rgba(0,255,0,0.3);line-height:1.6;user-select:none;";
    container.appendChild(intelBox);

    /* ---------------- 3. CORE V11.2 MATH ---------------- */
    function getMarkov(h) { if (h.length < 5) return "A"; let counts = { AAA: 1, AAB: 1, ABA: 1, ABB: 1, BAA: 1, BAB: 1, BBA: 1, BBB: 1 }; for (let i = 2; i < h.length; i++) { const k = h[i-2] + h[i-1] + h[i]; if (counts[k]) counts[k]++; } const l2 = h.slice(-2).join(""); return counts[l2+"A"] > counts[l2+"B"] ? "A" : "B"; }
    function getDiff(h) { if (h.length < 5) return "A"; const deltas = h.slice(1).map((v, i) => v === h[i] ? "S" : "D"); let counts = { S: 1, D: 1 }; const l2d = deltas.slice(-2).join(""); for (let i = 2; i < deltas.length; i++) { if (deltas[i-2] + deltas[i-1] === l2d) counts[deltas[i]]++; } const nextD = counts.S > counts.D ? "S" : "D"; return nextD === "S" ? h[h.length-1] : (h[h.length-1] === "A" ? "B" : "A"); }
    function getBias(h) { return h.slice(-20).filter(x => x === "A").length > 10 ? "A" : "B"; }
    function getFade(h) { let streak = 1; const last = h[h.length-1]; for (let i = h.length-2; i >= 0; i--) { if (h[i] === last) streak++; else break; } return streak >= 3 ? (last === "A" ? "B" : "A") : last; }
    function getRider(h) { let streak = 1; const last = h[h.length-1]; for (let i = h.length-2; i >= 0; i--) { if (h[i] === last) streak++; else break; } return streak >= 2 ? last : (last === "B" ? "A" : "B"); }

    /* ---------------- 4. V11.5 HYBRID TURBO ENGINE ---------------- */
    function getTurboPrediction(data) {
        const h = data.map(r => r.winner).filter(w => w === 'A' || w === 'B');
        if (h.length < 10) return { win: "WAIT", reason: "COLLECTING" };

        // 1. Check Ensemble (V11.2 Math)
        const preds = { markov: getMarkov(h), diff: getDiff(h), bias: getBias(h), fade: getFade(h), rider: getRider(h) };
        const getAcc = (arr) => { const slice = arr.slice(-15); return slice.length === 0 ? 0 : slice.filter(Boolean).length / slice.length; };
        const accs = { markov: getAcc(window.engineMemory.markov), diff: getAcc(window.engineMemory.diff), bias: getAcc(window.engineMemory.bias), fade: getAcc(window.engineMemory.fade), rider: getAcc(window.engineMemory.rider) };
        
        let bestEngine = null, maxAcc = 0;
        for (const [engine, acc] of Object.entries(accs)) { if (acc > maxAcc) { maxAcc = acc; bestEngine = engine; } }

        // TRIGGER A: HIGH CONFIDENCE (V11.2)
        if (maxAcc >= 0.60 && bestEngine) return { win: preds[bestEngine], reason: `${bestEngine.toUpperCase()} (HOT)` };

        // TRIGGER B: V2 HYPER-AGGRESSIVE FALLBACK (Ensure 100% participation)
        const lastWinner = h[h.length - 1];
        const last10 = h.slice(-10);
        if (h.slice(-3).every(x => x === lastWinner)) return { win: lastWinner, reason: "V2 STREAK" };
        if (last10.filter(x => x === "A").length >= 7) return { win: "A", reason: "V2 A-BIAS" };
        if (last10.filter(x => x === "B").length >= 7) return { win: "B", reason: "V2 B-BIAS" };
        
        return { win: lastWinner === "A" ? "B" : "A", reason: "V2 TURBO CHOP" };
    }

    // 4B. POKER EVALUATOR
    function calculateWin(cardStr) {
        const cards = cardStr.split(',');
        const parseCard = c => { let rStr = c.substring(0, c.length - 2); let ranks = {"2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14}; return { r: ranks[rStr] || 0, s: c.slice(-2) }; };
        const getScore = (h) => { h.sort((a,b) => b.r - a.r); const isF = h[0].s === h[1].s && h[1].s === h[2].s; let isS = (h[0].r === h[1].r + 1 && h[1].r === h[2].r + 1); if (h[0].r === 14 && h[1].r === 3 && h[2].r === 2) isS = true; const tie = (h[0].r * 10000) + (h[1].r * 100) + h[2].r; if (h[0].r === h[1].r && h[1].r === h[2].r) return 60000000 + tie; if (isS && isF) return 50000000 + tie; if (isS) return 40000000 + tie; if (isF) return 30000000 + tie; if (h[0].r === h[1].r || h[0].r === h[2].r) return 20000000 + tie; return 10000000 + tie; };
        let sA = getScore([parseCard(cards[0]), parseCard(cards[2]), parseCard(cards[4])]), sB = getScore([parseCard(cards[1]), parseCard(cards[3]), parseCard(cards[5])]);
        return sA > sB ? "A" : (sB > sA ? "B" : "TIE");
    }

    // 5. UI UPDATER
    function updateEngineUI() {
        const data = window.tpLogs, stats = window.tpStats, total = stats.wins + stats.losses, rate = total > 0 ? ((stats.wins / total) * 100).toFixed(1) : 0, storage = getStorageStats();
        let displayWin = "WAITING...", displayReason = "STANDBY";
        if (activePrediction) { displayWin = activePrediction.win === "WAIT" ? "WAITING..." : "PLAYER " + activePrediction.win; displayReason = activePrediction.reason; }
        if (document.getElementById('dl-btn')) document.getElementById('dl-btn').innerHTML = `💾 DOWNLOAD LOG (${data.length})`;
        const intelEl = document.getElementById('tp-intel-box');
        if (!intelEl) return;
        intelEl.style.borderColor = stats.streak >= 2 ? "#0f0" : (stats.streak <= -2 ? "#f00" : "#00ff00");
        intelEl.innerHTML = `
            <div style="display:flex;justify-content:space-between;border-bottom:1px solid #333;padding-bottom:5px;margin-bottom:8px;"><b style="color:#f0f;">V11.5 HYBRID (VIEW)</b><span style="font-size:10px;color:#888;">${storage.percent}%</span></div>
            <div style="text-align:center;margin-bottom:10px;">
                <span style="font-size:24px;color:${activePrediction?.win === 'A' ? '#ff4444' : (activePrediction?.win === 'B' ? '#44aaff' : '#ffff00')};font-weight:bold;">${displayWin}</span><br>
                <span style="font-size:11px;color:#ffd700;">MODE: ${displayReason}</span>
            </div>
            <div style="background:#111;padding:8px;border-radius:6px;border:1px solid #333;">
                <div style="display:flex;justify-content:space-between;font-size:11px;"><span>W: ${stats.wins} | L: ${stats.losses}</span><span style="font-weight:bold;">${rate}%</span></div>
                <div style="text-align:center;margin-top:5px;"><span style="font-size:18px;color:#ffd700;font-weight:bold;">${stats.units.toFixed(2)} U</span></div>
            </div>
        `;
    }

    /* ---------------- 6A. HISTORY PROCESSOR (TIMELINE SYNCHRONIZED) ---------------- */
    function processHistoryArray(historyArray) {
        if (!Array.isArray(historyArray)) return;
        const recent = [...historyArray].reverse();
        recent.forEach(d => {
            if (!d.mid || !d.win || window.tpLogs.some(l => l.mid === String(d.mid))) return;
            let winner = String(d.win) === "1" ? "A" : (String(d.win) === "2" ? "B" : "TIE");
            const h = window.tpLogs.map(r => r.winner).filter(x => x === "A" || x === "B");
            if (h.length >= 10 && winner !== "TIE") {
                const simPred = getTurboPrediction(window.tpLogs);
                if (simPred.win !== "WAIT") {
                    if (simPred.win === winner) { window.tpStats.wins++; window.tpStats.units += 0.98; window.tpStats.streak = Math.max(1, window.tpStats.streak + 1); }
                    else { window.tpStats.losses++; window.tpStats.units -= 1.0; window.tpStats.streak = Math.min(-1, window.tpStats.streak - 1); }
                }
                const rP = { markov: getMarkov(h), diff: getDiff(h), bias: getBias(h), fade: getFade(h), rider: getRider(h) };
                window.engineMemory.markov.push(rP.markov === winner); window.engineMemory.diff.push(rP.diff === winner); window.engineMemory.bias.push(rP.bias === winner); window.engineMemory.fade.push(rP.fade === winner); window.engineMemory.rider.push(rP.rider === winner);
            }
            window.tpLogs.push({ mid: String(d.mid), winner, cards_A: "HIST", cards_B: "HIST" });
        });
        saveData(); updateEngineUI();
    }

    /* ---------------- 6B. LIVE ROUND PROCESSOR (TIMELINE SYNCHRONIZED) ---------------- */
    function processGameData(d) {
        if (!d.mid || !d.card) return;
        if (String(d.mid) !== activeMid) { activeMid = String(d.mid); activePrediction = getTurboPrediction(window.tpLogs); updateEngineUI(); }
        const cardsArr = d.card.split(',');
        if (cardsArr.length === 6 && !cardsArr.includes("1") && !window.tpLogs.some(l => l.mid === String(d.mid))) {
            const winner = calculateWin(d.card), h = window.tpLogs.map(r => r.winner).filter(x => x === "A" || x === "B");
            if (h.length >= 10 && winner !== "TIE") {
                if (activePrediction && activePrediction.win !== "WAIT") {
                    if (activePrediction.win === winner) { window.tpStats.wins++; window.tpStats.units += 0.98; window.tpStats.streak = Math.max(1, window.tpStats.streak + 1); }
                    else { window.tpStats.losses++; window.tpStats.units -= 1.0; window.tpStats.streak = Math.min(-1, window.tpStats.streak - 1); }
                }
                const rP = { markov: getMarkov(h), diff: getDiff(h), bias: getBias(h), fade: getFade(h), rider: getRider(h) };
                window.engineMemory.markov.push(rP.markov === winner); window.engineMemory.diff.push(rP.diff === winner); window.engineMemory.bias.push(rP.bias === winner); window.engineMemory.fade.push(rP.fade === winner); window.engineMemory.rider.push(rP.rider === winner);
            }
            window.tpLogs.push({ mid: String(d.mid), winner, cards_A: `${cardsArr[0]}`, cards_B: `${cardsArr[1]}` });
            saveData(); activePrediction = getTurboPrediction(window.tpLogs); updateEngineUI();
        }
    }

    // 7. DEEP JSON SCANNER (V2 ARCHITECTURE)
    function parseAndRoute(text) {
        try { const payload = JSON.parse(text); function traverse(n) { if (!n || typeof n !== 'object') return; if (n.p && Array.isArray(n.p.k) && Array.isArray(n.p.v)) { const k = n.p.k, v = n.p.v, mI = k.indexOf("mid"), cI = k.indexOf("card"), wI = k.indexOf("win"); if (mI !== -1 && cI !== -1) processGameData({ mid: v[mI]?.s ?? v[mI], card: v[cI]?.s ?? v[cI] }); if (mI !== -1 && wI !== -1) processHistoryArray([{ mid: v[mI]?.s ?? v[mI], win: v[wI]?.s ?? v[wI] }]); } if (n.mid && n.card) processGameData({ mid: n.mid, card: n.card }); if (Array.isArray(n) && n.length > 0 && n[0].mid && n[0].win) processHistoryArray(n); for (let k in n) traverse(n[k]); } traverse(payload); } catch(e) {}
    }

    // 8. NETWORK HOOKS
    const originalFetch = window.fetch; window.fetch = async function(...args) { const response = await originalFetch.apply(this, args); try { response.clone().text().then(text => parseAndRoute(text)); } catch(e) {} return response; };
    const originalXHR = window.XMLHttpRequest.prototype.open; window.XMLHttpRequest.prototype.open = function(m, u, ...rest) { this.addEventListener('load', function() { try { parseAndRoute(this.responseText); } catch(e) {} }); originalXHR.call(this, m, u, ...rest); };

    // 9. IDLE CONTROL & DOWNLOAD
    btn.onclick = (e) => { e.preventDefault(); const logs = JSON.parse(localStorage.getItem(LOGS_KEY)) || []; if (logs.length === 0) return alert("No data!"); const content = logs.map(r => `${r.mid},${r.winner}`).join("\n"); const blob = new Blob([content], { type: "text/plain" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `lords_hybrid_view.csv`; link.click(); };

    setInterval(() => { window.scrollBy(0, 10); setTimeout(() => window.scrollBy(0, -10), 1000); updateEngineUI(); }, 5000);

    // 10. FIXED ISOLATED BACKFILL
    function performBackfill() {
        const raw = JSON.parse(localStorage.getItem(LOGS_KEY)) || [];
        window.tpLogs = []; window.tpStats = { wins: 0, losses: 0, streak: 0, units: 0 }; window.engineMemory = { markov: [], diff: [], bias: [], fade: [], rider: [] };
        raw.forEach(r => processHistoryArray([{ mid: r.mid, win: r.winner === "A" ? "1" : (r.winner === "B" ? "2" : "0") }]));
        saveData(); updateEngineUI();
    }

    performBackfill();
    console.log("%c V11.5 HYBRID TURBO VIEW-ONLY LOADED ", "background:#000; color:#f0f; font-weight:bold;");
})();