/**
 * ─── Atmosphere ───
 *
 * The fog, as one object the stage talks to. It owns:
 *
 *   the air      a fluid simulation on the stone's plane (fluid.ts), stepped on a
 *                fixed clock, fed by the visitor's hand and by the lake's
 *                own gusts (forcing.ts, ambient.ts)
 *   the sheets   the fog between the planes of the set, rendered at half
 *                resolution through the camera (shaders/sheets.ts): a
 *                density and a light per sheet, for the composite to put
 *                between things
 *
 * Input arrives in frame CSS px. The hand acts on the air in front of the
 * stone: the camera orbits it, so its plane never moves on screen, and a
 * pointer position is a position on it without conversion.
 */

import { CAMERA, CAMERA_UNIFORMS, setCameraUniforms, type CameraFrame } from "../stage/camera";
import { bindTexture, createMultiTarget, createProgram, deleteTarget, type MultiTarget, type Program } from "../stage/gl";
import { breathing, Gusts } from "./ambient";
import { carryPhase, FluidSim, type AirParams } from "./fluid";
import { Forcing } from "./forcing";
import {
  AIR_CLOCK,
  BREATHING,
  FLUID,
  FOG_WAVES,
  GUST,
  SHEET_WIND,
  SPELL,
  STRATIFICATION,
  TOUCH,
  TURBULENCE,
} from "./motion";
import { LIGHT, SHEETS, VOLUME } from "./optics";
import { SHEETS_FRAG } from "./shaders/sheets";

/** What the fog's look reads from the live tuning. */
export interface FogLook {
  /** Scales every sheet's billow contrast. 1 = designed. */
  detail: number;
  /** Scales every sheet's lit-side contrast. 1 = designed. */
  form: number;
  selfShadow: number;
  lightExtinction: number;
  ambient: number;
  /** Sheet 0's wisp sharpness (SHEETS[0].sharpness by default). */
  wisps: number;
}

/** The hand's gains, tuned live. 1 = designed. */
export interface HandGains {
  breath: number;
  spell: number;
  wake: number;
}

interface Press {
  at: number;
  x: number;
  y: number;
  type: string;
  casting: boolean;
}

export class Atmosphere {
  private readonly gl: WebGL2RenderingContext;
  private readonly vao: WebGLVertexArrayObject;
  private readonly sim: FluidSim;
  private readonly program: Program;
  private readonly forcing = new Forcing();
  private sheets: MultiTarget | null = null;

  /* The air's own clock: it only advances while the stage runs. */
  private clock: number = AIR_CLOCK.start;
  private accumulator = 0;
  private lastActive = -Infinity;
  private gusts: Gusts;
  private quietUntil = 0;

  /* The frame, in CSS px, and one cell of the air. */
  private cssW = 1;
  private cssH = 1;
  private cellPx = 4;

  /* Input, in cells. */
  private press: Press | null = null;
  private pointerCell: [number, number] | null = null;
  private pointerType = "mouse";
  private wakeFrom: [number, number] | null = null;

  constructor(gl: WebGL2RenderingContext, vao: WebGLVertexArrayObject) {
    this.gl = gl;
    this.vao = vao;
    this.sim = new FluidSim(gl, vao);
    this.gusts = new Gusts(AIR_CLOCK.start);
    this.program = createProgram(gl, SHEETS_FRAG, [
      ...CAMERA_UNIFORMS,
      "uFluid", "uCarry", "uGridMap", "uGrid", "uPhase", "uCellPx", "uPivotZ", "uTime", "uBreath",
      "uSheetPlane", "uSheetScale", "uSheetDetail", "uSheetResponse", "uSheetForm", "uSheetBlur", "uSheetSharp", "uSheetDrift",
      "uStrata", "uEvolve", "uLight", "uTurb", "uWaveA", "uWaveB",
    ]);
  }

  get time(): number {
    return this.clock;
  }

  /** Nothing has pushed the air for a while: it is only drifting. */
  get calm(): boolean {
    return this.clock - this.lastActive > AIR_CLOCK.calmAfter;
  }

  /** The sheets' densities (one per channel, near → far). */
  get density(): WebGLTexture | null {
    return this.sheets?.texs[0] ?? null;
  }

  /** The sheets' light: xyz sheets 0–2, w the plain light (far sheet, sky). */
  get light(): WebGLTexture | null {
    return this.sheets?.texs[1] ?? null;
  }

