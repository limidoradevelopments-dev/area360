# Hero performance audit: what costs, what to cut (2026-10-29)

The question was which shaders cost the most, and what can go while the picture stays as it is. For example, the lake's ripples: barely visible, but paid for at every pixel of the water.

**The short answer.** Three passes are over half the desktop frame: the lake's reflections of the shores, the fog sheets, and the composite. On a phone the stone is a fourth. The biggest wins are not in deleting effects. They are in work the picture never shows:

- the reflection march on phones, where the trees it searches for are not drawn;
- the fog volume drawn at four times the resolution its light needs;
- the stone's edge rays shaded on every stone pixel when only its outline uses them;
- the ripples' fourteen waves, whose only visible effect is a blur that can be had in one line.

Measured on this machine's GPU:

| | now | exact or invisible cuts (1–7) | plus the phone's scene at 1.5× (8) |
|---|---|---|---|
| phone, 375×812 at 2× | 21.4 ms | ~15 ms | **~10 ms** |
| 1920×1080 | 22.3 ms | **~15 ms** (with 9 and 10) | |

A phone GPU three times slower than this one would go from about 64 ms a frame (15 fps) to about 30 ms (a steady 30 fps).

Separately, the stone's faces carry a visible regular lattice pattern from a bad noise hash. It can be fixed for ~0.05 ms (see *Visual details*).

## Status: phase 1 done (2026-10-29)

The user's rule for phase 1: only optimisations, the picture unchanged. Four cuts are in. Each was proven against reference frames from the untouched code: 4 moments × 4 screen shapes, no pixel more than 1 level away (2 on a stray few). The details are in LOAD-SPEED.md.

| cut | what shipped | saved on this GPU |
|---|---|---|
| 1 + 9 | **The sky shortcut**, per ray rather than "phones only". The phones-only version moved up to 7 levels at 640–700 px wide. It now holds on every device, so desktops gain too. | phone lake 5.26 → 3.25 ms; 1080p lake −11% |
| 2 | Fog sheets at ¼ of CSS resolution | phone 1.13 → 0.31 ms; 1080p 7.46 → 1.93 ms |
| 3 | Stone edge rays shaded only where read. Every ray is still traced, because an early return broke the quad's derivatives. | phone 2.90 → 2.64 ms; bit-identical |
| 7 (half of it) | Glow pyramid single-channel; five levels kept | ~0.74 → 0.46 ms on the phone |

**The stone's lattice is fixed (2026-10-29).** Its noise is now read from a seeded lattice texture (`stone/noise.ts`), which ends the woven pattern. It is also slightly cheaper: about 1 ms per frame at phone size and about 0.08 ms at 1080p (LOAD-SPEED.md).

**Cut 4 is done by the user's choice (2026-10-29).** They turned the ripples, paw cover and glass to 0 on the tuner. Those parts are now left out of the build: bit-identical, −0.69 ms at phone size and −0.92 ms at 1080p (LOAD-SPEED.md).

