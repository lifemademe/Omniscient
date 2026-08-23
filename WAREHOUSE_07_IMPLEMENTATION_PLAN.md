# Warehouse 07 — Postgame Capstone and Night Shift

This is the implementation source of truth for the postgame Warehouse 07 feature. It records the approved product decisions so future work can resume without reconstructing the design from chat history.

## Product direction

- Build a 22–30 minute authored postgame mission that continues directly from the mysterious red signal.
- Completing it unlocks a replayable, deterministic 30-stage `Night Shift` mode.
- The creative pillars are observation, spatial mastery, cross-referencing, uncertainty, and controlled workload—not combat or statistical grinding.
- Use only procedural runtime environment assets. Workers use `@project/assets/models/Tomas.glb`; visitors rotate through the other existing character GLBs.
- Keep the warehouse layout stable between runs. Randomize manifests, schedules, package locations, personnel, evidence, and compatible anomalies.
- Build all warehouse state at runtime. The active Genesys scene is intentionally empty and is not the state owner.

## Postgame trace and entrance

- When the ending reveals the off-world red signal, its detail panel intermittently exposes `PROJECTION −11.5 / −57.0` before Warehouse 07 is named.
- The red signal uses `TRACE`, not `ANSWER`.
- The projected point initially shows empty forest in central Brazil with no registered structure.
- The Trace Console offers six records. The player combines the three matching information layers:
  - carrier parallax projected from the off-world signal;
  - freight traffic disappearing into an unmapped rectangle;
  - industrial power consumption with no registered customer.
- These layer capabilities visually connect to knowledge acquired through the campaign. Completed old saves receive the required layer access even if an incidental fact was missed.
- A successful cross-check reveals `WAREHOUSE 07 // REMOTE LOGISTICS ANNEX // STATUS: OPERATING` and adds a terrestrial marker beneath the off-world signal.
- The first marker action is `ENTER`; after the story clear it becomes `NIGHT SHIFT`.
- Use a skippable remote-link handoff tied to actual readiness, followed by a maximum 10–12 second surveillance montage of rain, the front door, rear truck dock, numbered aisles, and the drone cradle.
- Reduced-motion mode uses hard surveillance cuts instead of camera travel.

## Authored story movements

### Movement 1 — Learn the building

- No timer or score.
- Teach switching between front CCTV, drone view, and manifest console.
- Package addresses are spatial: `7018` means Aisle 7, Bay 18; aisles display their valid range.
- Complete one valid visitor collection from request through outbound cargo airlock.
- Contextual prompts disappear permanently after their action is demonstrated.

### Movement 2 — First judgement

- An intact package sent to the wrong destination must go to `RETURN TO INBOUND`.
- A matching package with a broken security seal must go to `QUARANTINE`.
- The physical decision vocabulary is `RELEASE`, `QUARANTINE`, and `RETURN TO INBOUND`.
- Suspicious cargo is never casually discarded. Certified waste may later use a dedicated compactor.

### Movement 3 — Inbound freight

- Introduce an event countdown that announces truck arrival rather than causing failure.
- At zero, warnings activate, the rear shutter opens, a truck unloads eight packages, and four authorized workers enter.
- Sort packages onto stationary `LOCAL COLLECTION`, `REGIONAL TRANSFER`, and `LONG-HAUL` conveyors.
- Commit through `VERIFY LOAD`, then `START SORT`; all three conveyors start together as the payoff.

### Movement 4 — Controlled overlap

- A visitor arrives while another freight operation runs.
- The bell sounds once, leaves a persistent visual counter, and uses one restrained reminder after 20 seconds.
- Five workers enter against a four-person manifest.
- The fifth has a valid temporary badge but no matching personnel file. The correct decision is `REQUEST HUMAN VERIFICATION`, then `HOLD BAY`.
- Dispatch confirms a legitimate substitution, teaching that uncertainty is a valid response and appearance alone is never evidence.
- Mix one cargo destination mismatch into the workload.
- Cap unresolved visitors at three, active workers at six, and active cargo at twelve.

### Movement 5 — Package 7018

- The red transmission resolves only to `WAREHOUSE 07 // PACKAGE 7018 // HOLD`.
- A visitor appears on front CCTV with apparently valid collection authority.
- The physical canopy is empty from the drone while CCTV continues to show the visitor.
- Aisle signs become `5, 6, 7, 7, 8`; historical records insist that only one Aisle 7 exists.
- Both Aisle 7s appear to contain package 7018.
- Each passes ordinary identity and seal checks, but measured mass migrates between them while combined mass remains constant. This echoes M4SS without identifying or explaining it.
- The correct resolution is to preserve both records, compare live and historical cameras, quarantine 7018, and request human verification for the visitor.
- A confirmed release is a critical breach and reloads the movement checkpoint while preserving the mistake in the final record.
- On correct quarantine, the cage seals, the empty outbound airlock opens itself, CCTV shows the visitor lift an unseen weight, the real doorway stays empty, and the red signal shifts slightly toward Earth.
- Return to the workstation with a Warehouse 07 photograph and a sealed unidentified fragment beside the CRT.

