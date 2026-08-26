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
      /*
       * ## Panned, because a third of every one of these frames is a telephone
       *
       * The console panel covers the right of the screen in every warehouse view - it is the
       * same panel the contact views use, and `warehouse-cameras.ts` has treated x 0.645 as
       * the right-hand limit of the picture since it was written. These three shots were
       * composed as though the whole frame were available, so on A and B the door sat at the
       * right edge of what a player can see and everything dressed to its right - the notice
       * plate, the junction box, the downpipe, the wall pack, the bin - projected BEHIND the
       * panel. Five objects, on two of the three doors, built and lit and never once visible.
       *
       * Measured with `scripts/dev/probe-approach.ts`, which projects every prop into every
       * feed rather than asking an eye to judge it off a capture. Before: four of seven test
       * points past the panel edge on A and on B. After: none, on any door.
       *
       * The fix is a lateral pan of the aim point - 1.6m on A, 1.9m on B, 0.8m on C - which
       * rotates each camera about its own mounting so the visible band holds the door, the
       * visitor and the whole approach. Nothing moved on the building; the lens turned.
       */
      position: new THREE.Vector3(-30, 3.5, 23.4),
      target: new THREE.Vector3(-24.94, 1.4, WAREHOUSE_LAYOUT.service.sideZ + 1.58),
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
      /* Panned 1.9m off the panel - see service-a above. */
      position: new THREE.Vector3(3.6, 3.5, WAREHOUSE_LAYOUT.shell.frontZ + 5.1),
      target: new THREE.Vector3(1.38, 1.4, WAREHOUSE_LAYOUT.shell.frontZ + 0.7),
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
      /* Panned 0.8m. C already cleared the panel; this centres it. See service-a above. */
      position: new THREE.Vector3(30, 3.5, 23.4),
      target: new THREE.Vector3(26.38, 1.4, WAREHOUSE_LAYOUT.service.sideZ - 0.34),
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
/*
 * ## The blank plate was brighter than the lamp
 *
 * Measured off door B's feed rather than judged: the notice plate came back at mean 173 and a
 * 90th percentile of 250, against 154 and 242 for the wall pack's own lens. A small sign
 * beside a door was out-shining the light fixture above it, which inverts the whole value
 * structure the wall pack was added to create - the eye goes to the brightest thing in a
 * frame, and it was going to a rectangle with nothing written on it.
 *
 * The cause is position rather than paint: it sits square in the pack's cone at 0.3 metalness,
 * so it takes the specular the cladding either side of it does not. Down about a third in
 * value, which leaves it clearly lighter than the wall it hangs on and clearly darker than the
 * lamp, in that order.
 */
const PLATE = new THREE.MeshStandardMaterial({ color: '#5c6864', roughness: 0.78, metalness: 0.22 });
const SCUFF = new THREE.MeshStandardMaterial({ color: '#4b524f', roughness: 0.95, metalness: 0.02 });
/* Pass 1's palette: the three approaches want materials the others do not have. */
const TARMAC = new THREE.MeshStandardMaterial({ color: '#2f3335', roughness: 0.97, metalness: 0.02 });
const KERB = new THREE.MeshStandardMaterial({ color: '#8b8c85', roughness: 0.92, metalness: 0.02 });
/*
 * Planting, at a value that does not out-shout the visitor.
 *
 * #3f6b46 came back as the most saturated object in door B's feed - the cel pass runs
 * brightness 2.5 against a saturation of 0.89, so a mid green lands vivid, and the eye went
 * to a shrub rather than to the person at the door. Same fault the notice plate had two
 * passes ago and the same test: nothing in a shot should be louder than its subject.
 */
const LEAF = new THREE.MeshStandardMaterial({ color: '#3d5744', roughness: 0.92, metalness: 0.01 });
const GAS = new THREE.MeshStandardMaterial({ color: '#7d8a6c', roughness: 0.55, metalness: 0.45 });
const COPPER = new THREE.MeshStandardMaterial({ color: '#8a6446', roughness: 0.5, metalness: 0.6 });
const HAZARD = new THREE.MeshStandardMaterial({ color: '#c08a32', roughness: 0.9, metalness: 0.04 });
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
/**
 * ## Where the cladding actually ENDS, which is not where the door root is
 *
 * The shell's walls are 0.35m thick and centred on their wall line - `createClerestorySegment`
 * in WarehouseDaylight, and the three front infill panels beside door B use the same depth.
 * Every door root sits 0.17m INSIDE that line, so in the door's own local space the outer
 * face of the building is at z 0.345.
 *
 * Anything on the cladding at a smaller z is inside the wall. Not clipped, not z-fighting -
 * buried, and it renders as nothing at all, which reads exactly like a prop that was never
 * added. The two door letter plates went in at z 0.21 specifically so a camera could tell A
 * from B from C, and they have been a hundred and thirty-five millimetres inside the building
 * ever since; three door feeds, and the letter still not visible in any of them, for the
 * second time and for a different reason.
 *
 * The door leaf, the vision panel, the handle, the reader and the notice plate are all at a
 * similar z and all render, which is what hid this: they sit within the 2.94m door frame,
 * where there is a hole in the cladding rather than cladding. Only furniture out on the solid
 * wall is affected, and that is everything this pass added.
 *
 * So: cladding furniture is placed from WALL_FACE_Z, never from a number typed by eye.
 */
