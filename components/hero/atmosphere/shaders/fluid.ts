/**
 * ─── Atmosphere · fluid shaders ───
 *
 * Stam's stable fluids on a grid of cells, in the order a step runs:
 *
 *   CURL        ω = ∂v/∂x − ∂u/∂y
 *   FORCE       vorticity confinement + wind + eddies + the hand's warmth
 *               and drag
 *   DIVERGENCE  ∇·u − s, where s is every breath (air being ADDED)
 *   SCALE       warm-start the pressure from last step's
 *   JACOBI ×N   ∇²p = ∇·u − s
 *   PROJECT     u −= ∇p, leaving ∇·u = s: incompressible except where
 *               someone is breathing
 *   ADVECT      carry velocity, fog and turbulence along u (semi-Lagrangian);
 *               turbulence mixes and thins the fog and decays; the fog heals
 *               toward its resting pattern
 *   CARRY       carry the billows' texture coordinates along u too
 *               (advected textures, Neyret 2003), so the fog's DETAIL rides
 *               the air: stirred fog churns, a warm hand's updraft lifts it
 *
 * HOW A HAND MOVES FOG (and why it is not a liquid). Fog is air carrying
 * droplets: it has almost no momentum of its own, and a hand does not push
 * it aside the way it pushes water. Moving through it, the hand leaves
 * TURBULENCE — kinetic energy in small, short-lived eddies that churn and
 * mix the fog around them, carried off on the wind and dying quickly in
 * stable air. So the hand's energy goes into a turbulent-kinetic-energy
 * field (k, in (cells/s)²), and k drives everything: eddies of speed
 * u′ = √k, mixing, a little thinning. Energy put in goes as the square of
 * the hand's speed, as kinetic energy does.
 *
 * Fluid texel: rg = velocity (cells/s), b = fog density (1 = resting mist),
 * a = turbulent kinetic energy. Half float and LINEAR: advection reads
 * between cells.
 *
 * Coordinates are cells, y up; a cell's centre is gl_FragCoord.
 */

import { SIMPLEX_3D } from "./noise";

export const MAX_BREATHS = 6;
export const MAX_STIRS = 4;

const HEADER = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;
out vec4 outColor;
`;

/* The resting fog: patches drifting with the wind, thicker near the ground.
   Shared by INIT (the first frame) and ADVECT (what parted mist heals to). */
const RESTING_FOG = /* glsl */ `
uniform vec2 uGrid;
uniform float uTime;
/* base, variation, frequency (per cell), evolve (per second) */
uniform vec4 uFog;
/* extra fog at the ground, share of the fog left at the top of the sky */
uniform vec2 uFogProfile;
/* horizontal stretch of fog features (stratified air lays them flat) */
uniform float uStretch;
uniform vec2 uDrift;

float restingFog(vec2 c) {
  vec2 q = (c - uDrift * uTime) * uFog.z * vec2(1.0 / uStretch, 1.0);
  float n = 0.65 * snoise(vec3(q, uTime * uFog.w))
          + 0.35 * snoise(vec3(q * 2.1 + 5.2, uTime * uFog.w * 1.7 + 4.0));
  float height = clamp(c.y / uGrid.y, 0.0, 1.0);
  float low = 1.0 - height;
  /* Fog lies low: it thins toward the sky and banks on the ground. */
  float thin = mix(1.0, uFogProfile.y, smoothstep(0.45, 1.0, height));
  return (uFog.x + uFog.y * n) * thin + uFogProfile.x * low * low;
}
`;

/* Every breath at once: divergence per second at this cell. */
const BREATHS = /* glsl */ `
#define MAX_BREATHS ${MAX_BREATHS}
uniform int uBreathCount;
/* x, y, sigma (cells), rate (per second, at the centre, this step) */
uniform vec4 uBreath[MAX_BREATHS];

float breathAt(vec2 c) {
  float s = 0.0;
  for (int i = 0; i < uBreathCount; i++) {
    vec2 d = c - uBreath[i].xy;
    float q = dot(d, d) / (2.0 * uBreath[i].z * uBreath[i].z);
    if (q < 12.0) s += uBreath[i].w * exp(-q);
  }
  return s;
}
`;

/* The wind here: the drift, stronger with height (wind shear — upper fog
   slides over lower fog). Air left alone relaxes toward THIS, not toward
   stillness: fog translates. */
const WIND_FIELD = /* glsl */ `
uniform vec2 uWindDrift;
uniform float uShear;
uniform float uWindHeight;

