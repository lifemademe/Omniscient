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

| 62 | smaller, and lit to the creature's own values | Sprite 128 to 104, bloom 230 to 200; the pane's three steps become the mass's own colours (#a8e85c body, #e8fbb0 shine); and the reach TINT is removed entirely | The tint was the reason the pane could never match the mass: out-of-reach growths were still multiplied by #c2d8bc, and since a body standing anywhere but directly underneath IS out of reach, four-fifths brightness was the lantern's normal appearance - no amount of brightening the texture shows through a multiply applied on the way to the screen. Nothing is lost by dropping it: the pulsing ring answers reachability on the one growth a click would take, and a dead growth is a different sprite entirely. Measured in the frame afterwards: pane peaks at 211 luminance against the mass's 187. Also worth keeping: near-white read as GREY against a green room, because whiter is not brighter when everything around it is a hue. |

| 63 | the ring recedes, the flies warm up | Ring band 0.055 of the sprite to 0.028, plane 150 to 112 to 84, pulse 1.22 to 1.14; flies #c8f076 to #f2d75c | A ring is a POINTER and a fat one competes with the thing it points at - which here is the one object that must never share attention. At 112 it sits just outside the lantern instead of enclosing a region of room around it. The flies go warm for the same reason the pane is lemon: a yellow mote against a lit lantern reads as an insect catching the light, where a yellow-green one read as another piece of the plant. |

At 84 the ring is barely wider than the lantern it marks, and that is the whole of why it
works: at every larger size it was drawing a circle in the ROOM, and a circle in a room
reads as a place rather than as a label. Hugging the object, it stops being scenery and
becomes punctuation - and the band thins with the plane, which is the right direction too,
since a hairline that pulses is easier to ignore until you want it than a stroke that sits
there.

| 64 | the tutorial text becomes DOM | Sign sprites replaced by labels in the game's own font on a translucent rounded plate, projected from their WORLD point into the container every frame; `signTexture` and its pixel-font import deleted | The sprite version bought one real thing - text living IN the room rather than on Keller's software - and it cost more than it bought. At three pixels wide `M`, `N` and `W` sit within one row of each other (W is 101/101/111/111/101, M is 101/111/111/101/101), so WHEN rendered closer to NHEN, and an earlier pass had already reworded signs to dodge the letter M rather than admit the font could not carry them. Instructions are the one thing in a game that must be unambiguous, and a font that cannot spell is not a style choice. The plates still belong to the place - they track their world point, so a scrolling stage would carry them - and the panel is a real border-radius rather than corner-cut rectangles faked on a canvas. |

| 65 | the portal loses its jambs | The two stone uprights removed; the membrane is the whole object now | This arch has come apart in two passes. The head with its moss and vines went first (the busiest thing in frame at the one moment the player is meant to be reading a doorway), and the jambs were kept to say the way through was BUILT - which at this size they were not earning: they read as two grey panels flanking the iris rather than as masonry, and the transit tube does not need masonry to be legible. It stands on a stone shelf that already looks built. Silhouette-first: the fewer shapes the eye has to resolve, the faster it finds the way out. |

## Pass 66: a force written below the integrator is not a force

The playtest: "the recall is not working properly, the mass was still split in two, but
green like the two separate parts were playable."

Two green, separately-steerable lumps is precisely two OWNED components with nothing
pulling them together - and the thing meant to pull them together, `rejoin`, **had never
run once**. It was added in pass 50 and written BELOW the integration loop. Accelerations
are zeroed at the top of every step and spent by that loop, so a force added after it is
wiped by the next step's reset before it is ever integrated. The code was correct, the
constant was tuned, and the whole block was dead.

**The rule this leaves behind: anything that PUSHES a particle has to be written between
the reset and the integrator. Below the integrator is where POSITION CORRECTIONS go (the
rope constraint lives there and is right to) and the two are not interchangeable.**

The block moved up next to the other forces, and it now cancels three quarters of gravity
on the way home the way recall does - without that, a lump on a ledge below the body is
pulled sideways into the wall beneath it and grinds there, which reads as the rejoin being
broken rather than as the lump being stuck.

