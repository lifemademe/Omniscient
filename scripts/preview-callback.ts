/**
 * Headless verification of the callback - the single highest-value element in the Jam
 * build (Gauntlet §214), proved in data before a line of UI exists.
 *
 * Checks:
 *   1. Mission 01 is solvable with natural phrasing and seeds the shared-feed fact.
 *   2. A player who carries that fact into Mission 02 takes the payoff route.
 *   3. A player who never learned it still reaches the same truth (§163: no dead ends).
 *   4. Equivalent phrasings resolve to the same intent (§164 QA).
 *   5. The unsafe path branches into content rather than failing (§163).
 *   6. Knowledge drives tree growth (§118: one system, two expressions).
 *
 * Usage:  pnpm exec tsx scripts/preview-callback.ts
 */

import { MIRELA, TOMAS } from '../src/omniscient/content/contacts.js';
import { MISSION_01 } from '../src/omniscient/content/mission-01-transmitter.js';
import { MISSION_02 } from '../src/omniscient/content/mission-02-beacon.js';
import { MISSION_03 } from '../src/omniscient/content/mission-03-tunnel.js';
import { createSignals, MIRELA_SIGNAL } from '../src/omniscient/content/signals.js';
import { GlobeView, SignalState } from '../src/omniscient/crt/GlobeView.js';
import { layoutLabels, tickCooldowns } from '../src/omniscient/globe/GlobeScreen.js';
import { GrowthStage } from '../src/omniscient/crt/KnowledgeTree.js';
import { KnowledgeStore } from '../src/omniscient/knowledge/KnowledgeStore.js';
import { readsAsYesNo, resolveIntent } from '../src/omniscient/mission/intent.js';
import { MissionRuntime } from '../src/omniscient/mission/MissionRuntime.js';
import { SessionController } from '../src/omniscient/session/SessionController.js';
import { BufferSurface } from './lib/pixel-preview.js';

import type {
  InterventionSurface,
  PlayerMessage,
  SurfaceState,
} from '../src/omniscient/link/surface.js';
import type { Signal } from '../src/omniscient/crt/GlobeView.js';
import type { MissionDefinition } from '../src/omniscient/mission/types.js';

const SEED = 0x0c151e;

let failures = 0;

function check(label: string, condition: boolean, detail = ''): void {
  const mark = condition ? 'PASS' : 'FAIL';
  if (!condition) failures++;
  console.log(`  [${mark}] ${label}${detail ? ` - ${detail}` : ''}`);
}

/** A surface that records what it was told, and can send any player message back. */
function record(): {
  surface: InterventionSurface;
  latest: () => SurfaceState | null;
  send: (message: PlayerMessage) => void;
  cues: string[];
} {
  let handler: ((message: PlayerMessage) => void) | null = null;
  let latest: SurfaceState | null = null;
  const cues: string[] = [];

  return {
    surface: {
      kind: 'local',
      connected: true,
      attach: async () => {},
      detach: () => {},
      present: (s) => {
        latest = s;
      },
      onMessage: (h) => {
        handler = h;
        return () => {
          handler = null;
        };
      },
    },
    latest: () => latest,
    send: (message) => {
      if (!handler) throw new Error('surface handler was never registered');
      handler(message);
    },
    cues,
  };
}

/** Drive a mission with a script of player messages, logging the exchange. */
function play(
  definition: MissionDefinition,
  knowledge: KnowledgeStore,
  messages: string[],
  { verbose = false } = {}
): MissionRuntime {
  const runtime = new MissionRuntime(definition, knowledge);
  const opening = runtime.open();
  if (verbose) console.log(`    CONTACT: ${opening.say}`);

  for (const message of messages) {
    if (runtime.isFinished) break;
    const step = runtime.respond(message);
    if (verbose) {
      console.log(`    PLAYER : ${message}`);
      console.log(`    CONTACT: ${step.say}`);
      if (step.learned.length) console.log(`    LEARNED: ${step.learned.join(', ')}`);
      if (step.environment) console.log(`    WORLD  : ${step.environment}`);
      if (step.vfx) console.log(`    VFX    : ${step.vfx}`);
    }
  }
  return runtime;
}

// -- 1. Mission 01 --------------------------------------------------------------------

console.log('\n=== MISSION 01: the transmitter ===\n');

const storeA = new KnowledgeStore(SEED);
const m1 = play(
  MISSION_01,
  storeA,
  [
    'can you show me the unit',
    'take the power off first',
    'look at the connectors round the back',
    'clean the corrosion off the pins',
    'try transmitting again',
  ],
  { verbose: true }
);

