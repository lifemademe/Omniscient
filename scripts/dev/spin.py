"""Spin the warehouse chase camera a full circle and report black frames.

The instrument that found the bloom fault. Takes pointer lock with one click, injects
relative mouse motion, and samples the diorama after each step.
"""
import ctypes, ctypes.wintypes, sys, time
from PIL import ImageGrab
import numpy as np

u = ctypes.windll.user32; u.SetProcessDPIAware()
MOVE, LDOWN, LUP = 0x0001, 0x0002, 0x0004
steps = int(sys.argv[1]) if len(sys.argv) > 1 else 44
step_px = int(sys.argv[2]) if len(sys.argv) > 2 else 72
h = None
for _ in range(90):
    h = u.FindWindowW(None, 'omniscient - default')
    if h: break
    time.sleep(0.25)
if not h: raise SystemExit('no game window')
r = ctypes.wintypes.RECT(); u.GetWindowRect(h, ctypes.byref(r))
w, ht = r.right - r.left, r.bottom - r.top
u.SetForegroundWindow(h); time.sleep(16.0)
u.SetCursorPos(r.left + int(w * 0.42), r.top + int(ht * 0.55)); time.sleep(0.3)
u.mouse_event(LDOWN, 0, 0, 0, 0); time.sleep(0.06); u.mouse_event(LUP, 0, 0, 0, 0); time.sleep(1.0)
box = (r.left + int(w * 0.26), r.top + int(ht * 0.30), r.left + int(w * 0.60), r.top + int(ht * 0.80))
black = []
for i in range(steps):
    dy = 40 if i % 8 < 4 else -40
    u.mouse_event(MOVE, step_px, dy, 0, 0); time.sleep(0.15)
    a = np.asarray(ImageGrab.grab(bbox=box).convert('L'), dtype=np.float32)
    if a.mean() < 6: black.append(i)
print('%d black of %d steps: %s' % (len(black), steps, black[:14]))
