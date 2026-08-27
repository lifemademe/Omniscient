# OMNISCIENT_ — ART MASTER

**The one document an agent reads before touching anything visual.** It holds three things and
they have different lifetimes:

| Part | What it is | Who changes it |
| --- | --- | --- |
| §1–§11 **THE DIRECTION** | What the game looks like and why. Stable. | A human, deliberately |
| §12 **THE LOOP** | How work gets done and judged. A procedure. | Rarely |
| §13 **THE LEDGER** | What is done, to what standard, proved how. | Every agent, every pass |

It sits above the two existing documents rather than replacing them.
[ART_DIRECTION.md](ART_DIRECTION.md) owns the console's certainty scale and colour law;
[M4SS-ART-BIBLE.md](M4SS-ART-BIBLE.md) owns the sidescroller's palette and stage identities.
Both remain authoritative in their own scope. Where this document disagrees with either, it
says so by name in §3, and the reason is written down.

---

## 0. How to use this — for Claude, for Codex, for anyone

You are picking this up mid-flight. Somebody else was here yesterday.

**Read in this order:** §3 (the five laws) → §13 (the ledger) → the one surface section for
the item you are taking → §12 (the loop) → §15 (the toolbox). Nothing else. §4–§11 are
reference, not a reading list.

**§15 is not optional.** Nearly forty tools already exist. Most mistakes this project has
made were caught by one of them, and several were made twice because somebody did not know
it was there. Check §15 before writing a script.

**Then:**

1. **Take the top item in the ledger whose status is `OPEN` and whose blockers are clear.**
   Do not invent an item. If you believe one is missing, add it to the ledger with status
   `OPEN` and a one-line reason, and take a different one this pass.
2. **Set it to `IN LOOP`, with your name and the date.** This is the lock. If you see an item
   already `IN LOOP` and dated more than a day ago, it was abandoned — take it and say so.
3. **Run the gauntlet loop in §12.** Not a fixed number of rounds. Until the critic stops
   finding a gap, or until you are out of budget.
4. **Update the ledger with evidence.** A status of `AT BAR` without a capture path and a
   commit hash is not a status, it is a claim. See §13's evidence rule.
5. **Commit.** One item per commit where possible. The commit message says what moved and
   what proved it.

**The handoff contract, in one line:** anybody reading the ledger must be able to tell what is
finished, what "finished" meant, and what to do next — without reading a transcript.

### Two standing rules for agents

**Never mark your own work `AT BAR` from memory.** You wrote it; you remember why every
decision was reasonable. Re-open the artifact, capture it, compare it to the bar. This is the
whole of §12 and the most common way this document will be violated.

**A green harness is not a bar.** Harnesses in this project have reported green while a scan
could never succeed, a bridge was invisible, a sporeling walked on air, and a live credential
sat in a tracked file. They prove a rule, not a look. Visual items are closed on captures.

---

## 1. The direction, in one sentence

> **A machine's reconstruction of places it has never been, lit like a memory and rendered
> like a signal — and one specimen, in a real room, lit like a photograph.**

Everything follows from the split in that sentence. The console **infers**; M4SS is a **feed**.
The two halves of this game are not the same picture and must never be graded as if they were.

### What is changing from today, and why

Four changes. Each is a decision, not a preference, and each is in the ledger.

**1. The pixel grid becomes a diegetic register, not a global filter.**
Today `retro.pixel` is on nearly everything at 2.4–3, and it has already cost legibility twice
(the menu plates, the dead-growth ember). The rule from here: **the grid means "you are looking
through the machine."** Dioramas — the machine's reconstruction — keep it. M4SS, which is a
literal video feed, keeps it and gets more of it. The **CRT face keeps its own** (it already
does). The **main menu plates are exempt** (already done). And the warehouse drone feed keeps
it at the feed's own value. Anything that is not a signal does not get a grid.

**2. Shadows go from "policy exists, four call sites" to a lit-space budget.**
`art/shadows.ts` is right and under-used: four callers across eight dioramas. Contact shadow is
the single largest available gain in perceived quality per unit of work in this project, and
SSAO is already carrying it alone. See §5.

**3. Colour grading moves from "impossible" to "authored in the palette, per surface."**
The engine's grading effect is a no-op on WebGL and that is not changing. So the grade is the
palette plus the lights plus the retro pass's `saturation`/`tint`, and it must be **authored
per surface as a named look** rather than drifting per room. See §7.

**4. Juice becomes a named budget with a floor, not a per-feature afterthought.**
The review scores feel at 5 and it is the cheapest score in the game to move. §9 gives every
verb a required response on three channels — image, motion, sound — and the ledger tracks the
verbs, not the features.

---

## 2. The state of play — audited, with the stale claims corrected

Read this before believing GAME-REVIEW.md, which is now partly out of date.

### What is actually mounted (verified in source, August 2026)

| Effect | Status | Notes |
| --- | --- | --- |
| **Bloom** | ✅ live | Engine effect, reconfigured per context (`configureEffect`) |
| **SSAO** | ✅ live | Screen space; unaffected by the 60-unit world. Currently doing all the contact darkening |
| **Retro pass** (custom) | ✅ live | Pixelation, vignette, aberration, scanline, grille, roll, flicker. Five named looks: `world`, `warehouseCel`, `warehouseFeed`, `console`, `machine` |
| **Paint pass** (custom) | ✅ live | Cel/outline. `PAINT_LOOKS`, per-view |
| **Shadow maps** | ⚠️ partial | `art/shadows.ts` policy exists; **four** call sites |
| Colour grading | ❌ no-op on WebGL | `createWebGLEffect` returns an empty list. Grade in palette + lights |
| Depth of field | ❌ WebGPU only | |
| Engine Pixelation / Retro | ❌ WebGPU only | The custom pass is the only pixelation that reaches a frame |
| SSR | ❌ WebGPU only | |

**Do not spend another pass discovering this.** §231 of the original spec said post-processing
was WebGPU-only, that was wrong, and the correction cost a whole art pass. The table above is
the truth; if you find it wrong, fix the table in the same commit.

### Stale claims in GAME-REVIEW.md

