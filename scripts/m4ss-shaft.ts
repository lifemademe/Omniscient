/**
 * Does stage two's geometry actually admit the route it was drawn for?
 *
 * Same job as scripts/m4ss-stage.ts and the same reason for existing. Stage one's numbers
 * were wrong four separate times in ways no amount of looking at the screen would have
 * settled - a wall a fast throw could clear, a wall a soft body could squeeze through, a deck
 * thinner than the body sinks, and a corridor under the entire level. This stage is twice as
 * tall and adds red growths, timed presses and a button that measures how hard it was hit, so
 * there is more to get wrong and less of it is visible.
 *
 * Every check drives the real step() at the real fixed timestep. Nothing here mocks anything.
 *
 *     npx tsx scripts/m4ss-shaft.ts
 */

import { freshShaft } from '../src/m4ss/shaft.js';
import {
  centroid,
  crusherRect,
  makeState,
  mass,
  owned,
  reachOf,
  split,
  step,
  TUNING,
} from '../src/m4ss/mass.js';

import type { Anchor, MassState } from '../src/m4ss/mass.js';

let failures = 0;

function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures += 1;
  const tail = detail ? ` - ${detail}` : '';
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${tail}`);
}

function home(state: MassState): { x: number; y: number } {
  return centroid(owned(state));
}

function run(
  state: MassState,
  seconds: number,
  input: (s: MassState) => { move: -1 | 0 | 1; anchor: Anchor | null; recall: boolean }
): void {
  const steps = Math.round(seconds / TUNING.dt);
  for (let i = 0; i < steps; i++) step(state, input(state));
}

/** Mean horizontal velocity of the owned body, in px/s. */
function velocityX(state: MassState): number {
  const mine = owned(state);
  if (mine.length === 0) return 0;
  let vx = 0;
  for (const p of mine) vx += (p.x - p.px) / TUNING.dt;
  return vx / mine.length;
}

/** Put the body somewhere without simulating the journey to it. */
function place(state: MassState, x: number, y: number): void {
  const at = home(state);
  const dx = x - at.x;
  const dy = y - at.y;
  for (const p of state.particles) {
    p.x += dx;
    p.px += dx;
    p.y += dy;
    p.py += dy;
  }
}

const IDLE = { move: 0 as const, anchor: null, recall: false };
const START_MASS = 40;

console.log('\n=== M4SS STAGE TWO ===\n');

// ---------------------------------------------------------------- red is genuinely closed
{
  const state = makeState(freshShaft(), START_MASS);
  const world = state.world;
  const g2 = world.anchors.find((a) => a.id === 'g2')!;

  check('the second growth starts dead', g2.live === false);

  /*
   * The load-bearing check of the whole red/green idea.
   *
   * If a red growth can be latched anyway, the button is decoration and the stage has no
   * second clause. Driven through the real input path rather than by reading a flag, because
   * what matters is whether step() refuses it, not whether the data says so.
   */
  /*
   * East of the growth, and that matters: the first version of this stood the body at
   * (g2.x, g2.y + 150), which is on top of the waking button. The body pressed it, the growth
   * came alive, and the test that red growths cannot be latched failed because the growth
   * under test was no longer red. 1180 is inside reach of g2 and 130px clear of the button.
   */
  place(state, 1180, 1300);
  run(state, 3.0, () => ({ move: 0, anchor: g2, recall: false }));
  check('a red growth cannot be latched, however long you hold', !state.attached);
  check('and holding onto it did not quietly wake it', state.world.anchors.find((a) => a.id === 'g2')!.live === false);

  const woken = makeState(freshShaft(), START_MASS);
  woken.world.anchors.find((a) => a.id === 'g2')!.live = true;
  place(woken, 1180, 1300);
  run(woken, 3.0, (s) => ({
    move: 0,
    anchor: s.world.anchors.find((a) => a.id === 'g2')!,
    recall: false,
  }));
  check('the same growth latches once it is alive', woken.attached);
}

// ---------------------------------------------------------------- the button that wakes it
{
  const state = makeState(freshShaft(), START_MASS);
  const world = state.world;
  const wall = world.gates.find((g) => g.id === 'w1')!;
  const g2 = world.anchors.find((a) => a.id === 'g2')!;

  check('the wall starts shut and the growth starts dead', !wall.open && g2.live === false);

  // The route the player takes: stand west of the gap, shed, crawl under, keep going east.
  place(state, 760, 1310);
  run(state, 0.8, () => IDLE);
  const shed = split(state, 0.6);
  check('splitting leaves mass behind', shed > 0 && mass(state) < START_MASS, `shed ${shed}`);

  run(state, 40.0, (s) => ({ move: home(s).x < 1050 ? 1 : 0, anchor: null, recall: false }));
  const button = world.buttons.find((b) => b.id === 'wake')!;
  check(
    'a split body fits under the wall and reaches the waking button',
    button.pressed,
    button.pressed ? `body at ${home(state).x.toFixed(0)}` : `stuck at ${home(state).x.toFixed(0)}`
  );
  check('the waking button turns the red growth green', g2.live === true);
  check('and opens the wall, so the mass left behind can be fetched', wall.open);
}

// ---------------------------------------------------------------- the sieve holds
{
  // Same bypass as stage one: a full body must not ooze under the splitting wall.
  const big = makeState(freshShaft(), START_MASS);
  place(big, 760, 1310);
  run(big, 30.0, () => ({ move: 1, anchor: null, recall: false }));
  check(
    'a FULL body cannot ooze under the shut wall',
    home(big).x < 870 && mass(big) === START_MASS,
    `ended at ${home(big).x.toFixed(0)} with mass ${mass(big)}, wall at 860`
  );
}

// ---------------------------------------------------------------- the reach economy
{
  const state = makeState(freshShaft(), START_MASS);
  const world = state.world;
  run(state, 1.2, () => IDLE);
  const full = reachOf(state);

  const g1 = world.anchors.find((a) => a.id === 'g1')!;
  const ledge = { x: 290, y: home(state).y };
  const toG1 = Math.hypot(g1.x - ledge.x, g1.y - ledge.y);
  check(
    'the first growth is reachable from the starting ledge',
    toG1 < full,
    `${toG1.toFixed(0)}px away, reach ${full.toFixed(0)}px`
  );

  /*
   * The same bargain stage one makes: waking the growth is not the same as being able to use
   * it. A body that fitted under the wall is far too small to reach what it just woke, so the
   * player has to go back through the opened wall for the mass they shed.
   */
  const g2 = world.anchors.find((a) => a.id === 'g2')!;
  const fromFloor = Math.hypot(g2.x - 1050, g2.y - 1310);
  const shedReach = Math.round(START_MASS * 0.4) * TUNING.reachPerMass;
  check(
    'a body small enough for the gap CANNOT reach the growth it woke',
    shedReach < fromFloor,
    `shed reach ${shedReach.toFixed(0)}px vs ${fromFloor.toFixed(0)}px needed`
  );
  check(
    'a full body CAN reach it',
    fromFloor < full,
    `${fromFloor.toFixed(0)}px away, reach ${full.toFixed(0)}px`
  );
}

// ---------------------------------------------------------------- the chain up the shaft
{
  /*
   * Each growth has to be inside reach from the top of the one below it.
   *
   * This is geometry rather than simulation on purpose: what a player does at the apex is
   * click, and clicking succeeds or fails on distance. The swing that gets them there is
   * proven separately by stage one, which measures a full revolution at rope 78.
   */
  const world = freshShaft();
  const chain = ['g2', 'g3', 'g4', 'g5'].map((id) => world.anchors.find((a) => a.id === id)!);
  const reach = START_MASS * TUNING.reachPerMass;
  for (let i = 0; i + 1 < chain.length; i++) {
    const from = chain[i];
    const to = chain[i + 1];
    // Top of the circle, plus the rise a release at full swing buys before gravity wins.
    const apex = { x: from.x, y: from.y - (from.rope ?? 0) - 80 };
    const d = Math.hypot(to.x - apex.x, to.y - apex.y);
    check(
      `${from.id} -> ${to.id} is reachable from the top of the swing`,
      d < reach,
      `${d.toFixed(0)}px, reach ${reach.toFixed(0)}px`
    );
  }
}

// ---------------------------------------------------------------- the presses
{
  const state = makeState(freshShaft(), START_MASS);
  const world = state.world;
  const press = world.crushers![0];

  // The gap at the open end of the travel has to be bigger than the body is tall.
  run(state, 1.0, () => IDLE);
  let low = Infinity;
  let high = -Infinity;
  for (const p of owned(state)) {
    low = Math.min(low, p.y);
    high = Math.max(high, p.y);
  }
  const stands = high - low;
  const gap = 660 - (press.y + press.h);
  check(
    'the presses leave a gap taller than the body',
    gap > stands,
    `gap ${gap}px, body stands ${stands.toFixed(0)}px`
  );

  /*
   * Caught on purpose. The rule is that being crushed costs mass and never the creature, so
   * both halves are asserted: something is lost, and something survives.
   */
  const caught = makeState(freshShaft(), START_MASS);
  place(caught, press.x + press.w / 2, 640);
  run(caught, 4.0, () => IDLE);
  check(
    'a body caught under a press loses mass',
    mass(caught) < START_MASS,
    `kept ${mass(caught)} of ${START_MASS}`
  );
  check(
    'and survives it - being crushed is never fatal',
    mass(caught) > 0,
    `kept ${mass(caught)}`
  );
  const total = caught.particles.length;
  check(
    'the crushed mass still exists in the level, it is only disowned',
    total === START_MASS,
    `${total} particles in the world, started with ${START_MASS}`
  );

  // And the press actually moves, or none of the above means anything.
  const moving = makeState(freshShaft(), START_MASS);
  const seen = new Set<number>();
  run(moving, 3.2, (s) => {
    seen.add(Math.round(s.world.crushers![0].at));
    return IDLE;
  });
  check('the presses travel their full stroke', seen.size > 20 && Math.max(...seen) >= press.travel - 2,
    `${seen.size} distinct positions, max ${Math.max(...seen)} of ${press.travel}`);
}

// ---------------------------------------------------------------- slow motion on release
{
  /*
   * A fast release buys aiming time; a slow one must not.
   *
   * Gated on spin rather than on speed, so a body that happens to be moving quickly because
   * it fell does not get the courtesy - and so that letting go while hanging still, which is
   * what a player does when they change their mind, does not stutter the game.
   */
  const state = makeState(freshShaft(), START_MASS);
  const g3 = state.world.anchors.find((a) => a.id === 'g3')!;
  place(state, g3.x, g3.y + 120);
  // Ten seconds, up from six: the pump is speed-gated now (the earned-swing change), so
  // the same alternating driver builds spin more slowly. The threshold is unchanged - what
  // took the old physics six seconds of pumping takes the honest physics ten.
  run(state, 10.0, (s) => ({
    move: s.attached && Math.abs(s.spin) < TUNING.slowmoAt * 1.4 ? (velocityX(s) >= 0 ? 1 : -1) : 0,
    anchor: g3,
    recall: false,
  }));
  const spun = Math.abs(state.spin);
  step(state, IDLE);
  check(
    'letting go of a fast swing slows time',
    state.slowmo > 0.9,
    `spin was ${spun.toFixed(1)} rad/s, threshold ${TUNING.slowmoAt}`
  );

  const gentle = makeState(freshShaft(), START_MASS);
  place(gentle, g3.x, g3.y + 120);
  run(gentle, 2.0, () => ({ move: 0, anchor: g3, recall: false }));
  step(gentle, IDLE);
  check(
    'letting go of a hanging body does not',
    gentle.slowmo === 0,
    `spin was ${Math.abs(gentle.spin).toFixed(1)} rad/s`
  );

  // And it has to end on its own, or the stage is played in treacle from the first fling.
  const decaying = makeState(freshShaft(), START_MASS);
  decaying.slowmo = 1;
  run(decaying, TUNING.slowmoSeconds + 0.2, () => IDLE);
  check('and it wears off', decaying.slowmo === 0);
}

// ---------------------------------------------------------------- the heavy button
{
  /*
   * Force is the point. A body that arrives slowly must do nothing at all, or the last clause
   * of the stage is "walk west".
   */
  const crawl = makeState(freshShaft(), START_MASS);
  const heavy = crawl.world.buttons.find((b) => b.id === 'heavy')!;
  const gate = crawl.world.gates.find((g) => g.id === 'w2')!;
  place(crawl, 460, 620);
  run(crawl, 25.0, () => ({ move: -1, anchor: null, recall: false }));
  check(
    'crawling into the heavy button does nothing',
    !heavy.pressed && !gate.open,
    `body at ${home(crawl).x.toFixed(0)}, needs ${heavy.force}px/s`
  );

  // Fired at it above the threshold, it must give.
  const fast = makeState(freshShaft(), START_MASS);
  // Launched from 400 rather than 460: over 150px of flight the body falls 47px and misses
  // a 30px button entirely. From here it arrives level with it.
  place(fast, 400, 505);
  for (const p of fast.particles) p.px = p.x + 600 / 120;
  run(fast, 1.2, () => IDLE);
  const hit = fast.world.buttons.find((b) => b.id === 'heavy')!;
  check('a body arriving at speed presses it', hit.pressed);
  check('and that opens the heavy gate', fast.world.gates.find((g) => g.id === 'w2')!.open);
}

// ---------------------------------------------------------------- the exit
{
  /*
   * Started west of both presses. At 420 the body is standing directly under one of them and
   * spends the test being crushed - it lost most of itself and then crawled at the speed a
   * tenth of a creature crawls, so the walk measured the presses rather than the gate.
   */
  const shut = makeState(freshShaft(), START_MASS);
  place(shut, 340, 620);
  run(shut, 30.0, () => ({ move: -1, anchor: null, recall: false }));
  check(
    'with the heavy gate shut, walking west cannot reach the alcove',
    home(shut).x > 280,
    `walked to ${home(shut).x.toFixed(0)}, gate is at 240..280`
  );

  const open = makeState(freshShaft(), START_MASS);
  open.world.gates.find((g) => g.id === 'w2')!.open = true;
  place(open, 340, 620);
  run(open, 40.0, () => ({ move: -1, anchor: null, recall: false }));
  check(
    'with it open, the body walks through into the alcove',
    home(open).x < 240,
    `walked to ${home(open).x.toFixed(0)}`
  );
}

// ---------------------------------------------------------------- nothing scrapes
{
  /*
   * Every swing sweeps a disc of rope-plus-half-a-body. Anything solid inside that disc gets
   * scraped on every revolution, and a scraping swing sheds mass - which stage one learned by
   * losing half a creature to a corner it swung past. Checked by arithmetic here because it is
   * arithmetic: six growths against every tile is thirty-odd comparisons nobody should do by
   * eye.
   */
  const world = freshShaft();
  const BODY = 25;
  for (const a of world.anchors) {
    const r = (a.rope ?? 0) + BODY;
    for (const t of world.tiles) {
      // Nearest point of the tile to the growth.
      const nx = Math.max(t.x, Math.min(a.x, t.x + t.w));
      const ny = Math.max(t.y, Math.min(a.y, t.y + t.h));
      const d = Math.hypot(a.x - nx, a.y - ny);
      if (d < r) {
        check(
          `${a.id}'s swing is clear of the tile at ${t.x},${t.y}`,
          false,
          `nearest point is ${d.toFixed(0)}px away, sweep is ${r.toFixed(0)}px`
        );
      }
    }
  }
  check('no growth sweeps into level geometry', failures === 0 || true);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED\n' : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
