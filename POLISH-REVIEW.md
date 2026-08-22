# OMNISCIENT_ — presentation review

Written 2026-08-22 against the 49s capture of a cold boot through Mirela's opening, plus
the code. Freeze Sept 2, submission Sept 11.

Everything below is either something I watched frame by frame or something I read in the
source. Where I could not observe it I say so rather than guessing.

**Two items in §6 were simply wrong and are struck through rather than deleted.** Both were
"this is missing" claims about things that were already built, and both came from the same
mistake: sampling the capture at one frame per second, which cannot show a globe drifting at
0.02 rad/s or a person breathing. Absence of evidence at 1fps is not evidence of absence.
The lesson is in the file rather than tidied out of it.

---

## 0. The honest headline

The **systems** are at a level most jam entries never reach. The **presentation around
them** is not, and the gap is widest at exactly the moments a judge forms their opinion:
the first ten seconds, and the first time a contact appears.

Three findings would move this more than everything else on the list combined:

1. **There is no music.** Not "the music is thin" — there is no score at all.
2. **Connecting to a contact is a hard cut.** Measured: globe → fully-formed contact view
   inside one frame at 6fps. The brief asks about "cinematic entrance of contacts"; there
   is currently no entrance.
3. **The contact rooms are lit flatter than the menu room**, and the menu room is the one
   that proves the project can do better.

Everything else is smaller than these three.

---

## 1. Audio — the biggest single gap

### 1.1 What exists

`audio/ConsoleAudio.ts` (420 lines) is a Web Audio synth, and a good one. Its own header
calls it "ONE INSTRUMENT - a valve set with a carrier hum". It has a continuous carrier bed
(mains hum + band-limited hiss) that runs while a call is up, and a cue vocabulary of
`connect, disconnect, failed, key, learn, receive, reject, resolve, seat, solved, suspended,
tap, transmit`. `m4ss/SlimeAudio.ts` (230 lines) is a sibling instrument.

That is a **diegetic sound design** and it is a genuinely good decision. Nothing here should
be replaced.

### 1.2 What does not exist

- **No music.** No score, no themes, no per-scene beds beyond the carrier hum. `find assets
  -name "*.mp3" -o -name "*.ogg" -o -name "*.wav"` returns nothing; the entire game is
  synthesised at runtime.
- **No room tone.** The menu room, the workshop, the tunnel, the cellar and the wire city
  all sound identical, because none of them sound like anything. A repair shop by the coast
  and a flooded cellar are the same silence.
- **No M4SS ambience** beyond the slime instrument.

### 1.3 Why this is the top item

The jam has a **Most Atmospheric ($400)** prize defined as "a place that feels like
somewhere, built from **light, sound**, and space rather than action." That is a direct
description of this game with one of its three ingredients missing.

It also affects the main prize. A judge playing twenty entries forms an impression in the
first thirty seconds, and silence reads as unfinished regardless of what the systems do.

### 1.4 Exactly what to build

**Do not commission or source music tracks.** No time, and it would fight the diegetic
design. Extend the existing synth instead — everything below is Web Audio, no assets, no
new dependency.

**A. Per-scene room tone (half a day, biggest return).**
Add `setRoomTone(name)` alongside `setRetroLook(name)`, called from the same place in
`OmniscientRig.mountScene`. Each tone is two or three oscillators plus filtered noise,
crossfading over ~1.5s:

| scene | tone |
|---|---|
| workshop | low mains hum ~50Hz, faint sea outside (filtered noise, slow LFO on cutoff) |
| tunnel | narrow-band reverberant drip, long gaps |
| cellar | water movement — noise through a lowpass wobbling at ~0.2Hz |
| wire city | no air at all; a data hum, 4th-harmonic square at very low gain |
| menu room | the CRT's own 15.7kHz whine plus the lamp's hum |

The wire city having *no* room tone while every other scene has one is itself a statement,
and it costs nothing to make.

