# Hero load speed — what changed (2026-10-04)

A change note for the load-speed work, phases 1 and 2. It covers what was slow, what moved where, and what changed in the flower (bloom/) while that is still being built, plus the rules that keep a first visit fast.

The look did not change. Every step was checked frame against frame with the clock frozen: 5 moments, 3 screen sizes, camera leans, 20 s of motion. In the end 0.02% of pixels moved, none by more than 6 levels of 255, all on sharp edges where the compiler orders the same arithmetic slightly differently. Every phase 2 step was bit-for-bit identical to phase 1.

## Why a first visit was slow

On Windows, every browser turns WebGL into Direct3D, and Direct3D's shader compiler (FXC) runs on the visitor's CPU. Two things made a first visit wait:

1. **One huge program.** FXC takes far longer over one big shader than over its parts. The stone's shading cost ~15 s inside the old scene shader, and 0.6 s in a program of its own. The browser also compiles only about two programs at once.
2. **Programs that write two outputs at once.** These are drawn into two render targets at once (MRT, `layout(location = 1) out`). The browser prepares each program for one target. A program drawn into two is compiled again, whole, on its first draw, and the page waits for it: the fog sheets cost 2.4 s, the flower 2.2 s.

Once the browser has cached the shaders, a repeat visit is fast (~1.4 s). Only a visitor's first visit pays.

## Results (GTX 1050 Ti + i7-8750H, production build, empty shader cache)

| | before | after |
|---|---|---|
| first live frame, first visit, CPU cool | ≈ 30 s | **3.1–3.7 s** |
| the same, CPU warm | | 4.1–5.1 s |
| the same, CPU heat-throttled (1.5–2.2 GHz) | | 7–12 s |
| repeat visit | ~1.6 s | ~1.4 s |
| GPU time a frame, 1920×1080 | ~18 ms | ~12 ms |
| still photo on screen | 0.1 s | 0.1 s |

"First live frame" is measured when the GPU has finished drawing it, not when the code asked for it. The old "25.6 s" counted only until the code asked; its GPU had ~5 s more to do (see MRT below).

Compile time is CPU time, so it scales with the visitor's processor and how hot it is. After hours of back-to-back benchmarks, this laptop (an i7-8750H) ran at 70–100% of its 2.2 GHz base clock instead of turbo, and every compile took twice as long. Fresh browser profiles also made Windows Defender scan thousands of new files during the test. The cool-CPU numbers are what a visitor's laptop normally sees.

## What moved where

The scene used to be one program. It is now drawn by several, and each pass reads what the earlier ones drew at the same pixel.

| pass | file | what it draws |
|---|---|---|
| bloom | `bloom/bloom.ts`, `bloom/shaders/bloom.ts` | the plant, its contact shade on the stone, the plant in the lake |
| stone | `stone/stone.ts`, `stone/shaders/slots.ts` | the stone as the camera sees it, and as the lake mirrors it: one ray per pixel into "slots" over a small rect round the stone |
| lake | `water/lake.ts`, `water/shaders/lake.ts` | the photograph of the shores reflected in the lake |
| scene | `stage/shaders/scene.ts` | everything put together: fog, shores, water, reading the three above |

Shared pieces, so the passes can never disagree:

- **`stage/uniforms.ts`** feeds every program its uniforms, one setter per GLSL chunk.
- **`stage/shaders/set.ts`** holds the fog-over-the-photograph helpers, moved out of `scene.ts` unchanged.
- **`water/shaders/surface.ts`** computes the lake under a pixel (the waves, the lapping, the reflected rays) once, for the three programs that need it.
- **`stage/shaders/pixel.ts`** gives a pixel's footprint on the water.

Values pass between programs in 32-bit float textures, read with `texelFetch` at the same pixel, so nothing is rounded on the way. A rect pass draws the scene's own full-frame triangle through a shifted viewport, so its pixels and their 2×2 derivative blocks are the scene's own.

### The fog sheets (`atmosphere/`)

- **One output.** The density and the light of the four sheets (8 values) used to be written to two targets at once. They are now packed as half floats, two to a 32-bit channel, into one unsigned target (`outPacked`). A tiny pass (`SHEETS_UNPACK_FRAG`) lays them back out into the same two half-float textures as before, so the values are identical, bit for bit.
- **One copy of the noise per sheet.** `billows()` (4 simplex noises) is called once per sheet, in a loop that runs to a uniform's count (`uCarriedSets`). It used to be called twice for a near sheet and once for a far one, and the compiler pasted the noise six times over. This cut the pass's compile from 1.7 s to 0.7 s. The same calls and the same sums in the same order: bit-for-bit identical.

## What changed in the flower (bloom/) in phase 2 — since rebuilt, see below

The plant's shape, light and look are untouched. `BLOOM_GLSL`, the tepals, stems, tube, heart, `bloomTrace` and `bloomContact` are all as they were. Only how the pass hands out its pictures changed.