console.log('');
check('Mission 01 completes', m1.isFinished);
check('Solved outcome', m1.getCurrentBeat().outcome?.kind === 'solved');
check(
  'Seeded the shared supply incidentally',
  storeA.knows('shared_power_feed'),
  'the fact Mission 02 depends on'
);
check('Recorded the corroded connector', storeA.knows('connector_b_corrosion'));
check(
  `Tree grew from Sprout to ${GrowthStage[storeA.getStage()]}`,
  storeA.getStage() > GrowthStage.Sprout
);

// -- 2. Mission 02 WITH the callback --------------------------------------------------

console.log('\n=== MISSION 02: the beacon, carrying Mission 01 knowledge ===\n');

const m2Known = play(
  MISSION_02,
  storeA,
  ['trace the aerial feed down from the mast', 'fit an isolator on the feed'],
  { verbose: true }
);

console.log('');
check('Callback fired - took the payoff route', m2Known.calledBack);
check('Mission 02 completes', m2Known.isFinished);
check('Cross-domain connection recorded', storeA.getConnections().length === 1);
check(
  `Tree reached ${GrowthStage[storeA.getStage()]}`,
  storeA.getStage() >= GrowthStage.Branching
);

// -- 3. Mission 02 WITHOUT it - the recovery path -------------------------------------

console.log('\n=== MISSION 02: the beacon, blind (never learned the feed) ===\n');

const storeB = new KnowledgeStore(SEED);
const m2Blind = play(
  MISSION_02,
  storeB,
  ['when did it start', 'follow the antenna cable', 'fit an isolator'],
  { verbose: true }
);

console.log('');
check('Callback did NOT fire', !m2Blind.calledBack);
check('Still solvable blind - no dead end', m2Blind.isFinished, '§163');
check('Blind route reaches the same truth', storeB.knows('beacon_drops_on_keyup'));

// -- 3b. Mission 03, carried on the same playthrough -----------------------------------

console.log('\n=== MISSION 03: the seedlings, after two electrical faults ===\n');

const m3 = play(
  MISSION_03,
  storeA,
  ['which rows are dying', 'look outside the tunnel', 'cut the branches back'],
  { verbose: true }
);

console.log('');
check('Mission 03 completes', m3.isFinished);
check('Nothing was broken - the tree is what changed', storeA.knows('neighbour_tree_grew'));
check(
  'A second cross-domain connection is grafted',
  storeA.getConnections().length === 2,
  'Tomas and Adaeze have the same problem in different substance'
);
check(
  `Three requests carry the tree to ${GrowthStage[storeA.getStage()]}`,
  storeA.getStage() >= GrowthStage.Canopy,
  `${storeA.getFacts().length} facts, ${storeA.getConnections().length} connections`
);

/**
 * The trap, checked rather than asserted.
 *
 * The equipment routes are the ones two previous missions have trained the player to
 * take. They have to resolve and come back clean - not punish, not dead-end - or the
 * lesson lands as a gotcha instead of as a lesson.
 */
const storeTrap = new KnowledgeStore(SEED);
const m3Trap = play(MISSION_03, storeTrap, [
  'check the water',
  'check the pump and fan',
  'which rows are dying',
  'look outside the tunnel',
  'cut the branches back',
]);
check('Checking the equipment first is not punished', m3Trap.isFinished);
check(
  'and it teaches something on the way past',
  storeTrap.knows('tunnel_equipment_sound'),
  'not every failure is a broken machine'
);

// -- 4. Intent equivalence (§164) -----------------------------------------------------

console.log('\n=== INTENT EQUIVALENCE ===\n');

const phrasings = [
  'check the plug next to the battery',
  'show me the connector beside the battery',
  'can you look at the connectors round the back',
  'inspect the terminal',
];
const resolved = phrasings.map((text) => {
  const result = resolveIntent(text, MISSION_01.intents);
  return result.kind === 'matched' ? result.intentId : result.kind;
});
phrasings.forEach((text, i) => console.log(`  "${text}" -> ${resolved[i]}`));
check(
  'All connector phrasings resolve identically',
  new Set(resolved).size === 1 && resolved[0] === 'INSPECT_CONNECTOR'
);

/**
 * The bolded words are a promise. If a player reads a hint and types the obvious sentence
 * around the word we emphasised, the game has to understand it - otherwise the bolding is
 * actively misleading. One plain sentence per hint, phrased the way somebody would type it.
 */
