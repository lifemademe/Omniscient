"""Record the warehouse opening sweep, from the SceneJump 'W' tab to drone control.

    python scripts/dev/intro.py out [seconds] [fps] [wait]

`jump.py` takes ONE shot after a settle, which is the wrong instrument for a cut sequence:
the whole question here is what is on screen at second one, second two and second three.
The rear dock shot survived a week because nobody ever looked at the middle 1.1 seconds of
it. So this reaches the warehouse and then grabs continuously, and writes a contact sheet -
every frame at once, in reading order, which is how you see that shot two is a wall.

Everything awkward in this file is about reaching the mission at all; the recording itself
is four lines. The three docstrings below are the map, and each one is a bug that looked
like a working measurement.
"""
import ctypes
import ctypes.wintypes
import sys
import time

import numpy as np
from PIL import Image, ImageGrab

u = ctypes.windll.user32
u.SetProcessDPIAware()

LEFTDOWN, LEFTUP = 0x0002, 0x0004
HOVER = (347, 780)
TAB_X = 335

out = sys.argv[1] if len(sys.argv) > 1 else 'intro'
seconds = float(sys.argv[2]) if len(sys.argv) > 2 else 8.0
fps = float(sys.argv[3]) if len(sys.argv) > 3 else 5.0
wait = float(sys.argv[4]) if len(sys.argv) > 4 else 4.0

handle = None
for _ in range(120):
    handle = u.FindWindowW(None, 'omniscient - default')
    if handle:
        break
    time.sleep(0.25)
if not handle:
    raise SystemExit('game window not found - is play mode up?')

u.SetForegroundWindow(handle)
time.sleep(1.0)
if u.GetForegroundWindow() != handle:
    print('WARNING: the window did not take focus')

rect = ctypes.wintypes.RECT()
u.GetWindowRect(handle, ctypes.byref(rect))
box = (rect.left, rect.top, rect.right, rect.bottom)
time.sleep(wait)


def frame():
    """The window as a small grayscale array - enough to tell one screen from another."""
    return np.asarray(
        ImageGrab.grab(all_screens=True).crop(box).convert('L').resize((240, 140)),
        dtype=np.float32,
    )


def changed_fraction(before, after):
    return float((np.abs(after - before) > 30).mean())


def dismiss_boot():
    """Get past OMNISCIENT OS / PRESS ANY KEY.

    Play mode opens on the boot screen and STAYS there until something is pressed - it is
    not a timed splash. That cost a while: the tab probe reported the same flat measurement
    twelve times in a row, which reads like a broken instrument and was in fact a correct
    reading of a black screen with green text on it. Earlier runs only ever got past the
    boot screen by accident, because a click aimed at the scene strip doubles as the any-key.

    Clicked low and left, well clear of the menu plates behind it, so this can never seat a
    connector on the way past.
    """
    u.SetCursorPos(rect.left + 60, rect.bottom - 60)
    time.sleep(0.3)
    u.mouse_event(LEFTDOWN, 0, 0, 0, 0)
    time.sleep(0.08)
    u.mouse_event(LEFTUP, 0, 0, 0, 0)
    time.sleep(3.0)


def tab_column(cursor):
    """The strip's column of the screen, with the pointer parked wherever asked."""
    u.SetCursorPos(*cursor)
    time.sleep(0.9)
    shot = np.asarray(ImageGrab.grab(all_screens=True).convert('RGB'), dtype=np.float32)
    return shot[rect.top + 200:rect.bottom - 40, TAB_X - 7:TAB_X + 7]


