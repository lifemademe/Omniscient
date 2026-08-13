# OMNISCIENT_

## MASTER GAUNTLET v4.9 — ENGINE REALITY / VERIFIED CAPABILITY REVISION

**THIS REVISION IS AUTHORITATIVE OVER v4.8 WHERE IT OVERLAPS.** All prior requirements remain
active unless explicitly changed below.

v4.9 adds no new gameplay system and changes no design intent. It reconciles the v2–v4.8 specification
with **verified** Sandbox Studio Beta capability, measured directly against the installed engine
(`@gnsx/genesys.js` 14.0.10-staging) on 13 August 2026, and against the real Game Jam schedule:
**29 days, solo, first project on this engine.**

Every claim in §208–§213 was verified by inspection of the engine source or by live MCP query against
the running editor. Nothing here is assumed. This directly discharges §63 (*"Begin by inspecting the
actual project and capabilities available to you. Do not assume unsupported Sandbox Studio features
exist"*) and §56 PHASE 1 — INSPECTION.

---

### 208. ENGINE CAPABILITY BASELINE — VERIFIED

**THESE CAPABILITIES ARE CONFIRMED PRESENT. BUILD ON THEM WITHOUT FURTHER INVESTIGATION.**

- **Procedural code geometry is fully supported.** `ENGINE.MeshNode` accepts a raw
  `THREE.BufferGeometry` via constructor options and via a settable `geometry` property
  (`.engine/src/nodes/visual/MeshNode.ts:30,87`). `three` is a direct project dependency. A
  Polyfork-style asset — a factory function returning parameterised geometry — drops straight in.
- **Boolean/CSG construction is available.** `ENGINE.CSGCubeNode`, `CSGCylinderNode`, `CSGSphereNode`
  and `CSGCombiner` are registered, backed by `manifold-3d`. Use for chassis vents, ports, bezels
  and accumulated retro-future hardware.
- **CRT presentation is native post-processing, not custom shader work.** `RetroEffect` ships with
  `scanlineIntensity`, `scanlineDensity`, `scanlineSpeed`, `vignetteIntensity`, `curvature` and
  colour bleeding, built on `three/addons/tsl/display/CRT.js`. `PixelationEffect` provides
  `pixelSize` plus normal/depth edge detection. Bloom, ColorGrading, DoF, AO and ObjectOutline are
  also present.
- **Canvas-driven screen content is supported.** `THREE.CanvasTexture` is registered in
  `ClassRegistry`. Draw to a 2D canvas, map it to a screen mesh, redraw on demand.
- **A complete particle VFX system already exists.** `ENGINE.VFXNode` accepts a JSON path *or* an
  inline `vfxDefinition`; `VFXEmitterCore`, `GlobalParticleManager` and separate WebGL/WebGPU
  particle backends are present. The schema supports burst spawn mode, gravity vectors, lifetime
  ranges and size-over-life fades.
- **Typed player input is supported.** `ENGINE.Input` (`onChange` / `getValue` / `setValue`).
  Enter-to-submit is not built in and must be added on the underlying element.
- **UI kit covers the terminal.** Card, Message, ChatMessage, ProgressBar, Badge, Button, Tooltip,
  NavItem, StatCard, Keystroke, CenterMessage, NotificationBadge, Achievement, Toggle.
- **Rigged characters ship with the engine.** Nine `SKM_` rigs (Adventurer M/F, Aviator M/F, Aztec
  M/F, MediumHuman, Shaman) plus Knightdude and Spacedude.
- **Also present and relevant:** `TweenMovementNode` and `@tweenjs/tween.js`, `InstancedMeshNode`,
  `SplineMeshNode`, `TerrainMeshNode`, `BehaviorTreeNode`, `AnimationStateMachineNode`, `TextNode`,
  `SoundNode`, full light set, fog, sky.

**KNOWN NEGATIVES — DO NOT DESIGN AROUND THESE:**

- `ENGINE.UI3DNode` does **not** render UI onto a 3D surface. It projects a 3D position into screen
  space for DOM UI. In-world screen content must use `CanvasTexture` on a mesh, or a DOM overlay.
- The project ships **zero asset packs and zero templates**. Everything is from scratch.
- Engine audio is six clips (birds, explosion, gun, laser, pickup, tuba). **None are usable.**
- **Editor screenshots fail while play mode is active** (`editor_not_ready: Editor world is not
  loaded`), and exiting play mode unloads the world for ~10s during which `query_node` reports zero
  nodes. Visual verification must happen in edit mode, or headlessly — see §220.

---

### 208a. IMPORTED glTF CHARACTERS FAIL UNDER WebGPU

**STATUS: RESOLVED — THE PROJECT NOW RUNS ON WebGL. SPIKE IS 6/6. SEE §221 FOR THE COST.**

Forcing `rendererOptions.rendererType = 'webgl'` in `main()` clears every error with the character
loaded. This is set in [game.ts](src/game.ts) and must not be reverted without re-testing.

Loading any glTF character makes WGSL compilation fail. Every failing pipeline is a
`MeshPhongNodeMaterial` reporting:

```
no matching call to 'textureSampleLevel(texture_cube<f32>, sampler, vec2<f32>, abstract-float)'
```

The shader declares a cube sampler while a 2D texture is bound. `SkyNode` does label a 2D
environment render target as `THREE.CubeReflectionMapping` (`.engine/src/nodes/visual/SkyNode.ts:399`),
which is a plausible source, but disabling `generateEnvironmentMap` did **not** clear it.

Reproduction matrix, measured against the editor's own error store (which clears per play session,
so each row is an independent measurement):

