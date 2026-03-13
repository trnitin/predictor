// const CryptoJS = require("crypto-js");

// const payload = "DqSLsTwCUKPV02Mg/c4Xe4jVq9/EbqGVj4R20bg6Xf+SdG53v7QYj4MS9JEvkl68vVO0eZmlN6NfdhPVch7FMNy9A6hhiYlAJOd2umrU0Kue2/g1RMM/ddw8Oy8fEh+PX7c+xE/64Ii453/IAVh/0onhsJ4mQR+JdmuYoGiNn7XEkKLc5IFNau/PTCAHMzyqW1q5YE7McFA/JR6JRGcD6AoeM9qxEAjgwFju5gSdYelJaatVMISdm25r4DzN6vy8lJuS0LniZRaVtmpRwWbEIXfs+O/wk8aiz+ZN+lnGDmZOQ3fbD/6EPJNg/Qo/xELPWCPPXh35kSXGoFriIhyv7VOrZlaj4dK5WjKIitZqNY1QgUpWeJ1DPgNky+TK3ckecNaHppq48hiTiHrR/X/ke28I0rTfIM5gIjDZiaMV2ZSKr1xJt4a3EA5tbEOzKZ4gGLr9zvJ1zuPylvOabN2d5cM/gaJHISzFd+EvDHNi6+8yB86Um75t/lB+g5zlmxmSaoH3AvsGH5H1PjZseJipyqhMALSkMtRzZEZrb/YANzz+u3Sof6oStvuzHKz9yhFkqAA0fzus/5VS6ybDTj2y8twBvtKjaIgFgkgsWolFsL4=##@##79e3e801e5111c72##@##79d62b2f6045cdb4131b33b7d93f6ea7";
// const secret = "qtu18TIJtuiPYzc4ae5c6WsRTY";

// function debugDecryption(input, keyStr) {
//     const parts = input.split("##@##");
//     const ciphertext = parts[0];
//     const salt = CryptoJS.enc.Hex.parse(parts[1]);
//     const iv = CryptoJS.enc.Hex.parse(parts[2]);

//     // Test 1: Standard OpenSSL KDF (Most likely for this obfuscation type)
//     let decrypt1 = CryptoJS.AES.decrypt(ciphertext, keyStr, {
//         iv: iv,
//         salt: salt,
//         format: CryptoJS.format.OpenSSL
//     });

//     // Test 2: Raw Key (Using the string bytes directly as the key)
//     let decrypt2 = CryptoJS.AES.decrypt(ciphertext, CryptoJS.enc.Utf8.parse(keyStr), {
//         iv: iv,
//         mode: CryptoJS.mode.CBC,
//         padding: CryptoJS.pad.Pkcs7
//     });

//     console.log("--- DEBUG RESULTS ---");
//     console.log("Method 1 (Hex):", decrypt1.toString().substring(0, 20));
//     console.log("Method 2 (Hex):", decrypt2.toString().substring(0, 20));

//     // Try to force Latin1 string (avoids the UTF-8 Malformed error)
//     const result1 = decrypt1.toString(CryptoJS.enc.Latin1);
//     const result2 = decrypt2.toString(CryptoJS.enc.Latin1);

//     if (result1.includes("{") || result1.includes("[")) return result1;
//     if (result2.includes("{") || result2.includes("[")) return result2;

//     return "Still encrypted. Check the hex output above.";
// }

// console.log(debugDecryption(payload, secret));








// const CryptoJS = require("crypto-js");

// const payload = "DqSLsTwCUKPV02Mg/c4Xe4jVq9/EbqGVj4R20bg6Xf+SdG53v7QYj4MS9JEvkl68vVO0eZmlN6NfdhPVch7FMNy9A6hhiYlAJOd2umrU0Kue2/g1RMM/ddw8Oy8fEh+PX7c+xE/64Ii453/IAVh/0onhsJ4mQR+JdmuYoGiNn7XEkKLc5IFNau/PTCAHMzyqW1q5YE7McFA/JR6JRGcD6AoeM9qxEAjgwFju5gSdYelJaatVMISdm25r4DzN6vy8lJuS0LniZRaVtmpRwWbEIXfs+O/wk8aiz+ZN+lnGDmZOQ3fbD/6EPJNg/Qo/xELPWCPPXh35kSXGoFriIhyv7VOrZlaj4dK5WjKIitZqNY1QgUpWeJ1DPgNky+TK3ckecNaHppq48hiTiHrR/X/ke28I0rTfIM5gIjDZiaMV2ZSKr1xJt4a3EA5tbEOzKZ4gGLr9zvJ1zuPylvOabN2d5cM/gaJHISzFd+EvDHNi6+8yB86Um75t/lB+g5zlmxmSaoH3AvsGH5H1PjZseJipyqhMALSkMtRzZEZrb/YANzz+u3Sof6oStvuzHKz9yhFkqAA0fzus/5VS6ybDTj2y8twBvtKjaIgFgkgsWolFsL4=##@##79e3e801e5111c72##@##79d62b2f6045cdb4131b33b7d93f6ea7";
// const passphrase = "qtu18TIJtuiPYzc4ae5c6WsRTY";

