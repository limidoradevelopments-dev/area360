/**
 * ─── Stage · a pixel's footprint on the water, in GLSL ───
 *
 * Every program that draws the lake (the stone's slots in it, the
 * photograph in it, the scene: stage/shaders/scene.ts, the top) filters the
 * waves by how much water one pixel covers — and must find the same
 * footprint for the same pixel, or the three would see different lakes.
 * They do: each draws the scene's own full-frame triangle through the
 * scene's own viewport (a rect pass shifts the viewport by an even number
 * of pixels and scissors to its rect: stone/stone.ts), so its \`vUv\` and its
 * 2×2 quads — what derivatives are taken across — are the scene's.
 *
 * Needs CAMERA_GLSL before it.
 */
export const PIXEL_GLSL = /* glsl */ `
/* This pixel's footprint on the water (metres, x and z: a standard
   deviation), from how the water point moves between neighbouring pixels.
   Derivatives: call in uniform control flow, at the top of main. */
vec2 waterFootprint(vec3 ray) {
  float t = ray.y < 0.0 ? uCamPos.y / -ray.y : 0.0;
  vec2 onWater = (uCamPos + ray * t).xz;
  vec2 wx = dFdx(onWater);
  vec2 wy = dFdy(onWater);
  return min(0.5 * sqrt(wx * wx + wy * wy), vec2(50.0));
}
`;
