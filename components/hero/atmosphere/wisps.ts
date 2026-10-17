/**
 * ─── Atmosphere · the steam's patches ───
 *
 * What moves INSIDE the low mist (shaders/mist.ts): a small square of soft
 * noise, repeating, in two layers — the far patches, against the shores,
 * and the near ones, over the water nearer the camera — that the mist's
 * opacity follows as they drift along the shores and rise off the water
 * (motion.ts MIST_MOTION.wisps). Steam fog is never still. Nothing finer
 * than the patches: finer curls drew a wavy pattern over the reference's
 * mist (motion.ts).
 *
 * EACH LAYER CARRIES ITS OWN SLOPE. Texel by texel: the patches' density,
 * and how fast it changes across and up. The shader lights each patch from
 * that — its side toward the sky lit, its core and underside in its own
 * shade (optics.ts MIST.volume) — with no read beyond the density's own:
 * the slope found by reading again a step away would have doubled them.
 *
 * MADE HERE, NOT LOADED: white noise blurred round the square's edges (so
 * it repeats without a seam), set to a spread of 1 round 0, the same every
 * visit. Once, at start (~22 ms, see blurred); 256 KB of texture.
 *
 * HALF-FLOAT, NOT BYTES: a texel spans ~15 px at 1440, and 8-bit steps that
 * magnified print as terraces in the mist's light (with the finer curls the
 * first build bent by them, as contour lines). No mipmaps (a half-float
 * level chain needs a renderable format not every device has): always
 * magnified.
 *
 * READ, NOT COMPUTED: noise computed in a shader made the plant's compile
 * 2.6× longer (bloom/); two reads of this cost the scene almost nothing.
 */

/** Texels each way. */
export const WISP_SIZE = 128;
/** The layers: far, near. */
export const WISP_LAYERS = 2;
/* The patches' blur (texels): ~2.5 of it across a patch, a fifth of the
   square. */
const BLUR = 6;
const SEEDS = [0x6a09e667, 0x3c6ef372] as const;

/* Three box blurs of radius r along every row, wrapping round the square's
   edge, written transposed — so calling it twice blurs both ways and puts
   the square back. Each box is a running sum over the row laid out with
   its wrapped ends, so its cost does not grow with its width. */
function boxes(src: Float32Array, r: number): Float32Array {
  const n = WISP_SIZE;
  const out = new Float32Array(n * n);
  const line = new Float32Array(n + 2 * r + 1);
  const row = new Float32Array(n);
  const w = 2 * r + 1;
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) row[x] = src[y * n + x];
    for (let pass = 0; pass < 3; pass += 1) {
      for (let i = 0; i < line.length; i += 1) line[i] = row[(i - r + n) % n];
      let sum = 0;
      for (let i = 0; i < w; i += 1) sum += line[i];
      for (let x = 0; x < n; x += 1) {
        row[x] = sum / w;
        sum += line[x + w] - line[x];
      }
    }
    for (let x = 0; x < n; x += 1) out[x * n + y] = row[x];
  }
  return out;
}

/* White noise, blurred to `sigma` texels by three boxes each way (all but a
   Gaussian), set to a spread of 1 round 0. Measured cold, as a first visit
   runs it, with the slopes: ~22 ms for both layers, most of it the engine
   warming to the code, while the shaders compile (as a plain Gaussian,
   ~40 without them). */
function blurred(seed: number, sigma: number): Float32Array {
  const n = WISP_SIZE;
  let h = seed >>> 0;
  let field: Float32Array = new Float32Array(n * n);
  for (let i = 0; i < field.length; i += 1) {
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    h ^= h >>> 15;
    field[i] = (h >>> 0) / 4294967296 - 0.5;
  }
  /* Three boxes of width w have the spread of a Gaussian of w² − 1 = 4σ². */
  const r = Math.max(1, Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2));
  field = boxes(boxes(field, r), r);
  let sum = 0;
  let squares = 0;
  for (let i = 0; i < field.length; i += 1) {
    sum += field[i];
    squares += field[i] * field[i];
  }
  const mean = sum / field.length;
  const scale = 1 / Math.sqrt(squares / field.length - mean * mean);
  for (let i = 0; i < field.length; i += 1) field[i] = (field[i] - mean) * scale;
  return field;
}

/* The layer as the shader reads it, four values a texel: the density, its
   slope across and up (central differences, wrapping; set to a spread of
   1 together, so the light reads the same at any blur), and nothing. Row
   0 is the bottom of the square: up is up. */
function layer(field: Float32Array, out: Float32Array, at: number): void {
  const n = WISP_SIZE;
  const slopes = new Float32Array(n * n * 2);
  let squares = 0;
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      const across = (field[y * n + ((x + 1) % n)] - field[y * n + ((x - 1 + n) % n)]) / 2;
      const up = (field[((y + 1) % n) * n + x] - field[((y - 1 + n) % n) * n + x]) / 2;
      slopes[(y * n + x) * 2] = across;
      slopes[(y * n + x) * 2 + 1] = up;
      squares += across * across + up * up;
    }
  }
  const scale = 1 / Math.sqrt(squares / (n * n));
  for (let i = 0; i < n * n; i += 1) {
    out[at + i * 4] = field[i];
    out[at + i * 4 + 1] = slopes[i * 2] * scale;
    out[at + i * 4 + 2] = slopes[i * 2 + 1] * scale;
  }
}

export function createWisps(gl: WebGL2RenderingContext): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error("atmosphere: wisps allocation failed");
  const texels = WISP_SIZE * WISP_SIZE;
  const data = new Float32Array(texels * 4 * WISP_LAYERS);
  SEEDS.forEach((seed, i) => layer(blurred(seed, BLUR), data, i * texels * 4));
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
  gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA16F, WISP_SIZE, WISP_SIZE, WISP_LAYERS, 0, gl.RGBA, gl.FLOAT, data);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
  return tex;
}
