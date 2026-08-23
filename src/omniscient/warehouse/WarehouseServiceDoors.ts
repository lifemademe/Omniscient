import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { createWarehouseLabelGeometry } from './labelGeometry.js';
import { WAREHOUSE_LAYOUT } from './WarehouseLayout.js';

import type { WarehouseDoorId, WarehouseDoorStatus } from './types.js';

export interface WarehouseCameraPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

export interface WarehousePursuitRoute {
  suspectStart: THREE.Vector3;
  suspectEnd: THREE.Vector3;
  officerStart: THREE.Vector3;
  officerEnd: THREE.Vector3;
  camera: WarehouseCameraPose;
}

export interface WarehouseDoorLayout {
  id: WarehouseDoorId;
  letter: 'A' | 'B' | 'C';
  place: 'WEST' | 'FRONT' | 'EAST';
  glyph: 'triangle' | 'bars' | 'circle';
  rootPosition: THREE.Vector3;
  rootRotation: number;
  visitorPosition: THREE.Vector3;
  visitorFacing: number;
  handoffPosition: THREE.Vector3;
  camera: WarehouseCameraPose;
  pursuit: WarehousePursuitRoute;
}

export const WAREHOUSE_DOOR_IDS: readonly WarehouseDoorId[] = [
  'service-a',
  'service-b',
  'service-c',
];

export const WAREHOUSE_DOORS: Readonly<Record<WarehouseDoorId, WarehouseDoorLayout>> = {
  'service-a': {
    id: 'service-a',
    letter: 'A',
    place: 'WEST',
    glyph: 'triangle',
    rootPosition: new THREE.Vector3(-WAREHOUSE_LAYOUT.shell.wallX + 0.17, 0, WAREHOUSE_LAYOUT.service.sideZ),
    rootRotation: -Math.PI / 2,
    visitorPosition: new THREE.Vector3(-WAREHOUSE_LAYOUT.shell.wallX - 1.66, 0, WAREHOUSE_LAYOUT.service.sideZ),
    visitorFacing: Math.PI / 2,
    handoffPosition: new THREE.Vector3(-WAREHOUSE_LAYOUT.shell.wallX + WAREHOUSE_LAYOUT.service.handoffInset, 0, WAREHOUSE_LAYOUT.service.sideZ),
    camera: {
      position: new THREE.Vector3(-27.6, 7.4, 16.4),
      target: new THREE.Vector3(-25.72, 1.1, WAREHOUSE_LAYOUT.service.sideZ),
      fov: 50,
    },
    pursuit: {
      suspectStart: new THREE.Vector3(-25.9, 0, WAREHOUSE_LAYOUT.service.sideZ),
      suspectEnd: new THREE.Vector3(-25.9, 0, -8.5),
      officerStart: new THREE.Vector3(-25.9, 0, 25.2),
      officerEnd: new THREE.Vector3(-25.9, 0, -5.5),
      camera: {
        position: new THREE.Vector3(-28.2, 7.3, 2.5),
        target: new THREE.Vector3(-25.9, 1.05, 7.2),
        fov: 48,
      },
    },
  },
  'service-b': {
    id: 'service-b',
    letter: 'B',
    place: 'FRONT',
    glyph: 'bars',
    rootPosition: new THREE.Vector3(0, 0, WAREHOUSE_LAYOUT.shell.frontZ - 0.17),
    rootRotation: 0,
    visitorPosition: new THREE.Vector3(0, 0, WAREHOUSE_LAYOUT.shell.frontZ + 1.66),
    visitorFacing: Math.PI,
    handoffPosition: new THREE.Vector3(0, 0, WAREHOUSE_LAYOUT.shell.frontZ - 3.6),
    camera: {
      position: new THREE.Vector3(-5.4, 7.5, 32.2),
      target: new THREE.Vector3(0, 1.1, WAREHOUSE_LAYOUT.shell.frontZ + 1.5),
      fov: 50,
    },
    pursuit: {
      suspectStart: new THREE.Vector3(0, 0, 30.9),
      suspectEnd: new THREE.Vector3(22.5, 0, 30.2),
      officerStart: new THREE.Vector3(-7.4, 0, 30.5),
      officerEnd: new THREE.Vector3(18.1, 0, 30.2),
      camera: {
        position: new THREE.Vector3(26.5, 7.4, 24.4),
        target: new THREE.Vector3(15.5, 1.05, 30.2),
        fov: 49,
      },
    },
  },
  'service-c': {
    id: 'service-c',
    letter: 'C',
    place: 'EAST',
    glyph: 'circle',
    rootPosition: new THREE.Vector3(WAREHOUSE_LAYOUT.shell.wallX - 0.17, 0, WAREHOUSE_LAYOUT.service.sideZ),
    rootRotation: Math.PI / 2,
    visitorPosition: new THREE.Vector3(WAREHOUSE_LAYOUT.shell.wallX + 1.66, 0, WAREHOUSE_LAYOUT.service.sideZ),
    visitorFacing: -Math.PI / 2,
    handoffPosition: new THREE.Vector3(WAREHOUSE_LAYOUT.shell.wallX - WAREHOUSE_LAYOUT.service.handoffInset, 0, WAREHOUSE_LAYOUT.service.sideZ),
    camera: {
      position: new THREE.Vector3(27.6, 7.4, 16.4),
      target: new THREE.Vector3(25.72, 1.1, WAREHOUSE_LAYOUT.service.sideZ),
      fov: 50,
    },
    pursuit: {
      suspectStart: new THREE.Vector3(25.9, 0, WAREHOUSE_LAYOUT.service.sideZ),
      suspectEnd: new THREE.Vector3(25.9, 0, -8.5),
      officerStart: new THREE.Vector3(25.9, 0, 25.2),
      officerEnd: new THREE.Vector3(25.9, 0, -5.5),
      camera: {
        position: new THREE.Vector3(28.2, 7.3, 2.5),
        target: new THREE.Vector3(25.9, 1.05, 7.2),
        fov: 48,
      },
    },
  },
};

