import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { createRng, jitter, range, seedFrom } from '../core/rng.js';
import { getAccessibilityPreferences } from '../accessibility/preferences.js';
import { createWarehouseLabelGeometry } from './labelGeometry.js';
import { palletGeometries } from './palletGeometry.js';
import {
  WAREHOUSE_LAYOUT,
  WAREHOUSE_SECURITY_ZONE_IDS,
  WAREHOUSE_SECURITY_ZONES,
  warehouseAisleX,
  warehousePackagePosition,
  warehouseRackBayIndex,
  WAREHOUSE_BAY_MAX,
  WAREHOUSE_BAY_MIN,
  WAREHOUSE_BAY_RUN,
  WAREHOUSE_BAY_Z0,
  WAREHOUSE_RACK_BAY_HALF_Z,
  WAREHOUSE_RACK_BAY_Z,
  WAREHOUSE_RESERVED_ADDRESSES,
} from './WarehouseLayout.js';
import { WAREHOUSE_DOOR_IDS, WAREHOUSE_DOORS, WarehouseServiceDoor } from './WarehouseServiceDoors.js';
import { WarehouseAutomation } from './WarehouseAutomation.js';
import { WarehouseDaylight } from './WarehouseDaylight.js';
import { WarehouseSetDressing } from './WarehouseSetDressing.js';
import { MEZZANINE_BOUNDS, WarehouseFacilities } from './WarehouseFacilities.js';
import { WarehouseTransferDock } from './WarehouseTransferDock.js';

import type {
  WarehouseDoorId,
  WarehouseDoorDockState,
  WarehouseDoorStatus,
  WarehouseLightingMode,
  WarehouseSecurityZoneId,
} from './types.js';

/**
 * The warehouse palette.
 *
 * ## Everything used to be the same green
 *
 * Wall #33403e, steel #506365, dark steel #202b2a, floor #373d3a - four surfaces inside one
 * narrow desaturated teal band, lit by a cyan hemisphere, a cyan moon and fifteen cyan work
 * lights. The whole room came out as one wash, which is what "nothing reads" looks like when
 * the geometry is actually fine.
 *
 * Neutral now, not green. A neutral grey under a warm lamp goes warm and under the moon goes
 * cool, and that difference is the entire picture; a green-grey stays green under both and
 * throws away the only thing the lighting was doing. Cheapest colour work there is - the hex
 * codes barely move, but they stop fighting every light in the room.
 */
const WALL = new THREE.MeshStandardMaterial({ color: '#3d4a5c', roughness: 0.88, metalness: 0.1 });
const STEEL = new THREE.MeshStandardMaterial({ color: '#273a49', roughness: 0.6, metalness: 0.58 });
const DARK_STEEL = new THREE.MeshStandardMaterial({ color: '#1b2432', roughness: 0.76, metalness: 0.42 });
/**
 * The roof deck, dark and matte, and it needs its own material rather than DARK_STEEL.
 *
 * The ceiling was the brightest large surface in the building: a pale warm field across the
 * whole upper frame with nothing in it but three truss lines, lit from below by the high bays
 * and then multiplied by the cel pass. Measured across a wide interior shot, the top third
 * came out within nine levels of the floor, which is not a lit room but a flat one.
 *
 * Two levers were tried first and both measured worse or nothing. Easing the clerestory
 * lights made the room FLATTER, because despite sitting at the glazing they are mostly a
 * floor light. Halving the window emissive did nothing measurable at all.
 *
 * So the surface itself. Lower albedo, matte, and almost no metalness - a painted steel deck
 * is not a mirror, and 0.42 metalness with no reflection probe in the room was buying
 * nothing but brightness. The trusses stay DARK_STEEL, so they now read AGAINST the deck
 * instead of disappearing into it.
 */
const ROOF_DECK = new THREE.MeshStandardMaterial({ color: '#151b28', roughness: 0.94, metalness: 0.05 });
/* Stock that is not cardboard - see the tote and drum buckets in buildRacks. The drums
   carry the only saturated colour on the racking and it is cool on purpose. */
const TOTE = new THREE.MeshStandardMaterial({ color: '#2b4950', roughness: 0.72, metalness: 0.06 });
const TOTE_LID = new THREE.MeshStandardMaterial({ color: '#3c5a62', roughness: 0.66, metalness: 0.08 });
const DRUM = new THREE.MeshStandardMaterial({ color: '#35778a', roughness: 0.54, metalness: 0.12 });
const DRUM_BAND = new THREE.MeshStandardMaterial({ color: '#688497', roughness: 0.44, metalness: 0.46 });
const FLOOR = new THREE.MeshStandardMaterial({ color: '#948671', roughness: 0.91, metalness: 0.04 });
const AMBER = new THREE.MeshStandardMaterial({ color: '#8d6c31', emissive: '#39250b', emissiveIntensity: 0.55, roughness: 0.58 });
const RED = new THREE.MeshStandardMaterial({ color: '#6e2d2d', emissive: '#2c0909', emissiveIntensity: 0.6, roughness: 0.62 });
const BELT = new THREE.MeshStandardMaterial({ color: '#11171e', roughness: 0.82, metalness: 0.25 });
/*
 * Floor paint. Worn amber, and it takes the light rather than glowing.
 *
 * A marking that ignores the lighting reads as a decal laid over the picture; one that is lit
 * by the same lamps as the slab reads as paint on it. It is also the reason these are
 * MeshStandard rather than MeshBasic like the older lane stripes - those were authored before
 * the room had a lighting model worth responding to.
 */
const FLOOR_PAINT = new THREE.MeshStandardMaterial({ color: '#b58a34', roughness: 0.88, metalness: 0.02 });

/* Softwood, and darker than the board it carries so a load reads as sitting on something. */
const PALLET = new THREE.MeshStandardMaterial({ color: '#816337', roughness: 0.96 });
const TAPE_LIGHT = new THREE.MeshStandardMaterial({ color: '#c6b28b', roughness: 0.72 });
const TAPE_DARK = new THREE.MeshStandardMaterial({ color: '#b6a072', roughness: 0.72 });
/*
 * Stretch wrap. Nearly clear, slightly cool, and it must not write depth - a dozen
 * transparent boxes that do will sort against each other and flicker as the drone moves.
 */
const WRAP = new THREE.MeshPhysicalMaterial({
  color: '#cfe2dc',
  transparent: true,
  opacity: 0.13,
  roughness: 0.22,
  metalness: 0,
  depthWrite: false,
});
/* The guide rails down a conveyor. The strongest readable line in the sortation bay. */
const GUIDE = new THREE.MeshStandardMaterial({ color: '#c8862e', emissive: '#3a2408', emissiveIntensity: 0.5, roughness: 0.62 });
/* The high-bay shades. Double-sided, because an open cone drawn on one side is a hole. */
const SHADE = new THREE.MeshStandardMaterial({ color: '#181f2a', roughness: 0.76, metalness: 0.42, side: THREE.DoubleSide });
/* Sprinkler pipework. Muted, but the only saturated thing above head height in the room. */
const SPRINKLER = new THREE.MeshStandardMaterial({ color: '#8c3a30', roughness: 0.66, metalness: 0.24 });

function mesh(name: string, geometry: THREE.BufferGeometry, material: THREE.Material, position?: THREE.Vector3): ENGINE.MeshNode {
  const node = ENGINE.MeshNode.create({ name, geometry, material, castShadow: true, receiveShadow: true });
  if (position) node.position.copy(position);
  return node;
}

/**
 * A label, optionally drawn back-to-front for a rear face.
 *
 * ## Why the mirror is in the canvas and not in the UVs
 *
 * A double-sided sign here is two quads, the rear one turned 180 degrees about Y, and that
 * turn carries the texture with it - so every rear face in the warehouse read in mirror
 * writing. A recording caught a hanging zone sign as `ƎƏAЯOTƧ`.
 *
 * Reversing the rear quad's U coordinate is the obvious fix and it was tried first. It
 * changed nothing on screen: front still correct, rear still mirrored, with the rebuilt
 * bundle confirmed newer than the source. Rather than keep guessing at why the UV write does
 * not survive - `MeshNode.create` may well rebuild the attribute - the mirror moves somewhere
 * that is not in doubt. Drawing the canvas back-to-front is the same trick the bay ruler
 * already uses and it is verifiable by eye at the point it happens.
 *
 * `mirrored` is therefore the rear-face variant of a sign, and the two mirrors cancel.
 */
function labelMaterial(
  text: string,
  accent = '#d8ffb0',
  background = '#07100d',
  mirrored = false
): THREE.MeshBasicMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    if (mirrored) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 7;
    ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
    ctx.fillStyle = accent;
    ctx.font = 'bold 104px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return new THREE.MeshBasicMaterial({ map: texture, side: THREE.FrontSide, toneMapped: false });
}

/**
 * A numeral painted onto the floor, on a transparent plate.
 *
 * Transparent rather than a filled panel because a painted number IS the floor showing
 * through around it; a plate reads as a sign someone dropped. depthWrite off so the alpha
 * edge cannot punch a hole in whatever the drone is carrying over it, and it sits 1.4cm up
 * so it never fights the slab for the same pixel.
 */
function floorPaintMaterial(text: string): THREE.MeshStandardMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#c89a3c';
    context.font = 'bold 230px monospace';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, canvas.width / 2, canvas.height / 2 + 8);
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return new THREE.MeshStandardMaterial({
    map,
    transparent: true,
    depthWrite: false,
    roughness: 0.88,
    metalness: 0.02,
  });
}

function readableLabelPanel(
  name: string,
  text: string,
  width: number,
  height: number,
  accent: string,
  position: THREE.Vector3
): { root: ENGINE.SceneNode; faces: [ENGINE.MeshNode, ENGINE.MeshNode] } {
  const root = ENGINE.SceneNode.create({ name, position });
  const material = labelMaterial(text, accent);
  const front = mesh(`${name}-Front`, createWarehouseLabelGeometry(width, height), material, new THREE.Vector3(0, 0, 0.012));
  /*
   * The rear face needs NO mirroring, which is worth writing down because it cost two wrong
   * fixes to establish. Turning a quad 180 degrees about Y also turns which way the viewer's
   * right hand points, and the two cancel: the text reads correctly from behind. Both a UV
   * mirror and a pre-mirrored canvas were added here in turn and each one BROKE a face that
   * was already right - confirmed by tinting this material magenta and watching the mirrored
   * sign turn magenta, so it really is this mesh and it really was fine.
   */
  const back = mesh(`${name}-Back`, createWarehouseLabelGeometry(width, height), material, new THREE.Vector3(0, 0, -0.012));
  back.rotation.y = Math.PI;
  root.add(front, back);
  return { root, faces: [front, back] };
}

function boxGeometry(size: THREE.Vector3, position: THREE.Vector3): THREE.BoxGeometry {
  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
  geometry.translate(position.x, position.y, position.z);
  return geometry;
}

/**
 * A strut between two points, for rack bracing. Thickness is square in section.
 *
 * Built along X and then rotated about Z, so it only spans within one frame's plane - which
 * is all rack bracing ever does. A general two-point solve would be more code for a case that
 * does not occur here.
 */
function strutGeometry(
  from: THREE.Vector2,
  to: THREE.Vector2,
  z: number,
  thickness = 0.05
): THREE.BufferGeometry {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const geometry = new THREE.BoxGeometry(Math.hypot(dx, dy), thickness, thickness);
  geometry.rotateZ(Math.atan2(dy, dx));
  geometry.translate((from.x + to.x) / 2, (from.y + to.y) / 2, z);
  return geometry;
}

/**
 * Pallet racking that looks like pallet racking.
 *
 * It was eight square posts and five flat slabs. That is a shelf unit, not a rack, and it is
 * the single most repeated object in the mission - five of them, twenty-six metres long, in
 * the background of every shot the player takes. Whatever it reads as, the warehouse reads
 * as.
 *
 * Three things were missing, and all three are what makes racking recognisable at a glance:
 *
 *  - BRACING. A rack frame is two posts joined by a zigzag of diagonals, and that zigzag is
 *    the silhouette people actually recognise. Without it an empty bay showed clear through
 *    to the next aisle with nothing in the gap, which is why the racks read as scaffolding.
 *  - FOOTPLATES. Uprights bolt to the slab through a plate wider than the post. Without them
 *    the posts met the floor at a point and looked balanced rather than fixed.
 *  - BEAM FACES. Real beams are box section with a lip catching light along the top edge, not
 *    a slab with a single flat face. One thin highlight strip per beam gives the horizontal
 *    lines the eye reads depth from down a twenty-six metre aisle.
 *
 * All of it merges into the one geometry the aisle already paid for, so the cost is triangles
 * rather than draw calls - which is the whole reason the racks were merged in the first place.
 */
function rackGeometry(height = WAREHOUSE_LAYOUT.rack.height, length = WAREHOUSE_LAYOUT.rack.length): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = [];
  const frameZ = [-length / 2, -length / 6, length / 6, length / 2];
  const deckY = [0.18, 1.55, 2.9, 4.25, 5.48];
  const postX = 0.72;
  for (const z of frameZ) {
    for (const x of [-postX, postX]) {
      pieces.push(boxGeometry(new THREE.Vector3(0.11, height, 0.11), new THREE.Vector3(x, height / 2, z)));
      // Footplate, wider than the post and barely proud of the slab.
      pieces.push(boxGeometry(new THREE.Vector3(0.26, 0.035, 0.26), new THREE.Vector3(x, 0.018, z)));
    }
    /*
     * The zigzag, one diagonal per lift, alternating so the runs meet at the posts rather
     * than crossing mid-air. Inset from the post centres so the ends land on the post face
     * instead of hanging past it.
     */
    const braceX = postX - 0.055;
    for (let level = 0; level < deckY.length - 1; level++) {
      const low = deckY[level] + 0.09;
      const high = deckY[level + 1] - 0.09;
      const leftToRight = level % 2 === 0;
      pieces.push(strutGeometry(
        new THREE.Vector2(leftToRight ? -braceX : braceX, low),
        new THREE.Vector2(leftToRight ? braceX : -braceX, high),
        z
      ));
      // A horizontal tie at each lift, which is what the diagonals actually land on.
      pieces.push(boxGeometry(new THREE.Vector3(braceX * 2, 0.045, 0.045), new THREE.Vector3(0, low, z)));
    }
  }
  for (const y of deckY) {
    pieces.push(boxGeometry(new THREE.Vector3(1.58, 0.11, length), new THREE.Vector3(0, y, 0)));
    // The beam lip. Two thin strips at the deck edges, proud of the face, so each level
    // carries a highlight line down the aisle instead of one flat band.
    for (const x of [-0.79, 0.79]) {
      pieces.push(boxGeometry(new THREE.Vector3(0.05, 0.16, length), new THREE.Vector3(x, y + 0.02, 0)));
    }
  }
  return mergeGeometries(pieces, false) ?? new THREE.BoxGeometry(1, 1, 1);
}

function buildRain(root: ENGINE.SceneNode): void {
  const rng = createRng(seedFrom('warehouse-07-rain'));
  const positions = new Float32Array(720 * 3);
  for (let i = 0; i < 720; i++) {
    const lane = i % 3;
    positions[i * 3] = lane === 0
      ? range(rng, -28, 28)
      : lane === 1
        ? range(rng, -28, -24.25)
        : range(rng, 24.25, 28);
    positions[i * 3 + 1] = range(rng, 0, 14);
    positions[i * 3 + 2] = lane === 0 ? range(rng, 29.4, 35.4) : range(rng, -24, 30);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ color: '#91b2bd', size: 0.035, transparent: true, opacity: 0.45 })
  );
  points.name = 'ExteriorRain';
  root.add(points);
}

/*
 * The cold half of the mix, and the number the tick actually uses.
 *
 * Measured before touching it: 82.3% of lit pixels were warm, 2.0% cool, mean R-B bias
 * +46. That is one hue, and one hue is what separates this room from a lit interior that
 * reads as photographed. Nine work lights at intensity 54 were the entire lighting model;
 * the hemisphere meant to answer them sat at 0.6 and could not be seen.
 *
 * Raising it lifts the SHADOWS toward sky colour and leaves the warm key owning everything
 * it actually reaches, which is the ordinary way a warm interior is made to read at night -
 * cool shadow, warm key - rather than desaturating the amber and calling it balance.
 *
 * Named because the first attempt at this edited the constructor and changed nothing at
 * all: the tick below rewrites intensity every frame from its own literal, so the value
 * handed to HemisphereLightNode.create was never live. Two numbers, one of them a lie.
 * There is now one, and the constructor reads it too.
 */
