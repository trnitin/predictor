// v11.0 oracle
(function () {
    const existingUi = document.getElementById("tp-automation-ui");
    if (existingUi) existingUi.remove();

    // LORDS STORAGE KEYS
    const LOGS_KEY = '1day_teenpatti_logs';
    const STATS_KEY = '1day_teenpatti_stats';
    
    window.tpLogs = JSON.parse(localStorage.getItem(LOGS_KEY)) || [];
    window.tpStats = { wins: 0, losses: 0, units: 0 }; 
    
    // Track independent engine accuracies (1 = win, 0 = loss)
    window.engineMemory = {
        markov: [],
        diff: [],
        bias: [],
        fade: []
    };
    
    let activeMid = null, activePrediction = null;

    const saveData = () => {
        localStorage.setItem(LOGS_KEY, JSON.stringify(window.tpLogs));
        localStorage.setItem(STATS_KEY, JSON.stringify(window.tpStats));
    };

    // --- UI CONSTRUCTION ---
    const container = document.createElement("div");
    container.id = "tp-automation-ui";
    container.style = "position:fixed;top:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:8px;font-family:monospace;width:250px;";
    document.body.appendChild(container);

    const dlBtn = document.createElement("button");
    dlBtn.id = "dl-btn";
    dlBtn.style = "padding:12px;background:#ffd700;color:#000;border:2px solid #000;cursor:pointer;font-weight:bold;border-radius:4px;";
    dlBtn.onclick = () => {
        const content = window.tpLogs.map(r => `${r.mid},${r.winner}`).join("\n");
        const blob = new Blob([content], { type: "text/plain" });
        const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `lords_v11_oracle_view.csv`; link.click();
    };
    container.appendChild(dlBtn);

    const clearBtn = document.createElement("button");
    clearBtn.innerHTML = "🗑️ WIPE MEMORY & STATS";
    clearBtn.style = "padding:5px;background:#ff4444;color:#fff;border:none;cursor:pointer;font-size:10px;border-radius:4px;font-weight:bold;";
    clearBtn.onclick = () => {
        if (confirm("Wipe all data?")) { 
            window.tpLogs = []; window.tpStats = { wins: 0, losses: 0, units: 0 }; 
            window.engineMemory = { markov: [], diff: [], bias: [], fade: [] };
            activePrediction = null; saveData(); updateEngineUI(); 
        }
    };
    container.appendChild(clearBtn);

    const intelBox = document.createElement("div");
    intelBox.id = "tp-intel-box";
    intelBox.style = "background:#000;color:#00ff00;padding:15px;border-radius:8px;font-size:12px;border:2px solid #00ff00;box-shadow:0 0 15px rgba(0,255,0,0.3);line-height:1.6;";
    container.appendChild(intelBox);

    /* ---------------- POKER EVALUATOR ---------------- */
    function calculateWin(cStr) {
        const cs = cStr.split(',');
        const pC = c => { let rS = c.substring(0, c.length - 2); let ranks = { "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, "J": 11, "Q": 12, "K": 13, "A": 14 }; return { r: ranks[rS] || 0, s: c.slice(-2) }; };
        const gS = (h) => {
            h.sort((a, b) => b.r - a.r);
            let isS = (h[0].r === h[1].r + 1 && h[1].r === h[2].r + 1) || (h[0].r === 14 && h[1].r === 3 && h[2].r === 2);
            const tie = (h[0].r * 10000) + (h[1].r * 100) + h[2].r;
            if (h[0].r === h[1].r && h[1].r === h[2].r) return 60000000 + tie;
            if (isS && h[0].s === h[1].s && h[1].s === h[2].s) return 50000000 + tie;
            if (isS) return 40000000 + tie;
            if (h[0].s === h[1].s && h[1].s === h[2].s) return 30000000 + tie;
            if (h[0].r === h[1].r || h[1].r === h[2].r) return 20000000 + tie;
            return 10000000 + tie;
        };
        let sA = gS([pC(cs[0]), pC(cs[2]), pC(cs[4])]), sB = gS([pC(cs[1]), pC(cs[3]), pC(cs[5])]);
        return sA > sB ? "A" : (sB > sA ? "B" : "TIE");
    }

    /* ---------------- THE 4 SUB-ENGINES ---------------- */
    function getMarkov(h) {
        if (h.length < 5) return "A";
        let counts = { AAA: 1, AAB: 1, ABA: 1, ABB: 1, BAA: 1, BAB: 1, BBA: 1, BBB: 1 };
        for (let i = 2; i < h.length; i++) { const k = h[i-2] + h[i-1] + h[i]; if (counts[k]) counts[k]++; }
        const l2 = h.slice(-2).join(""); 
        return counts[l2+"A"] > counts[l2+"B"] ? "A" : "B"; 
    }

    function getDiff(h) {
        if (h.length < 5) return "A";
        const deltas = h.slice(1).map((v, i) => v === h[i] ? "S" : "D");
        let counts = { S: 1, D: 1 };
        const l2d = deltas.slice(-2).join("");
        for (let i = 2; i < deltas.length; i++) { if (deltas[i-2] + deltas[i-1] === l2d) counts[deltas[i]]++; }
        const nextD = counts.S > counts.D ? "S" : "D";
        return nextD === "S" ? h[h.length-1] : (h[h.length-1] === "A" ? "B" : "A");
    }

    function getBias(h) {
        const slice = h.slice(-20);
        const aCount = slice.filter(x => x === "A").length;
        return aCount > (slice.length / 2) ? "A" : "B";
    }

    function getFade(h) {
        let streak = 1;
        const last = h[h.length-1];
        for (let i = h.length-2; i >= 0; i--) { if (h[i] === last) streak++; else break; }
        return streak >= 3 ? (last === "A" ? "B" : "A") : last;
    }

    /* ---------------- V11.0 ORACLE CONTROLLER ---------------- */
    function getOraclePrediction(h, mem) {
        if (h.length < 25) return { win: "WAIT", reason: "TRAINING ENGINES", raw: null };

        const preds = {
            markov: getMarkov(h),
            diff: getDiff(h),
            bias: getBias(h),
            fade: getFade(h)
        };

        const getAcc = (arr) => {
            const slice = arr.slice(-15);
            if (slice.length === 0) return 0;
            return slice.filter(Boolean).length / slice.length;
        };

        const accs = {
            markov: getAcc(mem.markov),
            diff: getAcc(mem.diff),
            bias: getAcc(mem.bias),
            fade: getAcc(mem.fade)
        };

        let bestEngine = null;
        let maxAcc = 0;
        
        for (const [engine, acc] of Object.entries(accs)) {
            if (acc > maxAcc) {
                maxAcc = acc;
                bestEngine = engine;
            }
        }

        // Decision Gate: Require 73% accuracy (11 out of 15 correct) to strike
        if (maxAcc >= 0.73 && bestEngine) {
            return { win: preds[bestEngine], reason: `${bestEngine.toUpperCase()} HOT (${Math.round(maxAcc*100)}%)`, raw: preds };
        }

        return { win: "WAIT", reason: `NO ENGINE HOT (Max ${Math.round(maxAcc*100)}%)`, raw: preds };
    }

    /* ---------------- BACKFILL ENGINE ---------------- */
    function performBackfill() {
        window.tpStats = { wins: 0, losses: 0, units: 0 };
        window.engineMemory = { markov: [], diff: [], bias: [], fade: [] };
        
        for (let i = 25; i < window.tpLogs.length; i++) {
            const h = window.tpLogs.slice(0, i).map(r => r.winner).filter(x => x === "A" || x === "B");
            const winner = window.tpLogs[i].winner;
            if (winner === "TIE") continue;

            const predData = getOraclePrediction(h, window.engineMemory);
            
            // Tally real wins if an engine was hot enough to trigger a bet
            if (predData.win !== "WAIT") {
                if (predData.win === winner) { window.tpStats.wins++; window.tpStats.units += 0.98; }
                else { window.tpStats.losses++; window.tpStats.units -= 1.0; }
            }

            // Update Background Memory for ALL engines
            const rawPreds = { markov: getMarkov(h), diff: getDiff(h), bias: getBias(h), fade: getFade(h) };
            window.engineMemory.markov.push(rawPreds.markov === winner);
            window.engineMemory.diff.push(rawPreds.diff === winner);
            window.engineMemory.bias.push(rawPreds.bias === winner);
            window.engineMemory.fade.push(rawPreds.fade === winner);
        }
        updateEngineUI();
        saveData();
    }

    /* ---------------- LIVE HANDLERS ---------------- */
    function recordRound(mid, winner) {
        if (!mid || winner === "TIE") return;
        if (window.tpLogs.some(r => String(r.mid) === String(mid))) return;

        const h = window.tpLogs.map(r => r.winner).filter(x => x === "A" || x === "B");
        const predData = getOraclePrediction(h, window.engineMemory);
        
        if (predData.win !== "WAIT") {
            if (predData.win === winner) { window.tpStats.wins++; window.tpStats.units += 0.98; }
            else { window.tpStats.losses++; window.tpStats.units -= 1.0; }
        }

        // Live memory update
        const rawPreds = { markov: getMarkov(h), diff: getDiff(h), bias: getBias(h), fade: getFade(h) };
        window.engineMemory.markov.push(rawPreds.markov === winner);
        window.engineMemory.diff.push(rawPreds.diff === winner);
        window.engineMemory.bias.push(rawPreds.bias === winner);
        window.engineMemory.fade.push(rawPreds.fade === winner);
        
        window.tpLogs.push({ mid: String(mid), winner: winner });
        saveData();
    }

    function processGameData(node) {
        if (!node.mid || !node.card) return;
        if (String(node.mid) !== activeMid) {
            activeMid = String(node.mid);
            const h = window.tpLogs.map(r => r.winner).filter(x => x === "A" || x === "B");
            activePrediction = getOraclePrediction(h, window.engineMemory);
            updateEngineUI();
        }
        if (node.card.split(',').length === 6 && !node.card.includes("1")) {
            recordRound(node.mid, calculateWin(node.card));
            updateEngineUI();
        }
    }

    function updateEngineUI() {
        const total = window.tpStats.wins + window.tpStats.losses;
        const rate = total > 0 ? ((window.tpStats.wins / total) * 100).toFixed(1) : 0;
        
        let wStr = "WAITING...", rStr = "STANDBY";
        if (activePrediction) {
            wStr = activePrediction.win === "WAIT" ? "WAITING..." : "PLAYER " + activePrediction.win;
            rStr = activePrediction.reason;
        }

        intelBox.innerHTML = `
            <b style="color:#0ff;">V11.0 THE ORACLE (LORDS)</b><br>
            <div style="text-align:center;padding:10px;">
                <span style="font-size:24px;color:${activePrediction?.win === 'A' ? '#f44' : (activePrediction?.win === 'B' ? '#4af' : '#ff0')};font-weight:bold;">
                    ${wStr}
                </span><br>
                <span style="font-size:11px;color:#ffd700;">${rStr}</span>
            </div>
            <div style="background:#111;padding:8px;border-radius:6px;font-size:11px;">
                W: ${window.tpStats.wins} | L: ${window.tpStats.losses} | <b>${rate}%</b><br>
                PNL: <b style="color:#ffd700;">${window.tpStats.units.toFixed(2)} U</b>
            </div>
            <div style="font-size:9px;color:#666;margin-top:4px;">DB: ${window.tpLogs.length} | Trades: ${total}</div>
        `;
        if(document.getElementById('dl-btn')) document.getElementById('dl-btn').innerHTML = `💾 DOWNLOAD LOG (${window.tpLogs.length})`;
    }

    // --- NETWORK HOOK (LORDS FORMAT) ---
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
        const response = await originalFetch.apply(this, args);
        try {
            response.clone().json().then(json => {
                const traverse = (n) => {
                    if (!n || typeof n !== 'object') return;
                    if (n.mid && n.card) processGameData(n);
                    if (Array.isArray(n) && n.length && n[0].mid && n[0].win) {
                        n.forEach(r => recordRound(r.mid, r.win === "1" ? "A" : (r.win === "2" ? "B" : "TIE")));
                    }
                    for (let k in n) traverse(n[k]);
                };
                traverse(json);
            });
        } catch (e) { }
        return response;
    };

    performBackfill();
    console.log("%c V11.0 THE ORACLE (LORDS) LOADED ", "color:#0f0;font-weight:bold;");
})();