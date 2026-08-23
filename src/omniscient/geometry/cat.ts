/**
 * A cat.
 *
 * There is no reason for it. That is the reason.
 *
 * ## What a cat is, at this distance, in this game
 *
 * Six metres away, at night, in a flat-colour low-poly street. Which means it is a
 * SILHOUETTE and two eyes, and everything else is a waste of triangles. The silhouette has
 * to be unmistakable from any angle the shot might catch it at, and there is exactly one
 * pose that manages that: sitting upright with the tail curled round the front paws. A cat
 * standing is a small dog; a cat lying down is a bag. Sitting is the shape everybody draws
 * when asked to draw a cat, because it is the one that cannot be mistaken for anything else.
 *
 * ## Grey, not black
 *
 * The first version was near-black, on the reasoning that a cat at night is a silhouette.
 * A silhouette needs something behind it to be a silhouette against, and on a dark brick
 * wall under one porch lamp there is nothing - measured, it rendered at 7/255 against
 * brickwork at 56, which is not a shape, it is a slightly darker piece of night. It has to
 * be paler than what it sits on or it is not there at all.
 *
 * ## The eyes do all the work
 *
 * Cats have a tapetum lucidum and everybody has met it in a torch beam. Two unlit dots that
 * hold their brightness whatever the scene lighting does are the single cheapest, most
 * recognisable thing in this file - they are what makes a dark lump on a bin read as an
 * animal that has noticed you, from any distance at which the lump is visible at all.
 *
 * ## Why it moves
 *
 * A still cat is an ornament. But a cat is also the most economical animation in the world:
 * it does nothing at all, and then its tail moves. So there is no walk, no idle sway and no
 * head bob - there is a tail that flicks on its own schedule, a head that occasionally
 * decides to look somewhere else, and a blink. Three things, none of them synchronised,
 * which between them are the difference between a prop and an animal that is ignoring you.
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { MAT } from '../art/palette.js';
import { decorMesh as meshOf } from '../art/mesh.js';
import { createRng, range, seedFrom } from '../core/rng.js';

export interface GeneratedCat {
  root: ENGINE.SceneNode;
  /** Advance the tail, the head and the blink. Register as a prop idle. */
  idle: (deltaTime: number) => void;
}

export interface CatOptions {
  at: THREE.Vector3;
  /** Which way it is facing, in radians. */
  facing?: number;
  /** Nose to tail-base, in metres. A cat sitting is about 0.35 tall at the shoulder. */
  scale?: number;
  seed?: string;
}

/** Segments in the tail. Three is enough to curl; four is enough to whip. */
const TAIL = 4;

