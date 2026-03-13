(function() {
    // 1. DATA & STATS PERSISTENCE
    const LOGS_KEY = 'lucky7_collector_data';
    const STATS_KEY = 'lucky7_ai_stats';

    window.casinoLogs = JSON.parse(localStorage.getItem(LOGS_KEY)) || [];
    window.aiStats = JSON.parse(localStorage.getItem(STATS_KEY)) || { 
        wins: 0, losses: 0, lastPrediction: null, streak: 0, units: 0 
    };
    let lastLoggedMid = null;

    const saveLogs = () => localStorage.setItem(LOGS_KEY, JSON.stringify(window.casinoLogs));
    const saveStats = () => localStorage.setItem(STATS_KEY, JSON.stringify(window.aiStats));

    // 2. AUDIO & UTILS
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

    // 3. UI SETUP (TOP-RIGHT LOGGER)
    const container = document.createElement("div");
    container.id = "manual-automation-ui";
    container.style = "position:fixed;top:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:8px;font-family:sans-serif;width:220px;";
    document.body.appendChild(container);

    const btn = document.createElement("button");
    btn.innerHTML = `💾 DOWNLOAD LOG (${window.casinoLogs.length} Rounds)`;
    btn.style = "padding:16px;background:#ffd700;color:#000;border:2px solid #000;cursor:pointer;font-weight:bold;border-radius:8px;box-shadow:0px 4px 15px rgba(0,0,0,0.4);";
    container.appendChild(btn);

    const preview = document.createElement("div");
    preview.style = "background:rgba(0,0,0,0.85);color:#fff;padding:8px;border-radius:6px;font-size:10px;font-family:monospace;border:1px solid #444;";
    preview.innerHTML = "LAST 5: Waiting...";
    container.appendChild(preview);

    const clearBtn = document.createElement("button");
    clearBtn.innerHTML = "🗑️ RESET MEMORY";
    clearBtn.style = "padding:5px;background:#ff4444;color:#fff;border:none;cursor:pointer;font-size:10px;border-radius:4px;font-weight:bold;";
    clearBtn.onclick = () => { 
        if(confirm("Clear all data and reset PnL?")) { 
            window.casinoLogs = []; 
            window.aiStats = { wins: 0, losses: 0, lastPrediction: null, streak: 0, units: 0 };
            saveLogs(); 
            saveStats();
            btn.innerHTML = `💾 DOWNLOAD LOG (0 Rounds)`; 
            preview.innerHTML = "LAST 5: Waiting..."; 
        }
    };
    container.appendChild(clearBtn);

    // UI SETUP (BOTTOM-RIGHT PREDICTOR)
    function getOrCreateInfoBox() {
        let box = document.getElementById("ai-prediction-layer");
        if (!box) {
            box = document.createElement("div");
            box.id = "ai-prediction-layer";
            box.style = "position:fixed;bottom:20px;right:20px;z-index:99998;background:#000;color:#00ff00;padding:15px;border-radius:10px;font-size:12px;font-family:monospace;border:2px solid #00ff00;width:250px;box-shadow:0 0 25px rgba(0,255,0,0.5);line-height:1.6;user-select:none;";
            document.body.appendChild(box);
        }
        return box;
    }

    // 4. WIN CALCULATION LOGIC
    function calculateWin(cardStr) {
        const rankStr = cardStr.substring(0, cardStr.length - 2);
        if (rankStr === "7") return "0"; 
        const lowRanks = ["A", "2", "3", "4", "5", "6"];
        return lowRanks.includes(rankStr) ? "1" : "2"; 
    }

    function updatePreview() {
        const last5 = window.casinoLogs.slice(-5).reverse();
        preview.innerHTML = "LAST 5:<br>" + last5.map(r => `${r.card} → Win: ${r.winColumn}`).join("<br>");
    }
    if (window.casinoLogs.length > 0) updatePreview();

    // 5. DOWNLOAD ACTION
    btn.onclick = (e) => {
        e.preventDefault();
        if (window.casinoLogs.length === 0) return alert("No data yet!");
        const content = window.casinoLogs.map(r => `${r.mid},${r.card},${r.winColumn}`).join("\n");
        const blob = new Blob([content], { type: "text/plain" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `lucky7_dataset_${Date.now()}.txt`;
        link.click();
    };

    // 6. DECRYPTION HOOK (LOGGER)
    const originalDecrypt = CryptoJS.AES.decrypt;
    CryptoJS.AES.decrypt = function(ciphertext, key, cfg) {
        const decrypted = originalDecrypt.apply(this, arguments);
        try {
            const raw = decrypted.toString(CryptoJS.enc.Utf8);
            const parsed = JSON.parse(raw);
            if (parsed.original && parsed.original.data) {
                const d = parsed.original.data;
                const card = d.card;
                const mid = d.mid;

                if (card && card !== "1" && mid !== lastLoggedMid) {
                    const exists = window.casinoLogs.some(log => log.mid === mid);
                    if (!exists) {
                        lastLoggedMid = mid;
                        const winRes = calculateWin(card);
                        window.casinoLogs.push({ mid: mid, card: card, winColumn: winRes });
                        saveLogs();
                        
                        btn.innerHTML = `💾 DOWNLOAD LOG (${window.casinoLogs.length} Rounds)`;
                        updatePreview();
                        console.log(`%c [SAVED] MID: ${mid} | Card: ${card} | Win: ${winRes} `, "color:#00ff00;font-weight:bold;");
                    }
                }
            }
        } catch(e) {}
        return decrypted;
    };

    // 7. ANTI-IDLE
    setInterval(() => {
        window.scrollBy(0, 100);
        setTimeout(() => window.scrollBy(0, -100), 10000);
        document.querySelectorAll('div').forEach(el => {
            if (el.innerText.match(/idle|inactivity|action/i) && el.offsetWidth < 600) { el.style.display = 'none'; }
        });
    }, 5000);

    // 8. DYNAMIC PREDICTION ENGINE
    function getDynamicPrediction(data) {
        if (data.length < 5) return { win: "1", reason: "COLLECTING", suit: "??" };

        const historyStr = data.map(r => r.winColumn).join('');
        const lastCard = data[data.length - 1];
        let pred = "";
        let reason = "";

        // PHASE A: DEEP PATTERN MATCHING
        let foundPattern = null;
        if (data.length > 30) {
            const lastSeq = historyStr.slice(-4); 
            const firstOccur = historyStr.lastIndexOf(lastSeq, historyStr.length - 5);
            if (firstOccur !== -1) {
                foundPattern = historyStr[firstOccur + 4];
            }
        }

        // PHASE B: FALLBACK LOGIC
        if (foundPattern && foundPattern !== "0") {
            pred = foundPattern;
            reason = "DEEP PATTERN";
        } else {
            const last10 = data.slice(-10).map(r => r.winColumn);
            const highCount = last10.filter(x => x === "2").length;
            const lowCount = last10.filter(x => x === "1").length;

            if (data.slice(-3).every(r => r.winColumn === lastCard.winColumn && r.winColumn !== "0")) {
                pred = lastCard.winColumn;
                reason = "STREAKING";
            } else if (highCount >= 7) {
                pred = "2"; reason = "HIGH BIAS";
            } else if (lowCount >= 7) {
                pred = "1"; reason = "LOW BIAS";
            } else {
                pred = lastCard.winColumn === "1" ? "2" : "1";
                reason = "DYNAMIC CHOP";
            }
        }

        // SUIT ANALYSIS
        const last5Suits = data.slice(-5).map(r => r.card.slice(-2));
        const sCounts = {};
        last5Suits.forEach(s => sCounts[s] = (sCounts[s] || 0) + 1);
        const bestSuit = Object.keys(sCounts).reduce((a, b) => sCounts[a] > sCounts[b] ? a : b, "??");

        return { win: pred, reason: reason, suit: bestSuit };
    }

    function runAnalysis() {
        const data = window.casinoLogs || [];
        if (data.length < 2) return;
        
        const intelBox = getOrCreateInfoBox();
        const lastRound = data[data.length - 1];

        // STATS VALIDATION (7 is now a loss)
        if (window.aiStats.lastPrediction && window.aiStats.lastPrediction.mid !== lastRound.mid) {
            const isHit = window.aiStats.lastPrediction.win === lastRound.winColumn;
            if (isHit) {
                window.aiStats.wins++; window.aiStats.units += 0.95;
                window.aiStats.streak = Math.max(1, window.aiStats.streak + 1);
                playSound(880, 'sine');
            } else {
                window.aiStats.losses++; window.aiStats.units -= 1.0;
                window.aiStats.streak = Math.min(-1, window.aiStats.streak - 1);
                playSound(220, 'sawtooth');
            }
            window.aiStats.lastPrediction = null; 
            saveStats(); // Save on every update
        }

        const pred = getDynamicPrediction(data);
        window.aiStats.lastPrediction = { mid: lastRound.mid, win: pred.win };

        const total = window.aiStats.wins + window.aiStats.losses;
        const rate = total > 0 ? ((window.aiStats.wins / total) * 100).toFixed(1) : 0;
        const storage = getStorageStats();

        // UI RENDERING
        intelBox.style.borderColor = window.aiStats.streak >= 2 ? "#0f0" : (window.aiStats.streak <= -2 ? "#f00" : "#00ff00");
        intelBox.innerHTML = `
            <div style="display:flex;justify-content:space-between;border-bottom:1px solid #333;padding-bottom:5px;margin-bottom:8px;">
                <b style="color:#0ff;">DYNAMIC ENGINE v4</b>
                <span style="font-size:10px;color:#888;">${storage.percent}% USED</span>
            </div>
            
            <div style="text-align:center;margin-bottom:10px;">
                <span style="font-size:10px;color:#aaa;">NEXT PREDICTION</span><br>
                <span style="font-size:22px;color:#fff;font-weight:bold;letter-spacing:1px;">
                    ${pred.win === "1" ? "1 (LOW)" : "2 (HIGH)"}
                </span><br>
                <span style="font-size:11px;color:#ffd700;">MODE: ${pred.reason}</span>
            </div>

            <div style="background:#111;padding:8px;border-radius:6px;border:1px solid #333;">
                <div style="display:flex;justify-content:space-between;font-size:11px;">
                    <span>W: ${window.aiStats.wins} | L: ${window.aiStats.losses}</span>
                    <span style="color:${rate > 51.3 ? '#0f0' : '#f00'};font-weight:bold;">${rate}%</span>
                </div>
                <div style="text-align:center;margin-top:5px;">
                    <span style="font-size:10px;color:#888;">ESTIMATED PNL</span><br>
                    <span style="font-size:18px;color:#ffd700;font-weight:bold;">${window.aiStats.units.toFixed(2)} units</span>
                </div>
            </div>

            <div style="display:flex;justify-content:space-between;font-size:10px;color:#666;margin-top:10px;">
                <span>SUIT: ${pred.suit}</span>
                <span>ROUNDS: ${data.length}</span>
            </div>
        `;
    }

    setInterval(runAnalysis, 2000);
    console.log("%c UNIFIED SUITE ONLINE | PNL & DATA PERSISTENT ", "color:#00ff00; font-weight:bold;");
})();