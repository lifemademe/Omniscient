import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import type { WarehouseCargoNode } from './entities.js';

const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);
const CARGO_ATTACH_OFFSET = new THREE.Vector3(0, 0.64, 0);
const MIN_ROPE_LENGTH = 1.15;
const MAX_ROPE_LENGTH = 2.8;
const SEGMENT_COUNT = 10;
const FLOOR_HEIGHT = 0.665;

/**
 * Runtime-only cargo tether. A short Verlet chain gives the suspended load inertia,
 * gravity and damping without coupling this bespoke mission rig to editor physics bodies.
 */
export class DroneCargoRope {
  public readonly root = ENGINE.SceneNode.create({ name: 'DroneCargoRope' });

  private readonly points = Array.from({ length: SEGMENT_COUNT + 1 }, () => new THREE.Vector3());
  private readonly previous = Array.from({ length: SEGMENT_COUNT + 1 }, () => new THREE.Vector3());
  private readonly segments: ENGINE.MeshNode[] = [];
  private readonly endClamp: ENGINE.MeshNode;
  private readonly lastAnchor = new THREE.Vector3();
  private readonly interpolatedAnchor = new THREE.Vector3();
  private readonly delta = new THREE.Vector3();
  private readonly midpoint = new THREE.Vector3();
  private readonly targetTilt = new THREE.Quaternion();
  private readonly tiltEuler = new THREE.Euler();
  private cargo: WarehouseCargoNode | null = null;
  private segmentLength = MIN_ROPE_LENGTH / SEGMENT_COUNT;
  private elapsed = 0;

  public constructor() {
    const ropeMaterial = new THREE.MeshStandardMaterial({
      color: '#8c784b',
      emissive: '#251f13',
      emissiveIntensity: 0.22,
      roughness: 0.88,
      metalness: 0.02,
    });
    for (let i = 0; i < SEGMENT_COUNT; i++) {
      const segment = ENGINE.MeshNode.create({
        name: `CargoRopeSegment-${String(i + 1).padStart(2, '0')}`,
        geometry: new THREE.CylinderGeometry(0.018, 0.018, 1, 7),
        material: ropeMaterial,
        castShadow: true,
      });
      this.root.add(segment);
      this.segments.push(segment);
    }
    this.endClamp = ENGINE.MeshNode.create({
      name: 'CargoRopeClamp',
      geometry: new THREE.CylinderGeometry(0.085, 0.11, 0.12, 10),
      material: new THREE.MeshStandardMaterial({ color: '#9d813f', roughness: 0.48, metalness: 0.58 }),
      castShadow: true,
    });
    this.root.add(this.endClamp);
    this.root.visible = false;
  }

  public attach(cargo: WarehouseCargoNode, owner: ENGINE.SceneNode, anchor: THREE.Vector3): void {
    cargo.removeFromParent();
    owner.add(cargo);
    this.cargo = cargo;
    const end = cargo.position.clone().add(CARGO_ATTACH_OFFSET);
    const distance = anchor.distanceTo(end);
    const ropeLength = THREE.MathUtils.clamp(distance, MIN_ROPE_LENGTH, MAX_ROPE_LENGTH);
    this.segmentLength = ropeLength / SEGMENT_COUNT;

    if (distance < MIN_ROPE_LENGTH) end.copy(anchor).addScaledVector(DOWN, MIN_ROPE_LENGTH);
    for (let i = 0; i <= SEGMENT_COUNT; i++) {
      this.points[i].lerpVectors(anchor, end, i / SEGMENT_COUNT);
      this.previous[i].copy(this.points[i]);
    }
    this.lastAnchor.copy(anchor);
    this.root.visible = true;
    this.updateVisuals();
  }

  public detach(): WarehouseCargoNode | null {
    const cargo = this.cargo;
    this.cargo = null;
    this.root.visible = false;
    return cargo;
  }

