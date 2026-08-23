import * as THREE from 'three';

import { createWarehouseInteriorOfficer } from './entities.js';
import { WAREHOUSE_SECURITY_ZONES } from './WarehouseLayout.js';

import type { WarehouseVisitor } from './entities.js';
import type { WarehouseCameraPose } from './WarehouseLayout.js';
import type { WarehouseSecurityZoneId } from './types.js';

export interface WarehouseContainmentResponseFrame {
  phase: 'handoff' | 'response' | 'complete';
  phaseChanged: boolean;
  camera: WarehouseCameraPose;
  timestampOffsetSeconds: number;
  complete: boolean;
}

/** A short, contact-free CCTV payoff after the player has already secured the zone. */
export class WarehouseContainmentResponse {
  public readonly officer: WarehouseVisitor;

  private elapsed = 0;
  private phase: WarehouseContainmentResponseFrame['phase'] = 'handoff';
  private officerStarted = false;

  public constructor(public readonly zone: WarehouseSecurityZoneId) {
    const target = WAREHOUSE_SECURITY_ZONES[zone].routePosition;
    const start = zone === 'receiving'
      ? new THREE.Vector3(target.x - 4.2, 0, -26.2)
      : new THREE.Vector3(target.x, 0, zone === 'sortation' ? -12.4 : -12.1);
    this.officer = createWarehouseInteriorOfficer(start);
    this.officer.root.visible = false;
  }

  public tick(deltaTime: number): WarehouseContainmentResponseFrame {
    this.elapsed += deltaTime;
    this.officer.rig.idle(deltaTime);
    const previous = this.phase;
    if (this.elapsed >= 7.6) {
      this.phase = 'complete';
    } else if (this.elapsed >= 2.1) {
      this.phase = 'response';
      this.startOfficer();
    }
    return {
      phase: this.phase,
      phaseChanged: previous !== this.phase,
      camera: WAREHOUSE_SECURITY_ZONES[this.zone].camera,
      timestampOffsetSeconds: this.phase === 'handoff' ? 0 : 268,
      complete: this.phase === 'complete',
    };
  }

  public skip(): void {
    this.elapsed = Number.POSITIVE_INFINITY;
    this.phase = 'complete';
  }

  public destroy(): void {
    this.officer.root.removeFromParent();
  }

  private startOfficer(): void {
    if (this.officerStarted) return;
    this.officerStarted = true;
    const destination = WAREHOUSE_SECURITY_ZONES[this.zone].routePosition.clone();
    destination.z += this.zone === 'receiving' ? -3.2 : 3.2;
    const start = this.officer.root.position;
    this.officer.root.rotation.y = Math.atan2(destination.x - start.x, destination.z - start.z);
    this.officer.root.visible = true;
    this.officer.rig.walk(destination, {
      facing: this.officer.root.rotation.y,
      locomotion: 'run',
      pace: 1.08,
      interrupt: true,
    });
  }
}
