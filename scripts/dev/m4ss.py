"""Get from a cold play-mode start to a chosen M4SS stage, and shoot it.

    python scripts/dev/m4ss.py [stage] [out.png]      # stage 1, 2 or 3

**Why this is nine clicks and not one.** M4SS is not a level you can open; it is a file on
Dana Keller's desktop inside mission 09, and the desktop will not open it until the
conversation has reached the line where she tells you to. On top of that the rig reads its
starting stage from the save, and the only way to advance that in play is to finish the stage
before - which needs a keyboard, and keys sent from outside this process are swallowed (see
the memory note). So stage 2 and stage 3 were, in practice, unlookable.

The globe's dev list carries `M4SS s2` / `M4SS s3` entries that write the saved stage before
opening the mission; this drives them, then walks the three lines of dialogue that unlock the
folder. That is the whole trick.

Coordinates are window-content pixels, the space `shot.py` writes and `tap.py` reads. They
are stable because every one of them is a fixed element of a fixed layout - the menu buttons,
the dev list, the response chips - but if the globe's dev list gains entries above M4SS, the
three stage rows move down by one pitch each and STAGE_ROW below is what to fix.
"""
import subprocess
import sys
import time

TAP = ['python', 'scripts/dev/tap.py']

# The dev list is built from DEV_JUMP_TARGETS in GlobeScreen.ts, in that order. These are the
# y centres of the three M4SS rows; the list is vertically centred, so they move if it grows.
STAGE_ROW = {1: 645, 2: 680, 3: 715}


def tap(x: int, y: int, out: str, wait: float) -> None:
    subprocess.run(TAP + [str(x), str(y), out, str(wait)], capture_output=True)


def main() -> int:
    stage = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    out = sys.argv[2] if len(sys.argv) > 2 else f'captures/m4ss-s{stage}.png'
    if stage not in STAGE_ROW:
        print('stage must be 1, 2 or 3', file=sys.stderr)
        return 2

    scratch = 'captures/_m4ss-step.png'
    # Boot screen: PRESS ANY KEY takes a click, which is the only reason any of this works.
    tap(1280, 763, scratch, 5)
    # CONTINUE rather than NEW GAME - it lands on the globe instead of playing the opening.
    tap(674, 444, scratch, 6)
    # Brush the right edge to reveal the dev list, then pick the stage.
    tap(1930, 1090, scratch, 2)
    tap(1875, STAGE_ROW[stage], scratch, 12)
    # Keller will not let the folder open until she has been asked what the specimen is and
    # then to show the file. Three chips, in this order.
    tap(1476, 962, scratch, 8)   # "what is the specimen"
    tap(1672, 962, scratch, 9)   # "show me the file"
    tap(1632, 962, out, 14)      # "open specimen M4SS"
    print(f'{out}  stage {stage}')
    return 0


sys.exit(main())
