import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { placeRigged } from '../view/riggedContact.js';
import { WAREHOUSE_DOORS } from './WarehouseServiceDoors.js';
import { WAREHOUSE_LAYOUT } from './WarehouseLayout.js';

import type { Blackboard, BehaviorStatus as BehaviorStatusType } from '@gnsx/genesys.js';
import type { RiggedContact } from '../view/riggedContact.js';
import { createWarehouseLabelGeometry } from './labelGeometry.js';
import type { GeneratedWarehouseCase, WarehouseDecision, WarehouseDoorId, WarehouseSecurityZoneId } from './types.js';

export const WAREHOUSE_CARGO_SIZE = Object.freeze({ width: 0.86, height: 0.58, depth: 0.72 });
export const WAREHOUSE_CARGO_HORIZONTAL_RADIUS = Math.hypot(
  WAREHOUSE_CARGO_SIZE.width * 0.5,
  WAREHOUSE_CARGO_SIZE.depth * 0.5
);

function makeLabel(text: string, colour = '#d8ffb0'): THREE.MeshBasicMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#07100d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#497b66';
    ctx.lineWidth = 8;
    ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
    ctx.fillStyle = colour;
    ctx.font = 'bold 64px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map, transparent: false, toneMapped: false });
}

@ENGINE.GameClass()
export class WarehouseCargoNode extends ENGINE.SceneNode {
  public caseData: GeneratedWarehouseCase | null = null;
  public decision: WarehouseDecision | null = null;
  public carried = false;

  public constructor() {
    super();
    this.isRoot = false;
  }

