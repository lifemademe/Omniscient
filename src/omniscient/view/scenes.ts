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
import { roomToneSwell } from '../audio/RoomTone.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import {
  createBoxLabel,
  createCorrosionBloom,
  createHouseNumber,
  createMeterFace,
  createPuddleSurface,
  createRatingPlate,
} from '../art/decals.js';
import { decorMesh } from '../art/mesh.js';
import { carInterior } from '../geometry/carInterior.js';
import { createRainGlass } from '../art/rainGlass.js';
import { CERTAINTY } from '../art/certainty.js';
import { createFloodwater } from '../art/floodwater.js';
import { createRipples } from '../art/ripples.js';
import { createTorchlight } from '../art/torchlight.js';
import { applyFloodstain } from '../art/floodstain.js';
import { applySaltRust } from '../art/saltrust.js';
import { createStarfield } from '../art/starfield.js';
import { brickwork } from '../art/brickwork.js';
import { applyWaterline } from '../art/waterline.js';
import { aimLight, applyShadowPolicy, castShadows } from '../art/shadows.js';
import { CONTACT_GESTURES } from './gestures.js';
import { placeRigged } from './riggedContact.js';
import {
  buildStationScreen,
  SCREEN_H,
  SCREEN_W,
  StationDesktop,
} from './stationDesk.js';
import { CRTSurface } from '../crt/CRTSurface.js';
import { MowerDrive, MowingField } from './mowing.js';

import type { FieldBounds } from './mowing.js';
import { ACCENT, LIGHT, MAP, MAT } from '../art/palette.js';
import { billboard, glowMaterial } from '../art/glow.js';
import { decalMaterial, texturedFrom } from '../art/surface.js';
import { createRng, jitter, range, seedFrom } from '../core/rng.js';
import { getAccessibilityPreferences } from '../accessibility/preferences.js';

import type { Rng } from '../core/rng.js';
import { Ease } from '../core/tween.js';

import type { Tweener } from '../core/tween.js';
import { createFieldBackdrop, createNightBackdrop } from '../geometry/backdrop.js';
import { buildTree } from '../geometry/tree.js';
import { buildMower } from '../geometry/mower.js';
import { buildCat } from '../geometry/cat.js';
import { clouds } from '../geometry/clouds.js';
import { createBirds, createMotes } from '../geometry/wildlife.js';
import { DISTRICT_CITY, DISTRICT_FLEET, DISTRICT_SIZE } from '../content/district-07.js';
import { CELL, cellToWorld } from '../geometry/wireCity.js';
import { createClump } from './../geometry/foliage.js';
import { grassTufts, greenhouse, rocks } from '../geometry/outdoors.js';
import { meadow, meadowGround, stepWind, WIND } from '../geometry/meadow.js';
import { stylisedWater } from '../geometry/water.js';
import { rows, scatter } from '../geometry/planting.js';
import {
  crateLid,
  createMainsSwitch,
  createShelfStack,
  createTransmitter,
  createWorkbench,
} from '../geometry/props.js';
import {
  createBenchLamp,
  createCableCoil,
  createCompressor,
  createFluorescentBatten,
  createHandTools,
  createTins,
} from '../geometry/workshop.js';

import type { ToolSpec } from '../geometry/workshop.js';

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

import type { RiggedContact } from './riggedContact.js';
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
  /*
   * Mirela is MODELLED again.
   *
   * She was taken out of this map for one job - standing the generator next to the rest of
   * the cast in the same room, under the same key light, so the two could be compared - and
   * that comparison has been made. The generator is not close enough to put in a shipping
   * scene beside seven Tripo characters, so she goes back. Her GLB remains the reference the
   * proportion scaffold in geometry/character.ts was measured against.
   */
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
/**
 * Place a contact, and hand the rig back.
 *
 * Returns it rather than void so a SCENE can give its own contact something no other
 * contact does. The shared gesture actions below are properties of the rig and belong to
 * everybody; a beat where one specific person walks out of shot to check one specific wire
 * is a property of one room, and registering it here would mean every contact in the game
 * carrying an action about Mirela's supply cable.
 *
 * Null when the character is unrigged or hidden - a caller wanting scene-specific behaviour
 * has to cope with not getting a rig, which is honest: those characters cannot walk.
 */
function addContact(
  scene: ContactScene,
  name: string,
  placement: CharacterPlacement,
  options: { hidden?: boolean } = {}
): RiggedContact | null {
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
      settleWrists: placement.settleWrists,
    });
    /**
     * Gestures, as prop actions.
     *
     * Reached through the cue system a mission already speaks - `prop.point:contact` fires
     * the same way `prop.highlight:connector-b` does, so content asks for a reaction in the
     * terms it already uses and nothing new has to be learned to author one.
     *
     * Registered for every rigged contact rather than per character, because a gesture is
     * a property of the rig and all seven share it. A mission that asks Dorin to nod gets
     * a nod without anybody adding Dorin to a list.
     */
    scene.registerProp('contact', rigged.root, {
      idle: rigged.idle,
      /*
       * Built from CONTACT_GESTURES rather than typed out, for the reason that list exists:
       * four names in four places is four places to forget. A clip added there is playable
       * by every contact here without touching this line.
       */
      actions: Object.fromEntries(
        CONTACT_GESTURES.map((name) => [name, () => rigged.gesture(name)])
      ),
    });
    describeContact(scene);
    return rigged;
  }

  const contact = placeCharacter(name, placement);
  // Hidden rather than skipped: the prop stays registered so cues that highlight or move
  // the contact still resolve, and switching back is one flag rather than an edit.
  contact.root.visible = !options.hidden;
  scene.registerProp('contact', contact.root, { idle: contact.idle });
  describeContact(scene);
  return null;
}

/**
 * The person on the phone is not something the machine is guessing at.
 *
 * Contacts registered as `'contact'` with no certainty and no `inked` flag, so every one of
 * them fell through to the SHAPED default - and SHAPED is 0.45, below the law's neutral
 * point of 0.7. The cold branch was therefore running on all seven of them: desaturated by
 * 26% and pulled 24% of the way to `ACCENT.data`, a cyan-blue.
 *
 * Which is why Mirela looks blue, and Vasile teal, and Ileana grey. It was reported as a
 * saturation problem and is the opposite of one - the retro pass's +16% saturation had been
 * partly masking it, so turning that down would have dulled the whole game and left every
 * contact exactly as cold.
 *
 * PRESENT, which is the law's neutral point and therefore no grading at all - see the note
 * on the constant. DESCRIBED was tried first and overshot in the other direction: her face
 * came out at 58% saturation against an authored 43%, because 0.75 still carries a 10%
 * chroma boost. Trading a blue cast for an orange one is not a fix.
 *
 * KNOWN would be worse again - 15% amber, a 60% chroma boost and the tier-4 emissive lift,
 * on skin, which is the lightest material anybody wears and the first thing to clip. It
 * would also put the contact above the hero prop in the ranking §2 spent this direction
 * building. The machine is certain who it is talking to; the request is still the subject.
 */