| Configuration | Errors |
|---|---|
| `SKM_SB_Adventurer_M01.glb`, default materials | 33 |
| Engine's own `mannequinG.glb`, default materials | 11 |
| `mannequinG.glb` + constructor `material` override | 5 |
| `mannequinG.glb` + `useDynamicMaterials: true` | 10 (worse) |
| `mannequinG.glb` + post-load material replacement via `onMeshLoaded` | 10 |
| `SkyNode.generateEnvironmentMap` disabled | no change |
| **No character; procedural geometry only** | **0** |

Nothing procedural is implicated. Terminal geometry, the CanvasTexture screen, `VFXNode` particles,
`RetroEffect` and `ENGINE.Input` all run with zero errors.

| **WebGL forced, character loaded** | **0** |

---

### 221. RENDERER FORK — WebGL IS CANONICAL, AND §212 IS REVISED

**THE PROJECT RENDERS ON WebGL. `RetroEffect` AND `PixelationEffect` ARE THEREFORE UNAVAILABLE.
§212's CLAIM THAT THE CRT LOOK IS "A POST-PROCESS CONFIGURATION, TREAT IT AS SOLVED" IS WITHDRAWN.**

The two capabilities are mutually exclusive in Beta 14.0.10-staging:

| | Characters | RetroEffect / Pixelation | Bloom / AA / AO / ColorGrading / ToneMapping / Outline |
|---|---|---|---|
| **WebGPU** | broken | available | available |
| **WebGL** | **works** | **unavailable** | available |

`RetroEffect`, `PixelationEffect`, `DepthOfFieldEffect` and `SSREffect` extend `WebGPUOnlyEffect`,
whose `createWebGLEffect` returns `{ effects: [] }`
(`.engine/src/render/postprocessing/effects/WebGPUOnlyEffectBase.ts:29`). They fail **silently** on
WebGL — no error, no warning, no visible effect. Do not interpret a clean console as a working CRT.

**Characters win.** Contacts are the game; a global screen filter is not.

**And the loss is smaller than it looks — arguably it is a correction.** A full-screen CRT filter
applies the AI's interface language to the *human* world, which flattens exactly the contrast §187
protects: *"The digital pixel Knowledge Tree remains inside the CRT. Do not painterly-render the AI
interface simply because the human world becomes more painterly."* The human world is meant to be
painterly and the machine layer CRT-bound. A global scanline pass blurs that line.

