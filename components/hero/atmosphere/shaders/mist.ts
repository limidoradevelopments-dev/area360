/**
 * ─── Atmosphere · the low mist, in GLSL ───
 *
 * The steam fog along the shores (atmosphere/optics.ts MIST): its optical
 * depth in each direction from the camera, for the scene to lay over
 * whatever lies behind the stone (stage/shaders/scene.ts). Needs SET_GLSL
 * before it (each sheet's mean density).
 *
 * THE REFERENCE'S MIST, READ AS DIRECTIONS. The veil was read off the user's
 * frame, pixel by pixel, in the camera at rest, so it is addressed as the
 * photograph is (stage/shaders/backdrop.ts plateUvAt): by a ray's tan. It
 * stays on the shores on every screen shape, and leans with the scene.
 *
 * ALIVE BY THE SIMULATION: it thickens and thins with the fog sheets'
 * departure from their mean at this pixel — the bank behind the stone and
 * the far one — so the billows drifting over the lake drift through it, and
 * a hand that opens a lane in the bank opens one in the mist.
 *
 * AND DRIFTING THROUGH: broad soft patches (atmosphere/wisps.ts, motion.ts
 * MIST_MOTION.wisps) carried along the shores and rising, so something in
 * it always travels — nothing finer than the mist's own texture, and
 * zero-mean, so its look, where it lies and how thick are the reference's.
 * Two layers of them at two depths: the near one larger and faster, as
 * nearer mist is, so the two slide past each other.
 *
 * LIT AS A VOLUME (optics.ts MIST.volume; the user, 2026-10-16: "it feels a
 * white colour something moves, not like a real mist"). Lit by one flat
 * grey, a patch only changed how much of the trees it hid: a sheet sliding
 * over them. Now its light comes from the sky above, leaning toward the
 * open lake: its side toward that light is lit, its core and underside are
 * in its own shade, and the whole mist is a little brighter toward the
 * opening and up toward the sky, greyer low on the water. Out of the
 * patches' own slopes (wisps.ts), so no read is added.
 *
 * NAMED LEVELS (the veil is mipmapped: on a small screen its finer wisps
 * would shimmer, read at level 0; the patches are always magnified).
 */
import { MIST_MOTION } from "../motion";
import { MIST } from "../optics";

const WISPS = MIST_MOTION.wisps;
const VOLUME = MIST.volume;

/* Off (optics.ts MIST.on), the scene compiles without it: no mist, its
   light unchanged — and no samplers left unbound. */
const MIST_OFF_GLSL = /* glsl */ `
uniform vec4 uMistLook;
uniform vec3 uMistStone;
float mistDepth(vec3 ray, vec4 density, out float lit) {
  lit = 1.0;
  return 0.0;
}
`;

