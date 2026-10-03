/**
 * ─── Stone · optics ───
 *
 * The stone standing in the lake: the subject, at DEPTH.subject. Granite,
 * framed and lit to the user's design.
 */

/**
 * THE STONE: a pillar of lake granite standing on the bed of the lake, its
 * top 0.54 m clear of the water — the top of something far longer, whose
 * foot the dark water shows for its first half-metre and then keeps.
 *
 * FRAMED AS THE DESIGN DRAWS IT. Registered off the user's 1200×700 frame —
 * its three top corners and three waterline corners, through the one camera
 * (stage/camera.ts): 1.3 px rms. The design drew it through a lens ~2.2×
 * wider than its photograph's (its edges' vanishing points say so), which
 * no cube standing there could match from this camera (a true cube misses
 * its front corners by ~8 px). So the block is shaped to the frame, as a
 * set is built to its one camera: a diamond in plan, `along` its half-
 * diagonal down the lens's axis, `across` across it — from here, exactly
 * the design's cube; from anywhere else, a long prism, and the camera never
 * goes anywhere else (its lean is centimetres). Its surface, light and
 * weathering are the cube's it plays (shaders/stone.ts), so nothing on it
 * reads as stretched. Set `along` to `across` for a true cube.
 */
export const STONE = {
  /** The plan's centre on the water (x, z), metres. */
  center: [0.098, 10.283] as const,
  /** Half-diagonals of the plan: across the lens's axis, along it. */
  plan: { across: 0.489, along: 1.128 },
  /** Its top above the water, and how far it goes down to the bed. */
  top: 0.543,
  depth: 2.4,
  /**
   * Irradiance, as a share of the full sky light. Fog light is diffuse: each
   * face toward the camera sees a good part of the dome, the one turned to
   * the open lake (`lightSide`) more; that step between the faces is what
   * shows the corner. The top sees most of the dome. Fitted to the design's
   * stone: its lit face ~74 falling to ~60 toward the water, its shaded
   * face ~46 to ~32, its top ~167. Brighter
   * and it reads as lit from within: the monolith it must never be.
   * THE AFTERNOON OVERCAST (stage/optics.ts FILM.paper): the sky is one soft
   * light overhead, so the face away from the open lake gets a little more
   * of it than the design gave — the two faces nearer each other, the top
   * still the brightest. Printed on the afternoon paper: top ~120, faces
   * ~47 and ~37.
   */
  light: { top: 0.8, sideAway: 0.08, sideToward: 0.32 },
  /** The light's side, as a direction on the water (x, z): the open lake
   *  and its sky lie to the left; the design lights the left face. */
  lightSide: [-1, 0] as const,
  /**
   * The lake under it gives back less light than the sky above: the foot of
   * each face, up to `height` (m), falls toward the water, its light and its
   * sheen alike — to what the water on its side gives back. The face toward
   * the open lake looks onto fog lying on the water and keeps `toward`; the
   * other looks onto the right bank's dark reflections and keeps `away`. The
   * design's faces fall so: the lit one to 0.81 of its top, the shaded one
   * to 0.69.
   */
  foot: { height: 0.54, away: 0.35, toward: 0.75 },
  /**
   * SHEEN. Granite is a dielectric (reflectance 4% head-on), but weathered
   * it is rough — its feldspar etched, its surface crusted — and its
   * reflection rises toward grazing only to `grazing`. In fog its top still
   * prints near white above its dark faces, mostly from the dome's light;
   * the mist on it gives the rest. `top`, `face`: the share of the full sky
   * light its blurred reflection gathers there — on the top, the fog ahead;
   * on a face, the horizon's fog above and as much dark lake below.
   */
  sheen: { headOn: 0.04, grazing: 0.15, top: 1.15, face: 0.45 },
  /**
   * THE GRANITE, at its true size (m), on a stone ~10 m away: one pixel of
   * a 1200×700 frame covers 6 mm of it, one of a 4K frame 2 mm. Each pattern
   * fades as it falls under a pixel, so it never aliases and resolves as the
   * screen sharpens. `cloud`: the slow variation across the block (two
   * octaves); `fleck`: its dark crystals (biotite, hornblende) in a ground
   * whose feldspar weather has whitened, about a fifth of its area; `fine`:
   * the grain of the ground itself.
   */
  granite: {
    cloud: 0.3,
    cloudAmount: 0.2,
    fleck: 0.006,
    fleckAmount: 0.55,
    fine: 0.0024,
    fineAmount: 0.3,
  },
  /**
   * WEATHERED, AS THE SHORE'S ROCKS ARE. What makes a stone belong to a
   * lake is the lake written on it, the same as on the pale granite at the
   * photograph's left shore:
   *   `edge`     its arrises rounded by frost and water (radius, m), in
   *              its outline as in its light: no sawn edge survives a few
   *              winters; the corner turns, and catches the fog's light as
   *              it turns — what gives a block its weight and its scale
   *   `lichen`   crustose lichen on what stays dry — pale grey rosettes
   *              (`size` m, `cover` of the top; the faces half as much,
   *              thinning toward the water) and a few dark ones; `pale`,
   *              `dark`: their tone against the stone's
   *   `runs`     dark streaks where rain runs off the top and down the
   *              faces, strongest under the edge
   */
  edge: 0.04,
  lichen: { size: 0.09, cover: 0.22, pale: 1.35, dark: 0.6 },
  runs: 0.18,
  /**
   * WEAR, sized to what a pixel can hold at 10 m (6 mm on a 1200×700 frame,
   * 2 mm at 4K). `polish`: how unevenly rough it is, as a share — smoother
   * patches and rougher, seen in how the top takes the fog's light; `chip`:
   * the deepest flake frost has taken off an edge (m), and `chipTone`, the
   * fresh granite under the weathered skin; `pits`: how dark the pits are
   * where a crystal fell out.
   */
  wear: { polish: 0.45, chip: 0.03, chipTone: 1.3, pits: 0.45 },
  /**
   * THE WATER'S MARK. Lakes rise and fall with the seasons, and every rock
   * on a northern shore carries a band where the water stands half the year:
   * dark with algae and the stain of peat, its top level and ragged, darker
   * toward the water (`stain`: height, darkening). The last few centimetres
   * are soaked (`wet`): darker still, and glossier all the way down the
   * band, as a wet stone is. Under the water the stone is coated (`under`:
   * its darkening) and lit by what light reaches down through the lake
   * (water/optics.ts WATER.clarity).
   */
  stain: { height: 0.2, darkening: 0.62 },
  wet: { height: 0.025, darkening: 0.55 },
  under: 0.75,
  /** The meniscus: how high the water climbs the stone (m), and the share
   *  of the sky light its curve mirrors. Faint, and broken as the lake lifts
   *  and drops along the waterline: at the 0.45 first tried it read as a
   *  white border drawn round the stone's foot. */
  meniscus: { height: 0.004, sky: 0.15 },
} as const;
