import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { WAREHOUSE_LAYOUT } from './WarehouseLayout.js';
import { createWarehouseLabelGeometry } from './labelGeometry.js';

const CHARCOAL = new THREE.MeshStandardMaterial({ color: '#1a2221', roughness: 0.7, metalness: 0.54 });
const STEEL = new THREE.MeshStandardMaterial({ color: '#56635f', roughness: 0.52, metalness: 0.7 });
const ORANGE = new THREE.MeshStandardMaterial({ color: '#b96f24', emissive: '#3d1d05', emissiveIntensity: 0.34, roughness: 0.58, metalness: 0.22 });
const BELT = new THREE.MeshStandardMaterial({ color: '#121817', roughness: 0.78, metalness: 0.2 });
const CARTON = new THREE.MeshStandardMaterial({ color: '#71583a', roughness: 0.92, metalness: 0.02 });
const GLASS = new THREE.MeshPhysicalMaterial({ color: '#85aba7', transparent: true, opacity: 0.14, roughness: 0.18, metalness: 0.08, depthWrite: false });

function mesh(
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position = new THREE.Vector3(),
  castShadow = true,
  receiveShadow = true
): ENGINE.MeshNode {
  const node = ENGINE.MeshNode.create({ name, geometry, material, castShadow, receiveShadow });
  node.position.copy(position);
  return node;
}

function displayMaterial(text: string, accent = '#e0a24c'): THREE.MeshBasicMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 192;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = '#06100d';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = accent;
    context.lineWidth = 8;
    context.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);
    context.fillStyle = accent;
    context.font = 'bold 68px monospace';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, canvas.width / 2, canvas.height / 2 + 4);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false });
}

function transformedBox(
  width: number,
  height: number,
  length: number,
  position: THREE.Vector3,
  rotationY: number
): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(width, height, length);
  geometry.applyMatrix4(new THREE.Matrix4().makeRotationY(rotationY));
  geometry.translate(position.x, position.y, position.z);
  return geometry;
}

/** Procedural industrial silhouettes and restrained motion for receiving and sortation. */
export class WarehouseAutomation {
  public readonly root = ENGINE.SceneNode.create({ name: 'WarehouseAutomation' });

