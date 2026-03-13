// 2cards selection
// (function() {
//     // 1. DATA & STATS PERSISTENCE
//     const LOGS_KEY = 't10_32cards_logs';
//     const STATS_KEY = 't10_32cards_stats';
    
//     window.tcLogs = JSON.parse(localStorage.getItem(LOGS_KEY)) || [];
//     window.tcStats = JSON.parse(localStorage.getItem(STATS_KEY)) || { wins: 0, losses: 0, lastPrediction: null, streak: 0, units: 0 };
//     let lastLoggedRid = null;

//     const saveData = () => {
//         localStorage.setItem(LOGS_KEY, JSON.stringify(window.tcLogs));
//         localStorage.setItem(STATS_KEY, JSON.stringify(window.tcStats));
//     };

//     // Audio Feedback
//     const playSound = (freq, type) => {
//         try {
//             const ctx = new (window.AudioContext || window.webkitAudioContext)();
//             const osc = ctx.createOscillator();
//             const gain = ctx.createGain();
//             osc.type = type; osc.frequency.setValueAtTime(freq, ctx.currentTime);
//             gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
//             osc.connect(gain); gain.connect(ctx.destination);
//             osc.start(); osc.stop(ctx.currentTime + 0.5);
//         } catch(e) {}
//     };

//     const getStorageStats = () => {
//         let total = 0;
//         for (let x in localStorage) { if (localStorage.hasOwnProperty(x)) total += ((localStorage[x].length + x.length) * 2); }
//         const usedKB = (total / 1024).toFixed(2);
//         return { usedKB, percent: ((usedKB / 5120) * 100).toFixed(2) };
//     };

//     // 2. UI SETUP
//     const container = document.createElement("div");
//     container.id = "tc-automation-ui";
//     container.style = "position:fixed;top:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:8px;font-family:monospace;width:250px;";
//     document.body.appendChild(container);

//     const btn = document.createElement("button");
//     btn.innerHTML = `💾 DOWNLOAD LOG (${window.tcLogs.length})`;
//     btn.style = "padding:12px;background:#ffd700;color:#000;border:2px solid #000;cursor:pointer;font-weight:bold;border-radius:4px;";
//     container.appendChild(btn);

//     const clearBtn = document.createElement("button");
//     clearBtn.innerHTML = "🗑️ WIPE MEMORY & STATS";
//     clearBtn.style = "padding:5px;background:#ff4444;color:#fff;border:none;cursor:pointer;font-size:10px;border-radius:4px;font-weight:bold;";
//     clearBtn.onclick = () => { 
//         if(confirm("Wipe all data and PNL?")) { 
//             window.tcLogs = []; 
//             window.tcStats = { wins: 0, losses: 0, lastPrediction: null, streak: 0, units: 0 };
//             saveData(); 
//             btn.innerHTML = `💾 DOWNLOAD LOG (0)`; 
//             updateEngineUI();
//         }
//     };
//     container.appendChild(clearBtn);

//     const intelBox = document.createElement("div");
//     intelBox.style = "background:#000;color:#00ff00;padding:15px;border-radius:8px;font-size:12px;border:2px solid #00ff00;box-shadow:0 0 15px rgba(0,255,0,0.3);line-height:1.6;user-select:none;";
//     container.appendChild(intelBox);

//     // 3. LOGIC ENGINE (TOP 2 PREDICTION)
//     function getDynamicPrediction(data) {
//         if (data.length < 5) return { win: ["WAIT", "WAIT"], reason: "COLLECTING", shortWin: "WAIT" };

//         // Analyze the last 15 rounds
//         const last15 = data.slice(-15).map(r => r.winner.replace('PLAYER_', ''));
//         const counts = { '8': 0, '9': 0, '10': 0, '11': 0 };

//         last15.forEach(w => counts[w]++);

//         // Sort players by frequency descending. If tied, prioritize the one that hit most recently.
//         const sortedPlayers = Object.keys(counts).sort((a, b) => {
//             if (counts[b] !== counts[a]) return counts[b] - counts[a];
//             return last15.lastIndexOf(b) - last15.lastIndexOf(a);
//         });

//         const pred1 = sortedPlayers[0];
//         const pred2 = sortedPlayers[1];

//         return { 
//             win: [`PLAYER_${pred1}`, `PLAYER_${pred2}`], 
//             reason: "TREND & FREQUENCY", 
//             shortWin: `${pred1} & ${pred2}` 
//         };
//     }

//     function updateEngineUI() {
//         const data = window.tcLogs;
//         if (data.length < 1) {
//             intelBox.innerHTML = "WAITING FOR ROUND DATA...";
//             return;
//         }

//         const pred = getDynamicPrediction(data);
//         const total = window.tcStats.wins + window.tcStats.losses;
//         const rate = total > 0 ? ((window.tcStats.wins / total) * 100).toFixed(1) : 0;
//         const storage = getStorageStats();

//         intelBox.style.borderColor = window.tcStats.streak >= 2 ? "#0f0" : (window.tcStats.streak <= -2 ? "#f00" : "#00ff00");
//         intelBox.innerHTML = `
//             <div style="display:flex;justify-content:space-between;border-bottom:1px solid #333;padding-bottom:5px;margin-bottom:8px;">
//                 <b style="color:#0ff;">32C DUAL-ENGINE v2</b>
//                 <span style="font-size:10px;color:#888;">${storage.percent}% DB</span>
//             </div>
            
//             <div style="text-align:center;margin-bottom:10px;">
//                 <span style="font-size:10px;color:#aaa;">TOP 2 PREDICTIONS</span><br>
//                 <span style="font-size:22px;color:${pred.shortWin === 'WAIT' ? '#ffff00' : '#00ffcc'};font-weight:bold;">
//                     ${pred.shortWin === "WAIT" ? "WAIT" : "P" + pred.shortWin.replace(' & ', ' & P')}
//                 </span><br>
//                 <span style="font-size:11px;color:#ffd700;">MODE: ${pred.reason}</span>
//             </div>

//             <div style="background:#111;padding:8px;border-radius:6px;border:1px solid #333;">
//                 <div style="display:flex;justify-content:space-between;font-size:11px;">
//                     <span>HITS: ${window.tcStats.wins} | MISS: ${window.tcStats.losses}</span>
//                     <span style="color:${rate > 50 ? '#0f0' : '#f00'};font-weight:bold;">${rate}%</span>
//                 </div>
//             </div>
//             <div style="text-align:center;font-size:10px;color:#666;margin-top:5px;">ROUNDS LOGGED: ${data.length}</div>
//         `;
//     }

//     // 4. DATA PROCESSING (ARRAY BACKFILL)
//     function processIncomingDataArray(dataArray) {
//         if (!dataArray || dataArray.length === 0) return;

//         const recentRounds = [...dataArray].reverse();
//         let newRoundsAdded = false;

//         recentRounds.forEach((round, index) => {
//             const alreadyExists = window.tcLogs.some(log => log.rid === round.roundId);
            
//             if (!alreadyExists) {
//                 newRoundsAdded = true;
//                 const isLiveRound = index === recentRounds.length - 1; // True if it's the newest round in the array

//                 // Resolve prediction (Check if the actual winner is IN our array of 2 predictions)
//                 if (window.tcStats.lastPrediction && window.tcStats.lastPrediction.rid !== round.roundId && window.tcStats.lastPrediction.win[0] !== "WAIT") {
                    