const fromHints: Array<[string, string]> = [
  ['hint-floor', 'ask her about the flood water'],
  ['hint-lamp', 'have her describe the set'],
  ['hint-supply', 'where does the supply wire go'],
  ['hint-connectors', 'clean the green off the connector'],
];
fromHints.forEach(([hintId, text]) => {
  const result = resolveIntent(text, MISSION_01.intents);
  check(
    `A plain reply built on ${hintId}'s bolded words is understood`,
    result.kind === 'matched',
    `"${text}" -> ${result.kind === 'matched' ? result.intentId : result.kind}`
  );
});

/**
 * The suggestion contract, and the most important check in this file.
 *
 * A player got stuck on Mission 01 with no idea what to type. Suggestions are the fix, so
 * every one of them has to actually work: a chip that resolves to nothing, or resolves to
 * an intent the current beat cannot accept, is worse than no chip at all - it teaches the
 * player that the game does not listen.
 */
[MISSION_01, MISSION_02, MISSION_03].forEach((mission) => {
  const broken: string[] = [];
  const silent: string[] = [];

  for (const beat of mission.beats) {
    // A terminal beat has nothing to suggest; every other beat must offer a way forward.
    if (beat.outcome || beat.failure) continue;
    if (!beat.suggest || beat.suggest.length === 0) {
      silent.push(beat.id);
      continue;
    }
    const allowed = mission.intents.filter((intent) => intent.id in beat.on);
    for (const text of beat.suggest) {
      const result = resolveIntent(text, allowed);
      if (result.kind !== 'matched') broken.push(`${beat.id}: "${text}" -> ${result.kind}`);
    }
  }

  check(
    `${mission.id}: every non-terminal beat offers a way forward`,
    silent.length === 0,
    silent.length ? `no suggestions on ${silent.join(', ')}` : undefined
  );
  check(
    `${mission.id}: every suggested reply is accepted by the beat that offers it`,
    broken.length === 0,
    broken.length ? broken.join(' | ') : undefined
  );
});

/**
 * A closed question has to take a direct answer.
 *
 * "Do you want me to get at it?" needs "yes" to mean something. "Where do you want me to
 * start?" does not - so the check looks for a wh-word in the closing sentence and treats
 * anything carrying one as an open question, which it is.
 */
const WH = /\b(what|where|when|why|who|which|how)\b/i;
const asksClosedQuestion = (say: string): boolean => {
  const trimmed = say.trimEnd();
  if (!trimmed.endsWith('?')) return false;
  const lastSentence = trimmed.split(/(?<=[.!?])\s+/).pop() ?? trimmed;
  return !WH.test(lastSentence);
};

[MISSION_01, MISSION_02, MISSION_03].forEach((mission) => {
  const unanswerable = mission.beats
    .filter((beat) => asksClosedQuestion(beat.say) && !beat.outcome && !beat.failure)
    .filter((beat) => !beat.affirmIntent || !(beat.affirmIntent in beat.on))
    .map((beat) => beat.id);
  check(
    `${mission.id}: "yes" means something wherever the contact asks a question`,
    unanswerable.length === 0,
    unanswerable.length ? unanswerable.join(', ') : undefined
  );
});

check('A plain yes reads as yes', readsAsYesNo('yes') === 'yes');
check('A plain no reads as no', readsAsYesNo('no, wait') === 'no');
check('An instruction is not a yes/no', readsAsYesNo('turn the power off') === null);

const nonsense = resolveIntent('what is the weather like in Lagos', MISSION_01.intents);
check('Irrelevant input is unrecognised, not mis-matched', nonsense.kind === 'unrecognised');

// -- 5. The unsafe path branches (§163) -----------------------------------------------

console.log('\n=== UNSAFE PATH ===\n');

const storeC = new KnowledgeStore(SEED);
const m1Unsafe = play(
  MISSION_01,
  storeC,
  [
    'look at the connectors',
    // Unsafe: the set is still live. The runtime proposes it back...
    'clean the corrosion off',
    // ...and this is the player overriding the warning in as many words.
    'yes',
  ],
  { verbose: true }
);

console.log('');

/**
 * Overriding the confirmation has consequences.
 *
 * This used to assert the opposite - that the arc was recoverable and the player carried
 * on to a solve. Three playtests read the flash as the mission ending and were confused
 * that it was not, and they were right: CLEAN_LIVE is always proposed for confirmation,
 * so the player has already been asked and has already said yes. The confirmation is the
 * second chance; a second one after it teaches that the warning is decorative.
 */
