/**
 * Holds the ending to its rules before anyone sees it.
 *
 * The ending is the one part of the game that plays exactly once per player, which makes
 * it the hardest part to playtest and the easiest to ship broken: a line that wraps
 * mid-word in the typewriter, a report that counts wrong, a most-trusted row naming a
 * stranger. None of those crash. All of them land in the last thirty seconds of the game,
 * which is the worst possible place.
 *
 * So the words and the arithmetic are held here, headlessly - they are pure content and a
 * pure function, which is why content/ending.ts is separate from the panel that types it.
 *
 *     npx tsx scripts/preview-ending.ts
 */

import {
  TRANSMISSION_CLOSE,
  TRANSMISSION_COLUMN,
  TRANSMISSION_OPEN,
  buildEndingReport,
} from '../src/omniscient/content/ending.js';
import { Certainty, KnowledgeDomain, KnowledgeStore } from '../src/omniscient/knowledge/KnowledgeStore.js';
import { CONTACTS } from '../src/omniscient/content/contacts.js';

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures += 1;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` - ${detail}` : ''}`);
}

console.log('\n=== THE ENDING ===\n');

// ---------------------------------------------------------------- the words obey the CRT
{
  const lines = [...TRANSMISSION_OPEN, ...TRANSMISSION_CLOSE];
  const over = lines.filter((line) => line.length > TRANSMISSION_COLUMN);
  check(
    `no transmission line exceeds the ${TRANSMISSION_COLUMN}-character column`,
    over.length === 0,
    over.length ? `"${over[0]}" is ${over[0].length}` : `${lines.length} lines`
  );
  check('no line is empty - every beat of the keyer says something', lines.every((l) => l.trim().length > 0));
  check(
    'the machine ends listening, not concluding',
    TRANSMISSION_CLOSE[TRANSMISSION_CLOSE.length - 1] === 'SOMEBODY WILL CALL.'
  );
}

// ---------------------------------------------------------------- the report counts right
{
  const store = new KnowledgeStore(3);
  store.learn('a', 'Fact a', KnowledgeDomain.Electronics, { certainty: Certainty.Verified });
  store.learn('b', 'Fact b', KnowledgeDomain.Signal, {});
  store.learn('c', 'Fact c', KnowledgeDomain.People, {});
  store.connect('a', 'b', 'a explains b');
  store.recordOutcome('mirela', true, 2);
  store.recordOutcome('mirela', true, 2);
  store.recordOutcome('tomas', true, 1);
  store.recordOutcome('vasile', false);

  const rows = buildEndingReport(store, 8, 8);
  const byLabel = new Map(rows.map((row) => [row.label, row.value]));

  check('answered reads n of m', byLabel.get('REQUESTS ANSWERED') === '8 OF 8');
  check('facts are counted', byLabel.get('FACTS RECORDED') === '3');
  check('connections are counted', byLabel.get('CONNECTIONS MADE') === '1');
  // INTERWOVEN, not BRANCHING: this store carries three SOLVES, and completion floors
  // the stage now - the tree's promise is that finishing requests grows it.
  check('the growth stage is named', byLabel.get('GROWTH STAGE') === 'INTERWOVEN');
  check('losses are on the record - the history is part of the report', byLabel.get('REQUESTS LOST ON THE WAY') === '1');
  check(
    'the most trusting caller is the one most worked with',
    byLabel.get('MOST TRUSTING CALLER') === 'MIRELA VOICU'.toUpperCase() ||
      byLabel.get('MOST TRUSTING CALLER') ===
        CONTACTS.find((c) => c.id === 'mirela')!.name.toUpperCase(),
    `got ${byLabel.get('MOST TRUSTING CALLER')}`
  );
}

// ---------------------------------------------------------------- a spotless run
{
  const store = new KnowledgeStore(3);
  store.learn('a', 'Fact a', KnowledgeDomain.Electronics, {});
  const rows = buildEndingReport(store, 8, 8);
  check(
    'a run with no losses shows no losses row',
    !rows.some((row) => row.label === 'REQUESTS LOST ON THE WAY')
  );
  check(
    'a run where nobody was worked with names no favourite',
    !rows.some((row) => row.label === 'MOST TRUSTING CALLER')
  );
}

// ---------------------------------------------------------------- the tree keeps its promise
{
  /*
   * The CRT's promise: the tree grows when you finish someone's problem, and it is FULLY
   * grown when you have finished them all - whatever route the player took. Facts used to
   * be the only driver, and whether the finale's tree was full depended on which optional
   * beats a player happened to walk. Completion floors the stage now, so this walks eight
   * solves with NO facts learned at all - the worst-case route - and requires monotone
   * growth ending at Transcendent.
   */
  const store = new KnowledgeStore(11);
  const contacts = ['mirela', 'tomas', 'adaeze', 'ileana', 'vasile', 'dorin', 'lucian', 'keller'];
  let last = store.getStage();
  let monotone = true;
  for (const id of contacts) {
    store.recordOutcome(id, true, 2);
    const stage = store.getStage();
    if (stage < last) monotone = false;
    last = stage;
  }
  check('the tree never shrinks as requests resolve', monotone);
  check(
    'eight solves grow it to Transcendent even on a fact-poor route',
    store.getStage() === 6,
    `ended at stage ${store.getStage()}`
  );
  const seven = new KnowledgeStore(12);
  for (const id of contacts.slice(0, 7)) seven.recordOutcome(id, true, 2);
  check(
    'seven solves do NOT reach full - the last request still buys something',
    seven.getStage() < store.getStage(),
    `seven solves sit at stage ${seven.getStage()}`
  );
}

console.log(failures === 0 ? '\nALL CHECKS PASSED\n' : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
