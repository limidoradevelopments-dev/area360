/**
 * ─── Atmosphere · the fog sheets ───
 *
 * The fog between the planes of the set, at half resolution (fog has no
 * detail finer than a couple of pixels, and this is the expensive pass).
 *
 * For every pixel and every sheet, the ray from the camera is followed to
 * the sheet's plane, and the fog there is found in the WORLD: billows sized
 * in metres and drifting in metres per second at that depth, so near wisps
 * are small on the ground but large and quick on screen, and far banks are
 * vast and slow. The simulated air (what the visitor's hand and the gusts
 * do) is read where that world point sat for the camera at rest, since that
 * is the frame the simulation lives in, and it reaches each sheet by that
 * sheet's `response`.
 *
 * LIGHT comes from above the frame. Each point's share of it is e^(−k·∫ρ),
 * the simulated fog INTEGRATED on the way to the light: the further down,
 * the more fog in the way, so the air over the water sits greyer than the
 * sky on its own; a lane the hand opens lets a shaft of light down through
 * it. Each billow is lit on the side toward the light (its density is
 * compared with a sample one step up), so the fog has form, not just shade.
 *
 * Out (all per sheet, near → far):
 *   location 0   density multiplier: × the sheet's optical depth
 *   location 1   xyz: light on sheets 0–2; w: the plain light, used for
 *                the far sheet and the sky (their billows are too far away
 *                to show a lit side)
 */

import { CAMERA_GLSL } from "../../stage/shaders/camera";
import { SIMPLEX_3D } from "./noise";

export const SHEETS_FRAG = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;

#define LIGHT_STEPS 10

in vec2 vUv;
layout(location = 0) out vec4 outDensity;
layout(location = 1) out vec4 outLight;

${CAMERA_GLSL}

uniform sampler2D uFluid;
/* the billows' carried coordinates, two sets, in cells */
uniform sampler2D uCarry;
/* rest uv → fluid uv (scale xy, offset zw), and the grid in cells */
uniform vec4 uGridMap;
uniform vec2 uGrid;
/* weight of the first carried set; the second has the rest */
uniform float uPhase;
/* CSS px per cell, on the plane the air is simulated in */
uniform float uCellPx;
uniform float uPivotZ;
uniform float uTime;
/* the fog's breath: a density scale */
uniform float uBreath;

/* per sheet, near → far */
uniform vec4 uSheetPlane;
uniform vec4 uSheetScale;
uniform vec4 uSheetDetail;
uniform vec4 uSheetResponse;
uniform vec4 uSheetForm;
uniform vec4 uSheetBlur;
/* how the billows are shaped into density: 1 soft banks, higher = wisps */
uniform vec4 uSheetSharp;
/* accumulated wind drift at each sheet, metres (x) */
uniform vec4 uSheetDrift;

/* horizontal stretch of fog features, extra drift of the thin wisps */
uniform vec2 uStrata;
/* billow evolution per second, self-shadowing */
uniform vec2 uEvolve;
/* the light's position in rest uv (above the frame), extinction per frame
   height of simulated fog, ambient sky light */
uniform vec4 uLight;
/* turbulence as SEEN: eddy speed at which it is fully visible, how far it
   tears the fog, its scale against the billows', how fast it re-forms */
uniform vec4 uTurb;
/* two internal waves: amplitude (share of the frame height at the sheet),
   wavelength (share of the frame width at the sheet), angular frequency,
   phase */
uniform vec4 uWaveA;
uniform vec4 uWaveB;

${SIMPLEX_3D}

vec2 gridUv(vec2 ruv) {
  return ruv * uGridMap.xy + uGridMap.zw;
}

float fogAt(vec2 ruv) {
  return max(texture(uFluid, gridUv(ruv)).b, 0.0);
}

/* The simulated air at a rest-frame point, read \`blur\` cells soft. */
vec4 airAt(vec2 g, float blur) {
  vec4 a = texture(uFluid, g);
  if (blur > 0.5) {
    vec2 r = blur / uGrid;
    a += texture(uFluid, g + vec2(r.x, 0.0)) + texture(uFluid, g - vec2(r.x, 0.0))
       + texture(uFluid, g + vec2(0.0, r.y)) + texture(uFluid, g - vec2(0.0, r.y));
    a *= 0.2;
  }
  return a;
}

/* One sheet's billows at world point w (metres on the sheet's plane).
   \`form\` gets how lit this point of the billow is. */