/**
 * The security shutters: where the drum sits, how far the curtain reaches when it closes, and
 * how much of it stays showing when it is open. 5.8 puts the drum below the aisle signs at
 * 8.55 rather than in front of them, and 0.03 of 5.8m is a 17cm lip - enough to read as a
 * shutter, far too little to hide anything. See addGate.
 */
/**
 * The bay ruler's proportions, and the one texture behind every copy of it.
 *
 * 4096 pixels across 24.8 metres is 165 a metre, enough for a six character range to stay
 * sharp with a drone a metre off the rack. The height follows from keeping the texels square
 * rather than from a round number, because a stretched monospace digit is the single loudest
 * signal that a sign was made by a computer.
 */
const BAY_RULER_PIXELS = 4096;
const BAY_RULER_ROWS = 88;
const BAY_RULER_HEIGHT = (WAREHOUSE_BAY_RUN * BAY_RULER_ROWS) / BAY_RULER_PIXELS;
const bayRulerCache = new Map<boolean, THREE.MeshBasicMaterial>();

/**
 * Every bay range in one texture, laid out by the same mapping that places the packages.
 *
 * `mirrored` lays the cells out back to front, for the rack face whose rotation would
 * otherwise run the numbers from 100 down to 1. Doing it in the CANVAS rather than in the
 * mesh is deliberate, and was learned on the zone floor plates: a negative scale culls the
 * quad, and a 180 degree rotation makes the text read correctly while reversing the direction
 * it runs in - the same bug wearing a hat.
 */
function bayRulerMaterial(mirrored: boolean): THREE.MeshBasicMaterial {
  const cached = bayRulerCache.get(mirrored);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = BAY_RULER_PIXELS;
  canvas.height = BAY_RULER_ROWS;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#140f07';
    ctx.fillRect(0, 0, BAY_RULER_PIXELS, BAY_RULER_ROWS);
    ctx.font = 'bold ' + String(Math.round(BAY_RULER_ROWS * 0.6)) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const at = (bay: number): number =>
      ((bay - WAREHOUSE_BAY_MIN) / (WAREHOUSE_BAY_MAX - WAREHOUSE_BAY_MIN)) * BAY_RULER_PIXELS;
    for (let decade = 0; decade < 10; decade++) {
      const first = decade * 10 + 1;
      const last = decade * 10 + 10;
      /*
       * `mirrored` reverses the ORDER of the cells and nothing else.
       *
       * The obvious implementation - flip the whole canvas with a negative scale - was tried
       * and is wrong in a way that takes a capture to see: it reverses the cell order, which
       * is what is wanted, and mirrors every glyph with it, which is not. The strip then read
       * a perfectly positioned back-to-front `01-10`. Reversing the cell RANGE while drawing
       * the text normally separates the two.
       */
      const x0 = mirrored ? BAY_RULER_PIXELS - at(last) : at(first);
      const x1 = mirrored ? BAY_RULER_PIXELS - at(first) : at(last);
      /*
       * Alternating cells, because the BOUNDARY between two ranges carries further than the
       * digits do. Flying an aisle at speed you count blocks and only read the one you are
       * slowing down for; a strip of evenly spaced numbers with no banding gives you nothing
       * to count.
       */
      ctx.fillStyle = decade % 2 === 0 ? '#241806' : '#140f07';
      ctx.fillRect(x0, 0, x1 - x0, BAY_RULER_ROWS);
      ctx.fillStyle = '#e0a24c';
      ctx.fillRect(x0, BAY_RULER_ROWS - 6, x1 - x0, 3);
      ctx.fillText(
        String(first).padStart(2, '0') + '-' + String(last).padStart(2, '0'),
        (x0 + x1) / 2,
        BAY_RULER_ROWS / 2 - 3
      );
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.FrontSide, toneMapped: false });
  bayRulerCache.set(mirrored, material);
  return material;
}

const GATE_HEAD_Y = 5.8;
const GATE_DROP = 5.8;
const GATE_OPEN_SCALE = 0.03;
/**
 * The number the hemisphere note asks for. See buildLights.
 *
 * That note diagnoses this exact fault - "1.9 of directionless fill, and an ambient has no
 * direction by definition, so every shadow in the building was lifted to roughly the value of
 * every lit surface... a scene that looks deliberate and measures flat" - and prescribes 0.6.
 * The constant said 1.8. The fix was written down and then undone, and the comment was left
 * describing a room that no longer existed.
 *
 * 0.6, as prescribed. The moon at 1.7 is the cold key, the strip fittings are the warm
 * practicals, and the fill goes back to being fill.
 */
const WAREHOUSE_SKY_FILL = 0.6;

/** Mirrors ZONE_ACCENT in WarehouseFacilities so signage and floor read as one code. */
const ZONE_SIGN_ACCENT: Readonly<Record<string, string>> = {
  receiving: '#d29a4a',
  'storage-west': '#6ba0b0',
  'storage-east': '#93b96b',
  sortation: '#c8756a',
};

/*
 * Rack geometry shared by the builder and the collision test.
 *
 * These were local literals inside buildRacks, which was fine while the racking was a solid
 * wall to the drone. It is not any more: an empty bay is now flyable, so constrainDrone has to
 * agree with the loader about exactly where the bays and shelves are. Two copies of these
 * numbers would mean the player clipping through a full pallet or bouncing off thin air.
 */
const RACK_BAY_Z = WAREHOUSE_RACK_BAY_Z;
const RACK_LEVEL_Y = [0.55, 1.9, 3.25, 4.6] as const;
const RACK_SHELF_Y = [0.18, 1.55, 2.9, 4.25, 5.48] as const;
/** Half-depth of a bay along z. Bays are 4.7m apart, so this leaves a rib between them. */
const RACK_BAY_HALF_Z = WAREHOUSE_RACK_BAY_HALF_Z;
/** Clearance the drone needs above a shelf and below the next one to pass between them. */
const RACK_GAP_MARGIN = 0.34;

/**
 * Which shelf level a picked package stands on.
 *
 * Level 2 (deck 2.9m), not level 1 (deck 1.55m), because the bay ruler is mounted on the rack
 * face at y 1.95 and is half a metre tall - a carton on the level below sits directly behind
 * it and is invisible from the aisle. Found by flying to 2034 and seeing the number but not
 * the box. 2.96m is still well inside the 3.65m grip range from the drone's closest approach.
 *
 * Declared BEFORE the set below, which is not a style preference: a `const` read during
 * module evaluation before its own declaration is a temporal dead zone throw, and the whole
 * environment module fails to load.
 */
const PICK_LEVEL = 2;

/**
 * Slots kept deliberately empty, so an addressed package has somewhere to BE.
 *
 * The mission hands the player an address - 2034 is aisle 2, bay 34 - and asks them to go and
 * get it. That only works if the package is in the rack at that address, and until now it was
 * not: `warehousePackagePosition` put it on the FLOOR beside the rack, 33cm clear of the
 * face, out in the drive aisle. Reported exactly as it looks, which is that aisle 2 has no
 * package anywhere in the 31-40 range on either side.
 *
 * Putting it on the shelf instead runs into the stock: every non-empty slot carries a pallet
 * 1.18m wide on a shelf 1.58m deep, so there is no free pick face to stand a carton on and it
 * would intersect whatever is already there. The generator does leave about one slot in six
 * bare - that is what the drone flies through - so the answer is to make sure the ADDRESSED
 * slot is one of them.
 *
 * DERIVED, not written. The first version of this was a hand-kept list of `aisle:bay:level`
 * keys sitting next to a separate list of addresses, and it went wrong the moment the second
 * list grew: two of the five inbound-audit packages were reserved a slot two and a half
 * metres from where they actually spawn. Keys are now computed from the addresses by
 * `warehouseRackBayIndex`, so the two cannot disagree, and
 * `scripts/warehouse-addresses.ts` fails the build if an address has no slot to compute.
 */
const RESERVED_PICK_SLOTS: ReadonlySet<string> = new Set(
  WAREHOUSE_RESERVED_ADDRESSES.map(
    (address) => `${address.aisle}:${warehouseRackBayIndex(address.bay) ?? -1}:${PICK_LEVEL}`
  )
);

export class WarehouseEnvironment {
  public readonly root = ENGINE.SceneNode.create({ name: 'WarehouseEnvironment' });
  public readonly stationPositions: Readonly<Record<'hold', THREE.Vector3>> = {
    hold: WAREHOUSE_LAYOUT.stations.hold.clone(),
  };
  public readonly doorDockPositions: Readonly<Record<WarehouseDoorId, THREE.Vector3>> = {
    'service-a': WAREHOUSE_DOORS['service-a'].handoffPosition.clone(),
    'service-b': WAREHOUSE_DOORS['service-b'].handoffPosition.clone(),
    'service-c': WAREHOUSE_DOORS['service-c'].handoffPosition.clone(),
  };
  public rearDoor: ENGINE.MeshNode | null = null;
  public conveyorRollers: ENGINE.SceneNode[] = [];
  /** Single physical destination for the guided inbound-audit package loop. */
  public readonly verifiedIntakePosition = new THREE.Vector3(
    WAREHOUSE_LAYOUT.sortation.conveyorX[0],
    0.86,
    WAREHOUSE_LAYOUT.sortation.centerZ + WAREHOUSE_LAYOUT.sortation.conveyorLength * 0.5 - 0.3
  );
  /** Slots the loader left empty, as aisle:bay:level. Flyable - see constrainDrone. */
  private readonly emptyBays = new Set<string>();
  private readonly setDressing = new WarehouseSetDressing();
  private readonly facilities = new WarehouseFacilities();
  private readonly daylight = new WarehouseDaylight();
  private readonly automation = new WarehouseAutomation();
  private readonly serviceDoors = new Map<WarehouseDoorId, WarehouseServiceDoor>();
  private readonly transferDocks = new Map<WarehouseDoorId, WarehouseTransferDock>();
  private duplicateAisleSigns: [ENGINE.MeshNode, ENGINE.MeshNode] | null = null;
  private inboundPackages: ENGINE.MeshNode[] = [];
  private readonly securityGates = new Map<WarehouseSecurityZoneId, Array<{ node: ENGINE.MeshNode }>>();
  private readonly lockedSecurityZones = new Set<WarehouseSecurityZoneId>();
  private readonly workLights: ENGINE.PointLightNode[] = [];
  private readonly emergencyLights: ENGINE.PointLightNode[] = [];
  private readonly emergencyMaterials: THREE.MeshStandardMaterial[] = [];
  private ambientLight: ENGINE.HemisphereLightNode | null = null;
  private moonLight: ENGINE.DirectionalLightNode | null = null;
  private frontLight: ENGINE.PointLightNode | null = null;
  private fixtureLensMaterial: THREE.MeshStandardMaterial | null = null;
  private lightingMode: WarehouseLightingMode = 'normal';
  private emergencyLevel = 0;
  private celStyleEnabled = false;
  private rearDoorTarget = 0;
  private clock = 0;
  private conveyorRunning = false;
  /** Which x columns carry a run of ceiling fixtures. See buildCeilingServices. */
  private readonly ceilingFixtureColumns = new Set<number>();
  private verifiedIntakeScanner: ENGINE.MeshNode | null = null;
  /** The beacon over the intake, lit only while the player is carrying something to it. */
  private verifiedIntakeGuide: ENGINE.SceneNode | null = null;
  private verifiedIntakeGuideOn = false;
  private verifiedIntakeGuideLevel = 0;
  private verifiedIntakeStatus: THREE.MeshStandardMaterial | null = null;

  public build(): void {
    const { shell } = WAREHOUSE_LAYOUT;
    const floor = mesh('WarehouseFloor', new THREE.BoxGeometry(shell.width, 0.3, shell.length), FLOOR, new THREE.Vector3(0, -0.17, 0));
    this.root.add(floor);

    // Exterior service walks keep CCTV visitors and pursuit actors grounded in the rain.
    this.root.add(
      mesh('WestServiceWalk', new THREE.BoxGeometry(4.2, 0.18, 51), FLOOR, new THREE.Vector3(-26, -0.18, 3.2)),
      mesh('EastServiceWalk', new THREE.BoxGeometry(4.2, 0.18, 51), FLOOR, new THREE.Vector3(26, -0.18, 3.2)),
      mesh('FrontServiceWalk', new THREE.BoxGeometry(52, 0.18, 4.6), FLOOR, new THREE.Vector3(0, -0.18, 31.1))
    );

    // The daylight module owns the wall panels so its clerestory band is a true opening.
    this.daylight.build();
    this.root.add(
      this.daylight.root,
      mesh('Roof', new THREE.BoxGeometry(shell.width, 0.3, shell.length), ROOF_DECK, new THREE.Vector3(0, shell.roofY, 0))
    );

    const rearDoor = mesh('RearLoadingDoor', new THREE.BoxGeometry(11.2, 6, 0.22), STEEL, new THREE.Vector3(0, 3, shell.rearZ + 0.2));
    this.rearDoor = rearDoor;
    this.root.add(rearDoor);

    this.buildRacks();
    this.buildServiceDoors();
    this.buildStations();
    this.buildConveyors();
    this.buildSecurityZones();
    this.buildRackEndProtection();
    this.buildFloorNavigation();
    this.buildCeilingServices();
    this.buildTruck();
    this.buildLights();
    this.buildFloorWear();
    this.buildDressing();
    this.automation.build();
    this.root.add(this.automation.root);
    this.setDressing.build();
    this.root.add(this.setDressing.root);
    // Vehicles, mezzanine, office and loose life. Built and parented here, never in a field.
    this.facilities.build();
    this.root.add(this.facilities.root);
    buildRain(this.root);
  }

