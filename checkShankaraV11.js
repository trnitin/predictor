// (function () {
//     const existingUi = document.getElementById("tp-automation-ui");
//     if (existingUi) existingUi.remove();

//     // Dual-Platform Storage Keys
//     const LOGS_KEY = window.location.href.includes('lords') ? '1day_teenpatti_logs' : 'shankara_tp_logs';
//     const STATS_KEY = window.location.href.includes('lords') ? '1day_teenpatti_stats' : 'shankara_tp_stats';
    
//     window.tpLogs = JSON.parse(localStorage.getItem(LOGS_KEY)) || [];
//     window.tpStats = { wins: 0, losses: 0, units: 0 }; 
    
//     // 5 Independent Engines
//     window.engineMemory = { markov: [], diff: [], bias: [], fade: [], rider: [] };
    
//     let activeMid = null, activePrediction = null, DYNAMIC_SECRET_KEY = null;

//     const saveData = () => {
//         localStorage.setItem(LOGS_KEY, JSON.stringify(window.tpLogs));
//         localStorage.setItem(STATS_KEY, JSON.stringify(window.tpStats));
//     };

//     // --- UI CONSTRUCTION ---
//     const container = document.createElement("div");
//     container.id = "tp-automation-ui";
//     container.style = "position:fixed;top:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:8px;font-family:monospace;width:250px;";
//     document.body.appendChild(container);

//     const dlBtn = document.createElement("button");
//     dlBtn.id = "dl-btn";
//     dlBtn.style = "padding:12px;background:#ffd700;color:#000;border:2px solid #000;cursor:pointer;font-weight:bold;border-radius:4px;";
//     dlBtn.onclick = () => {
//         const content = window.tpLogs.map(r => `${r.mid},${r.winner}`).join("\n");
//         const blob = new Blob([content], { type: "text/plain" });
//         const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `v11_2_high_volume.csv`; link.click();
//     };
//     container.appendChild(dlBtn);

//     const clearBtn = document.createElement("button");
//     clearBtn.innerHTML = "🗑️ WIPE MEMORY & STATS";
//     clearBtn.style = "padding:5px;background:#ff4444;color:#fff;border:none;cursor:pointer;font-size:10px;border-radius:4px;font-weight:bold;";
//     clearBtn.onclick = () => {
//         if (confirm("Wipe all data?")) { 
//             window.tpLogs = []; window.tpStats = { wins: 0, losses: 0, units: 0 }; 
//             window.engineMemory = { markov: [], diff: [], bias: [], fade: [], rider: [] };
//             activePrediction = null; saveData(); updateEngineUI(); 
//         }
//     };
//     container.appendChild(clearBtn);

//     const intelBox = document.createElement("div");
//     intelBox.id = "tp-intel-box";
//     intelBox.style = "background:#000;color:#00ff00;padding:15px;border-radius:8px;font-size:12px;border:2px solid #00ff00;box-shadow:0 0 15px rgba(0,255,0,0.3);line-height:1.6;";
//     container.appendChild(intelBox);

//     /* ---------------- POKER EVALUATOR ---------------- */
//     function calculateWin(cStr) {
//         const cs = cStr.split(',');
//         const pC = c => { let rS = c.substring(0, c.length - 2); let ranks = { "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, "J": 11, "Q": 12, "K": 13, "A": 14 }; return { r: ranks[rS] || 0, s: c.slice(-2) }; };
//         const gS = (h) => {
//             h.sort((a, b) => b.r - a.r);
//             let isS = (h[0].r === h[1].r + 1 && h[1].r === h[2].r + 1) || (h[0].r === 14 && h[1].r === 3 && h[2].r === 2);
//             const tie = (h[0].r * 10000) + (h[1].r * 100) + h[2].r;
//             if (h[0].r === h[1].r && h[1].r === h[2].r) return 60000000 + tie;
//             if (isS && h[0].s === h[1].s && h[1].s === h[2].s) return 50000000 + tie;
//             if (isS) return 40000000 + tie;
//             if (h[0].s === h[1].s && h[1].s === h[2].s) return 30000000 + tie;
//             if (h[0].r === h[1].r || h[1].r === h[2].r) return 20000000 + tie;
//             return 10000000 + tie;
//         };
//         let sA = gS([pC(cs[0]), pC(cs[2]), pC(cs[4])]), sB = gS([pC(cs[1]), pC(cs[3]), pC(cs[5])]);
//         return sA > sB ? "A" : (sB > sA ? "B" : "TIE");
//     }

