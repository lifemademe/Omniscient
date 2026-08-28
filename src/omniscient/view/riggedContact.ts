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

import { capHighlights, debakeHighlights } from '../art/debake.js';
import { applyShadowPolicy } from '../art/shadows.js';
import { HIPS, loadGesture, type GestureName } from './gestures.js';

import { devLog } from '../core/devLog.js';

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
  /**
   * Settle the wrists back toward the pose the model shipped in.
   *
   * Opt-in, and it has nothing to do with the hand IK - a contact with no `handsOn` never
   * runs a solver at all, so a wrist that looks wrong on one of those is the CLIP's wrist.
   * Reported on Dorin, who has no hand targets by design: the lock is out of his reach from
   * anywhere he can stand, so his arms are pure animation, and the Mixamo idle he shares
   * with the rest of the cast holds its hands at an angle that reads as a break rather than
   * a rest on somebody standing with his arms down.
   *
   * Only the two hand bones, and only partially. The forearm keeps every frame the
   * animator gave it, so the arm still breathes and still gestures; what stops is the last
   * joint being carried somewhere the rest of the body is not going. Blended rather than
   * clamped, because a wrist pinned exactly to rest stops moving and reads as a prosthetic.
   */
  settleWrists?: number;
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
  /** Rest translations used to fit crouch pelvis tracks to each GLB without sinking. */
  restPositions: Record<string, THREE.Vector3>;
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
  /** Blend the base loop between the shipped standing idle and authored crouch idle. */
  setStance: (stance: 'stand' | 'crouch') => void;
  /**
   * Walk somewhere, in the same space `options.position` was given in.
   *
   * The one clip in the game that is not a one-shot, and the only thing that moves a
   * contact's root. `to.y` is ignored - these people walk on the ground.
   *
   * ## Why this is not an idle behaviour
   *
   * The obvious version of this is a patrol on a timer: two points, walk between them
   * forever. It is the wrong shape for this game and it would cost more than it pays.
   * Framing here is owned by the beat (`camera.push-in:neighbour-tree`), so a contact
   * who wanders on a clock is either walking out of a composed shot or dragging the
   * camera after her; arrival gestures fire on beats, so `prop.surprised:contact` would
   * land mid-stride; and a two-waypoint loop watched for four minutes reads as a rail
   * within one cycle. The fiction is against it too - somebody who has phoned for help
   * and is answering questions stands still, and pacing on a schedule reads as not
   * listening.
   *
   * So this is driven by the conversation instead. She walks because the player told her
   * to, once, to somewhere that means something. That cannot read as a loop, and it
   * doubles as confirmation that the instruction landed.
   *
   * `back` gives the A-to-B-to-A shape anyway, for a room that wants it: she stands at B
   * for `dwell` seconds with the breathing loop and her hands back before returning.
   * Ignored while a walk is already running.
   */
  walk: (to: THREE.Vector3, options?: WalkOptions) => void;
}