// function extractFinal(input, pass) {
//     const parts = input.split("##@##");
//     const ciphertext = parts[0];
//     const salt = CryptoJS.enc.Hex.parse(parts[1]);
//     const iv = CryptoJS.enc.Hex.parse(parts[2]);

//     // 1. Derive the Key using PBKDF2 (Matches the 'kdf:PB' in your source code)
//     const key = CryptoJS.PBKDF2(pass, salt, {
//         keySize: 256 / 32,
//         iterations: 1000 // Common default; if fails, we try 1 or 100
//     });

//     // 2. Decrypt with the derived key
//     const decrypted = CryptoJS.AES.decrypt(ciphertext, key, {
//         iv: iv,
//         mode: CryptoJS.mode.CBC,
//         padding: CryptoJS.pad.Pkcs7
//     });

//     try {
//         const result = decrypted.toString(CryptoJS.enc.Utf8);
//         return JSON.parse(result);
//     } catch (e) {
//         // If Utf8 fails, let's see if the key was actually Base64 encoded
//         const b64Key = CryptoJS.enc.Base64.parse(pass);
//         const decryptRaw = CryptoJS.AES.decrypt(ciphertext, b64Key, {
//             iv: iv,
//             mode: CryptoJS.mode.CBC,
//             padding: CryptoJS.pad.Pkcs7
//         });
//         return decryptRaw.toString(CryptoJS.enc.Utf8) || "Still locked. Attempting Latin1 recovery...";
//     }
// }

// console.log(extractFinal(payload, passphrase));




// const CryptoJS = require("crypto-js");

// const payload = "DqSLsTwCUKPV02Mg/c4Xe4jVq9/EbqGVj4R20bg6Xf+SdG53v7QYj4MS9JEvkl68vVO0eZmlN6NfdhPVch7FMNy9A6hhiYlAJOd2umrU0Kue2/g1RMM/ddw8Oy8fEh+PX7c+xE/64Ii453/IAVh/0onhsJ4mQR+JdmuYoGiNn7XEkKLc5IFNau/PTCAHMzyqW1q5YE7McFA/JR6JRGcD6AoeM9qxEAjgwFju5gSdYelJaatVMISdm25r4DzN6vy8lJuS0LniZRaVtmpRwWbEIXfs+O/wk8aiz+ZN+lnGDmZOQ3fbD/6EPJNg/Qo/xELPWCPPXh35kSXGoFriIhyv7VOrZlaj4dK5WjKIitZqNY1QgUpWeJ1DPgNky+TK3ckecNaHppq48hiTiHrR/X/ke28I0rTfIM5gIjDZiaMV2ZSKr1xJt4a3EA5tbEOzKZ4gGLr9zvJ1zuPylvOabN2d5cM/gaJHISzFd+EvDHNi6+8yB86Um75t/lB+g5zlmxmSaoH3AvsGH5H1PjZseJipyqhMALSkMtRzZEZrb/YANzz+u3Sof6oStvuzHKz9yhFkqAA0fzus/5VS6ybDTj2y8twBvtKjaIgFgkgsWolFsL4=##@##79e3e801e5111c72##@##79d62b2f6045cdb4131b33b7d93f6ea7";
// const passphrase = "qtu18TIJtuiPYzc4ae5c6WsRTY";

// function finalAttempt(input, pass) {
//     const parts = input.split("##@##");
//     const ciphertext = parts[0];
//     const salt = CryptoJS.enc.Hex.parse(parts[1]);
//     const iv = CryptoJS.enc.Hex.parse(parts[2]);
//     console.log(ciphertext, salt.toString(), iv.toString())

//     // Attempt 1: PBKDF2 with 1 iteration (As seen in your deobfuscated code)
//     // trying both SHA256 (modern) and MD5 (legacy)
//     const hashers = [CryptoJS.algo.SHA256, CryptoJS.algo.MD5];
    
//     for (let hasher of hashers) {
//         const key = CryptoJS.PBKDF2(pass, salt, {
//             keySize: 256 / 32,
//             iterations: 1,
//             hasher: hasher
//         });

//         const decrypted = CryptoJS.AES.decrypt(ciphertext, key, {
//             iv: iv,
//             mode: CryptoJS.mode.CBC,
//             padding: CryptoJS.pad.Pkcs7
//         });