  public configure(data: GeneratedWarehouseCase): void {
    this.caseData = data;
    this.setName(`Cargo-${data.packageId}`);
    const material = new THREE.MeshStandardMaterial({
      color: data.definition.critical ? '#5a332d' : '#6d5a3d',
      roughness: 0.94,
      metalness: 0.01,
    });
    const box = ENGINE.MeshNode.create({
      name: 'Carton',
      geometry: new THREE.BoxGeometry(
        WAREHOUSE_CARGO_SIZE.width,
        WAREHOUSE_CARGO_SIZE.height,
        WAREHOUSE_CARGO_SIZE.depth
      ),
      material,
      castShadow: true,
      receiveShadow: true,
    });
    box.position.y = 0.31;
    const tape = ENGINE.MeshNode.create({
      name: 'PackingTape',
      geometry: new THREE.BoxGeometry(0.13, 0.596, 0.735),
      material: new THREE.MeshStandardMaterial({ color: '#b6a37a', roughness: 0.72 }),
    });
    tape.position.y = 0.31;
    const labelMaterial = makeLabel(data.packageId);
    const label = ENGINE.MeshNode.create({
      name: 'CargoLabelFront',
      geometry: createWarehouseLabelGeometry(0.52, 0.13),
      material: labelMaterial,
    });
    label.position.set(0, 0.34, 0.365);
    const rearLabel = ENGINE.MeshNode.create({
      name: 'CargoLabelRear',
      geometry: createWarehouseLabelGeometry(0.52, 0.13),
      material: labelMaterial,
    });
    rearLabel.position.set(0, 0.34, -0.365);
    rearLabel.rotation.y = Math.PI;
    /*
     * The seal, at a size the mission can actually be played through.
     *
     * "Seal intact" is one of the two things the audit asks the player to judge, and it was a
     * 4.5cm disc lying flat on the lid - a coloured dot, invisible edge-on, and readable only
     * by flying the drone directly over the carton and looking straight down. A mechanic the
     * player has to fight the camera to perceive is not a mechanic.
     *
     * It is a tamper strip now: a band across the lid seam and down the front face, which is
     * what a security seal on a carton actually looks like and which reads from anywhere in
     * front of the box. Broken is expressed as GEOMETRY rather than as colour - the band is
     * built in two pieces with a gap, and the front tail hangs at an angle. That matters for
     * the colour-blind gate on the acceptance list: intact and broken differ in shape, not
     * just in red versus green.
     */
    const compromised = data.definition.anomaly === 'seal';
    const sealMaterial = new THREE.MeshStandardMaterial({
      color: compromised ? '#b54236' : '#4e8d64',
      emissive: compromised ? '#67130c' : '#153c24',
      emissiveIntensity: 1.15,
      roughness: 0.38,
    });
    const sealParts: ENGINE.MeshNode[] = [];
    const addSeal = (
      name: string,
      geometry: THREE.BufferGeometry,
      position: THREE.Vector3,
      rotationX = 0
    ): void => {
      const node = ENGINE.MeshNode.create({ name, geometry, material: sealMaterial });
      node.position.copy(position);
      node.rotation.x = rotationX;
      sealParts.push(node);
    };
    if (compromised) {
      // Two stubs and a gap where the band was cut, plus a tail peeled off the front.
      addSeal('SecuritySeal', new THREE.BoxGeometry(0.052, 0.014, 0.22), new THREE.Vector3(0.27, 0.605, -0.24));
      addSeal('SecuritySeal', new THREE.BoxGeometry(0.052, 0.014, 0.13), new THREE.Vector3(0.27, 0.605, 0.29));
      addSeal('SecuritySealTail', new THREE.BoxGeometry(0.052, 0.19, 0.012), new THREE.Vector3(0.27, 0.5, 0.44), -0.7);
    } else {
      addSeal('SecuritySeal', new THREE.BoxGeometry(0.052, 0.014, 0.74), new THREE.Vector3(0.27, 0.605, 0));
      addSeal('SecuritySeal', new THREE.BoxGeometry(0.052, 0.2, 0.012), new THREE.Vector3(0.27, 0.5, 0.367));
    }

    /*
     * A lid, so the carton is a closed box rather than a solid one.
     *
     * Two flaps meeting just off centre with a seam between them, inset a few millimetres so
     * the top edge catches light separately from the sides. It is the difference between a
     * cardboard box and a cube the colour of cardboard, and this prop is held up in front of
     * the camera on every successful delivery.
     */
    for (const [name, width, offset] of [['CartonFlapLeft', 0.34, -0.185], ['CartonFlapRight', 0.34, 0.185]] as const) {
      const flap = ENGINE.MeshNode.create({
        name,
        geometry: new THREE.BoxGeometry(0.83, 0.022, width),
        material: new THREE.MeshStandardMaterial({ color: '#7d6845', roughness: 0.95 }),
        castShadow: true,
      });
      flap.position.set(0, 0.606, offset);
      this.add(flap);
    }

    for (const x of [-0.39, 0.39]) {
      const edge = ENGINE.MeshNode.create({
        name: 'CartonEdge',
        geometry: new THREE.BoxGeometry(0.035, 0.57, 0.7),
        material: new THREE.MeshStandardMaterial({ color: '#59472f', roughness: 0.96 }),
      });
      edge.position.set(x, 0.31, 0);
      this.add(edge);
    }
    this.add(box, tape, label, rearLabel, ...sealParts);
  }
}

class WorkerRouteAction extends ENGINE.BehaviorAction {
  protected override onInitialize(_blackboard: Blackboard): void {}

  protected override async onUpdate(blackboard: Blackboard, deltaTime: number): Promise<BehaviorStatusType> {
    const owner = blackboard.getOwner();
    if (!(owner instanceof WarehouseWorkerNode)) return ENGINE.BehaviorStatus.Failure;
    owner.advanceRoute(deltaTime);
    return ENGINE.BehaviorStatus.Running;
  }
}

class WorkerFugitiveAction extends ENGINE.BehaviorAction {
  protected override onInitialize(_blackboard: Blackboard): void {}