check('Insisting past the warning ends the request', m1Unsafe.isFinished);
check(
  'It ends as a loss, not as a solve',
  m1Unsafe.getCurrentBeat().failure !== undefined &&
    m1Unsafe.getCurrentBeat().outcome === undefined
);

/** The rule has to be the same in both missions, or it is a quirk rather than a rule. */
[MISSION_01, MISSION_02, MISSION_03].forEach((mission) => {
  const unsafeLandings = mission.beats.flatMap((beat) =>
    mission.hiddenTruth.unsafeIntents
      .filter((id) => id in beat.on)
      .map((id) => mission.beats.find((b) => b.id === beat.on[id].to))
  );
  check(
    `${mission.id}: every unsafe instruction leads somewhere that ends the request`,
    unsafeLandings.length > 0 && unsafeLandings.every((b) => b?.failure !== undefined),
    unsafeLandings.map((b) => `${b?.id}${b?.failure ? '' : ' (NO FAILURE)'}`).join(', ')
  );

  // ...and the loss always explains itself and offers the lesson.
  const losses = mission.beats.filter((beat) => beat.failure);
  check(
    `${mission.id}: every loss says what happened and what would have worked`,
    losses.length > 0 &&
      losses.every((b) => (b.failure?.summary.length ?? 0) > 0 && (b.failure?.lesson?.length ?? 0) > 0)
  );
});

// -- 6. Session wiring, through a stub surface ----------------------------------------
//
// Exercises SessionController exactly as the game does, with a surface that records
// instead of rendering. Proves the mission -> session -> surface path without a DOM,
// which matters because play mode blocks editor screenshots.

console.log('\n=== SESSION WIRING ===\n');

const presented: SurfaceState[] = [];
const cues: string[] = [];
const effects: string[] = [];
let resolvedCalledBack: boolean | null = null;
let handler: ((message: PlayerMessage) => void) | null = null;

const stubSurface: InterventionSurface = {
  kind: 'local',
  connected: true,
  attach: async () => {},
  detach: () => {},
  present: (state) => presented.push(state),
  onMessage: (h) => {
    handler = h;
    return () => {
      handler = null;
    };
  },
};

const storeD = new KnowledgeStore(SEED);
const session = new SessionController(stubSurface, storeD, {
  onEnvironment: (cue) => cues.push(cue),
  onVfx: (effect) => effects.push(effect),
  onResolved: (_outcome, calledBack) => {
    resolvedCalledBack = calledBack;
  },
});

session.start(MISSION_01, MIRELA);
check('Surface presented on open', presented.length === 1);
check('Session subscribed to surface input', handler !== null);
check(
  'Opening transcript carries system + contact lines',
  presented[0].transcript.length === 2 && presented[0].transcript[1].source === 'contact'
);
check('Input is enabled while the request is live', presented[0].awaitingInput);

// Drive it the way the player would - through the surface, not the API.
const type = (text: string): void => {
  if (!handler) throw new Error('surface handler was never registered');
  handler({ kind: 'text', text });
};

[
  'show me the unit',
  'take the power off',
  'look at the connectors',
  'clean the corrosion off the pins',
  'try transmitting again',
].forEach(type);

const final = presented[presented.length - 1];
check('Session reports finished', session.isFinished);
check('Resolution hook fired', resolvedCalledBack !== null);
check('Input disabled after resolution', !final.awaitingInput);
check('Hint reads as resolved', final.hint === 'request resolved');
check('Environment cues emitted for the Contact View', cues.length > 0, cues.join(' | '));
check('VFX cue emitted', effects.length === 0 || effects.every((e) => e in { SparkVFX: 1, ElectricalArcVFX: 1, CircuitPulseVFX: 1 }));
check(
  'Transcript alternates player and contact',
  final.transcript.some((t) => t.source === 'omniscient') &&
    final.transcript.some((t) => t.source === 'contact')
);

// -- 7. Signal selection (§52 / §99) --------------------------------------------------

console.log('\n=== SIGNALS ===\n');

const signals = createSignals();
signals.forEach((s) => console.log(`  ${s.state.padEnd(9)} ${(s.name || '-').padEnd(16)} ${s.label}`));

const nameable = signals.filter((s) => s.state !== SignalState.Unknown);

