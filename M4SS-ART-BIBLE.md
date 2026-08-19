# M4SS — ART BIBLE

**Status:** authoritative for everything inside the M4SS stages. Where this and older M4SS
notes in M4SS-POLISH.md disagree about how something should *look*, this wins. The gauntlet
log remains the record of what was *tried*.

**Scope guard:** gameplay is frozen. Nothing in this document may move a collision surface,
a physics number, or a level layout. Art planes, textures, lighting, decor, HUD skin only.

---

## 0. The direction, in one sentence

**A containment laboratory that the forest ate.**

Not a bioluminescent forest with some machines in it — a *laboratory*, built by people, for
one purpose, overrun by the thing it was built to study and by the flora that fed it. The
current art shipped the forest and forgot the lab. The reference set is titled, in its own
margin, "an overgrown greenhouse-laboratory hidden within the cavern roots — nature and
alchemy entwine." That is the brief, and it is better than the one we executed, because it
is *Dana Keller's brief*.

---

## 1. Story fit — what this place is

M4SS is the file Dana Keller sends you. In OMNISCIENT_'s fiction she is monitoring a
containment site; the "game" is the site's specimen-handling interface, and you are driving
the specimen. So the environment must answer four questions on sight:

**What is this place?** A subterranean bio-containment greenhouse — a research station
built *into* a cavern system, its masonry threaded with pipework, its galleries roofed in
glass lattice, its floor sluiced with the specimen's own culture medium. Long abandoned by
its staff; not abandoned by its experiments.

**Who built it?** People. Human artifice reads as **warm amber** (lamps, filament lights,
brass) and **rusted iron** (pipes, gates, presses). Everything human is rectilinear,
riveted, and losing — moss in every seam, roots prying every joint.

**Why is a slime here?** It was grown here. The specimen's chartreuse is the *only* thing
in the palette that colour: wherever you see slime-green, it is either you, a piece of you,
or the culture medium the lab pumped through everything — the ooze in the tile seams, the
falls of green liquid, the glow in the bell jars. The world is stained with the player.

**What are the growths, in-fiction?** Cultivated anchor-organisms — tendril cultures the
lab grew as handling points for the specimen (the thing it latches to and swings from).
A **live culture is green** and softly luminous: the lab's nutrient feed still reaches it.
A **dead culture is red-brown ember**: feed cut, dormant, until a power plate re-opens the
line. Buttons are those power plates. Gates are containment bulkheads. Sieves are
filtration grates — sized to pass ooze, not a whole specimen. Crushers are specimen
presses. The exit portal is the pneumatic specimen-transit tube. Every mechanic already in
the game is a piece of lab equipment; the art's job is to dress it as one.

**Stage 1 — "the Gallery."** The greenhouse gallery: horizontal, warm, morning-lit through
a broken glass dome. The forest has won here gently — moss and ferns, amber lanterns still
burning. Mood: curious, safe enough, first steps.

**Stage 2 — "the Stack."** The service shaft under the lab: vertical, cold, wet,
industrial. Flora sparser and bluer; light falls in pale shafts through grates far above;
the machinery here still *moves*. Mood: the lab's basement — this is where they kept the
things that needed pressing.

---

## 2. Reference study — what each image does that we don't

**Background1.png** (misty forest interior, god rays)
1. **God-ray shafts**: broad diagonal light volumes from upper frame, brightest in the
   mid-band, giving the value structure a *direction*. We have uniform haze; light comes
   from nowhere.
2. **Lit strand tips**: the hanging moss curtains catch warm light on their tips — hanging
   detail is lit, not just silhouetted. Our canopy is pure ink.
3. **Lost bottom edge**: the ground plane dissolves into dark mist — no hard floor line
   anywhere. Our world floor is a hard horizontal.

**Background2.png** (overgrown lab-city in the trees)
1. **Architecture inside the haze**: glass domes, spires and pipework silhouetted at the
   *same value* as the haze layer they sit in — buildings as forest. Our far layer is
   trees and two ghost towers; the lab is missing.
2. **Interior light**: windows and dome panes glow warm from *inside* — habitation light,
   not lantern dots. Nothing in our backdrop is lit from within.
3. **Repoussoir trees**: the two largest, darkest trunks hug the left and right frame
   edges, pushing the eye centre-ward. Our trunks are distributed evenly; the frame edges
   are open.

**ChatGPT 08_49_58** (gameplay mock — the standard to beat)
1. **Every platform wears a lit lip**: the top edge of every walkable surface carries a
   bright moss rim that catches the key light; faces fall dark immediately below. Ours got
   the interior fade but the lip is timid.
