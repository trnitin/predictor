// without order placement
(function() {
    // 0. PREVENT DUPLICATE UIs
    const existingUi = document.getElementById("tp-automation-ui");
    if (existingUi) existingUi.remove();

    // 1. DATA & STATS PERSISTENCE
    const LOGS_KEY = '1day_teenpatti_logs';
    const STATS_KEY = '1day_teenpatti_stats';
    
    window.tpLogs = JSON.parse(localStorage.getItem(LOGS_KEY)) || [];
    window.tpStats = JSON.parse(localStorage.getItem(STATS_KEY)) || { wins: 0, losses: 0, streak: 0, units: 0 };
    
    let activeMid = null;
    let activePrediction = null;

    const saveData = () => {
        localStorage.setItem(LOGS_KEY, JSON.stringify(window.tpLogs));
        localStorage.setItem(STATS_KEY, JSON.stringify(window.tpStats));
    };

    const playSound = (freq, type) => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = type; osc.frequency.setValueAtTime(freq, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(); osc.stop(ctx.currentTime + 0.5);
        } catch(e) {}
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
    container.style = "position:fixed;bottom:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:8px;font-family:monospace;width:250px;";
    document.body.appendChild(container);

    const btn = document.createElement("button");
    btn.id = "dl-btn";
    btn.innerHTML = `💾 DOWNLOAD LOG (${window.tpLogs.length})`;
    btn.style = "padding:12px;background:#ffd700;color:#000;border:2px solid #000;cursor:pointer;font-weight:bold;border-radius:4px;";
    container.appendChild(btn);

    const clearBtn = document.createElement("button");
    clearBtn.innerHTML = "🗑️ WIPE MEMORY & STATS";
    clearBtn.style = "padding:5px;background:#ff4444;color:#fff;border:none;cursor:pointer;font-size:10px;border-radius:4px;font-weight:bold;";
    clearBtn.onclick = () => { 
        if(confirm("Wipe all data and PNL?")) { 
            window.tpLogs = []; 
            window.tpStats = { wins: 0, losses: 0, streak: 0, units: 0 };
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

    // 3. OMNI-SNIPER LOGIC ENGINE (V6.0 Hybrid)
    
    // Core V3.0 Frequency Scanner extracted into a pure function
    function scanFrequencies(historyStr) {
        for (let d of [5, 4, 3, 2]) {
            const seq = historyStr.slice(-d);
            let a_count = 0, b_count = 0;
            for (let i = 0; i < historyStr.length - d; i++) {
                if (historyStr.substring(i, i + d) === seq) {
                    const nextResult = historyStr[i + d];
                    if (nextResult === 'A') a_count++;
                    if (nextResult === 'B') b_count++;
                }
            }
            const total = a_count + b_count;
            if (total >= 2) { 
                const a_prob = a_count / total;
                const b_prob = b_count / total;
                if (a_prob >= 0.66) return { target: "A", prob: a_prob, seq: seq, type: "FREQ" };
                if (b_prob >= 0.66) return { target: "B", prob: b_prob, seq: seq, type: "FREQ" };
            }
        }
        
        const last3 = historyStr.slice(-3);
        const last4 = historyStr.slice(-4);
        const lastWinner = historyStr.slice(-1);
        
        if (last4 === "ABAB" || last4 === "BABA") return { target: lastWinner === "A" ? "B" : "A", prob: 0, seq: last4, type: "CHOP" };
        if (last3 === "AAA" || last3 === "BBB") return { target: lastWinner, prob: 0, seq: last3, type: "STREAK" };
        
        return null;
    }

    // The Virtual Regime Scanner (Tests Follow vs Fade)
    function detectRegime(validHistory) {
        if(validHistory.length < 25) return { mode: "WARMUP", activeEngine: null, info: "COLLECTING DATA" };
        
        let alphaW = 0, alphaL = 0; // Alpha = Follow Sniper
        let betaW = 0, betaL = 0;   // Beta = Fade Sniper

        const testWindow = validHistory.slice(-25);
        for(let i = 5; i < testWindow.length; i++) {
            const histSliceIndex = validHistory.length - 25 + i;
            const histSlice = validHistory.slice(0, histSliceIndex).join('');
            const actualResult = testWindow[i];

            const signal = scanFrequencies(histSlice);
            if(signal) {
                // Alpha: Does following the Sniper work?
                if(signal.target === actualResult) alphaW++;
                else alphaL++;

                // Beta: Does fading the Sniper work?
                const fadeTarget = signal.target === "A" ? "B" : "A";
                if(fadeTarget === actualResult) betaW++;
                else betaL++;
            }
        }

        const alphaRate = (alphaW + alphaL) > 0 ? alphaW / (alphaW + alphaL) : 0;
        const betaRate = (betaW + betaL) > 0 ? betaW / (betaW + betaL) : 0;

        if(alphaRate >= 0.55 && alphaRate >= betaRate) {
            return { mode: "WEEKDAY (FOLLOW)", activeEngine: "ALPHA", info: `A-EDGE: ${Math.round(alphaRate*100)}%` };
        }
        if(betaRate >= 0.55 && betaRate > alphaRate) {
            return { mode: "WEEKEND (FADE)", activeEngine: "BETA", info: `B-EDGE: ${Math.round(betaRate*100)}%` };
        }
        
        return { mode: "CHAOS (NO EDGE)", activeEngine: null, info: `SIM: A${Math.round(alphaRate*100)}% B${Math.round(betaRate*100)}%` };
    }

    function getDynamicPrediction(data) {
        const validHistory = data.map(r => r.winner).filter(w => w === 'A' || w === 'B');
        const regime = detectRegime(validHistory);

        if(!regime.activeEngine) {
            return { win: "WAIT", reason: `${regime.mode} | ${regime.info}` };
        }

        const historyStr = validHistory.join('');
        const signal = scanFrequencies(historyStr);

        if(!signal) {
            return { win: "WAIT", reason: `${regime.mode} | NO CLEAR PATTERN` };
        }

        let prediction = signal.target;
        let reasonStr = signal.type === "FREQ" 
            ? `PROB [${signal.seq}] (${(signal.prob*100).toFixed(0)}%)` 
            : `STRICT [${signal.seq}]`;

        if(regime.activeEngine === "BETA") {
            prediction = prediction === "A" ? "B" : "A";
            reasonStr = `FADE ` + reasonStr;
        }

        return { win: prediction, reason: `${regime.mode} | ${reasonStr}` };
    }

    // 4. POKER EVALUATOR
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
        window.tpLogs = JSON.parse(localStorage.getItem(LOGS_KEY)) || [];
        window.tpStats = JSON.parse(localStorage.getItem(STATS_KEY)) || { wins: 0, losses: 0, streak: 0, units: 0 };
        
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
                <b style="color:#0ff;">1-DAY TP (OMNI-SNIPER ADVISORY)</b>
                <span style="font-size:10px;color:#888;">${storage.percent}% DB</span>
            </div>
            <div style="text-align:center;margin-bottom:10px;">
                <span style="font-size:10px;color:#aaa;">PREDICTING MID: *${midStr}</span><br>
                <span style="font-size:24px;color:${activePrediction && activePrediction.win === 'WAIT' ? '#888' : (activePrediction && activePrediction.win === 'A' ? '#ff4444' : '#44aaff')};font-weight:bold;">
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
            <div style="text-align:center;font-size:10px;color:#666;margin-top:5px;">ROUNDS SECURED: ${data.length}</div>
        `;
    }

    // 6A. HISTORY PROCESSOR
    function processHistoryArray(historyArray) {
        if (!Array.isArray(historyArray) || historyArray.length === 0) return;
        const recentRounds = [...historyArray].reverse(); 
        let added = 0; let simWins = 0; let simLosses = 0;

        const currentData = JSON.parse(localStorage.getItem(LOGS_KEY)) || [];

        recentRounds.forEach(d => {
            if (!d || !d.mid || !d.win) return;
            const mid = String(d.mid);
            const winCode = String(d.win);

            const alreadyLogged = currentData.some(log => String(log.mid) === mid);
            if (!alreadyLogged) {
                let winner = "TIE";
                if (winCode === "1") winner = "A";
                if (winCode === "2") winner = "B";

                // Only log PNL stats if the bot has exited Warmup and actually placed a simulated bet
                if (window.tpLogs.length >= 25) {
                    const simPred = getDynamicPrediction(window.tpLogs);
                    if (simPred && simPred.win !== "WAIT") {
                        if (winner === "TIE") {
                            window.tpStats.losses++; window.tpStats.units -= 1.0;
                            window.tpStats.streak = Math.min(-1, window.tpStats.streak - 1);
                            simLosses++;
                        } else if (simPred.win === winner) {
                            window.tpStats.wins++; window.tpStats.units += 0.98; 
                            window.tpStats.streak = Math.max(1, window.tpStats.streak + 1);
                            simWins++;
                        } else {
                            window.tpStats.losses++; window.tpStats.units -= 1.0;
                            window.tpStats.streak = Math.min(-1, window.tpStats.streak - 1);
                            simLosses++;
                        }
                    }
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
            if (activePrediction && activePrediction.win === "WAIT") {
                activePrediction = getDynamicPrediction(window.tpLogs);
            }
            updateEngineUI();
        }
    }

    // 6B. LIVE ROUND PROCESSOR
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
            const currentData = JSON.parse(localStorage.getItem(LOGS_KEY)) || [];
            const alreadyLogged = currentData.some(log => String(log.mid) === mid);
            
            if (!alreadyLogged) {
                const winner = calculateWin(cardStr);

                // Live PNL update
                if (activePrediction && activePrediction.win !== "WAIT") {
                    if (winner === "TIE") {
                        window.tpStats.losses++; window.tpStats.units -= 1.0;
                        window.tpStats.streak = Math.min(-1, window.tpStats.streak - 1);
                        playSound(220, 'sawtooth');
                    } else if (activePrediction.win === winner) {
                        window.tpStats.wins++; window.tpStats.units += 0.98; 
                        window.tpStats.streak = Math.max(1, window.tpStats.streak + 1);
                        playSound(880, 'sine');
                    } else {
                        window.tpStats.losses++; window.tpStats.units -= 1.0;
                        window.tpStats.streak = Math.min(-1, window.tpStats.streak - 1);
                        playSound(220, 'sawtooth');
                    }
                }

                window.tpLogs.push({
                    mid: mid, winner: winner,
                    cards_A: `${cardsArray[0]},${cardsArray[2]},${cardsArray[4]}`,
                    cards_B: `${cardsArray[1]},${cardsArray[3]},${cardsArray[5]}`
                });

                saveData();
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

            for (let key in node) { traverse(node[key], depth + 1); }
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

    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const response = await originalFetch.apply(this, args);
        try { response.clone().text().then(text => parseAndRoute(text)).catch(e => {}); } catch(e) {}
        return response;
    };

    const originalXHR = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this.addEventListener('load', function() {
            try { parseAndRoute(this.responseText); } catch(e) {}
        });
        originalXHR.call(this, method, url, ...rest);
    };

    // 8. DOWNLOAD & IDLE CONTROL
    btn.onclick = (e) => {
        e.preventDefault();
        const currentLogs = JSON.parse(localStorage.getItem(LOGS_KEY)) || [];
        if (currentLogs.length === 0) return alert("No data yet!");
        const content = currentLogs.map(r => `${r.mid},${r.winner},${r.cards_A},${r.cards_B}`).join("\n");
        const blob = new Blob([content], { type: "text/plain" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `1day_teenpatti_dataset_${Date.now()}.csv`;
        link.click();
    };

    setInterval(() => {
        window.scrollBy(0, 10);
        setTimeout(() => window.scrollBy(0, -10), 1000);
        updateEngineUI(); 
    }, 5000);

    updateEngineUI();
    console.log("%c MASTER 1-DAY TP SUITE ONLINE | OMNI-SNIPER ADVISORY (NO AUTO-BET) ", "background:#000; color:#0f0; font-weight:bold; font-size:14px;");
})();

















// with order placement
(function() {
    // 0. PREVENT DUPLICATE UIs
    const existingUi = document.getElementById("tp-automation-ui");
    if (existingUi) existingUi.remove();

    // 1. DATA & STATS PERSISTENCE
    const LOGS_KEY = '1day_teenpatti_logs';
    const STATS_KEY = '1day_teenpatti_stats';
    
    window.tpLogs = JSON.parse(localStorage.getItem(LOGS_KEY)) || [];
    window.tpStats = JSON.parse(localStorage.getItem(STATS_KEY)) || { wins: 0, losses: 0, streak: 0, units: 0 };
    
    let activeMid = null;
    let activePrediction = null;

    const saveData = () => {
        localStorage.setItem(LOGS_KEY, JSON.stringify(window.tpLogs));
        localStorage.setItem(STATS_KEY, JSON.stringify(window.tpStats));
    };

    const playSound = (freq, type) => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = type; osc.frequency.setValueAtTime(freq, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(); osc.stop(ctx.currentTime + 0.5);
        } catch(e) {}
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
    container.style = "position:fixed;bottom:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:8px;font-family:monospace;width:250px;";
    document.body.appendChild(container);

    const btn = document.createElement("button");
    btn.id = "dl-btn";
    btn.innerHTML = `💾 DOWNLOAD LOG (${window.tpLogs.length})`;
    btn.style = "padding:12px;background:#ffd700;color:#000;border:2px solid #000;cursor:pointer;font-weight:bold;border-radius:4px;";
    container.appendChild(btn);

    const clearBtn = document.createElement("button");
    clearBtn.innerHTML = "🗑️ WIPE MEMORY & STATS";
    clearBtn.style = "padding:5px;background:#ff4444;color:#fff;border:none;cursor:pointer;font-size:10px;border-radius:4px;font-weight:bold;";
    clearBtn.onclick = () => { 
        if(confirm("Wipe all data and PNL?")) { 
            window.tpLogs = []; 
            window.tpStats = { wins: 0, losses: 0, streak: 0, units: 0 };
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

    // 3. OMNI-SNIPER LOGIC ENGINE (V6.0 Hybrid)
    
    // Core V3.0 Frequency Scanner extracted into a pure function
    function scanFrequencies(historyStr) {
        for (let d of [5, 4, 3, 2]) {
            const seq = historyStr.slice(-d);
            let a_count = 0, b_count = 0;
            for (let i = 0; i < historyStr.length - d; i++) {
                if (historyStr.substring(i, i + d) === seq) {
                    const nextResult = historyStr[i + d];
                    if (nextResult === 'A') a_count++;
                    if (nextResult === 'B') b_count++;
                }
            }
            const total = a_count + b_count;
            if (total >= 2) { 
                const a_prob = a_count / total;
                const b_prob = b_count / total;
                if (a_prob >= 0.66) return { target: "A", prob: a_prob, seq: seq, type: "FREQ" };
                if (b_prob >= 0.66) return { target: "B", prob: b_prob, seq: seq, type: "FREQ" };
            }
        }
        
        const last3 = historyStr.slice(-3);
        const last4 = historyStr.slice(-4);
        const lastWinner = historyStr.slice(-1);
        
        if (last4 === "ABAB" || last4 === "BABA") return { target: lastWinner === "A" ? "B" : "A", prob: 0, seq: last4, type: "CHOP" };
        if (last3 === "AAA" || last3 === "BBB") return { target: lastWinner, prob: 0, seq: last3, type: "STREAK" };
        
        return null;
    }

    // The Virtual Regime Scanner (Tests Follow vs Fade)
    function detectRegime(validHistory) {
        if(validHistory.length < 25) return { mode: "WARMUP", activeEngine: null, info: "COLLECTING DATA" };
        
        let alphaW = 0, alphaL = 0; // Alpha = Follow Sniper
        let betaW = 0, betaL = 0;   // Beta = Fade Sniper

        const testWindow = validHistory.slice(-25);
        for(let i = 5; i < testWindow.length; i++) {
            const histSliceIndex = validHistory.length - 25 + i;
            const histSlice = validHistory.slice(0, histSliceIndex).join('');
            const actualResult = testWindow[i];

            const signal = scanFrequencies(histSlice);
            if(signal) {
                // Alpha: Does following the Sniper work?
                if(signal.target === actualResult) alphaW++;
                else alphaL++;

                // Beta: Does fading the Sniper work?
                const fadeTarget = signal.target === "A" ? "B" : "A";
                if(fadeTarget === actualResult) betaW++;
                else betaL++;
            }
        }

        const alphaRate = (alphaW + alphaL) > 0 ? alphaW / (alphaW + alphaL) : 0;
        const betaRate = (betaW + betaL) > 0 ? betaW / (betaW + betaL) : 0;

        if(alphaRate >= 0.55 && alphaRate >= betaRate) {
            return { mode: "WEEKDAY (FOLLOW)", activeEngine: "ALPHA", info: `A-EDGE: ${Math.round(alphaRate*100)}%` };
        }
        if(betaRate >= 0.55 && betaRate > alphaRate) {
            return { mode: "WEEKEND (FADE)", activeEngine: "BETA", info: `B-EDGE: ${Math.round(betaRate*100)}%` };
        }
        
        return { mode: "CHAOS (NO EDGE)", activeEngine: null, info: `SIM: A${Math.round(alphaRate*100)}% B${Math.round(betaRate*100)}%` };
    }

    function getDynamicPrediction(data) {
        const validHistory = data.map(r => r.winner).filter(w => w === 'A' || w === 'B');
        const regime = detectRegime(validHistory);

        if(!regime.activeEngine) {
            return { win: "WAIT", reason: `${regime.mode} | ${regime.info}` };
        }

        const historyStr = validHistory.join('');
        const signal = scanFrequencies(historyStr);

        if(!signal) {
            return { win: "WAIT", reason: `${regime.mode} | NO CLEAR PATTERN` };
        }

        let prediction = signal.target;
        let reasonStr = signal.type === "FREQ" 
            ? `PROB [${signal.seq}] (${(signal.prob*100).toFixed(0)}%)` 
            : `STRICT [${signal.seq}]`;

        if(regime.activeEngine === "BETA") {
            prediction = prediction === "A" ? "B" : "A";
            reasonStr = `FADE ` + reasonStr;
        }

        return { win: prediction, reason: `${regime.mode} | ${reasonStr}` };
    }

    // 4. POKER EVALUATOR
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
        window.tpLogs = JSON.parse(localStorage.getItem(LOGS_KEY)) || [];
        window.tpStats = JSON.parse(localStorage.getItem(STATS_KEY)) || { wins: 0, losses: 0, streak: 0, units: 0 };
        
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
                <b style="color:#0ff;">1-DAY TP (V6.0 OMNI-SNIPER AUTO)</b>
                <span style="font-size:10px;color:#888;">${storage.percent}% DB</span>
            </div>
            <div style="text-align:center;margin-bottom:10px;">
                <span style="font-size:10px;color:#aaa;">PREDICTING MID: *${midStr}</span><br>
                <span style="font-size:24px;color:${activePrediction && activePrediction.win === 'WAIT' ? '#888' : (activePrediction && activePrediction.win === 'A' ? '#ff4444' : '#44aaff')};font-weight:bold;">
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
            <div style="text-align:center;font-size:10px;color:#666;margin-top:5px;">ROUNDS SECURED: ${data.length}</div>
        `;
    }

    // 5B. AUTO-BETTOR (TAILWIND UI)
    function executeWager() {
        let betslipAttempts = 0;
        const fillSlip = setInterval(() => {
            betslipAttempts++;
            if (betslipAttempts > 20) { 
                clearInterval(fillSlip);
                console.log(`%c [AUTO-BET] Timeout waiting for new betslip component to mount.`, "color:#f00;");
                return;
            }

            const stakeInput = document.querySelector('input[placeholder="Enter Stake"]');
            const submitContainer = document.querySelector('.p-4.bg-card.border-t');
            const submitBtn = submitContainer ? submitContainer.querySelector('button') : null;

            if (stakeInput && submitBtn && stakeInput.offsetParent !== null) {
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                nativeInputValueSetter.call(stakeInput, "50"); 
                
                stakeInput.dispatchEvent(new Event('input', { bubbles: true }));
                stakeInput.dispatchEvent(new Event('change', { bubbles: true }));

                setTimeout(() => {
                    const finalSubmitBtn = document.querySelector('.p-4.bg-card.border-t button');
                    if (finalSubmitBtn && !finalSubmitBtn.disabled) {
                        finalSubmitBtn.click();
                        console.log(`%c [AUTO-BET] SUCCESS! 50 Stake injected and placed.`, "color:#0f0;font-weight:bold;");
                    }
                }, 300);
                
                clearInterval(fillSlip);
            }
        }, 100);
    }

    function clickBet(predictedWinner) {
        if (predictedWinner !== "A" && predictedWinner !== "B") return;
        const targetName = "Player " + predictedWinner;
        let attempts = 0;

        console.log(`%c [AUTO-CLICK] Armed for ${targetName}. Scanning Tailwind UI...`, "color:#ffa500;");

        const tryClick = setInterval(() => {
            attempts++;
            if (attempts > 20) { 
                clearInterval(tryClick);
                console.log(`%c [AUTO-CLICK] Timeout. Odds for ${targetName} never opened.`, "color:#f00;");
                return;
            }

            const playerContainers = document.querySelectorAll('.bg-background.border-2.overflow-hidden');
            for (let container of playerContainers) {
                const headerEls = Array.from(container.querySelectorAll('*'));
                const isTargetPlayer = headerEls.some(el => el.innerText && el.innerText.trim() === targetName);
                
                if (isTargetPlayer) {
                    const rows = container.querySelectorAll('.border-b.border-neutral-300');
                    for (let row of rows) {
                        const rowEls = Array.from(row.querySelectorAll('*'));
                        const isMainRow = rowEls.some(el => el.innerText && el.innerText.trim() === 'Main');
                        
                        if (isMainRow) {
                            const activeBackBtn = row.querySelector('.bg-back');
                            if (activeBackBtn && !activeBackBtn.classList.contains('cursor-not-allowed')) {
                                clearInterval(tryClick); 
                                
                                const randomDelay = Math.floor(Math.random() * (5000 - 2000 + 1)) + 2000;
                                console.log(`%c [AUTO-CLICK] Hot odds detected! Waiting ${randomDelay}ms...`, "color:#0ff;");
                                
                                setTimeout(() => {
                                    const secureBtn = row.querySelector('.bg-back');
                                    if (secureBtn) {
                                        secureBtn.click();
                                        console.log(`%c [AUTO-CLICK] Clicked BACK for ${targetName}. Attempting bet...`, "color:#0f0;");
                                        executeWager();
                                    }
                                }, randomDelay);
                                return;
                            }
                        }
                    }
                }
            }
        }, 500);
    }

    // 6A. HISTORY PROCESSOR
    function processHistoryArray(historyArray) {
        if (!Array.isArray(historyArray) || historyArray.length === 0) return;
        const recentRounds = [...historyArray].reverse(); 
        let added = 0; let simWins = 0; let simLosses = 0;

        const currentData = JSON.parse(localStorage.getItem(LOGS_KEY)) || [];

        recentRounds.forEach(d => {
            if (!d || !d.mid || !d.win) return;
            const mid = String(d.mid);
            const winCode = String(d.win);

            const alreadyLogged = currentData.some(log => String(log.mid) === mid);
            if (!alreadyLogged) {
                let winner = "TIE";
                if (winCode === "1") winner = "A";
                if (winCode === "2") winner = "B";

                // Only log PNL stats if the bot has exited Warmup and actually placed a simulated bet
                if (window.tpLogs.length >= 25) {
                    const simPred = getDynamicPrediction(window.tpLogs);
                    if (simPred && simPred.win !== "WAIT") {
                        if (winner === "TIE") {
                            window.tpStats.losses++; window.tpStats.units -= 1.0;
                            window.tpStats.streak = Math.min(-1, window.tpStats.streak - 1);
                            simLosses++;
                        } else if (simPred.win === winner) {
                            window.tpStats.wins++; window.tpStats.units += 0.98; 
                            window.tpStats.streak = Math.max(1, window.tpStats.streak + 1);
                            simWins++;
                        } else {
                            window.tpStats.losses++; window.tpStats.units -= 1.0;
                            window.tpStats.streak = Math.min(-1, window.tpStats.streak - 1);
                            simLosses++;
                        }
                    }
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
            if (activePrediction && activePrediction.win === "WAIT") {
                activePrediction = getDynamicPrediction(window.tpLogs);
            }
            updateEngineUI();
        }
    }

    // 6B. LIVE ROUND PROCESSOR
    function processGameData(d) {
        if (!d || !d.mid || !d.card) return;
        const mid = String(d.mid);
        const cardStr = String(d.card);

        if (mid !== activeMid) {
            activeMid = mid;
            activePrediction = getDynamicPrediction(window.tpLogs);
            updateEngineUI(); 
            
            // ARM AUTO-CLICKER
            if (activePrediction && activePrediction.win !== "WAIT") {
                clickBet(activePrediction.win);
            }
        }

        const cardsArray = cardStr.split(',');
        if (cardsArray.length === 6 && !cardsArray.includes("1")) {
            const currentData = JSON.parse(localStorage.getItem(LOGS_KEY)) || [];
            const alreadyLogged = currentData.some(log => String(log.mid) === mid);
            
            if (!alreadyLogged) {
                const winner = calculateWin(cardStr);

                // Live PNL update
                if (activePrediction && activePrediction.win !== "WAIT") {
                    if (winner === "TIE") {
                        window.tpStats.losses++; window.tpStats.units -= 1.0;
                        window.tpStats.streak = Math.min(-1, window.tpStats.streak - 1);
                        playSound(220, 'sawtooth');
                    } else if (activePrediction.win === winner) {
                        window.tpStats.wins++; window.tpStats.units += 0.98; 
                        window.tpStats.streak = Math.max(1, window.tpStats.streak + 1);
                        playSound(880, 'sine');
                    } else {
                        window.tpStats.losses++; window.tpStats.units -= 1.0;
                        window.tpStats.streak = Math.min(-1, window.tpStats.streak - 1);
                        playSound(220, 'sawtooth');
                    }
                }

                window.tpLogs.push({
                    mid: mid, winner: winner,
                    cards_A: `${cardsArray[0]},${cardsArray[2]},${cardsArray[4]}`,
                    cards_B: `${cardsArray[1]},${cardsArray[3]},${cardsArray[5]}`
                });

                saveData();
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

            for (let key in node) { traverse(node[key], depth + 1); }
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

    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const response = await originalFetch.apply(this, args);
        try { response.clone().text().then(text => parseAndRoute(text)).catch(e => {}); } catch(e) {}
        return response;
    };

    const originalXHR = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this.addEventListener('load', function() {
            try { parseAndRoute(this.responseText); } catch(e) {}
        });
        originalXHR.call(this, method, url, ...rest);
    };

    // 8. DOWNLOAD & IDLE CONTROL
    btn.onclick = (e) => {
        e.preventDefault();
        const currentLogs = JSON.parse(localStorage.getItem(LOGS_KEY)) || [];
        if (currentLogs.length === 0) return alert("No data yet!");
        const content = currentLogs.map(r => `${r.mid},${r.winner},${r.cards_A},${r.cards_B}`).join("\n");
        const blob = new Blob([content], { type: "text/plain" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `1day_teenpatti_dataset_${Date.now()}.csv`;
        link.click();
    };

    setInterval(() => {
        window.scrollBy(0, 10);
        setTimeout(() => window.scrollBy(0, -10), 1000);
        updateEngineUI(); 
    }, 5000);

    updateEngineUI();
    console.log("%c MASTER 1-DAY TP SUITE ONLINE | V6.0 OMNI-SNIPER AUTO-BET ", "background:#000; color:#0f0; font-weight:bold; font-size:14px;");
})();