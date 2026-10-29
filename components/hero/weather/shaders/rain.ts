/**
 * ─── Weather · the rain, in GLSL ───
 *
 * Fine rain as the reference prints it (weather/optics.ts RAIN): pale
 * dashes falling at a lean, in three layers of distance, laid on the
 * finished print (weather/rain.ts draws it over the film pass's output).
 *
 * DRAWN AS DROPS, NOT SEARCHED FOR. Each layer is a lattice of slots
 * carried down the frame at its fall, at most one drop to a slot; each slot
 * is one instance, a quad round its dash, collapsed to nothing where the
 * slot holds no drop. Searched for at every pixel instead (the first build,
 * in the film pass), the GPU ran every layer at every pixel whatever the
 * early exits: +1.1 ms a frame at 4K. Drawn, it costs what its few
 * thousand small quads cover.
 *
 * A slot leaves the frame at the foot as new ones arrive at the top, each
 * hashed afresh by where it is in the lattice: the rain never repeats.
 */

const HASH_GLSL = /* glsl */ `
float rainHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`;

export const RAIN_VERT = /* glsl */ `#version 300 es
precision highp float;

/* the layer: its slot, its fall (both in frame heights, the fall a
   second), its dash's length and width (frame heights) */
uniform vec4 uRainFall;
/* the layer: cover, lift, rise, under (weather/optics.ts RAIN), and a seed */
uniform vec4 uRainLook;
uniform float uRainSeed;
/* how much rain (0 none, 1 designed), its clock (seconds), the lean (a
   tangent), and one device pixel in frame heights */
uniform vec4 uRain;
/* the frame's aspect; the lattice's first column and row drawn, and how
   many columns a row has */
uniform vec4 uRainGrid;
/* how long a drop is seen, seconds: shortest, longest (motion.ts) */
uniform vec2 uRainLife;
/* where the horizon is in the frame this frame (frame heights from the
   top): it moves as the camera tilts in its arrival */
uniform float uRainHorizon;

out vec2 vLocal;
out float vLift;
out float vWidth;
out float vLength;

${HASH_GLSL}

void main() {
  vec2 corner = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1)) * 2.0 - 1.0;
  float columns = uRainGrid.w;
  vec2 slot = uRainGrid.yz + vec2(mod(float(gl_InstanceID), columns), floor(float(gl_InstanceID) / columns));
  float cell = uRainFall.x;
  /* SEEN FOR A LITTLE OF ITS FALL: a slot's drop catches the light for a
     few seconds, brightening and fading; then the slot is dealt again —
     another drop, or none. So the rain comes a drop at a time, never a
     stream. */
  float life = mix(uRainLife.x, uRainLife.y, rainHash(slot + uRainSeed + 7.7));
  float age = uRain.y / life + rainHash(slot + uRainSeed + 2.9);
  float cycle = floor(age);
  float seen = sin(3.14159 * (age - cycle));
  seen *= seen;
  float h = rainHash(slot + uRainSeed + cycle * 13.7);
  /* Placed clear of the slot's edges. */
  float w = max(uRainFall.w, 1.5 * uRain.w);
  float margin = 0.5 * uRainFall.z + w + uRain.w;
  vec2 at = slot * cell + margin + vec2(rainHash(slot + uRainSeed + 3.7), rainHash(slot + uRainSeed + 9.1)) * (cell - 2.0 * margin);
  /* Carried down the frame, as it falls. */
  vec2 lean = vec2(uRain.z, 1.0);
  vec2 p = at + lean * (uRainFall.y * uRain.y);
  /* Thickest just over the horizon, thinning up the sky, fewer over the
     water: the NUMBER of drops, not their light — the reference's specks
     are as pale high up as low down, only rarer. A drop falling into the
     thicker band comes out of the fog over a little of its fall, not at
     once. */
  float up = uRainHorizon - p.y;
  float reach = up > 0.0 ? exp(-up / uRainLook.z) : mix(1.0, uRainLook.w, smoothstep(0.0, 0.04, -up));
  float present = smoothstep(h, h + 0.06, uRainLook.x * reach) * seen;
  float bright = mix(0.5, 1.0, rainHash(slot + uRainSeed + 5.3 + cycle * 13.7)) * uRainFall.w / w;
  vLift = uRain.x * uRainLook.y * bright * present;
  vWidth = w;
  vLength = uRainFall.z;
  /* The quad round the dash, along its lean: none where there is no drop. */
  vec2 dir = normalize(lean);
  vec2 across = vec2(dir.y, -dir.x);
  vec2 half_ = vec2(0.5 * uRainFall.z + w + uRain.w, w + uRain.w) * step(1e-3, vLift);
  vLocal = corner * half_;
  vec2 q = p + dir * vLocal.x + across * vLocal.y;
  /* Frame heights from the top-left → clip space. */
  gl_Position = vec4(q.x / uRainGrid.x * 2.0 - 1.0, 1.0 - q.y * 2.0, 0.0, 1.0);
}
`;

export const RAIN_FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec2 vLocal;
in float vLift;
in float vWidth;
in float vLength;
out vec4 outColor;

void main() {
  /* A soft core, as a speck of light through fog is: exp(−2r²), near
     enough, and nothing past r = 2 (r in half-widths, from the dash). */
  float along = max(abs(vLocal.x) - 0.5 * vLength, 0.0);
  float r2 = (along * along + vLocal.y * vLocal.y) / (0.25 * vWidth * vWidth);
  float core = max(1.0 - 0.25 * r2, 0.0);
  core *= core;
  core *= core;
  outColor = vec4(vec3(vLift * core), 0.0);
}
`;