  private buildRacks(): void {
    const rng = createRng(seedFrom('warehouse-racks'));
    for (const [index, x] of WAREHOUSE_LAYOUT.rack.centers.entries()) {
      const aisle = index + 1;
      const rack = mesh(`Rack-${aisle}`, rackGeometry(), STEEL, new THREE.Vector3(x, 0, WAREHOUSE_LAYOUT.rack.centerZ));
      this.root.add(rack);
      /**
       * 8.55, not 7.2 - the aisle numbers were being eclipsed by the light fittings.
       *
       * Reported as a large dark ceiling panel hiding the numbers from one side, and the
       * geometry checks out exactly: a fixture shade hangs at y 9.35 in the z=20 row, the
       * sign hung at 7.2 at z=15.4, and from a drone at working height mid-aisle the two
       * lie on the same sight line - the shade sat squarely in front of the number for the
       * whole approach from the building's middle. From the other side there is no fixture
       * row in the way, hence "only from one side".
       *
       * Raising the sign steepens its angle faster than the shade's, so the eclipse point
       * retreats to the far rear wall where the fog already owns it. z moves off the
       * fixture row's line for the same reason.
       */
      const signRoot = ENGINE.SceneNode.create({
        name: `AisleSign-${aisle}`,
        position: new THREE.Vector3(x, 8.55, 16.2),
      });
      const frame = mesh(
        'SignFrame',
        new THREE.BoxGeometry(1.58, 0.84, 0.08),
        DARK_STEEL
      );
      const leftHanger = mesh('SignHanger', new THREE.BoxGeometry(0.035, 1.25, 0.035), STEEL, new THREE.Vector3(-0.48, 0.82, 0));
      const rightHanger = mesh('SignHanger', new THREE.BoxGeometry(0.035, 1.25, 0.035), STEEL, new THREE.Vector3(0.48, 0.82, 0));
      const front = mesh(
        'SignFace-Front',
        createWarehouseLabelGeometry(1.45, 0.72),
        labelMaterial(String(aisle), aisle === 5 ? '#e0a24c' : '#d8ffb0'),
        new THREE.Vector3(0, 0, 0.045)
      );
      const back = mesh(
        'SignFace-Back',
        createWarehouseLabelGeometry(1.45, 0.72),
        labelMaterial(String(aisle), aisle === 5 ? '#e0a24c' : '#d8ffb0'),
        new THREE.Vector3(0, 0, -0.045)
      );
      back.rotation.y = Math.PI;
      signRoot.add(frame, front, back, leftHanger, rightHanger);
      if (aisle === 4) this.duplicateAisleSigns = [front, back];
      this.root.add(signRoot);
      /**
       * The rack, loaded like a rack rather than filled like a spreadsheet.
       *
       * It was 24 cartons on a strict four-by-six grid, one per slot, all within a few
       * centimetres of each other in size. Regularity at that scale is the loudest "this was
       * generated" signal a set can send - the eye finds the period immediately, and once it
       * has, every aisle in the building is the same aisle.
       *
       * Four things break it, and each is true of a working warehouse rather than merely
       * random:
       *
       *  - EMPTY BAYS. A warehouse that is completely full is one that has stopped trading.
       *    About one slot in six is bare decking, and the gaps are what let you see through a
       *    rack into the next aisle - most of the depth in any shot of one.
       *  - PALLETS. Nothing sits on steel decking, and the 14cm dark band under every load is
       *    what makes a stack look supported rather than floating.
       *  - VARIED HEIGHT. One, two or three cartons, because loads are whatever the supplier
       *    sent. A level where every load is the same height reads as a shelf of one product.
       *  - SHRINK WRAP on about a quarter of them, which is the detail that says somebody
       *    prepared these for transport.
       *
       * Seeded off the aisle, so a rack is the same rack every run. That matters more here
       * than the usual §123 reasons: the mission asks the player to remember where 2034 was.
       *
       * ## Merged, and this is not an optimisation afterthought
       *
       * Built as individual nodes this is about 450 meshes across five aisles - roughly 90
       * draw calls an aisle for scenery that never moves a millimetre. The implementation
       * plan asks for exactly this ("instance repeated racks, lights, crates and fittings;
       * merge static decoration by material") against a 60 FPS target at 1080p, and the
       * variety above is what makes merging both necessary and free: every carton needs its
       * own size and position, none of them needs its own draw call.
       *
       * Six buckets, one mesh each per aisle. The three carton shades stay separate because
       * they are three materials; everything else collapses.
       */
      const bucket = {
        pallet: [] as THREE.BufferGeometry[],
        wrap: [] as THREE.BufferGeometry[],
        tapeLight: [] as THREE.BufferGeometry[],
        tapeDark: [] as THREE.BufferGeometry[],
        carton: [[], [], []] as THREE.BufferGeometry[][],
        /*
         * Stock that is not cardboard.
         *
         * The loading above already varies count, height, jitter, tape and wrap, and a long
         * aisle still read as one thing repeated - because every unit in the building was a
         * tan box. Variation WITHIN a type reads as noise; a second type reads as inventory.
         * Two more silhouettes is all it takes, and both are things a warehouse of this kind
         * genuinely holds.
         *
         * The drums are also the only saturated colour on the racking, and they are cool -
         * which gives the room's cold half a third place to land after the clerestory and the
         * floor wear, this time at eye height in the middle distance.
         */
        tote: [] as THREE.BufferGeometry[],
        toteLid: [] as THREE.BufferGeometry[],
        drum: [] as THREE.BufferGeometry[],
        drumBand: [] as THREE.BufferGeometry[],
      };
      const BAY_Z = RACK_BAY_Z;
      const LEVEL_Y = RACK_LEVEL_Y;
      for (const [bayIndex, bayZ] of BAY_Z.entries()) {
        for (const [level, levelY] of LEVEL_Y.entries()) {
          // Never the bottom of a bay: a rack with a hole at floor level reads as broken
          // rather than as busy.
          /*
           * An empty slot is now a hole the drone can fly through, so it has to be recorded
           * rather than merely skipped. The key is aisle:bay:level and the set is read by
           * constrainDrone - see the rack section there.
           */
          const slotKey = `${aisle}:${bayIndex}:${level}`;
          if (level > 0 && (RESERVED_PICK_SLOTS.has(slotKey) || rng() < 0.17)) {
            this.emptyBays.add(slotKey);
            continue;
          }

          const side = (bayIndex + level) % 2 ? 0.27 : -0.24;
          const px = x + side * 0.4;
          const pz = bayZ + jitter(rng, 0.1);

          // Eleven boxes rather than one, and see palletGeometry for why that is worth it on
          // the object the player spends the most time looking at.
          const deckTop = levelY - 0.07;
          bucket.pallet.push(...palletGeometries(px, deckTop, pz));
          /*
           * ## Everything on a pallet stands ON it, and stops under the shelf above
           *
           * Reported as assets passing through other assets, especially the cartons, and the
           * arithmetic was blunt about it once it was written down.
           *
           * SINKING: a first-tier carton was placed at `levelY + height/2 - 0.26`, so its
           * underside sat at levelY - 0.26 while the pallet deck it stands on is at
           * levelY - 0.07. Every bottom carton in the building was nineteen centimetres inside
           * its own pallet. Totes were five centimetres under and drums seven, from three
           * separately hand-typed offsets that had each been nudged until the stack looked
           * about right from one angle.
           *
           * INTERPENETRATING: tiers stepped by a fixed 0.68 while carton heights range 0.52 to
           * 0.78, so any box over 0.68 tall had the next one growing out of its lid - up to ten
           * centimetres of overlap. Stacks now accumulate the real heights.
           *
           * PUNCHING THROUGH: levels are 1.35 apart and the shelf above sits 1.07 over the
           * deck, but `load` went up to three - and three cartons is up to 2.34m. A full stack
           * went straight through the beam above it and into the next level's pallet. HEADROOM
           * is measured from the shelf line and tiers stop when the next will not fit, which
           * is also what a person loading a rack does.
           */
          const headroom = (RACK_SHELF_Y[level + 1] ?? levelY + 1.02) - deckTop - 0.04;

          /*
           * Drawn per pallet, not per carton, because a pallet holds ONE kind of thing. Mixed
           * boxes and drums on a single pallet reads as a bug rather than as stock.
           */
          const stock = rng();
          if (stock < 0.07) {
            for (const [dx, dz] of [[-0.3, -0.26], [0.3, -0.26], [-0.3, 0.26], [0.3, 0.26]] as const) {
              if (rng() < 0.22) continue;
              const drum = new THREE.CylinderGeometry(0.26, 0.26, 0.82, 12);
              drum.translate(px + dx, deckTop + 0.41, pz + dz);
              bucket.drum.push(drum);
              const band = new THREE.CylinderGeometry(0.268, 0.268, 0.07, 12);
              band.translate(px + dx, deckTop + 0.58, pz + dz);
              bucket.drumBand.push(band);
            }
            continue;
          }
          if (stock < 0.19) {
            const stack = Math.min(1 + Math.floor(rng() * 3), Math.max(1, Math.floor(headroom / 0.41)));
            for (let tier = 0; tier < stack; tier++) {
              // 0.41 a tier: a 0.36 tote plus the 0.05 lid the next one stands on.
              const y = deckTop + tier * 0.41 + 0.18;
              const tote = new THREE.BoxGeometry(1.02, 0.36, 0.76);
              tote.translate(px + jitter(rng, 0.04), y, pz + jitter(rng, 0.04));
              bucket.tote.push(tote);
              const lid = new THREE.BoxGeometry(1.06, 0.05, 0.8);
              lid.translate(px + jitter(rng, 0.04), y + 0.2, pz + jitter(rng, 0.04));
              bucket.toteLid.push(lid);
            }
            continue;
          }

          const load = 1 + Math.floor(rng() * 3);
          const wrapped = rng() < 0.26;
          let stackY = deckTop;
          let tiers = 0;
          for (let tier = 0; tier < load; tier++) {
            const height = 0.52 + rng() * 0.26;
            // Stop rather than overflow: a loader who cannot fit another box does not add it.
            if (tier > 0 && stackY + height - deckTop > headroom) break;
            const cx = px + jitter(rng, 0.07);
            const cy = stackY + height * 0.5;
            const cz = pz + jitter(rng, 0.07);
            const depth = 0.6 + rng() * 0.26;

            const carton = new THREE.BoxGeometry(0.66 + rng() * 0.3, height, depth);
            carton.translate(cx, cy, cz);
            bucket.carton[Math.floor(rng() * 3)].push(carton);

            // Tape down the middle, on most of them but not all - a box nobody has opened.
            if (rng() < 0.62) {
              const tape = new THREE.BoxGeometry(0.072, height + 0.012, depth + 0.012);
              tape.translate(cx, cy, cz);
              (rng() < 0.5 ? bucket.tapeLight : bucket.tapeDark).push(tape);
            }
            stackY += height;
            tiers += 1;
          }
          // The wrap follows the stack it is wrapping, so it cannot outgrow it either.
          if (wrapped && tiers > 1) {
            const wrapHeight = stackY - deckTop + 0.06;
            const wrap = new THREE.BoxGeometry(1.06, wrapHeight, 0.98);
            wrap.translate(px, deckTop + wrapHeight / 2 - 0.03, pz);
            bucket.wrap.push(wrap);
          }
        }
      }

      /*
       * The light tier, and the reason the racking went dark.
       *
       * A rack is a dark lattice holding pale boxes. Both halves of that have to be true or
       * neither reads: the frames were within five points of the cartons they carry, so a
       * loaded bay came out as one mid-value mass with some texture in it. The frames are
       * down at 0.22 now and these come up, which puts about thirty points of value between
       * the thing and the thing it holds.
       *
       * Still three shades, because a hundred identical boxes is its own kind of flat - but
       * spread wider, so the spread survives the posterise instead of collapsing into one
       * band.
       */
      const CARTONS = [
        new THREE.MeshStandardMaterial({ color: '#cea764', roughness: 0.95 }),
        new THREE.MeshStandardMaterial({ color: '#b29058', roughness: 0.95 }),
        new THREE.MeshStandardMaterial({ color: '#bf9a5e', roughness: 0.95 }),
      ];
      const merged: Array<[string, THREE.BufferGeometry[], THREE.Material]> = [
        [`RackPallets-${aisle}`, bucket.pallet, PALLET],
        [`RackTotes-${aisle}`, bucket.tote, TOTE],
        [`RackToteLids-${aisle}`, bucket.toteLid, TOTE_LID],
        [`RackDrums-${aisle}`, bucket.drum, DRUM],
        [`RackDrumBands-${aisle}`, bucket.drumBand, DRUM_BAND],
        [`RackTapeLight-${aisle}`, bucket.tapeLight, TAPE_LIGHT],
        [`RackTapeDark-${aisle}`, bucket.tapeDark, TAPE_DARK],
        [`RackWrap-${aisle}`, bucket.wrap, WRAP],
        ...bucket.carton.map(
          (pieces, index) =>
            [`RackCartons-${aisle}-${index}`, pieces, CARTONS[index]] as [string, THREE.BufferGeometry[], THREE.Material]
        ),
      ];
      for (const [name, pieces, material] of merged) {
        if (!pieces.length) continue;
        const geometry = mergeGeometries(pieces, false);
        if (geometry) this.root.add(mesh(name, geometry, material));
      }
      /*
       * A continuous location strip down each rack face, numbered in tens.
       *
       * A package address in this mission is spatial - 2034 is aisle 2, bay 34 - so the bay
       * markings ARE the navigation loop. They were four panels per aisle reading 01-25,
       * 26-50, 51-75 and 76-99: a quarter of a twenty-five metre run per sign, so "bay 34"
       * narrowed the search to six metres of rack and left the player to guess inside it.
       * Reported as not being able to tell where 2034 actually was.
       *
       * Tens rather than quarters, which is how a real aisle is marked, and at 2.5m a marker
       * the carton is the only thing left in front of you. But ten markers a side is forty
       * label panels an aisle, each with its own canvas and its own draw call, against racks
       * that were deliberately merged down to six - so this is not forty signs. It is ONE
       * sign twenty-five metres long with all ten ranges drawn along it: two meshes an aisle,
       * and one texture shared by the whole building.
       *
       * The bay-to-metres mapping comes from `warehouseBayZ`, the same function that places
       * the package, so the strip cannot drift from what it is labelling. If it ever did,
       * every sign in the building would be lying at once and the bug would present as a
       * package that is not where the manifest says.
       */
      for (const side of [-1, 1]) {
        /*
         * `createWarehouseLabelGeometry`, not a bare PlaneGeometry: the engine uploads
         * textures with flipY disabled, so a runtime canvas label has to reverse its own V
         * axis or every glyph on it comes out upside down. Caught on the first close capture
         * of this strip, reading a perfectly correct "01-10" inverted.
         *
         * Rotating a plane +90 degrees about Y sends its local +x to world -z, and -90
         * degrees sends it to +z. Only one of those runs the numbers the same way the bays
         * do, so the other face takes a MIRRORED texture rather than a flipped mesh. Flipping
         * the mesh was tried on the zone floor plates and cost four builds: a negative scale
         * culls the quad, and a 180 degree rotation fixes the reading order while reversing
         * the direction, which is the same bug wearing a hat.
         */
        const ruler = mesh(
          `BayRuler-${aisle}-${side < 0 ? 'L' : 'R'}`,
          createWarehouseLabelGeometry(WAREHOUSE_BAY_RUN, BAY_RULER_HEIGHT),
          bayRulerMaterial(side > 0),
          new THREE.Vector3(x + side * 0.79, 1.95, WAREHOUSE_BAY_Z0 + WAREHOUSE_BAY_RUN / 2)
        );
        ruler.rotation.y = side < 0 ? -Math.PI / 2 : Math.PI / 2;
        this.root.add(ruler);
      }
      for (const z of [-12.2, 14.2]) {
        const guard = mesh(
          `RackEndGuard-${aisle}`,
          new THREE.BoxGeometry(1.92, 0.42, 0.2),
          AMBER,
          new THREE.Vector3(x, 0.21, z)
        );
        this.root.add(guard);
      }
    }
  }

  private buildStations(): void {
    const position = this.stationPositions.hold;
    /*
     * The HOLD BAY floor legend is gone; the amber plinth stays.
     *
     * It sat two metres off door C's dock and read badly from every angle a drone actually
     * approaches it from - text laid flat on a platform is legible from directly above and
     * from nowhere else, and the one view that matters here is a machine coming in low from
     * the aisle. Removed on request.
     *
     * The station itself is untouched: the amber plinth is still the mark on the floor, and
     * the console names the hold bay in words when the decision is offered, which is the
     * moment the player needs to know which platform it is.
     */
    /*
     * The amber plinth is gone too, and it was clipping.
     *
     * It spanned x 18.5..21.9 by z 17.7..20.3; door C's transfer dock, rotated a quarter turn
     * onto the east wall, occupies 20.33..23.08 by 18.13..21.88. That is 1.58m of overlap in x
     * and 2.18m in z - the yellow box sitting through the drop point, reported as exactly that.
     *
     * Removed rather than moved, which follows the label going last pass: the hold decision is
     * a console action, not a place the drone flies to. The floor hatching stays as the mark,
     * and `stationPositions` still drives the optical bracket in WarehouseRig - so the station
     * is still findable through the one instrument that was ever pointing at it.
     */
    void position;
    for (const id of WAREHOUSE_DOOR_IDS) {
      const layout = WAREHOUSE_DOORS[id];
      const dock = new WarehouseTransferDock(layout);
      this.transferDocks.set(id, dock);
      this.root.add(dock.root);
    }
  }

  private buildServiceDoors(): void {
    for (const id of WAREHOUSE_DOOR_IDS) {
      const serviceDoor = new WarehouseServiceDoor(WAREHOUSE_DOORS[id]);
      this.serviceDoors.set(id, serviceDoor);
      this.root.add(serviceDoor.root);
    }
  }

