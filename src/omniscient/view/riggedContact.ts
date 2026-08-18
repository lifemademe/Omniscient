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

import { loadGesture, type GestureName } from './gestures.js';

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
  pole?: THREE.Vector3,
  rest?: Record<string, THREE.Quaternion>,
  /**
   * How much of the solve to apply, 0 to 1.
   *
   * Exists so a gesture can take the arms off the IK without either of them winning
   * outright. At 1 this is the old behaviour exactly; below it, the solved pose is slerped
   * back toward whatever the clip had just written, which is the pose the gesture wants.
   *
   * A blend rather than a switch because the alternative was visible: dropping the IK on
   * the frame a gesture starts snaps a hand off the bench, and restoring it on the frame
   * one ends snaps it back. Both read as a glitch on a person.
   */
  weight = 1
): number {
  const [upperName, foreName, handName] = CHAIN[side];
  const upper = bones[upperName];
  const fore = bones[foreName];
  const hand = bones[handName];
  if (!upper || !fore || !hand) return Number.NaN;
  if (weight <= 0) return Number.NaN;

  // The clip's own pose, captured before the solver overwrites it - this is what a partial
  // weight blends back toward, and the mixer has just written it this frame.
  const clipPose =
    weight < 1
      ? {
          upper: upper.quaternion.clone(),
          fore: fore.quaternion.clone(),
          hand: hand.quaternion.clone(),
        }
      : null;

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

  /**
   * And the wrist goes back to rest.
   *
   * The clip writes the hand's local rotation every frame for a pose where the arm hangs
   * at the side. Once the forearm has been re-aimed, that same angle is nonsense - it was
   * relative to an arm that is no longer there - and it showed up as Sanda's hand folded
   * back on itself at ninety degrees.
   *
   * Restoring the file's own rest rotation makes the hand simply continue the forearm,
   * which is what a wrist does when somebody is holding something rather than gesturing.
   */
  const restHand = rest?.[handName];
  if (restHand) {
    hand.quaternion.copy(restHand);
    hand.updateMatrixWorld(true);
  }

  if (clipPose) {
    upper.quaternion.slerp(clipPose.upper, 1 - weight);
    fore.quaternion.slerp(clipPose.fore, 1 - weight);
    hand.quaternion.slerp(clipPose.hand, 1 - weight);
    upper.updateMatrixWorld(true);
  }

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
  // The node's +Z, which is the direction these characters actually face - see the note
  // about the half turn in placeRigged for how that was established.
  const facing = root.getWorldDirection(new THREE.Vector3());
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
   * Each bone's local rotation as the file shipped it, captured before any clip has run.
   *
   * Needed for the wrist. The arm solve re-aims the forearm, but the hand's own rotation
   * keeps coming from the idle clip - which authored it for an arm hanging at the side.
   * Applied to a forearm pointing somewhere else that angle is a right-angle kink, which
   * is exactly what it looked like on Sanda.
   */
  rest: Record<string, THREE.Quaternion>;
  /**
   * Advance the clip, then put the hands back.
   *
   * Registered as a prop idle. The ORDER is the entire point: a clip writes every bone it
   * animates, every frame, so IK solved once at load is gone by the next tick. Posing on
   * top of the clip rather than instead of it is what lets a character breathe and still
   * be holding something.
   */
  idle: (deltaTime: number) => void;
  /**
   * Play a one-shot gesture over the idle. See gestures.ts.
   *
   * The contact keeps breathing underneath and the hand targets are released for the
   * duration, so somebody told to point at a set does not point at it while still holding
   * the bench.
   */
  gesture: (name: GestureName) => void;
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

  /**
   * The gesture currently playing, and how much of the hands it has taken over.
   *
   * `hold` runs 0 to 1 and is what the IK is scaled against. A gesture that seized the
   * arms instantly would snap a hand off the bench in one frame, and a gesture that never
   * released them would be a person pointing while still holding the table - so the
   * takeover is a ramp in both directions and the IK is blended out rather than switched.
   */
/** Seconds for a gesture to take the arms off their targets. Matches its own fade-in. */
const TAKE = 0.25;

/**
 * Seconds for the arms to come back.
 *
 * One number for three things that used to be three: the clip's fade-out, the
 * breathing loop's fade-in, and the IK ramp. They were 0.3, 0.3 and 0.42, so the
 * hand was still travelling under its own steam for a tenth of a second after the
 * clip that had been holding it let go - a kink partway through the move, on top of
 * the ends being linear. Landing them together is most of what makes this one
 * motion instead of three overlapping ones.
 *
 * Longer than the 0.42 it replaces because it is a long way from pointing at a
 * radio to flat on a bench, and that travel was being done in under half a second.
 */
const RELEASE = 0.5;
  let gestureAction: THREE.AnimationAction | null = null;
  /** A finished one-shot, still fading down. Stopped once it reaches zero - see release. */
  let fading: THREE.AnimationAction | null = null;
  let fadeLeft = 0;
  let gestureLeft = 0;
  let hold = 0;
  /**
   * Whether the gesture now playing is allowed to take the hands off their targets.
   *
   * Reported on Ileana: she spreads her hands when her request is solved, which is
   * the nod clip's arms playing back on a woman whose whole pose is two hands flat on
   * a table. A gesture suspends the hand IK entirely, so for the length of the clip
   * she stops holding the table and does whatever a Mixamo actor with nothing in
   * front of them does.
   *
   * Which is right for a point - the arm IS the gesture - and for a recoil, where the
   * whole body goes. It is wrong for a nod, because nodding is a head, and nobody
   * lifts their hands off a table to agree with somebody.
   */
  let gestureTakesHands = true;

  /**
   * The breathing loop, and the flag that says whether it is currently in charge.
   *
   * Measured off a capture rather than reasoned about, after one wrong diagnosis. In the
   * region of frame Mirela occupies, the recording changes by 8 to 13 pixels a frame
   * before a gesture - that is her breathing - and by 0 to 2 afterwards. The idle does
   * not come back. Everything else about the sequence was correct: the point plays, the
   * arm returns, and then she is a photograph.
   *
   * The first theory was that the gesture moves bones the idle never writes, so they keep
   * the clip's last value with nobody to take them back. It is a real failure mode and it
   * is not this one: the GLB's idle carries 65 rotated bones, which is the whole skeleton
   * including the head and neck that visibly stay thrown back. Something was holding them
   * rather than nothing driving them.
   */
  let baseAction: THREE.AnimationAction | null = null;
  /**
   * Put the idle back, without asking three.js nicely.
   *
   * The gesture used to be faded out and the breathing loop faded in, which is the
   * textbook crossfade and left her a photograph: measured off a capture, her region of
   * frame changes by 8 to 13 pixels a frame while she breathes and by 0 to 2 after any
   * gesture. The loop never came back. Rather than keep bisecting whose weight
   * bookkeeping was wrong, this states the ending outright - stop the one-shot, and put
   * the loop back at full weight, playing.
   *
   * `stop()` rather than `fadeOut()` on the gesture is the load-bearing half. A LoopOnce
   * action with `clampWhenFinished` holds its last frame and stays bound; stopping it
   * unbinds it, which is what lets go of the head and neck that were staying thrown back
   * long after the arm had come home.
   *
   * It is allowed to be this blunt because of where the camera is. Her hands are behind
   * her own bench and the shot is chest-up; the only part of the release anybody can see
   * is the head and shoulders settling, and those are on the idle either way.
   */
  /** The breathing loop, at full weight, playing, whatever state it was left in. */
  const holdIdle = (): void => {
    if (!baseAction) return;
    baseAction.enabled = true;
    baseAction.paused = false;
    if (!baseAction.isRunning()) baseAction.play();
  };

  /**
   * Hand the body back to the idle.
   *
   * Two rules, and the T-pose reported after a point came from breaking the first one.
   *
   * 1. THE WEIGHTS MUST ALWAYS SUM TO ONE. three.js does not leave a bone alone when the
   *    actions driving it add up to less than that - PropertyMixer lerps the remainder
   *    toward the value it captured when the binding was made, which for a skinned mesh
   *    is the bind pose. So any window where the gesture has been taken away and the
   *    idle has not yet been given back is not a gap, it is a T-pose, weighted by
   *    exactly how big the shortfall is. The previous version zeroed the idle outright
   *    when a gesture began and restored it on release; the half second the player saw
   *    was that shortfall being blended in and out. Crossfading both ways keeps the sum
   *    at one throughout.
   *
   * 2. THE ONE-SHOT MUST BE STOPPED, not merely faded. A LoopOnce action with
   *    clampWhenFinished holds its last frame and stays BOUND at zero weight, which is
   *    what kept her head thrown back for six seconds after the arm had come home.
   *    Fading alone was the previous bug; stopping during the fade is what caused this
   *    one. It has to be both, in that order.
   */
  const release = (): void => {
    if (!gestureAction) return;
    holdIdle();
    if (baseAction) gestureAction.crossFadeTo(baseAction, RELEASE, false);
    else gestureAction.fadeOut(RELEASE);
    fading = gestureAction;
    fadeLeft = RELEASE;
    gestureAction = null;
  };

  const contact: RiggedContact = {
    root,
    bones: {},
    rest: {},

    /**
     * Play a one-shot over the idle.
     *
     * Crossfaded rather than swapped: the idle keeps running underneath, so when the
     * gesture finishes the character is already breathing again instead of arriving back
     * at a T-pose for a frame. `clampWhenFinished` holds the last frame while the fade
     * out happens, which is what stops the arm dropping before the blend has finished.
     *
     * Async because the clip is fetched on demand - a mission that never asks anybody to
     * point never downloads the pointing. The first use of each gesture is a beat late by
     * however long the file takes; every use after that is instant, since the clip is
     * cached across all seven contacts.
     */
    gesture: (name) => {
      gestureTakesHands = name !== 'nod';
      void loadGesture(name).then((clip) => {
        if (!clip || !mixer) return;
        // Anything still on its way out goes now - two one-shots fading at once is a
        // sum below one again, which is the same T-pose by another route.
        gestureAction?.stop();
        fading?.stop();
        fading = null;
        fadeLeft = 0;
        holdIdle();

        const action = mixer.clipAction(clip);
        action.reset();
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.play();
        action.setEffectiveWeight(0);
        // Idle 1 -> 0 and the clip 0 -> 1 over the same quarter second, so the two
        // always add to one and nothing is ever left to the bind pose.
        if (baseAction) baseAction.crossFadeTo(action, TAKE, false);
        else action.fadeIn(TAKE);
        gestureAction = action;
        gestureLeft = clip.duration;
      });
    },


    idle: (deltaTime: number) => {
      if (mixer) mixer.update(deltaTime);

      /*
       * Unbind the finished one-shot, but only once it is genuinely at zero.
       *
       * Stopping it any earlier removes weight the idle has not taken up yet, and
       * the shortfall is drawn as the bind pose. This is the half second.
       */
      if (fadeLeft > 0) {
        fadeLeft -= deltaTime;
        if (fadeLeft <= 0) {
          fading?.stop();
          fading = null;
          holdIdle();
        }
      }

      if (gestureLeft > 0) {
        gestureLeft -= deltaTime;
        // Only ramps for a gesture that owns the arms - see gestureTakesHands. A nod
        // leaves this at zero, so the IK below keeps running underneath the clip and
        // the hands stay where the scene put them while the head does the work.
        if (gestureTakesHands) hold = Math.min(1, hold + deltaTime / TAKE);
        if (gestureLeft <= 0) release();
      } else if (hold > 0) {
        hold = Math.max(0, hold - deltaTime / RELEASE);
      }
      /*
       * Then the hands, on top of whatever the clip just did to the arms - except while a
       * gesture owns them. The ORDER is still the point (see the interface note): the
       * mixer writes every bone it animates every frame, so IK has to run after it or it
       * is gone by the next tick.
       */
      if (hold >= 1) return;
      for (const named of ['left', 'right'] as const) {
        const target = options.handsOn?.[named];
        if (target) {
          reachFor(
            contact.bones,
            sideFor[named],
            target,
            poleFor(root, sideFor[named]),
            contact.rest,
            /*
             * Eased, and this is the whole of the reported roughness.
             *
             * The weight was `1 - hold` off a linear ramp, so the hand left the
             * clip's pose at full speed on the first frame of the release and
             * arrived at the bench at full speed on the last. A blend with a
             * velocity step at each end reads as two snaps with a slide between
             * them, which is exactly what a hand coming off a point looked like.
             *
             * Smoothstep starts and ends at zero velocity, so it leaves the
             * gesture and settles onto the bench instead of being switched
             * between them.
             */
            1 - hold * hold * (3 - 2 * hold)
          );
        }
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
        const key = boneKey(child.name);
        contact.bones[key] = child;
        // Before the mixer exists, so this is the file's own rest pose.
        contact.rest[key] = child.quaternion.clone();
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
     * NOT turned. The half turn that used to be here was wrong, and the reasoning that put
     * it there was wrong twice over.
     *
     * I assumed the generator builds people facing -Z and that Mixamo faces +Z, and called
     * three separate arm complaints one convention mismatch. Working it from an actual
     * placement says otherwise: Mirela stands at rotation 0.58*PI with her hand targets at
     * +x of her. A character facing -Z at that rotation points to -x - away from the thing
     * it is reaching for - and one facing +Z points straight at it.
     *
     * So the generator's people face +Z, the models already agreed, and the flip is what
     * turned her to face the shelf with her arms stretched back to the bench behind her.
     * The bug it was supposed to fix was the elbow pole, which is fixed separately and
     * properly.
     */
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
        /*
         * Held, because a gesture has to be able to get it out of the way.
         *
         * This played at full weight forever and nothing ever turned it down, so a
         * gesture was a SECOND action writing the same bones at the same weight - and
         * three.js blends actions on shared tracks by weight, which makes the result
         * the average of the two. Every gesture in the game was playing at half
         * strength against a breathing loop, which is why the point did not look like
         * a point: it was a point and an idle, halfway between, with the arms drifting
         * outward to somewhere neither clip ever goes.
         */
        baseAction = mixer.clipAction(wanted);
        baseAction.play();
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

    /**
     * Stand where the work is.
     *
     * Every hand target in this game was authored against the generator, whose arm length
     * is a function of height. A real skeleton has real proportions - these come out about
     * 8% shorter in the arm with the shoulder in a different place - so a target that the
     * generated contact reached comfortably can be simply out of range for the modelled
     * one. Vasile's hands hung at his sides while the pipe run he is supposed to be working
     * on sat a hand's width beyond them.
     *
     * The obvious fix is to nudge each of the seven by hand until it looks right. That is
     * seven numbers found by eye, and every one of them silently wrong again the next time
     * a model is re-exported or a bench moves.
     *
     * So it is measured instead: how far short is the worst arm, and step that far towards
     * the work. A person who cannot quite reach something does exactly this, which is why
     * it does not read as a fudge - it reads as somebody standing at a bench.
     *
     * Clamped, because a large step means the placement is wrong rather than the
     * proportions, and quietly walking a contact across their own set would hide a real
     * authoring mistake behind a plausible-looking pose.
     */
    const STEP_LIMIT = 0.4;
    let shortfall = 0;
    const wanted = new THREE.Vector3();
    let wantedCount = 0;

    for (const named of ['left', 'right'] as const) {
      const target = options.handsOn?.[named];
      if (!target) continue;
      const arm = armReach(contact.bones, sideFor[named]);
      if (!arm) continue;
      shortfall = Math.max(shortfall, arm.shoulderAt.distanceTo(target) - arm.reach);
      wanted.add(target);
      wantedCount++;
    }

    if (shortfall > 0.01 && wantedCount > 0) {
      wanted.divideScalar(wantedCount);
      // Horizontal only. Sinking a character into the floor to reach a high shelf, or
      // floating them to reach a low one, would be a worse answer than not reaching.
      const step = wanted.clone().sub(root.position);
      step.y = 0;
      if (step.lengthSq() > 1e-6) {
        root.position.addScaledVector(step.normalize(), Math.min(shortfall + 0.02, STEP_LIMIT));
        root.updateMatrixWorld(true);
      }
    }

    const reached: string[] = [];
    for (const named of ['left', 'right'] as const) {
      const target = options.handsOn?.[named];
      if (!target) continue;
      const side = sideFor[named];
      const arm = armReach(contact.bones, side);
      const miss = reachFor(contact.bones, side, target, poleFor(root, side), contact.rest);
      const need = arm ? arm.shoulderAt.distanceTo(target) : Number.NaN;
      reached.push(
        `${named}->${side} ${miss.toFixed(2)}off arm${(arm?.reach ?? 0).toFixed(2)}`
      );
    }
    if (reached.length) {
      // Printed on purpose: the result of this experiment is a number, and a number that
      // only exists inside the running game is a number nobody can act on.
      console.log(
        `[rigged] ${name} bones=${Object.keys(contact.bones).length} ` +
          `stepped=${shortfall > 0.01 ? Math.min(shortfall + 0.02, STEP_LIMIT).toFixed(2) : '0'} ` +
          reached.join(', ')
      );
    }
  });

  return contact;
}
