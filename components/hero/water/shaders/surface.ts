/**
 * ─── Water · the lake under a pixel, in GLSL ───
 *
 * Where a camera ray meets the lake, and what the surface does to it there:
 * the waves' normal with the lapping off the stone, the reflected ray and
 * its spread, Fresnel — and the ray the stone's reflection is drawn along.
 * Three programs need it (the stone's slots in the lake, the lake's
 * photograph, the composite: stage/shaders/scene.ts), so it is one function,
 * and the three see one lake.
 *
 * Needs WATER_GLSL and STONE_GLSL before it.
 */
export const SURFACE_GLSL = /* glsl */ `
struct LakeSurface {
  /* where the ray meets the water (y = 0), and the ray, normalised */
  vec3 surface;
  vec3 d;
  /* the surface's normal and the slope variance the pixel cannot resolve,
     the lapping included */
  vec3 n;
  vec2 roughness;
  /* the reflected ray (never let dip below uMinElevation), its spread
     (radians across and up), its path per metre of depth, and the share of
     light the water reflects */
  vec3 r;
  vec2 rough;
  float perDepth;
  float reflectance;
  /* the stone's reflection: its ray and spread (see lakeSurface) */
  vec3 wavering;
  vec2 roughSubject;
};

LakeSurface lakeSurface(vec3 origin, vec3 ray, float zWater, vec2 sigma) {
  LakeSurface s;
  vec3 surface = origin + ray * ((zWater - origin.z) / ray.z);
  surface.y = 0.0;
  vec3 d = normalize(ray);
  vec2 roughness;
  vec3 n = waterNormal(surface.xz, sigma, roughness);
  /* The lake's own tilt and blur, kept apart: the stone's reflection is
     drawn from them (below). */
  vec3 lakeTilt = reflect(d, n);
  vec2 lakeRoughness = roughness;
  /* The lake laps at the stone: small wavelets thrown back off its faces,
     dying within half a metre (water/motion.ts lapping). */
  vec2 away;
  float fromStone = stoneWaterline(surface.xz, away);
  vec3 tilted = n / n.y;
  tilted.xz -= lapSlope(fromStone, away, sigma, roughness);
  n = normalize(tilted);
  vec3 r = reflect(d, n);
  r.y = max(r.y, uMinElevation * -d.y);
  s.surface = surface;
  s.d = d;
  s.n = n;
  s.roughness = roughness;
  s.r = r;
  /* The unseen ripples spread the reflection: tilting the mirror toward the
     camera moves it ~2× the tilt up or down, tilting it across moves it
     only by the sine of the grazing angle — the vertical smear of every
     calm lake's reflections. */
  s.rough = 2.0 * sqrt(roughness) * vec2(-d.y, 1.0);
  s.reflectance = waterReflectance(dot(-d, n));
  s.perDepth = length(r) / r.z;

  /* THE STONE'S REFLECTION WAVERS AS THE TREES' DO. A tilt of the water
     moves a reflection by the tilt times the reflected path: for the
     shores, a hundred metres, so the lake's undulation slices their
     reflections into drifting bands; for the stone, half a metre, so the
     same lake left its reflection a still block under a wavering world —
     pasted, not mirrored. Its tilt is drawn larger by \`uSubjectWaver\`:
     still nothing at the waterline, where the path is nothing and the
     reflection meets the stone, and growing away from it, the way a post's
     reflection is whole at its foot and broken further out. The lapping
     is drawn at its own size, its tilt and its blur: it lives at the
     stone, where the path is short anyway, and drawn larger it threw the
     rays from round the stone's narrow front corner past it, into the
     fog — light dashes under the corner. */
  vec3 mirror = reflect(d, vec3(0.0, 1.0, 0.0));
  vec3 wavering = normalize(mirror + (lakeTilt - mirror) * uSubjectWaver + (r - lakeTilt));
  wavering.y = max(wavering.y, uMinElevation * -d.y);
  s.wavering = wavering;
  s.roughSubject = 2.0 * sqrt(lakeRoughness * uSubjectWaver * uSubjectWaver + roughness - lakeRoughness)
                 * vec2(-d.y, 1.0);
  return s;
}

/* Water anywhere short of the stone's far corner can see it: its side
   corners stand behind its centre's plane (stone/optics.ts STONE). */
bool beforeStone(LakeSurface s) {
  return s.surface.z < max(uSubjectDepth, uStonePlan.y + uStonePlan.w);
}

/* ONLY WHERE IT CAN BE. Most of the near water reflects open fog: its cone
   of rays (stone/shaders/slots.ts) passes nowhere near the stone. Where the
   cone's axis misses the block grown by the cone's whole width at the
   stone's far side (twice over: the slab test is in the block's own
   units), every ray of it misses, and the reflection is no hit — the same
   answer, for a box test instead of four rays. */
bool reflectsStone(LakeSurface s) {
  float far = length(vec3(uStonePlan.x, 0.5 * uStoneSpan.y, uStonePlan.y) - s.surface) + uStonePlan.w + uStoneSpan.y;
  float width = 2.0 * (0.6 * s.roughSubject.x + 1.15 * s.roughSubject.y) * far + 0.02;
  return nearStone(s.surface, s.wavering, width);
}
`;
