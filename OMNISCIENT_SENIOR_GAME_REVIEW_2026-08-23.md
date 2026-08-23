# OMNISCIENT_ — senior gameplay, art, audio, UX, and release review

Review date: 2026-08-23
Source reviewed: `20260823-0235-44.5194999.mp4`
Capture: 8:31.433, 1918×1086, 30 fps, H.264 video, AAC stereo 48 kHz
Original review scope: analysis and future-work instructions. Implementation began after the user explicitly asked to build the recommendations.

## Implementation status — 2026-08-23

Five production passes have now been applied to the runtime TypeScript systems. No editor-authored scene assets were changed.

Completed in pass one:

- Release capture hygiene: editor Stats telemetry suppression, designed cursor routing/transition hiding, and literal Markdown-marker cleanup.
- Contact connection grammar: room-first acquisition, wider establishing frame, delayed acknowledgement, staggered telemetry/conversation, and compact world-focus UI.
- Campaign frontier reduced to two answerable requests while preserving the authored queue.
- Explicit shared audio buses, limiting, ambience ducking, stronger room/call audibility, and procedural mower engine/blade layers.
- Mower deck/coverage tuning and M4SS reach/tutorial readability improvements.

Completed in pass two:

- Shared resolution grammar: controls and telemetry recede, the verdict remains readable, cursor input locks, authored physical/camera cues settle, and the camera gives the result a final restrained push before departure.
- Missing contact payoff gestures added to Ileana, Keller, and Lucian outcome routes.
- Mower collision state now distinguishes boundary, bed, trunk, and person keep-outs; chassis and chase camera recoil from contact; procedural impacts use material-specific filtering; the person keep-out uses a safety interlock rather than an impact sound.
- Mower coverage moved to a smaller safe-corner instrument. Prototype score-pop machinery was removed. Completion now locks a single `BANK CLEAR // LIGHT PATH OPEN` report while blades unload and the motor falls to idle.
- M4SS opens and returns through a Pelagic Station 9 remote-file handshake. Final containment holds 3.4 seconds on the empty chamber, adds a station containment stamp, and plays a dedicated non-celebratory contained cadence.
- Finale rebuilt as three visible movements: machine statement, animated caller relay map plus personal record, and final observation. Text size/contrast increased, fast-forward now advances by movement, the return control receives keyboard focus, and the cursor remains hidden until it is actionable.
- The anomaly now receives a forced, input-locked acquisition: room bed cuts out, connect squelch stands alone, the signal is auto-framed, labeled `UNKNOWN // OUTSIDE SPHERE`, and drawn as a tethered diamond outside the globe rather than as a human signal plus.

Completed in pass three (premium-mission payoff pass):

- Mirela's solve now belongs to the repaired transmitter: the set turns back toward the link, a physical meter needle acquires carrier with a damped flutter, and a dedicated carrier jewel lights before the machine acknowledges success. The workshop fluorescent also has a restrained irregular ballast dip.
- Ileana's table now contains four waiting envelopes and a fifth physically left in the photograph box. Resolution draws all five into an addressed row, settles the shoebox lid, holds the photograph shot, and gives the papers a low-amplitude ambient edge movement while unresolved.
- Adaeze's final row receives a 2.8-second warm sunlight/material response after the bank is clear. The seedlings warm only slightly rather than becoming instantly healthy; the payoff is recovered light and attention, not magical growth.
- Keller's outcome no longer tries to gesture a person who is not present in the desktop-only contact scene. Pelagic OS now opens and persists a station-owned receipt for either `SESSION APPENDED // OBSERVER 02` or `CONTAINMENT CONFIRMED // TANK 02`, depending on the route.
- These four missions now have bespoke procedural material-resolution sounds (carrier relay, paper/lid, air/row, and station logger). The physical cue leads; the generic machine solve cadence is delayed behind it.

Verification completed after the third pass: `pnpm lint`, `pnpm build`, Genesys `buildProject`, authoritative editor error query (zero errors/warnings), and a live boot plus repair-shop/cleared-house/seedling-tunnel visual smoke pass. The three rebuilt procedural sets rendered cleanly and Sandbox Studio was returned to edit mode. A full first-time campaign playthrough is still required to tune the new payoff timing/audio in context, mower impact frequency, M4SS handoff duration, resolution holds, finale scrolling, and the last 15-second anomaly cadence by feel.

Completed in pass four (remaining-mission material payoff pass):

- Tomas's harbour beacon now has a restrained rotating beam and a true latched repaired state. Once the isolator result lands, the dropout loop cannot silently resume behind the closing dialogue. Its relay, motor, and stable carrier sound occur on the same delayed beat as the visible recovery.
- Vasile's routed water now reaches a visible meniscus at the outfall mouth after the wetting front crosses the mixed-material run. Valve drive, pipe pressure, and broad release audio lead the machine verdict instead of playing as a generic success notification.
- Dorin's door resolution now raises actual warm threshold light only as the leaf opens; the closed door does not leak it. The sill cat turns and gives a small startle hop to the latch/hinge event, while procedural pin, latch, and hinge sounds track the existing physical lock sequence.
- Lucian's traffic-light choice is no longer reported only in dialogue. The municipal signal visibly asserts red in the wire-city landing and the tracked return crosses its stop line anyway, preserving the authored point that the machine can intervene but cannot make the driver stop.
- Material-payoff audio now returns scene-specific acknowledgement timing. Long physical results extend the camera hold automatically, delay the final attention push until the authored movement has landed, and keep ambience ducked through the actual sound tail.

Verification completed after pass four: `pnpm lint`, `pnpm build`, Sandbox Studio `buildProject`, authoritative editor diagnostics (zero errors/warnings), and live runtime smoke checks of beacon mast, flooded cellar, night door, and wire city. All four procedural sets rendered cleanly, the closed doorstep showed no premature hall-light leak, and Sandbox Studio was returned to edit mode. Outcome triggers still need a natural full-campaign playthrough to judge final audio level and dramatic hold length by feel.

Completed in pass five (accessibility and input-resilience pass):

- A centralized, persistent accessibility preference layer now owns text size, display-filter comfort, and reduced motion. It applies before the boot screen draws, updates every live surface immediately, survives relaunch through local storage, respects the operating system reduced-motion preference for a new player, and removes its listeners/container state when editor play ends.
- SETTINGS is now a real five-row modal instead of one volume bar and a reset action: volume, text size (`STANDARD`, `LARGE`, `LARGEST`), display filter (`FULL`, `SOFT`, `OFF`), reduced motion, and the existing two-step save reset. The OMNISCIENT_ skin was preserved; the underlying rows are focusable controls with dialog, slider, switch, value, and checked semantics.
- Keyboard interaction is now modal-safe and explicit. Up/down and Tab/Shift+Tab use a visible roving focus rail; left/right adjust; Enter/Space activate; Escape closes; input events are consumed so they cannot leak into the scene beneath the panel; focus is restored on close.
- The text-size preference now reaches the boot/self-test, Contact View chrome, objectives and transcript, observations, suggestions and input, every puzzle/board label, globe records/tooltips/actions, scan reticles, mower instrument, SETTINGS, and the final transmission. The size boost is additive (`+2 px`, `+4 px`) rather than a blanket transform, deliberately giving the smallest 8–11 px labels proportionally more help without scaling full-screen geometry out of its safe area.
- The CRT post-process now has honest comfort modes. `SOFT` removes rolling refresh and flicker and sharply reduces pixel coarsening, curvature, convergence split, scanlines, grille, bleed, and vignette while retaining the authored colour grade. `OFF` returns a genuinely clean image—no hidden vignette, tint, saturation lift, pixel grid, temporal modulation, or tube deformation.
- Reduced motion now collapses DOM animation/transition durations and sustained camera travel while retaining the state change and final composition. New camera moves settle in at most 120 ms in this mode; ordinary authored timings remain unchanged when it is off.
- Runtime teardown now closes an open system panel and removes the accessibility subscription, preventing focus/listener accumulation across repeated editor play sessions.

