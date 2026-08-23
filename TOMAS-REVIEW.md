# Mission 03 — the harbour beacon, reviewed

A senior-level pass on `20260823-0138-37.4103748.mp4`: 57.8s, 1912×1084, 30fps, with audio.
Tomas Vasc, harbour beacon mast, Portu Vech.

**Read section 0 before acting on anything below.** Two of the findings in the Dorin review
were wrong on first writing because they were eyeballed, and the method that caught them is
the method used here.

---

## 0. How this was measured, and what it cannot tell you

Everything numeric below comes from one of four instruments, and each claim names its own:

- **`ffmpeg` frame extraction + per-frame luma**, at 6fps for the timeline and 30fps for the
  three cuts. Cut detection is `mean(|frame − previous| > 18) × 100`.
- **Screen-space projection** through each `registerShot` with the game's 46° lens, the same
  arithmetic as `scripts/dev/probe-door.ts`. This is the only reliable way to answer "is the
  contact in the picture" — an eye reading a capture got that exact question wrong twice on
  Dorin, once in each direction.
- **A-weighted spectrum analysis** of the extracted audio. The first pass used raw energy and
  produced a confidently wrong conclusion (see §5.1); A-weighting reverses it.
- **Reading the builder**, `buildBeaconMast` at `src/omniscient/view/scenes.ts:2308`.

**The one thing this cannot judge: absolute loudness.** The recording is a Windows screen
capture, so its level reflects the system mixer, not the game's. Peak is −31 dBFS and mean
RMS is −53 dBFS, which is 30 dB under a shipped mix — but that number belongs to the capture.
Every audio finding below is stated as a *ratio between things inside the same recording*,
which survives the unknown. Before acting on §5, get one clean measurement: run the game,
play a mission, and record with the system mixer at a known level.

**Also not in this recording:** the boot screen and the main menu. The session starts already
at the globe. §7 covers the boot sequence from source only, and says so.

---

## 1. The mission is 34 seconds of an unchanging, near-black picture — HEADLINE

This is the finding. Everything else is smaller.

```
  t=2.33   hard cut into the mast          (18.8% of pixels change in one frame)
  t=2.33 → 7.2   the wide shot, camera pushing in slowly
  t=7.2  → 41.5  THE SAME FRAME
  t=41.5 → 42.8  a fast move out to the beacon
  t=42.8 → 46.1  the beacon, static
  t=46.17  hard cut to black
  t=46.2 → 48.4  black, then a green ring, then the room grows out of the middle
```

Across `t=7.5` to `t=41.5` — **34 of the mission's 44 seconds, 77% of the call** — the
frame-to-frame difference never exceeds 4.8% and sits at 0.0–0.3% for most of it. Nothing
moves. Not the camera, not the contact, not a light, not a cloud.

And the picture it is holding is this, measured over the diorama area only (x 0–0.645,
y 0.13–0.96, so clear of the banner and the footer):

| shot | p2 | p25 | median | p75 | p98 | range used |
|---|---|---|---|---|---|---|
| wide (t=5) | 1.0 | 11.7 | 18.9 | 28.5 | 52.6 | **52 of 255** |
| **the 34s puzzle shot (t=20)** | 1.0 | 7.5 | 12.5 | 20.0 | 46.7 | **46 of 255** |
| the payoff (t=44.5) | 2.3 | 10.9 | 18.4 | 30.5 | 155.8 | 154 of 255 |
| the workstation (t=51) | 1.0 | 5.0 | 9.3 | 22.4 | 175.5 | 175 of 255 |

**The puzzle shot uses 18% of the available tonal range.** Three quarters of the picture lives
between luma 1 and 20. There is no highlight anywhere in it — the 98th percentile is 47.

The player returns from this to a workstation using 69% of the range. The contrast between the
two is the last thing they see, and it says the mission was the cheap part.

### 1.1 Why — and it is one line

