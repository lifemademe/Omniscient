"""Draw the recorded frames, so the sim can be looked at and not only measured."""
import json, pathlib
from PIL import Image, ImageDraw

d = pathlib.Path(__file__).parent
data = json.loads((d / 'frames.json').read_text())
lv, frames = data['level'], data['frames']
S = 0.55
W, H = int(lv['width'] * S), int(lv['height'] * S)

def draw(f):
    im = Image.new('RGB', (W, H), (23, 18, 38))
    g = ImageDraw.Draw(im)
    for t in lv['tiles']:
        g.rectangle([t['x']*S, t['y']*S, (t['x']+t['w'])*S, (t['y']+t['h'])*S], fill=(44, 42, 63))
        g.rectangle([t['x']*S, t['y']*S, (t['x']+t['w'])*S, t['y']*S+3], fill=(61, 90, 58))
    for a in lv['anchors']:
        r = 6
        g.ellipse([a['x']*S-r, a['y']*S-r, a['x']*S+r, a['y']*S+r], outline=(127, 224, 138), width=2)
    for fx, fy, fm in f['food']:
        r = (4 + fm*0.12) * S
        g.ellipse([fx*S-r, fy*S-r, fx*S+r, fy*S+r], fill=(232, 193, 90))
    if f['tip']:
        g.line([f['owned'][0][0]*S, f['owned'][0][1]*S, f['tip'][0]*S, f['tip'][1]*S], fill=(143, 214, 232), width=3)
    for x, y in f['loose']:
        r = 9*0.62*S
        g.ellipse([x*S-r, y*S-r, x*S+r, y*S+r], fill=(92, 107, 122))
    for x, y in f['owned']:
        r = 9*0.62*S
        g.ellipse([x*S-r, y*S-r, x*S+r, y*S+r], fill=(143, 227, 194))
    g.text((10, 8), f"t={f['t']}s   MASS {f['mass']}   REACH {f['reach']}px", fill=(255,255,255))
    g.text((10, 24), f['note'], fill=(200, 220, 205))
    return im

cols, rows = 2, 3
sheet = Image.new('RGB', (W*cols + 12, H*rows + 24), (10, 10, 14))
for i, f in enumerate(frames[:cols*rows]):
    sheet.paste(draw(f), ((i % cols) * (W+4) + 4, (i // cols) * (H+4) + 4))
sheet.save(d / 'sheet.png')
print('sheet.png', sheet.size)
