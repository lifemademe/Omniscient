# OMNISCIENT_ — Art Direction

**Status:** authoritative. Where this and GAUNTLET_v4.9 disagree about how something should
look, this wins. Where they disagree about whether something *works*, the gauntlet wins.

---

## 0. The direction, in one sentence

**You are not looking at these rooms. You are looking at a machine's reconstruction of them,
and how resolved it looks is how much it understands.**

OMNISCIENT_ has never seen Mirela's workshop. It is building the room out of a voice on a
phone line. Every frame the player sees is an inference, and the art's job is to make that
legible at a glance.

### Why this and not "stylised realism"

Rendering the dioramas as real places puts every untextured primitive in the game into the
category *unfinished*. There is no polish route out of that — a flat white box in a real room
is a bug no matter how well it is lit. Under this direction the same box is **correct**: she
never said what was in it. The work becomes making it read as *unknown* rather than as
*unmade*, which is a material problem with a solution.

It also settles the 90s futurism question. Flat-shaded polygons, wireframe, gouraud shading,
phosphor colour and chunky readouts are exactly what a confident but crude reconstruction
looks like. So the unresolved end of the scale **is** 1994, the resolved end is warm painterly
stylisation, and the rendering travels forward in time as the player learns the place.

§187 is hereby amended: the machine's visual language may appear anywhere, because everything
on screen *is* the machine. What §187 was protecting — that these are real places with real
people and real stakes — is protected better by this than by the old split, because the warmth
arrives as a **reward for listening**.

---

## 1. The certainty scale

Every prop carries `certainty` in 0–1. It is authored per beat by the mission content, not
guessed. Five tiers, and each one is a complete specification — no "somewhere between".

### Tier 0 — ABSENT · `0`
The machine has no reason to believe it exists. Not rendered at all.

### Tier 1 — SUSPECTED · `0.01 – 0.29`
*Something is there.* **Built — `art/suspected.ts`.**

- **Geometry** — the prop's bounding volume, not the prop. A recognisable silhouette is a
  claim of knowledge; if a box keeps its own corners while representing something nobody
  has described, the picture is lying about what the machine has been told.
- **Material** — unlit fill (`#0a141a`) with a 1px emissive wireframe on every silhouette
  edge, in `ACCENT.data`.
- **Motion** — drifts ±2 cm at ~0.15 Hz and breathes in opacity between 0.42 and 0.62. The
  machine is *guessing*, and a guess should not sit still.
- **Light** — casts nothing, receives nothing. It is not in the world yet.

**Amended on contact with the room.** The fill was specified at `#050b0e` and 0.55–0.8, and
both were wrong in practice for the same reason. This game's interiors sit around value 40
with a lot of shadow, so a volume darker than the darkest wall does not read as an object —
it reads as a **hole**, a piece of the world that failed to load, which is the exact
impression this tier exists to dispel. Lifted, cooled and made more transparent, it sits in
the dark end of the room's own range instead of below it, and the wall stays faintly visible
through it. A void becomes a **marked region**, which is what the machine is actually doing.

**Apply it to the right prop.** The shelf as one prop became a single black slab filling the
left third of the frame — compositionally it replaced that side's only vertical rhythm with
nothing, and in fiction it was a lie, because the machine has no reason to doubt that a
woman standing in her own workshop has a shelf. Split, the unresolved sits inside the
resolved. **Tier 1 goes on the contents, not on the furniture.**

### Tier 2 — SHAPED · `0.30 – 0.59`
*I know its shape.* **This is the 90s CG tier and the game's default resting state.**

- **Geometry** — the real mesh, flat-shaded, faceted.
- **Material** — one flat colour, desaturated and pulled 70% toward cold (§2). No maps.
- **Detail** — wireframe still visible along silhouette edges only, at 30% opacity.
- **Light** — casts and receives shadow. Enters the world.

### Tier 3 — DESCRIBED · `0.60 – 0.89`
*I know what it is made of.*