  protected override async onUpdate(blackboard: Blackboard, deltaTime: number): Promise<BehaviorStatusType> {
    const owner = blackboard.getOwner();
    if (!(owner instanceof WarehouseWorkerNode) || !owner.isFugitiveActive()) {
      return ENGINE.BehaviorStatus.Failure;
    }
    owner.advanceFugitive(deltaTime);
    return ENGINE.BehaviorStatus.Running;
  }
}

export interface WarehouseWorkerStyle {
  displayName?: string;
  packageId?: string;
  helmet?: string;
  gloves?: string;
  equipmentIndex?: number;
}

export interface WarehouseWorkerFugitiveWaypoint {
  zone: WarehouseSecurityZoneId;
  position: THREE.Vector3;
  concealed: boolean;
}

export interface WarehouseWorkerFugitiveCallbacks {
  onZoneChanged?: (zone: WarehouseSecurityZoneId) => void;
  onEscapeWarning?: () => void;
  onEscaped?: () => void;
}

export type WarehouseWorkerState =
  | 'routine'
  | 'inspection'
  | 'alerted'
  | 'flee'
  | 'seek-cover'
  | 'crouch-hide'
  | 'react-observed'
  | 'relocate'
  | 'final-escape'
  | 'contained';

@ENGINE.GameClass()
export class WarehouseWorkerNode extends ENGINE.SceneNode {
  public workerId = '';
  public displayName = '';
  public packageId = '';
  public authorized = true;
  public held = false;
  public state: WarehouseWorkerState = 'routine';
  public fugitiveZone: WarehouseSecurityZoneId = 'receiving';
  public escapeSeconds: number | null = null;
  private rig: RiggedContact | null = null;
  private route: THREE.Vector3[] = [];
  private routeIndex = 0;
  private dwell = 0;
  private musterTarget: THREE.Vector3 | null = null;
  private musterLocalTarget: THREE.Vector3 | null = null;
  private fugitiveRoute: WarehouseWorkerFugitiveWaypoint[] = [];
  private fugitiveIndex = 0;
  private fugitiveTarget: THREE.Vector3 | null = null;
  private fugitiveLocalTarget: THREE.Vector3 | null = null;
  private hideSeconds = 0;
  private observedSeconds = 0;
  private fugitivePaused = false;
  private fugitiveCallbacks: WarehouseWorkerFugitiveCallbacks = {};

  public constructor() {
    super();
    this.isRoot = false;
  }

