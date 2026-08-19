/**
 * Is stage one actually playable?
 *
 * Every number in lab.ts is a claim about the simulation - that a pit is crossable on a swing,
 * that a body is too fat for a gap until it splits, that a growth is out of reach until the
 * mass comes back. None of those can be settled by looking at the level, and all of them can
 * be settled by running it.
 *
 * So this drives the real `step` with scripted input and asserts what happens. It is the same
 * discipline as scripts/preview-stuck.ts: a level that stops being solvable should fail a
 * build, not a playtest.
 *
 * The swing test is the one that matters most and is the least obvious. It does not check
 * "did the player get across" against a hand-authored input sequence - a sequence tuned to
 * today's physics would pass forever and mean nothing. It pumps in time with the arc, the way
 * a player would, and asks whether that is ENOUGH.
 */

import { freshLab, THE_LAB } from '../src/m4ss/lab.js';
import {
  absorbTouching,
  centroid,
  components,
  loose,
  makeState,
  mass,
  minKeep,
  owned,
  reachOf,
  split,
  step,
  TUNING,
} from '../src/m4ss/mass.js';

import type { Anchor, MassState } from '../src/m4ss/mass.js';

const START_MASS = 40;

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures += 1;
  const tag = ok ? 'PASS' : 'FAIL';
  console.log(`  [${tag}] ${label}${detail ? ` - ${detail}` : ''}`);
}

/**
 * How tall a body of `count` actually stands, measured by settling one and looking.
 *
 * This replaced a formula. The analytic radius was derived from makeSlime's layout, which is
 * only the shape the body is BORN in - surface tension owns the shape it settles into, and
 * the two drifted apart the first time the tension was retuned. Measuring is slower by
 * milliseconds and cannot go stale.
 */
function settledHeight(count: number): number {
  const state = makeState(freshLab(), count);
  for (let i = 0; i < Math.round(1.5 / TUNING.dt); i++) step(state, IDLE);
  const ys = owned(state).map((p) => p.y);
  return Math.max(...ys) - Math.min(...ys);
}

function home(state: MassState): { x: number; y: number } {
  return centroid(owned(state));
}

/** The body's velocity in px/s, straight out of the verlet positions. */
function velocity(state: MassState): { x: number; y: number } {
  const mine = owned(state);
  if (mine.length === 0) return { x: 0, y: 0 };
  let vx = 0;
  let vy = 0;
  for (const p of mine) {
    vx += p.x - p.px;
    vy += p.y - p.py;
  }
  return { x: vx / mine.length / TUNING.dt, y: vy / mine.length / TUNING.dt };
}

/**
 * Run the sim for `seconds`, with input decided per frame.
 *
 * Mirrors the rig's loop exactly, including the absorb: M4SSRig calls absorbTouching every
 * frame Q is held, and that call is what actually re-owns recalled mass on contact. A
 * harness that passed `recall` without it watched loose mass fly home, bump the body, and
 * bounce off still loose - and its retry loops bled mass they thought they were recovering.
 */
function run(
  state: MassState,
  seconds: number,
  input: (s: MassState, t: number) => { move: -1 | 0 | 1; anchor: Anchor | null; recall: boolean }
): MassState {
  const steps = Math.round(seconds / TUNING.dt);
  for (let i = 0; i < steps; i++) {
    const frame = input(state, i * TUNING.dt);
    step(state, frame);
    if (frame.recall) absorbTouching(state);
  }
  return state;
}

const IDLE = { move: 0 as const, anchor: null, recall: false };

console.log('\n=== M4SS STAGE ONE ===\n');

