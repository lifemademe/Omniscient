/**
 * Mesh construction helpers.
 *
 * Everything OMNISCIENT_ renders is scenery: dioramas the player looks at through a
 * camera, and menu hardware they point at. Nothing collides with anything. MeshNode
 * defaults to building a convex-hull collider per mesh, which is pure cost here - and
 * worse, a flat or degenerate geometry (a label plane, a tube whose control points
 * coincide) makes collider creation throw and takes the whole game loop down with it.
 *
 * So: one helper, physics off, used for everything.
 */

import * as ENGINE from '@gnsx/genesys.js';

import type * as THREE from 'three';

const NO_PHYSICS = { enabled: false } as const;

/**
 * A named, non-colliding mesh.
 *
 * The name is applied after construction because the editor's default-subobject lint
 * requires a string literal at the create() call site.
 */
export function decorMesh(
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material
): ENGINE.MeshNode {
  const node = ENGINE.MeshNode.create({
    name: 'Decor',
    geometry,
    material,
    physicsOptions: { ...NO_PHYSICS },
  });
  node.setName(name);
  return node;
}
