/**
 * Prove mission 08's deduction before anybody builds a city around it.
 *
 * The surveillance mission asks the player to narrow a city full of traffic down to one
 * car using five or six incomplete facts. Two things have to be true for that to be a
 * puzzle rather than a sequence:
 *
 *   SUFFICIENT - all the evidence together leaves exactly one candidate.
 *   NECESSARY  - dropping any single fact leaves more than one.
 *
 * The second is the one that matters. A redundant clue is not a harmless extra; it is
 * something the officer tells the player, that the player spends time on, that could not
 * have changed the answer - which is what a puzzle looks like when it is secretly a
 * cutscene. `planFleet` plants one near-miss per clue by construction so this holds by
 * design, and this script is what stops it quietly ceasing to hold.
 *
 * Same discipline as the cellar's pipe grid, which was brute-forced to 256 solvable
 * arrangements out of 16,384 before a word of its dialogue was written.
 *
 *   npx tsx scripts/audit-traces.ts
 */

import { createRng, seedFrom } from '../src/omniscient/core/rng.js';
import {
  auditFleet,
  CLUES,
  narrow,
  narrowing,
  planFleet,
} from '../src/omniscient/mission/traces.js';

import type { ClueId } from '../src/omniscient/mission/traces.js';

/** The order the mission hands the facts over, which is the order the count collapses in. */
const REVEAL: ClueId[] = ['colour', 'body', 'seenBetween', 'heading', 'brokenLight', 'plate'];

const FLEET = 180;
const GRID = 24;

let failed = 0;
const check = (label: string, ok: boolean, detail: string): void => {
  if (!ok) failed++;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` - ${detail}` : ''}`);
};

console.log('=== DISTRICT 07 ===');

const rng = createRng(seedFrom('district-07'));
const { fleet, suspect, evidence } = planFleet(rng, FLEET, GRID);
const audit = auditFleet(fleet, evidence);

console.log(`  ${fleet.length} traces, suspect ${suspect.id} plate ${suspect.plate}`);
console.log(`  narrowing  ${fleet.length} -> ${narrowing(fleet, evidence, REVEAL).join(' -> ')}`);

check('the evidence identifies exactly one car', audit.sufficient, `${audit.survivors} survivor(s)`);
check(
  'and it is the guilty one',
  narrow(fleet, evidence)[0]?.id === suspect.id,
  narrow(fleet, evidence)[0]?.id ?? 'none'
);
check(
  'every clue is load-bearing',
  audit.redundant.length === 0,
  audit.redundant.length ? `redundant: ${audit.redundant.join(', ')}` : 'none redundant'
);

for (const clue of CLUES) {
  const remaining = narrow(
    fleet,
    evidence,
    CLUES.filter((other) => other !== clue)
  ).length;
  check(`  without "${clue}" the player cannot finish`, remaining > 1, `${remaining} candidates`);
}

/**
 * A different seed has to work too.
 *
 * The construction is what guarantees soundness, not this particular city - so if only the
 * authored seed passes, the guarantee is a coincidence and the next tweak will break it.
 */
for (const seed of ['district-07-alt', 'district-11', 'nightshift']) {
  const other = planFleet(createRng(seedFrom(seed)), FLEET, GRID);
  const otherAudit = auditFleet(other.fleet, other.evidence);
  check(
    `seed "${seed}" is sound as well`,
    otherAudit.sufficient && otherAudit.redundant.length === 0,
    `${otherAudit.survivors} survivor(s), ${otherAudit.redundant.length} redundant`
  );
}

console.log(failed === 0 ? '\nALL CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
