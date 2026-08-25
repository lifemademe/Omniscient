"""Press keys at the running game and capture what each one did.

    python scripts/dev/keys.py out C C C C TAB

Assumes the mission is already on screen - reach it with `intro.py` first. Writes one PNG
per key plus a contact sheet, so a control scheme can be read as a strip: press, look,
press, look.

## What this actually established, which is a negative result

Synthetic keyboard input does NOT reach the page. Not `keybd_event` with virtual key codes,
and not `SendInput` with scancodes either, with `GetForegroundWindow` confirming the game
window had focus and with the mouse working perfectly in the same session a second earlier.
Six presses in a row moved 0.1% of the frame, which is camera noise.

That confirms and extends an older note in this project which had only tested Ctrl+Shift
chords and unicode into a focused text field - it is not about modifiers or text fields, it
is every key. So a keyboard rebind in this game CANNOT be verified by pressing the key from
a script, and any claim that one was is a claim about the code, not about the game.

The script is kept because that is worth being able to re-establish in one command rather
than re-deriving. If it ever prints a change above a percent or two, the limitation has
lifted and rebinds became testable.
"""
import ctypes
import ctypes.wintypes
import sys
import time

import numpy as np
from PIL import Image, ImageGrab

u = ctypes.windll.user32
u.SetProcessDPIAware()

KEYUP = 0x0002
VK = {'TAB': 0x09, 'ESC': 0x1B, 'SPACE': 0x20}

out = sys.argv[1] if len(sys.argv) > 1 else 'keys'
keys = [k.upper() for k in sys.argv[2:]] or ['C']

handle = u.FindWindowW(None, 'omniscient - default')
if not handle:
    raise SystemExit('game window not found - is play mode up?')
u.SetForegroundWindow(handle)
time.sleep(1.0)

rect = ctypes.wintypes.RECT()
u.GetWindowRect(handle, ctypes.byref(rect))
box = (rect.left, rect.top, rect.right, rect.bottom)
# Park the pointer off the HUD so no hover state creeps into the comparison.
u.SetCursorPos(rect.left + 40, rect.bottom - 40)


def press(key):
    code = VK.get(key, ord(key) if len(key) == 1 else 0)
    if not code:
        raise SystemExit(f'unknown key {key}')
    u.keybd_event(code, 0, 0, 0)
    time.sleep(0.06)
    u.keybd_event(code, 0, KEYUP, 0)


def grab():
    return ImageGrab.grab(all_screens=True).crop(box)


shots = [('start', grab())]
for key in keys:
    press(key)
    # Long enough for a camera cut and its caption to land, short enough that a 1.1s flash
    # is still on screen to be read.
    time.sleep(0.65)
    shots.append((key, grab()))

previous = None
for index, (label, shot) in enumerate(shots):
    shot.save(f'scripts/dev/{out}-{index}-{label}.png')
    small = np.asarray(shot.convert('L').resize((240, 140)), dtype=np.float32)
    moved = '' if previous is None else f'  changed {float((np.abs(small - previous) > 30).mean()):.1%}'
    print(f'  {index} {label}{moved}')
    previous = small

cols = min(3, len(shots))
rows = (len(shots) + cols - 1) // cols
thumb = shots[0][1].width // 3, shots[0][1].height // 3
sheet = Image.new('RGB', (thumb[0] * cols, thumb[1] * rows), (10, 10, 10))
for index, (_, shot) in enumerate(shots):
    sheet.paste(shot.resize(thumb), ((index % cols) * thumb[0], (index // cols) * thumb[1]))
sheet.save(f'scripts/dev/{out}-sheet.png')
print(f'{len(shots)} shots -> scripts/dev/{out}-sheet.png')
