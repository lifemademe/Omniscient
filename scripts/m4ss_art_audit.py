"""
Is the M4SS stage getting closer to the reference, or just different?

This session polished the stage by capturing a frame, looking at it, deciding "better" or
"worse", and changing something. That went backwards twice in a row on the character head
without either step being noticed as a regression until several changes later. Eyeballing
cannot tell you that you have lost 8% of your value range, and it definitely cannot tell you
whether you are closer to a reference you last looked at twenty minutes ago.

So: measure both, on the axes that actually separate good pixel art from a flat render, and
keep the last score so a change that made things worse is caught on the pass that made it.

    python scripts/m4ss_art_audit.py <capture.png>

Reference images go in assets/reference/m4ss/ (any PNG/JPG). Their metrics are averaged into
one target. With no references present the script still runs and reports the capture's own
numbers plus the delta against the last run, which is enough to catch a regression.

Nothing here is a gate. It is a scorecard that says WHICH axis is worst, so the next pass has
somewhere to go that is not a guess.
"""

from __future__ import annotations

import json
import math
import pathlib
import sys
from collections import Counter

from PIL import Image

REPO = pathlib.Path(__file__).resolve().parent.parent
REF_DIR = REPO / "assets" / "reference" / "m4ss"
STATE = REPO / "scripts" / ".m4ss-art-score.json"

# The HUD sits top-left and is not art. Measuring it drags every statistic toward
# "flat dark panel with one bright bar".
HUD_BOX = (0, 0, 0.30, 0.22)


def load(path: pathlib.Path, mask_hud: bool) -> list[tuple[int, int, int]]:
    im = Image.open(path).convert("RGB")
    # Downsample for speed; the statistics here are all distributional.
    im = im.resize((320, 180))
    # tobytes rather than getdata: getdata is deprecated in Pillow 14 and its warning would
    # print on every single pass of a loop that is meant to be run dozens of times.
    raw = im.tobytes()
    px = [(raw[i], raw[i + 1], raw[i + 2]) for i in range(0, len(raw), 3)]
    if not mask_hud:
        return px
    w, h = im.size
    x0, y0, x1, y1 = int(HUD_BOX[0] * w), int(HUD_BOX[1] * h), int(HUD_BOX[2] * w), int(HUD_BOX[3] * h)
    out = []
    for i, p in enumerate(px):
        x, y = i % w, i // w
        if x0 <= x < x1 and y0 <= y < y1:
            continue
        out.append(p)
    return out


def luma(p: tuple[int, int, int]) -> float:
    return 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]


def saturation(p: tuple[int, int, int]) -> float:
    mx, mn = max(p), min(p)
    return 0 if mx == 0 else (mx - mn) / mx


def hue(p: tuple[int, int, int]) -> float:
    r, g, b = [v / 255 for v in p]
    mx, mn = max(r, g, b), min(r, g, b)
    d = mx - mn
    if d == 0:
        return -1.0
    if mx == r:
        h = ((g - b) / d) % 6
    elif mx == g:
        h = (b - r) / d + 2
    else:
        h = (r - g) / d + 4
    return h * 60


