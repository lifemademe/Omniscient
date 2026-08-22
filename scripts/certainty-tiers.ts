/**
 * Can every guess the machine draws ever stop being one?
 *
 * ## The rule, and why it turns out to be the whole problem
 *
 * SUSPECTED does not render a prop. It renders the machine's guess at the volume the prop
 * occupies - a near-black box with lit cyan edges, breathing, because "a guess should not sit
 * as still as a fact". The tier means **not resolved YET**, and the word doing the work is
 * "yet": the whole thing is a promise that the box will open when somebody says what is in it.
 *
 * Four props in this game were SUSPECTED with no `revealOn` anywhere. Their boxes could never
 * open, in any mission, on any branch. `shelf-crates` and `bench-store` are two of them, and
 * they sit in the middle of Mirela's frame - the first room every player sees - for the entire
 * tutorial call.
 *
 * That is worse than clutter, because it teaches the wrong lesson. A player who watches a box
 * for five minutes and sees nothing happen concludes that boxes are simply what this game
 * looks like. Then the one that DOES open reads as an effect rather than as an answer, and the
 * tier has spent its meaning before it ever gets to say anything.
 *
 * The fault was found the only way it could be: the person who designed the tier looked at a
 * screenshot of his own game and asked what the translucent boxes were.
 *
 * ## What this does not cover
 *
 * Ids are matched across the whole of `scenes.ts` rather than per builder, so a SUSPECTED prop
 * in one room would be excused by a same-named `revealOn` in another. Prop ids are unique in
 * practice and the alternative is parsing function bodies out of a nine-thousand-line file for
 * a check whose whole value is that it is cheap. If two rooms ever share an id, this gets
 * weaker rather than wrong.
 *
 *     npx tsx scripts/certainty-tiers.ts
 */

import { readFileSync } from 'node:fs';

const SOURCE = 'src/omniscient/view/scenes.ts';
const text = readFileSync(SOURCE, 'utf8');

let failures = 0;

function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures += 1;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` - ${detail}` : ''}`);
}

/** `['shelf-crates', CERTAINTY.SUSPECTED],` in a builder's tier table. */
const suspected = [...text.matchAll(/\['([a-z0-9-]+)',\s*CERTAINTY\.SUSPECTED\]/g)].map((m) => m[1]);

/** `scene.revealOn(FACT_X, 'connector-b', CERTAINTY.KNOWN);` - the promise being kept. */
const revealed = new Set(
  [...text.matchAll(/revealOn\([A-Z_0-9]+,\s*'([a-z0-9-]+)'/g)].map((m) => m[1])
);

/**
 * A prop can also be promoted by a scene action rather than by a fact - `connector-b` has a
 * `reveal` action fired from a hint cue, because the moment she DESCRIBES the crust is
 * earlier and better than the moment the player acts on it. Both count as a way out.
 */
const byAction = new Set(
  [...text.matchAll(/reveal:\s*\(\)\s*=>\s*\{\s*scene\.setCertainty\('([a-z0-9-]+)'/g)].map((m) => m[1])
);

console.log(`\n${suspected.length} prop(s) at SUSPECTED, ${revealed.size} with a revealOn`);
if (byAction.size > 0) console.log(`  promoted by a scene action: ${[...byAction].join(', ')}`);

console.log('\nevery guess has a way of being answered');
for (const id of suspected) {
  const way = revealed.has(id) ? 'revealOn' : byAction.has(id) ? 'scene action' : '';
  check(`${id} can resolve`, way !== '', way || 'nothing ever promotes it - the box never opens');
}

/*
 * And the other direction, which is only a warning. A revealOn onto a prop that is already
 * SHAPED or above is not a fault - most of them raise DESCRIBED props to KNOWN, which is the
 * colour law rather than the box tier - so this only prints, and prints nothing useful unless
 * somebody is hunting a sweep that does not play.
 */
const orphans = [...revealed].filter((id) => !suspected.includes(id));
console.log(`\n${orphans.length} revealOn target(s) start above SUSPECTED, so they warm rather than sweep`);

console.log(failures === 0 ? '\nALL CHECKS PASSED\n' : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
