/**
 * ─── Works · the breath ───
 *
 * The visitor's breath on the glass in front of a work (motion.ts BREATH,
 * optics.ts BREATH_LOOK, shaders/breath.ts). Loaded only for a hand that
 * can hover (a mouse, a pen) once the section nears the screen
 * (WorksSection): nothing here is in the page's first script.
 *
 * ONE CONTEXT, ONE CANVAS, LAID IN THE CARD THE HAND IS ON. A canvas per
 * card would be a WebGL context per card, and Chrome keeps ~16 a page
 * before it takes the OLDEST away — the hero's. So one canvas moves into
 * the frame of the card the hand comes onto, and scrolls with it on the
 * compositor (a canvas fixed to the screen and redrawn from the scroll
 * would trail the card by a frame). The hand moving on to another card,
 * what it breathed on the last is copied once into a plain canvas there
 * and faded out (BREATH.handOff), while the new card takes the glass.
 *
 * NOTHING A PUFF A FRAME BUT NUMBERS. Each puff's radius, deposit and
 * evaporation are worked out here from its age (32 at most, preallocated),
 * sent as two arrays of uniforms; one draw over the box they cover.
 *
 * PARKED: drawn only while a puff lives; the hand at rest between breaths
 * waits on a timer, not a frame loop; nothing at all while the section is
 * off the screen or the tab hidden.
 */

import { approach } from "@/components/ui/easing";

import { BREATH } from "./motion";
import { BREATH_LOOK } from "./optics";
import { BREATH_FRAG, BREATH_VERT } from "./shaders/breath";

const UNIFORMS = ["uSize", "uPx", "uPuffA", "uPuffB", "uPuffCount", "uGlass", "uImage", "uHasImage", "uMap", "uTexel"] as const;
type Uniform = (typeof UNIFORMS)[number];

/** The canvas's device pixels a CSS px, at most: past 2 the film is no
 *  finer to the eye, and the frame's fill four times the cost. */
const MOST_DPR = 2;
/** A picture is uploaded no larger than this a side. */
const MOST_TEXTURE = 2048;
const GOLDEN_ANGLE = 2.399963;

const P = BREATH.puffs;

/** Starts it on the section's cards; returns what stops it: every
 *  listener, observer, timer and GPU object let go. */
