/**
 * ─── Stage · optics ───
 *
 * The film: how the scene's light becomes the picture. Everything before
 * this is physics in linear light; this is the camera and the darkroom, and
 * it is applied to the WHOLE frame the way a real lens and print are, so it
 * can never make one thing disagree with another.
 */

/**
 * THE GRADE IS THE USER'S. Their 1200×700 design frame took the backdrop
 * photograph (stage/layers.ts BACKDROP) and graded it: registered back onto
 * the photograph, it is ONE tone curve on every pixel (fitted to 4 levels
 * rms over the whole forest and sky) and a darkening toward the foot of the
 * frame (`foot`). The photograph passes through this film carrying exactly
 * that curve (film.ts undevelop), and everything the stage adds — its fog,
 * the lake, the stone — is developed to sit inside it.
 *
 * THE FOG PRINTS AS THE DESIGN'S SKY. The fog's glow, at its average light,
 * lands on the graded photograph's sky (~247): the exposure is set by that,
 * and the sky and the stage's fog over it meet without a seam.
 */
export const FILM = {
  /* Stops, on the whole frame: the fog's glow onto the design's sky. */
  exposure: 0.38,
  /**
   * The design's curve: the photograph's print value → the value the design
   * prints it at (0–255 both), measured off the frame every 8 levels. The
   * blacks lifted to a matte ~33, the midtones opened ×1.6, the fog shouldered
   * into a near-white sky. The film undoes it as it undoes its own print, so
   * the photograph lands on these values exactly.
   */
  grade: [
    [0, 33], [8, 45], [16, 58], [24, 71], [32, 83], [40, 96], [48, 109], [56, 121],
    [64, 134], [72, 147], [80, 160], [88, 172], [96, 185], [104, 197], [112, 210],
    [120, 226], [128, 240.5], [136, 244.5], [144, 245.5], [152, 246.2], [160, 249],
    [170, 252.5], [255, 255],
  ] as readonly (readonly [number, number])[],
  /**
   * THE FOOT, BURNED IN — the design's own grad, on everything in the frame:
   * nothing above `from` (a share of the frame height from the top), then a
   * darkening that deepens with the square of the distance below it, to
   * `stops` at the foot. Measured: ×0.94 at the waterline, ×0.6 at 92% down.
   * Applied to the print, not the light, as a graduated filter over a print
   * is: it darkens the lake and the stone alike, and the photograph's
   * banks barely. Eased from the design's 1.04 stops for the afternoon
   * paper, whose gamma already sinks the dark water.
   */
  /* `from` 0.7: the user's own values, 2026-10-20 (tuner). */
  foot: { from: 0.7, stops: 0.9 },
  /**
   * THE LAKE, BURNED IN. The photograph's own lake prints far darker than
   * Fresnel gives still water under that sky — its reflections sit well
   * under the trees they mirror: its maker burned the water in, under a mask
   * that follows the shore, and the design keeps it. So does this: stops of
   * burn on the lake alone (the water and everything it reflects), from
   * just under the horizon — little there, where the far water carries the
   * fog's light — to the foot of the frame, fitted to the design's water
   * band by band (on top of `foot`, which is on everything). The stone and
   * the photographed shores stand outside the mask, as in the darkroom.
   * `shape` bends the ramp (under 1 it deepens fast below the shores);
   * `contrast` prints the lake on harder paper, deepening its darks against
   * the fog's glow more toward the foot: the stage's lake moves, and its
   * ripples mix sky into every dark reflection, which the design's frozen
   * water does not. Fitted together over ten bands of water: 6.6 levels
   * rms. Nothing at the horizon, where the lake meets the photograph's fog.
   * NOW DODGED (2026-10-19, with the long exposure: water/motion.ts
   * exposure): the user's fine-art reference (assets/sources/grade/
   * reference-3.webp) prints its lake as a mirror — the open water as light
   * as the fog it mirrors, ~140 down to ~80 at the foot, the reflections
   * near black. So the stops run the other way toward the foot (`atFoot`
   * below zero: light given back, the frame's own `foot` still darkening
   * it) on a ramp that holds off until well below the shores (`shape` over
   * 1), and the harder paper keeps the reflections black; a little burn at
   * the horizon, where the far shore's fog band meets the water — dodged
   * there too, the water just under it printed lighter than the band it
   * mirrors, and drew a line under it. Swept against the reference's water,
   * six columns of it: 13.5 levels rms (the lake of before, 38).
   * THEN HALFWAY BACK (2026-10-20, the user: "too close to my reference — a
   * version between it and the previous"): fitted to the mean of the two
   * frames, the open water down two columns, the reflections and the
   * banks (with CLARITY): within 1.4 levels rms of it. The ramp holds off
   * longer below the shores (`shape` 1.6), so the far water keeps the
   * previous print's light and the foot the halfway dodge.
   */
  /* Since 2026-10-20 the user's own values, 2026-10-20 (tuner): no burn or dodge, the harder paper only. */
  lakeBurn: { atHorizon: 0, atFoot: 0, shape: 1.8, contrast: 0.73 },
  /**
   * THE LIGHT POOLS OVER THE OPENING. Under an overcast the sky is one soft
   * light overhead, brightest where the most of it is open — over the lake,
   * between the shores — and the print is burned in toward the top corners
   * and the sides, as the afternoon reference is (its top centre 192, its
   * corners 147 and 174). `amount`: share of the print lost at the rim;
   * `at`: where the light pools (share across, share down from the top),
   * a little right of centre, over the open water. The foot has its own
   * burn (`foot`).
   */
  /* `amount` 0.27: the user's own values, 2026-10-20 (tuner). */
  vignette: { amount: 0.27, at: [0.55, 0.36] as const },
  /**
   * THE AFTERNOON PAPER. The design was printed high-key — a near-white sky,
   * a morning fog glowing. The direction is now an overcast afternoon in a
   * fine rain (the user's reference, 23.webp): nothing in it ever reaches
   * white (its brightest pixel ~194), the air is a grey that still holds
   * light, the trees go down to near black. The design's negative printed
   * on a duller paper: every print value v → black + (white − black)·v^gamma,
   * after the burns, on the whole frame at once — photograph, fog, lake and
   * stone keep their places against each other, the way a different paper
   * changes a print and nothing in it. Set between the design and the
   * reference, as the user asked ("not that dark: afternoon, not dusk"):
   * measured at 1200×700, the sky ~212, the median ~130, the near bank ~60,
   * the darkest ~15. `gamma` above 1 is what sinks the midtones and keeps
   * the darks from greying; `white` is the dullness of the day.
   */
  paper: { black: 0.047, white: 0.855, gamma: 1.33 },
  /**
   * THE USER'S REGRADE (2026-10-16): their own frame of this scene, printed
   * darker and harder (assets/sources/grade/reference.webp, 2000 × 1032,
   * neutral grey) — the sky from ~210 down to ~170, the midtones about a
   * fifth darker, the blacks held at ~19. REGISTERED, NOT JUDGED: laid onto
   * the engine's frame by an affine fit of the left bank's and the stone's
   * edges (correlation 0.978; their right bank is the taller one of before
   * BANK_HEIGHT, so it was left out), and read as ONE curve on every pixel:
   * the print as the paper leaves it → theirs (0–255), the median of theirs
   * for each 4 levels of ours over the frame, smoothed and held rising, the
   * top lifted 1.5 levels onto their sky (the median left it 2 under). With
   * it the frame is within ~2 levels of theirs over the sky, the water, the
   * stone and the trees' feet; their left bank's crowns sit 8 levels under
   * the engine's moment, inside the range its drifting fog passes through
   * (113–128 against their 116). On the print, after the paper and before
   * the grain (film.ts finish).
   * AND THEIR NEXT (2026-10-17, assets/sources/grade/reference-2.webp, the
   * frame with the crop of CAMERA.zoom): ~15% darker again — the sky ~170
   * → ~145, the blacks ~19 → ~16. Registered the same way (0.965) and read
   * as one more curve, the table is the two in turn: within ~1 level of
   * theirs over the sky and the water, the stone 3, the trees within the
   * range their fog drifts through.
   */
  regrade: [[0, 15.5], [12, 15.5], [24, 17.4], [40, 23.5], [56, 33.7], [72, 43.4], [88, 53.2], [104, 64.8], [120, 77.5], [136, 93.1], [152, 108.8], [168, 118.9], [184, 132.1], [200, 143.4], [212, 145.2], [218, 145.9], [255, 145.9]] as readonly (readonly [number, number])[],
  /**
   * DIFFUSION: the glow a lens (and a diffusion filter in front of it) puts
   * around everything bright — light from the bright fog spilling a little
   * over the darks beside it, the way every frame shot in fog has it. It is
   * what makes a dark shape against white sit IN the air rather than on it;
   * without it a hard dark edge on fog reads as a cut-out. The photograph
   * already carries its own lens's, so it falls only on what the stage
   * draws (the stone, the lake, the fog's movement). `amount`: the
   * share of each pixel's light taken from its surroundings; `spread`: how
   * far it reaches, as the weight each coarser (twice as wide) level keeps.
   * SMALL: against near-white fog even 1.5% lifts a black by several levels
   * at its edge; at 6% a near-black shape on the stone printed ~80, grey.
   */
  /* `amount` 0.01: the user's own values, 2026-10-20 (tuner). */
  diffusion: { amount: 0.01, spread: 0.6 },
  /**
   * HALATION OVER THE PHOTOGRAPH: the bright air beside a dark edge spilling
   * over it, as fog and a lens give it — what keeps a near bank against
   * lighter trees from reading as a cut-out pasted over them. Only the
   * brighter side spills (post.ts), so the fog keeps its white. The
   * photograph's own lens gave it little: its trees were drawn crisp by the
   * upscaler that made it.
   */
  /* 0.14: the user's own values, 2026-10-20 (tuner). */
  halation: 0.14,
  /**
   * The print, in display values: midtones hold, shadows and highlights are
   * pushed by their own amounts, blended smoothly across the pivot; a toe
   * (film never reaches true black); and a SHOULDER above `knee` — the
   * brights roll off toward white instead of clipping, so the fog's lit
   * crowns keep their shape against a near-white sky. A clipped highlight is
   * the surest sign of a video frame; film never has one.
   */
  /* shadows, highlights and toe: the user's own values, 2026-10-20 (tuner). */
  print: { pivot: 0.56, shadows: 1.11, highlights: 1.14, toe: 0.07, knee: 0.8 },
  /* Monochrome grain, strongest in the midtones, re-seeded at film rate;
   * soft-edged clumps about a CSS px across at every resolution, as a
   * scanned negative's are, not a hard pixel noise. Also the dither that
   * keeps long grey ramps from banding. */
  grain: 0.03,
  grainSize: 0.9,
  fps: 24,
} as const;

