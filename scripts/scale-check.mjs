/**
 * ─── scale-check ───
 *
 * Checks a page against the scaling system (AGENTS.md, Scaling System) at
 * every width that matters, in headless Chrome over the DevTools protocol
 * (Node's own WebSocket and fetch; nothing to install):
 *
 *   THE SCALES   the line, the print, the air and the reader, in px
 *   THE VOICES   each voice's size, and that they keep their order (h1 > h2
 *                > h3 > copy ≥ small copy ≥ support) and their floors
 *   THE PAGE     no sideways overflow, no text drawn outside the window
 *                (main clips sideways, so overflow alone hides it), no
 *                authored line wrapped inside its reveal mask
 *   THE MEASURES every [data-measure] passage breaks exactly as at its
 *                band's reference width wherever the system holds it
 *   ONE COPY     every text in the copy voice renders alike (its line,
 *                tracking, optical size and ligatures), on a desktop and
 *                a tablet, where no other voice shares its size
 *
 * Exits 1 on any failure, so an agent building a section runs it last.
 *
 *   npm run check:scale                         the home page on :3000
 *   npm run check:scale -- http://localhost:3000/works/kavi-klavis
 *   npm run check:scale -- <url> --widths=1920x957,390x844
 *
 * Needs a running server (`npm run dev`, or `out/` served). Chrome or Edge
 * is found at its usual place; CHROME_PATH overrides it.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/* The widths the system is checked at: every band's ends and the widths
 * where a scale meets its floor or ceiling (AGENTS.md, Scaling System §10),
 * and a phone on its side. */
const WIDTHS = [
  [2560, 1300], [1920, 957], [1600, 950], [1440, 900], [1360, 850], [1280, 800],
  [1152, 800], [1024, 768], [768, 1024], [767, 1000], [546, 900], [430, 932],
  [390, 844], [360, 780], [320, 640], [740, 360],
];

/* Where a [data-measure] passage must break as its band's reference does:
 * everywhere (a desktop and a tablet against 1920, a phone against 390). */
const HOLDS = [
  { from: 768, to: Infinity, reference: 1920 },
  { from: 0, to: 767, reference: 390 },
];

/* The floors no voice goes under (AGENTS.md, Scaling System §8). */
const FLOORS = { copy: 12, ui: 12, support: 10 };

const args = process.argv.slice(2);
const urlArg = args.find((a) => !a.startsWith("--")) ?? "http://localhost:3000/";
const widthsArg = args.find((a) => a.startsWith("--widths="));
const widths = widthsArg
  ? widthsArg.slice(9).split(",").map((s) => s.split("x").map(Number))
  : WIDTHS;
const url = new URL(urlArg);
url.searchParams.set("nopreload", "");

const CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);
const chrome = CANDIDATES.find((p) => fs.existsSync(p));
if (!chrome) {
  console.error("scale-check: no Chrome or Edge found; set CHROME_PATH.");
  process.exit(2);
}

const port = 9300 + Math.floor(Math.random() * 500);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "scale-check-"));
const browser = spawn(chrome, [
  "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--hide-scrollbars", "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  for (let i = 0; i < 75; i++) {
    try {
      const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
      return target.webSocketDebuggerUrl;
    } catch {
      await sleep(200);
    }
  }
  throw new Error("scale-check: Chrome did not answer");
}

