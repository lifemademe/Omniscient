import * as THREE from 'three';
import { partitionCameraGeometry } from './WarehouseCameraGeometry.js';

const CELL = 4;
const MOVING = /Gate|Shutter|Hatch|Cover|Conveyor|Roller|RearDoor|LoadingBay|Transfer|Gantry|Trolley|Claw/i;

/** Broad phase for the camera arm only. Optical eligibility keeps its own query. */
export class WarehouseCameraBlockers {
  private readonly cells = new Map<string, THREE.Mesh[]>();
  private readonly moving: THREE.Mesh[] = [];
  private readonly candidates = new Set<THREE.Mesh>();
  private readonly result: THREE.Mesh[] = [];
  private readonly bounds = new THREE.Box3();
  private readonly staticBounds = new Map<THREE.Mesh, THREE.Box3>();
  private readonly instanceMatrix = new THREE.Matrix4();
  private readonly queryGeometries: THREE.BufferGeometry[] = [];
  private readonly swept = new THREE.Box3();
  private readonly padding = new THREE.Vector3(0.4, 0.4, 0.4);

  public rebuild(root: THREE.Object3D, accepts: (mesh: THREE.Mesh) => boolean): void {
    this.clear();
    root.updateWorldMatrix(true, true);
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh) || !accepts(object)) return;
      let ancestor: THREE.Object3D | null = object;
      while (ancestor && ancestor !== root && !MOVING.test(ancestor.name)) ancestor = ancestor.parent;
      if (ancestor && ancestor !== root) { this.moving.push(object); return; }
      if (object instanceof THREE.InstancedMesh) {
        // Rendering batches span the whole warehouse. Raycasting the batch tests
        // every instance for each arm probe, even when only one fitting is near.
        // Query-only proxies share the original geometry/material and preserve
        // exact triangle intersections; they are never added to the render scene.
        for (let i = 0; i < object.count; i++) {
          object.getMatrixAt(i, this.instanceMatrix);
          const proxy = new THREE.Mesh(object.geometry, object.material);
          proxy.matrixAutoUpdate = false;
          proxy.matrixWorldAutoUpdate = false;
          proxy.matrixWorld.multiplyMatrices(object.matrixWorld, this.instanceMatrix);
          proxy.layers.mask = object.layers.mask;
          this.addStatic(proxy);
        }
      } else {
        const chunks = partitionCameraGeometry(object, CELL);
        if (chunks) {
          for (const chunk of chunks) {
            this.queryGeometries.push(chunk.geometry);
            this.addStatic(chunk);
          }
        } else this.addStatic(object);
      }
    });
  }

  public clear(): void {
    this.cells.clear();
    this.moving.length = 0;
    this.staticBounds.clear();
    this.candidates.clear();
    this.result.length = 0;
    for (const geometry of this.queryGeometries) geometry.dispose();
    this.queryGeometries.length = 0;
  }

  private addStatic(mesh: THREE.Mesh): void {
    this.meshBounds(mesh);
    if (this.bounds.isEmpty()) { this.moving.push(mesh); return; }
    this.staticBounds.set(mesh, this.bounds.clone());
    for (let x = Math.floor(this.bounds.min.x / CELL); x <= Math.floor(this.bounds.max.x / CELL); x++) {
      for (let z = Math.floor(this.bounds.min.z / CELL); z <= Math.floor(this.bounds.max.z / CELL); z++) {
        const key = `${x},${z}`;
        const bucket = this.cells.get(key) ?? [];
        bucket.push(mesh);
        this.cells.set(key, bucket);
      }
    }
  }

  private meshBounds(mesh: THREE.Mesh): void {
    if (mesh instanceof THREE.InstancedMesh) {
      if (!mesh.boundingBox) mesh.computeBoundingBox();
      this.bounds.copy(mesh.boundingBox!).applyMatrix4(mesh.matrixWorld);
      return;
    }
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    this.bounds.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld);
  }

  public addMovingRoot(root: THREE.Object3D, accepts: (mesh: THREE.Mesh) => boolean): void {
    root.traverse(object => {
      if (object instanceof THREE.Mesh && accepts(object)) this.moving.push(object);
    });
  }

  public query(anchor: THREE.Vector3, desired: THREE.Vector3): THREE.Mesh[] {
    this.swept.makeEmpty().expandByPoint(anchor).expandByPoint(desired).expandByVector(this.padding);
    this.candidates.clear();
    this.result.length = 0;
    for (let x = Math.floor(this.swept.min.x / CELL); x <= Math.floor(this.swept.max.x / CELL); x++) {
      for (let z = Math.floor(this.swept.min.z / CELL); z <= Math.floor(this.swept.max.z / CELL); z++) {
        for (const mesh of this.cells.get(`${x},${z}`) ?? []) this.candidates.add(mesh);
      }
    }
    for (const mesh of this.candidates) {
      if (this.staticBounds.get(mesh)!.intersectsBox(this.swept)) this.result.push(mesh);
    }
    for (const mesh of this.moving) {
      mesh.updateWorldMatrix(true, false);
      this.meshBounds(mesh);
      if (this.bounds.intersectsBox(this.swept)) this.result.push(mesh);
    }
    return this.result;
  }
}
