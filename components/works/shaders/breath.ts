/**
 * ─── Works · the breath, in GLSL ───
 *
 * One card's glass (breath.ts): the film of condensation the visitor's
 * breath lays on it, and the droplets at the film's margin, drawn over
 * the card's picture by a canvas laid in its frame.
 *
 * TWO WAYS, ONE PROGRAM. With the card's picture uploaded (`uHasImage`),
 * it draws what is behind the glass FROSTED under the film, the film's
 * light over it: the canvas covers the picture where the film is. Without
 * it (no picture yet, the frame's empty card, or a picture still being
 * uploaded), it lays only the film's light and the droplets' shade OVER
 * what the page draws: on a flat card, the same picture.
 *
 * PREMULTIPLIED: the canvas is composited as src + dst·(1 − a), so the
 * droplets' glints add light where nothing is covered.
 *
 * COSTS NOTHING AT REST: drawn only while a puff lives, over the box the
 * live puffs cover (breath.ts scissors to it); the rest of the canvas
 * cleared.
 */

import { BREATH } from "../motion";
import { BREATH_LOOK } from "../optics";

const f = (value: number) => (Number.isInteger(value) ? `${value}.0` : `${value}`);

export const BREATH_VERT = /* glsl */ `#version 300 es
/* One triangle over the canvas: vUv 0–1 across it (y up), past it 2. */
out vec2 vUv;
void main() {
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = corner;
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`;

const D = BREATH_LOOK.droplets;

export const BREATH_FRAG = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

#define PUFFS ${BREATH.puffs}

in vec2 vUv;
out vec4 outColor;

/* The card's picture frame, CSS px; device px a CSS px. */
uniform vec2 uSize;
uniform float uPx;
/* The live puffs, worked out on the CPU from their ages (breath.ts): where
   (CSS px from the frame's top left), radius now, what is laid at its
   core; the hand's way (unit), stretched along it, thickness evaporated. */
uniform vec4 uPuffA[PUFFS];
uniform vec4 uPuffB[PUFFS];
uniform int uPuffCount;
/* The glass's own pattern: its seed (a card's), its scale (CSS px), the
   wipe's stretch, its contrast. */
uniform vec4 uGlass;
/* The picture behind: whether there is one, its mapping from the frame's
   CSS px (cover, and the parallax's offset now) and its texel size. */
uniform sampler2D uImage;
uniform int uHasImage;
uniform vec4 uMap;
uniform vec2 uTexel;

const float LIGHT = ${f(BREATH_LOOK.light)};
const float VEIL = ${f(BREATH_LOOK.veil)};
const float KAPPA = ${f(BREATH_LOOK.kappa)};
const float EDGE = ${f(BREATH_LOOK.edge)};
const float RIM = ${f(BREATH_LOOK.rim)};
const float RIM_SLOPE = ${f(BREATH_LOOK.rimSlope)};
const float FROST = ${f(BREATH_LOOK.frost)};
const float BEND = ${f(BREATH_LOOK.bend)};
const float DROP_SIZE = ${f(D.size)};
const vec2 DROP_RADIUS = vec2(${f(D.radius[0])}, ${f(D.radius[1])});
const float DROP_DARK = ${f(D.dark)};
const float DROP_GLINTING = ${f(D.glinting)};
const float WARP = ${f(BREATH_LOOK.glass.warp)};
const float DROP_LIGHT = ${f(D.light)};
const float DROP_PAST = ${f(D.past)};
const float DROP_GRAIN = ${f(D.grain)};

/* An integer hash (pcg2d, Jarzynski & Olano 2020): never the
   fract(sin()) one, which repeats along diagonals and loses its digits at
   fine scales (the hero's stone, stone/noise.ts). */
uvec2 pcg2d(uvec2 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * 1664525u;
  v.y += v.x * 1664525u;
  v ^= v >> 16u;
  v.x += v.y * 1664525u;
  v.y += v.x * 1664525u;
  v ^= v >> 16u;
  return v;
}

vec2 hash22(vec2 cell, uint seed) {
  uvec2 h = pcg2d(uvec2(ivec2(cell)) + uvec2(seed, seed * 7919u));
  return vec2(h) * (1.0 / 4294967296.0);
}

