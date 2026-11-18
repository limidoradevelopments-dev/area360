/**
 * ─── site-images ───
 *
 * The images the site is found by (2026-11-18, the first published
 * version), made from the site's own sources so they never drift from it:
 *
 *   THE ICONS — the user's mark (components/ui/MarkGlyph.tsx: its paths,
 *   read from the file, the one drawing) in white on the page's black:
 *     app/favicon.ico        16, 32 and 48 px in one file (browsers, and
 *                            Google's results: a square, 48 or larger)
 *     app/icon.png           192 px (Google prefers larger than 48; the
 *                            manifest's small icon)
 *     app/apple-icon.png     180 px, more room round the mark (iOS rounds
 *                            its corners)
 *     public/icon-512.png    the manifest's large icon
 *
 *   THE SHARE CARD — app/opengraph-image.jpg, 1200 × 630 (the size every
 *   network shows whole), and its alt text: the scene's own still
 *   (public/hero/still), the hero's headline in its voice (Newsreader
 *   medium, the site's own file), the address top right as the contact is
 *   drawn (an amber arrow, an amber rule), the mark and the byline at the
 *   foot. Drawn by headless Chrome, so the type is the site's.
 *
 * The words — the name, the role, the headline, the address — are read
 * from components/site/content.ts (Node reads TypeScript as it is).
 *
 *   npm run site-images
 *
 * Chrome or Edge is found at its usual place; CHROME_PATH overrides it.
 * Re-run whenever the mark, the headline, the name or the scene's look
 * changes.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const { PERSON, SITE, SITE_URL } = await import("../components/site/content.ts");

const NIGHT = SITE.night;
const at = (p) => path.join(root, p);

/* ── The mark: its paths, as the component draws them (66 × 47) ── */
const markSource = fs.readFileSync(at("components/ui/MarkGlyph.tsx"), "utf8");
const markPaths = [...markSource.matchAll(/\bd="([^"]+)"/g)].map((m) => m[1]);
if (markPaths.length === 0) throw new Error("site-images: no paths found in MarkGlyph.tsx");
const MARK = { w: 66, h: 47 };

/** The mark centred on the black, `share` of the square's width across. */
function iconSvg(size, share) {
  const scale = (size * share) / MARK.w;
  const x = (size - MARK.w * scale) / 2;
  const y = (size - MARK.h * scale) / 2;
  const paths = markPaths.map((d) => `<path d="${d}"/>`).join("");
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
      `<rect width="${size}" height="${size}" fill="${NIGHT}"/>` +
      `<g transform="translate(${x} ${y}) scale(${scale})" fill="#FFFFFF">${paths}</g></svg>`,
  );
}

const png = (size, share) => sharp(iconSvg(size, share)).png({ compressionLevel: 9 }).toBuffer();

/* Small sizes give the mark more of the square: at 16 px every pixel of
   its wings counts. */
const ICO_SIZES = [
  [16, 0.92],
  [32, 0.86],
  [48, 0.8],
];

/** An .ico holding PNGs (every browser since 2010 reads them). */
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, k) => {
    const e = 6 + 16 * k;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt8(0, e + 2);
    header.writeUInt8(0, e + 3);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.data)]);
}

const icoImages = [];
for (const [size, share] of ICO_SIZES) icoImages.push({ size, data: await png(size, share) });
fs.writeFileSync(at("app/favicon.ico"), ico(icoImages));
fs.writeFileSync(at("app/icon.png"), await png(192, 0.72));
fs.writeFileSync(at("app/apple-icon.png"), await png(180, 0.62));
fs.writeFileSync(at("public/icon-512.png"), await png(512, 0.66));
console.log("site-images: icons written (favicon.ico, icon.png, apple-icon.png, icon-512.png)");

/* ── The share card ── */
const CARD = { w: 1200, h: 630 };
const dataUri = (file, type) => `data:${type};base64,${fs.readFileSync(at(file)).toString("base64")}`;
const font = dataUri("public/fonts/newsreader/Newsreader-Medium.woff2", "font/woff2");
const still = dataUri("public/hero/still/landscape-2094.webp", "image/webp");
/* The headline is the share description's first sentence (one source),
   broken where the hero's narrow frame breaks it: after the comma. */
