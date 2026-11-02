/**
 * ─── Promise · the letters' atlas ───
 *
 * Every letter the passages use, drawn once in the copy's own face at the
 * copy's own size (so the face's optical size is the copy's: drawn larger,
 * Newsreader would take its display cut), at `scale` pixels a CSS px, into
 * one texture the canvas draws every letter from — three copies of each
 * in three channels:
 *
 *   R  the letter, sharp: on its line, and landed on the mark;
 *   G  out of focus a little (a blur of σ `soft[0]` CSS px);
 *   B  out of focus more (σ `soft[1]`): a letter at its nearest in the
 *      air, and the glow of a glint.
 *
 * A letter's depth is drawn as a mix of the three (shaders/letters.ts), as
 * the preloader's words are: a still blur is drawn once; only how much of
 * each copy shows changes.
 *
 * THE BLUR IS A SHADOW'S. The canvas `filter` is not in every browser
 * (Safari); a shadow's blur is, and a shadow's Gaussian has σ half its
 * `shadowBlur`, in the bitmap's pixels whatever the transform. The letter
 * is drawn far off its cell and only its shadow lands there.
 */

export interface AtlasFont {
  /** The computed `font-family` of the copy. */
  readonly family: string;
  readonly size: number;
  readonly weight: string;
}

export interface Glyph {
  /** Its cell in the atlas, as shares of the texture. */
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
  /** The cell's size, CSS px at the copy's size. */
  readonly width: number;
  readonly height: number;
  /** Where in the cell the letter's centre is (half its advance along its
   *  baseline, half its x-height up), CSS px from the cell's top left. */
  readonly anchorX: number;
  readonly anchorY: number;
  /** Its advance, CSS px. */
  readonly advance: number;
}

export interface GlyphAtlas {
  readonly pixels: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly glyphs: ReadonlyMap<string, Glyph>;
  /** The face's ascent (its content area's top to its baseline) and its
   *  x-height, CSS px: where a letter's centre is in the box the page lays
   *  it in. */
  readonly ascent: number;
  readonly xHeight: number;
  /** The width of a space, CSS px. */
  readonly space: number;
}

/* Far enough off the cell that the letter itself never lands in it. */
const OFFSTAGE = 4096;

export function buildAtlas(chars: Iterable<string>, font: AtlasFont, scale: number, soft: readonly [number, number]): GlyphAtlas {
  const css = `${font.weight} ${font.size}px ${font.family}`;
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) throw new Error("promise: no 2D canvas");
  probe.font = css;
  const xHeight = probe.measureText("x").actualBoundingBoxAscent;
  const faceMetrics = probe.measureText("H");
  const ascent = faceMetrics.fontBoundingBoxAscent ?? font.size * 0.9;
  const space = probe.measureText(" ").width;

  /* Room round each letter for its softest copy: three sigma. */
  const pad = Math.ceil(soft[1] * 3) + 1;
  const unique = Array.from(new Set(chars));
  const cells = unique.map((char) => {
    const m = probe.measureText(char);
    const left = Math.ceil(m.actualBoundingBoxLeft) + pad;
    const right = Math.ceil(m.actualBoundingBoxRight) + pad;
    const up = Math.ceil(m.actualBoundingBoxAscent) + pad;
    const down = Math.ceil(m.actualBoundingBoxDescent) + pad;
    return { char, advance: m.width, left, width: left + right, up, height: up + down };
  });

  /* Shelves, tallest first, in a texture 1024 px wide (2048 if a letter is
     too wide for it); its height a power of two. */
  const px = (v: number) => Math.ceil(v * scale);
  const order = [...cells].sort((a, b) => b.height - a.height);
  let atlasWidth = 1024;
  while (order.some((cell) => px(cell.width) + 2 > atlasWidth)) atlasWidth *= 2;
  const placed = new Map<string, { x: number; y: number }>();
  let x = 1;
  let y = 1;
  let shelf = 0;
  for (const cell of order) {
    const w = px(cell.width);
    const h = px(cell.height);
    if (x + w + 1 > atlasWidth) {
      x = 1;
      y += shelf + 1;
      shelf = 0;
    }
    placed.set(cell.char, { x, y });
    x += w + 1;
    shelf = Math.max(shelf, h);
  }
  let atlasHeight = 1;
  while (atlasHeight < y + shelf + 1) atlasHeight *= 2;

  const canvas = document.createElement("canvas");
  canvas.width = atlasWidth;
  canvas.height = atlasHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("promise: no 2D canvas");

  /* One pass a copy, read back and packed into its channel. */
  const pixels = new Uint8Array(atlasWidth * atlasHeight * 4);
  const passes: readonly number[] = [0, soft[0], soft[1]];
  passes.forEach((sigma, channel) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, atlasWidth, atlasHeight);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.font = css;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillStyle = "#fff";
    ctx.shadowColor = sigma > 0 ? "#fff" : "transparent";
    ctx.shadowBlur = sigma * 2 * scale;
    ctx.shadowOffsetX = sigma > 0 ? OFFSTAGE * scale : 0;
    const shift = sigma > 0 ? OFFSTAGE : 0;
    for (const cell of cells) {
      const at = placed.get(cell.char);
      if (!at) continue;
      ctx.fillText(cell.char, at.x / scale + cell.left - shift, at.y / scale + cell.up);
    }
    const data = ctx.getImageData(0, 0, atlasWidth, atlasHeight).data;
    for (let i = 0; i < atlasWidth * atlasHeight; i += 1) pixels[i * 4 + channel] = data[i * 4 + 3];
  });

  const glyphs = new Map<string, Glyph>();
  for (const cell of cells) {
    const at = placed.get(cell.char);
    if (!at) continue;
    const w = px(cell.width);
    const h = px(cell.height);
    glyphs.set(cell.char, {
      u0: at.x / atlasWidth,
      v0: at.y / atlasHeight,
      u1: (at.x + w) / atlasWidth,
      v1: (at.y + h) / atlasHeight,
      width: w / scale,
      height: h / scale,
      anchorX: cell.left + cell.advance / 2,
      anchorY: cell.up - xHeight / 2,
      advance: cell.advance,
    });
  }
  return { pixels, width: atlasWidth, height: atlasHeight, glyphs, ascent, xHeight, space };
}
