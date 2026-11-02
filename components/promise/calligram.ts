/**
 * ─── Promise · the calligram ───
 *
 * Where every letter of the two passages lies on the mark (the user's
 * frame: the moth written in words along its own outlines): each passage's
 * words laid along the mark's lines (markLines.ts) in reading order, each
 * letter centred on its line by its x-height and turned to it, as a
 * calligram is written — Apollinaire's, or Herbert's "Easter Wings".
 *
 * THE RIGHT HALF READS, THE LEFT IS ITS REFLECTION (the user's frame:
 * "MOTH" on the right, "HTOM" on the left). A run on the left is laid on
 * the right's line and mirrored, letter and all.
 *
 * AN OUTLINE, NOT A SCATTER OF WORDS. Every letter is made as large as it
 * can be (up to `largest` of the copy) with the words no closer than
 * `tightest` of a space — one size for both passages, so no wing is
 * lettered larger than another — and each run is then justified to its
 * line exactly (a closed outline all the way round, its seam one more gap;
 * an antenna from near its base to its tip): the words keep their letters'
 * spacing, the gaps between them take the slack, evenly, as the frame's
 * "MOTH MOTH" are set.
 *
 * A WING'S TEXT TAPERS INTO ITS POINTS. Where two lines close in on each
 * other (a wing's tip, where its outline turns back on itself; the notch;
 * the tails; the body, where the halves meet) a letter is made no larger
 * than the room there is (markLines.ts roomAlong), down to a speck — as
 * micrography tapers its script into a drawing's points — instead of
 * piling into the next line's. A run's share of its passage is what its
 * line can hold, tapering and all, so a wing with long thin tails is not
 * given the words of a broad one.
 */

import type { MarkLine, MarkLines, MarkPart } from "./markLines";
import { MARK_AXIS, pointOn } from "./markLines";

/** A letter of a passage, in reading order. */
export interface LetterIn {
  /** Its advance at the copy's size, CSS px. */
  readonly advance: number;
}

/** A passage as its words: each word's letters (indices into the
 *  passage's letters, in order), and the width of a space, at the copy's
 *  size. */
export interface PassageIn {
  readonly letters: readonly LetterIn[];
  readonly words: readonly (readonly number[])[];
  readonly space: number;
}

/** A line of the mark a passage is written along, in turn. */
export interface RunIn {
  readonly part: MarkPart;
  readonly side: "right" | "left";
}

export interface CalligramOptions {
  /** CSS px a unit of the drawing is drawn at. */
  readonly scale: number;
  /** The copy's font size, CSS px. */
  readonly fontSize: number;
  /** Each part's room along it (markLines.ts roomAlong), drawing units,
   *  sampled every `roomStep`. */
  readonly room: Readonly<Record<MarkPart, Float64Array>>;
  readonly roomStep: number;
  /** The taper (motion.ts CALLIGRAM): a letter's height and the clearance
   *  kept beside it, in ems of the copy, and the least a letter is made. */
  readonly letterHeight: number;
  readonly clear: number;
  readonly smallest: number;
  /** The sharpest turn a word is laid over, radians across one letter. */
  readonly sharpest: number;
  /** The least gap between words, as a share of a space. */
  readonly tightest: number;
  /** The largest the letters are made, a share of the copy's size. */
  readonly largest: number;
  /** Where an antenna's words begin, a share of its length. */
  readonly antennaLead: number;
}

/** A letter's place on the mark. */
export interface Slot {
  /** Its centre (the x-height's middle), CSS px from the drawing's top
   *  left. */
  readonly x: number;
  readonly y: number;
  /** Its turn, radians, clockwise on the screen. */
  readonly angle: number;
  /** Its size, a share of the copy's. */
  readonly scale: number;
  /** Drawn mirrored (the left half). */
  readonly mirror: boolean;
  /** Which of its passage's runs, and how far along it (0 at the run's
   *  start, 1 at its end). */
  readonly run: number;
  readonly along: number;
}