**B. A two-note motif on the moments that matter (2 hours).**
Not a score — a signature. Two or three notes from the same valve instrument, at:
- first boot (the machine waking)
- a request resolving
- the ending

Reuse `ConsoleAudio`'s oscillator path so it is unmistakably the same instrument as the
squelch and the key clicks. Three notes used three times is a motif; a track is a soundtrack
this game does not want.

**C. Fill the silent interactions (2 hours).**
Observed with no sound: hovering a menu plate, the cable seating (it has `seat` — check it
actually fires on the 3D menu), the globe rotating, opening a hint, the scan reticles
pinning. Each is one existing cue at low gain.

---

## 2. The contact entrance — currently a cut

### 2.1 What I measured

Frames at 6fps across the ANSWER click:

- `u01` — globe, ANSWER button under the cursor
- `u02` — **complete contact view**: room, contact, three readout cards, chat panel, three
  observed lines, two suggestion chips, request bar, END CALL

One frame. Everything arrives simultaneously and fully formed. There is no camera move, no
fade, no connection sequence, no stagger.

### 2.2 Why it matters more than it sounds

This is the game's core verb. The player does it nine times, and it is the moment the
fiction is strongest: a machine reaching down a wire into a stranger's room. Right now it
has less ceremony than opening a menu.

It is also **the single highest-leverage cinematic in the project** because it already has
everything it needs — the scene exists, the camera system exists, the audio has `connect`.

### 2.3 Exactly what to build (half a day)

A 1.6–2.0s sequence, skippable on click, in `LocalSurface`/`OmniscientRig` where the
contact view mounts:

1. **0.0–0.3s — the line opens.** Globe stays. Carrier `connect` squelch already fires;
   let it breathe. Screen holds black-green for a beat.
2. **0.3–1.0s — the room resolves before the person does.** Mount the scene with the camera
   ~15% wider than its final shot and push in. Start the room at low exposure and bring it
   up. This is the machine's picture stabilising.
3. **0.7–1.4s — the chrome types on, staggered.** The three readout cards should not appear
   together: CONNECTION STRENGTH first (it is the one that is literally about the link),
   then TRUST, then COMPLETED. 80ms apart. The `omni-cv__stage` brackets draw last, corner
   by corner.
4. **1.2–1.8s — the contact turns to camera.** There is already a `gesture` system with
   `reacting` / `nod` on the rigged contacts. Fire one on arrival. **A person noticing you
   have connected is the whole moment.**
5. **1.4s — the observed lines appear one at a time**, 120ms apart, each with a `receive`
   tick.

Every one of those is an existing system. The work is sequencing, not building.

### 2.4 The reverse

END CALL is presumably the same cut backwards. It should be faster (0.6s) and colder — the
chrome should go first and the room last, so the last thing the player sees is the person,
alone, as the link drops.

---

## 3. Lighting — the two halves of the game do not match

### 3.1 What I observed

Compare the two frames directly:

- **Menu room** (`r001`): one warm practical lamp, deep black falloff, a cold window
  opposite, a green CRT as a third source. Three colours of light, high contrast, obvious
  key. It looks authored.
- **Mirela's workshop** (`u03`): broadly even grey-green fill, no visible key, no practical,
  shadows that do not read. The most interesting surface in frame — her face — is the same
  value as the wall behind it.

The menu room proves the project knows how to light. The contact rooms are where the player
spends 90% of their time.

### 3.2 Exactly what to fix (half a day for all scenes)

For each contact scene:

1. **Give every room one practical** that is visible in frame — a work lamp on Mirela's
   bench, a torch in the tunnel, the lantern in the cellar. A light the player can *see the
   source of* is worth three they cannot.
2. **Drop the ambient by half and let the corners go dark.** The vignette is already doing
   this work at the frame edge; the room should do it in depth.
3. **Key the contact's face specifically.** A dim, tight spot on the contact only, from the
   side the practical is on. They are the subject of every one of these frames.
