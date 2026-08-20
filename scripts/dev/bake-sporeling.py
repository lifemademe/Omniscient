"""
Bake the Spriterrific walk spritesheet into a source module.

Why bake rather than load a PNG at runtime: every other texture in M4SS is painted in code
from PAL, which means all of it gets the same palette, the same tone-curve compensation and
the same nearest-neighbour treatment for free. A PNG loaded through the resource manager
gets none of that - it arrives unlifted (so it renders darker than it looks in a viewer),
it cannot re-theme with setStageTheme, and it introduces an async material swap into a rig
that has none. Baking keeps the sprite inside the pipeline that every other pixel goes
through, at the cost of one generated file.

The generator is kept because the transform is the interesting part, not the output: crop,
downscale to native game resolution, quantise to a small palette, mute and lift.

Usage: python scripts/dev/bake-sporeling.py
"""

from collections import Counter
from PIL import Image

SRC = 'spriterrific-runs/m4ss-sporeling-g18cv30z/walk/spritesheet.png'
OUT = 'src/m4ss/sporelingArt.ts'

# The union of the eight frames' bounding boxes. Cropping every frame with the SAME box is
# what keeps the feet planted - crop each to its own bounds and the creature bobs a pixel
# per frame for no reason other than the crop.
BOX = (76, 79, 180, 231)
CELL, COLS = 256, 5
FRAMES = 8

# 32x46 is native: one texel per world pixel, the same contract every other texture here
# keeps. The source is 104x152 of dithery near-duplicates; downscaling to the size it will
# actually be drawn at and re-quantising there is what turns it into pixel art rather than a
# photograph of pixel art.
W, H = 32, 46
COLOURS = 12

GAIN_LOW, GAIN_HIGH = 1.15, 2.3
ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'


def mute(ch, keep):
    y = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
    return [y + (v - y) * keep for v in ch]


def lift(ch, keep):
    out = []
    for v in mute(ch, keep):
        gain = GAIN_LOW + (GAIN_HIGH - GAIN_LOW) * (v / 255)
        out.append(max(0, min(255, round(v * gain))))
    return out


def saturation(ch):
    return (max(ch) - min(ch)) / 255 if max(ch) else 0


