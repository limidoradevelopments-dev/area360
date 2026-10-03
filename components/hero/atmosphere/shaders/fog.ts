/**
 * ─── Atmosphere · fog along a ray, in GLSL ───
 *
 * What the composite needs to put the fog between things: the optical depth
 * from the camera to any depth, and the glow of fog in a given light.
 *
 * THE BANK IN CLOSED FORM. β(z) rises from `near` to `far` on a smoothstep
 * between `bankFrom` and `bankTo`. Its integral has a closed form —
 * ∫ smoothstep = t³ − t⁴/2 on [0, 1] — so the optical depth to any depth is
 * a handful of multiplies, exact, with no table and no march:
 *
 *   K(z) = near·z + (far − near)·[(to − from)·(t³ − t⁴/2) + max(z − to, 0)]
 *
 * A segment of a ray between depths za and zb then takes
 * τ = (K(zb) − K(za)) × (path length per metre of depth) × (the sheet's
 * local density multiplier from the volume pass) × (the height profile at
 * the segment's middle — the fog is lifting, denser aloft; optics.ts).
 */
export const FOG_GLSL = /* glsl */ `
/* β near (per metre), β in the bank, where the bank begins and where it is
   full (metres) */
uniform vec4 uExtinction;
/* the lifting fog: extra density aloft (× at full height), and the heights
   (metres) over which it builds */
uniform vec3 uFogHeight;
/* the far edge of each fog sheet (metres): the set's depth planes */
uniform vec4 uSheetEdge;
/* each sheet's own wisps: optical depth over the whole sheet */
uniform vec4 uSheetVeil;
/* fog in full light and in its own shadow (linear) */
uniform vec3 uLit;
uniform vec3 uShade;

float opticalDepthTo(float z) {
  float span = uExtinction.w - uExtinction.z;
  float t = clamp((z - uExtinction.z) / span, 0.0, 1.0);
  float t3 = t * t * t;
  float ramp = span * (t3 - 0.5 * t3 * t) + max(z - uExtinction.w, 0.0);
  return uExtinction.x * z + (uExtinction.y - uExtinction.x) * ramp;
}

/* The glow of fog under \`light\` (0 = its own shadow, 1 = full light; lit
   billow tops run a little past 1). */
vec3 fogRadiance(float light) {
  return mix(uShade, uLit, clamp(light, 0.0, 1.3));
}

/* How much denser the fog is at height y (metres above the water). */
float liftAt(float y) {
  return 1.0 + uFogHeight.x * smoothstep(uFogHeight.y, uFogHeight.z, y);
}

/* Where sheet k begins (metres). */
float sheetStart(int k) {
  return k == 0 ? 0.0 : uSheetEdge[k - 1];
}

/* Front to back: the fog between depths za and zb in front of what has been
   gathered so far, along the ray from \`origin\`. The segment lies in sheet
   k and carries its share of that sheet's wisps as well as the bank's fog.
   \`perDepth\` is the ray's path length per metre of depth; \`density\` and
   \`light\` are the sheet's local values.
   Returns the segment's optical depth, so the caller can keep the total in
   front of what comes next (plates soften with it: the fog's forward
   scattering). */
float fogBetween(inout vec3 color, inout float transmit, vec3 origin, vec3 ray, int k, float za, float zb,
                 float perDepth, float density, float light) {
  if (zb <= za) return 0.0;
  float zMid = 0.5 * (za + zb);
  float yMid = origin.y + ray.y * ((zMid - origin.z) / ray.z);
  float share = (zb - za) / (uSheetEdge[k] - sheetStart(k));
  float tau = ((opticalDepthTo(zb) - opticalDepthTo(za)) * liftAt(yMid) + uSheetVeil[k] * share)
            * perDepth * density;
  float alpha = 1.0 - exp(-tau);
  color += transmit * alpha * fogRadiance(light);
  transmit *= 1.0 - alpha;
  return tau;
}
`;
