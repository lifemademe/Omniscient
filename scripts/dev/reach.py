"""Audit every authored hand target against the arm that has to get there.

## Why this exists

`solveArm` used to clamp an out-of-range target to a fully extended arm pointing at it,
which produces a pose that looks deliberate - somebody stretching - while the hand is
nowhere near the thing it is supposed to be touching. That shipped twice. It now falls
back to a resting arm instead, which is never egregious, but a contact quietly NOT
touching their own evidence is still a scene bug and still invisible in a screenshot.

The trap is that reach is not a number anybody can hold in their head: it depends on the
contact's height, build and shoulder width, and the target has to be converted out of
scene space through the contact's own rotation before the distance means anything. Three
of the seven contacts were out of reach after an art pass that changed arm length by six
centimetres, and none of it was visible as a bug - Vasile simply looked like a scarecrow.

Run it after ANY change to arm proportions in geometry/character.ts, or to a contact's
placement, rotation or handsOn in view/scenes.ts:

    python scripts/dev/reach.py

Reads scenes.ts directly so it cannot drift from the placements it checks. The scaffold
below mirrors createCharacter, and the space conversion mirrors character-node's toLocal;
if either changes, this has to change with it.
"""
import io, re, math

class M:
    PI = math.pi

SYMS = {'platformY': 2.02}

def num(t):
    t = t.strip()
    for k, v in SYMS.items():
        t = re.sub(rf'\b{k}\b', str(v), t)
    t = t.replace('Math.PI', repr(math.pi))
    try:
        return float(eval(t, {'__builtins__': {}}, {}))
    except Exception as e:
        raise SystemExit(f'cannot evaluate {t!r}: {e}')

def vec(t):
    a = re.search(r'new THREE\.Vector3\(([^)]*)\)', t)
    return [num(x) for x in a.group(1).split(',')] if a else None

s = io.open('src/omniscient/view/scenes.ts', encoding='utf-8').read()
bad = []
for m in re.finditer(r"addContact\(scene, '(\w+)', \{", s):
    name, i = m.group(1), m.end()
    d, j = 1, m.end()
    while d:
        d += 1 if s[j] == '{' else -1 if s[j] == '}' else 0
        j += 1
    b = s[i:j]
    def g(k, dv):
        r = re.search(rf'\b{k}:\s*([\d.]+)', b)
        return float(r.group(1)) if r else dv
    h, bu, sh = g('height', 1.7), g('build', 0.5), g('shoulders', 0.5)
    rot = 0.0
    mr = re.search(r'rotation: new THREE\.Euler\(([^)]*)\)', b)
    if mr:
        rot = num(mr.group(1).split(',')[1])
    pos = vec(re.search(r'position: (new THREE\.Vector3\([^)]*\))', b).group(1))

    torso = h * 0.30
    reach = torso * 0.61 + torso * 0.55
    sx = h * (0.20 + sh * 0.11) * 0.52 + h * (0.062 + bu * 0.026) * 0.1
    sy = h * 0.46 + torso - torso * 0.06

    mh = re.search(r'handsOn: \{(.*?)\n    \}', b, re.S)
    if not mh:
        print(f'{name:8} -      no hand targets')
        continue
    for side in ('left', 'right'):
        ms = re.search(rf'{side}: (new THREE\.Vector3\([^)]*\)|TORCH_AT)', mh.group(1))
        if not ms:
            continue
        raw = ms.group(1)
        t = [1.33, 1.12, -0.16] if raw == 'TORCH_AT' else vec(raw)
        dx, dy, dz = t[0] - pos[0], t[1] - pos[1], t[2] - pos[2]
        c, si = math.cos(-rot), math.sin(-rot)
        lx, lz = dx * c + dz * si, -dx * si + dz * c
        dist = math.dist((lx, dy, lz), (-sx if side == 'left' else sx, sy, 0.0))
        ok = dist <= reach
        if not ok:
            bad.append((name, side, dist, reach))
        print(f'{name:8} {side:6} {dist:.3f} / {reach:.3f}  {"ok" if ok else "OUT OF REACH"}')

print('\nunreachable:', len(bad))
for n, s_, d, r in bad:
    print(f'  {n} {s_} over by {d - r:+.3f}')