  private buildConveyors(): void {
    const xs = WAREHOUSE_LAYOUT.sortation.conveyorX;
    const labels = ['LOCAL', 'REGIONAL', 'LONG-HAUL'];
    for (let lane = 0; lane < xs.length; lane++) {
      const laneRoot = ENGINE.SceneNode.create({
        name: `Conveyor-${labels[lane]}`,
        position: new THREE.Vector3(xs[lane], 0, WAREHOUSE_LAYOUT.sortation.centerZ),
      });
      laneRoot.add(mesh('Belt', new THREE.BoxGeometry(1.72, 0.28, WAREHOUSE_LAYOUT.sortation.conveyorLength), BELT, new THREE.Vector3(0, 0.65, 0)));
      for (let roller = 0; roller < 31; roller++) {
        const rollerNode = mesh('Roller', new THREE.CylinderGeometry(0.095, 0.095, 1.58, 10), STEEL, new THREE.Vector3(0, 0.86, -9.65 + roller * 0.645));
        rollerNode.rotation.z = Math.PI / 2;
        laneRoot.add(rollerNode);
        this.conveyorRollers.push(rollerNode);
      }
      /*
       * Guide rails, and they are the reason a conveyor reads as a conveyor.
       *
       * The belt was a dark box with steel rollers on it - correct, and at any distance a
       * dark stripe on a dark floor. Every reference photograph of a sortation bay has the
       * same thing doing the work: a pair of painted rails running the length of the run,
       * catching the light along their whole top edge. It is a continuous line where
       * everything else in the room is a repeated object, which is what makes it read
       * instantly and from anywhere.
       *
       * Amber, because that is this game's colour for a working system, and because the
       * three lanes are a decision the player has to make at a glance.
       */
      for (const rail of [-0.92, 0.92]) {
        laneRoot.add(
          mesh('ConveyorGuide', new THREE.BoxGeometry(0.09, 0.2, WAREHOUSE_LAYOUT.sortation.conveyorLength), GUIDE, new THREE.Vector3(rail, 0.94, 0)),
          mesh('ConveyorGuideFoot', new THREE.BoxGeometry(0.07, 0.36, WAREHOUSE_LAYOUT.sortation.conveyorLength), DARK_STEEL, new THREE.Vector3(rail, 0.68, 0))
        );
      }
      for (const z of [-8.5, -2.8, 2.8, 8.5]) {
        laneRoot.add(
          mesh('ConveyorLeg', new THREE.BoxGeometry(0.1, 0.72, 0.1), STEEL, new THREE.Vector3(-0.72, 0.35, z)),
          mesh('ConveyorLeg', new THREE.BoxGeometry(0.1, 0.72, 0.1), STEEL, new THREE.Vector3(0.72, 0.35, z))
        );
      }
      const label = readableLabelPanel('ConveyorLabel', labels[lane], 1.62, 0.52, '#e0a24c', new THREE.Vector3(0, 1.55, 10.18));
      laneRoot.add(label.root);
      this.root.add(laneRoot);
    }

    /*
     * ## The wireframe, and it was literally `wireframe: true`
     *
     * Reported three times as a wireframe or glass rectangle passing through the conveyor
     * belt. Twice I looked for something SOLID intersecting a belt and found real but
     * different faults - two security gates, then the scan curtain, then the sun shaft's hard
     * rim. All three were worth fixing and none of them was this.
     *
     * This is: two 8.2m boxes at x 15.55 in a MeshStandardMaterial with `wireframe: true`,
     * running the length of the sortation hall right beside lane one. Three.js draws that as
     * literal polygon edges - so a long thin rectangle of hairlines, hanging in the air,
     * crossing everything behind it. It is a debug material that shipped.
     *
     * The comment above it explained the intent - "the sorting hall is a destination, not an
     * obstacle" - which is why it was made see-through. Wireframe is not see-through, it is
     * un-rendered. The two security gates at z -14.25 and 14.25 already mark the hall's
     * boundary, so the fence is removed rather than rebuilt as a real mesh screen.
     *
     * If a physical divider is ever wanted here it needs posts and a panel, not a flag.
     */
    this.root.add(
      mesh('SortationInspectionTable', new THREE.BoxGeometry(5.9, 0.18, 1.7), STEEL, new THREE.Vector3(19.6, 1.05, 12.35)),
      mesh('SortationTableShelf', new THREE.BoxGeometry(5.4, 0.12, 1.35), DARK_STEEL, new THREE.Vector3(19.6, 0.42, 12.35)),
      mesh('SortationCatwalk', new THREE.BoxGeometry(7.6, 0.22, 12), DARK_STEEL, new THREE.Vector3(19.55, 6.4, -1.2))
    );
    /*
     * The third leg moves off the portal.
     *
     * The inspection portal stands at z 4.2 and is 1.18 deep, so it occupies 3.61 to 4.79; a
     * catwalk leg at 3.9 ran floor-to-catwalk straight through its crown and its west upright.
     * Two structures put up in different files, neither able to see the other. 2.6 keeps the
     * spacing even enough and clears the portal by a metre.
     */
    for (const z of [-6.3, -1.2, 2.6]) {
      this.root.add(
        mesh('CatwalkSupport', new THREE.BoxGeometry(0.16, 6.3, 0.16), STEEL, new THREE.Vector3(16.05, 3.15, z)),
        mesh('CatwalkSupport', new THREE.BoxGeometry(0.16, 6.3, 0.16), STEEL, new THREE.Vector3(23.05, 3.15, z))
      );
    }
    /*
     * The catwalk rail gets its stanchions.
     *
     * Two amber rails ran the twelve-metre catwalk at y 7.35 with the deck at 6.4 - nearly a
     * metre of clear air under each, held up by nothing. The last finding of the audit sweep
     * and the same fault the mezzanine stair had: a handrail is two lines and the posts that
     * carry them, and the posts are the half nobody draws.
     */
    for (const x of [16.15, 23]) {
      this.root.add(mesh('CatwalkRail', new THREE.BoxGeometry(0.08, 0.08, 12), AMBER, new THREE.Vector3(x, 7.35, -1.2)));
      for (let post = 0; post < 9; post++) {
        this.root.add(mesh(
          'CatwalkStanchion',
          new THREE.BoxGeometry(0.06, 0.95, 0.06),
          AMBER,
          new THREE.Vector3(x, 6.88, -6.9 + post * 1.42)
        ));
      }
    }

    const intake = ENGINE.SceneNode.create({
      name: 'VerifiedInboundIntake',
      position: new THREE.Vector3(this.verifiedIntakePosition.x, 0, this.verifiedIntakePosition.z),
    });
    const status = new THREE.MeshStandardMaterial({
      color: '#365c4a',
      emissive: '#1c5f3a',
      emissiveIntensity: 1.35,
      roughness: 0.42,
    });
    this.verifiedIntakeStatus = status;
    intake.add(
      mesh('VerifiedIntakeApron', new THREE.BoxGeometry(2.7, 0.16, 2.5), DARK_STEEL, new THREE.Vector3(0, 0.08, 0.25)),
      mesh('VerifiedIntakeGuideLeft', new THREE.BoxGeometry(0.12, 0.48, 2.2), GUIDE, new THREE.Vector3(-1.02, 0.69, 0.12)),
      mesh('VerifiedIntakeGuideRight', new THREE.BoxGeometry(0.12, 0.48, 2.2), GUIDE, new THREE.Vector3(1.02, 0.69, 0.12)),
      mesh('VerifiedIntakeClampLeft', new THREE.BoxGeometry(0.18, 0.22, 0.74), STEEL, new THREE.Vector3(-0.62, 0.9, 0)),
      mesh('VerifiedIntakeClampRight', new THREE.BoxGeometry(0.18, 0.22, 0.74), STEEL, new THREE.Vector3(0.62, 0.9, 0)),
      mesh('VerifiedIntakeStatusLeft', new THREE.BoxGeometry(0.08, 0.1, 1.9), status, new THREE.Vector3(-1.14, 0.55, 0.1)),
      mesh('VerifiedIntakeStatusRight', new THREE.BoxGeometry(0.08, 0.1, 1.9), status, new THREE.Vector3(1.14, 0.55, 0.1))
    );
    const scanner = mesh(
      'VerifiedIntakeScanner',
      new THREE.BoxGeometry(2.1, 0.035, 0.08),
      new THREE.MeshStandardMaterial({
        color: '#91d4c4',
        emissive: '#4fc3a0',
        emissiveIntensity: 2.4,
        transparent: true,
        opacity: 0.78,
        roughness: 0.3,
      }),
      new THREE.Vector3(0, 1.34, 0.1)
    );
    this.verifiedIntakeScanner = scanner;
    intake.add(scanner);

    /*
     * The one thing in this room that says WHERE TO PUT IT.
     *
     * The intake is a well-made object - apron, guides, clamps, a moving scanner bar - and it
     * is one of about forty well-made objects along that wall. Its floating VERIFIED INTAKE
     * legend was removed with the other three, correctly: a sign is a caption on a machine and
     * this game's rule is that machines say what they are by being shaped like themselves.
     *
     * That rule works when the player is looking at the thing. It does nothing at all when the
     * player is holding a package at the other end of a building and does not know which of
     * forty machines is the one - "there is no indicator where the verified intake to drop the
     * box is". A shape can identify a thing; only light can locate it.
     *
     * So this is not a label coming back. It is a landing aid, on the same terms the rest of
     * the room already uses: it exists only while the drone is carrying something that belongs
     * here, and it goes out the moment the load lands. A beacon that is always on is scenery
     * again within a minute.
     */
    const guide = ENGINE.SceneNode.create({ name: 'VerifiedIntakeGuide' });
    /*
     * UNLIT, additive, and not tone-mapped. All three matter.
     *
     * The first version was a MeshStandardMaterial at 0.34 opacity, and it was invisible in
     * play - "I don't see the indicator". A standard material is lit by the room and then run
     * through the same ACES curve as everything else, so a pale green cylinder in a warehouse
     * full of pale green sodium light is exactly as bright as the wall behind it. A beacon
     * cannot be a surface; it has to be a light.
     *
     * MeshBasicMaterial ignores the lighting, toneMapped:false keeps it off the grade curve,
     * and additive blending means it can only ever ADD to what is behind it - so it reads
     * against dark racking and against the lit floor equally.
     */
    const beamMaterial = new THREE.MeshBasicMaterial({
      color: '#9dffd8',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    /*
     * A column, a ring at its foot, and a wide disc on the deck.
     *
     * The column is for looking down an aisle - the drone flies at head height between racks
     * four metres tall and anything drawn only on the floor is behind the racking from
     * everywhere that matters. The disc is for the opposite case, which is most of the time:
     * the drone looks DOWN, and from above a vertical column is a dot.
     */
    const beacon = (name: string, geometry: THREE.BufferGeometry, at: THREE.Vector3): ENGINE.MeshNode => {
      const node = ENGINE.MeshNode.create({
        name,
        geometry,
        material: beamMaterial,
        castShadow: false,
        receiveShadow: false,
      });
      node.position.copy(at);
      // Drawn after the room, so nothing solid in front is depth-sorted over the top of it.
      node.renderOrder = 6;
      return node;
    };
    const beam = beacon('VerifiedIntakeBeam', new THREE.CylinderGeometry(0.22, 0.6, 7.6, 14, 1, true), new THREE.Vector3(0, 3.9, 0.25));
    const halo = beacon('VerifiedIntakeHalo', new THREE.TorusGeometry(1.34, 0.07, 8, 32), new THREE.Vector3(0, 0.22, 0.25));
    const pad = beacon('VerifiedIntakePad', new THREE.CircleGeometry(1.5, 32), new THREE.Vector3(0, 0.19, 0.25));
    halo.rotation.x = Math.PI / 2;
    pad.rotation.x = -Math.PI / 2;
    guide.add(beam, halo, pad);
    guide.visible = false;
    this.verifiedIntakeGuide = guide;
    intake.add(guide);
    /*
     * The VERIFIED INTAKE sign is removed, and it is the third floating legend to go.
     *
     * It sat at y 1.68 on the intake, which puts it at eye level in front of the sortation
     * lanes - so from the aisle it read as a lit panel stuck on a conveyor, clipped to
     * "IFIED INT" by the belt in front of it. Same fault as the HOLD BAY plate and the same
     * answer: the station is a place the console names in words at the moment the player is
     * told to go there, and it has its own lit clamps, guides and scanner line to be
     * recognised by.
     */
    this.root.add(intake);
  }

  private buildSecurityZones(): void {
    const gateMaterial = new THREE.MeshStandardMaterial({ color: '#18211f', roughness: 0.58, metalness: 0.78 });
    /*
     * The security shutters ROLL UP. They used to park.
     *
     * Reported as a black rectangle covering the aisle numbers, and the geometry was blunt
     * about it: each gate is up to 19.4m wide and 5.8m tall, and "open" moved its CENTRE to
     * y 9.2 - so the open state hung from 6.3 to 12.1, four metres of solid dark slab below a
     * ceiling at 10.35, permanently, across the whole building. The aisle signs sit at y 8.55
     * and z 16.2; `StorageWestSecurityGate-Front` parked at z 15.55. It was parked 65cm in
     * front of the one thing the player is asked to navigate by.
     *
     * Sliding the whole curtain further up cannot fix it, because the curtain is taller than
     * the space above the opening. A real roller shutter does not move out of the way, it
     * stops existing: it winds onto a drum. So the geometry is anchored at its TOP edge and
     * the open state is a SCALE, which collapses the curtain into its housing and leaves a
     * 17cm lip. `Box3.setFromObject` respects scale, so containment collision follows for
     * free rather than needing a case of its own.
     */
    const addGate = (zone: WarehouseSecurityZoneId, name: string, width: number, x: number, z: number): void => {
      const curtain = new THREE.BoxGeometry(width, GATE_DROP, 0.16);
      // Origin at the top edge, so scaling y grows the curtain downward out of the drum.
      curtain.translate(0, -GATE_DROP / 2, 0);
      const node = mesh(name, curtain, gateMaterial, new THREE.Vector3(x, GATE_HEAD_Y, z));
      node.scale.y = GATE_OPEN_SCALE;
      this.root.add(node);
      /*
       * The drum it winds onto - and it has to COVER the parked curtain, not perch above it.
       *
       * GATE_OPEN_SCALE is 0.03 of a 5.8m drop, so an open gate leaves 17cm of dark panel
       * hanging from the head. With the drum centred at head + 0.22 that sliver was below it
       * and in plain view: three of these across the building at y 5.7, each up to nineteen
       * metres wide, reading as long thin bars ruled across everything behind them - the
       * wireframe rectangle reported as crossing the conveyor.
       *
       * At head - 0.09 the drum spans head - 0.31 to head + 0.13, which contains the parked
       * curtain completely, and it is 0.36 deep against the curtain's 0.16 so it hides it from
       * the side as well.
       */
      this.root.add(mesh(
        `${name}-Drum`,
        new THREE.BoxGeometry(width + 0.26, 0.44, 0.36),
        gateMaterial,
        new THREE.Vector3(x, GATE_HEAD_Y - 0.09, z)
      ));
      const gates = this.securityGates.get(zone) ?? [];
      gates.push({ node });
      this.securityGates.set(zone, gates);
    };
    /*
     * ## The east ends stop short of the transfer belt
     *
     * Two of these gates were built straight through the conveyor. The belt is a CatmullRom
     * curve defined in WarehouseAutomation and the gates are widths and centres typed here,
     * so nothing at either call site could show the collision - `scripts/dev/probe-clip.ts`
     * samples the curve and measures it: ReceivingSecurityGate-East was through the belt by
     * 0.60m and StorageEastSecurityGate-Rear by 1.19m, both at working height, and
     * SortationSecurityGate-Rear cleared the other side by one centimetre.
     *
     * The boundary already has a deliberate gap here for the belt to pass; it was simply not
     * wide enough. West edges are unchanged, so no zone gets shorter anywhere else.
     */
    addGate('receiving', 'ReceivingSecurityGate-West', 17.2, -13.5, -14.45);
    addGate('receiving', 'ReceivingSecurityGate-East', 16.4, 4.8, -14.45);
    addGate('storage-west', 'StorageWestSecurityGate-Rear', 19.4, -12.2, -14.15);
    addGate('storage-west', 'StorageWestSecurityGate-Front', 19.4, -12.2, 15.55);
    addGate('storage-east', 'StorageEastSecurityGate-Rear', 15.1, 5.45, -14.15);
    addGate('storage-east', 'StorageEastSecurityGate-Front', 16.8, 6.3, 15.55);
    addGate('sortation', 'SortationSecurityGate-Rear', 7.3, 19.75, -14.25);
    addGate('sortation', 'SortationSecurityGate-Front', 7.7, 19.55, 14.25);

    for (const id of WAREHOUSE_SECURITY_ZONE_IDS) {
      const zone = WAREHOUSE_SECURITY_ZONES[id];
      const label = readableLabelPanel(
        `SecurityZone-${zone.label}`,
        `${zone.shortLabel} // ${zone.label}`,
        3.9,
        0.58,
        /*
         * The sign takes the zone's own accent instead of one shared red.
         *
         * All four hung in the same colour, which meant the only thing distinguishing four
         * places was text eight metres up. Matching the floor plate below it lets the sign and
         * the ground agree, so the colour is learned once and then recognised without reading.
         * See ZONE_ACCENT in WarehouseFacilities - the two tables are deliberately the same
         * four values, and if they ever diverge the room stops teaching its own colour code.
         */
        ZONE_SIGN_ACCENT[id] ?? '#df6b5c',
        new THREE.Vector3(
          (zone.bounds.minX + zone.bounds.maxX) / 2,
          8.35,
          id === 'receiving' ? -14.25 : zone.bounds.maxZ
        )
      );
      this.root.add(label.root);
    }
  }

  /**
   * The night truck, which was a box with four wheels on it.
   *
   * The objective line says "receive the NIGHT truck", so this is the one prop in the mission
   * the player is explicitly told to look for. What was there was a 9.5 by 5.3 by 8.5 metre
   * slab, a thinner slab stuck to its front, a bumper and four cylinders - measured off a
   * capture, an unbroken black rectangle filling a third of the frame with no feature on it
   * anywhere.
   *
   * Three things fix that, in order of how much each one does:
   *
   *  - MARKER LAMPS. A trailer at night is recognised by its outline of amber markers before
   *    anything else about it is visible, and they are emissive, so they do not wait on the
   *    exterior having any light in it. This is what turns the rectangle into a vehicle.
   *  - A DOCK LAMP over the opening - see buildDockLamps. The rear apron had no light of its
   *    own at all, so everything here was invisible regardless of what it was made of, and
   *    detailing an unlit object is work nobody ever sees.
   *  - THE ANATOMY. Corrugated sides, a top rail and skirt, chassis beams, landing gear,
   *    mudflaps, wheel hubs. Merged into two meshes, so the whole vehicle still costs about
   *    what it cost as a box.
   *
   * The footprint is unchanged. It is 9.5m wide because the dock seal is 10.1m wide, and
   * narrowing one without the other opens a gap in the one place in this building where a gap
   * would read as a hole in the wall.
   */
  /**
   * Conduit, sprinkler main and cable tray - what the fixtures are hanging FROM.
   *
   * The lamps were on stems into nothing. A stem that stops in mid-air reads as a prop
   * hanging in a room rather than as a fitting installed in a building, and the ceiling is
   * the emptiest part of the frame - it measured as the darkest third even after the
   * lighting rebalance, because there is genuinely nothing up there to catch light.
   *
   * Services are what real ceilings are made of, and they are also the right shape for this
   * problem: long unbroken runs. They give the upper third the one thing it has none of -
   * lines going somewhere - and because they run the length of the building they describe
   * its depth from any angle, which thirty separate lamps cannot do.
   *
   * The sprinkler main is red because sprinkler mains are, and it is the only saturated
   * thing above head height in the whole room.
   *
   * Merged into two meshes. Six conduit runs, four mains and fifty-odd drop heads as
   * individual nodes would be another sixty draw calls on scenery that never moves.
   */
  /**
   * Navigation painted on the floor, which is where the player is actually looking.
   *
   * The aisle numbers hang at y 8.55. A drone at working height is two metres up with racking
   * six metres tall on both sides, so for most of a run those signs are outside the frustum
   * or behind a rack - the player is flying down a corridor reading the floor and the bay
   * strips. The one piece of information the mission asks for constantly, "which aisle is
   * this", was the one piece that lived somewhere they could not see.
   *
   * It is also the largest undressed surface left. The slab is 48 by 58 metres and carried
   * four guide lines, some chevrons and a few stains, so it read as a large tan plane with
   * marks on it rather than as a floor somebody laid out.
   *
   * Painted rather than signposted: big numerals at both ends of every run, a hatched
   * keep-clear at each aisle mouth, and a pedestrian walkway across the front. All of it is
   * information the building would really carry, which is the test for set dressing - if it
   * would not be there in life it is decoration, and decoration is what makes a place look
   * like a set.
   *
   * The aisle COUNT is read from the layout, never written. See WAREHOUSE_AISLE_COUNT.
   */
  /**
   * Column guards and end ties, which is how a rack ends.
   *
   * The runs simply stopped. A rack frame ran to z +-13 and finished on an open pair of
   * uprights, so an aisle mouth - the exact place the player enters on every trip, and the
   * one the floor hatching now marks as a threshold - had nothing built at it.
   *
   * A column guard is the most recognisable object in a warehouse after the racking itself:
   * a bright steel sleeve bolted round the base of every end upright, there because that is
   * where forklifts hit. It is also, usefully, a saturated accent at knee height in the one
   * spot the composition needed one - the bottom of the frame at the end of every run, which
   * until now was floor, floor and more floor.
   *
   * The end ties are the other half: a pair of horizontal members closing the top and middle
   * of the end frame so the run reads as terminated rather than cut off. Deliberately NOT a
   * solid end panel - ten six-metre slabs would wall the aisles off from the cross-aisle and
   * cost the room its long sight lines, which are most of what makes it read as big.
   */
  private buildRackEndProtection(): void {
    const guards: THREE.BufferGeometry[] = [];
    const ties: THREE.BufferGeometry[] = [];
    const halfLength = WAREHOUSE_LAYOUT.rack.length / 2;
    for (const x of WAREHOUSE_LAYOUT.rack.centers) {
      for (const z of [-halfLength, halfLength]) {
        for (const post of [-0.72, 0.72]) {
          // A sleeve round the post base, proud of it on every side.
          guards.push(boxGeometry(new THREE.Vector3(0.3, 0.46, 0.3), new THREE.Vector3(x + post, 0.23, z)));
          // The cap, a shade narrower, so the top edge catches its own line of light.
          guards.push(boxGeometry(new THREE.Vector3(0.34, 0.05, 0.34), new THREE.Vector3(x + post, 0.48, z)));
        }
        // Horizontal ties across the end frame, top and middle.
        for (const y of [5.42, 2.95]) {
          ties.push(boxGeometry(new THREE.Vector3(1.5, 0.09, 0.09), new THREE.Vector3(x, y, z)));
        }
      }
    }
    this.root.add(
      mesh('RackColumnGuards', mergeGeometries(guards, false) ?? new THREE.BoxGeometry(0.1, 0.1, 0.1), AMBER),
      mesh('RackEndTies', mergeGeometries(ties, false) ?? new THREE.BoxGeometry(0.1, 0.1, 0.1), STEEL)
    );
  }

  private buildFloorNavigation(): void {
    const markings: THREE.BufferGeometry[] = [];
    const runFront = WAREHOUSE_BAY_Z0 + WAREHOUSE_BAY_RUN;
    const runRear = WAREHOUSE_BAY_Z0;

    for (const [index, rackX] of WAREHOUSE_LAYOUT.rack.centers.entries()) {
      const aisle = index + 1;
      /*
       * ## Centred in the lane, and both of them readable
       *
       * Two faults, reported together as "not centred and not the right direction".
       *
       * CENTRING: the number sat at rackX + 1.95, which is not the middle of anything. The
       * racks are 7m apart and 1.58m wide, so the clear lane between two of them runs from
       * rackX + 0.79 to rackX + 6.21 and its centre is rackX + 3.5 - a metre and a half from
       * where the numeral was painted. It read as a marking shoved up against the rack it
       * was labelling rather than as the floor of the aisle it names.
       *
       * ORIENTATION: `mirrorU` was on, and the comment justifying it recorded a capture that
       * had misread an upside-down plate as a mirrored one. A plane rotated -90 about X lays
       * flat with its texture-up pointing to world -Z; the aisles run along Z, so the marking
       * reads correctly to a drone flying INTO the aisle and is inverted to one leaving. That
       * is what the second plate's `facing = PI` is for - and PI about the plate's own normal
       * turns a glyph upside down, which is right, while mirrorU flips its handedness, which
       * never is. Both plates now use the unmirrored texture.
       */
      const x = rackX + WAREHOUSE_LAYOUT.rack.spacing / 2;
      for (const [z, facing] of [[runFront + 2.1, 0], [runRear - 2.1, Math.PI]] as const) {
        const plate = mesh(
          `AisleFloorNumber-${aisle}`,
          createWarehouseLabelGeometry(2.6, 2.0),
          floorPaintMaterial(String(aisle)),
          new THREE.Vector3(x, 0.014, z)
        );
        plate.rotation.x = -Math.PI / 2;
        plate.rotation.z = facing;
        this.root.add(plate);
      }

      /*
       * A hatched keep-clear across each aisle mouth.
       *
       * Diagonal bars, which is the marking every warehouse uses for "do not stand here" and
       * which the eye reads as a threshold. It also gives the entrance to a run a hard edge,
       * so flying into an aisle is an event rather than a gradual change of surroundings.
       */
      for (const zEnd of [runFront + 0.4, runRear - 0.4]) {
        for (let i = 0; i < 7; i++) {
          const offset = -1.5 + i * 0.5;
          const bar = new THREE.BoxGeometry(0.16, 0.012, 1.5);
          bar.rotateY(Math.PI * 0.25);
          bar.translate(x + offset, 0.012, zEnd);
          markings.push(bar);
        }
      }
    }

    /*
     * A pedestrian walkway across the front of the racking, edged both sides.
     *
     * The one long unbroken line on the floor, and it does for the ground what the conveyor
     * guides do for the sortation bay: gives a surface of repeated objects a single
     * continuous element to be measured against.
     */
    for (const z of [16.9, 17.9]) {
      markings.push(boxGeometry(new THREE.Vector3(WAREHOUSE_LAYOUT.shell.width - 6, 0.012, 0.14), new THREE.Vector3(0, 0.012, z)));
    }
    for (let x = -20; x <= 20; x += 1.6) {
      markings.push(boxGeometry(new THREE.Vector3(0.1, 0.012, 0.9), new THREE.Vector3(x, 0.012, 17.4)));
    }

    const merged = mergeGeometries(markings, false);
    if (merged) this.root.add(mesh('FloorMarkings', merged, FLOOR_PAINT));
  }

  private buildCeilingServices(): void {
    const conduit: THREE.BufferGeometry[] = [];
    const sprinkler: THREE.BufferGeometry[] = [];
    const runZ = WAREHOUSE_LAYOUT.shell.length / 2 - 2.4;
    const runX = WAREHOUSE_LAYOUT.shell.width / 2 - 2.2;

    const pipe = (
      bucket: THREE.BufferGeometry[],
      radius: number,
      length: number,
      position: THREE.Vector3,
      alongX: boolean
    ): void => {
      const geometry = new THREE.CylinderGeometry(radius, radius, length, 8);
      geometry.rotateZ(alongX ? Math.PI / 2 : 0);
      if (!alongX) geometry.rotateX(Math.PI / 2);
      geometry.translate(position.x, position.y, position.z);
      bucket.push(geometry);
    };

    // A conduit run down each column of fixtures, with a hanger every eight metres.
    for (const x of this.ceilingFixtureColumns) {
      pipe(conduit, 0.055, runZ * 2, new THREE.Vector3(x, 10.06, 0), false);
      for (let z = -runZ + 2; z < runZ; z += 8) {
        conduit.push(boxGeometry(new THREE.Vector3(0.06, 0.34, 0.06), new THREE.Vector3(x, 10.22, z)));
      }
    }

    // A cable tray beside the centre run: an open channel, which reads at a glance.
    for (const side of [-0.42, 0.42]) {
      conduit.push(boxGeometry(new THREE.Vector3(0.04, 0.16, runZ * 2), new THREE.Vector3(-4 + side, 10.24, 0)));
    }
    conduit.push(boxGeometry(new THREE.Vector3(0.88, 0.04, runZ * 2), new THREE.Vector3(-4, 10.17, 0)));

    /*
     * The sprinkler grid: mains across the building, drops hanging off them.
     *
     * Crossing the conduit rather than following it, so the ceiling reads as a lattice from
     * below instead of as six parallel lines - which is what stops it looking like corduroy
     * when the drone turns.
     */
    for (const z of [-19, -9.5, 0, 9.5, 19]) {
      pipe(sprinkler, 0.085, runX * 2, new THREE.Vector3(0, 9.92, z), true);
      for (let x = -runX + 2.4; x < runX; x += 4.2) {
        pipe(sprinkler, 0.028, 0.42, new THREE.Vector3(x, 9.7, z), false);
        sprinkler.push(boxGeometry(new THREE.Vector3(0.11, 0.07, 0.11), new THREE.Vector3(x, 9.47, z)));
      }
      for (let x = -runX + 5; x < runX; x += 10) {
        sprinkler.push(boxGeometry(new THREE.Vector3(0.07, 0.5, 0.07), new THREE.Vector3(x, 10.16, z)));
      }
    }

    this.root.add(
      mesh('CeilingConduit', mergeGeometries(conduit, false) ?? new THREE.BoxGeometry(0.1, 0.1, 0.1), STEEL),
      mesh('CeilingSprinkler', mergeGeometries(sprinkler, false) ?? new THREE.BoxGeometry(0.1, 0.1, 0.1), SPRINKLER)
    );
  }

  private buildTruck(): void {
    const truck = ENGINE.SceneNode.create({ name: 'InboundTruck', position: WAREHOUSE_LAYOUT.truck.clone() });
    const BODY = new THREE.MeshStandardMaterial({ color: '#273538', roughness: 0.78, metalness: 0.3 });
    const RIB = new THREE.MeshStandardMaterial({ color: '#1c2729', roughness: 0.84, metalness: 0.26 });
    const RUBBER = new THREE.MeshStandardMaterial({ color: '#080a09', roughness: 1 });
    const MARKER = new THREE.MeshStandardMaterial({
      color: '#c08a2c',
      emissive: '#c26a10',
      emissiveIntensity: 2.1,
      roughness: 0.34,
    });
    const bodyZ = -2.5;
    const halfLength = 4.25;
    truck.add(
      mesh('Trailer', new THREE.BoxGeometry(9.5, 5.3, 8.5), BODY, new THREE.Vector3(0, 3.0, bodyZ)),
      mesh('TrailerDark', new THREE.BoxGeometry(8.9, 4.7, 0.15), DARK_STEEL, new THREE.Vector3(0, 3, 1.78)),
      mesh('RearBumper', new THREE.BoxGeometry(9.6, 0.32, 0.34), STEEL, new THREE.Vector3(0, 0.45, 1.92)),
      mesh('DockSeal', new THREE.BoxGeometry(10.1, 5.8, 0.26), new THREE.MeshStandardMaterial({ color: '#111615', roughness: 0.98 }), new THREE.Vector3(0, 3.0, 2.0))
    );

    /*
     * Corrugation, a top rail and a skirt - the three lines that read as a trailer side.
     *
     * Merged per material: a rib every 55cm over 8.5 metres on two faces is about thirty
     * boxes, and thirty draw calls for surface texture on a background prop is not a trade
     * worth making.
     */
    const ribs: THREE.BufferGeometry[] = [];
    const frame: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      const x = side * 4.76;
      for (let z = bodyZ - halfLength + 0.5; z < bodyZ + halfLength - 0.4; z += 0.55) {
        ribs.push(boxGeometry(new THREE.Vector3(0.06, 4.5, 0.1), new THREE.Vector3(x, 3.05, z)));
      }
      // Top rail and skirt, proud of the face so each carries its own line of light.
      frame.push(boxGeometry(new THREE.Vector3(0.16, 0.2, 8.5), new THREE.Vector3(x, 5.55, bodyZ)));
      frame.push(boxGeometry(new THREE.Vector3(0.16, 0.34, 8.5), new THREE.Vector3(x, 0.62, bodyZ)));
      // Chassis beam, landing leg and foot, on the underside where the body stops.
      frame.push(boxGeometry(new THREE.Vector3(0.2, 0.34, 7.9), new THREE.Vector3(side * 1.45, 0.2, bodyZ)));
      frame.push(boxGeometry(new THREE.Vector3(0.24, 0.9, 0.24), new THREE.Vector3(side * 2.6, 0.45, bodyZ - 3.1)));
      frame.push(boxGeometry(new THREE.Vector3(0.52, 0.1, 0.52), new THREE.Vector3(side * 2.6, 0.05, bodyZ - 3.1)));
      // A mudflap behind the rear axle, which is the detail that says "road vehicle".
      frame.push(boxGeometry(new THREE.Vector3(0.05, 0.78, 1.05), new THREE.Vector3(side * 3.75, 0.42, -2.15)));
    }
    truck.add(
      mesh('TrailerRibs', mergeGeometries(ribs, false) ?? new THREE.BoxGeometry(0.1, 0.1, 0.1), RIB),
      mesh('TrailerFrame', mergeGeometries(frame, false) ?? new THREE.BoxGeometry(0.1, 0.1, 0.1), STEEL)
    );

    /*
     * Marker lamps, and they are the reason any of this reads at all.
     *
     * Emissive, so they do not depend on the exterior lighting: at night the amber outline
     * along a trailer's roof line is recognised before its shape is, and the rear apron is
     * the darkest place in the level. Five a side plus the rear top corners, which is the
     * real arrangement and also happens to draw the two lines - roof and rear edge - that
     * tell you how big the thing is.
     */
    const markers: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      for (let index = 0; index < 5; index++) {
        const z = bodyZ - halfLength + 0.9 + index * 1.62;
        markers.push(boxGeometry(new THREE.Vector3(0.09, 0.16, 0.34), new THREE.Vector3(side * 4.82, 5.24, z)));
      }
      markers.push(boxGeometry(new THREE.Vector3(0.34, 0.16, 0.09), new THREE.Vector3(side * 4.1, 5.52, bodyZ + halfLength - 0.02)));
    }
    truck.add(mesh('TrailerMarkers', mergeGeometries(markers, false) ?? new THREE.BoxGeometry(0.1, 0.1, 0.1), MARKER));

    for (const x of [-3.75, 3.75]) {
      for (const z of [-4.8, -2.9]) {
        const wheel = mesh('TruckWheel', new THREE.CylinderGeometry(0.72, 0.72, 0.38, 18), RUBBER, new THREE.Vector3(x, 0.72, z));
        wheel.rotation.z = Math.PI / 2;
        truck.add(wheel);
        // A hub, so a wheel is a wheel rather than a black disc.
        const hub = mesh('TruckHub', new THREE.CylinderGeometry(0.24, 0.24, 0.42, 12), STEEL, new THREE.Vector3(x, 0.72, z));
        hub.rotation.z = Math.PI / 2;
        truck.add(hub);
      }
      const tail = mesh(
        'TruckTailLamp',
        new THREE.BoxGeometry(0.42, 0.22, 0.06),
        new THREE.MeshStandardMaterial({ color: '#a33e32', emissive: '#6a130d', emissiveIntensity: 2.2, roughness: 0.32 }),
        new THREE.Vector3(x, 1.05, 1.94)
      );
      truck.add(tail);
    }
    this.root.add(truck);
    this.buildDockLamps();
  }

