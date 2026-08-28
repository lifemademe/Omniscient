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

### 0.0 The five surfaces, in plain words

Four names get used throughout this document. They are parts of the game, not parts of the UI,
and two of them are easy to mix up:

| Name here | What it actually is |
| --- | --- |
| **The desk room** | Dana Keller's room — the desk, the CRT, the lamp, the notes on the wall. It is the **main menu**, and it is where you sit between missions. |
| **The contact scenes** | Eight reconstructed 3D rooms behind conversations, plus Dana's station desk for M4SS: the repair shop, beacon mast, seedling tunnel, cleared house, flooded cellar, night door, mill road, wire city, and station desk. You see them **while someone is talking to you**. |
| **Warehouse 07** | The drone level. |
| **M4SS** | The sidescroller — the slime. |
| **The people** | The nine named characters themselves, wherever they appear (§4.7). |

Older text in this repo calls the desk room "the workstation" or "the console", and calls the
contact scenes "the dioramas". Same things.

**One more numbering note.** A § with two digits or fewer (§4.4, §12) is a section of THIS
document. A three-digit one (§185, §231, §329) is from `GAUNTLET_v4.9.md` or a code comment
quoting it — do not go looking for it here.

### 0.1 Before your first pass — read this once

**Three hard stops.**

1. **Do not push.** `.codex/config.toml` is tracked and carries a live bearer token across 512
   commits, on a public repo. `ship-clean` fails on it deliberately (item X-1). Rotation and
   untracking only protect future commits; publishing also requires a sanitised history (or a
   new clean repository). Committing is fine. Pushing is a human decision that has not been made.
2. **Only `pnpm build` and `pnpm lint` may be run.** Never `pnpm dev`, `pnpm test` or
   `pnpm start` — see AGENTS.md. Set the working directory to the project root explicitly.
3. **Never hand-edit `src/auto-imports.ts`.** The build writes it. For scene or node state, use
   the Genesys MCP tools, not the `.genesys-scene` file.

**Getting the game on screen.** The capture tools in §15 are useless until something is
running. The sequence, every time:

```
query_editor(getState)          → connected, ready, not in play mode
action_build(buildProject)      → the ONLY reliable way to refresh .dist
action_editor(enterPlayMode)
python scripts/dev/shot.py out.png 10     → boot screen takes ~8s
python scripts/dev/drive.py click 1280 1100   → dismiss "PRESS ANY KEY"
python scripts/dev/shot.py out.png 6      → the menu
```

`.dist` is written by the editor's bundler, **not** by `pnpm build`, and only while the editor
world is loaded — so exiting play mode once is what picks up your changes. Skipping that step
is why four already-fixed bugs were re-reported.

**Running the loop in your harness.** §12 gives the critic and builder prompts verbatim. How
you spawn a critic with fresh context depends on what you are:
- **Claude Code** — the Agent tool. `subagent_type: "general-purpose"`, one gap per call.
- **Codex** — a separate session or task with only the bar and the capture path in it.
- **Neither** — open a new chat, paste the critic prompt, attach the capture. Slower, valid.

The one thing that is not negotiable: the critic must not have seen the builder's reasoning.

### 0.2 The bars — what exists, and what you must supply

The loop's first rule is that a bar is *a thing you can put next to the artifact*. Here is the
honest state of that, and it is the main reason most of the board cannot start yet:

| Surface | Bar | Openable today? |
| --- | --- | --- |
| **M4SS** | `assets/reference/m4ss/` — Background1.png, Background2.png and 6 more, tracked, and studied image-by-image in M4SS-ART-BIBLE §2 | ✅ **Yes** |
| **The people** | `assets/models/Mirela.glb`, rendered at her own scene's framing beside the procedural version by `MirelaProceduralTestRig` | ✅ **Yes** |
| **The desk room** (main menu) | `assets/reference/desk-room/01-lamp-and-mast.jpg` | ✅ **Yes** |
| **The contact scenes** (9 rooms) | `assets/reference/contact-scenes/` — 2 images | ✅ **Yes** |
| **Warehouse 07** | `assets/reference/warehouse/` — 3 images | ✅ **Yes** |
| **Everything** | `assets/reference/ART-DIRECTION-v1.png` — the master sheet | ✅ **Yes** |

**Every surface now has an openable bar.** Nothing on the board is stalled for want of a
reference. **Read [`assets/reference/NOTES.md`](assets/reference/NOTES.md) first** — it says
what each image is a bar FOR, because several are UI mockups and the interface is not on the
board. `warehouse/03-shape-language-only.jpg` in particular is a bar for shapes and
**emphatically not for lighting**; judging against it would flatten the exact thing being
fixed.

If you are an agent and the surface you are taking has no openable bar, **do not invent one and
do not proceed.** Two moves are allowed:

1. **Use the game's own better half.** A shipped surface at its best is a legitimate bar and it
   is free — it is what settled stage three's chain in one pass (stage two measured spin 6.0 at
   both links, so the other three links were fine and had to be left alone). For the dioramas,
   the strongest existing room is a valid bar for the other seven.
2. **Ask for the image, take a different item, and say so in the ledger.**

**Where to put them.** One folder per surface, any filenames, generated images are fine — the
M4SS ones are:

```
assets/reference/warehouse/        a real distribution centre at night: pools of light,
                                   real darkness between them
assets/reference/desk-room/        a dim room with one warm lamp in a corner
assets/reference/contact-scenes/   the mood for one of the nine rooms
assets/reference/m4ss/             ALREADY DONE - 8 images, and it shows
```

Dropping one reference into a folder and naming it in §4.x is the single highest-value thing a
human can do for this document. It converts a stalled item into a runnable one, and M4SS is the
proof: it is the best-looking surface in the game and it is the only one that had references.

---

## 1. The direction

### The authority is `assets/reference/ART-DIRECTION-v1.png`

**Open it before reading another line of this section.** It is the game's own art direction
sheet and it outranks everything written here. World vision, character line-up, silhouette
rule, three palettes, five lighting moods, props, UI style, theme rules — all in one frame, all
more specific than prose. Where it and this document disagree, **it wins** and this document
gets corrected.

What it settles, that nothing else did:

- **The period.** *A parallel Earth in the 1990s dreamed of the future — advanced, but analog,
  chunky and imperfect.* Stylised low-poly / hand-painted. Arcane × Disco Elysium in tone.
  **Not cyberpunk.** A reference that was pushing the game toward neon-futurism has been
  removed from the folder for exactly this reason.
- **The characters.** *Real people. Imperfect. Expressive.* Strong shapes, easy to read;
  "silhouette exaggeration" is written on the sheet as a rule. This is the answer §4.7 needed
  and it is the one a procedural generator can actually hit.
- **The duality, and it is the best idea in the set.** A warm, messy, imperfect **human world**
  against a cold, vast, orderly **AI realm** — and *"as knowledge grows, boundaries fade."*
  That is an art rule wired to a mechanic. The knowledge tree already grows; nothing in the
  rendering answers it yet. See L-6 in the ledger.
- **Five lighting moods**, named: day, sunset, night + rain, fog, neon night. The game
  currently has one per surface.

### The sentence, restated to fit it

> **A machine's reconstruction of places it has never been, lit like a memory and rendered
> like a signal — and one specimen, in a real room, lit like a photograph.**

Everything follows from the split. The desk room and the contact scenes are the machine
**inferring**; M4SS and the drone link are a **feed**. Two different pictures, never graded as
one. The sheet's human/AI duality is the same divide seen from the fiction's side rather than
the renderer's, and the two should be made to agree — warm and imperfect where a person is,
cold and ordered where the machine is.

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

### 4.3 The contact dioramas — eight reconstructions plus the station desk

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

**The bar.** `assets/reference/m4ss/` — eight tracked images, studied one by one in the
bible's §2, which already states per-image what each reference does that we do not. This is the
only surface in the game with a bar a critic can open without being handed anything.

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

**The sheet has already answered this** (§1): *stylised low-poly / hand-painted, real people,
imperfect, expressive*, with **silhouette exaggeration** written on it as a rule, and a line-up
of eight body types to match against. That is the target, it is not negotiable by a critic, and
it is the one style a procedural generator can actually reach — which is why the photoreal
reference was removed from the folder.

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

**The bar for the LANGUAGE** is `ART-DIRECTION-v1.png`'s character line-up and its silhouette
row — eight bodies that are distinguishable in black. **The bar for the RESULT** is `Mirela.glb`
at her own framing. A character can pass the second and fail the first; both are required.

And the game's own props: a person should look like they were made in the same workshop as
the chair, the desk lamp and the CRT.

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
| **P-C1** | People | One character, one framing, against `Mirela.glb` | §4.7 / the GLB itself | `PAUSED` claude 2026-08-27 | **Three judged rounds. Real gains, and a critic's honest read that it is "not at bar, and not close".** Added the connective forms that were never built: `Mirela-Neck`, `Mirela-Deltoid`, `Mirela-Pelvis`, plus a real wrist taper. Round 1's gap (head/arms/torso adjacent, not connected) was judged CLOSED. **The one thing §4.7 wanted already works — the surfaces take the room's light rather than baking it.** Captures `PC1-r0-both` → `r1-joined` → `r3-wrist` → `r4-hip`. **Read the two structural findings before resuming:** (1) the "flat cut where the trunk meets the legs" that three critics named is the APRON HEM — a 335mm flat box overhanging thighs that have already tapered — not the trunk; (2) twice, a part existed and was smaller than the thing it sits on (hand inside wrist, pelvis inside thighs), which is indistinguishable from a part that was never built and invisible in source. **The remaining distance is not more joins.** Trunk, sleeve, forearm, hand and legs are still separate primitives butted together; closing it means a continuous lofted body, which is its own project |
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

- **Every diorama gets one dominant shadow story per frame.** Normally that is one 1024-map
  key, turned on when the room mounts and off when it unmounts. A small practical may cast as
  well only when it supports the same direction and does not create a competing shadow story.