Verification completed after pass five: `pnpm lint`, `pnpm build`, Sandbox Studio `buildProject`, and the authoritative editor error store all completed with zero errors or warnings. A live settings pass verified mouse opening, arrow navigation, Tab traversal, live text reflow, live `FULL`→`SOFT` CRT retargeting, and Space activation of reduced motion. Test preferences were restored to `STANDARD / FULL / OFF`, and Sandbox Studio is back in edit mode. Still outstanding for a true accessibility sign-off: full controller traversal/remapping, independent shake and flash controls, non-dialogue sound captions, text-speed options, aspect-ratio/720p safe-area checks, and minimum-spec release profiling.

## Executive verdict

OMNISCIENT_ already has a distinctive game inside it. The physical CRT workstation, the idea of helping strangers through an invasive machine, the writing, the wire-city reconstruction, the procedural room construction, and the M4SS genre break are memorable. This is not a generic prototype looking for an identity; it has one.

The footage is not yet ready to represent a premium Steam release. The largest gap is presentation hierarchy, not content volume. The game repeatedly places strong material behind a tiny contact, three permanent stat cards, a large opaque conversation console, heavy scanline treatment, and an almost silent mix. Its most important repeated action—answering a contact—still reads like changing screens rather than reaching a person through a live surveillance network. Eight requests are exposed after the first, so authored pacing and callbacks become optional while the player is shown the entire remaining scope at once.

The correct path is ruthless consolidation. Do not add more missions until the existing route has a complete shipping pass. Fix the capture/release defects, establish the contact-arrival grammar, rebalance the console around the human and the environment, repair the audio pipeline, and then polish the strongest missions as a vertical slice. “AAA” quality here should mean exceptional authorship, response, clarity, and finish—not indiscriminate bloom, particles, or more systems.

### Current strengths

- A recognizable visual and thematic identity within seconds: terminal boot, CRT, coastal machine room, green phosphor interface.
- Strong narrative premise and concise contact writing. The best lines imply a wider network of people helping one another through the machine.
- Excellent breadth of interaction: observation, conversation, physical repair, mowing, topology, lock manipulation, relation mapping, vehicle tracing, and M4SS.
- Several strong art moments: Mirela’s workshop, Tomas’s beacon silhouette, Dorin’s doorstep, Lucian’s wire-city, and the M4SS cave palette.
- Thoughtful underlying systems are already present in source: per-room procedural audio beds, bounded VFX, scene-specific shots, camera tweening, delayed responses, reticles, contact gestures, and transition logic.
- M4SS demonstrates that the project can reach a coherent, authored, premium-looking presentation when one mode is allowed to own the whole screen.

### Release blockers visible in the capture

- A bright cyan FPS/performance overlay is present in the top-left for the entire recording and collides with the Contact View label. It must never appear in a public build, trailer, store capture, or reviewer build.
- A default bright-green pointer remains visible during boot, transitions, M4SS, and the ending. It reads as editor/browser residue, not a designed cursor.
- Observation strings visibly contain literal Markdown markers such as `**pump**`, `**lock**`, `**window**`, and `**photographs**`.
- The captured mix measures approximately -51.19 LUFS integrated with a -32.16 dBTP true peak. That is about 25–30 dB below a plausible gameplay capture, subject to verifying whether the recording path reduced the system output.
- The Adaeze mowing section contains roughly 78 seconds below the analysis silence threshold. Even allowing for a quiet procedural bed, the vehicle, grass, impacts, progress, and completion do not produce sufficient recorded energy.
- At 1080p, important interface copy is commonly 9–13 CSS pixels under scanlines. This is below a comfortable premium PC presentation size and is hostile to couch distance, handheld PCs, stream compression, and visually impaired players.
- After the first mission, all seven remaining requests appear together. This contradicts the authored mission order described in the source and lets the player accidentally flatten the dramatic curve.

## Evidence and review limits

This review combines frame-by-frame inspection of the whole recording, full-resolution keyframes, six-frame-per-second entrance sheets for every contact, objective audio analysis, and read-only inspection of the relevant game source. The live Genesys editor was not mutated.

The capture does not show a cold launch on minimum-spec hardware, settings/credits use, controller navigation, failure routes, saving/loading, ultrawide or handheld layouts, or a first-time player reading at natural speed. The run is extremely fast and appears to be an expert or verification playthrough. Mission-duration comments therefore distinguish the captured pace from likely first-play reading time.

The audio could not be auditioned directly in the review environment. Audio judgements are based on measured loudness, waveform/spectrogram structure, silence detection, visible action, and the procedural audio implementation. Do not make a blanket +30 dB source change until the in-engine bus level is compared with the Windows/capture output; the recording path may be attenuating the otherwise correctly generated signal.

No conventional loading screen appeared. The boot/self-test and dark transition frames are therefore reviewed as the current load-masking language. Cold-load hitching still needs release-hardware capture later.

## Priority order

### P0 — fix before any public capture

1. Remove the FPS overlay and any editor diagnostics from the shipping/capture profile.
2. Replace or suppress the default cursor in every noninteractive state.
3. Remove literal `**` markers from observation strings while preserving safe text rendering and keyword emphasis.
4. Verify and correct the audio gain path; establish calibrated buses, meters, and a master ceiling.
5. Increase essential text sizes and contrast; reduce scanline interference over text and real-world feeds.
6. Make the first second of every contact connection legible as an arrival, not a cut.
7. Limit simultaneous requests and preserve the designed dramatic sequence.
8. Ensure the final anomaly or final image is unmistakably visible before control is returned or the video can end.

### P1 — premium vertical-slice pass

1. Recompose Contact View around the person and observed environment.
2. Give every mission a visible physical payoff in the world, not only a text confirmation.
3. Finish the Adaeze mowing feel and shorten its uniform middle.
4. Make console puzzles visually belong to their physical objects.
5. Give each room a distinct light, air, material, and sound signature.
6. Build an adaptive, sparse musical grammar around the existing procedural instrument.
7. Refine boot, workstation, globe, contact departure, and finale into one continuous camera language.

### P2 — accessibility, performance, and store readiness

1. Add font scale, CRT strength, reduced motion, camera shake, and photosensitivity options.
2. Complete keyboard, controller, and focus navigation for every tab, chip, board, tutorial, and ending action.
3. Test 16:9, 16:10, ultrawide, Steam Deck/handheld scale, and 720p/stream-compressed readability.
4. Profile minimum-spec frame time and transition hitches in a release build.
5. Capture a trailer/store sequence with deliberate camera blocking and no debug chrome.

## Timeline review

### 0:00–0:03 — splash and boot

What works:

- The centered terminal identity is concise and immediately establishes tone.
- The self-test language makes a technical boot screen part of the fiction.
- Revealing that the boot display belongs to the physical CRT is a strong transition idea.

What weakens it:

- `PRESS ANY KEY` is too dim relative to the rest of the screen.
- The default green pointer is visible and breaks the illusion.
- The capture begins with the self-test state already largely composed, so the self-test does not visibly build anticipation.
- The move from the flat boot screen to the close CRT view changes scale abruptly before settling.
- The game’s motif is supposed to begin on the input gesture, but the recorded level makes that reward effectively inaudible.

How to improve it:

- [Code] In `src/omniscient/menu/BootScreen.ts`, raise prompt contrast, add a slow 1.2–1.6 second pulse, and provide an explicit focus/keyboard state. Do not blink faster than 3 Hz.
- [Code] Suppress the system cursor while the boot screen is non-pointer-driven. Restore the designed cursor only when the workstation becomes interactive.
- [Code] Deliver the self-test in three beats: power rail, memory/network, identity. Use 50–90 ms stagger within a beat and 180–260 ms between beats. Allow any key to complete immediately.
- [Code] Time the connect relay and three-note motif so the first audible transient lands within 40 ms of the press.
- [Code] Match boot-screen black level and CRT emissive exposure during the 2.6-second camera move. Avoid a one-frame brightness jump.
- [MCP/Code] Later, frame the CRT so its bezel becomes visible before the rest of the desk, then let the room emerge from the screen glow. Use the current `ViewTargetCameraNode`/tweener path; no new cinematic system is needed.

### 0:03–0:09 — workstation/home screen

What works:

- This is the game’s strongest identity shot: lamp, CRT, desk, sea window, industrial solitude.
- The physical separation between “machine” and “world” gives the project a natural visual grammar.

What weakens it:

- The room is so dark that the noticeboard and wall dressing do not contribute readable story.
- The window and exterior read as a flat bright plane rather than a living coast.
- The menu plates at the far left are partially cropped and do not immediately advertise interaction.
- There is little ambient movement to sell an occupied coastal station.

How to improve it:

- [Code] In `src/omniscient/view/scenes.ts`/workstation construction, establish a focal triangle: CRT as key, lamp pool as secondary, window motion as tertiary. Lift wall values only enough to read silhouettes and paper edges.
- [Asset] Add a small reusable procedural decal set: salt bloom, tape residue, flood line, thumb wear, coffee ring, paper curl, and cable scuff. Use seeded variants so the room stays deterministic.
- [Code] Animate rain or sea haze, one distant beacon, occasional gull/boat silhouette, dust in the lamp cone, and a nearly imperceptible hanging-cable sway. Each should have a separate low update rate.
- [Code] Give selectable menu objects a material or emissive response on hover/focus and a small cable-cursor tension response. The camera should acknowledge selection with a 1–2% parallax shift, not a large zoom.
- [Verify] Confirm the first actionable menu item is recognizable within two seconds to a player who has not seen the game.

### 0:09–0:12 and between missions — globe/request selection

What works:

- The wire globe is coherent with the machine aesthetic.
- Geographic selection makes the calls feel larger than a level list.
- State counts and answer history support the fantasy of a monitoring system.

What weakens it:

- The central field is often empty or visually flat before markers become the focus.
- Tiny side counters and slogans are below practical reading size.
- Tooltips are generic boxes and can obscure nearby signals.
- The globe does not visibly acquire a signal; it simply presents available markers.
- Opening all remaining requests after Mirela turns authored pacing into accidental order. Keller and Lucian are written to arrive late, but the video reaches Keller before four preceding contacts.

How to improve it:

- [Code] In `src/omniscient/globe/GlobeScreen.ts`, add a 0.5–0.8 second acquisition sequence: latitude sweep, range ring, carrier jitter, signal pulse, then label. Stagger the data, not the player’s ability to click once acquired.
- [Code] Add low-density route arcs between previously answered contacts and the knowledge source they later help. This makes the “people talking through the machine” theme visible.
- [Code] Limit answerable contacts to two or three. Recommended structure: Mirela alone; then Ileana/Tomas; then Adaeze/Vasile; then Dorin; then Lucian; Keller last. Optional freedom should exist inside a chapter, not across the whole dramatic arc.
- [Code] Change `topUpGlobe()` in `src/omniscient/OmniscientRig.ts` so `anyResolved` does not set the quota to the entire queue. Preserve prerequisites for Lucian and Keller.
- [Code] Make urgency readable through pulse cadence plus a text/icon treatment. Do not use colour alone.
- [Code] Position tooltips radially away from the marker and keep them within a safe viewport inset.
- [Verify] A first-time player should identify the most urgent signal, answered signals, and unavailable signals without opening a tooltip.

## Contact entrance — the most important repeated cinematic

### Current result

Every contact entrance follows roughly the same visible sequence: push toward the CRT, globe, marker tooltip, then a near-complete Contact View containing room, person, reticles, readout cards, objective, observations, tabs, and console. Source code already starts 16% wide and moves to the authored shot over 0.9 seconds, then sends a delayed nod at 0.75 seconds. In the footage, the move and nod are too small and too occluded to read. The player experiences a screen replacement.

### Required arrival grammar

Keep the full sequence between 0.8 and 1.3 seconds for a first connection. Reopened calls may use an accelerated 0.35–0.55 second version.

1. Carrier break, 80–150 ms: brief sync loss, horizontal roll or data corruption, connect squelch.
2. Establishing image, 250–400 ms: room and contact only, wider than the play shot. No full console yet.
3. Human acknowledgement, 250–450 ms: eye/head aim, breath, hand pause, or nod. The person—not the UI—causes the beat.
4. Machine acquisition, 250–500 ms: target brackets lock; connection card, trust, and history arrive 80–120 ms apart.
5. Conversation opens, 150–300 ms later: console panel seats from the right and the first line appears after the response gap.

### Exact implementation direction

- [Code] In `src/omniscient/OmniscientRig.ts::mountScene`, split “scene active” from “console visible.” Activate and frame the room first; attach/show the LocalSurface shell after the acknowledgement cue.
- [Code] Increase the initial offset from 16% to a per-scene 20–28% or author a `connect` shot in each `ContactScene`. A fixed percentage is not composition-aware.
- [Code] Ease with a small overshoot and settle: approximately 75% of distance in the first 0.55 seconds, 5–8% overshoot, settle by 0.95 seconds. Avoid constant-speed interpolation.
- [Code] In `src/omniscient/view/gestures.ts` and `riggedContact.ts`, make `prop.nod:contact` target eyes/head/upper chest, not only a tiny whole-body transform. Hold the acknowledgement pose for 180–260 ms.
- [Code] Let `ScanTargets` acquire one clue at a time after the contact reads. Do not show all reticles in the first frame.
- [Code] In `LocalSurface.attach`, retain the existing stagger but start it after an explicit `connection-ready` state. The left cards should not obscure the acknowledgement.
- [Audio] Add three distinct events: carrier break, relay seat, human room opens. The first is machine-wide; the last inherits the room reverb/air signature.
- [Verify] In a six-frame-per-second capture, there must be at least one frame where the room/contact is readable without the large right console and at least one later frame where the contact visibly acknowledges the connection.

### Bespoke first-second cues

- Mirela: fluorescent flutter, bench transformer hum, she looks from the dead set toward the lens.
- Adaeze: leaves and tunnel fabric move, mower key or gloves seat in her hand, she shields her eyes from the light.
- Tomas: beacon drops out for one beat, wind takes the guy wire, his head follows the returning carrier.
- Keller: terminal handshake, cursor freezes, specimen file window asserts itself over the desktop.
- Lucian: city grid reconstructs from sparse blocks to full streets; the chosen camera node blinks alive.
- Vasile: pump surge, water ripple reaches a boot, overhead bulb briefly loses voltage.
- Dorin: porch lamp/cat reaction, breath in cold air, pick hand pauses before the nod.
- Ileana: paper edge moves, shoebox lid settles, she stops sorting and looks up.

