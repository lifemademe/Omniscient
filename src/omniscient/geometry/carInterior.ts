/**
 * The inside of the car, from the driver's seat.
 *
 * ## Why this set exists, and why it is SOLID
 *
 * `wireCity.ts` sets out the three tiers this game draws in:
 *
 *   wireframe   - OMNISCIENT observing reality
 *   rendered    - OMNISCIENT talking to somebody through a device
 *   first person - OMNISCIENT inside a system that is connected to it
 *
 * Mission 08 is the payoff for all three, and `mission-08-district.ts` promised it in its
 * header before a line of code existed: "the moment the wireframe resolves into rain on a
 * windscreen". The wireframe city is the machine's guess at a district. This is the one
 * place in the mission where the guess stops - so it is not lines, it is surfaces, and the
 * resolve from one to the other is the whole point of building it.
 *
 * ## Why it is geometry and not a scene
 *
 * Same reason wireCity is: it returns BufferGeometries and knows nothing about the engine,
 * the scene graph or the mission. A harness can assert the windscreen is in front of the
 * eye and the phone is within reach without opening the editor, which is the only way any
 * claim about this set gets checked before the freeze.
 *
 * ## The coordinate frame
 *
 * Origin at the driver's eye, looking down -Z, +X to the right, +Y up. Metres. Every number
 * below is a real measurement off a real car, because the one thing this set has to do is
 * feel like a place rather than a diorama - and a windscreen at the wrong distance reads as
 * wrong long before anybody can say why.
 */

import * as THREE from 'three';

/** Where the driver's eye is, relative to the car. Everything here is built around it. */
export const EYE = new THREE.Vector3(0, 0, 0);

/**
 * The set, in parts, so the scene can reveal them separately.
 *
 * Three endings share this environment and each wants a different subset: the call needs
 * the phone lit and the driver's own body irrelevant, the glasses need the frame of the
 * spectacles and no phone. Handing back one merged mesh would make that a material trick;
 * handing back parts makes it a visibility one.
 */
export interface CarInterior {
  /** Dashboard, doors, pillars, roof lining - the shell the eye sits inside. */
  cabin: THREE.BufferGeometry;
  /** The glass itself, as a separate surface so rain and reflection can live on it. */
  windscreen: THREE.BufferGeometry;
  /** Wiper blades, in their parked position. Animated by the scene. */
  wipers: THREE.BufferGeometry;
  /** The phone on the passenger seat. Its own geometry so it can light on its own. */
  phone: THREE.BufferGeometry;
  /**
   * The inside edge of a pair of spectacles, drawn as a vignette frame at eye distance.
   *
   * Only ever visible in the glasses ending, and only just - a hard frame would make the
   * shot a viewfinder gimmick. This is the suggestion of one, enough that the player knows
   * whose eyes they are behind.
   */
  glasses: THREE.BufferGeometry;
  /** Where the scene should put things, in this frame. */
  anchors: {
    /** Centre of the glass, for rain and for the camera to aim through. */
    windscreen: THREE.Vector3;
    /** The phone's screen, for its glow. */
    phone: THREE.Vector3;
    /** Straight ahead, out on the road - what the driver is actually looking at. */
    road: THREE.Vector3;
  };
}

/** Push one axis-aligned box, centred at (cx, cy, cz). */
function box(target: number[], cx: number, cy: number, cz: number, w: number, h: number, d: number): void {
  const geometry = new THREE.BoxGeometry(w, h, d);
  geometry.translate(cx, cy, cz);
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  if (!index) return;
  for (let i = 0; i < index.count; i++) {
    const at = index.getX(i);
    target.push(position.getX(at), position.getY(at), position.getZ(at));
  }
  geometry.dispose();
}