- *"M4SS is fully SILENT"* — **false now.** `src/m4ss/SlimeAudio.ts` is 278 lines and the rig
  makes 12 `play()` calls. The audio axis needs re-scoring.
- *"no music"* — `audio/AdaptiveScore.ts` exists with ten declared states.
- *"no save, no ending"* — both shipped (`session/persistence.ts`, the ending beat).

### The honest scores, restated for art purposes

| Surface | Where it is | The gap in one line |
| --- | --- | --- |
| Console / workstation | Strong, coherent | Static. It never moves, breathes, or reacts |
| Contact dioramas | Strong writing, uneven light | Eight rooms, one lighting recipe |
| Warehouse 07 | Dense, industrially convincing | Reads flat: no key light, no depth cueing, everything the same distance |
| M4SS | Best-realised surface | Two stages polished, stage three grey-boxed |
| Transitions | Functional | Warp and handoff exist; nothing else in the game has a transition |
| Juice | Thin | The swing feels good. Almost nothing else answers |

---

## 3. The five laws

These override taste, including mine. Any pass that breaks one is wrong even if it looks
better in a still.

### Law 1 — Value before colour, always

Every frame must read in greyscale before it is allowed to be a colour. The subject is the
brightest or the darkest thing in frame and there is no third option. M4SS's bible already
states this as non-negotiable; it now applies to the warehouse and the dioramas too.

**Test:** desaturate the capture. If you cannot point at the subject in under a second, the
frame fails and no amount of hue fixes it.

### Law 2 — One light tells the story; everything else is fill

Per frame, one source is doing the work and is allowed to be a value or two brighter than
anything else. A room lit evenly is a room with nothing in it. This is the single biggest
delta between the workstation frame (which does this) and Warehouse 07 (which does not).

### Law 3 — Nothing is uniform: rhythm at three scales

Silhouette, mid-detail, texture. If a surface is regular at all three scales it reads as a
render, not a place. The racking, the aisles, the rack stock and the floor markings are all
currently regular at two of the three.

### Law 4 — A machine's picture is allowed to fail; a photograph is not

Missing data in the console is a *feature* — the certainty scale in ART_DIRECTION.md is the
best idea in this project's art and it is under-used. But M4SS and the warehouse feed are
CAPTURED, not inferred: they may be noisy, compressed, or dark, and they may not be *absent*.

### Law 5 — If the player must act on it, it is not allowed to be subtle

Twice this month a mechanic was invisible: the dead-growth ember at 4×3 px, and the intake
beacon as a lit surface in a lit room. Anything load-bearing is exempt from the atmosphere
budget. Atmosphere pays for itself out of everything else.

---

## 4. The surfaces

Each surface gets: **the intent**, **the bar** (the concrete comparable the critic holds it
against — see §12), and **the specific gaps** known today.

### 4.1 The workstation — Keller's room

**Intent.** A cold room with one warm corner. The machine is the only green light in a brown
room. A person works here; the wall above the desk is a working surface, not decoration.

**The bar.** The **workstation concept frame** already referenced in `art/palette.ts` §230 —
"the warm pool of lamp light falling on one corner of a cold room". That frame is the bar and
it is in the repo. Secondary reference for *restraint*: SIGNALIS' interiors — a small number of
values, hard falloff, no ambient wash.

**Known gaps.**
- The room is static. There is no air: no dust in the lamp cone, no flicker, no settle.
- One lamp casts (`castShadows`, mapSize 1024). The rest of the room has no shadow story, so
  everything past the desk floats on SSAO alone.
- The CRT is the only thing that changes state. The desk does not respond to the story.
- No time-of-day movement across nine missions. The room should age.

### 4.2 The CRT, the globe, the knowledge tree

**Intent.** The one surface that is honestly a raster display. It keeps its own pixels — see
`retroShader`'s note on why the grid does not touch it — and its content is authored at
192×144 in a 3×5 font. This is the most confident thing in the game. Protect it.

**The bar.** Itself, at its best: the knowledge tree at full growth. Secondary: the phosphor
behaviour of a real P1 tube — bloom on the bright, smear on motion, not a scanline overlay.

**Known gaps.**
- The globe's signals are points. They do not have weather, and the anomaly does not feel
  different in kind from a request.
- Nothing on the tube has persistence-of-phosphor: state changes are instant swaps.
- The tube is never *seen* as an object in a lit room except in the menu.

---

### 4.3 The contact dioramas — eight rooms

**Intent.** A machine's reconstruction of a place from a voice and a data feed. Not a
photograph: a **model**, lit like a memory. The certainty scale in ART_DIRECTION.md is how the
reconstruction admits what it does not know, and it is this game's best original idea.

**The bar.** ART_DIRECTION.md §1's tier ladder, *rendered* — a frame in which the player can
point at what the machine is sure of and what it is guessing. Secondary reference for diorama
staging and light: Lumino City and Moss — a small world lit from outside its own edges, with
depth cued by falloff rather than fog.

**Known gaps.**
- **Eight rooms, one lighting recipe.** The cellar, the beacon, the night door and the shop
  should not share a key direction, a key colour or a falloff. Today they broadly do.
- The certainty scale is expressed in geometry and opacity but almost never in **light**.
  Tier 1 (SUSPECTED) should be lit differently from Tier 4 (KNOWN), not just built differently.
- The three lighting beats added in F10 (cellar / beacon / threshold) are the only lighting in
  the game that moves with the story. **They have never been seen on screen.** They are the
  proof-of-concept for the whole idea and are sitting unverified.
- No room has a second read. Nothing rewards looking twice after the mission resolves.

### 4.4 Warehouse 07

**Intent.** A remote logistics annex at night, seen down a drone link. Sodium and skylight,
wet concrete, and a building far too big for the light in it. The player is a camera operator
who cannot smell the place.

**The bar.** Reference photography of real distribution centres at night — high-bay sodium
pools with black between them, not an evenly lit hall. Secondary for silhouette clarity at
distance: INSIDE. Secondary for readable industrial density: the racking studies already in
`WAREHOUSE_07_IMPLEMENTATION_PLAN.md`.

