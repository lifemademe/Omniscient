/**
 * A rigged character, posed onto this game's authored hand targets.
 *
 * ## What this is testing
 *
 * Every contact in OMNISCIENT_ is POSED rather than animated. Mirela's hand is on the
 * connector, Vasile's on the pipe run, Sanda grips a torch that swings and carries its own
 * light - and those are world-space coordinates the missions author, checked against arm
 * length by scripts/dev/reach.py. The procedural character generator solves arms to them.
 *
 * A Mixamo clip knows none of that. It knows how a person stands, not where the connector
 * is. So the question that decides whether external characters are usable here is narrow
 * and answerable: can a rigged skeleton be bent so its hand lands on a coordinate this
 * game already authors?
 *
 * ## Why there is a solver in here at all
 *
 * Because the engine has none. There is a full animation stack - Mixamo skeleton profiles,
 * retargeting, clip caching - and no inverse kinematics anywhere in it. That is not an
 * oversight; clips and IK solve different problems. But it does mean posing a rigged arm
 * is code somebody has to write, and this is the smallest honest version of it.
 *
 * ## Why CCD rather than an analytic two-bone solve
 *
 * The closed-form solution is exact and needs the bind-pose axes to be known and correct.
 * Cyclic coordinate descent needs nothing but positions: point the last joint at the
 * target, then its parent, and repeat. For a two-bone chain it converges in a handful of
 * passes, it degrades sensibly when the target is out of reach (the arm simply extends
 * towards it), and - the deciding reason - it cannot silently produce a plausible-looking
 * wrong answer because of a bone-orientation assumption that happened not to hold for this
 * particular export.
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

/**
 * Mixamo names its bones consistently. three.js then renames them.
 *
 * The rig ships `mixamorig:LeftArm`, and GLTFLoader runs every node name through
 * `PropertyBinding.sanitizeNodeName`, whose reserved set is `[].:/ ` - so the colon is
 * STRIPPED and the bone arrives as `mixamorigLeftArm`. Matching on the name as authored
 * finds nothing, the solver gets no chain, and the character stands in its bind pose
 * looking for all the world like an IK bug.
 *
 * So everything is compared with punctuation and case removed. That also survives the next
 * exporter, which will have its own opinion about separators.
 */
const CHAIN = {
  left: ['leftarm', 'leftforearm', 'lefthand'],
  right: ['rightarm', 'rightforearm', 'righthand'],
} as const;

/** Strip everything that is not a letter or digit, and lower-case what is left. */
function boneKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^mixamorig/, '');
}

export interface RiggedOptions {
  /** Name of the clip to play, or true for the first one the file happens to carry. */
  clip?: string | true;
  modelUrl: string;
  position: THREE.Vector3;
  rotation?: THREE.Euler;
  /** Metres. The model is scaled to this so it stands beside the procedural cast. */
  height: number;
  /** The same world-space targets the procedural generator is given. */
  handsOn?: { left?: THREE.Vector3; right?: THREE.Vector3 };
  /** Draw a marker at each target, so a screenshot shows whether the hand arrived. */
  showTargets?: boolean;
}

/**
 * Swing one joint so the end of its chain points at the target.
 *
 * The whole of CCD, in one function. Everything is done in world space and converted back
 * through the parent's inverse - a joint's local rotation means nothing without knowing
 * what it hangs off, and getting that conversion wrong is the classic way an IK rig ends
 * up looking almost right.
 */
function swingToward(joint: THREE.Object3D, effector: THREE.Object3D, target: THREE.Vector3): void {
  const jointAt = joint.getWorldPosition(new THREE.Vector3());
  const effectorAt = effector.getWorldPosition(new THREE.Vector3());

  const toEffector = effectorAt.sub(jointAt).normalize();
  const toTarget = target.clone().sub(jointAt).normalize();
  if (toEffector.lengthSq() === 0 || toTarget.lengthSq() === 0) return;

  const swing = new THREE.Quaternion().setFromUnitVectors(toEffector, toTarget);
  const worldQuaternion = joint.getWorldQuaternion(new THREE.Quaternion());
  const wanted = swing.multiply(worldQuaternion);

  const parentQuaternion = joint.parent
    ? joint.parent.getWorldQuaternion(new THREE.Quaternion())
    : new THREE.Quaternion();
  joint.quaternion.copy(parentQuaternion.invert().multiply(wanted));
  joint.updateMatrixWorld(true);
}