2. **The ooze-fall is a light source**: green liquid pours off a ledge, glows, pools, and
   the pool casts light up onto the rock. Our pools glow but nothing *feeds* them.
3. **Warm/cool hazard split**: spikes and hostile hardware sit in a rust family, clearly
   apart from the green world. Our crushers are grey boxes with hazard chevrons.
4. **Dressed HUD**: portrait roundel with the creature's face, mass bar, ability slots
   with keycaps, objective card top-right. Ours is a clean gauge — legible, but it belongs
   to a different, more clinical game.

**ChatGPT 08_50_08** (gameplay mock — machine hall)
1. **Bell jars and vessels as midground props**: glass containers with glowing green
   contents — the lab's purpose made visible. We have no vessels anywhere.
2. **The dome lattice as background**: a huge glass roof, backlit by haze, fills the upper
   background — instantly "greenhouse". We have trees only.
3. **Water doubles every light**: standing water reflects each glow as a vertical smear.
   Our pools reflect nothing.

**ChatGPT 08_50_12** (UI sheet)
1. **The UI is *of the place***: every panel framed in vine-wrapped dark metal, moss
   growing on the frames, drips hanging off the plates.
2. **The creature's face on the HUD**: the portrait gives the specimen charm and makes
   mass loss legible emotionally (the blob glyph half-does this).
3. **One accent discipline**: glow appears only on interactive/positive elements; frames
   and chrome stay dark.

**ChatGPT 08_50_15** (design sheet)
1. **The slime has a face.** Two dot-eyes, pupil catch-lights. Idle/move/stretch poses all
   keep the eyes. Ours is an eyeless mass — technically a blob, emotionally a puddle.
2. **Multi-family palette strip**: the sheet's own swatch row is olive, dark green,
   yellow, teal, blue, purple, orange — variety is doctrine, not accident.
3. **Environment vocabulary drawn as objects**: mass gates are stone doorways with glyphs,
   squeeze-throughs are arch slots — each mechanic has a *drawn identity*. Ours are
   texture-mapped boxes.

**ChatGPT 08_50_18** (parallax breakdown — the layer spec)
1. **Six layers with speeds**: occluders 120% / props 90% / play 0–5% / midground 60% /
   far 30% / haze 10%. We run three forest planes + backdrop; no occluder layer in front
   of the play plane, no prop layer behind it.
2. **"Colour temperature and detail density reinforce depth"**: near = coolest and
   darkest and most detailed silhouette; far = warmest-of-the-haze and simplest.
3. **The midground is *structures*** — greenhouse domes, tanks, pipe runs — not more
   trees. Depth reads because the layers are different *kinds* of thing.

**exec-…png** (the tile texture itself)
1. **Rounded stones, individually shaded**, dark grout seams — not our square block grid.
2. **The ooze lives in the seams**: chartreuse culture medium fills the grout and drips
   down stone faces. Seam colour = player colour = the lab is stained with you.
3. **Pipes are IN the masonry**: rusted pipe runs with riveted plates weave through the
   tilework. The lab is not furniture placed on stone; the stone is plumbed.

---

## 3. Five principles (named, committed)

**P1 — Silhouette first, at 20% zoom.** Every gameplay-relevant shape (slime, growths,
gates, buttons, crushers, portal, platform edges) must read at heavy blur by silhouette
and value alone. Interior detail never crosses a silhouette boundary. Test: every capture
gets a squint-check (downscale to 20%, judge by value order alone).

**P2 — One family per room, accents reserved.** Each stage holds ONE desaturated
environment family. Chartreuse is *reserved*: player, player-fragments, culture medium,
live growths. Amber is *reserved*: human artifice still powered. Rust-red is *reserved*:
dormancy and danger. If chartreuse appears where the player can't go or use, it is a bug.

**P3 — The frame is closed and layered, six deep.** Occluders (fast, near-black) →
foreground props (90%) → play plane → midground structures (60%) → far organics+lab (30%)
→ haze with god rays (10%). Top closed by canopy, corners by vignette, bottom lost in
mist. The midground must contain *architecture*, not only trees.

**P4 — Light the surface, lose the body.** Every mass: lit walked edge, dark interior. No
patterned rectangle anywhere. Light has a direction (upper-left key in stage 1, overhead
shaft-light in stage 2); glows pool and reflect in water.

