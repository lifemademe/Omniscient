/**
 * Phase three: no cameras left, and a city full of things that are not quite evidence.
 *
 * ## A third verb, on purpose
 *
 * Phase one narrowed a crowd with facts. Phase two predicted the next point on a route.
 * This one RECONSTRUCTS: the network has scattered fragments - a toll gate reading, a
 * traffic sensor, a forecourt camera that caught three frames, somebody's 999 call, a
 * phone touching a cell tower - each with a place and a time, and most of them are nothing
 * to do with the car.
 *
 * The player is not asked which fragment is him. They are asked which SET of fragments is
 * one vehicle going somewhere. A single ping proves nothing; four pings that a car could
 * actually have driven between prove a route. That is the difference between data and
 * evidence, and it is the most honest thing this mission does about what a surveillance
 * system is for.
 *
 * ## What makes it solvable
 *
 * Three things the player already has by now: where the cameras lost him, which way he was
 * pointed, and that he is doing about a block a second. Every fragment is then either
 * reachable from the one before it in the time between them, or it is not. The decoys are
 * not random noise - each is a real thing that happened in the district at that moment,
 * and each fails for a reason that can be said out loud.
 *
 * ## Why it has to end somewhere
 *
 * A chain of one fragment is trivially consistent, so without a destination the puzzle has
 * dozens of answers and no question. The chain has to arrive - at the bridge, which is
 * where Lucian is going to be standing. Working out WHERE HE IS HEADED is the actual point
 * of the phase; the fragments are how you prove it.
 *
 * ## Proved by brute force
 *
 * With a pool this size every subset can simply be tried - the same approach that verified
 * 256 of 16,384 pipe arrangements carry water before a word of that mission was written.
 * A puzzle whose uniqueness is argued rather than counted is a puzzle nobody has checked.
 */

import { pick, range } from '../core/rng.js';

import { CELL_SPEED } from './pursuit.js';

import type { Cell } from './pursuit.js';
import type { Rng } from '../core/rng.js';
import type { Heading } from './traces.js';

export type FragmentKind = 'toll' | 'sensor' | 'forecourt' | 'witness' | 'tower';

/** Something the network recorded. Not necessarily the car. */
export interface Fragment {
  id: string;
  kind: FragmentKind;
  cell: Cell;
  /** Seconds after the last camera saw him. */
  at: number;
  /** What was actually recorded, in the words the source would use. */
  detail: string;
}

export interface Trail {
  /** Where the cameras gave out. */
  from: Cell;
  heading: Heading;
  /** Where the chain has to arrive - the bridge. */
  destination: Cell;
  /** The pool, shuffled. Real fragments and things that merely happened. */
  fragments: Fragment[];
  /** The ids that reconstruct the route, in time order. Derived, never authored beside. */
  chain: string[];
}

/** Grid distance a car could cover in this many seconds, with slack for estimating. */
function reach(seconds: number): number {
  return seconds * CELL_SPEED * 1.45;
}

function gap(a: Cell, b: Cell): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Could one car have got from here to there in this long?
 *
 * Manhattan distance rather than straight line, because the car is on a street grid and
 * cannot cut across blocks - measuring as the crow flies would accept fragments no vehicle
 * could actually reach and quietly make the puzzle unfair in the player's favour, which is
 * the direction nobody notices.
 */
export function couldReach(from: Cell, to: Cell, seconds: number): boolean {
  if (seconds <= 0) return false;
  return gap(from, to) <= reach(seconds);
}

/**
 * Is this set of fragments one car going to the destination?
 *
 * Time-ordered first: the player picks a set, and the order is not theirs to choose - a
 * car cannot be at 21:58 before it was at 21:54. Sorting here rather than asking them to
 * sequence it keeps the question about plausibility instead of about clerical work.
 */
export function isCoherent(trail: Trail, chosen: string[]): boolean {
  if (chosen.length === 0) return false;

  const picked = trail.fragments
    .filter((fragment) => chosen.includes(fragment.id))
    .sort((a, b) => a.at - b.at);
  if (picked.length !== chosen.length) return false;

  let at = trail.from;
  let since = 0;
  for (const fragment of picked) {
    if (!couldReach(at, fragment.cell, fragment.at - since)) return false;
    at = fragment.cell;
    since = fragment.at;
  }

  // And it has to arrive. Without this a single nearby ping is a valid answer and the
  // puzzle has no question in it.
  return gap(at, trail.destination) <= 2;
}

/**
 * The largest coherent sets - and the answer is the largest, not merely a coherent one.
 *
 * This is the correction the audit forced, and it is worth stating plainly because the
 * first design could not work. Coherence only bounds how FAR the car went between two
 * fragments, so dropping one from the middle hands the next jump all of the skipped time
 * as well. A sparser chain is therefore always at least as easy as a denser one, every
 * subset of a valid route is itself valid, and four real fragments produced fifteen
 * perfectly good answers.
 *
 * Asking for the biggest set fixes it and is also the honest question. Nobody wants to
 * know which pings COULD be one car; they want to know which ones ARE, and that is all of
 * them that fit.
 */
export function bestSets(trail: Trail): string[][] {
  const sets = coherentSets(trail);
  const biggest = sets.reduce((max, set) => Math.max(max, set.length), 0);
  return sets.filter((set) => set.length === biggest);
}

