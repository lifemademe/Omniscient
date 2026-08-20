# M4SS Art Review — Findings and Exact Fixes

Senior-artist pass over both stages, 2026-08-20. Evidence: two full recordings
(`scripts/dev/review-s1-sheet.png`, 16s of pace → latch → committed 360;
`review-s2-sheet.png`, 18s eastward traverse), far-chamber still (`rv-farchamber.png`),
extracted frames (`rv-*.png`), pixel sampling, and a code inventory of every effect in
`M4SSRig.ts` / `stageArt.ts`. Post-processing surface confirmed against
`.engine/src/render/postprocessing/`.

**How to reproduce the captures**: TEMP-VERIFY `wantsM4SS()` true + `stageIndex` forced;
drivers under `const move` in the rig (pace / auto-latch-and-pump / walk east / idle at a
placement); DPI-aware grab at rect (309,243)-(2250,1332); `scripts/dev/record.py NAME secs
fps 309 243 2250 1332`. Always revert TEMP hooks (grep count must be 0).

Verdict up front: the world reads as a place — layered fog, warm lanterns against teal,
purple accents doing their job, and the teardrop-under-swing is genuinely excellent (twelve
frames checked, correct in every phase: point leading, blunt trailing, droop when slow).
What is missing is almost entirely in three families: **broken/invisible feedback**
(flight dots), **legibility of critical objects** (red growth vs decor), and **unspent
juice** (slow-mo, press slam, latch grip have no visual event). Plus one systemic
inconsistency (post-processing differs by entry path) that silently invalidates every
capture-based judgement made so far.

---

## P0 — Correctness / consistency

### 1. The game looks different from the console than standalone, and all review was done standalone
- **What**: Entering M4SS via mission 09 keeps OmniscientRig's post config: ACES **exposure
  0.62 + Bloom enabled** (`OmniscientRig.configureLook`, ~line 1260). Standalone
  (`?game=m4ss`) gets the scene default: **exposure 0.5, no bloom**
  (`assets/default.genesys-scene`). `enterM4SS()` (OmniscientRig ~2082) adjusts fog but
  never touches `postProcessManager`. Every art judgement to date was made at 0.5/no-bloom;
  the jam audience plays at 0.62/bloom — ~24% brighter with glow bleed.
- **Fix (exact)**: In `M4SSRig.mount()`, own the look:
  `const post = this.getWorld()?.postProcessManager;` save current tone-mapping + bloom
  config, then `post.configureEffect(ENGINE.PostProcessPass.ToneMapping, { enabled: true,
  mode: THREE.ACESFilmicToneMapping, exposure: 0.5 })` and configure Bloom deliberately
  (see item 2). Restore saved config in `unmount()`. This makes both entry paths identical
  and makes the standalone captures honest again.
- **Gotcha**: WebGL pipeline is real (see OmniscientRig ~1204 comment); DoF/pixelation/
  retro/SSR are WebGPU-only, ColorGrading returns empty on WebGL. Bloom/AO/ToneMapping/AA
  work.

### 2. Bloom should be ON in M4SS, tuned for it
- **What**: The stage's palette is pre-lifted for ACES 0.5 (`lift()`, GAIN 1.15–2.3), so
  emissive accents (slime, lanterns, portal, acid, plate chevrons) sit near the top of the
  range — exactly what bloom needs. Right now (standalone) nothing bleeds; the slime's
  "glow" is a painted halo sprite only.
- **Fix**: `post.configureEffect(ENGINE.PostProcessPass.Bloom, { enabled: true, threshold:
  ~0.75, strength: ~0.35, radius: ~0.6 })` — start there, capture, tune. Judge by: lanterns
  should halo softly, the slime should bleed on the dark dirt but NOT wash the HUD; if the
  turf blooms, raise threshold. This one change buys more "AAA feel" per line than
  anything else on this list.

