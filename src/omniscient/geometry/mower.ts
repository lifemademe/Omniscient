/**
 * The mower: a machine the machine can drive.
 *
 * ## Why this exists at all
 *
 * Adaeze's request was the thinnest in the game - three questions and she tells you the
 * answer - and the objection to giving it a driving minigame was that OMNISCIENT_ has no
 * hands. That objection was wrong, and District 07 is the proof: the player already takes
 * a municipal camera network and hops it street by street to follow a car. The machine
 * does not touch anything there either. It signs into equipment that is already on the
 * network and operates it down a link, which is precisely what it is for.
 *
 * So this is not a person pushing a mower. It is a groundskeeping unit sitting on
 * somebody's smallholding with a radio in it, and the player is the thing that logs in.
 * The one rule the game has - the machine acts THROUGH the world, never in it - is not
 * broken by this. It is the clearest statement of it anywhere in the project, because for
 * once the world it is acting through is a vehicle.
 *
 * ## What it looks like
 *
 * Ninety-futuristic, in the same sense as everything else out here: built like a piece of
 * late-eighties agricultural plant that happens to have a receiver on it. That means
 * pressed steel and moulded plastic in flat colours, one amber indicator, chunky ribs, and
 * no screens, no chrome and no glowing seams. The tell that it is remote is the aerial and
 * the beacon, not a lightshow.
 *
 * Small, because it works in the 1.1m strip between the tunnel's hoops and the neighbour's
 * trunk, which is where the weeds it is here for are actually growing.
 *
 * Widened once, from 0.62 across the deck and a 0.5m cut. A 0.5m cut over a 3.45m bank is
 * seven passes with no room for error in any of them, and the deck is the single number
 * that decides whether the job reads as work or as admin. 0.62 makes it six comfortable
 * passes and still leaves visible misses when the lines are sloppy, which is the point:
 * the skill has to stay in the overlap.
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { MAT } from '../art/palette.js';
import { decorMesh as meshOf } from '../art/mesh.js';

/** Across the deck. The cut is narrower - see `CUT_WIDTH`. */
export const MOWER_WIDTH = 0.7;
/**
 * How wide a strip it actually cuts.
 *
 * Narrower than the body, the way a real deck is: the blade cannot reach past the housing
 * that carries it. It also means a player who drives in neat parallel passes leaves thin
 * uncut lines between them unless they overlap, which is the entire skill in mowing and
 * the only reason this is a game rather than a walk.
 */
export const CUT_WIDTH = 0.68;
/** Metres per second flat out. A brisk walking pace - this is a groundskeeper, not a kart. */
export const MOWER_SPEED = 1.85;
/** Radians per second at full lock. */
export const MOWER_TURN = 1.9;
/** Deck height off the ground, which is also where the camera sits over. */
export const DECK_Y = 0.17;

export interface GeneratedMower {
  root: ENGINE.SceneNode;
  /** The blade housing, spun while it is cutting. */
  rotor: ENGINE.MeshNode;
  /** The amber beacon, flashed while it is under remote control. */
  beacon: ENGINE.MeshNode;
  /**
   * Grass coming off the deck. See `spray`.
   *
   * Parented to the machine so it inherits the gait for free, which matters more than it
   * sounds: clippings that do not shake with the mower that threw them read as a decal.
   */
  clippings: THREE.Points;
}

/** How many clippings can be in the air at once. The pool is fixed - see `spray`. */
export const CLIPPINGS = 60;

/**
 * Build the unit.
 *
 * One merged body mesh, plus two parts that have to move on their own. Everything is
 * built around an origin at the CENTRE OF THE DECK AT GROUND LEVEL, facing +z, because
 * that is what the drive controller wants to steer: the contact patch, not the middle of
 * the box. Building it around its own bounding-box centre is the classic way to get a
 * vehicle that pivots about its roof.
 */
