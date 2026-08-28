/**
 * Menu hardware modules.
 *
 * §103: important UI should feel like part of the machine, not a layer of generic
 * rectangular buttons - and "every module should have a distinctive physical interaction
 * rather than being the same box with different text".
 *
 * So each module has its own physical character: a speaker grille, a circuit card, a
 * tape drive, a dial, a cartridge, a guarded power switch. They share a plate so the
 * stack reads as one machine, and differ in what is bolted to it.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { createRng, jitter, range, seedFrom } from '../core/rng.js';

import type { MAT } from '../art/palette.js';

export type ModuleKind = 'speaker' | 'card' | 'tape' | 'dial' | 'cartridge' | 'power';

export interface ModulePart {
  geometry: THREE.BufferGeometry;
  material: keyof typeof MAT;
}

export interface ModuleBuild {
  /** The plate - this is the pick target and what the cable plugs into. */
  plate: THREE.BufferGeometry;
  /** Hardware bolted to the plate. */
  details: ModulePart[];
  /** Where the cable connector seats, in module-local space. */
  socket: THREE.Vector3;
}

/** A desk-mounted rack: continuous side rails, a recessed back, and bolted feet. */
export function createModuleRack(width: number, top: number): ModulePart[] {
  const parts: ModulePart[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, material: keyof typeof MAT): void => {
    parts.push({ geometry: new THREE.BoxGeometry(w, h, d).translate(x, y, z), material });
  };
  box(width, top - 0.18, 0.08, 0, (top + 0.18) / 2, -0.10, 'dark');
  for (const side of [-1, 1]) {
    const x = side * (width / 2 - 0.025);
    box(0.045, top, 0.13, x, top / 2, -0.045, 'dark');
    box(0.12, 0.035, 0.34, x, 0.018, -0.005, 'metal');
  }
  box(width, 0.04, 0.13, 0, top, -0.045, 'metal');
  return parts;
}

/**
 * Plate size, corrected against a real rack panel - and applied as a SCALE rather than as
 * new constants, which is a bug fix as much as a tidy-up.
 *
 * These were 1.34m wide, a control plate the size of a door, and the CRT beside them was a
 * metre across. Both were about twice life size, and because they were wrong together they
 * looked right together.
 *
 * The first correction simply rewrote these three numbers, and that broke every plate:
 * every piece of hardware below - the boards, the reels, the knob, the cartridge, the
 * socket collar - is authored in ABSOLUTE metres, tuned against a 1.34m plate. Shrinking
 * the plate underneath them left a 0.34m circuit board sitting on a 0.75m panel, covering
 * the label it was meant to sit beside. NEW GAME was unreadable.
 *
 * So the whole module is authored at its original size and scaled once on the way out.
 * Everything on it - plate, hardware, socket position - goes through the same multiply,
 * and a future change to PLATE_SCALE cannot desynchronise them.
 */
const PLATE_SCALE = 0.56;
const PLATE_W = 1.34;
const PLATE_H = 0.3;
const PLATE_D = 0.11;

/** Chamfered plate, shared by every module so the stack reads as one machine. */
function plateGeometry(chamfer = 0.02): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const hw = PLATE_W / 2;
  const hh = PLATE_H / 2;
  shape.moveTo(-hw + chamfer, -hh);
  shape.lineTo(hw - chamfer, -hh);
  shape.lineTo(hw, -hh + chamfer);
  shape.lineTo(hw, hh - chamfer);
  shape.lineTo(hw - chamfer, hh);
  shape.lineTo(-hw + chamfer, hh);
  shape.lineTo(-hw, hh - chamfer);
  shape.lineTo(-hw, -hh + chamfer);
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: PLATE_D,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 1,
    curveSegments: 1,
  });
  geometry.translate(0, 0, -PLATE_D / 2);
  return geometry;
}

/** Two fixing bolts, so every plate looks bolted on rather than floating. */
function bolts(rng: () => number): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    const bolt = new THREE.CylinderGeometry(0.014, 0.014, 0.02, 6);
    bolt.rotateX(Math.PI / 2);
    bolt.translate(sx * (PLATE_W / 2 - 0.05), -PLATE_H / 2 + 0.05 + jitter(rng, 0.004), PLATE_D / 2);
    pieces.push(bolt);
  }
  return mergeGeometries(pieces, false) ?? pieces[0];
}