- **The warehouse already has one and I was wrong about that.** `WarehouseMoon` is a
  DirectionalLight at 1.7 with `castShadow: true` and a 2048 map, aimed (there is a long note
  at its call site about the day it was not). So the cold key and its shadow exist. What does
  not exist is any INTERIOR fitting: no high bays, nothing overhead, nothing that pools. The
  room is a HemisphereLight at 1.8 plus moonlight through skylights, which is why it reads
  evenly lit everywhere. **The high bays get no shadow maps** — too many — they get pools
  plus SSAO plus authored dark under the racking.
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

**Warehouse entry / optical / workers — user-approved implementation, PARTIAL / OPEN QA, Codex 2026-08-28.**
User-directed scope: cancellable staged construction without advancing mission time;
stable landing illumination across optical/chase cuts; explicit Tomas atlas variants;
dark request backing and one feed-local scan instruction. Existing layout, camera
poses, scan eligibility and delivery identities remain the bar. Runtime-only changes.
Implemented staged construction and bounded scene attachment, abort/retry ownership,
cached assets/animation/immutable texture preparation, actual root-scene camera warmup,
stable drone lights and input clearing. Joao/Rui use atlas 2, Maya 3, Arthur 4, Camila original.
Badge/equipment bone attachments use decorative Three meshes to avoid SceneNode teardown.
Live diagnostics caught duplicate begin/end lifecycle calls in the first pass; detached
assembly, single-node attachment and parent-owned removal corrected those warehouse stacks.
Lint now excludes generated `.dist` output so auto-fix never rewrites the editor bundle.
`pnpm lint`, `pnpm build` and editor refresh passed. Fresh rendered-only critic
`warehouse_render_critic`: initial hint too small; enlarged hint is **AT BAR for scoped HUD /
lamp presentation only** in `scripts/dev/warehouse-r2-hint.jpg`. Not a worker-art approval.
Evidence: `scripts/dev/warehouse-r1-preparing.png` (loading card),
`warehouse-r2-cancel-before.jpg` / `warehouse-r2-cancel-after.jpg` (Escape during facility
preparation returns to globe), `warehouse-r2-large.jpg`, `warehouse-r2-optical.jpg` /
`warehouse-r2-optical-release.jpg` (live optical/airframe return), and
`warehouse-r2-preparation-costs.jpg` (console measurements). Captures are 1282x752 and
1708x1020 window captures, not exact 1920x1080/1280x720 acceptance captures.
Measured cold preparation: 25.72s total, 142ms construction CPU, longest construction batch
16.6ms, longest attachment batch 29.8ms, personnel 2.74s, first shader compile 20.06s.
Repeat: 6.67s total, 111ms construction CPU, max attachment 19.5ms, personnel 1.42s.
Camera paint-wait samples ranged 74–1580ms; these include scheduling and are NOT GPU timings.
RMB first/repeat click tool round trips were 83/89ms, with optical and release visibly
rendering, but this is NOT a measured input-to-present guarantee. No multi-second RMB stall
observed. Repeat entry, cancellation and saved movement 02 resume reached gameplay; visitor
CCTV acquisition also worked. Warehouse-filtered live console contained preparation timing
records without the earlier warehouse lifecycle errors; unrelated editor errors remain.
Still OPEN: sustained RMB + UI release/focus loss/denied lock/tight fallback, forced-load
failure/retry, complete delivery scans/docking/pursuit, five worker close-ups and fresh
worker-art judgement, exact-resolution captures and frame-level latency thresholds.
Implementation receipt is recorded in the local commit follow-up. No push.

**Adaeze residual canopy shadow — user-reported correction, AT BAR (scoped), Codex 2026-08-28.**
Bar: `codex-clipboard-b35c620e-1a86-433d-9927-1a8bfbb38dc0.png` without the broad rear-bed
canopy shadow after pruning; unchanged sunlight, healthy bed and pale seedling state.
Trace: neighbour-tree bough index 1 ends at local x=1.48 (below the 1.7 wood-tip cutoff),
but its elevated foliage projects into the rear rows. Explicitly include this bough in the
existing cut/drop/reset sequence. Runtime code only; four boughs now cut instead of three.
Evidence: `scripts/dev/adaeze-branch-r1-before.jpg`, `adaeze-branch-r1-cut-15.jpg`,
`adaeze-branch-r1-cut-sheet.jpg` and `adaeze-branch-r1-reset.jpg` (all under `scripts/dev/`).
Live 1280x720 replay: rear canopy patch clears, branch drop remains visible, pale seedlings
and healthy-bed illumination persist; isolated contact restart restores canopy and shadow.
Fresh rendered-only `branch_shadow_critic`: **AT BAR** for this correction, no scoped
residual issue. Not a whole-scene approval. `pnpm lint`, `pnpm build`, editor bundle refresh
passed. Local implementation and evidence commit: `a4d0d87`; no push.

**Adaeze tree / sunlight — user-directed continuation, AT BAR (scoped visual), Codex 2026-08-28.**
Bar: the supplied `codex-clipboard-d6d04956-d51e-430b-a6dc-bce826c8eb7c.png`, improved so
the tree casts legible shade onto the failing bed, healthy seedlings stay mostly sunlit,
and pruning admits light without instantly healing plants. Branches should read as an
asymmetric, tapering low-poly tree rather than parallel spokes. Runtime builders only.
Replaced the independent shade rectangle with real canopy shadows; sun, sky and disc share
one high-sun direction. Uses engine-owned shadow camera settings. Staggered tapered boughs
bend and fork; the overhang extends along the nursery rather than across the healthy bank.
Camera-side fill preserves the caller beneath her brim. Existing pruning/reset cues retained.
Evidence: `scripts/dev/adaeze-tree-r2-opening.jpg`, `adaeze-tree-r2-beds.jpg`,
`adaeze-tree-r2-canopy.jpg`, `adaeze-tree-r2-cut-15.jpg`, `adaeze-tree-r2-cut-sheet.jpg`,
and `adaeze-tree-r2-reentry.jpg`. Captured at 1280×720 game area, with window chrome.
Fresh rendered-only critic `adaeze_tree_critic`: **AT BAR** for tree/shadow scope after
first-pass feedback that too little of the failing bed was shaded. Final captures show most
failing rows shaded, healthy rows sunlit, and pruning withdrawing shade while plants stay pale.
Builder reopened the transition sheet; live End call / re-entry restored canopy, shade and 0/2.
`pnpm lint`, `pnpm build` and editor bundle refresh passed. Earlier caller-first and mower QA
remain open; this is not a whole-garden approval. Local implementation/evidence commit:
`7ec21c9`. No push.

**Adaeze / unfinished End call — user-directed D-1 continuation, PARTIAL / OPEN QA, Codex 2026-08-28.**
Bar: supplied `20260828-1648-11.8269595.mp4`, §3/§4.3: Adaeze and two contrasting seedling
beds read before scenic clutter; the tended side has short grass without seed heads; the
mower visibly cuts every registered weed; unfinished End call reaches the globe without a
flight through empty space or the desk. Runtime code only, unchanged puzzle and daylight intent.
Runtime changes: covered unfinished-call return with stale-callback/input guards; original-scale
weed restoration and engine `updateInstance` render uploads; higher mower camera; no seed heads
inside maintained short-grass patches; same-crop healthy and leggy seedling geometry; closer caller,
clearer inspection framing, camera-side fill and quieter sky/sun. No mission progression changes.
Evidence: `scripts/dev/adaeze-r6-opening.jpg`, `adaeze-r6-beds.jpg`, `adaeze-r6-beds-large.jpg`,
and `adaeze-r3-exit-sheet.jpg`. Earlier mower-camera evidence: `adaeze-r2-mower-before.jpg` (not
proof of cutting; it predates final seedling colour/framing). Fresh rendered-only critic
`adaeze_critic`: exit **AT BAR** (garden fades directly to globe, nine waiting/zero answered,
no empty world or desk exposed). Garden remains **BELOW BAR**: bright horizon/greenhouse takes
the eye before Adaeze. Critic confirms related healthy/failing silhouettes, no healthy-side wheat,
and coherent sunny low-poly/pixel garden. Do not close the caller-first hierarchy item.
`pnpm lint`, `pnpm build`, editor bundle refresh and live mission-to-mower handoff passed.
Sustained mowing, visible fern flattening across a driven strip and reset restoration still need
hands-on QA: available preview key taps did not produce a meaningful drive, so no cutting success
is claimed. Local implementation/evidence commit: `7dfae66`; no push.

**Lucian menu-room leak — user-reported correction, AT BAR (scoped regression), Codex 2026-08-28.**
Bar: the supplied `codex-clipboard-885d0203-b8f1-429a-9e1c-e84d165a5fe6.png` with no solid
menu room in the district, and the same room restored on returning home. Workstation geometry
was never hidden; distance/fog concealed it in other contacts. Runtime phase ownership now
hides the workstation, its air and archive display during Contact, restoring on exit. No
scene-file edits or Lucian geometry changes.
Evidence: `scripts/dev/lucian-isolation-city.jpg`, `lucian-isolation-bridge.jpg`,
`lucian-isolation-bridge-large.jpg`, and `lucian-isolation-menu.jpg` in the same directory.
Live replay used the isolated Lucian choice checkpoint, watch ending, Continue, then The Machine.
City and bridge have no menu-room intrusion; the menu room returns intact. Fresh rendered-only
critic `lucian_isolation_critic`: **AT BAR** for this narrow regression, not unpictured states.
Builder reopened the captures. `pnpm lint`, `pnpm build`, editor `buildProject` passed;
editor exited play successfully. City/menu game content is 1280x720; larger bridge capture is
1707x1019 including window chrome. Local implementation/evidence commit: `163a81a`. No push.

