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
        window.tpStats = JSON.parse(localStorage.getItem(STATS_KEY)) || { wins: 0, losses: 0, units: 0 };
        
        let activeMid = null, activePrediction = null, DYNAMIC_SECRET_KEY = null;
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
        dlBtn.innerHTML = `💾 DOWNLOAD LOG (${window.tpLogs.length})`;
        dlBtn.style = "padding:12px;background:#ffd700;color:#000;border:2px solid #000;cursor:pointer;font-weight:bold;border-radius:4px;";
        dlBtn.onclick = () => {
            const content = window.tpLogs.map(r => `${r.mid},${r.winner}`).join("\n");
            const blob = new Blob([content], { type: "text/plain" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob); link.download = `shankara_v8_5.csv`; link.click();
        };
        container.appendChild(dlBtn);

        const clearBtn = document.createElement("button");
        clearBtn.innerHTML = "🗑️ WIPE MEMORY & STATS";
        clearBtn.style = "padding:5px;background:#ff4444;color:#fff;border:none;cursor:pointer;font-size:10px;border-radius:4px;font-weight:bold;";
        clearBtn.onclick = () => {
            if (confirm("Wipe data?")) { window.tpLogs = []; window.tpStats = { wins: 0, losses: 0, units: 0 }; activePrediction = null; saveData(); updateEngineUI(); }
        };
        container.appendChild(clearBtn);

        const intelBox = document.createElement("div");
        intelBox.id = "tp-intel-box";
        intelBox.style = "background:#000;color:#00ff00;padding:15px;border-radius:8px;font-size:12px;border:2px solid #00ff00;box-shadow:0 0 15px rgba(0,255,0,0.3);line-height:1.6;";
        container.appendChild(intelBox);

        // --- KEY SNIFFER ---
        function extractKey() {
            const cs = ["webpackChunkfront", "webpackChunk_N_E", "webpackJsonp"];
            cs.forEach(c => { if (window[c]) { window[c].push([[99999], {}, function (e) {
                for (let m in e.m) { try {
                    let mod = e(m);
                    if (mod && mod.AES && mod.AES.decrypt) {
                        const orig = mod.AES.decrypt;
                        mod.AES.decrypt = function (cipher, key) {
                            if (!DYNAMIC_SECRET_KEY && key) { DYNAMIC_SECRET_KEY = key.toString(); updateEngineUI(); }
                            return orig.apply(this, arguments);
                        };
                    }
                } catch (err) { } }
            }]); } });
        }
        extractKey();

        /* ---------------- ENGINES ---------------- */
        function calculateWin(cStr) {
            const cs = cStr.split(',');
            const pC = c => {
                let rS = c.substring(0, c.length - 2);
                let ranks = { "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, "J": 11, "Q": 12, "K": 13, "A": 14 };
                return { r: ranks[rS] || 0, s: c.slice(-2) };
            };
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

        function getDynamicPrediction(data) {
            const h = data.map(r => r.winner).filter(x => x === "A" || x === "B");
            if (h.length < 20) return { win: "WAIT", reason: "COLLECTING" };
            const hStr = h.join(''), recent = h.slice(-10);
            let alt = 0; for (let i = 1; i < recent.length; i++) if (recent[i] !== recent[i - 1]) alt++;
            alt = alt / (recent.length - 1 || 1);
            let s = 1, m = 1; for (let i = 1; i < recent.length; i++) if (recent[i] === recent[i - 1]) { s++; m = Math.max(m, s); } else s = 1;

            if (alt > 0.45 && alt < 0.65 && m < 3) return { win: "WAIT", reason: "UNCERTAIN" };

            let res; let lab;
            if (m >= 4 || alt < 0.35) {
                let counts = { AAA: 1, AAB: 1, ABA: 1, ABB: 1, BAA: 1, BAB: 1, BBA: 1, BBB: 1 };
                for (let i = 2; i < h.length; i++) { const k = h[i-2] + h[i-1] + h[i]; if (counts[k] !== undefined) counts[k]++; }
                const l2 = h.slice(-2).join(""); const a = counts[l2 + "A"], b = counts[l2 + "B"];
                res = { side: a > b ? "A" : "B", conf: Math.max(a/(a+b), b/(a+b)) }; lab = "MARKOV-2";
            } else if (alt > 0.7) { 
                const depths = [5, 4, 3]; let found = null;
                for (let d of depths) {
                    const seq = hStr.slice(-d), first = hStr.slice(0, -d).lastIndexOf(seq);
                    if (first !== -1 && hStr[first + d]) { found = { side: hStr[first + d], depth: d }; break; }
                }
                if(found) return { win: found.side, reason: `SNIPER | ${found.depth}d` };
                res = { side: h[h.length-1] === "A" ? "B" : "A", conf: 0.7 }; lab = "SNIPER-FADE";
            } else {
                let AA=1,AB=1,BA=1,BB=1;
                for(let i=1;i<h.length;i++){ if(h[i-1]==="A"&&h[i]==="A")AA++; else if(h[i-1]==="A"&&h[i]==="B")AB++; else if(h[i-1]==="B"&&h[i]==="A")BA++; else if(h[i-1]==="B"&&h[i]==="B")BB++; }
                const last = h[h.length-1]; const pA = (last==="A")?AA/(AA+AB):BA/(BA+BB);
                res = { side: pA > 0.5 ? "A" : "B", conf: Math.max(pA, 1-pA) }; lab = "MARKOV-1";
            }
            if (res.conf < 0.52) return { win: "WAIT", reason: "LOW EDGE" };
            return { win: res.side, reason: `${lab} | ${Math.round(res.conf * 100)}%` };
        }

        /* ---------------- STATS BACKFILL ENGINE ---------------- */
        function recordRound(mid, winner) {
            if (!mid || winner === "TIE") return;
            if (window.tpLogs.some(r => String(r.mid) === String(mid))) return;

            // Stats Backfill Simulation
            if (window.tpLogs.length >= 20) {
                const sim = getDynamicPrediction(window.tpLogs);
                if (sim.win !== "WAIT") {
                    if (sim.win === winner) { window.tpStats.wins++; window.tpStats.units += 0.98; }
                    else { window.tpStats.losses++; window.tpStats.units -= 1.0; }
                }
            }
            window.tpLogs.push({ mid: String(mid), winner: winner });
            saveData();
        }

        function updateEngineUI() {
            const total = window.tpStats.wins + window.tpStats.losses;
            const rate = total > 0 ? ((window.tpStats.wins / total) * 100).toFixed(1) : 0;
            const keyS = DYNAMIC_SECRET_KEY ? `<span style="color:#0f0">KEY LOCKED</span>` : `<span style="color:#f00;animation:blink 1s infinite;">SNIFFING...</span>`;
            intelBox.innerHTML = `
                <style>@keyframes blink { 50% { opacity: 0; } }</style>
                <b style="color:#0ff;">V8.5 SHANKARA UNITY</b><br>
                <div style="text-align:center;font-size:10px;">${keyS}</div>
                <div style="text-align:center;padding:10px;">
                    <span style="font-size:24px;color:${activePrediction?.win === 'A' ? '#f44' : (activePrediction?.win === 'B' ? '#4af' : '#ff0')};font-weight:bold;">
                        ${activePrediction?.win === "WAIT" || !activePrediction ? "WAITING..." : "PLAYER " + activePrediction.win}
                    </span><br>
                    <span style="font-size:11px;color:#ffd700;">${activePrediction?.reason || "STANDBY"}</span>
                </div>
                <div style="background:#111;padding:8px;border-radius:6px;font-size:11px;">
                    W: ${window.tpStats.wins} | L: ${window.tpStats.losses} | <b>${rate}%</b><br>
                    PNL: <b style="color:#ffd700;">${window.tpStats.units.toFixed(2)} U</b>
                </div>
            `;
            if(document.getElementById('dl-btn')) document.getElementById('dl-btn').innerHTML = `💾 DOWNLOAD LOG (${window.tpLogs.length})`;
        }

        const originalFetch = window.fetch;
        window.fetch = async function (...args) {
            const resp = await originalFetch.apply(this, args);
            try { resp.clone().json().then(json => {
                if (json && typeof json.data === 'string' && json.data.startsWith("U2FsdGVkX1")) {
                    const dec = JSON.parse(CryptoJS.AES.decrypt(json.data, DYNAMIC_SECRET_KEY).toString(CryptoJS.enc.Utf8));
                    const data = dec.original?.data || dec.data;
                    if (data.res) data.res.reverse().forEach(r => recordRound(r.mid, r.win === "1" ? "A" : (r.win === "2" ? "B" : "TIE")));
                    else if (data.mid && data.card) {
                        if (String(data.mid) !== activeMid) { activeMid = String(data.mid); activePrediction = getDynamicPrediction(window.tpLogs); }
                        if (data.card.split(',').length === 6 && !data.card.includes("1")) recordRound(data.mid, calculateWin(data.card));
                    }
                }
                updateEngineUI();
            }); } catch (e) { } return resp;
        };

        setInterval(updateEngineUI, 5000); updateEngineUI();
    }
})();







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
        // RESET STATS FOR FRESH SIMULATION ON INJECTION
        window.tpStats = { wins: 0, losses: 0, units: 0 };
        
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
        dlBtn.innerHTML = `💾 DOWNLOAD LOG (${window.tpLogs.length})`;
        dlBtn.style = "padding:12px;background:#ffd700;color:#000;border:2px solid #000;cursor:pointer;font-weight:bold;border-radius:4px;";
        dlBtn.onclick = () => {
            const content = window.tpLogs.map(r => `${r.mid},${r.winner}`).join("\n");
            const blob = new Blob([content], { type: "text/plain" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob); link.download = `shankara_v8_6_view.csv`; link.click();
        };
        container.appendChild(dlBtn);

        const clearBtn = document.createElement("button");
        clearBtn.innerHTML = "🗑️ WIPE MEMORY & STATS";
        clearBtn.style = "padding:5px;background:#ff4444;color:#fff;border:none;cursor:pointer;font-size:10px;border-radius:4px;font-weight:bold;";
        clearBtn.onclick = () => {
            if (confirm("Wipe all data?")) { 
                window.tpLogs = []; window.tpStats = { wins: 0, losses: 0, units: 0 };
                activePrediction = null; saveData(); updateEngineUI(); 
            }
        };
        container.appendChild(clearBtn);

        const intelBox = document.createElement("div");
        intelBox.id = "tp-intel-box";
        intelBox.style = "background:#000;color:#00ff00;padding:15px;border-radius:8px;font-size:12px;border:2px solid #00ff00;box-shadow:0 0 15px rgba(0,255,0,0.3);line-height:1.6;";
        container.appendChild(intelBox);

        /* ---------------- 2. ENGINES (FULL STATISTICAL CORES) ---------------- */
        function calculateWin(cStr) {
            const cs = cStr.split(',');
            const pC = c => {
                let rS = c.substring(0, c.length - 2);
                let ranks = { "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, "J": 11, "Q": 12, "K": 13, "A": 14 };
                return { r: ranks[rS] || 0, s: c.slice(-2) };
            };
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

        function getPrediction(historySlice) {
            const h = historySlice.map(r => r.winner).filter(x => x === "A" || x === "B");
            if (h.length < 20) return { win: "WAIT", reason: "COLLECTING" };
            const hStr = h.join(''), recent = h.slice(-10);
            
            let alt = 0; for (let i = 1; i < recent.length; i++) if (recent[i] !== recent[i - 1]) alt++;
            const altS = alt / (recent.length - 1 || 1);
            let s = 1, m = 1; for (let i = 1; i < recent.length; i++) if (recent[i] === recent[i - 1]) { s++; m = Math.max(m, s); } else s = 1;

            if (altS > 0.45 && altS < 0.65 && m < 3) return { win: "WAIT", reason: "UNCERTAIN" };

            let res; let lab;
            if (m >= 4 || altS < 0.35) {
                let counts = { AAA: 1, AAB: 1, ABA: 1, ABB: 1, BAA: 1, BAB: 1, BBA: 1, BBB: 1 };
                for (let i = 2; i < h.length; i++) { const k = h[i-2] + h[i-1] + h[i]; if (counts[k]) counts[k]++; }
                const l2 = h.slice(-2).join(""); const a = counts[l2 + "A"], b = counts[l2 + "B"];
                res = { side: a > b ? "A" : "B", conf: Math.max(a/(a+b), b/(a+b)) }; lab = "MARKOV-2";
            } else if (altS > 0.7) { 
                const depths = [5, 4, 3]; let found = null;
                for (let d of depths) { const seq = hStr.slice(-d), first = hStr.slice(0, -d).lastIndexOf(seq);
                    if (first !== -1 && hStr[first + d]) { found = { side: hStr[first + d], depth: d }; break; } }
                if(found) return { win: found.side, reason: `SNIPER | ${found.depth}d` };
                res = { side: h[h.length-1] === "A" ? "B" : "A", conf: 0.7 }; lab = "SNIPER-FADE";
            } else {
                let AA=1,AB=1,BA=1,BB=1;
                for(let i=1;i<h.length;i++){ if(h[i-1]==="A"&&h[i]==="A")AA++; else if(h[i-1]==="A"&&h[i]==="B")AB++; else if(h[i-1]==="B"&&h[i]==="A")BA++; else if(h[i-1]==="B"&&h[i]==="B")BB++; }
                const last = h[h.length-1]; const pA = (last==="A")?AA/(AA+AB):BA/(BA+BB);
                res = { side: pA > 0.5 ? "A" : "B", conf: Math.max(pA, 1-pA) }; lab = "MARKOV-1";
            }
            if (res.conf < 0.52) return { win: "WAIT", reason: "LOW EDGE" };
            return { win: res.side, reason: `${lab} | ${Math.round(res.conf * 100)}%` };
        }

        /* ---------------- 3. BACKFILL ENGINE (IMMEDIATE) ---------------- */
        function performBackfill() {
            window.tpStats = { wins: 0, losses: 0, units: 0 }; 
            for (let i = 20; i < window.tpLogs.length; i++) {
                const hist = window.tpLogs.slice(0, i);
                const winner = window.tpLogs[i].winner;
                const pred = getPrediction(hist);
                if (pred.win !== "WAIT") {
                    if (pred.win === winner) { window.tpStats.wins++; window.tpStats.units += 0.98; }
                    else { window.tpStats.losses++; window.tpStats.units -= 1.0; }
                }
            }
            updateEngineUI();
            saveData();
        }

        /* ---------------- 4. LIVE HANDLERS ---------------- */
        function recordRound(mid, winner) {
            if (!mid || winner === "TIE") return;
            if (window.tpLogs.some(r => String(r.mid) === String(mid))) return;

            const pred = getPrediction(window.tpLogs);
            if (pred.win !== "WAIT") {
                if (pred.win === winner) { window.tpStats.wins++; window.tpStats.units += 0.98; }
                else { window.tpStats.losses++; window.tpStats.units -= 1.0; }
            }
            window.tpLogs.push({ mid: String(mid), winner: winner });
            saveData();
        }

        function updateEngineUI() {
            const total = window.tpStats.wins + window.tpStats.losses;
            const rate = total > 0 ? ((window.tpStats.wins / total) * 100).toFixed(1) : 0;
            const keyS = DYNAMIC_SECRET_KEY ? `<span style="color:#0f0">KEY LOCKED</span>` : `<span style="color:#f00;animation:blink 1s infinite;">SNIFFING...</span>`;
            intelBox.innerHTML = `
                <style>@keyframes blink { 50% { opacity: 0; } }</style>
                <b style="color:#0ff;">V8.6 SHANKARA (VIEW-ONLY)</b><br>
                <div style="text-align:center;font-size:10px;">${keyS}</div>
                <div style="text-align:center;padding:10px;">
                    <span style="font-size:24px;color:${activePrediction?.win === 'A' ? '#f44' : (activePrediction?.win === 'B' ? '#4af' : '#ff0')};font-weight:bold;">
                        ${activePrediction?.win === "WAIT" || !activePrediction ? "WAITING..." : "PLAYER " + activePrediction.win}
                    </span><br>
                    <span style="font-size:11px;color:#ffd700;">${activePrediction?.reason || "STANDBY"}</span>
                </div>
                <div style="background:#111;padding:8px;border-radius:6px;font-size:11px;">
                    W: ${window.tpStats.wins} | L: ${window.tpStats.losses} | <b>${rate}%</b><br>
                    PNL: <b style="color:#ffd700;">${window.tpStats.units.toFixed(2)} U</b>
                </div>
            `;
            if(document.getElementById('dl-btn')) document.getElementById('dl-btn').innerHTML = `💾 DOWNLOAD LOG (${window.tpLogs.length})`;
        }

        const originalFetch = window.fetch;
        window.fetch = async function (...args) {
            const resp = await originalFetch.apply(this, args);
            try { resp.clone().json().then(json => {
                if (json && typeof json.data === 'string' && json.data.startsWith("U2FsdGVkX1")) {
                    const dec = JSON.parse(CryptoJS.AES.decrypt(json.data, DYNAMIC_SECRET_KEY).toString(CryptoJS.enc.Utf8));
                    const data = dec.original?.data || dec.data;
                    
                    if (data.res && Array.isArray(data.res)) {
                        data.res.reverse().forEach(r => recordRound(r.mid, r.win === "1" ? "A" : (r.win === "2" ? "B" : "TIE")));
                    } else if (data.mid && data.card) {
                        if (String(data.mid) !== activeMid) { 
                            activeMid = String(data.mid); 
                            activePrediction = getPrediction(window.tpLogs);
                        }
                        if (data.card.split(',').length === 6 && !data.card.includes("1")) recordRound(data.mid, calculateWin(data.card));
                    }
                }
                updateEngineUI();
            }); } catch (e) { } return resp;
        };

        // KEY SNIFFER
        const cs = ["webpackChunkfront", "webpackChunk_N_E", "webpackJsonp"];
        cs.forEach(c => { if (window[c]) { window[c].push([[99999], {}, function (e) {
            for (let m in e.m) { try { let mod = e(m); if (mod && mod.AES && mod.AES.decrypt) {
                const orig = mod.AES.decrypt; mod.AES.decrypt = function (cipher, key) {
                    if (!DYNAMIC_SECRET_KEY && key) { DYNAMIC_SECRET_KEY = key.toString(); updateEngineUI(); }
                    return orig.apply(this, arguments);
                };
            } } catch (err) { } }
        }]); } });

        // EXECUTE IMMEDIATE BACKFILL
        performBackfill();
    }
})();