```ts
buildRepairShop          daylight 0.55
buildBeaconMast          NOT SET (default 1)   ← the only night scene in the game
buildSeedlingTunnel      daylight 0.22
buildClearedHouse        daylight 0.5
buildFloodedCellar       daylight 0.3
buildNightDoor           daylight 0.14
buildMillRoad            daylight 0.85
```

`ContactScene.daylight` defaults to 1 and scales both `lightRig.key` and `lightRig.sky`
(`OmniscientRig.ts:3006`). Every other room in the game has an authored value; the mast never
got the pass. The note at the top of `buildNightDoor` describes exactly this and names it as
a fault six scenes had — the mast was one of the six and was missed.

**Fix:** set `scene.daylight` in `buildBeaconMast`, then re-measure the p2–p98 range. Start at
**0.18** — darker than the cellar's 0.3 because a headland at night has no walls to bounce
off, lighter than the night door's 0.14 because there is a moon and a lit beacon here. Then
raise `moonLight` and the beacon's own `PointLightNode` until the p98 of the puzzle shot clears
**110**, which is roughly where the payoff shot sits. Do not judge this by eye; the whole
problem is that the picture *looks* deliberate and measures flat.

### 1.2 The shot has nothing in it to light

Even correctly lit, `registerShot('mast-cable')` is a camera 1.07m from a junction box with a
wireframe hint-box floating beside it. There is no sky, no sea, no harbour, no beacon and no
person in the frame.

**Fix, and it is a camera move, not a set change.** Pull `mast-cable` back and swing it so the
frame holds *three* things: the splice box (the subject), Tomas's hands or shoulder (the
person), and a corner of the harbour lights below (the stakes). The numbers to hit are in §2.

### 1.3 Thirty-four seconds is a pacing failure regardless of the picture

Even a beautiful frame held for 34 seconds is a still image. The mission needs motion the
player did not ask for. In rough order of value per hour of work:

1. **A slow camera drift.** The wide shot already pushes in from t=2.3 to t=7.2 and it reads
   well. Give `mast-cable` the same: a 40-second creep of 15–20cm, or a 2° orbit. `registerShot`
   would need a `drift` field — a per-frame offset applied after `moveTo` settles.
2. **The beacon in shot.** See §3 — the fault is already animated and the player cannot see it.
3. **Weather.** This is a mast in wind strong enough that Tomas mentions it. Nothing on screen
   moves in wind. A guy-wire that sways 2cm, a loose cable end, his coat — any one of them.
4. **A second contact beat.** He is on a ladder halfway up a mast for 44 seconds and never
   shifts his weight or looks at anything.

---

## 2. All three shots put the contact in the wrong place — and one of them has no contact at all

Tomas is at `(0.62, platformY + 0.03, 0.55)` with `platformY = 2.02`. Projected through each
shot at 46°, at both aspect ratios:

```
--- default ---            16:9              4:3
  Tomas head        x 0.506 y 0.510    x 0.508    VISIBLE
  beacon lens       x 0.500 y 0.119    x 0.500    VISIBLE, but see below
  splice box        x 0.495 y 0.724    x 0.494    VISIBLE
  Tomas perpendicular from the camera axis: 0.42m   (house rule: 0.45-0.90)

--- mast-cable ---   the shot the mission spends 34 of 44 seconds in
  Tomas head        x 0.864 y -1.296   x 0.986    OFF FRAME
  Tomas chest       x 0.811 y -0.487   x 0.915    OFF FRAME
  Tomas feet        x 0.709 y  1.078   x 0.778    OFF FRAME
  beacon lens       x -0.110 y -8.140             OFF FRAME
  splice box        x 0.500 y 0.500                VISIBLE
  camera is 0.65m from his head

--- beacon ---       the payoff
  Tomas head        x 0.517 y 1.430               OFF FRAME
  splice box        x 0.486 y 2.076               OFF FRAME
  beacon lens       x 0.500 y 0.438                VISIBLE
```

Three shots, three different failures:

**`default`** — everything is stacked on one vertical line. Tomas at 0.506, the beacon at
0.500, the splice box at 0.495. The perpendicular distance is **0.42m, under the documented
0.45–0.90 band** by three centimetres. The rule at the top of `scenes.ts` exists precisely to
stop a contact standing on top of the evidence, and this is the tidiest possible violation of
it: a totem pole.

Fix: move the camera, not the man. `position (4.4, 3.9, 4.4)` → **`(5.1, 3.75, 3.4)`** and
`target (0.25, 3.7, 0.25)` → **`(0.55, 3.55, 0.1)`**. Re-project before committing; the goal
is Tomas near 0.38, the beacon near 0.52 and a perpendicular of 0.6–0.7m.

**`default`, second fault** — the beacon lens lands at **y 0.119** and the REQUEST banner
occupies y 0.072–0.115. The most important object in a mission about a light sits four
thousandths of frame height under the UI, and in the capture its top is visibly clipped. Drop
the target ~0.2m so the lantern clears 0.16.

**`mast-cable`** — Tomas is not behind the console panel, which was Dorin's fault. He is
**outside the frustum entirely** — head 1.3 frame-heights above the top edge, feet below the
bottom, and the camera 65cm from his face. For 77% of the call the player is talking to
somebody who is not in the picture in any sense.

Fix: `position (0.05, 2.92, 1.35)` → **`(1.35, 2.72, 1.95)`**, `target (0.3, 2.6, 0.36)` →
**`(0.42, 2.55, 0.45)`**. That is 1.9m back and swung so the box stays near centre while his
near shoulder enters from the right. Verify with the projection before you look at it.

**`beacon`** — at the moment his problem is solved, Tomas is 1.4 frame-heights below the
bottom edge. The shot is a light on a stick against a sky. Fix in §4.

---

## 3. The one animated thing in the mission is off screen for 39 of its 44 seconds

`buildBeaconMast` does something genuinely good and almost nobody will see it:

```ts
beaconClock = (beaconClock + deltaTime) % 11;
const dark = beaconClock > 7.5;       // out 3.5s in every 11
lens.material = dark ? MAT.beaconDark : MAT.beaconLit;
glow.intensity = dark ? 0 : 9;
```

The fault Tomas describes — "gone, three or four seconds, then back" — is modelled and runs
live. Measured off the capture, sampling the lantern region of the wide shot:

```
t=2.50 … 3.50    mean 19.6 → 28.7      out
t=3.67 … 6.33    mean 73.6             on
t=6.50 …         mean 34.2 → 22.0      out again
```

It works. The player sees **exactly one cycle**, between t=3.6 and t=6.5, and then the camera
cuts to `mast-cable` where the beacon projects to y −8.14 — eight frame-heights above the top
of the picture — and stays there for 34 seconds.

The single best-value change in this document is **putting the beacon back in frame during the
puzzle**, because the asset already exists and already animates. The `mast-cable` reframe in
§2 should be chosen to include it, or the lantern's glow on the underside of something, or its
light on the platform — anything that goes dark for 3.5 seconds every 11 while the player is
choosing a part. That turns a static screen into a timer nobody had to build.

---

## 4. The payoff happens off-camera

The climax is "the light is steady". Frame-by-frame at 15fps from t=41.0:

- t=41.0–42.3 — the camera flies out from the platform, whipping past structure and past
  Tomas's helmet in one blurred frame
- **t≈42.3 — the beacon is already lit when it enters the frame**
- t=42.8–46.1 — a static shot of a lit beacon

**The player never sees the light come on.** The transition from `MAT.beaconDark` to
`MAT.beaconLit` happens during a camera move, behind geometry.

And the shot it arrives at is weaker than the establishing shot. The wide shot at t=5 has a
coastline, a scatter of harbour lights and a sea. The payoff shot has a yellow cylinder, four
white polygons and a black sky. The mission is about a town getting its light back and the
town is not in the picture.

