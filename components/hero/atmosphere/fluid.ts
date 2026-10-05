/**
 * ─── Atmosphere · the simulated air ───
 *
 * Owns the fluid grid and steps it. Per fixed step (1/60s):
 *
 *   forcing → CURL → FORCE → DIVERGENCE → pressure (warm start + Jacobi ×N)
 *   → PROJECT → ADVECT → CARRY
 *
 * The fluid texture ping-pongs through all of it; CARRY moves the billows'
 * texture coordinates along the same air, so the near fog's DETAIL rides it.
 *
 * The grid covers the frame of the camera AT REST plus a margin, on the
 * stone's plane. The fog sheets at other depths read it through their own
 * projection (shaders/sheets.ts), so the camera's sway never drags the air.
 */

import { bindTexture, clearTarget, createProgram, createTarget, deleteTarget, type Program, type Target } from "../stage/gl";
import type { ForcingFrame } from "./forcing";
import { FLUID, FOG, STRATIFICATION, TURBULENCE, WAKE, WIND } from "./motion";
import {
  ADVECT_FRAG,
  CARRY_FRAG,
  CARRY_INIT_FRAG,
  CURL_FRAG,
  DIVERGENCE_FRAG,
  FORCE_FRAG,
  INIT_FRAG,
  JACOBI_FRAG,
  MAX_BREATHS,
  MAX_STIRS,
  PROJECT_FRAG,
  SCALE_FRAG,
} from "./shaders/fluid";

/** What the air's step reads from the live tuning. */
export interface AirParams {
  vorticity: number;
  velocityHalfLife: number;
  healSeconds: number;
  currents: number;
}

interface Programs {
  init: Program;
  curl: Program;
  force: Program;
  divergence: Program;
  scale: Program;
  jacobi: Program;
  project: Program;
  advect: Program;
  carryInit: Program;
  carry: Program;
}

/* Uniform names shared by the passes that read the resting fog, the breaths
 * or the wake. */
const FOG_UNIFORMS = ["uGrid", "uTime", "uFog", "uFogProfile", "uStretch", "uDrift"] as const;
const BREATH_UNIFORMS = ["uBreathCount", "uBreath"] as const;
const WAKE_UNIFORMS = ["uWakeSegment", "uWake"] as const;
const WIND_UNIFORMS = ["uWindDrift", "uShear", "uWindHeight"] as const;
const PLUME_UNIFORMS = ["uPlume", "uPlumeShape"] as const;

export class FluidSim {
  private readonly gl: WebGL2RenderingContext;
  private readonly vao: WebGLVertexArrayObject;
  private readonly programs: Programs;

  gridW = 0;
  gridH = 0;
  /** The frame, in cells (the grid minus its margins). */
  viewCellsW = 0;
  viewCellsH = 0;

  private fluid: [Target, Target] | null = null;
  private fluidIndex = 0;
  private pressure: [Target, Target] | null = null;
  private pressureIndex = 0;
  private curl: Target | null = null;
  private divergence: Target | null = null;
  private carry: [Target, Target] | null = null;
  private carryIndex = 0;
  /* Which carry cycle each coordinate set is on; a change means it snaps. */
  private carryCycle: [number, number] = [0, 0];

  constructor(gl: WebGL2RenderingContext, vao: WebGLVertexArrayObject) {
    this.gl = gl;
    this.vao = vao;
    this.programs = {
      init: createProgram(gl, INIT_FRAG, [...FOG_UNIFORMS]),
      curl: createProgram(gl, CURL_FRAG, ["uFluid"]),
      force: createProgram(gl, FORCE_FRAG, [
        "uFluid", "uCurl", "uDt", "uTime", "uVorticity", "uWind", "uCurrents",
        "uEddies", "uWakeGain", ...WAKE_UNIFORMS, ...WIND_UNIFORMS, ...PLUME_UNIFORMS,
      ]),
      divergence: createProgram(gl, DIVERGENCE_FRAG, ["uFluid", ...BREATH_UNIFORMS]),
      scale: createProgram(gl, SCALE_FRAG, ["uSource", "uScale"]),
      jacobi: createProgram(gl, JACOBI_FRAG, ["uPressure", "uDivergence"]),
      project: createProgram(gl, PROJECT_FRAG, ["uFluid", "uPressure"]),
      advect: createProgram(gl, ADVECT_FRAG, [
        "uFluid", "uDt", "uKeep", "uTurbulence", "uWakeStir", "uWakeThinning", "uWakePresence",
        "uStirCount", "uStir",
        ...FOG_UNIFORMS, ...BREATH_UNIFORMS, ...WAKE_UNIFORMS, ...WIND_UNIFORMS, ...PLUME_UNIFORMS,
      ]),
      carryInit: createProgram(gl, CARRY_INIT_FRAG, []),
      carry: createProgram(gl, CARRY_FRAG, ["uCarry", "uFluid", "uGrid", "uDt", "uReset", ...WIND_UNIFORMS]),
    };
  }

