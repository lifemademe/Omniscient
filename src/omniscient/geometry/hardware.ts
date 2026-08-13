/**
 * OMNISCIENT_ retro-future hardware generators.
 *
 * Code-first procedural assets per Gauntlet §110 / §210: one parameterised generator
 * replaces a folder of hand-modelled variants and gives the §187 "accumulated
 * infrastructure" language for free.
 *
 * Every generator returns geometry grouped by material role rather than a single merged
 * mesh, so a small shared material family (§187) can be applied across the whole kit.
 * Geometry is built in local space with the screen facing +Z and the origin at the
 * base centre, so terminals can be dropped straight onto a floor.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { createRng, jitter, range, seedFrom } from '../core/rng.js';

import type { Rng } from '../core/rng.js';

/** Geometry grouped by the material it wants. */
export interface HardwareParts {
  /** Main plastic body. */
  chassis: THREE.BufferGeometry;
  /** Dark recessed surround framing the screen. */
  bezel: THREE.BufferGeometry;
  /** Flat quad the CRT canvas texture maps onto. Faces +Z. */
  screen: THREE.BufferGeometry;
  /** Vents, knobs, ports, feet - metal / secondary plastic. */
  details: THREE.BufferGeometry;
}

export interface CRTTerminalParams {
  /** Seed or seed key. Same value always yields the same terminal. */
  seed?: number | string;
  width?: number;
  height?: number;
  depth?: number;
  /** Corner chamfer. Larger reads chunkier / older. */
  chamfer?: number;
  /** Fraction of the face the screen occupies (0-1). */
  screenScale?: number;
  /** Cooling slots cut into each side. */
  ventCount?: number;
  /** Dials along the bottom rail. */
  knobCount?: number;
  /**
   * 0 = factory fresh and symmetrical, 1 = heavily accumulated.
   * Drives asymmetry, panel misalignment and added maintenance clutter.
   */
  wear?: number;
}

const CRT_DEFAULTS: Required<Omit<CRTTerminalParams, 'seed'>> = {
  width: 1.0,
  height: 0.82,
  depth: 0.86,
  chamfer: 0.045,
  screenScale: 0.72,
  ventCount: 7,
  knobCount: 3,
  wear: 0.45,
};

/**
 * Chamfered slab built by extruding a rounded rectangle.
 * Bevelled extrusion gives real faceted corners that catch a key light, which is what
 * sells "chunky moulded plastic" rather than "box primitive".
 */
function chamferedSlab(width: number, height: number, depth: number, chamfer: number): THREE.BufferGeometry {
  const c = Math.min(chamfer, width * 0.4, height * 0.4, depth * 0.4);
  const halfW = width / 2 - c;
  const halfH = height / 2 - c;

  const shape = new THREE.Shape();
  shape.moveTo(-halfW, -height / 2 + c);
  shape.lineTo(halfW, -height / 2 + c);
  shape.lineTo(width / 2 - c * 0.5, -halfH);
  shape.lineTo(width / 2 - c * 0.5, halfH);
  shape.lineTo(halfW, height / 2 - c);
  shape.lineTo(-halfW, height / 2 - c);
  shape.lineTo(-width / 2 + c * 0.5, halfH);
  shape.lineTo(-width / 2 + c * 0.5, -halfH);
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: depth - c * 2,
    bevelEnabled: true,
    bevelThickness: c,
    bevelSize: c,
    bevelSegments: 1,
    curveSegments: 1,
  });

  // Extrude builds along +Z from z=0; recentre so the slab straddles the origin.
  geometry.translate(0, 0, -(depth - c * 2) / 2);
  return geometry;
}

/** A single cooling slot. */
function ventSlot(length: number, thickness: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(thickness, thickness * 0.55, length);
}

/** A control dial: shaft plus grip. */
function knob(radius: number, depth: number, rng: Rng): THREE.BufferGeometry {
  const grip = new THREE.CylinderGeometry(radius, radius * 0.82, depth, 8);
  grip.rotateX(Math.PI / 2);

  const marker = new THREE.BoxGeometry(radius * 0.16, radius * 1.5, depth * 0.35);
  marker.translate(0, radius * 0.35, depth * 0.5);
  marker.rotateZ(jitter(rng, 0.9));

  return mergeGeometries([grip, marker], false) ?? grip;
}

/**
 * The OMNISCIENT_ home terminal: a chunky CRT in a moulded plastic shell.
 *
 * This is the game's most-seen object (§174 - the CRT should become one of the most
 * recognisable motifs), so it is worth generating rather than modelling: the same
 * function produces the home machine, OBN public terminals and contact-side hardware
 * by varying wear, proportion and detail counts.
 */
