/**
 * The surveillance device: a city full of moving vehicles, and five facts about one of them.
 *
 * ## What the player actually does
 *
 * Not "find the car". The police contact has incomplete evidence - a partial plate, a
 * colour, a body shape, a time and a direction - and the city is carrying dozens of traces
 * that each match SOME of it. Applying one filter leaves a crowd. Applying all of them
 * leaves one. The verb is narrowing, and it is the closest thing this game has to letting
 * the player think the way the machine is supposed to think.
 *
 * ## The property that makes it a deduction rather than a lottery
 *
 * Every clue is NECESSARY and together they are SUFFICIENT.
 *
 * Sufficient is the easy half: exactly one trace matches all of the evidence. Necessary is
 * the half that decides whether the puzzle is real - for each clue there is a decoy that
 * matches everything EXCEPT that clue, so dropping any single fact leaves at least two
 * candidates and the player cannot get there while ignoring part of what they were told.
 *
 * This is built rather than hoped for: `planFleet` plants one near-miss per clue by
 * construction. That is the same discipline as the cellar's pipe grid, where 256 of 16,384
 * arrangements were verified to carry water before a line of dialogue was written - §157
 * says presentation never decides mission truth, so the truth is a predicate over the data
 * and `auditFleet` can prove it without rendering anything.
 *
 * ## Why the traces carry positions
 *
 * Because phase two is camera-hopping and phase three is breadcrumbs, and both need to
 * agree with phase one about where things are. One list of traces, read three ways.
 */

import { pick, range } from '../core/rng.js';

import type { Rng } from '../core/rng.js';

export type VehicleColour = 'red' | 'white' | 'grey' | 'blue' | 'green' | 'black';
export type VehicleBody = 'sedan' | 'hatch' | 'van' | 'pickup';
export type Heading = 'north' | 'east' | 'south' | 'west';

export const COLOURS: VehicleColour[] = ['red', 'white', 'grey', 'blue', 'green', 'black'];
export const BODIES: VehicleBody[] = ['sedan', 'hatch', 'van', 'pickup'];
export const HEADINGS: Heading[] = ['north', 'east', 'south', 'west'];

/** A vehicle the network has seen. Positions are city-grid cells, not metres. */
export interface Trace {
  id: string;
  colour: VehicleColour;
  body: VehicleBody;
  /** Minutes past midnight of its last confirmed ping. */
  lastSeen: number;
  heading: Heading;
  /** Six characters. The police only have some of them. */
  plate: string;
  /** The broken tail light, which is the one thing a witness actually remembers. */
  brokenLight: boolean;
  cell: { x: number; y: number };
}

/**
 * What the police have, and nothing more.
 *
 * Every field optional on purpose: the mission reveals them one at a time as the officer
 * remembers things and the network confirms them, and the same predicate has to work when
 * the player knows two facts and when they know five.
 */
export interface Evidence {
  colour?: VehicleColour;
  body?: VehicleBody;
  /** Inclusive window in minutes past midnight - "last seen around 21:43". */
  seenBetween?: [number, number];
  heading?: Heading;
  /** Six slots; null where the character is unknown. */
  plate?: (string | null)[];
  brokenLight?: boolean;
}

/** The clue names, in the order the mission hands them over. */
export type ClueId = 'colour' | 'body' | 'seenBetween' | 'heading' | 'plate' | 'brokenLight';
export const CLUES: ClueId[] = ['colour', 'body', 'seenBetween', 'heading', 'plate', 'brokenLight'];

/** Does one trace satisfy one clue? Absent clues are satisfied by everything. */
export function satisfies(trace: Trace, evidence: Evidence, clue: ClueId): boolean {
  switch (clue) {
    case 'colour':
      return evidence.colour === undefined || trace.colour === evidence.colour;
    case 'body':
      return evidence.body === undefined || trace.body === evidence.body;
    case 'heading':
      return evidence.heading === undefined || trace.heading === evidence.heading;
    case 'brokenLight':
      return evidence.brokenLight === undefined || trace.brokenLight === evidence.brokenLight;
    case 'seenBetween': {
      if (evidence.seenBetween === undefined) return true;
      const [from, to] = evidence.seenBetween;
      return trace.lastSeen >= from && trace.lastSeen <= to;
    }
    case 'plate': {
      if (evidence.plate === undefined) return true;
      return evidence.plate.every((ch, i) => ch === null || trace.plate[i] === ch);
    }
  }
}

