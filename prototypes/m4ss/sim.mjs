/**
 * M4SS - the mass simulation, and nothing else.
 *
 * ## What this is for
 *
 * One question: does a slime whose reach is limited by its own mass feel good? Everything
 * else in the design - the facility, the acts, the predators, the provenance of eaten mass -
 * is content that can be built once that answer is yes. If it is no, none of it matters.
 *
 * So this file has no rendering, no DOM and no engine in it. It is imported by play.html to
 * be played and by verify.mjs to be measured, which is the only way to know whether the
 * numbers behind the feel are actually doing what the design claims.
 *
 * ## Mass is particles, and that is the whole trick
 *
 * The slime is a cloud of identical particles. One particle is one gram. That single choice
 * gives the design almost everything it asked for, for free:
 *
 *   - Mass is conserved because particles are never created or destroyed, only moved.
 *   - Splitting is handing some particles to a different owner.
 *   - Eating is adding particles at the mouth.
 *   - "Every piece of you physically exists in the level" is not a feature, it is the
 *     representation. A stranded lump IS the particles you left behind.
 *
 * And crucially, the reach limit is emergent rather than a rule. Particles hold together
 * only while they are within `linkRange` of each other. To span a gap you have to string
 * particles along it, and if you do not have enough, the spacing exceeds the range and the
 * chain simply stops being connected. Nobody wrote "if mass < x then fail" - it falls out of
 * a cloud trying to be in two places at once.
 *
 * That is why this is worth prototyping rather than arguing about: an emergent limit either
 * reads as a physical fact or reads as a bug, and no amount of design discussion settles it.
 */

export const TUNING = {
  /** Fixed, because verify.mjs has to get the same answer twice. */
  dt: 1 / 120,
  gravity: 1500,
  /** Spacing two linked particles settle at. Sets the slime's density. */
  rest: 9,
  /**
   * Past this, two particles are not connected.
   *
   * The single most important number in the file. It is what stops a small slime reaching a
   * far anchor: strung out over too much distance, neighbours drift past this and the body
   * comes apart in the middle.
   */
  linkRange: 15,
  /**
   * The dead band, and the single fix that made this simulation stable.
   *
   * The first version pushed apart below `rest` and pulled together above it, which sounds
   * symmetrical and is unsatisfiable: in a 2D packing a particle cannot be exactly `rest`
   * from all six of its neighbours at once, so every particle was being corrected every
   * frame forever. Verlet turns a position correction into velocity, so the blob did not
   * jitter - it detonated, reaching 25px per frame within six frames and coming apart into
   * nineteen pieces before it had touched the floor.
   *
   * Nothing pulls between `rest` and `slack`. That gap is where a settled packing lives, so
   * a slime at rest has no forces acting on it at all and simply sits there.
   */
  slack: 12,
  /** Overlap correction, as a fraction resolved per iteration. */
  push: 0.6,
  /** Cohesion stiffness beyond `slack`, as an acceleration per pixel of stretch. */
  pull: 900,
  /**
   * The most one link can pull, and therefore the whole game's difficulty curve.
   *
   * A link carries at most this much. Weight per particle is `gravity`, so a strand of neck
   * holds about maxPull / gravity particles hanging off it. Raise this and a thin thread can
   * haul the whole slime; lower it and even a fat neck parts. This is the number to tune
   * when reach feels too generous or too mean.
   */
  maxPull: 2600,
  /** Solver iterations per step. Two is enough once there is an equilibrium to find. */
  iterations: 3,
  /** No single correction may move a particle further than this in one iteration. */
  maxCorrection: 3,
  damping: 0.986,
  /** Sideways drive, applied to particles in contact with something. */
  move: 2600,
  /** Pull toward the anchor once the tendril has connected. */
  climb: 5200,
  /**
   * How hard particles are held onto the tendril's line while reaching.
   *
   * Swept, because it turned out to set the PRICE of failure rather than anything about
   * whether you succeed. At 5200 an over-reach cost 60% of the body in six lumps - the pull
   * was strong enough to tear apart the slime that stayed behind, not just the tendril. At
   * 3600 the same failure costs 20% in one lump, and every successful reach still arrives
   * with nothing lost. Below 3600 it starts tearing small slimes instead.
   */
  reach: 3600,
  /**
   * Pixels of tendril per gram of slime. The difficulty dial for the whole game.
   *
   * At 1.8 a 30-mass slime reaches 54px, 60 reaches 108, 120 reaches 216 and 240 reaches
   * 432 - so a level designer sizes a gap and knows exactly what it asks for.
   */
  reachPerMass: 1.8,
  /** How fast the tendril extends, px/s. */
  extend: 420,
  /** Seconds at full extension before an over-reach parts. Long enough to see it thin. */
  snapAfter: 0.55,
  /** How close the tip must get before the body is considered attached. */
  attachAt: 14,
  /** Distance over which the climb eases off, so the body piles up instead of imploding. */
  settleAt: 55,
  friction: 0.55,
  bounce: 0.05,
  /** How round a settled body wants to be, as a multiple of sqrt(mass) * rest. */
  roundness: 0.62,
  /** Surface tension stiffness, per pixel past the natural radius. */
  tension: 260,
  /** Ceiling on tension, so a badly stretched body is not yanked into a ball. */
  maxTension: 3000,
  /** Recall speed for stranded lumps when the player presses Q. */
  recall: 900,
  /** Particles this close to food eat it. */
  bite: 12,
};