export function startBreath(section: HTMLElement): () => void {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("data-works-breath", "");
  canvas.setAttribute("aria-hidden", "true");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
  });
  /* No WebGL2: the cards are simply the cards. */
  if (!context) return () => {};
  const gl: WebGL2RenderingContext = context;

  let alive = true;
  const program = makeProgram(gl);
  const vao = gl.createVertexArray();
  const texture = gl.createTexture();

  /* ── The puffs: a list, oldest first, at most P ── */
  const px = new Float32Array(P);
  const py = new Float32Array(P);
  const born = new Float32Array(P);
  const strength = new Float32Array(P);
  const radius0 = new Float32Array(P);
  const wayX = new Float32Array(P);
  const wayY = new Float32Array(P);
  const stretch = new Float32Array(P);
  const form = new Float32Array(P);
  let count = 0;
  /* What the shader gets. */
  const puffA = new Float32Array(P * 4);
  const puffB = new Float32Array(P * 4);

  function emit(x: number, y: number, at: number, amount: number, radius: number, dx: number, dy: number, along: number, forming: number) {
    if (count === P) {
      /* The oldest goes: nearly gone by now. */
      for (const list of [px, py, born, strength, radius0, wayX, wayY, stretch, form]) list.copyWithin(0, 1);
      count -= 1;
    }
    px[count] = x;
    py[count] = y;
    born[count] = at;
    strength[count] = amount;
    radius0[count] = radius;
    wayX[count] = dx;
    wayY[count] = dy;
    stretch[count] = along;
    form[count] = forming;
    count += 1;
  }

  /* ── The hand ── */
  let media: HTMLElement | null = null;
  let depth: HTMLElement | null = null;
  let seed = 1;
  let over = false;
  let clientX = 0;
  let clientY = 0;
  /* Where the hand was (the frame's CSS px), when, how fast; where it
     last laid a puff; where it last moved (for rest). */
  let handX = 0;
  let handY = 0;
  let handAt = 0;
  let speed = 0;
  let puffX = 0;
  let puffY = 0;
  let restX = 0;
  let restY = 0;
  let movedAt = 0;
  let nextExhale = 0;
  let exhales = 0;

  const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  let remPx = rem();

  function enter(target: HTMLElement, now: number) {
    if (media !== target) {
      if (media) handOff(media, now);
      media = target;
      depth = target.querySelector<HTMLElement>("[data-work-depth]");
      const all = Array.from(section.querySelectorAll("[data-work-media]"));
      seed = (all.indexOf(target) + 1) * 101;
      target.appendChild(canvas);
      resize.disconnect();
      resize.observe(target);
      sizeCanvas();
      takePicture(target);
    }
    over = true;
    remPx = rem();
    const rect = target.getBoundingClientRect();
    handX = clientX - rect.left;
    handY = clientY - rect.top;
    handAt = now;
    speed = 0;
    puffX = handX;
    puffY = handY;
    restX = handX;
    restY = handY;
    movedAt = now;
    const e = BREATH.enter;
    emit(handX, handY, now, e.strength, e.radiusRem * remPx, 1, 0, 1, e.form);
    nextExhale = now + BREATH.exhale.period * 0.7;
    request();
  }

  function leave() {
    over = false;
    window.clearTimeout(exhaleTimer);
    request();
  }

  function onMove(event: PointerEvent) {
    if (event.pointerType === "touch" || !alive) return;
    clientX = event.clientX;
    clientY = event.clientY;
    const now = performance.now() / 1000;
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-work-media]") : null;
    if (!target || !section.contains(target)) {
      if (over) leave();
      return;
    }
    if (!over || target !== media) {
      enter(target, now);
      return;
    }
    const rect = target.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const dt = now - handAt;
    const step = Math.hypot(x - handX, y - handY);
    speed = dt > 0 && dt < 0.1 ? approach(speed, step / dt, BREATH.trail.follow, dt) : 0;
    handX = x;
    handY = y;
    handAt = now;

    if (Math.hypot(x - restX, y - restY) > BREATH.exhale.restTravelPx) {
      restX = x;
      restY = y;
      movedAt = now;
    }

    /* A WISP: a puff once the hand has gone far enough, centred between
       where it laid the last and here, stretched along the way to meet
       it. */
    const t = BREATH.trail;
    const gone = Math.hypot(x - puffX, y - puffY);
    const spacing = Math.max(t.spacingRem * remPx, speed * t.spacingSeconds);
    if (gone >= spacing) {
      const r = t.radiusRem * remPx;
      const along = Math.min(Math.max(0.35 + (t.reach * gone) / (2 * r), 1), t.stretchMost);
      emit((x + puffX) / 2, (y + puffY) / 2, now, t.strength / (1 + speed / t.speedHalf), r, (x - puffX) / gone, (y - puffY) / gone, along, t.form);
      puffX = x;
      puffY = y;
    }
    request();
  }

  /* ── At rest: breathing ── */
  let exhaleTimer = 0;
  function breatheIfResting(now: number) {
    if (!over || !media) return;
    const e = BREATH.exhale;
    const due = Math.max(nextExhale, movedAt + e.restAfter);
    if (now < due) {
      window.clearTimeout(exhaleTimer);
      exhaleTimer = window.setTimeout(() => request(), (due - now) * 1000 + 8);
      return;
    }
    exhales += 1;
    emit(handX, handY, now, e.strength, e.radiusRem * remPx, 1, 0, 1, e.form);
    /* The next, a calm breath later: two sines a golden ratio apart, so
       no two breaths come round alike. */
    const swing = 0.62 * Math.sin(exhales * GOLDEN_ANGLE) + 0.38 * Math.sin((exhales * GOLDEN_ANGLE) / 1.618034);
    nextExhale = now + e.period * (1 + e.swing * swing);
  }

  /* ── The hand moving on: what it left here fades out as a picture ── */
  const snapshots = new Set<HTMLCanvasElement>();
  function handOff(old: HTMLElement, now: number) {
    if (count > 0 && program.ready()) {
      /* Drawn now and copied in the same task: the canvas's buffer is the
         frame's only until the page is next composited. */
      render(now);
      const snap = document.createElement("canvas");
      snap.width = canvas.width;
      snap.height = canvas.height;
      snap.setAttribute("data-works-breath", "");
      snap.setAttribute("aria-hidden", "true");
      snap.getContext("2d")?.drawImage(canvas, 0, 0);
      old.appendChild(snap);
      snapshots.add(snap);
      const fade = snap.animate([{ opacity: 1 }, { opacity: 0 }], { duration: BREATH.handOff * 1000, easing: "linear", fill: "forwards" });
      const done = () => {
        snap.remove();
        snapshots.delete(snap);
      };
      fade.finished.then(done, done);
    }
    count = 0;
    hasImage = false;
    clearGlass();
  }

  /* ── The picture behind the glass, when the card has one ── */
  let hasImage = false;
  let pictureFor: HTMLElement | null = null;
  let texW = 1;
  let texH = 1;
  let image: HTMLImageElement | null = null;
  function takePicture(target: HTMLElement) {
    hasImage = false;
    pictureFor = target;
    image = target.querySelector<HTMLImageElement>("img[data-work-image]");
    const img = image;
    if (!img || !depth) return;
    const upload = () => {
      if (!alive || pictureFor !== target || !img.naturalWidth || !depth) return;
      const box = depth.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, MOST_DPR);
      const cover = Math.max(box.width / img.naturalWidth, box.height / img.naturalHeight);
      const width = Math.max(1, Math.round(Math.min(MOST_TEXTURE, img.naturalWidth, img.naturalWidth * cover * dpr)));
      const height = Math.max(1, Math.round((width * img.naturalHeight) / img.naturalWidth));
      createImageBitmap(img, { resizeWidth: width, resizeHeight: height, resizeQuality: "high" }).then(
        (bitmap) => {
          if (!alive || pictureFor !== target) {
            bitmap.close();
            return;
          }
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
          gl.generateMipmap(gl.TEXTURE_2D);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          texW = bitmap.width;
          texH = bitmap.height;
          bitmap.close();
          hasImage = true;
          request();
        },
        () => {},
      );
    };
    if (img.complete) upload();
    else img.addEventListener("load", upload, { once: true });
  }

  /* ── The frame ── */
  let frame = 0;
  let visible = false;
  const request = () => {
    if (!frame && alive && visible && !document.hidden) frame = requestAnimationFrame(draw);
  };

  function sizeCanvas() {
    if (!media) return;
    const dpr = Math.min(window.devicePixelRatio || 1, MOST_DPR);
    const width = Math.max(1, Math.round(media.clientWidth * dpr));
    const height = Math.max(1, Math.round(media.clientHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function draw(nowMs: number) {
    frame = 0;
    if (!alive || !media) return;
    if (!program.ready()) {
      request();
      return;
    }
    const now = nowMs / 1000;
    if (over) {
      /* The page scrolled under a still hand: where it is on the card now,
         and whether it still is. */
      const rect = media.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
        over = false;
        window.clearTimeout(exhaleTimer);
      } else {
        handX = x;
        handY = y;
      }
    }
    breatheIfResting(now);
    const live = render(now);
    /* Drawn every frame while a puff lives; at rest between breaths the
       timer wakes it. */
    if (live > 0) request();
  }

  let drewLast = false;
  /** Nothing on the glass: the canvas shows its last frame until it is
   *  drawn again, so it is drawn clear. */
  function clearGlass() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    drewLast = false;
  }
  /** Draws the glass now; returns how many puffs live. */
  function render(now: number): number {
    const L = BREATH_LOOK;
    const gone = L.droplets.past * 1.4;
    let n = 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let k = 0; k < count; k += 1) {
      const age = now - born[k];
      const evaporated = BREATH.evaporation * Math.max(age - BREATH.hold, 0);
      if (evaporated > strength[k] * (1 + L.glass.contrast) + gone) continue;
      const rising = Math.min(Math.max(age / form[k], 0), 1);
      const laid = strength[k] * (1 - (1 - rising) * (1 - rising));
      const r = radius0[k] * (1 + BREATH.spread * Math.sqrt(Math.max(age, 0)));
      puffA[n * 4] = px[k];
      puffA[n * 4 + 1] = py[k];
      puffA[n * 4 + 2] = r;
      puffA[n * 4 + 3] = laid;
      puffB[n * 4] = wayX[k];
      puffB[n * 4 + 1] = wayY[k];
      puffB[n * 4 + 2] = stretch[k];
      puffB[n * 4 + 3] = evaporated;
      /* Its box: past three sigma it lays nothing (the shader's 4.5). */
      const reachAlong = 2.13 * r * stretch[k];
      const reachAcross = 2.13 * r;
      const ex = Math.abs(wayX[k]) * reachAlong + Math.abs(wayY[k]) * reachAcross;
      const ey = Math.abs(wayY[k]) * reachAlong + Math.abs(wayX[k]) * reachAcross;
      minX = Math.min(minX, px[k] - ex);
      maxX = Math.max(maxX, px[k] + ex);
      minY = Math.min(minY, py[k] - ey);
      maxY = Math.max(maxY, py[k] + ey);
      n += 1;
    }
    /* The dead ones out, the oldest first in what is left. */
    if (n < count) compact(now);

    if (n === 0 && !drewLast) return 0;
    const u = program.uniforms;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    drewLast = n > 0;
    if (n === 0 || !media) return 0;

    const cssW = media.clientWidth || 1;
    const cssH = media.clientHeight || 1;
    const scale = canvas.width / cssW;
    const x0 = Math.max(0, Math.floor(minX * scale));
    const x1 = Math.min(canvas.width, Math.ceil(maxX * scale));
    const y0 = Math.max(0, Math.floor(minY * scale));
    const y1 = Math.min(canvas.height, Math.ceil(maxY * scale));
    if (x1 <= x0 || y1 <= y0) return n;
    gl.enable(gl.SCISSOR_TEST);
    /* The window's y is up. */
    gl.scissor(x0, canvas.height - y1, x1 - x0, y1 - y0);

    gl.useProgram(program.handle);
    gl.bindVertexArray(vao);
    gl.uniform2f(u.uSize, cssW, cssH);
    gl.uniform1f(u.uPx, scale);
    gl.uniform4fv(u.uPuffA, puffA);
    gl.uniform4fv(u.uPuffB, puffB);
    gl.uniform1i(u.uPuffCount, n);
    gl.uniform4f(u.uGlass, seed, L.glass.scaleRem * remPx, L.glass.wipe, L.glass.contrast);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(u.uImage, 0);
    const picture = hasImage && image && depth ? mapPicture(image, depth, media) : null;
    gl.uniform1i(u.uHasImage, picture ? 1 : 0);
    if (picture) gl.uniform4f(u.uMap, picture[0], picture[1], picture[2], picture[3]);
    gl.uniform2f(u.uTexel, 1 / texW, 1 / texH);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return n;
  }

  const mapped: [number, number, number, number] = [0, 0, 0, 0];
  /** The frame's CSS px → the picture's uv, as the page lays it: cover in
   *  the depth layer, wherever the parallax has it now. */
  function mapPicture(img: HTMLImageElement, layer: HTMLElement, frameBox: HTMLElement) {
    const box = layer.getBoundingClientRect();
    const at = frameBox.getBoundingClientRect();
    const cover = Math.max(box.width / img.naturalWidth, box.height / img.naturalHeight);
    const drawnW = img.naturalWidth * cover;
    const drawnH = img.naturalHeight * cover;
    mapped[0] = 1 / drawnW;
    mapped[1] = 1 / drawnH;
    mapped[2] = (at.left - box.left - (box.width - drawnW) / 2) / drawnW;
    mapped[3] = (at.top - box.top - (box.height - drawnH) / 2) / drawnH;
    return mapped;
  }

  function compact(now: number) {
    const gone = BREATH_LOOK.droplets.past * 1.4;
    let w = 0;
    for (let k = 0; k < count; k += 1) {
      const evaporated = BREATH.evaporation * Math.max(now - born[k] - BREATH.hold, 0);
      if (evaporated > strength[k] * (1 + BREATH_LOOK.glass.contrast) + gone) continue;
      if (w !== k) {
        px[w] = px[k];
        py[w] = py[k];
        born[w] = born[k];
        strength[w] = strength[k];
        radius0[w] = radius0[k];
        wayX[w] = wayX[k];
        wayY[w] = wayY[k];
        stretch[w] = stretch[k];
        form[w] = form[k];
      }
      w += 1;
    }
    count = w;
  }

  /* ── Listening ── */
  const onLeave = (event: PointerEvent) => {
    if (event.pointerType !== "touch" && over) leave();
  };
  const onVisibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
      window.clearTimeout(exhaleTimer);
    } else request();
  };
  const near = new IntersectionObserver(([entry]) => {
    visible = Boolean(entry?.isIntersecting);
    if (visible) request();
    else {
      cancelAnimationFrame(frame);
      frame = 0;
      window.clearTimeout(exhaleTimer);
      over = false;
      count = 0;
      clearGlass();
    }
  });
  const resize = new ResizeObserver(() => {
    sizeCanvas();
    request();
  });
  const onLost = () => {
    stop();
  };

  section.addEventListener("pointermove", onMove, { passive: true });
  section.addEventListener("pointerleave", onLeave, { passive: true });
  document.addEventListener("visibilitychange", onVisibility);
  canvas.addEventListener("webglcontextlost", onLost);
  near.observe(section);
  /* Its program made now, its executables at one unseen draw (ANGLE makes
     a program's on its first draw: on the first breath, that was a hitch). */
  program.whenReady(() => {
    if (!alive) return;
    gl.useProgram(program.handle);
    gl.bindVertexArray(vao);
    gl.viewport(0, 0, 1, 1);
    gl.uniform1i(program.uniforms.uPuffCount, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    request();
  });

  if (process.env.NODE_ENV !== "production") {
    handle().__kaviWorks = {
      state: () => ({ card: media ? Array.from(section.querySelectorAll("[data-work-media]")).indexOf(media) : -1, over, puffs: count, hasImage }),
      /** Breathes on card `index` at (x, y), shares of its frame. */
      breathe(index: number, x = 0.5, y = 0.5) {
        const target = section.querySelectorAll<HTMLElement>("[data-work-media]")[index];
        if (!target) return;
        const rect = target.getBoundingClientRect();
        clientX = rect.left + rect.width * x;
        clientY = rect.top + rect.height * y;
        enter(target, performance.now() / 1000);
        over = false;
      },
      /** A breath at rest on the card the glass is on, at (x, y), shares of
       *  its frame — as if the hand had stayed there. */
      exhale(x = 0.5, y = 0.5) {
        if (!media) return;
        const e = BREATH.exhale;
        emit(media.clientWidth * x, media.clientHeight * y, performance.now() / 1000, e.strength, e.radiusRem * remPx, 1, 0, 1, e.form);
      },
      /** Draws the glass as it is `seconds` from now (frozen clocks). */
      drawAt(seconds: number) {
        render(performance.now() / 1000 + seconds);
      },
    };
  }

  function stop() {
    if (!alive) return;
    alive = false;
    cancelAnimationFrame(frame);
    frame = 0;
    window.clearTimeout(exhaleTimer);
    section.removeEventListener("pointermove", onMove);
    section.removeEventListener("pointerleave", onLeave);
    document.removeEventListener("visibilitychange", onVisibility);
    canvas.removeEventListener("webglcontextlost", onLost);
    near.disconnect();
    resize.disconnect();
    for (const snap of snapshots) snap.remove();
    snapshots.clear();
    canvas.remove();
    if (process.env.NODE_ENV !== "production") delete handle().__kaviWorks;
    if (!gl.isContextLost()) {
      program.dispose();
      gl.deleteVertexArray(vao);
      gl.deleteTexture(texture);
    }
  }

  return stop;
}

