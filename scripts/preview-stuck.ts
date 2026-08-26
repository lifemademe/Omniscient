/**
 * Walks Mission 01 the way a player actually does, and proves there is always a way on.
 *
 * Written after a playtest stalled: "check the socket" was understood, and then nothing
 * was. The failure was not the parser - it was that the game never showed what kind of
 * thing to say, and a beat that ended with a direct question did not accept "yes".
 *
 * So this does not test the happy path. It replays the stuck session, then walks every
 * beat asserting that following the on-screen suggestions from the opening line reaches an
 * outcome - which is the actual promise the suggestion chips make.
 */

import { readFileSync } from 'node:fs';

import { MIRELA } from '../src/omniscient/content/contacts.js';
import { resolveIntent } from '../src/omniscient/mission/intent.js';
import { MISSION_01 } from '../src/omniscient/content/mission-01-transmitter.js';
import { MISSION_02 } from '../src/omniscient/content/mission-02-beacon.js';
import { MISSION_03 } from '../src/omniscient/content/mission-03-tunnel.js';
import { MISSION_04 } from '../src/omniscient/content/mission-04-relations.js';
import { MISSION_05 } from '../src/omniscient/content/mission-05-cellar.js';
import { MISSION_06 } from '../src/omniscient/content/mission-06-lock.js';
import { MISSION_07 } from '../src/omniscient/content/mission-07-torch.js';
import { MISSION_08 } from '../src/omniscient/content/mission-08-district.js';
import { MISSION_09 } from '../src/omniscient/content/mission-09-specimen.js';
import { bestSets, drivable } from '../src/omniscient/mission/breadcrumbs.js';
import { narrow } from '../src/omniscient/mission/traces.js';
import { KnowledgeStore } from '../src/omniscient/knowledge/KnowledgeStore.js';
import { followerAt, replayBeam } from '../src/omniscient/mission/beam.js';
import { flows, wetted } from '../src/omniscient/mission/pipes.js';

import type { DeviceSubmission } from '../src/omniscient/mission/device.js';
import type { Device } from '../src/omniscient/mission/types.js';
import type { PipeGrid } from '../src/omniscient/mission/pipes.js';
import { GlobeView, SignalState } from '../src/omniscient/crt/GlobeView.js';
import { createSignals, M4SS_SIGNAL } from '../src/omniscient/content/signals.js';
import { COASTLINES } from '../src/omniscient/crt/coastlines.js';
import { DISTRICT_PURSUIT } from '../src/omniscient/content/district-07.js';
import { auditPursuit } from '../src/omniscient/mission/pursuit.js';
import { DISTRICT_TRAIL } from '../src/omniscient/content/district-07.js';
import { gradeDevice } from '../src/omniscient/mission/device.js';
import { MissionRuntime } from '../src/omniscient/mission/MissionRuntime.js';
import * as SIGNAL_IDS from '../src/omniscient/content/signals.js';

const SEED = 0x0c151e;

/**
 * The authored answer to any device, for the chip-walk.
 *
 * This is the RIGHT level of cheating for that test: the question it asks is whether the
 * beat graph reaches an ending, not whether a script can solve a puzzle meant for a
 * person. The pipe solver brute-forces rotations because the grid is small and because a
 * stored answer would not prove the grader accepts every arrangement that works.
 */