  public configure(
    id: string,
    position: THREE.Vector3,
    route: readonly THREE.Vector3[],
    vest: string,
    authorized = true,
    style: WarehouseWorkerStyle = {}
  ): void {
    this.workerId = id;
    this.displayName = style.displayName ?? id;
    this.packageId = style.packageId ?? '';
    this.authorized = authorized;
    this.position.copy(position);
    this.route = route.map((point) => point.clone());
    this.setName(`Worker-${id}`);
    const rig = placeRigged(`WorkerRig-${id}`, {
      modelUrl: '@project/assets/models/Tomas.glb',
      position: new THREE.Vector3(),
      rotation: new THREE.Euler(0, Math.PI, 0),
      height: 1.76,
      clip: true,
      settleWrists: 0.35,
    });
    this.rig = rig;
    const vestRoot = ENGINE.SceneNode.create({ name: 'ProceduralHiVisVest' });
    const vestMaterial = new THREE.MeshStandardMaterial({ color: vest, roughness: 0.82, transparent: true, opacity: 0.86 });
    const reflectiveMaterial = new THREE.MeshStandardMaterial({
      color: '#c9d8b8',
      emissive: '#7f9b73',
      emissiveIntensity: 0.75,
      roughness: 0.36,
    });
    for (const side of [-1, 1]) {
      const panel = ENGINE.MeshNode.create({
        name: side > 0 ? 'VestFront' : 'VestBack',
        geometry: new THREE.BoxGeometry(0.46, 0.54, 0.028),
        material: vestMaterial,
      });
      panel.position.set(0, 1.16, side * 0.135);
      const reflector = ENGINE.MeshNode.create({
        name: 'VestReflector',
        geometry: new THREE.BoxGeometry(0.43, 0.045, 0.012),
        material: reflectiveMaterial,
      });
      reflector.position.set(0, 1.13, side * 0.155);
      vestRoot.add(panel, reflector);
    }
    for (const x of [-0.17, 0.17]) {
      const strap = ENGINE.MeshNode.create({
        name: 'VestShoulderStrap',
        geometry: new THREE.BoxGeometry(0.075, 0.3, 0.29),
        material: vestMaterial,
      });
      strap.position.set(x, 1.38, 0);
      vestRoot.add(strap);
    }
    const helmet = ENGINE.MeshNode.create({
      name: 'ProceduralHelmet',
      geometry: new THREE.SphereGeometry(0.15, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.58),
      material: new THREE.MeshStandardMaterial({ color: style.helmet ?? '#d8b84f', roughness: 0.55 }),
    });
    helmet.position.set(0, 1.72, 0);
    const badge = ENGINE.MeshNode.create({
      name: 'WorkerBadge',
      geometry: createWarehouseLabelGeometry(0.18, 0.07),
      material: makeLabel(id.slice(-4), '#e0a24c'),
    });
    badge.position.set(0.13, 1.25, 0.155);
    const contactShadow = ENGINE.MeshNode.create({
      name: 'WorkerContactShadow',
      geometry: new THREE.CircleGeometry(0.42, 20),
      material: new THREE.MeshBasicMaterial({
        color: '#020504',
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        toneMapped: false,
      }),
    });
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = 0.012;
    const gloves = new THREE.MeshStandardMaterial({ color: style.gloves ?? '#263532', roughness: 0.9 });
    const equipment = ENGINE.SceneNode.create({ name: `WorkerEquipment-${style.equipmentIndex ?? 0}` });
    for (const side of [-1, 1]) {
      const glove = ENGINE.MeshNode.create({
        name: 'ProtectiveGlove',
        geometry: new THREE.BoxGeometry(0.09, 0.14, 0.08),
        material: gloves,
      });
      glove.position.set(side * 0.38, 0.88, 0.02);
      equipment.add(glove);
    }
    if ((style.equipmentIndex ?? 0) % 2 === 0) {
      const pouch = ENGINE.MeshNode.create({
        name: 'ScannerPouch',
        geometry: new THREE.BoxGeometry(0.18, 0.24, 0.11),
        material: new THREE.MeshStandardMaterial({ color: '#202b2a', roughness: 0.84 }),
      });
      pouch.position.set(-0.26, 0.86, -0.12);
      equipment.add(pouch);
    }
    this.add(rig.root, vestRoot, helmet, badge, equipment, contactShadow);
    const tree = ENGINE.BehaviorTreeNode.create({
      name: 'WarehouseWorkerBehavior',
      tickInterval: 0.05,
      rootNode: new ENGINE.SelectorNode({ children: [
        new WorkerFugitiveAction({ name: 'Inbound audit fugitive response' }),
        new WorkerRouteAction({ name: 'Follow warehouse route' }),
      ] }),
    });
    this.add(tree);
    this.setTickEnabled(true);
  }

  public advanceRoute(deltaTime: number): void {
    if (this.state !== 'routine' || this.held || this.route.length === 0) return;
    if (this.dwell > 0) {
      this.dwell -= deltaTime;
      return;
    }
    const target = this.route[this.routeIndex];
    const delta = target.clone().sub(this.position);
    delta.y = 0;
    if (delta.lengthSq() < 0.05) {
      this.routeIndex = (this.routeIndex + 1) % this.route.length;
      this.dwell = 1.2;
      return;
    }
    const step = Math.min(delta.length(), deltaTime * 1.15);
    delta.normalize();
    this.position.addScaledVector(delta, step);
    this.rotation.y = Math.atan2(delta.x, delta.z);
  }

