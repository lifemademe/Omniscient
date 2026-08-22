/**
 * Where does a point in Mirela's shop land on screen?
 *
 * A sibling of `aim.ts`, which answers the same question for one moment of one beat. This one
 * is for DRESSING: it takes any world point and prints where it falls in each of the shop's
 * registered shots, at three aspect ratios, with the console panel's left edge marked.
 *
 * It exists because the left wall of that room was dressed by eye once and the result was a
 * cable drum - a properly built one - standing entirely outside the frame at every window
 * shape the game can be played at. The visible stretch of that wall turns out to run from
 * z -1.85 to about z +0.1 and no further, which is not a thing anybody was going to guess.
 *
 * Aspect matters and is the non-obvious half. The vertical FOV is fixed, so screen Y is the
 * same on every window; screen X is not. A narrow window spreads content away from centre,
 * so anything near the left edge on 16:9 is off it on 4:3.
 *
 *     npx tsx scripts/dev/probe-shop.ts
 */

import * as THREE from 'three';

/** Both shots as registered in `buildRepairShop`. Keep in step if either moves. */
const SHOTS: Record<string, [THREE.Vector3, THREE.Vector3]> = {
  default: [new THREE.Vector3(1.32, 1.46, 1.82), new THREE.Vector3(-0.34, 1.06, -0.72)],
  'workshop-floor': [new THREE.Vector3(-1.45, 0.6, 0.25), new THREE.Vector3(-2.15, 0.24, -1.35)],
};
const FOV = 46;
/** The console panel's left edge, as a fraction of width - measured off a capture. */
const PANEL_LEFT = 0.645;

function project(shot: string, p: THREE.Vector3, aspect: number): { x: number; y: number; d: number } {
  const [cam, tgt] = SHOTS[shot];
  const view = new THREE.Matrix4().lookAt(cam, tgt, new THREE.Vector3(0, 1, 0));
  const basis = new THREE.Matrix4().makeBasis(
    new THREE.Vector3().setFromMatrixColumn(view, 0),
    new THREE.Vector3().setFromMatrixColumn(view, 1),
    new THREE.Vector3().setFromMatrixColumn(view, 2)
  );
  const local = p.clone().sub(cam).applyMatrix4(basis.clone().invert());
  const d = -local.z;
  const halfH = Math.tan((FOV * Math.PI) / 360);
  return { x: 0.5 + local.x / d / (halfH * aspect) / 2, y: 0.5 - local.y / d / halfH / 2, d };
}

/** What is actually in the room, as shipped. */
const POINTS: Array<[string, THREE.Vector3]> = [
  ['tube far end', new THREE.Vector3(-2.93, 2.2, -1.76)],
  ['tube near end', new THREE.Vector3(-2.93, 2.2, -0.46)],
  ['coil nail', new THREE.Vector3(-2.98, 1.62, -0.95)],
  ['coil bottom', new THREE.Vector3(-2.98, 1.22, -0.95)],
  ['compressor motor', new THREE.Vector3(-2.72, 0.49, -0.43)],
  ['compressor tank', new THREE.Vector3(-2.72, 0.2, -0.35)],
  ['tins', new THREE.Vector3(-2.46, 0.07, -0.6)],
  ['tin in the water', new THREE.Vector3(-2.3, 0.06, -1.02)],
  ['puddle centre', new THREE.Vector3(-2.42, 0.006, -1.17)],
  ['mirela head', new THREE.Vector3(-0.72, 1.55, -1.14)],
  ['the radio', new THREE.Vector3(-0.1, 0.92, -0.55)],
];

for (const shot of Object.keys(SHOTS)) {
  for (const aspect of [16 / 9, 4 / 3]) {
    console.log(`\n=== ${shot} at ${aspect.toFixed(2)} ===`);
    for (const [name, p] of POINTS) {
      const s = project(shot, p, aspect);
      const onFrame = s.d > 0 && s.x > 0 && s.x < 1 && s.y > 0 && s.y < 1;
      const state = onFrame ? (s.x < PANEL_LEFT ? 'VISIBLE' : 'behind the panel') : 'off frame';
      console.log(
        `  ${name.padEnd(18)} x ${s.x.toFixed(3)}  y ${s.y.toFixed(3)}  ${s.d.toFixed(2)}m  ${state}`
      );
    }
  }
}