//     /* ---------------- THE 5 SUB-ENGINES ---------------- */
//     function getMarkov(h) {
//         if (h.length < 5) return "A";
//         let counts = { AAA: 1, AAB: 1, ABA: 1, ABB: 1, BAA: 1, BAB: 1, BBA: 1, BBB: 1 };
//         for (let i = 2; i < h.length; i++) { const k = h[i-2] + h[i-1] + h[i]; if (counts[k]) counts[k]++; }
//         const l2 = h.slice(-2).join(""); 
//         return counts[l2+"A"] > counts[l2+"B"] ? "A" : "B"; 
//     }

//     function getDiff(h) {
//         if (h.length < 5) return "A";
//         const deltas = h.slice(1).map((v, i) => v === h[i] ? "S" : "D");
//         let counts = { S: 1, D: 1 };
//         const l2d = deltas.slice(-2).join("");
//         for (let i = 2; i < deltas.length; i++) { if (deltas[i-2] + deltas[i-1] === l2d) counts[deltas[i]]++; }
//         const nextD = counts.S > counts.D ? "S" : "D";
//         return nextD === "S" ? h[h.length-1] : (h[h.length-1] === "A" ? "B" : "A");
//     }

//     function getBias(h) {
//         const slice = h.slice(-20);
//         return slice.filter(x => x === "A").length > (slice.length / 2) ? "A" : "B";
//     }

//     function getFade(h) {
//         let streak = 1; const last = h[h.length-1];
//         for (let i = h.length-2; i >= 0; i--) { if (h[i] === last) streak++; else break; }
//         return streak >= 3 ? (last === "A" ? "B" : "A") : last;
//     }

//     function getRider(h) {
//         let streak = 1; const last = h[h.length-1];
//         for (let i = h.length-2; i >= 0; i--) { if (h[i] === last) streak++; else break; }
//         return streak >= 2 ? last : (last === "B" ? "A" : "B");
//     }

//     /* ---------------- V11.2 HIGH-VOLUME CONTROLLER ---------------- */
//     function getOraclePrediction(h, mem) {
//         if (h.length < 25) return { win: "WAIT", reason: "TRAINING ENGINES" };

//         const preds = {
//             markov: getMarkov(h), diff: getDiff(h),
//             bias: getBias(h), fade: getFade(h), rider: getRider(h)
//         };

//         const getAcc = (arr) => {
//             const slice = arr.slice(-15);
//             return slice.length === 0 ? 0 : slice.filter(Boolean).length / slice.length;
//         };

//         const accs = {
//             markov: getAcc(mem.markov), diff: getAcc(mem.diff),
//             bias: getAcc(mem.bias), fade: getAcc(mem.fade), rider: getAcc(mem.rider)
//         };

//         let bestEngine = null; let maxAcc = 0;
//         for (const [engine, acc] of Object.entries(accs)) {
//             if (acc > maxAcc) { maxAcc = acc; bestEngine = engine; }
//         }

//         // LOWERED GATE: 60% Accuracy required for high volume
//         if (maxAcc >= 0.60 && bestEngine) {
//             return { win: preds[bestEngine], reason: `${bestEngine.toUpperCase()} HOT (${Math.round(maxAcc*100)}%)` };
//         }

//         return { win: "WAIT", reason: `NO ENGINE HOT (Max ${Math.round(maxAcc*100)}%)` };
//     }

//     /* ---------------- BACKFILL ENGINE ---------------- */
//     function performBackfill() {
//         window.tpStats = { wins: 0, losses: 0, units: 0 };
//         window.engineMemory = { markov: [], diff: [], bias: [], fade: [], rider: [] };
        
//         for (let i = 25; i < window.tpLogs.length; i++) {
//             const h = window.tpLogs.slice(0, i).map(r => r.winner).filter(x => x === "A" || x === "B");
//             const winner = window.tpLogs[i].winner;
//             if (winner === "TIE") continue;

//             const predData = getOraclePrediction(h, window.engineMemory);
            
//             if (predData.win !== "WAIT") {
//                 if (predData.win === winner) { window.tpStats.wins++; window.tpStats.units += 0.98; }
//                 else { window.tpStats.losses++; window.tpStats.units -= 1.0; }
//             }

//             const rP = { markov: getMarkov(h), diff: getDiff(h), bias: getBias(h), fade: getFade(h), rider: getRider(h) };
//             window.engineMemory.markov.push(rP.markov === winner);
//             window.engineMemory.diff.push(rP.diff === winner);
//             window.engineMemory.bias.push(rP.bias === winner);
//             window.engineMemory.fade.push(rP.fade === winner);
//             window.engineMemory.rider.push(rP.rider === winner);
//         }
//         updateEngineUI();
//         saveData();
//     }