export const RENDER = {
  /**
   * THE DEVICE IS MEASURED IN THE DARK (2026-10-22, the user's realme C11,
   * and their rule: nothing about the picture may change while it is seen).
   * The page is black until the scene exists; the engine then draws frames
   * unseen at the costliest view it will show — the opening shot, held
   * (stage/motion.ts ARRIVAL) — skips the first `warmup` (the driver's
   * first draws and uploads), and judges the work of the next `frames`, or
   * of what `seconds` allows (two at least). That picks the rung of the
   * LADDER the visit starts on, trying a cheaper tier in the dark if it
   * must; only then does the scene come up and its arrival begin. A fast
   * device spends ~0.1 s; a phone that cannot keep up no longer runs ~20 s
   * at the wrong quality and then changes before the visitor's eyes (the
   * watcher below did, judging only after the arrival).
   *
   * MEASURED BY THE GPU'S OWN CLOCK, NOT THE WALL'S (2026-10-23). The
   * curtain stands in front while this runs, and its animations kept the
   * whole browser busy: the frames, timed end to end, read 2–5× their cost,
   * and the user's own laptop (GTX 1050 Ti, 1920×1080 at 120 Hz) was put on
   * the cheapest tier at 30 fps on 3 visits of 3 — a GPU that holds full
   * quality at 60 (~11 ms a frame). Now a frame's work is the larger of its
   * script's time and its GPU time (a timer query: the two overlap as the
   * frames run), and the rung is judged on the `quantile` of the samples:
   * a busy machine only ever adds time, so the quick end of them is the
   * frame's own cost. Where the GPU's clock is not offered, the frame end
   * to end (waited for by a one-pixel read), as before.
   */
  calibrate: { warmup: 3, frames: 6, seconds: 0.6, burstMs: 50, quantile: 0.25 },
  /**
   * THE LADDER, best first, laid out from the display's own frame (engine.ts
   * ladderFor): full quality at every Nth frame the display shows — its own
   * rate, then half, a third… down to `floorFps` — then the cheaper tiers
   * at that slowest even rate. THE FRAME RATE GIVES WAY BEFORE THE PICTURE:
   * an even rate is every pixel the same, and a scene that moves this slowly
   * reads at cinema's own rate at 30 (the grain re-seeds at 24: FILM.fps).
   * EVEN, NEVER IN BETWEEN: a frame that does not fit the display's frame
   * is shown for one frame or two as it happens, and judders; so a 120 Hz
   * screen gets 120, 60, 40 or 30, never an uneven 80. (Until 2026-10-23
   * there was only the display's rate and 30: the 1050 Ti at 1080p on a
   * 120 Hz screen had to choose between an uneven ~85 and 30.)
   *
   * A rung holds if a frame's work is at most `share` of its interval:
   * measured on the GPU's clock (`share.timed`), or end to end, which
   * counts the script and the GPU one after the other and so reads higher
   * (`share.waited`: the old 20 ms at a 60 Hz display's rate, 30 at 30).
   */
  floorFps: 29,
  share: { timed: 0.88, waited: { full: 1.2, capped: 0.9 } },
  /* `fast`: two frames at most this share of the display's frame settle a
   * device at full quality at once (a fast device in the dark ~0.05 s). */
  fastShare: 0.85,
  /* The end-to-end ms past which a calibration frame is drawn on its own
   * rAF, not in a burst (engine.ts frame): back to back, a frame near a
   * rung's edge read ~30% dearer than it runs. */
  burstFrameMs: 14,
  /**
   * AND WATCHED AFTER (a phone heating up, a tab beside it): from the end
   * of the arrival, an average frame interval over `slowShare` of its
   * rung's interval (`full`: the display's own rate, 24 ms at 60 Hz;
   * `capped`: every Nth frame, 37 ms at 30) for `slowSeconds` takes the
   * next rung down. The PICTURE never comes back: a scene that sharpens
   * and softens as the frame rate wanders is worse than one slightly soft.
   */
  slowShare: { full: 1.44, capped: 1.11 },
  slowSeconds: 1.5,
  /**
   * THE FRAME RATE MAY COME BACK (2026-10-23, the user's approval: every
   * pixel the same, only steadier). A visit capped in the dark by a
   * passing load, once the arrival is over, times its frames on the GPU's
   * clock for `seconds` (no frame waited for: the timer's answers arrive
   * frames later); if `quantile` of them fit the next faster rung of the
   * same tier within `share` — the dark's own margin: timed at the slower
   * rate the GPU runs at a lower clock, so they read dearer than they will
   * run — it steps up, one rung at a time. Never once the watcher has
   * stepped it down; never a tier.
   */
  stepUp: { seconds: 2.5, quantile: 0.9, share: 0.88, minFrames: 30 },
  /**
   * Quality tiers, cheapest cut first: the air's pressure solve and the fog
   * sheets give way before the composite's pixels do.
   *
   * TWO RESOLUTIONS. The scene (fog, lake, stone) is rendered to at most
   * `scenePixels` device pixels — its light has little finer than that — and
   * the film pass then develops it at the screen's own resolution (up to
   * `outputDpr`), putting back the photograph's full detail and the grain at
   * every device pixel. A 4K screen gets a 4K print for a fraction of a 4K
   * render. And at most `sceneDpr` scene pixels to a CSS px.
   *
   * A PHONE KEEPS ITS SHARPNESS (2026-10-22): the slowest tier drew the
   * whole screen at 1.5 device px to the CSS px, every edge softer; now
   * only the scene is drawn at 1.5, and the film still prints at 2,
   * putting back the photograph's detail and the grain there.
   */
  tiers: [
    { pressureIterations: 20, volumeScale: 1, scenePixels: 3.7e6, outputDpr: 2, sceneDpr: 2 },
    { pressureIterations: 12, volumeScale: 0.75, scenePixels: 2.2e6, outputDpr: 2, sceneDpr: 2 },
    { pressureIterations: 10, volumeScale: 0.6, scenePixels: 1.2e6, outputDpr: 2, sceneDpr: 1.5 },
  ],
} as const;
