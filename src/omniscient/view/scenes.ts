/**
 * ## CONTACT FRAMING - measure this, do not eyeball it
 *
 * A diorama's default shot has to hold the contact AND the thing the request is about, and
 * the failure mode is always the same one: the person ends up ON the camera's sightline to
 * its own target, which puts a 1.7m figure exactly over the evidence. It has happened in
 * three scenes now - Vasile at 0.00 off axis, Dorin at 0.02, Ileana cropped at the crown -
 * and every time it looked fine while the numbers were being typed.
 *
 * The number to check is the contact's PERPENDICULAR distance from the line between camera
 * position and camera target. Below about 0.35m they occlude the subject; 0.45 to 0.9 puts
 * them in frame beside it, which is what these shots want.
 *
 *     const d = target - position, u = normalise(d)
 *     const r = contact - position
 *     perp = |r - (r . u) u|
 *
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
import { CERTAINTY } from '../art/certainty.js';
import { createFloodwater } from '../art/floodwater.js';
import { createTorchlight } from '../art/torchlight.js';
import { applyWaterline } from '../art/waterline.js';
import { aimLight, applyShadowPolicy, castShadows } from '../art/shadows.js';
import { placeRigged } from './riggedContact.js';
import { ACCENT, LIGHT, MAP, MAT } from '../art/palette.js';
import { decalMaterial, texturedFrom } from '../art/surface.js';
import { createRng, jitter, range, seedFrom } from '../core/rng.js';

import type { Rng } from '../core/rng.js';
import { Ease } from '../core/tween.js';
import { createFieldBackdrop, createNightBackdrop } from '../geometry/backdrop.js';
import { buildTree } from '../geometry/tree.js';
import { clouds } from '../geometry/clouds.js';
import { DISTRICT_CITY, DISTRICT_FLEET, DISTRICT_SIZE } from '../content/district-07.js';
import { CELL, cellToWorld } from '../geometry/wireCity.js';
import { createClump } from './../geometry/foliage.js';
import { grassTufts, greenhouse, rocks } from '../geometry/outdoors.js';
import { meadow, meadowGround, stepWind, WIND } from '../geometry/meadow.js';
import { stylisedWater } from '../geometry/water.js';
import { rows, scatter } from '../geometry/planting.js';
import {
  createMainsSwitch,
  createShelfStack,
  createTransmitter,
  createWorkbench,
} from '../geometry/props.js';

/*
 * The fact ids, imported rather than typed out as strings.
 *
 * A scene that reveals props on `'connector_b_corrosion'` and a mission that teaches
 * `FACT_CONNECTOR_CORROSION` agree until somebody renames one of them, and then they fail
 * in the worst available way: silently, with the room simply never warming up. Importing
 * the constant makes that a build error instead.
 */
import {
  FACT_CONNECTOR_CORROSION,
  FACT_SHARED_POWER_FEED,
  FACT_WORKSHOP_FLOODS,
} from '../content/mission-01-transmitter.js';
import {
  FACT_BEACON_DROPS_ON_KEYUP,
  FACT_FEED_NEEDS_ISOLATOR,
} from '../content/mission-02-beacon.js';
import {
  FACT_EQUIPMENT_FINE,
  FACT_SHADE_LINE,
  FACT_TREE_GREW,
} from '../content/mission-03-tunnel.js';
import {
  FACT_FLOOD_TOOK_RECORDS,
  FACT_ILEANA_LINE,
  FACT_NAMES_ON_PHOTOGRAPHS,
} from '../content/mission-04-relations.js';
import {
  FACT_CELLAR_RUN,
  FACT_PIECEMEAL_PLUMBING,
  FACT_PUMP_IS_FINE,
} from '../content/mission-05-cellar.js';
import {
  FACT_DORIN_HANDS,
  FACT_OLD_LOCK_WORN,
  FACT_PINS_BIND_BY_TOLERANCE,
} from '../content/mission-06-lock.js';

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
/**
 * The cast, as modelled assets.
 *
 * Written out one literal path per line, and that is not laziness about a loop: the asset
 * pipeline scans source for literal `@project/...` strings to decide what to publish, so a
 * path built from a name is invisible to it and 404s at runtime in a build that compiles
 * and lints clean. That already cost an afternoon over three grass models.
 *
 * A name missing from this map falls back to the generator, which is what keeps the swap
 * reversible per character rather than all or nothing.
 */
const RIGGED_CAST: Record<string, string> = {
  Mirela: '@project/assets/models/Mirela.glb',
  Tomas: '@project/assets/models/Tomas.glb',
  Adaeze: '@project/assets/models/Adaeze.glb',
  Ileana: '@project/assets/models/Ileana.glb',
  Vasile: '@project/assets/models/Vasile.glb',
  Dorin: '@project/assets/models/Dorin.glb',
  Sanda: '@project/assets/models/Sanda.glb',
};

/**
 * Place a contact - modelled if there is one for them, generated otherwise.
 *
 * The two paths deliberately take the SAME placement. Height, facing and hand targets were
 * authored against the generator and every one of them still means what it meant; a rigged
 * character is a different way of drawing the person, not a different person. That is also
 * what makes this reversible: delete a line from RIGGED_CAST and the generated one comes
 * back, in the same place, holding the same thing.
 */
function addContact(
  scene: ContactScene,
  name: string,
  placement: CharacterPlacement,
  options: { hidden?: boolean } = {}
): void {
  const modelUrl = RIGGED_CAST[name];
  if (modelUrl && !options.hidden) {
    const rigged = placeRigged(name, {
      modelUrl,
      position: placement.position,
      rotation: placement.rotation,
      // The generator treats height as optional and defaults it; a modelled character has
      // to be scaled to something, so the same default is applied here rather than left to
      // whatever size the exporter happened to produce.
      height: placement.height ?? 1.7,
      // The longest clip in the file - see riggedContact.ts for why not the first.
      clip: true,
      handsOn: placement.handsOn,
    });
    scene.registerProp('contact', rigged.root, { idle: rigged.idle });
    return;
  }

  const contact = placeCharacter(name, placement);
  // Hidden rather than skipped: the prop stays registered so cues that highlight or move
  // the contact still resolve, and switching back is one flag rather than an edit.
  contact.root.visible = !options.hidden;
  scene.registerProp('contact', contact.root, { idle: contact.idle });
}

/**
 * Plank seams, as geometry.
 *
 * This is the bill for the flat pass. Wood grain used to break up a floor; with the grain
 * gone a floor is one uninterrupted plane, and a large flat plane reads as a missing
 * texture rather than as a style. The fix is not to put the noise back - it is to break
 * the plane with the thing that actually divides a real floor, which is the joint between
 * one board and the next.
 *
 * Thin dark slabs laid proud of the surface rather than grooves cut into it: a groove
 * needs a shadow to read and this project has no cast shadows, so a groove is invisible
 * and a raised seam is not. Slightly irregular spacing, because a floor of perfectly
 * even boards is the same sterility the grain was hiding.
 */
function plankSeams(
  rng: Rng,
  options: {
    /** Centre of the run. */
    at: THREE.Vector3;
    /** Total width across the boards, and length along them. */
    width: number;
    length: number;
    /** Nominal board width. Actual spacing wanders either side of it. */
    board: number;
    /** True when boards run along z; false for along x. */
    alongZ?: boolean;
  }
): THREE.BufferGeometry {
  const { at, width, length, board, alongZ = true } = options;
  const pieces: THREE.BufferGeometry[] = [];

  for (let offset = -width / 2 + board; offset < width / 2 - 0.01; offset += board) {
    const wander = jitter(rng, board * 0.12);
    const seam = alongZ
      ? new THREE.BoxGeometry(0.012, 0.004, length)
      : new THREE.BoxGeometry(length, 0.004, 0.012);
    seam.translate(
      at.x + (alongZ ? offset + wander : 0),
      at.y,
      at.z + (alongZ ? 0 : offset + wander)
    );
    pieces.push(seam);
  }

  return mergeGeometries(pieces, false) ?? pieces[0];
}

/**
 * MISSION 01 - Mirela's repair shop.
 *
 * The set sits on a bench facing the camera. Its rear connectors are real geometry, so
 * "show me the back" is an actual reveal rather than a line of dialogue (§131).
 */
