import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { decorMesh } from '../art/mesh.js';
import { MAT } from '../art/palette.js';
import { createDecal, decalMaterial } from '../art/surface.js';

import type { ContactScene } from './ContactScene.js';

/** A school caretaker's storage, and water contacts tied to the actual sump footprint. */
export function dressSchoolCellar(scene: ContactScene, waterLevel: number): ENGINE.SceneNode {
  const school = ENGINE.SceneNode.create({ name: 'SchoolStore' });
  const notice = decorMesh('MaintenanceBoard', new THREE.BoxGeometry(0.82, 0.64, 0.025), MAT.timberDark);
  notice.position.set(-2.5, 1.52, -2.09);
  school.add(notice);
  const texture = createDecal(192, 144, (ctx, width, height) => {
    ctx.fillStyle = '#a49b7b';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#34392f';
    ctx.font = 'bold 22px monospace';
    ctx.fillText('IARNA SCHOOL', 9, 29);
    ctx.font = 'bold 15px monospace';
    ctx.fillText('CELLAR / PUMP', 9, 52);
    ctx.fillRect(9, 61, 174, 2);
    ctx.font = '12px monospace';
    ctx.fillText('SPRING INSPECTION', 9, 82);
    ctx.fillText('KEEP BOOKS ABOVE', 9, 106);
    ctx.fillText('THE FLOOD MARK', 9, 124);
    ctx.clearRect(0, height - 5, 8, 5);
  });
  if (texture) {
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    const paper = decorMesh('SchoolNotice', new THREE.PlaneGeometry(0.76, 0.57), decalMaterial(texture));
    paper.position.set(-2.5, 1.52, -2.072);
    school.add(paper);
  }

  // Child-size chair backs and seats distinguish stored classroom furniture from lumber.
  const timber: THREE.BufferGeometry[] = [];
  const steel: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 2; i++) {
    const x = -2.76 + i * 0.12;
    const z = -0.55 - i * 0.16;
    const lift = i * 0.15;
    const seat = new THREE.BoxGeometry(0.42, 0.035, 0.42);
    seat.translate(x, 0.46 + lift, z);
    timber.push(seat);
    const back = new THREE.BoxGeometry(0.42, 0.23, 0.035);
    back.translate(x, 0.77 + lift, z - 0.18);
    timber.push(back);
    for (const dx of [-0.17, 0.17]) {
      for (const dz of [-0.17, 0.17]) {
        const length = dz < 0 ? 0.86 : 0.44;
        const leg = new THREE.BoxGeometry(0.025, length, 0.025);
        leg.translate(x + dx, length / 2 + lift, z + dz);
        steel.push(leg);
      }
    }
  }
  school.add(decorMesh('ClassroomSeats', mergeGeometries(timber, false) ?? timber[0], MAT.timber));
  school.add(decorMesh('ClassroomFrames', mergeGeometries(steel, false) ?? steel[0], MAT.steel));
  scene.registerProp('school-store', school);

  const contacts = ENGINE.SceneNode.create({ name: 'FloodContacts' });
  const contactMaterial = new THREE.MeshBasicMaterial({
    color: '#5b7471', transparent: true, opacity: 0.3, depthWrite: false,
  });
  // Sump is an upright radius-.34 cylinder centred at (-2.6, -1.5), not a guessed ring.
  const sumpLip = new THREE.RingGeometry(0.341, 0.353, 24);
  sumpLip.rotateX(-Math.PI / 2);
  sumpLip.translate(-2.6, waterLevel + 0.003, -1.5);
  contacts.add(decorMesh('SumpMeniscus', sumpLip, contactMaterial));
  // Small, interrupted strips at the wall/water contact, separate from historical stains.
  for (let i = 0; i < 15; i++) {
    const strip = new THREE.PlaneGeometry(0.29 + (i % 3) * 0.04, 0.016);
    strip.rotateX(-Math.PI / 2);
    strip.translate(-3.1 + i * 0.42, waterLevel + 0.003, -2.096);
    contacts.add(decorMesh('WallMeniscus', strip, contactMaterial));
  }
  contacts.traverse((object) => { object.userData.noWaterline = true; });
  scene.registerProp('flood-contacts', contacts);
  return contacts;
}