function describeContact(scene: ContactScene): void {
  scene.setCertainty('contact', CERTAINTY.PRESENT);
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

  /*
   * How much of the rig's afternoon reaches this room.
   *
   * Six of the eight scenes were sitting at the default 1, which means the workstation's
   * global key AND its sky fill landed on top of whatever practicals the room had lit
   * itself with. The sky term is the problem: it is an ambient, it has no direction, and at
   * full strength it raises every shadow in the room to roughly the value of every lit
   * surface. Reported as the contact rooms looking flat next to the menu room, and that is
   * exactly what it is - the menu room is lit by three practicals and nothing else.
   *
   * Lowering this does not make a room dark; it hands the room back to the lights that were
   * already in it and lets the corners go. Each value below is what the fiction says about
   * the place rather than a level: a workshop in the afternoon with a window and a work lamp over the bench, which is where
   * the light in that frame should be coming from
   */
  /*
   * F-1 gauntlet: the opening frame was being read from the bench outward. The broad
   * daylight lifted the pegboard, floor and every pale horizontal surface together, so
   * Mirela's face and the request had no value hierarchy to lead. The room still has a
   * cold side at 0.4; it simply stops behaving like a second key.
   */
  scene.daylight = 0.3;
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

  /**
   * The tools, and the only statement in this game about what Mirela does with her hands.
   *
   * ## What was here
   *
   * Eleven entries of `[x, y, length, width, kind]` with three kinds: a bar, a bar with a
   * lump on the bottom, and a ring. On screen that is five dark rectangles in a row directly
   * behind her head - which is not a bad set of tools, it is not a set of tools. §131 asks
   * the environment to carry the evidence and the note on the pegboard calls this the wall
   * the player READS; five identical sticks say "there is stuff on that wall" and stop.
   *
   * Now each one is a shape somebody can name at a glance: a ring at the top, a fork at the
   * bottom, a closed rectangle with the board showing through it, a T. See
   * `createHandTools` for why silhouette is the only thing being spent on.
   *
   * ## Which of them are actually seen
   *
   * Projected: the console panel's left edge cuts the frame at 0.645, and on this wall that
   * lands at about x -0.1. Everything from x 0.2 rightward is BEHIND THE PANEL in every call
   * - so the right-hand cluster gets three plain kinds and no thought, and the five between
   * x -1.42 and -0.58 get the distinct ones. That is not laziness, it is where the triangles
   * do something: the left five are the ones sharing frame with her face.
   */
  const TOOLS: readonly ToolSpec[] = [
    // The seen five. Deliberately five DIFFERENT outlines, left to right.
    { x: -1.42, y: 2.02, kind: 'spanner', length: 0.3, width: 0.034 },
    { x: -1.22, y: 2.06, kind: 'hacksaw', length: 0.34, width: 0.03 },
    { x: -1.02, y: 2.0, kind: 'pliers', length: 0.26, width: 0.032 },
    { x: -0.78, y: 2.08, kind: 'screwdriver', length: 0.4, width: 0.03 },
    { x: -0.58, y: 2.02, kind: 'hammer', length: 0.32, width: 0.032 },
    // Behind the panel in a call, and worth having for the editor and any future framing.
    { x: 0.86, y: 1.98, kind: 'file', length: 0.44, width: 0.028 },
    { x: 1.02, y: 2.05, kind: 'spanner', length: 0.34, width: 0.03 },
    { x: 1.22, y: 2.0, kind: 'pliers', length: 0.28, width: 0.034 },
    { x: 1.44, y: 2.08, kind: 'hacksaw', length: 0.4, width: 0.028 },
    // The two rings, kept from the old wall - they were the entries that already worked.
    { x: -1.3, y: 1.3, kind: 'coil', length: 0.22, width: 0.05 },
    { x: 1.15, y: 1.28, kind: 'coil', length: 0.26, width: 0.056 },
  ];
  const tools = createHandTools(TOOLS, 'mirela-pegboard');
  const toolRoot = ENGINE.SceneNode.create({
    name: 'PegboardTools',
    // The board's face is at -1.805; the tools stand a hair off it and the pegs go in.
    position: new THREE.Vector3(0, 0, -1.73),
  });
  toolRoot.add(meshOf('Tools', tools.body, MAT.dark));
  toolRoot.add(meshOf('ToolPegs', tools.fittings, MAT.metal));
  scene.registerProp('pegboard-tools', toolRoot);

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
  const tideSilt: THREE.BufferGeometry[] = [];
  /*
   * A broad stain UNDER each line rather than a thin band at it. Water that stands a
   * hand's depth for a week discolours everything it covered, and a 3.5cm stripe reads as
   * a stripe somebody painted - which is what it looked like, on the rare occasions the
   * camera was pointed at it at all.
   */
  for (const [height, depth] of [
    [0.26, 0.2],
    [0.19, 0.13],
  ] as const) {
    const stain = new THREE.BoxGeometry(8, depth, 0.02);
    stain.translate(0, height - depth / 2, -1.815);
    tideMarks.push(stain);

    // And the crust at the top of it, which is the part that actually reads.
    const silt = new THREE.BoxGeometry(8, 0.022, 0.024);
    silt.translate(0, height, -1.813);
    tideSilt.push(silt);
  }
  // Round the corner and onto the shelf's legs, so it reads as a level the whole room
  // sat under rather than a stripe painted on one wall.
  /*
   * The marks on the shelf legs are gone.
   *
   * Twice reported as "two blue rectangles with white tops" and twice not understood,
   * which is a complete answer about a prop: they were the shelf's own legs wearing a
   * tidemark, and at that size and value nobody read them as either. A detail that has to
   * be explained is not carrying evidence, it is asking for attention it cannot repay.
   *
   * The wall bands stay - they are broad, they are where a tidemark belongs, and they are
   * not pretending to be objects. The puddle carries the rest.
   */

  scene.registerProp(
    'tide-silt',
    meshOf('TideSilt', mergeGeometries(tideSilt, false) ?? tideSilt[0], MAT.tideSilt)
  );

  /**
   * The puddle, which is what should have been here in the first place.
   *
   * Two rounds of making the tidemark legible - widening the stain, adding a silt crust,
   * reframing the camera twice - and the answer to "where is the water" was still that
   * there was none. A stain is a record of water; a puddle IS water, and the question was
   * always the literal one.
   *
   * It does not contradict her. She says it floods every spring and has been fine since:
   * this is not a flood, it is the damp that never quite leaves a stone floor below the
   * waterline, lying in the low corner under the shelf where it would actually collect.
   * That is also why it is in THAT corner rather than under the bench - the evidence and
   * the tidemark belong to the same place, so one camera holds both.
   *
   * The same shader as Vasile's cellar, at a fifth of the ripple's business, because
   * standing water in a corner moves when the room does and not otherwise.
   */
  /*
   * Pale, not dark - which is the opposite of what a wet floor does and the only thing
   * that works here.
   *
   * At #1a2428 the puddle rendered correctly and measured nine luma BELOW the floor around
   * it: present, dark-on-dark, invisible. Exactly the fault the tidemark had, made twice in
   * a row.
   *
   * A specular is not available to rescue it either. Reflecting this camera off a
   * horizontal pool at (-1.95, -1.16) puts the required light source at roughly (-2.4,
   * 0.4, -2.2), which is a metre behind the back wall - so no legal light in this room can
   * ever put a highlight on this puddle from this angle.
   *
   * So it reads by VALUE. In a dark room a puddle is the bright thing, because the one
   * thing it has to work with is whatever it can throw back - and a pool of pale sheen on
   * a dark stone floor is what that looks like in every photograph of a wet floor at night.
   */
  /**
   * The puddle: a bean-shaped plane with a painted reflection.
   *
   * Four goes at a lit, shaded pool and none of them read, for a reason that is now
   * measured rather than guessed - this corner has nothing to reflect, and a real specular
   * is not even geometrically available from the flood camera. See createPuddleSurface.
   *
   * So it is drawn. Unlit and un-tone-mapped, so the darkest corner in the shop cannot
   * take it away; bean-shaped, because a circle reads as a decal; and carrying its own
   * highlights, because the reflection is the thing that says water rather than paint.
   */
  const puddleTexture = createPuddleSurface();
  if (puddleTexture) {
    /*
     * Smaller and further into the corner. At 1.55 by 1.05 centred on -1.1 the pool ran off
     * the bottom right of the flood shot and read as a large dark ellipse with its shape
     * cropped away - a bean nobody can see the whole of is just a curve.
     */
    /*
     * Shifted screen-left. From the flood camera the right vector is roughly world
     * (0.82, 0, -0.36), so moving the pool along its negative lands it in the middle of
     * the shot instead of running under the console panel's edge.
     */
    const puddleGeo = new THREE.PlaneGeometry(1.02, 0.72);
    puddleGeo.rotateX(-Math.PI / 2);
    puddleGeo.translate(-2.42, 0.006, -1.17);
    scene.registerProp(
      'puddle',
      meshOf(
        'Puddle',
        puddleGeo,
        new THREE.MeshBasicMaterial({
          map: puddleTexture,
          transparent: true,
          toneMapped: false,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -3,
          polygonOffsetUnits: -3,
        })
      )
    );
  }


  /**
   * And something for it to be lit by.
   *
   * The room's cold source is the shop door at (-2.4, 1.7, 1.6) with a 1.4 decay, and by
   * the time it reaches this corner there is almost nothing left - which is correct for �5
   * ("dark everywhere else") and leaves the one piece of evidence in the room lit by
   * nothing at all. �131 asks the environment to carry the evidence; it cannot carry what
   * cannot be seen.
   *
   * Small, cool and short-range, so it lifts the corner and nothing else. It is the same
   * daylight, further in - not a new source, which the room is not allowed another of.
   *
   * ADDENDUM, and the second half of that sentence is no longer true: there is a
   * fluorescent batten on that wall now, two metres over this light, and the corner has a
   * real reason to be lit. That does not make this redundant. A strip light two metres up
   * puts very little on a floor at this distance once the falloff is paid, and what it DOES
   * put there comes down onto standing water and comes back - so this stops being an
   * invented fill and becomes the bounce off the puddle, which is a thing that was always
   * physically happening and had nobody to attribute it to.
   *
   * The numbers are deliberately left where they were tuned. The batten adds perhaps a
   * third again to this corner, which is the right direction for a corner that has just
   * acquired a lamp, and cutting a measured value to compensate for an unmeasured one is
   * how a lit room becomes two wrong guesses instead of one right one.
   */
  scene.registerProp(
    'corner-fill',
    ENGINE.PointLightNode.create({
      name: 'CornerFill',
      position: new THREE.Vector3(-1.75, 0.85, -0.55),
      intensity: 1.2,
      color: new THREE.Color(LIGHT.fill),
      distance: 2.4,
      decay: 1.2,
    })
  );
  scene.registerProp(
    'tide-line',
    meshOf('TideLine', mergeGeometries(tideMarks, false) ?? tideMarks[0], MAT.tideStain)
  );

  /*
   * ------------------------------------------------------------------ the left-hand wall
   *
   * Everything from here to the tins is one change with one reason: the left third of this
   * frame was a floor, a plaster wall and nothing at all.
   *
   * That is not a small thing in a game whose most-seen image this is. The room had a bench
   * with the work on it, a shelf, a stain and a puddle, all of them clustered at or behind
   * the centre - and to the left of that, from the top of frame to the bottom, four square
   * metres of unbroken surface. §186 asks for composition before clutter and it is right,
   * but the answer to a bare wall is not fewer objects; a bare wall reads as a room the
   * builder stopped building, and the eye has nowhere to go on the way in.
   *
   * The placements below are PROJECTED rather than eyeballed - `scripts/dev/probe-shop.ts`
   * puts a world point on screen through the registered shots. It is the same instrument
   * the wire beat needed, and it earned its keep again here: the visible stretch of that
   * wall runs from z -1.85 to about z +0.1 and no further, and the first cable drum built
   * for this corner was a good object that landed entirely off frame at every aspect ratio
   * from 4:3 to 21:9. It is a coil on the wall now, for that reason and no other.
   *
   * All of it is SHAPED, none of it is SUSPECTED, and that distinction is load-bearing -
   * see the tier list further down for why.
   */

  /**
   * The fluorescent batten, over the puddle.
   *
   * ## Where it is
   *
   * On the side wall at x -3.025, 2.2m up, running from z -1.85 to -0.55 - which puts it
   * almost exactly above the water. That is not arrangement for its own sake. This corner
   * holds the flood evidence and had no light of its own; §131 asks the environment to
   * carry the evidence and it cannot carry what nobody can see, and the answer until now
   * was a fill light hanging in mid-air with nothing making it.
   *
   * ## What it does to the frame
   *
   * The tube runs from about 14% to 30% across and 13% to 18% down: a bright diagonal in
   * the top-left corner, which is the one part of this composition that had nothing leading
   * into it. A line pointing down-right toward the bench is worth more than any amount of
   * dressing at the same cost.
   *
   * It is also the only COLD source in this room with a visible fitting. The door light
   * opposite the lamp is what stops every surface converging on the same orange (see its
   * note), and it comes from off frame - so the room's entire cold half was, until now,
   * unattributable. Now half of it is bolted to a wall the player can see.
   */
  const batten = createFluorescentBatten({ length: 1.3 });
  /*
   * z -1.11 rather than -1.2, which is 9cm of pedantry with a reason. The back wall's inner
   * face is at -1.825, and the fitting is 9cm longer than its tube once the end caps and the
   * channel's overhang are counted - so a 1.3m batten centred on -1.2 finishes at -1.91,
   * with the whole of one cap inside the plaster. The first correction moved it to -1.15 and
   * measured -1.86, which is the same mistake 3cm smaller; the harness caught both.
   */
  const BATTEN_AT = new THREE.Vector3(-2.93, 2.2, -1.11);
  const battenRoot = ENGINE.SceneNode.create({ name: 'Batten', position: BATTEN_AT.clone() });
  battenRoot.add(meshOf('BattenChannel', batten.fittings, MAT.metal));
  battenRoot.add(meshOf('BattenCaps', batten.recesses ?? batten.fittings, MAT.dark));
  scene.registerProp('batten', battenRoot);

  /*
   * The tube on its own prop, and it has to be.
   *
   * MAT.tube is a MeshBasicMaterial, which `applyCertainty` skips outright - so the tube
   * keeps its authored colour whatever tier this fitting is registered at, which is the
   * behaviour a lamp wants. The channel and the caps are standard materials and do get
   * pulled, which is also correct: the steel is inferred, the light is on.
   */
  const tubeRoot = ENGINE.SceneNode.create({ name: 'BattenTube', position: BATTEN_AT.clone() });
  tubeRoot.add(meshOf('Tube', batten.body, MAT.tube));
  const battenLamps: ENGINE.PointLightNode[] = [];
  let battenTime = 0;
  scene.registerProp('batten-tube', tubeRoot, {
    idle: (dt) => {
      battenTime = (battenTime + dt) % 9.4;
      const dip = battenTime < 0.035 ? 0.58 : battenTime < 0.09 ? 0.84 : 1;
      for (const lamp of battenLamps) lamp.intensity = 1.1 * dip;
    },
  });

  /*
   * And the light it makes - three points along the tube, a third of a budget each.
   *
   * LIGHT.fill rather than a fluorescent green-white, and the restraint is the point. This
   * room is built on exactly two colours of light: a warm work lamp on the bench and cold
   * daylight from the door, and every object in it separates because it has a warm side and
   * a cold side. A third hue would muddy the one arrangement that is working. The GREEN
   * lives in the tube's own material instead, where it says fluorescent up close without
   * spilling a third colour over the room.
   *
   * 1.1 each, and modest on purpose. §187 wants one key plus controlled practicals; the
   * work lamp is the key and stays several times this at the bench, so the eye still goes
   * to the radio. A batten that out-lit the workbench would be a beautifully made mistake.
   *
   * The count and the spacing were both changed after looking at it - see the note on the
   * anchors in `createFluorescentBatten` for what two points did to the wall.
   */
  for (const [id, anchor] of [
    ['batten-lamp-a', batten.anchors.lampA],
    ['batten-lamp-b', batten.anchors.lampB],
    ['batten-lamp-c', batten.anchors.lampC],
  ] as [string, THREE.Vector3][]) {
    const lamp = ENGINE.PointLightNode.create({
      name: 'BattenLamp',
      position: BATTEN_AT.clone().add(anchor),
      intensity: 0.55,
      color: new THREE.Color(LIGHT.fill),
      distance: 3.4,
      decay: 1.5,
    });
    battenLamps.push(lamp);
    scene.registerProp(id, lamp);
  }

  /**
   * The compressor, standing against the wall in front of the shelf.
   *
   * Placed at z -0.35 rather than anywhere nearer the water, and the reason is the
   * `workshop-floor` shot: that camera exists to show the player the flood damage, and a
   * machine parked over the puddle would be a prop obscuring the evidence it was brought in
   * to keep company. From the default shot it fills the lower left - the region the tins
   * are too small to hold - and from the evidence shot it is behind the camera entirely.
   *
   * Its front bleeds off the left edge on a 4:3 window. That is deliberate and checked: the
   * motor and the flywheel, which are what identify it, stay on frame at every ratio, and
   * an object running out of the frame is one of the few free ways to say the room does not
   * stop where the picture does.
   */
  const compressor = createCompressor();
  const compressorRoot = ENGINE.SceneNode.create({
    name: 'Compressor',
    position: new THREE.Vector3(-2.72, 0, -0.35),
  });
  compressorRoot.add(meshOf('CompressorBody', compressor.body, MAT.equipment));
  compressorRoot.add(meshOf('CompressorFittings', compressor.fittings, MAT.metal));
  compressorRoot.add(
    meshOf('CompressorFeet', compressor.recesses ?? compressor.fittings, MAT.dark)
  );
  scene.registerProp('compressor', compressorRoot);

  /**
   * A coil of cable on a nail, filling the metre of wall between the batten and the floor.
   *
   * The one CIRCLE on this side of the room. Everything else here is a box, a plank or a
   * cylinder lying down, and a corner made entirely of straight edges reads as construction
   * however well it is lit. It hangs at 1.6m, which is where somebody would actually put it
   * and which happens to be the middle of the empty band.
   *
   * Coax on a workshop wall is also the most specific thing in this room about what Mirela
   * does for a living, and it costs three toruses to say it.
   */
  const coil = createCableCoil('mirela-coil', 0.17);
  const coilRoot = ENGINE.SceneNode.create({
    name: 'CableCoil',
    position: new THREE.Vector3(-2.98, 1.62, -0.95),
  });
  coilRoot.add(meshOf('CoilCable', coil.body, MAT.dark));
  coilRoot.add(meshOf('CoilNail', coil.fittings, MAT.metal));
  scene.registerProp('cable-coil', coilRoot);

  /**
   * Tins on the floor, and one of them lying in the water.
   *
   * ## The standing three
   *
   * On the room side of the compressor, so nothing intersects, and clustered rather than
   * spaced - things people put down end up in groups. One has its bail handle and its lid
   * off beside it, which is the difference between stock and something in use.
   *
   * ## The fourth one
   *
   * Lying on its side inside the puddle, and it is the only one of these four doing a job
   * beyond filling space. This corner's evidence is a stain on a wall and a dark shape on
   * the floor, and both of those are things a player has to be TOLD are water. A tin on its
   * side in the middle of it is not: everybody knows what an object lying in a puddle
   * means, and it is the one piece of dressing in this room that makes the flood read
   * without a line of dialogue.
   *
   * It is also in frame on the `workshop-floor` shot at 1.6m, which is the closest the
   * camera ever gets to the evidence. That is where it earns its place.
   */
  const tins = createTins(
    [
      {
        at: new THREE.Vector3(0, 0, 0.06),
        radius: 0.055,
        height: 0.145,
        handle: true,
        openLid: true,
      },
      // x -0.06 rather than -0.09: at -0.09 this one's shoulder reached the compressor's
      // tank end. Three centimetres, and the cluster reads exactly the same.
      { at: new THREE.Vector3(-0.06, 0, -0.06), radius: 0.04, height: 0.1 },
      { at: new THREE.Vector3(0.02, 0, -0.16), radius: 0.048, height: 0.125 },
      // In the water. 12mm up, so the puddle plane at y 0.006 passes under it rather than
      // through it - a surface and a prop fighting for the same millimetre is a flicker.
      { at: new THREE.Vector3(0.16, 0.012, -0.36), radius: 0.05, height: 0.13, tipped: 0.62 },
    ],
    'mirela-tins'
  );
  const tinRoot = ENGINE.SceneNode.create({
    name: 'Tins',
    position: new THREE.Vector3(-2.46, 0, -0.66),
  });
  tinRoot.add(meshOf('TinBodies', tins.body, MAT.equipment));
  tinRoot.add(meshOf('TinRims', tins.fittings, MAT.metal));
  scene.registerProp('tins', tinRoot);

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
  /*
   * Dark, and the number that decided it is not the one I expected.
   *
   * `MAT.plastic` was obviously wrong the moment the SUSPECTED box came off these - its own
   * note calls it "the lightest thing in the room", and a pale featureless cube on this
   * shelf was "the single most-reported fault in this game" before the tier existed. It went
   * to `timberDark` on that argument and the frame was sampled rather than admired: crates
   * at luma 58-69, the wall behind them at 57, the floor at 54.
   *
   * So the fault was never brightness. It was CONTRAST - nine points of separation from the
   * surface behind, which is not a subtle object, it is an invisible one, and no amount of
   * hue makes a shape read against a value it matches. `MAT.dark` at #2b2724 drops them
   * cleanly below the wall, and the lids in the shelf's own light timber (see props.ts) give
   * each crate a bright band across the top. Two values, which is what reads at four metres.
   *
   * It also settles a second measurement: a crate under the bench came out at luma 117
   * against the Kestrel-3 at 112. §187 gives the eye to the brightest thing in frame and
   * that has to be the radio, not the storage.
   */
  crateRoot.add(meshOf('ShelfCrateMesh', shelf.fittings, MAT.dark));
  scene.registerProp('shelf-crates', crateRoot);

  const bench = createWorkbench();
  const benchRoot = ENGINE.SceneNode.create({ name: 'Bench', position: new THREE.Vector3(0, 0, -0.5) });
  // Worked, not fresh. The bench was measuring brighter than the set standing on it - see
  // MAT.worktop, which exists because of this frame.
  benchRoot.add(meshOf('BenchTop', bench.body, MAT.worktop));
  benchRoot.add(meshOf('BenchLegs', bench.fittings, MAT.metal));
  scene.registerProp('bench', benchRoot);

  /**
   * Mirela's task lamp, geometry rather than another unmotivated light.
   *
   * Rear-right is the only honest pocket on this top: the transmitter owns the centre,
   * Mirela's hands own the left, the screw tin owns the near-right and the removed panel
   * owns the rear-right inside edge. The weighted base sits beyond that panel with a clean
   * gap; the arm reaches back inward so the shade frames and points at the Kestrel-3 instead
   * of standing beside it like a second exhibit.
   *
   * No LightNode or emissive mesh is attached. The room already has a measured warm
   * practical; this fixture gives that source a visible cause without changing its gain,
   * colour, falloff or the hero hierarchy.
   */
  const benchLamp = createBenchLamp();
  const benchLampRoot = ENGINE.SceneNode.create({
    name: 'BenchLamp',
    position: new THREE.Vector3(0.98, 0.81, -0.78),
  });
  // Near-black enamel keeps the shade a framing silhouette under the strong practical.
  // equipmentBack was measured live and climbed almost to white on this exact normal,
  // competing with the Kestrel-3; MAT.dark retains just enough response to show the cone.
  /*
   * The SHADE and ARM do not occlude the practical they depict. They sit close under the
   * bench lamp, so once that light casts they throw their own silhouette across a third of
   * the room - see the opt-out note in art/shadows.ts. They still RECEIVE, so they are still
   * lit and still shaded like everything else; they simply stop blocking the source they
   * exist to explain.
   *
   * The BASE is not exempt, and the difference is the whole of a critic's third-round note:
   * "the lamp base still casts nothing, so the most prominent object standing in the key's
   * own light reads as sitting on the bench while the radio beside it reads as in the room".
   * The base is at bench height, far from the emitter, and casts an ordinary object-sized
   * shadow. Exempting it was collateral from exempting the prop as a whole.
   */
  const lampShade = meshOf('BenchLampEnamel', benchLamp.body, MAT.dark);
  const lampArm = meshOf('BenchLampHardware', benchLamp.fittings, MAT.metal);
  for (const part of [lampShade, lampArm]) {
    part.traverse((o) => {
      o.userData.noShadowCast = true;
    });
  }
  benchLampRoot.add(lampShade, lampArm);
  if (benchLamp.pedestal) {
    benchLampRoot.add(meshOf('BenchLampBase', benchLamp.pedestal, MAT.dark));
  }
  if (benchLamp.recesses) {
    const lampRecess = meshOf('BenchLampDark', benchLamp.recesses, MAT.slot);
    lampRecess.traverse((o) => {
      o.userData.noShadowCast = true;
    });
    benchLampRoot.add(lampRecess);
  }
  scene.registerProp('bench-lamp', benchLampRoot, { anchors: benchLamp.anchors });

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

  /**
   * Tools, and one of them is now actually a screwdriver.
   *
   * The comment here has said "screwdrivers and a spanner" since it was written and all
   * three were 16mm square bars. Somebody looking at the shot asked what the grey sticks
   * were, which is the same review the tin lid got and the same answer: a bar is a bar at
   * any value, and no amount of material work makes one a tool (§4.1, silhouette first).
   *
   * A screwdriver is two shapes and a colour change - a thin steel shaft and a fat handle
   * that is not steel - so the handle goes in its own material rather than into the merged
   * metal. That is the whole trick; the other two stay bars, because three identifiable
   * tools would be a tool shop and this is one person's bench mid-job.
   */
  const handles: THREE.BufferGeometry[] = [];
  const DRIVER = { x: 0.44, z: -0.16, angle: 0.18 };

  {
    const shaft = new THREE.CylinderGeometry(0.0055, 0.0055, 0.17, 6);
    shaft.rotateZ(Math.PI / 2);
    shaft.translate(0.055, 0, 0);
    // The tip: flattened to a blade, which is what says driver rather than rod.
    const tip = new THREE.BoxGeometry(0.028, 0.009, 0.004);
    tip.translate(0.154, 0, 0);
    const steel = mergeGeometries([shaft, tip], false) ?? shaft;
    steel.rotateY(DRIVER.angle + jitter(benchRng, 0.1));
    steel.translate(DRIVER.x, 0.824, DRIVER.z);
    clutter.push(steel);

    const grip = new THREE.CylinderGeometry(0.018, 0.015, 0.095, 8);
    grip.rotateZ(Math.PI / 2);
    grip.translate(-0.055, 0, 0);
    grip.rotateY(DRIVER.angle + jitter(benchRng, 0.1));
    grip.translate(DRIVER.x, 0.824, DRIVER.z);
    handles.push(grip);
  }

  for (const [x, z, length, angle] of [
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
  // The handle, in the one warm plastic on the bench. A screwdriver reads by its two-part
  // silhouette AND by the handle not being the colour of the shaft.
  scene.registerProp(
    'bench-tool-grip',
    meshOf('BenchToolGrip', mergeGeometries(handles, false) ?? handles[0], MAT.plastic)
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
  /*
   * Moved clear of the set. At x 0.24 the lid's 5.5cm rim reached x 0.295 while the
   * Kestrel-3 spans to 0.26 and its front face sits at z -0.33 - so the tin was cutting
   * into the radio's front right corner, and from the default shot it read as a disc
   * embedded in the case. Out to 0.34 and forward to -0.26 it sits beside the set on the
   * bench with daylight between them.
   */
  const TIN_AT = new THREE.Vector3(0.34, 0.814, -0.26);

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
  const understoreLids: THREE.BufferGeometry[] = [];
  for (const [x, w, h, d] of [
    [-0.72, 0.42, 0.26, 0.4],
    [-0.24, 0.3, 0.18, 0.34],
    [0.34, 0.46, 0.3, 0.44],
    [0.82, 0.26, 0.22, 0.3],
  ] as const) {
    const skew = jitter(benchRng, 0.18);
    const at = x + jitter(benchRng, 0.04);
    const z = -0.5 + jitter(benchRng, 0.06);

    const crate = new THREE.BoxGeometry(w, h, d);
    crate.rotateY(skew);
    crate.translate(at, 0.24 + h / 2, z);
    understore.push(crate);

    /*
     * Same two-value read as the shelf crates - see the note there for the measurement - and
     * the same `crateLid`, which is the point of it being a function.
     *
     * These four are where the z-fighting showed, because they are the crates nearest the
     * camera: the lid's top face used to land at exactly the crate's top face and the two
     * flickered against each other. The fix is in LID_RISE, in one place, for both sets.
     */
    const lid = crateLid(w, d);
    lid.rotateY(skew);
    lid.translate(at, 0.24 + h, z);
    understoreLids.push(lid);
  }
  const benchStoreRoot = ENGINE.SceneNode.create({ name: 'BenchStore', position: new THREE.Vector3() });
  benchStoreRoot.add(
    meshOf('BenchStoreCrates', mergeGeometries(understore, false) ?? understore[0], MAT.dark)
  );
  /*
   * The lids are `timberDark`, not `timber`, and the difference is a measurement.
   *
   * These four are the nearest crates to the camera and they sit under the work lamp, so
   * the same light timber that reads correctly on the shelf two metres further back came
   * out at luma 127 down here - against the Kestrel-3 at 113. §187 gives the eye to the
   * brightest thing in frame and that has to be the radio; four pale lids across the bottom
   * of the composition pull it straight down and out of the picture, which is the exact
   * fault the boxes under this bench were put here to fix in the first place.
   *
   * A step is still a step. Mid brown on near-black keeps the two-value read that makes a
   * block into a container, at a value that stays in the background where it belongs.
   */
  benchStoreRoot.add(
    meshOf('BenchStoreLids', mergeGeometries(understoreLids, false) ?? understoreLids[0], MAT.timberDark)
  );
  scene.registerProp('bench-store', benchStoreRoot);

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
        /*
         * Mid-value enamel, not a white card in the middle of the frame.
         *
         * The contact cel pass preserves this surface now instead of averaging it into the
         * bench, which exposed the old value as the brightest large shape in the opening
         * shot. That made the answer object outrank both Mirela and her request before the
         * player had even heard her. Keep enough separation for the inspection shot and the
         * rusted arrises, but seat the idle set below the human/key-light register.
         */
        color: '#505657',
        tint: '#747d7e',
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
        /*
         * The arris wear is RUST now, not rubbed paint.
         *
         * It was #bdb7a8 - a pale warm cream, 183 against a body at 110 - which is what
         * bare alloy showing through looks like, and this set has spent its winters in a
         * shop that floods. What belongs on those edges is oxide.
         *
         * So darker than the body rather than lighter, by 17, and hard warm: a red-blue
         * spread of +74 where the case sits at -3. That gap is doing the work. The two
         * read apart on hue at any light level, which matters because this object is
         * lit by one practical and the certainty law pulls the whole prop warm on top.
         */
        worn: '#84553a',
        grime: '#3a3a2e',
        seed: 'kestrel-3-shell',
        wear: 0.085,
      })
    )
  );
  setRoot.add(meshOf('SetFittings', set.fittings, MAT.metal));
  // The vents, unlit so nothing can light a hole. See MAT.slot - MAT.dark was warm to
  // begin with, the certainty law warmed it further, and the work lamp then fell on
  // geometry standing proud of the panel, which is three reasons a slit came out as a bar.
  if (set.recesses) setRoot.add(meshOf('SetVents', set.recesses, MAT.slot));
  /*
   * The inside of the case: dark, but a surface rather than a void - the corroded
   * connector needs something to be seen against.
   *
   * MAT.equipmentBack rather than MAT.dark, which came out a warm brown once the certainty
   * law had pulled the prop warm and read as a wooden back panel. equipmentBack exists for
   * precisely this - bare primed steel nobody was ever meant to see - and it is the inside
   * of the same case whose cover is propped against the bench in that material already.
   */
  if (set.chassis) setRoot.add(meshOf('SetChassis', set.chassis, MAT.equipmentBack));

  /**
   * The meter face, over the recess on the front panel.
   *
   * The recess itself is a box in MAT.metal and was reading as a brown slab - the set is
   * `inked`, so the certainty law takes everything on it warm, and a cool grey box becomes
   * a warm one. The recess is right; what was missing was a face in it. See
   * createMeterFace: card, graduations and a needle resting low, because the lamp is on and
   * nothing is coming through.
   *
   * The z matters and got it wrong first time. The recess box spans z 0.165 to 0.185, so a
   * plane at 0.177 sits INSIDE it and is drawn by nothing - the face was there and buried,
   * which looked exactly like the decal never having been applied. 0.187 is 2mm proud of
   * the box's front face.
   */
  const meter = createMeterFace();
  if (meter) {
    const meterGeo = new THREE.PlaneGeometry(0.168, 0.104);
    meterGeo.translate(-0.1144, 0.121, 0.187);
    /*
     * Unlit, for the reason MAT.slot is unlit: the work lamp is directly on this face, and
     * a lit decal under it washes out whatever is painted on it. Two lit versions of this
     * meter came out as blank panels. Glass returns a reflection rather than a diffuse
     * anyway, so an instrument face is one of the few places §4.6's "unlit is a decision"
     * genuinely applies.
     */
    setRoot.add(
      meshOf(
        'SetMeter',
        meterGeo,
        new THREE.MeshBasicMaterial({
          map: meter,
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        })
      )
    );
  }

  /*
   * A real needle over the painted face.
   *
   * The old meter baked its dead reading into the decal, so Mirela could say "the needle
   * is moving" while the instrument stayed pinned at zero. Geometry makes the final test
   * readable without replacing the deliberately low-resolution face or redrawing a canvas
   * texture every frame.
   */
  const METER_REST = 2.45;
  const METER_LIVE = 0.74;
  const meterNeedleRoot = ENGINE.SceneNode.create({
    name: 'MeterNeedle',
    position: new THREE.Vector3(-0.1144, 0.064, 0.191),
    rotation: new THREE.Euler(0, 0, METER_REST),
  });
  const needleGeo = new THREE.BoxGeometry(0.068, 0.005, 0.002);
  needleGeo.translate(0.034, 0, 0);
  meterNeedleRoot.add(
    meshOf(
      'MeterNeedleBar',
      needleGeo,
      new THREE.MeshBasicMaterial({ color: '#e8e2cf', toneMapped: false })
    )
  );
  setRoot.add(meterNeedleRoot);

  /* A carrier jewel beside the controls. Dim glass and live phosphor never share a frame. */
  const carrierGeo = new THREE.CircleGeometry(0.012, 12);
  const carrierRoot = ENGINE.SceneNode.create({
    name: 'CarrierLamp',
    position: new THREE.Vector3(0.14, 0.135, 0.188),
  });
  const carrierDim = meshOf(
    'CarrierDim',
    carrierGeo,
    new THREE.MeshBasicMaterial({ color: '#493b2e', toneMapped: false })
  );
  const carrierLive = meshOf(
    'CarrierLive',
    carrierGeo.clone(),
    new THREE.MeshBasicMaterial({ color: '#8fe39b', toneMapped: false })
  );
  carrierLive.visible = false;
  carrierRoot.add(carrierDim);
  carrierRoot.add(carrierLive);
  setRoot.add(carrierRoot);

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
    /*
     * On the floor of the bay, taken from the anchor rather than from a number.
     *
     * This was hardcoded to z -0.171 - the old rear face, back when the case was a closed
     * box. Once the back opened into a recess the stain stayed where the panel used to be
     * and hung in the air outside the set, which is what "the green rust is floating"
     * was. The anchor moves with the geometry; -0.171 never will.
     */
    // Sized to the hatch rather than to the old full-width panel - at 0.13 the stain
    // covered most of a 27cm bay and read as a mesh screen across the whole opening.
    const bloomGeo = new THREE.PlaneGeometry(0.075, 0.075);
    bloomGeo.rotateY(Math.PI);
    bloomGeo.translate(
      set.anchors.rearPanel.x,
      set.anchors.rearPanel.y,
      set.anchors.rearPanel.z - 0.001
    );
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
  // On the panel, not on the aiming point. See the `rearPanel` anchor in createTransmitter.
  const beadRoot = ENGINE.SceneNode.create({ name: 'Corrosion', position: set.anchors.rearPanel.clone() });
  for (let i = 0; i < 16; i++) {
    // Tight around the connector, thinning outward. sqrt keeps the sample area-uniform,
    // so the cluster does not end up a ring with a hole in the middle.
    const angle = range(rng, 0, Math.PI * 2);
    /*
     * Tighter, because the bay is smaller than the panel this was scattered for.
     *
     * At a 7.7cm reach the outer beads landed 7.7cm above a connector sitting 1.9cm below
     * the top of a 12cm hatch - so a third of the cluster hung off the rim in mid-air,
     * which is what "the green rust is floating" was. Crust creeps a couple of centimetres
     * from the joint it grows out of; it does not throw beads across a compartment.
     */
    const radius = 0.016 + Math.sqrt(rng()) * 0.03;
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
        /*
         * A few millimetres proud of the panel, so the beads sit ON the stain rather than
         * hovering over it. The decal is at 1mm; verdigris is a crust a couple of
         * millimetres thick, not a cloud.
         */
        /*
         * In FRONT of the chassis plate, not inside it. The plate's face is 6mm forward of
         * the anchor, so anything less than that is embedded in the metal it is supposed
         * to be growing on.
         */
        -0.009 - Math.abs(jitter(rng, 0.002))
      ),
    });
    node.add(meshOf(`BeadMesh${i}`, bead, MAT.corroded));
    beadRoot.add(node);
    beads.push(node);
  }
  setRoot.add(beadRoot);

  /**
   * Connector B travels with the set, and until now it did not.
   *
   * ## The fault
   *
   * `connector-b` is registered as its own prop so that `prop.clean:connector-b` and
   * `prop.spark:connector-b` resolve to a real place in space - and `registerProp` reparents
   * a prop to the scene root, which is why its world position is composed by hand from
   * setRoot's. That is all correct and it is also why the connector did not turn when the
   * set did: it is not a child of the set, so a 180-degree spin moved the box and left the
   * plug where it was.
   *
   * The plug sits 2cm behind the set's rear face. Every camera in this room stands on the
   * +Z side of the bench, so the set is between the lens and the connector from all three
   * registered shots - before the spin AND after it. Measured rather than guessed: from the
   * `transmitter` shot the ray enters the set's box at 1.456m and the connector is at
   * 1.846m.
   *
   * So the entire payload of mission 01 has been playing where nobody can see it. The
   * corroded disc, the sixteen beads that come off one at a time, the clean stagger, the
   * spark - all of it, behind the box, in every build. The mission still WORKS, because it
   * is carried by dialogue; it has simply never shown you the thing it is about.
   *
   * ## The fix
   *
   * The spin orbits the connector about the set's own axis by the same angle, so the plug
   * arrives where the rear panel arrives. Recomputed from the resting offset every frame
   * rather than integrated, so it is exact at any angle and self-corrects if a beat
   * interrupts a spin halfway.
   */
  /*
   * `rearPanel`, not `connectorB`, and this is the fix for a disc floating over the plug.
   *
   * The anchors' own note says it plainly: connectorB is "5cm out in the air in front of the
   * plug, which is what a camera or an effect wants to be pointed at and is the wrong place
   * to put matter". The corrosion beads were moved off it for exactly this reason and the
   * visible connector was left behind - harmlessly, because it sat on the far side of the
   * set from every camera and nobody could see where it was.
   *
   * Making the set's spin carry the connector is what exposed it. The disc came round with
   * the panel and arrived 5cm proud of it, a fat pale circle covering the socket the whole
   * mission is about. Reported from a screenshot within a day of that change.
   *
   * `connectorFace` rather than `rearPanel`, and the difference is 12mm that matters. A
   * panel-mount socket keeps its barrel behind the plate with a collar proud of it, so the
   * mouth of the shell is INSIDE the metalwork - right for the corrosion beads, which grow
   * out of the joint, and hidden for anything meant to be looked at. The face is the outside
   * of the collar. See the anchors in `createTransmitter`, which now name all three.
   */
  const CONNECTOR_REST = set.anchors.connectorFace.clone();
  const UP = new THREE.Vector3(0, 1, 0);
  /** Assigned below, once the connector prop exists. Null until then. */
  let connectorRoot: ENGINE.SceneNode | null = null;
  const carryConnector = (angle: number): void => {
    if (!connectorRoot) return;
    connectorRoot.position.copy(
      setRoot.position.clone().add(CONNECTOR_REST.clone().applyAxisAngle(UP, angle))
    );
    connectorRoot.rotation.set(0, angle, 0);
  };

  scene.registerProp('transmitter', setRoot, {
    // Inked: Mirela's set - the thing on the bench that stopped working.
    inked: true,
    anchors: set.anchors,
    actions: {
      /** Mirela turns the set round so the camera can see the connectors. */
      'rotate-rear': (tweener, node) => {
        const from = node.rotation.y;
        const to = Math.PI;
        tweener.add(
          (t) => {
            const angle = from + (to - from) * t;
            node.rotation.set(node.rotation.x, angle, node.rotation.z);
            carryConnector(angle);
          },
          { duration: 1.1, easing: Ease.outCubic, channel: 'transmitter-spin' }
        );
      },
      'rotate-front': (tweener, node) => {
        const from = node.rotation.y;
        tweener.add(
          (t) => {
            const angle = from * (1 - t);
            node.rotation.set(node.rotation.x, angle, node.rotation.z);
            carryConnector(angle);
          },
          { duration: 1.1, easing: Ease.outCubic, channel: 'transmitter-spin' }
        );
      },
      /** Face the repaired instrument toward the link, acquire carrier, then let it live. */
      restore: (tweener, node) => {
        const from = node.rotation.y;
        tweener.add(
          (t) => {
            const angle = from * (1 - t);
            node.rotation.set(node.rotation.x, angle, node.rotation.z);
            carryConnector(angle);
          },
          { duration: 1.05, easing: Ease.outCubic, channel: 'transmitter-spin' }
        );
        tweener.add(
          (t) => {
            const acquire = Ease.outBack(t);
            const flutter = Math.sin(t * Math.PI * 7) * 0.08 * (1 - t);
            meterNeedleRoot.rotation.z = METER_REST + (METER_LIVE - METER_REST) * acquire + flutter;
          },
          {
            duration: 1.3,
            delay: 0.78,
            easing: Ease.linear,
            channel: 'transmitter-meter',
            onComplete: () => {
              meterNeedleRoot.rotation.z = METER_LIVE;
              carrierDim.visible = false;
              carrierLive.visible = true;
            },
          }
        );
        tweener.add(() => undefined, {
          duration: 0.01,
          delay: 1.02,
          channel: 'transmitter-carrier-lamp',
          onComplete: () => {
            carrierDim.visible = false;
            carrierLive.visible = true;
          },
        });
      },
    },
  });

  // Connector B as its own addressable sub-object, so `prop.clean:connector-b` and
  // `prop.spark:connector-b` resolve to a real place in space.
  /*
   * Sized to the socket it is the face of, not to a guess.
   *
   * `socket(width * 0.16, 0.032, 0.06)` builds the real connector in the transmitter's own
   * geometry: a 32mm shell with a 39mm collar round its mouth. This disc was 36mm by 20mm
   * deep, which is not a connector face - it is a second connector, fatter than the one
   * underneath and standing in front of it. 31mm sits just inside the shell's mouth, and
   * 8mm deep reads as the end of a plug rather than as a puck.
   */
  const connectorGeo = new THREE.CylinderGeometry(0.031, 0.031, 0.008, 10);
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
  connectorRoot = ENGINE.SceneNode.create({
    name: 'ConnectorBRoot',
    // Same anchor the spin uses - see CONNECTOR_REST for why it is not `connectorB`.
    position: setRoot.position.clone().add(CONNECTOR_REST),
  });
  connectorRoot.add(connectorMesh);

  scene.registerProp('connector-b', connectorRoot, {
    anchors: { default: new THREE.Vector3(0, 0, -0.02) },
    actions: {
      /**
       * She has just described the crust, so the machine can draw it.
       *
       * This is the certainty system's ONE teaching moment in the whole game, and until now
       * it did not happen anywhere a player could see. The tier below SHAPED replaces a prop
       * with a breathing box - the machine's guess at the volume - and the sweep that opens
       * that box is what explains every other box in every other room. Mission 01's only
       * promotion out of SUSPECTED was the mains switch, which projects to screen x 0.984:
       * behind the console panel, off-frame, every time.
       *
       * Here it lands on the object the request is about, in the push-in, at the moment she
       * says there is green crust across the pins - the machine hearing something and
       * resolving it, in one gesture, with no tutorial text anywhere.
       *
       * DESCRIBED rather than KNOWN, because that is exactly what has happened: she has
       * described it. `revealOn(FACT_CONNECTOR_CORROSION)` takes it the rest of the way when
       * the player acts on it, which is the difference between hearing and understanding.
       */
      reveal: () => {
        scene.setCertainty('connector-b', CERTAINTY.DESCRIBED);
      },
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
      /**
       * Arc: a hard flinch. The VFX itself is fired by the caller at this anchor.
       *
       * And now the person flinches too. The spark fires on the mission's worst branch -
       * the player telling her to clean a live connector - and until there were gestures
       * nobody reacted to it: a woman takes a belt off a set she is holding and carries on
       * breathing at exactly the rate she was before.
       *
       * Fired here rather than from the mission because a transition carries ONE
       * environment cue and that slot is already spent on the spark. It belongs here on
       * merit as well: the spark and the flinch are not two things a beat schedules
       * together, they are one event seen from two sides, and nothing should be able to
       * fire one without the other.
       */
      spark: (tweener, node) => {
        const baseZ = node.position.z;
        tweener.add((t) => node.position.setZ(baseZ - Math.sin(t * Math.PI) * 0.03), {
          duration: 0.35,
          easing: Ease.linear,
          channel: 'connector-spark',
        });
        scene.applyCue('prop.surprised:contact');
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
  const mirela = addContact(scene, 'Mirela', {
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
    /*
     * Moved back 0.12 with her - see the position below - so the solved pose is
     * untouched and only where she stands has changed.
     */
    handsOn: {
      left: new THREE.Vector3(-0.36, 0.79, -0.84),
      right: new THREE.Vector3(-0.44, 0.79, -1.22),
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
    /*
     * NOTE, unresolved: the coolness this note asks for is not surviving the work lamp.
     *
     * Contacts were falling through to the SHAPED certainty default, so the law was
     * draining them 26% and pulling them a quarter of the way toward cyan - and on this
     * coat that accident happened to be doing the job the authored colour is supposed to
     * do. Graded honestly at the neutral point (see describeContact), her skin and apron
     * come out true to what is written here, and the coat measures r-b +5 against an
     * authored -26: warm, where the whole point of it is to be the one cool mass.
     *
     * Deepening the blue to #3a5570 was tried and could not be confirmed either way - the
     * idle animation moves her between captures, so a 1% frame difference is as consistent
     * with breathing as with a recolour, and no sample box on her torso moved. Reverted
     * rather than left in on a guess, because this is an authored character decision and
     * an unverifiable edit to one is worse than a known fault.
     *
     * The fault is real and worth returning to with a still pose or a wider sample.
     */
    colors: {
      garment: '#42525c',
      underlayer: '#c2b79c',
    },
    /*
     * Back 0.12, off the bench.
     *
     * She stood at z -1.02 and the bench top runs from -0.95 to -0.05, so her centre
     * cleared the far edge by 7cm and the front of her did not: a torso is about
     * 16cm deep, which put her front surface a hand's width inside the top, at the
     * height her hips are. Reported as being inside the table.
     *
     * The hand targets moved by the same 0.12 so the pose she is solved into is
     * exactly the pose she had - the left hand is still flat on the bench behind the
     * set, clear of the transmitter's x span, and nothing about the arms changes.
     */
    position: new THREE.Vector3(-0.72, 0, -1.14),
    /**
     * Turned toward the set, which she was not.
     *
     * Asked directly - is she supposed to be facing right instead of the radio? She was.
     * She stands at (-0.72, -1.02) and the Kestrel-3 sits at (0, -0.5), so the bearing to
     * it is 54 degrees; her yaw was 0.58π, which is 104. Fifty degrees past it, looking out
     * of the shot over the thing she is describing.
     *
     * Not taken all the way to 54. Her hands are IK'd to two points on the bench either
     * side of the set, and swinging her fully square to it turns those into a reach across
     * her own body; 0.40π lands at 72 degrees, which reads as somebody looking down at
     * their work while still angled to the room. The remaining 18 degrees is the difference
     * between attending to something and staring at it.
     */
    rotation: new THREE.Euler(0, Math.PI * 0.4, 0),
  });

  // A work lamp over the bench. §187: one key plus controlled practicals - and a
  // practical here is motivated, because this is where she has been working. Without it
  // the diorama has only the distant key and reads as a room at night with the lights
  // off, which is not the same thing as atmospheric.
  /*
   * ## The room's shadow-casting key, second choice
   *
   * The first attempt put this on FaceKey, and a critic measured the result and threw it
   * out: "the radio's face, its top, and the benchtop under and around it are identical to
   * within a hundredth of a level, so it still floats on the bench exactly as before". It was
   * right, and the reason is geometric rather than a matter of strength. FaceKey is a 0.42
   * radian cone aimed at her face from 1.2m. Its shadow can only ever land on the wall behind
   * her. It never reaches the bench, so it can never make anything sit ON the bench, which is
   * the entire point of §5's "one shadow-casting key per room".
   *
   * The bench practical is the light that can. It hangs 0.55m above the bench top, directly
   * over the objects the player is being asked to believe are resting there, and it is the
   * motivated source - there is a desk lamp in frame.
   *
   * It costs a cube map rather than a single one, six renders instead of one, and that is the
   * trade being made deliberately: the cheap light casts a shadow nobody can see and the
   * expensive one casts the shadow the item exists for. A diorama is a small set with a
   * handful of objects, which is where a point-light shadow is affordable and a warehouse is
   * where it is not.
   */
  const workLamp = ENGINE.PointLightNode.create({
    name: 'WorkLamp',
    position: new THREE.Vector3(0.25, 1.55, -0.15),
    intensity: 3.8,
    color: new THREE.Color(LIGHT.key),
    distance: 5.5,
    decay: 1.5,
  });
  castShadows(workLamp as unknown as THREE.Object3D, {
    mapSize: 1024,
    radius: 2.5,
    normalBias: 0.02,
    bias: -0.0005,
  });
  scene.registerProp('work-lamp', workLamp);

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
      intensity: 2.6,
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
  const faceKey = ENGINE.SpotLightNode.create({
      name: 'FaceKey',
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
      intensity: 8.5,
      color: new THREE.Color('#cfd8e4'),
      distance: 3.2,
      decay: 1.4,
      angle: 0.42,
      penumbra: 0.72,
    });
  faceKey.lookAt(new THREE.Vector3(-0.72, 1.46, -1.14));
  scene.registerProp('face-fill', faceKey);

  scene.registerProp(
    'bench-bounce',
    ENGINE.PointLightNode.create({
      name: 'BenchBounce',
      // Just above the bench top and in front of the set, so it throws up onto the radio's
      // face and onto hers rather than washing the wall behind them.
      position: new THREE.Vector3(0.1, 0.98, 0.45),
      intensity: 0.8,
      color: new THREE.Color('#ffd9ae'),
      distance: 2.6,
      decay: 1.6,
    })
  );


  /**
   * The wall, a year after the water went down - see art/floodstain.
   *
   * Mirela's shop takes it every spring and she has lived with it - heavy, but a wall
   * somebody still works against rather than one that has been given up on.
   *
   * A finisher, not a build step, for the reason every material change in this project
   * has to be: MeshNode finishes its material load asynchronously, so anything assigned
   * during the build is quietly replaced by a load that was already in flight.
   */
  scene.registerFinisher(() => {
    const wall = scene.nodeFor('wall');
    if (!wall) return;
    const stained = applyFloodstain(wall as unknown as THREE.Object3D, 0.26, 0.85);
    if (!stained) console.warn('[scene] flood staining touched nothing on the wall');
  });

  scene.registerShot('default', {
    // Target raised to chest height rather than bench height, so she is in the frame
    // instead of cropped at the shoulders by a camera aimed at the furniture.
    position: new THREE.Vector3(1.32, 1.46, 1.82),
    target: new THREE.Vector3(-0.34, 1.06, -0.72),
  });

  /*
   * ----------------------------------------------------------------- she checks the wire
   *
   * The one moment in this game where the picture stops behaving like a window.
   *
   * She knocks the bench getting up, the whole frame lurches off level, she walks out of
   * shot to follow the supply cable, and while she is gone OMNISCIENT_ quietly rolls its own
   * horizon back to straight. Then she comes back.
   *
   * Three things are being said at once and none of them is said in dialogue:
   *
   *  - The view is a DEVICE IN HER ROOM, not a camera the game owns. It moved because she
   *    moved something. Nothing else in the project establishes that, and mission 08's
   *    ending - first person through a driver's own glasses - depends on the player having
   *    accepted it hours earlier.
   *  - The machine can correct its own picture and nothing else. It cannot stop her leaving,
   *    cannot follow her, cannot ask her to come back. It levels the horizon, which is the
   *    only thing in the world it is able to touch. §157, shown rather than stated.
   *  - She is a person with something to do, and the player's question sent her to do it.
   *
   * FIRED BY THE WIRE QUESTION, never by a timer. That distinction is the whole design: a
   * timed interruption is dead air in a tutorial, and the same seconds arriving as the
   * consequence of a deduction are a reward. It also means it cannot land before the player
   * has any agency - their first impression of the contact view must not be that it is
   * unreliable, or they will distrust the picture for nine missions.
   *
   * The tilt rolls the SCENE rather than the camera, about the default shot's own view axis,
   * which is identical on screen and keeps the whole beat inside this room. Deriving the
   * axis from the registered shot rather than writing it down means moving that shot moves
   * this with it.
   */
  const link = ENGINE.SceneNode.create({ name: 'LinkBeat', position: new THREE.Vector3() });
  scene.add(link);
  const shot = scene.getShot('default');
  const viewAxis = shot
    ? shot.target.clone().sub(shot.position).normalize()
    : new THREE.Vector3(0, 0, -1);

  /**
   * The whole roll as ONE tween, and that is a bug fix rather than a tidy-up.
   *
   * It was two - a knock and a correction, scheduled together on the same channel. `add()`
   * removes existing tweens on a channel before pushing, so the second call deleted the
   * first the instant it was made. The knock never ran at all: what played was the
   * correction, snapping the scene to full tilt at 2.3s and easing it back. Reported
   * exactly, twice, as the camera tilting after she had already started walking.
   *
   * Shaped inside a linear tween rather than split into three, because the shape IS the
   * event: a knock, a hold while she is away, and a slow settle. Three tweens would be
   * three chances to make the same mistake.
   */
  const TILT = 0.105;
  const KNOCK = 0.24;
  /*
   * Long enough that she is gone before it starts.
   *
   * She leaves 0.55 after the knock and covers 1.62m at 0.7 of the walk clip's 1.66 m/s -
   * 1.16 m/s. With the walk now easing off the spot and down again at the far end that is
   * about 1.75s of travel, and she crosses the panel edge around 1.5s into it - so she is
   * gone about 2.05s after the knock. Straightening before that would be the machine
   * reacting to her rather than tidying up in her absence, which is the whole reading.
   *
   * This number is downstream of her pace and has to move with it. Slowing her walk without
   * moving this is how the horizon ends up straightening over her shoulder.
   */
  const HOLD_UNTIL = 2.4;
  const SETTLE = 1.3;

  const rollBeat = (tweener: Tweener, delay: number): void => {
    const total = HOLD_UNTIL + SETTLE;
    tweener.add(
      (t) => {
        const at = t * total;
        const angle =
          at < KNOCK
            ? // Fast, because an impact is fast. Anything slower reads as drift, which is a
              // fault rather than an event.
              TILT * Ease.outCubic(at / KNOCK)
            : at < HOLD_UNTIL
              ? TILT
              : // Slow, and entirely while she is behind the panel. A machine levelling a
                // horizon is maintaining rather than reacting.
                TILT * (1 - Ease.inOutCubic((at - HOLD_UNTIL) / SETTLE));
        scene.quaternion.setFromAxisAngle(viewAxis, angle);
      },
      { duration: total, delay, easing: Ease.linear, channel: 'link-roll' }
    );
  };

  scene.registerProp('link', link, {
    actions: {
      /*
       * `prop.check:link-wire` - see mission-01-transmitter.ts, on the supply-wire beat.
       *
       * Timings, and why each is what it is. The knock is FAST (0.28s) because an impact is
       * fast and anything slower reads as the camera drifting, which is a fault rather than
       * an event. The correction is SLOW (1.4s) and starts while she is still away, because
       * a machine levelling a horizon is not reacting, it is maintaining - and because the
       * player should notice it happening rather than see it already done. The gap in the
       * middle is deliberately uncomfortable: about a second of an empty bench, which is the
       * part that makes the shot feel observed rather than composed.
       */
      'check-wire': (tweener) => {
        /*
         * Everything waits 0.9s, because she POINTS first.
         *
         * The same transition fires `prop.point:contact` - she answers where the wire goes
         * from where she is standing, and only then goes to look at it. Starting the walk on
         * the same frame as the point would cancel the gesture and lose the half-second that
         * makes this her decision rather than a scripted exit.
         */
        const AFTER_POINT = 0.9;
        /*
         * The KNOCK COMES FIRST, and this is the correction that makes the beat read.
         *
         * The knock and the walk were on the same delay, which meant the picture lurched
         * while she was already crossing the room - reported as the tilt happening after she
         * starts walking, which does not make sense. It does not: a bench does not get
         * knocked by somebody who has finished leaving. She has to shove off it, THEN go.
         *
         * A quarter second between them. Long enough that the causality is unmistakable,
         * short enough that it is one movement rather than two events.
         */
        rollBeat(tweener, AFTER_POINT);
        /*
         * Out past the doorway and back, with a beat at the far end.
         *
         * `back` returns her to the pose and heading she started in, so the bench she was
         * leaning over is undisturbed when the conversation resumes - a contact who came
         * back standing slightly wrong would cost more than this beat buys. The dwell is
         * what she is doing out there; without it she touches the far mark and pivots, which
         * reads as pacing rather than as checking something.
         */
        tweener.add(() => undefined, {
          duration: 0.01,
          /*
           * Half a second after the knock, not a quarter.
           *
           * A quarter was enough for the engine to run them in the right order and not
           * enough for a viewer to SEE the order. The knock takes 0.24s just to reach full
           * tilt, so at 0.25 she was leaving on the frame it arrived and the two still read
           * as one event. This gives the picture a beat to be visibly crooked before
           * anything else moves, which is what makes her the cause of it.
           */
          delay: AFTER_POINT + 0.55,
          channel: 'link-walk',
          onComplete: () => {
            /*
             * She walks forward, and the CONSOLE PANEL is what she walks behind.
             *
             * There is nowhere in this room to exit to - the floor is eight by six and every
             * edge of it is off the world - so the two earlier attempts both failed on the
             * same problem. Going left put her beside the lens, cropped at the waist. Going
             * back left her small and visible the whole time, which is not an exit at all.
             *
             * The panel is the wing. It covers the right third of the screen permanently, so
             * a person who walks behind it is genuinely gone, and gone in a way that says
             * something: the machine's own interface is what stops it seeing her. That is
             * the most this beat has ever meant and it costs nothing but a heading.
             *
             * STRAIGHT RIGHT, AT HER OWN DEPTH, because the bench is the real constraint.
             *
             * createWorkbench is 2.4 by 0.9 at a root of (0, 0, -0.5), so it occupies x
             * -1.2..1.2 and z -0.95..-0.05. She stands at z -1.14, nineteen centimetres
             * behind its back edge. The previous target gained half a metre of z on the way
             * across, which walked her straight through the tabletop - `walk` is a straight
             * line and does not know the furniture is there.
             *
             * Holding her own z keeps her behind it for the whole crossing, and x 0.9 is
             * where scripts/dev/aim.ts says the panel covers her: screen 0.81 with a body
             * half-width of 0.06, against a panel edge at 0.645. Hidden with margin rather
             * than clipping the edge, which would read as a rendering fault rather than as
             * staging. 2.7m of depth there against 3.55 where she stands, so she is barely
             * closer than she started - hidden long before she could loom.
             */
            /*
             * 0.7 pace - unhurried, because she is not.
             *
             * She has been leaning over this bench all morning and somebody has just asked
             * where a wire goes. Nothing about that is urgent, and the clip's own measured
             * speed is a brisk 1.66 m/s, which read as somebody with somewhere to be.
             * `pace` scales the animation and the travel together so the planted foot stays
             * planted - see WalkOptions.
             */
            mirela?.walk(new THREE.Vector3(0.9, 0, -1.14), {
              back: true,
              dwell: 1.4,
              pace: 0.7,
            });
          },
        });
      },
    },
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
  /**
   * The flood evidence - and it has never been in this shot.
   *
   * `ASK_HISTORY` fires `camera.pan:workshop-floor` so that when she says the floor goes
   * under a hand's depth every spring, the room can show you it is true. What the camera
   * actually framed was the underside of the bench: from (1.2, 0.75, 1.6) toward (-0.6,
   * 0.15, -0.8) the sightline passes straight through the workbench, which spans x -1.2 to
   * 1.2 and z -0.95 to -0.05 and stands exactly between that lens and the wall.
   *
   * So the answer to "where is the water" was: behind the bench, at 19 and 26cm, correctly
   * built and never once visible. Asked about, which is the only review a prop gets.
   *
   * Swung left to look PAST the bench end at the corner where the tide marks meet the
   * shelf - the two bands on the wall and the two soaked posts on the shelf legs are all in
   * that corner, which is why it is the one to aim at. Checked rather than eyeballed: at
   * the bench's near face the sightline is at x -1.37, clear of its -1.2 edge.
   */
  scene.registerShot('workshop-floor', {
    /*
     * Closer and lower, once the reframe was checked on screen. At 2.9 units back the
     * evidence was two small posts in the upper third and the lower sixty per cent of the
     * frame was bare floor - the camera was pointed at the right corner and still mostly
     * showing nothing. 1.8 units puts the soaked posts across the middle of the shot.
     *
     * The wall bands are not in this view and cannot be: the shelf stands at z -1.6 to
     * -1.2 directly in front of the wall at -1.815. The posts on its legs ARE the evidence
     * from this angle, which is why they got the silt crust too.
     */
    position: new THREE.Vector3(-1.45, 0.6, 0.25),
    target: new THREE.Vector3(-2.15, 0.24, -1.35),
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
    /*
     * The left wall's fittings, all SHAPED and none SUSPECTED.
     *
     * A workshop has a light, a machine and some tins in it - that is inferable from the
     * one word she has said about where she is, which is exactly what this tier means. The
     * cold tier is reserved for things whose EXISTENCE is a guess, and it is why the crates
     * on the shelf are pale boxes. Putting these there would have the machine doubting that
     * the room has lighting, and would also drop three pale volumes into the darkest corner
     * of the frame, where the flood evidence needs to be the thing that reads.
     *
     * `batten-tube` is in this list for completeness and does nothing: it is a
     * MeshBasicMaterial and applyCertainty skips it, which is how a lit lamp stays lit.
     */
    ['batten', CERTAINTY.SHAPED],
    ['batten-tube', CERTAINTY.SHAPED],
    ['compressor', CERTAINTY.SHAPED],
    ['cable-coil', CERTAINTY.SHAPED],
    ['tins', CERTAINTY.SHAPED],
    /*
     * The shelf and its boxes, and the rule that took a year to state.
     *
     * These were SUSPECTED - drawn as the machine's guess at a volume rather than as boxes -
     * on the argument that nobody has said what is in them. The argument is true and the
     * tier was still wrong, because SUSPECTED does not mean "contents unknown". It means NOT
     * RESOLVED YET, and the word carrying it is "yet": the whole tier is a promise that the
     * box opens when somebody says what is in it.
     *
     * Nothing in this game ever says what is in Mirela's crates. There is no `revealOn` for
     * them on any branch of any mission, so those boxes could never open - and they sit in
     * the middle of the first room every player sees, for the whole tutorial call.
     *
     * That is worse than clutter. A player who watches a box do nothing for five minutes
     * concludes that boxes are what this game looks like, and then the one that DOES open
     * reads as an effect rather than as an answer. The tier spends its meaning before it
     * gets to say anything. Reported exactly that way, by the person who designed it,
     * looking at a screenshot of his own game: "what are these translucent boxes?"
     *
     * So the rule is now: SUSPECTED only where something can promote it.
     * `scripts/certainty-tiers.ts` enforces it. Three other props in the game failed the
     * same test and have moved with these.
     *
     * The boxes are still nobody's business, and the room still says so - it says it with
     * closed crates, which is what a closed crate has always meant.
     */
    ['shelf', CERTAINTY.SHAPED],
    ['shelf-crates', CERTAINTY.SHAPED],
    ['bench-store', CERTAINTY.SHAPED],
    // She never described her bench. She described what is standing on it, and the bench
    // being the brightest mass in frame was the reason the radio lost the eye to it.
    ['bench', CERTAINTY.SHAPED],
    ['bench-lamp', CERTAINTY.SHAPED],
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
    /*
     * SUSPECTED, one rung lower than it was, and this is the change that makes the tier
     * legible anywhere in the game.
     *
     * The old note is still right about the direction: these "used to open at DESCRIBED,
     * which is the state they should REACH", and starting them there made the room as warm
     * on the first frame as it would ever get. It went to SHAPED. SHAPED renders the prop -
     * flat and cold, but the prop - so nothing ever showed a player what the box tier means,
     * and the crates on the shelf sat unexplained for a whole call.
     *
     * At SUSPECTED the connector is a small breathing volume instead, and it costs the
     * opening frame nothing: it sits behind the set and is not visible until she turns the
     * thing round. Then it is on screen, in the push-in, and the `reveal` action sweeps it
     * open the moment she says what is on the pins. See that action for the argument.
     */
    ['connector-b', CERTAINTY.SUSPECTED],
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
  /**
   * How much of the workstation's afternoon reaches a clifftop at night.
   *
   * This was the only room in the game that never set it, and the default is 1 - so on top
   * of a moon, a night sky, a sea glow, a face fill and the beacon itself, the mast was also
   * taking the rig's full directional key and its full hemisphere. Every other scene has a
   * considered value: the shop 0.55, the mill road 0.85, the cellar 0.3, the tunnel 0.22,
   * Dorin's door 0.14. The note at the top of `buildNightDoor` describes this exact fault and
   * names six scenes that had it. Five were fixed. This is the sixth.
   *
   * What it costs is not brightness, it is CONTRAST. The sky term is an ambient with no
   * direction, and at 1.35 it lifts every shadow to about the value of every lit surface.
   * Measured off a capture, the diorama half of the puzzle shot used 46 of 255 values -
   * quartiles at 7.5 and 20, and a 98th percentile of 47, so there was no highlight anywhere
   * in the frame. The workstation the player returns to uses 175.
   *
   * 0.2 rather than the door's 0.14 because there IS a moon here and a lit beacon, and
   * because the headland's own hemisphere is already doing the job the rig's would do badly.
   * The beacon and moon below are raised to take back the light this removes, so the change
   * is a redistribution rather than a dimming: the same amount of light, arriving from
   * somewhere, instead of from everywhere.
   */
  scene.daylight = 0.2;

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
   * Stars, and Tomas's own evidence asks for them.
   *
   * His weather hint is "Clear sky all day. No storm, no wind, no spray off the sea" -
   * the player is being told to rule the weather out, and the cheapest way to make that
   * land is a sky they can see is clear. The skylight below has carried a note since it
   * was written about "the difference between a night with stars in it and a black hole
   * with objects in it", and until now there were no stars anywhere in the game.
   *
   * It is also most of this frame. A headland at sea level with a mast up the middle
   * leaves the top two thirds to the sky, and that sky was a painted gradient with
   * nothing in it.
   *
   * Radius 44, inside the backdrop's SKY_RADIUS of 52, because the sky here is a painted
   * canvas rather than an absence - a dome outside it would be behind an opaque surface
   * and draw nothing at all.
   *
   * The floor is 0.10 rather than 0 so nothing is drawn below about the height of the
   * default camera. Stars in the sea are worse than no stars.
   */
  scene.registerProp(
    'stars',
    (() => {
      const node = ENGINE.SceneNode.create({ name: 'Stars', position: new THREE.Vector3() });
      node.add(createStarfield({ radius: 44, count: 1100, floor: 0.1, seed: 'portu-vech-night' }));
      return node;
    })()
  );

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

  /**
   * Brighter, and reaching further, because the fault was two luminance values deep.
   *
   * Measured off a capture: during the puzzle the diorama's mean swings 15.7 to 13.6 on an
   * eleven second period, autocorrelation r = 0.664 with the peak exactly on 11.0s. So the
   * drop was working perfectly and was 2.2 values deep on a 255 scale, which nobody notices.
   *
   * At intensity 9 over a 9m range the lamp is one of five sources in the scene and owns
   * about a seventh of what is in frame at the platform. The other four do not go out, so
   * what the player was being shown when the light failed was a fourteen per cent dip.
   *
   * Raised rather than the others lowered, and the direction matters. Trimming the moon, the
   * sea glow or the face fill would deepen the dark phase - and those three exist because the
   * dark phase was once genuinely unreadable, which is a worse fault than an undersold one.
   * Raising the lamp widens the same gap from the top: the lit phase gets brighter, the dark
   * phase is untouched, and the difference between them is what the mission is about.
   *
   * 15 over 14 metres puts the beacon clearly in charge of the structure it stands on, which
   * is also just true of a harbour light.
   */
  const glow = ENGINE.PointLightNode.create({
    name: 'BeaconGlow',
    position: new THREE.Vector3(0, beaconY + 0.08, 0),
    intensity: 15,
    color: new THREE.Color(ACCENT.amber),
    distance: 14,
    decay: 1.3,
  });
  beaconRoot.add(glow);

  /**
   * The bloom around the lens.
   *
   * A harbour light at night is not a lit cylinder, it is a lit cylinder inside visible air,
   * and the difference between those two pictures is most of why the payoff shot read as a
   * yellow bucket on a stool. This is the cheapest available fix by a distance: two
   * transparent shells, no texture, no billboarding, no per-frame work.
   *
   * Spheres rather than a camera-facing quad on purpose. A sprite would be sharper and would
   * need either `THREE.Sprite` - which nothing else in this project uses, so nothing proves
   * the pixel pass and the post chain handle it - or per-frame orientation code that the prop
   * idle has no camera reference to do. A sphere looks the same from every angle by
   * construction, which is exactly what a bloom should do.
   *
   * Spheres came out, and it took two attempts to learn why.
   *
   * TOMAS-REVIEW flagged the halo as the thing a harness could not judge - bloom or ball? On
   * screen it was unmistakably a ball: two shells at uniform alpha gave two hard concentric
   * circles, because a sphere has a silhouette however faint it is and additive blending on a
   * night sky renders that edge perfectly legible.
   *
   * The obvious repair is to subdivide - more shells, less alpha each, until the steps blur.
   * Nine were tried, at about 0.05 of alpha per step, and it was WORSE: nine hard edges read
   * as concentric rings, a dartboard rather than a lamp. No number of hard edges adds up to a
   * soft one. The falloff has to live inside the primitive.
   *
   * So it is two camera-facing quads carrying a radial alpha ramp that reaches exactly zero at
   * the rim - see art/glow.ts, which also explains why this needs no `THREE.Sprite` and no
   * camera reference in the prop idle. `depthWrite: false` so they never occlude each other or
   * the lens inside them.
   */
  const halo: ENGINE.MeshNode[] = [];
  const haloThresholds: number[] = [];
  for (const [size, opacity, threshold] of [
    [1.5, 0.52, 0.18],
    [3.0, 0.3, 0.34],
  ] as const) {
    const quad = new THREE.PlaneGeometry(size, size);
    quad.translate(0, beaconY + 0.08, 0);
    const node = meshOf('BeaconHalo', quad, glowMaterial('#ffcf7a', opacity));
    billboard(node);
    halo.push(node);
    haloThresholds.push(threshold);
  }
  for (const shell of halo) beaconRoot.add(shell);

  /*
   * A rotating beam, kept barely visible until it crosses mist or structure.
   *
   * The point light establishes illumination but cannot describe a harbour beacon's one
   * defining movement. This low-opacity cone supplies that movement without painting the
   * whole sky amber or introducing a full volumetric pass. Its pivot is the lens, so the
   * rotation remains mechanically believable from every authored shot.
   */
  const sweepRoot = ENGINE.SceneNode.create({
    name: 'BeaconSweep',
    position: new THREE.Vector3(0, beaconY + 0.08, 0),
  });
  const beamGeometry = new THREE.ConeGeometry(0.72, 8, 12, 1, true);
  beamGeometry.rotateZ(Math.PI / 2);
  beamGeometry.translate(4, 0, 0);
  const beam = new THREE.Mesh(
    beamGeometry,
    new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ffd27a'),
      transparent: true,
      opacity: 0.035,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    })
  );
  beam.name = 'BeaconBeam';
  sweepRoot.add(beam);
  beaconRoot.add(sweepRoot);

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
  let beaconSteady = false;
  scene.registerProp('beacon', beaconRoot, {
    // Inked: The beacon head. It is going out and coming back the whole time.
    inked: true,
    anchors: { default: new THREE.Vector3(0, beaconY, 0) },
    idle: (deltaTime) => {
      beaconClock = (beaconClock + deltaTime) % 11;
      sweepRoot.rotation.y += deltaTime * 0.72;
      // Out for three and a half seconds in every eleven, hard on and hard off: a feed
      // being pulled down collapses, it does not fade.
      const flash = getAccessibilityPreferences().flashIntensity;
      const dropout = !beaconSteady && beaconClock > 7.5;
      let strength = dropout ? (flash === 'reduced' ? 0.3 : 0) : 1;
      if (flash === 'off' && !beaconSteady) {
        // Keep the fault visible without a sudden full-frame luminance edge. It falls and
        // recovers over a second, then holds at a readable quarter-output floor.
        if (beaconClock < 6.5) strength = 1;
        else if (beaconClock < 7.5) {
          strength = 1 - THREE.MathUtils.smoothstep(beaconClock, 6.5, 7.5) * 0.75;
        } else if (beaconClock < 9.8) strength = 0.25;
        else {
          strength = 0.25 + THREE.MathUtils.smoothstep(beaconClock, 9.8, 11) * 0.75;
        }
      }
      const dark = strength < 0.48;
      lens.material = dark ? MAT.beaconDark : MAT.beaconLit;
      glow.intensity = 15 * strength;
      // The bloom goes with it. A glow left hanging round a dead lens is the single most
      // obvious way for this whole effect to look like a bug.
      for (const [index, shell] of halo.entries()) {
        shell.visible = strength > (haloThresholds[index] ?? 0.42);
      }
      sweepRoot.visible = strength > 0.42;
    },
    actions: {
      /** Steady again, once the two sets are separated. */
      steady: () => {
        beaconSteady = true;
        beaconClock = 0;
        /*
         * The room reacts to its own resolution.
         *
         * TOMAS-REVIEW: the payoff had the beacon relighting, a cue and a held shot, and a bed
         * that carried on exactly as it had through the diagnosis. A place that does not
         * change when the thing it is about comes good says the thing did not matter.
         */
        roomToneSwell();
        lens.material = MAT.beaconLit;
        glow.intensity = 18;
        for (const shell of halo) shell.visible = true;
        sweepRoot.visible = true;
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
      /*
       * z 0.94, not 0.75. The handrail runs along z 0.94 at y 3.07, and the height
       * and the x were already right - the hand was simply 19cm short of it, holding
       * a rail that was not there. Reported as his hand not being on anything.
       *
       * 0.925 rather than 0.94 so the palm meets the near face of a 45mm rail rather
       * than floating at its centre line.
       */
      right: new THREE.Vector3(0.85, 3.07, 0.925),
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
  /*
   * ## This room's shadow-casting key (D-4)
   *
   * The moon, and it is the easy case after the repair shop's four rounds. The two rules
   * that came out of that one both pass here without any work: it REACHES the surface things
   * rest on - it is already aimed at the deck, which is where the mast, the crates and she
   * all stand - and there is no fixture near it to occlude itself, because the caster is
   * ninety metres away and outside the set.
   *
   * A directional needs one map rather than a point light's cube, so this is the cheapest
   * shadow in the game as well as the most motivated: a low moon behind the mast is what
   * gives a lattice tower its shadow down a deck, and that shadow is most of what says the
   * tower is standing ON something.
   *
   * extent 16 rather than the 24 default. The whole budget of a directional map is spent
   * across that box, so it wants to be the smallest one containing everything that casts;
   * the deck and the outcrops fit inside 16 and the extra eight metres would have quartered
   * the resolution for empty sea. normalBias is high because the moon rakes in at a glancing
   * angle, which is the worst case for acne on flat-shaded geometry.
   */
  castShadows(moonLight as unknown as THREE.Object3D, {
    extent: 16,
    mapSize: 2048,
    radius: 2.5,
    normalBias: 0.045,
  });
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
  const seaGlow = ENGINE.PointLightNode.create({
    name: 'SeaGlow',
    position: new THREE.Vector3(3.6, 1.4, -3.2),
    intensity: 11,
    color: new THREE.Color('#5f7f9e'),
    distance: 24,
    decay: 1.0,
  });
  scene.registerProp('sea-glow', seaGlow);

  /*
   * ## F10's second beat: the sea gives the frame to the beacon
   *
   * "The beacon room warming on solve" - and the way to warm it is NOT to push the beacon up.
   * It is already at 15 over 14 metres and amber emissives in this game clip to white the
   * moment they are asked for more; the lamp would go from a light to a chip.
   *
   * So the cold half comes down instead. The sea glow is what keeps the dark phase readable,
   * and at the moment the beacon holds it is also the only thing competing with it - dropping
   * it a third hands the frame over without touching a value that is already at its ceiling.
   *
   * Four seconds, which is slower than the others on purpose: this one runs under the beat
   * where Ileana says the light is holding, and a fast change there would read as a switch
   * rather than as the sea going quiet behind her.
   */
  scene.registerLightBeat(
    'beacon',
    (t) => {
      seaGlow.intensity = 11 - t * 3.5;
    },
    4
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

  /**
   * Salt and rust on everything the weather can reach - see art/saltrust.
   *
   * This room had no material pass at all, which showed: a headland mast above a harbour,
   * painted the same clean blue-grey from its feet to its light, as though it had been
   * delivered that morning. Mirela's shop earns its age from flood staining and Ileana's
   * from the same; this one had nothing, and it is the structure in the game with the
   * worst life - bolted to a clifftop in the spray, and old enough that the harbour
   * master takes its light for granted.
   *
   * From the deck at 0 to the lamp at 5.6, so the gradient runs the actual height of the
   * thing: scabbed around the feet where the spray gets, sound up at the head.
   *
   * Applied to the whole scene rather than to the mast alone, on purpose. The corrosion
   * is keyed to world position, so it runs continuously off the mast onto the platform,
   * the rails and the splice box instead of stopping at a seam - which is what makes them
   * read as one structure that has stood there together, rather than parts.
   */
  scene.registerFinisher(() => {
    const weathered = applySaltRust(scene as unknown as THREE.Object3D, {
      foot: 0,
      head: 5.6,
      strength: 0.9,
    });
    if (!weathered) console.warn('[scene] salt and rust touched nothing on the mast');
  });

  /**
   * The establishing shot. Round to the landward side, and up.
   *
   * The old one held everything and arranged nothing. Projected through the 46 degree lens,
   * Tomas landed at screen x 0.506, the beacon at 0.500 and the splice box at 0.495 - three
   * subjects stacked on one vertical line inside thirteen thousandths of the frame's width,
   * which is a totem pole. His perpendicular distance from the camera axis was 0.42m, three
   * centimetres under the 0.45-0.90 band the rule at the top of this file exists to enforce,
   * and that rule exists precisely to stop a person standing on top of the evidence.
   *
   * The beacon was worse. It landed at y 0.119 and the REQUEST banner runs 0.072 to 0.115,
   * so the object the entire mission is about sat four thousandths of frame height under the
   * interface and read as clipped.
   *
   * ## What this one holds, and why it is worth the move
   *
   * From (0, 4.95, 6.0) looking at (0.5, 4.0, -0.2), 6.29m:
   *
   *     the beacon lens   x 0.427  y 0.170     top third, clear of the banner
   *     Tomas's chest     x 0.528  y 0.667     lower right, whole figure in frame
   *     the splice box    x 0.477  y 0.792     between them, at the foot of the mast
   *     the harbour       x 0.025  y 0.762     the town the light is for
   *     perpendicular 0.82m, inside the band
   *
   * Three subjects at three heights on three slightly different verticals, which is a
   * composition rather than a stack. And THE HARBOUR IS IN IT - the old framing looked out
   * over open sea, so the mission never once showed the thing the light exists for.
   *
   * Checked by `scripts/dev/probe-mast.ts`, which fails the build of this shot if any of the
   * above stops being true.
   */
  scene.registerShot('default', {
    position: new THREE.Vector3(0, 4.95, 6),
    target: new THREE.Vector3(0.5, 4, -0.2),
    // Held while the call opens. Wide shots take the larger float: the same offset in metres
    // covers less of the frame the further back the lens sits.
    drift: 0.085,
  });
  /**
   * The join on the bracket - and the shot the mission actually lives in.
   *
   * ## What was wrong, and it was not the aim
   *
   * The aim was never wrong; it has always pointed at the splice box at (0.3, 2.6, 0.36).
   * The note this replaces is a careful piece of work about clearing the guardrail and
   * clearing Tomas's torso, and every measurement in it was right. It solved the wrong
   * problem, because clearing Tomas is not the same as INCLUDING him, and at 1.07m out he
   * was not merely behind the console panel - he was outside the frustum entirely:
   *
   *     Tomas head    x 0.864  y -1.296     1.3 frame-heights above the top edge
   *     Tomas feet    x 0.709  y  1.078     below the bottom edge
   *     camera 0.65m from his face
   *
   * A capture cannot show you that, which is how it survived: there is nothing in the
   * picture to notice the absence of. `scripts/dev/probe-mast.ts` settles it in one run, and
   * it matters more here than anywhere else in the game because the mission holds this shot
   * for 34 of its 44 seconds. Three quarters of a conversation with a man who was not there.
   *
   * ## What replaces it
   *
   * From (-1.10, 2.65, 2.0) looking at (0.45, 2.95, 0.3), 2.32m:
   *
   *     Tomas head     x 0.611  y 0.137     whole head, clear of the REQUEST banner
   *     Tomas chest    x 0.613  y 0.317
   *     Tomas feet     x 0.622  y 0.988     the full figure, right of frame
   *     the splice box x 0.471  y 0.681     2.13m out - a 24cm box across a ninth of the width
   *     perpendicular 0.46m, inside the 0.45-0.90 band
   *
   * A two-shot: the man on the right, the thing he is working on at lower left, both legible,
   * neither in front of the other. The camera sits at 2.65 against his eyeline at 3.67, so it
   * looks UP at him, which is the correct angle for somebody two metres up a lattice and the
   * one the old shot could not have because it was level with his chest.
   *
   * The old note's occlusion work is preserved rather than discarded - the sightline to the
   * box crosses the guardrail plane at z 0.94 at y 2.70, between the mid rail at 2.56 and the
   * handrail at 3.07, and 0.18m from the nearest upright. That check is now in the probe, so
   * it cannot be lost again by somebody moving the camera for a different reason.
   */
  scene.registerShot('mast-cable', {
    position: new THREE.Vector3(-1.1, 2.65, 2),
    target: new THREE.Vector3(0.45, 2.95, 0.3),
    duration: 2.4,
    /*
     * This is the shot TOMAS-REVIEW measured being held for 34 of the mission's 44 seconds
     * with a frame-to-frame difference that never exceeded 4.8%. Lighting fixed what it
     * contains; this is what stops it being a still.
     *
     * 0.05 rather than the wide's 0.085 because the lens is 2.3m out instead of 6.3m, so the
     * same metres cover nearly three times as much of the frame. Tuned in screen terms, not
     * world terms - which is the only way a drift number means anything.
     */
    drift: 0.05,
  });
  /**
   * The payoff, and the man it is for.
   *
   * The old framing was a light on a stick against a black sky. Tomas projected to y 1.430 -
   * a frame and a half below the bottom edge - and the harbour was not in it either, so at
   * the moment his problem is solved the shot contained neither the person nor the town.
   * It was also, measurably, a weaker picture than the establishing shot it followed: that
   * one has a coastline and a scatter of harbour lights, this one had four white cloud slabs.
   *
   * From (0.2, 5.6, 4.4) looking at (0.2, 4.6, -0.2), 4.71m:
   *
   *     the beacon lens   x 0.459  y 0.221
   *     Tomas's head      x 0.589  y 0.802     watching it, bottom right
   *     the harbour       x 0.055  y 0.783     bottom left, the same height as him
   *
   * A light, the man who fixed it, and the town it is for, in one frame. That is the mission
   * in a picture, and it is the last thing the player sees before the call ends.
   *
   * Held on the same side of the mast as the other two shots, so none of the three cuts
   * crosses the line.
   */
  scene.registerShot('beacon', {
    position: new THREE.Vector3(0.2, 5.6, 4.4),
    target: new THREE.Vector3(0.2, 4.6, -0.2),
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

  /*
   * How much of the rig's afternoon reaches this room.
   *
   * Six of the eight scenes were sitting at the default 1, which means the workstation's
   * global key AND its sky fill landed on top of whatever practicals the room had lit
   * itself with. The sky term is the problem: it is an ambient, it has no direction, and at
   * full strength it raises every shadow in the room to roughly the value of every lit
   * surface. Reported as the contact rooms looking flat next to the menu room, and that is
   * exactly what it is - the menu room is lit by three practicals and nothing else.
   *
   * Lowering this does not make a room dark; it hands the room back to the lights that were
   * already in it and lets the corners go. Each value below is what the fiction says about
   * the place rather than a level: underground, where the only honest sources are the torch and whatever leaks in behind
   */
  scene.daylight = 0.22;
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
    meshOf('BedSoil', mergeGeometries(bedSoil, false) ?? bedSoil[0], MAT.bedSoil)
  );

  /**
   * The tunnel: hoops and a ridge, left open rather than skinned.
   *
   * A closed polytunnel would hide the one thing this scene exists to show. The hoops
   * read as a tunnel from any angle and let the shadow, the rows and the tree all stay
   * visible at once.
   *
   * ## The hoops were turned ninety degrees, and it is worth saying how that was found
   *
   * There was a `rotateY(Math.PI / 2)` on this line and it was destroying the structure.
   * `TorusGeometry` with `arc: Math.PI` is built in the XY plane, so it ALREADY spans
   * x = -2.05 to 2.05 with its apex at y = 2.05: an arch across the width, which is what
   * a hoop is. Rotating it maps (x, y, z) to (z, y, -x), which puts every point at x = 0
   * and turns the arch to run lengthways. So this was not six hoops over two beds. It was
   * six 4.1m arches stacked in the centre plane at 0.92m intervals, overlapping each
   * other, standing in the gap between the beds and spanning nothing.
   *
   * Which is exactly what it was reported as - not "the tunnel looks wrong" but two
   * questions, "what is the tunnel?" and "what is the structure between the two flower
   * beds?". The frame had stopped reading as a tunnel because it had stopped being one.
   *
   * The file's own note two hundred lines down says the hoop above Adaeze is 1.72m up,
   * measured. She stands at x = -1.12, and sqrt(2.05^2 - 1.12^2) is 1.72 exactly - but
   * only for an unrotated hoop. With the rotation there is no hoop above her at all. The
   * measurement was taken when this was right and the rotation was added afterwards.
   */
  const frame: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const z = -2.3 + i * 0.92;
    const hoop = new THREE.TorusGeometry(2.05, 0.022, 5, 16, Math.PI);
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
  const FAILING_PALE = new THREE.Color('#cfc47e');
  const FAILING_LIT = new THREE.Color('#d8d08b');
  failing.colors = FAILING_PALE.clone();

  /*
   * The sunlight the two interventions earn.
   *
   * It begins effectively off. The cut removes the authored shade plane and the mower
   * clears the bank; the final beat then lets a warm, low source rake across the weak row.
   * The plants only warm slightly—they do not become healthy in three seconds—but their
   * material and silhouette stop looking abandoned, which is the no-UI payoff the mission
   * was missing.
   */
  const recoverySun = ENGINE.PointLightNode.create({
    name: 'RecoverySun',
    position: new THREE.Vector3(1.4, 2.8, 0.8),
    intensity: 0.001,
    color: new THREE.Color('#ffd18a'),
    distance: 8,
    decay: 1.05,
  });
  scene.registerProp('recovery-sun', recoverySun);

  scene.registerProp('rows-failing', failing, {
    actions: {
      recover: (tweener, node) => {
        const baseY = node.position.y;
        tweener.add(
          (t) => {
            const eased = Ease.inOutCubic(t);
            recoverySun.intensity = 5.8 * eased;
            failing.setInstanceColors(FAILING_PALE.clone().lerp(FAILING_LIT, eased));
            node.position.y = baseY + Math.sin(eased * Math.PI) * 0.015;
          },
          {
            duration: 2.8,
            easing: Ease.linear,
            channel: 'seedling-recovery',
            onComplete: () => {
              recoverySun.intensity = 5.8;
              failing.setInstanceColors(FAILING_LIT.clone());
              node.position.y = baseY;
            },
          }
        );
      },
    },
  });
  scene.onReset(() => {
    recoverySun.intensity = 0.001;
    failing.setInstanceColors(FAILING_PALE.clone());
    failing.position.y = 0;
  });

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
    /*
     * Thicker on the side it reaches, not just longer. With the six evenly spaced limbs
     * only ONE genuinely made it out over the tunnel, so the cause of the entire request
     * was a single arm - and once that arm is cut there has to be a tree left standing.
     * Four more on the same bearing means the crowded side reads as crowded both before
     * the cut and after it.
     */
    extraToward: 4,
    /*
     * The hoops span x = -2.05 to 2.05 and the tree stands at x = -3.7, so 1.7 out from
     * its own trunk is the hoop line to the centimetre. A limb that gets past it is over
     * her tunnel and comes off; one that does not is over the boundary and is none of her
     * business. The threshold is the fiction, written as a number.
     */
    overhangPast: 1.7,
  });
  const treeRoot = neighbourTree.root;

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

  /**
   * The leaf bits each cut limb throws as it is cleared, built once and reused.
   *
   * Built here rather than inside the `clear` action, and that is not tidiness. A request
   * can be re-opened, so `clear` can run more than once on the same diorama - and building
   * these in the action would add five more meshes per limb to the tree every single time,
   * for as long as the player kept coming back. They are parented to their limb so they
   * inherit its fall for free, and start hidden.
   */
  const limbPuffs = neighbourTree.cutLimbs.map((cut, index) => {
    const spread = createRng(seedFrom(`limb-puff-${index}`));
    const bits: ENGINE.MeshNode[] = [];
    const drift: number[] = [];
    for (let i = 0; i < 5; i++) {
      const bit = meshOf(
        `Puff${index}_${i}`,
        new THREE.IcosahedronGeometry(range(spread, 0.1, 0.2), 0),
        MAT.leafDeep
      );
      bit.position.set(range(spread, -0.4, 0.4), range(spread, 0.1, 0.5), range(spread, -0.4, 0.4));
      bit.visible = false;
      cut.node.add(bit);
      bits.push(bit);
      drift.push(range(spread, 0.8, 1.9));
    }
    return { node: cut.node, bits, drift, home: bits.map((bit) => bit.position.clone()) };
  });

  scene.registerProp('neighbour-tree', treeRoot, {
    // Inked: The tree on the other side of the glass.
    inked: true,
    anchors: { default: new THREE.Vector3(1.6, 3.3, -0.4) },
    actions: {
      /**
       * Cutting back: the overhanging limbs come off and fall, and the light lands.
       *
       * This used to slide the WHOLE crown 2.4m in -x, lift it 0.6m and scale it to 45%,
       * which is a canopy retreating behind its own trunk and getting smaller - reported,
       * accurately, as the branches moving to the back of the tree. It was doing that
       * because the crown was one merged mesh with its origin at the tree's base: there
       * was no such thing as "the branches over the tunnel" to move, and any rotation
       * would have pivoted about the roots four metres away.
       *
       * They are their own node now, hinged at the mean saw cut, so this is the motion a
       * bough actually makes - it swings down from where it was cut, comes back clear of
       * the hoops, and lands.
       *
       * `inCubic` because it is falling. The old ease was `outCubic`, which starts fast
       * and settles, and that is the shape of something being PULLED away rather than
       * let go.
       */
      clear: (tweener) => {
        const shadeMaterial = shadeMesh.material as THREE.MeshBasicMaterial;
        const shadeFrom = shadeMesh.position.x;

        /**
         * Where each cut limb ends up, worked out from its own geometry.
         *
         * ## Lying down is per limb
         *
         * The limbs left the trunk at anything from 21 to 66 degrees off vertical, so
         * there is no single rotation that lays them all flat - simulated, one rigid pose
         * for the group lands as a 3.9m-tall mass with the hoops through it. Each limb
         * gets the minimal rotation that takes ITS OWN axis onto a chosen bearing just
         * below horizontal, which is what a branch on the ground is.
         *
         * ## Where they go
         *
         * Past the far end of the tunnel, and finding that spot took three tries with a
         * simulation because every obvious one is already occupied.
         *
         * The strip between the trunk and the hoops is 1.11m wide and the heap is three
         * metres across - each limb carries a 1.4m crown at its end - so branches came out
         * through the hoops AND through the trunk. Laying them along z past the tunnel put
         * their far ends in the lake, whose near edge is z = -5.
         *
         * What is actually free is the band between the last hoop at z = -2.3 and the
         * water at z = -5: no hoops, no beds, no trunk, and unlimited in x. So they lie
         * ALONG x there, which is the one orientation that fits, fanned and stacked across
         * a 1.8m depth. It lands four degrees off the default shot's axis - middle of
         * frame, in the mid-distance, behind the tunnel rather than in front of the beds
         * it has just uncovered. Which is where anybody who had cut them would have
         * dragged them anyway: out of the way, at the end of the row.
         *
         * ## The height
         *
         * From the VERTICES under the final rotation, never from a bounding box. The
         * obvious version rotates the local Box3 and reads its floor; it is wrong by
         * nearly two metres, because re-fitting an axis-aligned box around a rotated one
         * finds the corner where max x meets min y and there is no geometry within a
         * metre of that corner. A few thousand points transformed once, at the moment of
         * the cut, is exact and costs nothing.
         */
        /** Tree-local xz. The tree stands at world (-3.7, -0.4), so this is (-2.4, -4.15). */
        const DROP_AT = new THREE.Vector2(1.3, -3.75);
        /**
         * How much they close up as they come down.
         *
         * Not a cheat to make the numbers fit - though it does that too. Five whole boughs
         * dropped at full spread measure 3.5m across a band that is 2.7m deep, and they
         * pile 3.2m high, which is not a heap of cuttings but a second tree lying on the
         * grass. Foliage on a standing branch is held apart by the branch; once it is down
         * it collapses under its own weight, and a quarter is about what that looks like.
         */
        const CLOSES_TO = 0.75;
        const falls = neighbourTree.cutLimbs.map((cut, index) => {
          // Alternating ends and fanned, so they cross each other like a heap rather
          // than lining up like stacked timber.
          const side = index % 2 === 0 ? 1 : -1;
          const bearing = (side > 0 ? 0 : Math.PI) + (index - 1.5) * 0.18;
          const lying = new THREE.Vector3(
            Math.cos(bearing),
            // Nose down a little. Dead level reads as floating; a branch on the ground
            // has its tip in the grass and its cut end propped on whatever is under it.
            -0.16,
            Math.sin(bearing)
          ).normalize();
          const turn = new THREE.Quaternion().setFromUnitVectors(cut.direction, lying);

          const point = new THREE.Vector3();
          const low = new THREE.Vector3(Infinity, Infinity, Infinity);
          const high = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
          cut.node.traverse((object) => {
            const mesh = object as THREE.Mesh;
            if (!mesh.isMesh) return;
            const vertices = mesh.geometry.getAttribute('position');
            for (let i = 0; i < vertices.count; i++) {
              point
                .fromBufferAttribute(vertices as THREE.BufferAttribute, i)
                .applyQuaternion(turn)
                .multiplyScalar(CLOSES_TO);
              low.min(point);
              high.max(point);
            }
          });

          return {
            node: cut.node,
            from: cut.node.position.clone(),
            turn,
            spin: cut.node.quaternion.clone(),
            to: new THREE.Vector3(
              // Spread along the row they are lying in, and stacked shallowly across it -
              // the across figure is small on purpose, because the clear band is only
              // 2.35m deep and the crowns are 1.4m wide before any scatter is added.
              DROP_AT.x - (low.x + high.x) / 2 + (index - 1.5) * 0.42,
              // 0.07 to sit ON the grass, and each one a little higher than the last so
              // the pile is a pile and no two faces are coplanar.
              0.07 + index * 0.11 - low.y,
              DROP_AT.y - (low.z + high.z) / 2 + side * 0.16
            ),
          };
        });

        /*
         * `inCubic` because it is falling. The old ease was `outCubic`, which starts fast
         * and settles - the shape of something being PULLED away rather than let go.
         */
        tweener.add(
          (t) => {
            for (const fall of falls) {
              fall.node.position.lerpVectors(fall.from, fall.to, t);
              fall.node.quaternion.slerpQuaternions(fall.spin, fall.turn, t);
              fall.node.scale.setScalar(1 - (1 - CLOSES_TO) * t);
            }
            // The light arrives as the limbs go. The shade retreats the same way they
            // do, so the player watches one thing cause the other.
            shadeMesh.position.setX(shadeFrom - t * 2.6);
            shadeMaterial.opacity = 0.52 * (1 - t);
          },
          {
            duration: 1.4,
            easing: Ease.inCubic,
            channel: 'tree-clear',
          }
        );

        /**
         * And then they are gone.
         *
         * The pile was the wrong end state. What the player has just done is give one side
         * of a tunnel its light back, and the way to see that is to look at the tunnel -
         * except a heap of cut bough was sitting in the mid-distance holding the eye,
         * exactly where the shot needed nothing. The falling is the beat; the debris is not.
         *
         * So it lands, sits for a moment so the landing registers, and clears. Which is
         * also honest about what happens next on a real smallholding: somebody drags them
         * to the boundary, and she has just told the player she has the saw in her hand.
         *
         * ## The vanish, and why it is a lift rather than a fade
         *
         * These share MAT.leafDeep and MAT.timberDark with the rest of the tree, and the
         * palette materials are shared across every prop in the game - so fading them means
         * either cloning two materials per limb to animate opacity on, or fading the trunk
         * along with the branches. Scale needs neither: it is per-node, it costs nothing,
         * and dropping a bough INTO the grass while it shrinks reads as being cleared away
         * rather than as being deleted.
         *
         * The leaf puff is what makes it an event. Each limb throws a handful of its own
         * canopy colour outward and down as it goes, which at this distance is the shape of
         * a bough being dragged through long grass - and it is drawn from the same
         * geometry the crown is made of, so nothing new has to match anything.
         */
        tweener.add(
          (t) => {
            for (const puff of limbPuffs) {
              // Held back for the first third, so the fall finishes before the clear starts.
              const away = Math.max(0, (t - 0.34) / 0.66);
              puff.node.scale.setScalar(CLOSES_TO * (1 - away * away));
              // Sinking as it shrinks, so it goes into the grass and not out of existence.
              puff.node.position.y = Math.max(0, puff.node.position.y - away * 0.004);
              puff.bits.forEach((bit, i) => {
                bit.visible = away > 0 && away < 0.9;
                const fling = away * puff.drift[i];
                bit.position.y = 0.3 + fling * 0.5 - fling * fling * 1.4;
                bit.scale.setScalar(Math.max(0.001, 1 - away));
              });
            }
          },
          {
            // Starts as the fall lands and runs past it, so nothing is ever still.
            duration: 2.6,
            easing: Ease.linear,
            channel: 'tree-cleared-away',
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
    /*
     * No hand target, because there is nothing in front of her to put a hand on.
     *
     * The note above wanted her at the mouth of the tunnel with a hand on the frame,
     * and the number never matched the staging: the beds run to z +0.30 and she stands
     * at +2.72, two and a half metres past their near end, turned to face the camera.
     * So the frame she was reaching for was 0.28m BEHIND her and the solver did the
     * only thing it could, which is send the arm backwards. Reported as her left arm
     * bent behind her.
     *
     * The fix is not a better target. She is where the composition wants her - out in
     * the meadow, facing the lens, with her failing rows behind her shoulder - and
     * putting a hand back on the frame means turning her away from the shot. So her
     * hands are her own, and the idle has them.
     */
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
      /**
       * Down from 8, and this is the whole answer to "is anything still over-lit".
       *
       * 8 was set for a sun seven degrees above the horizon, where cos on level ground is
       * 0.12 and the key delivered under 1. The sun was then aimed properly - it is at
       * (-9, 16, -10), which is fifty degrees up and cos 0.765 - so the same number started
       * delivering 6.1 instead of 0.96, a six-fold increase that nothing was rebalanced
       * for. Everything in the shot was sitting on the shoulder of the tone curve.
       *
       * Measured through the actual pipeline rather than adjusted by eye: ACES at exposure
       * 0.62, three's own 1/PI on the Lambert BRDF, and the surface albedos this scene
       * uses. At 8 the grass rendered 203/255, the ground 223 and the timber 179 - the
       * whole set inside the top fifth of the range with nothing left to separate one
       * material from another. At 3.0 they land 137, 96 and 85, which is a lit afternoon
       * with somewhere to go above it.
       *
       * For scale, the only other directional in the game is Tomas's moon at 1.9.
       */
      intensity: 3.0,
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
      /*
       * Down from 2.2, in step with the key.
       *
       * A hemisphere does not attenuate either, so it was adding its full 2.2 to every
       * up-facing surface in the room on top of an over-bright sun. Held at a quarter of
       * the key, which is about what an open sky is worth against direct sun on a clear
       * afternoon - and it is still the thing carrying the ground, which is what it is for.
       */
      intensity: 0.75,
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
      /*
       * Down from 22, and this is the number that was stopping this room having a sun.
       *
       * A point light at 22 with decay 1.15 arrives at her from three metres at about
       * 22 / 3^1.15 = 6.1 effective, against a key of 5.2. That is a one-to-one
       * key-to-fill ratio, which is not afternoon light - it is a photograph taken
       * with the flash on. Nothing can read as sunlit while the fill matches the sun,
       * however warm the sun is or however hard it casts.
       *
       * At 9 it arrives at about 2.5 against a key of 8, which is a bit over three to
       * one - the ratio you get outdoors on a clear day with the sky doing the
       * filling. Kept rather than cut because it is what keeps a contact's face off
       * black on the shadow side, which is the one thing this scene may not trade.
       */
      /*
       * Down from 9, keeping the ratio the note above worked out.
       *
       * The arithmetic there is still right and its inputs changed. At 3.2 it arrives at
       * her from 2.7m at about 1.0 against a key of 2.3 on a surface facing the sun -
       * a bit over two to one, which is the outdoor-with-sky-fill ratio that note was
       * after. What it must not do is fall to nothing: this is the only light her front
       * ever sees, and a contact who is a silhouette in daylight is the fault this whole
       * light was added to fix.
       */
      intensity: 3.2,
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
      /*
       * Brown, because it is soil.
       *
       * This was #c9b491, a pale tan, and the note below explains why: the whole ground was
       * moved up in value to make the scene calm, and the argument was that a smallholding
       * on a shoreline has soil that is half sand. True at the waterline and wrong at the
       * beds - the ground somebody digs and feeds every day is dark, damp and brown, and
       * pale tan under thin grass reads as a beach that has not been swept.
       *
       * `sand` and `drySand` below are untouched, and they are what keeps the argument
       * honest: the shader blends toward them approaching the water, so the shore is still
       * sand and only the worked ground is earth. Landing at 96/255 against grass at 137 -
       * darker than what grows in it, which is the one thing soil must be.
       */
      soil: '#8f6a40',
      sand: '#e0cfae',
      drySand: '#eaddc2',
    }))
  );

  /**
   * Held in a variable, because the mower has to be able to cut it.
   *
   * This patch is 26 by 22 metres centred near the tunnel, so it covers the bank ENTIRELY -
   * the two meadows are stacked in the same square metres, one at 0.18-0.40m and one at
   * 0.34-0.72m. The mowing field was only ever told about the bank's own grass, so a pass
   * took 6,400 blades down and left the field's own 2,500 standing in exactly the same
   * place. Which is precisely what it looked like: a plot reporting a cut strip over ground
   * that was still green.
   *
   * The first attempt at this bug was the blade scale - real, and not the whole of it. Two
   * separate faults with one symptom, which is why fixing one changed nothing visible.
   */
  const fieldGrass = meadow(rng, {
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
      /*
       * 260000 across 26x22 is about 455 blades per square metre, up from 262.
       *
       * Asked for as more cover rather than more height, which is the right instinct and
       * the note above already knows why: coverage here is not one number. The count goes
       * up, the clumps get SMALLER so the same budget spreads over half again as many
       * crowns, and the bare threshold drops so the thin ground fills instead of being
       * culled to nothing. Three controls pulling the same way.
       *
       * Still one InstancedMesh, so this is a longer buffer and not more draw calls.
       */
      count: 260000,
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
      // Shorter, as asked - dense rather than deep. Cover is the goal, not a hayfield.
      height: [0.18, 0.40],
      bladesPerClump: [3, 6],
      bareBelow: 0.14,
      /**
       * And the layer above it.
       *
       * The field's silhouette was a flat fuzzy line however many blades were in it,
       * because every blade is the same kind of thing at the same sort of height. A
       * twentieth as many stalks gone to seed, standing clear of the mass, is what makes it
       * read as long rather than as thick - and a mown lawn has none by definition, which
       * is the theme stated in one prop.
       */
      // The weeds stay, at the same share of a bigger field. They are the thing
      // holding the silhouette up now the grass under them is shorter.
      seedHeads: { share: 0.05, height: [0.5, 0.8] },
      keepOffBeach: 3.2,
      clear: KEEP_CLEAR,
      y: 0,
  });
  scene.registerProp(
    'meadow',
    fieldGrass,
    // The gust, advanced once a frame. Registered here rather than globally so it only
    // runs while this diorama is the one on screen.
    { idle: (deltaTime) => stepWind(deltaTime) }
  );

  /**
   * -- Things that were here before you called -----------------------------------------
   *
   * Everything else in this field either stands still or moves on a loop: the grass sways,
   * the clouds drift, the water swells. All of that is scenery moving the way scenery
   * moves - evenly, and forever. What the set had none of is anything going somewhere for
   * its own reasons, and that absence is most of why a smallholding with a sun, a sea and a
   * person in it still read as a diorama.
   *
   * Two birds on a circuit and a cloud of flies over the beds. Neither is looked at and
   * neither is meant to be; they are what makes the place look like it does not need you.
   */
  const birds = createBirds({
    // Out over the water and high, where a gull would be. Not over the tunnel: something
    // circling directly above the thing the player is examining reads as a vulture.
    at: new THREE.Vector3(-9, 0, -16),
    count: 3,
    radius: 13,
    seed: 'adaeze-gulls',
    // Against a pale sky at fifty metres a bird is a dark shape and nothing else.
    color: '#3c4a52',
  });
  scene.registerProp('birds', birds.root, { idle: birds.idle });

  const flies = createMotes({
    // Over the warm end of the beds, which is where anything with wings would be.
    at: new THREE.Vector3(0.1, 0.5, 0.4),
    size: new THREE.Vector3(2.6, 0.7, 4.2),
    count: 34,
    seed: 'adaeze-flies',
    scale: 0.03,
  });
  scene.registerProp('flies', flies.root, { idle: flies.idle });

  /**
   * -- The bank, and the machine that deals with it -------------------------------------
   *
   * ## Where it is, and why there
   *
   * A strip down the WEST flank of the tunnel, which is the failing side. That is not an
   * arbitrary place to put a gameplay object: it is the shaded side, and the reason it is
   * shaded is the reason nothing has been cut there. Adaeze weeds where she works and she
   * has stopped going down the dark side, so the grass that runs up against the failing
   * bed is the grass nobody has touched since the spring. The mission's cause and the
   * minigame's playing field are the same fact seen twice.
   *
   * It also fits. The strip runs from the tunnel's hoop feet at x = -2.05 out past the
   * neighbour's trunk, and past the tunnel ends there is open ground in both directions -
   * so a 0.62m unit has somewhere to turn round, which a 1.1m corridor alone would not
   * give it.
   *
   * ## Denser and taller than the field it sits in
   *
   * Its own meadow rather than a knob on the main one, because the whole point is CONTRAST.
   * The field around it is cut to 0.18-0.40 and this is 0.34-0.72 at two and a half times
   * the density, so the bank reads as a different thing from the lawn before the player is
   * told it is - and once it has been mown, the same comparison runs the other way.
   */
  const BANK: FieldBounds = { minX: -5.4, maxX: -1.95, minZ: -4.6, maxZ: 4.2 };

  const bankGrass = meadow(rng, {
    at: new THREE.Vector3((BANK.minX + BANK.maxX) / 2, 0, (BANK.minZ + BANK.maxZ) / 2),
    width: BANK.maxX - BANK.minX,
    depth: BANK.maxZ - BANK.minZ,
    /*
     * About 210 blades per square metre against the field's 84. Overgrown is a density
     * statement before it is a height one - long thin grass reads as a hayfield, and what
     * has actually happened here is that a patch nobody walks on has closed over.
     */
    count: 6400,
    height: [0.34, 0.72],
    bladesPerClump: [4, 7],
    bareBelow: 0.02,
    // Half again as many seed heads as the field, standing higher. This is the silhouette
    // that says nobody has been down here.
    seedHeads: { share: 0.09, height: [0.7, 1.05] },
    clear: [{ centre: new THREE.Vector3(-3.7, 0, -0.4), radius: 0.75 }],
    y: 0,
  });
  scene.registerProp('bank', bankGrass);

  /**
   * The weeds in it, which are the part Adaeze can name.
   *
   * Same two species as the field so nothing new is introduced, but bigger and packed -
   * and unlike the field scatter these are allowed right up against the bed frame, because
   * crowding the failing bed is the entire complaint. `flatten` in the mowing field takes
   * them down; they are worth three blades each to the progress count, since a player who
   * clears the grass and leaves the docks standing has not done the job.
   */
  const bankWeeds = scatter(rng, {
    /*
     * SM_EagleFern_01, because SM_WildGrass_01 IS NOT IN THIS PROJECT.
     *
     * assets/models/Plants holds three files - EagleFern, SilverFir and WildCarrot - and
     * the grass was never among them, so every load of this scene 404'd and the bank came
     * up bare. The comment a few hundred lines above about all three grasses 404'ing was
     * the same wound: that one was a constructed path the asset pipeline could not see,
     * this one is a literal path to a file that does not exist. Same symptom, different
     * cause, and worth telling apart - a path bug is fixed by writing it out, a missing
     * asset is only fixed by using one that is actually there.
     *
     * A rank fern is a fair weed for a neglected bank, and it keeps the scene inside the
     * assets this project ships.
     */
    modelUrl: '@project/assets/models/Plants/SM_EagleFern_01.glb',
    at: new THREE.Vector3(-2.75, 0, -0.2),
    width: 1.5,
    depth: 7.6,
    count: 34,
    scale: [0.5, 0.85],
    clear: [{ centre: new THREE.Vector3(-3.7, 0, -0.4), radius: 0.8 }],
    y: 0.01,
  });
  scene.registerProp('bank-weeds', bankWeeds);

  const bankDocks = scatter(rng, {
    modelUrl: '@project/assets/models/Plants/SM_WildCarrot_01.glb',
    at: new THREE.Vector3(-2.6, 0, 0.4),
    width: 1.2,
    depth: 6.8,
    count: 16,
    scale: [0.42, 0.66],
    clear: [{ centre: new THREE.Vector3(-3.7, 0, -0.4), radius: 0.8 }],
    y: 0.01,
  });
  scene.registerProp('bank-docks', bankDocks);

  /**
   * The unit, parked at the tunnel's near corner where she left it.
   *
   * Registered as a prop so it is put away with the rest of the diorama, and placed at the
   * END of the bank rather than in the middle of it: a machine parked in the long grass
   * would already have flattened a patch, and the first thing the player should see when
   * they take it over is the whole job still in front of them.
   */
  const mower = buildMower('GroundsUnit');
  scene.registerProp('mower', mower.root);

  /**
   * What it must not drive into.
   *
   * The beds are rectangles and these are circles, which is a deliberate simplification -
   * a circle round each bed's near and far half keeps the machine off the timber without
   * needing a real collision pass, and being slightly generous is the right error to make
   * for something the player is steering in a 1.1m gap.
   */
  const KEEP_OFF = [
    { x: -1.05, z: -1.4, radius: 1.15, kind: 'bed' as const },
    { x: -1.05, z: 1.0, radius: 1.15, kind: 'bed' as const },
    { x: -3.7, z: -0.4, radius: 0.72, kind: 'trunk' as const },
    // Adaeze herself. The machine is hers and it is not going to run over her.
    { x: -1.12, z: 2.72, radius: 0.6, kind: 'person' as const },
  ];

  const mowingField = new MowingField(BANK);
  mowingField.addMeadow(bankGrass);
  /*
   * And the field's own grass, which stands in the same ground.
   *
   * `addMeadow` keeps only what falls inside the bank, so this indexes the couple of
   * thousand blades of ordinary field that happen to be under the bank and ignores the
   * forty-odd thousand that are not. Without it the mower cuts the tall grass and the short
   * grass underneath it stays exactly where it was.
   */
  mowingField.addMeadow(fieldGrass);
  mowingField.addWeeds(bankWeeds);
  mowingField.addWeeds(bankDocks);

  /**
   * The ground it may drive on, which is BIGGER than the ground it must clear.
   *
   * Measured, and this was a real blocker rather than a nicety. The drive clamps the
   * machine's centre half a body inside its bounds, and the deck only reaches 0.25m past
   * that - so with one rectangle serving as both the grass extent and the driving limit,
   * a 0.31m rim of the bank was physically unreachable. Simulated: a tidy overlapping
   * sweep topped out at 87.2%, against a target of 90. The request could not be finished
   * by playing it correctly, which is the worst kind of bug to ship because it looks like
   * the player's fault.
   *
   * Letting it drive off the edge of the grass fixes it. Not symmetric, though: the
   * seaward side stops short of z = -5 because that is the waterline, and the tunnel side
   * is safe to extend because the beds' own keep-out circles reach x = -2.2 and stop it
   * long before the hoops do.
   */
  const DRIVEABLE: FieldBounds = {
    minX: BANK.minX - 0.45,
    maxX: BANK.maxX + 0.45,
    minZ: Math.max(BANK.minZ - 0.45, -4.8),
    maxZ: BANK.maxZ + 0.45,
  };

  const home = { x: -2.6, z: 3.5, heading: Math.PI };
  const drive = new MowerDrive(mower, mowingField, DRIVEABLE, KEEP_OFF);
  drive.place(home.x, home.z, home.heading);

  /**
   * Putting this set back, which is three things a cue moves.
   *
   * The limbs, the shade and the bank - captured now, before any cue has touched them, so
   * "the way it was found" is a fact rather than a guess. The mower is parked from `home`
   * for the same reason: after a mow it is wherever the player abandoned it, which for a
   * machine that is supposed to be waiting at the end of the row is the wrong first
   * impression.
   */
  const asFound = neighbourTree.cutLimbs.map((cut) => ({
    node: cut.node,
    position: cut.node.position.clone(),
    quaternion: cut.node.quaternion.clone(),
    scale: cut.node.scale.clone(),
  }));
  const shadeAt = shadeMesh.position.x;
  const shadeOpacity = (shadeMesh.material as THREE.MeshBasicMaterial).opacity;

  scene.onReset(() => {
    for (const limb of asFound) {
      limb.node.position.copy(limb.position);
      limb.node.quaternion.copy(limb.quaternion);
      limb.node.scale.copy(limb.scale);
    }
    shadeMesh.position.setX(shadeAt);
    (shadeMesh.material as THREE.MeshBasicMaterial).opacity = shadeOpacity;
    // The leaf bits go back where they started and out of sight, or a re-opened request
    // shows five icosahedra hanging in the air where a branch used to be.
    for (const puff of limbPuffs) {
      puff.bits.forEach((bit, i) => {
        bit.visible = false;
        bit.position.copy(puff.home[i]);
        bit.scale.setScalar(1);
      });
    }
    mowingField.reset();
    drive.place(home.x, home.z, home.heading);
    mower.beacon.visible = false;
  });

  /**
   * A post-and-rail run round the bank, and it is a gameplay object dressed as a fence.
   *
   * ## The problem it solves
   *
   * The job is "clear this strip", and nothing in the world said where the strip ENDED.
   * The bank is a rectangle in a field of grass that goes on for twenty-six metres in every
   * direction, so from inside the machine there was no way to know whether the tall stuff
   * ahead was the job or just more field - and the plot could only answer that by being
   * squinted at. A player who cannot see the edge of a task cannot tell when they are
   * finished, and will either quit early or grind past it.
   *
   * ## Why it is on the DRIVEABLE bounds and not the grass
   *
   * Because those are the bounds the machine is actually stopped by, and a barrier the
   * player can see is doing its job only if it is where the wall is. Fencing the grass
   * instead would put a rail 0.45m inside a boundary the mower drives straight through,
   * which is worse than no fence: it would teach that the fence means nothing.
   *
   * Three sides, not four. The tunnel side is left open because the beds are there and a
   * rail across them would be nonsense - and because from the default shot an unbroken
   * rectangle in the middle distance reads as a pen, which this is not. It is the line
   * somebody put in to keep the far side of their smallholding out of the beds.
   *
   * Post and two rails rather than posts and wire, which is what the boundary fence up by
   * the hedge already is. Rails are legible at three metres from inside a mower; wire is
   * two pixels and disappears.
   */
  const railRun: THREE.BufferGeometry[] = [];
  const RAIL_TOP = 0.86;
  const railPost = (x: number, z: number): void => {
    const post = new THREE.BoxGeometry(0.09, RAIL_TOP + 0.16, 0.09);
    // Leaning a little, each its own way. A dead-straight run of farm fence has never
    // existed, and the lean is most of what makes it read as timber rather than as a chart.
    post.rotateZ(jitter(rng, 0.035));
    post.rotateX(jitter(rng, 0.03));
    post.translate(x, (RAIL_TOP + 0.16) / 2, z);
    railRun.push(post);
  };
  /** One side: posts at intervals plus two rails spanning the whole length. */
  const railSide = (
    from: THREE.Vector2,
    to: THREE.Vector2
  ): void => {
    const span = from.distanceTo(to);
    const bays = Math.max(1, Math.round(span / 1.5));
    for (let i = 0; i <= bays; i++) {
      const at = from.clone().lerp(to, i / bays);
      railPost(at.x, at.y);
    }
    const middle = from.clone().lerp(to, 0.5);
    const along = Math.atan2(to.x - from.x, to.y - from.y);
    for (const height of [RAIL_TOP, RAIL_TOP * 0.55]) {
      const rail = new THREE.BoxGeometry(0.05, 0.11, span);
      rail.rotateY(along);
      rail.translate(middle.x, height, middle.y);
      railRun.push(rail);
    }
  };

  const nearX = DRIVEABLE.maxX;
  const farX = DRIVEABLE.minX;
  railSide(new THREE.Vector2(farX, DRIVEABLE.minZ), new THREE.Vector2(farX, DRIVEABLE.maxZ));
  railSide(new THREE.Vector2(farX, DRIVEABLE.minZ), new THREE.Vector2(nearX, DRIVEABLE.minZ));
  railSide(new THREE.Vector2(farX, DRIVEABLE.maxZ), new THREE.Vector2(nearX, DRIVEABLE.maxZ));

  /*
   * MAT.timber is #9a7248, which is fresh-sawn pine and reads pale in sunlight. A farm rail
   * that has stood out in the weather is a good deal darker and greyer than the day it went
   * up, and against grass at 137/255 this lands at 85 - a line the eye reads as timber
   * rather than as a bright edge competing with the tunnel.
   */
  scene.registerProp(
    'bank-fence',
    meshOf('BankFence', mergeGeometries(railRun, false) ?? railRun[0], MAT.timberWeathered)
  );

  scene.remoteUnit = {
    drive,
    field: mowingField,
    // The plot draws what can be driven, not just what is grass - otherwise the machine
    // appears to leave the chart every time it turns round at the end of a pass.
    bounds: DRIVEABLE,
    shapes: KEEP_OFF,
    home,
    /*
     * Not 100%. A blade wedged against the trunk that the deck physically cannot reach
     * would make the job impossible, and hunting the last three blades in a 30m2 bank is
     * not the game - the game is the sweep. Four fifths rewards a competent pattern and
     * keeps this supporting interaction in a 30-45 second dramatic beat.
     */
    target: 0.8,
  };

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
        /*
         * Tropical, to the reference. The old set was a temperate lake - a grey-blue
         * deep at #3f7f96 running to a soft #79bfc0 - which is water under cloud.
         *
         * What makes the reference read as warm shallow sea is SATURATION and the
         * distance between the two ends: a deep that is properly blue, a shallow that
         * is properly green, and enough gap between them that the gradient reads as
         * depth rather than as one colour lit unevenly. The crest goes paler with
         * them so the tops still catch.
         */
        /*
         * Retuned again, and this time the palette was the smaller half of the problem.
         *
         * Two stops over a 16m shelf meant 82% of the water on screen was one flat
         * #1d7fa6 - a colour that is perfectly good ocean blue and, spread edge to edge
         * with nothing happening in it, reads as a municipal boating lake. The reference
         * has three things this did not: a wide turquoise SHELF, a distinct band where it
         * turns blue, and a horizon it fades into.
         *
         * So: a third stop, a shelf widened from 16m to 44m, and haze. The hues are also
         * lifted - #1183b6 over #1d7fa6 is the same blue with the grey taken out, and the
         * shallows go up to a proper pale turquoise rather than a green-teal.
         */
        deep: '#1183b6',
        mid: '#1fb4cf',
        shallow: '#5fdcd0',
        shelf: 34,
        crest: '#c9f5ea',
        glint: '#fdf6e6',
        foam: '#f2f7f1',
        /*
         * The sky's own horizon stop is #e8eef0. This is that with the blue left in and a
         * little value taken out, so the far water still parts from the air along a line
         * instead of dissolving into it.
         */
        haze: '#b9d4e4',
        /*
         * The waterline is 26m from this camera, so a haze starting at 22 began IN the
         * shallows - sampled along the sight line, it took the whole shelf down to a
         * washed 0.38 saturation and the deep blue never appeared at all. Which is
         * trading one flat expanse for a paler flat expanse.
         *
         * Starting past the near water instead: the turquoise is at full strength where
         * it is closest and the fade does its work on the blue behind it, which is the
         * order air actually applies it in.
         */
        hazeFrom: 38,
        // Water is visible to about 70m from here, where the sky shell cuts it off.
        hazeTo: 74,
        hazeMax: 0.62,
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
   * The glasshouse, which is not the answer.
   *
   * A shot for a lead that goes nowhere, and it earns its place by going nowhere
   * USEFULLY. A player who suspects the water, the feed or the power is suspecting
   * something SHARED, and the fastest way to test a shared cause is to look at the other
   * place the same supply reaches. It is fine in there. That does not name the tree, but
   * it rules out every systemic explanation at once and leaves only something local to
   * one side of one tunnel - which is the shape of the real answer.
   *
   * Framed across the beds so the tunnel is in the foreground of the shot. The building
   * is nine metres past it and this is the only angle where both are in frame, which
   * quietly makes the comparison the beat is about.
   */
  scene.registerShot('glasshouse', {
    position: new THREE.Vector3(0.6, 2.2, 3.0),
    target: new THREE.Vector3(-8.4, 1.3, -5.8),
    duration: 2.6,
  });
  /**
   * Down the bank, which is where the second act happens.
   *
   * Along the strip rather than across it, so the player sees how far it runs. A shot
   * square-on would show a wall of grass and no length, and the length is the job.
   */
  scene.registerShot('the-bank', {
    position: new THREE.Vector3(-2.6, 1.5, 5.2),
    target: new THREE.Vector3(-3.0, 0.35, -2.4),
    duration: 2.2,
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

  /*
   * How much of the rig's afternoon reaches this room.
   *
   * Six of the eight scenes were sitting at the default 1, which means the workstation's
   * global key AND its sky fill landed on top of whatever practicals the room had lit
   * itself with. The sky term is the problem: it is an ambient, it has no direction, and at
   * full strength it raises every shadow in the room to roughly the value of every lit
   * surface. Reported as the contact rooms looking flat next to the menu room, and that is
   * exactly what it is - the menu room is lit by three practicals and nothing else.
   *
   * Lowering this does not make a room dark; it hands the room back to the lights that were
   * already in it and lets the corners go. Each value below is what the fiction says about
   * the place rather than a level: a house with the furniture gone, so nothing left in it to bounce light around
   */
  scene.daylight = 0.5;
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
  // Same treatment as the repair shop's: a broad stain under each line and a pale crust
  // at it. Dark-on-dark is invisible in a room lit by one bulb, and this mark is the
  // reason the records are gone.
  const tide: THREE.BufferGeometry[] = [];
  const tideCrust: THREE.BufferGeometry[] = [];
  for (const [height, depth] of [
    [0.26, 0.2],
    [0.19, 0.13],
  ] as const) {
    const band = new THREE.BoxGeometry(7, depth, 0.02);
    band.translate(0, height - depth / 2, -2.015);
    tide.push(band);

    const crust = new THREE.BoxGeometry(7, 0.022, 0.024);
    crust.translate(0, height, -2.013);
    tideCrust.push(crust);
  }
  scene.registerProp(
    'tide-silt',
    meshOf('TideSilt', mergeGeometries(tideCrust, false) ?? tideCrust[0], MAT.tideSilt)
  );
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
  const boxLidRoot = ENGINE.SceneNode.create({
    name: 'BoxLid',
    position: new THREE.Vector3(0.32, 0.02, 0.04),
    rotation: new THREE.Euler(0, 0, 0.22),
  });
  boxLidRoot.add(meshOf('BoxLidMesh', lid, MAT.plastic));
  boxRoot.add(boxLidRoot);

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
    actions: {
      /** The answer is in hand; the two-day search can finally be put away. */
      settle: (tweener) => {
        const from = boxLidRoot.position.clone();
        const turn = boxLidRoot.rotation.z;
        const to = new THREE.Vector3(0, 0.165, 0);
        tweener.add(
          (t) => {
            const eased = Ease.inOutCubic(t);
            boxLidRoot.position.lerpVectors(from, to, eased);
            boxLidRoot.rotation.z = turn * (1 - eased);
          },
          {
            duration: 1.15,
            delay: 1.0,
            easing: Ease.linear,
            channel: 'photo-box-settle',
          }
        );
      },
    },
  });

  /*
   * Four envelopes waiting, and the fifth still in the box.
   *
   * The final line has always been about Ileana realising she left Marta out; a merged
   * four-envelope mesh made that discovery exist only in prose. Separate nodes let the
   * missing fifth leave the photographs and let all five settle into an addressed row.
   */
  const lettersRoot = ENGINE.SceneNode.create({ name: 'Letters' });
  const letterNodes: ENGINE.SceneNode[] = [];
  const letterHomes: THREE.Vector3[] = [];
  for (let i = 0; i < 5; i++) {
    const envelope = new THREE.BoxGeometry(0.16, 0.003, 0.11);
    const home = i < 4
      ? new THREE.Vector3(0.34, 0.775 + i * 0.0035, -1.14 + jitter(rng, 0.01))
      : new THREE.Vector3(-0.55, 0.9, -1.06);
    const node = ENGINE.SceneNode.create({
      name: `Envelope${i + 1}`,
      position: home.clone(),
      rotation: new THREE.Euler(0, jitter(rng, i < 4 ? 0.06 : 0.18), 0),
    });
    node.add(meshOf(`EnvelopeMesh${i + 1}`, envelope, MAT.paper));
    node.visible = i < 4;
    lettersRoot.add(node);
    letterNodes.push(node);
    letterHomes.push(home);
  }

  let paperTime = 0;
  let addressed = false;
  scene.registerProp('letters', lettersRoot, {
    idle: (dt) => {
      if (addressed) return;
      paperTime += dt;
      for (let i = 0; i < 4; i++) {
        letterNodes[i].position.y = letterHomes[i].y + Math.sin(paperTime * 1.7 + i) * 0.0008;
      }
    },
    actions: {
      address: (tweener) => {
        addressed = true;
        const destinations = letterNodes.map((_, i) =>
          new THREE.Vector3(-0.28 + i * 0.2, 0.785 + i * 0.0015, -0.88 - Math.abs(2 - i) * 0.025)
        );
        letterNodes.forEach((node, i) => {
          node.visible = true;
          const from = node.position.clone();
          const fromTurn = node.rotation.y;
          const toTurn = (i - 2) * 0.045;
          tweener.add(
            (t) => {
              const eased = Ease.outCubic(t);
              node.position.lerpVectors(from, destinations[i], eased);
              node.rotation.y = fromTurn + (toTurn - fromTurn) * eased;
            },
            {
              duration: 0.9,
              delay: i * 0.1,
              easing: Ease.linear,
              channel: `address-envelope-${i}`,
            }
          );
        });
      },
    },
  });

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
    /*
     * Rebuilt along HER axis rather than the world's, which is what was wrong with them.
     *
     * She is turned 36 degrees (rotation.y = 0.2pi), so her forward is (0.59, 0, 0.81) and
     * her right is (0.81, 0, -0.59) - and the old pair were laid out as though she faced
     * straight down -z. Resolved against her actual facing, the right-hand target came out
     * 0.03m to her right: on her own centreline, at hip height, 0.30m out. That is not a
     * hand resting on a table, it is a hand tucked across the body, and CCD solved it by
     * swinging the elbow back behind her. Reported as arms bent oddly and behind her back.
     *
     * These sit 0.37m and 0.43m in front of her and about 0.17m either side of her centre,
     * which is a person with both hands on a table. Both are on the top - it spans
     * x -1.05..0.65 and z -1.5..-0.7 - and both stay 0.4m clear of the shoebox, so the note
     * above still holds: she has stopped, and her hands are not among the photographs.
     */
    handsOn: {
      left: new THREE.Vector3(-0.92, 0.79, -1.32),
      right: new THREE.Vector3(-0.66, 0.79, -1.44),
    },
    // Slower and smaller than the rest of the cast. She has been sorting a dead relative's
    // photographs for two days; the difference between her idle and Mirela's is the only
    // characterisation available without faces.
    liveliness: 0.7,
  });

  // -- Light -----------------------------------------------------------------
  // One window and one fill. A house with the curtains taken down and half the power off.
    /*
   * ## This room's shadow-casting key (D-4)
   *
   * A point light, so a cube map - six renders rather than one. That is the trade the repair
   * shop settled: the cheap lights in these rooms cast shadows nobody can see, and the one
   * that can reach the surfaces objects rest on is the expensive kind. A diorama is a small
   * set with a handful of props, which is where a cube is affordable.
   */
  const daylightKey = ENGINE.PointLightNode.create({
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
      /*
       * In the window, which is where the light from a window comes from.
       *
       * It was at (-0.35, 2.35, -1.7): five centimetres ABOVE the top of the glass,
       * a quarter of a metre below the ceiling and a quarter of a metre out into the
       * room. So the brightest thing in the frame was a pool on the head of the wall
       * with nothing visible making it - reported as the light up there not looking
       * like it comes from the bulb, which is exactly right: it does not come from
       * anything.
       *
       * Now at the centre of the glass, 4cm inside it. The window is the brightest
       * thing in the room again and the light falls into it from there, which is the
       * same §230 rule the bulb was moved into a fixture for - every light in this
       * game has to have something the player can see emitting it.
       *
       * It does not undo the clipping fix above. That was about how much of her the
       * light lands on, and she is 1.13m from here against 1.15m from where it was:
       * the same distance, differently angled. What changes is that it now rakes
       * across her from the side rather than standing on her head, which is what a
       * window three metres from somebody actually does.
       */
      position: new THREE.Vector3(-0.2, 1.75, -1.93),
      intensity: 10.5,
      color: new THREE.Color('#cfe0f0'),
      distance: 12,
      decay: 0.85,
    });
  castShadows(daylightKey as unknown as THREE.Object3D, {
    /*
     * 1024 and radius 2.5, and the sharper settings that were tried here are worth recording
     * because they were inert.
     *
     * A critic rejected this room with "no caster geometry survives in it - you cannot find
     * the tabletop, the four legs, or the woman inside that shape; it resolves as one
     * undifferentiated slab", and the obvious reading is that the shadow is over-blurred.
     * Raising the map to 2048 and dropping the radius to 1.0 changed the frame by nothing:
     * mean value 49.58 both ways, edge energy 1.87 against 1.86. shadow.radius only does
     * anything under PCFSoftShadowMap, and the resolution was never the limit.
     *
     * So the shadow is not blurred - it is accurate. A tabletop is a large flat rectangle and
     * it casts a large flat rectangle; the legs are thin and land as the thin strips the
     * critic actually found. Six faces of 2048 cube map for no visible change is pure cost,
     * so it goes back.
     *
     * The other half of that critique was wrong on measurement: it called the shadow "brown
     * against a blue-white floor" and read it as a fault, but the lit boards run r-b -7.3 and
     * the shadowed boards +21.9, because the key is cool daylight and removing it from warm
     * timber correctly leaves the timber. That was already right.
     */
    mapSize: 1024,
    radius: 2.5,
    normalBias: 0.02,
    bias: -0.0005,
  });
  scene.registerProp('daylight', daylightKey);;

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


  /**
   * The wall, a year after the water went down - see art/floodstain.
   *
   * Ileana's went under once and badly, and the person who cleaned it up afterwards is
   * the one who has just died. Stronger than the workshop, and nobody has painted over it.
   *
   * A finisher, not a build step, for the reason every material change in this project
   * has to be: MeshNode finishes its material load asynchronously, so anything assigned
   * during the build is quietly replaced by a load that was already in flight.
   */
  scene.registerFinisher(() => {
    const wall = scene.nodeFor('wall');
    if (!wall) return;
    const stained = applyFloodstain(wall as unknown as THREE.Object3D, 0.26, 1.0);
    if (!stained) console.warn('[scene] flood staining touched nothing on the wall');
  });

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
  const wettable = (
    base: THREE.Material,
    x: number,
    tone?: string
  ): THREE.MeshStandardMaterial => {
    const clone = (base as THREE.MeshStandardMaterial).clone();
    // Retoned before `dry` is captured, so the wetting pass darkens from the cellar's
    // colour rather than snapping back to the shared family's on the way out. See RUN_TONE.
    if (tone) clone.color.set(tone);
    runParts.push({
      material: clone,
      dry: clone.color.clone(),
      dryRoughness: clone.roughness,
      dryMetalness: clone.metalness,
      x,
    });
    return clone;
  };

  /**
   * The run's four materials, retoned for this room only.
   *
   * ## Why the shared family could not stay
   *
   * Measured off the default shot through ACES at exposure 0.62, the four spans rendered at
   * 19, 108, 188 and 15 out of 255. Twelve and a half times, end to end, on the one object
   * the entire mission is a search along - two spans invisible, one blown past Vasile's own
   * face. The player is asked to reason about four materials laid end to end by four
   * different people, and half of them were not on screen.
   *
   * Only about a third of that was the lighting; the rest is albedo. `MAT.plastic` is a
   * pale cream and `MAT.steel` is a near-black blue, and no light rig reconciles a 4.7x
   * albedo ratio on two objects a metre apart.
   *
   * ## Separated by HUE at equal value, which is the project's whole approach
   *
   * Retoned so the four sit between 48 and 108 - a 2.25x spread - and tell themselves apart
   * by colour instead: lead a warm grey, copper orange, the new plastic main blue (which is
   * what a modern water main actually is, and reads instantly as the recent repair), and
   * galvanised steel a neutral light grey. In a room lit by one warm bulkhead, hue is the
   * channel with headroom and value is the one that is already spent.
   *
   * Local because `wettable` clones - the note above it is explicit that darkening the
   * shared family here would wet Sanda's torch and every bracket in the repair shop.
   */
  const RUN_TONE: Record<string, string> = {
    // Lifted twice. Adding light to the dark end raised the pipe and the WALL BEHIND IT
    // together - 30/33 became 42/47 and the ratio never moved off 0.89 - because a pipe
    // 110mm off a wall shares every light with it. Only albedo separates the two.
    metal: '#b3aba0',
    copper: '#8a5a3c',
    plastic: '#5f7d92',
    steel: '#7d828a',
  };

  const joins: THREE.Vector3[] = [];
  for (const [from, to, material] of spans) {
    const pipe = new THREE.CylinderGeometry(0.055, 0.055, to - from, 8);
    pipe.rotateZ(Math.PI / 2);
    pipe.translate((from + to) / 2, runY + jitter(rng, 0.02), -2.0);
    scene.registerProp(
      `run-${material}`,
      meshOf(`Run-${material}`, pipe, wettable(MAT[material], (from + to) / 2, RUN_TONE[material]))
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
   * -- The stopcock, and what happens when the instruction was wrong -----------------------
   *
   * ## Why the run needed one
   *
   * The pipe puzzle used to resolve with a line of dialogue and the water level dropping.
   * Both of those are CONSEQUENCES; neither is the act. A stopcock is the one object in a
   * cellar that means "this is the thing you turn", and turning it is what the player has
   * spent the whole call working out how to justify - so now the answer has somewhere to
   * happen, in the room, on a thing they can see.
   *
   * It sits on the plastic-to-steel join, because a valve goes where a system changes and
   * that is the one place on this run where a fitting is not a surprise.
   *
   * ## The wheel is its own node
   *
   * Body, bonnet and wheel are separate for exactly one reason: the wheel turns and nothing
   * else does. A valve that spins whole is a wheel with a pipe stuck through it.
   */
  const valveRoot = ENGINE.SceneNode.create({
    name: 'Valve',
    position: new THREE.Vector3(1.4, runY, -2.0),
  });

  const valveBody: THREE.BufferGeometry[] = [];
  // A fat barrel round the run, with a bolted flange each side. The flanges are what say
  // "this was fitted into an existing pipe" rather than "this pipe has a lump in it".
  const barrel = new THREE.CylinderGeometry(0.1, 0.1, 0.17, 10);
  barrel.rotateZ(Math.PI / 2);
  valveBody.push(barrel);
  for (const side of [-1, 1] as const) {
    const flange = new THREE.CylinderGeometry(0.122, 0.122, 0.022, 12);
    flange.rotateZ(Math.PI / 2);
    flange.translate(side * 0.096, 0, 0);
    valveBody.push(flange);
  }
  /*
   * The bonnet, leaning out of the body toward the room.
   *
   * Not straight up. A vertical stem puts the handwheel edge-on to a camera that is barely
   * above the pipe, and an edge-on wheel is a line - the rotation the whole feature exists
   * to show would be invisible. Tipped 30 degrees forward it presents its face.
   */
  const bonnet = new THREE.CylinderGeometry(0.045, 0.068, 0.14, 8);
  bonnet.rotateX(-0.52);
  bonnet.translate(0, 0.09, 0.045);
  valveBody.push(bonnet);
  const bonnetCap = new THREE.CylinderGeometry(0.058, 0.058, 0.02, 8);
  bonnetCap.rotateX(-0.52);
  bonnetCap.translate(0, 0.148, 0.078);
  valveBody.push(bonnetCap);
  valveRoot.add(
    decorMesh('ValveBody', mergeGeometries(valveBody, false) ?? valveBody[0], MAT.metal)
  );

  /**
   * The handwheel, on a node tilted to match the bonnet so it turns about the stem.
   *
   * Four spokes and a rim, not a disc. A solid wheel gives the eye nothing to measure a
   * rotation against, and the entire point of this object is that the player watches it
   * turn. Spokes are the read; the rim is only there so it looks like a wheel when still.
   */
  const wheelNode = ENGINE.SceneNode.create({
    name: 'ValveWheel',
    position: new THREE.Vector3(0, 0.19, 0.1),
    rotation: new THREE.Euler(-0.52, 0, 0),
  });
  /*
   * 280mm across, which is generous for a 110mm run and is the right call anyway.
   *
   * Measured against the shot it is framed in, a correctly-scaled 160mm wheel subtends
   * 1.5 degrees against a 23-degree half-angle - six per cent of screen height, for the
   * object the entire request is built around. Plumbing accuracy is not worth an unreadable
   * hero prop, so it is sized to the frame instead of the pipe.
   */
  const wheelParts: THREE.BufferGeometry[] = [];
  wheelParts.push(new THREE.TorusGeometry(0.14, 0.016, 5, 18));
  for (let i = 0; i < 4; i++) {
    const spoke = new THREE.BoxGeometry(0.275, 0.018, 0.012);
    spoke.rotateZ((i * Math.PI) / 4);
    wheelParts.push(spoke);
  }
  const hub = new THREE.CylinderGeometry(0.025, 0.025, 0.055, 8);
  hub.rotateX(Math.PI / 2);
  wheelParts.push(hub);
  wheelNode.add(
    decorMesh(
      'ValveWheelMesh',
      mergeGeometries(wheelParts, false) ?? wheelParts[0],
      MAT.valveWheel
    )
  );
  valveRoot.add(wheelNode);

  /**
   * The actuator - which is not decoration, it is the reason any of this is allowed to
   * happen.
   *
   * ## The fiction had a hole in it
   *
   * OMNISCIENT_ has no hands. That is the premise of the whole game, and the one exception
   * is equipment on a network - which is how it drove the cameras in District 07 and how it
   * drove Adaeze's mower. A bare handwheel spinning on its own when the player presses send
   * would break that in the most visible way possible: either the machine grew hands, or
   * Vasile turned it, and he is stood four metres away with his back to it.
   *
   * So there is a motor on the stem. A grey box with cooling fins, a conduit dropping to
   * the wall, and a lamp on the front. It costs about forty triangles and it is the single
   * most load-bearing object in the room, because it is what makes the answer legal.
   *
   * ## And it is the 90s-futuristic note the scene was missing
   *
   * Every other room has one piece of hardware that is obviously newer than the building
   * around it - the plug on Mirela's plate, the unit in Adaeze's shed. The cellar had none:
   * it was fifty years of pipework and a wire-guarded lamp, with nothing in it from the era
   * the machine belongs to. This is that object, and it is sat on a lead pipe.
   */
  /**
   * One 56mm disc, built fresh per lamp so the three never share a buffer.
   *
   * Up from 38mm after a capture: at 3.1m a 19mm radius is about four pixels, and the state
   * of this lamp is the only thing telling the player whether the machine has the valve.
   */
  const lampDisc = (): THREE.BufferGeometry =>
    new THREE.CylinderGeometry(0.028, 0.028, 0.016, 10).rotateX(Math.PI / 2);

  const actuator: THREE.BufferGeometry[] = [];
  // Clamped to the near side of the body, low enough that it never crosses the spokes.
  const ACT = new THREE.Vector3(0.175, 0.03, 0.05);
  const casing = new THREE.BoxGeometry(0.13, 0.14, 0.11);
  casing.translate(ACT.x, ACT.y, ACT.z);
  actuator.push(casing);
  /*
   * Fins on TOP, which is where a heat sink goes and, more to the point, where they are
   * not in front of the lamp.
   *
   * The first version put three ribs on the front face at z + 0.068, and the status lamp at
   * z + 0.062 - so the fins stood 6mm proud of the one thing on this object that has to be
   * seen. Captured, the lamp was a yellow speck behind a grille.
   */
  for (let i = 0; i < 3; i++) {
    const fin = new THREE.BoxGeometry(0.14, 0.014, 0.02);
    fin.translate(ACT.x, ACT.y + 0.078, ACT.z + 0.03 - i * 0.032);
    actuator.push(fin);
  }
  // The drive collar, reaching back to the stem - it has to be seen to be connected.
  const drive = new THREE.CylinderGeometry(0.026, 0.026, 0.12, 6);
  drive.rotateZ(Math.PI / 2);
  drive.translate(ACT.x - 0.115, ACT.y + 0.05, ACT.z + 0.005);
  actuator.push(drive);
  /*
   * The conduit, and it now ARRIVES somewhere.
   *
   * It was a 420mm tube hanging straight down off the actuator and stopping in mid-air,
   * which read as a dowel somebody had left wedged in the pipework. A cable that ends in
   * nothing is worse than no cable: it draws the eye to a loose end.
   *
   * Two segments instead - down the side of the body, then back into the wall face at
   * z = -2.11 (0.11 behind the valve's own origin at z = -2.0). The lamp says the actuator
   * is powered; the conduit says it is REACHED, which is the half that matters, and a
   * termination is what makes that legible.
   */
  const conduitDrop = new THREE.CylinderGeometry(0.014, 0.014, 0.26, 6);
  conduitDrop.translate(ACT.x + 0.045, ACT.y - 0.19, ACT.z + 0.02);
  actuator.push(conduitDrop);
  const intoWall = new THREE.CylinderGeometry(0.014, 0.014, 0.2, 6);
  intoWall.rotateX(Math.PI / 2);
  intoWall.translate(ACT.x + 0.045, ACT.y - 0.31, ACT.z - 0.06);
  actuator.push(intoWall);
  valveRoot.add(
    decorMesh('ValveActuator', mergeGeometries(actuator, false) ?? actuator[0], MAT.actuator)
  );

  /**
   * The status lamp, unlit, so it holds its colour whatever the bulkhead is doing.
   *
   * Amber and blinking on standby - the cheapest possible way to say "this is on the
   * network and waiting" - solid green while it is being driven, and red once the run has
   * let go. Three states, one 20mm disc, and it tells the player where they are in the
   * request without a line of dialogue.
   */
  /*
   * Three lamps stacked in the same hole, and only one of them ever visible.
   *
   * The obvious version is one mesh whose material is swapped. It does not survive: a
   * MeshNode's material is not durable here - an asset load still in flight will put the
   * original back underneath you, and the lamp silently reverts to amber some frames after
   * the player watched it go green. Visibility is not a material, so nothing overwrites it.
   */
  type ValveState = 'standby' | 'live' | 'fault';
  const LAMPS: Record<ValveState, ENGINE.MeshNode> = {
    standby: decorMesh('ValveLampStandby', lampDisc(), MAT.lamp),
    live: decorMesh('ValveLampLive', lampDisc(), MAT.knowledgeLamp),
    fault: decorMesh('ValveLampFault', lampDisc(), MAT.warningLamp),
  };
  for (const lamp of Object.values(LAMPS)) {
    lamp.position.set(ACT.x, ACT.y + 0.035, ACT.z + 0.06);
    valveRoot.add(lamp);
  }

  let valveState: ValveState = 'standby';
  let blink = 0;

  const setState = (next: ValveState): void => {
    valveState = next;
    blink = 0;
    for (const [state, lamp] of Object.entries(LAMPS)) lamp.visible = state === next;
  };
  setState('standby');

  /**
   * The spray, for when the answer was wrong.
   *
   * A pool of points at every join on the run, dead until something bursts. Same shape as
   * the mower's clippings and for the same reason: this fires on a beat transition, and
   * allocating a particle system at that moment is allocating in the one frame the player is
   * watching hardest.
   *
   * It comes out of the JOINS and not the valve, and that is the whole story of the failure
   * told in geometry: the valve did exactly what it was told. It was the instruction that
   * was wrong, and fifty years of other people's fittings could not take what it sent them.
   */
  const SPRAY_PER_JOIN = 24;
  const sprayCount = joins.length * SPRAY_PER_JOIN;
  const sprayAt = new Float32Array(sprayCount * 3);
  const sprayVelocity = new Float32Array(sprayCount * 3);
  const sprayLife = new Float32Array(sprayCount);
  // Parked below the floor rather than at the origin, so the pool is invisible before it is
  // ever used instead of being a knot of points sitting in the middle of the room.
  for (let i = 0; i < sprayCount; i++) sprayAt[i * 3 + 1] = -8;
  const sprayGeometry = new THREE.BufferGeometry();
  sprayGeometry.setAttribute('position', new THREE.BufferAttribute(sprayAt, 3));
  const sprayPoints = new THREE.Points(
    sprayGeometry,
    new THREE.PointsMaterial({
      color: new THREE.Color('#b6d2dc'),
      size: 0.034,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    })
  );
  sprayPoints.frustumCulled = false;
  const sprayRoot = ENGINE.SceneNode.create({ name: 'Spray' });
  sprayRoot.add(sprayPoints);

  const sprayPosition = sprayGeometry.getAttribute('position') as THREE.BufferAttribute;
  const sprayArray = sprayPosition.array as Float32Array;
  let sprayFor = 0;

  scene.registerProp('spray', sprayRoot, {
    idle: (deltaTime) => {
      if (sprayFor <= 0) return;
      sprayFor -= deltaTime;
      // Clamped for the same reason the flies are: a stalled frame with gravity in it puts
      // every droplet through the floor at once.
      const step = Math.min(deltaTime, 0.05);
      for (let i = 0; i < sprayCount; i++) {
        if (sprayLife[i] <= 0) continue;
        sprayLife[i] -= step;
        const o = i * 3;
        if (sprayLife[i] <= 0) {
          sprayArray[o + 1] = -8;
          continue;
        }
        sprayVelocity[o + 1] -= 9.4 * step;
        sprayArray[o] += sprayVelocity[o] * step;
        sprayArray[o + 1] += sprayVelocity[o + 1] * step;
        sprayArray[o + 2] += sprayVelocity[o + 2] * step;
      }
      sprayPosition.needsUpdate = true;
    },
  });

  /** Charge the pool and let go. Called by the valve's burst action. */
  const burstJoints = (): void => {
    joins.forEach((at, index) => {
      for (let k = 0; k < SPRAY_PER_JOIN; k++) {
        const i = index * SPRAY_PER_JOIN + k;
        const o = i * 3;
        sprayArray[o] = at.x;
        sprayArray[o + 1] = at.y + 0.07;
        sprayArray[o + 2] = at.z;
        /*
         * Out, up and toward the room.
         *
         * A joint under pressure sprays perpendicular to the pipe from wherever it has
         * failed, which here is the near side - so the fan is biased hard to +z, which is
         * also the only side the camera can see. The upward component is what makes it a
         * jet rather than a leak; without it this reads as the pipe crumbling.
         */
        sprayVelocity[o] = range(rng, -1.0, 1.0);
        sprayVelocity[o + 1] = range(rng, 1.0, 2.7);
        sprayVelocity[o + 2] = range(rng, 0.8, 2.5);
        sprayLife[i] = range(rng, 0.5, 1.15);
      }
    });
    sprayPosition.needsUpdate = true;
    sprayFor = 2.6;
  };

  let valveTurn = 0;

  /**
   * The motor's own curve, shared by both endings, because it is the same motor.
   *
   * A one-second hold while the camera parks and the command travels, then a stiff break
   * and a free run - which is what a gate valve does and also what an actuator does, since
   * it has to overcome the seat before it has anything to spin against.
   *
   * The hold is not padding. The `valve` shot takes 1.0s to arrive; without it the wheel is
   * 89% turned by the time the camera gets there, and the player is shown the aftermath of
   * the thing they pressed the button for.
   */
  const LEAD_IN = 1.0;
  const TURN_TIME = 2.6;
  const BURST_TIME = 3.6;
  const motor = (t: number): number => {
    const at = t * TURN_TIME;
    if (at <= LEAD_IN) return 0;
    const along = Math.min(1, (at - LEAD_IN) / (TURN_TIME - LEAD_IN));
    return 1 - (1 - along) ** 3;
  };

  scene.registerProp('valve', valveRoot, {
    // Inked: it is the object the whole call is trying to reach.
    inked: true,
    anchors: { default: new THREE.Vector3(0, 0.24, 0.12) },
    /*
     * The blink. Slow on standby, urgent on fault, steady while it is being driven.
     *
     * Rates chosen the way real panels choose them: a heartbeat you stop noticing when
     * nothing is wrong, and one you cannot stop noticing when something is.
     */
    idle: (deltaTime) => {
      if (valveState === 'live') return;
      blink += deltaTime;
      const period = valveState === 'fault' ? 0.34 : 1.5;
      LAMPS[valveState].visible =
        blink % period < period * (valveState === 'fault' ? 0.5 : 0.62);
    },
    actions: {
      /**
       * Turned, and seated.
       *
       * Two and a half revolutions on an ease-out, because a gate valve is stiff at the
       * break and free afterwards - and it STOPS. A stopcock that coasts gently to a halt
       * was never seating against anything.
       */
      turn: (tweener) => {
        const from = valveTurn;
        valveTurn = from + Math.PI * 5;
        setState('live');
        tweener.add(
          (t) => {
            const drive = motor(t);
            wheelNode.rotation.set(-0.52, 0, from + (valveTurn - from) * drive);
          },
          { duration: TURN_TIME, easing: Ease.linear, channel: 'valve' }
        );
      },

      /**
       * Turned, and then the run lets go.
       *
       * The wheel does the same thing it does when the player is right, which is the point:
       * the machine carried the instruction out exactly. The DELAY is what turns this from
       * an error message into a consequence - it shuts, the pressure has to go somewhere,
       * and a moment later the weakest fittings on the run find out where.
       *
       * Linear rather than eased, and compressed into the first 60% of the tween, so the
       * wheel finishes and there is a beat of nothing before the burst. That silence is
       * doing more work than the particles are.
       */
      burst: (tweener) => {
        const from = valveTurn;
        valveTurn = from + Math.PI * 5;
        // Green while it drives, because the actuator does not know it is wrong either.
        setState('live');
        let fired = false;
        tweener.add(
          (t) => {
            const drive = motor((t * BURST_TIME) / TURN_TIME);
            wheelNode.rotation.set(-0.52, 0, from + (valveTurn - from) * drive);
            /*
             * 2.95s in: a third of a second after the wheel seats at 2.60s.
             *
             * That gap is the entire difference between a consequence and an error message.
             * The valve finishes, the room is quiet for a beat, and THEN the pressure finds
             * the weakest fittings on the run. Fire it on the same frame the wheel stops and
             * it reads as the valve having broken, which is the opposite of the point.
             */
            if (!fired && t * BURST_TIME > 2.95) {
              fired = true;
              burstJoints();
              setState('fault');
            }
          },
          { duration: BURST_TIME, easing: Ease.linear, channel: 'valve' }
        );
      },
    },
  });

  /*
   * Ending the call and coming back has to give the player the valve they found the first
   * time - shut, green and already answered is a mission that cannot be replayed.
   */
  scene.onReset(() => {
    valveTurn = 0;
    wheelNode.rotation.set(-0.52, 0, 0);
    sprayFor = 0;
    for (let i = 0; i < sprayCount; i++) {
      sprayLife[i] = 0;
      sprayArray[i * 3 + 1] = -8;
    }
    sprayPosition.needsUpdate = true;
    setState('standby');
  });

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
  /**
   * Rings on the flood.
   *
   * The water is one quad with a ripple in its normals: it catches the lamp, it shifts, and
   * it is perfectly still. Still is what a plane does, and a cellar that is actively filling
   * should not look settled. Rings say it is being fed from somewhere, and they cost no
   * light, no shadow and no second surface.
   *
   * Bounded to the part of the floor the camera can actually see - an ambient ring behind
   * the lens is a wasted draw and, worse, a wasted event, because the pool is finite and one
   * spent off-screen is one not available where a drip is about to land.
   */
  const ripples = createRipples({
    level: WATER_LEVEL,
    bounds: [-3.1, 3.1, -1.8, 2.2],
    every: 2.2,
    seed: 'cellar-ripples',
  });
  scene.registerProp('ripples', ripples.root, { idle: (dt) => ripples.idle(dt) });

  const drips = ENGINE.SceneNode.create({ name: 'RunDrips', position: new THREE.Vector3() });
  const dripBodies = joins.map((at, i) => {
    const bead = new THREE.SphereGeometry(0.019, 6, 5);
    // Slightly egg-shaped. A perfect sphere reads as a ball bearing, not as water.
    bead.scale(1, 1.35, 1);
    const node = meshOf(`Drip${i}`, bead, MAT.floodwater);
    node.position.copy(at);
    node.visible = false;
    drips.add(node);
    return { node, at, phase: range(rng, 0, 3.2), landed: false };
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
          // The next drop is forming, so the last one has landed and its latch can reset.
          drip.landed = false;
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
          /*
           * The ring, at the instant it arrives.
           *
           * This is the whole reason the ripples exist: a drop that falls into water and
           * leaves no mark is a drop falling in front of water. Fired once per cycle on a
           * latch rather than on a frame comparison, because at 200fps `fall >= 1` is true
           * for several frames running and that would stack four rings on one impact.
           */
          if (!drip.landed && fall >= 0.98) {
            drip.landed = true;
            ripples.splash(drip.at.x, drip.at.z, 1);
          }
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
  const outfallRoot = ENGINE.SceneNode.create({ name: 'Outfall' });
  outfallRoot.add(meshOf('OutfallPipe', outfall, wettable(MAT.steel, 3.05)));

  /*
   * Pressure reaching the wall, visible at the mouth of the run.
   *
   * The travelling wet front proves topology, but its last half metre used to terminate in
   * a dark pipe. A small moving meniscus gives the route an endpoint and makes the broad
   * release in the sound mix belong to something on screen. It stays restrained: the
   * actual outfall is outside, and this is only the water passing through the inner mouth.
   */
  const outfallMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#8fc6be'),
    transparent: true,
    opacity: 0.08,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const outfallFlow = meshOf('OutfallFlow', new THREE.CircleGeometry(0.058, 14), outfallMaterial);
  outfallFlow.position.set(3.05, runY, -1.892);
  outfallFlow.visible = false;
  outfallRoot.add(outfallFlow);

  scene.registerProp('outfall', outfallRoot, {
    anchors: { default: new THREE.Vector3(3.05, runY, -1.89) },
    actions: {
      release: (tweener) => {
        outfallFlow.visible = true;
        tweener.add(
          (t) => {
            const arrive = Ease.outCubic(t);
            const pulse = 1 + Math.sin(t * Math.PI * 5) * 0.12 * (1 - t);
            outfallFlow.scale.setScalar(pulse);
            outfallMaterial.opacity = 0.08 + arrive * 0.34;
          },
          {
            duration: 1.25,
            easing: Ease.linear,
            channel: 'outfall-release',
            onComplete: () => {
              outfallFlow.scale.setScalar(1);
              outfallMaterial.opacity = 0.42;
            },
          }
        );
      },
    },
  });

  /**
   * The three settable junctions - and the fourth attempt at what they should look like.
   *
   * ## The floor has to stay empty water
   *
   * This object has now been, in order: three dark slabs lying flat under the flood, three
   * plates leaning against the back wall, and three boxes standing out of the water. Each
   * one was reported by the player as an unidentifiable rectangle, and each time I made the
   * NEXT rectangle more legible instead of asking why a rectangle was there at all.
   *
   * The answer, on the third strike, is that the floor of this room is a still sheet of
   * water, and anything set down on it competes with the pipework for attention while
   * telling the player nothing. It is clutter whatever shape it is.
   *
   * ## Levers, on the run, where the plumbing already is
   *
   * Vasile's line is "every one of them can be turned to send it on a different way", and a
   * lever cock is exactly that object: a tee off the main with a handle on it. Small,
   * unmistakably plumbing, and the same family as the stopcock at the other end - so the
   * three things the player must set now rhyme with the one thing the machine will turn.
   *
   * On the run at 1.35m rather than in the water at 0.2m, which puts them in the same band
   * of the frame as the pipe, the valve and Vasile's hands, and leaves the flood as the one
   * unbroken surface it should always have been.
   */
  const openings: THREE.BufferGeometry[] = [];
  const collars: THREE.BufferGeometry[] = [];
  /*
   * Spaced to clear the two things they must not hide behind or crowd.
   *
   * The first pass put them at -1.5, -0.4 and 0.7, and the leftmost landed directly behind
   * Vasile at x = -1.15 - so the player could count two junctions in a request that turns on
   * there being three. They sit between him and the stopcock at 1.4 instead, which is also
   * the readable order: the man, the three things to set, the thing that gets turned.
   */
  for (let i = 0; i < 3; i++) {
    const x = -0.45 + i * 0.7;
    // The tee body, sitting on the near face of the run. Metal, like the pipe it taps.
    const tee = new THREE.CylinderGeometry(0.075, 0.075, 0.11, 8);
    tee.rotateX(Math.PI / 2);
    tee.translate(x, runY, -1.94);
    collars.push(tee);
    /*
     * The handle: a flat lever, each at its own angle.
     *
     * Different angles because they are set differently - that is the fiction of the puzzle,
     * three junctions left however the last people to touch them left them - and because
     * three identical levers read as a manufactured rack rather than as fifty years of other
     * people's decisions.
     */
    const lever = new THREE.BoxGeometry(0.028, 0.21, 0.032);
    lever.translate(0, 0.095, 0);
    lever.rotateZ(range(rng, -0.7, 0.7) + (i - 1) * 0.35);
    lever.translate(x, runY, -1.86);
    openings.push(lever);
    // A boss where the lever meets the tee, so the handle has something to pivot on.
    const boss = new THREE.CylinderGeometry(0.032, 0.032, 0.06, 6);
    boss.rotateX(Math.PI / 2);
    boss.translate(x, runY, -1.87);
    collars.push(boss);
  }
  scene.registerProp(
    'covers',
    meshOf('Covers', mergeGeometries(openings, false) ?? openings[0], MAT.valveWheel),
    {
      /*
       * Inked: the three handles. What the request is a search along.
       *
       * Only the HANDLES are painted - the tee bodies and bosses are metal like the pipe
       * they tap. Painting the whole assembly made each one an orange hook; a real lever
       * cock is a metal fitting with a coloured handle, and the paint is on the handle
       * precisely because the handle is the part you are meant to find. Same red as the
       * stopcock, so the player connects "these three turn" with "and then that one turns".
       */
      inked: true,
      anchors: { default: new THREE.Vector3(0.25, runY + 0.17, -1.86) },
    }
  );
  scene.registerProp(
    'cover-collars',
    meshOf('CoverCollars', mergeGeometries(collars, false) ?? collars[0], MAT.metal)
  );

  /**
   * The chalk marks. Four springs, four heights, and the highest one dated.
   *
   * §240 - real content, and it is the quietest piece of storytelling in the room: this
   * building floods, everybody knows it floods, and somebody has been standing here with a
   * piece of chalk every year instead of anybody fixing it.
   */
  const marks: THREE.BufferGeometry[] = [];
  for (const height of [0.42, 0.66, 0.81, 0.98] as const) {
    /*
     * A different length every year, because a man with a piece of chalk does not measure.
     *
     * They were all 300mm and 18mm thick in `MAT.paper` - four identical bright bars
     * standing 10mm off the wall, which the player read as "three floating white ones".
     * Identical length is most of why: four things the same size in a column is a scale, not
     * four separate occasions. And 18mm of paper-white catches the fill on its edge, which
     * is what detached them from the wall.
     *
     * 6mm now, in `MAT.chalkMark`, at lengths that disagree.
     */
    const mark = new THREE.BoxGeometry(range(rng, 0.19, 0.34), 0.006, 0.014);
    mark.rotateZ(jitter(rng, 0.045));
    mark.translate(-2.4 + jitter(rng, 0.11), height, -2.103);
    marks.push(mark);
  }
  scene.registerProp(
    'marks',
    meshOf('Marks', mergeGeometries(marks, false) ?? marks[0], MAT.chalkMark)
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
    /*
     * The underlayer came down from '#b9ad92'. That pale khaki against near-black
     * overalls was a 2.5:1 luma jump, and under the cellar lamp every sliver of it -
     * the collar strip, the cuffs, the shirt front - read as a white GLINT. He looked
     * varnished. Two shader passes went hunting a specular that was never there before
     * anyone sampled the pixels: #cabfa8, which is this exact colour, lit. The fix is
     * what it always was - a working man's undershirt is not cream after thirty years
     * under a school.
     */
    // Hardware down with it: oiled steel, not chrome. See the note in character.ts.
    colors: { garment: '#3d4a53', underlayer: '#6e685a', hardware: '#565149' },
    /**
     * Back against the wall by the run, not in the middle of the floor.
     *
     * He was at (0.55, 0, -0.05), which put him two thirds of the way along the camera's
     * own sightline to its target - a 1.78m man filling the frame from behind, with the
     * water, the covers and the four-material run all behind him. The whole room was
     * hidden by the person describing it.
     */
    position: new THREE.Vector3(-1.15, 0, -1.6),
    // 90 degrees, so the run is in front of him rather than behind. See `handsOn`.
    rotation: new THREE.Euler(0, Math.PI / 2, 0),
    /**
     * No IK. He faces along the run and gestures at it, and that is the whole staging.
     *
     * ## Why the reach came off
     *
     * There was a `handsOn.right` target on the near-top of the pipe, and the history of it
     * is three rounds of correction: the arm went behind his back, then it was re-aimed, then
     * the facing was changed to suit it. Every round fixed the previous round's artefact and
     * none of them was ever better than not solving the arm at all.
     *
     * The idle clip already has him talking with his hands, which is what a man explaining
     * his own cellar does. Pinning one wrist to a fixed point in the room fights that clip
     * for the whole call - the solver holds the hand still while the animation tries to move
     * the shoulder, and the elbow takes the difference. A contact who touches nothing reads
     * as a person; a contact welded to a pipe reads as a mannequin near a pipe.
     *
     * The facing stays at 90 degrees. That was a separate and correct change - it puts the
     * run in front of him instead of behind him, and gives the camera a three-quarter view
     * of his face instead of a flat-on one. It never depended on the reach.
     *
     * `settleWrists` goes with the IK: it existed to correct the arm the solver was NOT
     * driving, and with no solver there is nothing to correct.
     */
    liveliness: 1.15,
  });

  // -- Light -----------------------------------------------------------------
  /**
   * One bulkhead lamp on the wall and a cold spill off the water. A cellar has no windows,
   * so this is the only room in the game lit entirely by its own fittings.
   *
   * That sentence was aspirational until `daylight` existed. The rig's key and hemisphere
   * are infinite and reach every diorama, so this room was getting a warm late afternoon
   * through a ceiling it does not have - and getting most of its light from it. See the
   * note on ContactScene.daylight for the measurement that found it.
   *
   * 0.3, not 0. Light gets down a stairwell and in round a hatch; a cellar is dim, not
   * sealed, and at zero the four local pools read as torches in a cave.
   */
  scene.daylight = 0.3;
  /**
   * The bulkhead, which was a sphere.
   *
   * Reported as not recognisable, and it was not a lamp - it was a 120mm ball of emissive
   * material stuck on a wall, so with bloom over it the only thing on screen was an orange
   * disc. Nothing about it said fitting, and the brightest object in the room read as a
   * smudge.
   *
   * A bulkhead is three things and it needs all three: a plate bolted to the wall, a
   * diffuser standing off it, and a WIRE GUARD over that. The guard is what makes it
   * recognisable - unmistakably industrial, exactly what a school cellar has because
   * somebody will eventually put a ladder through it, and nothing else in the game has one.
   * It also breaks the bloom into ribs instead of letting it stay a circle, which is most
   * of what turns a blob into a lamp.
   */
  const lampAt = new THREE.Vector3(-0.4, 2.05, -2.0);
  const housing: THREE.BufferGeometry[] = [];

  const plate = new THREE.CylinderGeometry(0.15, 0.16, 0.035, 12);
  plate.rotateX(Math.PI / 2);
  plate.translate(lampAt.x, lampAt.y, lampAt.z + 0.018);
  housing.push(plate);

  /*
   * The guard: a rim and four ribs over the front of the glass.
   *
   * Modelled rather than suggested, because at this distance each rib is a couple of pixels
   * and the SILHOUETTE is the entire read - a lamp with bars across it is a bulkhead, and
   * a lamp without them is a bulb.
   */
  const rim = new THREE.TorusGeometry(0.132, 0.008, 5, 14);
  rim.translate(lampAt.x, lampAt.y, lampAt.z + 0.135);
  housing.push(rim);
  for (let i = 0; i < 4; i++) {
    const rib = new THREE.TorusGeometry(0.135, 0.007, 4, 10, Math.PI);
    rib.rotateY(Math.PI / 2);
    rib.rotateZ(Math.PI / 2 + (i * Math.PI) / 4);
    rib.translate(lampAt.x, lampAt.y, lampAt.z + 0.02);
    housing.push(rib);
  }
  scene.registerProp(
    'bulkhead-guard',
    meshOf('BulkheadGuard', mergeGeometries(housing, false) ?? housing[0], MAT.metal)
  );

  // The diffuser, squashed against the plate the way a bulkhead's glass is.
  const shade = new THREE.SphereGeometry(0.115, 12, 9);
  shade.scale(1, 1, 0.78);
  shade.translate(lampAt.x, lampAt.y, lampAt.z + 0.085);
  scene.registerProp('bulkhead', meshOf('Bulkhead', shade, MAT.lamp));

  /*
   * ## This room's shadow-casting key (D-4)
   *
   * A point light, so a cube map - six renders rather than one. That is the trade the repair
   * shop settled: the cheap lights in these rooms cast shadows nobody can see, and the one
   * that can reach the surfaces objects rest on is the expensive kind. A diorama is a small
   * set with a handful of props, which is where a cube is affordable; the warehouse is where
   * it is not.
   */
  const bulkheadLamp = ENGINE.PointLightNode.create({
    name: 'Bulkhead',
    position: lampAt.clone().add(new THREE.Vector3(0, 0, 0.2)),
    // 11 down to 9.5. It is still the key and still the brightest thing in the room; the
    // run no longer needs it to reach six metres, so it can go back to being a lamp.
    /*
     * The light beat that runs on this lamp takes it 9.5 -> 11.2 over 3.2s, and D-3 asked
     * whether that is visible at all or whether it is a number nobody ever sees move.
     * Measured by holding it at t=1 and photographing both ends: the frame mean goes 47.31 to
     * 49.53, a quarter of the picture changes by more than three levels, and the peak change
     * is 29. It reads - and it reads as the room coming up rather than as a light switching,
     * which is what a beat spread over three seconds is for.
     */
    intensity: 9.5,
    color: new THREE.Color('#ffdcae'),
    distance: 7,
    decay: 1.3,
  });
  castShadows(bulkheadLamp as unknown as THREE.Object3D, {
    mapSize: 1024,
    radius: 2.5,
    normalBias: 0.02,
    bias: -0.0005,
  });
  scene.registerProp('lamp', bulkheadLamp);

  /*
   * ## F10's first beat: the cellar comes up when the water goes
   *
   * The lighting in this game is graded once and never moves, and the cue grammar has carried
   * camera moves and prop animations per beat for months with nothing using it for light. This
   * is the smallest honest use of it: one lamp, one number, on the transition the whole mission
   * has been working toward.
   *
   * It goes UP rather than down, and that is deliberate. Every version of this beat that
   * darkens something also makes something harder to see, and a room that gets harder to read
   * at the moment the player wins is a punishment for winning. A cellar with the flood gone is
   * a cellar somebody can work in; the lamp reaching further is the whole idea.
   *
   * 9.5 to 11.2 is under twenty per cent - enough to feel as a change, not enough to blow the
   * pipe run's highlights, which sit close to clipping already.
   */
  scene.registerLightBeat(
    'cellar',
    (t) => {
      bulkheadLamp.intensity = 9.5 + t * 1.7;
    },
    3.2
  );

  /*
   * ## The two blue bounce lights are gone, and the reason is on the floor
   *
   * There were two cold point lights standing in for light bouncing off the flood, at
   * (0.2, 0.55, -0.4) and (-2.4, 0.55, -1.3). They were reported as "two blue lights", and
   * that is precisely what they had become: not a bounce, but two visible glowing discs
   * sitting on the water.
   *
   * The cause is in floodwater.ts, which sets `metalness: 0.30, roughness: 0.31` on the
   * flood - deliberately, so the surface has some mirror in it. A glossy surface returns a
   * SPECULAR HIGHLIGHT for every punctual light above it, one bright disc per light, and a
   * point light 550mm above a glossy plane puts that disc directly beneath itself. So each
   * bounce light drew a picture of itself on the thing it was pretending to be a bounce off.
   *
   * A bounce is diffuse and comes from a whole plane; a point light is neither. There is no
   * version of this trick that does not leave its own reflection on the water, so both are
   * out, and the flood is lit by the fittings that are actually in the room.
   *
   * (This is also the answer to why the flood shows highlights when Mirela's puddle was said
   * to have no reflections: those are direct specular from named lights, which any lit
   * material gives for free. An ENVIRONMENT reflection - the room mirrored in the water -
   * needs a PMREM cubemap and does not exist in this project. See the note in glass.ts.)
   */

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
      /*
       * Moved after a capture, and this was the worst thing in the room.
       *
       * Vasile was turned to face the pipe this session, at his own request. Nobody
       * re-derived the fill that was placed when he faced the camera - and at (1.9, 1.7,
       * 1.4) his face is 4.21m from a light whose cutoff distance is 4.4m, where three's
       * falloff term is (1 - (d/cutoff)^4)^2 = 0.026. It was contributing two per cent of
       * itself. Measured off the frame, his face rendered at 30-60 against the wall behind
       * his head at 150-170: the contact, in the contact view, was a silhouette.
       *
       * On his eyeline now and inside its own range, coming from the camera side so it
       * lands on the cheek the lens can actually see.
       */
      position: new THREE.Vector3(0.75, 1.72, -0.25),
      intensity: 3.2,
      color: new THREE.Color('#a8c0d4'),
      distance: 4.5,
      decay: 1.35,
    })
  );

  scene.registerProp(
    'run-wash',
    ENGINE.PointLightNode.create({
      name: 'RunWash',
      /*
       * Moved off the run and up into the room, which is the fix.
       *
       * It sat 900mm from a six-metre pipe at decay 1.4, so it was not a wash, it was a
       * spotlight on whichever span it happened to be nearest - the plastic one, at 188.
       * Falloff along the run was 6.8x from one end to the other before albedo was even
       * considered.
       *
       * From up by the joists at the room's centre, every span is between 2.5m and 4.2m
       * away, and at decay 1.05 that is a 1.9x gradient across the whole run - a gradient
       * rather than a hotspot. Still motivated: it is the light in the ceiling void that a
       * cellar this old has, and it falls on the pipework because the pipework is up there
       * with it.
       */
      position: new THREE.Vector3(0.2, 2.15, 0.3),
      // 6.0 down to 3.6. Measured off the frame the copper span came out at 165 and the
      // wall behind Vasile at 111-170 - the wash had stopped being a wash and become the
      // room's ambient, which is how a flooded cellar ends up brighter than its own lamp.
      intensity: 3.6,
      color: new THREE.Color('#ffd8b0'),
      distance: 9,
      decay: 1.05,
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
    // Follows the junctions up onto the run. They were on the floor and this looked down at
    // the floor; they are lever cocks on the pipe now, so it looks along it.
    position: new THREE.Vector3(1.55, 1.62, 0.75),
    target: new THREE.Vector3(0.15, 1.36, -1.9),
    duration: 2.2,
  });
  /**
   * The answer's shot: the stopcock, the run it sits on, and the floor it drains to.
   *
   * ## It has to hold three things at once
   *
   * This one frame carries both endings. The valve has to be big enough to watch turn, the
   * joints down the run have to be in it so a burst reads as the RUN letting go rather than
   * a puff of steam at the valve, and the floor has to be in it so the water going down is
   * visible in the same shot. A tight close-up gets the first and loses the other two.
   *
   * Composed against the numbers rather than by eye, at 16:9 with a 46-degree vertical fov
   * (23 vertical / 37 horizontal half-angles):
   *
   *   - the wheel sits 6 degrees left of the axis, so it lands at 42% of screen width -
   *     clear of the console panel, which owns the right 35%
   *   - it subtends 2.6 degrees, so 11% of screen height: readable without being a poster
   *   - the joint at x = -0.2 falls at 11% of width, in frame, so the burst has somewhere
   *     to happen that is not on top of the valve
   *   - the floor plane clears the bottom edge by about 8% of height
   */
  scene.registerShot('valve', {
    position: new THREE.Vector3(2.4, 1.95, 0.9),
    target: new THREE.Vector3(1.7, 1.05, -2.15),
    // 1.0s, and the valve's two actions both hold for exactly that long before the motor
    // picks up - see LEAD_IN. The camera has to be parked before the thing it came to
    // watch happens, or the player watches it through a move.
    duration: 1,
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
    // The guard is metal on a wall like everything else down here; the diffuser inside it
    // is unlit and takes no grading at all.
    ['bulkhead-guard', CERTAINTY.SHAPED],
    ['light-fitting', CERTAINTY.SHAPED],
    ['bulb', CERTAINTY.SHAPED],
    // The chalk marks are evidence the machine can see for itself once it is drawing the
    // wall - somebody has been measuring this flood for years, and that reads without
    // anybody saying it.
    ['marks', CERTAINTY.SHAPED],
    ['cover-collars', CERTAINTY.SHAPED],
    // The rings are unlit and are not a thing the machine is uncertain about - they are the
    // water moving, and the water is the one fact nobody in this call disputes.
    ['ripples', CERTAINTY.KNOWN],
    /*
     * The stopcock is KNOWN from the first frame, and it is the only thing down here that
     * is. Everything else in the cellar the machine has been told about; the actuator on
     * this valve is a thing it is CONNECTED TO - it is reading the lamp off the network the
     * same way it read District 07's cameras. It cannot be uncertain about the one object
     * it is holding a wire to.
     */
    ['valve', CERTAINTY.KNOWN],
    ['spray', CERTAINTY.KNOWN],
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
    // No revealOn anywhere, so its box could never open - see the note on Mirela's shelf.
    ['ruined-box', CERTAINTY.SHAPED],
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

  /*
   * How much of the rig's afternoon reaches this room.
   *
   * Six of the eight scenes were sitting at the default 1, which means the workstation's
   * global key AND its sky fill landed on top of whatever practicals the room had lit
   * itself with. The sky term is the problem: it is an ambient, it has no direction, and at
   * full strength it raises every shadow in the room to roughly the value of every lit
   * surface. Reported as the contact rooms looking flat next to the menu room, and that is
   * exactly what it is - the menu room is lit by three practicals and nothing else.
   *
   * Lowering this does not make a room dark; it hands the room back to the lights that were
   * already in it and lets the corners go. Each value below is what the fiction says about
   * the place rather than a level: night, at a door - the clue is in the name, and it was taking a full afternoon of sky
   */
  scene.daylight = 0.14;
  const rng = createRng(seedFrom('dorin-door'));

  const WALL_TOP = 5.2;
  /** Where the door is. Hoisted, because the step and everything on it is placed off it. */
  const DOOR_X = -0.15;

  // The path, and the house front. Nothing behind them but night.
  const path = new THREE.BoxGeometry(6, 0.1, 4);
  path.translate(0, -0.05, 1.4);
  scene.registerProp('path', meshOf('Path', path, MAT.ground));

  /**
   * A line of green in the joint where the path meets the house.
   *
   * The one place weeds always win, because nobody's brush reaches into a right angle. It
   * also does something the composition wants: the facade currently meets the ground on a
   * hard straight edge that runs the full width of the frame, and a soft band breaks it.
   *
   * ## This was very nearly a second `path-weeds`
   *
   * It was written as a pair - a patch through the path and a band at the wall - and the
   * patch was a DUPLICATE. There was already a `path-weeds` forty lines below, on the newer
   * meadow system, and registering the same id twice quietly replaces the first. So the
   * first one's geometry was built, uploaded and then dropped every time this scene loaded,
   * and nothing anywhere would have said so.
   *
   * Worth the paragraph because the check that would have caught it is trivial and does not
   * exist: prop ids are a namespace, and `registerProp` treats a collision as an update.
   *
   * The band survives on its own merits, and it is on `meadow` like its neighbour - the
   * clumping is what makes grass read as grass rather than as bristles, and it picks up the
   * same `stepWind` so the two patches move together instead of one being frozen.
   */
  scene.registerProp(
    'wall-seam',
    meadow(rng, {
      at: new THREE.Vector3(0, 0, -0.42),
      width: 5.4,
      depth: 0.3,
      count: 140,
      // Shorter than the path grass. It is growing out of a crack, not out of soil.
      height: [0.05, 0.14],
      bareBelow: 0.4,
      // The doorway is swept, or at least walked through. Nothing grows across the threshold.
      clear: [{ centre: new THREE.Vector3(DOOR_X, 0, -0.42), radius: 0.62 }],
      y: 0,
    }),
    { idle: (deltaTime) => stepWind(deltaTime) }
  );


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

  /**
   * The house front, with a hole in it for the door.
   *
   * It was one 7-metre box and the door was a leaf laid over the outside of it, which
   * worked perfectly until the moment the request is entirely about: the door swings and
   * there is solid wall behind it. Reported as "another door behind the door", which is
   * what a door-shaped rectangle of wall in a doorway looks like.
   *
   * Three pieces round an opening rather than a CSG subtract. The wall is a box and the
   * opening is a rectangle in it, so the panels either side and the lintel over the top ARE
   * the wall - there is nothing to boolean, and a subtract would spend a mesh operation and
   * a pile of triangles to arrive at the same three boxes.
   *
   * The opening is 4cm wider than the leaf each side and 3cm over its head. A door that
   * exactly fills its frame cannot be seen to be in a frame, and every real one has a gap
   * you can feel the draught through.
   */
  const REVEAL = 0.04;
  const openLeft = DOOR_X - 0.92 / 2 - REVEAL;
  const openRight = DOOR_X + 0.92 / 2 + REVEAL;
  const openHead = 2.02 + 0.03;

  /**
   * A wall with holes in it, worked out rather than hand-cut.
   *
   * The first version handled one opening by writing out the two panels and the lintel by
   * name, which was fine for a door and does not extend - and the windows needed openings
   * too, for a reason that took a screenshot to see: a "recessed" window box placed inside
   * a solid wall is invisible, so the only version that rendered was one sitting FLUSH with
   * the brick, which is a dark panel and not a window. Reported as opaque windows, and it
   * was not the glass, it was the hole.
   *
   * Slab decomposition: cut the wall into vertical bands at every opening edge, then cut
   * each band horizontally around whichever openings fall in it. Produces a handful of
   * boxes, handles any number of openings at any heights, and cannot leave a gap because
   * every band is covered from the bottom of the wall to the top.
   */
  const cutWall = (
    openings: ReadonlyArray<{ x0: number; x1: number; y0: number; y1: number }>
  ): THREE.BufferGeometry[] => {
    const pieces: THREE.BufferGeometry[] = [];
    const edges = [...new Set([-3.5, 3.5, ...openings.flatMap((o) => [o.x0, o.x1])])].sort(
      (a, b) => a - b
    );

    for (let i = 0; i < edges.length - 1; i++) {
      const x0 = edges[i];
      const x1 = edges[i + 1];
      if (x1 - x0 < 1e-4) continue;
      const mid = (x0 + x1) / 2;

      // Which openings this band passes through, bottom to top.
      const through = openings
        .filter((o) => mid > o.x0 && mid < o.x1)
        .sort((a, b) => a.y0 - b.y0);

      let y = 0;
      for (const opening of through) {
        if (opening.y0 - y > 1e-4) {
          const piece = new THREE.BoxGeometry(x1 - x0, opening.y0 - y, 0.3);
          piece.translate(mid, (y + opening.y0) / 2, -0.4);
          pieces.push(piece);
        }
        y = Math.max(y, opening.y1);
      }
      if (WALL_TOP - y > 1e-4) {
        const piece = new THREE.BoxGeometry(x1 - x0, WALL_TOP - y, 0.3);
        piece.translate(mid, (y + WALL_TOP) / 2, -0.4);
        pieces.push(piece);
      }
    }
    return pieces;
  };

  /** Where the neighbours' windows go. Referenced again below to fill them. */
  const WINDOWS = [-1, 1].map((side) => ({
    x0: DOOR_X + side * 2.05 - 0.53,
    x1: DOOR_X + side * 2.05 + 0.53,
    y0: 0.78,
    y1: 2.09,
  }));

  const front = cutWall([
    { x0: openLeft, x1: openRight, y0: 0, y1: openHead },
    ...WINDOWS,
  ]);
  /**
   * Brick, and the repeat is the whole of getting it right.
   *
   * Box UVs run 0 to 1 on every face regardless of how big the face is, so a wall 7m wide
   * and one 1m wide would carry the same number of courses without this - and the tile has
   * 16 courses in it, so the repeat is chosen to put a course at a believable height. Two
   * and a half repeats over 5.2m of wall gives courses about 13cm apart, which is a brick
   * and its joint.
   *
   * Set on the material rather than baked into the tile because the three faces of these
   * boxes want the same brick at the same scale, and a texture's repeat is the only thing
   * that can be shared across them.
   */
  const brickMaps = brickwork({
    color: '#7d5f4b',
    mortar: '#8f877c',
    courses: 16,
    seed: 'rasca-front',
  });
  const brickWall = brickMaps ? MAT.wall.clone() : MAT.wall;
  if (brickMaps) {
    /*
     * The colour map only, and the wall keeps its own roughness.
     *
     * The generator returns no normal or roughness map now - see the note at the top of
     * brickwork.ts. This scene has one lamp and the project casts no shadows, so a normal
     * map on a wall was asking a renderer that cannot shade small relief to shade small
     * relief; what it actually produced was a faint regular grid, which is the exact thing
     * that made the brick read as tiling.
     *
     * Roughness stays where MAT.wall had it, so the brick shades the same way every other
     * flat surface in the game does.
     */
    brickWall.map = brickMaps.map;
    brickWall.color = new THREE.Color('#ffffff');
    brickWall.needsUpdate = true;
  }

  const frontMesh = mergeGeometries(front, false) ?? front[0];
  /**
   * UVs in METRES, which is the only way the courses come out the same size everywhere.
   *
   * Box UVs run 0 to 1 on every face whatever that face measures, so one repeat across the
   * whole wall gave the 2.85m panel, the 3.15m panel and the 1.00m lintel three completely
   * different brick sizes - which is what "the bricks are not wide enough" was actually
   * looking at. It was not one wrong number; it was three walls disagreeing.
   *
   * Rewriting the UVs from world position fixes it for good and for any future piece: a
   * course is a fixed number of metres tall wherever it appears, and adding a chimney or a
   * bay next week needs no repeat to be worked out for it. Projected on XY, because this is
   * a facade - the 0.3m returns at the reveal take a stretched map that nothing can see.
   */
  /*
   * 2.4m per tile, 32 courses in it: a course every 75mm and a brick 225mm wide, which is
   * a real stock brick with its joints to the millimetre.
   *
   * The size was never the problem. At 1.05m the module was already 217 x 66 - right to
   * within a few millimetres - and the wall still read as tiling, because 1.05m repeats
   * 6.7 times across a 7m facade and brick is the one surface where the eye counts courses.
   * A bigger tile at the same brick size repeats 2.9 times instead, which is the difference
   * between masonry and wallpaper.
   */
  const TILE = 2.4;
  const uv = frontMesh.getAttribute('uv') as THREE.BufferAttribute;
  const xyz = frontMesh.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, xyz.getX(i) / TILE, xyz.getY(i) / TILE);
  }
  uv.needsUpdate = true;

  scene.registerProp('front', meshOf('Front', frontMesh, brickWall));

  /**
   * -- What is screwed to the front of a house -------------------------------------------
   *
   * The facade was seven metres of unbroken brick with three holes in it, and at this shot's
   * distance that is a backdrop rather than a building. Everything below goes on the strip
   * between the door and the left-hand window, which is where the frame is emptiest: the
   * projection puts the cat at screen x 0.20 and the door at 0.43, with NOTHING between them.
   *
   * All of it is measured into that gap rather than placed by eye - `probe-door.ts` does the
   * arithmetic. A downpipe at world x -1.02 lands at 0.29, which is far enough off the cat
   * not to crowd it and far enough off the door not to argue with it.
   */
  const PIPE_X = -1.02;
  const FITTING_Z = -0.22;

  /**
   * A rainwater pipe, which is the most valuable object on this wall.
   *
   * Not because anybody looks at a downpipe. Because this shot is a horizontal one - a wall,
   * a step, a path, a cat, all of them lying down - and it has exactly one vertical in it,
   * which is the door. A wall reads as a wall when something runs down it: the pipe takes the
   * porch light along one edge and goes dark on the other, and that single soft gradient is
   * what says the brick is a plane in space rather than a photograph of brick.
   *
   * It runs to 3.6m and the top of the frame cuts the wall at about 3.2, so it LEAVES the
   * picture rather than stopping in it. A vertical that ends inside the frame draws the eye
   * to where it ends; one that runs off the edge just says the house carries on.
   */
  const rain: THREE.BufferGeometry[] = [];
  const shaft = new THREE.CylinderGeometry(0.045, 0.045, 3.6, 9);
  shaft.translate(PIPE_X, 1.8, FITTING_Z);
  rain.push(shaft);
  // The hopper at the top, where the gutter empties into it.
  const head = new THREE.CylinderGeometry(0.115, 0.055, 0.22, 8);
  head.translate(PIPE_X, 3.68, FITTING_Z);
  rain.push(head);
  /*
   * The shoe at the bottom - the bend that throws the water clear of the brick.
   *
   * Worth four lines because it is the detail that separates a pipe from a cylinder. One
   * running straight into the ground reads as a column; one that kicks out at ankle height
   * reads as plumbing, and the kick lands right where the eye leaves the wall for the path.
   */
  const shoe = new THREE.CylinderGeometry(0.05, 0.055, 0.26, 8);
  shoe.rotateX(-0.5);
  shoe.translate(PIPE_X, 0.14, FITTING_Z + 0.11);
  rain.push(shoe);
  // Brackets. Three, unevenly spaced, because nobody sets these out with a tape.
  for (const y of [0.55, 1.62, 2.78]) {
    const strap = new THREE.BoxGeometry(0.15, 0.035, 0.075);
    strap.translate(PIPE_X, y, FITTING_Z - 0.03);
    rain.push(strap);
  }
  scene.registerProp(
    'downpipe',
    meshOf('Downpipe', mergeGeometries(rain, false) ?? shaft, MAT.galvanised)
  );

  /*
   * The meter box, in the gap between the pipe and the door.
   *
   * Small, pale and rectangular against a field of brick - doing the pipe's job on the other
   * axis. Between them they turn that strip of wall into somewhere things have been fitted
   * over the years instead of a texture sample.
   */
  const METER_X = -0.86;
  const meter: THREE.BufferGeometry[] = [];
  /*
   * 240 x 320, not 300 x 400.
   *
   * The first size was a blank tan slab a third of a metre across at door height, and next to
   * a door it read as a second, smaller door. Everything on a wall competes with the thing the
   * shot is about; a meter box earns its place by being incidental, which means small enough
   * that the eye passes over it on the way to the door.
   *
   * Grey rather than the warm cream it was in `MAT.plastic`. Same reasoning as the number
   * plate that used to be here: the whole of this wall is warm, so a cool object separates for
   * free, and one that has to separate on value alone is competing with the porch light.
   */
  const meterBody = new THREE.BoxGeometry(0.24, 0.32, 0.12);
  meterBody.translate(METER_X, 1.06, FITTING_Z - 0.05);
  meter.push(meterBody);
  // The lid line, built as a proud lip rather than drawn. Nothing here casts a shadow, so a
  // painted seam would be invisible and a real step of geometry catches the porch light.
  const meterLip = new THREE.BoxGeometry(0.26, 0.016, 0.135);
  meterLip.translate(METER_X, 1.2, FITTING_Z - 0.045);
  meter.push(meterLip);
  // And the window somebody reads it through - a dark rectangle, which is all it is at this
  // distance, and the one thing that says box-with-a-purpose rather than box.
  const meterWindow = new THREE.BoxGeometry(0.13, 0.06, 0.005);
  meterWindow.translate(METER_X, 1.08, FITTING_Z - 0.111);
  meter.push(meterWindow);
  scene.registerProp(
    'meter-box',
    meshOf('MeterBox', mergeGeometries(meter, false) ?? meterBody, MAT.galvanised)
  );

  /*
   * There WAS an enamel house number here, and it came out again.
   *
   * `createHouseNumber` in decals.ts is still worth having and is still correct. What was
   * wrong is that this door already carries its number, on the top rail, put there deliberately
   * and documented where it is built - so the wall version was a second address on the same
   * house, forty centimetres from the first, and in the capture the two of them read as a pair
   * of identical blue plates flanking the doorway for no reason.
   *
   * Second duplicate of the day, after `path-weeds`, and the same shape both times: a set is
   * big enough that adding to it needs a look at what is already in it. Neither one announced
   * itself - a duplicate prop id is silently an update, and a duplicate OBJECT is silently
   * just an object. The check is reading the file, and it is the check that got skipped.
   */

  /**
   * And what is on the other side of it, because now there is an other side.
   *
   * A hole in a wall at night shows whatever is behind the wall, which here is the night
   * backdrop - so cutting the opening without this would trade a door-shaped wall for a
   * door-shaped hole through the house onto the sky. Worse than the bug it fixes.
   *
   * A shallow box, unlit and nearly black, with its faces turned inward. It only has to
   * survive being looked into from the doorstep for the two seconds the door is open, and
   * at that angle a hall is a dark volume with a floor catching a little light and
   * something faint at the far end of it.
   */
  const hallRoot = ENGINE.SceneNode.create({ name: 'Hall' });
  const HALL_D = 2.4;

  /**
   * Built from planes facing inward, not from a box turned inside out.
   *
   * The first version was a BoxGeometry with `side = BackSide` set on the material - and
   * that material is `MAT.hallDark`, which lives in the shared palette. Reaching into the
   * palette from a scene builder to flip a global flag is the kind of thing that works
   * until something else uses that material, and then breaks somewhere entirely different.
   *
   * Five planes, each rotated to face the doorway, is the same picture with nothing shared
   * and nothing global touched. It is also fewer triangles, since the two faces nobody can
   * ever see are simply not built.
   */
  const HALL_W = 1.6;
  const HALL_H = 2.4;
  const back = -0.55 - HALL_D;
  const hall: THREE.BufferGeometry[] = [];

  // The far wall, facing the door.
  const hallBack = new THREE.PlaneGeometry(HALL_W, HALL_H);
  hallBack.translate(DOOR_X, HALL_H / 2, back);
  hall.push(hallBack);
  // Floor and ceiling.
  const hallFloor = new THREE.PlaneGeometry(HALL_W, HALL_D);
  hallFloor.rotateX(-Math.PI / 2);
  hallFloor.translate(DOOR_X, 0.01, back + HALL_D / 2);
  hall.push(hallFloor);
  const hallCeil = new THREE.PlaneGeometry(HALL_W, HALL_D);
  hallCeil.rotateX(Math.PI / 2);
  hallCeil.translate(DOOR_X, HALL_H, back + HALL_D / 2);
  hall.push(hallCeil);
  // The two side walls, each turned to face the middle.
  for (const side of [-1, 1] as const) {
    const wall = new THREE.PlaneGeometry(HALL_D, HALL_H);
    wall.rotateY(side * (Math.PI / 2));
    wall.translate(DOOR_X + side * (HALL_W / 2), HALL_H / 2, back + HALL_D / 2);
    hall.push(wall);
  }
  hallRoot.add(meshOf('HallShell', mergeGeometries(hall, false) ?? hall[0], MAT.hallDark));

  /**
   * The landing light, arriving down the stairs.
   *
   * §187, and it is the observation the mission already carries: the upstairs light has
   * been on since he got here and he keeps looking at it. When the door finally opens, the
   * one thing in that hallway is that light lying on the floor at the far end - which is
   * the answer to the question he has been asking for the whole request, delivered by the
   * set rather than by a line.
   *
   * Unlit and dim. A real light source here would spill out of the doorway onto the step
   * and give the game away before the door is open.
   */
  const spill = new THREE.PlaneGeometry(0.9, 1.5);
  spill.rotateX(-Math.PI / 2);
  spill.translate(DOOR_X + 0.1, 0.02, -0.55 - HALL_D + 0.8);
  hallRoot.add(meshOf('HallSpill', spill, MAT.landingSpill));

  /*
   * The landing light only becomes a source when the leaf opens.
   *
   * Point lights do not receive shadow occlusion here, so leaving this live behind the
   * closed door would illuminate the step before the player earns the result. It begins
   * effectively off and is raised in lockstep with the door angle below: the existing
   * painted spill supplies the distant source, this light supplies the changing threshold.
   */
  const hallLight = ENGINE.PointLightNode.create({
    name: 'HallLight',
    position: new THREE.Vector3(DOOR_X + 0.1, 1.15, -1.65),
    intensity: 0.001,
    color: new THREE.Color('#ffd39a'),
    distance: 5.2,
    decay: 1.25,
  });
  hallRoot.add(hallLight);
  scene.registerProp('hall', hallRoot);

  /**
   * -- The rest of the terrace ----------------------------------------------------------
   *
   * The set was one door in seven metres of blank wall. Everything the request needs was in
   * it and it did not read as a street: a house has neighbours, and the thing that says so
   * is not detail on the house but the fact that the SAME details repeat along it at the
   * same spacing. A terrace is a rhythm.
   *
   * So the wall gets the run of things every house on it would have - a window each side at
   * ground level, sills, a downpipe off the gutter, and the sills and heads that go with
   * them. All dark: this is two in the morning and the only lit window in the street is the
   * one Dorin keeps looking at. They are silhouette and spacing, nothing else.
   */
  const terrace: THREE.BufferGeometry[] = [];
  const terraceDark: THREE.BufferGeometry[] = [];
  const terraceGlass: THREE.BufferGeometry[] = [];
  const terraceRoom: THREE.BufferGeometry[] = [];

  for (const side of [-1, 1] as const) {
    const wx = DOOR_X + side * 2.05;

    /*
     * Behind the opening, a dark room; in it, glass.
     *
     * The wall is genuinely cut now, so this is a box BEHIND the hole rather than a box
     * standing in front of the brick pretending to be one. The old version was flush with
     * the wall face with the pane buried 3mm inside it, which is why the glass never
     * appeared and the window read as a solid dark panel.
     *
     * The room is the same near-black the hall uses, so every unlit interior in the scene
     * agrees, and the pane sits in the opening in the door's own glass - so the terrace has
     * one answer for what a window is at night: nearly black, and just slightly the wrong
     * black.
     */
    const behind = new THREE.BoxGeometry(1.02, 1.27, 0.5);
    behind.translate(wx, 1.435, -0.62);
    terraceRoom.push(behind);

    const pane = new THREE.PlaneGeometry(1.05, 1.3);
    pane.translate(wx, 1.435, -0.268);
    terraceGlass.push(pane);

    // Sill and head, which are what actually make it read as a window from across a road.
    const sill = new THREE.BoxGeometry(1.24, 0.09, 0.2);
    sill.translate(wx, 0.72, -0.29);
    terrace.push(sill);
    const head = new THREE.BoxGeometry(1.2, 0.11, 0.16);
    head.translate(wx, 2.14, -0.3);
    terrace.push(head);

    // Glazing bars: one vertical, one horizontal. Two boxes, and without them the recess
    // is a hole in a wall rather than a window.
    // In front of the glass rather than level with the brick, which is where they were -
    // co-planar with the old flush box and z-fighting it.
    const bar = new THREE.BoxGeometry(0.035, 1.3, 0.04);
    bar.translate(wx, 1.435, -0.255);
    terrace.push(bar);
    const transom = new THREE.BoxGeometry(1.02, 0.035, 0.04);
    transom.translate(wx, 1.72, -0.255);
    terrace.push(transom);
  }

  /**
   * The downpipe, off the gutter and into the ground.
   *
   * The one vertical in a wall of horizontals, and it is doing composition work rather
   * than set dressing: the front is 7m of brick with a door in the middle of it, so a hard
   * vertical line two metres off to one side is what stops the wall reading as a backdrop
   * flat. It also explains the staining the brickwork carries down from it.
   */
  const pipe = new THREE.CylinderGeometry(0.055, 0.055, WALL_TOP - 0.2, 8);
  pipe.translate(DOOR_X + 3.3, (WALL_TOP - 0.2) / 2, -0.19);
  terraceDark.push(pipe);
  for (const y of [0.4, 1.9, 3.4] as const) {
    // Brackets, at the spacing a pipe is actually clipped at.
    const bracket = new THREE.BoxGeometry(0.14, 0.05, 0.09);
    bracket.translate(DOOR_X + 3.3, y, -0.245);
    terraceDark.push(bracket);
  }
  const hopper = new THREE.BoxGeometry(0.2, 0.22, 0.16);
  hopper.translate(DOOR_X + 3.3, WALL_TOP - 0.28, -0.2);
  terraceDark.push(hopper);

  /**
   * The gutter and the string course, running the whole width.
   *
   * Two horizontal bands are the cheapest thing that turns a wall into a facade. The
   * course at first-floor level is what every terrace of this age has where the brickwork
   * changes, and the gutter caps the top so the wall stops rather than being cropped.
   */
  const course = new THREE.BoxGeometry(7, 0.14, 0.36);
  course.translate(0, 2.42, -0.39);
  terrace.push(course);
  const gutter = new THREE.BoxGeometry(7, 0.13, 0.3);
  gutter.translate(0, WALL_TOP - 0.12, -0.32);
  terraceDark.push(gutter);

  scene.registerProp(
    'terrace',
    meshOf('Terrace', mergeGeometries(terrace, false) ?? terrace[0], MAT.wall)
  );
  scene.registerProp(
    'terrace-dark',
    meshOf('TerraceDark', mergeGeometries(terraceDark, false) ?? terraceDark[0], MAT.timberDark)
  );
  scene.registerProp(
    'terrace-glass',
    meshOf('TerraceGlass', mergeGeometries(terraceGlass, false) ?? terraceGlass[0], MAT.doorGlass)
  );
  scene.registerProp(
    'terrace-room',
    meshOf('TerraceRoom', mergeGeometries(terraceRoom, false) ?? terraceRoom[0], MAT.hallDark)
  );

  /**
   * A cat.
   *
   * There is no reason for it. That is the reason - and it is not quite nothing, either.
   * This is the only set in the game where the contact is doing something he is ashamed of,
   * outside somebody else's house, at two in the morning, hoping nobody looks. Putting one
   * unbothered animal on a windowsill watching him do it is the cheapest joke the scene can
   * make and the only one it has room for.
   *
   * ## Where
   *
   * The LEFT sill, at its inner end, and the move is a lesson about where "in frame" ends.
   *
   * It was on the right sill, which is genuinely in shot - 20 degrees off the axis, well
   * inside a 37 degree half-angle. And it is invisible in play, because the console panel
   * covers the right third of the screen and the right sill lands at 75% across. Being
   * inside the frustum is not the same as being on screen when a third of the screen has a
   * telephone on it.
   *
   * Measured in SCREEN FRACTION instead: the left sill's inner end lands at 18% across and
   * 69% down. Clear of the console, clear of the door, and clear of Dorin, who stands on
   * the right. The sill's far end is at 6%, which is against the edge, so it sits at the
   * end nearest the door rather than in the middle of the sill.
   *
   * Turned to face the door, because a cat watching the thing the player is watching is
   * funnier and more alive than a cat facing out. It has an opinion about this.
   */
  /*
   * On the sill, not in the wall.
   *
   * It was at z = -0.26 and the brickwork runs from -0.55 to -0.25, so the entire cat was
   * inside the front of the house. The sill projects to -0.19, so this puts it on the part
   * that sticks out, with its back to the glass - which is where a cat sits.
   */
  const cat = buildCat({
    at: new THREE.Vector3(DOOR_X - 1.45, 0.765, -0.225),
    /*
     * Its own +z is forward. From the left sill the door is to its RIGHT, so the sign flips
     * with the side it is sitting on.
     *
     * 1.2 rather than 1.45, which is about fifteen degrees back toward the camera. The note
     * above is right that it should watch the door - "a cat watching the thing the player is
     * watching is funnier and more alive than a cat facing out" - and at a full right angle
     * its eyes point across the frame and are seen edge-on, which is half of why they never
     * registered. Fifteen degrees keeps it watching the door and lets the light find them.
     */
    facing: 1.2,
    seed: 'rasca-cat',
  });
  const catRestY = cat.root.position.y;
  const catRestFacing = cat.root.rotation.y;
  scene.registerProp('cat', cat.root, { idle: cat.idle });

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
  /*
   * Standing ON the step, which they were not.
   *
   * The step's top face is at y = 0.14 and the pots were sitting at y = 0 with their bases
   * buried in it - the bottom two thirds of each pot was inside the stone. Reported as the
   * plants clipping through the step, and it was the pots doing it; the stems were only
   * where the pots put them.
   *
   * Everything on the stoop is offset by STEP_TOP now rather than by a number typed into
   * each translate, so a step that is ever made thicker takes its contents with it.
   */
  const STEP_TOP = 0.14;
  for (const [i, px] of [DOOR_X - 0.62, DOOR_X + 0.62].entries()) {
    const pot = new THREE.CylinderGeometry(0.13, 0.1, 0.22, 10);
    pot.translate(px, STEP_TOP + 0.11, 0.2);
    stoopDark.push(pot);
    const rim = new THREE.CylinderGeometry(0.145, 0.145, 0.03, 10);
    rim.translate(px, STEP_TOP + 0.215, 0.2);
    stoopDark.push(rim);

    // The near one still has something in it; the far one is stems.
    const alive = i === 0;
    for (let b = 0; b < (alive ? 7 : 4); b++) {
      const h = alive ? range(rng, 0.16, 0.28) : range(rng, 0.2, 0.34);
      const stem = new THREE.CylinderGeometry(0.006, 0.011, h, 4);
      stem.translate(0, h / 2, 0);
      stem.rotateX(jitter(rng, alive ? 0.4 : 0.75));
      stem.rotateZ(jitter(rng, alive ? 0.4 : 0.75));
      stem.translate(px + jitter(rng, 0.06), STEP_TOP + 0.23, 0.2 + jitter(rng, 0.06));
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
      /*
       * On the path, NOT on the step, and checked rather than assumed.
       *
       * The step runs to x = 0.70 and these stand at 0.66 to 0.94, so they are over its
       * edge - lifting them with the pots would have left them hanging in the air off the
       * corner. Boots kicked off beside a step rather than on it is also the truer picture:
       * that is where they end up when somebody steps out of them on their way in.
       */
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

  /**
   * A panelled door, because this one is looked at for the whole request.
   *
   * It was a single 0.06m slab - correct as a blocking pass and wrong as the object every
   * shot in this mission is pointed at. A front door of this age is a frame of stiles and
   * rails with thinner panels sunk into it, and that construction is the entire read: the
   * shadows in the recesses are what make it timber rather than a painted rectangle, and
   * under a single low porch light they are the only modelling on it.
   *
   * Built as a carcass with the panels set BACK, rather than as raised mouldings on a flat
   * face. Same silhouette, half the geometry, and the shading works out the same way round
   * because what the eye reads is the shadow line at the edge of the recess.
   *
   * Four panels: two tall below the lock, two short above, with the glazed pair at the top
   * where the light comes through. That is the commonest front door in the country this
   * street is pretending to be, and it puts glass exactly where BREAK_GLASS wants it.
   */
  /*
   * Set back into the opening rather than laid across it.
   *
   * The wall's front face is at z = -0.25 and the leaf was at -0.26, so with its framing
   * standing 60mm proud the door finished 8mm in FRONT of the brickwork - a door stuck on
   * the outside of a house. Every front door in a terrace sits back in its reveal, and that
   * setback is what gives the jambs a shadow and the doorway any depth at all.
   */
  const LEAF_Z = -0.32;
  const STILE = 0.11;
  const carcass: THREE.BufferGeometry[] = [];

  /**
   * A SOLID leaf first, and then the framing proud of it.
   *
   * The previous version built the door as separate bars - two stiles, three rails, four
   * panels - and every gap between them was a hole straight through the door. Reported as
   * exactly that. The 70mm between the two panels had nothing in it at all, and so did the
   * band between the bottom rail and the lower panels.
   *
   * The fix is to build it the way it is actually made rather than the way it is drawn. A
   * panelled door is a continuous leaf of thin stock with a heavier frame applied over it;
   * the panels are not holes with wood behind them, they are the leaf itself showing
   * between the framing. So this is a full-size slab at panel thickness with the stiles and
   * rails standing 24mm proud, which is structurally what the joiner did and which cannot
   * have a gap in it by construction - there is nothing for a gap to be between.
   */
  const leafSlab = new THREE.BoxGeometry(DOOR.w, DOOR.h, 0.036);
  leafSlab.translate(DOOR.x, DOOR.h / 2, LEAF_Z);

  /*
   * The framing, standing proud toward the street.
   *
   * Includes the muntin - the vertical bar down the middle between the panel pairs - which
   * the old version simply did not have, and whose absence was the widest of the holes.
   */
  const PROUD = 0.06;
  /** How far the framing's centre sits toward the street from the slab's. */
  const PROUD_AT = 0.012;
  /**
   * The street-facing surface of the whole leaf, derived once.
   *
   * Everything mounted on this door - the lock, the glass, the letterbox - needs to sit on
   * THIS plane, and each of them working it out separately is how one of them ends up
   * inside the woodwork. Which is what happened: the lock's copy of this sum left out the
   * framing's own 12mm offset and put the brass 8mm under the surface.
   */
  const LEAF_FRONT = LEAF_Z + PROUD_AT + PROUD / 2;
  /** Keyhole height. 80mm under the spindle, which is where a mortice keyhole lives. */
  const LOCK_Y = 1.0;
  for (const [w, h, ox, oy] of [
    // Stiles, full height, one each side.
    [STILE, DOOR.h, -(DOOR.w - STILE) / 2, DOOR.h / 2],
    [STILE, DOOR.h, (DOOR.w - STILE) / 2, DOOR.h / 2],
    // Top rail, lock rail, bottom rail. The lock rail is the thick one, as it always is.
    [DOOR.w, 0.13, 0, DOOR.h - 0.065],
    [DOOR.w, 0.2, 0, 1.02],
    [DOOR.w, 0.17, 0, 0.085],
    // The muntin, from the bottom rail to the top one.
    [0.08, DOOR.h - 0.3, 0, DOOR.h / 2 - 0.015],
  ] as const) {
    /*
     * PLUS, not minus, and this was the fault behind three separate reports.
     *
     * The camera looks down -z, so the street-facing side of anything is the one with the
     * LARGER z. Offsetting the framing by -0.012 stood it proud on the BACK of the door and
     * left its street face exactly flush with the slab - so from outside, a panelled door
     * presented as one unbroken sheet with all of its joinery hidden behind it. That is the
     * "door is still a flat plane" report, and no amount of shading or panel colour was
     * ever going to fix it, because there was nothing to shade.
     */
    const piece = new THREE.BoxGeometry(w, h, PROUD);
    piece.translate(DOOR.x + ox, oy, LEAF_Z + PROUD_AT);
    carcass.push(piece);
  }

  /*
   * Two meshes, because the panelling is carried by value and not by relief.
   *
   * The slab is the darker `doorPanel` and the framing over it is `doorLeaf`, so what shows
   * between the stiles and rails reads as sunk. With shadows off across the project a 24mm
   * recess receives identical light to the wood beside it - the door was modelled right and
   * rendered as a plain slab, which is what it was reported as.
   */
  const panelMesh = meshOf('DoorPanels', leafSlab, MAT.doorPanel);
  const doorMesh = meshOf('Door', mergeGeometries(carcass, false) ?? carcass[0], MAT.doorLeaf);

  const doorRoot = ENGINE.SceneNode.create({
    name: 'DoorRoot',
    // Hinged on the left edge, so opening it swings rather than slides.
    position: new THREE.Vector3(DOOR.x - DOOR.w / 2, 0, -0.26),
  });
  /*
   * Everything on the leaf is built in world coordinates and then shifted onto the hinge,
   * which is what `doorRoot` sits on. One translate for the lot rather than authoring every
   * part in hinge space, so the numbers above can be read against the door's own width.
   */
  const ontoHinge = (geometry: THREE.BufferGeometry): THREE.BufferGeometry =>
    geometry.translate(-(DOOR.x - DOOR.w / 2), 0, 0.26);
  ontoHinge(panelMesh.geometry);
  doorRoot.add(panelMesh);
  ontoHinge(doorMesh.geometry);
  doorRoot.add(doorMesh);

  /**
   * The glass, and it goes ON the door.
   *
   * It was registered as its own prop at the door's position, so it stayed exactly where it
   * was when the door swung - a pane of glass hanging in an empty doorway. Same family of
   * fault as the missing opening and reported as part of it.
   */
  for (const [name, ox] of [
    ['DoorGlassLeft', -0.19],
    ['DoorGlassRight', 0.19],
  ] as const) {
    // Just proud of the slab so it does not z-fight with the leaf it is set into.
    const glazing = new THREE.PlaneGeometry(0.29, 0.66);
    glazing.translate(DOOR.x + ox, 1.5, LEAF_Z + 0.021);
    doorRoot.add(meshOf(name, ontoHinge(glazing), MAT.doorGlass));

    /**
     * A sliver of sky in the top of the pane.
     *
     * Reported as "what are the two dark parts on the door?", which is the right question
     * to ask of what was there. Glass at night IS nearly black, so the colour was honest -
     * what was missing is that a pane never returns ONE value. It shows sky at the top and
     * a dark street at the bottom, and a single flat tone with no variation in it is
     * exactly what a hole looks like.
     *
     * Small and high. A reflection that filled the pane would read as frosted glass.
     */
    const sheen = new THREE.PlaneGeometry(0.29, 0.19);
    sheen.translate(DOOR.x + ox, 1.735, LEAF_Z + 0.022);
    doorRoot.add(meshOf(`${name}Sheen`, ontoHinge(sheen), MAT.doorSheen));

    /**
     * And the bead, which is the half that actually fixes it.
     *
     * A bead is the thin fillet of timber holding a pane into a door, and it is the one
     * detail that reads at any distance: a bright line all the way round the dark, catching
     * the porch lamp. Without it there is nothing between the panel and the void, and the
     * eye quite correctly reports a hole.
     */
    const bead: THREE.BufferGeometry[] = [];
    for (const [w, h, bx, by] of [
      [0.318, 0.016, 0, 0.338],
      [0.318, 0.016, 0, -0.338],
      [0.016, 0.66, -0.151, 0],
      [0.016, 0.66, 0.151, 0],
    ] as const) {
      const stick = new THREE.BoxGeometry(w, h, 0.018);
      stick.translate(DOOR.x + ox + bx, 1.5 + by, LEAF_Z + 0.027);
      bead.push(stick);
    }
    doorRoot.add(
      meshOf(`${name}Bead`, ontoHinge(mergeGeometries(bead, false) ?? bead[0]), MAT.doorLeaf)
    );
  }

  /**
   * The furniture: letterbox, knocker, number.
   *
   * Three small brass things and they do more for the scene than the panels do. A door with
   * nothing on it is a door nobody uses; a letterbox is the detail that says post comes
   * here, and the knocker is the one he has not used - because using it would wake the
   * street, which is a fact about his situation stated in an object.
   */
  const furniture: THREE.BufferGeometry[] = [];
  const letterbox = new THREE.BoxGeometry(0.26, 0.045, 0.02);
  letterbox.translate(DOOR.x, 1.02, LEAF_FRONT + 0.008);
  furniture.push(letterbox);

  const knockerPlate = new THREE.CylinderGeometry(0.035, 0.035, 0.016, 10);
  knockerPlate.rotateX(Math.PI / 2);
  knockerPlate.translate(DOOR.x, 1.46, LEAF_FRONT + 0.008);
  furniture.push(knockerPlate);
  const knockerRing = new THREE.TorusGeometry(0.038, 0.008, 6, 14);
  knockerRing.translate(DOOR.x, 1.415, LEAF_FRONT + 0.012);
  furniture.push(knockerRing);

  /**
   * The number, on the top rail, and it is a PLATE now rather than two brass bars.
   *
   * The note this replaces is a good record of a fix that did not finish. It was at 1.74,
   * floating on the glass with the muntin behind it, and moving it up to the solid rail was
   * right - but what moved was still `BoxGeometry(0.015, 0.062)` twice, which is two tabs
   * whatever they are mounted on. The old note even says the earlier version "read as a pair
   * of leftover tabs"; the tabs were never the position's fault.
   *
   * A number has to be READABLE or it is not a number, and geometry cannot do that at 15mm a
   * digit. A painted decal can, because the resolution is in the texture rather than in the
   * triangles - this is `createRatingPlate`'s whole argument applied to a doorway.
   *
   * ## Why the plate rather than paint on the rail
   *
   * Box UVs are shared across all six faces (decals.ts, top), so anything belonging to one
   * face needs its own quad. Which is also how it works in life: it was screwed on afterwards,
   * and a vitreous enamel plate is the object half the houses in the country have.
   *
   * Its own mesh rather than merged into `furniture`, because furniture is one brass mesh and
   * this carries a texture. It still goes through `ontoHinge` and onto `doorRoot`, so it swings
   * with the leaf - the mistake the glass made once already.
   */
  const doorNumber = createHouseNumber('14');
  if (doorNumber) {
    const plate = new THREE.PlaneGeometry(0.19, 0.131);
    plate.translate(DOOR.x, DOOR.h - 0.075, LEAF_FRONT + 0.006);
    doorRoot.add(meshOf('DoorNumber', ontoHinge(plate), decalMaterial(doorNumber, 0.55)));
  }
  /**
   * The handle, which the door did not have.
   *
   * ## Where it goes, and why it is not next to the lock by accident
   *
   * On the lock stile - the far one from the hinge - at 880mm, which is handle height
   * everywhere. The lock sits at 1020 on the lock rail directly above it, and that vertical
   * pair is what a front door actually looks like: you grip at one height and the cylinder
   * is at another, and a handle level with its own lock reads as a fire door.
   *
   * Below rather than above, so it is clear of the pick. The whole second act happens in
   * that keyway with a 150mm pick standing out of it, and furniture above the cylinder
   * would be something for it to grow out of.
   *
   * ## A lever rather than a knob
   *
   * A knob is the period-correct answer and the wrong one here. At this camera a knob is a
   * disc on a disc - it has no silhouette, and silhouette is all this game's shading gives
   * you. A lever has an arm, and the arm reads from the doorstep and from three metres back
   * on the default shot. It also gives the door somewhere to move that is not the door.
   *
   * The arm points INWARD, toward the middle of the leaf, because that is the side a hand
   * comes from - a lever pointing at the jamb would be one you cannot get behind.
   */
  /*
   * 80mm below the cylinder, which is as close as the two roses will go.
   *
   * It was 140mm, and looked at on screen that reads as two unrelated bits of brass rather
   * than one lockset - a handle and a lock that happen to be on the same door. On a mortice
   * lock the spindle and the keyhole are one fitting and sit within a hand's width of each
   * other.
   *
   * 80 is the floor, not a preference: the rose is 36mm in radius and the escutcheon 35mm,
   * so anything under 71mm has them touching. This leaves 9mm of daylight between them.
   */
  /*
   * 1.08, which is as high as the pair will go and stay on the lock rail.
   *
   * The rail runs 0.92 to 1.12 and the rose is 33mm in radius, so a spindle above 1.087 has
   * brass hanging over the top edge of the timber it is screwed to. 1.08 puts the rose top
   * at 1.113 - just inside - and takes the keyhole with it.
   */
  const HANDLE_Y = 1.08;
  const handleAt = new THREE.Vector3(DOOR.x + 0.35, HANDLE_Y, LEAF_FRONT + 0.03);

  // The rose stays put; only the lever turns, so it belongs with the static furniture.
  /*
   * And the keyhole goes UNDERNEATH it, which is the way round a mortice lock is fitted.
   *
   * It was the other way about - cylinder at 1020 with the lever 80mm below - and that is a
   * nightlatch arrangement, where the cylinder is up near eye level and nowhere near the
   * handle. On a door with a mortice lock the spindle is at handle height and the keyhole
   * is directly below it, because they are the same lock case: the follower turns the latch
   * and the key throws the bolt under it.
   *
   * The camera shot that pushes in on the lock moves with it - see registerShot('lock').
   */
  const rose = new THREE.CylinderGeometry(0.03, 0.033, 0.016, 12);
  rose.rotateX(Math.PI / 2);
  rose.translate(handleAt.x, handleAt.y, LEAF_FRONT + 0.008);
  furniture.push(rose);

  doorRoot.add(
    meshOf('DoorFurniture', ontoHinge(mergeGeometries(furniture, false) ?? furniture[0]), MAT.brass)
  );

  /**
   * The lever, on its own node so it can be pushed down.
   *
   * Pivoting about z - the axis through the door - which is the one a lever actually turns
   * on. Built around the node's origin so the rotation happens at the spindle rather than
   * somewhere out in the middle of the arm.
   */
  const handleNode = ENGINE.SceneNode.create({
    name: 'DoorHandle',
    position: new THREE.Vector3(
      handleAt.x - (DOOR.x - DOOR.w / 2),
      handleAt.y,
      handleAt.z + 0.26
    ),
  });
  const lever: THREE.BufferGeometry[] = [];
  // The neck, out from the rose.
  const neck = new THREE.CylinderGeometry(0.014, 0.016, 0.045, 8);
  neck.rotateX(Math.PI / 2);
  neck.translate(0, 0, 0.012);
  lever.push(neck);
  /*
   * The arm, level.
   *
   * It had a droop on it - the arm dropped 6mm and the tip another 19 - and magnified on
   * screen that is not a lever at rest, it is a tap. A sprung lever sits horizontal; the
   * only time it points down is while somebody is pushing it, which is what the open cue
   * is for.
   */
  const arm = new THREE.BoxGeometry(0.105, 0.021, 0.026);
  arm.translate(-0.055, 0, 0.032);
  lever.push(arm);
  /*
   * The return, turned back toward the DOOR rather than down.
   *
   * A return exists so a sleeve cannot hook the end of the lever, which means it curls back
   * to the face it is mounted on. Pointing it at the floor made the whole thing read as a
   * spout with the handle as its body.
   */
  const tip = new THREE.BoxGeometry(0.022, 0.021, 0.034);
  tip.translate(-0.097, 0, 0.019);
  lever.push(tip);
  handleNode.add(meshOf('DoorLever', mergeGeometries(lever, false) ?? lever[0], MAT.brass));
  doorRoot.add(handleNode);
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
        /*
         * The pick comes out first.
         *
         * It is parented to the plug, which is parented to the door - so a door that swings
         * with a pick still in it takes the pick, the wrench and Dorin's hand round with it
         * into the hall. Two seconds is exactly the gap the note below already builds in
         * before the door starts to move, so this fits inside it without changing the
         * timing of the beat.
         */
        tweener.add(
          (t: number) => {
            pick.position.set(0, 0, 0.16 * t);
            pick.scale.setScalar(Math.max(0.001, 1 - t));
          },
          { duration: 0.5, easing: Ease.outCubic, channel: 'lock-pick' }
        );

        /**
         * And the handle goes down, because that is what opens a door.
         *
         * The lock coming off is not the thing that swings it - somebody still has to push
         * the lever. Held down while the leaf moves and let back up at the end, which is
         * the shape of the actual gesture and takes one tween.
         *
         * A third of a turn: a lever travels about 35 degrees before the latch clears, not
         * 90. Anything more reads as a pump handle.
         */
        tweener.add(
          (t: number) => {
            const push = t < 0.18 ? t / 0.18 : t > 0.82 ? (1 - t) / 0.18 : 1;
            /*
             * POSITIVE, so it goes down.
             *
             * The arm points -x from the spindle, and a rotation about +z takes +x toward
             * +y - so it takes -x toward -y, which is downward. I had it negative, which
             * lifted the lever 56mm instead of dropping it: a handle being pulled up as the
             * door swings, which is not a gesture anybody makes.
             */
            handleNode.rotation.set(0, 0, 0.62 * push);
          },
          { duration: 2.6, easing: Ease.linear, channel: 'door-handle' }
        );

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

        /** Warmth reaches the doorstep at the same rate as the opening, not before it. */
        tweener.add(
          (t) => {
            hallLight.intensity = 7.2 * Ease.outCubic(t);
          },
          {
            duration: 2.2,
            delay: 2.0,
            easing: Ease.linear,
            channel: 'hall-light-open',
          }
        );

        /** The one witness on the sill finally decides the noise merits a reaction. */
        tweener.add(
          (t) => {
            const turn = Ease.outCubic(t);
            cat.root.rotation.y = catRestFacing + turn * 0.5;
            cat.root.position.y = catRestY + Math.sin(t * Math.PI) * 0.045;
          },
          {
            duration: 0.9,
            delay: 2.08,
            easing: Ease.linear,
            channel: 'door-cat-react',
            onComplete: () => {
              cat.root.position.y = catRestY;
              cat.root.rotation.y = catRestFacing + 0.5;
            },
          }
        );
      },
    },
  });

  /**
   * The architrave, on the face of the wall rather than inside it.
   *
   * It was a 0.14m-deep surround centred at z = -0.30, which put three quarters of it
   * inside brickwork that runs from -0.55 to -0.25 - so most of the moulding was buried and
   * what showed was a thin edge poking out of the wall. Now the door has been set properly
   * back into its reveal, the architrave has a job again: it is a board applied to the
   * BRICK, covering the joint between the frame and the opening, which is what one is for.
   *
   * Wider, too. 80mm of surround round a 920mm door is a bead; a real architrave is a
   * plank, and it is the thing that makes a doorway read as joinery rather than as a
   * rectangle cut in a wall.
   */
  const ARCH = 0.13;
  const frame: THREE.BufferGeometry[] = [];
  for (const [w, h, x, y] of [
    [DOOR.w + 0.12 + ARCH * 2, ARCH, DOOR.x, DOOR.h + 0.06 + ARCH / 2],
    [ARCH, DOOR.h + 0.06 + ARCH, DOOR.x - DOOR.w / 2 - 0.06 - ARCH / 2, (DOOR.h + 0.06 + ARCH) / 2],
    [ARCH, DOOR.h + 0.06 + ARCH, DOOR.x + DOOR.w / 2 + 0.06 + ARCH / 2, (DOOR.h + 0.06 + ARCH) / 2],
  ] as const) {
    // Standing 40mm proud of the brick, which is the thickness of the board.
    const piece = new THREE.BoxGeometry(w, h, 0.04);
    piece.translate(x, y, -0.23);
    frame.push(piece);
  }

  /**
   * And the reveal: the sides of the hole, between the brick face and the door.
   *
   * Setting the door back 100mm leaves 100mm of raw opening on each jamb and over the head.
   * Without something in it the player sees the cut edge of the wall box, which is a
   * hairline of whatever the brick map happens to be doing there. Three thin boards, and
   * they are the surfaces the porch light actually rakes across on the way to the door.
   */
  for (const [w, h, x, y, d] of [
    [0.1, DOOR.h + 0.06, DOOR.x - DOOR.w / 2 - 0.02, DOOR.h / 2, 0.1],
    [0.1, DOOR.h + 0.06, DOOR.x + DOOR.w / 2 + 0.02, DOOR.h / 2, 0.1],
    [DOOR.w + 0.12, 0.1, DOOR.x, DOOR.h + 0.05, 0.1],
  ] as const) {
    const piece = new THREE.BoxGeometry(w, h, d);
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
  /*
   * On the door, not beside it.
   *
   * It was registered as a top-level prop at the door's world position, so when the leaf
   * swung the lock stayed in the empty doorway - the same fault the glass had, and the
   * more obvious one, because the lock is what the player has spent the whole request
   * looking at. A lock is a hole through a door with brass in it; it goes where the door
   * goes.
   *
   * Positioned in hinge space, since that is what it is parented to now. The hinge is at
   * the left jamb, so the lock sits at nearly the full width of the leaf from it - which
   * is the far stile, where every lock in the country is.
   */
  /*
   * Its depth is derived from the leaf, not typed next to it.
   *
   * The lock is now a child of the door, so if the leaf is ever moved deeper into the
   * reveal - as it just was - a hand-written z would leave the brass floating in front of
   * the door or buried in it. LEAF_FRONT is where the framing's outer face is; the
   * escutcheon sits a couple of millimetres proud of that, which is what a rim of brass
   * screwed to a door does.
   */
  /*
   * On the leaf's street face, taken from LEAF_FRONT rather than recomputed.
   *
   * The old line worked it out again from scratch and got the sign wrong: LEAF_Z MINUS half
   * the thickness is the face pointing into the hall, and the lock then went a further 4mm
   * behind that - 52mm inside a door 60mm thick. It was rendering perfectly, on the inside,
   * where nobody was standing. Reported twice as the lock not being on the door.
   */
  const lockRoot = ENGINE.SceneNode.create({
    name: 'Lock',
    position: new THREE.Vector3(DOOR.w - 0.11, LOCK_Y, LEAF_FRONT + 0.26 + 0.004),
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

  /**
   * The pick, in the keyway.
   *
   * ## Why it is parented to the plug and not the plate
   *
   * Because it is in the cylinder. A pick sits in the keyway with the tension wrench under
   * it, and when a pin sets and the plug gives, the pick goes round with it - that is what
   * "the cylinder gave" MEANS to the man holding it. Parenting it here gets that for free
   * and makes it impossible to get wrong: there is no second rotation to keep in step,
   * because there is only one rotation.
   *
   * ## Two pieces, because one of them snaps
   *
   * A pick that fails does not bend, it shears - they are 0.5mm spring steel and they go
   * with a crack. So the tip is its own node: on a drop it stays in the keyway for a moment
   * while the handle comes away, which is the picture anybody who has broken one recognises.
   *
   * Small. The shaft is 4mm across against a 44mm escutcheon, which is the real ratio and
   * is why it reads as a tool rather than a screwdriver.
   */
  const pick = ENGINE.SceneNode.create({ name: 'Pick', position: new THREE.Vector3() });
  const pickTip = ENGINE.SceneNode.create({ name: 'PickTip', position: new THREE.Vector3() });
  const tipBar = new THREE.BoxGeometry(0.004, 0.011, 0.03);
  // Sitting low in the keyway, where a pick rides under the pins rather than up the middle.
  tipBar.translate(0, -0.005, 0.012);
  pickTip.add(meshOf('PickTipBar', tipBar, MAT.metal));
  pick.add(pickTip);

  const pickShaft = new THREE.BoxGeometry(0.004, 0.009, 0.086);
  pickShaft.translate(0, -0.005, 0.07);
  pick.add(meshOf('PickShaft', pickShaft, MAT.metal));
  // The handle: the flat somebody actually holds, turned across the shaft.
  const pickGrip = new THREE.BoxGeometry(0.016, 0.004, 0.042);
  pickGrip.translate(0, -0.005, 0.132);
  pick.add(meshOf('PickGrip', pickGrip, MAT.dark));

  /*
   * The tension wrench, which never moves and never breaks.
   *
   * Below the pick and turned into the bottom of the keyway. It is the thing the plug is
   * being turned AGAINST, so without it on screen the cylinder appears to rotate because
   * the pick asked it to - and the whole reason a dropped set drops is that this is holding
   * pressure the moment the pick leaves.
   */
  const wrenchArm = new THREE.BoxGeometry(0.005, 0.011, 0.026);
  wrenchArm.translate(0, -0.012, 0.01);
  pick.add(meshOf('WrenchArm', wrenchArm, MAT.metal));
  const wrenchTail = new THREE.BoxGeometry(0.005, 0.03, 0.005);
  wrenchTail.translate(0, -0.026, 0.0);
  pick.add(meshOf('WrenchTail', wrenchTail, MAT.metal));

  // Not in the lock until somebody starts work on it.
  pick.visible = false;
  plug.add(pick);
  /**
   * The cylinder turns as the pins go up, and springs back when they drop.
   *
   * This is the whole of the new lock interaction expressed in one object. A pick that
   * sets a pin lets the plug rotate a few degrees against the wrench; a pick that binds
   * lets everything fall, and the plug snaps back to where it started. That is what a
   * lock does, and it means the player is reading the ANSWER off the thing they are
   * working on rather than off a status line in a panel.
   *
   * Five steps to ninety degrees, so each pin is a visible eighteen and the fifth is the
   * one that opens the door. `set` eases out - a pin lifting is a small controlled thing -
   * and `drop` uses `inCubic` for the same reason the cut branches do: it is a fall.
   *
   * A tween per press rather than a held state, because the plug's angle is derived from
   * how many are up and the runtime already owns that number. Nothing here counts.
   */
  const PLUG_STEP = Math.PI / 10;
  let plugSet = 0;
  const turnPlug = (tweener: Tweener, to: number, duration: number, easing: (t: number) => number): void => {
    const from = plugSet;
    plugSet = to;
    tweener.add(
      (t: number) => {
        if (lockPlug) lockPlug.rotation.set(0, 0, -(from + (to - from) * t));
      },
      { duration, easing, channel: 'lock-turn' }
    );
  };

  doorRoot.add(lockRoot);
  scene.registerProp('lock', lockRoot, {
    // Inked: Two centimetres of brass, and the entire mission.
    inked: true,
    anchors: { default: new THREE.Vector3(0, 0, 0.06) },
    actions: {
      /**
       * He gets to work: the pick goes in.
       *
       * Fired by the transition into the device beat rather than on the first press,
       * because by then he has already said "wrench is in, I am on the pins" - and an empty
       * keyway under that line is the world contradicting the man.
       */
      pick: (tweener) => {
        pick.visible = true;
        pickTip.visible = true;
        pickTip.position.set(0, 0, 0);
        pickTip.rotation.set(0, 0, 0);
        tweener.add(
          (t: number) => {
            pick.position.set(0, 0, 0.09 * (1 - t));
            pick.scale.setScalar(1);
            pick.rotation.set(0, 0, 0);
          },
          { duration: 0.42, easing: Ease.outCubic, channel: 'lock-pick' }
        );
      },

      /** One more pin up: a few degrees of give against the wrench, pick and all. */
      set: (tweener) => turnPlug(tweener, Math.min(Math.PI / 2, plugSet + PLUG_STEP), 0.26, Ease.outCubic),

      /**
       * The set drops, and the pick shears.
       *
       * One tween in three phases rather than three tweens, because the Tweener has no
       * delay and a sequence assembled from channels would be three things racing. The
       * phases are the shape of the event: it binds and jumps, the handle comes away while
       * the tip stays in the keyway, and then he has another one in and is ready to go
       * again.
       *
       * He does not run out. A broken pick is a cost the player watches rather than a
       * resource to manage - the mission is a memory puzzle and adding an economy to it
       * would be a second game standing in front of the first.
       */
      drop: (tweener) => {
        turnPlug(tweener, 0, 0.34, Ease.inCubic);
        tweener.add(
          (t: number) => {
            if (t < 0.18) {
              // Binding. It loads up and skips in the keyway before it goes.
              const bind = t / 0.18;
              pick.position.set(0, 0, 0.004 * Math.sin(bind * Math.PI * 3));
              pick.rotation.set(0, 0, 0.05 * Math.sin(bind * Math.PI * 4));
              pick.scale.setScalar(1);
              pickTip.visible = true;
              return;
            }
            if (t < 0.52) {
              // Snapped. The handle comes back and away; the tip is left in the lock.
              const away = (t - 0.18) / 0.34;
              pick.position.set(0.02 * away, -0.05 * away * away, 0.16 * away);
              pick.rotation.set(0.9 * away, 0, 1.6 * away);
              pick.scale.setScalar(Math.max(0.001, 1 - away));
              // The tip rides the parent away, so it is pushed back to stay put.
              pickTip.position.set(-0.02 * away, 0.05 * away * away, -0.16 * away);
              return;
            }
            // A fresh one, in and seated. He carries more than one.
            const back = (t - 0.52) / 0.48;
            pickTip.position.set(0, 0, 0);
            pick.rotation.set(0, 0, 0);
            pick.scale.setScalar(1);
            pick.position.set(0, 0, 0.11 * (1 - back));
          },
          { duration: 1.05, easing: Ease.linear, channel: 'lock-pick' }
        );
      },
    },
  });

  /**
   * Putting this doorstep back, which nothing was doing.
   *
   * The request can be re-opened and the diorama is not rebuilt, so everything the lock
   * cues had moved was still moved: a cylinder standing at whatever angle the last attempt
   * left it, a pick in the keyway, and - if they had solved it - the door standing open
   * while Dorin explains that he cannot get in.
   *
   * The plug's own counter is reset alongside its rotation. It is the number the `set`
   * action steps, so leaving it behind would have the next attempt's first pin starting
   * from wherever the last one finished.
   */
  scene.onReset(() => {
    plugSet = 0;
    if (lockPlug) lockPlug.rotation.set(0, 0, 0);
    pick.visible = false;
    pick.position.set(0, 0, 0);
    pick.rotation.set(0, 0, 0);
    pick.scale.setScalar(1);
    pickTip.visible = true;
    pickTip.position.set(0, 0, 0);
    // The lever comes back up with everything else, or a re-opened request starts with the
    // handle already pushed down by whoever went in last time.
    handleNode.rotation.set(0, 0, 0);
    doorRoot.rotation.set(0, 0, 0);
  });

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
    /*
     * And settle his wrists.
     *
     * Reported as a hand bent oddly on the idle, with the reasonable question of whether
     * the hand IK was doing it. It was not - he has no hand targets, so no solver ever
     * touches him, and what was showing is the shared Mixamo idle's own wrist angle on
     * somebody standing with his arms down rather than holding anything. Two thirds of the
     * way back to the pose the model shipped in, which takes the break out and leaves the
     * hand still moving with the arm.
     */
    settleWrists: 0.65,
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

  /**
   * Moths, and this is the only thing in the scene that MOVES on its own.
   *
   * That is the whole argument. Everything else at this door is furniture: the brick, the
   * step, the pots, the pipe, all of it completely still, and Dorin holds one pose at the
   * lock for most of the call. A frozen night reads as a render of a night. Half a dozen
   * insects working the one bright point in the frame cost a `Points` draw and turn the
   * picture into somewhere with air in it.
   *
   * They also do a second job, which is why they are HERE and not somewhere prettier: they
   * mark the lamp. §187 gives the eye to the brightest thing, and the fix that moved this
   * light off the soffit left it correctly lit but no longer the loudest object on the wall.
   * Motion is the other way to claim attention, and it is the one that does not cost the
   * scene any of its darkness.
   *
   * `createMotes` rather than anything new: it was written for flies over Adaeze's beds and
   * its whole design note is about being Brownian instead of orbital - a home position each
   * one is loosely sprung to, plus a random kick per frame. Moths at a porch light do
   * precisely that. The only changes are the box, the count and the colour.
   */
  const MOTH_BOX = new THREE.Vector3(0.62, 0.34, 0.34);
  const moths = createMotes({
    /*
     * Dropped by half the box height, because `createMotes` does not centre on Y.
     *
     * X and Z are laid out about the node - `range(-half.x, half.x)` - and Y is not: it is
     * `range(0, size.y)`, so the node is the FLOOR of the swarm, not its middle. Written that
     * way for the flies over Adaeze's vegetable beds, where a cloud that starts at ground
     * level and rises is exactly right.
     *
     * Here it put nine moths in a band from the bulb up to 34cm above it - which is inside the
     * shade and then behind the brick, so the one piece of motion in the scene rendered
     * completely invisible and looked like a feature that had failed to build. Half the box
     * down and they straddle the lamp.
     */
    at: porchAt.clone().add(new THREE.Vector3(0, -MOTH_BOX.y / 2 - 0.02, 0.06)),
    // Wider than tall, and shallow. They work the face of the lamp, not a sphere around it.
    size: MOTH_BOX,
    /*
     * Nine. A count this low is a decision rather than a budget.
     *
     * Twenty of anything small and pale reads as dirt on the lens or as snow; the flies over
     * the vegetable beds get away with forty because a swarm is the point there. Here each
     * one has to read as an individual animal blundering at a bulb, and that only happens
     * when you can count them.
     */
    count: 9,
    /*
     * Unlit and near-white, because `PointsMaterial` takes no light and these are 3cm
     * across at four and a half metres. A correctly-coloured moth - a dull grey-brown -
     * would be black at this size against a dark wall. What the eye actually sees at a
     * porch light is the lamp reflecting off a wing for a frame at a time, and this is
     * that: the colour is the LIGHT, not the insect.
     */
    color: '#ffe6b4',
    scale: 0.032,
    seed: 'rasca-porch-moths',
  });
  scene.registerProp('moths', moths.root, { idle: moths.idle });

  /**
   * The shade, which was a plate.
   *
   * `CylinderGeometry(0.1, 0.13, 0.07)` sitting 7cm above the bulb is a saucer balanced over
   * a naked lamp: 7cm deep against a bulb 11cm across, so from the shot's own angle the whole
   * sphere hangs below the rim with nothing round it. A porch light is a COWL - a shade that
   * comes down past the bulb's equator, so what you see from below is metal with a glow
   * under it, not a ball on a stick.
   *
   * 13cm deep, narrow at the crown and flared to 17cm at the rim, dropped so the rim sits
   * 3cm below the bulb's centre. About two thirds of the sphere is inside it now.
   *
   * ## Two shells, and why
   *
   * Open-ended, because a capped cone seen from below - which is where this camera is, 70cm
   * under the lamp - would be a solid disc hiding the bulb completely. But an open cone shows
   * only its OUTSIDE: the far wall's inner surface is back-facing and culled, so a single
   * shell reads as half a shade with a hole behind the bulb.
   *
   * So there are two, and the inner one is mirrored on X. Mirroring reverses a geometry's
   * winding, which turns its faces inward - the same property that silently culls a
   * hand-built quad when somebody scales it negative by accident, used deliberately here.
   * The result is a shade with an inside, for the cost of twenty triangles.
   */
  /*
   * ## How deep, worked out rather than tried
   *
   * The bulb is a 110mm sphere centred at `porchAt`, so its underside is 55mm below that. The
   * camera sits 70cm lower and 4.4m out, which is a sight line rising at nine degrees - and
   * that angle is the whole calculation, because a rim only hides the bulb if the line from
   * the lens through the rim passes UNDER it.
   *
   * At 130mm deep the rim landed at 2.39, above the bulb's underside, and a third of the
   * sphere hung in the open. At 170mm with a 185mm mouth the rim is at 2.355 and the sight
   * line clears the bulb's bottom by about four millimetres: nearly covered, with a sliver of
   * filament glow still showing. Deliberately a sliver rather than nothing - a completely
   * hidden bulb takes the warm point out of the frame and leaves a grey cone.
   *
   * ## Two shells, and why
   *
   * Open-ended, because a capped cone seen from below would be a solid disc hiding everything.
   * But an open cone shows only its OUTSIDE: the far wall's inner surface is back-facing and
   * culled, so a single shell reads as half a shade with a hole behind the bulb.
   *
   * So there are two, and the inner one is mirrored on X. Mirroring reverses a geometry's
   * winding, which turns its faces inward - the same property that silently culls a hand-built
   * quad when somebody scales it negative by accident, used deliberately here.
   *
   * ## And they are not the same material, which was the bug
   *
   * Both were `MAT.metal`, which is metalness 0.65 - and a metal at 0.65 with a point light
   * five centimetres off it returns a specular that clips. The shade rendered PURE WHITE, the
   * brightest object in the frame, which is precisely the fault §2 had just finished fixing on
   * this same lamp. A shade cannot be allowed to out-shine the lamp inside it.
   *
   * Galvanised was the first answer and it was not enough: measured, the outer shell came back
   * at median 209 against the wall it hangs on at 158 - still the brightest object in the
   * frame, still §187's problem, just a less blinding version of it.
   *
   * The reason is worth having, because it is not obvious and it will come back. The porch
   * light is not INSIDE this shade. §2 moved it 45cm forward to stop it scorching the brick,
   * which means it now sits out in the air in front of the lamp shining BACK at it - so the
   * shade's outer face, which ought to be the one surface here that never sees the bulb, is
   * square-on to a light at point-blank range. No roughness value fixes a geometry problem.
   *
   * What fixes it is albedo. `MAT.dark` is about a sixth reflective against galvanised's four
   * tenths, which lands the shade near 80 - well under the wall, where a shade belongs. And it
   * is not a cheat: a porch lamp painted dark, seen at night from below, IS a black shape with
   * light coming out from under it. Making it pale was the stylisation; this is the photograph.
   *
   * Warm pale inside, because the inside of a shade over a lit bulb really is bright, and the
   * two disagreeing is what makes it read as a hollow object rather than a cone.
   */
  const SHADE_DEEP = 0.17;
  const SHADE_MID = porchAt.y - 0.055 + SHADE_DEEP / 2;
  const hoods: THREE.BufferGeometry[] = [];
  const shell = new THREE.CylinderGeometry(0.058, 0.185, SHADE_DEEP, 12, 1, true);
  shell.translate(porchAt.x, SHADE_MID, porchAt.z + 0.05);
  hoods.push(shell);
  // A crown cap, so the top is closed the way a fitting's is.
  const crown = new THREE.CylinderGeometry(0.058, 0.058, 0.012, 12);
  crown.translate(porchAt.x, SHADE_MID + SHADE_DEEP / 2 + 0.005, porchAt.z + 0.05);
  hoods.push(crown);
  /*
   * The stem it hangs off the brick on, and it runs BACK rather than sideways.
   *
   * It was 120mm long centred a centimetre behind the bulb, which put half of it out in front
   * of the shade where it read as a dark bar sticking out of the side of the lamp. The wall
   * face is at z -0.25; this now spans the gap from the crown to the brick and stops.
   */
  const stem = new THREE.BoxGeometry(0.03, 0.03, 0.2);
  stem.translate(porchAt.x, SHADE_MID + SHADE_DEEP / 2 + 0.012, porchAt.z - 0.05);
  hoods.push(stem);
  scene.registerProp(
    'porch-hood',
    meshOf('PorchHood', mergeGeometries(hoods, false) ?? shell, MAT.dark)
  );

  const lining = new THREE.CylinderGeometry(0.053, 0.178, SHADE_DEEP - 0.005, 12, 1, true);
  lining.scale(-1, 1, 1);
  lining.translate(porchAt.x, SHADE_MID, porchAt.z + 0.05);
  scene.registerProp('porch-hood-inner', meshOf('PorchHoodInner', lining, MAT.plastic));

    /*
   * ## This room's shadow-casting key (D-4)
   *
   * A point light, so a cube map - six renders rather than one. That is the trade the repair
   * shop settled: the cheap lights in these rooms cast shadows nobody can see, and the one
   * that can reach the surfaces objects rest on is the expensive kind. A diorama is a small
   * set with a handful of props, which is where a cube is affordable.
   */
  const porchKey = ENGINE.PointLightNode.create({
      name: 'Porch',
      /*
       * Further off the facade, and a slacker falloff, because the wall around the bulb was
       * the brightest thing in the frame.
       *
       * Measured off a capture: the surface around the lamp came out at mean luma 179.5
       * against the bulb itself at 166, with nothing clipping - so the bounce was brighter
       * than the source. And the centre of mass of the brightest 2% of the whole diorama sat
       * at y 0.11, the top edge of the picture. §187 gives the eye to the brightest thing, so
       * in a scene about a door, a lock and a man, the eye went to a blank strip of ceiling
       * and left.
       *
       * The cause is the same one the fluorescent batten hit in Mirela's shop: a point light
       * a few centimetres from a surface, where the falloff term is enormous. There is a hood
       * modelled over this bulb and it cannot help - nothing in this project casts shadows,
       * so the hood is a shape, not an occluder.
       *
       * Two changes, and neither is "turn it down":
       *
       *  - 0.45 rather than 0.25 forward, so the source is a hand's breadth off the wall
       *    instead of touching it. It also moves toward the door and toward Dorin, which is
       *    where the light is wanted.
       *  - decay 1.25 rather than 1.7. Decay is what sets the near-to-far RATIO, and that
       *    ratio is the actual fault: at 1.7 the wall at 7cm is eighty times Dorin at 90cm,
       *    and at 1.25 it is about sixteen. The pool stays tight because `distance` still
       *    bounds it, which is what the note above is really asking for.
       *
       * Intensity rises to 11 to keep the door where it was, since a slacker decay means less
       * light arrives at the middle distances.
       */
      position: porchAt.clone().add(new THREE.Vector3(0, 0, 0.45)),
      intensity: 11,
      color: new THREE.Color('#ffd49a'),
      distance: 5,
      decay: 1.25,
    });
  castShadows(porchKey as unknown as THREE.Object3D, {
    mapSize: 1024,
    radius: 2.5,
    normalBias: 0.02,
    bias: -0.0005,
  });
  scene.registerProp('porch', porchKey);;

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
  const stepBounce = ENGINE.PointLightNode.create({
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
  });
  scene.registerProp('step-bounce', stepBounce);

  /*
   * ## F10's third beat: the light on the step comes from inside the house
   *
   * The door opening already raises `hallLight` in lockstep with the door angle, so the
   * threshold changes - but the man standing on the step does not. He is lit by a bounce off
   * the path that has no idea a door just opened behind him.
   *
   * This is the half that was missing. As the door goes, the bounce warms and reaches further,
   * so the light arriving on Dorin is the house's light. It is the difference between a door
   * opening in the same picture he is standing in and a door opening ONTO him.
   *
   * 2.4 seconds against the door's own swing, and the distance moves with the intensity -
   * a source that gets brighter without getting bigger reads as a lamp being turned up rather
   * than as a room being opened.
   */
  scene.registerLightBeat(
    'threshold',
    (t) => {
      stepBounce.intensity = 3.4 + t * 1.2;
      stepBounce.distance = 2.1 + t * 0.9;
    },
    2.4
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
    /*
     * Pulled back, and panned right, so that DORIN IS IN THE PICTURE.
     *
     * He was not. Projected through the old framing he lands at screen x 0.688, and the
     * console panel's left edge is at 0.645 - so the contact, in a game whose entire premise
     * is a conversation with a person, was behind the interface for the whole call. At 4:3 he
     * was at 0.751, deeper still.
     *
     * That was not visible in a capture, which is how it survived: what you see at the left of
     * the frame is a prop on the porch, and reviewing the recording by eye read it as him.
     * `scripts/dev/probe-door.ts` settles it in one run.
     *
     * Panning alone cannot fix it - the door leaves the left of frame before he arrives from
     * the right, because he stands 77cm to the door's side and the camera is off to the other.
     * Pulling BACK is what works: a wider frame compresses everything toward the centre, so
     * the door comes right and he comes left at the same time. 4.2m with the target at x 0.42
     * puts him at 0.586 and the door at 0.428, both clear of the panel, and holds at 4:3 where
     * he lands at 0.614.
     *
     * The cost is a smaller warm pool in a bigger dark frame, which is the trade this scene
     * can best afford: §230 wants "a man in a small circle of yellow with a town of blue
     * behind", and that reads better at this distance than at three metres, not worse.
     */
    position: new THREE.Vector3(-1.55, 1.72, 4.2),
    target: new THREE.Vector3(0.42, 1.25, -0.26),
  });
  /**
   * The lock, and the camera was standing inside Dorin.
   *
   * Reported as "my contact view is Dorin's back, I am not sure how to find the clues" -
   * and the second half followed from the first. Measured, the old camera at (0.85, 1.2,
   * 0.75) sat 0.30m from his chest. That is not a tight over-the-shoulder, it is inside the
   * man: at a third of a metre a 1.8m body subtends more than the whole frame, so the shot
   * was his coat, and the lock it was pushing in on was 24 degrees off axis at the very
   * edge of it.
   *
   * The lock itself was never the problem. It reads at 99/255 brass against 29/255 timber
   * under the step bounce, which is legible - it was simply behind somebody.
   *
   * From here it is 1.31m away, dead centre, and 14 degrees off the door's own face, so the
   * escutcheon and the keyway are seen nearly square-on rather than edge-on. He is 0.86m
   * back and 49 degrees off axis, which puts him out of frame entirely - correct for this
   * shot, because the request at this moment is not about him. He is on the line describing
   * what his fingers can feel, and what the player needs to see is the thing being
   * described.
   */
  scene.registerShot('lock', {
    position: new THREE.Vector3(-0.1, 1.12, 1.05),
    // Follows the keyhole down when it moved under the handle. A shot aimed at where the
    // lock used to be is a push-in on a door handle.
    target: new THREE.Vector3(0.2, 1.0, -0.22),
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

    ['porch', CERTAINTY.SHAPED],
    ['porch-hood', CERTAINTY.SHAPED],
    ['porch-hood-inner', CERTAINTY.SHAPED],
    ['porch-bulb', CERTAINTY.SHAPED],
    ['step', CERTAINTY.SHAPED],
    ['front', CERTAINTY.SHAPED],
    /*
     * The neighbours, at the same confidence as the house.
     *
     * SHAPED rather than KNOWN because the machine has never been down this street either -
     * it knows there is a terrace because Dorin is standing on one, and that is exactly the
     * certainty the rest of the facade carries. A wall drawn more confidently than the door
     * in it would say the reconstruction is surer about the neighbours than about the
     * problem.
     */
    ['terrace', CERTAINTY.SHAPED],
    ['terrace-dark', CERTAINTY.SHAPED],
    ['terrace-glass', CERTAINTY.SHAPED],
    ['terrace-room', CERTAINTY.SHAPED],
    /*
     * The cat is DESCRIBED, and it is the one thing here the machine is not guessing at.
     *
     * Everything else on this street is inferred from a phone call - the machine has never
     * seen the door, the brick or the bin, and they are drawn at the confidence that
     * deserves. The cat is on the optical feed. It is the only object in the shot that
     * something is actually looking at, so draining it toward cyan with the architecture
     * would be the reconstruction being unsure about the one thing it can see.
     */
    ['cat', CERTAINTY.DESCRIBED],
    ['hall', CERTAINTY.SHAPED],
    ['path', CERTAINTY.SHAPED],
    ['path-weeds', CERTAINTY.SHAPED],
    ['wall-seam', CERTAINTY.SHAPED],
    /*
     * The fittings go with the wall they are screwed to, and the house number goes with them
     * even though it is the one object here carrying a hard fact.
     *
     * Tempting to draw the number at KNOWN - the machine has an address, that is how it found
     * the street. But what the tier expresses is confidence in the RECONSTRUCTION, and the
     * number being right is not the same as the enamel plate under it being right. It has
     * never seen the plate. Drawing one legible object at full certainty on a wall of guesses
     * would read as the machine being oddly sure about a piece of tin.
     */
    ['downpipe', CERTAINTY.SHAPED],
    ['meter-box', CERTAINTY.SHAPED],
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
    /*
     * Same rule, and this one was doing visible damage. `landing` is the lit window on the
     * stairs - `MAT.landingLight` - and SUSPECTED does not render a prop, it renders a dark
     * box in its place. So the one warm thing at the night door was a black volume with cyan
     * edges, permanently, with nothing in the mission able to promote it.
     */
    ['landing', CERTAINTY.SHAPED],
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

  /*
   * How much of the rig's afternoon reaches this room.
   *
   * Six of the eight scenes were sitting at the default 1, which means the workstation's
   * global key AND its sky fill landed on top of whatever practicals the room had lit
   * itself with. The sky term is the problem: it is an ambient, it has no direction, and at
   * full strength it raises every shadow in the room to roughly the value of every lit
   * surface. Reported as the contact rooms looking flat next to the menu room, and that is
   * exactly what it is - the menu room is lit by three practicals and nothing else.
   *
   * Lowering this does not make a room dark; it hands the room back to the lights that were
   * already in it and lets the corners go. Each value below is what the fiction says about
   * the place rather than a level: outdoors and open, which is the one interior-lighting argument that does not apply
   */
  scene.daylight = 0.85;
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
  // The torch's own body must not block the torch - see the note on torchLight above and
  // the opt-out in art/shadows.ts. It is centimetres from the emitter, so its bell would
  // throw a black disc over the entire road it is meant to be lighting.
  torchRoot.traverse((o) => {
    o.userData.noShadowCast = true;
  });

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
       * He closes.
       *
       * Fired on `how-close`, whose first line is "Twenty metres. Maybe less now." - the
       * beat where the player asks how near he is, and the camera pushes in on him to
       * answer. He was standing perfectly still through all of it, so the line was a
       * claim the picture contradicted.
       *
       * This is the one place in the game a walk cycle earns its keep, and it is worth
       * saying why it is here and not in Adaeze's garden, where the question came up. A
       * walk needs three things at once: the character has to be ON CAMERA, the movement
       * has to be MOTIVATED by the beat, and it has to happen ONCE so it cannot read as a
       * loop. A patrol between two points fails the last of those on its second lap and
       * the first as soon as the shot changes - framing here belongs to the beat, so a
       * contact wandering on a timer walks out of a composed frame. He passes all three:
       * `camera.push-in:follower` is pointed straight at him, the request is about how
       * close he is getting, and he does it when asked.
       *
       * An ABSOLUTE mark rather than a relative step, because `how-close` can be
       * re-entered - `onUnrecognised` returns to it, and three other beats route back
       * through ASK_WHO. Relative steps would let a player who kept asking walk him past
       * the camera and out of the road. He comes to 7.4m and stays there however many
       * times he is asked about; the guard below means a repeat is not even a twitch.
       *
       * He keeps to the hedge side, because that is what she says he does.
       */
      closer: (_tweener, node) => {
        const to = new THREE.Vector3(1.88, 0, -7.4);
        if (node.position.distanceTo(to) < 0.2) return;
        follower.walk(to);
      },

      /**
       * He breaks off.
       *
       * Not a fade and not a delete: he crosses the road to the mill side and walks into
       * the cut, which is exactly what she narrates. A contact describing something the
       * player can watch happen is the difference between an ending and a caption.
       *
       * It WAS a lerp, and a lerp is a slide - a man in a walk-cycle-free T of a pose
       * travelling seven metres without taking a step, turning at a constant rate the
       * whole way. He now walks it, at the speed the clip's own planted foot moves, and
       * turns onto the heading rather than through it. `interrupt` because he may still
       * be closing in when the torch goes on, and being ignored there would have him
       * carry on toward her at the exact moment the mission says he gives up.
       */
      clear: () => {
        follower.walk(new THREE.Vector3(MILL_X - 0.6, 0, CUT.z - 1.2), { interrupt: true });
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
  /*
   * Deliberately NOT casting, and now with the reason recorded.
   *
   * D-4 gave every other diorama a shadow-casting key and tried to give this one the torch,
   * which is by far the most motivated caster in the game: a woman alone on a night road
   * holding the only light, her shadow thrown down the road ahead. Measured, the scene went
   * to 98.8% of pixels under luma 10 - the road, the hedge and the woman all vanished. The
   * torch is a narrow cone at a shallow angle down a long road, and once it casts, almost
   * everything the cone reaches is behind something else that the cone also reaches.
   *
   * Exempting the torch body did not help, which is what rules out the fixture-occlusion
   * fault that the repair shop had. Whatever this is, it is not that, and a black scene is a
   * worse outcome than an unattached one. Left off until somebody can work out why with the
   * scene in front of them.
   */
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

  /*
   * No `setCertainty` table here, and that is the finished state rather than a gap.
   *
   * Six of the eight rooms declare their opening certainties and raise them on facts, and
   * the obvious reading of this room having none is that somebody stopped before the last
   * two. It is the opposite: this room says the same thing per PIXEL instead of per prop,
   * which is strictly better and cannot be run twice.
   *
   * `guess.claim` above drains everything outside the torch beam toward the guess colour
   * and lays the cyan grid over it, so certainty here is a function of where the light is
   * pointing rather than of what Sanda has said. The follower is the case that proves it:
   * as a prop-level certainty he would resolve the moment she described him, from twenty
   * metres away in the dark, which is not what the request is about. Under the beam he
   * resolves when, and only when, she puts the light on him.
   *
   * Layering the prop system on top would also collide outright below SHAPED, where
   * `applyCertainties` swaps the prop for a `createSuspicion` box - two systems replacing
   * one object, and the torch would then be lighting the replacement.
   */
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
  /**
   * The overhead, on a key - see OmniscientRig's overview toggle.
   *
   * The default shot deliberately refuses a plan view, and its note says why: from
   * straight up the height variation foreshortens and the district reads as a circuit
   * board rather than a city. That is the right default and it is the wrong ONLY view,
   * because the thing the player is actually doing here - following a car across a road
   * network - is a plan-view task. So the tilt stays the shot the room opens on and the
   * map is a key away.
   *
   * Dead overhead rather than nearly: 0.1 of z is enough to keep the up vector from
   * degenerating while reading as square to the grid.
   *
   * 240m, which is a measurement and not a guess. The district is 24 cells of 8, so
   * it runs to 96 either side of the origin - from 240 up its edge sits 21.8 degrees
   * off nadir and fits inside the lens; from the 108 this was first written at it
   * was 41.6 and half the city was off the sides of the frame.
   */
  scene.registerShot('overview', {
    position: new THREE.Vector3(0, 240, 0.1),
    target: new THREE.Vector3(0, 0, 0),
    duration: 1.8,
  });

  /*
   * The amber marker that used to float past the district is gone.
   *
   * It was §52's bigger world said in the room's own language - a signal the network has
   * and cannot name, placed on the default shot's view axis 375m outside District 07. The
   * placement was careful and the idea was sound, and it still read as a waypoint: an amber
   * dot over a city is the universal symbol for somewhere you are meant to go, and this
   * mission already asks the player to pick points on a map.
   *
   * The anomaly says the same thing better, and says it where the player is already
   * scanning for signals - off the side of the globe, unnamed, in a screen whose whole
   * job is telling you where things are. Two statements of one idea is one too many, and
   * this was the one competing with a puzzle.
   */

  scene.registerShot('windscreen', {
    position: new THREE.Vector3(12, 2.2, 30),
    target: new THREE.Vector3(-8, 3.4, -16),
    duration: 4,
  });

  /*
   * ------------------------------------------------------------------ the car, and the end
   *
   * The header of mission-08-district.ts promised "the moment the wireframe resolves into
   * rain on a windscreen" before a line of this mission was written, and the windscreen
   * shot above has been dropping the camera into the traffic for months with nothing at the
   * bottom of the move. This is what it drops into.
   *
   * It lives in THIS scene rather than one of its own, and that is the whole trick. A cut
   * to another room would be the game changing subject; a set already standing in the
   * district, revealed as the camera arrives at eye level, is the same continuous look
   * finally landing on something solid. The wireframe does not end. It resolves.
   *
   * Built AT THE END OF THE WINDSCREEN MOVE, which is the part worth getting right.
   *
   * The obvious build parks the set somewhere out of the way and cuts to it. That throws
   * away the only thing this scene already had: a four second drop from the overhead into
   * the traffic, written months ago with a note about the little green boxes finally
   * passing at eye level at the exact moment the game admits they are people. A cut would
   * be the game changing subject. Landing the same move inside a solid car is the wireframe
   * RESOLVING, which is the sentence the mission header wrote before any of this existed.
   *
   * So the driver's eye goes exactly where that shot leaves the camera, facing exactly
   * where it leaves it looking - derived from the shot rather than typed in, so moving the
   * shot moves the car and the two can never drift apart.
   */
  const EYE_AT = new THREE.Vector3(12, 2.2, 30);
  const LOOK_AT = new THREE.Vector3(-8, 3.4, -16);
  const car = carInterior();

  const solid = (colour: string, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(colour),
      roughness: 0.82,
      metalness: 0.05,
      ...extra,
    });

  const part = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.visible = false;
    return mesh;
  };

  const cabin = part('Cabin', car.cabin, solid('#161a1c'));
  const glass = part(
    'Windscreen',
    car.windscreen,
    solid('#0d1a1e', { transparent: true, opacity: 0.22, roughness: 0.12 })
  );
  const wipers = part('Wipers', car.wipers, solid('#0a0c0d'));
  const phone = part('Phone', car.phone, solid('#0b0e10', { emissive: new THREE.Color('#0b0e10') }));
  const rim = part('Glasses', car.glasses, solid('#0e1113'));

  /*
   * A group inside the node carries the yaw, so the set faces down the road the camera is
   * looking along. The geometry is built looking down -Z; this turns -Z onto the shot's own
   * view direction.
   */
  const facing = LOOK_AT.clone().sub(EYE_AT);
  const cabinGroup = new THREE.Group();
  cabinGroup.rotation.y = Math.atan2(-facing.x, -facing.z);
  for (const mesh of [cabin, glass, wipers, phone, rim]) cabinGroup.add(mesh);

  /*
   * The intervention the machine can perform and cannot enforce.
   *
   * The lights route previously hid the solid car and left the wireframe unchanged. The
   * dialogue said a municipal signal turned red and the car drove through it, while the
   * world showed neither event. This miniature signal lives at the windscreen landing and
   * shares the cabin's road-aligned frame: red asserts, the tracked return crosses the stop
   * line, and the player sees the precise limit of OMNISCIENT_'s reach.
   */
  const signalRoot = new THREE.Group();
  signalRoot.name = 'TrafficIntervention';
  signalRoot.visible = false;

  const signalMaterial = new THREE.LineBasicMaterial({
    color: new THREE.Color('#ff4f5f'),
    transparent: true,
    opacity: 0.9,
  });
  const signalGeometry = new THREE.BufferGeometry();
  signalGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        -3.4, -2.0, -15.8, 3.4, -2.0, -15.8,
        -3.1, -2.0, -15.8, -3.1, 1.15, -15.8,
        -3.1, 1.15, -15.8, -2.3, 1.15, -15.8,
      ],
      3
    )
  );
  signalRoot.add(new THREE.LineSegments(signalGeometry, signalMaterial));

  const signalLamp = new THREE.Mesh(
    new THREE.RingGeometry(0.13, 0.24, 14),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ff5968'),
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  signalLamp.position.set(-2.3, 1.15, -15.78);
  signalRoot.add(signalLamp);

  const suspectGeometry = new THREE.BufferGeometry();
  suspectGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [-0.48, 0, 0, 0.48, 0, 0, 0, 0, -0.82, 0, 0, 0.82],
      3
    )
  );
  const suspect = new THREE.LineSegments(
    suspectGeometry,
    new THREE.LineBasicMaterial({ color: new THREE.Color('#bfe9c8'), transparent: true, opacity: 0.98 })
  );
  suspect.position.set(0, -1.88, -23);
  signalRoot.add(suspect);
  cabinGroup.add(signalRoot);

  /*
   * The rain, and the light to see it by.
   *
   * This scene sets `atmosphere = false` and has no lights in it, because everything else in
   * it is LineBasicMaterial and line materials do not care. The car is the first lit thing
   * that has ever stood here, so without these it renders as a black rectangle in front of
   * the city - which is exactly what it did.
   *
   * Three sources, all weak. A cold ambient so the cabin is a shape rather than a
   * silhouette; a green key from ahead and to the left, which is the district's own light
   * coming through the glass; and nothing behind, because there is nothing behind - a
   * back light would invent a world outside the car that this shot never shows.
   */
  const rain = createRainGlass(car.windscreen);
  for (const layer of rain.layers) cabinGroup.add(layer);

  const carNode = ENGINE.SceneNode.create({ name: 'CarInterior', position: EYE_AT });
  carNode.add(cabinGroup);
  carNode.add(new THREE.AmbientLight(new THREE.Color('#1c2c33'), 1.1));
  const key = new THREE.DirectionalLight(new THREE.Color('#9fd8a8'), 1.4);
  key.position.set(-3, 2, -6);
  carNode.add(key);

  /** A point in the car's own frame, in world space. */
  const inCar = (local: THREE.Vector3): THREE.Vector3 =>
    local.clone().applyEuler(cabinGroup.rotation).add(EYE_AT);

  /*
   * Wipers and a ringing phone, driven per frame.
   *
   * `idle` rather than a tween, because both are things the world does whether or not
   * anybody cued them - the wiper was sweeping before the machine arrived, and the phone
   * rings on the network's clock rather than on the console's. Inert until their part is
   * visible, so a set nobody has revealed costs nothing.
   */
  let carClock = 0;
  let wiped = false;
  scene.registerProp('car', carNode, {
    anchors: {
      windscreen: inCar(car.anchors.windscreen),
      phone: inCar(car.anchors.phone),
      road: inCar(car.anchors.road),
    },
    idle: (deltaTime) => {
      if (!cabin.visible && !signalRoot.visible) return;
      carClock += deltaTime;
      if (signalRoot.visible) {
        // The four-second camera descent arrives as the trace crosses the red line.
        const crossing = Math.max(0, Math.min(1, (carClock - 2.75) / 1.55));
        suspect.position.z = -23 + crossing * 18;
        signalMaterial.opacity = 0.72 + Math.sin(carClock * 7) * 0.18;
        signalLamp.scale.setScalar(0.9 + Math.sin(carClock * 7) * 0.12);
      }
      if (!cabin.visible) return;
      /*
       * One sweep every 2.4 seconds, and it PARKS between them. A wiper that never stops is
       * a metronome; the pause is what makes the next sweep feel like weather.
       */
      const cycle = carClock % 2.4;
      const sweeping = cycle < 0.9;
      wipers.rotation.z = sweeping ? Math.sin((cycle / 0.9) * Math.PI) * 0.85 : 0;
      /*
       * The blade and the water are one system.
       *
       * Cleared at the MIDDLE of the sweep rather than at its start, because that is where
       * the blade actually crosses the part of the glass the camera is looking through.
       * Clearing on contact is the whole illusion: rain that fades on a timer next to a
       * wiper that happens to be moving reads as two unrelated animations.
       */
      if (sweeping && !wiped) {
        rain.wipe();
        wiped = true;
      }
      if (!sweeping) wiped = false;
      rain.update(deltaTime);
      if (phone.visible) {
        // Bursts of two, the way a phone rings, then a gap somebody could hope into.
        const ring = carClock % 4.2;
        const lit = ring < 0.6 || (ring > 1 && ring < 1.6);
        (phone.material as THREE.MeshStandardMaterial).emissive.setStyle(lit ? '#7fe08a' : '#0b0e10');
      }
    },
    actions: {
      /*
       * Three endings, three subsets of one set.
       *
       * Each is the machine having done the thing it was asked to do, and none of them
       * changes what happens next - §157 holds all the way to the credits. What differs is
       * only which surfaces are in shot and where the lens is.
       */
      'arrive-lights': () => {
        // Stays in the wireframe. Nothing of the car is revealed; the district IS the shot.
        for (const mesh of [cabin, glass, wipers, phone, rim]) mesh.visible = false;
        rain.setVisible(false);
        signalRoot.visible = true;
        suspect.position.z = -23;
        carClock = 0;
      },
      'arrive-call': () => {
        for (const mesh of [cabin, glass, wipers, phone]) mesh.visible = true;
        // No spectacles: this ending is not looking through anybody. It is reaching into a
        // car through a phone nobody picks up.
        rim.visible = false;
        rain.setVisible(true);
        signalRoot.visible = false;
        carClock = 0;
      },
      'arrive-watch': () => {
        for (const mesh of [cabin, glass, wipers]) mesh.visible = true;
        // No phone, because nothing was called - and the rim, because somebody is wearing
        // the thing the machine is looking through.
        phone.visible = false;
        rim.visible = true;
        rain.setVisible(true);
        signalRoot.visible = false;
        carClock = 0;
      },
    },
  });

  /*
   * There is no second camera move, and that is deliberate.
   *
   * Two more shots were registered here - one looking down at the phone, one out at the
   * road - and they were the wrong instrument. All three endings take the SAME drop into
   * the traffic; what differs is what is standing there when it lands. A camera that swings
   * to the phone tells the player to look at it, and the whole point of where that phone
   * sits is that it goes off beside somebody who is not looking at it. Peripheral vision
   * does the work a pan would have taken away.
   */

  /*
   * No certainty table here either, and this one is not a choice - the law cannot reach
   * this room.
   *
   * Every prop above is `LineSegments` on a `LineBasicMaterial`. `applyCertainty` walks a
   * subtree through `renderTargetOf`, which requires `isMesh`; line segments do not have
   * it, so the traversal returns null for all five props and touches nothing. Authoring a
   * table would produce five "changed nothing" warnings and no pixels - the silent
   * nothing-happened this codebase has lost afternoons to, dressed up as a feature.
   *
   * There is nothing to resolve FROM in any case. The certainty scale runs from the
   * machine's guess at a thing to the thing itself, and this room has no things: it is
   * the network drawn as the network, the one set that is already entirely the machine's
   * own abstraction. A wireframe city that resolved into a real one would be telling the
   * player the opposite of what District 07 is about - Lucian can see everything here,
   * and the one car he wants is the one thing the lattice does not contain.
   */
}

/**
 * MISSION 09 - Station 9, and the only contact view in the game with no room in it.
 *
 * The camera opens hard on Keller's monitor and never leaves it. That is the whole idea:
 * every other request in OMNISCIENT_ asks the player to read a place, and this one has
 * nothing to read except a file somebody is deciding whether to open. There is a desk, a
 * wall and a lamp behind the screen, and they exist only so the monitor is an object in a
 * room rather than a texture on the frame - they are never in focus and never referred to.
 *
 * The desktop is a live 192x144 CRT buffer, redrawn every frame through the prop's idle
 * hook. See stationDesk.ts.
 */
function buildStationDesk(scene: ContactScene): void {
  /*
   * No haze, no daylight, no lights at all.
   *
   * There is exactly one object in this scene and its material is unlit. Fog would put a
   * grey wash over the only thing the scene exists to show, and a key light would do
   * nothing to a MeshBasicMaterial except cost a shadow pass.
   */
  scene.atmosphere = false;
  scene.daylight = 0;

  const surface = new CRTSurface({
    width: SCREEN_W,
    height: SCREEN_H,
    background: '#2b3a54',
  });
  const desktop = new StationDesktop(surface);
  const screen = buildStationScreen(surface);
  scene.add(screen.root);

  /*
   * The desktop, registered as a prop so the mission can talk to it.
   *
   * `idle` is what makes the screen alive at all - the clock moves, the caret blinks, the
   * window grows - and the three actions are the only vocabulary the conversation needs:
   * point at the file, open it, put it back.
   */
  scene.registerProp('desktop', screen.root, {
    idle: (dt) => desktop.advance(dt),
    actions: {
      select: () => {
        desktop.state = 'selected';
      },
      open: () => {
        desktop.state = 'opening';
      },
      close: () => {
        desktop.state = 'idle';
      },
      log: () => {
        desktop.showResolution('logged');
      },
      contained: () => {
        desktop.showResolution('contained');
      },
    },
  });

  /*
   * One shot, and it is the screen filling the frame.
   *
   * 0.312 rather than the exact 0.318 the arithmetic gives, so the quad slightly overfills
   * and the player never catches an edge of it against the void. There is no second shot on
   * this scene and no camera move anywhere in the mission: a desktop that drifts is a
   * desktop being filmed, and this one is being LOOKED at.
   */
  scene.registerShot('default', {
    position: new THREE.Vector3(0, 0, 0.312),
    target: new THREE.Vector3(0, 0, 0),
    duration: 1.6,
  });
  scene.registerShot('room', {
    position: new THREE.Vector3(0, 0, 0.312),
    target: new THREE.Vector3(0, 0, 0),
    duration: 1.6,
  });
  scene.registerShot('file', {
    position: new THREE.Vector3(0, 0, 0.312),
    target: new THREE.Vector3(0, 0, 0),
    duration: 1.6,
  });
}

ContactScene.registerBuilder('scene-station-desk', buildStationDesk);
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