const FRAME = new THREE.MeshStandardMaterial({ color: '#354341', roughness: 0.62, metalness: 0.68 });
const DARK = new THREE.MeshStandardMaterial({ color: '#101817', roughness: 0.82, metalness: 0.4 });
const GLASS = new THREE.MeshPhysicalMaterial({
  color: '#71928a',
  transparent: true,
  opacity: 0.2,
  roughness: 0.16,
  metalness: 0.08,
});
const CONCRETE = new THREE.MeshStandardMaterial({ color: '#343a38', roughness: 0.94, metalness: 0.02 });
const WET = new THREE.MeshPhysicalMaterial({ color: '#202a28', roughness: 0.16, metalness: 0.18 });

function mesh(
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position = new THREE.Vector3()
): ENGINE.MeshNode {
  const node = ENGINE.MeshNode.create({ name, geometry, material, castShadow: true, receiveShadow: true });
  node.position.copy(position);
  return node;
}

function signMaterial(layout: WarehouseDoorLayout): THREE.MeshBasicMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = '#07100d';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#76b08d';
    context.lineWidth = 8;
    context.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);
    context.fillStyle = '#d8ffb0';
    context.strokeStyle = '#d8ffb0';
    context.lineWidth = 14;
    if (layout.glyph === 'triangle') {
      context.beginPath();
      context.moveTo(96, 184);
      context.lineTo(160, 64);
      context.lineTo(224, 184);
      context.closePath();
      context.stroke();
    } else if (layout.glyph === 'bars') {
      context.fillRect(98, 66, 28, 118);
      context.fillRect(176, 66, 28, 118);
    } else {
      context.beginPath();
      context.arc(160, 128, 62, 0, Math.PI * 2);
      context.stroke();
    }
    context.font = 'bold 126px monospace';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(layout.letter, 365, 135);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return new THREE.MeshBasicMaterial({ map: texture, side: THREE.FrontSide, toneMapped: false });
}

/** Runtime-built remote service entrance. It is never a proximity/player door. */
export class WarehouseServiceDoor {
  public readonly root: ENGINE.SceneNode;

  private readonly statusMaterial = new THREE.MeshStandardMaterial({
    color: '#426b5b',
    emissive: '#153b2c',
    emissiveIntensity: 0.7,
    roughness: 0.35,
  });
  private readonly shutter: ENGINE.MeshNode;
  private readonly hatch: ENGINE.MeshNode;
  private readonly bolts: ENGINE.MeshNode[] = [];
  private readonly redLight: ENGINE.PointLightNode;
  private readonly blueLight: ENGINE.PointLightNode;
  private hatchTimer = 0;
  private hatchTarget = 1.35;
  private shutterTarget = 5.15;
  private pursuitLights = false;
  private locked = false;
  private clock = 0;

