# M4SS Stage 1 — the polish gauntlet

A loop for grinding stage one up to the reference art. It exists because the alternative —
capture, squint, change something, capture again — went backwards twice in one session
without either step being noticed at the time.

## Before the first pass (once)

Drop the reference art into `assets/reference/m4ss/`. Any PNG or JPG. The audit averages
their statistics into the targets it scores against; without them it can only catch
regressions against the previous pass, which is half the value.

## One pass

Exactly one change per pass. That is the whole discipline — with two changes and a worse
score you cannot tell which one did it, and the honest response is to revert both.

1. **Score the current build.** Capture the running stage, then:
   ```
   python scripts/m4ss_art_audit.py <capture.png>
   ```
   It prints every axis against the reference target, the movement since the last pass, and
   a ranked `WORK ON` list. If it prints `REGRESSED`, the previous pass made things worse:
   revert it before doing anything else.

2. **Take the top item off `WORK ON`.** Not the one that looks most interesting. The tool
   ranks by normalised distance from the reference, which is the closest thing to an
   objective answer to "what is most wrong".

3. **Make one change** in `src/m4ss/stageArt.ts` (or the rig, if it is placement rather than
   texture).

4. **Re-verify the gameplay is untouched:**
   ```
   npx tsx scripts/m4ss-stage.ts
   ```
   All 20 must pass. Art must never move a platform, a growth or a wall — if a check fails,
   the change went too far and is a level edit wearing an art hat.

5. **Rebuild, recapture, re-score.** Keep the change only if the target axis moved toward the
   reference and nothing else regressed.

6. **Log it below**, one line. The log is how the next pass knows what has already been
   tried, since it will not remember.

## Rules that stop this thrashing

- **One change per pass.** Non-negotiable.
- **Revert on regression.** A change that worsens its own target axis is wrong even if it
  looks nicer in isolation.
- **Never edit `lab.ts` geometry.** Positions, widths and heights are load-bearing for the
  swing arcs and the reach economy. Art goes over them, never through them.
- **No anti-aliasing, ever.** Every draw in `stageArt.ts` is an integer `fillRect`. One
  smooth curve and the stage stops being pixel art.
- **Palette discipline.** New colours come from `PAL` in `stageArt.ts` or get added to it.
  A colour used once, defined inline, is how a coherent palette dies.
- **Stop when the top `WORK ON` item is under ~10% off.** Past that the tool is measuring
  noise and it is a human's call, not a number's.

## What pass 1 established (do not re-derive)

- **`toneMapped: false` on a material does nothing on this renderer.** It was set on every
  stage-art surface and the audit did not move by a decimal. The grade comes from the scene
  file (`assets/default.genesys-scene`: ACES, exposure 0.5) and applies regardless. The flag
  is still set because it is correct and costs nothing, but it is not a lever.
- **The only lever on value is the source art**, via the `lift` curve in `stageArt.ts`.
- **Darks and lights need different gains.** ACES compresses the top hard and leaves the
  bottom nearly alone, so a shadow needs almost no help and a highlight needs a lot. A flat
  multiplier cannot serve both; an additive floor is worse still, because a constant lifts
  near-black by a far larger fraction than anything else.
- **Backdrop detail must be authored at 1024px, not 512.** The plane is scaled to 1.6x the
  level, so a 512-wide canvas puts roughly four screen pixels on every detail pixel. A lamp
  glow drawn as a 36x42 rect became a hundred-pixel flat khaki block that read as a misplaced
  UI panel. Anything drawn into the backdrop needs to be small in canvas pixels.
- **A count authored per tile is multiplied by the repeat, squared.** Pass 16 asked for 120
  motes at a texture repeat of 3.2 and got about twelve hundred on screen. This is the third
  instance of the same class of mistake in this project - a number that is reasonable in the
  space it is authored in and is scaled by something on the way to the frame. The other two
  were the pass-4 lamp squares and the pass-11 speculars. Whenever a value is authored in
  texture space, work out what it becomes in screen space before trusting it.
- **A highlight must survive downsampling.** Pass 11 scattered 1-2px speculars over every lit
  stone and it measured WORSE on the axis it targeted. At the scale these textures display -
  and at the scale anything samples them - a single pixel is not a highlight, it is noise that
  averages into its neighbours. Speculars belong on a FEW large wet surfaces (a pool, a sheet
  of water down a wall, one lit block top), not scattered as pips.
- **Nested contours are free shading.** The slime is drawn by marching squares over a scalar
  field, so a HIGHER threshold yields a smaller shape automatically nested inside the body and
  automatically following every wobble of it. Offsetting the SOURCE POINTS rather than the
  finished mesh is what keeps the highlight on the silhouette when the blob is moving fast.
  Any future slime detail - bubbles, a wet rim, a squash highlight - should come from this
  rather than from textures or UVs, which a mesh rebuilt every frame cannot carry.
- **The audit also UNDER-measures atmosphere.** Pass 7 added light shafts and spores - the
  single largest visual improvement of the whole run - and moved palette by 3 and nothing else
  meaningfully. Distributional statistics cannot see composition, depth or air. Once the axes
  are within ~20%, the structural list is worth more than the numbers.
- **The audit can be satisfied by art that looks worse.** Pass 4 improved five axes on its
  first draw and was visibly a downgrade. ALWAYS look at the capture before accepting a pass;
  the numbers rank what to work on, they do not judge whether it is well drawn.
- **Palette size is a HUE problem, not a value problem.** It sat at 52-55 across three
  passes that changed values, gains and mutes. The quantiser buckets at 16 levels a channel,
  so a monochrome green-teal ramp occupies few buckets however many steps are in it. The
  reference reaches 100 because it has greens AND purples AND warm rusts AND cyans. `palette
  size` and `hue families` are the same finding twice - fix them together by introducing
  genuinely different hue families (rusted metal, purple caps, a cold cyan), not more greens.
- **The reference target has a wide spread** (saturation 21.6 to 54.7 across the six images,
  because some are painted scenes and some are spec sheets with large flat panels). Treat
  anything inside about ±10 on saturation as within reference variance rather than as a miss.
- **`mean saturation` is unreliable below ~25 midtone.** Ratio saturation `(max-min)/max` is
  unstable at low luminance, so a very dark frame scores as wildly saturated. It ranked first
  for two passes while the real fault was exposure. Trust it only once the value axes are
  near target - which they now are.

