import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import type { WarehouseSaveData } from './persistence.js';

function archivalPrint(save: WarehouseSaveData): THREE.MeshBasicMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 320;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = '#d7d0b5';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#182622';
    context.fillRect(24, 24, 464, 205);
    context.strokeStyle = '#66877e';
    context.lineWidth = 9;
    for (let aisle = 0; aisle < 8; aisle++) {
      const x = 58 + aisle * 52;
      context.beginPath();
      context.moveTo(x, 205);
      context.lineTo(246 + (x - 246) * 0.36, 61);
      context.stroke();
    }
    context.fillStyle = '#a64a43';
    context.beginPath();
    context.arc(344, 105, 11, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#17221f';
    context.font = 'bold 25px monospace';
    context.fillText('WAREHOUSE 07 // ARCHIVE', 25, 266);
    context.font = '17px monospace';
    context.fillText(`${save.bestRank}  //  STAGE ${String(save.highestStage).padStart(2, '0')}`, 25, 294);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: texture });
}

/** Physical postgame receipts. Everything is generated at runtime from the archive. */
export function createWarehouseArchiveDisplay(save: WarehouseSaveData): ENGINE.SceneNode {
  const root = ENGINE.SceneNode.create({ name: 'Warehouse07ArchiveDisplay' });
  const photograph = ENGINE.MeshNode.create({
    name: 'Warehouse07Photograph',
    geometry: new THREE.PlaneGeometry(0.42, 0.26),
    material: archivalPrint(save),
  });
  photograph.position.set(0.52, 0.65, -0.81);
  photograph.rotation.set(-0.18, -0.08, 0.035);
  const trayMaterial = new THREE.MeshStandardMaterial({ color: '#26302e', roughness: 0.62, metalness: 0.48 });
  const tray = ENGINE.MeshNode.create({
    name: 'FragmentTray',
    geometry: new THREE.CylinderGeometry(0.2, 0.23, 0.05, 12),
    material: trayMaterial,
    position: new THREE.Vector3(0.62, 0.055, -0.42),
  });
  const glass = ENGINE.MeshNode.create({
    name: 'SealedFragmentGlass',
    geometry: new THREE.CylinderGeometry(0.12, 0.12, 0.31, 14, 1, true),
    material: new THREE.MeshPhysicalMaterial({
      color: '#7fa69c',
      transparent: true,
      opacity: 0.24,
      roughness: 0.08,
      metalness: 0,
      side: THREE.DoubleSide,
    }),
    position: new THREE.Vector3(0.62, 0.23, -0.42),
  });
  const fragment = ENGINE.MeshNode.create({
    name: 'UnidentifiedFragment',
    geometry: new THREE.IcosahedronGeometry(0.075, 0),
    material: new THREE.MeshStandardMaterial({
      color: '#3a1919',
      emissive: '#7b2428',
      emissiveIntensity: 1.15,
      roughness: 0.33,
      metalness: 0.45,
    }),
    position: new THREE.Vector3(0.62, 0.19, -0.42),
  });
  root.add(photograph, tray, glass, fragment);
  return root;
}