/** Every clue, or the subset asked for. */
export function matches(trace: Trace, evidence: Evidence, clues: ClueId[] = CLUES): boolean {
  return clues.every((clue) => satisfies(trace, evidence, clue));
}

/** The survivors. This is what the player watches count down. */
export function narrow(fleet: Trace[], evidence: Evidence, clues: ClueId[] = CLUES): Trace[] {
  return fleet.filter((trace) => matches(trace, evidence, clues));
}

/**
 * How many remain after each clue is applied in turn.
 *
 * The mission uses this for the count the player reads - 47, 12, 4, 1. It is derived from
 * the fleet rather than authored beside it, so the numbers in the fiction cannot drift away
 * from the numbers in the data, which is the way this sort of thing usually rots.
 */
export function narrowing(fleet: Trace[], evidence: Evidence, order: ClueId[]): number[] {
  const counts: number[] = [];
  const applied: ClueId[] = [];
  for (const clue of order) {
    applied.push(clue);
    counts.push(narrow(fleet, evidence, applied).length);
  }
  return counts;
}

export interface FleetAudit {
  /** Exactly one trace matches everything. */
  sufficient: boolean;
  survivors: number;
  /** Clues that can be dropped without the answer becoming ambiguous - all should be none. */
  redundant: ClueId[];
}

/**
 * Prove the puzzle before anybody plays it.
 *
 * A redundant clue is not a harmless extra: it is a fact the officer tells the player, that
 * the player then spends time on, that could not have changed the answer. That is the
 * texture of a puzzle that is secretly a cutscene.
 */
export function auditFleet(fleet: Trace[], evidence: Evidence): FleetAudit {
  const survivors = narrow(fleet, evidence).length;
  const redundant = CLUES.filter((drop) => {
    if (evidence[drop] === undefined) return false;
    const without = CLUES.filter((clue) => clue !== drop);
    return narrow(fleet, evidence, without).length <= 1;
  });
  return { sufficient: survivors === 1, survivors, redundant };
}

const PLATE_LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ';
const PLATE_DIGITS = '0123456789';

function plate(rng: Rng): string {
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += i < 2 ? pick(rng, PLATE_LETTERS.split('')) : pick(rng, PLATE_DIGITS.split(''));
  }
  return out;
}

/**
 * A trace differing from `base` in exactly the one attribute named.
 *
 * Takes the evidence because a near miss has to fail the clue AS THE POLICE HAVE IT, not
 * as the world has it. The plate case proves the point: it used to change a random
 * character from slot 2 to 5, but the officer only read slots 3 and 4 - so half the time
 * the decoy changed a digit nobody knew about, still matched the partial plate, still
 * matched everything else, and became a second suspect. Caught by auditing a seed other
 * than the authored one, which is the whole reason that check exists.
 */