  public setInspectionPosition(position: THREE.Vector3): void {
    this.resumeRoute();
    this.state = 'inspection';
    this.held = true;
    this.position.copy(position);
    this.rotation.y = 0;
    if (this.rig) {
      this.rig.root.position.set(0, 0, 0);
      this.rig.setStance('stand');
    }
    this.visible = true;
  }

  public isFugitiveActive(): boolean {
    return !['routine', 'inspection', 'contained'].includes(this.state);
  }

  public startFugitive(
    waypoints: readonly WarehouseWorkerFugitiveWaypoint[],
    callbacks: WarehouseWorkerFugitiveCallbacks = {}
  ): void {
    this.fugitiveRoute = waypoints.map((entry) => ({ ...entry, position: entry.position.clone() }));
    this.fugitiveCallbacks = callbacks;
    this.fugitiveIndex = 0;
    this.fugitiveTarget = null;
    this.fugitiveLocalTarget = null;
    this.hideSeconds = 0;
    this.observedSeconds = 0;
    this.escapeSeconds = null;
    this.held = true;
    this.state = 'alerted';
    this.rig?.setStance('stand');
  }

  public setFugitivePaused(paused: boolean): void {
    this.fugitivePaused = paused;
  }

  public contain(): void {
    this.foldRigTravel();
    this.state = 'contained';
    this.escapeSeconds = null;
    this.rig?.setStance('crouch');
  }

  public resetFugitiveAtReceiving(position: THREE.Vector3): void {
    this.position.copy(position);
    if (this.rig) this.rig.root.position.set(0, 0, 0);
    this.state = 'alerted';
    this.fugitiveIndex = 0;
    this.fugitiveTarget = null;
    this.fugitiveLocalTarget = null;
    this.escapeSeconds = null;
    this.observedSeconds = 0;
  }

