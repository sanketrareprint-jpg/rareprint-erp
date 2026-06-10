import { writeFileSync } from "node:fs";
import https from "node:https";

const outputPath = "docs/medicine-pouch-ugc-hindi-voiceover.mp3";

const chunks = [
  "क्या आप मेडिकल स्टोर चलाते हैं? तो ये छोटी सी चीज़ आपकी दुकान की ब्रांडिंग बढ़ा सकती है।",
  "पहले हम नॉर्मल प्लेन पैकेट में दवाई देते थे। ग्राहक दवाई लेकर चला जाता था, और दुकान का नाम या नंबर याद नहीं रहता था।",
  "लेकिन कस्टमाइज़्ड प्रिंटेड मेडिसिन पाउच इस्तेमाल करने के बाद फर्क साफ दिखता है।",
  "इस पर दुकान का नाम, पता, मोबाइल नंबर और डिज़ाइन प्रिंट होता है।",
  "जब मरीज घर पर पैकेट देखता है, तो आपकी मेडिकल स्टोर की जानकारी उसके सामने होती है।",
  "इससे रिपीट ऑर्डर और कस्टमर रिकॉल दोनों आसान हो जाते हैं।",
  "प्रिंट मल्टीकलर है, पाउच प्रोफेशनल लगता है, और दवाई देने के लिए काफी प्रैक्टिकल भी है।",
  "अगर आप मेडिकल स्टोर चलाते हैं, तो अपनी ब्रांडिंग के लिए कस्टमाइज़्ड मेडिसिन पाउच जरूर इस्तेमाल कीजिए।",
];

function fetchTts(text) {
  const url = new URL("https://translate.google.com/translate_tts");
  url.searchParams.set("ie", "UTF-8");
  url.searchParams.set("client", "tw-ob");
  url.searchParams.set("tl", "hi");
  url.searchParams.set("q", text);

  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    }, (response) => {
      const parts = [];
      response.on("data", (part) => parts.push(part));
      response.on("end", () => {
        const body = Buffer.concat(parts);
        if (response.statusCode !== 200) {
          reject(new Error(`TTS request failed with HTTP ${response.statusCode}: ${body.toString("utf8").slice(0, 120)}`));
          return;
        }
        resolve(body);
      });
    });

    request.on("error", reject);
    request.setTimeout(30000, () => {
      request.destroy(new Error("TTS request timed out."));
    });
  });
}

const audioParts = [];
for (const chunk of chunks) {
  audioParts.push(await fetchTts(chunk));
}

writeFileSync(outputPath, Buffer.concat(audioParts));
console.log(outputPath);