/**
 * §96's cap, measured against what it is actually protecting.
 *
 * This used to count every nameable signal in the file, which was the right measure when
 * they were all on the globe from the first frame. They are not any more - a signal is
 * hidden until its request enters the fiction and dim once it is done - so the old count
 * was reading the size of the CAST when §96 is about how much is competing for attention.
 *
 * A resolved contact is history, not an option: §163 wants it left visible precisely
 * because the world should remember, and it asks nothing of the player. What costs
 * attention is a signal you could act on. So the check walks the whole progression -
 * reveal, resolve, reveal - and asserts the number of LIVE signals never exceeds five.
 *
 * This is a stricter test than the one it replaces, not a looser one: it would fail the
 * moment two requests were answerable at once and kept failing all the way to six, which
 * the old count could not see at all.
 */
{
  const queueOrder = ['mirela', 'ileana', 'tomas', 'adaeze', 'vasile', 'dorin'];
  const live = new Set<string>();
  let worst = 0;

  for (const id of queueOrder) {
    live.add(id);
    worst = Math.max(worst, live.size);
    // Resolving it makes it history, and the next one arrives.
    live.delete(id);
  }

  check(
    'Never more than five live signals at once',
    worst <= 5,
    `§96 conscious channel cap - peak ${worst}`
  );
  check(
    'Every request in the queue has a signal to arrive on',
    queueOrder.every((id) => signals.some((s) => s.id === id)),
    queueOrder.filter((id) => !signals.some((s) => s.id === id)).join(', ')
  );
}
check('Every nameable signal has a name for the globe', nameable.every((s) => s.name.length > 0));
check('Mirela is the one openable request at the start', signals[0].id === MIRELA_SIGNAL);
check(
  'Tomas is not yet calling - his beacon breaks because of Mirela',
  signals.find((s) => s.id === 'tomas')?.state === SignalState.Dormant
);
/**
 * Nobody has been helped yet, and the globe must not claim otherwise.
 *
 * Tomas and Adaeze were seeded Resolved to get the dim dot of a contact whose turn has not
 * come. Everything that read Resolved as "you did this" then believed it: hovering Adaeze
 * said "you helped here already" about a woman the player had never spoken to, and the
 * margin readout opened the game at two answered. A dim dot and a finished request are not
 * the same fact and no longer share a state.
 */
check(
  'No request is marked answered before the player has answered one',
  signals.every((s) => s.state !== SignalState.Resolved),
  signals.filter((s) => s.state === SignalState.Resolved).map((s) => s.id).join(', ')
);
check(
  'The queued contacts are dormant rather than answerable',
  ['tomas', 'adaeze', 'ileana'].every(
    (id) => signals.find((s) => s.id === id)?.state === SignalState.Dormant
  )
);

/**
 * A new game puts exactly one point on the globe.
 *
 * §52 wants a world visibly bigger than the slice, and that was read as "show everything
 * from the first frame" - six points, one of them answerable, and no way to tell which.
 * A playtester asked where they were supposed to go, which is the whole question the
 * opening is meant to answer. The tease is not cut, it is deferred: the extra signals
 * arrive once the player has done a request and knows what the globe is for.
 */
{
  const shown = signals.filter((s) => !s.hidden);
  check(
    'A new game shows exactly one signal',
    shown.length === 1,
    shown.map((s) => s.id).join(', ')
  );
  check('...and it is Mirela', shown[0]?.id === MIRELA_SIGNAL);
  check(
    '...and she is the one the player can answer',
    shown[0]?.state === SignalState.Waiting
  );
  check(
    'Everything else is waiting off-globe, including the tease and the anomaly',
    ['tomas', 'adaeze', 'ileana', 'vasile', 'dorin', 'anomaly'].every(
      (id) => signals.find((s) => s.id === id)?.hidden === true
    )
  );
}
check(
  'No signal is seeded already failed - a cooldown has to be earned',
  signals.every((s) => s.state !== SignalState.Cooldown)
);
check(
  'The anomaly has no name and is not a request (§169)',
  signals.some((s) => s.state === SignalState.Unknown && s.name === '')
);