**`bloom/shaders/bloom.ts`, `BLOOM_FRAG`**
- **Before:** two outputs, `outPlant` (location 0) and `outContact` (location 1), written by every draw.
- **Now:** one output, `outColor`, chosen by a new uniform `uBloomOutput`:
  - `0`: the plant (light premultiplied, cover). Same as `outPlant` was.
  - `1`: the stone's contact shade under the plant. Same as `outContact` was. This draw traces only the stone and calls `bloomContact`; it skips `bloomTrace`.
- `uBloomMirror` is unchanged and still picks the mirrored view.

**`bloom/bloom.ts`, `BloomPass`**
- **Before:** two 2-target framebuffers (near and mirror), two draws.
- **Now:** three single targets and three draws per frame:
  1. `near`: the plant, camera view (`uBloomOutput = 0`)
  2. `contact`: the contact shade under it, camera view (`uBloomOutput = 1`)
  3. `mirror`: the plant as the lake mirrors it (`uBloomOutput = 0`, mirrored)
- The mirror's contact output was never read, so it is no longer drawn.
- `bindScene` hands the scene `near.tex`, `contact.tex` and `mirror.tex` at the same units as before. The scene reads them exactly as before.

**When you add the next steps (the opening, the air, pollen, the seed per visit):**
- **Keep one output per draw.** If the flower needs another picture, add a value of `uBloomOutput` (or a draw) and a target. Never a second `out` in the same draw: under Direct3D it costs a whole second compile on the first frame.
- **Keep loops running to uniform counts** (`uBloomLoops`). Direct3D's compiler pastes a constant-count loop's body once per turn.
- **Use `textureLod` / `texelFetch`, never `texture()`,** if the flower ever reads a texture.
- **Watch its cold compile.** The flower is one of the two longest compiles now (~1.5 s), and the first frame waits for the last program to finish. More shape code makes a first visit wait longer, so measure each step cold, as below.

## The flower rebuilt (2026-10-05)

The traced flower (flat pieces hinged together, found by rays in `BLOOM_FRAG`) was replaced by a modelled one: the user saw its stems and tepals as cardboard cutouts. Everything below about `BLOOM_FRAG` and `uBloomOutput` is history.

**Now (`bloom/`):**
- `shape.ts` models the plant as surfaces swept along curves ("spines"). A fixed mesh is laid over them, and the CPU poses the spines each frame into a small RGBA32F texture: about 600 samples, ~25 KB, ~0.3 ms of the main thread, no allocations.
- `shaders/bloom.ts` has two programs:
  - `PLANT_VERT` + `PLANT_FRAG` draw the mesh into a supersampled target (3–4 samples a pixel each way, with a depth test).
  - `RESOLVE_FRAG` averages it down to the scene's pixels and works out the stone's contact shade in the same draw. The near picture's alpha is what the plant leaves of what lies behind it, the contact shade folded in.
- One output a draw, as before: four draws a frame, all into single targets (near, resolved; mirror, resolved).
- The scene reads the near picture with `texelFetch` at its own pixel (its rect's corner sits on the scene's pixel grid) and the mirror bilinear, as before.
- `atmosphere/sampler.ts` reads the simulated air round the plant back to the CPU: a pixel-pack buffer and a fence, collected on a later frame. It costs ~0.05 ms and never stalls.

**Measured (GTX 1050 Ti + i7-8750H):**

| | traced (phase 2) | modelled |
|---|---|---|
| cold compile, alone | 1.8 s, one program | 0.46 s + 0.51 s, two programs, side by side |
| first live frame, cold, production | 3.1–3.7 s | 3.4–3.5 s (CPU warm) |
| GPU, the plant's pass, 1080p | ~0.23 ms | ~0.21 ms |
| GPU, the plant's pass, 1440p | | ~0.3 ms |
| main thread a frame | ~0 | ~0.3 ms pose + ~0.15 ms draw calls |

**When you add to the flower:**
- More shape is more CPU posing or more vertices, not more shader. Keep the vertex stage's branches by kind, and keep the posing allocation-free (`Pose`: write floats, make no arrays per sample).
- Anything finer than a sample (filaments, anthers) is drawn a sample wide at least and as faint as it is narrow, blended after the solid parts. At its true width it would flicker as it moves. (The pollen is now drawn into the scene's light instead: see the evening's section below.)
- The rules below still hold: one output a draw, loops to uniform counts, levels named.

## The flower grown into a clump, and drawn at 4K (2026-10-05, later)

The user asked for a larger flower, a base that is not two stems pushed into bare stone, and a better 4K picture. What changed, and what it cost:

- **More shape, same two programs.** A larger flower (`BLOOM.scale` 1.45 → 1.75), five stems instead of two, a round woody old stem, four roots laid onto the stone's rounded surface (`shape.ts onStone`), a second bud with its bracts, bracts on the tube, and four moss cushions (a still mesh). The tepals have 20 × 9 vertices instead of 14 × 7. All of it is pose samples and mesh vertices. The mesh is ~21k vertices; the pose texture is 22 rows (~67 KB a frame).
- **4K: the plant at the screen's own pixels.** On a screen finer than the scene (a 4K screen's scene is 2565 wide), the plant is drawn and resolved at the screen's pixels (FINE). That picture is box-filtered down to the scene's pixels (NEAR, so the scene and the film see the same plant). The film pass puts the difference back (`post.ts`, THE PLANT PUT BACK): what lies behind the plant is the scene's light with the coarse plant taken out of it. It matches a true full-4K render to within grain. The film pays nothing measurable for it. Drawing the plant at 4K costs ~0.05 ms more than at 2565.
- **The contact shade read in chunks.** With roots and five stems, the shade under them read 80 points for every pixel. At 4K's pixel count that alone was 0.4 ms. Now the points are read in chunks of four, each with a bounding sphere (`uChunks`), and a pixel reads only the chunks whose shade reaches it. The cost is ~0 ms, and the picture is unchanged.
- **Noise from a texture, not from arithmetic.** The new textures (the stems' mottle, the bark, the moss) first called a hashed value noise 12 times. That made the plant program's cold compile 2.6× longer (0.46 → 1.2 s). Hoisting it to four calls still gave ~0.9 s. Each call is pasted whole into the program, so the noise is now two reads of a 32³ RGBA8 volume (`NOISE_SIZE`): four values each, the texture unit doing the filtering.
- **Pose.** ~0.45–0.5 ms a frame (from ~0.3 ms), mostly the 760 tepal samples. The tepals' small sideways sweep uses a cubic sine and cosine instead of `Math.sin`/`Math.cos` (exact to under a micron), which saved a third of the tepals' time.

**Measured (GTX 1050 Ti + i7-8750H), old and new in the same session:**

| | before (two stems) | now (the clump) |
|---|---|---|
| plant program, cold compile alone | 0.30–0.36 s | 0.54–0.61 s |
| resolve program, cold compile alone | 0.22–0.43 s | 0.24–0.29 s |
| film program, cold compile alone | 0.15–0.20 s | 0.17–0.21 s |
| first live frame, cold, production (8 rounds each, alternating, CPU hot) | 5.0–9.5 s, median ~7.6 | 3.8–9.0 s, median ~5.1 |
| GPU, the plant's pass, 1440×810 | | ~0.25–0.3 ms |
| GPU, the plant's pass, 1920×1080 | ~0.21 ms | ~0.42 ms |
| GPU, the plant's pass, 2560×1440 | ~0.3 ms | ~0.54 ms |
| GPU, the plant's pass, 3840×2160 (FINE) | | ~0.68 ms |
| main thread a frame (pose) | ~0.3 ms | ~0.45–0.5 ms |

The plant program compiles in parallel with the scene (~1.5 s), so its extra 0.25 s did not lengthen the first frame. The CPU was hot that day, and both builds took longer than the 3.4 s measured earlier. The first-frame timing script had a race: before the stylesheet applied, the stage's opacity read 1. It now waits until it has seen the stage hidden.

**A bug this exposed.** On a wide frame the lens closes in, and the plant's reflection can fall wholly below the frame. With no mirror picture, `bindScene` used to drop the near one too, and the plant vanished from the 21:9 still. Each picture is now bound on its own.

## The flower's light, its pollen, and the base set into the stone (2026-10-05, evening)

The user asked for the bloom to start sooner, for a subtle glow that draws the eye without pulling it from the title, for the hand's touch to be noticeable (glowing pollen, their idea), and for the root to sit in the moss instead of floating. What changed, and what it cost:

- **The light it holds: one tiny new program.** The cup is lit from within (a few lines in `PLANT_FRAG`, `BLOOM.glow.lantern`). The soft light in the fog round it is a HALO picture: the near picture's light past a threshold (the petals, never the stems), gathered to a few scene pixels a texel round the flower's box, then blurred one way and the other (`HALO_FRAG`, three small draws, `bloom.ts drawHalo`). The film adds it (`post.ts`), mostly round the plant and only a quarter over it: laid evenly over the flower it looked out of focus. It is its own program, not a mode of the resolve, because the resolve carries the stone's shape and the contact shade. It compiles cold in ~0.04 s.
- **The pollen drawn into the scene's light, not into the plant's pictures.** The motes drift up to ~70 cm from the flower now. Kept in the plant's supersampled pictures, they would have grown the rect wherever they went and cost the flower its samples. They are drawn by `PLANT_*` as points, added straight into the scene's half-float target after the scene pass, before the diffusion (`bloom.ts drawMotes`, ONE + ONE on light, alpha untouched). Then again mirrored for the lake. A mote's core is never drawn finer than 0.6 px; finer, its light swam as it crossed the pixel grid. Its brightness is scaled by the share of its true size, so it is the same speck on every screen. Its halo has its own brightness: tied to the core's, the halo swelled into bokeh orbs at 4K.
- **The stems laid on the stone** (`shape.ts layOnStone`, `StemDesign.rest`). Like the roots: drawn freely, then eased onto the stone (`onStone`), smoothed, resampled to equal steps, and laid once more. The last lay is needed because the steps' chords cut into the stone over an arris. Which margin touches is chosen once per stem; chosen per sample, it switched sides over an arris and the blade folded over itself. The sway is held where a stem rests. All of it is computed once at load, in the rest pose.
- **The moss** climbs the old stem (`collar`). Its back is several soft rises, not one dome. It has a thin grit apron past its outline, nearly invisible from this eye line (a 3 cm apron at 4° is about a pixel), but it softens the line where the moss meets the stone. The small cushions use a coarser mesh than the mat (36 spokes, 9 rings): the mesh is ~23.5k vertices.

**Measured (GTX 1050 Ti + i7-8750H), the same session.** Cold compiles alternate five rounds between this round's programs and the same programs with this round's additions cut out. GPU timings interleave their variants frame by frame: run back to back, every run after the first read 2–5× slower, whatever was switched off, because the GPU drops its clock under a light load.

| | before | now |
|---|---|---|
| plant program, cold compile alone | ~0.40 s | ~0.43 s |
| resolve program, cold compile alone | ~0.20 s | ~0.20 s |
| film program, cold compile alone | ~0.13 s | ~0.15 s |
| halo program, cold compile alone | | ~0.04 s |
| first live frame, cold, production (4 runs, CPU cool) | | 2.4–3.0 s |
| GPU, the halo (three small draws) | | ~0.02–0.05 ms |
| GPU, 220 motes (the most at once) | | 0.01–0.03 ms |
| GPU, the plant's pass, 1440×810 | ~0.25–0.3 ms | ~0.27 ms |
| GPU, the plant's pass, 3840×2160 (FINE) | ~0.64 ms at 3×3 samples | ~0.80–0.86 ms at 4×4 |
| main thread a frame (pose and pollen) | ~0.45–0.5 ms | ~0.25–0.43 ms, +0.07 ms with 220 motes |

At 4K the plant's rect is now a little smaller (391 × 358 px against 425 × 361): the stems hug the stone. That brings it under the sample budget for 4 × 4 samples a pixel instead of 3 × 3. The extra ~0.2 ms is the plant drawn finer. The same geometry, sampled the same way, costs the same as before; this was checked by putting last round's base back and timing both.

## The low mist (2026-10-16)

The user asked for the steam fog of their reference frame (`assets/sources/mist/reference.webp`), and for a hybrid: the real mist and the simulation both. What it is, and what it cost:

- **The real mist is a small image, not a simulation.** The reference's mist is read off as optical depth per direction from the camera at rest, and fitted through the engine's own film until the engine's frame matches the reference. The fit is `npm run mist` (`scripts/hero-plates/mist.py`), run on captures of the engine itself. The result is one veil, `public/hero/mist/veil.webp`: one channel, 2000 × 1158, ~60 KB, preloaded with the shores and loaded beside them (`stage/plates.ts`; without it the stage runs bare).
- **No new program.** The veil is one read and a few multiplies inside the scene program (`atmosphere/shaders/mist.ts`, applied in `scene.ts` to what lies behind the stone). Its own full-frame pass would have cost a pass's fill and a second read of the sheets for less.
- **The simulation moves it for free.** It breathes with the fog sheets' densities, which the scene already reads at every pixel. There is no new texture and no new pass.
- **Measuring through the engine, not a model.** The engine's print curve and the mist's light differ from any formula. So each fit round captures, at the same instant, the frame without the mist, with it, and under endless mist (the mist's own light, per pixel), and steps the veil toward the reference. A first fit with one assumed light flipped sign where the real light was brighter, and left a patch of trees bare.

**Measured (GTX 1050 Ti + i7-8750H), the same session.** Cold compiles alternate between the scene program with and without the mist code (five rounds each, twice). GPU timings interleave mist on and off frame by frame.

| | without | with the mist |
|---|---|---|
| scene program, cold compile alone (CPU cool) | 1.14–1.25 s, median 1.17 | 1.16–1.42 s, median 1.25 |
| scene program, cold compile alone (CPU warm) | 2.5–3.4 s, median 2.9 | 1.9–4.4 s, median 2.8 |
| GPU, the scene pass, 1440×810 | 2.25 ms | 2.32 ms |
| GPU, the scene pass, 1920×1080 | 3.98 ms | 4.09 ms |
| GPU, the scene pass, 3840×2160 (scene 2565×1443) | 6.03 ms | 6.24 ms |
| download | | +60 KB, in parallel with the shores |
| first live frame, cold, production (5 rounds each, alternating) | 2.89–4.18 s, median 3.01 | 2.91–3.37 s, median 2.95 |

The scene is the longest program, so its extra ~0.07 s is what a first visit waits for, and it is lost in the noise of a whole first visit. Nothing else is added.

**A measuring trap this hit.** A test page left open after a first-frame run keeps the live scene running in the headless browser's GPU process. With that, and the machine busy, the same build's first frame read 5–14 s. Each run now blanks its page as soon as it has measured, and old and new are run alternately, so both see the same machine.

## The mist moving, the stone in it, the right bank shorter (2026-10-16, later)

Three changes the user asked for, and what each costs:

- **The right bank a tenth shorter** is in the photograph itself (`backdrop.py` `BANK_HEIGHT`). It costs nothing at run time; the plate and depth came out 8 KB and 7 KB smaller.
- **The patches that drift through the low mist** are one small texture made at start (`atmosphere/wisps.ts`: 128 × 128, two half-float channels, 64 KB of GPU memory) and two reads of it in the scene program, only where there is mist.
  - Making it takes ~17 ms of cold JavaScript on a first visit, most of it V8 warming to the code, while the shaders compile. Three running-sum boxes in indexed loops; a plain Gaussian took ~40 ms.
  - The first build's second layer was finer (curls, bent by the patches and stretched tall). The user saw it as a wavy pattern over their mist and asked for the previous look back, and one gentle layer alone did not read as moving. Now both layers are broad, unbent and stronger: the mist moves ~10 levels over 9 s, and its fine texture and averages stay within a few percent and ~3 levels of the previous look in motion (+65% fine texture with the curls).
- **The mist round the stone** is a few multiplies on the stone's pixels. Its height comes from the stone's own slots, whose alpha now carries how far along the ray the stone was met, not just that it was.

**Measured (GTX 1050 Ti + i7-8750H), the same session.** Cold compiles alternate old and new scene sources (five rounds). GPU timings interleave three states frame by frame: no mist, the mist held still, and the mist moving.

| | before | now |
|---|---|---|
| scene program, cold compile alone | 1.24–1.56 s, median 1.32 | 1.30–1.42 s, median 1.32 |
| GPU, the scene pass, 1440×810 (300 frames, twice) | no mist 2.43 ms, still 2.53 | moving 2.56 ms (+0.03 for the patches; +0.08 with the curls) |
| GPU, the scene pass, 3840×2160 (scene 2565×1443, 300 frames) | no mist 6.1–7.1 ms, still 6.4–6.9 | moving 6.4–7.3 ms (the patches under the noise) |
| downloads | | −18 KB (plate, depth, veil) |
| first live frame, cold, production, alternating, 4 rounds with the CPU cool | 2.95–4.39 s, median 3.38 | 2.99–3.77 s, median 3.42 |
| the same, all 10 rounds (6 more as the CPU heated: 3.4–8.8 s for both) | | new − old, paired: median −0.18 s |
| longest main-thread task on a first visit | median ~280 ms | median ~310 ms |

"Before" for the first frame is the committed site, without any of the low mist. A first visit is unchanged within its noise. The longest main-thread task grew ~30 ms, ~17 ms of it making the patches; it runs while the shaders compile, so the first frame does not wait for it. (Measured with the first build's two layers; one layer takes the same time cold.)

**Measuring the 4K pass needs long runs.** At 90 frames the GPU's clock changes put "still" under "no mist" in two runs of three; at 300 frames the order held.

## The mist lit as a volume (2026-10-16, later)

The user found the drifting mist "a white colour something moves, not like a real mist": it was lit by one flat grey, so a patch only changed how much of the trees it hid. Three cues of a real volume were added, all from what the scene already reads:

- **Lit from the sky, shaded in itself.** Each patch is brighter on its side toward the light (the sky above, leaning toward the open lake) and darker on the other, and its dense core is in its own shade (`MIST.volume` in `atmosphere/optics.ts`, `shaders/mist.ts`).
  - The light needs the patches' slopes. They are precomputed with the patches at start (`wisps.ts`: a two-layer RGBA16F array of density and its slope across and up), so no read is added. Finding the slope by reading again a step away would have doubled the patches' reads.
- **Two depths.** The two layers of patches lie at two distances: the nearer one larger on the screen and faster across it, as nearer mist is.
- **The sky's lean.** The whole mist is a little brighter toward the opening and up toward the sky, greyer low on the water: a few multiplies.

**A true volume was ruled out:** stepping through a 3D fog many times per pixel costs a read per step, and its compile is paid on every first visit.

**Measured (GTX 1050 Ti + i7-8750H), the same session.** Cold compiles alternate the scene source before and after (five rounds). GPU timings interleave no mist, the mist held still, and the mist moving, frame by frame, 300 frames.

| | before | now |
|---|---|---|
| scene program, cold compile alone | 1.24–1.81 s, median 1.50 | 1.31–1.60 s, median 1.36 |
| GPU, the scene pass, 1440×810, the moving mist over the still | +0.03 ms | +0.07 ms (twice: 2.60/2.52 and 2.60/2.53 ms) |
| GPU, the scene pass, 3840×2160 (scene 2565×1443) | | no mist 6.32 ms, still 6.41, moving 6.63 |
| making the patches at start, cold JavaScript | ~17 ms | ~22 ms (the slopes), while the shaders compile |
| texture memory | 64 KB | 256 KB |

The still mist was refitted under its new light (three steps, held still): over trees and water −0.3 and −0.4 levels from the reference on average, the same contrast. In motion, the averages stay within ~3 levels of the previous look, and nothing finer than the patches is added.

## The low mist off, and the user's regrade (2026-10-16, evening)

The user brought a new reference: their own frame of this scene, made before the low mist, printed darker and harder. Registered onto the engine's frame, its mist is the engine's frame without the low mist, to ~2 levels; its tones are one curve on every pixel. So:

- **The low mist is off** (`MIST.on` in `atmosphere/optics.ts`). Off, nothing of it is paid: the veil is not fetched (−56 KB), the patches are not made (−~22 ms of JavaScript at start), and the scene compiles without its code.
- **The print goes through their curve** (`FILM.regrade` in `stage/optics.ts`): a 65-sample table, three reads of it per pixel in the film pass (`film.ts` `regrade`), after the paper and before the grain.

**Measured (GTX 1050 Ti + i7-8750H), the same session.** Cold compiles alternate old and new sources (five rounds). The film pass's GPU time was read with the curve's line in and out, alternated; the GPU was shared with a live page, so the absolute times are high.

| | before | now |
|---|---|---|
| scene program, cold compile alone | 1.34–1.71 s, median 1.53 (with the low mist) | 1.26–1.60 s, median 1.27 (without) |
| film program, cold compile alone | 0.16–0.18 s, median 0.16 | 0.18–0.32 s, median 0.19 (with the curve) |
| GPU, the film pass, 3840×2160 | 3.29–3.63 ms (without the curve) | 3.29–3.66 ms (with it) |
| downloads | | −56 KB (the veil) |

The film program compiles beside the much longer scene program, so its extra ~0.03 s is not on a first visit's path.

## The fog lifted off the water (2026-10-17) — rolled back

A lifted bank of fog (thicker above a base ~6 m over the water, the air under it cleared and in its shade) was built after a reference of the user's and rolled back the same day at their word: not good enough. Two lessons from it stand:

- **Keep work out of the fog sheets' loop.** `fogBetween` is copied into the shader once per sheet at every place fog is drawn: a few lines there added ~0.1 s to the scene's first compile.
- **No `log`/`exp` pair where a cheaper curve will do.** Direct3D's compiler is slower over the transcendental pair.

## The air by place, the user's crop and their next print (2026-10-17)

The user brought their next print of this scene (`assets/sources/grade/reference-2.webp`) with two marks on it, and asked for their tree placement too:

- **Their print.** ~15% darker again, composed onto the first curve (`FILM.regrade`): the same 65-sample table, new values. No new cost.
- **Their crop.** A longer lens from the same place (`CAMERA.zoom` 1.093): one constant in `focalPx`. No cost. The first-paint stills were retaken (`still.py`): the bands moved with the lens, and each is now taken where every screen in its band is a crop of it. The first paint on a 1080p screen is 46 KB, as before (45 KB).
- **The air by place** (`LOCAL_AIR` in `atmosphere/optics.ts`): two soft regions in the directions of the camera at rest, as `set.ts` `localAir` — two `exp`s and a few multiplies, no reads — called twice in the scene (the fog held still by the ray's direction, the haze laid on the photograph's point) and twice in the lake.

**Measured (GTX 1050 Ti + i7-8750H), the same session.** Cold compiles alternate the source with `localAir` returning zero (which the compiler folds away: the build without it) and the source as built. GPU times are medians of 300 frames each, the shader edited in and out between runs, alternated three times.

| | without | with |
|---|---|---|
| scene program, cold compile alone (6 rounds; then 8 with the CPU warmer) | median 1.52 s; 1.99 s | median 1.64 s; 2.01 s (within the rounds' spread) |
| lake program, cold compile alone (6 rounds) | median 0.76 s | median 0.74 s |
| GPU, the scene pass, 1440×810 | 2.02–2.10 ms | 1.99–2.02 ms |
| GPU, the lake pass, 1440×810 | 1.75–1.78 ms | 1.70–1.73 ms |

## Tried in phase 2 and not kept

Each was measured and turned down.

- **Starting the longest compiles first, or last.** Chrome on Windows does not compile in the order programs are created, and neither order was reliably faster. The original order is kept.
- **Splitting the scene into a land pass and a water pass.** The water is almost all of the scene's compile, so the split saved nothing in total.
- **Running the lake's 26 waves in a loop to a uniform's count.** It saved under 0.1 s per program.

## Rules for any shader in the hero

1. **Split heavy subjects into their own small programs.** The compiler's time grows much faster than the program's size, and smaller programs also run faster (the scene frame got ~40% cheaper).
2. **One output per program draw.** No MRT.
3. **Make loops around heavy calls run to a uniform's count, and call each heavy function once per path.**
4. **Name every texture read's level** (`textureLod` / `textureGrad` / `texelFetch`).
5. **Measure both ways, cold compile and frame cost.** A first visit waits once, every frame pays: one change that compiled faster but ran 45% slower was refused.

## How it was measured

- **Browser:** headless Edge, a brand-new profile each time (an empty shader cache), driven over the DevTools protocol.
- **First live frame:** a one-pixel `readPixels` right after the first draw onto the canvas, which returns only once the GPU has finished.
- **Compile per program:** sources captured from the page and compiled cold, alone and together.
- **Pictures:** `requestAnimationFrame` frozen, the stage stepped with `__kaviStage.advance()` in development, and PNGs compared pixel by pixel.
- **GPU cost:** `__kaviStage.gpuTimings()`.

Delete old test profiles. Dozens of them (several GB) left in a temp folder kept Windows Explorer and Defender busy and doubled every timing.

## Appendix: the exact change to the flower

`bloom/` is not in git yet, so `git diff` does not show it. This is everything that changed there in phase 2. Before is the flower as it was on 2026-10-04, after its first build step.

```diff
--- bloom/bloom.ts (before)
+++ bloom/bloom.ts (now)
@@ -2,22 +2,20 @@
  * ─── Bloom · its pass ───
  *
  * The plant is drawn by its own small program (shaders/bloom.ts BLOOM_FRAG)
- * into two pictures the scene pass reads: the plant as the camera sees it,
- * with the stone's contact shade under it, over a rect round the plant; and
+ * into the pictures the scene pass reads: the plant as the camera sees it,
+ * and the stone's contact shade under it, over a rect round the plant; and
  * the plant as the still lake mirrors it, over the rect where that falls,
  * at half the resolution (the lake blurs it anyway). Each rect follows the
  * camera's lean every frame; its size is fixed by the frame's.
+ *
+ * ONE PICTURE A DRAW: three draws into three targets, never one draw into
+ * two (shaders/bloom.ts BLOOM_FRAG: a program drawn into two targets at once
+ * is compiled again on its first draw under Direct3D). The contact's draw
+ * traces only the stone.
  */
 
 import { CAMERA, CAMERA_UNIFORMS, focalPx, setCameraUniforms, type CameraFrame } from "../stage/camera";
-import {
-  bindTexture,
-  createMultiTarget,
-  createProgram,
-  deleteTarget,
-  type MultiTarget,
-  type Program,
-} from "../stage/gl";
+import { bindTexture, createProgram, createTarget, deleteTarget, type Program, type Target } from "../stage/gl";
 import { STONE } from "../stone/optics";
 import { BLOOM, bloomBound } from "./optics";
 import { BLOOM_FRAG } from "./shaders/bloom";
@@ -73,8 +71,9 @@
   private readonly gl: WebGL2RenderingContext;
   private readonly vao: WebGLVertexArrayObject;
   private readonly program: Program;
-  private near: MultiTarget | null = null;
-  private mirror: MultiTarget | null = null;
+  private near: Target | null = null;
+  private contact: Target | null = null;
+  private mirror: Target | null = null;
   /* Half the rect's side, CSS px. */
   private half = 1;
   private readonly nearRect: [number, number, number, number] = [0, 0, 1, 1];
@@ -89,7 +88,7 @@
       "uTube", "uTubeRadius", "uStem", "uStemWidth", "uStemFace",
       "uPetal", "uSepal", "uLeaf", "uTubeTone", "uAnther", "uBloomLight", "uBloomBound", "uBloomContact",
       "uBloomLoops", "uLit", "uStonePlan", "uStoneSpan", "uStoneWeather", "uStoneLight", "uLightSide",
-      "uBloomRect", "uBloomMirror",
+      "uBloomRect", "uBloomMirror", "uBloomOutput",
     ]);
   }
 
@@ -103,19 +102,22 @@
     const gl = this.gl;
     if (this.near?.width !== side) {
       deleteTarget(gl, this.near);
-      this.near = createMultiTarget(gl, side, side, gl.RGBA16F, gl.LINEAR, 2);
+      deleteTarget(gl, this.contact);
+      this.near = createTarget(gl, side, side, gl.RGBA16F, gl.LINEAR);
+      this.contact = createTarget(gl, side, side, gl.RGBA16F, gl.LINEAR);
     }
     if (this.mirror?.width !== mirrorSide) {
       deleteTarget(gl, this.mirror);
-      this.mirror = createMultiTarget(gl, mirrorSide, mirrorSide, gl.RGBA16F, gl.LINEAR, 2);
+      this.mirror = createTarget(gl, mirrorSide, mirrorSide, gl.RGBA16F, gl.LINEAR);
     }
   }
 
-  /** Draws both pictures for this frame's camera. */
+  /** Draws the three pictures for this frame's camera. */
   render(camera: CameraFrame, colors: BloomColors, state: BloomState): void {
     const near = this.near;
+    const contact = this.contact;
     const mirror = this.mirror;
-    if (!near || !mirror) return;
+    if (!near || !contact || !mirror) return;
     const gl = this.gl;
     const u = this.program.uniforms;
     gl.bindVertexArray(this.vao);
@@ -125,9 +127,12 @@
 
     rectOf(this.nearRect, camera, [BOUND[0], BOUND[1], BOUND[2]], this.half);
     rectOf(this.mirrorRect, camera, [BOUND[0], -BOUND[1], BOUND[2]], this.half);
-    for (const [target, rect, on] of [
-      [near, this.nearRect, 0],
-      [mirror, this.mirrorRect, 1],
+    /* [target, rect, mirrored, output]: the plant, the stone's contact
+       under it, the plant in the lake. */
+    for (const [target, rect, on, output] of [
+      [near, this.nearRect, 0, 0],
+      [contact, this.nearRect, 0, 1],
+      [mirror, this.mirrorRect, 1, 0],
     ] as const) {
       gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
       gl.viewport(0, 0, target.width, target.height);
@@ -135,17 +140,18 @@
       /* The mirror's blur: the lake's unseen ripples, as an angle — about
          what the stone's reflection is blurred by under the plant. */
       gl.uniform2f(u.uBloomMirror, on, on ? BLOOM.mirrorBlur : 0);
+      gl.uniform1f(u.uBloomOutput, output);
       gl.drawArrays(gl.TRIANGLES, 0, 3);
     }
   }
 
-  /** Hands the scene pass the two pictures (texture units from `unit`). */
+  /** Hands the scene pass the three pictures (texture units from `unit`). */
   bindScene(u: Record<string, WebGLUniformLocation | null>, unit: number): void {
     const gl = this.gl;
-    if (!this.near || !this.mirror) return;
-    bindTexture(gl, u.uBloomNear, unit, this.near.texs[0]);
-    bindTexture(gl, u.uBloomContact, unit + 1, this.near.texs[1]);
-    bindTexture(gl, u.uBloomMirror, unit + 2, this.mirror.texs[0]);
+    if (!this.near || !this.contact || !this.mirror) return;
+    bindTexture(gl, u.uBloomNear, unit, this.near.tex);
+    bindTexture(gl, u.uBloomContact, unit + 1, this.contact.tex);
+    bindTexture(gl, u.uBloomMirror, unit + 2, this.mirror.tex);
     gl.uniform4f(u.uBloomRect, ...this.nearRect);
     gl.uniform4f(u.uBloomMirrorRect, ...this.mirrorRect);
     gl.uniform1f(u.uBloomPlane, BOUND[2]);
@@ -155,8 +161,10 @@
     const gl = this.gl;
     gl.deleteProgram(this.program.handle);
     deleteTarget(gl, this.near);
+    deleteTarget(gl, this.contact);
     deleteTarget(gl, this.mirror);
     this.near = null;
+    this.contact = null;
     this.mirror = null;
   }
 
--- bloom/shaders/bloom.ts (before)
+++ bloom/shaders/bloom.ts (now)
@@ -19,8 +19,9 @@
  * shader Direct3D (every Windows browser) already takes long to compile:
  * cold, it doubled from ~40 s to ~80 s and the GPU's watchdog killed it.
  * Here it is a small program of its own, drawn over a small rect round the
- * plant — once as the camera sees it, once as the still lake mirrors it —
- * and the scene only reads the two pictures (stage/shaders/scene.ts).
+ * plant — as the camera sees it (and the stone's contact shade under it),
+ * and as the still lake mirrors it — and the scene only reads the pictures
+ * (stage/shaders/scene.ts).
  * Every loop runs to a uniform's count, never a constant: Direct3D's
  * compiler unrolls a constant loop into copies of its body.
  *
@@ -412,18 +413,25 @@
 
 /**
  * The plant's pass, over its rect of the frame (stage/engine.ts runs it
- * before the scene): its light, premultiplied, and its cover; and, on the
- * stone under it, the share of the sky the stone keeps (1 elsewhere).
+ * before the scene). One output a draw, chosen by `uBloomOutput`:
+ *   0  the plant: its light, premultiplied, and its cover
+ *   1  on the stone under it, the share of the sky the stone keeps (1
+ *      elsewhere) — a draw of its own, which traces only the stone
  * `uBloomMirror.x` set: the plant as the still lake mirrors it — the same
  * rays from the camera's image under the water — its outline softened by
  * `uBloomMirror.y` (radians), the blur the lake's unseen ripples give.
+ *
+ * NEVER TWO OUTPUTS AT ONCE. Under Direct3D the browser compiles a program
+ * for one render target; drawn into two (`layout(location = 1) out`), it is
+ * compiled again, whole, on its first draw, on the GPU process's main
+ * thread — 2.2 s of a first visit for this one, everything waiting
+ * (stage/shaders/scene.ts, the top).
  */
 export const BLOOM_FRAG = /* glsl */ `#version 300 es
 precision highp float;
 
 in vec2 vUv;
-layout(location = 0) out vec4 outPlant;
-layout(location = 1) out vec4 outContact;
+out vec4 outColor;
 
 ${CAMERA_GLSL}
 /* the full sky light */
@@ -437,6 +445,8 @@
 uniform vec4 uBloomRect;
 /* the mirror: on (1) or off, and its blur */
 uniform vec2 uBloomMirror;
+/* which output this draw writes: 0 the plant, 1 the stone's contact */
+uniform float uBloomOutput;
 
 void main() {
   vec2 uv = uBloomRect.xy + vUv * uBloomRect.zw;
@@ -461,13 +471,16 @@
   vec3 onStone = from + ray * t;
   bool stone = t > 0.0 && onStone.y >= 0.0;
 
+  if (uBloomOutput > 0.5) {
+    outColor = vec4(stone && !mirror ? bloomContact(onStone) : 1.0, 0.0, 0.0, 1.0);
+    return;
+  }
   vec3 color;
   float alpha;
   float depth;
-  outPlant = vec4(0.0);
+  outColor = vec4(0.0);
   if (bloomTrace(origin, ray, spread, color, alpha, depth) && !(stone && onStone.z < depth)) {
-    outPlant = vec4(color, alpha);
+    outColor = vec4(color, alpha);
   }
-  outContact = vec4(stone && !mirror ? bloomContact(onStone) : 1.0, 0.0, 0.0, 1.0);
 }
 `;
```
