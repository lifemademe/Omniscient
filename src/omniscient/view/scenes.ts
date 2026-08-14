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

import { createBoxLabel, createCorrosionBloom, createRatingPlate } from '../art/decals.js';
import { decorMesh } from '../art/mesh.js';
import { ACCENT, LIGHT, MAT } from '../art/palette.js';
import { decalMaterial, texturedFrom } from '../art/surface.js';
import { createRng, jitter, seedFrom } from '../core/rng.js';
import { Ease } from '../core/tween.js';
import { createFieldBackdrop, createNightBackdrop } from '../geometry/backdrop.js';
import { createClump } from './../geometry/foliage.js';
import {
  createMainsSwitch,
  createShelfStack,
  createTransmitter,
  createWorkbench,
} from '../geometry/props.js';

import { placeCharacter } from './character-node.js';
import { ContactScene } from './ContactScene.js';

import type { CharacterPlacement } from './character-node.js';

const meshOf = decorMesh;

/**
 * The contact, standing in their own scene and breathing (§236).
 *
 * Every diorama registers its person the same way and under the same prop id, so this is
 * one line rather than four repetitions of the same three.
 */
function addContact(scene: ContactScene, name: string, placement: CharacterPlacement): void {
  const contact = placeCharacter(name, placement);
  scene.registerProp('contact', contact.root, { idle: contact.idle });
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

  const walls: THREE.BufferGeometry[] = [];
  const back = new THREE.BoxGeometry(8, 3.2, 0.15);
  back.translate(0, 1.6, -1.9);
  walls.push(back);
  // A side wall, so the shot has a corner rather than an edge. The default camera looks
  // across the bench toward -x and ran off the end of the world on that side.
  const side = new THREE.BoxGeometry(0.15, 3.2, 5);
  side.translate(-3.1, 1.6, 0.6);
  walls.push(side);
  scene.registerProp('wall', meshOf('Wall', mergeGeometries(walls, false) ?? back, MAT.wall));

  /**
   * The pegboard, and the one §230 note this scene never acted on.
   *
   * "The pegboard wall as dense mid-value texture behind a light-value hero prop." The
   * repair shop is the diorama most players will see and it had a flat plaster wall behind
   * the bench - so the Kestrel-3, which is the object the whole mission is about, was a
   * mid-value box in front of a mid-value field with nothing but a hue shift separating
   * them. The board is a value step ABOVE the wall and a step BELOW the set, which is the
   * arrangement §187 keeps asking for and this room never had.
   *
   * All the busyness is in the normal map (see `pegboardMaps`), so it costs almost nothing
   * against §232 and reads as tooth rather than as pattern at the gameplay camera.
   */
  const board = new THREE.BoxGeometry(3.4, 1.6, 0.03);
  board.translate(-0.1, 1.62, -1.805);
  scene.registerProp('pegboard', meshOf('Pegboard', board, MAT.pegboard));

  /**
   * What is hanging on it.
   *
   * Silhouettes, not tools. At three metres a spanner is fifteen pixels and its only
   * legible property is its outline, so these are the four outlines a workshop wall has:
   * things that hang straight down, things that hang in pairs, coils, and one long thing.
   * The board's own texture does the density; these do the irregularity, which is what
   * stops a regular grid reading as wallpaper.
   */
  const hanging: THREE.BufferGeometry[] = [];
  const pegRng = createRng(seedFrom('mirela-pegboard'));
  // [x, y, length, width, kind] - kind 0 straight, 1 forked at the bottom, 2 a coil.
  const hung: ReadonlyArray<readonly [number, number, number, number, number]> = [
    [-1.42, 2.02, 0.3, 0.032, 0],
    [-1.22, 2.06, 0.36, 0.038, 0],
    [-1.02, 2.0, 0.26, 0.03, 1],
    [-0.78, 2.08, 0.42, 0.026, 0],
    [-0.58, 2.02, 0.32, 0.034, 1],
    [1.02, 2.05, 0.34, 0.03, 0],
    [1.22, 2.0, 0.28, 0.042, 1],
    [1.44, 2.08, 0.44, 0.028, 0],
    [-1.3, 1.3, 0.22, 0.05, 2],
    [1.15, 1.28, 0.26, 0.056, 2],
    [0.86, 1.98, 0.5, 0.022, 0],
  ];
  for (const [x, y, length, width, kind] of hung) {
    const lean = jitter(pegRng, 0.07);
    if (kind === 2) {
      // A coil of cable or a roll of tape: a ring on a peg.
      const coil = new THREE.TorusGeometry(length * 0.55, width * 0.5, 5, 12);
      coil.rotateZ(lean);
      coil.translate(x, y - length * 0.55, -1.72);
      hanging.push(coil);
      continue;
    }
    const shaft = new THREE.BoxGeometry(width, length, width * 0.7);
    shaft.rotateZ(lean);
    shaft.translate(x, y - length / 2, -1.73);
    hanging.push(shaft);
    if (kind === 1) {
      const jaw = new THREE.BoxGeometry(width * 2.1, width * 1.6, width * 0.7);
      jaw.rotateZ(lean);
      jaw.translate(x + Math.sin(lean) * length * 0.5, y - length, -1.73);
      hanging.push(jaw);
    }
  }
  // Pegs, so the tools are on something.
  for (const [x, y] of hung.map(([x, y]) => [x, y] as const)) {
    const peg = new THREE.CylinderGeometry(0.008, 0.008, 0.055, 5);
    peg.rotateX(Math.PI / 2);
    peg.translate(x, y + 0.01, -1.76);
    hanging.push(peg);
  }
  scene.registerProp(
    'pegboard-tools',
    meshOf('PegboardTools', mergeGeometries(hanging, false) ?? hanging[0], MAT.dark)
  );

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

  /**
    * The set's back panel, off and leaning against the bench edge.
    *
    * Moved twice. It used to stand at x = -0.62, on the exact sightline from the default
    * camera to Mirela, and cut her off at the chest - the one person in the scene, hidden
    * behind a component she had removed. Parked on the near right instead it cleared her
    * and immediately became the second largest flat mass in the frame, a hand's width from
    * the lens and competing with the set. At the BACK right of the bench it does neither:
    * small, behind the plane the set sits on, and still obviously off the radio.
    */
  const panel = new THREE.BoxGeometry(0.36, 0.26, 0.012);
  panel.rotateX(-0.4);
  panel.rotateY(jitter(benchRng, 0.24));
  panel.translate(0.66, 0.94, -0.74);
  /*
   * On its own, in the SET's material rather than the toolbox's.
   *
   * It was merged into the bench clutter and therefore wore MAT.metal - 0.65 metalness -
   * and once it was leaning back at the angle that cleared Mirela it turned its face to
   * the work lamp and came back as a sheet of white card, brighter than the Kestrel-3 it
   * had been unscrewed from. §244: nothing may out-contrast the hero prop, and a part OF
   * the hero prop doing it is the silliest version of that.
   */
  scene.registerProp('set-panel', meshOf('SetPanel', panel, MAT.equipment));

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

  /**
   * Storage under the bench.
   *
   * The lower shelf is a two-metre plank facing straight up at the key, so it arrived as
   * the largest bright area in the frame and sat at the bottom of it doing nothing. Left
   * alone it pulls the eye down and out of the picture. Boxes on it are cheaper than
   * relighting, more honest - nobody keeps a clear shelf under a workbench - and they turn
   * a bright plank into a dark broken line under the lit surface, which is what the bottom
   * of this composition actually needed.
   */
  const understore: THREE.BufferGeometry[] = [];
  for (const [x, w, h, d] of [
    [-0.72, 0.42, 0.26, 0.4],
    [-0.24, 0.3, 0.18, 0.34],
    [0.34, 0.46, 0.3, 0.44],
    [0.82, 0.26, 0.22, 0.3],
  ] as const) {
    const crate = new THREE.BoxGeometry(w, h, d);
    crate.rotateY(jitter(benchRng, 0.18));
    crate.translate(x + jitter(benchRng, 0.04), 0.24 + h / 2, -0.5 + jitter(benchRng, 0.06));
    understore.push(crate);
  }
  scene.registerProp(
    'bench-store',
    meshOf('BenchStore', mergeGeometries(understore, false) ?? understore[0], MAT.timberDark)
  );

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
  addContact(scene, 'Mirela', {
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
  });

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
 * Where the moon is, declared once.
 *
 * The point light and the glow painted into the sky both need it, and a sky whose bright
 * patch is not where the light is coming from is worse than a sky with no bright patch -
 * it tells the eye there are two moons and it cannot see either.
 */
const MOONLIGHT_AT = new THREE.Vector3(-3.4, 5.5, -4.2);

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
   * The night, in four layers (§241).
   *
   * What used to be here was one unlit plane out at z = -19 doing duty as the sea, and a
   * note explaining that a sky plane had been tried and cut for reading as a black slab
   * with a seam. Both problems had the same cause, which is that neither surface was
   * PAINTED - the atmosphere was being asked to supply the gradient, and it fades to one
   * neutral by twenty-six units, so the sea arrived as flat pale grey and the sky as
   * nothing at all.
   *
   * Sky, sea, coast and town now come from geometry/backdrop.ts with their values authored
   * into canvases and the fog switched off. The moon's own position is handed over so the
   * glow in the sky is where the light actually is.
   */
  const backdropRoot = ENGINE.SceneNode.create({ name: 'Night' });
  for (const part of createNightBackdrop(MOONLIGHT_AT)) {
    backdropRoot.add(meshOf(part.name, part.geometry, part.material));
  }
  scene.registerProp('backdrop', backdropRoot);

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
    meshOf('Platform', mergeGeometries(platformPieces, false) ?? deckPlate, MAT.steel)
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
  addContact(scene, 'Tomas', {
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
    // He is six metres up a lattice on a headland at night. The one figure in the cast
    // with weather on him gets the larger idle - still under two centimetres at the head,
    // but visibly more than somebody standing in a kitchen.
    liveliness: 1.7,
  });

  // -- Night ----------------------------------------------------------------
  //
  // Cold moonlight from behind, so the mast and Tomas read as silhouettes with a cool
  // rim, and the beacon's amber is the only warm source in the scene. When it drops,
  // everything goes cold - which is the mission, said in light rather than words.
  scene.registerProp(
    'moon',
    ENGINE.PointLightNode.create({
      name: 'Moonlight',
      position: MOONLIGHT_AT.clone(),
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
const SUNLIGHT_AT = new THREE.Vector3(5.5, 7.5, 1.5);

function buildSeedlingTunnel(scene: ContactScene): void {
  const rng = createRng(seedFrom('adaeze-tunnel'));

  /**
   * The field this is standing in (§241).
   *
   * The set was nine metres of ground surrounded by absolute black - an outdoor scene at
   * midday with no sky, no horizon and no land, in which the neighbour's tree read as a
   * canopy floating unattached above the frame because there was nothing behind it to be
   * attached to. It had quietly become the weakest scene in the game the moment Tomas's
   * headland stopped being it, and for exactly the same reason.
   *
   * Sky, field and hedge come from geometry/backdrop.ts, painted and unlit for the reasons
   * set out there. The sun's own position is handed over so the brightening in the sky is
   * on the bearing the light is actually coming from - which matters more here than on the
   * headland, because this entire request is about where the light is.
   */
  const fieldRoot = ENGINE.SceneNode.create({ name: 'Field' });
  for (const part of createFieldBackdrop(SUNLIGHT_AT)) {
    fieldRoot.add(meshOf(part.name, part.geometry, part.material));
  }
  scene.registerProp('backdrop', fieldRoot);

  /*
   * No ground slab. There used to be a nine-by-seven box of MAT.ground here, and it was
   * standing in for the world - it existed because there was nothing else under the beds.
   * With a field running out to a hedge it became a dark brown rectangle with hard edges
   * lying on grass, which reads as a mat somebody put down rather than as ground. The
   * field IS the ground now, the same call the sea gets on the headland.
   */

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

  /**
   * The trunk, and why it is three pieces instead of one cylinder.
   *
   * It was a single 3.4-metre tube of constant taper, dead vertical, with five limbs
   * fanned off the top in one plane. Against black nobody could tell; against a sky it
   * read as a broom - a pole with sticks on it - and this is the object the entire request
   * is about. A tree is a cone: fat and flared at the ground, tapering hard, and bending
   * toward the light it grew into, which for this one is out over Adaeze's tunnel.
   *
   * Shorter as well as thicker. At 3.4 it was tall and thin enough to look like scaffolding.
   */
  const trunkParts: THREE.BufferGeometry[] = [];
  const flare = new THREE.CylinderGeometry(0.33, 0.54, 0.36, 9);
  flare.translate(0, 0.16, 0);
  trunkParts.push(flare);

  /**
   * Sections placed by their ENDS rather than their centres.
   *
   * `rotateZ` by a positive angle tilts the top toward -x, which is the opposite of what
   * anybody writing "lean toward the tunnel" expects. Translating a rotated cylinder by
   * its intended centre therefore put the upper section's foot 58cm from the lower's head
   * and the trunk came out in two disconnected pieces with daylight between them.
   *
   * `section` takes the point the piece grows FROM and works the offset out, so a joint
   * cannot drift when a lean is edited.
   */
  const section = (
    radiusTop: number,
    radiusBottom: number,
    height: number,
    tilt: number,
    from: THREE.Vector3
  ): { geometry: THREE.BufferGeometry; top: THREE.Vector3 } => {
    const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 9);
    geometry.rotateZ(-tilt);
    const half = new THREE.Vector3(Math.sin(tilt) * height * 0.5, Math.cos(tilt) * height * 0.5, 0);
    const centre = from.clone().add(half);
    geometry.translate(centre.x, centre.y, centre.z);
    return { geometry, top: from.clone().add(half).add(half) };
  };

  const lower = section(0.21, 0.34, 1.85, 0.09, new THREE.Vector3(0, 0.05, 0));
  trunkParts.push(lower.geometry);
  // Started a little inside the section below, so the joint is a taper rather than a step.
  const upper = section(0.115, 0.22, 1.5, 0.23, lower.top.clone().add(new THREE.Vector3(-0.02, -0.1, 0.04)));
  trunkParts.push(upper.geometry);
  treeRoot.add(
    meshOf('TreeTrunk', mergeGeometries(trunkParts, false) ?? flare, MAT.timberDark)
  );

  /**
   * Limbs reaching out over the tunnel - the shape of the whole problem in one prop.
   *
   * Spread in azimuth as well as in lean, so the crown is a mass with depth rather than a
   * fan seen edge-on, and each limb's foliage is placed at the limb's computed TIP rather
   * than at a separately guessed coordinate. The old version had the two sets of numbers
   * drifting apart, which is why the canopy floated clear of the branches holding it.
   */
  const limbs: THREE.BufferGeometry[] = [];
  const canopy: THREE.BufferGeometry[] = [];
  const UP = new THREE.Vector3(0, 1, 0);
  const Z_AXIS = new THREE.Vector3(0, 0, 1);
  const Y_AXIS = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 6; i++) {
    /*
     * Negative, for the reason spelled out on `section` above - and this one was doing
     * real damage rather than a cosmetic one. With a positive lean every limb reached out
     * to -x, which is AWAY from the tunnel, so the crown of the tree the whole request is
     * about sat over open field while the shade it is supposed to be casting lay on the
     * seedlings four metres away. The original hand-placed canopy coordinates were at +x
     * and had been quietly disagreeing with the branches holding them since the scene was
     * written; nobody could see it against a black background.
     */
    const lean = -(0.52 + i * 0.12);
    const swing = -0.62 + i * 0.26;
    const length = 2.45 - i * 0.1;

    // geometry.rotateZ then .rotateY composes as Ry * Rz, so the direction has to be
    // built in the same order or the foliage lands somewhere the branch never went.
    const dir = UP.clone().applyAxisAngle(Z_AXIS, lean).applyAxisAngle(Y_AXIS, swing);
    const from = new THREE.Vector3(0.42 + i * 0.03, 2.78 + i * 0.08, 0.03);

    const limb = new THREE.CylinderGeometry(0.045, 0.1, length, 6);
    limb.rotateZ(lean);
    limb.rotateY(swing);
    const mid = from.clone().addScaledVector(dir, length / 2);
    limb.translate(mid.x, mid.y, mid.z);
    limbs.push(limb);

    // Two blobs per limb, one at the tip and one back along it, so the crown has an
    // interior instead of being a ring of separate balls.
    for (const [t, radius] of [
      [1.0, 0.78 - i * 0.03],
      [0.68, 0.6 - i * 0.02],
    ] as const) {
      const blob = new THREE.SphereGeometry(radius, 8, 6);
      const at = from.clone().addScaledVector(dir, length * t);
      blob.translate(at.x, at.y - 0.06, at.z);
      canopy.push(blob);
    }
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
  addContact(scene, 'Adaeze', {
    seed: 'adaeze-okafor',
    height: 1.71,
    build: 0.42,
    shoulders: 0.46,
    // Crouched at the end of a row, which is where she says she is.
    lean: 0.3,
    reach: 0.8,
    garment: 'apron',
    colors: { garment: '#2f6a72', underlayer: '#d8c9a8' },
    /*
     * Left of frame and near the camera. Mirroring the scene put her behind the
     * conversation panel, which is a poor place for the person doing the talking.
     *
     * Nudged right and forward off the sightline to the tree. At (-1.9, 2.4) she stood
     * exactly between the default camera and the trunk, so the bottom two metres of the
     * tree - including its whole base - were behind her and it read as a log hanging in
     * the air. Being nearer also makes her larger, which she needed.
     */
    position: new THREE.Vector3(-1.12, 0, 2.72),
    rotation: new THREE.Euler(0, Math.PI * 0.13, 0),
  });

  // -- Light ----------------------------------------------------------------
  //
  // High and hard from the west, because the whole request turns on a shadow. A soft key
  // would light both banks evenly and there would be nothing to see.
  scene.registerProp(
    'sun',
    ENGINE.PointLightNode.create({
      name: 'Sun',
      position: SUNLIGHT_AT.clone(),
      intensity: 36,
      color: new THREE.Color('#fff0d0'),
      distance: 26,
      decay: 0.9,
    })
  );

  /**
   * Sky fill, moved round to the camera side.
   *
   * It was at (-2.5, 4.5, 3.5) - nearly straight up from Adaeze - and the sun is out past
   * her at +x. Her apron faces +z and got a grazing angle from both, so the one pale mass
   * on the one person in the scene rendered as a dark grey rectangle and she read as a
   * silhouette in full daylight. This is the same fault Ileana had and the same fix: put
   * some of the ambient where the camera is, because a figure lit only from behind has no
   * front however carefully the front was built (§235).
   */
  scene.registerProp(
    'skyfill',
    ENGINE.PointLightNode.create({
      name: 'SkyFill',
      position: new THREE.Vector3(-0.6, 3.6, 6.2),
      intensity: 15,
      color: new THREE.Color('#9fc0d8'),
      distance: 18,
      decay: 1.15,
    })
  );

  // -- Shots ----------------------------------------------------------------
  scene.registerShot('default', {
    // Down the tunnel, so both banks are in frame at once and the difference between
    // them is the first thing read.
    // Outside the mouth and above it. From inside, the nearest hoop sat across the lens
    // and the two banks - the entire puzzle - were behind it.
    //
    // Tilted up and pulled back once there was a sky to tilt into. The neighbour's tree
    // is the cause of the whole request and its crown was cropped by the top edge, so the
    // player could see the shade on the failing rows and not the thing casting it.
    position: new THREE.Vector3(1.45, 3.65, 7.7),
    target: new THREE.Vector3(-1.4, 1.3, -0.6),
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
 * What is left in a room somebody is emptying (§241).
 *
 * The set was a floor, a wall, a table and a stack of chairs, and the doc comment called
 * that deliberate - "the way to say a house has had the life taken out of it is empty wall
 * and stacked chairs rather than more props". That reading is right and the execution was
 * not: an empty room and an unfinished room look identical in a still, and this one read
 * as unfinished. The difference between them is EVIDENCE OF REMOVAL, which is a different
 * thing from clutter and mostly is not props at all.
 *
 * Four things, in descending order of how much they say per unit of geometry:
 *
 * 1. The marks where the pictures were. Pure value - a rectangle of wall a shade lighter
 *    than the wall around it, because the paper under a frame does not fade, with a dust
 *    line at its edge and the hook still in above it. It is the only item here that is
 *    not an object, and it says more than the other three together.
 * 2. Packing boxes, some labelled. §240 - KITCHEN, BOOKS, KEEP, and one that says WHO?
 * 3. Newspaper on the floor, for wrapping. It also gives the largest empty plane in the
 *    frame something to break it.
 * 4. A rolled rug against the wall. One diagonal in a room made entirely of rectangles.
 *
 * §232: every wall mark stays within 9% of MAT.wall's own value and carries its contrast
 * in the dust line, which is two pixels wide. The boxes are MAT.card and sit between the
 * floor and the table in value, so nothing here competes with the window or the photographs.
 */
function dressClearedHouse(scene: ContactScene, rng: ReturnType<typeof createRng>): void {
  // -- Where the pictures were ----------------------------------------------
  const ghosts: THREE.BufferGeometry[] = [];
  const dust: THREE.BufferGeometry[] = [];
  const hooks: THREE.BufferGeometry[] = [];

  // [x, y, width, height] on the back wall. Different sizes and one portrait, because a
  // wall of matching frames is a gallery and this was somebody's front room.
  const hung: ReadonlyArray<readonly [number, number, number, number]> = [
    [1.35, 1.72, 0.52, 0.42],
    [2.25, 1.5, 0.34, 0.46],
    [1.86, 2.24, 0.66, 0.3],
    [-1.62, 1.62, 0.4, 0.52],
  ];
  for (const [x, y, w, h] of hung) {
    const patch = new THREE.PlaneGeometry(w, h);
    patch.translate(x, y, -2.021);
    ghosts.push(patch);

    // The dust line: a thin border just outside the patch, darker than the wall. This is
    // where the contrast lives, so the patch itself can stay almost invisible.
    for (const [bw, bh, dx, dy] of [
      [w + 0.02, 0.009, 0, h / 2],
      [w + 0.02, 0.009, 0, -h / 2],
      [0.009, h, -w / 2, 0],
      [0.009, h, w / 2, 0],
    ] as const) {
      const edge = new THREE.PlaneGeometry(bw, bh);
      edge.translate(x + dx, y + dy, -2.019);
      dust.push(edge);
    }

    // The hook, still in the wall. Nobody takes the hooks out.
    const hook = new THREE.BoxGeometry(0.018, 0.03, 0.02);
    hook.translate(x + jitter(rng, 0.02), y + h / 2 + 0.09, -2.015);
    hooks.push(hook);
  }

  scene.registerProp(
    'wall-marks',
    meshOf(
      'WallMarks',
      mergeGeometries(ghosts, false) ?? ghosts[0],
      // Lighter than MAT.wall by about 8%, and nothing else. Paper under a frame does not
      // fade; that is the entire physical claim and the entire budget.
      new THREE.MeshStandardMaterial({ color: '#756858', roughness: 0.93 })
    )
  );
  scene.registerProp(
    'wall-dust',
    meshOf(
      'WallDust',
      mergeGeometries(dust, false) ?? dust[0],
      new THREE.MeshStandardMaterial({ color: '#4d4438', roughness: 0.97 })
    )
  );
  scene.registerProp(
    'picture-hooks',
    meshOf('PictureHooks', mergeGeometries(hooks, false) ?? hooks[0], MAT.metal)
  );

  // -- Packing boxes --------------------------------------------------------
  //
  // Along the wall by the door, where things go when a room is being emptied into a hall.
  interface Carton {
    /** Foot of the box, at floor level. */
    at: THREE.Vector3;
    size: THREE.Vector3;
    turn: number;
    /**
     * What is written on it, and which way that face points before the box is turned.
     *
     * The face matters and cost an iteration to learn: the first three labels all went on
     * the +z faces, which for the stack by the door is the side AWAY from the only light
     * in the room. They were present, correct and unreadable, and the one that matters
     * says WHO? - which is Ileana's entire request, written on cardboard, in shadow.
     */
    label?: { text: string; face: 'x' | 'z' };
  }

  const stack: Carton[] = [
    {
      at: new THREE.Vector3(-3.0, 0, -1.55),
      size: new THREE.Vector3(0.5, 0.44, 0.44),
      turn: 0.08,
      label: { text: 'KITCHEN', face: 'x' },
    },
    {
      at: new THREE.Vector3(-2.98, 0.44, -1.53),
      size: new THREE.Vector3(0.46, 0.36, 0.42),
      turn: -0.14,
      label: { text: 'WHO?', face: 'x' },
    },
    { at: new THREE.Vector3(-2.45, 0, -1.75), size: new THREE.Vector3(0.42, 0.38, 0.4), turn: 0.22 },
    {
      at: new THREE.Vector3(2.9, 0, -1.6),
      size: new THREE.Vector3(0.52, 0.46, 0.44),
      turn: -0.1,
      label: { text: 'BOOKS', face: 'z' },
    },
    { at: new THREE.Vector3(2.86, 0.46, -1.58), size: new THREE.Vector3(0.44, 0.34, 0.4), turn: 0.17 },
  ];

  const cartons: THREE.BufferGeometry[] = [];
  for (const box of stack) {
    const carton = new THREE.BoxGeometry(box.size.x, box.size.y, box.size.z);
    carton.rotateY(box.turn);
    carton.translate(box.at.x, box.at.y + box.size.y / 2, box.at.z);
    cartons.push(carton);

    if (!box.label) continue;
    const texture = createBoxLabel(box.label.text);
    if (!texture) continue;

    // rotateY(phi) sends the quad's own +z to (sin phi, 0, cos phi), so asking for the
    // x face is the same rotation plus a quarter turn. The label is then pushed out along
    // that normal rather than along an axis, which is what keeps it on the box when the
    // box is turned.
    const phi = box.turn + (box.label.face === 'x' ? Math.PI / 2 : 0);
    const normal = new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi));
    const half = (box.label.face === 'x' ? box.size.x : box.size.z) / 2;

    const width = Math.min(box.size.z, box.size.x) * 0.78;
    const quad = new THREE.PlaneGeometry(width, width * 0.5);
    quad.rotateY(phi);
    const seat = box.at
      .clone()
      .setY(box.at.y + box.size.y * 0.52)
      .add(normal.clone().multiplyScalar(half + 0.006));
    quad.translate(seat.x, seat.y, seat.z);

    scene.registerProp(
      `label-${box.label.text}`,
      meshOf(`Label${box.label.text}`, quad, decalMaterial(texture, 0.95))
    );
  }
  scene.registerProp(
    'boxes',
    meshOf('Boxes', mergeGeometries(cartons, false) ?? cartons[0], MAT.card)
  );

  // -- Newspaper, for wrapping ----------------------------------------------
  //
  // Sheets rather than a stack: they have been pulled off the pile and used. This is also
  // the only thing breaking the largest empty plane in the shot.
  const sheets: THREE.BufferGeometry[] = [];
  for (const [x, z] of [
    [-2.35, -1.15],
    [-1.95, -0.72],
    [-2.62, -0.55],
    [2.35, -1.05],
  ] as const) {
    const sheet = new THREE.PlaneGeometry(0.34, 0.44);
    sheet.rotateX(-Math.PI / 2);
    sheet.rotateY(jitter(rng, 1.4));
    sheet.translate(x + jitter(rng, 0.12), 0.004, z + jitter(rng, 0.12));
    sheets.push(sheet);
  }
  scene.registerProp(
    'newspaper',
    meshOf(
      'Newspaper',
      mergeGeometries(sheets, false) ?? sheets[0],
      // Newsprint, not writing paper: a clear step down from MAT.paper so it does not
      // pull the eye off the envelopes on the table, which are the ones that matter.
      new THREE.MeshStandardMaterial({ color: '#9c9382', roughness: 0.98, side: THREE.DoubleSide })
    )
  );

  // -- The rug ---------------------------------------------------------------
  // Rolled and leaning. One diagonal in a room built entirely from rectangles.
  const rug = new THREE.CylinderGeometry(0.13, 0.14, 1.9, 9);
  rug.rotateX(0.28);
  rug.rotateZ(0.16);
  rug.translate(-3.05, 0.94, -0.35);
  scene.registerProp('rug', meshOf('Rug', rug, MAT.timberDark));
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
  scene.registerProp('floor', meshOf('Floor', floor, MAT.floorboard));

  /**
   * The back wall, built around a doorway, and a side wall so the room has a corner.
   *
   * Two problems, one fix. The set was a single slab seven metres wide with a floor and
   * nothing else, so a camera pulled back far enough to hold the window and the table at
   * once looked straight off the left edge of the world into black - which is not "a house
   * with the life taken out of it", it is a missing wall.
   *
   * And the doorway is the best value in the room. §241 asks for layers rather than props:
   * a dark opening is a layer - it puts the deepest value in the frame at the far end of
   * the longest sightline, gives the left third of the shot something to be, and says the
   * rest of the house is unlit without a single object being added to say it.
   */
  const DOOR = { x: -2.25, width: 0.92, head: 2.06 } as const;
  /**
   * Wall height, and why it is not three metres.
   *
   * At three the pulled-back camera looked clean over the top of the side wall into the
   * void it had just been built to hide - a hard horizontal edge across the top left of
   * frame with nothing above it. Rooms in old coastal houses have high ceilings anyway.
   */
  const WALL_TOP = 3.8;
  const wallPieces: THREE.BufferGeometry[] = [];
  const doorL = DOOR.x - DOOR.width / 2;
  const doorR = DOOR.x + DOOR.width / 2;

  const leftOfDoor = new THREE.BoxGeometry(doorL + 3.5, WALL_TOP, 0.15);
  leftOfDoor.translate((doorL - 3.5) / 2, WALL_TOP / 2, -2.1);
  wallPieces.push(leftOfDoor);

  const rightOfDoor = new THREE.BoxGeometry(3.5 - doorR, WALL_TOP, 0.15);
  rightOfDoor.translate((doorR + 3.5) / 2, WALL_TOP / 2, -2.1);
  wallPieces.push(rightOfDoor);

  const overDoor = new THREE.BoxGeometry(DOOR.width, WALL_TOP - DOOR.head, 0.15);
  overDoor.translate(DOOR.x, (DOOR.head + WALL_TOP) / 2, -2.1);
  wallPieces.push(overDoor);

  // The side wall. Far enough left to be off the shot's centre and close enough to cut
  // the void; it catches almost nothing from either light, which is the point.
  const sideWall = new THREE.BoxGeometry(0.15, WALL_TOP, 4.8);
  sideWall.translate(-3.3, WALL_TOP / 2, 0.3);
  wallPieces.push(sideWall);

  scene.registerProp(
    'wall',
    meshOf('Wall', mergeGeometries(wallPieces, false) ?? leftOfDoor, MAT.wall)
  );

  // What is behind the door: nothing, at the darkest value in the scene. Unlit, because a
  // lit surface back there would pick up the room's own fill and read as a cupboard.
  const hall = new THREE.PlaneGeometry(DOOR.width, DOOR.head);
  hall.translate(DOOR.x, DOOR.head / 2, -2.24);
  scene.registerProp(
    'hall',
    meshOf('Hall', hall, new THREE.MeshBasicMaterial({ color: '#100d0b', toneMapped: false }))
  );

  // The frame round it, so the opening is a door and not a hole knocked in plaster.
  const casing: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    const jamb = new THREE.BoxGeometry(0.07, DOOR.head, 0.09);
    jamb.translate(DOOR.x + (sx * (DOOR.width + 0.07)) / 2, DOOR.head / 2, -2.02);
    casing.push(jamb);
  }
  const lintel = new THREE.BoxGeometry(DOOR.width + 0.14, 0.07, 0.09);
  lintel.translate(DOOR.x, DOOR.head + 0.035, -2.02);
  casing.push(lintel);
  scene.registerProp(
    'door-casing',
    meshOf('DoorCasing', mergeGeometries(casing, false) ?? lintel, MAT.timber)
  );

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

  /**
   * A curtain rail with nothing on it.
   *
   * The doc comment on this scene has said "the curtains taken down" since it was
   * written and there has never been a rail to take them off. One dark horizontal above
   * a blown-out window is the cheapest sentence in the room: rails do not come down when
   * curtains do, so an empty one is somebody halfway through leaving.
   */
  const railParts: THREE.BufferGeometry[] = [];
  const rail = new THREE.CylinderGeometry(0.016, 0.016, 1.86, 8);
  rail.rotateZ(Math.PI / 2);
  rail.translate(-0.2, 2.43, -1.93);
  railParts.push(rail);
  for (const sx of [-1, 1]) {
    const bracket = new THREE.BoxGeometry(0.035, 0.06, 0.11);
    bracket.translate(-0.2 + sx * 0.86, 2.4, -1.99);
    railParts.push(bracket);
  }
  scene.registerProp(
    'curtain-rail',
    meshOf('CurtainRail', mergeGeometries(railParts, false) ?? rail, MAT.dark)
  );

  dressClearedHouse(scene, rng);

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

  /**
   * Two chairs, one stacked on the other - and the second one has legs.
   *
   * The first version stacked only the SEATS: three slabs at y 0.46, 0.59 and 0.72 with
   * eight centimetres of air between them and nothing underneath the upper two. It was
   * meant to say "the furniture is being piled up" and it said "two planks are hovering
   * over a chair", which is what a playtester saw. A stacked chair is not a seat at a
   * higher y; it is a whole chair whose legs are resting in the seat below it.
   *
   * Built from one description used twice so the two cannot drift apart, and the upper
   * one is turned and dropped into the lower one's seat rather than balanced on its rim.
   */
  const stack: THREE.BufferGeometry[] = [];

  const addChair = (at: THREE.Vector3, turn: number, legLength: number): void => {
    const parts: THREE.BufferGeometry[] = [];

    const seat = new THREE.BoxGeometry(0.42, 0.05, 0.42);
    seat.translate(0, legLength + 0.025, 0);
    parts.push(seat);

    // Back posts and rails, rising from the rear edge of the seat.
    for (const sx of [-1, 1] as const) {
      const post = new THREE.BoxGeometry(0.05, 0.52, 0.05);
      post.translate(sx * 0.185, legLength + 0.31, -0.185);
      parts.push(post);
    }
    for (const y of [0.22, 0.44] as const) {
      const rail = new THREE.BoxGeometry(0.33, 0.06, 0.03);
      rail.translate(0, legLength + y + 0.05, -0.185);
      parts.push(rail);
    }

    for (const [lx, lz] of [
      [-0.185, -0.185],
      [0.185, -0.185],
      [-0.185, 0.185],
      [0.185, 0.185],
    ] as const) {
      const leg = new THREE.BoxGeometry(0.05, legLength, 0.05);
      leg.translate(lx, legLength / 2, lz);
      parts.push(leg);
    }

    const chair = mergeGeometries(parts, false) ?? seat;
    chair.rotateY(turn);
    chair.translate(at.x, at.y, at.z);
    stack.push(chair);
  };

  // The lower chair, and the upper one sitting down into it: its short legs end at the
  // lower seat's surface, which is exactly where a stacked chair's feet go.
  addChair(new THREE.Vector3(1.75, 0, -1.5), 0.1 + jitter(rng, 0.06), 0.44);
  addChair(new THREE.Vector3(1.72, 0.465, -1.46), -0.22 + jitter(rng, 0.06), 0.12);

  scene.registerProp(
    'chairs',
    meshOf('Chairs', mergeGeometries(stack, false) ?? stack[0], MAT.timberDark)
  );

  addContact(scene, 'Ileana', {
    seed: 'ileana-marku',
    height: 1.66,
    build: 0.4,
    shoulders: 0.44,
    // Sitting forward over the table, which is where somebody is after two days of this.
    lean: 0.34,
    reach: 0.6,
    garment: 'coat',
    colors: { garment: '#4a4a52', underlayer: '#b3a58a' },
    /**
     * Behind the table, not beside it.
     *
     * She used to stand at the near corner, between the camera and her own work, which put
     * the one person in the scene in the foreground with her back three-quarters turned and
     * the thing she is asking about behind her. Across the table she faces the camera over
     * the box, the window is behind her shoulder, and the player is looking at a person and
     * the problem in one read instead of choosing between them.
     */
    position: new THREE.Vector3(-1.0, 0, -1.72),
    rotation: new THREE.Euler(0, Math.PI * 0.2, 0),
    // Slower and smaller than the rest of the cast. She has been sorting a dead relative's
    // photographs for two days; the difference between her idle and Mirela's is the only
    // characterisation available without faces.
    liveliness: 0.7,
  });

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
   * The bare bulb, and the light that was already pretending to be one.
   *
   * The fill in this room is not optional: Ileana's only real light is the window behind
   * her, so without it she was a black cut-out facing away however she was actually
   * turned. But it was a point hanging in mid-air two metres to camera-right of her with
   * nothing there to be emitting it - the same fault §230 found over the workstation desk
   * and the desk lamp was built to fix.
   *
   * So it moves into a fixture. A flex, a rose and a bulb with no shade on it, over the
   * table, which is where the one working light in a house being emptied would be: the
   * shade came down with the curtains. It is closer to her than the old fill was, so the
   * intensity comes down to match, and now the warm side of every object in the room
   * points at a thing the player can see.
   */
  // Off the window's centre line. Hung at x 0.5 the flex ran straight down the middle of
  // the brightest rectangle in the frame and crossed the curtain rail on the way.
  const BULB = new THREE.Vector3(0.92, 1.98, -0.42);
  const fitting: THREE.BufferGeometry[] = [];
  const flex = new THREE.CylinderGeometry(0.009, 0.009, WALL_TOP - BULB.y, 6);
  flex.translate(BULB.x, (WALL_TOP + BULB.y) / 2, BULB.z);
  fitting.push(flex);
  const rose = new THREE.CylinderGeometry(0.045, 0.045, 0.05, 10);
  rose.translate(BULB.x, BULB.y + 0.03, BULB.z);
  fitting.push(rose);
  scene.registerProp(
    'light-fitting',
    meshOf('LightFitting', mergeGeometries(fitting, false) ?? flex, MAT.dark)
  );

  const glass = new THREE.SphereGeometry(0.042, 10, 8);
  glass.translate(BULB.x, BULB.y - 0.03, BULB.z);
  scene.registerProp('bulb', meshOf('Bulb', glass, MAT.lamp));

  scene.registerProp(
    'roomfill',
    ENGINE.PointLightNode.create({
      name: 'RoomFill',
      position: BULB.clone(),
      // Halved from 13: it used to be four metres from her and is now two, and a fill that
      // moved closer without coming down would have brightened the person while the §243
      // note about scenes getting darker looked the other way.
      intensity: 7,
      color: new THREE.Color('#ffd0a0'),
      distance: 5.5,
      decay: 1.3,
    })
  );

  scene.registerShot('default', {
    /**
     * Across the table, so the box, the envelopes and Ileana are all in one frame - the
     * three things the request is made of.
     *
     * Pulled back and raised from 1.15/1.42/1.35, which was a metre and a half from a
     * standing figure: she filled the left third cropped at the crown, the window was cut
     * off by the top edge, and the stacked chairs - the one prop that says the house is
     * being emptied - were entirely outside the frame. At four metres the 46-degree lens
     * holds three and a half metres of height, so she is about half the frame: present,
     * uncropped, and not the only thing in it.
     */
    position: new THREE.Vector3(2.15, 1.78, 2.0),
    target: new THREE.Vector3(-0.35, 1.02, -1.15),
  });
  scene.registerShot('photo-box', {
    // Still over her shoulder rather than square on the box. Same trade as Mirela's
    // transmitter shot: losing the person the moment the player looks closely at the
    // object is the wrong swap every time.
    position: new THREE.Vector3(0.62, 1.18, 0.2),
    target: new THREE.Vector3(-0.48, 0.84, -1.14),
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