function buildRepairShop(scene: ContactScene): void {
  const rng = createRng(seedFrom('mirela-shop'));

  // Floor and back wall - background mass, not detail (§186).
  const floor = new THREE.BoxGeometry(8, 0.1, 6);
  floor.translate(0, -0.05, 0);
  scene.registerProp('floor', meshOf('Floor', floor, MAT.ground));

  /**
   * Board joints, running with the bench.
   *
   * The other half of the flat pass's bill. This floor is concrete-coloured and eight
   * metres of it fills the bottom of every shot in the room with one unbroken value - and
   * with the plaster generator gone there is nothing left to break it. Wider spacing than
   * Ileana's floorboards, so it reads as a plank deck over a workshop floor rather than as
   * a domestic room.
   */
  scene.registerProp(
    'floor-seams',
    meshOf(
      'FloorSeams',
      plankSeams(rng, {
        at: new THREE.Vector3(0, 0.001, 0),
        width: 8,
        length: 6,
        board: 0.34,
        alongZ: false,
      }),
      MAT.timberDark
    )
  );

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
   * Growth over the top of the board - §264, and the second interior that admits the theme.
   *
   * Placed by the rule the console room's vines cost a capture to establish: foliage needs a
   * bright background or a light on it, because green on unlit surface measures single
   * digits and reads as cable. The pegboard is the brightest large field in this set and it
   * is a dense mid-value texture, so a dark leaf on it separates without anything having to
   * be lit specially for it.
   *
   * A short fringe along the top edge rather than runners down the face. Mirela's tools are
   * evidence (§131) - the player reads this wall - and growth hanging across a spanner is
   * decoration that has started charging rent. Along the top it says the building is losing
   * without covering a single thing anybody needs to see.
   */
  /*
   * No ivy on the pegboard, and this is the second time that decision has been made.
   *
   * §264 wants the theme in the interiors and this wall looked like the place for it: the
   * brightest large field in the set, dense mid-value texture, exactly the bright background
   * the console room's vines proved foliage needs. It was built, and it never read as a
   * plant - at this camera distance createVine's leaves are 3-7cm and resolve to nothing,
   * so four runners came out as green squiggles on a workshop wall. Three passes went into
   * it: denser leaves, a wandering path, and a genuine bug where the mapping painted the
   * STEM with the leaf material. None of them fixed the actual problem, which is that the
   * prop is too small to read from where the camera stands.
   *
   * §274 decides it. Mirela's tools are evidence the player has to read, and a decoration
   * that does not carry a clue, say who works here, or build depth is cut - especially one
   * adding line noise to the one surface in the shot that has a job.
   *
   * If this comes back it needs bigger leaves authored for this distance, not a fourth
   * attempt at the same geometry.
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

  /**
   * The shelf, and separately the things on it.
   *
   * One prop until the SUSPECTED tier was built, at which point the whole unit - frame,
   * shelves and all - became a single black volume filling the left third of the frame.
   * That is wrong twice over. Compositionally it replaces the only vertical rhythm on that
   * side of the room with a slab. Fictionally it is a lie: Mirela is standing in her own
   * workshop describing a radio, and the machine has no reason whatever to doubt that she
   * has a SHELF. What nobody has said a word about is what is in the boxes on it.
   *
   * Split, the image says the true thing and is better for it - a real shelf, holding
   * volumes the machine has drawn a box around. The unresolved sits inside the resolved,
   * which is the shape every good version of this idea has.
   *
   * Two roots rather than one parent with two children, because registerProp reparents to
   * the scene and a child's local position would survive the move while its parent's did
   * not. That has already put a connector on the floor for several weeks - see the note on
   * connector-b, which is the same mistake with a different prop.
   */
  const shelf = createShelfStack('mirela-shelf');
  const SHELF_AT = new THREE.Vector3(-2.1, 0, -1.4);

  const shelfRoot = ENGINE.SceneNode.create({ name: 'Shelf', position: SHELF_AT.clone() });
  shelfRoot.add(meshOf('ShelfBody', shelf.body, MAT.timber));
  scene.registerProp('shelf', shelfRoot);

  const crateRoot = ENGINE.SceneNode.create({ name: 'ShelfCrates', position: SHELF_AT.clone() });
  crateRoot.add(meshOf('ShelfCrateMesh', shelf.fittings, MAT.plastic));
  scene.registerProp('shelf-crates', crateRoot);

  const bench = createWorkbench();
  const benchRoot = ENGINE.SceneNode.create({ name: 'Bench', position: new THREE.Vector3(0, 0, -0.5) });
  // Worked, not fresh. The bench was measuring brighter than the set standing on it - see
  // MAT.worktop, which exists because of this frame.
  benchRoot.add(meshOf('BenchTop', bench.body, MAT.worktop));
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
  /*
   * Stood up. The last fix moved it and did not lower it.
   *
   * Measured as regions rather than as pixels, which is the reading that finally caught it:
   * the panel's MEAN is 163 against the Kestrel's 144. Peak brightness said the set was
   * winning - it reaches 210 on one corner - and peak brightness is not what the eye ranks.
   * A large flat slab at a uniform value beats a smaller object with internal variation
   * every time, so §244 was still being broken by the part that had already been fixed for
   * breaking it.
   *
   * At -0.4 the face was tilted 23 degrees back, which puts 39% of its normal straight up
   * into the work lamp. At -0.18 it is 18%, and it is also the truer lean: a panel propped
   * against the back of a bench stands nearly upright, it does not recline.
   */
  panel.rotateX(-0.18);
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
  scene.registerProp('set-panel', meshOf('SetPanel', panel, MAT.equipmentBack));

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

  /**
   * Screws, in the lid of a tin because that is where they always end up.
   *
   * This was a capped decagon 11cm across in MAT.plastic - which the palette's own comment
   * calls the lightest thing in the room - lying flat on the bench with its top face square
   * to the key, twenty centimetres off the radio's front corner. It read as exactly what it
   * was: a white disc. Somebody looking at the shot asked what it was, which is the only
   * review a prop ever really gets.
   *
   * The fault is SILHOUETTE, not colour (ART_DIRECTION §4.1), so the colour law was never
   * going to reach it - a flat circle is a flat circle at any value, and the cooling it
   * already had just made it a cooler flat circle. What makes a lid read as a lid is a rim
   * you can see over and contents breaking the line: a recessed floor in its own shadow, a
   * bright rim catching the lamp, and screws lying across each other at angles. Three
   * values on one object, which §4.2 asks for and a solid fill cannot give.
   *
   * Metal rather than plastic, too. A tin is a tin.
   */
  const TIN_AT = new THREE.Vector3(0.24, 0.814, -0.3);

  // The floor of the lid, sunk below the rim so the inside sits in its own shadow.
  const tinFloor = new THREE.CylinderGeometry(0.052, 0.05, 0.004, 12);
  tinFloor.translate(TIN_AT.x, TIN_AT.y + 0.002, TIN_AT.z);

  /*
   * The rim as a torus rather than a wall. An open-ended cylinder is the obvious way to
   * make one and needs a double-sided material to survive being looked into, and every
   * material in this room is front-faced - so the near wall would vanish and the lid would
   * read as a hole in the bench.
   */
  const tinRim = new THREE.TorusGeometry(0.0525, 0.0035, 5, 18);
  tinRim.rotateX(Math.PI / 2);
  tinRim.translate(TIN_AT.x, TIN_AT.y + 0.005, TIN_AT.z);
  const tinMetal: THREE.BufferGeometry[] = [tinRim];

  /*
   * Nine screws, lying down and crossing each other.
   *
   * Lying down because that is what loose screws in a shallow lid do, and crossing because
   * anything radial would read as a diagram of screws rather than a pile of them. Two
   * heights, so they overlap. The heads stand a couple of millimetres proud of the rim,
   * which is the entire reason this stops being a circle - the outline now has notches in
   * it, and notches are what the eye reads at a squint.
   */
  for (let i = 0; i < 9; i++) {
    const angle = range(benchRng, 0, Math.PI * 2);
    const dist = range(benchRng, 0, 0.03);
    const yaw = range(benchRng, 0, Math.PI * 2);
    const length = range(benchRng, 0.018, 0.026);
    const x = TIN_AT.x + Math.cos(angle) * dist;
    const z = TIN_AT.z + Math.sin(angle) * dist;
    const y = TIN_AT.y + 0.006 + (i % 2) * 0.003;

    // Cylinders are built along Y; rotateZ lays the shaft down, rotateY aims it.
    const shaft = new THREE.CylinderGeometry(0.0016, 0.0022, length, 5);
    shaft.rotateZ(Math.PI / 2);
    shaft.rotateY(yaw);
    shaft.translate(x, y, z);
    tinMetal.push(shaft);

    const head = new THREE.CylinderGeometry(0.0042, 0.0042, 0.0016, 6);
    head.rotateZ(Math.PI / 2);
    head.rotateY(yaw);
    head.translate(x + Math.cos(yaw) * (length / 2), y, z - Math.sin(yaw) * (length / 2));
    tinMetal.push(head);
  }

  scene.registerProp('bench-tin', meshOf('BenchTin', tinFloor, MAT.dark));
  scene.registerProp(
    'bench-screws',
    meshOf('BenchScrews', mergeGeometries(tinMetal, false) ?? tinRim, MAT.metal)
  );

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
        /**
         * Widened and lifted, for the shot the mission is actually spent in.
         *
         * The room-scale view is not where the player looks at this object. Two beats in,
         * the camera goes to an inspection shot where the Kestrel-3 fills a third of the
         * frame, and there it read as a plain cream box - the one prop in the game with a
         * generated map on it, and no surface to speak of at the only distance anybody
         * examines it from.
         *
         * The map was not broken, which is worth recording because it looked exactly like
         * it was. Painting the base magenta and the wear band green put a clean green line
         * along every arris: the texture, the UVs and the async material assignment were
         * all fine. What was wrong was the amount. At `wear: 0.055` the band is about five
         * percent of a face - correct at room scale, invisible at arm's length.
         *
         * surface.ts's own rule says wear is authored as a SHAPE, "a defined band with a
         * ragged but clean boundary, which you can point at and call rubbed". You could
         * not point at it. Now you can, and it is still a shape rather than grain - which
         * is the line that keeps this inside the flat pass rather than sliding back into
         * the crackle-enamel version that was deleted.
         */
        worn: '#bdb7a8',
        grime: '#3a3a2e',
        seed: 'kestrel-3-shell',
        wear: 0.085,
      })
    )
  );
  setRoot.add(meshOf('SetFittings', set.fittings, MAT.metal));
  // The vents, in the darkest thing the palette has. See PropParts.recesses: a slot only
  // reads as a hole while it is darker than the panel around it, and the certainty law
  // pulls this whole prop warm once the player has been told what it is.
  if (set.recesses) setRoot.add(meshOf('SetVents', set.recesses, MAT.dark));

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

  /**
   * The corrosion, as matter rather than as a picture of matter.
   *
   * It was a decal - a stain painted on the panel - and cleaning it faded the stain out.
   * That is accurate and it has no weight: the single most physical act in the whole game,
   * a woman scraping crud off a contact with a blade, resolved as a texture getting more
   * transparent.
   *
   * These are beads. Low-poly, faceted, slightly flattened against the panel because a
   * bloom of verdigris creeps rather than sits, and clustered tight around the connector
   * with a few strays further out - corrosion spreads from the fault, so its DENSITY is
   * the evidence. The decal stays underneath them as the stain they have grown out of.
   *
   * They come off one at a time. See the clean action below for why the stagger matters
   * more than anything else here.
   */
  const beads: ENGINE.SceneNode[] = [];
  const beadRoot = ENGINE.SceneNode.create({ name: 'Corrosion', position: set.anchors.connectorB.clone() });
  for (let i = 0; i < 16; i++) {
    // Tight around the connector, thinning outward. sqrt keeps the sample area-uniform,
    // so the cluster does not end up a ring with a hole in the middle.
    const angle = range(rng, 0, Math.PI * 2);
    const radius = 0.022 + Math.sqrt(rng()) * 0.055;
    const size = range(rng, 0.006, 0.016) * (1 - radius * 4);

    const bead = new THREE.IcosahedronGeometry(Math.max(0.004, size), 0);
    // Flattened onto the panel and turned, so sixteen beads are not one bead sixteen times.
    bead.scale(1, 1, 0.55);
    bead.rotateX(jitter(rng, 1.2));
    bead.rotateY(jitter(rng, 1.2));

    const node = ENGINE.SceneNode.create({
      name: `Bead${i}`,
      position: new THREE.Vector3(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        -0.014 - Math.abs(jitter(rng, 0.004))
      ),
    });
    node.add(meshOf(`BeadMesh${i}`, bead, MAT.corroded));
    beadRoot.add(node);
    beads.push(node);
  }
  setRoot.add(beadRoot);

  scene.registerProp('transmitter', setRoot, {
    // Inked: Mirela's set - the thing on the bench that stopped working.
    inked: true,
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
  /**
   * Positioned in SCENE space, because registerProp is going to reparent it.
   *
   * This is the green disc that has been sitting on the floor at the base of Mirela's bench
   * for weeks, and it was never a VFX node - two fixes aimed at those changed nothing,
   * because the object was this.
   *
   * The connector was built at the transmitter's local anchor and then added to setRoot,
   * which is correct and lasted exactly two lines: registerProp calls scene.add(node), and
   * that reparents it to the scene root. The local position survived the move and the
   * transmitter's own (0, 0.81, -0.5) did not, so a 7cm corroded disc that belongs on the
   * back panel at y 0.92 was being drawn at y 0.11 - on the floor, in front of the bench,
   * in verdigris, exactly where it was reported.
   *
   * The corrosion beads never had the problem because they are not registered props, so
   * nothing ever moved them. Same anchor, different parent, and the two disagreed in world
   * space by four fifths of a metre.
   *
   * So the position is composed here instead. setRoot carries no rotation or scale, so
   * adding its offset to the anchor is exact; if it ever gains either, this needs to become
   * a proper localToWorld and the scene tree walked once before registering.
   */
  const connectorRoot = ENGINE.SceneNode.create({
    name: 'ConnectorBRoot',
    position: setRoot.position.clone().add(set.anchors.connectorB),
  });
  connectorRoot.add(connectorMesh);

  scene.registerProp('connector-b', connectorRoot, {
    anchors: { default: new THREE.Vector3(0, 0, -0.02) },
    actions: {
      /** Scrubbing: a short shudder, then the corrosion colour gives way to bright metal. */
      clean: (tweener, node) => {
        const baseX = node.position.x;
        const bloomFrom = bloomMaterial?.opacity ?? 1;

        /**
         * The beads come off one at a time, and the stagger is the whole effect.
         *
         * Sixteen beads vanishing together is a layer being switched off. Sixteen beads
         * leaving over eight tenths of a second, each one flicking away from the connector
         * and dropping, is somebody SCRAPING - the eye reads a sequence as an action and a
         * simultaneous change as a state.
         *
         * They are flung outward from the connector rather than straight down, because
         * that is where the blade is pushing them; gravity only takes over once they are
         * clear of the panel. Nothing is pooled or collected at the bottom: they are gone
         * by the time anybody looks, which is also what happens.
         */
        beads.forEach((bead, i) => {
          const from = bead.position.clone();
          const away = new THREE.Vector3(from.x, from.y, 0).normalize().multiplyScalar(0.05);
          tweener.add(
            (t) => {
              bead.position.set(
                from.x + away.x * t,
                from.y + away.y * t - t * t * 0.09,
                from.z - t * 0.02
              );
              bead.scale.setScalar(Math.max(0.001, 1 - t));
            },
            {
              duration: 0.34,
              delay: i * 0.05,
              easing: Ease.linear,
              channel: `bead-${i}`,
              onComplete: () => { bead.visible = false; },
            }
          );
        });

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
    /**
     * Both hands on the bench, either side of the set.
     *
     * Named in scene space - these are points on her actual bench top at y 0.78, just
     * clear of the transmitter which spans x -0.26 to 0.26 - and the arm angles are
     * solved to reach them. That is the difference between this and the pose attempt that
     * was reverted: an authored ANGLE looks right from one camera and foreshortens from
     * the next, and a hand told to land on the bench lands on it from all of them.
     *
     * The left hand rests flat behind the set and the right sits nearer the front edge,
     * because a person working with something does not place their hands symmetrically.
     */
    handsOn: {
      left: new THREE.Vector3(-0.36, 0.79, -0.72),
      right: new THREE.Vector3(-0.44, 0.79, -1.1),
    },
      // Goggles pushed up. She works on other people's electronics all day.
      headgear: 'band',
      sleeve: 'rolled',
      pouch: true,
    // Occupied. Her weight is over her own bench and has been all morning.
    temperament: 'working',
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
  /**
   * The last of the seven, and the same fault as the other six.
   *
   * Sampled off the default shot: pegboard wall 66, her torso 64, THE RADIO 58, her face
   * 46. Both the person and the object are BELOW the background they sit against, which
   * means the wall is the brightest large thing in a frame whose entire job is a woman
   * looking at a broken set.
   *
   * Her face was the worst of it. The work lamp is over the bench and slightly behind the
   * radio, so it lights the bench, the radio's top and the pegboard - and reaches her
   * chin and no further. She read as a lit coat with a dark head.
   *
   * Two lights, and both are things that are really there. The face fill is the doorway
   * she is standing near, which already exists as `DoorLight` and simply never carried far
   * enough into the room. The bench bounce is the bench itself: a pale timber top directly
   * under a work lamp throws a great deal back up, and that upward bounce is what actually
   * lights somebody leaning over their own work.
   */
  scene.registerProp(
    'face-fill',
    ENGINE.PointLightNode.create({
      name: 'FaceFill',
      /**
       * Brought in to 1.2m, because at 2.4m it was doing nothing.
       *
       * First placement sat at (-0.4, 1.72, 1.35), which is 2.4 metres from her head - and
       * with a 1.4 decay that is most of the light gone before it arrives. Her face moved
       * 46 to 54 while the radio went to 79, so the pass fixed the object and left the
       * person exactly where she was. Inverse-square is unforgiving about this: halving
       * the distance is worth more than doubling the intensity, and it does not wash the
       * wall behind her on the way.
       */
      position: new THREE.Vector3(-0.55, 1.7, 0.15),
      intensity: 4.5,
      color: new THREE.Color('#cfd8e4'),
      distance: 3.2,
      decay: 1.4,
    })
  );

  scene.registerProp(
    'bench-bounce',
    ENGINE.PointLightNode.create({
      name: 'BenchBounce',
      // Just above the bench top and in front of the set, so it throws up onto the radio's
      // face and onto hers rather than washing the wall behind them.
      position: new THREE.Vector3(0.1, 0.98, 0.45),
      intensity: 3.4,
      color: new THREE.Color('#ffd9ae'),
      distance: 2.6,
      decay: 1.6,
    })
  );

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
  /**
   * What the machine knows about this room, at the moment the call connects.
   *
   * ART_DIRECTION §1/§2. Measured before: mean saturation 0.58, mean R−B +56, and at a
   * squint the brightest object in frame was a blank white board - the radio, which is the
   * subject of the whole request, read as a mid-grey box behind it. One hue, no cool, no
   * focal point.
   *
   * These numbers fix both faults with one idea. The room's shell is SHAPED, because she
   * has told us it is a workshop and nothing more; the shelf and the boxes under the bench
   * are SUSPECTED, because nobody has said a word about what is in them; the bench is
   * DESCRIBED, because she is working at it; and the transmitter is KNOWN, because it is
   * the only thing this call is about.
   *
   * The result is that the one warm object in a cold room is the one the player is here
   * for. The composition and the fiction want exactly the same thing, which is the whole
   * argument for this direction.
   */
  for (const [id, certainty] of [
    ['floor', CERTAINTY.SHAPED],
    ['floor-seams', CERTAINTY.SHAPED],
    ['wall', CERTAINTY.SHAPED],
    ['pegboard', CERTAINTY.SHAPED],
    ['pegboard-tools', CERTAINTY.SHAPED],
    ['tide-line', CERTAINTY.SHAPED],
    // The shelf is a shelf and she is standing in front of it. What nobody has said a word
    // about is what is in the boxes - on it, and under the bench. Those are the coldest
    // things in the room and are supposed to look like it: this is what turns a flat white
    // box from unfinished work into an object nobody has described.
    ['shelf', CERTAINTY.SHAPED],
    ['shelf-crates', CERTAINTY.SUSPECTED],
    ['bench-store', CERTAINTY.SUSPECTED],
    // She never described her bench. She described what is standing on it, and the bench
    // being the brightest mass in frame was the reason the radio lost the eye to it.
    ['bench', CERTAINTY.SHAPED],
    ['bench-tools', CERTAINTY.SHAPED],
    // The tin and its screws are SHAPED, not SUSPECTED. A lid of loose screws on a bench
    // somebody is working at is a shape the machine can infer from the bench; it is not a
    // thing whose existence is a guess, which is what the tier below means. It stopped
    // needing to be cooled into the background the moment it stopped being a white disc.
    ['bench-tin', CERTAINTY.SHAPED],
    ['bench-screws', CERTAINTY.SHAPED],
    ['bench-rag', CERTAINTY.SUSPECTED],
    // The back panel is off and leaning on the bench, and it is the brightest object in
    // frame by luma - a blank rectangle out-competing the radio for the eye. She has not
    // described it; she described what it came off.
    ['set-panel', CERTAINTY.SHAPED],
    /*
     * The set is the one thing she has described before the player says anything - it is
     * what she rang about. Everything else she is asked about, and until she is asked,
     * the machine has her word for it and nothing more.
     *
     * The connector and the wall switch used to open at DESCRIBED, which is the state they
     * should REACH. Starting them there meant the room was already as warm as it would
     * ever get on the first frame, and §2's "a room at the start of a request should look
     * lonely" was true of no room in the game.
     */
    ['transmitter', CERTAINTY.KNOWN],
    ['connector-b', CERTAINTY.SHAPED],
    ['mains-switch', CERTAINTY.SUSPECTED],
  ] as [string, number][]) {
    scene.setCertainty(id, certainty);
  }

  /**
   * And what the conversation does to them.
   *
   * These are the three facts mission 01 can teach, mapped to the things in the room they
   * are facts ABOUT. The mission says what was learned; the room decides what that makes
   * visible - see ContactScene.learn for why the mapping lives on this side.
   *
   * `connector_b_corrosion` is the diagnosis, so its connector goes all the way to KNOWN:
   * it is the object the request turns on, and by the time she has found the crust it is
   * the thing they are both looking at. The resolve sweep crossing it is the moment §3
   * exists to pay for, and until now it could not happen in play at all.
   *
   * `shared_power_feed` is the wall switch. She has to say where the supply goes before
   * the machine has any account of it - it is behind her and out of frame in the opening
   * shot, and a machine that has not been told about a switch has no business drawing one.
   */
  scene.revealOn(FACT_CONNECTOR_CORROSION, 'connector-b', CERTAINTY.KNOWN);
  scene.revealOn(FACT_SHARED_POWER_FEED, 'mains-switch', CERTAINTY.DESCRIBED);
  /*
   * The flooding is what explains the corrosion, and the evidence for it is the tide line
   * round the bottom of the wall - so learning it resolves the floor she has been standing
   * on the whole time. It is the quietest of the three and the most satisfying: nothing
   * moves, the room simply stops being provisional underfoot.
   */
  scene.revealOn(FACT_WORKSHOP_FLOODS, 'bench-rag', CERTAINTY.DESCRIBED);
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
  // Seeded like every other diorama (§123), so the turf is in the same place every run.
  const rng = createRng(seedFrom('tomas-headland'));

  // -- The headland ---------------------------------------------------------
  const deck = new THREE.BoxGeometry(4.2, 0.2, 4.2);
  deck.translate(0, -0.1, 0);
  scene.registerProp('deck', meshOf('Deck', deck, MAT.ground));

  /**
   * The headland the mast is bolted to.
   *
   * The deck was a four-metre square of bare ground with a lattice standing on it, which
   * reads as a test rig rather than as a place. Coarse tussock grass and outcrop: this is
   * a clifftop in a wind strong enough to be part of the request, so the grass is short,
   * dense and leaning, and the rock is close to the surface because that is why anybody
   * put a mast here rather than somewhere softer.
   *
   * Kept clear of the middle, where the structure stands and where Tomas has worn a path.
   */
  scene.registerProp(
    'turf',
    meshOf(
      'Turf',
      grassTufts(rng, { centre: new THREE.Vector3(0, 0, 0), width: 4.0, depth: 4.0, clear: 1.15 }, {
        count: 150,
        height: [0.05, 0.13],
        // Flattened. Nothing on a headland stands up straight.
        lean: 0.9,
      }),
      MAT.stem
    )
  );
  scene.registerProp(
    'outcrop',
    meshOf(
      'Outcrop',
      rocks(rng, { centre: new THREE.Vector3(0, 0, 0), width: 4.0, depth: 4.0, clear: 1.5 }, {
        count: 8,
        size: [0.1, 0.28],
      }),
      MAT.fieldStone
    )
  );

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

  /**
   * Night cloud, which is mostly an absence.
   *
   * The trap here is painting them - a cloud lit from above at night is a grey shape on a
   * dark sky, and grey shapes on a dark sky read as fog banks or as rendering errors. What
   * a real night cloud does is BLOCK: it is darker than the sky it covers, and the only
   * light on it is a thin cold edge where the moon catches the top.
   *
   * So the values invert against the field's. The belly is nearly the colour of the sky
   * itself, barely separable, and the rim above it is the moon. Fewer of them, and higher,
   * because a broken sky lets the horizon glow through - and that glow is what makes Tomas's
   * coastline legible at all.
   */
  const nightClouds = clouds(rng, {
    /*
     * Lower than the field's, because this camera looks UP.
     *
     * It sits at y 4.6 pitched 16 degrees, so the top of frame is 39 degrees. Clouds at 31
     * units and 45 out land at 35 degrees - a hand's width from the frame edge, where they
     * were clipped into slivers nobody could read as anything. At 21 they sit at 25 degrees,
     * in the middle of the largest empty area of the shot, which is the only reason to have
     * put them here.
     */
    count: 10,
    height: 21,
    radius: 45,
    size: 5,
    /*
     * The rim is authored bright because ACES and an exposure of 0.62 sit between this
     * value and the screen. A moonlit edge picked by eye at #5d6a86 measured barely above
     * the sky it was drawn on; the tone curve had eaten it. This is the colour that survives
     * the pipeline, not the colour of the thing.
     */
    top: '#9fb0d4',
    underside: '#1b2132',
    drift: 0.22,
  });
  scene.registerProp('clouds', nightClouds.root, { idle: nightClouds.idle });

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
  /**
   * A guardrail at 1.05m, not 0.52m.
   *
   * It was knee height on a platform two metres up a lattice - which put the top rail at
   * Tomas's shin and made a man standing at the edge of a drop read as standing behind a
   * kerb. A guardrail is 1.1m by every code there has ever been, and the reason is that a
   * person leans on it, which is exactly what Tomas is doing while he looks at his beacon.
   *
   * Found by measuring the diorama props against real dimensions after the workstation
   * turned out to be at twice life size. It was the only other thing that was wrong.
   */
  for (let i = 0; i < 5; i++) {
    const rail = new THREE.BoxGeometry(0.035, 1.0, 0.035);
    rail.translate(-0.4 + i * 0.33, platformY + 0.52, 0.94);
    platformPieces.push(rail);
  }
  const handrail = new THREE.BoxGeometry(1.5, 0.045, 0.045);
  handrail.translate(0.25, platformY + 1.05, 0.94);
  platformPieces.push(handrail);

  // A mid rail, which is the other half of what makes a barrier read as a barrier.
  const midRail = new THREE.BoxGeometry(1.5, 0.03, 0.03);
  midRail.translate(0.25, platformY + 0.54, 0.94);
  platformPieces.push(midRail);
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
    // Inked: The beacon head. It is going out and coming back the whole time.
    inked: true,
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
      // Flat cap, rolled sleeves. Up a mast in the wind.
      headgear: 'cap',
      sleeve: 'rolled',
      beard: true,
      pouch: true,
    // Moved by weather rather than by breathing. Six metres up a lattice in a wind
    // strong enough to be part of the request.
    temperament: 'weathered',
    garment: 'coat',
    // Wet-weather orange: the only warm thing on a cold headland, and the only piece of
    // high-visibility clothing in the game, because he is the only person in it who is
    // somewhere dangerous.
    colors: { garment: '#a8582c', underlayer: '#3f4a52' },
    position: new THREE.Vector3(0.62, platformY + 0.03, 0.55),
    /**
     * Turned round to face the lens, three-quarter.
     *
     * At -0.72*PI he faced (-0.77, 0, -0.64) and the camera sits at (4.4, 3.9, 4.4), so
     * the default shot was the back of a man's coat: no eyes, no face, no read on the one
     * person in the frame. Solved rather than nudged - +0.247*PI points him exactly at the
     * lens, and 0.40 is three quarters of the way there, which keeps a shoulder turned to
     * the rail he is holding instead of squaring him up like a portrait.
     */
    /**
     * Turned round to face the lens.
     *
     * At -0.72*PI he faced (-0.77, 0, -0.64) against a camera at (4.4, 3.9, 4.4), so the
     * default shot was the back of a man's coat - no face, no eyes, no read on the only
     * person in frame. Solved rather than nudged: +0.247*PI points him exactly at the lens
     * and +0.20 is a hair off it, which keeps a shoulder turned toward the rail instead of
     * squaring him up like a passport photograph.
     *
     * The turn had a cost and it is worth recording: it swung his shoulder away from the
     * rail he was holding and put the old grip 11cm out of reach. Facing and reach are one
     * problem, not two, and moving a contact without re-running scripts/dev/reach.py is
     * how three of them ended up not touching anything in the first place.
     */
    rotation: new THREE.Euler(0, Math.PI * 0.2, 0),
    /**
     * Both hands on the guardrail.
     *
     * The rail went from shin height to 1.05m in the same audit that measured the rest of
     * the room, and this is the other half of it: a barrier only reads as a barrier when
     * somebody is holding it. He is watching his own light go out from two metres up a
     * lattice in the wind, and a man in that position has his hands on the rail.
     */
    /**
     * One hand on the rail, which is what the comment above always said.
     *
     * Both were authored, and the left needed 0.720 against a 0.623 arm - it could never
     * land, and before the generator learned to fall back it drew a straight arm pointing
     * at a rail it was not touching. Sliding the grip along the rail only bought 0.06, so
     * the honest fix is the one the prose already described: braced with one hand, the
     * other free.
     */
    handsOn: {
      right: new THREE.Vector3(0.85, 3.07, 0.75),
    },
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
  /**
   * Directional, because the moon is as far away as the sun is.
   *
   * It was a PointLight with a 34 metre range, which makes moonlight that falls off across
   * a headland and arrives from a different angle at each end of it. The moon is a quarter
   * of a million miles away; its light is parallel and it does not get dimmer as you walk
   * down a cliff. The same argument as the sun in Adaeze's field, and the same fix.
   *
   * Intensity is in a different currency now - a directional light's number is what every
   * lit surface receives, everywhere, rather than a value at a point that decays.
   *
   * The reason it has to be strong at all is unchanged and worth keeping: the beacon is out
   * for three and a half seconds in every eleven, and a screenshot of the lit phase says
   * nothing about the dark one. Played back, the scene used to go almost black for a third
   * of the time the player spends with Tomas. The moon carries the set whenever the light
   * drops, which is precisely when the player is looking hardest.
   */
  const moonLight = ENGINE.DirectionalLightNode.create({
    name: 'Moonlight',
    intensity: 1.9,
    color: new THREE.Color('#93b0cf'),
  });
  moonLight.position.copy(MOONLIGHT_AT);
  // Aimed at the deck rather than left pointing down its own default axis - the whole
  // point of the change is that the direction is deliberate.
  moonLight.lookAt(new THREE.Vector3(0, 0.5, 0));
  scene.registerProp('moon', moonLight);

  /**
   * Night sky, for the surfaces the moon rakes past.
   *
   * Same reason Adaeze's field needed one. The moon is low and behind, so it lights
   * silhouettes beautifully and leaves everything facing upward - the deck, the turf, the
   * tops of the outcrops - receiving almost nothing. A hemisphere is the sky itself, which
   * on a clear night is genuinely the second light source in the world.
   *
   * Very cold and very weak. This is not moonlight, it is the difference between a night
   * with stars in it and a black hole with objects in it.
   */
  scene.registerProp(
    'skylight',
    ENGINE.HemisphereLightNode.create({
      name: 'NightSky',
      position: new THREE.Vector3(0, 16, -4),
      intensity: 0.9,
      color: new THREE.Color('#3f5570'),
      groundColor: new THREE.Color('#14181c'),
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
  /**
   * A fill on the camera side, so the man has a face.
   *
   * Turning him toward the lens exposed the next problem: the beacon is above him, the
   * moon is behind him and the sea glow is off to one side, so every light in this scene
   * reached his back or his hat brim and none of them reached his face. He read as an
   * orange coat with a dark hole above it.
   *
   * Cold and weak - this is a night set and the beacon has to stay the only warm thing in
   * it, because the whole mission is that warm light going out. Enough to separate a head
   * from the sky behind it and no more. Same fault and same fix as Adaeze in daylight:
   * whatever else a diorama is doing, the person in it cannot be a silhouette.
   */
  scene.registerProp(
    'face-fill',
    ENGINE.PointLightNode.create({
      name: 'FaceFill',
      position: new THREE.Vector3(2.6, 3.1, 2.8),
      intensity: 5.5,
      color: new THREE.Color('#9fb6cc'),
      distance: 5.5,
      decay: 1.5,
    })
  );

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

  /**
   * -- What the machine knows about the mast, and what Ilie can tell it ------------------
   *
   * He rang about a beacon that keeps dropping out. That is the beacon and the structure
   * holding it up; everything to do with how it is FED is what the call is for.
   */
  for (const [id, certainty] of [
    ['beacon', CERTAINTY.KNOWN],
    ['mast', CERTAINTY.SHAPED],
    ['platform', CERTAINTY.SHAPED],
    ['deck', CERTAINTY.SHAPED],
    ['outcrop', CERTAINTY.SHAPED],
    ['turf', CERTAINTY.SHAPED],
    /*
     * The supply, and the box it passes through. He is standing next to a junction box he
     * has not mentioned - which is exactly the shape of this request, because the fault is
     * in the feed and not in the lamp. The splice box is on the mast in frame, so it is
     * the one that performs.
     */
    ['feed-down', CERTAINTY.SUSPECTED],
    /*
     * SHAPED, not SUSPECTED, and the reason is a rule rather than a preference.
     *
     * Tier 1 draws the prop's BOUNDING VOLUME, so it only says what it means when that
     * volume is a fair proxy for the object. `feed-away` is a cable running off across the
     * headland: its bounds are a slab tens of metres wide and centimetres thick, and
     * putting a guess on it laid a cyan glass sheet across the entire set. The same
     * mistake in the same session as the doorstep - see the note in buildNightDoor.
     */
    ['feed-away', CERTAINTY.SHAPED],
    ['splice-box', CERTAINTY.SUSPECTED],
  ] as [string, number][]) {
    scene.setCertainty(id, certainty);
  }

  // The lamp dims when he keys up: the drop down the mast is carrying both, which is the
  // first time the cable is a thing rather than a wire going somewhere.
  scene.revealOn(FACT_BEACON_DROPS_ON_KEYUP, 'feed-down', CERTAINTY.DESCRIBED);
  // And the answer - the feed wants isolating, which makes the box the fault lives in.
  scene.revealOn(FACT_FEED_NEEDS_ISOLATOR, 'splice-box', CERTAINTY.KNOWN);
  scene.revealOn(FACT_FEED_NEEDS_ISOLATOR, 'feed-away', CERTAINTY.DESCRIBED);
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
/**
 * Mid-afternoon, high and off to the left.
 *
 * This is the position the BACKDROP paints its glow at, and it has to agree with where the
 * light actually comes from or the sky brightens on one bearing while the shadows fall on
 * another - which nobody can name but everybody feels. Raised from (5.5, 7.5, 1.5), which
 * was a low evening sun on the wrong side of the set.
 */
const SUNLIGHT_AT = new THREE.Vector3(-9, 16, -10);

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

  /**
   * Weather, at the same scale as the hills.
   *
   * The sky was a clean gradient with a sun disc in it, which is a lighting statement rather
   * than a place - nothing in it had a size, so nothing else in frame got one either. Clouds
   * are the only thing up there that can be BIG, and having something recognisably huge at
   * the top of the shot is what tells you the hedge is far away and the tree is close.
   *
   * Sunset colours, taken off the same warm/violet pair the backdrop's own gradient uses:
   * lit tops facing the low sun, cool undersides where the sky has already gone over.
   *
   * The numbers here are the whole trick, and they took two wrong answers to find. At 170
   * units out the clouds were OUTSIDE the sky cylinder and drew nothing at all. Pulled in to
   * 70 with 20-unit lumps they became a single purple ceiling over the entire shot, because
   * a big cloud close overhead is not a cloud, it is a roof. They live on a ring near the
   * shell wall now and they are small, which is the only way to buy distance in a world that
   * is 52 units deep.
   *
   * The underside is a muted mauve rather than the near-navy it started as. Against a warm
   * sky a dark cold belly reads as storm; this scene is a calm evening and the shadowed side
   * of the cloud should only just be cooler than the sky behind it.
   */
  const cloudLayer = clouds(rng, {
    count: 12,
    height: 27,
    radius: 44,
    size: 5.5,
    /*
     * White cloud under an afternoon sky, not the sunset's lit pink.
     *
     * These were authored against an orange horizon and kept their rose tops when the sky
     * went blue, which is why they read as a leftover rather than as weather. A fair-weather
     * afternoon cloud is close to white on top and a cool grey underneath, and the small gap
     * between those two is what keeps it soft instead of graphic - a hard light/dark split
     * up there would pull the eye off the field, which is the opposite of what this scene is
     * for.
     */
    top: '#fdfbf6',
    underside: '#c3ccd8',
    drift: 0.22,
  });
  scene.registerProp('clouds', cloudLayer.root, { idle: cloudLayer.idle });

  /*
   * No ground slab. There used to be a nine-by-seven box of MAT.ground here, and it was
   * standing in for the world - it existed because there was nothing else under the beds.
   * With a field running out to a hedge it became a dark brown rectangle with hard edges
   * lying on grass, which reads as a mat somebody put down rather than as ground. The
   * field IS the ground now, the same call the sea gets on the headland.
   */

  /**
   * Raised beds somebody built, rather than two rectangles of soil.
   *
   * They were a single box of MAT.timberDark each - brown slabs sitting on the field, which
   * reads as a texture swap rather than as a thing that was made. A bed is FOUR BOARDS AND
   * FOUR POSTS, and the soil sits down inside it a hand's width below the rim. That gap is
   * most of the effect: it is what tells you the frame is holding the earth in, which is
   * the entire reason a raised bed exists.
   *
   * It also costs almost nothing to say who made it. The posts stand a little proud of the
   * boards, the way they do when somebody cuts them from what they have and does not go
   * back to trim the tops.
   */
  const BED_W = 1.5;
  const BED_D = 4.4;
  const BED_H = 0.24;
  const BOARD = 0.055;
  const BED_SOIL_TOP = 0.19;

  const bedFrame: THREE.BufferGeometry[] = [];
  const bedSoil: THREE.BufferGeometry[] = [];

  for (const side of [-1, 1] as const) {
    const cx = side * 1.05;
    const cz = -0.2;

    // The long boards, running with the rows.
    for (const sx of [-1, 1] as const) {
      const board = new THREE.BoxGeometry(BOARD, BED_H, BED_D);
      board.translate(cx + sx * (BED_W / 2 - BOARD / 2), BED_H / 2, cz);
      bedFrame.push(board);
    }
    // The ends.
    for (const sz of [-1, 1] as const) {
      const board = new THREE.BoxGeometry(BED_W, BED_H, BOARD);
      board.translate(cx, BED_H / 2, cz + sz * (BED_D / 2 - BOARD / 2));
      bedFrame.push(board);
    }
    // Corner posts, standing proud.
    for (const sx of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        const post = new THREE.BoxGeometry(0.085, BED_H + 0.06, 0.085);
        post.translate(
          cx + sx * (BED_W / 2 - 0.042),
          (BED_H + 0.06) / 2,
          cz + sz * (BED_D / 2 - 0.042)
        );
        bedFrame.push(post);
      }
    }

    // The earth, inset and sitting below the rim.
    const soil = new THREE.BoxGeometry(BED_W - BOARD * 2, BED_SOIL_TOP, BED_D - BOARD * 2);
    soil.translate(cx, BED_SOIL_TOP / 2, cz);
    bedSoil.push(soil);
  }

  scene.registerProp(
    'beds',
    meshOf('Beds', mergeGeometries(bedFrame, false) ?? bedFrame[0], MAT.timber)
  );
  scene.registerProp(
    'bed-soil',
    meshOf('BedSoil', mergeGeometries(bedSoil, false) ?? bedSoil[0], MAT.soil)
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
  /**
   * Two banks of the same crop, and the difference between them is the mission.
   *
   * Modelled plants now, not generated clumps - but the rule they were built under has not
   * changed and could not: the ONLY thing that differs between these beds is health.
   * Nothing else in the scene varies across that line, which is exactly the deduction the
   * player has to make, and §131 says the environment has to carry it rather than the
   * dialogue. So the contrast is deliberately stronger than realism strictly needs.
   *
   * Same rows, same spacing, same species. West is twice the size and properly green; east
   * is stunted and yellowing. A player who looks at the beds should be able to point at the
   * line without being told there is one.
   */
  const BED_ROWS = 7;
  const BED_COLS = 3;
  const BED_Z = -1.9;
  const BED_TOP = BED_SOIL_TOP;

  scene.registerProp(
    'rows-healthy',
    rows(rng, {
      modelUrl: '@project/assets/models/Plants/SM_WildCarrot_01.glb',
      at: new THREE.Vector3(0.65, BED_TOP, BED_Z),
      rows: BED_ROWS,
      perRow: BED_COLS,
      rowGap: 0.62,
      plantGap: 0.4,
      // The asset is a metre tall; this is a seedling bed.
      scale: [0.26, 0.34],
    })
  );

  const failing = rows(rng, {
    modelUrl: '@project/assets/models/Plants/SM_WildCarrot_01.glb',
    at: new THREE.Vector3(-1.45, BED_TOP, BED_Z),
    rows: BED_ROWS,
    perRow: BED_COLS,
    rowGap: 0.62,
    plantGap: 0.4,
    /**
     * Stunted, not absent.
     *
     * Half the size read as no size at all. The shade plane over this bed darkens whatever
     * is under it, so plants at 0.15 disappeared into it and the bed said "nothing was ever
     * planted here" - a different request from Adaeze's, and the wrong one.
     *
     * So the difference is carried by colour and vigour rather than by scale. That is also
     * the truthful version: a seedling in shade goes pale and leggy, it does not shrink to
     * a tenth of its neighbour. Three quarters the size, visibly yellow, clearly worse.
     */
    scale: [0.2, 0.26],
  });
  // Yellowing as well as stunted. Two signals, because the player reads this across four
  // metres of set at a shallow angle and through the shade that is causing it.
  failing.colors = new THREE.Color('#cfc47e');
  scene.registerProp('rows-failing', failing);

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
  /**
   * The neighbour's tree, from the shared generator.
   *
   * Its bias points along +x with full strength, which is what puts the crown out over
   * Adaeze's tunnel. That overhang is the mission - the shade on the failing bank comes
   * from this tree and nothing else - so it is the one tree in the scene that is allowed to
   * be lopsided.
   */
  const neighbourTree = buildTree(rng, {
    name: 'NeighbourTree',
    at: new THREE.Vector3(-3.7, 0, -0.4),
    size: 1,
    leanToward: 0,
    leanBias: 1,
  });
  const treeRoot = neighbourTree.root;
  const crown = neighbourTree.crown;

  /**
   * A second tree, down by the water, and it is doing a different job.
   *
   * Composition rather than story. The neighbour's tree is a tall vertical hard against the
   * left of frame, and with a horizon behind it the right half had nothing to stop the eye
   * running out of the picture. This one sits further off and smaller, so it reads as
   * distance rather than as a repeat.
   *
   * No bias at all. It has nothing to overhang and no reason to reach, and giving it the
   * same lopsided crown would say it was straining towards something that is not there.
   */
  const shoreTree = buildTree(rng, {
    name: 'ShoreTree',
    /*
     * Solved into frame rather than placed by eye. At x=9.5 it projected to 0.88 in tangent
     * units against a horizontal half-angle of about 0.87 - just outside the right edge,
     * which is the most annoying place for a thing to be, because it renders and costs and
     * nobody ever sees it. From here it lands at 0.46, right of centre.
     *
     * Beyond the hedge on purpose: it stands on the neighbour's side of the boundary, which
     * quietly says the same thing the big tree says.
     */
    at: new THREE.Vector3(5.5, 0, -9.5),
    size: 0.78,
    leanToward: Math.PI,
    leanBias: 0,
  });
  scene.registerProp('shore-tree', shoreTree.root);

  scene.registerProp('neighbour-tree', treeRoot, {
    // Inked: The tree on the other side of the glass.
    inked: true,
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
      // Wide brim, because she spends her days under grow lamps and glass.
      headgear: 'brim',
      sleeve: 'rolled',
      pouch: true,
    temperament: 'working',
    garment: 'apron',
    colors: { garment: '#2f6a72', underlayer: '#a89878' },
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
    /**
     * One hand down on the end of the bed, the other hanging.
     *
     * Only one, deliberately: somebody standing at the mouth of their own tunnel looking
     * down the rows rests a hand on the frame, and two hands on it would be somebody
     * holding on.
     *
     * The hoop directly above her is 1.72m up - measured, not guessed - so she cannot
     * reach it standing, and the seedlings are a metre below her hands. That gap is a
     * fact about the scene rather than a limit of the solver: to touch the rows she would
     * have to crouch, which is precisely the pose that defeated the previous attempt and
     * still needs a staging answer rather than a tuning one.
     */
    handsOn: {
      left: new THREE.Vector3(-1.55, 0.95, 2.6),
    },
  });

  // -- Light ----------------------------------------------------------------
  //
  // High and hard from the west, because the whole request turns on a shadow. A soft key
  // would light both banks evenly and there would be nothing to see.
  const sunLight = ENGINE.DirectionalLightNode.create({
      name: 'Sun',
      /**
       * Directional, and this is the change that makes it read as sunlight.
       *
       * It was a PointLight with a 26m range, and everything wrong with the light in this
       * scene followed from that. A point light radiates from a spot, so its DIRECTION
       * changes across the field and its brightness falls away with distance - and falloff
       * with distance is the single most reliable cue the eye has for artificial light. It
       * also meant nothing past the ring was lit at all, which is why the ground and the
       * lake had to be made unlit to stop them going black.
       *
       * The sun is 150 million kilometres away. Its rays are parallel, every surface with
       * the same orientation gets the same light wherever it stands, and it does not
       * attenuate over a smallholding. A DirectionalLightNode is that, exactly.
       */
      position: SUNLIGHT_AT.clone(),
      /**
       * Intensity in a completely different currency now.
       *
       * A point light's 30 was 30 at its own position falling to nothing by 26 metres. A
       * directional light's number is what every lit surface gets, everywhere, so it is a
       * much smaller figure - and this is a low evening sun, which is weak as well as warm.
       */
      /**
       * Up from 2.1, to buy back the shadow.
       *
       * Lifting the skylight alone would restore the brightness and flatten the picture,
       * because a hemisphere fills shadow and light equally - the shadow would come up with
       * everything else and there would be no point having cast it. The sun is what makes
       * the difference between the two, so it rises too, and the balance is read off the
       * gap rather than off either number alone.
       */
      /**
       * Afternoon: stronger and much less orange.
       *
       * A low sun is weak and warm because its light has crossed a lot of atmosphere; a
       * mid-afternoon one has not, so it is brighter and close to white with only a trace
       * of warmth left in it. #ffb473 was doing a lot of the sunset's work on its own.
       */
      /*
       * 5.2, and the jump is a consequence of fixing the aim rather than a taste change.
       *
       * While the sun was pointed backwards it was contributing almost nothing to the
       * ground and the hemisphere was carrying the whole field on its own - so the old
       * intensity was never measured against a sun that was actually hitting anything. With
       * the aim corrected the ground fell to luma 67, which is dusk. This is what an
       * afternoon costs once the light is going the right way.
       */
      intensity: 5.2,
      color: new THREE.Color('#fff1d8'),
    })

  /**
   * Aimed from the sun the player can actually see.
   *
   * This is the correction that matters as much as the light type. The old lamp sat up and
   * to the RIGHT at (5.5, 7.5, 1.5) while the visible disc is far left and far back over
   * the water - so every object in the scene was lit from one side while the sun was
   * plainly on the other. Nobody could have named it and everybody would have felt it.
   *
   * A directional light's position does not affect its brightness, only its direction, so
   * this sits on the line between the scene and the disc and looks at the beds. The
   * elevation works out at about seven degrees, which is a sun on the horizon rather than
   * the fifty degrees the point lamp was firing from - and low light travelling almost
   * horizontally is what rakes across a field instead of falling onto it.
   */
  /**
   * Skylight, which a low sun cannot do without.
   *
   * A sun seven degrees above the horizon strikes level ground at grazing incidence - the
   * cosine works out around 0.12 - so the field, the beds and the paths receive almost
   * nothing from it however bright it is. That is physically right and it left the ground
   * reading at 44 where it had been over 100.
   *
   * The answer is not to crank the sun, which would blow out everything vertical while the
   * ground stayed dark. It is that at sunset half the light in the world comes from the
   * SKY - a huge warm dome overhead - and this scene had no such thing. A hemisphere lights
   * upward-facing surfaces from above, which is exactly the set of surfaces the low sun
   * cannot reach.
   */
  scene.registerProp(
    'skylight',
    ENGINE.HemisphereLightNode.create({
      name: 'Skylight',
      position: new THREE.Vector3(0, 14, -6),
      /**
       * Raised from 1.5 when the ground started taking light.
       *
       * Measured before and after the ground became a lit material: grass fell 68.6 to
       * 42.6, soil 54.2 to 32.2, the whole field about 38 percent darker, while the sky
       * held at 134.7 because it is unlit and never moved. That is §261 arriving on
       * schedule - a 7 degree sun meets level ground at a glancing angle and delivers
       * almost nothing to it, so the ground is the skylight's job and always was. The old
       * 1.5 was balanced against a ground that ignored light completely, so it was never
       * carrying the field; it only had to tint the props.
       */
      /*
       * Down from 2.5, because the sun is doing more of the work now.
       *
       * The skylight had to carry the ground under a 7 degree sun. A 40 degree one reaches
       * level ground perfectly well, so the fill steps back to being fill - and its colour
       * changes with the sky it represents, from a sunset's warm dome to an afternoon blue.
       */
      intensity: 2.2,
      // The sky as it actually is overhead in this shot, and the ground bouncing back.
      color: new THREE.Color('#a9c9e8'),
      groundColor: new THREE.Color('#4a5237'),
    })
  );

  /**
   * Aimed so the tree lays its shadow across the beds.
   *
   * The neighbour's tree stands at x -3.7 and the two raised beds are at x +/-1.05, so the
   * sun has to sit further out on the tree's own side for the shadow to travel toward them.
   * At this position the light arrives about 40 degrees above the horizon, which throws a
   * roughly five metre shadow off a four and a half metre tree - far enough to reach the
   * near bed and break across its frame.
   *
   * That is the point of the change and not a detail: a shadow lying over the thing the
   * mission is ABOUT ties the two together in one image. The tree is the neighbour's, the
   * beds are Adaeze's, and the shadow is the problem.
   */
  sunLight.position.set(-15, 13, -7);
  // aimLight, not lookAt - see art/shadows.ts. lookAt aims these lights backwards.
  aimLight(sunLight as unknown as THREE.Object3D, new THREE.Vector3(0.4, 0.25, -0.2));
  /**
   * The sun casts, and the frustum is sized to the set rather than to the world.
   *
   * A directional shadow map spends its whole budget across one orthographic box, so the
   * box wants to be the smallest one containing everything the camera can see throw a
   * shadow - the beds, the greenhouse, the two trees, the contact. Twenty-six metres covers
   * that; the hills and the far hedge are backdrop and unlit, so they are outside the pass
   * by policy anyway and cost nothing to leave out.
   *
   * A low evening sun is the hardest case for acne, because rays hit the ground at a
   * glancing angle and the depth difference across one faceted polygon is large. That is
   * what the normal bias is for - it offsets along the surface normal instead of pushing
   * the whole map away from the light, which is the only version that works on flat-shaded
   * geometry without detaching contact shadows from their objects.
   */
  castShadows(sunLight as unknown as THREE.Object3D, { extent: 26, radius: 3, normalBias: 0.04 });
  scene.registerProp('sun', sunLight);

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
      /**
       * Brought closer and up, and strengthened.
       *
       * Sampled off the default shot, Adaeze read (44, 49, 41) against a field at (101,
       * 108, 88) - the one person in the scene was the DARKEST thing in it, on ground more
       * than twice her brightness. That is the fault the whole lighting pass is about: a
       * contact is the subject of their own diorama and cannot be a silhouette in daylight.
       *
       * The sun is out past her, so this is the only light her front ever sees. It now
       * sits where the camera does, which is the only place a fill can be if the job is
       * making a face readable.
       */
      /**
       * Cooler, because the key is now genuinely warm.
       *
       * Most of what sells an hour of the day is the SPLIT: a warm key against a cool fill,
       * the fill being skylight rather than sunlight. With a neutral fill the warm key had
       * nothing to be warm against and the whole frame just read as tinted. This is the
       * blue of the sky overhead at the moment the sun is orange on the horizon.
       */
      position: new THREE.Vector3(-0.9, 3.0, 5.0),
      intensity: 22,
      color: new THREE.Color('#7d9ecc'),
      distance: 18,
      decay: 1.15,
    })
  );

  // -- Shots ----------------------------------------------------------------
  /**
   * The rest of the smallholding (§240).
   *
   * Everything in this set was load-bearing - two beds, the hoops, the shade cloth, the
   * neighbour's tree - and the result was nine metres of empty field with the evidence
   * arranged on it like exhibits. Real ground somebody works is ninety percent things that
   * mean nothing: the tools they were using an hour ago, the bucket they have not put
   * away, the pallet of trays they keep meaning to stack.
   *
   * None of this carries information and none of it can be pointed at by a hint. That is
   * exactly its job - §131 makes the environment carry evidence, and evidence only reads
   * AS evidence when it is not the only thing in frame.
   */
  const dressing: THREE.BufferGeometry[] = [];
  const timberBits: THREE.BufferGeometry[] = [];

  // A stack of seed trays by the near bed, half of them still full of compost.
  for (let i = 0; i < 5; i++) {
    const tray = new THREE.BoxGeometry(0.34, 0.055, 0.24);
    tray.rotateY(jitter(rng, 0.14));
    tray.translate(-2.55 + jitter(rng, 0.03), 0.028 + i * 0.052, 2.0 + jitter(rng, 0.03));
    dressing.push(tray);
  }

  // A bucket, on its side because it was kicked over and nobody picked it up.
  const bucket = new THREE.CylinderGeometry(0.13, 0.1, 0.28, 10, 1, true);
  bucket.rotateZ(Math.PI * 0.5);
  bucket.rotateY(0.6);
  bucket.translate(-3.05, 0.13, 1.15);
  dressing.push(bucket);

  /**
   * A spade and a fork, leaning where they were left.
   *
   * Two long diagonals, which is what this set was missing more than it was missing
   * objects: everything in it was horizontal beds and vertical hoops, so the eye had no
   * line to travel along. A tool leaning against something is the cheapest diagonal there
   * is and it says a person was standing here.
   */
  for (const [x, z, lean, turn] of [
    // Checked against the default shot rather than placed by eye: at x -2.3 these stood
    // exactly behind Adaeze's head from (1.45, 3.65, 7.7) and read as two handles growing
    // out of her hat.
    [2.72, 1.62, 0.34, 0.5],
    [2.86, 1.44, 0.26, -0.7],
  ] as const) {
    const shaft = new THREE.BoxGeometry(0.035, 1.24, 0.035);
    shaft.rotateZ(lean);
    shaft.rotateY(turn);
    shaft.translate(x, 0.62, z);
    timberBits.push(shaft);

    const head = new THREE.BoxGeometry(0.19, 0.26, 0.035);
    head.rotateZ(lean);
    head.rotateY(turn);
    head.translate(x - Math.sin(lean) * 0.58, 0.14, z);
    dressing.push(head);
  }

  // A coil of hose, because there is always a hose.
  for (let i = 0; i < 3; i++) {
    const loop = new THREE.TorusGeometry(0.24 - i * 0.04, 0.022, 4, 14);
    loop.rotateX(Math.PI / 2);
    loop.translate(2.15 + jitter(rng, 0.02), 0.026 + i * 0.036, 0.34);
    dressing.push(loop);
  }

  // A pallet nobody has moved since the delivery.
  for (let i = 0; i < 4; i++) {
    const plank = new THREE.BoxGeometry(0.86, 0.03, 0.11);
    plank.translate(-2.0, 0.055, -0.62 + i * 0.16);
    timberBits.push(plank);
  }
  const bearer = new THREE.BoxGeometry(0.86, 0.05, 0.06);
  bearer.translate(-2.0, 0.02, -0.3);
  timberBits.push(bearer);

  scene.registerProp(
    'dressing',
    meshOf('Dressing', mergeGeometries(dressing, false) ?? dressing[0], MAT.galvanised)
  );
  scene.registerProp(
    'dressing-timber',
    meshOf('DressingTimber', mergeGeometries(timberBits, false) ?? timberBits[0], MAT.timber)
  );

  /**
   * Ground cover, and the difference between a field and a plane.
   *
   * The first pass here was ninety single blades, which broke the flat colour and did not
   * look like grass - a blade is invisible at four metres and a scatter of them reads as
   * stubble. These are TUFTS: three or four tapered blades from one root, leaning apart,
   * so each one has a silhouette. See geometry/outdoors.ts for why they are geometry
   * rather than alpha cards.
   *
   * Density carries the meaning. Thick out at the boundary, thinning as it approaches the
   * beds, and bald in the strip she actually walks - which says somebody weeds here
   * without a single object having to be placed by hand.
   *
   * ## Replaced by the meadow, below
   *
   * All of the above was true and it was still green paper. The tufts were scattered
   * evenly over a flat plane, so nothing about the ground explained itself - a bald patch
   * was a gap in a carpet rather than earth. See the meadow block after the planting: one
   * density field now decides where grass is, how tall it is and what colour the soil is
   * underneath, and that correlation is what the eye reads as ground.
   */

  /**
   * -- Modelled planting, where the camera can see a plant ------------------------------
   *
   * The generated tufts above stay exactly as they are and keep doing the job they are
   * good at: filling the field at distance, where a tuft is a silhouette and a silhouette
   * is all that reads. These sit in front of them, near the lens, where the difference
   * between a modelled blade and four crossed cylinders is the difference between a field
   * and a diagram of one.
   *
   * The modelled grass and the corn that used to be here are gone. The meadow below does
   * the grass far better - it is denser, it moves, and it is tied to the ground underneath
   * it - and three clumps of a repeated asset standing in real grass read as props. What
   * is left is the one thing the meadow does not do: a flowering plant, sparse enough to be
   * a weed she has not got to.
   */
  /**
   * Measured, not guessed - and the numbers matter here more than usual.
   *
   * The assets are bigger than a field weed: SM_WildGrass_01 is 1.48m tall in the file and
   * SM_WildCarrot_01 is a full metre. Scattered at 0.7-1.35 they were waist-high grass and
   * hydrangeas. The scales below bring them to rough-grass and cow-parsley height.
   *
   * The keep-out was also doing far too much. At 3.0m it cleared the entire middle of the
   * frame, so the only planting that survived was in the near foreground where most of it
   * fell off the bottom of the shot - a field that measured as planted and looked bald.
   */
  const KEEP_CLEAR = [
    // The worked beds and the path she stands on. Nothing grows where somebody weeds.
    { centre: new THREE.Vector3(0, 0, -0.2), radius: 1.9 },
    // The neighbour's tree, which is the mission and must not be hidden at its base.
    { centre: new THREE.Vector3(-3.7, 0, -0.4), radius: 1.4 },
  ];

  /**
   * Whole paths, written out, because the build reads them.
   *
   * These were built from a species name with a template literal, which is tidy source and
   * broke the game: the asset pipeline scans for literal `@project/...` strings to decide
   * what to copy into .dist, a constructed path is invisible to it, and all three grasses
   * 404'd at load while the corn and the carrot - whose paths I happened to type out -
   * loaded fine. AGENTS.md says never construct a project path programmatically; this is
   * what that rule is protecting against.
   */
  // A little wild carrot at the margins - the one flowering thing, and sparse enough that
  // it reads as a weed she has not got to rather than as planting.
  scene.registerProp(
    'planting-carrot',
    scatter(rng, {
      modelUrl: '@project/assets/models/Plants/SM_WildCarrot_01.glb',
      at: new THREE.Vector3(1.0, 0, 1.2),
      width: 9.4,
      depth: 5.4,
      count: 11,
      scale: [0.32, 0.5],
      clear: KEEP_CLEAR,
      y: 0.01,
    })
  );

  /**
   * -- The meadow, and the ground it grows out of ---------------------------------------
   *
   * The near ground gets its own patch rather than borrowing the 140m backdrop plane. The
   * backdrop is unlit and flat on purpose - it is scenery forty metres out and should stay
   * cheap - while soil mottling only means anything where the camera can resolve it.
   *
   * The blades and the soil read the SAME density field, which is the entire effect. Where
   * the field is thin the grass is short and sparse and the ground browns off underneath
   * it, so a bald patch is bare earth with a reason rather than a hole in a carpet.
   */
  /**
   * Big enough that its edge is over the horizon.
   *
   * The first version was a 34x26 patch, and the seam where it met the backdrop's own
   * ground read as a rectangle drawn on the field - the two greens could not match because
   * one is lit and the other is deliberately unlit scenery. Rather than chase a colour
   * match between a lit plane and a flat one, this simply covers everything the camera can
   * see. The mottling is still only legible up close; at distance it is under a pixel.
   */
  const groundPatch = new THREE.PlaneGeometry(130, 130);
  groundPatch.rotateX(-Math.PI / 2);
  groundPatch.translate(0.2, -0.012, -1.0);
  scene.registerProp(
    'ground',
    meshOf('Ground', groundPatch, meadowGround({
      /*
       * Lighter, and warmer. Calm is a VALUE decision before it is a colour one.
       *
       * These were a dark olive over a dark brown, which is what a field looks like in
       * overcast light and is also what makes a picture feel heavy - the eye reads low
       * value as weight. This scene is supposed to be the one the player exhales at, so the
       * whole ground moves up the scale: a soft sage green over pale beach sand, which is
       * also honest for a smallholding sitting on a shoreline where the soil is half sand.
       */
      grass: '#8a9a5b',
      soil: '#c9b491',
      sand: '#e0cfae',
      drySand: '#eaddc2',
    }))
  );

  scene.registerProp(
    'meadow',
    meadow(rng, {
      at: new THREE.Vector3(0.2, 0, -3.5),
      width: 26,
      depth: 22,
      /*
       * More of it. 48000 across a 26x22 patch is about 84 blades per square metre, which
       * sounds like a lot and is not - real grass is thousands, and at this density the eye
       * still reads individual stalks with ground between them rather than a sward. Doubled,
       * with the bare threshold lowered so the thin areas fill in rather than the thick ones
       * getting thicker.
       *
       * It costs nothing measurable because the whole field is one InstancedMesh: the extra
       * blades are extra matrices in a buffer, not extra draw calls.
       */
      count: 150000,
      /**
       * Up from 0.07-0.2, which was mown lawn.
       *
       * Ankle height was right when every blade stood alone, because a field of individual
       * 40cm blades is a hay meadow. Clumped, the same height reads as somebody's back
       * garden - and this is rough grass round a worked smallholding, which comes to mid
       * shin. The clump spread does the work that height used to be doing.
       */
      /*
       * Up again, and this time the number that mattered was not the height.
       *
       * Measured, because the field looked sparse at a hundred thousand blades and that is
       * the kind of claim worth checking: blade tips came out at luma 149 against bare
       * ground at 134. Fifteen values. This file's own note about the last time that
       * happened says it plainly - six values apart and the field dissolves into a single
       * hazy mat - and the fix then was to move the blades. It cannot be the fix now,
       * because the ground under THIS scene is pale on purpose (calm is a value decision,
       * see the ground call above) and dragging it down would trade the room's whole
       * intent for a texture.
       *
       * So the grass covers it instead. Fewer blades per crown spreads the same budget over
       * half again as many crowns, and a lower bare threshold stops the thin areas being
       * culled to nothing - which together close the gaps the pale soil was showing
       * through. Knee height rather than shin, because nobody has cut this since the
       * lamps... since the spring, and the theme of the jam is Overgrown.
       */
      height: [0.24, 0.52],
      bladesPerClump: [4, 8],
      bareBelow: 0.26,
      /**
       * And the layer above it.
       *
       * The field's silhouette was a flat fuzzy line however many blades were in it,
       * because every blade is the same kind of thing at the same sort of height. A
       * twentieth as many stalks gone to seed, standing clear of the mass, is what makes it
       * read as long rather than as thick - and a mown lawn has none by definition, which
       * is the theme stated in one prop.
       */
      seedHeads: { share: 0.05, height: [0.62, 0.95] },
      keepOffBeach: 3.2,
      clear: KEEP_CLEAR,
      y: 0,
    }),
    // The gust, advanced once a frame. Registered here rather than globally so it only
    // runs while this diorama is the one on screen.
    { idle: (deltaTime) => stepWind(deltaTime) }
  );

  /**
   * -- A boundary, because a field without one just stops --------------------------------
   *
   * The complaint was that the set looks empty, and the emptiness is not a shortage of
   * objects near the camera - it is that the ground runs away to a horizon with nothing
   * between the beds and the hills. The eye has no edge to stop at, so it reads the whole
   * middle distance as unfinished.
   *
   * A hedge and a fence fix that for very little. They also say what the field IS: a
   * smallholding has a boundary, somebody put it there, and the neighbour whose tree is
   * causing all this trouble is on the other side of it. That last part is the mission -
   * the tree belongs to somebody else, and until now nothing in the scene said so.
   */
  const hedge: THREE.BufferGeometry[] = [];
  const fence: THREE.BufferGeometry[] = [];
  const HEDGE_Z = -7.4;

  /**
   * The hedge runs the right of the field and stops.
   *
   * It used to cross the whole width, which walled the shot off - and once there was water
   * behind it, walled the water off too. A boundary that runs out is also more true: a
   * hedge is grown along the side somebody needed a boundary on, and it ends where the land
   * does something else. Ending it opens the left of the frame onto the lake and the sun,
   * which is the half of the picture worth looking at.
   */
  for (let i = 0; i < 24; i++) {
    const x = 2.2 + i * 0.85;
    // Overlapping lumps of varying size, so the top line wanders the way a hedge does
    // rather than running level like a wall.
    const size = range(rng, 0.62, 1.0);
    const blob = new THREE.IcosahedronGeometry(size, 0);
    blob.scale(range(rng, 1.1, 1.5), range(rng, 0.85, 1.25), range(rng, 0.9, 1.2));
    blob.rotateY(range(rng, 0, Math.PI * 2));
    blob.translate(x + jitter(rng, 0.2), size * range(rng, 0.75, 1.0), HEDGE_Z + jitter(rng, 0.35));
    hedge.push(blob);
  }
  scene.registerProp(
    'hedge',
    meshOf('Hedge', mergeGeometries(hedge, false) ?? hedge[0], MAT.leafDeep)
  );

  /**
   * Posts and two wires, on this side of the hedge.
   *
   * The fence is hers and the hedge is the boundary itself - which is why the posts stand
   * in front of it. It is also the only straight line in the middle distance, and one
   * straight line is what makes everything around it read as grown rather than built.
   */
  for (let i = 0; i < 9; i++) {
    const x = 2.6 + i * 2.0;
    const post = new THREE.BoxGeometry(0.09, 1.05, 0.09);
    post.rotateZ(jitter(rng, 0.04));
    post.translate(x, 0.52, HEDGE_Z + 0.9);
    fence.push(post);
  }
  for (const y of [0.42, 0.82] as const) {
    const wire = new THREE.BoxGeometry(17, 0.015, 0.015);
    wire.translate(10.5, y, HEDGE_Z + 0.9);
    fence.push(wire);
  }
  scene.registerProp(
    'fence',
    meshOf('Fence', mergeGeometries(fence, false) ?? fence[0], MAT.timberDark)
  );

  /**
   * -- The lake, and the evening on it ---------------------------------------------------
   *
   * Adaeze's is the only set in the game with a horizon, which makes it the only one that
   * can hold a sky - and a sky is wasted without something to put underneath it. The water
   * sits past the end of the hedge, on the left, so it opens out from behind the glasshouse
   * exactly where the frame had nothing in it.
   *
   * It is a long way back on purpose. Near water would want a shoreline, reeds, a reason
   * somebody has not walked into it; at thirty metres it is a band of light between the
   * field and the hills, which is all it needs to be and all this scene has room for.
   */
  /**
   * Solved, not nudged.
   *
   * The camera looks along -X as well as -Z, so a distant object at x=-15 sits almost
   * exactly on the view axis and the sun kept landing dead centre behind the tree. Working
   * it through the shot's own camera basis - right vector (0.946, 0, -0.325), forward
   * normalised - a screen position a third of the way from the left edge needs x = -36.
   * Two hundredths of screen space per metre at this distance; guessing was never going to
   * find it.
   */
  const LAKE_SUN_X = -36;
  /**
   * Subdivided, because the swell is real displacement now.
   *
   * A two-triangle plane has nothing to lift. 90 by 60 segments is 5,400 quads for a lake
   * this size - about one vertex every metre and a half, which is finer than the wavelength
   * and therefore enough. The plane also starts well in front of the waterline and is
   * discarded per-pixel where the shore says there is no water, which is what lets the
   * water's edge wander without the geometry having to.
   */
  const lake = new THREE.PlaneGeometry(150, 90, 90, 60);
  lake.rotateX(-Math.PI / 2);
  lake.translate(-18, 0.05, -50);
  scene.registerProp(
    'lake',
    meshOf(
      'Lake',
      lake,
      stylisedWater({
        /*
         * Re-keyed for afternoon, and for calm.
         *
         * The old set was a sunset lake: a near-navy deep, a hard teal shallow and a warm
         * amber glint, which is right when the only light is a low orange sun and wrong once
         * the sky above it is blue. Left alone it had gone cold against the new sand.
         *
         * Two changes matter more than the hues. The deep is lighter and the shallow is
         * closer to it, so the water reads as CLEAR rather than as deep - the value gap
         * between a lake's near and far water is what tells you how far down it goes, and a
         * narrow gap over pale sand says you could wade in it. And the glint moves from
         * amber to near-white, because a high sun makes a hard bright specular while a low
         * one smears a warm one; keeping the warm glint under a blue sky was the single most
         * obviously leftover thing in the shot.
         *
         * A wider sun band as well. A high sun spreads its reflection across more water than
         * a low one, and a broad soft band is calmer to look at than a narrow hot stripe -
         * which is the brief for this whole scene.
         */
        deep: '#3f7f96',
        shallow: '#79bfc0',
        crest: '#b6dcd6',
        glint: '#fdf6e6',
        foam: '#f2f7f1',
        sunX: LAKE_SUN_X,
        sunWidth: 16,
        // The same clock the grass runs on, so one gust moves the whole scene.
        time: WIND.uTime,
      })
    )
  );

  /**
   * The sun itself, as an object low over the water.
   *
   * Separate from the light that illuminates the set, and it has to be. The scene's key is
   * a PointLight with a 26m range - it exists to light Adaeze and the beds, and it cannot
   * be moved to the horizon without the whole foreground going dark. So the thing the
   * player reads as the sun is a disc in the distance, and the thing doing the lighting is
   * a lamp near the subject wearing the same colour. Every set in this game is lit that way
   * once you look; this is the first one where the audience can see the sun as well.
   */
  /**
   * In front of the hills, not behind them.
   *
   * At z=-62 it was beyond the backdrop's hill line and simply never appeared - a sun
   * hidden by the landscape it is meant to be setting over. Pulled forward to sit just
   * above the ridge, which is where a low sun actually reads from, and raised so it clears
   * the water rather than sitting in it.
   */
  /**
   * Turned to face the viewer, which is why it was an egg.
   *
   * CircleGeometry is built in the XY plane facing +Z, and this one was translated into the
   * sky and left there. The camera does not look straight down -Z - it stands near the
   * ground and looks slightly up and across - so it met the disc at an angle and saw a
   * circle foreshortened along one axis. A perfectly round sun, drawn correctly, rendered
   * as an ellipse for exactly the reason a plate on a table looks oval.
   *
   * Rotating it to face the camera's own position fixes it. The sun is 40 metres out and
   * every shot in this scene stands within a couple of metres of the origin, so aiming at
   * one point near the origin is within a degree or two of correct for all of them - a
   * per-frame billboard would cost an update to save nothing anybody could measure.
   */
  const SUN_AT = new THREE.Vector3(LAKE_SUN_X, 6.4, -42);
  const EYE_AT = new THREE.Vector3(0, 2, 4);

  const faceViewer = (geometry: THREE.BufferGeometry, at: THREE.Vector3): THREE.BufferGeometry => {
    const facing = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      EYE_AT.clone().sub(at).normalize()
    );
    geometry.applyQuaternion(facing);
    geometry.translate(at.x, at.y, at.z);
    return geometry;
  };

  scene.registerProp(
    'sun-disc',
    meshOf('SunDisc', faceViewer(new THREE.CircleGeometry(2.6, 48), SUN_AT), MAT.sunDisc)
  );
  scene.registerProp(
    'sun-halo',
    // Nudged behind the disc along the same viewing axis, so the halo cannot poke through.
    meshOf(
      'SunHalo',
      faceViewer(new THREE.CircleGeometry(6.0, 48), SUN_AT.clone().add(new THREE.Vector3(0, 0, -0.4))),
      MAT.sunHalo
    )
  );

  // Field stone, half-buried. Cool grey so it never competes with a crop.
  scene.registerProp(
    'rocks',
    meshOf(
      'Rocks',
      rocks(rng, { centre: new THREE.Vector3(-0.4, 0, -0.6), width: 8.6, depth: 6.4, clear: 3.0 }, {
        count: 11,
        size: [0.09, 0.3],
      }),
      MAT.fieldStone
    )
  );

  /**
   * The glasshouse, in the middle distance.
   *
   * Not where the mission happens - the two beds under the hoops are still the puzzle,
   * because the tree shading one bank and not the other is the entire question. This is
   * behind and to the left, doing two jobs the beds cannot: it puts something BUILT on a
   * horizon that was bare hills, and it explains the smallholding. A person with two
   * seedling beds and a poly tunnel has a glasshouse; a person with only two beds in an
   * empty field has a diorama.
   */
  const glass = greenhouse(rng, {
    /**
     * Moved left and further back, off the tree.
     *
     * At (-5.6, -4.4) its near edge sat at x=-3.9 and the trunk stands at x=-3.7, so from
     * this camera the tree came down through the middle of the glasshouse and cut it in
     * two. Neither object was wrong; they were simply on the same line of sight, which is
     * the kind of thing that is invisible while you are placing one of them and obvious the
     * moment both are lit.
     *
     * The tree could not move - it has to be where it shades the tunnel, which is the
     * mission - so the dressing did.
     *
     * The first attempt moved it left AND back and barely helped, because moving something
     * further away slides it towards the vanishing point, which here is towards the tree.
     * So this is solved rather than nudged: projecting both through the shot's own camera
     * basis put the glasshouse's right edge at -0.252 and the trunk at -0.222 in tangent
     * units - three hundredths apart, which was never going to clear. At x=-8.4 the edge
     * lands at -0.333 against a trunk edge of -0.242, and the whole building is still
     * comfortably inside a horizontal half-angle of 0.87.
     */
    at: new THREE.Vector3(-8.4, 0, -5.8),
    width: 3.4,
    length: 5.8,
    wall: 1.75,
    ridge: 2.7,
  });
  scene.registerProp('glasshouse-base', meshOf('GlasshouseBase', glass.base, MAT.wall));
  scene.registerProp('glasshouse', meshOf('Glasshouse', glass.frame, MAT.greenhouseFrame));
  scene.registerProp(
    'glasshouse-glazing',
    meshOf('GlasshouseGlazing', glass.glass, MAT.greenhouseGlass)
  );

  /**
   * Inside the glasshouse, which was a lit empty box.
   *
   * A glasshouse with nothing in it is a shed made of glass, and this one is transparent -
   * so the emptiness was not hidden the way it would be behind a wall, it was the first
   * thing the eye found on the left of the frame. Staging down both sides with trays on it
   * fixes that for about forty boxes, and it says something the scene wanted anyway: she
   * raises things under glass and moves them out to the beds, which is exactly why a bank
   * of seedlings failing outdoors is worth a phone call.
   *
   * Simple boxes on purpose. It sits eleven metres from the lens behind two panes of
   * glazing, and anything finer would be paying for what the glass takes away.
   */
  const houseAt = new THREE.Vector3(-8.4, 0, -5.8);
  const staging: THREE.BufferGeometry[] = [];
  const trays: THREE.BufferGeometry[] = [];
  const underGlass: THREE.BufferGeometry[] = [];

  for (const side of [-1, 1] as const) {
    const bx = houseAt.x + side * 1.02;

    const top = new THREE.BoxGeometry(0.62, 0.05, 4.6);
    top.translate(bx, 0.78, houseAt.z);
    staging.push(top);

    for (let i = 0; i < 4; i++) {
      const leg = new THREE.BoxGeometry(0.07, 0.78, 0.07);
      leg.translate(bx, 0.39, houseAt.z - 2.0 + i * 1.33);
      staging.push(leg);
    }

    // Trays in a run, with gaps where she has already taken some out to the beds.
    for (let i = 0; i < 7; i++) {
      if (rng() < 0.22) continue;
      const tray = new THREE.BoxGeometry(0.5, 0.07, 0.5);
      tray.translate(bx + jitter(rng, 0.03), 0.84, houseAt.z - 1.95 + i * 0.62);
      trays.push(tray);

      const green = new THREE.BoxGeometry(0.42, range(rng, 0.05, 0.14), 0.42);
      green.translate(bx + jitter(rng, 0.03), 0.91, houseAt.z - 1.95 + i * 0.62);
      underGlass.push(green);
    }
  }

  scene.registerProp(
    'house-staging',
    meshOf('HouseStaging', mergeGeometries(staging, false) ?? staging[0], MAT.timberDark)
  );
  scene.registerProp(
    'house-trays',
    meshOf('HouseTrays', mergeGeometries(trays, false) ?? trays[0], MAT.soil)
  );
  scene.registerProp(
    'house-seedlings',
    meshOf('HouseSeedlings', mergeGeometries(underGlass, false) ?? underGlass[0], MAT.leaf)
  );

  scene.registerShot('default', {
    /*
     * Down the tunnel, so both banks are in frame at once and the difference between them
     * is the first thing read. Outside the mouth rather than inside it - from inside, the
     * nearest hoop sat across the lens and the two banks, the entire puzzle, were behind
     * it. Tilted up once there was a sky to tilt into, because the neighbour's tree is the
     * cause of the whole request and its crown was being cropped by the top edge.
     *
     * ## And then down to the waterline
     *
     * At 3.65m this looked down ON the smallholding: a plan of a field with things arranged
     * on it. Dropping to 1.9m puts the lens at the height of somebody standing in the
     * field, which does three things at once. The water gets a horizon instead of being a
     * shape lying on the ground. The tree gets its height back. And the beds are seen along
     * their length rather than from above, so the two banks read as rows rather than as
     * rectangles. An evening is only worth having if the camera is low enough to be in it.
     */
    /*
     * Back to 7.4m from her, because low is not the same as close.
     *
     * The first drop put the lens 4.4m from Adaeze while its subject was 13m away, and a
     * 1.71m person at four metres fills a frame - she stopped being someone standing in a
     * field and became a wall on the left of it. Height and distance are separate
     * decisions and I had changed both at once.
     *
     * Her perpendicular offset is 1.64m, wider than the 0.45-0.9 band at the top of this
     * file. That band was written for a camera looking down at a nine-metre set; with a
     * horizon, a lake and a sunset in shot she wants to be further out of the middle, not
     * less. The rule's purpose - that the contact frames the subject rather than blocking
     * it - is better served here by breaking its number.
     */
    position: new THREE.Vector3(2.4, 2.0, 9.2),
    target: new THREE.Vector3(-2.0, 1.5, -6.5),
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
  /**
   * Adaeze is standing in it, describing it.
   *
   * The blanket SHAPED default is right for a room somebody is phoning from and wrong for a
   * field somebody is walking through: it cooled the whole afternoon to a green-grey and
   * turned the calmest image in the game (§5) into the least inviting one. Measured at
   * R−B −17, when the intent is warm, still and long-shadowed.
   *
   * So the ground she is standing on and the beds she is talking about are DESCRIBED, and
   * the seedlings themselves - the entire subject of the request - are KNOWN. What stays
   * cool is what she has genuinely not mentioned: the far hedge, the neighbour's trees, the
   * water. The warm/cool split lands on the horizon, which is where a field's does anyway.
   */
  for (const [id, certainty] of [
    ['ground', CERTAINTY.DESCRIBED],
    ['meadow', CERTAINTY.DESCRIBED],
    ['beds', CERTAINTY.DESCRIBED],
    ['bed-soil', CERTAINTY.DESCRIBED],
    ['tunnel', CERTAINTY.DESCRIBED],
    ['dressing', CERTAINTY.DESCRIBED],
    ['dressing-timber', CERTAINTY.DESCRIBED],
    ['glasshouse', CERTAINTY.DESCRIBED],
    ['glasshouse-base', CERTAINTY.DESCRIBED],
    /*
     * The glasshouse is a glasshouse; what is on the staging inside it is not something
     * anybody has mentioned. Both were DESCRIBED, which left this room with nothing below
     * SHAPED anywhere in it - and a room with no guesses in it cannot ever perform §3,
     * because the resolve is drawn by a tier-1 volume retreating.
     */
    ['house-staging', CERTAINTY.SUSPECTED],
    ['house-trays', CERTAINTY.SUSPECTED],
    // The reason she called.
    ['rows-failing', CERTAINTY.KNOWN],
    ['rows-healthy', CERTAINTY.KNOWN],
    ['house-seedlings', CERTAINTY.KNOWN],
    ['planting-carrot', CERTAINTY.KNOWN],
    // The neighbour's tree is the reason she called - it is the thing throwing the shade -
    // so it belongs at the warm end with the beds, not out past the fence with the
    // scenery. Tiering it by distance rather than by what the request is ABOUT put the
    // subject of the mission in the cold half, which is the one mistake this system
    // exists to make impossible.
    ['neighbour-tree', CERTAINTY.KNOWN],
    ['shade', CERTAINTY.KNOWN],
    ['shore-tree', CERTAINTY.DESCRIBED],
    // Genuinely unmentioned. This is where the frame goes cold, and a field's warm/cool
    // break sits on the horizon in any case.
    ['hedge', CERTAINTY.SHAPED],
    ['rocks', CERTAINTY.SHAPED],
    ['fence', CERTAINTY.SHAPED],
  ] as [string, number][]) {
    scene.setCertainty(id, certainty);
  }

  /**
   * What Adaeze can tell the machine, and what it makes visible.
   *
   * The subject of the call stays warm from the first frame - the tree, the shade and the
   * failing rows are what she rang about, and the note above is right that tiering them by
   * distance rather than by what the request is ABOUT is the one mistake this system
   * exists to prevent. So none of these reveals touch them.
   *
   * They reveal what she is ASKED. Which is the other half of the same idea: the warm
   * things are the ones somebody has spoken about, and the player earns the rest by
   * asking.
   */
  // The kit inside the glasshouse is sound, which is the fact that rules out equipment as
  // the cause - and the first time anybody says what is on the staging at all. This is the
  // room's one resolve sweep, and it happens inside the glasshouse, in frame.
  scene.revealOn(FACT_EQUIPMENT_FINE, 'house-staging', CERTAINTY.DESCRIBED);
  scene.revealOn(FACT_EQUIPMENT_FINE, 'house-trays', CERTAINTY.DESCRIBED);
  /*
   * Where the line falls is the deduction, and it falls across the beds. The machine knows
   * their shape from the start - they are obviously raised beds - and knows nothing about
   * their state until she describes the shadow crossing them.
   */
  scene.revealOn(FACT_SHADE_LINE, 'beds', CERTAINTY.DESCRIBED);
  scene.revealOn(FACT_SHADE_LINE, 'bed-soil', CERTAINTY.DESCRIBED);
  /*
   * And the boundary. The tree growing over years is only a problem because it is somebody
   * else's tree, so learning that is what makes the fence and the hedge worth drawing
   * properly - they stop being scenery at the horizon and become the property line.
   */
  scene.revealOn(FACT_TREE_GREW, 'fence', CERTAINTY.DESCRIBED);
  scene.revealOn(FACT_TREE_GREW, 'hedge', CERTAINTY.DESCRIBED);
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

  // Boards, running toward the window. See plankSeams: this is what the deleted grain
  // used to be doing, done as geometry so it survives a flat material.
  scene.registerProp(
    'floor-seams',
    meshOf(
      'FloorSeams',
      plankSeams(rng, {
        at: new THREE.Vector3(0, 0.001, 0),
        width: 7,
        length: 6,
        board: 0.19,
      }),
      MAT.timberDark
    )
  );

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
    // Inked: The box of photographs the whole request is a search through.
    inked: true,
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

  /**
   * Two chairs, genuinely nested - third attempt, and the arithmetic is the fix.
   *
   * Attempt one gave the upper chair 12cm legs so it would perch on the lower seat, which
   * read as HALF a chair on a chair. Attempt two made both of them whole, which was the
   * right idea and stopped there: the upper one was placed at y 0.40 with 0.44 legs, so
   * its seat landed 40cm above the lower seat. That is not a stack. That is a chair
   * hovering over a chair, which is exactly what it looked like and exactly what got
   * reported - twice.
   *
   * A real stack of dining chairs is barely taller than one chair, because the upper one's
   * legs go down INSIDE the frame below and its seat ends up a hand's width above the seat
   * under it. Measured: lower seat top is 0.49, so the upper origin wants to be about 0.10,
   * not 0.40. Its legs then run 0.10 to 0.54 and pass straight through the lower seat -
   * that intersection IS the stack, and it is what makes the legs disappear the way they
   * do on a real one.
   *
   * They are also nearly aligned in yaw now. Chairs only nest when they are facing the
   * same way; the old pair were 18 degrees apart, which is another reason they read as two
   * objects that happened to be near each other rather than as one stack.
   */
  const chairTurn = 0.1 + jitter(rng, 0.06);
  addChair(new THREE.Vector3(1.75, 0, -1.5), chairTurn, 0.44);
  addChair(new THREE.Vector3(1.762, 0.1, -1.487), chairTurn + jitter(rng, 0.05), 0.44);

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
      // Bare-headed and long-sleeved. The oldest person in the cast and the only one
      // not dressed for a job.
      headgear: 'none',
      sleeve: 'long',
      pouch: false,
    // Unhurried and deep. The oldest person in the cast, standing in her own house,
    // in no hurry at all - and the only one whose slowness is not exhaustion.
    temperament: 'settled',
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
    /**
     * Hands flat on the near edge of the table, which is where two days of sorting
     * photographs puts them - and on the EDGE rather than out among the box and the
     * envelopes, because she has stopped. That is the whole reason she is calling.
     */
    handsOn: {
      left: new THREE.Vector3(-1.02, 0.79, -1.47),
      right: new THREE.Vector3(-0.8, 0.79, -1.5),
    },
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
      /**
       * Pulled back and softened, because it was clipping her.
       *
       * Sampled off the default shot her face read 172 against a room at 69-82 - two and a
       * half times its surroundings, and a white blob with two dots on it rather than a
       * face. She stands almost directly under this light and inside the bulb's fill as
       * well, so the two stacked on the one surface in the scene that has no tolerance for
       * it: skin is already the lightest material a contact wears, and it clips first.
       *
       * The other reason the number was wrong: this is the light from a window, and a
       * window three metres away does not fall off like a bulb. Longer distance and a
       * gentler decay give a flatter wash across the whole room instead of a hotspot on
       * whoever happens to be standing under it.
       */
      position: new THREE.Vector3(-0.35, 2.35, -1.7),
      intensity: 10.5,
      color: new THREE.Color('#cfe0f0'),
      distance: 12,
      decay: 0.85,
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
      // Down again, for the same reason as the daylight above: she stands under both, and
      // two fills that are each defensible alone add up on her face.
      intensity: 4.4,
      color: new THREE.Color('#ffd0a0'),
      distance: 5.0,
      decay: 1.5,
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

  /**
   * -- What the machine knows about the house Ileana is emptying -----------------------
   *
   * She rang about a box of photographs, so that is what is warm. The house around it is a
   * house - she has said as much by standing in it - and the two things nobody has
   * described are the papers on the table and whatever is through the door.
   *
   * §5 asks this room for "emptied, not abandoned", and the guesses help: a room being
   * cleared is full of things whose contents nobody can any longer account for, which is
   * the same sentence tier 1 draws.
   */
  for (const [id, certainty] of [
    ['photo-box', CERTAINTY.KNOWN],
    ['table', CERTAINTY.SHAPED],
    ['floor', CERTAINTY.SHAPED],
    ['floor-seams', CERTAINTY.SHAPED],
    ['wall', CERTAINTY.SHAPED],
    ['window', CERTAINTY.SHAPED],
    ['window-frame', CERTAINTY.SHAPED],
    ['door-casing', CERTAINTY.SHAPED],
    ['light-fitting', CERTAINTY.SHAPED],
    ['bulb', CERTAINTY.SHAPED],
    ['chairs', CERTAINTY.SHAPED],
    ['curtain-rail', CERTAINTY.SHAPED],
    // The tide line is evidence the machine can read for itself once it is drawing a wall.
    ['tide-line', CERTAINTY.SHAPED],
    /*
     * Both SHAPED, and both were SUSPECTED until it was checked on screen.
     *
     * The fiction is sound - nobody has mentioned the envelopes or said what is beyond the
     * door - and both are unbuildable as guesses, for opposite reasons.
     *
     * `letters` is four envelopes 3mm thick stacked at 3.5mm intervals. Its bounding
     * volume is a wafer 16cm by 2cm by 11cm, which at the shot distance is a few dozen
     * pixels of wireframe: the tier applies correctly and cannot be seen. That is the
     * doorstep lesson from the other end - too sprawling to be a likeness, or too flat to
     * be a volume, and this is the second.
     *
     * `hall` is worse and is a category error. It is a PlaneGeometry standing in for the
     * dark beyond the door: not an object the machine is unsure about, but the absence of
     * one. createSuspicion's own note says it - wrapping a thing like that in a glowing box
     * invents an object the room does not contain.
     *
     * So this room warms by colour and has no guesses in it, which is allowed. Not every
     * room needs one; the night door reached the same place by the same argument.
     */
    ['letters', CERTAINTY.SHAPED],
    ['hall', CERTAINTY.SHAPED],
  ] as [string, number][]) {
    scene.setCertainty(id, certainty);
  }

  // Names written on the backs. The moment the papers stop being clutter and become the
  // record - which is the mission, and it happens on the table in the middle of the frame.
  scene.revealOn(FACT_NAMES_ON_PHOTOGRAPHS, 'letters', CERTAINTY.DESCRIBED);
  // The flood took the records, so the mark on the wall stops being a stain and becomes
  // the reason there is nothing else to go on.
  scene.revealOn(FACT_FLOOD_TOOK_RECORDS, 'tide-line', CERTAINTY.DESCRIBED);
  // Once the machine has her family line it has an account of whose house this is, and the
  // rest of it stops being somewhere she happens to be standing.
  scene.revealOn(FACT_ILEANA_LINE, 'hall', CERTAINTY.DESCRIBED);
}

/**
 * MISSION 05 - the school cellar, filling.
 *
 * §131: the room has to carry the request. Three things do it here and everything else is
 * mass - the water on the floor, the three open inspection covers with junction boxes in
 * them, and the chalk marks on the wall that say this has happened before and somebody has
 * been keeping score.
 *
 * The pipework is the set. It runs along the wall and disappears into the floor in four
 * visibly different materials, because Vasile's whole line is that four people built this
 * across fifty years - and a player who can SEE lead give way to copper give way to
 * plastic has been told that before he says it.
 */
function buildFloodedCellar(scene: ContactScene): void {
  const rng = createRng(seedFrom('vasile-cellar'));

  const WALL_TOP = 2.4;

  const floor = new THREE.BoxGeometry(8, 0.1, 6);
  floor.translate(0, -0.05, 0);
  scene.registerProp('floor', meshOf('Floor', floor, MAT.ground));

  const backWall = new THREE.BoxGeometry(8, WALL_TOP, 0.18);
  backWall.translate(0, WALL_TOP / 2, -2.2);
  scene.registerProp('wall', meshOf('Wall', backWall, MAT.wall));

  const sideWall = new THREE.BoxGeometry(0.18, WALL_TOP, 4.6);
  sideWall.translate(-3.4, WALL_TOP / 2, 0.2);
  scene.registerProp('side-wall', meshOf('SideWall', sideWall, MAT.wall));

  /**
   * A ceiling, because this was a room with no lid.
   *
   * The walls stopped at 2.4 and everything above them was the void the camera clears -
   * a hard black band straight across the top of every shot in the scene. At a squint it
   * is the first thing you see and it reads as a stage set with the lights showing, which
   * is fatal in the one room that is supposed to feel like being underground.
   *
   * It is also the cheapest lighting in the game. The lamp on the back wall had nothing
   * above it to catch, so its throw stopped dead; joists over it give the light something
   * to break against and put a run of hard shadows across the top of frame, which is what
   * a bare bulb in a cellar actually does. Low, too - 2.4m is generous for a cellar, and
   * the beams coming down to 2.2 press the ceiling onto the room.
   */
  const lid = new THREE.BoxGeometry(8, 0.12, 6);
  lid.translate(0, WALL_TOP + 0.06, 0);
  scene.registerProp('ceiling', meshOf('Ceiling', lid, MAT.wall));

  const joists: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const beam = new THREE.BoxGeometry(7.9, 0.2, 0.14);
    beam.translate(0, WALL_TOP - 0.1, -2.1 + i * 0.72);
    joists.push(beam);
  }
  scene.registerProp(
    'joists',
    meshOf('Joists', mergeGeometries(joists, false) ?? joists[0], MAT.timberDark)
  );

  /**
   * How deep the flood is, declared once because three things need it: the water plane,
   * the wetting on everything standing in it, and the drain cue that lowers it.
   *
   * It was 0.06. Six centimetres is a wet floor - it is not a thing a man rings a stranger
   * about at night, and it is below the height at which any of it is visible: no object in
   * the room crosses it far enough to show a mark, so the scene had a reflective sheet and
   * no evidence. Twenty-two centimetres is mid-shin. It reaches the boxes, it reaches the
   * sump, and it reaches Vasile, which is the whole point - the man is standing IN it.
   */
  const WATER_LEVEL = 0.22;

  /**
   * The water.
   *
   * A lit plane rather than a painted one: MAT.floodwater was a MeshBasicMaterial, which
   * cannot reflect anything by definition, so the one scene whose entire premise is a flood
   * had a flat sheet on the floor. See art/floodwater for what makes it read - one bright
   * thing appearing again where a solid floor should be.
   */
  const waterGeo = new THREE.PlaneGeometry(7.6, 5.6);
  waterGeo.rotateX(-Math.PI / 2);
  waterGeo.translate(0, WATER_LEVEL, 0);
  const flood = createFloodwater();
  const waterMesh = meshOf('Water', waterGeo, flood.material);

  /**
   * The run, as something that can be seen to carry water.
   *
   * Filled by the span loop below and read by the drain cue, which fires later - so the
   * array being empty at this point in the file is fine and the closure gets the real one.
   */
  interface RunPart {
    material: THREE.MeshStandardMaterial;
    dry: THREE.Color;
    dryRoughness: number;
    dryMetalness: number;
    /** Where along the wall it sits, which is what the wetting front is compared against. */
    x: number;
  }
  const runParts: RunPart[] = [];
  let runIsWet = false;

  scene.registerProp('water', waterMesh, {
    // Standing water is never still. The ripple is the only thing in this room that says
    // the flood is present rather than remembered.
    idle: (deltaTime) => flood.update(deltaTime),
    anchors: { default: new THREE.Vector3(0, WATER_LEVEL, 0) },
    actions: {
      /**
       * The room performs the answer.
       *
       * The puzzle is topology - which pipe connects to what - and it used to resolve as a
       * dark plane quietly fading out. That tells the player the flood went away. It does
       * not tell them THEY ROUTED IT, which is the entire thing they just did.
       *
       * So the wetting runs first and travels: a front crossing the wall from the sump end
       * to the outfall over a second and a half, darkening each length of pipe as the water
       * reaches it. Four materials laid end to end by four different people across fifty
       * years, wetting in the order the water actually passes through them. Then the flood
       * drops, half a beat behind, because the water has to be going SOMEWHERE before the
       * floor is allowed to reappear.
       */
      clear: (tweener) => {
        tweener.add(
          (t) => {
            // Sump end to outfall end, with a little overshoot at each end so the first and
            // last spans get a full wetting rather than half of one.
            const front = -3.6 + t * 7.2;
            for (const part of runParts) {
              // Half a metre of transition, so a span darkens across itself rather than
              // switching. A hard front would read as four lights coming on.
              const wet = Math.max(0, Math.min(1, (front - part.x) / 0.5));
              part.material.color.copy(part.dry).multiplyScalar(1 - wet * 0.42);
              part.material.roughness = part.dryRoughness * (1 - wet * 0.55);
              /**
               * Metalness down as well, which is both correct and necessary.
               *
               * A metal's colour only reaches the eye through the diffuse term, scaled by
               * (1 - metalness) - so at 0.65 the lead and steel spans darkened by a third
               * of what the plastic did, and measured as no change at all: 33 before, 33
               * after, while the copper next to them went 27 to 15. Half the run sat out
               * its own cue.
               *
               * A film of water on metal is a dielectric layer over it, so it should read
               * as less metallic, not more. The fix and the physics are the same fix.
               */
              part.material.metalness = part.dryMetalness * (1 - wet * 0.5);
            }
          },
          {
            duration: 1.5,
            easing: Ease.linear,
            channel: 'cellar-wet',
            onComplete: () => {
              runIsWet = true;
            },
          }
        );

        /** It drains: the sheet drops and thins away. */
        const material = waterMesh.material as THREE.MeshBasicMaterial;
        const from = material.opacity;
        tweener.add(
          (t) => {
            waterMesh.position.setY(-t * 0.055);
            material.opacity = from * (1 - t * 0.85);
          },
          { duration: 2.6, delay: 0.7, easing: Ease.outCubic, channel: 'cellar-drain' }
        );
      },
    },
  });

  /**
   * The run, in four materials.
   *
   * Lead, copper, plastic, and the length Vasile put in himself - laid end to end along
   * the wall so the joins between them are visible. This is the mission's premise as
   * geometry.
   */
  const runY = 1.35;
  const spans: Array<[number, number, 'metal' | 'copper' | 'plastic' | 'steel']> = [
    [-3.1, -1.6, 'metal'],
    [-1.6, -0.2, 'copper'],
    [-0.2, 1.4, 'plastic'],
    [1.4, 3.1, 'steel'],
  ];
  /**
   * Cloned, not shared.
   *
   * MAT is one family built once and used by all seven dioramas - so darkening MAT.metal
   * to show water in this cellar would also wet Sanda's torch, the mill lamps and every
   * bracket in the repair shop. The clone is per length of pipe, which is also what lets
   * the front cross the run instead of the whole thing changing at once.
   */
  const wettable = (base: THREE.Material, x: number): THREE.MeshStandardMaterial => {
    const clone = (base as THREE.MeshStandardMaterial).clone();
    runParts.push({
      material: clone,
      dry: clone.color.clone(),
      dryRoughness: clone.roughness,
      dryMetalness: clone.metalness,
      x,
    });
    return clone;
  };

  const joins: THREE.Vector3[] = [];
  for (const [from, to, material] of spans) {
    const pipe = new THREE.CylinderGeometry(0.055, 0.055, to - from, 8);
    pipe.rotateZ(Math.PI / 2);
    pipe.translate((from + to) / 2, runY + jitter(rng, 0.02), -2.0);
    scene.registerProp(
      `run-${material}`,
      meshOf(`Run-${material}`, pipe, wettable(MAT[material], (from + to) / 2))
    );

    // A collar at every join - the place where one person's work met the next one's.
    const collar = new THREE.CylinderGeometry(0.072, 0.072, 0.06, 8);
    collar.rotateZ(Math.PI / 2);
    collar.translate(to, runY, -2.0);
    scene.registerProp(
      `join-${material}`,
      meshOf(`Join-${material}`, collar, wettable(MAT.metal, to))
    );
    joins.push(new THREE.Vector3(to, runY - 0.07, -2.0));
  }

  /**
   * What fifty years of other people's joins look like once they are working.
   *
   * Not a failure. A run this old weeps a little at every collar and always has - Vasile
   * knows that and would not thank anybody for calling it out. It is here because a pipe
   * that carries water and never shows any is a drawing of a pipe, and because the drip is
   * the smallest possible thing that keeps the room alive after the cue has finished:
   * §131, the environment carrying its own evidence.
   *
   * Only after the front has passed - beads on a dry run would be the leak the mission
   * explicitly does not have.
   */
  const drips = ENGINE.SceneNode.create({ name: 'RunDrips', position: new THREE.Vector3() });
  const dripBodies = joins.map((at, i) => {
    const bead = new THREE.SphereGeometry(0.019, 6, 5);
    // Slightly egg-shaped. A perfect sphere reads as a ball bearing, not as water.
    bead.scale(1, 1.35, 1);
    const node = meshOf(`Drip${i}`, bead, MAT.floodwater);
    node.position.copy(at);
    node.visible = false;
    drips.add(node);
    return { node, at, phase: range(rng, 0, 3.2) };
  });

  const DRIP_PERIOD = 3.2;
  // Drips land on the surface, wherever that currently is - not on a second copy of the
  // number, which is how a drop ends up falling through the water it is supposed to join.
  const WATER_Y = WATER_LEVEL;
  scene.registerProp('run-drips', drips, {
    idle: (deltaTime) => {
      if (!runIsWet) return;
      for (const drip of dripBodies) {
        drip.phase += deltaTime;
        const t = (drip.phase % DRIP_PERIOD) / DRIP_PERIOD;
        drip.node.visible = t < 0.94;
        if (t < 0.76) {
          // Swelling at the collar. It hangs far longer than it falls, which is what makes
          // a drip read as a drip rather than as rain.
          const swell = 0.25 + (t / 0.76) * 0.75;
          drip.node.scale.set(swell, swell, swell);
          drip.node.position.copy(drip.at);
        } else {
          const fall = (t - 0.76) / 0.18;
          drip.node.scale.set(1, 1, 1);
          // Accelerating, because a drop falling at constant speed looks like it is being
          // lowered on a wire.
          drip.node.position.set(
            drip.at.x,
            drip.at.y - (drip.at.y - WATER_Y) * fall * fall,
            drip.at.z
          );
        }
      }
    },
  });

  /**
   * The drop into the floor and the outfall through the wall - both in the sweep.
   *
   * Left out of it at first, which put a dry length of pipe at each end of a wet run and
   * stopped the front short of both walls. They are the two ends of the thing the player
   * just connected; if anything should be seen to carry water it is those.
   */
  const drop = new THREE.CylinderGeometry(0.055, 0.055, runY, 8);
  drop.translate(-3.05, runY / 2, -2.0);
  scene.registerProp('drop', meshOf('Drop', drop, wettable(MAT.metal, -3.05)));

  const outfall = new THREE.CylinderGeometry(0.07, 0.07, 0.5, 8);
  outfall.rotateX(Math.PI / 2);
  outfall.translate(3.05, runY, -2.15);
  scene.registerProp('outfall', meshOf('Outfall', outfall, wettable(MAT.steel, 3.05)));

  /**
   * Three inspection covers, up.
   *
   * Lifted and leaning against the wall beside their own openings, because a cover lying
   * flat beside a hole reads as a hole with a lid near it, and a cover propped up reads as
   * somebody having got it up and gone in.
   */
  const openings: THREE.BufferGeometry[] = [];
  const lids: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const x = -1.5 + i * 1.5;
    const hole = new THREE.BoxGeometry(0.52, 0.04, 0.52);
    hole.translate(x, 0.02, -0.9);
    openings.push(hole);

    const lid = new THREE.BoxGeometry(0.54, 0.05, 0.54);
    lid.rotateX(-1.15 + jitter(rng, 0.1));
    lid.translate(x + jitter(rng, 0.06), 0.26, -1.32);
    lids.push(lid);
  }
  scene.registerProp(
    'covers',
    meshOf('Covers', mergeGeometries(openings, false) ?? openings[0], MAT.dark),
    {
      // Inked: the three lifted covers. What the request is a search along.
      inked: true,
      anchors: { default: new THREE.Vector3(0, 0.3, -0.9) },
    }
  );
  scene.registerProp('lids', meshOf('Lids', mergeGeometries(lids, false) ?? lids[0], MAT.steel));

  /**
   * The chalk marks. Four springs, four heights, and the highest one dated.
   *
   * §240 - real content, and it is the quietest piece of storytelling in the room: this
   * building floods, everybody knows it floods, and somebody has been standing here with a
   * piece of chalk every year instead of anybody fixing it.
   */
  const marks: THREE.BufferGeometry[] = [];
  for (const height of [0.42, 0.66, 0.81, 0.98] as const) {
    const mark = new THREE.BoxGeometry(0.3, 0.018, 0.02);
    mark.rotateZ(jitter(rng, 0.03));
    mark.translate(-2.4 + jitter(rng, 0.08), height, -2.1);
    marks.push(mark);
  }
  scene.registerProp(
    'marks',
    meshOf('Marks', mergeGeometries(marks, false) ?? marks[0], MAT.paper)
  );

  // The sump and its pump, in the corner the run drops into.
  const sump = new THREE.CylinderGeometry(0.34, 0.34, 0.5, 12);
  sump.translate(-2.6, 0.25, -1.5);
  scene.registerProp('sump', meshOf('Sump', sump, MAT.dark));

  const pump = new THREE.CylinderGeometry(0.13, 0.15, 0.34, 10);
  pump.translate(-2.6, 0.62, -1.5);
  scene.registerProp('pump', meshOf('Pump', pump, MAT.equipment));

  /**
   * -- Dressing, and the one idea behind all of it --------------------------------------
   *
   * This was the barest room in the game: seventeen props, every one of them structure or
   * a light. A wall, a floor, a run of pipe and nothing that anybody had ever put down.
   *
   * The organising idea is not "add clutter", it is EVERYTHING IN HERE IS UP. Boxes on a
   * pallet, timber on blocks, tins on a shelf above the run, a bucket upside down so it
   * does not fill. That is what a cellar looks like when it floods every spring, and it
   * tells the player what the room does before Vasile says a word - §131, the environment
   * carrying its own evidence rather than illustrating dialogue that already exists.
   *
   * The exception is the argument. One box was left on the floor, once, and it is still
   * there: dark to well above the current waterline, collapsed at the bottom. Everything
   * else in the room is a decision somebody made because of that box.
   *
   * Merged per material and registered as four props rather than twenty, because §187
   * wants one material family and the draw call cost of a lived-in room should be the cost
   * of the room, not of each thing in it.
   */
  const dressTimber: THREE.BufferGeometry[] = [];
  const dressMetal: THREE.BufferGeometry[] = [];
  const dressCard: THREE.BufferGeometry[] = [];

  /** A pallet: three bearers and five deck boards, which is enough to read as one. */
  const pallet = (x: number, z: number, turn: number): number => {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 3; i++) {
      const bearer = new THREE.BoxGeometry(1.1, 0.09, 0.09);
      bearer.translate(0, 0.045, -0.38 + i * 0.38);
      parts.push(bearer);
    }
    for (let i = 0; i < 5; i++) {
      const board = new THREE.BoxGeometry(1.1, 0.022, 0.13);
      board.translate(0, 0.1, -0.4 + i * 0.2);
      parts.push(board);
    }
    for (const part of parts) {
      part.rotateY(turn);
      part.translate(x, 0, z);
      dressTimber.push(part);
    }
    return 0.111; // deck height, so callers can stand things on it
  };

  // Against the back wall, right of the run where the frame was emptiest.
  const deck = pallet(2.25, -1.72, jitter(rng, 0.09));

  /**
   * Three boxes up on the pallet, and one left on the floor.
   *
   * Stacked slightly out of square and turned a few degrees off each other - a stack that
   * is perfectly aligned reads as a rendering of boxes rather than as boxes somebody put
   * there in a hurry with wet hands.
   */
  for (let i = 0; i < 3; i++) {
    const w = range(rng, 0.38, 0.52);
    const h = range(rng, 0.26, 0.34);
    const box = new THREE.BoxGeometry(w, h, range(rng, 0.34, 0.46));
    box.rotateY(jitter(rng, 0.22));
    box.translate(2.25 + jitter(rng, 0.11), deck + h / 2 + i * 0.31, -1.72 + jitter(rng, 0.1));
    dressCard.push(box);
  }

  /**
   * The one on the floor, which is the point of the other three.
   *
   * Squashed on its vertical axis rather than modelled as collapsed - a box that has been
   * wet to halfway and then dried sits down into itself, and 0.6 of its own height reads
   * as that from across the room. Given the tide stain material, so it carries the mark of
   * a flood higher than the one currently in the room.
   */
  const ruined = new THREE.BoxGeometry(0.46, 0.3, 0.4);
  ruined.scale(1.06, 0.6, 1.06);
  ruined.rotateY(0.31);
  ruined.translate(1.15, 0.09, -1.1);
  scene.registerProp('ruined-box', meshOf('RuinedBox', ruined, MAT.tideStain));

  /**
   * Timber on blocks, along the left of the back wall.
   *
   * Long and low, which is the shape the room needed - the wall was two big flat values
   * with a pipe across it, and a horizontal stack at knee height gives the eye something
   * between the floor and the run. §241: depth out of layers.
   */
  for (const bx of [-2.85, -1.35] as const) {
    const block = new THREE.BoxGeometry(0.2, 0.19, 0.24);
    block.translate(bx, 0.095, -1.86);
    dressTimber.push(block);
  }
  for (let i = 0; i < 7; i++) {
    const length = range(rng, 1.75, 1.95);
    const plank = new THREE.BoxGeometry(length, 0.045, range(rng, 0.11, 0.15));
    plank.rotateY(jitter(rng, 0.02));
    plank.translate(-2.1 + jitter(rng, 0.06), 0.21 + i * 0.048, -1.86 + jitter(rng, 0.05));
    dressTimber.push(plank);
  }

  /**
   * A shelf above the run, and what is on it.
   *
   * Deliberately ABOVE the pipes. It is the highest thing in the room and the only place
   * that has never been under water, which is why the tins are there and not on the floor.
   * It also puts a third horizontal band on a wall that had one.
   */
  const shelfBoard = new THREE.BoxGeometry(1.6, 0.04, 0.26);
  shelfBoard.translate(2.3, 1.86, -1.98);
  dressTimber.push(shelfBoard);
  for (const bx of [1.65, 2.95] as const) {
    const bracket = new THREE.BoxGeometry(0.04, 0.2, 0.22);
    bracket.translate(bx, 1.76, -1.98);
    dressTimber.push(bracket);
  }
  for (let i = 0; i < 5; i++) {
    const r = range(rng, 0.045, 0.07);
    const tin = new THREE.CylinderGeometry(r, r, range(rng, 0.1, 0.16), 9);
    tin.translate(1.78 + i * 0.26 + jitter(rng, 0.03), 1.95, -1.97 + jitter(rng, 0.04));
    dressMetal.push(tin);
  }

  /**
   * A bucket, upside down.
   *
   * The single most efficient object in the room. Right way up it is a bucket; upside down
   * it is somebody who has learned not to leave anything hollow standing in a cellar that
   * fills. Same twelve triangles, completely different sentence.
   */
  // Capped, not open. Built open-ended first, which made it a length of pipe you could
  // see straight through - an upturned bucket is only legible if it has a bottom on top.
  const bucket = new THREE.CylinderGeometry(0.13, 0.16, 0.28, 10);
  bucket.translate(-0.55, 0.2, -0.35);
  dressMetal.push(bucket);

  // The mop that goes with it, stood in the corner rather than left in the water.
  const handle = new THREE.CylinderGeometry(0.018, 0.018, 1.5, 6);
  handle.rotateZ(0.13);
  handle.translate(-3.05, 0.78, -1.55);
  dressTimber.push(handle);
  const head = new THREE.BoxGeometry(0.16, 0.2, 0.09);
  head.rotateZ(0.13);
  head.translate(-3.14, 0.12, -1.55);
  dressCard.push(head);

  /**
   * A stepladder against the side wall.
   *
   * Leaning rather than open, because an open stepladder in the middle of a floor is a
   * thing being used and this room is a thing being lived with. It is also the tallest
   * object on the left, which stops the side wall being a blank the eye slides off.
   */
  const LEAN = 0.16;
  for (const side of [-1, 1] as const) {
    const rail = new THREE.BoxGeometry(0.05, 1.72, 0.05);
    rail.rotateZ(LEAN);
    rail.translate(-3.12 + Math.sin(LEAN) * 0.86, 0.86, 0.55 + side * 0.2);
    dressTimber.push(rail);
  }
  for (let i = 0; i < 5; i++) {
    const rung = new THREE.BoxGeometry(0.05, 0.035, 0.44);
    const y = 0.24 + i * 0.34;
    rung.translate(-3.12 + Math.sin(LEAN) * (0.86 - y) + 0.14, y, 0.55);
    dressTimber.push(rung);
  }

  scene.registerProp(
    'dress-timber',
    meshOf('DressTimber', mergeGeometries(dressTimber, false) ?? dressTimber[0], MAT.timberDark)
  );
  scene.registerProp(
    'dress-metal',
    meshOf('DressMetal', mergeGeometries(dressMetal, false) ?? dressMetal[0], MAT.steel)
  );
  /**
   * Cardboard stays on MAT.timber, having been moved off it and put back.
   *
   * They looked like the brightest thing in the frame, so I darkened them to timberDark -
   * and measured luma 14 against a lit wall at 149. Not subordinate, gone. The eye had
   * been reporting "warm and near the camera", which is not the same as "brighter than its
   * surroundings", and this project's whole discipline is that the second one is a number.
   *
   * The measured order is what composition actually wants: the run at 181, the lamp at
   * 144, the wall at 149, the boxes level with the wall they stand against. The mission is
   * still the brightest object in the room.
   */
  scene.registerProp(
    'dress-card',
    meshOf('DressCard', mergeGeometries(dressCard, false) ?? dressCard[0], MAT.timber)
  );

  addContact(scene, 'Vasile', {
    seed: 'vasile-crastea',
    height: 1.78,
    build: 0.62,
    shoulders: 0.66,
    lean: 0.28,
    reach: 0.9,
      // Cap and a full tool belt. Fifty years of other people's pipework.
      headgear: 'cap',
      sleeve: 'long',
      beard: true,
      pouch: true,
    temperament: 'working',
    garment: 'overalls',
    colors: { garment: '#3d4a53', underlayer: '#b9ad92' },
    /**
     * Back against the wall by the run, not in the middle of the floor.
     *
     * He was at (0.55, 0, -0.05), which put him two thirds of the way along the camera's
     * own sightline to its target - a 1.78m man filling the frame from behind, with the
     * water, the covers and the four-material run all behind him. The whole room was
     * hidden by the person describing it.
     */
    position: new THREE.Vector3(-1.15, 0, -1.6),
    rotation: new THREE.Euler(0, 0.7, 0),
    /**
     * One hand on the pipe he is talking about.
     *
     * Not on an inspection cover: those are at floor level and a standing man cannot
     * reach one - measured, 0.68 against an arm that is 0.63. The run along the wall at
     * 1.35 is chest height and is the thing his whole opening line is about.
     */
    handsOn: {
      left: new THREE.Vector3(-1.45, 1.35, -1.95),
    },
    liveliness: 1.15,
  });

  // -- Light -----------------------------------------------------------------
  // One bulkhead lamp on the wall and a cold spill off the water. A cellar has no windows,
  // so this is the only room in the game lit entirely by its own fittings.
  const lampAt = new THREE.Vector3(-0.4, 2.05, -2.0);
  const shade = new THREE.SphereGeometry(0.12, 10, 8);
  shade.translate(lampAt.x, lampAt.y, lampAt.z + 0.1);
  scene.registerProp('bulkhead', meshOf('Bulkhead', shade, MAT.lamp));

  scene.registerProp(
    'lamp',
    ENGINE.PointLightNode.create({
      name: 'Bulkhead',
      position: lampAt.clone().add(new THREE.Vector3(0, 0, 0.2)),
      intensity: 11,
      color: new THREE.Color('#ffdcae'),
      distance: 7,
      decay: 1.3,
    })
  );

  /**
   * Bounce off the water.
   *
   * A cold uplight from below, which is the one lighting cue that says "there is water on
   * this floor" without drawing a single ripple - it is what a flooded room actually looks
   * like, and it costs one point light.
   */
  scene.registerProp(
    'waterbounce',
    ENGINE.PointLightNode.create({
      name: 'WaterBounce',
      position: new THREE.Vector3(0.2, 0.25, -0.4),
      intensity: 3.4,
      color: new THREE.Color('#8fb6c4'),
      distance: 5,
      decay: 1.6,
    })
  );

  /**
   * Two lights the cellar was missing, both found by sampling rather than by looking.
   *
   * Off the default shot: bulkhead lamp 166, his face 57, THE PIPE RUN 43, back wall 41.
   * Two things wrong with that, and the second is worse.
   *
   * His face sat sixteen points above the wall behind it, which is not separation - it is
   * a man the same colour as his own cellar. And the run, which is the evidence, the thing
   * every hint points at and the reason the request exists, was at 43 against a wall at
   * 41. Identical. The outline pass is the only reason it could be found at all, and an
   * outline is meant to sharpen something the eye has already located, not to do the
   * locating.
   *
   * So: a cold fill on the camera side for him, and a warm wash along the run. The wash is
   * motivated - the bulkhead is above and behind it, so light reaching the pipes from that
   * direction is exactly what the fitting would do; it was simply never strong enough to
   * survive the distance.
   */
  scene.registerProp(
    'face-fill',
    ENGINE.PointLightNode.create({
      name: 'FaceFill',
      position: new THREE.Vector3(1.9, 1.7, 1.4),
      intensity: 4.6,
      color: new THREE.Color('#a8c0d4'),
      distance: 4.4,
      decay: 1.5,
    })
  );

  scene.registerProp(
    'run-wash',
    ENGINE.PointLightNode.create({
      name: 'RunWash',
      position: new THREE.Vector3(0.4, 1.5, -1.1),
      intensity: 5.2,
      color: new THREE.Color('#ffd8b0'),
      distance: 5.2,
      decay: 1.4,
    })
  );

  scene.registerShot('default', {
    // Along the run, so the four materials and the three open covers are all in frame and
    // the water reads as a plane rather than as a dark floor.
    // Pulled back and swung right so the covers, the run and the water are all in frame
    // with Vasile at the left edge rather than in the middle of the lens.
    position: new THREE.Vector3(3.3, 1.8, 3.5),
    target: new THREE.Vector3(-0.3, 0.6, -1.35),
  });
  scene.registerShot('covers', {
    position: new THREE.Vector3(0.9, 1.15, 1.1),
    target: new THREE.Vector3(-0.4, 0.2, -1.0),
    duration: 2.2,
  });

  /**
   * -- What the machine knows about Vasile's cellar, and what he can tell it -------------
   *
   * This room had no certainty authored at all, which meant every prop in it defaulted to
   * SHAPED and the scale did nothing here. Six of the eight rooms were in that state.
   *
   * The opening position is what a man says in the first ten seconds: my cellar is full of
   * water. That is the water and the room around it, and nothing else. He has not mentioned
   * a pump, or where the run goes, or what is in the boxes - and until he does, the machine
   * has no business drawing any of it as fact.
   */
  for (const [id, certainty] of [
    // The flood is why he called. It is the one thing warm from the first frame.
    ['water', CERTAINTY.KNOWN],
    // A cellar. He said so, and it is a shape before it is anything else.
    ['floor', CERTAINTY.SHAPED],
    ['wall', CERTAINTY.SHAPED],
    ['side-wall', CERTAINTY.SHAPED],
    ['ceiling', CERTAINTY.SHAPED],
    ['joists', CERTAINTY.SHAPED],
    ['light-fitting', CERTAINTY.SHAPED],
    ['bulb', CERTAINTY.SHAPED],
    // The chalk marks are evidence the machine can see for itself once it is drawing the
    // wall - somebody has been measuring this flood for years, and that reads without
    // anybody saying it.
    ['marks', CERTAINTY.SHAPED],
    ['lids', CERTAINTY.SHAPED],
    // The run is the mission. He has said there is pipework; he has not said what it is
    // made of, which is the whole diagnosis.
    ['run-metal', CERTAINTY.SHAPED],
    ['run-copper', CERTAINTY.SHAPED],
    ['run-plastic', CERTAINTY.SHAPED],
    ['run-steel', CERTAINTY.SHAPED],
    /*
     * Below SHAPED, and these are what make the room perform.
     *
     * Nobody has mentioned a pump. Nobody has said where the run goes. Nobody has said what
     * is in the boxes stacked against the far wall. Three guesses standing in a flooded
     * cellar, and two of them resolve when he is asked the right question.
     */
    ['pump', CERTAINTY.SUSPECTED],
    ['sump', CERTAINTY.SUSPECTED],
    ['outfall', CERTAINTY.SUSPECTED],
    ['drop', CERTAINTY.SUSPECTED],
    ['ruined-box', CERTAINTY.SUSPECTED],
  ] as [string, number][]) {
    scene.setCertainty(id, certainty);
  }

  // The pump works, which is the fact that rules out the obvious culprit - and the first
  // time anybody says there is a pump down here at all. It stands in frame at his elbow,
  // so this is the room's resolve.
  scene.revealOn(FACT_PUMP_IS_FINE, 'pump', CERTAINTY.DESCRIBED);
  scene.revealOn(FACT_PUMP_IS_FINE, 'sump', CERTAINTY.DESCRIBED);
  // Where the water is supposed to go. The outfall is at the far end of the run and the
  // drop is where it leaves - neither means anything until he traces it.
  scene.revealOn(FACT_CELLAR_RUN, 'outfall', CERTAINTY.DESCRIBED);
  scene.revealOn(FACT_CELLAR_RUN, 'drop', CERTAINTY.DESCRIBED);
  /*
   * Four materials laid end to end by four different people across fifty years. This is
   * the fact the puzzle turns on, and it is the only one that warms the run itself - which
   * is right, because until he says what the spans are made of, a pipe is a pipe.
   */
  for (const span of ['run-metal', 'run-copper', 'run-plastic', 'run-steel']) {
    scene.revealOn(FACT_PIECEMEAL_PLUMBING, span, CERTAINTY.KNOWN);
  }
  /*
   * The boxes never resolve, and that is the point of having them. A room where everything
   * the player asks about goes warm and nothing else exists is a checklist; a room that
   * still has guesses in it when the call ends is a place the machine only partly saw.
   */

  /**
   * Everything standing in the flood gets wet at the line.
   *
   * A finisher rather than a call here, because a material touched during a build does not
   * survive - see ContactScene.registerFinisher. It runs after the certainty pass has done
   * its cloning, so this wets the materials that are actually being drawn.
   *
   * Applied to the whole scene rather than to a list of props, and that is deliberate: a
   * list is a set of chances to forget one, and the object somebody forgets is the object
   * that stands dry in six inches of water and ruins the shot. The shader is a function of
   * height, so anything that does not reach the line is untouched at no cost.
   */
  scene.registerFinisher(() => {
    applyWaterline(scene as unknown as THREE.Object3D, WATER_LEVEL);
  });
}

/**
 * MISSION 06 - his mother's front door, at night.
 *
 * The smallest set in the game and deliberately so. Everything the request is about
 * happens inside a lock the player never sees, so the room's job is not to carry evidence
 * (§131 is served by the hints and by Dorin) - it is to carry the FEELING that a man is
 * standing at a door at two in the morning doing something he swore he would never do.
 *
 * That is one pool of porch light, a lit landing window above it that he keeps looking at,
 * and a great deal of dark. §241: the depth is layers and value, and here the outermost
 * layer is simply night.
 */
function buildNightDoor(scene: ContactScene): void {
  const rng = createRng(seedFrom('dorin-door'));

  const WALL_TOP = 5.2;
  /** Where the door is. Hoisted, because the step and everything on it is placed off it. */
  const DOOR_X = -0.15;

  // The path, and the house front. Nothing behind them but night.
  const path = new THREE.BoxGeometry(6, 0.1, 4);
  path.translate(0, -0.05, 1.4);
  scene.registerProp('path', meshOf('Path', path, MAT.ground));

  /**
   * Weeds through the path, which is the theme doing quiet work.
   *
   * The jam theme is Overgrown and this is the one set where it had no presence at all - a
   * clean path to a clean door. Grass in the joints of a front path is what happens to a
   * house nobody has been out of for a while, which is exactly the situation: his mother
   * has not answered since yesterday.
   *
   * Sparse and short. It is a path somebody still uses, not a ruin, and at this hour the
   * porch light will catch about four of them.
   */
  /*
   * On the meadow system now, rather than the older loose-tuft one.
   *
   * The upgrade that matters is CLUMPING - these grow in tufts with bare ground between,
   * which is what makes grass read as grass instead of as bristles - plus the density field
   * thinning them where the path is walked. The blades are lit MeshStandardMaterial, so they
   * take the porch light and the step bounce exactly as the old ones did.
   *
   * What deliberately does NOT come across is meadowGround. That material is unlit by
   * design, which is right under Adaeze's directional sun and completely wrong here: it
   * would draw the soil at full authored brightness with no falloff, and the pool of porch
   * light is the entire reason this shot works. The ground stays lit.
   */
  scene.registerProp(
    'path-weeds',
    meadow(rng, {
      at: new THREE.Vector3(0, 0, 1.5),
      width: 5.4,
      depth: 3.4,
      // Still sparse and still short - a path somebody uses, not a ruin.
      count: 520,
      height: [0.07, 0.17],
      bareBelow: 0.52,
      clear: [{ centre: new THREE.Vector3(0, 0, 1.5), radius: 0.9 }],
      y: 0,
    }),
    { idle: (deltaTime) => stepWind(deltaTime) }
  );

  const front = new THREE.BoxGeometry(7, WALL_TOP, 0.3);
  front.translate(0, WALL_TOP / 2, -0.4);
  scene.registerProp('front', meshOf('Front', front, MAT.wall));

  /**
   * -- The step, and what lives on it ---------------------------------------------------
   *
   * The door met the path directly, which is the detail that quietly stopped this being a
   * house. Every front door in the country this set is pretending to be stands one course
   * above its path, and the step is worth more than its geometry: it is a horizontal band
   * of lit stone directly under the one light in the scene, so it separates the door from
   * the ground instead of letting them share an edge.
   *
   * Everything on it belongs to somebody who has lived here forty years and has not been
   * out since yesterday - which is Dorin's whole problem, told without a line of dialogue.
   */
  const step = new THREE.BoxGeometry(1.7, 0.14, 0.66);
  step.translate(DOOR_X, 0.07, -0.08);
  scene.registerProp('step', meshOf('Step', step, MAT.wall));

  const stoop: THREE.BufferGeometry[] = [];
  const stoopDark: THREE.BufferGeometry[] = [];

  /**
   * Two pots flanking the door, one of them finished.
   *
   * The pair is the point. One pot is a pot; two pots either side of a door is somebody's
   * arrangement, and an arrangement that has been kept up for years and has just started
   * to go is a much better description of this house than either a tidy one or a ruin.
   */
  // Pulled in to 0.62 from 0.72: at 0.72 the right-hand pot stood 0.35m from Dorin's feet
  // and its stems came up through his boots.
  for (const [i, px] of [DOOR_X - 0.62, DOOR_X + 0.62].entries()) {
    const pot = new THREE.CylinderGeometry(0.13, 0.1, 0.22, 10);
    pot.translate(px, 0.11, 0.2);
    stoopDark.push(pot);
    const rim = new THREE.CylinderGeometry(0.145, 0.145, 0.03, 10);
    rim.translate(px, 0.215, 0.2);
    stoopDark.push(rim);

    // The near one still has something in it; the far one is stems.
    const alive = i === 0;
    for (let b = 0; b < (alive ? 7 : 4); b++) {
      const h = alive ? range(rng, 0.16, 0.28) : range(rng, 0.2, 0.34);
      const stem = new THREE.CylinderGeometry(0.006, 0.011, h, 4);
      stem.translate(0, h / 2, 0);
      stem.rotateX(jitter(rng, alive ? 0.4 : 0.75));
      stem.rotateZ(jitter(rng, alive ? 0.4 : 0.75));
      stem.translate(px + jitter(rng, 0.06), 0.23, 0.2 + jitter(rng, 0.06));
      stoop.push(stem);
    }
  }

  /**
   * Boots by the door, and the smallest true thing in the set.
   *
   * A pair left outside says a person who works outdoors and takes them off before going
   * in, which is who this house belongs to. Turned to face the wall the way boots end up
   * when they are stepped out of rather than placed.
   */
  for (const side of [-1, 1] as const) {
    const boot = new THREE.BoxGeometry(0.11, 0.3, 0.15);
    boot.translate(0, 0.15, 0);
    const foot = new THREE.BoxGeometry(0.11, 0.07, 0.26);
    foot.translate(0, 0.035, 0.05);
    for (const part of [boot, foot]) {
      part.rotateY(0.34 + side * 0.16);
      part.translate(DOOR_X + 0.95 + side * 0.14, 0, 0.16);
      stoopDark.push(part);
    }
  }

  /**
   * A bin against the house, off to the side.
   *
   * Bulk, in the one place the frame had nothing: a 5.2m wall with a single door in it and
   * a lamp above that. §241 wants depth from layers, and a knee-high box standing proud of
   * the wall is the cheapest possible mid-ground.
   */
  const bin = new THREE.BoxGeometry(0.54, 0.92, 0.5);
  bin.rotateY(-0.11);
  bin.translate(DOOR_X + 2.15, 0.46, 0.05);
  stoopDark.push(bin);
  const binLid = new THREE.BoxGeometry(0.58, 0.06, 0.54);
  binLid.rotateY(-0.11);
  binLid.translate(DOOR_X + 2.15, 0.95, 0.05);
  // Into stoopDark, not stoop. `stoop` is MAT.stem - the material the plant stems use -
  // so the lid rendered as a slab of bright green on top of a dark bin, which was the one
  // thing in the frame that looked like a mistake because it was one.
  stoopDark.push(binLid);

  /**
   * Stone edging down both sides of the path.
   *
   * The same kit the field and the headland got. It gives the path an EDGE - it was a grey
   * rectangle ending in nothing - and at this hour the porch light picks out the near half
   * of it, which pulls the eye up the path to the door.
   */
  for (const [side, ex] of [['left', -2.35], ['right', 2.35]] as const) {
    scene.registerProp(
      `edging-${side}`,
      meshOf(
        `Edging-${side}`,
        rocks(
          rng,
          { centre: new THREE.Vector3(ex, 0.01, 1.5), width: 0.5, depth: 3.4 },
          { count: 11, size: [0.05, 0.15] }
        ),
        MAT.millStone
      )
    );
  }

  scene.registerProp(
    'stoop',
    meshOf('Stoop', mergeGeometries(stoop, false) ?? stoop[0], MAT.stem)
  );
  scene.registerProp(
    'stoop-dark',
    meshOf('StoopDark', mergeGeometries(stoopDark, false) ?? stoopDark[0], MAT.timberDark)
  );

  /**
   * Night, as one unlit plane a long way back.
   *
   * Not fog and not a skybox - a flat sheet at the far edge of the set, several shades
   * above black so the roofline has something to be a silhouette against. A pure black
   * background makes a night scene read as an unfinished one.
   */
  const night = new THREE.PlaneGeometry(60, 30);
  night.translate(0, 8, -22);
  scene.registerProp('night', meshOf('Night', night, MAT.nightAir));

  // A neighbouring roofline, so the house is on a street rather than in a void.
  const roofs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const w = range(rng, 2.2, 4.4);
    const h = range(rng, 3.4, 5.6);
    const roof = new THREE.PlaneGeometry(w, h);
    roof.translate(-14 + i * 4.2 + jitter(rng, 0.8), h / 2, -14);
    roofs.push(roof);
  }
  scene.registerProp(
    'street',
    meshOf('Street', mergeGeometries(roofs, false) ?? roofs[0], MAT.viewTown)
  );

  // -- The door -------------------------------------------------------------
  const DOOR = { w: 0.92, h: 2.02, x: DOOR_X };

  const leaf = new THREE.BoxGeometry(DOOR.w, DOOR.h, 0.06);
  leaf.translate(DOOR.x, DOOR.h / 2, -0.26);
  const doorMesh = meshOf('Door', leaf, MAT.timberDark);

  const doorRoot = ENGINE.SceneNode.create({
    name: 'DoorRoot',
    // Hinged on the left edge, so opening it swings rather than slides.
    position: new THREE.Vector3(DOOR.x - DOOR.w / 2, 0, -0.26),
  });
  leaf.translate(-(DOOR.x - DOOR.w / 2), 0, 0.26);
  doorRoot.add(doorMesh);
  /** The turning part of the lock, built below and driven by the door's own cue. */
  let lockPlug: ENGINE.SceneNode | null = null;

  scene.registerProp('door', doorRoot, {
    anchors: { default: new THREE.Vector3(DOOR.w / 2, 1.0, 0) },
    actions: {
      /**
       * The lock gives, and then it opens.
       *
       * The whole mission is that the pins in this lock bind by WEAR rather than by
       * position - fifty years of the same key - and the answer is a way of turning it that
       * works with that. It used to resolve as a door swinging open, which is the result
       * with the reason removed.
       *
       * A person standing at a door cannot see pins. What they can see is the cylinder
       * moving in stages: a little turn, a stop where it catches, another, another stop,
       * and then the whole thing going round at once when the last one drops. That IS the
       * mission, visible from outside, and it needs no cutaway to explain itself.
       *
       * Two full seconds before the door begins to move, because the lock giving is the
       * beat the player earned and the door opening is only its consequence.
       */
      open: (tweener, node) => {
        // Turn, catch, turn, catch, give. Each pair is a pin binding and then dropping.
        const STAIRS: Array<[at: number, to: number]> = [
          [0, 0],
          [0.22, 0.2],
          [0.36, 0.2],
          [0.56, 0.46],
          [0.68, 0.46],
          [1, Math.PI / 2],
        ];
        tweener.add(
          (t) => {
            if (!lockPlug) return;
            let angle = 0;
            for (let i = 1; i < STAIRS.length; i++) {
              const [at, to] = STAIRS[i];
              const [prevAt, prevTo] = STAIRS[i - 1];
              if (t > at) continue;
              const span = (t - prevAt) / (at - prevAt);
              angle = prevTo + (to - prevTo) * span;
              break;
            }
            if (t >= 1) angle = Math.PI / 2;
            lockPlug.rotation.set(0, 0, -angle);
          },
          { duration: 1.9, easing: Ease.linear, channel: 'lock-turn' }
        );

        /** It opens. Slowly - he is not barging in, he is going in to find her. */
        tweener.add((t) => node.rotation.set(0, -t * 1.5, 0), {
          duration: 2.2,
          delay: 2.0,
          easing: Ease.outCubic,
          channel: 'door-open',
        });
      },
    },
  });

  // The glass panel he is being tempted to put in.
  const pane = new THREE.PlaneGeometry(DOOR.w * 0.62, DOOR.h * 0.3);
  pane.translate(DOOR.x, DOOR.h * 0.68, -0.22);
  scene.registerProp('pane', meshOf('Pane', pane, MAT.doorGlass));

  const frame: THREE.BufferGeometry[] = [];
  for (const [w, h, x, y] of [
    [DOOR.w + 0.16, 0.08, DOOR.x, DOOR.h + 0.04],
    [0.08, DOOR.h + 0.08, DOOR.x - DOOR.w / 2 - 0.04, DOOR.h / 2],
    [0.08, DOOR.h + 0.08, DOOR.x + DOOR.w / 2 + 0.04, DOOR.h / 2],
  ] as const) {
    const piece = new THREE.BoxGeometry(w, h, 0.14);
    piece.translate(x, y, -0.3);
    frame.push(piece);
  }
  scene.registerProp(
    'door-frame',
    meshOf('DoorFrame', mergeGeometries(frame, false) ?? frame[0], MAT.timber)
  );

  /**
   * The lock. Two centimetres of brass, and the entire mission.
   *
   * Registered as its own prop so `prop.highlight:lock` has something to point at - the
   * hint about the keyway is the only place the player is told that pins bind by wear
   * rather than by position, and it needs the environment to point at.
   */
  const lockRoot = ENGINE.SceneNode.create({
    name: 'Lock',
    position: new THREE.Vector3(DOOR.x + DOOR.w / 2 - 0.11, 1.02, -0.22),
  });
  const escutcheon = new THREE.CylinderGeometry(0.035, 0.035, 0.012, 12);
  escutcheon.rotateX(Math.PI / 2);
  lockRoot.add(meshOf('Escutcheon', escutcheon, MAT.brass));

  /**
   * The plug, separated from the plate it sits in.
   *
   * These were one node, which was fine while the lock never moved and wrong the moment it
   * had to: turning the whole thing would rotate the escutcheon as well, and a brass plate
   * that spins with the key is the sort of detail that makes a door stop being a door.
   * Only the cylinder turns.
   */
  const plug = ENGINE.SceneNode.create({ name: 'Plug', position: new THREE.Vector3() });
  const face = new THREE.CylinderGeometry(0.022, 0.022, 0.014, 12);
  face.rotateX(Math.PI / 2);
  face.translate(0, 0, 0.004);
  plug.add(meshOf('PlugFace', face, MAT.brass));
  const keyway = new THREE.BoxGeometry(0.008, 0.026, 0.014);
  keyway.translate(0, 0, 0.008);
  plug.add(meshOf('Keyway', keyway, MAT.dark));
  lockRoot.add(plug);
  lockPlug = plug;
  scene.registerProp('lock', lockRoot, {
    // Inked: Two centimetres of brass, and the entire mission.
    inked: true, anchors: { default: new THREE.Vector3(0, 0, 0.06) } });

  // -- The landing window he keeps looking at -------------------------------
  const upperFrame = new THREE.BoxGeometry(0.94, 1.16, 0.08);
  upperFrame.translate(0.42, 3.5, -0.28);
  scene.registerProp('upper-frame', meshOf('UpperFrame', upperFrame, MAT.timber));

  const upperGlass = new THREE.PlaneGeometry(0.8, 1.02);
  upperGlass.translate(0.42, 3.5, -0.24);
  scene.registerProp('landing', meshOf('Landing', upperGlass, MAT.landingLight));

  // -- Dorin ----------------------------------------------------------------
  addContact(scene, 'Dorin', {
    seed: 'dorin-apostol',
    height: 1.8,
    build: 0.5,
    shoulders: 0.6,
    lean: 0.22,
      // Nothing on his head and two days of beard. He came straight out.
      headgear: 'none',
      sleeve: 'long',
      beard: true,
      pouch: false,
    // Slow but uneven. Two in the morning, cold, and he has not slept.
    temperament: 'tired',
    garment: 'coat',
    colors: { garment: '#2f3138', underlayer: '#8f8778' },
    position: new THREE.Vector3(0.62, 0, 0.62),
    rotation: new THREE.Euler(0, -Math.PI * 0.72, 0),
    /**
     * No hand targets, and a raised rest instead.
     *
     * Both hands were authored onto the lock and both were out of reach - 0.877 and 1.007
     * against a 0.626 arm. That is not a tuning miss: solved across a grid of positions
     * and facings, there is NO placement that reaches that lock and still keeps him off
     * the camera's own sightline, because the lock is 2cm of brass on a door he has to
     * stand beside rather than in front of.
     *
     * So he gets a working rest: forearms up and forward, which at this distance and with
     * the lock mostly behind his own body reads exactly as a man doing something to a door
     * at two in the morning. The lock does not need his fingers on it; the hint highlights
     * it and Dorin says what he is doing.
     */
    reach: 0.9,
    // Two in the morning, cold, and his mother has not answered since yesterday.
    liveliness: 1.25,
  });

  // -- Light -----------------------------------------------------------------
  /**
   * One porch bulb over the door and nothing else.
   *
   * The tightest light in the game on purpose: distance 5 with a hard decay, so the pool
   * dies a couple of metres out and the path, the street and everything past it fall away.
   * §230 took a warm pool in a cold frame from all three reference images and this is the
   * most literal use of it - a man in a small circle of yellow with a town of blue behind.
   */
  const porchAt = new THREE.Vector3(DOOR.x, 2.42, -0.18);
  const bulb = new THREE.SphereGeometry(0.055, 8, 6);
  bulb.translate(porchAt.x, porchAt.y, porchAt.z + 0.05);
  scene.registerProp('porch-bulb', meshOf('PorchBulb', bulb, MAT.lamp));

  const hood = new THREE.CylinderGeometry(0.1, 0.13, 0.07, 10);
  hood.translate(porchAt.x, porchAt.y + 0.07, porchAt.z + 0.05);
  scene.registerProp('porch-hood', meshOf('PorchHood', hood, MAT.metal));

  scene.registerProp(
    'porch',
    ENGINE.PointLightNode.create({
      name: 'Porch',
      position: porchAt.clone().add(new THREE.Vector3(0, 0, 0.25)),
      intensity: 9,
      color: new THREE.Color('#ffd49a'),
      distance: 5,
      decay: 1.7,
    })
  );

  /**
   * The sky, which this scene did not have.
   *
   * Every other diorama has a hemisphere and this one had two point lights and nothing
   * else, so any surface facing away from both rendered at exactly zero - not dark, ABSENT.
   * Dorin measured luma 0 across his coat, his arm and his legs while the wall behind him
   * sat at 10, which is not a man in shadow, it is a hole in the frame shaped like a man.
   *
   * It hid because the old camera happened to sit on the porch light's side of him. Moving
   * round to where the door reads square-on put the unlit half towards the lens and turned
   * a missing light into an obvious one. That is the argument for changing framing and
   * lighting in the same pass: each was covering for the other.
   *
   * Kept very low and cold. A street at two in the morning has a sky over it, and that is
   * all this is - enough that a shadow is a value rather than a void.
   */
  scene.registerProp(
    'sky',
    ENGINE.HemisphereLightNode.create({
      name: 'NightSky',
      position: new THREE.Vector3(0, 8, 2),
      intensity: 1.05,
      color: new THREE.Color('#4c5c72'),
      groundColor: new THREE.Color('#1b1712'),
    })
  );

  /**
   * The doorstep bounce, and the only reason Dorin has a face.
   *
   * The sky above got the walls off zero and did nothing for him, which is the useful
   * result: a hemisphere reaches a vertical surface with half sky and half ground, and half
   * of a night sky against a coat at #2f3138 is still almost nothing. He measured 0 before
   * and 0 after.
   *
   * The porch light is real and it is in the wrong place for this camera - it sits above
   * and behind him, so it rims his shoulders and leaves every surface the lens can see in
   * shadow. Rather than move a practical that is correctly positioned for the DOOR, this is
   * the light coming back up off the step and the path in front of it, which is where the
   * porch light is actually landing. Short reach, warm, and low enough to lift a face
   * looking down at a lock.
   */
  scene.registerProp(
    'step-bounce',
    ENGINE.PointLightNode.create({
      name: 'StepBounce',
      // Dropped to 1.15 and widened to 2.1 on the second pass: at chest height with a
      // 1.75 reach his coat and face read and his legs sat at 9 against a path at 12, so
      // he faded into the ground he was standing on. A bounce off a step comes from low
      // down anyway - it was at the wrong height as well as the wrong radius.
      position: new THREE.Vector3(0.12, 1.15, 1.18),
      intensity: 3.4,
      color: new THREE.Color('#ffc98d'),
      distance: 2.1,
      decay: 1.3,
    })
  );

  // A cold spill from the landing window above - the only other light on the street, and
  // the reason he keeps looking up.
  scene.registerProp(
    'landing-spill',
    ENGINE.PointLightNode.create({
      name: 'LandingSpill',
      position: new THREE.Vector3(0.42, 3.5, 0.3),
      intensity: 1.15,
      color: new THREE.Color('#cfe0f0'),
      distance: 4.5,
      decay: 1.5,
    })
  );

  scene.registerShot('default', {
    /**
     * Swung round so he is beside the door rather than in front of it.
     *
     * At (2.05, 1.5, 2.35) he stood 2cm off the camera's own sightline, two thirds of the
     * way to the target - a 1.8m man exactly filling the lens with the door, the lock and
     * the lit window all behind him. See CONTACT FRAMING at the top of this file: this is
     * the third scene to make that mistake and the first to have a number attached to it.
     * From here his perpendicular offset is 0.46m and he reads in profile against the
     * porch light, which is the composition the scene wanted anyway.
     *
     * ## Then moved to the other side of the path, and further round
     *
     * The offset rule was satisfied and the shot was still wrong, which is worth writing
     * down: 0.46m of lateral clearance does not help when the man is 2.7m from the lens and
     * his subject is 3.6m behind him. He read as a dark mass filling the left half of the
     * frame. Measured rather than judged - the lock, which is the whole mission, moved by
     * 2,700 of difference across a 90 degree turn of its own cylinder, against 79,000 when
     * the door swung. It was not small, it was invisible.
     *
     * The old camera also sat 3.15m to the SIDE of a door 2.2m in front of it - 55 degrees
     * off the door's face, so the one object the request is about was seen edge-on. From
     * here it is 26 degrees, the door reads as a door, and he is 3.26m out against a target
     * at 3.68m so he stands in the scene rather than in front of it. His perpendicular
     * offset is 0.89m, at the top of the band instead of the bottom.
     *
     * Crossing to -x also puts him between the camera and the porch light rather than
     * beside it, so he keeps the profile the original note was right to want.
     */
    position: new THREE.Vector3(-1.55, 1.7, 3.05),
    target: new THREE.Vector3(0.05, 1.3, -0.26),
  });
  scene.registerShot('lock', {
    position: new THREE.Vector3(0.85, 1.2, 0.75),
    target: new THREE.Vector3(0.1, 1.02, -0.24),
    duration: 2.0,
  });

  /**
   * -- What the machine knows about Dorin's doorstep ------------------------------------
   *
   * A lock that will not turn, in the dark, and the man who fitted it standing in front of
   * it. The lock is DESCRIBED rather than KNOWN at the open, which is the one departure
   * from the pattern in this file and is deliberate: he has told the machine there is a
   * lock and that it is stuck, and neither of those is knowing what a lock IS. It goes to
   * KNOWN when the mechanism is understood, which is the only moment in this mission
   * anything is actually solved.
   */
  for (const [id, certainty] of [
    ['lock', CERTAINTY.DESCRIBED],
    ['door', CERTAINTY.SHAPED],
    ['door-frame', CERTAINTY.SHAPED],
    ['upper-frame', CERTAINTY.SHAPED],
    ['pane', CERTAINTY.SHAPED],
    ['porch', CERTAINTY.SHAPED],
    ['porch-hood', CERTAINTY.SHAPED],
    ['porch-bulb', CERTAINTY.SHAPED],
    ['step', CERTAINTY.SHAPED],
    ['front', CERTAINTY.SHAPED],
    ['path', CERTAINTY.SHAPED],
    ['path-weeds', CERTAINTY.SHAPED],
    /*
     * The stoop stays SHAPED, and this is the clearest lesson of the pass that added it.
     *
     * The idea was good: nobody has described what is on his step, so the machine should
     * not be drawing pots and boots as fact. The execution was impossible, because tier 1
     * renders a prop's BOUNDING VOLUME and `stoop` is a merged set of small things spread
     * along the whole width of the step. Its bounds are one box a metre and a half across,
     * so the guess came out as a glass case standing in front of the door and passing
     * through Dorin - the best-composed shot in the game, ruined by a rule applied without
     * looking at what it would draw.
     *
     * §1 already says tier 1 goes on the contents rather than the furniture. The sharper
     * version, learned here: a prop qualifies for tier 1 only if its bounding volume is a
     * fair likeness of it. Merged props and long thin ones are disqualified whatever the
     * fiction says about them.
     */
    ['stoop', CERTAINTY.SHAPED],
    ['stoop-dark', CERTAINTY.SHAPED],
    /*
     * The landing keeps its guess. It is behind a shut door, so its volume is never in
     * frame - which sounds like a reason to drop it and is the reason to keep it: the door
     * opens later in this mission, and what is behind it should not already be drawn.
     */
    ['landing', CERTAINTY.SUSPECTED],
  ] as [string, number][]) {
    scene.setCertainty(id, certainty);
  }

  // He fitted this door himself and remembers the work, which is what makes the pots and
  // the boots on the step his rather than anybody's. A warming rather than a resolve, for
  // the bounding-volume reason above.
  scene.revealOn(FACT_DORIN_HANDS, 'stoop', CERTAINTY.DESCRIBED);
  scene.revealOn(FACT_DORIN_HANDS, 'stoop-dark', CERTAINTY.DESCRIBED);
  // The lock is older than the door it is in - so the door becomes evidence rather than
  // the thing the lock happens to be mounted on.
  scene.revealOn(FACT_OLD_LOCK_WORN, 'door', CERTAINTY.DESCRIBED);
  scene.revealOn(FACT_OLD_LOCK_WORN, 'door-frame', CERTAINTY.DESCRIBED);
  // And the mechanism. Pins bind one at a time because no two are cut alike, which is the
  // fact the whole request turns on and the only one that takes the lock to KNOWN.
  scene.revealOn(FACT_PINS_BIND_BY_TOLERANCE, 'lock', CERTAINTY.KNOWN);
}

/**
 * MISSION 07 - the mill road, and the only set with no lights in it.
 *
 * Every other diorama in the game is built around a source: a bench lamp, a porch bulb, a
 * bulkhead over a flooded floor. This one is built around the ABSENCE of one, because that
 * is the request. The lamps have been out since spring, the mill has no windows on this
 * side, and the four hundred metres of road she is standing on is lit by exactly one thing,
 * which is in her hand and is the mission.
 *
 * §131 wants the environment to carry evidence rather than decoration, and here that is
 * literal: the four dead lamp columns are the reason the request exists. A player who looks
 * at this set and asks why it is so dark has already found the answer standing in it.
 *
 * §241, layers and value: night plane at the back, mill wall and hedge as the two walls of
 * a corridor, the road as the floor, and one warm cone cutting down it. The follower is a
 * silhouette on the hedge side where the corridor is darkest, which is where he put
 * himself.
 */
function buildMillRoad(scene: ContactScene): void {
  const rng = createRng(seedFrom('sanda-mill-road'));

  /** The road runs down -Z, away from the camera. Everything here is in metres. */
  const HALF = 2.6;
  const NEAR = 7;
  const FAR = -32;
  const LENGTH = NEAR - FAR;
  const MID = (NEAR + FAR) / 2;
  /** Inner faces of the corridor. */
  const MILL_X = -3.1;
  const HEDGE_X = 3.25;
  /** The gap he leaves through. Named because three things have to agree about it. */
  const CUT = { z: -12.4, width: 2.6 };

  // -- Night, the outermost layer -------------------------------------------
  // Same trick as Dorin's door: one unlit plane several shades above black, so the mill
  // roofline and the hedge have something to be a silhouette against. A night set on pure
  // black reads as an unfinished one.
  /**
   * Air the colour of the night, reaching further.
   *
   * The shared haze is a daylight grey at full strength by 26 metres, which on a corridor
   * this long put a pale wall across the far half of every shot - measured at luma 48
   * against a mill wall at 7, and it was not the wall, it was the fog on top of it. See
   * ContactScene.air. Slightly darker than the night plane behind it, so the distance
   * still recedes and does so into the dark rather than into a screen of grey.
   */
  scene.air = { color: '#0d131c', near: 6, far: 42 };

  const night = new THREE.PlaneGeometry(90, 44);
  night.translate(0, 12, FAR - 6);
  scene.registerProp('night', meshOf('Night', night, MAT.nightAir));

  // A hillside behind the mill, one value up. It is what she is being told to walk toward.
  const hill: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const w = range(rng, 14, 26);
    const h = range(rng, 4, 9);
    const slab = new THREE.PlaneGeometry(w, h);
    slab.translate(-24 + i * 12 + jitter(rng, 3), h / 2, FAR - 2);
    hill.push(slab);
  }
  // `nightAir` rather than `viewTown`: viewTown is a DAYLIGHT value, and on a road lit by
  // one torch it made the far hillside the brightest thing in frame - the eye went to the
  // horizon instead of to the woman with the light. A hill at midnight is a silhouette
  // one step above the sky, and one step is all it gets.
  scene.registerProp('hill', meshOf('Hill', mergeGeometries(hill, false) ?? hill[0], MAT.hillNight));

  // -- The road --------------------------------------------------------------
  const road = new THREE.BoxGeometry(HALF * 2, 0.12, LENGTH);
  road.translate(0, -0.06, MID);
  scene.registerProp('road', meshOf('Road', road, MAT.tarmac));

  /**
   * Patches, and the verges.
   *
   * The flat pass took the noise off every surface in the game, and a thirty-metre plane
   * is where that bill comes due hardest - unbroken tarmac reads as a missing texture. The
   * fix is the same one the floorboards got: break the plane with the thing that actually
   * divides a real road, which is the repairs. These are slabs laid a couple of millimetres
   * proud rather than recesses, because the project casts no shadows and a recess is
   * invisible.
   */
  const patches: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const w = range(rng, 0.7, 2.3);
    const l = range(rng, 1.1, 3.4);
    const patch = new THREE.BoxGeometry(w, 0.006, l);
    patch.translate(range(rng, -HALF + w / 2, HALF - w / 2), 0.003, range(rng, FAR + 2, NEAR - 2));
    patches.push(patch);
  }
  scene.registerProp(
    'patches',
    meshOf('Patches', mergeGeometries(patches, false) ?? patches[0], MAT.dark)
  );

  const verges: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const verge = new THREE.BoxGeometry(0.9, 0.16, LENGTH);
    verge.translate(side * (HALF + 0.45), -0.08, MID);
    verges.push(verge);
  }
  scene.registerProp(
    'verge',
    meshOf('Verge', mergeGeometries(verges, false) ?? verges[0], MAT.ground)
  );

  /**
   * Stones along both verges, and the reason they earn their place at night.
   *
   * Every other outdoor set got rocks and this one did not, on the reasoning that a road
   * at midnight is too dark to show them. That was backwards. This is the one scene with a
   * MOVING light in it, and the thing a swinging beam most needs is something with relief
   * for it to cross - a flat verge under a torch is a flat verge whichever way it points.
   * Now the pool rakes over stone as it travels, which is what makes the sweep legible as
   * movement rather than as a patch of tarmac changing brightness.
   *
   * Small and sparse. A country road has grit and the odd fallen stone at the edge; a line
   * of boulders would read as a rockery somebody built along a lane.
   */
  for (const [side, x] of [['mill', MILL_X + 0.8], ['hedge', HEDGE_X - 0.75]] as const) {
    scene.registerProp(
      `stones-${side}`,
      meshOf(
        `Stones-${side}`,
        rocks(
          rng,
          { centre: new THREE.Vector3(x, 0.01, -7), width: 0.95, depth: 26 },
          { count: 16, size: [0.05, 0.19] }
        ),
        MAT.millStone
      )
    );
  }

  /**
   * Grass on the verges, both sides, all the way down.
   *
   * The verges were two bare strips of soil running thirty metres into the dark, and a
   * strip of nothing beside a strip of nothing is not a roadside. Nobody has cut these
   * since the same spring the lamps went out - which is already what the hedge says, so
   * the verge saying it too is the set agreeing with itself.
   *
   * It also does something for the chase specifically: the torch pool now falls across
   * texture rather than across a flat band, so the light has something to READ on.
   */
  /*
   * On the meadow system, for the clumping.
   *
   * Which earns more here than anywhere else in the game. The torch pool sweeps ACROSS this
   * verge, and a moving light reveals shape by the shadows it throws between things - so an
   * evenly scattered verge gives it nothing to find, while tufts with gaps between them give
   * the beam something that changes as it passes. The reason for texture under the torch was
   * already in the comment above; clumping is what actually delivers it.
   *
   * Lit blades, as everywhere. The ground stays as it is: unlit soil would kill the torch.
   */
  for (const side of [-1, 1] as const) {
    scene.registerProp(
      `verge-grass-${side < 0 ? 'left' : 'right'}`,
      meadow(rng, {
        at: new THREE.Vector3(side * (HALF + 0.45), 0, MID),
        width: 1.0,
        depth: LENGTH * 0.92,
        count: 900,
        // Uncut since the lamps went out, so taller than the trodden path at Dorin's door.
        height: [0.12, 0.3],
        bareBelow: 0.4,
        y: 0,
      }),
      // The gust is a shared clock, so exactly one of the two verges advances it. Both
      // registering an idle would step it twice a frame and blow at double speed.
      side < 0 ? { idle: (deltaTime) => stepWind(deltaTime) } : undefined
    );
  }

  // -- The mill wall ---------------------------------------------------------
  /**
   * Four hundred metres of nothing, in two runs with a gap.
   *
   * The gap is the cut she says he walks into, so it has to be real geometry before the
   * success beat can refer to it - otherwise "he has gone into the cut by the mill" is a
   * line of dialogue about a place that does not exist, which is the failure §131 is
   * about.
   */
  const WALL_H = 6.4;
  const wall: THREE.BufferGeometry[] = [];
  for (const [from, to] of [
    [NEAR, CUT.z + CUT.width / 2],
    [CUT.z - CUT.width / 2, FAR],
  ] as const) {
    const run = new THREE.BoxGeometry(0.7, WALL_H, from - to);
    run.translate(MILL_X - 0.35, WALL_H / 2, (from + to) / 2);
    wall.push(run);
  }

  // Pilasters. A blank six-metre wall is a value with no shape in it; these give the light
  // something to fall off, which is all a wall this dark needs.
  for (let z = NEAR - 2; z > FAR; z -= 3.6) {
    if (Math.abs(z - CUT.z) < CUT.width) continue;
    const pier = new THREE.BoxGeometry(0.22, WALL_H * 0.88, 0.5);
    pier.translate(MILL_X + 0.11, (WALL_H * 0.88) / 2, z + jitter(rng, 0.3));
    wall.push(pier);
  }
  scene.registerProp('mill', meshOf('Mill', mergeGeometries(wall, false) ?? wall[0], MAT.millStone));

  // Bricked-up windows, high and long since filled. Set slightly proud so they read.
  const blind: THREE.BufferGeometry[] = [];
  for (let z = NEAR - 4; z > FAR + 3; z -= 5.4) {
    if (Math.abs(z - CUT.z) < CUT.width) continue;
    const pane = new THREE.BoxGeometry(0.06, 1.5, 0.9);
    pane.translate(MILL_X + 0.03, 3.9, z);
    blind.push(pane);
  }
  scene.registerProp(
    'windows',
    meshOf('Windows', mergeGeometries(blind, false) ?? blind[0], MAT.timberDark)
  );

  /**
   * The cut itself - a dark slot, registered so the success beat has somewhere to send him.
   *
   * A plane rather than a volume: what has to read is that the wall stops and something
   * blacker than the wall is behind it, and one unlit quad does that for the cost of one
   * quad.
   */
  const cutFace = new THREE.PlaneGeometry(CUT.width, WALL_H * 0.7);
  cutFace.translate(0, (WALL_H * 0.7) / 2, 0);
  cutFace.rotateY(Math.PI / 2);
  cutFace.translate(MILL_X - 0.9, 0, CUT.z);
  scene.registerProp('cut', meshOf('Cut', cutFace, MAT.nightAir));

  // -- The hedge -------------------------------------------------------------
  /**
   * The dark side, and where he chose to walk.
   *
   * Overlapping boxes at wandering heights rather than a single run, because a hedge is a
   * lumpy thing and one long box is a fence. `leafDeep` rather than `leaf`: at night the
   * hedge is a value, not a colour, and the paler green fought the road for attention.
   */
  const hedge: THREE.BufferGeometry[] = [];
  for (let z = NEAR; z > FAR; z -= 1.3) {
    const h = range(rng, 1.55, 2.15);
    const d = range(rng, 0.85, 1.35);
    const block = new THREE.BoxGeometry(d, h, 1.5);
    block.translate(HEDGE_X + d / 2 + jitter(rng, 0.12), h / 2, z);
    hedge.push(block);
  }
  scene.registerProp(
    'hedge',
    meshOf('Hedge', mergeGeometries(hedge, false) ?? hedge[0], MAT.leafDeep)
  );

  // Whips breaking out of the top - nobody has cut this since spring either, which is the
  // same spring the lamps went out. §230's overgrowth, doing one job in the background.
  const whips: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 40; i++) {
    const h = range(rng, 0.3, 0.85);
    const whip = new THREE.BoxGeometry(0.03, h, 0.03);
    whip.rotateZ(jitter(rng, 0.45));
    whip.translate(HEDGE_X + range(rng, 0.2, 1.3), range(rng, 1.6, 2.1) + h / 2, range(rng, FAR, NEAR));
    whips.push(whip);
  }
  scene.registerProp('whips', meshOf('Whips', mergeGeometries(whips, false) ?? whips[0], MAT.stem));

  // -- The dead lamps --------------------------------------------------------
  /**
   * The reason for the whole request, standing in a row.
   *
   * Four columns with unlit heads. This is the one piece of set dressing in the scene that
   * is not dressing at all: the hint about the lamps, the fact that her torch is the only
   * light, and the entire premise of a chase decided by where a beam is pointing all rest
   * on these being out, and a player can see that they are out from the default shot.
   */
  const columns: THREE.BufferGeometry[] = [];
  const heads: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const z = -1.5 - i * 7.4;
    const column = new THREE.CylinderGeometry(0.07, 0.1, 4.3, 8);
    column.translate(MILL_X + 0.55, 2.15, z);
    columns.push(column);

    // The bracket, reaching out over the road it is not lighting.
    const arm = new THREE.BoxGeometry(0.9, 0.07, 0.07);
    arm.translate(MILL_X + 0.55 + 0.45, 4.28, z);
    columns.push(arm);

    const lantern = new THREE.BoxGeometry(0.3, 0.22, 0.26);
    lantern.translate(MILL_X + 0.55 + 0.86, 4.16, z);
    heads.push(lantern);
  }
  scene.registerProp(
    'lamps',
    meshOf('Lamps', mergeGeometries(columns, false) ?? columns[0], MAT.metal)
  );
  scene.registerProp(
    'lamp-heads',
    meshOf('LampHeads', mergeGeometries(heads, false) ?? heads[0], MAT.dark)
  );

  // -- Sanda -----------------------------------------------------------------
  /**
   * On the phone with her left hand and holding her father's torch in her right.
   *
   * Turned back over her shoulder rather than facing the way she is walking, which is the
   * pose of somebody who has stopped pretending she has not noticed. Her offset from the
   * camera's own sightline is 0.79m - see CONTACT FRAMING at the top of this file - so she
   * sits beside the road rather than on top of it.
   */
  const TORCH_AT = new THREE.Vector3(1.33, 1.12, -0.16);
  addContact(scene, 'Sanda', {
    seed: 'sanda-petrescu',
    height: 1.66,
    build: 0.4,
    shoulders: 0.38,
    lean: 0.06,
    reach: 0.4,
      // Hood up, walking home at midnight in the cold.
      headgear: 'hood',
      sleeve: 'long',
      pouch: false,
    // Fast and shallow, with a catch in it. Somebody is twenty metres behind her.
    temperament: 'frightened',
    garment: 'coat',
    colors: { garment: '#40404c', underlayer: '#a8907a' },
    position: new THREE.Vector3(1.0, 0, 0.2),
    rotation: new THREE.Euler(0, Math.PI * 0.14, 0),
    handsOn: {
      // At her ear. She is on the phone; the player is the call.
      left: new THREE.Vector3(0.83, 1.45, 0.16),
      right: TORCH_AT,
    },
    // Frightened, and holding something heavy at arm's length. §236's budget, near its top.
    liveliness: 1.4,
  });

  // -- The torch -------------------------------------------------------------
  /**
   * Her father's, from the yard - heavy, and the mission.
   *
   * Its own node so `prop.highlight:torch` has something to pulse, and so the beam, the
   * body and the practical light move together if it is ever re-posed. It points down the
   * road, which is where she has it when the call starts and where the chase begins from.
   */
  /**
   * The body of the torch, turned to match its own beam.
   *
   * A prop pointing one way while its light goes another is the kind of mistake nobody can
   * name and everybody can see. The yaw here is the same swing the spot above got.
   */
  /**
   * Tilted to where the pool actually lands.
   *
   * The barrel used to sit at -0.1 while the beam was separately aimed at a point 3.9m down
   * the road, which is a slope of -0.28 - so the body was held nearly level above a pool of
   * light thrown from something pointing over it. Nobody could have named that and everybody
   * would have felt it. Now the barrel IS the slope, and the light is hung off it.
   */
  const TORCH_REST = -0.3;
  const torchRoot = ENGINE.SceneNode.create({
    name: 'Torch',
    position: TORCH_AT.clone(),
    rotation: new THREE.Euler(-0.28, TORCH_REST, 0),
  });

  const barrel = new THREE.CylinderGeometry(0.031, 0.028, 0.21, 10);
  barrel.rotateX(Math.PI / 2);
  barrel.translate(0, 0, 0.02);
  torchRoot.add(meshOf('TorchBody', barrel, MAT.metal));

  const bell = new THREE.CylinderGeometry(0.052, 0.032, 0.08, 12);
  bell.rotateX(-Math.PI / 2);
  bell.translate(0, 0, -0.12);
  torchRoot.add(meshOf('TorchBell', bell, MAT.dark));

  const lens = new THREE.CircleGeometry(0.048, 12);
  lens.rotateY(Math.PI);
  lens.translate(0, 0, -0.161);
  torchRoot.add(meshOf('TorchLens', lens, MAT.lamp));

  /**
   * No cone.
   *
   * There was one - an additive open cylinder, the usual way to make a torch beam visible
   * in air. It cannot work here. The default shot looks DOWN the road, which means it also
   * looks down the beam's own axis, and a double-sided additive cone seen end-on is not a
   * beam at all: it is a filled pale disc hanging in the air behind her, both walls of the
   * cone summing into the same pixels. It read as a hole in the set.
   *
   * A beam in air is a side-on effect. This shot is not side-on and never will be, because
   * the composition the scene needs is the corridor receding. So the torch is shown the
   * way a torch is actually shown in a film lit like this one - by what it puts on the
   * ground - and the light below does that job alone.
   */

  /**
   * The torch swings when the player calls the light.
   *
   * Until now the chase happened entirely on a panel - a wedge and a pale rectangle moving
   * on a track - while the diorama behind it showed a woman holding a light that did not
   * move for twelve seconds. The two halves of the same beat were not connected, which is
   * exactly what §209 exists to prevent: the environment performs the instruction.
   *
   * The body and its spot really are one node now - the light is a child of this root - so
   * turning it turns both, and they cannot drift apart the way they did before.
   *
   * Swung, never snapped, at 1.4 radians a second - the same rate the chase spec gives her
   * hand. The lag IS the mechanic: what the player has to learn is that the light arrives
   * late, and a torch that jumped to each call would teach exactly the wrong lesson.
   */
  let torchAim = TORCH_REST;
  scene.onAim((to) => {
    /**
     * Negated, and it matters.
     *
     * The camera looks back down the road, so world +X is screen right, and a yaw INCREASE
     * swings the barrel towards -X. Without the sign the player dragged the marker right
     * and watched the beam go left - measured, not guessed: the aim at +0.9 put the pool's
     * centre of mass at x=953 and the aim at -0.9 put it at x=1356.
     *
     * 0.45 rather than the 0.62 this started at. At 0.62 the far end threw the pool off the
     * tarmac and onto the verge, which dropped the lit area by 60% - and a torch that dims
     * as you aim it teaches the player something that is not true.
     */
    torchAim = TORCH_REST - Math.max(-1, Math.min(1, to)) * 0.45;
  });

  /**
   * The guess, aimed by the same node that aims the light.
   *
   * ART_DIRECTION §5 asks for everything outside the beam to be tier 1 by diegetic right,
   * and art/torchlight.ts is that: outside the cone the set drains to the tier-1 fill and
   * picks up a metre grid in cyan. Which means aiming the torch is now the act that decides
   * what the machine knows, not just what is lit.
   *
   * The cone is wider than the light's own 0.4 - see the note in createTorchlight about why
   * the two edges must not land on the same pixel - and the range is longer than the light's
   * 14, because what she can make out at the edge of a beam carries further than what the
   * beam actually illuminates.
   */
  const guess = createTorchlight({ angle: 0.56, penumbra: 0.55, range: 17 });

  const beamFrom = new THREE.Vector3();
  const beamDir = new THREE.Vector3();
  const TORCH_LENS = new THREE.Vector3(0, 0, -0.2);

  scene.registerProp('torch', torchRoot, {
    // Inked: Her father's torch. The only light on the road.
    inked: true,
    anchors: { default: new THREE.Vector3(0, 0, -0.2) },
    idle: (deltaTime, node) => {
      const gap = torchAim - node.rotation.y;
      if (Math.abs(gap) > 0.0005) {
        const step = Math.min(Math.abs(gap), 1.4 * deltaTime) * Math.sign(gap);
        node.rotation.set(node.rotation.x, node.rotation.y + step, node.rotation.z);
      }

      /**
       * Read off the torch's own matrix rather than rebuilt from `torchAim`.
       *
       * The aim is a target the body is still travelling toward, so driving the shader
       * from it would put the guess where the beam is GOING while the light is still on
       * its way - the two would disagree for the whole of the swing, which is the only
       * time anybody is looking at either. Taking both from the matrix means they cannot
       * disagree by construction.
       *
       * -Z because that is the way the barrel is built and the way the light was rotated a
       * half turn to face. One frame stale, since matrixWorld is settled during render and
       * this is a tick - which at 1.4 rad/s is under a tenth of a degree.
       */
      const object = node as unknown as THREE.Object3D;
      beamFrom.copy(TORCH_LENS).applyMatrix4(object.matrixWorld);
      beamDir.set(0, 0, -1).transformDirection(object.matrixWorld);
      guess.aim(beamFrom, beamDir);
    },
  });

  // -- The follower ----------------------------------------------------------
  /**
   * Twenty metres back, on the hedge side, where it is darkest.
   *
   * A full figure rather than a shape, but unlit and dressed in two greys - at this
   * distance with no light on him he resolves to a silhouette, which is precisely what she
   * describes and what the player should be able to read direction from and nothing else.
   * He gets no face because from here nobody has one.
   */
  /**
   * The Stalker, modelled - and he keeps his hands to himself.
   *
   * No handsOn, which is the whole point of him. Every other contact in this game is
   * touching something the mission cares about; he is twenty metres back in the dark doing
   * nothing at all, and that is what Sanda is frightened of. Giving him a hand target would
   * be inventing a reason for him to be there.
   *
   * He also gets no ink and no light. At this distance with nothing on him he resolves to a
   * silhouette, which is exactly what she describes and all the player should be able to
   * read - direction, and nothing else. He has never had a face and must not get one now
   * just because the mesh has one.
   */
  const follower = placeRigged('Follower', {
    modelUrl: '@project/assets/models/Stalker.glb',
    position: new THREE.Vector3(2.05, 0, -9.5),
    rotation: new THREE.Euler(0, Math.PI * 0.02, 0),
    height: 1.86,
    clip: true,
  });

  /**
   * He arrives after the finisher has already run.
   *
   * `placeRigged` loads a GLB, so his root is empty for the first few frames and a
   * traversal of it claims nothing. Everything else in this room is geometry built in the
   * builder and is there by the time the pass runs; he is the one prop that is not, and he
   * is also the one the effect exists for - a shape twenty metres back that she cannot see
   * is the whole reason the machine is guessing at anything.
   *
   * So the claim waits for his bones, which `placeRigged` fills in only once the mesh has
   * really loaded, and then runs once.
   *
   * Waiting on the CLAIM COUNT instead was the obvious version and it was wrong - it
   * reported success and did nothing, which is the failure mode worth writing down. The
   * model node owns an empty mesh from the moment it is created, so the very first traversal
   * found one material, returned 1, latched the flag and never looked again. The skinned
   * meshes turned up half a second later to a pass that had already declared itself
   * finished. A count is evidence that something was claimed; it is not evidence that the
   * thing you wanted was.
   */
  let followerClaimed = false;

  scene.registerProp('follower', follower.root, {
    idle: (deltaTime, node) => {
      follower.idle(deltaTime);
      if (!followerClaimed && Object.keys(follower.bones).length > 0) {
        guess.claim(node as unknown as THREE.Object3D);
        followerClaimed = true;
      }
    },
    actions: {
      /**
       * He breaks off.
       *
       * Not a fade and not a delete: he crosses the road to the mill side and walks into
       * the cut, which is exactly what she narrates. A contact describing something the
       * player can watch happen is the difference between an ending and a caption.
       */
      clear: (tweener, node) => {
        const from = node.position.clone();
        const to = new THREE.Vector3(MILL_X - 0.6, 0, CUT.z - 1.2);
        tweener.add(
          (t) => {
            node.position.lerpVectors(from, to, t);
            // Turning away as he goes, so the last thing visible is his back.
            node.rotation.set(0, Math.PI * 0.02 + t * Math.PI * 0.78, 0);
          },
          { duration: 3.2, easing: Ease.inOutCubic, channel: 'follower-away' }
        );
      },
    },
  });

  // -- Light -----------------------------------------------------------------
  /**
   * One practical, and a moon that is barely there.
   *
   * The hemisphere is set low enough that the road is nearly black and the wall is a value
   * rather than a surface; everything the eye actually reads is inside the torch's pool.
   * §230's warm pool in a cold frame, with the frame turned down as far as it will go
   * before the set stops being legible at all.
   */
  scene.registerProp(
    'moon',
    ENGINE.HemisphereLightNode.create({
      name: 'Moon',
      position: new THREE.Vector3(0, 12, -6),
      // 0.5 left the mill wall at value 19 and the road at 3 - not dark, invisible.
      intensity: 1.9,
      color: new THREE.Color('#5f7591'),
      groundColor: new THREE.Color('#20222a'),
    })
  );

  /**
   * The torch, as a light.
   *
   * A spot, not a point. A point light hung a circle of yellow on the tarmac at her feet,
   * which reads as a streetlamp - and a working streetlamp is the one thing this road is
   * defined by not having. A spot aimed down the corridor puts a long narrowing wedge on
   * the road instead, which is what a torch does and what the whole request is about.
   *
   * Tight distance: it has to die well before the follower, or the chase is already won
   * before the player has said anything.
   */
  const torchLight = ENGINE.SpotLightNode.create({
    name: 'TorchLight',
    // At the lens, in the torch's own space - see the parenting note below.
    position: new THREE.Vector3(0, 0, -0.2),
    /**
     * Numbers arrived at by measuring, not by eye.
     *
     * The first pass looked atmospheric on screen and was not: sampling the frame put the
     * whole set between 1 and 51 out of 255, with the road under the beam at (1,1,3). A
     * viewer brightens a dark image and the eye goes along with it, so a night scene is
     * the one place a screenshot cannot be trusted and the pixels have to be read.
     */
    intensity: 90,
    color: new THREE.Color('#ffd9a0'),
    // Narrow, with a soft edge. A hard cone edge on a hand-held torch reads as a prop.
    angle: 0.4,
    penumbra: 0.7,
    distance: 14,
    decay: 1.0,
  });
  torchLight.castShadow = false;

  /**
   * The spill, and the reason she is not a silhouette.
   *
   * A torch does not only light what it is pointed at - the wash off the road and off her
   * own hands is what makes the person holding one visible at all, and the spot alone left
   * her a black shape in front of a lit road. Small, close and warm.
   *
   * Raised from 5 after measuring instead of looking. Her coat came out at value 21 and her
   * face at 12 against a road at 36 and a beam pool at 157 - she was DARKER than everything
   * behind her, which is the same fault the lighting pass found in all seven views and the
   * last place it would have been noticed, because a woman alone in the dark is exactly
   * what this scene is about and a silhouette reads as intentional right up until you
   * realise you cannot see her face at the moment she is frightened.
   */
  scene.registerProp(
    'torch-spill',
    ENGINE.PointLightNode.create({
      name: 'TorchSpill',
      /**
       * On the camera's side of her, and deliberately short.
       *
       * Two mistakes in one number, both visible the moment it was measured. It sat at
       * z=0.06 while she stands at z=0.2 - the FAR side of her from the camera, so it lit
       * the hedge and the road past her shoulder and left the half of her we actually see
       * as black as it started. She is turned away down the road; the surfaces in frame are
       * her back and the side of her hood, and a fill has to be where the camera is to
       * reach them.
       *
       * The reach is 1.35 rather than 3.1 because a point light at chest height with a
       * three metre radius puts a soft circle on the tarmac around her feet - a second
       * light source, from nothing, in a scene whose entire premise is that her torch is
       * the only one. Stopping it just above the road removes the pool and keeps the woman.
       */
      position: new THREE.Vector3(0.98, 1.24, 0.95),
      /**
       * 3, not 7, and measured at both ends.
       *
       * 7 put her coat at luma 160 with a red channel of 202 - over the 0.78 bloom
       * threshold, so the one figure in the frame would have started glowing at the edges
       * like the hat brim and the goggles did. Her background is the road at 34. Sitting
       * her in the 70s clears it comfortably without asking the bloom pass a question.
       *
       * The reach went out to 1.7 because at 1.35 the falloff ended at her knees: lit to
       * the waist and black below, which is worse than uniformly dark.
       */
      intensity: 3,
      color: new THREE.Color('#ffcf90'),
      distance: 1.7,
      decay: 1.3,
    })
  );
  /**
   * A child of the torch, turned to face the way the torch faces.
   *
   * ## Why parented
   *
   * It was a sibling, aimed in world space at (2.5, 0, -3.9) by its own `lookAt`. That is
   * survivable while nothing moves and it is a bug the moment anything does: the direction
   * of the light and the direction of the torch were two numbers that happened to agree,
   * and the first sweep of the aim turned the body while the beam stayed where it was.
   *
   * ## Why the extra half turn
   *
   * A spot light does NOT point down its own -Z. `LightNode.updateMatrixWorld` sets the
   * three.js target to `worldPosition + getWorldDirection() * d`, and `getWorldDirection`
   * on an ordinary node is the +Z column - so a SpotLightNode fires down +Z. The barrel,
   * bell and lens here are all built along -Z. Parenting with no rotation therefore aimed
   * the beam backwards through the woman holding it, which measured as nine warm pixels in
   * the whole frame - not a dim beam, no beam.
   *
   * `Math.PI` on Y is the whole fix, and it is the only place in this file that has to know
   * which way a light faces. Everything else follows from the torch's own transform: one
   * number, and a body that cannot point somewhere its light does not.
   */
  torchLight.rotation.set(0, Math.PI, 0);
  torchRoot.add(torchLight);

  // -- Shots -----------------------------------------------------------------
  scene.registerShot('default', {
    /**
     * Ahead of her and slightly across, looking back down the road.
     *
     * The one composition that holds all three things the request is about at once: Sanda
     * near, the corridor of wall and hedge receding, and a shape standing in it. Her
     * perpendicular offset from the camera-to-target line is 0.79m, inside the 0.45-0.9
     * band the rule at the top of this file asks for, so she frames the road rather than
     * blocking it.
     */
    position: new THREE.Vector3(2.15, 1.78, 5.6),
    target: new THREE.Vector3(0.15, 1.05, -6.5),
  });
  scene.registerShot('road', {
    // Down the corridor. Nothing in frame but four dead lamps and the distance.
    position: new THREE.Vector3(0.1, 1.5, 1.6),
    target: new THREE.Vector3(-0.4, 2.4, -18),
    duration: 2.4,
  });
  scene.registerShot('follower', {
    // As close as the game ever gets to him, which is not close.
    position: new THREE.Vector3(0.9, 1.6, -3.4),
    target: new THREE.Vector3(2.0, 1.2, -9.3),
    duration: 2.0,
  });

  /**
   * What the machine is allowed to be sure of, and what it is only inferring.
   *
   * A list rather than the whole scene, and the exclusions are the argument:
   *
   *   - **Sanda** is on the phone. Everything the machine knows about this road it knows
   *     because she is describing it, so the one thing it is not guessing at is her.
   *   - **The torch** is the instrument. Grading the light source by its own light is a
   *     loop, and a torch that dims itself when it looks away is a bug with a rationale.
   *   - **The follower** is deliberately IN the list, and he is the reason the effect
   *     earns its place. He is the thing she cannot see, so he is the thing the machine
   *     has only her word for - a grid-marked shape twenty metres back that resolves into
   *     a man when, and only when, the beam finds him.
   *   - **Night and hill** are unlit and skipped by the pass itself. The sky is not a
   *     surface anybody is guessing at.
   *
   * The grid is turned down on the verge grass rather than off. It is a thousand instanced
   * blades a couple of centimetres wide, and a metre grid across them lands as a line on
   * roughly one blade in forty - which is not a grid, it is a sparkle. The drain still
   * applies at full strength there, which is the half that matters: unlit grass going dark
   * behind the beam is what makes the pool read as travelling.
   */
  scene.registerFinisher(() => {
    for (const id of [
      'road', 'patches', 'verge', 'stones-mill', 'stones-hedge',
      'mill', 'windows', 'cut', 'hedge', 'whips', 'lamps', 'lamp-heads', 'follower',
    ]) {
      const node = scene.nodeFor(id);
      if (node) guess.claim(node as unknown as THREE.Object3D);
    }
    for (const id of ['verge-grass-left', 'verge-grass-right']) {
      const node = scene.nodeFor(id);
      if (node) guess.claim(node as unknown as THREE.Object3D, { grid: 0.25 });
    }
  });
}

