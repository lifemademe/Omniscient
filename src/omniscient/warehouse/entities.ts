import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { placeRigged } from '../view/riggedContact.js';

import type { Blackboard, BehaviorStatus as BehaviorStatusType } from '@gnsx/genesys.js';
import type { RiggedContact } from '../view/riggedContact.js';
import type { GeneratedWarehouseCase, WarehouseDecision } from './types.js';

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
  return new THREE.MeshBasicMaterial({ map, transparent: false });
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
    const label = ENGINE.MeshNode.create({
      name: 'CargoLabel',
      geometry: new THREE.PlaneGeometry(0.52, 0.13),
      material: makeLabel(data.packageId),
    });
    label.position.set(0, 0.34, 0.365);
    this.add(box, tape, label);
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
    const vestMesh = ENGINE.MeshNode.create({
      name: 'ProceduralHiVisVest',
      geometry: new THREE.BoxGeometry(0.48, 0.62, 0.24),
      material: new THREE.MeshStandardMaterial({ color: vest, roughness: 0.82, transparent: true, opacity: 0.78 }),
    });
    vestMesh.position.set(0, 1.13, 0.02);
    const helmet = ENGINE.MeshNode.create({
      name: 'ProceduralHelmet',
      geometry: new THREE.SphereGeometry(0.15, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.58),
      material: new THREE.MeshStandardMaterial({ color: '#d8b84f', roughness: 0.55 }),
    });
    helmet.position.set(0, 1.72, 0);
    const badge = ENGINE.MeshNode.create({
      name: 'WorkerBadge',
      geometry: new THREE.PlaneGeometry(0.18, 0.07),
      material: makeLabel(id.slice(-4), '#e0a24c'),
    });
    badge.position.set(0.14, 1.2, 0.13);
    this.add(rig.root, vestMesh, helmet, badge);
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

  public override tickPrePhysics(deltaTime: number): void {
    super.tickPrePhysics(deltaTime);
    this.rig?.idle(deltaTime);
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
  '@project/assets/models/Lucian.glb',
  '@project/assets/models/Vasile.glb',
] as const;

export function createWarehouseVisitor(index: number, name: string): WarehouseVisitor {
  const model = VISITOR_MODELS[index % VISITOR_MODELS.length];
  const rig = placeRigged(`Visitor-${name}`, {
    modelUrl: model,
    position: new THREE.Vector3(0, 0, 19.8),
    rotation: new THREE.Euler(0, Math.PI, 0),
    height: 1.72,
    clip: true,
    settleWrists: 0.3,
  });
  return { root: rig.root, rig };
}
