import * as THREE from 'three';

/** Spatial chunks for exact camera rays against large, immobile merged scenery.
 * Attributes/materials stay shared; only the triangle indices are partitioned.
 * These meshes never enter the world, renderer, physics system or scan queries.
 */
export function partitionCameraGeometry(mesh: THREE.Mesh, cellSize: number): THREE.Mesh[] | null {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute('position');
  const index = geometry.index;
  const count = index?.count ?? position?.count ?? 0;
  if (!position || count < 768 || Array.isArray(mesh.material)
    || mesh instanceof THREE.SkinnedMesh || Object.keys(geometry.morphAttributes).length) return null;

  const buckets = new Map<string, { indices: number[]; bounds: THREE.Box3 }>();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const center = new THREE.Vector3();
  const start = geometry.drawRange.start;
  const end = Math.min(count, start + geometry.drawRange.count);
  for (let offset = start; offset + 2 < end; offset += 3) {
    const ia = index ? index.getX(offset) : offset;
    const ib = index ? index.getX(offset + 1) : offset + 1;
    const ic = index ? index.getX(offset + 2) : offset + 2;
    a.fromBufferAttribute(position, ia);
    b.fromBufferAttribute(position, ib);
    c.fromBufferAttribute(position, ic);
    center.copy(a).add(b).add(c).multiplyScalar(1 / 3).applyMatrix4(mesh.matrixWorld);
    const key = `${Math.floor(center.x / cellSize)},${Math.floor(center.y / cellSize)},${Math.floor(center.z / cellSize)}`;
    let bucket = buckets.get(key);
    if (!bucket) { bucket = { indices: [], bounds: new THREE.Box3() }; buckets.set(key, bucket); }
    bucket.indices.push(ia, ib, ic);
    // Full triangle bounds, not just its centroid cell: long triangles crossing
    // cell edges must still block a ray from either neighbouring cell.
    bucket.bounds.expandByPoint(a).expandByPoint(b).expandByPoint(c);
  }
  if (buckets.size < 2) return null;
  return [...buckets.values()].map(bucket => {
    const chunk = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(geometry.attributes)) chunk.setAttribute(name, attribute);
    chunk.setIndex(bucket.indices);
    chunk.boundingBox = bucket.bounds;
    chunk.boundingSphere = bucket.bounds.getBoundingSphere(new THREE.Sphere());
    const proxy = new THREE.Mesh(chunk, mesh.material);
    proxy.name = mesh.name;
    proxy.matrixAutoUpdate = false;
    proxy.matrixWorldAutoUpdate = false;
    proxy.matrixWorld.copy(mesh.matrixWorld);
    proxy.layers.mask = mesh.layers.mask;
    return proxy;
  });
}
