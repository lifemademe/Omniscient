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

## 3. Dorin is legible but is not in the picture's hierarchy

**Correcting my own first reading**, which is recorded here because the mistake is instructive.
Two spot samples said luma 12 and 36 and I was about to report that the contact is invisible.
Sampled as regions instead:

```
Dorin, lit torso     mean 30.6   median 31.0   p90 58.0
wall behind him      mean 12.6   median 11.6   p90 18.5
```

He is **2.7× his own background**. He is not invisible and the porch light is reaching him.
What is true is different and still a problem:

- His median (31) sits against a lit door frame at **105** and a soffit at **180**. He is in the
  bottom quarter of the frame's range.
- He is at **x 0.27** — the left edge — while the composition's mass is centre-right.
- He is small, partly cropped by the frame edge, and turned away.

For comparison, Mirela in mission 01 stands at x 0.48 with her face brighter than the wall
behind her. Dorin gets none of that, and he is the more dramatic of the two — a man who did
eleven months, at his mother's door at two in the morning, with picks in his hand.

### 3.1 The fix

Do **not** brighten him. The dark is correct for the scene and his separation is already real.
Fix the framing instead:

- **Re-aim `registerShot('default')` so he is inside the composition** rather than at its edge —
  target between him and the lock rather than at the door's centre. The door does not need to be
  centred; a door seen slightly off-axis with a man beside it is a better picture than a
  symmetrical door with a man clipped off one side.
- **Then re-check with `scripts/dev/probe-shop.ts`**, which projects world points through a
  registered shot. It is written for Mirela's room but the camera maths is general — point it at
  this scene's shots and it will say exactly where he lands at 16:9 and 4:3.

---

## 4. The push-in removes the person from the room

`registerShot('lock')` pushes in on the door, and at that framing **Dorin is entirely off
screen**. Confirmed at t=19s: the frame is door, lock and console, no contact anywhere.

That is the whole middle of the mission — the pin puzzle, the part the player actually plays —
performed with the person they are talking to absent.

Mission 01 solved this exact problem and wrote down the solution. From `registerShot('transmitter')`:

> *"This was a metre from the target and aimed square at the box: the transmitter filled the
> frame, Mirela was nowhere in it, and the whole scene read as a screenshot of a prop. The
> request is a conversation with somebody — losing her the moment the player looks closely at
> anything is the wrong trade every time. Now it comes in from her side of the bench, so the set
> is still the biggest thing in frame and her hands and shoulder hold the left edge."*

**Apply the same fix here.** Move the lock shot's camera round so it comes in over Dorin's
shoulder: the lock stays the biggest thing in frame, and his shoulder and hands hold an edge.
The lesson is already in this codebase; it simply was not carried across.

---

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

## 7. The transition home passes through black

Measured mean luma of the diorama area across the transition:

```
t=35.0   35.2      the door, warm, open
t=35.5   35.3
t=36.0    4.3      <- near black
t=36.5   15.8
t=37.0   17.4
t=40.0   21.2      the workstation
```

The frame at t=36 is the warp: faint green radial streaks at luma 8–15, a scatter of coloured
motes, `WRITING TO TAPE.` bottom-centre — and **a small pale rectangle floating at the left**,
which is the workstation's window seen from far off. In a nearly black frame it is the only
bright thing, it is unexplained, and it reads as an artefact rather than as a destination.

The intent — a change of medium, `playWarp` — is good. The execution spends about a second at
one eighth the brightness of either end of the move.

**Fix:** raise the warp's own brightness so the streaks carry the frame (they are the effect;
they should be visible), and either bring the room up sooner or start the move from inside the
room so there is never a frame with nothing in it but a stray rectangle. Measure it the same
way afterwards — the mean should not dip below about half of either end.

---

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

## 10. Ordered plan

Eleven days to the freeze. This is about a day and a half.

| # | item | cost | why here |
|---|---|---|---|
| 1 | **listen to the game** | 20 min | the only thing here nobody can do from a capture |
| 2 | tab returns to CHAT on resolve (§6) | 30 min | a quarter of the payoff frame is blank |
| 3 | save note off the tube (§8) | 20 min | it covers the reward |
| 4 | porch light off the soffit (§2) | 1h | the eye leaves the picture at the top |
| 5 | lock shot over Dorin's shoulder (§4) | 1h | the lesson is already written in mission 01 |
| 6 | pins in a single row (§5.1) | 20 min | the interface should have the shape of the object |
| 7 | default shot brings him into frame (§3) | 1h | |
| 8 | warp does not pass through black (§7) | 1h | |
| 9 | **draw the lock on the console (§5.2)** | 4h | the biggest single quality gain available here |

Item 1 is still not a formality and is still not something this report can do.

---

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