// Registered at module load. auto-imports pulls this module in, so a ContactScene node
// placed in the editor with a matching sceneId populates itself.
/**
 * MISSION 08 - District 07, as the machine sees it.
 *
 * The first diorama in this game that is not a place. The other six are somebody's shop or
 * cellar or doorstep, lit by a lamp that is actually in the room; this is a reconstruction
 * assembled out of a road network, a camera register and a stream of vehicle pings, and it
 * is drawn as outlines because outlines are what the machine has.
 *
 * ## Everything here is unlit, on purpose
 *
 * There is not a single light node in this builder and there should never be one. A light
 * implies a source, a source implies a room, and this is not a room - it is a picture of a
 * database. `LineBasicMaterial` ignores lighting entirely, which for once is exactly the
 * behaviour wanted rather than a limitation worked around.
 *
 * ## And the traces are all identical
 *
 * Not one of them is marked. The suspect is in here, and finding it is the mission; a
 * highlight on the right car would hand over the answer that the entire evidence device in
 * mission/traces.ts exists to make the player earn. §157, in its strongest form - the
 * presentation is not allowed to know something the player has not deduced.
 */
function buildWireCity(scene: ContactScene): void {
  /**
   * Imported, not generated.
   *
   * This used to build its own city and its own traffic from the seed, and the mission
   * built its own traffic from the same seed - which is not the same district, because the
   * generators share a random stream and the two called them in different orders. The
   * suspect was in one place on this map and another in the evidence. See district-07.ts.
   */
  const SIZE = DISTRICT_SIZE;
  const city = DISTRICT_CITY;
  const rng = createRng(seedFrom('district-07-dressing'));

  // No air between the camera and a database. See ContactScene.atmosphere.
  scene.atmosphere = false;

  /**
   * Three depths of the same colour, which is the whole palette.
   *
   * §241 asks for depth from value rather than from detail, and a wireframe has no detail
   * to spend - so the lattice sits just above black, the towers read as a mass, and the
   * roads are the brightest thing because the roads are what the mission is about. A player
   * who looks at this frame should find the network before they find the skyline.
   */
  const wire = (colour: string, opacity: number): THREE.LineBasicMaterial =>
    new THREE.LineBasicMaterial({ color: new THREE.Color(colour), transparent: true, opacity });

  const layer = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material): ENGINE.SceneNode => {
    const node = ENGINE.SceneNode.create({ name, position: new THREE.Vector3() });
    // A raw three.js object rather than a MeshNode: these are LineSegments, and the engine's
    // mesh node would build a collider for geometry that has no faces to collide with.
    node.add(new THREE.LineSegments(geometry, material));
    return node;
  };

  /**
   * The city is the MAP's blue; only the network is green.
   *
   * Both were green at first and the frame had nothing to separate. §9 already assigns
   * these: cold cyan is data, acid green is knowledge and machine activity - so the
   * district, which is a reconstruction of a place, is the same cyan as the land on the
   * console globe, and the roads and traffic, which are what OMNISCIENT_ is actually
   * reasoning over, are the green.
   *
   * That also makes the two views one instrument. A player who has spent six missions
   * picking signals off a blue wireframe globe arrives here and recognises the material
   * before they have read a word: this is the same machine looking at the same world,
   * closer in. The colours come from the shared MAP palette rather than being typed here,
   * so they cannot drift apart.
   */
  scene.registerProp('lattice', layer('Lattice', city.lattice, wire(MAP.grid, 0.85)));
  scene.registerProp('towers', layer('Towers', city.towers, wire(MAP.land, 0.7)));
  scene.registerProp('roads', layer('Roads', city.roads, wire(ACCENT.knowledge, 0.85)));

  /**
   * Cameras, as the thing they are: a point of view.
   *
   * Drawn as a short cone of sight rather than as an icon of a camera, because what the
   * player needs to read is not "there is a camera here" but "this is what it can see" -
   * the second phase of the mission is predicting which one the car crosses next, and that
   * is a question about coverage, not about hardware.
   */
  const sight: number[] = [];
  for (const at of city.cameras) {
    const head = cellToWorld(SIZE, at.x, at.y, 6);
    const facing = range(rng, 0, Math.PI * 2);
    for (const spread of [-0.42, 0.42] as const) {
      const reach = CELL * 1.7;
      sight.push(
        head.x, head.y, head.z,
        head.x + Math.cos(facing + spread) * reach, 0.1, head.z + Math.sin(facing + spread) * reach
      );
    }
    // A stub of mast, so it hangs off something.
    sight.push(head.x, head.y, head.z, head.x, head.y + 1.4, head.z);
  }
  const sightGeometry = new THREE.BufferGeometry();
  sightGeometry.setAttribute('position', new THREE.Float32BufferAttribute(sight, 3));
  scene.registerProp('cameras', layer('Cameras', sightGeometry, wire(ACCENT.amber, 0.6)));

  /**
   * The traffic. Every car in the district, and one of them did it.
   *
   * Small enough that they read as a swarm rather than as vehicles - at this altitude a car
   * IS a moving point, and pretending otherwise would claim a resolution the network does
   * not have.
   */
  const { fleet } = DISTRICT_FLEET;
  const cars: number[] = [];
  for (const trace of fleet) {
    const at = cellToWorld(SIZE, trace.cell.x, trace.cell.y, 0.6);
    // A cross rather than a box: two segments instead of twelve, and at this size a box
    // resolves to a smudge anyway while a cross keeps a readable centre.
    const r = 1.15;
    cars.push(at.x - r, at.y, at.z, at.x + r, at.y, at.z);
    cars.push(at.x, at.y, at.z - r, at.x, at.y, at.z + r);
  }
  const carGeometry = new THREE.BufferGeometry();
  carGeometry.setAttribute('position', new THREE.Float32BufferAttribute(cars, 3));
  scene.registerProp('traffic', layer('Traffic', carGeometry, wire('#bfe9c8', 0.9)));

  scene.registerShot('default', {
    /**
     * High and off one corner, looking down the diagonal.
     *
     * A plan view would be a map and a low view would be a skyline; the mission needs both
     * at once - the network to reason about and the buildings to give it depth. Tilted far
     * enough that the towers read as height rather than as clutter on a chart.
     *
     * Dropped from 96m to 34m after measuring nothing wrong and looking at everything
     * wrong. From up there the height variation - which runs from 3m at the edge to 40m
     * downtown - foreshortened into a flat lattice, so the district read as a circuit board
     * rather than as a city. The tallest thing in the frame has to be able to occlude
     * something behind it or there is no third dimension in the picture at all.
     */
    position: new THREE.Vector3(92, 34, 118),
    target: new THREE.Vector3(-10, 14, -18),
  });
  scene.registerShot('downtown', {
    position: new THREE.Vector3(34, 40, 58),
    target: new THREE.Vector3(-4, 8, -6),
    duration: 2.6,
  });
  /**
   * Down into the traffic, for the arrival.
   *
   * Every other shot in this mission looks at the district from outside and above, which is
   * the machine's natural position and the reason the whole thing has felt like a puzzle.
   * This one is at windscreen height inside it, looking along a road at the cars rather than
   * down at them - so the little green boxes the player has been tracking across a grid
   * finally pass at eye level, at the exact moment the game admits they are people.
   *
   * Slow, at four seconds. The drop from the overview is the beat; cutting would just be a
   * different camera, while travelling makes it the same place seen from inside.
   */
  scene.registerShot('windscreen', {
    position: new THREE.Vector3(12, 2.2, 30),
    target: new THREE.Vector3(-8, 3.4, -16),
    duration: 4,
  });
}

ContactScene.registerBuilder('scene-repair-shop', buildRepairShop);
ContactScene.registerBuilder('scene-beacon-mast', buildBeaconMast);
ContactScene.registerBuilder('scene-seedling-tunnel', buildSeedlingTunnel);
ContactScene.registerBuilder('scene-cleared-house', buildClearedHouse);
ContactScene.registerBuilder('scene-flooded-cellar', buildFloodedCellar);
ContactScene.registerBuilder('scene-night-door', buildNightDoor);
ContactScene.registerBuilder('scene-mill-road', buildMillRoad);
ContactScene.registerBuilder('scene-wire-city', buildWireCity);

/** Construct a populated diorama for a mission's sceneId, or null when none exists. */
export function buildContactScene(sceneId: string): ContactScene | null {
  if (!ContactScene.hasBuilder(sceneId)) {
    console.warn(`[contact-view] no scene builder for "${sceneId}"`);
    return null;
  }
  return ContactScene.create({ name: 'ContactScene', sceneId });
}