**Lucian ending asset finish — user-requested continuation, AT BAR (visual), Codex 2026-08-28.**
The previous verdict covered choice readability, not a finished asset bar. User's new capture
`codex-clipboard-d7bf5712-3eb9-4938-be19-da288fa5c4fe.png` reopens the cabin and bridge.
Bar: repair-shop prop articulation and practical-light value separation (`Downloads/download.jpg`),
translated to a recognisable worn car cabin and constructed night bridge, retaining crisp PS1
geometry. Fresh baseline critic: bright rails dominate; the dark slab cabin does not read as an
inhabited vehicle. Runtime-built assets only; story, timings and puzzle rules remain unchanged.

Replaced the slab pillars and dashboard with raked trim and a faceted moulded shell; added
recessed instruments, worn wheel grips, vents, paper route slip and a supported phone tray.
The bridge now has truss portals, fitted practical lights, curb joints, rail plates and sparse
road repairs. The lights ending retains machine wireframe, with an articulated saloon and
three-lens signal housing. No new raster assets, broad post-process changes or scene-file edits.

Rendered critic `lucian_asset_critic`: R1 rejected hidden cabin, R2 slab dash, R3 insufficient
value separation, R4 lack of habitation; R5 **AT BAR**, including separate call/lights checks.
Fresh whole-set critic `lucian_asset_smoothing`: **AT BAR for cohesion**.
Evidence under `scripts/dev/`: `lucian-assets-r5-watch-sheet.jpg`,
`lucian-assets-r5-call-sheet.jpg`, `lucian-assets-r3-lights-sheet.jpg` (eleven sequential
one-second frames each, left-to-right). Settled originals: `lucian-assets-r5-watch-10.jpg`,
`lucian-assets-r5-call-10.jpg`, `lucian-assets-r3-lights-10.jpg`; larger framing check:
`lucian-assets-r5-watch-large.jpg`. Builder reopened all three sheets after assembly.
The sequence captures contain 1280x720 game content; the maximised desktop capture is
1707x1019 including window chrome, not a claimed 1920x1080 test.

Verification: `pnpm lint`, `pnpm build`, editor `buildProject`, and existing `preview-car.ts`
diagnostic pass. Replayed all three real choice/cue paths using isolated capture checkpoints:
cabin/rain reveal, phone pulse, red signal crossing, deceleration, acknowledgement and Continue
hold remain visible. This is visual/runtime replay evidence, not a complete campaign or audio
listening pass; earlier lifecycle teardown assertions remain outside this asset-only scope.
Implementation and evidence: local commit `910acec`. No push. Editor exit initially timed
out, then `getState` confirmed ready and out of play; no scene save was performed.

**Lucian contact / three interventions — user-directed D-1 extension, AT BAR (visual), Codex 2026-08-28.**
Scope: evidence hierarchy, bold speed rule, distinct lights/call/watch performances and delayed
acknowledgement. Preserve the shared outcome and deduction rules. Baseline: supplied recording
`20260828-1505-48.8609390.mp4`; fresh rendered-only critic found wire density overwhelms evidence
and WATCH resolves without a clear cabin reveal. Replay in existing isolated capture storage;
no player-save or authored-scene changes. L8/P8/T8 capture-only checkpoints exercise the real
session/choice/device path without replaying the whole campaign.

Rendered critic `lucian_final_critic`: R1 rejected unreadable vehicle/phone glow; R2 rejected
dominant rain; R3 **AT BAR**. Separate fresh smoothing critic `lucian_smoothing`: **AT BAR**.
Evidence: `scripts/dev/lucian-r2-lights-sheet.jpg`, `lucian-r3-call-sheet.jpg`, and
`lucian-r3-watch-sheet.jpg` (eleven chronological one-second frames per route, left-to-right).
Full-size settled frames: `lucian-r3-call-10.jpg`, `lucian-r3-watch-10.jpg`.
Evidence UI: `lucian-r2-pursuit-small.jpg`, `lucian-r2-pursuit-selected.jpg`,
`lucian-r2-trail-small.jpg`, `lucian-r2-trail-selected.jpg`; return: `lucian-r3-return.jpg`.
All paths in this paragraph are under `scripts/dev/`. Captured game content at 1280×720.

Verified: all three bridge choices reach acknowledgement/Continue after visible settling;
lights car crosses red before stopping, call screen pulses without lighting the casing,
watch supplies driver-eye framing. Continue returns to globe with Lucian resolved. Pursuit
selection advances its sighting; claimed trail ping updates distance origins. Bold speed hint
is present in both stages. `pnpm lint`, `pnpm build`, editor bundle refresh, `preview-car`
(including windscreen UV coverage), `audit-pursuit`, `audit-trail`, and `cues-resolve` pass.
No full start-to-finish campaign or audio listening assessment claimed. Two editor `ensure failed`
assertions in `endPlay`/effect disposal appeared during repeated reload/checkpoint testing;
their root cause is not established and this is not an error-free runtime certification.
Implementation and evidence commit: `bcb4fee`. No push.

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

**Dana/M4SS approved contact/control pass — 2026-08-28: AT BAR (scoped visuals; Codex).**
User-directed scope: readable specimen-first desktop, visible station log, distinct usable
cultures and a defined slime silhouette; wake all dormant Sluice cultures from the drop
plate and stop neutral-input ground drift without changing flight/swing dynamics.
Bar: supplied `20260828-0730-59.7657624.mp4`, §3/§4.3/§4.5 and M4SS-ART-BIBLE §2–4.
Implemented: specimen-first desktop with compact utility icons and an unobscured station
log/time/containment panel; lighter local scanlines; restrained slime halo and branching
culture silhouettes. `drop` wakes g1/g2/p2 through the existing live transition and announces
the restored feed in the HUD. Input clears on pause/focus loss/restart/exit, ignores paused
presses and cancels opposing directions. Ground settling removes only supported whole-body
horizontal drift, excluding air/rope/recall/regroup/updraft movement.

Evidence: `scripts/dev/dana-r2-idle-small.jpg`, `dana-r2-selected-small.jpg`,
`dana-r2-selected-large.jpg`, `dana-r2-returned-small.jpg`, `dana-r2-returned-large.jpg`,
`m4ss-r2-stage3-small.jpg`, `m4ss-r2-focus-pause.jpg` (all under `scripts/dev/`). Captures
include native window chrome: 1282×752 and 1707×1019, not a claimed exact 1920×1080 matrix.
Fresh rendered-only critic `dana_m4ss_final_critic`: **AT BAR** for both scopes after
rejecting R1's lamp-like growth silhouette. Non-blocking notes: generic specimen-folder
shape and low contrast at the outermost culture tendrils. No claim of whole-stage M-1 closure.

Verification: `pnpm lint`, `pnpm build` and editor bundle build passed. All three existing
M4SS simulation harnesses passed; approved regression coverage extends stage/sluice harnesses:
40g/14g/8g walking and 320px/s landing settle after 0.3s with five-second centroid creep
rounding to **0.000px**; mass/connectivity preserved. Real plate press wakes all three,
rejects their latches before activation and accepts them afterwards, opens s1/b1, and fresh
stage resets plate/gates/growths. Existing swing/throw/recall/lift checks remain green.
Live pause/Space/resume preserved 40g; real focus loss paused; file selection/open/return
checked. Still needs human held-key/focus-loss-during-Space replay and full-HD capture matrix;
the desktop automation only offers key taps, not sustained holds. Growth activation is
simulation-proved, not yet captured as an in-game plate-to-growth sequence. Local implementation
and evidence commit: `0a60903`. This supersedes M-1's earlier permanently-dormant p2 direction:
p2 is now deliberately restored by `drop`. No scene edits, migration or push.

**Dorin contact pass — user-directed D-1g extension, 2026-08-28: AT BAR (scoped visual pass, Codex).**
Bar: worried person first, old lock second, inhabited home third; crisp night-time PS1
staging, reachable working pose, readable pin board, and entry that precedes "I am in".
Source: user recording `20260828-0649-44.1681924.mp4`. Scope: runtime scene choreography,
local lights/hallway, lock UI, landing-window shot, and resolution presentation. Preserve
puzzle rules, saved progress, existing house identity and global rendering.
Implemented: restrained porch light and turned opening pose; walk/crouch with tool-following
hand targets and a working camera clear of the console; top-aligned, full-width pin board
with confirmed order and Dorin's actual per-pin feedback; framed landing window and a
shallow inhabited hall. Door opening, entry and final words now occur in that order.
Evidence: `scripts/dev/dorin-r3-opening.jpg`, `dorin-r2-landing.jpg`, `dorin-r2-lock.jpg`,
`dorin-r3-working.jpg`, `dorin-r3-pin-set.jpg`, `dorin-r2-feedback.jpg` (failed pin),
`dorin-r3-entry-0.jpg` through `dorin-r3-entry-4.jpg` (roughly 2.2-second intervals),
`dorin-r3-result.jpg`, and `dorin-r3-return.jpg`. R2 landing/lock/feedback are unchanged in R3.
R1 was NOT AT BAR: `dorin-r1-working.jpg` showed a camera inside the working pose.
Fresh R3 critic returned AT BAR, noting hand/tool separation as non-blocking polish;
separate whole-scene smoothing critic also returned AT BAR. Ordered captures prove the
work/entry/resolution states, not exhaustive animation smoothness or aspect-ratio coverage.
`pnpm lint`, `pnpm build`, and editor build passed. Live isolated-save review confirmed
failed-pin feedback, sequence progression, entry before final reply, and return to globe.
Implementation/evidence commit: `16f5bc5` (local, not pushed).

**Dorin follow-up corrections — 2026-08-28: verified scoped fixes (§12.7).**
The user's later captures exposed faults missed by the pass above: coplanar upstairs glass
and solid frame backing, an undersized lock in the working shot, and a leaf extending below
the step top. Replaced the backing with four frame members, moved the working camera to the
free side of the keyway, and trimmed the leaf bottom to 0.16m above the 0.14m step. Hinge,
hardware, puzzle rules and entry timing remain unchanged. This is not a renewed whole-scene
AT BAR claim. Live editor review at 1282×752 checked the window, cumulative pin feedback and
opening/entry sequence. Evidence: `scripts/dev/dorin-fix-window.jpg`,
`dorin-fix-lock-before.jpg`, `dorin-fix-lock-pin3.jpg`, `dorin-fix-lock-pin2.jpg`, and
`dorin-fix-door-1.jpg` through `dorin-fix-door-4.jpg` (about 1.9-second intervals).
`pnpm lint`, `pnpm build` and editor build passed. Implementation/evidence commit:
`603aac6` (local, not pushed).

