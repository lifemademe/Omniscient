"""Open a contact from the globe: find a signal's label, click it, answer it.

    python pin.py            # open the first answerable signal
    python pin.py --list     # find the labels and print them, click nothing

This was unsolved for a long time and the reason is worth stating, because the thing that
finally worked is not what the earlier attempts were trying to fix.

The old note here said a pin marker and its label were "the same hue AND the same size", so
detection picked the wrong one, and it proposed stopping the globe rotating. Both were beside
the point. Reading GlobeScreen.onStageClick settles it: the hit test is NOT against the
projected dots. It measures distance from the click to the laid-out LABEL positions, with a
HIT_RADIUS of 16 canvas units on a 320-wide canvas - which is about fifty screen pixels once
the stage is scaled up. The label is what the player aims at, and the target is enormous.

So the marker never had to be found at all. Only the label, and the label is text.

What made the text findable was an unrelated change: the four signal states used to be four
hues at almost the same brightness, and were rebuilt as a value ladder for Law 5 (see
scripts/law5-states.ts). An answerable signal's label is now the brightest saturated green on
the screen, which a mask can pick out in one pass.

## Two things that will bite

The globe TURNS. Between the screenshot and the click a label moves, and with a fifty-pixel
target that is usually survivable and occasionally not - it opened the neighbouring contact
the first time this ran. Capture and click back to back; do not think in between.

The left-hand readout panel is also bright green text. It is excluded by x, not by colour,
because "REQUESTS WAITING" is exactly the same green as a pin and always will be.
"""
import ctypes
import ctypes.wintypes
import sys
import time

import numpy as np
from PIL import ImageGrab

u = ctypes.windll.user32
u.SetProcessDPIAware()
LEFTDOWN, LEFTUP = 0x0002, 0x0004

# The globe stage, in window-relative pixels. Everything left of STAGE_X0 is the readout
# panel, which is the same green and must not be clicked.
STAGE_X0, STAGE_X1 = 620, 1740
STAGE_Y0, STAGE_Y1 = 150, 1000


def window() -> tuple[int, int, int, int]:
    handle = u.FindWindowW(None, 'omniscient - default')
    if not handle:
        raise SystemExit('game window not found')
    rect = ctypes.wintypes.RECT()
    u.GetWindowRect(handle, ctypes.byref(rect))
    return rect.left, rect.top, rect.right, rect.bottom


def grab(rect):
    return ImageGrab.grab(all_screens=True).crop(rect)


