import { writeFileSync } from "node:fs";
import https from "node:https";

const outputPath = "docs/medicine-pouch-ugc-hindi-voiceover-30s.mp3";

const chunks = [
  "क्या आप मेडिकल स्टोर चलाते हैं? प्लेन पैकेट में दवाई देने से ग्राहक को आपकी दुकान याद नहीं रहती।",
  "यह कस्टमाइज़्ड मल्टीकलर मेडिसिन पाउच आपकी दुकान को प्रोफेशनल लुक देता है।",
  "इस पर शॉप नाम, पता और मोबाइल नंबर प्रिंट होता है, इसलिए ग्राहक को आपकी डिटेल्स घर पर भी दिखती हैं।",
  "कस्टमर रिकॉल और रिपीट ऑर्डर के लिए, प्रिंटेड मेडिसिन पाउच जरूर इस्तेमाल कीजिए।",
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
