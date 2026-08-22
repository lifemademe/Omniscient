/**
 * Where does Dorin's porch land on screen?
 *
 * The sibling of probe-shop, for mission 06. Written because a review of a capture put the
 * contact at screen x 0.27 and the arithmetic says otherwise - and when those two disagree
 * one of them is a misread, which is worth settling before anybody moves a camera.
 *
 *     npx tsx scripts/dev/probe-door.ts
 */
import * as THREE from 'three';

const SHOTS: Record<string, [THREE.Vector3, THREE.Vector3]> = {
  default: [new THREE.Vector3(-1.55, 1.72, 4.2), new THREE.Vector3(0.42, 1.25, -0.26)],
  lock: [new THREE.Vector3(-0.1, 1.12, 1.05), new THREE.Vector3(0.2, 1.0, -0.22)],
};
const FOV = 46;
/** The console panel's left edge, as a fraction of width - measured off the capture. */
const PANEL_LEFT = 0.645;

function at(shot: string, p: THREE.Vector3, aspect = 16 / 9) {
  const [cam, tgt] = SHOTS[shot];
  const view = new THREE.Matrix4().lookAt(cam, tgt, new THREE.Vector3(0, 1, 0));
  const basis = new THREE.Matrix4().makeBasis(
    new THREE.Vector3().setFromMatrixColumn(view, 0),
    new THREE.Vector3().setFromMatrixColumn(view, 1),
    new THREE.Vector3().setFromMatrixColumn(view, 2)
  );
  const l = p.clone().sub(cam).applyMatrix4(basis.clone().invert());
  const d = -l.z;
  const hH = Math.tan((FOV * Math.PI) / 360);
  return { x: 0.5 + l.x / d / (hH * aspect) / 2, y: 0.5 - l.y / d / hH / 2, d };
}

const DOOR_X = Number(process.argv[2] ?? 0);
const POINTS: Array<[string, THREE.Vector3]> = [
  ['Dorin head', new THREE.Vector3(0.62, 1.7, 0.62)],
  ['Dorin chest', new THREE.Vector3(0.62, 1.35, 0.62)],
  ['Dorin feet', new THREE.Vector3(0.62, 0.05, 0.62)],
  ['the lock', new THREE.Vector3(DOOR_X + 0.34, 1.0, -0.2)],
  ['door centre', new THREE.Vector3(DOOR_X, 1.0, -0.22)],
  ['door head', new THREE.Vector3(DOOR_X, 2.02, -0.22)],
  ['porch bulb', new THREE.Vector3(DOOR_X, 2.42, -0.13)],
];

for (const shot of Object.keys(SHOTS)) {
  for (const aspect of [16 / 9, 4 / 3]) {
    console.log(`\n=== ${shot} at ${aspect.toFixed(2)} ===`);
    for (const [name, p] of POINTS) {
      const s = at(shot, p, aspect);
      const on = s.d > 0 && s.x > 0 && s.x < 1 && s.y > 0 && s.y < 1;
      const state = on ? (s.x < PANEL_LEFT ? 'VISIBLE' : 'BEHIND THE PANEL') : 'off frame';
      console.log(`  ${name.padEnd(13)} x ${s.x.toFixed(3)}  y ${s.y.toFixed(3)}  ${s.d.toFixed(2)}m  ${state}`);
    }
  }
}
