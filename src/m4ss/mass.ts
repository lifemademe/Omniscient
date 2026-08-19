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

export interface World {
  width: number;
  height: number;
  start: { x: number; y: number };
  tiles: Tile[];
  anchors: Anchor[];
  gates: Gate[];
  buttons: Button[];
  crushers?: Crusher[];
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
  /**
   * The body's shape at the moment it grabbed on, in the rope's own frame.
   *
   * Each entry is one particle's offset from the centroid, split into "along the rope" and
   * "across it", so the shape can be rebuilt at any angle without storing the angle. Empty
   * whenever nothing is attached.
   */
  swingShape: Array<{ id: number; along: number; across: number }>;
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
  roundness: 0.5,
  tension: 950,
  maxTension: 14000,
  damping: 0.986,
  /** Damping while airborne off a fling - see the drag note in the integrator. */
  flightDamping: 0.9975,
  /** Raised from 2600 - the crawl read as sluggish even with the relaxises doing their part. */
  move: 3300,
  friction: 0.55,
  bounce: 0.05,
  /**
   * How hard particles are held onto the tendril's line.
   *
   * Sets the PRICE of failure rather than whether you succeed. At 5200 an over-reach tore
   * the remaining body apart and cost 60% in six lumps; at 3600 the same failure costs 20%
   * in one, and every successful reach still arrives whole.
   */
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
  reachPerMass: 4.6,

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
  slowmoAt: 2.6,
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
  taperTop: 0.35,
  taperBottom: 1.1,
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
    slowmo: 0,
    regroup: 0,
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

  if (input.move !== 0) {
    for (const p of particles) {
      // Only what is touching something can push against it. Airborne slime cannot steer,
      // which is most of why reaching matters at all.
      if (state.owned.has(p.id) && p.grounded) p.ax += input.move * T.move;
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
        if (input.move !== 0) {
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
          const tangentialSpeed =
            Math.abs((vtx / mine.length) * (tx / tl) + (vty / mine.length) * (ty / tl)) / dt;
          const gate = tangentialSpeed < 60 ? 0.25 : 1;
          for (const p of mine) {
            p.ax += (tx / tl) * input.move * T.swingPump * gate;
            p.ay += (ty / tl) * input.move * T.swingPump * gate;
          }
        }
      } else {
        const cost = Math.min(mine.length - 2, Math.round(state.tendril / T.rest));
        mine.sort(
          (a, b) => Math.hypot(a.x - tipX, a.y - tipY) - Math.hypot(b.x - tipX, b.y - tipY)
        );
        for (let i = 0; i < cost; i++) {
          const p = mine[i];
          const along = state.tendril * (1 - i / Math.max(1, cost));
          const gx = home.x + (dx / span) * along - p.x;
          const gy = home.y + (dy / span) * along - p.y;
          const d = Math.hypot(gx, gy) || 1;
          p.ax += (gx / d) * T.reach;
          p.ay += (gy / d) * T.reach - T.gravity;
        }

        if (span > limit && state.tendril >= limit - 0.5) {
          state.strain += dt;
          if (state.strain > T.snapAfter) {
            for (let i = 0; i < cost; i++) state.owned.delete(mine[i].id);
            state.snapped += cost;
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
  if (input.recall) {
    const home = centroid(owned(state));
    for (const p of particles) {
      if (state.owned.has(p.id)) continue;
      const dx = home.x - p.x;
      const dy = home.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      p.ax += (dx / d) * T.recall;
      p.ay += (dy / d) * T.recall - T.gravity * 0.9;
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
   * While the player is REACHING - tendril out, not yet attached - the owned body is exempt.
   * Tension at these strengths pulls an outlying particle home at up to 14000, and the reach
   * force stretching the tendril along its line is 3600: with both on, the arm loses to its
   * own skin and can never extend. An arm you are deliberately stretching out is the one part
   * of a slime that is not trying to be a sphere.
   */
  const reaching = anchor !== null && !state.attached && !state.broken;
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
      if (reaching && mineP) continue;
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
    if (!state.owned.has(p.id) && !input.recall) {
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
          const pAwake = state.owned.has(p.id) || input.recall;
          const qAwake = state.owned.has(q.id) || input.recall;
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
        const halfLength = size * 0.62;
        const halfWidth = size * 0.4;
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

        for (const slot of state.swingShape) {
          const p = by.get(slot.id);
          if (!p) continue;
          const depth = (slot.along + 1) / 2;
          const width = T.taperTop + (T.taperBottom - T.taperTop) * depth;
          const along = slot.along * halfLength;
          const across = slot.across * halfWidth * width;
          const tx = centre.x + nx * along + -ny * across;
          const ty = centre.y + ny * along + nx * across;
          const mx = (tx - p.x) * hold;
          const my = (ty - p.y) * hold;
          p.x += mx;
          p.y += my;
          p.px += mx;
          p.py += my;
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
      for (const rect of sieves) hitTile(p, rect, world);
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
    if (alive.length > 0) {
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
      // The whole body fell. Stand it back up at the start, in its birth arrangement.
      const golden = Math.PI * (3 - Math.sqrt(5));
      fallen.forEach((p, i) => {
        const r = T.rest * 0.62 * Math.sqrt(i);
        const a = i * golden;
        p.x = world.start.x + Math.cos(a) * r;
        p.y = world.start.y + Math.sin(a) * r;
        p.px = p.x;
        p.py = p.y;
        state.owned.add(p.id);
      });
      state.regroup = 0;
    }
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
   * Crushers.
   *
   * Moved AFTER collision, so a particle resolves against last frame's slab position and is
   * then swept by this frame's. Moving them first means a fast press teleports through a
   * body between two frames and nothing ever registers as caught.
   */
  for (const c of world.crushers ?? []) {
    const cycle = (state.time / c.period + c.phase) % 1;
    // Cosine, so it dwells at both ends. A linear press has no moment where the gap is open
    // and waiting, and a timing puzzle needs one.
    c.at = c.travel * (0.5 - 0.5 * Math.cos(cycle * Math.PI * 2));
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
       * Crushed. Ownership is what is lost, not the particle - it squirts out along the
       * press's long axis as loose mass and can be recalled with Q once the way is clear.
       */
      state.owned.delete(p.id);
      const spill = 90 + (p.id % 7) * 12;
      if (c.axis === 'x') {
        p.py = p.y + (p.id % 2 ? spill : -spill) * dt;
      } else {
        p.px = p.x + (p.id % 2 ? spill : -spill) * dt;
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