/** The development handle's home. */
function handle(): { __kaviWorks?: Record<string, unknown> } {
  return window as unknown as { __kaviWorks?: Record<string, unknown> };
}

interface BreathProgram {
  readonly handle: WebGLProgram;
  readonly uniforms: Record<Uniform, WebGLUniformLocation | null>;
  ready(): boolean;
  whenReady(callback: () => void): void;
  dispose(): void;
}

/** Compiled off the main thread where the driver can (KHR_parallel_shader_
 *  compile): no status is asked for until it says it is done — asked at
 *  once, the page waits on the compile (the hero's rule: stage/gl.ts). */
function makeProgram(gl: WebGL2RenderingContext): BreathProgram {
  const parallel = gl.getExtension("KHR_parallel_shader_compile");
  const handle = gl.createProgram();
  const vs = gl.createShader(gl.VERTEX_SHADER);
  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  if (!handle || !vs || !fs) throw new Error("works: no program");
  gl.shaderSource(vs, BREATH_VERT);
  gl.shaderSource(fs, BREATH_FRAG);
  gl.compileShader(vs);
  gl.compileShader(fs);
  gl.attachShader(handle, vs);
  gl.attachShader(handle, fs);
  gl.linkProgram(handle);

  const uniforms = {} as Record<Uniform, WebGLUniformLocation | null>;
  let linked = false;
  let waiting: (() => void)[] = [];
  let poll = 0;
  let disposed = false;

  const finish = () => {
    if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) {
      console.error("works: breath program", gl.getProgramInfoLog(handle), gl.getShaderInfoLog(vs), gl.getShaderInfoLog(fs));
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