- **Material** — `MeshStandardMaterial` with base colour, roughness and normal maps.
- **Variation** — per-instance seeded jitter is live: colour ±4%, roughness ±12%, scale ±3%,
  rotation ±2°. **No two instances may be identical from here up.**
- **Colour** — 25% toward cold. Crossing into human territory.

### Tier 4 — KNOWN · `0.90 – 1.0`
*This is the thing we are talking about.*

- Everything in tier 3, plus wear, edge damage and decals.
- **Colour** — fully warm, the scene's own palette, no cold pull.
- A practical light or a bounce card if the object plausibly emits or catches one.
- The scan reticle attaches **here and only here**. One or two per room, never more.

---

## 2. The colour law

**Warm is known. Cold is inferred.**

The scale is **signed**, with a neutral point at certainty **0.7**. Below it, colour drains
and slides toward `ACCENT.data`. Above it, chroma comes up and the colour leans toward
`ACCENT.amber`. An object somebody has just described does not merely stop being blue — it
visibly comes to life, which is the reward this whole direction exists to pay. A law with
only one direction cannot build a focal point; it can only fail to destroy one.

It is applied **in the shader**, after `map_fragment`, not on `material.color`. Colour is a
multiplier on the texture: it can dim a map, never desaturate one. The pegboard proved it —
halved in saturation and pulled a third toward cyan, it came out the same amber, merely
darker. Injecting after the map means lighting, shadow and tone mapping all see the
corrected albedo, so a cooled surface also bounces cool light. Nothing else needs to encode progress:
the player's eye goes to the warmest thing in frame, and the warmest thing in frame is what
they have earned.

This gives every shot automatic warm/cool composition for free, which is the single most
reliable trick in the reference frames and the one this game has never had.

**Consequence to hold to:** a room at the start of a request is almost entirely cold, and that
is correct. It should look *lonely*. The warmth arriving is the game.

---

## 3. The resolve

The signature moment, and the thing that must feel expensive. **Built — `art/suspected.ts`,
everything below except the audio cue.**

When a prop's certainty rises, a **horizontal sweep** crosses its bounding box over 0.6 s,
bottom to top. Below the line the new tier, above it the old one, with a 1px emissive rule at
the boundary carrying a short bloom spike. Detail is left behind as the line passes, like
something developing.

- Ease out, not linear. It should decelerate into place.
- One audio cue, dry and short. Not a sci-fi swell.
- Never more than two resolving at once. If a beat unlocks three, stagger by 180 ms.
- **It is a reward.** If it becomes ambient it stops being one.

---

## 4. Material rules

These are not stylistic preferences. They are the difference between an asset and a primitive.

1. **Silhouette, then value, then colour, then texture.** In that order. A failure at
   silhouette is not recoverable by anything downstream.
2. **Three values minimum on every object.** A single flat fill is not a material. Even at
   tier 2 the flat colour needs a light-facing and a shadow-facing value.
3. **No two instances identical.** Seeded per instance from the scene's RNG (§295 — never
   `Math.random`).
4. ~~**Every tier-3+ material carries base colour, roughness and normal.**~~ **Withdrawn.**
   `surface.ts` deleted its normal maps deliberately and the argument in that file wins:
   micro-relief under six lights is a realism cue that pulls against the stylisation, and
   removing it is most of the distance to a flat style on its own. It also lets the light
   banding read at full strength, because nothing grainy is left softening the band edges.
   The rule that replaced it is better and is stated there: **texture earns its place by
   being evidence, not by being material.** Wear along an arris is an event; crackle enamel
   only says "this is enamel". A `null` slot here is a decision, and the slots stay empty.
5. **Texel density is consistent within a room.** A crate and a wall at wildly different
   densities read as a collage.