**Known gaps — this is the surface with the most to gain.**
- **No key light.** The room is lit approximately evenly, which breaks Law 2 outright. High
  bays should read as discrete pools with real darkness between them.
- **No depth cueing.** A rack 40 m away is the same value and saturation as a rack 4 m away.
  The haze exists but is doing almost nothing.
- **Everything is the same age.** Rhythm at the mid scale is missing (Law 3): the racking, the
  bays and the floor markings are all regular.
- The drone has no lamp of its own, so it never lights what it approaches, and the feed never
  gets the one thing a drone feed always has: a moving light source in a static room.
- The cel/outline pass (`warehouseCel`) is doing a lot of the identity. Verify it is a choice
  rather than a mask over flat lighting.

### 4.5 M4SS

**Intent.** Owned by [M4SS-ART-BIBLE.md](M4SS-ART-BIBLE.md). Do not re-litigate its five
principles or its colour script; they were earned over 23 measured passes.

**The bar.** The bible's §2 reference sheet, which already states per-image what each reference
does that we do not.

**Known gaps.**
- **Stage 3 (`sluice.ts`) is grey-boxed.** It has a theme (`THEME_SLUICE`), a column, a
  bulkhead and a beacon, and no art pass at all. It is the largest single art item in the game.
- The Sluice's identity is asserted in the palette and nowhere in the geometry: it is the
  Stack's shapes with a different ramp.
- The dead-growth ember was invisible for a month (Law 5). Audit every other mechanic-carrying
  visual in M4SS for the same fault before adding anything new.

### 4.6 Transitions, cinematics, and the seams

**Intent.** This game has more *state changes* than most: menu → boot → globe → contact →
mission → M4SS → back. Each seam is a chance to say something and today most of them cut.

**The bar.** The warp (`playWarp`) and the M4SS handoff at their best — they exist and they
work. Everything else should be held against them.

**Known gaps.**
- Contact → globe is a camera move. Globe → contact is a camera move. Neither has a signature.
- The ending exists and has never been art-directed.
- No mission has an establishing beat that is *composed* rather than framed.
- Nothing in the game has a hold. Every transition is the same duration family.

### 4.7 The people — replacing the Tripo GLBs with procedural characters

**This is the largest art item in the game and it is a direction change, not a cleanup.**

### Where this stands today

Three character systems coexist and only one of them is on screen for the contacts:

| System | What it is | Used by |
| --- | --- | --- |
| **Tripo GLBs** | 9 photograph-derived skinned meshes: Adaeze, Dorin, Ileana, Lucian, Mirela, Sanda, Tomas, Vasile, Stalker | Every rigged contact, via `view/riggedContact.ts` → `placeRigged` |
| **`geometry/character.ts`** | Procedural people from chamfered slabs. Static poses, silhouette-first, no skeleton | Background figures in `view/scenes.ts` |
| **`experimental/mirela-procedural/`** | A **skinned** procedural character: real `THREE.Skeleton`, 18 bones, `SkinnedMesh`, `setPose`, `updateIdle`, and a capture harness | Nothing shipped. It is the prototype |

`GAUNTLET_v4.9` §323/§329 records that the ImageGen + img2threejs pipeline was never
installed and that direct procedural Three.js is the sanctioned fallback. The Mirela prototype
**is** that fallback, already built and already reviewed against `Mirela.glb`.

### Why replace them at all

Not for novelty. Four concrete reasons, in order of weight:

1. **The lighting is baked into the texture.** `art/debake.ts` exists specifically because
   "every character in this project comes out of Tripo, and [the lighting is] in the TEXTURE."
   A character carrying its own baked key light cannot be lit by a room. Every diorama in §4.3
   is about to get its own key (§5, D-1/D-4) and the GLBs will fight all eight of them.
2. **They are the only realistic objects in a stylised game.** `geometry/character.ts`'s header
   already argues this: a procedural human reaching for realism lands in uncanny territory
   immediately. The rooms are chamfered slabs and painted ramps; the people are twenty thousand
   smooth photogrammetric verts. They are from a different game.
3. **They cannot be authored.** A Tripo mesh is a black box: no ramps, no value control, no
   per-tier certainty, no way to express §11's rule that a mechanic may not be carried by hue.
4. **Cost.** 9 GLBs is the largest single chunk of the download and none of it is reusable.

### The intent

> **People built the way the rooms are built: big exaggerated masses, silhouette first, lit by
> the room they are standing in and by nothing else.**

Not "low-poly humans". The existing header has the right idea and the wrong scale of ambition —
`character.ts` makes figures that stand convincingly and never move; the prototype makes one
that is skinned and can. Merge those: **the slab language of `character.ts`, on the skeleton of
`mirela-procedural`.**

### The bar

**`Mirela.glb`, in the room, at the shot the mission actually uses.** Not a turntable — the
framing the player sees. The procedural character wins when a critic with fresh context cannot
say which is which at that framing, *or* prefers the procedural one because it is lit by the
room. `MirelaProceduralTestRig` already renders both side by side and captures passes; that
harness is the loop's instrument and it exists.

Secondary bar for the *language*: the game's own props. A person should look like they were
made in the same workshop as the chair, the desk lamp and the CRT.

### Animation — settled, with three traps

The engine has a full retargeting stack: `.engine/src/animation/` — `SkeletonProfile`,
`retargetAnimationClip`, `RetargetingSession`, `applyTPose`. It is **role-based**, so a
procedural rig does not need Mixamo's names or its 66 bones. A `SkeletonProfile` is a
`boneToRole` map plus a hip bone name. Roughly seventeen lines.

The traps, all verified:

1. **`mirela-leftShoulder` is the UPPER ARM, not the clavicle.** Its chain is
   `leftShoulder → leftElbow → leftWrist`. It maps to `BoneRole.LeftUpperArm`. Mixamo's
   `LeftShoulder` *is* the collarbone and `LeftArm` is the upper arm — map by name similarity
   and every arm swing lands on a bone that does not exist, so the arms barely move and the
   chest shears.