A regression check went into `m4ss-stage.ts`, because a dead force is invisible to every
other check in the file - nothing else asks the body to do something only that force can
do. It tears the body 120px apart (past linkRange 15, so cohesion cannot close it) and
requires one component at the end. Verified to fail when the force is disabled and pass
when it is not: without it the body ends as two pieces and stays that way.

| 66b | the menu stack gets out of the cable's way | STACK_ORIGIN and the facility plate move back 0.14; the cable's tip plane gains a real CABLE_CLEARANCE (0.16) instead of riding MODULE_PLATE.depth | The cable ran through the plates because its tip flew only three centimetres in front of their faces - the offset was measured from the plate CENTRE and the plate is 0.06 deep - so any sag put it inside the plastic. Moving the stack alone would have done nothing: the tip plane is derived FROM the stack, so both would have receded together. The clearance is also larger than HOVER_PUSH, or the plate being reached for would rise into its own cursor. |

## Pass 67: three from one playtest, and only two were bugs

**The 360 could only be built one way round.** The hanging teardrop is captured once at the
grab and it is not symmetric - a body caught mid-lunge has its bulk to one side of the rope.
The shape-hold then re-imposes that fixed arrangement while the rope swings, which is a
torque with a FIXED HANDEDNESS: it helped a swing going one way and fought one going the
other. Measured before the fix, seeding the swing in either direction ended with the body
rotating the SAME way; after it, each direction follows the player and both peak at the same
5.2 rad/s. The shape now mirrors to face the direction of travel, eased at 12% a frame
rather than snapped - the first version flipped outright and the landing check caught it in
one run, because mirroring a teardrop in a single frame moves every outer particle the full
width of the body across the rope and tears pieces off a fast swing.

The shaft's slow-motion check failed on the way through, and the harness was at fault, not
the game: its driver pushed with HORIZONTAL velocity as a stand-in for "which way round am
I going", which is only correct at the bottom of the arc. That approximation had been
riding on the fixed-handedness torque to pass. It pushes along the true tangent now and
reaches 5.1 rad/s in both directions, so `slowmoAt` stays where the feature wants it.

**Q woke every pile in the level.** Two blocks asked `input.recall` whether a loose particle
was awake - the inert-deposit branch in the integrator and the immovable-deposit rule in
overlap resolution - so holding Q woke ALL shed mass at once. A settled deposit rests with
its particles slightly overlapped; wake it and overlap resolution springs it apart, which is
exactly the "forces some others to fly away" in the report. Recall now builds a SET of the
ids it actually called, and only those wake.

**Stage two's blockage - and the plate that was the wrong answer to it.** The measurement
was sound: a full body walking east stalls at x 827, which is the wall at 860, and a body
shed to 16 walks under it and presses the button. From that I concluded the wall was a
filter working as designed and the only fault was that the game never said so, and I hung a
plate at the gap - "TOO BIG FOR THE GAP / HOLD SPACE TO SHED BELOW 25".

The playtest removed it: something else in this same pass had already fixed the real
blockage. So the diagnosis was wrong even though every measurement in it was right. What I
tested was the wall, because the wall was what my hypothesis was about - and a probe aimed
at a hypothesis can only ever confirm or deny THAT, which is not the same as finding the
cause. The stall at 827 was real and it was not what the player was hitting.

**The lesson is narrower than the one I wrote down and more useful: a measurement that
confirms your hypothesis is not a diagnosis.** The plate is gone. The HUD note stays,
because that one costs nothing and was there before.

## Pass 68: the mirror comes out, and a lesson about fixing what you cannot measure

The playtest: "when I latch onto the growth the mass starts moving left and right", and
"sometimes the 360 is fast and sometimes too slow to get enough distance after a fling".

Both were the swing-shape MIRROR added in pass 67, and removing it is the whole change.
The mirror flipped the held teardrop to face the direction of travel whenever spin crossed
half a radian a second - and a hanging body crosses that constantly, so the shape was
redistributing mass from one side of the rope to the other over and over. The centroid
barely moved, which is why a drift test showed nothing; what the eye sees is the BODY
sliding side to side. And a flip landing mid-pump changed how much of the shape was
helping, so the same input built a fast revolution one time and a slow one the next.

Measured after removal: both directions sustain equally once circling (7.14 against 7.20
rad/s), and a hanging body decays rather than pumping itself (48px in the first second,
28px by the third). All five harnesses pass.

