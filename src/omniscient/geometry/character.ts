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
  /** 0 arms hanging, 1 forearms up and forward as if resting on a surface. */
  reach?: number;
  /**
   * Where each hand should land, in character-local space - origin at the feet, +Z front.
   *
   * Overrides `reach` for whichever side is given, and the joint angles are solved rather
   * than authored (see solveArm). A side left undefined keeps the resting pose, which is
   * usually what you want: somebody working at a bench has one hand on the job and the
   * other hanging.
   */
  reachFor?: { left?: THREE.Vector3; right?: THREE.Vector3 };
  garment?: Garment;
  /**
   * Pin any of the generated colours. Omitted channels stay seeded, so this is a nudge
   * for named characters rather than a second way to author a whole person.
   */
  colors?: Partial<{ skin: string; garment: string; underlayer: string; hair: string }>;
}

/** Which of the five surfaces a piece of a body belongs to. */
export type BodyMaterial = 'skin' | 'garment' | 'underlayer' | 'hair' | 'boots' | 'eyes';

/** One merged run of geometry, and the material it wants. Mirrors `RoomPart`. */
export interface CharacterPiece {
  material: BodyMaterial;
  geometry: THREE.BufferGeometry;
}

/**
 * A body, split at the hip.
 *
 * §236 wants these figures breathing, and a breath is the upper body moving over legs
 * that do not. One merged mesh per material cannot do that - rotating it takes the boots
 * with it and the figure skates. So the generator hands back two groups instead of one,
 * divided at the hip joint, and the caller hangs the upper one off a pivot node.
 *
 * The split costs nothing at rest: it is the same geometry in the same places, in four or
 * five draw calls instead of five, and a figure whose caller ignores `hipHeight` and adds
 * both groups to the same node is byte-for-byte what this generator used to produce.
 */