def labels(shot) -> list[dict]:
    """Bright saturated green text inside the stage, clustered into labels."""
    a = np.asarray(shot.convert('RGB'), dtype=int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mask = (g > 150) & (g - r > 45) & (g - b > 45)
    mask[:STAGE_Y0, :] = False
    mask[STAGE_Y1:, :] = False
    mask[:, :STAGE_X0] = False
    mask[:, STAGE_X1:] = False

    ys, xs = np.where(mask)
    order = np.argsort(xs)
    xs, ys = xs[order], ys[order]
    out: list[dict] = []
    for x, y in zip(xs, ys):
        for c in out:
            if abs(int(x) - c['x1']) < 40 and abs(int(y) - c['cy']) < 22:
                c['x1'] = max(c['x1'], int(x))
                c['x0'] = min(c['x0'], int(x))
                c['n'] += 1
                c['sy'] += int(y)
                c['cy'] = c['sy'] // c['n']
                break
        else:
            out.append({'x0': int(x), 'x1': int(x), 'sy': int(y), 'cy': int(y), 'n': 1})
    return [c for c in out if c['n'] > 60]


def on_globe(shot) -> bool:
    """Is the globe still up?

    Two wrong answers before this one, and the first was dangerous rather than merely broken.

    "Did the label finder see anything" fails because a contact view has plenty of bright
    green text of its own, so the finder kept reporting pins after a successful entry and the
    retry loop went on clicking inside a live mission.

    "Is there green text in the top-left readout column" fails too: the warehouse HUD puts
    INTEGRITY / QUEST / CLEAN CHAIN in exactly that corner, in exactly that green.

    What is actually unique to this screen is the CYAN WIREFRAME SPHERE. Measured across the
    stage centre: globe 7207 pixels, a contact diorama 2409, the warehouse 380. Nothing else
    in the game draws a large cold lattice on a dark field.
    """
    a = np.asarray(shot.convert('RGB'), dtype=int)
    c = a[300:900, 800:1700]
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    cyan = (b > 90) & (b - r > 35) & (g - r > 15)
    total = int(cyan.sum())
    if total < 4500:
        return False
    # Amount alone is not enough: the main menu's daylit window is a big pale-blue AREA and
    # clears the same bar at 6527. A wireframe is THIN, so most of its pixels have no lit
    # neighbour either side; a filled region is the opposite. Globe 0.45 thin, menu 0.15.
    solid = int((cyan[:, :-2] & cyan[:, 1:-1] & cyan[:, 2:]).sum())
    return (1 - solid / total) > 0.30


def click(x: int, y: int) -> None:
    u.SetCursorPos(x, y)
    time.sleep(0.05)
    u.mouse_event(LEFTDOWN, 0, 0, 0, 0)
    time.sleep(0.05)
    u.mouse_event(LEFTUP, 0, 0, 0, 0)


def main() -> None:
    rect = window()
    found = labels(grab(rect))
    if not found:
        raise SystemExit('no answerable signal labels on screen - is the globe up?')

    found.sort(key=lambda c: -c['n'])
    if '--list' in sys.argv:
        for c in found:
            print(f"  label x {c['x0']}-{c['x1']}  y {c['cy']}  ({c['n']} px)")
        return

    """
    Three attempts, because the globe TURNS and a miss is normal rather than exceptional.

    Between the screenshot that locates a label and the click that lands on it, the sphere has
    moved. The hit radius is about fifty screen pixels so most of the time that does not
    matter, and some of the time it opens the neighbouring contact instead - which is not a
    failure of aim, it is a moving target. Verifying the outcome and going again is far
    simpler than trying to predict the rotation.

    The test for success is that the globe is GONE: entering a contact replaces the whole
    screen, so if the label finder still sees pins, nothing happened.
    """
    for attempt in range(3):
        shot = grab(rect)
        if not on_globe(shot):
            print('entered a contact')
            return
        found = labels(shot)
        if not found:
            raise SystemExit('globe is up but no answerable labels found')
        found.sort(key=lambda c: -c['n'])
        target = found[0]

        # A few pixels into the text rather than its leading edge: the label is drawn 10px
        # right of its own hit point, so anywhere on the glyphs is inside the radius.
        click(rect[0] + target['x0'] + 14, rect[1] + target['cy'])
        time.sleep(1.6)

        after = grab(rect)
        a = np.asarray(after.convert('RGB'), dtype=int)
        r, g, b = a[..., 0], a[..., 1], a[..., 2]
        edge = (g > 55) & (g - r > 15) & (g - b > 15)

        # Centred on the label, not hanging off it. The tooltip flips to whichever side has
        # room, so a window that only looked down and right found nothing whenever a pin sat
        # low or far over - which is most of the southern hemisphere.
        y0 = max(STAGE_Y0, target['cy'] - 300)
        y1 = min(edge.shape[0], STAGE_Y1, target['cy'] + 300)
        x0 = max(STAGE_X0, target['x0'] - 220)
        x1 = min(edge.shape[1], STAGE_X1, target['x0'] + 560)
        region = edge[y0:y1, x0:x1]

        """
        CONTIGUOUS runs, not "pixels somewhere on this row".

        The first version measured each row's total green-pixel count and its overall span,
        and rejected anything whose span was wide relative to the count. That works on an
        empty row and fails on a real one: the tooltip's own frame and the globe wireframe put
        green on the same rows as the button, so a genuine 125-pixel button edge came out as
        125 pixels spread across 900 and was thrown away as noise. The button was visible in
        the screenshot the whole time.
        """
        runs = []
        for y in range(region.shape[0]):
            xs = np.where(region[y])[0]
            if len(xs) < 60:
                continue
            start = prev = xs[0]
            for x in list(xs[1:]) + [None]:
                if x is not None and x - prev <= 2:
                    prev = x
                    continue
                length = prev - start + 1
                # The button is about 125px wide. The tooltip's own frame is nearer 384 and
                # glyph fragments are far shorter, so this window selects the button alone.
                if 80 <= length <= 220:
                    runs.append((y, int(start), int(prev)))
                if x is None:
                    break
                start = prev = x

        pair = None
        for i in range(len(runs)):
            for j in range(i + 1, len(runs)):
                if 25 <= runs[j][0] - runs[i][0] <= 60 and abs(runs[j][1] - runs[i][1]) < 12:
                    pair = (runs[i], runs[j])
                    break
            if pair:
                break
        if not pair:
            print(f'  attempt {attempt + 1}: no button under that label - retrying')
            continue

        top, bottom = pair
        cx = x0 + (top[1] + top[2]) // 2
        cy = y0 + (top[0] + bottom[0]) // 2
        click(rect[0] + cx, rect[1] + cy)
        time.sleep(2.5)

        if not on_globe(grab(rect)):
            print(f'entered a contact (button at window {cx}, {cy})')
            return
        print(f'  attempt {attempt + 1}: still on the globe - the sphere turned; retrying')

    raise SystemExit('could not enter a contact in three attempts')


if __name__ == '__main__':
    main()