// ---------------------------------------------------------------- the reach economy
{
  const state = makeState(freshLab(), START_MASS);
  const world = state.world;
  const [growth1, growth2] = world.anchors;

  // Settle it onto the floor first, so "where the player stands" is real rather than assumed.
  run(state, 1.2, () => IDLE);

  const full = reachOf(state);
  const ledgeEdge = { x: 290, y: home(state).y };
  const toGrowth1 = Math.hypot(growth1.x - ledgeEdge.x, growth1.y - ledgeEdge.y);
  check(
    'the first growth is reachable from the near ledge',
    toGrowth1 < full,
    `${toGrowth1.toFixed(0)}px away, reach ${full.toFixed(0)}px`
  );

  const underGrowth2 = { x: growth2.x, y: 600 };
  const toGrowth2 = Math.hypot(growth2.x - underGrowth2.x, growth2.y - underGrowth2.y);
  check(
    'the high growth is reachable on FULL mass',
    toGrowth2 < full,
    `${toGrowth2.toFixed(0)}px away, reach ${full.toFixed(0)}px`
  );

  /*
   * The load-bearing one. If a body that fits under the gate can also reach the high growth,
   * the whole second half of the stage collapses: there is no reason to press the button, no
   * reason to go back, and reconnecting becomes optional decoration.
   */
  const gate = world.gates[0];
  // The opening is the daylight UNDER the wall, not the wall's own height.
  const opening = 620 - (gate.y + gate.h);
  let fits = START_MASS;
  while (fits > 2 && settledHeight(fits) > opening - 6) fits -= 1;
  const fittedReach = fits * TUNING.reachPerMass;
  check(
    'a body small enough for the gap CANNOT reach the high growth',
    fittedReach < toGrowth2,
    `fits at mass ${fits} (reach ${fittedReach.toFixed(0)}px) vs ${toGrowth2.toFixed(0)}px needed`
  );
  const floor = minKeep(state);
  check(
    'the mass that fits the gap is above the 20% floor - the stage never demands an illegal split',
    fits >= floor,
    `fits at ${fits}, floor is ${floor}`
  );
  check(
    'the split needed to fit is within what the bar can give',
    1 - fits / START_MASS <= 0.8,
    `needs ${(100 - (fits / START_MASS) * 100).toFixed(0)}% shed, bar caps at 80%`
  );

  /*
   * The floor itself: however long Space is held, a split leaves at least 20% of the
   * starting body under the player's control. 0.95 asks for more than the floor allows,
   * which is exactly the request the clamp exists to refuse.
   */
  const greedy = makeState(freshLab(), START_MASS);
  run(greedy, 1.2, () => IDLE);
  split(greedy, 0.95);
  check(
    'a split can never take the body below 20% of start',
    mass(greedy) >= floor,
    `kept ${mass(greedy)}, floor ${floor}`
  );
}

// ---------------------------------------------------------------- can the pit be swung?
{
  const state = makeState(freshLab(), START_MASS);
  const growth = state.world.anchors[0];
  const world = state.world;
  const landing = world.tiles.find((t) => t.x === 480);
  if (!landing) throw new Error('the middle platform moved - update this check');

  /*
   * Attempted the way the game is designed to be played: swing, release, and if you drop
   * short the pit hands you back to try again. A single scripted attempt was abandoned here
   * for a reason worth keeping - particle ids are allocated across the whole process, so a
   * state built after other states iterates its contact pairs in a different order, and a
   * chaotic system turns that into a different trajectory. Any harness relying on one
   * attempt landing was green or red depending on which checks ran BEFORE it. The retry
   * loop is not a workaround; it is the game's actual loop.
   */
  let crossed = false;
  let attempts = 0;
  let swungFor = 0;
  while (!crossed && attempts < 6) {
    attempts += 1;
    // Walk to the lip (or back to it, after the pit returns the body), holding Q the whole
    // way - a failed swing leaves crumbs, and a player who has lost mass walks back for it.
    run(state, 8.0, (s) => ({ move: home(s).x < 240 ? 1 : 0, anchor: null, recall: true }));

    let released = false;
    let pumped = 0;
    let swingStart = -1;
    run(state, 10.0, (s, t) => {
      if (released) return IDLE;
      if (swingStart < 0) swingStart = t;
      const h = home(s);
      const v = velocity(s);
      // Let go once past the growth, still rising, and FAST - position alone is not enough
      // now that the lip is beyond any un-pumped swing, and speed is the thing pumping buys.
      if (s.attached && pumped >= 1.0 && h.x > growth.x + 30 && v.y < 0 && v.x > 430) {
        released = true;
        swungFor = t - swingStart;
        return IDLE;
      }
      /*
       * Pump the way a person on a swing does: push WITH your motion through the bottom of
       * the arc, where the tangent is horizontal and the push direction is unambiguous, and
       * coast everywhere else. From the dead hang the grip leaves you in, push anything
       * once to seed the motion. This took three broken strategies to find - velocity-sign
       * everywhere (parks the body at the three o'clock stall), spin-sign (reads inverted
       * and brakes), and only then this - worth knowing, because the player has to find it
       * too, and the finding is the mechanic.
       */
      /*
       * Pump CONTINUOUSLY. There is no coasting in this pendulum - drag kills a passive
       * swing inside two seconds - so the strategy is not "build amplitude, then wait for
       * the window": it is keep pumping and take the window when it opens. A budgeted
       * version of this harness pumped for N seconds, stopped, and watched every swing die
       * before the release condition could ever be met.
       */
      let move: -1 | 0 | 1 = 0;
      if (s.attached && h.y > growth.y + 40) {
        move = Math.abs(v.x) > 60 ? (v.x >= 0 ? 1 : -1) : 1;
        pumped += TUNING.dt;
      }
      return { move, anchor: growth, recall: false };
    });

    run(state, 2.5, () => IDLE);
    const c = home(state);
    crossed = c.x > landing.x && c.x < landing.x + landing.w && c.y < landing.y + 5;
  }
  const landed = home(state);
  check(
    'the pit can be crossed on the first growth',
    crossed,
    `attempt ${attempts}: ended at ${landed.x.toFixed(0)}, ${landed.y.toFixed(0)} (platform ${landing.x}..${landing.x + landing.w})`
  );
  check(
    'crossing does not cost the whole body',
    mass(state) > START_MASS * 0.55,
    `${mass(state)} of ${START_MASS} left`
  );
  /*
   * The swing has to be EARNED. The grip absorbs the latch lunge, so a body that grabs on
   * and does nothing hangs still for ever - crossing speed exists only while pumping is
   * putting it in. The release fires only past the growth, rising, above 430px/s, and the
   * time from latch to that moment is the price of the crossing. It is not a large number
   * of seconds; what matters is that it can never be zero, and that the lazy check below
   * shows what an unearned release gets you.
   */
  check(
    'the crossing takes real pumping - not one push',
    crossed && swungFor >= 1.0,
    `released after ${swungFor.toFixed(1)}s of swinging`
  );
  /*
   * The landing-shatter check. A flung body that arrives as several bodies is the bug this
   * exists to catch: regroup glue holds it together through flight and touchdown, and if
   * that ever regresses, this fails before a player feels it.
   */
  const pieces = components(owned(state)).length;
  check('the landed body is ONE piece', pieces === 1, `${pieces} piece${pieces === 1 ? '' : 's'}`);

  /*
   * And the inverse of the crossing: giving up early does not cross. Same growth, same
   * resonant pumping, but let go after 1.2 seconds - if that clears the pit, the pump is
   * too strong and the timing skill is gone.
   */
  const lazy = makeState(freshLab(), START_MASS);
  run(lazy, 2.0, () => ({ move: 1, anchor: null, recall: false }));
  const lazyGrowth = lazy.world.anchors[0];
  let lazyPumped = 0;
  run(lazy, 1.6, (s) => {
    const v = velocity(s);
    let move: -1 | 0 | 1 = 0;
    if (s.attached && home(s).y > lazyGrowth.y + 40) {
      move = Math.abs(v.x) > 60 ? (v.x >= 0 ? 1 : -1) : 1;
      lazyPumped += TUNING.dt;
    }
    return { move, anchor: lazyGrowth, recall: false };
  });
  run(lazy, 4.0, () => IDLE);
  check(
    'a lazy swing does NOT cross the pit',
    home(lazy).x < 410,
    `ended at ${home(lazy).x.toFixed(0)} - short of the far ledge`
  );
}