## Contact View UI and interaction hierarchy

### Current result

The interface is cohesive but overclaims the frame. A permanent objective bar, three large readout cards, an end-call box, multiple reticles, a wide right console, three tabs, observations, conversation, chips, and a footer all compete with the person and the room. The human is frequently one of the smallest meaningful objects on screen.

The source intentionally uses custom safe HTML rather than the generic UI kit, which is correct for this identity. The issue is not framework choice; it is hierarchy, density, and scale.

### Required hierarchy

1. Human or physical problem.
2. Current action/question.
3. One changed state.
4. Persistent context.

The current frame often presents all four at equal visual weight.

### How to improve it

- [Code] Reduce the console from roughly one third of the width to 26–30% in observation mode. Permit 34–38% only when the player explicitly opens Chat/Console/Records focus mode.
- [Code] Collapse the three left readouts into a single narrow telemetry rail after connection. Show expanded cards only on first introduction or when a value changes.
- [Code] Make trust and completed-together contextual. “0 jobs / nothing left unfinished” does not deserve permanent large-screen presence on every first call.
- [Code] Let the objective bar type once, remain for 3–5 seconds, then collapse to a small one-line tag. Re-expand on objective change or user request.
- [Code] Keep scanlines/CRT mask off real-world pixels and reduce or remove them over body text. If the fiction requires a remote optical feed, use subtle compression, chroma offset on connection, and occasional line loss instead of a uniform dense raster.
- [Code] Raise chat body copy to at least 15–16 CSS pixels at 1080p with 1.45–1.6 line height. Metadata may be 11–12 pixels; no interactive or required text should be 9 pixels.
- [Code] Increase chip hit areas and focus rings; add arrow/D-pad traversal among suggestions, tabs, observation cards, puzzle cells, and End Call.
- [Code] Use colour plus shape/text for live, selected, solved, warning, and unreachable states.
- [Code] Add a “focus world” input that temporarily fades the console to 20–30% opacity while preserving the current objective. Return it on dialogue, objective change, or explicit input.
- [Code] Preserve `textContent` safety. Fix emphasis by stripping authored `**` wrappers before keyword segmentation or, preferably, remove the wrappers from all mission content and let `keywords` be the sole source of emphasis. Target `LocalSurface.appendEmphasised` and the mission content files.
- [Verify] At 1920×1080 and 1280×720, no required copy truncates, no panel covers the contact’s face, and every interactive element has visible mouse, keyboard, and controller focus.

## Mission-by-mission review

### Mirela Vasc — repair shop, approximately 0:12–0:30

Strengths:

- The best introductory room: clear practical purpose, coherent industrial props, grounded problem, readable workbench.
- The request teaches observation and establishes that the machine can connect knowledge across calls.

Problems:

- Mirela remains small while the console dominates.
- The set is grey and tonally compressed; the transmitter highlight clips toward featureless white.
- Tools, crates, rust, damp, and cable age are present but do not form a clear evidence path.
- The resolution is largely textual; the repaired object and Mirela’s reaction do not own the payoff.

Fix:

- [Code] In the `buildRepairShop` section of `src/omniscient/view/scenes.ts`, author `connect`, `observe-set`, `cable`, and `resolved` shots. Use a closer 50–70 mm equivalent feeling for hands/face and a wider room lens only for arrival.
- [Code] Animate Mirela turning the set, seating the correct connection, testing it, then reacting to the restored carrier. Give the transmitter a controlled emissive rise rather than a white flash.
- [Asset] Add two or three high-value surface stories: flood tide line, oxidized connector, worn bench edge, cable repair tape. Use procedural decals and roughness variation, not more boxes.
- [Audio] Establish a shop bed with fluorescent ballast, distant metal tick, transformer hum, connector scrape, relay click, and a clean successful carrier tone.
- [VFX] Use one dust fall from the bench and one tiny electrical contact spark. Avoid continuous sparks.
- [Verify] The player can identify Mirela, the dead set, and the cable as the focal triangle in a still frame with UI dimmed.

### Adaeze Okafor — seedling tunnel and mower, approximately 0:39–2:18

Strengths:

- The greenhouse density and giant overgrowth establish a distinctive environment.
- Mowing is a welcome full-body mechanical break from conversation.
- The standing/cut coverage concept and missed-patch support are sound.

Problems:

- Foliage becomes high-frequency noise: black fern silhouettes, bright flowers, hoops, and the trunk compete everywhere.
- Distant hills/buildings read as flat primitives beside the dense foreground.
- The mower loop runs uniformly for roughly 80 seconds in the capture.
- The plot/minimap interrupts the forward sightline and the marker/orb reads as a placeholder rather than a physical sensor.
- Progress numbers and score pops feel like prototype feedback instead of a groundskeeping machine.
- Collision with fence/tree lacks convincing weight, audio, or recovery.
- The recorded section is effectively silent despite engine, blades, clippings, fence contact, and completion.
- The visual payoff does not clearly show light reaching the seedlings or the failing bank recovering.

Fix:

- [Code] In `MowerPlot.ts`, move the coverage plot into a corner-safe instrument panel, reduce its diameter, and make standing/missed grass the dominant contrast. Remove generic score pops; use a single progress sweep and missed-patch acquisition.
- [Code] In `mowing.ts`, retain the existing smoothed throttle, lean, clipping pool, and bump model, but amplify the visible response: more body pitch/roll, wheel rotation readability, suspension settle, collision recoil, and speed-dependent camera lag. Add a 2–3° speed FOV response if it does not induce nausea.
- [Code] Shorten the required coverage or widen the deck so a competent run resolves in 30–45 seconds. At 75–80% progress, mark remaining patches clearly and increase effective cleanup radius slightly to avoid the tedious final hunt.
- [Code] Add distinct collision states: soft crop, bed edge, fence, trunk. Each gets its own deceleration, sound, and small camera response.
- [VFX] Increase clipping readability near the deck, add a brief side discharge plume in dense grass, seed-head motes, tire compression, and a darker/lighter cut stripe. Keep emissions pooled and bounded.
- [Asset] Replace distant silhouette geometry with two or three parallax cards/low-poly masses with atmospheric fade. Reduce foreground plant value extremes and reserve bright flowers near goals.
- [Audio] Build a mower engine loop with idle/load layers, blade whirr, grass-load bursts, fence/trunk impacts, tire/soil texture, and completion wind-down. Side-chain the room bed under the vehicle.
- [Code] At completion, cut to the real bank: shade recedes, seedlings catch sunlight, Adaeze touches a recovered row, and wind moves the now-opened tunnel.
- [Verify] A no-UI recording must communicate uncut versus cut ground, speed, collision, and completion through motion and sound alone.

### Tomas Vasc — beacon mast, approximately 2:27–2:48

Strengths:

- Strong silhouette and credible nocturnal isolation.
- The beacon is an excellent visual anchor.
- Knowledge carried from Mirela is one of the clearest demonstrations of the game’s thematic system.

Problems:

- Steel structure and beacon dominate while Tomas’s face and upper body are difficult to read.
- The scene is very dark and largely static.
- The repair choices still land mainly as console cards; the actual mast and cable do not carry enough of the reasoning.

Fix:

- [Code] In `buildBeaconMast`, create a subject shot that places Tomas against negative sky rather than steel. Keep his workwear value above the mast silhouette.
- [Code] Show the fault through pulse cadence and exposure: irregular beacon dropout, relay chatter, cable movement, then a stable rotating/pulsing light after the fix.
- [Code] Seat chosen parts visibly in the junction box. Wrong parts should fail physically—loose fit, heat, unstable pulse—not only through text.
- [Audio] Wind, guy-wire singing, distant surf, relay buzz, cable strain, and beacon motor. The repaired beacon should add a low rotating mechanical signature.
- [VFX] Sparse spray and mist crossing the light beam. Let the beam catch particles only when it passes.
- [Verify] The resolved frame must be visibly and audibly different from the opening without reading the console.

### Dana Keller / M4SS — station desktop and containment sim, approximately 2:57–4:48

Strengths:

- The genre shift is bold and memorable.
- M4SS has the most coherent finished art direction in the footage: teal depth layers, warm lamps, giant mushrooms, silhouette foreground, and a readable creature.
- Slime mass, reach, split, recall, portal, slow-motion, camera kick, particles, and a dedicated procedural instrument already exist.

Problems:

- Keller’s desktop resembles a generic mock OS: default folder language, clean rectangular windows, little station-specific damage or security context.
- The transition into M4SS is a teleport rather than a file/session being opened by a remote terminal.
- Tutorial plates are large floating DOM bubbles that cover the environment and use a visual language separate from both OMNISCIENT_ and the station desktop.
- The HUD exposes implementation units: `REACH 212px`.
- The 260-pixel HUD is positioned specifically below the engine FPS overlay, which codifies a debug artifact into layout.
- Completion flashes/lifts away before the empty contained room and consequence can become an image.

Fix:

- [Code] In the station-desk builder, add terminal handshake, containment warnings, timestamp drift, failed camera frames, and a unique pointer/focus response. Use authored labels and station identity, not generic folders.
- [Code] Transition by selecting the specimen file, expanding its preview into the viewport, losing sync, then revealing M4SS under a portal-colour veil. Reverse the language on return.
- [Code] In `M4SSRig.buildHud`, remove `px`. Express reach as a bar, ring, or calibrated biological category. Keep exact implementation units in an optional debug panel only.
- [Code] Remove the hard dependency on the FPS overlay’s top-left occupancy. Anchor the HUD to a safe area and allow it to collapse when unchanged.
- [Code/UI] Replace persistent tutorial plates with contextual prompts that appear near the first relevant obstacle, then fade permanently after successful use. Reuse the engine `Keystroke`/`ControlsPanel` behavior or build a station-skinned equivalent with the same accessibility semantics.
- [Code] Show the final swallow, empty chamber, `SPECIMEN CONTAINED`, and one unsettling residual trace for at least 2.5–3.5 seconds before return.
- [Audio] Give M4SS a distinct adaptive music layer: one low pulse at baseline, a mallet/pluck layer when attached/swinging, percussion or sub pulse under pressure/crusher sequences, silence or filtering during slow motion, and a contained cadence at the portal.
- [Verify] A player should understand mass loss, reach, recall, and containment without ever seeing a pixel unit or reading a paragraph.

### Lucian Barbu — wire-city vehicle trace, approximately 5:00–6:03

Strengths:

- Visually unique and appropriate: this is a machine reconstruction, so the retro treatment belongs here.
- The reasoning chain has real depth and uses time, distance, heading, cameras, and sensor fragments.
- The city mesh gives the request a strong “omniscient system” fantasy.

Problems:

- The opaque console device can cover most of the city, replacing a strong spatial visualization with dense text.
- ASCII camera views are atmospheric but require substantial reading and mental coordinate transformation.
- The route, current camera, elapsed time, and claimed fragments do not form one immediately readable visual chain.
- The reward for a correct hop/trace is subtle relative to the cognitive work.

Fix:

- [Code] In `BoardPanel` pursuit/trail rendering, overlay the selected camera cone, ghost vehicle position, heading arrow, time gap, and reachable radius directly on the wire city.
- [Code] Keep a horizontal breadcrumb of committed hops. Selecting one should reframe the city and show why it was valid.
- [Code] Animate a candidate path for 0.4–0.7 seconds before commitment; impossible options should visibly fail distance/time rather than only return prose.
- [Code] Collapse left telemetry during Console focus and reduce redundant sentences. Keep the rule “about one block per second” pinned once.
- [VFX] Use `CircuitPulseVFX`/`ElectricalArcVFX` sparingly for camera acquisition and data transfer, not as ambient decoration.
- [Audio] Give each accepted hop a rising, spatially placed data ping; invalid distance/time receives a dry reject; final target lock resolves into a clear multi-band acquisition tone.
- [Verify] A tester can explain why an option is impossible by pointing at the city, not only by quoting the console.

### Vasile Crăstea — flooded cellar, approximately 6:12–6:36

Strengths:

- The pipe-run premise is tactile and spatial.
- Water, reflected light, and a low basement can provide immediate stakes.
- The 3×3 rotation puzzle has a simple verb.

Problems:

- The overhead bulb is nearly featureless while the lower room is muddy; the person and pipe lack a controlled focal hierarchy.
- Water can read like a dark floor because surface movement and depth cues are weak.
- Literal Markdown markers are visible in all four observations.
- The 3×3 glyph board looks abstract and separate from the pipe run occupying the world.
- The final water diversion lacks a large, visible pressure and level change.

Fix:

- [Code] In `buildFloodedCellar`, reduce bulb emissive clipping, add a softer bounce on Vasile and pipe collars, and make the water horizon/ripple readable against the wall.
- [Code] Map each puzzle cell to a labeled physical inspection cover/pipe segment. Hovering or rotating a cell should pulse the corresponding world segment and move its valve/cover.
- [Code] Animate water through connected cells, not merely a lit glyph. Add pressure buildup, pipe shake, outfall release, and a measurable water-line drop.
- [Asset] Add wet-wall roughness, mineral rings at previous water levels, floating debris, drip decals, and material differences across lead/copper/plastic segments.
- [Audio] Pump motor with load modulation, pipe knock, water under pressure, drip field, valve scrape, and a broad outfall release.
- [Verify] The player can correlate all nine console cells to the physical route and can see the water level fall on solve.

### Dorin Apostol — night door and lock, approximately 6:45–7:12

Strengths:

- Strong human stakes and one of the best compositions in the run.
- Warm doorway against cool night, the cat, planters, and Dorin’s posture give the scene personality.
- The close lock shot is a good move from environment to object.

Problems:

- The facade and street remain too static and clean; the warm/cool scene lacks weather, breath, and small living response.
- Literal Markdown markers appear in observations.
- The lock interface is thin and diagrammatic. Pin order, set state, bind feedback, and failure recovery require interpretation.
- The fiction is urgent while the persistent UI says “no time pressure,” creating tonal friction even if there is intentionally no fail clock.
- Door opening is not allowed to become the full emotional payoff before the game leaves.

Fix:

- [Code] Tie each console pin to the visible lock. A pin press should move the 3D pin stack, change spring sound, and produce a clear set/bind/fall state.
- [Code] Present the discovered order as tactile feedback, not only numerals. Use a small tension indicator and reset only the portion of the sequence that physically falls.
- [Code] Clarify urgency copy: “Dorin is waiting” or “hold the line” instead of a generic no-pressure status.
- [Code] On solve, hold the lock turn, latch withdrawal, door weight, interior light spill, Dorin’s release of tension, and the cat’s response for 3–5 seconds.
- [Audio] Cold exterior bed, distant dog/road, breath/clothing, pick scrape, spring ticks, latch, hinge, room tone through the opening.
- [Verify] With the console hidden, a viewer can identify the moment each pin sets and the moment the door becomes safe to open.

