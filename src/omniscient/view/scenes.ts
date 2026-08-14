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

import { createCorrosionBloom, createRatingPlate } from '../art/decals.js';
import { decorMesh } from '../art/mesh.js';
import { ACCENT, LIGHT, MAT, PERSON } from '../art/palette.js';
import { decalMaterial, texturedFrom } from '../art/surface.js';
import { createRng, jitter, seedFrom } from '../core/rng.js';
import { Ease } from '../core/tween.js';
import { createCharacter } from '../geometry/character.js';
import { createClump } from './../geometry/foliage.js';
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

  /**
   * The evidence that this is somebody's job.
   *
   * The bench was a bare plank with one radio on it, which reads as a display stand. A
   * workbench that has been worked at all morning has the back panel off and lying beside
   * the set, the screws that held it somewhere they will get lost, and the tools that came
   * out to do it still where they were put down. §186 says clutter only where it supports
   * story - all of this says the same thing: she has already tried.
   */
  const benchRng = createRng(seedFrom('mirela-bench'));
  const clutter: THREE.BufferGeometry[] = [];

  // The set's back panel, off and leaning against the bench edge.
  const panel = new THREE.BoxGeometry(0.42, 0.3, 0.012);
  panel.rotateX(-0.34);
  panel.rotateY(jitter(benchRng, 0.24));
  panel.translate(-0.62, 0.94, -0.28);
  clutter.push(panel);

  // Screwdrivers and a spanner, laid down roughly parallel the way tools are.
  for (const [x, z, length, angle] of [
    [0.44, -0.16, 0.26, 0.18],
    [0.52, -0.06, 0.22, 0.31],
    [-0.24, -0.12, 0.19, -0.42],
  ] as const) {
    const shaft = new THREE.BoxGeometry(length, 0.016, 0.016);
    shaft.rotateY(angle + jitter(benchRng, 0.1));
    shaft.translate(x, 0.822, z);
    clutter.push(shaft);
  }
  scene.registerProp(
    'bench-tools',
    meshOf('BenchTools', mergeGeometries(clutter, false) ?? panel, MAT.metal)
  );

  // Screws, in the lid of a tin because that is where they always end up.
  const tin = new THREE.CylinderGeometry(0.055, 0.052, 0.022, 10);
  tin.translate(0.24, 0.825, -0.3);
  scene.registerProp('bench-tin', meshOf('BenchTin', tin, MAT.plastic));

  // A rag, over the bench edge nearest the camera.
  const rag = new THREE.BoxGeometry(0.2, 0.012, 0.26);
  rag.rotateY(0.5);
  rag.rotateX(0.12);
  rag.translate(-0.9, 0.818, -0.06);
  scene.registerProp('bench-rag', meshOf('BenchRag', rag, MAT.paper));

  // The Kestrel-3.
  const set = createTransmitter({ seed: 'kestrel-3' });
  const setRoot = ENGINE.SceneNode.create({
    name: 'Transmitter',
    position: new THREE.Vector3(0, 0.81, -0.5),
  });
  /**
   * The one textured surface in the game so far.
   *
   * Everything else is flat colour and a roughness number, which is the right default and
   * is staying. The Kestrel-3 gets a generated map set because it is the object the player
   * spends an entire mission looking at, and because the mission turns on whether they
   * believe this machine has been in one pair of hands for thirty years. Crackle enamel,
   * paint rubbed off the arrises, grime settled in the lower half - all inside the palette's
   * contrast budget, so the housing still sits where the value structure put it.
   */
  setRoot.add(
    meshOf(
      'SetShell',
      set.body,
      texturedFrom(MAT.equipment, {
        color: '#6a7268',
        worn: '#a9a496',
        grime: '#3a3a2e',
        seed: 'kestrel-3-shell',
        wear: 0.055,
        crackle: 88,
      })
    )
  );
  setRoot.add(meshOf('SetFittings', set.fittings, MAT.metal));

  // The rating plate, under the controls on the front panel.
  const plate = createRatingPlate();
  if (plate) {
    const plateGeo = new THREE.PlaneGeometry(0.19, 0.06);
    plateGeo.translate(0.105, 0.036, 0.171);
    setRoot.add(meshOf('SetPlate', plateGeo, decalMaterial(plate, 0.55)));
  }

  /**
   * Corrosion on the rear panel, around connector B.
   *
   * Kept as a live reference so cleaning the connector can take the stain with it - the
   * texture is part of the mission's state, not scenery laid over the top of it.
   */
  let bloomMaterial: THREE.MeshStandardMaterial | null = null;
  const bloom = createCorrosionBloom();
  if (bloom) {
    const bloomGeo = new THREE.PlaneGeometry(0.15, 0.15);
    bloomGeo.rotateY(Math.PI);
    bloomGeo.translate(set.anchors.connectorB.x, set.anchors.connectorB.y, -0.171);
    bloomMaterial = decalMaterial(bloom, 0.95);
    setRoot.add(meshOf('SetCorrosion', bloomGeo, bloomMaterial));
  }

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
        const bloomFrom = bloomMaterial?.opacity ?? 1;
        tweener.add(
          (t) => {
            node.position.setX(baseX + Math.sin(t * Math.PI * 8) * 0.012 * (1 - t));
            // The stain goes with the corrosion. Scrubbing that leaves the panel filthy
            // would read as a half-finished job, which is not what she just did.
            if (bloomMaterial) bloomMaterial.opacity = bloomFrom * (1 - t * 0.88);
          },
          {
            duration: 1.2,
            easing: Ease.linear,
            channel: 'connector-clean',
            onComplete: () => {
              connectorMesh.material = MAT.clean;
              node.position.setX(baseX);
              if (bloomMaterial) bloomMaterial.opacity = bloomFrom * 0.12;
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
      // Leaning in over the bench, which is where she has been all morning, with her
      // hands on it. Arms hanging at her sides made her a mannequin standing near her
      // own work rather than somebody in the middle of it.
      lean: 0.16,
      reach: 0.85,
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
  // -- The headland ---------------------------------------------------------
  const deck = new THREE.BoxGeometry(4.2, 0.2, 4.2);
  deck.translate(0, -0.1, 0);
  scene.registerProp('deck', meshOf('Deck', deck, MAT.ground));

  /**
   * Sea and horizon.
   *
   * Tomas is halfway up a mast above a harbour at night, and the scene had nothing under
   * him but a three-metre slab - no height, no coast, no reason for a beacon to exist at
   * all. One dark plane and a sky band cost almost nothing and are the whole difference
   * between "up a mast" and "a lattice in a void".
   */
  const sea = new THREE.PlaneGeometry(70, 46);
  sea.rotateX(-Math.PI / 2);
  sea.translate(0, -5.5, -19);
  scene.registerProp('sea', meshOf('Sea', sea, MAT.sea));

  // No sky plane. One was tried and cut: an unlit quad out past the mast rendered as a
  // black slab with a hard seam where it ended and the atmosphere took over, which reads
  // as a hole in the world rather than as night. The fog is the sky here - it already
  // fades everything into a cool neutral at distance, which is what a night horizon does.

  // -- The mast -------------------------------------------------------------
  const mastPieces: THREE.BufferGeometry[] = [];
  for (let level = 0; level < 9; level++) {
    const y = level * 0.62;
    const inset = 0.34 - level * 0.02;
    for (let sx = -1; sx <= 1; sx += 2) {
      for (let sz = -1; sz <= 1; sz += 2) {
        const leg = new THREE.BoxGeometry(0.05, 0.62, 0.05);
        leg.translate(sx * inset, y + 0.31, sz * inset);
        mastPieces.push(leg);
      }
    }
    // Braces on all four faces plus a diagonal. One brace on one side read as scaffolding
    // rather than as a structure that could hold a light up through a coastal winter.
    for (const [w, d, dx, dz] of [
      [inset * 2, 0.04, 0, inset],
      [inset * 2, 0.04, 0, -inset],
      [0.04, inset * 2, inset, 0],
      [0.04, inset * 2, -inset, 0],
    ] as const) {
      const brace = new THREE.BoxGeometry(w, 0.04, d);
      brace.translate(dx, y, dz);
      mastPieces.push(brace);
    }
    const diagonal = new THREE.BoxGeometry(inset * 2.4, 0.03, 0.03);
    diagonal.rotateZ(level % 2 === 0 ? 0.75 : -0.75);
    diagonal.translate(0, y + 0.31, inset);
    mastPieces.push(diagonal);
  }
  const mastRoot = ENGINE.SceneNode.create({ name: 'Mast' });
  mastRoot.add(meshOf('MastLattice', mergeGeometries(mastPieces, false) ?? mastPieces[0], MAT.metal));
  scene.registerProp('mast', mastRoot);

  // A service platform, so Tomas is standing on something.
  const platformY = 2.02;
  const platformPieces: THREE.BufferGeometry[] = [];
  const deckPlate = new THREE.BoxGeometry(1.5, 0.05, 1.1);
  deckPlate.translate(0.25, platformY, 0.42);
  platformPieces.push(deckPlate);
  for (let i = 0; i < 5; i++) {
    const rail = new THREE.BoxGeometry(0.035, 0.5, 0.035);
    rail.translate(-0.4 + i * 0.33, platformY + 0.27, 0.94);
    platformPieces.push(rail);
  }
  const handrail = new THREE.BoxGeometry(1.5, 0.04, 0.04);
  handrail.translate(0.25, platformY + 0.52, 0.94);
  platformPieces.push(handrail);
  scene.registerProp(
    'platform',
    meshOf('Platform', mergeGeometries(platformPieces, false) ?? deckPlate, MAT.metal)
  );

  // -- The light itself -----------------------------------------------------
  const beaconY = 5.6;
  const housing = new THREE.CylinderGeometry(0.3, 0.34, 0.2, 10);
  housing.translate(0, beaconY + 0.32, 0);
  const capBase = new THREE.CylinderGeometry(0.26, 0.3, 0.16, 10);
  capBase.translate(0, beaconY - 0.18, 0);
  const beaconRoot = ENGINE.SceneNode.create({ name: 'Beacon' });
  beaconRoot.add(
    meshOf('BeaconHousing', mergeGeometries([housing, capBase], false) ?? housing, MAT.equipment)
  );

  const lensGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.34, 10);
  lensGeo.translate(0, beaconY + 0.08, 0);
  const lens = meshOf('BeaconLens', lensGeo, MAT.beaconLit);
  beaconRoot.add(lens);

  const glow = ENGINE.PointLightNode.create({
    name: 'BeaconGlow',
    position: new THREE.Vector3(0, beaconY + 0.08, 0),
    intensity: 9,
    color: new THREE.Color(ACCENT.amber),
    distance: 9,
    decay: 1.3,
  });
  beaconRoot.add(glow);

  /**
   * The fault, running on its own.
   *
   * "Not dimming - gone, three or four seconds, then back." That is the entire reason
   * Tomas called, and it happened nowhere: the light was not modelled at all, so the
   * player was told about a symptom they could never see. It now drops on a loop for as
   * long as the request is open, which is what makes this a conversation about something
   * rather than a conversation about a line of dialogue.
   */
  let beaconClock = 0;
  scene.registerProp('beacon', beaconRoot, {
    anchors: { default: new THREE.Vector3(0, beaconY, 0) },
    idle: (deltaTime) => {
      beaconClock = (beaconClock + deltaTime) % 11;
      // Out for three and a half seconds in every eleven, hard on and hard off: a feed
      // being pulled down collapses, it does not fade.
      const dark = beaconClock > 7.5;
      lens.material = dark ? MAT.beaconDark : MAT.beaconLit;
      glow.intensity = dark ? 0 : 9;
    },
    actions: {
      /** Steady again, once the two sets are separated. */
      steady: () => {
        beaconClock = 0;
        lens.material = MAT.beaconLit;
        glow.intensity = 11;
      },
    },
  });

  // -- The cables, which are the evidence -----------------------------------
  //
  // hint-splice tells the player "the cable does not go straight to the light. There is a
  // join on the bracket, and a second cable comes off it and runs down the hill towards
  // the town." None of that existed either. The feed now visibly leaves the light, stops
  // at the bracket, and leaves again in a direction that is not the light - which is the
  // whole deduction, sitting there for anybody who looks.
  const spliceAt = new THREE.Vector3(0.3, 2.6, 0.36);

  const feedDown = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.06, beaconY - 0.24, 0.1),
      new THREE.Vector3(0.16, 4.4, 0.3),
      new THREE.Vector3(0.24, 3.4, 0.38),
      spliceAt.clone().add(new THREE.Vector3(0, 0.16, 0)),
    ]),
    24,
    0.022,
    6,
    false
  );
  scene.registerProp('feed-down', meshOf('FeedDown', feedDown, MAT.dark));

  // The second cable: away from the mast, down the hill, towards the town.
  const feedAway = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3([
      spliceAt.clone().add(new THREE.Vector3(0, 0.02, 0.04)),
      new THREE.Vector3(0.9, 2.3, 0.75),
      new THREE.Vector3(2.1, 1.5, 1.5),
      new THREE.Vector3(3.6, 0.2, 2.6),
    ]),
    26,
    0.02,
    6,
    false
  );
  scene.registerProp('feed-away', meshOf('FeedAway', feedAway, MAT.dark));

  // -- The splice bracket - the object the whole mission turns on -----------
  const spliceBody = new THREE.BoxGeometry(0.24, 0.18, 0.14);
  spliceBody.translate(0, 0.09, 0);
  const spliceRoot = ENGINE.SceneNode.create({ name: 'SpliceBox', position: spliceAt.clone() });
  spliceRoot.add(meshOf('SpliceBody', spliceBody, MAT.equipment));

  const lidGeo = new THREE.BoxGeometry(0.24, 0.02, 0.14);
  lidGeo.translate(0, 0.01, 0);
  const lid = meshOf('SpliceLid', lidGeo, MAT.metal);
  const lidPivot = ENGINE.SceneNode.create({
    name: 'LidPivot',
    position: new THREE.Vector3(0, 0.18, -0.07),
  });
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
        tweener.add(
          (t) => spliceRoot.position.setX(0.3 + Math.sin(t * Math.PI * 6) * 0.015 * (1 - t)),
          {
            duration: 0.5,
            easing: Ease.linear,
            channel: 'splice-spark',
          }
        );
      },
    },
  });

  // -- Tomas ----------------------------------------------------------------
  //
  // He was not in his own scene at all: the player spent the entire request talking to
  // somebody who had never been rendered.
  scene.registerProp(
    'contact',
    buildCharacter('Tomas', {
      seed: 'tomas-vasc',
      height: 1.79,
      build: 0.58,
      shoulders: 0.72,
      // Braced against the mast, which is where he says he is - one hand up on it.
      lean: 0.1,
      reach: 0.55,
      garment: 'coat',
      // Wet-weather orange: the only warm thing on a cold headland, and the only piece of
      // high-visibility clothing in the game, because he is the only person in it who is
      // somewhere dangerous.
      colors: { garment: '#a8582c', underlayer: '#3f4a52' },
      position: new THREE.Vector3(0.62, platformY + 0.03, 0.55),
      rotation: new THREE.Euler(0, -Math.PI * 0.72, 0),
    })
  );

  // -- Night ----------------------------------------------------------------
  //
  // Cold moonlight from behind, so the mast and Tomas read as silhouettes with a cool
  // rim, and the beacon's amber is the only warm source in the scene. When it drops,
  // everything goes cold - which is the mission, said in light rather than words.
  scene.registerProp(
    'moon',
    ENGINE.PointLightNode.create({
      name: 'Moonlight',
      position: new THREE.Vector3(-3.4, 5.5, -4.2),
      /**
       * Raised twice, the second time off a recording rather than a still.
       *
       * The beacon is out for three and a half seconds in every eleven, and a screenshot
       * of the lit phase says nothing about the dark one. Played back, the scene went
       * almost black for a third of the time the player spends with Tomas - not
       * atmospheric, unreadable. The moon has to carry the scene on its own whenever the
       * light drops, because that is precisely when the player is looking hardest.
       */
      intensity: 30,
      color: new THREE.Color('#93b0cf'),
      distance: 34,
      decay: 0.9,
    })
  );

  /**
   * A second, dimmer cold source from the seaward side.
   *
   * The beacon is out for a third of every cycle, and with a single moon behind him the
   * scene went from atmospheric to genuinely unreadable every time it dropped - the
   * player could not see the thing they were being asked about. This keeps a floor under
   * the dark phase without ever competing with the beacon's amber when it is lit.
   */
  scene.registerProp(
    'sea-glow',
    ENGINE.PointLightNode.create({
      name: 'SeaGlow',
      position: new THREE.Vector3(3.6, 1.4, -3.2),
      intensity: 11,
      color: new THREE.Color('#5f7f9e'),
      distance: 24,
      decay: 1.0,
    })
  );

  // -- Shots ----------------------------------------------------------------
  scene.registerShot('default', {
    // Holds Tomas, the bracket and the light above him, at his own eye level rather than
    // hanging in space beside the mast looking at nothing.
    // Wide enough to hold the whole structure: Tomas on his platform, the bracket beside
    // him and the light above. At 2.5 units out the camera was inside his coat - he
    // filled the frame and the mast, the cables and the beacon were all off it, which
    // for a mission about a light going out is the one thing that cannot happen.
    position: new THREE.Vector3(4.4, 3.9, 4.4),
    target: new THREE.Vector3(0.25, 3.7, 0.25),
  });
  scene.registerShot('mast-cable', {
    position: new THREE.Vector3(1.35, 2.95, 1.35),
    target: new THREE.Vector3(0.35, 2.66, 0.36),
    duration: 2.4,
  });
  scene.registerShot('beacon', {
    position: new THREE.Vector3(2.2, 4.6, 2.2),
    target: new THREE.Vector3(0, 5.5, 0),
    duration: 2.2,
  });
}


