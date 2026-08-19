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

/**
 * What is on the head, and why it is a first-class parameter.
 *
 * On the reference sheet the single strongest identifier is headgear - a wide brim, a
 * flat cap, a hood, a welding band. It reads before the clothes do, before the colour
 * does, and at a distance where nothing else survives. A cast of bare heads is a cast
 * that can only be told apart by height, which is what this one was.
 */
export type Headgear = 'none' | 'cap' | 'brim' | 'hood' | 'band';

/**
 * Where the sleeve ends.
 *
 * `rolled` leaves the forearm bare, which is what somebody working with their hands
 * actually does and is half the reason the reference figures read as workers.
 */
export type Sleeve = 'long' | 'rolled';

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
  headgear?: Headgear;
  sleeve?: Sleeve;
  /** A beard is a silhouette element on a blocky head, not a detail. */
  beard?: boolean;
  /** A satchel or tool pouch at the hip. Breaks the leg line and says "at work". */
  pouch?: boolean;
  /**
   * Pin any of the generated colours. Omitted channels stay seeded, so this is a nudge
   * for named characters rather than a second way to author a whole person.
   */
  colors?: Partial<{ skin: string; garment: string; underlayer: string; hair: string; hardware: string }>;
}

/** Which of the five surfaces a piece of a body belongs to. */
export type BodyMaterial =
  | 'skin'
  | 'garment'
  | 'underlayer'
  | 'hair'
  | 'boots'
  | 'eyes'
  /** Buckles, buttons, goggle rims. The one bright hard accent a figure gets. */
  | 'metal';

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
  /**
   * Sides whose authored hand target was out of reach, so the arm is extended AT it rather
   * than resting ON it. Empty is the normal case; anything here is a scene authoring bug.
   */
  overreached: string[];
  colors: {
    skin: string;
    garment: string;
    underlayer: string;
    hair: string;
    hardware: string;
  };
}

/**
 * A chamfered slab. Every mass in the body is one of these - it gives a faceted edge
 * that catches the key light, which is what stops the figure reading as a box.
 */
/**
 * How much of a requested chamfer actually gets cut.
 *
 * One number, and it is the difference between this cast and the reference sheet.
 *
 * Every call below asks for a chamfer as a FRACTION of the piece - `headHeight * 0.18` on
 * a head, `torsoDepth * 0.3` on a chest. Those were chosen to give each slab a rim for the
 * key light to catch, and they do, but at that size the cut is no longer an edge treatment:
 * it is a rounding. A head with an eighteen percent chamfer is a pebble. Put these figures
 * next to a row of Synty characters and the difference that reads first is not detail or
 * proportion, it is that theirs have CORNERS and mine were soft everywhere.
 *
 * The rim was worth having and is still here, at about a quarter strength - enough that a
 * bevel facet catches a different light band from the face beside it, which with
 * `applyPaintBanding` is what makes a blocky figure look painted. Below roughly 0.2 the
 * bevel stops registering at all and the figures go flat and cheap. This is the number to
 * move if the cast ever needs to be softer or harder as a whole; do not go back to editing
 * forty call sites.
 */
const CHAMFER_SCALE = 0.26;

/**
 * Every mass in the body, as a rounded volume rather than a chamfered box.
 *
 * This function used to extrude a rectangle with the corners cut off, and it is the single
 * reason the whole cast read as blocks: a chamfer is a box that has had its edges taken off,
 * and no amount of taking edges off a box produces a body. Put one of these next to
 * Mirela.glb - a Tripo mesh, twenty thousand smooth verts - and the difference that reads
 * first is not detail or proportion, it is that hers is made of CURVES and mine was made of
 * flats with the corners filed.
 *
 * So it is a rounded box now, built the standard way: take a subdivided box, clamp every
 * vertex into an inner box inset by the radius, then push it back out along the direction it
 * was clamped from. At radius approaching half the smallest dimension it becomes a capsule;
 * at a third it is a soft slab that still has a direction. Normals are recomputed and
 * smooth, so the key light rolls across a shoulder instead of stopping dead at a facet.
 *
 * The signature is unchanged on purpose. Forty call sites author this cast in widths,
 * heights and depths, and every one of them still means what it meant - the `chamfer`
 * argument is now read as a ROUNDNESS hint rather than an edge treatment, so a call that
 * asked for a hard little bevel gets a firm form and one that asked for a big soft cut gets
 * a soft one. Nothing needed rewriting to change the entire art style, which is the whole
 * argument for having had one primitive in the first place.
 */
const ROUND_SEGMENTS = 6;

