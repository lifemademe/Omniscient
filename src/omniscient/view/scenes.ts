/**
 * Contact View dioramas.
 *
 * One builder per mission `sceneId`. Each assembles procedural props, registers the
 * camera shots and prop actions the mission's cues address, and returns the scene.
 *
 * §186: big shapes first, lit well, detail only where it supports story or interaction.
 * These are small staged sets rather than levels - the camera never leaves its bracket,
 * because OMNISCIENT_ is looking through somebody else's fixed camera.
 *
 * §187: one small shared material family across the whole kit.
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { Ease } from '../core/tween.js';
import {
  createMainsSwitch,
  createShelfStack,
  createTransmitter,
  createWorkbench,
} from '../geometry/props.js';

import { ContactScene } from './ContactScene.js';

/** §187: small reusable material family, warm and imperfect for human spaces. */
const MAT = {
  timber: new THREE.MeshStandardMaterial({ color: '#8a6b48', roughness: 0.85, metalness: 0 }),
  metal: new THREE.MeshStandardMaterial({ color: '#6d6a63', roughness: 0.55, metalness: 0.6 }),
  plastic: new THREE.MeshStandardMaterial({ color: '#b9ad92', roughness: 0.75, metalness: 0.04 }),
  dark: new THREE.MeshStandardMaterial({ color: '#2a2724', roughness: 0.6, metalness: 0.15 }),
  corroded: new THREE.MeshStandardMaterial({ color: '#5d7d4f', roughness: 0.95, metalness: 0.1 }),
  clean: new THREE.MeshStandardMaterial({ color: '#c9c2ad', roughness: 0.3, metalness: 0.8 }),
  concrete: new THREE.MeshStandardMaterial({ color: '#6b6659', roughness: 0.95, metalness: 0 }),
};

/**
 * Create a named mesh. The name is applied after construction because the editor's
 * default-subobject lint requires a string literal at the create() call site.
 */
function meshOf(name: string, geometry: THREE.BufferGeometry, material: THREE.Material): ENGINE.MeshNode {
  const node = ENGINE.MeshNode.create({ name: 'Prop', geometry, material });
  node.setName(name);
  return node;
}

/**
 * MISSION 01 - Mirela's repair shop.
 *
 * The set sits on a bench facing the camera. Its rear connectors are real geometry, so
 * "show me the back" is an actual reveal rather than a line of dialogue (§131).
 */