  private readonly scannerMaterial = new THREE.MeshBasicMaterial({
    color: '#8dfff0',
    transparent: true,
    opacity: 0.11,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  private readonly beaconMaterial = new THREE.MeshStandardMaterial({
    color: '#d8842e',
    emissive: '#ff7a18',
    emissiveIntensity: 1.4,
    roughness: 0.28,
  });
  private scannerBeam: ENGINE.MeshNode | null = null;
  private trolley: ENGINE.SceneNode | null = null;
  private claw: ENGINE.SceneNode | null = null;
  private agvBeacon: ENGINE.MeshNode | null = null;
  private transferParcel: ENGINE.MeshNode | null = null;
  private transferCurve: THREE.CatmullRomCurve3 | null = null;
  private clock = 0;

  public build(): void {
    this.buildSortationFloor();
    this.buildTransferConveyor();
    this.buildScannerPortal();
    this.buildOverheadGantry();
    this.buildBufferTowers();
    this.buildReceivingAgv();
  }

  public tick(
    deltaTime: number,
    conveyorRunning: boolean,
    emergencyLevel: number,
    contained: boolean,
    reducedMotion: boolean
  ): void {
    this.clock += deltaTime;
    const motion = reducedMotion ? 0 : 1;
    if (this.scannerBeam) {
      const scanOffset = conveyorRunning ? Math.sin(this.clock * 2.15) * 0.52 * motion : 0;
      this.scannerBeam.position.z = 4.2 + scanOffset;
      this.scannerMaterial.opacity = THREE.MathUtils.lerp(conveyorRunning ? 0.17 : 0.08, 0.055, emergencyLevel);
      this.scannerMaterial.color.set(emergencyLevel > 0.55 ? '#ff6254' : '#8dfff0');
    }
    if (this.trolley) {
      const targetZ = conveyorRunning && motion ? -4.8 + Math.sin(this.clock * 0.42) * 2.25 : -4.8;
      this.trolley.position.z = THREE.MathUtils.damp(this.trolley.position.z, targetZ, 2.2, deltaTime);
    }
    if (this.claw) {
      this.claw.rotation.y += deltaTime * (conveyorRunning ? 0.16 : 0.035) * motion;
    }
    if (this.agvBeacon) {
      const pulse = contained || reducedMotion ? 1 : 0.66 + Math.sin(this.clock * 3.1) * 0.34;
      this.beaconMaterial.emissiveIntensity = 1.15 + pulse * (1.1 + emergencyLevel * 1.5);
      this.agvBeacon.rotation.y += deltaTime * 1.1 * motion;
    }
    if (this.transferParcel && this.transferCurve) {
      const phase = conveyorRunning && motion ? (this.clock * 0.035) % 1 : 0.34;
      const point = this.transferCurve.getPointAt(phase);
      const tangent = this.transferCurve.getTangentAt(phase);
      this.transferParcel.position.copy(point).setY(1.18);
      this.transferParcel.rotation.y = Math.atan2(tangent.x, tangent.z);
    }
  }

  private buildSortationFloor(): void {
    const floor = mesh(
      'SortationMachineFloor',
      new THREE.BoxGeometry(7.72, 0.055, 27.5),
      new THREE.MeshStandardMaterial({ color: '#2b3432', roughness: 0.86, metalness: 0.08 }),
      new THREE.Vector3(WAREHOUSE_LAYOUT.sortation.centerX, 0.015, -0.45),
      false,
      true
    );
    this.root.add(floor);
    for (const x of [15.72, 23.48]) {
      this.root.add(
        mesh('SortationSafetyEdge', new THREE.BoxGeometry(0.09, 0.025, 27.25), ORANGE, new THREE.Vector3(x, 0.058, -0.45), false, false)
      );
    }
    /*
     * These three are the signs that were upside down.
     *
     * Every other runtime label in the warehouse is built with
     * `createWarehouseLabelGeometry`, which reverses the quad's V axis because the engine
     * uploads textures with flipY disabled. These three were built with a bare
     * `THREE.PlaneGeometry`, so they missed it and hung inverted - and `SORT // S` is turned
     * 180 degrees on top of that, which is why it read as mirrored rather than merely upside
     * down. Caught on a recording: rotating the frame 180 degrees made `STORE // ...` legible.
     *
     * The range also said `01-05`, which reads as bay numbers on a rack that now numbers bays
     * 1 to 100. It means aisles, so it says aisles.
     */
    for (const [label, x, z, rotationY] of [
      ['RECEIVE // R', 8.2, -14.62, 0],
      ['STORE // AISLES 1-5', -5, 15.45, 0],
      ['SORT // S', 19.6, 14.18, Math.PI],
    ] as const) {
      const panel = mesh(
        `SectionIdentity-${label}`,
        createWarehouseLabelGeometry(4.5, 0.72),
        displayMaterial(label),
        new THREE.Vector3(x, 7.8, z),
        false,
        false
      );
      panel.rotation.y = rotationY;
      this.root.add(panel);
    }
  }

  private buildTransferConveyor(): void {
    const points = [
      new THREE.Vector3(10.2, 0.64, -20.7),
      new THREE.Vector3(11.1, 0.64, -18),
      new THREE.Vector3(13.3, 0.64, -15.5),
      new THREE.Vector3(15.4, 0.64, -13.3),
      new THREE.Vector3(17.25, 0.64, -10.15),
    ];
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    this.transferCurve = curve;
    const beltPieces: THREE.BufferGeometry[] = [];
    const leftRailPieces: THREE.BufferGeometry[] = [];
    const rightRailPieces: THREE.BufferGeometry[] = [];
    const samples = 30;
    for (let index = 0; index < samples; index++) {
      const a = curve.getPoint(index / samples);
      const b = curve.getPoint((index + 1) / samples);
      const delta = b.clone().sub(a);
      const length = Math.hypot(delta.x, delta.z) + 0.05;
      const angle = Math.atan2(delta.x, delta.z);
      const midpoint = a.clone().add(b).multiplyScalar(0.5);
      const right = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle));
      beltPieces.push(transformedBox(1.45, 0.19, length, midpoint, angle));
      leftRailPieces.push(transformedBox(0.085, 0.31, length, midpoint.clone().addScaledVector(right, -0.76).add(new THREE.Vector3(0, 0.1, 0)), angle));
      rightRailPieces.push(transformedBox(0.085, 0.31, length, midpoint.clone().addScaledVector(right, 0.76).add(new THREE.Vector3(0, 0.1, 0)), angle));
    }
    this.root.add(
      mesh('ReceivingTransferBelt', mergeGeometries(beltPieces, false) ?? new THREE.BoxGeometry(), BELT),
      mesh('ReceivingTransferRail-L', mergeGeometries(leftRailPieces, false) ?? new THREE.BoxGeometry(), ORANGE),
      mesh('ReceivingTransferRail-R', mergeGeometries(rightRailPieces, false) ?? new THREE.BoxGeometry(), ORANGE)
    );
    this.transferParcel = mesh('AutomationTransferParcel', new THREE.BoxGeometry(0.82, 0.68, 0.74), CARTON, curve.getPointAt(0.34).setY(1.18));
    this.root.add(this.transferParcel);
  }

