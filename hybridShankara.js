(function () {
    if (typeof CryptoJS === 'undefined') {
        console.log("%c [TP SUITE] Injecting CryptoJS...", "color:yellow");
        let script = document.createElement('script');
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js";
        script.onload = runSuite;
        document.head.appendChild(script);
    } else {
        runSuite();
    }

    function runSuite() {
        const existingUi = document.getElementById("tp-automation-ui");
        if (existingUi) existingUi.remove();

        const LOGS_KEY = 'shankara_tp_logs';
        const STATS_KEY = 'shankara_tp_stats';

        window.tpLogs = JSON.parse(localStorage.getItem(LOGS_KEY)) || [];
        window.tpStats = JSON.parse(localStorage.getItem(STATS_KEY)) || { wins: 0, losses: 0, units: 0 };

        let activeMid = null;
        let activePrediction = null;
        let DYNAMIC_SECRET_KEY = null;

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
            } catch (e) { }
        };

        // 2. UI SETUP
        const container = document.createElement("div");
        container.id = "tp-automation-ui";
        container.style = "position:fixed;top:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:8px;font-family:monospace;width:250px;";
        document.body.appendChild(container);

        const btn = document.createElement("button");
        btn.id = "dl-btn";
        btn.innerHTML = `💾 DOWNLOAD LOG (${window.tpLogs.length})`;
        btn.style = "padding:12px;background:#ffd700;color:#000;border:2px solid #000;cursor:pointer;font-weight:bold;border-radius:4px;";
        container.appendChild(btn);

        const intelBox = document.createElement("div");
        intelBox.id = "tp-intel-box";
        intelBox.style = "background:#000;color:#00ff00;padding:15px;border-radius:8px;font-size:12px;border:2px solid #00ff00;box-shadow:0 0 15px rgba(0,255,0,0.3);line-height:1.6;user-select:none;";
        container.appendChild(intelBox);

        // --- AGGRESSIVE KEY SNIFFER ---
        function extractDynamicKey() {
            const potentialChunks = ["webpackChunkfront", "webpackChunk_N_E", "webpackJsonp"];
            potentialChunks.forEach(chunkName => {
                if (window[chunkName]) {
                    window[chunkName].push([[99999], {}, function (e) {
                        for (let modId in e.m) {
                            try {
                                let mod = e(modId);
                                if (mod && mod.AES && mod.AES.decrypt) {
                                    const originalDecrypt = mod.AES.decrypt;
                                    mod.AES.decrypt = function (cipher, key) {
                                        if (!DYNAMIC_SECRET_KEY && key) {
                                            DYNAMIC_SECRET_KEY = key.toString();
                                            console.log(`%c [TP SUITE] KEY LOCKED: ${DYNAMIC_SECRET_KEY} `, "background:#000;color:#0f0;font-weight:bold;");
                                            updateEngineUI();
                                        }
                                        return originalDecrypt.apply(this, arguments);
                                    };
                                }
                            } catch (err) { }
                        }
                    }]);
                }
            });
        }
        extractDynamicKey();

        /* ---------------- POKER EVALUATOR ---------------- */
        function calculateWin(cardStr) {
            const cards = cardStr.split(',');
            const parseCard = c => {
                let rankStr = c.substring(0, c.length - 2);
                let ranks = { "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, "J": 11, "Q": 12, "K": 13, "A": 14 };
                return { r: ranks[rankStr] || 0, s: c.slice(-2) };
            };
            const getScore = (hand) => {
                hand.sort((a, b) => b.r - a.r);
                const isFlush = hand[0].s === hand[1].s && hand[1].s === hand[2].s;
                let isStraight = (hand[0].r === hand[1].r + 1 && hand[1].r === hand[2].r + 1);
                if (hand[0].r === 14 && hand[1].r === 3 && hand[2].r === 2) isStraight = true;
                const tie = (hand[0].r * 10000) + (hand[1].r * 100) + hand[2].r;
                if (hand[0].r === hand[1].r && hand[1].r === hand[2].r) return 60000000 + tie;
                if (isStraight && isFlush) return 50000000 + tie;
                if (isStraight) return 40000000 + tie;
                if (isFlush) return 30000000 + tie;
                if (hand[0].r === hand[1].r || hand[1].r === hand[2].r) return 20000000 + tie;
                return 10000000 + tie;
            };
            let hA = [parseCard(cards[0]), parseCard(cards[2]), parseCard(cards[4])];
            let hB = [parseCard(cards[1]), parseCard(cards[3]), parseCard(cards[5])];
            let sA = getScore(hA), sB = getScore(hB);
            return sA > sB ? "A" : (sB > sA ? "B" : "TIE");
        }

        /* ---------------- CORE ENGINES ---------------- */
        function fullMarkov1(history) {
            let AA = 1, AB = 1, BA = 1, BB = 1;
            for (let i = 1; i < history.length; i++) {
                const p = history[i - 1], c = history[i];
                if (p === "A" && c === "A") AA++; else if (p === "A" && c === "B") AB++;
                else if (p === "B" && c === "A") BA++; else if (p === "B" && c === "B") BB++;
            }
            const last = history[history.length - 1];
            let pA = (last === "A") ? AA / (AA + AB) : BA / (BA + BB);
            let pB = (last === "A") ? AB / (AA + AB) : BB / (BA + BB);
            return { side: pA > pB ? "A" : "B", conf: Math.max(pA, pB) };
        }

        function fullMarkov2(history) {
            let counts = {AAA:1,AAB:1,ABA:1,ABB:1,BAA:1,BAB:1,BBA:1,BBB:1};
            for (let i = 2; i < history.length; i++) {
                const key = history[i-2] + history[i-1] + history[i];
                if (counts[key] !== undefined) counts[key]++;
            }
            const last2 = history.slice(-2).join("");
            const a = counts[last2 + "A"], b = counts[last2 + "B"];
            const pA = a / (a + b), pB = b / (a + b);
            return { side: pA > pB ? "A" : "B", conf: Math.max(pA, pB) };
        }

        function fullSniper(historyStr) {
            const depths = [5, 4, 3];
            for (let d of depths) {
                const seq = historyStr.slice(-d);
                const firstOccur = historyStr.slice(0, -d).lastIndexOf(seq);
                if (firstOccur !== -1 && historyStr[firstOccur + d]) {
                    return { side: historyStr[firstOccur + d], depth: d };
                }
            }
            return null;
        }

        /* ---------------- REGIME DETECTION ---------------- */
        function alternationScore(history) {
            let alt = 0;
            for(let i=1; i<history.length; i++) { if(history[i] !== history[i-1]) alt++; }
            return alt / (history.length - 1 || 1);
        }

        function streakStrength(history) {
            let streak = 1, max = 1;
            for(let i=1; i<history.length; i++) {
                if(history[i] === history[i-1]) { streak++; if(streak > max) max = streak; }
                else { streak = 1; }
            }
            return max;
        }

        /* ---------------- META-CONTROLLER ---------------- */
        function getDynamicPrediction(data) {
            const history = data.map(r => r.winner).filter(x => x === "A" || x === "B");
            if (history.length < 20) return { win: "WAIT", reason: "COLLECTING" };

            const historyStr = history.join('');
            const recent = history.slice(-10);
            const alt = alternationScore(recent);
            const streak = streakStrength(recent);

            if (alt > 0.45 && alt < 0.65 && streak < 3) return { win: "WAIT", reason: "UNCERTAIN" };

            let res; let label;
            if (streak >= 4 || alt < 0.35) {
                res = fullMarkov2(history); label = "MARKOV-2";
            } else if (alt > 0.7) {
                const snp = fullSniper(historyStr);
                if (snp) return { win: snp.side, reason: `SNIPER | ${snp.depth}d` };
                res = { side: history[history.length-1] === "A" ? "B" : "A", conf: 0.71 }; label = "SNIPER-FADE";
            } else {
                res = fullMarkov1(history); label = "MARKOV-1";
            }

            if (res.conf < 0.52) return { win: "WAIT", reason: "LOW EDGE" };
            return { win: res.side, reason: `${label} | ${Math.round(res.conf*100)}%` };
        }

        /* ---------------- DATA PROCESSORS ---------------- */
        function recordRound(mid, winner) {
            if (!mid || winner === "TIE") return;
            if (window.tpLogs.some(r => String(r.mid) === String(mid))) return;
            
            if (activePrediction && activePrediction.win !== "WAIT") {
                if (activePrediction.win === winner) { window.tpStats.wins++; window.tpStats.units += 0.98; }
                else { window.tpStats.losses++; window.tpStats.units -= 1.0; }
            }
            window.tpLogs.push({ mid: String(mid), winner: winner });
            saveData();
        }

        function processGameData(node) {
            if (!node.mid || !node.card) return;
            if (String(node.mid) !== activeMid) {
                activeMid = String(node.mid);
                activePrediction = getDynamicPrediction(window.tpLogs);
                updateEngineUI();
            }
            const cards = node.card.split(',');
            if (cards.length === 6 && !cards.includes("1")) {
                const winner = calculateWin(node.card);
                recordRound(node.mid, winner);
                updateEngineUI();
            }
        }

        function routeData(payload) {
            if (!payload) return;
            if (payload.res && Array.isArray(payload.res)) {
                payload.res.reverse().forEach(r => {
                    const winner = r.win === "1" ? "A" : (r.win === "2" ? "B" : "TIE");
                    recordRound(r.mid, winner);
                });
                updateEngineUI();
            } else if (payload.mid && payload.card) processGameData(payload);
        }

        /* ---------------- DECRYPTION & NETWORK ---------------- */
        function attemptDecryption(encryptedString) {
            if (!DYNAMIC_SECRET_KEY) return null;
            try {
                const bytes = CryptoJS.AES.decrypt(encryptedString, DYNAMIC_SECRET_KEY);
                return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
            } catch (e) { return null; }
        }

        function updateEngineUI() {
            const data = window.tpLogs;
            const total = window.tpStats.wins + window.tpStats.losses;
            const rate = total > 0 ? ((window.tpStats.wins / total) * 100).toFixed(1) : 0;
            let displayWin = "WAITING..."; let displayReason = "STANDBY";
            if (activePrediction) {
                displayWin = activePrediction.win === "WAIT" ? "WAITING..." : "PLAYER " + activePrediction.win;
                displayReason = activePrediction.reason;
            }
            let keyStatus = DYNAMIC_SECRET_KEY ? `<span style="color:#0f0">KEY LOCKED</span>` : `<span style="color:#f00;animation:blink 1s infinite;">SNIFFING...</span>`;
            const intelEl = document.getElementById('tp-intel-box');
            if (!intelEl) return;
            intelEl.innerHTML = `
                <style>@keyframes blink { 50% { opacity: 0; } }</style>
                <b style="color:#0ff;">V8.4 UNITY CORE (SHANKARA)</b><br>
                <div style="text-align:center;font-size:10px;margin-bottom:5px;">${keyStatus}</div>
                <div style="text-align:center;padding:10px;">
                    <span style="font-size:24px;color:${activePrediction?.win === 'A' ? '#f44' : (activePrediction?.win === 'B' ? '#4af' : '#ff0')};font-weight:bold;">${displayWin}</span><br>
                    <span style="font-size:11px;color:#ffd700;">${displayReason}</span>
                </div>
                <div style="background:#111;padding:8px;border-radius:6px;font-size:11px;">
                    W: ${window.tpStats.wins} | L: ${window.tpStats.losses} | <b>${rate}%</b><br>
                    PNL: <b style="color:#ffd700;">${window.tpStats.units.toFixed(2)} U</b>
                </div>
            `;
            const dlBtn = document.getElementById('dl-btn');
            if (dlBtn) dlBtn.innerHTML = `💾 DOWNLOAD LOG (${data.length})`;
        }

        const originalFetch = window.fetch;
        window.fetch = async function (...args) {
            const response = await originalFetch.apply(this, args);
            try {
                response.clone().json().then(json => {
                    if (json && typeof json.data === 'string' && json.data.startsWith("U2FsdGVkX1")) {
                        const decryptedObj = attemptDecryption(json.data);
                        if (decryptedObj) routeData(decryptedObj.original?.data || decryptedObj.data);
                    } else if (json) routeData(json.original?.data || json.data);
                });
            } catch (e) { }
            return response;
        };

        const originalXHR = window.XMLHttpRequest.prototype.open;
        window.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
            this.addEventListener('load', function () {
                try {
                    const json = JSON.parse(this.responseText);
                    if (json && typeof json.data === 'string' && json.data.startsWith("U2FsdGVkX1")) {
                        const decryptedObj = attemptDecryption(json.data);
                        if (decryptedObj) routeData(decryptedObj.original?.data || decryptedObj.data);
                    } else routeData(json.original?.data || json.data);
                } catch (e) { }
            });
            originalXHR.call(this, method, url, ...rest);
        };

        setInterval(() => { updateEngineUI(); }, 5000);
        updateEngineUI();
        console.log("%c SHANKARA V8.4 UNITY VIEW-ONLY LOADED ", "color:#0f0; font-weight:bold;");
    }
})();












