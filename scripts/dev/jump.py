"""Reach any diorama, or the warehouse, through SceneJump's hover strip.

    python scripts/dev/jump.py 6 out.png [settle]     # diorama tab 6
    python scripts/dev/jump.py W out.png [settle]     # warehouse-07-runtime

Ctrl+Shift+<n> is the documented way in and does not survive `keybd_event` from outside the
process - the chord never reaches the listener. The strip is the same entry point driven the
way a person drives it: hover the left edge to reveal it, then click the tab.

Two faults were fixed here after this tool spent months landing "about half the time", and
both are worth stating because they are easy to reintroduce.

**A teleport is not a move.** `SetCursorPos` to a single point often produces no `mousemove`
the page ever sees, and the strip's reveal is a `mousemove` listener - so the strip stayed
hidden, the click hit the canvas behind it, and nothing happened. Sweeping the cursor
through a few intermediate points makes it deterministic. The old five-attempt retry loop
was papering over exactly this, which is why it looked flaky rather than broken.

**The tab coordinates were absolute desktop constants.** They went stale every time the
window moved, and the previous comment here recorded the number being re-measured twice
(666, then 648) without the cause being fixed. The strip is now *found* in a capture by the
colour of its own borders, so adding, removing or reordering a tab cannot invalidate this
file. SceneJump gives the scene tabs a blue inset (#2f7391), the warehouse tab a red one
(#8f3f4a) and the capture tab a green one (#66864f); those three are the index.

Tab order, top to bottom, is NOT the builder registration order:
  1 repair-shop  2 cleared-house  3 beacon-mast  4 seedling-tunnel
  5 flooded-cellar  6 night-door  7 mill-road  8 wire-city
"""
import ctypes
import ctypes.wintypes
import sys
import time

from PIL import ImageGrab

u = ctypes.windll.user32
u.SetProcessDPIAware()

LEFTDOWN, LEFTUP = 0x0002, 0x0004
SCENE_EDGE = (47, 115, 145)    # #2f7391 - the eight numbered tabs
WAREHOUSE_EDGE = (143, 63, 74)  # #8f3f4a - the 'W' tab
CAPTURE_EDGE = (102, 134, 79)   # #66864f - the 'F'/'R' tab


def window():
    handle = u.FindWindowW(None, 'omniscient - default')
    if not handle:
        raise SystemExit('game window not found')
    rect = ctypes.wintypes.RECT()
    u.GetWindowRect(handle, ctypes.byref(rect))
    return handle, (rect.left, rect.top, rect.right, rect.bottom)


def grab(rect):
    return ImageGrab.grab(all_screens=True).crop(rect)


def sweep(points, dwell=0.045):
    """Real cursor motion. See the note above: a single SetCursorPos is not a move."""
    for point in points:
        u.SetCursorPos(*point)
        time.sleep(dwell)


def reveal(rect):
    """Bring the pointer to the left edge along a path, and hand back a capture of it."""
    left, top, right, bottom = rect
    mid = (top + bottom) // 2
    lane = [(left + d, mid) for d in (400, 260, 150, 80, 45, 28, 18)]
    sweep(lane)
    time.sleep(0.35)
    return grab(rect)


def near(pixel, target, tol=26):
    return all(abs(a - b) <= tol for a, b in zip(pixel[:3], target))


def find_tabs(shot):
    """Locate every tab as (kind, left_x, top_y) in window-relative pixels.

    Each tab is drawn `inset 1px 1px 0 <colour>`, which paints a line along its TOP and one
    down its LEFT. The left line runs the tab's whole height and the tabs are only 2px
    apart, so grouping matching rows by proximity merges the whole strip into a few blobs -
    the first version of this did exactly that and reported six tabs at four times the real
    pitch. The top border is a horizontal run the width of the tab; the side border is a
    single column. Counting matches per row separates them cleanly.
    """
    pixels = shot.convert('RGB').load()
    width, height = shot.size
    margin = min(46, width)
    kinds = (('scene', SCENE_EDGE), ('warehouse', WAREHOUSE_EDGE), ('capture', CAPTURE_EDGE))

    found, last = [], -99
    for y in range(height):
        for kind, colour in kinds:
            xs = [x for x in range(margin) if near(pixels[x, y], colour)]
            # A top border, not the one-pixel column down a tab's side.
            if len(xs) >= 8 and y - last > 4:
                found.append((kind, min(xs), y))
                last = y
                break
    return found


def resolve(found, want):
    """Turn '6' or 'W' into a click point, from what was actually seen on screen.

    Indexed off the WAREHOUSE tab rather than counted from the top. Counting down from the
    first detected border put every scene tab one pitch out, because something above tab 1 -
    the strip's own padding edge - matches the scene colour and reads as a ninth top. The
    warehouse tab's colour is unique on the strip and it always sits directly below tab 8,
    so it is the one landmark on here that cannot be miscounted.
    """
    scenes = [t for t in found if t[0] == 'scene']
    if len(scenes) < 2:
        raise SystemExit(f'the strip did not open: found {len(scenes)} scene tabs')
    tops = sorted(t[2] for t in scenes)
    pitch = round((tops[-1] - tops[0]) / (len(tops) - 1))

    # Everything on the strip shares one left edge. The warehouse tab's dark red is a
    # perfectly ordinary warehouse colour, and unpinned it matched a crate out in the room
    # and moved the anchor four tabs. The scene tabs' blue cannot occur out there at this
    # x, so they are what defines the column and everything else must line up with it.
    x = min(t[1] for t in scenes)
    houses = [t for t in found if t[0] == 'warehouse' and abs(t[1] - x) <= 3]
    if not houses:
        raise SystemExit('no warehouse tab on the strip - is jumpToWarehouse wired up?')
    anchor = houses[0][2]

    if want.upper() == 'W':
        top = anchor
    else:
        index = int(want)
        if not 1 <= index <= 8:
            raise SystemExit(f'tab {want} does not exist: the strip has 8 scene tabs')
        # Tab 8 sits one pitch above the warehouse tab, tab 7 two pitches, and so on.
        top = anchor - (9 - index) * pitch
    return x + 8, top + pitch // 2, pitch, len(scenes)


def main():
    want = sys.argv[1] if len(sys.argv) > 1 else 'W'
    out = sys.argv[2] if len(sys.argv) > 2 else 'scripts/dev/jump.png'
    settle = float(sys.argv[3]) if len(sys.argv) > 3 else 6.0

    handle, rect = window()
    u.SetForegroundWindow(handle)
    time.sleep(0.6)

    shot = reveal(rect)
    x, y, pitch, count = resolve(find_tabs(shot), want)
    target = (rect[0] + x, rect[1] + y)

    # Approach ALONG the strip, so the reveal never lapses between hover and click.
    sweep([(target[0], rect[1] + y - 60), (target[0], rect[1] + y - 25), target], 0.06)
    time.sleep(0.2)
    u.mouse_event(LEFTDOWN, 0, 0, 0, 0)
    time.sleep(0.07)
    u.mouse_event(LEFTUP, 0, 0, 0, 0)

    # Park well clear, or the strip stays lit in the capture.
    time.sleep(0.7)
    u.SetCursorPos((rect[0] + rect[2]) // 2, (rect[1] + rect[3]) // 2)
    time.sleep(settle)

    grab(rect).save(out)
    print(f'{out}  tab {want} at {target}  (pitch {pitch}, {count} scene tabs)')


if __name__ == '__main__':
    main()