vec2 windAt(vec2 c) {
  return uWindDrift * (1.0 + uShear * (clamp(c.y / uWindHeight, 0.0, 1.0) - 0.5));
}
`;

/* Turbulence put in at points (a touch), energy per second at the centre. */
const STIRS = /* glsl */ `
#define MAX_STIRS ${MAX_STIRS}
uniform int uStirCount;
/* x, y, sigma (cells), energy per second at the centre, this step */
uniform vec4 uStir[MAX_STIRS];

float stirAt(vec2 c) {
  float s = 0.0;
  for (int i = 0; i < uStirCount; i++) {
    vec2 d = c - uStir[i].xy;
    float q = dot(d, d) / (2.0 * uStir[i].z * uStir[i].z);
    if (q < 12.0) s += uStir[i].w * exp(-q);
  }
  return s;
}
`;

/* A warm hand held in fog makes a thermal: a column of rising air above the
   palm, widening as it climbs. */
const PLUME = /* glsl */ `
/* hand x, y, width (cells), lift (cells/s², this step) */
uniform vec4 uPlume;
/* height (in widths), energy per second, thinning per second at the palm */
uniform vec3 uPlumeShape;

float plumeColumn(vec2 c) {
  if (uPlume.w <= 0.0 && uPlumeShape.y <= 0.0) return 0.0;
  float rise = c.y - uPlume.y;
  float width = uPlume.z * (1.0 + max(rise, 0.0) / (uPlume.z * 4.0));
  float dx = c.x - uPlume.x;
  return exp(-dx * dx / (2.0 * width * width))
       * smoothstep(-uPlume.z, uPlume.z, rise)
       * exp(-max(rise, 0.0) / (uPlume.z * uPlumeShape.x));
}

float plumePalm(vec2 c) {
  vec2 d = c - uPlume.xy;
  return exp(-dot(d, d) / (2.0 * uPlume.z * uPlume.z));
}
`;

/* The cursor's path this step, as a capsule. */
const WAKE = /* glsl */ `
uniform vec4 uWakeSegment;
/* sigma (0: no hand), velocity x, velocity y (cells/s), speed 0–1 */
uniform vec4 uWake;

/* The path's footprint, 0–1. Drag scales with the velocity in uWake.yz;
   turbulence and parting with the speed, uWake.w. */
float wakeAt(vec2 c) {
  if (uWake.x <= 0.0) return 0.0;
  vec2 pa = c - uWakeSegment.xy;
  vec2 ba = uWakeSegment.zw - uWakeSegment.xy;
  float t = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
  vec2 d = pa - ba * t;
  float q = dot(d, d) / (2.0 * uWake.x * uWake.x);
  return q < 12.0 ? exp(-q) : 0.0;
}
`;

const FETCH = /* glsl */ `
#define AT(tex, dx, dy) texelFetch(tex, clamp(p + ivec2(dx, dy), ivec2(0), textureSize(tex, 0) - 1), 0)
`;

export const INIT_FRAG = `${HEADER}
${SIMPLEX_3D}
${RESTING_FOG}
void main() {
  outColor = vec4(0.0, 0.0, restingFog(gl_FragCoord.xy), 0.0);
}
`;

export const CURL_FRAG = `${HEADER}
uniform sampler2D uFluid;
${FETCH}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float curl = 0.5 * ((AT(uFluid, 1, 0).y - AT(uFluid, -1, 0).y) - (AT(uFluid, 0, 1).x - AT(uFluid, 0, -1).x));
  outColor = vec4(curl, 0.0, 0.0, 1.0);
}
`;

export const FORCE_FRAG = `${HEADER}
uniform sampler2D uFluid;
uniform sampler2D uCurl;
uniform float uDt;
uniform float uTime;
uniform float uVorticity;
/* drift (cells/s), pull toward it (per second), current strength (cells/s²) */
uniform vec4 uWind;
/* current frequency (per cell), evolve (per second), vertical share */
uniform vec3 uCurrents;
/* eddy force per unit u′ (per second), eddy frequency (per cell), churn
   (per second) */