/**
 * Put a hand on a point, with the elbow where an elbow goes.
 *
 * ## Why this is not CCD any more
 *
 * Cyclic descent finds A solution and has no opinion about which. A two-bone chain reaching
 * a point has a whole CIRCLE of them - the elbow can be anywhere on a ring around the
 * shoulder-to-target axis - and CCD lands on whichever is nearest where it started. That
 * produced exactly what you would predict once the rigs arrived: Vasile facing the camera
 * with his hand pointing behind him, Mirela's elbows bent backwards, Sanda's torch arm
 * aimed the opposite way to her body.
 *
 * The seeding made it worse rather than better. It set rotations in the BONE's local space,
 * and a Mixamo arm bone's local axes depend on how the rig was bound - so the same numbers
 * meant a different pose on every character, and the solver was being started from a
 * different random place each time.
 *
 * ## The pole is the fix
 *
 * Solved analytically instead. Given both bone lengths and the distance to the target, the
 * law of cosines gives the elbow angle exactly; the remaining freedom - where on the ring
 * the elbow sits - is resolved by a POLE, a world-space direction the elbow is asked to
 * favour. Human elbows hang down and slightly away from the body, so that is the hint, and
 * because it is expressed in world space it means the same thing on every skeleton
 * regardless of how its bones were bound.
 *
 * Everything is computed as positions and applied through the same swing used before, so no
 * assumption about bind axes survives anywhere in here.
 */
export function reachFor(
  bones: Record<string, THREE.Object3D>,
  side: 'left' | 'right',
  target: THREE.Vector3,
  pole?: THREE.Vector3
): number {
  const [upperName, foreName, handName] = CHAIN[side];
  const upper = bones[upperName];
  const fore = bones[foreName];
  const hand = bones[handName];
  if (!upper || !fore || !hand) return Number.NaN;

  const shoulderAt = upper.getWorldPosition(new THREE.Vector3());
  const elbowAt = fore.getWorldPosition(new THREE.Vector3());
  const handAt = hand.getWorldPosition(new THREE.Vector3());

  const upperLength = shoulderAt.distanceTo(elbowAt);
  const foreLength = elbowAt.distanceTo(handAt);
  if (upperLength < 1e-5 || foreLength < 1e-5) return Number.NaN;

  const toTarget = target.clone().sub(shoulderAt);
  const straightLine = toTarget.length();
  if (straightLine < 1e-5) return Number.NaN;
  const axis = toTarget.clone().divideScalar(straightLine);

  /**
   * Clamped just inside the arm's limits.
   *
   * Exactly straight is a singularity - the elbow ring collapses to a point and the pole
   * stops meaning anything - and beyond reach there is no triangle at all. Staying a
   * hair inside keeps the solve stable and lets an out-of-range target read the way it
   * should: the arm simply extends towards it.
   */
  const span = Math.min(
    Math.max(straightLine, Math.abs(upperLength - foreLength) + 1e-3),
    upperLength + foreLength - 1e-3
  );

  // Law of cosines: the angle between the upper arm and the line to the target.
  const cosShoulder =
    (upperLength * upperLength + span * span - foreLength * foreLength) / (2 * upperLength * span);
  const shoulderAngle = Math.acos(Math.min(1, Math.max(-1, cosShoulder)));

  /**
   * The pole, made perpendicular to the reach axis.
   *
   * Any component along the axis is useless - it cannot say where on the ring the elbow
   * goes - so it is projected out. If what is left is degenerate, because the arm happens
   * to be pointing straight down the pole, a world-forward fallback keeps the elbow
   * somewhere sane rather than wherever floating point lands.
   */
  const hint = (pole ?? new THREE.Vector3(0, -1, 0)).clone();
  const along = axis.clone().multiplyScalar(hint.dot(axis));
  let bend = hint.sub(along);
  if (bend.lengthSq() < 1e-6) {
    bend = new THREE.Vector3(0, 0, 1).sub(axis.clone().multiplyScalar(axis.z));
  }
  bend.normalize();

  const elbowGoal = shoulderAt
    .clone()
    .addScaledVector(axis, Math.cos(shoulderAngle) * upperLength)
    .addScaledVector(bend, Math.sin(shoulderAngle) * upperLength);

  // Upper arm points at where the elbow should be, then the forearm points at the target.
  swingToward(upper, fore, elbowGoal);
  swingToward(fore, hand, target);

  // How far off it finished. Reported rather than assumed - a solver that quietly stops
  // short is exactly the failure this is here to detect.
  return hand.getWorldPosition(new THREE.Vector3()).distanceTo(target);
}

