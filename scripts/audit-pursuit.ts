/**
 * Prove mission 08's camera chase before anything renders it.
 *
 * Phase two asks the player to predict which camera picks the car up next. For that to be
 * a deduction rather than a coin flip, two things have to hold at every hop:
 *
 *   ONE ANSWER   - exactly one offered camera is consistent with the last sighting.
 *   HONEST DECOYS - every other option fails for the single reason it claims to, so a
 *                   wrong pick can be answered with a sentence instead of a buzzer.
 *
 * A hop with two consistent cameras is a coin flip wearing a deduction's clothes. A hop
 * with one option is not a question at all. Both are invisible by inspection and obvious
 * to a loop, which is what this is.
 *
 * Audited across several districts, not just the shipped one: the guarantee is supposed to
 * come from the construction, and if only the authored seed passes then it is a
 * coincidence and the next change will break it. That check caught a real bug on the trace
 * board the first time it ran.
 *
 *   npx tsx scripts/audit-pursuit.ts
 */

import { createRng, seedFrom } from '../src/omniscient/core/rng.js';
import { wireCity } from '../src/omniscient/geometry/wireCity.js';
import { auditPursuit, classify, planPursuit } from '../src/omniscient/mission/pursuit.js';
import { planFleet } from '../src/omniscient/mission/traces.js';
import { FEED_COLOURS, renderFeed } from '../src/omniscient/art/asciiFeed.js';

const SIZE = 24;