**Vasile contact pass — user-directed D-1f extension, 2026-08-28: AT BAR (scoped visual pass, Codex).**
Bar: Vasile first, routing junctions second, a recognizably flooded school cellar third;
crisp PS1 treatment, readable untimed pipe board, and a visible drain followed by a human
acknowledgement. Source recording: `20260828-0556-25.2420282.mp4` supplied by the user.
Scope includes local lighting/framing, flood contact, school dressing, matching junction
wording, board layout and the ending hold. No save reset or puzzle-rule change.
Implemented: restrained lamp/glass and water reflection, closer human-led shots, classroom
storage, junction labels, enlarged continuous pipe paths with fixed endpoints, and a 19.5 cm
drain followed by the reassurance shot before Vasile's closing speech. Build and lint pass.
Retry closed the rendered gaps: lamp guard/glow subdued, face fill and pipe wash balanced,
pipe board sized to its console container so Send remains visible at 1282x752. Fixed the
runtime flood shader's undeclared `vUv` with its own UV varying; restrained reflected light
and visible ripples now establish water while Vasile stays matte. Rules/save data unchanged.
Evidence: `scripts/dev/vasile-r4-opening.jpg`, `scripts/dev/vasile-r4-board.jpg`, and
`scripts/dev/vasile-r4-resolve-0.jpg` through `vasile-r4-resolve-3.jpg` (approximately
0.2/2/5/8 seconds after success). Earlier iteration evidence: `vasile-r2-opening.jpg`
(lamp first), `vasile-r2-board.jpg` (Send below fold), `vasile-r3-opening.jpg` (water absent).
Fresh opening critic and separate whole-surface smoothing critic both returned AT BAR:
Vasile first, junctions second, submerged school furniture/reflection third; exposed objects
show the drain, return to Vasile precedes acknowledgement and player-held Continue.
Live rotations, wrong-route feedback, success and Continue checked in isolated save namespace.
`pnpm lint`, `pnpm build`, and editor build passed. Sound not judged. This does not close
all D-1f work or certify the editor runtime: preview teardown reported two
endPlay/removeFromParent ensures (no flood shader error), and exiting the save-namespace
reload raised a Sandbox Studio main-process `Object has been destroyed` error. Editor
was recovered via Return to Editor; no claim of an error-free shutdown.
Implementation receipt: initial local commit `fc5312f`; retry code and rendered evidence
committed locally as `c9cc4bd` (not pushed).

**Tomas switch-box clearances — user-directed geometry correction, 2026-08-28:**
Wrist target pulled back 14.5 cm; upper cable routed to a rear gland
outside the lid sweep; lid shifted forward of its rear-edge hinge and widened to
cover both side rims. No camera, lighting, puzzle or gesture-system changes.
Geometry/no-overlap scope (§12.7), not a new AT BAR composition claim.
Closed-lid local bounds now span x ±0.129 and z ±0.07, covering both side rims;
the rear-edge pivot is unchanged. Open contact inspected at 1282×752 and
1707×1019 in isolated preview storage: hand/cable no longer protrude through
the enclosure. Evidence: `scripts/dev/tomas-box-clearance-r1-full.jpg`.
`pnpm lint`, `pnpm build`, MCP editor build and `git diff --check` passed.

**Mirela radio indicators — user-directed geometry correction, 2026-08-28:**
Removed the yellow front power pilot and its visual toggle/reset references; raised
the green carrier indicator from local y=0.135 to y=0.165 (3 cm). Carrier state,
meter motion, mains behavior, mission text and room lighting remain unchanged.
Exact placement/removal request, not a new composition pass (§12.7); no AT BAR claim.
`pnpm lint`, `pnpm build`, MCP editor build and `git diff --check` passed.
Rendered review of this small correction is left to the user.

**Ileana / globe integration AT BAR — Codex, 2026-08-28:** Implementation and rendered
evidence commit `c4acc0c`. User-directed follow-up
to the 05:01 recording. Bar: Ileana's whole face and her photographs remain readable
beside chat and the relations board; an open, grounded box and five addressed letters
carry the request and its resolution. Keep the emptied-house practical lighting and
crisp reconstruction. The full-screen globe shares the page background with blue
brackets, without a second opaque/vignetted rectangle; physical CRT unchanged.
Runtime source only: reframed arrival/evidence/closure, moved the existing practical
with its fixture, reduced local tabletop/window/lid values, rebuilt a hollow photograph
box, seated its closing lid, and placed all five letters outside the console's footprint.
Compact relations styling keeps five people, nine choices and SEND IT visible; telemetry
opens compact. The outcome waits for the scene action and reads “Five names. Five letters.”
ScreenSurface is transparent, its scanlines shade drawn pixels only, and blue brackets
remain without the second vignetted rectangle. Physical CRT surface is unchanged.
The final resume correction cancels a pending globe handoff when leaving Choosing, so
Continue cannot attach a delayed globe over a restored contact.
Rendered evidence under `scripts/dev/`: `ileana-r3-arrival-small.jpg`,
`ileana-r3-board-small.jpg`, `ileana-r3-linked-small.jpg`, `ileana-r3-linked-full.jpg`,
`ileana-r3-resolve-0.jpg` through `ileana-r3-resolve-7.jpg`,
`ileana-r3-complete-small.jpg`, `ileana-r3-return-0.jpg` through
`ileana-r3-return-9.jpg`, `ileana-r3-globe-full.jpg` and
`ileana-r3-globe-selected-full.jpg`. Inspected at 1282×752 and 1707×1019;
the full-size solve reveals five letters and closes the lid before final dialogue,
Continue remains held, and the small-size return shows physical CRT growth before
the globe's truthful 7 waiting / 2 answered state. Only isolated capture storage used.
Final rebuilt resume check: `ileana-r4-resume-contact.jpg` shows the saved contact
still unobscured well past the old 1.9-second handoff deadline.
Fresh Ileana critic rejected the first two value passes, then accepted r3 arrival and
both board/completion sizes: **AT BAR**. Separate fresh cross-screen critic: **AT BAR**,
no blocking visual gap; coherent CRT return and no extra globe rectangle.
`pnpm lint`, `pnpm build`, final MCP editor build and `git diff --check` passed.
This closes this user-directed visual correction only, not the broader F-1 item.

**F-1 globe / Tomas / completion correction AT BAR — Codex, 2026-08-28:**
Implementation `776f09d`; final telemetry correction and rendered evidence `64562f9`.
User-directed follow-up to the 04:29 recording. Reopens the prior subpass: the
no-prior-knowledge route left the splice box suspected until success, and the
answered record repeated the opening complaint. Bar: readable repair hardware
before choosing a part, an unobstructed face, compact accessible observations,
visible steady beacon before success copy, and earned CRT growth with a truthful
knowledge/outcome receipt. Runtime construction and presentation only; no puzzle
answers, saved-scene transforms or shared materials changed.
Code pass implemented: all four no-prior-knowledge feed-tracing transitions open the
box (transition cameras override beat framing, so the cue belongs on those edges),
the bag also opens it, and repeated opening preserves the current lid angle.
The descending cable uses its shape instead of a face-crossing suspected volume;
local cool fill is adjusted and observations have a bounded, scrollable height.
Tomas's final words/status wait 3.6s for the 2.8s lamp/3.3s hold cues; outcome/save
remain immediate and Continue waits for both visual and audio acknowledgement.
CRT growth refreshes after the solved-request floor and replays from call-entry
growth; the return receipt names an actually learned fact. Globe history now uses
resolved copy and selection emphasizes its leader and dot as well as its name.
The final correction keeps telemetry compact during verification and final status
updates; neither objective change expands readouts over the repair payoff.
Resumed from the earlier editor-readiness pause and rebuilt the final live bundle.
Both no-prior-knowledge and genuinely learned shared-supply routes were inspected
through the open box and kit, at 1282×752 and 1707×1019. Captures used the existing
isolated capture namespace; the normal player save was untouched.
Evidence, all under `scripts/dev/`: `F1-tomas-r6-blind-close.jpg`,
`F1-tomas-r6-blind-kit.jpg`, `F1-tomas-r7-known-close.jpg`,
`F1-tomas-r7-known-full.jpg`, `F1-tomas-r7-known-kit-full.jpg`;
`F1-tomas-r7-resolve-sheet.jpg` with full frames `-resolve-3.jpg`,
`-resolve-4.jpg`, `-resolve-7.jpg`; `F1-tomas-r7-return-sheet.jpg`
with full frames `-return-1.jpg`, `-return-3.jpg`, `-return-11.jpg`;
`F1-globe-r7-selected-tomas.jpg`, plus small-window first-repair
`F1-tomas-r6-return-2.jpg` and `F1-tomas-r6-return-11.jpg`.
Fresh Tomas critic: **AT BAR** at both sizes, with readable hand/rail separation.
Separate fresh sequence critic: **AT BAR** — visible repair before acknowledgement,
earned CRT growth and retained lesson, truthful answered history, clear next selection.
Keyboard selection and the player-controlled Continue hold were also inspected.
`pnpm lint`, `pnpm build`, final MCP editor build, and `git diff --check` passed.
The existing endPlay/dispose ensure error still appeared on an earlier preview exit;
it did not prevent the final rebuild/capture and remains outside this visual subpass.
This closes this correction only, not the broader F-1 ledger item.

