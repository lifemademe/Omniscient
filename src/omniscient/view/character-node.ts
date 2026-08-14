/**
 * Placing a generated person in a diorama, and keeping them alive while they stand there.
 *
 * Split out of `view/scenes.ts`, which was assembling characters inline between four
 * increasingly long scene builders. The two jobs here - turn `CharacterParts` into nodes,
 * and drive §236's idle - belong together and belong to neither scene.
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { applyPaintBanding } from '../art/painterly.js';

import { decorMesh } from '../art/mesh.js';
import { PERSON } from '../art/palette.js';
import { createRng, seedFrom } from '../core/rng.js';
import { createCharacter } from '../geometry/character.js';

import type { BodyMaterial, CharacterParams, CharacterPiece } from '../geometry/character.js';

export interface CharacterPlacement extends CharacterParams {
  position: THREE.Vector3;
  rotation?: THREE.Euler;
  /**
   * Multiplier on the idle amplitude. 1 is somebody standing in a room; above 1 is
   * somebody standing somewhere that is moving them, which on this cast means Tomas.
   */
  liveliness?: number;
}

export interface PlacedCharacter {
  root: ENGINE.SceneNode;
  /** Per-frame idle, shaped for `ContactScene.registerProp({ idle })`. */
  idle: (deltaTime: number) => void;
}

/**
 * ## §236 - the idle, and the contrast budget for motion
 *
 * The rule reads like a lighting rule because it is one: state the budget, spend it on
 * the thing the eye actually reads, and stop. The budget here is ABOUT ONE CENTIMETRE of
 * head travel. That is not a stylistic preference - it is what a person standing still
 * actually does, and the failure mode of idle animation is always the same, which is that
 * somebody could not see their own motion on a still frame and turned it up until they
 * could.
 *
 * Every number below is in metres and every rotation is chosen so that its effect at the
 * head, roughly 0.9 m above the pivot, lands inside that budget:
 *
 *   pitch  0.0075 rad  ->  6.7 mm fore/aft   the breath itself
 *   roll   0.0055 rad  ->  4.9 mm lateral    weight moving between the feet
 *   yaw    0.0060 rad  ->  ~2 mm at the ear  the head not being held in a vice
 *   rise   0.45 %      ->  4.1 mm vertical   the chest filling
 *
 * They never peak together, so the composite stays under a centimetre.
 *
 * ## Not reading as a loop
 *
 * §236 is explicit that a visible loop is worse than stillness, and a single sine at a
 * fixed rate is a visible loop within about twenty seconds. Two things prevent it:
 *
 * 1. The three axes run at periods with no small common multiple (4.3 s, 11.3 s, 17.9 s),
 *    so the composite pose does not recur on any timescale a player is in the scene for.
 * 2. The breath RATE itself drifts, integrated rather than multiplied into the phase, so
 *    even the breath is not metronomic. Integrating is the part that matters: writing
 *    `sin(rate(t) * t)` makes the wave speed up and slow down about t = 0 and pulls its
 *    phase around, which is a different and much more obvious artefact.
 *
 * And it is deterministic (§123): the per-character phase comes from the seed, and after
 * that it is a pure function of accumulated delta time with no RNG at runtime.
 */
const BREATH = {
  /** Seconds per breath at rest. Twelve to sixteen a minute is a person not doing much. */
  period: 4.3,
  pitch: 0.0075,
  roll: 0.0055,
  yaw: 0.006,
  rise: 0.0045,
  rollPeriod: 11.3,
  yawPeriod: 17.9,
  /** Seconds over which the breathing rate wanders, and by how much. */
  driftPeriod: 13.7,
  drift: 0.14,
} as const;

/**
 * A breath, which is not a sine.
 *
 * Inhaling takes about two fifths of the cycle and exhaling the rest, and there is a
 * pause at the bottom before the next one starts. That asymmetry is most of what makes
 * seven millimetres read as breathing rather than as a bob - the eye reads the HOLD, not
 * the travel.
 */