2. **The rest pose is an A-pose.** `leftElbow.position` is `(0.16 × upperArm, −0.98 × upperArm)`
   — arms down and slightly out. Mixamo authors against a T-pose. Without `forceTPose: true`
   every limb is rotated by the difference.
3. **Unmapped roles are silently dropped.** No clavicles, no toes, no fingers, no UpperChest in
   the 18-bone rig. For the conversational clips this project actually ships — nod, point,
   react, slump, dread — that costs a shoulder shrug and nothing else. For anything with a walk
   in it, the missing toe roll reads as skating. **Add a toe bone before attempting locomotion.**

The clips are already proven: `Crouch Idle.fbx` carries 66 `mixamorig:` bones, `riggedContact.ts`
already handles GLTFLoader stripping the colon (`boneKey()`), and the contacts play them today.
This is pointing an existing pipeline at a different skeleton, not building one.

### Staged programme

Each stage is a gauntlet item with its own bar. **Do not skip to stage 3.**

| Stage | What | Done when |
| --- | --- | --- |
| **P-C1** | One character, one framing. Take the Mirela prototype to the bar in her own scene's shot | A fresh critic cannot pick the GLB out at that framing |
| **P-C2** | The `SkeletonProfile` + one Mixamo clip retargeted onto her | `nod` plays and reads as a nod, with `forceTPose` correct |
| **P-C3** | Parameterise: the spec drives 9 people, not 1 | Nine silhouettes distinguishable in black at thumbnail size |
| **P-C4** | Swap Mirela in the shipped scene, GLB kept beside her as the reference | The mission plays; nobody notices except that she is lit by the cellar |
| **P-C5** | Roll out the remaining 8, one per pass, each against its own GLB | Each passes its own bar |
| **P-C6** | Delete the GLBs, `debake.ts`, and the Tripo-specific paths | Build shrinks; nothing regresses |

### Known blockers and rules

- **Warehouse first, or not at all.** `placeRigged` draws nothing in Warehouse 07 — a bare
  `ModelMeshNode` does. If procedural characters are meant to appear there, that is a separate
  investigation and it belongs *before* P-C5, not after.
- **Keep `character.ts` for crowds.** Static slab figures are correct for background people and
  cost nothing. This programme replaces the nine *named* characters, not everyone in the game.
- **Do not delete a GLB until its replacement is `AT BAR`.** The GLB is the bar. P-C6 is the
  only stage allowed to remove one.
- **§185's brief still governs the generator:** vary head shape, shoulder width, torso mass,
  limb proportions, posture, hand/foot scale, asymmetry — within animation-safe limits. A
  generator where every NPC is the same mannequin in new clothes has failed even if each one
  passes its own bar.

---

## 5. Lighting doctrine

**One key, one fill, one rim — per frame, not per room.** If a room is used from three camera
positions it has three lighting states, and they are allowed to be authored separately. The
engine cost of a light that is off is zero.

**The shadow budget.** `art/shadows.ts` is a policy — lit materials cast and receive, unlit do
neither — and it currently has four callers. The rule from here:

- **Every diorama gets exactly one shadow-casting light: its key.** One 1024 map per room,
  turned on when the room mounts and off when it unmounts.
- **The warehouse gets none.** Sixty units will not fit a directional map and the high bays are
  too many to cast. It gets SSAO plus **authored dark**: painted-in floor darkening under
  racking, which is cheaper and more controllable than a shadow map at that scale.
- **M4SS gets none.** It is 2D; its depth comes from the parallax layers and the value ladder.

**Falloff is the depth cue, not fog.** Distance haze flattens. Falloff separates. Prefer a
light that runs out to a fog that fills in.

**Every practical must be a light *and* an object.** The warehouse's lamps were once mounted
to nothing and it read instantly as broken. A glow with no fitting is the single most reliable
way to make a room look unfinished.

**Colour temperature carries meaning, and it is already half-authored:**

| Register | Temperature | Means |
| --- | --- | --- |
| The lamp on the desk | Warm amber | A person is here |
| The machine | Green phosphor | The machine is thinking |
| The sea, the night, the cold half | Blue-teal | Outside, or unreachable |
| Sodium in the warehouse | Olive-gold | Industry, indifferent, always on |
| Alarm | Red — used **once** | Something has gone wrong that a person must answer |

Red is a budget of one. If two things in a frame are red, one of them is decoration.

---

## 6. Post-processing — the real stack

The table in §2 is the truth. This is what to do with it.

**Bloom.** Currently reconfigured per context. It should be *tuned to the brightest legitimate
thing in each surface*, not to a global taste. The failure mode already seen twice in this
project: amber emissives clip to a white chip. Bloom's threshold is what stops that; raise the
threshold before lowering an emissive.

**SSAO.** Doing all the contact darkening. Keep it, and stop asking it to do a key light's job.
Its radius should differ per surface — a desk and a 60 m warehouse cannot share one.

**The retro pass.** Five looks. Per §1's change, `pixel` is now a *register*:

| Look | Pixel | Means |
| --- | --- | --- |
| `console` | grid on | You are looking at the machine's reconstruction |
| `machine` | grid on, more | Deep in the machine |
| `warehouseFeed` | grid on | A remote video link, with a link's artefacts |
| `warehouseCel` | grid on | (verify — see §4.4) |
| `world` | grid on at 2.4 | The dioramas |
| *(exempt)* | CRT face, menu plates | These are already raster, or must be read |

Scanline, grille, roll and flicker are all at zero and should stay there **except** on
`warehouseFeed`, where a link ought to show evidence of being a link. That is the one place in
the game where a transmission artefact is honest rather than decorative.

**The paint pass.** Cel + outline. Audit whether it is carrying the warehouse's identity or
covering for its lighting (§4.4). An outline pass over correctly lit geometry is a style; over
flat geometry it is a patch.

**What to add, in order of value per hour:**
1. **A vignette per surface**, authored — not the current single low value.
2. **Chromatic aberration on the warehouse feed only**, small, at the frame edge. It is a lens.
3. **A grain that is a signal artefact, not film grain** — on the feed, gated by link quality.
4. **A hold-frame / dropout on the feed** when the link is stressed. Free drama, one uniform.