### 4.1 Fixes, in order of value

1. **Land the camera first, then light it.** `registerShot('beacon')` has `duration: 2.2`.
   The `steady` prop action must fire *after* it settles, with a beat of dark first. Sequence:
   move (2.2s) → hold dark (0.6s) → `prop.steady:beacon`. One line of cue ordering in the
   mission content, and it converts the climax from a fait accompli into an event.
2. **Reframe so the harbour is in it.** `position (2.2, 4.6, 2.2)` → **`(3.6, 4.15, 3.6)`**,
   `target (0, 5.2, 0)`. Further out and lower, so the lantern sits at about y 0.35 with the
   coast and its lights across the bottom third. That is the shot: a light, and the thing it is
   for.
3. **Give the light something to light.** It is a `PointLightNode` at `distance: 9` with a
   lens in `MAT.beaconLit` and nothing else. A harbour light at night is *visible air*. Add,
   cheapest first:
   - a **halo billboard** — one additive quad facing the camera, scaled 2.5× the lens,
     opacity ~0.35. The single highest ratio of read to cost in this document.
   - a **beam**: an open cone in an additive material, 25–30° included angle, rotating at
     roughly 6°/s. `MAT.beaconLit` already exists; the cone needs `depthWrite: false` and
     `side: DoubleSide`.
   - **the clouds catching it.** The cloud slabs are hard-edged white polygons that read as
     torn paper. Tint the two nearest ones toward `ACCENT.amber` when the beacon is lit, and
     give their edges a gradient. See `art/decals.ts` for the canvas-texture pattern.
4. **Show Tomas seeing it.** He is 1.4 frame-heights below the bottom of this shot. The
   emotional beat is a man watching a light he fixed stay on. Either widen enough to hold him,
   or add a third shot after the beacon — a two-second return to him — and let the last frame
   of the mission be a person rather than a prop.

---

## 5. The sound

### 5.1 The metric that was wrong first, because it will be tempting again

Raw spectral energy said the mast bed is 89% below 120 Hz — a bass rumble with nothing else.
That is true and it is not what anybody hears. A 44 Hz sine carries enormous *energy* and
almost no *loudness*; bandpassed noise spread over an octave carries the reverse.

A-weighted, the picture inverts:

```
                    20    80   160   320   640    1k    2k    5k   10k
the mast, mid-call 0.5%  4.7% 2.4% 1.8%  5.0% 33.2% 48.4% 3.0% 1.0%
the payoff         0.6%  5.1% 2.8% 1.0%  3.6% 32.9% 50.0% 3.1% 1.0%
the workstation    0.2%  0.0% 0.4% 3.7%  9.4% 30.1% 34.6% 2.0% 19.7%
```

**Use A-weighting for any loudness claim about this game.** Raw energy will tell you the
opposite and it will sound authoritative.

### 5.2 The mast bed is thin where it should be thick

81% of the mast's perceived loudness sits in **1 kHz–5 kHz**. The 160–640 Hz band — where a
large steel structure in weather actually lives — carries **6–9%**.

The bed is well designed on paper (`RoomTone.ts:108`): a 44 Hz sine, a 190 Hz triangle
described as "the guy wire", noise at 700 Hz Q 1.4, a 320 Hz knock every ~15s, and a 480 Hz
drift over 9s. The *gains* are the problem: the guy wire is at 0.006 against the sine's 0.02
and the air's 0.026, so the one element with any character is 10 dB under the two that have
none.

**Fix:** raise the 190 Hz triangle to **0.016**, drop the air's cutoff from 700 Hz to **380 Hz**
and widen Q from 1.4 to **0.9** so it fills the low-mids instead of hissing above them, and
add a second noise layer at 90 Hz Q 0.7 gain 0.02 for the swell. Then re-measure A-weighted and
aim for 160–640 Hz carrying 30–40% and 2 kHz under 25%.

### 5.3 The bed does not move for 44 seconds

A-weighted level, in 2-second windows:

```
 t=2  -58.9    t=17 -62.6    t=32 -61.5    t=47 -68.4
 t=5  -60.5    t=20 -61.8    t=35 -62.6    t=50 -70.1
 t=8  -62.6    t=23 -61.6    t=38 -60.4    t=53 -71.1
 t=11 -61.7    t=26 -62.6    t=41 -58.3    t=56 -73.7
 t=14 -61.5    t=29 -61.8    t=44 -62.6
```

**A 4.3 dB range across the whole call**, and most of that is the two transients at t=38–41.
The `drift` field exists and is set to `[480, 9]`; whatever it is doing is under the noise.

The mission has a shape — a problem, a diagnosis, a decision, a fix — and the sound is a flat
line through all of it. Minimum viable version: a **gain envelope tied to trust**. Trust goes
45% → 63% in this recording and nothing in the mix knows. Drop the air 3 dB and open the drift
when the console tab opens; bring it back with a swell on `steady`.

### 5.4 It is effectively mono

Left/right correlation is **0.993–0.998 for the entire recording**. There is no stereo image at
all: no width on the wind, no side for the guy wire, nothing panned. In a game whose entire
verb is *listening to a place*, that is a whole dimension unused.

`ConsoleAudio` builds through a single `master` GainNode. Adding a `StereoPannerNode` per bed
element is a small change with a large return: put the guy wire hard-ish left, the sea wide,
the knock slightly right, and keep the 44 Hz centred (bass should be).

### 5.5 Most interactions are silent

High-passing above 400 Hz and thresholding against the bed's own median:

```
threshold ×3.0:  5 events   2.4  5.8  39.6  41.7  47.8
threshold ×2.5:  8 events   2.4  5.8  39.6  41.7  42.1  42.5  42.8  47.8
threshold ×2.0: 15 events   2.4  2.9  5.8  12.6  12.9  15.1  32.7  39.6 …
```

The video shows the player clicking suggestion chips and buttons at roughly t = 7, 12.5, 20.5,
25, 27.5, 32.5, 37.5 and 41.5. Only 12.6 and 32.7 produce anything at all, and only at twice
the bed — about 6 dB, which is under the threshold at which a click reads as feedback rather
than as noise.

The cue table is not the problem; it is careful and well argued. The problem is the **spread**:
`connect` is at level 0.5 and lands 23 dB over the bed, while `tap` (0.07) and `receive`
(0.075) land 2–6 dB over it. That is a 17 dB gap between the loudest and the most frequent.

**Fix:** compress the range. Raise `tap` to 0.13, `receive` to 0.11 and `key` to 0.15, and drop
`connect`'s noise burst from 0.5 to 0.34. Target every UI cue at 10–14 dB over the bed. Then
re-record and re-run the detector above — it should find one event per click.

### 5.6 The 15.7 kHz tone is a lovely idea that needs a volume check

`RoomTone.ts:201` puts a 15,700 Hz sine in the `home` bed at gain 0.0022 — PAL flyback whine,
and exactly the kind of detail this project is good at.

Measured, it carries **19.7% of the workstation's A-weighted loudness and 32% of the globe's**,
and it is the single loudest band in both. That is far more than a subliminal detail should
occupy, it will be unpleasant for younger players who can still hear it, and on cheap DACs it
will alias. Drop it to **0.0008** and add it to the accessibility options as its own toggle if
one exists.

### 5.7 The game fades itself out at the end

−62.6 dB at the mission's end → −73.7 dB twenty seconds later, still falling. After the one
moment of achievement the game gets progressively quieter and never comes back. Whatever
`home`'s bed is doing on entry, it should settle to a level, not a slope — and the `motif` cue
(the one thing in the table allowed to be music) should be firing on the return, not on
nothing.

---

## 6. The transitions are asymmetric, and the way home is 2.2 seconds of black

Frame-accurate at 30fps.

