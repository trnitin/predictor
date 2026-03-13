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

    // 3. UPGRADED LOGIC ENGINE (v2.0)
    function getDynamicPrediction(data) {
        if (data.length < 5) return { win: "WAIT", reason: "COLLECTING" };

        const validHistory = data.map(r => r.winner).filter(w => w === 'A' || w === 'B');
        if (validHistory.length < 5) return { win: "WAIT", reason: "COLLECTING" };

        const historyStr = validHistory.join('');
        const lastWinner = validHistory[validHistory.length - 1];
        const last2 = historyStr.slice(-2);
        const last3 = historyStr.slice(-3);
        const last4 = historyStr.slice(-4);
        
        let pred = ""; let reason = "";

        // PHASE A: MULTI-DEPTH PATTERN MATCHING
        let foundPattern = null;
        if (validHistory.length > 15) {
            const depths = [5, 4, 3];
            for (let d of depths) {
                const seq = historyStr.slice(-d);
                const firstOccur = historyStr.lastIndexOf(seq, historyStr.length - (d + 1));
                if (firstOccur !== -1) {
                    foundPattern = historyStr[firstOccur + d]; 
                    if (foundPattern) {
                        reason = `DEEP PATTERN (${d} MATCH)`;
                        break; 
                    }
                }
            }
        }

        // PHASE B: ADVANCED FALLBACK
        if (foundPattern) {
            pred = foundPattern;
        } else {
            const last12 = validHistory.slice(-12);
            const aCount = last12.filter(x => x === "A").length;
            const bCount = last12.filter(x => x === "B").length;

            const isChop = last4 === "ABAB" || last4 === "BABA" || last3 === "ABA" || last3 === "BAB";
            
            if (isChop) {
                pred = lastWinner === "A" ? "B" : "A";
                reason = "ACTIVE CHOPPING";
            } else if (last2 === "AA" || last2 === "BB") {
                pred = lastWinner;
                reason = "TREND RIDER";
            } else if (aCount >= 8) {
                pred = "A"; reason = "HEAVY A BIAS (12)";
            } else if (bCount >= 8) {
                pred = "B"; reason = "HEAVY B BIAS (12)";
            } else {
                pred = lastWinner; 
                reason = "MOMENTUM DEFAULT";
            }
        }
        return { win: pred, reason: reason };
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

    // 5. UI UPDATER (Self-Healing)
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
                <b style="color:#0ff;">1-DAY TP MASTER SUITE</b>
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

    // 6A. HISTORY ARRAY PROCESSOR (With Instant Backtesting)
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

                // --- INSTANT BACKTESTING ---
                if (window.tpLogs.length >= 5) {
                    const simPred = getDynamicPrediction(window.tpLogs);
                    if (simPred && simPred.win !== "WAIT") {
                        if (winner === "TIE") {
                            window.tpStats.losses++; window.tpStats.units -= 1.0;
                            window.tpStats.streak = Math.min(-1, window.tpStats.streak - 1);
                            simLosses++;
                        } else if (simPred.win === winner) {
                            window.tpStats.wins++; window.tpStats.units += 0.98; // 1.98 Payout
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
            // Overwrite "WAIT" lock if history just armed the AI
            if (activePrediction && activePrediction.win === "WAIT") {
                activePrediction = getDynamicPrediction(window.tpLogs);
            }
            console.log(`%c [BACKFILL] Imported ${added} rounds. Backtest: ${simWins}W / ${simLosses}L `, "color:#f0f;font-weight:bold;");
            updateEngineUI();
        }
    }

    // 6B. LIVE ROUND PROCESSOR
    function processGameData(d) {
        if (!d || !d.mid || !d.card) return;
        const mid = String(d.mid);
        const cardStr = d.card;

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
                console.log(`%c [SAVED] MID: ${mid} | WINNER: ${winner} `, "color:#0ff;font-weight:bold;");
                updateEngineUI();
            }
        }
    }

    // 7. UNIVERSAL ROUTER
    function routeData(payload) {
        if (!payload) return;
        if (payload.res && Array.isArray(payload.res)) processHistoryArray(payload.res);
        else if (payload.mid && payload.card) processGameData(payload);
    }

    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const response = await originalFetch.apply(this, args);
        try {
            response.clone().json().then(data => {
                if (data && data.original && data.original.data) routeData(data.original.data);
                else if (data && data.data) routeData(data.data); 
            }).catch(e => {});
        } catch(e) {}
        return response;
    };

    const originalXHR = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this.addEventListener('load', function() {
            try {
                const data = JSON.parse(this.responseText);
                if (data && data.original && data.original.data) routeData(data.original.data);
                else if (data && data.data) routeData(data.data);
            } catch(e) {}
        });
        originalXHR.call(this, method, url, ...rest);
    };

    if (typeof CryptoJS !== 'undefined' && CryptoJS.AES) {
        const originalDecrypt = CryptoJS.AES.decrypt;
        CryptoJS.AES.decrypt = function(ciphertext, key, cfg) {
            const decrypted = originalDecrypt.apply(this, arguments);
            try {
                const raw = decrypted.toString(CryptoJS.enc.Utf8);
                const parsed = JSON.parse(raw);
                if (parsed.original && parsed.original.data) routeData(parsed.original.data);
                else if (parsed.data) routeData(parsed.data);
            } catch(e) {}
            return decrypted;
        };
    }

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
    console.log("%c MASTER 1-DAY TP SUITE ONLINE | ENGINE v2.0 ENABLED ", "background:#000; color:#0f0; font-weight:bold; font-size:14px;");
})();