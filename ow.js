// This overrides the decrypt function to "snitch" the key when it's used
var originalDecrypt = CryptoJS.AES.decrypt;
CryptoJS.AES.decrypt = function(ciphertext, key, cfg) {
    console.log("!!! FOUND SECRET KEY !!!");
    console.log("KEY/PASSWORD IS:", key.toString());
    return originalDecrypt.apply(this, arguments);
};

let cryptoModule = null;
window.webpackChunkfront = window.webpackChunkfront || [];
window.webpackChunkfront.push([[99999], {}, function(e) {
    for (let modId in e.m) {
        try {
            let mod = e(modId);
            if (mod && mod.AES && mod.AES.decrypt) {
                console.log("Found CryptoJS Module ID:", modId);
                cryptoModule = mod;
                // Hook it directly in Webpack memory
                const originalDecrypt = mod.AES.decrypt;
                mod.AES.decrypt = function(cipher, key) {
                    console.log("%c !!! AES KEY INTERCEPTED !!!", "background: red; color: white; font-size: 16px;");
                    console.log("KEY:", key.toString());
                    return originalDecrypt.apply(this, arguments);
                };
            }
        } catch(err) {}
    }
}]);

var originalDecrypt = CryptoJS.AES.decrypt;
CryptoJS.AES.decrypt = function(ciphertext, key, cfg) {
    console.log("--- ACTUAL BINARY KEY (HEX) ---");
    console.log(key.toString()); // If it's already a WordArray, this shows the hex.
    return originalDecrypt.apply(this, arguments);
};

// Trap the key right before decryption happens
var oldDecrypt = CryptoJS.AES.decrypt;
CryptoJS.AES.decrypt = function(ciphertext, key, cfg) {
    console.log("--- ODDS SECRET KEY DETECTED ---");
    // If it's a string, it prints the string. If it's a WordArray, it prints the Hex.
    console.log("Key Value:", key.toString()); 
    return oldDecrypt.apply(this, arguments);
};

// Sniff the key and the decrypted content
(function() {
    var oldDecrypt = CryptoJS.AES.decrypt;
    CryptoJS.AES.decrypt = function(ciphertext, key, cfg) {
        console.log("%c --- AES DECRYPTION DETECTED --- ", "background: #bada55; color: #222");
        
        // Safely extract the key
        try {
            var keyUsed = key ? (typeof key === 'string' ? key : key.toString()) : "Unknown";
            console.log("Secret Key:", keyUsed);
        } catch(e) { console.log("Key format unusual, but decryption proceeding."); }

        // Get the decrypted result
        var result = oldDecrypt.apply(this, arguments);
        
        try {
            var plainText = result.toString(CryptoJS.enc.Utf8);
            if (plainText) {
                console.log("Decrypted Content:", JSON.parse(plainText));
            }
        } catch(e) { /* Not JSON or not UTF8 */ }

        return result;
    };
    console.log("Sniffer active. Trigger an update on the page now.");
})();


// winning card scan...;
(function() {
    var oldDecrypt = CryptoJS.AES.decrypt;
    CryptoJS.AES.decrypt = function(ciphertext, key, cfg) {
        var result = oldDecrypt.apply(this, arguments);
        try {
            var plainText = result.toString(CryptoJS.enc.Utf8);
            var json = JSON.parse(plainText);
            
            // Check if this is the game data
            if (json.original && json.original.data) {
                var d = json.original.data;
                var card = d.card;
                var mid = d.mid;
                var status = d.sub[0].gstatus;

                if (card !== "1" && card !== "") {
                    console.clear();
                    console.log(`%c MATCH ID: ${mid} `, "background: #333; color: #fff; font-weight: bold;");
                    console.log(`%c STATUS:   ${status} `, status === "OPEN" ? "color: green" : "color: red");
                    console.log(`%c WINNING CARD: ${card} `, "font-size: 20px; color: yellow; background: black; padding: 5px;");
                }
            }
        } catch(e) {}
        return result;
    };
    console.log("Auto-Logger Ready. Waiting for card scan...");
})();


// See request sent

(function() {
    var originalEncrypt = CryptoJS.AES.encrypt;
    CryptoJS.AES.encrypt = function(plaintext, key, cfg) {
        console.log("--- OUTGOING DATA ---");
        console.log("Plaintext:", plaintext.toString());
        // Check if cfg exists before logging IV
        if (cfg && cfg.iv) {
            console.log("IV (Hex):", cfg.iv.toString());
        } else {
            console.log("IV: None (using OpenSSL KDF)");
        }
        return originalEncrypt.apply(this, arguments);
    };
})();


(function() {
    console.log("%c ANTI-IDLE ACTIVE: Wiggling 5px every 5s ", "color: #00ffff; font-weight: bold; background: #222;");

    setInterval(() => {
        // Scroll down 5px
        window.scrollBy(0, 5);
        
        // Wait 200ms and scroll back up 5px
        setTimeout(() => {
            window.scrollBy(0, -5);
        }, 200);
        
    }, 5000); // 5000ms = 5 seconds
})();