//     /* ---------------- LIVE HANDLERS ---------------- */
//     function recordRound(mid, winner) {
//         if (!mid || winner === "TIE") return;
//         if (window.tpLogs.some(r => String(r.mid) === String(mid))) return;

//         const h = window.tpLogs.map(r => r.winner).filter(x => x === "A" || x === "B");
//         const predData = getOraclePrediction(h, window.engineMemory);
        
//         if (predData.win !== "WAIT") {
//             if (predData.win === winner) { window.tpStats.wins++; window.tpStats.units += 0.98; }
//             else { window.tpStats.losses++; window.tpStats.units -= 1.0; }
//         }

//         const rP = { markov: getMarkov(h), diff: getDiff(h), bias: getBias(h), fade: getFade(h), rider: getRider(h) };
//         window.engineMemory.markov.push(rP.markov === winner);
//         window.engineMemory.diff.push(rP.diff === winner);
//         window.engineMemory.bias.push(rP.bias === winner);
//         window.engineMemory.fade.push(rP.fade === winner);
//         window.engineMemory.rider.push(rP.rider === winner);
        
//         window.tpLogs.push({ mid: String(mid), winner: winner });
//         saveData();
//     }

//     function updateEngineUI() {
//         const total = window.tpStats.wins + window.tpStats.losses;
//         const rate = total > 0 ? ((window.tpStats.wins / total) * 100).toFixed(1) : 0;
//         const keyS = DYNAMIC_SECRET_KEY ? `<span style="color:#0f0">KEY LOCKED</span>` : (window.location.href.includes('lords') ? `<span style="color:#0f0">LORDS ACTIVE</span>` : `<span style="color:#f00;animation:blink 1s infinite;">SNIFFING...</span>`);
        
//         let wStr = "WAITING...", rStr = "STANDBY";
//         if (activePrediction) {
//             wStr = activePrediction.win === "WAIT" ? "WAITING..." : "PLAYER " + activePrediction.win;
//             rStr = activePrediction.reason;
//         }

//         intelBox.innerHTML = `
//             <style>@keyframes blink { 50% { opacity: 0; } }</style>
//             <b style="color:#0ff;">V11.2 HIGH-VOLUME ORACLE</b><br>
//             <div style="text-align:center;font-size:10px;">${keyS}</div>
//             <div style="text-align:center;padding:10px;">
//                 <span style="font-size:24px;color:${activePrediction?.win === 'A' ? '#f44' : (activePrediction?.win === 'B' ? '#4af' : '#ff0')};font-weight:bold;">
//                     ${wStr}
//                 </span><br>
//                 <span style="font-size:11px;color:#ffd700;">${rStr}</span>
//             </div>
//             <div style="background:#111;padding:8px;border-radius:6px;font-size:11px;">
//                 W: ${window.tpStats.wins} | L: ${window.tpStats.losses} | <b>${rate}%</b><br>
//                 PNL: <b style="color:#ffd700;">${window.tpStats.units.toFixed(2)} U</b>
//             </div>
//             <div style="font-size:9px;color:#666;margin-top:4px;">DB: ${window.tpLogs.length} | Trades: ${total}</div>
//         `;
//         if(document.getElementById('dl-btn')) document.getElementById('dl-btn').innerHTML = `💾 DOWNLOAD LOG (${window.tpLogs.length})`;
//     }

//     // --- NETWORK HOOK (UNIVERSAL: SHANKARA & LORDS) ---
//     const originalFetch = window.fetch;
//     window.fetch = async function (...args) {
//         const resp = await originalFetch.apply(this, args);
//         try { resp.clone().json().then(json => {
//             const processPayload = (data) => {
//                 if (data.res && Array.isArray(data.res)) {
//                     data.res.reverse().forEach(r => recordRound(r.mid, r.win === "1" ? "A" : (r.win === "2" ? "B" : "TIE")));
//                 } else if (data.mid && data.card) {
//                     if (String(data.mid) !== activeMid) { 
//                         activeMid = String(data.mid);
//                         const h = window.tpLogs.map(r => r.winner).filter(x => x === "A" || x === "B");
//                         activePrediction = getOraclePrediction(h, window.engineMemory);
//                         updateEngineUI();
//                     }
//                     if (data.card.split(',').length === 6 && !data.card.includes("1")) recordRound(data.mid, calculateWin(data.card));
//                 }
//             };