## Core gameplay systems

### Assisted hover drone

- Use a dedicated warehouse drone pawn/controller or equivalent runtime input pair.
- Keyboard/mouse: WASD movement, mouse aim, Q/E or wheel altitude bands, primary scan/photo, secondary gripper, Tab console/CCTV.
- Controller: left stick movement, right stick aim, bumpers altitude, triggers scan/gripper, face buttons for views and decisions.
- Auto-level, brake on release, slow near people, and recover softly from rack collisions.
- No battery, health, carry-strength, or faster-scanning progression.
- Use a target-lock magnetic gripper with stable docking rather than loose carry physics.
- A recovery action returns stuck drone/cargo to its last safe station with a service-time penalty.

### Unified observation and decisions

- Every inspectable subject exposes identity, expected record, sensor readings, discrepancies, confidence, captured evidence, and permitted decisions.
- The same scan/photo action works for people, packages, seals, machinery, cameras, and environmental anomalies.
- Dynamic IDs, names, manifests, and results use UI text setters or `textContent`, never HTML parsing APIs.
- Worker decisions are `CLEAR`, `HOLD BAY`, and `REQUEST HUMAN VERIFICATION`.
- Cargo decisions are `RELEASE`, `QUARANTINE`, and `RETURN TO INBOUND`.

### People, cargo, and machinery

- Workers reuse the Tomas rig and walking animation, with procedural PPE, badges, helmets, scanners, material variation, and accessories.
- Visitors use other model-folder character GLBs and remain behind CCTV/exterior framing.
- Worker behavior trees operate over deterministic authored waypoint lanes with blackboard states for unloading, waiting, held, cleared, evacuating, and missing.
- Route watchdogs recover stalled workers behind occlusion rather than leaving the shift unwinnable.
- Use custom carryable cargo nodes, not collect-and-destroy pickups or the stub pickup spawner.
- Cargo states are inbound, carried, staged, released, quarantined, returned, and disposed.
- Doors, scanners, shutters, cages, conveyors, scales, and truck unloading expose explicit state and cannot advance while prerequisite checks or animations remain unresolved.

## Night Shift replay mode

### Thirty-stage progression

- Target 18–25 minutes for a skilled Stage 30 clear.
- Stages 1–5: normal operations.
- Stages 6–10: single discrepancies.
- Stages 11–17: overlapping visitors and freight.
- Stages 18–23: combined cargo and personnel verification.
- Stages 24–29: controlled sensor and topology contradictions.
- Stage 30: one rare capstone anomaly assembled from previously learned rules.
- Completing Stage 30 ends the ranked run; optional overtime is unranked.

### Curated deterministic director

- Use a seeded PRNG derived from mode, seed string, and case-deck version. Do not use `Math.random()` for gameplay.
- Case templates define visitors, workers, cargo, clues, tools, anomalies, schedules, and correct decisions.
- Reject combinations that require locked tools, lack a unique defensible conclusion, overfill stations, accidentally contradict objectives, combine topology anomalies, or exceed workload caps.
- The ordinary warehouse layout never randomizes.

### Failure, scoring, and ranks

- Story has three integrity seals and checkpoints between movements.
- Non-critical errors consume integrity and allow correction; zero integrity reloads the movement and caps the story rank.
- Endless has three integrity seals; non-critical errors remove one and reset the clean chain. Three errors or one confirmed critical breach ends the run.
- Rank order is highest stage, critical correctness, accuracy/completeness, clean chain, then service time.
- Accessibility settings, pausing, and input device never reduce rank.
- Ranks are `TRAINEE`, `OPERATOR`, `INSPECTOR`, `CONTROLLER`, `OVERSEER`, and `OMNISCIENT`.
- `OMNISCIENT` requires Stage 30, no integrity loss, no unverified dispatch, and complete anomaly evidence.

### Horizontal tools

- Story clear unlocks historical CCTV comparison.
- Stage 10 unlocks thermal scanning and thermal cases.
- Stage 18 unlocks UV/alternate-light scanning and seal cases.
- Stage 24 unlocks X-ray and internal-layout cases.
- Stage 30 unlocks acoustic-frequency analysis and resonance cases.
- Every tool receives an unranked calibration case before its cases join the deck.
- Tools add information channels and harder cases; they never numerically improve the drone or simplify old cases.

### Archives and Daily Shift

- Persist highest rank/stage, clean chain, rare cases, tools, aggregate decisions, Daily results, archive records, and photographs.
- Evolve the workstation with pinned photographs, manifests, a sealed object, rank plates, a Stage 30 plaque, and Knowledge Tree branches.
- Store archive metadata in the warehouse save and compressed 512×288 scan-camera images in IndexedDB. Cap at 32 images; never evict favorites automatically.
- Daily Shift uses the UTC date and case-deck version for a shared deterministic seed.
- Daily mode loans every required tool so progression confers no advantage.
- Store local attempts/results and generate a share code. Do not add a backend or Steam leaderboard in the first release.

