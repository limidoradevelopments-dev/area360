/**
 * ─── Bloom · optics ───
 *
 * The night bloom on the stone: Epiphyllum oxypetalum, the kadupul — a
 * climbing cactus whose flat stems root in any crevice that holds a little
 * humus, and whose one large white flower opens after dark and is gone by
 * morning. Here it has rooted in a crack on the stone's top, a clump grown
 * there for years: a cushion of moss over the crack, an old woody stem out
 * of it, flat stems of every age branching from that — arching over the
 * edges, lying on the top, one young shoot standing — thin roots gripping
 * the stone, and from the edge of the oldest stem the flower on its long
 * bent tube, facing the lake, with a second bud, days from opening, behind.
 *
 * MODELLED, NOT CUT OUT. Every part is a surface swept along a curve
 * (shape.ts): the tepals curved along their length and cupped across, each
 * curling its own way; the stems thick and fleshy, lens-shaped across with
 * a raised midrib and rounded margins, scalloped between their areoles,
 * round where they leave the old stem, twisting as they fall; the tube,
 * the old stem and the roots round and tapering; the heart a dome of
 * filaments, each one its own thread; the moss a lumpy cushion. The first
 * build traced flat pieces hinged together, and close to, it read as green
 * card and a paper star. The second planted two stems straight into the
 * bare stone, and they read as wires pushed into a hole.
 *
 * LIT AS THE STONE IS: by the overcast dome (stone/optics.ts STONE.light),
 * the same light from above and from the open lake on the left: thin
 * petals with the fog's light behind them. AND HOLDING A LITTLE OF ITS OWN
 * as it opens (`glow`; the user's note of 2026-10-05: a white flower on
 * light fog "dosent attract people eye"): the cup lit from within, as a
 * paper lantern is, and a soft light in the fog round it — light it holds,
 * never light it throws: no rays, no sparkle, no pulse, nothing that would
 * pull the eye from the title. Its pollen the same: faint gold motes.
 *
 * Placed in world metres, on the stone's frame (stone/optics.ts STONE). The
 * stone is a diamond prism stretched down the lens's axis to play a cube
 * (see STONE): a point's DEPTH barely moves it on screen, so the plant is
 * placed by x and height, and its depth is chosen only to keep it in front
 * of the face it hangs over. The stone's top is seen almost edge-on (the
 * eye is 0.7 m above it, 10 m away): whatever lies flat on it is a line, so
 * the stems arch up off it before they fall, and the clump is built up.
 */

/** Golden angle (radians): each tepal turned from the last by it, as a
 *  cactus flower's tepals stand on their spiral. */
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

type Vec3 = readonly [number, number, number];

export interface StemDesign {
  /** The spine's control points (m): from inside the old stem, then along
   *  its arch — a smooth curve through all of them. */
  readonly points: readonly Vec3[];
  /** Its greatest half-width (m). */
  readonly width: number;
  /** Which way its flat side faces, at the root and at the tip: the blade
   *  turns between them as it falls (a cladode twists under its weight). */
  readonly face: readonly [Vec3, Vec3];
  /** 0 an old stem, 1 this season's: paler, yellower, thinner. */
  readonly young: number;
  /**
   * Where it rests on the stone, if it does (shape.ts layOnStone): from
   * `from` along it (eased down to it over the share before), to `to`,
   * past which it peels away to its tip. `on`: what touches — its `spine`
   * (a blade lying flat against a face, or draped over an arris, its face
   * turned to the stone's) or its lower `margin` (a blade propped on edge on
   * the top). `lift`: m off the stone at `to` and at its tip.
   */
  readonly rest?: {
    readonly from: number;
    readonly to: number;
    readonly on: "spine" | "margin";
    readonly lift: readonly [number, number];
  };
}

export interface MossDesign {
  /** Its middle on the top (x, z) and its half-spans (m). */
  readonly center: readonly [number, number];
  readonly radius: readonly [number, number];
  /** How high it stands at its highest (m). */
  readonly height: number;
  /** How much higher it climbs the old stem at its foot, and how far round
   *  it (m). */
  readonly collar?: { readonly height: number; readonly radius: number };
}

