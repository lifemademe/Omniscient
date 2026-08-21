# The Camera Feed — Plan

An ASCII surveillance feed for the camera hops in mission 08 (Lucian Barbu, District 07).
Not walkable, not a second game: a **view**. Written 2026-08-20, before any code.

---

## 1. What this is, and what it deliberately is not

**Is**: when the chase asks the player to pick the camera that picks the car up next, each
option can be *looked through*. A character-grid reconstruction of that street — block
faces, road, traffic, timestamp, coverage arc — rendered in the console's own palette.

**Is not**: walkable, controllable, or first-person-navigable. The player is an operator and
the game's only verb is choosing. `art/cursor.ts` already says this out loud — "a game whose
only verb is clicking a name". Movement keys inside a feed would quietly convert the player
from the thing watching into a thing in there, which is the one fantasy this game cannot
trade away.

## 2. Why it belongs (the strongest argument for building it)

`geometry/wireCity.ts` opens with the game's visual thesis:

```
wireframe   - OMNISCIENT observing reality
rendered    - OMNISCIENT talking to somebody through a device
first person - OMNISCIENT inside a system that is connected to it
```

Grepped: **the third tier appears nowhere in the codebase except that comment.** It was
designed and never built. A camera is a device on the network; OMNISCIENT looking through
one is precisely "inside a system that is connected to it". So this is not a fourth visual
language bolted onto a game that already has three — it completes a set the project
promised itself.

ASCII is also the *honest* renderer, for the same reason the city is wireframe. That file
argues drawing brick on the buildings "would be a lie about what it knows". A glyph grid
reads as machine reconstruction rather than photography: it stays truthful that OMNISCIENT
is inferring a street from a data feed, and it sidesteps needing photoreal art entirely.

## 3. THE DESIGN LANDMINE — read before anything else

**The feed must not show the car before the player commits.**

Mission 08's hidden truth says the car "is found by narrowing, not by searching". The
pursuit is a deduction: how far can he have got in `seconds` at `CELL_SPEED`, which way was
he pointed, does this camera even cover that street. If a live thumbnail showed the car
sitting in one of the three options, the player would simply pick the one with the car in
it and every line of that deduction would evaporate. **A feed that shows the answer destroys
the mission.**

So the feed is split in two, and this is the core mechanic of the whole feature:

- **BEFORE commit** — the feed shows the *camera*, not the *car*: which way it points, how
  far down the street it sees, whether the road bends out of shot, ordinary traffic passing.
  This is genuinely useful reasoning material (it makes "off-route" and "unreachable"
  visible instead of abstract) and it contains no answer.
- **AFTER commit** — the chosen feed plays out. Either the car crosses the frame, or the
  street stays ordinary and the failure reads as an image: `behind` = the road is empty and
  the timestamp is late; `unreachable` = empty, nothing has come through yet; `off-route` =
  a road that visibly isn't the one he was pointed down.

That turns three abstract failure enums into three things you *see*, without giving away a
single hop.

## 4. Visual specification

**Grid**: 88 × 26 characters, monospace. Rendered as coloured `<span>`s inside a `<pre>`
(the console is already DOM — `LocalSurface`, `BoardPanel`, the HUD — so this needs no new
machinery and costs no draw calls).

**Palette** — the console's, NOT the reference image's rainbow. That image's red/yellow/blue
would fight the green-on-dark badly.
- structure / far blocks: `#1a2f21` → `#2b5c39` (the existing `.omni` border greens)
- lit windows: `#5f9c6c`, a few `#7fe08a`
- road + markings: `#243028`
- moving traffic: `#8fbf9a`
- **the suspect car**: `#d8ffb0` — the objective-text colour, used nowhere else in the feed
- chrome (timestamp, camera id, NO SIGNAL): `#5f9c6c` at small size

**Layout**, top to bottom:
1. Header strip: `CAM 07-{id}  ·  {cell.x},{cell.y}  ·  T+{seconds}s` + a live-looking clock
2. Skyline: block faces in glyphs, window density from the district's own data (§5)
3. The road across the lower third, receding to a vanishing point on one side
4. Footer: coverage arc as a simple `<——— 40m ———>` scale bar

**Character set**: `█ ▓ ▒ ░` for masses, `│ ─ ┼` for structure, `▪ ▫ · :` for windows,
`═` for road, `◄ ► ▬` for vehicles. All monospace-safe.

**Animation** (~8 fps, same rate the portal membrane uses — cheap and reads as alive):
- one or two ambient vehicles crossing on a loop
- window lights flickering on a slow random walk (2–3 cells per second)
- a scanline row that sweeps top to bottom every ~4s
- the timestamp ticking