### 3. Flight dots are effectively invisible — verified broken in practice
- **What**: Twelve frames of committed circle at 6fps: zero dots visible
  (`rv-dotscan.png`). Three compounding causes in `paintSwingShape` / `buildFlightDots`
  (M4SSRig): (a) gate `drive > 0.45` where drive = speed/ceiling — only exceeded near the
  bottom of the arc, so they flicker a few frames per revolution; (b) size 7–13px additive
  at low opacity over teal — under the read threshold even when on; (c) they require
  `state.attached`, so they vanish at release — **the one moment the player aims (slow-mo
  flight) has no dots**.
- **Fix (exact)**: show when `state.attached && drive > 0.2` with opacity scaled by drive,
  AND during `state.slowmo > 0` in flight (predict from current velocity, no anchor
  needed). Sizes 22/19/16/13. Keep additive but double base opacity (0.5 + fade*0.4).
  While in slow-mo, stretch DOT_REACH to 0.5s. Re-record the 360 to confirm they read at
  half-res capture.

---

## P1 — Legibility of critical objects

### 4. The dead red growth is indistinguishable from the red decor lantern
- **What**: `rv-farchamber.png` — g2 (dead, puzzle-critical, "a QUESTION" per the bible)
  renders as a red lantern; stage 2's decor set ALSO hangs red lanterns (one in the spawn
  view, one beside g2's chamber). Same shape, same size class, same red, both glowing.
  Sampled: growth core RGB ≈ (149,46,32) — a saturated ember red identical in family to
  the decor. A player cannot tell the switch-openable object from set dressing.
- **Fix (two halves, do both)**:
  a. **Stack theme loses red decor lanterns** — in the rig's lantern placement, stage 2
     picks warm-only (the red variant only exists to vary decor; variety can come from
     size/height instead).
  b. **Dead growth becomes a husk, not a lamp**: in `bushTexture(seed, size, dead=true)`
     variant — desaturate the pane to grey-brown (mix toward `stoneDark` 0.6), hang it
     visibly AJAR (2–3px rotation/offset of the pane inside the frame), and keep ONE small
     ember pip (4px, `#c8502a`) that pulses via the existing emberNode halo. Dead = dark
     object with one coal, not a lit red lamp. The wake moment then reads as the lantern
     snapping upright + pane flooding lemon — a visible state change worth a burst
     (`this.burst(g.x, g.y, '#d8f26a', 12, 240)` on activation; hook where `activates`
     flips `live` — the rig already swaps growthArt textures there).

### 5. Sporeling readability
- **What**: contrast ratio 1.27:1 against its backdrop (sampled). It reads today because
  of motion + purple hue, but at 1.27 it is one fog-bank away from vanishing.
- **Fix**: bake a 1px darker outline pass into `sporelingFrame` composite (the bake
  already has `voidDeep` outline — thicken bottom/left to 2px), and give the rig's critter
  node a soft ground-shadow blob (24×8px, `#000` at 0.35, static plane at its feet, z −5.9)
  — no AO needed. Cheap, big anchoring win (nothing in either stage has contact shadows).

### 6. The sieve gap has no grate
- **What**: the fiction says "containment grate passes small things"; the HUD text says
  "too big for the gap"; the art shows an empty dark opening (`rv-s2-wall.png`). The rule
  is enforced invisibly.
- **Fix**: draw 3–4 vertical bars in the gate texture's lower 30px (`gateTexture` — the
  gap region), rust-dark with a lit edge, spaced ~8px. Purely paint; the sieve clamp
  already does the physics. Instantly explains both "small fits" and "big does not".

---

## P2 — Juice (events with no visual event)

### 7. Slow-mo has zero visual treatment
- **What**: `slowmo` scales time and audio (`voice.setSlowmo`) — the screen does not
  change at all. The game's signature moment (release at speed, aim in the air) is visually
  identical to normal time.