// ---------------------------------------------------------------- the pit gives mass back
{
  /*
   * Mass is the entire economy and nothing in a stage replaces it, so the void must not
   * eat it: anything that falls out of the world rejoins the main body where it stands.
   */
  const state = makeState(freshLab(), START_MASS);
  run(state, 1.2, () => IDLE);
  const some = owned(state).slice(0, 9);
  for (const p of some) {
    state.owned.delete(p.id);
    p.x = 380;
    p.px = 380;
    p.y = 700;
    p.py = 700;
  }
  run(state, 3.0, () => IDLE);
  check(
    'mass dropped into a pit returns to the body',
    mass(state) === START_MASS,
    `${mass(state)} of ${START_MASS} after the fall`
  );

  // And if the WHOLE body goes in, it stands back up at the start - the pit costs the
  // attempt, never the creature.
  const wholesale = makeState(freshLab(), START_MASS);
  run(wholesale, 1.2, () => IDLE);
  const wdx = 380 - home(wholesale).x;
  const wdy = 700 - home(wholesale).y;
  for (const p of wholesale.particles) {
    p.x += wdx;
    p.px += wdx;
    p.y += wdy;
    p.py += wdy;
  }
  run(wholesale, 3.0, () => IDLE);
  const back = home(wholesale);
  check(
    'a body lost whole to the pit respawns at the start',
    mass(wholesale) === START_MASS && back.x < 300,
    `mass ${mass(wholesale)} at ${back.x.toFixed(0)},${back.y.toFixed(0)}`
  );
}

// ---------------------------------------------------------------- a split comes apart
{
  /*
   * The stuck-blob regression. Cohesion and tension used to bind ANY two particles that
   * stood close enough, so a fresh split - shed half standing exactly where the cut left
   * it, against the player - welded the two bodies together, and driving away read as
   * "movement is blocked". Glue now stops at the ownership boundary: walk away and you
   * simply walk away, and what you shed does not follow.
   */
  const state = makeState(freshLab(), START_MASS);
  run(state, 1.2, () => IDLE);
  split(state, 0.5, 1);
  const shedBefore = centroid(loose(state));
  run(state, 3.0, () => ({ move: 1, anchor: null, recall: false }));
  const kept = home(state);
  const shed = centroid(loose(state));
  check(
    'after a split, the player walks away freely',
    kept.x - shed.x > 60,
    `kept body at ${kept.x.toFixed(0)}, shed at ${shed.x.toFixed(0)}`
  );
  check(
    'the shed mass stays where it was left',
    Math.abs(shed.x - shedBefore.x) < 25,
    `moved ${Math.abs(shed.x - shedBefore.x).toFixed(0)}px`
  );
}

