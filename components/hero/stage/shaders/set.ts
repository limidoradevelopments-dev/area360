/**
 * ─── Stage · the set's fog, in GLSL ───
 *
 * What the programs that draw the set share (stage/shaders/scene.ts, the
 * top): a hit, the fog sheets along a ray, and the fog over the photograph
 * — its departure from the average fog the photograph already holds, laid
 * over it by one law both ways.
 *
 * Needs CAMERA_GLSL, FOG_GLSL and FILM_GLSL (undevelop) before it.
 */
export const SET_GLSL = /* glsl */ `
/* the fog sheets: density per sheet; light on sheets 0–2 and the plain light */
uniform sampler2D uSheetDensity;
uniform sampler2D uSheetLight;
/* each sheet's average density: the fog the photograph already holds */
uniform vec4 uSheetMean;
/* how much of each sheet's departure from that average shows over the
   photograph, times the overall amount */
uniform vec4 uSheetLife;
uniform float uFogLife;
/* the most any patch may thicken or thin, as optical depth (soft limit) */
uniform float uFogReach;
/* aerial depth (atmosphere/optics.ts AERIAL): optical depth per metre, the
   depth it is zero at, the share kept nearer than that, the most it may add
   or take (soft limit) */
uniform vec4 uAerial;
/* soft blacks (atmosphere/optics.ts SOFT_BLACK): optical depth added at a
   black, by darkness squared; full nearer than y metres, gone by z */
uniform vec3 uSoftBlack;
/* the mist seen moving (atmosphere/optics.ts MIST_SEEN): its veil over the
   dark, its self-shading over the open fog, and where it fades in over the
   water (metres) */
uniform vec4 uMistSeen;

struct Hit {
  /* premultiplied */
  vec3 color;
  float alpha;
  /* depth along the ray (metres), to order it against the water */
  float depth;
};

Hit noHit() {
  Hit h;
  h.color = vec3(0.0);
  h.alpha = 0.0;
  h.depth = 1e6;
  return h;
}

/* A sheet's light: sheets 0–2 carry their own; the far sheet and the sky
   share the plain light. */
float lightOf(vec4 light, int k) {
  return k >= 3 ? light.w : light[k];
}

/* The fog between depths za and zb, across whichever sheets lie there. */
void fogSpan(inout vec3 color, inout float transmit, vec3 origin, vec3 ray, float za, float zb, float perDepth,
             vec4 density, vec4 light) {
  for (int k = 0; k < 4; k++) {
    float a = max(za, sheetStart(k));
    float b = min(zb, uSheetEdge[k]);
    fogBetween(color, transmit, origin, ray, k, a, b, perDepth, density[k], lightOf(light, k));
  }
}

/* The fog over the photograph between za and zb. Returns its DEPARTURE
   from its average, as optical depth (positive: denser than the fog the
   photograph holds), each sheet weighed by the average fog in front of it.
   Adds the glow of that fog, weighed the same way, to \`glow\` and \`weight\`
   (airOf turns them into the fog's colour): a reflection's fog is the sum
   of two stretches, the one to the water and the one beyond it. */
float fogDeparture(vec3 origin, vec3 ray, float za, float zb, float perDepth, vec4 density, vec4 light,
                   inout vec3 glow, inout float weight) {
  float departure = 0.0;
  float held = 0.0;
  for (int k = 0; k < 4; k++) {
    float a = max(za, sheetStart(k));
    float b = min(zb, uSheetEdge[k]);
    if (b <= a) continue;
    float zMid = 0.5 * (a + b);
    float yMid = origin.y + ray.y * ((zMid - origin.z) / ray.z);
    float share = (b - a) / (uSheetEdge[k] - sheetStart(k));
    float base = ((opticalDepthTo(b) - opticalDepthTo(a)) * liftAt(yMid) + uSheetVeil[k] * share) * perDepth;
    float front = exp(-held);
    departure += front * base * uSheetLife[k] * (density[k] - uSheetMean[k]);
    glow += front * base * fogRadiance(lightOf(light, k));
    weight += front * base;
    held += base * uSheetMean[k];
  }
  return departure * uFogLife;
}

/* The fog's colour from a gathered glow. A stretch past the last sheet
   gathers none; there the fog is the plain light's (the sky's). */
vec3 airOf(vec3 glow, float weight, vec4 light) {
  return weight > 1e-4 ? glow / weight : fogRadiance(light.w);
}

/* The photograph's light, with the fog's departure laid over it. A pixel of
   it is what stands there seen through the fog in front — T·thing +
   (1 − T)·air — so thicken that fog by a departure d and the part of the
   pixel that is not fog (air − photo) shows through e^(−d) of itself; thin
   it, and e^(+d). ONE LAW BOTH WAYS: fog drifting about its average leaves
   the forest, on average, as photographed. (A thinning that revealed less
   than a thickening hid hazed the whole forest by ~18 levels.)
   HOW FAR A PIXEL CAN COME FORWARD IS IN THE PIXEL: the sky, the fog's own
   glow, does not move at all, since there is nothing behind fog but more
   fog; and nothing clears past the photograph's own black, the darkest any
   of its trees prints, so a gap reveals the dark forest and never a hole
   darker than it. Softly limited (uFogReach): fog moves through a forest,
   it does not swallow it or strip it. \`gain\` returns how much of the
   photograph's own light comes through. */
vec3 throughFog(vec3 photo, vec3 air, float departure, float depth, out float gain) {
  /* Over the open sky the photograph's fog is smooth; there the movement is
     a breath, not a bank. */
  float far = smoothstep(250.0, 700.0, depth);
  departure = uFogReach * tanh(departure / uFogReach) * mix(1.0, 0.35, far);
  /* The still fog of distance, by the same law: far banks further in, near
     ones out. */
  float aerial = uAerial.x * (depth - uAerial.y);
  departure += uAerial.w * tanh(aerial * (aerial < 0.0 ? uAerial.z : 1.0) / uAerial.w);
  /* The near bank's darkest trees, a little further into the air. */
  float dark = clamp(1.0 - photo.g / max(air.g, 1e-4), 0.0, 1.0);
  departure += uSoftBlack.x * dark * dark * (1.0 - smoothstep(uSoftBlack.y, uSoftBlack.z, depth));
  gain = exp(-departure);
  vec3 c = air - (air - photo) * gain;
  /* A smooth floor at the photograph's black (or the pixel itself, if
     darker): the soft max of the two, so no contour where it takes hold. */
  float floor_ = min(photo.g, undevelop(0.0).g);
  float v = c.g - floor_;
  float k = 0.25 * floor_ + 1e-5;
  float r = sqrt(v * v + k * k);
  gain *= 0.5 * (1.0 + v / r);
  return c + 0.5 * (r - v);
}

/* The near bank of mist over light \`c\`: its density's departure from its
   mean, as an overcast afternoon shows it — over the dark, a veil of its
   light (denser: lighter); over the open fog, its self-shading (denser:
   greyer). Smooth wherever the density is: no lit tops, whose gradient drew
   hard bands. \`light.w\`: the light falling through the air here. */
vec3 mistSeen(vec3 c, vec4 density, vec4 light) {
  float m = clamp(density.y - uSheetMean.y, -0.7, 0.7);
  vec3 plain = fogRadiance(light.w);
  float open = clamp(c.g / max(plain.g, 1e-4), 0.0, 1.0);
  return max(c + m * (uMistSeen.x * (plain - c) - uMistSeen.y * open * plain), vec3(0.0));
}

/* The sheets where a reflected ray crosses the middle of each one's
   stretch, projected back into the frame. */
void sheetsAlong(vec3 origin, vec3 ray, float zEnd, out vec4 density, out vec4 light) {
  density = vec4(0.0);
  light = vec4(0.0);
  for (int k = 0; k < 4; k++) {
    float a = max(origin.z, sheetStart(k));
    float b = min(zEnd, uSheetEdge[k]);
    if (b <= a) continue;
    float zMid = 0.5 * (a + b);
    vec2 at = clamp(projectUv(origin + ray * ((zMid - origin.z) / ray.z)), 0.0, 1.0);
    density[k] = textureLod(uSheetDensity, at, 0.0)[k];
    vec4 l = textureLod(uSheetLight, at, 0.0);
    light[k] = k == 3 ? l.w : l[k];
  }
}
`;