  private buildScannerPortal(): void {
    const centerX = WAREHOUSE_LAYOUT.sortation.centerX;
    const z = 4.2;
    const portal = ENGINE.SceneNode.create({ name: 'SortationInspectionPortal' });
    portal.add(
      mesh('PortalWest', new THREE.BoxGeometry(0.62, 4.8, 1.18), STEEL, new THREE.Vector3(centerX - 3.45, 2.62, z)),
      mesh('PortalEast', new THREE.BoxGeometry(0.62, 4.8, 1.18), STEEL, new THREE.Vector3(centerX + 3.45, 2.62, z)),
      mesh('PortalCrown', new THREE.BoxGeometry(7.5, 0.72, 1.18), STEEL, new THREE.Vector3(centerX, 4.66, z)),
      mesh('PortalWestGlass', new THREE.BoxGeometry(0.18, 2.9, 0.76), GLASS, new THREE.Vector3(centerX - 3.42, 2.54, z), false, false),
      mesh('PortalEastGlass', new THREE.BoxGeometry(0.18, 2.9, 0.76), GLASS, new THREE.Vector3(centerX + 3.42, 2.54, z), false, false),
      mesh('PortalAmberWest', new THREE.BoxGeometry(0.11, 4.1, 1.26), ORANGE, new THREE.Vector3(centerX - 3.82, 2.48, z)),
      mesh('PortalAmberEast', new THREE.BoxGeometry(0.11, 4.1, 1.26), ORANGE, new THREE.Vector3(centerX + 3.82, 2.48, z))
    );
    const label = mesh(
      'PortalDisplay',
      new THREE.PlaneGeometry(3.65, 0.68),
      displayMaterial('VOLUMETRIC SCAN'),
      new THREE.Vector3(centerX, 4.68, z + 0.602),
      false,
      false
    );
    portal.add(label);
    this.scannerBeam = mesh(
      'SortationScanField',
      new THREE.PlaneGeometry(6.25, 3.25),
      this.scannerMaterial,
      new THREE.Vector3(centerX, 2.35, z),
      false,
      false
    );
    portal.add(this.scannerBeam);
    this.root.add(portal);
  }

  private buildOverheadGantry(): void {
    for (const x of [16.18, 23.02]) {
      this.root.add(mesh('GantryLongRail', new THREE.BoxGeometry(0.22, 0.3, 24.8), CHARCOAL, new THREE.Vector3(x, 8.35, -0.7)));
    }
    this.trolley = ENGINE.SceneNode.create({ name: 'SortationGantryTrolley', position: new THREE.Vector3(19.6, 0, -4.8) });
    this.trolley.add(
      mesh('GantryCrossbeam', new THREE.BoxGeometry(7.35, 0.42, 0.32), STEEL, new THREE.Vector3(0, 8.22, 0)),
      mesh('GantryCarriage', new THREE.BoxGeometry(1.35, 0.62, 0.9), CHARCOAL, new THREE.Vector3(0, 7.78, 0)),
      mesh('GantryCable', new THREE.CylinderGeometry(0.035, 0.035, 2.3, 8), CHARCOAL, new THREE.Vector3(0, 6.35, 0))
    );
    this.claw = ENGINE.SceneNode.create({ name: 'GantryClaw' });
    this.claw.add(mesh('ClawHub', new THREE.CylinderGeometry(0.28, 0.36, 0.55, 12), ORANGE, new THREE.Vector3(0, 5.05, 0)));
    for (const side of [-1, 1]) {
      const arm = mesh('ClawArm', new THREE.BoxGeometry(0.22, 1.22, 0.28), ORANGE, new THREE.Vector3(side * 0.5, 4.55, 0));
      arm.rotation.z = side * -0.62;
      const pincer = mesh('ClawPincer', new THREE.BoxGeometry(0.18, 0.72, 0.2), CHARCOAL, new THREE.Vector3(side * 0.86, 4.04, 0));
      pincer.rotation.z = side * 0.38;
      this.claw.add(arm, pincer);
    }
    this.trolley.add(this.claw);
    this.root.add(this.trolley);
  }

