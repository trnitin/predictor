(function() {
    // 1. DATA & STATS PERSISTENCE
    const LOGS_KEY = 't10_2020tp_logs';
    const STATS_KEY = 't10_2020tp_stats';
    
    // Odds Configuration (Usually 1.98 for 20-20 TP, meaning +0.98 profit)
    const ODDS = {
        'A': 1.98,
        'B': 1.98
    };
    
    window.ttLogs = JSON.parse(localStorage.getItem(LOGS_KEY)) || [];
    window.ttStats = JSON.parse(localStorage.getItem(STATS_KEY)) || { wins: 0, losses: 0, lastPrediction: null, streak: 0, units: 0 };
    let lastLoggedRid = null;

    const saveData = () => {
        localStorage.setItem(LOGS_KEY, JSON.stringify(window.ttLogs));
        localStorage.setItem(STATS_KEY, JSON.stringify(window.ttStats));
    };

    // Audio Feedback
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
    container.id = "tt-automation-ui";
    container.style = "position:fixed;top:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:8px;font-family:monospace;width:250px;";
    document.body.appendChild(container);

    const btn = document.createElement("button");
    btn.innerHTML = `💾 DOWNLOAD LOG (${window.ttLogs.length})`;
    btn.style = "padding:12px;background:#ffd700;color:#000;border:2px solid #000;cursor:pointer;font-weight:bold;border-radius:4px;";
    container.appendChild(btn);

    const clearBtn = document.createElement("button");
    clearBtn.innerHTML = "🗑️ WIPE MEMORY & STATS";
    clearBtn.style = "padding:5px;background:#ff4444;color:#fff;border:none;cursor:pointer;font-size:10px;border-radius:4px;font-weight:bold;";
    clearBtn.onclick = () => { 
        if(confirm("Wipe all data and PNL?")) { 
            window.ttLogs = []; 
            window.ttStats = { wins: 0, losses: 0, lastPrediction: null, streak: 0, units: 0 };
            saveData(); 
            btn.innerHTML = `💾 DOWNLOAD LOG (0)`; 
            updateEngineUI();
        }
    };
    container.appendChild(clearBtn);

    const intelBox = document.createElement("div");
    intelBox.style = "background:#000;color:#00ff00;padding:15px;border-radius:8px;font-size:12px;border:2px solid #00ff00;box-shadow:0 0 15px rgba(0,255,0,0.3);line-height:1.6;user-select:none;";
    container.appendChild(intelBox);

    // 3. LOGIC ENGINE (A vs B)
    function getDynamicPrediction(data) {
        if (data.length < 5) return { win: "WAIT", reason: "COLLECTING" };

        const historyStr = data.map(r => r.winner).join('');
        const lastWinner = data[data.length - 1].winner;
        let pred = "";
        let reason = "";

        // PHASE A: PATTERN MATCHING
        let foundPattern = null;
        if (data.length > 20) {
            const lastSeq = historyStr.slice(-4);
            const firstOccur = historyStr.lastIndexOf(lastSeq, historyStr.length - 5);
            if (firstOccur !== -1) foundPattern = historyStr[firstOccur + 4];
        }

        // PHASE B: FALLBACK
        if (foundPattern && (foundPattern === 'A' || foundPattern === 'B')) {
            pred = foundPattern;
            reason = "DEEP PATTERN";
        } else {
            const last10 = data.slice(-10).map(r => r.winner);
            const aCount = last10.filter(x => x === "A").length;
            const bCount = last10.filter(x => x === "B").length;

            if (data.slice(-3).every(r => r.winner === lastWinner)) {
                pred = lastWinner;
                reason = "STREAKING";
            } else if (aCount >= 7) {
                pred = "A"; reason = "A BIAS";
            } else if (bCount >= 7) {
                pred = "B"; reason = "B BIAS";
            } else {
                pred = lastWinner === "A" ? "B" : "A";
                reason = "DYNAMIC CHOP";
            }
        }
        return { win: pred, reason: reason };
    }

    function updateEngineUI() {
        const data = window.ttLogs;
        if (data.length < 1) {
            intelBox.innerHTML = "WAITING FOR ROUND DATA...";
            return;
        }

        const pred = getDynamicPrediction(data);
        const total = window.ttStats.wins + window.ttStats.losses;
        const rate = total > 0 ? ((window.ttStats.wins / total) * 100).toFixed(1) : 0;
        const storage = getStorageStats();

        intelBox.style.borderColor = window.ttStats.streak >= 2 ? "#0f0" : (window.ttStats.streak <= -2 ? "#f00" : "#00ff00");
        intelBox.innerHTML = `
            <div style="display:flex;justify-content:space-between;border-bottom:1px solid #333;padding-bottom:5px;margin-bottom:8px;">
                <b style="color:#0ff;">20-20 TP ENGINE v1.0</b>
                <span style="font-size:10px;color:#888;">${storage.percent}% DB</span>
            </div>
            
            <div style="text-align:center;margin-bottom:10px;">
                <span style="font-size:10px;color:#aaa;">NEXT PREDICTION</span><br>
                <span style="font-size:24px;color:${pred.win === 'A' ? '#ff4444' : (pred.win === 'B' ? '#44aaff' : '#ffff00')};font-weight:bold;">
                    ${pred.win === "WAIT" ? "WAIT" : "PLAYER " + pred.win}
                </span><br>
                <span style="font-size:11px;color:#ffd700;">MODE: ${pred.reason}</span>
            </div>

            <div style="background:#111;padding:8px;border-radius:6px;border:1px solid #333;">
                <div style="display:flex;justify-content:space-between;font-size:11px;">
                    <span>W: ${window.ttStats.wins} | L: ${window.ttStats.losses}</span>
                    <span style="color:${rate > 50 ? '#0f0' : '#f00'};font-weight:bold;">${rate}%</span>
                </div>
                <div style="text-align:center;margin-top:5px;">
                    <span style="font-size:10px;color:#888;">ESTIMATED PNL</span><br>
                    <span style="font-size:18px;color:${window.ttStats.units >= 0 ? '#ffd700' : '#ff4444'};font-weight:bold;">${window.ttStats.units.toFixed(2)} U</span>
                </div>
            </div>
            <div style="text-align:center;font-size:10px;color:#666;margin-top:5px;">ROUNDS LOGGED: ${data.length}</div>
        `;
    }

    // 4. DATA PROCESSING & PNL CALCULATION
    function processIncomingDataArray(dataArray) {
        if (!dataArray || dataArray.length === 0) return;

        const recentRounds = [...dataArray].reverse();
        let newRoundsAdded = false;

        recentRounds.forEach((round, index) => {
            const alreadyExists = window.ttLogs.some(log => log.rid === round.roundId);
            
            if (!alreadyExists) {
                newRoundsAdded = true;
                const isLiveRound = index === recentRounds.length - 1;

                // Resolve prediction
                if (window.ttStats.lastPrediction && window.ttStats.lastPrediction.rid !== round.roundId && window.ttStats.lastPrediction.win !== "WAIT") {
                    
                    const isHit = window.ttStats.lastPrediction.win === round.winner;

                    if (isHit) {
                        const winningOdds = ODDS[round.winner] || 1.98;
                        const netProfit = winningOdds - 1.0; // Return minus Total Cost
                        
                        window.ttStats.wins++; 
                        window.ttStats.units += netProfit;
                        window.ttStats.streak = Math.max(1, window.ttStats.streak + 1);
                        if(isLiveRound) playSound(880, 'sine');
                    } else {
                        // Lost the 1 bet placed
                        window.ttStats.losses++; 
                        window.ttStats.units -= 1.0;
                        window.ttStats.streak = Math.min(-1, window.ttStats.streak - 1);
                        if(isLiveRound) playSound(220, 'sawtooth');
                    }
                }

                // Safely extract the 3 cards
                const getCards = (playerObj) => playerObj ? Object.values(playerObj).join('|') : '';

                // Save Data
                lastLoggedRid = round.roundId;
                window.ttLogs.push({ 
                    rid: round.roundId, 
                    winner: round.winner,
                    cards_A: getCards(round.cards.PLAYER_A),
                    cards_B: getCards(round.cards.PLAYER_B)
                });

                // Generate new Single Prediction
                const nextPred = getDynamicPrediction(window.ttLogs);
                window.ttStats.lastPrediction = { rid: round.roundId, win: nextPred.win };

                if (isLiveRound) {
                    console.log(`%c [LIVE ROUND SAVED] RID: ${round.roundId} | WIN: ${round.winner} `, "color:#0f0;font-weight:bold;");
                }
            }
        });

        if (newRoundsAdded) {
            saveData();
            btn.innerHTML = `💾 DOWNLOAD LOG (${window.ttLogs.length})`;
            updateEngineUI();
        }
    }

    // 5. DOWNLOAD ACTION
    btn.onclick = (e) => {
        e.preventDefault();
        if (window.ttLogs.length === 0) return alert("No data yet!");
        const content = window.ttLogs.map(r => `${r.rid},${r.winner},${r.cards_A},${r.cards_B}`).join("\n");
        const blob = new Blob([content], { type: "text/plain" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `t10_2020teenpatti_dataset_${Date.now()}.csv`;
        link.click();
    };

    // 6. NETWORK INTERCEPTOR
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const response = await originalFetch.apply(this, args);
        try {
            const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : '');
            if (url.includes('casinoEventResults')) {
                response.clone().json().then(data => {
                    if (data && data.data && data.data.length > 0) processIncomingDataArray(data.data);
                }).catch(e => {});
            }
        } catch(e) {}
        return response;
    };

    const originalXHR = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this.addEventListener('load', function() {
            if (typeof url === 'string' && url.includes('casinoEventResults')) {
                try {
                    const data = JSON.parse(this.responseText);
                    if (data && data.data && data.data.length > 0) processIncomingDataArray(data.data);
                } catch(e) {}
            }
        });
        originalXHR.call(this, method, url, ...rest);
    };

    // 7. ANTI-IDLE
    setInterval(() => {
        window.scrollBy(0, 10);
        setTimeout(() => window.scrollBy(0, -10), 1000);
    }, 15000);

    // Init Check
    if (window.ttLogs.length > 0) {
        lastLoggedRid = window.ttLogs[window.ttLogs.length - 1].rid;
    }
    updateEngineUI();
    console.log("%c 20-20 TEEN PATTI SUITE ONLINE ", "background:#000; color:#0f0; font-weight:bold; font-size:14px;");
})();