float valueNoise(vec2 x, uint seed) {
  vec2 i = floor(x);
  vec2 t = fract(x);
  vec2 u = t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
  float a = hash22(i, seed).x;
  float b = hash22(i + vec2(1.0, 0.0), seed).x;
  float c = hash22(i + vec2(0.0, 1.0), seed).x;
  float d = hash22(i + vec2(1.0, 1.0), seed).x;
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

/* The glass: where it holds a breath more, where less — a wiped pane's
   strokes, slanted, under a finer smudge. 0–1, ~0.5 on average. */
float glassAt(vec2 p, uint seed) {
  vec2 q = p / uGlass.y;
  q = vec2(q.x * 0.94 + q.y * 0.34, q.y * 0.94 - q.x * 0.34);
  q.x /= uGlass.z;
  return 0.55 * valueNoise(q, seed) + 0.3 * valueNoise(q * 2.07 + 5.3, seed + 1u) + 0.15 * valueNoise(p / uGlass.y * 4.3, seed + 2u);
}

/* What is behind the glass, frosted by \`level\` (mip levels): six taps
   round a ring a little short of the level's own reach, and the middle,
   at a level below — a mip level alone draws its texels as diamonds. */
vec3 behind(vec2 uv, float level) {
  float lod = max(level - 1.0, 0.0);
  vec3 sum = textureLod(uImage, uv, lod).rgb;
  if (level > 0.25) {
    vec2 reach = uTexel * exp2(level) * 0.55;
    const vec2 RING[6] = vec2[6](vec2(1.0, 0.0), vec2(0.5, 0.866), vec2(-0.5, 0.866), vec2(-1.0, 0.0), vec2(-0.5, -0.866), vec2(0.5, -0.866));
    for (int k = 0; k < 6; k++) sum += textureLod(uImage, uv + RING[k] * reach, lod).rgb;
    sum /= 7.0;
  }
  return sum;
}

void main() {
  /* The frame's CSS px, y down as the page's. */
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uSize;
  uint seed = uint(uGlass.x);
  float glass = mix(1.0 - uGlass.w, 1.0 + uGlass.w, glassAt(p, seed));
  /* Where a puff lays its breath: through the glass's warp, so no outline
     is a circle. */
  vec2 w = p / (uGlass.y * 1.7);
  vec2 laidAt = p + (vec2(valueNoise(w, seed + 5u), valueNoise(w + 17.3, seed + 6u)) - 0.5) * (2.0 * WARP * uGlass.y);

  /* THE FILM: every puff's deposit here, less what has evaporated since,
     summed; and the margin — the least-gone puff that laid anything here,
     how far past its edge it is (negative: gone). */
  float film = 0.0;
  float margin = -1.0;
  for (int i = 0; i < PUFFS; i++) {
    if (i >= uPuffCount) break;
    vec4 a = uPuffA[i];
    vec4 b = uPuffB[i];
    vec2 d = laidAt - a.xy;
    float along = dot(d, b.xy) / b.z;
    float across = b.x * d.y - b.y * d.x;
    float q = (along * along + across * across) / (a.z * a.z);
    /* Past three sigma (a Gaussian's e^(−q), σ = r/√2): nothing. */
    if (q > 4.5) continue;
    float laid = a.w * exp(-q) * glass;
    float left = laid - b.w;
    film += max(left, 0.0);
    if (laid > 0.03) margin = max(margin, left);
  }

  /* The film's light from above: its thickness rising toward the light
     (up the page: window y is up) brightens it, falling darkens it. Read
     before anything branches. */
  vec2 slope = vec2(dFdx(film), dFdy(film)) * uPx;
  float lit = 1.0 + RIM * clamp(-slope.y * RIM_SLOPE, -1.0, 1.0);

  /* THE DROPLETS: one to a cell of the glass, the nearest of nine. */
  vec2 dp = p / DROP_SIZE;
  vec2 cell = floor(dp);
  vec2 inCell = fract(dp);
  float nearest = 9.0;
  vec2 toNearest = vec2(0.0);
  vec2 nearestCell = cell;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 h = hash22(cell + o, seed + 11u);
      vec2 r = o + 0.15 + h * 0.7 - inCell;
      float d2 = dot(r, r);
      if (d2 < nearest) {
        nearest = d2;
        toNearest = r;
        nearestCell = cell + o;
      }
    }
  }
  vec2 own = hash22(nearestCell, seed + 23u);
  float radius = mix(DROP_RADIUS.x, DROP_RADIUS.y, own.x);
  float aa = 0.7 / (uPx * DROP_SIZE);
  float drop = 1.0 - smoothstep(radius - aa, radius + aa, sqrt(nearest));
  /* Where in the droplet (−1–1, y down): lit at its top, a little left. */
  vec2 s = -toNearest / max(radius, 1e-3);
  vec2 g = s - vec2(-0.25, -0.45);
  float glint = drop * exp(-dot(g, g) * 9.0) * step(1.0 - DROP_GLINTING, own.x);
  /* A droplet lasts a little past the film's edge — the larger the
     longer — and is seen most at the margin, where the film breaks up. */
  float lasts = smoothstep(-DROP_PAST * (0.4 + own.x), 0.0, margin);
  float breaking = lasts * (1.0 - smoothstep(0.0, EDGE * 2.0, margin));
  float grain = 1.0 + DROP_GRAIN * (drop - 0.35);

  float cover = smoothstep(0.0, EDGE, film);
  float veil = cover * (1.0 - exp(-film * grain * KAPPA)) * VEIL;
  vec3 light = vec3(LIGHT * lit);
  float shade = drop * breaking * DROP_DARK;
  vec3 glints = vec3(glint * breaking * DROP_LIGHT);

  /* A dither under a level, so a slow veil over a flat card never bands. */
  float dither = (hash22(gl_FragCoord.xy, 97u).x - 0.5) / 255.0;

  if (uHasImage == 1) {
    vec2 uv = p * uMap.xy + uMap.zw + slope * BEND * uMap.xy;
    /* In black and white, as the page draws the picture (works.css: a
       full greyscale, the same weights). */
    vec3 seen = vec3(dot(behind(uv, cover * FROST), vec3(0.2126, 0.7152, 0.0722)));
    vec3 col = mix(seen, light, veil) * (1.0 - shade);
    float alpha = max(cover, shade);
    outColor = vec4(col * alpha + glints + dither, alpha);
  } else {
    /* Over the page: the film's light at the veil's share, the droplets'
       shade as black over it. */
    float alpha = 1.0 - (1.0 - veil) * (1.0 - shade);
    outColor = vec4(light * veil + glints + dither, alpha);
  }
}
`;
