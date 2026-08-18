/**
 * The things in a field that are alive and are not the point.
 *
 * ## Why a scene needs these
 *
 * Adaeze's smallholding has a sun, a sea, a shelf of turquoise water, weather overhead and
 * a person standing in it, and it still read as a diorama - because every single thing in
 * it was either still or moving on a loop the player could time. Grass sways, clouds
 * drift, and both are ENVIRONMENT: they move the way scenery moves, evenly and forever.
 *
 * What a real field has that this did not is INDEPENDENT AGENTS - things going somewhere
 * for their own reasons, at their own speed, that were doing it before you arrived. Two
 * birds on a thermal and a cloud of flies over the beds cost almost nothing and do the one
 * job nothing else in the scene can: they make the place look like it does not need you.
 *
 * ## Why they are this cheap
 *
 * Both are one draw call and no per-frame allocation. The birds are eight triangles each
 * and the motes are a Points cloud, and both are driven by writing into buffers that were
 * sized once. Anything more would be spending a frame budget on the least important thing
 * on screen, which is exactly the wrong place to spend it - these have to be free or they
 * should not exist.
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { createRng, range, seedFrom } from '../core/rng.js';

export interface Flock {
  root: ENGINE.SceneNode;
  /** Advance the birds. Register as a prop idle. */
  idle: (deltaTime: number) => void;
}

export interface BirdOptions {
  /** Centre of the circuit they are riding. */
  at: THREE.Vector3;
  count?: number;
  /** How wide a circle each one keeps, before its own variation. */
  radius?: number;
  seed?: string;
  /** Silhouette colour. They are always against the sky, so this is nearly black. */
  color?: string;
}

/**
 * Birds, high up and going round.
 *
 * ## Silhouettes, not models
 *
 * A bird at sixty metres is four pixels and a shape. Modelling one is spending geometry on
 * something the eye resolves as a dash with a kink in it - so each is two triangles that
 * meet at the body, which is precisely the shape everybody draws when asked to draw a bird
 * because it is what a bird at distance actually looks like.
 *
 * ## The flap is the whole illusion
 *
 * A dash moving across a sky is a dash. The same dash changing its dihedral as it goes is
 * a bird, and nothing else about it has to be right. Each wing pivots about the body, out
 * of phase with the other bird's, and the rate varies with where it is in its circuit -
 * they beat harder climbing and set their wings coming down, which is the one behaviour
 * everybody has watched a gull do without noticing they were watching it.
 */
export function createBirds(options: BirdOptions): Flock {
  const at = options.at;
  const count = options.count ?? 3;
  const radius = options.radius ?? 14;
  const rng = createRng(seedFrom(options.seed ?? 'birds'));

  const root = ENGINE.SceneNode.create({ name: 'Birds', position: at.clone() });

  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(options.color ?? '#2f3a42'),
    side: THREE.DoubleSide,
    // Unlit and unfogged, like everything else that lives against this sky. A bird lit by
    // the scene's key would be a bright speck; a bird is a hole in the sky.
    fog: false,
    toneMapped: false,
  });

  interface Bird {
    wings: THREE.Mesh;
    /** Where it is round its circuit, and how fast. */
    phase: number;
    speed: number;
    radius: number;
    height: number;
    /** Its own wingbeat clock, so three birds never flap together. */
    beat: number;
    beatRate: number;
  }

  const birds: Bird[] = [];

  for (let i = 0; i < count; i++) {
    /*
     * One geometry per bird, because the flap is written into its vertices.
     *
     * Two triangles sharing the body edge: left wing, right wing. Positions are rewritten
     * every frame, which is six vertices per bird - cheaper than a skeleton, a shader or a
     * texture atlas, and it is the only thing that has to move.
     */
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(18), 3));
    const wings = new THREE.Mesh(geometry, material);
    wings.frustumCulled = false;
    root.add(wings);

    birds.push({
      wings,
      phase: range(rng, 0, Math.PI * 2),
      // Signed, so not all of them go round the same way.
      speed: range(rng, 0.055, 0.1) * (rng() > 0.5 ? 1 : -1),
      radius: radius * range(rng, 0.7, 1.25),
      height: range(rng, 9, 15),
      beat: range(rng, 0, Math.PI * 2),
      beatRate: range(rng, 5.5, 7.5),
    });
  }

  const span = 0.55;
  const idle = (deltaTime: number): void => {
    for (const bird of birds) {
      bird.phase += bird.speed * deltaTime;

      const x = Math.cos(bird.phase) * bird.radius;
      const z = Math.sin(bird.phase) * bird.radius;
      // Riding up and down the circuit rather than holding one altitude, because a bird on
      // a thermal is climbing somewhere and sinking somewhere else.
      const climb = Math.sin(bird.phase * 2 + 0.7);
      const y = bird.height + climb * 1.6;

      /*
       * Beating harder on the way up, setting the wings on the way down.
       *
       * `climb` is the vertical rate, so this ties the effort to what the bird is doing -
       * and the amplitude going with it means a gliding bird is nearly a straight line,
       * which is the read that says "not flapping" without stopping the animation.
       */
      bird.beat += bird.beatRate * (0.55 + 0.45 * Math.max(0, climb)) * deltaTime;
      const dihedral = Math.sin(bird.beat) * (0.16 + 0.24 * Math.max(0, climb));

      // Heading is the tangent to the circle, which is what it should be facing.
      const heading = bird.phase + (bird.speed > 0 ? Math.PI / 2 : -Math.PI / 2);
      const ax = Math.cos(heading);
      const az = Math.sin(heading);
      // Across the body, perpendicular to the heading, on the ground plane.
      const bx = -az;
      const bz = ax;

      const positions = bird.wings.geometry.getAttribute('position') as THREE.BufferAttribute;
      const array = positions.array as Float32Array;
      // Body: a short spine along the heading, which stops the two wings reading as a bowtie.
      const nose = [x + ax * 0.16, y, z + az * 0.16];
      const tail = [x - ax * 0.2, y, z - az * 0.2];
      const tipY = y + dihedral;
      const left = [x + bx * span, tipY, z + bz * span];
      const right = [x - bx * span, tipY, z - bz * span];

      array.set([...nose, ...tail, ...left], 0);
      array.set([...nose, ...tail, ...right], 9);
      positions.needsUpdate = true;
    }
  };

  return { root, idle };
}