**Canonical CRT strategy from here:**

1. **In-world screens** bake their own scanlines into the canvas. Already implemented —
   `CRTSurface.applyScanlines()`. Renderer-independent.
2. **The terminal / DOM UI layer** gets scanlines, vignette and phosphor glow from **CSS overlay**.
   Free, works on any renderer, and composites over the DOM UI — which a post-process pass never
   could.
3. **Bloom stays on** for phosphor bleed on emissive screen content.
4. If a genuine full-screen pass is ever wanted, the post-process system is extensible — implement
   `createWebGLEffect` on a custom `IPostProcessEffect`. **Not Jam scope.**

**Revisit trigger:** if a later Beta fixes the WebGPU character path, re-test both. Do not switch
renderers late in the schedule for a stylistic gain.

---

### 222. THE PHONE — ARCHITECTURALLY SUPPORTED, HOSTING UNVERIFIED

**DECISION: §91's REAL QR-PAIRED PHONE IS THE TARGET. IT IS BUILT AS A PROGRESSIVE ENHANCEMENT
BEHIND A TRANSPORT INTERFACE, NEVER AS A LOAD-BEARING DEPENDENCY.**

What is confirmed in the engine:

- `netSettings.serverUrl` connects a browser client to a server; `GameLoop.connectToServer()` exists.
- `JoinParams` is `Record<string, string>`, and `GameMode.canPlayerJoin(clientId, joinParams)` lets
  the server accept a connection in a **phone role** with no pawn and no spawn.
- `@ServerRPC` / `@ClientRPC` / `@MulticastRPC` carry input and state between clients.

What is confirmed against it:

- `NetRuntimeType` has exactly three modes: `Standalone`, `DedicatedServer`, `Client`
  (`.engine/src/multiplayer/NetRuntime.ts:12`). **There is no listen-server.**
- The server is `WebSocketServer` from the Node `ws` package
  (`.engine/src/multiplayer/ServerGameSession.ts:12`). **A browser cannot host.** Two devices
  therefore require a hosted rendezvous point — there is no peer-to-peer path.

What is unverified: the Sandbox docs say multiplayer is supported, that *"the engine handles the
networking"*, that published games run entirely in the browser, and that mobile browsers
(Android Chrome, iOS Safari) are supported — but they **do not document how a second device joins an
active session**. That is the whole question, and it cannot be answered locally.

**De-risking rule.** The intervention surface is written against a transport interface with two
implementations:

- `LocalTransport` — the on-screen virtual phone. Always works. **Ships regardless.**
- `RemoteTransport` — a real device over the network. Progressive enhancement.

Gameplay code talks to the interface and never to a transport. The phone therefore cannot break the
build, and the on-screen version is not a fallback bolted on late — it is the baseline that always
exists.

**Verification experiment, scheduled early, not late:** publish a throwaway multiplayer test build
and try to join it from a phone browser. This is the only way to answer the hosting question, it is
bounded, and it must happen in **Week 1 (17–23 Aug)** — not in week four when there is no room to
react.

**Decision date: 30 August.** If a phone has not successfully exchanged a message with the desktop
client by then, `RemoteTransport` is cut and the on-screen phone ships. No extensions — §172's
feature-freeze rule applies, and a half-working second screen is worse than a polished single screen.

---

### 209. THE ANIMATION CONSTRAINT — ENVIRONMENT REACTS, NOT THE BODY

**CANONICAL. THIS SUPERSEDES §131 AND §159 WHERE THEY REQUIRE THE CONTACT'S BODY TO PERFORM
INSTRUCTED PHYSICAL ACTIONS.**

The shipped animation config (`@engine/assets/character/config/mannequin.animconfig.json`) contains
exactly six clips: **Idle, Jump, Run, RunBackward, StrafeLeft, StrafeRight.** There is no talk,
point, reach, crouch, inspect, kneel or hand-over clip. Authoring new skeletal animation is out of
scope for the Jam.

