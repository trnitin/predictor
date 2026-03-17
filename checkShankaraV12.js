// view only
(function () {
    if (typeof CryptoJS === 'undefined') {
        let script = document.createElement('script');
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js";
        script.onload = runSuite;
        document.head.appendChild(script);
    } else { runSuite(); }

    function runSuite() {
        const existingUi = document.getElementById("tp-automation-ui");
        if (existingUi) existingUi.remove();

        const LOGS_KEY = 'shankara_tp_logs';
        const STATS_KEY = 'shankara_tp_stats';
        
        window.tpLogs = [];
        window.tpStats = { wins: 0, losses: 0, streak: 0, units: 0 };
        window.engineMemory = { markov: [], diff: [], bias: [], fade: [], rider: [] };
        
        let activeMid = null, activePrediction = null, DYNAMIC_SECRET_KEY = null;

        const saveData = () => {
            localStorage.setItem(LOGS_KEY, JSON.stringify(window.tpLogs));
            localStorage.setItem(STATS_KEY, JSON.stringify(window.tpStats));
        };

        const getStorageStats = () => {
            let total = 0;
            for (let x in localStorage) { if (localStorage.hasOwnProperty(x)) total += ((localStorage[x].length + x.length) * 2); }
            return { percent: (((total / 1024) / 5120) * 100).toFixed(2) };
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
            const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `shankara_hybrid_turbo.csv`; link.click();
        };
        container.appendChild(dlBtn);

        const clearBtn = document.createElement("button");
        clearBtn.innerHTML = "🗑️ WIPE ALL DATA";
        clearBtn.style = "padding:5px;background:#ff4444;color:#fff;border:none;cursor:pointer;font-size:10px;border-radius:4px;font-weight:bold;";
        clearBtn.onclick = () => {
            if (confirm("Wipe all data and PNL?")) { 
                window.tpLogs = []; window.tpStats = { wins: 0, losses: 0, streak: 0, units: 0 }; 
                window.engineMemory = { markov: [], diff: [], bias: [], fade: [], rider: [] };
                activePrediction = null; saveData(); updateEngineUI(); 
            }
        };
        container.appendChild(clearBtn);

        const intelBox = document.createElement("div");
        intelBox.id = "tp-intel-box";
        intelBox.style = "background:#000;color:#00ff00;padding:15px;border-radius:8px;font-size:12px;border:2px solid #00ff00;box-shadow:0 0 15px rgba(0,255,0,0.3);line-height:1.6;user-select:none;";
        container.appendChild(intelBox);

        /* ---------------- CORE V11.2 MATH ---------------- */
        function getMarkov(h) { if (h.length < 5) return "A"; let counts = { AAA: 1, AAB: 1, ABA: 1, ABB: 1, BAA: 1, BAB: 1, BBA: 1, BBB: 1 }; for (let i = 2; i < h.length; i++) { const k = h[i-2] + h[i-1] + h[i]; if (counts[k]) counts[k]++; } const l2 = h.slice(-2).join(""); return counts[l2+"A"] > counts[l2+"B"] ? "A" : "B"; }
        function getDiff(h) { if (h.length < 5) return "A"; const deltas = h.slice(1).map((v, i) => v === h[i] ? "S" : "D"); let counts = { S: 1, D: 1 }; const l2d = deltas.slice(-2).join(""); for (let i = 2; i < deltas.length; i++) { if (deltas[i-2] + deltas[i-1] === l2d) counts[deltas[i]]++; } const nextD = counts.S > counts.D ? "S" : "D"; return nextD === "S" ? h[h.length-1] : (h[h.length-1] === "A" ? "B" : "A"); }
        function getBias(h) { return h.slice(-20).filter(x => x === "A").length > 10 ? "A" : "B"; }
        function getFade(h) { let streak = 1; const last = h[h.length-1]; for (let i = h.length-2; i >= 0; i--) { if (h[i] === last) streak++; else break; } return streak >= 3 ? (last === "A" ? "B" : "A") : last; }
        function getRider(h) { let streak = 1; const last = h[h.length-1]; for (let i = h.length-2; i >= 0; i--) { if (h[i] === last) streak++; else break; } return streak >= 2 ? last : (last === "B" ? "A" : "B"); }

        /* ---------------- V11.5 HYBRID TURBO ENGINE (100% PARTICIPATION) ---------------- */
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

            // TRIGGER B: V2 HYPER-AGGRESSIVE FALLBACK
            const lastWinner = h[h.length - 1];
            const last10 = h.slice(-10);
            if (h.slice(-3).every(x => x === lastWinner)) return { win: lastWinner, reason: "V2 STREAK" };
            if (last10.filter(x => x === "A").length >= 7) return { win: "A", reason: "V2 A-BIAS" };
            if (last10.filter(x => x === "B").length >= 7) return { win: "B", reason: "V2 B-BIAS" };
            
            return { win: lastWinner === "A" ? "B" : "A", reason: "V2 TURBO CHOP" };
        }

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

        /* ---------------- UI UPDATER ---------------- */
        function updateEngineUI() {
            const data = window.tpLogs, stats = window.tpStats, total = stats.wins + stats.losses, rate = total > 0 ? ((stats.wins / total) * 100).toFixed(1) : 0, storage = getStorageStats();
            const keyS = DYNAMIC_SECRET_KEY ? `<span style="color:#0f0">KEY LOCKED</span>` : `<span style="color:#f00;animation:blink 1s infinite;">SNIFFING...</span>`;
            
            let displayWin = "WAITING...", displayReason = "STANDBY";
            if (activePrediction) { displayWin = activePrediction.win === "WAIT" ? "WAITING..." : "PLAYER " + activePrediction.win; displayReason = activePrediction.reason; }
            if (document.getElementById('dl-btn')) document.getElementById('dl-btn').innerHTML = `💾 DOWNLOAD LOG (${data.length})`;
            const intelEl = document.getElementById('tp-intel-box');
            if (!intelEl) return;
            intelEl.style.borderColor = stats.streak >= 2 ? "#0f0" : (stats.streak <= -2 ? "#f00" : "#00ff00");
            intelEl.innerHTML = `
                <div style="display:flex;justify-content:space-between;border-bottom:1px solid #333;padding-bottom:5px;margin-bottom:8px;"><b style="color:#f0f;">V11.5 SHANKARA (VIEW)</b><span style="font-size:10px;color:#888;">${storage.percent}%</span></div>
                <div style="text-align:center;font-size:10px;margin-bottom:5px;">${keyS}</div>
                <div style="text-align:center;margin-bottom:10px;">
                    <span style="font-size:24px;color:${activePrediction?.win === 'A' ? '#ff4444' : (activePrediction?.win === 'B' ? '#44aaff' : '#ffff00')};font-weight:bold;">${displayWin}</span><br>
                    <span style="font-size:11px;color:#ffd700;">MODE: ${displayReason}</span>
                </div>
                <div style="background:#111;padding:8px;border-radius:6px;border:1px solid #333;">
                    <div style="display:flex;justify-content:space-between;font-size:11px;"><span>W: ${stats.wins} | L: ${stats.losses}</span><span style="font-weight:bold;">${rate}%</span></div>
                    <div style="text-align:center;margin-top:5px;"><span style="font-size:18px;color:#ffd700;font-weight:bold;">${stats.units.toFixed(2)} U</span></div>
                </div>
                <div style="text-align:center;font-size:10px;color:#666;margin-top:5px;">DB: ${data.length} | Trades: ${total}</div>
            `;
        }

        /* ---------------- CENTRAL LOGGING LOGIC ---------------- */
        function recordRound(mid, winner) {
            if (!mid || winner === "TIE" || window.tpLogs.some(r => String(r.mid) === String(mid))) return;

            const h = window.tpLogs.map(r => r.winner).filter(x => x === "A" || x === "B");
            
            if (h.length >= 10) {
                const simPred = getTurboPrediction(window.tpLogs);
                if (simPred.win !== "WAIT") {
                    if (simPred.win === winner) { window.tpStats.wins++; window.tpStats.units += 0.98; window.tpStats.streak = Math.max(1, window.tpStats.streak + 1); }
                    else { window.tpStats.losses++; window.tpStats.units -= 1.0; window.tpStats.streak = Math.min(-1, window.tpStats.streak - 1); }
                }
                const rP = { markov: getMarkov(h), diff: getDiff(h), bias: getBias(h), fade: getFade(h), rider: getRider(h) };
                window.engineMemory.markov.push(rP.markov === winner); window.engineMemory.diff.push(rP.diff === winner); window.engineMemory.bias.push(rP.bias === winner); window.engineMemory.fade.push(rP.fade === winner); window.engineMemory.rider.push(rP.rider === winner);
            }

            window.tpLogs.push({ mid: String(mid), winner });
            saveData();
            updateEngineUI();
        }

        /* ---------------- PAYLOAD SCANNER ---------------- */
        const processPayload = (data) => {
            if (!data) return;
            const traverse = (n) => {
                if (!n || typeof n !== 'object') return;
                if (n.res && Array.isArray(n.res)) { n.res.slice().reverse().forEach(r => { if (r.mid && r.win) recordRound(r.mid, String(r.win) === "1" ? "A" : (String(r.win) === "2" ? "B" : "TIE")); }); }
                if (n.mid) {
                    if (String(n.mid) !== activeMid) { activeMid = String(n.mid); activePrediction = getTurboPrediction(window.tpLogs); updateEngineUI(); }
                    if (n.win && (String(n.win) === "1" || String(n.win) === "2")) recordRound(n.mid, String(n.win) === "1" ? "A" : "B");
                    else if (n.card && n.card.split(',').length === 6 && !n.card.includes("1")) recordRound(n.mid, calculateWin(n.card));
                }
                for (let k in n) traverse(n[k]);
            };
            traverse(data);
        };

        /* ---------------- NETWORK HOOKS ---------------- */
        const originalFetch = window.fetch;
        window.fetch = async function (...args) {
            const resp = await originalFetch.apply(this, args);
            try { resp.clone().json().then(json => {
                if (json && typeof json.data === 'string' && json.data.startsWith("U2FsdGVkX1") && DYNAMIC_SECRET_KEY) {
                    const dec = JSON.parse(CryptoJS.AES.decrypt(json.data, DYNAMIC_SECRET_KEY).toString(CryptoJS.enc.Utf8));
                    processPayload(dec.original?.data || dec.data || dec);
                } else processPayload(json);
            }); } catch (e) { } return resp;
        };

        const originalXHR = window.XMLHttpRequest.prototype.open;
        window.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
            this.addEventListener('load', function () {
                try {
                    const json = JSON.parse(this.responseText);
                    if (json && typeof json.data === 'string' && json.data.startsWith("U2FsdGVkX1") && DYNAMIC_SECRET_KEY) {
                        const dec = JSON.parse(CryptoJS.AES.decrypt(json.data, DYNAMIC_SECRET_KEY).toString(CryptoJS.enc.Utf8));
                        processPayload(dec.original?.data || dec.data || dec);
                    } else processPayload(json);
                } catch (e) { }
            });
            originalXHR.call(this, method, url, ...rest);
        };

        /* ---------------- KEY SNIFFER ---------------- */
        const cs = ["webpackChunkfront", "webpackChunk_N_E", "webpackJsonp"];
        cs.forEach(c => { if (window[c]) { window[c].push([[99999], {}, function (e) {
            for (let m in e.m) { try { let mod = e(m); if (mod && mod.AES && mod.AES.decrypt) {
                const orig = mod.AES.decrypt; mod.AES.decrypt = function (cipher, key) {
                    if (!DYNAMIC_SECRET_KEY && key) { DYNAMIC_SECRET_KEY = key.toString(); updateEngineUI(); }
                    return orig.apply(this, arguments);
                };
            } } catch (err) { } }
        }]); } });

        /* ---------------- ISOLATED BACKFILL ---------------- */
        function performBackfill() {
            const raw = JSON.parse(localStorage.getItem(LOGS_KEY)) || [];
            window.tpLogs = []; window.tpStats = { wins: 0, losses: 0, streak: 0, units: 0 }; window.engineMemory = { markov: [], diff: [], bias: [], fade: [], rider: [] };
            raw.forEach(r => recordRound(r.mid, r.winner));
            saveData(); updateEngineUI();
        }

        performBackfill();
        console.log("%c V11.5 SHANKARA HYBRID TURBO (VIEW-ONLY) LOADED ", "color:#f0f;font-weight:bold;");
    }
})();









