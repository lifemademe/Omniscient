/**
 * Procedural people.
 *
 * §185 reads like a specification for a generator: "Vary head shape, shoulder width,
 * torso mass, limb proportions, posture, hand/foot scale and asymmetry within
 * animation-safe limits... Avoid a generator where every NPC is the same mannequin with
 * new clothes."
 *
 * Built from chamfered slabs rather than smooth organic forms. A procedural human that
 * reaches for realism lands in uncanny territory immediately; one built from big
 * exaggerated masses reads as a stylised character on purpose. Silhouette first,
 * detail almost never - §187.
 *
 * Poses are static. §209: the body does not perform, the environment does. A figure that
 * stands convincingly and never moves is worth far more here than a rig with no clips.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { PERSON } from '../art/palette.js';
import { createRng, jitter, pick, range, seedFrom } from '../core/rng.js';

import type { Rng } from '../core/rng.js';

export type Garment = 'apron' | 'coat' | 'overalls';

export interface CharacterParams {
  seed: number | string;
  /** Overall height in metres. */
  height?: number;
  /** 0 slight, 1 heavy. Drives torso mass and limb thickness. */
  build?: number;
  /** 0 narrow, 1 broad. The single strongest silhouette cue. */
  shoulders?: number;
  /** Head size multiplier. Slightly large reads stylised; very large reads cartoon. */
  headScale?: number;
  /** Forward lean in radians. Somebody who works at a bench does not stand straight. */
  lean?: number;
  garment?: Garment;
  /**
   * Pin any of the generated colours. Omitted channels stay seeded, so this is a nudge
   * for named characters rather than a second way to author a whole person.
   */
  colors?: Partial<{ skin: string; garment: string; underlayer: string; hair: string }>;
}

/** Geometry grouped by material role. */
export interface CharacterParts {
  skin: THREE.BufferGeometry;
  garment: THREE.BufferGeometry;
  underlayer: THREE.BufferGeometry;
  hair: THREE.BufferGeometry;
  boots: THREE.BufferGeometry;
  colors: {
    skin: string;
    garment: string;
    underlayer: string;
    hair: string;
  };
}

/**
 * A chamfered slab. Every mass in the body is one of these - it gives a faceted edge
 * that catches the key light, which is what stops the figure reading as a box.
 */
function slab(w: number, h: number, d: number, chamfer = 0.02): THREE.BufferGeometry {
  const c = Math.min(chamfer, w * 0.35, h * 0.35, d * 0.35);
  const shape = new THREE.Shape();
  const hw = w / 2;
  const hh = h / 2;
  shape.moveTo(-hw + c, -hh);
  shape.lineTo(hw - c, -hh);
  shape.lineTo(hw, -hh + c);
  shape.lineTo(hw, hh - c);
  shape.lineTo(hw - c, hh);
  shape.lineTo(-hw + c, hh);
  shape.lineTo(-hw, hh - c);
  shape.lineTo(-hw, -hh + c);
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: d - c,
    bevelEnabled: true,
    bevelThickness: c * 0.5,
    bevelSize: c * 0.5,
    bevelSegments: 1,
    curveSegments: 1,
  });
  geometry.translate(0, 0, -(d - c) / 2);
  return geometry;
}

/** Place a slab, optionally rotated about Z then Y, at a point. */
function limb(
  w: number,
  h: number,
  d: number,
  at: [number, number, number],
  rotZ = 0,
  rotX = 0
): THREE.BufferGeometry {
  const geometry = slab(w, h, d, Math.min(w, d) * 0.3);
  if (rotZ) geometry.rotateZ(rotZ);
  if (rotX) geometry.rotateX(rotX);
  geometry.translate(at[0], at[1], at[2]);
  return geometry;
}

function merge(pieces: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeGeometries(pieces, false) ?? pieces[0];
}

/**
 * Build a person.
 *
 * The proportions deliberately exaggerate: hands and feet oversized, head a little large,
 * shoulders doing most of the characterisation. §185 wants personality communicated
 * through mass and posture rather than through a profession-to-body stereotype.
 */