**In (t=2.30):** one frame. The globe is on screen at t=2.27 and the mast is at full brightness
at t=2.30. No dissolve, no fade, no signal acquisition.

The HUD panels *do* stagger in over ~1.2s — CONNECTION STRENGTH, then TRUST, then COMPLETED,
bars filling row by row. It reads well. **The world has no entrance at all**, so the effect is
that the interface arrives politely into a room that was already there.

There is no cinematic entrance for contacts. The user asked about one specifically; there
isn't one. Tomas is standing in position, mid-idle, in the first frame he exists.

**Fix — and this is the single biggest piece of *juice* available in the game.** The premise
is an optical feed being acquired by a machine that is not sure what it is looking at. The
tools to sell that are all already built:

- `art/suspected.ts` builds volumes from geometry and phases them in. It is already used for
  hints. Point it at the whole scene for 0.8s on entry: the room arrives as a cloud of
  wireframe boxes that collapse into objects.
- The certainty tiers already animate. Open the scene at `CERTAINTY.SHAPED` and run to its
  authored tiers over ~1.2s, so the picture *resolves* instead of appearing.
- `retroShader.ts` has `uPixel`, `uCurve` and `uAberration` as uniforms. Open at pixel 12,
  curve 0.09, aberration 0.02 and ease to the preset over 0.9s. That is a signal locking, and
  it costs three tween channels.
- The `connect` cue already fires at t=2.42 — 120ms *after* the cut. Move it to lead by 150ms.

**Out (t=46.17):** one frame, and everything goes — the world, the console, the request banner,
the whole UI. Then:

```
t=46.2 … 47.5   pure black with "WRITING TO TAPE" in the bottom-left corner
t=46.8 … 48.0   a green vignette ring grows in from the edges, centre still black
t=48.0 … 48.6   the room appears small in the middle and grows
t=48.6 … 49.5   the green wash fades off
```

Two faults:

1. **Cut out, fade in.** Instant one way, 2.2 seconds the other. An asymmetric transition is
   the shape of a level load; a symmetric one is the shape of a move. This is the same fault
   found in Dorin's `returnHome` — `scene.deactivate()` and `scene = null` run on the tick
   `moveTo(HOME_SHOT)` starts, so the room is gone before the camera has left it.
   **Fix:** hold the outgoing scene for the first 0.5s of the move, or fade the world out over
   0.35s before deactivating.
2. **The green wash is not edge-only.** The code describes the warp overlay as masked clear in
   the middle. Measured at t=47.8 the *entire* frame carries a green cast, strongest at the
   edges but present at centre — the workstation renders visibly green-tinted and reads as a
   colour-grading bug rather than an effect. Compare t=47.8 against t=51.0 to see it.
   **Fix:** check the mask's falloff. It should reach zero by ~0.45 of the radius, not 0.95.

And 1.3 seconds of pure black with a corner toast is a dead beat at the emotional peak. Fill
it: this is where the `motif` cue belongs, and where a single line — *the harbour light is
steady* — could sit on the black before the room returns.

---

## 7. Boot and menu — from source only, not from play

Neither is in this recording. What follows is read from `link/BootScreen.ts` and should be
re-checked against a capture before acting.

The boot sequence is sound: six self-test lines landing whole rather than typing (correct verb
— a machine reports, it does not write), irregular gaps with ANTENNA and KNOWLEDGE BASE taking
longest, then the title typing at 55ms a character, then PRESS ANY KEY. About **2.9 seconds**
to interactive, skippable from the first frame. The reasoning in the file about judges
replaying is right.

Two things to check when it is next on screen:

- **Is there any sound on it?** The first 2.0 seconds of this recording are *digital silence* —
  exactly 0.0000, not a noise floor. If the boot screen is also silent, a machine powering on
  with no sound is a missed open. A relay click, a capacitor whine rising to the 50 Hz bed,
  and the CRT degauss thump would cost three entries in the cue table.
