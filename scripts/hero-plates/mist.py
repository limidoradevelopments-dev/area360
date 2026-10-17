"""
─── Hero plates · the mist ───

    npm run mist          (python scripts/hero-plates/mist.py)

The low mist the user asked for on 2026-10-16: their own frame of this scene
with steam fog lying along both shores, round the trees' feet and over the
water near them, and a faint veil over the treetops
(assets/sources/mist/reference.webp). The engine lays it over everything
behind the stone as fog does — what lies behind it dimmed, the mist's own
light filling in (components/hero/atmosphere/shaders/mist.ts) — and keeps it
alive: it thickens and thins with the simulated fog's billows, which the
visitor's hand stirs. THE REFERENCE IS THE LOOK; the simulation is the life
(the user's hybrid).

WHAT IS STORED is the mist's optical depth τ, per direction from the camera
at rest: how much of what lies behind it a pixel lets through, e^(−τ). Read
off the reference against the engine's own frame, by the fog law:
seen = behind·T + light·(1 − T).

    Sources, in assets/sources/mist/ (captured from the engine, camera at
    rest, at the reference's size, grain 0 — at a few moments of the fog,
    averaged: the simulation is not the same from load to load):
      reference.webp   the user's frame (their image, 2000 × 1158)
      clear-*.png      each moment with the mist off (mistAmount 0)
      light-*.png      the same moment under endless mist (mistAmount 40,
                       mistMotion 0): the mist's own light at every pixel
      fitted-*.png     optional, the same moment with the current veil on,
                       held still (mistMotion 0): then the veil is refined a
                       step toward the reference, measured through the
                       engine's own film rather than modelled. HELD STILL ON
                       PURPOSE: that is the look the user kept. Fitted to its
                       average while moving, the mist came out ~7 levels
                       denser over the trees, and with the finer wisps of
                       that build the user saw it as changed
      frame.json       the captures' camera: size, focal (px)

Run with fitted-*.png of the current veil, it takes one more step: the fit
converges in three or four.

Writes public/hero/mist/veil.webp (one channel, √(τ / TAU_MAX): fine steps
where the mist is faint) and components/hero/atmosphere/mist.json: the veil's
size, the directions it covers (tan, the camera at rest), its τ scale, the
registration it was read with, and a version of the content, which goes in
its URL (cached for a year, next.config.ts).

THE REFERENCE IS REGISTERED, NOT TRUSTED TO LINE UP: it is the user's edit of
an older frame of ours, ~1% larger and a few pixels off. An affine fit of its
treetops' edges onto the engine's (ECC, above the mist) lined them up to
~0.1 px (REGISTRATION; `--register` measures it again, against a frame whose
forest is the reference's). THEN SHORTENED AS THE PHOTOGRAPH WAS: the right
bank stands a tenth lower since (backdrop.py BANK_HEIGHT, the user's choice
after the mist was fitted), so the reference's right bank is drawn lower the
same way, and its mist with it.

ONLY WHERE MIST CAN BE SEEN: over what is darker than the mist's light — the
trees, the water. Over the bright fog and the sky it changes nothing, so
nothing there says how much of it there is, and the stage's own sky stays
(the reference's is a little greyer all over; the user kept ours). The veil
itself never moves across the frame — only broad soft patches inside it
drift (the engine's atmosphere/shaders/mist.ts) — so a veil the trees' shape
never leaves them.

Where the stone and the plant stand, and their reflection, the reference
shows older versions of both: there the veil is filled in from the water
round them (the engine lays it only behind them anyway).

Requires: numpy, opencv-python-headless (scripts/hero-plates/requirements.txt).
"""

from __future__ import annotations

import glob
import hashlib
import json
import os
import sys

import cv2
import numpy as np

from backdrop import FOCAL, FRAME_CENTRE, HORIZON as SOURCE_HORIZON, SKY_ROWS, bank_rows

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SOURCE = os.path.join(ROOT, "assets", "sources", "mist")
OUT_DIR = os.path.join(ROOT, "public", "hero", "mist")
META = os.path.join(ROOT, "components", "hero", "atmosphere", "mist.json")

# The camera's horizon, as a share of the frame's height from the top
# (components/hero/stage/camera.ts CAMERA.horizon).
HORIZON = 0.5876

# The most τ stored (e^(−3) ≈ 5% let through: the densest bank hides a tree's
# foot entirely) and the WebP quality: the veil is soft, and this holds it
# within ~0.01 of τ where it is faint.
TAU_MAX = 3.0
QUALITY = 92