function solveDevice(device: Device): DeviceSubmission {
  if (device.kind === 'relations') {
    return {
      kind: 'relations',
      links: Object.fromEntries(device.people.map((person) => [person.id, person.answer])),
    };
  }

  if (device.kind === 'lock') {
    // The authored binding order. Same level of cheating as the relation board's answers:
    // the question is whether the graph reaches an ending, not whether a script can pick
    // a lock meant for a person.
    return {
      kind: 'lock',
      order: [...device.lock.pins]
        .sort((a, b) => a.order - b.order)
        .map((pin) => pin.id),
    };
  }

  if (device.kind === 'beam') {
    /**
     * A chase the walker can actually win, by LEADING.
     *
     * Not the authored answer - there isn't one - so this calls the follower's position a
     * little into the future at a steady cadence, which is the strategy the beat is built
     * to teach. If this ever stops solving it, the beat has become untuneable rather than
     * merely hard, and that is worth a failing check.
     */
    const calls: Array<{ at: number; to: number }> = [];
    // 0.35s of lead on a 0.4s cadence. The old 0.55 stopped working when the hold became
    // continuous and the follower quicker - overshooting is now as bad as trailing,
    // because the light has to stay ON him rather than merely cross him.
    for (let t = 0; t < device.beam.patience; t += 0.4) {
      calls.push({ at: t, to: followerAt(device.beam, t + 0.35) });
    }
    return { kind: 'beam', calls };
  }

  /**
   * Narrowed explicitly rather than by elimination.
   *
   * This used to fall through to the pipe grid on the grounds that nothing else was left,
   * which held until mission 08 added a fifth device kind and the compiler started seeing
   * `PipeBoard | TraceBoard` here. Falling through is the bug that a new device would
   * otherwise inherit silently: a solver that thinks everything it has not recognised is a
   * pipe board. The trace board is identified by evidence, which this script cannot solve
   * for the player by design - it is a deduction, and scripts/audit-traces.ts proves it
   * separately.
   */
  if (device.kind === 'trail') {
    // The maximal coherent set, found the same way the grader finds it.
    return { kind: 'trail', picks: bestSets(device.trail)[0] ?? [] };
  }

  if (device.kind === 'pursuit') {
    // Every hop answered correctly. The question this walk asks is whether the graph
    // reaches an ending, not whether a script can predict a car.
    return { kind: 'pursuit', picks: device.hops.map((hop) => hop.answer) };
  }

  if (device.kind === 'traces') {
    /**
     * Answered from the evidence, not from a stored id.
     *
     * The same reasoning as the grader: ask `narrow` who fits what the police said and
     * submit that. If the fleet and the evidence ever stopped agreeing, this walk would
     * submit nothing and the mission would read as a dead end here - which is the failure
     * mode worth catching, and one that comparing against a remembered id would hide.
     */
    const found = narrow(device.fleet, device.evidence)[0];
    return { kind: 'traces', traceId: found?.id ?? 'none' };
  }

  /*
   * The bag: the one item the mission says works.
   *
   * A walk-through has to be able to solve it, and unlike every other device here
   * there is nothing to reason out from the view - the whole puzzle is knowing what
   * the parts do, which is knowledge this script does not have and the mission does.
   */
  if (device.kind === 'kit') {
    return { kind: 'kit', itemId: device.answer };
  }

  /*
   * The grounds unit is not solvable from here either, and for a more basic reason than
   * the bag: its answer is not a value, it is several thousand blades of grass in a scene
   * this script never builds. A solved submission is the honest stand-in - the question
   * this script exists to ask is whether a request can get STUCK, and driving the mower
   * cannot fail, only take a while.
   */
  if (device.kind === 'unit') {
    return { kind: 'unit', cleared: 1 };
  }

  /**
   * Exhaustive, which is what the note above already claimed and what this was not.
   *
   * It used to be a greedy sweep - turn each piece to whichever rotation wets the most of
   * the run, repeat. That is a hill climb, and a hill climb sits down in the first local
   * optimum it finds. It happened to solve the old grid and it does not solve the current
   * one, so redesigning the cellar's run turned three beat-graph checks red without a
   * single thing being wrong with the beat graph.
   *
   * A harness that fails when the CONTENT changes is worse than no harness: it teaches you
   * to edit the test. The question here is only ever "can this request reach an ending",
   * so it should answer that for any grid a person could be handed, not for grids that
   * happen to suit a heuristic.
   *
   * Seven movable pieces is 16,384 arrangements and it runs in milliseconds. The greedy
   * sweep stays as a fallback for a grid too big to enumerate - there is none today, and
   * silently taking twenty minutes would be a worse failure than an imperfect answer.
   */
  const cells = device.grid.cells;
  const turnable = cells.map((c, i) => (c.fixed ? -1 : i)).filter((i) => i >= 0);
  const rotations = cells.map(() => 0);

  const arrangements = 4 ** turnable.length;
  if (arrangements <= 1_000_000) {
    for (let n = 0; n < arrangements; n++) {
      let v = n;
      for (const i of turnable) {
        rotations[i] = v & 3;
        v >>= 2;
      }
      if (flows(device.grid, rotations)) return { kind: 'pipes', rotations };
    }
    // Nothing flows. Returning the last arrangement lets the caller report a stuck beat,
    // which is exactly the finding this script exists to surface.
    return { kind: 'pipes', rotations };
  }

  for (let pass = 0; pass < 6; pass++) {
    if (flows(device.grid, rotations)) break;
    for (const i of turnable) {
      let best = rotations[i];
      let bestScore = -1;
      for (let t = 0; t < 4; t++) {
        rotations[i] = t;
        const score = (flows(device.grid, rotations) ? 10 : 0) + wetted(device.grid, rotations);
        if (score > bestScore) {
          bestScore = score;
          best = t;
        }
      }
      rotations[i] = best;
    }
  }
  return { kind: 'pipes', rotations };
}
/**
 * What a pipe grid has to be, checked rather than trusted.
 *
 * Three of these were found by a player looking at the board, one after another: it did not
 * fill its own rectangle, the middle piece branched, and one arrangement of it was solvable
 * by nudging two pieces. None of them is a crash, none shows up in a type, and each one had
 * to be noticed by eye before anybody knew.
 *
 * The last one is the reason this is worth automating. Authored turns are four numbers a
 * designer types, and getting them wrong does not break the puzzle - it makes it trivial,
 * silently, in a way that only shows up if somebody counts.
 */
function checkPipeGrid(label: string, grid: PipeGrid): void {
  check(
    `${label}: the board is full - ${grid.cells.length} cells for ${grid.columns}x${grid.rows}`,
    grid.cells.length === grid.columns * grid.rows
  );
  const blanks = grid.cells.filter((c) => c.shape === 'blank').length;
  check(`${label}: no blank slots - a ragged board reads as a broken one`, blanks === 0);
  const branching = grid.cells.filter((c) => c.shape === 'tee' || c.shape === 'cross').length;
  check(
    `${label}: no branching pieces - a run is a line, not a tree`,
    branching === 0,
    branching ? `${branching} tee/cross` : undefined
  );

  const free = grid.cells.map((c, i) => (c.fixed ? -1 : i)).filter((i) => i >= 0);
  const rot = new Array(grid.cells.length).fill(0);
  let solved = 0;
  let fewest = 99;
  for (let n = 0; n < 4 ** free.length; n++) {
    let v = n;
    for (const i of free) {
      rot[i] = v & 3;
      v >>= 2;
    }
    if (!flows(grid, rot)) continue;
    solved += 1;
    const turns = free.filter((i) => rot[i] !== 0).length;
    if (turns < fewest) fewest = turns;
  }
  const zero = new Array(grid.cells.length).fill(0);
  check(`${label}: it is solvable`, solved > 0, `${solved} of ${4 ** free.length}`);
  check(`${label}: it is not already solved`, !flows(grid, zero));
  check(
    `${label}: it takes real work - at least 3 pieces must move`,
    fewest >= 3,
    `fewest is ${fewest} of ${free.length}`
  );
}