Still open: 5 (air), 6 (grain), 8 (the phone's scene at 1.5×), 10, 11, 12 and 13. These change the picture slightly, or can't be proven by a frame diff, so they are waiting for the user's decision or for the low-quality tier.

---

## How it was measured

- **This machine:** an AMD Radeon integrated GPU (Ryzen APU, device 0x1638), ANGLE on Direct3D 11, the app's built-in Chromium, a development build. LOAD-SPEED.md shows the GPU numbers match production. This is not the GTX 1050 Ti of the earlier notes. It is slower, and it is the machine where the user sees the quality drop.
- **Per pass, on the GPU's own clock:** a timer query (`EXT_disjoint_timer_query_webgl2`) around each pass, every pass of the frame drawn in order, median of 90–120 frames.
- **Every cut was A/B'd frame by frame.** The cut's program was swapped in and out on alternate frames (A, B, A, B…). Its source was read back from the live program (`getShaderSource`), edited, relinked, and its `handle` and `uniforms` swapped. Clock drift hits both sides equally. The GPU's clock moved during the session (the same 1080p frame read 22 ms, later 28–29 ms), so compare savings within one A/B, not across rows.
- **Every cut's picture was diffed.** The whole canvas was read back with and without it, at the same frozen moment. The diff counts the pixels that moved by more than 2 and more than 5 levels of 255 (green channel: the print is monochrome).
- **Sizes:** 1024×768; 1920×1080; and a phone, 375×812 at 2× (750×1624) with an Android user agent, so the phone's own paths were on: no trees, the portrait crop, the tile hints.
- **Scale:** a phone GPU is ~3–10× slower than this one (the realme C11's PowerVR GE8322 is about a sixth of an Intel UHD 630, itself slower than this). Read the ms here as shares of the frame; on a phone, multiply.

## Where the frame goes

GPU ms per frame, full quality (tier 0), camera at rest:

| pass | what it draws | 1024×768 | phone 750×1624 | 1920×1080 |
|---|---|---|---|---|
| lake (`water/lake.ts`) | the shores reflected: a 40-step march + 6 halvings of the depth map, 4 photo reads, 20 waves | **3.3** | **5.5** | **5.4** |
| fog sheets (`atmosphere/`) | 4 sheets × ~18 simplex noises at half CSS res, + unpack | 2.9 | 1.3 | **4.8** |
| scene (`stage/shaders/scene.ts`) | the composite | 1.8 | 3.3 | 3.0 |
| stone seen (`stone/`) | 10 slots: 5 rays' light + the same 5 rays' normals | 0.5 | **3.3** | 1.1 |
| stone mirror + its surface | 4 cone rays, + the lake surface once | 0.6 | 1.8 | 0.8 |
| open water (`water/open.ts`) | the lake's light, 20 waves, the stone's foot | 1.2 | 2.4 | 1.7 |
| fluid (`atmosphere/fluid.ts`) | the air: 27 draws a step (20 of them pressure) | 1.4 | 0.9 | 1.9 |
| film (`stage/shaders/post.ts`) | print, detail put back, grain | 1.0 | 1.6 | 1.5 |
| glow (diffusion pyramid) | 9 draws, RGBA16F | 0.5 | 0.7 | 1.4 |
| flowers (`bloom/`) | mesh at 4×4 samples, resolve, halo | 0.4 | 0.6 | 0.6 |
| rain, pollen | | ~0 | ~0 | ~0.1 |
| **total** | | **13.4** | **21.4** | **22.3** |

What it says:

- **The lake is the largest pass everywhere, about a quarter of the frame.** A ray reflecting sky or the far shore runs 38 of the 40 march steps plus 6 halvings: ~44 dependent reads of the depth map per water pixel.
- **On a phone the stone is a quarter of the frame (5.1 ms).** The portrait crop makes it half the frame's width, and each of its pixels is traced 10 times. Its four edge rays are fully shaded everywhere.
- **On desktop the fog sheets come second (21%):** 960×540 pixels, each with ~18 3D simplex noises.
- **Why this machine drops quality.** At 1080p it needs ~22 ms. On a 120 Hz screen, the 40 fps rung holds only while the GPU's work is at most 0.88 × 25 ms = 22 ms, so it sits exactly on the line. A busy moment pushes the frame average past the watcher's limit (`RENDER.slowShare`). The watcher then steps down a tier, and the picture never comes back for the visit. On a 60 Hz screen it gets full quality at 30. About 7 ms less puts it at full quality at 60 with room to spare.

## The cuts, ranked

| # | cut | saves (measured) | picture | effort |
|---|---|---|---|---|
| 1 | Phones: no reflection march where no trees are drawn | phone −1.9 ms (−38% of the lake) | **identical** (max 1 level) | S |
| 2 | Fog sheets at ¼ CSS resolution instead of ½ | 1080p −73% of the pass (~−3.5 ms); phone ~−0.9 | **identical** at rest and mid-stir (max 1 level) | S |
| 3 | Stone: edge rays shaded only where the scene uses them | phone up to −1.2 ms (−40% of stone seen) | **exact** | M |
| 4 | Ripples (the "ripple ×" band) → their blur in closed form | phone −1.0, 1080p −1.2 ms | ~identical once the blur is kept | S–M |
| 5 | Air at 30 Hz on 30 fps rungs; phone cells ≥ 4 CSS px; pressure 20 → 12 | halves the fluid on 30 fps devices; −0.4 ms at 1080p | none visible | S |
| 6 | Film grain from a texture | up to −0.44 ms (28% of the film) | same grain, new seed | S |
| 7 | Glow pyramid single-channel, 4 levels | est. −0.6 to −0.9 ms at 1080p, −2 passes | ~none (diffusion is 0.01) | S–M |
| 8 | Phones: scene at 1.5×, film at 2× | phone −30% (19.0 → 13.2 ms) | flowers sharp; stone grain a touch softer | S |
| 9 | Reflection march: exact skyline skip (desktop, tablet) | est. −1 to −1.5 ms at 1080p | exact | M |
| 10 | The lake's streak in 2 reads, not 4 | est. −0.5 ms at 1080p | needs a look | M |
| 11 | Fog noise from a 3D texture | ≤ 2.8 ms bound before cut 2, ~0.5 after | fog field changes | M |
| 12 | Phones: RGBA16F for lake, open water and slot targets | not measured (needs a phone) | sub-level | S |
| 13 | Phones: stone mirror cone 4 → 2 rays | est. −0.5 ms | needs a look | S |

### 1. Phones: no reflection march where no trees are drawn

On a phone held upright (`CAMERA.bareBelow`), the trees are not drawn, and the lake reads only the open channel's row of the photograph (`plateLight`). It still runs the whole march in `reflectBackdrop` (`stage/shaders/backdrop.ts`), hunting for trees whose image it then ignores.

**Change:** in `reflectBackdrop`, when `uPlateTrees.x < 0.5`, return the point at the sky's depth straight away. Pass the depth in as a uniform from the depth map's own far value (`depthFar` in `backdrop.json`, 900 m) rather than a literal; the test used 890 m.

**Measured:** lake 4.86 → 3.00 ms; frame −1.82 ms. Diff: max 1 level, no pixel over 2. Tablets and desktops draw trees, so they keep the march (cut 9 is theirs).

### 2. Fog sheets at a quarter of CSS resolution

`VOLUME.scale` 0.5 → 0.25 in `atmosphere/optics.ts`; the tiers' `volumeScale` multiply it as now.

**Measured at 1080p:** at ¾ of now (720×405) the pass drops 40%; at ½ (480×270), 73% (6.8 → 1.8 ms at that run's clock; ≈ 4.8 → 1.3 at the baseline's).

**Diff:** max 1 level at rest, and the same right after a brisk pointer pass across the fog. Even 1/10 of now (96×54) moved no pixel by more than 3 levels. The fog's billows are metres across, and the composite reads the sheets bilinearly. The fog's own movement over 3 s moves the frame by up to 11 levels, so the motion is all still there; only resolution it never used goes.

This matches mobile practice: Arm's clustered volumetric fog marches at 1/16 of the frame and upsamples. Check by eye in motion that a hand's churn (the fine curls, `TURBULENCE`) keeps its grain; if not, use 0.33.

### 3. Stone: shade the edge rays only where the scene uses them

`STONE_VIEW_FRAG` (`stone/shaders/slots.ts`) shades all five rays of every stone pixel (slots 0–4). The scene uses the four edge rays' light only where they disagree with the centre (`mixed` in `stoneSeen`): the outline, the arrises, the waterline. That is a few percent of the stone's pixels.

**Bound measured:** edge rays unshaded saves 1.16 ms on the phone (stone seen 2.94 → 1.77) and moves only edge pixels (0.04%).

**Exact version, no extra pass:** draw the five normal slots first into a target of their own. Then the four edge light slots read it, run the scene's own `mixed` test (the same `nearStone` gate, the same hit and normal agreement), and call `stoneLight` only where it is true; zero elsewhere. That is the same number of draws as now. The version tried on 2026-10-21 added passes, which tile GPUs pay for; this one adds none.

### 4. Ripples: keep their blur, drop their waves

The ripple band is 14 of the 20 waves summed at every water pixel, in three programs: the lake, the open water, and the mirror's surface.

**Measured:** removing them saves 0.96 ms on the phone (lake −0.43, open water −0.38, surface −0.15) and 1.18 ms at 1080p. A still frame barely moves on a phone (0.05% of pixels over 2 levels). At 1080p 1.1% move (max 77, at the stone's reflection). What shows is the ripples' **blur** on the reflections, not the ripples themselves.

**So keep the blur.** A wave finer than the pixel adds its slope variance, ½·(a·k)², to the roughness; `waterNormal` already does this per wave. The whole band's variance is a closed form: the band's `slope²`, times the gain² and the cat's paw. That is one line instead of a 14-wave loop. The reflections keep their softness and the patches still drift; only the moving centimetre glints right at the stone go.

To be closer still, keep the 3–4 longest ripple waves (the only ones a pixel resolves) and fold the rest. This is the LEAN/Toksvig idea, where filtered-out detail becomes roughness, which the water already follows.

### 5. The air: half the work where frames are slowest

- **At 30 fps the air steps twice a frame.** `AIR_CLOCK.tick` is a fixed 1/60, so a 30 fps rung runs two steps: 54 draws and 54 target switches a frame, on exactly the devices that can least afford them. When the rung draws every Nth display frame (`every` ≥ 2), step at 1/30. Stable fluids are unconditionally stable (the clock's own comment), and the air still changes once per drawn frame.
- **Phones simulate a finer grid than desktops.** The cell is `--size-hero-cell`, a quarter of the hero unit, and the unit steps down on phones: 2.5 CSS px a cell (159×287) against 4–4.6 on desktop. A touch only presses; nothing on a phone hovers. Pin the simulation's cell at ≥ 4 CSS px: ~60% fewer cells.
- **Pressure iterations 20 → 12 on tier 0** (tier 1 already uses 12): −0.39 ms at 1080p for 20 → 10.

### 6. Film grain from a texture

The grain's two octaves of hashed value noise are 28% of the film pass: −0.44 ms bound on the phone, at the screen's own pixels. Bake both octaves into one tiling texture (256², R8), read it at the film's CSS-px scale, and offset it per film frame (24 fps, as now). That is one or two reads in place of eight hashes. The statistics are the same; the pattern is a different seed.

### 7. A lighter glow pyramid

Five levels down and four up, RGBA16F, 9 draws: 1.42 ms at 1080p. It carries diffusion 0.01, halation 0.14 and the flowers' air reference. Taking it out entirely moves 0.9% of pixels by more than 2 levels (max 10, along the trees' edges), so keep it, but lighter:

- One channel (R16F): the print is monochrome, so that is a quarter of the bytes.
- Four levels instead of five: two fewer target switches.
- Check the halation edges by diff.

### 8. Phones: the scene at 1.5×, the print at 2×

Tier 2 already draws the scene at 1.5× and prints at 2× (`sceneDpr`). On a phone, make that tier 0's rule too: `sceneDpr` 1.5 below the phone breakpoint.

**Measured:** 19.0 → 13.2 ms (−30%). Every scene-side pass scales: lake, open water, scene, stone, glow. The flowers are drawn at the screen's own pixels (FINE), +0.28 ms, so they stay sharp; the grain and print stay at 2×.

**The picture:** 3.1% of pixels move by more than 2 levels (mean 0.24), all in the stone and its reflection: its grain a touch softer. On a phone there are no trees, so there is no photograph detail to lose. This is a design decision, not a free cut. It is the single largest one for phones.

### 9. The reflection march, skipping exactly (desktop, tablet)

The march is ~2.3 ms of the 1080p lake. Halving the steps saved 1.1 ms; 10 steps with 3 halvings saved 1.9 ms. But fewer steps miss thin trunks (found 2026-10-21), so not that.

**Exact alternative:** the depth map is a height field. Build once at load a **skyline per column**: the highest row of real land (anything nearer than the sky), kept as a 1D max-pyramid over columns. A ray's image is a straight line on the photograph. Where it lies above the skyline of the columns it crosses, it cannot meet land nearer than the sky. So:

- start the march at the first step that can hit;
- resolve rays that never cross the skyline at the sky's depth, with no march.

That is one or two reads per ray, not per step: the hierarchical-depth idea of Hi-Z and FidelityFX SSSR, in one dimension. The parked 2026-10-21 Hi-Z version paid ~4 reads per step. Estimated, not measured: −1 to −1.5 ms at 1080p, since most of the lake reflects sky and the channel.

### 10. The long-exposure streak in fewer reads

Four photo reads per water pixel keep the vertical streak sharp across (the GPU filters at most 8:1 along a footprint). Reading once saves 0.98 ms at 1080p, but 0.18% of pixels move by more than 2 levels (max 12): the streaks soften. Two ways to keep them sharp:

- Two reads, with anisotropy at 16× where `EXT_texture_filter_anisotropic` allows it.
- A mip chain of the photograph blurred only vertically, built at load. The smear is always vertical.

Estimated −0.5 ms at 1080p. The phone already reads once.

### 11–13. Smaller, or needing a phone to judge

- **11. Fog noise from a 3D texture.** Simplex noise is ~52% of the fog pass (−2.8 ms bound at 960×540). The flowers already replaced arithmetic noise with a 32³ texture for this reason. After cut 2 it is worth ~0.5 ms, and the fog's field changes, so it is low priority.
- **12. 16-byte targets on phones.** The lake, open water and stone slots are RGBA32F: 16 bytes a pixel written and read back. RGBA16F was refused on desktop because it is not bit-exact. On a tile GPU it halves that traffic. Measure on a real phone.
- **13. The stone mirror's cone on phones.** The mirror's rect spans the whole width of the near water on a phone (750×198 px). Two rays instead of four there.

### Tested and not worth it

- **The fog's light march, 10 → 5 steps:** no gain (+0.07 to +0.1 ms, within noise). Its reads hit a small, cached texture.
- **The regrade and unprint tables as uniform arrays:** removing the regrade's three lookups saved ≤ 0.09 ms here. Older Adreno and PowerVR drivers have handled dynamically indexed uniform arrays poorly, so check it once on a phone, nothing more.
- **Rain and pollen:** ~0.
- **The CPU:** ~0.3 ms of script a frame here. ~1,130 calls go into the context a frame; after the state filter, ~260 uniform calls reach the GPU (LOAD-SPEED.md). There are 65–68 draws and ~55 target switches. On tile GPUs the switches are what count, and the fluid's 27 (54 at 30 fps) and the glow's 9 are the ones to cut (cuts 5 and 7).

## Visual details found

1. **The stone's faces carry a regular lattice:** diagonal rows of short dark dashes, clearest on the shaded left face, at phone and 1080p sizes. It reads as a weave, not granite.
   - **Cause:** `stoneHash` (`stone/shaders/stone.ts`), `fract(sin(n·127.1)·43758.5)` over `dot(i, vec2(1, 57))`. The 1D collapse repeats every 57 cells along a near-horizontal diagonal. `sin` of large arguments also loses precision in 32-bit floats, and the fine noises (the 7 mm pits, the fine grain) put lattice indices in the thousands.
   - **Fix, tested:** a 2D hash without sine, the same kind `pawHash` and `grainHash` already use. The lattice is gone, the face reads as weathered granite, and it costs +0.05 ms. An integer hash also fixed it, but cost +0.19 ms here and would need `precision highp int` on a PowerVR.
   - **The field changes,** so lichen, runs and chips land in new places. The stone needs a look by the user afterwards.
   - **Better for performance later:** the stone's noise is static, so bake it into textures as the flowers did. Then ~20 noise calls (80 hashes) per shading become reads.
2. **The development console shows "Uncaught (in promise) AbortError: The user aborted a request."** (three times; Next's "1 Issue" badge) after reloads. The plate loader settles its own promises (`Promise.allSettled` in `stage/plates.ts`), so the source is elsewhere; not traced here. A finished site has a clean console.
3. **Worth a look by eye:** at 2× zoom, the stone's reflection right at the waterline reads stepped, a sawtooth outline more than a waver (`WATER.waver` 5 with the lapping). It is the user's own setting; this is a flag, not a fault.

## Research notes: where the engine stands

- **Tile-based GPUs** (every phone, Apple silicon): invalidate what a pass overwrites, keep target switches and re-reads few, and keep bytes per pixel low. The engine already invalidates (`discardBound`, phones only, which is right: Direct3D took it as work). What is left is the pass count (fluid, glow) and the 16-byte targets (cuts 5, 7, 12). Sources: Arm, Qualcomm (Adreno: avoid GMEM loads), Khronos, Chromium.
- **Volumetrics at low resolution:** production mobile fog marches at 1/16 of the frame and upsamples (Arm). This engine's sheets are at 1/4 of CSS pixels, and the measurements above support 1/16 (cut 2).
- **Filtered detail becomes roughness** (LEAN mapping, Toksvig): the water already does this per wave. Doing it for the whole ripple band retires 14 waves (cut 4).
- **Hierarchical depth for ray marches** (Hi-Z, FidelityFX SSSR): skip space that provably holds nothing. The reflection march works against a height field, so a 1D skyline is enough (cut 9).
- **Hashes without sine:** sine-based hashes lose precision and vary between GPUs and drivers. Use arithmetic hashes on `fract`, or integer ones (Visual details, 1).
- **Device tiers:** libraries such as detect-gpu pick a tier from benchmarks normalised by resolution. The engine does better: it measures this device in the dark on the GPU's own clock, at its costliest view. Keep it. The one gap is that phones should start from a lighter scene by design (cut 8), not wait for the ladder to find out.

## Suggested order

| phase | cuts | why first |
|---|---|---|
| A, a day | 1, 2, the stone's hash, 5, 6 | exact or invisible, one place each |
| B | 3, 4, 7 | exact with a little structure, or ~identical |
| C, with the user | 8, 10, 11 | the picture changes a little: their call |
| D | 9, the stone's noise baked, 12 and 13 on a real phone | larger engineering, or needs the device |

The project's own rules hold for each: measure the cold compile and the frame both ways, and diff frames with the clock frozen (LOAD-SPEED.md).

## Reproducing the numbers

- `__kaviStage.gpuTimings()` lumps the flowers, stone, lake, open water and scene into one bucket. Extend it to time each pass, as was done for this audit: a timer query around each of `drawBloom`, the stone's three draws, `lake.render`, `water.render`, `drawScene`, `drawGlow`, `drawFilm` and the rain.
- To A/B a shader without a rebuild, read its source back from the live program, edit it, relink, and swap the pass's `handle` and `uniforms` on alternate frames.
- Close or blank the browser pane's tab after measuring. A hidden page keeps drawing the scene, and every number beside it halves (LOAD-SPEED.md).

## Sources

- [Arm: Mali performance 2, how to correctly handle framebuffers](https://developer.arm.com/community/arm-community-blogs/b/mobile-graphics-and-gaming-blog/posts/mali-performance-2-how-to-correctly-handle-framebuffers)
- [Arm: clustered volumetric fog](https://developer.arm.com/community/arm-community-blogs/b/mobile-graphics-and-gaming-blog/posts/clustered-volumetric-fog)
- [Arm: best practice principles for mobile game development](https://developer.arm.com/community/arm-community-blogs/b/mobile-graphics-and-gaming-blog/posts/p2-best-practices-mobile-game-development)
- [Qualcomm Adreno: avoid GMEM loads](https://docs.qualcomm.com/bundle/publicresource/80-71528-1/topics/avoid_gmem_loads.md)
- [Qualcomm Adreno: shader best practices](https://developer.qualcomm.com/sites/default/files/docs/adreno-gpu/snapdragon-game-toolkit/gdg/gpu/best_practices_shaders.html)
- [Khronos forum: invalidating framebuffers on tile-based GPUs](https://community.khronos.org/t/is-there-api-in-gl-gles-that-can-invalidate-more-than-1-rect-simultaneously-any-replacement-of-eglsetdamageregionkhr/111636)
- [Chromium: discard hints on tile-based GPUs](https://codereview.chromium.org/651863002)
- [MDN: WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)
- [Olano and Baker: LEAN mapping](https://userpages.cs.umbc.edu/olano/papers/lean/)
- [AMD FidelityFX SSSR (hierarchical depth traversal)](https://media.githubusercontent.com/media/GPUOpen-Effects/FidelityFX-SSSR/master/docs/FFX_SSSR_Technology.pdf)
- [Hash noise stability in GPU shaders](https://arugl.medium.com/hash-noise-in-gpu-shaders-210188ac3a3e)
- [pmndrs detect-gpu](https://npmjs.com/package/detect-gpu)