# The fit's step, and the most τ one step may move: the film's print curve
# bends the fog law, so a full step overshoots.
STEP = 0.7
MOST = 0.8

# Below this the veil is the two images' noise, not mist: the reference's
# grain and compression.
FLOOR = 0.012

# The stone, the plant and their reflection, as directions from the camera at
# rest (tan across, tan up): the reference shows older versions of both.
SUBJECT = (-0.052, -0.215, 0.068, -0.022)

# The reference laid onto our 2000 × 1158 frame (an affine map, our pixel →
# its pixel): measured 2026-10-16 by register(), correlation 0.92, against
# the frame before the right bank was shortened — whose trees are the
# reference's own. Shortened, ours no longer match its trees, so the fit
# keeps this one.
REGISTRATION = np.array([[1.010204, -0.000261, -9.341756], [-0.000058, 1.011384, -6.301817]], np.float32)


def linear(print_value: np.ndarray) -> np.ndarray:
    """Print values (0–255, sRGB) → linear light."""
    c = print_value.astype(np.float64) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def grey(path: str) -> np.ndarray:
    img = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise SystemExit(f"cannot read {path}")
    return img


def mean_of(paths: list[str]) -> np.ndarray:
    return np.mean([grey(p).astype(np.float64) for p in paths], axis=0)


def register(reference: np.ndarray, ours: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """The reference laid onto our frame: an affine fit of edge maps over the
    treetops (above the mist, where both show the same forest)."""

    def edges(img: np.ndarray) -> np.ndarray:
        f = cv2.GaussianBlur(img.astype(np.float32), (0, 0), 2.0)
        g = cv2.magnitude(cv2.Sobel(f, cv2.CV_32F, 1, 0), cv2.Sobel(f, cv2.CV_32F, 0, 1))
        return g / (g.max() + 1e-6)

    h, w = ours.shape
    mask = np.zeros((h, w), np.uint8)
    mask[round(0.09 * h): round(0.48 * h), :] = 255
    warp = np.eye(2, 3, dtype=np.float32)
    criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 400, 1e-7)
    cc, warp = cv2.findTransformECC(edges(ours), edges(reference), warp, cv2.MOTION_AFFINE, criteria, mask, 5)
    print(f"registered reference onto our frame: correlation {cc:.3f}, scale {warp[0, 0]:.4f} x {warp[1, 1]:.4f}, "
          f"shift {warp[0, 2]:+.1f}, {warp[1, 2]:+.1f} px")
    return lay(reference, ours.shape, warp), warp


def lay(reference: np.ndarray, shape: tuple[int, int], warp: np.ndarray) -> np.ndarray:
    h, w = shape
    return cv2.warpAffine(reference, warp, (w, h), flags=cv2.INTER_LANCZOS4 + cv2.WARP_INVERSE_MAP,
                          borderMode=cv2.BORDER_REPLICATE).astype(np.float64)


def shorten(img: np.ndarray, rect: list[float]) -> np.ndarray:
    """An image of the frame at rest with its right bank drawn as the
    photograph now has it (backdrop.py shorten_bank): every pixel taken from
    the source row the shortened photograph takes it from. The waterline is
    the backdrop's own (its depth map's land), carried back to the source."""
    with open(os.path.join(ROOT, "components", "hero", "stage", "backdrop.json"), encoding="utf-8") as f:
        geo = json.load(f)
    depth = cv2.imread(os.path.join(ROOT, "public", "hero", "backdrop", "depth.webp"), cv2.IMREAD_COLOR)
    if depth is None:
        raise SystemExit("cannot read the backdrop's depth map")
    land = depth[:, :, 0].astype(np.float32) / 255.0
    pw, ph = geo["plate"]
    sx, sy = land.shape[1] / pw, land.shape[0] / ph
    first = SOURCE_HORIZON + SKY_ROWS  # plate row of the horizon: every waterline is below it
    h, w = img.shape
    x0, top, x1, bottom = rect
    tx = x0 + (np.arange(w) + 0.5) / w * (x1 - x0)
    ty = top - (np.arange(h) + 0.5) / h * (top - bottom)
    cols = FRAME_CENTRE + tx * FOCAL  # source columns
    line = np.empty(w)
    for i, c in enumerate(cols):
        dc = int(np.clip(round((geo["centerColumn"] + tx[i] * geo["texelsPerTan"]) * sx), 0, land.shape[1] - 1))
        under = np.nonzero(land[int(first * sy):, dc] < 0.5)[0]
        line[i] = (under[0] + int(first * sy)) / sy - SKY_ROWS if len(under) else ph
    rows = SOURCE_HORIZON - ty.reshape(-1, 1) * FOCAL  # source rows
    src = bank_rows(rows, cols.reshape(1, -1), line.reshape(1, -1))
    map_y = ((top - (SOURCE_HORIZON - src) / FOCAL) / (top - bottom) * h - 0.5).astype(np.float32)
    map_x = np.tile(np.arange(w, dtype=np.float32), (h, 1))
    return cv2.remap(img.astype(np.float32), map_x, map_y, cv2.INTER_CUBIC,
                     borderMode=cv2.BORDER_REPLICATE).astype(np.float64)


