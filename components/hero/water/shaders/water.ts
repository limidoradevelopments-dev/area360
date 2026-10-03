/**
 * ─── Water, in GLSL ───
 *
 * The lake is the plane y = 0, moved by a sum of real waves (water/
 * motion.ts). A ray that meets it splits: a share reflects (Fresnel, at the
 * angle the waves tilt the surface to), and the rest goes into dark water.
 * The reflected ray is traced on through the set from the point it left the
 * water (stage/shaders/scene.ts).
 *
 * WHAT A PIXEL CANNOT SEE, IT STILL FEELS. Toward the horizon one pixel
 * covers metres of water, and centimetre ripples summed at its centre
 * would only alias into crawling noise. So each wave is filtered by the
 * pixel's footprint on the water (a Gaussian, per axis: it is long in depth
 * and narrow across), and what is filtered out is not thrown away: its
 * slope variance comes back as ROUGHNESS, which blurs the reflection
 * instead. Near the foot of the frame the ripples are drawn; far out they
 * are the soft, vertically smeared reflection a calm lake gives at grazing
 * angles.
 */

import { GRAVITY, LAPS, SWELL_COUNT, TENSION, UNDULATION_COUNT, WAVES } from "../motion";

export const WATER_GLSL = /* glsl */ `
#define WAVE_COUNT ${WAVES.length}
#define SWELL_COUNT ${SWELL_COUNT}
/* the swell and the undulation: everywhere, unlike the ripples */
#define BROAD_COUNT ${SWELL_COUNT + UNDULATION_COUNT}
#define LAP_COUNT ${LAPS.length}

/* the body of the lake (linear), reflectance at normal incidence */
uniform vec3 uWaterBody;
uniform float uWaterR0;
/* each wave: wavenumber (rad/m, x and z), amplitude (m), phase */
uniform vec4 uWaves[WAVE_COUNT];
/* seconds of the lake's own time */
uniform float uWaterTime;
/* swell, undulation and ripple gains (1 = designed) */
uniform vec3 uWaterGain;
/* cat's paws: patch size (m), drift (m/s, along the wind), coverage,
   softness; then the wind direction (unit, xz) and the glass between */
uniform vec4 uCatsPaws;
uniform vec3 uWind;
/* how far into it the eye sees: attenuation per metre of the look, per
   metre of depth for the daylight, and what of the sky's light a surface
   just under it sends back up (water/optics.ts) */
uniform vec3 uWaterClarity;
/* how much more the stone's reflection is moved by a tilt than its short
   path gives (water/optics.ts WATER.waver) */
uniform float uSubjectWaver;
/* the lake lapping at the stone: wavenumber (rad/m), amplitude (m), phase;
   then how far it reaches (m) and its gain (1 = designed) */
uniform vec3 uLaps[LAP_COUNT];
uniform vec2 uLapFade;

/* Where a ray meets the water, as a depth (metres); far away if it rises. */
float waterDepth(vec3 origin, vec3 ray) {
  return ray.y < 0.0 ? origin.z + (origin.y / -ray.y) * ray.z : 1e6;
}

/* Schlick's Fresnel, from the cosine of the angle of incidence. */
float waterReflectance(float cosine) {
  float m = 1.0 - clamp(cosine, 0.0, 1.0);
  float m2 = m * m;
  return uWaterR0 + (1.0 - uWaterR0) * m2 * m2 * m;
}

float pawHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float pawNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(pawHash(i), pawHash(i + vec2(1.0, 0.0)), u.x),
             mix(pawHash(i + vec2(0.0, 1.0)), pawHash(i + vec2(1.0, 1.0)), u.x), u.y);
}

/* 0 on glass, 1 under a paw. Two octaves, the finer one drifting a little
   faster: a paw frays at its edges as it moves. */
float catsPaw(vec2 p) {
  vec2 drift = uWind.xy * uCatsPaws.y * uWaterTime;
  vec2 q = (p - drift) / uCatsPaws.x;
  float n = 0.65 * pawNoise(q) + 0.35 * pawNoise(q * 2.3 - drift * 0.05 + 17.0);
  float edge = 1.0 - uCatsPaws.z;
  return smoothstep(edge - uCatsPaws.w, edge + uCatsPaws.w, n);
}

/* The surface normal at \`p\` (x, z on the water), seen by a pixel whose
   footprint there has standard deviation \`sigma\` (metres, x and z).
   \`roughness\` returns the slope variance the pixel could not resolve. */
vec3 waterNormal(vec2 p, vec2 sigma, out vec2 roughness) {
  float paw = mix(uWind.z, 1.0, catsPaw(p));
  vec2 slope = vec2(0.0);
  roughness = vec2(0.0);
  for (int i = 0; i < WAVE_COUNT; i++) {
    vec4 w = uWaves[i];
    float k = length(w.xy);
    float omega = sqrt(${GRAVITY.toFixed(3)} * k + ${TENSION.toExponential(3)} * k * k * k);
    float amp = w.z * (i < SWELL_COUNT ? uWaterGain.x : i < BROAD_COUNT ? uWaterGain.y : uWaterGain.z * paw);
    vec2 ks = w.xy * sigma;
    float seen = exp(-0.5 * dot(ks, ks));
    float phase = dot(w.xy, p) - omega * uWaterTime + w.w;
    /* h = A cos(phase): its gradient is −A k sin(phase). */
    vec2 grad = amp * w.xy;
    slope -= grad * sin(phase) * seen;
    roughness += 0.5 * grad * grad * (1.0 - seen * seen);
  }
  return normalize(vec3(-slope.x, 1.0, -slope.y));
}

/* The lapping at a point \`d\` metres out from the stone's waterline,
   \`away\` the unit direction out: its slope (x, z), filtered by the pixel's
   footprint as the waves are, what is filtered out added to \`roughness\`. */
vec2 lapSlope(float d, vec2 away, vec2 sigma, inout vec2 roughness) {
  float fade = uLapFade.y * exp(-d / uLapFade.x);
  vec2 slope = vec2(0.0);
  if (fade < 1e-3) return slope;
  for (int i = 0; i < LAP_COUNT; i++) {
    vec3 w = uLaps[i];
    float omega = sqrt(${GRAVITY.toFixed(3)} * w.x + ${TENSION.toExponential(3)} * w.x * w.x * w.x);
    vec2 ks = w.x * away * sigma;
    float seen = exp(-0.5 * dot(ks, ks));
    vec2 grad = w.y * fade * w.x * away;
    slope -= grad * sin(w.x * d - omega * uWaterTime + w.z) * seen;
    roughness += 0.5 * grad * grad * (1.0 - seen * seen);
  }
  return slope;
}
`;