def find_warehouse_tab():
    """Locate the 'W' tab by what the hover CHANGES, rather than by what is warm.

    Two earlier versions of this were wrong in instructive ways.

    Counting was wrong: clicking the ninth position at a y computed from jump.py's TAB1_Y
    missed by eighteen pixels, because the strip is top:50% with a translateY(-50%) and is
    therefore CENTRED - adding the warehouse tab as a ninth button silently moved all nine.
    A hardcoded index into a centred list is wrong every time the list changes length.

    Warmth alone was wrong too, and worse, because it failed while looking like it worked.
    The warehouse tab is the only warm thing ON THE STRIP - amber glyph, maroon bezel,
    against eight in cyan - but it is not the only warm thing in the COLUMN, because behind
    the strip is a lamp-lit room. When the hover did not take, the reddest row was a patch
    of desk, and the probe cheerfully reported the warehouse tab at y 952: a confident
    measurement of the furniture, and twelve clicks into empty space.

    So: grab the column with the pointer away, grab it again hovering, and keep only the
    rows the hover actually changed. That is the strip and nothing else - the room behind it
    does not move. The warmest row of what changed is the warehouse tab, and if nothing
    changed then the strip never appeared and there is no answer to give.
    """
    for _ in range(12):
        # Away first: a SetCursorPos onto the position the pointer already occupies emits no
        # mousemove, and the strip is revealed by a mousemove listener, so the order here is
        # load bearing - a second run in a row would hover a strip that never appeared.
        hidden = tab_column((HOVER[0] + 260, HOVER[1] - 180))
        shown = tab_column(HOVER)
        rows = np.flatnonzero(np.abs(shown - hidden).mean(axis=(1, 2)) > 8)
        if rows.size >= 40:
            warmth = (shown[:, :, 0] - shown[:, :, 2]).mean(axis=1)
            masked = np.full(warmth.shape, -1e9)
            masked[rows] = warmth[rows]
            top, bottom = rect.top + 200 + int(rows[0]), rect.top + 200 + int(rows[-1])
            print(f'  strip spans {top}-{bottom}')
            return rect.top + 200 + int(masked.argmax())
        print(f'  strip not up yet ({rows.size} rows changed)')
        time.sleep(1.2)
    raise SystemExit('never found the warehouse tab - is the game past its boot screen?')


def jump_to_warehouse(tab_y):
    """Click until the SCREEN changes, then return - the caller records from here.

    Three failure modes had to be told apart, and the third was expensive.

    A MISSED click leaves the menu up with nothing mounted, and can simply be repeated: the
    strip retracts on pointer moves it dislikes and lands about half the time. A LANDED
    click mounts the mission, and jumpToWarehouse is idempotent, so clicking again does
    nothing at all - the 4.8s opening plays out once, and a retry loop that waits before
    checking has already missed the thing it exists to record.

    The third was the test itself. This used jump.py's on_menu - green-minus-red over the
    box the OMNISCIENT logo occupies - and in the warehouse that box lands squarely on the
    green console panel. So a landed click measured as "still on the menu", and the loop
    clicked twelve more times into a mission that was already running, then gave up with the
    footage it wanted sitting on screen behind it. A signature that identifies one screen is
    not automatically a signature that RULES OUT another.

    What replaces it needs no signature at all: a landed click swaps the entire scene, so a
    quarter of the frame changes at once. Nothing else here can do that - the strip
    appearing is a twenty-pixel column, well under one percent - so the threshold is not a
    judgement call. Polled every 50ms, so recording starts on the frame the mission mounts,
    which is the only way the first cut is in the capture at all.
    """
    for attempt in range(12):
        before = frame()
        u.SetCursorPos(*HOVER)
        time.sleep(0.6)
        u.SetCursorPos(TAB_X, tab_y)
        time.sleep(0.5)
        u.mouse_event(LEFTDOWN, 0, 0, 0, 0)
        time.sleep(0.08)
        u.mouse_event(LEFTUP, 0, 0, 0, 0)
        # Park clear so the strip is not lit in any frame, and the pointer is not over the world.
        u.SetCursorPos(rect.left + 40, rect.bottom - 40)
        for _ in range(80):
            time.sleep(0.05)
            if changed_fraction(before, frame()) > 0.25:
                return
        print(f'  attempt {attempt + 1}: click missed the tab, retrying')
    raise SystemExit('the screen never changed - the click is not reaching the tab')


dismiss_boot()
jump_to_warehouse(find_warehouse_tab())

frames = []
interval = 1.0 / fps
started = time.time()
next_at = started
while time.time() - started < seconds:
    now = time.time()
    if now < next_at:
        time.sleep(min(0.004, next_at - now))
        continue
    next_at += interval
    frames.append((now - started, ImageGrab.grab(all_screens=True).crop(box)))

for index, (_, shot) in enumerate(frames):
    shot.save(f'scripts/dev/{out}-{index:02d}.png')

cols = 5
rows = (len(frames) + cols - 1) // cols
thumb = frames[0][1].width // 4, frames[0][1].height // 4
sheet = Image.new('RGB', (thumb[0] * cols, thumb[1] * rows), (10, 10, 10))
for index, (_, shot) in enumerate(frames):
    sheet.paste(shot.resize(thumb), ((index % cols) * thumb[0], (index // cols) * thumb[1]))
sheet.save(f'scripts/dev/{out}-sheet.png')
print(f'{len(frames)} frames over {seconds}s -> scripts/dev/{out}-sheet.png')
print('  t=' + '  '.join(f'{i}:{s:.2f}' for i, (s, _) in enumerate(frames)))