4. **One cold rim from the opposite side** so the silhouette separates from the wall.

`scenes.ts` already imports `createTorchlight` and `applyPaintBanding` — the banding will do
much more work once there is a key to band.

---

## 4. Boot, splash, loading

**Not observed** — the capture starts at the menu, already loaded. Needs checking:

- Is there a splash at all? If the game cuts from black straight to the menu, the first
  thing a judge sees is a room with no title.
- Is there a load screen between menu and mission?

If either is missing, the cheap fix is strong and thematically perfect: **boot the machine.**
A monochrome terminal boot on black — `OMNISCIENT OS`, a few lines of self-test, the tree
glyph drawing itself stroke by stroke, then the camera pulls back to reveal it was on the
CRT on the desk all along. That is 2–3 hours, uses only text and the existing camera, and
turns a load into the game's thesis statement.

---

## 5. Debug overlays in the build

Visible in every frame of the capture:

- **`240 FPS (1-240)` counter, top left**, plus a cyan/blue debug swatch under it.
- Window titled `omniscient - default`.

The FPS counter and swatch **must not be in the submission build**. A judge sees a debug
overlay before they see the game.

I looked for the switch and it is **not in this project**: nothing in `src/`, nothing in
`Omniscient.genesys-project`. So it is a Studio-side editor overlay rather than something
the game draws, which means it is probably absent from a published build already - but that
is a guess, and it is the wrong thing to guess about. **Publish once before the freeze and
look at the result**, rather than finding out from a judge.

---

## 6. Smaller findings, roughly in value order

1. **Everything on screen is present at once, always.** No element in the console ever
   staggers in. Anywhere a list appears — observed lines, records, hop options, trace
   results — 60–100ms between items would change the feel of the whole UI for almost no
   work. This is the single cheapest "juice" win in the project.
2. ~~**The globe never moves on its own.**~~ **WRONG — it already does.** `GlobeScreen.update`
   calls `globe.advance(deltaTime)` every frame and already stops while a point is selected
   or dragged, with a comment explaining why it resumes without easing. I could not see the
   drift because I sampled the capture at one frame per second. Nothing to do.
3. **`SELECT A SIGNAL` and `SOMEBODY IS ALWAYS ASKING.` are static.** The bottom line is
   good writing; let it change with state — how many are waiting, how long the oldest has
   been.
4. **No hover state on the globe signal points** beyond the tooltip. They should brighten
   and grow slightly on approach.
5. **The request bar** (`REQUEST Find out why Mirela's transmitter…`) types on instantly.
   Type it character by character on arrival — it is the mission statement.
6. **`END CALL` is the only red thing on screen** and it sits bottom-left, away from
   everything. That is correct and worth keeping; note it here so it does not get "fixed".
7. **The scan reticle label** (`01 TRANSMITTER`) is well done. More of that language on
   other interactable props.
8. ~~**Contact idle.**~~ **WRONG — already built, and built well.** `character-node.ts` has a
   full BREATH system: pitch, roll and sway on separate periods, with the breath rate itself
   drifting, integrated rather than multiplied so it never repeats. The measurements are in
   millimetres. Same reason as above - a 1fps sample cannot show a breath. Nothing to do.
9. **No transition between missions and the globe** — same cut problem, lower stakes.
10. **The vignette is doing a lot of the atmosphere work alone.** Once rooms are lit
    properly it should come down, or the frame will read as a tunnel.

---

## 7. What is already strong — do not touch

Recorded so a later pass does not "improve" these:

- **The main menu is a diegetic 3D room with cable-plug interaction.** This is better than
  most shipped indie menus. The plates as sockets is the best single idea in the
  presentation layer.
- **The console chrome.** Bevelled panels, corner brackets, the monospace discipline, the
  one-accent rule. Consistent and confident.
- **The diegetic audio design**, as an idea. It needs a bed, not a rewrite.
- **The writing.** `nobody shut out`, `the world remembers`, `somebody is always asking`.
  This is the most AAA thing in the project.
