import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { decorMesh } from '../art/mesh.js';
import { MAT } from '../art/palette.js';

/** A few domestic shapes, subordinate to the person and the lock. */
export function dressDoorstep(hall: ENGINE.SceneNode, window: ENGINE.SceneNode): void {
  const runner = decorMesh('HallRunner', new THREE.BoxGeometry(0.52, 0.006, 1.35),
    new THREE.MeshStandardMaterial({ color: '#534437', roughness: 1 }));
  runner.position.set(-0.15, 0.15, -1.3);
  hall.add(runner);

  // A small family photograph on the wall beside the stairs, not another luminous panel.
  const photograph = ENGINE.SceneNode.create({ name: 'FamilyPhotograph' });
  photograph.position.set(0.638, 1.52, -1.75);
  photograph.rotation.y = -Math.PI / 2;
  photograph.add(decorMesh('Frame', new THREE.BoxGeometry(0.34, 0.42, 0.025), MAT.timberDark));
  const paper = decorMesh('PhotographPaper', new THREE.PlaneGeometry(0.28, 0.36),
    new THREE.MeshStandardMaterial({ color: '#b29d78', roughness: 1 }));
  paper.position.z = 0.014;
  photograph.add(paper);
  for (const [x, y, size] of [[-0.06, 0.035, 1], [0.055, -0.005, 0.8]]) {
    const head = decorMesh('PortraitHead', new THREE.CircleGeometry(0.035 * size, 6), MAT.timberDark);
    head.position.set(x, y + 0.04, 0.016);
    photograph.add(head);
    const body = decorMesh('PortraitCoat', new THREE.PlaneGeometry(0.075 * size, 0.13 * size), MAT.timberDark);
    body.position.set(x, y - 0.05, 0.016);
    photograph.add(body);
  }
  hall.add(photograph);

  const sill = decorMesh('LandingSill', new THREE.BoxGeometry(1.04, 0.05, 0.19), MAT.timberDark);
  sill.position.set(0.42, 2.93, -0.2);
  window.add(sill);
  const mullion = decorMesh('LandingMullion', new THREE.BoxGeometry(0.035, 1.04, 0.025), MAT.timberDark);
  mullion.position.set(0.42, 3.5, -0.215);
  window.add(mullion);
  // Open curtains leave the lit centre visible; shallow folds retain crisp facets.
  const curtainMaterial = new THREE.MeshStandardMaterial({ color: '#b6aa8c', roughness: 1 });
  for (const side of [-1, 1]) {
    for (let fold = 0; fold < 3; fold++) {
      const curtain = decorMesh('LandingCurtain', new THREE.BoxGeometry(0.042, 0.98, 0.025), curtainMaterial);
      curtain.position.set(0.42 + side * (0.275 + fold * 0.035), 3.5, -0.195 + fold % 2 * 0.012);
      window.add(curtain);
    }
  }
}
