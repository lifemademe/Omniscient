# Mission 06 — Dorin, the night door. Presentation review

Written 2026-08-22 against a 47-second capture of the mission from mid-call to the tape
being written, plus the source. Freeze Sept 2, submission Sept 11.

Everything below is measured off the recording or read in the code. Where a number appears,
it came from sampling the actual frames — regions, not spot pixels, for the reason recorded
in §5. Where something could not be checked, it says so.

---

## 0. What this recording does and does not cover

**Covered:** the contact view mid-call, the lock puzzle, the resolution, the transition home,
the save indicator, the workstation return. And — for the first time in this project's life —
**the audio**, because the capture has a real audio track.

**Not covered, and therefore not reviewed:** the boot/splash sequence, any loading screen, and
the contact's cinematic entrance. The recording starts with Dorin's call already open. Those
three were asked about and are not in the file; the entrance in particular needs its own
capture from `openSignal` onward.

---

## 1. The audio system works. This is the first evidence of it.

Every audio system in this game — eight room-tone beds, thirteen console cues, the motif, the
per-room work sounds — was written, shipped and never heard by anybody. It has sat at the top
of the outstanding list for weeks as the single largest untested surface in the project.

**It runs.** A 65536-point FFT of the capture at t=42s, back at the workstation, returns:

```
   49.8 Hz    +19.7 dB
15700.2 Hz    +15.7 dB
```

15700 Hz is the horizontal scan frequency of a PAL television. It is in this game because
`RoomTone.ts` authors it into the `home` bed as `[15700, 0.0022, 'sine']`, with a comment
saying anybody who grew up with a CRT will feel it before they identify it. **Nothing else in
the world produces that tone.** The room tone system is running, the correct bed is selected,
and it is present in a recording made through a screen recorder.

The 49.8 Hz is the 50 Hz mains hum from the same bed — though that one is ambiguous on its own,
since 50 Hz and its 100 Hz harmonic are also what electrical interference looks like in any
recording chain. The 15.7 kHz is not ambiguous.

**Structure over time**, measured in 0.5s windows:

| t | RMS | what |
| --- | --- | --- |
| 0–35.5s | −52.1 dBFS, flat to ±0.2 dB | the night-door bed under the call |
| 36–47s | −65.5 dBFS, flat | the home bed after the transition |

Transients ride 6–9 dB over the bed at t=17.5, 20, 26, 28, 29.5, 31 — console cues and/or the
room's `work` events firing.

### What to do about it

Two things, and the first is not a code change.

**1.1 — The absolute level cannot be judged from this capture and must not be guessed at.**
−52 dBFS RMS is thirty decibels below where a game masters, but a screen recorder's gain and
the system mixer both sit between the game and that number. *Someone has to listen.* This
report can prove the system runs; it cannot prove it is loud enough.

**1.2 — The bed drops 13 dB at the transition and that is worth a listen too.** Home and
night-door are authored at comparable gains (0.016–0.02 fundamentals, ~0.018 air), so a 13 dB
step is larger than the design implies. Most likely the console's carrier hum stops with the
call and takes the difference with it — which would be correct — but it means **coming home is
audibly quieter**, and that is a mix decision nobody has made deliberately.

---

## 2. The composition sends the eye to an empty ceiling

The strongest measurement in this review.

```
porch bulb itself      mean luma 166.1   p90 232.8   clipped 0.0%
soffit around it       mean luma 179.5   p90 213.8   clipped 0.0%
```

**The ceiling is brighter than the lamp lighting it**, by 13 luma, with nothing clipping — so
this is not a bloom or a tone-mapping artefact, it is the light's own falloff against a
surface 20cm away.

And the consequence, measured directly:

```
brightest 2% of the diorama, centre of mass:  x 0.67, y 0.11
Dorin:                                        x 0.27, y 0.72
the lock (the mission's subject):             x 0.47, y 0.56
```

ART_DIRECTION §187 gives the eye to the brightest thing in frame. In this room the brightest
thing is **a blank strip of porch soffit at the top edge**, above everything the scene is
about. The eye goes up and out of the picture.

### 2.1 The fix

In `buildNightDoor`, `scenes.ts`. The porch light is:

```ts
name: 'Porch', intensity: 9, distance: 5, decay: 1.7, color: '#ffd49a'
position: porchAt.clone().add(new THREE.Vector3(0, 0, 0.25))
```

Its own note calls it "the tightest light in the game on purpose", and that intent is right —
the problem is that it is mounted directly under a soffit and its inverse-square term wins at
20cm. Three options, cheapest first:

- **Drop the light 10–15cm and pull it 10cm further out (+z).** Increases the distance to the
  soffit, decreases it to the door and to Dorin. One vector, no new lights.
- **Give the soffit a dark material.** A porch ceiling is boarded and unpainted; `MAT.dark` or
  `MAT.timberDark` on that surface would absorb the bounce that is currently winning the frame.
  Check what it uses now — if it shares the wall material, that is the whole fault.
- **Add a small shade/reflector above the bulb.** Diegetic, and a porch light has one. Geometry
  the light cannot pass through does not need any light tuning at all.

**Verify by re-measuring**: the brightest 2% should move from y 0.11 to somewhere between the
door frame and the lock, and the soffit's mean must fall below the bulb's.

---

## 3. Dorin was behind the console panel — CORRECTED, AND FIXED

**This section originally said the opposite and was wrong twice over.** It is left corrected
rather than rewritten because the way it went wrong is the useful part.

The first draft said "the contact is invisible", from two spot samples reading luma 12 and 36.
Re-measured as regions that became "he is legible but marginal" — a figure at screen x 0.27
with a lit torso at median 31 against a wall at 11.6, a real 2.7x separation.

Both readings were of **the wrong object.** Projected through the shot with
`scripts/dev/probe-door.ts`, Dorin lands at:

```
Dorin head    x 0.688     the console panel's left edge is 0.645
Dorin chest   x 0.688
at 4:3        x 0.754
```

He was **behind the interface for the entire call.** What is visible at the left of the frame,
and what both earlier measurements were reading, is a prop on the porch.

A capture cannot show you a thing that is not on screen, which is exactly why an eye is the
wrong instrument for "is the contact in the frame" and a projection is the right one.

### 3.1 What this collides with, and what was done

There is a rule at the top of `scenes.ts` headed **CONTACT FRAMING - measure this, do not
eyeball it**, and it names this exact scene as a past failure: *"Vasile at 0.00 off axis, Dorin
at 0.02, Ileana cropped at the crown"*. It requires the contact's PERPENDICULAR distance from
the camera-to-target line to be 0.45-0.9m, so the person does not stand over the evidence.

That rule was satisfied. It is simply a different question from "is he under the console", and
nobody had asked the second one.

**Fixed** by pulling the default shot back from 3.05m to 4.2m and panning the target to x 0.42.
Panning alone cannot do it - the door leaves the left of frame before he arrives from the right
- but a wider frame compresses both toward the centre at once. After:

```
Dorin  x 0.586 (0.614 at 4:3)      door x 0.428      lock x 0.474
perpendicular distance 0.54m       inside the documented 0.45-0.9 band
```

Confirmed on screen: he now stands in the porch light in profile with his hands at the lock,
face, hat, coat and boots all reading.

## 4. The lock push-in removes him — NOT FIXED, and here is why

Confirmed and unchanged: at `registerShot('lock')` Dorin projects to x 1.09-1.26 and 0.53m from
the lens. He is not merely off the panel, he is off the frame, and the camera is practically
inside him.

The original recommendation here was to copy mission 01's fix - come in over the shoulder, as
`registerShot('transmitter')` does for Mirela. **That recommendation does not survive the
geometry**, and it is worth writing down why so nobody spends the afternoon I spent on it.

Mirela's set sits ON A BENCH between the camera and her, so a prop close-up naturally contains
her hands and shoulder. Dorin's lock is 2cm of brass on a door, and he stands 77cm to its side
and 82cm in front of it. Swept across camera positions from 0.9m to 3.5m out, at every target:

- every framing that puts his shoulder inside the visible band drops the perpendicular distance
  to about **0.17m**, half the 0.35m at which the codebase's own rule says he occludes the
  subject;
- every framing that respects the rule puts his shoulder at x 0.70-1.5 — behind the panel or
  off the frame entirely.