/**
 * The globe has to keep turning while somebody is waiting.
 *
 * Two fixes to GlobeView.advance have traded the revolution away to keep a caller
 * reachable: the first held the caller at front-centre and stopped dead, the second swept
 * inside a 52-degree window. Both shipped, both were reported as the globe not rotating,
 * and neither was visible in a type or a screenshot of a single frame - you have to watch
 * it for half a minute to see that it never comes round.
 *
 * So: run it with a signal waiting and require a full turn, plus a decent stretch of that
 * turn with the caller where the player can actually click them.
 */
function checkGlobeTurns(): void {
  const surface = null as unknown as ConstructorParameters<typeof GlobeView>[0];
  const globe = new GlobeView(surface, [
    {
      id: 'probe',
      latitude: 44.2,
      longitude: 26,
      label: '',
      name: 'probe',
      state: SignalState.Waiting,
    },
  ]);

  const step = 1 / 60;
  let turned = 0;
  let previous = globe.heading;
  let dwell = 0;
  let seconds = 0;
  while (turned < Math.PI * 2 && seconds < 300) {
    globe.advance(step);
    seconds += step;
    let delta = globe.heading - previous;
    if (delta < -Math.PI) delta += Math.PI * 2;
    turned += delta;
    previous = globe.heading;
    // Front-centre is where the longitude plus the rotation sums to zero.
    const gap = Math.atan2(
      Math.sin(-26 * (Math.PI / 180) - globe.heading),
      Math.cos(-26 * (Math.PI / 180) - globe.heading)
    );
    if (Math.abs(gap) <= (35 * Math.PI) / 180) dwell += step;
  }

  check(
    'the globe completes a revolution with a signal waiting',
    turned >= Math.PI * 2,
    `${seconds.toFixed(1)}s`
  );
  check(
    'and the caller is near the front long enough to click',
    dwell >= 8,
    `${dwell.toFixed(1)}s of it within 35 degrees`
  );
}

/**
 * Every mission the campaign offers must have somewhere on the globe to arrive.
 *
 * Lucian shipped without one. `LUCIAN_SIGNAL` was exported and never used, so the eighth
 * request was queued, offered and marked openable, and then vanished inside
 * `setSignalState`, which looked for a signal with his id, found none, and returned. The
 * globe is the only place a request can be clicked, so the last mission of the game could
 * not be started - and nothing failed, nothing warned, and the "requests waiting" count was
 * still right.
 *
 * It is the cheapest possible check and it would have caught it the day it was written.
 */
/*
 * The campaign, in order. Built inline in OmniscientRig rather than exported, so this
 * mirrors it - and the reverse check below is what catches the mirror going stale.
 */
const CAMPAIGN = [MISSION_01, MISSION_02, MISSION_03, MISSION_04, MISSION_05, MISSION_06, MISSION_07, MISSION_08, MISSION_09];

function checkEveryMissionHasASignal(): void {
  const signals = createSignals();
  for (const mission of CAMPAIGN) {
    const signal = signals.find((s) => s.id === mission.contactId);
    check(
      `${mission.id}: has a globe signal for "${mission.contactId}"`,
      signal !== undefined,
      signal ? `${signal.name || '(unnamed)'}` : 'NOT ON THE GLOBE - unreachable'
    );
  }
  /*
   * And the reverse, which is how a signal quietly becomes scenery.
   *
   * ## Two ways a pin can be worth pressing
   *
   * Most of them are a request: a mission in the campaign whose contactId matches, opened
   * through the queue. Two are not. The anomaly opens a trace view and the warehouse drops
   * the player into Night Shift - both intercepted by name at the top of
   * OmniscientRig.openSignal, before the queue is ever consulted.
   *
   * This check knew about the first kind only, so it failed the warehouse for the crime of
   * being a bonus level. It had also carried a hardcoded skip for the anomaly, which is the
   * shape of the same mistake: a list of exemptions maintained by hand is a list that is
   * wrong the first time somebody adds a pin, in whichever direction hurts.
   *
   * So it READS the interceptions rather than being told them. Anything `openSignal` matches
   * on counts as openable; anything else needs a mission. Add a pin with neither and this
   * fails, which is the whole point - §169's anomaly is on the globe to be unanswerable, not
   * to be a precedent for scenery.
   */
  const rigSource = readFileSync('src/omniscient/OmniscientRig.ts', 'utf8');
  const opener = rigSource.slice(rigSource.indexOf('private openSignal('));
  const intercepted = new Set<string>();
  // Only the block above the queue lookup. Below it, `signalId` appears in comparisons
  // that are not interceptions.
  const body = opener.slice(0, opener.indexOf('const index = this.queue'));
  for (const m of body.matchAll(/signalId === ([A-Z_][A-Z0-9_]*)/g)) {
    const value = (SIGNAL_IDS as Record<string, unknown>)[m[1]];
    if (typeof value === 'string') intercepted.add(value);
  }
  check(
    'the openSignal interceptions were readable',
    intercepted.size >= 2,
    `${intercepted.size} found: ${[...intercepted].join(', ') || 'none'}`
  );
  for (const signal of signals) {
    check(
      `signal "${signal.id}" can be opened`,
      CAMPAIGN.some((m) => m.contactId === signal.id) || intercepted.has(signal.id),
      intercepted.has(signal.id) ? 'intercepted by openSignal' : ''
    );
  }

  /*
   * The station is on the globe, and it is at sea.
   *
   * Both halves matter. Every other pin is checked to be ashore - a marker in the middle of
   * an ocean is normally a bug - so an ocean pin has to be asserted rather than tolerated, or
   * the next person to tidy the coordinates will move it onto land as a fix.
   */
  const station = signals.find((s) => s.id === M4SS_SIGNAL);
  check('M4SS: the station is on the globe', station !== undefined);
  check(
    'M4SS: the station is at sea - it is the only signal that should be',
    station !== undefined && !onLand(station.longitude, station.latitude),
    station ? `${Math.abs(station.longitude)}W ${Math.abs(station.latitude)}S` : 'missing'
  );
  const others = signals.filter((s) => s.id !== M4SS_SIGNAL && !s.offworld);
  const nearest = station
    ? Math.min(
        ...others.map((s) =>
          Math.hypot(
            ((s.longitude - station.longitude + 540) % 360) - 180,
            s.latitude - station.latitude
          )
        )
      )
    : 0;
  check(
    'M4SS: the station is a long way from anybody',
    nearest > 30,
    `${nearest.toFixed(1)} deg to the nearest signal`
  );
}