float billows(vec2 w, float scale, float drift, float e, float turb, float lit, out float form) {
  /* Laid flat: stratified air draws fog out sideways. */
  vec2 lay = vec2(1.0 / uStrata.x, 1.0) / scale;
  vec2 q = (w - vec2(drift, 0.0)) * lay;
  float body = snoise(vec3(q, e));
  /* A ridge octave: filaments, the wisps between banks, streaming faster
     than the body because they ride higher, in stronger wind. 1 − n², not
     1 − |n|: the absolute value creases at the crest, and a field of
     creases reads as veins in marble, not as fog. */
  vec2 wq = (w - vec2(drift * (1.0 + uStrata.y), 0.0)) * lay * 1.7;
  float r = snoise(vec3(wq + 3.1, e * 1.4 + 5.0));
  float n = 0.76 * body + 0.24 * ((1.0 - r * r) * 2.0 - 1.0);
  form = 0.5;
  if (lit > 0.0) {
    /* One billow-radius toward the light (up): stepping out of the billow
       means a lit top edge, stepping into it a shadowed underside. */
    float lee = snoise(vec3(q + vec2(0.0, 0.27), e));
    form = clamp(0.5 + (body - lee) * 0.8, 0.0, 1.0);
  }
  /* Where a hand has stirred the fog, energy cascades into SMALL structure:
     the smooth bank tears into fine curling wisps (not laid flat — small
     turbulence is isotropic), re-forming quickly, fading as the energy
     dies. This, not displacement, is how turbulence in fog looks. */
  if (turb > 0.01) {
    float fine = snoise(vec3(w / scale * uTurb.z, uTime * uTurb.w + e * 3.0));
    n += turb * uTurb.y * fine;
  }
  return n;
}

void main() {
  vec3 ray = cameraRay(vUv);

  /* ── Light from above, through the simulated fog ──
     Marched once, from where this pixel meets the stone's plane, and shared by
     every sheet: the light falls through the same air to all of them. */
  vec3 onPivot = uCamPos + ray * ((uPivotZ - uCamPos.z) / ray.z);
  vec2 from = restUv(onPivot);
  vec2 stride = (uLight.xy - from) / float(LIGHT_STEPS);
  float ds = length(vec2(stride.x * uView.x / uView.y, stride.y));
  /* Each pixel starts its march at a different fraction of a step, so the
     coarse steps dissolve into the film grain instead of banding. */
  float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  float depth = 0.0;
  for (int j = 0; j < LIGHT_STEPS; j++) {
    depth += fogAt(from + stride * (float(j) + jitter)) * ds;
  }
  float light = mix(exp(-uLight.z * depth), exp(-0.5 * uLight.z * depth), uLight.w);

  /* Variance-preserving blend of the two carried sets: a plain 50/50 mix of
     two noise fields halves their contrast, and the fog would pulse flat
     twice a cycle. */
  float wA = uPhase;
  float wB = 1.0 - uPhase;
  float norm = inversesqrt(wA * wA + wB * wB);

  vec4 density = vec4(0.0);
  vec4 lit = vec4(0.0);
  for (int k = 0; k < 4; k++) {
    float z = uSheetPlane[k];
    vec3 p = uCamPos + ray * ((z - uCamPos.z) / ray.z);
    vec2 g = gridUv(restUv(p));
    vec4 air = airAt(g, uSheetBlur[k]);
    float response = uSheetResponse[k];
    float scale = uSheetScale[k];

    /* The frame at this depth, in metres: the waves heave every sheet by the
       same share of the picture. */
    float frameH = z * uView.y / uFocal;
    float frameW = z * uView.x / uFocal;
    vec2 w = p.xy;
    w.y -= uWaveA.x * frameH * sin(6.2831853 * w.x / (uWaveA.y * frameW) - uWaveA.z * uTime + uWaveA.w)
         + uWaveB.x * frameH * sin(6.2831853 * w.x / (uWaveB.y * frameW) - uWaveB.z * uTime + uWaveB.w);

    /* Neighbouring sheets sit apart in the noise's third axis, so their
       banks never line up; within a sheet the axis is time. */
    float e = uTime * uEvolve.x + float(k) * 7.31;
    float turb = response * smoothstep(0.0, uTurb.x, sqrt(max(air.a, 0.0)));
    float n;
    float form;
    if (k < 2) {
      /* The near sheets ride the simulated air: their billows are read where
         the air has carried them from, converted from cells on the stone's plane to
         metres on this one. */
      vec4 carry = texture(uCarry, g);
      vec2 cell = g * uGrid;
      float toMetres = uCellPx * z / uFocal * response;
      float formA;
      float formB;
      float nA = billows(w + (carry.xy - cell) * toMetres, scale, uSheetDrift[k], e, turb, uSheetForm[k], formA);
      float nB = billows(w + (carry.zw - cell) * toMetres, scale, uSheetDrift[k], e, turb, uSheetForm[k], formB);
      n = (wA * nA + wB * nB) * norm;
      form = wA * formA + wB * formB;
    } else {
      n = billows(w, scale, uSheetDrift[k], e, turb, uSheetForm[k], form);
    }

    float rho = max(1.0 + response * (air.b - 1.0), 0.0) * uBreath;
    float billow = pow(smoothstep(-0.25, 0.65, n), uSheetSharp[k]);
    float detail = uSheetDetail[k];
    float m = rho * mix(1.0 - detail, 1.0 + detail, billow);
    density[k] = m;
    float shape = uSheetForm[k];
    lit[k] = light * mix(1.0 - shape, 1.0 + shape, form) * exp(-uEvolve.y * (m - 1.0));
  }

  outDensity = density;
  outLight = vec4(lit.xyz, light);

}
`;
