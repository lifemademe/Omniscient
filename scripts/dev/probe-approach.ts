/**
 * Where does each piece of door dressing actually land in the feed?
 *
 * The approach outside the three service doors is authored in the door's own local space and
 * watched by a camera defined in world space, and the two disagree about which way is "away":
 * larger local z is CLOSER to the lens, not further. That cost two placements to learn by
 * capture, so this settles it by arithmetic instead - the same projection as
 * `scripts/warehouse-cameras.ts`, aimed at the props rather than at the visitor.
 *
 * Prints, per door, the screen position of every dressed object, whether it is on frame,
 * whether it is behind the console panel, and how far it is from the lens. A prop reported at
 * x below 0.05 or above 0.95 is falling off the edge; one under two metres is in the player's
 * face.
 *
 *     npx tsx scripts/dev/probe-approach.ts
 */
import * as THREE from 'three';

import { WAREHOUSE_DOORS, WAREHOUSE_DOOR_IDS } from '../../src/omniscient/warehouse/WarehouseServiceDoors.js';

/** The console panel covers the right of every warehouse view. */
const PANEL_LEFT = 0.645;

/**
 * The outer face of the cladding, in door-local z, and the width of the hole in it.
 *
 * The shell walls are 0.35m thick and every door root sits 0.17m inside the wall line, so
 * anything on solid cladding at z below 0.345 is INSIDE the building and renders as nothing.
 * Within the 2.94m door frame there is no cladding, so hardware there is exempt - which is
 * precisely what hid the fault: the leaf, the reader and the notice plate all sit at a
 * similar z and all draw, while the two letter plates out on the wall did not.
 */
const WALL_FACE_Z = 0.345;
const FRAME_HALF_WIDTH = 1.47;

/** Local-space anchors, named for what a critique would call them. */
const PROPS: Array<[string, THREE.Vector3]> = [
  ['door centre', new THREE.Vector3(0, 1.1, 0.2)],
  ['door head', new THREE.Vector3(0, 2.3, 0.2)],
  ['reader', new THREE.Vector3(0.95, 1.15, 0.24)],
  ['notice plate', new THREE.Vector3(1.2, 1.78, 0.23)],
  ['junction box', new THREE.Vector3(1.52, 2.15, 0.435)],
  ['downpipe mid', new THREE.Vector3(2.35, 1.75, 0.455)],
  ['downpipe top', new THREE.Vector3(2.35, 3.45, 0.455)],
  ['wall pack', new THREE.Vector3(1.68, 3.0, 0.515)],
  ['bin', new THREE.Vector3(2.05, 0.5, 2.25)],
  ['cable drum', new THREE.Vector3(2.35, 0.52, 1.2)],
  ['crate stack', new THREE.Vector3(-2.6, 0.55, 1.6)],
  ['leaning pallets', new THREE.Vector3(-2.35, 0.6, 0.62)],
  ['bollard left', new THREE.Vector3(-1.8, 0.52, 2.75)],
  ['bollard right', new THREE.Vector3(1.8, 0.52, 2.75)],
  ['extract louvre', new THREE.Vector3(-2.55, 2.92, 0.415)],
  ['door letter', new THREE.Vector3(-2.16, 2.36, 0.395)],
  /* Deliberately off frame: the fascia board is for a person at the door, not the camera -
     which is exactly why the letter plate below it exists. Listed so it stays deliberate. */
  ['high sign (expect off)', new THREE.Vector3(0, 4.45, 0.16)],
  ['canopy edge', new THREE.Vector3(0, 3.55, 2.47)],
  ['upper wall centre', new THREE.Vector3(-0.6, 3.1, 0.2)],
];

function project(cam: THREE.Vector3, tgt: THREE.Vector3, fov: number, point: THREE.Vector3, aspect = 16 / 9) {
  const view = new THREE.Matrix4().lookAt(cam, tgt, new THREE.Vector3(0, 1, 0));
  const basis = new THREE.Matrix4().makeBasis(
    new THREE.Vector3().setFromMatrixColumn(view, 0),
    new THREE.Vector3().setFromMatrixColumn(view, 1),
    new THREE.Vector3().setFromMatrixColumn(view, 2)
  );
  const l = point.clone().sub(cam).applyMatrix4(basis.clone().invert());
  const d = -l.z;
  const hH = Math.tan((fov * Math.PI) / 360);
  return { x: 0.5 + l.x / d / (hH * aspect) / 2, y: 0.5 - l.y / d / hH / 2, d };
}

for (const id of WAREHOUSE_DOOR_IDS) {
  const door = WAREHOUSE_DOORS[id];
  const { position: cam, target: tgt, fov } = door.camera;
  console.log(`\n=== ${id} (root ${door.rootPosition.toArray().map((n) => n.toFixed(1)).join(', ')}, rot ${(door.rootRotation * 180 / Math.PI).toFixed(0)}deg) ===`);
  const visitor = project(cam, tgt, fov, door.visitorPosition.clone().setY(1.2));
  console.log(`  visitor            x ${visitor.x.toFixed(3)}  y ${visitor.y.toFixed(3)}  ${visitor.d.toFixed(2)}m`);
  for (const [name, local] of PROPS) {
    const world = local.clone().applyEuler(new THREE.Euler(0, door.rootRotation, 0)).add(door.rootPosition);
    const s = project(cam, tgt, fov, world);
    let state = 'ok';
    if (Math.abs(local.x) > FRAME_HALF_WIDTH && local.z < WALL_FACE_Z) state = 'BURIED IN THE CLADDING';
    else if (s.d <= 0) state = 'BEHIND THE LENS';
    else if (s.x < 0 || s.x > 1 || s.y < 0 || s.y > 1) state = 'OFF FRAME';
    else if (s.x < 0.05 || s.x > 0.95 || s.y < 0.05 || s.y > 0.95) state = 'clipped at the edge';
    else if (s.x > PANEL_LEFT) state = 'behind the panel';
    if (s.d > 0 && s.d < 2) state += ' // IN YOUR FACE';
    console.log(`  ${name.padEnd(18)} x ${s.x.toFixed(3)}  y ${s.y.toFixed(3)}  ${s.d.toFixed(2)}m  ${state}`);
  }
}
