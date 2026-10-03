/**
 * ─── Stage · the camera ───
 *
 * One real pinhole camera, in metres, fitted to the reference frame. The
 * water's perspective, the reflections, the depth of fog in front of
 * everything and the parallax all come from this one camera, so they cannot
 * disagree with each other — which is most of what separates a photograph
 * from a collage.
 *
 * FITTED, NOT PICKED. Read as a camera, the user's frames (a sketch, then
 * their 1200×700 design) are:
 *
 *   a level camera at SHOULDER height, crouched: 1.23 m above the water and
 *   0.69 m above the stone's top, about 10 m from the stone, with a ~40°
 *   horizontal field of view (a 50 mm lens on full frame), its frame risen
 *   so the horizon sits 58.8% of the way down — where the design puts the
 *   photograph's horizon (scripts/hero-plates/backdrop.py FRAME_*).
 *
 * Checks: the stone's size and place against the frame match the design's
 * to a few pixels. Lower than a standing eye, the camera looks across the
 * water at the stone rather than down on it: the water lies flatter, the
 * fog above it takes the frame, and what stands on it rises against the
 * fog.
 *
 * THE RISING FRONT. The horizon is put below the middle by shifting the
 * frame, not by tilting the camera up: the lens stays level, as on a view
 * camera's rising front or a shift lens. Tilted, every trunk and the
 * stone's edges would lean in toward the top of the frame — the tell of a
 * camera pointed up at something.
 *
 * The FIELD OF VIEW IS VERTICAL, so the composition holds on every aspect:
 * the horizon and the stone are shares of the frame's HEIGHT,
 * and a wider screen simply sees more shore.
 *
 * UNTIL THE FRAME IS NARROW. On a tall phone a fixed vertical view crops in
 * until the stone fills half the width and both shores are gone: a close-up,
 * not the scene. So the horizontal view never drops below 22°. Past that the
 * lens widens instead: more fog above, more water below, the stone small
 * in the middle with a sliver of shore at the edge — negative space, which is
 * what a portrait frame is for. (Desktop and 4:3 never reach the floor.)
 *
 * NEVER PAST THE PHOTOGRAPH. The shores are one photograph, and it ends: a
 * frame wider than it covers (anything past ~16:9) would look beyond its
 * edge, and whatever filled that — a mirror of it, a stretch of it — reads
 * as the same trees twice. So on a wide frame the lens CLOSES IN until both
 * edges are inside it, the way a background covers its box: the design's
 * composition, a little less sky and water, the stone a little
 * larger (+13% at 2:1, +27% at 2.26:1). Past `maxCloseIn` (beyond ~2.3:1)
 * the stone would leave the frame; there the lens holds, and the
 * photograph's edges fade into the fog instead (shaders/backdrop.ts).
 */

import { STONE } from "../stone/optics";
import { BACKDROP, DEPTH } from "./layers";
import { PARALLAX } from "./motion";

export const CAMERA = {
  eyeHeight: 1.23,
  /* The horizon's place in the frame, as a share of its height from the
   * top (the rising front). 0.5 is a centred lens. The design's. */
  horizon: 0.5876,
  /* Degrees, the frame's full height: the reference's 40° horizontal at
   * its aspect. */
  verticalFov: 24.93,
  /* Degrees: the narrowest the view may get across a portrait frame. */
  minHorizontalFov: 22,
  /* The point the camera orbits: over the stone's centre, a little above
   * its top. */
  pivot: [STONE.center[0], 1.1, DEPTH.subject] as const,
  /* How far inside the photograph's edge (tan) a frame's edge must stay:
   * the lean's reach at the shores (5 cm against a 10 m pivot moves a 60 m
   * bank ~0.004) with room to spare, and the width of the edge's fade. Past
   * `maxCloseIn` the fade widens by `grow` × how far past the edge the frame
   * looks, up to `widest`: on a 32:9 frame the forest's outer third fades
   * into the fog, the way a far bank does, instead of ending at a line. */
  edge: { lean: 0.006, fade: 0.01, grow: 0.8, widest: 0.15 },
  /* The most the lens closes in for a wide frame: at 1.29 the stone's
   * front corner meets the water 2% above the frame's bottom. (The user's
   * 2.26:1 screen needs 1.27.) */
  maxCloseIn: 1.29,
} as const;

const tanHalf = (degrees: number) => Math.tan(((degrees / 2) * Math.PI) / 180);

/** Focal length in CSS px for a frame `widthPx × heightPx`. */
export function focalPx(widthPx: number, heightPx: number): number {
  const framed = Math.min(
    (0.5 * heightPx) / tanHalf(CAMERA.verticalFov),
    (0.5 * widthPx) / tanHalf(CAMERA.minHorizontalFov),
  );
  /* Closed in until the frame's edges are inside the photograph. */
  const inside = (0.5 * widthPx) / (BACKDROP.reach - CAMERA.edge.lean - CAMERA.edge.fade);
  return Math.min(Math.max(framed, inside), framed * CAMERA.maxCloseIn);
}

