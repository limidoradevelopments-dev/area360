/**
 * ─── Stage · the set ───
 *
 * Where everything stands, in metres from the camera along the lake (z), with
 * y up from the water and x to the right. One table, so the fog, the camera
 * and the backdrop cannot disagree about the world.
 *
 * THE DEPTH PLAN. The fog is four sheets, each filling the space between two
 * of these planes (atmosphere/optics.ts SHEETS):
 *
 *   10 m   the stone. The pivot of the parallax, and the plane the
 *          visitor's hand moves the air in.
 *   34 m   the open water in front of the shores.
 *   60 m   the bank of fog over the lake.
 *   130 m  the fog's far edge: past it the photograph's own fog is all there
 *          is. The shores stand at 60–170 m (BACKDROP).
 *
 * Moving any of these moves its parallax AND its fog: a depth is a physical
 * statement, not a z-index.
 */

import geometry from "./backdrop.json";

export const DEPTH = {
  subject: 10,
  nearShore: 34,
  farShore: 60,
  horizon: 130,
} as const;

/** The far edge of each fog sheet, near to far: the depths above, in order. */
export const SHEET_EDGES = [DEPTH.subject, DEPTH.nearShore, DEPTH.farShore, DEPTH.horizon] as const;

/**
 * THE BACKDROP: the shores, the forest and the sky are ONE photograph with a
 * depth for every pixel, built offline (scripts/hero-plates/backdrop.py,
 * `npm run backdrop`) and served from public/hero/backdrop.
 *
 * A photograph has what no set of cut-out trees on a few planes can: fog
 * thickening tree by tree into the distance, real banks, real light round
 * every needle. The depth lets the stage put its own fog, the visitor's hand
 * and the parallax at each pixel's own distance, so the forest is a volume,
 * not a stack of sheets — the 2.5D camera projection of film matte painting.
 *
 * It sits in the camera AT REST exactly where the user's own frame (their
 * 1200×700 design) put it: registered off that frame, not judged by eye.
 * The numbers below are written by the build, from the same camera.
 */
const plate = geometry.plate as [number, number];

export const BACKDROP = {
  /* Addressed by their content (backdrop.py writes `version`): they are
   * served cached for a year (next.config.ts), so a rebuilt photograph must
   * arrive under a new address. */
  plateUrl: `/hero/backdrop/plate.webp?v=${geometry.version}`,
  depthUrl: `/hero/backdrop/depth.webp?v=${geometry.version}`,
  /** The photograph's size, texels (its top rows are fog it was extended by). */
  plate,
  /** The depth map's size, texels. */
  depth: geometry.depth as [number, number],
  /** The horizon's row, texels from the top. */
  horizonRow: geometry.horizonRow,
  /** The column on the lens's axis, texels from the left. */
  centerColumn: geometry.centerColumn,
  /** Texels per unit of tan across and up: the photograph's focal length. */
  texelsPerTan: geometry.texelsPerTan,
  /** Metres at an inverse depth of 1 (the depth map stores near/z). */
  depthNear: geometry.depthNear,
  /** The nearest any of its land stands, metres. */
  nearest: geometry.nearest,
  /** How far it reaches either side of the lens's axis, as tan: past this
   *  there is no photograph, and the camera never looks there (camera.ts). */
  reach: Math.min(geometry.centerColumn, plate[0] - geometry.centerColumn) / geometry.texelsPerTan,
} as const;