/** A flat quad from four corners, wound so it faces the eye. */
function quad(
  target: number[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  d: THREE.Vector3
): void {
  for (const v of [a, b, c, a, c, d]) target.push(v.x, v.y, v.z);
}

function geometryFrom(points: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Build the set.
 *
 * No randomness and no options: there is exactly one of these in the game, it is looked at
 * for a few seconds, and every number in it is a decision rather than a sample. A seed
 * would only make it harder to say what the player will see.
 */
export function carInterior(): CarInterior {
  const cabin: number[] = [];

  /*
   * The windscreen sits about 0.8m in front of the eye and rakes away.
   *
   * Measured rather than guessed. A screen closer than about 0.7m reads as a helmet visor
   * and one past a metre reads as a bus, and the difference between those two feelings is
   * most of whether this shot lands as "a person is driving this".
   */
  const glassBottom = -0.34;
  const glassTop = 0.30;
  const glassNear = -0.78;
  const glassFar = -1.12;
  const halfWidth = 0.62;

  const screen: number[] = [];
  quad(
    screen,
    new THREE.Vector3(-halfWidth, glassBottom, glassNear),
    new THREE.Vector3(halfWidth, glassBottom, glassNear),
    new THREE.Vector3(halfWidth, glassTop, glassFar),
    new THREE.Vector3(-halfWidth, glassTop, glassFar)
  );

  /*
   * The dashboard, and it is a LEDGE rather than a slab.
   *
   * What sells an interior at this focal length is the horizon line the dash cuts across
   * the bottom of the glass. The shape behind it barely matters; the edge does all the
   * work, so the edge is where the geometry goes.
   */
  box(cabin, 0, glassBottom - 0.06, glassNear + 0.02, halfWidth * 2, 0.12, 0.26);
  box(cabin, 0, glassBottom - 0.22, glassNear + 0.16, halfWidth * 2, 0.24, 0.1);

  // A-pillars either side of the glass. Thin, and the only vertical in shot.
  for (const side of [-1, 1]) {
    box(cabin, side * (halfWidth + 0.04), (glassBottom + glassTop) / 2, (glassNear + glassFar) / 2, 0.09, 0.78, 0.4);
  }

  // Roof lining, cutting the top of frame the way a real one does.
  box(cabin, 0, glassTop + 0.1, glassFar + 0.2, halfWidth * 2 + 0.16, 0.1, 0.8);

  // Door cards, just inside the frame edges - they catch light and say "enclosed".
  for (const side of [-1, 1]) {
    box(cabin, side * (halfWidth + 0.1), glassBottom - 0.18, 0.05, 0.08, 0.5, 0.7);
  }

  // The passenger seat back, which is what the phone sits against.
  box(cabin, 0.52, glassBottom - 0.3, 0.16, 0.46, 0.44, 0.12);

  /*
   * The wipers, parked low across the glass.
   *
   * Two blades on the near face of the screen rather than modelled arms. At this distance a
   * wiper is a dark line that sweeps; the mechanism is never in shot and modelling it would
   * be detail the player pays for in geometry and never sees.
   */
  const wipers: number[] = [];
  for (const side of [-1, 1]) {
    const originX = side * 0.28;
    quad(
      wipers,
      new THREE.Vector3(originX - 0.02, glassBottom + 0.02, glassNear - 0.01),
      new THREE.Vector3(originX + 0.02, glassBottom + 0.02, glassNear - 0.01),
      new THREE.Vector3(originX + 0.34 * side + 0.02, glassBottom + 0.12, glassNear - 0.03),
      new THREE.Vector3(originX + 0.34 * side - 0.02, glassBottom + 0.12, glassNear - 0.03)
    );
  }

  /*
   * The phone, face up on the passenger seat.
   *
   * Off to the right and BELOW the eye line, so it is at the edge of vision rather than in
   * the middle of the shot. The call ending is about a thing happening beside somebody who
   * is not looking at it, and a phone in the centre of frame is a phone being looked at.
   */
  const phonePos = new THREE.Vector3(0.44, glassBottom - 0.22, -0.06);
  const phone: number[] = [];
  box(phone, phonePos.x, phonePos.y, phonePos.z, 0.07, 0.004, 0.145);

  /*
   * The spectacle frame, as a vignette at eye distance.
   *
   * Four thin bars just inside the edges of vision, close enough to be out of focus in the
   * eye rather than an object in the room. A hard rim would turn this into a viewfinder
   * gimmick, and the point of the glasses ending is that a person is wearing them, not that
   * the machine has put on a helmet.
   */
  const glasses: number[] = [];
  const rimZ = -0.11;
  box(glasses, 0, 0.075, rimZ, 0.30, 0.006, 0.004);
  box(glasses, 0, -0.075, rimZ, 0.30, 0.006, 0.004);
  for (const side of [-1, 1]) box(glasses, side * 0.15, 0, rimZ, 0.006, 0.155, 0.004);
  // The bridge, which is the one part of a pair of glasses anybody actually sees on themselves.
  box(glasses, 0, 0.04, rimZ, 0.03, 0.008, 0.004);

  return {
    cabin: geometryFrom(cabin),
    windscreen: geometryFrom(screen),
    wipers: geometryFrom(wipers),
    phone: geometryFrom(phone),
    glasses: geometryFrom(glasses),
    anchors: {
      windscreen: new THREE.Vector3(0, (glassBottom + glassTop) / 2, (glassNear + glassFar) / 2),
      phone: phonePos,
      road: new THREE.Vector3(0, 0, -14),
    },
  };
}