**F-1 globe / Tomas / completion subpass AT BAR — Codex, 2026-08-28:**
User-directed follow-up to the 03:41 recording. Bar: §3, §4.2/4.3/4.6 and the
beacon silhouette reference for value hierarchy. Tomas and the junction must remain
readable beside both contact panels; the repaired hardware and steady beacon must
register before a player-controlled Continue; one composed CRT return should lead
to a globe with truthful counts and a clear completion record. Runtime code only.
Implementation and rendered gauntlet complete; implementation/evidence commit `9314e80`.
Globe cards are compact, clustered labels use separate rows and leaders without moving
their geographic dots, and resolved contacts retain truthful counts after editor reveal.
The latest answer is highlighted in history and acknowledged on the globe. Tomas faces
the working camera with a near-side rail grip; the splice enclosure sits forward of the
rail on a bracket, exposes its terminals, and gains the fitted isolator on success.
Local beacon/cage/halo and cloud tuning preserve the night hierarchy; a short-range cool
fill holds his features during the dim phase without washing the scaffold. No shared
material, saved scene, puzzle solution, or dialogue changes.
Success is saved before an unbounded reading hold. Continue enables after the repair beat;
the closing words re-anchor after the panel narrows. An opaque carrier break covers the
cut to one readable CRT/tree shot (2.8s dwell), then the existing move enters the globe.
Evidence: `scripts/dev/F1-tomas-r5-wide.jpg`, `F1-tomas-r5-close.jpg`,
`F1-tomas-r5-console-0.jpg`, `F1-tomas-r5-console-2.jpg`,
`F1-tomas-r5-console-full.jpg`, `F1-tomas-r5-complete-full.jpg`,
`F1-tomas-r5-return-sheet.jpg`, `F1-tomas-r5-return-1.jpg`,
`F1-tomas-r5-return-11.jpg`, and `F1-globe-r5-cluster.jpg` (all in `scripts/dev/`).
Independent Tomas critic: **AT BAR** after five rendered rounds. Fresh cross-screen
smoothing critic: **AT BAR**, including the final words/Continue, physical CRT beat,
globe acknowledgment and clustered labels. The history subtitle is intentionally secondary.
`pnpm lint`, `pnpm build`, and editor build passed; final bundle values and live R5 were
checked. Captures cover 1282×752 and 1707×1019 windows and the normal repair path, not
every mission or paired-phone flow. Existing editor `endPlay`/dispose “ensure failed”
dialog recurred on preview exit; dismissing it restored readiness. This subpass does not
close the broader F-1 environmental/menu gaps recorded below.

**F-1 menu detail correction PAUSED — Codex, 2026-08-27:** User-directed follow-up to
the accepted broad composition: restrain lamp haze/dust and shade gloss, articulate the
cable connector and keep its route clear of the lamp, remove CRT hover-name duplication.
Bar: §3/§4.1, desk-room reference for restraint and readable chunky hardware. Runtime menu
only; C-1's earlier beam judgment does not settle the user's close-up concern. Implementation
commit `fae018d`. The lamp has local rough enamel, 22 dimmer,
smaller motes, and no additive cone shell. The connector has a dark grip, metal rectangular
nose, strain relief and one green inset; its sockets match. It reaches for the selected
socket from the CRT's left shoulder instead of following the pointer across the lamp.
Physical button labels remain; their duplicate CRT hover names are no longer drawn.
`pnpm lint`, `pnpm build` and editor build passed. Live R1 evidence:
`scripts/dev/F1-menu-detail-r1-idle.jpg`, `scripts/dev/F1-menu-detail-r1-hover.jpg`,
`scripts/dev/F1-menu-detail-connect-0.jpg` through `-5.jpg` (94–592ms after click).
These show the cable clear of lamp/CRT, name-free tree during hover, and Credits opening
after insertion. Fresh critic rejected R1's faint shell as a cloudy column/smoke; final
revision removes the shell entirely. **That final lamp revision is unjudged:** the preview
closed before capture, Sandbox Studio exposed an Error dialog and an unloaded editor;
Computer Use could not inspect it ("foreground window did not report a process id"). MCP
console diagnostics reported no errors, so the cause is not established. Resume by
dismissing the host error, reopening play, and recapturing idle/hover for the fresh critic.
Do not treat the earlier broad menu acceptance or successful builds as this detail pass's bar.

**F-1 menu subpass AT BAR — Codex, 2026-08-27:** User-directed splash-to-menu readiness,
camera handoff, physical rack mounting and readability. Implementation commit `5fa4a77`.
Bar: §3/§4.1/§4.6 and
`assets/reference/desk-room/01-lamp-and-mast.jpg` (mood, not menu layout).
The boot waits for logo/CRT preparation, remembers activation and keeps pending status
on the splash instead of adding a separate loading screen. Buttons remain visible during
the pullback; input unlock follows camera completion, including reduced motion. Saved
sessions receive truthful boot text; unavailable actions have explanatory labels.
Rack supports, camera framing and restrained local palette/light values put the menu
first, CRT second and window behind both. No scene-file edits or save-policy changes.
Independent critic rejected R1–R3 hierarchy, then judged R4 **AT BAR**; a separate fresh
cohesion critic judged boot/room identity **AT BAR**. The final 12-frame handoff also
passed independent review: cohesive pullback, buttons present on entry, no visible late
pop-in. Evidence:
`scripts/dev/F1-menu-final-sheet.jpg` (normal-motion handoff, 0–3.78s),
`scripts/dev/F1-menu-final-11.jpg` (1707×1019 settled menu),
`scripts/dev/F1-menu-r4-small.jpg` (1282×752 critic capture),
`scripts/dev/F1-menu-boot-saved.jpg` (saved-session boot), and
`scripts/dev/F1-menu-reduced-sheet.jpg` (reduced-motion timing, usable by ~0.55s;
pre-final art). `pnpm lint`, `pnpm build` and editor build passed; rendered artifacts
reopened. Reduced-motion preference restored after capture. Cold-network/failure paths
and the complete nine-mission day/night arc were not exercised. Dusk progression remains,
but its window intensity ceiling changed; C-2 still needs its full-arc judgment.
This accepts only the menu subpass, not the overall F-1 first-five-minutes item below.

**F-1 user correction, Codex 2026-08-27, commit `5d04fd6`:** Mirela's standing and walk depth moved back
24 cm with wrist targets lifted clear of the tabletop and the near reach shortened.
Contact-only footer spacing now gives the
suggestions/status/input room above the bottom bezel; input focus darkens the interior
instead of drawing the general bright ring. No warehouse layout or lighting changes.
Live captures: `scripts/dev/F1-mirela-clearance-unfocused.jpg`,
`scripts/dev/F1-mirela-clearance-focused.jpg`, and
`scripts/dev/F1-mirela-clearance-small-window.jpg` prove UI states; final pose is
`scripts/dev/F1-mirela-clearance-r2.jpg` and `scripts/dev/F1-mirela-clearance-r2-idle.jpg`.
Lint, compilation and editor build pass; full-size and 1282×752 layouts inspected.
Independent critic: **AT BAR for this correction** — forearm above the tabletop, hand
naturally occluded by the transmitter, spacing/focus coherent. The broader F-1
environmental gaps below remain open.

