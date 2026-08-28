import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

// Only authored, immobile fittings. No labels, targets, cargo, doors, rollers or fan parts.
const STATIC_PARTS = new Set([
  'RoofTruss', 'TrussBrace', 'WallRib', 'VentGrille', 'CableTrayRung',
  'PalletSlat', 'PalletRunner', 'SignFrame', 'SignHanger', 'FloorDrain',
  'SafetyBollard', 'WarningBeaconCage',
  'ServicePalletSlat', 'ServicePalletRunner', 'ServiceEmptyPallet', 'ServicePalletLean',
  'ServiceDownpipeBracketLow', 'ServiceDownpipeBracketHigh',
  'ServiceLockHousing', 'ServiceLockKeeper', 'ServiceBollard',
  'StillagePost', 'StillageRail', 'HoopLeft', 'HoopRight', 'HoopTop',
  'CondenserBlade', 'GasCagePost', 'GasCageRail', 'GasCylinder', 'GasCylinderNeck',
  'ServiceBulkheadCage', 'ServiceJambGuard', 'ServiceJambGuardFoot',
]);

interface Batch {
  nodes: ENGINE.MeshNode[];
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  transforms: Array<{ position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3 }>;
}

function sameArray(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Parameters alone are unsafe: geometry.translate/rotate does not update parameters. */
function sameGeometry(a: THREE.BufferGeometry, b: THREE.BufferGeometry): boolean {
  if (a.type !== b.type || JSON.stringify(a.groups) !== JSON.stringify(b.groups)) return false;
  if (!!a.index !== !!b.index || (a.index && b.index && !sameArray(a.index.array, b.index.array))) return false;
  const names = Object.keys(a.attributes);
  if (names.length !== Object.keys(b.attributes).length) return false;
  return names.every(name => {
    const aa = a.attributes[name];
    const bb = b.attributes[name];
    return aa instanceof THREE.BufferAttribute && bb instanceof THREE.BufferAttribute
      && aa.itemSize === bb.itemSize && aa.normalized === bb.normalized
      && sameArray(aa.array, bb.array);
  });
}

/** Run on the detached runtime environment before its children enter the engine world. */
export function batchStaticWarehouseParts(root: ENGINE.SceneNode): { sourceMeshes: number; batches: number } {
  const groups = new Map<string, Batch[]>();
  const matrix = new THREE.Matrix4();
  const rebuilt = new THREE.Matrix4();
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  root.traverse(object => {
    if (!(object instanceof ENGINE.MeshNode) || !STATIC_PARTS.has(object.name) || !object.visible) return;
    const material = object.material;
    if (!(material instanceof THREE.Material) || material.transparent || object.uvScaleTilesPerUnit) return;
    // Keep custom child nodes and render overrides outside the batching contract.
    if (object.children.some(child => child instanceof ENGINE.SceneNode)) return;
    matrix.multiplyMatrices(inverse, object.matrixWorld);
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    matrix.decompose(position, quaternion, scale);
    rebuilt.compose(position, quaternion, scale);
    if (scale.x <= 0 || scale.y <= 0 || scale.z <= 0
      || matrix.elements.some((value, i) => Math.abs(value - rebuilt.elements[i]) > 0.00001)) return;
    const key = `${object.name}:${material.uuid}:${object.castShadow}:${object.receiveShadow}:${object.renderOrder}`;
    const compatible = groups.get(key) ?? [];
    let group = compatible.find(entry => sameGeometry(entry.geometry, object.geometry));
    if (!group) {
      group = { nodes: [], geometry: object.geometry, material, transforms: [] };
      compatible.push(group);
      groups.set(key, compatible);
    }
    group.nodes.push(object);
    group.transforms.push({ position, rotation: new THREE.Euler().setFromQuaternion(quaternion), scale });
  });
  let sourceMeshes = 0;
  let batches = 0;
  for (const compatible of groups.values()) {
    for (const group of compatible) {
      if (group.nodes.length < 3) continue;
      const first = group.nodes[0];
      const batch = ENGINE.InstancedMeshNode.create({
        name: `StaticBatch-${first.name}`,
        geometry: group.geometry,
        material: group.material,
        maxInstances: group.nodes.length,
        instances: group.transforms,
        castShadow: first.castShadow,
        receiveShadow: first.receiveShadow,
        // Small low-poly fittings: fixed buffers avoid camera-by-camera CPU compaction.
        perInstanceFrustumCulling: false,
      });
      batch.renderOrder = first.renderOrder;
      for (const node of group.nodes) node.parent?.remove(node);
      root.add(batch);
      sourceMeshes += group.nodes.length;
      batches++;
    }
  }
  return { sourceMeshes, batches };
}
