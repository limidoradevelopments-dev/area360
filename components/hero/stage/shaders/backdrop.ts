/**
 * ─── Stage · the backdrop, in GLSL ───
 *
 * The photograph of the shores and its depth (stage/layers.ts BACKDROP):
 * where a ray meets it, what it shows there, and where a reflected ray meets
 * it. Needs CAMERA_GLSL and FILM_GLSL before it.
 *
 * THE PHOTOGRAPH IS SEEN FROM THE CAMERA AT REST. The camera leans a few
 * centimetres; a pixel's point on the photograph then moves by its depth —
 * a few pixels at most, nearer things more — which is the parallax inside
 * the forest. Found by fixed-point steps: a guess at the depth, the point
 * there along the ray, the depth the photograph has at that point.
 *
 * IT ENDS. Past its sides there is no photograph; the camera closes in
 * rather than look there (stage/camera.ts), and only a frame wider than it
 * can close in for ever reaches its edges — where it fades into the fog
 * (plateCover), never into a copy of itself.
 */
export const BACKDROP_GLSL = /* glsl */ `
/* the photograph: B&W print values, rows top-down, mipmapped */
uniform sampler2D uPlate;
/* its depth (red: depthNear / z) and its land (green: 1 shore and sky,
   0 its own lake) */
uniform sampler2D uBackdropDepth;
/* texels per tan across and up, as shares of its width and height; the
   horizon's row, as a share of its height; metres at an inverse depth of 1 */
uniform vec4 uPlateGeo;
/* the lens's axis on it (u), and how wide its side edges fade (u) */
uniform vec2 uPlateAxis;
/* the nearest any of its land stands (metres): a reflected ray cannot meet
   the shore nearer than this, so its march starts there */
uniform float uBackdropNearest;

vec2 plateUvOfTan(vec2 t) {
  return vec2(uPlateAxis.x + t.x * uPlateGeo.x, uPlateGeo.z - t.y * uPlateGeo.y);
}

/* How much photograph there is at uv: 1 inside, 0 past its sides. */
float plateCover(vec2 uv) {
  return smoothstep(0.0, uPlateAxis.y, uv.x) * smoothstep(0.0, uPlateAxis.y, 1.0 - uv.x);
}

/* A world point → the photograph, through the camera at rest. */
vec2 plateUv(vec3 p) {
  return plateUvOfTan(vec2(p.x, p.y - uEyeHeight) / p.z);
}

/* What lies at the far end of a direction: the photograph's sky. */
vec2 plateUvAt(vec3 dir) {
  return plateUvOfTan(dir.xy / dir.z);
}

/* Its depth (metres) and land at uv. */
vec2 backdropAt(vec2 uv) {
  vec2 s = textureLod(uBackdropDepth, uv, 0.0).rg;
  return vec2(uPlateGeo.w / max(s.r, 1e-4), s.g);
}

/* Where a camera ray meets the photograph; \`depth\` returns how far. */
vec2 locateBackdrop(vec3 origin, vec3 ray, out float depth) {
  vec2 uv = plateUvAt(ray);
  depth = backdropAt(uv).x;
  for (int i = 0; i < 2; i++) {
    uv = plateUv(origin + ray * ((depth - origin.z) / ray.z));
    depth = backdropAt(uv).x;
  }
  return uv;
}

/* The photograph's light at uv, through a footprint (texture derivatives):
   its print value undone through the film (film.ts undevelop). */
vec3 plateRadiance(vec2 uv, vec2 dx, vec2 dy) {
  return undevelop(textureGrad(uPlate, uv, dx, dy).r);
}

/* A reflected ray against the photograph. A ray's image on the photograph is
   a straight line in 1/z, so it is marched in even steps of 1/z — even on
   screen — from the nearest shore out to infinity, until it passes behind
   the photograph's land; then halved six times onto it. Returns uv there;
   \`depth\` returns how far. */
vec2 reflectBackdrop(vec3 origin, vec3 ray, out float depth) {
  const int STEPS = 40;
  float zStart = max(origin.z, uBackdropNearest);
  float w0 = 1.0 / zStart;
  float front = w0;
  float behind = 0.0;
  for (int i = 1; i <= STEPS; i++) {
    float w = w0 * (1.0 - float(i) / float(STEPS));
    float z = 1.0 / max(w, 1e-6);
    vec2 b = backdropAt(plateUv(origin + ray * ((z - origin.z) / ray.z)));
    if (b.y > 0.5 && b.x <= z) {
      behind = w;
      break;
    }
    front = w;
  }
  for (int j = 0; j < 6; j++) {
    float w = 0.5 * (front + behind);
    float z = 1.0 / max(w, 1e-6);
    vec2 b = backdropAt(plateUv(origin + ray * ((z - origin.z) / ray.z)));
    if (b.y > 0.5 && b.x <= z) behind = w;
    else front = w;
  }
  depth = 1.0 / max(behind, 1e-6);
  return behind > 0.0 ? plateUv(origin + ray * ((depth - origin.z) / ray.z)) : plateUvAt(ray);
}
`;
