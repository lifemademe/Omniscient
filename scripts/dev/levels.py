"""Measure a capture's value envelope, and compare it against a reference.

    python scripts/dev/levels.py shot.jpg
    python scripts/dev/levels.py shot.jpg --bar assets/reference/warehouse/02-high-bay-pools.jpg
    python scripts/dev/levels.py r1.jpg r2.jpg r3.jpg --bar bar.jpg

Written because a critic said "the room never goes dark" and the only honest way to answer
that is a number. It turned out to be right, and a second thing turned out to be true that
no amount of looking would have caught: two rounds of a lighting item measured IDENTICAL on
every percentile, which meant the second one had never reached the screen at all. A stale
`.dist` and a real no-op look exactly the same in a screenshot.

What the numbers mean, for judging a low-key interior:

  near-black   the share of frame below luma 20. A night interior that has none of this has
               no darkness for a pool to sit in, whatever the lamps are doing.
  median       where the bulk of the picture sits. The eye reads this as "the exposure".
  p95 / clip   the top. A reference photograph of a dark room typically has a LOW p95 and
               almost nothing at 250+; a render that blows its highlights is not brighter
               than the reference so much as differently shaped.
  spread       p95 minus p5. Two frames can share a median and be nothing alike.

A caution that cost a wrong conclusion once: **this only compares like with like if the
camera has not moved.** Percentiles are over the whole frame, so pointing somewhere else
changes every number. Capture from a fixed, repeatable viewpoint - for the warehouse that
means `jump.py W` and shoot before touching the drone - or the comparison is between two
different pictures rather than two builds.
"""
import os
import sys

import numpy as np
from PIL import Image


def envelope(path):
    a = np.asarray(Image.open(path).convert('L'), dtype=float)
    p1, p5, p25, med, p75, p95, p99 = np.percentile(a, [1, 5, 25, 50, 75, 95, 99])
    return {
        'name': os.path.basename(path),
        'near_black': 100 * float((a < 20).mean()),
        'dark': 100 * float((a < 40).mean()),
        'p5': p5, 'p25': p25, 'median': med, 'p75': p75, 'p95': p95,
        'clip': 100 * float((a > 250).mean()),
        'spread': p95 - p5,
    }


def row(e, bar=None):
    def d(key, fmt='{:6.1f}'):
        text = fmt.format(e[key])
        if bar is None:
            return text
        delta = e[key] - bar[key]
        return f'{text}{"+" if delta >= 0 else "-"}{abs(delta):5.1f}'
    return (f'{e["name"][:26]:26s} {d("near_black")} {d("dark")} {d("p5")} {d("median")} '
            f'{d("p95")} {d("clip")} {d("spread")}')


def main():
    args = sys.argv[1:]
    bar_path = None
    if '--bar' in args:
        i = args.index('--bar')
        bar_path = args[i + 1]
        args = args[:i] + args[i + 2:]
    if not args:
        raise SystemExit(__doc__.strip().splitlines()[2].strip())

    bar = envelope(bar_path) if bar_path else None
    width = 26 + (7 * 12 if bar else 7 * 7)
    head = f'{"":26s} {"<20%":>6} {"<40%":>6} {"p5":>6} {"median":>6} {"p95":>6} {"clip%":>6} {"spread":>6}'
    if bar:
        head = (f'{"":26s} {"<20%":>12} {"<40%":>12} {"p5":>12} {"median":>12} '
                f'{"p95":>12} {"clip%":>12} {"spread":>12}')
    print(head)
    print('-' * width)
    if bar:
        print(row(bar) + '   <- BAR')
        print('-' * width)
    for path in args:
        print(row(envelope(path), bar))


if __name__ == '__main__':
    main()