/** Point-in-polygon against the globe's own coastline data - the map the player sees. */
function onLand(longitude: number, latitude: number): boolean {
  for (const ring of COASTLINES) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (
        yi > latitude !== yj > latitude &&
        longitude < ((xj - xi) * (latitude - yi)) / (yj - yi) + xi
      ) {
        inside = !inside;
      }
    }
    if (inside) return true;
  }
  return false;
}

/**
 * The chase the game actually ships.
 *
 * audit-pursuit.ts plans fresh pursuits from test seeds and audits those, which proves the
 * planner. It does not touch DISTRICT_PURSUIT, the one constant the mission hands to the
 * player - and that file's own header warns about exactly this hazard, two copies of a
 * thing drifting apart while the check watches the wrong one.
 *
 * The rule the console now states - not backwards, not further than the clock allows, not
 * off his street - is only honest if every hop really does have exactly one camera passing
 * all three. That is what singleAnswer counts.
 */
function checkShippedChase(): void {
  const audit = auditPursuit(DISTRICT_PURSUIT);
  check('the shipped chase has hops to play', audit.hops > 0, `${audit.hops}`);
  check(
    'every hop has exactly one camera that survives all three tests',
    audit.singleAnswer === audit.hops,
    `${audit.singleAnswer} of ${audit.hops}`
  );
  check(
    'every decoy fails the way the contact says it does',
    audit.honestDecoys === audit.hops,
    `${audit.honestDecoys} of ${audit.hops}`
  );
  check('no hop is a single option', audit.thin === 0, `${audit.thin} thin`);
}

/**
 * The cold trail has one rule, and the board shows it.
 *
 * It used to grade on three - every jump possible, the chain arriving near the bridge, and
 * the chain being the largest such set - and only the first was ever visible. A player could
 * build a route with no impossible jump in it and be refused twice for reasons nothing on
 * screen had mentioned.
 *
 * So the check is now about the reverse property: anything the board draws as possible must
 * BE accepted. If those two ever disagree again, this fails.
 */
function checkTrailMatchesTheBoard(): void {
  const trail = DISTRICT_TRAIL;
  const ordered = [...trail.fragments].sort((a, b) => a.at - b.at);
  const ids = (secs: number[]): string[] =>
    ordered.filter((f) => secs.includes(f.at)).map((f) => f.id);
  const device = {
    kind: 'trail' as const,
    prompt: '',
    trail,
    onSolved: { to: 'x' },
    onWrong: { to: 'y' },
    wrongSay: '',
  };
  const grade = (secs: number[]): boolean =>
    gradeDevice(device, { kind: 'trail', picks: ids(secs) }).solved;

  check('an impossible jump is still refused', !grade([8, 22, 27]));
  check('the full route is accepted', grade([8, 18, 27, 38]));

  /*
   * The two that used to be refused for invisible reasons. Both are drivable, both look
   * fine on the board, and both must now be taken.
   */
  check('a drivable route that stops early is accepted', grade([8, 18, 33]));
  check('a drivable route with gaps in it is accepted', grade([8, 18, 38]));

  // And the general form: every set the board would draw as clean, the grader takes.
  let disagreements = 0;
  for (let mask = 1; mask < 1 << ordered.length; mask++) {
    const picked = ordered.filter((_, k) => mask & (1 << k));
    if (picked.length < 2) continue;
    if (!drivable(trail, picked.map((f) => f.id))) continue;
    if (!gradeDevice(device, { kind: 'trail', picks: picked.map((f) => f.id) }).solved) {
      disagreements += 1;
    }
  }
  check(
    'every drivable claim the board would show as clean is accepted',
    disagreements === 0,
    `${disagreements} refused`
  );
}

let failures = 0;