def main():
    sheet = Image.open(SRC).convert('RGBA')
    sw, sh = BOX[2] - BOX[0], BOX[3] - BOX[1]

    """
    Quantise at SOURCE resolution, then downscale by majority vote.

    Averaging first (a BOX resize) and quantising after put a magenta fringe all the way
    around the pale body: every output pixel that straddled the cap's edge became a blend of
    purple and bone, and quantisation had to snap those blends into the purple ramp. The
    creature came back wearing a rim light nothing in the room is casting.

    Taking the most common source colour in each block instead never invents a colour that
    was not already there, which is the difference between downscaling pixel art and
    photographing it. Blocks are 3.25 x 3.3 source pixels, so the rects are computed in
    floating point and floored rather than assumed square.
    """
    strip = Image.new('RGBA', (sw * FRAMES, sh))
    for i in range(FRAMES):
        cx, cy = (i % COLS) * CELL, (i // COLS) * CELL
        strip.paste(sheet.crop((cx + BOX[0], cy + BOX[1], cx + BOX[2], cy + BOX[3])), (i * sw, 0))
    flat = Image.new('RGB', strip.size, (0, 0, 0))
    flat.paste(strip, mask=strip.split()[3])
    quant = flat.quantize(colors=COLOURS, method=Image.MEDIANCUT, dither=Image.NONE)
    raw = quant.getpalette()[: COLOURS * 3]
    pal = [raw[i * 3:i * 3 + 3] for i in range(COLOURS)]

    src_idx = quant.load()
    src_a = strip.split()[3].load()
    cells = []
    for i in range(FRAMES):
        grid = []
        for y in range(H):
            row = []
            y0, y1 = int(y * sh / H), max(int(y * sh / H) + 1, int((y + 1) * sh / H))
            for x in range(W):
                x0, x1 = int(x * sw / W), max(int(x * sw / W) + 1, int((x + 1) * sw / W))
                seen = Counter()
                total = 0
                for yy in range(y0, y1):
                    for xx in range(x0, x1):
                        total += 1
                        if src_a[i * sw + xx, yy] > 128:
                            seen[src_idx[i * sw + xx, yy]] += 1
                # A block has to be mostly solid to survive, or the silhouette grows a
                # half-transparent halo one pixel wide at this scale.
                opaque = sum(seen.values())
                row.append(0 if opaque * 2 < total else seen.most_common(1)[0][0] + 1)
            grid.append(row)
        cells.append(grid)

    """
    Repaint the creature in the stage's own palette.

    Lifting the sprite's colours directly does not work and the failure is instructive: lift()
    pre-compensates for ACES at exposure 0.5, so it expects colours authored DARK. The
    generator returned a near-white cream (#f4e4c8) and a bright violet, and gain on those
    clips four of the twelve entries to pure white - the same trap PAL.lampCore is documented
    for. The sprite is authored in display space; PAL is authored in pre-lift space.

    So the twelve clusters are not lifted, they are RE-POINTED. The creature's own ramp is
    clean - four steps of outline, four of cap, four of body - and each step is assigned the
    palette entry that already does that job in this stage: the cap takes capDark/capLit, the
    same colours the room's mushrooms are painted with, and the body takes the bone ramp that
    bonesTexture mixes for the ribcage. Nothing new enters the palette, so the creature cannot
    be off-model however the generator rolled.

    Ordering is by luminance rather than by index, so a re-roll of the source lands in the
    same ramp without re-authoring this table.
    """
    RAW = {
        'voidDeep': ('#0a1412', 0.3),
        'stoneMid': ('#28322e', 0.32),
        'stoneLit': ('#38443e', 0.34),
        'stoneEdge': ('#4a5850', 0.36),
        'vineDark': ('#2c2418', 0.45),
        'vineMid': ('#4a3d24', 0.45),
        'capDark': ('#5a2f52', 0.85),
        'capLit': ('#8f4a7e', 0.95),
        'lampCore': ('#f8d88a', 1.0),
        'spec': ('#eafff2', 0.9),
    }
    P = {k: lift([int(v[i:i + 2], 16) for i in (1, 3, 5)], keep) for k, (v, keep) in RAW.items()}

    def mix(a, b, t):
        return [round(a[i] + (b[i] - a[i]) * t) for i in range(3)]

    # The same three bone tones bonesTexture mixes for the ribcage.
    bone_lit = mix(P['stoneEdge'], P['lampCore'], 0.28)
    bone_mid = mix(P['stoneLit'], P['vineMid'], 0.25)
    bone_dark = mix(P['stoneMid'], P['vineDark'], 0.4)

    """
    The ramp, and why the cap's fill is not capLit.

    First pass put the cap's largest lit area on capLit itself and the result was a hot pink
    creature that owned the frame - the exact failure the giant mushrooms already had, and
    the reason PAL.lampCore carries a warning. capLit is a HIGHLIGHT: correct on the few
    pixels of a speckle, wrong across three hundred. So the cap fills toward capDark and only
    the speckles get near the top of the ramp, which is also what makes the creature read as
    violet rather than magenta.

    The outline collapses four source steps onto voidDeep flat. Blending the topmost outline
    step toward capDark put a purple fringe around the pale body - a rim light nothing in the
    room is casting.
    """
    ramp = [
        P['voidDeep'],                             # outline: four source steps, one colour
        P['voidDeep'],
        P['voidDeep'],
        P['voidDeep'],
        mix(P['voidDeep'], P['capDark'], 0.55),    # cap in shadow
        P['capDark'],
        mix(P['capDark'], P['capLit'], 0.4),
        mix(P['capDark'], P['capLit'], 0.62),      # cap in light - a fill, not a highlight
        bone_dark,                                 # body in shadow
        bone_mid,
        mix(bone_mid, bone_lit, 0.6),
        bone_lit,                                  # the speckles and the lit edge of the stalk
    ]

    order = sorted(range(COLOURS), key=lambda i: 0.2126 * pal[i][0] + 0.7152 * pal[i][1] + 0.0722 * pal[i][2])
    lifted = [None] * COLOURS
    for rank, i in enumerate(order):
        lifted[i] = ramp[rank]

    out_frames = []
    for grid in cells:
        runs = []
        for y in range(H):
            for x in range(W):
                v = grid[y][x]
                if runs and runs[-1][0] == v and runs[-1][1] < 64:
                    runs[-1][1] += 1
                else:
                    runs.append([v, 1])
        out_frames.append(''.join(ALPHABET[v] + ALPHABET[n - 1] for v, n in runs))

    used = Counter()
    for f in out_frames:
        for j in range(0, len(f), 2):
            used[ALPHABET.index(f[j])] += ALPHABET.index(f[j + 1]) + 1

    hexes = ['#%02x%02x%02x' % tuple(c) for c in lifted]
    body = ',\n  '.join(f"'{f}'" for f in out_frames)
    ts = TEMPLATE
    for key, value in {
        '__FRAMES__': str(FRAMES),
        '__W__': str(W),
        '__H__': str(H),
        '__COLOURS__': str(COLOURS),
        '__ALPHABET__': ALPHABET,
        '__PALETTE__': ', '.join(f"'{h}'" for h in hexes),
        '__DATA__': body,
    }.items():
        ts = ts.replace(key, value)
    open(OUT, 'w', encoding='utf-8').write(ts)
    print(f'wrote {OUT}: {FRAMES} frames, {COLOURS} colours, {sum(len(f) for f in out_frames)} chars')
    for i, h in enumerate(hexes):
        print(f'  {i + 1:>2} {h}  {used[i + 1]:>5}px  sat {saturation(pal[i]):.2f}')


TEMPLATE = r"""/**
 * The sporeling's walk cycle: __FRAMES__ frames, __W__x__H__, baked.
 *
 * GENERATED by scripts/dev/bake-sporeling.py from a Spriterrific run - do not hand-edit;
 * re-run the script instead. The source spritesheet and the job record are kept under
 * spriterrific-runs/m4ss-sporeling-g18cv30z/.
 *
 * Baked rather than loaded so the creature goes through the same pipeline as every other
 * pixel in the stage: quantised to __COLOURS__ colours, muted by the job each colour does
 * (the cap is an accent and keeps its purple, the body is structure and is pulled toward
 * grey), and lifted for the ACES curve at exposure 0.5 - the same lift() every PAL entry
 * gets. A PNG dropped in through the resource manager would arrive unlifted and render
 * noticeably darker than it looks in an image viewer, would not re-theme with
 * setStageTheme, and would put an async material swap into a rig that has none.
 *
 * Encoding is run-length: two characters per run, the first the palette index (0 is
 * transparent) and the second the run length minus one, both in a 64-character alphabet.
 */

const ALPHABET = '__ALPHABET__';

/** __W__ x __H__, one texel per world pixel - the contract the painted textures keep. */
export const SPORELING_W = __W__;
export const SPORELING_H = __H__;
/** How many frames the walk has. */
export const SPORELING_FRAMES = __FRAMES__;

const PALETTE = [__PALETTE__];

const CELLS = [
  __DATA__,
];

/** Paint one frame of the walk into a canvas, at native size. */
export function sporelingFrame(frame: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = SPORELING_W;
  c.height = SPORELING_H;
  const g = c.getContext('2d');
  if (!g) return c;
  const rle = CELLS[((frame % CELLS.length) + CELLS.length) % CELLS.length];
  let at = 0;
  for (let i = 0; i < rle.length; i += 2) {
    const v = ALPHABET.indexOf(rle[i]);
    const n = ALPHABET.indexOf(rle[i + 1]) + 1;
    if (v > 0) {
      g.fillStyle = PALETTE[v - 1];
      for (let k = 0; k < n; k++) {
        g.fillRect((at + k) % SPORELING_W, Math.floor((at + k) / SPORELING_W), 1, 1);
      }
    }
    at += n;
  }
  return c;
}
"""

main()