let nextId = 1;

export function makeParticle(x, y) {
  return { id: nextId++, x, y, px: x, py: y, ax: 0, ay: 0, grounded: false };
}

/**
 * A blob of `count` particles packed around a point.
 *
 * Spiralled rather than gridded so the starting shape is round - a square of particles
 * settles into a round one anyway, but it spends half a second looking like a waffle.
 */
export function makeSlime(x, y, count) {
  const particles = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    // 0.62 rather than 0.55: the tighter constant put the innermost particles 5px apart
    // against a rest of 9, so the solver's first act was always to shove them.
    const r = TUNING.rest * 0.62 * Math.sqrt(i);
    const a = i * golden;
    particles.push(makeParticle(x + Math.cos(a) * r, y + Math.sin(a) * r));
  }
  return particles;
}

/** Cell size is linkRange, so a particle's neighbours are always in the 9 cells around it. */
function buildGrid(particles, cell) {
  const grid = new Map();
  for (const p of particles) {
    const key = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)}`;
    let bucket = grid.get(key);
    if (!bucket) grid.set(key, (bucket = []));
    bucket.push(p);
  }
  return grid;
}

function neighbours(grid, p, cell, out) {
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
 * Which particles are actually joined to which.
 *
 * Union-find over every pair inside linkRange. This is what the game means by "you" - the
 * component holding the controlled particle is the player, and every other component is a
 * piece of them lying somewhere in the level.
 */
export function components(particles) {
  const parent = new Map(particles.map((p) => [p.id, p.id]));
  const find = (a) => {
    while (parent.get(a) !== a) {
      parent.set(a, parent.get(parent.get(a)));
      a = parent.get(a);
    }
    return a;
  };
  const cell = TUNING.linkRange;
  const grid = buildGrid(particles, cell);
  const near = [];
  for (const p of particles) {
    for (const q of neighbours(grid, p, cell, near)) {
      if (Math.hypot(p.x - q.x, p.y - q.y) > cell) continue;
      const ra = find(p.id);
      const rb = find(q.id);
      if (ra !== rb) parent.set(ra, rb);
    }
  }
  const groups = new Map();
  for (const p of particles) {
    const root = find(p.id);
    let group = groups.get(root);
    if (!group) groups.set(root, (group = []));
    group.push(p);
  }
  return [...groups.values()];
}

export function centroid(group) {
  let x = 0;
  let y = 0;
  for (const p of group) {
    x += p.x;
    y += p.y;
  }
  return { x: x / group.length, y: y / group.length };
}

function collide(p, world) {
  p.grounded = false;
  for (const t of world.tiles) {
    if (p.x < t.x || p.x > t.x + t.w || p.y < t.y || p.y > t.y + t.h) continue;
    // Push out along whichever face is nearest - a box is four one-way constraints.
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

/**
 * One fixed step.
 *
 * `input` is { move: -1|0|1, anchor: {x,y}|null, recall: boolean }. Splitting is not in
 * here - it is an instantaneous handover of particles and lives in split() below.
 */
export function step(state, input) {
  const T = TUNING;
  const { particles, world } = state;
  const dt = T.dt;

  const owned = state.owned;
  const anchor = input.anchor;

  // -- forces ---------------------------------------------------------------------------
  for (const p of particles) {
    p.ax = 0;
    p.ay = T.gravity;
  }

  if (input.move !== 0) {
    for (const p of particles) {
      if (!owned.has(p.id)) continue;
      // Only what is touching something can push against it. Airborne slime cannot steer,
      // which is most of why the stretch matters at all.
      if (p.grounded) p.ax += input.move * T.move;
    }
  }

  /**
   * The reach: a tendril whose length is bought with mass.
   *
   * ## Why this is explicit rather than emergent
   *
   * Four versions tried to make the limit fall out of the particle physics alone - let the
   * body string itself toward the anchor and see whether cohesion held. Every one of them
   * produced the wrong game, and the sweeps are worth recording because they were not close
   * calls:
   *
   *   pull the nearest share      a 30-mass slime arrived at 300px with 90% of itself and a
   *                               240-mass slime tore into twenty pieces. Inverted: the
   *                               unpulled remainder is dead weight and big bodies have more.
   *   hold the tail, reach a tip  the tip is pulled directly, so it always arrived - it just
   *                               arrived detached. Distance made no difference to anything.
   *   require the tip to stay
   *   connected                   correct direction at last, and a flat 27-28% torn off every
   *                               single time, which is exactly tipShare. The tip could not
   *                               be pulled hard enough to move the body without exceeding
   *                               what a link transmits.
   *   cap the link force          right in principle - a neck's strength becomes its
   *                               cross-section - and one or two attempts in sixteen arrived.
   *                               Tunable, in theory, somewhere.
   *
   * The mechanic is not in doubt; the schedule is. An emergent limit needs the force balance
   * between reach, cohesion, gravity and neck geometry to land in a narrow band, and finding
   * that band is open-ended work with a feature freeze fifteen days out.
   *
   * So the limit is stated: REACH_PER_MASS pixels of tendril per gram. The body stays a real
   * particle blob - it still wobbles, splits, eats and conserves - and the tendril is still
   * drawn as particles strung along its length, so it reads as physical. What changed is that
   * the designer can now say "this ledge wants 120 mass" and be right.
   */
  if (anchor) {
    const mine = particles.filter((p) => owned.has(p.id));
    const home = centroid(mine);
    const dx = anchor.x - home.x;
    const dy = anchor.y - home.y;
    const span = Math.hypot(dx, dy) || 1;
    const limit = mine.length * T.reachPerMass;

    state.reachLimit = limit;
    state.reachSpan = span;

    /*
     * A parted tendril does not grow back while the button is still down.
     *
     * Without this the reach simply restarts, and a held latch snaps over and over - a
     * 30-mass slime attempting a 60px gap lost 97% of itself in seven seconds, one mouthful
     * at a time. One attempt, one cost, and the player has to let go and decide again.
     */
    if (state.broken) state.tip = null;

    // How far the tendril has actually got. Grows toward whichever is nearer.
    const target = Math.min(span, limit);
    state.tendril = Math.min(target, (state.tendril ?? 0) + T.extend * dt);

    const tipX = home.x + (dx / span) * state.tendril;
    const tipY = home.y + (dy / span) * state.tendril;
    state.tip = { x: tipX, y: tipY };

    if (span <= limit && state.tendril >= span - T.attachAt) state.attached = true;

    if (state.broken) {
      // nothing: the tendril has parted and the button is still down
    } else if (state.attached) {
      for (const p of mine) {
        const ax = anchor.x - p.x;
        const ay = anchor.y - p.y;
        const d = Math.hypot(ax, ay) || 1;
        const ease = Math.min(1, Math.max(0, (d - T.attachAt) / T.settleAt));
        p.ax += (ax / d) * T.climb * ease;
        p.ay += (ay / d) * T.climb * ease - T.gravity * ease;
      }
    } else {
      /*
       * Reaching. The particles nearest the tip are strung along the tendril, so the body
       * visibly thins into a neck - that is the warning, and it is the thing the player is
       * meant to read before it costs them anything.
       */
      const cost = Math.min(mine.length - 2, Math.round(state.tendril / T.rest));
      mine.sort(
        (a, b) => Math.hypot(a.x - tipX, a.y - tipY) - Math.hypot(b.x - tipX, b.y - tipY)
      );
      for (let i = 0; i < cost; i++) {
        const p = mine[i];
        const along = state.tendril * (1 - i / Math.max(1, cost));
        const wantX = home.x + (dx / span) * along;
        const wantY = home.y + (dy / span) * along;
        const gx = wantX - p.x;
        const gy = wantY - p.y;
        const d = Math.hypot(gx, gy) || 1;
        p.ax += (gx / d) * T.reach;
        p.ay += (gy / d) * T.reach - T.gravity;
      }

      /*
       * Out of reach, and the tendril has stopped growing. It parts, and everything that had
       * been strung along it stays where it is - which is the whole point of the mechanic:
       * the failure costs you the mass you spent trying.
       */
      if (span > limit && state.tendril >= limit - 0.5) {
        state.strain = (state.strain ?? 0) + dt;
        if (state.strain > T.snapAfter) {
          for (let i = 0; i < cost; i++) owned.delete(mine[i].id);
          state.snapped = (state.snapped ?? 0) + cost;
          state.tendril = 0;
          state.strain = 0;
          state.broken = true;
        }
      } else {
        state.strain = 0;
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
    const home = centroid(particles.filter((p) => owned.has(p.id)));
    for (const p of particles) {
      if (owned.has(p.id)) continue;
      const dx = home.x - p.x;
      const dy = home.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      p.ax += (dx / d) * T.recall;
      p.ay += (dy / d) * T.recall - T.gravity * 0.9;
    }
  }

  /**
   * Cohesion, as a force with a ceiling. This is the mechanic.
   *
   * ## Why a force and not a constraint
   *
   * Overlap is a constraint - two particles cannot be in one place, and no amount of load
   * changes that. Cohesion is not like that. Slime pulls itself together only so hard, and
   * past that it lets go.
   *
   * Modelled as a hard constraint, which is what the first three versions did, a single link
   * is infinitely strong: one particle can hold up the entire body, so a one-particle-thick
   * neck never fails and reaching costs nothing. Sweeping mass against distance showed it
   * plainly - the reach barely moved as either changed, and where it did move it moved the
   * wrong way.
   *
   * With a ceiling per link, a neck's strength is its CROSS-SECTION. To hold a body of N
   * particles you need roughly N * gravity / maxPull links running in parallel, and to span
   * a distance D each of those strands costs about D / rest particles. So the mass needed
   * goes up with the weight being carried AND with how far it is being carried - which is
   * the design's claim, arrived at from a force balance rather than asserted.
   */
  {
    const cell = T.linkRange;
    const grid = buildGrid(particles, cell);
    const near = [];
    for (const p of particles) {
      for (const q of neighbours(grid, p, cell, near)) {
        if (q.id < p.id) continue;
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d <= T.slack || d > cell) continue;
        const nx = dx / d;
        const ny = dy / d;
        const force = Math.min((d - T.slack) * T.pull, T.maxPull);
        p.ax += nx * force;
        p.ay += ny * force;
        q.ax -= nx * force;
        q.ay -= ny * force;
      }
    }
  }

  /**
   * Surface tension: the thing that makes it a slime rather than sand.
   *
   * Rendered rather than measured, the first working version was a disaster - the blob
   * flattened to two particles thick within a second and spread 220px along the floor, and
   * by the time it had eaten anything it was a scatter of grains. Every number in the reach
   * sweep was correct while this was true, which is the argument for looking at a thing and
   * not only checking it.
   *
   * Neighbour forces cannot fix it. A pancake still has all of its neighbours at a
   * comfortable distance, so nothing local objects to being a pancake - the objection has to
   * come from the shape as a whole. Each particle is pulled toward the centre of its own
   * body once it strays past the radius that much slime would naturally occupy, which is
   * exactly what a surface holding itself in does.
   *
   * Per component, so a stranded lump rounds itself up too, instead of the pieces of you
   * being drawn back toward a body they are no longer part of.
   */
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

  // -- integrate ------------------------------------------------------------------------
  for (const p of particles) {
    const vx = (p.x - p.px) * T.damping;
    const vy = (p.y - p.py) * T.damping;
    p.px = p.x;
    p.py = p.y;
    p.x += vx + p.ax * dt * dt;
    p.y += vy + p.ay * dt * dt;
  }

  // -- cohesion and volume --------------------------------------------------------------
  const cell = T.linkRange;
  const near = [];
  for (let pass = 0; pass < T.iterations; pass++) {
    // Rebuilt each iteration: corrections move particles between cells, and a stale grid
    // is how a solver quietly stops seeing the pairs it is supposed to be fixing.
    const grid = buildGrid(particles, cell);
    for (const p of particles) {
      for (const q of neighbours(grid, p, cell, near)) {
        if (q.id < p.id) continue;
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d === 0 || d > cell) continue;
        const nx = dx / d;
        const ny = dy / d;

        if (d >= T.rest) continue; // cohesion is a force, applied below - see pullPairs
        // Overlap only. Hard, because two particles genuinely cannot occupy one space.
        const move = -(T.rest - d) * T.push;
        const half = Math.max(-T.maxCorrection, Math.min(T.maxCorrection, move)) * 0.5;
        p.x += nx * half;
        p.y += ny * half;
        q.x -= nx * half;
        q.y -= ny * half;
      }
    }
  }

  // -- world ----------------------------------------------------------------------------
  for (const p of particles) collide(p, world);

  // -- eating ---------------------------------------------------------------------------
  for (const f of world.food) {
    if (f.eaten) continue;
    for (const p of particles) {
      if (!owned.has(p.id)) continue;
      if (Math.hypot(p.x - f.x, p.y - f.y) > T.bite) continue;
      f.eaten = true;
      for (let i = 0; i < f.mass; i++) {
        const grain = makeParticle(f.x + (Math.random() - 0.5) * 4, f.y + (Math.random() - 0.5) * 4);
        particles.push(grain);
        owned.add(grain.id);
      }
      break;
    }
  }

  state.time += dt;
  return state;
}

/**
 * Hand `fraction` of the body over to nobody.
 *
 * The particles furthest from the anchor point of the split go, which is what makes a split
 * read as leaving your back end behind rather than dissolving evenly.
 */
export function split(state, fraction) {
  const mine = state.particles.filter((p) => state.owned.has(p.id));
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
export function absorbTouching(state) {
  const T = TUNING;
  let gained = 0;
  const mine = state.particles.filter((p) => state.owned.has(p.id));
  for (const p of state.particles) {
    if (state.owned.has(p.id)) continue;
    for (const q of mine) {
      if (Math.hypot(p.x - q.x, p.y - q.y) <= T.linkRange) {
        state.owned.add(p.id);
        gained += 1;
        break;
      }
    }
  }
  return gained;
}

export function makeState(world, startMass) {
  const particles = makeSlime(world.start.x, world.start.y, startMass);
  return {
    world,
    particles,
    owned: new Set(particles.map((p) => p.id)),
    attached: false,
    tendril: 0,
    strain: 0,
    tip: null,
    reachLimit: 0,
    reachSpan: 0,
    snapped: 0,
    time: 0,
  };
}

export function mass(state) {
  return state.particles.filter((p) => state.owned.has(p.id)).length;
}

export function strandedLumps(state) {
  const loose = state.particles.filter((p) => !state.owned.has(p.id));
  return components(loose);
}
