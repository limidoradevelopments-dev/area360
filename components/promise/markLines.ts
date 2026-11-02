/**
 * ─── Promise · the mark's lines ───
 *
 * The user's mark (their stage drawing, 2026-11-02: 749 × 560, the moth),
 * as the lines its letters are laid on (calligram.ts). Its RIGHT HALF only,
 * as given — the forewing's and the hindwing's outlines, and the antenna's
 * centre line (the drawing's antenna is a thin filled crescent: its two
 * sides averaged) — the left half is their mirror about `MARK_AXIS`, as the
 * drawing's own pairs are (to 0.05 of a unit).
 *
 * Every outline runs CLOCKWISE on the screen (y down) from where it meets
 * the body: out along its top, round, and back. A glyph laid along a line
 * turned to the line's direction has its top on the line's left — for a
 * clockwise outline, outside the wing. The antenna runs from its base to
 * its tip.
 *
 * Flattened once, in the drawing's own units; the stage scales them.
 */

export const MARK_VIEW = { width: 749, height: 560 } as const;

/** The mark's mirror line: halfway between each pair's inner edges. */
export const MARK_AXIS = 373.6;

/** The moth's body, down the axis: between the forewings' roots (227)
 *  and the hindwings' tops (297). The bloom opens from it. */
export const MARK_BODY = 262;

/* The drawing's own paths (the user's SVG: its paths 1 and 3), and the
   antenna's centre line (its path 4's two sides, averaged). */
const SOURCES = {
  fore: {
    closed: true,
    d: "M383.651 227.17C498.406 223.913 582.133 238.431 640.19 257.932C698.209 277.419 730.683 301.915 742.801 318.698L743.111 319.129L742.961 319.541C675.913 276.854 608.188 270.425 539.633 270.483C535.74 270.686 531.745 270.976 527.912 271.374C531.745 271.771 535.697 272.276 539.514 272.865C606.626 284.876 679.717 314.723 718.688 356.512C719.045 357.017 719.372 357.52 719.662 358.003C705.011 375.115 686.142 390.197 666.372 402.981C632.884 424.636 596.651 439.803 573.488 447.147L573.229 447.229L572.964 447.169C512.771 433.43 468.523 394.047 437.685 350.491C406.85 306.94 389.363 259.14 382.702 228.381L382.447 227.204L383.651 227.17Z",
  },
  hind: {
    closed: true,
    d: "M384.634 297.391C394.959 330.225 442.546 408.608 550.144 457.998L553.396 459.49L549.841 459.9C530.06 462.178 491.131 479.797 473.702 530.913C469.007 517.04 460.181 505.214 451.506 494.931C450.654 493.962 449.778 492.984 448.878 491.999C449.519 493.169 450.132 494.326 450.717 495.468C460.409 513.917 466.477 536.66 460.815 553.056C454.151 541.811 444.297 526.645 432.574 511.214C418.061 492.11 400.73 472.656 383.088 459.712L382.68 459.413V297.691L384.634 297.391Z",
  },
  antenna: {
    closed: false,
    d: "M383.83 223.83L384.05 206.24C390.63 104.98 468.48 -16.28 582.32 5.84C588.24 6.75 593.76 7.86 599.68 9.32",
  },
} as const;

export type MarkPart = keyof typeof SOURCES;

/** A line flattened to points, with the arc length at each. */
export interface MarkLine {
  readonly x: Float64Array;
  readonly y: Float64Array;
  /** Arc length at each point, from 0 to `length`. */
  readonly s: Float64Array;
  readonly length: number;
  readonly closed: boolean;
}

/* Points a cubic is cut into. At 24 the chord is within ~0.02 of a unit of
   the curve on the drawing's tightest bend (the wing tips): far under a
   pixel at any size the stage is drawn. */
const STEPS_PER_CURVE = 24;

/** One of the drawing's lines: M, L, H, V, C and Z, absolute (as Figma
 *  writes them). */
