import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { placeRigged } from '../view/riggedContact.js';
import { WAREHOUSE_DOORS } from './WarehouseServiceDoors.js';
import { WAREHOUSE_SECURITY_ZONE_IDS, WAREHOUSE_SECURITY_ZONES } from './WarehouseLayout.js';

import type { BehaviorStatus as BehaviorStatusType, Blackboard } from '@gnsx/genesys.js';
import type { RiggedContact } from '../view/riggedContact.js';
import type { WarehouseIntrusionPhase, WarehouseSecurityZoneId } from './types.js';

export interface WarehouseIntruderCallbacks {
  onZoneChanged?: (zone: WarehouseSecurityZoneId, routeStep: number) => void;
  onEscapeWarning?: () => void;
  onEscaped?: () => void;
  onTagExpired?: () => void;
}

type IntruderActionKind = 'contained' | 'observed' | 'escape' | 'route';

class IntruderBehaviorAction extends ENGINE.BehaviorAction {
  public constructor(private readonly kind: IntruderActionKind) {
    super({ name: `Intruder ${kind}` });
  }

  protected override onInitialize(_blackboard: Blackboard): void {}

  protected override async onUpdate(blackboard: Blackboard, deltaTime: number): Promise<BehaviorStatusType> {
    const owner = blackboard.getOwner();
    if (!(owner instanceof WarehouseIntruderNode) || !owner.canRunAction(this.kind)) {
      return ENGINE.BehaviorStatus.Failure;
    }
    owner.runAction(this.kind, deltaTime);
    return ENGINE.BehaviorStatus.Success;
  }
}

function box(
  name: string,
  size: THREE.Vector3,
  material: THREE.Material,
  position: THREE.Vector3
): ENGINE.MeshNode {
  return ENGINE.MeshNode.create({
    name,
    geometry: new THREE.BoxGeometry(size.x, size.y, size.z),
    material,
    position,
    castShadow: true,
    receiveShadow: true,
  });
}

/**
 * Runtime-authored internal intruder. The behavior tree intentionally owns decisions,
 * while the rig owns locomotion animation and root travel.
 */
@ENGINE.GameClass()
export class WarehouseIntruderNode extends ENGINE.SceneNode {
  public phase: WarehouseIntrusionPhase = 'inactive';
  public currentZone: WarehouseSecurityZoneId = 'receiving';
  public lastSeenZone: WarehouseSecurityZoneId | null = null;
  public routeStep = 0;
  public tagSeconds = 0;
  public escapeSeconds: number | null = null;

  private rig: RiggedContact | null = null;
  private callbacks: WarehouseIntruderCallbacks = {};
  private paused = false;
  private observedSeconds = 0;
  private dwellSeconds = 0;
  private moving = false;
  private escapeRunStarted = false;
  private tamperPlayed = false;

  public constructor() {
    super();
    this.isRoot = false;
  }

  public configure(callbacks: WarehouseIntruderCallbacks = {}): void {
    this.callbacks = callbacks;
    this.setName('UnlistedWarehouseIntruder');
    const start = new THREE.Vector3(0.9, 0, -28.4);
    this.rig = placeRigged('UnlistedPersonRig', {
      modelUrl: '@project/assets/models/Dorin.glb',
      position: start,
      rotation: new THREE.Euler(0, 0, 0),
      height: 1.76,
      clip: true,
      settleWrists: 0.28,
    });
    this.add(this.rig.root);
    this.addStolenVest(this.rig.root);

    const tree = ENGINE.BehaviorTreeNode.create({
      name: 'WarehouseIntruderBehavior',
      tickInterval: 0.05,
      rootNode: new ENGINE.SelectorNode({
        children: [
          new IntruderBehaviorAction('contained'),
          new IntruderBehaviorAction('observed'),
          new IntruderBehaviorAction('escape'),
          new IntruderBehaviorAction('route'),
        ],
      }),
    });
    this.add(tree);
    this.visible = false;
    this.setTickEnabled(true);
  }

