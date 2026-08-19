/**
 * Stage two, which is stage one's sentence asked upward.
 *
 * Stage one taught four verbs on one screen: swing, split, press, throw. This one assumes all
 * four and asks what they are worth when the room is twice as tall and half of it is closed.
 *
 *   1. a pit, a green growth over it      ->  swing across, exactly as before, so the player
 *                                             starts on ground they already know
 *   2. a wall with a gap, a RED growth        split to fit, press, and watch a dead plant
 *      hanging above the far chamber      ->  come alive. The introduction to red
 *   3. four growths up a shaft            ->  360 on each and fling to the next. Every
 *                                             release slows time, because the flight between
 *                                             two growths is a third of a second, and that is
 *                                             a reflex test rather than an aiming window
 *   4. two presses on a timer             ->  cross when the gap is open. Being caught costs
 *                                             mass and never the creature
 *   5. a button that ignores you          ->  unless you arrive off a full revolution.
 *                                             Momentum stops being travel and becomes a key
 *
 * ## Red and green
 *
 * A red growth is present, visible and dead. That is deliberately not the same as a growth
 * which appears when you press a button: an absent one is a surprise, a red one is a QUESTION.
 * The player can see the entire route up the shaft from the floor of the room and cannot take
 * one step of it, which is the most direct way to make a button worth looking for.
 *
 * Authored with y DOWN, like stage one. Twice as tall, so the camera follows here where it
 * sits still there.
 */

import type { World } from './mass.js';

/** The ground floor. Everything else is measured up from it. */
const FLOOR = 1340;
/** The upper corridor, where the presses and the heavy button are. */
const SHELF = 660;
/** Floors reach past the plane that catches anything leaving the world. See lab.ts. */
const DEEP = 300;

