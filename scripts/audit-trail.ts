/**
 * Prove mission 08's breadcrumb trail before anything renders it.
 *
 * Phase three asks which SET of scattered fragments is one car going somewhere. For that
 * to be a question rather than a shrug, exactly one subset of the pool can be coherent -
 * and unlike the other two devices, that is not something construction alone guarantees,
 * because any decoy might accidentally extend a valid route.
 *
 * So this counts. Every subset of the pool is tried, the same way 256 of 16,384 pipe
 * arrangements were counted before a word of that mission was written. A puzzle whose
 * uniqueness is argued rather than counted is a puzzle nobody has checked.
 *
 *   npx tsx scripts/audit-trail.ts
 */

import { createRng, seedFrom } from '../src/omniscient/core/rng.js';
import { bestSets, isCoherent, planTrail } from '../src/omniscient/mission/breadcrumbs.js';
import { planPursuit } from '../src/omniscient/mission/pursuit.js';
import { planFleet } from '../src/omniscient/mission/traces.js';
import { wireCity } from '../src/omniscient/geometry/wireCity.js';

const SIZE = 24;

let failed = 0;
const check = (label: string, ok: boolean, detail = ''): void => {
  if (!ok) failed++;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` - ${detail}` : ''}`);
};

console.log('=== THE COLD TRAIL ===');

for (const seed of ['district-07', 'district-07-alt', 'district-11', 'nightshift']) {
  /**
   * Built through the same chain the game builds it through.
   *
   * The trail starts where the CHASE gave out, so testing it from a hand-picked cell would
   * be testing a situation the game never reaches. The pursuit audit learned this by
   * reporting zero hops for two rounds against a coordinate nothing used any more.
   */
  const rng = createRng(seedFrom(seed));
  const city = wireCity(rng, { size: SIZE });
  const fleet = planFleet(rng, 180, SIZE);
  const pursuit = planPursuit(rng, {
    cameras: city.cameras,
    start: fleet.suspect.cell,
    heading: fleet.evidence.heading ?? 'east',
    size: SIZE,
  });
  const trail = planTrail(rng, {
    from: pursuit.lost,
    heading: pursuit.lostHeading,
    size: SIZE,
  });

  const sets = bestSets(trail);
  console.log(
    `\n  "${seed}": trail from ${trail.from.x},${trail.from.y} heading ${trail.heading}, ` +
      `${trail.fragments.length} fragments, ${trail.chain.length} of them him`
  );

  check('  the pool has decoys in it', trail.fragments.length > trail.chain.length,
    `${trail.fragments.length - trail.chain.length} decoys`);
  check('  exactly one largest set of fragments is one car', sets.length === 1,
    `${sets.length} tied for largest`);
  check(
    '  and it is the authored chain',
    sets.length === 1 && [...sets[0]].sort().join() === [...trail.chain].sort().join()
  );
  check('  the authored chain is itself coherent', isCoherent(trail, trail.chain));

  /**
   * And no decoy may be swapped in.
   *
   * `coherentSets` already proves this by counting, but stating it separately means a
   * failure says WHICH decoy is really a second answer instead of only that the count was
   * two.
   */
  const impostors = trail.fragments
    .filter((fragment) => !trail.chain.includes(fragment.id))
    .filter((fragment) => isCoherent(trail, [...trail.chain, fragment.id]));
  check('  no decoy can be added to the real chain', impostors.length === 0,
    impostors.length ? impostors.map((f) => f.id).join(', ') : 'none');
}

console.log('\n  the reachability rule:');
const trail = planTrail(createRng(seedFrom('district-07')), {
  from: { x: 4, y: 12 },
  heading: 'east',
  size: SIZE,
});
check('  a lone nearby ping is not an answer', !isCoherent(trail, [trail.fragments[0].id]));
check('  an empty selection is not an answer', !isCoherent(trail, []));

console.log(failed === 0 ? '\nALL CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