const WALL_FACE_Z = 0.345;

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
    /*
     * The border is a painted edge, not a strip light.
     *
     * At #d8ffb0 and nine pixels it matched the letter exactly, so the plate read as a lit
     * rectangle with something inside it rather than as a character on a board - and the
     * material is toneMapped:false, so nothing downstream was going to bring it back down.
     * Half the weight and two thirds of the value leaves the letter as the brightest thing
     * on the plate, which is the only thing on it that has to be read.
     */
    ctx.strokeStyle = '#7fb98a';
    ctx.lineWidth = 5;
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
    /*
     * The drum sits OVER the parked curtain, not above it.
     *
     * `SHUTTER_OPEN` is 0.03, so an open shutter is not nothing - it is a 10cm sliver of dark
     * panel still hanging from the head. The drum was centred at head + 0.13, which put it
     * entirely ABOVE that sliver and left a thin black bar visible across the opening on every
     * door. Dropped to head - 0.05 it spans head - 0.18 to head + 0.08, which swallows the
     * parked curtain whole and still reads as the roll the thing winds onto.
     */
    const shutterDrum = mesh('ServiceLockdownDrum', new THREE.BoxGeometry(2.86, 0.26, 0.34), FRAME, new THREE.Vector3(0, SHUTTER_HEAD_Y - 0.05, 0.34));
    const window = mesh('ServiceHatchWindow', new THREE.BoxGeometry(0.78, 0.24, 0.06), GLASS, new THREE.Vector3(0.64, 1.42, 0.29));
    /*
     * Shorter and closer to the threshold, so it stops before the dock.
     *
     * The scan plate ran 1.35m into the building from local z -1.05, reaching 1.73 inside the
     * wall, and the transfer dock's plinth starts at 1.13 - so the plate was inside the dock by
     * six tenths, on doors A and C both. It is the plate a package is scanned on as it comes
     * through the door, so it belongs at the threshold rather than halfway to the dock.
     */
    const scanner = mesh('ServiceCargoScanner', new THREE.BoxGeometry(2.12, 0.16, 0.7), this.statusMaterial, new THREE.Vector3(0, 0.18, -0.58));
    const reader = mesh('ServiceCredentialReader', new THREE.BoxGeometry(0.14, 0.24, 0.08), DARK, new THREE.Vector3(leafX - 0.72, 1.32, 0.24));
    const readerLamp = mesh('ServiceReaderLamp', new THREE.SphereGeometry(0.038, 10, 6), this.statusMaterial, new THREE.Vector3(leafX - 0.72, 1.40, 0.29));
    /*
     * The tamper sensor gets a body, for the same reason the bolts got housings.
     *
     * On its own it was a nine-centimetre glowing disc floating on blank cladding - the third
     * of the "floating blue things". A door contact is a lens on the front of a box screwed to
     * the wall, so it now has the box, and the lens sits proud of it rather than of nothing.
     */
    const tamper = mesh('ServiceTamperSensor', new THREE.CylinderGeometry(0.07, 0.07, 0.05, 12), this.statusMaterial, new THREE.Vector3(-1.6, 1.78, WALL_FACE_Z + 0.13));
    tamper.rotation.x = Math.PI / 2;
    root.add(mesh('ServiceTamperBody', new THREE.BoxGeometry(0.22, 0.3, 0.12), DARK, new THREE.Vector3(-1.6, 1.78, WALL_FACE_Z + 0.05)));
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
     * centimetres to spare.
     *
     * ## One plate, not two, and two thirds the size
     *
     * There were two, on the argument that the three cameras approach from different sides and
     * a single plate would be edge-on to one of them. `probe-approach.ts` can settle that
     * rather than assume it, and it does: the LEFT plate projects to x 0.24, 0.26 and 0.14 on
     * A, B and C - square in the visible band on all three, from every approach. The argument
     * was sound and the measurement retires it.
     *
     * Which is worth doing, because the right-hand plate landed in the busiest part of the
     * frame - it overlapped the downpipe, the junction box and the wall pack's pool, and at
     * 1.12 metres square and fullbright it read as an illuminated box rather than a sign on a
     * wall. Down to 0.78, where it is still comfortably legible at seven metres, and the
     * canvas border comes off full brightness so the plate stops glowing at its own edges.
     *
     * The old high sign stays. It is the right sign for a person standing at the door, and
     * this mission is played through a camera - both readers exist.
     */
    const letterMaterial = wallLetterMaterial(layout.letter);
    const letters = [mesh(
      `ServiceDoorLetter-${layout.letter}`,
      createWarehouseLabelGeometry(0.78, 0.78),
      letterMaterial,
      /*
       * In to -1.95, to open the gap the plant riser needs.
       *
       * The plate is 0.78 wide, so at -2.16 it reached -2.55 and the extract louvre reaches
       * -2.74 - leaving nineteen centimetres of wall between them, which is not enough for a
       * pipe to climb without touching one of them. At -1.95 the gap is forty, and the plate
       * still clears the door frame edge at -1.47 by nine centimetres.
       */
      new THREE.Vector3(-1.95, 2.36, WALL_FACE_Z + 0.05)
    )];
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
    /*
     * 2.45, in from 2.62. The pipe is the outermost thing on the wall and door B's camera
     * stands closest, so the head of it was the single remaining test point past the panel
     * edge after the pan. Seventeen centimetres buys 0.02 of screen width, which is the whole
     * difference between a full-height vertical and a truncated one.
     */
    const pipeX = 2.35;
    root.add(
      mesh('ServiceDownpipe', new THREE.CylinderGeometry(0.075, 0.075, 3.5, 8), PIPE, new THREE.Vector3(pipeX, 1.75, WALL_FACE_Z + 0.11)),
      mesh('ServiceDownpipeShoe', new THREE.CylinderGeometry(0.085, 0.11, 0.3, 8), PIPE, new THREE.Vector3(pipeX, 0.15, WALL_FACE_Z + 0.13)),
      mesh('ServiceDownpipeBracketLow', new THREE.BoxGeometry(0.24, 0.05, 0.16), FRAME, new THREE.Vector3(pipeX, 0.95, WALL_FACE_Z + 0.05)),
      mesh('ServiceDownpipeBracketHigh', new THREE.BoxGeometry(0.24, 0.05, 0.16), FRAME, new THREE.Vector3(pipeX, 2.7, WALL_FACE_Z + 0.05)),
      /*
       * ## Spread across the wall, and wired to something
       *
       * Everything on this side had piled into forty centimetres: junction box at 1.92, wall
       * pack at 2.05, downpipe at 2.35 - three separate objects overlapping in projection at
       * six metres, reading as one lump of hardware with a pole through it. The pipe is the
       * one that has to stay outboard, because it is the only full-height vertical and it is
       * what cuts the blank cladding in two.
       *
       * So the other two move IN, and they move in together: the box now sits directly below
       * the wall pack with the conduit running between them, so the run explains the light
       * instead of vanishing up behind the canopy. Across the wall it now reads notice plate,
       * then that assembly, then pipe - three stops with air between them.
       */
      /*
       * The box and its trunking sit BESIDE the light, not under it.
       *
       * Centred, the conduit came down out of the middle of the hood and read as the stem of
       * a lamp standard - the back-plate fixed the fixture and the rod undid it. Sixteen
       * centimetres to the side is enough that the run arrives at the plate's edge, which is
       * where a real one is glanded, and the lamp stops appearing to stand on it.
       */
      mesh('ServiceJunctionBox', new THREE.BoxGeometry(0.3, 0.4, 0.16), DARK, new THREE.Vector3(1.52, 2.15, WALL_FACE_Z + 0.09)),
      mesh('ServiceConduit', new THREE.CylinderGeometry(0.045, 0.045, 0.66, 6), PIPE, new THREE.Vector3(1.52, 2.66, WALL_FACE_Z + 0.08)),
      mesh('ServiceNoticePlate', new THREE.BoxGeometry(0.44, 0.6, 0.03), PLATE, new THREE.Vector3(1.2, 1.78, 0.23)),
      mesh('ServiceNoticeBand', new THREE.BoxGeometry(0.44, 0.11, 0.035), FRAME, new THREE.Vector3(1.2, 2.0, 0.235))
    );

    /*
     * The bin and the drum swap places.
     *
     * The drum was the near object on the right and it was the largest thing in the picture -
     * a metre across, dead in the lower middle, and cut by the bottom edge on every feed. Its
     * whole value is that a disc on its edge is an unmistakable silhouette, and half a disc is
     * not one.
     *
     * A bin cropped at the frame edge costs nothing, because a box reads as a box from any
     * fraction of it. So the bin takes the near slot and the drum goes back and out, where the
     * two sit side by side at different depths rather than stacked on top of each other -
     * measured, they now share no screen column on any of the three doors.
     */
    /*
     * ## PASS 1 - the three doors stop being the same door three times
     *
     * Everything below this point used to be built identically for A, B and C, and the letter
     * plate was the only thing telling them apart. Three feeds the player cycles, and the only
     * way to know which one you were looking at was to read a sign - which is a failure of the
     * set, not of the player.
     *
     * So each door gets a JOB, and the dressing follows from the job rather than from a list
     * of props:
     *
     *   A // WEST  - GOODS IN. Pallet traffic. Chevrons, a dock ramp, empty pallets, chocks.
     *   B // FRONT - RECEPTION. The public face. Path, kerbs, planter, cycle hoops, a mat.
     *   C // EAST  - PLANT. Back of house. Condensers, a gas cage, cable tray, a gully.
     *
     * `trade` is that job, and the shared props below are gated on it: a wheelie bin belongs
     * at a front door and nowhere else, timber crates belong at goods-in, and the extract
     * louvre belongs on the plant wall. Everything that is genuinely common to a service door
     * - leaf, canopy, letter, notice plate, wall pack, downpipe, camera - stays shared.
     */
    const trade = layout.id === 'service-a' ? 'goods' : layout.id === 'service-b' ? 'front' : 'plant';

    if (trade === 'front') {
      // A wheelie bin is a front-of-house object: it is what a visitor walks past.
      root.add(
        mesh('ServiceBinBody', new THREE.BoxGeometry(0.66, 0.92, 0.6), BIN, new THREE.Vector3(2.05, 0.46, 2.25)),
        mesh('ServiceBinLid', new THREE.BoxGeometry(0.7, 0.08, 0.64), DARK, new THREE.Vector3(2.05, 0.95, 2.27)),
        mesh('ServiceBinWheelL', new THREE.CylinderGeometry(0.09, 0.09, 0.07, 8), DARK, new THREE.Vector3(1.8, 0.09, 2.47)),
        mesh('ServiceBinWheelR', new THREE.CylinderGeometry(0.09, 0.09, 0.07, 8), DARK, new THREE.Vector3(2.3, 0.09, 2.47))
      );
    }
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
    if (trade === 'goods') {
      for (const [index, lift] of [0, 1, 2].entries()) {
        const slab = mesh('ServicePalletLean', new THREE.BoxGeometry(1.3, 0.11, 0.9), TIMBER,
          new THREE.Vector3(3.05 + index * 0.05, 0.5 + lift * 0.15, 2.75 + index * 0.06));
        slab.rotation.x = -0.24;
        slab.rotation.y = -0.34;
        root.add(slab);
      }
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
    /*
     * Back and out, and no longer the biggest thing in the frame.
     *
     * z 2.85 put it at screen y 0.93 on door B and 2.3 only got it to 0.85 - still cut, still
     * lower-middle, still the first thing the eye hit. From (2.35, 1.2) the whole disc sits
     * between y 0.60 and 0.80 on every door with the bin beside it rather than behind it. See
     * the bin above for why those two traded slots.
     */
    const drum = ENGINE.SceneNode.create({ name: 'ServiceCableDrum', position: new THREE.Vector3(2.35, 0, 1.2) });
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

    /*
     * Out to x -2.85, clear of the bollard.
     *
     * The stack sat at -1.95 and the left bollard stands at -1.8, seven tenths of a metre
     * nearer the lens - so from every door camera the crates were behind a post, two screen
     * widths apart and reading as one confused mass. Depth separation is not separation when
     * the objects overlap in projection; they have to be apart ACROSS the frame as well.
     */
    /*
     * Two crates, and they have to look like two.
     *
     * Identical boxes stacked square with a 7cm offset merged into one tall carton at six
     * metres - the seam between them fell on a face that was lit the same on both sides, so
     * there was nothing to read it by. Different footprints and a few degrees of yaw each way
     * put a corner and a shadow line between them, which is all a stack needs.
     */
    const crates: Array<[number, number, number, number, number]> = [
      [0.72, 0.58, 0.64, 0.26, -0.14],
      [0.58, 0.5, 0.54, 0.11, 0.21],
    ];
    for (const [index, [width, height, depth, turn, shift]] of trade === 'goods' ? crates.entries() : []) {
      const crate = mesh(`ServiceCrate-${index}`, new THREE.BoxGeometry(width, height, depth), TIMBER,
        new THREE.Vector3(-2.6 + shift * 0.4, index === 0 ? 0.29 : 0.83, 1.6 + index * 0.12));
      crate.rotation.y = turn;
      root.add(crate);
    }

    const puddle = mesh('ServiceApronPuddle', new THREE.PlaneGeometry(1.5, 1.0), WET, new THREE.Vector3(0.55, 0.021, 2.35));
    puddle.rotation.x = -Math.PI / 2;
    puddle.rotation.z = 0.3;
    root.add(puddle);

    /*
     * ## The upper left was the last empty field, and it needed a VERTICAL
     *
     * Third critique, and the one the previous two passes kept deferring. Everything added so
     * far went to the right of the leaf or onto the apron; above and left of the door there
     * was the letter plate at 2.32m and then a metre and a half of blank cladding running up
     * to the canopy. On door C - which the camera approaches from the other side - that blank
     * is the FIRST thing in frame, at x 0.26.
     *
     * An extract louvre is what actually hangs there on a building like this: warehouses vent
     * their service lobbies, and the grille is always high, always outboard of the canopy, and
     * always has a weather hood over it. It answers the downpipe on the far side of the door -
     * one vertical element each side, at different heights and made of different things - so
     * the wall reads as a wall with equipment on it rather than a flat panel with one sign.
     *
     * Outboard of the canopy on purpose: the canopy spans 4.2m, so x -2.55 is a quarter of a
     * metre clear of its edge and the camera's ray reaches it. The same mistake put the
     * exterior door sign behind that roof for the whole of development.
     */
    /*
     * Out to -3.15, because it was standing ON the letter.
     *
     * The louvre housing is 0.82 wide and the letter plate 0.78, and at -2.55 and -2.16 they
     * spanned -2.96..-2.14 and -2.55..-1.77: forty centimetres of overlap, two flat panels
     * intersecting in the same plane. It reads on door C's feed as a grey slab growing out of
     * the sign. Moved outboard rather than shrinking either, because the wall is empty out
     * there and the gap between them is what makes both read as separate fittings.
     */
    const louvre = ENGINE.SceneNode.create({ name: 'ServiceExtractLouvre', position: new THREE.Vector3(-3.15, 2.92, WALL_FACE_Z + 0.07) });
    louvre.add(
      mesh('LouvreHousing', new THREE.BoxGeometry(0.82, 0.96, 0.14), FRAME, new THREE.Vector3(0, 0, 0)),
      mesh('LouvreThroat', new THREE.BoxGeometry(0.68, 0.8, 0.06), DARK, new THREE.Vector3(0, 0, 0.09)),
      mesh('LouvreHood', new THREE.BoxGeometry(0.94, 0.09, 0.3), FRAME, new THREE.Vector3(0, 0.56, 0.14))
    );
    for (const [index, y] of [0.28, 0.09, -0.1, -0.29].entries()) {
      const blade = mesh(`LouvreBlade-${index}`, new THREE.BoxGeometry(0.68, 0.11, 0.13), PIPE, new THREE.Vector3(0, y, 0.12));
      blade.rotation.x = -0.5;
      louvre.add(blade);
    }
    // Not flagged invisible - simply not built. The extract belongs on the plant wall, where
    // the machinery it vents actually is.
    if (trade === 'plant') root.add(louvre);

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
    /*
     * A back-plate, because without one it was a street lamp.
     *
     * The hood is a slab reaching 0.3m out from the cladding, and the conduit feeding it is a
     * rod - so from six metres the two read as a lamp head on a pole standing in front of the
     * wall rather than a fixture bolted to it. What was missing is the thing every wall pack
     * has and nobody draws: the plate it is screwed to.
     *
     * With the plate in, the run also shortens - the junction box comes up to shoulder height
     * so the conduit is a hand's length of trunking between two pieces of hardware instead of
     * a metre and a half of bare stalk.
     */
    root.add(
      mesh('ServiceWallPackBack', new THREE.BoxGeometry(0.3, 0.36, 0.1), DARK, new THREE.Vector3(1.68, 2.99, WALL_FACE_Z + 0.05)),
      mesh('ServiceWallPackHood', new THREE.BoxGeometry(0.42, 0.14, 0.3), DARK, new THREE.Vector3(1.68, 3.05, WALL_FACE_Z + 0.17)),
      mesh('ServiceWallPackLens', new THREE.BoxGeometry(0.34, 0.05, 0.22), WALLPACK, new THREE.Vector3(1.68, 2.96, WALL_FACE_Z + 0.21))
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
      position: new THREE.Vector3(1.68, 2.9, WALL_FACE_Z + 0.4),
    }));

    this.addApproachCharacter(root, trade);

    if (layout.id !== 'service-b') {
      /*
       * Left at 1.8, and that is a decision rather than an omission.
       *
       * Bringing them in to 1.35 was tried, to get the left one off the crate stack it sits
       * near on door A. Measured, it made things worse in the way that matters: the RIGHT
       * bollard landed at screen x 0.389 on A against a visitor at 0.384 - a post through the
       * one person the camera exists to show. The crates are two objects of different sizes at
       * different angles now, so the post beside them reads as a post beside them.
       */
      for (const x of [-1.8, 1.8]) {
        root.add(mesh('ServiceBollard', new THREE.CylinderGeometry(0.12, 0.12, 1.05, 10), FRAME, new THREE.Vector3(x, 0.52, 2.75)));
      }
    }
    /*
     * ## The lockdown bolts were two glowing chips floating in the doorway
     *
     * Reported as "floating blue things on the three doors", and that is exactly what they
     * were. Each was a bare 0.62m box in the status material - a teal emissive - parked at
     * head height at z 0.48, twenty-seven centimetres proud of the leaf, attached to nothing
     * and explaining nothing. Scaling `x` to 0.12 made it a small bright chip hanging in mid
     * air, and because scale works about a mesh's own centre the "retracted" state shrank it
     * toward the middle of the opening rather than back into anything.
     *
     * A bolt is only legible as a bolt if you can see WHERE IT GOES. So:
     *
     *  - The geometry is translated so its origin is at the OUTBOARD end. Scaling x now
     *    extends it inward from a fixed root, which is what a bolt does; retracted, the nose
     *    sits flush with its housing instead of hovering in the middle of the gap.
     *  - A HOUSING at that root, in the frame material, so the bolt comes out of a casting
     *    bolted to the jamb.
     *  - A KEEPER on the opposite side - the plate the bolt lands in - so the eye can see the
     *    span it closes even while it is open.
     *  - Back to z 0.30, tight against the shutter it locks rather than floating in front of
     *    the whole opening.
     *
     * Ordered outboard-to-inboard, the pair now reads housing, bolt, gap, keeper: hardware
     * that is obviously part of the door.
     */
    /*
     * A backing rail, so four blocks read as one piece of hardware.
     *
     * Housings, bolts and keepers made each part legible on its own, and the capture showed
     * the cost of that: six separate dark chips spaced across the header with clear cladding
     * between them, on all three doors. Individually correct, collectively a rash.
     *
     * One thin rail behind them at the same height ties them into a single locking bar - the
     * eye reads the line first and the fittings on it second, which is the order it should
     * read in.
     */
    root.add(mesh('ServiceLockRail', new THREE.BoxGeometry(2.9, 0.08, 0.09), DARK, new THREE.Vector3(0, 2.25, WALL_FACE_Z - 0.06)));
    for (const side of [-1, 1]) {
      const root_x = side * 1.28;
      const shaft = new THREE.BoxGeometry(0.62, 0.13, 0.16);
      // Origin at the outboard end, so scale.x extends the bolt inward from its housing.
      shaft.translate(-side * 0.31, 0, 0);
      const bolt = mesh('ServiceLockBolt', shaft, this.statusMaterial, new THREE.Vector3(root_x, 2.25, 0.3));
      bolt.scale.x = 0.12;
      this.bolts.push(bolt);
      root.add(
        bolt,
        mesh('ServiceLockHousing', new THREE.BoxGeometry(0.2, 0.28, 0.28), FRAME, new THREE.Vector3(root_x + side * 0.09, 2.25, 0.3)),
        mesh('ServiceLockKeeper', new THREE.BoxGeometry(0.12, 0.34, 0.26), DARK, new THREE.Vector3(side * 0.5, 2.25, 0.3))
      );
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

  /**
   * ## PASSES 2 to 5 - what makes each approach its own place
   *
   * Called once per door with the job from pass 1. The four passes after the split, in the
   * order they were made and for the reason each was needed:
   *
   * PASS 2 - THE GROUND. All three aprons were one slab, one puddle and one scuff band, and
   * the floor is a third of every one of these shots. Goods-in gets chevrons and tyre wear
   * because pallet trucks turn on it; reception gets a made path with kerbs because people
   * walk on it; plant gets a drainage channel and a gully because condensate has to go
   * somewhere. Three floors that were laid for three different reasons.
   *
   * PASS 3 - THE WALL ABOVE. The upper half is where a frame runs out of things, and it is
   * also where a building says what it does. Goods-in takes steel jamb protectors and a
   * height gauge; reception takes a fascia band; plant takes the condensers and their
   * pipework, which is the single most recognisable "back of house" silhouette there is.
   *
   * PASS 4 - DEPTH, AND ON DIFFERENT SIDES. Each door now has a near object, a mid object and
   * a far object, and crucially they are on DIFFERENT SIDES of frame per door - pallets and a
   * stillage left on A, hoops and a planter split on B, a gas cage right on C. Three shots
   * that are composed differently, not three shots with different props in the same places.
   *
   * PASS 5 - VALUE. Each gets one distinguishing light rather than the same wall pack: a cold
   * floodlight over the goods door, because that is what a night shift loads under; nothing
   * extra at reception, so the warm pack over the leaf is the only source and the approach
   * falls away into the dark; a single caged bulkhead at plant, low and mean. The shared wall
   * pack stays on all three as the base, so no feed loses its exposure.
   *
   * Everything here is placed in the door's LOCAL frame, where +z is outward, and everything
   * on cladding is placed from WALL_FACE_Z. Positions are checked with
   * `scripts/dev/probe-approach.ts` against the visible band, because the console panel eats
   * the right third of every one of these feeds.
   */
  private addApproachCharacter(root: ENGINE.SceneNode, trade: 'goods' | 'front' | 'plant'): void {
    if (trade === 'goods') {
      // PASS 2: chevrons where the trucks turn in, and a wear band under them.
      for (let index = 0; index < 5; index++) {
        const bar = mesh('ServiceChevron', new THREE.BoxGeometry(0.22, 0.014, 1.5), HAZARD,
          new THREE.Vector3(-1.5 + index * 0.62, 0.024, 3.15));
        bar.rotation.y = 0.72;
        root.add(bar);
      }
      // PASS 3: jamb protectors. Every goods door that has met a pallet truck has these.
      for (const side of [-1, 1]) {
        root.add(
          mesh('ServiceJambGuard', new THREE.BoxGeometry(0.16, 1.15, 0.16), HAZARD, new THREE.Vector3(side * 1.56, 0.58, 0.55)),
          mesh('ServiceJambGuardFoot', new THREE.BoxGeometry(0.3, 0.06, 0.3), FRAME, new THREE.Vector3(side * 1.56, 0.03, 0.55))
        );
      }
      // A height gauge over the opening - the bar that tells a driver what will fit.
      root.add(
        /*
         * Down to 3.28. At 3.42 the bar sat hard against the objective plate at the top of the
         * stage - the brightest object in the shot, pressed into the HUD text. Fourteen
         * centimetres puts it clearly under the canopy line with air above it, and the hangers
         * lengthen to keep reaching the soffit at 3.55.
         */
        mesh('ServiceHeightBar', new THREE.BoxGeometry(3.3, 0.12, 0.1), HAZARD, new THREE.Vector3(0, 3.28, 1.55)),
        mesh('ServiceHeightHangerL', new THREE.BoxGeometry(0.05, 0.42, 0.05), FRAME, new THREE.Vector3(-1.5, 3.55, 1.55)),
        mesh('ServiceHeightHangerR', new THREE.BoxGeometry(0.05, 0.42, 0.05), FRAME, new THREE.Vector3(1.5, 3.55, 1.55))
      );
      // PASS 4: the near-left group. Empty pallets stacked flat, and the cage they feed.
      for (let index = 0; index < 6; index++) {
        root.add(mesh('ServiceEmptyPallet', new THREE.BoxGeometry(1.24, 0.1, 1.04), TIMBER,
          new THREE.Vector3(-2.55 + index * 0.02, 0.06 + index * 0.15, 2.35 + index * 0.015)));
      }
      /*
       * Right of frame, not left, and the probe is why.
       *
       * At (-3.1, 3.35) it projected to screen x -0.04 on door A - off the picture entirely,
       * because the left side of that shot runs out fast. Moved across to 2.5, which puts it
       * at 0.45 and gives the goods approach a near object on each side: pallets low left,
       * stillage low right, with the door between them. Clear of the right bollard by 0.89m
       * against a 0.72m combined half-width.
       */
      const cage = ENGINE.SceneNode.create({ name: 'ServiceStillage', position: new THREE.Vector3(2.5, 0, 3.3) });
      cage.add(mesh('StillageDeck', new THREE.BoxGeometry(1.15, 0.1, 0.95), FRAME, new THREE.Vector3(0, 0.28, 0)));
      for (const [cx, cz] of [[-0.53, -0.43], [0.53, -0.43], [-0.53, 0.43], [0.53, 0.43]] as const) {
        cage.add(mesh('StillagePost', new THREE.BoxGeometry(0.06, 1.0, 0.06), FRAME, new THREE.Vector3(cx, 0.78, cz)));
      }
      for (const cy of [0.62, 0.98, 1.24]) {
        cage.add(mesh('StillageRail', new THREE.BoxGeometry(1.12, 0.04, 0.04), FRAME, new THREE.Vector3(0, cy, -0.43)));
      }
      cage.rotation.y = -0.22;
      root.add(cage);
      // PASS 5: a cold floodlight on the canopy. Goods-in is a night-shift door.
      root.add(
        mesh('ServiceFloodBody', new THREE.BoxGeometry(0.46, 0.2, 0.3), DARK, new THREE.Vector3(-1.15, 3.44, 1.9)),
        mesh('ServiceFloodLens', new THREE.BoxGeometry(0.38, 0.05, 0.24), WALLPACK, new THREE.Vector3(-1.15, 3.33, 1.94))
      );
      root.add(ENGINE.PointLightNode.create({
        name: 'ServiceGoodsFlood',
        color: '#cfe3ee',
        intensity: 4.2,
        distance: 8,
        decay: 1.6,
        position: new THREE.Vector3(-1.15, 3.15, 2.1),
      }));
      return;
    }

    if (trade === 'front') {
      // PASS 2: a made path with kerbs, because people walk to a reception door.
      const path = mesh('ServiceEntryPath', new THREE.PlaneGeometry(2.3, 4.4), TARMAC, new THREE.Vector3(0, 0.023, 3.3));
      path.rotation.x = -Math.PI / 2;
      root.add(path);
      for (const side of [-1, 1]) {
        root.add(mesh('ServiceEntryKerb', new THREE.BoxGeometry(0.16, 0.12, 4.4), KERB, new THREE.Vector3(side * 1.22, 0.06, 3.3)));
      }
      // The mat at the threshold - the one object that says "come in here".
      const mat = mesh('ServiceEntryMat', new THREE.PlaneGeometry(1.5, 0.9), SCUFF, new THREE.Vector3(0, 0.026, 1.05));
      mat.rotation.x = -Math.PI / 2;
      root.add(mat);
      // PASS 3: a fascia band over the leaf, which is what a public entrance has instead of
      // a height gauge.
      root.add(
        mesh('ServiceFasciaBand', new THREE.BoxGeometry(3.5, 0.42, 0.09), FRAME, new THREE.Vector3(0, 3.05, WALL_FACE_Z + 0.05)),
        mesh('ServiceFasciaTrim', new THREE.BoxGeometry(3.5, 0.06, 0.12), PLATE, new THREE.Vector3(0, 2.82, WALL_FACE_Z + 0.06))
      );
      // PASS 4: hoops on one side, a planter on the other. Split, so the frame is not
      // weighted the way the goods door's is.
      for (const [index, hz] of [2.35, 3.15].entries()) {
        const hoop = ENGINE.SceneNode.create({ name: `ServiceCycleHoop-${index}`, position: new THREE.Vector3(-2.5, 0, hz) });
        hoop.add(
          mesh('HoopLeft', new THREE.BoxGeometry(0.07, 0.78, 0.07), FRAME, new THREE.Vector3(-0.32, 0.39, 0)),
          mesh('HoopRight', new THREE.BoxGeometry(0.07, 0.78, 0.07), FRAME, new THREE.Vector3(0.32, 0.39, 0)),
          mesh('HoopTop', new THREE.BoxGeometry(0.71, 0.07, 0.07), FRAME, new THREE.Vector3(0, 0.78, 0))
        );
        root.add(hoop);
      }
      /*
       * Back and out. At (2.3, 3.05) the planter sat 3.5m from the lens and projected to y
       * 0.99 - cut in half by the bottom edge on door B. At (2.85, 2.45) it reads whole, and
       * it clears the wheelie bin at 2.05 rather than growing out of it.
       */
      const planter = ENGINE.SceneNode.create({ name: 'ServicePlanter', position: new THREE.Vector3(2.85, 0, 2.45) });
      planter.add(
        mesh('PlanterBox', new THREE.BoxGeometry(0.95, 0.6, 0.8), KERB, new THREE.Vector3(0, 0.3, 0)),
        mesh('PlanterRim', new THREE.BoxGeometry(1.02, 0.07, 0.87), PLATE, new THREE.Vector3(0, 0.63, 0)),
        mesh('PlanterSoil', new THREE.BoxGeometry(0.86, 0.05, 0.71), DARK, new THREE.Vector3(0, 0.62, 0))
      );
      for (const [bx, by, bz, size] of [[0, 0.98, 0, 0.62], [-0.24, 0.8, 0.14, 0.44], [0.22, 0.84, -0.12, 0.4]] as const) {
        planter.add(mesh('PlanterShrub', new THREE.BoxGeometry(size, size * 0.8, size), LEAF, new THREE.Vector3(bx, by, bz)));
      }
      root.add(planter);
      // An intercom post beside the path, clear of the reader on the leaf.
      root.add(
        mesh('ServiceIntercomPost', new THREE.BoxGeometry(0.14, 1.4, 0.14), FRAME, new THREE.Vector3(1.42, 0.7, 1.75)),
        mesh('ServiceIntercomHead', new THREE.BoxGeometry(0.24, 0.34, 0.16), DARK, new THREE.Vector3(1.42, 1.5, 1.79)),
        mesh('ServiceIntercomLens', new THREE.BoxGeometry(0.16, 0.1, 0.04), this.statusMaterial, new THREE.Vector3(1.42, 1.58, 1.88))
      );
      // PASS 5: nothing extra. The warm pack over the leaf is the only source here, so the
      // approach falls away into the dark - which is what a closed reception looks like.
      return;
    }

    // PASS 2: plant. A drainage channel across the apron and the gully it runs to.
    const channel = mesh('ServiceChannel', new THREE.BoxGeometry(3.6, 0.05, 0.26), DARK, new THREE.Vector3(0.2, 0.012, 2.6));
    channel.rotation.y = 0.1;
    root.add(
      channel,
      mesh('ServiceGully', new THREE.BoxGeometry(0.44, 0.06, 0.44), FRAME, new THREE.Vector3(1.85, 0.014, 2.75))
    );
    // PASS 3 and 4: the condensers. This is the silhouette that says back-of-house, and it
    // takes the left of frame the way the pallets take it on A.
    for (const [index, cz] of [1.15, 2.25].entries()) {
      const unit = ENGINE.SceneNode.create({ name: `ServiceCondenser-${index}`, position: new THREE.Vector3(-2.55, 0, cz) });
      unit.add(
        mesh('CondenserBody', new THREE.BoxGeometry(0.85, 0.95, 0.55), PIPE, new THREE.Vector3(0, 0.72, 0)),
        mesh('CondenserFrameL', new THREE.BoxGeometry(0.08, 0.25, 0.5), FRAME, new THREE.Vector3(-0.36, 0.12, 0)),
        mesh('CondenserFrameR', new THREE.BoxGeometry(0.08, 0.25, 0.5), FRAME, new THREE.Vector3(0.36, 0.12, 0)),
        mesh('CondenserGrille', new THREE.BoxGeometry(0.6, 0.6, 0.04), DARK, new THREE.Vector3(0, 0.78, 0.29))
      );
      for (const blade of [-0.18, 0, 0.18]) {
        unit.add(mesh('CondenserBlade', new THREE.BoxGeometry(0.56, 0.05, 0.05), FRAME, new THREE.Vector3(0, 0.78 + blade, 0.32)));
      }
      root.add(unit);
    }
    /*
     * ## The pipework, rebuilt as a circuit rather than as three sticks
     *
     * First attempt ran a pair at y 1.18 and 1.32 straight through both condenser bodies -
     * those sit y 0.245 to 1.195 - and stood the riser out at z 0.72, well clear of the wall,
     * so from door C's feed it read as a long tan plank leaning diagonally through the
     * machines. Caught on the first capture of the finished door.
     *
     * A refrigerant run has a shape, and following it fixes the geometry for free: the units
     * take short DROPS off a HEADER carried above them, the header runs back to the building,
     * and a RISER climbs the wall. Every part is now clear of every other, and the whole thing
     * reads as one system instead of three unrelated bars.
     */
    const headerY = 1.46;
    /*
     * The whole run threads the gap between the letter plate and the louvre.
     *
     * At -2.47 the riser climbed six centimetres in front of the C plate - the same overlap
     * the louvre itself had two passes ago, and just as visible: a tan bar crossing the one
     * sign that says which door this is. With the plate moved in to -1.95 the clear wall runs
     * -2.74 to -2.34, and -2.54 sits in the middle of it with twenty centimetres either side.
     *
     * The cable tray is gone rather than moved. It occupied -2.11..-1.89, which is inside the
     * plate wherever the plate goes, and the condensers, the pipework, the gas cage, the
     * louvre and the bulkhead already say plant without it. A prop that can only be placed by
     * displacing something more important is not worth the wall.
     */
    root.add(
      // Header, above both units, running back to the wall.
      mesh('ServiceRefrigHeaderA', new THREE.BoxGeometry(0.07, 0.07, 1.95), COPPER, new THREE.Vector3(-2.54, headerY, 1.45)),
      mesh('ServiceRefrigHeaderB', new THREE.BoxGeometry(0.07, 0.07, 1.95), COPPER, new THREE.Vector3(-2.7, headerY, 1.45)),
      // The riser up the cladding, tight to it.
      mesh('ServiceRefrigRiser', new THREE.BoxGeometry(0.07, 1.5, 0.07), COPPER, new THREE.Vector3(-2.54, 2.18, WALL_FACE_Z + 0.11)),
      mesh('ServiceRefrigElbow', new THREE.BoxGeometry(0.07, 0.07, 0.62), COPPER, new THREE.Vector3(-2.54, headerY, 0.61))
    );
    // Short drops from the header into the top of each unit.
    for (const cz of [1.15, 2.25]) {
      for (const [index, cx] of [-2.54, -2.7].entries()) {
        root.add(mesh(`ServiceRefrigDrop-${index}`, new THREE.BoxGeometry(0.06, 0.32, 0.06), COPPER, new THREE.Vector3(cx, 1.3, cz)));
      }
    }
    // PASS 4: the gas cage, on the RIGHT, so this shot is weighted opposite to A's.
    const gasCage = ENGINE.SceneNode.create({ name: 'ServiceGasCage', position: new THREE.Vector3(2.15, 0, 2.5) });
    gasCage.add(mesh('GasCageBase', new THREE.BoxGeometry(1.1, 0.09, 0.75), FRAME, new THREE.Vector3(0, 0.05, 0)));
    for (const [px, pz] of [[-0.5, -0.32], [0.5, -0.32], [-0.5, 0.32], [0.5, 0.32]] as const) {
      gasCage.add(mesh('GasCagePost', new THREE.BoxGeometry(0.06, 1.55, 0.06), FRAME, new THREE.Vector3(px, 0.78, pz)));
    }
    for (const ry of [0.42, 0.92, 1.42]) {
      gasCage.add(mesh('GasCageRail', new THREE.BoxGeometry(1.06, 0.04, 0.04), FRAME, new THREE.Vector3(0, ry, 0.32)));
    }
    for (const [gx, gz] of [[-0.28, 0], [0, 0.08], [0.28, -0.04]] as const) {
      gasCage.add(
        mesh('GasCylinder', new THREE.CylinderGeometry(0.13, 0.13, 1.15, 10), GAS, new THREE.Vector3(gx, 0.67, gz)),
        mesh('GasCylinderNeck', new THREE.CylinderGeometry(0.05, 0.05, 0.16, 8), FRAME, new THREE.Vector3(gx, 1.32, gz))
      );
    }
    gasCage.rotation.y = 0.18;
    root.add(gasCage);
    // PASS 5: one caged bulkhead, low and mean, instead of a second flood.
    /*
     * Down and out, off the junction box.
     *
     * Added last pass at (1.62, 2.25) without checking what was already on that patch of wall:
     * the junction box sits at (1.52, 2.15) and is 0.3 by 0.4, so the two were inside each
     * other by thirteen centimetres. Exactly the fault this pass exists to remove, introduced
     * by the pass that removed it - which is the argument for the audit rather than against it.
     *
     * (2.05, 1.55) is clear of the box in both axes, clear of the notice plate at 1.2, and
     * clear of the downpipe at 2.35 by seven centimetres.
     */
    const bulkX = 2.05;
    const bulkY = 1.55;
    root.add(
      mesh('ServiceBulkheadBody', new THREE.BoxGeometry(0.3, 0.3, 0.14), DARK, new THREE.Vector3(bulkX, bulkY, WALL_FACE_Z + 0.07)),
      mesh('ServiceBulkheadLens', new THREE.CylinderGeometry(0.11, 0.11, 0.06, 12), WALLPACK, new THREE.Vector3(bulkX, bulkY, WALL_FACE_Z + 0.16))
    );
    root.getObjectByName('ServiceBulkheadLens')?.rotateX(Math.PI / 2);
    for (const bar of [-0.07, 0.07]) {
      root.add(mesh('ServiceBulkheadCage', new THREE.BoxGeometry(0.02, 0.28, 0.02), FRAME, new THREE.Vector3(bulkX + bar, bulkY, WALL_FACE_Z + 0.2)));
    }
    root.add(ENGINE.PointLightNode.create({
      name: 'ServicePlantBulkhead',
      color: '#f0d9a8',
      intensity: 2.6,
      distance: 5.5,
      decay: 1.7,
      position: new THREE.Vector3(bulkX, bulkY, WALL_FACE_Z + 0.5),
    }));
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