### Ileana Marku — cleared house and relation board, approximately 7:21–7:45

Strengths:

- Potentially the most emotionally distinctive request: grief and kinship rather than repair.
- The shoebox, photographs, envelopes, empty room, and tide line are strong narrative objects.
- It broadens the machine from problem solver to keeper of social memory.

Problems:

- The room is sterile: broad grey surfaces, a black doorway, sparse boxes, and little evidence of a recently cleared life.
- Ileana and the photographs are occluded by UI and distance.
- The relationship puzzle becomes a generic two-column matching exercise; it does not feel like handling photographs or addressing letters.
- Literal Markdown markers appear in the observation text.
- The emotional payoff is not visualized through completed envelopes, names, or Ileana’s physical response.

Fix:

- [Asset] Build a small procedural family-photo system: age-tinted cards, handwritten names, edge wear, flood damage, stamp marks, and deterministic portrait silhouettes. It can remain stylized and fictional.
- [Code] In `BoardPanel`, present people as photo cards and relationships as string/graph connections. Preserve click-to-connect accessibility, but make the visual object belong to the shoebox.
- [Code] Let selecting a card bring the corresponding physical photograph forward on the table. Correct placement moves an addressed envelope into a finished stack.
- [Code] Dress the room with absence: picture hooks, furniture shadows, clean rectangles on faded walls, tape residue, half-packed floral object, and waterline damage. Avoid filling it with generic clutter.
- [Audio] Quiet house resonance, paper/card friction, pencil, box lid, distant plumbing/road, and a restrained musical motif that resolves only when the family graph closes.
- [Code] Hold on Ileana reading the final addressed names and closing the box. This needs a human reaction more than a green “resolved” message.
- [Verify] Testers describe the interaction as “sorting family photographs” rather than “matching a list.”

## Loading and transition language

No standalone loading screen was visible. This is preferable to a generic spinner if the procedural rooms are already constructed before play. The risk is that cold launch or weaker hardware may expose long black frames or hitches that this editor capture does not show.

Future direction:

- [Code] Use the boot self-test as the only cold-load mask. Each completed prewarm step may unlock the next test line; never display fabricated progress percentages.
- [Code] Pre-create procedural dioramas and shaders during boot, but stagger work across frames or jobs so input and animation remain responsive.
- [Code] For request transitions, use the connection grammar rather than a loading card. If a room needs more than 500 ms, hold on signal acquisition and let the carrier search become honest waiting.
- [Code] On return, use the existing green warp and CRT push consistently for solved, lost, and manually ended calls.
- [Verify] On minimum-spec release hardware: no blank frame longer than 150 ms, no main-thread stall above 50 ms during connection, and no visible one-frame scene from a previous solved state.

## Camera and cinematic direction

- Replace one standardized opening percentage with authored `connect`, `default`, `observe`, `device`, `resolved`, and `depart` shots per room.
- Keep contact entrances under 1.3 seconds, but let resolved payoffs breathe for 3–5 seconds.
- Use lenses by intent: wider for place, normal for conversation, longer/closer for hands and clues. A shared 46° FOV should not dictate every room.
- Keep faces out of the left readout and right-console safe zones. Compose from the final UI frame, not from a clean viewport.
- Add tiny remote-camera life only when it carries fiction: settling autofocus, 0.2–0.5° drift, a small exposure correction, occasional packet stutter. Do not use constant handheld noise.
- Camera shake should be event-driven and optional: mower impacts, pump surge, lock turn, M4SS pressure plate, not a universal “cinematic” layer.
- Use match cuts across the system: globe signal pulse to room practical light, terminal cursor to cable connector, route arc to pipe/cable/relationship line.

## Art direction, lighting, materials, and environment

### Preserve the split

The machine should remain precise, phosphor-green, geometric, and data-dense. The human world should remain material, imperfect, coloured by local light, and relatively clean of CRT artifacts. Lucian’s wire-city and Keller’s terminal are justified exceptions.

### Current global weaknesses

- Midtones compress toward grey/green across rooms, reducing their individual identities.
- Strong practicals clip while faces and evidence remain dark.
- Procedural geometry is often structurally rich but materially uniform.
- Backgrounds are static, which exposes low-detail silhouettes and set boundaries.
- Dense scanlines flatten both detailed foliage and fine text into the same texture.

### Fix system

- [Code] Define a per-room palette with one key hue, one practical hue, one material accent, and one danger/solution accent. Do not let every room inherit the same green cast.
- [Code] Tune lights against final UI exposure. Use practical-motivated local fill for faces and clue surfaces instead of increasing global ambient.
- [Asset] Create reusable procedural surface layers: base colour variation, edge wear, damp/mineral masks, dust, oxidation, paper wear, and wetness. Seed by scene/node ID.
- [Code] Add low-frequency ambient motion to every room: air, water, plant, cloth, paper, light, animal, or machine. Choose two, not all.
- [Asset] Improve distant silhouettes with parallax depth, atmospheric fade, and irregular skyline/foliage. Spend geometry near interaction; use cards/low-poly masses at distance.
- [Verify] Convert screenshots to grayscale and thumbnail size. Each room must retain a clear face/problem/response hierarchy.

## VFX and post-processing

The project already contains bounded `SparkVFX`, `ElectricalArcVFX`, `CircuitPulseVFX`, and `DustVFX`. Use them as punctuation. Do not turn every connection into a particle storm.

Recommended per-scene VFX:

- Repair shop: dust off bench, connector spark, controlled transmitter glow.
- Seedling tunnel: clipping burst, pollen/seed motes in sun, leaf displacement.
- Beacon: mist/spray in light beam, relay arc only on fault.
- M4SS: retain spores, portal spiral, slow-motion veil, body burst; improve composition before adding density.
- Wire-city: camera acquisition pulses and route propagation.
- Cellar: water ripples, drips, pressure mist, falling water line.
- Door: breath, faint rain or damp mist, warm light spill, dust at threshold.
- Cleared house: paper dust, subtle curtain/paper motion, light motes in empty space.

Post-processing direction:

- Do not enable the disabled painterly pass as a blanket polish step. Source notes correctly identify it as a competing art direction and a WebGL composer risk.
- Keep ACES/tone mapping and per-room exposure deliberate. Add only a restrained custom WebGL pass if needed: subtle vignette, scene-specific grade, low grain, and transient chromatic separation during connection faults.
- Restrict heavy scanlines, phosphor glow, and pixel/CRT treatment to the machine, terminal surfaces, wire-city, and deliberately mediated feeds. The real rooms need texture detail and facial values more than another full-screen effect.
- Avoid permanent chromatic aberration, depth-of-field breathing, and bloom. Use them at transitions, practical lights, or stress beats only.
- [Verify] Provide CRT intensity Off/Low/Default, and confirm essential text remains crisp at Low and Default.

## Audio, SFX, music, and mix

### Measured result

- Integrated loudness: approximately -51.19 LUFS.
- Loudness range: approximately 13.6 LU.
- True peak: approximately -32.16 dBTP.
- Segment means remain around -52 to -54 dBFS with peaks around -32 to -34 dBFS.
- Silence detection found long multi-second low-energy gaps; the mower section contains approximately 78 seconds below -42 dB.
- The spectrogram shows a sparse broadband/tonal bed and occasional transients, but no audible-scale musical development in the recorded signal.