// with order placement
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
        window.tpStats = JSON.parse(localStorage.getItem(STATS_KEY)) || { wins: 0, losses: 0, units: 0 };
        
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
        dlBtn.innerHTML = `💾 DOWNLOAD LOG (${window.tpLogs.length})`;
        dlBtn.style = "padding:12px;background:#ffd700;color:#000;border:2px solid #000;cursor:pointer;font-weight:bold;border-radius:4px;";
        dlBtn.onclick = () => {
            const content = window.tpLogs.map(r => `${r.mid},${r.winner}`).join("\n");
            const blob = new Blob([content], { type: "text/plain" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob); link.download = `shankara_auto_v8_5.csv`; link.click();
        };
        container.appendChild(dlBtn);

        const clearBtn = document.createElement("button");
        clearBtn.innerHTML = "🗑️ WIPE MEMORY & STATS";
        clearBtn.style = "padding:5px;background:#ff4444;color:#fff;border:none;cursor:pointer;font-size:10px;border-radius:4px;font-weight:bold;";
        clearBtn.onclick = () => {
            if (confirm("Wipe all data and stats?")) { 
                window.tpLogs = []; window.tpStats = { wins: 0, losses: 0, units: 0 };
                activePrediction = null; saveData(); updateEngineUI(); 
            }
        };
        container.appendChild(clearBtn);

        const intelBox = document.createElement("div");
        intelBox.id = "tp-intel-box";
        intelBox.style = "background:#000;color:#00ff00;padding:15px;border-radius:8px;font-size:12px;border:2px solid #00ff00;box-shadow:0 0 15px rgba(0,255,0,0.3);line-height:1.6;";
        container.appendChild(intelBox);

        // --- 2. KEY SNIFFER ---
        function extractKey() {
            const cs = ["webpackChunkfront", "webpackChunk_N_E", "webpackJsonp"];
            cs.forEach(c => { if (window[c]) { window[c].push([[99999], {}, function (e) {
                for (let m in e.m) { try {
                    let mod = e(m);
                    if (mod && mod.AES && mod.AES.decrypt) {
                        const orig = mod.AES.decrypt;
                        mod.AES.decrypt = function (cipher, key) {
                            if (!DYNAMIC_SECRET_KEY && key) { DYNAMIC_SECRET_KEY = key.toString(); console.log("%c [KEY SECURED]", "color:lime"); updateEngineUI(); }
                            return orig.apply(this, arguments);
                        };
                    }
                } catch (err) { } }
            }]); } });
        }
        extractKey();

        /* ---------------- 3. CORE ENGINES ---------------- */
        function calculateWin(cStr) {
            const cs = cStr.split(',');
            const pC = c => {
                let rS = c.substring(0, c.length - 2);
                let ranks = { "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, "J": 11, "Q": 12, "K": 13, "A": 14 };
                return { r: ranks[rS] || 0, s: c.slice(-2) };
            };
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

        function getPrediction(data) {
            const h = data.map(r => r.winner).filter(x => x === "A" || x === "B");
            if (h.length < 20) return { win: "WAIT", reason: "COLLECTING" };
            const hStr = h.join(''), recent = h.slice(-10);
            let alt = 0; for (let i = 1; i < recent.length; i++) if (recent[i] !== recent[i - 1]) alt++;
            const altS = alt / (recent.length - 1 || 1);
            let s = 1, m = 1; for (let i = 1; i < recent.length; i++) if (recent[i] === recent[i - 1]) { s++; m = Math.max(m, s); } else s = 1;

            if (altS > 0.45 && altS < 0.65 && m < 3) return { win: "WAIT", reason: "UNCERTAIN" };

            let res; let lab;
            if (m >= 4 || altS < 0.35) {
                let counts = { AAA: 1, AAB: 1, ABA: 1, ABB: 1, BAA: 1, BAB: 1, BBA: 1, BBB: 1 };
                for (let i = 2; i < h.length; i++) { const k = h[i-2] + h[i-1] + h[i]; if (counts[k]) counts[k]++; }
                const l2 = h.slice(-2).join(""); const a = counts[l2 + "A"], b = counts[l2 + "B"];
                res = { side: a > b ? "A" : "B", conf: Math.max(a/(a+b), b/(a+b)) }; lab = "MARKOV-2";
            } else if (altS > 0.7) { 
                const depths = [5, 4, 3]; let found = null;
                for (let d of depths) { const seq = hStr.slice(-d), first = hStr.slice(0, -d).lastIndexOf(seq);
                    if (first !== -1 && hStr[first + d]) { found = { side: hStr[first + d], depth: d }; break; } }
                if(found) return { win: found.side, reason: `SNIPER | ${found.depth}d` };
                res = { side: h[h.length-1] === "A" ? "B" : "A", conf: 0.7 }; lab = "SNIPER-FADE";
            } else {
                let AA=1,AB=1,BA=1,BB=1;
                for(let i=1;i<h.length;i++){ if(h[i-1]==="A"&&h[i]==="A")AA++; else if(h[i-1]==="A"&&h[i]==="B")AB++; else if(h[i-1]==="B"&&h[i]==="A")BA++; else if(h[i-1]==="B"&&h[i]==="B")BB++; }
                const last = h[h.length-1]; const pA = (last==="A")?AA/(AA+AB):BA/(BA+BB);
                res = { side: pA > 0.5 ? "A" : "B", conf: Math.max(pA, 1-pA) }; lab = "MARKOV-1";
            }
            if (res.conf < 0.52) return { win: "WAIT", reason: "LOW EDGE" };
            return { win: res.side, reason: `${lab} | ${Math.round(res.conf * 100)}%` };
        }

        /* ---------------- 4. ORDER PLACEMENT ---------------- */
        function clickBet(side) {
            if (side !== "A" && side !== "B") return;
            const target = "Player " + side;
            const scan = setInterval(() => {
                const containers = document.querySelectorAll('.bg-background.border-2.overflow-hidden');
                for (let c of containers) { if (c.innerText.includes(target)) {
                    const backBtn = c.querySelector('.bg-back');
                    if (backBtn && !backBtn.classList.contains('cursor-not-allowed')) {
                        clearInterval(scan);
                        setTimeout(() => { 
                            backBtn.click();
                            const slip = setInterval(() => {
                                const stake = document.querySelector('input[placeholder="Enter Stake"]');
                                const sub = document.querySelector('.p-4.bg-card.border-t button');
                                if (stake && sub && stake.offsetParent !== null) {
                                    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                                    setter.call(stake, "50"); stake.dispatchEvent(new Event('input', { bubbles: true }));
                                    stake.dispatchEvent(new Event('change', { bubbles: true }));
                                    setTimeout(() => { if (!sub.disabled) sub.click(); }, 350);
                                    clearInterval(slip);
                                }
                            }, 100);
                        }, 1800); return;
                    }
                } }
            }, 500);
        }

        /* ---------------- 5. DATA HANDLERS ---------------- */
        function recordRound(mid, winner) {
            if (!mid || winner === "TIE") return;
            if (window.tpLogs.some(r => String(r.mid) === String(mid))) return;

            // Stats Backfill / Live Sync
            if (window.tpLogs.length >= 20) {
                const sim = getPrediction(window.tpLogs);
                if (sim.win !== "WAIT") {
                    if (sim.win === winner) { window.tpStats.wins++; window.tpStats.units += 0.98; }
                    else { window.tpStats.losses++; window.tpStats.units -= 1.0; }
                }
            }
            window.tpLogs.push({ mid: String(mid), winner: winner });
            saveData();
        }

        function updateEngineUI() {
            const total = window.tpStats.wins + window.tpStats.losses;
            const rate = total > 0 ? ((window.tpStats.wins / total) * 100).toFixed(1) : 0;
            const keyS = DYNAMIC_SECRET_KEY ? `<span style="color:#0f0">KEY LOCKED</span>` : `<span style="color:#f00;animation:blink 1s infinite;">SNIFFING...</span>`;
            intelBox.innerHTML = `
                <style>@keyframes blink { 50% { opacity: 0; } }</style>
                <b style="color:#0ff;">V8.5 SHANKARA AUTO</b><br>
                <div style="text-align:center;font-size:10px;">${keyS}</div>
                <div style="text-align:center;padding:10px;">
                    <span style="font-size:24px;color:${activePrediction?.win === 'A' ? '#f44' : (activePrediction?.win === 'B' ? '#4af' : '#ff0')};font-weight:bold;">
                        ${activePrediction?.win === "WAIT" || !activePrediction ? "WAITING..." : "PLAYER " + activePrediction.win}
                    </span><br>
                    <span style="font-size:11px;color:#ffd700;">${activePrediction?.reason || "STANDBY"}</span>
                </div>
                <div style="background:#111;padding:8px;border-radius:6px;font-size:11px;">
                    W: ${window.tpStats.wins} | L: ${window.tpStats.losses} | <b>${rate}%</b><br>
                    PNL: <b style="color:#ffd700;">${window.tpStats.units.toFixed(2)} U</b>
                </div>
            `;
            if(document.getElementById('dl-btn')) document.getElementById('dl-btn').innerHTML = `💾 DOWNLOAD LOG (${window.tpLogs.length})`;
        }

        const originalFetch = window.fetch;
        window.fetch = async function (...args) {
            const resp = await originalFetch.apply(this, args);
            try { resp.clone().json().then(json => {
                if (json && typeof json.data === 'string' && json.data.startsWith("U2FsdGVkX1")) {
                    const dec = JSON.parse(CryptoJS.AES.decrypt(json.data, DYNAMIC_SECRET_KEY).toString(CryptoJS.enc.Utf8));
                    const data = dec.original?.data || dec.data;
                    
                    // History Backfill Detection
                    if (data.res && Array.isArray(data.res)) {
                        data.res.reverse().forEach(r => recordRound(r.mid, r.win === "1" ? "A" : (r.win === "2" ? "B" : "TIE")));
                    } 
                    // Live Game Detection
                    else if (data.mid && data.card) {
                        if (String(data.mid) !== activeMid) { 
                            activeMid = String(data.mid); 
                            activePrediction = getPrediction(window.tpLogs);
                            if (activePrediction.win !== "WAIT") clickBet(activePrediction.win);
                        }
                        if (data.card.split(',').length === 6 && !data.card.includes("1")) recordRound(data.mid, calculateWin(data.card));
                    }
                }
                updateEngineUI();
            }); } catch (e) { } return resp;
        };

        setInterval(updateEngineUI, 5000); updateEngineUI();
        console.log("%c V8.5 SHANKARA AUTO-BACKFILL LOADED ", "color:cyan; font-weight:bold;");
    }
})();



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
        // Resetting stats to allow a fresh backfill simulation from stored history
        window.tpStats = { wins: 0, losses: 0, units: 0 };
        
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
        dlBtn.innerHTML = `💾 DOWNLOAD LOG (${window.tpLogs.length})`;
        dlBtn.style = "padding:12px;background:#ffd700;color:#000;border:2px solid #000;cursor:pointer;font-weight:bold;border-radius:4px;";
        dlBtn.onclick = () => {
            const content = window.tpLogs.map(r => `${r.mid},${r.winner}`).join("\n");
            const blob = new Blob([content], { type: "text/plain" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob); link.download = `shankara_v8_6_auto.csv`; link.click();
        };
        container.appendChild(dlBtn);

        const clearBtn = document.createElement("button");
        clearBtn.innerHTML = "🗑️ WIPE MEMORY & STATS";
        clearBtn.style = "padding:5px;background:#ff4444;color:#fff;border:none;cursor:pointer;font-size:10px;border-radius:4px;font-weight:bold;";
        clearBtn.onclick = () => {
            if (confirm("Wipe all data?")) { 
                window.tpLogs = []; window.tpStats = { wins: 0, losses: 0, units: 0 };
                activePrediction = null; saveData(); updateEngineUI(); 
            }
        };
        container.appendChild(clearBtn);

        const intelBox = document.createElement("div");
        intelBox.id = "tp-intel-box";
        intelBox.style = "background:#000;color:#00ff00;padding:15px;border-radius:8px;font-size:12px;border:2px solid #00ff00;box-shadow:0 0 15px rgba(0,255,0,0.3);line-height:1.6;";
        container.appendChild(intelBox);

        /* ---------------- 2. ENGINES ---------------- */
        function calculateWin(cStr) {
            const cs = cStr.split(',');
            const pC = c => {
                let rS = c.substring(0, c.length - 2);
                let ranks = { "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, "J": 11, "Q": 12, "K": 13, "A": 14 };
                return { r: ranks[rS] || 0, s: c.slice(-2) };
            };
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

        function getPrediction(historySlice) {
            const h = historySlice.map(r => r.winner).filter(x => x === "A" || x === "B");
            if (h.length < 20) return { win: "WAIT", reason: "COLLECTING" };
            const hStr = h.join(''), recent = h.slice(-10);
            
            let alt = 0; for (let i = 1; i < recent.length; i++) if (recent[i] !== recent[i - 1]) alt++;
            const altS = alt / (recent.length - 1 || 1);
            let s = 1, m = 1; for (let i = 1; i < recent.length; i++) if (recent[i] === recent[i - 1]) { s++; m = Math.max(m, s); } else s = 1;

            if (altS > 0.45 && altS < 0.65 && m < 3) return { win: "WAIT", reason: "UNCERTAIN" };

            let res; let lab;
            if (m >= 4 || altS < 0.35) {
                let counts = { AAA: 1, AAB: 1, ABA: 1, ABB: 1, BAA: 1, BAB: 1, BBA: 1, BBB: 1 };
                for (let i = 2; i < h.length; i++) { const k = h[i-2] + h[i-1] + h[i]; if (counts[k]) counts[k]++; }
                const l2 = h.slice(-2).join(""); const a = counts[l2 + "A"], b = counts[l2 + "B"];
                res = { side: a > b ? "A" : "B", conf: Math.max(a/(a+b), b/(a+b)) }; lab = "MARKOV-2";
            } else if (altS > 0.7) { 
                const depths = [5, 4, 3]; let found = null;
                for (let d of depths) { const seq = hStr.slice(-d), first = hStr.slice(0, -d).lastIndexOf(seq);
                    if (first !== -1 && hStr[first + d]) { found = { side: hStr[first + d], depth: d }; break; } }
                if(found) return { win: found.side, reason: `SNIPER | ${found.depth}d` };
                res = { side: h[h.length-1] === "A" ? "B" : "A", conf: 0.7 }; lab = "SNIPER-FADE";
            } else {
                let AA=1,AB=1,BA=1,BB=1;
                for(let i=1;i<h.length;i++){ if(h[i-1]==="A"&&h[i]==="A")AA++; else if(h[i-1]==="A"&&h[i]==="B")AB++; else if(h[i-1]==="B"&&h[i]==="A")BA++; else if(h[i-1]==="B"&&h[i]==="B")BB++; }
                const last = h[h.length-1]; const pA = (last==="A")?AA/(AA+AB):BA/(BA+BB);
                res = { side: pA > 0.5 ? "A" : "B", conf: Math.max(pA, 1-pA) }; lab = "MARKOV-1";
            }
            if (res.conf < 0.52) return { win: "WAIT", reason: "LOW EDGE" };
            return { win: res.side, reason: `${lab} | ${Math.round(res.conf * 100)}%` };
        }

        /* ---------------- 3. BACKFILL ENGINE ---------------- */
        function performBackfill() {
            window.tpStats = { wins: 0, losses: 0, units: 0 }; 
            for (let i = 20; i < window.tpLogs.length; i++) {
                const hist = window.tpLogs.slice(0, i);
                const winner = window.tpLogs[i].winner;
                const pred = getPrediction(hist);
                if (pred.win !== "WAIT") {
                    if (pred.win === winner) { window.tpStats.wins++; window.tpStats.units += 0.98; }
                    else { window.tpStats.losses++; window.tpStats.units -= 1.0; }
                }
            }
            updateEngineUI();
            saveData();
        }

        /* ---------------- 4. ORDER PLACEMENT ---------------- */
        function clickBet(side) {
            const target = "Player " + side;
            const scan = setInterval(() => {
                const containers = document.querySelectorAll('.bg-background.border-2.overflow-hidden');
                for (let c of containers) { if (c.innerText.includes(target)) {
                    const backBtn = c.querySelector('.bg-back');
                    if (backBtn && !backBtn.classList.contains('cursor-not-allowed')) {
                        clearInterval(scan);
                        setTimeout(() => { 
                            backBtn.click();
                            const slip = setInterval(() => {
                                const stake = document.querySelector('input[placeholder="Enter Stake"]');
                                const sub = document.querySelector('.p-4.bg-card.border-t button');
                                if (stake && sub && stake.offsetParent !== null) {
                                    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                                    setter.call(stake, "50"); // STAKE VALUE
                                    stake.dispatchEvent(new Event('input', { bubbles: true }));
                                    stake.dispatchEvent(new Event('change', { bubbles: true }));
                                    setTimeout(() => { if (!sub.disabled) sub.click(); }, 400);
                                    clearInterval(slip);
                                }
                            }, 100);
                        }, 1800); return;
                    }
                } }
            }, 500);
        }

        /* ---------------- 5. LIVE HANDLERS ---------------- */
        function recordRound(mid, winner) {
            if (!mid || winner === "TIE") return;
            if (window.tpLogs.some(r => String(r.mid) === String(mid))) return;

            const pred = getPrediction(window.tpLogs);
            if (pred.win !== "WAIT") {
                if (pred.win === winner) { window.tpStats.wins++; window.tpStats.units += 0.98; }
                else { window.tpStats.losses++; window.tpStats.units -= 1.0; }
            }
            window.tpLogs.push({ mid: String(mid), winner: winner });
            saveData();
        }

        function updateEngineUI() {
            const total = window.tpStats.wins + window.tpStats.losses;
            const rate = total > 0 ? ((window.tpStats.wins / total) * 100).toFixed(1) : 0;
            const keyS = DYNAMIC_SECRET_KEY ? `<span style="color:#0f0">KEY LOCKED</span>` : `<span style="color:#f00;animation:blink 1s infinite;">SNIFFING...</span>`;
            intelBox.innerHTML = `
                <style>@keyframes blink { 50% { opacity: 0; } }</style>
                <b style="color:#0ff;">V8.6 SHANKARA (FULL AUTO)</b><br>
                <div style="text-align:center;font-size:10px;">${keyS}</div>
                <div style="text-align:center;padding:10px;">
                    <span style="font-size:24px;color:${activePrediction?.win === 'A' ? '#f44' : (activePrediction?.win === 'B' ? '#4af' : '#ff0')};font-weight:bold;">
                        ${activePrediction?.win === "WAIT" || !activePrediction ? "WAITING..." : "PLAYER " + activePrediction.win}
                    </span><br>
                    <span style="font-size:11px;color:#ffd700;">${activePrediction?.reason || "STANDBY"}</span>
                </div>
                <div style="background:#111;padding:8px;border-radius:6px;font-size:11px;">
                    W: ${window.tpStats.wins} | L: ${window.tpStats.losses} | <b>${rate}%</b><br>
                    PNL: <b style="color:#ffd700;">${window.tpStats.units.toFixed(2)} U</b>
                </div>
            `;
            if(document.getElementById('dl-btn')) document.getElementById('dl-btn').innerHTML = `💾 DOWNLOAD LOG (${window.tpLogs.length})`;
        }

        const originalFetch = window.fetch;
        window.fetch = async function (...args) {
            const resp = await originalFetch.apply(this, args);
            try { resp.clone().json().then(json => {
                if (json && typeof json.data === 'string' && json.data.startsWith("U2FsdGVkX1")) {
                    const dec = JSON.parse(CryptoJS.AES.decrypt(json.data, DYNAMIC_SECRET_KEY).toString(CryptoJS.enc.Utf8));
                    const data = dec.original?.data || dec.data;
                    if (data.res && Array.isArray(data.res)) {
                        data.res.reverse().forEach(r => recordRound(r.mid, r.win === "1" ? "A" : (r.win === "2" ? "B" : "TIE")));
                    } else if (data.mid && data.card) {
                        if (String(data.mid) !== activeMid) { 
                            activeMid = String(data.mid); 
                            activePrediction = getPrediction(window.tpLogs);
                            if (activePrediction.win !== "WAIT") clickBet(activePrediction.win);
                        }
                        if (data.card.split(',').length === 6 && !data.card.includes("1")) recordRound(data.mid, calculateWin(data.card));
                    }
                }
                updateEngineUI();
            }); } catch (e) { } return resp;
        };

        // SNIFFER RESTORATION
        const cs = ["webpackChunkfront", "webpackChunk_N_E", "webpackJsonp"];
        cs.forEach(c => { if (window[c]) { window[c].push([[99999], {}, function (e) {
            for (let m in e.m) { try { let mod = e(m); if (mod && mod.AES && mod.AES.decrypt) {
                const orig = mod.AES.decrypt; mod.AES.decrypt = function (cipher, key) {
                    if (!DYNAMIC_SECRET_KEY && key) { DYNAMIC_SECRET_KEY = key.toString(); updateEngineUI(); }
                    return orig.apply(this, arguments);
                };
            } } catch (err) { } }
        }]); } });

        // IMMEDIATE BACKFILL EXECUTION
        performBackfill();
    }
})();