There is no camera position at 46 degrees that satisfies both. The real options are:

1. **A per-shot field of view.** `registerShot` has no `fov` today. A 60-70 degree lens on this
   one shot would fit both comfortably. Cleanest fix, needs a small change to the shot contract.
2. **Move Dorin.** His position was solved under a reach constraint that was then ABANDONED —
   the note says no placement reached the lock, so he has no hand targets at all and uses a
   raised rest instead. The constraint that chose his spot no longer applies, so he can move.
   Bigger change: rotation, the `stoop` prop, and the reach all move with him.
3. **Do not push in so far.** The scan bracket `01 LOCK` already points at it legibly, and the
   new default shot holds the lock at x 0.474. A gentler push keeps both.

**Not attempted here**, because none of the three can be verified without playing the mission to
that beat, and the dev scene-jump strip mounts a diorama at its default shot only.

## 5. The lock puzzle looks like a form, not a lock

The mission's one interactive mechanic presents as:

```
NAME THE ORDER THE PINS BIND IN.
[ pin 1 ] [ pin 2 ]
[ pin 3 ] [ pin 4 ]
[ pin 5 ]
1 up - press the next one
```

Five identical rectangles with generic labels, wrapped 2-2-1 by the flex container. Two things
are wrong and both are cheap to fix.

**5.1 — A five-pin lock is a ROW.** The layout wraps into a ragged block, so the interface does
not even have the shape of the object it represents. Forcing a single row of five is a CSS
change (`flex-wrap: nowrap` and narrower cells) and gets most of the win on its own.

**5.2 — It should be drawn as a lock.** This game already has everything needed:

- `CRTSurface` — a 192×144 canvas with `line`, `pixel`, `glowLine` and `applyScanlines`.
- `drawPixelText` in `view/pixelFont.ts` — the shared 3×5 face, exported this week.
- The console already draws a globe and a knowledge tree on that surface.

A pin-tumbler cross-section is five vertical lines of different heights in a housing, with a
shear line across them. Drawn on the console it would be perhaps forty lines of canvas code, and
it would turn "press pin 3" into "press the short one" — which is what picking a lock actually
is, and which makes Dorin's line about tolerance mean something mechanical rather than
decorative.

**This is the single largest quality gap in the mission.** Everything else here is a tuning
pass; this is the difference between a puzzle and a form.

---

## 6. The payoff frame is a quarter empty

At the resolution (t=33s) the console is left on the **CONSOLE** tab showing an almost entirely
blank panel with `NOTHING TO WORK ON YET` at its foot, while `REQUEST RESOLVED` sits underneath.
Roughly 640×700px — about a quarter of the screen — is empty at the exact moment the mission
pays off.

`LocalSurface.ts:1564` already contains the rule that should prevent this:

```ts
else if (spoke && this.tab === 'console') this.tab = 'chat';
```

So the tab returns to chat when the contact speaks — but the *resolution* path does not appear
to go through it. **Find the resolve path and make it return to CHAT**, so the last thing on
screen is Dorin's closing line rather than an empty instrument panel.

While there: `NOTHING TO WORK ON YET` is a reasonable empty state for a console with nothing in
it and a poor one for a console whose work is *finished*. Two strings, not one — "nothing to
work on yet" before, and something that closes the loop after.

---

## 7. The transition home is a hard cut, then a slow fade — CORRECTED

Originally written as "passes through black", from frames half a second apart. Re-sampled at
15fps it is a different and more specific fault:

```
t=35.00 .. 35.67   mean luma 28.6, flat        the porch
t=35.73            mean luma  1.39             <- an instant cut
t=35.80 .. 36.47   1.9 3.0 4.4 6.0 7.7 9.2 11.1 13.1 15.5 18.2 20.9
t=36.53 onward     ~20.6, flat                 the workstation
```

So it is **a hard cut to black followed by a 0.73-second fade up.** The fade is deliberate and
fine. The cut is not: one frame at 28.6 and the next at 1.4, with no fade out at all. An
asymmetric transition - cut out, fade in - is the shape of a level load, where a symmetric one
would read as a move.

