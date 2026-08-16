/**
 * Phase two: following a car through a camera network by predicting where it goes next.
 *
 * ## What the player is actually doing
 *
 * Phase one was narrowing - a static crowd reduced by facts. This is the opposite verb.
 * The car is identified and moving, the network cannot see all of it at once, and the
 * question at every step is WHICH CAMERA PICKS IT UP NEXT. Get it right and you keep
 * contact; get it wrong and the car gains distance while you are looking at an empty
 * junction.
 *
 * That is prediction rather than search, and it is the honest version of what a
 * surveillance system does. Nothing here tracks the car. There is no dot moving across a
 * map. There are cameras, and between them there is nothing at all.
 *
 * ## The property that makes each hop a deduction
 *
 * At every step exactly one offered camera is consistent with the last sighting, and every
 * other option fails for exactly one NAMEABLE reason:
 *
 *   behind      - it is back the way the car came
 *   unreachable - the car cannot cover that ground in the time available
 *   off-route   - it is on a road the car would have had to turn onto, and no camera saw
 *                 it turn
 *
 * The same discipline as the near misses in traces.ts, and it pays off twice: it makes the
 * hop solvable by reasoning from the three facts the player has (where, which way, how
 * long), and it means a wrong pick can be answered with a sentence rather than a buzzer.
 *
 * ## Why the trail runs out on purpose
 *
 * The city generator thins camera coverage towards the district edge, and that was written
 * down as level design rather than decoration. This is what it was for. The route leaves
 * the covered middle, the options run dry, and the mission moves to phase three - not
 * because the player failed, but because the network genuinely ends. Mission 08 already
 * teaches `coverage-thins-at-the-edge` as a fact; this is the player finding out what it
 * costs.
 */

import { pick, range } from '../core/rng.js';

import type { Rng } from '../core/rng.js';
import type { Heading } from './traces.js';

/** A grid cell. Same coordinates as the trace device and the city - see wireCity.ts. */
export interface Cell {
  x: number;
  y: number;
}

/** Unit step for each heading, in grid cells. */
const STEP: Record<Heading, Cell> = {
  north: { x: 0, y: -1 },
  south: { x: 0, y: 1 },
  east: { x: 1, y: 0 },
  west: { x: -1, y: 0 },
};

/**
 * Cells per second.
 *
 * A cell is 8m, so this is about 30 km/h - town speed for somebody who has just left a
 * scene and does not want to be the fastest car on the road. It matters that the player
 * can do this arithmetic roughly in their head: six seconds is about six blocks.
 */
export const CELL_SPEED = 1.05;

export type HopFailure = 'behind' | 'unreachable' | 'off-route';

export interface HopOption {
  id: string;
  cell: Cell;
  /** null on the one camera that actually picks the car up. */
  fails: HopFailure | null;
}

export interface Hop {
  /** Where and which way the car was last confirmed, which is all the player has. */
  from: Cell;
  heading: Heading;
  /** Seconds since that sighting by the time the player has to choose. */
  seconds: number;
  options: HopOption[];
  /** Id of the option with `fails: null`. Derived, never authored separately. */
  answer: string;
}

export interface Pursuit {
  hops: Hop[];
  /**
   * True when the chase ended because the NETWORK ran out, which is the design, and false
   * when it merely hit the hop cap.
   *
   * Worth a field rather than being inferred from the hop count. Phase three exists
   * because coverage thins at the district edge; a chase that stopped because a loop
   * counter ran out has not earned that transition, it has been interrupted. The two look
   * identical from outside and mean completely different things.
   */
  ranDry: boolean;
  /** The cell the trail goes cold on - where phase three starts. */
  lost: Cell;
  /** Which way it was going when the cameras ran out. Phase three needs it. */
  lostHeading: Heading;
}

const TURNS: Record<Heading, Heading[]> = {
  north: ['west', 'east'],
  south: ['west', 'east'],
  east: ['north', 'south'],
  west: ['north', 'south'],
};

