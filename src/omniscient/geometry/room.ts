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

import type { MAT } from '../art/palette.js';

export interface RoomPart {
  name: string;
  geometry: THREE.BufferGeometry;
  material: keyof typeof MAT;
}

/**
 * The machine sits on a desk against a wall, with the shallow clutter of somewhere
 * that has been used for years: a mug, a stack of paper, a small plant, cable runs.
 */
export function createWorkstationRoom(): RoomPart[] {
  const rng = createRng(seedFrom('omniscient-room'));
  const parts: RoomPart[] = [];

  // -- Big shapes ----------------------------------------------------------
  const floor = new THREE.BoxGeometry(7, 0.1, 5);
  floor.translate(0, -0.06, -0.6);
  parts.push({ name: 'RoomFloor', geometry: floor, material: 'ground' });

  const wall = new THREE.BoxGeometry(7, 3.4, 0.16);
  wall.translate(0, 1.7, -2.1);
  parts.push({ name: 'RoomWall', geometry: wall, material: 'wall' });

  // Side wall, so the room has a corner. One corner is enough to read as interior;
  // §186 wants the big shapes doing the work.
  const sideWall = new THREE.BoxGeometry(0.16, 3.4, 4.2);
  sideWall.translate(-2.6, 1.7, -0.1);
  parts.push({ name: 'RoomSideWall', geometry: sideWall, material: 'wall' });

  // Desk. The CRT sits at y=0, so the desk top is just below it.
  const deskPieces: THREE.BufferGeometry[] = [];
  const top = new THREE.BoxGeometry(3.2, 0.07, 1.05);
  top.translate(0, -0.035, -0.55);
  deskPieces.push(top);

  const apron = new THREE.BoxGeometry(3.0, 0.13, 0.05);
  apron.translate(0, -0.13, -0.07);
  deskPieces.push(apron);
  parts.push({
    name: 'Desk',
    geometry: mergeGeometries(deskPieces, false) ?? top,
    material: 'timber',
  });

  const legs: THREE.BufferGeometry[] = [];
  for (let sx = -1; sx <= 1; sx += 2) {
    for (let sz = -1; sz <= 1; sz += 2) {
      const leg = new THREE.BoxGeometry(0.08, 0.78, 0.08);
      leg.translate(sx * 1.45, -0.46, -0.55 + sz * 0.42);
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
  parts.push({ name: 'Papers', geometry: stack, material: 'clean' });

  // A plant. §12 asks for environmental life, and §5's Overgrown reading is helped by
  // one small real living thing next to a machine growing a digital one.
  const pot = new THREE.CylinderGeometry(0.07, 0.055, 0.11, 8);
  pot.translate(-1.28, 0.055, -0.62);
  parts.push({ name: 'PlantPot', geometry: pot, material: 'timber' });

  const leaves: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const leaf = new THREE.BoxGeometry(0.015, range(rng, 0.12, 0.26), 0.05);
    leaf.translate(jitter(rng, 0.05), 0.16, jitter(rng, 0.04));
    leaf.rotateZ(jitter(rng, 0.7));
    leaf.rotateY(range(rng, 0, Math.PI));
    leaves.push(leaf);
  }
  const foliage = mergeGeometries(leaves, false) ?? leaves[0];
  foliage.translate(-1.28, 0.06, -0.62);
  parts.push({ name: 'Plant', geometry: foliage, material: 'corroded' });

  // Cable runs from the machine down the back of the desk. Accumulated infrastructure
  // (§186) at the smallest possible scale.
  const cables: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const drop = new THREE.BoxGeometry(0.018, range(rng, 0.5, 0.85), 0.018);
    drop.translate(-0.3 + i * 0.22 + jitter(rng, 0.03), -0.35, -1.0 + jitter(rng, 0.05));
    drop.rotateZ(jitter(rng, 0.09));
    cables.push(drop);
  }
  parts.push({
    name: 'Cables',
    geometry: mergeGeometries(cables, false) ?? cables[0],
    material: 'dark',
  });

  // Notes pinned to the wall, clustered just above the desk where somebody would
  // actually put them - scattered across the whole wall they read as floating paper.
  const notes: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const note = new THREE.BoxGeometry(range(rng, 0.15, 0.22), range(rng, 0.13, 0.19), 0.005);
    note.rotateZ(jitter(rng, 0.16));
    note.translate(
      -0.72 + i * 0.36 + jitter(rng, 0.05),
      range(rng, 0.62, 1.02),
      // Flush against the wall face at z = -2.1 + 0.08.
      -2.015
    );
    notes.push(note);
  }
  parts.push({
    name: 'Notes',
    geometry: mergeGeometries(notes, false) ?? notes[0],
    material: 'clean',
  });

  return parts;
}