  public startEntry(): void {
    if (!this.rig) return;
    this.visible = true;
    this.phase = 'entry';
    this.routeStep = 0;
    this.currentZone = 'receiving';
    this.rig.root.position.set(0.9, 0, -28.4);
    this.startWalk(WAREHOUSE_SECURITY_ZONES.receiving.routePosition, 1.12);
  }

  public activateSearch(): void {
    if (this.phase !== 'entry') return;
    this.phase = 'search';
    this.dwellSeconds = 8.5;
    this.moving = false;
  }

  public setPaused(paused: boolean): void {
    this.paused = paused;
  }

  public observe(seconds = 2.2): void {
    if (this.phase === 'inactive' || this.phase === 'contained' || this.phase === 'escaped') return;
    this.observedSeconds = Math.max(this.observedSeconds, seconds);
    this.lastSeenZone = this.currentZone;
  }

  public tag(): void {
    if (this.phase === 'inactive' || this.phase === 'contained' || this.phase === 'escaped') return;
    this.tagSeconds = 10;
    this.lastSeenZone = this.currentZone;
    if (this.phase === 'search') this.phase = 'tagged';
  }

  public contain(): void {
    this.phase = 'contained';
    this.tagSeconds = 0;
    this.escapeSeconds = null;
    this.moving = false;
  }

  public resetAtCheckpoint(): void {
    if (!this.rig) return;
    this.phase = 'search';
    this.currentZone = 'receiving';
    this.lastSeenZone = null;
    this.routeStep = 0;
    this.tagSeconds = 0;
    this.escapeSeconds = null;
    this.dwellSeconds = 6.5;
    this.observedSeconds = 0;
    this.moving = false;
    this.escapeRunStarted = false;
    this.tamperPlayed = false;
    this.rig.root.position.copy(WAREHOUSE_SECURITY_ZONES.receiving.routePosition);
    this.visible = true;
  }

  public override getWorldPosition(target = new THREE.Vector3()): THREE.Vector3 {
    return this.rig?.root.getWorldPosition(target) ?? super.getWorldPosition(target);
  }

  public containsObject(object: THREE.Object3D | null): boolean {
    if (!this.rig || !object) return false;
    let cursor: THREE.Object3D | null = object;
    while (cursor) {
      if (cursor === this.rig.root) return true;
      cursor = cursor.parent;
    }
    return false;
  }

  public canRunAction(kind: IntruderActionKind): boolean {
    if (this.paused || this.phase === 'inactive' || this.phase === 'entry' || this.phase === 'response') return false;
    if (kind === 'contained') return this.phase === 'contained';
    if (kind === 'observed') return this.observedSeconds > 0;
    if (kind === 'escape') return this.phase === 'escape-warning';
    return this.phase === 'search' || this.phase === 'tagged';
  }

  public runAction(kind: IntruderActionKind, deltaTime: number): void {
    if (kind === 'contained') {
      return;
    }
    if (kind === 'observed') {
      this.observedSeconds = Math.max(0, this.observedSeconds - deltaTime);
      this.dwellSeconds = Math.min(this.dwellSeconds, 0.3);
      return;
    }
    if (kind === 'escape') {
      this.tickEscape(deltaTime);
      return;
    }
    this.tickRoute(deltaTime);
  }

  public override tickPrePhysics(deltaTime: number): void {
    super.tickPrePhysics(deltaTime);
    this.rig?.idle(this.paused ? 0 : deltaTime);
    if (this.paused) return;
    if (this.phase === 'entry' && this.distanceTo(WAREHOUSE_SECURITY_ZONES.receiving.routePosition) < 0.35) {
      this.moving = false;
    }
    if (this.tagSeconds > 0) {
      this.tagSeconds = Math.max(0, this.tagSeconds - deltaTime);
      if (this.tagSeconds === 0) {
        if (this.phase === 'tagged') this.phase = 'search';
        this.callbacks.onTagExpired?.();
      }
    }
  }

