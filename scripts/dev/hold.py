"""Hold real keys and mouse buttons against the focused window, for scripted play tests.

drive.py moves and clicks; it cannot HOLD, and M4SS is a game of holds - A/D to crawl,
LMB to stay latched, Space to charge a split. SendInput key-down, sleep, key-up is the
whole trick. Sequence comes as arguments: `hold.py d:2.0 lmb:1.5@640,400 space:1.0 q:0.8`
- a token per hold, executed in order, with an optional @x,y cursor move first.
"""

import ctypes
import sys
import time

user32 = ctypes.windll.user32
user32.SetProcessDPIAware()

VK = {'a': 0x41, 'd': 0x44, 'q': 0x51, 'space': 0x20, 'esc': 0x1B}


def key(code, down):
    # WITH the scan code. Browsers derive KeyboardEvent.code from the scan code, and the
    # game listens on e.code ('KeyD', 'Space'); a virtual-key-only event arrives with
    # code 'Unidentified' and the slime stands still while the harness reports success.
    scan = user32.MapVirtualKeyW(code, 0)
    user32.keybd_event(code, scan, 0 if down else 2, 0)


def mouse(down):
    user32.mouse_event(2 if down else 4, 0, 0, 0, 0)


for token in sys.argv[1:]:
    name, _, rest = token.partition(':')
    duration, _, at = rest.partition('@')
    if at:
        x, y = at.split(',')
        user32.SetCursorPos(int(x), int(y))
        time.sleep(0.05)
    seconds = float(duration)
    if name == 'lmb':
        mouse(True)
        time.sleep(seconds)
        mouse(False)
    else:
        key(VK[name], True)
        time.sleep(seconds)
        key(VK[name], False)
    time.sleep(0.15)
print('done')
