/**
 * Does stage three's geometry admit the route it was drawn for, and does the air work?
 *
 * Same job as scripts/m4ss-stage.ts and scripts/m4ss-shaft.ts. This stage adds two things
 * neither of those has, and both of them are the kind that cannot be settled by looking:
 *
 *   the column   a new force in the sim, with a mass ceiling and a soft edge
 *   the traps    two growths that carry NO rope, so the swing radius is whatever the player
 *                reached across - which means the sweep the level has to clear is a range
 *                rather than a circle, and the range depends on where you can stand
 *
 * The layout pass below is arithmetic I got wrong by hand more than once while authoring the
 * level: every sweep against every tile, every press against every sweep, every plate against
 * the sweep that is supposed to be unable to reach it. It is cheap and it is exhaustive, and
 * it is the difference between "I measured that" and "I believed that".
 *
 *     npx tsx scripts/m4ss-sluice.ts
 */

import { freshSluice, THE_SLUICE } from '../src/m4ss/sluice.js';
import {
  centroid,
  crusherRect,
  draftLift,
  gateSolid,
  loose,
  makeState,
  mass,
  owned,
  split,
  step,
  TUNING,
} from '../src/m4ss/mass.js';

import type { Anchor, MassState, Tile } from '../src/m4ss/mass.js';

let failures = 0;