### What did not go in, and why it is worth remembering

Three fixes were built and thrown away before this one-line answer: centring the captured
shape's across-axis on its mean; regressing out its shear; and capping the across-spread so
the hold always has a lever. The last one WORKED on its own terms - it turned a 1-in-6
build failure into six good swings out of six, tightening peak spin from a 17x spread to
1.2x - and it had to go anyway, because it also made a single held key circle from a dead
hang. **The coupling that makes a swing reliable to build is the same coupling that makes
the 360 free**, and the earned swing is the design; the harness said so and it was right.

The deeper error was upstream of all of it. I measured a "1 in 6 latches never builds"
lottery and treated it as the bug, when the driver in my probe pushed with a FIXED
direction whenever the body was near the ends of its arc - which is where a real player
reverses. A test that brakes half the time will report an unreliable swing whatever the sim
does. Three of my four measurements this pass turned out to be artifacts of the probe
rather than facts about the game: the idle-drift figure, the lottery, and the directional
asymmetry that started all of this in pass 67.

**When a measurement keeps changing its answer as the probe changes, the probe is the
subject.** The one number that stayed put under every rewrite - both directions sustaining
equally once the body is circling - is the only one that was ever load-bearing.

## Pass 69: the 360 becomes repeatable, and the room gets furniture

**The 360's speed was a coin toss, and this is the measurement that found it.** With a
probe that pumps the way a player does - push WITH the motion, hold through the turnaround
rather than reverting to a fixed key - peak spin was already steady across eight latches at
6.4-7.8 rad/s. What was not steady was the spin still turning six seconds later: 0.5, 0.8,
1.5, 1.5, 4.1, 4.8, 5.3, 6.4. The swing built every time and then fell out of its circle
about half the time, because it was equilibrating at almost exactly the energy needed to
carry over the top. What the player had at the moment they released was luck.

The pump now has three regimes rather than two. Below 60px/s along the arc it is a quarter
strength (a hang cannot be walked round, so the 360 stays earned); to 300 it is full; past
300 it is 1.8x. That last band is the fix: a committed swing ends up clear of the top
instead of level with it. Same eight latches, all eight still turning above 6.4 rad/s at
six seconds - and every harness check still passes, including the one that says holding one
direction from a dead hang must never circle.

| 69b | the crawl, and the filter that had to be fixed first | move 4300 to 6400; the sieve becomes a hard clamp instead of a collision | Asked for twice. The first attempt failed immediately: at 4800 a FULL body oozed under the shut wall, because the filter resolved through the normal collision path and a particle crossing the whole gap inside one step never meets the face meant to stop it. A filter the player can defeat by holding a direction harder is not a filter, and it is the rule two stages are built on. An over-mass particle found in the gap is now put back on the side its previous position was on, velocity dropped - there is no speed that outruns it. |
| 69c | the press | travel 60 to 190, period 3.4, and `pressTexture` - housing, guide rails, a shouldered head with hazard banding, a polished striking face | At 60 the head barely cleared its own housing, so the gap the player was meant to time appeared and vanished with no wind-up. And it had been a flat grey box since the greybox: the one object that can take something from the player was the only thing that still looked unfinished. |
| 69d | crushing has a floor | A press will not take you below `crushFloor` (20), which is `reachPerMass` times 20 = 106px of reach | Chosen from what the player needs, not from what looks fair: whatever else a press does, it must never leave a creature unable to cross to a growth. Under the line the press carries the body instead of biting it, which also removes the worst thing this stage could produce - a slime pinned under a rhythm it no longer has the mass to escape. |
| 69e | the stage two finale | The press nearest the heavy button is gone; the button is upright, bolted to the door it opens, on the face the player swings from - and it RIDES the door up | A hazard sitting in the flight path of a shot the player aimed turns their aim into the timer's business. And the button lay flat like a floor plate, which says STAND ON ME about the one control you are meant to HIT with a flung body; `strikerTexture` gives it a bracket, a struck face and one amber eye to aim at. |
| 69f | furniture with scale | Giant mushrooms, a half-buried ribcage, leafy hanging vines, and near-black dead trees in the FOREGROUND at z 72 | The room had small mushrooms and ferns and the eye walked past them - they are texture, not objects. Size is the only way a frame tells you how big the creature is. Placed from level geometry rather than authored per stage, and kept sparse: a room with an object in it reads as a place, a room with twenty reads as a shop. The caps are mixed most of the way to the void - drawn in the raw accent purple this thing was louder than the player, and the accent family is reserved for small things. |

