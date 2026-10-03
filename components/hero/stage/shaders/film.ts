/**
 * ─── Stage · the film, in GLSL ───
 *
 * Linear radiance in, display values out: exposure, the sRGB encode, the
 * print curve with its toe and shoulder, then — on the print, as filters
 * over a print are — the foot's burn and the burn toward the rim — the
 * paper it is printed on, and grain.
 * The order is the order a real frame goes through them.
 *
 * `undevelop` runs it backwards for the one thing that is ALREADY a print:
 * the backdrop photograph, which the scene pass reads (shaders/backdrop.ts).
 */
export const FILM_GLSL = /* glsl */ `
/* stops */
uniform float uExposure;
/* the print: pivot grey, contrast below it, contrast above it, toe */
uniform vec4 uPrint;
/* the print's shoulder: where the brights start rolling off */
uniform float uKnee;
/* the photograph's print value i/64 → the encoded value that prints as the
   design graded it (engine.ts unprintTable): the grade and the print curve
   inverted, in one table */
uniform float uUnprint[65];

vec3 encodeSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

/* The print curve on encoded values (engine.ts printCurve is the same). */
vec3 printCurve(vec3 c) {
  vec3 e = c - uPrint.x;
  c = uPrint.x + e * mix(vec3(uPrint.y), vec3(uPrint.z), smoothstep(-0.08, 0.08, e));
  c = max(c, 0.0);
  /* The shoulder: past the knee, a tanh that meets white only at infinity. */
  float room = 1.0 - uKnee;
  vec3 over = max(c - uKnee, 0.0);
  c = min(c, uKnee) + room * tanh(over / room);
  return c + uPrint.w * (1.0 - smoothstep(0.0, 0.25, c));
}

/* Linear radiance → print values (before the filters over the print). */
vec3 develop(vec3 radiance) {
  return printCurve(encodeSrgb(max(radiance * exp2(uExposure), 0.0)));
}

/* develop, backwards, for something that is ALREADY a print: the backdrop
   photograph. The radiance that develops to the value the design graded
   \`display\` to — so the photograph comes out of the film exactly as the
   design has it, and everything the stage adds to it (its fog, its
   reflection, the stone) passes through one film with it. Position-free: every
   filter that knows where it is in the frame acts on the print, after. */
vec3 undevelop(float display) {
  float x = clamp(display, 0.0, 1.0) * 64.0;
  int i = min(int(x), 63);
  float c = mix(uUnprint[i], uUnprint[i + 1], x - float(i));
  float lin = c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4);
  return vec3(lin * exp2(-uExposure));
}
`;

/**
 * The filters over the print and the grain: only the film pass, at the
 * screen's own resolution, runs these.
 */
export const PRINT_GLSL = /* glsl */ `
/* the foot's burn: where it begins (share of the height from the top), and
   its stops per unit of depth below that, squared */
uniform vec2 uFoot;
/* the burn toward the rim: its amount, and where the light pools (share
   across, share down from the top) */
uniform vec3 uVignette;
/* the afternoon paper (stage/optics.ts FILM.paper): black, white, gamma */
uniform vec3 uPaper;
/* grain amount, grain fps, time, grain size (CSS px) */
uniform vec4 uGrain;

float grainHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

/* Soft-edged grain: a hashed lattice, smoothly interpolated, so a clump has
   a size and no square corners at any resolution. Zero mean. */
float grainNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = grainHash(i);
  float b = grainHash(i + vec2(1.0, 0.0));
  float c = grainHash(i + vec2(0.0, 1.0));
  float d = grainHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) - 0.5;
}

/* \`px\` is this pixel in CSS px, so the grain has the same size on every
   screen: it belongs to the film, not to the display. */
vec3 finish(vec3 c, vec2 uv, vec2 px) {
  float fromTop = 1.0 - uv.y;
  float below = max(fromTop - uFoot.x, 0.0);
  c *= exp2(-uFoot.y * below * below);
  float d = length(vec2((uv.x - uVignette.y) / 0.9, (fromTop - uVignette.z) / 0.8));
  c *= 1.0 - uVignette.x * smoothstep(0.35, 1.05, d);
  /* The paper the whole print is made on. */
  c = uPaper.x + (uPaper.y - uPaper.x) * pow(clamp(c, 0.0, 1.0), vec3(uPaper.z));

  /* Re-seeded at film rate, strongest in the midtones as on real stock
     (the paper white and the deepest black carry least). Two octaves: the
     clumps, and the finer grain inside them. */
  float frame = mod(floor(uGrain.z * uGrain.y), 997.0);
  vec2 seed = frame * vec2(37.0, 17.0);
  vec2 g = px / uGrain.w;
  float n = grainNoise(g + seed) + 0.6 * grainNoise(g * 2.03 + seed.yx + 11.0);
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float amount = uGrain.x * (0.35 + 2.6 * lum * (1.0 - lum));
  /* ×1.65: the two interpolated octaves have ~0.25 of spread (sd); this
     brings them to a triangular grain's 0.41, so \`uGrain.x\` keeps its
     meaning. */
  c += n * 1.65 * amount;
  return clamp(c, 0.0, 1.0);
}
`;