  /**
   * Re-measures the frame. `volumeW × volumeH` is the sheets pass's size.
   * A grid rebuild resets the air: a swirl in flight has nowhere to be.
   */
  resize(cssW: number, cssH: number, cellPx: number, volumeW: number, volumeH: number, reduced: boolean): void {
    this.cssW = cssW;
    this.cssH = cssH;
    this.cellPx = cellPx;
    if (this.sim.resize(cssW / cellPx, cssH / cellPx, this.clock, reduced)) {
      this.forcing.reset();
      this.press = null;
    }
    const sheets = this.sheets;
    if (!sheets || sheets.width !== volumeW || sheets.height !== volumeH) {
      deleteTarget(this.gl, sheets);
      this.sheets = createMultiTarget(this.gl, volumeW, volumeH, this.gl.RGBA16F, this.gl.LINEAR, 2);
    }
  }

  /** Advances the air by `dt` seconds of wall time, in fixed steps. */
  tick(dt: number, air: AirParams, hand: HandGains, pressureIterations: number, reduced: boolean): void {
    this.clock += dt;
    this.forcing.gain.breath = hand.breath;
    this.forcing.gain.spell = hand.spell;
    /* Reduced motion keeps what the visitor does and drops what the fog
       does unasked (the wake is the visitor's motion, but unasked-for). */
    this.forcing.gain.wake = reduced ? 0 : hand.wake;

    /* A press that has lasted becomes warmth. */
    const press = this.press;
    if (press && !press.casting && this.clock - press.at >= SPELL.delay && this.pointerCell) {
      press.casting = true;
      this.forcing.beginSpell(this.pointerCell[0], this.pointerCell[1]);
    }

    if (!reduced) {
      const gust = this.gusts.due(this.clock, this.quietUntil);
      if (gust) {
        const [cx, cy] = this.toCells(gust[0] * this.cssW, gust[1] * this.cssH);
        this.forcing.breathe(cx, cy, { sigma: GUST.sigma, rate: GUST.rate, seconds: GUST.seconds });
      }
    }

    const hover = this.hoverCell();
    this.forcing.setWake(hover ? (this.wakeFrom ?? hover) : null, hover, dt);

    /* Calm air steps half as often, each step twice as long. */
    const stepDt = AIR_CLOCK.tick * (this.calm ? AIR_CLOCK.calmEvery : 1);
    this.accumulator += dt;
    const steps = Math.floor(this.accumulator / stepDt);
    this.accumulator -= steps * stepDt;
    for (let i = 0; i < steps; i += 1) {
      if (this.forcing.collect(i, steps, stepDt) || this.forcing.busy) this.lastActive = this.clock;
      this.sim.step(stepDt, this.clock, this.forcing.frame, air, pressureIterations, reduced);
    }
    /* Only a frame that consumed time may advance the wake; otherwise a fast
       display's frame with no step would drop that stretch of path. */
    if (steps > 0) this.wakeFrom = hover;
  }

  /** Renders the fog sheets through the camera, into the sheets target. */
  render(camera: CameraFrame, look: FogLook, reduced: boolean): void {
    const sheets = this.sheets;
    const field = this.sim.field;
    const carried = this.sim.carried;
    if (!sheets || !field || !carried) return;
    const gl = this.gl;
    const u = this.program.uniforms;
    gl.bindVertexArray(this.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, sheets.fbo);
    gl.viewport(0, 0, sheets.width, sheets.height);
    gl.useProgram(this.program.handle);
    setCameraUniforms(gl, u, camera);

    bindTexture(gl, u.uFluid, 0, field);
    bindTexture(gl, u.uCarry, 1, carried);
    gl.uniform4f(u.uGridMap, ...this.sim.gridMap);
    gl.uniform2f(u.uGrid, this.sim.gridW, this.sim.gridH);
    gl.uniform1f(u.uPhase, carryPhase(this.clock));
    gl.uniform1f(u.uCellPx, this.cellPx);
    gl.uniform1f(u.uPivotZ, CAMERA.pivot[2]);
    const time = reduced ? AIR_CLOCK.start : this.clock;
    gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uBreath, 1 + (reduced ? 0 : BREATHING.amount * breathing(this.clock)));

