/**
 * ─── Promise · the assembly ───
 *
 * As each passage reaches the top of the screen its letters break away,
 * come down, and write the mark (the user, 2026-11-02; motion.ts
 * ASSEMBLY, calligram.ts, shaders/letters.ts). Loaded only when the
 * section nears the screen (PromiseSection): nothing here is in the page's
 * first script.
 *
 * WHAT IS DRAWN WHERE. The page's own letters stay on their lines until
 * each leaves; from that frame on it is drawn by the canvas (its span made
 * transparent: letters.ts), and the canvas draws nothing else. The canvas
 * is in the section's AIR LAYER, held over the screen for the whole
 * section and let go with the mark, at the same scroll (promise.css): so a
 * letter landed on the mark is drawn where the mark is held, and both move
 * on together on the compositor — never a frame apart, as a canvas fixed
 * to the screen and redrawn from the scroll would be on a phone's native
 * scroll.
 *
 * ONE DRAW, NOTHING A LETTER A FRAME. Every letter's place is worked out on
 * the GPU from the scroll and the clock (shaders/letters.ts); a frame sends
 * a few numbers and one instanced draw. Letters on their lines are not
 * drawn at all.
 *
 * PARKED: drawn only on a scroll, and while letters are in the air (they
 * flutter on the clock); never while the section is far from the screen
 * or the tab hidden. Measured again, and the calligram laid again, on a
 * resize.
 */

import { layCalligram, type CalligramIn, type PassageIn, type Slot } from "./calligram";
import { buildAtlas, type GlyphAtlas } from "./glyphAtlas";
import { linesOf, measureLetters, splitLetters, type LetterBox, type PassageLetters } from "./letters";
import { MARK_AXIS, MARK_BODY, MARK_VIEW, markLines, roomAlong, type MarkPart } from "./markLines";
import { approach } from "@/components/ui/easing";

import { ASSEMBLY, CALLIGRAM } from "./motion";
import { LETTERS_FRAG, LETTERS_VERT } from "./shaders/letters";

export interface AssemblyParts {
  readonly section: HTMLElement;
  readonly above: HTMLElement;
  readonly below: HTMLElement;
  /** The air layer and its canvas. */
  readonly air: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  /** The mark's box (held at the screen's middle) and the room it is held
   *  for. */
  readonly mark: HTMLElement;
  readonly pin: HTMLElement;
}

export interface AssemblyOptions {
  /** Reduced motion: the letters fade off their lines and onto the mark. */
  readonly calm: boolean;
}

/** Which lines each passage writes, in its reading order (calligram.ts):
 *  the passage above the forewings, right then left; the passage below the
 *  hindwings, then the antennae — the left first, so its last words,
 *  "bring it to life.", end on the right antenna's tip. */
const RUNS = {
  above: [
    { part: "fore", side: "right" },
    { part: "fore", side: "left" },
  ],
  below: [
    { part: "hind", side: "right" },
    { part: "hind", side: "left" },
    { part: "antenna", side: "left" },
    { part: "antenna", side: "right" },
  ],
} as const;

/* Floats a letter: aRest, aSlot, aUv, aCell, aAir, aBloom. */
const STRIDE = 24;
const ATTRIBUTES = STRIDE / 4;

/** Starts it; returns what stops it (an unmount): everything let go, the
 *  paragraphs given their own text back. */
