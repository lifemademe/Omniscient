# OMNISCIENT_ — presentation review, second pass

Written 2026-08-22 against the 59s capture of a cold boot through Mirela's mission, plus the
code. Freeze Sept 2, submission Sept 11. Read `POLISH-REVIEW.md` first — this does not repeat
it.

Same discipline as before: everything below is something watched frame by frame or read in
the source. Where it was not observed, it says so. The first review contained two confident
claims about missing features that were already built, both from sampling at 1fps — that
mistake is not repeated here, and anything not directly seen is marked.

---

## 0. What closed since the first pass

Verified on screen in this capture, not assumed:

- **Boot screen** — self-test prints, `OMNISCIENT_` types, PRESS ANY KEY, camera pulls back
  to reveal the CRT. The reveal lands.
- **Objective types on** — caught mid-sentence at `...has stopped, and g`.
- **The wire chip exists** — three chips, `follow the supply wire` among them.
- **Lighting** — the workshop now has a warm pool on the bench, dark corners, and Mirela's
  face brighter than the wall behind her. This was the flattest thing in the game and is now
  not.
- **The observed strip does not re-animate** when a fourth line appears, which was the
  specific failure mode the arrival-only guard was written to avoid.

Unverifiable from a silent capture and still unconfirmed: **room tone, the motif, and the new
hover cue.** Everything in §1 of the first review is written and none of it has been heard by
anybody. That is now the single largest untested surface in the project.

---

## 1. The boot screen is off-centre — the one visible fault

**Observed.** The content sits in a column roughly 320px wide starting at the left margin of
a very wide frame. On a 2560-wide window that leaves something like two thousand pixels of
empty black to the right of `OMNISCIENT_`. It reads as a layout that has come unstuck rather
than as a deliberate margin.

Cause: `.omni-boot` is `display:flex; flex-direction:column` with `padding: 0 8vw` and no
cross-axis alignment, so every child sits hard against the left edge of a full-width box.

**Fix (ten minutes).** Give the block a bounded width and centre the block — not the text.
Left-aligned text inside a centred column is what a terminal looks like; centred text is what
a title card looks like, and this is a terminal.

```
.omni-boot { align-items: center; }
.omni-boot > * { width: min(46ch, 84vw); }
```

Keep the dot leaders and the left-aligned rows exactly as they are. The only thing moving is
the column.

**While there:** the title is `clamp(22px, 3.4vw, 54px)` and the self-test is
`clamp(11px, 1.15vw, 17px)`. On a wide window that is a 3:1 ratio and the title dominates.
A CRT self-test does not shout its own name; consider 2.2vw and a cap of 38px.

---

## 2. Where the remaining presentation gaps are

Ranked by what a judge would notice, cheapest first.

### 2.1 END CALL is still a cut — the entrance's other half

**Read in source, not observed.** The first review flagged this in §2.4 and it was not built.
Arriving somewhere now has a push-in, a nod and a staggered chrome assembly; leaving has
none of it. An asymmetric transition is worse than two matching cuts, because the player has
been taught that this connection means something and then it ends like closing a tab.

**Build:** 0.6s, and colder than the arrival. Chrome goes first — cards out in reverse order,
80ms apart — then the room dims, then the camera pulls back to the globe. The last thing on
screen should be the contact, alone, for about a fifth of a second after their room has gone
dark. `disconnect` already exists and already fires.

### 2.2 ~~The mission has no ending beat~~ — **WRONG, it has a better one than I proposed**

`RESOLVE_HOLD = 4.6` holds the Contact View for four and a half seconds after a request
resolves, and its comment explains exactly the problem I "found": it was zero once,
`onResolved` called `returnHome()` on the same tick, and "the contact's closing line was on
screen for no frames at all". It cites §176 — *resolve, see the consequence, go home* — and
notes that Adaeze's payoff animation is 1.4s and was being seen for a third of a second from
behind.

I proposed one second. It already has four and a half, for reasons written down before I got
here. **Nothing to do.**

This is the third time across two reviews that I have reported something missing that was
already built. All three were watch-the-capture findings that a grep would have refuted in
thirty seconds. The rule for the next pass: **before writing "there is no X", grep for X.**

### 2.3 The knowledge tree has a beat; the camera is too far away to see it

**Partly wrong, and corrected here.** The beat exists: `Phase.Home` is documented as "At the
machine after a request, watching the tree grow" and `HOME_DWELL = 5.5` gives it five and a
half seconds. So the *time* is authored and my "never in shot" was too strong.

