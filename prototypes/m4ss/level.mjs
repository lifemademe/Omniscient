/**
 * One room, built to ask one question.
 *
 * The greybox has exactly the four things the design conversation said it needed: a slime, a
 * gap it cannot cross, something to eat, and a ledge it cannot reach. Everything else - the
 * facility, the predators, the acts - is deliberately absent, because the only thing worth
 * learning today is whether reaching feels good.
 *
 * Read left to right it is a difficulty ramp:
 *
 *   1. a low growth point, reachable at starting mass - teaches what latching does
 *   2. food on the floor between the two - the reason to go and get bigger
 *   3. a high growth point on the ledge, NOT reachable at starting mass - the snap
 *
 * The third one is the whole experiment. A player who tries it, watches the neck thin and
 * part, and goes to eat something without being told to, has understood the game.
 */

export const LEVEL = {
  width: 1280,
  height: 720,
  start: { x: 150, y: 560 },
  /** Everything solid. Origin top-left, y down, like the canvas. */
  tiles: [
    // floor
    { x: 0, y: 620, w: 1280, h: 100 },
    // the near wall the slime starts against
    { x: 0, y: 0, w: 40, h: 720 },
    { x: 1240, y: 0, w: 40, h: 720 },
    // a low shelf, reachable from the first growth point
    { x: 430, y: 470, w: 190, h: 30 },
    // the high ledge - this is the one that needs mass
    { x: 830, y: 300, w: 410, h: 34 },
    // a stub under the ledge, so the climb has something to brush against
    { x: 1080, y: 470, w: 160, h: 26 },
  ],
  /**
   * Growth points. Clicked with the left mouse to latch.
   *
   * Deliberately discrete rather than "latch anywhere". Three reasons: the player always
   * knows what is grabbable, a level designer controls the routes, and a failed reach is
   * unambiguous - you aimed at THAT and did not make it, rather than aiming at a wall and
   * wondering whether you missed.
   */
  anchors: [
    { x: 470, y: 452, note: 'low - reachable at 60' },
    { x: 700, y: 380, note: 'mid - wants about 110' },
    { x: 900, y: 282, note: 'high - the ledge, wants about 200' },
  ],
  /** Biomass on the floor. Each is worth its mass in particles. */
  food: [
    { x: 300, y: 600, mass: 14, eaten: false },
    { x: 360, y: 600, mass: 14, eaten: false },
    { x: 690, y: 600, mass: 22, eaten: false },
    { x: 760, y: 600, mass: 22, eaten: false },
    { x: 980, y: 600, mass: 30, eaten: false },
    { x: 520, y: 452, mass: 18, eaten: false },
  ],
};

/** A fresh copy, because eating mutates the food and the harness runs the level many times. */
export function freshLevel() {
  return {
    ...LEVEL,
    tiles: LEVEL.tiles.map((t) => ({ ...t })),
    anchors: LEVEL.anchors.map((a) => ({ ...a })),
    food: LEVEL.food.map((f) => ({ ...f })),
  };
}
