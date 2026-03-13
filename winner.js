(function() {
    // UI for Prediction
    const container = document.getElementById("manual-automation-ui");
    const predictBox = document.createElement("div");
    predictBox.style = "background:#1a1a1a;color:#0f0;padding:10px;border-radius:6px;font-size:12px;font-family:monospace;border:1px solid #0f0;margin-top:5px;box-shadow:0 0 10px #0f0;";
    container.appendChild(predictBox);

    function getPrediction() {
        if (window.casinoLogs.length < 5) return "Need more data...";

        const logs = window.casinoLogs;
        const last5Wins = logs.slice(-5).map(r => r.winColumn);
        const last5Suites = logs.slice(-5).map(r => r.card.slice(-2)); // e.g., "HH", "SS"

        // 1. Logic for Win Column (Mean Reversion)
        const lowFreq = last5Wins.filter(w => w === "1").length / 5;
        let predictedWin = "";
        let winConfidence = 0;

        if (lowFreq >= 0.8) {
            predictedWin = "2 (HIGH)"; // Expecting a break in the Low streak
            winConfidence = 72;
        } else if (lowFreq <= 0.2) {
            predictedWin = "1 (LOW)";
            winConfidence = 68;
        } else {
            predictedWin = last5Wins[0] === "1" ? "2 (HIGH)" : "1 (LOW)"; // Expecting a "Chop"
            winConfidence = 54;
        }

        // 2. Logic for Suite (Clumping check)
        const suiteCounts = {};
        last5Suites.forEach(s => suiteCounts[s] = (suiteCounts[s] || 0) + 1);
        const mostFrequentSuite = Object.keys(suiteCounts).reduce((a, b) => suiteCounts[a] > suiteCounts[b] ? a : b);
        
        // Suits usually clump in physical shoes due to poor shuffling
        const predictedSuite = mostFrequentSuite; 

        return `
            NEXT PREDICTION:<br>
            WIN: <span style="color:#fff">${predictedWin}</span><br>
            SUITE: <span style="color:#fff">${predictedSuite}</span><br>
            CONFIDENCE: ${winConfidence}%
        `;
    }

    // Update prediction every time a new round is saved
    const oldUpdatePreview = window.updatePreview;
    window.updatePreview = function() {
        if (oldUpdatePreview) oldUpdatePreview();
        predictBox.innerHTML = getPrediction();
    };

    // Run once on start
    predictBox.innerHTML = getPrediction();
    console.log("Predictive Engine Online.");
})();




// winner top prediction

(function() {
    // 1. UI SETUP (Separate Floating Box)
    const intelBox = document.createElement("div");
    intelBox.id = "ai-prediction-layer";
    intelBox.style = "position:fixed;top:150px;right:20px;z-index:99998;background:#000;color:#00ff00;padding:15px;border-radius:10px;font-size:12px;font-family:monospace;border:2px solid #00ff00;width:210px;box-shadow:0 0 15px rgba(0,255,0,0.3);line-height:1.6;";
    document.body.appendChild(container = intelBox);

    function runAnalysis() {
        const data = window.casinoLogs || [];
        if (data.length < 10) {
            intelBox.innerHTML = `<b style="color:#fff">AI ANALYZER</b><br>Status: Gathering data...<br>Progress: ${data.length}/10 rounds`;
            return;
        }

        // --- Logic A: Win Column (Regression to Mean) ---
        const recentWins = data.slice(-12).map(r => r.winColumn);
        const lowCount = recentWins.filter(w => w === "1").length;
        const highCount = recentWins.filter(w => w === "2").length;
        
        let predWin = "CHOP";
        let winConf = 50;

        // If Low is over-represented (Standard is ~38%), predict High
        if (lowCount >= 7) { 
            predWin = "2 (HIGH)"; 
            winConf = (lowCount / 12) * 100;
        } else if (highCount >= 7) {
            predWin = "1 (LOW)";
            winConf = (highCount / 12) * 100;
        } else {
            // Trend Following (Chop)
            predWin = data[data.length - 1].winColumn === "1" ? "2 (HIGH)" : "1 (LOW)";
            winConf = 55;
        }

        // --- Logic B: Suite Prediction (Physical Clumping) ---
        const recentSuits = data.slice(-8).map(r => r.card.slice(-2));
        const sCounts = {};
        recentSuits.forEach(s => sCounts[s] = (sCounts[s] || 0) + 1);
        const bestSuit = Object.keys(sCounts).reduce((a, b) => sCounts[a] > sCounts[b] ? a : b);
        const suitConf = (sCounts[bestSuit] / 8) * 100;

        intelBox.innerHTML = `
            <b style="color:#fff;text-decoration:underline;">AI PREDICTION</b><br>
            NEXT WIN: <span style="color:#fff;font-size:14px;">${predWin}</span><br>
            CONFIDENCE: ${Math.round(winConf)}%<br>
            <hr style="border:0;border-top:1px solid #333;margin:8px 0;">
            LIKELY SUIT: <span style="color:#fff;font-size:14px;">${bestSuit}</span><br>
            SUIT CLUMP: ${Math.round(suitConf)}%<br>
            <small style="color:#888;display:block;margin-top:5px;">Based on ${data.length} rounds</small>
        `;
    }

    // Auto-update every 2 seconds to catch new data from your main script
    setInterval(runAnalysis, 2000);

    console.log("%c AI PREDICTION LAYER ACTIVE ", "background:#00ff00;color:#000;font-weight:bold;");
})();