/**
 * Is the target even inside this arm's reach?
 *
 * The distinction that decides whether a miss is a bug or a fact. The solve is exact when
 * the target is reachable, so anything left over is either a rig whose arm is shorter than
 * the one the targets were authored against, or a target somewhere an arm cannot go - and
 * those want completely different responses. Measuring the arm answers it outright.
 */
export function armReach(
  bones: Record<string, THREE.Object3D>,
  side: 'left' | 'right'
): { reach: number; shoulderAt: THREE.Vector3 } | null {
  const [upperName, foreName, handName] = CHAIN[side];
  const upper = bones[upperName];
  const fore = bones[foreName];
  const hand = bones[handName];
  if (!upper || !fore || !hand) return null;

  const a = upper.getWorldPosition(new THREE.Vector3());
  const b = fore.getWorldPosition(new THREE.Vector3());
  const c = hand.getWorldPosition(new THREE.Vector3());
  return { reach: a.distanceTo(b) + b.distanceTo(c), shoulderAt: a };
}

/**
 * Where this character's elbows should hang, in world space.
 *
 * Down, and a little out to the side and behind - which is where a person's elbow goes
 * when they reach for something in front of them. Derived from the node's own facing, so a
 * contact turned to face a different way gets elbows that turn with them rather than a
 * hint that only happened to be right for one rotation.
 */
function poleFor(root: ENGINE.SceneNode, side: 'left' | 'right'): THREE.Vector3 {
  /*
   * Negated, because the model was turned. getWorldDirection gives the node's +Z and the
   * character inside it now looks the other way; a pole built from the wrong forward puts
   * the elbows in front of the body instead of behind it.
   */
  const facing = root.getWorldDirection(new THREE.Vector3()).negate();
  const outward = new THREE.Vector3(0, 1, 0).cross(facing).normalize();
  return new THREE.Vector3(0, -1, 0)
    .addScaledVector(outward, side === 'left' ? 0.45 : -0.45)
    .addScaledVector(facing, -0.3)
    .normalize();
}

export interface RiggedContact {
  root: ENGINE.SceneNode;
  /** Resolved once the mesh has loaded. Empty before that. */
  bones: Record<string, THREE.Object3D>;
  /**
   * Advance the clip, then put the hands back.
   *
   * Registered as a prop idle. The ORDER is the entire point: a clip writes every bone it
   * animates, every frame, so IK solved once at load is gone by the next tick. Posing on
   * top of the clip rather than instead of it is what lets a character breathe and still
   * be holding something.
   */
  idle: (deltaTime: number) => void;
}

/**
 * Load a rigged character, stand it at a height, play its clip, and put its hands where
 * they were told to be - in that order, every frame.
 *
 * The clip and the pose are not alternatives. A Mixamo idle knows how a person stands and
 * nothing about where the photo box is; this game's hand targets know where the box is and
 * nothing about breathing. Running the mixer first and solving the arms afterwards gives
 * both: the body has weight and the hands stay put.
 */