export function startAssembly(parts: AssemblyParts, options: AssemblyOptions): () => void {
  const { section, canvas } = parts;
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
  });
  if (!gl) {
    /* No WebGL2: the passages stay as they are, the stage stands empty and
       is not held (promise.css). */
    section.setAttribute("data-promise-assembly", "none");
    return () => section.removeAttribute("data-promise-assembly");
  }

  let alive = true;
  let letters: { above: PassageLetters; below: PassageLetters } | null = null;
  let engine: Engine | null = null;
  let frame = 0;
  let visible = false;
  let rebuildTimer = 0;
  let lastScroll = Number.NaN;
  let measuredSize = "";

  const all = () => (letters ? [letters.above, letters.below] : []);
  /* Both passages' paragraphs, in order, once split. */
  let paragraphs: HTMLElement[] = [];
  /* A paragraph mid-entrance has its lines in its place (ui/splitLines),
     not its letters: neither measured nor let go until it is done. Read
     into one array, every frame: nothing is allocated a frame. */
  const held = [false, false, false, false];
  const entering = (): boolean => {
    let any = false;
    for (let k = 0; k < held.length; k += 1) {
      held[k] = paragraphs[k]?.getAttribute("data-reveal-lines") === "split";
      any ||= held[k];
    }
    return any;
  };
  let goneCount = 0;
  let airCount = 0;

  const program = makeProgram(gl);
  const vao = gl.createVertexArray();
  const buffer = gl.createBuffer();
  const texture = gl.createTexture();
  let atlasKey = "";
  let atlas: GlyphAtlas | null = null;

  /* ── The frame ── */
  const request = () => {
    if (!frame && alive && visible && !document.hidden) frame = requestAnimationFrame(draw);
  };

  function draw(now: number) {
    frame = 0;
    if (!engine || !program.ready()) {
      if (engine) request();
      return;
    }
    const e = engine;
    const scroll = window.scrollY - e.sectionTop;
    followSpeed(scroll, now);
    entering();
    updateSpans(e, scroll);
    showAir(goneCount > 0);
    if (goneCount === 0) {
      lastScroll = scroll;
      return;
    }
    const moving = Math.abs(speed) > ASSEMBLY.speed.rest;
    if (scroll !== lastScroll || airCount > 0 || moving || e.fresh) {
      e.fresh = false;
      lastScroll = scroll;
      render(e, scroll, now / 1000, held);
    }
    /* A letter in the air flutters on the clock: drawn every frame while
       any is (and the section is on the screen); and while the scroll's
       speed dies away, the falling letters' streaks with it. Neither, and
       the loop parks until the next scroll. */
    if (airCount > 0 || moving) request();
  }

  /* THE SCROLL'S SPEED, px a second, followed (motion.ts ASSEMBLY.speed).
     After a pause (the loop parked, the tab away) it starts again from
     still: a jump made unseen is not a speed. */
  let speed = 0;
  let speedAt = Number.NaN;
  let speedScroll = 0;
  function followSpeed(scroll: number, now: number) {
    const dt = (now - speedAt) / 1000;
    if (!(dt > 0) || dt > 0.1) speed = 0;
    else speed = approach(speed, (scroll - speedScroll) / dt, ASSEMBLY.speed.follow, dt);
    speedAt = now;
    speedScroll = scroll;
  }

  /** Every letter's span shown or let go by the scroll; counts how many
   *  are gone from their lines, and how many of those are in the air. */
  function updateSpans(e: Engine, scroll: number) {
    let gone = 0;
    let inAir = 0;
    for (const passage of e.passages) {
      for (let k = 0; k < passage.letters.spans.length; k += 1) {
        const away = scroll > passage.leave[k] && !held[passage.paragraphIndex[k]];
        if (away) {
          gone += 1;
          /* In the air between its line and the mark, and again in its
             bloom: both flutter on the clock. */
          if (scroll < passage.land[k] || (scroll > passage.bloom[k] && scroll < passage.bloom[k] + e.life)) inAir += 1;
        }
        if (away !== passage.gone[k]) {
          passage.gone[k] = away;
          passage.letters.spans[k].toggleAttribute("data-gone", away);
        }
      }
    }
    goneCount = gone;
    airCount = inAir;
  }

  let airShown = false;
  function showAir(shown: boolean) {
    if (shown === airShown) return;
    airShown = shown;
    parts.air.style.visibility = shown ? "visible" : "hidden";
  }

  function render(e: Engine, scroll: number, time: number, holding: readonly boolean[]) {
    const g = gl as WebGL2RenderingContext;
    const u = program.uniforms;
    g.viewport(0, 0, canvas.width, canvas.height);
    g.clearColor(0, 0, 0, 0);
    g.clear(g.COLOR_BUFFER_BIT);
    g.useProgram(program.handle);
    g.bindVertexArray(vao);
    g.activeTexture(g.TEXTURE0);
    g.bindTexture(g.TEXTURE_2D, texture);
    g.uniform1i(u.uAtlas, 0);
    g.uniform1f(u.uScroll, scroll);
    g.uniform1f(u.uLayer, Math.min(Math.max(scroll, e.layerFrom), e.layerTo));
    g.uniform1f(u.uTime, time);
    g.uniform2f(u.uView, e.width, e.height);
    g.uniform2f(u.uMark, e.markLeft, e.markTop);
    g.uniform1f(u.uPin, e.pinStart);
    g.uniform4f(u.uHeld, holding[0] ? 1 : 0, holding[1] ? 1 : 0, holding[2] ? 1 : 0, holding[3] ? 1 : 0);
    g.uniform3f(u.uSpan, ASSEMBLY.fall * e.height, ASSEMBLY.settle * e.height, ASSEMBLY.loosen * e.height);
    g.uniform1f(u.uScreen, e.height);
    const [from, to] = ASSEMBLY.sheen;
    const sheenAt = (scroll - (e.pinStart + e.height * from)) / (e.height * (to - from));
    g.uniform3f(u.uSheen, -0.3 + Math.min(Math.max(sheenAt, 0), 1) * 1.6, ASSEMBLY.sheenBand, sheenAt > 0 && sheenAt < 1 ? ASSEMBLY.sheenLift : 0);
    g.uniform2f(u.uMarkHalf, MARK_AXIS * e.markScale, (MARK_VIEW.width / 2) * e.markScale);
    g.uniform1f(u.uCalm, options.calm ? 1 : 0);
    g.uniform1f(u.uSpeed, Math.abs(speed) > ASSEMBLY.speed.rest ? speed : 0);
    const bloom = ASSEMBLY.bloom;
    g.uniform4f(u.uOpen, bloom.opening * e.height, bloom.settling * e.height, bloom.drift, e.life);
    g.uniform4f(u.uEmber, bloom.halfLife * e.height, bloom.catch, bloom.shutter, bloom.edge * e.height);
    g.uniform1f(u.uPinEnd, e.pinStart + e.pinLength);
    const m = ASSEMBLY;
    g.uniform4f(u.uNear, m.near.grow, m.near.dim, 0, 0);
    g.uniform4f(u.uSwing, m.flutter.swing[0], m.flutter.swing[1], m.flutter.tilt, m.flutter.rise);
    g.uniform4f(u.uFlap, m.flutter.perScreen, m.flutter.seconds[0], m.flutter.seconds[1], 0);
    g.uniform4f(u.uTurn, m.flutter.turn, m.flutter.tip, m.flutter.yaw, m.swoop);
    g.uniform3f(u.uGlint, m.glint.at, m.glint.sharpness, m.glint.strength);
    g.enable(g.BLEND);
    g.blendFunc(g.ONE, g.ONE_MINUS_SRC_ALPHA);
    g.drawArraysInstanced(g.TRIANGLES, 0, 6, e.count);
    g.bindVertexArray(null);
  }

  /* ── Measured, laid out, sent ── */
  function build() {
    if (!alive || !letters) return;
    if (entering()) {
      /* Measured mid-entrance, the letters are not where they will be. */
      scheduleBuild(250);
      return;
    }
    const next = measure(parts, letters);
    if (!next) return;
    const key = `${next.font.family}|${next.font.size}|${next.font.weight}|${next.atlasScale}`;
    if (key !== atlasKey) {
      atlas = buildAtlas(
        all().flatMap((passage) => passage.chars),
        next.font,
        next.atlasScale,
        ASSEMBLY.soft,
      );
      atlasKey = key;
      uploadAtlas(gl as WebGL2RenderingContext, texture, atlas);
    }
    if (!atlas) return;
    engine = assemble(next, atlas);
    if (process.env.NODE_ENV !== "production") {
      /* Development handle: where the assembly stands, in px of the
         section's scroll, to scroll to and check (a frozen pane draws
         nothing by itself). */
      const e = engine;
      handle().__kaviPromise = {
        sectionTop: e.sectionTop,
        firstLeave: e.firstLeave,
        lastLand: e.lastLand,
        pinStart: e.pinStart,
        pinLength: e.pinLength,
        letters: e.count,
        scrollTo: (at: number) => {
          (document.scrollingElement ?? document.documentElement).scrollTop = e.sectionTop + at;
        },
      };
    }
    measuredSize = `${section.offsetWidth}x${section.offsetHeight}x${parts.air.clientHeight}`;
    sizeCanvas(engine);
    sendLetters(engine);
    if (program.ready()) warm(engine);
    lastScroll = Number.NaN;
    request();
  }

  /* ONE DRAW AHEAD OF TIME, unseen. Direct3D (ANGLE, every Windows
     browser) makes a program's executables for its vertex layout and its
     target on the program's first real draw, not at its link: on the
     first frame a line broke, ~50–100 ms of the page held (measured, a
     production build at 1440). Drawn now — every letter still on its
     line, so nothing is drawn but the call — while the section is still
     well below the screen. */
  function warm(e: Engine) {
    render(e, e.firstLeave - 1, 0, NONE_HELD);
  }

  function scheduleBuild(ms: number) {
    window.clearTimeout(rebuildTimer);
    rebuildTimer = window.setTimeout(build, ms);
  }

  function sizeCanvas(e: Engine) {
    const ratio = Math.min(window.devicePixelRatio || 1, ASSEMBLY.maxPixelRatio);
    const width = Math.max(1, Math.round(e.width * ratio));
    const height = Math.max(1, Math.round(e.height * ratio));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
  }

  function sendLetters(e: Engine) {
    const g = gl as WebGL2RenderingContext;
    g.bindVertexArray(vao);
    g.bindBuffer(g.ARRAY_BUFFER, buffer);
    g.bufferData(g.ARRAY_BUFFER, e.data, g.STATIC_DRAW);
    for (let k = 0; k < ATTRIBUTES; k += 1) {
      g.enableVertexAttribArray(k);
      g.vertexAttribPointer(k, 4, g.FLOAT, false, STRIDE * 4, k * 16);
      g.vertexAttribDivisor(k, 1);
    }
    g.bindVertexArray(null);
    g.bindBuffer(g.ARRAY_BUFFER, null);
  }

  /* ── Watching ── */
  const onScroll = () => request();
  const onVisibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else request();
  };
  const near = new IntersectionObserver(
    ([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      if (visible) request();
      else {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    },
    { rootMargin: ASSEMBLY.wakeMargin },
  );
  /* Laid again when the section or the screen changes size (not on the
     first word, which is the size it was measured at). */
  const resize = new ResizeObserver(() => {
    const size = `${section.offsetWidth}x${section.offsetHeight}x${parts.air.clientHeight}`;
    if (size === measuredSize) return;
    measuredSize = size;
    if (engine) scheduleBuild(150);
  });
  /* The entrance ends: its letters are back, to be let go or measured. */
  const entrances = new MutationObserver(() => {
    if (engine) {
      engine.fresh = true;
      request();
    }
  });

  document.fonts.ready.then(() => {
    if (!alive) return;
    letters = { above: splitLetters(parts.above), below: splitLetters(parts.below) };
    paragraphs = all().flatMap((passage) => passage.paragraphs);
    for (const p of paragraphs) entrances.observe(p, { attributes: true, attributeFilter: ["data-reveal-lines"] });
    build();
    near.observe(section);
    resize.observe(section);
    resize.observe(parts.air);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    program.whenReady(() => {
      if (engine) {
        engine.fresh = true;
        warm(engine);
      }
      request();
    });
  });

  return () => {
    alive = false;
    cancelAnimationFrame(frame);
    frame = 0;
    window.clearTimeout(rebuildTimer);
    near.disconnect();
    resize.disconnect();
    entrances.disconnect();
    window.removeEventListener("scroll", onScroll);
    document.removeEventListener("visibilitychange", onVisibility);
    for (const passage of all()) {
      for (const span of passage.spans) span.removeAttribute("data-gone");
      passage.restore();
    }
    parts.air.style.removeProperty("visibility");
    if (process.env.NODE_ENV !== "production") delete handle().__kaviPromise;
    program.dispose();
    gl.deleteVertexArray(vao);
    gl.deleteBuffer(buffer);
    gl.deleteTexture(texture);
  };
}

const NONE_HELD = [false, false, false, false] as const;

/** The development handle's home. */
function handle(): { __kaviPromise?: Record<string, unknown> } {
  return window as unknown as { __kaviPromise?: Record<string, unknown> };
}

/* ─────────────────────────────── Measuring ─────────────────────────────── */

interface Measured {
  readonly font: { family: string; size: number; weight: string };
  readonly atlasScale: number;
  readonly boxes: { above: LetterBox[]; below: LetterBox[] };
  readonly letters: { above: PassageLetters; below: PassageLetters };
  readonly sectionTop: number;
  readonly width: number;
  readonly height: number;
  /** The air layer's left within the section, and where its top can be. */
  readonly layerLeft: number;
  readonly layerFrom: number;
  readonly layerTo: number;
  readonly markLeft: number;
  readonly markTop: number;
  readonly markWidth: number;
  readonly pinStart: number;
  readonly pinLength: number;
}

function measure(parts: AssemblyParts, letters: { above: PassageLetters; below: PassageLetters }): Measured | null {
  const { section, air, mark, pin } = parts;
  /* The mark is held in its block (the mark between its rows of dots),
     which is what is sticky; the block is in the stage. */
  const held = mark.parentElement;
  const stage = held?.parentElement;
  if (!held || !stage) return null;
  const first = letters.above.paragraphs[0];
  if (!first) return null;
  const type = getComputedStyle(first);
  const sectionRect = section.getBoundingClientRect();
  const airRect = air.getBoundingClientRect();
  const markRect = mark.getBoundingClientRect();
  const heldTop = Number.parseFloat(getComputedStyle(held).top) || 0;
  const sectionStyle = getComputedStyle(section);
  const padTop = Number.parseFloat(sectionStyle.paddingTop) || 0;
  const padBottom = Number.parseFloat(sectionStyle.paddingBottom) || 0;
  const height = air.clientHeight;
  const layerFrom = padTop + (Number.parseFloat(getComputedStyle(air).marginTop) || 0);
  const ratio = Math.min(window.devicePixelRatio || 1, ASSEMBLY.maxPixelRatio);
  return {
    font: { family: type.fontFamily, size: Number.parseFloat(type.fontSize), weight: type.fontWeight },
    /* The atlas finer than the screen: a landed letter is drawn turned and
       a little larger than the copy, and read from a finer copy it stays
       crisp. */
    atlasScale: Math.min(4, Math.max(2, Math.ceil(ratio * 1.5))),
    boxes: { above: measureLetters(letters.above, section), below: measureLetters(letters.below, section) },
    letters,
    sectionTop: sectionRect.top + window.scrollY,
    width: air.clientWidth,
    height,
    layerLeft: airRect.left - sectionRect.left,
    layerFrom,
    layerTo: section.offsetHeight - padBottom - height,
    markLeft: markRect.left - airRect.left,
    markTop: heldTop + (markRect.top - held.getBoundingClientRect().top),
    markWidth: markRect.width,
    pinStart: stage.offsetTop + (Number.parseFloat(getComputedStyle(stage).paddingTop) || 0) - heldTop,
    pinLength: pin.offsetHeight,
  };
}

/* ─────────────────────────────── Assembling ────────────────────────────── */

interface PassageState {
  readonly letters: PassageLetters;
  /** When each letter leaves its line, and when it lands, px of the
   *  section's scroll. */
  readonly leave: Float64Array;
  readonly land: Float64Array;
  /** When each lets go of the mark again (the bloom), px of scroll. */
  readonly bloom: Float64Array;
  /** Each letter's paragraph, counted through both passages. */
  readonly paragraphIndex: readonly number[];
  /** Whether each is gone from its line now (its span transparent). */
  readonly gone: boolean[];
}

interface Engine {
  readonly passages: readonly PassageState[];
  readonly data: Float32Array;
  readonly count: number;
  readonly sectionTop: number;
  readonly width: number;
  readonly height: number;
  readonly layerFrom: number;
  readonly layerTo: number;
  readonly markLeft: number;
  readonly markTop: number;
  readonly markScale: number;
  readonly pinStart: number;
  readonly pinLength: number;
  /** How long a letter lives in its bloom, px of scroll. */
  readonly life: number;
  /** The first letter to leave and the last to land, px of scroll. */
  readonly firstLeave: number;
  readonly lastLand: number;
  /** Laid again: draw the next frame whatever the scroll. */
  fresh: boolean;
}

let rooms: Record<MarkPart, Float64Array> | null = null;

function assemble(m: Measured, atlas: GlyphAtlas): Engine {
  const lines = markLines();
  rooms ??= {
    fore: roomAlong("fore", CALLIGRAM.roomStep, CALLIGRAM.roomReach),
    hind: roomAlong("hind", CALLIGRAM.roomStep, CALLIGRAM.roomReach),
    antenna: roomAlong("antenna", CALLIGRAM.roomStep, CALLIGRAM.roomReach),
  };
  const markScale = m.markWidth / MARK_VIEW.width;
  const asPassage = (passage: PassageLetters): PassageIn => ({
    letters: passage.chars.map((char) => ({ advance: atlas.glyphs.get(char)?.advance ?? atlas.space })),
    words: passage.words,
    space: atlas.space,
  });
  const inputs: CalligramIn[] = [
    { passage: asPassage(m.letters.above), runs: RUNS.above },
    { passage: asPassage(m.letters.below), runs: RUNS.below },
  ];
  const [slotsAbove, slotsBelow] = layCalligram(inputs, lines, {
    ...CALLIGRAM,
    scale: markScale,
    fontSize: m.font.size,
    room: rooms,
  });

  /* THE BODY, the bloom's middle: on the axis, between the forewings'
     roots and the hindwings' tops; and the farthest any letter lies from
     it, so the wave takes the same time on every screen. */
  const bodyX = MARK_AXIS * markScale;
  const bodyY = MARK_BODY * markScale;
  let farthest = 1;
  for (const slots of [slotsAbove, slotsBelow]) {
    for (const slot of slots) if (slot) farthest = Math.max(farthest, Math.hypot(slot.x - bodyX, slot.y - bodyY));
  }

  const count = m.letters.above.spans.length + m.letters.below.spans.length;
  const data = new Float32Array(count * STRIDE);
  const screen = m.height;
  const markW = MARK_VIEW.width * markScale;
  const markH = MARK_VIEW.height * markScale;
  let firstLeave = Number.POSITIVE_INFINITY;
  let lastLand = Number.NEGATIVE_INFINITY;
  let index = 0;
  let paragraphBase = 0;

  const passages: PassageState[] = [];
  (
    [
      [m.letters.above, m.boxes.above, slotsAbove, RUNS.above],
      [m.letters.below, m.boxes.below, slotsBelow, RUNS.below],
    ] as const
  ).forEach(([passage, boxes, slots, runs]) => {
    const { line, tops } = linesOf(boxes);
    /* Each line's ends, for its ripple. */
    const ends = tops.map(() => ({ from: Number.POSITIVE_INFINITY, to: Number.NEGATIVE_INFINITY }));
    boxes.forEach((box, k) => {
      ends[line[k]].from = Math.min(ends[line[k]].from, box.left);
      ends[line[k]].to = Math.max(ends[line[k]].to, box.left + box.width);
    });
    const leave = new Float64Array(boxes.length);
    const land = new Float64Array(boxes.length);
    const bloom = new Float64Array(boxes.length);
    boxes.forEach((box, k) => {
      const char = passage.chars[k];
      const glyph = atlas.glyphs.get(char);
      const slot: Slot | undefined = slots[k];
      if (!glyph || !slot) return;
      const end = ends[line[k]];
      const across = end.to > end.from ? (box.left - end.from) / (end.to - end.from) : 0;
      const leaves = tops[line[k]] - ASSEMBLY.breakLine * screen + across * ASSEMBLY.ripple * screen;
      const [r0, r1] = ASSEMBLY.land[runs[slot.run].part];
      const lands = Math.max(
        m.pinStart + screen * (r0 + (r1 - r0) * slot.along),
        leaves + (ASSEMBLY.loosen + ASSEMBLY.fall * 0.5 + ASSEMBLY.settle) * screen,
      );
      leave[k] = leaves;
      land[k] = lands;
      firstLeave = Math.min(firstLeave, leaves);
      lastLand = Math.max(lastLand, lands);

      /* Its place in the cloud: its slot spread from the mark's middle and
         scattered, by its own fixed numbers. */
      const a = seeded(index * 2 + 1) * Math.PI * 2;
      const r = Math.sqrt(seeded(index * 2 + 2)) * ASSEMBLY.scatter * markW;
      const cloudX = (slot.x - markW / 2) * ASSEMBLY.spread + Math.cos(a) * r;
      const cloudY = (slot.y - markH / 2) * ASSEMBLY.spread + Math.sin(a) * r;
      const nearness = ASSEMBLY.near.least + (1 - ASSEMBLY.near.least) * seeded(index * 3 + 7);

      const o = index * STRIDE;
      /* aRest: its centre on its line (the canvas's x, the section's y). */
      data[o] = box.left + glyph.advance / 2 - m.layerLeft;
      data[o + 1] = box.top + atlas.ascent - atlas.xHeight / 2;
      data[o + 2] = leaves;
      data[o + 3] = lands;
      /* aSlot */
      data[o + 4] = slot.x;
      data[o + 5] = slot.y;
      data[o + 6] = slot.angle;
      data[o + 7] = slot.mirror ? -slot.scale : slot.scale;
      /* aUv */
      data[o + 8] = glyph.u0;
      data[o + 9] = glyph.v0;
      data[o + 10] = glyph.u1;
      data[o + 11] = glyph.v1;
      /* aCell */
      data[o + 12] = glyph.width;
      data[o + 13] = glyph.height;
      data[o + 14] = glyph.anchorX;
      data[o + 15] = glyph.anchorY;
      /* aAir */
      data[o + 16] = cloudX;
      data[o + 17] = cloudY;
      data[o + 18] = nearness;
      data[o + 19] = paragraphBase + passage.paragraph[k];
      /* aBloom: when it lets go again — from the body outward, by its
         distance from it, give or take its own jitter, never before it has
         landed — how far it opens (out from the body by a share of that
         distance and a push of its own, and across by its own share), and
         its depth in the opening shell, from away (-1) to toward (1). */
      const b = ASSEMBLY.bloom;
      const dx = slot.x - bodyX;
      const dy = slot.y - bodyY;
      const reach = Math.hypot(dx, dy);
      const [w0, w1] = b.wave;
      const jitter = (seeded(index * 5 + 3) * 2 - 1) * b.jitter;
      const releases = Math.max(m.pinStart + screen * (w0 + (w1 - w0) * (reach / farthest) + jitter), lands + 0.05 * screen);
      const outX = reach > 1e-3 ? dx / reach : 0;
      const outY = reach > 1e-3 ? dy / reach : 1;
      const push = b.open * reach + b.push * screen;
      const sideways = (seeded(index * 7 + 5) * 2 - 1) * b.across * push;
      bloom[k] = releases;
      data[o + 20] = releases;
      data[o + 21] = outX * push - outY * sideways;
      data[o + 22] = outY * push + outX * sideways;
      data[o + 23] = seeded(index * 11 + 9) * 2 - 1;
      index += 1;
    });
    passages.push({
      letters: passage,
      leave,
      land,
      bloom,
      paragraphIndex: passage.paragraph.map((p) => paragraphBase + p),
      gone: new Array(boxes.length).fill(false),
    });
    paragraphBase += passage.paragraphs.length;
  });

  return {
    passages,
    data,
    count: index,
    sectionTop: m.sectionTop,
    width: m.width,
    height: m.height,
    layerFrom: m.layerFrom,
    layerTo: m.layerTo,
    markLeft: m.markLeft,
    markTop: m.markTop,
    markScale,
    pinStart: m.pinStart,
    pinLength: m.pinLength,
    life: ASSEMBLY.bloom.life * m.height,
    firstLeave,
    lastLand,
    fresh: true,
  };
}

/** A fixed number in [0, 1) for each `n`: the same letter does the same
 *  thing every visit. */
function seeded(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/* ─────────────────────────────── WebGL ─────────────────────────────────── */

const UNIFORMS = [
  "uScroll",
  "uLayer",
  "uTime",
  "uView",
  "uMark",
  "uPin",
  "uHeld",
  "uSpan",
  "uScreen",
  "uSheen",
  "uMarkHalf",
  "uCalm",
  "uNear",
  "uSwing",
  "uFlap",
  "uTurn",
  "uGlint",
  "uSpeed",
  "uOpen",
  "uEmber",
  "uPinEnd",
  "uAtlas",
] as const;

interface LettersProgram {
  readonly handle: WebGLProgram;
  readonly uniforms: Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>;
  ready(): boolean;
  whenReady(callback: () => void): void;
  dispose(): void;
}

/**
 * COMPILED OFF THE MAIN THREAD, as the hero's programs are (hero/stage/gl.ts):
 * nothing asks the program anything until the driver says it is done
 * (KHR_parallel_shader_compile), or a frame has passed where there is no
 * such word — a question asked the moment it is built makes the page wait
 * for the compiler.
 */
function makeProgram(gl: WebGL2RenderingContext): LettersProgram {
  const parallel = gl.getExtension("KHR_parallel_shader_compile");
  const handle = gl.createProgram();
  const vs = gl.createShader(gl.VERTEX_SHADER);
  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  if (!handle || !vs || !fs) throw new Error("promise: no program");
  gl.shaderSource(vs, LETTERS_VERT);
  gl.shaderSource(fs, LETTERS_FRAG);
  gl.compileShader(vs);
  gl.compileShader(fs);
  gl.attachShader(handle, vs);
  gl.attachShader(handle, fs);
  gl.linkProgram(handle);

  const uniforms = {} as Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>;
  let linked = false;
  let waiting: (() => void)[] = [];
  let poll = 0;
  let disposed = false;

  const finish = () => {
    if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) {
      console.error("promise: letters program", gl.getProgramInfoLog(handle), gl.getShaderInfoLog(vs), gl.getShaderInfoLog(fs));
      return;
    }
    for (const name of UNIFORMS) uniforms[name] = gl.getUniformLocation(handle, name);
    linked = true;
    const callbacks = waiting;
    waiting = [];
    for (const callback of callbacks) callback();
  };
  const check = () => {
    poll = 0;
    if (disposed) return;
    if (!parallel || gl.getProgramParameter(handle, parallel.COMPLETION_STATUS_KHR)) finish();
    else poll = requestAnimationFrame(check);
  };
  poll = requestAnimationFrame(check);

  return {
    handle,
    uniforms,
    ready: () => linked,
    whenReady(callback) {
      if (linked) callback();
      else waiting.push(callback);
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(poll);
      gl.deleteProgram(handle);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    },
  };
}

function uploadAtlas(gl: WebGL2RenderingContext, texture: WebGLTexture | null, atlas: GlyphAtlas) {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, atlas.width, atlas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, atlas.pixels);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
}