## Pass 70 - the first living thing

**Stage two gets a creature, and its switch.** A ledge is hung over the middle floor, a
sporeling patrols it, and the plate that wakes the shaft's red growth sits at the far end
of its beat. The waking button behind the splitting wall keeps only its second job -
opening the wall so the mass left behind can be fetched - so the stage's most important
switch is no longer the one thing in the room that nothing guards.

**The sprite came from outside and was repainted to fit.** Spriterrific generated an
eight-frame walk in its lobit mode (a real pixel grid rather than mixels), and the frames
are baked into source rather than loaded as a PNG. Two reasons, and the first one is a
measurement: lift() pre-compensates for ACES at exposure 0.5 and therefore expects colours
authored DARK, so lifting the generator's near-white cream clipped four of twelve entries
to pure white - the trap PAL.lampCore already carries a warning for. The clusters are
re-pointed onto PAL instead: the cap takes capDark/capLit, the body takes the same bone
ramp bonesTexture mixes for the ribcage. Nothing new entered the palette.

The second reason is the pipeline. A baked sprite re-themes with setStageTheme, needs no
resource manager, and puts no async material swap into a rig that has none.

| # | what | change | why |
| --- | --- | --- | --- |
| 70a | the sporeling | `Critter` in the sim: a beat, a speed, a contact box. Touching one calls the SAME `standUp` the pit calls | The stage's hazards were all machines on timers, and learning a timer is learning a clock. A patroller is that puzzle with the clock removed. Contact costs the attempt and no mass at all - an enemy that ate a quarter of you would be the one object in M4SS that can make a level unwinnable without killing you. |
| 70b | the grace period | `critterStun` 1.2s, and the creature recoils for exactly as long | Without it the stage can soft-lock: the body is handed back to its last safe footing, and if that footing is the ledge the creature patrols, the next frame is another hit for ever. |
| 70c | the ledge, sized by measurement | 570..860, 140 thick | A settled 40-mass body is 69px wide - measured, not guessed - so a ledge holding a creature at each end plus a patrol between them cannot be shorter than about 280 however tidy 220 looked. At 220 the plate counted as a contact and a body dropped on either end slid off. Nine pixels of slack at each end is also load-bearing: a body flush against an edge has its outermost particles resolved OUT of the platform and walks itself off. |
| 70d | 140 thick, not 40 | | The third time this project has met it: a platform thinner than a piled body sinks posts the walker out of its own underside. |
| 70e | landmarks | `World.landmarks` places the giant mushrooms where a level asks for them | The ledge is described in relation to the first mushroom, and that mushroom was being chosen by sorting floors on width. A level that has been laid out around a decoration has to be allowed to place it. |
| 70f | no scatter where something lives | Floor props skip any tile a critter walks on | The first capture had a decorative cluster a body-width from the creature in the same accent purple, and at playing size it read as a second sporeling that never moved. Where the player has to watch a shape to survive, nothing else of that colour may stand. |

## Pass 71 - the ground line

**The creature was drawn nineteen pixels below the floor it was standing on, and the two
halves of that had nothing to do with each other.** Measured rather than guessed: a
metaball surface extends past the particles that generate it in every direction, and with
this rig's field (radius 21, threshold 1.55) a settled body's mesh reaches 9.9px below its
lowest particle - which itself rests exactly on the tile. The other ten came from the grass
crown, which was deliberately lifted 9px so its wandering silhouette would not be cut off
by the straight earth line. Neither was wrong on its own; together they put the visible top
of the world ten pixels above the surface anything stands on, and buried a third of the
player in it.