- **`ANTENNA … NO SIGNAL` and `KNOWLEDGE BASE … EMPTY` are flagged as warnings.** On a replay
  the knowledge base is not empty. If those lines are static, they are lying to a returning
  player, and telling the truth there is free characterisation.

There is no loading screen between the menu and a mission, and given everything is procedural
that is correct — but the hard cut in §6 is what a player will read as one.

---

## 8. Ordered plan

Cheapest and highest-value first. Each has a stated test.

| # | change | files | test |
|---|---|---|---|
| 1 | `scene.daylight` for the mast (start 0.18), then raise the moon and beacon | `scenes.ts` §1.1 | puzzle-shot p2–p98 range > 110 |
| 2 | Reframe `mast-cable` so it holds the box, Tomas's shoulder and the beacon | `scenes.ts` §2 | projection: Tomas 0.55–0.62, perpendicular 0.45–0.90 |
| 3 | Fire `prop.steady:beacon` *after* the beacon shot settles, with a dark beat | mission content §4.1 | frame diff spikes after the move ends, not during |
| 4 | Reframe `beacon` to include the harbour | `scenes.ts` §4.1 | coast visible in the bottom third |
| 5 | Halo billboard on the lantern | `scenes.ts` §4.1 | payoff-shot p98 > 200 |
| 6 | Compress the UI cue range; raise `tap`/`receive`/`key` | `ConsoleAudio.ts` §5.5 | the ×3.0 detector finds one event per click |
| 7 | Fix `default` — off the totem line, beacon clear of the banner | `scenes.ts` §2 | beacon y > 0.16, perpendicular 0.6–0.7 |
| 8 | Rebalance the mast bed into the low-mids | `RoomTone.ts` §5.2 | A-weighted 160–640 Hz at 30–40% |
| 9 | 15.7 kHz down to 0.0008 | `RoomTone.ts` §5.6 | under 6% of the workstation's A-weighted loudness |
| 10 | Symmetric exit — hold the scene 0.5s into the move | `OmniscientRig.returnHome` §6 | no single-frame drop to mean luma 1 |
| 11 | Warp mask falloff to 0.45 radius | vfx §6 | centre pixels at t+1.5s within 5% of the untinted frame |
| 12 | The scene-resolve entrance (suspicion volumes + pixel/curve ease) | §6 | — |
| 13 | Camera drift on long shots (`registerShot` needs a `drift` field) | `ContactScene.ts` §1.3 | frame diff never below 1% for more than 3s |
| 14 | Stereo on the room tone | `ConsoleAudio.ts` §5.4 | L/R correlation under 0.85 |
| 15 | Trust-linked mix envelope | `RoomTone.ts` §5.3 | A-weighted range across a call > 8 dB |

Items 1–5 are one working session and they fix the mission. 6–11 are the polish that makes it
feel shipped. 12–15 are the ones that would make a judge remember it.

---

## 9. What is working — do not break these

Stated so a later pass does not "fix" them.

- **The beacon fault mechanic.** Modelling the symptom the caller describes, and running it
  live on an 11-second loop, is the best single idea in the mission. It only needs to be seen.
- **The HUD entrance.** The three panels staggering in over 1.2s is the best-timed thing in
  the recording.
- **The wide shot's harbour lights.** A scatter of small warm dots along a dark coast, at
  t=2.3–7.2. It is the only place the mission establishes stakes and it does it in one detail.
- **Tomas's orange.** The only high-visibility garment in the game, on the only person who is
  outdoors at height. It reads instantly at any size and it is the one warm thing in the frame.
- **The cue table's reasoning.** Every entry in `CUES` has an argument behind it and the
  arguments are good. §5.5 is about levels, not about design.
- **The console puzzle's writing.** "One supply, feeding her shop and the light. Pick what
  gives the light its own." That is a puzzle statement, a diagnosis and a piece of
  characterisation in nineteen words.
- **The CRT tree.** The trust plant on the workstation monitor growing between missions is the
  quiet best thing in the game and nothing in this document touches it.