export interface WalkOptions {
  /** Facing on arrival. Defaults to the direction she travelled - people look where they went. */
  facing?: number;
  /** Return to where she started, and to the heading she had there. */
  back?: boolean;
  /** Seconds standing at the far end before turning back. Only used with `back`. */
  dwell?: number;
  /**
   * How fast she walks, as a multiple of the clip's own pace. 1 is the measured default.
   *
   * Scales the ANIMATION and the travel together, which is the only way to change this
   * without breaking it. WALK_PACE exists because the clip has no hips translation and the
   * root is driven by hand, so there is exactly one travel speed at which the planted foot
   * stays on the ground. Slowing the travel alone makes her moonwalk; slowing the clip
   * alone makes her treadmill. Slowing both by the same factor keeps the foot planted and
   * simply makes her a slower walker.
   *
   * Below about 0.5 the clip starts to read as slow motion rather than as an amble - the
   * arm swing gives it away before the legs do.
   */
  pace?: number;
  /** Locomotion cycle. Pursuit actors use the faster in-place run clip. */
  locomotion?: 'walk' | 'run' | 'crouchWalk';
  /**
   * Abandon a walk already in progress rather than being ignored.
   *
   * For the case where something in the fiction overrides where somebody was going - the
   * follower breaks off while he is still closing in. Without it the second instruction
   * is dropped and he carries on walking toward her, which is the opposite of the beat.
   */
  interrupt?: boolean;
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
 * Seconds for the idle to become a walk, and for the root to get up to speed.
 *
 * Longer than a gesture's takeover, because starting to walk is a bigger change of pose
 * than raising an arm - a quarter second of it read as a snap into the cycle.
 *
 * The same number drives BOTH the crossfade and the acceleration, and that is the whole
 * fix. The root used to leave at full speed the instant the leg was set while the legs
 * were still blending in, so for a quarter second she slid across the floor with a
 * half-formed walk on her - the exact thing WALK_PACE exists to prevent, arriving through
 * the one door it was not guarding. Ramping the travel on the same curve as the blend
 * keeps the foot planted through the transition as well as through the stride.
 */
const WALK_TAKE = 0.42;

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

/**
 * How fast the walk clip actually covers ground, in statures per second.
 *
 * MEASURED, because guessing this is what makes a walking character skate. `Walking.fbx`
 * is an in-place clip - no hips translation track at all - so the root has to be driven
 * by hand, and there is exactly one speed at which that looks like walking: the one where
 * the planted foot stays put on the ground.
 *
 * Which is a thing that can be measured rather than tuned. Run the clip on its own
 * skeleton, take the frames where a toe is within 12% of its vertical range of the floor,
 * and read off how fast that toe travels BACKWARD relative to the hips. During stance the
 * foot is stationary in the world, so that number IS the walk speed. Over 240 samples of
 * the 0.967s cycle it comes out at 0.971 statures per second - 1.66 m/s and 0.80m per step
 * at Adaeze's 1.71m, which is a brisk but ordinary walk and a realistic stride, so the two
 * independent checks agree.
 *
 * Anything faster and she moonwalks; anything slower and she treadmills. Scaled by the
 * rig's own height rather than fixed in metres, because a shorter contact takes shorter
 * steps out of the same clip and would skate at a taller one's speed.
 */
const WALK_PACE = 0.971;
/** Tuned world travel for the in-place Slow Run clip, in statures per second. */
const RUN_PACE = 2.05;
const CROUCH_WALK_PACE = 0.58;
/** Standing Mixamo hips height measured from Walking.fbx; crouch clips are compared to it. */
const MIXAMO_STANDING_HIPS_Y = 0.5061758160591125;

/**
 * Radians per second the body comes round onto a new heading.
 *
 * Slow enough to read as a person turning and fast enough that a right-angle turn is
 * under a second. She does not translate while she is more than square to her
 * destination - see `forward` below - so this also sets how long the turn on the spot at
 * the start of a walk lasts.
 */
const TURN_RATE = 2.4;

/** Close enough to have arrived. Below the width of a foot, so it cannot be seen. */
const ARRIVE = 0.06;
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
   * The walk: the looping action, the leg being walked, and what is left of the route.
   *
   * A route rather than a destination because the return trip is not one long walk with a
   * pause in it - she has to STOP at the far end. The clip is ended and the breathing loop
   * taken back for the dwell, then a fresh action is started for the way home, which is
   * why this is a queue of legs and not a target vector.
   */
  interface Leg {
    to: THREE.Vector3;
    facing: number;
  }
  let walkAction: THREE.AnimationAction | null = null;
  /** Current walk's speed multiplier. One walk runs at a time, so one value is enough. */
  let pace = 1;
  let locomotion: 'walk' | 'run' | 'crouchWalk' = 'walk';
  /** Seconds since this leg began, for easing the root up to speed. See WALK_TAKE. */
  let legAge = 0;
  let leg: Leg | null = null;
  let route: Leg[] = [];
  let dwell = 0;
  let dwellLeft = 0;

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
  let standingAction: THREE.AnimationAction | null = null;
  let stance: 'stand' | 'crouch' = 'stand';
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
    /*
     * `weight` directly, and never `setEffectiveWeight`.
     *
     * The two are not interchangeable here. `_updateWeight` computes
     * `this.weight * interpolant`, so `weight` is the CEILING a fade ramps toward
     * and the interpolant is the ramp - and `setEffectiveWeight` additionally calls
     * `stopFading()`, which throws away a crossfade that is halfway through.
     * Assigning the ceiling leaves the ramp alone.
     */
    baseAction.weight = 1;
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
  /**
   * Compose a shared clip's hips delta onto THIS skeleton's rest pose.
   *
   * `retarget` leaves the hips track as the rotation since the clip's own first frame,
   * because the clip is cached once and played by all seven contacts while the rest pose
   * belongs to each GLB. Mirela's hips sit at -90 degrees about X; writing the raw delta
   * would put her face down at the floor and take everybody else with her.
   *
   * Cached per rig, so a contact who points twenty times rebuilds nothing.
   */
  const fitted = new Map<THREE.AnimationClip, THREE.AnimationClip>();
  const fitHips = (clip: THREE.AnimationClip): THREE.AnimationClip => {
    const already = fitted.get(clip);
    if (already) return already;

    const rest = contact.rest.hips;
    const restPosition = contact.restPositions.hips;
    const copy = clip.clone();
    if (rest || restPosition) {
      copy.tracks = copy.tracks.map((track) => {
        if (track.name.endsWith('Hips.position') && restPosition) {
          const values = Array.from(track.values);
          if (values.length >= 3) {
            const dx = restPosition.x - values[0];
            // Do not zero the first crouch frame. Crouch Idle begins at 0.302m while the
            // standing reference is 0.506m; that 20cm authored drop is the stance. Anchoring
            // the first key to rest erased it and made bent legs lift both feet off the floor.
            const dy = restPosition.y - MIXAMO_STANDING_HIPS_Y;
            const dz = restPosition.z - values[2];
            for (let i = 0; i < values.length; i += 3) {
              values[i] += dx;
              values[i + 1] += dy;
              values[i + 2] += dz;
            }
          }
          return new THREE.VectorKeyframeTrack(track.name, Array.from(track.times), values);
        }
        if (!HIPS.test(track.name)) return track;
        const values = Array.from(track.values);
        const q = new THREE.Quaternion();
        for (let i = 0; i < values.length; i += 4) {
          q.set(values[i], values[i + 1], values[i + 2], values[i + 3]).premultiply(rest);
          values[i] = q.x;
          values[i + 1] = q.y;
          values[i + 2] = q.z;
          values[i + 3] = q.w;
        }
        return new THREE.QuaternionKeyframeTrack(track.name, Array.from(track.times), values);
      });
    }
    fitted.set(clip, copy);
    return copy;
  };

