/**
 * ─── Stage · the camera, in GLSL ───
 *
 * One pinhole camera, shared by every pass that looks at the world. Screen
 * positions are CSS px from the frame's centre (resolution-free, so the
 * volume pass at a quarter resolution and the composite at device resolution
 * agree to the pixel); the focal length is in the same px.
 *
 * A ray is NOT normalised: its z is the focal length, so `P = origin + ray·t`
 * reaches depth z at t = (z − origin.z) / ray.z, and the set's planes of
 * constant depth are one division away.
 */
export const CAMERA_GLSL = /* glsl */ `
/* frame size, CSS px */
uniform vec2 uView;
/* focal length, CSS px; and the lens at rest, which the simulated air's
   frame is laid out through (the arrival opens on a longer lens:
   stage/motion.ts ARRIVAL.zoom) */
uniform float uFocal;
uniform float uRestFocal;
/* where the lens's axis meets the frame (uv): below the middle, because the
   front is risen to put the horizon there (stage/camera.ts) */
uniform vec2 uCenter;
/* where the camera is (metres) and how it is turned (camera → world) */
uniform vec3 uCamPos;
uniform mat3 uCamRot;
/* the camera at rest: at eye height on the axis, level */
uniform float uEyeHeight;
/* how far the photograph's eye stands from the camera (metres): none while
   the lean is within what the photograph takes (stage/camera.ts) */
uniform vec3 uPlateShift;

vec3 cameraRay(vec2 uv) {
  return uCamRot * vec3((uv - uCenter) * uView, uFocal);
}

/* A world point → frame uv, through the camera as it is now. */
vec2 projectUv(vec3 p) {
  vec3 c = transpose(uCamRot) * (p - uCamPos);
  return c.xy / c.z * uFocal / uView + uCenter;
}

/* A world point → frame uv, through the camera at REST — its position and
   its lens: the frame the simulated air lives in, so the fog stays where it
   is in the world while the camera leans and the lens widens. */
vec2 restUv(vec3 p) {
  return vec2(p.x, p.y - uEyeHeight) / p.z * uRestFocal / uView + uCenter;
}
`;