  /**
   * Two gooseneck lamps over the rear opening, aimed at the trailer.
   *
   * The rear apron carried no light of its own, so everything beyond that wall rendered at a
   * median luma in the teens - which is why the truck could stay a black rectangle for so
   * long without anybody being able to say what was wrong with it. A dock with no dock lamps
   * is the actual omission; the truck was merely where it showed.
   *
   * A real light rather than an emissive cheat, because the point is to land illumination on
   * geometry that has none of its own.
   */
  private buildDockLamps(): void {
    const housing = new THREE.MeshStandardMaterial({ color: '#1b2122', roughness: 0.78, metalness: 0.34 });
    const lens = new THREE.MeshStandardMaterial({
      color: '#d9b877',
      emissive: '#e0a24c',
      emissiveIntensity: 2.4,
      roughness: 0.3,
    });
    for (const x of [-6.2, 6.2]) {
      const lamp = ENGINE.SceneNode.create({
        name: 'DockLamp',
        position: new THREE.Vector3(x, 0, WAREHOUSE_LAYOUT.shell.rearZ - 0.4),
      });
      lamp.add(
        mesh('DockLampArm', new THREE.BoxGeometry(0.11, 0.11, 1.5), housing, new THREE.Vector3(0, 6.6, -0.7)),
        mesh('DockLampShade', new THREE.CylinderGeometry(0.46, 0.26, 0.34, 12), housing, new THREE.Vector3(0, 6.42, -1.38)),
        mesh('DockLampLens', new THREE.CylinderGeometry(0.25, 0.25, 0.06, 12), lens, new THREE.Vector3(0, 6.24, -1.38))
      );
      lamp.add(ENGINE.PointLightNode.create({
        name: 'DockLampLight',
        color: '#f0b871',
        intensity: 42,
        distance: 24,
        decay: 1.6,
        position: new THREE.Vector3(0, 6.05, -1.38),
      }));
      this.root.add(lamp);
    }
  }

