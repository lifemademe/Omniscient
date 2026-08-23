import * as THREE from 'three';

import { createWarehouseOfficer } from './entities.js';
import { WAREHOUSE_DOORS } from './WarehouseServiceDoors.js';

import type { WarehouseVisitor } from './entities.js';
import type { WarehouseCameraPose } from './WarehouseServiceDoors.js';
import type { WarehouseDoorId } from './types.js';

export type WarehousePursuitPhase = 'lockdown' | 'suspect' | 'response' | 'complete';

export interface WarehousePursuitFrame {
  phase: WarehousePursuitPhase;
  phaseChanged: boolean;
  camera: WarehouseCameraPose;
  timestampOffsetSeconds: number;
  complete: boolean;
}

/** Authored, deterministic CCTV response vignette. It never owns mission outcome state. */
export class WarehousePursuit {
  public readonly officer: WarehouseVisitor;

  private elapsed = 0;
  private phase: WarehousePursuitPhase = 'lockdown';
  private suspectStarted = false;
  private officerStarted = false;

  public constructor(
    public readonly doorId: WarehouseDoorId,
    private readonly suspect: WarehouseVisitor,
    private readonly fullLength: boolean
  ) {
    this.officer = createWarehouseOfficer(doorId);
    this.officer.root.visible = false;
  }

  public tick(deltaTime: number): WarehousePursuitFrame {
    this.elapsed += deltaTime;
    this.officer.rig.idle(deltaTime);
    const suspectAt = this.fullLength ? 1.45 : 0.35;
    const responseAt = this.fullLength ? 3.25 : 1.05;
    const completeAt = this.fullLength ? 8.7 : 3.7;
    const previous = this.phase;

    if (this.elapsed >= completeAt) {
      this.phase = 'complete';
    } else if (this.elapsed >= responseAt) {
      this.phase = 'response';
      this.startOfficer();
    } else if (this.elapsed >= suspectAt) {
      this.phase = 'suspect';
      this.startSuspect();
    }

    return {
      phase: this.phase,
      phaseChanged: previous !== this.phase,
      camera: this.currentCamera(),
      timestampOffsetSeconds: this.phase === 'lockdown' ? 0 : 407,
      complete: this.phase === 'complete',
    };
  }

  public skip(): void {
    this.phase = 'complete';
    this.elapsed = Number.POSITIVE_INFINITY;
  }

  public currentCamera(): WarehouseCameraPose {
    const layout = WAREHOUSE_DOORS[this.doorId];
    return this.phase === 'response' ? layout.pursuit.camera : layout.camera;
  }

  public destroy(): void {
    this.officer.root.removeFromParent();
  }

  private startSuspect(): void {
    if (this.suspectStarted) return;
    this.suspectStarted = true;
    const route = WAREHOUSE_DOORS[this.doorId].pursuit;
    this.suspect.root.position.copy(route.suspectStart);
    this.suspect.root.rotation.y = heading(route.suspectStart, route.suspectEnd);
    this.suspect.rig.walk(route.suspectEnd, {
      facing: heading(route.suspectStart, route.suspectEnd),
      locomotion: 'run',
      pace: this.fullLength ? 1.15 : 1.5,
      interrupt: true,
    });
  }

  private startOfficer(): void {
    if (this.officerStarted) return;
    this.officerStarted = true;
    const route = WAREHOUSE_DOORS[this.doorId].pursuit;
    this.officer.root.position.copy(route.officerStart);
    this.officer.root.rotation.y = heading(route.officerStart, route.officerEnd);
    this.officer.root.visible = true;
    this.officer.rig.walk(route.officerEnd, {
      facing: heading(route.officerStart, route.officerEnd),
      locomotion: 'run',
      pace: this.fullLength ? 1.25 : 1.7,
      interrupt: true,
    });
  }
}

function heading(from: THREE.Vector3, to: THREE.Vector3): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}