**P5 — Everything drips, everything breathes.** No clean horizontal longer than ~80px:
moss lips, dangles, ooze strands, drips break every line. Ambient motion always: spore
drift, drip particles, ooze-fall shimmer, growth sway. A still frame should still look
*wet*.

---

## 4. Color script

### Value hierarchy (both stages, non-negotiable)
1. **Player slime** — brightest thing alive: core `#d8f26a`, highlight `#f2ffb0`.
2. **Interactables** — live growths `#8fe86a` + halo, buttons lit `#aef07e`, portal
   `#7fe8c8`, ooze medium `#b9d94a`.
3. **Hazards** — crusher warning `#d8703c`, dormant growth ember `#c4553f`, rust family.
4. **Environment** — holds the dark. Nothing environmental brighter than a hazard.

### Stage 1 — "the Gallery" (warm green, morning)
- Haze / far air: `#1d413a` → `#16302c` (existing family, kept)
- God rays: `#2f5c46` additive, diagonal
- Stone: `#1a2220` / `#28322e` / lit `#38443e`, **rounded** stones, grout `#0e1613`
- Seam ooze: `#5c7a26` → `#8fae3a` (drips `#b9d94a` at feed points)
- Moss lip on walked edges: `#5c7a26` base, `#8fae3a` lit crown
- Human artifice: brass/amber lamps `#c99a3f` glow / `#8a6a2f` metal; pipe rust `#6b4a34`,
  plate steel `#4a5850`
- Greenhouse dome (midground): lattice `#233c34` against haze, panes backlit `#2c554a`,
  three warm interior lights per dome `#c99a3f` at 40%
- Foreground occluders: `#060c09`
- Accent spots (≤3 per stage): mushroom caps `#8f4a7e`/`#5a2f52`

### Stage 2 — "the Stack" (cold teal, industrial)
- Haze / far air: `#15303a` → `#102028` — the family walks BLUE
- Shaft light: `#3a6a72` additive, vertical columns through grates
- Stone: `#161e22` / `#242e34` / lit `#32424a` — same drawing, colder mix; wall variant
  dominant
- Seam ooze: sparser, darker `#4a6a20`, feed long cut
- Human artifice: amber almost gone — service lights pale cyan `#7fc8d8` (2–3 only);
  rust heavier `#7a4a2c`, standing water `#0f2a2a` with reflected smears
- Crushers: rust-and-steel presses, warning band `#d8703c`, wet-black slab faces
- Dormant growths: ember `#c4553f` (kept — it works)
- Foreground occluders: `#04080a`, pipe and grate silhouettes rather than leaves

### Temperature rule
Stage 1 is the warmest the game gets; stage 2 removes the warmth (amber → cyan, moss →
blue-green) so the two stages cannot be mistaken for each other even in thumbnails.

---

## 5. Stage identities (the thumbnail test)

| | Stage 1 — Gallery | Stage 2 — Stack |
|---|---|---|
| Axis / feel | horizontal, open, morning | vertical, compressed, midnight |
| Temperature | warm green + amber | cold teal + cyan |
| Midground | glass dome, bell jars, benches | pipe stacks, tanks, grates |
| Flora density | dense — ferns, canopies, moss | sparse — drips, dead vines |
| Light | diagonal god rays | vertical grate shafts |
| Water | ooze-fall feeding pools | standing black water, reflections |
| Occluders | leaves, branches | pipes, grate edges |
| Human presence | lost long ago, gently | still mechanical, still moving |

---

## 6. Implementation map (for the gauntlet, not for phase A)

- `StageTheme` object (palette + light direction + midground kind + occluder kind),
  passed through every generator; `lab.ts`/`shaft.ts` each own one.
- `stoneTexture` → rounded-stone rewrite with grout ooze + embedded pipe runs (per
  exec-… reference); keep world-aligned offsets, keep wall variant concept.
- New: `domeTexture` (greenhouse lattice midground), `vesselTexture` (bell jars),
  `pipeStackTexture` (stage 2 midground), `oozeFallTexture` + fed pools, `godRayTexture`,
  occluder layer in front of play plane (z > 45, moves faster than camera).
- Slime gets **eyes** (two dark dots + catch-light on the largest body, following
  velocity; hidden during 360-spin blur).
- Crusher/gate/button dressed as lab equipment; HUD panels get vine-metal frames.
- Everything drips: drip particle emitters on tile undersides and canopy.

Feature freeze is Sept 2. The gauntlet runs foundation-first (theme plumbing, stone, lab
midground), then critique passes; if time runs out mid-list, every pass leaves the game
shippable — that is what one-change passes are for.
