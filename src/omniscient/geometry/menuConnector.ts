import * as THREE from 'three';

import type { ModulePart } from './modules.js';

/** Shared finished-scale dimensions: the rectangular plug and its socket must fit. */
export const CONNECTOR = { width: 0.032, height: 0.016, tail: 0.094, approach: 0.10 } as const;

/** Nose at local origin, insertion along -Z; the grip and cable extend back along +Z. */
export function createMenuPlug(): ModulePart[] {
  const parts: ModulePart[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, material: ModulePart['material']): void => {
    parts.push({ geometry: new THREE.BoxGeometry(w, h, d).translate(x, y, z), material });
  };
  box(0.048, 0.030, 0.046, 0, 0, 0.050, 'dark');
  box(CONNECTOR.width, CONNECTOR.height, 0.027, 0, 0, 0.0135, 'equipment');
  // Dark end/tongue and two retention marks keep the metal tip from reading as a bead.
  box(0.026, 0.009, 0.001, 0, 0, -0.0006, 'dark');
  for (const x of [-0.008, 0.008]) box(0.006, 0.001, 0.007, x, 0.0085, 0.011, 'dark');
  // One small status inset, not a luminous housing.
  box(0.009, 0.0015, 0.011, 0, 0.016, 0.045, 'knowledgeLamp');
  for (let i = 0; i < 3; i++) {
    box(0.019 - i * 0.002, 0.019 - i * 0.002, 0.006, 0, 0, 0.077 + i * 0.007, 'dark');
  }
  return parts;
}

/** Four metal lips frame a dark rectangular recess; origin is the insertion plane. */
export function createMenuSocket(): ModulePart[] {
  const parts: ModulePart[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, material: ModulePart['material']): void => {
    parts.push({ geometry: new THREE.BoxGeometry(w, h, d).translate(x, y, z), material });
  };
  box(0.042, 0.026, 0.003, 0, 0, -0.003, 'dark');
  for (const y of [-0.013, 0.013]) box(0.048, 0.004, 0.012, 0, y, 0.004, 'equipment');
  for (const x of [-0.022, 0.022]) box(0.004, 0.026, 0.012, x, 0, 0.004, 'equipment');
  return parts;
}