  private buildLights(): void {
    /**
     * ## The hemisphere was the thing flattening the room
     *
     * 1.9 of directionless fill, and an ambient has no direction by definition - so every
     * shadow in the building was lifted to roughly the value of every lit surface. Same fault,
     * same number, same symptom as the beacon mast sitting at `daylight` 1: a scene that looks
     * deliberate and measures flat.
     *
     * 0.6, and the sky term goes properly cold while the ground bounce goes warm. That is what
     * a night interior does - cold light down the roof lights, warm light back off a concrete
     * floor under sodium - and it means the ambient itself now carries a little of the
     * warm/cool split rather than washing it out.
     */
    // Ground colour lifted with it: the fill bounces off the slab, and a near-black ground
    // term cancels most of what the sky term is being raised to deliver.
    this.ambientLight = ENGINE.HemisphereLightNode.create({ name: 'WarehouseAmbient', color: '#9fc2d6', groundColor: '#4f4536', intensity: WAREHOUSE_SKY_FILL });
    this.moonLight = ENGINE.DirectionalLightNode.create({
      name: 'WarehouseMoon',
      color: '#a9d0d7',
      // Up from 1.35: with the hemisphere down by two thirds this is the light doing the
      // silhouette work, and it is the only cold key in the building.
      intensity: 1.7,
      position: new THREE.Vector3(-18, 24, 15),
      castShadow: true,
      shadowMapSize: 2048,
      shadowFar: 95,
      shadowNormalBias: 0.025,
      shadowBias: -0.0004,
    });
    this.root.add(this.ambientLight, this.moonLight);
    /*
     * AIM IT. This is a bug fix, not a tuning change.
     *
     * LightNode.updateMatrixWorld builds a directional's target from getWorldDirection() -
     * the node's ROTATION. `position` places the light and does not point it, so an unrotated
     * DirectionalLightNode fires along a fixed axis whatever its position says. Both
     * directionals in this building were unrotated, which means the moon has been contributing
     * essentially nothing to a horizontal floor since it was added, and the "cold key doing the
     * silhouette work" in the note above was never doing it.
     *
     * The tell was outside: the yard read as night while the windows read as noon, because the
     * interior daylight was emissive panes and fake bounce lights - things that glow on their
     * own - and the only light that could have reached the exterior ground was aimed at the
     * horizon. Aiming it is what makes the moon a light rather than a comment.
     *
     * Must be called AFTER add(), or the world matrix it derives from is not the one that ends
     * up in the scene.
     */
    this.moonLight.lookAt(new THREE.Vector3(2, 0, -2));
    /*
     * The fixture has to look like the source of the light under it.
     *
     * It was a pale green lens at 1.15 emissive, which reads as a panel that happens to be
     * slightly brighter than the ceiling. Thirty of them across the roof and not one of them
     * looked switched on. Warm and hot enough to be the brightest thing up there, because a
     * pool on the floor with nothing above it is a decal.
     */
    const fixtureLens = new THREE.MeshStandardMaterial({
      color: '#e8d3ab',
      emissive: '#ffbe72',
      emissiveIntensity: 2.8,
      roughness: 0.38,
      metalness: 0.12,
    });
    this.fixtureLensMaterial = fixtureLens;
    for (const [xIndex, x] of [-20, -12, -4, 4, 12, 20].entries()) {
      for (const [zIndex, z] of [-20, -10, 0, 10, 20].entries()) {
        /**
         * High bays that hang, rather than strips flush with the roof.
         *
         * Measured, the ceiling band came out at median luma 6 - a black void across the top
         * third of every shot - because a 55mm-deep strip pressed against a dark roof ten
         * metres up has no silhouette and no side to catch anything. The reference shots of
         * real warehouses all have the same thing going on up there: a row of deep shades on
         * stems, receding, and it is most of what tells you the building is tall.
         *
         * A stem, a conical shade and a lens under it. The shade is deliberately DARK on the
         * outside and the lens is hot - that pairing is the whole read, because a lamp is a
         * bright thing inside a dark thing, and a fixture that glows all over is a floating
         * rectangle.
         *
         * Hung to 9.05, which is 70cm below the roof and still 70cm above the drone's ceiling
         * at 8.35 - close enough to be objects in the room rather than texture on it, clear
         * enough that nobody flies into one.
         */
        const stem = mesh('CeilingFixtureStem', new THREE.CylinderGeometry(0.045, 0.045, 0.62, 6), DARK_STEEL, new THREE.Vector3(x, 9.9, z));
        /*
         * DoubleSide, because an open-ended cone is a hole from the inside: back faces are not
         * drawn, so a camera in here sees straight through the building and renders black. The
         * clamp in WarehouseRig stops the lens getting in at all; this makes the geometry safe
         * on its own terms as well, on a fault whose symptom is the entire screen going out.
         */
        /*
         * 0.62 rather than 0.86. At 0.86 the thirty shades were the "large dark panels" in
         * the report - from below at a shallow angle an open cone reads as a solid disc
         * nearly two metres wide, and five of them in a row eclipsed whole signs. 0.62
         * keeps the bright-thing-inside-dark-thing read and takes half the silhouette area
         * off it.
         */
        const shade = mesh(
          'CeilingFixtureShade',
          new THREE.CylinderGeometry(0.18, 0.62, 0.4, 12, 1, true),
          SHADE,
          new THREE.Vector3(x, 9.35, z)
        );
        const lens = mesh('CeilingFixtureLens', new THREE.CylinderGeometry(0.56, 0.56, 0.05, 12), fixtureLens, new THREE.Vector3(x, 9.16, z));
        this.root.add(stem, shade, lens);
        this.ceilingFixtureColumns.add(x);
        /*
         * Nine lamps, not fifteen.
         *
         * The checkerboard put a light under every other fixture on a six-by-five grid. At the
         * old decay of 1.65 that was defensible - each pool was small and they barely met - but
         * at 1.2 over 26 metres they overlap three deep, so most of the fifteen were paying
         * full shader cost to brighten ground another lamp had already covered.
         *
         * Every other row AND column is nine, still 8-10m apart, with the intensity below
         * making up the difference. The room looks the same and every lit material in it
         * compiles a shorter shader - which matters in a scene that also runs ten clerestory
         * lights, six door lights, four zone lights and two shadow-casting directionals.
         */
        if (xIndex % 2 === 0 && zIndex % 2 === 0) {
          /**
           * High bay lamps, and they are WARM.
           *
           * They were #c4ddd1 - the same pale cyan as the hemisphere and the moon. Three
           * light sources of one colour is one light source: nothing in the room could be
           * warm, nothing could be cold, and there was no separation left for anything to
           * read against.
           *
           * Sodium and metal halide are warm, which is both true of a real warehouse at night
           * and the thing this set needs most: warm pools on a neutral floor, cold moonlight
           * through the roof, and the amber floor markings and cardboard finally sitting in
           * light that agrees with them. It is the same split the game already runs on -
           * amber for what is lit and working, cyan for what the machine is looking through.
           */
          const workLight = ENGINE.PointLightNode.create({
            name: 'WarehouseWorkLight',
            color: '#ffbe78',
            /*
             * ## Decay, not intensity, is the lever
             *
             * Measured after the first pass: 55% of the frame was under luma 25 and the floor
             * came out at median 23 - the pools were not reaching the ground the lamps hang
             * over. At decay 1.65 the falloff from 9.45m up is a factor of about 41, so an
             * intensity of 27 arrives as 0.66 at the floor. Turning the number up fixes the
             * floor and blows out the ceiling, because the same curve is steepest where the
             * lamp is.
             *
             * 1.2 flattens the curve: the same lamp arrives at about 2.6 on the floor - four
             * times brighter - while barely changing at head height. That is also what a high
             * bay with a reflector physically does, which is why it looks right rather than
             * merely brighter: the fitting exists to stop the light behaving like a bare bulb.
             */
            /*
             * 78, down from 95.
             *
             * Measured against the other rooms rather than in isolation, which is the only
             * way "balanced" means anything: the warehouse was clipping 3.11% of frame at a
             * 90th percentile of 230 while the workstation clipped 1.04% at 181. A shed lit
             * brighter than a bedsit is correct; a shed throwing away three percent of its
             * highlights is just over-exposed, and the drone - the one object always on
             * screen - was the worst of it.
             */
            /*
             * ## A reach that ends
             *
             * 300/11.5/1.8, from 78/30/1.25. The note above is right that decay is the lever
             * and wrong about which end of the curve matters here. At distance 30 a lamp
             * hung 9m up is still throwing light 30m away while its neighbours sit 8-10m
             * off, so every point on the floor is inside three or four of them at once and
             * NO point on the floor is outside any of them. That is a wash by construction:
             * there is nowhere for a pool to have an edge, whatever the decay does in
             * between. A critic put it as "no boundary where one light's reach ends", which
             * is the same sentence from the other side.
             *
             * three.js windows a punctual light to zero at `distance`, so the cutoff is the
             * edge. 11.5 against a 9.02m drop puts the lamp at full value on the floor
             * directly below, half of it 4m out, and nothing at all by 7m - measured off
             * the renderer's own attenuation, not estimated. Lamps 8-10m apart then leave
             * real dark between them.
             *
             * The intensity is not a taste number: it is 54 x 8.5, where 8.5 is exactly the
             * attenuation this curve loses at the floor relative to the old one. The working
             * plane comes out at 3.40 against 3.41 before, so this buys the pools without
             * taking a level off the ground the player actually reads.
             */
            /*
             * Reach 10.0, from 11.5, and the intensity holds at 300 rather than climbing to
             * match. 11.5 gave a floor pool 7.1m across on lamps spaced 10m apart, so the
             * pools still met - a reach that ends is not the same as a reach that ends SOON
             * ENOUGH, and only the arithmetic tells them apart. 10.0 lands the edge at 4.3m,
             * comfortably inside half the spacing.
             *
             * These are the RACK lamps. They stop being the key in this pass and become the
             * secondary wash over the shelving: the lit lanes are what the player moves
             * through and the aisle bays own those, at roughly three times what these put on
             * the floor. Two full-strength grids interleaved is how nineteen lamps over a
             * 40x48m building produced one continuous sheet - each grid was filling the
             * other's gaps.
             *
             * Then the intensity had to climb after all, 300 -> 900, and the sentence above
             * saying it did not is the mistake this fixes. Narrowing the cutoff does not just
             * move the edge inward, it throws away most of the light at the FLOOR as well:
             * at reach 11.5 these put 3.38 on the ground directly beneath them and at 10.0
             * they put 0.65, which is the same as the hemisphere fill. A lamp that lands fill
             * values on the floor is not lighting it. A critic looking at the result said the
             * high bays "read as bright objects rather than as sources", which is exactly
             * what a visible fitting with no pool under it is.
             *
             * That is the whole trap of this lever: reach and floor value are the same
             * number, so tightening one silently spends the other, and the frame looks
             * plausible either way - a dim uniform floor and a dark uniform floor are both
             * uniform. 900 restores the centre to about 2.5x fill while the edge stays where
             * the last pass put it.
             */
            intensity: 900,
            distance: 10,
            decay: 1.8,
            /*
             * ## Out of the shade, and below the lens
             *
             * A level validator found all twelve of this building's embedded lights sitting
             * INSIDE their own CeilingFixtureShade, and this is the fix. Two faults, one
             * position.
             *
             * A point light touching a surface is a hot spot with no upper bound worth
             * trusting: three.js clamps the distance falloff at 100x, so an intensity-54 lamp
             * a centimetre off the inside of its own cone puts something like 430 on that
             * face. Thirty-one of those, next to a lens that is emissive at 4.7 with
             * toneMapped off, is the brightest cluster in the room by a wide margin - and a
             * small, very hot region is exactly what overflows a half-float bloom mip into Inf
             * and then NaN. That is the signature the black square had, and it is why the
             * square only appeared when the camera swept the ceiling.
             *
             * The second fault is plainer and was always visible: the lens is a solid disc at
             * 9.16 and mesh() casts shadows by default, so a lamp at 9.45 was sitting ABOVE
             * its own lens and shadowing the floor it was supposed to light. Every high bay in
             * the building was blocking itself.
             *
             * 9.02 puts the emitter below the lens, where a lamp's emitter actually is, clear
             * of the shade and still 67cm above the drone's ceiling.
             */
            position: new THREE.Vector3(x, 9.02, z),
          });
          this.workLights.push(workLight);
          this.root.add(workLight);
        }
      }
    }
    this.frontLight = ENGINE.PointLightNode.create({ name: 'FrontSodium', color: '#e0a24c', intensity: 20, distance: 14, decay: 1.55, position: new THREE.Vector3(0, 5.2, 27) });
    this.root.add(this.frontLight);

    for (const [index, id] of WAREHOUSE_SECURITY_ZONE_IDS.entries()) {
      const zone = WAREHOUSE_SECURITY_ZONES[id];
      const material = new THREE.MeshStandardMaterial({
        color: '#5b1714',
        emissive: '#ff2e24',
        emissiveIntensity: 0,
        roughness: 0.34,
        metalness: 0.18,
      });
      this.emergencyMaterials.push(material);
      const centerX = (zone.bounds.minX + zone.bounds.maxX) / 2;
      const centerZ = (zone.bounds.minZ + zone.bounds.maxZ) / 2;
      for (const offset of [-5.4, 0, 5.4]) {
        const alongX = id === 'receiving';
        const batten = mesh(
          `EmergencyBatten-${zone.label}`,
          new THREE.BoxGeometry(alongX ? 3.1 : 0.38, 0.08, alongX ? 0.38 : 3.1),
          material,
          new THREE.Vector3(alongX ? centerX + offset : centerX, 9.68, alongX ? centerZ : centerZ + offset)
        );
        this.root.add(batten);
      }
      const emergencyLight = ENGINE.PointLightNode.create({
        name: `EmergencyZoneLight-${zone.label}`,
        color: index % 2 ? '#ff352c' : '#e93228',
        intensity: 0,
        distance: 18,
        decay: 1.7,
        position: new THREE.Vector3(centerX, 7.4, centerZ),
      });
      this.emergencyLights.push(emergencyLight);
      this.root.add(emergencyLight);
    }
  }

