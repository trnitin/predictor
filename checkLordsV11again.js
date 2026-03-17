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
        return { usedKB, percent: ((usedKB / 5120) * 100).toFixed(2) };
    };

    // 2. UI SETUP
    const container = document.createElement("div");
    container.id = "tp-automation-ui";
    container.style = "position:fixed;top:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:8px;font-family:monospace;width:250px;";
    document.body.appendChild(container);

    const btn = document.createElement("button");
    btn.id = "dl-btn";
    btn.innerHTML = `💾 DOWNLOAD LOG (...)`;
    btn.style = "padding:12px;background:#ffd700;color:#000;border:2px solid #000;cursor:pointer;font-weight:bold;border-radius:4px;";
    container.appendChild(btn);

    const clearBtn = document.createElement("button");
    clearBtn.innerHTML = "🗑️ WIPE MEMORY & STATS";
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

    /* ---------------- 3. THE 5 SUB-ENGINES (V11.2) ---------------- */
    function getMarkov(h) {
        if (!h || h.length < 5) return "A";
        let counts = { AAA: 1, AAB: 1, ABA: 1, ABB: 1, BAA: 1, BAB: 1, BBA: 1, BBB: 1 };
        for (let i = 2; i < h.length; i++) { const k = h[i-2] + h[i-1] + h[i]; if (counts[k]) counts[k]++; }
        const l2 = h.slice(-2).join(""); 
        return counts[l2+"A"] > counts[l2+"B"] ? "A" : "B"; 
    }

    function getDiff(h) {
        if (!h || h.length < 5) return "A";
        const deltas = h.slice(1).map((v, i) => v === h[i] ? "S" : "D");
        let counts = { S: 1, D: 1 };
        const l2d = deltas.slice(-2).join("");
        for (let i = 2; i < deltas.length; i++) { if (deltas[i-2] + deltas[i-1] === l2d) counts[deltas[i]]++; }
        const nextD = counts.S > counts.D ? "S" : "D";
        return nextD === "S" ? h[h.length-1] : (h[h.length-1] === "A" ? "B" : "A");
    }

    function getBias(h) {
        if (!h || h.length === 0) return "A";
        const slice = h.slice(-20);
        return slice.filter(x => x === "A").length > (slice.length / 2) ? "A" : "B";
    }

    function getFade(h) {
        if (!h || h.length === 0) return "A";
        let streak = 1; const last = h[h.length-1];
        for (let i = h.length-2; i >= 0; i--) { if (h[i] === last) streak++; else break; }
        return streak >= 3 ? (last === "A" ? "B" : "A") : last;
    }

    function getRider(h) {
        if (!h || h.length === 0) return "A";
        let streak = 1; const last = h[h.length-1];
        for (let i = h.length-2; i >= 0; i--) { if (h[i] === last) streak++; else break; }
        return streak >= 2 ? last : (last === "B" ? "A" : "B");
    }

    /* ---------------- 4. V11.2 HIGH-VOLUME CONTROLLER ---------------- */
    function getDynamicPrediction(data) {
        const h = data.map(r => r.winner).filter(w => w === 'A' || w === 'B');
        
        if (h.length < 25) return { win: "WAIT", reason: `TRAINING (${h.length}/25)` };

        const preds = {
            markov: getMarkov(h), diff: getDiff(h),
            bias: getBias(h), fade: getFade(h), rider: getRider(h)
        };

        const getAcc = (arr) => {
            const slice = arr.slice(-15);
            return slice.length === 0 ? 0 : slice.filter(Boolean).length / slice.length;
        };

        const accs = {
            markov: getAcc(window.engineMemory.markov), 
            diff: getAcc(window.engineMemory.diff),
            bias: getAcc(window.engineMemory.bias), 
            fade: getAcc(window.engineMemory.fade), 
            rider: getAcc(window.engineMemory.rider)
        };

        let bestEngine = null; let maxAcc = 0;
        for (const [engine, acc] of Object.entries(accs)) {
            if (acc > maxAcc) { maxAcc = acc; bestEngine = engine; }
        }

        // High Volume Gate: 60% Accuracy required
        if (maxAcc >= 0.60 && bestEngine) {
            return { win: preds[bestEngine], reason: `${bestEngine.toUpperCase()} (${Math.round(maxAcc*100)}%)` };
        }

        return { win: "WAIT", reason: `CHOPPY (Max ${Math.round(maxAcc*100)}%)` };
    }

    // 4B. POKER EVALUATOR
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
            let straightScore = hand[0].r;
            if (hand[0].r === 14 && hand[1].r === 3 && hand[2].r === 2) { isStraight = true; straightScore = 13.5; }
            const isTrio = hand[0].r === hand[1].r && hand[1].r === hand[2].r;
            const isPair = hand[0].r === hand[1].r || hand[1].r === hand[2].r;
            const pairRank = hand[0].r === hand[1].r ? hand[0].r : (hand[1].r === hand[2].r ? hand[1].r : 0);
            const kicker = hand[0].r === hand[1].r ? hand[2].r : hand[0].r;
            const tieBreaker = (hand[0].r * 10000) + (hand[1].r * 100) + hand[2].r;

            if (isTrio) return 60000000 + tieBreaker;
            if (isStraight && isFlush) return 50000000 + (straightScore * 100000);
            if (isStraight) return 40000000 + (straightScore * 100000);
            if (isFlush) return 30000000 + tieBreaker;
            if (isPair) return 20000000 + (pairRank * 10000) + kicker;
            return 10000000 + tieBreaker; 
        };

        let handA = [parseCard(cards[0]), parseCard(cards[2]), parseCard(cards[4])];
        let handB = [parseCard(cards[1]), parseCard(cards[3]), parseCard(cards[5])];
        let scoreA = getScore(handA); let scoreB = getScore(handB);

        if (scoreA > scoreB) return "A";
        if (scoreB > scoreA) return "B";
        return "TIE";
    }

    // 5. UI UPDATER
    function updateEngineUI() {
        const data = window.tpLogs;
        const total = window.tpStats.wins + window.tpStats.losses;
        const rate = total > 0 ? ((window.tpStats.wins / total) * 100).toFixed(1) : 0;
        const storage = getStorageStats();

        let displayWin = "WAITING..."; let displayReason = "STANDBY";
        if (activePrediction) {
            displayWin = activePrediction.win === "WAIT" ? "WAITING..." : "PLAYER " + activePrediction.win;
            displayReason = activePrediction.reason;
        }

        let midStr = activeMid ? activeMid.toString().slice(-5) : "WAIT";
        const btnEl = document.getElementById('dl-btn');
        if (btnEl) btnEl.innerHTML = `💾 DOWNLOAD LOG (${data.length})`;

        const intelEl = document.getElementById('tp-intel-box');
        if (!intelEl) return;

        intelEl.style.borderColor = window.tpStats.streak >= 2 ? "#0f0" : (window.tpStats.streak <= -2 ? "#f00" : "#00ff00");
        intelEl.innerHTML = `
            <div style="display:flex;justify-content:space-between;border-bottom:1px solid #333;padding-bottom:5px;margin-bottom:8px;">
                <b style="color:#0ff;">V11.2 LORDS (TRACKING ONLY)</b>
                <span style="font-size:10px;color:#888;">${storage.percent}% DB</span>
            </div>
            <div style="text-align:center;margin-bottom:10px;">
                <span style="font-size:10px;color:#aaa;">PREDICTING MID: *${midStr}</span><br>
                <span style="font-size:24px;color:${activePrediction && activePrediction.win === 'A' ? '#ff4444' : (activePrediction && activePrediction.win === 'B' ? '#44aaff' : '#ffff00')};font-weight:bold;">
                    ${displayWin}
                </span><br>
                <span style="font-size:11px;color:#ffd700;">MODE: ${displayReason}</span>
            </div>
            <div style="background:#111;padding:8px;border-radius:6px;border:1px solid #333;">
                <div style="display:flex;justify-content:space-between;font-size:11px;">
                    <span>W: ${window.tpStats.wins} | L: ${window.tpStats.losses}</span>
                    <span style="color:${rate > 51.3 ? '#0f0' : '#f00'};font-weight:bold;">${rate}%</span>
                </div>
                <div style="text-align:center;margin-top:5px;">
                    <span style="font-size:10px;color:#888;">ESTIMATED PNL</span><br>
                    <span style="font-size:18px;color:#ffd700;font-weight:bold;">${window.tpStats.units.toFixed(2)} U</span>
                </div>
            </div>
            <div style="text-align:center;font-size:10px;color:#666;margin-top:5px;">ROUNDS: ${data.length}</div>
        `;
    }

    /* ---------------- 6A. HISTORY PROCESSOR ---------------- */
    function processHistoryArray(historyArray) {
        if (!Array.isArray(historyArray) || historyArray.length === 0) return;
        const recentRounds = [...historyArray].reverse(); 
        let added = 0; 

        // Read directly from window object to avoid cache delay
        const currentData = window.tpLogs;

        recentRounds.forEach(d => {
            if (!d || !d.mid || !d.win) return;
            const mid = String(d.mid);
            const winCode = String(d.win);

            const alreadyLogged = currentData.some(log => String(log.mid) === mid);
            if (!alreadyLogged) {
                let winner = "TIE";
                if (winCode === "1") winner = "A";
                if (winCode === "2") winner = "B";

                const h = window.tpLogs.map(r => r.winner).filter(x => x === "A" || x === "B");

                if (h.length >= 25 && winner !== "TIE") {
                    const simPred = getDynamicPrediction(window.tpLogs);
                    
                    if (simPred && simPred.win !== "WAIT") {
                        if (simPred.win === winner) {
                            window.tpStats.wins++; window.tpStats.units += 0.98; 
                            window.tpStats.streak = Math.max(1, window.tpStats.streak + 1);
                        } else {
                            window.tpStats.losses++; window.tpStats.units -= 1.0;
                            window.tpStats.streak = Math.min(-1, window.tpStats.streak - 1);
                        }
                    }

                    const rP = { markov: getMarkov(h), diff: getDiff(h), bias: getBias(h), fade: getFade(h), rider: getRider(h) };
                    window.engineMemory.markov.push(rP.markov === winner);
                    window.engineMemory.diff.push(rP.diff === winner);
                    window.engineMemory.bias.push(rP.bias === winner);
                    window.engineMemory.fade.push(rP.fade === winner);
                    window.engineMemory.rider.push(rP.rider === winner);
                }

                window.tpLogs.push({
                    mid: mid, winner: winner,
                    cards_A: "HIST,HIST,HIST", cards_B: "HIST,HIST,HIST"
                });
                added++;
            }
        });
        
        if (added > 0) {
            saveData();
            activePrediction = getDynamicPrediction(window.tpLogs);
            updateEngineUI();
        }
    }

    /* ---------------- 6B. LIVE ROUND PROCESSOR ---------------- */
    function processGameData(d) {
        if (!d || !d.mid || !d.card) return;
        const mid = String(d.mid);
        const cardStr = String(d.card);

        if (mid !== activeMid) {
            activeMid = mid;
            activePrediction = getDynamicPrediction(window.tpLogs);
            updateEngineUI(); 
        }

        const cardsArray = cardStr.split(',');
        if (cardsArray.length === 6 && !cardsArray.includes("1")) {
            const currentData = window.tpLogs;
            const alreadyLogged = currentData.some(log => String(log.mid) === mid);
            
            if (!alreadyLogged) {
                const winner = calculateWin(cardStr);
                const h = window.tpLogs.map(r => r.winner).filter(x => x === "A" || x === "B");

                if (h.length >= 25 && winner !== "TIE") {
                    if (activePrediction && activePrediction.win !== "WAIT") {
                        if (activePrediction.win === winner) {
                            window.tpStats.wins++; window.tpStats.units += 0.98; 
                            window.tpStats.streak = Math.max(1, window.tpStats.streak + 1);
                        } else {
                            window.tpStats.losses++; window.tpStats.units -= 1.0;
                            window.tpStats.streak = Math.min(-1, window.tpStats.streak - 1);
                        }
                    }

                    const rP = { markov: getMarkov(h), diff: getDiff(h), bias: getBias(h), fade: getFade(h), rider: getRider(h) };
                    window.engineMemory.markov.push(rP.markov === winner);
                    window.engineMemory.diff.push(rP.diff === winner);
                    window.engineMemory.bias.push(rP.bias === winner);
                    window.engineMemory.fade.push(rP.fade === winner);
                    window.engineMemory.rider.push(rP.rider === winner);
                }

                window.tpLogs.push({
                    mid: mid, winner: winner,
                    cards_A: `${cardsArray[0]},${cardsArray[2]},${cardsArray[4]}`,
                    cards_B: `${cardsArray[1]},${cardsArray[3]},${cardsArray[5]}`
                });

                saveData();
                activePrediction = getDynamicPrediction(window.tpLogs); 
                updateEngineUI();
            }
        }
    }

    // 7. DEEP JSON SCANNER
    function parseAndRoute(rawText) {
        if (!rawText) return;
        let payload;
        try { payload = JSON.parse(rawText); } catch(e) { return; }

        let extractedGames = [];
        let extractedHistory = [];

        function traverse(node, depth = 0) {
            if (depth > 50 || !node || typeof node !== 'object') return;

            if (node.p && Array.isArray(node.p.k) && Array.isArray(node.p.v)) {
                const keys = node.p.k;
                const vals = node.p.v;

                const midIdx = keys.indexOf("mid");
                const cardIdx = keys.indexOf("card");
                const winIdx = keys.indexOf("win");

                if (midIdx !== -1 && cardIdx !== -1) {
                    const m = vals[midIdx]?.s ?? vals[midIdx];
                    const c = vals[cardIdx]?.s ?? vals[cardIdx];
                    if (m && c) extractedGames.push({ mid: String(m), card: String(c) });
                }

                if (midIdx !== -1 && winIdx !== -1) {
                    const m = vals[midIdx]?.s ?? vals[midIdx];
                    const w = vals[winIdx]?.s ?? vals[winIdx];
                    if (m && w) extractedHistory.push({ mid: String(m), win: String(w) });
                }
            }

            if (node.mid && node.card && typeof node.mid !== 'object') {
                extractedGames.push({ mid: String(node.mid), card: String(node.card) });
            }

            if (Array.isArray(node)) {
                if (node.length > 0 && node[0].mid && node[0].win) {
                    node.forEach(r => extractedHistory.push(r));
                }
            }

            for (let key in node) {
                traverse(node[key], depth + 1);
            }
        }

        traverse(payload);
        
        if (extractedHistory.length > 0) {
            let uniqueHist = [];
            let mids = new Set();
            extractedHistory.forEach(h => {
                if(!mids.has(h.mid)) { mids.add(h.mid); uniqueHist.push(h); }
            });
            processHistoryArray(uniqueHist);
        }
        
        if (extractedGames.length > 0) {
            extractedGames.forEach(g => processGameData(g));
        }
    }

    // 8. NETWORK HOOKS
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const response = await originalFetch.apply(this, args);
        try {
            response.clone().text().then(text => parseAndRoute(text)).catch(e => {});
        } catch(e) {}
        return response;
    };

    const originalXHR = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this.addEventListener('load', function() {
            try {
                parseAndRoute(this.responseText);
            } catch(e) {}
        });
        originalXHR.call(this, method, url, ...rest);
    };

    // 9. IDLE CONTROL
    btn.onclick = (e) => {
        e.preventDefault();
        const currentLogs = JSON.parse(localStorage.getItem(LOGS_KEY)) || [];
        if (currentLogs.length === 0) return alert("No data yet!");
        const content = currentLogs.map(r => `${r.mid},${r.winner},${r.cards_A},${r.cards_B}`).join("\n");
        const blob = new Blob([content], { type: "text/plain" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `lords_v11_2_highvol_view_${Date.now()}.csv`;
        link.click();
    };

    setInterval(() => {
        window.scrollBy(0, 10);
        setTimeout(() => window.scrollBy(0, -10), 1000);
        updateEngineUI(); 
    }, 5000);

    // 10. FIXED ISOLATED BACKFILL
    function performBackfill() {
        const rawLogs = JSON.parse(localStorage.getItem(LOGS_KEY)) || [];
        if (rawLogs.length === 0) return;

        // Reset runtime memory
        window.tpLogs = [];
        window.tpStats = { wins: 0, losses: 0, streak: 0, units: 0 };
        window.engineMemory = { markov: [], diff: [], bias: [], fade: [], rider: [] };

        for (let i = 0; i < rawLogs.length; i++) {
            const entry = rawLogs[i];
            const mid = String(entry.mid);
            const winner = entry.winner;
            const cards_A = entry.cards_A || "HIST,HIST,HIST";
            const cards_B = entry.cards_B || "HIST,HIST,HIST";

            if (winner !== "A" && winner !== "B") {
                window.tpLogs.push({ mid, winner, cards_A, cards_B });
                continue;
            }

            const h = window.tpLogs.map(r => r.winner).filter(x => x === "A" || x === "B");

            if (h.length >= 25) {
                const simPred = getDynamicPrediction(window.tpLogs);
                
                if (simPred && simPred.win !== "WAIT") {
                    if (simPred.win === winner) {
                        window.tpStats.wins++; window.tpStats.units += 0.98; 
                        window.tpStats.streak = Math.max(1, window.tpStats.streak + 1);
                    } else {
                        window.tpStats.losses++; window.tpStats.units -= 1.0;
                        window.tpStats.streak = Math.min(-1, window.tpStats.streak - 1);
                    }
                }

                const rP = { markov: getMarkov(h), diff: getDiff(h), bias: getBias(h), fade: getFade(h), rider: getRider(h) };
                window.engineMemory.markov.push(rP.markov === winner);
                window.engineMemory.diff.push(rP.diff === winner);
                window.engineMemory.bias.push(rP.bias === winner);
                window.engineMemory.fade.push(rP.fade === winner);
                window.engineMemory.rider.push(rP.rider === winner);
            }

            window.tpLogs.push({ mid, winner, cards_A, cards_B });
        }

        saveData();
        activePrediction = getDynamicPrediction(window.tpLogs);
        updateEngineUI();
    }

    // Initialize Backfill instantly
    performBackfill();

    console.log("%c V11.2 LORDS HIGH-VOL BACKFILL FIXED ", "background:#000; color:#0f0; font-weight:bold; font-size:14px;");
})();






