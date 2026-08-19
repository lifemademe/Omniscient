/**
 * Stage one, which is a sentence with four clauses.
 *
 * Every verb the game has appears once, in an order where each one is the answer to the
 * problem the last one left behind:
 *
 *   1. a pit too wide to walk       ->  latch a growth and SWING across
 *   2. a wall with a gap at the foot ->  SPLIT until you are small enough to fit
 *   3. your mass is on the far side  ->  press the button, RECONNECT through the open wall
 *   4. a growth far above the exit   ->  swing the full circle and let go at the top
 *
 * The third clause is the one that makes the second one a puzzle rather than a door. Splitting
 * to fit is free if you never wanted the mass back; the growth in clause four is placed so
 * that it is not reachable on what fits under the wall, so the button is not a switch that
 * opens the way forward - it is a switch that lets you go BACK for what you left.
 *
 * Nothing here is eaten. There is no biomass and no way to gain, so the mass the player lands
 * with is the mass they started with, minus whatever the pit took off them. Mass is a thing
 * you move around rather than a score you accumulate, and every gate in the stage is really
 * asking the same question: how much of yourself can you afford to leave somewhere else.
 *
 * Authored with y DOWN, like a tile editor or a screenshot. M4SSRig flips it exactly once.
 */

import type { World } from './mass.js';

/** Floor height, so the platforms line up by construction rather than by my arithmetic. */
const FLOOR = 620;