What is true is that the camera spends those seconds at `HOME_SHOT`, where the CRT is a small
shape across the room. The game holds for five seconds on something the player cannot read.

**Build (2 hours, not half a day):** during the home dwell, drift PART of the way toward the
tube and back — not to `SCREEN_SHOT`, which is the full-face framing the globe uses and would
read as entering the globe rather than looking at the tree. A push that stops short says
"look at this"; one that arrives says "we are going in".

### 2.4 The globe's left column is now three cards and a shelf, and nothing moves

**Observed.** The readouts are static text. `7 waiting` sits there whether or not anything
changed. When a request resolves and the count changes, nothing marks the change.

**Build (1 hour):** flash the changed card's meter once on change — the same `omni-arrive`
animation already added for the contact view. The numbers already re-render; they just do it
invisibly.

### 2.5 No cursor on the typing objective

**Observed.** Mid-type the request bar reads `...has stopped, and g` with nothing after it.
A block cursor while typing and for a beat after would cost one span and make the typing read
as a machine writing rather than as text appearing slowly.

### 2.6 The contact's room has no sound of its own being worked in

Room tone covers the place; nothing covers the *activity*. Mirela is at a bench with tools on
the wall. One occasional, quiet, non-looping event — a tool set down, a chair shift — placed
on the same `idle` hook the props already use, would do more for that room than any visual
change left on this list.

---

## 3. What must not change

Repeated from the first review because the risk grows as the freeze approaches and tired
people polish the wrong things:

- The **diegetic 3D menu** with cable-plug sockets.
- The **console chrome** — bevels, brackets, monospace, one accent.
- The **writing**. `nobody shut out`, `the world remembers`, `somebody is always asking`,
  `ANTENNA ... NO SIGNAL`.
- The **synthesised audio** as an approach.
- **§157** — the console never touches anything. Every cinematic idea that arrives between
  now and the freeze must be checked against this before it is built, including mine.

---

## 4. Ordered plan to the freeze

Eleven days. This is about two and a half days of work.

| # | item | cost | state |
|---|---|---|---|
| 1 | centre the boot column | 10 min | **DONE** |
| 2 | **play it with sound on** | 20 min | **STILL OPEN — the only item here I cannot do** |
| 3 | END CALL sequence | 3h | **DONE** |
| 4 | tree lean during the home dwell | 2h | **DONE** — was a refinement, not a new beat |
| 5 | mission ending beat | 2h | **ALREADY BUILT** — `RESOLVE_HOLD = 4.6`, see §2.2 |
| 6 | globe readouts flash on change | 1h | **DONE** |
| 7 | objective cursor | 20 min | **DONE** |
| 8 | room activity sound | 2h | **DONE** — the `work` field on every bed |

Everything here is closed except item 2, which is not a coding task.

**Item 2 is not a formality.** Room tone, the motif and the hover cue are all written, none
has been heard, and synthesised audio tuned by arithmetic is either lovely or a fridge hum.
If one of the eight beds is wrong it will be wrong for the whole mission it plays under, and
that is a worse outcome than any item below it on this list.

---

## 5. Still outstanding from before

Neither has moved and both remain true:

- **The M4SS ending** — car interior, rain, three cutscenes, the device plant. All built,
  none seen. `just watch` is the one to check.
- **Publish once and look at the result** before the freeze, to settle whether the editor's
  FPS overlay appears in a built game. It is not in this project's source, so it probably
  does not — and "probably" is the wrong confidence for the first thing a judge sees.


---

## 6. A third pass, 2026-08-22 — three faults that had been on screen the whole time

Not a new review. Three things found while acting on the two above, all of which had been
rendering for weeks and none of which any capture-and-look had caught, because each one
looked deliberate.

### 6.1 The boot screen's title was a quarter of the way into the margin

`.omni-boot > * { width: min(46ch, 84vw) }` on every child. `ch` is the width of a zero in
the element's OWN font, so the title - more than twice the size of the self-test - got a box
more than twice as wide, and centring three boxes of three different widths splays their left
edges apart by half the difference. Everything was correctly centred. The rule was measuring
three different things.

One `fit-content` wrapper cannot have that fault: one box, hugging the widest line, and every
row flush to one edge. Change any font size in the file and the column follows.

While there: the dotted rows are `WIDTH + 2` characters wide and the rule above them was
drawn at `WIDTH`, so it stopped two characters short of the column it was ruling. Small, and
exactly the kind of small that reads as somebody typing rather than a machine printing -
which is the one thing that screen has to be.

### 6.2 The SUSPECTED tier was drawing one box per SHELF, not one per crate

