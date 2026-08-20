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
  // In the alcove past the heavy gate: the stage's last clause is force, and the portal
  // stands behind the door only force opens.
  exit: { x: 150, y: 598 },
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

    /*
     * -- 1b. the sporeling's ledge --------------------------------------------------------
     *
     * Hung over the middle floor, up and to the left of the first giant mushroom, and it is
     * where the whole stage now turns: the switch that wakes the red growth is on it, and
     * something lives on it.
     *
     * Reachable, and not by accident. A release off g1 anywhere near the middle of the rise
     * - roughly forty-five degrees, which is where a first swing naturally lets go - arcs
     * onto it; a weak swing lands short on the floor and a hard one clears to the east end.
     * So the ledge is not a skill gate, it is simply the place the opening swing goes, which
     * is the correct amount of ceremony for the first thing in the room that can hurt you.
     *
     * 570 rather than 540: g1's sweep reaches x 520 and a body on it is twenty pixels wide,
     * so a ledge at 540 is a corner for the swing to clip and shed mass on every revolution.
     * 290 long rather than 220, and the length was arrived at by measurement rather than by
     * eye: a settled body is 69px wide, so a ledge that holds a creature at each end AND a
     * patrol between them cannot be shorter than about 280 however tidy 220 looked. At 220
     * both ends were flush, standing on the plate counted as a contact, and a body dropped on
     * the east end slid off it. It runs east to meet the wall, which is the only edge of this
     * floor that was not already spoken for.
     *
     * 70 thick: half the depth of the slabs around it, which is what the reference sheet's
     * platforms look like and what stops a ledge hung in mid-air from reading as a chunk of
     * the floor that came loose. Still comfortably deeper than the 40 that broke the corridor
     * and the drawbridge deck - a platform thinner than a piled body sinks posts the walker
     * out of its own underside - and it leaves 150px of headroom over the floor beneath.
     */
    { x: 570, y: 1120, w: 290, h: 70 },

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
    /*
     * The waking button now only opens the wall.
     *
     * It used to do both jobs - open w1 and wake g2 - and both were on the far side of a
     * gap the player crawls through, which put the stage's most important switch in the one
     * place nothing guards. Waking the shaft has moved to the sporeling's ledge, and what is
     * left here is the bargain stage one makes: the door you crawled under opens so you can
     * go back for the mass you left behind.
     */
    {
      id: 'wake',
      x: 1050,
      y: FLOOR - 16,
      radius: 26,
      pressed: false,
      opens: ['w1'],
    },
    /*
     * The switch that wakes the shaft, at the far end of a ledge with something on it.
     *
     * Dead centre of the ledge, and the sporeling walks over it.
     *
     * The first version put the plate past the end of the creature's beat, so standing on it
     * was permanently safe and the puzzle was a single crossing. Centred, it is the opposite
     * shape: there is no safe ground on this platform at all, and the plate has to be taken
     * on a timer rather than reached and held.
     *
     * That is a harder ask and a cheaper failure, which is the right way round. The plate
     * latches the moment it is touched and the growth stays awake, so being caught a second
     * later costs only the walk back - and being caught BEFORE reaching it costs the attempt,
     * which is what the pit costs and what everything in this game costs.
     */
    {
      id: 'spore',
      x: 715,
      y: 1104,
      radius: 24,
      pressed: false,
      // Explicitly nothing. An undefined `opens` means EVERY gate in the level - stage one's
      // wiring from when there was one button and one door - so leaving it off here quietly
      // opened the splitting wall and handed the player the far chamber for free.
      opens: [],
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
    /*
     * Bolted to the door it opens, standing upright, on the face the player arrives at.
     *
     * It used to hang in mid-air thirty pixels east of the gate, lying flat like the floor
     * plates - which said STAND ON ME about the one control in the game you are meant to
     * HIT. Mounted on the door and turned upright it states its own rule: a switch on the
     * face of a bulkhead, at swing height, with nothing under it to stand on.
     *
     * x 286 puts it against the gate's east face (the slab spans 240 to 280), the side the
     * player swings from - g6 hangs at 400 and the alcove is behind the door. And because
     * it rides the gate now (see Button.onGate), the moment it is struck it goes up with
     * the door instead of being left behind in the air.
     */
    {
      id: 'heavy',
      x: 286,
      y: 500,
      radius: 30,
      pressed: false,
      force: 420,
      opens: ['w2'],
      onGate: 'w2',
      vertical: true,
    },
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
  /*
   * ONE press, not two, and it lifts far enough to be read.
   *
   * The second press stood at 420 - directly on the approach to the heavy button - and it
   * had to go: that button is now the target of a fling off a 360, and a press sitting in
   * the flight path turns a shot the player aimed into a shot the timer took. A hazard
   * that punishes good aim for reasons outside the player's control is not difficulty.
   *
   * Travel goes 60 to 190 for the survivor. At 60 the head barely cleared its own housing,
   * so the "gap" the player was supposed to time was a couple of body-widths appearing and
   * vanishing with no visible wind-up - the playtest said it never rose high enough to
   * time a run past it, and it was right. At 190 the head lifts most of a body-height
   * clear, the rhythm is legible from across the room, and the period is long enough to
   * walk it rather than sprint it.
   */
  crushers: [
    { x: 560, y: 340, w: 60, h: 260, travel: 190, axis: 'y', period: 3.4, phase: 0, at: 0 },
  ],

  /**
   * The sporeling.
   *
   * Slow on purpose - 55px/s against a crawl of fifteen hundred - because the creature is
   * not a chase, it is a moving piece of the room. Everything difficult about it is where it
   * is standing, and a player who cannot outrun it has no puzzle to solve, only a race.
   *
   * Its beat is the WHOLE ledge, end to end: 583 to 847 is 570 and 860 pulled in by half a
   * sporeling, so the creature walks to each lip and turns without any part of it hanging
   * over the edge. 264px at 46px/s is about six seconds each way, which is slow enough that
   * any particular spot on the platform is clear most of the time and never clear for long. 46px/s against a crawl of 92 means a player who is already past it can always
   * outrun it, and a player who is not can never quite walk through it.
   *
   * It starts at the west end walking east, so the first thing the player sees on landing
   * is a small creature coming towards them.
   *
   * The contact box is 26x42 against a 32x46 sprite: a graze along the silhouette should not
   * end the attempt, because at this size the difference between touching and nearly
   * touching is three pixels the player cannot possibly judge.
   */
  critters: [
    { from: 583, to: 847, y: 1120, speed: 46, w: 26, h: 42, x: 583, facing: 1, wait: 0, phase: 0 },
  ],

  /*
   * The two giant mushrooms, placed rather than derived.
   *
   * The first one is the landmark the ledge is described against, so it cannot be left to
   * the renderer's "two widest floors" scatter.
   *
   * It stands past the wall rather than under the ledge, and that is a concession the floor
   * plan forced: the ledge needs 290 of the middle floor's 380 to be playable, and what is
   * left under it is 80px of headroom - a third of a giant mushroom. So the pair of them
   * cluster in the far chamber instead, where the ledge looks down and to the right onto
   * them, and the shaft climbs out of the room they are growing in.
   */
  landmarks: [
    { x: 960, y: FLOOR, size: 150 },
    { x: 1180, y: FLOOR, size: 172 },
  ],
};

/** A fresh copy - gates, buttons, growths and presses are all mutated by play. */
export function freshShaft(): World {
  return {
    ...THE_SHAFT,
    exit: { ...THE_SHAFT.exit },
    tiles: THE_SHAFT.tiles.map((t) => ({ ...t })),
    anchors: THE_SHAFT.anchors.map((a) => ({ ...a })),
    gates: THE_SHAFT.gates.map((g) => ({ ...g, span: g.span ? { ...g.span } : undefined })),
    buttons: THE_SHAFT.buttons.map((b) => ({ ...b })),
    crushers: (THE_SHAFT.crushers ?? []).map((c) => ({ ...c })),
    critters: (THE_SHAFT.critters ?? []).map((c) => ({ ...c })),
  };
}
