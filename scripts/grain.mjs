/**
 * ─── The page's film grain, as one tile ───
 *
 * `npm run grain` → public/grain.png: a seamless 256 × 256 grey tile, drawn
 * at 256 CSS px (one pixel a CSS px, softened on a 2× screen as the hero's
 * clumps are soft; noise does not compress, and 512² was 155 KB), of the
 * hero's own grain (components/hero/stage/shaders/film.ts `finish`): soft
 * clumps on a hashed lattice, smoothly interpolated, about a CSS px across,
 * and a finer octave inside them at 0.6 of it. Mid grey ± the grain, laid
 * over the page by soft-light (utilities.css, data-film-grain), which
 * weighs it by the page's own light as the hero's weighs it by the print's
 * (strongest in the midtones, least in the deepest black).
 *
 * `SPREAD` is the grain's standard deviation, of white. At 0.027 it moved
 * a mid grey ~3 levels and the page's black ~1.5, the hero's own grain at
 * those lights (FILM.grain 0.03) — over the flat black that read as too
 * much (the user, 2026-11-07: "a little bit subtle"; the hero's own film
 * is untouched). 0.019: about seven tenths of the hero's.
 *
 * No dependencies: the PNG is written by hand (zlib from Node).
 */

import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const SIZE = 256;
const SPREAD = 0.019;
const SEED = 0x6b617669;

/** An integer hash of a lattice point, in [0, 1). */
function hash(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/** Value noise on a lattice `period` cells round, `cell` tile pixels a
 *  cell, smoothstep between, so the tile repeats without a seam. */
function octave(px, py, cell, seed) {
  const period = SIZE / cell;
  const x = px / cell;
  const y = py / cell;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const at = (i, j) => hash(((i % period) + period) % period, ((j % period) + period) % period, seed);
  const a = at(ix, iy);
  const b = at(ix + 1, iy);
  const c = at(ix, iy + 1);
  const d = at(ix + 1, iy + 1);
  return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy - 0.5;
}

const values = new Float64Array(SIZE * SIZE);
let sum = 0;
let sumSq = 0;
for (let y = 0; y < SIZE; y += 1) {
  for (let x = 0; x < SIZE; x += 1) {
    /* Pixel centres between the lattice's points: a clump a tile px (a CSS
       px), and the finer grain inside it a pixel's own. */
    const n = octave(x + 0.5, y + 0.5, 1, SEED) + 0.6 * (hash(x, y, SEED + 1) - 0.5);
    values[y * SIZE + x] = n;
    sum += n;
    sumSq += n * n;
  }
}
const mean = sum / values.length;
const sd = Math.sqrt(sumSq / values.length - mean * mean);

/* Grey, one byte a pixel, each row led by its filter byte (none). */
const raw = Buffer.alloc((SIZE + 1) * SIZE);
for (let y = 0; y < SIZE; y += 1) {
  raw[y * (SIZE + 1)] = 0;
  for (let x = 0; x < SIZE; x += 1) {
    const v = 0.5 + ((values[y * SIZE + x] - mean) / sd) * SPREAD;
    raw[y * (SIZE + 1) + 1 + x] = Math.max(0, Math.min(255, Math.round(v * 255)));
  }
}

const crcTable = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 0; // greyscale
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);
writeFileSync(new URL("../public/grain.png", import.meta.url), png);
console.log(`public/grain.png: ${SIZE}², ${(png.length / 1024).toFixed(1)} KB, sd ${SPREAD}`);