**What not to add.** Depth of field (WebGPU-only), SSR (WebGPU-only), engine colour grading
(no-op). Do not spend a pass rediscovering these.

---

## 7. Colour and the grade

There is no grading effect on WebGL. The grade is therefore three things, and they must be
authored together:

1. **The palette** (`PAL`, per-stage via `setStageTheme`) — the base ramp.
2. **The lights** — key colour and intensity per frame.
3. **The retro pass's `saturation` and `tint`** — the only true post-stage colour control.

**The rule: a surface gets a named look, and rooms inside it do not drift.** M4SS already does
this properly (`THEME_GALLERY`, `THEME_STACK`, `THEME_SLUICE`). The dioramas do not, and should:
eight rooms, eight named looks, each declared in one place.

**Ramps, not values.** A painted tile sheet has eight to ten values per material; this project
had three or four before `ramp()` was introduced. Any new material that ships with three values
is unfinished.

**Dark values survive ACES; bright ones do not.** Exposure is 0.5 and ACES crushes highlights.
Author dark and let bloom lift, never the reverse. This is why the lamp colours clip.

---

## 8. Camera and cinematics

**Every camera is a decision about what the player is allowed to feel.**

- **Dioramas:** the machine is composing a picture from a feed. Slight, constant, imperfect
  motion — a fraction of a degree of drift — sells "reconstruction" more than any shader.
- **Warehouse:** two cameras exist (drone, CCTV) and they should not share a lens. The drone
  is a wide, close, mobile lens with aberration; CCTV is long, high, and clean.
- **M4SS:** a narrow lens a long way back (12°), Y-only. Do not add horizontal scroll. Ever.
- **Contact:** the shot per beat is authored and this works. Extend it — a mission with one
  camera position is a mission the machine did not care about.

**Cinematic rules:**
- **Nothing cuts without a reason.** A cut says "somewhere else"; a move says "look here".
- **Every transition needs a hold.** The 0.1 s before a move ends is where the drama is.
- **Never take the camera away during a decision.** Establishing beats happen before or after.

---

## 9. Game feel and juice — the verb budget

The lowest-hanging score in the game. The rule is simple and it is a floor, not a ceiling:

> **Every verb the player performs answers on three channels: image, motion, sound.**
> A verb with fewer than two is unfinished. A verb with zero is a bug.

| Verb | Image | Motion | Sound | Status |
| --- | --- | --- | --- | --- |
| Latch a growth | ring + tendril | rope snap | ✅ | good |
| Release / fling | slow-mo | regroup squash | ✅ | good |
| Split | bar + shed lump | body divides | ✅ | good |
| Ride the column | beam brightens | rise | ❌ | **thin** |
| Press crushed | dust burst | shake 0.22 | ✅ | good |
| Scan (warehouse) | scan flash | — | ✅ | **thin** |
| Grip / clamp cargo | grip pulse | — | ✅ | **thin** |
| Answer a signal | connect | camera | ✅ | good |
| Resolve a mission | verdict | — | ✅ | **thin** |
| Learn a fact | tree grows | — | ? | **thin** |
| Open the menu plate | cable plugs | push 4.5 cm | ✅ | good |

**The three universal juice rules:**
1. **Anticipation beats impact.** The wind-up sells the hit; the hit is confirmation.
2. **Everything that stops should overshoot.** Nothing in a physical world arrives exactly.
3. **Screen shake is a currency.** A press is 0.22; a heavy door is 0.35. If everything shakes,
   nothing does.

---

## 10. Sound, as an image problem

Sound is in this document because it changes what people *see*.

- **Room tone is the cheapest depth cue there is.** `RoomTone` exists. Every surface should
  have one and they should not cross-fade — a cut in tone is a cut in place.
- **The score is adaptive and under-used.** Ten declared states in `AdaptiveScore`. The
  decision already made and worth keeping: **contact conversations stay scoreless.** A human
  voice and its room are the music there.
- **A verb with no sound reads as a bug** even when the visual is correct. See §9.

---

## 11. Accessibility is an art constraint, not a settings panel

The lowest score in the review (3) and it is an *art* failure, not a menu failure: **red versus
green is the load-bearing mechanic of M4SS stage 2**, and roughly one in twelve men cannot see
it. The settings panel has a colourblind note; the mechanic still relies on hue.

**The rule: no mechanic may be carried by hue alone.** A red growth is dark, unlit, and hangs
visibly ajar — that work is done in `bushTexture` and it is exactly right. Every other
hue-carried mechanic in the game must get the same treatment: a *shape* or *value* difference
that survives desaturation.

**Reduced motion is already respected in several passes.** Keep it. Anything that pulses,
shakes or scrolls checks `getAccessibilityPreferences().reducedMotion`.

---

## 12. THE GAUNTLET LOOP

The method this project uses to raise art quality. It is not "iterate until it looks good" —
that is what produced a 4×3-pixel ember and an invisible beacon. It is a specific structure and
the structure is the point.

### 12.1 The shape

```
        ┌────────────────────────────────────────────────────────┐
        │  LEAD                                                  │
        │  goal + THE BAR  ──▶  decompose into judgeable pieces  │
        └───────────────────────────┬────────────────────────────┘
                                    │  one piece each
             ┌──────────────────────┼──────────────────────┐
             ▼                      ▼                      ▼
        ┌─────────┐            ┌─────────┐            ┌─────────┐
        │ BUILDER │            │ BUILDER │            │ BUILDER │
        └────┬────┘            └────┬────┘            └────┬────┘
             │ artifact             │                      │
             ▼                      ▼                      ▼
        ┌─────────┐            ┌─────────┐            ┌─────────┐
        │ CRITIC  │  fresh     │ CRITIC  │            │ CRITIC  │
        │ context │  ◀── BAR   └─────────┘            └─────────┘
        └────┬────┘
             │  "the biggest remaining gap is X"
             └──▶ back to BUILDER ──▶ … until no gap, or budget out
                                    │
                                    ▼
                          ┌───────────────────┐
                          │  SMOOTHING PASS   │  fresh agent, coherence only
                          └───────────────────┘
```

