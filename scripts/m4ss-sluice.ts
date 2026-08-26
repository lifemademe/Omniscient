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

/** The square the growth's whole circle lives in. Kept for the plate test, which wants it. */
function sweepBox(a: Anchor, rope: number): Tile {
  return { x: a.x - rope, y: a.y - rope, w: rope * 2, h: rope * 2 };
}

/**
 * Does the growth's sweep actually reach this rectangle?
 *
 * A pendulum sweeps a DISC and this used to test its bounding square, which is 27% larger and
 * wrong in the one direction that matters - it reports a hit on all four corners, where the
 * arc never goes. That is not a conservative approximation, it is a fictional one, and it cost
 * this level twice: the first time it forced two exemptions to be written by hand, and the
 * second time it squeezed five patrol growths into a two-hundred-pixel pocket because
 * everything outside it "collided" with a corner. The playtest called the result scattered,
 * which is what five things 22 pixels apart look like.
 *
 * Closest point on the rect to the centre, against the radius. Six lines, and the level got
 * four hundred pixels of room back.
 */
function sweepHits(a: Anchor, rope: number, t: Tile): boolean {
  const cx = Math.max(t.x, Math.min(a.x, t.x + t.w));
  const cy = Math.max(t.y, Math.min(a.y, t.y + t.h));
  return Math.hypot(a.x - cx, a.y - cy) < rope;
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

/**
 * The longest rope this growth can actually be given, which is not the same as the reach.
 *
 * The radius is the distance the tendril crossed, so it is bounded by where the player can BE
 * when they latch - the top of a walkable tile, or somewhere inside another growth's sweep if
 * they are transferring in flight. A growth 300px from every ledge in the level cannot be given
 * a 212px rope from the ground however long the player's reach is.
 *
 * Deliberately generous where it is uncertain: a mid-flight latch is measured from the far side
 * of the previous growth's circle, which is further than a body ever actually is at that moment.
 * Wrong in the safe direction.
 */
function reachableRope(a: Anchor): number {
  if (a.rope !== undefined) return a.rope;
  let best = 0;
  const consider = (x: number, y: number): void => {
    const d = Math.hypot(x - a.x, y - a.y);
    if (d <= MAX_REACH) best = Math.max(best, d);
  };
  for (const t of W.tiles) {
    if (isShell(t)) continue;
    // Along the top surface, at a settled body's centroid height.
    for (let x = t.x; x <= t.x + t.w; x += 10) consider(x, t.y - 20);
  }
  for (const other of W.anchors) {
    if (other === a) continue;
    const r = other.rope ?? MAX_REACH;
    for (let i = 0; i < 24; i++) {
      const th = (i / 24) * Math.PI * 2;
      consider(other.x + Math.cos(th) * r, other.y + Math.sin(th) * r);
    }
  }
  return best;
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
  // The shell is allowed - the level is inside it and every sweep is inside the level.
  const real = W.tiles.filter((t) => !isShell(t) && sweepHits(a, a.rope!, core(t)));
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
  const catchLedge = W.tiles.find((t) => t.x === 800 && t.y === 460)!;
  const wrong = W.tiles.filter(
    (t) => !isShell(t) && t !== patrol && t !== catchLedge && sweepHits(a, MAX_REACH, core(t))
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
  for (const id of ['t1']) {
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
      !sweepHits(a, a.rope, swept),
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
   * Every growth, against the widest rope it can ACTUALLY be given.
   *
   * For a stated growth that is its rope. For a ropeless one it is the furthest away the
   * player can be at the moment of latching, which is not 212 - it is the greatest distance
   * from the growth to any surface the body can stand on or any other growth's sweep it can
   * be flying out of, capped at reach. On the patrol that number comes out around 120, because
   * the crossing's growths are latched mid-flight from each other and the ledges are all
   * further than 212 away.
   *
   * The 212 bound was what made this check useless: it says a patrol growth's circle overlaps
   * a plate on the far side of the level, which is true of the square and false of the room.
   */
  for (const a of W.anchors) {
    check(`breach plate is outside ${a.id}'s sweep`, !overlap(box, sweepBox(a, reachableRope(a))));
  }
}

/*
 * The back half of the stage cannot be entered from the front half.
 *
 * The skip this catches is the one the floor plan found and no coordinate list ever would:
 * the descent's second beat passes within a hundred pixels of the gallery's lowest growth, so
 * a player at forty grams could latch it in flight, climb, and reach the exit having done two
 * beats out of eight. The answer is stage two's: the whole gallery is red until the plate at
 * the top of the column wakes it.
 *
 * Checked as a property rather than as three ids, so a growth added to the climb later is
 * covered by it: every growth whose sweep can put a body at the breach plate has to be dead at
 * the start, and something has to wake it.
 */
{
  const woken = new Set(W.buttons.flatMap((b) => b.activates ?? []));
  for (const a of W.anchors) {
    if (!a.id!.startsWith('g')) continue;
    check(`${a.id} is dead until the column is solved`, a.live === false);
    check(`and something wakes ${a.id}`, woken.has(a.id!));
  }
  const plate = W.buttons.find((b) => b.id === 'drop')!;
  check(
    'the thing that wakes them is at the top of the column',
    // At the top of the column: east of the pier and a long way above the machine floor.
    (plate.activates ?? []).length === 3 && plate.y < FLOOR_TOP - 300 && plate.x > 900,
    `at (${plate.x}, ${plate.y})`
  );
  // A red growth is not a growth you can be handed early by a second switch.
  for (const b of W.buttons) {
    if (b.id === 'drop') continue;
    check(`${b.id} wakes nothing`, (b.activates ?? []).length === 0);
  }
}

/*
 * A creature has to have something to walk on for the whole of its beat.
 *
 * The second sporeling's patrol ran to 970 against a floor that stops at 900, so a third of
 * its round trip was spent standing on air - and the report was the one you would expect:
 * "the second sporeling walks on air". It was a leftover, the floor having been trimmed after
 * the beat was written, and nothing connected the two numbers.
 *
 * Half a body of margin at each end, which is the same rule stage two's ledge uses: a creature
 * that turns with part of itself hanging over the lip reads as sliding off it.
 */
for (const c of W.critters ?? []) {
  const floor = W.tiles.find(
    (t) => t.y === c.y && c.from - c.w / 2 >= t.x && c.to + c.w / 2 <= t.x + t.w
  );
  check(
    `the creature at ${c.from}..${c.to} has a floor under all of it`,
    floor !== undefined,
    `y ${c.y}`
  );
}

/*
 * A designed swing does not hang inside a creature.
 *
 * g1 hung 140 above the landing and something walked that landing with its head six pixels
 * under the bottom of the arc, so being ON the growth was a contact - not swinging into the
 * creature, just hanging there. "The growth above that platform is too low, the mass will hit
 * the sporeling while hanging or swinging."
 *
 * Only the growths that STATE a rope. The patrol's are ropeless and one of them is supposed to
 * sweep into the floor the creatures walk - that is the trap, and it has its own check above.
 * This is for the chains, where an overlap is never anything but an accident.
 */
for (const a of W.anchors) {
  if (a.rope === undefined) continue;
  for (const c of W.critters ?? []) {
    // Only growths that hang ABOVE the creature. One below it cannot dip onto its head, and
    // the climb out of the sump is entirely below the landing it climbs to.
    if (a.y >= c.y) continue;
    /*
     * How deep the arc gets WHERE THE CREATURE IS, not at the bottom of the circle.
     *
     * The first version compared the lowest point of the disc against any creature whose beat
     * the disc's x-range touched, and reported a hit whenever a circle grazed a patrol's far
     * end - the deepest part of a swing is under the growth, and the graze is at the edge
     * where the arc is nearly level. Chord depth at the nearest point of the beat is the
     * honest number: sqrt(r^2 - dx^2) below the anchor.
     */
    const span = { from: c.from - c.w / 2, to: c.to + c.w / 2 };
    const dx = Math.max(0, Math.max(span.from - a.x, a.x - span.to));
    if (dx >= a.rope) continue;
    const arc = a.y + Math.sqrt(a.rope * a.rope - dx * dx) + 23;
    check(
      `${a.id} hangs clear of the creature at ${c.from}..${c.to}`,
      arc < c.y - c.h,
      `arc ${Math.round(arc)} vs head ${c.y - c.h}`
    );
  }
}

/*
 * Two surfaces that meet do not meet at different heights.
 *
 * "The platforms where the sporelings are are not the same height" has been reported twice, and
 * the second time it was already fixed - the report was written against a build two commits
 * old. That is a good reason to write the rule down rather than to keep eyeballing it: a step
 * of twenty pixels between two slabs that touch is invisible in a coordinate list, and on
 * screen it is unmistakable and reads as broken geometry rather than as a step.
 *
 * Either they line up or they are far enough apart to be two things. A body stands about 46,
 * so anything under that is a lip nobody meant to draw.
 */
{
  const BODY = 46;
  for (const a of W.tiles) {
    for (const b of W.tiles) {
      if (a === b || isShell(a) || isShell(b)) continue;
      if (Math.abs(a.x + a.w - b.x) > 6) continue;
      const step = Math.abs(a.y - b.y);
      check(
        `(${a.x},${a.y}) meets (${b.x},${b.y}) squarely`,
        step === 0 || step >= BODY,
        `${step}px step`
      );
    }
  }
}

/*
 * Nowhere you can stand is a place you cannot leave.
 *
 * The catch shelf sat flush under the ledge above it, so a body that landed on it met the
 * ledge's east face at exactly standing height going west and the world's wall going east -
 * two hundred and fifty pixels with a wall at each end. The playtest landed there and stayed
 * there, and no assertion in this file had anything to say about it.
 *
 * Tested as: at least one end of every standable surface has open air beside it at standing
 * height. That is not a proof the level is fully connected - a real reachability graph is a
 * different job - but it is exactly the fault that shipped, and it is four lines.
 */
{
  const STAND = 24;
  const solidAt = (x: number, y: number): boolean =>
    W.tiles.some((t) => x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h);
  for (const t of W.tiles) {
    // The ground reaches the bottom of the world; you leave it by climbing, not by walking
    // off an end, so being walled at both ends is what it is FOR.
    if (isShell(t) || t.y + t.h >= W.height) continue;
    const y = t.y - STAND;
    const west = solidAt(t.x - 2, y);
    const east = solidAt(t.x + t.w + 2, y);
    check(`(${t.x},${t.y}) can be left`, !(west && east), west && east ? 'walled at both ends' : '');
  }
}

/*
 * The bulkhead, and the drop it lets you take.
 *
 * It used to be a drawbridge and the checks here used to be about a deck. Both are gone: what
 * the player needs at the top of the column is a way DOWN to the mass they left, not a floor
 * at deck height leading to a climb they cannot start. See the gate's own note.
 *
 * What has to be true now is smaller and easier to get wrong. The slab has to stand ON the
 * platform rather than in it, and it has to have somewhere to go: the lift travels its own
 * height plus four, so a slab taller than the pocket above it rises into the ceiling and the
 * open state is a door buried in stone.
 */
{
  const gate = W.gates.find((g) => g.id === 'b1')!;
  const slab = gateSolid(gate)!;
  for (const t of W.tiles) {
    if (isShell(t)) continue;
    check(`the bulkhead is clear of (${t.x},${t.y})`, !overlap(slab, t));
  }
  const platform = W.tiles.find((t) => t.x === 900 && t.y === 1150)!;
  check('the bulkhead stands on the platform', gate.y + gate.h === platform.y, `${gate.y + gate.h}`);
  check(
    'and within it, not off its end',
    gate.x >= platform.x && gate.x + gate.w <= platform.x + platform.w
  );
  /*
   * The rig lifts a gate by `h + 4` (see the gateNodes loop). Everything above the slab has to
   * be further away than that, or the open door is inside the ceiling.
   */
  const ceiling = W.tiles.find((t) => t.x === 900 && t.y === 760)!;
  const headroom = gate.y - (ceiling.y + ceiling.h);
  check(
    'the bulkhead has somewhere to lift into',
    headroom > gate.h + 4,
    `${headroom}px of pocket for a ${gate.h}px slab`
  );
  // And once it is up, a body has to fit through where it stood.
  check('and the gap it leaves is passable', gate.h >= 60, `${gate.h}`);
}

/*
 * The way out of the sump.
 *
 * The stage's second half assumed the player could get from the machine floor back to the
 * gallery and nothing carried them - seven hundred pixels of wall. Checked as a chain: every
 * link within a full reach of the last, the first within reach of the floor, and the last
 * within reach of the landing the gallery starts from.
 */
{
  const climb = ['n1', 'n2', 'n3'].map((id) => named(id));
  const landing = W.tiles.find((t) => t.x === 360 && t.y === 1020)!;
  check(
    'the first rise is reachable from the machine floor',
    Math.hypot(climb[0].x - climb[0].x, FLOOR_TOP - 20 - climb[0].y) < MAX_REACH,
    `${Math.round(FLOOR_TOP - 20 - climb[0].y)}px up`
  );
  for (let i = 1; i < climb.length; i++) {
    const d = Math.hypot(climb[i].x - climb[i - 1].x, climb[i].y - climb[i - 1].y);
    check(`${climb[i - 1].id} reaches ${climb[i].id}`, d < MAX_REACH, `${Math.round(d)}px`);
  }
  const top = climb[climb.length - 1];
  const onto = Math.hypot(landing.x + 40 - top.x, landing.y - 20 - top.y);
  check('the last rise reaches the landing', onto < MAX_REACH, `${Math.round(onto)}px`);
  const first = W.anchors.find((a) => a.id === 'g1')!;
  const up = Math.hypot(first.x - (landing.x + 40), first.y - (landing.y - 20));
  check('and the landing reaches the gallery', up < MAX_REACH, `${Math.round(up)}px`);
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
  const pier = W.tiles.find((t) => t.x === 1020 && t.y === 1240)!;
  check('the pier meets the grate', pier.y + pier.h === grate.y, `${pier.y + pier.h} vs ${grate.y}`);
  /*
   * And the pier meets what is over it.
   *
   * A sieve is only a sieve if the ONLY way past is the gap under it. The pier stopped ten
   * pixels below the platform above, which no check had anything to say about - the horizontal
   * "meets squarely" rule only looks at surfaces side by side. Ten pixels is not a route for a
   * body that crawls to fifteen, so this was luck rather than design, and the next time
   * somebody moves that platform the luck runs out.
   */
  // The LOWEST thing over it, not the first one found - the shell and the lid both span this
  // x and both are hundreds of pixels higher.
  const above = W.tiles
    .filter((t) => !isShell(t) && t.x <= pier.x && t.x + t.w >= pier.x + pier.w && t.y + t.h <= pier.y + 1)
    .sort((a, b) => b.y + b.h - (a.y + a.h))[0];
  check(
    'and something solid sits on top of the pier',
    above !== undefined && above.y + above.h === pier.y,
    above ? `(${above.x},${above.y}) ends at ${above.y + above.h}, pier starts ${pier.y}` : 'nothing above it'
  );
  // The doorway is the gate's width, so the wall it hangs in has to be exactly that wide.
  check(
    `the pier is the grate's own width`,
    pier.x === grate.x && pier.w === grate.w,
    `pier ${pier.x}+${pier.w}, grate ${grate.x}+${grate.w}`
  );
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
  const cap = W.tiles.find((t) => t.x === 1080 && t.y === 760)!;
  check('the column is capped', cap.y + cap.h === draft.y, `${cap.y + cap.h} vs ${draft.y}`);
  const deck = W.tiles.find((t) => t.x === 900 && t.y === 1150)!;
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

// ------------------------------------------------------------------------------ 3. the route

console.log('\nthe route - the two moves the layout cannot settle on its own');

/*
 * Does the column actually put you on the platform?
 *
 * This is the beat with the most uncertainty in it and the least visible failure mode. The
 * ride ends at a ceiling rather than at a ledge - the air runs out under the cap and the only
 * opening is sideways - so "it works" is a claim about three things at once: that the rise
 * clears the platform's surface, that steering west while still in the draught is possible at
 * all, and that leaving the column drops the body onto 180px of stone rather than back down
 * eight hundred pixels of shaft. None of those is readable off the coordinates.
 *
 * Driven the way a player would: hold nothing until the body is near the top, then hold west.
 */
{
  const draft = THE_SLUICE.updrafts![0];
  const platform = THE_SLUICE.tiles.find((t) => t.x === 900 && t.y === 1150)!;
  const state = makeState(freshSluice(), draft.liftMass);
  const dx = draft.x + draft.w / 2 - home(state).x;
  const dy = FLOOR_TOP - 30 - home(state).y;
  for (const p of state.particles) {
    p.x += dx;
    p.px += dx;
    p.y += dy;
    p.py += dy;
  }
  run(state, 6, (st) => ({
    // Steer west once the body is within a body-height of the cap, and keep steering.
    move: home(st).y < draft.y + 90 ? -1 : 0,
    anchor: null,
    recall: false,
  }));
  const at = home(state);
  const onPlatform =
    at.x > platform.x && at.x < platform.x + platform.w && Math.abs(at.y - (platform.y - 22)) < 34;
  check('the column delivers the body onto the platform', onPlatform, `landed (${Math.round(at.x)}, ${Math.round(at.y)})`);
  check('and it arrives whole', mass(state) === draft.liftMass, `${mass(state)}g`);

  // The plate has to be somewhere the body that just landed can walk to.
  const plate = THE_SLUICE.buttons.find((b) => b.id === 'drop')!;
  check(
    'the plate is on the platform it landed on',
    plate.x > platform.x && plate.x < platform.x + platform.w,
    `plate at ${plate.x}, platform ${platform.x}..${platform.x + platform.w}`
  );
}

/*
 * The presses' claim, checked rather than asserted - and it caught the claim being wrong.
 *
 * The level's comment used to say there is no moment when both heads are up. That is false and
 * cannot be made true: the cycle is 55% winch, 30% hang, 15% drop, so a press is clear for
 * about 85% of its life and no phase offset gets two of them out of each other's way. Sampled
 * here at 250 frames of overlap per four seconds, which is what sent the beat back to the
 * drawing board rather than into a playtest.
 *
 * What is true, and is what makes two presses a different lesson from one, is that the window
 * is shorter than the corridor. Both checks below are that sentence: how long the pair is open
 * together, against how long the crossing takes at a crawl.
 */
{
  const presses = (THE_SLUICE.crushers ?? []).filter((c) => c.axis !== 'x');
  check('there are two of them', presses.length === 2);
  const state = makeState(freshSluice(), 40);
  const steps = Math.round(4 / TUNING.dt);
  let bothFor = 0;
  let bothLongest = 0;
  const openFor = presses.map(() => 0);
  const longest = presses.map(() => 0);
  for (let i = 0; i < steps; i++) {
    step(state, IDLE);
    const live = state.world.crushers!.filter((c) => c.axis !== 'x');
    // "Up" means the head has lifted a body-height clear of where it closes.
    const up = live.map((c) => c.travel - c.at > 46);
    bothFor = up.every(Boolean) ? bothFor + 1 : 0;
    bothLongest = Math.max(bothLongest, bothFor);
    up.forEach((o, k) => {
      openFor[k] = o ? openFor[k] + 1 : 0;
      longest[k] = Math.max(longest[k], openFor[k]);
    });
  }

  /*
   * The crawl is 92px/s and the crossing runs from safe ground a body's width west of the
   * first head to the same east of the second. If that takes longer than the pair stay open
   * together, the pocket between them is mandatory and the corridor is two commitments. If it
   * does not, the whole thing is stage two's one press with a longer walk.
   */
  const CRAWL = 92;
  const west = presses[0].x - 40;
  const east = presses[1].x + presses[1].w + 40;
  const crossing = (east - west) / CRAWL;
  const window = bothLongest * TUNING.dt;
  check(
    'the window is shorter than the corridor',
    crossing > window + 1.2,
    `crossing ${crossing.toFixed(1)}s vs window ${window.toFixed(1)}s`
  );

  /*
   * And the fairness half, per press. A window that exists and is too short to walk is not a
   * window. Clearing a 60px head from a standing start at a crawl is about three quarters of
   * a second, so each has to beat that with something in hand.
   */
  for (let k = 0; k < longest.length; k++) {
    const seconds = longest[k] * TUNING.dt;
    check(`press ${k + 1} holds its window long enough to walk`, seconds > 0.9, `${seconds.toFixed(2)}s`);
  }
}

// --------------------------------------------------------------------- 4. the creatures

console.log(`\nthe sporelings - what counts as touching you`);

/*
 * A piece torn off the body is not the body.
 *
 * The contact test asked every OWNED particle, and the body is allowed to be in several
 * pieces - collision never splits it on purpose, but a corner can scrape a few off, and those
 * fragments are still owned while the rejoin force hauls them home. So a lump the player did
 * not know they had, drifting into a creature, sent the whole run back to its last footing.
 *
 * Both directions are checked, because the fix is one that can pass by doing nothing at all:
 * if the main body stopped registering too, the first check would go green and the creature
 * would be furniture.
 */
{
  /*
   * Read from the LIVE world, not the template.
   *
   * The first version of this test took the creature's position from THE_SLUICE and dropped
   * the fragment there - but freshSluice() copies the critters and half a second of stepping
   * walks them away from where they were authored, so the fragment was being placed at an
   * empty patch of floor. It passed, and it passed with the fault still in the sim: the canary
   * that was supposed to prove it could fail did not fail either. A test that places a hazard
   * by hand has to ask the simulation where the hazard actually is.
   */
  const at = (state: MassState): { x: number; y: number } => {
    const c = state.world.critters![0];
    return { x: c.x, y: c.y - c.h / 2 };
  };

  const place = (state: MassState, x: number, y: number): void => {
    const at = home(state);
    const dx = x - at.x;
    const dy = y - at.y;
    for (const p of state.particles) {
      p.x += dx;
      p.px += dx;
      p.y += dy;
      p.py += dy;
    }
  };

  // A fragment, on its own, standing in the creature.
  const stray = makeState(freshSluice(), 40);
  place(stray, 800, 700);
  run(stray, 0.5, () => IDLE);
  const before = home(stray);
  const strayAt = at(stray);
  for (const p of owned(stray).slice(0, 3)) {
    p.x = strayAt.x;
    p.y = strayAt.y;
    p.px = p.x;
    p.py = p.y;
  }
  step(stray, IDLE);
  const drift = Math.hypot(home(stray).x - before.x, home(stray).y - before.y);
  check('a stray piece touching a creature does not reset the run', stray.stunned === 0);
  check('and the body stays where it was', drift < 60, `${Math.round(drift)}px`);

  // The body itself, in the same place. This one must still be caught.
  const body = makeState(freshSluice(), 40);
  place(body, 800, 700);
  run(body, 0.5, () => IDLE);
  const bodyAt = at(body);
  place(body, bodyAt.x, bodyAt.y);
  step(body, IDLE);
  check('but the body itself still is', body.stunned > 0, `stunned ${body.stunned.toFixed(2)}s`);
}

console.log(failures === 0 ? '\nall clear\n' : `\n${failures} failed\n`);
process.exitCode = failures === 0 ? 0 : 1;
