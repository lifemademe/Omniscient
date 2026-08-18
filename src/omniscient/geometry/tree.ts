/**
 * One tree, generated - and the reason it is a function now.
 *
 * It was two hundred lines inlined in Adaeze's scene, which was fine while there was one
 * tree in the game and became the wrong shape the moment a second was wanted. Copying it
 * would have meant two trees that start identical and drift, and the interesting parts -
 * the fork geometry, the faceted crown, the bias in the limb lengths - would have had to
 * be fixed twice every time.
 *
 * ## The bias is a parameter, not a constant
 *
 * The neighbour's tree leans over Adaeze's tunnel because that overhang IS her mission: the
 * shade on the failing bank comes from this tree and nothing else. A tree standing by a
 * lake with nothing to overhang should be even. So the direction and the strength of the
 * lean are arguments, and a tree that has no reason to reach anywhere is given none.
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { MAT } from '../art/palette.js';
import { decorMesh as meshOf } from '../art/mesh.js';
import { jitter, range } from '../core/rng.js';

import type { Rng } from '../core/rng.js';

export interface TreeOptions {
  name: string;
  at: THREE.Vector3;
  /** 1 is the neighbour's tree. Scales trunk and limbs together. */
  size: number;
  /** Which way the crown reaches, in radians of swing. */
  leanToward: number;
  /** How hard it reaches. 0 is an even crown. */
  leanBias: number;
  /**
   * Extra limbs crowded onto the reaching side, on top of the six that go all the way round.
   *
   * The six are evenly spaced because that is what makes a trunk look like it is holding
   * something up rather than leaning under it. But a tree that has spent thirty years
   * growing out over a neighbour's ground is THICKER on that side as well as longer, and
   * with only one limb genuinely over the tunnel the crown that the whole request is about
   * was a single arm with a lollipop on the end of it.
   *
   * These are drawn after the six, so a tree that asks for none draws exactly the same
   * random numbers it always did.
   */
  extraToward?: number;
  /**
   * Local x past which a limb counts as overhanging, and gets built as a separate object.
   *
   * The scene needs to cut these off and drop them, which cannot be done to part of a
   * merged mesh. Expressed as a distance from the trunk rather than a count, so the split
   * is decided by where the foliage ACTUALLY ends up rather than by which index it had -
   * change a length or a lean and the right limbs still go in the right group.
   */
  overhangPast?: number;
}

export interface GeneratedTree {
  root: ENGINE.SceneNode;
  /** The canopy on its own, so a scene can animate it being cut back. */
  crown: ENGINE.MeshNode;
  /**
   * The limbs that reach past `overhangPast`, one node each, ready to be cut off.
   *
   * ONE NODE PER LIMB rather than one node for the lot, and the difference is not
   * bookkeeping. Each node's origin is that limb's own fork - where a saw would go - so
   * rotating it is a hinge at the cut. Rotating a single merged group can only ever apply
   * one angle to limbs that left the trunk at anything from 21 to 66 degrees, so the
   * steep ones stay steep: measured, a rigidly-posed group lands as a 3.9m-tall mass that
   * still pokes through the tunnel hoops. Separately they lie down.
   *
   * `direction` is the limb's own axis in tree space, so a scene can work out the
   * rotation that lays THAT limb flat instead of guessing an angle for all of them.
   */
  cutLimbs: CutLimb[];
}

export interface CutLimb {
  /** Origin at the fork. Its geometry is stored relative to that point. */
  node: ENGINE.SceneNode;
  /** Unit vector along the limb, in tree space. */
  direction: THREE.Vector3;
}