function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures += 1;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` - ${detail}` : ''}`);
}

const IDLE = { move: 0 as const, anchor: null, recall: false };

function run(
  state: MassState,
  seconds: number,
  input: (s: MassState) => { move: -1 | 0 | 1; anchor: Anchor | null; recall: boolean }
): void {
  const steps = Math.round(seconds / TUNING.dt);
  for (let i = 0; i < steps; i++) step(state, input(state));
}

function home(state: MassState): { x: number; y: number } {
  return centroid(owned(state));
}

function overlap(a: Tile, b: Tile): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** The square the growth's whole circle lives in. A disc-vs-rect test that errs solid. */
function sweepBox(a: Anchor, rope: number): Tile {
  return { x: a.x - rope, y: a.y - rope, w: rope * 2, h: rope * 2 };
}

/**
 * A tile's CORE - itself, inset by a body's half-width on every side.
 *
 * Sweeps are tested against this rather than against the tile, and the inset is the whole of
 * the difference between the two ways an arc can meet a platform. A pendulum's circle always
 * passes through the point it was latched from, so the lip of the ledge you launched off is
 * inside your own sweep by construction and always will be - flagging that is flagging the
 * geometry of a pendulum. What is a real fault is an arc that passes THROUGH a slab, and that
 * shows up as an overlap with the core.
 *
 * 24px, which is a settled body's half-height: an arc that gets that far inside a platform is
 * an arc that has the creature in the stone rather than over the corner of it.
 */
const CORE = 24;
function core(t: Tile): Tile {
  return { x: t.x + CORE, y: t.y + CORE, w: t.w - CORE * 2, h: t.h - CORE * 2 };
}

/** The shell - the four slabs the level is drawn inside. Every sweep is inside them. */
function isShell(t: Tile): boolean {
  return t.w >= 1300 || t.h >= 1000;
}

/** The top of the machine floor. Read from the level so the checks cannot drift from it. */
const FLOOR_TOP = THE_SLUICE.tiles.find((t) => t.w === 1260)!.y;

const W = THE_SLUICE;
const named = (id: string): Anchor => W.anchors.find((a) => a.id === id)!;

// ---------------------------------------------------------------------------- 1. the layout

console.log('\nlayout - every sweep, every press, every plate');

/*
 * A stated sweep must not eat the level.
 *
 * Only the growths that declare a rope are checked here; the patrol's do not have one, and
 * what they need is a different test (below). The launch lip is exempt by construction: a
 * pendulum's circle passes through the point you latched from, so the ledge you left is always
 * inside it and that is not a fault - see shaft.ts on the difference between grazing your own
 * lip and clipping a platform the arc passes beside.
 */
for (const a of W.anchors) {
  if (a.rope === undefined) continue;
  const box = sweepBox(a, a.rope);
  // The shell is allowed - the level is inside it and every box is inside the level.
  const real = W.tiles.filter((t) => !isShell(t) && overlap(box, core(t)));
  check(`${a.id} sweep is clear of the architecture`, real.length === 0, real.map((t) => `(${t.x},${t.y})`).join(' '));
}

/*
 * The patrol's growths carry no rope, so what has to be checked is the WIDEST swing any
 * reachable standing position can buy - the full 212px of a 40g reach. If that circle is clear
 * of the architecture then every shorter one is too, and the only thing the long rope can
 * reach is the floor the creatures are on, which is the design.
 */
const MAX_REACH = 40 * TUNING.reachPerMass;
for (const a of W.anchors) {
  if (a.rope !== undefined) continue;
  const box = sweepBox(a, MAX_REACH);
  /*
   * Two exemptions, and they are the two things the beat is made of.
   *
   * The patrol floor is MEANT to be inside a trap growth's widest sweep - that is the trap.
   *
   * And the catch ledge is inside every one of them, because a pendulum's circle passes
   * through the point it was latched from and the ledge is where you were standing. A rope
   * long enough to clip the ledge on the way round is a rope long enough to reach the
   * creatures, which is the choice the beat is asking about rather than a fault in it.
   */
  const patrol = W.tiles.find((t) => t.y === 760)!;
  const catchLedge = W.tiles.find((t) => t.x === 660 && t.y === 480)!;
  const wrong = W.tiles.filter(
    (t) => !isShell(t) && t !== patrol && t !== catchLedge && overlap(box, core(t))
  );
  check(
    `${a.id} widest sweep touches only the patrol floor`,
    wrong.length === 0,
    wrong.map((t) => `(${t.x},${t.y})`).join(' ')
  );
}

/*
 * The trap has to actually be a trap, and the safe growth has to actually be safe.
 *
 * Measured as "does the bottom of the circle reach the creatures' heads", which is the whole
 * of the claim the level's comment makes.
 */
{
  const headY = 760 - 42;
  for (const id of ['t1', 't2']) {
    const a = named(id);
    check(`${id} at full reach sweeps into the patrol`, a.y + MAX_REACH > headY, `bottom ${a.y + MAX_REACH}`);
  }
  for (const id of ['p1', 'p2']) {
    const a = named(id);
    check(`${id} at full reach still clears the patrol`, a.y + MAX_REACH < headY, `bottom ${a.y + MAX_REACH}`);
  }
}

/*
 * A press must not stand in a swing. Stage two removed one for exactly this reason: a hazard
 * in the flight path turns a shot the player aimed into a shot the timer took.
 */
for (const c of W.crushers ?? []) {
  const lo = crusherRect({ ...c, at: 0 });
  const hi = crusherRect({ ...c, at: c.travel });
  const swept: Tile = {
    x: Math.min(lo.x, hi.x),
    y: Math.min(lo.y, hi.y),
    w: Math.max(lo.x + lo.w, hi.x + hi.w) - Math.min(lo.x, hi.x),
    h: Math.max(lo.y + lo.h, hi.y + hi.h) - Math.min(lo.y, hi.y),
  };
  /*
   * Against the STATED sweeps only.
   *
   * A ropeless growth's circle is not a circle the level ever draws in full: its lower half is
   * cut off by the floor the creatures walk on, four hundred pixels above anything here, and
   * the body meets that floor long before the arithmetic runs out. Asking whether a 212px
   * bounding box around a patrol growth overlaps a shutter in the gallery is a question about
   * squares rather than about the room. What matters is that no press stands in a swing the
   * level designed, and every one of those declares its radius.
   */
  for (const a of W.anchors) {
    if (a.rope === undefined) continue;
    check(
      `press at (${c.x},${c.y}) is clear of ${a.id}'s sweep`,
      !overlap(swept, sweepBox(a, a.rope)),
      `press ${swept.x}..${swept.x + swept.w} x ${swept.y}..${swept.y + swept.h}`
    );
  }
  /*
   * And it must not grind into the architecture at either end of its stroke.
   *
   * A vertical press is ALLOWED to arrive exactly on a floor - that is what closing means, and
   * stage two shipped one buried a hundred and thirty pixels inside the ground because the
   * stroke was lengthened without moving the rest position. Landing on the surface passes;
   * anything deeper is the same bug again.
   */
  for (const t of W.tiles) {
    if (isShell(t)) continue;
    const closes = c.axis === 'y' && hi.y + hi.h === t.y;
    check(
      `press at (${c.x},${c.y}) does not bury itself in (${t.x},${t.y})`,
      closes || !overlap(swept, t)
    );
  }
}

