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
}

export interface Tile {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Food {
  x: number;
  y: number;
  mass: number;
  eaten: boolean;
}

export interface Anchor {
  x: number;
  y: number;
}

export interface World {
  width: number;
  height: number;
  start: { x: number; y: number };
  tiles: Tile[];
  anchors: Anchor[];
  food: Food[];
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
  roundness: 0.62,
  tension: 260,
  maxTension: 3000,
  damping: 0.986,
  move: 2600,
  friction: 0.55,
  bounce: 0.05,
  /** Pull toward the anchor once the tendril has connected. */
  climb: 5200,
  /**
   * How hard particles are held onto the tendril's line.
   *
   * Sets the PRICE of failure rather than whether you succeed. At 5200 an over-reach tore
   * the remaining body apart and cost 60% in six lumps; at 3600 the same failure costs 20%
   * in one, and every successful reach still arrives whole.
   */
  reach: 3600,
  /** Pixels of tendril per gram. The difficulty dial for the whole game. */
  reachPerMass: 1.8,
  extend: 420,
  attachAt: 14,
  settleAt: 55,
  snapAfter: 0.55,
  recall: 900,
  bite: 12,
};

let nextId = 1;

function makeParticle(x: number, y: number): Particle {
  return { id: nextId++, x, y, px: x, py: y, ax: 0, ay: 0, grounded: false };
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

function collide(p: Particle, world: World): void {
  p.grounded = false;
  for (const t of world.tiles) {
    if (p.x < t.x || p.x > t.x + t.w || p.y < t.y || p.y > t.y + t.h) continue;
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
        for (const p of mine) {
          const ax = anchor.x - p.x;
          const ay = anchor.y - p.y;
          const d = Math.hypot(ax, ay) || 1;
          // Tapered, or every particle is driven at one point and the body implodes.
          const ease = Math.min(1, Math.max(0, (d - T.attachAt) / T.settleAt));
          p.ax += (ax / d) * T.climb * ease;
          p.ay += (ay / d) * T.climb * ease - T.gravity * ease;
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
  }

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
    for (const p of particles) {
      for (const q of neighbours(grid, p, cell, near)) {
        if (q.id < p.id) continue;
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d <= T.slack || d > cell) continue;
        const force = Math.min((d - T.slack) * T.pull, T.maxPull);
        p.ax += (dx / d) * force;
        p.ay += (dy / d) * force;
        q.ax -= (dx / d) * force;
        q.ay -= (dy / d) * force;
      }
    }
  }

  // Surface tension, per component, so a stranded lump rounds itself up too.
  for (const group of components(particles)) {
    if (group.length < 3) continue;
    const home = centroid(group);
    const natural = Math.sqrt(group.length) * T.rest * T.roundness;
    for (const p of group) {
      const dx = home.x - p.x;
      const dy = home.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d <= natural || d === 0) continue;
      const force = Math.min((d - natural) * T.tension, T.maxTension);
      p.ax += (dx / d) * force;
      p.ay += (dy / d) * force;
    }
  }

  for (const p of particles) {
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
          p.x += (dx / d) * half;
          p.y += (dy / d) * half;
          q.x -= (dx / d) * half;
          q.y -= (dy / d) * half;
        }
      }
    }
  }

  for (const p of particles) collide(p, world);

  for (const f of world.food) {
    if (f.eaten) continue;
    for (const p of particles) {
      if (!state.owned.has(p.id)) continue;
      if (Math.hypot(p.x - f.x, p.y - f.y) > T.bite) continue;
      f.eaten = true;
      for (let i = 0; i < f.mass; i++) {
        const grain = makeParticle(f.x + (i % 5) - 2, f.y + Math.floor(i / 5) - 2);
        particles.push(grain);
        state.owned.add(grain.id);
      }
      break;
    }
  }

  state.time += dt;
  return state;
}

/** Hand a share of the body over to nobody. The furthest particles go. */
export function split(state: MassState, fraction: number): number {
  const mine = owned(state);
  if (mine.length < 4) return 0;
  const home = centroid(mine);
  mine.sort(
    (a, b) => Math.hypot(b.x - home.x, b.y - home.y) - Math.hypot(a.x - home.x, a.y - home.y)
  );
  const shed = Math.min(mine.length - 2, Math.max(1, Math.round(mine.length * fraction)));
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
