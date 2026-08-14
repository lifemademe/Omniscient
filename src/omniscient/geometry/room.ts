/**
 * The workstation room - where OMNISCIENT_ lives.
 *
 * §119: the main menu is a physical workstation, and the machine has to sit in a place
 * rather than float. §186: big shapes first, and the room is mostly three of them - desk,
 * wall, floor - with clutter only where it says somebody works here.
 *
 * Everything is expressed as named parts with a material key so the caller applies the
 * shared family (§187) rather than each generator inventing its own look.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { createRng, jitter, range, seedFrom } from '../core/rng.js';

import { createClump, createVine } from './foliage.js';

import type { Rng } from '../core/rng.js';
import type { MAT } from '../art/palette.js';

export interface RoomPart {
  name: string;
  geometry: THREE.BufferGeometry;
  material: keyof typeof MAT;
}

/**
 * The window aperture in the back wall.
 *
 * Camera RIGHT, not left. Left is where the menu module stack lives, and putting the
 * brightest value in the frame directly behind the one group of objects the player has to
 * read was the worst of both - washed-out labels and a window nobody could see.
 *
 * On the right it does more work anyway: the CRT's dark bezel now silhouettes against it,
 * which is the strongest separation available for the hero object, and the key rakes
 * right-to-left across the desk into the darker side rather than flattening it.
 */
const WINDOW = { x: 1.16, width: 1.3, sill: 1.05, head: 2.3 } as const;

/**
 * The window: glazing, frame, mullion and sill.
 *
 * The glazing is deliberately unlit and above the tone-mapped range. A window painted at
 * a believable interior value looks like a grey rectangle; a real one blows out, and that
 * blowout is what sells the light coming through it.
 */
function createWindow(): RoomPart[] {
  const parts: RoomPart[] = [];
  const height = WINDOW.head - WINDOW.sill;
  const midY = (WINDOW.head + WINDOW.sill) / 2;

  // Sky above, sea below. The horizon sits high in the aperture, the way it does when you
  // are looking out and slightly down at water.
  const horizon = 0.62;

  const sky = new THREE.PlaneGeometry(WINDOW.width, height * horizon);
  sky.translate(WINDOW.x, WINDOW.head - (height * horizon) / 2, -2.16);
  parts.push({ name: 'WindowSky', geometry: sky, material: 'daylight' });

  const sea = new THREE.PlaneGeometry(WINDOW.width, height * (1 - horizon));
  sea.translate(WINDOW.x, WINDOW.sill + (height * (1 - horizon)) / 2, -2.16);
  parts.push({ name: 'WindowSea', geometry: sea, material: 'daylightSea' });

  // Frame and a single vertical mullion. Dark against the blowout - the strongest
  // value contrast in the room, which is exactly what a window should be.
  const frame: THREE.BufferGeometry[] = [];
  const bar = 0.055;
  for (const [w, h, y] of [
    [WINDOW.width + bar * 2, bar, WINDOW.sill - bar / 2],
    [WINDOW.width + bar * 2, bar, WINDOW.head + bar / 2],
  ] as const) {
    const piece = new THREE.BoxGeometry(w, h, 0.08);
    piece.translate(WINDOW.x, y, -2.14);
    frame.push(piece);
  }
  for (const sx of [-1, 1]) {
    const jamb = new THREE.BoxGeometry(bar, height, 0.08);
    jamb.translate(WINDOW.x + (sx * (WINDOW.width + bar)) / 2, midY, -2.14);
    frame.push(jamb);
  }
  const mullion = new THREE.BoxGeometry(bar * 0.7, height, 0.07);
  mullion.translate(WINDOW.x, midY, -2.14);
  frame.push(mullion);
  // Two horizontal glazing bars, unevenly spaced - a builder's window, not a grid.
  for (const t of [0.38, 0.72]) {
    const glazingBar = new THREE.BoxGeometry(WINDOW.width, bar * 0.55, 0.06);
    glazingBar.translate(WINDOW.x, WINDOW.sill + height * t, -2.14);
    frame.push(glazingBar);
  }
  parts.push({
    name: 'WindowFrame',
    geometry: mergeGeometries(frame, false) ?? frame[0],
    material: 'dark',
  });

  const sill = new THREE.BoxGeometry(WINDOW.width + 0.24, 0.05, 0.18);
  sill.translate(WINDOW.x, WINDOW.sill - 0.06, -2.02);
  parts.push({ name: 'WindowSill', geometry: sill, material: 'timberLit' });

  return parts;
}