//                     // Handle backward compatibility in case old prediction was a string instead of an array
//                     const prevPred = window.tcStats.lastPrediction.win;
//                     const isHit = Array.isArray(prevPred) ? prevPred.includes(round.winner) : prevPred === round.winner;

//                     if (isHit) {
//                         window.tcStats.wins++; 
//                         window.tcStats.streak = Math.max(1, window.tcStats.streak + 1);
//                         if(isLiveRound) playSound(880, 'sine');
//                     } else {
//                         window.tcStats.losses++; 
//                         window.tcStats.streak = Math.min(-1, window.tcStats.streak - 1);
//                         if(isLiveRound) playSound(220, 'sawtooth');
//                     }
//                 }

//                 // Extract cards
//                 const getCards = (playerKey) => round.cards && round.cards[playerKey] ? round.cards[playerKey].join('|') : '';

//                 // Save Data
//                 lastLoggedRid = round.roundId;
//                 window.tcLogs.push({ 
//                     rid: round.roundId, 
//                     winner: round.winner,
//                     cards_8: getCards("PLAYER_8"),
//                     cards_9: getCards("PLAYER_9"),
//                     cards_10: getCards("PLAYER_10"),
//                     cards_11: getCards("PLAYER_11")
//                 });

//                 // Generate new Dual Prediction
//                 const nextPred = getDynamicPrediction(window.tcLogs);
//                 window.tcStats.lastPrediction = { rid: round.roundId, win: nextPred.win };

//                 // Only console log the absolute latest live round to prevent spam on reload
//                 if (isLiveRound) {
//                     console.log(`%c [LIVE ROUND SAVED] RID: ${round.roundId} | WIN: ${round.winner} `, "color:#0f0;font-weight:bold;");
//                 }
//             }
//         });

//         if (newRoundsAdded) {
//             saveData();
//             btn.innerHTML = `💾 DOWNLOAD LOG (${window.tcLogs.length})`;
//             updateEngineUI();
//         }
//     }

//     // 5. DOWNLOAD ACTION
//     btn.onclick = (e) => {
//         e.preventDefault();
//         if (window.tcLogs.length === 0) return alert("No data yet!");
//         const content = window.tcLogs.map(r => `${r.rid},${r.winner},${r.cards_8},${r.cards_9},${r.cards_10},${r.cards_11}`).join("\n");
//         const blob = new Blob([content], { type: "text/plain" });
//         const link = document.createElement("a");
//         link.href = URL.createObjectURL(blob);
//         link.download = `t10_32cards_dataset_${Date.now()}.csv`;
//         link.click();
//     };

//     // 6. NETWORK INTERCEPTOR
//     const originalFetch = window.fetch;
//     window.fetch = async function(...args) {
//         const response = await originalFetch.apply(this, args);
//         try {
//             const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : '');
//             if (url.includes('casinoEventResults')) {
//                 response.clone().json().then(data => {
//                     if (data && data.data && data.data.length > 0) processIncomingDataArray(data.data);
//                 }).catch(e => {});
//             }
//         } catch(e) {}
//         return response;
//     };

//     const originalXHR = window.XMLHttpRequest.prototype.open;
//     window.XMLHttpRequest.prototype.open = function(method, url, ...rest) {
//         this.addEventListener('load', function() {
//             if (typeof url === 'string' && url.includes('casinoEventResults')) {
//                 try {
//                     const data = JSON.parse(this.responseText);
//                     if (data && data.data && data.data.length > 0) processIncomingDataArray(data.data);
//                 } catch(e) {}
//             }
//         });
//         originalXHR.call(this, method, url, ...rest);
//     };

//     // 7. ANTI-IDLE
//     setInterval(() => {
//         window.scrollBy(0, 10);
//         setTimeout(() => window.scrollBy(0, -10), 1000);
//     }, 15000);

//     // Init Check
//     if (window.tcLogs.length > 0) {
//         lastLoggedRid = window.tcLogs[window.tcLogs.length - 1].rid;
//     }
//     updateEngineUI();
//     console.log("%c 32 CARDS DUAL-SUITE ONLINE ", "background:#000; color:#0f0; font-weight:bold; font-size:14px;");
// })();