def tan_rect(frame: dict) -> list[float]:
    """The directions the captures cover, as tan from the camera at rest:
    left, top, right, bottom."""
    w, h = frame["size"]
    f = frame["focal"]
    return [-0.5 * w / f, HORIZON * h / f, 0.5 * w / f, (HORIZON - 1.0) * h / f]


def subject_mask(shape: tuple[int, int], rect: list[float]) -> np.ndarray:
    h, w = shape
    x0, top, x1, bottom = rect

    def col(t: float) -> int:
        return int(round((t - x0) / (x1 - x0) * w))

    def row(t: float) -> int:
        return int(round((top - t) / (top - bottom) * h))

    mask = np.zeros((h, w), np.uint8)
    l, b, r, t = SUBJECT
    mask[max(row(t), 0): min(row(b), h), max(col(l), 0): min(col(r), w)] = 255
    return mask


def water_mask(shape: tuple[int, int], rect: list[float]) -> np.ndarray:
    """1 where the frame shows the lake: the backdrop's own shoreline
    (public/hero/backdrop/depth.webp, blue: land) seen through the camera
    at rest, and everything below the photograph's foot."""
    with open(os.path.join(ROOT, "components", "hero", "stage", "backdrop.json"), encoding="utf-8") as f:
        geo = json.load(f)
    depth = cv2.imread(os.path.join(ROOT, "public", "hero", "backdrop", "depth.webp"), cv2.IMREAD_COLOR)
    if depth is None:
        raise SystemExit("cannot read the backdrop's depth map")
    land = depth[:, :, 0].astype(np.float32) / 255.0  # OpenCV reads BGR: blue is first
    h, w = shape
    x0, top, x1, bottom = rect
    tx = x0 + (np.arange(w) + 0.5) / w * (x1 - x0)
    ty = top - (np.arange(h) + 0.5) / h * (top - bottom)
    pw, ph = geo["plate"]
    u = (geo["centerColumn"] + tx * geo["texelsPerTan"]) / pw
    v = (geo["horizonRow"] - ty * geo["texelsPerTan"]) / ph
    mx = np.tile((u * land.shape[1]).astype(np.float32), (h, 1))
    my = np.tile((v * land.shape[0]).astype(np.float32)[:, None], (1, w))
    seen = cv2.remap(land, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0.0)
    below = np.tile((v > 1.0)[:, None], (1, w))
    above = np.tile((ty > 0.0)[:, None], (1, w))
    return np.where(above, 0.0, np.where(below, 1.0, 1.0 - seen)).astype(np.float64)


def read_veil(shape: tuple[int, int]) -> np.ndarray:
    """The veil as it is now (τ), at the captures' size."""
    v = grey(os.path.join(OUT_DIR, "veil.webp")).astype(np.float64) / 255.0
    with open(META, encoding="utf-8") as f:
        meta = json.load(f)
    tau = meta["tauMax"] * v * v
    if tau.shape != shape:
        tau = cv2.resize(tau, (shape[1], shape[0]), interpolation=cv2.INTER_LINEAR)
    return tau


def captures(kind: str) -> list[str]:
    return sorted(glob.glob(os.path.join(SOURCE, f"{kind}-*.png")))


