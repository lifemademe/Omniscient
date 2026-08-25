import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { placeRigged } from '../view/riggedContact.js';
import { placeCharacter } from '../view/character-node.js';
import type { PlacedCharacter } from '../view/character-node.js';
import { WAREHOUSE_DOORS } from './WarehouseServiceDoors.js';
import { WAREHOUSE_LAYOUT } from './WarehouseLayout.js';

import type { Blackboard, BehaviorStatus as BehaviorStatusType } from '@gnsx/genesys.js';
import type { RiggedContact } from '../view/riggedContact.js';
import { createWarehouseLabelGeometry } from './labelGeometry.js';
import type { GeneratedWarehouseCase, WarehouseDecision, WarehouseDoorId } from './types.js';

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
      geometry: new THREE.BoxGeometry(0.86, 0.58, 0.72),
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
    const seal = ENGINE.MeshNode.create({
      name: 'SecuritySeal',
      geometry: new THREE.CylinderGeometry(0.045, 0.045, 0.018, 12),
      material: new THREE.MeshStandardMaterial({
        color: data.definition.anomaly === 'seal' ? '#b54236' : '#4e8d64',
        emissive: data.definition.anomaly === 'seal' ? '#67130c' : '#153c24',
        emissiveIntensity: 1.15,
        roughness: 0.38,
      }),
    });
    seal.position.set(0.15, 0.61, 0);
    for (const x of [-0.39, 0.39]) {
      const edge = ENGINE.MeshNode.create({
        name: 'CartonEdge',
        geometry: new THREE.BoxGeometry(0.035, 0.57, 0.7),
        material: new THREE.MeshStandardMaterial({ color: '#59472f', roughness: 0.96 }),
      });
      edge.position.set(x, 0.31, 0);
      this.add(edge);
    }
    this.add(box, tape, label, rearLabel, seal);
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

@ENGINE.GameClass()
export class WarehouseWorkerNode extends ENGINE.SceneNode {
  public workerId = '';
  public authorized = true;
  public held = false;
  private rig: RiggedContact | null = null;
  private route: THREE.Vector3[] = [];
  private routeIndex = 0;
  private dwell = 0;
  private musterTarget: THREE.Vector3 | null = null;
  private musterLocalTarget: THREE.Vector3 | null = null;

  public constructor() {
    super();
    this.isRoot = false;
  }

  public configure(id: string, position: THREE.Vector3, route: readonly THREE.Vector3[], vest: string, authorized = true): void {
    this.workerId = id;
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
      material: new THREE.MeshStandardMaterial({ color: '#d8b84f', roughness: 0.55 }),
    });
    helmet.position.set(0, 1.72, 0);
    const badge = ENGINE.MeshNode.create({
      name: 'WorkerBadge',
      geometry: createWarehouseLabelGeometry(0.18, 0.07),
      material: makeLabel(id.slice(-4), '#e0a24c'),
    });
    badge.position.set(0.13, 1.25, 0.155);
    this.add(rig.root, vestRoot, helmet, badge);
    const tree = ENGINE.BehaviorTreeNode.create({
      name: 'WarehouseWorkerBehavior',
      tickInterval: 0.05,
      rootNode: new ENGINE.SelectorNode({ children: [new WorkerRouteAction({ name: 'Follow warehouse route' })] }),
    });
    this.add(tree);
    this.setTickEnabled(true);
  }

  public advanceRoute(deltaTime: number): void {
    if (this.held || this.route.length === 0) return;
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
  }

  public resetToInbound(): void {
    if (this.rig) this.rig.root.position.set(0, 0, 0);
    this.musterTarget = null;
    this.musterLocalTarget = null;
    this.held = false;
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
  /** Motion only - in Warehouse 07 this draws nothing. See createWarehouseVisitor. */
  rig: RiggedContact;
  /** The visible body, when there is one. Officers do not have one yet. */
  figure?: PlacedCharacter;
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
  /*
   * The BODY is procedural. The rig is kept only for motion.
   *
   * ## Why there are two of these
   *
   * No `placeRigged` character has ever rendered in Warehouse 07 - not this visitor, not the
   * workers, not the intruder. The node is real every time: visible, parented, at exactly the
   * right position, with a loaded mesh measuring 1.85 x 1.72 metres. It simply never draws.
   * Reported as "no one is there", which was the literal truth on screen while every property
   * you can print said otherwise.
   *
   * It is not the 800m world offset, not frustum culling, and not load timing - all three were
   * tested and cleared, and a plain `THREE.Mesh` parented to this very root renders perfectly.
   * What fails is specifically a `ModelMeshNode` nested under a `SceneNode`; the same node
   * added directly to the rig draws. The strongest remaining lead is that `loadModel` bakes
   * each mesh's world pose as it reparents them, against a matrix that is not the final one.
   * Unproven, and three confident fixes for it were wrong.
   *
   * So the visitor stops depending on that path. `createCharacter` builds people out of plain
   * `BufferGeometry` - the same class of object as the marker that proved the position was
   * fine - and it is this game's own character system, already driving every contact in
   * `view/scenes.ts`. Seeded off the visitor's name, so the person waiting at the door is
   * consistent for that name and different from the last one, rather than one of six GLBs on
   * rotation.
   *
   * The rig stays because `WarehousePursuit` drives the suspect through it - `rig.walk` for
   * the chase, `rig.gesture` for the recorded hatch test - and reimplementing that surface is
   * a bigger job than this one. It contributes no pixels; it is a transform and a behaviour
   * clock, and the figure hangs off its root so everything it moves moves the body too. When
   * the ModelMeshNode fault is understood, this whole comment and one of these two objects
   * goes away.
   */
  const figure = placeCharacter(`VisitorFigure-${name}`, {
    seed: name,
    position: new THREE.Vector3(0, 0, 0),
  });
  rig.root.add(figure.root);
  return { root: rig.root, rig, figure };
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