/*
 * The breach plate cannot be struck by swinging. Stage two's clause, restated: a growth whose
 * circle intersects the plate is a growth that opens the door by accident.
 */
{
  const plate = W.buttons.find((b) => b.id === 'breach')!;
  const box: Tile = {
    x: plate.x - plate.radius,
    y: plate.y - plate.radius,
    w: plate.radius * 2,
    h: plate.radius * 2,
  };
  /*
   * Only the growths that could actually be swung at it. The patrol's four are four hundred
   * pixels east behind a wall the player is never on the wrong side of with a rope in hand;
   * asking whether their theoretical 212px circle overlaps a plate on the far side of the
   * level is asking a question about arithmetic rather than about the room.
   */
  for (const a of W.anchors) {
    if (!a.id!.startsWith('g')) continue;
    check(`breach plate is outside ${a.id}'s sweep`, !overlap(box, sweepBox(a, a.rope!)));
  }
}

/*
 * The bridge, in both of its states.
 *
 * Standing, it must sit on the platform rather than in it. Down, its deck must not overlap
 * anything - a bridge that lands inside a tile is a bridge that lands inside the player.
 */
{
  const bridge = W.gates.find((g) => g.id === 'b1')!;
  const slab = gateSolid(bridge)!;
  const deck = bridge.span!;
  for (const t of W.tiles) {
    if (isShell(t)) continue;
    check(`standing bridge is clear of (${t.x},${t.y})`, !overlap(slab, t));
    check(`bridge deck is clear of (${t.x},${t.y})`, !overlap(deck, t));
  }
  check('bridge deck is thick enough to stand on', deck.h > 60, `${deck.h}`);
  const landing = W.tiles.find((t) => t.x === 360 && t.y === 1020)!;
  check('bridge deck meets its west landing', deck.x === landing.x + landing.w, `${deck.x}`);
  const platform = W.tiles.find((t) => t.x === 900 && t.y === 1020)!;
  check('bridge deck meets the column platform', deck.x + deck.w === platform.x, `${deck.x + deck.w}`);
}

/*
 * The grate has to have a gap, the floor has to run under it, and the pier above it has to
 * reach something. Stage one and stage two both shipped a gate mistaken for a floor.
 */
{
  const grate = W.gates.find((g) => g.id === 's1')!;
  check('grate leaves 30px of daylight', FLOOR_TOP - (grate.y + grate.h) === 30, `${FLOOR_TOP - (grate.y + grate.h)}`);
  const under = W.tiles.some((t) => t.y === FLOOR_TOP && t.x <= grate.x && t.x + t.w >= grate.x + grate.w);
  check('the floor runs under the grate', under);
  const pier = W.tiles.find((t) => t.x === 990 && t.y === 1110)!;
  check('the pier meets the grate', pier.y + pier.h === grate.y, `${pier.y + pier.h} vs ${grate.y}`);
  const patrol = W.tiles.find((t) => t.y === 760)!;
  check('nothing walks over the pier', pier.x >= patrol.x && pier.x + pier.w <= 1260);
}

/*
 * The column has to be a clear shaft, and its top has to be a ceiling with one way out.
 */
{
  const draft = W.updrafts![0];
  const shaft: Tile = { x: draft.x, y: draft.y, w: draft.w, h: draft.h };
  for (const t of W.tiles) {
    if (isShell(t) || t.y === FLOOR_TOP) continue;
    check(`column shaft is clear of (${t.x},${t.y})`, !overlap(shaft, t));
  }
  const cap = W.tiles.find((t) => t.x === 1080 && t.y === 780)!;
  check('the column is capped', cap.y + cap.h === draft.y, `${cap.y + cap.h} vs ${draft.y}`);
  const deck = W.tiles.find((t) => t.x === 900 && t.y === 1020)!;
  check('the platform is west of the column', deck.x + deck.w === draft.x - 10 || deck.x + deck.w <= draft.x);
  check('the column reaches the machine floor', draft.y + draft.h === FLOOR_TOP, `${draft.y + draft.h}`);
}