### 12.2 The five rules

**1. THE BAR IS THE MOST IMPORTANT PART.**
"Make it better" is not a bar. A bar is a **thing you can put next to the artifact**: a
reference frame in the repo, a shipped surface of this game at its best, a named commercial
comparable, or a measurement. Every surface in §4 already has one. **If you cannot state the
bar in one line, stop and get one — do not start the loop.**

The best bar available to this project is usually **its own better half**. When stage 3's
first gallery link felt wrong, measuring stage 2's shipped chain (spin 6.0 at both links)
settled in one pass both that g1 was broken *and* that the other three were fine and must be
left alone. Without that bar I would have "improved" all four.

**2. NEVER LET THE BUILDER GRADE ITSELF.**
The builder remembers its reasoning and will rationalise it. The critic gets **fresh context**:
the bar, the artifact, and nothing else. Not the builder's summary. Not the diff. The
**rendered result** — a capture, a measurement, the actual file.

In practice, in this repo, that means: a subagent with no history, handed a screenshot path and
a reference, asked one question.

**3. LET THE AGENT DECOMPOSE.**
Give the goal and the bar. Do not hand down the breakdown. Say: *"break this into the smallest
pieces that can be improved and judged separately."* The decomposition is part of the work.

**4. ONE GAP PER ROUND.**
The critic names **the single biggest remaining gap**, not a list. A list is a to-do; a gap is
a judgement. Lists produce breadth-first mediocrity; one gap per round produces depth.

**5. NO ROUND COUNT.**
Do not say "three rounds". Run until the critic stops finding a gap that matters, or until the
budget is out. Then record which of those two happened — they mean different things in the
ledger (`AT BAR` vs `PAUSED`).

### 12.3 The critic's prompt (use this verbatim)

> You are judging one artifact against one bar. You have not seen how it was made and you do
> not need to.
>
> **The bar:** `<reference — a file path, an image, a shipped surface, or a measurement>`
> **The artifact:** `<capture path, or the exact steps to render it>`
> **The surface's laws:** ART-MASTER.md §3, plus §4.x for this surface.
>
> Do three things, in order:
> 1. Desaturate the artifact mentally and say where the eye goes first. If that is not the
>    subject, that is the gap — stop and report it.
> 2. Put the artifact and the bar side by side. Name what the bar has that the artifact does
>    not. Be specific about *what*, not about *how*.
> 3. Give one verdict: **AT BAR** or **the single biggest remaining gap**, in one sentence.
>
> You may not propose an implementation. You may not list more than one gap. If the artifact
> is better than the bar in some respect, say so and hold it to the bar anyway.

### 12.4 The builder's prompt

> Close exactly one gap: `<the critic's sentence>`.
> The bar is `<reference>`. The laws are ART-MASTER.md §3 and §4.x.
> Do not improve anything else. Do not refactor. When you are done, capture the result to
> `scripts/dev/<item-id>-r<N>.png` and stop.

### 12.5 The smoothing pass

After a wave of separately-improved pieces, a **fresh** agent looks at the whole surface and
asks one question only: *do these read as one place?* It is allowed to change nothing except
what makes them cohere. It is not allowed to improve a piece.

Run one after any wave that touched three or more pieces of a single surface.

### 12.6 Capturing — how a critic actually sees anything

The critic needs a frame, not a description. This project has the tooling already:

| Tool | Use |
| --- | --- |
| `scripts/dev/shot.py` | One still of the game window. Finds the window every time |
| `scripts/dev/record.py NAME [s] [fps]` | Contact sheet + GIF. **The contact sheet is the one that finds bugs** — a transition is easier to judge as a strip than a movie |
| `scripts/dev/drive.py` | Move/click, bounded to the game window, for reaching a state |
| MCP `action_editor(captureScreenshot)` | Editor viewport only — **not** play mode |
| `npx tsx scripts/m4ss-map.ts <stage>` | A whole level as an SVG floor plan |

**Two hard-won rules about capture in this project:**
- **The editor only rebuilds `.dist` while its world is loaded.** `pnpm build` does **not**
  write `.dist`. If you are looking at play mode, exit it once or the capture is of a stale
  build. This has cost four re-reports.
- **A still proves geometry and lighting and nothing about motion.** Anything that transitions,
  pulses, blinks or reveals is judged on a contact sheet.

### 12.7 When the loop does not apply

Do not run a gauntlet on a **rule**. Geometry that must not overlap, a creature that must have
floor under its beat, a credential that must not be tracked — those are harness checks and they
are cheaper and stricter than a critic. The loop is for *look*, *feel* and *composition*, where
there is no assertion that can be written.

---

## 13. THE LEDGER

**This is the handoff.** Update it in the same commit as the work.

### 13.1 Status vocabulary

| Status | Means | Requires |
| --- | --- | --- |
| `OPEN` | Not started | — |
| `IN LOOP` | Somebody is on it right now | Name + date. Stale after 24 h — take it |
| `AT BAR` | A critic said so | **Evidence + commit hash.** See below |
| `PAUSED` | Ran out of budget, not out of gaps | The last gap, written down |
| `BLOCKED` | Needs something else first | The blocker's item ID |
| `DECLINED` | Deliberately not doing it | The reason, in one line |

### 13.2 The evidence rule

> `AT BAR` requires three things or it is not `AT BAR`: **the bar it was held against**, **a
> capture path** (or a measurement), and **the commit hash**.

A status without evidence is a claim, and this project has already shipped four of those: a
scan that could never succeed, a bridge that was solid and invisible, a sporeling walking on
air, and a secrets check that read two directories while claiming the tracked tree. Every one
was green somewhere.

### 13.3 The board

Ordered by value per hour. Take from the top.