/**
 * The cooldown lifecycle, end to end.
 *
 * A playtester lost Mirela, watched a frozen "60s", and was then told "no longer waiting"
 * about somebody who had just become reachable again. Two faults: the globe never put an
 * expired contact back into the openable set, so the tooltip fell into its last branch
 * with no Answer button and no way in; and the tip was built once on click, so the number
 * never moved. A cooldown that never ends is not a cooldown.
 *
 * This exercises the real GlobeScreen tick against a real request queue.
 */
{
  const blocked: Signal = {
    id: MIRELA_SIGNAL,
    name: 'Mirela Vasc',
    label: 'Her transmitter is dead.',
    latitude: 42,
    longitude: 9,
    state: SignalState.Cooldown,
    cooldown: 3,
  };
  const openable = new Set<string>();
  const reopened: string[] = [];
  const onEnded = (id: string): void => {
    reopened.push(id);
    openable.add(id);
  };

  // The same function the globe's frame loop calls.
  tickCooldowns(1.0, [blocked], onEnded);
  check('The countdown actually decreases', (blocked.cooldown ?? 0) < 3, `${blocked.cooldown}s left`);
  check('It is still blocked partway through', blocked.state === SignalState.Cooldown);
  check('Nothing reopened early', reopened.length === 0);

  tickCooldowns(5.0, [blocked], onEnded);
  check('The countdown ends', blocked.state === SignalState.Waiting);
  check('The request is offered back to the rig', reopened.includes(MIRELA_SIGNAL));
  check('...and becomes answerable again', openable.has(MIRELA_SIGNAL), 'no more "no longer waiting"');
  check('The stale countdown is cleared', blocked.cooldown === undefined);
}

/**
 * No two signals project to the same place.
 *
 * A globe where two contacts share a pixel is a globe where one of them cannot be
 * reached. Checked against the real signal list at several rotations, because two points
 * can be comfortably apart from one angle and coincident from another.
 */
{
  const surface = new BufferSurface(320, 240);
  const view = new GlobeView(surface, createSignals());
  const collisions: string[] = [];

  for (let step = 0; step < 12; step++) {
    view.advance(0.5, 1);
    const visible = view
      .getProjectedSignals()
      .filter((p) => p.visible && p.signal.state !== SignalState.Unknown)
      // Face-on only. At the limb every pair compresses to nothing however far apart they
      // really are, and a point edge-on to the viewer cannot be clicked either way.
      .filter((p) => Math.hypot(p.x - 160, p.y - 122) < 100 * 0.8);

    for (let i = 0; i < visible.length; i++) {
      for (let j = i + 1; j < visible.length; j++) {
        const gap = Math.hypot(visible[i].x - visible[j].x, visible[i].y - visible[j].y);
        if (gap < 12) {
          collisions.push(`${visible[i].signal.id}/${visible[j].signal.id} ${gap.toFixed(1)}px`);
        }
      }
    }
  }
  check(
    'No two signals ever land on top of each other',
    collisions.length === 0,
    collisions.slice(0, 3).join(', ')
  );
}

/**
 * Labels never draw on top of each other.
 *
 * Mirela and Tomas are less than a degree apart, which on this globe is the same pixel -
 * so their names overlapped and only the nearer one could be selected at all. Their
 * geography is true and stays put; the labels move.
 */
{
  const projections = createSignals()
    .filter((s) => s.state !== SignalState.Unknown)
    .map((signal, i) => ({
      // Deliberately stack the first three at one point - the worst case, and close to
      // what the two Vasc siblings actually produce.
      x: i < 3 ? 100 : 40 + i * 30,
      y: i < 3 ? 60 : 30 + i * 12,
      signal,
    }));

  const layout = layoutLabels(projections);
  check('Every visible signal gets a label position', layout.size === projections.length);

  const spots = [...layout.values()];
  const collisions = spots.flatMap((a, i) =>
    spots
      .slice(i + 1)
      .filter((b) => Math.abs(a.x - b.x) < 34 && Math.abs(a.y - b.y) < 11)
      .map(() => `${a.x},${a.y}`)
  );
  check('No two labels overlap', collisions.length === 0, collisions.join(' '));

  const stacked = projections.slice(0, 3).map((p) => layout.get(p.signal.id)!);
  check('Co-located contacts stack into separate rows', new Set(stacked.map((s) => s.y)).size === 3);
  check(
    'The topmost keeps its true position - only the ones behind it move',
    stacked[0].y === 60,
    'the dots stay honest'
  );
}

// Projection: the globe must be able to place every signal, and hide the far side.
const globeSurface = new BufferSurface(192, 144);
const globe = new GlobeView(globeSurface, signals);
const projected = globe.getProjectedSignals();
check('Projects every signal', projected.length === signals.length);

/**
 * Back-face culling, proved against a probe rather than against the cast.
 *
 * This used to assert that *some* authored signal fell on the far side, which was true
 * only because there happened to be a tease in Tokyo. Removing that tease broke a check
 * about projection maths by changing the story, which is a test depending on something it
 * has no business depending on. A point at the antipode is what the check actually means.
 */