// winner bottom

(function() {
    // 1. TRACKING STATE
    window.aiStats = { wins: 0, losses: 0, lastPrediction: null };

    // 2. UI SETUP
    const intelBox = document.createElement("div");
    intelBox.id = "ai-prediction-layer";
    intelBox.style = "position:fixed;top:150px;right:20px;z-index:99998;background:#000;color:#00ff00;padding:15px;border-radius:10px;font-size:12px;font-family:monospace;border:2px solid #00ff00;width:230px;box-shadow:0 0 15px rgba(0,255,0,0.3);line-height:1.6;";
    document.body.appendChild(intelBox);

    function runAnalysis() {
        const data = window.casinoLogs || [];
        if (data.length < 2) return;

        const lastRound = data[data.length - 1];

        // --- VALIDATION LOGIC ---
        // Check if the prediction we made for the PREVIOUS round came true
        if (window.aiStats.lastPrediction && window.aiStats.lastPrediction.mid !== lastRound.mid) {
            // New round just landed! Did we win?
            if (window.aiStats.lastPrediction.win === lastRound.winColumn) {
                window.aiStats.wins++;
            } else {
                window.aiStats.losses++;
            }
            // Clear prediction so we only validate once per round
            window.aiStats.lastPrediction = null; 
        }

        if (data.length < 10) {
            intelBox.innerHTML = `<b>AI ANALYZER</b><br>Gathering data: ${data.length}/10...`;
            return;
        }

        // --- PREDICTION LOGIC ---
        const recentWins = data.slice(-12).map(r => r.winColumn);
        const lowCount = recentWins.filter(w => w === "1").length;
        
        // Regression to Mean
        let predWin = lowCount >= 7 ? "2" : (lowCount <= 3 ? "1" : (data[data.length-1].winColumn === "1" ? "2" : "1"));
        let winConf = Math.round(Math.abs(0.5 - (lowCount/12)) * 200) + 50;

        // Suit Analysis
        const recentSuits = data.slice(-8).map(r => r.card.slice(-2));
        const sCounts = {};
        recentSuits.forEach(s => sCounts[s] = (sCounts[s] || 0) + 1);
        const bestSuit = Object.keys(sCounts).reduce((a, b) => sCounts[a] > sCounts[b] ? a : b);

        // Store prediction for validation in the NEXT interval
        window.aiStats.lastPrediction = { mid: lastRound.mid, win: predWin };

        const total = window.aiStats.wins + window.aiStats.losses;
        const rate = total > 0 ? ((window.aiStats.wins / total) * 100).toFixed(1) : 0;

        intelBox.innerHTML = `
            <b style="color:#fff;text-decoration:underline;">AI PREDICTION</b><br>
            NEXT WIN: <span style="color:#fff;font-size:14px;">${predWin === "1" ? "1 (LOW)" : "2 (HIGH)"}</span><br>
            CONFIDENCE: ${Math.min(winConf, 92)}%<br>
            SUIT: <span style="color:#fff">${bestSuit}</span>
            <hr style="border:0;border-top:1px solid #333;margin:8px 0;">
            <b style="color:#00ffff;">ACCURACY TRACKER</b><br>
            HITS: ${window.aiStats.wins} | MISS: ${window.aiStats.losses}<br>
            WIN RATE: <span style="font-size:16px;color:${rate > 50 ? '#0f0' : '#f00'}">${rate}%</span>
            <small style="color:#888;display:block;margin-top:5px;">Samples: ${data.length} rounds</small>
        `;
    }

    setInterval(runAnalysis, 2000);
    console.log("AI Tracker Active. Validating hits every round.");
})();