  /**
   * The floor, which was the largest surface in frame and the emptiest.
   *
   * It was a flat plane with five short stripes near the front door - about two square metres
   * of intent across a 48x58 room. Everything the eye uses to judge the scale of an interior
   * lives on its floor: where traffic goes, where you may not stand, how long the place has
   * been working. None of that was there, so the aisles read as corridors of cardboard with
   * nothing underneath them.
   *
   * ## Painted geometry rather than a floor texture
   *
   * A canvas map is the usual answer and it is the wrong one here. The retro pass quantises
   * the whole picture to a coarse pixel grid, so fine texture detail is destroyed before the
   * player sees it, and a map stretched over 48 metres would be a handful of pixels per metre
   * anyway. Flat quads survive the grid because they are the same shapes the grid is made of -
   * which is also how the drains and the front safety lane in this file were already built.
   *
   * Merged per material, one draw call each, for the same reason the racks are.
   *
   * ## The wear runs cool
   *
   * Polished concrete under traffic is a mirror for whatever is above it, and what is above it
   * here is now the cold clerestory - see CLERESTORY_NIGHT. Making the traffic strips lean
   * cool is both what a worn floor does and a second place for the room's cold half to land,
   * which is what stops the two temperatures reading as a trick done once at the windows.
   */
  private buildFloorWear(): void {
    const rack = WAREHOUSE_LAYOUT.rack;
    const zFrom = rack.centerZ - rack.length / 2 - 1.4;
    const zTo = rack.centerZ + rack.length / 2 + 1.4;
    const runLength = zTo - zFrom;
    const runCentre = (zFrom + zTo) / 2;

    /*
     * Aisle centres, derived from the rack centres rather than written out. The gaps BETWEEN
     * racks are where people walk, plus one outboard run down each wall. Deriving it means a
     * layout change moves the paint with the racking instead of leaving it behind.
     */
    const lanes: number[] = [];
    for (let index = 0; index < rack.centers.length - 1; index++) {
      lanes.push((rack.centers[index]! + rack.centers[index + 1]!) / 2);
    }
    lanes.push(rack.centers[0]! - rack.spacing / 2, rack.centers[rack.centers.length - 1]! + rack.spacing / 2);

    const wear: THREE.BufferGeometry[] = [];
    const paint: THREE.BufferGeometry[] = [];
    for (const x of lanes) {
      const track = new THREE.PlaneGeometry(3.1, runLength);
      track.rotateX(-Math.PI / 2);
      track.translate(x, 0.006, runCentre);
      wear.push(track);
      for (const offset of [-1.72, 1.72]) {
        const line = new THREE.PlaneGeometry(0.14, runLength);
        line.rotateX(-Math.PI / 2);
        line.translate(x + offset, 0.011, runCentre);
        paint.push(line);
      }
    }

    // The cross aisle at the front, where the drone launches and the handoffs happen.
    const cross = new THREE.PlaneGeometry(WAREHOUSE_LAYOUT.shell.width - 4, 3.4);
    cross.rotateX(-Math.PI / 2);
    cross.translate(0, 0.006, 18.6);
    wear.push(cross);
    for (const z of [16.9, 20.3]) {
      const line = new THREE.PlaneGeometry(WAREHOUSE_LAYOUT.shell.width - 4, 0.14);
      line.rotateX(-Math.PI / 2);
      line.translate(0, 0.011, z);
      paint.push(line);
    }

    /*
     * Hatching at the personnel hold bay. Cargo dispositions moved to the three secure
     * transfer docks, so their former quarantine and return footprints must not survive as
     * misleading floor graphics.
     */
    for (const station of [WAREHOUSE_LAYOUT.stations.hold]) {
      for (let bar = -2; bar <= 2; bar++) {
        const hatch = new THREE.PlaneGeometry(0.16, 2.6);
        hatch.rotateX(-Math.PI / 2);
        hatch.rotateY(Math.PI / 4);
        hatch.translate(station.x + bar * 0.62, 0.01, station.z);
        paint.push(hatch);
      }
    }

    const wearMerged = mergeGeometries(wear, false);
    if (wearMerged) {
      this.root.add(
        mesh(
          'FloorWear',
          wearMerged,
          new THREE.MeshStandardMaterial({ color: '#43464a', roughness: 0.62, metalness: 0.12 })
        )
      );
    }
    const paintMerged = mergeGeometries(paint, false);
    if (paintMerged) {
      this.root.add(
        mesh(
          'FloorPaint',
          paintMerged,
          new THREE.MeshStandardMaterial({ color: '#8a6a2d', roughness: 0.82, metalness: 0.05 })
        )
      );
    }

    // The original front-door stripes, kept: they mark the cradle apron specifically.
    for (const x of [-21.5, -7, 0, 7, 21.5]) {
      const stripe = mesh('SafetyLane', new THREE.PlaneGeometry(4.2, 0.18), new THREE.MeshBasicMaterial({ color: '#8a6a2d' }), new THREE.Vector3(x, 0.012, 22.2));
      stripe.rotation.x = -Math.PI / 2;
      this.root.add(stripe);
    }
  }

  private buildDressing(): void {
    // A readable functional silhouette: cradle at the front, surveillance in all corners,
    // and safety hardware around the loading routes.
    const cradle = ENGINE.SceneNode.create({ name: 'DroneCradle', position: WAREHOUSE_LAYOUT.cradle.clone() });
    cradle.add(
      mesh('CradleBase', new THREE.CylinderGeometry(0.75, 0.9, 0.24, 12), DARK_STEEL, new THREE.Vector3(0, 0.12, 0)),
      mesh('CradleRing', new THREE.TorusGeometry(0.58, 0.07, 8, 18), AMBER, new THREE.Vector3(0, 0.34, 0))
    );
    cradle.getObjectByName('CradleRing')?.rotateX(Math.PI / 2);
    this.root.add(cradle);

    for (const [index, [x, z, turn]] of [
      [-22.4, 27.2, Math.PI * 0.76],
      [22.4, 27.2, -Math.PI * 0.76],
      [-22.4, -27.2, Math.PI * 0.24],
      [22.4, -27.2, -Math.PI * 0.24],
    ].entries()) {
      const camera = ENGINE.SceneNode.create({ name: `CCTV-${index + 1}`, position: new THREE.Vector3(x, 9.1, z), rotation: new THREE.Euler(0, turn, 0) });
      camera.add(
        mesh('CCTVArm', new THREE.BoxGeometry(0.12, 0.12, 0.58), STEEL, new THREE.Vector3(0, 0, 0.22)),
        mesh('CCTVBody', new THREE.BoxGeometry(0.42, 0.28, 0.62), WALL, new THREE.Vector3(0, -0.08, 0.6)),
        mesh('CCTVLens', new THREE.CylinderGeometry(0.11, 0.11, 0.05, 14), new THREE.MeshBasicMaterial({ color: '#8dc7b3' }), new THREE.Vector3(0, -0.08, 0.93))
      );
      camera.getObjectByName('CCTVLens')?.rotateX(Math.PI / 2);
      this.root.add(camera);
    }

    for (const x of [-22, -19.8, 19.8, 22]) {
      this.root.add(mesh('SafetyBollard', new THREE.CylinderGeometry(0.14, 0.14, 1.2, 10), AMBER, new THREE.Vector3(x, 0.6, 22.1)));
    }
    for (const x of [-18, -10, -2, 6, 14, 21]) {
      const drain = mesh('FloorDrain', new THREE.PlaneGeometry(1.8, 0.22), DARK_STEEL, new THREE.Vector3(x, 0.008, 17.1));
      drain.rotation.x = -Math.PI / 2;
      this.root.add(drain);
    }
    const compactor = ENGINE.SceneNode.create({ name: 'CertifiedWasteCompactor', position: new THREE.Vector3(-22, 0, 8.2) });
    compactor.add(
      mesh('CompactorBody', new THREE.BoxGeometry(3.2, 2.8, 2.4), WALL, new THREE.Vector3(0, 1.4, 0)),
      mesh('CompactorMouth', new THREE.BoxGeometry(2.4, 1.2, 0.12), DARK_STEEL, new THREE.Vector3(0, 1.65, 1.22)),
      mesh('CompactorBeacon', new THREE.CylinderGeometry(0.12, 0.12, 0.18, 10), RED, new THREE.Vector3(1.2, 2.9, 0))
    );
    this.root.add(compactor);

    /*
     * Authored cover for the inbound fugitive. Each silhouette hides the torso from one
     * approach while leaving helmet, shoes or reflected vest readable from another; a search
     * target must be concealed without becoming a pixel hunt. The same props also break the
     * long, generated-looking rack corridors during ordinary play.
     */
    const coverSteel = new THREE.MeshStandardMaterial({ color: '#263532', roughness: 0.73, metalness: 0.42 });
    const coverAmber = new THREE.MeshStandardMaterial({ color: '#a8732f', roughness: 0.78, metalness: 0.12 });
    const palletCover = ENGINE.SceneNode.create({ name: 'FugitiveCover-Receiving', position: new THREE.Vector3(-5.4, 0, -21.2) });
    palletCover.add(
      // Two pallets side by side, which is what a load that wide actually stands on.
      mesh(
        'PalletCoverBase',
        mergeGeometries([...palletGeometries(-0.56, 0.14, 0, { depth: 1.24 }), ...palletGeometries(0.56, 0.14, 0, { depth: 1.24 })], false)
          ?? new THREE.BoxGeometry(2.2, 0.16, 1.35),
        PALLET
      ),
      mesh('PalletCoverLoadA', new THREE.BoxGeometry(0.92, 1.2, 1.05), coverAmber, new THREE.Vector3(-0.5, 0.72, 0)),
      mesh('PalletCoverLoadB', new THREE.BoxGeometry(0.92, 0.82, 1.05), coverAmber, new THREE.Vector3(0.52, 0.53, 0))
    );
    const maintenance = ENGINE.SceneNode.create({ name: 'FugitiveCover-StorageWest', position: new THREE.Vector3(-20.1, 0, -7.2) });
    maintenance.add(
      mesh('MaintenanceCabinet', new THREE.BoxGeometry(1.45, 2.05, 0.72), coverSteel, new THREE.Vector3(0, 1.03, 0)),
      mesh('MaintenanceDoorSeam', new THREE.BoxGeometry(0.025, 1.72, 0.05), DARK_STEEL, new THREE.Vector3(0, 1.05, 0.385)),
      mesh('MaintenanceHandle', new THREE.BoxGeometry(0.08, 0.28, 0.08), AMBER, new THREE.Vector3(0.46, 1.08, 0.42))
    );
    /*
     * West of lane one, not inside it.
     *
     * At x 18.2 the pump tank's 0.68 radius reached 18.88 and the near sortation belt occupies
     * 16.39 to 18.11 for its whole run - so half a metre of pump was inside a conveyor. Found
     * by `scripts/warehouse-audit.ts` rather than by anyone looking at it.
     *
     * 15.4 puts it clear of the belt by 0.31 and clear of the catwalk leg at 16.05, on the
     * open strip between the sortation hall and the storage boundary.
     */
    const sortCover = ENGINE.SceneNode.create({ name: 'FugitiveCover-Sortation', position: new THREE.Vector3(15.4, 0, -7.6) });
    sortCover.add(
      mesh('SortPumpTank', new THREE.CylinderGeometry(0.62, 0.68, 1.45, 12), coverSteel, new THREE.Vector3(0, 0.74, 0)),
      mesh('SortPumpGuard', new THREE.TorusGeometry(0.76, 0.055, 8, 18), AMBER, new THREE.Vector3(0, 0.9, 0)),
      mesh('SortPumpPipe', new THREE.CylinderGeometry(0.11, 0.11, 1.55, 10), coverSteel, new THREE.Vector3(0.54, 1.36, 0))
    );
    sortCover.getObjectByName('SortPumpGuard')?.rotateX(Math.PI / 2);
    this.root.add(palletCover, maintenance, sortCover);
  }

  public aisleX(aisle: number): number {
    return warehouseAisleX(aisle);
  }

  /**
   * Where an addressed package sits: on the shelf, in its own bay, label out to the aisle.
   *
   * `warehousePackagePosition` gives the address as a point on the floor - the right aisle and
   * the right distance along it - and this lifts it onto the rack. The slot it lands in is
   * kept empty by RESERVED_PICK_SLOTS, so the carton stands alone in a bare bay rather than
   * inside somebody else's pallet, which is both how a picked order actually looks and the
   * only way the player can see it from the aisle.
   *
   * Y is the deck top rather than a load height: `WarehouseCargoNode` builds its carton
   * upward from the node origin, so the node sits ON the shelf and the box rests on it. X
   * stays at the rack centre line - a carton pushed to the front lip would overhang a shelf
   * whose stock is set 10cm off centre, and reads as falling off.
   */
  public packagePosition(aisle: number, bay: number): THREE.Vector3 {
    const floor = warehousePackagePosition(aisle, bay);
    const level = PICK_LEVEL;
    return new THREE.Vector3(
      warehouseAisleX(aisle),
      RACK_SHELF_Y[level] + 0.055,
      floor.z
    );
  }

  /**
   * Drone-volume collision, expanded beyond the camera lens. The old point test let the
   * hull enter a rack at its front edge, which exposed black backfaces when the lens turned.
   */
  public constrainDrone(position: THREE.Vector3, previous: THREE.Vector3): boolean {
    const drone = WAREHOUSE_LAYOUT.drone;
    if (position.x < drone.minX || position.x > drone.maxX || position.z < drone.minZ || position.z > drone.maxZ || position.y > drone.maxY) {
      position.copy(previous);
      return true;
    }
    /*
     * The racks are 6.1m tall and the drone's ceiling is 8.35 - there are two clear metres
     * of air above every rack, and this test used to ignore Y entirely, so the collision
     * wall ran floor to roof and the building was five corridors. Reported directly as
     * "the drone can't fly over the racks", and flying over them is half the point of
     * being a drone.
     *
     * 6.55 is the rack top plus enough for the hull, so skimming the cartons stays an
     * honest collision while clearing them becomes flight.
     */
    if (position.y < 6.55) {
      for (const [aisleIndex, rackX] of WAREHOUSE_LAYOUT.rack.centers.entries()) {
        if (position.z < WAREHOUSE_LAYOUT.rack.minCollisionZ || position.z > WAREHOUSE_LAYOUT.rack.maxCollisionZ) continue;
        if (Math.abs(position.x - rackX) >= WAREHOUSE_LAYOUT.rack.halfCollisionX) continue;
        /*
         * `emptyBays` is keyed with the player-facing aisle numbers 1-5. Array.entries()
         * yields 0-4; passing that index directly meant every visible opening queried the
         * neighbouring rack's occupancy (and aisle 1 queried the nonexistent aisle 0).
         * Keep the conversion at the call site so canPassThroughRack has one numbering
         * contract: the same aisle number used by signs, packages, and the rack loader.
         */
        const aisle = aisleIndex + 1;
        if (this.canPassThroughRack(aisle, position)) continue;
        position.copy(previous);
        return true;
      }
    }
    // The mezzanine deck and the office on it. See MEZZANINE_BOUNDS.
    if (
      position.y > MEZZANINE_BOUNDS.minY &&
      position.y < MEZZANINE_BOUNDS.maxY &&
      position.x > MEZZANINE_BOUNDS.minX &&
      position.x < MEZZANINE_BOUNDS.maxX &&
      position.z > MEZZANINE_BOUNDS.minZ &&
      position.z < MEZZANINE_BOUNDS.maxZ
    ) {
      position.copy(previous);
      return true;
    }
    if (
      position.y < 2.25 &&
      position.x > WAREHOUSE_LAYOUT.sortation.minX - 0.7 &&
      position.x < WAREHOUSE_LAYOUT.sortation.maxX + 0.25 &&
      position.z > WAREHOUSE_LAYOUT.sortation.minZ &&
      position.z < WAREHOUSE_LAYOUT.sortation.maxZ
    ) {
      position.copy(previous);
      return true;
    }
    /*
     * All three station rectangles are 35cm floor pads. The previous quarantine test was a
     * 3.1m-wide, 2.15m-tall invisible cylinder over the centre of its pad, so it still acted
     * like a solid crate after return and hold were fixed. Cargo routing is distance-based;
     * the pad itself needs no blocker.
     *
     * Only the geometry that rises into the flight volume collides now: the two 2.8m posts,
     * and the horizontal gate after quarantine seals. These dimensions include the drone's
     * rotor envelope, so the machine cannot shave through steel while the open middle remains
     * a clear aerial route.
     */
    for (const id of this.lockedSecurityZones) {
      for (const gate of this.securityGates.get(id) ?? []) {
        gate.node.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(gate.node).expandByScalar(0.7);
        if (!bounds.containsPoint(position)) continue;
        position.copy(previous);
        return true;
      }
    }
    return false;
  }