let failed = 0;
const check = (label: string, ok: boolean, detail = ''): void => {
  if (!ok) failed++;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` - ${detail}` : ''}`);
};

console.log('=== THE CHASE THROUGH DISTRICT 07 ===');

for (const seed of ['district-07', 'district-07-alt', 'district-11', 'nightshift']) {
  const rng = createRng(seedFrom(seed));
  const city = wireCity(rng, { size: SIZE });
  /**
   * The chase starts where the SUSPECT is, taken from the fleet rather than retyped.
   *
   * It was a hand-copied literal here, so moving the suspect west to give the pursuit a
   * district to cross changed nothing this script could see and it went on reporting zero
   * hops against a position the game no longer used. Two copies of a coordinate is the
   * same bug as two copies of a colour, and it hides for exactly as long.
   */
  const { suspect, evidence } = planFleet(rng, 180, SIZE);
  const pursuit = planPursuit(rng, {
    cameras: city.cameras,
    start: suspect.cell,
    heading: evidence.heading ?? 'east',
    size: SIZE,
  });
  const audit = auditPursuit(pursuit);

  console.log(
    `\n  "${seed}": ${city.cameras.length} cameras, ${audit.hops} hops, ` +
      `trail ends at ${pursuit.lost.x},${pursuit.lost.y} heading ${pursuit.lostHeading}`
  );

  check(`  the chase has hops to play`, audit.hops >= 1, `${audit.hops}`);
  check(
    `  every hop has exactly one consistent camera`,
    audit.singleAnswer === audit.hops,
    `${audit.singleAnswer} of ${audit.hops}`
  );
  check(
    `  every decoy fails the way it claims`,
    audit.honestDecoys === audit.hops,
    `${audit.honestDecoys} of ${audit.hops}`
  );
  check(`  no hop is a single option`, audit.thin === 0, `${audit.thin} thin`);

  /**
   * The trail must actually run out.
   *
   * Phase three exists because coverage thins at the district edge, which the city
   * generator does on purpose. If a chase ever ran to the hop limit with cameras still
   * available, the breadcrumb phase would never be reached and a whole third of the
   * mission would be unreachable content.
   */
  check(
    `  the trail goes cold because the network ran out`,
    pursuit.ranDry,
    pursuit.ranDry
      ? `${pursuit.hops.length} hops, then no camera ahead`
      : `hit the hop cap after ${pursuit.hops.length} - the chase was interrupted, not ended`
  );
}

/**
 * The classifier itself, on cases chosen by hand.
 *
 * `auditPursuit` uses `classify` to check the hops, so if the classifier is wrong the
 * audit agrees with it and both are wrong together. These are the cases that pin it down
 * independently.
 */
console.log('\n  the classifier:');
const from = { x: 10, y: 10 };
check(
  '  straight ahead and reachable is the answer',
  classify(from, 'east', 6, { x: 16, y: 10 }) === null
);
check('  back the way it came is behind', classify(from, 'east', 6, { x: 6, y: 10 }) === 'behind');
check(
  '  too far for the time is unreachable',
  classify(from, 'east', 6, { x: 23, y: 10 }) === 'unreachable'
);
check(
  '  three streets over is off-route',
  classify(from, 'east', 6, { x: 14, y: 13 }) === 'off-route'
);
check(
  '  one street over is still on the road',
  classify(from, 'east', 6, { x: 14, y: 11 }) === null
);

/*
 * ---------------------------------------------------------------- the camera feed
 *
 * The feed exists so a player can look THROUGH a camera before choosing it, and the whole
 * mission dies if it shows them the answer. `hiddenTruth` says the car "is found by
 * narrowing, not by searching"; a pre-commit picture with the suspect in it turns three
 * hops of inference into "pick the one with the car". So the guarantee is not a convention
 * to be remembered - it is checked here, at every option of every hop.
 */
console.log('\n=== THE CAMERA FEED ===');
{
  const rng2 = createRng(seedFrom('district-07'));
  const city2 = wireCity(rng2, { size: SIZE });
  const fleet2 = planFleet(rng2, 180, SIZE);
  const chase2 = planPursuit(rng2, {
    cameras: city2.cameras,
    start: fleet2.suspect.cell,
    heading: fleet2.evidence.heading ?? 'east',
    size: SIZE,
  });

  const showsSuspect = (rows: ReturnType<typeof renderFeed>): boolean =>
    rows.some((row) => row.some((cell) => cell.colour === FEED_COLOURS.suspect));

  let leaked = 0;
  let drew = 0;
  let options = 0;
  for (const hop of chase2.hops) {
    for (const option of hop.options) {
      options += 1;
      // Exactly how BoardPanel calls it: no suspect argument, ever.
      const rows = renderFeed(city2, option.cell, { clock: 1.5, label: 'CAM', since: hop.seconds });
      if (showsSuspect(rows)) leaked += 1;
      const ink = rows.reduce((n, row) => n + row.filter((cell) => cell.ch !== ' ').length, 0);
      if (ink > 200) drew += 1;
    }
  }
  check(
    'no pre-commit feed ever shows the suspect',
    leaked === 0,
    `${options} camera views rendered, ${leaked} leaked`
  );
  check(
    'every camera view actually draws a street',
    drew === options,
    `${drew} of ${options} drew more than 200 glyphs`
  );

  const shown = renderFeed(city2, chase2.hops[0].options[0].cell, {
    clock: 1.5,
    suspect: 0.6,
    label: 'CAM',
    since: 4,
  });
  check('the post-commit feed can show the suspect', showsSuspect(shown));

  /*
   * The review sweeps the suspect from the vanishing point to the near kerb over about a
   * second and a third, so he has to be ON SCREEN for the whole drive - a perspective
   * change that put him behind the header strip or off the bottom edge for part of it would
   * turn the mission's best moment into a flicker, and nothing else would fail.
   */
  let onScreen = 0;
  const frames = 11;
  for (let i = 0; i < frames; i++) {
    const rows = renderFeed(city2, chase2.hops[0].options[0].cell, {
      clock: 1 + i * 0.125,
      suspect: i / (frames - 1),
      label: 'CAM',
    });
    if (showsSuspect(rows)) onScreen += 1;
  }
  check(
    'the suspect stays in frame for the whole crossing',
    onScreen === frames,
    `${onScreen} of ${frames} frames`
  );

  /*
   * And it has to be visible from EVERY camera the player could have picked, not just one.
   *
   * The renderer hides a car when a building stands between it and the lens, which is right
   * - a feed that saw round corners would be telling the player the opposite of what this
   * mission is about. But it means a badly placed camera can show an empty street on a
   * CORRECT pick, and the review would then contradict the verdict the runtime is about to
   * give. That is a silent content bug of exactly the kind district-07 keeps warning about:
   * nothing throws, the picture is simply wrong.
   */
  let clear = 0;
  let checked = 0;
  for (const hop of chase2.hops) {
    for (const option of hop.options) {
      checked += 1;
      let seen = 0;
      for (let i = 0; i < frames; i++) {
        const rows = renderFeed(city2, option.cell, {
          clock: 1 + i * 0.125,
          suspect: i / (frames - 1),
          label: 'CAM',
        });
        if (showsSuspect(rows)) seen += 1;
      }
      if (seen >= frames - 2) clear += 1;
    }
  }
  check(
    'the car is visible from every camera it could be reviewed at',
    clear === checked,
    `${clear} of ${checked} cameras have a clear line down the street`
  );

  const dead = renderFeed(city2, { x: 0, y: 0 }, { clock: 1, dead: true, label: 'CAM' });
  const deadText = dead.map((row) => row.map((cell) => cell.ch).join('')).join('');
  check('a camera with no coverage reads NO SIGNAL', deadText.includes('NO SIGNAL'));
}

console.log(failed === 0 ? '\nALL CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