  public tick(deltaTime: number, anchor: THREE.Vector3): void {
    if (!this.cargo || !this.root.visible) return;
    const safeDelta = Math.min(Math.max(deltaTime, 0), 1 / 20);
    const substeps = safeDelta > 1 / 45 ? 3 : 2;
    const step = safeDelta / substeps;
    this.elapsed += safeDelta;

    for (let substep = 1; substep <= substeps; substep++) {
      this.interpolatedAnchor.lerpVectors(this.lastAnchor, anchor, substep / substeps);
      this.simulateStep(step, this.interpolatedAnchor);
    }
    this.lastAnchor.copy(anchor);
    this.updateVisuals();
  }

  private simulateStep(deltaTime: number, anchor: THREE.Vector3): void {
    this.points[0].copy(anchor);
    this.previous[0].copy(anchor);
    const gravityStep = -9.81 * deltaTime * deltaTime;
    const lateralDraft = Math.sin(this.elapsed * 1.7) * 0.085 * deltaTime * deltaTime;
    for (let i = 1; i <= SEGMENT_COUNT; i++) {
      const point = this.points[i];
      const oldX = point.x;
      const oldY = point.y;
      const oldZ = point.z;
      const damping = i === SEGMENT_COUNT ? 0.992 : 0.985;
      point.x += (point.x - this.previous[i].x) * damping + lateralDraft * (i / SEGMENT_COUNT);
      point.y += (point.y - this.previous[i].y) * damping + gravityStep;
      point.z += (point.z - this.previous[i].z) * damping;
      this.previous[i].set(oldX, oldY, oldZ);
    }

    for (let iteration = 0; iteration < 8; iteration++) {
      this.points[0].copy(anchor);
      for (let i = 0; i < SEGMENT_COUNT; i++) {
        const a = this.points[i];
        const b = this.points[i + 1];
        this.delta.subVectors(b, a);
        const distance = Math.max(0.0001, this.delta.length());
        const correction = (distance - this.segmentLength) / distance;
        if (i === 0) {
          b.addScaledVector(this.delta, -correction);
        } else {
          a.addScaledVector(this.delta, correction * 0.5);
          b.addScaledVector(this.delta, -correction * 0.5);
        }
      }
      const end = this.points[SEGMENT_COUNT];
      if (end.y < FLOOR_HEIGHT) {
        end.y = FLOOR_HEIGHT;
        if (this.previous[SEGMENT_COUNT].y > end.y) this.previous[SEGMENT_COUNT].y = end.y;
      }
    }

    const end = this.points[SEGMENT_COUNT];
    end.x = THREE.MathUtils.clamp(end.x, -15.1, 15.1);
    end.z = THREE.MathUtils.clamp(end.z, -16.5, 17);

    if (this.cargo) {
      this.delta.subVectors(this.points[SEGMENT_COUNT - 1], end).normalize();
      this.tiltEuler.set(
        THREE.MathUtils.clamp(this.delta.z * 0.22, -0.24, 0.24),
        0,
        THREE.MathUtils.clamp(-this.delta.x * 0.22, -0.24, 0.24)
      );
      this.targetTilt.setFromEuler(this.tiltEuler);
      this.cargo.quaternion.slerp(this.targetTilt, 1 - Math.exp(-6 * deltaTime));
      this.delta.copy(CARGO_ATTACH_OFFSET).applyQuaternion(this.cargo.quaternion);
      this.cargo.position.copy(end).sub(this.delta);
    }
  }

  private updateVisuals(): void {
    for (let i = 0; i < SEGMENT_COUNT; i++) {
      const a = this.points[i];
      const b = this.points[i + 1];
      const segment = this.segments[i];
      this.delta.subVectors(b, a);
      const length = Math.max(0.001, this.delta.length());
      this.midpoint.addVectors(a, b).multiplyScalar(0.5);
      segment.position.copy(this.midpoint);
      segment.scale.set(1, length, 1);
      segment.quaternion.setFromUnitVectors(UP, this.delta.multiplyScalar(1 / length));
    }
    this.endClamp.position.copy(this.points[SEGMENT_COUNT]);
  }
}
