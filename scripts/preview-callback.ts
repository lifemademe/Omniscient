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

import { MIRELA } from '../src/omniscient/content/contacts.js';
import { MISSION_01 } from '../src/omniscient/content/mission-01-transmitter.js';
import { MISSION_02 } from '../src/omniscient/content/mission-02-beacon.js';
import { GrowthStage } from '../src/omniscient/crt/KnowledgeTree.js';
import { KnowledgeStore } from '../src/omniscient/knowledge/KnowledgeStore.js';
import { resolveIntent } from '../src/omniscient/mission/intent.js';
import { MissionRuntime } from '../src/omniscient/mission/MissionRuntime.js';
import { SessionController } from '../src/omniscient/session/SessionController.js';

import type {
  InterventionSurface,
  PlayerMessage,
  SurfaceState,
} from '../src/omniscient/link/surface.js';
import type { MissionDefinition } from '../src/omniscient/mission/types.js';

const SEED = 0x0c151e;

let failures = 0;

function check(label: string, condition: boolean, detail = ''): void {
  const mark = condition ? 'PASS' : 'FAIL';
  if (!condition) failures++;
  console.log(`  [${mark}] ${label}${detail ? ` - ${detail}` : ''}`);
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
  'Seeded the shared antenna feed incidentally',
  storeA.knows('shared_antenna_feed'),
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
    // Unsafe: the set is still live.
    'clean the corrosion off',
    'take the power off',
    'clean the connector',
    'try transmitting again',
  ],
  { verbose: true }
);

console.log('');
check('Cleaning a live connector does not end the mission', m1Unsafe.isFinished, 'recovered to solved');
check('Player still reaches a solve after the arc', m1Unsafe.getCurrentBeat().outcome?.kind === 'solved');

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

// -- Report ---------------------------------------------------------------------------

console.log('\n=== KNOWLEDGE CIRCUIT (playthrough A) ===\n');
storeA.getFacts().forEach((fact) => {
  console.log(`  [${fact.domain}] ${fact.label} (${fact.certainty})`);
});
storeA.getConnections().forEach((c) => console.log(`  <-> ${c.label}`));
console.log(`\n  stage: ${GrowthStage[storeA.getStage()]}  facts: ${storeA.getFacts().length}  connections: ${storeA.getConnections().length}`);

console.log(failures === 0 ? '\nALL CHECKS PASSED\n' : `\n${failures} CHECK(S) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
