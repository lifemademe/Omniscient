/**
 * Rings on standing water.
 *
 * ## What a flood needs that a flat plane does not give
 *
 * The cellar's floodwater is a single quad with a ripple written into its normals - it
 * shifts, it catches the lamp, and it is completely, evenly still. Still is what a plane
 * does. Water in a room that is actively flooding is being fed from somewhere, and the one
 * thing that says so without a single extra light is a ring spreading out from where a drop
 * landed. It is the difference between "there is a blue floor" and "this is filling up".
 *
 * ## Rings, not sprites
 *
 * A ripple sprite is a texture of a ring, and a texture of a ring at this angle is an
 * ellipse painted on a floor - it reads as a decal the moment the camera is not overhead.
 * These are real ring geometry lying in the water plane, so they take the room's
 * perspective for free and they are two triangles per segment.
 *
 * Unlit, because a highlight on a 3mm ripple is not something a renderer with no shadows and
 * one lamp is going to get right, and because the ring has to keep its value as it crosses
 * the dark half of the floor. It is a pale line on dark water; that is all it ever needs to
 * be.
 *
 * ## Pooled, and silent about it
 *
 * Every ring is allocated once and parked. A ripple fires on a drip impact - which is a beat
 * the player is already watching - and allocating geometry on that frame is allocating at
 * exactly the wrong moment. When the pool is exhausted the oldest ring is recycled rather
 * than a new one made, so a burst of impacts degrades by dropping the faintest ripple
 * instead of by stuttering.
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { createRng, range, seedFrom } from '../core/rng.js';

export interface RippleField {
  root: ENGINE.SceneNode;
  /** Advance every live ring. Register as a prop idle. */
  idle: (deltaTime: number) => void;
  /** Start a ring at a point on the surface. `strength` scales how far it gets. */
  splash: (x: number, z: number, strength?: number) => void;
}

export interface RippleOptions {
  /** The water's surface height. Rings sit a hair above it. */
  level: number;
  /** The area ambient rings may appear in: [minX, maxX, minZ, maxZ]. */
  bounds: [number, number, number, number];
  /**
   * Seconds between unprompted rings, on average. These are what keep the surface alive
   * between drips - a flood is fed from more places than the four you can see.
   */
  every?: number;
  color?: string;
  /** How many can be live at once. */
  pool?: number;
  seed?: string;
}

/** A ring's whole life, in seconds. Long enough to read, short enough not to queue up. */
const LIFE = 2.6;
/** Metres a full-strength ring reaches before it dies. */
const REACH = 0.62;

export function createRipples(options: RippleOptions): RippleField {
  const rng = createRng(seedFrom(options.seed ?? 'ripples'));
  const count = options.pool ?? 14;
  const [minX, maxX, minZ, maxZ] = options.bounds;

  const root = ENGINE.SceneNode.create({ name: 'Ripples' });

  interface Ring {
    mesh: THREE.Mesh;
    material: THREE.MeshBasicMaterial;
    /** Seconds since it started, or LIFE once it is dead and available. */
    age: number;
    strength: number;
  }

  const rings: Ring[] = [];
  /*
   * Unit radius, so a ring's size is entirely its scale - one geometry shared by the pool,
   * and expanding it costs a matrix rather than a buffer upload.
   *
   * The band is thin relative to the radius (0.93 to 1.0) because a fat ring is a disc with
   * a hole in it. What the eye reads as a ripple is a LINE moving outward.
   */
  const geometry = new THREE.RingGeometry(0.93, 1, 28);
  geometry.rotateX(-Math.PI / 2);

  for (let i = 0; i < count; i++) {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(options.color ?? '#a9c6d2'),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.position.y = options.level + 0.004;
    root.add(mesh);
    rings.push({ mesh, material, age: LIFE, strength: 1 });
  }

  /** The oldest live ring, for when everything is busy. Its loss is the least visible. */
  const oldest = (): Ring => rings.reduce((a, b) => (a.age > b.age ? a : b));

  const splash = (x: number, z: number, strength = 1): void => {
    const ring = rings.find((r) => r.age >= LIFE) ?? oldest();
    ring.age = 0;
    ring.strength = strength;
    ring.mesh.position.set(x, options.level + 0.004, z);
    ring.mesh.visible = true;
  };

  let nextAmbient = range(rng, 0.4, options.every ?? 2.4);

  const idle = (deltaTime: number): void => {
    nextAmbient -= deltaTime;
    if (nextAmbient <= 0) {
      nextAmbient = range(rng, 0.5, (options.every ?? 2.4) * 1.6);
      // Weaker than a drip's, because these have no visible cause and a big ring with
      // nothing above it reads as something having been dropped in off-camera.
      splash(range(rng, minX, maxX), range(rng, minZ, maxZ), range(rng, 0.45, 0.8));
    }

    for (const ring of rings) {
      if (ring.age >= LIFE) continue;
      ring.age += deltaTime;
      if (ring.age >= LIFE) {
        ring.mesh.visible = false;
        ring.material.opacity = 0;
        continue;
      }
      const t = ring.age / LIFE;
      /*
       * Fast out of the impact and slowing - a wave front loses speed as it spreads, and a
       * ring expanding at a constant rate is a target reticle.
       */
      const radius = REACH * ring.strength * (1 - (1 - t) ** 2);
      ring.mesh.scale.set(radius, 1, radius);
      /*
       * Up hard, then away. The opacity peaks a fifth of the way through rather than at
       * the start, because a ring that is brightest when it is smallest flashes - the
       * impact should bloom outward, not blink.
       */
      const rise = Math.min(1, t / 0.18);
      ring.material.opacity = 0.5 * ring.strength * rise * (1 - t) ** 1.6;
    }
  };

  return { root, idle, splash };
}
