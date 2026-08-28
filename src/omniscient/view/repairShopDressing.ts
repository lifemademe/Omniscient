import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { decorMesh } from '../art/mesh.js';
import { MAT } from '../art/palette.js';
import { createDecal, decalMaterial } from '../art/surface.js';
import { createTransmitter } from '../geometry/props.js';

import type { ContactScene } from './ContactScene.js';

/** Working stock and a service book, kept above the shop's recurring flood level. */
export function dressRepairShop(scene: ContactScene): void {
  const stock = ENGINE.SceneNode.create({ name: 'RepairStock' });
  for (const [x, y, turn, scale] of [
    [-2.35, 0.525, Math.PI + 0.16, 0.82],
    [-1.96, 1.045, -0.08, 0.9],
  ] as const) {
    const parts = createTransmitter({ seed: `salvage-${y}` });
    const radio = ENGINE.SceneNode.create({
      name: 'SalvagedSet',
      position: new THREE.Vector3(x, y, -1.4),
      rotation: new THREE.Euler(0, turn, 0),
      scale: new THREE.Vector3(scale, scale, scale),
    });
    radio.add(decorMesh('SalvageCase', parts.body, MAT.equipmentBack));
    radio.add(decorMesh('SalvageControls', parts.fittings, MAT.metal));
    if (parts.recesses) radio.add(decorMesh('SalvageVents', parts.recesses, MAT.slot));
    if (parts.chassis) radio.add(decorMesh('SalvageChassis', parts.chassis, MAT.equipmentBack));
    stock.add(radio);
  }
  const bin = decorMesh('PartsBin', new THREE.BoxGeometry(0.38, 0.22, 0.28), MAT.timberDark);
  bin.position.set(-2.22, 1.67, -1.4);
  stock.add(bin);
  for (let i = 0; i < 2; i++) {
    const spool = decorMesh('CableSpool', new THREE.TorusGeometry(0.07, 0.018, 5, 12), MAT.dark);
    spool.position.set(-2.31 + i * 0.16, 1.79, -1.39);
    stock.add(spool);
  }
  // Parts are sorted by use, not repeated shipping crates: loose valves and a donor case.
  for (let i = 0; i < 3; i++) {
    const valve = decorMesh('SpareValve', new THREE.CylinderGeometry(0.026, 0.03, 0.105, 6), MAT.metal);
    valve.position.set(-2.62 + i * 0.085, 1.047, -1.35);
    stock.add(valve);
  }
  const donorCase = decorMesh('DonorCase', new THREE.BoxGeometry(0.14, 0.31, 0.27), MAT.equipmentBack);
  donorCase.position.set(-2.6, 0.595, -1.42);
  donorCase.rotation.z = -0.12;
  stock.add(donorCase);
  scene.registerProp('shelf-crates', stock);

  // Tool-placement ghosts and local abrasion break the pristine pegboard without noise.
  const boardWear = createDecal(512, 256, (ctx) => {
    ctx.fillStyle = 'rgba(36,35,28,0.24)';
    ctx.fillRect(17, 64, 166, 3);
    ctx.fillRect(38, 125, 70, 5);
    ctx.fillRect(204, 209, 94, 3);
    ctx.fillRect(282, 65, 3, 128);
    ctx.fillStyle = 'rgba(113,103,81,0.3)';
    ctx.fillRect(260, 2, 3, 252);
    ctx.strokeStyle = 'rgba(39,38,30,0.38)';
    ctx.lineWidth = 3;
    ctx.strokeRect(194, 44, 16, 62);
    ctx.strokeRect(221, 61, 12, 49);
    ctx.fillStyle = 'rgba(45,37,27,0.28)';
    for (const [x, y] of [[28, 72], [58, 84], [89, 72], [125, 87], [154, 75]]) {
      ctx.fillRect(x, y, 9, 22);
      ctx.fillRect(x - 3, y + 16, 15, 6);
    }
  });
  if (boardWear) {
    boardWear.magFilter = THREE.NearestFilter;
    const marks = decorMesh('PegboardWorkMarks', new THREE.PlaneGeometry(3.4, 1.6), decalMaterial(boardWear, 1));
    marks.position.set(-0.1, 1.62, -1.787);
    scene.registerProp('pegboard-work-marks', marks);
  }

  // Discrete solder burns, tool scars and board joints: history, not an all-over noise map.
  const wear = createDecal(512, 192, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(43,37,29,0.5)';
    for (const y of [63, 130]) ctx.fillRect(0, y, w, 2);
    for (const [x, y, width, height] of [
      [177, 88, 57, 22], [213, 133, 29, 12], [321, 90, 30, 18], [84, 158, 23, 7],
    ]) {
      ctx.beginPath();
      ctx.moveTo(x, y + 3);
      ctx.lineTo(x + width * 0.6, y);
      ctx.lineTo(x + width, y + height * 0.45);
      ctx.lineTo(x + width * 0.8, y + height);
      ctx.lineTo(x + 5, y + height * 0.7);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(55,49,38,0.65)';
    for (let i = 0; i < 12; i++) {
      ctx.fillRect(164 + (i * 31) % 112, 68 + (i * 17) % 89, 5 + i % 7, 2);
    }
    ctx.fillStyle = 'rgba(175,147,106,0.7)';
    for (const x of [20, 69, 132, 221, 398, 464]) ctx.fillRect(x, h - 5, 15, 5);
  });
  if (wear) {
    wear.magFilter = THREE.NearestFilter;
    const top = decorMesh('BenchWorkScars', new THREE.PlaneGeometry(2.38, 0.88), decalMaterial(wear, 1));
    top.rotation.x = -Math.PI / 2;
    top.position.set(0, 0.811, -0.5);
    scene.registerProp('bench-work-scars', top);
  }
  const floodWitness = ENGINE.SceneNode.create({ name: 'FurnitureFloodWitness' });
  for (const x of [-1.1, 1.1]) {
    const band = decorMesh('LegSilt', new THREE.PlaneGeometry(0.079, 0.025), MAT.tideStain);
    band.position.set(x, 0.255, -0.109);
    floodWitness.add(band);
  }
  scene.registerProp('furniture-flood-witness', floodWitness);

  const record = createDecal(256, 192, (ctx, w, h) => {
    ctx.fillStyle = '#95876b';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#393d35';
    ctx.font = 'bold 23px "Courier New", monospace';
    ctx.fillText('M. VASC', 16, 30);
    ctx.font = '14px "Courier New", monospace';
    ctx.fillText('SERVICE / PORTU VECH', 16, 51);
    ctx.fillStyle = '#626c62';
    for (let y = 70; y < h - 14; y += 22) ctx.fillRect(14, y, w - 28, 2);
    ctx.fillRect(58, 61, 2, h - 72);
    ctx.fillStyle = '#3a413d';
    for (let row = 0; row < 5; row++) {
      ctx.fillRect(20, 61 + row * 22, 24, 4);
      ctx.fillRect(69, 60 + row * 22, 57 + (row % 3) * 19, 4);
      ctx.fillRect(74, 65 + row * 22, 80 - (row % 2) * 25, 2);
    }
    // A repaired binding and uneven worn edge, not a fresh white UI panel.
    ctx.fillStyle = '#655b45';
    ctx.fillRect(0, 0, 7, h);
    ctx.fillRect(193, 4, 42, 10);
  });
  if (!record) return;
  record.magFilter = THREE.NearestFilter;
  const book = ENGINE.SceneNode.create({
    name: 'ServiceLedger',
    position: new THREE.Vector3(-0.81, 0.818, -0.48),
    rotation: new THREE.Euler(0, -0.18, 0),
  });
  book.add(decorMesh('LedgerBinding', new THREE.BoxGeometry(0.35, 0.012, 0.27), MAT.timberDark));
  const recordMaterial = decalMaterial(record, 1);
  recordMaterial.color.set('#918879');
  const page = decorMesh('ServiceRecord', new THREE.PlaneGeometry(0.33, 0.25), recordMaterial);
  page.rotation.x = -Math.PI / 2;
  page.position.y = 0.008;
  book.add(page);
  scene.registerProp('service-ledger', book);

  const docket = decorMesh('PinnedServiceRecord', new THREE.PlaneGeometry(0.29, 0.22), decalMaterial(record, 1));
  docket.position.set(-0.12, 1.55, -1.784);
  docket.rotation.z = -0.06;
  scene.registerProp('service-docket', docket);
}
