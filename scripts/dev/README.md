# Verification tools

Two small tools for checking things the TypeScript harnesses structurally cannot.

`scripts/preview-*.ts` prove logic: intents resolve, missions complete, cooldowns end,
suggestions are understood. They have caught a lot. They cannot catch a button that is
removed from the document between mousedown and mouseup, a canvas made click-through by a
wrapper, a particle effect ten times the size of the room, or a scene that goes black for
three seconds of every eleven. All four of those shipped, and all four were found here.

## `record.py` — motion

```
python scripts/dev/record.py NAME [seconds] [fps] [x0 y0 x1 y1]
```

Writes two things: a **contact sheet** of every frame in one image, and an animated GIF.
The sheet is the one that finds bugs - a transition is easier to judge as a strip than as
a movie, because you can compare frame 3 against frame 11 without scrubbing.

A still proves geometry and lighting. It proves nothing about a transition, a blink, a
growth reveal or a cursor, and every remaining unknown in this project is something that
moves.

## `drive.py` — input

```
python scripts/dev/drive.py move|click|hover X Y [seconds]
python scripts/dev/drive.py park
```

Moves and clicks the real cursor, bounded to the game window's rectangle so a mistyped
coordinate lands on the game rather than on something else on the desktop. Park leaves the
cursor out of the way so a hover state does not linger into the next screenshot.

Use it for short scripted runs - move, act, record, release. It takes over the machine's
pointer while it runs, so it is not something to leave going.

## Coordinates

Screen coordinates map 1:1 to what `record.py` and the screenshot tool capture, so a
position measured off a screenshot can be clicked directly. `GAME_RECT` in `drive.py` is
the game window and will need updating if the window is moved or resized.