/** How far ahead of `from`, along `heading`, a cell sits. Negative means behind. */
function ahead(from: Cell, heading: Heading, cell: Cell): number {
  const step = STEP[heading];
  return (cell.x - from.x) * step.x + (cell.y - from.y) * step.y;
}

/** How far off the road the car is on, measured across its direction of travel. */
function across(from: Cell, heading: Heading, cell: Cell): number {
  const step = STEP[heading];
  return Math.abs((cell.x - from.x) * step.y - (cell.y - from.y) * step.x);
}

/**
 * Why this camera is not the one - or null if it is.
 *
 * Order matters and is deliberate: a camera can be both behind AND off-route, and the
 * player should be told the most obvious thing wrong with it. "That is back the way he
 * came" is a better sentence than "that is on a different street".
 */
export function classify(
  from: Cell,
  heading: Heading,
  seconds: number,
  cell: Cell
): HopFailure | null {
  const forward = ahead(from, heading, cell);
  if (forward <= 0) return 'behind';

  // A little slack either side: the player is estimating, not solving.
  const reach = seconds * CELL_SPEED;
  if (forward > reach * 1.35) return 'unreachable';
  if (across(from, heading, cell) > 1) return 'off-route';
  return null;
}

/**
 * Build the chase.
 *
 * The route is walked first and the cameras are read off it, rather than the route being
 * bent to hit cameras somebody placed. That ordering is what keeps the trail honest: the
 * car drives where a car would drive, and the network sees what it happens to see.
 */
export function planPursuit(
  rng: Rng,
  options: { cameras: Cell[]; start: Cell; heading: Heading; size: number; maxHops?: number }
): Pursuit {
  const { cameras, start, size } = options;
  /**
   * A backstop, not a design element.
   *
   * It was 5, and a dense district hit it with cameras still to spare - so the chase ended
   * on a loop counter and the audit could not tell that from the network genuinely running
   * out. Generous enough that reaching it means something has gone wrong.
   */
  const maxHops = options.maxHops ?? 12;

  const isCamera = (cell: Cell): boolean =>
    cameras.some((camera) => camera.x === cell.x && camera.y === cell.y);

  const hops: Hop[] = [];
  let ranDry = false;
  let at = { ...start };
  let heading = options.heading;
  let lost = { ...start };
  let lostHeading = heading;

  for (let hop = 0; hop < maxHops; hop++) {
    /**
     * Drive until a camera sees it.
     *
     * The occasional turn is what stops the answer being "the furthest one in a straight
     * line" every time. It only turns at a junction it has already passed a camera on, so
     * the player is never asked to predict a turn nobody saw - that would be a guess, and
     * a guess dressed as a deduction is worse than an honest coin flip.
     */
    let seconds = 0;
    let found: Cell | null = null;
    for (let step = 0; step < size; step++) {
      let next = { x: at.x + STEP[heading].x, y: at.y + STEP[heading].y };

      /**
       * Reaching the district boundary ends the trail. It does NOT turn here.
       *
       * I had it turning at the edge to stop the chase running out of road, and it broke
       * the whole device: a leg that changes heading half way along is no longer described
       * by the heading recorded against it, so `from` plus `heading` stopped predicting
       * where the car actually went and three of four districts audited with two
       * consistent cameras per hop. The comment above this loop already said the car only
       * turns where a camera watched it turn - the fix was to believe it.
       *
       * The real problem was a start position six cells from the far edge, which is fixed
       * where the suspect is placed. Leaving the district is a legitimate way for a trail
       * to end, and it is the one Lucian describes: he is heading for the bridge.
       */
      if (next.x < 0 || next.y < 0 || next.x >= size || next.y >= size) break;

      at = next;
      seconds += 1 / CELL_SPEED;
      if (isCamera(at)) {
        found = { ...at };
        break;
      }
    }

    if (!found) {
      // The network has run out. This is where phase three begins.
      ranDry = true;
      lost = { ...at };
      lostHeading = heading;
      break;
    }

    const from = hops.length === 0 ? start : hops[hops.length - 1].options
      .find((option) => option.id === hops[hops.length - 1].answer)!.cell;

    const answer: HopOption = { id: `cam-${hop}-a`, cell: found, fails: null };

    /**
     * One distractor per failure mode, and each is CHECKED rather than assumed.
     *
     * A camera invented to be "behind" that happens to also be unreachable would teach the
     * player the wrong lesson when they asked why. So each candidate is run through the
     * same `classify` the grader uses, and only kept if it fails the way it was meant to.
     */
    const wanted: HopFailure[] = ['behind', 'unreachable', 'off-route'];
    const decoys: HopOption[] = [];
    for (const [i, mode] of wanted.entries()) {
      const cell = decoyFor(rng, from, heading, Math.round(seconds), mode, size);
      if (cell && classify(from, heading, Math.round(seconds), cell) === mode) {
        decoys.push({ id: `cam-${hop}-${i}`, cell, fails: mode });
      }
    }

    hops.push({
      from,
      heading,
      seconds: Math.round(seconds),
      options: shuffle(rng, [answer, ...decoys]),
      answer: answer.id,
    });

    lost = { ...found };
    lostHeading = heading;
    // Turn sometimes, and only at the junction the camera just watched it cross.
    if (rng() < 0.4) heading = pick(rng, TURNS[heading]);
  }

  return { hops, ranDry, lost, lostHeading };
}