uniform vec3 uEddies;
uniform float uWakeGain;
${SIMPLEX_3D}
${WAKE}
${WIND_FIELD}
${PLUME}
${FETCH}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec2 c = gl_FragCoord.xy;
  vec4 fluid = AT(uFluid, 0, 0);
  vec2 u = fluid.xy;

  /* Vorticity confinement: push along the curl's ridges, restoring the small
     eddies that semi-Lagrangian advection diffuses away. */
  float l = abs(AT(uCurl, -1, 0).x), r = abs(AT(uCurl, 1, 0).x);
  float b = abs(AT(uCurl, 0, -1).x), t = abs(AT(uCurl, 0, 1).x);
  vec2 ridge = vec2(r - l, t - b);
  ridge /= length(ridge) + 1e-5;
  vec2 acc = uVorticity * AT(uCurl, 0, 0).x * vec2(ridge.y, -ridge.x);

  /* Wind: a gentle pull toward the drift, and wandering currents. The
     pressure solve discards their divergent part, so noise is safe here. */
  acc += (windAt(c) - u) * uWind.z;
  vec2 q = (c - uWind.xy * uTime) * uCurrents.x * vec2(0.5, 1.0);
  float e = uTime * uCurrents.y;
  acc += uWind.w * vec2(snoise(vec3(q, e)), uCurrents.z * snoise(vec3(q + 31.7, e + 11.0)));

  /* Eddies: wherever there is turbulent energy, small churning eddies of
     speed ~u′ = √k. A noise force re-seeded quickly in time; the pressure
     solve keeps only its swirling part, so the churn never pumps. */
  float eddy = sqrt(max(fluid.a, 0.0));
  if (eddy > 0.05) {
    vec2 qe = c * uEddies.y;
    float te = uTime * uEddies.z;
    acc += uEddies.x * eddy * vec2(snoise(vec3(qe, te)), snoise(vec3(qe + 19.3, te + 7.1)));
  }

  /* Warmth: a held hand's thermal lifts the air in a column above it. */
  acc.y += uPlume.w * plumeColumn(c);

  /* The wake: a passing hand draws a little air along behind it
     (entrainment). Gentle — fog is not shoved, it is drawn. */
  acc += uWake.yz * uWakeGain * wakeAt(c);

  outColor = vec4(u + acc * uDt, fluid.zw);
}
`;

export const DIVERGENCE_FRAG = `${HEADER}
uniform sampler2D uFluid;
${BREATHS}
${FETCH}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float div = 0.5 * ((AT(uFluid, 1, 0).x - AT(uFluid, -1, 0).x) + (AT(uFluid, 0, 1).y - AT(uFluid, 0, -1).y));
  /* Subtracting the breath means the projection leaves exactly that much
     divergence behind: air added where someone breathes, nowhere else. */
  outColor = vec4(div - breathAt(gl_FragCoord.xy), 0.0, 0.0, 1.0);
}
`;

export const SCALE_FRAG = `${HEADER}
uniform sampler2D uSource;
uniform float uScale;
void main() {
  outColor = texelFetch(uSource, ivec2(gl_FragCoord.xy), 0) * uScale;
}
`;

export const JACOBI_FRAG = `${HEADER}
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
${FETCH}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float sum = AT(uPressure, 1, 0).x + AT(uPressure, -1, 0).x + AT(uPressure, 0, 1).x + AT(uPressure, 0, -1).x;
  outColor = vec4((sum - AT(uDivergence, 0, 0).x) * 0.25, 0.0, 0.0, 1.0);
}
`;

export const PROJECT_FRAG = `${HEADER}
uniform sampler2D uFluid;
uniform sampler2D uPressure;
${FETCH}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 fluid = AT(uFluid, 0, 0);
  vec2 grad = 0.5 * vec2(AT(uPressure, 1, 0).x - AT(uPressure, -1, 0).x, AT(uPressure, 0, 1).x - AT(uPressure, 0, -1).x);
  outColor = vec4(fluid.xy - grad, fluid.zw);
}
`;

/**
 * The billows' texture coordinates, in cells: two sets (rg, ba), each carried
 * by the air and snapped back to the identity once per cycle, half a cycle
 * apart. Carried forever, a coordinate field shears into streaks; the volume
 * pass fades each set out just before it snaps, so the snap is never seen.
 */
export const CARRY_INIT_FRAG = `${HEADER}
void main() {
  outColor = vec4(gl_FragCoord.xy, gl_FragCoord.xy);
}
`;

export const CARRY_FRAG = `${HEADER}
uniform sampler2D uCarry;
uniform sampler2D uFluid;
uniform vec2 uGrid;
uniform float uDt;
/* 1 where that set snaps back to the identity this step */
uniform vec2 uReset;
${WIND_FIELD}
void main() {
  vec2 c = gl_FragCoord.xy;
  /* Only the air's departure from the MEAN wind is carried; the volume
     pass adds the mean wind itself analytically. What is left in still
     weather is the shear — upper fog overtaking lower — and the carry
     cycle bounds it to a few seconds' worth, so it draws the banks out
     without ever smearing them flat. */
  vec2 u = texelFetch(uFluid, ivec2(c), 0).xy - uWindDrift;
  vec4 carried = texture(uCarry, (c - uDt * u) / uGrid);
  if (uReset.x > 0.5) carried.xy = c;
  if (uReset.y > 0.5) carried.zw = c;
  outColor = carried;
}
`;

export const ADVECT_FRAG = `${HEADER}
uniform sampler2D uFluid;
uniform float uDt;
/* velocity kept this step, share of the gap to the resting fog closed */
uniform vec2 uKeep;
/* turbulent energy kept this step, mixing per unit u′, thinning per unit u′ */
uniform vec3 uTurbulence;
/* energy per second a hand puts in at full speed */
uniform float uWakeStir;
uniform float uWakeThinning;
/* the resting hand's thinning, per second */
uniform float uWakePresence;
${SIMPLEX_3D}
${RESTING_FOG}
${BREATHS}
${STIRS}
${WAKE}
${WIND_FIELD}
${PLUME}
void main() {
  vec2 c = gl_FragCoord.xy;
  vec2 u = texelFetch(uFluid, ivec2(c), 0).xy;
  vec2 from = (c - uDt * u) / uGrid;
  vec4 back = texture(uFluid, from);

  /* Motion dies back into the wind, not into stillness. (Decaying toward
     zero while a weak force pulled toward the wind left the fog drifting at
     an eighth of the wind: it boiled in place instead of travelling.) */
  vec2 wind = windAt(c);
  vec2 velocity = wind + (back.xy - wind) * uKeep.x;

  /* Turbulence rides the wind and decays; the hand feeds it — a touch, the
     path of a moving hand (as the square of its speed: kinetic energy), the
     warm column above a held one. */
  float speed = uWake.w;
  float energy = back.a * uTurbulence.x
    + uDt * (stirAt(c) + uWakeStir * speed * speed * wakeAt(c) + uPlumeShape.y * plumeColumn(c));
  float eddy = sqrt(max(energy, 0.0));

  /* Turbulent mixing: stirred fog blends with the fog around it. This, not
     a push, is what softens and opens it where a hand has been. */
  vec2 texel = 1.5 / uGrid;
  float around = 0.25 * (texture(uFluid, from + vec2(texel.x, 0.0)).z + texture(uFluid, from - vec2(texel.x, 0.0)).z
                       + texture(uFluid, from + vec2(0.0, texel.y)).z + texture(uFluid, from - vec2(0.0, texel.y)).z);
  float fog = mix(back.z, around, clamp(uTurbulence.y * eddy * uDt, 0.0, 0.5));
  fog += (restingFog(c) - fog) * uKeep.y;
  /* Thinned where air is added (continuity: dρ/dt = −ρ∇·u), a little where
     it churns (clearer air is mixed in), a touch under a hand, and at a
     warm palm (the droplets evaporate). */
  fog *= exp(-uDt * (breathAt(c) + uTurbulence.z * eddy
                     + (uWakeThinning * speed + uWakePresence) * wakeAt(c) + uPlumeShape.z * plumePalm(c)));

  outColor = vec4(velocity, max(fog, 0.0), max(energy, 0.0));
}
`;