  private buildBufferTowers(): void {
    for (const [index, x] of [17.35, 21.85].entries()) {
      const tower = ENGINE.SceneNode.create({ name: `VerticalBuffer-${index + 1}`, position: new THREE.Vector3(x, 0, -12.15) });
      tower.add(
        mesh('BufferBack', new THREE.BoxGeometry(1.52, 4.2, 0.16), CHARCOAL, new THREE.Vector3(0, 2.2, -0.5)),
        mesh('BufferCrown', new THREE.BoxGeometry(1.78, 0.32, 1.25), STEEL, new THREE.Vector3(0, 4.34, 0))
      );
      for (const side of [-0.78, 0.78]) tower.add(mesh('BufferUpright', new THREE.BoxGeometry(0.14, 4.3, 1.2), STEEL, new THREE.Vector3(side, 2.16, 0)));
      for (let shelf = 0; shelf < 4; shelf++) {
        const y = 0.72 + shelf * 1.03;
        tower.add(
          mesh('BufferShelf', new THREE.BoxGeometry(1.58, 0.12, 1.15), STEEL, new THREE.Vector3(0, y, 0)),
          mesh('BufferCarton', new THREE.BoxGeometry(0.92 - (shelf % 2) * 0.12, 0.64, 0.78), CARTON, new THREE.Vector3(0, y + 0.38, 0.02))
        );
      }
      this.root.add(tower);
    }
  }

  private buildReceivingAgv(): void {
    const agv = ENGINE.SceneNode.create({ name: 'ReceivingAutonomousCarrier', position: new THREE.Vector3(10.25, 0, -23.2) });
    agv.rotation.y = -0.18;
    agv.add(
      mesh('AgvLower', new THREE.BoxGeometry(2.3, 0.46, 2.8), CHARCOAL, new THREE.Vector3(0, 0.38, 0)),
      mesh('AgvUpper', new THREE.BoxGeometry(2.05, 0.36, 2.55), ORANGE, new THREE.Vector3(0, 0.76, 0)),
      mesh('AgvBumper', new THREE.BoxGeometry(2.42, 0.22, 0.24), CHARCOAL, new THREE.Vector3(0, 0.42, 1.48)),
      mesh('AgvLoad', new THREE.BoxGeometry(1.42, 1.2, 1.45), CARTON, new THREE.Vector3(0, 1.54, -0.08))
    );
    for (const x of [-0.84, 0.84]) {
      for (const z of [-0.88, 0.88]) {
        const wheel = mesh('AgvWheel', new THREE.CylinderGeometry(0.28, 0.28, 0.2, 12), CHARCOAL, new THREE.Vector3(x, 0.22, z));
        wheel.rotation.z = Math.PI / 2;
        agv.add(wheel);
      }
    }
    this.agvBeacon = mesh('AgvBeacon', new THREE.CylinderGeometry(0.12, 0.15, 0.24, 12), this.beaconMaterial, new THREE.Vector3(0, 1.05, 1.08));
    agv.add(this.agvBeacon);
    const frontSensor = mesh('AgvSensor', new THREE.PlaneGeometry(0.8, 0.18), displayMaterial('AGV-02', '#d8ffb0'), new THREE.Vector3(0, 0.7, 1.415), false, false);
    agv.add(frontSensor);
    this.root.add(agv);
  }
}