function breathCurve(phase: number): number {
  const t = phase - Math.floor(phase);
  const IN = 0.38;
  if (t < IN) {
    // Rising, quick, easing out at the top of the inhale.
    return Math.sin((t / IN) * Math.PI * 0.5);
  }
  // Falling, slower, and flattening into the pause before it turns round.
  const f = (t - IN) / (1 - IN);
  return Math.cos(f * Math.PI * 0.5) * (1 - f * 0.06);
}

/**
 * Drive an upper body from its hip.
 *
 * The returned closure owns its own clock rather than reading a global one, so two
 * figures built from different seeds are genuinely out of step and stay that way.
 */
function breathe(torso: ENGINE.SceneNode, seed: string, liveliness: number): (dt: number) => void {
  // Deterministic per-character phase, so nobody in the cast breathes in unison and the
  // same contact breathes the same way in every session.
  const rng = createRng(seedFrom(`${seed}-idle`));
  let breath = rng();
  let slow = rng() * BREATH.rollPeriod;
  const rate = 0.94 + rng() * 0.12;

  return (deltaTime: number) => {
    slow += deltaTime;
    // Integrated phase: the rate wanders, the wave never jumps.
    const wander = 1 + Math.sin((slow / BREATH.driftPeriod) * Math.PI * 2) * BREATH.drift;
    breath += (deltaTime / BREATH.period) * rate * wander;

    const lung = breathCurve(breath) * 2 - 1;
    const shift = Math.sin((slow / BREATH.rollPeriod) * Math.PI * 2);
    const turn = Math.sin((slow / BREATH.yawPeriod) * Math.PI * 2);

    torso.rotation.set(
      // Leaning back a fraction as the chest fills is what a breath does to a standing
      // body, so pitch runs against the rise rather than with it.
      -lung * BREATH.pitch * liveliness,
      turn * BREATH.yaw * liveliness,
      shift * BREATH.roll * liveliness
    );
    // Vertical only. A uniform scale would make the shoulders wider as well as higher,
    // and a body that changes width is a balloon.
    torso.scale.set(1, 1 + (lung * 0.5 + 0.5) * BREATH.rise * liveliness, 1);
  };
}

function surfaceFor(
  material: BodyMaterial,
  colors: { skin: string; garment: string; underlayer: string; hair: string }
): THREE.MeshStandardMaterial {
  const [color, roughness] = {
    skin: [colors.skin, 0.82],
    garment: [colors.garment, 0.92],
    underlayer: [colors.underlayer, 0.9],
    hair: [colors.hair, 0.95],
    boots: [PERSON.boot, 0.75],
  }[material] as [string, number];

  // Banded like the family. The characters are chamfered slabs, and the bevel facets
  // snapping between light steps is precisely what makes blocky figures read as painted.
  return applyPaintBanding(new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 }));
}

function addPieces(
  into: ENGINE.SceneNode,
  pieces: CharacterPiece[],
  colors: { skin: string; garment: string; underlayer: string; hair: string }
): void {
  for (const piece of pieces) {
    // Capitalised for the outliner, which is the only place these names are read.
    const name = piece.material[0].toUpperCase() + piece.material.slice(1);
    into.add(decorMesh(name, piece.geometry, surfaceFor(piece.material, colors)));
  }
}

/**
 * Assemble a generated person into nodes.
 *
 * Colours come from the generator rather than the shared MAT family: people are the one
 * thing in the world that should vary between instances (§185), while the built
 * environment stays on one palette.
 *
 * The hierarchy is `root -> Torso -> upper meshes`, with the legs and boots directly on
 * the root. That is the whole reason the generator splits at the hip: the torso node is a
 * pivot at the base of the spine, and everything §236 does happens on it.
 */
export function placeCharacter(name: string, placement: CharacterPlacement): PlacedCharacter {
  const parts = createCharacter(placement);

  const root = ENGINE.SceneNode.create({
    name: 'Contact',
    position: placement.position.clone(),
    rotation: placement.rotation?.clone(),
  });
  root.setName(name);

  addPieces(root, parts.lower, parts.colors);

  const torso = ENGINE.SceneNode.create({
    name: 'Torso',
    position: new THREE.Vector3(0, parts.hipHeight, 0),
  });
  addPieces(torso, parts.upper, parts.colors);
  root.add(torso);

  return {
    root,
    idle: breathe(torso, String(placement.seed), placement.liveliness ?? 1),
  };
}