export interface CharacterParts {
  /**
   * Everything above the hip. Pre-translated DOWN by `hipHeight`, so the group's own
   * origin is the hip joint and the caller only has to place a node there.
   */
  upper: CharacterPiece[];
  /** Legs and boots, in character-local space. Planted. */
  lower: CharacterPiece[];
  /** Height of the hip joint above the character's feet, in metres. */
  hipHeight: number;
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

/**
 * A limb that hangs from a joint.
 *
 * §235, and the whole reason the arms were wrong. `limb()` rotates a slab about its own
 * centre, so an arm swung forward by 20 degrees also swung its shoulder end backward by
 * 20 degrees - out of the torso and into the air behind it. Every pose that tried to look
 * like working produced a dislocated shoulder, and the more expressive the pose the worse
 * it got, which is why Ileana leaning over her table was the worst figure in the game.
 *
 * Here the slab's top face sits at the origin before rotation, so the joint stays put and
 * only the far end moves. That is how a shoulder works.
 */
function hangingLimb(
  w: number,
  h: number,
  d: number,
  joint: THREE.Vector3,
  rotZ = 0,
  rotX = 0
): THREE.BufferGeometry {
  const geometry = slab(w, h, d, Math.min(w, d) * 0.3);
  geometry.translate(0, -h / 2, 0);
  if (rotX) geometry.rotateX(rotX);
  if (rotZ) geometry.rotateZ(rotZ);
  geometry.translate(joint.x, joint.y, joint.z);
  return geometry;
}

/**
 * Where the far end of a hanging limb ends up.
 *
 * Same rotation order as hangingLimb applies to the geometry, so the next joint down
 * lands exactly on the end of the one above it and the arm stays in one piece however it
 * is posed.
 */
function limbEnd(length: number, rotZ: number, rotX: number): THREE.Vector3 {
  return new THREE.Vector3(0, -length, 0)
    .applyAxisAngle(new THREE.Vector3(1, 0, 0), rotX)
    .applyAxisAngle(new THREE.Vector3(0, 0, 1), rotZ);
}

/**
 * The rotations that point a hanging limb along `dir`.
 *
 * Inverts `hangingLimb`'s own convention exactly. That function rotates a limb hanging
 * down -Y by rotX and then rotZ, which sends it to
 *
 *   ( cos(x)·sin(z),  -cos(x)·cos(z),  -sin(x) )
 *
 * so a direction can be turned back into the pair of angles that produce it. Without this
 * the IK below could compute a beautiful skeleton and have no way to build it.
 */
function aimAngles(dir: THREE.Vector3): { rotX: number; rotZ: number } {
  const d = dir.clone().normalize();
  const rotX = Math.asin(Math.max(-1, Math.min(1, -d.z)));
  const rotZ = Math.atan2(d.x, -d.y);
  return { rotX, rotZ };
}

/**
 * Two-bone inverse kinematics: put the hand HERE.
 *
 * §235 asked for per-contact working poses and the previous attempt was reverted, for a
 * reason worth keeping: poses were being authored as joint ANGLES, and an angle that looks
 * right in the editor foreshortens to nothing on a camera the contact happens to be facing.
 * Adaeze's crouch read as a short woman rather than a crouching one. Tuning angles cannot
 * fix that, because the thing being specified is not the thing that matters.
 *
 * What matters is where the hand ENDS UP - on the bench, on the rail, on the table. So
 * that is what gets authored, and the angles are solved. A hand told to land on the bench
 * lands on the bench from every camera in the room.
 *
 * Standard law-of-cosines solve. The elbow sits on a circle around the shoulder-to-target
 * line; `pole` picks the point on that circle, which is what stops the elbow choosing a
 * direction that happens to point at the lens and collapse the arm into a line.
 */
function solveArm(
  shoulder: THREE.Vector3,
  target: THREE.Vector3,
  upperLength: number,
  foreLength: number,
  pole: THREE.Vector3
): { upper: { rotX: number; rotZ: number }; fore: { rotX: number; rotZ: number } } {
  const toTarget = target.clone().sub(shoulder);
  const reachable = upperLength + foreLength - 0.001;
  // Clamped rather than failed: a target out of reach becomes a fully extended arm
  // pointing at it, which is what a person does, instead of a NaN and an invisible limb.
  const distance = Math.min(Math.max(toTarget.length(), 0.001), reachable);
  const axis = toTarget.clone().normalize();

  // Distance along the axis to the elbow's projection, and its offset from the line.
  const along = (distance * distance + upperLength * upperLength - foreLength * foreLength) /
    (2 * distance);
  const offset = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));

  // The pole, made perpendicular to the axis. If the caller hands over something parallel
  // to it, fall back to straight down, which is where a relaxed elbow goes anyway.
  let bend = pole.clone().projectOnPlane(axis);
  if (bend.lengthSq() < 1e-6) bend = new THREE.Vector3(0, -1, 0).projectOnPlane(axis);
  bend.normalize();

  const elbow = shoulder
    .clone()
    .addScaledVector(axis, along)
    .addScaledVector(bend, offset);

  return {
    upper: aimAngles(elbow.clone().sub(shoulder)),
    fore: aimAngles(target.clone().sub(elbow)),
  };
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

  // Above the hip.
  const skin: THREE.BufferGeometry[] = [];
  const eyes: THREE.BufferGeometry[] = [];
  const cloth: THREE.BufferGeometry[] = [];
  const under: THREE.BufferGeometry[] = [];
  // Below it, and staying where it is put.
  const legs: THREE.BufferGeometry[] = [];
  const boots: THREE.BufferGeometry[] = [];

  // -- Head. Asymmetry in the jaw is what stops faces reading as identical. ----------
  const headW = headHeight * range(rng, 0.72, 0.9);
  const head = slab(headW, headHeight, headHeight * 0.82, headHeight * 0.18);
  head.rotateX(lean * 0.4);
  head.translate(jitter(rng, 0.006), headY, torsoDepth * 0.06);
  skin.push(head);

  /**
   * Two dark rectangles, and nothing else.
   *
   * §235 said no faces, and the new reference sheet reverses that: those figures read as
   * PEOPLE at a glance, and the reason is two dark blocks anchoring the head. They are no
   * less stylised for it. A head with eyes has a front, a direction of attention and
   * somewhere for the viewer to look - the hair cap and the coat placket were both fixes
   * for the absence of exactly that.
   *
   * Deliberately the whole face: no brow, no mouth, no nose. The moment a third feature
   * arrives the head stops being a block with eyes and starts being a bad sculpt, and the
   * blocky style is the thing being protected here, not abandoned.
   *
   * Set proud of the face plane rather than inset, because a recess needs a shadow to
   * read and this project has none - contact occlusion is screen-space and far too subtle
   * at this scale.
   */
  const faceZ = torsoDepth * 0.06 + headHeight * 0.41;
  const eyeW = headW * 0.17;
  for (const side of [-1, 1] as const) {
    const eye = slab(eyeW, headHeight * 0.13, headHeight * 0.05, eyeW * 0.2);
    eye.rotateX(lean * 0.4);
    eye.translate(side * headW * 0.23, headY + headHeight * 0.05, faceZ);
    eyes.push(eye);
  }

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

  /**
   * How far the forearms come up and forward, 0 hanging to 1 resting on a surface.
   *
   * Arms hanging straight down is the pose of somebody waiting to be photographed, and it
   * was the single thing making these figures read as shop mannequins rather than people
   * mid-job. Bending at the elbow and putting the hands out in front costs one rotation
   * and is the difference between standing near a bench and working at one.
   */
  const reach = params.reach ?? 0;

  /**
   * The neutral, which is not "arms straight down".
   *
   * §235 asks for a rest pose that reads as a body at rest, and a body at rest never has
   * straight arms - there is always a few degrees of elbow, the upper arms sit slightly
   * away from the ribs, and the hands hang a little in front of the hips rather than
   * beside them. These three constants are that, and `reach` is added on top for somebody
   * working at a surface.
   */
  const ARM_OUT = 0.1;
  const ARM_FORWARD = 0.1;
  const ELBOW_REST = 0.16;

  const elbowBend = ELBOW_REST + reach * 1.15;

  for (const side of [-1, 1] as const) {
    // Asymmetry, but small. It is the difference between two people and the difference
    // between a person and a shop mannequin; it is not a pose in itself.
    const swing = ARM_FORWARD + jitter(rng, 0.09);
    const outward = side * (ARM_OUT + Math.abs(jitter(rng, 0.03)));

    // The shoulder sits inside the chest slab, so the arm reads as joined to the body
    // rather than parked alongside it.
    const shoulder = new THREE.Vector3(
      side * (shoulderWidth / 2 - limbThick * 0.1),
      shoulderY - torsoHeight * 0.04,
      0
    );

    const target = side === -1 ? params.reachFor?.left : params.reachFor?.right;

    /**
     * The elbow goes out and back.
     *
     * Out, so the upper arm is not edge-on to a camera in front of the contact; back, so
     * the forearm comes forward toward the work rather than the elbow leading. This is
     * the single value that decides whether a reaching arm reads as an arm or as a stick
     * pointing at the lens.
     */
    const pole = new THREE.Vector3(side * 0.8, -0.5, -0.35);

    const solved = target
      ? solveArm(shoulder, target, upperArm, foreArm, pole)
      : {
          upper: { rotX: swing, rotZ: outward },
          fore: { rotX: swing + elbowBend, rotZ: outward * 0.45 },
        };

    skin.push(
      hangingLimb(limbThick, upperArm, limbThick, shoulder, solved.upper.rotZ, solved.upper.rotX)
    );

    const elbow = shoulder
      .clone()
      .add(limbEnd(upperArm, solved.upper.rotZ, solved.upper.rotX));
    const foreRot = solved.fore.rotX;
    const foreOut = solved.fore.rotZ;

    skin.push(hangingLimb(limbThick * 0.9, foreArm, limbThick * 0.9, elbow, foreOut, foreRot));

    const wrist = elbow.clone().add(limbEnd(foreArm, foreOut, foreRot));

    // Oversized hands - §185's "a mechanic may have visually dominant hands".
    skin.push(
      hangingLimb(limbThick * 1.25, limbThick * 1.5, limbThick * 0.8, wrist, foreOut, foreRot)
    );
  }

  // -- Legs and boots ---------------------------------------------------------------
  for (const side of [-1, 1] as const) {
    const outward = side * hipWidth * 0.26;
    const stance = side * range(rng, 0.0, 0.05);

    // Legs hang from the hip for the same reason arms hang from the shoulder. It matters
    // less here because a standing leg is nearly vertical, but a stance angle applied
    // about the middle of a thigh lifts the hip out of the pelvis just as visibly.
    const hip = new THREE.Vector3(outward, hipY + torsoHeight * 0.02, 0);
    legs.push(hangingLimb(limbThick * 1.15, legLength * 0.56, limbThick * 1.15, hip, stance));

    const knee = hip.clone().add(limbEnd(legLength * 0.56, stance, 0));
    legs.push(hangingLimb(limbThick * 1.05, legLength * 0.5, limbThick * 1.05, knee, stance * 0.4));

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

      /**
       * The opening down the front.
       *
       * An apron and a bib are front-only and give those garments a direction for free.
       * A coat is two symmetrical slabs, so Ileana - the only coat in the cast - had no
       * front at all below the neck. One strip of the underlayer colour down the centre
       * is a placket, and it is the difference between a person facing you and a person
       * who might be facing either way.
       */
      const placket = slab(shoulderWidth * 0.13, torsoHeight * 1.05, torsoDepth * 0.16, 0.012);
      placket.rotateX(lean * 0.8);
      placket.translate(0, hipY + torsoHeight * 0.4, torsoDepth * 0.58);
      under.push(placket);

      const collar = slab(shoulderWidth * 0.42, torsoHeight * 0.12, torsoDepth * 0.3, 0.015);
      collar.rotateX(lean);
      collar.translate(0, shoulderY - torsoHeight * 0.02, torsoDepth * 0.42);
      under.push(collar);
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

  /**
   * Hair: a mass, not strands - and the thing that tells you which way somebody is facing.
   *
   * §235 forbids faces, which leaves a head that is a symmetrical block. The cap here was
   * DEEPER than the head it sat on and centred on it, so it wrapped the face as
   * completely as the crown and every figure read as seen from behind whichever way they
   * were actually turned. Three of the four contacts are angled toward their camera and
   * all three looked like backs.
   *
   * Pushed back and made shallower, it leaves the front plane of the head as bare skin.
   * That reads as a face at any distance without being one, which is exactly the trade
   * the blocky style is asking for.
   */
  const hairPieces: THREE.BufferGeometry[] = [];
  const cap = slab(headW * 1.02, headHeight * 0.5, headHeight * 0.56, headHeight * 0.16);
  cap.rotateX(lean * 0.4);
  cap.translate(0, headY + headHeight * 0.31, -headHeight * 0.25);
  hairPieces.push(cap);

  // Sideburns down past the ear line, so the bare front reads as a face rather than as a
  // hat sitting too far back.
  for (const side of [-1, 1] as const) {
    const temple = slab(headW * 0.13, headHeight * 0.38, headHeight * 0.42, headHeight * 0.09);
    temple.translate(side * headW * 0.45, headY + headHeight * 0.05, -headHeight * 0.16);
    hairPieces.push(temple);
  }

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

  /**
   * The hip joint, and why it is here rather than at `hipY`.
   *
   * A body does not fold at the top of the pelvis - it pivots somewhere around the base
   * of the lumbar spine, a little above the hip bone. Pivoting at `hipY` swings the whole
   * waist slab and the coat skirt with it, which reads as a wobbling doll. A few
   * centimetres higher and the motion is where a torso's motion actually comes from.
   */
  const pivotY = hipY + torsoHeight * 0.14;

  const collect = (
    material: BodyMaterial,
    pieces: THREE.BufferGeometry[],
    lift: number
  ): CharacterPiece[] => {
    if (pieces.length === 0) return [];
    const geometry = merge(pieces);
    if (lift !== 0) geometry.translate(0, lift, 0);
    return [{ material, geometry }];
  };

  return {
    upper: [
      ...collect('skin', skin, -pivotY),
      ...collect('garment', cloth, -pivotY),
      ...collect('underlayer', under, -pivotY),
      ...collect('hair', hairPieces, -pivotY),
      ...collect('eyes', eyes, -pivotY),
    ],
    lower: [...collect('garment', legs, 0), ...collect('boots', boots, 0)],
    hipHeight: pivotY,
    colors,
  };
}