export function buildMower(name = 'Mower'): GeneratedMower {
  const root = ENGINE.SceneNode.create({ name });

  const shell: THREE.BufferGeometry[] = [];
  const trim: THREE.BufferGeometry[] = [];

  /*
   * The deck: a slab with its corners taken off at the front.
   *
   * A plain box reads as a crate. Chamfering only the leading edge gives it a direction,
   * which matters enormously for a thing seen from behind for the whole of a minigame -
   * the player has to be able to tell at a glance which way it is pointing, and on a
   * symmetrical box they cannot.
   */
  const deck = new THREE.BoxGeometry(MOWER_WIDTH, 0.13, 0.72);
  deck.translate(0, DECK_Y, 0);
  shell.push(deck);

  const nose = new THREE.CylinderGeometry(MOWER_WIDTH * 0.5, MOWER_WIDTH * 0.42, 0.13, 12, 1, false, 0, Math.PI);
  nose.rotateY(-Math.PI / 2);
  nose.translate(0, DECK_Y, 0.36);
  shell.push(nose);

  /*
   * The motor housing, sitting proud and back, where an engine goes.
   *
   * Off-centre in z on purpose. A vehicle with its mass symmetric front-to-back has no
   * front, and the ribs below only read as cooling if there is a lump for them to be on.
   */
  const housing = new THREE.BoxGeometry(0.4, 0.19, 0.34);
  housing.translate(0, DECK_Y + 0.15, -0.14);
  shell.push(housing);

  // Cooling ribs. Three is enough to say "cast" at this size; more is mud.
  for (let i = 0; i < 3; i++) {
    const rib = new THREE.BoxGeometry(0.43, 0.025, 0.045);
    rib.translate(0, DECK_Y + 0.10 + i * 0.055, -0.14);
    trim.push(rib);
  }

  /*
   * A bumper round the front, which is the one piece of it that is not square.
   *
   * Doing a real job as well as a visual one: this is the part that will be seen touching
   * the bed frames and the hoop feet, and a soft rubber-looking rail says "it bumps into
   * things and nothing breaks" - which is the promise the collision handling has to keep.
   */
  const bumper = new THREE.TorusGeometry(MOWER_WIDTH * 0.47, 0.028, 6, 14, Math.PI);
  bumper.rotateX(-Math.PI / 2);
  bumper.rotateZ(Math.PI);
  bumper.translate(0, DECK_Y - 0.02, 0.3);
  trim.push(bumper);

  /*
   * Four wheels, and the back pair larger.
   *
   * Same reason as the housing: it gives the silhouette a front and a back. Real pedestrian
   * mowers do this too, because the big wheels go where the weight is.
   */
  for (const side of [-1, 1] as const) {
    for (const [z, radius] of [
      [0.24, 0.1],
      [-0.24, 0.15],
    ] as const) {
      const wheel = new THREE.CylinderGeometry(radius, radius, 0.075, 10);
      wheel.rotateZ(Math.PI / 2);
      wheel.translate(side * (MOWER_WIDTH * 0.5 - 0.01), radius, z);
      trim.push(wheel);
    }
  }

  /*
   * The aerial, which is the whole story of the object in one part.
   *
   * Nothing else on it says "this is being driven from somewhere else". A whip on the back
   * corner does, and it costs eight triangles.
   */
  const mast = new THREE.CylinderGeometry(0.008, 0.012, 0.46, 5);
  mast.translate(MOWER_WIDTH * 0.34, DECK_Y + 0.31, -0.26);
  trim.push(mast);

  /**
   * The chute, which the clippings need to be coming OUT of.
   *
   * Added when the spray was: grass appearing from the side of a smooth box is grass
   * appearing from nowhere, and the eye finds the discrepancy faster than it finds the
   * effect. A short angled hood on the right flank at deck height gives it a source, and
   * the emitter below is aimed to match rather than the other way round.
   */
  const chute = new THREE.BoxGeometry(0.13, 0.11, 0.26);
  chute.rotateY(-0.32);
  chute.translate(MOWER_WIDTH * 0.5 - 0.01, DECK_Y - 0.01, -0.02);
  shell.push(chute);

  /**
   * The handle, folded down over the engine.
   *
   * The one part that tells the whole story of the object without a word: this is a
   * walk-behind mower, it has a push handle because somebody used to push it, and the
   * handle is folded flat because for years now nobody has. It also breaks up the top of
   * the silhouette, which was a flat lid from every angle the player sees it.
   */
  for (const side of [-1, 1] as const) {
    const arm = new THREE.CylinderGeometry(0.017, 0.017, 0.5, 6);
    // Laid back along the deck rather than standing up. Not quite flat - a folded handle
    // rests on whatever is under it, and here that is the motor housing.
    arm.rotateX(Math.PI / 2 - 0.22);
    arm.translate(side * (MOWER_WIDTH * 0.32), DECK_Y + 0.3, -0.3);
    trim.push(arm);
  }
  const grip = new THREE.CylinderGeometry(0.019, 0.019, MOWER_WIDTH * 0.64, 6);
  grip.rotateZ(Math.PI / 2);
  grip.translate(0, DECK_Y + 0.36, -0.53);
  trim.push(grip);

  root.add(meshOf(`${name}Shell`, mergeGeometries(shell, false) ?? shell[0], MAT.equipment));
  root.add(meshOf(`${name}Trim`, mergeGeometries(trim, false) ?? trim[0], MAT.equipmentBack));

  /**
   * The blade housing, under the deck.
   *
   * Visible only as a disc in the shadow under the machine, and that is enough - the point
   * is that when it is cutting, something down there is turning. A mower whose blade never
   * moves is a box on wheels.
   */
  const rotorGeometry = new THREE.CylinderGeometry(CUT_WIDTH * 0.5, CUT_WIDTH * 0.5, 0.035, 12);
  rotorGeometry.translate(0, 0.075, 0.04);
  // Two flats across it, so the spin is legible. A smooth disc turning looks stationary.
  const blade = new THREE.BoxGeometry(CUT_WIDTH * 0.96, 0.012, 0.05);
  blade.translate(0, 0.055, 0.04);
  const rotor = meshOf(
    `${name}Rotor`,
    mergeGeometries([rotorGeometry, blade], false) ?? rotorGeometry,
    MAT.galvanised
  );
  root.add(rotor);

  /**
   * The beacon: one amber lamp on the mast.
   *
   * Unlit material on purpose. Every other light in this scene is a real light, and this
   * one must not be - it is a 12V bulb on a farm machine, not a light source, and giving
   * it a PointLight would have it throwing amber across the seedlings from a metre away.
   * Flat emissive-looking colour reads as "lit lamp" at this size and costs nothing.
   */
  const beaconGeometry = new THREE.SphereGeometry(0.032, 8, 6);
  beaconGeometry.translate(MOWER_WIDTH * 0.34, DECK_Y + 0.55, -0.26);
  const beacon = meshOf(
    `${name}Beacon`,
    beaconGeometry,
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#e0a24c'), toneMapped: false })
  );
  root.add(beacon);

  /**
   * The spray off the chute.
   *
   * ## Why this is the piece that makes it feel like cutting
   *
   * The deck is under the machine and the grass it takes is 2.6cm wide, so from the camera
   * there is no moment of contact to see at all - the field is tall, then it is short, and
   * nothing happened in between. Everything about the cut was legible only in aggregate.
   * A handful of green thrown out of the side is the event: it says the blade is engaged,
   * it says WHERE the blade is, and it stops the instant there is nothing left to cut,
   * which is the clearest possible signal that a strip is done.
   *
   * ## A ring buffer, not a spawner
   *
   * Sixty points allocated once and recycled oldest-first. Emitting particles on demand
   * means allocating during the one activity in the game with a per-frame budget, and a
   * mower in deep grass is cutting on every single frame - so the pool is the whole design
   * rather than an optimisation of it. When they are all in flight the oldest is taken,
   * which at this lifetime is invisible and is the only behaviour that cannot stall.
   *
   * In LOCAL space, so they ride the machine. Which is wrong for thrown grass in the
   * strictest sense - a real clipping is in the world the moment it leaves - and right at
   * this scale, because their whole life is 0.4s within half a metre of the deck, and
   * parenting them costs one matrix instead of a world-space transform per point per frame.
   */
  const positions = new Float32Array(CLIPPINGS * 3);
  // Started below the floor, so nothing shows until the first one is actually thrown.
  for (let i = 0; i < CLIPPINGS; i++) positions[i * 3 + 1] = -10;
  const clipGeometry = new THREE.BufferGeometry();
  clipGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const clippings = new THREE.Points(
    clipGeometry,
    new THREE.PointsMaterial({
      // The cut face of a grass blade, which is paler and yellower than the standing plant.
      color: new THREE.Color('#a8c46a'),
      size: 0.045,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      toneMapped: false,
    })
  );
  clippings.frustumCulled = false;
  root.add(clippings);

  return { root, rotor, beacon, clippings };
}