/**
 * Floor level, relative to the desk top at y = 0.
 *
 * This was effectively zero: the floor slab's surface sat one centimetre below the desk
 * top, so the desk was a plank lying on the ground with its legs passing straight through
 * it, the chair stood at desk height, and the whole thing read as a mat rather than as
 * furniture. A desk is about three quarters of a metre off the floor, so that is where
 * the floor now is.
 */
export const FLOOR_Y = -0.76;

/**
 * The pinboard: above the machine, in the gap between the menu stack and the window.
 * Narrow, because that gap is narrow - at full width it ran over the window's left jamb.
 */
const BOARD = { x: -0.34, y: 1.82, width: 1.36, height: 0.88 } as const;

/** Where the plant sits: desk right, under the window, out of the machine's way. */
const PLANT = { x: 1.28, y: 0, z: -0.66 } as const;

/**
 * The desk plant - and the whole theme in one prop.
 *
 * §12 asks for environmental life. The jam theme asks for Overgrown. So this is not a
 * potted shrub minding its business: it has outgrown its pot, thrown a runner over the
 * front edge of the desk, and sent a second one along the wall towards the machine's
 * cable run. The player watches a circuit tree colonise a screen for the whole game; the
 * plant is doing the same thing to the desk, and it started first.
 *
 * It lives under the window because that is where a plant would actually survive, and
 * because the key light raking through it is what makes the blades read as translucent
 * rather than as green cardboard.
 */
function createDeskPlant(rng: Rng): RoomPart[] {
  const parts: RoomPart[] = [];

  // Pot: body, tapered, with a rim lip. The lip costs one cylinder and is the difference
  // between a plant pot and a bucket.
  const potPieces: THREE.BufferGeometry[] = [];
  const body = new THREE.CylinderGeometry(0.072, 0.052, 0.115, 12);
  body.translate(0, 0.057, 0);
  potPieces.push(body);
  const lip = new THREE.CylinderGeometry(0.082, 0.078, 0.022, 12);
  lip.translate(0, 0.116, 0);
  potPieces.push(lip);
  const pot = mergeGeometries(potPieces, false) ?? body;
  pot.rotateY(jitter(rng, 0.3));
  pot.translate(PLANT.x, PLANT.y, PLANT.z);
  parts.push({ name: 'PlantPot', geometry: pot, material: 'timber' });

  // The crown.
  createClump(rng, { count: 18, length: [0.16, 0.34], droop: [0.35, 1.7], spread: 0.035 }).forEach(
    (part, i) => {
      part.geometry.translate(PLANT.x, PLANT.y + 0.12, PLANT.z);
      parts.push({ name: `PlantCrown${i}`, geometry: part.geometry, material: part.material });
    }
  );

  // Runner one: over the front edge of the desk and down. This is the one the camera sees
  // break the desk's silhouette, so it gets the longer fall.
  createVine(rng, {
    leaves: 11,
    path: [
      new THREE.Vector3(PLANT.x + 0.05, PLANT.y + 0.14, PLANT.z),
      new THREE.Vector3(PLANT.x + 0.14, PLANT.y + 0.1, PLANT.z + 0.24),
      new THREE.Vector3(PLANT.x + 0.2, PLANT.y + 0.01, PLANT.z + 0.5),
      new THREE.Vector3(PLANT.x + 0.17, PLANT.y - 0.22, PLANT.z + 0.55),
      new THREE.Vector3(PLANT.x + 0.24, PLANT.y - 0.46, PLANT.z + 0.5),
    ],
  }).forEach((part, i) => {
    parts.push({ name: `PlantRunner${i}`, geometry: part.geometry, material: part.material });
  });

  // Runner two: back along the desk towards the machine, ending near the cable drop.
  // Growth reaching for the thing that is also growing.
  createVine(rng, {
    leaves: 8,
    thickness: 0.006,
    // Leftward, towards the machine - growth reaching for the thing that is also growing.
    path: [
      new THREE.Vector3(PLANT.x - 0.02, PLANT.y + 0.15, PLANT.z - 0.03),
      new THREE.Vector3(PLANT.x - 0.28, PLANT.y + 0.06, PLANT.z - 0.14),
      new THREE.Vector3(PLANT.x - 0.6, PLANT.y + 0.02, PLANT.z - 0.2),
      new THREE.Vector3(PLANT.x - 0.86, PLANT.y + 0.04, PLANT.z - 0.28),
    ],
  }).forEach((part, i) => {
    parts.push({ name: `PlantReach${i}`, geometry: part.geometry, material: part.material });
  });

  return parts;
}