export function createCharacter(params: CharacterParams): CharacterParts {
  const seed = typeof params.seed === 'string' ? seedFrom(params.seed) : params.seed;
  const rng: Rng = createRng(seed);

  const height = params.height ?? range(rng, 1.62, 1.78);
  const build = params.build ?? range(rng, 0.25, 0.75);
  const shoulders = params.shoulders ?? range(rng, 0.3, 0.8);
  const headScale = params.headScale ?? range(rng, 0.95, 1.12);
  const lean = params.lean ?? range(rng, 0.04, 0.14);
  const garment = params.garment ?? pick(rng, ['apron', 'coat', 'overalls'] as const);

  /**
   * Seeded, but overridable per character.
   *
   * Crowd and background people should vary freely - that is what the generator is for.
   * The named recurring contacts should not: §185 wants them identifiable, and the seeded
   * pick handed Mirela a warm brown that matched her own workshop exactly, so she read as
   * a wooden mannequin standing in a wooden room. Art-directing the two people the player
   * actually talks to is worth one optional field.
   */
  const colors = {
    skin: params.colors?.skin ?? pick(rng, PERSON.skin),
    garment: params.colors?.garment ?? pick(rng, PERSON.garment),
    underlayer: params.colors?.underlayer ?? pick(rng, PERSON.underlayer),
    hair: params.colors?.hair ?? pick(rng, PERSON.hair),
  };

  // Proportion scaffold.
  const legLength = height * 0.46;
  const torsoHeight = height * 0.30;
  const headHeight = height * 0.13 * headScale;
  const shoulderWidth = height * (0.20 + shoulders * 0.11);
  const hipWidth = shoulderWidth * (0.68 + build * 0.2);
  const torsoDepth = height * (0.085 + build * 0.05);
  const limbThick = height * (0.048 + build * 0.022);

  const hipY = legLength;
  const shoulderY = hipY + torsoHeight;
  const headY = shoulderY + headHeight * 0.62;

  const skin: THREE.BufferGeometry[] = [];
  const cloth: THREE.BufferGeometry[] = [];
  const under: THREE.BufferGeometry[] = [];
  const boots: THREE.BufferGeometry[] = [];

  // -- Head. Asymmetry in the jaw is what stops faces reading as identical. ----------
  const headW = headHeight * range(rng, 0.72, 0.9);
  const head = slab(headW, headHeight, headHeight * 0.82, headHeight * 0.18);
  head.rotateX(lean * 0.4);
  head.translate(jitter(rng, 0.006), headY, torsoDepth * 0.06);
  skin.push(head);

  const neck = limb(limbThick * 0.9, headHeight * 0.3, limbThick * 0.9, [0, shoulderY + headHeight * 0.06, 0]);
  skin.push(neck);

  // -- Torso: shoulders wide, waist narrower. The primary silhouette. ---------------
  const chest = slab(shoulderWidth, torsoHeight * 0.58, torsoDepth, torsoDepth * 0.3);
  chest.rotateX(lean);
  chest.translate(0, shoulderY - torsoHeight * 0.28, 0);
  cloth.push(chest);

  const waist = slab(hipWidth, torsoHeight * 0.46, torsoDepth * 0.92, torsoDepth * 0.25);
  waist.rotateX(lean * 0.6);
  waist.translate(0, hipY + torsoHeight * 0.22, 0);
  cloth.push(waist);

  // -- Arms. Asymmetric pose: one arm slightly forward, as if mid-task. -------------
  const upperArm = torsoHeight * 0.62;
  const foreArm = torsoHeight * 0.56;

  for (const side of [-1, 1] as const) {
    const outward = side * (shoulderWidth / 2 + limbThick * 0.4);
    const swing = side === 1 ? range(rng, 0.1, 0.35) : range(rng, -0.2, 0.05);

    skin.push(
      limb(limbThick, upperArm, limbThick, [outward, shoulderY - upperArm * 0.5, 0], side * 0.12, swing)
    );
    skin.push(
      limb(
        limbThick * 0.9,
        foreArm,
        limbThick * 0.9,
        [outward + side * 0.02, shoulderY - upperArm - foreArm * 0.45, swing * 0.28],
        side * 0.06,
        swing * 1.4
      )
    );
    // Oversized hands - §185's "a mechanic may have visually dominant hands".
    skin.push(
      limb(
        limbThick * 1.25,
        limbThick * 1.5,
        limbThick * 0.8,
        [outward + side * 0.03, shoulderY - upperArm - foreArm - limbThick * 0.5, swing * 0.5]
      )
    );
  }

  // -- Legs and boots ---------------------------------------------------------------
  for (const side of [-1, 1] as const) {
    const outward = side * hipWidth * 0.26;
    const stance = side * range(rng, 0.0, 0.05);

    cloth.push(limb(limbThick * 1.15, legLength * 0.55, limbThick * 1.15, [outward, legLength * 0.72, 0], stance));
    cloth.push(limb(limbThick * 1.05, legLength * 0.5, limbThick * 1.05, [outward, legLength * 0.27, 0], stance * 0.5));

    const boot = slab(limbThick * 1.3, limbThick * 1.1, limbThick * 2.1, limbThick * 0.25);
    boot.translate(outward, limbThick * 0.5, limbThick * 0.42);
    boots.push(boot);
  }

  // -- Garment: the mass that says what this person does ----------------------------
  switch (garment) {
    case 'apron': {
      const apron = slab(shoulderWidth * 0.82, torsoHeight * 1.15, torsoDepth * 0.22, 0.02);
      apron.rotateX(lean * 0.8);
      apron.translate(0, hipY + torsoHeight * 0.42, torsoDepth * 0.52);
      under.push(apron);
      break;
    }
    case 'coat': {
      // A coat reads as wider shoulders and a skirt below the hip.
      const shell = slab(shoulderWidth * 1.1, torsoHeight * 0.7, torsoDepth * 1.18, torsoDepth * 0.3);
      shell.rotateX(lean);
      shell.translate(0, shoulderY - torsoHeight * 0.32, 0);
      cloth.push(shell);

      const skirt = slab(hipWidth * 1.15, torsoHeight * 0.55, torsoDepth * 1.05, torsoDepth * 0.2);
      skirt.translate(0, hipY - torsoHeight * 0.08, 0);
      cloth.push(skirt);
      break;
    }
    case 'overalls': {
      const bib = slab(shoulderWidth * 0.6, torsoHeight * 0.5, torsoDepth * 0.2, 0.02);
      bib.rotateX(lean);
      bib.translate(0, shoulderY - torsoHeight * 0.3, torsoDepth * 0.5);
      under.push(bib);

      for (const side of [-1, 1]) {
        const strap = slab(limbThick * 0.4, torsoHeight * 0.45, torsoDepth * 0.15, 0.01);
        strap.rotateX(lean);
        strap.translate(side * shoulderWidth * 0.2, shoulderY - torsoHeight * 0.1, torsoDepth * 0.42);
        under.push(strap);
      }
      break;
    }
  }

  // -- Hair: a mass, not strands ----------------------------------------------------
  const hairPieces: THREE.BufferGeometry[] = [];
  const cap = slab(headW * 1.06, headHeight * 0.52, headHeight * 0.88, headHeight * 0.2);
  cap.rotateX(lean * 0.4);
  cap.translate(0, headY + headHeight * 0.3, torsoDepth * 0.04);
  hairPieces.push(cap);

  // A tied-back mass or a fringe, chosen by seed - cheap variation with a big read.
  if (rng() < 0.5) {
    const bun = slab(headHeight * 0.34, headHeight * 0.34, headHeight * 0.34, headHeight * 0.12);
    bun.translate(jitter(rng, 0.02), headY + headHeight * 0.32, -headHeight * 0.5);
    hairPieces.push(bun);
  } else {
    const back = slab(headW * 0.9, headHeight * 0.62, headHeight * 0.3, headHeight * 0.12);
    back.translate(0, headY - headHeight * 0.06, -headHeight * 0.42);
    hairPieces.push(back);
  }

  return {
    skin: merge(skin),
    garment: merge(cloth),
    underlayer: under.length ? merge(under) : slab(0.01, 0.01, 0.01),
    hair: merge(hairPieces),
    boots: merge(boots),
    colors,
  };
}
