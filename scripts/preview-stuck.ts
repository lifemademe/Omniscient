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

import { MIRELA } from '../src/omniscient/content/contacts.js';
import { MISSION_01 } from '../src/omniscient/content/mission-01-transmitter.js';
import { MISSION_02 } from '../src/omniscient/content/mission-02-beacon.js';
import { MISSION_03 } from '../src/omniscient/content/mission-03-tunnel.js';
import { MISSION_04 } from '../src/omniscient/content/mission-04-relations.js';
import { KnowledgeStore } from '../src/omniscient/knowledge/KnowledgeStore.js';
import { flows, wetted } from '../src/omniscient/mission/pipes.js';

import type { DeviceSubmission } from '../src/omniscient/mission/device.js';
import type { Device } from '../src/omniscient/mission/types.js';
import { MissionRuntime } from '../src/omniscient/mission/MissionRuntime.js';

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

  const cells = device.grid.cells;
  const turnable = cells.map((c, i) => (c.fixed ? -1 : i)).filter((i) => i >= 0);
  const rotations = cells.map(() => 0);
  // Greedy sweep: turn each free piece to whichever rotation wets the most of the run,
  // repeatedly, until it flows or nothing improves.
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
for (const mission of [MISSION_01, MISSION_02, MISSION_03, MISSION_04]) {
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
        walker.submitDevice(solveDevice(device));
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
[MISSION_01, MISSION_02, MISSION_03, MISSION_04].forEach((mission) => {
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
[MISSION_01, MISSION_02, MISSION_03, MISSION_04].forEach((mission) => {
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
  check(
    'It puts the contact on a countdown',
    (lost.failure?.cooldownSeconds ?? 0) > 0,
    `${lost.failure?.cooldownSeconds}s`
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

console.log(
  failures === 0 ? '\nALL CHECKS PASSED\n' : `\n${failures} CHECK(S) FAILED\n`
);
process.exit(failures === 0 ? 0 : 1);