// looks good with updated strategy, now wins losses count

(function() {
    window.aiStats = window.aiStats || { wins: 0, losses: 0, lastPrediction: null, streak: 0 };

    const playSound = (freq, type) => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = type; osc.frequency.setValueAtTime(freq, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(); osc.stop(ctx.currentTime + 0.5);
        } catch(e) {} // Browser may block audio until first click
    };

    function getOrCreateInfoBox() {
        let box = document.getElementById("ai-prediction-layer");
        if (!box) {
            box = document.createElement("div");
            box.id = "ai-prediction-layer";
            box.style = "position:fixed;bottom:20px;right:20px;z-index:99998;background:#000;color:#00ff00;padding:15px;border-radius:10px;font-size:12px;font-family:monospace;border:2px solid #00ff00;width:230px;box-shadow:0 0 15px rgba(0,255,0,0.5);line-height:1.6;";
            document.body.appendChild(box);
        }
        return box;
    }

    function getAdaptivePrediction(data) {
        const last3 = data.slice(-3).map(r => r.winColumn);
        const last10 = data.slice(-10).map(r => r.winColumn);
        const lastCard = data[data.length - 1];
        
        const count2 = last10.filter(w => w === "2").length;
        const count1 = last10.filter(w => w === "1").length;

        let pred = "";
        let reason = "";

        if (last3.length === 3 && last3.every(v => v === last3[0] && v !== "0")) {
            pred = last3[0]; reason = "STREAKING";
        } else if (count2 >= 7) {
            pred = "2"; reason = "HIGH MOMENTUM";
        } else if (count1 >= 7) {
            pred = "1"; reason = "LOW MOMENTUM";
        } else {
            pred = lastCard.winColumn === "1" ? "2" : "1";
            reason = "CHOPPING";
        }

        const last5Suits = data.slice(-5).map(r => r.card.slice(-2));
        const sCounts = {};
        last5Suits.forEach(s => sCounts[s] = (sCounts[s] || 0) + 1);
        const bestSuit = Object.keys(sCounts).reduce((a, b) => sCounts[a] > sCounts[b] ? a : b, "??");

        return { win: pred, suit: bestSuit, reason: reason };
    }

    function runAnalysis() {
        const data = window.casinoLogs || [];
        if (data.length < 5) return;
        
        const intelBox = getOrCreateInfoBox();
        const lastRound = data[data.length - 1];

        // VALIDATION
        if (window.aiStats.lastPrediction && window.aiStats.lastPrediction.mid !== lastRound.mid) {
            if (window.aiStats.lastPrediction.win === lastRound.winColumn) {
                window.aiStats.wins++;
                window.aiStats.streak = window.aiStats.streak < 0 ? 1 : window.aiStats.streak + 1;
                playSound(880, 'sine');
            } else {
                window.aiStats.losses++;
                window.aiStats.streak = window.aiStats.streak > 0 ? -1 : window.aiStats.streak - 1;
                playSound(220, 'sawtooth');
            }
            window.aiStats.lastPrediction = null; 
        }

        const prediction = getAdaptivePrediction(data);
        window.aiStats.lastPrediction = { mid: lastRound.mid, win: prediction.win };

        const total = window.aiStats.wins + window.aiStats.losses;
        const rate = total > 0 ? ((window.aiStats.wins / total) * 100).toFixed(1) : 0;

        // Apply background safely
        intelBox.style.background = window.aiStats.streak >= 2 ? "#003300" : (window.aiStats.streak <= -2 ? "#330000" : "#000");
        
        intelBox.innerHTML = `
            <b style="color:#fff;text-decoration:underline;">ADAPTIVE AI</b><br>
            NEXT: <span style="color:#fff;font-size:14px;">${prediction.win === "1" ? "1 (LOW)" : "2 (HIGH)"}</span><br>
            SUIT: <span style="color:#fff">${prediction.suit}</span><br>
            MODE: <span style="color:#0ff;font-size:10px;">${prediction.reason}</span>
            <hr style="border:0;border-top:1px solid #333;margin:8px 0;">
            WIN RATE: <span style="font-size:18px;color:${rate > 50 ? '#0f0' : '#f00'}">${rate}%</span><br>
            <small style="color:#888;">Samples: ${data.length} | S: ${window.aiStats.streak}</small>
        `;
    }

    const aiTimer = setInterval(runAnalysis, 2000);
    console.log("Adaptive Predictor Fixed & Re-Initialized.");
})();



