"""Capture the game window, wherever it is.

The window rect was being read off a stale crop constant, and play mode moves the window
every restart - so every coordinate taken off a screenshot was measured against the wrong
origin. Ask Windows where it is, every time.

  python shot.py [out.png] [waitSeconds]
"""
import ctypes
import ctypes.wintypes
import sys
import time

from PIL import ImageGrab

u = ctypes.windll.user32
u.SetProcessDPIAware()

out = sys.argv[1] if len(sys.argv) > 1 else 'scripts/dev/live.png'
if len(sys.argv) > 2:
    time.sleep(float(sys.argv[2]))

handle = u.FindWindowW(None, 'omniscient - default')
if not handle:
    raise SystemExit('game window not found')
rect = ctypes.wintypes.RECT()
u.GetWindowRect(handle, ctypes.byref(rect))
ImageGrab.grab(all_screens=True).crop((rect.left, rect.top, rect.right, rect.bottom)).save(out)
print(f'{out}  rect={rect.left},{rect.top},{rect.right},{rect.bottom}')
