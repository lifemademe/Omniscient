/**
 * The lock, and what the player is actually doing at it.
 *
 * The third device, and the one where the temptation to build the wrong game is strongest.
 * Every lockpicking minigame ever shipped is a DEXTERITY test - hold the tension, feel for
 * the binding pin, ease off before it drops. That is a fine thing and it is not this game.
 * OMNISCIENT_ has no hands. The whole premise is that somebody else has the hands and you
 * have the part they cannot do, and a twitch test hands the wrong half to the wrong party.
 *
 * So this is deduction. The contact works the pins and reports what they feel; the player
 * works out the order the pins have to be set in. That is a real property of a real lock:
 * pins bind in the order their tolerances put them, not left to right, and finding that
 * order by feel is exactly what separates somebody who can open a lock from somebody
 * holding a pick.
 *
 * The player never touches a pin. They say "third, then first, then fifth" and the hands
 * on the other end do it - which is the same division of labour as every other request in
 * the game, expressed as a mechanism instead of as a sentence.
 */

/** One pin, and where it sits in the true binding order. */
export interface LockPin {
  id: string;
  /**
   * What the contact says when this pin is tried too early, before the pins that bind
   * ahead of it are set.
   *
   * Authored per pin because it is the only information the player gets, and identical
   * feedback on five pins is a five-way guess rather than a deduction.
   */
  early: string;
  /** What they say when it sets. */
  sets: string;
  /** Its place in the true order, from 1. */
  order: number;
}

export interface LockSpec {
  pins: LockPin[];
}

export interface LockReading {
  /** How many pins at the front of the submitted order were correct. */
  correct: number;
  /** What the contact felt, in their own words, one line per pin tried. */
  felt: string[];
  solved: boolean;
}

/**
 * Work the pins in the order the player gave, and stop at the first one that will not set.
 *
 * Stopping is the whole design. A lock does not let you skip a binding pin and come back -
 * set them out of order and the ones already set drop when you release, which is why a
 * real attempt is a sequence and not a set. It also means a wrong answer teaches: the
 * player learns exactly how far their order held before it failed, and that the pin they
 * tried next is not the one that binds there.
 */
export function workLock(spec: LockSpec, attempt: string[]): LockReading {
  const byId = new Map(spec.pins.map((pin) => [pin.id, pin]));
  const felt: string[] = [];
  let correct = 0;

  for (const id of attempt) {
    const pin = byId.get(id);
    if (!pin) break;

    // The pin that should be set at this depth is the one whose order is next.
    if (pin.order === correct + 1) {
      felt.push(pin.sets);
      correct += 1;
      continue;
    }

    felt.push(pin.early);
    break;
  }

  return { correct, felt, solved: correct === spec.pins.length };
}
