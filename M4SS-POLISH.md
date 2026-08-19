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
