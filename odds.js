// const CryptoJS = require("crypto-js");
// const fs = require("fs");

// // Read the long payload from the external file
// const payload = fs.readFileSync("data.txt", "utf8").trim();

// // Update this once you snag the new key from the browser console
// const secret = "qtu18TIJtuiPYzc4ae5c6WsRTY"; 

// function bruteForceOdds(input, secretKey) {
//     try {
//         const parts = input.split("##@##");
//         if (parts.length < 3) return console.log("Malformed Payload: Check your data.txt file.");

//         const ciphertext = parts[0];
//         const salt = CryptoJS.enc.Hex.parse(parts[1]);
//         const iv = CryptoJS.enc.Hex.parse(parts[2]);

//         const keyEvp = CryptoJS.EvpKDF(secretKey, salt, { keySize: 256/32, iterations: 1 });
//         const keyPbk = CryptoJS.PBKDF2(secretKey, salt, { keySize: 256/32, iterations: 1, hasher: CryptoJS.algo.SHA256 });

//         const attempts = [
//             { name: "EvpKDF", key: keyEvp },
//             { name: "PBKDF2", key: keyPbk }
//         ];

//         let success = false;
//         attempts.forEach(attempt => {
//             const decrypted = CryptoJS.AES.decrypt(ciphertext, attempt.key, {
//                 iv: iv,
//                 mode: CryptoJS.mode.CBC,
//                 padding: CryptoJS.pad.Pkcs7
//             });

//             const raw = decrypted.toString(CryptoJS.enc.Utf8);
//             if (raw && (raw.startsWith('{') || raw.startsWith('['))) {
//                 console.log(`\n--- SUCCESS WITH ${attempt.name} ---`);
//                 console.log(JSON.stringify(JSON.parse(raw), null, 2));
//                 success = true;
//             }
//         });

//         if (!success) {
//             console.log("Decryption failed. The 'Odds' endpoint almost certainly uses a different secret key than the 'Results' endpoint.");
//         }

//     } catch (e) {
//         console.log("Error during execution:", e.message);
//     }
// }

// bruteForceOdds(payload, secret);

const CryptoJS = require("crypto-js");
const fs = require("fs");

const rawInput = fs.readFileSync("data.txt", "utf8").trim();
const secret = "qtu18TIJtuiPYzc4ae5c6WsRTY"; 

function decryptOdds(input, secretKey) {
    const parts = input.split("##@##");
    const ciphertext = parts[0];
    const salt = CryptoJS.enc.Hex.parse(parts[1]);
    const iv = CryptoJS.enc.Hex.parse(parts[2]);

    const methods = [
        { name: "PBKDF2", key: CryptoJS.PBKDF2(secretKey, salt, { keySize: 256/32, iterations: 1, hasher: CryptoJS.algo.SHA256 }) },
        { name: "EvpKDF", key: CryptoJS.EvpKDF(secretKey, salt, { keySize: 256/32, iterations: 1 }) }
    ];

    let success = false;

    for (let method of methods) {
        try {
            const decrypted = CryptoJS.AES.decrypt(ciphertext, method.key, {
                iv: iv,
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7
            });

            const str = decrypted.toString(CryptoJS.enc.Utf8);
            
            // If str is empty, the decryption failed silently
            if (str && (str.startsWith('{') || str.startsWith('['))) {
                console.log(`\n--- SUCCESS WITH ${method.name} ---`);
                console.log(JSON.stringify(JSON.parse(str), null, 2));
                success = true;
                break; // Stop looking once we find the right one!
            }
        } catch (e) {
            // Ignore "Malformed" errors during brute-force
        }
    }

    if (!success) {
        console.log("❌ All decryption methods failed. Check your Secret Key.");
    }
}

decryptOdds(rawInput, secret);