export function placeRigged(name: string, options: RiggedOptions): RiggedContact {
  const root = ENGINE.SceneNode.create({
    name,
    position: options.position.clone(),
    rotation: options.rotation ?? new THREE.Euler(),
  });

  const model = ENGINE.ModelMeshNode.create({
    name: `${name}Model`,
    modelUrl: options.modelUrl,
    useDynamicMaterials: true,
  });
  root.add(model);

  let mixer: THREE.AnimationMixer | null = null;
  /**
   * Which of the rig's arms goes to which target, decided by measurement at load.
   *
   * "Left" is not a fact about a skeleton, it is a label somebody typed. This rig's arms
   * came out crossed - the bone called LeftArm reaching the target called left, and the
   * two ending up on opposite sides of her body - and that can happen for several
   * unrelated reasons: an auto-rigger mirroring a mesh, a generator whose left means the
   * viewer's left, a model authored facing the other way.
   *
   * Rather than pick one explanation and hardcode a swap that is wrong for the next
   * character, the assignment is chosen by which shoulder is actually nearer which target.
   * That is right for every one of those cases and needs no convention to be agreed.
   */
  let sideFor: { left: 'left' | 'right'; right: 'left' | 'right' } = {
    left: 'left',
    right: 'right',
  };

  const contact: RiggedContact = {
    root,
    bones: {},
    idle: (deltaTime: number) => {
      if (mixer) mixer.update(deltaTime);
      // Then the hands, on top of whatever the clip just did to the arms.
      for (const named of ['left', 'right'] as const) {
        const target = options.handsOn?.[named];
        if (target) reachFor(contact.bones, sideFor[named], target, poleFor(root, sideFor[named]));
      }
    },
  };

  if (options.showTargets) {
    /**
     * A marker at every target.
     *
     * The entire question is "did the hand arrive", and that is not answerable from a
     * screenshot of a person standing near a table. Two small spheres make it a yes or no.
     */
    for (const target of [options.handsOn?.left, options.handsOn?.right]) {
      if (!target) continue;
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.03, 8, 6),
        new THREE.MeshBasicMaterial({ color: new THREE.Color('#e0a24c') })
      );
      marker.position.copy(target).sub(options.position);
      root.add(marker);
    }
  }

  model.onMeshLoaded.add(() => {
    // The node IS the loaded subtree's root - `getModel()` is deprecated in favour of
    // using the ModelMeshNode directly, and it is the same object either way.
    const loaded: THREE.Object3D = model;

    /**
     * Scale to the height this game uses, measured rather than guessed.
     *
     * Exporters disagree about units - centimetres, metres, whatever the source tool
     * happened to use - so a hard-coded 0.01 is a coin flip. The bounding box is a fact.
     */
    const box = new THREE.Box3().setFromObject(loaded);
    const measured = box.max.y - box.min.y;
    if (measured > 0.001) {
      const scale = options.height / measured;
      loaded.scale.multiplyScalar(scale);
    }
    loaded.updateMatrixWorld(true);

    loaded.traverse((child) => {
      if (child.type === 'Bone' || /mixamorig/i.test(child.name)) {
        contact.bones[boneKey(child.name)] = child;
      }
    });

    /**
     * Stand it on the floor, and stand it where it was PUT.
     *
     * Two different corrections and the second is the one that mattered. Vertically the
     * feet go on the ground, which any bounding box gives you. Horizontally the mesh has
     * no obligation to be centred on its own origin - this one is not, and generated
     * meshes rarely are - so the figure was offset from the node it hangs off and every
     * hand target was measured from the wrong body. The arm then came up 13cm short of a
     * point it should have reached comfortably, which reads exactly like a broken solver.
     *
     * The hips are the honest centre of a Mixamo rig: they are the skeleton's root, they
     * do not move when the arms do, and unlike a bounding box they are not thrown off by a
     * figure standing with one arm out.
     */
    const standing = new THREE.Box3().setFromObject(loaded);
    loaded.position.y -= standing.min.y - root.position.y;
    loaded.updateMatrixWorld(true);

    /**
     * Turned to face the way this game's characters face.
     *
     * The generator builds people looking down -Z and every placement in the project was
     * authored against that: rotations, hand targets, which way somebody is turned over
     * their shoulder. A Mixamo character looks down +Z. So each rigged contact arrived
     * backwards, and because the hand targets did NOT move with them, every one ended up
     * reaching behind itself - Sanda facing the camera with her arms bent back towards the
     * stalker, Vasile facing out with his hand pointing away, Mirela's elbows inverted.
     *
     * It read as three separate posing bugs and was one convention mismatch. The half turn
     * is applied to the model inside its node, so the node's own rotation still means what
     * the scene author wrote.
     */
    loaded.rotation.y += Math.PI;
    loaded.updateMatrixWorld(true);

    const hips = contact.bones['hips'];
    if (hips) {
      const hipsAt = hips.getWorldPosition(new THREE.Vector3());
      const rootAt = root.getWorldPosition(new THREE.Vector3());
      loaded.position.x -= hipsAt.x - rootAt.x;
      loaded.position.z -= hipsAt.z - rootAt.z;
      loaded.updateMatrixWorld(true);
    }

    if (options.clip) {
      const clips = model.getAnimations();
      /**
       * The LONGEST clip, not the first.
       *
       * This file carries two: `mixamo.com` at 2 keyframes and 0.07s, and
       * `mixamo.com.001` at 181 keyframes and 6.03s. The first is the T-pose that comes
       * with a character downloaded without an animation, and taking clips[0] played it
       * perfectly - a two-frame clip of somebody standing still, looping forever.
       *
       * Mixamo names every clip `mixamo.com` and a round trip through Blender
       * disambiguates by appending .001, so the name carries no information about which
       * one anybody wants. Duration does: a rest pose is a couple of frames and an
       * animation is seconds.
       */
      const wanted =
        options.clip === true
          ? clips.reduce<THREE.AnimationClip | undefined>(
              (best, candidate) =>
                !best || candidate.duration > best.duration ? candidate : best,
              undefined
            )
          : clips.find((candidate) => candidate.name === options.clip);
      if (wanted) {
        mixer = new THREE.AnimationMixer(loaded);
        mixer.clipAction(wanted).play();
      }
      console.log(`[rigged] ${name} clips: ${clips.map((c) => c.name).join(', ') || 'none'}`);
    }

    /**
     * Pair each target with the nearer shoulder before solving anything.
     *
     * Two possible assignments, so this is a comparison rather than a search: whichever
     * pairing gives the smaller total shoulder-to-target distance is the one where the
     * arms do not cross the body.
     */
    const shoulders = {
      left: armReach(contact.bones, 'left')?.shoulderAt,
      right: armReach(contact.bones, 'right')?.shoulderAt,
    };
    const wantLeft = options.handsOn?.left;
    const wantRight = options.handsOn?.right;
    if (shoulders.left && shoulders.right && wantLeft && wantRight) {
      const straight =
        shoulders.left.distanceTo(wantLeft) + shoulders.right.distanceTo(wantRight);
      const crossed =
        shoulders.right.distanceTo(wantLeft) + shoulders.left.distanceTo(wantRight);
      if (crossed < straight) sideFor = { left: 'right', right: 'left' };
    }

    const reached: string[] = [];
    for (const named of ['left', 'right'] as const) {
      const target = options.handsOn?.[named];
      if (!target) continue;
      const side = sideFor[named];
      const arm = armReach(contact.bones, side);
      const miss = reachFor(contact.bones, side, target, poleFor(root, side));
      const need = arm ? arm.shoulderAt.distanceTo(target) : Number.NaN;
      reached.push(
        `${named}->${side} ${miss.toFixed(2)}off arm${(arm?.reach ?? 0).toFixed(2)}`
      );
    }
    if (reached.length) {
      // Printed on purpose: the result of this experiment is a number, and a number that
      // only exists inside the running game is a number nobody can act on.
      console.log(`[rigged] ${name} bones=${Object.keys(contact.bones).length} ${reached.join(', ')}`);
    }
  });

  return contact;
}
