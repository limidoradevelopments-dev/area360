/**
 * ─── 404 · the plate ───
 *
 *     npm run lost-plate          (node scripts/lost/plate.mjs)
 *
 * The 404's fog, its far banks and its water's tone, READ OFF THE USER'S
 * FRAME (assets/sources/lost/desktop.webp, 2026-11-05), not judged: every
 * part of that frame but the stone, the strip of words and the headline is
 * a smooth field, and the scene lays this field behind the live stone.
 *
 * IN THE CAMERA'S ANGLES, not the frame's pixels: each texel is a direction
 * from the camera at rest (tan of its bearing across, tan of its elevation),
 * the hero's camera as it frames a 2000×1010 screen (hero/stage/camera.ts:
 * the lens 2497 px, the horizon 593.5 px down). So on any screen the fog,
 * the banks and the water's darkening toward the foot stay where they are
 * in the world: a phone sees the middle of it, a wide screen its banks.
 * (Checked: read as depth on the water, the phone frame's darkening is the
 * desktop frame's to ~2 levels.)
 *
 * What hides the field is filled from either side, row by row (it varies
 * down the frame far more than across it); then it is smoothed and kept
 * small: LUMINANCE ONLY (the frame's warm tone is a fit, scene/optics.ts
 * TONING), 8 bits, inlined in the script that draws it (no request to
 * wait on or fail).
 *
 * Writes components/not-found/scene/plate.ts. Run it again if the frame
 * changes. Requires sharp (in node_modules).
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SOURCE = join(ROOT, "assets", "sources", "lost", "desktop.webp");
const OUT = join(ROOT, "components", "not-found", "scene", "plate.ts");

/* The frame's camera (hero/stage/camera.ts at 2000×1010): lens and axis. */
const FOCAL = 2497.4;
const AXIS = [1000, 593.5];

/* What is not the field, in the frame's px: the strip of words (all the way
   down), the stone with its flowers, rubble and reflection, the headline
   and its link. */
const HOLES = [
  { x0: 995, x1: 1170, y0: 0, y1: 1010 },
  { x0: 870, x1: 1230, y0: 680, y1: 1010 },
  { x0: 15, x1: 440, y0: 840, y1: 1000 },
];

/* The plate: texels across and down, and the angles it spans (tan). */
const SIZE = [96, 72];

const { data, info } = await sharp(SOURCE).raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const C = info.channels;
const hidden = (x, y) => HOLES.some((h) => x >= h.x0 && x < h.x1 && y >= h.y0 && y < h.y1);

/* Luminance (Rec. 709 weights on the sRGB values: the frame is grey, so
   the weights hardly matter) and the warm tone: each channel against the
   green, a line fitted over every pixel of the field. */
const lum = new Float32Array(W * H);
const known = new Uint8Array(W * H);
let n = 0;
const sums = { g: 0, gg: 0, r: 0, rg: 0, b: 0, bg: 0 };
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * C;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    lum[y * W + x] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (hidden(x, y)) continue;
    known[y * W + x] = 1;
    n++;
    sums.g += g;
    sums.gg += g * g;
    sums.r += r;
    sums.rg += r * g;
    sums.b += b;
    sums.bg += b * g;
  }
}
const fit = (s, sg) => {
  const slope = (n * sg - sums.g * s) / (n * sums.gg - sums.g * sums.g);
  return [slope, (s - slope * sums.g) / n];
};
const toneR = fit(sums.r, sums.rg);
const toneB = fit(sums.b, sums.bg);

/* Fill each hole along its row from the nearest field either side,
   weighted by nearness. */
const filled = new Float32Array(lum);
for (let y = 0; y < H; y++) {
  let x = 0;
  while (x < W) {
    if (known[y * W + x]) {
      x++;
      continue;
    }
    let end = x;
    while (end < W && !known[y * W + end]) end++;
    const left = x > 0 ? lum[y * W + x - 1] : null;
    const right = end < W ? lum[y * W + end] : null;
    for (let k = x; k < end; k++) {
      if (left === null) filled[y * W + k] = right;
      else if (right === null) filled[y * W + k] = left;
      else {
        const t = (k - x + 1) / (end - x + 1);
        filled[y * W + k] = left + (right - left) * t;
      }
    }
    x = end;
  }
}