def metrics(px: list[tuple[int, int, int]]) -> dict[str, float]:
    lums = sorted(luma(p) for p in px)
    n = len(lums)

    def pct(q: float) -> float:
        return lums[min(n - 1, int(q * n))]

    # Palette discipline: distinct colours after a coarse quantise. Hand-authored pixel art
    # lands in the dozens; a muddy 3D render with gradients and AA lands in the hundreds.
    quant = Counter((p[0] // 16, p[1] // 16, p[2] // 16) for p in px)
    palette = sum(1 for _, c in quant.items() if c > n * 0.0004)

    # How much of the frame the single most common colour owns. A large flat void reads as
    # unfinished; the reference fills its darks with texture.
    dominant = max(quant.values()) / n

    sats = [saturation(p) for p in px]
    hues = [hue(p) for p in px if saturation(p) > 0.18 and luma(p) > 24]
    hue_spread = 0.0
    if hues:
        buckets = Counter(int(h // 30) for h in hues)
        hue_spread = sum(1 for _, c in buckets.items() if c > len(hues) * 0.03)

    return {
        "shadow (p05)": pct(0.05),
        "midtone (p50)": pct(0.50),
        "highlight (p95)": pct(0.95),
        "value range": pct(0.95) - pct(0.05),
        "mean saturation": sum(sats) / n * 100,
        "palette size": float(palette),
        "largest flat %": dominant * 100,
        "hue families": hue_spread,
    }


# Axes where only ONE direction is a fault.
#
# `largest flat %` is the case that forced this. The stage is now at 16 against a reference
# average of 27, and the tool ranked that as the worst axis in the build - but being BELOW it
# means the frame is more varied than the reference, which is not a defect. The reference
# average is also dragged upward by the spec sheets among the references, which have large
# flat panels no game frame would have. Ranking an axis by absolute distance is right when
# both directions are wrong and actively misleading when one of them is the goal.
ONE_SIDED_HIGH = {"largest flat %"}


# What each axis is FOR, so a bad number says what to do rather than just that it is bad.
GUIDE = {
    "shadow (p05)": "darkest 5%. Too high = washed out, no depth. Too low = crushed, detail lost.",
    "midtone (p50)": "overall exposure. The reference sits dark; a high midtone reads as flat daylight.",
    "highlight (p95)": "brightest 5%. Low = nothing sparkles; the moss tips and portal must sing.",
    "value range": "the single best predictor of 'painted'. Widen before touching hue.",
    "mean saturation": "reference greens are saturated. Low = grey mud, high = poster paint.",
    "palette size": "pixel-art discipline. Far above reference = gradients/AA creeping in.",
    "largest flat %": "biggest single colour. High = an empty void; below target is fine.",
    "hue families": "accent variety. Reference has greens PLUS purple caps and warm rust.",
}


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    capture = pathlib.Path(sys.argv[1])
    if not capture.exists():
        print(f"no capture at {capture}")
        return 2

    got = metrics(load(capture, mask_hud=True))

    refs = []
    if REF_DIR.exists():
        for f in sorted(REF_DIR.iterdir()):
            if f.suffix.lower() in {".png", ".jpg", ".jpeg"}:
                refs.append(metrics(load(f, mask_hud=False)))

    want = None
    span = None
    if refs:
        want = {k: sum(r[k] for r in refs) / len(refs) for k in got}
        # The SPREAD matters as much as the mean - see the in-range rule below.
        span = {k: (min(r[k] for r in refs), max(r[k] for r in refs)) for k in got}

    last = {}
    if STATE.exists():
        last = json.loads(STATE.read_text()).get("metrics", {})

    print(f"\n=== M4SS STAGE ART AUDIT ===\n  capture: {capture.name}")
    print(f"  reference: {len(refs)} image(s) in assets/reference/m4ss/\n")
    head = f"  {'axis':<18}{'capture':>10}{'target':>10}{'delta':>10}{'vs last':>10}"
    print(head)
    print("  " + "-" * (len(head) - 2))

    worst: list[tuple[float, str]] = []
    for k, v in got.items():
        t = want[k] if want else float("nan")
        delta = (v - t) if want else float("nan")
        prev = last.get(k)
        moved = "" if prev is None else f"{v - prev:+.1f}"
        # Ranked only if the capture is OUTSIDE the whole reference spread.
        #
        # The references disagree with each other enormously - highlight runs 58 to 167 across
        # six images, palette 37 to 170 - because some are painted scenes, some are annotated
        # spec sheets with bright text, and one is a tiling texture. Their MEAN is therefore a
        # value no individual reference actually is, and two passes were spent chasing it
        # before that surfaced: pass 11 tried to lift highlights that were already sitting
        # between the two real gameplay frames, and measured worse for the trouble.
        #
        # Inside the spread, an axis is as correct as this measurement can establish. Say so
        # and stop ranking it; what remains is a judgement about craft, not about statistics.
        inside = bool(span) and span[k][0] <= v <= span[k][1]
        if want and t and not inside and not (k in ONE_SIDED_HIGH and delta < 0):
            worst.append((abs(delta) / max(1.0, abs(t)), k))
        ts = f"{t:.1f}" if want else "-"
        ds = f"{delta:+.1f}" if want else "-"
        mark = "  in range" if span and span[k][0] <= v <= span[k][1] else ""
        print(f"  {k:<18}{v:>10.1f}{ts:>10}{ds:>10}{moved:>10}{mark}")

    if worst:
        worst.sort(reverse=True)
        print("\n  WORK ON, in order:")
        for score, k in worst[:3]:
            print(f"    - {k}  ({score * 100:.0f}% off)  {GUIDE[k]}")
    elif span:
        print("\n  EVERY AXIS IS INSIDE THE REFERENCE SPREAD.")
        print("  Nothing is left for this tool to rank. Keep running it as a regression guard,")
        print("  and take the remaining work from the structural list in M4SS-POLISH.md -")
        print("  composition, light and silhouette, which it cannot see.")
    else:
        print("\n  No references found. Drop the reference art in assets/reference/m4ss/")
        print("  to get targets; until then this only catches regressions against the last run.")

    if last:
        regressed = [k for k in got if k in last and want and abs(got[k] - want[k]) > abs(last[k] - want[k]) + 0.01]
        if regressed:
            print("\n  REGRESSED since the last pass (consider reverting):")
            for k in regressed:
                print(f"    - {k}")

    STATE.write_text(json.dumps({"capture": capture.name, "metrics": got}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