const MIST_ON_GLSL = /* glsl */ `
/* the veil: √(τ / τ at full), one channel */
uniform sampler2D uMistVeil;
/* the directions it covers (tan, the camera at rest): its left and top
   edges, and 1 / its width and height */
uniform vec4 uMistRect;
/* how much of it (0: none), τ at full, how far past its sides it is
   carried on, fading (share of its width), its light: from the fog in its
   own shadow (0) to the fog's glow over the lake (1) */
uniform vec4 uMistLook;
/* how far it follows the sheets' billows, the near bank's share of that,
   and the level the veil is read at */
uniform vec3 uMistMotion;
/* round the stone's foot (optics.ts MIST.stone): the share of the water's
   mist at its waterline, the steam's height (m), the share all the way up */
uniform vec3 uMistStone;
/* the drifting patches (atmosphere/wisps.ts), a layer each, far and near:
   their density, and its slope across and up */
uniform highp sampler2DArray uMistWisps;
/* where each layer has drifted to this moment, in tiles: far, near */
uniform vec4 uMistDrift;
/* how much they move the mist (0: none), and each layer's tiles a metre of
   the far shore's distance (the near layer's at its own, nearer one) */
uniform vec3 uMistWisp;
/* its light as a volume (optics.ts MIST.volume): how much a patch's side
   toward the light is lit, how much its core is shaded, and how much the
   whole mist leans brighter toward the open lake, and up */
uniform vec4 uMistVolume;

/* The patches at a direction (tan): their density, zero on average and ±1
   at one spread, and how far they face the light — the sky overhead,
   leaning toward the open lake — at the same spread. Laid out in metres on
   the shore the mist lies along — the left one farther — so the far
   shore's are smaller and slower; the near layer nearer still. */
vec2 mistWisps(vec2 t) {
  float shore = mix(${WISPS.distance[0].toFixed(1)}, ${WISPS.distance[1].toFixed(1)}, smoothstep(-0.2, 0.2, t.x));
  vec2 p = t * shore;
  vec3 far = textureLod(uMistWisps, vec3(p * uMistWisp.y + uMistDrift.xy, 0.0), 0.0).xyz;
  vec3 near = textureLod(uMistWisps, vec3(p * uMistWisp.z + uMistDrift.zw, 1.0), 0.0).xyz;
  vec2 light = normalize(vec2(${(-VOLUME.toward).toFixed(3)} * tanh((t.x - ${VOLUME.opening.toFixed(4)}) / 0.08), 1.0));
  const float W = ${WISPS.near.weight.toFixed(2)};
  /* Falling toward the light, a patch's side faces it. */
  return vec2(far.x + W * near.x, -dot(far.yz + W * near.yz, light)) * ${(1 / Math.sqrt(1 + WISPS.near.weight ** 2)).toFixed(4)};
}

/* The mist's optical depth along a ray from the camera; \`density\`: the fog
   sheets' local densities at this pixel; \`lit\`: its light here, as a share
   of its flat grey. */
float mistDepth(vec3 ray, vec4 density, out float lit) {
  lit = 1.0;
  if (uMistLook.x <= 0.0 || ray.z <= 0.0) return 0.0;
  vec2 t = ray.xy / ray.z;
  vec2 uv = vec2((t.x - uMistRect.x) * uMistRect.z, (uMistRect.y - t.y) * uMistRect.w);
  /* Past the reference's frame (a frame wider than it), its edge carried
     on and fading: none of it a little way out. */
  float past = max(max(-uv.x, uv.x - 1.0), 0.0);
  if (past >= uMistLook.z) return 0.0;
  float sides = 1.0 - smoothstep(0.0, uMistLook.z, past);
  float v = textureLod(uMistVeil, clamp(uv, 0.0, 1.0), uMistMotion.z).r;
  /* The billows' departure from their mean: zero on average. */
  float near = density.y / uSheetMean.y - 1.0;
  float far = density.z / uSheetMean.z - 1.0;
  /* Never thinned to nothing: where a wake pulls a bank thin in a line, the
     mist only thins (gone there, it tore in dark threads). */
  float breathe = max(1.0 + uMistMotion.x * mix(far, near, uMistMotion.y), 0.4);
  float tau = uMistLook.x * uMistLook.y * v * v * sides * breathe;
  /* THE SKY'S LEAN: brighter toward the open lake, where the most of the
     sky's light comes from behind it, and up toward the sky; greyer low on
     the water, under the rest of the bank. Smooth, as the light is. */
  float opening = (t.x - ${VOLUME.opening.toFixed(4)}) / ${VOLUME.width.toFixed(3)};
  lit += uMistVolume.z * (2.0 * exp(-opening * opening) - 1.0) + uMistVolume.w * clamp(t.y / ${VOLUME.height.toFixed(3)}, -1.0, 1.0);
  /* THE PATCHES MOVE ITS OPACITY'S ODDS, not its depth: the odds of a ray
     being stopped, e^τ − 1, × e^(amount · patches). Where the mist is thin
     that is its depth × the same; where it is thick, its depth ± a little.
     Scaled in depth, a trough tore a dense bank open to the trees (half of
     what hid them gone). Symmetric in the odds' log, so the still mist —
     the look the user kept — is the middle of its movement: as often a
     little thicker as a little thinner. (Kept to an average of the odds
     instead, the moving mist read ~10 levels thinner over the left shore.)
     Held still (the fit), no read. */
  if (uMistWisp.x > 0.0 && tau > 0.0) {
    vec2 patches = mistWisps(t);
    tau = log(1.0 + (exp(tau) - 1.0) * exp(uMistWisp.x * patches.x));
    /* LIT AS A VOLUME: the side toward the light bright, the dense core in
       its own shade. */
    lit *= clamp(1.0 + uMistVolume.x * patches.y - uMistVolume.y * patches.x, 0.5, 1.5);
  }
  return tau;
}
`;

export const MIST_GLSL = MIST.on ? MIST_ON_GLSL : MIST_OFF_GLSL;