/**
 * Where the desk lamp stands, and where its bulb sits inside the shade.
 *
 * Coordinates are DESK-space, not floor-space: the desk top is y = 0 in this module and
 * FLOOR_Y is 76cm below it. The first version added FLOOR_Y the way the chair does and
 * built the whole lamp standing on the floor underneath the desk, with its arm rising
 * past the desk edge like a periscope. The chair is on the floor. The lamp is not.
 *
 * Exported because the light and the fixture have to agree. A practical whose lamp node
 * is not inside its shade is the thing §187 is complaining about when it asks for
 * controlled practicals rather than many weak lights - the room was lit by a point in
 * mid-air with nothing there to be emitting it.
 */
export const LAMP = {
  /** Foot of the lamp, on the desk top. */
  base: new THREE.Vector3(-1.28, 0, -0.84),
  /**
   * Centre of the shade opening. The point light goes here.
   *
   * Clear of the set, which it was not: at x = -0.44, z = -0.52 the head sat inside the
   * television's own bounding box, so the arm ran into the chassis and the pool it was
   * supposed to throw was lit from within a solid object. The set spans x -0.5..0.5 and
   * z -0.90..-0.10; this is outside it on both.
   */
  bulb: new THREE.Vector3(-0.92, 0.46, -0.3),
} as const;

/**
 * The desk lamp.
 *
 * §230 took one thing from every reference frame: a warm pool of light on a corner of a
 * cold room. That pool already existed here as a PointLightNode floating 1.35 above the
 * desk with no object attached to it, which is why the workstation read as evenly lit
 * rather than as lit BY something. This is the something.
 *
 * Placed left of the machine and reaching right, because the home camera sits out at +x -
 * a lamp on that side puts its arm between the lens and the screen, and the screen is the
 * one thing in this frame that must never be occluded.
 *
 * The arm is a single tube through three control points rather than jointed segments. At
 * this size the silhouette is all that survives, and a curve reads as an anglepoise more
 * honestly than four boxes and two hinges nobody can see.
 */
function createDeskLamp(rng: Rng): RoomPart[] {
  const parts: RoomPart[] = [];
  const { base, bulb } = LAMP;

  const foot = new THREE.CylinderGeometry(0.095, 0.105, 0.024, 14);
  foot.translate(base.x, base.y + 0.011, base.z);
  parts.push({ name: 'LampFoot', geometry: foot, material: 'metal' });

  // Up, over, and down onto the desk. The middle point is what gives it the shoulder.
  const arm = createVine(rng, {
    leaves: 0,
    thickness: 0.013,
    path: [
      new THREE.Vector3(base.x, base.y + 0.02, base.z),
      new THREE.Vector3(base.x + 0.04, base.y + 0.46, base.z + 0.06),
      new THREE.Vector3(base.x + 0.18, base.y + 0.75, base.z + 0.28),
      new THREE.Vector3(bulb.x + 0.02, bulb.y + 0.16, bulb.z - 0.02),
    ],
  });
  arm.forEach((part, i) => {
    parts.push({ name: `LampArm${i}`, geometry: part.geometry, material: 'metal' });
  });

  /**
   * The shade, open at the bottom.
   *
   * Open-ended on purpose: a closed cone hides the bulb and the fixture reads as a lump
   * on a stick. The lit interior is most of what says "this is where the light is coming
   * from", and it costs one flag.
   */
  const shade = new THREE.ConeGeometry(0.145, 0.155, 14, 1, true);
  shade.rotateX(Math.PI);
  shade.rotateZ(-0.34);
  shade.translate(bulb.x, bulb.y + 0.075, bulb.z);
  parts.push({ name: 'LampShade', geometry: shade, material: 'plastic' });

  // The bulb itself, unlit, so the fixture has a bright core at this distance rather than
  // a dark hole where the light is supposedly coming from.
  const glass = new THREE.SphereGeometry(0.036, 10, 8);
  glass.translate(bulb.x, bulb.y + 0.03, bulb.z);
  parts.push({ name: 'LampBulb', geometry: glass, material: 'lamp' });

  return parts;
}

