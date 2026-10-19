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
 *                plant and the photograph's detail put back at every device
 *                pixel, the diffusion, the film (film.ts), the filters over
 *                the print and the grain
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
/* The plant (bloom/bloom.ts), on a screen finer than the scene: drawn at
   this pass's own pixels over a rect (px: corner, size; size 0 when not),
   and the picture at the scene's pixels the scene laid in (its rect's
   corner in the scene, px; that texture's size), the scene's size (px). */
uniform sampler2D uBloomFine;
uniform sampler2D uBloomCoarse;
uniform vec4 uBloomFineRect;
uniform vec4 uBloomCoarseRect;
uniform vec2 uSceneSize;
/* The light the flowers hold, in the fog round them (bloom/bloom.ts drawHalo):
   its rect's corner in the scene (px) and scene px a texel, and how much of
   it to add (0: none); the texture's size, and the share of it in use
   (texels). */
uniform sampler2D uBloomHalo;
uniform vec4 uBloomHaloRect;
uniform vec4 uBloomHaloSize;
/* the flowers' own print (bloom/optics.ts BLOOM.print): its white, its
   rise and how much; then where its whites begin and are full (its light
   against the air's round it) */
uniform vec3 uFlowerPrint;
uniform vec2 uFlowerTone;
/* the heads' own box, scene px (x0, y0, x1, y1): their print falls only in it */
uniform vec4 uFlowerBox;
/* the cloth's own print (bloom/optics.ts BLOOM.print.cloth): its white, and
   where it begins and is full; its box (scene px); and where the air round
   the heads is read (uv), against which it is measured */
uniform vec3 uClothPrint;
uniform vec4 uClothBox;
uniform vec2 uFlowerAir;