export const THE_SHAFT: World = {
  width: 1280,
  height: 1440,
  start: { x: 140, y: 1280 },
  tiles: [
    // -- 1. the ledge, the pit, the far side ---------------------------------------------
    { x: 0, y: FLOOR, w: 300, h: DEEP },
    /*
     * Runs UNDER the wall rather than stopping at it.
     *
     * The wall occupies 860..900 and is a gate rather than a tile, so nothing else was
     * holding that span up: a 40px hole in the world in exactly the place the stage asks the
     * player to crawl through. Stage one had the identical bug and the identical fix, which
     * is the second time a gate has been mistaken for a floor.
     */
    { x: 520, y: FLOOR, w: 380, h: DEEP },
    // Past the wall, where the waking button is.
    { x: 900, y: FLOOR, w: 360, h: DEEP },

    // -- the shell -----------------------------------------------------------------------
    { x: -40, y: 0, w: 60, h: 1440 },
    { x: 1260, y: 0, w: 60, h: 1440 },
    { x: 0, y: -40, w: 1280, h: 60 },

    /*
     * -- 5. the upper corridor, and the alcove past the heavy gate ------------------------
     *
     * The corridor is where the presses are. The alcove is the exit, and it is walled off
     * from the corridor rather than merely far from it, because the last thing this stage
     * asks for is force rather than distance: a player who can reach the wall is not
     * finished, a player who can hit it hard is.
     */
    /*
     * All three upper surfaces are DEEP, not 40 thick.
     *
     * A 40px platform is thinner than a piled body sinks, so collision finds the underside
     * nearer than the top and expels the walker downward - the slime crossed the corridor by
     * falling through it to the ground floor, seven hundred pixels below. Exactly the fault
     * the drawbridge deck had in stage one, in a place where it looks like a level design
     * problem rather than a collision one.
     */
    { x: 0, y: SHELF, w: 300, h: DEEP },
    { x: 300, y: SHELF, w: 340, h: DEEP },
    /*
     * The landing at the top of the shaft.
     *
     * It ends at 840 and the last growth's sweep begins at 855, which is the same fifteen
     * pixels of clearance stage one's first growth keeps from its landing lip. A swing that
     * clips the platform it is trying to land on sheds mass on every revolution.
     */
    { x: 640, y: SHELF, w: 200, h: DEEP },
  ],

  /**
   * The growths, in the order they are used.
   *
   * Everything from g2 up sits about a hundred and seventy pixels above the last, and that
   * number is not chosen for looks. A rope of 80 lifts the body 160 from the bottom of its
   * circle to the top, and a release at the top adds roughly another eighty before gravity
   * takes it back - gravity is 1500 here, so a fling rises far less than it feels like it
   * should. Two hundred apart and the chain is impossible; a hundred and seventy leaves the
   * next growth comfortably inside reach at the apex, and the slow motion on release is what
   * turns "comfortably inside reach" into something a person can actually click on.
   */
  anchors: [
    // 1. Over the middle of the first pit, exactly like stage one's opener.
    { id: 'g1', x: 410, y: 1190, rope: 110 },
    /*
     * 2. RED. The first one, and the entire reason for the wall below it.
     *
     * 170 above the far chamber floor: a full body reaches it from the ground and a body
     * small enough to have fitted under the wall reaches 74px and cannot. So pressing the
     * button does not finish that puzzle - you still have to go back for yourself.
     */
    { id: 'g2', x: 1080, y: 1150, rope: 90, live: false },
    { id: 'g3', x: 980, y: 985, rope: 80 },
    { id: 'g4', x: 1090, y: 820, rope: 80 },
    { id: 'g5', x: 960, y: 655, rope: 80 },
    /*
     * 6. The one you swing in order to hit something with.
     *
     * Rope 70 at (400, 520) puts the west edge of the sweep at 305, which is where the heavy
     * button is. The sweep's floor is 615 against a corridor at 660, and its west edge stops
     * 25px short of the gate - a growth whose circle intersects the door it opens is a growth
     * that opens the door by accident.
     */
    { id: 'g6', x: 400, y: 520, rope: 70 },
  ],

  gates: [
    /*
     * The splitting wall, with 30px of daylight under it - the same gap as stage one, for the
     * same reason: a full body stands 40 tall and cannot pass, a legally split one can.
     */
    { id: 'w1', x: 860, y: 0, w: 40, h: FLOOR - 30, open: false, lift: 0, sieve: 24 },
    /*
     * The heavy gate. Only the force button opens it.
     *
     * A lift rather than a bridge: there is nothing to bridge here, and what the player has
     * earned is passage rather than a route.
     */
    { id: 'w2', x: 240, y: 340, w: 40, h: SHELF - 340, open: false, lift: 0 },
  ],

  buttons: [
    /*
     * The waking button. It does two things and both are necessary.
     *
     * It brings g2 to life, which is what the player came for. And it opens the wall they
     * crawled under, which is what lets them go back for the mass they left - the same
     * bargain stage one's button makes, restated so the thing being unlocked is a plant
     * rather than a doorway.
     */
    {
      id: 'wake',
      x: 1050,
      y: FLOOR - 16,
      radius: 26,
      pressed: false,
      opens: ['w1'],
      activates: ['g2'],
    },
    /*
     * The heavy one. 420px/s, against a crawl of fifteen.
     *
     * A body that walks into this does nothing at all, which is the entire idea: it is the
     * first thing in the game that cannot be solved by arriving. A pumped swing on g6 tops
     * out comfortably above 420, so what it asks for is a committed revolution rather than a
     * lucky nudge, and there is no way to build one of those by accident.
     */
    { id: 'heavy', x: 310, y: 520, radius: 30, pressed: false, force: 420, opens: ['w2'] },
  ],

  /**
   * Two presses over the corridor, half a cycle apart.
   *
   * Offset rather than synchronised, so the corridor is never open along its whole length and
   * the player has to cross in stages instead of waiting for one window and running. Three
   * seconds each: long enough to read, short enough that hesitating costs the attempt.
   *
   * Each closes onto the corridor floor exactly, and leaves a 60px gap at the top of its
   * travel - wider than the body stands, so the way through is real rather than frame-perfect.
   */
  crushers: [
    { x: 560, y: 340, w: 60, h: 260, travel: 60, axis: 'y', period: 3.0, phase: 0, at: 0 },
    { x: 420, y: 340, w: 60, h: 260, travel: 60, axis: 'y', period: 3.0, phase: 0.5, at: 0 },
  ],
};

/** A fresh copy - gates, buttons, growths and presses are all mutated by play. */
export function freshShaft(): World {
  return {
    ...THE_SHAFT,
    tiles: THE_SHAFT.tiles.map((t) => ({ ...t })),
    anchors: THE_SHAFT.anchors.map((a) => ({ ...a })),
    gates: THE_SHAFT.gates.map((g) => ({ ...g, span: g.span ? { ...g.span } : undefined })),
    buttons: THE_SHAFT.buttons.map((b) => ({ ...b })),
    crushers: (THE_SHAFT.crushers ?? []).map((c) => ({ ...c })),
  };
}
