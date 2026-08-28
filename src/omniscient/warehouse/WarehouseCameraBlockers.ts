import * as THREE from 'three';

const CELL = 4;
const MOVING = /Gate|Shutter|Hatch|Cover|Conveyor|Roller|RearDoor|LoadingBay|Transfer|Gantry|Trolley|Claw/i;

/** Broad phase for the camera arm only. Optical eligibility keeps its own query. */
export class WarehouseCameraBlockers {
  private readonly cells = new Map<string, THREE.Mesh[]>();
  private readonly moving: THREE.Mesh[] = [];
  private readonly candidates = new Set<THREE.Mesh>();
  private readonly result: THREE.Mesh[] = [];
  private readonly bounds = new THREE.Box3();
  private readonly swept = new THREE.Box3();
  private readonly padding = new THREE.Vector3(0.4, 0.4, 0.4);

  public rebuild(root: THREE.Object3D, accepts: (mesh: THREE.Mesh) => boolean): void {
    this.cells.clear();
    this.moving.length = 0;
    root.updateWorldMatrix(true, true);
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh) || !accepts(object)) return;
      let ancestor: THREE.Object3D | null = object;
      while (ancestor && ancestor !== root && !MOVING.test(ancestor.name)) ancestor = ancestor.parent;
      if (ancestor && ancestor !== root) { this.moving.push(object); return; }
      this.meshBounds(object);
      // Very large or instanced objects stay in a small conservative list.
      if (object instanceof THREE.InstancedMesh || this.bounds.isEmpty()) { this.moving.push(object); return; }
      for (let x = Math.floor(this.bounds.min.x / CELL); x <= Math.floor(this.bounds.max.x / CELL); x++) {
        for (let z = Math.floor(this.bounds.min.z / CELL); z <= Math.floor(this.bounds.max.z / CELL); z++) {
          const key = `${x},${z}`;
          const bucket = this.cells.get(key) ?? [];
          bucket.push(object);
          this.cells.set(key, bucket);
        }
      }
    });
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
      this.meshBounds(mesh);
      if (this.bounds.intersectsBox(this.swept)) this.result.push(mesh);
    }
    for (const mesh of this.moving) {
      mesh.updateWorldMatrix(true, false);
      this.meshBounds(mesh);
      if (this.bounds.intersectsBox(this.swept)) this.result.push(mesh);
    }
    return this.result;
  }
}
