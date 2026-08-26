/**
 * M4SS - the body, and the rule that your reach is bought with it.
 *
 * ## Mass is particles
 *
 * One particle is one gram. That single choice hands the design most of what it asked for
 * instead of implementing it: mass is conserved because particles are never created or
 * destroyed, splitting is a change of ownership, eating is particles added at the mouth, and
 * "every piece of you physically exists in the level" is the representation rather than a
 * feature. A lump you left behind IS the particles you left behind.
 *
 * Nothing here knows about the engine, a camera or a mesh - surface.ts turns the particles
 * into something to look at, and it is the only thing that ever should. That separation is
 * what let the reach curve be swept headlessly before any of it was drawn.
 *
 * ## The reach is stated, not emergent, and that was a decision
 *
 * Four versions tried to have the limit fall out of the physics - string the body toward the
 * anchor and see whether cohesion holds. Every one produced the wrong game, and the failures
 * are worth keeping:
 *
 *   pull the nearest share    inverted it. A 30-mass slime arrived at 300px with 90% of
 *                             itself; a 240-mass one tore into twenty pieces. The unpulled
 *                             remainder is dead weight, and big bodies have more of it.
 *   hold the tail, reach      the tip always arrived - detached. Distance changed nothing.
 *   require it to stay joined the right direction at last, and a flat 28% torn off every
 *                             time, which is exactly the tip's share of the body.
 *   cap the link force        right in principle, and two successes in sixteen attempts.
 *
 * The mechanic was never in doubt; the schedule was. So the tendril costs REACH_PER_MASS
 * pixels per gram and a level designer can size a gap and know what it asks for. The body
 * stays a real simulated blob, and the tendril is still made of its particles, so what the
 * player sees is unchanged.
 */

export interface Particle {
  id: number;
  x: number;
  y: number;
  px: number;
  py: number;
  ax: number;
  ay: number;
  grounded: boolean;
  /** Consecutive steps spent disconnected from the main body. See the stray check in step. */
  astray: number;
}

