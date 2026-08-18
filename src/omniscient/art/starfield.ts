/**
 * Stars, for the two rooms that happen at night.
 *
 * The hemisphere light on the mast has carried a note since it was written saying it is
 * "the difference between a night with stars in it and a black hole with objects in it",
 * and there were no stars in the game. Nowhere. Both night rooms have a sky that is a flat
 * dark field, and on the mast that field is most of the frame - a headland at sea level
 * with a mast up the middle, so above the horizon there is nothing to look at at all.
 *
 * Tomas's own evidence asks for them. His weather hint is "Clear sky all day. No storm, no
 * wind, no spray off the sea" - the player is being told to rule the weather out, and the
 * cheapest way to make that land is a sky they can see is clear.
 *
 * ## What makes a drawn night sky look like a night sky
 *
 * 1. **Magnitude, heavily skewed.** A real sky is overwhelmingly faint stars with a
 *    handful of bright ones. An even scatter reads as noise or as a screen-door; the few
 *    bright ones are what the eye anchors on and what makes the rest read as distance.
 * 2. **Extinction at the horizon.** Low stars shine through far more atmosphere and are
 *    dimmer and sparser. This is the single cue that stops a star dome reading as a
 *    sphere with dots on it, because it tells you where the ground is.
 * 3. **Colour, but barely.** Stars are not white. They run blue-white to amber, and at
 *    this size the difference is a couple of points of saturation - enough to break up a
 *    field of identical pixels, not enough to notice as colour.
 * 4. **No twinkle.** Cheap to add and wrong: scintillation is an atmospheric effect at
 *    arc-second scale, and on a screen it reads as fireflies. A still sky over a moving
 *    world is what actually feels like standing outside at night.
 *
 * Three layers rather than one, because `PointsMaterial` carries a single size and a
 * single opacity - so magnitude is expressed as three passes over the same distribution
 * rather than as a per-vertex attribute, which would need a custom shader for one number.
 */

import * as THREE from 'three';

import { createRng, seedFrom } from '../core/rng.js';

export interface StarfieldOptions {
  /** How far out the dome sits. Must be inside the camera's far plane and outside everything else. */
  radius?: number;
  /** Stars in the faintest layer. The other two are derived from it. */
  count?: number;
  seed?: string;
  /** Overall brightness, for a room that wants more or less sky than the mast. */
  strength?: number;
  /**
   * Elevation below which stars stop, in radians.
   *
   * Not zero: the sea and the headland cut off the bottom of the sky anyway, and stars
   * drawn under the horizon are stars drawn inside the world.
   */
  floor?: number;
}

/** Blue-white through to amber. See note 3 - this is deliberately a narrow range. */
const TINTS = [
  new THREE.Color('#cfe0ff'),
  new THREE.Color('#e8eeff'),
  new THREE.Color('#ffffff'),
  new THREE.Color('#fff2dc'),
  new THREE.Color('#ffd9a8'),
];

interface Layer {
  /** Share of `count` in this layer. */
  share: number;
  size: number;
  opacity: number;
}

/*
 * Many faint, few bright, and the brightest are 3% of the sky. See note 1: the skew IS
 * the effect, and an even split across three sizes looks like three grids laid over each
 * other rather than like a sky.
 */
const LAYERS: Layer[] = [
  { share: 1, size: 0.9, opacity: 0.45 },
  { share: 0.24, size: 1.5, opacity: 0.7 },
  { share: 0.03, size: 2.6, opacity: 0.95 },
];

/**
 * Build a star dome.
 *
 * Returned as a plain Object3D for the caller to place and register. Deterministic from
 * the seed, so a room has the same sky every time it is opened - a night that reshuffles
 * itself between two visits to the same headland is worse than no stars at all.
 */
export function createStarfield(options: StarfieldOptions = {}): THREE.Object3D {
  const radius = options.radius ?? 90;
  const count = options.count ?? 900;
  const strength = options.strength ?? 1;
  const floor = options.floor ?? 0.03;
  const rng = createRng(seedFrom(options.seed ?? 'starfield'));

  const dome = new THREE.Object3D();
  dome.name = 'Starfield';

  for (const layer of LAYERS) {
    const n = Math.max(1, Math.round(count * layer.share));
    const positions = new Float32Array(n * 3);
    const colours = new Float32Array(n * 3);
    let kept = 0;

    for (let i = 0; i < n; i++) {
      /*
       * Uniform on the sphere, not uniform in the angles.
       *
       * Picking elevation evenly bunches stars at the zenith, which is the classic tell -
       * a dome with a bald horizon and a knot directly overhead. Taking the SINE of the
       * elevation evenly is what spreads them by area.
       */
      const azimuth = rng() * Math.PI * 2;
      const elevation = Math.asin(floor + rng() * (1 - floor));

      // 2: thin them out low down, where the air is thickest.
      const low = Math.sin(elevation);
      if (rng() > 0.25 + 0.75 * low) continue;

      const r = Math.cos(elevation) * radius;
      positions[kept * 3] = Math.cos(azimuth) * r;
      positions[kept * 3 + 1] = Math.sin(elevation) * radius;
      positions[kept * 3 + 2] = Math.sin(azimuth) * r;

      // 3: a tint, and dimmed toward the horizon along with everything else.
      const tint = TINTS[Math.floor(rng() * TINTS.length)];
      const dim = (0.45 + 0.55 * low) * (0.6 + 0.4 * rng()) * strength;
      colours[kept * 3] = tint.r * dim;
      colours[kept * 3 + 1] = tint.g * dim;
      colours[kept * 3 + 2] = tint.b * dim;
      kept += 1;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions.subarray(0, kept * 3), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colours.subarray(0, kept * 3), 3));

    const points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: layer.size,
        // Constant on screen. A star is a point source; it does not get bigger when the
        // camera moves toward it, and with attenuation on, the dome's radius would end up
        // being a brightness control.
        sizeAttenuation: false,
        vertexColors: true,
        transparent: true,
        opacity: layer.opacity,
        depthWrite: false,
        // Unlit and unfogged. The sky is not in the world's air, it is behind all of it.
        fog: false,
        toneMapped: false,
      })
    );
    points.name = `Stars${Math.round(layer.size * 10)}`;
    // Behind everything, always. The dome is inside the far plane but nothing should ever
    // sort in front of a star by accident.
    points.renderOrder = -10;
    dome.add(points);
  }

  return dome;
}