The largest object in the left half of Mirela's frame was a translucent pane 1.6m wide and
1.1m tall standing in front of the shelf, with a ragged lit edge along the top. It reads as
broken glass or a failed decal. It is the certainty tier, and it has looked like that since
the tier was built.

`localBounds` unioned every mesh in the subtree into one box, and `shelf-crates` is six
crates on three levels merged into one buffer. So the guess swallowed the shelf. That
destroys the tier's own argument - "the unresolved sits inside the resolved" needs the
resolved thing to be VISIBLE - and the file's header has always described the result it was
meant to produce: "the shelf reads as four separate volumes".

Now it does: `localIslands` splits the geometry into connected shells, merges any that
overlap, and builds one breathing volume per island with its own phases, so six crates sit on
a shelf you can see, each drifting on its own. Above ten islands it falls back to the single
hull, which is coarse but never wrong.

This affects all fourteen SUSPECTED props in the game, so it is measured rather than watched
- `scripts/suspected-split.ts` drives the real generators: the shelf gives six crate-sized
boxes across four heights, the bench gives four legs, the compressor stays one machine.

### 6.3 Mirela's tools were five rectangles

§131 puts the evidence on the environment and the pegboard's own note calls this the wall the
player READS - the only statement in the game about what she does with her hands, directly
behind her head in the shot every player sees first. It was five dark bars with a hook on
top. Not bad tools: not tools.

Each is now one nameable outline - a ring and a fork, a closed rectangle with the board
showing through it, splayed handles pinching to a point, a stubby grip on a long blade, a T.
Nothing else: at the shot's distance, through the pixel pass, hatching and grips are
invisible and shape is all that survives.

Which five got the work was decided by projection, not by eye. The console panel cuts the
frame at 0.645, which lands at about x -0.1 on that wall, so everything from x 0.2 rightward
is behind the panel in every call. The five that share frame with her face got the distinct
silhouettes; the rest got plain kinds.

Three of them needed a second pass after looking: the spanner's fork had no visible gap and
read as a lollipop, the screwdriver's handle was long enough to read as a bottle, and the
hammer's head was too narrow so the claw took over and it read as a hook.


### 6.4 The boxes could never open — reported by the person who designed them

The fix in 6.2 made the SUSPECTED tier draw one box per crate instead of one slab per shelf,
and the boxes still read as a rendering fault rather than as a statement. The report was
literal: *"what are these translucent boxes?"*, asked by this project's designer about his own
game, and then, after the connector work below, *"the translucent boxes are still there"*.

The tier does not mean "contents unknown". It means **not resolved yet**, and the word doing
the work is *yet* — the whole thing is a promise that the box opens when somebody says what is
in it. Four props in the game were SUSPECTED with no `revealOn` on any branch of any mission.
`shelf-crates` and `bench-store` are two of them and they sit in the middle of the first room
every player sees, for the whole tutorial call. `ruined-box` and `landing` are the others, and
`landing` is a lit window, so the one warm thing at the night door was a black volume.

A box that never opens is worse than clutter, because it teaches the opposite of the intended
lesson: a player who watches one do nothing for five minutes concludes that boxes are what
this game looks like, and the one that *does* open then reads as an effect rather than as an
answer. The tier spends its meaning before it says anything.

**The rule is now: SUSPECTED only where something can promote it.**
`scripts/certainty-tiers.ts` enforces it, matching every SUSPECTED entry against the
`revealOn` calls and the one prop action that promotes by cue.

Taking the tier off the crates put the *original* fault back — pale featureless cubes — so
the frame was sampled rather than admired. Crates at luma 58-69, wall behind them 57, floor
54. The problem was never brightness, it was nine points of separation: not a subtle object,
an invisible one. `MAT.dark` bodies with lighter lids give the two values that read at four
metres. One under-bench lid then measured 127 against the Kestrel-3 at 112 and had to come
down again — §187 gives the eye to the brightest thing in frame, and that is the radio.


### 6.5 "Are the shadows grainy? Is that the pixel post-processing?" — no, and no

There are no shadow maps in this project. Nothing sets `castShadow` on any light in any
room. Every dark patch under a bench or behind a leaning panel is **screen-space ambient
occlusion**, and SSAO is stochastic: it fires N rays per pixel through a rotated kernel, so
if N is small the result is noise shaped exactly like the occlusion that made it — dense
where a surface is buried, absent in the open. That is why it read as grain *in the shadows
and nowhere else*.

