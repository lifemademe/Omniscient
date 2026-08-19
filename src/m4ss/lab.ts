/**
 * One room of the facility, built to ask one question.
 *
 * Everything the design conversation said the first test needed and nothing else: a slime,
 * biomass to eat, and growth points it cannot all afford. No predators, no acts, no story.
 * The only thing worth learning first is whether reaching feels good.
 *
 * Read left to right it is a ramp. The first growth point is inside the starting reach, the
 * second is not, and the biomass between them is the reason to go and get bigger. A player
 * who tries the second one, watches the tendril thin and part, and goes to eat something
 * without being told to, has understood the game.
 *
 * Authored with y DOWN, like a tile editor or a screenshot. M4SSRig flips it exactly once.
 */

import type { World } from './mass.js';

export const THE_LAB: World = {
  width: 1280,
  height: 720,
  start: { x: 150, y: 540 },
  tiles: [
    // the specimen floor
    { x: 0, y: 620, w: 1280, h: 120 },
    // walls, so a slime that overshoots has somewhere to hit
    { x: -40, y: 0, w: 60, h: 720 },
    { x: 1260, y: 0, w: 60, h: 720 },
    // a low bench, reachable from the first growth point
    { x: 430, y: 470, w: 190, h: 26 },
    // the high ledge - this is the one that costs mass
    { x: 830, y: 300, w: 430, h: 30 },
    // a stub under it, so the climb brushes something on the way
    { x: 1080, y: 470, w: 180, h: 24 },
  ],
  /**
   * Growth points, clicked to latch.
   *
   * Discrete rather than latch-anywhere, for three reasons: the player always knows what is
   * grabbable, a designer controls the routes, and a failed reach is unambiguous - you aimed
   * at THAT and did not make it, rather than aiming at a wall and wondering if you missed.
   */
  anchors: [
    { x: 470, y: 452 },
    { x: 700, y: 380 },
    { x: 900, y: 282 },
  ],
  food: [
    { x: 300, y: 604, mass: 14, eaten: false },
    { x: 352, y: 604, mass: 14, eaten: false },
    { x: 690, y: 604, mass: 22, eaten: false },
    { x: 758, y: 604, mass: 22, eaten: false },
    { x: 980, y: 604, mass: 30, eaten: false },
    { x: 520, y: 452, mass: 18, eaten: false },
  ],
};

/** A fresh copy - eating mutates the food, and the harness runs the level many times. */
export function freshLab(): World {
  return {
    ...THE_LAB,
    tiles: THE_LAB.tiles.map((t) => ({ ...t })),
    anchors: THE_LAB.anchors.map((a) => ({ ...a })),
    food: THE_LAB.food.map((f) => ({ ...f })),
  };
}