export function buildCat(options: CatOptions): GeneratedCat {
  const size = options.scale ?? 1;
  const rng = createRng(seedFrom(options.seed ?? 'cat'));

  const root = ENGINE.SceneNode.create({
    name: 'Cat',
    position: options.at.clone(),
    rotation: new THREE.Euler(0, options.facing ?? 0, 0),
  });
  root.scale.setScalar(size);

  /*
   * The body: a haunch at the bottom and a chest above it, leaning back.
   *
   * Two tapered boxes rather than one, because the line that says "sitting cat" is the
   * S-curve from the ground up the chest to the head - a single box gives a pillar. The
   * haunch is wide and low and the chest is narrow and tipped back over it.
   */
  const body: THREE.BufferGeometry[] = [];

  /*
   * Narrowed, and the reason is what a cat is NOT.
   *
   * The haunch was 280mm across on a body 420mm tall - proportions that belong to a badger.
   * Rendered on the sill it read as a squat pale wedge and the most common guess at what it
   * was, looking at the capture cold, was a paper bag. A sitting cat is startlingly narrow
   * from the front: roughly 200mm across the hips on 400mm of height, and it is the NARROWNESS
   * that carries the read, because every other small animal that sits like this is wider.
   *
   * The other half of the same fix is height. Taller segments on a thinner body restore the
   * S-curve the note above is about - ground, up the chest, out to the head - which is the
   * line a squat version cannot draw no matter how the pieces are shaped.
   */
  const haunch = new THREE.CylinderGeometry(0.082, 0.108, 0.17, 7);
  haunch.translate(0, 0.085, -0.02);
  body.push(haunch);

  const chest = new THREE.CylinderGeometry(0.058, 0.084, 0.2, 7);
  chest.rotateX(-0.16);
  chest.translate(0, 0.235, 0.015);
  body.push(chest);

  // The front legs, straight down from the chest, which is what a sitting cat does.
  for (const side of [-1, 1] as const) {
    const leg = new THREE.CylinderGeometry(0.02, 0.023, 0.16, 5);
    leg.translate(side * 0.038, 0.08, 0.07);
    body.push(leg);
    const paw = new THREE.BoxGeometry(0.044, 0.028, 0.07);
    paw.translate(side * 0.038, 0.014, 0.09);
    body.push(paw);
  }

  root.add(meshOf('CatBody', mergeGeometries(body, false) ?? body[0], MAT.catFur));

  /**
   * The head, on its own node because it turns.
   *
   * A wedge rather than a sphere. A cat's skull is flat-fronted and wide at the cheeks, and
   * a ball with ears on reads as a bear cub - the flat face is most of what separates the
   * two at silhouette scale.
   */
  const headNode = ENGINE.SceneNode.create({
    name: 'CatHead',
    position: new THREE.Vector3(0, 0.355, 0.035),
  });
  const head: THREE.BufferGeometry[] = [];
  /*
   * A box, and it was briefly not one. Recording the failure because the reasoning behind it
   * was sound and the result was still worse.
   *
   * The capture showed a hard black rectangle beside the head, and the diagnosis was that a
   * box face has ONE normal, so on a night with 0.14 of ambient and a single lamp its unlit
   * side is not dark, it is black - while the seven-sided cylinders that make up the body
   * ramp across seven values and read as form. Replacing the skull with an eight-sided drum
   * lying nose-to-nape should have fixed exactly that.
   *
   * It made the cat worse. The drum lost the corners, and the corners are what the ears sit
   * on and what gives a cat's head its width at the cheeks; side-on it rendered as a pale
   * horizontal bar with one ear on it. The box went back.
   *
   * And the black rectangle was never the skull. It is the WINDOW - the cat sits on the sill
   * in front of an unlit pane, and what looked like a shading fault on the animal was the
   * dark glass showing between its ear and its shoulder. Diagnosing a lighting problem from
   * a crop of an object, without checking what is behind the object, cost a whole pass.
   */
  const skull = new THREE.BoxGeometry(0.105, 0.085, 0.095);
  head.push(skull);
  const muzzle = new THREE.BoxGeometry(0.055, 0.04, 0.035);
  muzzle.translate(0, -0.018, 0.058);
  head.push(muzzle);

  /*
   * Ears: triangles, and their SPACING is the tell.
   *
   * Set wide, on the corners of the skull rather than on top of it. Ears close together in
   * the middle read as a rabbit or a fox; a cat's are at the outside edges of its head,
   * which is why the classic drawing is a circle with two corners pulled up.
   */
  for (const side of [-1, 1] as const) {
    const ear = new THREE.ConeGeometry(0.028, 0.055, 4);
    ear.rotateY(Math.PI / 4);
    ear.rotateZ(side * 0.22);
    ear.translate(side * 0.042, 0.062, -0.005);
    head.push(ear);
  }
  headNode.add(meshOf('CatHead', mergeGeometries(head, false) ?? head[0], MAT.catFur));

  /**
   * The eyes: unlit, so they hold their brightness whatever the porch light is doing.
   *
   * Their own node each, because blinking scales them and a shared mesh would blink by
   * scaling both about a point between them - which closes them sideways, like a lizard.
   */
  const eyes: ENGINE.MeshNode[] = [];
  for (const side of [-1, 1] as const) {
    /*
     * 12mm, set wide, and standing proud of the skull. Two numbers, both learned the hard way
     * in opposite directions.
     *
     * At 14mm and z 0.05 the eyes measured ZERO pixels: the skull's front face is at 0.0475,
     * so they stood two millimetres out, and from a near-perpendicular view half of each one
     * was buried in the head. Going to 20mm at a 30mm spacing overcorrected into something
     * worse than invisible - two 40mm spheres on a 105mm skull leave a 20mm gap between them,
     * which the pixel grid closes, and the cat rendered wearing a VISOR: one bright bar across
     * its whole face. A machine, not an animal.
     *
     * What matters is not the size, it is the GAP. At 12mm on a 32mm half-spacing the gap is
     * 40mm against a 12mm eye - more than three times - so the grid cannot bridge it at any
     * distance the cat is still visible at. Small and separated beats large and merged, and
     * two dots with dark between them is the whole read.
     *
     * A cat at the edge of a dark frame IS its eyes. Everything else is a silhouette that
     * could be a bag or a plant pot; the two bright chips make it an animal looking at you.
     */
    const iris = new THREE.SphereGeometry(0.012, 6, 5);
    const eye = meshOf(`CatEye${side > 0 ? 'R' : 'L'}`, iris, MAT.catEye);
    eye.position.set(side * 0.032, 0.013, 0.052);
    headNode.add(eye);
    eyes.push(eye);
  }
  root.add(headNode);

  /**
   * The tail, as a chain, curled round the front of the paws.
   *
   * Each segment parented to the one before it, so rotating a joint carries everything
   * beyond it - which is the whole reason a flick travels down a tail instead of the tip
   * moving on its own. Built here rather than as one bent mesh because a static curl is a
   * croissant, and the curl has to be able to leave.
   */
  const tailJoints: ENGINE.SceneNode[] = [];
  let parent: ENGINE.SceneNode = root;
  for (let i = 0; i < TAIL; i++) {
    const joint = ENGINE.SceneNode.create({
      name: `CatTail${i}`,
      position: new THREE.Vector3(0, i === 0 ? 0.09 : 0, i === 0 ? -0.1 : 0.085),
    });
    const segment = new THREE.CylinderGeometry(0.016 - i * 0.002, 0.019 - i * 0.002, 0.09, 5);
    segment.rotateX(Math.PI / 2);
    segment.translate(0, 0, 0.045);
    joint.add(meshOf(`CatTailSeg${i}`, segment, MAT.catFur));
    parent.add(joint);
    tailJoints.push(joint);
    parent = joint;
  }
  // The resting curl: round the outside of the paws and back in.
  const CURL = [0.55, 0.5, 0.45, 0.4];

  /*
   * Three clocks, none of them the same length, and all of them offset at construction.
   *
   * If the tail period divided the head period the cat would develop a rhythm, and a
   * rhythm is the thing that turns an animal back into a machine. These are deliberately
   * awkward numbers.
   */
  let tailTime = range(rng, 0, 6);
  let blinkIn = range(rng, 1.5, 5);
  let blinkFor = 0;
  let lookIn = range(rng, 2, 7);
  let lookAt = 0;
  let looking = 0;

  const idle = (deltaTime: number): void => {
    /*
     * The tail: a wave travelling outward, plus an occasional flick.
     *
     * The base term is small and constant - a sitting cat's tail tip moves even when
     * nothing is happening. The flick is a burst on top of it, and it is stronger at the
     * tip than the base because that is how a whip works.
     */
    tailTime += deltaTime;
    const flick = Math.max(0, Math.sin(tailTime * 0.41) - 0.72) * 3.5;
    for (let i = 0; i < TAIL; i++) {
      const along = i / (TAIL - 1);
      const wave = Math.sin(tailTime * 1.7 - i * 0.9) * (0.03 + along * 0.05);
      const whip = Math.sin(tailTime * 7.5 - i * 1.2) * flick * (0.05 + along * 0.16);
      tailJoints[i].rotation.set(CURL[i] + wave, whip, 0);
    }

    /*
     * The head: still, and then somewhere else.
     *
     * Eased over about a second rather than snapped, because a cat turning its head is
     * smooth and unhurried - and then it stops dead and stays there, which is the half
     * people actually notice. `looking` counts down the move; when it is done the head
     * simply holds until the next decision.
     */
    lookIn -= deltaTime;
    if (lookIn <= 0) {
      lookIn = range(rng, 2.5, 8);
      lookAt = range(rng, -0.7, 0.7);
      looking = 1;
    }
    if (looking > 0) {
      looking = Math.max(0, looking - deltaTime * 1.1);
      const t = 1 - looking;
      const eased = t * t * (3 - 2 * t);
      headNode.rotation.y += (lookAt - headNode.rotation.y) * eased * deltaTime * 6;
      // A small tilt with the turn. A cat that swivels on one axis is a security camera.
      headNode.rotation.z = Math.sin(headNode.rotation.y * 2) * 0.06;
    }

    /*
     * The blink, which is the cheapest life in the file.
     *
     * Scaled on Y only and held for a tenth of a second. Two dots going out and coming back
     * is enough - nobody has ever seen an eyelid on a cat at six metres, but everybody
     * notices when the eyes stop being there for a moment.
     */
    blinkIn -= deltaTime;
    if (blinkIn <= 0) {
      blinkIn = range(rng, 2, 7);
      blinkFor = 0.11;
    }
    if (blinkFor > 0) {
      blinkFor -= deltaTime;
      for (const eye of eyes) eye.scale.set(1, 0.08, 1);
    } else {
      for (const eye of eyes) eye.scale.set(1, 1, 1);
    }
  };

  // Sit it down properly before the first frame, so it is never briefly a starfish.
  idle(0);

  return { root, idle };
}