- **Fix (WebGL-safe, no color grading)**: (a) DOM vignette veil like `warpVeil` — radial
  gradient, transparent centre → rgba(6,10,16,0.35) edges, opacity = `state.slowmo`,
  z-index below HUD; (b) ortho zoom-in 4%: scale the camera frustum by
  `1 - 0.04 * state.slowmo` (the rig owns the camera); (c) widen the fireflies/motes drift
  scale by the same factor so the world visibly thickens. ~30 lines total.

### 8. The press slams with no impact
- **What**: The new winch-hang-drop profile (1.87s/1.03s/0.50s, harness-verified; visual
  capture still pending — Studio crashed before the corridor recording) accelerates into
  the floor and lands silently: no dust, no shake, no sound hook. `this.shake` exists but
  only fires on the heavy button (0.35).
- **Fix**: in `tickWarp`-adjacent frame code where crushers update (rig ~3025), detect the
  slam frame: `crusher.at` reaching `travel` (prev < travel-2 && now >= travel-1). On slam:
  `this.burst(cx, floorY, '#6b7a6b', 10, 200)` both sides of the head, `this.shake =
  Math.max(this.shake, 0.22)`, and a `voice` thud if a suitable cue exists. The fear the
  drop earns needs the punctuation the landing pays.

### 9. Latch grip has no impact frame
- **What**: the moment the tendril takes hold (justGripped) — nothing marks it. The ring
  is a hover/target affordance, not a grip event.
- **Fix**: on `state.justGripped`, flash the latch ring: scale 1.35 → 1.0 over ~8 frames
  and double its opacity for the first 3 (ring node scale, not material). Plus a 6-particle
  burst at the grip point in `#d8f26a`. Sells the "clunk" the physics already makes.

### 10. Portal is static until the warp
- **What**: `portalPhase` only advances during `tickWarp`; at idle the exit is a still
  image. The one object that means "goal" doesn't breathe.
- **Fix**: advance `portalPhase += dt * 0.8` every frame (slow idle churn), and add ±2px
  sinusoidal bob to the halo. The existing texture-swap machinery on `portalPhase` does
  the rest. Idle churn also differentiates it from decor.

### 11. Trail confirmed good — one nit
- The smear reads, colour-matched (`#89b040` vs body `#9fb867` family). Nit: on the
  START ledge it can look like paint because deposits have no fade-in; give a fresh
  deposit 2 frames of scale-up (r from 0.6→1.0). Cosmetic, low priority.

---

## P3 — Atmosphere / environment

### 12. Stage 2's left half is empty
- **What**: `rv-s2-spawn/wall.png` — left third is a flat teal gradient with one lantern.
  Stage 1's backdrop is layered (city shapes, dome, rays); stage 2's `pipeStackTexture`
  backdrop covers the right/centre but the west end has no mid-ground silhouette at all.
- **Fix**: add one more `forestLayer`/silhouette pass to the stack theme west of x≈400:
  2–3 tall pipe/tank silhouettes at z −40, `hazeFar`-tinted, 40% opacity. Or simply extend
  the existing pipe-stack texture leftward with sparser columns. One texture, one plane.

### 13. Stage 2 is darker with dimmer accents — by measurement
- **What**: medians 23 vs 32, p90 43 vs 57 (stage 2 vs 1). Colder is correct per the
  bible; *dimmer accents* is not — the cold stage needs its lights to work harder, not
  softer.
- **Fix**: in THEME_STACK, raise `lampWarm/lampCore` keep-values slightly (or add +10%
  gain to lantern sprites in the stack theme only), and add 2–3 more fireflies per
  lantern in stage 2 (`moteTexture` swarm counts). Do NOT raise base exposure — the dark
  is the mood; the accents are the guide.
- **Note**: bloom (item 2) partially solves this for free; re-measure after.

### 14. Dead-tree silhouette repetition
- **What**: two near-identical forked trees mid-frame in stage 2 (`rv-s2-wall.png`) —
  `deadTreeTexture(deadtree-${i})` seeds differ but the branch algorithm converges on the
  same silhouette.