The source is more sophisticated than the capture suggests. `ConsoleAudio.ts` has connect, disconnect, receive, transmit, key, tap, learn, resolve, seat, reject, solved, failed, and motif cues. `RoomTone.ts` supplies per-scene beds. `SlimeAudio.ts` adds a dedicated M4SS instrument. The priority is therefore to make the existing design survive the output path before creating more cues.

### Mix fix

- [Verify] Add temporary WebAudio analyser meters at the master, UI, ambience, music, and gameplay buses. Compare their peaks with a Windows loopback capture. Determine whether attenuation is inside the game, browser/WebView, OS mixer, or ScreenSketch.
- [Code] Create explicit buses: critical, UI/console, diegetic action, ambience, and music. Route the existing procedural voices through them.
- [Code] Calibrate a representative eight-minute capture to roughly -23 to -18 LUFS integrated, with a true peak no higher than -1 dBTP. Choose the final target after reference comparison; do not normalize each scene independently.
- [Code] Put a transparent limiter/soft clipper at the master and leave 1 dB true-peak headroom.
- [Code] Duck ambience 2–4 dB under incoming text/critical UI and 5–7 dB under major solve/connect events. Do not mute it completely.
- [Code] Make critical cues at least 8–12 dB more perceptually prominent than the local room bed at the moment they occur.
- [Verify] Test laptop speakers, closed headphones, low volume, and a stream-compressed recording. Every solve, error, contact connection, and physical collision must remain identifiable.

### Sound design grammar

- Machine-wide: relay, carrier, tape/write, CRT whine, data key, resolve, reject.
- Human room: localized air and material signature that opens after carrier acquisition.
- Physical action: object-specific transient plus short body/resonance and environmental tail.
- Knowledge transfer: the existing motif transformed by the source contact’s room signature.
- Completion: physical resolution first, machine acknowledgement second. Never let the UI sound replace the world sound.

### Music direction

Do not cover the entire game with wallpaper music. Its quiet surveillance premise benefits from space. Add a sparse adaptive score built from the existing procedural instrument:

- Boot/home: three-note identity, widely spaced, with lamp/CRT rhythm.
- Globe: low carrier pulse whose harmony gains notes as requests accumulate.
- Contact: mostly room tone; introduce one timbral fragment only when trust/knowledge crosses a threshold.
- Action puzzles: one or two stems driven by progress or pressure, not a full track loop.
- M4SS: its own rhythmic/organic instrument family, filtered through Keller’s terminal on entry/exit.
- Finale: recombine the contact timbres into the machine motif, then remove the machine pulse before the anomaly arrives.

All music can remain procedural and copyright-safe. The goal is leitmotif and state response, not duration.

## Mechanics, game feel, and pacing

### The core loop

The game’s strongest loop is: observe a human place, ask/answer, manipulate one relevant system, see a physical change, carry knowledge to another person. Several missions currently complete the middle through console text and under-deliver the physical change.

For every mission, require these five beats:

1. Read the person and room before UI explanation.
2. Form a hypothesis from two or three pieces of evidence.
3. Commit through a physical or spatial verb.
4. Receive immediate material feedback—motion, sound, VFX, contact reaction.
5. See knowledge become useful beyond the current room.

### Pacing

- Keep Mirela as the solitary onboarding signal.
- Offer two to three requests per chapter; surface new ones as previous choices resolve.
- Lock Lucian and Keller behind explicit narrative prerequisites. Their unease depends on the player first trusting the machine.
- Separate puzzle-heavy missions with observation/conversation missions.
- Keep first-time contact arrival under 1.3 seconds and repeat arrival under 0.55 seconds.
- Let physical resolves breathe for 3–5 seconds before leaving.
- Adaeze’s mower should peak and resolve within 30–45 seconds for a competent run.
- Avoid a static finale typewriter longer than the emotional content warrants; permit a hold-to-complete line and movement-level skip while preserving the final reveal.

### Failure and recovery

- Wrong answers should change a visible object or relation, not only add a red line.
- Explain the governing rule through the failure animation: pin falls, pressure reverses, route outruns time, mower catches a fence, M4SS loses mass.
- Preserve the existing note/writeback concept, but make the recovery route visible on the globe.
- Avoid cooldowns that look like disabled content without a clear remaining condition.

## Finale, approximately 7:51–8:31

What works:

- The writing is strong: the machine’s realization that its answers came from callers is the correct thematic payoff.
- The record rows make the playthrough personal.
- The slow pullback is conceptually appropriate: standing away from the machine after a shift.

What weakens it:

- The panel and background are extremely low contrast; much of the globe/history becomes unreadable dark texture.
- The cursor remains visible over the transmission.
- The delivery is almost entirely typewriter text for roughly half a minute.
- The footage returns to the same globe and ends before a clearly readable anomaly or final transformation lands.
- There is no decisive final sound/image that makes the ending memorable at trailer or review scale.

How to improve it:

- [Code] Preserve the text, but divide the ending into three visual movements matching `EndingPanel`’s structure: machine statement; record/connection visualization; external answer/anomaly.
- [Code] During “every answer was something another caller left behind,” illuminate route arcs between the eight answered contacts. Let their distinct signal tones enter one at a time.
- [Code] Increase panel contrast and body size, and dim only the background—not the text—to a verified readable ratio.
- [Code] Hide the cursor unless the return action is available; when available, put focus on `RETURN TO THE MACHINE` and show keyboard/controller affordance.
- [Code] On close, make the CRT/globe acquisition unavoidable: hold input for 3–5 seconds, flare the off-world red signal at a location clearly outside the globe, cut the room bed, and play the connect squelch at calibrated level.
- [Code] Give the anomaly a unique geometry, cadence, and label. Do not rely on red alone.
- [Code] End on one authored frame: the off-world signal connected to the globe while the physical CRT reflection reveals the player/machine space, or the knowledge tree taking a nonhuman branch. Then offer replay/continue/credits without destroying the image.
- [Verify] Five blind viewers watching only the final 15 seconds can describe what new event happened after the transmission.

## Accessibility and Steam-quality requirements

- Font scale presets: 100%, 125%, 150%.
- CRT/scanline presets: Off, Low, Default.
- Reduced motion: removes camera overshoot, continuous sway, heavy warp, and large shake while keeping cuts and state feedback.
- Shake slider and flash reduction. No repeated flash above 3 Hz.
- Full keyboard and controller navigation with visible focus, back, confirm, and tab traversal.
- Remappable controls for mower and M4SS; do not rely only on colour or mouse proximity.
- Caption important non-dialogue sounds such as pump running, beacon irregular, lock pin set, outfall flowing, and distant caller signal where those sounds contain gameplay information.
- Support 16:9, 16:10, 21:9, 1280×720, and handheld safe areas. Do not anchor HUD around a debug overlay.
- Save indicator must be readable but nonblocking; recovery from interrupted transition must restore a coherent phase.
- Include content/options for text speed, auto-advance, instant line completion, and finale typing speed.

## Performance and technical quality

The FPS overlay reports very high editor values, but this is not release evidence. The recording is 30 fps and the scenes are prebuilt, so frame pacing, GPU cost, first-load compilation, and lower-end hardware remain unknown.

Later verification targets:

- 60 fps target at minimum spec; median frame under 16.7 ms and 1% low above 50 fps in mower/M4SS/greenhouse.
- No transition main-thread stall above 50 ms.
- No unbounded DOM growth in transcripts, reticles, particles, or tutorial plates.
- Pooled/bounded grass clippings, dust, sparks, route pulses, and M4SS particles.
- No layout shift under the pointer when transcript, suggestions, or puzzle devices update.
- No one-frame old solved scene on remount.
- No texture/geometry compile hitch at first contact; prewarm during boot.
- Release captures must disable overlays independently of user graphics settings.

## Implementation map for later work

### Code owners

- Boot and splash: `src/omniscient/menu/BootScreen.ts`
- Workstation, camera phases, queue pacing, contact arrival/departure, finale orchestration, post-process routing: `src/omniscient/OmniscientRig.ts`
- Globe acquisition and signals: `src/omniscient/globe/GlobeScreen.ts`
- Contact UI, observations, tabs, safe text, objective/readout hierarchy: `src/omniscient/link/LocalSurface.ts`
- Relation, pipe, lock, pursuit, and trail devices: `src/omniscient/link/BoardPanel.ts`
- Mower coverage plot: `src/omniscient/link/MowerPlot.ts`
- Mower handling/cutting/clippings/camera shot: `src/omniscient/view/mowing.ts`
- Contacts, gestures, and authored contact cameras: `src/omniscient/view/riggedContact.ts`, `gestures.ts`, and `scenes.ts`
- All procedural contact environments and their shots/cues: `src/omniscient/view/scenes.ts`
- Machine/room audio: `src/omniscient/audio/ConsoleAudio.ts`, `RoomTone.ts`
- Bounded project VFX: `src/omniscient/vfx/library.ts`
- M4SS presentation/gameplay/audio: `src/m4ss/M4SSRig.ts`, `mass.ts`, `stageArt.ts`, `surface.ts`, `SlimeAudio.ts`
- Ending content/presentation: `src/omniscient/content/ending.ts`, `src/omniscient/menu/EndingPanel.ts`
- Persistent accessibility state and DOM/camera comfort policy: `src/omniscient/accessibility/preferences.ts`
- Settings interaction, focus, and ARIA semantics: `src/omniscient/menu/SystemPanel.ts`

### State ownership rules for later execution

- [Code] Runtime-generated rooms, transitions, camera state machines, procedural props, audio, VFX, queue logic, UI behavior, puzzle behavior, and accessibility.
- [MCP] Only editor-authored scene instances, transforms, materials, lights, camera settings, and scene state that actually live in the Genesys scene. Query editor state before any future mutation and save explicitly.
- [Asset] Generated texture atlases, decals, audio assets if the procedural instrument is supplemented, authored models, and photo/card sets.
- [Verify] `pnpm lint`, then `pnpm build`, then Genesys `action_build(buildProject)` for new game classes, followed by live editor/capture checks. None of these were run for this review.

### Existing Genesys capabilities to use

- `ViewTargetCameraNode` plus the current tweener for authored connection/default/device/resolved/depart shots.
- `FogNode`, practical lights, per-scene daylight/air configuration, and tone mapping for room identity.
- `MeshNode`/procedural geometry and `CanvasTexture` for deterministic decals, photo cards, reticles, maps, and machine displays.
- `VFXNode` and the existing bounded VFX library for short punctuation.
- Custom WebGL composer passes through the existing project path; do not depend on unavailable WebGPU-only stylized effects.
- Game UI container and safe text APIs for all UI. Use engine UI-kit behavior where it improves focus/controller/accessibility, while retaining OMNISCIENT_’s custom visual skin.
- Genesys MCP for later read-only scene inspection and deliberate saved editor changes—not for one-off runtime hacks.

## Suggested production sequence

### Pass 1 — shipping hygiene and proof

- Remove overlays/cursor defects.
- Repair literal emphasis markers.
- Calibrate the audio path.
- Increase text scale/contrast and add CRT strength control.
- Produce one clean 1080p capture of boot → Mirela → globe.

Exit criteria: no visible debug residue, no markup artifacts, readable UI, calibrated sound.

### Pass 2 — core cinematic grammar

- Implement the connection arrival state and per-scene connect shots.
- Rebalance left telemetry, right console, and world-focus mode.
- Implement physical resolution holds and contact reactions.
- Gate the request queue into chapters.

Exit criteria: three blind viewers describe answering a person, not opening a menu; authored late-game missions cannot appear early.

### Pass 3 — four-mission premium vertical slice

Recommended proof set: Mirela for observation/knowledge; Ileana for emotional console work; Adaeze for movement/game feel; Keller/M4SS for the genre break. Tomas can replace Adaeze if schedule demands lower systemic risk.

- Complete lighting/material/ambient-motion pass.
- Complete physical puzzle feedback and bespoke audio.
- Complete adaptive score stems and transitions.
- Complete mission-specific resolved cinematics.

Exit criteria: each mission has a distinct visual/audio identity and a readable no-UI physical payoff.

### Pass 4 — remaining missions and finale

- Apply the proven grammar to Tomas, Vasile, Dorin, and Lucian.
- Finish the final transmission and anomaly image.
- Complete accessibility, controller, aspect-ratio, and minimum-spec pass.

Exit criteria: full campaign pacing works for first-time players; final 15 seconds communicate the twist without explanation.

## Acceptance checklist for a future “Steam-ready” review

- No debug overlay, default cursor, literal markup, placeholder units, or generic OS residue.
- Boot input produces immediate visible and audible acknowledgement.
- Contact connection has a readable room-only frame and human acknowledgement.
- The contact’s face and physical problem are never covered by default UI.
- Essential text is at least 15–16 px at 1080p and scales cleanly.
- World feeds are not crushed by uniform CRT scanlines.
- Every mission has a unique room bed, action transient set, and completion sound.
- Calibrated full-session capture falls near the chosen loudness target and stays below -1 dBTP.
- Adaeze competent completion is 30–45 seconds with obvious cutting and collision feel.
- Console puzzles visibly manipulate their corresponding physical objects.
- Only two or three requests are concurrently answerable, and Keller/Lucian arrive at their intended dramatic point.
- Every resolve holds on a human/material payoff for at least three seconds.
- Finale anomaly is unmistakable and survives a short capture.
- Keyboard, controller, mouse, reduced-motion, CRT, font-scale, flash, and shake settings are verified.
- 60 fps minimum-spec target and transition frame-time targets are met.

## Things not to do

- Do not add another mission before the P0/P1 passes are complete.
- Do not solve hierarchy with more glow, bloom, outlines, particles, or UI panels.
- Do not enable the painterly pass globally as “AAA polish.”
- Do not add a generic loading spinner if signal acquisition can honestly mask work.
- Do not turn every room into green CRT footage; the human/machine contrast is the art direction.
- Do not replace bespoke OMNISCIENT_ UI with generic widgets. Reuse widget behavior and accessibility where useful, then skin it consistently.
- Do not normalize every cue or room independently. Mix by buses and dramatic priority.
- Do not expose implementation units such as pixels in player-facing fiction.
- Do not treat high editor FPS as release performance proof.

## Final assessment

The project’s ceiling is high because the concept, writing, and machine/world contrast are already specific. Its current weakness is that the presentation does not consistently trust those strengths. The route to a remarkable Steam game is to make every connection feel human, every intervention feel physical, and every machine response feel authored and audible. Fix the hierarchy and gain staging first; the project will look and feel substantially more expensive before a single new mission or global effect is added.
