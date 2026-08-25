"""Rotate the drone camera and catch the black box.

    python scripts/dev/blackbox.py [steps] [pixels-per-step]

Assumes the warehouse is already on screen - reach it with `intro.py` first.

`spin.py` already spins the camera, but its detector asks whether the WHOLE frame went
black, which is the fault it was built for. The one reported here is a hard-edged black
rectangle sitting in the middle of an otherwise correct picture, so a frame mean never moves
far enough to notice. This looks for a large contiguous run of near-zero pixels inside the
stage instead, and saves every frame that has one, so the thing can be looked at rather than
counted.

The sample box deliberately excludes the HUD: the ops panel on the right and the cards down
the left are legitimately near-black, and including them puts a permanent 8% floor on the
measurement that swamps the signal.
"""
import ctypes
import ctypes.wintypes
import sys
import time

import numpy as np
from PIL import ImageGrab

u = ctypes.windll.user32
u.SetProcessDPIAware()

MOVE, LDOWN, LUP = 0x0001, 0x0002, 0x0004
steps = int(sys.argv[1]) if len(sys.argv) > 1 else 48
step_px = int(sys.argv[2]) if len(sys.argv) > 2 else 60

handle = u.FindWindowW(None, 'omniscient - default')
if not handle:
    raise SystemExit('game window not found - is play mode up?')
u.SetForegroundWindow(handle)
time.sleep(1.2)

rect = ctypes.wintypes.RECT()
u.GetWindowRect(handle, ctypes.byref(rect))
width, height = rect.right - rect.left, rect.bottom - rect.top

# Click once to take pointer lock, in open stage well clear of any HUD control.
u.SetCursorPos(rect.left + int(width * 0.34), rect.top + int(height * 0.55))
time.sleep(0.4)
u.mouse_event(LDOWN, 0, 0, 0, 0)
time.sleep(0.07)
u.mouse_event(LUP, 0, 0, 0, 0)
time.sleep(1.2)

box = (
    rect.left + int(width * 0.14),
    rect.top + int(height * 0.18),
    rect.left + int(width * 0.62),
    rect.top + int(height * 0.72),
)

found = 0
worst = 0.0
for index in range(steps):
    dy = 30 if index % 10 < 5 else -30
    u.mouse_event(MOVE, step_px, dy, 0, 0)
    time.sleep(0.16)
    frame = ImageGrab.grab(bbox=box)
    grey = np.asarray(frame.convert('L'), dtype=np.float32)
    dark = grey < 10
    fraction = float(dark.mean())
    worst = max(worst, fraction)
    if fraction > 0.04:
        rows = np.flatnonzero(dark.mean(axis=1) > 0.25)
        cols = np.flatnonzero(dark.mean(axis=0) > 0.25)
        span = (
            f'rows {rows[0]}-{rows[-1]} cols {cols[0]}-{cols[-1]}'
            if rows.size and cols.size else 'scattered'
        )
        print(f'  step {index:3d}  dark {fraction:.1%}  {span}')
        if found < 6:
            frame.save(f'scripts/dev/bb-{found}.png')
            ImageGrab.grab(bbox=(rect.left, rect.top, rect.right, rect.bottom)).save(
                f'scripts/dev/bbfull-{found}.png'
            )
        found += 1

print(f'{found} of {steps} steps showed a dark blob; worst {worst:.1%}')
