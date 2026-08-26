/**
 * Stage three, which is the first one that goes DOWN.
 *
 * Stage one is a room and stage two is a climb, so the only shape left on an axis this game
 * cannot widen is a descent and a return. You come down the east side, cross the floor of the
 * machine, and go back up the west by a route the descent could see the whole time and could
 * not take.
 *
 *   1. a ledge, a growth, and a landing BELOW it   ->  release at the bottom of the arc, not
 *                                                      the top. The same verb, asked downward
 *   2. a patrolled floor, crossed on the rope      ->  and two growths hanging lower than the
 *                                                      others, which are the trap
 *   3. two presses out of phase                    ->  there is no moment when both are up.
 *                                                      The pause is inside the machine
 *   4. a grate at 24                               ->  split, crawl, leave the rest behind
 *   5. a column of air that lifts 14               ->  the wall and the air disagree, so the
 *                                                      shedding has to happen twice
 *   6. a wall that lies down                       ->  and becomes the walkway back west, over
 *                                                      the mass you abandoned to get here
 *   7. a shutter between two growths               ->  the climb has a gate in the middle of it
 *   8. a plate at 460, dressed as masonry          ->  build the circle, let go, go through it
 *
 * ## The two things this stage does that nothing else has
 *
 * **The rope is whatever you latched from.** Every growth in stages one and two states its
 * `rope`, so the swing's geometry is the designer's. The patrol's growths deliberately do not:
 * the rope is the distance you reached across, so WHERE you latch decides how low you sweep,
 * and the floor is patrolled. Two of the growths hang a hundred and fifty pixels lower than
 * their neighbours and look like the easier grab. They are the trap. See the patrol below.
 *
 * **The air is the alternative to the rope.** The column is the only thing in the game that
 * lifts you, and it refuses anything over fourteen grams - ten under what the grate two beats
 * earlier let through. A player who split to exactly the number the wall asked for arrives at
 * the bottom of the column still too heavy, and the second shedding is the expensive one,
 * because fourteen grams is seventy-four pixels of reach and there is nothing down there to
 * reach for.
 *
 * ## Getting your mass back
 *
 * Both sheds land on the machine floor, and the bridge crosses two hundred pixels above it in
 * open air. Q calls the nearest lump home from any distance (mass.ts's recall block), so the
 * deck is where the stage hands you back what it took: stand over it and press Q twice. That
 * is why the deck is clear air all the way down and why the plate at the top of the column
 * opens the grate as well as the bridge - the same bargain stage two makes with its wall.
 *
 * Authored with y DOWN, like the others.
 */

import type { World } from './mass.js';

/** The floor of the machine. Everything on the way down is measured against it. */
const FLOOR = 1580;
/** Floors reach past the plane that catches anything leaving the world. See lab.ts. */
const DEEP = 300;
/** A hung platform. Thicker than the body sinks - see shaft.ts on why 40 is not a floor. */
const SHELF = 90;