  const release = (): void => {
    if (!gestureAction) return;
    holdIdle();
    if (baseAction) gestureAction.crossFadeTo(baseAction, RELEASE, false);
    else gestureAction.fadeOut(RELEASE);
    fading = gestureAction;
    fadeLeft = RELEASE;
    gestureAction = null;
  };

  /**
   * Turn toward a heading the short way round, and report how far off she still is.
   *
   * Through atan2 of the sine and cosine rather than by subtracting angles, so a turn
   * from 170 degrees to -170 is the 20-degree one and not the 340-degree one. Rate
   * limited, so this is also what makes the turn a movement rather than a snap.
   */
  const turnToward = (want: number, deltaTime: number): number => {
    const delta = Math.atan2(
      Math.sin(want - root.rotation.y),
      Math.cos(want - root.rotation.y)
    );
    const step = Math.min(Math.abs(delta), TURN_RATE * deltaTime);
    root.rotation.y += Math.sign(delta) * step;
    return Math.abs(delta) - step;
  };

  /**
   * Hand the body back to the breathing loop at the end of a leg.
   *
   * The same two rules as `release`, and for the same reasons: crossfade both ways so the
   * weights never sum to less than one, and stop the outgoing action only once it has
   * actually reached zero - which `fadeLeft` in the tick does. A walk is LoopRepeat rather
   * than LoopOnce so it is not clamped and bound the way a gesture is, but leaving a
   * looping action running at zero weight would keep it advancing forever, so it still has
   * to be stopped rather than merely faded.
   */
  const endLeg = (): void => {
    leg = null;
    if (!walkAction) return;
    holdIdle();
    if (baseAction) walkAction.crossFadeTo(baseAction, RELEASE, false);
    else walkAction.fadeOut(RELEASE);
    fading = walkAction;
    fadeLeft = RELEASE;
    walkAction = null;
  };