/**
 * Where the chair goes, and why there is one.
 *
 * The geometry is now Chair.glb - the generated version is gone - but the reasoning that
 * put a chair here is not, so it stays with the numbers it produced.
 *
 * Two jobs, and it is the best value in the room for either. Compositionally the lower
 * left of the home shot was a quarter of the frame in empty unlit floor; a dark chair back
 * in the near foreground fills it, frames the machine between itself and the window, and
 * adds the depth cue the shot had no way to get otherwise. It sits hard against the near
 * edge because mid-floor it stood in the sightline to the two lowest menu plates, and a
 * framing element that hides the buttons is not framing anything.
 *
 * The other job is the point of §119. Nothing else in this room proves a person uses it -
 * a mug and some paper could be anywhere. An empty chair pushed back at an angle is
 * somebody who got up. The player is the thing on the desk; the chair is where the human
 * they are talking to would have sat, and it is empty.
 */
export const CHAIR_PLACEMENT = {
  /**
   * Station-local, feet on the floor.
   *
   * Brought in from x = -1.6 when the modelled chair replaced the generated one. The old
   * value was tuned to a narrow box-frame chair; a wider upholstered one at the same
   * place hangs off the left edge with a quarter of it in shot, which frames nothing.
   * Still well below the menu plates, which is the constraint that put it left at all.
   */
  position: new THREE.Vector3(-1.24, FLOOR_Y, 1.38),
  /** Turned out from the desk, the way a chair is left rather than tucked in. */
  turn: 0.42,
} as const;

/**
 * The machine sits on a desk against a wall, with the shallow clutter of somewhere
 * that has been used for years: a mug, a stack of paper, a small plant, cable runs.
 */