(function() {
    console.log("%c ANTI-DISCONNECT ACTIVE: Simulating Mouse/Keys/Scroll ", "color: #ff00ff; font-weight: bold; background: #222;");

    const simulateInteraction = () => {
        // 1. Subtle Scroll
        window.scrollBy(0, 2);
        setTimeout(() => window.scrollBy(0, -2), 150);

        // 2. Fake Mouse Move (Dispatches to the document)
        const mouseEvent = new MouseEvent('mousemove', {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: Math.random() * 100,
            clientY: Math.random() * 100
        });
        document.dispatchEvent(mouseEvent);

        // 3. Fake Key Press (Shift key is safest)
        const keyEvent = new KeyboardEvent('keydown', {
            key: 'Shift',
            code: 'ShiftLeft',
            bubbles: true
        });
        document.dispatchEvent(keyEvent);
    };

    // Run every 4 seconds (faster than their timeout)
    const heartBeat = setInterval(simulateInteraction, 4000);

    // EMERGENCY: Prevent the "Idle" overlay from even appearing
    // This looks for common "Are you there?" popup classes and hides them
    setInterval(() => {
        const overlays = document.querySelectorAll('[class*="modal"], [class*="overlay"], [class*="popup"], [id*="idle"]');
        overlays.forEach(el => {
            if (el.innerText.toLowerCase().includes("idle") || el.innerText.toLowerCase().includes("action")) {
                el.remove();
                console.log("Blocked Idle Popup");
            }
        });
    }, 1000);

})();

// write to file individual

(function() {
    window.casinoLogs = window.casinoLogs || [];
    let lastProcessedMid = null;

    // 1. CREATE UI Elements
    const container = document.createElement("div");
    container.style = "position:fixed;top:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:10px;";
    document.body.appendChild(container);

    const btn = document.createElement("button");
    btn.innerHTML = `💾 DOWNLOAD LOG (0 Rounds)`;
    btn.style = "padding:15px;background:#ffd700;color:#000;border:2px solid #000;cursor:pointer;font-weight:bold;border-radius:8px;box-shadow:0px 4px 10px rgba(0,0,0,0.3);";
    container.appendChild(btn);

    const statusMsg = document.createElement("div");
    statusMsg.innerHTML = "SYSTEM ACTIVE & WIGGLING";
    statusMsg.style = "background:rgba(0,0,0,0.8);color:#00ffff;padding:5px 10px;font-size:10px;text-align:center;border-radius:4px;font-family:monospace;";
    container.appendChild(statusMsg);

    // 2. DOWNLOAD LOGIC
    btn.onclick = () => {
        if (window.casinoLogs.length === 0) return alert("No rounds captured yet!");
        const content = window.casinoLogs.map(r => `${r.mid},${r.card},${r.winColumn}`).join("\n");
        const blob = new Blob([content], { type: "text/plain" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `lucky7_dataset_${Date.now()}.txt`;
        link.click();
    };

    // 3. WIN COLUMN CALCULATION
    function calculateWin(cardStr) {
        const rank = cardStr.substring(0, cardStr.length - 2);
        if (rank === "7") return "0"; 
        const lowRanks = ["A", "2", "3", "4", "5", "6"];
        return lowRanks.includes(rank) ? "1" : "2"; 
    }

    // 4. DECRYPTION HOOK
    var originalDecrypt = CryptoJS.AES.decrypt;
    CryptoJS.AES.decrypt = function(ciphertext, key, cfg) {
        var decrypted = originalDecrypt.apply(this, arguments);
        try {
            var raw = decrypted.toString(CryptoJS.enc.Utf8);
            var parsed = JSON.parse(raw);
            if (parsed.original && parsed.original.data) {
                const d = parsed.original.data;
                if (d.card !== "1" && d.card !== "" && d.mid !== lastProcessedMid) {
                    lastProcessedMid = d.mid;
                    window.casinoLogs.push({ mid: d.mid, card: d.card, winColumn: calculateWin(d.card) });
                    btn.innerHTML = `💾 DOWNLOAD LOG (${window.casinoLogs.length} Rounds)`;
                    console.log(`%c [SAVED] ${d.mid} | ${d.card} `, "color:#0f0;font-weight:bold;");
                }
            }
        } catch(e) {}
        return decrypted;
    };

    // 5. ANTI-IDLE HEARTBEAT (5px wiggle every 5s)
    setInterval(() => {
        window.scrollBy(0, 5);
        setTimeout(() => window.scrollBy(0, -5), 200);
    }, 5000);

    console.log("%c --- FULL AUTOMATION SUITE READY --- ", "background:#bada55;color:#222;font-weight:bold;");
})();


