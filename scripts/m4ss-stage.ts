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
import { teardrop } from '../src/m4ss/swingShape.js';
import {
  absorbTouching,
  centroid,
  components,
  gateSolid,
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

/**
 * How many blobs the SCREEN shows, as opposed to how many the physics counts.
 *
 * components() clusters at linkRange (15px), which is the right question for cohesion and
 * the wrong one for "did the creature visibly tear": the metaball surface unions field
 * points out to roughly a body-radius beyond their centres, so two physics-components a
 * few pixels past linkRange still DRAW as one silhouette. 26px is the measured gap at
 * which the rendered surface actually pinches into two shapes.
 */
function visualPieces(group: ReturnType<typeof owned>): number {
  const RANGE = 26;
  const unseen = new Set(group);
  let clusters = 0;
  while (unseen.size > 0) {
    clusters += 1;
    const seed = unseen.values().next().value!;
    const queue = [seed];
    unseen.delete(seed);
    while (queue.length > 0) {
      const p = queue.pop()!;
      for (const q of [...unseen]) {
        if (Math.hypot(p.x - q.x, p.y - q.y) <= RANGE) {
          unseen.delete(q);
          queue.push(q);
        }
      }
    }
  }
  return clusters;
}

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
  /*
   * What fits is now STATED, not measured: the gate is a mass sieve and `sieve` is the
   * ceiling. It used to be derived from settled height against the gap, and that derivation
   * is the one this stage's biggest bypass hid behind - a crawling body flattens to ~15px
   * whatever its mass, so the height arithmetic said 23 while the actual door let 40
   * through. The sieve makes the design number the enforced number.
   */
  const fits = gate.sieve!;
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
       * The other legitimate crossing: a swing big enough to carry the body over the lip
       * WHILE attached, stepping off onto the far ledge. The spin-stiffened body made this
       * reachable, and it is good play - a huge swing you ride out is as earned as a
       * fling. It still has to cost the pumping time, so the clock stops here too.
       */
      if (s.attached && h.x > 480 && h.y > 590 && v.y >= 0) {
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
    `crossing cost ${swungFor.toFixed(1)}s on the rope`
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
  /*
   * The FREE crossing must not exist: latch on, pump NOTHING, and let go - whatever the
   * release phase, the body must come home. This is gripAbsorb's contract stated as a
   * check. It used to be a "lazy pumping" budget (1.6s, then 0.9s of driver pumping), and
   * that version measured nothing: the driver pumps with frame-perfect alignment, which
   * builds full swing speed inside a second - superhuman effort dressed as laziness. The
   * skill floor the game actually promises is that grabbing on costs you your arrival
   * speed, and speed exists only while pumping is putting it in; the dead-hang check
   * above guards the held-key exploit, and this guards the grab itself.
   */
  const lazy = makeState(freshLab(), START_MASS);
  run(lazy, 2.0, () => ({ move: 1, anchor: null, recall: false }));
  const lazyGrowth = lazy.world.anchors[0];
  run(lazy, 2.5, () => ({ move: 0, anchor: lazyGrowth, recall: false }));
  run(lazy, 4.0, () => IDLE);
  check(
    'an unpumped latch-and-release does NOT cross the pit',
    home(lazy).x < 410,
    `ended at ${home(lazy).x.toFixed(0)} - the grab absorbed the arrival`
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
  // 1.6s, down from 3.0: the crawl was raised to 4300 on playtest feedback, and three
  // seconds now carries the body clean off the starting ledge into the pit - whose
  // handback then teleports it right back beside the shed, which is what this check
  // exists to say must NOT happen by welding. Distance walked is the assertion, not time.
  run(state, 1.6, () => ({ move: 1, anchor: null, recall: false }));
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
  /*
   * Piece-counting rides on the SAME driver that lands the fling, every frame: crumbs shed
   * off the trailing edge mid-revolution and a fling arriving as several bodies were both
   * reported from play, and a fence that checks only the settled result misses everything
   * the player actually saw. Only the landing attempt counts - a try whose release misses
   * ends in the pit, and the pit return teleport is not a tear.
   */
  let worstSwinging = 1;
  let worstFlying = 1;
  while (!landedOk && tries < 8) {
    tries += 1;
    worstSwinging = 1;
    worstFlying = 1;
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
    let attachedFor = 0;
    run(state, 14.0, (s) => {
      const pieces = visualPieces(owned(s));
      /*
       * Counted only once the grip has settled. The lunge arrives strung out along the
       * tendril and the grab-shape gathers it over a few frames - during that gather the
       * component count reads 2-3 while the SCREEN shows one silhouette, because the render
       * unions the arm into the body. The fence starts where the player's eye does: on the
       * hanging, swinging creature.
       */
      attachedFor = s.attached ? attachedFor + TUNING.dt : 0;
      /*
       * 0.75s of grace, measured, not guessed: catching a body that is ALREADY circling at
       * seven radians a second - a re-latch mid-flight, which is stage two's whole chain
       * mechanic - stretches it along the tendril and the gather takes about 0.6s at that
       * speed. During the gather the tendril arm renders body and crumbs as one connected
       * silhouette, so the screen never shows a tear; the fence starts where the gathered
       * swing does.
       */
      if (attachedFor > 0.75 && pieces > 1) {
        console.log(`    TEAR attachedFor=${attachedFor.toFixed(2)} spin=${s.spin.toFixed(1)} visual=${pieces}`);
      }
      if (attachedFor > 0.75) worstSwinging = Math.max(worstSwinging, pieces);
      if (released) {
        // Stop counting once the body has dropped into a pit: what follows is the fall
        // and the pit-return TELEPORT, which scatters particles by design and is not a
        // tear anyone sees as one - the veil of the respawn is the start of a new attempt.
        if (home(s).y < 660) worstFlying = Math.max(worstFlying, visualPieces(owned(s)));
        return IDLE;
      }
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
      /*
       * Push WITH the velocity, always. Under the speed-gated pump this is the one
       * strategy that both builds AND sustains a revolution: with-motion pushes are full
       * strength at any loop phase, while the old "commit to one direction" strategy
       * brakes every backswing at full force and stalls below the crest - measured, its
       * best window speed fell from 800px/s to 13. The player's version of this is
       * pumping in time with the swing and keeping the rhythm through the circle, which
       * is exactly the skill the redesign asked for.
       */
      let move: -1 | 0 | 1 = 0;
      if (s.attached && h.y > growth.y - 20) {
        move = Math.abs(v.x) > 60 ? (v.x >= 0 ? 1 : -1) : 1;
        pumped += TUNING.dt;
      }
      return { move, anchor: growth, recall: false };
    });
    run(state, 3.5, (s) => {
      if (released && home(s).y < 660) worstFlying = Math.max(worstFlying, visualPieces(owned(s)));
      return IDLE;
    });
    overEver = overEver || overTop;
    const e = home(state);
    landedOk = e.x > 1185 && e.x < 1262 && e.y > 585 && e.y < 625 && mass(state) >= 24;
  }
  const landed = home(state);
  check('the high growth can be swung over the top', overEver, overEver ? 'full circle' : 'never');
  /*
   * The finale is the throw again. The drawbridge and its button were built, played, and
   * cut - the playtest verdict was that a wall in front of the portal read as one beat too
   * many, and the committed circle IS the test. The fling lands on the exit shelf and the
   * portal is right there: arrival is the ending.
   */
  check(
    'a committed circle flings the body onto the exit shelf',
    landedOk,
    `try ${tries}: ended at ${landed.x.toFixed(0)},${landed.y.toFixed(0)} with mass ${mass(state)}`
  );
  check(
    'the body stays ONE piece through the whole revolution',
    worstSwinging === 1,
    `worst frame on the rope had ${worstSwinging} piece(s)`
  );
  check(
    'and ONE piece through the whole fling, flight and landing',
    worstFlying === 1,
    `worst frame in the air had ${worstFlying} piece(s)`
  );
}

// ---------------------------------------------------------------- the swing is earned
{
  /*
   * Holding one direction from a dead hang must go NOWHERE.
   *
   * The pump used to be a constant tangential force of 1600 against gravity's 1500 -
   * greater torque than gravity at every point of the circle, so leaning on D carried the
   * body over the top from a standstill with zero alternations. The playtest verdict was
   * blunt: the 360 was a button. The pump is speed-gated now (quarter strength while the
   * body hangs near-still), and this drives a full ten seconds of held D to prove the guard
   * holds: the body may lean and slosh, it must never crest the growth.
   */
  const held = makeState(freshLab(), 34);
  const growth = held.world.anchors[1];
  const dx = 1000 - home(held).x;
  const dy = 585 - home(held).y;
  for (const p of held.particles) {
    p.x += dx;
    p.px += dx;
    p.y += dy;
    p.py += dy;
  }
  run(held, 0.5, () => IDLE);
  let crested = false;
  run(held, 10.0, (s) => {
    if (s.attached && home(s).y < growth.y) crested = true;
    return { move: 1, anchor: growth, recall: false };
  });
  check('holding one direction from a dead hang never circles', !crested);


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
  /*
   * Driven to 960, because the button moved to 940 and this still said 880.
   *
   * The body dutifully stopped sixty pixels short of the thing the check was about and the
   * failure read as "a split body cannot fit under the wall". It fits fine; it was told to
   * stop. Past the button the chamber ends in the exit pit, which is the reason there is a
   * stopping point at all.
   */
  run(state, 45.0, (s) => ({ move: home(s).x < 960 ? 1 : 0, anchor: null, recall: false }));
  check(
    'a split body fits under the wall and reaches the button',
    button.pressed,
    button.pressed ? `body at ${home(state).x.toFixed(0)}` : `stuck at ${home(state).x.toFixed(0)}`
  );
  check('pressing the button opens the gate', gate.open);

  /*
   * The sieve holds. A FULL body driven at the shut gap for thirty seconds must stay on
   * its own side - this is the bypass that shipped: crawlRelax flattens a crawling body
   * under any gap a split body fits, so geometry alone cannot enforce the split.
   */
  const big = makeState(freshLab(), START_MASS);
  const bx = 700 - home(big).x;
  const by = 590 - home(big).y;
  for (const p of big.particles) {
    p.x += bx;
    p.px += bx;
    p.y += by;
    p.py += by;
  }
  run(big, 30.0, () => ({ move: 1, anchor: null, recall: false }));
  check(
    'a FULL body cannot ooze under the shut gate',
    home(big).x < 810 && mass(big) === START_MASS,
    `ended at ${home(big).x.toFixed(0)} with mass ${mass(big)}, gate at 800`
  );
}

// ---------------------------------------------------------------- a torn body heals
{
  /*
   * An OWNED body that gets torn in two must put itself back together.
   *
   * This exists because the force that does it - `rejoin` - was written BELOW the
   * integrator when it was added, which meant it never ran: accelerations are zeroed at
   * the top of every step and spent by the integration loop, so anything added after that
   * loop is wiped before it is integrated. The bug reached the playtest as "the mass was
   * still split in two, but green, like the two separate parts were playable", which is
   * exactly what two owned components with nothing pulling them together look like.
   *
   * A dead force is invisible to every other check in this file, because nothing else
   * asks the body to do something only that force can do. So this asks directly: tear it,
   * wait, and require ONE component at the end.
   */
  const torn = makeState(freshLab(), START_MASS);
  run(torn, 2.0, () => IDLE);
  const half = owned(torn).slice(0, Math.floor(owned(torn).length / 2));
  // 120px is comfortably past linkRange (15), so cohesion alone cannot close it - measured
  // with the force disabled, the body stays in pieces at this distance.
  for (const p of half) {
    p.x += 120;
    p.px = p.x;
  }
  const tornInto = components(owned(torn)).length;
  run(torn, 6.0, () => IDLE);
  check(
    'a torn body puts itself back together',
    tornInto > 1 && components(owned(torn)).length === 1,
    `tore into ${tornInto}, ended as ${components(owned(torn)).length}`
  );
}

// ---------------------------------------------------------------- the swing reads as a teardrop
{
  /*
   * The shape that tells the player which way they will leave.
   *
   * It is a claim about geometry, so it gets measured: taken from a real settled body, is the
   * drawn shape actually longer along the direction of travel, narrower across it, and
   * narrower at the FRONT than the back? The last one is the whole feature - stretch and pinch
   * alone give a symmetrical ellipse, which points both ways at once and is worse than not
   * pointing at all, because it looks like information and is not.
   */
  const shaped = makeState(freshLab(), START_MASS);
  run(shaped, 3.0, () => IDLE);
  const body = owned(shaped).map((p) => ({ x: p.x, y: p.y }));
  const c = {
    x: body.reduce((a, p) => a + p.x, 0) / body.length,
    y: body.reduce((a, p) => a + p.y, 0) / body.length,
  };
  // Travelling due east, so "along" is x and "across" is y and the arithmetic stays readable.
  const length = (pts: Array<{ x: number; y: number }>) =>
    Math.max(...pts.map((p) => p.x - c.x)) - Math.min(...pts.map((p) => p.x - c.x));
  /*
   * The outer THIRD of each end, not each half.
   *
   * A half includes the fat middle, so both halves report the middle's width and the
   * measurement says nothing - which is exactly what the first version of this check did,
   * reporting a wider front for a shape that is demonstrably narrower there. A teardrop is
   * fattest at its waist; the claim is about its ENDS.
   */
  const endWidth = (pts: Array<{ x: number; y: number }>, front: boolean) => {
    const reach = Math.max(...pts.map((p) => Math.abs(p.x - c.x)));
    const end = pts.filter((p) => (front ? p.x - c.x > reach * 0.45 : p.x - c.x < -reach * 0.45));
    return end.length ? Math.max(...end.map((p) => Math.abs(p.y - c.y))) : 0;
  };

  const wasLong = length(body);
  const wasWide = endWidth(body, false);
  const shapedBody = body.map((p) => ({ ...p }));
  teardrop(shapedBody, 600, 0, 1);

  check(
    'a driven swing stretches the body along its travel',
    length(shapedBody) > wasLong * 1.3,
    `${wasLong.toFixed(0)}px to ${length(shapedBody).toFixed(0)}px`
  );
  check(
    'and narrows it across',
    endWidth(shapedBody, false) < wasWide,
    `half-width ${wasWide.toFixed(1)}px to ${endWidth(shapedBody, false).toFixed(1)}px`
  );
  check(
    'and the LEADING end is the narrow one - a drop, not a sausage',
    endWidth(shapedBody, true) < endWidth(shapedBody, false) * 0.85,
    `front ${endWidth(shapedBody, true).toFixed(1)}px against back ${endWidth(shapedBody, false).toFixed(1)}px`
  );
  const untouched = body.map((p) => ({ ...p }));
  teardrop(untouched, 600, 0, 0);
  check(
    'and a body that is not swinging is left alone',
    untouched.every((p, i) => Math.abs(p.x - body[i].x) < 1e-9 && Math.abs(p.y - body[i].y) < 1e-9)
  );
}

// ---------------------------------------------------------------- leaning in mid-air
{
  /*
   * A body in flight can lean, and the two things that matter about it pull opposite ways.
   *
   * It has to DO something - a rescue that is worth nothing is worse than none, because the
   * player learns to hold the key and gets nothing for it. And it must not become flight:
   * the swing is the only thing in this game that produces real distance, and a pit that can
   * be crossed by stepping off it and leaning would retire the growths entirely.
   */
  // This harness has no place() helper - the shaft's does. Inlined rather than imported.
  const put = (s: MassState, x: number, y: number) => {
    const at = home(s);
    for (const p of s.particles) {
      p.x += x - at.x;
      p.px += x - at.x;
      p.y += y - at.y;
      p.py += y - at.y;
    }
  };
  const thrown = (hold: -1 | 0 | 1) => {
    const s = makeState(freshLab(), START_MASS);
    put(s, 300, 300);
    for (const p of s.particles) {
      p.px = p.x - 500 * TUNING.dt;
      p.py = p.y + 300 * TUNING.dt;
    }
    const from = home(s).x;
    run(s, 0.9, () => ({ move: hold, anchor: null, recall: false }));
    return home(s).x - from;
  };
  const free = thrown(0);
  const leaning = thrown(1);
  check(
    'holding a direction in flight extends a throw',
    leaning > free * 1.2,
    `${free.toFixed(0)}px free, ${leaning.toFixed(0)}px leaning`
  );

  const walked = makeState(freshLab(), START_MASS);
  put(walked, 250, 600);
  let furthest = -Infinity;
  run(walked, 3.1, (s) => {
    furthest = Math.max(furthest, home(s).x);
    return { move: 1, anchor: null, recall: false };
  });
  check(
    'but the pit still cannot be walked across',
    furthest < 470,
    `stepped off the lip holding D and reached x ${furthest.toFixed(0)}; the far lip is 480`
  );
}

// ---------------------------------------------------------------- pump, then turn
{
  /*
   * The swing's contract, as the player specified it after three rounds of direction bugs:
   * "swing left and right by pressing A and D, higher and higher, until I can make a turn -
   * then hold A or D to keep turning. Holding one key must not be a 360."
   *
   * Four clauses, each checked in both directions where direction exists. The third is the
   * one with history: whether a held key could circle used to be a parametric-resonance
   * lottery that paid clockwise in stage one and nowhere else, which taught players a habit
   * that failed mirrored.
   */
  const arrive = (): { s: MassState; g: Anchor } => {
    const s = makeState(freshLab(), START_MASS);
    const g = s.world.anchors[0] as Anchor;
    const at = home(s);
    for (const p of s.particles) {
      p.x += g.x - at.x;
      p.px = p.x;
      p.y += g.y + (g.rope ?? 110) + 30 - at.y;
      p.py = p.y;
    }
    for (const p of s.particles) p.px = p.x - 150 * TUNING.dt;
    return { s, g };
  };
  const alongOf = (s: MassState, g: Anchor): number => {
    const body = owned(s);
    const c = centroid(body);
    let vx = 0;
    let vy = 0;
    for (const q of body) {
      vx += q.x - q.px;
      vy += q.y - q.py;
    }
    const tx = c.y - g.y;
    const ty = -(c.x - g.x);
    const tl = Math.hypot(tx, ty) || 1;
    return ((vx / body.length) * (tx / tl) + (vy / body.length) * (ty / tl)) / TUNING.dt;
  };
  const energyOf = (s: MassState, g: Anchor): number => {
    const rope = s.swingRadius || 1;
    const t = alongOf(s, g);
    return (0.5 * t * t + TUNING.gravity * (g.y + rope - home(s).y)) / (TUNING.gravity * rope);
  };

  // 1. A lazy hold never turns, in either direction - watched over the whole run, because
  // a crest that happens mid-run and decays would slip past a final-frame check.
  for (const key of [1, -1] as Array<1 | -1>) {
    const lazy = arrive();
    let ever = false;
    run(lazy.s, 12.0, (st) => {
      if (st.attached && home(st).y < lazy.g.y) ever = true;
      return { move: key, anchor: lazy.g, recall: false };
    });
    check(`holding ${key > 0 ? 'D' : 'A'} alone never makes the turn`, !ever);
  }

  // 2+3. Pumping in rhythm builds the swing high enough to turn, and holding then keeps
  // turning - measured as sustained revolutions, not as a single crest.
  const { s, g } = arrive();
  let dir: 1 | -1 = 1;
  let committed = false;
  run(s, 14.0, (st) => {
    if (committed) return { move: dir, anchor: g, recall: false };
    const along = alongOf(st, g);
    /*
     * The speed gate is RELATIVE TO THE ROPE, and 250 was not.
     *
     * `alongOf` is tangential speed, and on a pendulum peak speed scales with the square
     * root of the rope: the same energy multiple on a rope two thirds as long produces four
     * fifths of the speed. So a fixed 250 quietly asks a short rope for a speed its geometry
     * cannot reach at the energy the same condition demands, and the test fails for a
     * property of the test.
     *
     * Found while trying to answer whether the two growths could hang at a matching height,
     * where sweeping the rope produced a pass/fail pattern with no monotonic sense in it -
     * 120 passed, 110 through 85 failed, 80 passed. That is not what a stage getting
     * gradually worse looks like; it is what a threshold in the wrong units looks like.
     *
     * Anchored at the shipped rope so the check is unchanged where it has always run.
     */
    const gate = 250 * Math.sqrt((st.swingRadius || 120) / 120);
    if (energyOf(st, g) > 1.75 && Math.abs(along) > gate) {
      committed = true;
      dir = along >= 0 ? 1 : -1;
      return { move: dir, anchor: g, recall: false };
    }
    return { move: (Math.abs(along) > 40 ? (along >= 0 ? 1 : -1) : 1) as 1 | -1, anchor: g, recall: false };
  });
  check('pumping in rhythm builds a swing that can turn', committed);
  let last = Math.atan2(home(s).y - g.y, home(s).x - g.x);
  let turned = 0;
  run(s, 4.0, () => {
    const c = home(s);
    const now = Math.atan2(c.y - g.y, c.x - g.x);
    let d = now - last;
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    turned += d;
    last = now;
    return { move: dir, anchor: g, recall: false };
  });
  check(
    'and holding that direction keeps it turning',
    Math.abs(turned) / (2 * Math.PI) > 2.5,
    `${(Math.abs(turned) / (2 * Math.PI)).toFixed(1)} revolutions in 4s of holding`
  );
}

// ---------------------------------------------------------------- reaching for what you cannot have
{
  /*
   * Clicking a growth that is out of range while falling must cost nothing but the click.
   *
   * Two faults were reported as one: "the mass floats an unreasonable distance to the growth
   * and connects", and "sometimes the mass splits into two". Both lived in the same block.
   * The reach force drags particles out along the tendril with their weight cancelled
   * EXACTLY, which is right for a grab you can make and was being applied to grabs you
   * cannot - so half the creature hung weightless in mid-air, drifting after the growth
   * until the fall brought the rest of the body into range. And an over-strained tendril
   * disowned every particle in the reach, which is a split nobody asked for.
   *
   * Giving that arm weight instead was tried and measured worse: pulled to different
   * stations along a 212px line, it sagged and came apart into eight pieces.
   */
  const reachFall = (withAnchor: boolean) => {
    const s = makeState(freshLab(), START_MASS);
    const g = s.world.anchors[1];
    const at = home(s);
    for (const p of s.particles) {
      p.x += g.x - 420 - at.x;
      p.px += g.x - 420 - at.x;
      p.y += g.y - 60 - at.y;
      p.py += g.y - 60 - at.y;
    }
    const y0 = home(s).y;
    let pieces = 1;
    run(s, 0.8, (st) => {
      pieces = Math.max(pieces, visualPieces(owned(st)));
      return { move: 0 as const, anchor: withAnchor ? g : null, recall: false };
    });
    return { fell: home(s).y - y0, pieces, kept: mass(s) };
  };
  const plain = reachFall(false);
  const reaching = reachFall(true);
  check(
    'reaching for an out-of-range growth does not hold the body up',
    Math.abs(plain.fell - reaching.fell) < 12,
    `fell ${plain.fell.toFixed(0)}px falling plainly, ${reaching.fell.toFixed(0)}px while reaching`
  );
  check(
    'and it costs no mass',
    reaching.kept === START_MASS,
    `kept ${reaching.kept} of ${START_MASS}`
  );

  /*
   * And the snap itself. Six seconds of holding a growth far out of range: the tendril must
   * strain, give up and retract, over and over, without ever dividing the creature. Only a
   * press and the player's own Space may do that.
   */
  const strained = makeState(freshLab(), START_MASS);
  const far = strained.world.anchors[1];
  {
    const at = home(strained);
    for (const p of strained.particles) {
      p.x += far.x - 500 - at.x;
      p.px += far.x - 500 - at.x;
      p.y += far.y + 40 - at.y;
      p.py += far.y + 40 - at.y;
    }
  }
  let worst = 1;
  run(strained, 6.0, (st) => {
    worst = Math.max(worst, visualPieces(owned(st)));
    return { move: 0 as const, anchor: far, recall: false };
  });
  check(
    'an over-reach never splits the creature',
    mass(strained) === START_MASS && worst <= 2,
    `kept ${mass(strained)} of ${START_MASS}, worst ${worst} piece(s), ${strained.snapped} snap(s)`
  );
}

// Approved ground-only stopping: use a long unobstructed floor so walls cannot fake rest.
for (const grams of [40, 14, 8]) {
  for (const landing of [false, true]) {
    const world = freshLab();
    world.width = 12000;
    world.start = { x: 2000, y: 560 };
    world.exit = { x: 11900, y: 560 };
    world.tiles = [{ x: 0, y: 620, w: 12000, h: 300 }];
    world.gates = [];
    world.buttons = [];
    world.anchors = [];
    const state = makeState(world, grams);
    run(state, 2, () => IDLE);
    if (landing) {
      for (const p of owned(state)) {
        p.y -= 220;
        p.py = p.y - 260 * TUNING.dt;
        p.px = p.x - 320 * TUNING.dt;
        p.grounded = false;
      }
      let ticks = 0;
      while (ticks++ < 240 && !owned(state).some(p => p.grounded)) step(state, IDLE);
    } else {
      run(state, 1, () => ({ ...IDLE, move: 1 }));
    }
    run(state, 0.3, () => IDLE);
    const start = home(state).x;
    let creep = 0;
    run(state, 5, () => {
      creep = Math.max(creep, Math.abs(home(state).x - start));
      return IDLE;
    });
    check(`${grams}g settles after ${landing ? 'landing' : 'walking'} within 0.3s`,
      creep < 1, `five-second creep ${creep.toFixed(3)}px`);
    check('ground rest preserves mass and a single body', mass(state) === grams && components(owned(state)).length === 1);
  }
}

console.log(failures === 0 ? '\nALL CHECKS PASSED\n' : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