| # | what | change | why |
| --- | --- | --- | --- |
| 71a | the body stands on the ground | `BLOB_LIFT` 10, applied to the POINTS the surface is built from | Applied to the points rather than the finished meshes so the body, rim, belly, shine, eyes and tendril all move together - a mesh offset would have slid the face off the silhouette. The cost is at ceilings, where the creature now draws ten pixels into whatever it is crawling under; the player looks at the ground constantly and at the underside of a gate for two seconds. |
| 71b | the grass line is the ground line | crown lift 9 to 3 | Three still gives the moss silhouette somewhere to wander without moving the line the player reads. |
| 71c | the sporeling's platform | 140 thick to 70 | Half the depth of the slabs around it, which is what stops a ledge hung in mid-air from reading as a chunk of floor that came loose. |
| 71d | the grey lines | end caps skipped on slabs shorter than the cap art (92px) | The cap is 92 tall, so on a thin ledge it hung most of its length below the slab it was capping and read as a grey striped column stuck to each end. A cap taller than the thing it caps is not a cap. |
| 71e | the plate moves to the middle, the beat becomes the whole ledge | plate at 715 (dead centre), beat 583..847 | The opposite puzzle shape: there is now no safe ground on this platform at all, and the switch has to be taken on a timer rather than reached and held. Cheaper failure, harder ask - the plate latches on contact and the growth stays awake, so being caught a second later costs only the walk back. |

## Pass 72 - the trail, the wall, and the threshold

**The wall was wallpaper, and the texture sheet could not say so until it was asked to.**
The sheet drew every generator once, which answers "is this any good" and cannot answer
"does it repeat" - so it grew a 3x3 view, and the old wall failed in it twice over. It was
not seamless (courses were laid from a negative start and clipped at the right edge, so
every repeat cut a stone in half) and it carried a full-height rusted pipe with riveted
collars and a chartreuse ooze drip. Both of those are objects the eye can NAME. Repeat a
nameable object fifteen times up a shaft and the wall becomes a lattice with a pipe at
every node.

The rewrite follows three rules: nothing individually identifiable, exact partition rather
than clipping, and low contrast. Courses are cut into stones whose widths sum to exactly
the texture width and whose heights sum to exactly its height, each course rotated by its
own phase so the wrap point is a different grout line in every row. The pipes and the
bright drips are gone; damp is told in value instead of colour. 256x192, so the same wall
shows a quarter as many repeats.

**The trail cost four editor cycles and three of them were my own fault.** The first blank
screen was a stale bundle - I entered play mode while a build was still writing game.js -
and I spent two cycles bisecting my own code for a fault that was not in it. The real bug
was silent: the stage node is scaled (SCALE, -SCALE, SCALE) to turn y-down level space into
y-up world space, and a negative scale REVERSES triangle winding, so every quad built by
hand in the rig faces away from the camera and is culled with no error and nothing on
screen. The generated meshes get away with it because their builder happens to wind the
other way.

| # | what | change | why |
| --- | --- | --- | --- |
| 72a | does it tile? | `showTiled` on the texture sheet, 3x3 at 1:1 | The question the sheet could not answer, about the property that matters most for every surface in the game. |
| 72b | the wall | `wallTexture`, replacing `stoneTexture` | See above. The floor variant went with it - the rig has drawn floors with `dirtTexture` for several passes and nothing used it. |
| 72c | repeats read off the texture | the rig divides by the map's own width, not by 128 | The wall and the dirt are different sizes now, and a hardcoded divisor is a silent scale error that stretches the pattern instead of tiling it. |
| 72d | the trail | `trailTexture` + one rebuilt geometry per frame, fade carried in vertex alpha | One draw call however long the trail gets, and alpha in the colour attribute goes through the same path as the vertices - it cannot fail to apply the way a frame-written `material.opacity` can. |
| 72e | the trail is DARK | mixed 74% to the void, not 46% | Its first colour was the player's green pulled slightly down, and in the editor it was invisible: the walked surface of both stages is bright grass, and a dull green over a bright green of similar value has nothing to read against. Wet ground is dark ground. |
| 72f | the threshold | `sillTexture` under the portal in both stages | Stage one's exit is a 75px shelf that was wearing the same loose earth as everything else - odd ground for a working doorway, and the one place the floor texture showed as an arbitrary crop rather than as a pattern. |

## Pass 73 - the trail becomes slime

**Two wrong models before the right one, and the third was the player's suggestion.** The
trail started as a STAIN - a dark wet patch soaked into the floor - which was the wrong read
of what this creature does. It does not dampen the ground it crosses; it leaves some of
itself on it. The second attempt was that, as stamped sprite mounds, and sprites have a
ceiling: they can only ever OVERLAP. Two mounds sitting on each other give a scalloped edge
and a doubled alpha seam wherever they cross, and a row of identical ones reads as a fence.

