/**
 * Grading, for every kind of device.
 *
 * One function, one switch, and the compiler checks the switch is exhaustive - so adding
 * a device to the union in `types.ts` and forgetting to grade it is a build error rather
 * than a puzzle that can never be solved.
 *
 * Kept out of MissionRuntime because the runtime's job is walking a beat graph, and it
 * should not also need to know how water finds a drain.
 */

import { CLUES, matches, satisfies } from './traces.js';
import { replayBeam } from './beam.js';
import { workLock } from './lock.js';
import { flows, wetted } from './pipes.js';

import type { ClueId } from './traces.js';
import type { Device } from './types.js';

/** What the player sent up from the console. Discriminated to match the device. */
export type DeviceSubmission =
  | { kind: 'relations'; links: Record<string, string> }
  | { kind: 'pipes'; rotations: number[] }
  | { kind: 'lock'; order: string[] }
  /** Every call the player made, and when. The runtime replays them (§157). */
  | { kind: 'beam'; calls: Array<{ at: number; to: number }> }
  /** The trace the player says it is. One id, not a filter state. */
  | { kind: 'traces'; traceId: string }
  /** One camera id per hop, in order. */
  | { kind: 'pursuit'; picks: string[] };

export interface DeviceResult {
  solved: boolean;
  /**
   * What the contact reports back when it is not solved.
   *
   * §159's clarification, in the device's own terms. Never a list of what is wrong -
   * that turns a puzzle into elimination - and never a bare "no", which on a sixteen-cell
   * grid tells the player nothing they can act on.
   */
  note?: string;
}

/** 1st, 2nd, 3rd. Small, but "on the 1 hop" reads as a bug in the writing. */
function ordinal(n: number): string {
  const tail = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${tail}`;
}

export function gradeDevice(device: Device, submission: DeviceSubmission): DeviceResult {
  switch (device.kind) {
    case 'relations': {
      if (submission.kind !== 'relations') return { solved: false };
      const right = device.people.filter(
        (person) => submission.links[person.id] === person.answer
      ).length;
      return {
        solved: right === device.people.length,
        note: `${right} of ${device.people.length} were right`,
      };
    }

    case 'pipes': {
      if (submission.kind !== 'pipes') return { solved: false };
      if (flows(device.grid, submission.rotations)) return { solved: true };
      // How far down the run the water got, which is what a person at the tap can hear.
      const reach = Math.round(wetted(device.grid, submission.rotations) * 100);
      return { solved: false, note: `water reaches about ${reach}% of the run` };
    }

    case 'lock': {
      if (submission.kind !== 'lock') return { solved: false };
      const reading = workLock(device.lock, submission.order);
      return {
        solved: reading.solved,
        // The contact's own words, in the order they felt them, ending at the pin that
        // would not go. That last line is the whole clue.
        note: reading.felt.join(' '),
      };
    }

    case 'beam': {
      if (submission.kind !== 'beam') return { solved: false };
      const ending = replayBeam(device.beam, submission.calls);
      if (ending.blinded) return { solved: true };
      // How long the light was actually on him. The only useful thing to say, because the
      // player already watched the whole thing happen.
      const held = ending.held.toFixed(1);
      return { solved: false, note: `you had the light on him for ${held} seconds` };
    }

    case 'traces': {
      if (submission.kind !== 'traces') return { solved: false };
      const named = device.fleet.find((trace) => trace.id === submission.traceId);
      if (!named) return { solved: false };

      /**
       * Graded by the evidence, not against a stored answer.
       *
       * There IS a guilty car in the data, and it would be one line to compare ids. But
       * then the device and the evidence would be two sources of truth, and the day
       * somebody adjusts a clue the game would start rejecting the only car that fits what
       * the officer said. Asking `matches` means the puzzle is right by construction: the
       * accepted answer is whatever the police described, always.
       */
      if (matches(named, device.evidence)) return { solved: true };

      /**
       * The note names which fact it fails, and only ever one.
       *
       * §159 wants clarification rather than a red cross, and this is the shape of it here
       * - "that one was heading north" is something the player can act on. Listing every
       * failed clue would turn deduction into elimination: submit anything, read off the
       * differences, submit again.
       */
      const wrong = CLUES.find((clue) => !satisfies(named, device.evidence, clue));
      const reason: Record<ClueId, string> = {
        colour: `that one is ${named.colour}`,
        body: `that one is a ${named.body}`,
        seenBetween: 'that one was last seen at the wrong time',
        heading: `that one was heading ${named.heading}`,
        plate: 'the plate does not fit what they read',
        brokenLight: named.brokenLight
          ? 'both lights are out on that one'
          : 'that one has both tail lights',
      };
      return { solved: false, note: wrong ? reason[wrong] : 'that is not the one' };
    }

    case 'pursuit': {
      if (submission.kind !== 'pursuit') return { solved: false };
      if (submission.picks.length !== device.hops.length) return { solved: false };

      const wrongAt = device.hops.findIndex((hop, i) => submission.picks[i] !== hop.answer);
      if (wrongAt === -1) return { solved: true };

      /**
       * Names the FIRST mistake, and why, and nothing after it.
       *
       * Everything past the first wrong turn is downstream of a car the player was no
       * longer following, so reporting those too would be blaming them for consequences of
       * a mistake they have not been told about yet. And the reason is the whole value of
       * the classifier: "he had already passed it" is a correction, "wrong" is a buzzer.
       */
      const hop = device.hops[wrongAt];
      const chosen = hop.options.find((option) => option.id === submission.picks[wrongAt]);
      const why: Record<string, string> = {
        behind: 'he had already passed it',
        unreachable: 'he could not have got that far in the time',
        'off-route': 'that is not on the road he was on',
      };
      const reason = chosen?.fails ? why[chosen.fails] : 'nothing came through';
      return { solved: false, note: `on the ${ordinal(wrongAt + 1)} hop - ${reason}` };
    }

    default: {
      // Exhaustiveness: a new device kind that nobody graded fails to compile here.
      const unreachable: never = device;
      return unreachable;
    }
  }
}