// with order placement


(function () {
    if (typeof CryptoJS === 'undefined') {
        console.log("%c [TP SUITE] Injecting CryptoJS...", "color:yellow");
        let script = document.createElement('script');
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js";
        script.onload = runSuite;
        document.head.appendChild(script);
    } else {
        runSuite();
    }

    function runSuite() {
        const existingUi = document.getElementById("tp-automation-ui");
        if (existingUi) existingUi.remove();

        const LOGS_KEY = 'shankara_tp_logs';
        const STATS_KEY = 'shankara_tp_stats';

        window.tpLogs = JSON.parse(localStorage.getItem(LOGS_KEY)) || [];
        window.tpStats = JSON.parse(localStorage.getItem(STATS_KEY)) || { wins: 0, losses: 0, units: 0 };

        let activeMid = null;
        let activePrediction = null;
        let DYNAMIC_SECRET_KEY = null;

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
            } catch (e) { }
        };

        // 2. UI SETUP
        const container = document.createElement("div");
        container.id = "tp-automation-ui";
        container.style = "position:fixed;top:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:8px;font-family:monospace;width:250px;";
        document.body.appendChild(container);

        const btn = document.createElement("button");
        btn.id = "dl-btn";
        btn.innerHTML = `💾 DOWNLOAD LOG (${window.tpLogs.length})`;
        btn.style = "padding:12px;background:#ffd700;color:#000;border:2px solid #000;cursor:pointer;font-weight:bold;border-radius:4px;";
        container.appendChild(btn);

        const intelBox = document.createElement("div");
        intelBox.id = "tp-intel-box";
        intelBox.style = "background:#000;color:#00ff00;padding:15px;border-radius:8px;font-size:12px;border:2px solid #00ff00;box-shadow:0 0 15px rgba(0,255,0,0.3);line-height:1.6;user-select:none;";
        container.appendChild(intelBox);

        // --- AGGRESSIVE KEY SNIFFER ---
        function extractDynamicKey() {
            const potentialChunks = ["webpackChunkfront", "webpackChunk_N_E", "webpackJsonp"];
            potentialChunks.forEach(chunkName => {
                if (window[chunkName]) {
                    window[chunkName].push([[99999], {}, function (e) {
                        for (let modId in e.m) {
                            try {
                                let mod = e(modId);
                                if (mod && mod.AES && mod.AES.decrypt) {
                                    const originalDecrypt = mod.AES.decrypt;
                                    mod.AES.decrypt = function (cipher, key) {
                                        if (!DYNAMIC_SECRET_KEY && key) {
                                            DYNAMIC_SECRET_KEY = key.toString();
                                            console.log(`%c [TP SUITE] KEY LOCKED: ${DYNAMIC_SECRET_KEY} `, "background:#000;color:#0f0;font-weight:bold;");
                                            updateEngineUI();
                                        }
                                        return originalDecrypt.apply(this, arguments);
                                    };
                                }
                            } catch (err) { }
                        }
                    }]);
                }
            });
        }
        extractDynamicKey();

        /* ---------------- POKER EVALUATOR ---------------- */
        function calculateWin(cardStr) {
            const cards = cardStr.split(',');
            const parseCard = c => {
                let rankStr = c.substring(0, c.length - 2);
                let ranks = { "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, "J": 11, "Q": 12, "K": 13, "A": 14 };
                return { r: ranks[rankStr] || 0, s: c.slice(-2) };
            };
            const getScore = (hand) => {
                hand.sort((a, b) => b.r - a.r);
                const isFlush = hand[0].s === hand[1].s && hand[1].s === hand[2].s;
                let isStraight = (hand[0].r === hand[1].r + 1 && hand[1].r === hand[2].r + 1);
                if (hand[0].r === 14 && hand[1].r === 3 && hand[2].r === 2) isStraight = true;
                const tie = (hand[0].r * 10000) + (hand[1].r * 100) + hand[2].r;
                if (hand[0].r === hand[1].r && hand[1].r === hand[2].r) return 60000000 + tie;
                if (isStraight && isFlush) return 50000000 + tie;
                if (isStraight) return 40000000 + tie;
                if (isFlush) return 30000000 + tie;
                if (hand[0].r === hand[1].r || hand[1].r === hand[2].r) return 20000000 + tie;
                return 10000000 + tie;
            };
            let hA = [parseCard(cards[0]), parseCard(cards[2]), parseCard(cards[4])];
            let hB = [parseCard(cards[1]), parseCard(cards[3]), parseCard(cards[5])];
            let sA = getScore(hA), sB = getScore(hB);
            return sA > sB ? "A" : (sB > sA ? "B" : "TIE");
        }

        /* ---------------- CORE ENGINES ---------------- */
        function fullMarkov1(history) {
            let AA = 1, AB = 1, BA = 1, BB = 1;
            for (let i = 1; i < history.length; i++) {
                const p = history[i - 1], c = history[i];
                if (p === "A" && c === "A") AA++; else if (p === "A" && c === "B") AB++;
                else if (p === "B" && c === "A") BA++; else if (p === "B" && c === "B") BB++;
            }
            const last = history[history.length - 1];
            let pA = (last === "A") ? AA / (AA + AB) : BA / (BA + BB);
            let pB = (last === "A") ? AB / (AA + AB) : BB / (BA + BB);
            return { side: pA > pB ? "A" : "B", conf: Math.max(pA, pB) };
        }

        function fullMarkov2(history) {
            let counts = {AAA:1,AAB:1,ABA:1,ABB:1,BAA:1,BAB:1,BBA:1,BBB:1};
            for (let i = 2; i < history.length; i++) {
                const key = history[i-2] + history[i-1] + history[i];
                if (counts[key] !== undefined) counts[key]++;
            }
            const last2 = history.slice(-2).join("");
            const a = counts[last2 + "A"], b = counts[last2 + "B"];
            const pA = a / (a + b), pB = b / (a + b);
            return { side: pA > pB ? "A" : "B", conf: Math.max(pA, pB) };
        }

        function fullSniper(historyStr) {
            const depths = [5, 4, 3];
            for (let d of depths) {
                const seq = historyStr.slice(-d);
                const firstOccur = historyStr.slice(0, -d).lastIndexOf(seq);
                if (firstOccur !== -1 && historyStr[firstOccur + d]) {
                    return { side: historyStr[firstOccur + d], depth: d };
                }
            }
            return null;
        }

        /* ---------------- META-CONTROLLER ---------------- */
        function getDynamicPrediction(data) {
            const history = data.map(r => r.winner).filter(x => x === "A" || x === "B");
            if (history.length < 20) return { win: "WAIT", reason: "COLLECTING" };

            const historyStr = history.join('');
            const recent = history.slice(-10);
            const alt = alternationScore(recent);
            const streak = streakStrength(recent);

            if (alt > 0.45 && alt < 0.65 && streak < 3) return { win: "WAIT", reason: "UNCERTAIN" };

            let res; let label;
            if (streak >= 4 || alt < 0.35) {
                res = fullMarkov2(history); label = "MARKOV-2";
            } else if (alt > 0.7) {
                const snp = fullSniper(historyStr);
                if (snp) return { win: snp.side, reason: `SNIPER | ${snp.depth}d` };
                res = { side: history[history.length-1] === "A" ? "B" : "A", conf: 0.71 }; label = "SNIPER-FADE";
            } else {
                res = fullMarkov1(history); label = "MARKOV-1";
            }

            if (res.conf < 0.52) return { win: "WAIT", reason: "LOW EDGE" };
            return { win: res.side, reason: `${label} | ${Math.round(res.conf*100)}%` };
        }

        /* ---------------- REGIME DETECTION ---------------- */
        function alternationScore(history) {
            let alt = 0;
            for(let i=1; i<history.length; i++) { if(history[i] !== history[i-1]) alt++; }
            return alt / (history.length - 1 || 1);
        }

        function streakStrength(history) {
            let streak = 1, max = 1;
            for(let i=1; i<history.length; i++) {
                if(history[i] === history[i-1]) { streak++; if(streak > max) max = streak; }
                else { streak = 1; }
            }
            return max;
        }

        /* ---------------- SHANKARA ORDER PLACEMENT ---------------- */
        function executeWager() {
            let attempts = 0;
            const fillSlip = setInterval(() => {
                attempts++; if (attempts > 20) { clearInterval(fillSlip); return; }
                const stakeInput = document.querySelector('input[placeholder="Enter Stake"]');
                const submitBtn = document.querySelector('.p-4.bg-card.border-t button');
                if (stakeInput && submitBtn && stakeInput.offsetParent !== null) {
                    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                    setter.call(stakeInput, "50"); // Fixed Stake
                    stakeInput.dispatchEvent(new Event('input', { bubbles: true }));
                    stakeInput.dispatchEvent(new Event('change', { bubbles: true }));
                    setTimeout(() => { if(!submitBtn.disabled) submitBtn.click(); }, 350);
                    clearInterval(fillSlip);
                }
            }, 100);
        }

        function clickBet(side) {
            const target = "Player " + side;
            let attempts = 0;
            const scan = setInterval(() => {
                attempts++; if (attempts > 25) { clearInterval(scan); return; }
                const containers = document.querySelectorAll('.bg-background.border-2.overflow-hidden');
                for (let c of containers) {
                    if (c.innerText.includes(target)) {
                        const backBtn = c.querySelector('.bg-back');
                        if (backBtn && !backBtn.classList.contains('cursor-not-allowed')) {
                            clearInterval(scan);
                            setTimeout(() => { backBtn.click(); executeWager(); }, 2000);
                            return;
                        }
                    }
                }
            }, 500);
        }

        /* ---------------- DATA PROCESSORS ---------------- */
        function recordRound(mid, winner) {
            if (!mid || winner === "TIE") return;
            if (window.tpLogs.some(r => String(r.mid) === String(mid))) return;
            
            if (activePrediction && activePrediction.win !== "WAIT") {
                if (activePrediction.win === winner) { window.tpStats.wins++; window.tpStats.units += 0.98; }
                else { window.tpStats.losses++; window.tpStats.units -= 1.0; }
            }
            window.tpLogs.push({ mid: String(mid), winner: winner });
            saveData();
        }

        function processGameData(node) {
            if (!node.mid || !node.card) return;
            if (String(node.mid) !== activeMid) {
                activeMid = String(node.mid);
                activePrediction = getDynamicPrediction(window.tpLogs);
                updateEngineUI();
                if (activePrediction?.win !== "WAIT") clickBet(activePrediction.win);
            }
            const cards = node.card.split(',');
            if (cards.length === 6 && !cards.includes("1")) {
                const winner = calculateWin(node.card);
                recordRound(node.mid, winner);
                updateEngineUI();
            }
        }

        function routeData(payload) {
            if (!payload) return;
            if (payload.res && Array.isArray(payload.res)) {
                payload.res.reverse().forEach(r => {
                    const winner = r.win === "1" ? "A" : (r.win === "2" ? "B" : "TIE");
                    recordRound(r.mid, winner);
                });
                updateEngineUI();
            } else if (payload.mid && payload.card) processGameData(payload);
        }

        /* ---------------- DECRYPTION & UI ---------------- */
        function attemptDecryption(encryptedString) {
            if (!DYNAMIC_SECRET_KEY) return null;
            try {
                const bytes = CryptoJS.AES.decrypt(encryptedString, DYNAMIC_SECRET_KEY);
                return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
            } catch (e) { return null; }
        }

        function updateEngineUI() {
            const data = window.tpLogs;
            const total = window.tpStats.wins + window.tpStats.losses;
            const rate = total > 0 ? ((window.tpStats.wins / total) * 100).toFixed(1) : 0;
            let displayWin = "WAITING..."; let displayReason = "STANDBY";
            if (activePrediction) {
                displayWin = activePrediction.win === "WAIT" ? "WAITING..." : "PLAYER " + activePrediction.win;
                displayReason = activePrediction.reason;
            }
            let keyStatus = DYNAMIC_SECRET_KEY ? `<span style="color:#0f0">KEY LOCKED</span>` : `<span style="color:#f00;animation:blink 1s infinite;">SNIFFING...</span>`;
            const intelEl = document.getElementById('tp-intel-box');
            if (!intelEl) return;
            intelEl.innerHTML = `
                <style>@keyframes blink { 50% { opacity: 0; } }</style>
                <b style="color:#0ff;">V8.4 UNITY AUTO (SHANKARA)</b><br>
                <div style="text-align:center;font-size:10px;margin-bottom:5px;">${keyStatus}</div>
                <div style="text-align:center;padding:10px;">
                    <span style="font-size:24px;color:${activePrediction?.win === 'A' ? '#f44' : (activePrediction?.win === 'B' ? '#4af' : '#ff0')};font-weight:bold;">${displayWin}</span><br>
                    <span style="font-size:11px;color:#ffd700;">${displayReason}</span>
                </div>
                <div style="background:#111;padding:8px;border-radius:6px;font-size:11px;">
                    W: ${window.tpStats.wins} | L: ${window.tpStats.losses} | <b>${rate}%</b><br>
                    PNL: <b style="color:#ffd700;">${window.tpStats.units.toFixed(2)} U</b>
                </div>
            `;
            const dlBtn = document.getElementById('dl-btn');
            if (dlBtn) dlBtn.innerHTML = `💾 DOWNLOAD LOG (${data.length})`;
        }

        const originalFetch = window.fetch;
        window.fetch = async function (...args) {
            const response = await originalFetch.apply(this, args);
            try {
                response.clone().json().then(json => {
                    if (json && typeof json.data === 'string' && json.data.startsWith("U2FsdGVkX1")) {
                        const decryptedObj = attemptDecryption(json.data);
                        if (decryptedObj) routeData(decryptedObj.original?.data || decryptedObj.data);
                    } else if (json) routeData(json.original?.data || json.data);
                });
            } catch (e) { }
            return response;
        };

        const originalXHR = window.XMLHttpRequest.prototype.open;
        window.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
            this.addEventListener('load', function () {
                try {
                    const json = JSON.parse(this.responseText);
                    if (json && typeof json.data === 'string' && json.data.startsWith("U2FsdGVkX1")) {
                        const decryptedObj = attemptDecryption(json.data);
                        if (decryptedObj) routeData(decryptedObj.original?.data || decryptedObj.data);
                    } else routeData(json.original?.data || json.data);
                } catch (e) { }
            });
            originalXHR.call(this, method, url, ...rest);
        };

        setInterval(() => { updateEngineUI(); }, 5000);
        updateEngineUI();
        console.log("%c SHANKARA V8.4 UNITY AUTO-BET LOADED ", "color:#0f0; font-weight:bold;");
    }
})();