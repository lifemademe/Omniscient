/**
 * Measure the thing the design is betting on.
 *
 * The pitch is "your reach is set by your mass". That is a claim about a curve, and a curve
 * can be plotted before anybody argues about how it feels. If mass barely changes reach, the
 * mechanic is decoration. If it changes it sharply, the game is a series of walls. If it
 * rises smoothly and legibly, there is a game in it.
 *
 * Nothing here renders. It runs the same sim play.html runs, at the same fixed step, and
 * writes what happened to frames.json for render.py to draw.
 */

import { writeFileSync } from 'node:fs';

import { freshLevel } from './level.mjs';
import {
  TUNING,
  absorbTouching,
  centroid,
  components,
  makeState,
  mass,
  split,
  step,
  strandedLumps,
} from './sim.mjs';

/** Seconds of simulation per attempt. Long enough to arrive, short enough to sweep. */
const ATTEMPT = 7;

/** The connected lump the player is actually standing in, ignoring anything torn off. */
function bulkOf(state) {
  const mine = state.particles.filter((p) => state.owned.has(p.id));
  const groups = components(mine);
  return groups.reduce((a, b) => (a.length >= b.length ? a : b), groups[0] ?? []);
}

/**
 * Hold a latch on an anchor `up` above the start and see whether the body gets there.
 *
 * Measured by the bulk's centre, not by counting particles near the anchor. That was the
 * first metric and it is quietly wrong: a 240-mass slime is about 78px across, so almost
 * none of it can ever be within 45px of a point, and every large slime scored as a failure
 * no matter what it did.
 */
function attempt(startMass, anchor, seconds = ATTEMPT) {
  const level = freshLevel();
  level.food = [];
  const state = makeState(level, startMass);
  for (let i = 0; i < 180; i++) step(state, { move: 0, anchor: null, recall: false });

  const steps = Math.round(seconds / TUNING.dt);
  for (let i = 0; i < steps; i++) step(state, { move: 0, anchor, recall: false });

  const bulk = bulkOf(state);
  const at = centroid(bulk);
  const radius = Math.sqrt(Math.max(1, bulk.length)) * TUNING.rest * 0.6;
  return {
    startMass,
    arrived: Math.hypot(at.x - anchor.x, at.y - anchor.y) < radius + 45,
    lost: startMass - bulk.length,
    lumps: strandedLumps(state).length,
  };
}

function heading(text) {
  console.log(`\n=== ${text} ${'='.repeat(Math.max(0, 56 - text.length))}`);
}

