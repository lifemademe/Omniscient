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
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { decorMesh } from '../art/mesh.js';
import { LIGHT, MAT, PERSON } from '../art/palette.js';
import { Ease } from '../core/tween.js';
import { createCharacter } from '../geometry/character.js';
import {
  createMainsSwitch,
  createShelfStack,
  createTransmitter,
  createWorkbench,
} from '../geometry/props.js';

import { ContactScene } from './ContactScene.js';

import type { CharacterParams } from '../geometry/character.js';

const meshOf = decorMesh;

interface CharacterPlacement extends CharacterParams {
  position: THREE.Vector3;
  rotation?: THREE.Euler;
}

/**
 * Assemble a generated person into a node.
 *
 * Colours come from the generator rather than the shared MAT family: people are the one
 * thing in the world that should vary between instances (§185), while the built
 * environment stays on one palette.
 */
function buildCharacter(name: string, placement: CharacterPlacement): ENGINE.SceneNode {
  const parts = createCharacter(placement);

  const root = ENGINE.SceneNode.create({
    name: 'Contact',
    position: placement.position.clone(),
    rotation: placement.rotation?.clone(),
  });
  root.setName(name);

  const surface = (color: string, roughness: number): THREE.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });

  root.add(meshOf('Skin', parts.skin, surface(parts.colors.skin, 0.82)));
  root.add(meshOf('Garment', parts.garment, surface(parts.colors.garment, 0.92)));
  root.add(meshOf('Underlayer', parts.underlayer, surface(parts.colors.underlayer, 0.9)));
  root.add(meshOf('Hair', parts.hair, surface(parts.colors.hair, 0.95)));
  root.add(meshOf('Boots', parts.boots, surface(PERSON.boot, 0.75)));

  return root;
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
  scene.registerProp('floor', meshOf('Floor', floor, MAT.ground));

  const wall = new THREE.BoxGeometry(8, 3.2, 0.15);
  wall.translate(0, 1.6, -1.9);
  scene.registerProp('wall', meshOf('Wall', wall, MAT.wall));

  /**
   * The tide line, and the point of §131.
   *
   * hint-floor tells the player "a dark line runs round the bottom of the walls, about a
   * hand off the floor. The room has been flooded, and not just once." None of it was
   * there. The observation panel was describing a room that did not exist, which is the
   * exact failure §131 is written to prevent - the environment is supposed to carry the
   * information, and a hint about invisible evidence is just the game telling you the
   * answer with extra steps.
   *
   * Two bands, uneven and slightly apart, because a room that floods every spring has
   * more than one high-water mark and they never land in the same place twice.
   */
  const tideMarks: THREE.BufferGeometry[] = [];
  for (const [height, thickness] of [
    [0.26, 0.035],
    [0.19, 0.02],
  ] as const) {
    const back = new THREE.BoxGeometry(8, thickness, 0.02);
    back.translate(0, height, -1.815);
    tideMarks.push(back);
  }
  // Round the corner and onto the shelf's legs, so it reads as a level the whole room
  // sat under rather than a stripe painted on one wall.
  for (const x of [-2.35, -1.85]) {
    const post = new THREE.BoxGeometry(0.08, 0.03, 0.02);
    post.translate(x, 0.24, -1.28);
    tideMarks.push(post);
  }
  scene.registerProp(
    'tide-line',
    meshOf('TideLine', mergeGeometries(tideMarks, false) ?? tideMarks[0], MAT.tideStain)
  );

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
  setRoot.add(meshOf('SetShell', set.body, MAT.equipment));
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

  // Mirela herself, generated rather than imported. §209: she stands and idles - every
  // instruction she is given is performed by the bench, the set or the switch, never by
  // her body - so a well-posed static figure is worth more than a rig with no clips.
  scene.registerProp(
    'contact',
    buildCharacter('Mirela', {
      seed: 'mirela-vasc',
      height: 1.66,
      build: 0.45,
      shoulders: 0.42,
      // Leaning in over the bench, which is where she has been all morning.
      lean: 0.16,
      garment: 'apron',
      /**
       * Art-directed rather than seeded. Her workshop is warm timber from wall to bench,
       * and the seeded roll gave her a warm brown coat over it - so the one person in the
       * scene disappeared into her own furniture and read as a wooden mannequin.
       *
       * A cold blue-grey work coat over a pale apron is the only cool mass in the room,
       * which puts the human at the top of the read where she belongs.
       */
      colors: {
        garment: '#42525c',
        underlayer: '#c2b79c',
      },
      position: new THREE.Vector3(-0.72, 0, -1.02),
      rotation: new THREE.Euler(0, Math.PI * 0.58, 0),
    })
  );

  // A work lamp over the bench. §187: one key plus controlled practicals - and a
  // practical here is motivated, because this is where she has been working. Without it
  // the diorama has only the distant key and reads as a room at night with the lights
  // off, which is not the same thing as atmospheric.
  scene.registerProp(
    'work-lamp',
    ENGINE.PointLightNode.create({
      name: 'WorkLamp',
      position: new THREE.Vector3(0.25, 1.55, -0.15),
      intensity: 7.5,
      color: new THREE.Color(LIGHT.key),
      distance: 5.5,
      decay: 1.5,
    })
  );

  /**
   * Cold daylight from the shop door, opposite the lamp.
   *
   * With only the warm practical, every surface in the room converged on the same orange:
   * bench, boxes, shelf, transmitter and Mirela were one value and one hue, and nothing
   * read against anything. §187 asks for the hero prop to stay legible against its
   * environment, and it cannot do that when the environment is the same colour.
   *
   * One cool source on the far side does the whole job - every object now has a warm side
   * and a cold side, which is what separates planes when there is no texture to do it.
   */
  scene.registerProp(
    'door-light',
    ENGINE.PointLightNode.create({
      name: 'DoorLight',
      position: new THREE.Vector3(-2.4, 1.7, 1.6),
      intensity: 4.2,
      color: new THREE.Color(LIGHT.fill),
      distance: 7,
      decay: 1.4,
    })
  );

  // Shots. The default frame establishes the room: bench, contact, and enough of the
  // shelf to read as somebody's workshop (§186 - composition before clutter).
  scene.registerShot('default', {
    // Target raised to chest height rather than bench height, so she is in the frame
    // instead of cropped at the shoulders by a camera aimed at the furniture.
    position: new THREE.Vector3(1.32, 1.46, 1.82),
    target: new THREE.Vector3(-0.34, 1.06, -0.72),
  });
  scene.registerShot('transmitter', {
    /**
     * The set, with the person who owns it still in shot.
     *
     * This was a metre from the target and aimed square at the box: the transmitter
     * filled the frame, Mirela was nowhere in it, and the whole scene read as a
     * screenshot of a prop. The request is a conversation with somebody - losing her the
     * moment the player looks closely at anything is the wrong trade every time.
     *
     * Now it comes in from her side of the bench, so the set is still the biggest thing
     * in frame and her hands and shoulder hold the left edge.
     */
    position: new THREE.Vector3(0.92, 1.24, 0.92),
    target: new THREE.Vector3(-0.2, 0.99, -0.6),
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
  scene.registerProp('deck', meshOf('Deck', deck, MAT.ground));

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