§131's *"ask the contact to move the camera, turn an object around, zoom in, perform a test"* and
§159's *"the contact physically attempting the instruction"* must therefore be delivered **without
character animation**:

- **The environment performs the instruction.** The camera pans or pushes in; the device rotates on
  its own axis; a panel slides open; a cover lifts; a light changes state; a meter moves; sparks
  fire; a beam sweeps. All of it is tween-driven object motion, which is cheap and fully supported.
- **The contact holds idle or walks.** Use `Idle` as the default state and locomotion only for
  genuine traversal. Never script the body to mime an action it has no clip for.
- **This is diegetically correct, not a concession.** OMNISCIENT_ perceives the contact through a
  cheap network camera. A near-static, partial, grainy feed in which *objects* move is the fiction
  working correctly. Lean into it: framing limits, signal artefacts and restricted viewpoints are
  characterisation, not compromise.
- **§159's intent survives intact.** The contact still reports what happened in dialogue, and the
  world still visibly changes in response. What is cut is only the skeletal performance.
- Where a hero character genuinely needs a bespoke pose, prefer a **procedurally posed prop or a
  static hero mesh** over attempting rig work.

---

### 210. PRODUCTION PIPELINE — CONFIRMED

**§110's CODE-FIRST DEFAULT IS CORRECT AND IS NOW THE PRIMARY PIPELINE, NOT A PREFERENCE.**

- Build all architecture, hardware, props, terminals, clutter, cables, pipes and set dressing as
  **parameterised generator functions** returning geometry or `THREE.Group`. One
  `makeTerminal({ ports, vents, wear, height })` beats twenty hand-placed models and produces the
  §187 "accumulated infrastructure" language for free.
- Favour a **small set of generators with style parameters** over many bespoke scripts (§201).
- Apply §185/§187 at the generator level: asymmetry, silhouette breaks, value blocking, wear
  clusters and deliberate irregularity must be *parameters*, so procedural output reads as authored
  rather than mathematically perfect (§2207 PAINTERLY SURFACE TREATMENT).
- Use the engine primitive GLBs (`SM_Cube`, `SM_Cylinder`, `SM_ChamferCube`, `SM_Wedge`, …) as
  kitbash stock where a generator is overkill.

---

### 211. VFX — USE THE ENGINE PARTICLE SYSTEM

**§192's VFX LIBRARY IS BUILT AS `VFXNode` DEFINITIONS. DO NOT PORT EXTERNAL GLSL.**

- The Elemental Sandbox reference (§191) remains a **technique** reference only. Its shaders are
  hand-written GLSL; this engine renders WebGPU/TSL node materials. Porting is a rewrite, not an
  import, and is not justified for the Jam.
- Jam-scope VFX library, authored as inline `vfxDefinition` objects or JSON:
  **`SparkVFX`** (P0), **`ElectricalArcVFX`** (P0), **`CircuitPulseVFX`** (P0),
  `SignalBeamVFX` / `Dust-MistVFX` / `CRTGlitchVFX` (P1).
- §193's performance rules apply unchanged: caps, pooling, quality tiers, effects as punctuation.

---

### 212. CRT / RETRO PRESENTATION

**THE SIGNATURE LOOK IS A POST-PROCESS CONFIGURATION. TREAT IT AS SOLVED AND SPEND THE SAVED TIME
ON THE CORE LOOP.**

- Configure `RetroEffect` for the global CRT read; tune curvature and scanline density against
  §113's requirement that **CRT effects must not compromise text readability**.
- `PixelationEffect` is available for the AI-side interface, but §187 requires the human world to
  stay painterly. Do not pixelate the world merely because the effect exists.
- The §184 rule stands: painterly is the look, retro constraint is the economy.

---

### 213. THE KNOWLEDGE TREE — IMPLEMENTATION

**CANONICAL IMPLEMENTATION: A 2D PIXEL CANVAS DRAWN IN CODE AND MAPPED TO THE CRT SCREEN MESH VIA
`THREE.CanvasTexture`.**