6. **Unlit is a decision, not a default.** 47 `MeshBasicMaterial` against 35
   `MeshStandardMaterial` is the wrong ratio. Unlit is for sky, sea, backdrop, painted
   distance, UI and tier-1 wireframe. Everything else is lit.

---

## 5. Per-room intent

One sentence each. If a change does not serve the sentence, it is the wrong change.

| Scene | Intent |
|---|---|
| `scene-repair-shop` | A careful person's workbench, over-lit in one small pool and dark everywhere else. **The proving ground — this room ships first and best.** |
| `scene-beacon-mast` | Exposed, wind-scoured, nothing soft. The only warmth in frame is the failing beacon. |
| `scene-seedling-tunnel` | The calmest image in the game. Afternoon, still water, long shadow across the beds. Nothing urgent. |
| `scene-cleared-house` | Emptied, not abandoned. Clean rectangles on the walls where things used to hang. |
| `scene-flooded-cellar` | Everything below the line is another material. Reflection does the work. **Built — lit water, `art/waterline.ts`, and a ceiling.** |
| `scene-night-door` | One practical, one hand, and a lot of black. The most contrast in the game. |
| `scene-mill-road` | A torch beam is the only volume. Everything outside it is tier 1 by *diegetic* right — she genuinely cannot see it either. **Built — `art/torchlight.ts`.** |
| `scene-wire-city` | Tier 2 forever, on purpose. The machine has never been here and never will be. Full CRT. |

`scene-mill-road` is the direction's best joke and should be built with care: there, the
uncertainty is *hers*, not the machine's, and they render identically.

**What building it taught.** Tier 1 is authored per prop and this could not be, because
what is knowable here changes every time the player moves the beam — so the boundary has to
live where the beam does, which is per pixel. That turned out to be the more interesting
version of the whole direction: §3's resolve is a reward you are *given*, and this is one
you *hold*. Any future scene whose uncertainty is a place rather than an object should reach
for `torchlight.ts` rather than for a certainty tier.

**And a rule about air.** The room's worst fault was not a surface, it was the fog on top of
one: a daylight haze at full strength by 26 metres, painted across the far half of a
midnight corridor. It measured at luma 48 against a wall at 7 and it looked, at a squint,
exactly like a badly lit wall. **A night scene needs fog the colour of the night, not less
fog** — turning atmosphere off takes the depth with it, and on a corridor the depth is the
composition. Scenes state their own air now; the other three night sets are worth checking
against this before anything else in them is touched.

---

## 6. Critique protocol

Run this every time, in this order. Stop at the first failure and fix that.

1. **Capture** the shot the player actually sees. Not an editor view.
2. **Put it beside the reference at the same pixel size.** Not from memory.
3. **Squint / downsample to 10% and look at silhouette and value only.** If the read fails
   here, nothing else matters yet.
4. **Name the fault in art language** — silhouette, value, colour, detail hierarchy, focal
   point. Not in engine language.
5. **Fix the earliest failure in that list.** Not the most interesting one.

### What measurement is for

Numbers answer **"is it running"** — is the pass live, did the shader compile, is the frame
budget intact, is the effect present at all. Numbers do **not** answer "is it good".

**Never settle a taste question with a number.** An afternoon was spent measuring a 4.5 px
periodicity that turned out to be an artefact of the screen-capture path (§224). None of it
was an art question and none of it improved a pixel.

### The hour rule

**If an hour produced no new pixels, it was the wrong hour.** Infrastructure is permitted only
when it unblocks art, and when it does, say so out loud and get back to the art.

---

## 7. Out of scope

Named so they stop being re-litigated:

- Photoreal anything. This is stylised, and the stylisation carries meaning.
- Fidelity as an end. A tier-2 room that reads perfectly beats a tier-4 room that does not.
- Rebuilding the missions. The writing is done. Art serves it.
- WebGPU-only effects (§221). Depth of field, SSR and pixelation are unavailable and are not
  coming back. The retro pass was rebuilt by hand because it was worth it; those are not.