/** A cell that fails in one specific way, or null when the grid leaves no room for one. */
function decoyFor(
  rng: Rng,
  from: Cell,
  heading: Heading,
  seconds: number,
  mode: HopFailure,
  size: number
): Cell | null {
  const step = STEP[heading];
  const side = { x: step.y, y: -step.x };
  const reach = seconds * CELL_SPEED;

  const build = (): Cell => {
    switch (mode) {
      case 'behind': {
        const back = Math.round(range(rng, 1, Math.max(2, reach * 0.6)));
        return { x: from.x - step.x * back, y: from.y - step.y * back };
      }
      case 'unreachable': {
        const far = Math.round(reach * range(rng, 1.7, 2.4));
        return { x: from.x + step.x * far, y: from.y + step.y * far };
      }
      case 'off-route': {
        const on = Math.round(range(rng, 1, Math.max(2, reach * 0.8)));
        const off = Math.round(range(rng, 2, 4));
        return {
          x: from.x + step.x * on + side.x * off,
          y: from.y + step.y * on + side.y * off,
        };
      }
    }
  };

  for (let attempt = 0; attempt < 8; attempt++) {
    const cell = build();
    if (cell.x >= 0 && cell.y >= 0 && cell.x < size && cell.y < size) return cell;
  }
  return null;
}

/** Deterministic shuffle, so the answer is not always in the same slot. */
function shuffle<T>(rng: Rng, items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface PursuitAudit {
  hops: number;
  /** Hops where exactly one option is consistent. Should equal `hops`. */
  singleAnswer: number;
  /** Hops where every decoy fails the way it claims to. Should equal `hops`. */
  honestDecoys: number;
  /** Hops offering fewer than two options - unanswerable as a choice. */
  thin: number;
}

/**
 * Prove the chase before anybody plays it.
 *
 * A hop with two consistent cameras is a coin flip wearing a deduction's clothes, and a
 * hop with one option is not a question. Both are invisible by inspection and obvious to
 * a loop.
 */
export function auditPursuit(pursuit: Pursuit): PursuitAudit {
  let singleAnswer = 0;
  let honestDecoys = 0;
  let thin = 0;

  for (const hop of pursuit.hops) {
    const consistent = hop.options.filter(
      (option) => classify(hop.from, hop.heading, hop.seconds, option.cell) === null
    );
    if (consistent.length === 1 && consistent[0].id === hop.answer) singleAnswer++;
    if (
      hop.options.every(
        (option) => classify(hop.from, hop.heading, hop.seconds, option.cell) === option.fails
      )
    ) {
      honestDecoys++;
    }
    if (hop.options.length < 2) thin++;
  }

  return { hops: pursuit.hops.length, singleAnswer, honestDecoys, thin };
}
