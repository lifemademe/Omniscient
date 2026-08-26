# M4SS Stage 3 — THE SLUICE

**Status: BUILT, 2026-08-26.** `src/m4ss/sluice.ts`, `scripts/m4ss-sluice.ts`, and one new
entity in `mass.ts`. Paul took the updraft, so the stage shipped with both of its new ideas.
Commits `1801cbf` (sim + level), `3327675` (theme, art, HUD), `0b7034d` (the press rework).

**It has never been played.** The harness proves the geometry and the forces; it cannot tell
you whether any of it is fun. That is still the next thing.

**What changed on the way from this plan to the file** - four things, all of them because
something was measured:

1. **Beat 2 is better than it was written.** The plan said a swing losing energy dips lower
   into the sporelings. That is false for a fixed rope - a pendulum's lowest point does not
   depend on its amplitude. What IS true is that `Anchor.rope` is optional and nobody has ever
   left it off: without one the radius is the distance you reached across, so *where you latch
   decides how low you sweep*. The patrol's four growths carry no rope, and two of them hang
   160px lower than the others as the tempting near grab. That is the trap, and it is real.
2. **Beat 3's premise was wrong.** "Two presses out of phase means there is no moment when
   both are up" cannot be made true - the profile is 55% winch, 30% hang, 15% drop, so a press
   is clear 85% of the time at any offset. The harness caught it at 250 frames of overlap in
   four seconds. The beat that survives is a distance problem: the pair are clear together for
   about a second, and the crossing is 440px at a 92px/s crawl. The pocket is mandatory.
3. **Beat 7's press became a shutter.** "A press swinging across the flight path" had nowhere
   to stand that did not foul one of the two sweeps. Sliding it through the 60px gap *between*
   them is the same idea with better geometry: the only air in the climb, closing on a timer.
4. **The stage is a descent and a return, but not on separate halves of the map.** 1280px does
   not hold two independent vertical routes plus a patrol. The climb shares the shaft the
   descent fell through; what makes it a different route is that it is flown rather than
   fallen, and that the bridge is what lets you back into it.
5. **The gallery is red.** Because of 4: the climb passes within a hundred pixels of the
   descent's second beat, so at forty grams you could latch it in flight and reach the exit
   having played two beats out of eight. All three growths are dead until the plate at the top
   of the column wakes them - stage two's mechanic, and it happens to *say* the thing this
   stage's opening paragraph claims, which is that the way back up is visible from the whole
   way down and cannot be taken.
6. **Two skips and a false claim were found by drawing the level, not by testing it.**
   `scripts/m4ss-map.ts` emits an SVG floor plan - tiles, every sweep at the radius it can
   actually be given, press strokes, creature beats, both bridge states, and the camera frame.
   The 56 assertions were all green while you could step off the start ledge and land in the
   corridor with beats one and two unplayed. **A list of passing assertions is not a picture,
   and adjacency is the class of fault that only a picture shows.**

Original plan follows, unedited below this line.

---

Written against an inventory of what
the simulation actually supports, so every Tier 1 beat below can be authored in a level file
without touching `mass.ts`.

**Reading order:** §2 is the honest ledger of which requested mechanics exist. §3 is the level.
§4 is the two capabilities the codebase already has and has never used. §5 is the new sim work,
costed. §6 is what could go wrong.

---

## 1. The constraint that shapes everything

**The level must be 1280 pixels wide.** `VIEW_WIDTH` is 1280 (`M4SSRig.ts:232`) and the camera
only ever moves in Y — `cameraY` is the sole camera term (`M4SSRig.ts:648`). There is no
horizontal scroll in this game and adding one is not a level's job.