export function createWorkstationRoom(): RoomPart[] {
  const rng = createRng(seedFrom('omniscient-room'));
  const parts: RoomPart[] = [];

  // -- Big shapes ----------------------------------------------------------
  const floor = new THREE.BoxGeometry(7, 0.1, 5);
  floor.translate(0, FLOOR_Y - 0.05, -0.6);
  parts.push({ name: 'RoomFloor', geometry: floor, material: 'ground' });

  // The back wall, built AROUND a window rather than as one slab.
  //
  // A 7x3.4 field of flat mid-value is the largest thing in frame and was doing no work.
  // The window earns its cost three times over: it motivates the warm key (§9 - light as
  // through a coastal window), it puts the scene's brightest value off to camera left so
  // the machine has something to silhouette against, and the mullion gives the wall a
  // graphic structure that five pinned notes never could.
  const winL = WINDOW.x - WINDOW.width / 2;
  const winR = WINDOW.x + WINDOW.width / 2;
  const wallPieces: THREE.BufferGeometry[] = [];

  const wallTop = 3.4;
  const wallHeight = wallTop - FLOOR_Y;

  const leftOfWindow = new THREE.BoxGeometry(winL + 3.5, wallHeight, 0.16);
  leftOfWindow.translate((winL - 3.5) / 2, (wallTop + FLOOR_Y) / 2, -2.1);
  wallPieces.push(leftOfWindow);

  const rightOfWindow = new THREE.BoxGeometry(3.5 - winR, wallHeight, 0.16);
  rightOfWindow.translate((winR + 3.5) / 2, (wallTop + FLOOR_Y) / 2, -2.1);
  wallPieces.push(rightOfWindow);

  const underWindow = new THREE.BoxGeometry(WINDOW.width, WINDOW.sill - FLOOR_Y, 0.16);
  underWindow.translate(WINDOW.x, (WINDOW.sill + FLOOR_Y) / 2, -2.1);
  wallPieces.push(underWindow);

  const overWindow = new THREE.BoxGeometry(WINDOW.width, wallTop - WINDOW.head, 0.16);
  overWindow.translate(WINDOW.x, (WINDOW.head + wallTop) / 2, -2.1);
  wallPieces.push(overWindow);

  parts.push({
    name: 'RoomWall',
    geometry: mergeGeometries(wallPieces, false) ?? leftOfWindow,
    material: 'wall',
  });

  parts.push(...createWindow());

  // Side wall, so the room has a corner. One corner is enough to read as interior;
  // §186 wants the big shapes doing the work.
  const sideWall = new THREE.BoxGeometry(0.16, wallHeight, 4.2);
  sideWall.translate(-2.6, (wallTop + FLOOR_Y) / 2, -0.1);
  parts.push({ name: 'RoomSideWall', geometry: sideWall, material: 'wall' });

  // Desk. The CRT sits at y=0, so the desk top is just below it.
  const deskPieces: THREE.BufferGeometry[] = [];
  const top = new THREE.BoxGeometry(3.2, 0.07, 1.05);
  top.translate(0, -0.035, -0.55);
  deskPieces.push(top);

  // Front fascia, hanging below the top along its whole length.
  //
  // At this camera height the desk is seen almost edge-on, and a 7cm slab gave it nothing
  // to read as thickness - it looked like a sheet. The fascia is what makes the eye
  // accept it as furniture rather than as a surface painted on the floor.
  const fascia = new THREE.BoxGeometry(3.2, 0.16, 0.06);
  fascia.translate(0, -0.15, -0.06);
  deskPieces.push(fascia);

  const apron = new THREE.BoxGeometry(3.0, 0.13, 0.05);
  apron.translate(0, -0.13, -1.04);
  deskPieces.push(apron);
  parts.push({
    name: 'Desk',
    geometry: mergeGeometries(deskPieces, false) ?? top,
    material: 'timber',
  });

  // Legs, reaching the actual floor. They used to be 0.78 long hanging off a desk that
  // was already sitting on the ground, so they passed straight through it into nothing.
  const legHeight = -FLOOR_Y - 0.07;
  const legs: THREE.BufferGeometry[] = [];
  for (let sx = -1; sx <= 1; sx += 2) {
    for (let sz = -1; sz <= 1; sz += 2) {
      const leg = new THREE.BoxGeometry(0.08, legHeight, 0.08);
      leg.translate(sx * 1.45, FLOOR_Y + legHeight / 2, -0.55 + sz * 0.42);
      legs.push(leg);
    }
  }
  parts.push({
    name: 'DeskLegs',
    geometry: mergeGeometries(legs, false) ?? legs[0],
    material: 'metal',
  });

  // -- Clutter: the part that says somebody works here ----------------------

  // Mug, slightly off-square to the desk. Nothing a person owns is aligned.
  const mug = new THREE.CylinderGeometry(0.045, 0.04, 0.1, 10);
  mug.translate(0.82, 0.05, -0.16);
  mug.rotateY(jitter(rng, 0.4));
  parts.push({ name: 'Mug', geometry: mug, material: 'plastic' });

  // Paper stack, leaning.
  const paper: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const sheet = new THREE.BoxGeometry(0.24, 0.004, 0.32);
    sheet.translate(jitter(rng, 0.012), 0.004 + i * 0.005, jitter(rng, 0.012));
    sheet.rotateY(jitter(rng, 0.08));
    paper.push(sheet);
  }
  const stack = mergeGeometries(paper, false) ?? paper[0];
  stack.translate(-0.95, 0.0, -0.42);
  parts.push({ name: 'Papers', geometry: stack, material: 'paper' });

  parts.push(...createDeskPlant(rng));
  parts.push(...createDeskLamp(rng));

  // Cable runs from the machine down the back of the desk. Accumulated infrastructure
  // (§186) at the smallest possible scale.
  const cables: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    // From the underside of the desk down to the floor, now that there is a gap between
    // the two for them to run through.
    const length = -FLOOR_Y - range(rng, 0.02, 0.12);
    const drop = new THREE.BoxGeometry(0.018, length, 0.018);
    drop.translate(-0.3 + i * 0.22 + jitter(rng, 0.03), -0.07 - length / 2, -1.0 + jitter(rng, 0.05));
    drop.rotateZ(jitter(rng, 0.09));
    cables.push(drop);
  }
  parts.push({
    name: 'Cables',
    geometry: mergeGeometries(cables, false) ?? cables[0],
    material: 'dark',
  });

  /**
   * A pinboard, above and behind the machine.
   *
   * The notes used to be pinned straight onto the wall at desk height, which put them
   * behind the CRT and gave them nothing to read against - five pale rectangles on a pale
   * wall, in shadow, indistinguishable from smudges. A dark board fixes both problems at
   * once: it gives the paper the contrast it needs to register at all, and it fills the
   * empty upper middle of the frame, which was the last large area of the home shot doing
   * no work.
   */
  const board = new THREE.BoxGeometry(BOARD.width, BOARD.height, 0.03);
  board.translate(BOARD.x, BOARD.y, -2.0);
  parts.push({ name: 'Pinboard', geometry: board, material: 'dark' });

  const boardFrame: THREE.BufferGeometry[] = [];
  const railW = BOARD.width + 0.07;
  const halfH = BOARD.height / 2;
  const halfW = BOARD.width / 2;
  for (const [w, h, dx, dy] of [
    [railW, 0.05, 0, halfH],
    [railW, 0.05, 0, -halfH],
    [0.05, BOARD.height, -halfW, 0],
    [0.05, BOARD.height, halfW, 0],
  ] as const) {
    const rail = new THREE.BoxGeometry(w, h, 0.045);
    rail.translate(BOARD.x + dx, BOARD.y + dy, -1.995);
    boardFrame.push(rail);
  }
  parts.push({
    name: 'PinboardFrame',
    geometry: mergeGeometries(boardFrame, false) ?? boardFrame[0],
    material: 'timber',
  });

  // Notes on it. Overlapping and off-square, layered rather than laid out on a grid -
  // this is a board somebody has been adding to, not a display.
  // Hand-placed rather than gridded. Four across two rows came out looking like a
  // spreadsheet; these overlap, sit at different heights and vary in size, which is what a
  // board somebody keeps adding to actually looks like.
  const notes: THREE.BufferGeometry[] = [];
  const layout: ReadonlyArray<readonly [number, number, number, number]> = [
    [-0.44, 0.19, 0.28, 0.24],
    [-0.14, 0.23, 0.22, 0.17],
    [0.16, 0.17, 0.26, 0.26],
    [0.42, 0.21, 0.18, 0.2],
    [-0.36, -0.19, 0.24, 0.22],
    [-0.02, -0.24, 0.3, 0.19],
    [0.34, -0.17, 0.2, 0.25],
  ];
  layout.forEach(([dx, dy, w, h], i) => {
    const note = new THREE.BoxGeometry(w, h, 0.006);
    note.rotateZ(jitter(rng, 0.13));
    note.translate(
      BOARD.x + dx + jitter(rng, 0.02),
      BOARD.y + dy + jitter(rng, 0.03),
      -1.978 + i * 0.001
    );
    notes.push(note);
  });
  parts.push({
    name: 'Notes',
    geometry: mergeGeometries(notes, false) ?? notes[0],
    material: 'paper',
  });

  // A length of string with two things hanging off it, across the lower half. One
  // diagonal breaks the grid of rectangles and says this board has been lived with.
  const string = new THREE.BoxGeometry(BOARD.width - 0.06, 0.008, 0.008);
  string.rotateZ(0.035);
  string.translate(BOARD.x, BOARD.y - 0.14, -1.972);
  parts.push({ name: 'BoardString', geometry: string, material: 'metal' });

  /**
   * A shelf on the side wall, with things on it.
   *
   * The side wall was a third of the frame and completely empty - a pale triangle that
   * competed with the machine for attention while saying nothing. A shelf breaks it with
   * one strong horizontal, drops a shadow-side underneath, and the objects on it give the
   * left of frame a silhouette to read instead of a gradient.
   */
  const shelf = new THREE.BoxGeometry(0.05, 0.045, 1.5);
  shelf.translate(-2.4, 1.42, -0.7);
  parts.push({ name: 'Shelf', geometry: shelf, material: 'timberLit' });

  const brackets: THREE.BufferGeometry[] = [];
  for (const z of [-1.28, -0.16]) {
    const bracket = new THREE.BoxGeometry(0.035, 0.16, 0.03);
    bracket.translate(-2.42, 1.32, z);
    brackets.push(bracket);
  }
  parts.push({
    name: 'ShelfBrackets',
    geometry: mergeGeometries(brackets, false) ?? brackets[0],
    material: 'metal',
  });

  // Boxes and tins along it, leaning where things lean. Uneven heights so the top edge
  // is a broken line rather than a second shelf.
  const shelfItems: THREE.BufferGeometry[] = [];
  let along = -1.24;
  for (const height of [0.2, 0.14, 0.26, 0.11, 0.18]) {
    const depth = range(rng, 0.12, 0.2);
    const item = new THREE.BoxGeometry(range(rng, 0.1, 0.15), height, depth);
    item.rotateX(jitter(rng, 0.04));
    item.translate(-2.36 + jitter(rng, 0.02), 1.445 + height / 2, along + depth / 2);
    shelfItems.push(item);
    along += depth + range(rng, 0.04, 0.13);
  }
  parts.push({
    name: 'ShelfItems',
    geometry: mergeGeometries(shelfItems, false) ?? shelfItems[0],
    material: 'timber',
  });

  // Skirting. One horizontal dark line where the wall meets the floor - the cheapest
  // possible fix for a room whose two largest planes currently just abut.
  const skirtingPieces: THREE.BufferGeometry[] = [];
  const backSkirting = new THREE.BoxGeometry(7, 0.11, 0.04);
  backSkirting.translate(0, FLOOR_Y + 0.055, -2.0);
  skirtingPieces.push(backSkirting);
  const sideSkirting = new THREE.BoxGeometry(0.04, 0.11, 4.2);
  sideSkirting.translate(-2.5, FLOOR_Y + 0.055, -0.1);
  skirtingPieces.push(sideSkirting);
  parts.push({
    name: 'Skirting',
    geometry: mergeGeometries(skirtingPieces, false) ?? backSkirting,
    material: 'dark',
  });

  // Things stood against the wall on the floor. Rooms accumulate at their edges, and the
  // desk was floating in an empty box - these give the floor plane something to end on.
  const floorClutter: THREE.BufferGeometry[] = [];
  for (const [x, w, h, d] of [
    [-2.1, 0.46, 0.62, 0.14],
    [-1.72, 0.3, 0.44, 0.12],
    [1.9, 0.52, 0.38, 0.3],
  ] as const) {
    const box = new THREE.BoxGeometry(w, h, d);
    box.rotateZ(jitter(rng, 0.05));
    box.rotateY(jitter(rng, 0.2));
    box.translate(x + jitter(rng, 0.05), FLOOR_Y + h / 2, -1.86 + jitter(rng, 0.04));
    floorClutter.push(box);
  }
  parts.push({
    name: 'FloorClutter',
    geometry: mergeGeometries(floorClutter, false) ?? floorClutter[0],
    material: 'timber',
  });

  return parts;
}