/* Smoothed before it is sampled: the frame's own compression and grain
   left a faint lattice in the cells (a box blur, twice each way: ~10 px
   across, where the field changes over hundreds; ~3 px down, where the
   water darkens fast toward the foot). The frame's edge is held, not
   dropped: a window cut short there lightened the foot by ~5 levels. */
const BLUR = { across: 12, down: 3 };
function boxBlur(src, horizontal) {
  const dst = new Float32Array(src.length);
  const len = horizontal ? W : H;
  const r = horizontal ? BLUR.across : BLUR.down;
  for (let line = 0; line < (horizontal ? H : W); line++) {
    const at = (k) => (horizontal ? line * W + Math.min(len - 1, Math.max(0, k)) : Math.min(len - 1, Math.max(0, k)) * W + line);
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += src[at(k)];
    for (let k = 0; k < len; k++) {
      dst[horizontal ? line * W + k : k * W + line] = sum / (2 * r + 1);
      sum += src[at(k + r + 1)] - src[at(k - r)];
    }
  }
  return dst;
}
let smooth = filled;
for (let pass = 0; pass < 2; pass++) smooth = boxBlur(boxBlur(smooth, true), false);

/* The angles the frame spans, and so the plate. */
const across = [(0 - AXIS[0]) / FOCAL, (W - AXIS[0]) / FOCAL];
const up = [(AXIS[1] - H) / FOCAL, AXIS[1] / FOCAL];

/* Each texel the mean of the frame's pixels over its cell: a box over a
   cell and half its neighbours', so no texel is a single noisy row. */
const [PW, PH] = SIZE;
const cellW = W / PW;
const cellH = H / PH;
const out = new Uint8Array(PW * PH);
for (let j = 0; j < PH; j++) {
  for (let i = 0; i < PW; i++) {
    /* Centred on the texel's centre, held at the frame's edge (an edge
       cell's window cut short would sit off its centre). */
    const x0 = Math.floor((i - 0.5) * cellW);
    const x1 = Math.ceil((i + 1.5) * cellW);
    const y0 = Math.floor((j - 0.5) * cellH);
    const y1 = Math.ceil((j + 1.5) * cellH);
    let s = 0;
    let c = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      s += smooth[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
      c++;
    }
    /* Row 0 of the plate is its BOTTOM (the lowest elevation): the GL
       convention, so the shader reads it with elevation rising. */
    out[(PH - 1 - j) * PW + i] = Math.round(s / c);
  }
}

const round = (v) => Math.round(v * 1e5) / 1e5;
const ts = `/**
 * ─── 404 · the plate (GENERATED by scripts/lost/plate.mjs: do not edit) ───
 *
 * The fog, the far banks and the water's tone of the user's 404 frame
 * (assets/sources/lost/desktop.webp), the stone, the words and the
 * headline taken out, as a field over the camera's directions: ${PW}×${PH}
 * texels of luminance (sRGB levels), row 0 the lowest elevation.
 */

/** Texels across and down. */
export const PLATE_SIZE = [${PW}, ${PH}] as const;

/** The directions it spans: tan of the bearing across (left, right) and of
 *  the elevation (lowest, highest), from the camera at rest. */
export const PLATE_SPAN = { across: [${round(across[0])}, ${round(across[1])}], up: [${round(up[0])}, ${round(up[1])}] } as const;

/** The frame's warm tone: red and blue as lines in the green (slope,
 *  offset in levels), fitted over the whole field. */
export const PLATE_TONE = { red: [${round(toneR[0])}, ${round(toneR[1])}], blue: [${round(toneB[0])}, ${round(toneB[1])}] } as const;

/** The luminance, base64. */
export const PLATE_DATA = "${Buffer.from(out).toString("base64")}";
`;
writeFileSync(OUT, ts);
console.log(`wrote ${OUT}: ${PW}x${PH}, red ${toneR.map(round)}, blue ${toneB.map(round)}, across ${across.map(round)}, up ${up.map(round)}`);
