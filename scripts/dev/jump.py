"""Reach a diorama through SceneJump's hover strip, with the mouse.

    python scripts/dev/jump.py 6 out.png [settle]

Ctrl+Shift+<n> is the documented way in and does not survive `keybd_event` from outside the
process - the chord never reaches the listener. The strip is the same entry point driven the
way a person drives it: hover the left edge to reveal it, then click the tab.

The geometry is NOT what `buildStrip` says: the tabs are 20px on a 22px pitch in CSS, and on
screen they measure 33px apart, because the game container is scaled. So these are measured
coordinates rather than computed ones, and the strip retracts whenever the pointer leaves -
which means a re-hover before every click, not just the first.

Tab order, top to bottom, is NOT the builder registration order:
  1 repair-shop  2 cleared-house  3 beacon-mast  4 seedling-tunnel
  5 flooded-cellar  6 night-door  7 mill-road  8 wire-city
Tab 9 is the warehouse; `intro.py` reaches it by colour rather than by index.
"""
import ctypes
import ctypes.wintypes
import sys
import time

from PIL import ImageGrab

u = ctypes.windll.user32
u.SetProcessDPIAware()

LEFTDOWN, LEFTUP = 0x0002, 0x0004
# 648, not the 666 this held for months. The strip is `top:50%; translateY(-50%)`, so it is
# vertically CENTRED: adding the warehouse 'W' tab as a ninth button moved every tab up by
# half a pitch. Measured off a hover capture rather than recomputed, and it will move again
# the next time a tab is added - so measure, do not trust this number after an edit to
# SceneJump's tab list.
TAB1_Y, PITCH, TAB_X = 648, 33, 335
HOVER = (347, 780)

index = int(sys.argv[1]) - 1
out = sys.argv[2]
settle = float(sys.argv[3]) if len(sys.argv) > 3 else 5.0

handle = u.FindWindowW(None, 'omniscient - default')
if not handle:
    raise SystemExit('game window not found')

u.SetForegroundWindow(handle)
time.sleep(1.0)
if u.GetForegroundWindow() != handle:
    print('WARNING: the window did not take focus')

y = TAB1_Y + index * PITCH


def grab():
    rect = ctypes.wintypes.RECT()
    u.GetWindowRect(handle, ctypes.byref(rect))
    return ImageGrab.grab(all_screens=True).crop((rect.left, rect.top, rect.right, rect.bottom))


def on_menu(shot):
    """Is the OMNISCIENT logo still on screen?

    Needed because the click lands about half the time - the strip retracts on any pointer
    move it does not like - and a missed click silently leaves the menu up, which then gets
    measured as if it were the scene. Three captures were nearly reported that way, and one
    of them got past a first attempt at this check.

    That first attempt used mean brightness over the plate stack, and it is worth saying why
    it failed: the menu measured 103 there against the diorama's 74, which separates, but
    only just, and it separates on a quantity neither picture is really about. The logo is a
    green glow on black - the ONLY strongly green thing in either image - so green-minus-red
    over its box comes out at +5 for the menu and -25 for the door. Thirty apart on a
    signature that cannot appear by accident beats thirty apart on overall brightness.
    """
    a = shot.convert('RGB').crop((510, 150, 900, 270))
    px = list(a.getdata())
    return sum(g - r for r, g, b in px) / len(px) > -10


for attempt in range(5):
    # Reveal, then approach along the strip so it never retracts between the two.
    u.SetCursorPos(*HOVER)
    time.sleep(0.6)
    u.SetCursorPos(TAB_X, y)
    time.sleep(0.5)
    u.mouse_event(LEFTDOWN, 0, 0, 0, 0)
    time.sleep(0.08)
    u.mouse_event(LEFTUP, 0, 0, 0, 0)
    # Park well clear, or the strip stays lit in the capture.
    time.sleep(0.6)
    u.SetCursorPos(1200, 500)
    time.sleep(settle if attempt else 2.0)
    shot = grab()
    if not on_menu(shot):
        break
    print(f'  attempt {attempt + 1}: still on the menu, retrying')
else:
    raise SystemExit('never left the menu')

time.sleep(max(0.0, settle - 2.0))
grab().save(out)
print(f'{out}  clicked tab {index + 1} at {TAB_X},{y}')
