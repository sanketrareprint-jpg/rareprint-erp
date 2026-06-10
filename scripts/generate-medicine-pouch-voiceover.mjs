import { writeFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import tls from "node:tls";

const outputPath = "docs/medicine-pouch-ugc-hindi-voiceover.mp3";
const voice = "hi-IN-SwaraNeural";
const text = `Medical store chalate hain? To ye chhoti si cheez aapki shop ki branding badha sakti hai.

Pehle hum normal plain packet mein medicine dete the. Customer medicine lekar chala jaata tha, aur shop ka naam ya number yaad nahi rehta tha.

Lekin customized printed medicine pouch use karne ke baad farq clearly dikhta hai. Is par shop ka naam, address, mobile number aur design print hota hai.

Patient jab ghar par packet dekhta hai, to aapki medical store details uske saamne hoti hain. Repeat order aur customer recall dono easy ho jaate hain.

Print bhi multicolor hai, pouch professional lagta hai, aur medicine dispense karne ke liye practical bhi hai.

Agar aap medical store chalate hain, to apni branding ke liye customized medicine pouch zaroor use kijiye.`;

const token = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const url = new URL(`wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${token}&ConnectionId=${randomUUID().replaceAll("-", "")}`);

function timestamp() {
  return new Date().toISOString();
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function makeHeaders(headers, body = "") {
  return `${Object.entries(headers).map(([key, value]) => `${key}: ${value}`).join("\r\n")}\r\n\r\n${body}`;
}

function makeFrame(payloadText) {
  const payload = Buffer.from(payloadText);
  const mask = randomBytes(4);
  const header = [];
  header.push(0x81);

  if (payload.length < 126) {
    header.push(0x80 | payload.length);
  } else if (payload.length < 65536) {
    header.push(0x80 | 126, (payload.length >> 8) & 255, payload.length & 255);
  } else {
    header.push(0x80 | 127, 0, 0, 0, 0, (payload.length / 0x1000000) & 255, (payload.length >> 16) & 255, (payload.length >> 8) & 255, payload.length & 255);
  }

  const masked = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i += 1) {
    masked[i] = payload[i] ^ mask[i % 4];
  }

  return Buffer.concat([Buffer.from(header), mask, masked]);
}

function parseFrames(buffer) {
  const frames = [];
  let offset = 0;

  while (offset + 2 <= buffer.length) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const opcode = first & 0x0f;
    const masked = Boolean(second & 0x80);
    let length = second & 0x7f;
    let cursor = offset + 2;

    if (length === 126) {
      if (cursor + 2 > buffer.length) break;
      length = buffer.readUInt16BE(cursor);
      cursor += 2;
    } else if (length === 127) {
      if (cursor + 8 > buffer.length) break;
      const high = buffer.readUInt32BE(cursor);
      const low = buffer.readUInt32BE(cursor + 4);
      length = high * 2 ** 32 + low;
      cursor += 8;
    }

    let mask;
    if (masked) {
      if (cursor + 4 > buffer.length) break;
      mask = buffer.subarray(cursor, cursor + 4);
      cursor += 4;
    }

    if (cursor + length > buffer.length) break;

    const payload = Buffer.from(buffer.subarray(cursor, cursor + length));
    if (mask) {
      for (let i = 0; i < payload.length; i += 1) {
        payload[i] ^= mask[i % 4];
      }
    }

    frames.push({ opcode, payload });
    offset = cursor + length;
  }

  return { frames, rest: buffer.subarray(offset) };
}

function binaryAudioPayload(data) {
  if (data.length < 2) return null;
  const headerLength = data.readUInt16BE(0);
  const audioStart = 2 + headerLength;
  if (audioStart >= data.length) return null;

  const header = data.subarray(2, audioStart).toString("utf8");
  return header.includes("Path:audio") ? data.subarray(audioStart) : null;
}

async function main() {
  const audioChunks = [];
  let pending = Buffer.alloc(0);
  let handshakeDone = false;

  await new Promise((resolve, reject) => {
    const socket = tls.connect(443, url.hostname, { servername: url.hostname });
    const key = randomBytes(16).toString("base64");
    const requestId = randomUUID().replaceAll("-", "");

    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error("Timed out while generating speech."));
    }, 90000);

    function fail(error) {
      clearTimeout(timeout);
      socket.destroy();
      reject(error);
    }

    socket.on("secureConnect", () => {
      socket.write([
        `GET ${url.pathname}${url.search} HTTP/1.1`,
        `Host: ${url.hostname}`,
        "Connection: Upgrade",
        "Upgrade: websocket",
        `Sec-WebSocket-Key: ${key}`,
        "Sec-WebSocket-Version: 13",
        "Origin: chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
        "User-Agent: Mozilla/5.0",
        "",
        "",
      ].join("\r\n"));
    });

    socket.on("data", (chunk) => {
      pending = Buffer.concat([pending, chunk]);

      if (!handshakeDone) {
        const marker = pending.indexOf("\r\n\r\n");
        if (marker === -1) return;

        const response = pending.subarray(0, marker).toString("utf8");
        if (!response.includes(" 101 ")) {
          fail(new Error(`WebSocket handshake failed: ${response.split("\r\n")[0]}`));
          return;
        }

        handshakeDone = true;
        pending = pending.subarray(marker + 4);

        const speechConfig = {
          context: {
            synthesis: {
              audio: {
                metadataoptions: {
                  sentenceBoundaryEnabled: "false",
                  wordBoundaryEnabled: "false",
                },
                outputFormat: "audio-24khz-96kbitrate-mono-mp3",
              },
            },
          },
        };

        socket.write(makeFrame(makeHeaders({
          "X-Timestamp": timestamp(),
          "Content-Type": "application/json; charset=utf-8",
          Path: "speech.config",
        }, JSON.stringify(speechConfig))));

        const ssml = `<speak version="1.0" xml:lang="hi-IN"><voice name="${voice}"><prosody rate="-2%" pitch="+0Hz">${escapeXml(text)}</prosody></voice></speak>`;
        socket.write(makeFrame(makeHeaders({
          "X-RequestId": requestId,
          "X-Timestamp": timestamp(),
          "Content-Type": "application/ssml+xml",
          Path: "ssml",
        }, ssml)));
      }

      const parsed = parseFrames(pending);
      pending = parsed.rest;

      for (const frame of parsed.frames) {
        if (frame.opcode === 1) {
          const message = frame.payload.toString("utf8");
          if (message.includes("Path:turn.end")) {
            clearTimeout(timeout);
            socket.end();
            resolve();
          }
        } else if (frame.opcode === 2) {
          const payload = binaryAudioPayload(frame.payload);
          if (payload?.length) audioChunks.push(payload);
        } else if (frame.opcode === 8) {
          fail(new Error("Speech service closed the connection."));
        }
      }
    });

    socket.on("error", fail);
    socket.on("end", () => {
      if (!audioChunks.length) fail(new Error("Connection ended before audio was returned."));
    });
  });

  if (!audioChunks.length) {
    throw new Error("No audio was returned by the speech service.");
  }

  writeFileSync(outputPath, Buffer.concat(audioChunks));
  console.log(outputPath);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