So a third stage cannot be "wider". Its only free axis is height, which is what stage two
already took (1280 × 1440 against stage one's single screen).

That is the design problem, and the answer is **shape rather than size**: stage one is a room,
stage two is a climb, so stage three is a **descent and a return** — down the east side, across
the floor of the machine, and back up the west by a different route. The same axis, used the
other way round, and then used again with the player carrying a constraint they did not have on
the way down.

**Working size: 1280 × 1760.** Only 320px taller than the shaft; the interest is in the
doubling-back, not in the metres.

---

## 2. The ledger — what exists, what does not

Every mechanic requested, checked against the sim:

| Requested | Status | Where |
|---|---|---|
| Split to pass through small areas | **Exists** | `Gate.sieve`, in grams (`mass.ts:127-147`). Both stages use `sieve: 24` |
| Time passing through hammers | **Exists** | `Crusher` (`mass.ts:214-229`). Stage two has exactly one |
| Swing on growths to cross | **Exists** | `Anchor` + the whole swing model (`mass.ts:1449-1469`) |
| Fling after a 360 into a button | **Exists** | `Button.force`, an impact-speed gate in px/s (`mass.ts:197`). Stage two's `heavy` is 420 |
| Swing over and avoid the sporeling | **Exists** | `Critter` (`mass.ts:244-263`). Stage two has one, on a ledge |
| Fling through a breakable wall | **Does not exist** | No destructible type, no speed-vs-tile rule anywhere |
| Split light to be lifted by an updraft | **Does not exist** | No wind, fan, or force-volume entity of any kind |

Two things worth being straight about before designing anything on top of them.

**The 360 is not counted.** There is no revolution counter and no angle-wrap detection. What the
game calls a 360 is an energy latch — `state.turning` enters above `1.7 × g × rope` and leaves
below `1.35` (`mass.ts:1450-1452`), and carrying over the top needs `2.0`. So a level cannot ask
for "one full turn"; it can only ask for **enough energy**, which is what a distant force plate
already asks for. That is a better question anyway, and stage two's `heavy` plate already poses
it. Stage three should pose it harder, not differently.

**The sporeling is a rope-cutter, and that is the interesting part.** Contact does not cost mass.
It drops the rope, zeroes spin and slow-motion, stuns for 1.2s and returns the body to
`lastSafe` (`mass.ts:2228-2280`). Stage two uses it as a floor hazard on a ledge you land on — a
thing to walk around. But a creature that takes your rope away is far more dangerous
**underneath a swing** than on a platform, and no stage has ever used it that way. Beat 2 does.

One detail that is a design tool rather than a footnote: contact is tested against the **owned**
body only — shed lumps are scenery to it (`mass.ts:2248-2254`). Mass you leave on a patrolled
floor is safe. The half that is still you is not.

The giant mushrooms stay decor, which is correct — they are what the arcs have to clear, and the
sporelings are what the arcs have to stay above.

---

## 3. The level, beat by beat

Coordinates are **first-pass and indicative**. Level space is y-DOWN, units are pixels, gravity
is 1500 px/s². The numbers that are *not* negotiable are the thresholds — they are quoted from
the sim.

Reach is the one thing mass buys: **reach = mass × 5.3 px** (`mass.ts:1122`). At the starting 40g
that is 212px; at 24g, 127px; at 14g, 74px. Growths in a chain sit ~165px apart, because rope 80
lifts about 160 over the top plus roughly 80 of fling (`shaft.ts:126-136`).

### Beat 1 — THE DROP  *(teaches: the rope as a brake)*

Start on a ledge at the top-east. One growth, `d1`, rope 120. The landing is **below and to the
side**, not across.

Stage one and stage two both open with the same shape: a pit, and a swing that carries you over
it. Stage three opens by inverting it. To land on the ledge below you must release at the
**bottom** of the arc, not the top — the rope is being used to shed height under control rather
than to gain distance.

It is the same verb answering a different question, on the first screen, before anything is at
risk. If a player only learns one new thing here, this is the one worth teaching.

### Beat 2 — THE PATROL  *(teaches: keep the swing alive)*

A floor with **two sporelings walking it on opposite phases**, and nothing worth standing on. It
is crossed on the rope, over their heads, on a run of three growths.

This is the beat the request asked for and the one the game has never built. The threat is not
that they hit you — it is that a swing losing energy dips lower on every pass, and the floor is
where they are. Cross briskly and their heads are never in the arc. Dither and the arc comes down
to meet them.

The sim already punishes dithering; this beat just points at it. Holding no direction for longer
than `swingGrace` 0.55s ramps a drag of `swingIdle` 0.34 against travel (`mass.ts:1368-1375`), and
a lazy hold goes stale in under a second — `pumpFresh` is 0.9s and stale pumping is cut to a
quarter (`mass.ts:610`, `1449-1469`). The pump wants **rhythm, not pressure**, and nothing in
either shipped stage makes a player feel that.

Being caught is cheap — no mass, a stun, back to `lastSafe`. It should be, because this lesson
needs repeating a few times before it lands.

### Beat 3 — THE HAMMER ROW  *(teaches: read a machine's rhythm)*

A corridor running east. **Two presses, alternating** — same `travel` and `period`, `phase` 0 and
0.5, with a standing pocket between them.

Stage two has one press and the lesson is "wait, then go". Two out of phase is a different
lesson: there is no moment when both are up, so the corridor is crossed in **two commitments**
with a pause between them, and the pause is inside the machine rather than outside it.

The press cycle is not a cosine — it is 55% winch up, 30% hang, 15% drop (`mass.ts:2349-2380`).
The hang is the window and it is the longest part of the cycle, which is what makes this fair.
Period around 3.0s.

Being caught costs 45% of the body floored at 20g, shed onto the floor and recoverable with Q
(`mass.ts:2382-2456`). Nothing dies. That is exactly the right punishment here — it costs reach,
and reach is what beat 7 needs.

### Beat 4 — THE SIEVE  *(re-teaches: split, and that what you leave stays)*

A sieve wall at `sieve: 24`, the value both other stages use. Deliberately familiar: this is the
setup for beat 5, not a puzzle in itself.

Split to 24 or under, crawl through, and **the shed half stays exactly where you left it** —
disowned, inert, no gravity, no drift, until Q wakes it (`mass.ts:2545-2548`, `1592-1607`).

### Beat 5 — THE COLUMN  *(the new toy: split light, ride the air)*

The sump at the bottom of the east side, and above it a **vertical air column** running most of
the level's height.

The column has a mass ceiling of **14g** — under it you rise, over it you stand in the draught
and nothing happens.

This is the beat the whole descent exists to set up, and its point is that **the wall and the air
disagree**. The wall let 24 through. The air only lifts 14. So the player who split to exactly
the sieve limit arrives at the column and has to shed again — and the second shedding is the one
that hurts, because 14g is 74px of reach and there is nothing to latch onto down there.

The number has to be *told*, not discovered. The sieve announces itself in the HUD at the moment
it binds — `too big for the gap - hold SPACE to shed below 25` (`M4SSRig.ts:2875`) — and the
column needs the same line in its own words. Without it this beat is a guess.

At the top of the column: a platform, and a plate.

### Beat 6 — THE BRIDGE  *(the payoff: the wall becomes the floor)*

The plate at the top of the column opens a **bridge gate** — a gate that is solid in both states:
a slab across the level when shut, a floor when down (`mass.ts:1051-1054`).

So the wall the player has been looking at since beat 1 lies down and becomes the walkway back
west. They cross it at 14g, weighing nothing, to stand over the mass they abandoned two beats
ago, and Q it back.

**There is a sporeling on the bridge**, and this is the third thing the same creature is asked to
be: in beat 2 it was something to stay above, here it is something to get past on foot with no
rope at all. At 14g the nearest growth would have to be within 74px, and there will not be one. A
stun on a narrow span is a long walk back.

One creature, three readings — under you, beside you, and between you and the way on. That is
worth more than three creatures.

### Beat 7 — THE PRESS GALLERY  *(the climax)*

The climb back up the west side: **four growths, ~165px apart**, the same chain shape stage two
ends on — with one addition that changes it completely.

**A press on the horizontal axis, swinging across the flight path.** `Crusher.axis` accepts `'x'`
(`mass.ts:214-229`) and **neither shipped stage uses it**. A press that travels sideways between
two growths turns a chain of four releases into a chain of four releases *with a gate in the
middle of it*: link two is only survivable on the beat.

Every release above 2.1 rad/s of spin already buys slow motion — real time scaled to 0.35 for
0.9s (`mass.ts:1584`, `M4SSRig.ts:3139-3149`) — which exists precisely because the flight between
two growths is about a third of a second and *"that is not an aiming window, it is a reflex
test"*. So the player gets the time to read the press. The mechanic is already built for this.

Giant mushroom `landmarks` sit in the gallery so the arcs have something to clear, and a
sporeling walks the gallery floor far below — beat 2 has already taught the player to read the
space under an arc, and here it is read at height with a press in the way as well.

### Beat 8 — THE BREACH  *(the last swing)*

From the top growth: wind up past `2.0 × g × rope`, release, and hit a **vertical force plate at
460 px/s** — harder than stage two's 420, on a plate that is out of the swing's own sweep so it
*must* be struck by a released body.

Stage two proves the shape works and even records why: its `g6` sweep stops 19px short of the
plate on purpose (`shaft.ts` beat 6). Stage three's version needs the same care and one more
thing — the plate should be **dressed as cracked masonry and the gate it opens as a collapse**,
so the beat reads as smashing through a wall rather than pressing a button.

That is Paul's breakable wall, delivered with **no new simulation code**. Mechanically it is a
force plate on a gate; perceptually it is the mass going through a wall. If that is not enough,
see Tier 2.

Behind it, the exit.

---

## 4. Two capabilities already in the codebase, never used

Both found in the inventory. Both are free content — implemented, animated, and dead.

**`Gate.mode: 'bridge'`** with its `span` rect. Implemented in the sim (`mass.ts:1052`), animated
in the rig (`M4SSRig.ts:3876+`), used by neither stage. Beat 6 above is built on it.

**`Crusher.axis: 'x'`.** Supported (`mass.ts:214-229`), never authored. Beat 7 is built on it.

A third stage that uses both is not just new content — it retires two pieces of dead code by
making them load-bearing.

---

## 5. Tier 2 — the two mechanics that need new simulation

Neither is required for the stage above to work. Both are genuinely good, and both touch
`mass.ts`, which [M4SS-ART-BIBLE.md](M4SS-ART-BIBLE.md) calls frozen. That guard scopes the art
bible rather than the project, but the sim is also the thing stage two's play session has not
validated yet — so these are a deliberate decision, not a detail.

### 5a. The updraft — **needed by beat 5 as written**

A new `World` field and entity:

```ts
interface Updraft { x: number; y: number; w: number; h: number; force: number; liftMass: number; }
```

In `step`, for each **owned** particle inside the rect, add upward acceleration — but only while
`state.owned.size <= liftMass`. Roughly twenty lines beside the crusher pass, plus the field on
`World`, plus a HUD line mirroring the sieve's.

**Stated, not emergent** — and that matters, because `mass.ts:16-33` records four attempts at
making mass do something emergent and all four failing. The column lifts you or it does not, on a
number, the same way the sieve passes you or does not.

**Cost:** half a day of sim work, plus a tuning pass against gravity 1500 and the 8g `minKeep`
floor. **Risk:** it interacts with the rope constraint (what happens if you latch inside the
column?) and with the kill plane. Both need a harness case.

**If declined:** beat 5 becomes a second sieve at 14 and beat 6's bridge is opened by a plate
reached some other way. The stage still works. It loses its one genuinely new toy.

### 5b. The breakable wall — **not needed; beat 8 already reads as one**

A `breakAt?: number` on `Tile`: an owned particle striking above that speed removes the tile.

**Cost:** small in the sim, real in the art — a broken state and debris, and `collide` iterates
`world.tiles` per particle so mutation mid-step needs care. **Recommendation: don't**, at least
not for this stage. Beat 8 delivers the *feeling* on mechanics that are already tuned, and a
destructible whose only use is one wall is a system built for a single sentence.

---

## 6. What could go wrong

**The stage is a re-run.** The real risk. Between them, stages one and two already use: swing
across a pit, sieve split, recall, a red growth woken by a remote plate, a patrolling critter, a
four-link fling chain with slow-mo, a timed press, and a speed-gated button. Stage three's claim
to exist rests on five things: the **descent** opening, the **patrolled floor crossed on the
rope**, **two presses out of phase**, the **air column**, and the **bridge**. If the updraft is
declined, four — which is enough. It was not obviously enough before the sporeling beat.

**Vertical clearance.** A body's hanging form scales as `sqrt(count) × rest` (`mass.ts:2004`) and
crawling relaxes it to roughly 15px (`crawlRelax` 0.35). Corridor heights have to be checked
against the body, not eyeballed.

**Two authoring traps that have already bitten this codebase.** A `Button` with no `opens` field
opens **every gate in the level** — stage two sets `opens: []` explicitly with a comment about
the bug it caused. And any tile a body walks on must not be ~40px thin, or the body sinks deeper
than the ejection limit and is expelled through the underside (`shaft.ts:105-113`). Floors want
`DEEP = 300`.

**The chain arithmetic is tight.** Rope 80 lifts about 160px over the top plus roughly 80 of
fling; growths 200 apart are impossible (`shaft.ts:126-136`). Beat 7's press must not steal the
margin — stage two removed a second press for exactly this reason, because it sat in the flight
path of the heavy-button fling.

---

## 7. Order of work

1. **Decide Tier 2a.** The updraft is the difference between a stage with one new idea and a
   stage with two. Everything else can proceed either way.
2. **The theme.** A third `StageTheme` (`stageArt.ts:291`) — palette, light direction, midground,
   occluders, flora density, three forest colours. Its `name`, `midground` and `occluders` fields
   are two-value string unions today, so a third member means touching the generators that switch
   on them. Small, but not free.
3. **Grey-box the level.** A `sluice.ts` beside `lab.ts` (273 lines) and `shaft.ts` (369). Add to
   `STAGES`; the save clamp at `M4SSRig.ts:645` was already written for a three-stage build.
4. **Play it before dressing it.** Beats 2, 3 and 7 are all timing, and timing cannot be
   measured off a capture.
5. **Art pass**, against the art bible.

**Before any of it: stage two still has not had its play session.** Beat 7 is stage two's
finale with a press added to it, and if the chain's feel is wrong the fault is now in two levels
instead of one.