  /** Start the clip for the next leg of the route. */
  const beginLeg = (): void => {
    const next = route.shift();
    if (!next) return;
    void loadGesture(locomotion).then((clip) => {
      if (!clip || !mixer) return;

      const action = mixer.clipAction(fitHips(clip));
      /*
       * A redirect, not a departure.
       *
       * `clipAction` is cached by clip and root, so a second walk on the same rig is
       * literally the same action object - and crossfading an action with itself is not
       * a blend, it is two fades fighting over one interpolant. Somebody already walking
       * who is sent somewhere else just gets a new destination; the legs never stop.
       */
      if (walkAction === action && action.isRunning()) {
        leg = next;
        return;
      }

      // Nothing else may be on its way anywhere - two actions fading at once is a sum
      // below one, which three draws as the bind pose.
      gestureAction?.stop();
      fading?.stop();
      fading = null;
      fadeLeft = 0;
      gestureLeft = 0;
      holdIdle();

      action.reset();
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = false;
      // Weight one and let the crossfade ramp it - see the note on the gesture, where
      // starting at zero was the whole T-pose.
      action.enabled = true;
      action.weight = 1;
      // Both halves of the pace, set together - see WalkOptions.pace.
      action.timeScale = pace;
      action.play();
      if (baseAction) baseAction.crossFadeTo(action, WALK_TAKE, false);
      else action.fadeIn(WALK_TAKE);
      walkAction = action;
      leg = next;
      // Restarted per leg, so the walk back out eases off the spot the same way.
      legAge = 0;
    });
  };

  /**
   * Move the root while the clip plays.
   *
   * Turn and travel are separate, and the coupling between them is the one line that
   * decides whether this looks like walking: forward speed is scaled by the cosine of how
   * far off the heading still is, so a body square to its destination turns on the spot
   * and eases into the travel as it comes round, instead of sliding sideways down the
   * shortest line while facing somewhere else.
   *
   * Travel is along her own facing rather than straight at the target, so the path is an
   * arc she could actually have walked. The two converge because she is turning toward
   * the target every frame.
   */
  const stepWalk = (deltaTime: number): void => {
    if (!leg) {
      if (dwellLeft <= 0) return;
      dwellLeft -= deltaTime;
      if (dwellLeft <= 0) beginLeg();
      return;
    }

    legAge += deltaTime;

    const dx = leg.to.x - root.position.x;
    const dz = leg.to.z - root.position.z;
    const distance = Math.hypot(dx, dz);

    /*
     * Up to speed on the same curve the legs blend in on.
     *
     * smoothstep rather than linear: a linear ramp still starts moving on the first frame,
     * and the first frame is exactly when the walk cycle has no weight at all. This leaves
     * from a standstill.
     */
    const blend = Math.min(1, legAge / WALK_TAKE);
    const eased = blend * blend * (3 - 2 * blend);
    /*
     * And down again over the last third of a metre.
     *
     * The same fault at the other end: without this the last frame clamps the step to
     * whatever distance remains and she goes from full speed to nothing between two frames.
     * Floored at a quarter so she always closes - a factor that reaches zero is a person
     * who never quite arrives.
     */
    const closing = Math.min(1, distance / 0.34);
    const settle = closing * closing * (3 - 2 * closing);
    const basePace = locomotion === 'run'
      ? RUN_PACE
      : locomotion === 'crouchWalk'
        ? CROUCH_WALK_PACE
        : WALK_PACE;
    const speed = basePace * options.height * pace * eased * Math.max(0.25, settle);
    if (distance > ARRIVE) {
      const error = turnToward(Math.atan2(dx, dz), deltaTime);
      /*
       * Inside her own turning circle, walk first and she orbits.
       *
       * Turning while travelling traces an arc of radius speed/TURN_RATE - 0.69m here -
       * so a target nearer than that and off to one side cannot be reached by curving
       * toward it: she circles it instead. Simulated, and it is not subtle. A 0.4m step
       * to the side came out as 1.4m of walking over five seconds, which is a person
       * pacing round a spot rather than stepping onto it.
       *
       * So inside the circle she turns on the spot first and then walks straight at it,
       * which is what a person does for a short sideways move anyway.
       */
      const orbiting = distance < speed / TURN_RATE && error > 0.15;
      const forward = orbiting ? 0 : Math.max(0, Math.cos(error));
      const step = Math.min(distance, speed * forward * deltaTime);
      root.position.x += Math.sin(root.rotation.y) * step;
      root.position.z += Math.cos(root.rotation.y) * step;
      return;
    }

    // Arrived. Square up before handing back, or she finishes the walk still facing the
    // way she was going and the idle plays to nobody.
    root.position.x = leg.to.x;
    root.position.z = leg.to.z;
    if (turnToward(leg.facing, deltaTime) > 0.02) return;
    endLeg();
    if (route.length > 0) dwellLeft = dwell;
  };