The third is metaball deposits in the field the creature's own body is built from. Points in
a shared field FUSE - a run of them becomes one continuous ridge that swells where they pile
up and pinches where the creature was moving fastest - and there is no seam anywhere because
there are no two things to seam. It also makes "the same colour as the mass" structural
rather than a matching exercise: the trail is drawn by the creature's own contour builder,
out of the creature.

| # | what | change | why |
| --- | --- | --- | --- |
| 73a | deposits, not decals | `buildSurface` at threshold 0.45 over the trail points, plus a fatter darker contour at 0.26 behind it | Measured first: the field bump peaks at 1.0, so the body's threshold of 1.55 is only reachable because forty particles overlap. A sparse trail needs a threshold under 1 or it produces no geometry at all - which is exactly the kind of silent nothing this rig specialises in. |
| 73b | age is spent on RADIUS | each deposit shrinks with age instead of fading | A trail that fades is a decal dissolving; a trail that shrinks is a slime settling. It also gives the tail a shape it could not otherwise have: the oldest end thins, pinches, and breaks into separate beads before it goes, which the field does on its own once neighbouring points stop reaching each other. |
| 73c | seated, not floating | the point's centre rides up as its radius falls, so the contour's bottom stays on the floor | A fixed centre would lift the ridge off the ground as it shrank. |
| 73d | lumpy on purpose | radius jittered a sixth per deposit, from the position it was laid at | Identical radii fuse into a smooth-topped slab - the field has nothing to swell over. A sixth of variation gives a lumpy crest for free, and deriving it from position keeps the same walk leaving the same trail. |
| 73e | 2.6 seconds, not 7 | | At seven the stage slowly filled in with everywhere the player had ever been, which is a map. What a trail carries is "I came from THERE, just now". |
| 73f | the outline is load-bearing | dark contour behind the bright one | Both stages are walked on bright yellow-green turf and the slime is bright yellow-green. Laid flat on grass in its own colour the trail vanished - twice. The creature only reads because it carries its own shading; the trail gets the same treatment. |

## Pass 74 - the smear

**A round deposit can only be as tall as it is wide.** Varying one radius varies both
together, so the ridge came out as a string of roughly equal lumps - beads, not a smear.
Slime dragged along a floor is wider than it is tall everywhere, and its height wanders
along its length for reasons that have nothing to do with its width: a thin spot here, a
thick pool where the creature paused there.

So the field takes a second radius. `FieldPoint.ry` makes a point elliptical, and left unset
it is `r` - the isotropic case reduces to the identical arithmetic, verified rather than
argued: sampled 4000 points over the settled body, the largest difference between the old
form and the new one is 2.7e-15, which is double-precision noise. The body's contour is
untouched.

| # | what | change | why |
| --- | --- | --- | --- |
| 74a | elliptical field points | `FieldPoint.ry` in surface.ts | The only way to vary a deposit's height without also varying its width. Strict generalisation; nothing that does not ask for it can be affected. |
| 74b | wide and varied | width 1.02-1.46 of nominal, height 0.34-0.96, jittered independently | Both derived from the position the deposit was laid at, with different constants, so they vary independently and the same walk still leaves the same trail. |
| 74c | seated by height | the centre now rides on `ry`, not `r` | The blob's underside stays just into the turf however tall it happens to be, and still rides up as it shrinks. |
| 74d | padding by actual reach | `buildSurface` pads by the largest `r`/`ry` any point has, not by a constant | `pad` was written when every point shared one radius. A point reaching further than the default gets its contour silently cut flat at the edge of the sampled grid. The body is unaffected - its largest per-point radius is 15 against a pad of 20. |

## Pass 75 - the trail is made of the creature

**Sharing the colour was not enough, and the frame proved it.** Sampled off a capture, the
body rendered `#9fb867` and the trail - wearing the identical authored hex through a flat
unlit material - rendered `#588526`. The gap was never the colour. The body is a LIT
standard material carrying an emissive, and ACES at exposure 0.5 pulls a flat fill of the
same hex a long way further down than it pulls a lit one.