  /** The air: rg velocity (cells/s), b fog density, a turbulent energy. */
  get field(): WebGLTexture | null {
    return this.fluid?.[this.fluidIndex].tex ?? null;
  }

  /** The air's current target, to be read back (sampler.ts). */
  get fieldTarget(): Target | null {
    return this.fluid?.[this.fluidIndex] ?? null;
  }

  /** The billows' carried coordinates: two sets, in cells. */
  get carried(): WebGLTexture | null {
    return this.carry?.[this.carryIndex].tex ?? null;
  }

  /** Frame uv (camera at rest) → fluid uv: scale xy, offset zw. */
  get gridMap(): readonly [number, number, number, number] {
    return [
      this.viewCellsW / this.gridW,
      this.viewCellsH / this.gridH,
      FLUID.marginCells / this.gridW,
      FLUID.marginCells / this.gridH,
    ];
  }

  /**
   * Sizes the grid to a frame of `cellsW × cellsH` cells. Returns true if it
   * was rebuilt: a rebuild resets the air, so swirls in flight are gone.
   */
  resize(cellsW: number, cellsH: number, time: number, reduced: boolean): boolean {
    this.viewCellsW = cellsW;
    this.viewCellsH = cellsH;
    const w = Math.ceil(cellsW) + 2 * FLUID.marginCells;
    const h = Math.ceil(cellsH) + 2 * FLUID.marginCells;
    if (w === this.gridW && h === this.gridH) return false;
    this.allocate(w, h, time, reduced);
    return true;
  }