/**
 * MISSION 03 - Adaeze's seedling tunnel.
 *
 * The set has to state the puzzle before a word is spoken: two banks of seedlings, one
 * healthy and one failing, a hard shadow line down the middle of the tunnel, and the tree
 * casting it just outside. §131 - if the player cannot see the pattern, the observation
 * panel is describing a room that is not there, which is the mistake the first two scenes
 * both made and both had to have fixed.
 */
function buildSeedlingTunnel(scene: ContactScene): void {
  const rng = createRng(seedFrom('adaeze-tunnel'));

  // -- Ground and beds ------------------------------------------------------
  const ground = new THREE.BoxGeometry(9, 0.2, 7);
  ground.translate(0, -0.1, 0);
  scene.registerProp('ground', meshOf('Ground', ground, MAT.ground));

  const beds: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1] as const) {
    const bed = new THREE.BoxGeometry(1.5, 0.22, 4.4);
    bed.translate(side * 1.05, 0.11, -0.2);
    beds.push(bed);
  }
  scene.registerProp(
    'beds',
    meshOf('Beds', mergeGeometries(beds, false) ?? beds[0], MAT.timberDark)
  );

  /**
   * The tunnel: hoops and a ridge, left open rather than skinned.
   *
   * A closed polytunnel would hide the one thing this scene exists to show. The hoops
   * read as a tunnel from any angle and let the shadow, the rows and the tree all stay
   * visible at once.
   */
  const frame: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const z = -2.3 + i * 0.92;
    const hoop = new THREE.TorusGeometry(2.05, 0.022, 5, 16, Math.PI);
    hoop.rotateY(Math.PI / 2);
    hoop.translate(0, 0.02, z);
    frame.push(hoop);
  }
  const ridge = new THREE.BoxGeometry(0.05, 0.05, 4.9);
  ridge.translate(0, 2.05, -0.2);
  frame.push(ridge);
  /*
   * Galvanised, not chrome. MAT.metal is 0.65 metalness, and under a sun bright enough to
   * throw the shadow this request turns on, six hoops of it filled the frame with white
   * pipes and buried the rows they are standing over.
   */
  scene.registerProp(
    'tunnel',
    meshOf('TunnelFrame', mergeGeometries(frame, false) ?? frame[0], MAT.galvanised)
  );

  // -- The seedlings, and the line between them -----------------------------
  //
  // Two banks from the same generator, separated only by health: full clumps on the west
  // side, sparse and short ones on the east. Nothing else in the scene differs, which is
  // exactly the deduction the player has to make.
  const healthy: THREE.BufferGeometry[] = [];
  const failing: THREE.BufferGeometry[] = [];

  for (let row = 0; row < 7; row++) {
    const z = -1.9 + row * 0.62;
    for (let col = 0; col < 3; col++) {
      const west = createClump(rng, {
        count: 7,
        length: [0.1, 0.2],
        droop: [0.3, 1.1],
        spread: 0.02,
      });
      west.forEach((part) => {
        part.geometry.translate(0.65 + col * 0.4, 0.22, z);
        healthy.push(part.geometry);
      });

      const east = createClump(rng, {
        count: 4,
        length: [0.05, 0.11],
        droop: [0.9, 1.7],
        spread: 0.015,
      });
      east.forEach((part) => {
        part.geometry.translate(-1.45 + col * 0.4, 0.22, z);
        failing.push(part.geometry);
      });
    }
  }
  scene.registerProp(
    'rows-healthy',
    meshOf('RowsHealthy', mergeGeometries(healthy, false) ?? healthy[0], MAT.leaf)
  );
  scene.registerProp(
    'rows-failing',
    meshOf('RowsFailing', mergeGeometries(failing, false) ?? failing[0], MAT.leafPale)
  );

  /**
   * The shade itself, as a real object.
   *
   * This is the fix for the thing a playtester said plainly: they solved the request and
   * still did not understand why one side was dying. The dialogue explains it twice, and
   * §131 is clear that explaining is not the job - the environment has to carry it.
   *
   * It could not. Shadow casting is off across the whole project, for a good reason: the
   * rig spans sixty units and one directional shadow map cannot cover both ends, so the
   * set outside its bounds renders fully shadowed. Which meant the shade this entire
   * request turns on was never in the scene at all. The player was told about a shadow,
   * shown a tunnel with no shadow in it, and then told the shadow had been dealt with.
   *
   * So it is geometry: a dark panel lying over the failing bank, with a hard edge down
   * the middle of the tunnel exactly where she says the line runs. It slides off when the
   * limbs come off, which is the moment the whole request exists for and the first time
   * cause and effect are in the same frame.
   */
  const shadeGeo = new THREE.PlaneGeometry(1.7, 5.0);
  shadeGeo.rotateX(-Math.PI / 2);
  shadeGeo.translate(-1.05, 0.235, -0.2);
  const shadeMesh = meshOf(
    'ShadeLine',
    shadeGeo,
    new THREE.MeshBasicMaterial({
      color: '#0e1712',
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
    })
  );
  scene.registerProp('shade', shadeMesh, {
    anchors: { default: new THREE.Vector3(-1.05, 0.3, -0.2) },
  });

  // -- The tree that is doing it --------------------------------------------
  const treeRoot = ENGINE.SceneNode.create({
    name: 'NeighbourTree',
    position: new THREE.Vector3(-3.7, 0, -0.4),
  });

  const trunk = new THREE.CylinderGeometry(0.16, 0.26, 3.4, 8);
  trunk.translate(0, 1.7, 0);
  treeRoot.add(meshOf('TreeTrunk', trunk, MAT.timberDark));

  // Limbs reaching back over the tunnel - the shape of the whole problem in one prop.
  const limbs: THREE.BufferGeometry[] = [];
  const canopy: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const lean = 0.5 + i * 0.16;
    const limb = new THREE.CylinderGeometry(0.05, 0.09, 2.6, 6);
    limb.rotateZ(lean);
    limb.translate(0.7 + i * 0.16, 2.9 + i * 0.14, -1.1 + i * 0.55);
    limbs.push(limb);

    const leaves = new THREE.SphereGeometry(0.85 - i * 0.05, 7, 5);
    leaves.translate(1.5 + i * 0.2, 3.3 + i * 0.12, -1.2 + i * 0.58);
    canopy.push(leaves);
  }
  treeRoot.add(meshOf('TreeLimbs', mergeGeometries(limbs, false) ?? limbs[0], MAT.timberDark));

  const crown = meshOf('TreeCrown', mergeGeometries(canopy, false) ?? canopy[0], MAT.leafDeep);
  treeRoot.add(crown);

  scene.registerProp('neighbour-tree', treeRoot, {
    anchors: { default: new THREE.Vector3(1.6, 3.3, -0.4) },
    actions: {
      /** Cutting back: the crown lifts away and the light lands on the failing rows. */
      clear: (tweener) => {
        const from = crown.position.clone();
        const shadeMaterial = shadeMesh.material as THREE.MeshBasicMaterial;
        const shadeFrom = shadeMesh.position.x;
        tweener.add(
          (t) => {
            crown.position.set(from.x - t * 2.4, from.y + t * 0.6, from.z);
            crown.scale.setScalar(1 - t * 0.55);
            // The light arrives as the limbs go. The shade retreats the same way the
            // crown does, so the player watches one thing cause the other.
            shadeMesh.position.setX(shadeFrom - t * 2.6);
            shadeMaterial.opacity = 0.52 * (1 - t);
          },
          {
            duration: 1.4,
            easing: Ease.outCubic,
            channel: 'tree-clear',
          }
        );
      },
    },
  });

  // -- Adaeze ---------------------------------------------------------------
  scene.registerProp(
    'contact',
    buildCharacter('Adaeze', {
      seed: 'adaeze-okafor',
      height: 1.71,
      build: 0.42,
      shoulders: 0.46,
      // Crouched at the end of a row, which is where she says she is.
      lean: 0.3,
      reach: 0.8,
      garment: 'apron',
      colors: { garment: '#2f6a72', underlayer: '#d8c9a8' },
      // Left of frame and near the camera. Mirroring the scene put her behind the
      // conversation panel, which is a poor place for the person doing the talking.
      position: new THREE.Vector3(-1.9, 0, 2.4),
      rotation: new THREE.Euler(0, Math.PI * 0.1, 0),
    })
  );

  // -- Light ----------------------------------------------------------------
  //
  // High and hard from the west, because the whole request turns on a shadow. A soft key
  // would light both banks evenly and there would be nothing to see.
  scene.registerProp(
    'sun',
    ENGINE.PointLightNode.create({
      name: 'Sun',
      position: new THREE.Vector3(5.5, 7.5, 1.5),
      intensity: 36,
      color: new THREE.Color('#fff0d0'),
      distance: 26,
      decay: 0.9,
    })
  );

  scene.registerProp(
    'skyfill',
    ENGINE.PointLightNode.create({
      name: 'SkyFill',
      position: new THREE.Vector3(-2.5, 4.5, 3.5),
      intensity: 13,
      color: new THREE.Color('#9fc0d8'),
      distance: 16,
      decay: 1.2,
    })
  );

  // -- Shots ----------------------------------------------------------------
  scene.registerShot('default', {
    // Down the tunnel, so both banks are in frame at once and the difference between
    // them is the first thing read.
    // Outside the mouth and above it. From inside, the nearest hoop sat across the lens
    // and the two banks - the entire puzzle - were behind it.
    position: new THREE.Vector3(1.1, 3.4, 7.0),
    target: new THREE.Vector3(-1.3, 0.9, -0.6),
  });
  scene.registerShot('tunnel-rows', {
    position: new THREE.Vector3(2.6, 1.6, 3.0),
    target: new THREE.Vector3(-1.1, 0.4, -0.5),
    duration: 2.4,
  });
  scene.registerShot('neighbour-tree', {
    position: new THREE.Vector3(1.4, 2.6, 3.8),
    target: new THREE.Vector3(-2.5, 3.0, -0.6),
    duration: 2.4,
  });
}