## Known gaps, roughly in the order they are worth doing

These are the things I know are missing, from comparing the current build to the reference by
eye. The audit will re-rank them; trust the audit over this list.

- [x] ~~**Largest flat %**~~ — pass 3. 51.0 → 16.4.
- [x] ~~**Non-green hue families**~~ — warm rust and lamplight (pass 4), cyan and purple flora
      (pass 5). `hue families` on target.
- [x] ~~**Midtone**~~ — pass 4's lanterns. 12.8 → 31.1.
- [x] ~~**Tonal steps within materials**~~ — pass 6. Stone, moss and leaves off ramps.
- [x] ~~**Light shafts and spores**~~ — pass 7. Biggest visual gain of the run for a 3-point
      metric move; the clearest evidence that the audit under-measures atmosphere.
- [x] ~~**Glow around emissive things**~~ — pass 8 (slime, portal), pass 14 (lanterns).
- [x] ~~**Platform top silhouettes**~~ — pass 9. Rubble and tufts break the straight line.
- [x] ~~**The slime is untextured**~~ — pass 10. Shine and belly contours.
- [x] ~~**Platform end caps**~~ — pass 13. Both ends calve into the void with trailing roots.
- [x] ~~**Bubbles in the slime**~~ — pass 15, attempted and DECLINED. Never read at the size
      the slime renders, and cost palette. Technique right, target too small.
- [x] ~~**`value range` / `palette size` / all metric axes**~~ — closed by pass 12, not by
      moving them but by discovering they were already inside the reference SPREAD. The
      per-axis targets these lines used to quote were means across six references that
      disagree wildly with each other; chasing them cost passes 11 and 12.

**The structural list is empty.** Everything on it is done or deliberately declined with a
reason on the record.

What is left is invention rather than outstanding work, and should be chosen by a person:

- Scattered decoration between the growths — mushrooms, ferns, small props on the platforms.
- Backdrop silhouettes are still hard rectangles; the reference's are organic.
- The bushes could take a rim of lit leaves to separate them from dark stone.
- [x] ~~Drifting spores~~ — pass 16. ~~Swaying flora~~ — pass 17. Still open: a shine on the
  slime that shifts with movement direction.
- A second parallax layer, and lighting that reacts to where the slime is.

## The metric phase is over, and the tool now says so

Pass 12 checked the capture against the reference SPREAD rather than its mean, and every one
of the eight axes is inside it. Highlight runs 58 to 167 across the six references and palette
37 to 170, because some are painted scenes, some are annotated spec sheets with bright text,
and one is a tiling texture. Their mean is a value that no individual reference actually is -
so `highlight −15.9` never meant the stage was too dark, it meant the stage was not the
average of a screenshot and a UI mockup.

Two passes were spent chasing that before it surfaced. Pass 11 tried to lift highlights that
were already sitting between the two real gameplay frames, and measured worse for it.

The audit now marks in-range axes and refuses to rank them. When everything is in range it
says so and points here. Keep running it every pass as a REGRESSION GUARD - it is still the
only thing that will catch a change quietly wrecking the value structure - but the remaining
work is composition, light and silhouette, and it cannot see any of those.

## A note on passes 7 to 9

Passes 7, 8 and 9 were all kept on judgement rather than on score - atmosphere moved the
metrics by 3, emissive bleed by 0, and the ragged lip cost 3. That is not the loop failing;
it is the loop telling you the metric phase is over. Six of eight axes are on target or inside
reference variance, and the remaining work is composition, light and silhouette, which
distributional statistics cannot see.

Keeping a change against the score three times running is also exactly how discipline erodes,
so it is worth saying plainly: from here the audit is a REGRESSION GUARD. Run it every pass to
catch a change that wrecks something, but stop choosing the next pass from its ranking and
start choosing from the structural list below.

## Log