void main() {
  /* The photograph's footprint for this device pixel, taken here, in uniform
     control flow, where screen derivatives are defined. */
  vec3 ray = cameraRay(vUv);
  vec2 onPlate = plateUvAt(ray);
  vec2 dx = dFdx(onPlate);
  vec2 dy = dFdy(onPlate);

  vec4 scene = texture(uScene, vUv);
  vec3 light = scene.rgb;
  float straight = scene.a;

  /* THE PLANT PUT BACK. The scene laid the plant in at its own pixels, and
     stretched here it went soft; here it is laid in again at this pixel's.
     The scene's light is the plant's light over what lies behind it, as
     much as the plant leaves of that (bloom/bloom.ts: light + leave ·
     behind): so what lies behind is the scene's light with the coarse
     plant taken back out, and the fine plant is laid over that instead —
     as a difference, so that where the two agree nothing moves. (The
     little fog in front of the plant is in the scene's light already.) */
  if (uBloomFineRect.z > 0.0) {
    ivec2 at = ivec2(gl_FragCoord.xy) - ivec2(uBloomFineRect.xy);
    if (all(greaterThanEqual(at, ivec2(0))) && all(lessThan(at, ivec2(uBloomFineRect.zw)))) {
      vec4 fine = texelFetch(uBloomFine, at, 0);
      vec2 c = vUv * uSceneSize - uBloomCoarseRect.xy;
      vec4 coarse = textureLod(uBloomCoarse, c / uBloomCoarseRect.zw, 0.0);
      vec3 behind = clamp((light - coarse.rgb) / max(coarse.a, 0.08), vec3(0.0), vec3(2.0));
      light = max(light + (fine.rgb - coarse.rgb) + (fine.a - coarse.a) * behind, vec3(0.0));
      straight = clamp(scene.a * fine.a / max(coarse.a, 0.08), 0.0, 1.0);
    }
  }

  /* THE LIGHT THE FLOWERS HOLD: their rays' light, spread into the fog
     round them (bloom/optics.ts BLOOM.glow) — in the air round them and
     between their rays, and only a little over the flowers themselves:
     laid evenly over them, it softened them as if out of focus. */
  if (uBloomHaloRect.w > 0.0) {
    vec2 t = (vUv * uSceneSize - uBloomHaloRect.xy) / uBloomHaloRect.z;
    if (all(greaterThanEqual(t, vec2(0.0))) && all(lessThan(t, uBloomHaloSize.zw))) {
      vec2 c = vUv * uSceneSize - uBloomCoarseRect.xy;
      float leaves = 1.0;
      if (all(greaterThanEqual(c, vec2(0.0))) && all(lessThan(c, uBloomCoarseRect.zw))) {
        leaves = textureLod(uBloomCoarse, c / uBloomCoarseRect.zw, 0.0).a;
      }
      light += uBloomHaloRect.w * mix(0.25, 1.0, leaves) * textureLod(uBloomHalo, t / uBloomHaloSize.xy, 0.0).rgb;
    }
  }

  /* THE DETAIL PUT BACK. The scene drew the photograph through its own,
     coarser pixel; here it is read again through this pixel's, and the
     difference — everything between the two — is added in proportion to
     how much of the photograph the pixel shows. Only the photograph has
     detail finer than the scene's pixel: the fog and the lake do not. */
  if (uUpscale > 1.01 && straight > 0.002) {
    float depth;
    vec2 uv = locateBackdrop(uCamPos, ray, depth);
    float fine = textureGrad(uPlate, uv, dx, dy).r;
    /* The scene's pixel, and the bilinear stretch of it up to this one: 1.4×
       its footprint (measured: a half-resolution scene then matches a full
       one's sharpness to a few percent, at a quarter of its cost). */
    float coarse = textureGrad(uPlate, uv, dx * uUpscale * 1.4, dy * uUpscale * 1.4).r;
    light += straight * (undevelop(fine) - undevelop(coarse)) * plateCover(uv);
  }

  /* The diffusion falls on what the stage draws; the photograph carries its
     own lens's (stage/optics.ts FILM.diffusion). */
  vec3 glow = texture(uGlow, vUv).rgb;
  light = mix(light, glow, uDiffusion * (1.0 - clamp(straight, 0.0, 1.0)));
  /* Over the photograph only the bright side spills: where a dark bank
     stands against lighter trees or the fog, a little of their light
     softens its edge — never the other way, which would grey the fog. */
  light += uHalation * clamp(straight, 0.0, 1.0) * max(glow - light, vec3(0.0));

  /* THE FLOWERS, PRINTED ON THEIR OWN (bloom/optics.ts BLOOM.print). Lit
     as they truly are, their whites carry about the fog's own light, and
     the print lays the fog at the top of its curve, where everything near
     it is pressed together: printed with the frame, they dissolved into the
     fog round them, solid and finely shaded as they are (underexposed,
     every ray shows). So, as a printer dodges the one white thing the eye
     should go to, their whites get a curve of their own: their light
     against the air's round them (the diffusion's blur of the frame),
     rolled off toward \`white\` — the shading kept, each ray's turn and
     channel; laid over the frame's print where the rays are, as much as
     they are white (the discs and stems keep the frame's print: the dark
     centres). AND THE CLOTH they are tied with, the same way to a lower
     white: printed with the frame it was the fog's grey, a card, not
     cotton; measured against the air round the heads where its own is
     darker (the stone's face behind the tail), its folds keep their
     shade. */
  vec2 flower = vec2(0.0);
  vec2 onPlant = vUv * uSceneSize - uBloomCoarseRect.xy;
  vec2 onScene = vUv * uSceneSize;
  bool inFlower = all(greaterThanEqual(onScene, uFlowerBox.xy)) && all(lessThanEqual(onScene, uFlowerBox.zw));
  bool inCloth = all(greaterThanEqual(onScene, uClothBox.xy)) && all(lessThanEqual(onScene, uClothBox.zw));
  if (uFlowerPrint.x > 0.0 && (inFlower || inCloth) && all(greaterThanEqual(onPlant, vec2(0.0))) && all(lessThan(onPlant, uBloomCoarseRect.zw))) {
    vec4 plant = textureLod(uBloomCoarse, onPlant / uBloomCoarseRect.zw, 0.0);
    if (uBloomFineRect.z > 0.0) {
      ivec2 at = ivec2(gl_FragCoord.xy) - ivec2(uBloomFineRect.xy);
      if (all(greaterThanEqual(at, ivec2(0))) && all(lessThan(at, ivec2(uBloomFineRect.zw)))) plant = texelFetch(uBloomFine, at, 0);
    }
    const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
    /* The picture holds the plant's light over what it leaves of what lies
       behind (bloom/bloom.ts: light + leave · behind): its alpha is what is
       LEFT, its cover one less. */
    float cover = 1.0 - plant.a;
    float own = dot(plant.rgb, LUMA) / max(cover, 1e-3);
    float air = dot(textureLod(uGlow, vUv, 0.0).rgb, LUMA);
    vec3 print = vec3(uFlowerPrint.x, uFlowerTone);
    if (!inFlower) {
      air = max(air, dot(textureLod(uGlow, uFlowerAir, 0.0).rgb, LUMA));
      print = uClothPrint;
    }
    float r = clamp(own / max(air, 1e-4), 0.0, 2.0);
    float white = smoothstep(print.y, print.z, r);
    flower = vec2(print.x * (1.0 - exp(-uFlowerPrint.y * r)), cover * white * uFlowerPrint.z);
  }

  outColor = vec4(finish(develop(light), vUv, vUv * uView, flower), 1.0);
}
`;
