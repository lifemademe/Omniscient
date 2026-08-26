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

/** Outer frame dimensions shared with the procedural shell that closes around Service B. */
export const WAREHOUSE_SERVICE_DOOR_FRAME = {
  width: 2.94,
  height: 3.69,
  sideThickness: 0.22,
  topThickness: 0.22,
} as const;

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
    visitorPosition: new THREE.Vector3(-WAREHOUSE_LAYOUT.shell.wallX - 1.66, 0, WAREHOUSE_LAYOUT.service.sideZ + 0.72),
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
    visitorPosition: new THREE.Vector3(-0.72, 0, WAREHOUSE_LAYOUT.shell.frontZ + 1.66),
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
    visitorPosition: new THREE.Vector3(WAREHOUSE_LAYOUT.shell.wallX + 1.66, 0, WAREHOUSE_LAYOUT.service.sideZ - 0.72),
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
const CONCRETE = new THREE.MeshStandardMaterial({ color: '#6a7672', roughness: 0.94, metalness: 0.02 });
const WET = new THREE.MeshPhysicalMaterial({ color: '#202a28', roughness: 0.16, metalness: 0.18 });
/* The approach: rainwater goods, a bin, a stack of pallets and the plate beside the door. */
const PIPE = new THREE.MeshStandardMaterial({ color: '#3d4a48', roughness: 0.7, metalness: 0.42 });
const BIN = new THREE.MeshStandardMaterial({ color: '#4a5a3c', roughness: 0.86, metalness: 0.12 });
const TIMBER = new THREE.MeshStandardMaterial({ color: '#6b5433', roughness: 0.95, metalness: 0.01 });
const PLATE = new THREE.MeshStandardMaterial({ color: '#8d9a92', roughness: 0.7, metalness: 0.3 });
const SCUFF = new THREE.MeshStandardMaterial({ color: '#4b524f', roughness: 0.95, metalness: 0.02 });
const WALLPACK = new THREE.MeshStandardMaterial({
  color: '#d8c79c', emissive: '#f0b263', emissiveIntensity: 1.3, roughness: 0.3,
});

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

