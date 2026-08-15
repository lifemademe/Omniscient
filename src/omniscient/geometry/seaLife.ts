/**
 * Things moving outside the window.
 *
 * ## Why this exists
 *
 * The view through the window is three flat silhouettes and a run of roofs, and it is a
 * good static image. That is the problem: it is a static image. The player spends more
 * time looking at this room than at any diorama - it is the menu, it is the home shot
 * between requests, it is where the whole game returns - and a view that never changes
 * stops being a view within about ten seconds and becomes a poster on a wall.
 *
 * Nothing here carries information and nothing here is interactive. That is deliberate.
 * §131 asks the environment to carry evidence, and every other surface in this project
 * does; this is the one place whose entire job is to say that the world outside the room
 * exists and is not waiting for the player. A gull crosses whether or not anybody is
 * answering a call.
 *
 * ## How it stays cheap
 *
 * Everything is an unlit quad on the same plane as the view silhouettes, drifting in x.
 * The window aperture in the wall does the clipping for free - a gull that has flown past
 * the jamb is simply behind the wall - so there is no masking, no scissor, no extra pass.
 * Six quads and a sine.
 */

import * as THREE from 'three';

import { createRng, jitter, range, seedFrom } from '../core/rng.js';

/** A thing that moves across the view, and the state it needs to keep. */
interface Drifter {
  node: THREE.Object3D;
  /** Units per second in x. Negative goes left. */
  speed: number;
  /** Wraps to the far side outside this range. */
  from: number;
  to: number;
  /** Vertical wander, in units and radians per second. */
  bob: number;
  bobRate: number;
  phase: number;
  baseY: number;
}

export interface SeaLife {
  /** Parent for everything. Add this to the room. */
  root: THREE.Object3D;
  /** Drive from the rig's tick. */
  update: (deltaTime: number) => void;
}

/**
 * Build the life outside the window.
 *
 * `bounds` is the window aperture in room space, and things wrap a little outside it so
 * nothing is ever seen popping into existence against the glass.
 */
export function createSeaLife(bounds: {
  x: number;
  width: number;
  sill: number;
  head: number;
  /** Plane the view silhouettes sit on. Everything here goes just in front of it. */
  z: number;
  /** Height of the waterline in room space. */
  horizonY: number;
}): SeaLife {
  const rng = createRng(seedFrom('outside-the-window'));
  const root = new THREE.Object3D();
  root.name = 'SeaLife';
  const drifters: Drifter[] = [];

  const left = bounds.x - bounds.width / 2;
  const right = bounds.x + bounds.width / 2;
  const span = bounds.width;

  /**
   * Gulls.
   *
   * Two triangles each, joined at the body, with a shallow droop - the shape a gull makes
   * from a distance is a shallow W and nothing else, and at this size any attempt at a
   * body reads as a smudge. They are DARK rather than white: against a blown-out sky a
   * white bird is invisible, and every bird anybody has ever seen against a bright sky
   * was a silhouette.
   */
  const gullMaterial = new THREE.MeshBasicMaterial({
    color: '#5d6470',
    toneMapped: false,
    fog: false,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
  });

  for (let i = 0; i < 4; i++) {
    const scale = range(rng, 0.008, 0.016);
    const gull = new THREE.Object3D();

    for (const side of [-1, 1] as const) {
      const wing = new THREE.Shape();
      wing.moveTo(0, 0);
      wing.lineTo(side * 2.4, 0.75);
      wing.lineTo(side * 2.5, 0.55);
      wing.lineTo(side * 0.25, -0.2);
      wing.closePath();
      const mesh = new THREE.Mesh(new THREE.ShapeGeometry(wing), gullMaterial);
      mesh.scale.setScalar(scale);
      gull.add(mesh);
    }

    /**
     * Higher birds are further away, so they are smaller and slower.
     *
     * The only parallax cue available on a flat plane, and it is enough: four gulls at one
     * speed read as a decal scrolling, and four at speeds that correlate with size read as
     * four birds at four distances.
     */
    const height = range(rng, 0.22, 0.85);
    const y = bounds.horizonY + (bounds.head - bounds.horizonY) * height;

    gull.position.set(range(rng, left, right), y, bounds.z + 0.004 + i * 0.001);
    root.add(gull);

    drifters.push({
      node: gull,
      speed: (rng() < 0.5 ? -1 : 1) * range(rng, 0.012, 0.03) * (scale / 0.012),
      from: left - span * 0.25,
      to: right + span * 0.25,
      bob: range(rng, 0.004, 0.011),
      bobRate: range(rng, 0.5, 1.1),
      phase: range(rng, 0, Math.PI * 2),
      baseY: y,
    });
  }

  /**
   * A boat on the water, and why it is worth more than the gulls.
   *
   * The gulls say the air outside is not a painting. The boat says something slower and
   * better suited to this game: it takes about four minutes to cross the aperture, which
   * means a player who notices it at all notices it because they have been sitting here
   * long enough for it to have MOVED. That is the only thing in the room that measures
   * how long the player has been in it, and it does so without a clock, a counter or a
   * word.
   *
   * Hull, wheelhouse, mast. Three quads, at the town's value so it belongs to the same
   * distance the roofs do.
   */
  const boatMaterial = new THREE.MeshBasicMaterial({
    color: '#4a545c',
    toneMapped: false,
    fog: false,
  });

  const boat = new THREE.Object3D();
  const hull = new THREE.Shape();
  hull.moveTo(-0.055, 0);
  hull.lineTo(0.055, 0);
  hull.lineTo(0.04, 0.016);
  hull.lineTo(-0.045, 0.016);
  hull.closePath();
  boat.add(new THREE.Mesh(new THREE.ShapeGeometry(hull), boatMaterial));

  const house = new THREE.PlaneGeometry(0.028, 0.018);
  house.translate(-0.006, 0.025, 0);
  boat.add(new THREE.Mesh(house, boatMaterial));

  const mastGeometry = new THREE.PlaneGeometry(0.004, 0.05);
  mastGeometry.translate(0.02, 0.041, 0);
  boat.add(new THREE.Mesh(mastGeometry, boatMaterial));

  // Just below the waterline, so the hull sits IN the sea rather than on top of it.
  boat.position.set(left, bounds.horizonY - 0.004, bounds.z + 0.002);
  root.add(boat);

  drifters.push({
    node: boat,
    // ~4 minutes to cross. Slow enough to be missed, which is the point.
    speed: span / 240,
    from: left - span * 0.3,
    to: right + span * 0.3,
    // A boat on a calm harbour barely moves; this is a swell, not a storm.
    bob: 0.0016,
    bobRate: 0.35,
    phase: jitter(rng, 3),
    baseY: bounds.horizonY - 0.004,
  });

  let elapsed = 0;

  return {
    root,
    update: (deltaTime: number): void => {
      elapsed += deltaTime;
      for (const d of drifters) {
        d.node.position.x += d.speed * deltaTime;
        if (d.speed > 0 && d.node.position.x > d.to) d.node.position.x = d.from;
        if (d.speed < 0 && d.node.position.x < d.from) d.node.position.x = d.to;
        d.node.position.y = d.baseY + Math.sin(elapsed * d.bobRate + d.phase) * d.bob;
      }
    },
  };
}
