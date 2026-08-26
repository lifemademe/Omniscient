"""Press keys at the live game window and shoot the result.

    python scripts/dev/press.py out KEY [KEY ...]

Written for the H sheet, which cannot be reached any other way: the sheet only exists while
a mission is running, and the recorder in intro.py plays the opening sweep and stops. This
attaches to whatever is already on screen, sends the keys, and grabs a frame after each.
"""
import ctypes
import ctypes.wintypes
import sys
import time

from PIL import ImageGrab

u = ctypes.windll.user32
u.SetProcessDPIAware()

VK = {'H': 0x48, 'TAB': 0x09, 'C': 0x43, 'F': 0x46, 'R': 0x52, 'ESC': 0x1B, 'W': 0x57}
KEYUP = 0x0002

out = sys.argv[1]
keys = sys.argv[2:]

handle = u.FindWindowW(None, 'omniscient - default')
if not handle:
    raise SystemExit('game window not found - is play mode up?')
u.SetForegroundWindow(handle)
time.sleep(1.2)

rect = ctypes.wintypes.RECT()
u.GetWindowRect(handle, ctypes.byref(rect))
box = (rect.left, rect.top, rect.right, rect.bottom)


def shot(name):
    ImageGrab.grab(all_screens=True).crop(box).save(f'scripts/dev/{name}.png')
    print('  ->', name)


shot(f'{out}-before')
for index, key in enumerate(keys):
    code = VK[key.upper()]
    u.keybd_event(code, 0, 0, 0)
    time.sleep(0.06)
    u.keybd_event(code, 0, KEYUP, 0)
    time.sleep(1.1)
    shot(f'{out}-{index}-{key.lower()}')