/**
 * Every coherent set in the pool.
 *
 * Exhaustive, because the pool is small and an argued uniqueness is an unchecked one.
 * 2^10 is a thousand subsets and each is a walk of at most ten steps - the whole proof
 * costs less than drawing one frame.
 */
export function coherentSets(trail: Trail): string[][] {
  const ids = trail.fragments.map((fragment) => fragment.id);
  const found: string[][] = [];
  for (let mask = 1; mask < 1 << ids.length; mask++) {
    const subset = ids.filter((_, i) => (mask & (1 << i)) !== 0);
    if (isCoherent(trail, subset)) found.push(subset);
  }
  return found;
}

const SOURCES: Record<FragmentKind, string[]> = {
  toll: ['a toll gate registered an axle count', 'the barrier logged a vehicle, no plate'],
  sensor: ['an inductive loop counted one through', 'a speed sensor flagged nothing unusual'],
  forecourt: ['a forecourt camera has three frames', 'a garage camera caught a bumper'],
  witness: ['somebody rang it in', 'a driver called about a car on the wrong side'],
  tower: ['a handset touched a mast for four seconds', 'a phone changed cell here'],
};

const KINDS: FragmentKind[] = ['toll', 'sensor', 'forecourt', 'witness', 'tower'];

const STEP: Record<Heading, Cell> = {
  north: { x: 0, y: -1 },
  south: { x: 0, y: 1 },
  east: { x: 1, y: 0 },
  west: { x: -1, y: 0 },
};

/**
 * No clamping. The trail leaves the district on purpose.
 *
 * Phase two ends where the cameras give out, which is the edge of the map - so the walk
 * used to be pinned to the boundary and every fragment landed on the same cell, within
 * two of the destination and of each other. Every subset was coherent and the audit
 * reported fifteen answers to a question with one.
 *
 * Letting it run off the grid is also the truthful version: a toll gate on the ring road
 * and a forecourt on the bypass are outside the district, which is exactly why there are
 * no cameras on them. The phase is about a car leaving town.
 */

/**
 * Lay a trail, then bury it in things that also happened.
 *
 * The real chain is walked first and the destination falls out of where it ends - the car
 * is not routed to a bridge somebody picked, the bridge is where the car was going. Decoys
 * are then generated and REJECTED if they happen to extend a coherent route, because a
 * decoy that works is not a decoy, it is a second answer.
 */
export function planTrail(
  rng: Rng,
  options: { from: Cell; heading: Heading; size: number; steps?: number; noise?: number }
): Trail {
  const { from, heading } = options;
  const steps = options.steps ?? 4;
  const noise = options.noise ?? 5;

  const step = STEP[heading];
  const side = { x: step.y, y: -step.x };

  const real: Fragment[] = [];
  let at = { ...from };
  let clock = 0;

  for (let i = 0; i < steps; i++) {
    // Onward, with a little drift - a car following a road rather than a ruler.
    const forward = Math.round(range(rng, 4, 8));
    const drift = Math.round(range(rng, -1, 1));
    at = {
      x: at.x + step.x * forward + side.x * drift,
      y: at.y + step.y * forward + side.y * drift,
    };
    clock += Math.round(forward / CELL_SPEED) + Math.round(range(rng, 1, 5));

    const kind = pick(rng, KINDS);
    real.push({
      id: `frag-r${i}`,
      kind,
      cell: { ...at },
      at: clock,
      detail: pick(rng, SOURCES[kind]),
    });
  }

  const trail: Trail = {
    from,
    heading,
    destination: { ...at },
    fragments: [...real],
    chain: real.map((fragment) => fragment.id),
  };

  /**
   * Noise, checked rather than assumed.
   *
   * Each candidate is added to the pool and the whole thing re-counted; if the number of
   * coherent sets is still one, it is kept. That is slower than being clever and it is the
   * only way to be sure a decoy has not quietly become a shortcut.
   */
  let guard = 0;
  while (trail.fragments.length < real.length + noise && guard < noise * 40) {
    guard++;
    const kind = pick(rng, KINDS);
    const candidate: Fragment = {
      id: `frag-n${trail.fragments.length}`,
      kind,
      // Anywhere between where he was lost and where he ended up, give or take - things
      // that happened in the same corner of the night, which is what makes them plausible.
      cell: {
        x: Math.round(range(rng, Math.min(from.x, at.x) - 6, Math.max(from.x, at.x) + 6)),
        y: Math.round(range(rng, Math.min(from.y, at.y) - 6, Math.max(from.y, at.y) + 6)),
      },
      at: Math.round(range(rng, 4, clock + 20)),
      detail: pick(rng, SOURCES[kind]),
    };

    trail.fragments.push(candidate);
    const best = bestSets(trail);
    const stillTheAnswer =
      best.length === 1 && [...best[0]].sort().join() === [...trail.chain].sort().join();
    if (!stillTheAnswer) trail.fragments.pop();
  }

  // Shuffled so the real ones are not the first four in the list.
  for (let i = trail.fragments.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [trail.fragments[i], trail.fragments[j]] = [trail.fragments[j], trail.fragments[i]];
  }

  return trail;
}
