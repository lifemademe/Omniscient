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
import { KnowledgeStore } from '../src/omniscient/knowledge/KnowledgeStore.js';
import { MissionRuntime } from '../src/omniscient/mission/MissionRuntime.js';

const SEED = 0x0c151e;
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
for (const mission of [MISSION_01, MISSION_02, MISSION_03]) {
  const widest = Math.max(...mission.beats.map((beat) => beat.suggest?.length ?? 0));

  for (let slot = 0; slot < widest; slot++) {
    const walker = new MissionRuntime(mission, new KnowledgeStore(SEED));
    walker.open();

    const path: string[] = [walker.getCurrentBeat().id];
    let guard = 0;

    while (!walker.isFinished && guard++ < 40) {
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
[MISSION_01, MISSION_02, MISSION_03].forEach((mission) => {
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
[MISSION_01, MISSION_02, MISSION_03].forEach((mission) => {
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

console.log(
  failures === 0 ? '\nALL CHECKS PASSED\n' : `\n${failures} CHECK(S) FAILED\n`
);
process.exit(failures === 0 ? 0 : 1);