  public subjectPosition(): THREE.Vector3 {
    return this.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1.05, 0));
  }

  private foldRigTravel(): void {
    if (!this.rig) return;
    this.position.add(this.rig.root.position);
    this.rig.root.position.set(0, 0, 0);
    this.fugitiveTarget = null;
    this.fugitiveLocalTarget = null;
  }

  private beginFugitiveLeg(index: number): void {
    const point = this.fugitiveRoute[index];
    if (!point || !this.rig) return;
    this.fugitiveIndex = index;
    this.fugitiveZone = point.zone;
    this.fugitiveCallbacks.onZoneChanged?.(point.zone);
    this.fugitiveTarget = point.position.clone();
    this.fugitiveLocalTarget = point.position.clone().sub(this.position);
    const final = index === this.fugitiveRoute.length - 1;
    this.state = final ? 'final-escape' : point.concealed ? 'seek-cover' : 'flee';
    this.rig.setStance(point.concealed ? 'crouch' : 'stand');
    this.rig.walk(this.fugitiveLocalTarget, {
      facing: Math.atan2(this.fugitiveLocalTarget.x, this.fugitiveLocalTarget.z),
      locomotion: final || !point.concealed ? 'run' : 'crouchWalk',
      pace: final ? 0.96 : point.concealed ? 1.06 : 0.92,
      interrupt: true,
    });
  }

  /**
   * Being visible is not the same as being scanned. A concealed impostor waits until the
   * optical camera has held them clearly in frame, then reacts and relocates; a quick LMB
   * still records the target before they can run. This makes the search player-driven
   * instead of moving the suspect around the warehouse on an invisible timer.
   */
  public setClearlyObserved(observed: boolean, deltaTime: number): void {
    if (this.state !== 'crouch-hide') {
      this.observedSeconds = 0;
      return;
    }
    this.observedSeconds = observed
      ? this.observedSeconds + deltaTime
      : Math.max(0, this.observedSeconds - deltaTime * 1.5);
    if (this.observedSeconds < 0.55) return;
    this.observedSeconds = 0;
    this.state = 'react-observed';
    this.hideSeconds = 0.24;
    this.rig?.setStance('stand');
  }

  public advanceFugitive(deltaTime: number): void {
    if (this.fugitivePaused || this.state === 'contained') return;
    if (this.state === 'alerted') {
      this.beginFugitiveLeg(0);
      return;
    }
    if (this.fugitiveTarget && this.fugitiveLocalTarget && this.rig) {
      if (this.rig.root.position.distanceTo(this.fugitiveLocalTarget) > 0.13) return;
      this.position.copy(this.fugitiveTarget);
      this.rig.root.position.set(0, 0, 0);
      this.fugitiveTarget = null;
      this.fugitiveLocalTarget = null;
      const point = this.fugitiveRoute[this.fugitiveIndex];
      if (this.fugitiveIndex === this.fugitiveRoute.length - 1) {
        this.escapeSeconds = 8;
        this.fugitiveCallbacks.onEscapeWarning?.();
        return;
      }
      this.state = point?.concealed ? 'crouch-hide' : 'relocate';
      this.rig.setStance(point?.concealed ? 'crouch' : 'stand');
      this.observedSeconds = 0;
      this.hideSeconds = point?.concealed ? Number.POSITIVE_INFINITY : 0.45;
      return;
    }
    if (this.state === 'final-escape' && this.escapeSeconds !== null) {
      this.escapeSeconds = Math.max(0, this.escapeSeconds - deltaTime);
      if (this.escapeSeconds <= 0) this.fugitiveCallbacks.onEscaped?.();
      return;
    }
    this.hideSeconds -= deltaTime;
    if (this.hideSeconds <= 0) {
      this.state = 'relocate';
      this.beginFugitiveLeg(Math.min(this.fugitiveRoute.length - 1, this.fugitiveIndex + 1));
    }
  }

  public moveToMuster(position: THREE.Vector3): void {
    this.held = true;
    this.musterTarget = position.clone();
    this.musterLocalTarget = position.clone().sub(this.position);
    this.rig?.walk(this.musterLocalTarget, {
      facing: Math.atan2(this.musterLocalTarget.x, this.musterLocalTarget.z),
      locomotion: 'run',
      pace: 0.92,
      interrupt: true,
    });
    this.visible = true;
  }

  public resumeRoute(): void {
    if (this.rig && this.musterLocalTarget) {
      this.position.add(this.rig.root.position);
      this.rig.root.position.set(0, 0, 0);
    }
    this.musterTarget = null;
    this.musterLocalTarget = null;
    this.held = false;
    this.state = 'routine';
    this.escapeSeconds = null;
    this.rig?.setStance('stand');
  }

  public resetToInbound(): void {
    if (this.rig) this.rig.root.position.set(0, 0, 0);
    this.musterTarget = null;
    this.musterLocalTarget = null;
    this.held = false;
    this.state = 'routine';
    this.dwell = 0;
    this.routeIndex = this.route.length > 1 ? 1 : 0;
    if (this.route[0]) this.position.copy(this.route[0]);
  }

  public override tickPrePhysics(deltaTime: number): void {
    super.tickPrePhysics(deltaTime);
    this.rig?.idle(deltaTime);
    if (
      this.rig
      && this.musterTarget
      && this.musterLocalTarget
      && this.rig.root.position.distanceTo(this.musterLocalTarget) < 0.12
    ) {
      this.position.copy(this.musterTarget);
      this.rig.root.position.set(0, 0, 0);
      this.musterTarget = null;
      this.musterLocalTarget = null;
    }
  }
}

export interface WarehouseVisitor {
  root: ENGINE.SceneNode;
  rig: RiggedContact;
}