| Pass | Axis targeted | Change | Result |
| ---- | ------------- | ------ | ------ |
| 0 | — | Baseline: backdrop, mossy stone, vine curtains, bushes, portal | flat% 51.0, range 56.4, palette 41 |
| 1 | value range / exposure | Pre-compensate `PAL` for the scene's ACES-at-0.5 grade, with a gain that rises with value (1.15 dark → 2.3 light) | shadow 6.4→12.8 (target 11.6), midtone 12.8→25.2 (27.3), highlight 62.7→91.9 (110.1), range 56.4→79.1, palette 41→62, flat% 51→36.6, hues 5→5. Every axis improved on baseline except saturation (81.4→84.2). |
| 2 | mean saturation | Mute `PAL` by ROLE: structure pulled hard toward its own grey (0.30–0.36), accents kept or raised (0.8–1.0) | **sat 84.2→40.7** (target 33.6; 150%→21% off), shadow →12.1, flat% 36.6→31.7. Minor costs: palette 62→55, hues 5→4. Kept. |
| 3 | palette size | Midground band of tanks and pipe runs in the backdrop | **flat% 31.7→23.0** (target 26.7 — hit). But the STATED target missed: palette 55→53, and midtone 24.6→19.2. Kept for flat%, relabelled honestly. A follow-up brightening of the midground tones was tried and reverted (worse on 4 axes). |
| 4 | palette size / hue families | Add a WARM family (rust, lamplight) to `PAL` and carry it on the midground metal and hanging lanterns | **palette 52→65** (biggest jump yet), **hues 4→5 on target**, midtone 19.2→33.3, range 78.7→81.2. First draw looked WORSE than it measured — lamp pools were hard 36x42 squares reading as UI panels — so the backdrop went 512→1024px and the pools became round blobs. Final: palette 59, sat 37.7, flat% 16.5, hues 5. Kept. |
| 5 | palette size | Give the FLORA cool and purple accents: bioluminescent cyan pips through the moss, five real purple caps and drifting spores on the bushes | palette 59→62, **midtone →26.7 (target 27.3, on target)**, highlight →93.9. Costs: shadow +1.2, range −0.4. Kept. Also fixed the tool: `largest flat %` is now one-sided, because being BELOW it means the frame is more varied than the reference, which is not a fault. |
| 6 | palette size | Tonal RAMPS within each material: stone blocks off a 7-step ladder with lit tops and shaded feet, moss tongues shaded along their own length off 6 steps, leaves off 5 | **palette 62→67** (best gain since the hue work), midtone →29.5, others flat. Stone now reads as worked masonry rather than noise. Kept. |
| 7 | structural: atmosphere | Light shafts raked from upper-left in hard bands, plus 220 drifting spores, on an additive plane at z 30 (in front of the level, behind the slime) | palette 67→70, sat 37.0→35.9, midtone +1.4. **The largest VISUAL gain of the run** and only a modest metric move - the scene finally reads as a volume with air in it rather than stacked flat layers. Confirms the audit under-measures atmosphere. |
| 8 | structural: emissive bleed | Stepped radial glow behind the portal, and one that follows the slime scaled by sqrt(mass) | Metrics essentially FLAT (midtone +0.5, all else 0.0). Visually the slime now lights the platform under it instead of reading as a pasted sprite, and splitting visibly dims you. Kept on judgement, not on score. |
| 9 | structural: silhouette | Ragged stone-and-moss lip straddling every platform's top edge, breaking the straight line with rubble and tufts | palette 70→65 on the first draw (the lip covered the platform's brightest strip), fixed by having the lip carry its own moss run → 67. Net vs pass 8: **−3 palette for a broken silhouette**. Kept on judgement. |
| 10 | structural: the player | Shade the slime with two more marching-squares contours - a pale shine at threshold 2.1 offset up, a dark belly at 1.45 offset down | palette 67→69, no regressions anywhere. The blob now reads as lit, rounded and wet instead of a flat fill. Cheapest good change of the run: the field is already there, so a higher threshold gives a nested shape that follows every deformation for free. |
| 11 | value range | Wet speculars: 1-2px near-white pips on lit stone edges and moss drip tips | **REVERTED.** palette 69→63, highlight and range both DOWN. A one-pixel highlight is below the resolution of both the screen and the audit's downsample - it never registers as a bright, it just averages into its neighbours and muddies them. Diagnosis kept, delivery wrong. Restored to pass 10 (palette 70). |
| 12 | value range | Standing pools on the wide platforms - large dark water lenses with wide near-white reflection bands | Metrics flat (palette −1). Pools read as real standing water and were kept, but they did NOT move the highlights: only ~0.3% of the frame ends up near-white, and p95 needs 5%. **The pass's real finding is that the target was wrong** - see below. |
| 13 | structural: silhouette | Broken end caps on both ends of every standable slab - stone calving into the void, undercut toward the bottom, roots trailing off the corner | All axes unchanged and in range (palette −1, noise). The pit edges are no longer clean vertical cuts. First pass run entirely on the structural list with the audit as a pure regression guard, which is how it worked as intended. |
| 14 | structural: light | `backdropTexture` now returns its lantern positions; real additive glow sprites placed at z −200, in front of the far plane and the midground it lights, behind the platforms | **palette 68→73**, best gain in five passes, all axes in range. The lanterns now spill onto the pipework they hang from. A lamp that cannot light its own bracket is a picture of a lamp. |
| 15 | structural: the player | Bubbles suspended in the slime, from a third nested contour at small radius | **REVERTED.** Tried at two sizes and two opacities; never read, and cost 2 palette points. The slime renders ~70px wide and the shine and belly already occupy its interior. Technique right, target too small — put it back if the slime ever gets a close-up. |
| 16 | invention: motion | Spores split onto their own tiling layers and scrolled - two sheets at different depths and speeds, drifting up and slightly across | All axes in range (palette −2). **The stage moves for the first time**: two captures 3s apart differ across 8% of the frame. Density was wrong on the first draft - counts are per tile and the tile repeats, so 120 at repeat 3.2 is ~1230 motes and it snowed. Same arithmetic slip as the pass-4 lamp squares. |
| 17 | invention: motion | The flora sways - growths rotate ~1.5 degrees each on its own phase from its x position, vine curtains drift sideways by texture offset | palette 69→72, all in range. Measured on two captures 2s apart: the growth region changed 7% and the vine/platform region 4%, independently of the spores. Two motions because a rooted plant and a hanging curtain do not move alike - rotating a wide curtain swings its far end through the platform it hangs from. |
| 18 | invention: motion | The shine leans into the direction of travel — the highlight's offset takes a horizontal term from the body's own velocity, smoothed at 0.06 and clamped to ±9 | Verified numerically rather than by capture, and that is the stronger evidence here: the audit's eight distributional axes cannot see a 70px creature's inner contour, and a still cannot show a highlight that only moves when the slime does. Proved instead that the lean is non-zero under sustained input, settles rather than buzzes, and stays inside the body — final 1.06 against a half-width of 40, hard bound 9. That bound is the whole point: unclamped, a swing throws the shine off the silhouette and leaves a bright crescent floating beside the creature. |
| 19 | structural: composition | Far structures drawn column-by-column off a height profile — a lean, one to three cosine bites, a fringe of growth on the roofline — instead of seven `fillRect`s. Same colour, same area; the change is entirely in the edge | Built `scripts/dev/sheet` first, which draws every generator in `stageArt.ts` onto a page and posts the canvases back as PNGs, so a texture can be looked at without a build, a play-mode launch, or control of the machine's pointer. The first sheet settled the pass in one glance — the towers are ragged, and the domes needed the arc applied AFTER the bites or a 35%-of-height notch swallows a 40%-of-width dome and seven greenhouses come out as seven rock spires. It also found something 18 passes of game captures never showed: **the "glow" behind the stage is a stack of nested rectangles**, and reads as a hard-edged teal box in the middle of the frame. That is pass 20. |
| 20 | structural: light | The backdrop glow rebuilt as additive banded ellipses — `globalCompositeOperation = 'lighter'`, 24 rings each adding one twenty-fourth of the light | Two bugs, and only the sheet could show either. **Shape**: nested `fillRect`s made a stack of boxes with a hard rectangular rim. **Edge**: fixing the shape was not enough — mixing each ring toward `hazeNear` paints the outermost ring a colour that matches the sixteen-step haze ramp at exactly one height and is brighter than it everywhere else, so a pale ellipse with a crisp rim replaced a pale rectangle with a crisp rim. Adding light instead of mixing toward a colour removes the edge entirely, because the outermost band adds a sliver to whatever is beneath it. Both faults survived eighteen passes of game captures and are invisible to the audit, which cannot tell a rectangle from an ellipse of the same area and colour. |
| 21 | structural: the goal | The portal membrane rebuilt as an iris — seven wide bands off a fixed ramp, dark down the throat, tightening to a thin bright rim, with `phase` rippling the band boundaries rather than their colours | Rendered on its own it was a flat mint egg: twenty-two two-pixel rings mixed linearly, which is a gradient wearing a ring costume, and bright enough to swallow the arch around it. A portal is a HOLE, and a hole is dark in the middle — light piled in the centre is a pearl. Three sightings to land it: the first ripple was 0.05 against bands 1/7 wide, so the wobble was a third of a band and the membrane came out a five-pointed star (the lamp-pool arithmetic slip, fourth occurrence); then evenly spaced bands gave the two brightest two fifths of the sprite. Also fixed the sheet itself, which was drawing transparent sprites on white — a pale membrane meant to be the brightest thing in a dark cavern looks blown out on white and correct on black, and nothing tells you which you are looking at. It grounds them on the stage's own value now. |
| 22 | structural: the sky | The haze ramp dithered — ordered 4x4 Bayer across every band boundary, written through `ImageData` rather than fills | The steps measure three or four values out of 255, which is nothing in the midtones and a large perceptual step near black, and this ramp spends most of its length near black across the widest flat field in the stage. Mach banding did the rest: it read as a black strip bolted across the top of the sky. Adding bands is wrong twice — smaller steps still band, and every band is a palette entry. Dithering is better than merely not-banding, because it puts texture into the one part of the frame that had none, which is what `largest flat %` has been complaining about since pass 1. Ordered rather than random: a noise dither in a still background crawls the moment anything scrolls past it. |
| 23 | structural: light | The lantern/portal/slime halo rebuilt: falloff with the square, ten steps, Bayer-dithered, reaching exactly zero at the sprite edge | Six hard rings, and both halves were wrong. Six is few enough that every boundary is a visible circle, so an additive halo drew concentric hoops around each lantern; and the outermost was floored at 4% of the colour instead of 0, which under additive blending is a faint but perfectly crisp disc edge — a hard circular line in mid-air at the exact radius of the sprite. Measured after: rim value 0, no radial step survives. Then found the fault that invalidates the sheet's whole first day: **it was showing raw texture values, and the scene tone-maps.** `lift()` exists to pre-compensate for ACES at exposure 0.5 by a gain of 1.15–2.3, so the raw texture is SUPPOSED to look blown out, and judging it raw condemns every colour in the stage for doing its job. The sheet runs three.js's ACES fit now; `?raw` still shows the source. Same class as the white background in pass 21, and the fourth-and-fifth sighting of a value authored in one space and spent in another. |

