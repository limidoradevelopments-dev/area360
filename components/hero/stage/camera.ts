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
 * ON A PHONE, THE USER'S CROP (2026-10-22, their frame of this scene on a
 * phone: "for mobile use the exact same crop"). Upright, the fixed vertical
 * view crops in until the stone fills half the width and the shores are
 * gone but for a smudge of the far bank — which is their frame, a little
 * larger (`portrait.zoom`), the horizon a little lower and the stone in the
 * middle across: a SHIFT of the frame, not a turn, so it is the same view
 * cropped, every edge of the stone still upright. Until then the lens
 * widened below 22° across instead (the stone small in a tall frame of fog
 * and water); that showed water the design never framed — the stone's
 * whole reflection, the empty near water — and the user found it poorer.
 * Wholly from `portrait.to` down, none from square up (desktop, landscape
 * phones), eased between.
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
import { ARRIVAL, PARALLAX } from "./motion";

export const CAMERA = {
  eyeHeight: 1.23,
  /* The horizon's place in the frame, as a share of its height from the
   * top (the rising front). 0.5 is a centred lens. The design's. */
  horizon: 0.5876,
  /* Degrees, the frame's full height: the reference's 40° horizontal at
   * its aspect. The design's lens, which the photograph was registered to
   * (scripts/hero-plates/backdrop.py TAN_HALF_V): change `zoom`, not this. */
  verticalFov: 24.93,
  /* THE USER'S CROP (2026-10-17: "zoom or crop our existing frame and match
   * this one's tree placement"): their frame is the design's drawn 9.3%
   * larger about the lens's axis and the horizon — registered, an affine
   * fit of the left bank's and the stone's edges (correlation 0.959), its
   * centre within 2 px of the axis and the horizon. A longer lens from the
   * same place: the same perspective, every shape the same, only larger. On
   * every screen (a phone's crop is on top of it: `portrait`). */
  zoom: 1.093,
  /* THE PHONE CROP (above): from what shape (width ÷ height) it begins and
   * where it is whole, how much longer the lens is then, and where the
   * horizon sits (a share of the height from the top). Registered on the
   * user's frame (780×1602): the stone 393 px across, in the middle, its
   * top's front edge 1275 px down. */
  portrait: { from: 1, to: 0.8, zoom: 1.083, horizon: 0.5949 },
  /* The point the camera orbits: over the stone's centre, a little above
   * its top. */
  pivot: [STONE.center[0], 1.1, DEPTH.subject] as const,
  /* How far inside the photograph's edge (tan) a frame's edge must stay:
   * the lean's reach at the shores (12 cm against a 10 m pivot moves the
   * sky ~0.012; motion.ts PARALLAX) with room to spare, and the width of the edge's fade. Past
   * `maxCloseIn` the fade widens by `grow` × how far past the edge the frame
   * looks, up to `widest`: on a 32:9 frame the forest's outer third fades
   * into the fog, the way a far bank does, instead of ending at a line. */
  edge: { lean: 0.014, fade: 0.01, grow: 0.8, widest: 0.15 },
  /* The most the lens closes in for a wide frame: at 1.29 the stone's
   * front corner meets the water 2% above the frame's bottom. (The user's
   * 2.26:1 screen needs 1.27.) */
  maxCloseIn: 1.29,
} as const;

const tanHalf = (degrees: number) => Math.tan(((degrees / 2) * Math.PI) / 180);

/** How much of the phone crop a frame of this shape takes: none from
 *  square up, all of it from `portrait.to` down, smoothly between. */
function portraitShare(widthPx: number, heightPx: number): number {
  const P = CAMERA.portrait;
  const t = Math.min(1, Math.max(0, (P.from - widthPx / heightPx) / (P.from - P.to)));
  return t * t * (3 - 2 * t);
}