/** Everything a pass needs to look through the camera this frame. */
export interface CameraFrame {
  /** Frame size, CSS px. */
  readonly view: readonly [number, number];
  /** Focal length, CSS px. */
  readonly focal: number;
  /** Where the camera is, metres. */
  readonly position: readonly [number, number, number];
  /** Camera → world, column-major. */
  readonly rotation: Float32Array;
}

/** The uniform names every camera-reading program declares (CAMERA_GLSL). */
export const CAMERA_UNIFORMS = ["uView", "uFocal", "uCenter", "uCamPos", "uCamRot", "uEyeHeight"] as const;

export function setCameraUniforms(
  gl: WebGL2RenderingContext,
  uniforms: Record<string, WebGLUniformLocation | null>,
  frame: CameraFrame,
): void {
  gl.uniform2f(uniforms.uView, frame.view[0], frame.view[1]);
  gl.uniform1f(uniforms.uFocal, frame.focal);
  /* The lens's axis on the frame, in uv (y up): risen by the front. */
  gl.uniform2f(uniforms.uCenter, 0.5, 1 - CAMERA.horizon);
  gl.uniform3f(uniforms.uCamPos, frame.position[0], frame.position[1], frame.position[2]);
  gl.uniformMatrix3fv(uniforms.uCamRot, false, frame.rotation);
  gl.uniform1f(uniforms.uEyeHeight, CAMERA.eyeHeight);
}

export interface SwayParams {
  swayX: number;
  swayY: number;
  swayRate: number;
}

/**
 * The camera's lean: a critically damped spring on a fixed 1/120s step,
 * chasing a target set by the pointer. Per-frame state lives here, outside
 * React; the engine reads `pose()` once a frame.
 */
export class CameraRig {
  private x = 0;
  private y = 0;
  private vx = 0;
  private vy = 0;
  /* Target, as shares of the full lean (−1…1). */
  private tx = 0;
  private ty = 0;
  private accumulator = 0;
  private readonly rotation = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

  /** Lean toward a point of the frame: −1…1 across, −1…1 up. */
  lean(nx: number, ny: number): void {
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    this.tx = clamp(nx) * PARALLAX.lean;
    this.ty = clamp(ny) * PARALLAX.lean;
  }

  /** Straighten up (the pointer left, or reduced motion). */
  centre(): void {
    this.tx = 0;
    this.ty = 0;
  }

  /** At rest and asked to stay there: nothing to integrate. */
  get resting(): boolean {
    const e = PARALLAX.restEpsilon;
    return (
      Math.abs(this.x - this.tx) < e && Math.abs(this.y - this.ty) < e &&
      Math.abs(this.vx) < e && Math.abs(this.vy) < e
    );
  }

  /** Advances the spring by `dt` seconds; `frequency` in rad/s (PARALLAX). */
  update(dt: number, frequency: number = PARALLAX.frequency): void {
    if (this.resting) {
      this.accumulator = 0;
      return;
    }
    const h = PARALLAX.step;
    this.accumulator += Math.min(dt, PARALLAX.maxFrame);
    const w = frequency;
    const c = 2 * PARALLAX.damping * w;
    while (this.accumulator >= h) {
      this.accumulator -= h;
      /* Semi-implicit Euler: velocity first, then position with the new
         velocity. Stable here by a wide margin (ω·h ≈ 0.04). */
      this.vx += (w * w * (this.tx - this.x) - c * this.vx) * h;
      this.vy += (w * w * (this.ty - this.y) - c * this.vy) * h;
      this.x += this.vx * h;
      this.y += this.vy * h;
    }
  }

  /**
   * The camera for this frame: moved by the lean, and turned so the pivot
   * (over the stone) stays exactly where it is on screen.
   */
  pose(view: readonly [number, number], sway: SwayParams): CameraFrame {
    const dx = this.x * sway.swayX;
    const dy = this.y * sway.swayY;
    const [px, py, pz] = CAMERA.pivot;
    const eye = CAMERA.eyeHeight;
    /* Yaw and pitch that keep the pivot on the same ray it had at rest. */
    const yaw = Math.atan2(px - dx, pz) - Math.atan2(px, pz);
    const pitch = Math.atan2(py - (eye + dy), pz) - Math.atan2(py - eye, pz);
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    /* Columns: the camera's right, up and forward in the world. Pitch
       about the camera's right, then yaw about the world's up. */
    const r = this.rotation;
    r[0] = cy;
    r[1] = 0;
    r[2] = -sy;
    r[3] = -sp * sy;
    r[4] = cp;
    r[5] = -sp * cy;
    r[6] = cp * sy;
    r[7] = sp;
    r[8] = cp * cy;
    return {
      view,
      focal: focalPx(view[0], view[1]),
      position: [dx, eye + dy, 0],
      rotation: r,
    };
  }
}