// place Order
(function () {
    if (typeof CryptoJS === 'undefined') {
        let script = document.createElement('script');
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js";
        script.onload = runSuite;
        document.head.appendChild(script);
    } else { runSuite(); }

    function runSuite() {
        const existingUi = document.getElementById("tp-automation-ui");
        if (existingUi) existingUi.remove();

        const LOGS_KEY = 'shankara_tp_logs';
        const STATS_KEY = 'shankara_tp_stats';
        
        window.tpLogs = [];
        window.tpStats = { wins: 0, losses: 0, streak: 0, units: 0 };
        window.engineMemory = { markov: [], diff: [], bias: [], fade: [], rider: [] };
        
        let activeMid = null, activePrediction = null, DYNAMIC_SECRET_KEY = null;

        const saveData = () => {
            localStorage.setItem(LOGS_KEY, JSON.stringify(window.tpLogs));
            localStorage.setItem(STATS_KEY, JSON.stringify(window.tpStats));
        };

        const getStorageStats = () => {
            let total = 0;
            for (let x in localStorage) { if (localStorage.hasOwnProperty(x)) total += ((localStorage[x].length + x.length) * 2); }
            return { percent: (((total / 1024) / 5120) * 100).toFixed(2) };
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
            const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `shankara_hybrid_turbo.csv`; link.click();
        };
        container.appendChild(dlBtn);

        const clearBtn = document.createElement("button");
        clearBtn.innerHTML = "🗑️ WIPE ALL DATA";
        clearBtn.style = "padding:5px;background:#ff4444;color:#fff;border:none;cursor:pointer;font-size:10px;border-radius:4px;font-weight:bold;";
        clearBtn.onclick = () => {
            if (confirm("Wipe all data and PNL?")) { 
                window.tpLogs = []; window.tpStats = { wins: 0, losses: 0, streak: 0, units: 0 }; 
                window.engineMemory = { markov: [], diff: [], bias: [], fade: [], rider: [] };
                activePrediction = null; saveData(); updateEngineUI(); 
            }
        };
        container.appendChild(clearBtn);

        const intelBox = document.createElement("div");
        intelBox.id = "tp-intel-box";
        intelBox.style = "background:#000;color:#00ff00;padding:15px;border-radius:8px;font-size:12px;border:2px solid #00ff00;box-shadow:0 0 15px rgba(0,255,0,0.3);line-height:1.6;user-select:none;";
        container.appendChild(intelBox);

        /* ---------------- CORE V11.2 MATH ---------------- */
        function getMarkov(h) { if (h.length < 5) return "A"; let counts = { AAA: 1, AAB: 1, ABA: 1, ABB: 1, BAA: 1, BAB: 1, BBA: 1, BBB: 1 }; for (let i = 2; i < h.length; i++) { const k = h[i-2] + h[i-1] + h[i]; if (counts[k]) counts[k]++; } const l2 = h.slice(-2).join(""); return counts[l2+"A"] > counts[l2+"B"] ? "A" : "B"; }
        function getDiff(h) { if (h.length < 5) return "A"; const deltas = h.slice(1).map((v, i) => v === h[i] ? "S" : "D"); let counts = { S: 1, D: 1 }; const l2d = deltas.slice(-2).join(""); for (let i = 2; i < deltas.length; i++) { if (deltas[i-2] + deltas[i-1] === l2d) counts[deltas[i]]++; } const nextD = counts.S > counts.D ? "S" : "D"; return nextD === "S" ? h[h.length-1] : (h[h.length-1] === "A" ? "B" : "A"); }
        function getBias(h) { return h.slice(-20).filter(x => x === "A").length > 10 ? "A" : "B"; }
        function getFade(h) { let streak = 1; const last = h[h.length-1]; for (let i = h.length-2; i >= 0; i--) { if (h[i] === last) streak++; else break; } return streak >= 3 ? (last === "A" ? "B" : "A") : last; }
        function getRider(h) { let streak = 1; const last = h[h.length-1]; for (let i = h.length-2; i >= 0; i--) { if (h[i] === last) streak++; else break; } return streak >= 2 ? last : (last === "B" ? "A" : "B"); }

        /* ---------------- V11.5 HYBRID TURBO ENGINE (100% PARTICIPATION) ---------------- */
        function getTurboPrediction(data) {
            const h = data.map(r => r.winner).filter(w => w === 'A' || w === 'B');
            if (h.length < 10) return { win: "WAIT", reason: "COLLECTING" };

            const preds = { markov: getMarkov(h), diff: getDiff(h), bias: getBias(h), fade: getFade(h), rider: getRider(h) };
            const getAcc = (arr) => { const slice = arr.slice(-15); return slice.length === 0 ? 0 : slice.filter(Boolean).length / slice.length; };
            const accs = { markov: getAcc(window.engineMemory.markov), diff: getAcc(window.engineMemory.diff), bias: getAcc(window.engineMemory.bias), fade: getAcc(window.engineMemory.fade), rider: getAcc(window.engineMemory.rider) };
            
            let bestEngine = null, maxAcc = 0;
            for (const [engine, acc] of Object.entries(accs)) { if (acc > maxAcc) { maxAcc = acc; bestEngine = engine; } }

            // TRIGGER A: HIGH CONFIDENCE (V11.2 Math)
            if (maxAcc >= 0.60 && bestEngine) return { win: preds[bestEngine], reason: `${bestEngine.toUpperCase()} (HOT)` };

            // TRIGGER B: V2 HYPER-AGGRESSIVE FALLBACK
            const lastWinner = h[h.length - 1];
            const last10 = h.slice(-10);
            if (h.slice(-3).every(x => x === lastWinner)) return { win: lastWinner, reason: "V2 STREAK" };
            if (last10.filter(x => x === "A").length >= 7) return { win: "A", reason: "V2 A-BIAS" };
            if (last10.filter(x => x === "B").length >= 7) return { win: "B", reason: "V2 B-BIAS" };
            
            return { win: lastWinner === "A" ? "B" : "A", reason: "V2 TURBO CHOP" };
        }

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

        /* ---------------- AUTO-BET EXECUTION ---------------- */
        function executeWager() {
            let attempts = 0; const slip = setInterval(() => {
                attempts++; if (attempts > 20) { clearInterval(slip); return; }
                const stake = document.querySelector('input[placeholder="Enter Stake"]'), sub = document.querySelector('.p-4.bg-card.border-t button');
                if (stake && sub && stake.offsetParent !== null) {
                    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                    setter.call(stake, "250"); // <--- STAKE AMOUNT
                    stake.dispatchEvent(new Event('input', { bubbles: true })); stake.dispatchEvent(new Event('change', { bubbles: true }));
                    setTimeout(() => { if (!sub.disabled) sub.click(); }, 350); clearInterval(slip);
                }
            }, 100);
        }

        function clickBet(side) {
            if (side !== "A" && side !== "B") return;
            const target = "Player " + side, scan = setInterval(() => {
                const containers = document.querySelectorAll('.bg-background.border-2.overflow-hidden');
                for (let c of containers) { if (c.innerText.includes(target)) {
                    const backBtn = c.querySelector('.bg-back');
                    if (backBtn && !backBtn.classList.contains('cursor-not-allowed')) { clearInterval(scan); setTimeout(() => { backBtn.click(); executeWager(); }, 1800); return; }
                } }
            }, 500); setTimeout(() => clearInterval(scan), 15000); 
        }

        /* ---------------- UI UPDATER ---------------- */
        function updateEngineUI() {
            const data = window.tpLogs, stats = window.tpStats, total = stats.wins + stats.losses, rate = total > 0 ? ((stats.wins / total) * 100).toFixed(1) : 0, storage = getStorageStats();
            const keyS = DYNAMIC_SECRET_KEY ? `<span style="color:#0f0">KEY LOCKED</span>` : `<span style="color:#f00;animation:blink 1s infinite;">SNIFFING...</span>`;
            
            let displayWin = "WAITING...", displayReason = "STANDBY";
            if (activePrediction) { displayWin = activePrediction.win === "WAIT" ? "WAITING..." : "PLAYER " + activePrediction.win; displayReason = activePrediction.reason; }
            if (document.getElementById('dl-btn')) document.getElementById('dl-btn').innerHTML = `💾 DOWNLOAD LOG (${data.length})`;
            const intelEl = document.getElementById('tp-intel-box');
            if (!intelEl) return;
            intelEl.style.borderColor = stats.streak >= 2 ? "#0f0" : (stats.streak <= -2 ? "#f00" : "#00ff00");
            intelEl.innerHTML = `
                <div style="display:flex;justify-content:space-between;border-bottom:1px solid #333;padding-bottom:5px;margin-bottom:8px;"><b style="color:#f0f;">V11.5 SHANKARA (AUTO-BET)</b><span style="font-size:10px;color:#888;">${storage.percent}%</span></div>
                <div style="text-align:center;font-size:10px;margin-bottom:5px;">${keyS}</div>
                <div style="text-align:center;margin-bottom:10px;">
                    <span style="font-size:24px;color:${activePrediction?.win === 'A' ? '#ff4444' : (activePrediction?.win === 'B' ? '#44aaff' : '#ffff00')};font-weight:bold;">${displayWin}</span><br>
                    <span style="font-size:11px;color:#ffd700;">MODE: ${displayReason}</span>
                </div>
                <div style="background:#111;padding:8px;border-radius:6px;border:1px solid #333;">
                    <div style="display:flex;justify-content:space-between;font-size:11px;"><span>W: ${stats.wins} | L: ${stats.losses}</span><span style="font-weight:bold;">${rate}%</span></div>
                    <div style="text-align:center;margin-top:5px;"><span style="font-size:18px;color:#ffd700;font-weight:bold;">${stats.units.toFixed(2)} U</span></div>
                </div>
                <div style="text-align:center;font-size:10px;color:#666;margin-top:5px;">DB: ${data.length} | Trades: ${total}</div>
            `;
        }

        /* ---------------- CENTRAL LOGGING LOGIC ---------------- */
        function recordRound(mid, winner) {
            if (!mid || winner === "TIE" || window.tpLogs.some(r => String(r.mid) === String(mid))) return;

            const h = window.tpLogs.map(r => r.winner).filter(x => x === "A" || x === "B");
            
            if (h.length >= 10) {
                const simPred = getTurboPrediction(window.tpLogs);
                if (simPred.win !== "WAIT") {
                    if (simPred.win === winner) { window.tpStats.wins++; window.tpStats.units += 0.98; window.tpStats.streak = Math.max(1, window.tpStats.streak + 1); }
                    else { window.tpStats.losses++; window.tpStats.units -= 1.0; window.tpStats.streak = Math.min(-1, window.tpStats.streak - 1); }
                }
                const rP = { markov: getMarkov(h), diff: getDiff(h), bias: getBias(h), fade: getFade(h), rider: getRider(h) };
                window.engineMemory.markov.push(rP.markov === winner); window.engineMemory.diff.push(rP.diff === winner); window.engineMemory.bias.push(rP.bias === winner); window.engineMemory.fade.push(rP.fade === winner); window.engineMemory.rider.push(rP.rider === winner);
            }

            window.tpLogs.push({ mid: String(mid), winner });
            saveData();
            updateEngineUI();
        }

        /* ---------------- PAYLOAD SCANNER ---------------- */
        const processPayload = (data) => {
            if (!data) return;
            const traverse = (n) => {
                if (!n || typeof n !== 'object') return;
                if (n.res && Array.isArray(n.res)) { n.res.slice().reverse().forEach(r => { if (r.mid && r.win) recordRound(r.mid, String(r.win) === "1" ? "A" : (String(r.win) === "2" ? "B" : "TIE")); }); }
                if (n.mid) {
                    if (String(n.mid) !== activeMid) { activeMid = String(n.mid); activePrediction = getTurboPrediction(window.tpLogs); updateEngineUI(); if (activePrediction.win !== "WAIT") clickBet(activePrediction.win); }
                    if (n.win && (String(n.win) === "1" || String(n.win) === "2")) recordRound(n.mid, String(n.win) === "1" ? "A" : "B");
                    else if (n.card && n.card.split(',').length === 6 && !n.card.includes("1")) recordRound(n.mid, calculateWin(n.card));
                }
                for (let k in n) traverse(n[k]);
            };
            traverse(data);
        };

        /* ---------------- NETWORK HOOKS ---------------- */
        const originalFetch = window.fetch;
        window.fetch = async function (...args) {
            const resp = await originalFetch.apply(this, args);
            try { resp.clone().json().then(json => {
                if (json && typeof json.data === 'string' && json.data.startsWith("U2FsdGVkX1") && DYNAMIC_SECRET_KEY) {
                    const dec = JSON.parse(CryptoJS.AES.decrypt(json.data, DYNAMIC_SECRET_KEY).toString(CryptoJS.enc.Utf8));
                    processPayload(dec.original?.data || dec.data || dec);
                } else processPayload(json);
            }); } catch (e) { } return resp;
        };

        const originalXHR = window.XMLHttpRequest.prototype.open;
        window.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
            this.addEventListener('load', function () {
                try {
                    const json = JSON.parse(this.responseText);
                    if (json && typeof json.data === 'string' && json.data.startsWith("U2FsdGVkX1") && DYNAMIC_SECRET_KEY) {
                        const dec = JSON.parse(CryptoJS.AES.decrypt(json.data, DYNAMIC_SECRET_KEY).toString(CryptoJS.enc.Utf8));
                        processPayload(dec.original?.data || dec.data || dec);
                    } else processPayload(json);
                } catch (e) { }
            });
            originalXHR.call(this, method, url, ...rest);
        };

        /* ---------------- AES KEY SNIFFER ---------------- */
        const cs = ["webpackChunkfront", "webpackChunk_N_E", "webpackJsonp"];
        cs.forEach(c => { if (window[c]) { window[c].push([[99999], {}, function (e) {
            for (let m in e.m) { try { let mod = e(m); if (mod && mod.AES && mod.AES.decrypt) {
                const orig = mod.AES.decrypt; mod.AES.decrypt = function (cipher, key) {
                    if (!DYNAMIC_SECRET_KEY && key) { DYNAMIC_SECRET_KEY = key.toString(); updateEngineUI(); }
                    return orig.apply(this, arguments);
                };
            } } catch (err) { } }
        }]); } });

        /* ---------------- ISOLATED BACKFILL ---------------- */
        function performBackfill() {
            const raw = JSON.parse(localStorage.getItem(LOGS_KEY)) || [];
            window.tpLogs = []; window.tpStats = { wins: 0, losses: 0, streak: 0, units: 0 }; window.engineMemory = { markov: [], diff: [], bias: [], fade: [], rider: [] };
            raw.forEach(r => recordRound(r.mid, r.winner));
            saveData(); updateEngineUI();
        }

        performBackfill();
        console.log("%c V11.5 SHANKARA HYBRID TURBO (AUTO-BET) LOADED ", "color:#f0f;font-weight:bold;");
    }
})();