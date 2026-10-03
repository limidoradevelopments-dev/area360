/**
 * ─── Stage · after the scene ───
 *
 * The scene pass leaves linear light in a half-float target, at the scene's
 * resolution (engine.ts RENDER). From it:
 *
 *   DOWN, UP     the diffusion: the frame softened over five ever-wider
 *                levels (a dual-filter pyramid: half, quarter … a 32nd) and
 *                summed back, so the glow has a soft core and a long tail,
 *                as a lens's does
 *   FILM         at the screen's own resolution: the scene's light, the
 *                photograph's detail put back at every device pixel, the
 *                diffusion, the film (film.ts), the filters over the print
 *                and the grain
 */

import { BACKDROP_GLSL } from "./backdrop";
import { CAMERA_GLSL } from "./camera";
import { FILM_GLSL, PRINT_GLSL } from "./film";

/* One level down: the centre and four diagonal neighbours, a half texel out,
   so each bilinear tap averages four texels (13 texels for 5 taps). */
export const DOWN_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSource;
/* the source's texel */
uniform vec2 uTexel;
void main() {
  vec3 s = 4.0 * texture(uSource, vUv).rgb;
  s += texture(uSource, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  s += texture(uSource, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  s += texture(uSource, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  s += texture(uSource, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  outColor = vec4(s / 8.0, 1.0);
}
`;

/* One level up: the coarser level spread by a tent of eight taps, laid over
   this level by \`uSpread\` — how much of the glow comes from twice as far. */
export const UP_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uCoarse;
uniform sampler2D uFine;
/* the coarse level's texel */
uniform vec2 uTexel;
uniform float uSpread;
void main() {
  vec2 h = uTexel;
  vec3 s = texture(uCoarse, vUv + vec2(-2.0 * h.x, 0.0)).rgb;
  s += texture(uCoarse, vUv + vec2(2.0 * h.x, 0.0)).rgb;
  s += texture(uCoarse, vUv + vec2(0.0, -2.0 * h.y)).rgb;
  s += texture(uCoarse, vUv + vec2(0.0, 2.0 * h.y)).rgb;
  s += 2.0 * texture(uCoarse, vUv + vec2(-h.x, -h.y)).rgb;
  s += 2.0 * texture(uCoarse, vUv + vec2(h.x, -h.y)).rgb;
  s += 2.0 * texture(uCoarse, vUv + vec2(-h.x, h.y)).rgb;
  s += 2.0 * texture(uCoarse, vUv + vec2(h.x, h.y)).rgb;
  outColor = vec4(mix(texture(uFine, vUv).rgb, s / 12.0, uSpread), 1.0);
}
`;

export const FILM_FRAG = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 vUv;
out vec4 outColor;

${CAMERA_GLSL}
${FILM_GLSL}
${BACKDROP_GLSL}
${PRINT_GLSL}

/* the scene: linear light, and (alpha) how much of it is the photograph's
   light seen straight — d(light)/d(photograph) */
uniform sampler2D uScene;
/* the diffusion, half the scene's size */
uniform sampler2D uGlow;
/* the diffusion's strength */
uniform float uDiffusion;
/* the halation over the photograph: how much of the brighter air beside a
   dark edge spills over it (stage/optics.ts FILM.halation) */
uniform float uHalation;
/* device px per scene px: above 1, the photograph's finer detail is put
   back here */
uniform float uUpscale;

void main() {
  /* The photograph's footprint for this device pixel, taken here, in uniform
     control flow, where screen derivatives are defined. */
  vec3 ray = cameraRay(vUv);
  vec2 onPlate = plateUvAt(ray);
  vec2 dx = dFdx(onPlate);
  vec2 dy = dFdy(onPlate);

  vec4 scene = texture(uScene, vUv);
  vec3 light = scene.rgb;

  /* THE DETAIL PUT BACK. The scene drew the photograph through its own,
     coarser pixel; here it is read again through this pixel's, and the
     difference — everything between the two — is added in proportion to
     how much of the photograph the pixel shows. Only the photograph has
     detail finer than the scene's pixel: the fog and the lake do not. */
  if (uUpscale > 1.01 && scene.a > 0.002) {
    float depth;
    vec2 uv = locateBackdrop(uCamPos, ray, depth);
    float fine = textureGrad(uPlate, uv, dx, dy).r;
    /* The scene's pixel, and the bilinear stretch of it up to this one: 1.4×
       its footprint (measured: a half-resolution scene then matches a full
       one's sharpness to a few percent, at a quarter of its cost). */
    float coarse = textureGrad(uPlate, uv, dx * uUpscale * 1.4, dy * uUpscale * 1.4).r;
    light += scene.a * (undevelop(fine) - undevelop(coarse)) * plateCover(uv);
  }

  /* The diffusion falls on what the stage draws; the photograph carries its
     own lens's (stage/optics.ts FILM.diffusion). */
  vec3 glow = texture(uGlow, vUv).rgb;
  light = mix(light, glow, uDiffusion * (1.0 - clamp(scene.a, 0.0, 1.0)));
  /* Over the photograph only the bright side spills: where a dark bank
     stands against lighter trees or the fog, a little of their light
     softens its edge — never the other way, which would grey the fog. */
  light += uHalation * clamp(scene.a, 0.0, 1.0) * max(glow - light, vec3(0.0));

  outColor = vec4(finish(develop(light), vUv, vUv * uView), 1.0);
}
`;