  private allocate(w: number, h: number, time: number, reduced: boolean): void {
    const gl = this.gl;
    this.release();
    this.gridW = w;
    this.gridH = h;
    const half = gl.RGBA16F;
    this.fluid = [createTarget(gl, w, h, half, gl.LINEAR), createTarget(gl, w, h, half, gl.LINEAR)];
    this.pressure = [createTarget(gl, w, h, half, gl.NEAREST), createTarget(gl, w, h, half, gl.NEAREST)];
    this.curl = createTarget(gl, w, h, half, gl.NEAREST);
    this.divergence = createTarget(gl, w, h, half, gl.NEAREST);
    this.carry = [createTarget(gl, w, h, half, gl.LINEAR), createTarget(gl, w, h, half, gl.LINEAR)];
    this.carryIndex = 0;
    for (const t of this.pressure) clearTarget(gl, t);
    this.fluidIndex = 0;
    this.pressureIndex = 0;

    /* Start as resting air, not as empty air. */
    const { init } = this.programs;
    gl.bindVertexArray(this.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fluid[0].fbo);
    gl.viewport(0, 0, w, h);
    gl.useProgram(init.handle);
    this.setFogUniforms(init, time, reduced);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    /* Billows start where they are: every coordinate is its own cell. */
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.carry[0].fbo);
    gl.useProgram(this.programs.carryInit.handle);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** One step of the air. */
  step(dt: number, time: number, f: ForcingFrame, p: AirParams, pressureIterations: number, reduced: boolean): void {
    const fluid = this.fluid;
    const pressure = this.pressure;
    const curl = this.curl;
    const divergence = this.divergence;
    const carry = this.carry;
    if (!fluid || !pressure || !curl || !divergence || !carry) return;

    const gl = this.gl;
    const P = this.programs;
    gl.bindVertexArray(this.vao);
    gl.viewport(0, 0, this.gridW, this.gridH);

    const draw = (target: Target) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const read = () => fluid[this.fluidIndex];
    const write = () => fluid[1 - this.fluidIndex];
    const flip = () => (this.fluidIndex = 1 - this.fluidIndex);
    const wind = reduced ? 0.25 : 1;

    /* Curl. */
    gl.useProgram(P.curl.handle);
    bindTexture(gl, P.curl.uniforms.uFluid, 0, read().tex);
    draw(curl);

    /* Forces. */
    let u = P.force.uniforms;
    gl.useProgram(P.force.handle);
    bindTexture(gl, u.uFluid, 0, read().tex);
    bindTexture(gl, u.uCurl, 1, curl.tex);
    gl.uniform1f(u.uDt, dt);
    gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uVorticity, p.vorticity);
    gl.uniform4f(u.uWind, WIND.drift[0] * wind, WIND.drift[1] * wind, WIND.pull, p.currents * wind);
    gl.uniform3f(u.uCurrents, WIND.frequency, WIND.evolve, STRATIFICATION.verticalCurrents);
    gl.uniform3f(u.uEddies, TURBULENCE.eddyForce, 1 / TURBULENCE.eddySize, TURBULENCE.churn);
    gl.uniform1f(u.uWakeGain, WAKE.gain);
    this.setPlumeUniforms(P.force, f);
    gl.uniform4fv(u.uWakeSegment, f.wakeSegment);
    gl.uniform4fv(u.uWake, f.wake);
    this.setWindUniforms(P.force, reduced);
    draw(write());
    flip();

    /* Divergence, less every breath. */
    u = P.divergence.uniforms;
    gl.useProgram(P.divergence.handle);
    bindTexture(gl, u.uFluid, 0, read().tex);
    this.setBreathUniforms(P.divergence, f);
    draw(divergence);

    /* Pressure: warm start, then Jacobi. */
    gl.useProgram(P.scale.handle);
    bindTexture(gl, P.scale.uniforms.uSource, 0, pressure[this.pressureIndex].tex);
    gl.uniform1f(P.scale.uniforms.uScale, FLUID.pressureCarry);
    draw(pressure[1 - this.pressureIndex]);
    this.pressureIndex = 1 - this.pressureIndex;

    gl.useProgram(P.jacobi.handle);
    bindTexture(gl, P.jacobi.uniforms.uDivergence, 1, divergence.tex);
    for (let i = 0; i < pressureIterations; i += 1) {
      bindTexture(gl, P.jacobi.uniforms.uPressure, 0, pressure[this.pressureIndex].tex);
      draw(pressure[1 - this.pressureIndex]);
      this.pressureIndex = 1 - this.pressureIndex;
    }

    /* Projection. */
    gl.useProgram(P.project.handle);
    bindTexture(gl, P.project.uniforms.uFluid, 0, read().tex);
    bindTexture(gl, P.project.uniforms.uPressure, 1, pressure[this.pressureIndex].tex);
    draw(write());
    flip();

    /* Advection, healing, thinning. */
    u = P.advect.uniforms;
    gl.useProgram(P.advect.handle);
    bindTexture(gl, u.uFluid, 0, read().tex);
    gl.uniform1f(u.uDt, dt);
    gl.uniform2f(u.uKeep, Math.pow(0.5, dt / p.velocityHalfLife), 1 - Math.exp(-dt / p.healSeconds));
    gl.uniform3f(u.uTurbulence, Math.pow(0.5, dt / TURBULENCE.halfLife), TURBULENCE.mixing, TURBULENCE.thinning);
    gl.uniform1f(u.uWakeStir, WAKE.energy);
    gl.uniform1f(u.uWakeThinning, WAKE.thinning);
    gl.uniform1f(u.uWakePresence, f.wakePresence);
    gl.uniform1i(u.uStirCount, f.stirCount);
    gl.uniform4fv(u.uStir, f.stir, 0, MAX_STIRS * 4);
    this.setPlumeUniforms(P.advect, f);
    this.setFogUniforms(P.advect, time, reduced);
    this.setBreathUniforms(P.advect, f);
    gl.uniform4fv(u.uWakeSegment, f.wakeSegment);
    gl.uniform4fv(u.uWake, f.wake);
    this.setWindUniforms(P.advect, reduced);
    draw(write());
    flip();

