"""
─── Hero plates · the still ───

    npm run still          (python scripts/hero-plates/still.py)

The hero's first paint: the scene's own first frame as a picture, shown the
moment the page arrives and covered by the live scene once it is running
(components/hero/HeroStill.tsx). Without it the visitor looked at flat grey
until the engine had compiled its shaders and fetched the shores — about
1.8 s on a GTX 1050 Ti, longer on a phone. It is also all a browser without
WebGL2 ever shows.

THE SOURCE IS THE ENGINE'S OWN FRAME, so the hand-over cannot be seen. The
lens keeps the horizon at a fixed share of the height (stage/camera.ts
focalPx), so the frame on a screen of another shape is this one scaled and
cropped about the horizon — which is what `cover` anchored there does. Only
the print's frame-fixed filters (the foot burned in, the lake's burn toward
the frame's bottom) do not crop: where the crop is top and bottom, a still
taken far from the screen's shape puts them in the wrong place (a 3:4
tablet off a 0.4 phone frame: 8.7 levels mean). So there is one still per
band of shapes, taken inside it (`STILLS`, in order of preference), and the
browser downloads only the one for its screen. Measured against the live
frame: 0.3–3 levels mean, no shift.

Each is the first frame of the page loaded fresh in the dev server at that
size, read back the moment it exists (time 0, the camera at rest), saved as
PNG in assets/sources/still/<name>.png. In the console, right after a
reload at that viewport, once __kaviStage.ready:

    const S = __kaviStage; S.setVisible(false); S.render();
    document.querySelector("canvas").toDataURL("image/png")

Recapture them all whenever the look of the first frame changes.

Writes lossy WebP in a few widths each (the frame is neutral grey, so one
channel; quality 82 holds the tones within ~1 level, the grain is what
costs), and components/hero/still.json: each still's shape, the band of
screen shapes it serves, its widths, and a version of the content, which
goes in the URLs (they are cached for a year, next.config.ts).

Requires: numpy, opencv-python-headless (scripts/hero-plates/requirements.txt).
"""

from __future__ import annotations

import hashlib
import json
import os

import cv2
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SOURCE = os.path.join(ROOT, "assets", "sources", "still")
OUT_DIR = os.path.join(ROOT, "public", "hero", "still")
META = os.path.join(ROOT, "components", "hero", "still.json")

QUALITY = 82

# The bands of screen shape (width ÷ height) each still serves, and the
# widths written of it (the common screens land on one exactly: a still a
# few pixels narrower than the screen makes the browser take the next size
# up). The lens's own edges, from stage/camera.ts focalPx: below 0.8793 it
# holds 22° across; up to 1.7732 it frames by height (a narrower screen sees
# the middle of a wider one: crop at the sides, exact); past that it closes
# in, up to 1.29×, so to 2.2874; past that it frames by height again.
# The last still is the fallback, the desktop's.
STILLS = [
    # Super-wide (32:9) and ultra-wide (21:9): framed by height, but the
    # photograph's edges fade into the fog the further past it the frame
    # looks (CAMERA.edge.grow), so each is taken at its own shape (the 32:9
    # still on a 21:9 screen: 17 levels mean, the trees at the sides gone).
    {"name": "superwide", "min": 2.9, "max": None, "widths": (3840, 2560)},
    {"name": "ultra", "min": 2.2874, "max": None, "widths": (2580, 1720)},
    # Wide (2:1 and so): the lens closing in, cropped top and bottom.
    {"name": "wide", "min": 1.95, "max": None, "widths": (2376, 1584)},
    # Tablets upright (3:4, 2:3).
    {"name": "tablet", "min": 0.62, "max": 0.8793, "widths": (1080, 720)},
    # Phones upright.
    {"name": "phone", "min": None, "max": 0.62, "widths": (1170, 828, 480)},
    # Desktops and laptops, 0.88–1.95: the widest frame the lens takes whole.
    {"name": "landscape", "min": None, "max": None, "widths": (2553, 1920, 1280)},
]


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    for old in os.listdir(OUT_DIR):
        os.remove(os.path.join(OUT_DIR, old))
    digest = hashlib.sha256()
    stills = []
    for spec in STILLS:
        name = spec["name"]
        frame = cv2.imread(os.path.join(SOURCE, f"{name}.png"), cv2.IMREAD_COLOR)
        if frame is None:
            raise SystemExit(f"missing {name}.png in {SOURCE}")
        grey = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        sizes = []
        for w in spec["widths"]:
            h = round(grey.shape[0] * w / grey.shape[1])
            img = grey if w == grey.shape[1] else cv2.resize(grey, (w, h), interpolation=cv2.INTER_AREA)
            ok, buf = cv2.imencode(".webp", img, [cv2.IMWRITE_WEBP_QUALITY, QUALITY])
            if not ok:
                raise SystemExit("webp encode failed")
            data = np.asarray(buf).tobytes()
            digest.update(data)
            with open(os.path.join(OUT_DIR, f"{name}-{w}.webp"), "wb") as f:
                f.write(data)
            sizes.append(w)
            print(f"wrote      {name}-{w}.webp  {w}x{h}  {len(data) / 1024:.0f} KB")
        stills.append({
            "name": name,
            "aspect": round(grey.shape[1] / grey.shape[0], 4),
            "min": spec["min"],
            "max": spec["max"],
            "widths": sizes,
        })
    meta = {"stills": stills, "version": digest.hexdigest()[:10]}
    with open(META, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
        f.write("\n")
    print(f"wrote      still.json  version {meta['version']}")


if __name__ == "__main__":
    main()