function flatten(d: string, closed: boolean): MarkLine {
  const tokens = d.match(/[MLHVCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? [];
  const xs: number[] = [];
  const ys: number[] = [];
  let i = 0;
  let command = "";
  let x = 0;
  let y = 0;
  const read = () => Number.parseFloat(tokens[i++]);
  const push = (px: number, py: number) => {
    /* A point on the last one (the drawing's own doubled corners) would
       give the line no direction there. */
    const n = xs.length;
    if (n > 0 && Math.hypot(px - xs[n - 1], py - ys[n - 1]) < 1e-3) return;
    xs.push(px);
    ys.push(py);
  };
  while (i < tokens.length) {
    if (/[a-z]/i.test(tokens[i])) command = tokens[i++].toUpperCase();
    if (command === "M" || command === "L") {
      x = read();
      y = read();
      push(x, y);
    } else if (command === "H") {
      x = read();
      push(x, y);
    } else if (command === "V") {
      y = read();
      push(x, y);
    } else if (command === "C") {
      const [x1, y1, x2, y2, x3, y3] = [read(), read(), read(), read(), read(), read()];
      for (let k = 1; k <= STEPS_PER_CURVE; k += 1) {
        const t = k / STEPS_PER_CURVE;
        const u = 1 - t;
        push(
          u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
          u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
        );
      }
      x = x3;
      y = y3;
    } else {
      /* Z: a closed line's last point is its first, implied. */
      i += 1;
    }
  }
  /* Closed: the drawing returns to its start; the seam is the step from
     the last point back to the first. */
  if (closed) push(xs[0], ys[0]);
  const s = new Float64Array(xs.length);
  for (let k = 1; k < xs.length; k += 1) s[k] = s[k - 1] + Math.hypot(xs[k] - xs[k - 1], ys[k] - ys[k - 1]);
  return { x: Float64Array.from(xs), y: Float64Array.from(ys), s, length: s[s.length - 1], closed };
}

/** The mirror of a line about the axis: the same arc, the other wing. */
function mirrored(line: MarkLine): MarkLine {
  return { ...line, x: line.x.map((x) => 2 * MARK_AXIS - x) };
}

/** Every line of the mark, both halves: the right as drawn, the left its
 *  mirror. Made once. */
export interface MarkLines {
  readonly right: Readonly<Record<MarkPart, MarkLine>>;
  readonly left: Readonly<Record<MarkPart, MarkLine>>;
}

let made: MarkLines | null = null;

export function markLines(): MarkLines {
  if (made) return made;
  const right = {
    fore: flatten(SOURCES.fore.d, SOURCES.fore.closed),
    hind: flatten(SOURCES.hind.d, SOURCES.hind.closed),
    antenna: flatten(SOURCES.antenna.d, SOURCES.antenna.closed),
  };
  made = {
    right,
    left: { fore: mirrored(right.fore), hind: mirrored(right.hind), antenna: mirrored(right.antenna) },
  };
  return made;
}

/** Where a line is at arc length `s` (wrapped round a closed line). */
export function pointOn(line: MarkLine, s: number): { x: number; y: number } {
  const length = line.length;
  let at = s;
  if (line.closed) at = ((at % length) + length) % length;
  else at = Math.min(Math.max(at, 0), length);
  /* Binary search for the segment. */
  let low = 0;
  let high = line.s.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (line.s[mid] <= at) low = mid;
    else high = mid;
  }
  const span = line.s[high] - line.s[low] || 1;
  const f = (at - line.s[low]) / span;
  return {
    x: line.x[low] + (line.x[high] - line.x[low]) * f,
    y: line.y[low] + (line.y[high] - line.y[low]) * f,
  };
}

/**
 * HOW MUCH ROOM A LINE HAS, every `step` units along it: the distance to
 * the nearest other line of the mark — or to the same line further than
 * `reach` along it (a wing's tip, where an outline turns back on itself).
 * Letters laid along two lines that close in on each other are made
 * smaller there (calligram.ts): a wing's text tapers into its points, as
 * micrography does. In the drawing's units; for the right half only (the
 * left is its mirror, so its room is the same), measured against both.
 */
export function roomAlong(part: MarkPart, step: number, reach: number): Float64Array {
  const lines = markLines();
  const own = lines.right[part];
  const others: MarkLine[] = [];
  for (const side of [lines.right, lines.left]) {
    for (const name of Object.keys(side) as MarkPart[]) {
      if (side[name] !== own) others.push(side[name]);
    }
  }
  const count = Math.max(2, Math.ceil(own.length / step) + 1);
  const room = new Float64Array(count);
  const length = own.length;
  for (let k = 0; k < count; k += 1) {
    const s = Math.min(k * step, length);
    const p = pointOn(own, s);
    let nearest = Number.POSITIVE_INFINITY;
    for (const line of others) {
      for (let j = 1; j < line.x.length; j += 1) {
        nearest = Math.min(nearest, toSegment(p.x, p.y, line, j));
      }
    }
    const arcApart = (t: number) => {
      const d = Math.abs(t - s);
      return own.closed ? Math.min(d, length - d) : d;
    };
    for (let j = 1; j < own.x.length; j += 1) {
      /* Only a stretch of the line wholly `reach` or more along it. */
      const within = s >= own.s[j - 1] && s <= own.s[j];
      if (within || Math.min(arcApart(own.s[j - 1]), arcApart(own.s[j])) < reach) continue;
      nearest = Math.min(nearest, toSegment(p.x, p.y, own, j));
    }
    room[k] = nearest;
  }
  return room;
}

/** A point's distance to a line's segment ending at point `j`: the
 *  drawing's straight runs (the body's edge) are one segment long. */
function toSegment(px: number, py: number, line: MarkLine, j: number): number {
  const ax = line.x[j - 1];
  const ay = line.y[j - 1];
  const dx = line.x[j] - ax;
  const dy = line.y[j] - ay;
  const span = dx * dx + dy * dy || 1;
  const t = Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / span));
  return Math.hypot(ax + dx * t - px, ay + dy * t - py);
}
