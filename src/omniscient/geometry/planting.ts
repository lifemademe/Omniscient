/**
 * Modelled plants, scattered by rule and drawn as instances.
 *
 * ## Why these are not procedural, when nearly everything else is
 *
 * The generated grass in outdoors.ts is tufts of tapered cylinders. That was the right call
 * when there was nothing else, and it still is at distance, where a tuft is a silhouette and
 * a silhouette is all that reads. Up close it is not: a blade of grass has a taper, a fold,
 * a curl and a colour ramp along its length, and none of those are things I can hand-author
 * competitively against a modelled asset. Spending a day trying would land somewhere worse
 * than the file already on disk.
 *
 * So the split is by DISTANCE and by cost, not by principle. Modelled plants where the
 * camera can see one, generated tufts filling the field behind them.
 *
 * ## Why instanced
 *
 * A field wants hundreds of plants, and hundreds of ModelMeshNodes would be hundreds of
 * draw calls for 300-600 triangles each - all overhead, no picture. `InstancedModelMeshNode`
 * draws the whole scatter in one call per material, which is what makes "hundreds" a
 * reasonable number to ask for rather than a performance decision disguised as art
 * direction.
 *
 * ## Why scattering is a rule rather than a list
 *
 * §123: deterministic from a seeded rng, so the field is the same field every run. But more
 * than that - a scatter that takes a KEEP-OUT set describes the smallholding rather than
 * decorating it. Nothing grows where somebody walks, nothing grows in a worked bed, and the
 * bare ground around the beds is not an absence of grass, it is the evidence that a person
 * is out here every day.
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { range } from '../core/rng.js';

import type { Rng } from '../core/rng.js';

/** Somewhere nothing is planted: a path, a bed, a doorway. */
export interface KeepOut {
  centre: THREE.Vector3;
  radius: number;
}

export interface ScatterOptions {
  /** Model to instance, e.g. '@project/assets/models/Plants/SM_WildGrass_01.glb'. */
  modelUrl: string;
  /** Centre of the patch, and how far it runs in each direction. */
  at: THREE.Vector3;
  width: number;
  depth: number;
  count: number;
  /** Uniform scale range. Plants of one species are not all the same size. */
  scale?: [number, number];
  /** Places nothing is planted. */
  clear?: KeepOut[];
  /** Tilt range in radians - a plant leaning is a plant that grew, not one that was placed. */
  lean?: number;
  /** Ground height. */
  y?: number;
}

/**
 * One species, scattered over a patch, as a single instanced node.
 *
 * Rotation is random about Y on every instance, which matters more than it sounds: a
 * modelled plant has a front, and a hundred of them facing the same way reads instantly as
 * one asset repeated rather than as a hundred plants.
 */
export function scatter(rng: Rng, options: ScatterOptions): ENGINE.InstancedModelMeshNode {
  const { at, width, depth, count } = options;
  const [small, big] = options.scale ?? [0.85, 1.25];
  const lean = options.lean ?? 0.08;
  const y = options.y ?? at.y;

  const instances: Array<{ position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3 }> =
    [];

  /**
   * Rejected rather than nudged.
   *
   * A plant that lands in a keep-out zone is dropped, not pushed to the edge of it - pushing
   * piles them into a ring around every path, which is a shape no field has ever had. The
   * count is therefore an upper bound and the patch is a little sparser near what it avoids,
   * which is exactly right.
   */
  let guard = 0;
  while (instances.length < count && guard < count * 6) {
    guard++;
    const position = new THREE.Vector3(
      at.x + range(rng, -width / 2, width / 2),
      y,
      at.z + range(rng, -depth / 2, depth / 2)
    );
    if (options.clear?.some((zone) => position.distanceTo(zone.centre) < zone.radius)) continue;

    const size = range(rng, small, big);
    instances.push({
      position,
      rotation: new THREE.Euler(range(rng, -lean, lean), range(rng, 0, Math.PI * 2), range(rng, -lean, lean)),
      scale: new THREE.Vector3(size, range(rng, small, big), size),
    });
  }

  const node = ENGINE.InstancedModelMeshNode.create({
    name: 'Scatter',
    modelUrl: options.modelUrl,
    maxInstances: Math.max(1, instances.length),
  });
  node.instances = instances;
  return node;
}

export interface RowsOptions {
  modelUrl: string;
  /** Corner the block starts from. */
  at: THREE.Vector3;
  rows: number;
  perRow: number;
  rowGap: number;
  plantGap: number;
  scale?: [number, number];
  /** Radians. The whole block turns, so it can follow a field boundary. */
  turn?: number;
}

/**
 * A planted block - rows, spacing, and a person's imperfection.
 *
 * Crops in a field are the one place regularity is the point: somebody set that spacing out
 * with a line and a stick, and the rows are the evidence of the work. So this is a grid
 * rather than a scatter, and the jitter is deliberately small - enough that no two plants
 * are identical, not so much that the rows stop reading as rows.
 *
 * That regularity is also what makes it CONTRAST with the wild grass around it, which is
 * the actual job: a smallholding is a worked rectangle in the middle of things growing
 * however they like.
 */
export function rows(rng: Rng, options: RowsOptions): ENGINE.InstancedModelMeshNode {
  const { at, rows: rowCount, perRow, rowGap, plantGap } = options;
  const [small, big] = options.scale ?? [0.9, 1.15];
  const turn = options.turn ?? 0;

  const instances: Array<{ position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3 }> =
    [];
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);

  for (let r = 0; r < rowCount; r++) {
    for (let i = 0; i < perRow; i++) {
      // Along the row, then across it, then turned as a block.
      const along = i * plantGap + range(rng, -0.03, 0.03);
      const across = r * rowGap + range(rng, -0.03, 0.03);
      const size = range(rng, small, big);
      instances.push({
        position: new THREE.Vector3(
          at.x + along * cos - across * sin,
          at.y,
          at.z + along * sin + across * cos
        ),
        rotation: new THREE.Euler(0, range(rng, 0, Math.PI * 2), 0),
        scale: new THREE.Vector3(size, range(rng, small, big), size),
      });
    }
  }

  const node = ENGINE.InstancedModelMeshNode.create({
    name: 'Rows',
    modelUrl: options.modelUrl,
    maxInstances: Math.max(1, instances.length),
  });
  node.instances = instances;
  return node;
}
