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

import { LAPS, RETURNS, RHYTHM_COUNT, RIPPLES_DRAWN, SWELL_COUNT, UNDULATION_COUNT, WAVES } from "../motion";

export const WATER_GLSL = /* glsl */ `
#define WAVE_COUNT ${WAVES.length}
#define SWELL_COUNT ${SWELL_COUNT}
/* the swell and the undulation: everywhere, unlike the ripples */
#define BROAD_COUNT ${SWELL_COUNT + UNDULATION_COUNT}
#define LAP_COUNT ${LAPS.length}
#define RETURN_COUNT ${RETURNS.length}
/* the undulation's longest waves, whose height sets the lapping's rhythm */
#define RHYTHM_COUNT ${RHYTHM_COUNT}

/* the body of the lake (linear), reflectance at normal incidence */
uniform vec3 uWaterBody;
uniform float uWaterR0;
/* each wave: wavenumber (rad/m, x and z), amplitude (m), and its phase
   NOW (rad): its start less its angular speed times the lake's time —
   the speed by the dispersion relation, worked out once a frame on the
   CPU (stage/uniforms.ts), not at every pixel of every pass */
uniform vec4 uWaves[WAVE_COUNT];
/* seconds of the lake's own time */
uniform float uWaterTime;
/* swell, undulation and ripple gains (1 = designed; what the long exposure
   averages is no longer drawn: water/motion.ts exposure) */
uniform vec3 uWaterGain;
/* the long exposure's smear, as slope variance per axis: of the undulation
   (everywhere), and of the ripples (under a cat's paw) */
uniform vec2 uWaterSmear;
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
/* the lowest a reflected ray may dip, as a share of its mirror elevation */
uniform float uMinElevation;
/* the lake lapping at the stone: its rings — wavenumber (rad/m),
   amplitude (m), phase now (as the waves') — and the lake's short waves it
   throws back — wavenumber (rad/m, x and z), amplitude (m), phase now;
   then how far they reach (m), their gain (1 = designed), the share a face
   the returned waves leave keeps, and how far the undulation's height
   lifts them (a share per metre of it) */
uniform vec3 uLaps[LAP_COUNT];
uniform vec4 uReturns[RETURN_COUNT];
uniform vec4 uLapFade;

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
   \`roughness\` returns the slope variance the pixel could not resolve;
   \`smear\`, the variance the long exposure averaged (water/motion.ts
   exposure), kept apart: it spreads the shores' reflections, not the
   stone's (surface.ts). */
vec3 waterNormal(vec2 p, vec2 sigma, out vec2 roughness, out vec2 smear) {
#if ${RIPPLES_DRAWN ? 1 : 0}
  float paw = mix(uWind.z, 1.0, catsPaw(p));
#else
  /* No ripples (water/motion.ts RIPPLES_DRAWN): the paws, which only ever
     scaled them and their smear (here 0), move nothing. */
  float paw = 1.0;
#endif
  smear = vec2(uWaterSmear.x + uWaterSmear.y * paw);
  vec2 slope = vec2(0.0);
  roughness = vec2(0.0);
  for (int i = 0; i < WAVE_COUNT; i++) {
    vec4 w = uWaves[i];
    float amp = w.z * (i < SWELL_COUNT ? uWaterGain.x : i < BROAD_COUNT ? uWaterGain.y : uWaterGain.z * paw);
    vec2 ks = w.xy * sigma;
    float seen = exp(-0.5 * dot(ks, ks));
    float phase = dot(w.xy, p) + w.w;
    /* h = A cos(phase): its gradient is −A k sin(phase). */
    vec2 grad = amp * w.xy;
    slope -= grad * sin(phase) * seen;
    roughness += 0.5 * grad * grad * (1.0 - seen * seen);
  }
  return normalize(vec3(-slope.x, 1.0, -slope.y));
}

/* The lapping at \`p\` (x, z on the water), \`d\` metres out from the stone's
   waterline, \`away\` the unit direction out there: its slope (x, z),
   filtered by the pixel's footprint as the waves are, what is filtered out
   added to \`roughness\`. Two parts (water/motion.ts lapping):
   THE RINGS, running out from the faces, alike all round — as they were.
   THE LAKE'S WAVES THROWN BACK (lapping.returns). Each is one of the
   lake's short waves, k, and the field the stone sends back
   leaves its waterline with the wave's own phase there (a wall reflects a
   wave whole): k's part along the wall kept, its part across it turned
   outward. Off a face it runs into (k·n < 0) that is the mirror image,
   k − 2(k·n)n, the two crossing in the wall's cross-hatch; past a face it
   leaves, the wave going on out, at the lee's share. \`away\` is the
   distance's own gradient — a face's normal before it, radial round a
   corner — so a corner sends arcs and nothing is cut where the two meet.
   One form for both: the outward turn is |k·n| − k·n. */
vec2 lapSlope(vec2 p, float d, vec2 away, vec2 sigma, inout vec2 roughness) {
  float fade = uLapFade.y * exp(-d / uLapFade.x);
  vec2 slope = vec2(0.0);
  if (fade < 1e-3) return slope;
  for (int i = 0; i < LAP_COUNT; i++) {
    vec3 w = uLaps[i];
    vec2 ks = w.x * away * sigma;
    float seen = exp(-0.5 * dot(ks, ks));
    vec2 grad = w.y * fade * w.x * away;
    slope -= grad * sin(w.x * d + w.z) * seen;
    roughness += 0.5 * grad * grad * (1.0 - seen * seen);
  }
  /* The undulation's height where this water meets the stone, over its
     spread: short waves steepen on its crests and slacken in its troughs,
     so each of its bands reaching the stone lifts them there. Never
     reversed: past the trough's depth they are only gone. */
  vec2 wall = p - away * d;
  float height = 0.0;
  for (int i = BROAD_COUNT - RHYTHM_COUNT; i < BROAD_COUNT; i++) {
    vec4 w = uWaves[i];
    height += w.z * cos(dot(w.xy, wall) + w.w);
  }
  float back = fade * max(1.0 + uLapFade.w * height, 0.0);
  for (int i = 0; i < RETURN_COUNT; i++) {
    vec4 w = uReturns[i];
    float kn = dot(w.xy, away);
    float turn = abs(kn) - kn;
    vec2 k = w.xy + turn * away;
    /* Whole off a face it meets, the lee's share past one it leaves:
       eased between over the last 30° of grazing. */
    float meets = mix(uLapFade.z, 1.0, smoothstep(0.0, 0.5, -kn * inversesqrt(dot(w.xy, w.xy))));
    vec2 ks = k * sigma;
    float seen = exp(-0.5 * dot(ks, ks));
    vec2 grad = w.z * back * meets * k;
    slope -= grad * sin(dot(w.xy, p) + w.w + turn * d) * seen;
    roughness += 0.5 * grad * grad * (1.0 - seen * seen);
  }
  return slope;
}
`;
