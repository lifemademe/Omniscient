import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { palletGeometries, PALLET_HEIGHT } from './palletGeometry.js';
import { WAREHOUSE_LAYOUT } from './WarehouseLayout.js';

const PAINT = new THREE.MeshStandardMaterial({ color: '#a47732', roughness: 0.85, metalness: 0.05 });
const CLADDING = new THREE.MeshStandardMaterial({ color: '#46505b', roughness: 0.92, metalness: 0.04 });
const FRAME = new THREE.MeshStandardMaterial({ color: '#26313b', roughness: 0.8, metalness: 0.12 });
const LINER = new THREE.MeshStandardMaterial({ color: '#918977', roughness: 0.92, metalness: 0.02 });
const STEEL = new THREE.MeshStandardMaterial({ color: '#69717a', roughness: 0.74, metalness: 0.2 });
const RUBBER = new THREE.MeshStandardMaterial({ color: '#171c20', roughness: 1 });
const TIMBER = new THREE.MeshStandardMaterial({ color: '#69523a', roughness: 0.97 });
const CARTON = new THREE.MeshStandardMaterial({ color: '#a18a61', roughness: 0.98 });
const TAPE = new THREE.MeshStandardMaterial({ color: '#c2b28d', roughness: 0.95 });
const LENS = new THREE.MeshStandardMaterial({
  color: '#e1cba1', emissive: '#e9b46f', emissiveIntensity: 1.5, roughness: 0.7,
});

function part(
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position = new THREE.Vector3()
): ENGINE.MeshNode {
  return ENGINE.MeshNode.create({ name, geometry, material, position, castShadow: true, receiveShadow: true });
}

function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BoxGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

function merged(root: ENGINE.SceneNode, name: string, pieces: THREE.BufferGeometry[], material: THREE.Material): void {
  if (!pieces.length) return;
  const geometry = mergeGeometries(pieces, false);
  if (geometry) root.add(part(name, geometry, material));
}