function check(label: string, ok: boolean, detail?: string): void {
  if (!ok) failures++;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` - ${detail}` : ''}`);
}

console.log('\n=== THE STUCK SESSION ===\n');

const runtime = new MissionRuntime(MISSION_01, new KnowledgeStore(SEED));
runtime.open();

const socket = runtime.respond('check the socket');
console.log(`  "check the socket" -> ${runtime.getCurrentBeat().id}`);
check('"check the socket" finds the corrosion', runtime.getCurrentBeat().id === 'connector-found');

// This is where the playtest died. She asks "Do you want me to get at it?" and the
// player, reasonably, answers the question.
const yes = runtime.respond('yes');
check(
  '"yes" to a direct question is understood',
  yes.confirming !== undefined || runtime.getCurrentBeat().id !== 'connector-found',
  yes.confirming ? `proposes: ${yes.confirming.question}` : runtime.getCurrentBeat().id
);
check(
  'and it proposes the unsafe reading rather than silently doing it',
  yes.confirming?.intentId === 'CLEAN_LIVE'
);

const declined = runtime.confirm(false);
check('declining leaves the set live and invites another try', declined.clarifying);
check('still on the connector beat', runtime.getCurrentBeat().id === 'connector-found');

console.log(`\n  opening suggestions: ${MISSION_01.beats[0].suggest?.join(' / ')}`);
check('the opening offers a way in', (MISSION_01.beats[0].suggest?.length ?? 0) >= 2);
check('the stuck beat now offers a way on', (socket.say.length ?? 0) > 0);

console.log('\n=== FOLLOWING THE SUGGESTIONS ===\n');

/**
 * A player who reads nothing, thinks about nothing, and taps the chip in the same
 * position every single time must still reach an ending.
 *
 * That is the floor the chips promise, and it is not automatic: a beat whose suggestions
 * point backwards can form a cycle the player taps around forever while the game never
 * points at the answer. Mission 01 had exactly that - unit-overview to history to
 * power-off-early and back - and only walking it in every position exposed it.
 */
for (const mission of [
  MISSION_01,
  MISSION_02,
  MISSION_03,
  MISSION_04,
  MISSION_05,
  MISSION_06,
  MISSION_07,
  MISSION_08,
]) {
  const widest = Math.max(...mission.beats.map((beat) => beat.suggest?.length ?? 0));

  for (let slot = 0; slot < widest; slot++) {
    const walker = new MissionRuntime(mission, new KnowledgeStore(SEED));
    walker.open();

    const path: string[] = [walker.getCurrentBeat().id];
    let guard = 0;

    while (!walker.isFinished && guard++ < 40) {
      /**
       * A device beat does not ask for a sentence, so the chip-walk has to be able to
       * work one, or every mission with a device reads as a dead end here.
       *
       * It submits the authored answers, which is the *right* level of cheating for this
       * test: the question being asked is whether the graph reaches an ending, not
       * whether a script can solve a puzzle meant for a person.
       */
      const device = walker.getCurrentBeat().device;
      if (device) {
        /*
         * A device can ASK before it grades, and this walk has to answer.
         *
         * Tomas's bag questions every part, right or wrong, and decides nothing until the
         * yes - so a submission on its own leaves the beat exactly where it was. Without
         * the confirm this loop submitted the correct isolator forty times in a row and
         * reported the request as unfinishable, which is what it had been doing since the
         * bag stopped grading on submit.
         *
         * The sentence branch below has always handled `confirming`. This one had not,
         * which is the whole bug: the two paths through the same runtime were not being
         * driven the same way.
         */
        const step = walker.submitDevice(solveDevice(device));
        if (step.confirming) walker.confirm(true);
        path.push(walker.getCurrentBeat().id);
        continue;
      }

      const suggestions = walker.getCurrentBeat().suggest ?? [];
      if (suggestions.length === 0) break;

      // Short lists clamp, so slot 2 on a one-chip beat still takes that chip.
      const text = suggestions[Math.min(slot, suggestions.length - 1)];
      const step = walker.respond(text);
      // Chips can legitimately propose an unsafe reading; accept it, so the dangerous
      // branch is exercised rather than quietly avoided by the test.
      if (step.confirming) walker.confirm(true);
      path.push(walker.getCurrentBeat().id);
    }

    const label = `${mission.id}: always chip ${slot + 1}`;
    console.log(`  ${label}: ${path.join(' -> ')}`);
    check(`${label} reaches an ending`, walker.isFinished, `${path.length} beats`);
  }
}

console.log('\n=== TYPOS ARE NOT PUNISHED ===\n');

/**
 * Not understanding the player must never hurt the contact.
 *
 * The arc beat looped back to itself firing the spark cue on any unrecognised message, so
 * every typo put another flash across Mirela's hand - forever, with no consequence and no
 * way out. It read as failing the mission without ever failing it. §159 says a rejected
 * message produces a clarification, not a punishment, and a physical cue on that path
 * breaks it just as badly as a red X would.
 */
[
  MISSION_01,
  MISSION_02,
  MISSION_03,
  MISSION_04,
  MISSION_05,
  MISSION_06,
  MISSION_07,
].forEach((mission) => {
  const harmful = mission.beats
    .filter((beat) => {
      const path = beat.onUnrecognised;
      if (!path) return false;
      return /spark|arc|burn|shock/i.test(`${path.environment ?? ''} ${path.vfx ?? ''}`);
    })
    .map((beat) => beat.id);
  check(
    `${mission.id}: a message the parser missed never hurts anybody`,
    harmful.length === 0,
    harmful.length ? harmful.join(', ') : undefined
  );
});

// And the beat you land on after an unrecognised message must still offer a way out.
[
  MISSION_01,
  MISSION_02,
  MISSION_03,
  MISSION_04,
  MISSION_05,
  MISSION_06,
  MISSION_07,
].forEach((mission) => {
  const byId = new Map(mission.beats.map((beat) => [beat.id, beat]));
  const dead = mission.beats
    .filter((beat) => beat.onUnrecognised)
    .map((beat) => byId.get(beat.onUnrecognised?.to ?? ''))
    .filter((target) => target && !target.outcome && !target.failure)
    .filter((target) => (target?.suggest?.length ?? 0) === 0)
    .map((target) => target?.id ?? '?');
  check(
    `${mission.id}: every clarification beat still shows a way forward`,
    dead.length === 0,
    dead.length ? dead.join(', ') : undefined
  );
});

console.log('\n=== LOSING MIRELA ===\n');

/**
 * The whole shape of a loss, in the order the player experiences it.
 *
 * Mission 01 had no reachable failure at all - the arc looped back on itself forever, so
 * a player who set off the spark could neither recover nor lose, and the note they were
 * being invited to write was unreachable. This walks the arc through to the loss and out
 * the other side.
 */
{
  const store = new KnowledgeStore(SEED);
  const losing = new MissionRuntime(MISSION_01, store);
  losing.open();
  losing.respond('look at the connectors on the back');

  const first = losing.respond('clean the connector now');
  check('Cleaning a live connector proposes the risk first', first.confirming !== undefined);
  check(
    'The proposal names the danger, so saying yes is an informed choice',
    /power is still on|live/i.test(first.confirming?.question ?? ''),
    first.confirming?.question
  );

  // Declining is the recovery. It is the ONLY recovery, which is what makes the question
  // worth asking - see the arc beat in mission-01.
  const backedOut = losing.confirm(false);
  check('Declining leaves her unhurt and the request alive', !losing.isFinished);
  check('...and invites another try', backedOut.clarifying);

  const lost = losing.respond('clean the connector now').confirming
    ? losing.confirm(true)
    : losing.respond('clean the connector now');
  check('Overriding the warning ends the request', losing.isFinished);
  check('The spark fires an effect', losing.getCurrentBeat().id === 'arc');
  check('The loss is reported', lost.failure !== undefined, lost.failure?.summary);
  check(
    'The loss says what would have worked',
    (lost.failure?.lesson?.length ?? 0) > 0,
    lost.failure?.lesson
  );
  /*
   * Mirela's is the one failure in the game that does NOT start a countdown, and this
   * check used to assert the opposite because it was written before that was decided.
   *
   * The reasoning is in mission-01 next to the zero: this is the first request, and a
   * player who fails it is handed a globe with nothing answerable on it and asked to
   * wait. The lesson is in the arc, the line she says afterwards, and the note - all of
   * which have already happened by the time a countdown would start. So the mechanic is
   * TAUGHT here and charged later, which is why the second half of this checks a request
   * that does bite.
   */
  check(
    'The first failure in the game does not lock the player out',
    lost.failure?.cooldownSeconds === 0,
    `${lost.failure?.cooldownSeconds}s`
  );

  /*
   * And the other half of that bargain, across the whole game.
   *
   * The exemption is for the FIRST request and nothing else. Checked over the definitions
   * rather than by playing each one to its loss, because the claim being made is about the
   * authored numbers - every way to fail a request after Mirela's costs the player a wait.
   * A second zero appearing anywhere would quietly delete the mechanic her failure exists
   * to teach, and it would do it silently.
   */
  const uncharged = [
    MISSION_02, MISSION_03, MISSION_04, MISSION_05, MISSION_06, MISSION_07, MISSION_08,
  ].flatMap((mission) =>
    mission.beats
      .filter((beat) => beat.failure && (beat.failure.cooldownSeconds ?? 0) <= 0)
      .map((beat) => `${mission.id}/${beat.id}`)
  );
  check(
    'Every later failure does charge for it',
    uncharged.length === 0,
    uncharged.length ? uncharged.join(', ') : 'all carry a countdown'
  );

  // And the note the player writes has to survive to the retry.
  store.writeNote(MISSION_01.id, MIRELA.id, 'turn the power off before she touches it');
  const records = store.getRelevantRecords(MISSION_01.id, MIRELA.id, []);
  check(
    'The note is kept, marked as the player\'s own',
    records.some((r) => r.playerWritten && r.label.includes('power off'))
  );
}


console.log('\n=== THE RELATION BOARD ===\n');

/**
 * The board is the first thing in the game that is not a sentence, which means it is the
 * first thing whose rules the player can only learn by trying. That makes its behaviour
 * on a WRONG answer more important than its behaviour on a right one.
 */
{
  const device = MISSION_04.beats.find((beat) => beat.device)?.device;
  const board = device?.kind === 'relations' ? device : undefined;
  check('Mission 04 has a relation board', board !== undefined);

  if (board) {
    check(
      'Every person belongs in a slot that actually exists',
      board.people.every((person) => board.slots.some((slot) => slot.id === person.answer)),
      board.people
        .filter((person) => !board.slots.some((slot) => slot.id === person.answer))
        .map((person) => `${person.name} -> ${person.answer}`)
        .join(', ')
    );

    /**
     * More slots than people, on purpose.
     *
     * With exactly one slot per person the final placement is free - the player never has
     * to make the last and most interesting inference, they just put the leftover name in
     * the leftover box. Padding the slot list is what keeps the board a reasoning problem
     * rather than a sorting problem.
     */
    check(
      'There are more slots than people, so it cannot be solved by elimination',
      board.slots.length > board.people.length,
      `${board.slots.length} slots, ${board.people.length} people`
    );

    check(
      'Every person carries the line the contact said about them',
      board.people.every((person) => person.note.trim().length > 0)
    );

    // A wrong answer must not advance, must not fail the request, and must say something.
    const wrong = new MissionRuntime(MISSION_04, new KnowledgeStore(SEED));
    wrong.open();
    wrong.respond('tell me the names');
    const boardBeatId = wrong.getCurrentBeat().id;

    const scrambled = Object.fromEntries(
      board.people.map((person, index) => [
        person.id,
        board.people[(index + 1) % board.people.length].answer,
      ])
    );
    const missed = wrong.submitDevice({ kind: 'relations', links: scrambled });

    check('A wrong board does not end the request', !wrong.isFinished);
    check('A wrong board leaves the board up', wrong.getCurrentBeat().id === boardBeatId);
    check('A wrong board is not a failure (§159)', missed.failure === undefined);
    check('The contact says something rather than buzzing', missed.say.length > 0);
    check(
      'It reports how many were right, and nothing about which',
      missed.deviceNote !== undefined && missed.deviceNote.includes('of'),
      missed.deviceNote
    );

    // A partly filled board is a legitimate guess, not an error.
    const partial = wrong.submitDevice({ kind: 'relations', links: { [board.people[0].id]: board.people[0].answer } });
    check('A half-filled board is graded rather than rejected', partial.deviceNote?.startsWith('1 of') === true);
    check('...and still does not end the request', !wrong.isFinished);

    // And the right answer resolves it.
    const right = new MissionRuntime(MISSION_04, new KnowledgeStore(SEED));
    right.open();
    right.respond('tell me the names');
    const solved = right.submitDevice({
      kind: 'relations',
      links: Object.fromEntries(board.people.map((person) => [person.id, person.answer])),
    });
    check('The right board resolves the request', right.isFinished);
    check('...with an outcome', solved.outcome !== undefined, solved.outcome?.kind);
    check(
      '...and grafts the flood onto what the flood could not take (§107)',
      (solved.outcome?.connects?.length ?? 0) > 0,
      solved.outcome?.connects?.[0]?.label
    );
  }
}

/**
 * The board must be reachable by somebody who only ever taps the first chip.
 *
 * The chip-walk above proves the mission ends; this proves the mission's whole point is
 * on the path rather than down a branch only a careful player finds.
 */
{
  const walker = new MissionRuntime(MISSION_04, new KnowledgeStore(SEED));
  walker.open();
  let reached = false;
  let guard = 0;
  while (!walker.isFinished && guard++ < 12) {
    if (walker.getCurrentBeat().device) {
      reached = true;
      break;
    }
    const suggestions = walker.getCurrentBeat().suggest ?? [];
    if (!suggestions.length) break;
    walker.respond(suggestions[0]);
  }
  check('Tapping the first chip reaches the board', reached, `${guard} steps`);
}


console.log('\n=== THE PIPE GRID ===\n');

/**
 * The pipe device, graded on its own terms.
 *
 * Tested before any mission uses it, because the whole point of the device union is that
 * a new device is logic plus a renderer - and logic that is proven before content exists
 * cannot be quietly bent to fit the content later.
 */
{
  // A straight run: source, two straights, drain. Every piece needs a quarter turn.
  const grid = {
    columns: 4,
    rows: 1,
    cells: [
      { shape: 'straight' as const, turn: 1, fixed: true },
      { shape: 'straight' as const },
      { shape: 'straight' as const },
      { shape: 'straight' as const, turn: 1, fixed: true },
    ],
    source: 0,
    drain: 3,
  };

  check('An unturned run does not flow', !flows(grid, [0, 0, 0, 0]));
  check('Turning the loose pieces makes it flow', flows(grid, [0, 1, 1, 0]));
  check(
    'A partial run reports how far the water got',
    wetted(grid, [0, 1, 0, 0]) > 0 && wetted(grid, [0, 1, 0, 0]) < 1,
    wetted(grid, [0, 1, 0, 0]).toFixed(2)
  );

  /**
   * The property that matters most: grading is by FLOW, not by matching an answer.
   *
   * A straight piece is symmetric, so turning it twice changes nothing physical. A grader
   * that compared against a stored solution would reject this and tell a correct player
   * they were wrong.
   */
  check(
    'Any arrangement that carries water is accepted, not just the authored one',
    flows(grid, [0, 3, 3, 0]) && flows(grid, [2, 1, 3, 2])
  );

  // A bend that has to be turned to catch a run coming from the side.
  const corner = {
    columns: 2,
    rows: 2,
    cells: [
      { shape: 'straight' as const, turn: 1, fixed: true },
      { shape: 'bend' as const },
      { shape: 'blank' as const },
      { shape: 'straight' as const, fixed: true },
    ],
    source: 0,
    drain: 3,
  };
  check('A corner needs the bend facing the right way', !flows(corner, [0, 0, 0, 0]));
  // Turn 2, not 3: the bend's base openings are north and east, so two quarters puts it
  // south-west - which is what catches the run coming in from the left and sends it down.
  // The first version of this check asserted 3 and the grader was right to reject it.
  check('...and flows once it does', flows(corner, [0, 2, 0, 0]));

  check(
    'A run with a gap in it never flows however it is turned',
    [0, 1, 2, 3].every((a) => [0, 1, 2, 3].every((b) => !flows(
      { ...grid, cells: [grid.cells[0], { shape: 'blank' as const }, grid.cells[2], grid.cells[3]] },
      [0, a, b, 0]
    )))
  );
}

/**
 * THE CHASE, AND THE ONE CASE EVERY OTHER TEST MISSED
 *
 * Watching mission 07 run for the first time, the request solved itself while no calls
 * were made at all. The follower's authored path wandered back and forth through a beam
 * that had never moved, and the light accumulated past the threshold about four seconds in.
 *
 * No harness caught it, and the reason is worth stating: every test of a device makes a
 * SUBMISSION. The walker leads the follower; the device tests solve or deliberately fail.
 * None of them tried the one input a confused player produces first, which is nothing at
 * all. A real-time beat has a null strategy, and the null strategy has to lose.
 */
{
  console.log('\n=== THE CHASE ===');

  const chase = MISSION_07.beats.find((beat) => beat.device?.kind === 'beam')?.device;
  if (!chase || chase.kind !== 'beam') {
    check('mission 07 still has a beam device', false);
  } else {
    check('doing nothing loses the chase', !replayBeam(chase.beam, []).blinded);

    /**
     * And parking it anywhere loses too.
     *
     * Doing nothing is one aim - the beam's own start. A player who clicks once and then
     * watches is the same failure at a different offset, and the danger is the TURNING
     * POINTS: a beam parked just inside an extreme catches his whole excursion out and back.
     */
    let parked: number | null = null;
    for (let aim = -1; aim <= 1.0001; aim += 0.05) {
      if (replayBeam(chase.beam, [{ at: 0, to: aim }]).blinded) parked = aim;
    }
    check('parking the beam loses from every angle', parked === null);

    // And it must still be winnable, or the beat is impossible rather than hard.
    const led: Array<{ at: number; to: number }> = [];
    for (let t = 0; t < chase.beam.patience; t += 0.4) {
      led.push({ at: t, to: followerAt(chase.beam, t + 0.35) });
    }
    check('leading the follower wins it', replayBeam(chase.beam, led).blinded);
  }
}

/*
 * Every pipe grid in the campaign. There is one today; the loop is so a second cannot
 * ship without being held to the same shape as the first.
 */
console.log('');
console.log('=== THE GLOBE ===');
checkEveryMissionHasASignal();
checkGlobeTurns();
console.log('');
console.log('=== THE COLD TRAIL ===');
checkTrailMatchesTheBoard();
console.log('');
console.log('=== THE CHASE THAT SHIPS ===');
checkShippedChase();
console.log('');
console.log('=== THE PIPE RUNS ===');
console.log('');
for (const mission of [MISSION_01, MISSION_02, MISSION_03, MISSION_04, MISSION_05, MISSION_06, MISSION_07, MISSION_08]) {
  for (const beat of mission.beats) {
    if (beat.device?.kind !== 'pipes') continue;
    checkPipeGrid(`${mission.id}/${beat.id}`, beat.device.grid);
  }
}

/*
 * Every chip the game offers must be understood by the beat that offers it.
 *
 * Mission 09 shipped with the `watching` beat suggesting "it is deliberate" and "it is
 * only physics" while no intent in the mission could resolve either phrase - the player
 * clicked the game's own suggestion and was told "Sorry - say that again?", twice, which
 * is the exact §159 violation this file exists to prevent, and nothing here checked it,
 * because every existing walk follows suggestions FROM THE OPENING and that beat is only
 * reached through a cue. So: every suggest phrase, on every beat, of every mission, must
 * resolve to an intent that the SAME beat routes or affirms. No walking required - the
 * promise a chip makes is local to the beat it is drawn on.
 */
console.log('\n--- every suggestion is understood by its own beat ---\n');
/*
 * Resolved against the intents the BEAT allows, exactly as MissionRuntime.respond does -
 * the first draft of this guard resolved against the whole mission table and flagged two
 * chips that work perfectly in play, because the runtime's per-beat filter is load-bearing
 * (it is how mission 01 makes "clean the connector now" read as the unsafe live-clean at
 * the beat where the power is still on). A guard that tests a different mechanism than
 * the game runs is a guard that cries wolf.
 */
let orphanChips = 0;
for (const mission of CAMPAIGN) {
  for (const beat of mission.beats) {
    const allowed = mission.intents.filter(
      (intent) => intent.id in beat.on || intent.id === beat.affirmIntent
    );
    for (const phrase of beat.suggest ?? []) {
      const reading = resolveIntent(phrase, allowed);
      if (reading.kind !== 'matched') {
        orphanChips += 1;
        check(
          `${mission.id}/${beat.id}: chip "${phrase}" is understood`,
          false,
          reading.kind === 'ambiguous'
            ? `ambiguous between ${reading.candidates.map((c) => c.intentId).join(' / ')}`
            : 'resolves to nothing the beat routes'
        );
      }
    }
  }
}
check('every suggestion chip in the campaign is understood by its beat', orphanChips === 0);

console.log(
  failures === 0 ? '\nALL CHECKS PASSED\n' : `\n${failures} CHECK(S) FAILED\n`
);
process.exit(failures === 0 ? 0 : 1);