/** No tile may sit inside another - an overlap is a wall the player can be pushed into. */
for (let i = 0; i < W.tiles.length; i++) {
  for (let j = i + 1; j < W.tiles.length; j++) {
    const a = W.tiles[i];
    const b = W.tiles[j];
    if (isShell(a) || isShell(b)) continue;
    check(`tiles (${a.x},${a.y}) and (${b.x},${b.y}) do not overlap`, !overlap(a, b));
  }
}

// ---------------------------------------------------------------------------- 2. the column

console.log('\nthe column - the one new force in the sim');

/*
 * The claim the level makes is a pair of numbers: the grate passes 24 and the air lifts 14.
 * If those two agree, the beat does not exist.
 */
{
  const draft = THE_SLUICE.updrafts![0];
  const grate = THE_SLUICE.gates.find((g) => g.id === 's1')!;
  check('the wall and the air disagree', draft.liftMass < grate.sieve!, `${draft.liftMass} vs ${grate.sieve}`);

  const at = { x: draft.x + draft.w / 2, y: draft.y + draft.h / 2 };
  check('a body at the ceiling is lifted', draftLift(draft, at, draft.liftMass) === 1);
  check('one gram over and nothing happens', draftLift(draft, at, draft.liftMass + 1) === 0);
  check('outside the column, nothing happens', draftLift(draft, { x: draft.x - 5, y: at.y }, 10) === 0);
  check('above the column, nothing happens', draftLift(draft, { x: at.x, y: draft.y - 5 }, 10) === 0);
  check(
    'the edge is soft',
    draftLift(draft, { x: draft.x + 8, y: at.y }, 10) > 0 &&
      draftLift(draft, { x: draft.x + 8, y: at.y }, 10) < 1
  );
}

/** Does a legal body actually go up, and does an illegal one actually not? */
{
  const draft = THE_SLUICE.updrafts![0];
  const rise = (grams: number): number => {
    const state = makeState(freshSluice(), grams);
    // Stand it in the column, on the floor.
    const dx = draft.x + draft.w / 2 - home(state).x;
    const dy = FLOOR_TOP - 30 - home(state).y;
    for (const p of state.particles) {
      p.x += dx;
      p.px += dx;
      p.y += dy;
      p.py += dy;
    }
    const before = home(state).y;
    run(state, 2.5, () => IDLE);
    return before - home(state).y;
  };
  const light = rise(14);
  const heavy = rise(15);
  check('14 grams rides the column', light > 400, `rose ${Math.round(light)}px`);
  check('15 grams does not', heavy < 40, `rose ${Math.round(heavy)}px`);
  check('the ride is a ride, not a launch', light < 900, `rose ${Math.round(light)}px in 2.5s`);
}

/** The column must not lift what the player left behind. */
{
  const draft = THE_SLUICE.updrafts![0];
  const state = makeState(freshSluice(), 40);
  const dx = draft.x + draft.w / 2 - home(state).x;
  const dy = FLOOR_TOP - 40 - home(state).y;
  for (const p of state.particles) {
    p.x += dx;
    p.px += dx;
    p.y += dy;
    p.py += dy;
  }
  run(state, 0.6, () => IDLE);
  split(state, 0.65, 1);
  const shed = loose(state);
  const before = centroid(shed).y;
  run(state, 2, () => IDLE);
  const after = centroid(loose(state)).y;
  check('shed mass is not carried off', after >= before - 12, `moved ${Math.round(before - after)}px up`);
  check('and the body that is left is under the ceiling', mass(state) <= draft.liftMass + 2, `${mass(state)}g`);
}

/** A rope beats the weather - see the exclusion in step(). */
{
  const draft = THE_SLUICE.updrafts![0];
  const state = makeState(freshSluice(), 12);
  const anchor: Anchor = { id: 'test', x: draft.x + draft.w / 2, y: draft.y + 200, rope: 90 };
  const dx = anchor.x - home(state).x;
  const dy = anchor.y + 90 - home(state).y;
  for (const p of state.particles) {
    p.x += dx;
    p.px += dx;
    p.y += dy;
    p.py += dy;
  }
  run(state, 1.5, () => ({ move: 0, anchor, recall: false }));
  const held = Math.hypot(home(state).x - anchor.x, home(state).y - anchor.y);
  check('the column cannot pump a swing', Math.abs(held - 90) < 26, `radius ${Math.round(held)}`);
}

console.log(failures === 0 ? '\nall clear\n' : `\n${failures} failed\n`);
process.exitCode = failures === 0 ? 0 : 1;