/** Focal length in CSS px for a frame `widthPx × heightPx`. */
export function focalPx(widthPx: number, heightPx: number): number {
  let framed = ((0.5 * heightPx) / tanHalf(CAMERA.verticalFov)) * CAMERA.zoom;
  const share = portraitShare(widthPx, heightPx);
  if (share > 0) framed *= 1 + (CAMERA.portrait.zoom - 1) * share;
  /* Closed in until the frame's edges are inside the photograph. */
  const inside = (0.5 * widthPx) / (BACKDROP.reach - CAMERA.edge.lean - CAMERA.edge.fade);
  return Math.min(Math.max(framed, inside), framed * CAMERA.maxCloseIn);
}

/**
 * Where the lens's axis meets a frame `widthPx × heightPx` (uv, y up), its
 * lens at rest `focal` CSS px, into `out`: the rising front's horizon, and
 * on a phone the user's crop — the horizon a little lower, the frame
 * shifted across so the stone stands in its middle.
 */
export function frameCenter(widthPx: number, heightPx: number, focal: number, out: [number, number]): [number, number] {
  out[0] = 0.5;
  out[1] = 1 - CAMERA.horizon;
  const share = portraitShare(widthPx, heightPx);
  if (share > 0) {
    out[0] = 0.5 - ((STONE.center[0] / STONE.center[1]) * focal * share) / widthPx;
    out[1] = 1 - (CAMERA.horizon + (CAMERA.portrait.horizon - CAMERA.horizon) * share);
  }
  return out;
}

/** Everything a pass needs to look through the camera this frame. */
export interface CameraFrame {
  /** Frame size, CSS px. */
  readonly view: readonly [number, number];
  /** Focal length, CSS px (the arrival's zoom in it). */
  readonly focal: number;
  /** The lens at rest, CSS px: the frame the simulated air lives in. */
  readonly restFocal: number;
  /** Where the lens's axis meets the frame (uv, y up): frameCenter. */
  readonly center: readonly [number, number];
  /** Where the camera is, metres. */
  readonly position: readonly [number, number, number];
  /** Camera → world, column-major. */
  readonly rotation: Float32Array;
  /** How far the photograph's eye stands from the camera's (metres): none
   *  while the lean is within what the photograph takes (motion.ts
   *  PARALLAX.plateMost). */
  readonly plateShift: readonly [number, number, number];
}

/** The uniform names every camera-reading program declares (CAMERA_GLSL). */
export const CAMERA_UNIFORMS = ["uView", "uFocal", "uRestFocal", "uCenter", "uCamPos", "uCamRot", "uEyeHeight", "uPlateShift"] as const;

