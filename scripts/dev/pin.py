"""Click a globe pin, grabbing and clicking in one process.

    python scripts/dev/pin.py [index]   # 0 = westmost marker, default 1

## Why this exists

The globe turns continuously, so shot.py-then-drive.py always misses: by the time a second
process has started, measured a screenshot and moved the mouse, the pin has walked far enough
that every click lands on the neighbouring signal. One process closes that gap.

## What is still unsolved - read before trusting it

Separating a pin MARKER from its LABEL. They are the same hue, so colour alone cannot do it,
and a 1-D grouping by x merges a marker with any text above or below it. The 2-D flood fill
below does separate blobs correctly, and then fails on a second problem: at this resolution
every GLYPH of the 3x5 label font is also a small solid blob, so the marker does not stand out
by size or fill ratio either.

Brightness looked like the discriminator and could not be sampled, because the globe had turned
between the measurement and the next frame - which is the original problem wearing a hat.

Two routes that were not tried and should be, in order of promise:
  1. Stop the globe. If there is a way to pause its rotation - a debug flag, or reading its
     angle - the whole class of problem goes away and shot.py is enough.
  2. Match the marker's exact RGB rather than a hue band, sampled once from a still.

Until then this reliably finds candidate clusters and unreliably picks the right one. Treat
its output as a suggestion, and check the result.
"""
import ctypes, ctypes.wintypes, sys, time
import numpy as np
from PIL import ImageGrab

u = ctypes.windll.user32
u.SetProcessDPIAware()
h = u.FindWindowW(None, 'omniscient - default')
if not h:
    raise SystemExit('game window not found')
r = ctypes.wintypes.RECT(); u.GetWindowRect(h, ctypes.byref(r))

index = int(sys.argv[1]) if len(sys.argv) > 1 else 1

img = ImageGrab.grab(all_screens=True).crop((r.left, r.top, r.right, r.bottom)).convert('RGB')
a = np.asarray(img).astype(int)
# Pin markers and labels are both yellow-green; the graticule is cyan (B >= G) and drops out.
m = (a[:, :, 1] > 150) & (a[:, :, 0] > 90) & (a[:, :, 2] < a[:, :, 1] - 60)
m[:, :600] = False          # the readout column on the left
ys, xs = np.nonzero(m)
if len(xs) == 0:
    raise SystemExit('no pins found - is the globe up?')

# Label TEXT and pin MARKER are the same colour, so hue alone will not separate them, and a
# 1-D grouping by x merges a marker with any label sitting above or below it. Flood fill in 2-D
# is the only thing that actually separates them - scipy is not installed here, so this is a
# small iterative fill over the ~2000 lit pixels, which costs nothing at this size.
#
# Every earlier attempt clicked the neighbouring signal because it skipped this step.
pts = set(zip(xs.tolist(), ys.tolist()))
markers = []
while pts:
    seed = pts.pop()
    blob = [seed]
    stack = [seed]
    while stack:
        px, py = stack.pop()
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                n = (px + dx, py + dy)
                if n in pts:
                    pts.discard(n)
                    blob.append(n)
                    stack.append(n)
    bx = [p[0] for p in blob]
    by = [p[1] for p in blob]
    w, h2 = max(bx) - min(bx), max(by) - min(by)
    # A marker is a small solid square. A glyph is taller than it is wide or thinner than 3px.
    if 3 <= len(blob) <= 120 and w <= 14 and h2 <= 14 and w >= 2 and h2 >= 2:
        markers.append((sum(bx) // len(bx), sum(by) // len(by)))

markers.sort()
if not markers:
    raise SystemExit('found colour but no marker-shaped clusters')
print('markers west to east:', markers)
if index >= len(markers):
    raise SystemExit(f'only {len(markers)} markers; index {index} is out of range')

cx, cy = markers[index]
X, Y = r.left + cx, r.top + cy
u.SetCursorPos(X, Y)
time.sleep(0.02)
u.mouse_event(0x0002, 0, 0, 0, 0)
time.sleep(0.02)
u.mouse_event(0x0004, 0, 0, 0, 0)
print(f'clicked marker {index} at ({X}, {Y})')