This satisfies v4.6 §174 (digital pixel organism *inside* the screen, not a physical plant) at very
low cost, and satisfies §123's requirement for deterministic procedural generation from save state.

- Tree topology is generated deterministically from knowledge-graph data. **Never** regenerate a
  different shape from nondeterministic randomness (§123).
- §175's Jam target of **5–7 authored growth stages plus a few milestone mutations** is confirmed
  achievable and is the committed target.
- Growth is revealed on return-to-home (§176 HOME LOOP), drawn pixel-by-pixel.
- The rising-cut-plane reveal technique demonstrated in the Towers reference is the recommended
  approach for drawing growth over time. **Reimplement it independently** — that demo is
  proprietary (§202).

---

### 214. REVISED GAME JAM CONTENT TARGET

**FOR THE 29-DAY JAM BUILD ONLY, THIS SUPERSEDES §171 AND §49. THOSE TARGETS BECOME THE POST-JAM
GOAL.**

§171 specifies 8–12 requests, 3–5 recurring contacts, 3 archetypes. That was authored before the
engine was measured and before the schedule was known to be 29 solo days on an unfamiliar beta
engine. §61's own principle — *"A polished 10-mission OMNISCIENT_ is preferable to a broken
100-mission OMNISCIENT_"* — is the governing rule, and it points down.

**COMMITTED JAM SCOPE:**

- **2 missions**, one archetype (Contact View diagnosis), deeply polished.
- **2 recurring contacts.**
- **1 callback** — a fact learned incidentally in mission 1 is required in mission 2. *This is the
  highest-value element in the build and is protected above everything except the first 90 seconds.*
- **1 ACT burst** (§160/§161 gesture language) inside mission 2.
- **1 free-text moment** using §157's sanctioned deterministic intent-matching fallback.
- **Visible tree growth** at both mission boundaries, plus one final overgrowth beat.
- **Alien stinger**: one unfamiliar branch grafts in at the end (§122). No explanation, no popup.
- **Target runtime: 10–12 minutes.**

**STRETCH, only if the 30 August gate is comfortable:** a third mission.

**EXPLICITLY OUT OF JAM SCOPE** (architecture may anticipate them; implementation does not):
automation (§100–101), Public Confidence (§98), the five-channel system (§96), the software upgrade
tree (§95), Search Defense, the compute farm, OBN broadcast production, cosmetics.

---

### 215. DOCUMENTED DEVIATIONS

Per §1838 (*"choose the closest robust alternative, implement it, and document the deviation"*):

| Requirement | Deviation | Reason |
|---|---|---|
| §128 tree vertical slice requires save/load persistence | **No save system in the Jam build.** Growth persists within a session only. | A 10–12 minute single-sitting experience. Save cost is not repaid within the judged window. §120's return-to-home payoff is delivered *within* the session instead. |
| §103 full diegetic hardware menu (cable-connector cursor with slack/inertia, per-module physical interactions) | **Reduced to a CRT plus 2–3 physical modules**, cable cursor retained. | Full hardware menu is a multi-day build competing directly with the core loop. §182 puts the CRT tree at P0/P1; the module count is not specified. |
| §131/§159 contact performs instructed physical actions | **Environment performs; body idles.** | No animation clips exist. See §209. |
| §91 two-screen phone as signature mechanic | **Confirmed as the target.** Built behind a transport interface; on-screen phone is the always-shipping baseline. | Engine supports it; hosting is unverified. See §222. |
| §212 CRT as a post-process configuration | **Withdrawn.** CRT comes from canvas-baked scanlines plus a CSS overlay. | `RetroEffect` is WebGPU-only and the project must run on WebGL for characters. See §221. |
| §144/§150 ImageGen + img2threejs pipeline | **Not available; falling back to direct procedural Three.js.** | §150 explicitly permits this fallback. See §216. |

---

### 216. TOOLBOX REALITY

