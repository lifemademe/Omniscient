"""Click somewhere in the game window and shoot the result.

    python scripts/dev/tap.py X Y out.png [wait] [scale]

X and Y are in the coordinate space of the LAST image `shot.py` wrote - that is, window
content pixels, origin at the window's top-left, not desktop pixels. That is the space you
are reading coordinates off when you look at a capture, so it is the space that stops the
+309/+195 arithmetic being redone by hand every time and getting it wrong once.

Pass `scale` if you measured the point on a downscaled copy: `tap.py 337 222 out.png 3 0.5`
means "337,222 on a half-size image".

Two things this encodes, both learned here:

**A teleport is not a move.** `SetCursorPos` straight to a target often produces no
`mousemove` the page ever sees, so hover states never open and the click lands on whatever
was underneath. The cursor is swept through intermediate points instead. Same fault as the
one documented at length in jump.py.

**Keys do not reach this window but clicks do.** `keybd_event` from outside the process is
swallowed - see the memory note - so anything reachable only by keyboard is not reachable
this way. The boot screen's "PRESS ANY KEY" accepts a click, which is why this works at all.
"""
import ctypes
import ctypes.wintypes
import subprocess
import sys
import time

from PIL import ImageGrab

u = ctypes.windll.user32
u.SetProcessDPIAware()
TITLE = 'omniscient - default'


def rect() -> tuple[int, int, int, int]:
    h = u.FindWindowW(None, TITLE)
    if not h:
        raise SystemExit(f'no window titled {TITLE!r} - is play mode running?')
    r = ctypes.wintypes.RECT()
    u.GetWindowRect(h, ctypes.byref(r))
    u.SetForegroundWindow(h)
    return r.left, r.top, r.right, r.bottom


def sweep(x: int, y: int, steps: int = 14) -> None:
    c = ctypes.wintypes.POINT()
    u.GetCursorPos(ctypes.byref(c))
    for i in range(1, steps + 1):
        u.SetCursorPos(int(c.x + (x - c.x) * i / steps), int(c.y + (y - c.y) * i / steps))
        time.sleep(0.012)


def main() -> None:
    x, y, out = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
    wait = float(sys.argv[4]) if len(sys.argv) > 4 else 3.0
    scale = float(sys.argv[5]) if len(sys.argv) > 5 else 1.0
    left, top, right, bottom = rect()
    time.sleep(0.25)
    sweep(left + int(x / scale), top + int(y / scale))
    time.sleep(0.35)
    u.mouse_event(0x0002, 0, 0, 0, 0)
    time.sleep(0.06)
    u.mouse_event(0x0004, 0, 0, 0, 0)
    time.sleep(wait)
    im = ImageGrab.grab(bbox=(left, top, right, bottom))
    im.save(out)
    small = out.replace('.png', '-s.png')
    im.resize((im.width // 2, im.height // 2)).save(small)
    print(f'{out} + {small}   clicked ({x},{y}) of {im.width}x{im.height}')


main()