  public constructor(public readonly layout: WarehouseDoorLayout) {
    const root = ENGINE.SceneNode.create({
      name: `ServiceDoor-${layout.letter}-${layout.place}`,
      position: layout.rootPosition.clone(),
      rotation: new THREE.Euler(0, layout.rootRotation, 0),
    });
    this.root = root;

    const frameLeft = mesh('ServiceDoorFrame', new THREE.BoxGeometry(0.22, 3.7, 0.38), FRAME, new THREE.Vector3(-1.36, 1.85, 0));
    const frameRight = mesh('ServiceDoorFrame', new THREE.BoxGeometry(0.22, 3.7, 0.38), FRAME, new THREE.Vector3(1.36, 1.85, 0));
    const frameTop = mesh('ServiceDoorFrame', new THREE.BoxGeometry(2.94, 0.22, 0.38), FRAME, new THREE.Vector3(0, 3.58, 0));
    const inner = mesh('ServiceDoorInner', new THREE.BoxGeometry(2.52, 3.25, 0.22), DARK, new THREE.Vector3(0, 1.73, 0.02));
    this.hatch = mesh('ServiceCargoHatch', new THREE.BoxGeometry(1.72, 1.45, 0.14), FRAME, new THREE.Vector3(0, 1.35, 0.19));
    this.shutter = mesh('ServiceLockdownShutter', new THREE.BoxGeometry(2.68, 3.3, 0.16), DARK, new THREE.Vector3(0, 5.15, 0.34));
    const window = mesh('ServiceHatchWindow', new THREE.BoxGeometry(1.24, 0.34, 0.06), GLASS, new THREE.Vector3(0, 1.48, 0.29));
    const scanner = mesh('ServiceCargoScanner', new THREE.BoxGeometry(2.12, 0.16, 1.35), this.statusMaterial, new THREE.Vector3(0, 0.18, -1.05));
    const reader = mesh('ServiceCredentialReader', new THREE.BoxGeometry(0.32, 0.54, 0.2), DARK, new THREE.Vector3(1.62, 1.45, 0.34));
    const readerLamp = mesh('ServiceReaderLamp', new THREE.SphereGeometry(0.065, 10, 6), this.statusMaterial, new THREE.Vector3(1.62, 1.62, 0.46));
    const tamper = mesh('ServiceTamperSensor', new THREE.CylinderGeometry(0.09, 0.09, 0.08, 12), this.statusMaterial, new THREE.Vector3(-1.6, 1.78, 0.31));
    tamper.rotation.x = Math.PI / 2;
    const canopy = mesh('ServiceCanopy', new THREE.BoxGeometry(4.2, 0.22, 2.7), FRAME, new THREE.Vector3(0, 3.66, 1.12));
    const canopyLamp = mesh('ServiceCanopyLamp', new THREE.BoxGeometry(2.1, 0.06, 0.34), this.statusMaterial, new THREE.Vector3(0, 3.51, 1.28));
    const doorSignMaterial = signMaterial(layout);
    const sign = mesh('ServiceDoorSign-Exterior', createWarehouseLabelGeometry(2.2, 1.08), doorSignMaterial, new THREE.Vector3(0, 4.45, 0.16));
    const interiorSign = mesh('ServiceDoorSign-Interior', createWarehouseLabelGeometry(2.2, 1.08), doorSignMaterial, new THREE.Vector3(0, 4.45, -0.16));
    interiorSign.rotation.y = Math.PI;
    const pad = mesh('ServiceExteriorPad', new THREE.BoxGeometry(4.5, 0.16, 4.4), CONCRETE, new THREE.Vector3(0, -0.07, 1.65));
    const wetPad = mesh('ServiceExteriorWet', new THREE.PlaneGeometry(4.2, 3.8), WET, new THREE.Vector3(0, 0.02, 1.82));
    wetPad.rotation.x = -Math.PI / 2;
    const drain = mesh('ServiceDrain', new THREE.BoxGeometry(2.7, 0.04, 0.22), DARK, new THREE.Vector3(0, 0.02, 3.18));
    const camera = ENGINE.SceneNode.create({ name: 'ServiceDoorCamera', position: new THREE.Vector3(-1.65, 3.48, 1.24) });
    camera.add(
      mesh('CameraArm', new THREE.BoxGeometry(0.1, 0.1, 0.52), FRAME, new THREE.Vector3(0, 0, 0.2)),
      mesh('CameraBody', new THREE.BoxGeometry(0.38, 0.24, 0.58), DARK, new THREE.Vector3(0, -0.05, 0.58)),
      mesh('CameraLens', new THREE.CylinderGeometry(0.095, 0.095, 0.05, 12), GLASS, new THREE.Vector3(0, -0.05, 0.89))
    );
    camera.getObjectByName('CameraLens')?.rotateX(Math.PI / 2);

    for (const x of [-1.8, 1.8]) {
      root.add(mesh('ServiceBollard', new THREE.CylinderGeometry(0.12, 0.12, 1.05, 10), FRAME, new THREE.Vector3(x, 0.52, 2.75)));
    }
    for (const x of [-0.88, 0.88]) {
      const bolt = mesh('ServiceLockBolt', new THREE.BoxGeometry(0.62, 0.14, 0.24), this.statusMaterial, new THREE.Vector3(x, 2.25, 0.48));
      bolt.scale.x = 0.12;
      this.bolts.push(bolt);
      root.add(bolt);
    }

    this.redLight = ENGINE.PointLightNode.create({
      name: 'LocalResponseRed',
      color: '#ff2c27',
      intensity: 0,
      distance: 18,
      decay: 1.6,
      position: new THREE.Vector3(-1.2, 2.8, 2.8),
    });
    this.blueLight = ENGINE.PointLightNode.create({
      name: 'LocalResponseBlue',
      color: '#358cff',
      intensity: 0,
      distance: 18,
      decay: 1.6,
      position: new THREE.Vector3(1.2, 2.8, 2.8),
    });
    root.add(
      frameLeft,
      frameRight,
      frameTop,
      inner,
      this.hatch,
      this.shutter,
      window,
      scanner,
      reader,
      readerLamp,
      tamper,
      canopy,
      canopyLamp,
      sign,
      interiorSign,
      pad,
      wetPad,
      drain,
      camera,
      this.redLight,
      this.blueLight
    );
    this.setStatus('unseen');
  }