## Procedural art and atmosphere

- Build modular concrete shell, eight rack aisles, signs, shelves, pallets, packages, front cargo airlock, CCTV canopy, truck dock, rear shutter, three conveyors, quarantine cage, return station, certified-waste compactor, hold bay, drone cradle, cameras, beacons, vents, drains, bollards, and floor markings.
- Instance repeated racks, lights, crates, and fittings; merge static decoration by material.
- Central-Brazil night direction: humid rain, wet concrete, roof runoff, exterior insects, restrained lightning, cool green-blue shadows, sodium-amber work lights, and red reserved for security/anomaly states.
- Materials emphasize galvanized steel, painted rails, dusty cardboard, stretch wrap, rubber, concrete, condensation, and worn markings.
- Scans use restrained brackets, exposure sweep, depth-aware emphasis, and material response.
- CCTV receives timestamp, compression noise, mild frame loss, and lens distortion; the drone feed remains cleaner.
- Anomalies selectively corrupt timestamps, occlusion, reflections, mass, and topology instead of applying generic full-screen glitch noise.
- Duplicate Aisle 7 uses an occlusion-safe topology swap. Reduced-motion mode uses a clean cut.

## Audio and accessibility

- Add warehouse audio through the existing shared audio context and buses.
- Procedural beds: HVAC, ballast hum, filtered rain, truck idle, machinery, and insects.
- Spatial cues: bell, footsteps, packages, drone, gripper, scanner, beacons, shutters, cage, and conveyors.
- Every critical sound has visual redundancy and sound-caption support.
- Add a warehouse adaptive-score state with calm, workload, contradiction, and finale detail levels.
- Respect existing large text, text speed, reduced motion, screen shake, flash intensity, display filter, and sound-caption settings.
- Never make rack identification, destination, worker status, or sensor evidence depend on color alone.

## Architecture and persistence

- Add semantic globe interactions: `answer`, `trace`, and `enter`, plus optional action labels and projection readouts.
- Mount a self-contained `WarehouseRig` from `OmniscientRig`, following the existing M4SS handoff and teardown pattern.
- Separate content definitions from runtime entities through story, movement, case, tool, sensor, manifest, decision, run-config, and run-result types.
- Use a dedicated deterministic director for scheduling, validation, and scoring.
- Compose HUD from Genesys UI Kit widgets where they fit, with custom OMNISCIENT styling and safe text APIs.
- Save warehouse progress under versioned `omniscient.warehouse.v1`: trace, unlock, story checkpoint, permanent mistake count, first clear, rank, tools, archives, statistics, Daily history, and deck version.
- Save only at movement or resolved-case boundaries. Quitting mid-movement resumes at its start.
- Clearing the main save also clears warehouse metadata and archived IndexedDB captures.

## Implementation order

1. Add trace semantics, coordinate presentation, Trace Console, terrestrial marker, and save restoration.
2. Build procedural warehouse shell, signage, stations, cameras, lighting, and performance structure.
3. Implement drone controls, view handoffs, collision/recovery, scanner, and gripper.
4. Implement evidence, cargo, visitors, worker behavior trees, conveyors, quarantine, return, hold, and verification.
5. Author the five story movements and Package 7018 finale.
6. Add the seeded 30-stage director, ranks, tools, archives, and Daily Shift.
7. Add final audio, adaptive score, captions, VFX, cinematics, accessibility, and procedural dressing.
8. Verify with `pnpm lint`, `pnpm build`, Sandbox Studio `buildProject`, registered-class checks, play-mode inspection, and viewport screenshots.

## Acceptance requirements

- Warehouse 07 stays inaccessible before campaign completion.
- Completed old saves restore correctly before trace, after trace, and after marker reveal.
- The facility requires all three correct information layers to reveal.
- The first collection teaches the complete loop without time pressure.
- The bell never loops and always has visual/caption redundancy.
- Package addressing is readable without a map.
- Every ordinary case has one defensible conclusion with available tools.
- Stuck drone, worker, or cargo states can recover without restarting the game.
- Story errors persist through checkpoint reloads for ranking.
- Identical seeds produce identical cases and schedules after reload.
- Tool unlocks add complexity without numerical advantage.
- Daily mode is progression-neutral through loaned tools.
- Package 7018 is solvable through evidence without interpreting visual noise or remembering dialogue verbatim.
- Runtime strings are safely rendered.
- Warehouse teardown removes input handlers, DOM, audio, cameras, and runtime nodes.
- Target a stable 60 FPS at 1080p on a mid-range Steam PC with the stated worker/cargo caps.

## Fixed assumptions

- The tone remains an uncanny systemic thriller with no combat, chase, monster reveal, or definitive explanation.
- Package 7018 echoes M4SS but is not identified as M4SS.
- Warehouse 07 uses the red signal’s existing `−11.5 / −57.0` terrestrial projection.
- First access is through the globe; after story completion Night Shift is also available from the workstation.
- Online services are outside the first release.
- Existing unrelated worktree changes must be preserved, and `src/auto-imports.ts` must never be edited manually.