function buildRepairShop(scene: ContactScene): void {
  // Floor and back wall - background mass, not detail (§186).
  const floor = new THREE.BoxGeometry(8, 0.1, 6);
  floor.translate(0, -0.05, 0);
  scene.registerProp('floor', meshOf('Floor', floor, MAT.concrete));

  const wall = new THREE.BoxGeometry(8, 3.2, 0.15);
  wall.translate(0, 1.6, -1.9);
  scene.registerProp('wall', meshOf('Wall', wall, MAT.concrete));

  const shelf = createShelfStack('mirela-shelf');
  const shelfRoot = ENGINE.SceneNode.create({ name: 'Shelf', position: new THREE.Vector3(-2.1, 0, -1.4) });
  shelfRoot.add(meshOf('ShelfBody', shelf.body, MAT.timber));
  shelfRoot.add(meshOf('ShelfCrates', shelf.fittings, MAT.plastic));
  scene.registerProp('shelf', shelfRoot);

  const bench = createWorkbench();
  const benchRoot = ENGINE.SceneNode.create({ name: 'Bench', position: new THREE.Vector3(0, 0, -0.5) });
  benchRoot.add(meshOf('BenchTop', bench.body, MAT.timber));
  benchRoot.add(meshOf('BenchLegs', bench.fittings, MAT.metal));
  scene.registerProp('bench', benchRoot);

  // The Kestrel-3.
  const set = createTransmitter({ seed: 'kestrel-3' });
  const setRoot = ENGINE.SceneNode.create({
    name: 'Transmitter',
    position: new THREE.Vector3(0, 0.81, -0.5),
  });
  setRoot.add(meshOf('SetShell', set.body, MAT.plastic));
  setRoot.add(meshOf('SetFittings', set.fittings, MAT.metal));

  scene.registerProp('transmitter', setRoot, {
    anchors: set.anchors,
    actions: {
      /** Mirela turns the set round so the camera can see the connectors. */
      'rotate-rear': (tweener, node) => {
        const from = node.rotation.y;
        const to = Math.PI;
        tweener.add((t) => node.rotation.set(node.rotation.x, from + (to - from) * t, node.rotation.z), {
          duration: 1.1,
          easing: Ease.outCubic,
          channel: 'transmitter-spin',
        });
      },
      'rotate-front': (tweener, node) => {
        const from = node.rotation.y;
        tweener.add((t) => node.rotation.set(node.rotation.x, from * (1 - t), node.rotation.z), {
          duration: 1.1,
          easing: Ease.outCubic,
          channel: 'transmitter-spin',
        });
      },
    },
  });

  // Connector B as its own addressable sub-object, so `prop.clean:connector-b` and
  // `prop.spark:connector-b` resolve to a real place in space.
  const connectorGeo = new THREE.CylinderGeometry(0.036, 0.034, 0.02, 8);
  connectorGeo.rotateX(Math.PI / 2);
  const connectorMesh = meshOf('ConnectorB', connectorGeo, MAT.corroded);
  const connectorRoot = ENGINE.SceneNode.create({
    name: 'ConnectorBRoot',
    position: set.anchors.connectorB.clone(),
  });
  connectorRoot.add(connectorMesh);
  setRoot.add(connectorRoot);

  scene.registerProp('connector-b', connectorRoot, {
    anchors: { default: new THREE.Vector3(0, 0, -0.02) },
    actions: {
      /** Scrubbing: a short shudder, then the corrosion colour gives way to bright metal. */
      clean: (tweener, node) => {
        const baseX = node.position.x;
        tweener.add(
          (t) => {
            node.position.setX(baseX + Math.sin(t * Math.PI * 8) * 0.012 * (1 - t));
          },
          {
            duration: 1.2,
            easing: Ease.linear,
            channel: 'connector-clean',
            onComplete: () => {
              connectorMesh.material = MAT.clean;
              node.position.setX(baseX);
            },
          }
        );
      },
      /** Arc: a hard flinch. The VFX itself is fired by the caller at this anchor. */
      spark: (tweener, node) => {
        const baseZ = node.position.z;
        tweener.add((t) => node.position.setZ(baseZ - Math.sin(t * Math.PI) * 0.03), {
          duration: 0.35,
          easing: Ease.linear,
          channel: 'connector-spark',
        });
      },
    },
  });

  // Mains switch on the wall.
  const mains = createMainsSwitch();
  const mainsRoot = ENGINE.SceneNode.create({
    name: 'MainsSwitch',
    position: new THREE.Vector3(1.5, 1.25, -1.8),
  });
  mainsRoot.add(meshOf('SwitchBox', mains.body, MAT.dark));
  const lever = meshOf('SwitchLever', mains.fittings, MAT.metal);
  const leverRoot = ENGINE.SceneNode.create({ name: 'LeverPivot', position: mains.anchors.pivot.clone() });
  leverRoot.add(lever);
  mainsRoot.add(leverRoot);

  let mainsOn = true;
  scene.registerProp('mains-switch', mainsRoot, {
    anchors: { default: new THREE.Vector3(0, 0.13, 0.08) },
    actions: {
      toggle: (tweener) => {
        const from = leverRoot.rotation.x;
        const to = mainsOn ? -0.9 : 0;
        mainsOn = !mainsOn;
        tweener.add((t) => leverRoot.rotation.set(from + (to - from) * t, 0, 0), {
          duration: 0.28,
          easing: Ease.outBack,
          channel: 'mains',
        });
      },
    },
  });

  // Mirela herself. §209: she stands and idles - every instruction she is given is
  // performed by the bench, the set or the switch, never by her body.
  scene.registerProp(
    'contact',
    ENGINE.ModelMeshNode.create({
      name: 'Mirela',
      modelUrl: ENGINE.DEFAULT_CHARACTER_MODEL_URL,
      position: new THREE.Vector3(-0.95, 0, -1.15),
      rotation: new THREE.Euler(0, Math.PI * 0.62, 0),
    })
  );

  // TEMP: unlit marker. If this shows and nothing else does, the geometry is present and
  // the problem is lighting rather than visibility or camera. Remove once resolved.
  const marker = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  marker.translate(0, 1.15, -0.5);
  scene.registerProp(
    'debug-marker',
    meshOf('DebugMarker', marker, new THREE.MeshBasicMaterial({ color: '#ff00ff' }))
  );

  // Shots. The default frame is a working view of the bench.
  scene.registerShot('default', {
    position: new THREE.Vector3(0.5, 1.35, 1.5),
    target: new THREE.Vector3(0, 0.85, -0.5),
  });
  scene.registerShot('transmitter', {
    position: new THREE.Vector3(0.15, 1.05, 0.5),
    target: new THREE.Vector3(0, 0.9, -0.5),
    duration: 1.5,
  });
  scene.registerShot('workshop-floor', {
    position: new THREE.Vector3(1.2, 0.75, 1.6),
    target: new THREE.Vector3(-0.6, 0.15, -0.8),
    duration: 2.4,
  });
}

