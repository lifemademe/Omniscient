"""Drive the mouse over the game window, for verifying things that need input.

Everything clickable in this project has only ever been proven in a harness. The harness
cannot catch a button that is removed from the document between mousedown and mouseup, or
a canvas made click-through by a wrapper - both of which shipped. This closes that gap.

Deliberately constrained. Every action is bounded to the game window's rectangle, so a
misplaced coordinate lands on the game rather than on somebody's desktop, and each run
ends by parking the cursor out of the way. Short scripted runs only: move, act, record,
release.

  python drive.py move X Y
  python drive.py click X Y
  python drive.py hover X Y [seconds]
  python drive.py park
"""

import ctypes
import ctypes.wintypes
import sys
import time

user32 = ctypes.windll.user32
user32.SetProcessDPIAware()

MOUSEEVENTF_LEFTDOWN = 0x0002
MOUSEEVENTF_LEFTUP = 0x0004

# The game window, in desktop pixels. Anything outside this is refused: the point of
# scripting input is to test the game, and a typo should not be able to press something
# in another application.
GAME_RECT = (860, 200, 2270, 1340)


def guard(x: int, y: int) -> tuple[int, int]:
    x0, y0, x1, y1 = GAME_RECT
    if not (x0 <= x <= x1 and y0 <= y <= y1):
        raise SystemExit(f'refused: ({x},{y}) is outside the game window {GAME_RECT}')
    return x, y


def move(x: int, y: int) -> None:
    user32.SetCursorPos(*guard(x, y))


def click(x: int, y: int) -> None:
    move(x, y)
    time.sleep(0.06)
    user32.mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
    time.sleep(0.05)
    user32.mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)


def park() -> None:
    """Out of the way, so a hover state does not linger into the next screenshot."""
    user32.SetCursorPos(GAME_RECT[0] + 6, GAME_RECT[3] - 6)


if __name__ == '__main__':
    action = sys.argv[1] if len(sys.argv) > 1 else 'park'

    if action == 'park':
        park()
    elif action == 'move':
        move(int(sys.argv[2]), int(sys.argv[3]))
    elif action == 'click':
        click(int(sys.argv[2]), int(sys.argv[3]))
    elif action == 'hover':
        move(int(sys.argv[2]), int(sys.argv[3]))
        time.sleep(float(sys.argv[4]) if len(sys.argv) > 4 else 1.0)
    else:
        raise SystemExit(f'unknown action {action}')

    pos = ctypes.wintypes.POINT()
    user32.GetCursorPos(ctypes.byref(pos))
    print(f'{action} -> cursor at ({pos.x}, {pos.y})')