| ID | Surface | Item | Bar | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| **F-1** | First five minutes | Cold boot → menu → globe → Mirela connection → first request reads as one authored, judge-ready sequence | `ART-DIRECTION-v1.png`, desk-room and contact-scene references; §3/§4.1/§4.3/§4.6 | `PAUSED` — Codex, 2026-08-27 | User-requested Mirela pass, commit `9c9625c`: revised framing/pose, controlled practicals and existing bench bounce (no new face spotlight), repair stock/ledger/local wear, powered-but-silent pilot, attached transmitter caption, compact opening telemetry with working hover/focus expansion. Seven rendered rounds; fresh cohesion critic confirms Mirela → transmitter, one coherent crisp repair shop, but **NOT AT BAR: flood history remains too subtle at the opening camera; request sits far below identity across empty chat space.** Next: make the existing low flood line read without sacrificing the person/set hierarchy, then judge the entire cold-boot sequence. Evidence: `scripts/dev/F1-mirela-contact-r7.jpg`, `scripts/dev/F1-mirela-final-sequence-sheet.jpg`, `scripts/dev/F1-mirela-telemetry-expanded.jpg`, `scripts/dev/F1-mirela-power-off.jpg`. `pnpm lint`, `pnpm build`, MCP build passed; isolated-save live arrival, telemetry expansion and power-off pilot verified. Full mission not replayed. |
| **M-3** | M4SS | Audit every mechanic-carrying visual for the ember fault | Law 5 | `AT BAR` claude 2026-08-27 | **Now a gate: `scripts/ember-fault.ts`.** Law 5's second failure mode — a signal that exists and is too small to reach the screen. `device px = authored x 0.5 display / 2.4 retro grid`; the original 4px ember computes to **0.83**, reproducing the incident exactly. Two mechanic features registered (`core` 2.50, `paneW` 2.83) against a notice floor of 2.0; all other sprite features reported but not failed. **Double-canaried:** shrink the ember → fails with 0.83; rename it → fails as missing |
| **M-1** | M4SS | Stage 3 (Sluice) full art pass | M4SS-ART-BIBLE §2 | `IN LOOP` | "Grey-boxed" was wrong - see `captures/m4ss-go.png`. **Vessels built** (`vesselTexture`), the §2 item that read "we have no vessels anywhere". Level thinned on Paul's direction: d1/p1/g3 removed, p2 made permanently dead, t1 moved, lanterns 9→5. `captures/m4ss-r2.png`. Remaining §2: no dome lattice, standing water reflects nothing. Do NOT brighten the midground - reverted twice, stageArt.ts:1162 |
| **M-2** | M4SS | Sluice identity in GEOMETRY, not only the ramp | Bible §5 thumbnail test | `BLOCKED` by M-1 | |
| **W-1** | Warehouse | Key lighting: high bays as discrete pools with real dark between | `warehouse/02-high-bay-pools.jpg` | `IN LOOP` claude 2026-08-26 | r0 artifact: `scripts/dev/W1-r0-before.jpg`. **Cause found: there are no interior light fittings at all.** The room is a HemisphereLight at 1.8 plus a moon through the skylights, so it cannot pool. Decomposed → W-1a/b/c |
| **W-1a** | Warehouse | Light the fittings over where the player works | `warehouse/02-high-bay-pools.jpg` | `PAUSED` claude 2026-08-26 | **r1 measured as a literal no-op** — r0 and r1 match on every percentile. The cause is W-5: the constant it changed is not on the path the game runs. The lamps over the LANES were at intensity 14 against the rack lamps' 54, so every aisle was lit sideways by fittings hanging over the shelving beside it |
| **W-1b** | Warehouse | Drop `WAREHOUSE_SKY_FILL` so the pools can read | Law 2 | `PAUSED` claude 2026-08-26 | 1.8 → 0.6 is committed and live in the bundle, but it is **not the flattener**: `frontLight` runs at 35 and each of the work lights at 54. The ambient was never the top of the range |
| **T-3** | Tooling | A reliable way to REACH each surface for capture | — | `AT BAR` claude 2026-08-26 | **Solved: `scripts/dev/jump.py W`.** The strip reveals on `mousemove` and `SetCursorPos` to a single point often generates none — a teleport is not a move. Tabs are found by border colour so the geometry cannot go stale. Evidence: `scripts/dev/W1-r9-after.jpg`, commit a0908aa |
| **T-4** | Tooling | A capture POSE inside a surface, not just the entrance | — | `DECLINED` claude 2026-08-26 | **Already existed and I opened it anyway.** `DEV_TOUR` in `WarehouseRig.ts` is dev-gated, holds each viewpoint for `DEV_TOUR_HOLD` seconds and is a no-op while the list is empty. Populate it, build, capture, empty it. Nine rounds of W-1 were judged from the wrong viewpoint with the fix sitting in the file being edited |
| **W-1c** | Warehouse | Real darkness between the pools | `warehouse/02-high-bay-pools.jpg` | `DECLINED` claude 2026-08-27 | **The pools exist and the painted floor drowns them — proved, not argued.** A fifth critic said darkness comes only from distance, never from sitting between lamps. Controlled test: shift every aisle bay 5m along z and re-shoot the identical frame — the lane floor changes by a mean of **14.9 levels, p99 75**, so the pattern IS lamp-caused. But within-slice variation measures sd 36 in the artifact against the bar's 27, and almost all of the artifact's is ALBEDO: lane striping, bay numerals, walkway blocks. Making the pools dominant means flattening painted floor markings the player navigates by. **That is a design trade, not a bug, and the navigation side wins.** Evidence `W1-phaseshift.jpg` vs `W2-r3-symmetry.jpg` |
| **W-2** | Warehouse | Depth cueing — value + saturation falloff with distance | §4.4 | `AT BAR` claude 2026-08-27 | Critic: *"the far third now has a readable terminating plane and floor junction, the lane runs to it, and the near/mid ramp, the night key and the label legibility all survive."* The fog was the outdoor numbers with a warehouse name on them — **zero haze for the first 32m of a 58m building**, saturation RISING with distance. Now 9/72 with the haze at `#1e2732`; **the haze luma is the FLOOR of the ramp**, not a tint. Also closed the asymmetry it flagged: the lamp grid lit x columns −20/−4/12 only, leaving two of five racks 6–8m from any lamp forever; a diagonal covers all six columns for one extra lamp, right/left mid 0.79x → 0.85x with the whole-frame envelope unchanged. Bar §4.4, `W2-r3-symmetry.jpg`, commit 758ed67 |
| **W-3** | Warehouse | A lamp on the drone that lights what it approaches | §4.4 | `AT BAR` claude 2026-08-27 | Critic: *"the named gap is inverted with a clear margin."* Lamp-lit box 236 against a 221 ceiling on every ambient carton, where a critic had measured a tie; a readable ramp 174 → 222 across its front face. **Honest caveat it raised: the hero box is byte-identical before and after — the separation was won by darkening the surrounding cargo, contrast-by-subtraction.** Cost noted: the lower-left carton's separation from the rack behind it fell from 39 levels to 13. Bar §4.4, capture `scripts/dev/W3-r6-cardboard.jpg`, commit c0f65c7 |
| **W-4** | Warehouse | Mid-scale rhythm: break the regularity of racking/bays/markings | Law 3 | `AT BAR` claude 2026-08-26 | Commodity and fill moved from the SLOT to the BAY COLUMN. Critic, fresh context, before/after only: *"the wallpaper case almost exactly"* before; after, **three nameable landmarks in one frame** — the drum bay, the empty bay, the tote stack. Measured: tote AREA 30.5% → 36.2% while mean run length 13.9px → 28.3px, so it is the same stock in longer blocks. Bar: Law 3. Capture: `scripts/dev/W4-r1-bays.jpg`. Commit: 323bfa2 |
| **W-6** | Warehouse | Center the inbound trailer at the main door and complete the loading-bay art | User-directed 2026-08-27; §4.4, `warehouse/01-racking-conveyor-rimlight.jpg` | `AT BAR` codex 2026-08-27 | Fresh rendered-only critic: **AT BAR** — one aligned cargo opening, readable boxes and depth, substantial frame, seals and visible metal ramp; the blocking black rectangle and displaced trailer are resolved. Capture `scripts/dev/W6-r1-dock.jpg` (open bay at gameplay distance). Shared centerline replaces both old builds; finished ribbed shutter uses the existing mission target. Lint/build pass; temporary DEV_TOUR removed. Implementation commit `5464852`. No full mission playthrough claimed. |
| **W-5** | Warehouse | Audit `warehouseCel` — style or a patch over flat light? | §4.4 | `AT BAR` claude 2026-08-26 | **Answered twice, both with evidence.** (1) It is the SHIPPING path — `warehouseCelEnabled` defaults true and `setCelVisualsEnabled(true)` runs on every entry, so the left branch of every `celStyleEnabled ? a : b` is the game. It ran a hemisphere fill of 2.2 against the other branch's 0.6. (2) It is **not** what flattens the light: A/B'd with the pass off, the far aisle floor profiles the same either way — swing 25 levels (on) vs 34 (off) on a mean of 42, depth-correlation ~0 in both. The cel treatment is a style, not a patch. Captures `W1-r9-after.jpg` / `W1-nocel.jpg` |
| **M-4** | M4SS | The column ride answers on sound | §9 | `IN LOOP` claude 2026-08-27 | Two voices added to `SlimeAudio`, and the column is the only **rising** sound in the table — everything else either falls in pitch or is a transient. `draught` sweeps a broad low-Q noise band 300Hz upward over 0.9s with a sine climbing under it; low Q because moving air is broad and a tight Q is a kettle. `refused` is deliberately the SAME voice failing: same band, a third the length, and the sine sags instead of climbing — the air trying and not managing, which is what the HUD already says in words. Both **edge-triggered**: a draught is a place, not an impulse, and per-frame firing would be a buzz. Both captioned. `m4ss-sluice` and `cues-resolve` still pass. Unheard |
| **T-1** | Transitions | Contact ↔ globe gets a signature | §4.6 | `IN LOOP` | **Enter already has one and it is good** - blocks → scan-lines → wireframe → resolve, the machine rebuilding a place from a signal. Recorded at `captures/t1-cut.png`. Exit unverified: END CALL did not leave the view, so `--leaving` / `--resolving` have never been seen |
| **T-2** | Transitions | The ending, art-directed | §4.6 | `IN LOOP` | **Now reachable** - `ENDING` on the globe's dev list, was previously visible only after a full playthrough. Better dressed than the row assumed: framed panel, staged three-movement reveal, ruled report, relay map. Fixed: the title was sliced in half in every capture - the frame scrolled and focus dragged FINAL TRANSMISSION off the top; header and body are now separate. `captures/ending-top.png`. **A CSS scanline here is WRONG** - one was removed from these DOM surfaces for good reasons (LocalSurface.ts `.omni-terminal` note); the panel has the vignette that note explicitly keeps instead, corner 22.1 → 16.0 with the centre unmoved. Remaining: the relay map is an empty box on a low-score run |
| **D-1** | Dioramas | Eight rooms, eight named lighting looks | §4.3 / §7 | `IN LOOP` claude 2026-08-27 | **THE BAR NOW HAS A LEGIBILITY FLOOR - read this before touching a room's lights.** A room may be dark as a CHOICE (wire city is a data lattice at 54% black; beacon mast and night door are night exteriors). Darkness is not the default. Two floors, both measured on the 20-80/6-94 crop: **black share must not rise against the room's previous capture**, and **frame mean must not fall** unless the row says why. Bar a lit room against `captures/d1-now/4.png` (seedling tunnel, mean 123.7, 0% black - the brightest room that works), NOT against night door: holding two interiors against a night exterior for six rounds is how every room I touched got darker. **Mean alone is not the legibility test** - the flooded cellar reads fine at 49 and raising it changed nothing. Look at the frame |
| **D-1a** | Dioramas | Mill road renders black | §4.3 | `DECLINED` | **Not a bug. Sanda is cut from this build by decision** (the queue entry is commented out in OmniscientRig with a SETTLED note, GAME-REVIEW item 17 declined), so `buildScenes` never builds her diorama, `mountScene` finds nothing, and the strip's tab 7 blanked the viewport. Proved by putting the mount result in the window title: `NO-DIORAMA scene-mill-road`. **The tab is now drawn dead** - `hasScene` on the rig, dimmed and disabled in the strip. Restoring her restores the room |
| **D-1b** | Dioramas | The repair shop's work lamp is not inside its own shade | §4.3 | `DONE` | Moved (0.25, 1.55, -0.15) → (0.49, 1.41, -0.56). A spot's pool is placed by its target, so the pool held: 166 → 163, face 72 → 72, wall 37 → 37. The shade's inner rim is now lit by its own bulb. `captures/d1b.png` |
| **D-1c** | Dioramas | Cleared house: the subject has no lit field to stand against | §4.3 | `DONE` | Closed by the fixture that was in the frame the whole time - **the door is OPEN, and a house has more rooms**. A `HallSpill` beyond the threshold lifts the doorway off 72.5% black and gives her something to silhouette against. Three earlier attempts tried to buy this with spotlights nothing was emitting. Left third 23.7 → 38.4, sub-8 black 22.5% → 14.4%. `captures/Y-both.png` |
| **D-1d** | Dioramas | Every room has a region that is dark AND FLAT | §4.3 / §3 Law 4 | `OPEN` | **Four critics, four rooms, one finding.** Share of 16px tiles both dark (<32) and featureless (sd<3), against 0.1% in the seedling tunnel: beacon mast **45%**, night door **29%**, cellar ceiling band carries 99% of its pure black, cleared house and repair shop fixed this pass. That is absent data, not dark data. **Caveat on the metric**: it penalises night sky and open water, which are legitimately smooth - it is a sound test for an interior wall and a poor one for an exterior, so read the region the critic names, not the frame total |
| **D-1e** | Dioramas | Beacon mast: the man reads at +2.9 over his surround | §4.3 | `OPEN` | Lower half is 74% inside one 16-level band - deck, railing, man, near water and far shore all the same value; the frame reads only in COLOUR (orange hi-vis on blue), which Law 1 forbids. Raising BeaconGlow 15→24 and easing its decay moved the deck 28.2→29.0 and deck-vs-water +2.9→+3.2: **the beacon is not what sets the deck's value**, so the next step is finding what does, not turning it up further |
| **D-1f** | Dioramas | Flooded cellar: the flood is not legible | §4.3 | `OPEN` | A water plane with `createFloodwater` exists and reflects nothing usable: no waterline on the wall, no shoreline across the floor, no meniscus where drum, boots and crate meet it, and 98.1% of the frame's brightest pixels are one specular lobe against 1.8% on the lamp - "the fixture that owns the room is out-shouted by its own reflection". Critic's direction: a reflection of pipework, wheel and man across the floor, from the bulkhead lamp already in frame - no new light, nothing darkened |
| **D-1g** | Dioramas | The night door's ambient is a genuine standoff | §4.3 | `OPEN` | `scene.daylight` is 0.14 **deliberately** - the note there records that the rig's sky fill "raises every shadow in the room to roughly the value of every lit surface", reported as the contact rooms looking flat beside the menu room. Today's critic wants that same floor raised so the dead right third carries texture. Both findings are correct and the dial cannot satisfy both; this needs a fixture in that third or a decision that the room is allowed to end there |
| **D-2** | Dioramas | Certainty expressed in LIGHT, not only geometry | ART_DIRECTION §1 | `IN LOOP` claude 2026-08-27 | **Certainty never touched value.** The shader desaturates toward `vec3(certLuma)`, which preserves luminance by construction, then tints cold — so a guess and a fact rendered at the same brightness, separated by hue and saturation, the two channels a squint removes. §1 says the eye goes to the warmest thing; the eye goes to the BRIGHTEST thing first, and that was whatever happened to be pale. Added `*= mix(1.0, 0.74, certCold)`. Measured in the repair shop: the KNOWN radio moves −1.06 while lower-certainty shelf boxes move −3.99, so known-to-uncertain contrast rises 9% and now survives desaturation. `certainty-tiers` still passes. Unjudged |
| **D-3** | Dioramas | Verify the three light beats on screen | Themselves | `AT BAR` claude 2026-08-27 | All three exist, are registered and are fired: `light.hold:beacon` (mission 02, seaGlow 11 → 7.5 over 4s), `light.settle:cellar` (mission 05, 9.5 → 11.2 over 3.2s), `light.open:threshold` (mission 06, stepBounce 3.4 → 4.6 and its reach 2.1 → 3.0 over 2.4s). **Verified on screen** by holding the SMALLEST of the three at t=1 and photographing both ends: frame mean 47.31 → 49.53, **25.2% of the picture moves by more than 3 levels**, peak change 29. It reads as the room coming up rather than a light switching. The other two are larger changes, so they clear the same bar by arithmetic. Capture `scripts/dev/D3-cellar-t1.jpg` |
| **D-4** | Dioramas | One shadow-casting key per room | §5 | `IN LOOP` claude 2026-08-27 | **1 of 9 rooms had a key at the start; 6 do now.** And the item turned up a bug bigger than itself: **no rigged character in the game has ever cast a shadow.** `applyShadowPolicy` runs at scene mount; a contact is a GLB that streams in afterwards, so it kept the file's own `castShadow: false`. Fixed in `riggedContact.ts` — the doorstep figure's pavement went 45.3 → 17.3. Critic verdicts: night door **at bar** once the figure casts; cleared house **not at bar** (its shadow "reads as a rug", and its direction implies a low close light rather than the ceiling bulb — wrong key chosen). Mill road reverted: casting the torch took the scene to 98.8% under luma 10. Wire city and station desk have no lights at all |
| **C-1** | Workstation | Air: dust in the lamp cone, flicker, settle | §4.1 concept frame | `IN LOOP` claude 2026-08-27 | **5 critic rounds. Round 5 verdict on the beam interior: "this reads as dusty air - not clean fog, not noise, not a screen overlay"** - 134 particles, median 2x2px, density 31.5/10k inside the cone against 0.0-0.5 outside, adjacent-pixel MAD 3.53. Open: motes are unlit Points at constant strength, so any straying outside the beam glow on black. Mote box narrowed to 0.8 of the cone radius, unjudged since. `captures/r7-day.png` |
| **C-2** | Workstation | The room ages across nine missions | §4.1 | `IN LOOP` claude 2026-08-27 | 2 critic rounds. Round 1: the lamp DECAYED across the arc (170 to 144) so the key never changed hands. Round 2 found the deeper cause - **the afternoon had no daylight key**, so there was nothing for night to take over from. Window peak 11.6 to 17, lamp now runs 0.78 to 1.40 across the arc. **Unjudged since**: the three-frame capture needs re-shooting under the new curve |
| **C-3** | CRT | Phosphor persistence on state change | §4.2 | `AT BAR` claude 2026-08-27 | Phosphor is an **asymmetry**, not a fade: a P1 grain strikes in microseconds and decays slowly, so symmetric easing is a dissolve and reads as software. CSS gives it for free — the transition that runs is the one on the class moved TO, so brightening states get 40–45ms linear and dimming states 300–340ms with a long tail. **Verified in motion** on a 20fps contact sheet of a real tab switch: CONSOLE rises 37→51 in a single 50ms frame while CHAT takes ~300ms to settle — a 6x asymmetry. Evidence `scripts/dev/C3-phosphor-sheet.png`. Not gated on reduced motion (a colour decaying in place moves nothing); the anomaly's bracket drift IS motion and IS gated |
| **C-4** | Globe | The anomaly reads as different in KIND | §4.2 | `AT BAR` claude 2026-08-27 | Now separated on four channels, none of them hue: it sits **off-sphere**, its label is **bracketed**, its value is 132 against the waiting pins' 185, and — the one that answers "in KIND" — **it is the only thing on the globe that moves.** Borrowed from `art/suspected.ts`'s own rule, *"a guess should not sit as still as a fact"*: every pin the machine can place is static, and the one it cannot place will not hold. The brackets snap on `steps(1,end)` at different delays, so it reads as a lock failing rather than as a pulse asking for attention. Gated on `omni-a11y--reduced-motion`, not the bare media query, so the in-game override is honoured |
| **J-1** | Juice | Close every `thin` row in the §9 table | §9 floor | `IN LOOP` claude 2026-08-27 | Four of five thin rows addressed by applying rule 2 (*everything that stops should overshoot*) and its corollary that a constant rate is the one speed nothing physical moves at. **Scan (warehouse):** scaled to exactly 1 and stopped dead on the number; now carries ~4% past and settles. **Grip / clamp:** ring expanded linearly; now eases out — a shock leaves fast and slows as it spreads. **Resolve a mission:** shares `PulseRing`, so it gets the same easing. **Learn a fact:** tree reveal advanced at a fixed rate, which is a progress bar in the shape of a tree — exactly what §175 forbids; now eased out. **Ride the column** is the remaining row and it is a SOUND gap, which is M-4. All four unverified in motion |
| **J-2** | Juice | Overshoot on everything that stops | §9 rule 2 | `AT BAR` claude 2026-08-27 | **Audited every transition in the game; the rule is already kept where it applies, and where it is not there is a stated reason.** Transforms arriving on a plain `ease`: two are `:hover` lifts of 2px — bouncing a hover affordance would make the console read as a toy, and a hover is not a thing that fires; the rest are the contact view's warm-up, where the file says *"the motion is deliberately tiny: hardware warming up, not a web page sliding into place"*. Hardware does not bounce. Opacity fades are out of scope: a fade does not arrive. **The things that do fire now overshoot** — the warehouse scan (added in J-1) and the mower plot. J-1 covers the four §9 rows this rule was written for |
| **P-C1** | People | Post-jam experiment: one character to the bar in her own scene's shot | `Mirela.glb` at that framing | `OPEN` | Do not displace judge-facing work; prototype exists: `experimental/mirela-procedural` |
| **P-C2** | People | `SkeletonProfile` + one Mixamo clip retargeted | The clip reading as itself | `BLOCKED` by P-C1 | Three traps in §4.7 |
| **P-C3** | People | Parameterise the spec: 9 people, not 1 | §185 + thumbnail silhouette test | `BLOCKED` by P-C1 | |
| **P-C4** | People | Swap Mirela into the shipped scene, GLB kept beside her | The mission plays; she is lit by the room | `BLOCKED` by P-C3 | |
| **P-C5** | People | Roll out the remaining 8, one per pass | Each against its own GLB | `BLOCKED` by P-C4 | Warehouse `placeRigged` must be solved first if they go there |
| **P-C6** | People | Delete the GLBs, `debake.ts`, the Tripo paths | Build shrinks, nothing regresses | `BLOCKED` by P-C5 | The only stage allowed to remove a GLB |
| **L-6** | All | Human/AI duality in the RENDERING | `ART-DIRECTION-v1.png` | `DONE` | **"Nothing answers it yet" was stale.** Three mechanisms already do, and all four halves of the idea are on screen at `captures/l6-shelf.png`: *cold+ordered where the machine is* - `suspected.ts` draws a guess as a bounding VOLUME with lit edges that moves, plus `certainty.ts` drains 55%, pulls 50% to `ACCENT.data` and darkens to 74%; *warm+imperfect where a person is* - known props keep their own geometry, built with `jitter()` throughout, and saturate +60%; *boundary fading as the tree grows* - `revealOn` raises tiers as facts land. No work needed; the row was pointing at a phantom like M-1 |
| **L-7** | All | Five named lighting moods instead of one per surface | `ART-DIRECTION-v1.png` | `DONE` | **Premise was outdated; checked rather than assumed.** Counting fixtures in source suggested one look repeated (22 of 25 diorama lights are point lights, which have no direction). Rendered in greyscale the rooms carry six distinct moods - day (4), dusk interior (2), night interior (1), night exterior (3, 6), caustic (5), data/neon (8) - plus the workstation's own day→sunset→night arc from C-2. That is more than five and they are named in D-1. No refactor: a shared mood system would risk seven working rooms to codify a vocabulary that already exists |
| **A-1** | Access | Audit every hue-carried mechanic | §11 | `AT BAR` claude 2026-08-27 | **Every surface audited; one real violation found and fixed; the rule now has a gate.** The globe carried four signal states in hue alone — desaturated, the ANOMALY sat **7.6 levels** from a contact already helped, and `cooldown`/`unknown` shared a hex. Rebuilt as a value ladder (185/132/111/78, closest pair 20.3) with the anomaly bracketed so it differs in KIND (serves C-4). Nine other surfaces audit clean, each carrying a non-hue channel: printed status words, shape glyphs △‖○, emissiveIntensity, a mesh appearing, a 2px ajar shift, per-tier geometry, opacity, changed text, and 170 levels of value. Bar §11. Gate: **`scripts/law5-states.ts`**, canaried against the original bug. Commits 474b5cb, 6b71b70 |
| **P-1** | Post | Per-surface vignette | §6 | `AT BAR` claude 2026-08-27 | **Already satisfied and nobody had checked.** `RETRO_LOOKS` carries a distinct vignette per look and always has: world 0.15, warehouseCel 0.20, warehouseFeed 0.27, console 0.30, machine 0.42 — a deliberate ladder from the room the player is reconstructing to the interior of the instrument. The item was open because it was never verified, not because it was never done |
| **P-2** | Post | Feed artefacts: aberration, signal grain, dropout | §6 | `IN LOOP` claude 2026-08-27 | **The feed had every artefact at zero** — curve, aberration, scanline, grille, bleed, roll, flicker — so the surface whose HUD says REMOTE LINK and LOW BANDWIDTH was the cleanest in the game, cleaner than the console the player sits at. Same inversion the `world` note records for the raster and never fixed here. Now curve 0.02, aberration 0.0026, scanline 0.11, grille 0.18, bleed 0.22, roll 0.03 — all deliberately BELOW `machine`, because a door camera is a cheap sensor on a long cable and the instrument's interior should stay the most degraded thing the player sees. flicker stays 0 (its own comment calls it a nausea risk). **Raster verified:** folding the de-gradiented row means peaks at period 9 with 2.73 against 0.16–0.61 either side. Aberration and roll unverified |
| **X-1** | Hygiene | `.codex/config.toml` carries a live bearer token | ship-clean | `BLOCKED` — needs a human | **Already public since 2026-08-16.** Repo confirmed public via the GitHub API; the identical bytes are in `origin/master`'s tree; **428 pushed commits carry it**; the token is live, since every MCP call uses it. Not-pushing was never the mitigation. **Rotate at the issuer**, then untrack + `.gitignore`. A history rewrite un-exposes nothing on a public repo |