  private tickRoute(deltaTime: number): void {
    const zone = WAREHOUSE_SECURITY_ZONE_IDS[this.routeStep];
    const target = WAREHOUSE_SECURITY_ZONES[zone].routePosition;
    if (this.moving) {
      if (this.distanceTo(target) < 0.42) {
        this.moving = false;
        this.dwellSeconds = 9.5;
      }
      return;
    }
    this.dwellSeconds -= deltaTime;
    if (this.dwellSeconds > 0) return;
    if (this.routeStep >= WAREHOUSE_SECURITY_ZONE_IDS.length - 1) {
      this.phase = 'escape-warning';
      this.escapeSeconds = 8;
      this.callbacks.onEscapeWarning?.();
      return;
    }
    this.routeStep += 1;
    this.currentZone = WAREHOUSE_SECURITY_ZONE_IDS[this.routeStep];
    this.callbacks.onZoneChanged?.(this.currentZone, this.routeStep);
    this.startWalk(WAREHOUSE_SECURITY_ZONES[this.currentZone].routePosition, 1.14);
  }

  private tickEscape(deltaTime: number): void {
    if (!this.rig || this.escapeSeconds === null) return;
    if (!this.tamperPlayed) {
      this.tamperPlayed = true;
      this.rig.gesture('open');
    }
    if (!this.escapeRunStarted) {
      this.escapeRunStarted = true;
      this.startWalk(WAREHOUSE_DOORS['service-c'].handoffPosition, 1.18);
    }
    this.escapeSeconds = Math.max(0, this.escapeSeconds - deltaTime);
    if (this.escapeSeconds > 0) return;
    this.phase = 'escaped';
    this.callbacks.onEscaped?.();
  }

  private startWalk(target: THREE.Vector3, pace: number): void {
    if (!this.rig) return;
    const from = this.rig.root.position;
    this.rig.root.rotation.y = Math.atan2(target.x - from.x, target.z - from.z);
    this.rig.walk(target, {
      facing: this.rig.root.rotation.y,
      locomotion: 'run',
      pace,
      interrupt: true,
    });
    this.moving = true;
  }

  private distanceTo(target: THREE.Vector3): number {
    return this.rig ? this.rig.root.position.distanceTo(target) : Number.POSITIVE_INFINITY;
  }

  private addStolenVest(parent: ENGINE.SceneNode): void {
    const vest = new THREE.MeshStandardMaterial({ color: '#b88b23', roughness: 0.9, transparent: true, opacity: 0.82 });
    const reflective = new THREE.MeshStandardMaterial({
      color: '#d7e6d8',
      emissive: '#718f79',
      emissiveIntensity: 0.8,
      roughness: 0.32,
    });
    for (const side of [-1, 1]) {
      parent.add(
        box('StolenHiVisVest', new THREE.Vector3(0.48, 0.58, 0.026), vest, new THREE.Vector3(0, 1.16, side * 0.14)),
        box('StolenReflectiveStrip', new THREE.Vector3(0.45, 0.05, 0.014), reflective, new THREE.Vector3(0, 1.12, side * 0.158))
      );
    }
    const blankBadge = box(
      'BlankedWorkerBadge',
      new THREE.Vector3(0.17, 0.08, 0.016),
      new THREE.MeshStandardMaterial({ color: '#161c1a', roughness: 0.76 }),
      new THREE.Vector3(0.13, 1.28, 0.163)
    );
    const hood = ENGINE.MeshNode.create({
      name: 'ProceduralIntruderHood',
      geometry: new THREE.SphereGeometry(0.185, 14, 9, 0, Math.PI * 2, 0, Math.PI * 0.66),
      material: new THREE.MeshStandardMaterial({ color: '#171b1b', roughness: 0.9 }),
      position: new THREE.Vector3(0, 1.72, 0),
      castShadow: true,
    });
    parent.add(blankBadge, hood);
  }
}