export const THE_LAB: World = {
  width: 1280,
  height: 720,
  start: { x: 140, y: 560 },
  tiles: [
    // -- 1. the ledge you start on, and the pit ------------------------------------------
    { x: 0, y: FLOOR, w: 300, h: 120 },
    // The far side. 320px of nothing between them - walking is not an option, and there is
    // deliberately no lip to try it from.
    /*
     * The lip is at 480, and it is the number that makes pumping mean something.
     *
     * Latching from the ledge is free energy: the body falls into the arc and the rope turns
     * the drop into speed, so the first swing already moves at ~400px/s without one press of
     * A or D. With the lip at 420 that free swing cleared the pit and the whole
     * pump-in-time mechanic was decorative. At 480 the free swing releases short, drops in,
     * and comes home to try again - only a built-up swing throws far enough. The pit hands
     * back what falls in, so the price of learning the timing is seconds, not mass.
     */
    { x: 480, y: FLOOR, w: 320, h: 120 },

    // -- walls, so a swing that goes badly has somewhere to end ---------------------------
    { x: -40, y: 0, w: 60, h: 720 },
    { x: 1260, y: 0, w: 60, h: 720 },

    /*
     * The far chamber's floor, which starts UNDER the wall rather than past it.
     *
     * The wall occupies 800..840 and is a gate rather than a tile, so nothing else was holding
     * that span up: there was a 40px hole in the world in exactly the place the whole puzzle
     * asks the player to crawl through. A slime small enough to fit under the wall fitted
     * straight down the hole.
     */
    { x: 800, y: FLOOR, w: 300, h: 120 },

    /*
     * -- 4. the exit: a shelf across a hundred pixels of nothing --------------------------
     *
     * The exit used to be a platform hanging in the air beside the growth, and it could not
     * work: a pendulum sweeps a disc, anything inside the disc gets scraped on every pass,
     * and the drag on a flying body means nothing outside the disc was reachable at a height
     * a platform could occupy. Measured exhaustively - one whole revolution of release
     * points, and not one landed.
     *
     * So the exit sits at floor height across a pit too wide to cross any other way. Only a
     * committed circle throws this far - about a third of the release window on a full-speed
     * revolution lands it, which is a timing skill and feels like one - a lazy fling drops
     * short into the pit, and the pit hands the body back to the start of the room. Failure
     * costs the attempt, never the creature.
     */
    { x: 1200, y: FLOOR, w: 60, h: 120 },
  ],

  /**
   * Growths, clicked and held to latch.
   *
   * Discrete rather than latch-anywhere, for three reasons: the player always knows what is
   * grabbable, a designer controls the routes, and a failed reach is unambiguous - you aimed
   * at THAT and did not make it, rather than aiming at a wall and wondering if you missed.
   *
   * Two of them, and they are the two halves of the stage. The first hangs over the middle of
   * the pit at a height that gives a rope long enough to swing on from the near ledge. The
   * second is deliberately too high to be worth anything without a full circle under it.
   */
  anchors: [
    /*
     * Almost directly over the latch point, and that placement IS the mechanic.
     *
     * A growth hung out over the pit hands the player free speed: the body falls into the
     * arc and the rope turns the drop into 470px/s before A or D is ever pressed - measured,
     * that was three quarters of the terminal swing speed, which made pumping decorative.
     * From here the body hangs nearly still on latching, about ten degrees off vertical, and
     * every pixel of amplitude after that is bought with a pump timed to the arc. The
     * crossing takes several honest alternations; an early release drops into the pit, and
     * the pit hands the body back to try again.
     *
     * The arc still has to clear geometry by more than the body is wide - an earlier version
     * scraped half the mass off on a corner it swung past. At rope 120 the hanging body's
     * bottom sits 10px above the ledge it launched from, and the sweep's right edge - rope
     * plus half a body, 455 - stays clear of the landing lip at 480.
     */
    { x: 310, y: 470, rope: 120 },
    /*
     * The high one, on a deliberately short rope.
     *
     * 78 of rope at y 460 over x 1020, and every digit is a constraint. The sweep is rope
     * plus the body's own half-width - about 25 more - so the circle spans roughly 915 to
     * 1125: clear of the wall by 75, clear of the exit pit's far shelf by 75, and high
     * enough that the bottom of a revolution misses the floor. The first pass of this
     * geometry forgot the body's width and put the sweep five pixels into the old exit
     * platform, which scraped mass off on every revolution and left no release window at
     * all.
     *
     * The rest: The height sets the margin on the
     * stage's load-bearing rule - a gap-fitting body reaches 106px and this growth needs 120
     * from the floor, and that 14px is all that keeps the button honest.
     *
     * The rest: Twice the radius has to fit between the wall
     * and the exit. The bottom of the sweep plus the body's own radius has to clear the floor,
     * which 110 did not - it scraped, and a scraping swing sheds mass. And the whole thing has
     * to sit far enough above the floor that a body which fitted under the wall cannot reach
     * it, because that is the only thing making the button worth pressing.
     */
    { x: 1020, y: 460, rope: 78 },
  ],

  /**
   * The wall, and the 58px of daylight underneath it.
   *
   * The wall IS the gate - the whole slab lifts, rather than a little door opening in it. The
   * first version had it the other way round, a shutter filling the gap with the button on the
   * far side of it, which is a door that can only be opened from the side you cannot get to.
   *
   * So the gap is never shut. It is simply too small - 30px of daylight against a full body
   * that stands 40 tall. Narrowed from 44 when the body got its proper roundness: the old
   * pancake was 24px tall and oozed under the old gap at FULL mass, which made the split -
   * the clause this whole wall exists for - decorative. The measured-height check in
   * scripts/m4ss-stage.ts is what caught that, and it now holds both directions: the full
   * body cannot pass, and a legally-split one can. The wall does not stop the player, it
   * stops MOST of them, and pressing the button is how the rest catches up.
   */
  gates: [{ x: 800, y: 0, w: 40, h: 590, open: false, lift: 0 }],

  /**
   * The button, on the far side of the wall and nowhere near the exit.
   *
   * Just past the wall, and nowhere near the second growth.
   *
   * Close to the wall because a body that has shed three quarters of itself is a smear that
   * crawls at 15px/s, and every pixel between the gap and the button is spent watching it. Far
   * from the growth because pressing the button must not also be arriving - the player has to
   * press it, go back west for their mass, and come east again.
   */
  buttons: [{ x: 872, y: 604, radius: 26, pressed: false }],
};

/** A fresh copy - the gate and the button are mutated by play, and the harness runs this many times. */
export function freshLab(): World {
  return {
    ...THE_LAB,
    tiles: THE_LAB.tiles.map((t) => ({ ...t })),
    anchors: THE_LAB.anchors.map((a) => ({ ...a })),
    gates: THE_LAB.gates.map((g) => ({ ...g })),
    buttons: THE_LAB.buttons.map((b) => ({ ...b })),
  };
}