### 13.4 The log

Append one line per completed item. Newest last. Never edit a previous line.

```
YYYY-MM-DD  ID    agent      status   bar / evidence / commit
----------  ----  ---------  -------  --------------------------------------------
2026-08-26  —     claude     created  ART-MASTER.md written; board seeded, nothing built
2026-08-26  T-3   claude     AT BAR   jump.py finds the strip by colour / W1-r2-after.jpg / a0908aa
2026-08-26  W-1   claude     PAUSED   r2 regressed: median 71->114, near-black 26.5%->2.7% vs bar 78/5.0%
2026-08-26  W-5   claude     AT BAR   celStyleEnabled ships true; fill was 2.2 not 0.6 / traced in OmniscientRig:3162
2026-08-26  W-1   claude     PAUSED   cel-branch fill 2.2->0.85 written, UNVERIFIED - Sandbox Studio crashed
2026-08-26  W-1   claude     note     3 real no-ops found by levels.py: dead constant, dead branch, dead paint look
2026-08-26  W-1   claude     IN LOOP  r7 measured 3.4%/86/160/0.0 vs bar 5.0%/78/127/0.0 / df8f931
2026-08-26  W-1   claude     PAUSED   r9 5.9%/60/136 vs bar 5.0%/78/127; 2 critics, same gap / 9c51c3e
2026-08-26  T-4   claude     opened   the capture viewpoint shows one fitting; nine rounds judged from it
2026-08-26  T-4   claude     DECLINED DEV_TOUR already was this; added to the §15 toolbox table
2026-08-26  W-1   claude     PAUSED   4 critics, same gap: no pool is owned by a visible fitting
2026-08-26  W-5   claude     AT BAR   cel A/B: floor profiles identical on/off; it is a style, not a patch / 6f4dd3e
2026-08-26  W-4   claude     AT BAR   critic: 3 nameable landmarks vs "wallpaper" / W4-r1-bays.jpg / 323bfa2
2026-08-26  W-3   claude     BLOCKED  lamp retune is sound; carton reads 162 near vs 164 far = 0.99x
2026-08-26  W-3   claude     IN LOOP  lamp 24 at a bay centre: 3.09x over ambient; racking depolished
2026-08-27  W-3   claude     IN LOOP  cardboard albedo: lamp-lit 222 vs ambient 179, was 221 vs 224
2026-08-27  W-3   claude     AT BAR   critic: gap inverted, 236 vs a 221 ceiling / W3-r6-cardboard.jpg / c0f65c7
2026-08-27  W-2   claude     IN LOOP  fog was outdoor numbers: 0% haze for 32m of a 58m building
2026-08-27  W-2   claude     AT BAR   far wall reads as a plane; lamp grid lit 3 of 6 columns / W2-r3-symmetry.jpg
2026-08-27  W-1   claude     DECLINED phase-shift proves pools are lamp-caused; floor paint outweighs them
2026-08-27  A-1   claude     IN LOOP  warehouse + M4SS growths + certainty audited: no hue-only mechanic found
2026-08-27  P-C1  claude     OPEN     baseline judged: "adjacent, not connected"; hands narrower than wrists
2026-08-27  P-C1  claude     PAUSED   3 rounds: r1 gap CLOSED; still "an assembly of primitives" / dd8aae0
2026-08-27  D-1f  Codex      note     User-directed rule (§12.7): exclude Vasile's entire contact subtree from flood wetness, including late-loaded meshes; room and props unchanged. pnpm lint/build and editor build passed; no rendered verdict, D-1f remains OPEN.
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
| `scene-tenants.ts` | **No diorama builder may name another contact.** Reads the cast from `content/mission-*.ts`, so re-casting a mission cannot leave it describing an old one. Written after `ContactKey`/`ileanaKey` and a `DoorWash` were inserted into `buildRepairShop`: the edit asserted its anchor was unique, which was true and proved nothing about WHICH room it was in |

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
| **`ENDING` on the globe's dev list** | The final transmission panel, without a playthrough. The report is sparse - no requests answered, empty tree - so it judges typography, layout and camera, not what a finished run reads like |
| `dev/m4ss.py [stage]` | **Reach any M4SS stage from a cold start, in one command.** Stage 2 and 3 were unlookable: the rig reads its stage from the save, advancing it needs a keyboard, and keys do not reach this window. Drives the globe list's `M4SS s2`/`s3` entries and walks the three lines of Keller's dialogue that unlock the folder |
| `dev/tap.py X Y out.png [wait] [scale]` | **Click the live game and shoot the result.** Coordinates are in the space of the last `shot.py` capture - the space you actually read them off - so the window-offset arithmetic is not redone by hand each time. Sweeps the cursor rather than teleporting it, so hover states open. `scale 0.5` if you measured on a half-size copy |
| `dev/relaunch.py` | Restart Sandbox Studio. **Do not use it for the art loop** - `exitPlayMode` throws a dialog, and clicking OK with `dismiss.py` is the fix. Restarting drops the open project and costs 90s. Kept only for a genuinely wedged app |
| **The globe's mission list** | **Every mission, one click.** Hover the RIGHT edge of the globe: eleven buttons — the eight contacts, M4SS, the warehouse, the anomaly. Editor only, gated on `isPublishedGame`, hidden until hovered so it is absent from captures. Calls the same `onAnswer` the pins do, so it cannot drift from the real entry path. **Use this before writing anything to reach a mission** |
| `ember-fault.ts` | **Law 5's other half: a signal too SMALL to reach the screen.** Computes device pixels through the retro grid and fails when a mechanic-carrying sprite feature drops under the floor. The original 4px ember computes to 0.83 |
| `law5-states.ts` | **Law 5 as a gate: no mechanic carried by hue alone.** Scrapes state→colour maps, converts to greyscale luma, and fails when two states collapse. Exemptions must name the non-hue channel that carries them instead |
| **`DEV_TOUR`** in `WarehouseRig.ts` | **Park the drone at authored viewpoints inside the warehouse.** Not a script - a dev-gated list in the rig. Empty by default, so populate it, build, capture, and empty it again. This is how you photograph anything that is not at the inbound dock, and `jump.py W` always lands at the dock |

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