//             if (json && typeof json.data === 'string' && json.data.startsWith("U2FsdGVkX1") && DYNAMIC_SECRET_KEY) {
//                 const dec = JSON.parse(CryptoJS.AES.decrypt(json.data, DYNAMIC_SECRET_KEY).toString(CryptoJS.enc.Utf8));
//                 processPayload(dec.original?.data || dec.data);
//             } else {
//                 const traverse = (n) => {
//                     if (!n || typeof n !== 'object') return;
//                     if (n.mid && n.card) processPayload(n);
//                     if (Array.isArray(n) && n.length && n[0].mid && n[0].win) processPayload({res: n});
//                     for (let k in n) traverse(n[k]);
//                 };
//                 traverse(json);
//             }
//             updateEngineUI();
//         }); } catch (e) { } return resp;
//     };

//     if (!window.location.href.includes('lords')) {
//         const cs = ["webpackChunkfront", "webpackChunk_N_E", "webpackJsonp"];
//         cs.forEach(c => { if (window[c]) { window[c].push([[99999], {}, function (e) {
//             for (let m in e.m) { try { let mod = e(m); if (mod && mod.AES && mod.AES.decrypt) {
//                 const orig = mod.AES.decrypt; mod.AES.decrypt = function (cipher, key) {
//                     if (!DYNAMIC_SECRET_KEY && key) { DYNAMIC_SECRET_KEY = key.toString(); updateEngineUI(); }
//                     return orig.apply(this, arguments);
//                 };
//             } } catch (err) { } }
//         }]); } });
//     }