/**
 * MISSION 02 - the harbour beacon mast.
 *
 * Deliberately sparser: night, height, and one splice bracket that matters. §186 - the
 * mast and its cable run carry the composition, not clutter.
 */
function buildBeaconMast(scene: ContactScene): void {
  const deck = new THREE.BoxGeometry(3, 0.1, 3);
  deck.translate(0, -0.05, 0);
  scene.registerProp('deck', meshOf('Deck', deck, MAT.concrete));

  // Lattice mast: repeated structural motif rather than a modelled tower (§201).
  const mastPieces: THREE.BufferGeometry[] = [];
  for (let level = 0; level < 9; level++) {
    const y = level * 0.62;
    for (let sx = -1; sx <= 1; sx += 2) {
      for (let sz = -1; sz <= 1; sz += 2) {
        const leg = new THREE.BoxGeometry(0.05, 0.62, 0.05);
        const inset = 0.34 - level * 0.02;
        leg.translate(sx * inset, y + 0.31, sz * inset);
        mastPieces.push(leg);
      }
    }
    const brace = new THREE.BoxGeometry(0.72 - level * 0.04, 0.04, 0.04);
    brace.translate(0, y, 0.34 - level * 0.02);
    mastPieces.push(brace);
  }
  const mastGeo = mastPieces.reduce((acc, geo) => acc ?? geo, null as THREE.BufferGeometry | null)!;
  const mastRoot = ENGINE.SceneNode.create({ name: 'Mast' });
  mastPieces.forEach((geo, i) => mastRoot.add(meshOf(`MastPart${i}`, geo, MAT.metal)));
  scene.registerProp('mast', mastRoot);
  void mastGeo;

  // The splice bracket - the object the whole mission turns on.
  const spliceBody = new THREE.BoxGeometry(0.22, 0.16, 0.12);
  spliceBody.translate(0, 0.08, 0);
  const spliceRoot = ENGINE.SceneNode.create({
    name: 'SpliceBox',
    position: new THREE.Vector3(0.3, 2.6, 0.36),
  });
  spliceRoot.add(meshOf('SpliceBody', spliceBody, MAT.dark));

  const lidGeo = new THREE.BoxGeometry(0.22, 0.02, 0.12);
  lidGeo.translate(0, 0.01, 0);
  const lid = meshOf('SpliceLid', lidGeo, MAT.metal);
  const lidPivot = ENGINE.SceneNode.create({ name: 'LidPivot', position: new THREE.Vector3(0, 0.16, -0.06) });
  lidPivot.add(lid);
  spliceRoot.add(lidPivot);

  scene.registerProp('splice-box', spliceRoot, {
    anchors: { default: new THREE.Vector3(0, 0.1, 0.08) },
    actions: {
      open: (tweener) => {
        tweener.add((t) => lidPivot.rotation.set(-1.2 * t, 0, 0), {
          duration: 0.9,
          easing: Ease.outCubic,
          channel: 'splice-lid',
        });
      },
      spark: (tweener) => {
        tweener.add((t) => spliceRoot.position.setX(0.3 + Math.sin(t * Math.PI * 6) * 0.015 * (1 - t)), {
          duration: 0.5,
          easing: Ease.linear,
          channel: 'splice-spark',
        });
      },
    },
  });

  scene.registerShot('default', {
    position: new THREE.Vector3(1.6, 2.4, 1.8),
    target: new THREE.Vector3(0, 2.4, 0),
  });
  scene.registerShot('mast-cable', {
    position: new THREE.Vector3(0.9, 2.7, 1.1),
    target: new THREE.Vector3(0.3, 2.6, 0.36),
    duration: 2.4,
  });
}

// Registered at module load. auto-imports pulls this module in, so a ContactScene node
// placed in the editor with a matching sceneId populates itself.
ContactScene.registerBuilder('scene-repair-shop', buildRepairShop);
ContactScene.registerBuilder('scene-beacon-mast', buildBeaconMast);

/** Construct a populated diorama for a mission's sceneId, or null when none exists. */
export function buildContactScene(sceneId: string): ContactScene | null {
  if (!ContactScene.hasBuilder(sceneId)) {
    console.warn(`[contact-view] no scene builder for "${sceneId}"`);
    return null;
  }
  return ContactScene.create({ name: 'ContactScene', sceneId });
}
