/**
 * Does the tape actually hold the game?
 *
 * The save system is one JSON blob, which means the interesting failures are all quiet:
 * a field the serializer forgot, a shape the validator waves through, a store that
 * restores almost-everything. None of those crash - they surface an hour later as a tree
 * missing a branch or a contact asking for help they already gave, and by then the save
 * that caused it is gone.
 *
 * So this walks the actual promise: a knowledge store full of real learning goes through
 * serialize → JSON → validate → restore and comes back IDENTICAL, and the validator
 * refuses every malformed shape that has a way of appearing in localStorage. Runs
 * headlessly with a shimmed localStorage - persistence.ts only ever touches
 * `window.localStorage` inside try/catch, so the shim is the browser contract minus the
 * browser.
 *
 *     npx tsx scripts/preview-save.ts
 */

// -- localStorage shim, before persistence is imported -------------------------------------
const backing = new Map<string, string>();
(globalThis as Record<string, unknown>).window = {
  localStorage: {
    getItem: (k: string) => backing.get(k) ?? null,
    setItem: (k: string, v: string) => void backing.set(k, v),
    removeItem: (k: string) => void backing.delete(k),
  },
};

import { Certainty, KnowledgeDomain, KnowledgeStore } from '../src/omniscient/knowledge/KnowledgeStore.js';
import { SignalState } from '../src/omniscient/crt/GlobeView.js';
import {
  clearM4ssStage,
  clearSave,
  hasSave,
  loadGame,
  loadM4ssStage,
  saveGame,
  saveM4ssStage,
} from '../src/omniscient/session/persistence.js';

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures += 1;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` - ${detail}` : ''}`);
}

console.log('\n=== THE TAPE ===\n');

// ---------------------------------------------------------------- a real playthrough's state
const store = new KnowledgeStore(7);
store.learn('radio-fault', 'The transmitter fault was the connector', KnowledgeDomain.Electronics, {
  certainty: Certainty.Verified,
  contactId: 'mirela',
  missionId: 'm01',
});
store.learn('valley-weather', 'Storms come up the valley without warning', KnowledgeDomain.Signal, {
  certainty: Certainty.Reported,
  contactId: 'mirela',
  missionId: 'm01',
});
store.learn('pump-dry', 'The pump runs dry when the head drops', KnowledgeDomain.Mechanical, {
  certainty: Certainty.Verified,
  contactId: 'vasile',
  missionId: 'm05',
});
// Re-learning upgrades certainty - the round trip has to keep the upgraded value.
store.learn('valley-weather', 'Storms come up the valley without warning', KnowledgeDomain.Signal, {
  certainty: Certainty.Verified,
  contactId: 'tomas',
  missionId: 'm02',
});
store.connect('radio-fault', 'valley-weather', 'The storm is what corroded the connector');
store.recordOutcome('mirela', true, 2);
store.recordOutcome('vasile', false);

// ---------------------------------------------------------------- serialize -> JSON -> restore
const snapshot = store.serialize();
const wire = JSON.parse(JSON.stringify(snapshot)) as typeof snapshot;
const restored = new KnowledgeStore(7);
restored.restore(wire);

check(
  'facts survive the round trip, in learn order',
  JSON.stringify(restored.getFacts()) === JSON.stringify(store.getFacts()),
  `${restored.getFacts().length} facts`
);
check(
  'connections survive',
  JSON.stringify(restored.getConnections()) === JSON.stringify(store.getConnections())
);
check(
  'an upgraded certainty survives as upgraded',
  restored.getFact('valley-weather')?.certainty === Certainty.Verified
);
check(
  'standings survive - trust, jobs and losses',
  JSON.stringify(restored.getStanding('mirela')) === JSON.stringify(store.getStanding('mirela')) &&
    JSON.stringify(restored.getStanding('vasile')) === JSON.stringify(store.getStanding('vasile'))
);
check('the growth stage derives identically', restored.getStage() === store.getStage());

// Learning continues cleanly after a restore - the sequence counter came along.
restored.learn('new-after-restore', 'Learned after restoring', KnowledgeDomain.People, {});
const afterRestore = restored.getFacts();
const last = afterRestore[afterRestore.length - 1];
check(
  'learning continues after restore without colliding sequences',
  last.id === 'new-after-restore' && last.sequence > wire.sequence - 1
);

// ---------------------------------------------------------------- the file itself
clearSave();
check('no save reads as no save', !hasSave() && loadGame() === null);

saveGame({
  ...snapshot,
  signals: [
    { id: 'mirela', state: SignalState.Resolved, hidden: false },
    { id: 'tomas', state: SignalState.Cooldown, hidden: false },
    { id: 'sanda', state: SignalState.Dormant, hidden: true },
  ],
  offered: 3,
  openable: ['tomas'],
  m4ssStage: 1,
});
const loaded = loadGame();
check('a written save loads', loaded !== null && hasSave());
check(
  'and carries the queue position, the openable set and the stage',
  loaded?.offered === 3 && loaded?.openable[0] === 'tomas' && loaded?.m4ssStage === 1
);
check('and the signal states', loaded?.signals.find((s) => s.id === 'sanda')?.hidden === true);

// ---------------------------------------------------------------- the validator refuses junk
const KEY = 'omniscient.save';
const cases: Array<[string, string]> = [
  ['corrupt JSON', '{"version":1,'],
  ['wrong version', JSON.stringify({ version: 99, facts: [], signals: [], offered: 0, openable: [] })],
  ['facts not a list', JSON.stringify({ version: 1, facts: 'no', signals: [], offered: 0, openable: [] })],
  [
    'a fact with a forged domain',
    JSON.stringify({
      version: 1,
      facts: [{ id: 'x', label: 'x', domain: 'invented', certainty: 'verified', sequence: 0 }],
      connections: [],
      standings: [],
      sequence: 1,
      signals: [],
      offered: 0,
      openable: [],
      m4ssStage: 0,
    }),
  ],
];
for (const [label, junk] of cases) {
  backing.set(KEY, junk);
  check(`refuses ${label}`, loadGame() === null);
}

// ---------------------------------------------------------------- the specimen's own key
clearM4ssStage();
check('no stage reads as stage 0', loadM4ssStage() === 0);
saveM4ssStage(1);
check('a saved stage loads', loadM4ssStage() === 1);
backing.set('omniscient.m4ss.stage', 'NaN');
check('a corrupt stage reads as stage 0', loadM4ssStage() === 0);

console.log(failures === 0 ? '\nALL CHECKS PASSED\n' : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
