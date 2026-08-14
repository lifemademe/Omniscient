"""Record a stretch of the desktop as frames, a contact sheet and an animated GIF.

Motion is the blind spot: a still proves geometry and lighting, and proves nothing at all
about a transition, a blink, a growth reveal or a cursor. Screenshots have caught a lot of
bugs in this project; every remaining one I know about is something that moves.

Two outputs on purpose. The contact sheet is for reading - every frame at once, in one
image, which is how you spot that frame 4 is wrong. The GIF is for watching.

  python record.py NAME [seconds] [fps] [x0 y0 x1 y1]
"""

import sys
import time

from PIL import Image, ImageGrab

name = sys.argv[1] if len(sys.argv) > 1 else 'clip'
seconds = float(sys.argv[2]) if len(sys.argv) > 2 else 3.0
fps = float(sys.argv[3]) if len(sys.argv) > 3 else 10.0
bbox = tuple(int(v) for v in sys.argv[4:8]) if len(sys.argv) >= 8 else None

interval = 1.0 / fps
frames = []
started = time.time()
next_at = started

while time.time() - started < seconds:
    now = time.time()
    if now < next_at:
        time.sleep(min(0.004, next_at - now))
        continue
    next_at += interval

    shot = ImageGrab.grab(all_screens=True)
    if bbox:
        shot = shot.crop(bbox)
    # Half size: these are read, not archived, and full-resolution frames make a contact
    # sheet too large to look at and a GIF too large to send.
    frames.append(shot.resize((shot.width // 2, shot.height // 2)))

if not frames:
    raise SystemExit('captured nothing')

# --- Contact sheet: every frame, numbered by position, left to right, top to bottom.
columns = 4
rows = (len(frames) + columns - 1) // columns
w, h = frames[0].size
scale = min(1.0, 420 / w)
tw, th = int(w * scale), int(h * scale)

sheet = Image.new('RGB', (tw * columns, th * rows), (12, 12, 12))
for i, frame in enumerate(frames):
    sheet.paste(frame.resize((tw, th)), ((i % columns) * tw, (i // columns) * th))
sheet.save(f'{name}-sheet.png')

frames[0].save(
    f'{name}.gif',
    save_all=True,
    append_images=frames[1:],
    duration=int(interval * 1000),
    loop=0,
    optimize=True,
)

print(f'{len(frames)} frames at {fps:g}fps -> {name}-sheet.png ({sheet.width}x{sheet.height}) and {name}.gif')