  const contact: RiggedContact = {
    root,
    bones: {},
    rest: {},
    restPositions: {},

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

        const action = mixer.clipAction(fitHips(clip));
        action.reset();
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        /*
         * Weight one, and let the crossfade do the ramping.
         *
         * This said `setEffectiveWeight(0)` and that one line was the T-pose. Weight
         * is a multiplier, not a starting value: `_updateWeight` returns
         * `this.weight * interpolant`, so zeroing it meant the fade-in ramped 0 to 1
         * and was multiplied by nothing the whole way. The clip never gained any
         * weight at all while the idle faded out underneath it, so the sum went to
         * ZERO - and a bone with no action driving it is drawn at the bind pose.
         * Not a glimpse of one either: it was the entire gesture.
         */
        action.enabled = true;
        action.weight = 1;
        action.play();
        // Idle 1 -> 0 and the clip 0 -> 1 over the same quarter second, so the two
        // always add to one and nothing is ever left to the bind pose.
        if (baseAction) baseAction.crossFadeTo(action, TAKE, false);
        else action.fadeIn(TAKE);
        gestureAction = action;
        gestureLeft = clip.duration;
      });
    },

    setStance: (next) => {
      if (stance === next) return;
      stance = next;
      if (next === 'stand') {
        if (!standingAction) return;
        const previous = baseAction;
        standingAction.enabled = true;
        standingAction.weight = 1;
        standingAction.play();
        if (previous && previous !== standingAction) previous.crossFadeTo(standingAction, WALK_TAKE, false);
        baseAction = standingAction;
        return;
      }
      void loadGesture('crouchIdle').then((clip) => {
        if (!clip || !mixer || stance !== 'crouch') return;
        const action = mixer.clipAction(fitHips(clip));
        if (baseAction === action && action.isRunning()) return;
        const previous = baseAction;
        action.reset();
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.clampWhenFinished = false;
        action.enabled = true;
        action.weight = 1;
        action.play();
        if (previous) previous.crossFadeTo(action, WALK_TAKE, false);
        baseAction = action;
      });
    },

    walk: (to, walkOptions = {}) => {
      // One walk at a time, unless told otherwise. A second instruction arriving
      // mid-stride would otherwise capture a half-walked position as "home" and send her
      // back to the middle of the last trip.
      const busy = leg !== null || dwellLeft > 0 || route.length > 0;
      if (busy && !walkOptions.interrupt) return;
      if (busy) {
        leg = null;
        route = [];
        dwellLeft = 0;
      }

      const home = root.position.clone();
      const homeFacing = root.rotation.y;
      // Where she ends up looking, if the caller did not say: along the way she came,
      // which is what somebody who has just walked over to look at something is doing.
      const travelled = Math.atan2(to.x - home.x, to.z - home.z);

      route = [{ to: to.clone(), facing: walkOptions.facing ?? travelled }];
      if (walkOptions.back) route.push({ to: home, facing: homeFacing });
      dwell = walkOptions.dwell ?? 1.8;
      pace = walkOptions.pace ?? 1;
      locomotion = walkOptions.locomotion ?? 'walk';
      beginLeg();
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

      stepWalk(deltaTime);

      if (gestureLeft > 0) {
        gestureLeft -= deltaTime;
        // Only ramps for a gesture that owns the arms - see gestureTakesHands. A nod
        // leaves this at zero, so the IK below keeps running underneath the clip and
        // the hands stay where the scene put them while the head does the work.
        if (gestureTakesHands) hold = Math.min(1, hold + deltaTime / TAKE);
        if (gestureLeft <= 0) release();
      } else if (leg) {
        /*
         * A walk always owns the arms, and it has to, because the alternative is worse
         * than a gesture's. Hand IK is solved to a target in WORLD space - a bench, a
         * bed rail - and the root is moving, so a walking contact who kept her targets
         * would reach further back with every step until the arm inverted. The arms
         * swing with the clip until she stops, then ease back over RELEASE.
         */
        hold = Math.min(1, hold + deltaTime / TAKE);
      } else if (hold > 0) {
        hold = Math.max(0, hold - deltaTime / RELEASE);
      }
      /*
       * Then the hands, on top of whatever the clip just did to the arms - except while a
       * gesture owns them. The ORDER is still the point (see the interface note): the
       * mixer writes every bone it animates every frame, so IK has to run after it or it
       * is gone by the next tick.
       */
      /*
       * The wrists, before the hand IK and after the clip.
       *
       * After the mixer for the same reason everything else here is: a clip writes every
       * bone it animates every frame, so anything done before it is gone. Before the IK
       * because when a contact HAS hand targets the solver owns the wrist outright and this
       * would be fighting it - `hold` gates the IK below, and where the IK is in charge
       * this simply does not get the chance to run first.
       */
      const settle = options.settleWrists ?? 0;
      if (settle > 0) {
        for (const named of ['left', 'right'] as const) {
          const bone = contact.bones[named === 'left' ? 'lefthand' : 'righthand'];
          const rest = contact.rest[named === 'left' ? 'lefthand' : 'righthand'];
          if (bone && rest) bone.quaternion.slerp(rest, Math.min(1, settle));
        }
      }

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

    /**
     * Take the generator's studio lights out of the skin.
     *
     * Every character here comes out of Tripo, which works from photographs and paints the
     * highlights that were on the real garment straight into the base colour. On Vasile's
     * near-black work shirt that is patches at 240/255 in cloth at 30 - and because they are
     * attached to the mesh, they slide across the fabric as he moves, which is what "the
     * sparkling light on Vasile's body" was.
     *
     * Applied to every rigged contact rather than to the one who was noticed: they all come
     * from the same generator with the same problem, and the pass is a no-op on a texture
     * that has no baked highlights in it. Measured on Vasile's 2048 map it rewrites 0.17% of
     * texels, takes the worst speck from 239 to 125, and leaves his face untouched.
     *
     * Once per material, not once per mesh - a character is usually one texture over several
     * meshes, and debaking it twice would eat the garment's own weave the second time round.
     */
    const debaked = new Set<THREE.Texture>();
    loaded.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        /*
         * Take the shine off the MATERIAL, not only out of the texture.
         *
         * This traverse debaked painted highlights out of the map and left roughness and
         * metalness at whatever the GLB was authored with - so a character exported with a
         * low roughness kept a live specular and read as wet plastic under any practical.
         * Reported on Vasile, who stands under a bulkhead lamp in a cellar.
         *
         * Cloth, skin and webbing are rough and not metal. 0.92 leaves a trace of sheen on
         * the highest curvature - a shoulder, a cheekbone - and kills the plastic.
         */
        const standard = material as THREE.MeshStandardMaterial;
        if (standard.isMeshStandardMaterial) {
          /*
           * ## A person is not a light source
           *
           * Vasile's uniform carried white patches at exactly 255 that survived every other
           * fix, and the sequence of what did NOT move them is the diagnosis: flooring
           * roughness to 0.92 and capping metalness left them (so not specular), a stronger
           * relative debake on `map` left them at p99 149 and max 255 (so not the colour
           * map), and an absolute luma ceiling on `map` left them at max 255 (so not in that
           * texture at all).
           *
           * Emissive is added AFTER lighting and ignores roughness, metalness and every
           * change to the albedo, which is exactly the fingerprint. Whatever these were
           * authored as - a rim pass, an accidental export - a character in this game is lit
           * by the room and emits nothing.
           */
          standard.emissive?.setRGB(0, 0, 0);
          standard.emissiveMap = null;
          standard.emissiveIntensity = 0;

          /*
           * ## And a ceiling on the material's own colour
           *
           * Fifth hypothesis, after four that measured no change at all: not specular
           * (roughness 0.92 / metalness 0.04 moved nothing), not the colour map (a stronger
           * relative debake AND an absolute luma cap both left max at 255), not emissive
           * (cleared, still 255). What survives all of that is a material whose own base
           * colour is near white - separate equipment meshes rather than the uniform, which
           * is exactly where the patches sit: a chest badge, a shoulder patch, a radio at the
           * hip, boot caps.
           *
           * They are not highlights, they are objects, and the fault is that they are
           * authored near white on a near-black uniform - so they read as blown specular
           * rather than as kit.
           *
           * 0.66 is above skin, so faces and hands are untouched, and below the white these
           * were exported at. Scaled rather than clamped, so the hue survives.
           */
          const c = standard.color;
          const luma = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
          if (luma > 0.66) c.multiplyScalar(0.66 / luma);
          standard.roughness = Math.max(standard.roughness ?? 1, 0.92);
          standard.metalness = Math.min(standard.metalness ?? 0, 0.04);
          standard.needsUpdate = true;
        }
        const map = standard.map;
        if (!map || debaked.has(map)) continue;
        debaked.add(map);
        /*
         * Harder than the default, because a character's cloth is dark.
         *
         * `debakeHighlights` pulls a pixel toward its local average once it is `threshold`
         * brighter, and the reduction is proportional to the excess. On a near-black uniform
         * a painted specular at luma 0.6 against cloth at 0.12 clears the default 0.18
         * threshold, gets pulled to about 0.31, and is still a bright blob on dark cloth -
         * reported on Vasile as his texture looking shiny after the MATERIAL had already
         * been made matte. The material was not the problem; the map is.
         *
         * A lower threshold and full strength take the same patch to roughly cloth value. A
         * face survives it because the blurred average AROUND a face is also light, so the
         * excess there is small - this removes highlights that jump off their surroundings,
         * not everything pale.
         */
        debakeHighlights(map, { threshold: 0.07, strength: 1, blur: 32 });
        /*
         * And a hard ceiling on top of it.
         *
         * The relative pass above left Vasile's painted speculars untouched - measured
         * before and after at p99 149 and max 255 on both, so it was doing nothing here and
         * saying nothing about it. A patch big enough in UV raises its own local average and
         * becomes invisible to a comparison against that average.
         *
         * 0.62 is above skin and well under blown white, so faces keep their modelling and
         * the white blobs on near-black cloth come down to a value cloth can actually be.
         */
        capHighlights(map, 0.62);
      }
    });

    /*
     * ## The people did not cast shadows. Any of them. Ever.
     *
     * applyShadowPolicy runs once when a scene mounts, and a contact is a GLB that streams in
     * afterwards - so it was never traversed, and every character in the game kept whatever
     * castShadow the file shipped with, which for a GLTF load is false.
     *
     * A critic judging the doorstep put it exactly: "the standing figure - the subject of the
     * picture - casts no legible shadow on the pavement... under a bright overhead porch lamp
     * a metre or two away, a full-height human figure should be laying down the longest, most
     * obvious shadow in the shot. He is the one object in the frame that is unambiguously
     * pasted on." It was not a lighting fault in that room. It was every room.
     *
     * This is the same shape as the fault the policy exists to prevent - "several hundred
     * props and not one of them sets a shadow flag" - with the twist that the one class of
     * object that arrives LATE slipped through the traversal that was written to catch
     * exactly that.
     */
    applyShadowPolicy(loaded);

    loaded.traverse((child) => {
      if (child.type === 'Bone' || /mixamorig/i.test(child.name)) {
        const key = boneKey(child.name);
        contact.bones[key] = child;
        // Before the mixer exists, so this is the file's own rest pose.
        contact.rest[key] = child.quaternion.clone();
        contact.restPositions[key] = child.position.clone();
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
        standingAction = baseAction;
        baseAction.play();
      }
      devLog(`[rigged] ${name} clips: ${clips.map((c) => c.name).join(', ') || 'none'}`);
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
      // only exists inside the running game is a number nobody can act on. Through devLog
      // rather than console, so it is a number for whoever is BUILDING this and silence for
      // whoever is playing it - see the note on that module.
      devLog(
        `[rigged] ${name} bones=${Object.keys(contact.bones).length} ` +
          `stepped=${shortfall > 0.01 ? Math.min(shortfall + 0.02, STEP_LIMIT).toFixed(2) : '0'} ` +
          reached.join(', ')
      );
    }
  });

  return contact;
}
