/**
 * ─── 404 · GLSL both passes share ───
 *
 * The camera (the hero's convention, hero/stage/shaders/camera.ts: a ray
 * is the lens's axis turned, never normalised there), value noise read
 * from a lattice texture (the hero's lesson, hero/stone/noise.ts: a hash
 * in the shader drew a woven pattern and cost more), and the print's
 * transfer curve.
 */

export const HEAD_GLSL = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
`;

export const CAMERA_GLSL = /* glsl */ `
/* the frame (CSS px), the lens (CSS px), where its axis meets the frame
   (uv, y up), where the camera is and how it is turned (camera → world) */
uniform vec2 uView;
uniform float uFocal;
uniform vec2 uCenter;
uniform vec3 uCamPos;
uniform mat3 uCamRot;

vec3 cameraRay(vec2 uv) {
  return uCamRot * vec3((uv - uCenter) * uView, uFocal);
}
`;

/** The lattice's size (texels): scene/engine.ts makes it. */
export const NOISE_SIZE = 256;

export const NOISE_GLSL = /* glsl */ `
/* a random value a texel, ${NOISE_SIZE}², repeating */
uniform sampler2D uNoise;

/* Value noise, 0–1: the smoothstep folded into the coordinate, so one
   filtered read is the whole interpolation. */
float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  f = f * f * (3.0 - 2.0 * f);
  return textureLod(uNoise, (i + f + 0.5) / ${NOISE_SIZE}.0, 0.0).r;
}

/* In three dimensions: two slices of the plane, a row apart. */
float noise3(vec3 p) {
  float iz = floor(p.z);
  float fz = p.z - iz;
  fz = fz * fz * (3.0 - 2.0 * fz);
  vec2 slice = vec2(37.0, 17.0);
  return mix(noise2(p.xy + slice * iz), noise2(p.xy + slice * (iz + 1.0)), fz);
}
`;

/**
 * THE FLOWERS' DEPTH: the hero's flower program's own perspective depth
 * (hero/bloom/shaders/bloom.ts project: 5–20 m), so the stone traced into
 * the same picture (shaders/set.ts) writes depths the flowers test against.
 */
export const FLOWER_DEPTH = { near: 5, far: 20 } as const;

export const DEPTH_GLSL = /* glsl */ `
/* A world point's depth in the picture, as the hero's flower program
   writes it. */
float depthOf(vec3 p) {
  float z = (transpose(uCamRot) * (p - uCamPos)).z;
  const float n = ${FLOWER_DEPTH.near.toFixed(1)};
  const float f = ${FLOWER_DEPTH.far.toFixed(1)};
  float ndc = ((f + n) / (f - n) * z - 2.0 * f * n / (f - n)) / z;
  return clamp(0.5 * ndc + 0.5, 0.0, 1.0);
}
`;

/**
 * THE HERO'S LIGHT INTO THIS PRINT (scene/optics.ts LOOK.print): the hero's
 * stone and flowers are lit in the hero's own units and printed by its
 * film; here one curve does it — luminance only, as the hero's print is
 * monochrome — a scale, a power and a lift, registered on the hero's own
 * frame.
 */
export const HERO_PRINT_GLSL = /* glsl */ `
uniform vec3 uPrint;
vec3 heroToPrint(vec3 c) {
  float l = dot(max(c, 0.0), vec3(0.2126, 0.7152, 0.0722));
  return vec3(uPrint.x * pow(l, uPrint.y) + uPrint.z);
}
`;

export const PRINT_GLSL = /* glsl */ `
vec3 toPrint(vec3 c) {
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

vec3 toLight(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

float toLight1(float c) {
  return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4);
}
`;
