# OMNISCIENT_ — a senior review, and the plan that falls out of it

Reviewed 2026-08-19, against the whole repo at `457d07f`. Feature freeze is Sept 2, jam
deadline Sept 11. Everything below is calibrated to those two dates: findings are ranked by
what they cost a jam judge in their first thirty minutes, not by engineering interest.

The method is the same one the M4SS polish loop earned the hard way: every claim below is
grounded in a file and a line, judgements are separated from measurements, and the plan at
the bottom is written so a later session can execute it step by step without re-deriving any
of this. Where a finding could not be verified without running the game live, it says so.

---

## The reference frame

What this game is measured against, and why each reference earns its seat:

**The interface-fiction lineage** — the family OMNISCIENT_ actually belongs to:
- *Papers, Please* / *Return of the Obra Dinn* (Pope) — the gold standard for "the interface
  IS the game" and for endings that recontextualise the whole playthrough.
- *Her Story* / *Immortality* — investigation through a machine; what a database feels like
  when it has a soul.
- *Hypnospace Outlaw* — the benchmark for a fictional OS with juice: every click makes a
  sound, every surface has a personality.
- *Chants of Sennaar* (2023) — teaching a vocabulary without a tutorial, which is exactly
  what the intent system attempts.
- *The Roottrees Are Dead* (2023 itch / 2025 remaster) — deduction with a knowledge tree
  that VISIBLY grows, the same promise as the CRT tree.
- *Lorelei and the Laser Eyes* (2024) and *Blue Prince* (2025) — the current bar for
  puzzle-game atmosphere, restraint and typographic confidence.

**GOTY-tier, 2023–2025** — for production values and "one more thing" density:
- *Baldur's Gate 3* (2023) — reactivity: the game remembers what you did.
- *Alan Wake 2* (2023) — lighting as narrative; a game that grades every frame.
- *Balatro* (2024) — juice on a budget: one screen, zero 3D, and every number that changes
  SHOUTS. The single most relevant reference for the console screens.
- *Astro Bot* (2024) — feel: squash, stretch, particles and audio on every verb.
- *Animal Well* (2024) — one developer, procedural discipline, atmosphere from almost
  nothing. The closest kin to this repo's all-generated asset policy.
- *Clair Obscur: Expedition 33* (2025) — what a small team gets from committing to one
  strong aesthetic instead of breadth.

**Jam-scale excellence** — what actually wins jams:
- GMTK winners and near-winners (*Mosa Lina* -adjacent physics toys, *Bad Time Trio*-style
  one-mechanic clarity): the pattern is ONE verb, taught in ten seconds, escalated for
  fifteen minutes, ended with a flourish. M4SS is measured against this.
- *World of Goo 2* (2024) / *Gish* — the soft-body platformer feel bar.
- *Celeste* — the forgiveness bar: assists, instant retry, failure that costs seconds.

---

## Verdict, in one table

Scored 1–10 against the references above, at jam scale (not AAA budget scale).

| Axis | Score | One line |
| --- | --- | --- |
| Writing & mission design | 8.5 | Genuinely excellent; the best thing in the game |
| Systems architecture | 9 | One runtime, authored content, harness-proven; rare at any scale |
| Art direction (M4SS) | 7.5 | 23 measured polish passes show; portal/backdrop strong |
| Art direction (console) | 7 | CRT, globe, tree, board: coherent and confident |
| Audio | 4 | Console synth is smart and half-wired; M4SS is fully SILENT; no music |
| Game feel / juice | 5 | Slow-mo and swing feel good; almost nothing celebrates |
| Onboarding | 5 | Intent chips teach well; M4SS teaches only via one HUD line |
| Failure & stakes | 6 | "Costs the attempt, never the creature" is right; but nothing dramatizes loss |
| Structure (start/end) | 3 | No save. No ending. A 9-mission narrative game that forgets you |
| Accessibility | 3 | Red/green is THE stage-2 mechanic and there is no colourblind path |
| Immersion & detail | 8 | Photographs, board, mower plot, knowledge tree — dense and diegetic |
| Performance & stability | 8 | Fixed-step sim, headless harnesses, 58 checks green |