- **Fix**: in `deadTreeTexture`, vary trunk lean (±8°), branch count (3–5), and first-fork
  height (0.3–0.6 of height) from the rng BEFORE drawing; currently only jitter within a
  fixed skeleton. Also mirror alternate instances (`scale.x = -1` per index parity in the
  placement loop).

### 15. Ceiling texture reads as floor-dirt upside down
- **What**: stage 2's ceiling band uses the same round-clod dirt as walked ground; hanging
  clods read wrong (`rv-s2-spawn.png` top).
- **Fix**: walls/ceiling of the shell should take `wallTexture` (already the case for
  `isWall` tiles — but the ceiling tile is 1280×60, fails the `t.h > t.w * 1.6` wall test
  and gets dirt). Exact: special-case `t.y <= 0` tiles to the wall map in `buildLevel`, or
  make the test `isWall || isCeiling`.

### 16. Stage 1 portal is tucked against the boundary wall
- **What**: portal centre x=1222, wall at 1260 — the halo (300px plane) clips into the
  wall column; the arch sits flush against the frame edge (`rv-swing.png` right edge).
  Arrival at the level's goal is cramped into a corner.
- **Fix options** (pick at layout review): nudge `exit` to x≈1205 (allowed: shelf spans
  1185..1260, body arrives from the west) and shrink the halo to 240px; or accept and
  crop the halo plane so it doesn't overlap the wall. Small but the ending deserves the
  frame.

### 17. God rays: stage 1 only
- **What**: `godRayTexture` shows in stage 1's canopy; the stage 2 traverse shows none.
  The shaft has hanging lanterns — light sources with no atmosphere response.
- **Fix**: two narrow ray planes under the two highest lanterns in the shaft (reuse
  godRayTexture, 30% opacity, additive OFF — normal blend per the fog lesson). Cheap
  depth.

### 18. Wake-plate chevron floats
- **What**: the orange chevron above buttons bobs in mid-air with no tether
  (`rv-farchamber.png`); reads as a pickup rather than a pointer.
- **Fix**: fade chevron opacity with player distance (full within 300px, gone past 600)
  so it acts as a nearby hint, not a permanent floating object; and drop it 6px closer to
  the plate.

---

## P4 — Smaller notes (sweep when touching those files)
- **HUD**: overlaps Studio's FPS meter at top-left in captures — production-irrelevant,
  but move the window 8px down for clean marketing captures.
- **Acid**: not visually confirmed this pass (no pit fall in the runs). Schedule a fall
  capture; check the bubbles animate and the glow blooms once item 2 lands.
- **Burst palette**: all bursts are single-colour; two-tone (core + darker fringe
  particles 50/50) reads richer for zero cost. `burst()` takes one colour — add optional
  second.
- **Recall (Q)**: absorb has burst ticks; verify the CHEVRONS over distant lumps also
  pulse while Q is held (they should breathe to say "coming home").
- **Sporeling hit**: standUp handles the player; the CREATURE only turns around. Give it
  a 0.3s squash (scale y 0.7) on `critter.wait = critterStun` entry — sells the collision
  both ways.
- **Press capture**: still owed — one full cycle at 10fps once Studio is stable, to
  verify the winch/hang/drop profile reads and tune slam juice (item 8).

## Suggested order of work
1. Item 1+2 together (post parity + bloom) — one block in mount/unmount, then re-capture
   both stages and re-judge 13/17 (they may shrink).
2. Item 3 (dots) + 7 (slow-mo) — the aiming loop, biggest feel win.
3. Item 4 (red growth) + 6 (sieve grate) — puzzle legibility.
4. Item 8+9 (press slam, grip flash) — impact juice.
5. P3 environment sweep in one pass (12, 14, 15, 17, 18, 16).
6. P4 sweep opportunistically.