export interface MoteOptions {
  at: THREE.Vector3;
  /** The box they mill about in. */
  size: THREE.Vector3;
  count?: number;
  seed?: string;
  color?: string;
  /** Point size in pixels. These are insects; two is generous. */
  scale?: number;
}

/**
 * A cloud of flies over the beds.
 *
 * ## Brownian, not orbital
 *
 * The obvious version gives each mote a little circular path, and it looks like a screen
 * saver: a dozen things all doing the same tidy loop at different offsets. Insects do not
 * do that. They hold a rough station and jitter around it in bursts, changing direction for
 * no reason a watcher can see, which is a completely different silhouette in motion.
 *
 * So each has a HOME it is loosely sprung to and a velocity that gets a random kick each
 * frame. The spring is what stops them dispersing, the kick is what stops them looking
 * planned, and the ratio between the two is the whole character: too much spring and they
 * are pendulums, too little and the cloud drifts off across the field.
 *
 * They are drawn as `Points` with `sizeAttenuation` on, so a fly is bigger when the mower
 * drives past it. That is the only reason they read as being IN the world rather than on
 * the lens.
 */
export function createMotes(options: MoteOptions): Flock {
  const count = options.count ?? 40;
  const rng = createRng(seedFrom(options.seed ?? 'motes'));
  const half = options.size.clone().multiplyScalar(0.5);

  const home = new Float32Array(count * 3);
  const velocity = new Float32Array(count * 3);
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    home[i * 3] = range(rng, -half.x, half.x);
    home[i * 3 + 1] = range(rng, 0, options.size.y);
    home[i * 3 + 2] = range(rng, -half.z, half.z);
    positions.set([home[i * 3], home[i * 3 + 1], home[i * 3 + 2]], i * 3);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: new THREE.Color(options.color ?? '#2e2a1e'),
      size: options.scale ?? 0.035,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    })
  );
  points.frustumCulled = false;

  const root = ENGINE.SceneNode.create({ name: 'Motes', position: options.at.clone() });
  root.add(points);

  const attribute = geometry.getAttribute('position') as THREE.BufferAttribute;

  const idle = (deltaTime: number): void => {
    // Clamped, because a stalled frame with a random walk in it scatters the cloud across
    // the field and it never comes back.
    const step = Math.min(deltaTime, 0.05);
    for (let i = 0; i < count; i++) {
      const o = i * 3;
      for (let axis = 0; axis < 3; axis++) {
        const k = o + axis;
        // The kick, and a spring home. Vertical is damped harder - flies hold a height.
        velocity[k] += (rng() - 0.5) * (axis === 1 ? 1.6 : 3.2) * step;
        velocity[k] += (home[k] - positions[k]) * (axis === 1 ? 5.5 : 2.2) * step;
        velocity[k] *= 1 - Math.min(0.9, 2.6 * step);
        positions[k] += velocity[k] * step;
      }
    }
    attribute.needsUpdate = true;
  };

  return { root, idle };
}