const headline = SITE.share.description.split(". ")[0].replace(/\.?$/, ".");
const [lineOne, lineTwo] = headline.split(/(?<=,)\s/);
const host = new URL(SITE_URL).host;
const markSvg = `<svg viewBox="0 0 66 47" fill="currentColor">${markPaths.map((d) => `<path d="${d}"/>`).join("")}</svg>`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: Card; src: url(${font}) format("woff2"); font-weight: 500; }
* { margin: 0; box-sizing: border-box; }
html, body { width: ${CARD.w}px; height: ${CARD.h}px; background: ${NIGHT}; overflow: hidden; }
body { position: relative; font-family: Card, serif; font-weight: 500; -webkit-font-smoothing: antialiased;
  background: url(${still}) 50% 50% / cover no-repeat; color: rgb(255 255 255 / 0.8); }
/* A little of the night over the sky, so the words hold at a card's size. */
body::before { content: ""; position: absolute; inset: 0;
  background: linear-gradient(to bottom, rgb(17 17 17 / 0.42), rgb(17 17 17 / 0) 46%, rgb(17 17 17 / 0) 72%, rgb(17 17 17 / 0.35)); }
.headline { position: absolute; left: 48px; top: 40px; color: #fff; font-size: 58px; line-height: 64px; letter-spacing: -0.02em; }
.small { font-size: 16px; line-height: 22px; letter-spacing: -0.01em; text-transform: uppercase; }
.address { position: absolute; right: 48px; top: 48px; display: flex; align-items: baseline; gap: 10px; padding-bottom: 6px;
  border-bottom: 1.5px solid #F2A500; }
.address svg { width: 11px; height: 11px; overflow: visible; fill: none; stroke: #F2A500; stroke-width: 1.5px; }
.mark { position: absolute; left: 48px; bottom: 44px; width: 84px; color: rgb(255 255 255 / 0.85); }
.byline { position: absolute; right: 48px; bottom: 44px; text-align: right; }
.byline .name { color: #fff; }
</style></head><body>
<p class="headline">${lineOne}<br>${lineTwo}</p>
<p class="small address">${host}<svg viewBox="0 0 10 10"><path d="M0.5 9.5 9.5 0.5M2 0.5h7.5V8"/></svg></p>
<div class="mark">${markSvg}</div>
<p class="small byline"><span class="name">${PERSON.name}</span><br>${PERSON.role}</p>
</body></html>`;

const CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
const chrome = CANDIDATES.find((p) => fs.existsSync(p));
if (!chrome) throw new Error("site-images: no Chrome or Edge found; set CHROME_PATH.");

const page = path.join(os.tmpdir(), `site-card-${process.pid}.html`);
fs.writeFileSync(page, html);
const port = 9400 + Math.floor(Math.random() * 400);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "site-images-"));
const browser = spawn(chrome, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let socketUrl;
for (let i = 0; i < 75 && !socketUrl; i++) {
  try {
    socketUrl = (await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json()).webSocketDebuggerUrl;
  } catch {
    await sleep(200);
  }
}
if (!socketUrl) throw new Error("site-images: Chrome did not answer");
const ws = new WebSocket(socketUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener("message", (event) => {
  const m = JSON.parse(event.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id: n, method, params }));
  });
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: CARD.w, height: CARD.h, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: `file:///${page.replace(/\\/g, "/")}` });
for (let i = 0; i < 100; i++) {
  await sleep(100);
  const ready = await send("Runtime.evaluate", { expression: "document.readyState === 'complete' && document.fonts.status === 'loaded'", returnByValue: true });
  if (ready.result.value) break;
}
await sleep(300);
const shot = await send("Page.captureScreenshot", { format: "png" });
ws.close();
browser.kill();
const jpeg = await sharp(Buffer.from(shot.data, "base64")).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
fs.writeFileSync(at("app/opengraph-image.jpg"), jpeg);
fs.writeFileSync(
  at("app/opengraph-image.alt.txt"),
  `${PERSON.name}, ${PERSON.role}: “${headline}” over a stone standing in a misty lake`,
);
/* Chrome lets go of its profile a moment after it is told to close; a
   temp folder it still holds is left to the system. */
setTimeout(() => {
  for (const p of [page, profile]) {
    try {
      fs.rmSync(p, { recursive: true, force: true });
    } catch {}
  }
}, 1000);
console.log(`site-images: share card written (opengraph-image.jpg, ${(jpeg.length / 1024).toFixed(1)} KB)`);