| ID | Surface | Item | Bar | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| **W-1** | Warehouse | Key lighting: high bays as discrete pools with real dark between | §4.4 night-DC reference | `OPEN` | |
| **W-2** | Warehouse | Depth cueing — value + saturation falloff with distance | §4.4 | `OPEN` | |
| **W-3** | Warehouse | A lamp on the drone that lights what it approaches | §4.4 | `OPEN` | |
| **W-4** | Warehouse | Mid-scale rhythm: break the regularity of racking/bays/markings | Law 3 | `OPEN` | |
| **W-5** | Warehouse | Audit `warehouseCel` — style or a patch over flat light? | §4.4 | `OPEN` | |
| **M-1** | M4SS | Stage 3 (Sluice) full art pass | M4SS-ART-BIBLE §2 | `OPEN` | Grey-boxed; largest single item |
| **M-2** | M4SS | Sluice identity in GEOMETRY, not only the ramp | Bible §5 thumbnail test | `BLOCKED` by M-1 | |
| **M-3** | M4SS | Audit every mechanic-carrying visual for the ember fault | Law 5 | `OPEN` | |
| **M-4** | M4SS | The column ride answers on sound | §9 | `OPEN` | |
| **D-1** | Dioramas | Eight rooms, eight named lighting looks | §4.3 / §7 | `OPEN` | |
| **D-2** | Dioramas | Certainty expressed in LIGHT, not only geometry | ART_DIRECTION §1 | `OPEN` | |
| **D-3** | Dioramas | Verify the three F10 lighting beats on screen | Themselves | `OPEN` | Never once seen |
| **D-4** | Dioramas | One shadow-casting key per room | §5 | `OPEN` | |
| **C-1** | Workstation | Air: dust in the lamp cone, flicker, settle | §4.1 concept frame | `OPEN` | |
| **C-2** | Workstation | The room ages across nine missions | §4.1 | `OPEN` | |
| **C-3** | CRT | Phosphor persistence on state change | §4.2 | `OPEN` | |
| **C-4** | Globe | The anomaly reads as different in KIND | §4.2 | `OPEN` | |
| **T-1** | Transitions | Contact ↔ globe gets a signature | §4.6 | `OPEN` | |
| **T-2** | Transitions | The ending, art-directed | §4.6 | `OPEN` | |
| **J-1** | Juice | Close every `thin` row in the §9 table | §9 floor | `OPEN` | |
| **J-2** | Juice | Overshoot on everything that stops | §9 rule 2 | `OPEN` | |
| **P-C1** | People | One character to the bar in her own scene's shot | `Mirela.glb` at that framing | `OPEN` | Prototype exists: `experimental/mirela-procedural` |
| **P-C2** | People | `SkeletonProfile` + one Mixamo clip retargeted | The clip reading as itself | `BLOCKED` by P-C1 | Three traps in §4.7 |
| **P-C3** | People | Parameterise the spec: 9 people, not 1 | §185 + thumbnail silhouette test | `BLOCKED` by P-C1 | |
| **P-C4** | People | Swap Mirela into the shipped scene, GLB kept beside her | The mission plays; she is lit by the room | `BLOCKED` by P-C3 | |
| **P-C5** | People | Roll out the remaining 8, one per pass | Each against its own GLB | `BLOCKED` by P-C4 | Warehouse `placeRigged` must be solved first if they go there |
| **P-C6** | People | Delete the GLBs, `debake.ts`, the Tripo paths | Build shrinks, nothing regresses | `BLOCKED` by P-C5 | The only stage allowed to remove a GLB |
| **A-1** | Access | Audit every hue-carried mechanic | §11 | `OPEN` | |
| **P-1** | Post | Per-surface vignette | §6 | `OPEN` | |
| **P-2** | Post | Feed artefacts: aberration, signal grain, dropout | §6 | `OPEN` | |
| **X-1** | Hygiene | `.codex/config.toml` carries a live bearer token in 512 commits | ship-clean | `BLOCKED` — needs a human decision | Rotate + untrack; do not push until resolved |

### 13.4 The log

Append one line per completed item. Newest last. Never edit a previous line.

```
YYYY-MM-DD  ID    agent      status   bar / evidence / commit
----------  ----  ---------  -------  --------------------------------------------
2026-08-26  —     claude     created  ART-MASTER.md written; board seeded, nothing built
```

---

## 14. Scope traps

Refuse these unless a human overrides in writing.

- **New mechanics.** This is an art document. `Crusher.axis:'x'` and `Gate.mode:'bridge'` were
  both added, both fought the level, and both were cut. The sim is finished.
- **Rebuilding art that has already passed a bar.** Check the ledger first.
- **A fourth M4SS stage.** Three is the shape.
- **Any WebGPU-only effect.** DOF, SSR, engine grading, engine retro. Verified absent. §2.
- **A shadow map for the warehouse.** Sixty units will not fit one. Authored dark instead.
- **Horizontal scroll in M4SS.** The camera is Y-only and every reach number depends on it.
- **Replacing the certainty scale or the M4SS colour script.** Both were earned. Extend them.
- **Deleting a Tripo GLB before its replacement is `AT BAR`.** The GLB *is* the bar. Only
  P-C6 removes one, and only after P-C5.
- **Replacing `geometry/character.ts`.** Static slab figures are correct for background
  crowds and cost nothing. §4.7 replaces the nine NAMED characters, not everyone.

---

## 15. THE TOOLBOX — what already exists, and when to reach for it

**Read this before writing a new script.** Nearly forty tools exist. Most of the mistakes this
project has made were caught by one of them, and several were made twice because somebody did
not know it was there.

Run everything from the project root. TypeScript harnesses: `npx tsx scripts/<name>.ts`.
Python tools: `python scripts/dev/<name>.py`.

### 15.1 The gates — run these before any commit

| Tool | Answers |
| --- | --- |
| `ship-clean.ts` | Is this build fit to hand to a judge? Dev routes gated, no `console.log` in `src`, **no credentials in any tracked file** |
| `preview-stuck.ts` | Walks Mission 01 as a player does and proves there is always a way on. Also: every globe signal can be opened, every suggestion chip is understood by its own beat |
| `cues-resolve.ts` | Every cue a mission fires lands on a registered prop, action, shot or light beat |
| `dev-gates.ts` | Nothing that opens the game for testing is reachable in a published build |
| `css-balanced.ts` | Every embedded stylesheet's braces balance |

