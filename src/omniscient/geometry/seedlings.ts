import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { leafBlade } from './foliage.js';
import { range } from '../core/rng.js';
import type { Rng } from '../core/rng.js';

/** The same young broad-leaf crop: a full rosette in sun, sparse long stems in shade. */
export function seedlingRows(rng: Rng, at: THREE.Vector3, leggy = false): ENGINE.SceneNode {
  const parts: THREE.BufferGeometry[] = [];
  const height = leggy ? 0.32 : 0.13;
  const stemSource = new THREE.CylinderGeometry(0.005, 0.009, height, 5);
  const stem = stemSource.toNonIndexed();
  stemSource.dispose();
  stem.translate(0, height / 2, 0);
  parts.push(stem);
  const leaves = leggy ? 4 : 7;
  for (let i = 0; i < leaves; i++) {
    const leaf = leafBlade(leggy ? 0.12 : 0.21, leggy ? 0.032 : 0.068);
    leaf.rotateX(leggy ? 1.05 : 0.85 + (i % 2) * 0.24);
    leaf.rotateY(i * 2.4);
    leaf.translate(0, leggy ? 0.11 + i * 0.06 : 0.03 + i * 0.016, 0);
    parts.push(leaf);
  }
  const geometry = mergeGeometries(parts, false)!;
  for (const part of parts) part.dispose();
  const instances = [];
  for (let row = 0; row < 7; row++) {
    for (let column = 0; column < 3; column++) {
      const size = range(rng, 0.86, 1.1);
      instances.push({
        position: new THREE.Vector3(at.x + column * 0.4 + range(rng, -0.025, 0.025), at.y, at.z + row * 0.62 + range(rng, -0.03, 0.03)),
        rotation: new THREE.Euler(0, range(rng, 0, Math.PI * 2), leggy ? range(rng, -0.1, 0.1) : 0),
        scale: new THREE.Vector3(size, range(rng, 0.9, 1.08), size),
      });
    }
  }
  // Like the surrounding meadow, these runtime-only plants live in one instanced draw.
  const mesh = new THREE.InstancedMesh(geometry,
    new THREE.MeshStandardMaterial({ color: leggy ? '#cfc47e' : '#50833c', roughness: 0.95, metalness: 0, flatShading: true }),
    instances.length);
  const matrix = new THREE.Matrix4();
  const turn = new THREE.Quaternion();
  instances.forEach((instance, index) => {
    matrix.compose(instance.position, turn.setFromEuler(instance.rotation), instance.scale);
    mesh.setMatrixAt(index, matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  const node = ENGINE.SceneNode.create({ name: 'Seedlings' });
  node.add(mesh);
  tintSeedlings(node, new THREE.Color(leggy ? '#cfc47e' : '#50833c'));
  return node;
}

export function tintSeedlings(node: ENGINE.SceneNode, color: THREE.Color): void {
  node.traverse((object) => {
    if (!(object instanceof THREE.InstancedMesh)) return;
    const material = object.material as THREE.MeshStandardMaterial;
    material.color.copy(color);
    // Certainty gives known objects a small emissive lift; keep it in the crop's colour.
    material.emissive.copy(color).multiplyScalar(0.24);
  });
}