- **ImageGen and img2threejs are NOT installed** in the active environment. §150's fallback applies:
  proceed with direct procedural construction, do not stall. Hero props are built by generator, not
  reconstructed from concept images.
- **The MengTo skills repository (`github.com/MengTo/skills`) is MIT licensed** and contains
  `threejs-landscape`, `threejs-weather` and `threejs-towers` as agent-loadable `SKILL.md` files.
  They are **not yet installed**. Install into `.agents/skills/` and verify callable per §198 before
  any mission depends on them.
- **The Towers demo repository and site remain proprietary** — technique reference only, no code or
  art reuse (§202).
- **HyperFrames** remains optional and P1/P2 at best (§189). Its in-game use is gated on video/media
  playback support that has **not** been tested and, per §189, must not be assumed.
- **Audio must be originated.** With no usable engine audio, the CRT hum, relay clicks, modem tones
  and static required by §167 should be **synthesised procedurally via the Web Audio API**. This is
  consistent with the code-first asset doctrine and avoids a licensing surface entirely.

---

### 217. BUILD SCHEDULE AND GATES

**13–16 AUG — CAPABILITY SPIKE.** Throwaway proofs, not game code. Six items:
procedural `BufferGeometry` on a `MeshNode`; `RetroEffect` tuned; `CanvasTexture` redrawn at runtime;
one `SKM_` character loaded and idling; one `VFXNode` spark burst; `ENGINE.Input` capturing text.
**GATE (16 Aug):** all six proven. Any failure is re-planned here, with 25 days remaining, not
discovered in week 3.

**17–23 AUG — SPINE.** Boot → globe → Contact View → terminal shell. Mission 1 playable end to end,
unpolished. §160's mission-definition schema established now, not retrofitted.

> **Progress.** Knowledge Circuit, §160 mission schema, deterministic intent matcher, mission
> runtime, `InterventionSurface` + `LocalSurface` terminal, session controller, and the Contact View
> — procedural dioramas for both missions, a tween runner, and cue dispatch binding mission cues to
> camera moves and prop animations. Both missions run end to end in play mode with zero errors.
> 26 headless checks green.
>
> **Outstanding for this week:** boot sequence (§7), globe, the §176 home-loop cut between the
> workstation and the Contact View, and the §222 publish-and-join experiment.
>
> **Open issue — dioramas cannot be inspected in the editor.** `GAME.ContactScene` registers as a
> placeable class but `action_node.add` fails silently ("Component could not be created"), with
> nothing in the console. Combined with §208 (no screenshots during play mode) this means **3D work
> currently has no agent-side visual verification at all** — only "zero runtime errors". Worth
> solving properly, because building sets blind is how composition problems survive to submission.
> Options: fix whatever the editor factory objects to; or build a small offline rasteriser that
> renders a shot from pure geometry, which would need the diorama layout extracted into data that
> both the scene builder and the preview consume.

**24–30 AUG — THE PAYOFF.** Mission 2, the knowledge store, and the callback working.
**GATE (30 Aug):** the callback lands, or the stretch third mission is abandoned.

**31 AUG–6 SEP — JUICE.** ACT burst, tree growth beats, Web Audio synthesis, post-process pass.
**GATE (6 Sep):** feature freeze. Nothing new after this date.

**7–9 SEP — COLD PLAYTEST.** 3–5 people with no context. Fix the first 90 seconds specifically.

**10–11 SEP — BUFFER AND SUBMIT.** Treat 9 September as the real deadline.

**KILL-SWITCHES, DECIDED IN ADVANCE:** if the diagnosis archetype is not fun by 26 Aug, drop to one
mission and keep the callback structure. If the callback is not landing by 2 Sep, cut the ACT burst
before cutting the callback. **The tree and the first 90 seconds are never cut** — they are the
Theme score.

**PHONE (§91) — DECIDED.** The real QR-paired second device is the target, built behind a transport
interface with the on-screen phone as the always-shipping baseline. The publish-and-join
verification experiment runs in Week 1; the go/no-go on `RemoteTransport` is **30 August**. Full
terms in §222.

