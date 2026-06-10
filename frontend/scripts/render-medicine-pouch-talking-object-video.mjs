import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const root = resolve("..");
const imageData = readFileSync(resolve(root, "docs/medicine-pouch-product.jpg")).toString("base64");
const audioData = readFileSync(resolve(root, "docs/medicine-pouch-ugc-hindi-voiceover-30s.mp3")).toString("base64");

const result = await renderVideo({
  imageUrl: `data:image/jpeg;base64,${imageData}`,
  audioUrl: `data:audio/mpeg;base64,${audioData}`,
});

const ext = result.mime.includes("mp4") ? "mp4" : "webm";
const outputPath = resolve(root, `docs/medicine-pouch-talking-object-hindi.${ext}`);
writeFileSync(outputPath, Buffer.from(result.bytes));
console.log(outputPath);

async function renderVideo(payload) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });

  const result = await page.evaluate(async ({ imageUrl, audioUrl }) => {
    const width = 1080;
    const height = 1920;
    const fps = 30;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = imageUrl;
    });

    const audioContext = new AudioContext();
    const audioBuffer = await fetch(audioUrl)
      .then((response) => response.arrayBuffer())
      .then((buffer) => audioContext.decodeAudioData(buffer));

    const destination = audioContext.createMediaStreamDestination();
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(destination);

    const canvasStream = canvas.captureStream(fps);
    const mixedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...destination.stream.getAudioTracks(),
    ]);

    const mime = [
      "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ].find((candidate) => MediaRecorder.isTypeSupported(candidate));

    if (!mime) throw new Error("No supported browser video recorder format found.");

    const recorder = new MediaRecorder(mixedStream, {
      mimeType: mime,
      videoBitsPerSecond: 7_000_000,
      audioBitsPerSecond: 128_000,
    });
    const chunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };

    const captions = [
      { start: 0.0, end: 5.0, text: "मैं आपकी मेडिकल स्टोर ब्रांडिंग बढ़ा सकता हूं" },
      { start: 5.0, end: 10.0, text: "प्लेन पैकेट से ग्राहक को दुकान याद नहीं रहती" },
      { start: 10.0, end: 15.5, text: "मुझ पर शॉप नाम, पता और मोबाइल नंबर प्रिंट होता है" },
      { start: 15.5, end: 22.0, text: "ग्राहक घर पर भी आपकी डिटेल्स देखता है" },
      { start: 22.0, end: 31.0, text: "रिपीट ऑर्डर के लिए मुझे जरूर इस्तेमाल कीजिए" },
    ];

    function roundedRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function wrapText(text, maxWidth, font) {
      ctx.font = font;
      const words = text.split(" ");
      const lines = [];
      let line = "";
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > maxWidth && line) {
          lines.push(line);
          line = word;
        } else {
          line = test;
        }
      }
      if (line) lines.push(line);
      return lines;
    }

    function drawCaption(text, y) {
      const font = "800 58px Nirmala UI, Arial, sans-serif";
      const lines = wrapText(text, 900, font);
      const lineHeight = 72;
      const boxHeight = lines.length * lineHeight + 58;

      ctx.save();
      ctx.globalAlpha = 0.94;
      ctx.fillStyle = "#ffffff";
      roundedRect(55, y, 970, boxHeight, 28);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(180, 35, 24, 0.25)";
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.fillStyle = "#102f3f";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = font;
      lines.forEach((line, index) => {
        ctx.fillText(line, width / 2, y + 34 + index * lineHeight + lineHeight / 2);
      });
      ctx.restore();
    }

    function drawEye(x, y, scale, blink, lookX, lookY) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#713200";
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.ellipse(0, 0, 62, blink ? 9 : 54, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (!blink) {
        ctx.fillStyle = "#1a7d76";
        ctx.beginPath();
        ctx.arc(lookX, lookY, 28, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#111827";
        ctx.beginPath();
        ctx.arc(lookX + 3, lookY + 2, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(lookX - 8, lookY - 10, 7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    function drawMouth(x, y, talk, smile) {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = "#5a1717";
      ctx.strokeStyle = "#7b2b18";
      ctx.lineWidth = 8;
      ctx.beginPath();
      if (talk > 0.6) {
        ctx.ellipse(0, 0, 92, 56, 0, 0, Math.PI * 2);
      } else if (talk > 0.32) {
        ctx.ellipse(0, 0, 86, 35, 0, 0, Math.PI * 2);
      } else {
        ctx.moveTo(-82, -8);
        ctx.quadraticCurveTo(0, 48 + smile * 12, 82, -8);
        ctx.quadraticCurveTo(0, 18, -82, -8);
      }
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(-48, -24, 96, 16);
      ctx.fillStyle = "#ef7b7b";
      ctx.beginPath();
      ctx.ellipse(0, 32, 46, 18, 0, 0, Math.PI);
      ctx.fill();
      ctx.restore();
    }

    function drawArm(side, pouchX, pouchY, pouchW, t) {
      const dir = side === "left" ? -1 : 1;
      const shoulderX = pouchX + pouchW * (side === "left" ? 0.12 : 0.88);
      const shoulderY = pouchY + 520;
      const handX = shoulderX + dir * (122 + Math.sin(t * 5) * 18);
      const handY = shoulderY + 160 + Math.cos(t * 4) * 18;

      ctx.save();
      ctx.strokeStyle = "#cf5b2e";
      ctx.lineWidth = 26;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(shoulderX, shoulderY);
      ctx.quadraticCurveTo(shoulderX + dir * 95, shoulderY + 80, handX, handY);
      ctx.stroke();
      ctx.fillStyle = "#ffcf9c";
      ctx.strokeStyle = "#b94924";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(handX, handY, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    function draw(t) {
      const duration = Math.max(audioBuffer.duration, 30);
      const progress = Math.min(t / duration, 1);
      const talking = (Math.sin(t * 15) + 1) / 2;
      const blink = Math.floor(t * 2.2) % 9 === 0;
      const bob = Math.sin(t * 2.2) * 18;

      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, "#dff5f7");
      gradient.addColorStop(0.5, "#fff7ec");
      gradient.addColorStop(1, "#f3fff4");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = "#d64933";
      ctx.fillRect(0, 0, width, 28);
      ctx.fillStyle = "#1f6f8b";
      ctx.fillRect(0, height - 32, width, 32);

      ctx.fillStyle = "#102f3f";
      ctx.font = "900 72px Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("मैं हूं Printed Medicine Pouch", width / 2, 120);
      ctx.font = "700 38px Arial, sans-serif";
      ctx.fillStyle = "#b42318";
      ctx.fillText("Medical Store Branding Ke Liye", width / 2, 170);

      const pouchW = 690;
      const pouchH = pouchW * (image.naturalHeight / image.naturalWidth);
      const pouchX = width / 2 - pouchW / 2;
      const pouchY = 310 + bob;

      ctx.save();
      ctx.shadowColor = "rgba(15, 47, 63, 0.22)";
      ctx.shadowBlur = 42;
      ctx.shadowOffsetY = 28;
      roundedRect(pouchX - 24, pouchY - 24, pouchW + 48, pouchH + 48, 36);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      drawArm("left", pouchX, pouchY, pouchW, t);
      drawArm("right", pouchX, pouchY, pouchW, t + 0.6);
      ctx.drawImage(image, pouchX, pouchY, pouchW, pouchH);
      ctx.restore();

      const faceX = width / 2;
      const faceY = pouchY + 635;
      const lookX = Math.sin(t * 1.4) * 8;
      const lookY = Math.cos(t * 1.1) * 5;
      drawEye(faceX - 100, faceY - 95, 0.92, blink, lookX, lookY);
      drawEye(faceX + 100, faceY - 95, 0.92, blink, lookX, lookY);
      drawMouth(faceX, faceY + 42, talking, Math.sin(t));

      const active = captions.find((caption) => t >= caption.start && t < caption.end) || captions.at(-1);
      drawCaption(active.text, 1330);

      ctx.fillStyle = "#b42318";
      roundedRect(210, 1656, 660, 104, 52);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 46px Arial, sans-serif";
      ctx.fillText("ORDER CUSTOM POUCHES", width / 2, 1718);

      ctx.fillStyle = "rgba(16, 47, 63, 0.18)";
      roundedRect(130, 1830, 820, 12, 6);
      ctx.fill();
      ctx.fillStyle = "#1f6f8b";
      roundedRect(130, 1830, 820 * progress, 12, 6);
      ctx.fill();
    }

    return await new Promise((resolve, reject) => {
      recorder.onerror = () => reject(recorder.error);
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: mime });
        const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
        resolve({ mime, bytes });
      };

      let start;
      function step(now) {
        if (!start) start = now;
        const seconds = (now - start) / 1000;
        draw(seconds);
        if (seconds < audioBuffer.duration + 0.6) {
          requestAnimationFrame(step);
        } else {
          recorder.stop();
        }
      }

      recorder.start(1000);
      audioContext.resume().then(() => {
        source.start();
        requestAnimationFrame(step);
      });
    });
  }, payload);

  await browser.close();
  return result;
}