export const BLOOM = {
  /**
   * THE FLOWER, held up over the stone's top on its bent tube, white against
   * the grey fog. `center`: where its tepals spring from (m). `facing`: the
   * way it looks — out to the open lake on the left, toward the camera and
   * up: a THREE-QUARTER view. Face-on (the first try) it flattened into a
   * white star and read as a daisy; turned, it shows what only this flower
   * has — the deep white cup on its long curved neck, the crown swept back
   * behind it (the second reference). Hung lower, before the stone's face,
   * it was a small white burr against the granite. `budFacing`: the bud,
   * before it opens, nods at the end of its neck, as a kadupul's bud hangs
   * until its night; it lifts its head to `facing` as it opens (motion.ts
   * OPENING.lift). Facing up, the bud put a kink in the neck.
   */
  center: [-0.235, 0.75, 9.97] as Vec3,
  facing: [-0.76, 0.42, -0.5] as Vec3,
  budFacing: [-0.74, -0.08, -0.66] as Vec3,
  /** LARGER THAN LIFE: a real bloom is ~17 cm across, the largest ~25;
   *  here ~31, so on a 1440 frame it spans ~60 px. At ~26 (1.45) the user
   *  asked for it larger; smaller still, it read as a white fleck, not a
   *  flower. Every length below is before this, and every curvature (1/m)
   *  is divided by it, so the shape holds as it grows. */
  scale: 1.75,

  /**
   * THE TEPALS, one spiral from the outside in. A cactus flower has no clean
   * line between sepals and petals: its tepals grade from the outermost —
   * narrow, greenish cream, swept back past the side and curling at their
   * tips, each its own way (the spidery crown that makes it this flower and
   * not a lily) — to the innermost — broad, white, cupped, overlapping in a
   * deep bowl that flares at the rim (both references, assets/sources/
   * flowers/). `count`: how many, at least and at most (a seed per visit
   * picks; motion.ts). Each property is given for the outermost and the
   * innermost, and every tepal between takes its share along the spiral.
   *   `length`      m along the tepal
   *   `halfWidth`   m, at its widest
   *   `widest`      where along it that is (share of its length)
   *   `claw`        its width where it springs from the tube (share)
   *   `tip`         the tip's shape: 1 rounded, higher more pointed
   *   `base`, `end` its angle from the flower's axis at the base and at the
   *                 tip (radians): the inner cup ~25°–55°; the outer crown
   *                 swept back to ~140°
   *   `curl`        how much more the last third bends back (radians)
   *   `cup`         how deeply it is cupped across (1/m: the curvature of
   *                 its cross-section; the bud's is the bud's own roundness)
   *   `crease`      its midrib's fold, as the slope of each half
   *   `twist`       how far its tip turns about its own length, at most
   *   `jitter`      how far its angles stray from its neighbours' (radians)
   *                 — a perfect star is a drawing
   *   `ruffle`      m: how far its margin rises and falls along its length,
   *                 the outer series' least (a white tepal's edge is never
   *                 a ruled line: the second reference)
   * MORE SPIDERY THAN IT WAS: at 26–34 tepals with broad outer ones, from
   * some sides it read as a lily; the outer crown is now more, narrower,
   * and curls further back.
   */
  tepals: {
    count: [32, 38] as const,
    /** Where the outer series ends and the inner begins, as a share of the
     *  spiral: the colour and the light change across it. */
    inner: 0.5,
    length: [0.1, 0.088] as const,
    halfWidth: [0.0034, 0.019] as const,
    widest: [0.5, 0.68] as const,
    claw: [0.6, 0.2] as const,
    tip: [2.8, 2.2] as const,
    base: [1.35, 0.28] as const,
    end: [2.45, 0.74] as const,
    curl: [1.5, 0.35] as const,
    cup: [43, 26] as const,
    crease: [0.1, 0.06] as const,
    twist: [1.1, 0.25] as const,
    jitter: [0.22, 0.08] as const,
    ruffle: [0.0004, 0.0011] as const,
    /** Where they spring from: the receptacle's rim (m), the outer series
     *  lower down it (m behind the inner's plane, at the outermost). */
    rim: 0.011,
    lower: 0.016,
  },

  /**
   * THE BUD, before it opens: a spindle of tepals wrapped round each other,
   * the outer ones' green-cream backs all that shows. `length` m from the
   * receptacle to its point, `radius` m at its widest, `widest` where along
   * it that is. Its own size for the length: the tepals keep theirs, and
   * their tips lie along the bud's point.
   */
  bud: { length: 0.085, radius: 0.021, widest: 0.45 },

  /**
   * THE HEART. A dense dome of white filaments, each a thread, set along
   * the throat in two series, tipped with cream anthers — and the style
   * standing out of them, its stigma a star of curled lobes (both
   * references). At this size a few pixels: a finer, warmer centre the
   * tepals radiate from, and a haze of threads where the light comes
   * through them. Larger anthers than life would have, a little: a 4K
   * screen should find them.
   *   `filaments`   how many
   *   `length`      m, shortest and longest
   *   `throat`      m: where they are set, from deep in the throat to its
   *                 mouth (behind the tepals' plane)
   *   `ring`        m: the throat's radius there
   *   `splay`       radians from the axis, open: inner and outer
   *   `thread`      m: a filament's width (finer than any pixel: what shows
   *                 is how many there are)
   *   `anther`      m: an anther's length and width
   *   `style`       m: its length past the throat's mouth, its radius
   *   `lobes`       the stigma's lobes, and their length (m)
   */
  heart: {
    filaments: 150,
    length: [0.05, 0.068] as const,
    throat: [-0.024, -0.004] as const,
    ring: 0.0075,
    splay: [0.3, 0.7] as const,
    thread: 0.0006,
    anther: [0.0034, 0.0016] as const,
    style: [0.078, 0.0019] as const,
    lobes: [15, 0.009] as const,
  },

  /**
   * THE TUBE: the flower's long receptacle, pale green — the kadupul's
   * signature, a swan's neck (the second reference). It leaves an areole on
   * the margin of the oldest stem where that stem's blade crests over the
   * top (`stem`, `at`: which stem, and how far along it), arches up and
   * bows down into the flower's base along its axis, so the flower hangs its
   * face out over the edge. A smooth curve from there over `knee` (the
   * arch's crown). Radius at the stem and at the flower (m, before scale).
   * It thickens into the flower: the ovary, then the throat. Short and
   * dipping (the first try), it read as a bent pipe; rising from the stem's
   * root (the second), its foot read as a wire into the stone.
   */
  tube: {
    knee: [-0.085, 0.8, 10.17] as Vec3,
    stem: 1,
    at: 0.2,
    radius: [0.0026, 0.0052] as const,
    /** Its fine ridges (how many round it) and their depth (a normal's
     *  tilt): a smooth tube read as plastic. */
    ridges: 9,
    ridgeDepth: 0.18,
    /** The small narrow bracts scattered along it, as on every kadupul's
     *  tube, more of them toward the flower: how many, their length and
     *  half-width (m, before scale), and over what share of the tube. */
    bracts: { count: 11, length: [0.006, 0.012] as const, halfWidth: 0.0011, from: 0.3, to: 0.86 },
  },

  /**
   * THE STEMS: flat, leaf-like cladodes, broad, waxy and scalloped, of
   * every age, branching from the old stem in the crack. An epiphyte's
   * stems do not stand up like a seedling's (the first try read as grass):
   * they arch and fall. In order:
   *   0  arches over the left edge and falls by the stone's corner, turning
   *      as it falls — its blade seen now flat, now on edge
   *   1  the oldest: rises to a crest over the top, where the flower's tube
   *      leaves its margin, then sweeps down to the right to lie along
   *      the top (across the view: going away from the eye, its fall read
   *      as a drop); the second bud grows from its far end
   *   2  hangs over the front-left edge, down the lit face
   *   3  this season's: a short pale shoot standing up behind the oldest
   *   4  an old one lying across the top's left half, under the first's
   *      arch, its blade propped up on one margin
   * The top is seen almost edge-on, so everything on it lines up in one
   * thin strip: they are kept apart in height, not in depth. The right side
   * stays calmer than the left, where the flower is.
   *
   * WHERE THEY MEET THE STONE THEY TOUCH IT (`rest`): the first drapes over
   * the corner's arris and hangs a little off the face below it; the
   * oldest comes down onto the top and lies on its margin (wrapped over
   * the far edge, it crumpled); the hanging one lies flat
   * down the face; the old one on the top rests on its margin. Drawn freely, they hovered 3 mm to 10 cm off it,
   * shadowless, and the clump read as floating (the user's note of
   * 2026-10-05).
   */
  stems: [
    {
      points: [[-0.024, 0.604, 10.252], [-0.12, 0.645, 10.18], [-0.265, 0.645, 10.13], [-0.36, 0.565, 10.14], [-0.388, 0.4, 10.13], [-0.395, 0.24, 10.1]],
      width: 0.04,
      face: [[0.1, 0.9, -0.42], [-0.72, 0.12, -0.68]],
      young: 0.15,
      rest: { from: 0.5, to: 0.68, on: "margin", lift: [0.001, 0.024] },
    },
    {
      points: [[-0.016, 0.586, 10.256], [0.04, 0.645, 10.3], [0.13, 0.665, 10.46], [0.25, 0.62, 10.68], [0.34, 0.565, 10.9], [0.4, 0.5, 11.1]],
      width: 0.034,
      face: [[0.15, 0.6, -0.78], [-0.1, 0.6, -0.8]],
      young: 0,
      rest: { from: 0.72, to: 1, on: "spine", lift: [0.001, 0.001] },
    },
    {
      points: [[-0.012, 0.573, 10.258], [-0.1, 0.6, 10.08], [-0.185, 0.585, 9.935], [-0.243, 0.505, 9.862], [-0.258, 0.39, 9.832], [-0.262, 0.3, 9.825]],
      width: 0.03,
      face: [[0.0, 0.85, -0.52], [-0.88, 0.05, -0.47]],
      young: 0.1,
      rest: { from: 0.55, to: 1, on: "spine", lift: [0.001, 0.001] },
    },
    {
      points: [[-0.026, 0.613, 10.25], [-0.014, 0.66, 10.31], [0.0, 0.7, 10.37], [0.014, 0.724, 10.41]],
      width: 0.013,
      face: [[0.2, 0.1, -0.97], [0.4, 0.2, -0.9]],
      young: 1,
    },
    {
      points: [[-0.008, 0.56, 10.262], [-0.1, 0.574, 10.34], [-0.2, 0.569, 10.41], [-0.29, 0.557, 10.45]],
      width: 0.032,
      face: [[0.05, 0.55, -0.83], [0.15, 0.65, -0.74]],
      young: 0,
      rest: { from: 0.16, to: 1, on: "margin", lift: [0.0006, 0.0006] },
    },
  ] as readonly StemDesign[],

  /**
   * A STEM'S FORM, shared:
   *   `stalk`     how much of its length leaves the old stem round (share),
   *               and its radius there (m)
   *   `tip`       where the blade begins to narrow to its blunt tip (share)
   *   `lobe`      m between areoles along the margin; `notch` how deep each
   *               notch is (share of the width): long shallow scallops
   *               (short deep ones read as a fern's teeth)
   *   `thick`     m: half its thickness at the midrib — a fleshy blade,
   *               ~5 mm, thinning to a rounded margin
   *   `rib`       m: how far the midrib stands above the blade
   *   `wave`      m: how far the blade undulates between the areoles
   *   `areole`    m: an areole's radius, in its notch — the felted pit
   *               every new shoot and flower comes from
   */
  stem: {
    stalk: [0.09, 0.0042] as const,
    tip: 0.62,
    lobe: 0.042,
    notch: 0.13,
    thick: 0.0024,
    rib: 0.0011,
    wave: 0.0016,
    areole: 0.0022,
  },

  /**
   * THE OLD STEM: what the clump grew from — round, woody, grey-brown bark,
   * as an Epiphyllum's oldest stems turn at their base — out of the crack
   * and the moss, the flat stems branching from its top. Its spine (m) and
   * its radius at the crack and at the top. Static: it does not sway.
   */
  trunk: {
    points: [[-0.004, 0.515, 10.262], [-0.012, 0.565, 10.258], [-0.026, 0.618, 10.25]] as readonly Vec3[],
    radius: [0.012, 0.0075] as const,
  },

  /**
   * AERIAL ROOTS: thin and wiry, from the old stem's foot over the top and
   * gripping down over the front-left edge, as an epiphyte holds its rock.
   * Drawn as designed, then laid onto the stone's rounded surface (shape.ts
   * onStone) at their own radius, so they touch it along their length.
   * Their radius at the stem and at the tip (m).
   */
  roots: {
    paths: [
      [[-0.012, 0.55, 10.24], [-0.07, 0.545, 10.13], [-0.13, 0.545, 10.01], [-0.18, 0.54, 9.92], [-0.205, 0.5, 9.885], [-0.212, 0.43, 9.875], [-0.218, 0.37, 9.87]],
      [[-0.02, 0.55, 10.26], [-0.11, 0.545, 10.22], [-0.22, 0.545, 10.17], [-0.3, 0.54, 10.13], [-0.33, 0.5, 10.09], [-0.338, 0.45, 10.08]],
      [[-0.016, 0.55, 10.25], [-0.06, 0.545, 10.07], [-0.09, 0.545, 9.94], [-0.11, 0.53, 9.84], [-0.118, 0.49, 9.82]],
      [[0.005, 0.55, 10.27], [0.07, 0.545, 10.36], [0.12, 0.545, 10.47]],
    ] as readonly (readonly Vec3[])[],
    radius: [0.0016, 0.0007] as const,
  },

  /**
   * THE MOSS: a mat over the crack the plant roots in, holding its humus,
   * the old stem coming up through it and the moss climbing it — and a few
   * smaller ones where the wet collects: toward the front-left edge, and
   * where the stems lie on the top. Lumpy, soft at its outline (shaders/
   * bloom.ts: its tips catch the light, its silhouette is a fur, not a
   * line), darkest down in its hollows. What grows on a lake rock is moss:
   * leaves of any other plant would be borrowed. Higher and narrower (a
   * dome 4.6 cm high, 18 cm across), it read as a heap set on the stone.
   */
  moss: [
    { center: [-0.014, 10.262], radius: [0.095, 0.125], height: 0.04, collar: { height: 0.018, radius: 0.026 } },
    { center: [-0.12, 10.13], radius: [0.045, 0.055], height: 0.014 },
    { center: [-0.2, 9.99], radius: [0.034, 0.04], height: 0.01 },
    { center: [0.078, 10.37], radius: [0.034, 0.042], height: 0.012 },
    { center: [0.25, 10.73], radius: [0.03, 0.04], height: 0.008 },
    { center: [-0.235, 10.42], radius: [0.026, 0.032], height: 0.007 },
  ] as readonly MossDesign[],

  /**
   * THE MOSS'S FORM, shared: `edge`, the power its height falls by toward
   * its outline (above 1, thinning to it; at 0.6, a dome to the last);
   * `lumps`, how much its soft lumps raise and sink it (share of its
   * height: at 0.11 the wide mat read as one smooth slope); `grit`, how
   * far past its outline its grit reaches (share of its spans), and
   * `gritHeight` (m), that layer's thickness at the moss.
   */
  mossForm: { edge: 0.8, lumps: 0.16, grit: 0.3, gritHeight: 0.0014 },

  /**
   * THE SECOND BUD, days from opening: small, on a short tube from an
   * areole near the oldest stem's far end, drooping out from the margin and
   * turning up — as every kadupul bud does before its night. `stem`, `at`:
   * where; `bow`, `reach`: its tube's bend and its tip, from the areole
   * (m); `length`, `radius`: its own body (m); `bracts`: the narrow scales
   * wrapped round it. A quiet echo of the flower on the calmer side.
   */
  budlet: {
    stem: 1,
    at: 0.8,
    bow: [0.045, -0.02, -0.012] as Vec3,
    reach: [0.04, 0.115, -0.02] as Vec3,
    length: 0.032,
    radius: 0.0056,
    tube: 0.0016,
    bracts: 7,
  },

  /**
   * HOW IT TAKES THE LIGHT.
   *   `transmit`  the share of the light on a tepal's far side that comes
   *               through it — a white petal is a thin, scattering sheet;
   *               this is what makes it read as lit from within, with no
   *               light of its own; more at its thin edges and tip
   *   `cup`       the light left deep in the cup, where the tepals and the
   *               filaments hide the sky from each other
   *   `sheen`     the tepals' satin: the dome in their fine papillae
   *   `wax`       the stems' cuticle: its reflectance head-on (a waxy leaf
   *               is ~4%, rising to a mirror at grazing) — the gloss is
   *               what shows a stem is round
   *   `through`   the stems' and the tube's own translucency
   *   `dome`      the overcast dome's light on the plant, as a share of
   *               the full sky light: on a surface facing up, one facing
   *               away from the open lake, one facing it. The stone's own
   *               (stone/optics.ts STONE.light) is fitted to the design's
   *               dark faces — a stylised block — and in it every petal that
   *               stands upright printed mid-grey: a white flower lost its
   *               white. This is the dome as it is for anything upright in
   *               fog: ~40% of the light on the level
   *   `veins`     how many veins run up a tepal, and how much they show
   *   `satin`     the satin's streak along the tepal: its sharpness, and
   *               its strength
   *   `cream`     how much warmer the cup is deep inside than at its rim
   */
  light: {
    transmit: 0.4,
    cup: 0.42,
    sheen: 0.06,
    wax: 0.04,
    through: 0.2,
    dome: [0.82, 0.62, 0.85] as const,
    veins: [11, 0.05] as const,
    satin: [40, 0.07] as const,
    cream: 0.1,
  },

  /** Its reflection's blur (radians): the lake's ripples too fine to draw
   *  spread a reflection; the stone's under it is spread by about this. */
  mirrorBlur: 0.0025,

  /**
   * Where the plant rests on the stone, its light is shaded: round the
   * moss's grit, a damp stain (`moss`: m past it, depth), the stems, the old
   * stem and the roots where they lie close (`reach` m past their margins,
   * `depth`), and under each root the thin dark line where it touches
   * (`crease`: depth, and its width in m), and the flower's shade on the top
   * below it (`flower`: the sphere that stands for it, as a share of its
   * tepals' length).
   */
  contact: { moss: [0.02, 0.5] as const, reach: 0.03, depth: 0.6, crease: [0.55, 0.0018] as const, flower: 0.6 },

  /**
   * THE LIGHT IT HOLDS, at its fullest (motion.ts GLOW: how much of it, over
   * the visit).
   *   `lantern`    light added inside the cup, as a share of the dome's from
   *                above: the light through its walls filling it, deepest
   *                in it most — the cleanest white in the frame
   *   `halo`       the soft light it leaves in the fog round it: how much of
   *                the flower's light past `threshold` (linear: its petals
   *                pass it, its stems never do) spreads into the air
   *   `reach`      m: how far that spreads round it (a Gaussian's width at
   *                the flower) — about a third of the flower
   * Measured beside the flower, the fog brightens by ~6 levels at most, the
   * user's choice of "you'd notice it without knowing why".
   */
  /* `halo` 0.35 since 2026-10-20: at 0.75 it veiled the flower in its own
   * light once the flower printed clear of the fog (`print`). */
  glow: { lantern: 0.18, halo: 0.35, threshold: 0.42, reach: 0.07 },

  /**
   * ITS OWN PRINT (2026-10-20, the user: "the flower looks washed out —
   * make it detailed, clear"; their brief before: "a delicate glow around
   * the focal point"). Lit as it truly is, its tepals carry 1.5–2.6× the
   * light of the fog round them, and the print lays the fog at the top of
   * its curve, where all of that is pressed into the fog's own tone: the
   * flower dissolved into the air behind it — solid and finely shaded as it
   * is (underexposed, every tepal shows). A printer dodges such a thing; so
   * its whites get a curve of their own, in the film pass (stage/shaders/
   * post.ts): their light `r` against the air's round them, printed
   * `white`·(1 − e^(−`rise`·r)) — the shading kept, the cup's shadow and each
   * tepal's turn, the brightest rolling off near 190 instead of clipping —
   * where `r` passes `from`, fully by `to` (the stems, moss and roots, at
   * 0.25–0.85 of the air, keep the frame's print: from 0.7 the pale stem
   * down the stone's face whitened), as much as it covers the
   * pixel. It replaced a flat lift on its whites (BLOOM.dodge, 2026-10-19)
   * that read the plant's picture's alpha as its cover, when it is what the
   * plant LEAVES: it lifted the tepals' rims and drew white outlines.
   */
  print: { white: 0.86, rise: 1.4, amount: 1, from: 0.9, to: 1.3 },

  /**
   * THE POLLEN: motes of pale gold (hero.css --color-hero-pollen), each a
   * soft point of light: its core `radius` m (larger than a grain, which is
   * under a pixel at 10 m — what shows of pollen in a draught is a few
   * clumps catching the light) holding `light` times the sky's light, as
   * bright as its size leaves it (finer than 0.6 px, drawn at that and
   * dimmed, so it is the same speck on every screen); its halo `halo` of
   * the sky's light, `haloWidth` m wide (a Gaussian's width: ~1.6 px at
   * 1440). Brighter or wider, on a 4K screen they swelled into bokeh orbs —
   * fairy lights, not pollen. In the lake, `mirror` of it, spread wider.
   * `veil`: the fog in front of it, at the stone's distance.
   */
  pollen: { radius: 0.0018, light: 2.2, halo: 0.045, haloWidth: 0.009, mirror: 0.3, veil: 0.85 },
} as const;