/** A passage and the lines it is written along, in turn. */
export interface CalligramIn {
  readonly passage: PassageIn;
  readonly runs: readonly RunIn[];
}

/** Every passage's slots, each in its passage's letter order. */
export function layCalligram(passages: readonly CalligramIn[], lines: MarkLines, o: CalligramOptions): Slot[][] {
  /* The letters' size: the largest every run of every passage can take
     with its words no closer than `tightest` of a space. */
  const fits = (size: number) =>
    passages.every(({ passage, runs }) =>
      share(passage, runs, size).every(
        (words, r) => !setRun(passage, lines.right[runs[r].part], runs[r].part, words, size, passage.space * o.tightest * size).overfull,
      ),
    );
  let size = o.largest;
  if (!fits(size)) {
    let low = 0.1;
    let high = size;
    for (let k = 0; k < 24; k += 1) {
      const mid = (low + high) / 2;
      if (fits(mid)) low = mid;
      else high = mid;
    }
    size = low;
  }

  return passages.map(({ passage, runs }) => {
    const slots: Slot[] = new Array(passage.letters.length);
    share(passage, runs, size).forEach((words, r) => {
      const { part, side } = runs[r];
      const placed = justify(passage, lines.right[part], part, words, size);
      const mirror = side === "left";
      const axis = MARK_AXIS * o.scale;
      for (const { letter, x, y, angle, scale, along } of placed) {
        slots[letter] = mirror
          ? { x: 2 * axis - x, y, angle: -angle, scale, mirror, run: r, along }
          : { x, y, angle, scale, mirror, run: r, along };
      }
    });
    return slots;
  });

  /** The passage's words shared out among its runs by what each run's line
   *  holds at this size (its length, each stretch counted by how much
   *  smaller the taper makes the letters there), at word boundaries: each
   *  word goes to the run its middle falls in, the text laid end to end
   *  over the runs in turn. */
  function share(passage: PassageIn, runs: readonly RunIn[], size: number): number[][] {
    const holds = runs.map(({ part }) => capacity(lines.right[part], part, size));
    const total = holds.reduce((sum, hold) => sum + hold, 0);
    const widths = passage.words.map((word) => word.reduce((sum, k) => sum + passage.letters[k].advance, 0));
    const textLength = widths.reduce((sum, width) => sum + width, 0) + passage.space * (widths.length - 1);
    const shares: number[][] = runs.map(() => []);
    let at = 0;
    let edge = 0;
    let run = 0;
    widths.forEach((width, w) => {
      const middle = (at + width / 2) / textLength;
      while (run < runs.length - 1 && middle > (edge + holds[run]) / total) {
        edge += holds[run];
        run += 1;
      }
      shares[run].push(w);
      at += width + passage.space;
    });
    return shares;
  }

  /** What a line holds: its length over the letters' size along it. */
  function capacity(line: MarkLine, part: MarkPart, size: number): number {
    const length = line.length * o.scale;
    const step = o.roomStep * o.scale;
    let hold = 0;
    for (let s = 0; s < length; s += step) hold += Math.min(step, length - s) / letterSize(part, s, size);
    return hold;
  }

  /** The run's words set from its start with one gap between each. */
  function setRun(
    passage: PassageIn,
    line: MarkLine,
    part: MarkPart,
    words: readonly number[],
    size: number,
    gap: number,
  ): { overfull: boolean; placed: Placed[] } {
    const length = line.length * o.scale;
    const start = line.closed ? gap / 2 : length * o.antennaLead;
    const end = line.closed ? length - gap / 2 : length;
    let s = start;
    const placed: Placed[] = [];
    words.forEach((w, n) => {
      if (n > 0) s += gap;
      s = clearOfPoints(part, s, passage, w, size, end);
      for (const letter of passage.words[w]) {
        const advance = passage.letters[letter].advance;
        /* The taper read where the letter's middle will fall. */
        const k = letterSize(part, s + (advance * size) / 2, size);
        const width = advance * k;
        placed.push(pose(line, letter, s, width, k));
        s += width;
      }
    });
    return { overfull: s > end + 1e-6, placed };
  }

  /** The run's words set with the one gap that ends them on the line's end. */
  function justify(passage: PassageIn, line: MarkLine, part: MarkPart, words: readonly number[], size: number): Placed[] {
    if (words.length === 0) return [];
    let low = 0;
    let high = line.length * o.scale;
    let best: Placed[] | null = null;
    for (let k = 0; k < 40; k += 1) {
      const gap = (low + high) / 2;
      const set = setRun(passage, line, part, words, size, gap);
      if (set.overfull) high = gap;
      else {
        low = gap;
        best = set.placed;
      }
    }
    return best ?? setRun(passage, line, part, words, size, 0).placed;
  }

  /** A letter's size at arc `s` (CSS px) of a part: `size`, unless the
   *  room there is less — two lines of letters, each centred on its line,
   *  meet when their height reaches it. */
  function letterSize(part: MarkPart, s: number, size: number): number {
    return Math.max(size * o.smallest, Math.min(size, roomFor(part, s)));
  }

  /** The largest letter the room at arc `s` takes, a share of the copy. */
  function roomFor(part: MarkPart, s: number): number {
    const room = o.room[part];
    const at = Math.min(Math.max(s / o.scale / o.roomStep, 0), room.length - 1);
    const k = Math.floor(at);
    const units = room[k] + (room[Math.min(k + 1, room.length - 1)] - room[k]) * (at - k);
    return (units * o.scale - o.clear * o.fontSize) / (o.letterHeight * o.fontSize);
  }

  /** THE VERY POINTS STAY BARE, AND NO WORD IS BENT ROUND A CORNER: a word
   *  that would reach where the room is under `smallest` of the letters'
   *  size (a tip, a tail, the notch's heart), or where the line turns
   *  sharply (a wing's outer corners), starts past it instead — specks
   *  piled in a point read as dirt, and a word folded over a corner as a
   *  break. The engraved line draws the point alone. Where the line ends in
   *  one, the word stays put (the run overfills, and is set tighter). */
  function clearOfPoints(part: MarkPart, from: number, passage: PassageIn, w: number, size: number, end: number): number {
    const width = passage.words[w].reduce((sum, k) => sum + passage.letters[k].advance, 0) * size;
    const step = o.roomStep * o.scale;
    const floor = size * o.smallest;
    const line = lines.right[part];
    let s = from;
    for (let guard = 0; guard < 4096 && s + width <= end; guard += 1) {
      let blocked = -1;
      for (let t = s; t <= s + width; t += step) {
        if (roomFor(part, t) < floor || turnAt(line, t) > o.sharpest) {
          blocked = t;
          break;
        }
      }
      if (blocked < 0) return s;
      s = blocked + step;
    }
    return from;
  }

  /** How sharply the line turns at arc `s` (CSS px): the angle between its
   *  direction half a letter before and half a letter after. */
  function turnAt(line: MarkLine, s: number): number {
    const unit = 1 / o.scale;
    const reach = (o.fontSize / 2) * unit;
    const a = pointOn(line, s * unit - reach);
    const b = pointOn(line, s * unit);
    const c = pointOn(line, s * unit + reach);
    const turn = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x);
    return Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn)));
  }

  /** A letter `width` wide from arc `s`: centred on the line at its middle,
   *  turned to the chord across it (on a tight bend the tangent at one
   *  point would tip it off the curve it sits on). */
  function pose(line: MarkLine, letter: number, s: number, width: number, k: number): Placed {
    const unit = 1 / o.scale;
    const a = pointOn(line, s * unit);
    const b = pointOn(line, (s + width) * unit);
    const middle = pointOn(line, (s + width / 2) * unit);
    return {
      letter,
      x: middle.x * o.scale,
      y: middle.y * o.scale,
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      scale: k,
      along: (s + width / 2) / (line.length * o.scale),
    };
  }
}

interface Placed {
  readonly letter: number;
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly scale: number;
  readonly along: number;
}