// place Orders
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
        return { usedKB, percent: ((usedKB / 5120) * 100).toFixed(2) };
    };

    // 2. UI SETUP
    const container = document.createElement("div");
    container.id = "tp-automation-ui";
    container.style = "position:fixed;top:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:8px;font-family:monospace;width:250px;";
    document.body.appendChild(container);

    const btn = document.createElement("button");
    btn.id = "dl-btn";
    btn.innerHTML = `💾 DOWNLOAD LOG (...)`;
    btn.style = "padding:12px;background:#ffd700;color:#000;border:2px solid #000;cursor:pointer;font-weight:bold;border-radius:4px;";
    container.appendChild(btn);

    const clearBtn = document.createElement("button");
    clearBtn.innerHTML = "🗑️ WIPE MEMORY & STATS";
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

    /* ---------------- 3. THE 5 SUB-ENGINES (V11.2) ---------------- */
    function getMarkov(h) {
        if (!h || h.length < 5) return "A";
        let counts = { AAA: 1, AAB: 1, ABA: 1, ABB: 1, BAA: 1, BAB: 1, BBA: 1, BBB: 1 };
        for (let i = 2; i < h.length; i++) { const k = h[i-2] + h[i-1] + h[i]; if (counts[k]) counts[k]++; }
        const l2 = h.slice(-2).join(""); 
        return counts[l2+"A"] > counts[l2+"B"] ? "A" : "B"; 
    }

    function getDiff(h) {
        if (!h || h.length < 5) return "A";
        const deltas = h.slice(1).map((v, i) => v === h[i] ? "S" : "D");
        let counts = { S: 1, D: 1 };
        const l2d = deltas.slice(-2).join("");
        for (let i = 2; i < deltas.length; i++) { if (deltas[i-2] + deltas[i-1] === l2d) counts[deltas[i]]++; }
        const nextD = counts.S > counts.D ? "S" : "D";
        return nextD === "S" ? h[h.length-1] : (h[h.length-1] === "A" ? "B" : "A");
    }

    function getBias(h) {
        if (!h || h.length === 0) return "A";
        const slice = h.slice(-20);
        return slice.filter(x => x === "A").length > (slice.length / 2) ? "A" : "B";
    }

    function getFade(h) {
        if (!h || h.length === 0) return "A";
        let streak = 1; const last = h[h.length-1];
        for (let i = h.length-2; i >= 0; i--) { if (h[i] === last) streak++; else break; }
        return streak >= 3 ? (last === "A" ? "B" : "A") : last;
    }

    function getRider(h) {
        if (!h || h.length === 0) return "A";
        let streak = 1; const last = h[h.length-1];
        for (let i = h.length-2; i >= 0; i--) { if (h[i] === last) streak++; else break; }
        return streak >= 2 ? last : (last === "B" ? "A" : "B");
    }

    /* ---------------- 4. V11.2 HIGH-VOLUME CONTROLLER ---------------- */
    function getDynamicPrediction(data) {
        const h = data.map(r => r.winner).filter(w => w === 'A' || w === 'B');
        
        if (h.length < 25) return { win: "WAIT", reason: `TRAINING (${h.length}/25)` };

        const preds = {
            markov: getMarkov(h), diff: getDiff(h),
            bias: getBias(h), fade: getFade(h), rider: getRider(h)
        };

        const getAcc = (arr) => {
            const slice = arr.slice(-15);
            return slice.length === 0 ? 0 : slice.filter(Boolean).length / slice.length;
        };

        const accs = {
            markov: getAcc(window.engineMemory.markov), 
            diff: getAcc(window.engineMemory.diff),
            bias: getAcc(window.engineMemory.bias), 
            fade: getAcc(window.engineMemory.fade), 
            rider: getAcc(window.engineMemory.rider)
        };

        let bestEngine = null; let maxAcc = 0;
        for (const [engine, acc] of Object.entries(accs)) {
            if (acc > maxAcc) { maxAcc = acc; bestEngine = engine; }
        }

        // High Volume Gate: 60% Accuracy required
        if (maxAcc >= 0.60 && bestEngine) {
            return { win: preds[bestEngine], reason: `${bestEngine.toUpperCase()} (${Math.round(maxAcc*100)}%)` };
        }

        return { win: "WAIT", reason: `CHOPPY (Max ${Math.round(maxAcc*100)}%)` };
    }

    // 4B. POKER EVALUATOR
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
            let straightScore = hand[0].r;
            if (hand[0].r === 14 && hand[1].r === 3 && hand[2].r === 2) { isStraight = true; straightScore = 13.5; }
            const isTrio = hand[0].r === hand[1].r && hand[1].r === hand[2].r;
            const isPair = hand[0].r === hand[1].r || hand[1].r === hand[2].r;
            const pairRank = hand[0].r === hand[1].r ? hand[0].r : (hand[1].r === hand[2].r ? hand[1].r : 0);
            const kicker = hand[0].r === hand[1].r ? hand[2].r : hand[0].r;
            const tieBreaker = (hand[0].r * 10000) + (hand[1].r * 100) + hand[2].r;

            if (isTrio) return 60000000 + tieBreaker;
            if (isStraight && isFlush) return 50000000 + (straightScore * 100000);
            if (isStraight) return 40000000 + (straightScore * 100000);
            if (isFlush) return 30000000 + tieBreaker;
            if (isPair) return 20000000 + (pairRank * 10000) + kicker;
            return 10000000 + tieBreaker; 
        };

        let handA = [parseCard(cards[0]), parseCard(cards[2]), parseCard(cards[4])];
        let handB = [parseCard(cards[1]), parseCard(cards[3]), parseCard(cards[5])];
        let scoreA = getScore(handA); let scoreB = getScore(handB);

        if (scoreA > scoreB) return "A";
        if (scoreB > scoreA) return "B";
        return "TIE";
    }

    // 5. UI UPDATER
    function updateEngineUI() {
        const data = window.tpLogs;
        const total = window.tpStats.wins + window.tpStats.losses;
        const rate = total > 0 ? ((window.tpStats.wins / total) * 100).toFixed(1) : 0;
        const storage = getStorageStats();

        let displayWin = "WAITING..."; let displayReason = "STANDBY";
        if (activePrediction) {
            displayWin = activePrediction.win === "WAIT" ? "WAITING..." : "PLAYER " + activePrediction.win;
            displayReason = activePrediction.reason;
        }

        let midStr = activeMid ? activeMid.toString().slice(-5) : "WAIT";
        const btnEl = document.getElementById('dl-btn');
        if (btnEl) btnEl.innerHTML = `💾 DOWNLOAD LOG (${data.length})`;

        const intelEl = document.getElementById('tp-intel-box');
        if (!intelEl) return;

        intelEl.style.borderColor = window.tpStats.streak >= 2 ? "#0f0" : (window.tpStats.streak <= -2 ? "#f00" : "#00ff00");
        intelEl.innerHTML = `
            <div style="display:flex;justify-content:space-between;border-bottom:1px solid #333;padding-bottom:5px;margin-bottom:8px;">
                <b style="color:#0ff;">V11.2 LORDS (AUTO-BET)</b>
                <span style="font-size:10px;color:#888;">${storage.percent}% DB</span>
            </div>
            <div style="text-align:center;margin-bottom:10px;">
                <span style="font-size:10px;color:#aaa;">PREDICTING MID: *${midStr}</span><br>
                <span style="font-size:24px;color:${activePrediction && activePrediction.win === 'A' ? '#ff4444' : (activePrediction && activePrediction.win === 'B' ? '#44aaff' : '#ffff00')};font-weight:bold;">
                    ${displayWin}
                </span><br>
                <span style="font-size:11px;color:#ffd700;">MODE: ${displayReason}</span>
            </div>
            <div style="background:#111;padding:8px;border-radius:6px;border:1px solid #333;">
                <div style="display:flex;justify-content:space-between;font-size:11px;">
                    <span>W: ${window.tpStats.wins} | L: ${window.tpStats.losses}</span>
                    <span style="color:${rate > 51.3 ? '#0f0' : '#f00'};font-weight:bold;">${rate}%</span>
                </div>
                <div style="text-align:center;margin-top:5px;">
                    <span style="font-size:10px;color:#888;">ESTIMATED PNL</span><br>
                    <span style="font-size:18px;color:#ffd700;font-weight:bold;">${window.tpStats.units.toFixed(2)} U</span>
                </div>
            </div>
            <div style="text-align:center;font-size:10px;color:#666;margin-top:5px;">ROUNDS: ${data.length}</div>
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
                        // 1.8s delay to mimic human reading and avoid rejection
                        setTimeout(() => { backBtn.click(); executeWager(); }, 1800); 
                        return;
                    }
                } 
            }
        }, 500);
        setTimeout(() => clearInterval(scan), 15000); 
    }

    /* ---------------- 7A. HISTORY PROCESSOR ---------------- */
    function processHistoryArray(historyArray) {
        if (!Array.isArray(historyArray) || historyArray.length === 0) return;
        const recentRounds = [...historyArray].reverse(); 
        let added = 0; 

        // Read directly from window object to avoid cache delay
        const currentData = window.tpLogs;

        recentRounds.forEach(d => {
            if (!d || !d.mid || !d.win) return;
            const mid = String(d.mid);
            const winCode = String(d.win);

            const alreadyLogged = currentData.some(log => String(log.mid) === mid);
            if (!alreadyLogged) {
                let winner = "TIE";
                if (winCode === "1") winner = "A";
                if (winCode === "2") winner = "B";

                const h = window.tpLogs.map(r => r.winner).filter(x => x === "A" || x === "B");

                if (h.length >= 25 && winner !== "TIE") {
                    const simPred = getDynamicPrediction(window.tpLogs);
                    
                    if (simPred && simPred.win !== "WAIT") {
                        if (simPred.win === winner) {
                            window.tpStats.wins++; window.tpStats.units += 0.98; 
                            window.tpStats.streak = Math.max(1, window.tpStats.streak + 1);
                        } else {
                            window.tpStats.losses++; window.tpStats.units -= 1.0;
                            window.tpStats.streak = Math.min(-1, window.tpStats.streak - 1);
                        }
                    }

                    const rP = { markov: getMarkov(h), diff: getDiff(h), bias: getBias(h), fade: getFade(h), rider: getRider(h) };
                    window.engineMemory.markov.push(rP.markov === winner);
                    window.engineMemory.diff.push(rP.diff === winner);
                    window.engineMemory.bias.push(rP.bias === winner);
                    window.engineMemory.fade.push(rP.fade === winner);
                    window.engineMemory.rider.push(rP.rider === winner);
                }

                window.tpLogs.push({
                    mid: mid, winner: winner,
                    cards_A: "HIST,HIST,HIST", cards_B: "HIST,HIST,HIST"
                });
                added++;
            }
        });
        
        if (added > 0) {
            saveData();
            activePrediction = getDynamicPrediction(window.tpLogs);
            updateEngineUI();
        }
    }

    /* ---------------- 7B. LIVE ROUND PROCESSOR ---------------- */
    function processGameData(d) {
        if (!d || !d.mid || !d.card) return;
        const mid = String(d.mid);
        const cardStr = String(d.card);

        if (mid !== activeMid) {
            activeMid = mid;
            activePrediction = getDynamicPrediction(window.tpLogs);
            updateEngineUI(); 

            // --- TRIGGER AUTO-BET ---
            if (activePrediction && activePrediction.win !== "WAIT") {
                clickBet(activePrediction.win);
            }
        }

        const cardsArray = cardStr.split(',');
        if (cardsArray.length === 6 && !cardsArray.includes("1")) {
            const currentData = window.tpLogs;
            const alreadyLogged = currentData.some(log => String(log.mid) === mid);
            
            if (!alreadyLogged) {
                const winner = calculateWin(cardStr);
                const h = window.tpLogs.map(r => r.winner).filter(x => x === "A" || x === "B");

                if (h.length >= 25 && winner !== "TIE") {
                    if (activePrediction && activePrediction.win !== "WAIT") {
                        if (activePrediction.win === winner) {
                            window.tpStats.wins++; window.tpStats.units += 0.98; 
                            window.tpStats.streak = Math.max(1, window.tpStats.streak + 1);
                        } else {
                            window.tpStats.losses++; window.tpStats.units -= 1.0;
                            window.tpStats.streak = Math.min(-1, window.tpStats.streak - 1);
                        }
                    }

                    const rP = { markov: getMarkov(h), diff: getDiff(h), bias: getBias(h), fade: getFade(h), rider: getRider(h) };
                    window.engineMemory.markov.push(rP.markov === winner);
                    window.engineMemory.diff.push(rP.diff === winner);
                    window.engineMemory.bias.push(rP.bias === winner);
                    window.engineMemory.fade.push(rP.fade === winner);
                    window.engineMemory.rider.push(rP.rider === winner);
                }

                window.tpLogs.push({
                    mid: mid, winner: winner,
                    cards_A: `${cardsArray[0]},${cardsArray[2]},${cardsArray[4]}`,
                    cards_B: `${cardsArray[1]},${cardsArray[3]},${cardsArray[5]}`
                });

                saveData();
                activePrediction = getDynamicPrediction(window.tpLogs); 
                updateEngineUI();
            }
        }
    }

    // 8. DEEP JSON SCANNER
    function parseAndRoute(rawText) {
        if (!rawText) return;
        let payload;
        try { payload = JSON.parse(rawText); } catch(e) { return; }

        let extractedGames = [];
        let extractedHistory = [];

        function traverse(node, depth = 0) {
            if (depth > 50 || !node || typeof node !== 'object') return;

            if (node.p && Array.isArray(node.p.k) && Array.isArray(node.p.v)) {
                const keys = node.p.k;
                const vals = node.p.v;

                const midIdx = keys.indexOf("mid");
                const cardIdx = keys.indexOf("card");
                const winIdx = keys.indexOf("win");

                if (midIdx !== -1 && cardIdx !== -1) {
                    const m = vals[midIdx]?.s ?? vals[midIdx];
                    const c = vals[cardIdx]?.s ?? vals[cardIdx];
                    if (m && c) extractedGames.push({ mid: String(m), card: String(c) });
                }

                if (midIdx !== -1 && winIdx !== -1) {
                    const m = vals[midIdx]?.s ?? vals[midIdx];
                    const w = vals[winIdx]?.s ?? vals[winIdx];
                    if (m && w) extractedHistory.push({ mid: String(m), win: String(w) });
                }
            }

            if (node.mid && node.card && typeof node.mid !== 'object') {
                extractedGames.push({ mid: String(node.mid), card: String(node.card) });
            }

            if (Array.isArray(node)) {
                if (node.length > 0 && node[0].mid && node[0].win) {
                    node.forEach(r => extractedHistory.push(r));
                }
            }

            for (let key in node) {
                traverse(node[key], depth + 1);
            }
        }

        traverse(payload);
        
        if (extractedHistory.length > 0) {
            let uniqueHist = [];
            let mids = new Set();
            extractedHistory.forEach(h => {
                if(!mids.has(h.mid)) { mids.add(h.mid); uniqueHist.push(h); }
            });
            processHistoryArray(uniqueHist);
        }
        
        if (extractedGames.length > 0) {
            extractedGames.forEach(g => processGameData(g));
        }
    }

    // 9. NETWORK HOOKS 
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const response = await originalFetch.apply(this, args);
        try {
            response.clone().text().then(text => parseAndRoute(text)).catch(e => {});
        } catch(e) {}
        return response;
    };

    const originalXHR = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this.addEventListener('load', function() {
            try {
                parseAndRoute(this.responseText);
            } catch(e) {}
        });
        originalXHR.call(this, method, url, ...rest);
    };

    // 10. IDLE CONTROL
    btn.onclick = (e) => {
        e.preventDefault();
        const currentLogs = JSON.parse(localStorage.getItem(LOGS_KEY)) || [];
        if (currentLogs.length === 0) return alert("No data yet!");
        const content = currentLogs.map(r => `${r.mid},${r.winner},${r.cards_A},${r.cards_B}`).join("\n");
        const blob = new Blob([content], { type: "text/plain" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `lords_v11_2_highvol_autobet_${Date.now()}.csv`;
        link.click();
    };

    setInterval(() => {
        window.scrollBy(0, 10);
        setTimeout(() => window.scrollBy(0, -10), 1000);
        updateEngineUI(); 
    }, 5000);

    // 11. FIXED ISOLATED BACKFILL
    function performBackfill() {
        const rawLogs = JSON.parse(localStorage.getItem(LOGS_KEY)) || [];
        if (rawLogs.length === 0) return;

        // Reset runtime memory
        window.tpLogs = [];
        window.tpStats = { wins: 0, losses: 0, streak: 0, units: 0 };
        window.engineMemory = { markov: [], diff: [], bias: [], fade: [], rider: [] };

        for (let i = 0; i < rawLogs.length; i++) {
            const entry = rawLogs[i];
            const mid = String(entry.mid);
            const winner = entry.winner;
            const cards_A = entry.cards_A || "HIST,HIST,HIST";
            const cards_B = entry.cards_B || "HIST,HIST,HIST";

            if (winner !== "A" && winner !== "B") {
                window.tpLogs.push({ mid, winner, cards_A, cards_B });
                continue;
            }

            const h = window.tpLogs.map(r => r.winner).filter(x => x === "A" || x === "B");

            if (h.length >= 25) {
                const simPred = getDynamicPrediction(window.tpLogs);
                
                if (simPred && simPred.win !== "WAIT") {
                    if (simPred.win === winner) {
                        window.tpStats.wins++; window.tpStats.units += 0.98; 
                        window.tpStats.streak = Math.max(1, window.tpStats.streak + 1);
                    } else {
                        window.tpStats.losses++; window.tpStats.units -= 1.0;
                        window.tpStats.streak = Math.min(-1, window.tpStats.streak - 1);
                    }
                }

                const rP = { markov: getMarkov(h), diff: getDiff(h), bias: getBias(h), fade: getFade(h), rider: getRider(h) };
                window.engineMemory.markov.push(rP.markov === winner);
                window.engineMemory.diff.push(rP.diff === winner);
                window.engineMemory.bias.push(rP.bias === winner);
                window.engineMemory.fade.push(rP.fade === winner);
                window.engineMemory.rider.push(rP.rider === winner);
            }

            window.tpLogs.push({ mid, winner, cards_A, cards_B });
        }

        saveData();
        activePrediction = getDynamicPrediction(window.tpLogs);
        updateEngineUI();
    }

    // Initialize Backfill instantly
    performBackfill();

    console.log("%c V11.2 LORDS HIGH-VOL AUTO-BET ONLINE ", "background:#000; color:#0f0; font-weight:bold; font-size:14px;");
})();