// ---------------------------------------------------------------- the 360 and the fling
{
  /*
   * The final beat: resonate under the high growth, commit to one direction until the body
   * carries over the top, and release into the throw that clears the exit pit. The release
   * rule here is the window a player has to find - rightward and roughly level, at speed -
   * and the same run proves the circle itself is possible at post-stage mass.
   */
  const state = makeState(freshLab(), 34);
  const growth = state.world.anchors[1];

  // Retries for the same reason the pit crossing retries: the release window is real but
  // the trajectory is chaotic, and the game itself hands back a missed fling.
  let overEver = false;
  let landedOk = false;
  let tries = 0;
  while (!landedOk && tries < 6) {
    tries += 1;
    const dx = 1000 - home(state).x;
    const dy = 585 - home(state).y;
    for (const p of state.particles) {
      p.x += dx;
      p.px += dx;
      p.y += dy;
      p.py += dy;
    }
    run(state, 0.5, () => IDLE);

    let released = false;
    let pumped = 0;
    let overTop = false;
    run(state, 14.0, (s) => {
      if (released) return IDLE;
      const v = velocity(s);
      const h = home(s);
      if (s.attached && h.y < growth.y) overTop = true;
      // Release in the lower-right of the circle, rising rightward at speed - measured as
      // the window whose throw comes down on the shelf across the pit.
      if (
        overTop &&
        pumped >= 2.6 &&
        s.attached &&
        h.x > growth.x + 20 &&
        h.y > growth.y + 40 &&
        v.x > 430 &&
        v.y < -100
      ) {
        released = true;
        return IDLE;
      }
      // Bottom-arc pumping to seed the swing, then a held direction carries it over the top.
      let move: -1 | 0 | 1 = 0;
      if (s.attached && pumped < 2.6 && h.y > growth.y + 30) {
        move = Math.abs(v.x) > 60 ? (v.x >= 0 ? 1 : -1) : 1;
        pumped += TUNING.dt;
      } else if (s.attached && pumped >= 2.6) {
        move = 1;
      }
      return { move, anchor: growth, recall: false };
    });
    run(state, 2.5, () => IDLE);
    overEver = overEver || overTop;
    const e = home(state);
    landedOk = e.x > 1200 && e.x < 1262 && e.y > 585 && e.y < 625 && mass(state) >= 24;
  }
  const landed = home(state);
  check('the high growth can be swung over the top', overEver, overEver ? 'full circle' : 'never');
  check(
    'a committed circle flings the body onto the exit shelf',
    landedOk,
    `try ${tries}: ended at ${landed.x.toFixed(0)},${landed.y.toFixed(0)} with mass ${mass(state)}`
  );
}

// ---------------------------------------------------------------- gate, button, reconnect
{
  const state = makeState(freshLab(), START_MASS);
  const world = state.world;
  const gate = world.gates[0];
  const button = world.buttons[0];

  check('the gate starts shut', !gate.open && !button.pressed);

  // Teleport-free: put a small body on the far side by splitting and walking, which is the
  // route the player takes. Start it just west of the gap.
  const dx = 700 - home(state).x;
  const dy = 590 - home(state).y;
  for (const p of state.particles) {
    p.x += dx;
    p.px += dx;
    p.y += dy;
    p.py += dy;
  }
  run(state, 0.8, () => IDLE);
  // Shed 60%: kept 16 sits well under the measured fit ceiling of 23, and a bigger crawler
  // is a faster crawler - more of it grounded means more of it pushing.
  const shed = split(state, 0.6);
  check('splitting leaves mass behind', shed > 0 && mass(state) < START_MASS, `shed ${shed}`);

  // 35 seconds. A split body is slow - that slowness is most of why you want your mass back -
  // and under the wall it is slower still, so the budget errs long: this measures WHETHER it
  // gets there. Driving stops at the button, because past it the chamber now ends in the
  // exit pit and a body that keeps marching east walks straight into it.
  run(state, 35.0, (s) => ({ move: home(s).x < 880 ? 1 : 0, anchor: null, recall: false }));
  check(
    'a split body fits under the wall and reaches the button',
    button.pressed,
    button.pressed ? `body at ${home(state).x.toFixed(0)}` : `stuck at ${home(state).x.toFixed(0)}`
  );
  check('pressing the button opens the gate', gate.open);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED\n' : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