The cause is visible in `returnHome`: `this.scene?.deactivate()` and `this.scene = null` run on
the same tick that `moveTo(HOME_SHOT)` starts, so the porch is gone before the camera has left
it. The warp overlay cannot cover for that — it is deliberately edge-only, masked clear in the
middle, so there is nothing in the centre of the frame during the cut.

**Not attempted**, for the same reason as §4: `returnHome` cannot be reached from the scene-jump
strip, so a change to it cannot be seen. The fix is a short fade or a delayed deactivate, and it
wants one play-through to tune.

## 8. The save note covers the thing it is celebrating

`flashSaveNote` in `OmniscientRig.ts` positions with:

```
'position:absolute', 'left:50%', 'transform:translateX(-50%)'
```

Horizontally centred — and in the home shot the CRT sits centre-right of the desk, so the note
lands **on the tube**, covering roughly the left two-thirds of the screen face. That screen is
showing the knowledge tree, which has just grown by one branch, which is the reward the player
earned. The confirmation covers the payoff.

**Fix:** offset the note away from the tube — the desk's left side under the lamp is empty and
lit, and a note lying in the lamp pool reads better than one floating in the middle of the
frame anyway.

**Duration is fine and I checked because I doubted it.** The code fades out at 4200ms and
removes at 4900ms; scanning the actual toast region frame by frame gives on at t=36.0, off at
t=42.0 — about six seconds with fades. My first pass claimed ten seconds from a contaminated
sample box that was reading the console panel behind it. It is not a fault.

---

## 9. Two mistakes I nearly shipped in this review

Recorded because the pattern is now four for four across three reviews, and the rule that
catches it is the same every time.

1. **"The contact is invisible."** From two 20×20 spot samples that straddled his dark edge.
   Measured as regions he is 2.7× his background. The claim was wrong and would have sent
   somebody to brighten a light that is working.
2. **"The save note sits for ten seconds."** From a sample box that overlapped the console panel
   and never went dark. It is six.

**The rule: never characterise a region from a spot sample, and never characterise a duration
from a box you have not proved is empty when the thing is absent.** Both faults look like data.

---

## 10. Ordered plan — status

| # | item | state |
|---|---|---|
| 1 | **listen to the game** | **STILL OPEN** — the only item nobody can do from a capture |
| 2 | tab returns to CHAT on resolve (§6) | **DONE** — `SurfaceState.resolved`, a flag not a string match |
| 3 | save note off the tube (§8) | **DONE** — centred at 27% instead of 50% |
| 4 | porch light off the soffit (§2) | **DONE and measured** — see below |
| 5 | lock shot over Dorin's shoulder (§4) | **NOT DONE** — the geometry forbids it, see §4 |
| 6 | pins in a single row (§5.1) | **DONE** — and drawn as a lock, §5.2 with it |
| 7 | default shot brings him into frame (§3) | **DONE and measured** — he was behind the panel |
| 8 | warp does not pass through black (§7) | **NOT DONE** — needs a play-through, see §7 |
| 9 | draw the lock on the console (§5.2) | **DONE** — pin-tumbler cross-section, CSS |

### What the fix to §2 measured

Before and after, same shot, same sampling:

```
                       before        after
porch lamp             166.1         176.6
the wall above it      179.5         156.7     <- was brighter than the lamp; now 20 below
brightest 2%, centre   x0.67 y0.11   x0.40 y0.21
```

The eye's target has moved off the top edge of the frame and onto the lamp and door surround.
Dorin now measures median 34.2 against a wall at 20.8, in frame and lit.

## 11. What is working, and must not be touched

- **The door opening.** Over four frames at t=32.5–34.5 the door swings and warm light spills
  out. It is the best beat in the mission and it is doing exactly what §175 asks of a payoff.
- **The writing.** *"This is the one door in the world I would have sworn I would never open
  this way."* That line is the reason this mission exists.
- **The restraint of the lighting.** One porch bulb, a cold sky fill, a step bounce. The scene is
  dark because a front door at two in the morning is dark, and the fix in §2 is a placement
  change, not a brightness one.
- **`01 LOCK`** and its brackets — the scan label is legible, correctly placed, and the one piece
  of chrome that touches the world without breaking §157.