  /**
   * Is the drone lined up with an EMPTY bay, and flying at a height that clears its shelves?
   *
   * The racking used to be a solid wall below 6.55m, so the building was five corridors and the
   * only way between aisles was over the top. But the loader has always left about one slot in
   * six empty - that is where the variety in the racking comes from - and those holes are real
   * gaps in a real structure. Flying through one is the manoeuvre a drone in a warehouse
   * obviously has, and the racking was the only thing saying otherwise.
   *
   * Three conditions, all of which have to hold:
   *
   *  - the drone is inside ONE bay along z, not straddling the rib between two;
   *  - that bay's slot at this level was left empty by the loader;
   *  - the drone is clear of the shelf below and the shelf above by RACK_GAP_MARGIN.
   *
   * The last one is what stops this being a cheat. Shelves are 1.35m apart, so with margin
   * there is about 65cm of usable window per level - enough to fly through deliberately, not
   * enough to blunder through. Miss the window and the rack is still solid.
   */
  private canPassThroughRack(aisle: number, position: THREE.Vector3): boolean {
    let bay = -1;
    for (const [index, z] of RACK_BAY_Z.entries()) {
      if (Math.abs(position.z - z) <= RACK_BAY_HALF_Z) { bay = index; break; }
    }
    if (bay < 0) return false;

    for (const [level] of RACK_LEVEL_Y.entries()) {
      if (!this.emptyBays.has(`${aisle}:${bay}:${level}`)) continue;
      const below = RACK_SHELF_Y[level]!;
      const above = RACK_SHELF_Y[level + 1];
      if (above === undefined) continue;
      if (position.y > below + RACK_GAP_MARGIN && position.y < above - RACK_GAP_MARGIN) return true;
    }
    return false;
  }

  public setRearDoorOpen(amount: number): void {
    this.rearDoorTarget = Math.max(0, Math.min(1, amount));
  }

  public setConveyorsRunning(running: boolean): void {
    this.conveyorRunning = running;
  }

  /**
   * Light the intake, or let it go dark. See the beacon's own note for why it is not a sign.
   *
   * The fade lives in `tick` rather than here so a switch flicked twice in one frame - which
   * happens when a load is swapped - cannot leave the opacity halfway up with nothing driving
   * it back.
   */
  public setVerifiedIntakeGuide(active: boolean): void {
    this.verifiedIntakeGuideOn = active;
  }

  public setVerifiedIntakeState(state: 'idle' | 'ready' | 'processing' | 'evidence'): void {
    if (this.verifiedIntakeStatus) {
      const colour = state === 'evidence' ? '#a34136' : state === 'processing' ? '#d99a35' : '#365c4a';
      const emissive = state === 'evidence' ? '#7f1710' : state === 'processing' ? '#a95f13' : '#1c5f3a';
      this.verifiedIntakeStatus.color.set(colour);
      this.verifiedIntakeStatus.emissive.set(emissive);
      this.verifiedIntakeStatus.emissiveIntensity = state === 'idle' ? 0.7 : 1.8;
    }
    if (this.verifiedIntakeScanner) {
      this.verifiedIntakeScanner.visible = state !== 'idle';
    }
  }

  public setServiceDoorStatus(id: WarehouseDoorId, status: WarehouseDoorStatus): void {
    this.serviceDoors.get(id)?.setStatus(status);
  }

  public cycleServiceDoor(id: WarehouseDoorId): void {
    this.serviceDoors.get(id)?.cycleCargo();
  }

  public lockdownServiceDoor(id: WarehouseDoorId): void {
    this.serviceDoors.get(id)?.lockdown();
  }

  public resetServiceDoors(): void {
    for (const door of this.serviceDoors.values()) door.reset();
  }

  public setPursuitLights(id: WarehouseDoorId, active: boolean): void {
    for (const [doorId, door] of this.serviceDoors) door.setPursuitLights(active && doorId === id);
  }

  public setLightingMode(mode: WarehouseLightingMode): void {
    this.lightingMode = mode;
    if (getAccessibilityPreferences().reducedMotion) {
      this.emergencyLevel = mode === 'normal' || mode === 'recovery' ? 0 : 1;
    }
  }

  public setCelStyleEnabled(enabled: boolean): void {
    this.celStyleEnabled = enabled;
    this.daylight.setCelStyleEnabled(enabled);
  }

  public getLightingMode(): WarehouseLightingMode {
    return this.lightingMode;
  }

  public setSecurityZoneLocked(id: WarehouseSecurityZoneId, locked: boolean): void {
    if (locked) this.lockedSecurityZones.add(id);
    else this.lockedSecurityZones.delete(id);
  }

  public resetSecurityZones(): void {
    this.lockedSecurityZones.clear();
  }

  public nearestDoorDock(position: THREE.Vector3): { id: WarehouseDoorId; distance: number } {
    let nearest: { id: WarehouseDoorId; distance: number } = {
      id: WAREHOUSE_DOOR_IDS[0],
      distance: Number.POSITIVE_INFINITY,
    };
    for (const id of WAREHOUSE_DOOR_IDS) {
      const distance = position.distanceTo(this.doorDockPositions[id]);
      if (distance < nearest.distance) nearest = { id, distance };
    }
    return nearest;
  }

  public setDuplicateAisle(active: boolean): void {
    if (!this.duplicateAisleSigns) return;
    for (const [index, sign] of this.duplicateAisleSigns.entries()) {
      sign.material = labelMaterial(active ? '5' : '4', active ? '#e49a84' : '#d8ffb0');
      sign.setName(`${active ? 'AisleSign-5-Duplicate' : 'AisleSign-4'}-${index === 0 ? 'Front' : 'Back'}`);
    }
  }

  public spawnInboundFreight(): void {
    if (this.inboundPackages.length) return;
    for (let i = 0; i < 8; i++) {
      const carton = mesh(
        `InboundFreight-${i + 1}`,
        new THREE.BoxGeometry(0.9 + (i % 3) * 0.12, 0.66 + (i % 2) * 0.12, 0.8),
        new THREE.MeshStandardMaterial({ color: i % 2 ? '#705e41' : '#5d503b', roughness: 0.94 }),
        new THREE.Vector3(
          -3.2 + (i % 4) * 2.1,
          0.4 + Math.floor(i / 4) * 0.78,
          WAREHOUSE_LAYOUT.receiving.freightSpawnZ - Math.floor(i / 4) * 0.35
        )
      );
      this.inboundPackages.push(carton);
      this.root.add(carton);
    }
  }

  public configureTransferDock(id: WarehouseDoorId, capacity: number): void {
    this.transferDocks.get(id)?.reset(capacity);
  }

  public resetTransferDocks(): void {
    for (const dock of this.transferDocks.values()) dock.reset();
  }

  public setTransferDockState(id: WarehouseDoorId, state: WarehouseDoorDockState): void {
    this.transferDocks.get(id)?.setState(state);
  }

  public transferDockCapacity(id: WarehouseDoorId): number {
    return this.transferDocks.get(id)?.getCapacity() ?? 1;
  }

  public transferDockState(id: WarehouseDoorId): WarehouseDoorDockState {
    return this.transferDocks.get(id)?.getState() ?? 'empty';
  }

  public transferDockSlot(id: WarehouseDoorId, slot: number): THREE.Vector3 {
    return this.transferDocks.get(id)?.slotPosition(slot) ?? this.doorDockPositions[id].clone();
  }

  public tick(deltaTime: number): void {
    this.clock += deltaTime;
    if (this.verifiedIntakeGuide) {
      const reduced = getAccessibilityPreferences().reducedMotion;
      this.verifiedIntakeGuideLevel = THREE.MathUtils.damp(
        this.verifiedIntakeGuideLevel,
        this.verifiedIntakeGuideOn ? 1 : 0,
        4.5,
        deltaTime
      );
      const lit = this.verifiedIntakeGuideLevel > 0.01;
      this.verifiedIntakeGuide.visible = lit;
      if (lit) {
        // A slow breath rather than a strobe: it is a destination, not an alarm.
        const pulse = reduced ? 0.86 : 0.72 + Math.sin(this.clock * 2.2) * 0.22;
        const beam = this.verifiedIntakeGuide.children[0] as ENGINE.MeshNode;
        const material = beam.material as THREE.MeshBasicMaterial;
        material.opacity = this.verifiedIntakeGuideLevel * pulse;
      }
    }
    if (this.verifiedIntakeScanner?.visible) {
      this.verifiedIntakeScanner.position.z = 0.1 + Math.sin(this.clock * 3.1) * 0.72;
      const material = this.verifiedIntakeScanner.material as THREE.MeshStandardMaterial;
      material.opacity = 0.58 + Math.sin(this.clock * 6.2) * 0.18;
    }
    const targetEmergency = this.lightingMode === 'normal' || this.lightingMode === 'recovery' ? 0 : 1;
    this.emergencyLevel = THREE.MathUtils.damp(this.emergencyLevel, targetEmergency, 2.8, deltaTime);
    const emergency = this.emergencyLevel;
    const contained = this.lightingMode === 'contained';
    const reducedMotion = getAccessibilityPreferences().reducedMotion;
    const basePulse = contained || reducedMotion ? 1 : 0.64 + Math.sin(this.clock * 4.1) * 0.22;
    // Rebased on the new rig. The ratios are what the emergency mode is about, not the
    // absolute numbers, so both ends move together.
    /*
     * 4.4, up from 1.28, and this is the main lever on "everything is visible".
     *
     * The reference look is high key: nothing in it is dark, the shadow side of an object is
     * a lighter step of its own colour rather than an absence, and the darkest thing in the
     * frame is the ink line. A hemisphere fill is exactly that shape of light - it has no
     * direction to fall off from, so it lifts the side of every object that the work lights
     * never reach without flattening the pools they make underneath them.
     *
     * It also has to be this rather than exposure. Turning the tone mapper up scales the
     * lit and the unlit together and the picture stays as contrasty as it was, only paler.
     * Lifting the fill compresses the range from the bottom, which is what actually makes a
     * cel look readable: the four value steps land across the objects instead of spending
     * two of them inside a shadow.
     */
    /*
     * 2.5, back down from 4.4.
     *
     * 4.4 answered "everything must be visible" and overshot into "everything is the same".
     * Measured on an aisle capture: half the frame sat inside a 70-level band and the
     * ceiling came out DARKER than the floor, which is backwards for a building lit from
     * its roof. A hemisphere has no direction, so past a certain strength it stops being
     * fill and starts being a flat coat of paint over the modelling the work lights are
     * doing.
     *
     * The shaping now comes from the high bays, which have gone up to compensate; this
     * keeps its original job of putting a coloured floor under the shadows so nothing goes
     * black. Fill sets the BOTTOM of the range, key sets the top - raising the fill to reach
     * the top is what flattens a picture.
     */
    /*
     * ## The branch that ships is the cel one
     *
     * `warehouseCelEnabled` defaults to TRUE in OmniscientRig, so every number on the left of
     * these ternaries is the game and every number on the right is dead unless somebody
     * presses F10. That is worth stating plainly because it wasted a whole round of work:
     * WAREHOUSE_SKY_FILL was moved 1.8 -> 0.6 to fix exactly the flatness this item is about,
     * the change was correct, it was committed, it was in the bundle - and the frame did not
     * move by one level, because the live path reads 2.2 from here instead.
     *
     * 2.2 of hemisphere is the flat light. An ambient has no direction by definition, so it
     * sets a floor under every surface in the room at once; at 2.2 that floor is up near what
     * the lamps deliver, and no lamp can then carve a pool out of anything. The frame measured
     * 2.2% of pixels below luma 20 against a night-warehouse reference at 5.0%, with a median
     * 44 levels high - a room with no dark in it at all.
     *
     * 0.85 is above the non-cel 0.6 on purpose: cel shading wants a readable floor in shadow
     * rather than black, which is presumably what the 2.2 was reaching for. It is the reach
     * that was wrong, not the intent - fill sets the BOTTOM of the range, and this one had
     * been pushed until it set the top.
     */
    /*
     * 0.55, from 0.85. The gain above was hiding what this was doing: with a flat 1.95
     * multiply on top, no fill value could produce a dark pixel, so 0.85 measured the same as
     * 2.2 and there was no way to tell from a capture which of them was wrong. With the gain
     * corrected the fill is finally the thing it is named after - the floor of the range -
     * and the frame still carried only 2.6% of pixels below luma 20 against the reference's
     * 5.0%. This is what buys the last of that.
     *
     * Then 0.55 -> 0.78. With the pools finally ending where they should, the frame overshot
     * the other way: p95 134 and spread 116 landed almost exactly on the reference's 127 and
     * 107 - the SHAPE of the range was right - while the median sat at 59 against 78 and a
     * quarter of the frame was below luma 40 against the reference's sixth. Too much of the
     * room was in the dark rather than the dark being in the right places. Fill is the
     * correct lever for that and the only one: it lifts the bottom of the range without
     * touching the top, so the pools keep the edges this pass just bought them.
     */
    const skyFill = this.celStyleEnabled ? 0.78 : WAREHOUSE_SKY_FILL;
    const moon = this.celStyleEnabled ? 1.7 : 1.7;
    /*
     * The front sodium was the single biggest flattener in the room and nothing here said
     * so. One lamp at intensity 35 with a 20m reach, standing at z 27, covers the whole
     * front half on its own - so the dock never went dark no matter what the high bays did.
     * 20 over 14m keeps it a door light instead of a room light.
     */
    const front = this.celStyleEnabled ? 16 : 20;
    const fixture = this.celStyleEnabled ? 0.92 : 1.15;
    // Scaled with the work lights' new falloff - see the note at their construction. These
    // numbers are the old ones times 8.5, so the floor value is unchanged and only the
    // SHAPE of the light differs.
    const work = this.celStyleEnabled ? 900 : 1160;
    if (this.ambientLight) this.ambientLight.intensity = THREE.MathUtils.lerp(skyFill, 0.5, emergency);
    if (this.moonLight) this.moonLight.intensity = THREE.MathUtils.lerp(moon, 1.05, emergency);
    if (this.frontLight) this.frontLight.intensity = THREE.MathUtils.lerp(front, 4, emergency);
    if (this.fixtureLensMaterial) this.fixtureLensMaterial.emissiveIntensity = THREE.MathUtils.lerp(fixture, 0.1, emergency);
    for (const light of this.workLights) light.intensity = THREE.MathUtils.lerp(work, 78, emergency);
    for (const [index, material] of this.emergencyMaterials.entries()) {
      const sequence = contained || reducedMotion ? 1 : 0.72 + Math.sin(this.clock * 2.5 - index * 0.8) * 0.28;
      material.emissiveIntensity = emergency * (1.2 + sequence * 3.8);
    }
    for (const [index, light] of this.emergencyLights.entries()) {
      const sequence = contained || reducedMotion ? 1 : Math.max(0.35, Math.sin(this.clock * 2.5 - index * 0.8) * 0.5 + 0.5);
      light.intensity = emergency * (7 + 12 * basePulse * sequence);
    }
    if (this.lightingMode === 'recovery' && emergency < 0.02) this.lightingMode = 'normal';
    this.setDressing.setEmergencyLevel(emergency, contained);
    this.setDressing.tick(deltaTime);
    this.daylight.tick(deltaTime, emergency, contained, reducedMotion);
    this.automation.tick(deltaTime, this.conveyorRunning, emergency, contained, reducedMotion);
    for (const door of this.serviceDoors.values()) door.tick(deltaTime);
    for (const dock of this.transferDocks.values()) dock.tick(deltaTime);
    if (this.rearDoor) {
      this.rearDoor.position.y = THREE.MathUtils.damp(this.rearDoor.position.y, 3 + this.rearDoorTarget * 6.2, 2.6, deltaTime);
    }
    for (const [id, gates] of this.securityGates) {
      const locked = this.lockedSecurityZones.has(id);
      for (const gate of gates) {
        gate.node.scale.y = THREE.MathUtils.damp(gate.node.scale.y, locked ? 1 : GATE_OPEN_SCALE, 5.2, deltaTime);
      }
    }
    if (this.conveyorRunning) {
      for (const roller of this.conveyorRollers) roller.rotation.x -= deltaTime * 4.5;
    }
    for (const carton of this.inboundPackages) {
      carton.position.z = THREE.MathUtils.damp(carton.position.z, WAREHOUSE_LAYOUT.receiving.freightStageZ, 1.35, deltaTime);
    }
    const rain = this.root.getObjectByName('ExteriorRain') as THREE.Points | undefined;
    const position = rain?.geometry.getAttribute('position');
    if (position) {
      for (let i = 0; i < position.count; i++) {
        const y = position.getY(i) - deltaTime * 8;
        position.setY(i, y < 0 ? 14 : y);
      }
      position.needsUpdate = true;
    }
  }
}