So the creature's skin is a function now. `slimeSkin()` builds the material, the body and
both trail contours are made from it, and matching them stopped being an exercise in
hand-picking hexes against a tone curve. Re-measured after: body `#9fb867`, trail `#89b040` -
the same hue family, the trail about eight percent darker because the body carries its belly
and shine contours on top of its fill and the trail is a single pass.

| # | what | change | why |
| --- | --- | --- | --- |
| 75a | one skin | `slimeSkin()`, plus `SLIME_FILL` / `SLIME_EDGE` / `SLIME_EMISSIVE` | Two objects meant to be the same substance have to go through the same lighting. A shared hex through two different materials is not a shared appearance. |
| 75b | the trail is lit | the fill contour is a MeshStandardMaterial, not `artMaterial` | `artMaterial` turns tone mapping off because the stage textures are painted from the pre-lifted palette and have had the curve applied by hand. The creature has not - and the trail is made of the creature, not of the palette. |

## Pass 76 - flatter

Deposits go from roughly three to two to roughly three to ONE: the vertical radius drops
from 0.34-0.96 of nominal to 0.19-0.52, width untouched. At the old ratio the ridge still
read as a row of hills sitting on the floor rather than as something smeared along it -
height is what says whether slime was dragged or dropped. Measured off the frame afterwards,
the trail's median band is 4 screen pixels against a body of about 55.

The cull that drops a spent deposit came down with it, from a vertical radius of 2 to 1.1: a
flat deposit starts only a few pixels tall, and the old floor would have taken half of them
off the ground before they had aged at all.

## Pass 77 - the press stops digging, and the 360 gets a ceiling

**The press was burying itself, and the travel change did it.** `at` runs 0 to travel and is
ADDED to y, so raising the stroke from 60 to 190 in pass 69 without moving the rest position
pushed the CLOSED end down instead of lifting the open one: 340 + 190 + 260 puts the head at
790 against a corridor floor at 660, a hundred and thirty pixels inside it. Anchored at 210
it closes exactly on 660 and opens a 190px gap above it. A press is anchored by where it
closes; the stroke belongs above that.

Nothing caught it because the only check measured the OPEN end. There is now one that
measures the closed end against the floor beneath it.

**The 360 was uncapped, and both halves of the complaint follow from that.** swingCommit
multiplies the pump by 1.8 above 300px/s and never switched off - a positive feedback loop
whose only opponent is drag, so where a swing ended up was a function of how long the key
happened to be held. That is "sometimes it is too fast". And pass 69 deliberately pushed a
committed swing clear of the energy needed to carry over the top, so a pendulum left alone
kept circling: that is "it keeps doing the 360 even when I am not holding A or D".

| # | what | change | why |
| --- | --- | --- | --- |
| 77a | a ceiling, in ENERGY | `swingEnergy: 2.7` - the pump adds nothing above 2.7 x gravity x rope | The first attempt capped instantaneous SPEED and the harness caught it as the wrong invariant: speed on a pendulum peaks at the bottom, so a speed cap binds only there, and 520px/s made carrying a rope of 80 over the top physically impossible. Long pumps built up and fell out - 4s gave 3.5 rad/s, 8s gave 6.2, 14s gave 1.5. Energy is the same number wherever you measure it. Now: 9.6, 9.5, 9.7. |
| 77b | letting go winds it down | `swingIdle` against the tangent, after `swingGrace` | It has to be a DURATION, not a per-frame test. Pumping in rhythm means holding nothing for most of every cycle, and the first version bled the swing on every pass over the top - stage one's finale fling stopped reaching the shelf, because its driver releases at the crest of each loop. Half a second of grace, then a ramp. |
| 77c | the band is narrow | 2.6, 2.7 and 2.8 land the finale fling whole; 2.5 and 2.9 tear it | At 2.9 the sustained swing is violent enough that the throw pulls the body into eight pieces in mid-air. Worth knowing before anyone raises it. |
| 77d | measure peaks, not phases | two of the new checks | Angular speed is highest at the bottom of the arc and lowest at the top, so sampling `spin` once samples whatever phase the clock landed on. The first version of the consistency check read 9.4, 8.4 and 6.9 for three swings that were all circling steadily - it was measuring its own stopping point. |