let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures += 1;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` - ${detail}` : ''}`);
}

// ---------------------------------------------------------------------------------------
heading('REACH AGAINST MASS');
console.log('  the claim the whole design rests on: how far you get is bought with mass\n');

const DISTANCES = [60, 120, 180, 240, 300, 380];
const MASSES = [30, 60, 100, 150, 220, 300];
const reaches = [];
console.log('     mass' + DISTANCES.map((d) => `${d}px`.padStart(7)).join('') + '     ceiling');
for (const m of MASSES) {
  const row = DISTANCES.map((d) => attempt(m, { x: 150, y: 560 - d }));
  let ceiling = 0;
  row.forEach((r, i) => {
    if (r.arrived) ceiling = DISTANCES[i];
  });
  reaches.push({ mass: m, ceiling });
  console.log(
    `  ${String(m).padStart(7)}` +
      row.map((r) => (r.arrived ? '   yes' : '    no').padStart(7)).join('') +
      `     ${ceiling}px`
  );
}

check(
  'a small slime cannot reach far',
  reaches[0].ceiling <= 60,
  `${reaches[0].mass} mass tops out at ${reaches[0].ceiling}px`
);
check(
  'a large one can',
  reaches[reaches.length - 1].ceiling >= 300,
  `${reaches[reaches.length - 1].mass} mass reaches ${reaches[reaches.length - 1].ceiling}px`
);
check(
  'reach never falls as mass rises',
  reaches.every((r, i) => i === 0 || r.ceiling >= reaches[i - 1].ceiling),
  reaches.map((r) => r.ceiling).join(' -> ')
);
check(
  'and the steps are ones a player could feel',
  new Set(reaches.map((r) => r.ceiling)).size >= 4,
  `${new Set(reaches.map((r) => r.ceiling)).size} distinct ceilings across ${reaches.length} sizes`
);

// ---------------------------------------------------------------------------------------
heading('THE COST OF OVERREACHING');
{
  const tooFar = attempt(60, { x: 150, y: 560 - 300 });
  const share = tooFar.lost / tooFar.startMass;
  console.log(
    `  60 mass at 300px: lost ${tooFar.lost} of 60 (${Math.round(share * 100)}%), ` +
      `left in ${tooFar.lumps} lump(s)`
  );
  check('a failed reach actually strands mass', tooFar.lost > 0);
  check('it is a cost, not a wipe', share > 0.05 && share < 0.5, `${Math.round(share * 100)}%`);
  check('and what is lost is left somewhere to go and get', tooFar.lumps > 0);
}

// ---------------------------------------------------------------------------------------
heading('MASS IS CONSERVED');
{
  const level = freshLevel();
  const state = makeState(level, 120);
  const before = state.particles.length;
  for (let i = 0; i < 300; i++) step(state, { move: 1, anchor: null, recall: false });
  const shed = split(state, 0.4);
  for (let i = 0; i < 300; i++) step(state, { move: -1, anchor: null, recall: false });
  const eaten = level.food.filter((f) => f.eaten).reduce((n, f) => n + f.mass, 0);
  console.log(`  started ${before}, ate ${eaten}, split off ${shed}, total ${state.particles.length}`);
  check(
    'no particle is ever created or destroyed',
    state.particles.length === before + eaten,
    `${state.particles.length} vs ${before + eaten}`
  );
  check('a split hands mass over rather than deleting it', mass(state) + shed <= state.particles.length);
  const back = absorbTouching(state);
  console.log(`  recalled ${back} on contact`);
}

// ---------------------------------------------------------------------------------------
heading('RECORDING');
{
  const level = freshLevel();
  const state = makeState(level, 45);
  const frames = [];
  const record = (note) =>
    frames.push({
      t: Number(state.time.toFixed(2)),
      note,
      mass: mass(state),
      reach: Math.round(mass(state) * TUNING.reachPerMass),
      owned: state.particles.filter((p) => state.owned.has(p.id)).map((p) => [Math.round(p.x), Math.round(p.y)]),
      loose: state.particles.filter((p) => !state.owned.has(p.id)).map((p) => [Math.round(p.x), Math.round(p.y)]),
      food: level.food.filter((f) => !f.eaten).map((f) => [f.x, f.y, f.mass]),
      tip: state.tip ? [Math.round(state.tip.x), Math.round(state.tip.y)] : null,
    });

  const run = (seconds, input, note) => {
    const steps = Math.round(seconds / TUNING.dt);
    for (let i = 0; i < steps; i++) step(state, input);
    record(note);
  };

  record('45 mass - reaches 81px');
  run(1.2, { move: 1, anchor: null, recall: false }, 'walking right');
  run(2.4, { move: 0, anchor: level.anchors[1], recall: false }, 'reaching the mid point at 45 mass');
  run(1.0, { move: 0, anchor: null, recall: false }, 'let go - mass left up there');
  run(2.6, { move: 1, anchor: null, recall: false }, 'eating');
  run(2.0, { move: 0, anchor: level.anchors[1], recall: false }, 'reaching again, bigger');
  writeFileSync(new URL('./frames.json', import.meta.url), JSON.stringify({ level, frames }));
  console.log(`  ${frames.length} frames -> frames.json`);
  for (const f of frames) console.log(`    ${String(f.t).padStart(5)}s  mass ${String(f.mass).padStart(3)}  reach ${String(f.reach).padStart(3)}px  ${f.note}`);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED\n' : `\n${failures} CHECK(S) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