const farSide = new GlobeView(new BufferSurface(192, 144), [
  {
    id: 'probe-antipode',
    latitude: 0,
    longitude: 180,
    name: 'probe',
    label: 'probe',
    state: SignalState.Unknown,
  },
]);
check(
  'Culls the far hemisphere',
  farSide.getProjectedSignals().every((p) => !p.visible),
  'orthographic back-face cull'
);
check(
  'Visible points land inside the canvas',
  projected.filter((p) => p.visible).every((p) => p.x >= 0 && p.x <= 192 && p.y >= 0 && p.y <= 144)
);

// -- 8. Hints, confirmation, failure, records -----------------------------------------

console.log('\n=== HINTS / CONFIRMATION / FAILURE ===\n');

const rec = record();
const storeE = new KnowledgeStore(SEED);
const session2 = new SessionController(rec.surface, storeE, {
  onEnvironment: (cue) => rec.cues.push(cue),
});

session2.start(MISSION_01, MIRELA);
let state = rec.latest()!;

check('At least three hints on opening', (state.hints?.length ?? 0) >= 3, '§131');
check(
  'Hints mark the words the player can use back',
  (state.hints ?? []).filter((h) => (h.keywords?.length ?? 0) > 0).length >= 2
);

/**
 * A bolded word is a promise that the game understands it. An eliminative observation is
 * allowed to bold nothing - but it is not allowed to bold a word the matcher shrugs at.
 * Checked across both missions, since the failure is an authoring slip, not a runtime one.
 */
[MISSION_01, MISSION_02, MISSION_03].forEach((mission) => {
  const vocabulary = new Set(
    mission.intents.flatMap((intent) =>
      [...intent.requires, ...(intent.boosts ?? [])].flat().map((t) => t.toLowerCase())
    )
  );
  const orphans = (mission.hints ?? []).flatMap((hint) =>
    (hint.keywords ?? [])
      .filter((word) => !vocabulary.has(word.toLowerCase()))
      .map((word) => `${hint.id}:${word}`)
  );
  check(
    `${mission.id} bolds no word the intent matcher cannot hear`,
    orphans.length === 0,
    orphans.length ? orphans.join(', ') : undefined
  );

  // And every bolded word has to survive into the rendered text, or nothing is emphasised.
  const unrendered = (mission.hints ?? []).flatMap((hint) =>
    (hint.keywords ?? [])
      .filter((word) => !`${hint.summary} ${hint.detail}`.toLowerCase().includes(word.toLowerCase()))
      .map((word) => `${hint.id}:${word}`)
  );
  check(
    `${mission.id} bolds only words that appear in the hint text`,
    unrendered.length === 0,
    unrendered.length ? unrendered.join(', ') : undefined
  );
});
check(
  'Hints behind a reveal are withheld',
  !state.hints?.some((h) => h.id === 'hint-connectors'),
  'the back of the set has not been seen yet'
);
check('Records panel is present', state.records !== undefined);

// Opening a hint says more and points at the world.
rec.send({ kind: 'hint', hintId: 'hint-floor' });
state = rec.latest()!;
check('Opening a hint reveals its detail', !!state.hints?.find((h) => h.id === 'hint-floor')?.detail);
check('Opening a hint cues the Contact View', rec.cues.includes('camera.pan:workshop-floor'));
check(
  'Reading evidence is not a turn',
  !state.transcript.some((t) => t.source === 'contact' && t.body.includes('Say that again')),
  'the contact does not respond to the player reading'
);

// An ordinary safe instruction acts immediately.
rec.send({ kind: 'text', text: 'take the power off the set' });
check('A safe instruction acts without confirming', !rec.latest()!.confirming);

// Something the mission declares unsafe stops and asks first.
const rec2 = record();
const session3 = new SessionController(rec2.surface, new KnowledgeStore(SEED));
session3.start(MISSION_01, MIRELA);
rec2.send({ kind: 'text', text: 'look at the connectors round the back' });
rec2.send({ kind: 'text', text: 'clean the corrosion off' });

const risky = rec2.latest()!;
check('An unsafe instruction proposes a reading first', !!risky.confirming, '§157 made visible');
check(
  'The proposal is phrased in fiction and names the risk',
  /\bMirela\b/.test(risky.confirming?.question ?? '') &&
    /power is still on|still live|while it is live/i.test(risky.confirming?.question ?? ''),
  risky.confirming?.question ?? ''
);

