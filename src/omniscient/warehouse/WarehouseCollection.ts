import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';
import type { WarehouseCargoNode, WarehouseVisitor } from './entities.js';
import type { WarehouseDoorLayout } from './WarehouseServiceDoors.js';

const STEEL = new THREE.MeshStandardMaterial({ color: '#58655d', roughness: 0.85, metalness: 0.25 });
const RUBBER = new THREE.MeshStandardMaterial({ color: '#161e1c', roughness: 1 });
const DECK = new THREE.MeshStandardMaterial({ color: '#89734e', roughness: 0.96 });
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const FLOOR = 0.98;

function part(parent: THREE.Object3D, name: string, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** One persistent cart per entrance, with a tick-owned, interruptible transfer sequence. */
export class WarehouseCollection {
  public readonly root: ENGINE.SceneNode;
  private readonly cart = new THREE.Group();
  private readonly tray = new THREE.Group();
  private readonly wheels: THREE.Mesh[] = [];
  private readonly rails: THREE.Mesh[] = [];
  private readonly outriggers: THREE.Mesh[] = [];
  private readonly received: Array<{ cargo: WarehouseCargoNode; slot: number }> = [];
  private readonly scratch = new THREE.Vector3();
  private readonly left = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly cartFacing = new THREE.Quaternion();
  private readonly parentFacing = new THREE.Quaternion();
  private readonly lastCart = new THREE.Vector3();
  private receiver: WarehouseVisitor | null = null;
  private queue: WarehouseCargoNode[] = [];
  private waypoints: THREE.Vector3[] = [];
  private phase: 'idle' | 'positioning' | 'opening' | 'align' | 'lift' | 'extend' | 'align-slot' | 'receive' | 'return-slot' | 'return-center' | 'retract' | 'grip' | 'depart' | 'closing' = 'idle';
  private clock = 0;
  private from = new THREE.Vector3();
  private to = new THREE.Vector3();
  private index = 0;
  private reduced = false;
  private complete: (() => void) | null = null;
  private direction: number;

  public constructor(private readonly layout: WarehouseDoorLayout,
    private readonly hatch: { setOpen: (open: boolean) => void; isOpen: () => boolean; isClosed: () => boolean }) {
    this.root = ENGINE.SceneNode.create({ name: `Collection-${layout.letter}`, position: layout.rootPosition.clone(), rotation: new THREE.Euler(0, layout.rootRotation, 0) });
    const exit = layout.pursuit.officerStart.clone().sub(layout.rootPosition).applyAxisAngle(Y_AXIS, -layout.rootRotation);
    this.direction = exit.x >= 0 ? 1 : -1;
    this.cart.name = 'CollectionTrolley';
    this.cart.position.set(0.64, 0, 2.8);
    this.cart.rotation.y = this.direction * Math.PI / 2;
    this.root.add(this.cart);
    part(this.cart, 'TrolleyDeck', new THREE.BoxGeometry(1.04, 0.07, 1.92), DECK, 0, FLOOR - 0.035, 0);
    for (const x of [-0.45, 0.45]) {
      part(this.cart, 'TrolleySideRail', new THREE.BoxGeometry(0.045, 0.08, 1.98), STEEL, x, FLOOR + 0.01, 0);
      for (const z of [-0.73, 0.73]) {
        part(this.cart, 'TrolleyLeg', new THREE.BoxGeometry(0.055, 0.77, 0.055), STEEL, x, 0.53, z);
        const wheel = part(this.cart, 'TrolleyWheel', new THREE.CylinderGeometry(0.14, 0.14, 0.085, 10), RUBBER, x, 0.14, z);
        wheel.rotation.z = Math.PI / 2;
        this.wheels.push(wheel);
      }
      part(this.cart, 'TrolleyHandleUpright', new THREE.BoxGeometry(0.045, 0.4, 0.045), STEEL, x, 1.02, -1.04);
    }
    part(this.cart, 'TrolleyPushHandle', new THREE.BoxGeometry(0.94, 0.055, 0.055), RUBBER, 0, 1.2, -1.04);
    this.tray.name = 'CollectionTransferTray';
    this.root.add(this.tray);
    part(this.tray, 'TransferPlatform', new THREE.BoxGeometry(0.96, 0.04, 0.84), STEEL, 0, -0.025, 0);
    for (const x of [-0.44, 0.44]) part(this.tray, 'TransferLip', new THREE.BoxGeometry(0.025, 0.025, 0.84), RUBBER, x, 0, 0);
    for (const x of [0.36, 0.92]) {
      part(this.root, 'CollectionLiftColumn', new THREE.BoxGeometry(0.12, 0.89, 0.18), STEEL, x, 0.445, -1.4);
      const rail = part(this.root, 'CollectionTelescopicRail', new THREE.BoxGeometry(0.1, 0.08, 1), STEEL, x, 0.92, -1.4);
      this.rails.push(rail);
      this.outriggers.push(part(this.root, 'CollectionOuterRail', new THREE.BoxGeometry(0.1, 0.08, 1), STEEL, x, 0.92, 1.1));
    }
    // A supported sill bridges the wall; the tray carries the load throughout its travel.
    part(this.root, 'CollectionHatchSill', new THREE.BoxGeometry(1.08, 0.06, 1.3), STEEL, 0.64, 0.855, 0.55);
    for (const x of [0.18, 1.1]) part(this.root, 'CollectionSillBracket', new THREE.BoxGeometry(0.07, 0.36, 0.6), STEEL, x, 0.65, 0.7);
    this.reset();
  }

  public get active(): boolean { return this.phase !== 'idle'; }

  public start(cargo: WarehouseCargoNode[], receiver: WarehouseVisitor, reduced: boolean, complete: () => void): void {
    if (!cargo.length) throw new Error('Collection requires a staged load');
    this.reset();
    this.queue = cargo;
    this.receiver = receiver;
    this.reduced = reduced;
    this.complete = complete;
    this.root.updateWorldMatrix(true, true);
    // Step sideways before moving out: the visitor's original waiting mark at A/C
    // is directly in the goods path. This route never crosses the parked trolley.
    const waiting = this.root.worldToLocal(receiver.root.getWorldPosition(new THREE.Vector3()));
    const sideX = 0.64 - this.direction * 1.52;
    this.waypoints = [new THREE.Vector3(sideX, 0, waiting.z), new THREE.Vector3(sideX, 0, 2.8)];
    this.phase = 'positioning';
    this.walkTo(this.waypoints[0]);
    for (const load of cargo) load.carried = false;
  }

  public reset(): void {
    this.complete = null;
    this.phase = 'idle';
    this.queue = [];
    this.received.length = 0;
    this.waypoints = [];
    this.receiver = null;
    this.index = 0;
    this.clock = 0;
    this.cart.position.set(0.64, 0, 2.8);
    this.cart.rotation.y = this.direction * Math.PI / 2;
    this.lastCart.copy(this.cart.position);
    this.tray.position.set(0.64, FLOOR, -1.4);
    this.tray.visible = false;
    for (const rail of this.rails) rail.visible = false;
    for (const rail of this.outriggers) rail.visible = false;
    this.hatch.setOpen(false);
  }

  private cargoLocal(cargo: WarehouseCargoNode): THREE.Vector3 {
    return this.root.worldToLocal(cargo.getWorldPosition(new THREE.Vector3()));
  }

  private putCargo(cargo: WarehouseCargoNode, point: THREE.Vector3): void {
    this.scratch.copy(point);
    this.root.localToWorld(this.scratch);
    cargo.parent?.worldToLocal(this.scratch);
    cargo.position.copy(this.scratch);
    // Packages stay upright and retain their identity/materials throughout the sequence.
    cargo.rotation.set(0, this.layout.rootRotation, 0);
  }

  private slot(index: number): THREE.Vector3 {
    this.root.updateWorldMatrix(true, true);
    const point = this.cart.localToWorld(new THREE.Vector3(0, FLOOR, index === 0 ? 0.46 : -0.46));
    return this.root.worldToLocal(point);
  }

  private followCart(): void {
    this.cart.getWorldQuaternion(this.cartFacing);
    for (const item of this.received) {
      this.putCargo(item.cargo, this.slot(item.slot));
      item.cargo.parent?.getWorldQuaternion(this.parentFacing);
      item.cargo.quaternion.copy(this.parentFacing.invert()).multiply(this.cartFacing);
    }
  }

  private move(phase: typeof this.phase, from: THREE.Vector3, to: THREE.Vector3): void {
    this.phase = phase;
    this.clock = 0;
    this.from.copy(from);
    this.to.copy(to);
  }

  private walkTo(point: THREE.Vector3): void {
    if (!this.receiver) return;
    const target = this.root.localToWorld(point.clone());
    this.receiver.root.parent?.worldToLocal(target);
    this.receiver.rig.walk(target, { interrupt: true, pace: 0.85, facing: this.layout.rootRotation + this.direction * Math.PI / 2 });
  }

  /** Call after the visitor's animation tick so moving handle IK wins over the clip. */
  public tick(dt: number): void {
    if (!this.active || !this.receiver) return;
    this.clock += dt;
    this.root.updateWorldMatrix(true, true);
    this.followCart();
    for (const [index, rail] of this.rails.entries()) {
      rail.visible = this.tray.visible;
      const outer = this.outriggers[index];
      outer.visible = this.tray.visible && this.tray.position.z > 1.1;
      if (!rail.visible) continue;
      const offset = index === 0 ? -0.28 : 0.28;
      const start = new THREE.Vector3(0.64 + offset, 0.92, -1.4);
      const tip = this.tray.position.clone().add(new THREE.Vector3(offset, -0.06, 0));
      // The inboard telescope remains straight through the aperture. Only the
      // outboard section slews to a cart slot, beyond the wall and waiting person.
      const end = outer.visible ? new THREE.Vector3(0.64 + offset, 0.92, 1.1) : tip;
      rail.position.copy(start).lerp(end, 0.5);
      rail.scale.z = Math.max(0.1, start.distanceTo(end));
      rail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), end.sub(start).normalize());
      if (outer.visible) {
        const joint = new THREE.Vector3(0.64 + offset, 0.92, 1.1);
        outer.position.copy(joint).lerp(tip, 0.5);
        outer.scale.z = Math.max(0.1, joint.distanceTo(tip));
        outer.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tip.sub(joint).normalize());
      }
    }
    if (this.phase === 'opening') {
      if (!this.hatch.isOpen()) return;
      const start = this.cargoLocal(this.queue[this.index]);
      this.tray.visible = true;
      this.move('align', start, new THREE.Vector3(0.64, start.y, -1.4));
      return;
    }
    if (['align', 'lift', 'extend', 'align-slot', 'receive', 'return-slot', 'return-center', 'retract'].includes(this.phase)) {
      const duration = this.reduced ? 0.12 : this.phase === 'extend' ? 1.3 : 0.65;
      const t = Math.min(1, this.clock / duration);
      const position = this.tray.position.lerpVectors(this.from, this.to, t * t * (3 - 2 * t));
      if (!['return-slot', 'return-center', 'retract'].includes(this.phase)) this.putCargo(this.queue[this.index], position);
      if (t < 1) return;
      if (this.phase === 'align') this.move('lift', this.to, new THREE.Vector3(0.64, FLOOR, -1.4));
      else if (this.phase === 'lift') this.move('extend', this.to, new THREE.Vector3(0.64, FLOOR, 1.45));
      else if (this.phase === 'extend') this.move('align-slot', this.to, this.slot(this.index).setZ(1.45));
      else if (this.phase === 'align-slot') this.move('receive', this.to, this.slot(this.index));
      else if (this.phase === 'receive') {
        this.received.push({ cargo: this.queue[this.index], slot: this.index });
        this.move('return-slot', this.to, this.to.clone().setZ(1.45));
      } else if (this.phase === 'return-slot') {
        this.move('return-center', this.to, new THREE.Vector3(0.64, FLOOR, 1.45));
      } else if (this.phase === 'return-center') {
        this.move('retract', this.to, new THREE.Vector3(0.64, FLOOR, -1.4));
      } else if (++this.index < this.queue.length) {
        this.phase = 'opening';
      } else {
        this.tray.visible = false;
        this.phase = 'grip'; this.clock = 0;
      }
      return;
    }
    if (this.phase === 'positioning') {
      const at = this.root.worldToLocal(this.receiver.root.getWorldPosition(this.scratch));
      if (at.distanceTo(this.waypoints[0]) > 0.08) return;
      this.waypoints.shift();
      if (this.waypoints.length) this.walkTo(this.waypoints[0]);
      else { this.phase = 'opening'; this.clock = 0; this.hatch.setOpen(true); }
      return;
    }
    if (this.phase === 'grip' || this.phase === 'depart') {
      if (this.phase === 'depart') {
        const receiverAt = this.receiver.root.getWorldPosition(new THREE.Vector3());
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.receiver.root.getWorldQuaternion(new THREE.Quaternion()));
        this.cart.position.copy(this.root.worldToLocal(receiverAt.addScaledVector(forward, 1.52)));
        this.cart.position.y = 0;
        this.cart.rotation.y = this.receiver.root.rotation.y - this.layout.rootRotation;
        const distance = this.cart.position.distanceTo(this.lastCart);
        for (const wheel of this.wheels) wheel.rotateY(distance / 0.14);
        this.lastCart.copy(this.cart.position);
      }
      this.cart.updateWorldMatrix(true, true);
      this.cart.localToWorld(this.left.set(-0.3, 1.2, -1.04));
      this.cart.localToWorld(this.right.set(0.3, 1.2, -1.04));
      this.receiver.rig.poseHands({ left: this.left, right: this.right }, this.phase === 'grip' ? Math.min(1, this.clock / 0.4) : 1);
      this.followCart();
      if (this.phase === 'grip' && this.clock >= (this.reduced ? 0.4 : 0.8)) {
        this.phase = 'depart';
        this.clock = 0;
        this.lastCart.copy(this.cart.position);
        this.receiver.rig.walk(this.layout.pursuit.officerStart.clone(), { interrupt: true, pace: 0.85 });
      } else if (this.phase === 'depart' && this.receiver.root.position.distanceTo(this.layout.pursuit.officerStart) < 0.08) {
        this.hatch.setOpen(false);
        this.phase = 'closing'; this.clock = 0;
      }
      return;
    }
    if (this.phase === 'closing' && this.clock >= 0.65 && this.hatch.isClosed()) {
      const done = this.complete;
      this.complete = null;
      this.phase = 'idle';
      done?.();
    }
  }
}
