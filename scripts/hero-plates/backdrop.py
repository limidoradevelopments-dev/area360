"""
─── Hero plates · the backdrop ───

    npm run backdrop        (python scripts/hero-plates/backdrop.py)

Turns the photograph of the far shores (assets/sources/plates/forest.png)
into what the stage stands on, and writes:

    public/hero/backdrop/plate.webp   the photograph, B&W, at its own full
                                      resolution, cropped to what a frame can
                                      ever show
    public/hero/backdrop/depth.webp   at half the plate's size, lossless:
                                      red/green, how far away every pixel is
                                      (inverse depth, 16 bits, high byte
                                      first); blue, LAND — 1 over the shores
                                      and the sky, 0 over the photograph's own
                                      lake, which the stage replaces with its
                                      own
    components/hero/stage/backdrop.json
                                      how the plate sits in the camera; the
                                      engine imports it, so the two cannot
                                      disagree

WHY A PHOTOGRAPH WITH A DEPTH MAP. A forest built from cut-out trees on a few
planes reads as planes: the fog steps between them. A photograph has the real
thing — fog thickening tree by tree into the distance, real shores, real light
round every needle — and a depth for every pixel lets the stage put ITS fog,
the visitor's hand and the parallax at each pixel's own distance (the 2.5D
camera projection of film matte painting).

THE STEPS
  1. despeckle    bright single-pixel sparks in dark foliage (an upscaler's
                  tell) are put back to their neighbourhood
  2. shoreline    traced by hand through the fog, refined by mirror symmetry:
                  in still water what stands on the bank repeats upside down
                  below it, so the waterline is where that symmetry is best
  3. depth        Depth Anything V2 Small (Apache-2.0): relative inverse depth
  4. calibration  metres, from the shoreline: a point on the waterline
                  h·f/(row − horizon) rows below the horizon is that far away,
                  for the stage's own camera — so the photograph's world and
                  the stage's agree at the one place they touch
  5. refinement   a guided filter snaps the depth's soft edges to the
                  photograph's own silhouettes
  6. sky          fog continued above the photograph's top edge, for frames
                  taller than it (phones)
  7. crop         only what a frame can ever show, at the photograph's own
                  resolution: the left bank the user's frame cuts off, and
                  the photograph's own lake under the shores (the stage draws
                  its own), are never on screen, so they are not shipped —
                  which pays for every source pixel of the rest (4K)

Requires: numpy, opencv-python-headless, torch, transformers, pillow
(scripts/hero-plates/requirements.txt). The depth is cached in
node_modules/.cache/hero-plates; delete it to re-run the network.
"""

from __future__ import annotations

import json
import os
import sys

import cv2
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SOURCE = os.path.join(ROOT, "assets", "sources", "plates", "forest.png")
OUT_DIR = os.path.join(ROOT, "public", "hero", "backdrop")
GEOMETRY = os.path.join(ROOT, "components", "hero", "stage", "backdrop.json")
CACHE = os.path.join(ROOT, "node_modules", ".cache", "hero-plates", "backdrop")

# ── The stage's camera (MUST match components/hero/stage/camera.ts) ─────────
EYE = 1.23  # CAMERA.eyeHeight, metres
TAN_HALF_V = np.tan(np.radians(24.93 / 2))  # CAMERA.verticalFov

# ── The frame (the user's design, 1200×700) ─────────────────────────────────
# Where the user's own frame put the photograph, in source px. Registered,
# not judged: their frame (a 2000 px export) was matched to this photograph
# feature by feature (475 agreeing points, scale 0.5978, rotation 0.000°),
# and its 1200×700 edges carried back. The stage's camera is the frame's
# camera, so the photograph sits in it exactly as the user placed it.
FRAME_CENTRE = 2295.1  # the source column at the frame's centre
FRAME_TOP = 58.25  # the source row at its top edge
FRAME_HEIGHT = 1951.6  # the source rows its height spans
# Source px per unit of tan: the photograph's focal length in the stage's
# camera. Every distance below follows from it.
FOCAL = FRAME_HEIGHT / (2 * TAN_HALF_V)

