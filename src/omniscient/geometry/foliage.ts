/**
 * Plants.
 *
 * The jam theme is Overgrown, and this is the only place in the game where something is
 * literally overgrown - so it does not get to be seven boxes at random angles. The rhyme
 * matters: a real plant escaping its pot and colonising the desk, next to a machine
 * growing a circuit tree across its own screen. Same behaviour, two substrates.
 *
 * §186 wants big shapes first. A plant's big shape is its SILHOUETTE - a fountain of
 * arcing blades - so the blades are built along arcs rather than scattered, and the
 * two-value split (lit face, shaded mass) does the rest. §187: no texture, value only.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { jitter, range } from '../core/rng.js';

import type { Rng } from '../core/rng.js';
import type { MAT } from '../art/palette.js';

export interface FoliagePart {
  geometry: THREE.BufferGeometry;
  material: keyof typeof MAT;
}

/**
 * One leaf blade: a pointed ellipse, extruded thin.
 *
 * Built lying in XY with the base at the origin and the tip at +Y, so callers can bend
 * and place it by rotation without unpicking the shape.
 */
function leafBlade(length: number, width: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  // Out to the widest point a third of the way up, then taper to a point.
  shape.quadraticCurveTo(width, length * 0.34, width * 0.16, length);
  shape.quadraticCurveTo(-width, length * 0.34, 0, 0);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.004,
    bevelEnabled: false,
    curveSegments: 4,
  });
  geometry.translate(0, 0, -0.002);
  return geometry;
}

/**
 * Bend a blade along its length so it arcs over instead of standing straight.
 *
 * Straight blades read as spikes. The droop is what makes it a plant. Applied as a
 * per-vertex rotation about X that grows with height, which is cheap and good enough at
 * this scale - nobody is inspecting the curvature of a desk plant.
 */
function droop(geometry: THREE.BufferGeometry, amount: number, length: number): void {
  const position = geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    const z = position.getZ(i);
    const t = Math.min(1, Math.max(0, y / length));
    const angle = amount * t * t;
    position.setY(i, y * Math.cos(angle) - z * Math.sin(angle));
    position.setZ(i, y * Math.sin(angle) + z * Math.cos(angle));
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
}

export interface ClumpOptions {
  /** Number of blades. Below about eight it reads as a handful of leaves, not a plant. */
  count?: number;
  /** Blade length range. */
  length?: [number, number];
  /** How far the outer blades arc over, in radians. */
  droop?: [number, number];
  /** Radius the blades fan out from. */
  spread?: number;
}

/**
 * A fountain of blades rising from a point and arcing outward.
 *
 * Returns two parts, lit and shaded. The split is by height rather than at random: the
 * blades that arc lowest are the ones buried in the mass, so they take the deep value and
 * the silhouette keeps a clean lit edge.
 */
export function createClump(rng: Rng, options: ClumpOptions = {}): FoliagePart[] {
  const count = options.count ?? 14;
  const [minLength, maxLength] = options.length ?? [0.14, 0.3];
  const [minDroop, maxDroop] = options.droop ?? [0.4, 1.5];
  const spread = options.spread ?? 0.03;

  const lit: THREE.BufferGeometry[] = [];
  const shaded: THREE.BufferGeometry[] = [];

  for (let i = 0; i < count; i++) {
    const length = range(rng, minLength, maxLength);
    const bend = range(rng, minDroop, maxDroop);
    const blade = leafBlade(length, range(rng, 0.014, 0.026));
    droop(blade, bend, length);

    // Fan the blades around the pot rather than at random, so no two crowd the same gap.
    const around = (i / count) * Math.PI * 2 + jitter(rng, 0.28);
    blade.rotateZ(jitter(rng, 0.12));
    blade.rotateY(around);
    blade.translate(Math.cos(around) * spread, 0, Math.sin(around) * spread);

    // The steeply arcing blades are the ones that fall into the body of the plant.
    (bend > (minDroop + maxDroop) * 0.55 ? shaded : lit).push(blade);
  }

  const parts: FoliagePart[] = [];
  if (lit.length) parts.push({ geometry: mergeGeometries(lit, false) ?? lit[0], material: 'leaf' });
  if (shaded.length) {
    parts.push({ geometry: mergeGeometries(shaded, false) ?? shaded[0], material: 'leafDeep' });
  }
  return parts;
}

export interface VineOptions {
  /** World-space path the vine follows. Three or more points. */
  path: THREE.Vector3[];
  /** Leaves along the run. */
  leaves?: number;
  /** Stem thickness. */
  thickness?: number;
}

/**
 * A runner that has left the pot and gone somewhere it was not planted.
 *
 * This is the theme, stated in one prop: the plant is not contained. Given a path over the
 * desk edge or along a wall, it lays a stem and hangs leaves off it.
 */
export function createVine(rng: Rng, options: VineOptions): FoliagePart[] {
  const { path } = options;
  if (path.length < 2) return [];

  const leafCount = options.leaves ?? 9;
  const thickness = options.thickness ?? 0.008;
  const curve = new THREE.CatmullRomCurve3(path);

  const stem = new THREE.TubeGeometry(curve, 28, thickness, 5, false);

  const lit: THREE.BufferGeometry[] = [];
  const shaded: THREE.BufferGeometry[] = [];

  for (let i = 0; i < leafCount; i++) {
    // Skip the very ends - leaves at the origin look like they grew out of the pot rim.
    const t = 0.1 + (i / leafCount) * 0.85;
    const at = curve.getPointAt(Math.min(1, t));
    const length = range(rng, 0.035, 0.075);

    const blade = leafBlade(length, range(rng, 0.008, 0.015));
    droop(blade, range(rng, 0.5, 1.2), length);
    // Alternate sides the way most runners actually put out leaves.
    blade.rotateZ((i % 2 === 0 ? 1 : -1) * range(rng, 0.6, 1.4));
    blade.rotateY(range(rng, 0, Math.PI * 2));
    blade.translate(at.x, at.y, at.z);

    (i % 3 === 0 ? shaded : lit).push(blade);
  }

  const parts: FoliagePart[] = [{ geometry: stem, material: 'stem' }];
  if (lit.length) parts.push({ geometry: mergeGeometries(lit, false) ?? lit[0], material: 'leaf' });
  if (shaded.length) {
    parts.push({ geometry: mergeGeometries(shaded, false) ?? shaded[0], material: 'leafDeep' });
  }
  return parts;
}