/** `mirrored` draws the rear-face variant - see labelMaterial in art.ts for why. */
function signMaterial(layout: WarehouseDoorLayout, mirrored = false): THREE.MeshBasicMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (context) {
    if (mirrored) {
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
    }
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

/**
 * The lockdown shutter's drum height, how far it reaches, and how much shows when open.
 *
 * 3.32 clears the opening (which tops out at 3.355) and tucks the drum under the canopy at
 * 3.55 rather than through it. Closed, the curtain reaches y 0.02 and covers the door.
 */
const SHUTTER_HEAD_Y = 3.32;
const SHUTTER_DROP = 3.3;
const SHUTTER_OPEN = 0.03;

const wallLetterCache = new Map<string, THREE.MeshBasicMaterial>();

/**
 * The door's letter, at a size a camera six metres away can actually read.
 *
 * `signMaterial` above is the fascia board: glyph on the left, letter on the right, plenty of
 * margin, meant to be read by somebody standing at the door. This is the other job - being
 * identifiable from the one fixed camera that watches this door - and it wants the opposite
 * treatment: one character, no glyph, filling its plate.
 */
function wallLetterMaterial(letter: string): THREE.MeshBasicMaterial {
  const cached = wallLetterCache.get(letter);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#0b1410';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#d8ffb0';
    ctx.lineWidth = 9;
    ctx.strokeRect(7, 7, 242, 242);
    ctx.fillStyle = '#d8ffb0';
    ctx.font = 'bold 188px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, 128, 140);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.FrontSide, toneMapped: false });
  wallLetterCache.set(letter, material);
  return material;
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
  private shutterTarget = SHUTTER_OPEN;
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

    const frameSideX = (WAREHOUSE_SERVICE_DOOR_FRAME.width - WAREHOUSE_SERVICE_DOOR_FRAME.sideThickness) / 2;
    const frameTopY = WAREHOUSE_SERVICE_DOOR_FRAME.height - WAREHOUSE_SERVICE_DOOR_FRAME.topThickness / 2;
    const frameLeft = mesh(
      'ServiceDoorFrame',
      new THREE.BoxGeometry(WAREHOUSE_SERVICE_DOOR_FRAME.sideThickness, WAREHOUSE_SERVICE_DOOR_FRAME.height, 0.38),
      FRAME,
      new THREE.Vector3(-frameSideX, WAREHOUSE_SERVICE_DOOR_FRAME.height / 2, 0)
    );
    const frameRight = mesh(
      'ServiceDoorFrame',
      new THREE.BoxGeometry(WAREHOUSE_SERVICE_DOOR_FRAME.sideThickness, WAREHOUSE_SERVICE_DOOR_FRAME.height, 0.38),
      FRAME,
      new THREE.Vector3(frameSideX, WAREHOUSE_SERVICE_DOOR_FRAME.height / 2, 0)
    );
    const frameTop = mesh(
      'ServiceDoorFrame',
      new THREE.BoxGeometry(WAREHOUSE_SERVICE_DOOR_FRAME.width, WAREHOUSE_SERVICE_DOOR_FRAME.topThickness, 0.38),
      FRAME,
      new THREE.Vector3(0, frameTopY, 0)
    );
    const inner = mesh('ServiceDoorInner', new THREE.BoxGeometry(2.52, 3.25, 0.22), DARK, new THREE.Vector3(0, 1.73, 0.02));
    /*
     * A personnel door, set into the goods opening, because the people were the wrong size.
     *
     * Reported as the characters looking small, and measuring it showed the opposite: the
     * visitor is 1.72m, the bollard 1.05m, the card reader sits at 1.45m and the canopy at
     * 3.55m - every human-scale cue at this door is right, and right relative to each other.
     * The DOOR was the outlier. A 2.52m wide by 3.25m tall opening is a vehicle door, and it
     * is the biggest, most familiar object in the shot, so the eye takes it as the ruler and
     * shrinks the person against it.
     *
     * Rather than resize the opening - which would drag the frame, the shutter, the canopy,
     * the letter plates and the camera framing with it - the entrance becomes what a real
     * service entrance is: a goods opening with a pedestrian leaf set into it. 0.95 by 2.10 is
     * a standard single door, and a 1.72m person standing at one reads as a 1.72m person.
     *
     * The visitor moves across to stand at the leaf rather than in the middle of the shutter.
     * That is 0.72m, well inside what the door camera already frames, and
     * `scripts/warehouse-cameras.ts` re-checks it.
     */
    const leafX = -0.72;
    const personnelFrame = mesh('ServicePersonnelFrame', new THREE.BoxGeometry(1.14, 2.28, 0.1), FRAME, new THREE.Vector3(leafX, 1.14, 0.16));
    const personnelLeaf = mesh('ServicePersonnelLeaf', new THREE.BoxGeometry(0.95, 2.1, 0.08), DARK, new THREE.Vector3(leafX, 1.05, 0.21));
    const personnelGlass = mesh('ServicePersonnelVision', new THREE.BoxGeometry(0.3, 0.62, 0.05), GLASS, new THREE.Vector3(leafX, 1.58, 0.25));
    // Lever handle on the swing side, at 1.05m - the height every door handle in the world is.
    const personnelHandle = mesh('ServicePersonnelHandle', new THREE.BoxGeometry(0.14, 0.04, 0.04), FRAME, new THREE.Vector3(leafX + 0.34, 1.05, 0.27));
    const personnelKick = mesh('ServicePersonnelKick', new THREE.BoxGeometry(0.95, 0.28, 0.02), FRAME, new THREE.Vector3(leafX, 0.16, 0.26));
    /*
     * The hatch shrinks and moves aside. At 1.72 by 1.45 it was most of the door; a hatch a
     * package is handed through is about a metre, and putting it beside the leaf rather than
     * across the middle is what makes the two read as separate things doing separate jobs.
     */
    this.hatch = mesh('ServiceCargoHatch', new THREE.BoxGeometry(1.02, 0.82, 0.14), FRAME, new THREE.Vector3(0.64, 1.28, 0.19));
    /*
     * The lockdown shutter ROLLS UP. It used to park in mid-air.
     *
     * Reported as a black box that appears when you turn the camera, and it is the same fault
     * the zone security gates had: 2.68 by 3.3 metres of DARK panel whose "open" state simply
     * moved its centre to y 5.15, leaving it hanging between 3.5 and 6.8 metres with nothing
     * holding it up. Unlit on its inward face it renders as a hard-edged black rectangle, and
     * door B sits 7.4m in front of the drone's spawn - so it is the first thing you meet when
     * you look toward the front wall.
     *
     * Found by spinning the camera with `scripts/dev/blackbox.py`, which reproduced it on 11
     * of 60 steps and showed the blob's column span shrinking steadily as the camera turned -
     * a world-locked object rotating out of view, not a post-process artefact.
     *
     * Same treatment as the gates: the curtain hangs from its top edge and opening is a SCALE,
     * so it winds into a drum instead of levitating. See addGate in art.ts.
     */
    const curtain = new THREE.BoxGeometry(2.68, SHUTTER_DROP, 0.16);
    curtain.translate(0, -SHUTTER_DROP / 2, 0);
    this.shutter = mesh('ServiceLockdownShutter', curtain, DARK, new THREE.Vector3(0, SHUTTER_HEAD_Y, 0.34));
    this.shutter.scale.y = SHUTTER_OPEN;
    const shutterDrum = mesh('ServiceLockdownDrum', new THREE.BoxGeometry(2.86, 0.26, 0.3), FRAME, new THREE.Vector3(0, SHUTTER_HEAD_Y + 0.13, 0.34));
    const window = mesh('ServiceHatchWindow', new THREE.BoxGeometry(0.78, 0.24, 0.06), GLASS, new THREE.Vector3(0.64, 1.42, 0.29));
    const scanner = mesh('ServiceCargoScanner', new THREE.BoxGeometry(2.12, 0.16, 1.35), this.statusMaterial, new THREE.Vector3(0, 0.18, -1.05));
    const reader = mesh('ServiceCredentialReader', new THREE.BoxGeometry(0.14, 0.24, 0.08), DARK, new THREE.Vector3(leafX - 0.72, 1.32, 0.24));
    const readerLamp = mesh('ServiceReaderLamp', new THREE.SphereGeometry(0.038, 10, 6), this.statusMaterial, new THREE.Vector3(leafX - 0.72, 1.40, 0.29));
    const tamper = mesh('ServiceTamperSensor', new THREE.CylinderGeometry(0.09, 0.09, 0.08, 12), this.statusMaterial, new THREE.Vector3(-1.6, 1.78, 0.31));
    tamper.rotation.x = Math.PI / 2;
    const canopy = mesh('ServiceCanopy', new THREE.BoxGeometry(4.2, 0.22, 2.7), FRAME, new THREE.Vector3(0, 3.66, 1.12));
    const canopyLamp = mesh('ServiceCanopyLamp', new THREE.BoxGeometry(2.1, 0.06, 0.34), this.statusMaterial, new THREE.Vector3(0, 3.51, 1.28));
    const doorSignMaterial = signMaterial(layout);
    const sign = mesh('ServiceDoorSign-Exterior', createWarehouseLabelGeometry(2.2, 1.08), doorSignMaterial, new THREE.Vector3(0, 4.45, 0.16));
    const interiorSign = mesh('ServiceDoorSign-Interior', createWarehouseLabelGeometry(2.2, 1.08), doorSignMaterial, new THREE.Vector3(0, 4.45, -0.16));
    interiorSign.rotation.y = Math.PI;
    /*
     * The letter, put where the CAMERA can see it.
     *
     * Reported as not being able to tell which door is which, and the building genuinely did
     * not say: there IS an exterior sign, at y 4.45, and the canopy is a 4.2 by 2.7 metre
     * slab at y 3.66 that reaches out to z 2.47. The camera watches from y 3.5 and z 5.27,
     * BELOW the canopy and outside it, so the sign it was meant to read has been behind a
     * roof the whole time. Three door feeds, and not one letter visible in any of them.
     *
     * So a second pair, at 2.32 metres on the wall either side of the frame - above a
     * standing visitor's head, below the canopy, and proud of the cladding. The ray from each
     * door camera to these passes under the canopy's outer edge with about seventy
     * centimetres to spare, and there are two of them because the three cameras approach from
     * different sides and a single plate would be edge-on to one of them.
     *
     * The old high sign stays. It is the right sign for a person standing at the door, and
     * this mission is played through a camera - both readers exist.
     */
    const letterMaterial = wallLetterMaterial(layout.letter);
    const letters = [-2.16, 2.16].map((x) => mesh(
      `ServiceDoorLetter-${layout.letter}`,
      createWarehouseLabelGeometry(1.12, 1.12),
      letterMaterial,
      new THREE.Vector3(x, 2.32, 0.21)
    ));
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

    /*
     * Service B faces directly into the launch camera and its canopy key turns these narrow
     * metal bollards into two featureless white pills. They add no navigation information at
     * the front entrance, so omit that pair; A and C retain theirs as side-door protection.
     */
    /*
     * ## The approach, which is two thirds of every door camera's frame
     *
     * Critiqued off an actual feed capture rather than from the editor: the door itself is
     * well built - leaf, vision panel, kick plate, reader, canopy, hatch - and it occupies
     * the left third of the shot. The other two thirds were blank cladding above and blank
     * apron below, and the yard beyond never reached the frame. Measured, those feeds ran at
     * saturation 0.17-0.20 and a 90th percentile of 122: flat, grey and empty.
     *
     * Three of the four camera feeds the player cycles are this shot, and the opening sweep
     * is those three in order, so it is the first thing anybody sees of the mission.
     *
     * What goes in is chosen for where the emptiness IS, which is the right of frame and the
     * wall above the apron:
     *
     *  - A DOWNPIPE with brackets and a shoe. The only tall vertical available, and it cuts
     *    the blank cladding into two readable panels instead of one field.
     *  - CONDUIT and a junction box feeding the canopy light, because the light has to come
     *    from somewhere and a run of pipe explains it.
     *  - A NOTICE PLATE beside the leaf. Every service door in the world has one.
     *  - A BIN and a leaning PALLET STACK in the mid-ground, which is the part of the frame
     *    with no object in it at any depth - the eye had nothing between the door and the
     *    horizon.
     *  - A SCUFF BAND across the apron where trolleys turn, so the slab reads as used.
     *  - A WALL PACK with a real light, so the frame has a pool and a falloff rather than one
     *    even wash. This is the biggest of the six: value structure does more for a shot than
     *    any amount of geometry.
     *
     * Everything sits clear of the leaf, the reader, the visitor's standing position and the
     * camera's sight line to all three - dressing that blocks the thing the camera exists to
     * show is worse than no dressing.
     */
    const pipeX = 2.62;
    root.add(
      mesh('ServiceDownpipe', new THREE.CylinderGeometry(0.075, 0.075, 3.5, 8), PIPE, new THREE.Vector3(pipeX, 1.75, 0.26)),
      mesh('ServiceDownpipeShoe', new THREE.CylinderGeometry(0.085, 0.11, 0.3, 8), PIPE, new THREE.Vector3(pipeX, 0.15, 0.34)),
      mesh('ServiceDownpipeBracketLow', new THREE.BoxGeometry(0.24, 0.05, 0.16), FRAME, new THREE.Vector3(pipeX, 0.95, 0.2)),
      mesh('ServiceDownpipeBracketHigh', new THREE.BoxGeometry(0.24, 0.05, 0.16), FRAME, new THREE.Vector3(pipeX, 2.7, 0.2)),
      mesh('ServiceJunctionBox', new THREE.BoxGeometry(0.3, 0.4, 0.16), DARK, new THREE.Vector3(1.92, 1.62, 0.24)),
      mesh('ServiceConduit', new THREE.CylinderGeometry(0.035, 0.035, 1.9, 6), PIPE, new THREE.Vector3(1.92, 2.6, 0.22)),
      mesh('ServiceNoticePlate', new THREE.BoxGeometry(0.44, 0.6, 0.03), PLATE, new THREE.Vector3(1.28, 1.78, 0.23)),
      mesh('ServiceNoticeBand', new THREE.BoxGeometry(0.44, 0.11, 0.035), FRAME, new THREE.Vector3(1.28, 2.0, 0.235))
    );

    // A wheelie bin, lid slightly proud, and the pallets nobody has taken back inside.
    root.add(
      mesh('ServiceBinBody', new THREE.BoxGeometry(0.66, 0.92, 0.6), BIN, new THREE.Vector3(2.15, 0.46, 1.5)),
      mesh('ServiceBinLid', new THREE.BoxGeometry(0.7, 0.08, 0.64), DARK, new THREE.Vector3(2.15, 0.95, 1.52)),
      mesh('ServiceBinWheelL', new THREE.CylinderGeometry(0.09, 0.09, 0.07, 8), DARK, new THREE.Vector3(1.9, 0.09, 1.72)),
      mesh('ServiceBinWheelR', new THREE.CylinderGeometry(0.09, 0.09, 0.07, 8), DARK, new THREE.Vector3(2.4, 0.09, 1.72))
    );
    /*
     * The pallets moved, and the first placement is worth recording as a mistake.
     *
     * They were at x -2.35, z 0.62 - which is a metre from the door camera at x -1.65, z
     * 1.24. On paper that is "beside the door"; through the lens it was a tan slab filling
     * the bottom-left corner and cutting across the threshold, so it read as a plank jammed
     * in the doorway rather than as pallets stacked out of the way. Dressing has to be
     * placed from the SHOT, not from the plan.
     *
     * Out to the far side and back in depth, past the bin, where the mid-ground was still
     * empty. Leaning at 24 degrees rather than 42 so the stack reads as propped rather than
     * as falling over.
     */
    for (const [index, lift] of [0, 1, 2].entries()) {
      const slab = mesh('ServicePalletLean', new THREE.BoxGeometry(1.3, 0.11, 0.9), TIMBER,
        new THREE.Vector3(3.05 + index * 0.05, 0.5 + lift * 0.15, 2.75 + index * 0.06));
      slab.rotation.x = -0.24;
      slab.rotation.y = -0.34;
      root.add(slab);
    }

    /*
     * Three objects spread ACROSS the apron, because one bin does not furnish a yard.
     *
     * Second critique off a feed capture: with the pallets moved and the wall pack eased the
     * shot was better but the bottom-right of frame was still a single pale slab with nothing
     * at any depth in it. A cable drum, a crate stack and a puddle at different distances
     * give the eye three stops between the door and the frame edge, and the drum in
     * particular is a silhouette that reads instantly at any size - a disc on its edge is
     * unmistakable where another box is not.
     *
     * Spread rather than grouped, and all inside the 4.5m pad so nothing floats off its own
     * slab.
     */
    /*
     * Depth reads BACKWARDS to the plan out here, and it cost two placements to learn.
     *
     * The view camera is not the ServiceDoorCamera prop at local z 1.24 - it is defined in
     * world space and sits well outside it, looking back at the wall. So larger local z is
     * CLOSER to the lens, not further. Both the pallets and then the crates were positioned
     * as though the opposite were true and both ended up at the front of frame: the crate
     * stack came out a metre from the glass, dead centre, with the door behind it.
     *
     * These distances are now set from captures. The drum stays forward as a framing
     * element - a foreground object at the edge is useful, one in the middle is a wall - and
     * the crates go back and out to the left where the mid-ground was still empty.
     */
    const drum = ENGINE.SceneNode.create({ name: 'ServiceCableDrum', position: new THREE.Vector3(1.95, 0, 2.85) });
    drum.rotation.y = 0.4;
    for (const side of [-0.24, 0.24]) {
      drum.add(mesh('ServiceDrumFlange', new THREE.CylinderGeometry(0.52, 0.52, 0.06, 16), TIMBER, new THREE.Vector3(side, 0.52, 0)));
    }
    drum.add(
      mesh('ServiceDrumHub', new THREE.CylinderGeometry(0.3, 0.3, 0.44, 14), DARK, new THREE.Vector3(0, 0.52, 0)),
      mesh('ServiceDrumAxle', new THREE.CylinderGeometry(0.05, 0.05, 0.62, 8), FRAME, new THREE.Vector3(0, 0.52, 0))
    );
    for (const child of drum.children) child.rotation.z = Math.PI / 2;
    root.add(drum);

    for (const [index, tier] of [0, 1].entries()) {
      root.add(mesh('ServiceCrateStack', new THREE.BoxGeometry(0.66, 0.55, 0.6), TIMBER,
        new THREE.Vector3(-1.95 + index * 0.07, 0.28 + tier * 0.57, 1.95 + index * 0.05)));
    }

    const puddle = mesh('ServiceApronPuddle', new THREE.PlaneGeometry(1.5, 1.0), WET, new THREE.Vector3(0.55, 0.021, 2.35));
    puddle.rotation.x = -Math.PI / 2;
    puddle.rotation.z = 0.3;
    root.add(puddle);

    // Trolley wear where the turn happens, off the door and across the apron.
    const scuff = mesh('ServiceApronScuff', new THREE.PlaneGeometry(3.4, 1.5), SCUFF, new THREE.Vector3(0.5, 0.025, 2.5));
    scuff.rotation.x = -Math.PI / 2;
    scuff.rotation.z = 0.22;
    root.add(scuff);

    /*
     * The wall pack, and the pool it makes.
     *
     * Mounted high and out to the side so its cone crosses the apron diagonally: a light
     * that faces straight down the camera's axis flattens everything it touches, and one
     * that rakes gives the bollards, the bin and the pallets each a shadow to stand on.
     */
    root.add(
      mesh('ServiceWallPackHood', new THREE.BoxGeometry(0.42, 0.14, 0.3), DARK, new THREE.Vector3(2.05, 3.05, 0.38)),
      mesh('ServiceWallPackLens', new THREE.BoxGeometry(0.34, 0.05, 0.22), WALLPACK, new THREE.Vector3(2.05, 2.96, 0.42))
    );
    root.add(ENGINE.PointLightNode.create({
      name: 'ServiceWallPackLight',
      color: '#f4c07e',
      /*
       * 5, down from 12. The first pass measured the feed's 90th percentile jumping 131 to
       * 233 - the pool stopped being a pool and became a blown patch, which is the opposite
       * of the value structure it was added for. A wall pack should shape the frame, not
       * take it over.
       */
      intensity: 5,
      distance: 9,
      decay: 1.5,
      position: new THREE.Vector3(2.05, 2.9, 0.6),
    }));

    if (layout.id !== 'service-b') {
      for (const x of [-1.8, 1.8]) {
        root.add(mesh('ServiceBollard', new THREE.CylinderGeometry(0.12, 0.12, 1.05, 10), FRAME, new THREE.Vector3(x, 0.52, 2.75)));
      }
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
      personnelFrame,
      personnelLeaf,
      personnelGlass,
      personnelHandle,
      personnelKick,
      this.hatch,
      this.shutter,
      shutterDrum,
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
      ...letters,
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
    this.shutterTarget = 1;
    this.redLight.intensity = 18;
    for (const bolt of this.bolts) bolt.scale.x = 1;
  }

  public reset(): void {
    this.hatchTimer = 0;
    this.hatchTarget = 1.35;
    this.shutterTarget = SHUTTER_OPEN;
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
    this.shutter.scale.y = THREE.MathUtils.damp(this.shutter.scale.y, this.shutterTarget, 4.6, deltaTime);
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