  public setStatus(status: WarehouseDoorStatus): void {
    const colour = status === 'locked' || status === 'tamper'
      ? '#df493e'
      : status === 'contact'
        ? '#d7a642'
        : status === 'clear'
          ? '#65c781'
          : '#54786f';
    this.statusMaterial.color.set(colour);
    this.statusMaterial.emissive.set(status === 'locked' || status === 'tamper' ? '#7a100b' : colour);
    this.statusMaterial.emissiveIntensity = status === 'unseen' ? 0.38 : status === 'clear' ? 0.75 : 1.8;
  }

  public cycleCargo(): void {
    this.hatchTarget = 3.1;
    this.hatchTimer = 3.8;
  }

  public lockdown(): void {
    this.locked = true;
    this.setStatus('locked');
    this.shutterTarget = 1.72;
    this.redLight.intensity = 18;
    for (const bolt of this.bolts) bolt.scale.x = 1;
  }

  public reset(): void {
    this.hatchTimer = 0;
    this.hatchTarget = 1.35;
    this.shutterTarget = 5.15;
    this.pursuitLights = false;
    this.locked = false;
    this.redLight.intensity = 0;
    this.blueLight.intensity = 0;
    for (const bolt of this.bolts) bolt.scale.x = 0.12;
    this.setStatus('unseen');
  }

  public setPursuitLights(active: boolean): void {
    this.pursuitLights = active;
    if (!active) {
      this.redLight.intensity = this.locked ? 18 : 0;
      this.blueLight.intensity = 0;
    }
  }

  public tick(deltaTime: number): void {
    this.clock += deltaTime;
    if (this.hatchTimer > 0) {
      this.hatchTimer -= deltaTime;
      if (this.hatchTimer <= 0) this.hatchTarget = 1.35;
    }
    this.hatch.position.y = THREE.MathUtils.damp(this.hatch.position.y, this.hatchTarget, 3.6, deltaTime);
    this.shutter.position.y = THREE.MathUtils.damp(this.shutter.position.y, this.shutterTarget, 4.6, deltaTime);
    if (!this.pursuitLights) {
      this.redLight.intensity = this.locked ? 18 : 0;
      return;
    }
    const red = Math.max(0, Math.sin(this.clock * 11));
    const blue = Math.max(0, Math.sin(this.clock * 11 + Math.PI));
    this.redLight.intensity = red * 52;
    this.blueLight.intensity = blue * 46;
  }
}