export function setCameraUniforms(
  gl: WebGL2RenderingContext,
  uniforms: Record<string, WebGLUniformLocation | null>,
  frame: CameraFrame,
): void {
  gl.uniform2f(uniforms.uView, frame.view[0], frame.view[1]);
  gl.uniform1f(uniforms.uFocal, frame.focal);
  gl.uniform1f(uniforms.uRestFocal, frame.restFocal);
  /* The lens's axis on the frame, in uv (y up): risen by the front, and
     on a phone shifted by the crop. */
  gl.uniform2f(uniforms.uCenter, frame.center[0], frame.center[1]);
  gl.uniform3f(uniforms.uCamPos, frame.position[0], frame.position[1], frame.position[2]);
  gl.uniformMatrix3fv(uniforms.uCamRot, false, frame.rotation);
  gl.uniform1f(uniforms.uEyeHeight, CAMERA.eyeHeight);
  gl.uniform3f(uniforms.uPlateShift, frame.plateShift[0], frame.plateShift[1], frame.plateShift[2]);
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
  /* Seconds since the arrival began (motion.ts ARRIVAL); infinite: in
     place. */
  private age = Infinity;
  private readonly rotation = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  private readonly shift: [number, number, number] = [0, 0, 0];
  private readonly center: [number, number] = [0.5, 1 - CAMERA.horizon];

  /** Start from the arrival's opening shot, to settle into place. */
  arrive(): void {
    this.age = 0;
  }

  /** In place at once (reduced motion). */
  settle(): void {
    this.age = Infinity;
  }

  /** Still settling into place. */
  get arriving(): boolean {
    return this.age < Math.max(ARRIVAL.seconds, ARRIVAL.zoom.seconds);
  }

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

  /** Advances the arrival and the spring by `dt` seconds; `frequency` in
   *  rad/s (PARALLAX). */
  update(dt: number, frequency: number = PARALLAX.frequency): void {
    /* The arrival runs on wall time, the frame capped as the spring's is:
       a stalled frame holds it rather than jumping it. */
    if (this.age < Infinity) this.age += Math.min(dt, PARALLAX.maxFrame);
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
   * The camera for this frame.
   *
   * THE LEAN turns it about the orbit point (motion.ts PARALLAX.orbit), out
   * in the lake beyond the stone: the stone moves a little with the visitor
   * and the shores a little against them — an object in a space, not a
   * picture panned behind a fixed cut-out.
   *
   * THE ARRIVAL (motion.ts ARRIVAL) lifts and draws it back, turned so the
   * stone keeps its place; and opens on a longer lens tilted down onto the
   * stone (its `zoom`), easing out to the resting lens. A tilt, not a shift
   * of the frame: the lens's axis meets the frame at the horizon (the risen
   * front), and zoomed about that the stone fell out of the bottom.
   */
  pose(view: readonly [number, number], sway: SwayParams): CameraFrame {
    const A = ARRIVAL;
    const Z = A.zoom;
    const crane = (1 - Math.min(this.age / A.seconds, 1)) ** A.power;
    const t = Math.min(this.age / Z.seconds, 1);
    /* In and out (smootherstep): held a moment while the frame is still
       dark, out through the middle, landing without a jolt. */
    const close = 1 - t * t * t * (t * (t * 6 - 15) + 10);
    const lx = this.x * sway.swayX;
    const ly = this.y * sway.swayY;
    const up = crane * A.up;
    const dz = -crane * A.back;
    const [px, py, pz] = CAMERA.pivot;
    const oz = PARALLAX.orbit;
    const eye = CAMERA.eyeHeight;
    const camY = eye + ly + up;
    const yaw = Math.atan2(px - lx, oz - dz) - Math.atan2(px, oz);
    let pitch =
      Math.atan2(py - (eye + ly), oz) - Math.atan2(py - eye, oz) +
      Math.atan2(py - (eye + up), pz - dz) - Math.atan2(py - eye, pz);
    const rest = focalPx(view[0], view[1]);
    const focal = rest * (1 + (Z.from - 1) * close);
    /* Where the lens's axis meets the frame: the horizon's share from the
       top. */
    const horizon = 1 - frameCenter(view[0], view[1], rest, this.center)[1];
    if (close > 0) {
      /* The framing point (the flowers on the stone's top) placed at
         `frame` of the height from the top, eased back to where the lens
         puts it as it widens. */
      const [fx, fy, fz] = A.frameOn;
      const elevation = Math.atan2(fy - camY, Math.hypot(fx - lx, fz - dz));
      const below = pitch - elevation;
      const natural = horizon + (Math.tan(below) * focal) / view[1];
      const wanted = natural + (Z.frame - natural) * close;
      pitch -= below - Math.atan(((wanted - horizon) * view[1]) / focal);
    }
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
    /* The photograph's eye: the lean past what it takes stays with the
       camera, not with the photograph (motion.ts PARALLAX.plateMost). */
    const [mx, my] = PARALLAX.plateMost;
    this.shift[0] = lx - Math.max(-mx, Math.min(mx, lx));
    this.shift[1] = ly - Math.max(-my, Math.min(my, ly));
    return {
      view,
      focal,
      restFocal: rest,
      center: this.center,
      position: [lx, camY, dz],
      rotation: r,
      plateShift: this.shift,
    };
  }
}