// with updated counter
(function() {
    // 1. PERSISTENT STATS (Survives script re-runs)
    window.aiStats = window.aiStats || { 
        wins: 0, 
        losses: 0, 
        lastPrediction: null, 
        streak: 0,
        units: 0 // Virtual PnL
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

    function getOrCreateInfoBox() {
        let box = document.getElementById("ai-prediction-layer");
        if (!box) {
            box = document.createElement("div");
            box.id = "ai-prediction-layer";
            box.style = "position:fixed;bottom:20px;right:20px;z-index:99998;background:#000;color:#00ff00;padding:15px;border-radius:10px;font-size:12px;font-family:monospace;border:2px solid #00ff00;width:230px;box-shadow:0 0 15px rgba(0,255,0,0.5);line-height:1.6;";
            document.body.appendChild(box);
        }
        return box;
    }

    function getAdaptivePrediction(data) {
        const last3 = data.slice(-3).map(r => r.winColumn);
        const last10 = data.slice(-10).map(r => r.winColumn);
        const lastCard = data[data.length - 1];
        
        const count2 = last10.filter(w => w === "2").length;
        const count1 = last10.filter(w => w === "1").length;

        let pred = "";
        let reason = "";

        // REFINED LOGIC
        if (last3.length === 3 && last3.every(v => v === last3[0] && v !== "0")) {
            pred = last3[0]; reason = "STREAKING";
        } else if (count2 >= 7) {
            pred = "2"; reason = "HIGH MOMENTUM";
        } else if (count1 >= 7) {
            pred = "1"; reason = "LOW MOMENTUM";
        } else {
            pred = lastCard.winColumn === "1" ? "2" : "1";
            reason = "CHOPPING";
        }

        const last5Suits = data.slice(-5).map(r => r.card.slice(-2));
        const sCounts = {};
        last5Suits.forEach(s => sCounts[s] = (sCounts[s] || 0) + 1);
        const bestSuit = Object.keys(sCounts).reduce((a, b) => sCounts[a] > sCounts[b] ? a : b, "??");

        return { win: pred, suit: bestSuit, reason: reason };
    }

    function runAnalysis() {
        const data = window.casinoLogs || [];
        if (data.length < 5) return;
        
        const intelBox = getOrCreateInfoBox();
        const lastRound = data[data.length - 1];

        // --- VALIDATION & PNL TRACKER ---
        if (window.aiStats.lastPrediction && window.aiStats.lastPrediction.mid !== lastRound.mid) {
            if (window.aiStats.lastPrediction.win === lastRound.winColumn) {
                window.aiStats.wins++;
                window.aiStats.units += 0.95; // Typical Lucky 7 payout (5% commission)
                window.aiStats.streak = window.aiStats.streak < 0 ? 1 : window.aiStats.streak + 1;
                playSound(880, 'sine');
            } else {
                window.aiStats.losses++;
                window.aiStats.units -= 1.0; // Full loss
                window.aiStats.streak = window.aiStats.streak > 0 ? -1 : window.aiStats.streak - 1;
                playSound(220, 'sawtooth');
            }
            window.aiStats.lastPrediction = null; 
        }

        const prediction = getAdaptivePrediction(data);
        window.aiStats.lastPrediction = { mid: lastRound.mid, win: prediction.win };

        const total = window.aiStats.wins + window.aiStats.losses;
        const rate = total > 0 ? ((window.aiStats.wins / total) * 100).toFixed(1) : 0;
        const pnl = window.aiStats.units.toFixed(2);

        // Styling based on streak
        intelBox.style.background = window.aiStats.streak >= 2 ? "#003300" : (window.aiStats.streak <= -2 ? "#330000" : "#000");
        
        intelBox.innerHTML = `
            <b style="color:#fff;text-decoration:underline;">ADAPTIVE AI v2</b><br>
            NEXT: <span style="color:#fff;font-size:14px;">${prediction.win === "1" ? "1 (LOW)" : "2 (HIGH)"}</span><br>
            SUIT: <span style="color:#fff">${prediction.suit}</span> | MODE: <span style="color:#0ff;">${prediction.reason}</span>
            <hr style="border:0;border-top:1px solid #333;margin:8px 0;">
            <b style="color:#00ffff;">PERFORMANCE</b><br>
            WINS: ${window.aiStats.wins} | LOSS: ${window.aiStats.losses}<br>
            WIN RATE: <span style="color:${rate > 50 ? '#0f0' : '#f00'}">${rate}%</span><br>
            <b style="color:#ffd700;">PNL: <span style="font-size:18px;">${pnl} units</span></b><br>
            <small style="color:#888;">Sample Size: ${data.length} rounds</small>
        `;
    }

    const aiTimer = setInterval(runAnalysis, 2000);
    console.log("Adaptive PnL Tracker Online.");
})();



// counter with storage monitor
(function() {
    // 1. PERSISTENT STATS
    window.aiStats = window.aiStats || { 
        wins: 0, 
        losses: 0, 
        lastPrediction: null, 
        streak: 0,
        units: 0 
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

    // --- STORAGE CALCULATION ---
    const getStorageStats = () => {
        let total = 0;
        for (let x in localStorage) {
            if (localStorage.hasOwnProperty(x)) {
                total += ((localStorage[x].length + x.length) * 2);
            }
        }
        const usedKB = (total / 1024).toFixed(2);
        const percent = ((usedKB / 5120) * 100).toFixed(2); // Based on 5MB limit
        return { usedKB, percent };
    };

    function getOrCreateInfoBox() {
        let box = document.getElementById("ai-prediction-layer");
        if (!box) {
            box = document.createElement("div");
            box.id = "ai-prediction-layer";
            box.style = "position:fixed;bottom:20px;right:20px;z-index:99998;background:#000;color:#00ff00;padding:15px;border-radius:10px;font-size:12px;font-family:monospace;border:2px solid #00ff00;width:230px;box-shadow:0 0 15px rgba(0,255,0,0.5);line-height:1.6;";
            document.body.appendChild(box);
        }
        return box;
    }

    function getAdaptivePrediction(data) {
        const last3 = data.slice(-3).map(r => r.winColumn);
        const last10 = data.slice(-10).map(r => r.winColumn);
        const lastCard = data[data.length - 1];
        const count2 = last10.filter(w => w === "2").length;
        const count1 = last10.filter(w => w === "1").length;

        let pred = "";
        let reason = "";

        if (last3.length === 3 && last3.every(v => v === last3[0] && v !== "0")) {
            pred = last3[0]; reason = "STREAKING";
        } else if (count2 >= 7) {
            pred = "2"; reason = "HIGH MOMENTUM";
        } else if (count1 >= 7) {
            pred = "1"; reason = "LOW MOMENTUM";
        } else {
            pred = lastCard.winColumn === "1" ? "2" : "1";
            reason = "CHOPPING";
        }

        const last5Suits = data.slice(-5).map(r => r.card.slice(-2));
        const sCounts = {};
        last5Suits.forEach(s => sCounts[s] = (sCounts[s] || 0) + 1);
        const bestSuit = Object.keys(sCounts).reduce((a, b) => sCounts[a] > sCounts[b] ? a : b, "??");

        return { win: pred, suit: bestSuit, reason: reason };
    }

    function runAnalysis() {
        const data = window.casinoLogs || [];
        if (data.length < 5) return;
        
        const intelBox = getOrCreateInfoBox();
        const lastRound = data[data.length - 1];

        if (window.aiStats.lastPrediction && window.aiStats.lastPrediction.mid !== lastRound.mid) {
            if (window.aiStats.lastPrediction.win === lastRound.winColumn) {
                window.aiStats.wins++;
                window.aiStats.units += 0.95;
                window.aiStats.streak = window.aiStats.streak < 0 ? 1 : window.aiStats.streak + 1;
                playSound(880, 'sine');
            } else {
                window.aiStats.losses++;
                window.aiStats.units -= 1.0;
                window.aiStats.streak = window.aiStats.streak > 0 ? -1 : window.aiStats.streak - 1;
                playSound(220, 'sawtooth');
            }
            window.aiStats.lastPrediction = null; 
        }

        const prediction = getAdaptivePrediction(data);
        window.aiStats.lastPrediction = { mid: lastRound.mid, win: prediction.win };

        const total = window.aiStats.wins + window.aiStats.losses;
        const rate = total > 0 ? ((window.aiStats.wins / total) * 100).toFixed(1) : 0;
        const pnl = window.aiStats.units.toFixed(2);
        const storage = getStorageStats();

        intelBox.style.background = window.aiStats.streak >= 2 ? "#003300" : (window.aiStats.streak <= -2 ? "#330000" : "#000");
        
        intelBox.innerHTML = `
            <b style="color:#fff;text-decoration:underline;">ADAPTIVE AI v2</b><br>
            NEXT: <span style="color:#fff;font-size:14px;">${prediction.win === "1" ? "1 (LOW)" : "2 (HIGH)"}</span><br>
            SUIT: <span style="color:#fff">${prediction.suit}</span> | MODE: <span style="color:#0ff;">${prediction.reason}</span>
            <hr style="border:0;border-top:1px solid #333;margin:8px 0;">
            <b style="color:#00ffff;">PERFORMANCE</b><br>
            WINS: ${window.aiStats.wins} | LOSS: ${window.aiStats.losses}<br>
            WIN RATE: <span style="color:${rate > 50 ? '#0f0' : '#f00'}">${rate}%</span><br>
            <b style="color:#ffd700;">PNL: <span style="font-size:18px;">${pnl} units</span></b><br>
            <small style="color:#888;">Sample Size: ${data.length} rounds</small>
            <div style="font-size:9px;color:#555;margin-top:5px;border-top:1px dashed #444;padding-top:4px;">
                STORAGE: ${storage.percent}% (${storage.usedKB}KB / 5MB)
            </div>
        `;
    }

    const aiTimer = setInterval(runAnalysis, 2000);
    console.log("Adaptive Suite + Storage Monitor Ready.");
})();


// set and forget dynamic
(function() {
    // 1. DATA & STATS PERSISTENCE
    window.aiStats = window.aiStats || { wins: 0, losses: 0, lastPrediction: null, streak: 0, units: 0 };

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

    // 2. DYNAMIC LOGIC ENGINE (Scales from 10 to 5000+ rounds)
    function getDynamicPrediction(data) {
        if (data.length < 5) return { win: "1", reason: "COLLECTING", suit: "??" };

        const historyStr = data.map(r => r.winColumn).join('');
        const lastCard = data[data.length - 1];
        let pred = "";
        let reason = "";

        // PHASE A: DEEP PATTERN MATCHING (Only activates with enough data)
        let foundPattern = null;
        if (data.length > 30) {
            const lastSeq = historyStr.slice(-4); // Look for the last 4-round sequence
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

        // STATS VALIDATION
        if (window.aiStats.lastPrediction && window.aiStats.lastPrediction.mid !== lastRound.mid) {
            const isHit = window.aiStats.lastPrediction.win === lastRound.winColumn;
            if (isHit) {
                window.aiStats.wins++; window.aiStats.units += 0.95;
                window.aiStats.streak = Math.max(1, window.aiStats.streak + 1);
                playSound(880, 'sine');
            } else if (lastRound.winColumn !== "0") { // Don't count "7" as a streak-killer if it was a push
                window.aiStats.losses++; window.aiStats.units -= 1.0;
                window.aiStats.streak = Math.min(-1, window.aiStats.streak - 1);
                playSound(220, 'sawtooth');
            }
            window.aiStats.lastPrediction = null; 
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
    console.log("%c DYNAMIC ENGINE v4 ONLINE ", "color:#00ff00; font-weight:bold;");
})();