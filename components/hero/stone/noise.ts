/**
 * ─── Stone · its noise lattice ───
 *
 * One random value a lattice cell, read by the stone's value noise
 * (shaders/stone.ts stoneNoise): the grain, the flecks, the pits, the
 * lichen, the chips, the stain's line, the rain's runs, the polish and the
 * meniscus all read it, at their own scales and offsets.
 *
 * A TEXTURE, NOT A HASH (2026-10-29). The noise hashed its cells with
 * fract(sin(n)·43758.5) over n = dot(cell, (1, 57)): one number per cell,
 * so the cells 57 apart along a near-level diagonal held the same value,
 * and at the fine scales (pits 7 mm, grain 2.4 mm) n ran into the
 * thousands, where a 32-bit sin keeps few of the digits the fract reads.
 * The faces carried a regular lattice of dark dashes — a weave, not
 * granite. Here every cell holds its own value from a well-mixed generator,
 * and one filtered read (the smoothstep's weights folded into the
 * coordinate) does what four hashes and three mixes did.
 *
 * SIZE: 512 cells a side, so even the finest grain (2.4 mm) runs 1.2 m
 * before it repeats — longer than a face is wide (~0.7 m). R8, 256 KB.
 * SEEDED: the same stone on every visit.
 */

/** Cells a side (shaders/stone.ts reads it). */
export const STONE_NOISE_SIZE = 512;

/* mulberry32: a small, well-mixed 32-bit generator. */
function generator(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}

export function createStoneNoise(gl: WebGL2RenderingContext): WebGLTexture {
  const n = STONE_NOISE_SIZE;
  const next = generator(0x5704e);
  const data = new Uint8Array(n * n);
  for (let i = 0; i < data.length; i += 4) {
    /* Four bytes a draw. */
    const v = next();
    data[i] = v & 255;
    data[i + 1] = (v >>> 8) & 255;
    data[i + 2] = (v >>> 16) & 255;
    data[i + 3] = v >>> 24;
  }
  const tex = gl.createTexture();
  if (!tex) throw new Error("stage: stone noise allocation failed");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, n, n, 0, gl.RED, gl.UNSIGNED_BYTE, data);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  /* LINEAR: the read between four cells is the noise's own blend. REPEAT:
     the lattice tiles, so any cell index is a cell. */
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  return tex;
}
