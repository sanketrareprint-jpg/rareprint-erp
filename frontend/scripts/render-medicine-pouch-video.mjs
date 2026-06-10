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
const outputPath = resolve(root, `docs/medicine-pouch-ugc-hindi-video.${ext}`);
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
      videoBitsPerSecond: 6_000_000,
      audioBitsPerSecond: 128_000,
    });
    const chunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };

    const captions = [
      { start: 0.0, end: 4.5, text: "Medical Store Owners Ke Liye Branding Idea" },
      { start: 4.5, end: 9.0, text: "Plain Packet Se Better" },
      { start: 9.0, end: 13.5, text: "Shop Name + Address + Mobile Number" },
      { start: 13.5, end: 18.5, text: "Customer Recall Badhao" },
      { start: 18.5, end: 24.0, text: "Repeat Order Ke Liye Useful" },
      { start: 24.0, end: 31.0, text: "Customized Medicine Pouch Order Karein" },
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

    function drawTextBox(text, y, fontSize = 62) {
      const font = `700 ${fontSize}px Arial, sans-serif`;
      const lines = wrapText(text, 880, font);
      const lineHeight = fontSize * 1.18;
      const boxHeight = lines.length * lineHeight + 54;
      const x = 70;
      const w = 940;

      ctx.save();
      ctx.globalAlpha = 0.94;
      ctx.fillStyle = "#ffffff";
      roundedRect(x, y, w, boxHeight, 26);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#b42318";
      ctx.font = font;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      lines.forEach((line, index) => {
        ctx.fillText(line, width / 2, y + 27 + lineHeight * index + lineHeight / 2);
      });
      ctx.restore();
    }

    function draw(t) {
      const p = Math.min(t / Math.max(audioBuffer.duration, 30), 1);

      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, "#f7fbff");
      gradient.addColorStop(0.45, "#ffffff");
      gradient.addColorStop(1, "#fff0e8");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = "#b42318";
      ctx.fillRect(0, 0, width, 26);
      ctx.fillStyle = "#1f6f8b";
      ctx.fillRect(0, height - 30, width, 30);

      ctx.fillStyle = "#0f2f3f";
      ctx.font = "800 72px Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("MEDICINE POUCH", width / 2, 120);
      ctx.font = "600 38px Arial, sans-serif";
      ctx.fillStyle = "#1f6f8b";
      ctx.fillText("Medical Store Branding", width / 2, 170);

      const imgW = 720 + Math.sin(t * 0.7) * 18;
      const imgH = imgW * (image.naturalHeight / image.naturalWidth);
      const imgX = width / 2 - imgW / 2;
      const imgY = 285 - p * 28;
      ctx.save();
      ctx.shadowColor = "rgba(15, 47, 63, 0.22)";
      ctx.shadowBlur = 42;
      ctx.shadowOffsetY = 28;
      roundedRect(imgX - 22, imgY - 22, imgW + 44, imgH + 44, 34);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.drawImage(image, imgX, imgY, imgW, imgH);
      ctx.restore();

      const active = captions.find((caption) => t >= caption.start && t < caption.end) || captions.at(-1);
      drawTextBox(active.text, 1320, active.text.length > 34 ? 52 : 60);

      ctx.fillStyle = "#0f2f3f";
      ctx.font = "700 42px Arial, sans-serif";
      ctx.fillText("Shop Name, Address, Mobile Number Print", width / 2, 1588);

      ctx.fillStyle = "#b42318";
      roundedRect(190, 1650, 700, 108, 54);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "800 46px Arial, sans-serif";
      ctx.fillText("ORDER CUSTOM POUCHES", width / 2, 1710);

      ctx.fillStyle = "rgba(15, 47, 63, 0.16)";
      ctx.fillRect(140, 1816, 760, 12);
      ctx.fillStyle = "#1f6f8b";
      ctx.fillRect(140, 1816, 760 * p, 12);
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