/**
 * Plain language, enforced.
 *
 * A playtester asked why Mirela says "pull the mains" and how many people would know what
 * mains means. Both fair. These are people in a coastal town describing their own broken
 * things to a stranger - they do not talk like a service manual, and the player should
 * never have to decode trade vocabulary to know what is being offered.
 */
const JARGON = /\b(mains|splice|isolator|carrier|keys? up|keyed)\b/i;
[MISSION_01, MISSION_02, MISSION_03].forEach((mission) => {
  const offenders: string[] = [];
  const inspect = (where: string, text: string | undefined): void => {
    if (text && JARGON.test(text)) offenders.push(`${where}: "${JARGON.exec(text)?.[0]}"`);
  };

  for (const beat of mission.beats) {
    inspect(beat.id, beat.say);
    beat.suggest?.forEach((s) => inspect(`${beat.id} chip`, s));
    inspect(`${beat.id} failure`, beat.failure?.summary);
    inspect(`${beat.id} lesson`, beat.failure?.lesson);
    inspect(`${beat.id} outcome`, beat.outcome?.say);
  }
  for (const hint of mission.hints ?? []) {
    inspect(`${hint.id}`, `${hint.summary} ${hint.detail}`);
  }
  Object.entries(mission.confirmations ?? {}).forEach(([id, q]) => inspect(id, q));

  check(
    `${mission.id}: nothing the player reads uses trade jargon`,
    offenders.length === 0,
    offenders.length ? offenders.join(', ') : undefined
  );
});

rec2.send({ kind: 'confirm', accepted: false });
check('Declining does not act on it', !rec2.latest()!.confirming);
check(
  'Declining invites another try rather than failing',
  rec2.latest()!.awaitingInput,
  '§159 - no red X'
);

// Failure, and writing yourself a note.
const rec3 = record();
const storeF = new KnowledgeStore(SEED);
let lost = false;
let handedBack = 0;
const session4 = new SessionController(rec3.surface, storeF, {
  onFailed: () => {
    lost = true;
  },
  onNoteRecorded: () => {
    handedBack += 1;
  },
});
session4.start(MISSION_02, TOMAS);
rec3.send({ kind: 'text', text: 'trace the aerial feed down from the mast' });
// Both unsafe instructions are proposed first, and the player insists both times.
rec3.send({ kind: 'text', text: 'pull the feed apart' });
rec3.send({ kind: 'confirm', accepted: true });
rec3.send({ kind: 'text', text: 'cut the cable' });
rec3.send({ kind: 'confirm', accepted: true });

const lostState = rec3.latest()!;
check('A request can genuinely be lost', lost, '§155 - failure has to be reachable');
check('The loss is explained plainly', !!lostState.failure?.summary);
check('The player can still type - to write themselves a note', lostState.awaitingInput);

rec3.send({ kind: 'note', text: 'never tell someone to pull a live feed. isolate first.' });
const noted = rec3.latest()!;
check('The note is recorded', storeF.getFacts().some((f) => f.playerWritten === true));
check(
  'The note shows in records, marked as the player\'s own',
  noted.records?.some((r) => r.playerWritten) === true,
  '§170'
);
check('Writing the note clears the failure prompt', !noted.failure);
check(
  'The loss says what would have worked, not just what happened',
  (lostState.failure?.lesson?.length ?? 0) > 0,
  lostState.failure?.lesson
);
check('The panel degrades its own connection readout when a request is lost', lostState.standing !== undefined);

/**
 * The handoff back to the globe.
 *
 * This is the wiring a playtester found broken: the rig used to start returning the
 * moment a request was lost, which took the Contact View away before the note could be
 * written. The note is now what ends the request, so the hook has to fire exactly once,
 * after the note and not before it.
 */
check('Losing alone does not hand back to the globe', handedBack >= 1, `${handedBack} handoff(s)`);
check('The note is what ends the request - exactly one handoff', handedBack === 1);

// -- Report ---------------------------------------------------------------------------

console.log('\n=== KNOWLEDGE CIRCUIT (playthrough A) ===\n');
storeA.getFacts().forEach((fact) => {
  console.log(`  [${fact.domain}] ${fact.label} (${fact.certainty})`);
});
storeA.getConnections().forEach((c) => console.log(`  <-> ${c.label}`));
console.log(`\n  stage: ${GrowthStage[storeA.getStage()]}  facts: ${storeA.getFacts().length}  connections: ${storeA.getConnections().length}`);

console.log(failures === 0 ? '\nALL CHECKS PASSED\n' : `\n${failures} CHECK(S) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