export function createCRTTerminal(params: CRTTerminalParams = {}): HardwareParts {
  const p = { ...CRT_DEFAULTS, ...params };
  const seed = typeof params.seed === 'string' ? seedFrom(params.seed) : params.seed ?? 1;
  const rng = createRng(seed);
  const wear = THREE.MathUtils.clamp(p.wear, 0, 1);

  const chassisPieces: THREE.BufferGeometry[] = [];
  const detailPieces: THREE.BufferGeometry[] = [];

  // --- Main body -----------------------------------------------------------
  const body = chamferedSlab(p.width, p.height, p.depth, p.chamfer);
  body.translate(0, p.height / 2, 0);
  chassisPieces.push(body);

  // Rear taper: old tubes are deep and narrow toward the neck.
  const neck = chamferedSlab(p.width * 0.55, p.height * 0.55, p.depth * 0.45, p.chamfer * 0.7);
  neck.translate(jitter(rng, 0.01 * wear), p.height * 0.52, -p.depth * 0.62);
  chassisPieces.push(neck);

  // --- Screen and bezel ----------------------------------------------------
  const screenW = p.width * p.screenScale;
  const screenH = p.height * p.screenScale * 0.86;
  const faceZ = p.depth / 2 + 0.001;

  const bezelOuter = chamferedSlab(screenW + 0.09, screenH + 0.09, 0.06, 0.018);
  bezelOuter.translate(0, p.height * 0.55, faceZ - 0.012);

  const screen = new THREE.PlaneGeometry(screenW, screenH, 1, 1);
  screen.translate(0, p.height * 0.55, faceZ + 0.022);

  // --- Vents ---------------------------------------------------------------
  // Slots run front-to-back along both shoulders. Slight length variance stops the
  // repeat reading as a texture.
  //
  // These sat at `width/2 - 0.03` with a 0.05-wide box, which put every slot entirely
  // INSIDE the chassis - seven pieces of geometry per side, buried, never once visible.
  // Without boolean cuts the honest read is a proud louvre rather than a recessed slot,
  // so they now stand a little off the surface where the key can catch their top edges.
  const ventLength = p.depth * 0.42;
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < p.ventCount; i++) {
      const t = (i + 1) / (p.ventCount + 1);
      const slot = ventSlot(ventLength * range(rng, 0.86, 1.0), 0.05);
      slot.translate(
        side * (p.width / 2 + 0.008),
        p.height * (0.16 + t * 0.66),
        -p.depth * 0.1 + jitter(rng, 0.02 * wear)
      );
      detailPieces.push(slot);
    }
  }

  // The seam where the two halves of the case meet. One continuous dark line around a
  // large pale mass is the single cheapest thing that stops it reading as an untouched
  // box - every piece of hardware this machine is pretending to be has one.
  const seam = new THREE.BoxGeometry(p.width + 0.012, 0.014, p.depth * 0.92);
  seam.translate(0, p.height * 0.34, -p.depth * 0.02);
  detailPieces.push(seam);

  // --- Control rail --------------------------------------------------------
  const railY = p.height * 0.13;
  for (let i = 0; i < p.knobCount; i++) {
    const t = (i + 1) / (p.knobCount + 1);
    const dial = knob(0.038 * range(rng, 0.85, 1.15), 0.05, rng);
    dial.translate(
      (t - 0.5) * p.width * 0.55 + jitter(rng, 0.012 * wear),
      railY + jitter(rng, 0.008 * wear),
      faceZ + 0.02
    );
    detailPieces.push(dial);
  }

  // Status lamp, always offset - a perfectly centred lamp reads as a UI element,
  // an offset one reads as a machine.
  const lamp = new THREE.CylinderGeometry(0.016, 0.016, 0.03, 6);
  lamp.rotateX(Math.PI / 2);
  lamp.translate(p.width * 0.36, railY, faceZ + 0.015);
  detailPieces.push(lamp);

  // --- Feet ----------------------------------------------------------------
  for (let sx = -1; sx <= 1; sx += 2) {
    for (let sz = -1; sz <= 1; sz += 2) {
      const foot = new THREE.BoxGeometry(0.1, 0.05, 0.1);
      foot.translate(sx * p.width * 0.36, 0.025, sz * p.depth * 0.3);
      detailPieces.push(foot);
    }
  }

  // --- Accumulated maintenance --------------------------------------------
  // Wear does not mean noise: it means evidence that somebody has had this open.
  // Riveted-on plates. These were all on the rear face, which no shot in the game ever
  // sees - evidence of repair nobody could find. They now go on the top and the right
  // shoulder, where the three-quarter home shot actually looks.
  const patchCount = Math.round(wear * 3);
  for (let i = 0; i < patchCount; i++) {
    if (i % 2 === 0) {
      // Lying on the top face.
      const patch = new THREE.BoxGeometry(range(rng, 0.08, 0.18), 0.01, range(rng, 0.06, 0.14));
      patch.rotateY(jitter(rng, 0.2));
      patch.translate(jitter(rng, p.width * 0.28), p.height + 0.005, jitter(rng, p.depth * 0.22));
      detailPieces.push(patch);
    } else {
      // Screwed flat to the right shoulder, facing the camera in the home shot.
      const patch = new THREE.BoxGeometry(0.01, range(rng, 0.05, 0.11), range(rng, 0.08, 0.16));
      patch.translate(
        p.width * 0.5 + 0.005,
        p.height * range(rng, 0.45, 0.85),
        -p.depth * range(rng, 0.05, 0.3)
      );
      detailPieces.push(patch);
    }
  }

  return {
    chassis: mergeGeometries(chassisPieces, false) ?? body,
    bezel: bezelOuter,
    screen,
    details: mergeGeometries(detailPieces, false) ?? lamp,
  };
}

/** Free every geometry in a parts bundle. */
export function disposeParts(parts: HardwareParts): void {
  parts.chassis.dispose();
  parts.bezel.dispose();
  parts.screen.dispose();
  parts.details.dispose();
}