## The loop is closed

Twenty-three passes. Everything on the structural list is done or declined with a reason on
the record, every one of the audit's eight axes sits inside the reference spread, and the
last three faults were found by looking at the SOURCE rather than at a capture.

What the last four passes established, and what to carry into stage two:

- **Look at the generator, not only the frame.** `scripts/dev/sheet` found a rectangular
  "glow", seven rectangular ruins, an egg where the portal should be, contour banding across
  the whole sky and a hard-edged disc around every lantern. Eighteen passes of game captures
  had found none of them, because in a capture each texture appears once, small, behind a
  platform, at whatever angle the camera happens to be.
- **State the ground and state the curve.** A transparent sprite on white and a lifted
  palette shown untone-mapped are both worthless views, and neither announces itself. Both
  cost real work before they surfaced.
- **The recurring bug of this whole run** is a number authored in one space and spent in
  another: lamp pools in texture pixels drawn at a repeat, one-pixel speculars, 120 spores
  per tile on a tile that repeats, a ripple of 0.05 against bands a seventh wide, and a
  palette judged before the curve that was written to survive it. Five sightings. Whenever a
  constant crosses a scale factor, check it in the space it lands in.
| 24 | invention: decor | Floor props - ferns and mushroom clusters scattered on walkable tops, seeded per stage, derived from tile geometry (never authored spots), skipping the first metre of each tile so nothing crowds a button or a landing lip | All axes in range, deltas ±0.2 - the audit cannot see props this small, which is expected: they are composition, not distribution. Two prop kinds only, fern (leaf ramp) and mushroom (cap accents), because the stage already speaks those two families and a third would be a new word used once. Verified live in play mode on the shaft: they read as small life that asks for nothing. NOTE: this pass ran during the playtest-fix session, against a new capture geometry (editor window crop rather than shot.ps1), so the stored-state deltas from pass 23 are not comparable - the REGRESSED lines it printed on first run were the crop change plus the drawbridge's deliberate removal, not art regressions. |

## The environment redo (passes 25-30)