function nearMiss(rng: Rng, base: Trace, clue: ClueId, id: string, evidence: Evidence): Trace {
  const miss: Trace = { ...base, id, cell: { ...base.cell } };

  /**
   * Its own plate, in the characters nobody read.
   *
   * A near miss is a copy of the suspect with one attribute changed, which meant it also
   * carried the suspect's plate - so the board showed two cars with identical plates, and
   * a surveillance network that reports duplicate registrations has a bug in it, not a
   * puzzle. Only the slots the camera actually read have to match; the rest are free.
   *
   * That is also a better description of why a partial plate is not enough on its own.
   * Several cars in the district share the two characters somebody got at night in the
   * rain, and now they visibly do.
   */
  if (clue !== 'plate') {
    const known = evidence.plate ?? [];
    miss.plate = base.plate
      .split('')
      .map((ch, i) => {
        if (known[i] != null) return ch;
        const alphabet = i < 2 ? PLATE_LETTERS : PLATE_DIGITS;
        return pick(rng, alphabet.split('').filter((c) => c !== ch));
      })
      .join('');
  }
  switch (clue) {
    case 'colour':
      miss.colour = pick(rng, COLOURS.filter((c) => c !== base.colour));
      break;
    case 'body':
      miss.body = pick(rng, BODIES.filter((b) => b !== base.body));
      break;
    case 'heading':
      miss.heading = pick(rng, HEADINGS.filter((h) => h !== base.heading));
      break;
    case 'brokenLight':
      miss.brokenLight = !base.brokenLight;
      break;
    case 'seenBetween':
      // Well outside any plausible window, in one direction or the other.
      miss.lastSeen = base.lastSeen + (rng() < 0.5 ? -1 : 1) * Math.round(range(rng, 22, 70));
      break;
    case 'plate': {
      // A character the police actually HAVE, so it fails the partial plate and nothing else.
      const known = (evidence.plate ?? [])
        .map((ch, i) => (ch === null ? -1 : i))
        .filter((i) => i >= 0);
      const chars = base.plate.split('');
      const slot = known.length ? pick(rng, known) : 3;
      const alphabet = slot < 2 ? PLATE_LETTERS : PLATE_DIGITS;
      chars[slot] = pick(rng, alphabet.split('').filter((d) => d !== chars[slot]));
      miss.plate = chars.join('');
      break;
    }
  }
  return miss;
}

export interface FleetPlan {
  fleet: Trace[];
  suspect: Trace;
  evidence: Evidence;
}

/**
 * Build a city's worth of traffic around one guilty car.
 *
 * The near misses come first and are non-negotiable - one per clue, each failing only that
 * clue - because they are what make every fact matter. The filler is then generated and
 * REJECTED if it happens to match everything, which is the only way a random decoy can
 * break the puzzle.
 *
 * @param count total traces including the suspect and its near misses
 */
export function planFleet(rng: Rng, count: number, gridSize: number): FleetPlan {
  const suspect: Trace = {
    id: 'trace-000',
    colour: 'red',
    body: 'sedan',
    // 21:43, which is the time the officer gives.
    lastSeen: 21 * 60 + 43,
    heading: 'east',
    plate: plate(rng),
    brokenLight: true,
    cell: { x: Math.floor(gridSize * 0.72), y: Math.floor(gridSize * 0.38) },
  };

  const evidence: Evidence = {
    colour: 'red',
    body: 'sedan',
    seenBetween: [21 * 60 + 38, 21 * 60 + 48],
    heading: 'east',
    // Two characters, from a plate read at night through rain.
    plate: [null, null, null, suspect.plate[3], suspect.plate[4], null],
    brokenLight: true,
  };

  const fleet: Trace[] = [suspect];
  CLUES.forEach((clue, i) => {
    /**
     * Retried rather than trusted.
     *
     * The construction is supposed to guarantee that a near miss fails exactly one clue,
     * and it does - but a silent second suspect is the one failure this device cannot
     * survive, so the invariant is asserted here as well as designed for. If a decoy ever
     * comes back matching everything it is rebuilt, and if it somehow cannot be, it is
     * dropped rather than shipped.
     */
    for (let attempt = 0; attempt < 12; attempt++) {
      const miss = nearMiss(rng, suspect, clue, `trace-n${i}`, evidence);
      if (!matches(miss, evidence)) {
        fleet.push(miss);
        break;
      }
    }
  });

  let guard = 0;
  while (fleet.length < count && guard < count * 40) {
    guard++;
    const filler: Trace = {
      id: `trace-${String(fleet.length).padStart(3, '0')}`,
      colour: pick(rng, COLOURS),
      body: pick(rng, BODIES),
      lastSeen: Math.round(range(rng, 20 * 60, 23 * 60)),
      heading: pick(rng, HEADINGS),
      plate: plate(rng),
      brokenLight: rng() < 0.08,
      cell: {
        x: Math.floor(range(rng, 0, gridSize)),
        y: Math.floor(range(rng, 0, gridSize)),
      },
    };
    // The one thing a random car must not be is a second suspect.
    if (matches(filler, evidence)) continue;
    fleet.push(filler);
  }

  return { fleet, suspect, evidence };
}