//     performBackfill();
//     console.log("%c V11.2 HIGH-VOLUME ORACLE (VIEW-ONLY) LOADED ", "color:#0f0;font-weight:bold;");
// })();



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
        
        window.tpLogs = JSON.parse(localStorage.getItem(LOGS_KEY)) || [];
        window.tpStats = { wins: 0, losses: 0, units: 0 }; 
        window.engineMemory = { markov: [], diff: [], bias: [], fade: [], rider: [] };
        
        let activeMid = null, activePrediction = null, DYNAMIC_SECRET_KEY = null;

        const saveData = () => {
            localStorage.setItem(LOGS_KEY, JSON.stringify(window.tpLogs));
            localStorage.setItem(STATS_KEY, JSON.stringify(window.tpStats));
        };

        // --- 1. UI CONSTRUCTION ---
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
            const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `shankara_v11_2_highvol.csv`; link.click();
        };
        container.appendChild(dlBtn);

        const clearBtn = document.createElement("button");
        clearBtn.innerHTML = "🗑️ WIPE MEMORY & STATS";
        clearBtn.style = "padding:5px;background:#ff4444;color:#fff;border:none;cursor:pointer;font-size:10px;border-radius:4px;font-weight:bold;";
        clearBtn.onclick = () => {
            if (confirm("Wipe all data?")) { 
                window.tpLogs = []; window.tpStats = { wins: 0, losses: 0, units: 0 }; 
                window.engineMemory = { markov: [], diff: [], bias: [], fade: [], rider: [] };
                activePrediction = null; saveData(); updateEngineUI(); 
            }
        };
        container.appendChild(clearBtn);

        const intelBox = document.createElement("div");
        intelBox.id = "tp-intel-box";
        intelBox.style = "background:#000;color:#00ff00;padding:15px;border-radius:8px;font-size:12px;border:2px solid #00ff00;box-shadow:0 0 15px rgba(0,255,0,0.3);line-height:1.6;";
        container.appendChild(intelBox);

        /* ---------------- 2. POKER EVALUATOR ---------------- */
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

        /* ---------------- 3. THE 5 SUB-ENGINES ---------------- */
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
            return slice.filter(x => x === "A").length > (slice.length / 2) ? "A" : "B";
        }

        function getFade(h) {
            let streak = 1; const last = h[h.length-1];
            for (let i = h.length-2; i >= 0; i--) { if (h[i] === last) streak++; else break; }
            return streak >= 3 ? (last === "A" ? "B" : "A") : last;
        }

        function getRider(h) {
            let streak = 1; const last = h[h.length-1];
            for (let i = h.length-2; i >= 0; i--) { if (h[i] === last) streak++; else break; }
            return streak >= 2 ? last : (last === "B" ? "A" : "B");
        }

        /* ---------------- 4. V11.2 HIGH-VOLUME CONTROLLER ---------------- */
        function getOraclePrediction(h, mem) {
            if (h.length < 25) return { win: "WAIT", reason: `TRAINING ENGINES (${h.length}/25)` };

            const preds = {
                markov: getMarkov(h), diff: getDiff(h),
                bias: getBias(h), fade: getFade(h), rider: getRider(h)
            };

            const getAcc = (arr) => {
                const slice = arr.slice(-15);
                return slice.length === 0 ? 0 : slice.filter(Boolean).length / slice.length;
            };

            const accs = {
                markov: getAcc(mem.markov), diff: getAcc(mem.diff),
                bias: getAcc(mem.bias), fade: getAcc(mem.fade), rider: getAcc(mem.rider)
            };

            let bestEngine = null; let maxAcc = 0;
            for (const [engine, acc] of Object.entries(accs)) {
                if (acc > maxAcc) { maxAcc = acc; bestEngine = engine; }
            }

            // High Volume Gate: 60% Accuracy required
            if (maxAcc >= 0.60 && bestEngine) {
                return { win: preds[bestEngine], reason: `${bestEngine.toUpperCase()} HOT (${Math.round(maxAcc*100)}%)` };
            }

            return { win: "WAIT", reason: `NO ENGINE HOT (Max ${Math.round(maxAcc*100)}%)` };
        }

        /* ---------------- 5. CENTRAL LOGGING LOGIC ---------------- */
        function recordRound(mid, winner) {
            if (!mid || winner === "TIE") return;
            
            // Prevent duplicate processing
            if (window.tpLogs.some(r => String(r.mid) === String(mid))) return;

            // Gather history PREVIOUS to this hand
            const h = window.tpLogs.map(r => r.winner).filter(x => x === "A" || x === "B");
            
            // Evaluate Prediction & Update Background Memory
            const predData = getOraclePrediction(h, window.engineMemory);
            
            if (predData.win !== "WAIT") {
                if (predData.win === winner) { window.tpStats.wins++; window.tpStats.units += 0.98; }
                else { window.tpStats.losses++; window.tpStats.units -= 1.0; }
            }

            const rP = { markov: getMarkov(h), diff: getDiff(h), bias: getBias(h), fade: getFade(h), rider: getRider(h) };
            window.engineMemory.markov.push(rP.markov === winner);
            window.engineMemory.diff.push(rP.diff === winner);
            window.engineMemory.bias.push(rP.bias === winner);
            window.engineMemory.fade.push(rP.fade === winner);
            window.engineMemory.rider.push(rP.rider === winner);
            
            // Save actual outcome
            window.tpLogs.push({ mid: String(mid), winner: winner });
            saveData();
            updateEngineUI();
        }

        /* ---------------- 6. BACKFILL ENGINE ---------------- */
        function performBackfill() {
            window.tpStats = { wins: 0, losses: 0, units: 0 };
            window.engineMemory = { markov: [], diff: [], bias: [], fade: [], rider: [] };
            
            const rawLogs = [...window.tpLogs];
            window.tpLogs = []; // Clear temporarily to simulate live stream
            
            for (let i = 0; i < rawLogs.length; i++) {
                recordRound(rawLogs[i].mid, rawLogs[i].winner);
            }
        }

        function updateEngineUI() {
            const total = window.tpStats.wins + window.tpStats.losses;
            const rate = total > 0 ? ((window.tpStats.wins / total) * 100).toFixed(1) : 0;
            const keyS = DYNAMIC_SECRET_KEY ? `<span style="color:#0f0">KEY LOCKED</span>` : `<span style="color:#f00;animation:blink 1s infinite;">SNIFFING...</span>`;
            
            let wStr = "WAITING...", rStr = "STANDBY";
            const h = window.tpLogs.map(r => r.winner).filter(x => x === "A" || x === "B");
            if (h.length >= 25) {
                activePrediction = getOraclePrediction(h, window.engineMemory);
                wStr = activePrediction.win === "WAIT" ? "WAITING..." : "PLAYER " + activePrediction.win;
                rStr = activePrediction.reason;
            }

            intelBox.innerHTML = `
                <style>@keyframes blink { 50% { opacity: 0; } }</style>
                <b style="color:#0ff;">V11.2 HIGH-VOL (SHANKARA)</b><br>
                <div style="text-align:center;font-size:10px;">${keyS}</div>
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

        // --- 7. AGGRESSIVE PAYLOAD SCANNER ---
        const processPayload = (data) => {
            if (!data) return;

            const traverse = (n) => {
                if (!n || typeof n !== 'object') return;
                
                // 1. Rip from nested History Arrays
                if (n.res && Array.isArray(n.res)) {
                    n.res.slice().reverse().forEach(r => {
                        if (r.mid && r.win && (r.win === "1" || r.win === "2")) {
                            recordRound(r.mid, r.win === "1" ? "A" : "B");
                        }
                    });
                } else if (Array.isArray(n) && n.length > 0 && n[0].mid && n[0].win) {
                    n.slice().reverse().forEach(r => {
                        if (r.mid && r.win && (r.win === "1" || r.win === "2")) {
                            recordRound(r.mid, r.win === "1" ? "A" : "B");
                        }
                    });
                }
                
                // 2. Rip from individual live hand data
                if (n.mid) {
                    if (String(n.mid) !== activeMid) {
                        activeMid = String(n.mid);
                        updateEngineUI();
                    }
                    if (n.win && (n.win === "1" || n.win === "2")) {
                        recordRound(n.mid, n.win === "1" ? "A" : "B");
                    } else if (n.card && n.card.split(',').length === 6 && !n.card.includes("1")) {
                        recordRound(n.mid, calculateWin(n.card));
                    }
                }
                
                for (let k in n) {
                    if (typeof n[k] === 'object') traverse(n[k]);
                }
            };
            traverse(data);
        };

        // --- 8. NETWORK HOOKS ---
        const originalFetch = window.fetch;
        window.fetch = async function (...args) {
            const resp = await originalFetch.apply(this, args);
            try { resp.clone().json().then(json => {
                if (json && typeof json.data === 'string' && json.data.startsWith("U2FsdGVkX1") && DYNAMIC_SECRET_KEY) {
                    const dec = JSON.parse(CryptoJS.AES.decrypt(json.data, DYNAMIC_SECRET_KEY).toString(CryptoJS.enc.Utf8));
                    processPayload(dec.original?.data || dec.data || dec);
                } else {
                    processPayload(json);
                }
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
                    } else {
                        processPayload(json);
                    }
                } catch (e) { }
            });
            originalXHR.call(this, method, url, ...rest);
        };

        // --- 9. AES KEY SNIFFER ---
        const cs = ["webpackChunkfront", "webpackChunk_N_E", "webpackJsonp"];
        cs.forEach(c => { if (window[c]) { window[c].push([[99999], {}, function (e) {
            for (let m in e.m) { try { let mod = e(m); if (mod && mod.AES && mod.AES.decrypt) {
                const orig = mod.AES.decrypt; mod.AES.decrypt = function (cipher, key) {
                    if (!DYNAMIC_SECRET_KEY && key) { DYNAMIC_SECRET_KEY = key.toString(); updateEngineUI(); }
                    return orig.apply(this, arguments);
                };
            } } catch (err) { } }
        }]); } });

        performBackfill();
        console.log("%c V11.2 SHANKARA HIGH-VOLUME (BULLETPROOF LOGGING) LOADED ", "color:#0f0;font-weight:bold;");
    }
})();




// place order
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
        
        window.tpLogs = JSON.parse(localStorage.getItem(LOGS_KEY)) || [];
        window.tpStats = { wins: 0, losses: 0, units: 0 }; 
        window.engineMemory = { markov: [], diff: [], bias: [], fade: [], rider: [] };
        
        let activeMid = null, activePrediction = null, DYNAMIC_SECRET_KEY = null;

        const saveData = () => {
            localStorage.setItem(LOGS_KEY, JSON.stringify(window.tpLogs));
            localStorage.setItem(STATS_KEY, JSON.stringify(window.tpStats));
        };

        // --- 1. UI CONSTRUCTION ---
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
            const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `shankara_v11_2_autobet.csv`; link.click();
        };
        container.appendChild(dlBtn);

        const clearBtn = document.createElement("button");
        clearBtn.innerHTML = "🗑️ WIPE MEMORY & STATS";
        clearBtn.style = "padding:5px;background:#ff4444;color:#fff;border:none;cursor:pointer;font-size:10px;border-radius:4px;font-weight:bold;";
        clearBtn.onclick = () => {
            if (confirm("Wipe all data?")) { 
                window.tpLogs = []; window.tpStats = { wins: 0, losses: 0, units: 0 }; 
                window.engineMemory = { markov: [], diff: [], bias: [], fade: [], rider: [] };
                activePrediction = null; saveData(); updateEngineUI(); 
            }
        };
        container.appendChild(clearBtn);

        const intelBox = document.createElement("div");
        intelBox.id = "tp-intel-box";
        intelBox.style = "background:#000;color:#00ff00;padding:15px;border-radius:8px;font-size:12px;border:2px solid #00ff00;box-shadow:0 0 15px rgba(0,255,0,0.3);line-height:1.6;";
        container.appendChild(intelBox);

        /* ---------------- 2. POKER EVALUATOR ---------------- */
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

        /* ---------------- 3. THE 5 SUB-ENGINES ---------------- */
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
            return slice.filter(x => x === "A").length > (slice.length / 2) ? "A" : "B";
        }

        function getFade(h) {
            let streak = 1; const last = h[h.length-1];
            for (let i = h.length-2; i >= 0; i--) { if (h[i] === last) streak++; else break; }
            return streak >= 3 ? (last === "A" ? "B" : "A") : last;
        }

        function getRider(h) {
            let streak = 1; const last = h[h.length-1];
            for (let i = h.length-2; i >= 0; i--) { if (h[i] === last) streak++; else break; }
            return streak >= 2 ? last : (last === "B" ? "A" : "B");
        }

        /* ---------------- 4. V11.2 HIGH-VOLUME CONTROLLER ---------------- */
        function getOraclePrediction(h, mem) {
            if (h.length < 25) return { win: "WAIT", reason: `COLLECTING (${h.length}/25)` };

            const preds = {
                markov: getMarkov(h), diff: getDiff(h),
                bias: getBias(h), fade: getFade(h), rider: getRider(h)
            };

            const getAcc = (arr) => {
                const slice = arr.slice(-15);
                return slice.length === 0 ? 0 : slice.filter(Boolean).length / slice.length;
            };

            const accs = {
                markov: getAcc(mem.markov), diff: getAcc(mem.diff),
                bias: getAcc(mem.bias), fade: getAcc(mem.fade), rider: getAcc(mem.rider)
            };

            let bestEngine = null; let maxAcc = 0;
            for (const [engine, acc] of Object.entries(accs)) {
                if (acc > maxAcc) { maxAcc = acc; bestEngine = engine; }
            }

            // High Volume Gate: 60% Accuracy required
            if (maxAcc >= 0.60 && bestEngine) {
                return { win: preds[bestEngine], reason: `${bestEngine.toUpperCase()} HOT (${Math.round(maxAcc*100)}%)` };
            }

            return { win: "WAIT", reason: `NO ENGINE HOT (Max ${Math.round(maxAcc*100)}%)` };
        }

        /* ---------------- 5. CENTRAL LOGGING LOGIC ---------------- */
        function recordRound(mid, winner) {
            if (!mid || winner === "TIE") return;
            
            if (window.tpLogs.some(r => String(r.mid) === String(mid))) return;

            window.tpLogs.push({ mid: String(mid), winner: winner });
            saveData();

            const h = window.tpLogs.map(r => r.winner).filter(x => x === "A" || x === "B");
            
            if (h.length > 25) {
                const historySlice = h.slice(0, -1);
                const predData = getOraclePrediction(historySlice, window.engineMemory);
                
                if (predData.win !== "WAIT") {
                    if (predData.win === winner) { window.tpStats.wins++; window.tpStats.units += 0.98; }
                    else { window.tpStats.losses++; window.tpStats.units -= 1.0; }
                }

                const rP = { markov: getMarkov(historySlice), diff: getDiff(historySlice), bias: getBias(historySlice), fade: getFade(historySlice), rider: getRider(historySlice) };
                window.engineMemory.markov.push(rP.markov === winner);
                window.engineMemory.diff.push(rP.diff === winner);
                window.engineMemory.bias.push(rP.bias === winner);
                window.engineMemory.fade.push(rP.fade === winner);
                window.engineMemory.rider.push(rP.rider === winner);
            }
            
            saveData();
            updateEngineUI();
        }

        /* ---------------- 6. BACKFILL ENGINE ---------------- */
        function performBackfill() {
            window.tpStats = { wins: 0, losses: 0, units: 0 };
            window.engineMemory = { markov: [], diff: [], bias: [], fade: [], rider: [] };
            
            const rawLogs = [...window.tpLogs];
            window.tpLogs = []; 
            
            for (let i = 0; i < rawLogs.length; i++) {
                recordRound(rawLogs[i].mid, rawLogs[i].winner);
            }
        }

        function updateEngineUI() {
            const total = window.tpStats.wins + window.tpStats.losses;
            const rate = total > 0 ? ((window.tpStats.wins / total) * 100).toFixed(1) : 0;
            const keyS = DYNAMIC_SECRET_KEY ? `<span style="color:#0f0">KEY LOCKED</span>` : `<span style="color:#f00;animation:blink 1s infinite;">SNIFFING...</span>`;
            
            let wStr = "WAITING...", rStr = "STANDBY";
            const h = window.tpLogs.map(r => r.winner).filter(x => x === "A" || x === "B");
            if (h.length >= 25) {
                activePrediction = getOraclePrediction(h, window.engineMemory);
                wStr = activePrediction.win === "WAIT" ? "WAITING..." : "PLAYER " + activePrediction.win;
                rStr = activePrediction.reason;
            }

            intelBox.innerHTML = `
                <style>@keyframes blink { 50% { opacity: 0; } }</style>
                <b style="color:#0ff;">V11.2 HIGH-VOL (AUTO-BET)</b><br>
                <div style="text-align:center;font-size:10px;">${keyS}</div>
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

        /* ---------------- 7. ORDER PLACEMENT ---------------- */
        function executeWager() {
            let attempts = 0;
            const slip = setInterval(() => {
                attempts++; if (attempts > 20) { clearInterval(slip); return; }
                const stake = document.querySelector('input[placeholder="Enter Stake"]');
                const sub = document.querySelector('.p-4.bg-card.border-t button');
                if (stake && sub && stake.offsetParent !== null) {
                    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                    setter.call(stake, "250"); // <--- STAKE AMOUNT
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
                            // 1.8s delay mimics human reading time and prevents API rejection
                            setTimeout(() => { backBtn.click(); executeWager(); }, 1800); 
                            return;
                        }
                    } 
                }
            }, 500);
            setTimeout(() => clearInterval(scan), 15000); 
        }

        /* ---------------- 8. AGGRESSIVE PAYLOAD SCANNER ---------------- */
        const processPayload = (data) => {
            if (!data) return;

            const traverse = (n) => {
                if (!n || typeof n !== 'object') return;
                
                if (n.res && Array.isArray(n.res)) {
                    n.res.slice().reverse().forEach(r => {
                        if (r.mid && r.win && (r.win === "1" || r.win === "2")) {
                            recordRound(r.mid, r.win === "1" ? "A" : "B");
                        }
                    });
                } else if (Array.isArray(n) && n.length > 0 && n[0].mid && n[0].win) {
                    n.slice().reverse().forEach(r => {
                        if (r.mid && r.win && (r.win === "1" || r.win === "2")) {
                            recordRound(r.mid, r.win === "1" ? "A" : "B");
                        }
                    });
                }
                
                if (n.mid) {
                    if (String(n.mid) !== activeMid) {
                        activeMid = String(n.mid);
                        const h = window.tpLogs.map(r => r.winner).filter(x => x === "A" || x === "B");
                        activePrediction = getOraclePrediction(h, window.engineMemory);
                        updateEngineUI();

                        // --- TRIGGER AUTO-BET ---
                        if (activePrediction.win !== "WAIT") {
                            clickBet(activePrediction.win);
                        }
                    }
                    if (n.win && (n.win === "1" || n.win === "2")) {
                        recordRound(n.mid, n.win === "1" ? "A" : "B");
                    } else if (n.card && n.card.split(',').length === 6 && !n.card.includes("1")) {
                        recordRound(n.mid, calculateWin(n.card));
                    }
                }
                
                for (let k in n) {
                    if (typeof n[k] === 'object') traverse(n[k]);
                }
            };
            traverse(data);
        };

        /* ---------------- 9. NETWORK HOOKS ---------------- */
        const originalFetch = window.fetch;
        window.fetch = async function (...args) {
            const resp = await originalFetch.apply(this, args);
            try { resp.clone().json().then(json => {
                if (json && typeof json.data === 'string' && json.data.startsWith("U2FsdGVkX1") && DYNAMIC_SECRET_KEY) {
                    const dec = JSON.parse(CryptoJS.AES.decrypt(json.data, DYNAMIC_SECRET_KEY).toString(CryptoJS.enc.Utf8));
                    processPayload(dec.original?.data || dec.data || dec);
                } else {
                    processPayload(json);
                }
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
                    } else {
                        processPayload(json);
                    }
                } catch (e) { }
            });
            originalXHR.call(this, method, url, ...rest);
        };

        /* ---------------- 10. AES KEY SNIFFER ---------------- */
        const cs = ["webpackChunkfront", "webpackChunk_N_E", "webpackJsonp"];
        cs.forEach(c => { if (window[c]) { window[c].push([[99999], {}, function (e) {
            for (let m in e.m) { try { let mod = e(m); if (mod && mod.AES && mod.AES.decrypt) {
                const orig = mod.AES.decrypt; mod.AES.decrypt = function (cipher, key) {
                    if (!DYNAMIC_SECRET_KEY && key) { DYNAMIC_SECRET_KEY = key.toString(); updateEngineUI(); }
                    return orig.apply(this, arguments);
                };
            } } catch (err) { } }
        }]); } });

        performBackfill();
        console.log("%c V11.2 SHANKARA HIGH-VOLUME (AUTO-BET) LOADED ", "color:#0f0;font-weight:bold;");
    }
})();