# ── The photograph ──────────────────────────────────────────────────────────
# Its horizon (source px): above every waterline (the right bank's far tip,
# the farthest shore it shows, meets the water at 1238), and placed so the
# banks come out at ~60 m (right) and ~95 m (left) with spruce ~13 m tall.
# In the user's frame it lands 58.8% of the way down: CAMERA.horizon.
HORIZON = 1205
# The shoreline through the fog, (x, row) in source px, left to right. Where
# the photograph shows a bank the symmetry search refines it; down the open
# corridor there is no bank — the water runs into the fog — so the stage's
# lake takes everything from the horizon down.
SHORE = [
    (0, 1282), (300, 1272), (520, 1265), (700, 1262), (1000, 1258), (1420, 1257),
    (1650, 1255), (1800, 1252), (1870, 1250), (1930, HORIZON + 2), (2760, HORIZON + 2),
    (2830, 1237), (2920, 1250), (3000, 1284), (3150, 1290), (3450, 1292), (3750, 1295),
    (4096, 1300),
]
# Columns whose shore is open water to the horizon: no refinement there.
CORRIDOR = (1900, 2790)
REFINE = 26  # rows either side of the hand-drawn line the symmetry may move it
# How soft the waterline is (source px). At a bank, a pixel and a half: a
# waterline is a line. Down the open corridor the lake meets the
# photograph's fog at the horizon, and a line there — however close the two
# greys — is a horizon drawn on a sky that has none; there they meet over
# CORRIDOR_FADE rows, all of them featureless fog in the photograph. (Kept
# short: ninety rows of the photograph's own water left a still patch over
# the moving lake.)
EDGE = 1.5
CORRIDOR_FADE = 24
# How much farther than its bank a solid tree may stand (see metric_depth).
TREE_SPREAD = 1.25

# ── The outputs ─────────────────────────────────────────────────────────────
SKY_ROWS = 160  # source rows of fog continued above the top edge
DEPTH_NEAR = 5.0  # metres: inverse depth 1.0
DEPTH_FAR = 900.0  # metres: the sky
DEPTH_SCALE = 0.5  # the depth map's size, as a share of the plate's
# The crop: the frame is centred on FRAME_CENTRE and never looks past the
# photograph's right edge (camera.ts closes in rather than look past it), so
# it never sees further left than that edge's mirror — less this margin
# (source px) for the lean, the edge's fade and the filtering.
CROP_MARGIN = 64
# Under the lowest waterline only the stage's own lake shows; this many rows
# are kept for the soft edge and the filtering.
CROP_FOOT = 32
WEBP_QUALITY = 92


def log(*args):
    print(" ", *args, flush=True)