    const per = <K extends keyof (typeof SHEETS)[number]>(key: K, scale = 1) =>
      SHEETS.map((s) => (s[key] as number) * scale) as [number, number, number, number];
    gl.uniform4f(u.uSheetPlane, ...per("plane"));
    gl.uniform4f(u.uSheetScale, ...per("scale"));
    gl.uniform4f(u.uSheetDetail, ...per("detail", look.detail));
    gl.uniform4f(u.uSheetResponse, ...per("response"));
    gl.uniform4f(u.uSheetForm, ...per("form", look.form));
    gl.uniform4f(u.uSheetBlur, ...per("blurCells"));
    gl.uniform4f(u.uSheetSharp, look.wisps, SHEETS[1].sharpness, SHEETS[2].sharpness, SHEETS[3].sharpness);
    /* The wind's drift at each depth, accumulated: metres travelled. */
    const drift = reduced ? 0.25 : 1;
    gl.uniform4f(
      u.uSheetDrift,
      SHEET_WIND[0] * drift * time,
      SHEET_WIND[1] * drift * time,
      SHEET_WIND[2] * drift * time,
      SHEET_WIND[3] * drift * time,
    );
    gl.uniform2f(u.uStrata, STRATIFICATION.stretch, STRATIFICATION.wispDrift);
    gl.uniform2f(u.uEvolve, reduced ? 0 : VOLUME.evolve, look.selfShadow);
    gl.uniform4f(u.uLight, LIGHT.position[0], LIGHT.position[1], look.lightExtinction, look.ambient);
    gl.uniform4f(u.uTurb, TURBULENCE.visibleAt, TURBULENCE.tearing, TURBULENCE.wispScale, TURBULENCE.wispRate);
    const wave = (i: number, location: WebGLUniformLocation | null) => {
      const w = FOG_WAVES[i];
      /* Phases seeded by a fixed stride (the golden angle), never randomly. */
      gl.uniform4f(location, reduced ? 0 : w.amplitude, w.wavelength, (Math.PI * 2) / w.period, i * 2.39996);
    };
    wave(0, u.uWaveA);
    wave(1, u.uWaveB);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /**
   * Development only: the mean of each sheet's density and light over the
   * frame's top, middle and bottom thirds, read back from the GPU.
   * Rows of four: sheets 0–3 (light: 0–2 and the plain light).
   */
  probe(): { density: number[][]; light: number[][] } {
    const sheets = this.sheets;
    if (!sheets) return { density: [], light: [] };
    const gl = this.gl;
    const { width, height } = sheets;
    const read = (index: number) => {
      const out = new Float32Array(width * height * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, sheets.fbo);
      gl.readBuffer(gl.COLOR_ATTACHMENT0 + index);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, out);
      gl.readBuffer(gl.COLOR_ATTACHMENT0);
      const thirds = [0, 1, 2].map(() => [0, 0, 0, 0]);
      const counts = [0, 0, 0];
      for (let y = 0; y < height; y += 1) {
        const third = Math.min(2, Math.floor(((height - 1 - y) / height) * 3));
        for (let x = 0; x < width; x += 1) {
          const i = (y * width + x) * 4;
          for (let c = 0; c < 4; c += 1) thirds[third][c] += out[i + c];
          counts[third] += 1;
        }
      }
      return thirds.map((t, i) => t.map((v) => Math.round((v / counts[i]) * 1000) / 1000));
    };
    return { density: read(0), light: read(1) };
  }

  /* ── Input, in frame CSS px ─────────────────────────────────────────── */

  pointerDown(x: number, y: number, pointerType: string): void {
    const cell = this.toCells(x, y);
    this.pointerType = pointerType;
    this.pointerCell = cell;
    /* A touch: a pinch of turbulence and the barest puff of moved air. */
    this.forcing.stir(cell[0], cell[1], { sigma: TOUCH.sigma, energy: TOUCH.energy, seconds: TOUCH.seconds });
    this.forcing.breathe(cell[0], cell[1], { sigma: TOUCH.puffSigma, rate: TOUCH.puffRate, seconds: TOUCH.seconds });
    this.press = { at: this.clock, x, y, type: pointerType, casting: false };
    this.quietUntil = this.clock + GUST.quietAfterTouch;
    this.lastActive = this.clock;
  }

  /** `x`/`y` null: the pointer is outside the frame. */
  pointerMove(x: number | null, y: number | null, pointerType: string): void {
    this.pointerType = pointerType;
    this.pointerCell = x === null || y === null ? null : this.toCells(x, y);
    const press = this.press;
    if (!press || x === null || y === null) return;
    if (press.casting) {
      if (this.pointerCell) this.forcing.moveSpell(this.pointerCell[0], this.pointerCell[1]);
      return;
    }
    /* On touch, travel before the hold starts is a scroll, not a press. */
    if (press.type === "touch" && Math.hypot(x - press.x, y - press.y) > SPELL.moveTolerancePx) this.press = null;
  }

  pointerUp(): void {
    if (this.press?.casting) this.forcing.endSpell();
    this.press = null;
  }

  pointerLeave(): void {
    this.pointerUp();
    this.pointerCell = null;
    this.wakeFrom = null;
  }

  private hoverCell(): [number, number] | null {
    if (this.press || this.pointerType === "touch") return null;
    return this.pointerCell;
  }

  /** Frame CSS px (y down) → grid cells (y up, inside the margin). */
  private toCells(x: number, y: number): [number, number] {
    return [x / this.cellPx + FLUID.marginCells, (this.cssH - y) / this.cellPx + FLUID.marginCells];
  }

  dispose(): void {
    this.gl.deleteProgram(this.program.handle);
    deleteTarget(this.gl, this.sheets);
    this.sim.dispose();
  }
}