## 5. Data contract

Everything comes from the district that already exists — `content/district-07.ts`, which
enforces "one seed, one order, one district" precisely so two systems can't disagree about
the city. The feed must obey that rule or it becomes a fourth copy.

| Needs | From | Status |
|---|---|---|
| camera cells | `DISTRICT_CITY.cameras` | exists |
| hop options + failure kinds | `Hop.options[].{cell, fails}` | exists |
| time since sighting, heading | `Hop.seconds`, `Hop.heading` | exists |
| suspect + traffic positions | `DISTRICT_FLEET` | exists |
| cell → metres | `cellToWorld` | exists |
| **per-cell building heights** | — | **small refactor needed** |

**The one refactor**: `wireCity()` currently bakes tower heights straight into a
`BufferGeometry` and throws the numbers away. Have it also return
`blocks: Array<{x, y, height, lit}>` — the same values it already computes, kept instead of
discarded. Then the ASCII skyline is generated from *the same building the wireframe draws*,
not a lookalike. Roughly 10 lines, no behaviour change, and it is the difference between
"consistent" and "actually the same city".

## 6. Where it hooks in — exact

- **`link/BoardPanel.ts` → `buildPursuit()` (~1306)** builds `trail` / `sighting` /
  `options` inside `.omni-trace`. Add a fourth element, `feed`, between `sighting` and
  `options`.
- **`refreshPursuit()` (~1359)** already redraws options per hop. Give each option button a
  hover/focus handler that points the feed at that camera. Selection is unchanged — clicking
  still picks; the feed is what you consult before you do.
- **The commit path (~2039)** dispatches `{ kind: 'device', submission: { kind: 'pursuit',
  picks } }`. The post-commit playback hangs off the existing `view.note` edge-trigger
  (~1372), which is already the "a new thing just happened" signal.
- **New file**: `src/omniscient/art/asciiFeed.ts` — pure function
  `renderFeed(city, cell, opts): string[]` returning coloured-span rows. No engine imports,
  therefore harness-testable headlessly, the same discipline `swingShape.ts` follows.

## 7. Scope tiers

**Tier 1 — the honest minimum (~half a day).** Static ASCII per camera + timestamp + a
scanline. Hover an option, see that street. No traffic, no post-commit playback. Already
delivers the third tier and the "wait, I can *look through* it" moment.

**Tier 2 — the target (~1.5 days).** Adds ambient traffic, window flicker, and the
post-commit playback where the car does or does not cross. This is the version that makes
the three failure kinds legible and is what I would ship.

**Tier 3 — stretch, only if the freeze allows (~1 day more).** Feed appears in the phase-one
identification too (watch the fleet, not just the chase); a `NO SIGNAL` state past the ring
in phase three, which would make "the network runs out" land as an image rather than a line
of dialogue.

## 8. Risks

- **Puzzle collapse** — covered in §3. This is the one that would actually ruin the mission;
  every other risk is cosmetic.
- **Palette drift** — must be console greens. Any cyberpunk rainbow makes it read as a
  different game.
- **Reading cost** — 88×26 of glyphs is a lot of text on screen. Mitigate by keeping the
  feed small until hovered/opened, and by keeping structure low-contrast so the *moving*
  things are the only high-contrast marks.
- **Scope creep toward walkable** — the temptation will be real once it looks good. It is
  out of scope by design, not by budget.
- **Freeze** — Sept 2. Tier 2 fits comfortably; Tier 3 should not start after ~Aug 28.

## 9. The first-impression question (deliberately unresolved)

Mission 08 is the eighth of nine. On its own this feature adds a second brilliant thing that
a judge may never reach — the same structural problem M4SS has at mission 09.

Cheapest possible plant, if wanted: a **dead** feed early. Mission 01 or 02 shows a camera
tile in the console that reads `NO SIGNAL — no coverage at this address`. It costs almost
nothing, it teaches that cameras are a thing OMNISCIENT has, and it makes Lucian's mission a
payoff rather than a surprise. That is a separate decision from this plan and should be made
on its own merits.

## 10. Decisions needed before code

1. **Tier 1, 2, or 3** as the target. (Recommendation: 2.)
2. **Feed always visible, or opened on hover/click?** (Recommendation: small always-on
   preview per option, enlarged on hover — reading cost stays low, discovery stays free.)
3. **Post-commit playback length** — 2s reads as a beat, 4s reads as suspense but slows a
   retry loop the player may run several times. (Recommendation: 2.5s, skippable on click.)
4. **The early plant** (§9) — in or out of this piece of work?