**RENDERER — DECIDED.** WebGL, forced in `main()`. Characters over the global CRT filter. §221.

---

### 218. V4.9 QA CHECKLIST

- [ ] No system depends on an engine feature that has not been verified present.
- [ ] No contact is scripted to perform a physical action for which no animation clip exists.
- [ ] Procedural generators expose style parameters and produce asymmetric, authored-looking output.
- [ ] `RetroEffect` is tuned such that all terminal text remains fully legible (§113).
- [ ] The Knowledge Tree regenerates identically from the same knowledge state (§123).
- [ ] Tree growth is visible at least twice within a 10-minute play.
- [ ] The callback is reachable by a player who did not consciously note the mission-1 detail.
- [ ] Free-text input resolves equivalent phrasings to the same intent, and ambiguity asks for
      clarification rather than failing (§164).
- [ ] VFX respect per-effect and global caps and degrade gracefully.
- [ ] All audio is originally synthesised or properly licensed.
- [ ] No proprietary source or art from any reference repository is present in the build.
- [ ] The first 90 seconds demonstrates the final art target, not placeholder quality (§196).

---

### 220. HEADLESS VERIFICATION

Because editor screenshots are unavailable during play mode (§208), anything visual that can be
rendered without the engine **should** be, so it can actually be looked at.

`scripts/preview-tree.ts` renders the real `KnowledgeTree` production code — not a copy — to a PNG
contact sheet of all seven growth stages, via a plain pixel-buffer implementation of `PixelSurface`.
Run with `pnpm exec tsx scripts/preview-tree.ts`.

This is also the §123 determinism check: the same seed must always produce a byte-identical image.
Keep this working. Any CRT content authored against `PixelSurface` rather than against `CRTSurface`
directly inherits the same free verification path.

`scripts/preview-callback.ts` plays both missions through the real `MissionRuntime` and asserts the
callback fires, the blind route still solves, equivalent phrasings resolve identically, and the
unsafe path recovers. Run with `pnpm exec tsx scripts/preview-callback.ts`. **Keep it green** — it is
the regression test for §214's protected element.

Three authoring bugs it caught on first run, all of which would have been near-invisible in the
finished game:

1. **Inflection.** The matcher required exact whole words, so `"look at the connectors"` failed while
   `"look at the connector"` succeeded. Indistinguishable from a broken game (§164). Fixed with
   suffix-tolerant matching.
2. **Lossy clarification.** The callback seed was attached to a *transition*, so a player who phrased
   something awkwardly, detoured through the clarification beat and came back **silently lost the
   fact and the entire Mission 02 payoff**. Knowledge now attaches to the *line the contact says*:
   if they heard it, they know it. This is now a schema rule, not a one-off fix.
3. **Over-eager exclusion.** Widening the power-off vocabulary with `'off'` made `"clean the
   corrosion off"` unmatchable. Safety is enforced by the beat graph — which intents are reachable
   while the set is live — never by keyword exclusion.

**First-pass art notes from the contact sheet, for the 31 Aug juice week:**

- The trunk stays one pixel wide at every stage. It needs to thicken with depth or the late tree
  reads as weeds rather than as something structural.
- Overgrown and Transcendent still sit comfortably inside the frame. §177 requires the late Earth
  arc to *press against or extend beyond the CRT's visible framing* — that overflow is the single
  clearest statement of the theme and is currently missing.
- At 841 segments the alien graft is lost in the canopy. It needs isolation, not just a different
  colour, or the §122 payoff will not land.

---

### 219. V4.9 FINAL DIRECTIVE

**THE DESIGN IS NOT THE CONSTRAINT. THE SCHEDULE IS.** Every capability this game needs is confirmed
present in the engine except character animation, and the fix for that makes the fiction stronger
rather than weaker. Build two missions that are better than anything else in the jam, connected by
one callback that makes a judge stop and look again, inside a CRT that visibly overgrows. Protect the
first ninety seconds. Ship on the ninth.

*You don't know everything. Yet.*