    /* The billows ride the same air. Each coordinate set snaps back to the
       identity when its cycle turns over — at the moment its weight in the
       sheets pass is zero. */
    const cycles = carryCycles(time);
    u = P.carry.uniforms;
    gl.useProgram(P.carry.handle);
    bindTexture(gl, u.uCarry, 0, carry[this.carryIndex].tex);
    bindTexture(gl, u.uFluid, 1, read().tex);
    gl.uniform2f(u.uGrid, this.gridW, this.gridH);
    gl.uniform1f(u.uDt, dt);
    gl.uniform2f(u.uReset, cycles[0] !== this.carryCycle[0] ? 1 : 0, cycles[1] !== this.carryCycle[1] ? 1 : 0);
    this.setWindUniforms(P.carry, reduced);
    this.carryCycle = cycles;
    draw(carry[1 - this.carryIndex]);
    this.carryIndex = 1 - this.carryIndex;
  }

  private setFogUniforms(program: Program, time: number, reduced: boolean): void {
    const gl = this.gl;
    const u = program.uniforms;
    gl.uniform2f(u.uGrid, this.gridW, this.gridH);
    gl.uniform1f(u.uTime, time);
    gl.uniform4f(u.uFog, FOG.base, FOG.variation, FOG.frequency, reduced ? 0 : FOG.evolve);
    gl.uniform2f(u.uFogProfile, FOG.lowBoost, FOG.thinAbove);
    gl.uniform1f(u.uStretch, STRATIFICATION.stretch);
    const wind = reduced ? 0.25 : 1;
    gl.uniform2f(u.uDrift, WIND.drift[0] * wind, WIND.drift[1] * wind);
  }

  private setPlumeUniforms(program: Program, f: ForcingFrame): void {
    this.gl.uniform4fv(program.uniforms.uPlume, f.plume);
    this.gl.uniform3fv(program.uniforms.uPlumeShape, f.plumeShape);
  }

  private setWindUniforms(program: Program, reduced: boolean): void {
    const wind = reduced ? 0.25 : 1;
    const u = program.uniforms;
    this.gl.uniform2f(u.uWindDrift, WIND.drift[0] * wind, WIND.drift[1] * wind);
    this.gl.uniform1f(u.uShear, STRATIFICATION.shear);
    this.gl.uniform1f(u.uWindHeight, this.gridH);
  }

  private setBreathUniforms(program: Program, f: ForcingFrame): void {
    this.gl.uniform1i(program.uniforms.uBreathCount, f.breathCount);
    this.gl.uniform4fv(program.uniforms.uBreath, f.breath, 0, MAX_BREATHS * 4);
  }

  private release(): void {
    const gl = this.gl;
    this.fluid?.forEach((t) => deleteTarget(gl, t));
    this.pressure?.forEach((t) => deleteTarget(gl, t));
    deleteTarget(gl, this.curl);
    deleteTarget(gl, this.divergence);
    this.carry?.forEach((t) => deleteTarget(gl, t));
    this.carry = null;
    this.fluid = null;
    this.pressure = null;
    this.curl = null;
    this.divergence = null;
  }

  dispose(): void {
    const gl = this.gl;
    for (const program of Object.values(this.programs)) gl.deleteProgram(program.handle);
    this.release();
  }
}

/** The carry cycle each coordinate set is on; set B runs half a cycle behind A. */
function carryCycles(time: number): [number, number] {
  const t = time / FLUID.carrySeconds;
  return [Math.floor(t), Math.floor(t + 0.5)];
}

/** Weight of carried set A: zero as it snaps, full half a cycle later. */
export function carryPhase(time: number): number {
  const t = (time / FLUID.carrySeconds) % 1;
  return 1 - Math.abs(2 * t - 1);
}
