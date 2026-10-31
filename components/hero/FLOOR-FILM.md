# The floor's film — plan (not built)

STATUS (2026-10-31): researched and planned, approved in outline by the user,
and PARKED at their word: "after done the rest of this project I will tell you
to build this". Nothing here is in the code yet. Build it only when they say so.

One decision is still the user's: whether desktops at the floor get the film too
(see Open decision, at the end). Everything else below is the plan as agreed.

## What it is for

Some low-end phones cannot run the hero's live scene smoothly (the user's
realme C11, PowerVR GE8322; the Intel UHD 630 at a phone's size, our stand-in,
measured at the floor: `LOAD-SPEED.md`). The engine already knows when this is
so — it calls `onFloor` (engine.ts `reachFloor`) — but nothing listens: the
slowest rung stays. The plan: on a device PROVEN to be at the floor, a
pre-rendered film of the same scene stands in for the live one, with three
promises from the user:

1. It must never fall to a capable device ("an iPhone on low battery mode, or
   sometimes").
2. It must never read as a video: no play button, ever, by any route.
3. The descent (the camera going down as the page scrolls) must be in it too.

All three are possible. The rest of this file is how.

## 1. Why today's floor can misfire

Harmless today (nothing is wired to `onFloor`); not harmless once the film is.

- ONE STALLED FRAME CAN DECIDE IT. In `judge`, a frame whose wall time passes
  three times the slowest rung's interval (`far`: ~100 ms at 30 or 60 Hz)
  decides at once, on as few as one sample. Two such stalls in a row — one at
  full quality, one at the cheapest tier, which it then jumps straight to —
  reach the floor on ANY device. Stalls like that are ordinary during a load
  (garbage collection, the OS, hydration, the curtain's own work).
- EVERY PHONE IS TIMED END TO END. Safari offers no GPU clock, and on Android
  the timer extension is effectively absent (web3dsurvey: ~0.2% of Android
  reports). So phones are judged by waiting for each frame (a one-pixel read),
  which RENDER's own notes say reads 2–5× the frame's cost while the curtain
  animates — and on a phone the curtain's layers share the same weak GPU.
- THE WATCHER CAN ALSO CALL IT, MID-VISIT. `watchFrameRate` calls
  `reachFloor` after `RENDER.slowSeconds` (1.5 s) of slow average frames at the
  cheapest rung: a phone heating up, a notification, Low Power Mode switched
  on mid-visit.

## 2. What the research found (2026-10-31)

- iOS LOW POWER MODE BLOCKS VIDEO AUTOPLAY, muted and playsinline or not, by
  the attribute or by `play()` (NotAllowedError), and iOS then draws its own
  play button over the video; no workaround hides it, and a page cannot detect
  Low Power Mode. So any video element on an iPhone in Low Power Mode is a play
  button waiting to happen.
- Low Power Mode also caps requestAnimationFrame at 30 fps, by WebKit's design.
  The engine's ladder already reads a 30 Hz display and runs full quality at
  every frame of it: not a floor case — only today's measuring could misread it.
- OTHER BROWSERS PUT THEIR OWN UI ON VIDEO ELEMENTS: Samsung Internet's
  "Video assistant" floats a button over playing videos and only the visitor
  can turn it off (no page-side switch); Android's WebView draws a grey
  play-button poster before playback; UC Browser swaps in its own controls;
  Chrome on Android pauses muted autoplay videos that are off screen; Chrome's
  media notification (a play/pause in the shade) appears for media with audio.
- CONCLUSION: the only guarantee of "no play button" is no video element on
  the page at all.
- WEBCODECS (`VideoDecoder`) decodes a film frame by frame with no media
  element: Chrome 94+, and Chrome on Android, Samsung Internet and Android
  WebView with it; Safari 16.4+; desktop Firefox 130+; NOT Firefox on Android.
  It is not media playback, so autoplay rules, Low Power Mode's block and media
  notifications do not apply to it.
- Copying video frames into WebGL has been slow on some Android GPUs (reports
  of ~33 ms uploads). Unknown for the realme until measured there — so the film
  times itself and steps aside if it cannot keep up.

## 3. The plan

### A. Who gets the film — rules that keep capable devices off it

1. NEVER APPLE (iPhone, iPad, Mac): a fixed rule on the device (WebGL's
   unmasked renderer naming Apple, or an iOS/iPadOS user agent — an iPad says
   Macintosh with touch points), not a measurement, so Low Power Mode, heat or
   a slow load can never matter. At worst an iPhone keeps the live scene at its
   cheapest rung at 30 fps.
2. NEVER A VISITOR WHO CHOSE A QUALITY in the dock (ui/renderQuality): their
   choice is the live scene. (A floored tablet that picks a level reloads onto
   the live scene at it.)
3. DECIDED ONLY IN THE DARK, before the curtain lifts. Never mid-visit: the
   watcher may still step tiers and rates down as it does today, but its
   `reachFloor` swaps nothing — the scene is never replaced while it is seen.
4. PROVEN, NOT GUESSED:
   - no floor verdict from `far` or from one sample: `far` may still hurry a
     step to a cheaper tier, but the floor needs `RENDER.calibrate.frames`
     samples at the cheapest tier;
   - a CLEAR MARGIN: the cheapest tier must miss the slowest rung by ~1.25×
     (runs under ~24 fps), not merely miss 30. Between, the live scene stays at
     its cheapest rung, as today;
   - MEASURED TWICE: a first floor verdict waits ~0.4 s (a passing load passes)
     and measures the cheapest tier again; both batches must agree;
   - samples are dropped across a visibility change (a tab put aside and back).
   A fast device settles in ~0.05–0.1 s and never reaches any of this; only a
   device heading for the floor spends ~1 s more in the dark.
5. ONLY WHERE THE FILM CAN RUN: `VideoDecoder.isConfigSupported` (H.264,
   `prefer-hardware`, the film's size) answers before the engine is let go;
   unsupported (Firefox on Android, old browsers), the live scene stays at its
   cheapest rung, as today.
6. SAVE-DATA ON (`navigator.connection.saveData`): no film is downloaded; the
   live scene stays.
7. PHONES AND TABLETS (touch). Desktops: the user's decision, below.

### B. The film — drawn, never played

- NO VIDEO ELEMENT, ANYWHERE. The film's H.264 samples are decoded with
  WebCodecs and each frame drawn into a WebGL canvas in `[data-hero-scene]`
  (where the engine's canvas was). Nothing for iOS, Samsung's assistant,
  WebView's poster, UC, autoplay rules, Low Power Mode, PiP, Cast, download
  toolbars or media notifications to attach to; nothing to tap. No audio track.
- SHOWN ONLY ONCE ITS FIRST FRAMES ARE DRAWN. A decode error, a stall (no new
  frame for ~1 s while it should be moving), or its own frame time too slow for
  ~1 s → the still (HeroStill) fades in on `REDUCED`'s fade. Never a broken
  frame, never a button.
- RENDERED BY THE ENGINE ITSELF, as the stills are (headless Edge, the frozen
  clock `advance`, captured frame by frame): the same grade, fog, rain, stone,
  flowers. Encoded CLEAN (no grain: grain is what a codec spends its bits on);
  the canvas puts the film grain back with the engine's own law (stage/shaders
  film.ts: monochrome, strongest in the midtones, ~1 CSS px clumps, re-seeded
  at `FILM.fps`), which also dithers away the codec's banding in the fog.
  Monochrome H.264 (the print is pure monochrome: its chroma costs nothing),
  High profile, 30 fps, closed GOP, a keyframe at the loop's start. Shipped as
  the raw stream plus a small index (byte ranges, keyframes), so no MP4 parser
  is needed in the page; a script in `scripts/hero-plates/` (`npm run film`)
  writes it, with a content version in its URLs (public/hero/ is immutable).
- THE OPENING SHOT KEPT: the arrival (ARRIVAL, ARRIVAL.zoom, ARRIVAL_AIR —
  rendered ~5.5 s, the camera at rest by 4.2) plays once as the curtain lifts,
  faded up on ENTRANCE's curve, and runs straight on into the resting loop
  (~12 s): the decoder is fed the loop's samples after the arrival's with
  continuous timestamps, so the hand-off and every wrap are gapless. The loop's
  seam: its last ~1.2 s cross-dissolved into the frames just before it starts
  (the slow fog dissolves; the rain's drops come and go anyway).
- THREE FILMS, as the stills' bands: phone (≤ 0.62), tablet (0.62–0.88),
  landscape (phones turned, tablets on their side); placed as HeroStill places
  the stills (cover, anchored at the horizon). Phone at 720 px wide (the
  realme's own width). ~1.5–2.5 MB each (to be measured), fetched only by a
  floored device, only after the verdict, streamed so the arrival can start
  before the loop has arrived. Its download counts in `ui/loadProgress`, so the
  preloader's count stays true.
- THE ENGINE LET GO FIRST: `dispose`, and its context released
  (WEBGL_lose_context), before the film starts — ~100 MB of GPU memory on a
  2 GB phone (LOAD-SPEED's realme figure: 102 MB).
- Under `respectReducedMotion` (when on and preferred): the still, not the film.
- The dock on a floored tablet settles as Low (renderQuality); phones show no
  quality button anyway.

### C. The descent in the film

What the crane does on screen reduces to this (stage/motion.ts DESCENT,
camera.ts `pose`): the far fog, shore and their reflections slide DOWN onto the
stone's top; the stone, its flowers and its reflection HOLD (the camera turns
to hold them); the water between stretches (a plane seen from lower), the
nearest water rising; the lens closes 6% about the flowers.

- The engine exports, per film, a MAP OF HOW FAR EACH PIXEL MOVES with the
  descent (0 held … 1 far), and a small CLEAN PLATE (the frame without the
  stone and flowers) for what they uncover as the world slides — the band under
  the stems that overhang the stone's right side, and under its reflection
  where that ends on screen.
- The canvas warps each frame by the scroll in the same pass that draws it: on
  `followDescent`'s progress, with DESCENT's follow (7/s, `approach`) and
  DESCENT_FADE's light (the scene's opacity, already written by HeroSection),
  parked at `data-dark` as the engine is. The air keeps moving if the visitor
  stops half-way (scrubbing a video through the descent would freeze it: a
  picture again).
- VERIFIED IN NUMBERS: the engine's frame at a frozen time and descent 0.5 and
  0.85, against the film's warp of its descent-0 frame at the same time.
- LOST, AND SAID SO: the hand. The film cannot answer a touch moving the fog,
  or the lean.

### D. Order of work

1. Harden the floor (A.3, A.4) — worth having even without the film.
2. The vetoes and the gate (A.1, A.2, A.5, A.6) and the `onFloor` wiring in
   StageCanvas/HeroSection (floor → film; any failure → the still).
3. `npm run film`: render, cross-dissolve the seam, encode, index; the motion
   map and the clean plate.
4. The player: WebCodecs → WebGL, the grain, the gapless arrival → loop, its
   own timing and its step aside to the still.
5. The descent warp.
6. Verify: frame diffs against the engine; the Intel UHD 630 at a phone's size
   with the CPU slowed, as the realme's stand-in; then the user on the realme
   itself, and on a capable Android and an iPhone (Low Power Mode on) to see
   they stay live. A development readout of the verdict and its numbers would
   make that check quick.

## 4. Risks left open

- The realme's frame copy into WebGL is unknown until measured there. If slow,
  the film steps aside to the still (and its resolution can come down).
- A floored phone still waits for the live scene's compile before its verdict:
  the price of proving rather than guessing.
- Not in this plan, on purpose: choosing by the GPU's name to skip that compile
  (a guess), and remembering the verdict for the next visit (a misfire would
  stick).

## Open decision

DESKTOPS AT THE FLOOR. The Intel UHD 630 at 1440 runs the cheapest tier at
12–22 fps (LOAD-SPEED.md). The plan leaves desktops on the live scene, because
there the hand drives it (the lean, the air) and the film cannot answer it; the
user may choose to give them the film too (it would need wider landscape films,
~3–4 MB). Ask before building.

## Sources

- WebKit bug 216887, Low Power Mode blocks autoplay: https://bugs.webkit.org/show_bug.cgi?id=216887
- Apple developer forums, Low Power Mode playback: https://developer.apple.com/forums/thread/813352
- Veriff known issues (the play button cannot be hidden): https://devdocs.veriff.com/docs/known-issues
- WebKit bug 215745, rAF at 30 fps in Low Power Mode by design: https://bugs.webkit.org/show_bug.cgi?id=215745
- Popmotion, when iOS throttles rAF: https://popmotion.io/blog/20180104-when-ios-throttles-requestanimationframe
- Samsung community, Video assistant only the visitor can turn off: https://us.community.samsung.com/t5/Galaxy-S23/Help/m-p/2882302
- THEOplayer FAQ, WebView's grey play poster: https://docs.theoplayer.com/faq/29-why-do-i-get-a-grey-play-button.md
- UC Browser replacing a player's controls: https://github.com/weizhenye/ass/issues/2
- Chrome 58 media updates, off-screen muted autoplay paused: https://developer.chrome.com/blog/chrome-58-media-updates/
- Chrome media notifications on Android: https://developer.chrome.com/blog/media-notifications/
- MDN browser-compat-data, VideoDecoder: https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/VideoDecoder.json
- web3dsurvey, the GPU timer on Android: https://web3dsurvey.com/webgl2/extensions/EXT_disjoint_timer_query_webgl2
- Unity forum, slow video uploads to WebGL in Chrome: https://discussions.unity.com/t/video-player-render-to-texture-performance-issue-in-webgl-on-chrome/756187
- three.js issue 13512, video uploads on a low-end Android GPU: https://github.com/mrdoob/three.js/issues/13512
