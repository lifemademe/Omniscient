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

import { workLock } from './lock.js';
import { flows, wetted } from './pipes.js';

import type { Device } from './types.js';

/** What the player sent up from the console. Discriminated to match the device. */
export type DeviceSubmission =
  | { kind: 'relations'; links: Record<string, string> }
  | { kind: 'pipes'; rotations: number[] }
  | { kind: 'lock'; order: string[] };

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

    default: {
      // Exhaustiveness: a new device kind that nobody graded fails to compile here.
      const unreachable: never = device;
      return unreachable;
    }
  }
}