/** One loading door and one hollow trailer, sharing the actual wall opening's centreline. */
export function buildWarehouseLoadingBay(): { root: ENGINE.SceneNode; shutter: ENGINE.MeshNode } {
  const { shell, truck, loadingBay: bay } = WAREHOUSE_LAYOUT;
  const root = ENGINE.SceneNode.create({
    name: 'InboundLoadingBay',
    position: new THREE.Vector3(truck.x, 0, shell.rearZ),
  });
  const jamb = bay.width / 2;
  const trim = 0.22;
  const sideWidth = (bay.constructionWidth - bay.width - trim * 2) / 2;
  const infill: THREE.BufferGeometry[] = [];
  const frames: THREE.BufferGeometry[] = [];
  const guards: THREE.BufferGeometry[] = [];
  const seams: THREE.BufferGeometry[] = [];

  // Close the old oversized construction cutout around a truck-sized finished doorway.
  // Nothing spans the aperture: a full rectangular "dock seal" used to hide the cargo.
  for (const side of [-1, 1]) {
    infill.push(box(sideWidth, bay.constructionHeight, 0.36,
      side * (jamb + trim + sideWidth / 2), bay.constructionHeight / 2, 0));
    frames.push(box(trim, bay.height + 0.18, 0.4, side * (jamb + trim / 2), (bay.height + 0.18) / 2, 0.12));
    frames.push(box(0.075, bay.height, 0.24, side * (jamb - 0.04), bay.height / 2, 0.35));
    guards.push(box(0.3, 1.05, 0.46, side * (jamb + 0.16), 0.525, 0.21));
    for (let y = 0.22; y < 1; y += 0.28) {
      seams.push(box(0.31, 0.085, 0.035, side * (jamb + 0.16), y, 0.46));
    }
    for (let x = jamb + 0.85; x < bay.constructionWidth / 2; x += 1.15) {
      seams.push(box(0.025, bay.constructionHeight, 0.03, side * x, bay.constructionHeight / 2, 0.195));
    }
  }
  const headerBottom = bay.height + 0.18;
  infill.push(box(bay.width + trim * 2, bay.constructionHeight - headerBottom, 0.36,
    0, (bay.constructionHeight + headerBottom) / 2, 0));
  frames.push(box(bay.width + 0.65, 0.48, 0.7, 0, bay.height + 0.08, 0.2));
  frames.push(box(bay.width, 0.06, 0.6, 0, 0.01, 0.1));
  merged(root, 'LoadingBayCladding', infill, CLADDING);
  merged(root, 'LoadingBayFrame', frames, FRAME);
  merged(root, 'LoadingBayJambGuards', guards, PAINT);
  merged(root, 'LoadingBaySeams', seams, RUBBER);

  // The whole curtain retracts into the header. Its ribbing and foot rail move with it.
  const curtain: THREE.BufferGeometry[] = [box(bay.width, bay.height, 0.12, 0, -bay.height / 2, 0)];
  for (let y = 0.12; y < bay.height; y += 0.23) {
    curtain.push(box(bay.width, 0.055, 0.06, 0, -y, 0.085));
  }
  curtain.push(box(bay.width, 0.12, 0.21, 0, -bay.height + 0.06, 0.035));
  const shutter = part('RearLoadingDoor', mergeGeometries(curtain, false)!, STEEL,
    new THREE.Vector3(0, bay.height, 0.16));
  root.add(shutter);

  const trailer = ENGINE.SceneNode.create({
    name: 'InboundTruck',
    position: new THREE.Vector3(0, 0, truck.z - shell.rearZ),
  });
  root.add(trailer);
  const half = bay.trailerHalfWidth;
  const deck = bay.trailerDeck;
  const head = deck + bay.trailerHeight;
  const depth = bay.trailerDepth;
  // Flexible dock shelter closes the wall-to-trailer gap without covering its open mouth.
  const shelter: THREE.BufferGeometry[] = [];
  const shelterSide = jamb - half;
  for (const side of [-1, 1]) {
    shelter.push(box(shelterSide, bay.height, 0.24,
      side * (half + shelterSide / 2), bay.height / 2, -0.25));
  }
  shelter.push(box(bay.width, bay.height - head, 0.24,
    0, (bay.height + head) / 2, -0.25));
  merged(root, 'LoadingBayShelter', shelter, RUBBER);
  const skin: THREE.BufferGeometry[] = [];
  const lining: THREE.BufferGeometry[] = [];
  const ribs: THREE.BufferGeometry[] = [];
  const seals: THREE.BufferGeometry[] = [];
  const bed: THREE.BufferGeometry[] = [];
  const cartons: THREE.BufferGeometry[] = [];
  const pallets: THREE.BufferGeometry[] = [];
  const tape: THREE.BufferGeometry[] = [];

  bed.push(box(half * 2, 0.14, depth, 0, deck - 0.07, -depth / 2));
  skin.push(box(half * 2 + 0.24, 0.14, depth, 0, head + 0.07, -depth / 2));
  lining.push(box(half * 2, bay.trailerHeight, 0.14, 0, deck + bay.trailerHeight / 2, -depth));
  for (const side of [-1, 1]) {
    skin.push(box(0.12, bay.trailerHeight, depth, side * (half + 0.06), deck + bay.trailerHeight / 2, -depth / 2));
    lining.push(box(0.025, bay.trailerHeight, depth, side * (half - 0.015), deck + bay.trailerHeight / 2, -depth / 2));
    ribs.push(box(0.1, 0.15, depth, side * half, head - 0.07, -depth / 2));
    ribs.push(box(0.12, 0.28, depth, side * half, deck + 0.14, -depth / 2));
    for (let z = -0.45; z > -depth; z -= 0.78) {
      ribs.push(box(0.065, bay.trailerHeight - 0.28, 0.08, side * (half - 0.045), deck + bay.trailerHeight / 2, z));
    }
    // Seals meet the trailer's real head height, not the height of its side wall alone.
    seals.push(box(0.27, head + 0.14, 0.78, side * (half + 0.27), (head + 0.14) / 2, 0.38));
    seals.push(box(0.35, 0.5, 0.22, side * (half + 0.27), 0.68, 0.9));
    ribs.push(box(0.16, 0.24, depth - 0.2, side * 0.8, 0.9, -depth / 2));
    for (const z of [-4.9, -6.0]) {
      const wheel = part('TruckWheel', new THREE.CylinderGeometry(0.51, 0.51, 0.25, 12), RUBBER,
        new THREE.Vector3(side * 1.12, 0.51, z));
      wheel.rotation.z = Math.PI / 2;
      trailer.add(wheel);
    }
  }
  seals.push(box(half * 2 + 0.82, 0.3, 0.78, 0, head + 0.14, 0.38));
  ribs.push(box(half * 2 + 0.16, 0.25, 0.34, 0, head - 0.09, -0.16));
  ribs.push(box(half * 2 + 0.2, 0.18, 0.23, 0, 0.61, 0.06));

  // An actual continuous dock bridge: raised lip at the trailer, slope down to the slab.
  // Its inner edge ends behind the existing drone boundary and worker routes.
  const bridgeLength = 1.85;
  const bridgeDrop = deck - 0.06;
  const bridge = new THREE.BoxGeometry(half * 2 - 0.12, 0.075, Math.hypot(bridgeLength, bridgeDrop));
  bridge.rotateX(Math.atan2(bridgeDrop, bridgeLength));
  bridge.translate(0, (deck + 0.06) / 2 - 0.035, bridgeLength / 2);
  ribs.push(bridge);
  for (const side of [-1, 1]) {
    const edge = new THREE.BoxGeometry(0.09, 0.06, Math.hypot(bridgeLength, bridgeDrop));
    edge.rotateX(Math.atan2(bridgeDrop, bridgeLength));
    edge.translate(side * (half - 0.08), (deck + 0.06) / 2 + 0.035, bridgeLength / 2);
    skin.push(edge);
  }

  for (const [x, z, height] of [
    [-0.62, -1.35, 1.28], [0.62, -2.2, 0.92], [-0.6, -3.75, 1.12],
    [0.62, -4.7, 1.42], [0, -6.35, 1.15],
  ] as const) {
    const palletTop = deck + PALLET_HEIGHT;
    pallets.push(...palletGeometries(x, palletTop, z, { width: 1.04, depth: 0.94 }));
    // Separate cartons, not one painted machinery-coloured solid stack.
    const rows = 2;
    const h = height / rows;
    for (let row = 0; row < rows; row++) {
      for (const offset of [-0.245, 0.245]) {
        cartons.push(box(0.475, h - 0.016, 0.87, x + offset, palletTop + h * (row + 0.5), z));
        tape.push(box(0.075, 0.015, 0.88, x + offset, palletTop + h * (row + 1), z));
        tape.push(box(0.075, h - 0.025, 0.014, x + offset, palletTop + h * (row + 0.5), z + 0.442));
      }
    }
  }
  merged(trailer, 'TrailerShell', skin, PAINT);
  merged(trailer, 'TrailerLining', lining, LINER);
  merged(trailer, 'TrailerFrame', ribs, STEEL);
  merged(trailer, 'DockSeals', seals, RUBBER);
  merged(trailer, 'TrailerDeck', bed, TIMBER);
  merged(trailer, 'TrailerPallets', pallets, TIMBER);
  merged(trailer, 'TrailerCartons', cartons, CARTON);
  merged(trailer, 'TrailerPackingTape', tape, TAPE);

  // Visible practicals illuminate the opening and cargo, not a hidden exterior slab.
  for (const [name, parent, x, y, z, intensity, reach] of [
    ['DockHeaderLamp', root, 0, bay.height + 0.34, 0.58, 10, 8],
    ['TrailerCeilingLamp', trailer, 0, head - 0.12, -2.7, 7, 8],
  ] as const) {
    parent.add(part(`${name}Housing`, box(0.72, 0.12, 0.3, 0, 0, 0), FRAME, new THREE.Vector3(x, y, z)));
    const lens = part(`${name}Lens`, box(0.6, 0.035, 0.22, 0, 0, 0), LENS, new THREE.Vector3(x, y - 0.08, z));
    lens.userData.noShadowCast = true;
    lens.castShadow = false;
    parent.add(lens, ENGINE.PointLightNode.create({
      name: `${name}Light`, position: new THREE.Vector3(x, y - 0.15, z),
      color: '#f0cca0', intensity, distance: reach, decay: 1.5,
    }));
  }
  return { root, shutter };
}