//         const result = decrypted.toString(CryptoJS.enc.Utf8);
//         console.log(result)
//         if (result && (result.startsWith('{') || result.startsWith('['))) {
//             return JSON.parse(result);
//         }
//     }

//     // Attempt 2: OpenSSL-style EvpKDF (The legacy 'kdf' method)
//     const decryptOpenSSL = CryptoJS.AES.decrypt(ciphertext, pass, {
//         iv: iv,
//         salt: salt,
//         format: CryptoJS.format.OpenSSL
//     });
    
//     const openSSLResult = decryptOpenSSL.toString(CryptoJS.enc.Utf8);
//     if (openSSLResult) return JSON.parse(openSSLResult);

//     return "Still failing. If this outputted gibberish before, the data might be Gzipped.";
// }

// try {
//     console.log(finalAttempt(payload, passphrase));
// } catch (e) {
//     console.log("Error during parsing: " + e.message);
//     console.log("This usually means the key derived correctly but the data isn't a plain string.");
// }




const CryptoJS = require("crypto-js");

// CONFIGURATION
const payload = "INE9+XYRAaHoJvdT2vICMZZxBqoIMNXhMzNsD5hTFGQj5rX/Z3cVt1Rn7eKY7vLTZastO2mA0PeSsmJOu/KAjHuZNuhdoCLzP0wMh2ASbRXQe09WTZNAMkzUClGSHjdvPWBBtu5vbD9ZXBHa0MUsLd25nH0mih1MUe/AAEaGJ4XZ1nqJUFR6jELhwjErFQUtUiHMofNHZhYEcIF0DXotaUAN/pI8RVhkbq+D9O2SndLcVIscNtzSXWXDeewwCHRh5PR+YFJ8QIpGQ0OvErksLkbf8vGdLHSSreEqfj5+jUzwohIhrUypZyL34Ii7m0VNUMZEkv349Eu3lxay+GZkmekAFpEoi0ZBpW3yMeTsoPE08UL4W82uEskxZQChHdY2WI7B1t5UGVpbPh2vvRCdxLgRDX1rAEbTMH8PSuf879X83fJQN91q0YlTeEtsaFKobXW6jhWiHW2KCN9Xv6zf3cxaXwWWErWGuJsMVIOPxaKSm+ZJQ7bJ1q045ymLILPwzNcCPBuq0n36FoqMd4WMox9b964BTore/5w6L/yLNwHawKx+LXYSGRR8mDIG9typ6+P8UspANSdYFCVqOOw2YylvCGipT6JX9XVtRCObTrQ6j8ZZWQ4kqXPHClwy3q/9##@##544f0abcdba77310##@##d06625b43a0a396287311d7dc33ccf92";
const secret = "qtu18TIJtuiPYzc4ae5c6WsRTY";

function bruteForceDerivation(input, secretKey) {
    const parts = input.split("##@##");
    const ciphertext = parts[0];
    const salt = CryptoJS.enc.Hex.parse(parts[1]);
    const iv = CryptoJS.enc.Hex.parse(parts[2]);

    // Technique 1: EvpKDF (Standard OpenSSL KDF used by CryptoJS)
    const keyEvp = CryptoJS.EvpKDF(secretKey, salt, { keySize: 256 / 32, iterations: 1 });

    // Technique 2: PBKDF2 (Often used in custom obfuscated scripts)
    const keyPbk = CryptoJS.PBKDF2(secretKey, salt, { keySize: 256 / 32, iterations: 1, hasher: CryptoJS.algo.SHA256 });

    const attempts = [
        { name: "EvpKDF", key: keyEvp },
        { name: "PBKDF2", key: keyPbk }
    ];

    attempts.forEach(attempt => {
        const decrypted = CryptoJS.AES.decrypt(ciphertext, attempt.key, {
            iv: iv,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        });

        const hex = decrypted.toString(CryptoJS.enc.Hex);
        
        try {
            const str = decrypted.toString(CryptoJS.enc.Utf8);
            if (str && (str.includes("{") || str.includes("["))) {
                console.log(`\n--- SUCCESS WITH ${attempt.name} ---`);
                const parsedData = JSON.parse(str);
                
                // Display the results clearly
                if (parsedData.original && parsedData.original.data) {
                    console.log(`Game: ${parsedData.original.data.res1.cname}`);
                    console.table(parsedData.original.data.res);
                } else {
                    console.log(JSON.stringify(parsedData, null, 2));
                }
            }
        } catch (e) {
            // Silently fail if not valid UTF8/JSON
        }
    });
}

// Run the function
bruteForceDerivation(payload, secret);