def main() -> None:
    with open(os.path.join(SOURCE, "frame.json"), encoding="utf-8") as f:
        frame = json.load(f)
    clears, lights, fitted = captures("clear"), captures("light"), captures("fitted")
    if not clears or len(lights) != len(clears):
        raise SystemExit(f"need clear-*.png and a light-*.png for each in {SOURCE}")
    clear = mean_of(clears)
    shape = clear.shape
    rect = tan_rect(frame)
    source = grey(os.path.join(SOURCE, "reference.webp"))
    if "--register" in sys.argv:
        reference, warp = register(source, clear.astype(np.uint8))
    else:
        reference, warp = lay(source, shape, REGISTRATION), REGISTRATION
    reference = shorten(reference, rect)

    ref = linear(reference)
    base = linear(clear)
    light = linear(mean_of(lights))
    # Where mist can be read: over what is darker than its light.
    seeable = np.clip((light - base - 0.02) / 0.08, 0.0, 1.0)
    if fitted:
        # One step of the fit: where the engine's frame is darker than the
        # reference, more mist; lighter, less — by the fog law, whose optical
        # depth adds: τ' = τ + ln((A − seen) / (A − wanted)).
        if len(fitted) != len(clears):
            raise SystemExit("each fitted-*.png needs its clear-*.png")
        seen = linear(mean_of(fitted))
        tau = read_veil(shape)
        room = 0.01 * light
        gap = np.log(np.maximum(light - seen, room) / np.maximum(light - ref, room))
        tau = tau + np.clip(STEP * gap, -MOST, MOST) * seeable
        print(f"fit step from {len(fitted)} frames: mean |gap| {np.abs(gap * seeable).mean():.4f}")
    else:
        # The first estimate: what the reference shows between our frame and
        # the mist's light.
        t = np.maximum(light - ref, 1e-4) / np.maximum(light - base, 1e-4)
        tau = -np.log(np.clip(t, np.exp(-TAU_MAX), 1.0)) * seeable
    tau = np.clip(tau, 0.0, TAU_MAX)

    # OVER THE LAND, soft as mist is: the reference's grain and compression
    # are not mist, and a tree's edge copied into the veil would draw it
    # twice. OVER THE WATER, smoother: the reference's ripples are not ours,
    # and its mist read through them carried their stripes, which would sit
    # still over our moving lake.
    land_tau = cv2.GaussianBlur(tau, (0, 0), 1.2)
    water_tau = cv2.GaussianBlur(tau, (0, 0), sigmaX=9.0, sigmaY=5.0)
    water = cv2.GaussianBlur(water_mask(shape, rect), (0, 0), 3.0)
    tau = water * water_tau + (1.0 - water) * land_tau
    tau[tau < FLOOR] = 0.0

    # Where the reference shows the older stone and plant: filled in from the
    # water and air round them.
    scaled = np.clip(np.sqrt(tau / TAU_MAX) * 255.0, 0, 255).astype(np.uint8)
    scaled = cv2.inpaint(scaled, subject_mask(shape, rect), 21, cv2.INPAINT_TELEA)

    ok, buf = cv2.imencode(".webp", scaled, [cv2.IMWRITE_WEBP_QUALITY, QUALITY])
    if not ok:
        raise SystemExit("webp encode failed")
    data = np.asarray(buf).tobytes()
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, "veil.webp"), "wb") as f:
        f.write(data)
    stored = TAU_MAX * (scaled.astype(np.float64) / 255.0) ** 2
    meta = {
        "size": [shape[1], shape[0]],
        "tan": [round(v, 6) for v in rect],
        "tauMax": TAU_MAX,
        "registration": [[round(float(v), 6) for v in row] for row in warp],
        "version": hashlib.sha256(data).hexdigest()[:10],
    }
    with open(META, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
        f.write("\n")
    h, w = shape

    def band(x0: float, y0: float, x1: float, y1: float) -> float:
        return float(stored[round(y0 * h): round(y1 * h), round(x0 * w): round(x1 * w)].mean())

    print(f"wrote      veil.webp  {w}x{h}  {len(data) / 1024:.0f} KB")
    print(f"           tau mean: treetops {band(0.0, 0.2, 0.35, 0.45):.2f} / {band(0.72, 0.13, 1.0, 0.43):.2f}, "
          f"tree feet {band(0.0, 0.48, 0.38, 0.62):.2f} / {band(0.69, 0.48, 1.0, 0.64):.2f}, "
          f"water by the shores {band(0.65, 0.64, 1.0, 0.78):.2f}, sky {band(0.0, 0.0, 1.0, 0.33):.3f}")
    print(f"wrote      mist.json  version {meta['version']}")


if __name__ == "__main__":
    main()
