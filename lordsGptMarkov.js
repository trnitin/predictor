// No order
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

    // 3. STATISTICAL LOGIC ENGINE

    function computeMarkov(history) {
        let AA=0,AB=0,BA=0,BB=0;
        for(let i=1;i<history.length;i++){
            const p=history[i-1];
            const c=history[i];
            if(p==="A"&&c==="A")AA++;
            if(p==="A"&&c==="B")AB++;
            if(p==="B"&&c==="A")BA++;
            if(p==="B"&&c==="B")BB++;
        }
        return {
            pA_A:AA/(AA+AB||1),
            pB_A:AB/(AA+AB||1),
            pA_B:BA/(BA+BB||1),
            pB_B:BB/(BA+BB||1)
        };
    }

    function streakStats(history){
        let last=history[history.length-1];
        let streak=1;
        for(let i=history.length-2;i>=0;i--){
            if(history[i]===last)streak++;
            else break;
        }

        let survive=0,total=0;
        for(let i=1;i<history.length;i++){
            if(history[i-1]===last){
                total++;
                if(history[i]===last)survive++;
            }
        }

        return {streak,last,survivalProb:survive/(total||1)};
    }

    function entropy(history){
        const n=history.length;
        const a=history.filter(x=>x==="A").length;
        const b=history.filter(x=>x==="B").length;
        const pA=a/n||0.0001;
        const pB=b/n||0.0001;
        return -(pA*Math.log2(pA)+pB*Math.log2(pB));
    }

    function detectRegime(history){
        const last20=history.slice(-20);
        let transitions=0;
        for(let i=1;i<last20.length;i++){
            if(last20[i]!==last20[i-1])transitions++;
        }
        const ratio=transitions/(last20.length-1||1);
        if(ratio>0.65)return "CHOP";
        if(ratio<0.35)return "TREND";
        return "MIXED";
    }

  function computeConfidence(prob,entropyVal){

    let conf=prob;

    if(entropyVal>0.96)
        conf*=0.7;

    if(entropyVal>0.985)
        conf*=0.4;

    return conf;
}

  function getDynamicPrediction(data){

    const history=data.map(r=>r.winner).filter(x=>x==="A"||x==="B");

    // lower warmup threshold
    if(history.length<12)
        return {win:"WAIT",reason:"COLLECTING DATA"};

    const markov=computeMarkov(history);
    const streak=streakStats(history);
    const H=entropy(history.slice(-40));
    const regime=detectRegime(history);

    const last=history[history.length-1];

    let pA=0.5,pB=0.5;

    if(last==="A"){
        pA=markov.pA_A;
        pB=markov.pB_A;
    }else{
        pA=markov.pA_B;
        pB=markov.pB_B;
    }

    // streak survival influence
    if(regime==="TREND"){
        if(streak.last==="A")
            pA=(pA+streak.survivalProb)/2;
        else
            pB=(pB+streak.survivalProb)/2;
    }

    // chop adjustment
    if(regime==="CHOP"){
        if(last==="A") pB+=0.08;
        else pA+=0.08;
    }

    const prob=Math.max(pA,pB);
    const side=pA>pB?"A":"B";

    const confidence=computeConfidence(prob,H);

    // entropy filter (less aggressive)
    if(H>0.99)
        return {win:"WAIT",reason:"HIGH ENTROPY"};

    // edge filter
    if(confidence<0.515)
        return {win:"WAIT",reason:"LOW EDGE"};

    return {
        win:side,
        reason:`${regime} | CONF ${(confidence*100).toFixed(1)}%`
    };
}

    // SECTION 4–9 BELOW REMAINS EXACTLY AS YOU PROVIDED
    // (Poker evaluator, UI updater, history processor, live round processor,
    // JSON scanner, network hooks, download handler, interval refresh)

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
                <b style="color:#0ff;">1-DAY TP MASTER (TRACKING ONLY)</b>
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
            // Auto-clicker trigger completely removed here
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
                updateEngineUI();
            }
        }
    }

    // 7. NEW DEEP JSON SCANNER (Bypasses Framework Flattening)
    function parseAndRoute(rawText) {
        if (!rawText) return;
        let payload;
        try { payload = JSON.parse(rawText); } catch(e) { return; }

        let extractedGames = [];
        let extractedHistory = [];

        function traverse(node, depth = 0) {
            if (depth > 50 || !node || typeof node !== 'object') return;

            // Target the specific p.k and p.v framework structure
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

            // Fallback for standard flat objects
            if (node.mid && node.card && typeof node.mid !== 'object') {
                extractedGames.push({ mid: String(node.mid), card: String(node.card) });
            }

            if (Array.isArray(node)) {
                if (node.length > 0 && node[0].mid && node[0].win) {
                    node.forEach(r => extractedHistory.push(r));
                }
            }

            for (let key in node) {
                traverse(node[key], depth + 1);
            }
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

    // 8. NEW NETWORK HOOKS
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const response = await originalFetch.apply(this, args);
        try {
            response.clone().text().then(text => parseAndRoute(text)).catch(e => {});
        } catch(e) {}
        return response;
    };

    const originalXHR = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this.addEventListener('load', function() {
            try {
                parseAndRoute(this.responseText);
            } catch(e) {}
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
        link.download = `1day_teenpatti_dataset_${Date.now()}.csv`;
        link.click();
    };

    setInterval(() => {
        window.scrollBy(0, 10);
        setTimeout(() => window.scrollBy(0, -10), 1000);
        updateEngineUI(); 
    }, 5000);

    updateEngineUI();
    console.log("%c MASTER 1-DAY markov TP SUITE ONLINE | TRACKING ONLY ", "background:#000; color:#0f0; font-weight:bold; font-size:14px;");

})();