export function buildTree(rng: Rng, options: TreeOptions): GeneratedTree {
  const treeRoot = ENGINE.SceneNode.create({
    name: options.name,
    position: options.at.clone(),
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

  const lower = section(0.21, 0.34, 1.85 * options.size, 0.09, new THREE.Vector3(0, 0.05, 0));
  trunkParts.push(lower.geometry);
  /**
   * The joint, straightened.
   *
   * It used to go from 0.09 of tilt to 0.23 and step sideways by 2cm as it did it - eight
   * degrees of bend and a lateral offset at the same point, which is the difference between
   * a trunk that leans and a trunk that has been broken and badly set. A tree does change
   * angle up its length, but across a joint you can see, not at one.
   *
   * 0.15 keeps the lean the silhouette wanted and halves the kink; the offset is now purely
   * vertical, so the sections overlap into each other instead of beside each other.
   */
  const upperFrom = lower.top.clone().add(new THREE.Vector3(0, -0.12, 0));
  const UPPER_BASE = 0.22;
  const UPPER_TOP = 0.115;
  const upper = section(UPPER_TOP, UPPER_BASE, 1.5 * options.size, 0.15, upperFrom);
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
  /**
   * The limbs that reach out over the neighbour's ground, kept apart from each other.
   *
   * `from` is where this one leaves the trunk and `direction` is where it points - the
   * two things a scene needs to hinge it at the cut and lay it down.
   */
  const cutParts: {
    limbs: THREE.BufferGeometry[];
    leaves: THREE.BufferGeometry[];
    from: THREE.Vector3;
    direction: THREE.Vector3;
  }[] = [];
  const UP = new THREE.Vector3(0, 1, 0);
  const Z_AXIS = new THREE.Vector3(0, 0, 1);
  const Y_AXIS = new THREE.Vector3(0, 1, 0);
  const extra = options.extraToward ?? 0;
  for (let i = 0; i < 6 + extra; i++) {
    /**
     * Everything this limb is made of, held aside until its tip is known.
     *
     * A limb, its two secondaries and their five leaf clusters are one branch and have to
     * be cut as one - so they are collected here and posted to whichever bucket the tip
     * turns out to belong in, at the bottom of the loop.
     */
    const limbParts: THREE.BufferGeometry[] = [];
    const leafParts: THREE.BufferGeometry[] = [];
    /** True for the limbs crowded onto the reaching side rather than spaced round it. */
    const reaching = i >= 6;
    /*
     * Negative, for the reason spelled out on `section` above - and this one was doing
     * real damage rather than a cosmetic one. With a positive lean every limb reached out
     * to -x, which is AWAY from the tunnel, so the crown of the tree the whole request is
     * about sat over open field while the shade it is supposed to be casting lay on the
     * seedlings four metres away. The original hand-placed canopy coordinates were at +x
     * and had been quietly disagreeing with the branches holding them since the scene was
     * written; nobody could see it against a black background.
     */
    /**
     * Round the trunk, not all down one side.
     *
     * The swing used to run -0.62 to +0.68 - about seventy degrees of spread - and the lean
     * was negative for every limb, so all six went the same way and the crown hung off one
     * shoulder like a windsock. A tree puts branches all the way round; that is what makes
     * a trunk look like it is holding something up rather than leaning under it.
     *
     * The bias is kept, though, and deliberately: limbs pointing towards the beds are
     * longer, so the crown still reaches over the tunnel. That overhang is the mission - the
     * shade on the failing bank comes from THIS tree - and a perfectly symmetrical canopy
     * would quietly delete the reason for the whole request.
     */
    const swing = reaching
      ? options.leanToward + jitter(rng, 0.62)
      : (i / 6) * Math.PI * 2 + jitter(rng, 0.3);

    /**
     * Low branches lie down, high branches reach up.
     *
     * Every limb used to leave the trunk at the same 25-to-39 degree lean, which is why the
     * crown read as a bundle of sticks all going one way. A real tree is a record of its own
     * history: the bottom branches are the oldest, they have been carrying their own weight
     * for decades and have settled towards horizontal, and they are long because they have
     * had the most time to grow. The ones at the top are the newest, still climbing for
     * light, and short.
     *
     * So lean is a function of HEIGHT rather than a constant with noise on it. `up` already
     * says where on the trunk this limb emerges, so the same number that places the fork
     * decides how far over it lies - the two cannot disagree.
     *
     * At the bottom that is about 66 degrees off vertical, nearly a horizontal bough; at the
     * top about 21, a shoot. That spread is the whole difference between a tree and a broom.
     */
    // The extras spread over the same span of trunk as the six, so they fork in among
    // them rather than all leaving from one collar.
    const up = reaching ? 0.38 + ((i - 6) / Math.max(1, extra - 1)) * 0.5 : 0.34 + i * 0.12;
    const age = 1 - (up - 0.34) / 0.6;
    const lean = -(0.37 + age * 0.78 + range(rng, 0, 0.12));

    const towardBeds = Math.max(0, Math.cos(swing - options.leanToward)) * options.leanBias;
    // Older limbs are longer, for the same reason they are lower.
    const length =
      (2.0 + towardBeds * 0.85) * (0.82 + age * 0.36) * range(rng, 0.92, 1.06) * options.size;

    // geometry.rotateZ then .rotateY composes as Ry * Rz, so the direction has to be
    // built in the same order or the foliage lands somewhere the branch never went.
    const dir = UP.clone().applyAxisAngle(Z_AXIS, lean).applyAxisAngle(Y_AXIS, swing);

    /**
     * Each limb leaves the trunk on the side it is heading for.
     *
     * All six used to start inside a 15cm span on the trunk's own centre line, which builds
     * an umbrella: six ribs from one point, spreading only at the tips. A tree does the
     * opposite - branches leave at different heights and each one leaves from the side of
     * the trunk it grows towards, so the join reads as a fork rather than as a socket.
     *
     * Both numbers are now derived from the trunk rather than typed next to it: the height
     * is a fraction along the upper section, and the radial offset uses that section's own
     * taper at that height. The limb cannot start inside the wood or float off it, and it
     * cannot drift if the trunk is ever re-proportioned.
     */
    const girth = UPPER_BASE + (UPPER_TOP - UPPER_BASE) * up;
    // The limb's horizontal heading, which is where on the trunk it should emerge.
    const out = new THREE.Vector3(Math.cos(swing), 0, -Math.sin(swing));
    const from = upperFrom
      .clone()
      .lerp(upper.top, up)
      .addScaledVector(out, girth * 0.72);

    const limb = new THREE.CylinderGeometry(0.045, 0.1, length, 6);
    limb.rotateZ(lean);
    limb.rotateY(swing);
    const mid = from.clone().addScaledVector(dir, length / 2);
    limb.translate(mid.x, mid.y, mid.z);
    limbParts.push(limb);

    /**
     * Secondary forks, and clusters where they end.
     *
     * The tree used to be six limbs with two spheres each, and it read as a lollipop -
     * because that is what it was. A tree is recognisable from its FORKS: a limb that
     * divides, and divides again, with foliage only at the ends. Smooth spheres hung along
     * a straight branch cannot suggest that however many you add.
     *
     * So each limb splits near its end into two shorter, thinner branches, and the leaves
     * hang off those instead. Faceted clusters rather than spheres - a 20-triangle
     * icosahedron, non-uniformly scaled and turned - which gives the chunky angular
     * silhouette this game's whole art direction is built on and costs less than the
     * spheres it replaces.
     */
    const forkAt = from.clone().addScaledVector(dir, length * 0.62);

    const leafCluster = (centre: THREE.Vector3, radius: number): void => {
      const blob = new THREE.IcosahedronGeometry(radius, 0);
      // Squashed and turned, so eighteen clusters are not eighteen copies of one ball.
      blob.scale(range(rng, 0.85, 1.25), range(rng, 0.7, 0.95), range(rng, 0.85, 1.25));
      blob.rotateY(range(rng, 0, Math.PI * 2));
      blob.rotateX(jitter(rng, 0.5));
      blob.translate(centre.x, centre.y, centre.z);
      leafParts.push(blob);
    };

    for (const side of [-1, 1] as const) {
      // Opening out and lifting: a secondary branch is always closer to horizontal than
      // the limb it came off, which is what makes a crown spread rather than spike.
      const lean2 = lean - side * range(rng, 0.16, 0.34) - 0.1;
      const swing2 = swing + side * range(rng, 0.34, 0.6);
      const length2 = length * range(rng, 0.38, 0.52);
      const dir2 = UP.clone().applyAxisAngle(Z_AXIS, lean2).applyAxisAngle(Y_AXIS, swing2);

      const twig = new THREE.CylinderGeometry(0.022, 0.045, length2, 5);
      twig.rotateZ(lean2);
      twig.rotateY(swing2);
      const mid2 = forkAt.clone().addScaledVector(dir2, length2 / 2);
      twig.translate(mid2.x, mid2.y, mid2.z);
      limbParts.push(twig);

      /**
       * Two clusters per secondary, not one.
       *
       * With foliage only at the very tips the crown came out thin and rode up above the
       * frame - a ring of separate lumps on the ends of sticks, with sky between them. A
       * canopy needs an interior. The second cluster sits back along the branch so the
       * crown has mass between its edges, which is also what stops the light finding gaps
       * straight through it.
       */
      leafCluster(forkAt.clone().addScaledVector(dir2, length2 * 1.02), 0.66 - i * 0.02);
      leafCluster(forkAt.clone().addScaledVector(dir2, length2 * 0.5), 0.54 - i * 0.02);
    }

    // And one at the end of the limb itself, so the fork is inside the crown rather than
    // poking out of the front of it.
    leafCluster(from.clone().addScaledVector(dir, length * 1.04), 0.76 - i * 0.03);
    // And one at the fork itself, which is where a real crown is thickest.
    leafCluster(forkAt.clone().addScaledVector(dir, 0.12), 0.6 - i * 0.02);

    /*
     * And now the only decision that needed the whole limb built first.
     *
     * The test is on the TIP, in the tree's own space, so it asks the question the scene
     * actually cares about - does this branch end up over the tunnel - rather than
     * guessing from the swing. A limb angled the right way but too short to get there is
     * not the neighbour's problem and does not get cut.
     */
    const tip = from.clone().addScaledVector(dir, length * 1.04);
    const overhanging = options.overhangPast !== undefined && tip.x > options.overhangPast;
    if (overhanging) {
      cutParts.push({ limbs: limbParts, leaves: leafParts, from, direction: dir.clone() });
    } else {
      limbs.push(...limbParts);
      canopy.push(...leafParts);
    }
  }
  treeRoot.add(meshOf('TreeLimbs', mergeGeometries(limbs, false) ?? limbs[0], MAT.timberDark));

  const crown = meshOf('TreeCrown', mergeGeometries(canopy, false) ?? canopy[0], MAT.leafDeep);
  treeRoot.add(crown);

  /**
   * The overhanging limbs, each moved onto its own origin at its own fork.
   *
   * Everything so far is built in the tree's space, so this geometry is three metres out
   * from the trunk and two up. A node whose origin is still the tree's base pivots about
   * the ROOTS - which is exactly what made cutting the branches back look like the crown
   * sliding round behind the trunk, because it was rotating about a point four metres
   * away from itself.
   *
   * Translating each limb's geometry back by its own fork and putting its node there
   * moves nothing on screen and changes everything about how it can animate.
   */
  const cutLimbs: CutLimb[] = cutParts.map((part, index) => {
    const at = part.from;
    for (const geometry of [...part.limbs, ...part.leaves]) {
      geometry.translate(-at.x, -at.y, -at.z);
    }
    const node = ENGINE.SceneNode.create({
      name: `${options.name}Cut${index}`,
      position: at.clone(),
    });
    node.add(
      meshOf(`Cut${index}Limb`, mergeGeometries(part.limbs, false) ?? part.limbs[0], MAT.timberDark)
    );
    if (part.leaves.length > 0) {
      node.add(
        meshOf(
          `Cut${index}Leaves`,
          mergeGeometries(part.leaves, false) ?? part.leaves[0],
          MAT.leafDeep
        )
      );
    }
    treeRoot.add(node);
    return { node, direction: part.direction };
  });

  return { root: treeRoot, crown, cutLimbs };
}
