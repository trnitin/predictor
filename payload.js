// const CryptoJS = require("crypto-js");

// const secret = "qtu18TIJtuiPYzc4ae5c6WsRTY"; 

// // Paste either the long or the short payload here
// const payload = "Qb1C0FZlZE9PshbuY0SfvhKzXfBHOe/PX5aTfFPuRI0=##@##2156aebf55554076d2777f6f4cc18c5f##@##f7d5842297bd8b47";

// function extractAny(input, secretKey) {
//     const parts = input.split("##@##");
//     const ciphertext = parts[0];
//     const salt = CryptoJS.enc.Hex.parse(parts[1]);
//     const iv = CryptoJS.enc.Hex.parse(parts[2]);

//     console.log(ciphertext, salt.toString(), iv.toString());

//     const key = CryptoJS.PBKDF2(secretKey, salt, { 
//         keySize: 256/32, 
//         iterations: 1, 
//         hasher: CryptoJS.algo.SHA256 
//     });

//     const decrypted = CryptoJS.AES.decrypt(ciphertext, key, { iv: iv });
    
//     try {
//         const str = decrypted.toString(CryptoJS.enc.Utf8);
//         console.log("--- DECRYPTED CONTENT ---");
//         console.log(JSON.stringify(JSON.parse(str), null, 2));
//     } catch (e) {
//         console.log("Failed to parse. Check if the secret key is correct for this specific string.");
//     }
// }

// extractAny(payload, secret);




const CryptoJS = require("crypto-js");

const requestPayload = "M20Gz6sN+kY69loyBj7fEEgDR+qqe9XxXyTCzd2u6Z9EzwTxH/tWbNI2aaOh+g7tRTvqfo9k259QEVcEWjYBvA==##@##507d438d42c5489db629c489ea5c2ec7##@##a4b1f8899c0a137f";
const hashedSecretKey = "qtu18TIJtuiPYzc4ae5c6WsRTY";

function decrypt() {
    const parts = requestPayload.split("##@##");
    const ciphertext = CryptoJS.enc.Base64.parse(parts[0]);
    
    // Most implementations use only the first 8 bytes of the salt
    // even if more are provided in the payload.
    const salt = CryptoJS.enc.Hex.parse(parts[1].substring(0, 16));

    // 1. Manually derive Key (256-bit) and IV (128-bit)
    // Total 12 words (8 for key, 4 for IV)
    const derived = CryptoJS.EvpKDF(hashedSecretKey, salt, {
        keySize: 8 + 4,
        iterations: 1
    });

    const key = CryptoJS.lib.WordArray.create(derived.words.slice(0, 8));
    const iv = CryptoJS.lib.WordArray.create(derived.words.slice(8, 12));

    // 2. Perform the decryption using the derived Key and IV
    const decrypted = CryptoJS.AES.decrypt(
        { ciphertext: ciphertext },
        key,
        {
            iv: iv,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        }
    );

    // 3. Convert to UTF-8
    const result = decrypted.toString(CryptoJS.enc.Utf8);

    if (result) {
        console.log("--- DECRYPTION SUCCESS ---");
        console.log(result);
    } else {
        console.log("Decryption failed. Checking raw hex output...");
        const hex = decrypted.toString(CryptoJS.enc.Hex);
        if (hex) {
            console.log("Decrypted (Hex):", hex);
            console.log("Note: If hex exists but string is empty, the key is wrong or data is not UTF-8.");
        } else {
            console.log("Decrypted result is completely empty. The Key/IV derivation is incorrect.");
        }
    }
}

decrypt();