**The rule that makes these worth having:** a new verb in the cue grammar must be taught to
`cues-resolve` in the same change. A verb the checker does not know is a verb it silently
passes.

### 15.2 Geometry and level proof — before anything renders

| Tool | Answers |
| --- | --- |
| `m4ss-stage.ts` | Is stage one playable? Drives the real `step()` with scripted input |
| `m4ss-shaft.ts` | Does stage two's geometry admit the route it was drawn for? |
| `m4ss-sluice.ts` | Stage three: geometry, the updraft, the route, and the creatures. **56+ checks** |
| `m4ss-map.ts <stage>` | **Draws a whole level as an SVG floor plan.** Tiles, every sweep at its reachable radius, press strokes, creature beats, both gate states, and the camera frame |
| `warehouse-audit.ts` | Does anything pass through anything, or stand on nothing? Has **canaries** that fail loudly if it stops being able to catch either |
| `warehouse-cameras.ts` | Do the fixed cameras show a person? Pitch, standoff, mount height — plus the drone-lens rules |
| `warehouse-addresses.ts` | Can every package be found where the game says it is? Plus: is the worker standing where the objective claims |
| `shop-fittings.ts` `reach.py` | Are wall fittings where the arithmetic says, and can an arm actually reach every authored hand target |

**`m4ss-map.ts` is the single most useful tool in this list and the least obvious.** Fifty-six
green assertions coexisted with two skippable beats; drawing the level showed both in one look.
**Adjacency — what happens to be near what — is the class of fault only a picture catches.**

### 15.3 Headless renders and previews — look without launching

| Tool | Renders |
| --- | --- |
| `preview-globe.ts` | The globe, for visual review without the editor |
| `preview-tree.ts` | The knowledge tree |
| `preview-terminal.ts` | The intervention terminal, to a standalone HTML file |
| `preview-ending.ts` | Holds the ending to its rules before anyone sees it |
| `preview-save.ts` | Does the tape actually hold the game? |
| `preview-car.ts` | Is the car a place, or a diorama? |
| `preview-callback.ts` / `-link.ts` | The callback and §222, proved in data |
| `certainty-tiers.ts` / `suspected-split.ts` | Can every guess the machine draws stop being one; does SUSPECTED draw one box per crate or per shelf |
| `audit-traces.ts` / `-trail.ts` / `-pursuit.ts` | Mission 08's deduction, breadcrumbs and camera chase, proved before a city was built around them |
| `room-tone.ts` | The rule at the top of `RoomTone.ts`, enforced |

### 15.4 Live capture — the critic's eyes

**These are how a gauntlet critic sees anything.** Nothing else in the toolbox can judge a look.

| Tool | Use |
| --- | --- |
| `dev/shot.py [out.png] [waitSeconds]` | One still of the game window. **Asks Windows where the window is every time** — play mode moves it on every restart |
| `dev/record.py NAME [seconds] [fps]` | A **contact sheet** of every frame plus an animated GIF. The sheet is the one that finds bugs: a transition is easier to judge as a strip than as a movie |
| `dev/drive.py move\|click\|hover X Y` | Moves and clicks the real cursor, **bounded to the game window** so a mistyped coordinate cannot press something else |
| `dev/press.py` / `dev/keys.py` / `dev/hold.py` | Send keys at the live window and capture the result. `keys.py` reports what each one did |
| `dev/jump.py` / `dev/intro.py` | Reach a diorama through SceneJump; record the warehouse opening sweep |
| `dev/blackbox.py` / `dev/spin.py` | Rotate the drone camera a full circle and report black frames |
| `dev/bake-sporeling.py` | Bake a Spriterrific spritesheet into a source module |

**Four rules about capture in this project, each learned the expensive way:**

1. **`pnpm build` does NOT write `.dist`.** Only the editor's own bundler does, and it only runs
   while the editor world is loaded. If you are looking at play mode, exit it once — otherwise
   the capture is of a stale build. This has caused four re-reports of already-fixed bugs.
2. **Synthetic clicks reach the game; synthetic keystrokes do not.** `keybd_event` does not land
   in the play window. Verify key bindings another way.
3. **Screen coordinates are 1.5× wrong without `SetProcessDPIAware`.** Every tool above already
   calls it. A new one must too.
4. **A still proves geometry and lighting and nothing about motion.** Anything that transitions,
   pulses, blinks or reveals is judged on a contact sheet.

### 15.5 The editor, over MCP

| Call | Use |
| --- | --- |
| `query_editor(getState)` | **Run before any mutation.** Reports connected / ready / play mode / busy |
| `action_build(buildProject)` | The reliable way to rebuild `.dist`. `pnpm build-project` is not reliable from an agent shell |
| `action_editor(enterPlayMode / exitPlayMode)` | Get in and out of play |
| `action_editor(captureScreenshot)` | **Editor viewport only.** Returns `editor_not_ready` in play mode — use `dev/shot.py` there |
| `query_node` / `action_node` / `action_scene(save)` | Read and mutate scene state; save when the scene changed |

**The editor does not rebuild while its world is unloaded**, which is the mechanism behind rule
1 above. `getState` will tell you which of those you are in.

### 15.6 Writing a new tool — the three rules this project earned

**1. A source-reading check must prove it found something.**
`ship-clean` printed *"no credentials in anything tracked"* for months while reading two
directories and a single file extension. `preview-stuck`'s interception scrape asserts
`intercepted.size >= 2` for exactly this reason. **A scan that silently finds nothing passes
forever.**

**2. Every new check gets a canary before it is trusted.**
Reintroduce the bug, watch the check fail on the right line, put it back. Four checks this
month passed while the fault was still in — including one whose own canary also passed, because
the test placed a hazard at the level's *template* position while the live one had walked away.
**A test that places something by hand must ask the simulation where it actually is.**

**3. Bound the test to the thing, not to a square around it.**
A pendulum sweeps a disc; testing its bounding box reports collisions on four corners the arc
never reaches. That fiction walled off four hundred pixels of level and forced five growths into
a pile. **An over-broad rule gets exempted, and the exemption hides the real case.**