function slab(w: number, h: number, d: number, chamfer = 0.02): THREE.BufferGeometry {
  const smallest = Math.min(w, h, d);
  /*
   * How round, from 0.28 of the smallest dimension up to 0.5 (a full capsule).
   *
   * The old `chamfer` values ranged from about 0.03 of a piece to 0.3 of one, so they are
   * remapped rather than used directly: what the call site was really expressing was "this
   * is a crisp thing" or "this is a soft thing", and that intent survives the change of
   * meaning even though the number cannot.
   */
  const softness = Math.min(1, (chamfer * CHAMFER_SCALE) / (smallest * 0.35));
  const radius = Math.min(smallest * 0.499, smallest * (0.28 + 0.2 * softness));

  const geometry = new THREE.BoxGeometry(
    w,
    h,
    d,
    ROUND_SEGMENTS,
    ROUND_SEGMENTS,
    ROUND_SEGMENTS
  );
  const pos = geometry.getAttribute('position');
  const inner = new THREE.Vector3(w / 2 - radius, h / 2 - radius, d / 2 - radius);
  const v = new THREE.Vector3();
  const clamped = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    clamped.set(
      Math.max(-inner.x, Math.min(inner.x, v.x)),
      Math.max(-inner.y, Math.min(inner.y, v.y)),
      Math.max(-inner.z, Math.min(inner.z, v.z))
    );
    v.sub(clamped);
    const len = v.length();
    if (len > 1e-6) v.multiplyScalar(radius / len);
    pos.setXYZ(i, clamped.x + v.x, clamped.y + v.y, clamped.z + v.z);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A continuous surface swept through a stack of cross-sections.
 *
 * This is the primitive the cast was missing, and its absence was the real reason these
 * figures did not read like the modelled ones - not the chamfers, and not the proportions.
 * A Tripo character is ONE skinned surface. This generator built bodies as a pile of thirty
 * separate overlapping volumes, so rounding those volumes just produced a pile of rounder
 * lumps: every joint is still a place where two closed shapes intersect, and the eye finds
 * every one of them.
 *
 * A loft has no joints. Give it rings - a height, a half-width, a half-depth, and a forward
 * offset - and it produces a single closed skin through all of them with continuous normals,
 * so a chest narrows into a waist and swells into a hip without anything crossing anything.
 *
 * Sections are superellipses rather than circles. A body is neither a cylinder nor a box; at
 * an exponent near 2.4 the section is an ellipse with slightly firm sides, which is what a
 * ribcage and a thigh both actually are.
 */
export interface LoftRing {
  y: number;
  halfW: number;
  halfD: number;
  /** Forward offset, for a chest that sits proud of the hips or a jaw that leads a skull. */
  z?: number;
  /** Section squareness. 2 is a pure ellipse; higher is firmer in the flanks. */
  squareness?: number;
}

const LOFT_SEGMENTS = 20;

function loft(rings: LoftRing[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const seg = LOFT_SEGMENTS;

  for (const ring of rings) {
    const n = ring.squareness ?? 2.4;
    const e = 2 / n;
    for (let i = 0; i < seg; i++) {
      const t = (i / seg) * Math.PI * 2;
      const c = Math.cos(t);
      const sn = Math.sin(t);
      // Superellipse. The sign work is what keeps it a closed loop through all four quadrants.
      const x = ring.halfW * Math.sign(c) * Math.abs(c) ** e;
      const z = ring.halfD * Math.sign(sn) * Math.abs(sn) ** e;
      positions.push(x, ring.y, z + (ring.z ?? 0));
    }
  }

  for (let r = 0; r < rings.length - 1; r++) {
    const a = r * seg;
    const b = (r + 1) * seg;
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      indices.push(a + i, b + i, a + j);
      indices.push(a + j, b + i, b + j);
    }
  }

  // Caps, as a fan to a centre vertex at each end.
  const capAt = (ringIndex: number, flip: boolean): void => {
    const ring = rings[ringIndex];
    const centre = positions.length / 3;
    positions.push(0, ring.y, ring.z ?? 0);
    const base = ringIndex * seg;
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      if (flip) indices.push(centre, base + j, base + i);
      else indices.push(centre, base + i, base + j);
    }
  };
  capAt(0, true);
  capAt(rings.length - 1, false);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A limb as one tapering surface, with a slight swell at the muscle belly.
 *
 * `w` is the width at the top and `taper` the fraction of it left at the bottom. The mesh
 * reference says limbs are consistently DEEPER than they are wide - the thigh measures 0.70
 * wide for its depth and the shin 0.80 - which is the opposite of the square sections this
 * generator used, and is most of why its arms read as pipes.
 */
function loftLimb(w: number, h: number, taper: number, bulge = 1.06): THREE.BufferGeometry {
  const halfW = w / 2;
  const halfD = halfW / 0.76;
  const at = (t: number, k: number): LoftRing => ({
    y: -h * t,
    halfW: halfW * k,
    halfD: halfD * k,
    squareness: 2.3,
  });
  return loft([
    at(0, 0.98),
    at(0.18, bulge),
    at(0.5, 1 - (1 - taper) * 0.45),
    at(0.82, taper * 1.02),
    at(1, taper * 0.9),
  ]);
}

/**
 * A rounded volume that is wider at one end than the other.
 *
 * Limbs are not prisms. An upper arm is thick at the shoulder and thin at the elbow, a thigh
 * more so, and a forearm runs the other way at the wrist - and a cast built entirely from
 * untapered pieces reads as scaffolding no matter how smooth each piece is. `taper` is the
 * fraction of full width left at the BOTTOM (y negative), so 1 is a prism and 0.6 is a
 * noticeable narrowing.
 */
function taperedSlab(
  w: number,
  h: number,
  d: number,
  chamfer: number,
  taper: number
): THREE.BufferGeometry {
  const geometry = slab(w, h, d, chamfer);
  if (taper === 1) return geometry;
  const pos = geometry.getAttribute('position');
  const half = h / 2;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    // 0 at the bottom of the piece, 1 at the top.
    const t = half === 0 ? 1 : (y + half) / (2 * half);
    const k = taper + (1 - taper) * Math.max(0, Math.min(1, t));
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/** Place a slab, optionally rotated about Z then Y, at a point. */
function limb(
  w: number,
  h: number,
  d: number,
  at: [number, number, number],
  rotZ = 0,
  rotX = 0,
  taper = 0.78
): THREE.BufferGeometry {
  // Tapered by default: every caller of this is an arm, a leg or a neck, and all three of
  // those narrow away from the body. See taperedSlab.
  const geometry = taperedSlab(w, h, d, Math.min(w, d) * 0.3, taper);
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
): {
  upper: { rotX: number; rotZ: number };
  fore: { rotX: number; rotZ: number };
  /** True when the target was further than the arm is long. See `overreached`. */
  clamped: boolean;
} {
  const toTarget = target.clone().sub(shoulder);
  const reachable = upperLength + foreLength - 0.001;
  // Clamped rather than failed: a target out of reach becomes a fully extended arm
  // pointing at it, which is what a person does, instead of a NaN and an invisible limb.
  const distance = Math.min(Math.max(toTarget.length(), 0.001), reachable);
  // Recorded, not just clamped. See CharacterParts.overreached.
  const clamped = toTarget.length() > reachable;
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
    clamped,
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
  const headScale = params.headScale ?? range(rng, 1.1, 1.24);
  const lean = params.lean ?? range(rng, 0.04, 0.14);
  const garment = params.garment ?? pick(rng, ['apron', 'coat', 'overalls'] as const);
  const headgear = params.headgear ?? pick(rng, ['none', 'cap', 'brim', 'hood', 'band'] as const);
  const sleeve = params.sleeve ?? pick(rng, ['long', 'rolled'] as const);
  const beard = params.beard ?? rng() < 0.35;
  const pouch = params.pouch ?? rng() < 0.5;

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
    /*
     * Overridable per figure because brightness is contextual: the default warm grey is a
     * quiet accent in a daylit workshop and a GLINT in a dark cellar. Vasile's buckle and
     * buttons under the school were sampled at #e6e1d2 on screen - the brightest thing on
     * a man wearing near-black - after two shader passes went hunting a specular that was
     * never there. Accents are albedo; fix the albedo.
     */
    hardware: params.colors?.hardware ?? PERSON.hardware,
  };

  /*
   * Proportion scaffold, measured off Mirela.glb rather than reasoned about.
   *
   * The generator and the modelled cast stand side by side in this game - one contact per
   * scene, the same camera, the same lighting - so any disagreement about how a person is
   * proportioned reads immediately as "that one is the fake". The bind pose of Mirela.glb
   * was dumped and normalised to total height, and the numbers said something specific and
   * unflattering: the limb RATIOS here were already right (forearm/upper arm 0.90 against
   * her 0.89, shin/thigh 1.00 against 1.02) and the mass DISTRIBUTION was wrong in three
   * places at once.
   *
   *                        was     Mirela.glb
   *   hip height          0.460       0.556     legs half a head too short
   *   torso, hip->shoulder 0.300      0.220     torso a head too long
   *   head length         0.130       0.152     head too small
   *   heads tall          7.69        6.58      the whole figure too lanky
   *
   * Seven-and-three-quarter heads is the proportion of an anatomy manual. Six-and-a-half is
   * the proportion of a character, and it is the single biggest reason a blocky generated
   * figure reads as a stylised person rather than as a mannequin - bigger than the chamfer
   * work, bigger than the palette. The head is the anchor the eye measures everything else
   * against, and this cast had been quietly telling the player it was a diagram.
   *
   * Leg and torso were re-split to put the hip where hers is. That change alone lengthens
   * the stride and shortens the trunk, which is most of the difference between a figure
   * that stands and one that slumps.
   */
  const legLength = height * 0.545;
  const torsoHeight = height * 0.225;
  const headHeight = height * 0.152 * headScale;
  const shoulderWidth = height * (0.20 + shoulders * 0.11);
  const hipWidth = shoulderWidth * (0.68 + build * 0.2);
  const torsoDepth = height * (0.085 + build * 0.05);
  /**
   * Thicker than it was, because the reference is thicker than it was.
   *
   * At 0.048 a 1.7m figure got an 8cm arm, which is anatomically about right and
   * stylistically wrong - next to the reference sheet these read as wire armatures with
   * clothes hung on them. The blocky style wants limbs that are near-cubic in section, so
   * that every segment is a mass rather than a line.
   */
  const limbThick = height * (0.062 + build * 0.026);

  const hipY = legLength;
  const shoulderY = hipY + torsoHeight;
  /*
   * The crown lands at full height, which it did not before.
   *
   * At 0.62 the head sat down inside the shoulders - fine when the head was small, and a
   * figure with no neck the moment it grew. It then went to a full head-length, which was
   * correct while the head was ONE piece centred on this point and wrong the moment it
   * became a skull with a jaw under it: the jaw hangs a quarter of a head below centre, so
   * the head effectively rose and the figure grew a stalk. 0.8 puts the underside of the
   * jaw back down onto the top of the neck.
   */
  const headY = shoulderY + headHeight * 0.8;

  /**
   * Hand targets the arm could not actually get to.
   *
   * `solveArm` clamps an out-of-reach target to a fully extended arm pointing at it, which
   * is the right thing to draw and a terrible thing to do silently: it produces a pose that
   * looks deliberate - somebody stretching toward a bench - while the hand is nowhere near
   * the thing it is supposed to be touching. That shipped once already, on two contacts,
   * and neither was caught by looking.
   *
   * It matters more now than it did, because the arms have just got shorter and moved
   * outboard for the style pass, so every target authored against the old proportions is a
   * candidate. Reported rather than thrown: a scene with one stretched arm should still
   * load.
   */
  const overreached: string[] = [];

  // Above the hip.
  const skin: THREE.BufferGeometry[] = [];
  const eyes: THREE.BufferGeometry[] = [];
  const cloth: THREE.BufferGeometry[] = [];
  const under: THREE.BufferGeometry[] = [];
  // Below it, and staying where it is put.
  const legs: THREE.BufferGeometry[] = [];
  const boots: THREE.BufferGeometry[] = [];
  /** Leather: gloves, belt, straps, hat. One dark value tying the figure together. */
  const leather: THREE.BufferGeometry[] = [];
  /** The single hard accent. Buckles and goggle rims, and nothing else. */
  const metal: THREE.BufferGeometry[] = [];

  /*
   * -- Head ---------------------------------------------------------------------------
   *
   * Three pieces, not one, and that is the difference between a head and a lump on a neck.
   *
   * The cranium is wider than it is deep and tapers DOWN into the jaw, which is the single
   * strongest cue that a rounded mass is a skull. The jaw is its own smaller volume set
   * slightly forward, so the profile has a chin. The brow is a shallow bar above the eyes,
   * and it earns its two triangles many times over: it is what casts the eyes into shadow
   * under a key light, and eyes in shadow is most of what separates a face from a pattern.
   *
   * Everything is jittered per seed - width, jaw width, brow depth - so no two heads in the
   * cast are the same shape rather than the same shape in different colours.
   */
  /*
   * 0.68 of the head's HEIGHT, from the mesh rather than from taste.
   *
   * Mirela's head measures 0.135 wide, 0.194 deep and 0.198 tall. So width is 0.68 of
   * height and depth is very nearly equal to it. The previous range topped out at 0.88,
   * and because the depth below is derived from the width by the measured 0.70 ratio, a
   * head that was too wide became a head that was HALF AGAIN deeper than it was tall - an
   * egg pointing at the camera, with the brow, eyes and nose all buried inside it.
   */
  const headW = headHeight * range(rng, 0.7, 0.88);
  const headSkew = jitter(rng, 0.006);

  /*
   * The skull, still assembled rather than lofted - and that is a retreat, recorded honestly.
   *
   * The torso below is one continuous surface and is better for it, so the head was lofted
   * the same way: one skin from crown to chin, at the 0.70 width-to-depth the mesh measures.
   * It read worse twice running. The first attempt made the skull deeper than it was tall
   * and buried the brow, eyes and nose inside it. The second fixed the depth and the face
   * was still gone, because the hair volumes are authored against THIS shape and a loft of
   * the same nominal size does not present the same surface for them to sit on.
   *
   * A torso is one mass and lofts cleanly. A head is a skull, a jaw, a brow and a nose that
   * hold a specific relationship to each other AND to the hair - getting that from a single
   * swept surface means rebuilding the features and the hair against it in the same pass.
   * That is a real piece of work rather than a tweak, and leaving a faceless figure in the
   * game while it is attempted is worse than leaving this.
   */
  const cranium = taperedSlab(
    headW,
    headHeight * 0.62,
    headHeight * 0.74,
    headHeight * 0.3,
    range(rng, 0.84, 0.92)
  );
  cranium.rotateX(lean * 0.4);
  cranium.translate(headSkew, headY + headHeight * 0.14, torsoDepth * 0.06);
  skin.push(cranium);

  // The jaw: short, barely narrower than the skull, level with the face rather than ahead of
  // it. An earlier version gave it 0.4 of a head length and pushed it forward, which is a
  // muzzle - three pieces reading as a snout is worse than one reading as a lump.
  const jawW = headW * range(rng, 0.84, 0.94);
  const jaw = taperedSlab(
    jawW,
    headHeight * 0.26,
    headHeight * 0.6,
    headHeight * 0.26,
    range(rng, 0.82, 0.92)
  );
  jaw.rotateX(lean * 0.4);
  jaw.translate(headSkew, headY - headHeight * 0.13, torsoDepth * 0.06 + headHeight * 0.01);
  skin.push(jaw);

  const brow = slab(headW * 0.86, headHeight * 0.07, headHeight * 0.14, headHeight * 0.04);
  brow.rotateX(lean * 0.4 - 0.06);
  brow.translate(
    headSkew,
    headY + headHeight * 0.15,
    torsoDepth * 0.06 + headHeight * range(rng, 0.27, 0.31)
  );
  skin.push(brow);

  // A nose. One small wedge, and the only thing on this face that says which way it is
  // pointing from the side - which is the angle half these figures are seen from.
  const nose = taperedSlab(
    headW * 0.14,
    headHeight * 0.12,
    headHeight * range(rng, 0.07, 0.11),
    headHeight * 0.03,
    range(rng, 1.0, 1.3)
  );
  nose.rotateX(lean * 0.4);
  nose.translate(headSkew, headY + headHeight * 0.03, torsoDepth * 0.06 + headHeight * 0.34);
  skin.push(nose);

  // Ears, set back and low, at a slightly different height each side.
  for (const side of [-1, 1] as const) {
    const ear = slab(headHeight * 0.06, headHeight * 0.16, headHeight * 0.13, headHeight * 0.05);
    ear.rotateX(lean * 0.4);
    ear.translate(
      headSkew + side * headW * 0.5,
      headY + headHeight * 0.08 + jitter(rng, 0.004),
      torsoDepth * 0.06 - headHeight * 0.02
    );
    skin.push(ear);
  }

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
  const faceZ = torsoDepth * 0.06 + headHeight * 0.32;
  const eyeW = headW * 0.16;
  for (const side of [-1, 1] as const) {
    // Set BACK from the face plane and under the brow, so the socket shades them. They used
    // to sit proud of the face, which reads as painted-on dots from every angle but dead on.
    const eye = slab(eyeW, headHeight * 0.09, headHeight * 0.04, eyeW * 0.3);
    eye.rotateX(lean * 0.4);
    eye.translate(headSkew + side * headW * 0.22, headY + headHeight * 0.08, faceZ);
    eyes.push(eye);
  }

  /*
   * Longer, because the head moved up and a neck has to reach it.
   *
   * At 0.3 of a head length this was a collar stud, and with the head where it is now there
   * was 4cm of nothing between the shoulders and the jaw. 0.55, sitting a little over a
   * quarter of a head above the shoulder line, closes the gap and overlaps both ends - a
   * neck that stops short of the chin is the sort of thing that only shows up from one
   * angle, in one shot, after everything else is finished.
   */
  /*
   * Slightly barrelled rather than tapered: a neck is not a cone, and the default taper on
   * `limb` narrowed it toward the jaw, which is exactly the wrong end. Long enough to reach
   * from inside the collar to inside the jaw, so neither joint shows a seam from any angle.
   */
  const neck = limb(
    limbThick * 0.92,
    headHeight * 0.62,
    limbThick * 0.92,
    [0, shoulderY + headHeight * 0.26, 0],
    0,
    0,
    1.04
  );
  skin.push(neck);

  /*
   * -- Torso: ONE surface, hips to shoulders ------------------------------------------
   *
   * This was a chest slab and a waist slab stacked on each other, and the note above them
   * used to admit the problem: "two similar masses stacked, and the eye reads it as one long
   * block". The belt was added to hide the seam. Both of those are treatments for a wound
   * that did not need to exist.
   *
   * The ring stack is taken off Mirela.glb's own silhouette. Slicing her mesh horizontally
   * and measuring the central cluster at every 5% of height gives a curve, and the curve is
   * not subtle: widest at the chest (0.280 of body height), narrowest at the waist (0.200)
   * at 60% up, and back out at the hip (0.246). A waist that is 71% of the chest is a real
   * hourglass, and no arrangement of two boxes produces it.
   *
   * The forward offsets are the other half of it. The chest sits proud and the waist tucks
   * back, which is what gives the figure a front from the side - the flat-fronted stack had
   * the same profile from every angle.
   */
  const chestHalf = shoulderWidth * 0.5;
  const waistHalf = chestHalf * (0.71 + build * 0.14);
  const hipHalf = chestHalf * (0.86 + build * 0.1);
  const torso = loft([
    { y: hipY - torsoHeight * 0.06, halfW: hipHalf * 0.9, halfD: torsoDepth * 0.5, squareness: 2.6 },
    { y: hipY + torsoHeight * 0.1, halfW: hipHalf, halfD: torsoDepth * 0.52, squareness: 2.6 },
    { y: hipY + torsoHeight * 0.34, halfW: waistHalf, halfD: torsoDepth * 0.45, z: -torsoDepth * 0.03, squareness: 2.5 },
    { y: hipY + torsoHeight * 0.62, halfW: chestHalf * 0.94, halfD: torsoDepth * 0.55, z: torsoDepth * 0.03, squareness: 2.4 },
    { y: shoulderY - torsoHeight * 0.06, halfW: chestHalf, halfD: torsoDepth * 0.54, z: torsoDepth * 0.02, squareness: 2.4 },
    { y: shoulderY + torsoHeight * 0.04, halfW: chestHalf * 0.9, halfD: torsoDepth * 0.46, squareness: 2.6 },
  ]);
  torso.rotateX(lean * 0.8);
  cloth.push(torso);

  /**
   * The belt, which is the horizontal every one of these figures was missing.
   *
   * A torso built from a chest slab and a waist slab is two similar masses stacked, and
   * the eye reads it as one long block. Every figure on the reference sheet has a dark
   * band cutting it at the hip, and that band is doing structural work: it separates
   * torso from legs, gives the silhouette a waist, and puts the darkest value on the
   * figure at the point the eye uses to judge posture.
   */
  const beltY = hipY + torsoHeight * 0.16;
  const belt = slab(hipWidth * 1.1, torsoHeight * 0.2, torsoDepth * 1.06, torsoDepth * 0.12);
  belt.rotateX(lean * 0.6);
  belt.translate(0, beltY, 0);
  leather.push(belt);

  const buckle = slab(hipWidth * 0.17, torsoHeight * 0.1, torsoDepth * 0.12, 0.006);
  buckle.rotateX(lean * 0.6);
  buckle.translate(0, beltY, torsoDepth * 0.52);
  metal.push(buckle);

  /**
   * A pouch at the hip.
   *
   * Reference figures are almost never a clean cylinder from waist to boot - there is a
   * satchel, a holster, a roll of something strapped on. It costs one box and it breaks
   * the vertical line of the leg, which is the read that says "carrying tools" rather
   * than "wearing trousers".
   */
  if (pouch) {
    const side = rng() < 0.5 ? -1 : 1;
    const bag = slab(hipWidth * 0.3, torsoHeight * 0.3, torsoDepth * 0.34, torsoDepth * 0.1);
    bag.translate(side * hipWidth * 0.56, beltY - torsoHeight * 0.2, torsoDepth * 0.16);
    leather.push(bag);

    const flap = slab(hipWidth * 0.32, torsoHeight * 0.09, torsoDepth * 0.36, 0.006);
    flap.translate(side * hipWidth * 0.56, beltY - torsoHeight * 0.05, torsoDepth * 0.16);
    under.push(flap);
  }

  /**
   * A collar, whatever the garment.
   *
   * Only the coat had one, so the aprons and overalls ran neck straight into chest with
   * nothing between. On the reference every neckline is marked - a collar, a scarf, a
   * yoke seam - because the join between head and body is the second place after the belt
   * where the eye looks for structure, and a blocky figure has to be told it is there.
   */
  const collar = slab(shoulderWidth * 0.56, torsoHeight * 0.11, torsoDepth * 1.02, torsoDepth * 0.16);
  collar.rotateX(lean);
  collar.translate(0, shoulderY - torsoHeight * 0.01, torsoDepth * 0.06);
  under.push(collar);

  /**
   * A strap across the chest, for anybody carrying something.
   *
   * The most-repeated element on the reference sheet after the belt, and the one that does
   * most for a plain torso: a diagonal breaks a rectangle in a way no horizontal can, and
   * it ties the shoulder to the opposite hip so the figure reads as loaded rather than as
   * dressed. Only on people who have a bag, so it means something.
   */
  if (pouch) {
    const strap = slab(shoulderWidth * 0.12, torsoHeight * 0.92, torsoDepth * 0.11, 0.01);
    strap.rotateZ(0.34);
    strap.rotateX(lean * 0.6);
    strap.translate(-shoulderWidth * 0.02, shoulderY - torsoHeight * 0.38, torsoDepth * 0.56);
    leather.push(strap);
  }

  // -- Arms. Asymmetric pose: one arm slightly forward, as if mid-task. -------------
  /**
   * Longer again, because shortening them broke three dioramas.
   *
   * These were trimmed to 0.56/0.50 so a resting hand would land at the hip rather than
   * below it - a cosmetic call, made against the cast sheet where nobody is touching
   * anything. Every contact in the game IS touching something, and the authored hand
   * targets were all set against the old reach. Combined with shoulders that moved
   * outboard in the same pass, Vasile ended up in a full T-pose against his pipe run and
   * Ileana in a mantis crouch over her table.
   *
   * A centimetre of extra hand droop on an idle figure is worth nothing next to that.
   */
  const upperArm = torsoHeight * 0.61;
  const foreArm = torsoHeight * 0.55;

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
  /**
   * Wider than a real rest pose, on purpose.
   *
   * At 0.1 radians the upper arms hang against the ribs, which is what people do and which
   * on a blocky figure means the arm's silhouette is entirely inside the torso's. The
   * reference sheet holds every arm noticeably clear of the body - it is a caricature of
   * standing, and it is what lets a 1,000-triangle figure read at a distance.
   */
  const ARM_OUT = 0.17;
  /**
   * NEGATIVE is forward, and this was wrong from the beginning.
   *
   * `hangingLimb` rotates a limb hanging down -Y about +X, so a POSITIVE rotX sends the
   * far end to -Z - backwards. `aimAngles`, which the IK solver uses, agrees: a target
   * dead in front gives `asin(-1)`, a negative angle. The rest pose used positive values
   * with names that said FORWARD, so every contact not reaching for something had their
   * arms swung behind them.
   *
   * It hid because the numbers were small. At 0.12 an upper arm sits a few degrees back
   * and reads as a relaxed shoulder. It stopped hiding the moment Dorin lost his hand
   * targets and fell back to `reach: 0.9`, which put his forearms seventy-two degrees
   * BEHIND him - a man apparently trying to pick a lock with his elbows.
   */
  const ARM_FORWARD = -0.12;
  const ELBOW_REST = -0.22;

  // Also negative, so more reach bends the forearm further FORWARD rather than further
  // back. Signs have to agree all the way down or the two terms fight each other.
  const elbowBend = ELBOW_REST - reach * 1.15;

  for (const side of [-1, 1] as const) {
    // Asymmetry, but small. It is the difference between two people and the difference
    // between a person and a shop mannequin; it is not a pose in itself.
    const swing = ARM_FORWARD + jitter(rng, 0.09);
    const outward = side * (ARM_OUT + Math.abs(jitter(rng, 0.03)));

    // The shoulder sits inside the chest slab, so the arm reads as joined to the body
    // rather than parked alongside it.
    /**
     * Outboard of the garment, not inside it.
     *
     * The arm used to hang at `shoulderWidth/2 - limbThick*0.1`, which is inside the coat
     * shell (that slab is 1.1x shoulder width). A sleeve the same colour as the coat,
     * buried in the coat, is invisible: the whole cast read as torsos with gloves floating
     * beside them, and no amount of work on the hands was going to fix an arm that was not
     * there. The arm now hangs clear of the widest garment mass.
     */
    const shoulder = new THREE.Vector3(
      side * (shoulderWidth * 0.52 + limbThick * 0.1),
      shoulderY - torsoHeight * 0.06,
      0
    );

    /**
     * A cap over the joint.
     *
     * Every figure on the reference sheet has one - a pauldron, a rolled shoulder seam, a
     * yoke. It does one specific job: it puts a DIFFERENT value at the point where arm
     * meets torso, so the eye reads a joint there instead of reading one continuous mass.
     * Without it a sleeve in the garment colour merges with the garment however far out it
     * is hung.
     */
    const cap = slab(limbThick * 1.5, limbThick * 0.85, limbThick * 1.45, limbThick * 0.35);
    cap.rotateZ(side * 0.12);
    cap.translate(shoulder.x, shoulder.y + limbThick * 0.1, shoulder.z);
    leather.push(cap);

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

    /**
     * Rest, not reach, when the target cannot be reached.
     *
     * `solveArm` used to clamp an out-of-range target to a fully extended arm pointing at
     * it. That is defensible in isolation - it is what a person stretching looks like -
     * and it is the wrong default here, because the failure is INVISIBLE as a bug and
     * unmistakable as bad art: Vasile stood in a dead T-pose against his pipe run and read
     * as a scarecrow, not as a man who could not quite reach.
     *
     * An arm at rest is never egregious. A stretched one always is. So a target that
     * cannot be reached is dropped entirely and the side falls back to its resting pose,
     * which loses the staging for that hand and loses nothing else. The over-reach is
     * still reported, because the scene should be fixed rather than quietly forgiven.
     */
    const rest = {
      upper: { rotX: swing, rotZ: outward },
      fore: { rotX: swing + elbowBend, rotZ: outward * 0.45 },
      clamped: false,
    };

    const attempt = target ? solveArm(shoulder, target, upperArm, foreArm, pole) : rest;
    if (attempt.clamped) overreached.push(side === -1 ? 'left' : 'right');
    const solved = attempt.clamped ? rest : attempt;

    /**
     * Sleeved.
     *
     * These arms used to be bare skin from shoulder to fingertip, which is why the cast
     * read as mannequins in tabards rather than as people in clothes: the garment stopped
     * at the shoulder and the largest moving masses on the figure carried no costume at
     * all. On the reference every arm is a sleeve, ending in a glove, and that single
     * change does more for the style than any amount of detail on the torso.
     */
    cloth.push(
      hangingLimb(
        limbThick * 1.12,
        upperArm,
        limbThick * 1.12,
        shoulder,
        solved.upper.rotZ,
        solved.upper.rotX
      )
    );

    const elbow = shoulder
      .clone()
      .add(limbEnd(upperArm, solved.upper.rotZ, solved.upper.rotX));
    const foreRot = solved.fore.rotX;
    const foreOut = solved.fore.rotZ;

    // Rolled sleeves leave the forearm bare, with a cuff where the fabric stops. That is
    // what somebody working with their hands does, and it puts a skin value back into the
    // middle of the figure so the arms are not one unbroken block of garment.
    (sleeve === 'rolled' ? skin : cloth).push(
      hangingLimb(limbThick * 1.02, foreArm, limbThick * 1.02, elbow, foreOut, foreRot)
    );
    if (sleeve === 'rolled') {
      under.push(
        hangingLimb(limbThick * 1.2, limbThick * 0.5, limbThick * 1.2, elbow, foreOut, foreRot)
      );
    }

    const wrist = elbow.clone().add(limbEnd(foreArm, foreOut, foreRot));

    /**
     * Gloves, in the boot leather.
     *
     * §185's "visually dominant hands", and the reference's rule that the darkest values on
     * a figure are its extremities - boots, gloves, belt. Sharing one leather value across
     * all three is what stops a blocky figure reading as separate parts: the dark reads as
     * one costume element wrapping the body at four points.
     */
    leather.push(
      hangingLimb(limbThick * 1.4, limbThick * 1.45, limbThick * 1.25, wrist, foreOut, foreRot)
    );
  }

  // -- Legs and boots ---------------------------------------------------------------
  for (const side of [-1, 1] as const) {
    /**
     * Feet closer together.
     *
     * At 0.26 of hip width plus up to 0.05 radians of splay, a 1.8m contact stood with
     * about 27cm of air between boots that are 18cm wide each - a stance somewhere between
     * bracing for a wave and waiting to be searched. People at rest stand narrower than
     * that, and a blocky figure exaggerates whatever it is given.
     */
    const outward = side * hipWidth * 0.19;
    const stance = side * range(rng, 0.0, 0.03);

    // Legs hang from the hip for the same reason arms hang from the shoulder. It matters
    // less here because a standing leg is nearly vertical, but a stance angle applied
    // about the middle of a thigh lifts the hip out of the pelvis just as visibly.
    const hip = new THREE.Vector3(outward, hipY + torsoHeight * 0.02, 0);
    legs.push(hangingLimb(limbThick * 1.34, legLength * 0.56, limbThick * 1.3, hip, stance));

    const knee = hip.clone().add(limbEnd(legLength * 0.56, stance, 0));
    legs.push(hangingLimb(limbThick * 1.2, legLength * 0.5, limbThick * 1.18, knee, stance * 0.4));

    /**
     * A boot in three parts, so which way it points is never in question.
     *
     * The old boot was one slab, deeper than it was wide, which is technically a foot
     * pointing forward and reads as a brick. Direction has to survive a three-quarter
     * camera at four metres, and the thing that carries it is not the box - it is the
     * SEPARATION between an ankle mass and a toe mass that sticks out well in front of it.
     * Ankle, foot, toe cap: the profile steps down twice going forward, and that staircase
     * is legible from anywhere.
     */
    const ankle = slab(limbThick * 1.25, limbThick * 1.05, limbThick * 1.3, limbThick * 0.22);
    ankle.translate(outward, limbThick * 0.72, -limbThick * 0.06);
    boots.push(ankle);

    const foot = slab(limbThick * 1.32, limbThick * 0.62, limbThick * 2.5, limbThick * 0.16);
    foot.translate(outward, limbThick * 0.31, limbThick * 0.62);
    boots.push(foot);

    const toe = slab(limbThick * 1.18, limbThick * 0.46, limbThick * 0.7, limbThick * 0.14);
    toe.translate(outward, limbThick * 0.23, limbThick * 1.72);
    boots.push(toe);
  }

  // -- Garment: the mass that says what this person does ----------------------------
  switch (garment) {
    case 'apron': {
      /**
       * An apron, not a billboard.
       *
       * One slab across most of the chest was the single worst-reading element on the
       * cast: a pale rectangle the size of a sheet of paper, taped on, flattening the
       * torso it was supposed to describe. A real apron is narrow at the bib, wide at the
       * skirt, and hangs from two straps over the shoulders - three masses, and the shape
       * between them is what says apron rather than sandwich board.
       */
      const bib = slab(shoulderWidth * 0.38, torsoHeight * 0.34, torsoDepth * 0.14, 0.02);
      bib.rotateX(lean * 0.9);
      bib.translate(0, shoulderY - torsoHeight * 0.3, torsoDepth * 0.54);
      under.push(bib);

      const skirt = slab(hipWidth * 0.54, torsoHeight * 0.74, torsoDepth * 0.16, 0.02);
      skirt.rotateX(lean * 0.4);
      skirt.translate(0, hipY - torsoHeight * 0.04, torsoDepth * 0.54);
      under.push(skirt);

      // A tie at the waist. Without it the skirt hangs from nothing, and the join between
      // bib and skirt is the widest unbroken pale area anywhere on the figure - which is
      // exactly what made this read as somebody holding a clipboard.
      const tie = slab(hipWidth * 1.02, torsoHeight * 0.08, torsoDepth * 0.14, 0.008);
      tie.rotateX(lean * 0.5);
      tie.translate(0, hipY + torsoHeight * 0.3, torsoDepth * 0.54);
      leather.push(tie);

      for (const side of [-1, 1] as const) {
        const strap = slab(shoulderWidth * 0.1, torsoHeight * 0.5, torsoDepth * 0.12, 0.01);
        strap.rotateX(lean);
        strap.rotateZ(side * 0.12);
        strap.translate(side * shoulderWidth * 0.2, shoulderY - torsoHeight * 0.16, torsoDepth * 0.48);
        under.push(strap);
      }
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
      const placket = slab(shoulderWidth * 0.1, torsoHeight * 1.02, torsoDepth * 0.14, 0.012);
      placket.rotateX(lean * 0.8);
      placket.translate(0, hipY + torsoHeight * 0.42, torsoDepth * 0.6);
      under.push(placket);

      // Three buttons down it. On the reference a coat front is never a bare strip - the
      // hardware is what stops it reading as a seam and starts it reading as a fastening.
      for (let i = 0; i < 3; i++) {
        const button = slab(shoulderWidth * 0.05, shoulderWidth * 0.05, torsoDepth * 0.08, 0.004);
        button.translate(0, hipY + torsoHeight * (0.12 + i * 0.3), torsoDepth * 0.66);
        metal.push(button);
      }

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

  /**
   * The hairline, and the correction to a correction.
   *
   * The cap here used to be DEEPER than the head and centred on it, so it wrapped the face
   * as completely as the crown and every figure read as seen from behind. The fix was to
   * push it back and make it shallower - and it went too far, by a measurable amount.
   *
   * The numbers, because this is the kind of thing that has to be measured rather than
   * looked at. In head-heights, with the head centred at 0: the head's front face sits at
   * +0.42 and its top at +0.50. The old cap spanned z -0.53 to +0.03 and started at y
   * +0.06, which is just above the EYELINE. So the entire front half of the skull, from the
   * eyebrows to the crown, was bare skin. That is not "hair pushed back". That is a lid on
   * the back of a bald head, and it is exactly what it looked like.
   *
   * A real hairline crosses the top of the forehead and comes DOWN at the temples. So the
   * crown now reaches forward to +0.30 - short of the face plane at +0.42, which is what
   * keeps the front readable as a face - and a separate fringe piece drops in front of it.
   * The face plane stays bare; the skull stops being.
   */
  const crown = slab(headW * 1.04, headHeight * 0.46, headHeight * 0.86, headHeight * 0.2);
  crown.rotateX(lean * 0.4);
  crown.translate(0, headY + headHeight * 0.3, -headHeight * 0.06);
  hairPieces.push(crown);

  // The fringe: a shallow band across the top of the forehead. This is the piece that was
  // missing, and on its own it is most of the difference between bald and not.
  const fringe = slab(headW * 0.98, headHeight * 0.2, headHeight * 0.16, headHeight * 0.06);
  fringe.rotateX(lean * 0.4);
  fringe.translate(0, headY + headHeight * 0.27, torsoDepth * 0.06 + headHeight * 0.36);
  hairPieces.push(fringe);

  /**
   * Temples, down past the ear line.
   *
   * Wider and further forward than the sideburns they replace. A hairline that is level
   * all the way round reads as a swimming cap; bringing it down at the sides is what makes
   * the bare patch in the middle read as a FACE rather than as the top of a head.
   */
  for (const side of [-1, 1] as const) {
    const temple = slab(headW * 0.18, headHeight * 0.46, headHeight * 0.62, headHeight * 0.1);
    temple.rotateX(lean * 0.4);
    temple.translate(side * headW * 0.44, headY + headHeight * 0.02, -headHeight * 0.02);
    hairPieces.push(temple);
  }

  // A tied-back mass or a fall down the neck, chosen by seed - cheap variation, big read.
  if (rng() < 0.5) {
    const bun = slab(headHeight * 0.38, headHeight * 0.38, headHeight * 0.38, headHeight * 0.14);
    bun.translate(jitter(rng, 0.02), headY + headHeight * 0.28, -headHeight * 0.54);
    hairPieces.push(bun);
  } else {
    const back = slab(headW * 0.94, headHeight * 0.66, headHeight * 0.34, headHeight * 0.14);
    back.translate(0, headY - headHeight * 0.1, -headHeight * 0.44);
    hairPieces.push(back);
  }

  /**
   * A beard, which on a blocky head is silhouette rather than detail.
   *
   * It hangs below the jaw line, so it changes the outline of the head from every angle -
   * unlike a mouth, which would only exist from the front and would break the no-face
   * rule the style depends on.
   */
  if (beard) {
    const jaw = slab(headW * 0.76, headHeight * 0.36, headHeight * 0.44, headHeight * 0.1);
    jaw.rotateX(lean * 0.4);
    jaw.translate(0, headY - headHeight * 0.3, torsoDepth * 0.06 + headHeight * 0.16);
    hairPieces.push(jaw);
  }

  /**
   * Headgear.
   *
   * The reference sheet's characters are told apart by what is on their heads before
   * anything else - a brim, a flat cap, a hood, a welder's band. Each of these is two or
   * three boxes, and each changes the silhouette above the shoulders enough that the
   * figure is identifiable as a shape with no colour and no detail at all.
   *
   * They are built in garment and leather rather than in their own colour, so a hat still
   * reads as part of one costume instead of as a prop resting on somebody.
   */
  const crownY = headY + headHeight * 0.42;
  switch (headgear) {
    case 'cap': {
      // A flat cap: soft crown, hard peak. The peak is the bit that says which way the
      // head is facing, which makes it worth its two triangles many times over.
      const crown = slab(headW * 1.08, headHeight * 0.34, headHeight * 0.92, headHeight * 0.16);
      crown.rotateX(lean * 0.4);
      crown.translate(0, crownY, -headHeight * 0.04);
      cloth.push(crown);

      const peak = slab(headW * 0.98, headHeight * 0.07, headHeight * 0.42, headHeight * 0.03);
      peak.rotateX(lean * 0.4 - 0.12);
      peak.translate(0, crownY - headHeight * 0.15, headHeight * 0.6);
      leather.push(peak);
      break;
    }
    case 'brim': {
      // The explorer's hat. A tall crown and a brim wider than the shoulders are, which
      // is the most recognisable head shape on the whole reference sheet.
      const crown = slab(headW * 0.9, headHeight * 0.62, headHeight * 0.86, headHeight * 0.14);
      crown.rotateX(lean * 0.4);
      crown.translate(0, crownY + headHeight * 0.18, -headHeight * 0.02);
      leather.push(crown);

      const brim = slab(headW * 1.9, headHeight * 0.085, headHeight * 1.8, headHeight * 0.12);
      brim.rotateX(lean * 0.4 - 0.14);
      brim.translate(0, crownY - headHeight * 0.13, headHeight * 0.06);
      leather.push(brim);

      const band = slab(headW * 0.94, headHeight * 0.12, headHeight * 0.9, headHeight * 0.04);
      band.rotateX(lean * 0.4);
      band.translate(0, crownY - headHeight * 0.02, -headHeight * 0.02);
      cloth.push(band);
      break;
    }
    case 'hood': {
      // Up, and around. The hood is deliberately deeper than the head so the face sits
      // inside it - the one place in this generator where covering the front is right,
      // because a hood that does not shadow the face is a scarf.
      const shell = slab(headW * 1.38, headHeight * 1.24, headHeight * 1.16, headHeight * 0.24);
      shell.rotateX(lean * 0.4);
      shell.translate(0, headY + headHeight * 0.16, -headHeight * 0.26);
      cloth.push(shell);

      const drape = slab(headW * 1.2, headHeight * 0.5, headHeight * 0.5, headHeight * 0.16);
      drape.translate(0, shoulderY + headHeight * 0.06, -headHeight * 0.42);
      cloth.push(drape);
      break;
    }
    case 'band': {
      // Goggles pushed up onto the forehead: a strap and two lenses. The only place a
      // figure gets a hard metal accent above the belt, so it pulls the eye to the head.
      const strap = slab(headW * 1.08, headHeight * 0.13, headHeight * 0.9, headHeight * 0.05);
      strap.rotateX(lean * 0.4);
      strap.translate(0, headY + headHeight * 0.34, -headHeight * 0.02);
      leather.push(strap);

      for (const side of [-1, 1] as const) {
        const lens = slab(headW * 0.3, headHeight * 0.16, headHeight * 0.1, headHeight * 0.04);
        lens.rotateX(lean * 0.4);
        lens.translate(side * headW * 0.24, headY + headHeight * 0.34, faceZ - headHeight * 0.02);
        metal.push(lens);
      }
      break;
    }
    case 'none':
      break;
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
      ...collect('boots', leather, -pivotY),
      ...collect('metal', metal, -pivotY),
    ],
    lower: [...collect('garment', legs, 0), ...collect('boots', boots, 0)],
    hipHeight: pivotY,
    overreached,
    colors,
  };
}
