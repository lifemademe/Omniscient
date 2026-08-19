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
  x: number;
  y: number;
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
  x: number;
  y: number;
  w: number;
  h: number;
  open: boolean;
  /** 0 shut, 1 fully up. Drives the mesh only. */
  lift: number;
}

export interface Button {
  x: number;
  y: number;
  radius: number;
  pressed: boolean;
}

export interface World {
  width: number;
  height: number;
  start: { x: number; y: number };
  tiles: Tile[];
  anchors: Anchor[];
  gates: Gate[];
  buttons: Button[];
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
  swingPump: 1600,
  /** Below this the rope is too short to swing on and the body just hangs against the growth. */
  minSwing: 26,
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
   * How much stronger cohesion and tension are at regroup 1. See MassState.regroup.
   *
   * 1.6 means 2.6x at the moment of release. High enough that a landing at full swing speed
   * stays one body; it decays before the player is back to fine manoeuvring, so the slime
   * does not feel starched.
   */
  regroupBoost: 1.6,
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
function hitTile(p: Particle, t: Tile): void {
  if (p.x < t.x || p.x > t.x + t.w || p.y < t.y || p.y > t.y + t.h) return;
  const left = p.x - t.x;
  const right = t.x + t.w - p.x;
  const top = p.y - t.y;
  const bottom = t.y + t.h - p.y;
  const least = Math.min(left, right, top, bottom);
  const vx = (p.x - p.px) * TUNING.friction;
  const vy = p.y - p.py;
  if (least === top) {
    p.y = t.y;
    p.py = p.y + vy * TUNING.bounce;
    p.px = p.x - vx;
    p.grounded = true;
  } else if (least === bottom) {
    p.y = t.y + t.h;
    p.py = p.y + vy * TUNING.bounce;
    p.px = p.x - vx;
  } else if (least === left) {
    p.x = t.x;
    p.px = p.x + (p.x - p.px) * TUNING.bounce;
  } else {
    p.x = t.x + t.w;
    p.px = p.x + (p.x - p.px) * TUNING.bounce;
  }
}

function collide(p: Particle, world: World): void {
  p.grounded = false;
  for (const t of world.tiles) hitTile(p, t);
  for (const gate of world.gates) {
    if (!gate.open) hitTile(p, gate);
  }
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
  const anchor = input.anchor;

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
          let aMin = Infinity;
          let aMax = -Infinity;
          let cMin = Infinity;
          let cMax = -Infinity;
          for (const r of raw) {
            if (r.along < aMin) aMin = r.along;
            if (r.along > aMax) aMax = r.along;
            if (r.across < cMin) cMin = r.across;
            if (r.across > cMax) cMax = r.across;
          }
          const aHalf = Math.max(1, (aMax - aMin) / 2);
          const cHalf = Math.max(1, (cMax - cMin) / 2);
          /*
           * Negated on the way in, and the minus signs are load-bearing: this block measures
           * on the body-to-anchor axis (dx points UP at the growth), while the constraint
           * block that applies the shape works on anchor-to-body (pointing down). Recorded
           * un-flipped, the teardrop applied upside down - wide at the growth, pinched at
           * the bottom, an onion on a string. Negating both components is the 180 degree
           * turn that puts the two frames in agreement.
           */
          state.swingShape = raw.map((r) => ({
            id: r.id,
            along: -(r.along - (aMin + aHalf)) / aHalf,
            across: -(r.across - (cMin + cHalf)) / cHalf,
          }));
        }
        if (input.move !== 0) {
          // Perpendicular to the rope, sign chosen so D drives clockwise on a y-down world -
          // which is the direction the body is facing when it runs off a ledge to the right.
          const tx = home.y - anchor.y;
          const ty = -(home.x - anchor.x);
          const tl = Math.hypot(tx, ty) || 1;
          for (const p of mine) {
            p.ax += (tx / tl) * input.move * T.swingPump;
            p.ay += (ty / tl) * input.move * T.swingPump;
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
    if (state.swingShape.length > 0) state.regroup = 1;
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
    const vx = (p.x - p.px) * T.damping;
    const vy = (p.y - p.py) * T.damping;
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
        for (const slot of state.swingShape) {
          const p = by.get(slot.id);
          if (!p) continue;
          const depth = (slot.along + 1) / 2;
          const width = T.taperTop + (T.taperBottom - T.taperTop) * depth;
          const along = slot.along * halfLength;
          const across = slot.across * halfWidth * width;
          const tx = centre.x + nx * along + -ny * across;
          const ty = centre.y + ny * along + nx * across;
          const mx = (tx - p.x) * T.swingHold;
          const my = (ty - p.y) * T.swingHold;
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

  for (const p of particles) collide(p, world);

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
    const alive = owned(state).filter((p) => !fell.has(p.id) && p.y < world.height);
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
   * Buttons.
   *
   * Pressed by any owned particle, and they stay pressed. A button that releases when you
   * step off would mean holding it down with mass you split off for the purpose, which is a
   * good puzzle and a different one - this gate exists to let the player go BACK for what
   * they left, so it must not shut behind them.
   */
  for (const button of world.buttons) {
    if (button.pressed) continue;
    for (const p of particles) {
      if (!state.owned.has(p.id)) continue;
      if (Math.hypot(p.x - button.x, p.y - button.y) > button.radius) continue;
      button.pressed = true;
      for (const gate of world.gates) gate.open = true;
      break;
    }
  }
  for (const gate of world.gates) {
    if (gate.open && gate.lift < 1) gate.lift = Math.min(1, gate.lift + dt * 1.2);
  }

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