It was `ssaoSamples: 12` into a **half-resolution** buffer, at strength 2.4. Both halves
mattered. Twelve is a low count for that strength, and a half-res AO buffer upsampled to the
frame turns per-pixel noise into 2×2 blocks — which is why it survived being looked at
closely and read as blotching rather than as film grain. Now 32 samples at full resolution
with depth-aware upsampling: the leaning back panel's lower half goes from heavy blotching to
a smooth gradient, and the plank under the bench crates from a grainy smear to a tight
contact line.

The quality numbers were also written **twice** — once in `configureLook` and once inside the
F8 panel's `pushAo`, which re-pushes the whole effect config on every slider move. A fix to
one would have been silently undone the first time anyone touched the occlusion strength.
One `AO_QUALITY` constant now, and the panel keeps only the two values its sliders own.

Three wrong instruments were used before the right one, and the pattern is worth recording:

1. **Laplacian edge energy on flat patches** said the paint-banding softness change did
   nothing. It cannot see a band transition, which is a low-frequency shelf, not an edge.
2. The same metric then said the AO fix made things *worse* (+12% to +36%). Full-resolution
   AO is **sharper**, and sharpness raises edge energy whether or not the noise is gone.
3. Ruling things out by reading source found "no `castShadows` in the shop builder" and
   concluded there were no shadows — while the AO pass sat in `configureLook` two thousand
   lines away.

What actually settled each one: **diff whole frames** for a global shader change, and **crop
and look** for a local artefact. The user's two crops did in one message what three
measurement passes had failed to do.


### 6.6 There was no pixelation, and now there is one size of it everywhere

Reported as "is the pixel post processing working? this doesn't look like ps1 pixel style",
and the answer was that it never had been. Nothing named `Pixelation` was registered anywhere
— the only "pixelated" in the codebase was CSS `image-rendering` on DOM elements — and
`retro.ts` had no pixel-size uniform at all. It is a CRT pass: curve, aberration, scanline,
grille, bleed, vignette, roll, flicker. The engine's own `Pixelation` cannot help, being
WebGPU-only against this project's forced WebGL. The PS1-ish quality was coming entirely from
the art.

`uPixel` snaps the output UV to a coarse grid before anything else, so every device pixel in a
block samples the same point and the blocks are axis-aligned and exact. The order is the
argument: this is the **signal** being coarse, and everything below it is a tube displaying
that signal. A television showing a 320-line source curves and scans the coarse image; it does
not coarsen its own scanlines.

**One size everywhere — 3.** The presets briefly carried different values (2 for the console,
5 for the wire city) on aesthetic arguments, and both were wrong for the same reason: a pixel
size that changes between places is a property of the picture, and this game has spent nine
missions establishing that the picture belongs to one instrument.

**Which forced the menu labels out of the world.** NEW GAME, CONTINUE and SETTINGS are painted
on the plates as world geometry and at 3 they are mush. Exempting them was never available — a
plate that stays sharp while the desk it hangs over goes coarse is an object that has left the
room, and the boot sequence spends eight seconds establishing that the console is a thing
standing in a place.

So the name moved to **the CRT on the desk**. Hovering a plate makes the tube report what it
is, in the same 3x5 face the station desk writes in, over a dimmed band across its lower
third. Nothing new appears on screen; something already there says something — which is what a
machine with a screen would do, and what §157 asks for. It survives the pixel grid for free,
being a readout designed for a low-resolution screen in the first place.

A DOM caption under the wordmark was built first and thrown away. It would have worked and it
was the wrong idea: a label floating on the wall is the interface talking *about* the room
rather than the machine answering *in* it.

**Verified by measurement, not assumption.** All eight dioramas plus the menu were captured
and checked for the grid — identical adjacent columns run 23-40% against a 0.0% baseline from
a pre-pixelation frame. Two scares along the way were both my own instruments: mill road
measured "100% flat" from a frame caught mid-transition, and the wire city measured "no
pixelation" because the `machine` preset's grille modulates every column and destroys the
statistic. Diffing the wire city before and after showed 46.3% of pixels moved — more than the
repair shop's 25.2%.

`retro.ts` also gained a compile check, which it had never had: `scripts/dev/shader/` covered
the material injection and the unmounted painterly pass but not the one pass that is actually
mounted, and therefore the only one whose failure is a black screen. The GLSL moved to
`retroShader.ts` so a browser bundle can import it without dragging the engine in — the same
split `paintShader.ts` has from `paintPass.ts`. Proved both ways: all three compile on a real
GPU, and a deliberate typo prints `CRT pass: FAILED` with the line number.