// with order
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

    // 3. YOUR EXACT STATISTICAL LOGIC ENGINE (UNTOUCHED)

    function computeMarkov(history) {
        let AA=0,AB=0,BA=0,BB=0;
        for(let i=1;i<history.length;i++){
            const p=history[i-1];
            const c=history[i];
            if(p==="A"&&c==="A")AA++;
            if(p==="A"&&c==="B")AB++;
            if(p==="B"&&c==="A")BA++;
            if(p==="B"&&c==="B")BB++;
        }
        return {
            pA_A:AA/(AA+AB||1),
            pB_A:AB/(AA+AB||1),
            pA_B:BA/(BA+BB||1),
            pB_B:BB/(BA+BB||1)
        };
    }

    function streakStats(history){
        let last=history[history.length-1];
        let streak=1;
        for(let i=history.length-2;i>=0;i--){
            if(history[i]===last)streak++;
            else break;
        }
        let survive=0,total=0;
        for(let i=1;i<history.length;i++){
            if(history[i-1]===last){
                total++;
                if(history[i]===last)survive++;
            }
        }
        return {streak,last,survivalProb:survive/(total||1)};
    }

    function entropy(history){
        const n=history.length;
        const a=history.filter(x=>x==="A").length;
        const b=history.filter(x=>x==="B").length;
        const pA=a/n||0.0001;
        const pB=b/n||0.0001;
        return -(pA*Math.log2(pA)+pB*Math.log2(pB));
    }

    function detectRegime(history){
        const last20=history.slice(-20);
        let transitions=0;
        for(let i=1;i<last20.length;i++){
            if(last20[i]!==last20[i-1])transitions++;
        }
        const ratio=transitions/(last20.length-1||1);
        if(ratio>0.65)return "CHOP";
        if(ratio<0.35)return "TREND";
        return "MIXED";
    }

    function computeConfidence(prob,entropyVal){
        let conf=prob;
        if(entropyVal>0.96) conf*=0.7;
        if(entropyVal>0.985) conf*=0.4;
        return conf;
    }

    function getDynamicPrediction(data){
        const history=data.map(r=>r.winner).filter(x=>x==="A"||x==="B");
        if(history.length<12) return {win:"WAIT",reason:"COLLECTING DATA"};
        const markov=computeMarkov(history);
        const streak=streakStats(history);
        const H=entropy(history.slice(-40));
        const regime=detectRegime(history);
        const last=history[history.length-1];
        let pA=0.5,pB=0.5;
        if(last==="A"){ pA=markov.pA_A; pB=markov.pB_A; }
        else{ pA=markov.pA_B; pB=markov.pB_B; }
        if(regime==="TREND"){
            if(streak.last==="A") pA=(pA+streak.survivalProb)/2;
            else pB=(pB+streak.survivalProb)/2;
        }
        if(regime==="CHOP"){
            if(last==="A") pB+=0.08; else pA+=0.08;
        }
        const prob=Math.max(pA,pB);
        const side=pA>pB?"A":"B";
        const confidence=computeConfidence(prob,H);
        if(H>0.99) return {win:"WAIT",reason:"HIGH ENTROPY"};
        if(confidence<0.515) return {win:"WAIT",reason:"LOW EDGE"};
        return { win:side, reason:`${regime} | CONF ${(confidence*100).toFixed(1)}%` };
    }

    // --- ADDITION 1: LORDS ORDER PLACEMENT (SURGICAL INJECTION) ---
    function executeWager() {
        let betslipAttempts = 0;
        const fillSlip = setInterval(() => {
            betslipAttempts++;
            if (betslipAttempts > 20) { clearInterval(fillSlip); return; }
            const stakeInput = document.querySelector('input[placeholder="Enter Stake"]');
            const submitContainer = document.querySelector('.p-4.bg-card.border-t');
            const submitBtn = submitContainer ? submitContainer.querySelector('button') : null;
            if (stakeInput && submitBtn && stakeInput.offsetParent !== null) {
                const nativeValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                nativeValueSetter.call(stakeInput, "50"); // CHANGE STAKE HERE
                stakeInput.dispatchEvent(new Event('input', { bubbles: true }));
                stakeInput.dispatchEvent(new Event('change', { bubbles: true }));
                setTimeout(() => {
                    const finalBtn = document.querySelector('.p-4.bg-card.border-t button');
                    if (finalBtn && !finalBtn.disabled) finalBtn.click();
                }, 300);
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
            const playerContainers = document.querySelectorAll('.bg-background.border-2.overflow-hidden');
            for (let container of playerContainers) {
                if (container.innerText.includes(targetName)) {
                    const rows = container.querySelectorAll('.border-b.border-neutral-300');
                    for (let row of rows) {
                        if (row.innerText.includes('Main')) {
                            const activeBackBtn = row.querySelector('.bg-back');
                            if (activeBackBtn && !activeBackBtn.classList.contains('cursor-not-allowed')) {
                                clearInterval(tryClick);
                                setTimeout(() => {
                                    activeBackBtn.click();
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

    // --- YOUR EXACT POKER EVALUATOR, PROCESSORS, AND HOOKS ---

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
        if (scoreA > scoreB) return "A"; if (scoreB > scoreA) return "B"; return "TIE";
    }

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
        const intelEl = document.getElementById('tp-intel-box');
        if (!intelEl) return;
        intelEl.style.borderColor = window.tpStats.streak >= 2 ? "#0f0" : (window.tpStats.streak <= -2 ? "#f00" : "#00ff00");
        intelEl.innerHTML = `
            <div style="display:flex;justify-content:space-between;border-bottom:1px solid #333;padding-bottom:5px;margin-bottom:8px;">
                <b style="color:#0ff;">MARKOV LORDS (AUTO)</b>
                <span style="font-size:10px;color:#888;">${storage.percent}% DB</span>
            </div>
            <div style="text-align:center;margin-bottom:10px;">
                <span style="font-size:24px;color:${activePrediction?.win === 'A' ? '#ff4444' : (activePrediction?.win === 'B' ? '#44aaff' : '#ffff00')};font-weight:bold;">
                    ${displayWin}
                </span><br>
                <span style="font-size:11px;color:#ffd700;">${displayReason}</span>
            </div>
            <div style="background:#111;padding:8px;border-radius:6px;border:1px solid #333;">
                <div style="display:flex;justify-content:space-between;font-size:11px;">
                    <span>W: ${window.tpStats.wins} | L: ${window.tpStats.losses}</span>
                    <span style="font-weight:bold;">${rate}%</span>
                </div>
                <div style="text-align:center;margin-top:5px;">
                    <span style="font-size:18px;color:#ffd700;font-weight:bold;">${window.tpStats.units.toFixed(2)} U</span>
                </div>
            </div>
        `;
    }

    function processHistoryArray(historyArray) {
        if (!Array.isArray(historyArray) || historyArray.length === 0) return;
        const recentRounds = [...historyArray].reverse();
        const currentData = JSON.parse(localStorage.getItem(LOGS_KEY)) || [];
        recentRounds.forEach(d => {
            const mid = String(d.mid);
            if (!currentData.some(log => String(log.mid) === mid)) {
                let winner = d.win === "1" ? "A" : (d.win === "2" ? "B" : "TIE");
                const simPred = getDynamicPrediction(window.tpLogs);
                if (simPred?.win !== "WAIT") {
                    if (winner === simPred.win) { window.tpStats.wins++; window.tpStats.units += 0.98; }
                    else if (winner !== "TIE") { window.tpStats.losses++; window.tpStats.units -= 1.0; }
                }
                window.tpLogs.push({ mid, winner });
            }
        });
        saveData(); updateEngineUI();
    }

    function processGameData(d) {
        if (!d || !d.mid || !d.card) return;
        const mid = String(d.mid);
        if (mid !== activeMid) {
            activeMid = mid;
            activePrediction = getDynamicPrediction(window.tpLogs);
            updateEngineUI(); 
            // --- ADDITION 2: TRIGGER AUTO-BET ---
            if (activePrediction && activePrediction.win !== "WAIT") {
                clickBet(activePrediction.win);
            }
        }
        const cardsArray = d.card.split(',');
        if (cardsArray.length === 6 && !cardsArray.includes("1")) {
            if (!window.tpLogs.some(log => String(log.mid) === mid)) {
                const winner = calculateWin(d.card);
                if (activePrediction?.win !== "WAIT") {
                    if (winner === activePrediction.win) { window.tpStats.wins++; window.tpStats.units += 0.98; playSound(880, 'sine'); }
                    else if (winner !== "TIE") { window.tpStats.losses++; window.tpStats.units -= 1.0; playSound(220, 'sawtooth'); }
                }
                window.tpLogs.push({ mid, winner }); saveData(); updateEngineUI();
            }
        }
    }

    function parseAndRoute(text) {
        try {
            const payload = JSON.parse(text);
            function traverse(node) {
                if (!node || typeof node !== 'object') return;
                if (node.p && Array.isArray(node.p.k) && Array.isArray(node.p.v)) {
                    const k = node.p.k, v = node.p.v;
                    const mI = k.indexOf("mid"), cI = k.indexOf("card"), wI = k.indexOf("win");
                    if (mI !== -1 && cI !== -1) processGameData({ mid: v[mI], card: v[cI] });
                    if (mI !== -1 && wI !== -1) processHistoryArray([{ mid: v[mI], win: v[wI] }]);
                }
                if (node.mid && node.card) processGameData(node);
                if (Array.isArray(node) && node[0]?.mid && node[0]?.win) processHistoryArray(node);
                for (let k in node) traverse(node[k]);
            }
            traverse(payload);
        } catch(e) {}
    }

    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const response = await originalFetch.apply(this, args);
        try { response.clone().text().then(parseAndRoute); } catch(e) {}
        return response;
    };

    btn.onclick = (e) => {
        const content = window.tpLogs.map(r => `${r.mid},${r.winner}`).join("\n");
        const blob = new Blob([content], { type: "text/plain" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `lords_markov_full_log.csv`;
        link.click();
    };

    setInterval(() => { updateEngineUI(); }, 5000);
    updateEngineUI();
    console.log("%c LORDS MARKOV AUTO-BET ONLINE (SURGICAL VERSION) ", "color:#0f0; font-weight:bold;");
})();



// full updated Markov
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

    // 3. YOUR EXACT STATISTICAL LOGIC ENGINE (UNTOUCHED)

    function computeMarkov(history) {
        let AA=0,AB=0,BA=0,BB=0;
        for(let i=1;i<history.length;i++){
            const p=history[i-1];
            const c=history[i];
            if(p==="A"&&c==="A")AA++;
            if(p==="A"&&c==="B")AB++;
            if(p==="B"&&c==="A")BA++;
            if(p==="B"&&c==="B")BB++;
        }
        return {
            pA_A:AA/(AA+AB||1),
            pB_A:AB/(AA+AB||1),
            pA_B:BA/(BA+BB||1),
            pB_B:BB/(BA+BB||1)
        };
    }

    function streakStats(history){
        let last=history[history.length-1];
        let streak=1;
        for(let i=history.length-2;i>=0;i--){
            if(history[i]===last)streak++;
            else break;
        }
        let survive=0,total=0;
        for(let i=1;i<history.length;i++){
            if(history[i-1]===last){
                total++;
                if(history[i]===last)survive++;
            }
        }
        return {streak,last,survivalProb:survive/(total||1)};
    }

    function entropy(history){
        const n=history.length;
        const a=history.filter(x=>x==="A").length;
        const b=history.filter(x=>x==="B").length;
        const pA=a/n||0.0001;
        const pB=b/n||0.0001;
        return -(pA*Math.log2(pA)+pB*Math.log2(pB));
    }

    function detectRegime(history){
        const last20=history.slice(-20);
        let transitions=0;
        for(let i=1;i<last20.length;i++){
            if(last20[i]!==last20[i-1])transitions++;
        }
        const ratio=transitions/(last20.length-1||1);
        if(ratio>0.65)return "CHOP";
        if(ratio<0.35)return "TREND";
        return "MIXED";
    }

    function computeConfidence(prob,entropyVal){
        let conf=prob;
        if(entropyVal>0.96) conf*=0.7;
        if(entropyVal>0.985) conf*=0.4;
        return conf;
    }

    function getDynamicPrediction(data){
        const history=data.map(r=>r.winner).filter(x=>x==="A"||x==="B");

        // lower warmup threshold
        if(history.length<12)
            return {win:"WAIT",reason:"COLLECTING DATA"};

        const markov=computeMarkov(history);
        const streak=streakStats(history);
        const H=entropy(history.slice(-40));
        const regime=detectRegime(history);

        const last=history[history.length-1];

        let pA=0.5,pB=0.5;

        if(last==="A"){
            pA=markov.pA_A;
            pB=markov.pB_A;
        }else{
            pA=markov.pA_B;
            pB=markov.pB_B;
        }

        // streak survival influence
        if(regime==="TREND"){
            if(streak.last==="A")
                pA=(pA+streak.survivalProb)/2;
            else
                pB=(pB+streak.survivalProb)/2;
        }

        // chop adjustment
        if(regime==="CHOP"){
            if(last==="A") pB+=0.08;
            else pA+=0.08;
        }

        const prob=Math.max(pA,pB);
        const side=pA>pB?"A":"B";

        const confidence=computeConfidence(prob,H);

        // entropy filter (less aggressive)
        if(H>0.99)
            return {win:"WAIT",reason:"HIGH ENTROPY"};

        // edge filter
        if(confidence<0.515)
            return {win:"WAIT",reason:"LOW EDGE"};

        return {
            win:side,
            reason:`${regime} | CONF ${(confidence*100).toFixed(1)}%`
        };
    }

    // --- NEW: LORDS ORDER PLACEMENT ADDITIONS ---

    function executeWager() {
        let betslipAttempts = 0;
        const fillSlip = setInterval(() => {
            betslipAttempts++;
            if (betslipAttempts > 20) { clearInterval(fillSlip); return; }
            const stakeInput = document.querySelector('input[placeholder="Enter Stake"]');
            const submitContainer = document.querySelector('.p-4.bg-card.border-t');
            const submitBtn = submitContainer ? submitContainer.querySelector('button') : null;
            if (stakeInput && submitBtn && stakeInput.offsetParent !== null) {
                const nativeValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                nativeValueSetter.call(stakeInput, "50"); // Fixed Stake
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
            const playerContainers = document.querySelectorAll('.bg-background.border-2.overflow-hidden');
            for (let container of playerContainers) {
                if (container.innerText.includes(targetName)) {
                    const rows = container.querySelectorAll('.border-b.border-neutral-300');
                    for (let row of rows) {
                        if (row.innerText.includes('Main')) {
                            const activeBackBtn = row.querySelector('.bg-back');
                            if (activeBackBtn && !activeBackBtn.classList.contains('cursor-not-allowed')) {
                                clearInterval(tryClick);
                                setTimeout(() => {
                                    activeBackBtn.click();
                                    executeWager();
                                }, 1800); 
                                return;
                            }
                        }
                    }
                }
            }
        }, 500);
    }

    // --- END ORDER PLACEMENT ADDITIONS ---

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
                <b style="color:#0ff;">V7.2 LORDS AUTO-BET</b>
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
            
            // --- ADDED TRIGGER: AUTO-BET ---
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
                updateEngineUI();
            }
        }
    }

    // 7. NEW DEEP JSON SCANNER (Bypasses Framework Flattening)
    function parseAndRoute(rawText) {
        if (!rawText) return;
        let payload;
        try { payload = JSON.parse(rawText); } catch(e) { return; }

        let extractedGames = [];
        let extractedHistory = [];

        function traverse(node, depth = 0) {
            if (depth > 50 || !node || typeof node !== 'object') return;

            // Target the specific p.k and p.v framework structure
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

            // Fallback for standard flat objects
            if (node.mid && node.card && typeof node.mid !== 'object') {
                extractedGames.push({ mid: String(node.mid), card: String(node.card) });
            }

            if (Array.isArray(node)) {
                if (node.length > 0 && node[0].mid && node[0].win) {
                    node.forEach(r => extractedHistory.push(r));
                }
            }

            for (let key in node) {
                traverse(node[key], depth + 1);
            }
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

    // 8. NEW NETWORK HOOKS
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const response = await originalFetch.apply(this, args);
        try {
            response.clone().text().then(text => parseAndRoute(text)).catch(e => {});
        } catch(e) {}
        return response;
    };

    const originalXHR = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this.addEventListener('load', function() {
            try {
                parseAndRoute(this.responseText);
            } catch(e) {}
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
        link.download = `lords_markov_full_export.csv`;
        link.click();
    };

    setInterval(() => {
        window.scrollBy(0, 10);
        setTimeout(() => window.scrollBy(0, -10), 1000);
        updateEngineUI(); 
    }, 5000);

    updateEngineUI();
    console.log("%c LORDS MARKOV V7.2 FULL 1:1 LOADED WITH AUTO-BET ", "background:#000; color:#0f0; font-weight:bold; font-size:14px;");

})();