export function createModule(kind: ModuleKind, seedKey: string): ModuleBuild {
  const rng = createRng(seedFrom(seedKey));
  const details: ModulePart[] = [];
  const face = PLATE_D / 2;

  details.push({ geometry: bolts(rng), material: 'metal' });

  switch (kind) {
    case 'speaker': {
      // ANSWER A REQUEST - a grille, because this is the one that listens.
      const holes: THREE.BufferGeometry[] = [];
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
          const hole = new THREE.CylinderGeometry(0.011, 0.011, 0.012, 6);
          hole.rotateX(Math.PI / 2);
          hole.translate(-PLATE_W / 2 + 0.13 + col * 0.045, 0.055 - row * 0.045, face);
          holes.push(hole);
        }
      }
      details.push({ geometry: mergeGeometries(holes, false) ?? holes[0], material: 'dark' });
      break;
    }

    case 'card': {
      // KNOWLEDGE CIRCUIT - an exposed board with traces and a chip.
      const board = new THREE.BoxGeometry(0.34, 0.19, 0.012);
      board.translate(-PLATE_W / 2 + 0.24, 0, face + 0.006);
      details.push({ geometry: board, material: 'corroded' });

      const traces: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 5; i++) {
        const trace = new THREE.BoxGeometry(range(rng, 0.08, 0.26), 0.008, 0.004);
        trace.translate(-PLATE_W / 2 + 0.2 + jitter(rng, 0.05), 0.07 - i * 0.035, face + 0.014);
        traces.push(trace);
      }
      details.push({ geometry: mergeGeometries(traces, false) ?? traces[0], material: 'metal' });

      const chip = new THREE.BoxGeometry(0.07, 0.05, 0.016);
      chip.translate(-PLATE_W / 2 + 0.3, -0.02, face + 0.016);
      details.push({ geometry: chip, material: 'dark' });
      break;
    }

    case 'tape': {
      // MEMORY ARCHIVES - two reels behind a window. Memory you can see moving.
      const window = new THREE.BoxGeometry(0.36, 0.17, 0.01);
      window.translate(-PLATE_W / 2 + 0.25, 0, face + 0.005);
      details.push({ geometry: window, material: 'dark' });

      const reels: THREE.BufferGeometry[] = [];
      for (const sx of [-1, 1]) {
        const reel = new THREE.CylinderGeometry(0.05, 0.05, 0.014, 12);
        reel.rotateX(Math.PI / 2);
        reel.translate(-PLATE_W / 2 + 0.25 + sx * 0.085, 0, face + 0.012);
        reels.push(reel);
      }
      details.push({ geometry: mergeGeometries(reels, false) ?? reels[0], material: 'plastic' });
      break;
    }

    case 'dial': {
      // TOOLKIT - a big knob. The one you turn to change what the phone is.
      const knob = new THREE.CylinderGeometry(0.062, 0.055, 0.05, 10);
      knob.rotateX(Math.PI / 2);
      knob.translate(-PLATE_W / 2 + 0.19, 0, face + 0.025);
      details.push({ geometry: knob, material: 'metal' });

      const marker = new THREE.BoxGeometry(0.008, 0.05, 0.012);
      marker.translate(-PLATE_W / 2 + 0.19, 0.035, face + 0.05);
      details.push({ geometry: marker, material: 'lamp' });
      break;
    }

    case 'cartridge': {
      // SETTINGS - a slotted cartridge, half seated.
      const slot = new THREE.BoxGeometry(0.3, 0.03, 0.02);
      slot.translate(-PLATE_W / 2 + 0.23, -0.075, face + 0.008);
      details.push({ geometry: slot, material: 'dark' });

      const cart = new THREE.BoxGeometry(0.26, 0.15, 0.032);
      cart.translate(-PLATE_W / 2 + 0.23, 0.02 + jitter(rng, 0.006), face + 0.018);
      cart.rotateZ(jitter(rng, 0.02));
      details.push({ geometry: cart, material: 'timber' });
      break;
    }

    case 'power': {
      // SHUT DOWN - an oversized guarded switch. §103 allows this one some personality.
      const guard = new THREE.TorusGeometry(0.062, 0.012, 4, 10);
      guard.translate(-PLATE_W / 2 + 0.19, 0, face + 0.012);
      details.push({ geometry: guard, material: 'metal' });

      const button = new THREE.CylinderGeometry(0.042, 0.042, 0.036, 10);
      button.rotateX(Math.PI / 2);
      button.translate(-PLATE_W / 2 + 0.19, 0, face + 0.018);
      details.push({ geometry: button, material: 'warningLamp' });
      break;
    }
  }

  /**
   * The socket itself, on every plate.
   *
   * §237 requires something to plug INTO. The socket position has been declared since the
   * cable was written and there was never anything there - the connector flew to a point
   * in the air a few centimetres off the plate face and stopped, which reads as the cable
   * bumping into the module rather than entering it.
   *
   * A recessed collar with a dark bore. The recess is what sells it: a ring sitting proud
   * of the surface is a boss, a ring around a hole is a socket, and the difference is one
   * dark cylinder.
   */
  const socketAt = new THREE.Vector3(PLATE_W / 2 - 0.1, 0, face + 0.03);

  const collar = new THREE.CylinderGeometry(0.038, 0.042, 0.022, 12);
  collar.rotateX(Math.PI / 2);
  collar.translate(socketAt.x, socketAt.y, face + 0.006);
  details.push({ geometry: collar, material: 'metal' });

  const bore = new THREE.CylinderGeometry(0.025, 0.025, 0.03, 10);
  bore.rotateX(Math.PI / 2);
  bore.translate(socketAt.x, socketAt.y, face + 0.001);
  details.push({ geometry: bore, material: 'dark' });

  // Everything down to life size in one place. See PLATE_SCALE.
  const plate = plateGeometry();
  plate.scale(PLATE_SCALE, PLATE_SCALE, PLATE_SCALE);
  for (const detail of details) {
    detail.geometry.scale(PLATE_SCALE, PLATE_SCALE, PLATE_SCALE);
  }

  return {
    plate,
    details,
    // The cable seats in the collar at the right-hand end, clear of whatever hardware
    // that module carries on the left.
    socket: socketAt.multiplyScalar(PLATE_SCALE),
  };
}

export const MODULE_PLATE = {
  width: PLATE_W * PLATE_SCALE,
  height: PLATE_H * PLATE_SCALE,
  depth: PLATE_D * PLATE_SCALE,
};