export interface Tile {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A growth. The thing you latch onto.
 *
 * Called a growth rather than an anchor point everywhere the player can see, because that is
 * what it is in the fiction and because "anchor" describes what it does to the code rather
 * than what it is in the room.
 */
export interface Anchor {
  /** Needed only by growths a button switches on. See `live`. */
  id?: string;
  x: number;
  y: number;
  /**
   * Whether this growth can be latched onto right now.
   *
   * Undefined means always - most growths are simply there. `false` is a RED growth: the
   * plant is visibly present and visibly dead, and a button somewhere brings it to life.
   *
   * Dead rather than absent, because the two teach opposite things. A growth that appears
   * when you press a button is a reward you did not know was coming; a growth that is
   * already hanging there in red is a QUESTION - the player can see exactly where the route
   * goes and has to work out what makes it usable. The whole design of stage two is that
   * you can always see the way through and not always take it.
   */
  live?: boolean;
  /**
   * The rope length to settle to, if the designer wants one.
   *
   * Without it the rope is however far away you latched from, which is the honest physical
   * answer and makes every swing's geometry depend on where the player happened to be
   * standing. That is fine over an open pit and impossible to lay out around a wall: a
   * pendulum sweeps a disc twice its radius wide, so an un-designed radius means an
   * un-designed disc, and the level cannot promise the arc is clear of anything.
   *
   * Given one, the body is drawn to that length on attaching. The REACH check is unchanged -
   * you still have to be able to get the tendril there - so this sets the shape of the swing
   * without touching what it costs to start one.
   */
  rope?: number;
}

/**
 * A wall that can be raised, and the button that raises it.
 *
 * The gate is a solid tile while it is shut and nothing at all once it is open - it slides
 * up, and the slide is cosmetic. Collision flips in one frame, because a gate that is
 * half-open is a gate that can trap a slime inside itself, and there is no good frame to
 * discover that on.
 */
export interface Gate {
  id?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  open: boolean;
  /** 0 shut, 1 fully through its travel. Drives the mesh only. */
  lift: number;
  /**
   * What opening it DOES.
   *
   * `lift` (the default) slides the slab up and out of the way: solid when shut, nothing at
   * all when open. That is a door.
   *
   * `bridge` falls flat instead, and this is the more interesting one - it is solid in both
   * states, in two different places. Standing, it is a wall you cannot pass; down, it is a
   * FLOOR across the pit it was standing beside. Opening it does not remove an obstacle, it
   * builds a route, which means the button that drops it is not "unlock" but "make the last
   * gap walkable" - and the player has to be somewhere else to press it.
   */
  mode?: 'lift' | 'bridge';
  /**
   * The most mass, in grams, that can pass through this gate's gap while it is shut.
   *
   * The gap used to be enforced by geometry alone - the wall stops 30px above the floor,
   * and a body taller than 30px cannot fit - and that was measured to be no enforcement at
   * all: `crawlRelax` flattens a CRAWLING body to about 15px regardless of its mass, so a
   * full 40-gram slime oozed under both stages' walls and the split, the clause the walls
   * exist for, was optional. There is no gap height that separates the two, because the
   * crawling heights of a full body and a legal split overlap completely.
   *
   * So the gap is a SIEVE, and it says so in grams. While the gate is shut, a body over
   * this mass finds the gap solid; at or under it, the gap is open as before. The fiction
   * supports it directly - this is a containment grate, and a grate passes small things
   * and stops big ones - and the player-facing read is unchanged: "I am too big to fit"
   * is exactly what it looks like either way.
   *
   * Enforced against the OWNED body only. Loose shed lumps always pass, because a grate
   * that stops a fist-sized lump is a wall, and recall has to be able to pull your mass
   * through an opened doorway regardless.
   */
  sieve?: number;
  /**
   * Where a `bridge` lies once it is down. Ignored by `lift` gates.
   *
   * Stated by the designer rather than derived from a rotation, because what matters is the
   * rect the player can stand on, and deriving it from the pivot and the slab's dimensions
   * put it one wall-thickness out every time I tried.
   */
  span?: { x: number; y: number; w: number; h: number };
}

export interface Button {
  id?: string;
  x: number;
  y: number;
  radius: number;
  pressed: boolean;
  /**
   * Which gates this opens, by id. Undefined opens EVERY gate, which is stage one's wiring
   * from back when there was one button and one gate, and is kept so that stage reads the
   * same as it always did.
   */
  opens?: string[];
  /** Which red growths this brings to life, by id. */
  activates?: string[];
  /**
   * The gate this button is BOLTED TO, by id.
   *
   * A button mounted on a door has to travel with it, or the moment it is struck the door
   * lifts and leaves its own switch hanging in the air - which reads as a bug however
   * correct the wiring is. The sim moves it with the gate's lift; the rig draws it there.
   */
  onGate?: string;
  /**
   * Drawn standing on a wall rather than lying on the floor.
   *
   * Orientation is not decoration here: a floor plate says STAND ON ME and a wall plate
   * says HIT ME, and this stage's last clause is a thing you hit with a flung body.
   */
  vertical?: boolean;
  /** Where the button sits while its gate is shut. Filled in by the sim on first step. */
  restY?: number;
  /**
   * Impact speed needed to trigger it, in px/s. Undefined means any touch will do.
   *
   * This is the wall button: a slime that crawls into it does nothing, and one that arrives
   * off a full revolution sets it off. It makes momentum a KEY rather than only a way to
   * travel - the player has to build a swing they do not need for distance, purely because
   * the door is heavy.
   */
  force?: number;
}

/**
 * A slab that moves on a timer and takes mass off anything it closes on.
 *
 * It is solid the whole time - it pushes, it carries, you can ride it. What makes it a
 * hazard is only that it can push you somewhere there is no room, and the rule for that is
 * deliberately mechanical rather than a damage zone: you lose mass when the crusher has
 * pushed you INTO something else, which is what being crushed is.
 *
 * Nothing dies. The caught particles stop being yours and squirt out of the gap as a loose
 * lump, which you can come back for with Q. That keeps the conservation rule the whole
 * simulation is built on - particles are never created or destroyed - and it keeps stage
 * one's promise that failure costs the attempt and never the creature. A mistimed run
 * through a press is expensive and recoverable, which is the right price for a timing test.
 */
export interface Crusher {
  x: number;
  y: number;
  w: number;
  h: number;
  /** How far it travels from its rest position, in px. */
  travel: number;
  /** Which way it travels. Vertical presses are the default. */
  axis?: 'x' | 'y';
  /** Seconds for one out-and-back. */
  period: number;
  /** 0..1, so a row of them can be offset into a wave rather than moving as one. */
  phase: number;
  /** Current offset along `axis`. Written by step; read by the renderer. */
  at: number;
}

/**
 * A creature that walks a platform, and the first thing in M4SS that is alive besides you.
 *
 * The stage's hazards up to now are all machines on timers - a press keeps its rhythm
 * whatever you do, so learning one is learning a clock. A patroller is the same puzzle with
 * the clock taken out: it is somewhere specific, it is going somewhere specific, and the
 * question is where it will be when you commit rather than when the next beat lands.
 *
 * Touching one costs what a pit costs - the attempt, never the creature. That is not
 * leniency, it is the rule the whole game is built on: mass is the economy, nothing in a
 * stage replaces what you lose, and an enemy that ate a quarter of you would be the one
 * object in M4SS that can make a level unwinnable without killing you.
 */
export interface Critter {
  /** The two ends of its beat, in world x. It walks between them for ever. */
  from: number;
  to: number;
  /** The y of the surface it walks on - it stands ON this, the same as the player. */
  y: number;
  /** px/s along its beat. */
  speed: number;
  /** Half-width and height of the body that can touch you. */
  w: number;
  h: number;
  /** Live state, written by step and read by the renderer. */
  x: number;
  /** -1 walking west, 1 walking east. The sprite is drawn facing west. */
  facing: 1 | -1;
  /** Seconds left of the pause at the end of a leg, or of a recoil after a hit. */
  wait: number;
  /** Seconds of walk animation accumulated. Only advances while it is moving. */
  phase: number;
}

/**
 * A column of rising air, and the only thing in this game that lifts you.
 *
 * ## Why it is a mass ceiling and not a force ratio
 *
 * The obvious version makes the draught a force and lets f = ma decide: a heavy body rises
 * slowly, a light one fast, nobody states a threshold. That is the emergent answer, and the
 * header of this file is thirty lines about four emergent answers that all produced the wrong
 * game. It would produce the wrong game here too, for a reason that is specific rather than
 * historical - a slime is a pile of particles with no rigid body, so a force that ALMOST lifts
 * it lifts the top of it and leaves the bottom, and the player watches themselves being pulled
 * apart by weather. There is no reading of that which says "I am too heavy".
 *
 * So the column states its limit in grams the way the sieve does, and for the same reason: the
 * rule is invisible by nature, and a rule the player cannot see has to be a rule they can be
 * TOLD. Under `liftMass` you rise; over it you stand in the draught and nothing happens. The
 * HUD says the number at the moment it binds (see M4SSRig's hudNote) and at no other time.
 *
 * ## Whole-body, not per-particle
 *
 * The lift is decided once for the CENTROID and then applied equally to every owned particle.
 * A per-particle test would put the body under differential force whenever it straddled an
 * edge - half of you lifting, half of you not - and the cohesion solver would either tear or
 * grind. Uniform force adds no internal stress at all: the column moves the creature, not its
 * pieces.
 *
 * The edge is feathered horizontally so drifting out of the column eases off rather than
 * dropping you, which is what air does and what a hard rect does not.
 */
export interface Updraft {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Upward acceleration in px/s^2, against gravity's 1500. See TUNING.gravity. */
  force: number;
  /** The most mass, in grams, the column can carry. Over this it does nothing at all. */
  liftMass: number;
  /**
   * How wide the soft edge is, in px, at each side. Defaults to 40, clamped to half the width.
   *
   * Only the SIDES are feathered. The top and bottom are hard, because they are level design:
   * a designer sizes the column to end where the platform is, and a column that faded out
   * vertically would make "how high does this take me" a question with no stateable answer.
   */
  feather?: number;
}

export interface World {
  width: number;
  height: number;
  start: { x: number; y: number };
  /**
   * Where the portal stands. DECLARED, after inference broke twice: the renderer used to
   * pick "the right-most tile that is floor-shaped", which chose the boundary wall until a
   * height filter was added, and then chose nothing at all when the floors were deepened
   * to close the under-level corridor - buildPortal crashed on undefined, and because the
   * slime is built after the portal, the crash presented as "stage two has no player".
   * A level knows where its own exit is; guessing from geometry was never information,
   * it was luck.
   */
  exit: { x: number; y: number };
  tiles: Tile[];
  anchors: Anchor[];
  gates: Gate[];
  buttons: Button[];
  crushers?: Crusher[];
  critters?: Critter[];
  updrafts?: Updraft[];
  /**
   * Set-dressing the LEVEL wants placed, rather than the renderer's derived scatter.
   *
   * The giant mushrooms are normally positioned by picking the widest floors, which is fine
   * for scenery and wrong the moment a platform is laid out in relation to one: the ledge
   * would be anchored to a decoration that is anchored to a tile-width sort, and the first
   * time either changed the composition would quietly come apart. A landmark is a mushroom
   * the level is willing to be measured against.
   */
  landmarks?: Array<{ x: number; y: number; size?: number }>;
  /**
   * Wall stencils. Pure decor - the sim never reads them - but they are LEVEL data
   * because where a control is taught is a level-design decision: the marking sits at the
   * first place the verb is needed, and a second stage that assumes the verbs carries
   * none. See stageArt.signTexture for why they are paint rather than HUD.
   */
  signs?: Array<{ x: number; y: number; lines: string[]; scale?: number }>;
}

export interface Input {
  move: -1 | 0 | 1;
  anchor: Anchor | null;
  recall: boolean;
}

export interface MassState {
  world: World;
  particles: Particle[];
  owned: Set<number>;
  attached: boolean;
  tendril: number;
  strain: number;
  broken: boolean;
  tip: { x: number; y: number } | null;
  reachLimit: number;
  snapped: number;
  time: number;
  /**
   * The rope, once you are on it.
   *
   * Fixed at the length the tendril had when it connected, so latching from further away
   * gives you a longer swing - which is the only reason a player ever chooses WHERE to latch
   * from rather than just whether they can. 0 when not swinging.
   */
  swingRadius: number;
  /** Radians per second around the growth. Read by the HUD; it is what "momentum" means here. */
  spin: number;
  /** True for the single frame after the rope takes hold - see gripAbsorb. */
  justGripped: boolean;
  /**
   * The mass the stage began with. The 20% floor is measured against THIS, not against
   * whatever is left - a floor measured against the current body shrinks with every split,
   * which is no floor at all.
   */
  startMass: number;
  /**
   * 1 just after letting go of a growth, easing back to 0 once the body has landed.
   *
   * While it is up, cohesion and surface tension are multiplied - see regroupBoost. This is
   * the landing-shatter fix: a released body hits the ground front-first, the front stops on
   * friction and the back is still doing 600px/s, and the stretch between them passes
   * linkRange in a couple of frames. The slime arrived as six slimes. Stronger glue only
   * during flight and touchdown keeps the body one thing without making it stiffer to play.
   */
  regroup: number;
  /** Seconds of immunity left after a critter hit. See TUNING.critterStun. */
  stunned: number;
  /** Seconds the CURRENT direction key has been held without release or reversal. */
  heldFor: number;
  /** Latched while the swing is TURNING - energy hysteresis, see circulateExit. */
  turning: boolean;
  /**
   * How long the player has been holding no direction while on a growth.
   *
   * Reset by any push. Drives the idle bleed, which is what stops a swing nobody is driving
   * from circling for ever - see TUNING.swingGrace for why it is a duration rather than a
   * per-frame test.
   */
  coasting: number;
  /**
   * The body's shape at the moment it grabbed on, in the rope's own frame.
   *
   * Each entry is one particle's offset from the centroid, split into "along the rope" and
   * "across it", so the shape can be rebuilt at any angle without storing the angle. Empty
   * whenever nothing is attached.
   */
  swingShape: Array<{ id: number; along: number; across: number }>;
  /**
   * Where the body last stood SAFELY - grounded, whole, on real floor. The pit hands a
   * fallen body back HERE, not to the start of the room. It used to respawn at world.start,
   * and the playtest read that as an invisible wall: stage one's exit pit sits just past
   * the button, so every attempt to walk east teleported the player back across the whole
   * room - "the button is blocking my movement". Losing a few seconds of progress is a
   * lesson; losing the whole room is a punishment for exploring.
   */
  lastSafe: { x: number; y: number };
  /**
   * 1 the moment a fling is released off a fast swing, easing to 0.
   *
   * The rig turns this into real time, not simulated time - the step is fixed at 1/120 and
   * always will be, because every number measured about the reach is only true at that step.
   * What slows is how many steps a wall-clock second buys.
   *
   * It exists because releasing at speed asks two things of the player in the same instant:
   * pick the moment, and pick the next growth. At full speed the flight between two growths
   * in a vertical shaft is a fraction of a second, which is not an aiming window, it is a
   * reflex test. Stretching it is the difference between a chain of grabs being a plan and
   * being luck.
   */
  slowmo: number;
}

export const TUNING = {
  /** Fixed, so what is measured headlessly and what is played cannot disagree. */
  dt: 1 / 120,
  gravity: 1500,
  /** Spacing two particles settle at. Sets the slime's density. */
  rest: 9,
  /** Past this, two particles are not connected. */
  linkRange: 15,
  /**
   * The dead band, and the fix that made this stable at all.
   *
   * The first solver pushed apart below `rest` and pulled together above it, which is
   * unsatisfiable: a particle cannot be exactly `rest` from all six neighbours at once, so
   * every particle was corrected every frame forever. Verlet turns a correction into
   * velocity, so the blob did not jitter - it detonated, hitting 25px per frame within six
   * frames. Nothing pulls between `rest` and `slack`, which is where a settled packing lives.
   */
  slack: 12,
  push: 0.6,
  pull: 900,
  /** The most one link can pull. A neck's strength is its cross-section. */
  maxPull: 2600,
  iterations: 3,
  maxCorrection: 3,
  /**
   * Surface tension, and the reason this is a slime rather than sand.
   *
   * Found by drawing it, not by measuring it: the body flattened to two particles thick and
   * spread 220px along the floor while every number in the reach sweep stayed correct.
   * Neighbour forces cannot object to a pancake - a flat sheet has all its neighbours at a
   * comfortable distance - so the objection has to come from the shape as a whole.
   */
  /*
   * 0.5 / 950 / 14000, up from 0.62 / 260 / 3000, and this is the "make it rounder" pass.
   *
   * The old numbers settled a 40-mass body into a 106x24 pancake - a puddle with a HUD. The
   * cap was the binding constraint: the inward pull needed to lift a pile against gravity is
   * far more than 3000, so raising `tension` alone did nothing. Swept headlessly: these
   * settle 40 into 71x40 and 10 into 36x15, which reads as a creature. Two things had to
   * move with it - the tendril is exempted from tension while reaching (see below, the pull
   * would bury the reach force), and the wall gap in lab.ts narrowed to stay smaller than
   * the now-taller body.
   */
  /*
   * 0.44, down from 0.5: the radius inside which surface tension leaves a particle alone,
   * as a multiple of sqrt(count)*rest. SMALLER means the skin starts pulling sooner, so
   * the resting body is a tighter, rounder mound - the playtest asked for a rounder slime
   * and this is the number that decides it.
   */
  roundness: 0.5,
  tension: 950,
  maxTension: 14000,
  damping: 0.986,
  /** Damping while airborne off a fling - see the drag note in the integrator. */
  flightDamping: 0.9975,
  /** Raised from 2600 - the crawl read as sluggish even with the relaxises doing their part. */
  /** Raised again on playtest feedback - the crawl read as slow even after 3300. */
  /*
   * 6400, up from 4300. The playtest asked twice for the ground crawl to be quicker, and
   * the second ask is the one that settles it: this is a puzzle platformer whose puzzles
   * are the swings, and the walking between them is dead time. A slime should still look
   * like it is pouring itself along rather than running - the metaball body and the low
   * top speed do that on their own - but it should not be the reason a retry feels long.
   */
  move: 6400,
  friction: 0.55,
  bounce: 0.05,
  /**
   * How hard particles are held onto the tendril's line.
   *
   * Sets the PRICE of failure rather than whether you succeed. At 5200 an over-reach tore
   * the remaining body apart and cost 60% in six lumps; at 3600 the same failure costs 20%
   * in one, and every successful reach still arrives whole.
   */
  /*
   * How hard a torn-off OWNED lump is pulled back to the main body. Weak on purpose: it
   * must never fight a deliberate squeeze through a sieve, only heal an accident once the
   * gap is behind you.
   */
  rejoin: 900,
  reach: 3600,
  /**
   * Pixels of tendril per gram. The difficulty dial for the whole game.
   *
   * Raised from 1.8, and the reason is that eating is gone. At 1.8 a starting body reached
   * 81px into a level 1280 wide, which was playable only because biomass existed: the first
   * growth was out of range on purpose and you ate your way up to it. With nothing to eat,
   * the reach you start with is the reach you have, so it has to be worth something on the
   * first screen.
   *
   * 4.6 puts roughly half the body into the tendril at full stretch - cost is tendril/rest,
   * so 4.6/9 of the mass - which is the version of "your reach is bought with mass" that can
   * actually be felt. At 1.8 it was a fifth, and a fifth is a rounding error.
   */
  /*
   * 5.3, up from 4.6, on the playtest's ask: "increase the distance the mass can latch on
   * to a growth from". A full 40-mass body reaches 212px rather than 184.
   *
   * The ceiling is a level-design fact, not a taste: stage one's second clause is that a
   * body squeezed small enough for the sieve (24) must NOT be able to reach the high
   * growth at 140px, so it has to go back for the mass it left. That fails above 5.83, and
   * the first attempt at 5.9 duly broke the puzzle. 5.3 keeps thirteen pixels of margin
   * there and still puts a whole 17% more reach in the player's hands.
   */
  /**
   * The mass a press will never take you below.
   *
   * 20 against reachPerMass 5.3 is 106px of reach - enough to cross to a growth from a
   * sensible standing spot, which is the whole point: whatever else a press does to the
   * player, it must not leave them unable to play the level.
   */
  crushFloor: 20,
  /**
   * The fraction of the creature a press takes when it catches you.
   *
   * Measured backwards from the thing it has to accomplish. Reaching stage two's last growth
   * from the corridor floor is 120px, which is 23 mass; a body of 40 that keeps 55% of
   * itself is 22, just under - so being hammered actually stops you, and the answer is to go
   * back and call your mass home rather than to shrug and carry on. Before this, a full pass
   * of the press took nine grams and then nothing ever again.
   *
   * Floored at crushFloor, and the mass is shed rather than destroyed. That pairing is what
   * lets the bite be this big without being cruel: the press can take almost half of you, and
   * all of it is lying on the floor waiting for Q.
   */
  crushBite: 0.45,
  /** How long a critter dwells at each end of its beat, in seconds. */
  critterPause: 0.6,
  /**
   * Grace after a critter hits you, in seconds.
   *
   * Without it the stage can lock: the body is handed back to its last safe footing, and if
   * that footing is the very ledge the creature patrols, the next frame is another hit and
   * the player never gets a turn. Both sides stand still for this long - the creature
   * recoils, the body cannot be touched - which is long enough to walk clear.
   */
  critterStun: 1.2,
  reachPerMass: 5.3,

  /**
   * Tangential push per particle while swinging, from A/D.
   *
   * This is the pump, and it is the whole skill of the mechanic: pushed in time with the
   * swing it compounds, pushed against it kills the arc.
   *
   * The number is less of the difficulty story than it used to be. What stops a free
   * crossing now is gripAbsorb - a latch arrives with almost no swing, whatever this is set
   * to - and what stops coasting is drag, which kills an unpumped pendulum inside two
   * seconds. So this constant sets the ENERGY CEILING: the equilibrium a continuously
   * pumped swing settles at. 1100 equilibrated near 410px/s, just under what clears the
   * pit, and no amount of patience could cross; 1600 sits comfortably above it, and the
   * crossing takes the second-or-two of honest pumping the release window implies.
   */
  swingPump: 1000,
  /**
   * What the pump is multiplied by once the body is genuinely fast (past 300px/s along
   * its arc). Below that the pump is ordinary, and below 60 it is a quarter - the three
   * regimes are what let the 360 be both earned and repeatable.
   */
  swingCommit: 1.8,
  /**
   * The ceiling on a swing, as ENERGY, in multiples of gravity times the rope length.
   *
   * This is the missing half of swingCommit and the reason the playtest kept saying the 360
   * is "sometimes too fast". A 1.8x multiplier that switches on at speed and never switches
   * off is a positive feedback loop: past the threshold every push is stronger, which keeps
   * you past the threshold, and the only thing opposing it is drag. Where a swing ended up
   * was therefore a function of how long the key happened to be held - a stopwatch, not a
   * skill.
   *
   * The first attempt capped instantaneous tangential SPEED, and the harness caught it being
   * the wrong invariant. Speed on a pendulum is highest at the bottom and lowest at the top,
   * so a speed cap binds only at the bottom - and the number it binds at has to clear the
   * whole circle. Carrying a rope of 80 over the top against gravity 1500 needs 775px/s at
   * the bottom before drag; a cap of 520 made a full revolution physically impossible, and
   * long pumps duly built up and then fell out. Measured: four seconds gave 3.5 rad/s, eight
   * gave 6.2, fourteen gave 1.5.
   *
   * Energy is the invariant that does not care where on the circle you measure it. Held at a
   * constant, a committed revolution converges on ONE speed at every point of the arc, which
   * is the property that makes the shaft's jumps learnable and the heavy button's 420px/s a
   * threshold rather than a lottery.
   *
   * 2.7, and the window is narrower than it looks. Completing a circle needs 2.5 - half a
   * rope-length of speed at the top plus two rope-lengths of height - so this keeps about
   * eight percent in hand: enough that drag and a sloppy line do not cost the revolution.
   *
   * The ceiling above is stage one's finale. Held at 2.9 the sustained swing is violent
   * enough that the fling tears the body into pieces in mid-air, which the harness checks
   * for; 2.6, 2.7 and 2.8 all land it whole, 2.5 and 2.9 do not. That is a narrower band
   * than a number like this should have, and it is worth knowing that raising it is not free.
   */
  swingEnergy: 2.7,
  /**
   * How much of the pump's strength a push AGAINST the motion keeps.
   *
   * 1 would be symmetric braking, which is what made one-key holds a lottery - see the gate.
   * 0 would mean a held key never brakes at all and the backswing is uncontrollable. A third
   * keeps letting-off meaningful while letting a held direction win a little energy each
   * cycle.
   */
  swingBrake: 0.34,
  /**
   * How long a pressed direction stays at full pumping strength, in seconds.
   *
   * This is the striking of the deal the player asked for in so many words: "swing left and
   * right by pressing A and D, higher and higher, until I can make a turn - and holding one
   * key must not be a 360." Pumping IS alternation, so each fresh press pushes at full
   * strength for about one half-period of the swing and then goes stale; a player pressing
   * in rhythm is always fresh, and a player just leaning on a key is strong for under a
   * second and feeble after. Rhythmic one-sided tapping still works, because tapping in
   * time with the arc is pumping - what dies is the lazy hold.
   */
  pumpFresh: 0.9,
  /**
   * Where the strong-swing boost engages while BUILDING, in px/s along the arc.
   *
   * Without it, resonant pumping equilibrates around 2.3 rad/s on the shaft's short ropes -
   * measured - and reaching a turn depended on parametric charity from nearby geometry, the
   * exact lottery this redesign exists to kill. With it, rhythm punches through to
   * circulating energy on every rope in the game. A lazy hold cannot exploit it: freshness
   * expires at 0.9s and a lazy crest was measured to need 2.2s of full-strength pushing.
   */
  swingBuildAt: 240,
  /** What a stale held key keeps of the pump while still building. As weak as a lean. */
  pumpStale: 0.25,
  /**
   * The energy, in multiples of gravity times rope, above which the swing counts as ABLE TO
   * TURN - and a held key switches from pumping to sustaining.
   *
   * Carrying over the top needs 2.0 exactly (two rope-heights, arriving with nothing), and
   * the threshold sits deliberately UNDER that, at 1.7: a marginal crest carries almost no
   * spare energy, and a threshold above it left the held key stale at the exact moment the
   * player had earned the turn - measured, the circle died at the top with 0.2 revolutions.
   * At 1.7 the handover happens on the last upswing: the moment a pumped swing is genuinely
   * about to crest, holding the direction takes over at swingCommit strength and drives it
   * round - "then hold A or D to keep turning".
   *
   * A lazy hold cannot reach it: the one-key stall was measured at roughly 0.25 of a
   * rope-energy, seven times below this line.
   */
  circulateEnergy: 1.7,
  /**
   * Where a turning swing stops counting as turning - the exit of a hysteresis pair.
   *
   * Without it, a transient dip below circulateEnergy (slosh over the top is enough)
   * dropped a held-key circle into the building band with a key that had been held for
   * seconds - stale, a quarter strength - and the circle died with the player doing
   * exactly what they were told to do. Measured: pump 4s then hold gave 9.9 rad/s; pump
   * 8s then hold gave 3.1. Entered above circulateEnergy, a turn now survives until the
   * swing genuinely falls out of its circle.
   */
  circulateExit: 1.35,
  /**
   * Sideways push while falling, in px/s^2, against a ground crawl of 6400.
   *
   * Measured rather than guessed, and both numbers are load-bearing. Over nine tenths of a
   * second of flight - a long throw - holding a direction turns 233px of travel into 339px:
   * enough to save a throw that came down just short of a lip, and a real assist rather than
   * a token one. Walking off stage one's start lip holding the same key reaches x 424 against
   * a far lip at 480, so the pit is still a pit.
   *
   * That second number is the one to protect. The swing has to stay the only thing in this
   * game that produces real distance; the day a player can cross a pit by stepping off it and
   * leaning is the day the growths stop mattering. Both are checked in scripts/m4ss-stage.ts.
   */
  airMove: 420,
  /**
   * How fast a swing bleeds off while the player is holding nothing, per second.
   *
   * The other half of the same complaint - "it keeps doing the 360 even when I am not
   * holding A or D". It did, and honestly: pass 69 deliberately pushed a committed swing
   * clear of the energy needed to carry over the top, and a pendulum above that line with
   * only ordinary drag on it will circle for a very long time on its own.
   *
   * So letting go now means something. This is an exponential decay with a time constant of
   * about three seconds, which costs a coasting swing its circle in roughly two.
   *
   * It does NOT apply the instant a key is released - see swingGrace. Pumping in rhythm means
   * holding nothing for most of every revolution, so a bleed that fires on any idle frame
   * fights the pump rather than the coast. The first version did exactly that and stage one's
   * finale fling stopped reaching the shelf: its driver holds nothing over the top of every
   * loop, and the bleed was taking the swing apart a little on each pass.
   */
  swingIdle: 0.34,
  /**
   * How long the player has to be holding nothing before the swing starts winding down.
   *
   * Long enough to cover the gaps in normal pumping - a rhythm has both hands off the keys
   * for a good part of each cycle - and short enough that a player who has genuinely stopped
   * sees the swing answer within about a second.
   */
  swingGrace: 0.55,
  /** Below this the rope is too short to swing on and the body just hangs against the growth. */
  minSwing: 26,
  /** How long a fling's slow motion lasts, in simulated seconds. */
  slowmoSeconds: 0.9,
  /**
   * How slow it goes at full effect - real time is multiplied by this.
   *
   * 0.35 rather than something more dramatic. The body is still flying and the player is
   * still steering it; below about a third the fling stops reading as a fling and starts
   * reading as a pause, and the arc loses the weight that made it worth building.
   */
  slowmoScale: 0.35,
  /**
   * Spin, in radians per second, above which a release is worth slowing down for.
   *
   * A slow release is a drop, not a fling, and slowing time for a drop makes the whole game
   * feel like it is buffering.
   */
  /*
   * 2.1, down from 2.6. Fixing the latch-split firmed the body during a reach (only the
   * arm is exempt from surface tension now, not the whole creature), and a firmer body
   * takes a little less energy in at the grip: the measured top of a well-pumped swing on
   * the shaft's short rope fell from just over 2.6 rad/s to 2.3. The swing is unchanged in
   * every way the player can feel - it still crosses, still flings, still carries the 360 -
   * so the threshold follows the physics rather than the physics being bent to keep an old
   * threshold true. A passive hang still measures near zero, which is the only thing this
   * number has to stay clear of.
   */
  slowmoAt: 2.1,
  /**
   * How much of the body's arrival speed survives the grab.
   *
   * Latching is a lunge: the reach force slings the whole body at the growth, and the rope
   * then converts whatever speed it arrives with into orbit. Measured, that transient was
   * 500px/s of free swing - most of a terminal swing, unearned, before the first pump. A
   * grip that absorbs two thirds of the arrival makes the swing start from nearly still,
   * so amplitude is something the player builds rather than something the latch dispenses.
   */
  gripAbsorb: 0.35,
  /**
   * How hard the body is held to the shape it grabbed on with, per frame.
   *
   * 0 is the centroid-only constraint that tore it into a streamer; 1 is a rigid plank swung
   * on a stick, with none of the sag that makes it a slime. 0.35 keeps it together through a
   * full rotation and still lets it stretch visibly at the bottom of the arc, which is where
   * a hanging body should stretch.
   */
  swingHold: 0.35,
  /**
   * How much MORE shape-hold a fast revolution gets, per radian/second of spin.
   *
   * 0.35 alone kept the body whole through the swings the old physics produced; the
   * earned 360 spins faster, and at speed the outer particles need more centripetal
   * correction than a fixed hold supplies - the body shed crumbs off its trailing edge
   * every revolution, which read as the creature disintegrating. Scaling the hold with
   * spin keeps the slack, saggy hang at low speed (where the sag IS the character) and
   * stiffens exactly when the physics demands it. Capped in the apply step - a hold
   * above ~0.85 reads as a plank on a stick.
   */
  swingHoldPerSpin: 0.14,
  /**
   * How much stronger cohesion and tension are at regroup 1. See MassState.regroup.
   *
   * 1.6 means 2.6x at the moment of release. High enough that a landing at full swing speed
   * stays one body; it decays before the player is back to fine manoeuvring, so the slime
   * does not feel starched.
   */
  regroupBoost: 2.4,
  /** Seconds for regroup to ease off - counted from touchdown, not from release. */
  regroupTime: 0.9,
  /**
   * Velocity smoothing between neighbours while regrouping, as a blend factor per step.
   *
   * The landing splash is a velocity problem and force-based glue cannot fix it: by the time
   * a spring has accumulated any impulse, the particles are already past linkRange and there
   * is no longer a link to pull on. Viscosity acts on the difference in velocity directly -
   * neighbours moving apart are dragged toward moving together - which is what actually
   * distinguishes a slime landing from water landing.
   */
  regroupViscosity: 0.08,
  /**
   * The hanging teardrop, as scales on the held swing shape's cross-axis.
   *
   * 0.35 at the growth end, 1.1 at the bottom, and the window is narrower than it looks:
   * at 1.35 the bottom widening won outright and the body flattened into a pancake ACROSS
   * the rope - each frame's widened targets fed the next frame's shape until sideways was
   * the shape. Verified hanging still, by measuring: top third ~9px wide, bottom ~14, on a
   * body ~60 long along the rope. The thing holds on with part of itself; it does not
   * dangle from a hook.
   */
  taperTop: 0.5,
  taperBottom: 1.15,
  /** The floor under splitting: you can never keep less than this fraction of startMass. */
  keepAtLeast: 0.2,
  /**
   * How much of its surface tension a body keeps while it is being DRIVEN.
   *
   * A slime at rest gathers itself into a mound; a slime crawling relaxes and flows. Without
   * this the two were the same body, and the round one could not squeeze under anything: a
   * particle that entered a gap was pulled straight back out toward the centroid still
   * outside it, so the body pressed its face against the wall and wedged. Relaxed to a
   * third, it flattens as it moves, oozes through what its idle self cannot fit, and gathers
   * itself back up the moment the player lets go of the key. That resting-vs-flowing
   * difference reads more like a live creature than any of the deliberate shaping does.
   */
  crawlRelax: 0.35,
  extend: 420,
  attachAt: 14,
  snapAfter: 0.55,
  recall: 900,
  /**
   * How hard a creature bats a stray piece of you back toward the body, in px/s.
   *
   * Fast enough to be a visible shove and slow enough that the piece does not arrive as a
   * projectile - the rejoin force does the actual travelling, this only starts it.
   */
  strayKick: 260,
};

let nextId = 1;

function makeParticle(x: number, y: number): Particle {
  return { id: nextId++, x, y, px: x, py: y, ax: 0, ay: 0, grounded: false, astray: 0 };
}

/** Spiralled, so the starting shape is round rather than a waffle that settles into one. */
export function makeSlime(x: number, y: number, count: number): Particle[] {
  const particles: Particle[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const r = TUNING.rest * 0.62 * Math.sqrt(i);
    const a = i * golden;
    particles.push(makeParticle(x + Math.cos(a) * r, y + Math.sin(a) * r));
  }
  return particles;
}

type Grid = Map<string, Particle[]>;

function buildGrid(particles: Particle[], cell: number): Grid {
  const grid: Grid = new Map();
  for (const p of particles) {
    const key = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)}`;
    let bucket = grid.get(key);
    if (!bucket) grid.set(key, (bucket = []));
    bucket.push(p);
  }
  return grid;
}

function neighbours(grid: Grid, p: Particle, cell: number, out: Particle[]): Particle[] {
  out.length = 0;
  const cx = Math.floor(p.x / cell);
  const cy = Math.floor(p.y / cell);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const bucket = grid.get(`${cx + dx},${cy + dy}`);
      if (bucket) for (const q of bucket) if (q !== p) out.push(q);
    }
  }
  return out;
}

/**
 * Which particles are joined to which.
 *
 * This is what the game means by "you": the component holding the bulk is the player, and
 * every other component is a piece of them lying somewhere in the level.
 */
export function components(particles: Particle[]): Particle[][] {
  const parent = new Map<number, number>(particles.map((p) => [p.id, p.id]));
  const find = (a: number): number => {
    let root = a;
    while (parent.get(root) !== root) {
      parent.set(root, parent.get(parent.get(root) as number) as number);
      root = parent.get(root) as number;
    }
    return root;
  };
  const cell = TUNING.linkRange;
  const grid = buildGrid(particles, cell);
  const near: Particle[] = [];
  for (const p of particles) {
    for (const q of neighbours(grid, p, cell, near)) {
      if (Math.hypot(p.x - q.x, p.y - q.y) > cell) continue;
      const ra = find(p.id);
      const rb = find(q.id);
      if (ra !== rb) parent.set(ra, rb);
    }
  }
  const groups = new Map<number, Particle[]>();
  for (const p of particles) {
    const root = find(p.id);
    let group = groups.get(root);
    if (!group) groups.set(root, (group = []));
    group.push(p);
  }
  return [...groups.values()];
}

export function centroid(group: Particle[]): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (const p of group) {
    x += p.x;
    y += p.y;
  }
  return { x: x / group.length, y: y / group.length };
}

/**
 * Push one particle out of one box, along whichever face it is least deep into.
 *
 * Split out of collide so a shut gate is exactly as solid as a tile, using the same code
 * rather than a copy of it - a gate that collided slightly differently from the floor would
 * be a very slow bug to find, because it would only show up as the slime behaving oddly in
 * one corner of one level.
 */
/**
 * Push one particle out of one solid rect.
 *
 * ## Out of the face it came IN through, not the nearest one
 *
 * Nearest-face is the obvious rule and it is wrong for a soft body, in a way that only shows
 * up at speed. A blob arriving at a wall stops its front particles and keeps pushing with
 * everything behind them; cohesion shoves the front ones past the slab's midline; and from
 * there the nearest face is the FAR one, so they are helpfully expelled out the other side
 * and drag the rest of the body after them. The stage-one wall never showed it because the
 * only thing that ever touches that wall is a shed body crawling at fifteen pixels a second.
 * The drawbridge showed it immediately: a fling at 800px/s went through forty pixels of
 * stone as though it were a curtain, landed on the exit shelf, and the harness reported PASS
 * because it was still asking whether the body reached the shelf.
 *
 * So the entry face wins where there is one - if the particle was left of the slab last step
 * and is inside it now, it goes back out the left, however deep it got. Nearest-face remains
 * the fallback for a particle that is already inside without having crossed anything this
 * step, which is the only case where there is genuinely no better answer.
 */
/** Is there other solid geometry at this point? Used to find a rect's INTERNAL faces. */
function solidAt(world: World, x: number, y: number, except: Tile): boolean {
  for (const t of world.tiles) {
    if (t === except) continue;
    if (x > t.x && x < t.x + t.w && y > t.y && y < t.y + t.h) return true;
  }
  for (const gate of world.gates) {
    const s = gateSolid(gate);
    if (!s || s === except) continue;
    if (x > s.x && x < s.x + s.w && y > s.y && y < s.y + s.h) return true;
  }
  return false;
}

function hitTile(p: Particle, t: Tile, world: World): void {
  if (p.x < t.x || p.x > t.x + t.w || p.y < t.y || p.y > t.y + t.h) return;
  const left = p.x - t.x;
  const right = t.x + t.w - p.x;
  const top = p.y - t.y;
  const bottom = t.y + t.h - p.y;

  /*
   * ## Faces that are not really there
   *
   * Two floors laid end to end share a seam, and the tile on the east side of it has a west
   * FACE running the full depth of the level. Nothing is on the other side of that face - it
   * is interior, buried in the neighbouring floor - but collision cannot tell, so a particle
   * that has sunk ten pixels into the ground while walking finds a wall three pixels to its
   * west and is pushed back east. The body stops dead at a join in the floor.
   *
   * That is what happened at the corridor/alcove seam in stage two: the heavy gate opened and
   * the slime walked sixteen pixels in forty seconds. The same seam exists at every join in
   * both stages; it only shows where the player has to walk across one.
   *
   * So a face is a candidate only if the space just beyond it is empty. Checked live rather
   * than precomputed because gates move: a seam can be interior while a gate is shut and a
   * real edge the moment it opens.
   */
  const faces: Array<{ depth: number; face: 'top' | 'bottom' | 'left' | 'right' }> = [];
  /*
   * The top face is ALWAYS a candidate, even when something is standing on this tile.
   *
   * Excluding it symmetrically was the obvious thing to write and it emptied the level onto
   * the floor. The heavy gate stands on the alcove floor, so directly under the gate the
   * floor's top face is buried in the gate, its left and right faces are buried in the
   * neighbouring floors, and the only face left was the underside - the slime was expelled
   * through the ground and fell seven hundred pixels. Capping the ejection distance stopped
   * the fall and replaced it with the body crawling along INSIDE the floor, which is worse
   * for being quieter.
   *
   * Up is the one direction that always resolves correctly, because whatever is above will
   * take its own turn: pushed to the gate's underside, the particle is then pushed sideways
   * out of the gate, which is exactly where it should end up. Only the horizontal faces and
   * the underside are worth suppressing, and those are the ones the floor seam needs.
   */
  faces.push({ depth: top, face: 'top' });
  if (!solidAt(world, p.x, t.y + t.h + 1, t)) faces.push({ depth: bottom, face: 'bottom' });
  if (!solidAt(world, t.x - 1, p.y, t)) faces.push({ depth: left, face: 'left' });
  if (!solidAt(world, t.x + t.w + 1, p.y, t)) faces.push({ depth: right, face: 'right' });

  let pick = faces[0];
  for (const f of faces) if (f.depth < pick.depth) pick = f;

  // Which faces it crossed on the way in this step. Usually none or one; two at a corner.
  const inLeft = p.px <= t.x;
  const inRight = p.px >= t.x + t.w;
  const inTop = p.py <= t.y;
  const inBottom = p.py >= t.y + t.h;
  const entered = faces.filter(
    (f) =>
      (f.face === 'left' && inLeft) ||
      (f.face === 'right' && inRight) ||
      (f.face === 'top' && inTop) ||
      (f.face === 'bottom' && inBottom)
  );
  if (entered.length === 1) {
    pick = entered[0];
  } else if (entered.length > 1) {
    // At a corner, back out along whichever axis it was travelling faster - that is the one
    // that actually carried it in.
    const preferVertical = Math.abs(p.y - p.py) > Math.abs(p.x - p.px);
    const wanted = entered.filter((f) =>
      preferVertical ? f.face === 'top' || f.face === 'bottom' : f.face === 'left' || f.face === 'right'
    );
    pick = wanted[0] ?? entered[0];
  }

  /*
   * Never eject further than a particle could plausibly have travelled.
   *
   * With interior faces excluded it is possible for the only remaining exit to be absurd. A
   * particle wedged between the heavy gate and the floor it stands on has a floor whose top
   * face is buried in the gate, whose left and right faces are buried in neighbouring floors,
   * and whose only exposed face is the UNDERSIDE - 260px down. Collision duly expelled it
   * through the bottom of the level, and since the body drags its own particles along, the
   * slime poured through the ground and fell seven hundred pixels.
   *
   * A particle moves about four pixels in a step at swing speed. Anything claiming to need
   * twenty-four is not a collision being resolved, it is a wedge being catapulted. Leave it
   * where it is: it is stuck, which is the truth, and the body's own cohesion will work it
   * free within a few frames.
   */
  if (pick.depth > 24) return;

  const vx = (p.x - p.px) * TUNING.friction;
  const vy = p.y - p.py;
  if (pick.face === 'top') {
    p.y = t.y;
    p.py = p.y + vy * TUNING.bounce;
    p.px = p.x - vx;
    p.grounded = true;
  } else if (pick.face === 'bottom') {
    p.y = t.y + t.h;
    p.py = p.y + vy * TUNING.bounce;
    p.px = p.x - vx;
  } else if (pick.face === 'left') {
    p.x = t.x;
    p.px = p.x + (p.x - p.px) * TUNING.bounce;
  } else {
    p.x = t.x + t.w;
    p.px = p.x + (p.x - p.px) * TUNING.bounce;
  }
}

/**
 * The rect a gate occupies right now, or null if it is not in the way of anything.
 *
 * A lift gate is its own slab while shut and nothing once open. A bridge is its slab while
 * shut and its `span` once down - solid in both states, which is the entire point of it.
 */
export function gateSolid(gate: Gate): Tile | null {
  if (gate.mode === 'bridge') return gate.open ? (gate.span ?? null) : gate;
  return gate.open ? null : gate;
}

/** Where a crusher's slab is this instant. */
/**
 * How much of `draft` is acting on a body of `grams` whose centroid is at `at`: 0 to 1.
 *
 * Exported because three things need the same answer and must not each have their own: the
 * force block below, the HUD line that tells the player the number, and the rig's column art,
 * which brightens while it is carrying something. A draught that looks like it is lifting you
 * and is not would be worse than no art at all.
 */
export function draftLift(draft: Updraft, at: { x: number; y: number }, grams: number): number {
  if (grams > draft.liftMass) return 0;
  // y is DOWN: draft.y is the top of the column, draft.y + h its floor.
  if (at.y < draft.y || at.y > draft.y + draft.h) return 0;
  const inset = Math.min(at.x - draft.x, draft.x + draft.w - at.x);
  if (inset <= 0) return 0;
  const feather = Math.max(1, Math.min(draft.feather ?? 40, draft.w / 2));
  return Math.min(1, inset / feather);
}

/**
 * The column currently carrying this body, and how hard, or null.
 *
 * `lift` is 0 whenever the body is over the ceiling, so a caller that wants "am I standing in
 * a draught that is refusing me" - which is exactly what the HUD wants to say - gets the
 * draught back with a lift of zero rather than nothing at all.
 */
export function draftOn(state: MassState): { draft: Updraft; lift: number } | null {
  const drafts = state.world.updrafts;
  if (!drafts || drafts.length === 0) return null;
  const body = owned(state);
  if (body.length === 0) return null;
  const at = centroid(body);
  for (const draft of drafts) {
    // Position first, mass second: `draftLift` folds both together and returns 0 either way,
    // and the HUD needs to tell "outside the column" from "inside it and too heavy".
    if (at.y < draft.y || at.y > draft.y + draft.h) continue;
    if (at.x <= draft.x || at.x >= draft.x + draft.w) continue;
    return { draft, lift: draftLift(draft, at, body.length) };
  }
  return null;
}

export function crusherRect(c: Crusher): Tile {
  return c.axis === 'x'
    ? { x: c.x + c.at, y: c.y, w: c.w, h: c.h }
    : { x: c.x, y: c.y + c.at, w: c.w, h: c.h };
}

function insideAnySolid(p: Particle, world: World): boolean {
  for (const t of world.tiles) {
    if (p.x > t.x && p.x < t.x + t.w && p.y > t.y && p.y < t.y + t.h) return true;
  }
  for (const gate of world.gates) {
    const solid = gateSolid(gate);
    if (!solid) continue;
    if (p.x > solid.x && p.x < solid.x + solid.w && p.y > solid.y && p.y < solid.y + solid.h) {
      return true;
    }
  }
  return false;
}

function collide(p: Particle, world: World): void {
  p.grounded = false;
  for (const t of world.tiles) hitTile(p, t, world);
  for (const gate of world.gates) {
    const solid = gateSolid(gate);
    if (solid) hitTile(p, solid, world);
  }
  for (const c of world.crushers ?? []) hitTile(p, crusherRect(c), world);
}

export function makeState(world: World, startMass: number): MassState {
  const particles = makeSlime(world.start.x, world.start.y, startMass);
  return {
    world,
    particles,
    owned: new Set(particles.map((p) => p.id)),
    attached: false,
    tendril: 0,
    strain: 0,
    broken: false,
    tip: null,
    reachLimit: 0,
    swingRadius: 0,
    spin: 0,
    justGripped: false,
    swingShape: [],
    startMass,
    lastSafe: { x: world.start.x, y: world.start.y },
    slowmo: 0,
    regroup: 0,
    stunned: 0,
    coasting: 0,
    heldFor: 0,
    turning: false,
    snapped: 0,
    time: 0,
  };
}

export function mass(state: MassState): number {
  let n = 0;
  for (const p of state.particles) if (state.owned.has(p.id)) n += 1;
  return n;
}

export function reachOf(state: MassState): number {
  return mass(state) * TUNING.reachPerMass;
}

export function owned(state: MassState): Particle[] {
  return state.particles.filter((p) => state.owned.has(p.id));
}

export function loose(state: MassState): Particle[] {
  return state.particles.filter((p) => !state.owned.has(p.id));
}

/**
 * Put a body back on its feet at the last safe footing, in its birth arrangement.
 *
 * Shared by the two things that end an attempt: falling out of the world, and touching
 * something alive. They are deliberately the SAME code rather than the same idea - the
 * pit's handback was tuned over several playtests (golden-angle spacing so the mound does
 * not burst, velocities cleared so it does not inherit the fall, regroup cleared so the
 * landing glue does not fire on a body that never flew) and a second copy of it would have
 * drifted away from all of that within a week.
 */
function standUp(state: MassState, group: Particle[]): void {
  const golden = Math.PI * (3 - Math.sqrt(5));
  group.forEach((p, i) => {
    const r = TUNING.rest * 0.62 * Math.sqrt(i);
    const a = i * golden;
    p.x = state.lastSafe.x + Math.cos(a) * r;
    p.y = state.lastSafe.y + Math.sin(a) * r;
    p.px = p.x;
    p.py = p.y;
    state.owned.add(p.id);
  });
  state.regroup = 0;
}

export function step(state: MassState, input: Input): MassState {
  const T = TUNING;
  const { particles, world } = state;
  const dt = T.dt;
  /*
   * A red growth is not something you can aim at.
   *
   * Refused here rather than in the rig, so it is refused for the harness, for a replay and
   * for anything else that ever drives this - the rule is a property of the world, not of
   * the mouse.
   */
  const anchor = input.anchor && input.anchor.live !== false ? input.anchor : null;

  for (const p of particles) {
    p.ax = 0;
    p.ay = T.gravity;
  }

  /*
   * How stale is this key? Freshness is measured from the last frame the input was zero or
   * pointed the other way, so alternating pumps are always fresh and a lazy hold goes stale
   * in under a second. Tracked here, where input first arrives, because the swing gate a
   * few hundred lines down is what spends it.
   */
  if (input.move === 0) {
    state.heldFor = 0;
  } else if (Math.sign(state.heldFor) !== input.move) {
    // A fresh press, or a reversal: the clock restarts, signed by the key that owns it.
    state.heldFor = input.move * dt;
  } else {
    state.heldFor += input.move * dt;
  }

  if (input.move !== 0) {
    for (const p of particles) {
      if (!state.owned.has(p.id)) continue;
      if (p.grounded) {
        p.ax += input.move * T.move;
      } else if (!state.attached) {
        /*
         * A body in flight can lean.
         *
         * It could not, and the comment that used to sit here said why: "airborne slime
         * cannot steer, which is most of why reaching matters at all." That rule made every
         * fling final at the instant of release, which is clean and, in play, unforgiving -
         * a throw that comes down four pixels short of a lip is indistinguishable from one
         * that was never going to make it, and the player has a whole second of falling to
         * watch it happen with nothing to do.
         *
         * So the lean is deliberately small - see TUNING.airMove. It extends a throw that was
         * nearly right; it cannot rescue one that was never close, and it cannot replace the
         * swing, which is where all the real distance still comes from.
         *
         * `state.attached` here is last frame's value, which is what makes this safe: while
         * the rope has hold, the pump owns the input, and this only takes over a frame after
         * the release.
         */
        p.ax += input.move * T.airMove;
      }
    }
  }

  if (anchor) {
    const mine = owned(state);
    const home = centroid(mine);
    const dx = anchor.x - home.x;
    const dy = anchor.y - home.y;
    const span = Math.hypot(dx, dy) || 1;
    const limit = mine.length * T.reachPerMass;
    state.reachLimit = limit;

    if (state.broken) {
      state.tip = null;
    } else {
      const target = Math.min(span, limit);
      state.tendril = Math.min(target, state.tendril + T.extend * dt);
      const tipX = home.x + (dx / span) * state.tendril;
      const tipY = home.y + (dy / span) * state.tendril;
      state.tip = { x: tipX, y: tipY };

      if (span <= limit && state.tendril >= span - T.attachAt) state.attached = true;

      if (state.attached) {
        /*
         * On the rope.
         *
         * It used to CLIMB - every particle was pulled at the growth and gravity cancelled,
         * so latching meant "travel to that point". That made every growth a destination and
         * the level a series of hops, and there was nothing to be good at.
         *
         * Now it hangs. Gravity is left completely alone, which is the entire mechanic: the
         * growth removes one degree of freedom and the pendulum does the rest. A/D pushes
         * along the tangent, so pushing in time with the arc compounds and pushing against it
         * kills the swing, and enough of the former carries the body over the top.
         */
        if (state.swingRadius === 0) {
          state.swingRadius = anchor.rope ?? Math.max(T.minSwing, Math.min(span, limit));
          state.justGripped = true;
          /*
           * Remember the shape, in the rope's frame.
           *
           * Constraining only the centroid is not enough and the failure is spectacular: a
           * particle out at the edge of the body needs its own centripetal force to stay on
           * its own circle, and a correction sized for the centre does not provide it. The
           * body stretched from 106x24 into a 289x387 streamer and left most of itself in the
           * pit - it looked like the slime was being drawn through a letterbox.
           *
           * So the shape is recorded once, here, as offsets along and across the rope. While
           * swinging, every particle is drawn back toward where that shape says it should be.
           * Softly - the pull is partial, so the body still sags and wobbles round the arc
           * rather than turning into a rigid plank on a stick.
           */
          /*
           * Recorded NORMALIZED, not verbatim - each particle keeps its relative station
           * (how far up the body, how far off the midline, both in [-1, 1]) and nothing
           * else. The first version held the literal grab-time offsets and it taught a
           * useful lesson: the rope axis usually skewers the standing mound diagonally, so
           * the recorded shape was already a thin strand along the rope, and tapering a
           * strand changes nothing anyone can see. The hanging form is DESIGNED - a teardrop
           * sized from the mass, built fresh in the apply step - and the grab shape only
           * decides which particle goes where in it. The 35%-per-frame hold doubles as the
           * morph: the body visibly gathers itself into hanging form over a few frames.
           */
          const nx = dx / span;
          const ny = dy / span;
          const raw = mine.map((p) => ({
            id: p.id,
            along: (p.x - home.x) * nx + (p.y - home.y) * ny,
            across: (p.x - home.x) * -ny + (p.y - home.y) * nx,
          }));
          /*
           * Normalised by PERCENTILE bounds with clamping, not by min/max, and the
           * difference is one particle. The grab fires while the tendril is still
           * extended, so the tip is a far outlier on the along-axis; min/max put the
           * whole range at that outlier's mercy, and the tip mapped to the teardrop's
           * extreme slot alone - thirty-plus pixels from the next particle, hanging
           * there through entire revolutions as a permanently detached crumb, measured.
           * The 8th/92nd percentiles ignore outliers, and the clamp folds them into the
           * end slots beside their neighbours. (Pure rank-packing was tried first and
           * broke the 360 outright - forcing uniform density re-proportions the body.)
           *
           * The negation is load-bearing, same as it always was: this block measures on
           * the body-to-anchor axis and the apply step works anchor-to-body, so the shape
           * goes in rotated 180 degrees or it comes out an onion on a string.
           */
          const byAlong = raw.map((r) => r.along).sort((a, b) => a - b);
          const byAcross = raw.map((r) => r.across).sort((a, b) => a - b);
          const pct = (sorted: number[], q: number): number =>
            sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];
          const aLo = pct(byAlong, 0.08);
          const aHi = pct(byAlong, 0.92);
          const cLo = pct(byAcross, 0.08);
          const cHi = pct(byAcross, 0.92);
          const aHalf = Math.max(1, (aHi - aLo) / 2);
          const cHalf = Math.max(1, (cHi - cLo) / 2);
          const clamp = (v: number): number => Math.max(-1, Math.min(1, v));
          state.swingShape = raw.map((r) => ({
            id: r.id,
            along: -clamp((r.along - (aLo + aHalf)) / aHalf),
            across: -clamp((r.across - (cLo + cHalf)) / cHalf),
          }));


        }
        {
          // Perpendicular to the rope, sign chosen so D drives clockwise on a y-down world -
          // which is the direction the body is facing when it runs off a ledge to the right.
          const tx = home.y - anchor.y;
          const ty = -(home.x - anchor.x);
          const tl = Math.hypot(tx, ty) || 1;
          /*
           * The pump only works WITH the swing, and that one rule is the entire skill.
           *
           * It used to be a constant tangential force, and the constant was 1600 against
           * gravity's 1500 - which means holding one key out-torqued gravity at every point
           * of the circle, and a player who latched on and leaned on D went over the top
           * from a dead hang without a single alternation. The 360 was a button.
           *
           * Now the force is gated by the body's own tangential speed. Moving, a push in
           * the direction of travel is full strength and a push against it brakes at full
           * strength - both are the player doing something real. Near-still, the push is a
           * QUARTER strength: enough to lean the hang and seed the first swing, far too
           * weak to fight gravity round the circle. Building amplitude therefore takes
           * what a real swing takes - push right while moving right, push left while
           * moving left, timed to the arc - and the 360 becomes something you EARN: pump
           * to a full-height swing first, then commit to one direction and carry it over.
           * Once the body is circling, the held key stays aligned with the motion the
           * whole way round, so the revolution sustains itself - the trick is no longer
           * free, it is the reward.
           */
          let vtx = 0;
          let vty = 0;
          for (const p of mine) {
            vtx += p.x - p.px;
            vty += p.y - p.py;
          }
          // Signed along the tangent, because the idle bleed below needs to know which way
          // the body is going in order to push against it.
          const tangential =
            ((vtx / mine.length) * (tx / tl) + (vty / mine.length) * (ty / tl)) / dt;
          const tangentialSpeed = Math.abs(tangential);

          /*
           * Nobody driving: the swing winds down.
           *
           * Applied whether or not a key is held is wrong - that would fight the pump. This
           * runs only when the player is holding nothing, which is what "I let go and it kept
           * going round" is asking for. It is a force against the direction of travel scaled
           * by the speed itself, so it is gentle on a slow swing and firm on a fast one.
           */
          state.coasting = input.move === 0 ? state.coasting + dt : 0;
          const idle = Math.min(1, Math.max(0, state.coasting - T.swingGrace) / T.swingGrace);
          if (idle > 0) {
            for (const p of mine) {
              p.ax -= (tx / tl) * tangential * T.swingIdle * idle;
              p.ay -= (ty / tl) * tangential * T.swingIdle * idle;
            }
          }
          /*
           * THREE regimes, and the top one is what makes a 360 repeatable.
           *
           * Below 60 the push is a quarter strength: enough to lean a hang and seed a
           * first swing, far too weak to walk the body round the circle, which is what
           * keeps the 360 earned rather than free.
           *
           * Between 60 and 300 it is full strength - ordinary pumping.
           *
           * Above 300 it is 1.8x, and that is a fix rather than a flourish. The swing was
           * equilibrating right at the energy needed to carry over the top, so whether a
           * revolution completed was close to a coin toss: measured across eight latches
           * that differ only in when they happen, peak spin was steady at 6.4-7.8 rad/s
           * but the spin still turning six seconds later was 0.5, 0.8, 1.5, 1.5, 4.1,
           * 4.8, 5.3, 6.4. That is the playtest's "sometimes the 360 is fast and
           * sometimes too slow" exactly - the swing built every time and then fell out of
           * its circle about half the time, so what you had at the moment you released
           * was luck. Giving a committed swing real authority puts it clear of the top
           * instead of level with it: same eight latches, all eight still turning above
           * 6.4 rad/s at six seconds.
           */
          /*
           * FOUR regimes now, and the new one is the ceiling - see TUNING.swingEnergy for why
           * a multiplier with no upper bound made the 360's speed a function of how long the
           * key was held rather than of anything the player did.
           *
           * Height is measured from the BOTTOM of the circle, so the energy is the same
           * number wherever the body happens to be on the arc - which is the entire reason
           * this is energy and not speed.
           *
           * The ceiling only stops the pump ADDING. It does not brake, so a player who has
           * already earned a fast swing keeps it; they simply cannot keep buying more.
           */
          const rope = state.swingRadius || 1;
          const height = anchor.y + rope - home.y;
          const energy = 0.5 * tangentialSpeed * tangentialSpeed + T.gravity * height;
          /*
           * A push AGAINST the motion brakes SOFTLY - and this is the counter-clockwise fix.
           *
           * With symmetric braking, holding one key nets zero energy per cycle: everything
           * the with-motion half adds, the against-motion half removes, and the swing
           * equilibrates below a circle. Except that it did not always - measured in stage
           * one, a held D off an eastward latch locked into a full circle through a
           * parametric resonance so fragile it depended on the floor being 10px under the
           * swing (sink the floor 200px and it dies), while a held A oscillated at 1.2 rad/s
           * for ever. Players learned "hold D" because it happened to work, and the same
           * habit failed the other way round. That is the asymmetry that was reported, twice.
           *
           * Braking at a third means a held key nets energy toward the direction it wants on
           * every cycle, in both directions, in any room - the swing builds because of the
           * player's intent rather than because of a resonance lottery. The skill moves into
           * TIME: pumping in rhythm still gets there in a third as long, and the dead-hang
           * guard in the harness is now a clock rather than a wall.
           */
          /*
           * The pump, as the player specified it: "swing left and right by pressing A and D,
           * higher and higher, until I can make a turn - then hold A or D to keep turning."
           *
           * Four regimes, in the order they are asked:
           *
           *  - Above the ENERGY CEILING the pump buys nothing more (see swingEnergy).
           *  - Above CIRCULATING energy the swing can carry over the top, and a held key in
           *    the direction of motion sustains the revolution at commit strength - this is
           *    "keep turning". Held against it, it brakes the circle back down, which is
           *    how you stop or set up the other way.
           *  - Near-still, a quarter: enough to lean a hang, never enough to walk it round.
           *  - In between - BUILDING - a fresh press pushes at full strength and a stale
           *    hold is as weak as a lean (see pumpFresh). Building therefore takes rhythm:
           *    alternating in time with the arc is always fresh, and a lazy held key stops
           *    paying in under a second. Holding one key was measured to buy a full 360
           *    through a resonance lottery that paid clockwise in stage one and nowhere
           *    else; this regime is what closes it.
           */
          const opposing = tangential * input.move < 0;
          state.turning =
            energy > (state.turning ? T.circulateExit : T.circulateEnergy) * T.gravity * rope;
          const circulating = state.turning;
          const fresh = Math.abs(state.heldFor) < T.pumpFresh;
          const gate =
            energy > T.swingEnergy * T.gravity * rope
              ? 0
              : circulating
                ? (opposing ? T.swingBrake : T.swingCommit)
                : tangentialSpeed < 60
                  ? 0.25
                  : (tangentialSpeed > T.swingBuildAt ? T.swingCommit : 1) *
                    (fresh ? 1 : T.pumpStale) *
                    (opposing ? T.swingBrake : 1);
          if (input.move !== 0) {
            for (const p of mine) {
              p.ax += (tx / tl) * input.move * T.swingPump * gate;
              p.ay += (ty / tl) * input.move * T.swingPump * gate;
            }
          }
        }
      } else {
        const cost = Math.min(mine.length - 2, Math.round(state.tendril / T.rest));
        mine.sort(
          (a, b) => Math.hypot(a.x - tipX, a.y - tipY) - Math.hypot(b.x - tipX, b.y - tipY)
        );
        /*
         * An arm reaching for something it cannot have does not carry the body.
         *
         * The reach force drags `cost` particles out along the tendril with their weight
         * cancelled exactly, and for a grab you CAN make that is right - the arm shoots out
         * and the latch is crisp. Applied to a grab you cannot make, it was the playtest's
         * "the mass floats an unreasonable distance to the growth and connects": clicking a
         * growth far out of range while falling hung half the creature weightless in
         * mid-air, stretched toward it, drifting after it until the fall finally brought the
         * rest of the body into range and it connected. Measured, the body fell 204px in
         * eight tenths of a second where free fall is 480.
         *
         * Letting that arm have weight instead was tried and is worse: the particles are
         * pulled to different stations along a 212px line, so with gravity on them the line
         * sags and comes apart - the same probe measured the body in EIGHT pieces, which is
         * the other half of what was reported.
         *
         * So an out-of-range reach is a reach and nothing else. The tendril still extends,
         * the player still sees the arm go out and fail, and the body falls exactly as it
         * would have. The growth stays where it is because it was always out of reach.
         */
        if (span <= limit) {
          for (let i = 0; i < cost; i++) {
            const p = mine[i];
            const along = state.tendril * (1 - i / Math.max(1, cost));
            const gx = home.x + (dx / span) * along - p.x;
            const gy = home.y + (dy / span) * along - p.y;
            const d = Math.hypot(gx, gy) || 1;
            p.ax += (gx / d) * T.reach;
            p.ay += (gy / d) * T.reach - T.gravity;
          }
        }

        if (span > limit && state.tendril >= limit - 0.5) {
          state.strain += dt;
          if (state.strain > T.snapAfter) {
            /*
             * The arm lets go - and takes NOTHING with it.
             *
             * It used to disown every particle in the reach, which is where the playtest's
             * "sometimes the mass splits into two" came from: over-reaching for a growth
             * tore an arm off, and nobody reads a failed grab as a decision to shed. Only a
             * press and the player's own Space may divide this creature. A snap is now
             * purely a failure to connect: the tendril retracts, the reach is spent until
             * the button is released, and the body is whole.
             */
            state.snapped += 1;
            state.tendril = 0;
            state.strain = 0;
            state.broken = true;
          }
        } else {
          state.strain = 0;
        }
      }
    }
  } else {
    // Letting go is what re-arms it.
    state.attached = false;
    state.tendril = 0;
    state.strain = 0;
    state.broken = false;
    state.tip = null;
    // Letting go keeps the velocity the swing built and drops the constraint. That IS the
    // fling - there is no launch impulse anywhere, and adding one made it feel like a cannon
    // rather than like letting go of something.
    if (state.swingShape.length > 0) {
      state.regroup = 1;
      /*
       * The spin is bled into the throw at the instant of release.
       *
       * A body released off a fast revolution is rotating rigidly - every particle carries
       * centroid velocity PLUS omega-cross-r, and at the spins the earned 360 reaches, that
       * relative term is hundreds of pixels a second of internal shear. Left in, the body
       * keeps spinning in flight and centrifugal force does exactly what it does: the fling
       * arrived as five to eight pieces, measured. No amount of glue fixes a velocity
       * problem after the distances have opened (the regroup comment already knew this
       * about landings).
       *
       * So the rotation dies AT release: every owned particle keeps the centroid's velocity
       * and a quarter of its own relative motion - enough wobble to still read as goo mid-
       * air, nowhere near enough shear to tear. Physically this is the honest reading: a
       * creature without a skeleton has nothing to store angular momentum IN, and what it
       * absorbs, it keeps as squish. The centroid velocity - the throw the player earned -
       * is untouched.
       */
      const flung = owned(state);
      let cvx = 0;
      let cvy = 0;
      for (const p of flung) {
        cvx += p.x - p.px;
        cvy += p.y - p.py;
      }
      cvx /= Math.max(1, flung.length);
      cvy /= Math.max(1, flung.length);
      for (const p of flung) {
        const rvx = p.x - p.px - cvx;
        const rvy = p.y - p.py - cvy;
        p.px = p.x - cvx - rvx * 0.25;
        p.py = p.y - cvy - rvy * 0.25;
      }
    }
    /*
     * A fast release buys aiming time. See MassState.slowmo.
     *
     * Gated on spin rather than on speed, because spin is what the player built. A body that
     * happens to be moving quickly because it fell does not get the courtesy.
     */
    if (state.swingShape.length > 0 && Math.abs(state.spin) >= T.slowmoAt) state.slowmo = 1;
    state.swingRadius = 0;
    state.spin = 0;
    state.justGripped = false;
    state.turning = false;
    state.swingShape = [];
  }

  /*
   * Shed mass is INERT until the player calls it.
   *
   * What you leave behind stays exactly where you left it: no gravity, no drift, no
   * rejoining if you happen to brush past it. It is a deposit, not a puddle. That is what
   * makes splitting a decision with a location - "I am leaving thirty units HERE" - rather
   * than a thing you do and then herd around.
   *
   * Q is what wakes it. While Q is held the loose mass is live: it falls, it is pulled
   * toward the body, and it merges on contact. Let go and whatever has not reached you goes
   * back to sleep where it is.
   *
   * The one exception is the world's floor, which returns anything that falls out of the
   * level regardless - see the pit handback below. A player cannot be expected to walk into
   * a bottomless pit to press Q.
   */
  /*
   * Which shed particles Q has actually woken this step.
   *
   * This has to be a SET of ids, not the `input.recall` flag, and that distinction is the
   * whole of a bug the playtest found: "pressing Q to recall calls the nearest shedded
   * mass but forces some others to fly away". Two later blocks asked `input.recall` to
   * decide whether a loose particle is awake - the inert-deposit branch in the integrator
   * and the immovable-deposit rule in overlap resolution - so holding Q woke EVERY pile in
   * the level at once. A settled deposit rests with its particles slightly overlapped;
   * wake it and overlap resolution springs it apart, which is precisely the mass flying
   * away from piles the player never called.
   *
   * Only the cluster being recalled goes in here, so everything else stays asleep.
   */
  const waking = new Set<number>();

  if (input.recall) {
    /*
     * Q calls home the NEAREST shed lump, and only that one. Recalling everything at once
     * dragged every loose cluster toward the body simultaneously, and lumps on the way
     * met each other and welded into one - the playtest read it as "Q joins two shed
     * masses together", which hands back a merge the player never asked for and empties
     * the strategic value of having left mass in two places. One lump at a time is also
     * simply legible: press Q, watch the closest piece come home, press again.
     */
    const home = centroid(owned(state));
    const clusters = components(loose(state));
    let nearest: Particle[] | null = null;
    let best = Infinity;
    for (const cluster of clusters) {
      const c = centroid(cluster);
      const d = Math.hypot(c.x - home.x, c.y - home.y);
      if (d < best) {
        best = d;
        nearest = cluster;
      }
    }
    if (nearest) {
      for (const p of nearest) waking.add(p.id);
      for (const p of nearest) {
        const dx = home.x - p.x;
        const dy = home.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        p.ax += (dx / d) * T.recall;
        p.ay += (dy / d) * T.recall - T.gravity * 0.9;
      }
    }
  }

  // Cohesion, as a force with a ceiling - see maxPull.
  {
    const cell = T.linkRange;
    const grid = buildGrid(particles, cell);
    const near: Particle[] = [];
    // See regroupViscosity. Zero except in the moments around a landing.
    const mix = T.regroupViscosity * state.regroup;
    for (const p of particles) {
      for (const q of neighbours(grid, p, cell, near)) {
        if (q.id < p.id) continue;
        /*
         * Glue never crosses ownership.
         *
         * Cohesion used to bind any two particles that stood close enough, and the moment a
         * split happened that rule turned against the player: the shed half is standing
         * exactly where the cut left it - against you - so the same forces that make your
         * body one thing welded you to the part you had just given up. The blob would not
         * come apart, and driving against the weld read as "movement is blocked".
         *
         * Your body coheres with your body. A shed lump coheres with itself. Between the
         * two there is only the overlap push below - solid, so you can lean on your own
         * castoff and shove it around, but never sticky. Q is the one deliberate way mass
         * rejoins, which is what makes reconnecting a verb instead of an accident.
         */
        if (state.owned.has(p.id) !== state.owned.has(q.id)) continue;
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d > cell) continue;
        if (mix > 0) {
          // Drag neighbours toward a shared velocity, editing the verlet history directly -
          // px is "where I was", so moving it moves velocity without moving the particle.
          const dvx = q.x - q.px - (p.x - p.px);
          const dvy = q.y - q.py - (p.y - p.py);
          p.px -= dvx * mix;
          p.py -= dvy * mix;
          q.px += dvx * mix;
          q.py += dvy * mix;
        }
        if (d <= T.slack) continue;
        // regroup > 0 is the moments after a fling - see MassState.regroup.
        const glue = 1 + T.regroupBoost * state.regroup;
        const force = Math.min((d - T.slack) * T.pull * glue, T.maxPull * glue);
        p.ax += (dx / d) * force;
        p.ay += (dy / d) * force;
        q.ax -= (dx / d) * force;
        q.ay -= (dy / d) * force;
      }
    }
  }

  /*
   * Surface tension, per component, so a stranded lump rounds itself up too.
   *
   * While the player is REACHING - tendril out, not yet attached - the ARM is exempt.
   * Tension at these strengths pulls an outlying particle home at up to 14000, and the reach
   * force stretching the tendril along its line is 3600: with both on, the arm loses to its
   * own skin and can never extend. An arm you are deliberately stretching out is the one part
   * of a slime that is not trying to be a sphere.
   *
   * THE ARM, though - not the creature. The first version of this exemption skipped every
   * owned particle, which is what the sentence above always meant and not what it said, and
   * the playtest found the difference: with the skin off the WHOLE body during a reach, the
   * mound had nothing holding it together while the tendril hauled on it, so latching tore
   * the slime into two or three pieces. They all stayed owned, so they all answered A and D,
   * and the player landed on the far side driving a small herd of themselves.
   *
   * So the exemption is geometric now: only particles that have travelled out along the
   * reach line past `armFrom` are exempt. Everything still piled at home keeps full skin.
   */
  const reaching = anchor !== null && !state.attached && !state.broken;
  let armX = 0;
  let armY = 0;
  let armFrom = 0;
  if (reaching && anchor) {
    const mine = owned(state);
    if (mine.length > 0) {
      const home = centroid(mine);
      const dx = anchor.x - home.x;
      const dy = anchor.y - home.y;
      const d = Math.hypot(dx, dy) || 1;
      armX = dx / d;
      armY = dy / d;
      /*
       * Where the arm starts: a body-radius out from the centroid, along the reach. Inside
       * that is the mound and keeps its skin; beyond it is the tendril the player is
       * deliberately stretching, and it is left alone.
       */
      armFrom = Math.sqrt(mine.length) * T.rest * T.roundness;
    }
  }
  /*
   * Grouped within ownership, for the same reason cohesion is: components() sees only
   * proximity, so a shed lump still touching the player counted as one component, and one
   * component gets ONE surface tension - a shared skin pulling both bodies toward a shared
   * centre. That is the other half of how a fresh split held the player in place.
   */
  const flocks = [...components(owned(state)), ...components(loose(state))];
  /*
   * Crawling relaxes the skin - see crawlRelax. Reaching turns it off entirely. Swinging is
   * exempt: A/D means "pump" there, not "crawl", and a relaxed body mid-swing arrived at the
   * landing loose enough to break on it - the swing has its own shape-keeper and wants the
   * skin at full strength underneath it.
   */
  const drivenRelax =
    input.move !== 0 && !state.attached
      ? T.crawlRelax
      : state.attached
        ? // Hanging: the swing's shape hold is the authority on form, and full-strength
          // tension just fights it - the teardrop measured barely-there until tension got
          // out of the way. Regroup takes over the moment the player lets go.
          T.crawlRelax
        : 1;
  for (const group of flocks) {
    if (group.length < 3) continue;
    const home = centroid(group);
    const natural = Math.sqrt(group.length) * T.rest * T.roundness;
    for (const p of group) {
      const mineP = state.owned.has(p.id);
      if (reaching && mineP) {
        // Only the reaching arm is exempt - see above. `home` is this component's centre,
        // so the projection is measured from the body the particle actually belongs to.
        const along = (p.x - home.x) * armX + (p.y - home.y) * armY;
        if (along > armFrom) continue;
      }
      const relax = mineP ? drivenRelax : 1;
      const dx = home.x - p.x;
      const dy = home.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d <= natural || d === 0) continue;
      const glue = 1 + T.regroupBoost * state.regroup;
      const force = Math.min((d - natural) * T.tension * glue * relax, T.maxTension * glue * relax);
      p.ax += (dx / d) * force;
      p.ay += (dy / d) * force;
    }
  }

  /*
   * Owned pieces come home.
   *
   * Shedding with Space makes particles LOOSE; anything still owned is meant to be one
   * creature. Accidents happen anyway - a crusher, a tight gap, a bad landing, a recall
   * that arrives off-centre - and without this a torn-off owned lump rounds itself into
   * its own little slime and crawls alongside the player for ever, because components()
   * gives each cluster its own skin and nothing pulls two clusters together.
   *
   * ## Where this sits, and why that is the whole point
   *
   * This block spent its first outing BELOW the integrator, which meant it did nothing at
   * all: accelerations are zeroed at the top of every step and spent by the integration
   * loop a few dozen lines down, so a force added after that loop was wiped by the next
   * step's reset before it was ever integrated. The playtest reported exactly what a
   * dead force looks like - "the mass was still split in two, but green, like the two
   * separate parts were playable" - two owned components, both steering, neither ever
   * closing the gap.
   *
   * Anything that pushes a particle has to be written between the reset and the
   * integrator. Below the integrator is a position correction (see the rope), not a
   * force, and the two are not interchangeable.
   */
  if (!state.attached && !reaching) {
    const parts = components(owned(state));
    if (parts.length > 1) {
      let main = parts[0];
      for (const part of parts) if (part.length > main.length) main = part;
      const target = centroid(main);
      for (const part of parts) {
        if (part === main) continue;
        for (const q of part) {
          const dx = target.x - q.x;
          const dy = target.y - q.y;
          const d = Math.hypot(dx, dy) || 1;
          q.ax += (dx / d) * T.rejoin;
          /*
           * Most of gravity is cancelled on the way home, the same way recall does it.
           * A lump left on a ledge below the body would otherwise be pulled sideways
           * into the wall under it and sit there grinding, which reads as the rejoin
           * being broken rather than as the lump being stuck.
           */
          q.ay += (dy / d) * T.rejoin - T.gravity * 0.75;
        }
      }
    }
  }

  /*
   * The column lifts.
   *
   * ## Above the integrator, like everything else that pushes
   *
   * See the rejoin block directly above for the full account of why - accelerations are zeroed
   * at the top of the step and spent by the loop below, so a force written after that loop is
   * wiped before it is ever integrated. This is the second force in this file to be written in
   * this exact seam and it is worth the sentence.
   *
   * ## Not while you are on a rope
   *
   * `state.attached` is a hard exclusion, and it is physics rather than policy. The rope is
   * satisfied AFTER integration by shifting the body onto the circle and deleting radial
   * velocity, so the radial part of an updraft is thrown away in the same frame it is applied
   * and only the tangential part survives - which is a pump that costs the player nothing.
   * TUNING.swingPump exists because a free-energy pump was measured to be the wrong game
   * (see swingEnergy); a second one arriving through the weather would be the same mistake
   * with better weather. The design reading is the same and simpler: the air is what you use
   * when there is nothing to hold on to.
   *
   * ## Loose mass is untouched
   *
   * Not by a test here - by the inert-deposit branch below, which never reads ax or ay. Mass
   * shed into a column falls straight down through it and settles, which is the answer the
   * level wants: what you leave behind stays where you left it, weather or no weather.
   *
   * Terminal velocity comes from the existing damping rather than a clamp. At dt 1/120 and
   * damping 0.986 a net upward accel of `a` settles at about 0.6 * a px/s, so a column of
   * 2000 against gravity 1500 carries a body at roughly 300px/s - a ride, not a launch.
   */
  if (world.updrafts && world.updrafts.length > 0 && !state.attached) {
    const body = owned(state);
    if (body.length > 0) {
      const at = centroid(body);
      for (const draft of world.updrafts) {
        const lift = draftLift(draft, at, body.length);
        if (lift <= 0) continue;
        // Up is negative y. Applied to every owned particle equally - see the interface.
        for (const p of body) p.ay -= draft.force * lift;
      }
    }
  }

  for (const p of particles) {
    /*
     * Shed mass falls, and does nothing else.
     *
     * "Cannot move" has to mean cannot WANDER, not cannot fall - a deposit hanging in the
     * air where it was cut off looks broken, and mass shed over a pit has to be able to go
     * into the pit so the floor can hand it back. So gravity and collision apply and the
     * horizontal component is zeroed every step: it drops straight down, settles on whatever
     * is under it, and stays on that spot until Q wakes it.
     */
    if (!state.owned.has(p.id) && !waking.has(p.id)) {
      const fall = (p.y - p.py) * T.damping;
      p.px = p.x;
      p.py = p.y;
      p.y += fall + T.gravity * dt * dt;
      continue;
    }
    /*
     * A freshly flung body flies through AIR, not through the soup the swing hangs in.
     *
     * The global damping (0.986 per step, ~82% of velocity gone per second) exists so an
     * unpumped pendulum dies inside two seconds - the right feel on the rope, and a wall
     * in flight: the earned swing releases near 500px/s where the old free-energy pump
     * gave 800, and under swing-drag that throw died 11px short of the exit shelf every
     * try, forever. While the regroup flag is fresh - the second or so after a release -
     * drag eases toward air and the throw carries. It decays with the flag, so by the
     * time the body is crawling again the pendulum-killing soup is back.
     */
    const drag = T.damping + (T.flightDamping - T.damping) * Math.min(1, state.regroup * 1.4);
    const vx = (p.x - p.px) * drag;
    const vy = (p.y - p.py) * drag;
    p.px = p.x;
    p.py = p.y;
    p.x += vx + p.ax * dt * dt;
    p.y += vy + p.ay * dt * dt;
  }

  // Overlap only - hard, because two particles cannot be in one place.
  {
    const cell = T.linkRange;
    const near: Particle[] = [];
    for (let pass = 0; pass < T.iterations; pass++) {
      const grid = buildGrid(particles, cell);
      for (const p of particles) {
        for (const q of neighbours(grid, p, cell, near)) {
          if (q.id < p.id) continue;
          const dx = q.x - p.x;
          const dy = q.y - p.y;
          const d = Math.hypot(dx, dy);
          if (d === 0 || d >= T.rest) continue;
          const move = -(T.rest - d) * T.push;
          const half = Math.max(-T.maxCorrection, Math.min(T.maxCorrection, move)) * 0.5;
          /*
           * A sleeping deposit is immovable, so the live body takes the whole correction
           * rather than half of it. Without this the player could bulldoze a pile of shed
           * mass across the floor just by walking into it, which is exactly the "it follows
           * me around" behaviour the sleep rule exists to remove.
           */
          // A settled deposit resists being shoved: the live body takes the whole correction
          // rather than half, so the player cannot bulldoze a pile around by walking into it.
          const pAwake = state.owned.has(p.id) || waking.has(p.id);
          const qAwake = state.owned.has(q.id) || waking.has(q.id);
          if (pAwake && qAwake) {
            p.x += (dx / d) * half;
            p.y += (dy / d) * half;
            q.x -= (dx / d) * half;
            q.y -= (dy / d) * half;
          } else if (pAwake) {
            p.x += (dx / d) * half * 2;
            p.y += (dy / d) * half * 2;
          } else if (qAwake) {
            q.x -= (dx / d) * half * 2;
            q.y -= (dy / d) * half * 2;
          }
        }
      }
    }
  }

  /*
   * The rope, applied as a position correction rather than a force.
   *
   * A spring here reads as elastic no matter how stiff it is - the body sags on the way down
   * and boings at the bottom of every arc - and stiff enough to hide that is stiff enough to
   * explode a verlet integrator. So the constraint is satisfied exactly, once, after
   * integration: shift the whole body so its centroid sits at swingRadius, then delete the
   * radial component of its velocity so the next frame does not fight it.
   *
   * Shifting x and px by the same amount preserves velocity, which is what makes this a
   * translation of the body rather than a kick to it.
   */
  if (anchor && state.attached && state.swingRadius > 0) {
    const mine = owned(state);
    if (mine.length > 0) {
      const home = centroid(mine);
      const dx = home.x - anchor.x;
      const dy = home.y - anchor.y;
      const d = Math.hypot(dx, dy) || 1;
      const nx = dx / d;
      const ny = dy / d;

      const shift = state.swingRadius - d;
      for (const p of mine) {
        p.x += nx * shift;
        p.y += ny * shift;
        p.px += nx * shift;
        p.py += ny * shift;
      }

      let vx = 0;
      let vy = 0;
      for (const p of mine) {
        vx += p.x - p.px;
        vy += p.y - p.py;
      }
      vx /= mine.length;
      vy /= mine.length;
      /*
       * Only the OUTWARD radial component is deleted. Deleting all of it - the first
       * version - was a hidden damper that scaled with speed: every frame of a fast swing
       * has some radial velocity to cancel, so the faster the pendulum the harder it was
       * braked, and no pump strength could push the swing past ~400px/s. The plateau looked
       * exactly like weak pumping and was not. A rope resists stretching and nothing else;
       * treated that way, the swing finally conserves what the pump puts in.
       */
      const radial = vx * nx + vy * ny;
      if (radial > 0) {
        for (const p of mine) {
          p.px += nx * radial;
          p.py += ny * radial;
        }
      }
      // The grab absorbs most of the lunge that got here - see gripAbsorb. One frame only.
      if (state.justGripped) {
        state.justGripped = false;
        const keep = T.gripAbsorb;
        const tvx = vx - nx * radial;
        const tvy = vy - ny * radial;
        for (const p of mine) {
          p.px += tvx * (1 - keep);
          p.py += tvy * (1 - keep);
        }
      }

      /*
       * Hold the shape. See swingShape.
       *
       * The rope direction here points from the anchor OUT to the body, so "along" is away
       * from the growth and "across" is the direction of travel. Positions and previous
       * positions move together, which makes this a nudge of where the body is rather than a
       * kick to how fast it is going - the arc stays the pendulum's, not this correction's.
       */
      if (state.swingShape.length > 0) {
        const centre = centroid(mine);
        const by = new Map(mine.map((p) => [p.id, p]));
        /*
         * The teardrop, sized from the mass. Slot coordinates are normalized (see the
         * recording above): `along` in [-1, 1] runs top-of-body to bottom, `across` runs
         * midline to edge. Length and width come from the idle diameter, so a big slime
         * hangs as a big drop and a small one as a droplet, and the taper narrows the top
         * toward the arm that the render extends up to the growth.
         */
        const size = Math.sqrt(state.swingShape.length) * T.rest;
        // Plumper than it was (0.62/0.4): the hanging body read as a strand on the
        // rope, and a slime's weight should pool. Shorter, wider, rounder.
        const halfLength = size * 0.54;
        const halfWidth = size * 0.48;
        // Stiffer as the spin climbs - see swingHoldPerSpin. Capped short of plank.
        const hold = Math.min(0.95, T.swingHold + Math.abs(state.spin) * T.swingHoldPerSpin);

        /*
         * Above two radians a second, internal slosh bleeds 6% a frame - relative to the
         * body's mean velocity, so the pendulum itself loses nothing. Gated on spin
         * because an ungated version of this damping was tried and it broke the pump:
         * building a swing IS putting asymmetric velocity into the body, and damping that
         * at low spin ate the energy as fast as the player added it. Past two rad/s the
         * pumping is done and the crumbs start - a particle knocked loose at speed goes
         * ballistic for several frames and renders as a separate blob, measured at 47
         * frames per committed circle before this.
         */
        if (Math.abs(state.spin) > 2) {
          let mvx = 0;
          let mvy = 0;
          for (const p of mine) {
            mvx += p.x - p.px;
            mvy += p.y - p.py;
          }
          mvx /= Math.max(1, mine.length);
          mvy /= Math.max(1, mine.length);
          for (const p of mine) {
            p.px += (p.x - p.px - mvx) * 0.06;
            p.py += (p.y - p.py - mvy) * 0.06;
          }
        }

        /*
         * Two passes, and the second is a conservation law.
         *
         * The slot offsets do not sum to zero - the percentile normalisation that maps the
         * grab-time shape onto the teardrop is deliberately asymmetric - so the raw
         * corrections carry a net translation. An INTERNAL constraint that translates the
         * whole body is an external force by another name, and at the spin-stiffened hold
         * strengths it was a strong one: measured on a rope of 80, the pump's verlet
         * tangential speed read 500-800px/s while the centroid actually orbited at 0.2-0.6
         * revolutions a second, because the hold clawed back most of every frame's
         * displacement while leaving the velocity that produced it intact. The pump poured
         * energy into a speedometer; the body crawled.
         *
         * Subtracting the mean correction from every particle makes the hold reshape the
         * body ABOUT its centroid and nothing else. The centroid's dynamics - the pendulum
         * the player is actually driving - are returned to the pump and to gravity.
         */
        let sumX = 0;
        let sumY = 0;
        let held = 0;
        const moves: Array<{ p: Particle; mx: number; my: number }> = [];
        for (const slot of state.swingShape) {
          const p = by.get(slot.id);
          if (!p) continue;
          const depth = (slot.along + 1) / 2;
          const width = T.taperTop + (T.taperBottom - T.taperTop) * depth;
          const along = slot.along * halfLength;
          const across = slot.across * halfWidth * width;
          const tx2 = centre.x + nx * along + -ny * across;
          const ty2 = centre.y + ny * along + nx * across;
          const mx = (tx2 - p.x) * hold;
          const my = (ty2 - p.y) * hold;
          moves.push({ p, mx, my });
          sumX += mx;
          sumY += my;
          held += 1;
        }
        const meanX = held > 0 ? sumX / held : 0;
        const meanY = held > 0 ? sumY / held : 0;
        for (const { p, mx, my } of moves) {
          p.x += mx - meanX;
          p.y += my - meanY;
          p.px += mx - meanX;
          p.py += my - meanY;
        }
      }
      // Tangential speed over the radius. Reported rather than used - the HUD needs a number
      // for "have I got enough to go round" and this is that number.
      state.spin = (vx * -ny + vy * nx) / dt / state.swingRadius;
    }
  }

  /*
   * The sieve rects: for every shut gate with a sieve the owned body is too big for, the
   * gap below the gate becomes solid for owned particles this step. Computed once per step
   * - the owned count does not change during the collision loop.
   */
  const sieves: Tile[] = [];
  for (const gate of world.gates) {
    if (gate.open || gate.sieve === undefined) continue;
    if (state.owned.size <= gate.sieve) continue;
    sieves.push({ x: gate.x, y: gate.y + gate.h, w: gate.w, h: world.height - (gate.y + gate.h) });
  }
  for (const p of particles) {
    collide(p, world);
    if (sieves.length > 0 && state.owned.has(p.id)) {
      /*
       * The filter is a HARD CLAMP, not a collision.
       *
       * It used to resolve through hitTile like any other solid, which resolves once per
       * step against the nearest face - and a body walking at it fast enough simply got
       * through: raising the crawl from 4300 to 4800 was all it took for a full-mass body
       * to ooze under a shut wall, because a particle that crosses the whole rect inside
       * one step never meets the face that was supposed to stop it. A filter the player
       * can defeat by holding a direction harder is not a filter, and it is the rule two
       * stages are built on.
       *
       * So an over-mass particle found inside the gap is put back on the side it came
       * FROM - which `px` still knows, whatever the speed - and its velocity is dropped
       * with it. There is no speed at which that can be outrun.
       */
      for (const rect of sieves) {
        if (p.x <= rect.x || p.x >= rect.x + rect.w) continue;
        if (p.y <= rect.y || p.y >= rect.y + rect.h) continue;
        const back = p.px <= rect.x + rect.w / 2 ? rect.x - 1 : rect.x + rect.w + 1;
        p.x = back;
        p.px = back;
      }
    }
  }

  /*
   * The bottom of the world, where the mass finds its way home.
   *
   * There has to be a plane down here: a pit has no floor, and a particle that falls in
   * would otherwise fall for ever while still being averaged into every centroid - the
   * slime once measured as 800px underground while sitting perfectly on a platform. The
   * first version of this plane was fatal, and that was wrong for this game: mass is the
   * whole economy, nothing in a stage can be eaten to replace it, and a player who loses a
   * quarter of themselves to one bad swing is not learning, they are shrinking.
   *
   * So the specimen does what specimens in containment reports do: it comes back. Anything
   * that falls out of the world - a drip off a swing, a shed lump nudged over an edge -
   * rejoins the main body where it stands, spaced by id so the returns do not stack on one
   * point. And if there is no main body, because the whole slime went in, the slime is
   * simply BACK at the start of the room, whole. A missed swing costs the attempt, never
   * the creature.
   */
  const floor = world.height + 160;
  const fallen: Particle[] = [];
  for (const p of particles) {
    if (p.y > floor) fallen.push(p);
  }
  if (fallen.length > 0) {
    const fell = new Set(fallen.map((p) => p.id));
    /*
     * "Alive" means standing somewhere IN the level, not merely above the kill plane. The
     * distinction closed a treadmill: a whole body dropping down a pit shaft crosses the
     * plane a few particles at a time, and returning those to the centroid of the not-yet-
     * fallen put them back into the same falling mass a few pixels up - the slime hovered
     * under the world for ever, recycling itself. A body below world.height is in a shaft
     * and doomed; nothing returns to it, and once its last particle crosses the plane the
     * wholesale respawn below stands the creature back up at the start.
     */
    /*
     * A host has to be standing on something the level actually offers.
     *
     * `p.y < world.height` was the old test and it is far too generous: world.height is 720
     * and the deepest floor SURFACE is 620, so every point in that hundred-pixel band counts
     * as alive while being inside the geometry or inside a pit. Two failures came out of it,
     * and the second is the worse one.
     *
     * The treadmill: a body falling down a shaft always has a few particles still in the
     * band, so the ones that cross the plane return to them, a few pixels up, for ever.
     *
     * The teleport: if two particles are squeezed up the side of the exit shelf and land ON
     * it, they are hosts - and every other particle in the body returns to them. The slime
     * fell into the pit with the drawbridge standing and reassembled itself at the portal.
     * A rule meant to hand back a drip handed back the whole creature, to the exit.
     *
     * So the line is the deepest surface anything can stand on, plus one particle spacing.
     * Below that you are in a shaft, and nothing returns to a body in a shaft.
     */
    let standLine = 0;
    for (const t of world.tiles) standLine = Math.max(standLine, t.y);
    const alive = owned(state).filter((p) => !fell.has(p.id) && p.y < standLine + T.rest);
    /*
     * A DRIP comes back to the body; a BODY comes back to its footing.
     *
     * The host-stacking below is written for a few particles scraped off on a corner: each
     * one lands on top of a specific body particle, round-robin. A whole creature going
     * down a pit crosses the kill plane a few particles at a time, so the last one or two
     * still standing became hosts for all the rest - forty particles stacked on one point,
     * pressed against whatever was beside them, which resolved into the tall vertical
     * column the playtest photographed. The threshold sends any real fall to the wholesale
     * respawn, which arranges the creature properly.
     */
    const mostOfMe = fallen.length > Math.max(3, owned(state).length * 0.34);
    if (alive.length > 0 && !mostOfMe) {
      /*
       * Each return lands directly on top of a specific body particle - one rest-spacing
       * above it, round-robin across the body. Two earlier placements failed in two
       * directions: embedding returns inside the mound caused an overlap burst that threw
       * particles clear, and raining them from a spread above sometimes left one grounded
       * just outside link range, disconnected, and disowned. Contact on arrival is the
       * only placement that cannot miss.
       */
      fallen.forEach((p, i) => {
        const host = alive[i % alive.length];
        p.x = host.x;
        p.y = host.y - T.rest;
        p.px = p.x;
        p.py = p.y;
        state.owned.add(p.id);
      });
    } else {
      // The whole body fell. Stand it back up at the LAST SAFE FOOTING, in its birth
      // arrangement - see MassState.lastSafe for why this is not the start of the room.
      standUp(state, fallen);
    }
  }

  /*
   * The critters: walk the beat, then check what is standing in it.
   *
   * Placed after collision and after the presses for the same reason they are: a body that
   * has already been resolved against the room this frame is the body the player can
   * actually see, and a hazard that tests an unresolved position reports contacts that
   * never appeared on screen.
   */
  if (state.stunned > 0) state.stunned = Math.max(0, state.stunned - dt);
  /*
   * Which part of you is YOU, for the purposes of being caught.
   *
   * The body is allowed to be in several pieces - see the note below on why collision never
   * splits it - and a corner can scrape a few particles off at any time. Those pieces are
   * still owned, still take input, and are already being hauled home by the rejoin force. But
   * the contact test asked every owned particle, so a fragment the player did not know they
   * had, drifting into a creature on the far side of a platform, sent the whole creature back
   * to its last footing. The playtest read it exactly as it happened: a piece splits off on
   * its own, something touches it, and the run resets.
   *
   * Contact is the MAIN component only. Everything else about a fragment is unchanged - it
   * comes home the way it always did - and the creature now shoves it on its way instead.
   */
  const myParts = (world.critters ?? []).length > 0 ? components(owned(state)) : [];
  let mainPart: Particle[] = myParts[0] ?? [];
  for (const part of myParts) if (part.length > mainPart.length) mainPart = part;
  const mainIds = new Set(mainPart.map((p) => p.id));
  for (const critter of world.critters ?? []) {
    if (critter.wait > 0) {
      critter.wait = Math.max(0, critter.wait - dt);
    } else {
      critter.x += critter.speed * critter.facing * dt;
      critter.phase += dt;
      // Turning at the ends with a beat of stillness. A patroller that pivots instantly
      // reads as a machine, which is the one thing this creature is here not to be.
      if (critter.x <= critter.from) {
        critter.x = critter.from;
        critter.facing = 1;
        critter.wait = T.critterPause;
      } else if (critter.x >= critter.to) {
        critter.x = critter.to;
        critter.facing = -1;
        critter.wait = T.critterPause;
      }
    }

    if (state.stunned > 0) continue;
    /*
     * Contact is tested against the OWNED body only.
     *
     * Shed mass is scenery as far as a creature is concerned: a lump the player deliberately
     * left behind, sitting on a ledge they are trying to cross, would otherwise end the
     * attempt from across the room for something they cannot even see happening.
     */
    const left = critter.x - critter.w / 2;
    const right = critter.x + critter.w / 2;
    const top = critter.y - critter.h;
    const inside = (p: Particle): boolean =>
      p.x >= left && p.x <= right && p.y >= top && p.y <= critter.y;

    /*
     * A stray piece gets pushed home rather than ignored.
     *
     * Doing nothing at all would be correct and would look broken - a lump of the creature
     * walking through a sporeling while the sporeling ignores it. So the fragment is kicked
     * toward the body it belongs to and the creature flinches, which reads as the thing being
     * batted away and costs the player nothing.
     *
     * Written as a velocity rather than a force because this block runs AFTER the integrator:
     * px is "where I was", so moving it is the only way to change a speed from down here. See
     * the rejoin force for the other half of the rule and for what happens if you forget.
     */
    if (mainPart.length > 0) {
      const home = centroid(mainPart);
      let shoved = false;
      for (const p of particles) {
        if (!state.owned.has(p.id) || mainIds.has(p.id) || !inside(p)) continue;
        const dx = home.x - p.x;
        const dy = home.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        p.px = p.x - (dx / d) * T.strayKick * dt;
        p.py = p.y - (dy / d) * T.strayKick * dt;
        shoved = true;
      }
      if (shoved) critter.wait = Math.max(critter.wait, T.critterPause);
    }

    let touched = false;
    for (const p of mainPart) {
      if (!inside(p)) continue;
      touched = true;
      break;
    }
    if (!touched) continue;

    /*
     * Hit. Both sides stop: the body goes back to its footing, and the creature recoils for
     * as long as the player is untouchable - see TUNING.critterStun for why standing still
     * matters as much as the immunity does.
     */
    state.attached = false;
    state.swingRadius = 0;
    state.spin = 0;
    state.tip = null;
    state.slowmo = 0;
    state.stunned = T.critterStun;
    critter.wait = T.critterStun;
    critter.facing = critter.facing === 1 ? -1 : 1;
    standUp(state, owned(state));
  }

  /*
   * Collision NEVER splits the body. Only the player does, with Space.
   *
   * There used to be a rule here that disowned any part of the body which stayed
   * disconnected from the main mass for half a second. It was written to stop a chunk
   * scraped off on a corner from dragging the centroid around, and it had a consequence
   * nobody asked for: squeezing under the wall pinched the body in two and the game took
   * the back half away. Passing a tight gap is a thing this creature is supposed to be able
   * to do, and any rule that punishes it by confiscating mass is the wrong rule however
   * good its original reason.
   *
   * The body is now allowed to be in as many pieces as physics puts it in. It is still one
   * body, it still all takes input, and cohesion pulls it back together on the far side.
   */

  /*
   * Regroup holds at full strength while the body is in the air and eases off once most of
   * it is down. Decaying from the moment of release instead was the first version, and it
   * ran out mid-flight on long throws - the glue quit exactly when the landing needed it.
   */
  if (state.regroup > 0) {
    const mine = owned(state);
    let down = 0;
    for (const p of mine) if (p.grounded) down += 1;
    /*
     * "Landed" is a tenth of the body touching tile, not half. `grounded` is only ever true
     * for particles in DIRECT tile contact - the bottom row - and a settled 40-mass mound
     * has six of those, so the old half-the-body condition could not be met by any body at
     * rest and regroup stayed at 1 for ever after every fling. Permanently boosted glue then
     * amplified the solver's tiny left-right ordering bias into a real force: landed bodies
     * crept sideways at 30px/s, walked themselves off the lip they had just earned, and the
     * measurements blamed the flight.
     */
    if (down * 10 >= mine.length) {
      state.regroup = Math.max(0, state.regroup - dt / T.regroupTime);
    }
  }

  /*
   * The safe-footing tracker. Grounded on real floor (not the kill plane), whole, and not
   * mid-swing: that spot is where the pit hands a fallen body back. Sampled with a margin
   * from platform edges by requiring MOST of the body grounded - a body teetering on a lip
   * records the lip, and respawning on a lip that crumbled you into the pit once already
   * is not safety.
   */
  {
    const mine = owned(state);
    if (mine.length > 0 && !state.attached) {
      let grounded = 0;
      for (const p of mine) if (p.grounded) grounded += 1;
      if (grounded / mine.length > 0.55) {
        const c = centroid(mine);
        if (c.y < world.height - 20) {
          state.lastSafe.x = c.x;
          state.lastSafe.y = c.y - 10;
        }
      }
    }
  }

  /*
   * Crushers.
   *
   * Moved AFTER collision, so a particle resolves against last frame's slab position and is
   * then swept by this frame's. Moving them first means a fast press teleports through a
   * body between two frames and nothing ever registers as caught.
   */
  for (const c of world.crushers ?? []) {
    const cycle = (state.time / c.period + c.phase) % 1;
    /*
     * WINCH UP, HANG, DROP. Not a cosine.
     *
     * A cosine is symmetric and dwells at both ends, which makes a press a metronome: it is
     * exactly as slow arriving as it is leaving, so there is no moment that reads as "now",
     * and the gap it opens is the same event as the gap it closes. A hammer is not
     * symmetric. It is hauled up against its own weight, it hangs there, and then it falls -
     * and the falling is the part with the fear in it.
     *
     * Fifty-five percent of the cycle winching up, thirty hanging, fifteen dropping. At the
     * shaft's 3.4s period that is a 1.9s rise, a full second of open door, and a half-second
     * drop. The rise eases out so the head settles rather than clanging into its stop; the
     * drop is quadratic, because a falling weight accelerates and a hammer that descends at
     * constant speed reads as a lift.
     */
    const RISE = 0.55;
    const HANG = 0.85;
    let phase: number;
    if (cycle < RISE) {
      // Up, easing to a stop. Smoothstep on the way, so the top is approached and not hit.
      const t = cycle / RISE;
      phase = 1 - t * t * (3 - 2 * t);
    } else if (cycle < HANG) {
      phase = 0;
    } else {
      // Down, accelerating. The last frames of this are the fastest thing in the room.
      const t = (cycle - HANG) / (1 - HANG);
      phase = t * t;
    }
    c.at = c.travel * phase;
    const rect = crusherRect(c);
    for (const p of particles) {
      if (p.x <= rect.x || p.x >= rect.x + rect.w) continue;
      if (p.y <= rect.y || p.y >= rect.y + rect.h) continue;
      /*
       * Inside the slab. Push it out the nearest face, and if that lands it inside something
       * else, it was CAUGHT - there was nowhere for it to go, which is the definition.
       *
       * Checking where it would end up rather than measuring a gap is what makes this
       * reliable. Gap arithmetic needs to know which surface the press is closing against,
       * and a body can be caught against a tile, a shut gate, another crusher or the level
       * wall. "Push it out and see if it fits" needs to know none of that.
       */
      const outs = [
        { x: rect.x - p.x - 1, y: 0 },
        { x: rect.x + rect.w - p.x + 1, y: 0 },
        { x: 0, y: rect.y - p.y - 1 },
        { x: 0, y: rect.y + rect.h - p.y + 1 },
      ];
      outs.sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y));
      const test = { ...p, x: p.x + outs[0].x, y: p.y + outs[0].y };
      const trapped = insideAnySolid(test, world);
      p.x = test.x;
      p.y = test.y;
      if (!trapped) {
        // Carried, not crushed. Keep its velocity so riding a press feels like riding it.
        p.px = p.x - (test.x - p.x);
        continue;
      }
      /*
       * Crushed - and the whole body pays, not just the pixels that were under the head.
       *
       * Only disowning the trapped particles was measured to be toothless: one full pass of
       * the shaft's press took a body from 40 to 31 and then took nothing ever again, while
       * reaching the stage's last growth from the corridor needs 120px, which is 23 mass.
       * Being hammered cost nine grams and changed nothing about what you could still do,
       * which is not a hazard, it is scenery with a sound effect.
       *
       * So a catch sheds a FRACTION of the creature (see crushBite): enough that a hit
       * drops you below what the finale needs, so the answer to being crushed is to go back
       * for yourself. The mass is shed, never destroyed - it squirts out along the press's
       * long axis and Q calls it home - which is the same bargain the splitting wall makes,
       * and the reason a hit can be this expensive without being cruel.
       */
      if (owned(state).length <= T.crushFloor) {
        p.px = p.x;
        p.py = p.y;
        continue;
      }
      const spill = (q: Particle): void => {
        const push = 90 + (q.id % 7) * 12;
        if (c.axis === 'x') {
          q.py = q.y + (q.id % 2 ? push : -push) * dt;
        } else {
          q.px = q.x + (q.id % 2 ? push : -push) * dt;
        }
      };
      const body = owned(state);
      const bite = Math.max(
        1,
        Math.min(body.length - T.crushFloor, Math.round(body.length * T.crushBite))
      );
      /*
       * The particles nearest the head go first, so the mass visibly leaves from where the
       * blow landed rather than evaporating out of the far side of the creature.
       */
      const hit = { x: p.x, y: p.y };
      body.sort(
        (a, b) =>
          Math.hypot(a.x - hit.x, a.y - hit.y) - Math.hypot(b.x - hit.x, b.y - hit.y)
      );
      for (let i = 0; i < bite; i++) {
        state.owned.delete(body[i].id);
        spill(body[i]);
      }
    }
  }

  /*
   * Buttons.
   *
   * Pressed by any owned particle, and they stay pressed. A button that releases when you
   * step off would mean holding it down with mass you split off for the purpose, which is a
   * good puzzle and a different one - stage one's gate exists to let the player go BACK for
   * what they left, so it must not shut behind them.
   *
   * `force` is what makes a button a target rather than a place. Below it, arriving does
   * nothing; the player has to bring speed they did not otherwise need, which is the only
   * reason anyone would build a full revolution they are not going to travel on.
   */
  for (const button of world.buttons) {
    if (button.pressed) continue;
    for (const p of particles) {
      if (!state.owned.has(p.id)) continue;
      if (Math.hypot(p.x - button.x, p.y - button.y) > button.radius) continue;
      if (button.force !== undefined) {
        const speed = Math.hypot(p.x - p.px, p.y - p.py) / dt;
        if (speed < button.force) continue;
      }
      button.pressed = true;
      for (const gate of world.gates) {
        if (!button.opens || (gate.id && button.opens.includes(gate.id))) gate.open = true;
      }
      for (const id of button.activates ?? []) {
        const grown = world.anchors.find((a) => a.id === id);
        if (grown) grown.live = true;
      }
      break;
    }
  }
  for (const gate of world.gates) {
    if (gate.open && gate.lift < 1) gate.lift = Math.min(1, gate.lift + dt * 1.2);
  }

  /*
   * Buttons bolted to a door ride it.
   *
   * The lift is the same curve the slab uses in the rig - `lift` runs 0 to 1 and the slab
   * travels its own height plus a little - so the switch stays exactly where it was welded
   * however far the door has gone up.
   */
  for (const button of world.buttons) {
    if (button.onGate === undefined) continue;
    const gate = world.gates.find((g) => g.id === button.onGate);
    if (!gate) continue;
    if (button.restY === undefined) button.restY = button.y;
    button.y = button.restY - gate.lift * (gate.h + 4);
  }

  // Slow motion decays on its own; the rig sets it and reads it back to scale real time.
  if (state.slowmo > 0) state.slowmo = Math.max(0, state.slowmo - dt / T.slowmoSeconds);

  state.time += dt;
  return state;
}

/** The fewest particles a split may leave you with. Never less than 20% of the start. */
export function minKeep(state: MassState): number {
  return Math.max(2, Math.round(state.startMass * TUNING.keepAtLeast));
}

/**
 * The biggest fraction a split can currently give away, for the HUD's bar to stop at.
 *
 * Shrinks as the body does: a slime already down to 12 of 40 has almost nothing above the
 * floor left to shed, and the bar should say so rather than fill to a promise the split
 * will not honour.
 */
export function maxSplit(state: MassState): number {
  const held = owned(state).length;
  if (held <= 0) return 0;
  return Math.max(0, (held - minKeep(state)) / held);
}

/**
 * Hand a share of the body over to nobody. The half behind you goes.
 *
 * Two decisions here, both from watching it read wrongly:
 *
 * The shed particles are chosen by SIDE - the ones furthest behind the direction the player
 * last moved - not by distance from the centre. Distance took the outer shell, which left the
 * shed mass as a ring AROUND the part you kept: two bodies in the same place, unreadable. A
 * side cut leaves a lump behind you and you standing beside it.
 *
 * And the shed part is not pushed anywhere. It used to get a kick so the silhouettes would
 * separate, but the player controls the half that stays alive - walking away IS the
 * separation, and a lump that scoots off on its own reads as the split aiming itself. What
 * you leave stays exactly where you left it.
 */
export function split(state: MassState, fraction: number, facing: 1 | -1 = 1): number {
  const mine = owned(state);
  const keep = minKeep(state);
  if (mine.length <= keep) return 0;
  // Rear-most first: smallest x when facing right, largest when facing left.
  mine.sort((a, b) => (facing === 1 ? a.x - b.x : b.x - a.x));
  const wanted = Math.max(1, Math.round(mine.length * fraction));
  const shed = Math.min(mine.length - keep, wanted);
  for (let i = 0; i < shed; i++) state.owned.delete(mine[i].id);
  return shed;
}

/** Any stranded particle touching the player rejoins it. */
export function absorbTouching(state: MassState): number {
  let gained = 0;
  const mine = owned(state);
  for (const p of state.particles) {
    if (state.owned.has(p.id)) continue;
    for (const q of mine) {
      if (Math.hypot(p.x - q.x, p.y - q.y) <= TUNING.linkRange) {
        state.owned.add(p.id);
        gained += 1;
        break;
      }
    }
  }
  return gained;
}
