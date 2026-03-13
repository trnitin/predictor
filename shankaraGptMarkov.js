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
        window.tpStats = JSON.parse(localStorage.getItem(STATS_KEY)) || { wins: 0, losses: 0, streak: 0, units: 0 };

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
                osc.type = type;
                osc.frequency.setValueAtTime(freq, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start();
                osc.stop(ctx.currentTime + 0.5);
            } catch (e) { }
        };

        const getStorageStats = () => {
            let total = 0;
            for (let x in localStorage) {
                if (localStorage.hasOwnProperty(x)) total += ((localStorage[x].length + x.length) * 2);
            }
            const usedKB = (total / 1024).toFixed(2);
            return { usedKB, percent: ((usedKB / 5120) * 100).toFixed(2) };
        };

        const container = document.createElement("div");
        container.id = "tp-automation-ui";
        container.style = "position:fixed;top:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:8px;font-family:monospace;width:250px;";
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
            if (confirm("Wipe all data and PNL?")) {
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

        function extractDynamicKey() {
            window.webpackChunkfront = window.webpackChunkfront || [];
            window.webpackChunkfront.push([[99999], {}, function (e) {
                for (let modId in e.m) {
                    try {
                        let mod = e(modId);
                        if (mod && mod.AES && mod.AES.decrypt) {
                            const originalDecrypt = mod.AES.decrypt;
                            mod.AES.decrypt = function (cipher, key) {
                                if (!DYNAMIC_SECRET_KEY) {
                                    DYNAMIC_SECRET_KEY = key.toString();
                                    console.log(`%c [TP SUITE] DYNAMIC KEY SECURED: ${DYNAMIC_SECRET_KEY} `, "background:#000;color:#0f0;font-weight:bold;");
                                    updateEngineUI();
                                }
                                return originalDecrypt.apply(this, arguments);
                            };
                        }
                    } catch (err) { }
                }
            }]);
        }
        extractDynamicKey();


        /* ---------------- MARKOV-1 LOGIC ENGINE ---------------- */

        function computeMarkov1(history) {

            let AA = 1, AB = 1, BA = 1, BB = 1;

            for (let i = 1; i < history.length; i++) {

                const p = history[i - 1];
                const c = history[i];

                if (p === "A" && c === "A") AA++;
                if (p === "A" && c === "B") AB++;
                if (p === "B" && c === "A") BA++;
                if (p === "B" && c === "B") BB++;

            }

            return {
                pA_A: AA / (AA + AB),
                pB_A: AB / (AA + AB),
                pA_B: BA / (BA + BB),
                pB_B: BB / (BA + BB)
            };
        }

        function getDynamicPrediction(data) {

            const history = data.map(r => r.winner).filter(x => x === "A" || x === "B");

            if (history.length < 10)
                return { win: "WAIT", reason: "COLLECTING" };

            const markov = computeMarkov1(history);

            const last = history[history.length - 1];

            let pA = 0.5;
            let pB = 0.5;

            if (last === "A") {
                pA = markov.pA_A;
                pB = markov.pB_A;
            } else {
                pA = markov.pA_B;
                pB = markov.pB_B;
            }

            const total = pA + pB || 1;

            pA = pA / total;
            pB = pB / total;

            const prob = Math.max(pA, pB);
            const side = pA > pB ? "A" : "B";

            if (prob < 0.52)
                return { win: "WAIT", reason: "LOW EDGE" };

            return {
                win: side,
                reason: `MARKOV ${(prob * 100).toFixed(1)}%`
            };
        }


        /* ----- POKER EVALUATOR ----- */

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

                let straightScore = hand[0].r;

                if (hand[0].r === 14 && hand[1].r === 3 && hand[2].r === 2) {
                    isStraight = true;
                    straightScore = 13.5;
                }

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

            let scoreA = getScore(handA);
            let scoreB = getScore(handB);

            if (scoreA > scoreB) return "A";
            if (scoreB > scoreA) return "B";
            return "TIE";

        }
        // 6. UI UPDATER
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
            let keyStatus = DYNAMIC_SECRET_KEY ? `<span style="color:#0f0">KEY LOCKED</span>` : `<span style="color:#f00;animation:blink 1s infinite;">SNIFFING KEY...</span>`;

            const btnEl = document.getElementById('dl-btn');
            if (btnEl) btnEl.innerHTML = `💾 DOWNLOAD LOG (${data.length})`;

            const intelEl = document.getElementById('tp-intel-box');
            if (!intelEl) return;

            intelEl.style.borderColor = window.tpStats.streak >= 2 ? "#0f0" : (window.tpStats.streak <= -2 ? "#f00" : "#00ff00");
            intelEl.innerHTML = `
                <style>@keyframes blink { 50% { opacity: 0; } }</style>
                <div style="display:flex;justify-content:space-between;border-bottom:1px solid #333;padding-bottom:5px;margin-bottom:8px;">
                    <b style="color:#0ff;">SHANKARA TP SUITE</b>
                    <span style="font-size:10px;color:#888;">${storage.percent}% DB</span>
                </div>
                <div style="text-align:center;font-size:10px;margin-bottom:5px;">
                    ${keyStatus}
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

        // 7A. HISTORY ARRAY PROCESSOR 
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

                    if (window.tpLogs.length >= 5) {
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
                console.log(`%c [BACKFILL] Imported ${added} rounds. Backtest: ${simWins}W / ${simLosses}L `, "color:#f0f;font-weight:bold;");
                updateEngineUI();
            }
        }

        // 7B. LIVE ROUND PROCESSOR
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

        // 8. UNIVERSAL ROUTER & DYNAMIC DECRYPTOR
        function routeData(payload) {
            if (!payload) return;
            if (payload.res && Array.isArray(payload.res)) processHistoryArray(payload.res);
            else if (payload.mid && payload.card) processGameData(payload);
        }

        function attemptDecryption(encryptedString) {
            if (!DYNAMIC_SECRET_KEY) return null; // Wait until Webpack hook secures the key
            if (!encryptedString || !encryptedString.startsWith("U2FsdGVkX1")) return null;
            try {
                const bytes = CryptoJS.AES.decrypt(encryptedString, DYNAMIC_SECRET_KEY);
                const decryptedStr = bytes.toString(CryptoJS.enc.Utf8);
                return JSON.parse(decryptedStr);
            } catch (e) {
                return null;
            }
        }

        const originalFetch = window.fetch;
        window.fetch = async function (...args) {
            const response = await originalFetch.apply(this, args);
            try {
                response.clone().json().then(json => {
                    if (json && typeof json.data === 'string' && json.data.startsWith("U2FsdGVkX1")) {
                        const decryptedObj = attemptDecryption(json.data);
                        if (decryptedObj) {
                            if (decryptedObj.original && decryptedObj.original.data) routeData(decryptedObj.original.data);
                            else if (decryptedObj.data) routeData(decryptedObj.data);
                        }
                    }
                    else if (json && json.original && json.original.data) routeData(json.original.data);
                    else if (json && json.data) routeData(json.data);
                }).catch(e => { });
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
                        if (decryptedObj) {
                            if (decryptedObj.original && decryptedObj.original.data) routeData(decryptedObj.original.data);
                            else if (decryptedObj.data) routeData(decryptedObj.data);
                        }
                    }
                    else if (json && json.original && json.original.data) routeData(json.original.data);
                    else if (json && json.data) routeData(json.data);
                } catch (e) { }
            });
            originalXHR.call(this, method, url, ...rest);
        };

        // 9. DOWNLOAD & IDLE CONTROL
        btn.onclick = (e) => {
            e.preventDefault();
            const currentLogs = JSON.parse(localStorage.getItem(LOGS_KEY)) || [];
            if (currentLogs.length === 0) return alert("No data yet!");
            const content = currentLogs.map(r => `${r.mid},${r.winner},${r.cards_A},${r.cards_B}`).join("\n");
            const blob = new Blob([content], { type: "text/plain" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = `shankara_tp_dataset_${Date.now()}.csv`;
            link.click();
        };

        setInterval(() => {
            window.scrollBy(0, 10);
            setTimeout(() => window.scrollBy(0, -10), 1000);
            updateEngineUI();
        }, 5000);

        updateEngineUI();

        console.log("%c SHANKARA TP Markov  SUITE ONLINE | AUTO-DECRYPTION ENGAGED ", "background:#000;color:#0f0;font-weight:bold;font-size:14px;");
    }
})();



// order placement
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
        window.tpStats = JSON.parse(localStorage.getItem(STATS_KEY)) || { wins: 0, losses: 0, streak: 0, units: 0 };

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
                osc.type = type;
                osc.frequency.setValueAtTime(freq, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start();
                osc.stop(ctx.currentTime + 0.5);
            } catch (e) { }
        };

        const getStorageStats = () => {
            let total = 0;
            for (let x in localStorage) {
                if (localStorage.hasOwnProperty(x)) total += ((localStorage[x].length + x.length) * 2);
            }
            const usedKB = (total / 1024).toFixed(2);
            return { usedKB, percent: ((usedKB / 5120) * 100).toFixed(2) };
        };

        const container = document.createElement("div");
        container.id = "tp-automation-ui";
        container.style = "position:fixed;top:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:8px;font-family:monospace;width:250px;";
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
            if (confirm("Wipe all data and PNL?")) {
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

        function extractDynamicKey() {
            window.webpackChunkfront = window.webpackChunkfront || [];
            window.webpackChunkfront.push([[99999], {}, function (e) {
                for (let modId in e.m) {
                    try {
                        let mod = e(modId);
                        if (mod && mod.AES && mod.AES.decrypt) {
                            const originalDecrypt = mod.AES.decrypt;
                            mod.AES.decrypt = function (cipher, key) {
                                if (!DYNAMIC_SECRET_KEY) {
                                    DYNAMIC_SECRET_KEY = key.toString();
                                    console.log(`%c [TP SUITE] DYNAMIC KEY SECURED: ${DYNAMIC_SECRET_KEY} `, "background:#000;color:#0f0;font-weight:bold;");
                                    updateEngineUI();
                                }
                                return originalDecrypt.apply(this, arguments);
                            };
                        }
                    } catch (err) { }
                }
            }]);
        }
        extractDynamicKey();


        /* ---------------- MARKOV-1 LOGIC ENGINE ---------------- */

        function computeMarkov1(history) {

            let AA = 1, AB = 1, BA = 1, BB = 1;

            for (let i = 1; i < history.length; i++) {

                const p = history[i - 1];
                const c = history[i];

                if (p === "A" && c === "A") AA++;
                if (p === "A" && c === "B") AB++;
                if (p === "B" && c === "A") BA++;
                if (p === "B" && c === "B") BB++;

            }

            return {
                pA_A: AA / (AA + AB),
                pB_A: AB / (AA + AB),
                pA_B: BA / (BA + BB),
                pB_B: BB / (BA + BB)
            };
        }

        function getDynamicPrediction(data) {

            const history = data.map(r => r.winner).filter(x => x === "A" || x === "B");

            if (history.length < 10)
                return { win: "WAIT", reason: "COLLECTING" };

            const markov = computeMarkov1(history);

            const last = history[history.length - 1];

            let pA = 0.5;
            let pB = 0.5;

            if (last === "A") {
                pA = markov.pA_A;
                pB = markov.pB_A;
            } else {
                pA = markov.pA_B;
                pB = markov.pB_B;
            }

            const total = pA + pB || 1;

            pA = pA / total;
            pB = pB / total;

            const prob = Math.max(pA, pB);
            const side = pA > pB ? "A" : "B";

            if (prob < 0.52)
                return { win: "WAIT", reason: "LOW EDGE" };

            return {
                win: side,
                reason: `MARKOV ${(prob * 100).toFixed(1)}%`
            };
        }

        /* ----- ADDITION: SHANKARA ORDER PLACEMENT ----- */

        function executeWager() {
            let attempts = 0;
            const fillSlip = setInterval(() => {
                attempts++;
                if (attempts > 20) { clearInterval(fillSlip); return; }
                
                const stakeInput = document.querySelector('input[placeholder="Enter Stake"]');
                const submitContainer = document.querySelector('.p-4.bg-card.border-t');
                const submitBtn = submitContainer ? submitContainer.querySelector('button') : null;

                if (stakeInput && submitBtn && stakeInput.offsetParent !== null) {
                    const nativeValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                    nativeValueSetter.call(stakeInput, "50"); // Stake Amount
                    stakeInput.dispatchEvent(new Event('input', { bubbles: true }));
                    stakeInput.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    setTimeout(() => {
                        const finalBtn = document.querySelector('.p-4.bg-card.border-t button');
                        if (finalBtn && !finalBtn.disabled) finalBtn.click();
                    }, 350);
                    clearInterval(fillSlip);
                }
            }, 100);
        }

        function clickBet(predictedWinner) {
            if (predictedWinner !== "A" && predictedWinner !== "B") return;
            const targetName = "Player " + predictedWinner;
            let attempts = 0;
            
            const tryClick = setInterval(() => {
                attempts++;
                if (attempts > 25) { clearInterval(tryClick); return; }
                
                const containers = document.querySelectorAll('.bg-background.border-2.overflow-hidden');
                for (let container of containers) {
                    if (container.innerText.includes(targetName)) {
                        const rows = container.querySelectorAll('.border-b.border-neutral-300');
                        for (let row of rows) {
                            if (row.innerText.includes('Main')) {
                                const backBtn = row.querySelector('.bg-back');
                                if (backBtn && !backBtn.classList.contains('cursor-not-allowed')) {
                                    clearInterval(tryClick);
                                    setTimeout(() => {
                                        backBtn.click();
                                        executeWager();
                                    }, 2000); 
                                    return;
                                }
                            }
                        }
                    }
                }
            }, 500);
        }

        /* ----- POKER EVALUATOR ----- */

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

                let straightScore = hand[0].r;

                if (hand[0].r === 14 && hand[1].r === 3 && hand[2].r === 2) {
                    isStraight = true;
                    straightScore = 13.5;
                }

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

            let scoreA = getScore(handA);
            let scoreB = getScore(handB);

            if (scoreA > scoreB) return "A";
            if (scoreB > scoreA) return "B";
            return "TIE";

        }
        // 6. UI UPDATER
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
            let keyStatus = DYNAMIC_SECRET_KEY ? `<span style="color:#0f0">KEY LOCKED</span>` : `<span style="color:#f00;animation:blink 1s infinite;">SNIFFING KEY...</span>`;

            const btnEl = document.getElementById('dl-btn');
            if (btnEl) btnEl.innerHTML = `💾 DOWNLOAD LOG (${data.length})`;

            const intelEl = document.getElementById('tp-intel-box');
            if (!intelEl) return;

            intelEl.style.borderColor = window.tpStats.streak >= 2 ? "#0f0" : (window.tpStats.streak <= -2 ? "#f00" : "#00ff00");
            intelEl.innerHTML = `
                <style>@keyframes blink { 50% { opacity: 0; } }</style>
                <div style="display:flex;justify-content:space-between;border-bottom:1px solid #333;padding-bottom:5px;margin-bottom:8px;">
                    <b style="color:#0ff;">SHANKARA MARKOV (AUTO)</b>
                    <span style="font-size:10px;color:#888;">${storage.percent}% DB</span>
                </div>
                <div style="text-align:center;font-size:10px;margin-bottom:5px;">
                    ${keyStatus}
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

        // 7A. HISTORY ARRAY PROCESSOR 
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

                    if (window.tpLogs.length >= 5) {
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
                console.log(`%c [BACKFILL] Imported ${added} rounds. Backtest: ${simWins}W / ${simLosses}L `, "color:#f0f;font-weight:bold;");
                updateEngineUI();
            }
        }

        // 7B. LIVE ROUND PROCESSOR
        function processGameData(d) {
            if (!d || !d.mid || !d.card) return;
            const mid = String(d.mid);
            const cardStr = d.card;

            if (mid !== activeMid) {
                activeMid = mid;
                activePrediction = getDynamicPrediction(window.tpLogs);
                updateEngineUI();
                
                // TRIGGER AUTO-CLICKER
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

        // 8. UNIVERSAL ROUTER & DYNAMIC DECRYPTOR
        function routeData(payload) {
            if (!payload) return;
            if (payload.res && Array.isArray(payload.res)) processHistoryArray(payload.res);
            else if (payload.mid && payload.card) processGameData(payload);
        }

        function attemptDecryption(encryptedString) {
            if (!DYNAMIC_SECRET_KEY) return null; 
            if (!encryptedString || !encryptedString.startsWith("U2FsdGVkX1")) return null;
            try {
                const bytes = CryptoJS.AES.decrypt(encryptedString, DYNAMIC_SECRET_KEY);
                const decryptedStr = bytes.toString(CryptoJS.enc.Utf8);
                return JSON.parse(decryptedStr);
            } catch (e) {
                return null;
            }
        }

        const originalFetch = window.fetch;
        window.fetch = async function (...args) {
            const response = await originalFetch.apply(this, args);
            try {
                response.clone().json().then(json => {
                    if (json && typeof json.data === 'string' && json.data.startsWith("U2FsdGVkX1")) {
                        const decryptedObj = attemptDecryption(json.data);
                        if (decryptedObj) {
                            if (decryptedObj.original && decryptedObj.original.data) routeData(decryptedObj.original.data);
                            else if (decryptedObj.data) routeData(decryptedObj.data);
                        }
                    }
                    else if (json && json.original && json.original.data) routeData(json.original.data);
                    else if (json && json.data) routeData(json.data);
                }).catch(e => { });
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
                        if (decryptedObj) {
                            if (decryptedObj.original && decryptedObj.original.data) routeData(decryptedObj.original.data);
                            else if (decryptedObj.data) routeData(decryptedObj.data);
                        }
                    }
                    else if (json && json.original && json.original.data) routeData(json.original.data);
                    else if (json && json.data) routeData(json.data);
                } catch (e) { }
            });
            originalXHR.call(this, method, url, ...rest);
        };

        // 9. DOWNLOAD & IDLE CONTROL
        btn.onclick = (e) => {
            e.preventDefault();
            const currentLogs = JSON.parse(localStorage.getItem(LOGS_KEY)) || [];
            if (currentLogs.length === 0) return alert("No data yet!");
            const content = currentLogs.map(r => `${r.mid},${r.winner},${r.cards_A},${r.cards_B}`).join("\n");
            const blob = new Blob([content], { type: "text/plain" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = `shankara_markov_dataset_${Date.now()}.csv`;
            link.click();
        };

        setInterval(() => {
            window.scrollBy(0, 10);
            setTimeout(() => window.scrollBy(0, -10), 1000);
            updateEngineUI();
        }, 5000);

        updateEngineUI();

        console.log("%c SHANKARA MARKOV SUITE ONLINE | AUTO-BETTING ENGAGED ", "background:#000;color:#0f0;font-weight:bold;font-size:14px;");
    }
})();