def despeckle(img: np.ndarray) -> np.ndarray:
    """Sparks: a pixel far brighter than its 5×5 median, in dark foliage."""
    u8 = np.clip(img * 255, 0, 255).astype(np.uint8)
    med = cv2.medianBlur(u8, 5).astype(np.float32) / 255
    spark = (img - med > 0.07) & (med < 0.35)
    spark = cv2.dilate(spark.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
    out = img.copy()
    out[spark] = med[spark]
    log(f"despeckle  {int(spark.sum())} px")
    return out


def shoreline(img: np.ndarray) -> np.ndarray:
    """The waterline row of every column (float, source px)."""
    H, W = img.shape
    xs, ys = zip(*SHORE)
    guide = np.interp(np.arange(W), xs, ys)
    s = cv2.GaussianBlur(img, (0, 0), sigmaX=4, sigmaY=0.6)
    K = 48
    best = guide.copy()
    score = np.zeros(W, np.float32)
    for x in range(W):
        if CORRIDOR[0] <= x <= CORRIDOR[1]:
            continue
        lo, hi = int(guide[x]) - REFINE, int(guide[x]) + REFINE
        top = -2.0
        for y in range(lo, hi + 1):
            up = s[y - K:y, x][::-1]
            dn = s[y + 1:y + 1 + K, x]
            a = up - up.mean()
            b = dn - dn.mean()
            den = np.sqrt((a * a).sum() * (b * b).sum()) + 1e-7
            c = float((a * b).sum() / den) * min(1.0, float(np.sqrt((a * a).mean())) / 0.006)
            # Prefer the drawn line a little: the fog gives the search little.
            c -= 0.004 * abs(y - guide[x])
            if c > top:
                top, best[x] = c, y
        score[x] = top
    # Trust the symmetry where it is clear, the drawn line where it is not.
    w = np.clip((score - 0.2) / 0.4, 0, 1)
    w = cv2.GaussianBlur(w.reshape(1, -1), (0, 0), sigmaX=12).ravel()
    line = w * best + (1 - w) * guide
    # A bank is irregular, but not at the scale of a pixel.
    line = cv2.medianBlur(line.astype(np.float32).reshape(1, -1), 5).ravel()
    line = cv2.GaussianBlur(line.reshape(1, -1), (0, 0), sigmaX=2.5).ravel()
    log(f"shoreline  symmetry trusted on {int((w > 0.5).sum())} of {W} columns")
    return line


def land_mask(shape, line: np.ndarray) -> np.ndarray:
    """1 above the waterline, 0 below: over EDGE px at a bank, CORRIDOR_FADE
    down the open corridor."""
    H, W = shape
    open_water = np.zeros(W, np.float32)
    open_water[CORRIDOR[0]:CORRIDOR[1] + 1] = 1
    open_water = cv2.GaussianBlur(open_water.reshape(1, -1), (0, 0), sigmaX=30).ravel()
    fade = (EDGE + (CORRIDOR_FADE - EDGE) * open_water).reshape(1, -1)
    rows = np.arange(H, dtype=np.float32).reshape(-1, 1)
    return np.clip(1.0 - (rows - line.reshape(1, -1)) / fade, 0, 1).astype(np.float32)


def relative_depth(img: np.ndarray) -> np.ndarray:
    """Depth Anything V2 Small: relative inverse depth, larger is nearer."""
    os.makedirs(CACHE, exist_ok=True)
    cached = os.path.join(CACHE, "disparity.npy")
    stamp = os.path.join(CACHE, "disparity.json")
    sig = json.dumps({"mtime": os.path.getmtime(SOURCE), "model": "Depth-Anything-V2-Small-hf", "size": [784, 1400]})
    if os.path.exists(cached) and os.path.exists(stamp) and open(stamp).read() == sig:
        return np.load(cached)
    import torch
    from PIL import Image
    from transformers import AutoImageProcessor, AutoModelForDepthEstimation

    log("depth      Depth Anything V2 Small (first run downloads ~100 MB)")
    name = "depth-anything/Depth-Anything-V2-Small-hf"
    processor = AutoImageProcessor.from_pretrained(name)
    model = AutoModelForDepthEstimation.from_pretrained(name).eval()
    rgb = Image.fromarray(np.repeat((np.clip(img, 0, 1) * 255).astype(np.uint8)[..., None], 3, axis=2))
    # Larger than the model's default 518: the trees are fine detail.
    inputs = processor(images=rgb, return_tensors="pt", size={"height": 784, "width": 1400},
                       do_resize=True, keep_aspect_ratio=False)
    with torch.no_grad():
        out = model(**inputs).predicted_depth[0].numpy().astype(np.float32)
    disp = cv2.resize(out, (img.shape[1], img.shape[0]), interpolation=cv2.INTER_CUBIC)
    np.save(cached, disp)
    open(stamp, "w").write(sig)
    return disp


def guided(guide: np.ndarray, src: np.ndarray, r: int, eps: float) -> np.ndarray:
    """He et al.'s guided filter: src, with its edges taken from guide."""
    box = lambda a: cv2.boxFilter(a, -1, (2 * r + 1, 2 * r + 1))
    mi, mp = box(guide), box(src)
    cov = box(guide * src) - mi * mp
    var = box(guide * guide) - mi * mi
    a = cov / (var + eps)
    b = mp - a * mi
    return box(a) * guide + box(b)


def metric_depth(img, disp, line, land) -> np.ndarray:
    """Metres: the relative depth fitted to the camera along the shoreline."""
    H, W = img.shape
    fpx = FOCAL
    cols = [x for x in range(8, W - 8, 4) if not (CORRIDOR[0] - 40 <= x <= CORRIDOR[1] + 40)]
    # The bank's distance from a smoothed line: the waterline's own small
    # wiggles (a stone, a tuft) are shape, not distance, and would stripe
    # the forest above them.
    smooth_line = cv2.GaussianBlur(line.astype(np.float32).reshape(1, -1), (0, 0), sigmaX=28).ravel()
    z_shore = EYE * fpx / np.maximum(smooth_line - HORIZON, 1.0)
    # Just above the waterline: the bank itself, not its reflection.
    d = np.array([np.median(disp[int(line[x]) - 14:int(line[x]) - 4, x - 2:x + 3]) for x in cols])
    inv = 1.0 / z_shore[cols]
    # Through the origin: the model gives the sky exactly zero, and the sky
    # IS at infinity. (Fitted with a free offset, the sky landed 143 m out,
    # behind trees the model itself puts at 120.) Weighted toward the clear
    # banks: the fog gives the far ones little to measure.
    w = np.clip(d / 0.3, 0.2, 1.0)
    a = float((w * d * inv).sum() / (w * d * d).sum())
    fit = a * d
    log(f"calibrate  1/z = {a:.3e}·d  (shore {z_shore[cols].min():.0f}–{z_shore[cols].max():.0f} m,"
        f" fit error {np.sqrt(np.mean(((1 / np.maximum(fit, 1e-4)) - 1 / inv) ** 2)):.1f} m rms)")
    # COLUMN BY COLUMN. What stands on a bank stands at that bank's distance,
    # or its reflection leaves the waterline: so each column is scaled to its
    # own bank, and the model only says how much farther each pixel above it
    # is (by the ratio of their disparities). The sky's zero goes to
    # infinity. Down the corridor, where there is no bank, the global fit.
    base = np.array([np.median(disp[max(0, int(line[x]) - 14):int(line[x]) - 4, max(0, x - 2):x + 3])
                     for x in range(W)], np.float32)
    base = cv2.GaussianBlur(np.maximum(base, 0.05).reshape(1, -1), (0, 0), sigmaX=6).ravel()
    ratio = np.clip(disp / base.reshape(1, -1), 0, 1)
    # THE TREES STAND ON THE BANK. In fog the model reads a spruce's misty
    # upper half as far away (one on the left bank came out 100 m at its foot
    # and 220 m at its crown), which shortens its reflection — the lake then
    # shows sky where the photograph shows the tree. So anything solidly
    # darker than the fog around it is held to within TREE_SPREAD of its own
    # bank's distance; only what is nearly fog itself (the sky, the ghosts of
    # the far banks) keeps the model's word.
    fog_level = cv2.resize(img, (W // 4, H // 4), interpolation=cv2.INTER_AREA)
    fog_level = cv2.dilate(fog_level, np.ones((51, 51), np.uint8))
    fog_level = cv2.GaussianBlur(cv2.resize(fog_level, (W, H), interpolation=cv2.INTER_LINEAR), (0, 0), 40)
    solid = np.clip((fog_level - img) / (0.25 * np.maximum(fog_level, 1e-3)), 0, 1)
    ratio = np.maximum(ratio, solid / TREE_SPREAD)
    inv_bank = (1.0 / z_shore).reshape(1, -1) * ratio
    open_water = np.zeros(W, np.float32)
    open_water[CORRIDOR[0]:CORRIDOR[1] + 1] = 1
    open_water = cv2.GaussianBlur(open_water.reshape(1, -1), (0, 0), sigmaX=40).reshape(1, -1)
    inv_z = inv_bank * (1 - open_water) + a * disp * open_water
    inv_z = np.clip(inv_z, 1.0 / DEPTH_FAR, 1.0 / DEPTH_NEAR)
    # Edges: the model's are soft; the photograph's are not.
    small = lambda a: cv2.resize(a, (W // 2, H // 2), interpolation=cv2.INTER_AREA)
    g = small(img)
    inv_s = guided(g, small(inv_z), r=6, eps=4e-4)
    inv_z = cv2.resize(inv_s, (W, H), interpolation=cv2.INTER_CUBIC)
    # Nothing on the land stands nearer than its own bank's waterline; the
    # photograph's lake takes the depth of its bank, so the edge filters clean.
    inv_shore = (1.0 / z_shore).reshape(1, -1)
    inv_z = np.where(land > 0.5, np.minimum(inv_z, inv_shore * 1.02), inv_shore)
    return np.clip(inv_z, 1.0 / DEPTH_FAR, 1.0 / DEPTH_NEAR).astype(np.float32)


def extend_sky(img: np.ndarray, rows: int) -> np.ndarray:
    """Fog above the top edge: the top rows' trend, smoothed across."""
    H, W = img.shape
    top = img[:120]
    trend = (top[:40].mean() - top[80:120].mean()) / 80  # per row, upward
    base = cv2.GaussianBlur(img[:24].mean(0, keepdims=True), (0, 0), sigmaX=160)
    ext = np.zeros((rows, W), np.float32)
    for i in range(rows):
        k = rows - i  # rows above the edge
        f = np.clip(k / rows, 0, 1)
        f = f * f * (3 - 2 * f)
        edge = img[0:1] * (1 - f) + base * f  # the photograph's own grain fades into smooth fog
        ext[i] = np.clip(edge + trend * k * 0.5, 0, 1)
    return np.vstack([ext, img])


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(CACHE, exist_ok=True)
    src = cv2.imread(SOURCE, cv2.IMREAD_GRAYSCALE)
    if src is None:
        sys.exit(f"no photograph at {SOURCE}")
    img = src.astype(np.float32) / 255
    H, W = img.shape
    log(f"source     {W}×{H}")
    img = despeckle(img)
    line = shoreline(img)
    land = land_mask(img.shape, line)
    disp = relative_depth(img)
    inv_z = metric_depth(img, disp, line, land)

    # Debug views (not shipped).
    vis = cv2.cvtColor((img * 255).astype(np.uint8), cv2.COLOR_GRAY2BGR)
    for x in range(0, W, 2):
        cv2.circle(vis, (x, int(round(line[x]))), 1, (0, 0, 255), -1)
    cv2.imwrite(os.path.join(CACHE, "shoreline.jpg"), vis)
    zvis = (np.clip(np.log(1 / inv_z / DEPTH_NEAR) / np.log(DEPTH_FAR / DEPTH_NEAR), 0, 1) * 255).astype(np.uint8)
    cv2.imwrite(os.path.join(CACHE, "depth.jpg"), cv2.applyColorMap(255 - zvis, cv2.COLORMAP_INFERNO))

    # Fog above the top edge, then the crop: only what a frame can show.
    img = extend_sky(img, SKY_ROWS)
    land = np.vstack([np.ones((SKY_ROWS, W), np.float32), land])
    inv_z = np.vstack([np.full((SKY_ROWS, W), 1.0 / DEPTH_FAR, np.float32), inv_z])
    x0 = max(0, int(np.floor(FRAME_CENTRE - (W - FRAME_CENTRE))) - CROP_MARGIN)
    y1 = SKY_ROWS + int(np.ceil(line.max())) + CROP_FOOT
    img, land, inv_z = img[:y1, x0:], land[:y1, x0:], inv_z[:y1, x0:]
    out_h, out_w = img.shape
    log(f"crop       columns {x0}-{W}, rows to {y1 - SKY_ROWS}: {out_w}x{out_h} at full resolution")

    from PIL import Image
    grey = np.clip(np.round(img * 255), 0, 255).astype(np.uint8)
    # Lossy is right for a photograph: its grain is below what the encoder
    # drops (PSNR ~47 dB). One channel: it is B&W.
    Image.fromarray(grey, "L").save(os.path.join(OUT_DIR, "plate.webp"), "WEBP", quality=WEBP_QUALITY, method=6)

    dw, dh = int(round(out_w * DEPTH_SCALE)), int(round(out_h * DEPTH_SCALE))
    d = cv2.resize(inv_z * DEPTH_NEAR, (dw, dh), interpolation=cv2.INTER_AREA)
    # 12 bits: at the nearest shore (~60 m) a step is 0.2 m, far finer than
    # any parallax or fog it drives; the four bits dropped are noise to the
    # encoder, a third of the file.
    q = np.clip(np.round(d * 4095) * 16, 0, 65535).astype(np.uint32)
    l8 = np.clip(np.round(cv2.resize(land, (dw, dh), interpolation=cv2.INTER_AREA) * 255), 0, 255).astype(np.uint32)
    packed = np.dstack([(q >> 8) & 255, q & 255, l8]).astype(np.uint8)
    cv2.imwrite(os.path.join(OUT_DIR, "depth.webp"), cv2.cvtColor(packed, cv2.COLOR_RGB2BGR),
                [cv2.IMWRITE_WEBP_QUALITY, 101])  # > 100: lossless

    geometry = {
        "plate": [out_w, out_h],
        "depth": [dw, dh],
        # The horizon's row, the frame's centre column and the texels per
        # unit of tan, in plate texels.
        "horizonRow": float(HORIZON + SKY_ROWS),
        "centerColumn": round(FRAME_CENTRE - x0, 2),
        "texelsPerTan": round(FOCAL, 2),
        "depthNear": DEPTH_NEAR,
        "depthFar": DEPTH_FAR,
        # The nearest any land stands: a reflected ray's march starts here.
        "nearest": round(float(1.0 / inv_z[land > 0.5].max()), 1),
    }
    with open(GEOMETRY, "w") as f:
        json.dump(geometry, f, indent=2)
        f.write("\n")
    for name in ("plate.webp", "depth.webp"):
        log(f"wrote      {name}  {os.path.getsize(os.path.join(OUT_DIR, name)) / 1024:.0f} KB")
    log(f"wrote      backdrop.json  {geometry}")
    log(f"frame      horizon {(HORIZON - FRAME_TOP) / FRAME_HEIGHT:.4f} of the way down (CAMERA.horizon)")


if __name__ == "__main__":
    main()