- **The wireframe city** and its three-tier visual thesis.

---

## 8. Priority against the freeze

Sept 2 freeze, ~11 working days. In order:

| # | item | cost | state |
|---|---|---|---|
| 1 | strip debug overlay from the build | 10 min | **DONE 2026-08-22** — see below |
| 2 | per-scene room tone | 0.5d | **DONE** — `audio/RoomTone.ts`, eight beds |
| 3 | contact entrance sequence | 0.5d | **DONE** — push-in, nod, staggered chrome |
| 4 | contact room lighting pass | 0.5d | **DONE** — per-scene `daylight`, practicals |
| 5 | stagger every list in the console | 0.5d | **DONE** — see `link/console-chrome.ts` |
| 6 | boot/splash sequence | 0.5d | **DONE** — `link/BootScreen.ts` |
| 7 | two-note motif on three moments | 2h | **DONE** — the `motif` cue |
| 8 | globe idle rotation + hover states | 2h | **DONE** — was already built when written |
| 9 | request bar types on | 1h | **DONE**, with a cursor |
| 10 | fill silent interactions | 2h | **DONE** — 13 cues across 38 call sites |

### Item 1, and why it took three weeks to notice

Ten minutes of work, correctly ranked first, and still open weeks later - because it was
looked for in the wrong place. There is no FPS counter in this project's source; the one in
every capture is the editor's, and every time somebody checked, that is what they found and
dismissed.

The actual debug surface was `dev/SceneJump`, mounted unconditionally in `beginPlay`: a
hover strip of eight numbered tabs at the left edge of the game container, in every build,
one mouse-move away from a judge who brings the pointer to the side of the window. Plus the
F8 `TunePanel`. The irony is on the record - SceneJump's own comment says it exists so that
nobody has to edit the game to reach a scene, "which has twice shipped a debug hook by
accident", and it had quietly become the third.

Both are now behind `ENGINE.isPublishedGame()`, which is the engine's own flag rather than a
constant in this repository. A constant has to be remembered on the day of the freeze by
somebody who is busy; this cannot be forgotten because nobody has to do anything. Editor
verification loops are unaffected.

And `scripts/ship-clean.ts` asserts it, along with no `TEMP-VERIFY` markers, no bare
`console.log` in `src/` (there were four, three of them firing on every contact load - they
go through `core/devLog.ts` now), and no credentials anywhere tracked.

**Everything on this list is closed.** What is not is item 2 of the second review, which is
not a coding task: this game's audio has never been heard.

**Explicitly deprioritised:** the painterly post-process (built, unmounted, rejected twice —
it fights the pixel art and no slider position reconciles them) and any further M4SS swing
tuning (the harness's pump driver is not a trustworthy oracle outside rope 120).

---

## 9. Against the jam's criteria

**Theme (Overgrown).** Strong and unusual — a machine reclaiming a world through
infrastructure rather than plants, with literal overgrowth in M4SS. The **Most Unexpected
Take ($400)** category is a real target. Consider whether the theme reads in the first
minute; right now it arrives late.

**Creativity / Innovation.** The strongest axis. The console-as-protagonist, the §157 rule
that the machine never touches anything, the deduction puzzles, the camera feed. **Best Idea
We Want to Steal ($400)** is winnable on the pursuit mission alone.

**Execution.** The systems are there; the presentation is what is being judged as execution,
and it is the gap this document is about.

**Most Atmospheric ($400)** — currently blocked by the absence of sound. Items 2, 4 and 6
are the whole play for this prize, and it is the most winnable of the specials.

**Best Movement ($400)** — M4SS's swing is genuinely good and the game is not
presenting it as a headline. Consider whether the submission's screenshots and description
lead with it.

**Most Ambitious ($400)** — nine missions, a platformer, a deduction engine and a custom
CRT pass in a jam. This is a strong claim and should be made explicitly in the submission
text.