export const THE_SLUICE: World = {
  width: 1280,
  height: 1760,
  start: { x: 1150, y: 150 },
  // In the alcove behind the cracked wall, at the top of the west climb.
  exit: { x: 100, y: 433 },

  tiles: [
    // -- the shell ------------------------------------------------------------------------
    { x: -60, y: -40, w: 1400, h: 160 },
    { x: -60, y: 0, w: 60, h: 1760 },
    { x: 1260, y: 0, w: 60, h: 1760 },
    /*
     * The floor of the machine, in one piece across the whole width.
     *
     * One tile rather than two rooms, because both of this stage's sheds end up on it and the
     * player has to be able to see that from the deck. What divides the corridor from the
     * column bay is the grate and the pier above it, which is a wall you can be let through
     * rather than a wall the level is made of.
     */
    { x: 0, y: FLOOR, w: 1260, h: DEEP },

    // -- 1. the drop ----------------------------------------------------------------------
    /*
     * The starting ledge, top east.
     *
     * It stops at 1040, and the thirty pixels between its west lip and the catch ledge below
     * are deliberate: a body is 69 wide and cannot fall through a 30px slot, so beat one is a
     * swing rather than a step down. The first plan of this level had the two overlapping and
     * the whole opening was optional.
     */
    { x: 1040, y: 200, w: 220, h: SHELF },
    /*
     * The landing, and the whole of beat one.
     *
     * It is BELOW the growth's circle rather than across from it - the lowest point of d1's
     * sweep is (900, 440) and this surface is twenty pixels under it. So the release that
     * reaches it is one taken low in the arc, where the body is fastest; a release at either
     * top drops the player past an end of it into the patrol.
     *
     * Both stages so far open with a swing that carries you ACROSS something. Asking the same
     * verb to shed height under control, on the first screen, before anything is at risk, is
     * the one new thing worth teaching while the stage is still free.
     */
    { x: 800, y: 460, w: 210, h: SHELF },
    /*
     * The lid over the east half, and the reason beat one cannot be skipped.
     *
     * Without it the start ledge looks down an open east wall onto the column's cap, and from
     * the cap the column is a two-hundred-pixel step into the bay - which is beats two, three
     * and four gone. It reads as the underside of the deck machinery, which is what it is.
     *
     * It catches rather than seals, and the difference matters: a player who steps off the
     * start ledge eastward lands HERE, and the only way off is west, onto the patrol. Every
     * way down out of the first screen ends up in beat two, which is the point. The version
     * of this level that went to the harness had a 110px shaft beside it that dropped straight
     * to the corridor - beats one and two, skippable by walking east. The floor plan found it;
     * no amount of arithmetic was ever going to.
     *
     * ## It is a shelf, not a shelf you are stuck on
     *
     * It sat at 550, flush with the catch ledge's underside, and that made it a cell: a body
     * standing on it could not walk west because the ledge's east face was in the way at
     * exactly standing height, and east is the wall. The playtest landed there and could not
     * get out, which is what a two-hundred-and-fifty-pixel pocket with a wall at each end is.
     *
     * At 640 there is ninety pixels of clear air between its floor and the ledge above, so the
     * way off is a walk west and a drop into the patrol - which is what this shelf was always
     * described as doing. A catch that cannot be left is a trap, and the difference between
     * the two was one number.
     */
    { x: 880, y: 640, w: 380, h: SHELF },

    // -- 2. the patrol --------------------------------------------------------------------
    /*
     * The patrolled floor.
     *
     * Crossable on foot, and that is deliberate rather than an oversight: the first thing any
     * player tries is walking it, and being sent back to the last safe footing by something
     * small and slow is the cheapest possible way to be told there is a better way. The
     * growths are hanging in plain sight while it happens.
     *
     * It runs from 500 to 900 - under the whole of the crossing AND under the lid's west lip,
     * which is where a player who stepped off the start ledge the wrong way arrives. Nothing
     * that leaves the first screen misses this floor.
     *
     * Its west end stops ten pixels clear of g2's sweep, which is the tightest margin in the
     * level and the price of putting the descent's floor and the ascent's chain in the same
     * eight hundred pixels. 1280 does not hold two independent routes; what it holds is one
     * shaft used twice, and this is where the two of them pass.
     */
    { x: 500, y: 760, w: 400, h: 100 },
    /*
      * The west landing, and the head of the chute.
      *
      * It stops at 130 rather than running to the wall, and the hundred and thirty pixels it
      * leaves are the whole route to the corridor: step off its west lip and you fall past the
      * gallery to the floor of the machine. The gap is west of everything the climb uses -
      * the shutter's parked position starts at 150 - so the way down and the way back up
      * share a shaft without ever sharing a pixel.
      */
     { x: 130, y: 650, w: 200, h: SHELF },

    // -- 5/6. the deck at the top of the column -------------------------------------------
    /*
     * The platform the column delivers you onto, and the pocket it sits in.
     *
     * The column runs up the east wall and stops under a cap; the only opening is west, onto
     * this. So the ride ends the way it should - the air runs out, and there is exactly one
     * ledge in reach of where it left you.
     */
    { x: 900, y: 1020, w: 180, h: SHELF },
    /** The pocket's ceiling, west half. */
    { x: 900, y: 780, w: 180, h: SHELF },
    /** The column's cap, east half. Air stops here; the way out is sideways. */
    { x: 1080, y: 780, w: 180, h: SHELF },
    /*
     * Where the bridge lands, and where the west climb begins.
     *
     * It reaches east to 750 rather than 620, and the 130 pixels are a bug being paid for.
     * The rig animates a bridge by ROTATING its slab, so what the player sees is always the
     * slab's own rectangle turned on its side - and `span` is stated independently of that.
     * A 90x150 slab lying down is a 150x90 deck; the span said 280 wide, so a hundred and
     * thirty pixels of the walkway were solid and not drawn. Paul walked over nothing.
     *
     * Fixed on the level's side rather than the rig's: a bridge you can see fall and then
     * land somewhere its own shape does not reach is dishonest whatever draws it. The landing
     * grew to meet the deck the slab can actually become. See the harness check that now
     * requires the two to agree.
     */
    { x: 360, y: 1020, w: 390, h: SHELF },

    // -- 3/4. the corridor's east wall ----------------------------------------------------
    /*
     * The pier the grate hangs under. It runs from the patrol floor's underside down to the
     * grate itself, so there is no way round the wall except the gap the wall is for.
     */
    { x: 990, y: 1110, w: 90, h: 300 },

    // -- 8. the alcove behind the cracked wall --------------------------------------------
    /*
     * 70 thick rather than 120, and the fifty pixels are headroom for the landing below.
     *
     * At 120 its underside reached 615 and the west landing's surface is at 640 - twenty-five
     * pixels of clearance over a body that stands about forty-five, so the end of the patrol
     * crossing was a crawlspace nobody designed. `crawlRelax` flattens a driven body to about
     * fifteen, which is exactly why a gap like this is never a mass gate and always an
     * accident: it does not stop anybody, it just makes them lie down.
     *
     * Still comfortably past the 40 that broke stage one's drawbridge deck, and the same 70
     * stage two's sporeling ledge uses.
     */
    { x: 0, y: 495, w: 274, h: 70 },
  ],

  /**
   * The growths.
   *
   * The patrol's five carry no `rope`, and that is the beat. Without one the swing radius is
   * the distance the tendril crossed to reach it (see Anchor.rope), so a player who latches
   * from the back of a ledge gets a long rope and sweeps low, and a player who walks to the
   * lip first gets a short one and sails over. Nothing announces this. The rope's length is
   * visible the instant it takes hold, and there is a floor with something on it underneath.
   *
   * `t1` and `t2` are the trap. They hang a hundred and fifty below their neighbours, which
   * makes them the nearer, easier-looking grab from every standing position on the route - and
   * a growth that is lower has its whole circle lower, so the easy grab is the one that drags
   * the body through the patrol. It is the only lie this stage tells and it is told twice, so
   * the second time is a decision rather than a surprise.
   *
   * ## The zigzag, and why the spacing is 60
   *
   * The first version put all five inside a two-hundred-pixel pocket, two of them 22px apart,
   * and the playtest called it scattered - correctly: five things that close are not a route,
   * they are a pile. The pocket was an artefact of the harness testing a growth's bounding
   * SQUARE against the level instead of its disc, which reports collisions on four corners the
   * arc never reaches and walled off four hundred pixels of usable space.
   *
   * ## Three, and they are far apart
   *
   * Five became four became three, and every cut came from the same playtest note: too close
   * together. Four at 60px spacing still read as a cluster, and the honest reading of that is
   * that the beat never needed four. What it needs is one crossing and one lie:
   *
   *   p1   the grab from the ledge
   *   t1   the trap, hanging a hundred and seventy lower and directly between the other two,
   *        which is what makes it the obvious next hold and the wrong one
   *   p2   the one that gets you to the landing
   *
   * 180 apart in x now, against a lantern about thirty wide - so they read as three separate
   * objects rather than as a row of hanging lamps. The lie is told once and clearly. Telling
   * it twice was a plan written before anybody had looked at the room.
   *
   * The fifth also had to sit west of 525 to keep its spacing even, and at 480 its own circle
   * reached the breach plate - a patrol swing could have opened the last door in the level
   * during the second beat.
   *
   * The gallery's three do state their ropes, because the climb is a chain and a chain's
   * geometry has to be the designer's - stage two's note on 165px spacing is the reason.
   */
  anchors: [
    // 1. Over the drop. Its sweep's lowest point sits 40px above the landing shelf.
    { id: 'd1', x: 900, y: 310, rope: 130 },

    // 2. The patrol. No rope on any of them.
    { id: 'p1', x: 720, y: 420 },
    { id: 't1', x: 630, y: 590 },
    { id: 'p2', x: 540, y: 420 },

    /*
     * 7. The gallery, west, going up. All three RED until the column's plate is pressed.
     *
     * Dead rather than absent, and the floor plan is what forced it. The descent's second beat
     * crosses within a hundred pixels of g3: at forty grams a player can latch it in flight,
     * climb the gallery, and be at the exit having skipped everything from the presses to the
     * bridge. Nothing in the coordinates says so and no assertion in the harness was ever going
     * to - it is a fact about what is NEAR what, which is the one thing a list of numbers hides
     * and a picture of the level cannot.
     *
     * Making them red is not damage control. It is the sentence this stage opens with: a route
     * the descent can see the whole way down and cannot take. Stage two's red growth teaches
     * exactly this reading, so a player arriving here already knows what a dead plant means -
     * and this time there are three of them, hanging beside the crossing, for the whole descent.
     *
     * Rope 70 rather than stage two's 80, because the shutter needs a gap between two sweeps
     * to close and a shorter rope opens one. Spacing is a fraction under 200 on the diagonal,
     * which is where stage two's chain measured out: a rope of 70 lifts 140 over the top and a
     * release adds roughly another 80, and the slow motion on release is what turns the
     * remainder into something a person can click on.
     */
    /*
     * Held against the west wall as a COLUMN, clear of the crossing above it.
     *
     * The climb and the patrol used to interleave - g3 sat 60px from a patrol growth on the
     * same row, so the top of the level read as one heap of nine plants with no way to tell
     * which belonged to which route. They are now two shapes: a zigzag running east-west at
     * 420 and 570, and a vertical stack at 400 and 450. The reds being visibly out (see
     * bushTexture's ember) does the rest.
     */
    { id: 'g1', x: 400, y: 880, rope: 70, live: false },
    { id: 'g2', x: 450, y: 680, rope: 70, live: false },
    { id: 'g3', x: 400, y: 500, rope: 70, live: false },
  ],

  gates: [
    /*
     * The grate, with 30px of daylight under it - the same gap and the same sieve value as
     * both other stages. Deliberately familiar: this is the setup for the column, not a puzzle
     * of its own, and what it teaches is only that the number it asks for is not the last
     * number the stage will ask for.
     */
    { id: 's1', x: 990, y: 1410, w: 90, h: 140, open: false, lift: 0, sieve: 24 },
    /*
     * The bridge, and the first one in this game.
     *
     * It stands on the west lip of the column's platform as a slab you cannot pass and can see
     * from the drop, four beats earlier. Down, it is a floor: `span` is where it lies, stated
     * rather than derived, and it is 90 thick for the reason every walked surface here is -
     * a deck thinner than the body sinks posts the walker out through its own underside.
     */
    {
      id: 'b1',
      x: 900,
      y: 870,
      w: 90,
      h: 150,
      open: false,
      lift: 0,
      mode: 'bridge',
      // 150x90 - the slab's own 90x150 turned on its side, which is what the fall draws.
      span: { x: 750, y: 1020, w: 150, h: SHELF },
    },
    /*
     * The cracked wall at the top of the climb. Only the force plate opens it.
     *
     * A lift, because what the player has earned here is passage. The art dresses the slab as
     * masonry and the opening as a collapse, which is the whole of Paul's breakable wall
     * delivered on a force plate and a gate - mechanically a button, perceptually the mass
     * going through a wall.
     */
    { id: 'w2', x: 184, y: 120, w: 90, h: 375, open: false, lift: 0 },
  ],

  buttons: [
    /*
     * The plate at the top of the column, and it does two things.
     *
     * It drops the bridge, which is what the player came up here for. It opens the grate,
     * which is the bargain stage two's waking button makes: the door you crawled under opens,
     * so the mass you left on the other side of it is yours again. Without the second clause
     * this stage would end with sixteen grams walled off behind a beat that is already solved.
     *
     * And it wakes the gallery. Three plants that have been hanging red beside the descent
     * since the second beat come alive at the moment the player is furthest from them and
     * about to be handed a bridge back - so the reward for reaching the top of the column is
     * not a door, it is the whole west wall becoming climbable at once.
     */
    {
      id: 'drop',
      x: 1000,
      y: 1004,
      radius: 26,
      pressed: false,
      opens: ['s1', 'b1'],
      activates: ['g1', 'g2', 'g3'],
    },
    /*
     * 460px/s, against stage two's 420 and a crawl of fifteen.
     *
     * Bolted to the wall it opens, standing upright, on the face the swing arrives at - the
     * same wiring as stage two's heavy button and for the same reasons: a plate lying flat
     * says STAND ON ME about the one control in the game you are meant to hit, and a plate
     * left hanging in the air when its door goes up reads as a bug however correct it is.
     *
     * x 280 puts it six pixels off the gate's east face and 20 above g3 - the same shape stage
     * two's plate has against its own growth, where a release off a built revolution landed on
     * it from 27 of 46 sampled points. g3's sweep stops at 350, so the plate is 40px outside a
     * circle that cannot reach it. What opens this wall is a release.
     *
     * It moved sixteen pixels west, and the sixteen pixels are the whole of a skip. A growth
     * with no stated rope takes the distance you latched it from, and p3 can be latched from
     * 212px away - which puts the far side of its circle at 308, eighteen pixels short of where
     * this plate used to be. A patrol swing could have opened the last door in the level during
     * the second beat. The bound that hid it was the assumption that a mid-flight latch is a
     * SHORT one; it is not, and nothing about the room says it has to be.
     */
    {
      id: 'breach',
      x: 280,
      y: 460,
      radius: 30,
      pressed: false,
      force: 460,
      opens: ['w2'],
      onGate: 'w2',
      vertical: true,
    },
  ],

  /**
   * Two presses over the corridor, half a cycle apart, and one shutter in the climb.
   *
   * The presses are the beat stage two has one of, and what makes two of them a different
   * lesson is NOT that the corridor is never open - it is that the corridor is never open
   * long enough.
   *
   * That distinction was measured rather than assumed, and the first version of this comment
   * had it backwards. The cycle is 55% winch, 30% hang, 15% drop (see mass.ts), so a press
   * spends most of its life UP, and there is no phase offset that gets two of them out of
   * each other's way. What the offset buys is that the two drops alternate, which leaves the
   * pair clear together for about a second at a time.
   *
   * So the beat is a distance problem. From safe ground west of the first head to safe ground
   * east of the second is 440px, and a body crawls at 92px/s - nearly five seconds against a
   * one-second window. You cannot run it, and the 240px between the heads is where you stop.
   * The pause is inside the machine rather than outside it, which is the whole idea, and it is
   * now true for a reason the harness can check.
   *
   * Being caught costs 45% of the body onto the floor, recoverable with Q. Nothing dies.
   *
   * The shutter is the other kind entirely: `axis: 'x'`, which the sim has supported since it
   * was written and no stage has ever authored. It slides across the only gap between g1's
   * sweep and g2's, so the second link of the climb is a release that has to be taken on the
   * beat. Every release above 2.1 rad/s already buys 0.9s of slow motion, which exists
   * precisely so a flight this short is a decision - the mechanic was built for this.
   */
  crushers: [
    { x: 500, y: 1130, w: 60, h: 260, travel: 190, axis: 'y', period: 3.4, phase: 0, at: 0 },
    { x: 800, y: 1130, w: 60, h: 260, travel: 190, axis: 'y', period: 3.4, phase: 0.5, at: 0 },
    { x: 130, y: 756, w: 190, h: 40, travel: 180, axis: 'x', period: 3.2, phase: 0.3, at: 0 },
  ],

  /**
   * Three sporelings, and the same creature asked three different questions.
   *
   * Two walk the patrol on overlapping beats, so the middle of that floor is covered twice and
   * neither end is ever safe for long. Both beats stay inside 500..900 with half a sporeling
   * to spare at each end - the second one used to walk to 970 against a floor that stops at
   * 900, so it spent a third of its patrol standing on air. The harness checks this now. They are what the rope is for. Contact costs no mass at
   * all - it drops the rope, kills the spin, stuns for 1.2s and hands the body back to its last
   * safe footing - which is the right price for a lesson that needs repeating.
   *
   * The third stands on the far end of the bridge's landing, and it is the hard one: you arrive
   * there at fourteen grams with seventy-four pixels of reach and no growth inside it, so it
   * has to be got past on foot with nothing. Under you, beside you, and between you and the way
   * on. That is worth more than three creatures.
   *
   * 46px/s against a crawl of 92, so a player already past one can always outrun it and a
   * player who is not can never quite walk through it.
   */
  critters: [
    { from: 520, to: 700, y: 760, speed: 46, w: 26, h: 42, x: 520, facing: 1, wait: 0, phase: 0 },
    { from: 690, to: 880, y: 760, speed: 44, w: 26, h: 42, x: 880, facing: -1, wait: 0, phase: 0 },
    { from: 380, to: 600, y: 1020, speed: 42, w: 26, h: 42, x: 380, facing: 1, wait: 0, phase: 0 },
  ],

  /**
   * The column, and the only thing in this game that lifts you.
   *
   * 14 grams against the grate's 24, which is the whole point of the pair: the wall and the
   * air disagree, so a player who split to exactly what the wall asked for arrives here still
   * too heavy and has to shed again. 2050 against gravity's 1500 is a net 550, which the
   * existing damping settles at about 330px/s - a seven-hundred-pixel ride in a little over
   * two seconds. A ride, not a launch.
   *
   * It runs from the machine floor to the underside of its own cap, so the top of the ride is
   * the ceiling and the only opening is the ledge to the west.
   */
  updrafts: [{ x: 1090, y: 870, w: 160, h: FLOOR - 870, force: 2050, liftMass: 14, feather: 45 }],

  /**
   * The giant mushrooms, placed rather than derived.
   *
   * Two on the machine floor under the deck, because the recall at the end of beat six is a
   * player looking straight down two hundred pixels at their own mass, and what is beside it
   * should be worth looking at. One at the foot of the climb, which is what the gallery's arcs
   * have to clear.
   */
  landmarks: [
    { x: 300, y: FLOOR, size: 160 },
    { x: 700, y: FLOOR, size: 184 },
    { x: 860, y: FLOOR, size: 148 },
  ],

  /**
   * Paint, not HUD. The two markings sit where their verb is first needed.
   *
   * The stage assumes swing, split, press and throw - three stages in, all four are furniture -
   * so what is marked is only what is new: the direction of the first release, and the number
   * the air will accept, which the HUD also says at the moment it binds.
   */
  signs: [
    { x: 1000, y: 250, lines: ['LET GO', 'AT THE', 'BOTTOM'], scale: 0.85 },
    { x: 1170, y: 1480, lines: ['LIFT', 'MAX 14g'], scale: 0.9 },
  ],
};

/** A fresh copy - gates, buttons, growths, presses and creatures are all mutated by play. */
export function freshSluice(): World {
  return {
    ...THE_SLUICE,
    exit: { ...THE_SLUICE.exit },
    tiles: THE_SLUICE.tiles.map((t) => ({ ...t })),
    anchors: THE_SLUICE.anchors.map((a) => ({ ...a })),
    gates: THE_SLUICE.gates.map((g) => ({ ...g, span: g.span ? { ...g.span } : undefined })),
    buttons: THE_SLUICE.buttons.map((b) => ({ ...b })),
    crushers: (THE_SLUICE.crushers ?? []).map((c) => ({ ...c })),
    critters: (THE_SLUICE.critters ?? []).map((c) => ({ ...c })),
    updrafts: (THE_SLUICE.updrafts ?? []).map((u) => ({ ...u })),
  };
}