The bar moved: not "inside the reference spread" but "reads like the reference". Judged
frame-against-frame with the reference set and the composition rules of top-tier 2D
platformers (Hollow Knight's layered depth, closed frames, lit-edge masses). Five live
capture-critique cycles, every one of which found the next fault:

| 25 | The backdrop stops being one plane: three parallax FOREST layers (silhouette trunks, branches, canopies) at -280/-210/-120, faintest to near-black, with the lantern glows lighting the middle layer; a CANOPY overhang and a stepped VIGNETTE close the frame at the top and corners, both following the camera; tall tiles get an interior fade - lit at the walked edge, dark below | The references' depth is four or five organic planes; painted-in structures can neither parallax nor be tuned. The frame was open on all four sides and read as a diagram of a place. |
| 26 | The old midground machinery cut 9 to 5 and OVERGROWN (clumps breaking every top edge, strands down the faces); trunks get gnarl - low-frequency bulges riding the taper and a root flare over the first 150 rows | The pass-25 capture: clean rectangles among organic silhouettes read as stickers, and the trunks were parallel poles - the first flare was hidden entirely below the floor line. |
| 27 | Far ruin towers become GHOSTS: 35% alpha over the haze instead of any flat colour; lit panes stay at 80% | Two colour-matching attempts failed identically - the haze is a sixteen-step ramp, so one flat colour matches at one height and fights everywhere else. Transparency follows the gradient for free. |
| 28 | Dead growths SMOULDER: a dim ember-red additive halo, constant, hidden the frame the growth wakes | The darker forest and the vignette cost the red plant its pop, and its legibility is a MECHANIC - stage two's second clause is telling red from green across a room. |
| 29 | Canopies grow FROM their trunks: the biggest clump sits on the head, each further clump smaller and overlapping the last | The live capture showed dark slabs floating beside their trees - clusters scattered 1.6 trunk-widths from a head that had tapered to a point. |
| 30 | Canopy strands clamped 14 rows clear of the texture bottom | A strand touching the last row bleeds at the plane boundary and draws a faint full-width hairline across the sky. |

Both stages verified live at 240fps. The gameplay harnesses passed after every pass - no
art change moved a platform.
| 31 | playtest batch | Pools redrawn as glowing teal water (they read as "black oval artifacts"); wall-variant stone (big blocks, drip stains) so walls stop being floors; WORLD-ALIGNED texture offsets so adjacent tiles continue one pattern (the "not seamless" seams); tile boxes become near-black shadow slabs with the art on a front plane (the "flat 2D game with 3D background" read); growths get constant presence halos and a bigger sprite; props up to 62px and denser; segmented specimen gauge with a blob glyph; shed-mass chevron markers; out-of-reach click flashes the growth and says why; the sieve explains itself in the HUD; portal up to 176px; hanging teardrop plumper (0.54/0.48); crawl 3300 to 4300; Q recalls the NEAREST lump only; the pit returns the body to its LAST SAFE FOOTING instead of the room start - which was the real identity of "the button is blocking my movement" | Verified live: every change visible in one capture. The static-pixel complaint (isolated marching-squares islands around the body) is addressed by the draw-input cull; the canopy hairline was never a drawing problem - RepeatWrapping bled the solid top row into the bottom edge, fixed with ClampToEdge after two futile rounds of clamping the drawn strands. |

## The redo (passes 32-49): a containment laboratory that the forest ate

Run against M4SS-ART-BIBLE.md, written first (phase A): the reference set's own margin
calls it "an overgrown greenhouse-laboratory - nature and alchemy entwine", and the old
direction had shipped the forest and forgotten the lab. Every pass below was verified by a
live editor capture, one worst-thing per cycle; harnesses green after every one.

| 32 | StageTheme | PAL becomes a swappable active palette; the Stack gets its own cold table (stone/haze/moss walk blue, amber becomes cyan service light, rust heavier), its own forest colours and a 0.4 flora density | Two stages stop being one room twice; generators unchanged - they read PAL at draw time |
| 33 | the stone | Rounded pillowed stones in mixed courses, grout ooze (culture medium flooding seam channels, beaded drips), pipes woven full-span through the masonry; wall variant at a bigger scale | The exec-* tile reference does three things the block grid never did; two texture-sheet critique rounds (buttons-on-a-board, timber pipe, timid ooze) before it went in |
| 34 | architecture | domeTexture (glass lattice, drum, broken panes, lit windows) for the Gallery at -190; pipeStackTexture (runs, tanks, catwalks, pilot gauges) for the Stack | The midground must be a different KIND of thing than trees; two value rounds - saucer-stripe dome and black-on-black pipes - before either read |
| 35 | light | godRayTexture (diagonal Gallery / vertical Stack), floorMistTexture (lost bottom edge), pool reflection smears | Light gains a direction, the ground line dissolves, water doubles its lights |
| 36 | the face | Two pupil planes with catch-lights riding the body's upper quartile, velocity lean, blink timer; hidden during fast spins | The reference slime's charm is its eyes; ours was emotionally a puddle |
| 37 | occluders | The 120% layer: leaves into the Gallery's top, pipe hardware from the Stack's side walls, world-fixed at z 70 | The parallax spec's missing sixth layer |
| 38 | the gate | Containment bulkhead: cold steel panels, rust as patina, warning band at the foot, one status lamp | The first live capture's worst thing: the rust gate was the loudest object in the game |
| 39 | midground reads | Backdrop machinery cooled to steel; dome forward to -190, panes brightened, drum calmed | The dome was eaten by the layer in front of it; a rust slab was the most saturated object on screen |
| 40 | eaten architecture | Growth clumps on the drum cornice and glass bottom, strands down the panes, the foot dissolving into dark | Clean edges among organic silhouettes read as stickers (the pass-26 lesson, applied to the new thing) |
| 41 | rays round 2 | Nested solid strips with stepped alpha instead of row dithering | The Stack capture read the vertical shafts as digital rain |
| 42 | spores + HUD | Big motes become crosses (no frame corners); HUD glyph gains the creature's eyes; bible amended - the HUD stays a Pelagic OS window because M4SS is a feed on Keller's desktop, and her OS chrome IS the diegetic frame | The boxed halo squares floated as dead pixels; vine-metal UI would be the wrong fiction |
| 43 | gauge discipline | Pipe-stack pilot gauges dimmed into their tanks, no clipping core | Two capture rounds were spent hunting them as "mystery buttons" - tanks hide behind tiles, gauges peeked through gaps as white chips |
| 44 | glass centre | Pane grid fades toward the flanks; extra growth nibbles on the glass's bottom rows | The dome ended on a straight line and tiled uniformly across the frame |
| 45 | the fall | oozeFallTexture feeding the centre-most pool, source OFF-FRAME, dim edges, shimmering opacity; landing glow | The reference's brightest moment; round 1 poured from an invisible pipe stub in mid-air, round 2 runs from above the frame |
| 46 | bell jars | vesselTexture: glass dome on a plinth, culture glowing inside, two per Gallery among the floor props | The one prop that says "someone was studying something here" |
| 47 | the plate | Power-plate redraw: socket, riveted brass, amber dome; decor plane enlarged (logic radius untouched); round 2 grounded the brass in metal families after the lamp mixes clipped | An interactable had less drawn identity than a mushroom |
| 48 | water yields | Pools dodge buttons (slide aside, clamped to their tile); dome windows dimmed into the glass | Stage one's plate was half-swallowed by the pool that landed on it; the dome's windows were the "mystery buttons" all along |
| 49 | find-me glow | Buttons carry a small amber halo | The squint test MEASURED the Stack's plate below the environment mean |

### Exit criteria, as verified

- **Squint test (measured, 20% + blur, mean luminance):** Gallery - player 132, portal rim
  71, button 49, gate band 36, growths 30-34, environment 25. Stack - player 111, button
  36, ember 33, growths 27-32, gate 29, environment 24. Player dominates everywhere;
  interactables sit at or above the hazard band (the gate's one bright feature is its
  warning band, which is deliberate); nothing interactable sits below the wallpaper.
- **Thumbnail test:** warm-green horizontal Gallery vs cold-teal vertical Stack -
  unmistakable at any size.
- **Three consecutive clean examinations** after the last change: Gallery full-frame
  hostile pass, Stack full-frame hostile pass + measured squint, reference side-by-side.
  None found a flaw at "would embarrass us on a Steam page" severity.
- Zero TEMP-VERIFY in the tree, all five harnesses green, every pass committed.

### The honest gap list (what still needs a human artist)

- **Painted density.** The reference is hand-painted: every rock face uniquely rendered,
  warm bounce light on undersides, painterly edge control. fillRect generators match its
  value structure and composition, not its brushwork. This is the permanent gap.
- **Creatures.** The reference frames carry enemies (thornling, snapper, gloopod); the
  game has none - by design, but the frames read emptier for it.
- **Swing readability in motion** remains a human-eyes item: two scripted-input attempts
  failed to latch (input focus, not gameplay), so the 360/fling was not re-judged in
  motion this run. Ambient motion (spore drift, fall shimmer, blink) verified on frames.
- **The lit strand tips** from Background1 (hanging moss catching light) were not done -
  the canopy is still pure silhouette.
- Audio was out of scope for this gauntlet entirely.

## The playtest batch after the redo (passes 50-53)

Eleven items, three of them bugs. The bugs first, because two of them were one bug wearing
two costumes.

| 50 | **the latch split** | Surface tension's reach exemption now applies to the ARM ONLY - particles projected past a body-radius along the reach line - instead of to every owned particle | The comment above it always said "an arm you are deliberately stretching out is the one part of a slime that is not trying to be a sphere"; the code exempted the whole creature. With no skin anywhere while the tendril hauled, latching tore the body into pieces that all stayed owned, so they all answered A and D - the playtest landed on the far side driving a small herd of itself. |
| 50b | owned pieces come home | A weak `rejoin` force pulls smaller owned components toward the largest, off while reaching or hanging | Shedding makes particles LOOSE; anything still owned is one creature. Weak enough that a sieve squeeze still pinches the body for as long as the gap demands. |
| 50c | **the pit respawn shape** | A fall of more than a third of the body goes to the wholesale respawn, not to host-stacking | Host-stacking is written for a few particles scraped off on a corner. A whole creature crosses the kill plane a few at a time, so the last one or two standing became hosts for all the rest - forty particles on one point, pressed into whatever was beside them, resolving into the tall column the playtest photographed. |
| 50d | reach, and its ceiling | reachPerMass 4.6 to 5.3 (212px at full mass, up from 184) | Asked for directly. The ceiling is a level-design fact: a body small enough for the sieve (24) must not reach the high growth at 140px, which fails above 5.83 - the first attempt at 5.9 duly broke stage one's second clause. 5.3 keeps thirteen pixels of margin. |
| 50e | slowmoAt 2.6 to 2.1 | The firmer body takes a little less energy in at the grip: a well-pumped swing on the shaft's short rope measured 2.3 rad/s where it used to clear 2.6 | Measured, not guessed - the threshold follows the physics rather than the physics being bent to keep an old threshold true. A passive hang still measures near zero, which is the only thing it must stay clear of. |
| 51 | **rounder, in the draw** | Metaball field radius 15 to 21 with matched thresholds, cell 4 to 3 | The obvious lever was the sim's `roundness`, and tightening it 0.5 to 0.44 DID round the creature - it also dropped a pumped swing from 2.3 rad/s to 0.8, because a tighter skin is a stronger internal damper. The sim keeps its slack; the render does the rounding, free and unfelt. |
| 52 | **the growth becomes a pod** | One bulb: dark rim, banded body, bright heart, short stem. The layered leaves, purple caps and root spray are gone | "Make the growth a simple shape, remove the pixel bushes art." It is the single most important object on screen and detail was the enemy of finding it (P1). Live green and dead ember are the same shape now, so they read as two states of one object. |
| 52b | the portal loses its head | Arch head, moss run and hanging vines removed; the two jambs stay | Asked for. It was the busiest thing in frame at the one moment the player is reading a doorway. |
| 52c | the air empties | Both drifting spore sheets deleted, and their generator with them | Called twice: "static pixel points decorating around the mass slime", and "what is that blue sphere" - which was this layer's largest mote, a pale cyan cross scaled up by the near sheet. Anything drifting in front of the creature competes with it. |
| 52d | the green line goes | The ooze-fall and its splash glow removed, generator deleted | Pass 45's centrepiece, and the playtest could not tell what it was. A set-piece nobody can read is decoration with a cost. |
| 53 | **dirt, and acid** | Floors become `dirtTexture` - packed earth in bands, grit, pebbles, roots - with a separate grass crown strip laid along every walked top edge; pits get a bath of `acidTexture` behind the floor masses | The crown is a strip rather than part of the tile texture so it sits at the top edge whatever the tile's height, instead of being stretched by it. Both variants wrap every horizontal feature at the edges, so touching tiles continue one field of earth. Two rounds each: the dirt came back as black mud (ramp brightened, grit contrast doubled) and the acid as a flat tan slab (light confined to the top tenth, throat black - a bath you can see the bottom of is a puddle). |

Boundary walls keep the old stone: they are the room's shell, not its ground, and a wall of
loose earth reads as a cave-in waiting to happen.

## Pass 54: the dots were never particles

The playtest reported "static pixels around the mass" three times. Twice I read it as loose
simulation particles and culled those - a real fix for a different thing - and the dots
survived, because they were never particles.

`glowTexture` painted **fourteen hard 2x2 pips into every glow sprite** "so the glow has
something in it". Every glow sprite: the lanterns, the portal, the growth presences, the
hover halo, the embers - and the slime's own 260px halo, which is centred on the creature
and therefore carried its fourteen pips around the player at fixed offsets, for ever. A
sprite scaled from 128px to 260 turns a 2x2 pip into a hard 4px square, in the one place on
screen the eye is already looking.

**The lesson, for the next one: when a complaint survives a fix, the fix was aimed at
something the complaint was not about.** Find the thing that is actually drawn. Deleting six
lines removed every dot in both stages at once.

| 54 | removals | Pools (the "blue oval"), bell jars (the "black thing"), the vine curtain and the rubble lip (the dense green-to-grey beard at every ground edge) - and their generators with them | Three separate things were drawn at every top edge and stacked into a beard. One of them has to do the job, and the grass crown is the only one that says GROUND rather than decoration. |
| 54b | the pod | Smaller (radius 0.22 of the sprite, plane 176 to 132), no black outer ring, and a brighter ramp running to the slime's own glow | A hard dark rim reads as a UI token where this has to read as a living thing. Hover still glows only when the growth is live AND within reach - that logic was already right. |
| 54c | the ground, rebuilt | `dirtTexture` is now FLAT in the vertical - no strata gradient at all - with compaction clumps, embedded stones (lit crowns, never darker than the soil, or they read as holes), grit and one-pixel roots, every feature wrapped in both axes | The first dirt graded light-at-top to dark-at-bottom, which is right for one slab and catastrophic for a texture that repeats: a 300-tall platform tiled it three times and the ground came out as stacked strata with a hard seam at every join. Depth belongs to the interior-fade plane - one gradient over the whole mass rather than one per repeat. |
| 54d | the crest | The grass mat is drawn per column at a wandering height, above a cleared transparent band, so the moss silhouette rises and falls while the earth line underneath stays straight | The most artificial thing left in the frame was 1280 pixels of perfectly ruled ground. Low frequency on purpose: per-column random reads as noise, a drift over 20-30px reads as terrain. The wander returns to its start height over the last 24 columns so the crest still tiles. |
| 54e | light that lands | Every lantern throws a warm pool onto the floor beneath it, and the god rays land in cool ones; pools are skipped where there is no floor under the light | The biggest reason the stage read as "a bunch of assets": every light source lit only itself, so nothing in the room was related to anything else. |
| 54f | the growths hang | Each anchor carries a dark strand running up out of the top of the frame | An object with no support is a game token, not a thing in a room - and the fiction already says these are cultivated tendrils grown down from above. |
| 54g | the frame closes at the bottom | A dark bank of earth across the very bottom, in front of the play plane | The top has had a canopy since pass 25 and the corners a vignette, but the bottom ran clean off the screen, so the camera sat outside the room looking in at a strip of floor. |
| 54h | the pit gets its depth | Acid surface dropped from 8px below the floor line to 48 | At 92 the meniscus continued the ground line and the pits read as bright slabs, not holes. A pit needs dark between its lip and its liquid. |

## Pass 55: the lamp, the ring, and an engine fact worth knowing

**Writing `material.opacity` from the frame loop does not reach the renderer through a
MeshNode here. Node `visible` and node transforms do.**

Found while the new latch ring refused to appear: it was created, positioned and given a
pulsing opacity every frame, and never showed - while four flies created three lines later
and animated by POSITION were on screen immediately. Switching the ring to `visible` plus a
scale pulse fixed it instantly.

Two things had been quietly broken by the same fault for several passes:

- **The hover halo** has been faded in and out since the pass that added it, so it had
  never once appeared. That is a fair part of why the playtest kept reporting that growths
  did not respond to the pointer - the fix "add a halo" was correct and the halo was
  invisible.
- **The growth presence halo** was set to opacity 0 when a growth died and kept glowing
  instead. On a stage whose second clause is telling a live growth from a dead one, that is
  a mechanic leaking, not a decoration.

Both now use `visible` and scale.

| 55 | the growth IS the lantern | `bushTexture` redrawn as a hanging lamp: three faceted halo steps, a membrane, and a bright upright filament with a white heart; dead keeps the shape and loses the fire | The playtest pointed at a backdrop lamp and said make the growth that. It is the right call - the lamp is the only object in the stage that already reads correctly at any distance, because it is built the way a light is built: a small hot core in a soft field. Everything the growth must do is what a lamp does by nature. |
| 55b | flies | Four motes orbit every live growth on their own ellipse, speed and phase | These are the motes deleted from `glowTexture` in pass 54, given back their movement. The complaint was never that the stage had specks in it - it was that they were STATIC. Orbiting a light they read as what insects do around a lamp at night, which is the image the growth is now built from. |
| 55c | air, as real particles | 46 drifting motes with per-mote vectors, sine wobble and wrapping, at z -18 | Restored on the ask, and deliberately BEHIND the play plane so they can never sit on the creature. That placement is the whole difference between air and the dead pixels that got deleted twice. |
| 55d | proximity latching | Any live growth within reach makes the nearest one to the BODY wear a pulsing white ring; LMB takes whatever is ringed | Point-and-click asked the player to aim at a small target with the same hand that times the release, in a game whose skill is the swing - and it stayed silent until the click, so "can I reach that" was only answered by getting it wrong. Nearest to the body rather than to the pointer: with two ringed, the one you can hold longest is the near one. While hanging, the ring stays on the growth being held. |
| 55e | the slime goes green | Body #a8e85c, rim, belly, shine and halo all moved into the reserved chartreuse | It sat at #79d9b0, a blue-leaning aqua that read as white against a green room - which is how it kept winning the value test while looking like a bubble rather than like something grown in this lab. Still the brightest thing on screen; simply the brightest GREEN. |
| 55f | the sign follows the mechanic | HOLD CLICK ON GROWTH becomes HOLD CLICK WHEN RINGED | Telling the player to point at something the game now points at for them is worse than saying nothing. Still no letter M - the 3px font's M is its N. |

## Pass 56: light adds, or it is not light

The growth was redrawn as a lamp in pass 55 and still did not look like one. Put side by
side with the backdrop lantern the difference was total, and it came down to two things,
both of which are worth keeping written down.

**A lamp is not a lamp-shaped object.** The first attempt drew faceted plates, a dark shell
and a lit interior - a machined fitting bolted to the air. The real lantern has no outline
at all: it is a radial falloff with a hot point in it, and almost all of its area is light
dying into the dark. Redrawn as exactly that (the same ten-step ordered-Bayer falloff
`glowTexture` uses, with the lamp's filament at the centre), the shape was finally right.

**And it still read as a smudge, because it was composited normally.** A glow painted with
normal blending paints semi-opaque green OVER the background; it does not add to it. The
backdrop lantern has never had that problem because its halo is additive. Light ADDS - that
is the whole of what makes something look lit rather than painted - and one blending flag
was the difference between two faint smears and two lamps hanging in a forest.

| 56 | the growth, finally | Radial dithered falloff with a filament core, additive, 166px - the lantern's own size and blend | See above. Dead cultures keep the falloff at 0.62 reach in ember red, with a cooling coal and no white. |
| 56b | the wormhole | The warp moves each particle in POLAR coordinates around the portal: radius closes at a steady fraction, angle advances at a rate that rises as the radius shrinks, so the last frames whip. Veil held off until 0.45s so the swallow is visible; portal spins up to meet it | It used to be a straight pull, which is an exponential ease and reads as the slime being deleted toward a point. What makes a wormhole legible is that the thing going in ORBITS while it falls. |
| 56c | separation, attempt one - REVERTED | A dark plane at z -50 | Right goal, wrong instrument: darkening pushes everything toward black, and it took the light out of everything glowing behind it. The growths went dull the moment it went in, which is exactly what the playtest reported. |
| 57 | separation, done properly | The same plane, now FOG: normal blending toward a pale haze colour (#3d7a6c in the Gallery, #2f5f70 in the Stack) at 0.46 | Distance does not make things darker, it makes them LIGHTER, flatter and closer to the colour of the air - there is more air in the way scattering light into the line of sight, which is why every distant hill is pale blue and why the reference's greenhouse glows pale teal behind near-black foreground stone. Blending toward a pale colour lifts the background's blacks toward mid-tone while barely touching its highlights, so the layers behind lose their CONTRAST rather than their light. The play plane keeps its full range and is now the darkest, most saturated thing in frame - the relationship the reference has, and the one that makes a platform read as standable at a glance. |
| 57b | the growth stops being dull | Tint [150,214,96] to [196,248,122], reach 0.86 to 0.58, falloff exponent 2 to 2.6, sprite 166 to 128, presence halo 230 to 170 | Two numbers make a glow dull. The TINT caps it - additive or not, a light can never be brighter than its own colour, and a mid green was the ceiling. The REACH spends its area: at 0.86 the same light was smeared over the whole plane, which is what "wide" and "washed out" both mean. Concentrated, it is a lamp. |
| 56d | the plate is signposted | A bobbing chevron over every unpressed button, the same glyph the shed lumps wear | Asked for. One vocabulary: a hovering chevron means GO HERE, whatever is under it. It goes out when the plate goes down, because an instruction that outlives its task is noise. |

| 58 | fog eased | 0.46 to 0.35 | Enough haze to sink the background a full step behind the play plane, little enough that the forest keeps its shapes - at 0.46 the separation was right and the midground flattened into one wash paying for it. |
| 58b | the growth glows like the mass | Tint becomes the slime's body colour (#a8e85c) with its shine (#e8fbb0) at the heart; a flat PLATEAU of full intensity out to 0.42 of the reach before the falloff starts; presence halo takes the slime's own glow colour, opacity and size (#b9e86a, 0.42, 230) | Right on both counts. Visually, everything else in the palette is muted structure and the only two objects that matter are the creature and the thing it grabs - anything dimmer than the creature reads as scenery, which is the whole of "it looks dull". And in the fiction they are the SAME SUBSTANCE, grown in the same tanks on the same feed, so lighting them alike is the story showing rather than telling. The plateau is what a pure falloff cannot give: a radial glow's brightest pixel is a single point at its centre, so it never has a BODY - the slime is a solid field of colour with a halo around it, and now so is the growth. |

| 59 | the growth stops being blurry | Redrawn as four HARD bands with clean boundaries plus the filament, and composited normally again | It was a dithered radial falloff, which is the right way to draw a halo and the wrong way to draw an object: a dither is a checkerboard of two values pretending to be a third, so at display size the sprite was a field of alternating pixels with no edge anywhere in it - and the eye reads that as out of focus. (It was never behind the fog. Growth z 20, fog z -50.) Additive went with it: additive has no silhouette by construction, since it can only brighten what is behind it, so a banded sprite's darker rings come out as more light instead of as an edge. The BODY composites normally and keeps its edge; the additive halo behind it does the glowing - which is exactly how the backdrop lantern has always been built, and why that lamp reads crisp and lit at once. |

| 60 | why the growth was dark, and it was neither the texture nor the fog | The reach TINT is nearly gone (`#5a6f78` multiply becomes `#c2d8bc`, and only when out of reach); the bands are rebalanced so the slime's green owns the BODY and the dark step is a thin rim | Two causes, both about area rather than colour. The sprite was being multiplied by a cold blue-grey whenever the body was out of reach - which is most of the time, since a body standing anywhere but underneath is out of reach - so that WAS the growth's normal appearance. And the banded version spaced its four radii evenly from the outside in, which puts the darkest colour on the largest disc: over half the sprite's area was muted moss however bright the core got, and area is what the eye averages. The tint was also answering a question the pulsing ring now answers outright, on the one growth a click would take, so it drops to a whisper. |

| 61 | the lantern, described | A LEMON RECTANGLE with a BROWN OUTLINE, a BROWN ROPE up from its top, and the glow left to the rig's additive halo. Collar, foot, twist marks on the rope; pane lit in three steps out from a near-white middle | Five attempts drew a green blob - dithered, additive, banded, faded - and every one of them missed the same thing: the reference lamp is not a glow with a core, it is an OBJECT that is lit. It has a made shape, it is made of something, and it is HUNG. Those three facts are what the eye reads as a lantern. A first pass at this made the pane landscape (paneW is a HALF-width, so 0.17 gave sixty wide against forty-four tall) and stamped two faded discs behind the fitting for glow, which handed it back the circular edge the banded version had just been rebuilt to remove. One object per job: this sprite is the fitting, the halo is the light it throws. |
| 61b | the stencils get a plate | A dark rounded panel behind every sign, corners cut on integer pixels, with a lit top edge | The only writing in the stage was painted straight onto whatever happened to be behind it - a trunk, the haze, a platform - so its legibility changed with the camera and with every art pass that touched the backdrop. The text carries its own contrast now. |
| 61c | two console crashes, neither in M4SS | `greenhouse()`'s hand-built gable apex gets a `uv` attribute and an index; the garden bank's weeds stop asking for a model this project does not contain | mergeGeometries needs every geometry in a batch to carry the same attribute set and to agree about indexing. Every other pane there is a PlaneGeometry - position, normal, uv, indexed - and the apex was position-only and unindexed, so the merge threw and took the whole contact scene down with it. The 404 was simpler and worth telling apart from the constructed-path bug documented a few hundred lines above it in scenes.ts: that one was a path the asset pipeline could not see, this one is a literal path to a file that was never added. A path bug is fixed by writing it out; a missing asset is only fixed by using one that exists. |