**The headline:** this is a systems-and-writing jewel wearing a jam-week wrapper. The two
structural holes (no save, no ending) and the silence of M4SS are worth more points than
every remaining art pass combined. A judge who plays 30 minutes never sees pass 23 of the
backdrop; they absolutely notice that closing the tab erases them, and that the slime makes
no sound when it eats a wall at 800px/s.

---

## What already stands (credit before critique)

Things at or above the reference bar, verified in-repo:

- **The mission writing.** `mission-01-transmitter.ts` alone: "look at the set" vs "look at
  the back of the set" is the kind of vocabulary-teaching decision Chants of Sennaar makes.
  Every beat has a reasoned comment. §159 ("a rejected message produces a clarification
  beat, never CORRECT/INCORRECT") is a design law most narrative games never articulate.
- **One runtime, every mission** (`MissionRuntime.ts`) — content cannot drift from system.
- **Device variety without engine variety**: the mower plot, the lock, the board,
  photographs, scan targets — each mission gets a hands-on object inside one framework.
- **The console audio design** (`ConsoleAudio.ts`) — "ONE INSTRUMENT, not a library of
  effects"; carrier/squelch/keyer as narrative. The design doc in that header is
  ship-it-in-a-talk material. (The problem is coverage, not quality — see findings.)
- **The M4SS simulation** — mass-as-particles, conservation as representation, stated reach.
  The four-versions-that-failed comment block is real design maturity.
- **The verification culture** — 58 gameplay checks, the art audit, the texture sheet, the
  polish log. Nothing else at jam scale works like this.
- **All-procedural discipline** — same lineage as Animal Well; it shows in coherence.

---

## Findings

Ordered by severity. Each carries evidence, the reference it fails against, and the fix
(expanded in the plan).

### F1 — There is no save system. `[P0]`
**Evidence:** the only `localStorage` key in the game is `omniscient.volume`
(`ConsoleAudio.ts`). Mission progress, knowledge, resolved requests, M4SS stage — all
per-tab, all lost on refresh.
**Against:** every single reference, including 48-hour jam winners. Lorelei, Blue Prince,
Roottrees — all continue. A 9-mission narrative game with typed conversations is a 2–4 hour
experience; without persistence the effective content a player sees is one sitting.
**Fix:** serialise the small true state (resolved mission ids, knowledge store, offered
queue position, M4SS stage index) to one localStorage key; restore on boot; "CONTINUE" on
the main menu. The architecture makes this cheap: knowledge and queue are already the only
state that matters, by design.

### F2 — The game has no ending. `[P0]`
**Evidence:** `OmniscientRig.ts` queues MISSION_09 last; nothing anywhere handles the queue
being exhausted (no "ending/credits/finale" hit in the search). After Keller, the machine
sits at the menu forever. M4SS: `advance()` on the last stage returns silently — the portal
flares and nothing happens, which reads as a bug, not a finale.
**Against:** Obra Dinn/Papers Please endings recontextualise; even the smallest jam winner
ends with a card. §52 discipline deserves a payoff scene.
**Fix (scoped to jam):** one final transmission after the last resolved request — the
knowledge tree fully lit, a slow camera pull back from the machine, a containment-report
style summary card (missions resolved, what was learned, what was left unanswered), then
credits. M4SS: a stage-2 portal that returns you to Keller's desktop with the file marked
"SPECIMEN CONTAINED" — closing its own loop inside the fiction.

### F3 — M4SS is completely silent. `[P0]`
**Evidence:** zero audio imports in `M4SSRig.ts`; `ConsoleAudio` is only wired to the
console. The slime latches, snaps, splits, is crushed, presses buttons, drops a drawbridge,
and enters a portal in total silence.
**Against:** Astro Bot/Balatro standard is sound-per-verb; even GMTK 96-hour builds ship
bleeps. Physical comedy (a slime IS physical comedy) is half audio.
**Fix:** extend the existing instrument philosophy — a `SlimeAudio` synth module (wet
filtered noise for movement, pitch-bent squelch for latch/release, a dry click-thunk for
buttons, low sine drop for the gate, granular shimmer for the portal). No files, same rules
as `ConsoleAudio` (master ceiling, nothing over a second, small detunes only). Slow-mo
should also filter the audio (lowpass sweep) — that one trick sells the effect harder than
the timescale itself.

### F4 — Stage 2's core mechanic is red vs green. `[P0 — accessibility]`
**Evidence:** dead growths are a red palette of the same plant (`stageArt.ts` bushTexture
`dead` branch); the ONLY reliable difference is hue. ~5% of male players (deuteranopia)
cannot play stage 2's central deduction.
**Against:** current-gen baseline; GOTY games ship colourblind paths; jams get called out
for this in comments.
**Fix (cheap, no setting needed):** make the dead growth differ in SHAPE, not only hue —
drooped/wilted leaf angles (arc range shifted downward), no core glow (already true), and
2–3 hanging withered strands. Silhouette-distinct at a glance in greyscale. Verify by
rendering both to the sheet and checking in greyscale.

### F5 — Nothing celebrates. The game solves quietly. `[P1 — juice]`
**Evidence:** mission resolve plays `audio.play('solved')` and updates the tree; M4SS stage
clear scales the portal 1.25x and teleports to the next stage in one frame (`advance()` is
called the same frame `cleared` is set). Buttons depress nothing (static cylinder). The
drawbridge falls well (eased hinge rotation — good), but lands with no dust, shake or
sound. Splits and crushes emit no particles.
**Against:** Balatro is the masterclass — the same numbers with celebration became GOTY.
**Fix:** a small juice budget, in order of value-per-hour:
  1. Stage clear: 0.8s hold — portal iris flares (phase spike), slime is drawn INTO it
     (scale to zero along a curve), white-out, then next stage fades in. One tween.
  2. Button press: cylinder depresses 6px and emits 8 pixel-sparks; heavy button also
     kicks the camera 4px (the one legitimate screen-shake in the game).
  3. Crush event: 10–14 dark green particle pixels squirt from the press gap; slow-mo for
     0.2s (reuse `slowmo` at 0.5) so the player SEES what it cost.
  4. Landing after a fling: 4–6 dust motes at contact plus a single soft thump (F3's synth).
  5. Console: when a fact is learned, the knowledge tree pulses along the new branch
     (`revealGrowth` exists — verify it is loud enough; add a chime ramp keyed to depth).

### F6 — First-contact teaching is thin on the M4SS side. `[P1]`
**Evidence:** the entire tutorial is one HUD line ("hold Q to call it back") plus two chip
suggestions on the console side. Controls (A/D, LMB hold, release, Space-hold split, Q) are
never stated anywhere in-game. The jam judge will click for 40 seconds before discovering
LMB-hold latch.
**Against:** GMTK winners teach the verb in <10s, in-world.
**Fix:** diegetic, zero-UI teaching in stage 1 (the fiction already supports it — Keller's
desktop launched this as a containment sim): four faded pixel-text glyphs painted INTO the
level art at the point of need — "A/D" on the first floor, "HOLD LMB" beside the first
growth, "HOLD SPACE" at the wall, "Q" past it. Painted in `stageArt` as level decals, not
HTML. They are in the world, so they cost no immersion.

### F7 — The mass economy can be bypassed: the split is optional. `[P1 — known, decision pending]`
**Evidence:** measured 2026-08-19 — a full 40-mass body crawling flattens to ~15px
(`crawlRelax`), under both stages' 30px gaps; split bodies measure the same heights, so no
gap width separates them.
**Fix options** (decide, then one line + harness check):
  a. Gates check MASS, not height: a containment sieve — a grate the fiction supports; the
     slime oozes through only below N grams. Honest, readable, no feel change. **Recommended.**
  b. Raise crawl height (reduce `crawlRelax`) — risks the ooze feel that makes crawling good.
  c. Accept as a speedrun skip — defensible for a jam, but stage 2's wake-button loop
     collapses if you can bring full mass through.

### F8 — Failure never costs a story beat. `[P1]`
**Evidence:** `MissionFailure` exists in types; cooldown exists (currently overridden to
10s — `OmniscientRig.ts:2029` still has `COOLDOWN_OVERRIDE = 10`, a debug value that MUST
be reverted before freeze). But a failed mission simply cools down and re-offers; nobody
mentions it. Mirela's countdown (the one real consequence) is the exception that proves how
good this could be everywhere.
**Against:** BG3's reactivity; Papers Please's compounding consequences.
**Fix (jam-scoped):** on re-contact after a failure, one authored line per mission
acknowledging the last attempt ("You again. The pump is still dry, if that matters.").
Eight lines of writing, disproportionate payoff in perceived reactivity.

### F9 — The HUD and the game are from different games. `[P1]`
**Evidence:** M4SS HUD is Courier-New-over-CSS with a green border (`buildHud`); the
console has a full art direction (CRT phosphor, plates, labels). The M4SS fiction is "a
containment sim running on Keller's machine" — the HUD should look like that OS.
**Fix:** restyle the HUD as a strip of the station-desktop chrome (same font/palette as
`stationDesk.ts`), title it `SPECIMEN M4SS — LIVE`, and let the mass bar read as
a containment gauge. CSS only; one hour; large coherence gain.

### F10 — Lighting is graded once, globally. `[P2]`
**Evidence:** ACES at exposure 0.5 in the scene file; M4SS pre-compensates via `lift()`;
contact scenes each carry atmosphere cues. What is missing is per-BEAT light movement in
missions — Alan Wake 2 moves light when the story moves. The cue system already supports
`environment` per transition; few missions use light as a beat.
**Fix (post-freeze polish):** audit missions 2/5/6 for one lighting beat each — the cellar
darkening as covers close, the beacon room warming on solve. Cheap in the cue grammar.

### F11 — Characters gesture, but only four ways. `[P2]`
**Evidence:** `GESTURE_CUE` matches point/surprised/reacting/nod; gestures.ts has four
clips. Across 8 missions the same four moves recur; by mission 5 the point is furniture.
**Fix:** two more clips (a slump for defeats, a lean-in for confessions) would cover the
emotional range the writing already hits. Post-freeze.

### F12 — `urgency` is authored on every mission and read by nothing. `[P2]`
**Evidence:** long-standing; declared in every mission file.
**Fix:** either wire it (urgency drives the signal's blink rate on the globe — one
multiplication) or delete the field. An unread authored field is a promise the pipeline
breaks silently.

### F13 — Unverified-live list (must be burned down before freeze). `[P0 — verification]`
Console route `game.launch:m4ss` from Keller's chat; portal → stage 2 handoff on the real
renderer (teardown/rebuild touches materials the harness cannot see); camera follow in the
tall stage; drawbridge animation against the real gate mesh (rotation about hinge was
authored against `restY` in level space — verify the flip); crusher meshes moving; hover
glow cost (per-frame `Math.hypot` over anchors is fine, but material.map swap correctness
needs eyes). Method exists: `record.py` contact sheets + TEMP-VERIFY auto-open.

---

## The plan

Executed the way M4SS-POLISH.md was: one item at a time, verify in the medium the change
lives in, log a line. Harness rule stands: `m4ss-stage.ts` (28) and `m4ss-shaft.ts` (30)
stay green on every pass; `preview-stuck.ts` guards the console.

### Phase 0 — structural, before anything else (target: this week)
> Status 2026-08-19: items 1-6 done. Item 7 is the only thing left before Phase 2.

1. **[DONE `d15a37f`] Save/continue.** New `src/omniscient/session/persistence.ts`: serialise
   {version, resolved mission ids, knowledge facts, queue offset, m4ssStage} on every
   resolve and stage clear; restore in rig boot; menu shows CONTINUE when a save exists.
   `[Verify]` headless: resolve mission 1 → serialise → fresh rig → restore → mission 2 is
   offered. Add to preview-stuck.
2. **[DONE `d15a37f`] Restore `COOLDOWN_OVERRIDE` to `null`.** One line. `[Verify]` grep + preview-stuck.
3. **[DONE `7b46ad6`] The ending.** After last queue resolution: final transmission beat (authored,
   ~20 lines), tree fully lit, pull-back shot, containment-report summary card (missions,
   facts learned, what was never asked), credits line. `[Verify]` preview script walks all
   missions to completion and asserts the ending fires.
4. **[DONE `7b46ad6`] M4SS ending hook.** Stage-2 portal → "SPECIMEN CONTAINED" state on Keller
   desktop file → return to console. `[Verify]` live capture.
5. **[DONE `29e6599`] M4SS audio.** `src/m4ss/SlimeAudio.ts` per F3, wired to: latch, release,
   snap, split, recall, button, heavy-button, gate, bridge fall, crush, portal, landing.
   Slow-mo lowpass sweep. `[Verify]` live; keep master under ConsoleAudio's ceiling.
6. **[DONE `adfc842` - mass sieve at 24 grams]** Split bypass decision (F7, recommend mass-gate). `[Verify]` new harness check:
   full body driven at the gap for 30s does NOT pass; legal split does.
7. **[MACHINE HALF DONE `d1d99f2` - boot, framing, HUD, stencils, movement, pit-return,
   split bar, recall all verified in play mode. HUMAN HALF REMAINS: latch/swing feel, warp
   to stage 2, crushers/red growth live, the slime's voice, ending pacing, CONTINUE across
   a restart - one play session, needs ears]** Burn down F13 live-verification list with record.py; fix what falls out.

### Phase 1 — feel, before freeze (target: Aug 25–Sept 2)

8. **[DONE `813dc8c` - items 1-4; item 5 (tree pulse loudness) folded into the live burn-down]** Juice pass per F5, items 1→5 in order, one per pass, harnesses green.
9. **[DONE `a13b0ee` - measured 74% vs 39% above the core line in greyscale]** Dead-growth silhouette per F4.
10. **[DONE `a13b0ee` - four stencils in Pelagic OS's own face; weathering by fade, never dropout]** Diegetic control glyphs per F6.
11. **[DONE `3d4916c`]** HUD restyle per F9.
12. **[DONE `3d4916c` - `reopeningSay`, once per relationship, on the first re-contact after a loss]** Failure re-contact lines per F8.
13. **[DONE `3d4916c` - blink pace 1x/2x/3x by authored urgency]** Wire `urgency` (F12).

### Phase 2 — if time remains / post-jam

14. ~~Lighting beats in missions 2/5/6 (F10).~~ **[DONE 2026-08-26 - a `light` domain in the
cue grammar plus one beat each: the cellar lamp reaching further as the water goes, the sea
glow standing down as the beacon holds, the step bounce warming with the door. cues-resolve
knows the domain and was proved to catch a bad beat id.]** 15. ~~Two gesture clips (F11).~~ **[DONE 2026-08-26 - `slump` and `dread`, wired to three
failure beats. F11 asked for a lean-in for confessions and no lean-in exists in the asset
set, so the second clip is dread instead; a confession lean-in still has no animation. The
four names were also hardcoded in three places and are now one exported list.]** 16. ~~Music bed:
one adaptive drone per Tempo, same synth instrument family.~~ **[DECLINED 2026-08-26 on
evidence - a recommendation rather than a schedule call, so say so if you want it anyway.
It contradicts a decision AdaptiveScore's own header states: "Contact conversations
themselves stay scoreless. A human voice and its room are the music there." A drone per Tempo
is a drone under every conversation beat, which is the one place the design deliberately
keeps clear. The premise does not hold either - all ten declared score states are entered by
something, and every state taking a detail parameter has it driven by real state: the globe
by requests answered, the action pulse by how much of the field is cut, the warehouse bed by
movement and stage. Tempo is already expressed twice without music, as the pressure hint and
the action/chat mode switch. A bed under conversation is a change to the game's audio
philosophy, not a wiring job.]** 17. ~~Mission 07 (Sanda)
restore.~~ **[DECLINED 2026-08-26 - Paul: "keep sanda mission hidden, i dont need it". She
stays cut. The queue entry in `OmniscientRig` stays commented out; her mission file, contact
record, scene and signal entry stay where they are, unreferenced but intact.]**
18. M4SS stage 3 (the verbs exist; the sim is ready). 19. ~~Settings panel: text
speed, shake toggle, volume (exists), colourblind note.~~ **[DONE 2026-08-26 - the panel
already carried text size, text speed, display filter, screen shake, flash intensity, sound
captions and volume; only the colourblind note was outstanding, and it is now three specific
claims rather than a blanket one. See SystemPanel.buildSettings.]**

### Scope traps — refuse these before Sept 11

New missions - and restoring Sanda counts as one, decided 2026-08-26. New M4SS
mechanics. Rebuilding any art that already passed the audit.
Multiplayer/photo modes/anything with a server. A dialogue rewrite pass ("better" is the
enemy of "recorded"). Porting the HUD to engine UI-kit (CSS is fine; coherence is the goal,
not the toolkit).

---

*The one-sentence review: the writing and the systems are jam-winning already; the game
around them forgets the player exists — it doesn't save them, doesn't end for them, and
half of it doesn't make a sound at them. Fix the frame, not the painting.*
