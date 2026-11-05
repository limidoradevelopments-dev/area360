/**
 * ─── 404 · the still ───
 *
 *     npm run lost-still          (node scripts/lost/still.mjs)
 *
 * The ruin as a picture, for where there is no scene (no WebGL2, a lost
 * context, no scripting: components/not-found/LostStill.tsx). THE SOURCE
 * IS THE SCENE'S OWN FRAME, so the two are one picture: each a capture of
 * the 404 page's canvas alone, the words hidden —
 *
 *     assets/sources/lost/still/wide.png      1920 × 957 CSS px at 1.5×
 *     assets/sources/lost/still/upright.png    585 × 1100 CSS px at 2×
 *
 * (In a development page at that size, with `[data-lost-words]` hidden and
 * the scene shown, a screenshot of the viewport.) The wide one is laid with
 * `cover` about the hero's horizon, as the wide lens frames it; the upright
 * one by its foot, where the phone frame keeps the stone (scene/frame.ts).
 *
 * Writes lossy WebP in a few widths each to public/lost/still/ (one
 * channel would do but the frame's warm tone is kept), and
 * components/not-found/scene/still.json: the widths and a version of the
 * content, which goes in the URLs. Recapture whenever the scene's look
 * changes. Requires sharp (in node_modules).
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SOURCE = join(ROOT, "assets", "sources", "lost", "still");
const OUT = join(ROOT, "public", "lost", "still");
const META = join(ROOT, "components", "not-found", "scene", "still.json");

/* Widths each is written at: the 1× and the 1.5× of a 1920 screen; a 2×
   and a 3× phone's (the 3× stretched a little: fog). */
const STILLS = { wide: [1920, 2880], upright: [828, 1170] };
const QUALITY = 80;

mkdirSync(OUT, { recursive: true });
const hash = createHash("sha256");
for (const name of Object.keys(STILLS)) hash.update(readFileSync(join(SOURCE, `${name}.png`)));
const version = hash.digest("hex").slice(0, 10);

for (const [name, widths] of Object.entries(STILLS)) {
  for (const width of widths) {
    const out = join(OUT, `${name}-${width}.webp`);
    const info = await sharp(join(SOURCE, `${name}.png`)).resize({ width, kernel: "lanczos3" }).webp({ quality: QUALITY, smartSubsample: true }).toFile(out);
    console.log(`${name}-${width}.webp ${info.width}x${info.height} ${(info.size / 1024).toFixed(1)} KB`);
  }
}
writeFileSync(META, `${JSON.stringify({ ...STILLS, version }, null, 2)}\n`);
console.log(`wrote ${META} (version ${version})`);