// 2 cards with units
(function() {
    // 1. DATA & STATS PERSISTENCE
    const LOGS_KEY = 't10_32cards_logs';
    const STATS_KEY = 't10_32cards_stats';
    
    // Odds Dictionary
    const ODDS = {
        'PLAYER_8': 12.00,
        'PLAYER_9': 5.85,
        'PLAYER_10': 3.15,
        'PLAYER_11': 2.06
    };
    
    window.tcLogs = JSON.parse(localStorage.getItem(LOGS_KEY)) || [];
    window.tcStats = JSON.parse(localStorage.getItem(STATS_KEY)) || { wins: 0, losses: 0, lastPrediction: null, streak: 0, units: 0 };
    let lastLoggedRid = null;

    const saveData = () => {
        localStorage.setItem(LOGS_KEY, JSON.stringify(window.tcLogs));
        localStorage.setItem(STATS_KEY, JSON.stringify(window.tcStats));
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
    container.id = "tc-automation-ui";
    container.style = "position:fixed;top:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:8px;font-family:monospace;width:250px;";
    document.body.appendChild(container);

    const btn = document.createElement("button");
    btn.innerHTML = `💾 DOWNLOAD LOG (${window.tcLogs.length})`;
    btn.style = "padding:12px;background:#ffd700;color:#000;border:2px solid #000;cursor:pointer;font-weight:bold;border-radius:4px;";
    container.appendChild(btn);

    const clearBtn = document.createElement("button");
    clearBtn.innerHTML = "🗑️ WIPE MEMORY & STATS";
    clearBtn.style = "padding:5px;background:#ff4444;color:#fff;border:none;cursor:pointer;font-size:10px;border-radius:4px;font-weight:bold;";
    clearBtn.onclick = () => { 
        if(confirm("Wipe all data and PNL?")) { 
            window.tcLogs = []; 
            window.tcStats = { wins: 0, losses: 0, lastPrediction: null, streak: 0, units: 0 };
            saveData(); 
            btn.innerHTML = `💾 DOWNLOAD LOG (0)`; 
            updateEngineUI();
        }
    };
    container.appendChild(clearBtn);

    const intelBox = document.createElement("div");
    intelBox.style = "background:#000;color:#00ff00;padding:15px;border-radius:8px;font-size:12px;border:2px solid #00ff00;box-shadow:0 0 15px rgba(0,255,0,0.3);line-height:1.6;user-select:none;";
    container.appendChild(intelBox);

    // 3. LOGIC ENGINE (TOP 2 PREDICTION)
    function getDynamicPrediction(data) {
        if (data.length < 5) return { win: ["WAIT", "WAIT"], reason: "COLLECTING", shortWin: "WAIT" };

        const last15 = data.slice(-15).map(r => r.winner.replace('PLAYER_', ''));
        const counts = { '8': 0, '9': 0, '10': 0, '11': 0 };

        last15.forEach(w => counts[w]++);

        const sortedPlayers = Object.keys(counts).sort((a, b) => {
            if (counts[b] !== counts[a]) return counts[b] - counts[a];
            return last15.lastIndexOf(b) - last15.lastIndexOf(a);
        });

        const pred1 = sortedPlayers[0];
        const pred2 = sortedPlayers[1];

        return { 
            win: [`PLAYER_${pred1}`, `PLAYER_${pred2}`], 
            reason: "TREND & FREQUENCY", 
            shortWin: `${pred1} & ${pred2}` 
        };
    }

    function updateEngineUI() {
        const data = window.tcLogs;
        if (data.length < 1) {
            intelBox.innerHTML = "WAITING FOR ROUND DATA...";
            return;
        }

        const pred = getDynamicPrediction(data);
        const total = window.tcStats.wins + window.tcStats.losses;
        const rate = total > 0 ? ((window.tcStats.wins / total) * 100).toFixed(1) : 0;
        const storage = getStorageStats();

        intelBox.style.borderColor = window.tcStats.streak >= 2 ? "#0f0" : (window.tcStats.streak <= -2 ? "#f00" : "#00ff00");
        intelBox.innerHTML = `
            <div style="display:flex;justify-content:space-between;border-bottom:1px solid #333;padding-bottom:5px;margin-bottom:8px;">
                <b style="color:#0ff;">32C DUAL-ENGINE v2.1</b>
                <span style="font-size:10px;color:#888;">${storage.percent}% DB</span>
            </div>
            
            <div style="text-align:center;margin-bottom:10px;">
                <span style="font-size:10px;color:#aaa;">TOP 2 PREDICTIONS</span><br>
                <span style="font-size:22px;color:${pred.shortWin === 'WAIT' ? '#ffff00' : '#00ffcc'};font-weight:bold;">
                    ${pred.shortWin === "WAIT" ? "WAIT" : "P" + pred.shortWin.replace(' & ', ' & P')}
                </span><br>
                <span style="font-size:11px;color:#ffd700;">MODE: ${pred.reason}</span>
            </div>

            <div style="background:#111;padding:8px;border-radius:6px;border:1px solid #333;">
                <div style="display:flex;justify-content:space-between;font-size:11px;">
                    <span>HITS: ${window.tcStats.wins} | MISS: ${window.tcStats.losses}</span>
                    <span style="color:${rate > 50 ? '#0f0' : '#f00'};font-weight:bold;">${rate}%</span>
                </div>
                <div style="text-align:center;margin-top:5px;">
                    <span style="font-size:10px;color:#888;">ESTIMATED PNL</span><br>
                    <span style="font-size:18px;color:${window.tcStats.units >= 0 ? '#ffd700' : '#ff4444'};font-weight:bold;">${window.tcStats.units.toFixed(2)} U</span>
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
            const alreadyExists = window.tcLogs.some(log => log.rid === round.roundId);
            
            if (!alreadyExists) {
                newRoundsAdded = true;
                const isLiveRound = index === recentRounds.length - 1;

                // Resolve prediction
                if (window.tcStats.lastPrediction && window.tcStats.lastPrediction.rid !== round.roundId && window.tcStats.lastPrediction.win[0] !== "WAIT") {
                    
                    // Normalize prediction to array to count bets
                    const prevPreds = Array.isArray(window.tcStats.lastPrediction.win) ? window.tcStats.lastPrediction.win : [window.tcStats.lastPrediction.win];
                    const numBets = prevPreds.length; // Cost of bets (1 unit per predicted player)
                    const isHit = prevPreds.includes(round.winner);

                    if (isHit) {
                        const winningOdds = ODDS[round.winner] || 1.0;
                        const netProfit = winningOdds - numBets; // Return minus Total Cost
                        
                        window.tcStats.wins++; 
                        window.tcStats.units += netProfit;
                        window.tcStats.streak = Math.max(1, window.tcStats.streak + 1);
                        if(isLiveRound) playSound(880, 'sine');
                    } else {
                        // Lost all bets placed
                        window.tcStats.losses++; 
                        window.tcStats.units -= numBets;
                        window.tcStats.streak = Math.min(-1, window.tcStats.streak - 1);
                        if(isLiveRound) playSound(220, 'sawtooth');
                    }
                }

                // Extract cards
                const getCards = (playerKey) => round.cards && round.cards[playerKey] ? round.cards[playerKey].join('|') : '';

                // Save Data
                lastLoggedRid = round.roundId;
                window.tcLogs.push({ 
                    rid: round.roundId, 
                    winner: round.winner,
                    cards_8: getCards("PLAYER_8"),
                    cards_9: getCards("PLAYER_9"),
                    cards_10: getCards("PLAYER_10"),
                    cards_11: getCards("PLAYER_11")
                });

                // Generate new Dual Prediction
                const nextPred = getDynamicPrediction(window.tcLogs);
                window.tcStats.lastPrediction = { rid: round.roundId, win: nextPred.win };

                if (isLiveRound) {
                    console.log(`%c [LIVE ROUND SAVED] RID: ${round.roundId} | WIN: ${round.winner} `, "color:#0f0;font-weight:bold;");
                }
            }
        });

        if (newRoundsAdded) {
            saveData();
            btn.innerHTML = `💾 DOWNLOAD LOG (${window.tcLogs.length})`;
            updateEngineUI();
        }
    }

    // 5. DOWNLOAD ACTION
    btn.onclick = (e) => {
        e.preventDefault();
        if (window.tcLogs.length === 0) return alert("No data yet!");
        const content = window.tcLogs.map(r => `${r.rid},${r.winner},${r.cards_8},${r.cards_9},${r.cards_10},${r.cards_11}`).join("\n");
        const blob = new Blob([content], { type: "text/plain" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `t10_32cards_dataset_${Date.now()}.csv`;
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
    if (window.tcLogs.length > 0) {
        lastLoggedRid = window.tcLogs[window.tcLogs.length - 1].rid;
    }
    updateEngineUI();
    console.log("%c 32 CARDS DUAL-SUITE v2.1 ONLINE ", "background:#000; color:#0f0; font-weight:bold; font-size:14px;");
})();




// single bet

(function() {
    // 1. DATA & STATS PERSISTENCE
    const LOGS_KEY = 't10_32cards_logs';
    const STATS_KEY = 't10_32cards_stats';
    
    // Odds Dictionary
    const ODDS = {
        'PLAYER_8': 12.00,
        'PLAYER_9': 5.85,
        'PLAYER_10': 3.15,
        'PLAYER_11': 2.06
    };
    
    window.tcLogs = JSON.parse(localStorage.getItem(LOGS_KEY)) || [];
    window.tcStats = JSON.parse(localStorage.getItem(STATS_KEY)) || { wins: 0, losses: 0, lastPrediction: null, streak: 0, units: 0 };
    let lastLoggedRid = null;

    const saveData = () => {
        localStorage.setItem(LOGS_KEY, JSON.stringify(window.tcLogs));
        localStorage.setItem(STATS_KEY, JSON.stringify(window.tcStats));
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
    container.id = "tc-automation-ui";
    container.style = "position:fixed;top:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:8px;font-family:monospace;width:250px;";
    document.body.appendChild(container);

    const btn = document.createElement("button");
    btn.innerHTML = `💾 DOWNLOAD LOG (${window.tcLogs.length})`;
    btn.style = "padding:12px;background:#ffd700;color:#000;border:2px solid #000;cursor:pointer;font-weight:bold;border-radius:4px;";
    container.appendChild(btn);

    const clearBtn = document.createElement("button");
    clearBtn.innerHTML = "🗑️ WIPE MEMORY & STATS";
    clearBtn.style = "padding:5px;background:#ff4444;color:#fff;border:none;cursor:pointer;font-size:10px;border-radius:4px;font-weight:bold;";
    clearBtn.onclick = () => { 
        if(confirm("Wipe all data and PNL?")) { 
            window.tcLogs = []; 
            window.tcStats = { wins: 0, losses: 0, lastPrediction: null, streak: 0, units: 0 };
            saveData(); 
            btn.innerHTML = `💾 DOWNLOAD LOG (0)`; 
            updateEngineUI();
        }
    };
    container.appendChild(clearBtn);

    const intelBox = document.createElement("div");
    intelBox.style = "background:#000;color:#00ff00;padding:15px;border-radius:8px;font-size:12px;border:2px solid #00ff00;box-shadow:0 0 15px rgba(0,255,0,0.3);line-height:1.6;user-select:none;";
    container.appendChild(intelBox);

    // 3. LOGIC ENGINE (SINGLE PREDICTION)
    function getDynamicPrediction(data) {
        if (data.length < 5) return { win: "WAIT", reason: "COLLECTING", shortWin: "WAIT" };

        const last15 = data.slice(-15).map(r => r.winner.replace('PLAYER_', ''));
        const counts = { '8': 0, '9': 0, '10': 0, '11': 0 };

        last15.forEach(w => counts[w]++);

        // Sort by frequency descending. If tied, prioritize the one that hit most recently.
        const sortedPlayers = Object.keys(counts).sort((a, b) => {
            if (counts[b] !== counts[a]) return counts[b] - counts[a];
            return last15.lastIndexOf(b) - last15.lastIndexOf(a);
        });

        // Pick only the absolute top probable player
        const pred1 = sortedPlayers[0];

        return { 
            win: `PLAYER_${pred1}`, 
            reason: "TREND & FREQUENCY", 
            shortWin: pred1 
        };
    }

    function updateEngineUI() {
        const data = window.tcLogs;
        if (data.length < 1) {
            intelBox.innerHTML = "WAITING FOR ROUND DATA...";
            return;
        }

        const pred = getDynamicPrediction(data);
        const total = window.tcStats.wins + window.tcStats.losses;
        const rate = total > 0 ? ((window.tcStats.wins / total) * 100).toFixed(1) : 0;
        const storage = getStorageStats();

        intelBox.style.borderColor = window.tcStats.streak >= 2 ? "#0f0" : (window.tcStats.streak <= -2 ? "#f00" : "#00ff00");
        intelBox.innerHTML = `
            <div style="display:flex;justify-content:space-between;border-bottom:1px solid #333;padding-bottom:5px;margin-bottom:8px;">
                <b style="color:#0ff;">32C SINGLE-ENGINE v3.0</b>
                <span style="font-size:10px;color:#888;">${storage.percent}% DB</span>
            </div>
            
            <div style="text-align:center;margin-bottom:10px;">
                <span style="font-size:10px;color:#aaa;">NEXT PREDICTION</span><br>
                <span style="font-size:24px;color:${pred.shortWin === 'WAIT' ? '#ffff00' : '#00ffcc'};font-weight:bold;">
                    ${pred.shortWin === "WAIT" ? "WAIT" : "PLAYER " + pred.shortWin}
                </span><br>
                <span style="font-size:11px;color:#ffd700;">MODE: ${pred.reason}</span>
            </div>

            <div style="background:#111;padding:8px;border-radius:6px;border:1px solid #333;">
                <div style="display:flex;justify-content:space-between;font-size:11px;">
                    <span>W: ${window.tcStats.wins} | L: ${window.tcStats.losses}</span>
                    <span style="color:${rate > 25 ? '#0f0' : '#f00'};font-weight:bold;">${rate}%</span>
                </div>
                <div style="text-align:center;margin-top:5px;">
                    <span style="font-size:10px;color:#888;">ESTIMATED PNL</span><br>
                    <span style="font-size:18px;color:${window.tcStats.units >= 0 ? '#ffd700' : '#ff4444'};font-weight:bold;">${window.tcStats.units.toFixed(2)} U</span>
                </div>
            </div>
            <div style="text-align:center;font-size:10px;color:#666;margin-top:5px;">ROUNDS LOGGED: ${data.length}</div>
        `;
    }

    // 4. DATA PROCESSING & PNL CALCULATION (SINGLE BET)
    function processIncomingDataArray(dataArray) {
        if (!dataArray || dataArray.length === 0) return;

        const recentRounds = [...dataArray].reverse();
        let newRoundsAdded = false;

        recentRounds.forEach((round, index) => {
            const alreadyExists = window.tcLogs.some(log => log.rid === round.roundId);
            
            if (!alreadyExists) {
                newRoundsAdded = true;
                const isLiveRound = index === recentRounds.length - 1;

                // Resolve prediction
                if (window.tcStats.lastPrediction && window.tcStats.lastPrediction.rid !== round.roundId && window.tcStats.lastPrediction.win !== "WAIT") {
                    
                    const isHit = window.tcStats.lastPrediction.win === round.winner;
                    const numBets = 1; // Exactly 1 unit staked

                    if (isHit) {
                        const winningOdds = ODDS[round.winner] || 1.0;
                        const netProfit = winningOdds - numBets; // e.g. 2.06 - 1.0 = +1.06
                        
                        window.tcStats.wins++; 
                        window.tcStats.units += netProfit;
                        window.tcStats.streak = Math.max(1, window.tcStats.streak + 1);
                        if(isLiveRound) playSound(880, 'sine');
                    } else {
                        // Lost the 1 bet placed
                        window.tcStats.losses++; 
                        window.tcStats.units -= numBets;
                        window.tcStats.streak = Math.min(-1, window.tcStats.streak - 1);
                        if(isLiveRound) playSound(220, 'sawtooth');
                    }
                }

                // Extract cards
                const getCards = (playerKey) => round.cards && round.cards[playerKey] ? round.cards[playerKey].join('|') : '';

                // Save Data
                lastLoggedRid = round.roundId;
                window.tcLogs.push({ 
                    rid: round.roundId, 
                    winner: round.winner,
                    cards_8: getCards("PLAYER_8"),
                    cards_9: getCards("PLAYER_9"),
                    cards_10: getCards("PLAYER_10"),
                    cards_11: getCards("PLAYER_11")
                });

                // Generate new Single Prediction
                const nextPred = getDynamicPrediction(window.tcLogs);
                window.tcStats.lastPrediction = { rid: round.roundId, win: nextPred.win };

                if (isLiveRound) {
                    console.log(`%c [LIVE ROUND SAVED] RID: ${round.roundId} | WIN: ${round.winner} `, "color:#0f0;font-weight:bold;");
                }
            }
        });

        if (newRoundsAdded) {
            saveData();
            btn.innerHTML = `💾 DOWNLOAD LOG (${window.tcLogs.length})`;
            updateEngineUI();
        }
    }

    // 5. DOWNLOAD ACTION
    btn.onclick = (e) => {
        e.preventDefault();
        if (window.tcLogs.length === 0) return alert("No data yet!");
        const content = window.tcLogs.map(r => `${r.rid},${r.winner},${r.cards_8},${r.cards_9},${r.cards_10},${r.cards_11}`).join("\n");
        const blob = new Blob([content], { type: "text/plain" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `t10_32cards_dataset_${Date.now()}.csv`;
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
    if (window.tcLogs.length > 0) {
        lastLoggedRid = window.tcLogs[window.tcLogs.length - 1].rid;
    }
    updateEngineUI();
    console.log("%c 32 CARDS SINGLE-SUITE v3.0 ONLINE ", "background:#000; color:#0f0; font-weight:bold; font-size:14px;");
})();






// with updated logic instead of only last 15
(function() {
    // 1. DATA & STATS PERSISTENCE
    const LOGS_KEY = 't10_32cards_logs';
    const STATS_KEY = 't10_32cards_stats';
    
    const ODDS = {
        'PLAYER_8': 12.00,
        'PLAYER_9': 5.85,
        'PLAYER_10': 3.15,
        'PLAYER_11': 2.06
    };
    
    window.tcLogs = JSON.parse(localStorage.getItem(LOGS_KEY)) || [];
    window.tcStats = JSON.parse(localStorage.getItem(STATS_KEY)) || { wins: 0, losses: 0, lastPrediction: null, streak: 0, units: 0 };
    let lastLoggedRid = null;

    const saveData = () => {
        localStorage.setItem(LOGS_KEY, JSON.stringify(window.tcLogs));
        localStorage.setItem(STATS_KEY, JSON.stringify(window.tcStats));
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
    container.id = "tc-automation-ui";
    container.style = "position:fixed;top:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:8px;font-family:monospace;width:250px;";
    document.body.appendChild(container);

    const btn = document.createElement("button");
    btn.innerHTML = `💾 DOWNLOAD LOG (${window.tcLogs.length})`;
    btn.style = "padding:12px;background:#ffd700;color:#000;border:2px solid #000;cursor:pointer;font-weight:bold;border-radius:4px;";
    container.appendChild(btn);

    const clearBtn = document.createElement("button");
    clearBtn.innerHTML = "🗑️ WIPE MEMORY & STATS";
    clearBtn.style = "padding:5px;background:#ff4444;color:#fff;border:none;cursor:pointer;font-size:10px;border-radius:4px;font-weight:bold;";
    clearBtn.onclick = () => { 
        if(confirm("Wipe all data and PNL?")) { 
            window.tcLogs = []; 
            window.tcStats = { wins: 0, losses: 0, lastPrediction: null, streak: 0, units: 0 };
            saveData(); 
            btn.innerHTML = `💾 DOWNLOAD LOG (0)`; 
            updateEngineUI();
        }
    };
    container.appendChild(clearBtn);

    const intelBox = document.createElement("div");
    intelBox.style = "background:#000;color:#00ff00;padding:15px;border-radius:8px;font-size:12px;border:2px solid #00ff00;box-shadow:0 0 15px rgba(0,255,0,0.3);line-height:1.6;user-select:none;";
    container.appendChild(intelBox);

    // 3. LOGIC ENGINE (TREND & DEVIATION)
    function getDynamicPrediction(data) {
        if (data.length < 5) return { win: "WAIT", reason: "COLLECTING", shortWin: "WAIT" };

        const history = data.map(r => r.winner.replace('PLAYER_', ''));
        const lastWinner = history[history.length - 1];
        const lastTwo = history.slice(-2);
        const last10 = history.slice(-10);

        let pred = "";
        let reason = "";

        // Rule 1: Catch Streaks
        if (lastTwo[0] === lastTwo[1]) {
            pred = lastWinner;
            reason = "RIDING STREAK";
        } 
        // Rule 2: Anti-11 Bias (If 11 has won 4 or more times in the last 10, predict 10)
        else if (last10.filter(x => x === '11').length >= 5) {
            pred = "10"; 
            reason = "11 OVERBOUGHT";
        }
        // Rule 3: Catching Player 9 or 10 (If they haven't hit in the last 6 rounds, they are 'due')
        else if (!history.slice(-6).includes('9') && lastWinner !== '8') {
            pred = "9";
            reason = "PLAYER 9 DUE";
        }
        else if (!history.slice(-5).includes('10')) {
            pred = "10";
            reason = "PLAYER 10 DUE";
        }
        // Rule 4: Dynamic Chop (Predict 11 only if it hasn't won the immediate last round)
        else {
            pred = lastWinner === '11' ? '10' : '11';
            reason = "DYNAMIC CHOP";
        }

        // Never aggressively predict Player 8 unless it's streaking (too low probability)
        if (pred === '8' && reason !== "RIDING STREAK") {
            pred = '9';
        }

        return { 
            win: `PLAYER_${pred}`, 
            reason: reason, 
            shortWin: pred 
        };
    }

    function updateEngineUI() {
        const data = window.tcLogs;
        if (data.length < 1) {
            intelBox.innerHTML = "WAITING FOR ROUND DATA...";
            return;
        }

        const pred = getDynamicPrediction(data);
        const total = window.tcStats.wins + window.tcStats.losses;
        const rate = total > 0 ? ((window.tcStats.wins / total) * 100).toFixed(1) : 0;
        const storage = getStorageStats();

        intelBox.style.borderColor = window.tcStats.streak >= 2 ? "#0f0" : (window.tcStats.streak <= -2 ? "#f00" : "#00ff00");
        intelBox.innerHTML = `
            <div style="display:flex;justify-content:space-between;border-bottom:1px solid #333;padding-bottom:5px;margin-bottom:8px;">
                <b style="color:#0ff;">32C DYNAMIC v3.5</b>
                <span style="font-size:10px;color:#888;">${storage.percent}% DB</span>
            </div>
            
            <div style="text-align:center;margin-bottom:10px;">
                <span style="font-size:10px;color:#aaa;">NEXT PREDICTION</span><br>
                <span style="font-size:24px;color:${pred.shortWin === 'WAIT' ? '#ffff00' : '#00ffcc'};font-weight:bold;">
                    ${pred.shortWin === "WAIT" ? "WAIT" : "PLAYER " + pred.shortWin}
                </span><br>
                <span style="font-size:11px;color:#ffd700;">MODE: ${pred.reason}</span>
            </div>

            <div style="background:#111;padding:8px;border-radius:6px;border:1px solid #333;">
                <div style="display:flex;justify-content:space-between;font-size:11px;">
                    <span>W: ${window.tcStats.wins} | L: ${window.tcStats.losses}</span>
                    <span style="color:${rate > 25 ? '#0f0' : '#f00'};font-weight:bold;">${rate}%</span>
                </div>
                <div style="text-align:center;margin-top:5px;">
                    <span style="font-size:10px;color:#888;">ESTIMATED PNL</span><br>
                    <span style="font-size:18px;color:${window.tcStats.units >= 0 ? '#ffd700' : '#ff4444'};font-weight:bold;">${window.tcStats.units.toFixed(2)} U</span>
                </div>
            </div>
            <div style="text-align:center;font-size:10px;color:#666;margin-top:5px;">ROUNDS LOGGED: ${data.length}</div>
        `;
    }

    // 4. DATA PROCESSING & PNL CALCULATION (SINGLE BET)
    function processIncomingDataArray(dataArray) {
        if (!dataArray || dataArray.length === 0) return;

        const recentRounds = [...dataArray].reverse();
        let newRoundsAdded = false;

        recentRounds.forEach((round, index) => {
            const alreadyExists = window.tcLogs.some(log => log.rid === round.roundId);
            
            if (!alreadyExists) {
                newRoundsAdded = true;
                const isLiveRound = index === recentRounds.length - 1;

                if (window.tcStats.lastPrediction && window.tcStats.lastPrediction.rid !== round.roundId && window.tcStats.lastPrediction.win !== "WAIT") {
                    
                    const isHit = window.tcStats.lastPrediction.win === round.winner;

                    if (isHit) {
                        const winningOdds = ODDS[round.winner] || 1.0;
                        const netProfit = winningOdds - 1.0; 
                        
                        window.tcStats.wins++; 
                        window.tcStats.units += netProfit;
                        window.tcStats.streak = Math.max(1, window.tcStats.streak + 1);
                        if(isLiveRound) playSound(880, 'sine');
                    } else {
                        window.tcStats.losses++; 
                        window.tcStats.units -= 1.0;
                        window.tcStats.streak = Math.min(-1, window.tcStats.streak - 1);
                        if(isLiveRound) playSound(220, 'sawtooth');
                    }
                }

                const getCards = (playerKey) => round.cards && round.cards[playerKey] ? round.cards[playerKey].join('|') : '';

                lastLoggedRid = round.roundId;
                window.tcLogs.push({ 
                    rid: round.roundId, 
                    winner: round.winner,
                    cards_8: getCards("PLAYER_8"),
                    cards_9: getCards("PLAYER_9"),
                    cards_10: getCards("PLAYER_10"),
                    cards_11: getCards("PLAYER_11")
                });

                const nextPred = getDynamicPrediction(window.tcLogs);
                window.tcStats.lastPrediction = { rid: round.roundId, win: nextPred.win };

                if (isLiveRound) {
                    console.log(`%c [LIVE ROUND SAVED] RID: ${round.roundId} | WIN: ${round.winner} `, "color:#0f0;font-weight:bold;");
                }
            }
        });

        if (newRoundsAdded) {
            saveData();
            btn.innerHTML = `💾 DOWNLOAD LOG (${window.tcLogs.length})`;
            updateEngineUI();
        }
    }

    // 5. DOWNLOAD ACTION
    btn.onclick = (e) => {
        e.preventDefault();
        if (window.tcLogs.length === 0) return alert("No data yet!");
        const content = window.tcLogs.map(r => `${r.rid},${r.winner},${r.cards_8},${r.cards_9},${r.cards_10},${r.cards_11}`).join("\n");
        const blob = new Blob([content], { type: "text/plain" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `t10_32cards_dataset_${Date.now()}.csv`;
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

    if (window.tcLogs.length > 0) {
        lastLoggedRid = window.tcLogs[window.tcLogs.length - 1].rid;
    }
    updateEngineUI();
    console.log("%c 32 CARDS DYNAMIC SUITE v3.5 ONLINE ", "background:#000; color:#0f0; font-weight:bold; font-size:14px;");
})();




// No 8 and 50% chance 11, 50% chance 9 and 10
(function() {
    // 1. DATA & STATS PERSISTENCE
    const LOGS_KEY = 't10_32cards_logs';
    const STATS_KEY = 't10_32cards_stats';
    
    // Odds Dictionary
    const ODDS = {
        'PLAYER_8': 12.00,
        'PLAYER_9': 5.85,
        'PLAYER_10': 3.15,
        'PLAYER_11': 2.06
    };
    
    window.tcLogs = JSON.parse(localStorage.getItem(LOGS_KEY)) || [];
    window.tcStats = JSON.parse(localStorage.getItem(STATS_KEY)) || { wins: 0, losses: 0, lastPrediction: null, streak: 0, units: 0 };
    let lastLoggedRid = null;

    const saveData = () => {
        localStorage.setItem(LOGS_KEY, JSON.stringify(window.tcLogs));
        localStorage.setItem(STATS_KEY, JSON.stringify(window.tcStats));
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
    container.id = "tc-automation-ui";
    container.style = "position:fixed;top:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:8px;font-family:monospace;width:250px;";
    document.body.appendChild(container);

    const btn = document.createElement("button");
    btn.innerHTML = `💾 DOWNLOAD LOG (${window.tcLogs.length})`;
    btn.style = "padding:12px;background:#ffd700;color:#000;border:2px solid #000;cursor:pointer;font-weight:bold;border-radius:4px;";
    container.appendChild(btn);

    const clearBtn = document.createElement("button");
    clearBtn.innerHTML = "🗑️ WIPE MEMORY & STATS";
    clearBtn.style = "padding:5px;background:#ff4444;color:#fff;border:none;cursor:pointer;font-size:10px;border-radius:4px;font-weight:bold;";
    clearBtn.onclick = () => { 
        if(confirm("Wipe all data and PNL?")) { 
            window.tcLogs = []; 
            window.tcStats = { wins: 0, losses: 0, lastPrediction: null, streak: 0, units: 0 };
            saveData(); 
            btn.innerHTML = `💾 DOWNLOAD LOG (0)`; 
            updateEngineUI();
        }
    };
    container.appendChild(clearBtn);

    const intelBox = document.createElement("div");
    intelBox.style = "background:#000;color:#00ff00;padding:15px;border-radius:8px;font-size:12px;border:2px solid #00ff00;box-shadow:0 0 15px rgba(0,255,0,0.3);line-height:1.6;user-select:none;";
    container.appendChild(intelBox);

    // 3. LOGIC ENGINE (50% 11, 50% 9/10 Split. Zero 8s.)
    function getDynamicPrediction(data) {
        if (data.length < 5) return { win: "WAIT", reason: "COLLECTING", shortWin: "WAIT" };

        const history = data.map(r => r.winner.replace('PLAYER_', ''));
        const lastWinner = history[history.length - 1];
        
        // Check 11's frequency in the last 10 rounds to maintain the ~50% mathematical rule
        const count11 = history.slice(-10).filter(x => x === '11').length;

        let pred = "";
        let reason = "";

        // If 11 didn't win last round AND isn't dominating the recent average (>50%), predict 11 to catch the bounce.
        if (lastWinner !== '11' && count11 < 6) {
            pred = '11';
            reason = "11 BOUNCE (50% RULE)";
        } 
        // If 11 is actively streaking (won last 2) and hasn't exceeded its 50% average heavily, ride the streak.
        else if (lastWinner === '11' && history[history.length - 2] === '11' && count11 < 6) {
            pred = '11';
            reason = "11 STREAK RIDE";
        } 
        // Otherwise, 11 is either overbought or just hit, so we switch to the remaining 50% (Player 9 or 10).
        else {
            // Find who has been starving the longest between 9 and 10
            const last9 = history.lastIndexOf('9');
            const last10 = history.lastIndexOf('10');
            
            if (last9 < last10) {
                pred = '9';
                reason = "9 DUE (CHOP)";
            } else {
                pred = '10';
                reason = "10 DUE (CHOP)";
            }
        }

        return { 
            win: `PLAYER_${pred}`, 
            reason: reason, 
            shortWin: pred 
        };
    }

    function updateEngineUI() {
        const data = window.tcLogs;
        if (data.length < 1) {
            intelBox.innerHTML = "WAITING FOR ROUND DATA...";
            return;
        }

        const pred = getDynamicPrediction(data);
        const total = window.tcStats.wins + window.tcStats.losses;
        const rate = total > 0 ? ((window.tcStats.wins / total) * 100).toFixed(1) : 0;
        const storage = getStorageStats();

        intelBox.style.borderColor = window.tcStats.streak >= 2 ? "#0f0" : (window.tcStats.streak <= -2 ? "#f00" : "#00ff00");
        intelBox.innerHTML = `
            <div style="display:flex;justify-content:space-between;border-bottom:1px solid #333;padding-bottom:5px;margin-bottom:8px;">
                <b style="color:#0ff;">32C ENGINE v4.0</b>
                <span style="font-size:10px;color:#888;">${storage.percent}% DB</span>
            </div>
            
            <div style="text-align:center;margin-bottom:10px;">
                <span style="font-size:10px;color:#aaa;">NEXT PREDICTION</span><br>
                <span style="font-size:24px;color:${pred.shortWin === 'WAIT' ? '#ffff00' : '#00ffcc'};font-weight:bold;">
                    ${pred.shortWin === "WAIT" ? "WAIT" : "PLAYER " + pred.shortWin}
                </span><br>
                <span style="font-size:11px;color:#ffd700;">MODE: ${pred.reason}</span>
            </div>

            <div style="background:#111;padding:8px;border-radius:6px;border:1px solid #333;">
                <div style="display:flex;justify-content:space-between;font-size:11px;">
                    <span>W: ${window.tcStats.wins} | L: ${window.tcStats.losses}</span>
                    <span style="color:${rate > 25 ? '#0f0' : '#f00'};font-weight:bold;">${rate}%</span>
                </div>
                <div style="text-align:center;margin-top:5px;">
                    <span style="font-size:10px;color:#888;">ESTIMATED PNL</span><br>
                    <span style="font-size:18px;color:${window.tcStats.units >= 0 ? '#ffd700' : '#ff4444'};font-weight:bold;">${window.tcStats.units.toFixed(2)} U</span>
                </div>
            </div>
            <div style="text-align:center;font-size:10px;color:#666;margin-top:5px;">ROUNDS LOGGED: ${data.length}</div>
        `;
    }

    // 4. DATA PROCESSING & PNL CALCULATION (SINGLE BET)
    function processIncomingDataArray(dataArray) {
        if (!dataArray || dataArray.length === 0) return;

        const recentRounds = [...dataArray].reverse();
        let newRoundsAdded = false;

        recentRounds.forEach((round, index) => {
            const alreadyExists = window.tcLogs.some(log => log.rid === round.roundId);
            
            if (!alreadyExists) {
                newRoundsAdded = true;
                const isLiveRound = index === recentRounds.length - 1;

                if (window.tcStats.lastPrediction && window.tcStats.lastPrediction.rid !== round.roundId && window.tcStats.lastPrediction.win !== "WAIT") {
                    
                    const isHit = window.tcStats.lastPrediction.win === round.winner;

                    if (isHit) {
                        const winningOdds = ODDS[round.winner] || 1.0;
                        const netProfit = winningOdds - 1.0; 
                        
                        window.tcStats.wins++; 
                        window.tcStats.units += netProfit;
                        window.tcStats.streak = Math.max(1, window.tcStats.streak + 1);
                        if(isLiveRound) playSound(880, 'sine');
                    } else {
                        window.tcStats.losses++; 
                        window.tcStats.units -= 1.0;
                        window.tcStats.streak = Math.min(-1, window.tcStats.streak - 1);
                        if(isLiveRound) playSound(220, 'sawtooth');
                    }
                }

                const getCards = (playerKey) => round.cards && round.cards[playerKey] ? round.cards[playerKey].join('|') : '';

                lastLoggedRid = round.roundId;
                window.tcLogs.push({ 
                    rid: round.roundId, 
                    winner: round.winner,
                    cards_8: getCards("PLAYER_8"),
                    cards_9: getCards("PLAYER_9"),
                    cards_10: getCards("PLAYER_10"),
                    cards_11: getCards("PLAYER_11")
                });

                const nextPred = getDynamicPrediction(window.tcLogs);
                window.tcStats.lastPrediction = { rid: round.roundId, win: nextPred.win };

                if (isLiveRound) {
                    console.log(`%c [LIVE ROUND SAVED] RID: ${round.roundId} | WIN: ${round.winner} `, "color:#0f0;font-weight:bold;");
                }
            }
        });

        if (newRoundsAdded) {
            saveData();
            btn.innerHTML = `💾 DOWNLOAD LOG (${window.tcLogs.length})`;
            updateEngineUI();
        }
    }

    // 5. DOWNLOAD ACTION
    btn.onclick = (e) => {
        e.preventDefault();
        if (window.tcLogs.length === 0) return alert("No data yet!");
        const content = window.tcLogs.map(r => `${r.rid},${r.winner},${r.cards_8},${r.cards_9},${r.cards_10},${r.cards_11}`).join("\n");
        const blob = new Blob([content], { type: "text/plain" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `t10_32cards_dataset_${Date.now()}.csv`;
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

    if (window.tcLogs.length > 0) {
        lastLoggedRid = window.tcLogs[window.tcLogs.length - 1].rid;
    }
    updateEngineUI();
    console.log("%c 32 CARDS MATH ENGINE v4.0 ONLINE ", "background:#000; color:#0f0; font-weight:bold; font-size:14px;");
})();



// 4% chance of 8, 50% 11 and 46% 9 and 10
(function() {
    // 1. DATA & STATS PERSISTENCE
    const LOGS_KEY = 't10_32cards_logs';
    const STATS_KEY = 't10_32cards_stats';
    
    // Odds Dictionary
    const ODDS = {
        'PLAYER_8': 12.00,
        'PLAYER_9': 5.85,
        'PLAYER_10': 3.15,
        'PLAYER_11': 2.06
    };
    
    window.tcLogs = JSON.parse(localStorage.getItem(LOGS_KEY)) || [];
    window.tcStats = JSON.parse(localStorage.getItem(STATS_KEY)) || { wins: 0, losses: 0, lastPrediction: null, streak: 0, units: 0 };
    let lastLoggedRid = null;

    const saveData = () => {
        localStorage.setItem(LOGS_KEY, JSON.stringify(window.tcLogs));
        localStorage.setItem(STATS_KEY, JSON.stringify(window.tcStats));
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
    container.id = "tc-automation-ui";
    container.style = "position:fixed;top:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:8px;font-family:monospace;width:250px;";
    document.body.appendChild(container);

    const btn = document.createElement("button");
    btn.innerHTML = `💾 DOWNLOAD LOG (${window.tcLogs.length})`;
    btn.style = "padding:12px;background:#ffd700;color:#000;border:2px solid #000;cursor:pointer;font-weight:bold;border-radius:4px;";
    container.appendChild(btn);

    const clearBtn = document.createElement("button");
    clearBtn.innerHTML = "🗑️ WIPE MEMORY & STATS";
    clearBtn.style = "padding:5px;background:#ff4444;color:#fff;border:none;cursor:pointer;font-size:10px;border-radius:4px;font-weight:bold;";
    clearBtn.onclick = () => { 
        if(confirm("Wipe all data and PNL?")) { 
            window.tcLogs = []; 
            window.tcStats = { wins: 0, losses: 0, lastPrediction: null, streak: 0, units: 0 };
            saveData(); 
            btn.innerHTML = `💾 DOWNLOAD LOG (0)`; 
            updateEngineUI();
        }
    };
    container.appendChild(clearBtn);

    const intelBox = document.createElement("div");
    intelBox.style = "background:#000;color:#00ff00;padding:15px;border-radius:8px;font-size:12px;border:2px solid #00ff00;box-shadow:0 0 15px rgba(0,255,0,0.3);line-height:1.6;user-select:none;";
    container.appendChild(intelBox);

    // 3. LOGIC ENGINE (50% 11, 46% 9/10 Split, 4% 8 Sniper)
    function getDynamicPrediction(data) {
        if (data.length < 5) return { win: "WAIT", reason: "COLLECTING", shortWin: "WAIT" };

        const history = data.map(r => r.winner.replace('PLAYER_', ''));
        const lastWinner = history[history.length - 1];
        
        // Frequencies and flags
        const count11 = history.slice(-10).filter(x => x === '11').length;
        const has8Recent = history.slice(-25).includes('8'); // 4% probability window

        let pred = "";
        let reason = "";

        // Rule 1: 11 BOUNCE (Maintain ~50% baseline)
        if (lastWinner !== '11' && count11 < 6) {
            pred = '11';
            reason = "11 BOUNCE (50% RULE)";
        } 
        // Rule 2: 11 STREAK RIDE
        else if (lastWinner === '11' && history[history.length - 2] === '11' && count11 < 6) {
            pred = '11';
            reason = "11 STREAK RIDE";
        } 
        // Rule 3: 8 SNIPER (Triggers roughly 4% of the time when 8 is starving)
        else if (!has8Recent && lastWinner !== '8') {
            pred = '8';
            reason = "8 DUE (4% THRESHOLD)";
        } 
        // Rule 4: 9/10 CHOP (Remaining probability)
        else {
            // Find who has been starving the longest between 9 and 10
            const last9 = history.lastIndexOf('9');
            const last10 = history.lastIndexOf('10');
            
            if (last9 < last10) {
                pred = '9';
                reason = "9 DUE (CHOP)";
            } else {
                pred = '10';
                reason = "10 DUE (CHOP)";
            }
        }

        return { 
            win: `PLAYER_${pred}`, 
            reason: reason, 
            shortWin: pred 
        };
    }

    function updateEngineUI() {
        const data = window.tcLogs;
        if (data.length < 1) {
            intelBox.innerHTML = "WAITING FOR ROUND DATA...";
            return;
        }

        const pred = getDynamicPrediction(data);
        const total = window.tcStats.wins + window.tcStats.losses;
        const rate = total > 0 ? ((window.tcStats.wins / total) * 100).toFixed(1) : 0;
        const storage = getStorageStats();

        intelBox.style.borderColor = window.tcStats.streak >= 2 ? "#0f0" : (window.tcStats.streak <= -2 ? "#f00" : "#00ff00");
        intelBox.innerHTML = `
            <div style="display:flex;justify-content:space-between;border-bottom:1px solid #333;padding-bottom:5px;margin-bottom:8px;">
                <b style="color:#0ff;">32C ENGINE v4.1</b>
                <span style="font-size:10px;color:#888;">${storage.percent}% DB</span>
            </div>
            
            <div style="text-align:center;margin-bottom:10px;">
                <span style="font-size:10px;color:#aaa;">NEXT PREDICTION</span><br>
                <span style="font-size:24px;color:${pred.shortWin === 'WAIT' ? '#ffff00' : (pred.shortWin === '8' ? '#ff00ff' : '#00ffcc')};font-weight:bold;">
                    ${pred.shortWin === "WAIT" ? "WAIT" : "PLAYER " + pred.shortWin}
                </span><br>
                <span style="font-size:11px;color:#ffd700;">MODE: ${pred.reason}</span>
            </div>

            <div style="background:#111;padding:8px;border-radius:6px;border:1px solid #333;">
                <div style="display:flex;justify-content:space-between;font-size:11px;">
                    <span>W: ${window.tcStats.wins} | L: ${window.tcStats.losses}</span>
                    <span style="color:${rate > 25 ? '#0f0' : '#f00'};font-weight:bold;">${rate}%</span>
                </div>
                <div style="text-align:center;margin-top:5px;">
                    <span style="font-size:10px;color:#888;">ESTIMATED PNL</span><br>
                    <span style="font-size:18px;color:${window.tcStats.units >= 0 ? '#ffd700' : '#ff4444'};font-weight:bold;">${window.tcStats.units.toFixed(2)} U</span>
                </div>
            </div>
            <div style="text-align:center;font-size:10px;color:#666;margin-top:5px;">ROUNDS LOGGED: ${data.length}</div>
        `;
    }

    // 4. DATA PROCESSING & PNL CALCULATION (SINGLE BET)
    function processIncomingDataArray(dataArray) {
        if (!dataArray || dataArray.length === 0) return;

        const recentRounds = [...dataArray].reverse();
        let newRoundsAdded = false;

        recentRounds.forEach((round, index) => {
            const alreadyExists = window.tcLogs.some(log => log.rid === round.roundId);
            
            if (!alreadyExists) {
                newRoundsAdded = true;
                const isLiveRound = index === recentRounds.length - 1;

                if (window.tcStats.lastPrediction && window.tcStats.lastPrediction.rid !== round.roundId && window.tcStats.lastPrediction.win !== "WAIT") {
                    
                    const isHit = window.tcStats.lastPrediction.win === round.winner;

                    if (isHit) {
                        const winningOdds = ODDS[round.winner] || 1.0;
                        const netProfit = winningOdds - 1.0; 
                        
                        window.tcStats.wins++; 
                        window.tcStats.units += netProfit;
                        window.tcStats.streak = Math.max(1, window.tcStats.streak + 1);
                        if(isLiveRound) playSound(880, 'sine');
                    } else {
                        window.tcStats.losses++; 
                        window.tcStats.units -= 1.0;
                        window.tcStats.streak = Math.min(-1, window.tcStats.streak - 1);
                        if(isLiveRound) playSound(220, 'sawtooth');
                    }
                }

                const getCards = (playerKey) => round.cards && round.cards[playerKey] ? round.cards[playerKey].join('|') : '';

                lastLoggedRid = round.roundId;
                window.tcLogs.push({ 
                    rid: round.roundId, 
                    winner: round.winner,
                    cards_8: getCards("PLAYER_8"),
                    cards_9: getCards("PLAYER_9"),
                    cards_10: getCards("PLAYER_10"),
                    cards_11: getCards("PLAYER_11")
                });

                const nextPred = getDynamicPrediction(window.tcLogs);
                window.tcStats.lastPrediction = { rid: round.roundId, win: nextPred.win };

                if (isLiveRound) {
                    console.log(`%c [LIVE ROUND SAVED] RID: ${round.roundId} | WIN: ${round.winner} `, "color:#0f0;font-weight:bold;");
                }
            }
        });

        if (newRoundsAdded) {
            saveData();
            btn.innerHTML = `💾 DOWNLOAD LOG (${window.tcLogs.length})`;
            updateEngineUI();
        }
    }

    // 5. DOWNLOAD ACTION
    btn.onclick = (e) => {
        e.preventDefault();
        if (window.tcLogs.length === 0) return alert("No data yet!");
        const content = window.tcLogs.map(r => `${r.rid},${r.winner},${r.cards_8},${r.cards_9},${r.cards_10},${r.cards_11}`).join("\n");
        const blob = new Blob([content], { type: "text/plain" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `t10_32cards_dataset_${Date.now()}.csv`;
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

    if (window.tcLogs.length > 0) {
        lastLoggedRid = window.tcLogs[window.tcLogs.length - 1].rid;
    }
    updateEngineUI();
    console.log("%c 32 CARDS MATH ENGINE v4.1 ONLINE ", "background:#000; color:#0f0; font-weight:bold; font-size:14px;");
})();