const ws = new WebSocket(await connect());
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
const evaluate = async (expression) =>
  (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result.value;

/* Runs in the page: everything is read from computed styles and layout. */
const PROBE = `(async () => {
  await document.fonts.ready;
  await new Promise((r) => setTimeout(r, 600));
  const root = getComputedStyle(document.documentElement);
  const px = (v) => Math.round(parseFloat(v) * 100) / 100;
  const voice = (name) => {
    const el = document.createElement("span");
    el.style.fontSize = "var(--text-" + name + ")";
    document.body.append(el);
    const size = px(getComputedStyle(el).fontSize);
    el.remove();
    return size;
  };
  const lines = (el) => {
    const out = []; let text = ""; let top = null;
    const range = document.createRange();
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walk.nextNode())) for (let i = 0; i < node.length; i++) {
      range.setStart(node, i); range.setEnd(node, i + 1);
      const r = range.getClientRects()[0];
      if (!r) { text += node.data[i]; continue; }
      if (top !== null && Math.abs(r.top - top) > 4) { out.push(text.trim()); text = ""; }
      top = r.top; text += node.data[i];
    }
    out.push(text.trim());
    return out;
  };
  const outside = [];
  for (const el of document.querySelectorAll("body *")) {
    if (el.children.length || !el.textContent.trim()) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 1) continue;
    if (r.right > innerWidth + 0.5 || r.left < -0.5) outside.push(el.textContent.trim().slice(0, 32));
  }
  const wrapped = [];
  for (const line of document.querySelectorAll("[data-reveal-mask] > [data-reveal-line]")) {
    if (line.querySelector("svg, img")) continue;
    const cs = getComputedStyle(line);
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3;
    if (line.getBoundingClientRect().height > lh * 1.6) wrapped.push(line.textContent.trim().slice(0, 32));
  }
  return {
    width: innerWidth,
    line: (() => {
      const el = document.createElement("div");
      el.style.cssText = "position:absolute;width:var(--print-line)";
      document.body.append(el);
      const w = px(getComputedStyle(el).width);
      el.remove();
      return w;
    })(),
    print: px(root.getPropertyValue("--print")),
    air: px(root.getPropertyValue("--print-space")),
    reader: px(root.fontSize),
    voices: {
      title: voice("title"), sectionTitle: voice("section-title"), heading: voice("heading"),
      copy: voice("copy"), copySmall: voice("copy-small"), ui: voice("ui"), support: voice("support"),
    },
    overflow: document.documentElement.scrollWidth - innerWidth,
    outside: [...new Set(outside)].slice(0, 6),
    wrapped: [...new Set(wrapped)].slice(0, 6),
    measures: Array.from(document.querySelectorAll("[data-measure]"), lines),
    copyLooks: (() => {
      const size = voice("copy");
      const looks = new Map();
      for (const el of document.querySelectorAll("body *")) {
        if (el.children.length || !el.textContent.trim()) continue;
        const cs = getComputedStyle(el);
        if (!/newsreader/i.test(cs.fontFamily) || Math.abs(parseFloat(cs.fontSize) - size) > 0.01) continue;
        if (el.getBoundingClientRect().width <= 1) continue;
        const look = [px(parseFloat(cs.lineHeight) / size), px(parseFloat(cs.letterSpacing) / size * 100) + "%", cs.fontVariationSettings, cs.fontVariantLigatures].join(" · ");
        if (!looks.has(look)) looks.set(look, el.textContent.trim().slice(0, 24));
      }
      return Array.from(looks, ([look, text]) => look + " (" + text + ")");
    })(),
  };
})()`;

await send("Page.enable");
const results = [];
for (const [width, height] of widths) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: url.href });
  for (let i = 0; i < 120; i++) {
    await sleep(150);
    if ((await evaluate("document.readyState")) === "complete") break;
  }
  results.push({ height, ...(await evaluate(PROBE)) });
}
ws.close();
browser.kill();
setTimeout(() => fs.rmSync(profile, { recursive: true, force: true }), 500);

/* ── The report ── */
let failed = 0;
const byWidth = new Map(results.map((r) => [r.width, r]));
console.log(`scale-check ${url.origin}${url.pathname}\n`);
for (const r of results) {
  const v = r.voices;
  const problems = [];
  if (!Number.isFinite(r.print)) {
    problems.push("no --print here: the page did not load, or is not this site's");
    failed += 1;
    console.log(`${String(r.width).padStart(4)}×${String(r.height).padEnd(4)} FAIL`);
    for (const p of problems) console.log(`           ↳ ${p}`);
    continue;
  }
  if (r.overflow > 0) problems.push(`scrolls sideways by ${r.overflow}px`);
  if (r.outside.length) problems.push(`text outside the window: ${r.outside.join(" | ")}`);
  if (r.wrapped.length) problems.push(`authored line wrapped: ${r.wrapped.join(" | ")}`);
  if (!(v.title > v.sectionTitle && v.sectionTitle > v.heading && v.heading > v.copy && v.copy >= v.copySmall && v.copySmall >= v.support)) {
    problems.push("voices out of order");
  }
  for (const [name, least] of Object.entries(FLOORS)) if (v[name] < least - 0.01) problems.push(`${name} under ${least}px`);
  if (r.width >= 768 && r.copyLooks.length > 1) problems.push(`texts in the copy voice render differently: ${r.copyLooks.join(" | ")}`);
  const hold = HOLDS.find((h) => r.width >= h.from && r.width <= h.to);
  let measure = r.measures.length ? "wraps" : "";
  if (hold && r.measures.length) {
    const reference = byWidth.get(hold.reference);
    if (!reference) measure = `no ${hold.reference} to compare`;
    else if (JSON.stringify(reference.measures) === JSON.stringify(r.measures)) measure = `= ${hold.reference}`;
    else {
      measure = `differs from ${hold.reference}`;
      problems.push(`a [data-measure] passage breaks differently from ${hold.reference}`);
    }
  }
  failed += problems.length ? 1 : 0;
  const scales = `line ${String(r.line).padEnd(6)} print ${String(r.print).padEnd(6)} air ${String(r.air).padEnd(6)} reader ${String(r.reader).padEnd(6)}`;
  const type = `h1 ${v.title} h2 ${v.sectionTitle} h3 ${v.heading} copy ${v.copy} ui ${v.ui} support ${v.support}`;
  console.log(`${String(r.width).padStart(4)}×${String(r.height).padEnd(4)} ${scales} | ${type} | ${measure.padEnd(16)} ${problems.length ? "FAIL" : "ok"}`);
  for (const p of problems) console.log(`           ↳ ${p}`);
}
console.log(failed ? `\n${failed} width(s) failed.` : "\nEvery width holds the system.");
process.exit(failed ? 1 : 0);