/**
 * MISSION 04 - the cleared house.
 *
 * A room being emptied: furniture pushed back, a table under the window with a shoebox of
 * photographs open on it, and the same tide line round the bottom of the wall that Mirela
 * has in her shop eleven miles down the coast. That mark is the mission's evidence and the
 * reason the parish records are porridge, so §131 requires it to actually be there.
 *
 * Deliberately underdressed. The set is a house with the life taken out of it, and the way
 * to say that is empty wall and stacked chairs rather than more props.
 */
function buildClearedHouse(scene: ContactScene): void {
  const rng = createRng(seedFrom('ileana-house'));

  const floor = new THREE.BoxGeometry(7, 0.1, 6);
  floor.translate(0, -0.05, 0);
  scene.registerProp('floor', meshOf('Floor', floor, MAT.timberDark));

  const wall = new THREE.BoxGeometry(7, 3.0, 0.15);
  wall.translate(0, 1.5, -2.1);
  scene.registerProp('wall', meshOf('Wall', wall, MAT.wall));

  // The same water, the same height, matched to the repair shop on purpose. Two bands,
  // because a room that floods every spring has more than one high-water mark.
  const tide: THREE.BufferGeometry[] = [];
  for (const [height, thickness] of [
    [0.26, 0.035],
    [0.19, 0.02],
  ] as const) {
    const band = new THREE.BoxGeometry(7, thickness, 0.02);
    band.translate(0, height, -2.015);
    tide.push(band);
  }
  scene.registerProp(
    'tide-line',
    meshOf('TideLine', mergeGeometries(tide, false) ?? tide[0], MAT.tideStain)
  );

  // Window, high and behind, so the table under it is the lit thing in the room.
  const frame = new THREE.BoxGeometry(1.5, 1.1, 0.06);
  frame.translate(-0.2, 1.75, -2.0);
  scene.registerProp('window-frame', meshOf('WindowFrame', frame, MAT.timber));

  const pane = new THREE.PlaneGeometry(1.34, 0.94);
  pane.translate(-0.2, 1.75, -1.96);
  scene.registerProp('window', meshOf('Window', pane, MAT.daylight));

  // -- The table, and what is on it -----------------------------------------
  const table: THREE.BufferGeometry[] = [];
  const top = new THREE.BoxGeometry(1.7, 0.06, 0.8);
  top.translate(-0.2, 0.74, -1.1);
  table.push(top);
  for (const [x, z] of [
    [-0.95, -1.44],
    [0.53, -1.44],
    [-0.95, -0.78],
    [0.53, -0.78],
  ] as const) {
    const leg = new THREE.BoxGeometry(0.07, 0.74, 0.07);
    leg.translate(x, 0.37, z);
    table.push(leg);
  }
  scene.registerProp('table', meshOf('Table', mergeGeometries(table, false) ?? top, MAT.timber));

  /**
   * The box of photographs - the prop the whole request is about.
   *
   * Open, with the prints fanned rather than stacked, because a closed box says storage
   * and an open one says somebody has been going through this for two days.
   */
  const boxRoot = ENGINE.SceneNode.create({
    name: 'PhotoBox',
    position: new THREE.Vector3(-0.55, 0.77, -1.06),
  });

  const shell = new THREE.BoxGeometry(0.34, 0.11, 0.24);
  shell.translate(0, 0.055, 0);
  boxRoot.add(meshOf('BoxShell', shell, MAT.plastic));

  const lid = new THREE.BoxGeometry(0.36, 0.02, 0.26);
  lid.rotateZ(0.22);
  lid.translate(0.32, 0.02, 0.04);
  boxRoot.add(meshOf('BoxLid', lid, MAT.plastic));

  const prints: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const print = new THREE.BoxGeometry(0.085, 0.002, 0.062);
    print.rotateY(jitter(rng, 0.9));
    print.translate(-0.02 + jitter(rng, 0.26), 0.113 + i * 0.0022, 0.02 + jitter(rng, 0.13));
    prints.push(print);
  }
  boxRoot.add(meshOf('Photographs', mergeGeometries(prints, false) ?? prints[0], MAT.paper));
  scene.registerProp('photo-box', boxRoot, {
    anchors: { default: new THREE.Vector3(0, 0.14, 0) },
  });

  // The four envelopes, squared up, waiting for names.
  const letters: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const envelope = new THREE.BoxGeometry(0.16, 0.003, 0.11);
    envelope.rotateY(jitter(rng, 0.06));
    envelope.translate(0.34, 0.775 + i * 0.0035, -1.14 + jitter(rng, 0.01));
    letters.push(envelope);
  }
  scene.registerProp(
    'letters',
    meshOf('Letters', mergeGeometries(letters, false) ?? letters[0], MAT.paper)
  );

  // -- Stacked chairs: a house being emptied ---------------------------------
  const stack: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const seat = new THREE.BoxGeometry(0.42, 0.05, 0.42);
    seat.rotateY(jitter(rng, 0.14));
    seat.translate(1.75, 0.46 + i * 0.13, -1.5);
    stack.push(seat);
  }
  const back = new THREE.BoxGeometry(0.42, 0.5, 0.05);
  back.translate(1.75, 0.95, -1.7);
  stack.push(back);
  for (const [x, z] of [
    [1.58, -1.34],
    [1.92, -1.34],
    [1.58, -1.66],
    [1.92, -1.66],
  ] as const) {
    const leg = new THREE.BoxGeometry(0.05, 0.46, 0.05);
    leg.translate(x, 0.23, z);
    stack.push(leg);
  }
  scene.registerProp(
    'chairs',
    meshOf('Chairs', mergeGeometries(stack, false) ?? back, MAT.timberDark)
  );

  scene.registerProp(
    'contact',
    buildCharacter('Ileana', {
      seed: 'ileana-marku',
      height: 1.66,
      build: 0.4,
      shoulders: 0.44,
      // Sitting forward over the table, which is where somebody is after two days of this.
      lean: 0.34,
      reach: 0.6,
      garment: 'coat',
      colors: { garment: '#4a4a52', underlayer: '#b3a58a' },
      position: new THREE.Vector3(-1.05, 0, -0.32),
      rotation: new THREE.Euler(0, Math.PI * 0.14, 0),
    })
  );

  // -- Light -----------------------------------------------------------------
  // One window and one fill. A house with the curtains taken down and half the power off.
  scene.registerProp(
    'daylight',
    ENGINE.PointLightNode.create({
      name: 'Daylight',
      position: new THREE.Vector3(-0.2, 2.1, -1.5),
      intensity: 16,
      color: new THREE.Color('#cfe0f0'),
      distance: 9,
      decay: 1.1,
    })
  );

  /**
   * Fill from the camera side, and it is not optional here.
   *
   * Ileana's only real light is the window behind her, so she was lit entirely from
   * behind - which turned the person the player is talking to into a black cut-out and
   * made her read as facing away however she was actually turned. The hair and the
   * placket give her a front now; this is what lets anybody see it.
   *
   * Warm against the cold window, so the two lights also do the §230 job of putting a
   * warm edge and a cool edge on everything between them.
   */
  scene.registerProp(
    'roomfill',
    ENGINE.PointLightNode.create({
      name: 'RoomFill',
      position: new THREE.Vector3(1.5, 1.7, 1.5),
      intensity: 13,
      color: new THREE.Color('#ffd0a0'),
      distance: 7,
      decay: 1.25,
    })
  );

  scene.registerShot('default', {
    // Across the table, so the box, the envelopes and Ileana are all in one frame - the
    // three things the request is made of.
    position: new THREE.Vector3(1.15, 1.42, 1.35),
    target: new THREE.Vector3(-0.42, 0.85, -1.2),
  });
  scene.registerShot('photo-box', {
    position: new THREE.Vector3(0.15, 1.16, -0.3),
    target: new THREE.Vector3(-0.5, 0.8, -1.08),
    duration: 2.2,
  });
}

// Registered at module load. auto-imports pulls this module in, so a ContactScene node
// placed in the editor with a matching sceneId populates itself.
ContactScene.registerBuilder('scene-repair-shop', buildRepairShop);
ContactScene.registerBuilder('scene-beacon-mast', buildBeaconMast);
ContactScene.registerBuilder('scene-seedling-tunnel', buildSeedlingTunnel);
ContactScene.registerBuilder('scene-cleared-house', buildClearedHouse);

/** Construct a populated diorama for a mission's sceneId, or null when none exists. */
export function buildContactScene(sceneId: string): ContactScene | null {
  if (!ContactScene.hasBuilder(sceneId)) {
    console.warn(`[contact-view] no scene builder for "${sceneId}"`);
    return null;
  }
  return ContactScene.create({ name: 'ContactScene', sceneId });
}
