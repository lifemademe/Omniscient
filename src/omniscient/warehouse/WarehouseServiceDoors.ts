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

/**
 * The three service doors, and the cameras that watch them.
 *
 * ## The cameras were pointed at the floor
 *
 * Reported as showing nothing recognisable, and it was one mistake made six times: every
 * fixed camera here sat about seven and a half metres up and four to five metres back,
 * looking DOWN at between 49 and 57 degrees. That is not a surveillance angle, it is a
 * ceiling hatch - at 57 degrees a standing person is a hat, a pair of shoulders and their own
 * shadow, with no face, no posture and no door behind them.
 *
 * A fixed camera at a doorway is about three and a half metres up and five to twelve metres
 * back, looking down between twelve and twenty-five degrees. That range is not a style
 * choice: it is where a standing person still reads as a standing person, which is the entire
 * job of a camera the player is asked to identify somebody through.
 *
 * All six are re-aimed, and `scripts/warehouse-cameras.ts` now fails the build if any of them
 * drifts back - it checks height, pitch, standoff, and whether the person the camera exists
 * to show is actually inside the frame at both aspect ratios.
 *
 * ## Where they are mounted
 *
 * On the OUTSIDE face of the wall they belong to, offset along it rather than square on. Two
 * reasons. A camera square to a door sees a person head-on with the door hidden behind them;
 * from along the wall you get the door, the person, and the ground between - which is what
 * makes it read as a place rather than a portrait. And a camera on the inside face is aimed
 * at the back of a wall, which renders as a dark rectangle and looks exactly like a
 * mis-aimed camera rather than a mis-placed one.
 */
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
      // Mounted on the outside of the west wall, 5.8m up-run of the door and looking back
      // along it. 3.5m up, 20.6 degrees down, subject 6.2m out.
      /*
       * Outside the door, looking BACK at it - not along the wall past it.
       *
       * The old pose sat at x -24.6, four tenths of a metre off the cladding, and 5.8m along
       * the wall from a door at z 20. That is a raking shot: the visitor stands nearly
       * edge-on, the wall runs away to the vanishing point and fills most of the frame, and
       * the one thing the camera exists to show is the smallest thing in it. It passed the
       * harness because the harness asks whether the subject is IN frame, not whether the
       * wall is eating it.
       *
       * Now it stands off the building at x -30 and comes back at the door on a three-quarter
       * angle: the visitor is against their own doorway, the wall is behind them rather than
       * beside them, and the approach is visible. That is what a door camera is for and what
       * every real one does.
       */
      position: new THREE.Vector3(-30, 3.5, 23.4),
      target: new THREE.Vector3(-25.9, 1.4, WAREHOUSE_LAYOUT.service.sideZ + 0.3),
      fov: 54,
    },
    pursuit: {
      suspectStart: new THREE.Vector3(-25.9, 0, WAREHOUSE_LAYOUT.service.sideZ),
      suspectEnd: new THREE.Vector3(-25.9, 0, -8.5),
      officerStart: new THREE.Vector3(-25.9, 0, 25.2),
      officerEnd: new THREE.Vector3(-25.9, 0, -5.5),
      camera: {
        /*
         * Down the run, looking back up it, so a suspect runs AT the lens.
         *
         * Sitting beside the route and panning across it is the shot that reads as a diagram;
         * a figure growing in the frame is the one that reads as somebody getting away. It is
         * placed three metres short of the route's end, so they arrive and pass rather than
         * stopping in front of the camera.
         */
        position: new THREE.Vector3(-25.3, 4.4, -5.2),
        target: new THREE.Vector3(-25.9, 1.25, 5.8),
        fov: 50,
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
      // On the outside of the front wall, 5.8m west of the door, looking east along the
      // facade. 3.5m up, 22 degrees down, subject 5.9m out.
      /* Same correction as service-a: off the building and back at the door, rather than
         hard against the cladding looking along it. */
      position: new THREE.Vector3(3.6, 3.5, WAREHOUSE_LAYOUT.shell.frontZ + 5.1),
      target: new THREE.Vector3(0.1, 1.4, WAREHOUSE_LAYOUT.shell.frontZ + 1.9),
      fov: 54,
    },
    pursuit: {
      suspectStart: new THREE.Vector3(0, 0, 30.9),
      suspectEnd: new THREE.Vector3(22.5, 0, 30.2),
      officerStart: new THREE.Vector3(-7.4, 0, 30.5),
      officerEnd: new THREE.Vector3(18.1, 0, 30.2),
      camera: {
        /*
         * Looking back west along the front face at the 23m run.
         *
         * Brought in from the corner at x 26.6: from there the middle of the route was 15.4m
         * away and a running figure was 12% of frame height, which is a speck. This puts the
         * midpoint at 10.8m and the figure at 17%, and it costs nothing - the run still fills
         * the frame end to end because the camera looks straight down it.
         */
        position: new THREE.Vector3(22, 4.3, 30.2),
        target: new THREE.Vector3(11, 1.25, 30.3),
        fov: 50,
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
      // The mirror of A, on the east wall.
      /* The mirror of service-a, and corrected for the same reason. */
      position: new THREE.Vector3(30, 3.5, 23.4),
      target: new THREE.Vector3(25.9, 1.4, WAREHOUSE_LAYOUT.service.sideZ + 0.3),
      fov: 54,
    },
    pursuit: {
      suspectStart: new THREE.Vector3(25.9, 0, WAREHOUSE_LAYOUT.service.sideZ),
      suspectEnd: new THREE.Vector3(25.9, 0, -8.5),
      officerStart: new THREE.Vector3(25.9, 0, 25.2),
      officerEnd: new THREE.Vector3(25.9, 0, -5.5),
      camera: {
        // The mirror of A's pursuit angle, down the east wall.
        position: new THREE.Vector3(25.3, 4.4, -5.2),
        target: new THREE.Vector3(25.9, 1.25, 5.8),
        fov: 50,
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

    /*
     * The canopy lamp finally emits something.
     *
     * There has been a lit lamp housing over every service door since the doors were built,
     * and it was a glowing MESH with no light behind it - so the apron underneath, the door
     * itself and anyone standing at it were unlit at night. The three door cameras therefore
     * looked at a black rectangle, which is exactly the "shows nothing recognisable" this was
     * reported as. Repositioning the cameras was necessary and not sufficient: a camera
     * pointed correctly at an unlit subject still shows nothing.
     *
     * Cold, where the interior is amber. Security lighting genuinely is - sodium went out of
     * fashion for exactly this reason - and it also does real work for the picture: crossing a
     * service door is now a change of colour temperature as well as a change of room, and the
     * warehouse's two-temperature scheme extends to its threshold instead of stopping at the
     * wall.
     *
     * Placed just outboard of the canopy lamp so the housing reads as the source rather than
     * as a second bright thing beside it.
     */
    const canopyLight = ENGINE.PointLightNode.create({
      name: 'ServiceCanopyLight',
      color: '#cfe2ea',
      intensity: 26,
      distance: 15,
      decay: 1.5,
      position: new THREE.Vector3(0, 3.42, 1.42),
    });

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
      canopyLight,
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