const VISITOR_MODELS = [
  '@project/assets/models/Mirela.glb',
  '@project/assets/models/Ileana.glb',
  '@project/assets/models/Adaeze.glb',
  '@project/assets/models/Sanda.glb',
  '@project/assets/models/Dorin.glb',
  '@project/assets/models/Vasile.glb',
] as const;

export function createWarehouseVisitor(index: number, name: string, doorId: WarehouseDoorId): WarehouseVisitor {
  const model = VISITOR_MODELS[index % VISITOR_MODELS.length];
  const layout = WAREHOUSE_DOORS[doorId];
  const rig = placeRigged(`Visitor-${name}`, {
    modelUrl: model,
    position: layout.visitorPosition,
    rotation: new THREE.Euler(0, layout.visitorFacing, 0),
    height: 1.72,
    clip: true,
    settleWrists: 0.3,
  });
  return { root: rig.root, rig };
}

/** Local response officer. Lucian's police mesh is deliberately anonymized by procedural rain gear. */
export function createWarehouseOfficer(doorId: WarehouseDoorId): WarehouseVisitor {
  const route = WAREHOUSE_DOORS[doorId].pursuit;
  return createLocalResponseOfficer('WarehouseLocalResponseOfficer', route.officerStart);
}

export function createWarehouseInteriorOfficer(position = new THREE.Vector3(-3.8, 0, WAREHOUSE_LAYOUT.drone.minZ + 0.8)): WarehouseVisitor {
  return createLocalResponseOfficer(
    'WarehouseInteriorResponseOfficer',
    position
  );
}

function createLocalResponseOfficer(name: string, position: THREE.Vector3): WarehouseVisitor {
  const rig = placeRigged(name, {
    modelUrl: '@project/assets/models/Lucian.glb',
    position,
    height: 1.78,
    clip: true,
    settleWrists: 0.2,
  });
  const rainGear = ENGINE.SceneNode.create({ name: 'ProceduralLocalResponseRainGear' });
  const coat = new THREE.MeshStandardMaterial({ color: '#111a22', roughness: 0.42, metalness: 0.18 });
  const reflective = new THREE.MeshStandardMaterial({
    color: '#b9d5c8',
    emissive: '#729787',
    emissiveIntensity: 1.05,
    roughness: 0.28,
  });
  const visor = new THREE.MeshPhysicalMaterial({
    color: '#17272d',
    transparent: true,
    opacity: 0.72,
    roughness: 0.14,
    metalness: 0.34,
  });
  const cape = ENGINE.MeshNode.create({
    name: 'ResponseRainCape',
    geometry: new THREE.ConeGeometry(0.43, 0.92, 10, 1, true),
    material: coat,
    castShadow: true,
  });
  cape.position.set(0, 1.24, -0.05);
  const helmet = ENGINE.MeshNode.create({
    name: 'ResponseHelmet',
    geometry: new THREE.SphereGeometry(0.18, 16, 9, 0, Math.PI * 2, 0, Math.PI * 0.62),
    material: coat,
    castShadow: true,
  });
  helmet.position.set(0, 1.73, 0);
  const faceShield = ENGINE.MeshNode.create({
    name: 'ResponseFaceShield',
    geometry: new THREE.BoxGeometry(0.27, 0.13, 0.035),
    material: visor,
  });
  faceShield.position.set(0, 1.66, 0.145);
  const chestBand = ENGINE.MeshNode.create({
    name: 'ResponseReflectiveBand',
    geometry: new THREE.BoxGeometry(0.48, 0.055, 0.31),
    material: reflective,
  });
  chestBand.position.set(0, 1.3, 0);
  const backBand = ENGINE.MeshNode.create({
    name: 'ResponseBackBand',
    geometry: new THREE.BoxGeometry(0.45, 0.055, 0.025),
    material: reflective,
  });
  backBand.position.set(0, 1.16, -0.23);
  rainGear.add(cape, helmet, faceShield, chestBand, backBand);
  rig.root.add(rainGear);
  return { root: rig.root, rig };
}
