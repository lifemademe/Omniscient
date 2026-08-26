/**
 * One-shot gestures for the rigged cast.
 *
 * Every contact in this game has exactly one thing they do: breathe, on a six second loop
 * baked into their own GLB. Seven people, one performance, for the whole running time of a
 * game that is entirely about talking to them. It is the largest remaining gap between what
 * this project is and what it is pretending to be.
 *
 * ## Why the clips live in FBX and the characters in GLB
 *
 * Because that is what Mixamo gives you and there is no reason to fight it. The characters
 * were downloaded as GLB with a rest clip; the gestures are FBX exports of the same
 * skeleton. Both are `mixamorig`, which is the only thing that has to be true for a clip
 * from one to drive the other.
 *
 * ## The one incompatibility, and it is a punctuation mark
 *
 * `GLTFLoader` sanitises node names and strips the colon, so a bone that ships as
 * `mixamorig:LeftArm` arrives in the scene as `mixamorigLeftArm`. `FBXLoader` does not
 * sanitise anything, so the clip's tracks still say `mixamorig:LeftArm.quaternion`.
 * three binds tracks to nodes by name, finds nothing, and plays a clip that moves not one
 * bone - silently, with no error, which is the worst way for this to fail.
 *
 * Renaming the tracks on load is the entire retarget. There is no bone mapping to write
 * because it is the same skeleton on both sides.
 *
 * ## Loaded once, shared by everybody
 *
 * A clip is read-only data once bound, and all seven contacts are the same rig - so
 * `Surprised.fbx` is fetched once and every mixer in the game gets an action on the same
 * `AnimationClip`. Seven copies of a 400KB file would be seven copies of the same numbers.
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

import { devLog } from '../core/devLog.js';

/**
 * The gestures, and what each one is FOR.
 *
 * Named by the beat rather than by the file, because a mission should ask for a reaction
 * and not for a filename - `point` is what the content means, `Pointing Forward.fbx` is
 * where it happens to live today.
 *
 * Paths are written out in full. AGENTS.md forbids constructing a project asset path,
 * because the build scans for literal `@project/...` strings to decide what to copy into
 * `.dist` - and a path assembled from a name is invisible to that scan and 404s at load.
 */
const GESTURES = {
  /** Mirela pointing at a set she cannot explain. Also any "it is over there". */
  point: '@project/assets/animations/Pointing Forward.fbx',
  /** A start - the spark, a noise off, bad news. */
  surprised: '@project/assets/animations/Surprised.fbx',
  /** Recoiling. Sanda when the follower moves, Vasile when the water rises. */
  reacting: '@project/assets/animations/Reacting.fbx',
  /** Agreement, or resignation. The cheapest way to make somebody feel listened to. */
  nod: '@project/assets/animations/Sarcastic Head Nod.fbx',
  /**
   * The fold. For the beat where somebody stops arguing.
   *
   * F11: four moves across eight missions, and by mission five the point is furniture. The
   * gap the writing kept hitting and the body could not answer was LOSS - a request that
   * fails, a name that turns out to be the wrong one, the moment a person accepts it.
   * `reacting` is a recoil and `nod` is agreement; neither is somebody going out of
   * themselves.
   *
   * The asset is Crying.fbx and it is named for the beat rather than the file, like the rest.
   * Used on defeats it reads as a person folding, which is what a defeat looks like from the
   * other end of a video call - the face going first and the shoulders following.
   */
  slump: '@project/assets/animations/Crying.fbx',
  /**
   * The other missing half: the moment somebody realises they are in trouble.
   *
   * F11 asked for a lean-in for confessions and there is no lean-in in the asset set - the
   * four unused clips are Crying, Terrified, Yawn and Yelling, and none of them leans. Rather
   * than dress one of those up as intimacy, this takes the beat the library CAN play and the
   * writing genuinely hits: Vasile when the water rises past the covers, Dorin when the lock
   * turns out to have been opened from inside.
   *
   * Said plainly because it matters: this is not the clip F11 named. It is the second real
   * emotional register the game can afford, and a confession lean-in still has no animation.
   */
  dread: '@project/assets/animations/Terrified.fbx',
  /**
   * The one clip here that is not a one-shot.
   *
   * It lives in the same record because everything around it applies unchanged - the
   * colon strip, the dropped position tracks, the hips delta, the shared cache. What
   * differs is entirely on the playback side, so `riggedContact.walk` drives it as
   * LoopRepeat for a distance rather than LoopOnce for a duration, and it is deliberately
   * NOT registered as a prop action: a walk needs somewhere to walk to, which a cue that
   * only names a gesture cannot supply.
   *
   * In place, measured: no hips translation track, and the planted foot sweeps back at
   * 0.97 statures per second. That is where the 1.66 m/s in riggedContact comes from, and
   * it is the number that decides whether the feet grip the ground or skate over it.
   */
  walk: '@project/assets/animations/Walking.fbx',
  /** Opening a secured hatch, either after authorization or as a recorded tamper attempt. */
  open: '@project/assets/animations/Opening.fbx',
  /** A pursuit loop. Root travel remains authored by riggedContact so paths stay deterministic. */
  run: '@project/assets/animations/Slow Run.fbx',
  /** Concealed warehouse-worker stance. Horizontal FBX root motion is removed below. */
  crouchIdle: '@project/assets/animations/Crouch Idle.fbx',
  /** Low relocation cycle used while the inbound impostor moves between cover points. */
  crouchWalk: '@project/assets/animations/Crouched Walking.fbx',
} as const;

export type GestureName = keyof typeof GESTURES;

/**
 * The gestures a CONTACT performs in conversation, as opposed to the locomotion and
 * interaction clips that share this table.
 *
 * One list, read by three places: the prop actions every rigged contact registers, the
 * runtime's test for "did this route already ask for a gesture", and the cue harness. Before
 * this existed the runtime carried its own hardcoded four while its comment claimed a fifth
 * clip would work without being added there - so adding one would have silently broken the
 * rule that a beat's own gesture replaces the route's, for exactly the new gesture and
 * nothing else.
 *
 * `walk`, `run`, `open` and the crouch pair are deliberately absent. They are not things a
 * person does while talking, and `open` in particular collides with a real prop action -
 * mission 02's `prop.open:splice-box` would be stripped as a gesture if it were in here.
 */
export const CONTACT_GESTURES = ['point', 'surprised', 'reacting', 'nod', 'slump', 'dread'] as const;

export type ContactGesture = (typeof CONTACT_GESTURES)[number];

const loader = new FBXLoader();
const cache = new Map<GestureName, Promise<THREE.AnimationClip | null>>();

/**
 * Strip the colon so the clip can find the bones.
 *
 * Done on the clip rather than on the skeleton, because the skeleton is what the rest of
 * the project already talks to - `riggedContact` keys its bone map on the sanitised name,
 * and renaming bones to match the clip would break every hand target in the game to fix
 * one animation.
 */
/** The one bone whose rotation is rewritten rather than kept or dropped. */
export const HIPS = /Hips\.quaternion$/;

/**
 * Rewrite a rotation track as the rotation SINCE its own first frame.
 *
 * Leaves the values as a delta rather than a pose - see the note in `retarget` and
 * `fitHips` in riggedContact, which is where the delta meets a particular skeleton.
 */
function asDelta(track: THREE.KeyframeTrack): THREE.KeyframeTrack {
  const values = Array.from(track.values);
  const first = new THREE.Quaternion(values[0], values[1], values[2], values[3]).invert();
  const q = new THREE.Quaternion();
  for (let i = 0; i < values.length; i += 4) {
    q.set(values[i], values[i + 1], values[i + 2], values[i + 3]).premultiply(first);
    values[i] = q.x;
    values[i + 1] = q.y;
    values[i + 2] = q.z;
    values[i + 3] = q.w;
  }
  return new THREE.QuaternionKeyframeTrack(track.name, Array.from(track.times), values);
}

const HIPS_POSITION = /Hips\.position$/;

function crouchPosition(track: THREE.KeyframeTrack): THREE.KeyframeTrack {
  const values = Array.from(track.values);
  if (values.length < 3) return track.clone();
  const x = values[0];
  const z = values[2];
  for (let i = 0; i < values.length; i += 3) {
    values[i] = x;
    values[i + 2] = z;
  }
  return new THREE.VectorKeyframeTrack(track.name, Array.from(track.times), values);
}

function retarget(clip: THREE.AnimationClip, name: GestureName): THREE.AnimationClip {
  const copy = clip.clone();
  for (const track of copy.tracks) {
    track.name = track.name.replace('mixamorig:', 'mixamorig');
  }

  /**
   * And drop every position track, which is the difference between a gesture and a stunt.
   *
   * Mixamo bakes root motion into `Hips.position`, and the first time this clip actually
   * bound, Mirela dropped through her own workbench and spent most of the take crouched
   * behind it with the top of her head showing. The clip was doing exactly what it says -
   * moving the character - and where a character STANDS in this game is the scene's
   * decision, authored per contact and checked against arm reach.
   *
   * Safe to remove wholesale rather than filtering to the hips: a skeleton's bone offsets
   * are fixed, so any other position track is either the same root motion by another name
   * or a scale artefact from the export. Rotation is the whole of a gesture.
   */
  /**
   * The hips go too - rotation as well as position - which makes this an UPPER BODY clip.
   *
   * Dropping only the position stopped her sinking through the bench and left her doubled
   * over it instead, head down, for most of the take. A Mixamo clip authors the hips in its
   * own idea of where the character faces and how far it is leaning; this game authors that
   * per contact, in the scene, and has already turned Mirela 72 degrees to her work and
   * solved both her hands onto it.
   *
   * Whichever of those two wins, the other is wrong - so the clip is not allowed to have an
   * opinion about the stance. It keeps everything above the hips, which is where a point, a
   * start, a recoil and a nod actually live, and the character keeps standing where the
   * room put her.
   */
  /*
   * Position tracks go, hips ROTATION stays - and the difference is the fix.
   *
   * Both used to go, which is why every gesture in the game played as though the
   * pelvis were bolted to the floor. Measured, the hips travel up to 27 degrees over
   * Pointing Forward and 19 over Surprised, and a body that turns and leans from the
   * chest up while its hips hold still is the single thing that most reads as a
   * puppet. It is a lot of animation to throw away.
   *
   * The reason it was thrown away is real though: a clip's hips carry the stance the
   * ANIMATOR chose - which way the actor faces and how far they lean - and this game
   * authors that per contact, in the scene, and has already turned Mirela 72 degrees
   * to her work and solved both her hands onto it. Letting the clip win doubled her
   * over her own bench for most of a take.
   *
   * So the clip keeps its hip MOVEMENT and loses its hip OPINION: every key becomes
   * the delta from that clip's own first frame. At the first frame the hips are
   * exactly where the scene put them and from there they move as animated.
   *
   * The delta is left as a delta here and composed onto each rig's real rest pose in
   * riggedContact, because this clip is shared by all seven contacts and the rest is
   * per rig - Mirela's hips sit at -90 degrees about X, so writing the raw delta
   * would fold every character in the game face down at the floor.
   */
  const crouching = name === 'crouchIdle' || name === 'crouchWalk';
  copy.tracks = copy.tracks
    .filter((track) => !track.name.endsWith('.position') || (crouching && HIPS_POSITION.test(track.name)))
    .map((track) => {
      if (HIPS.test(track.name)) return asDelta(track);
      if (crouching && HIPS_POSITION.test(track.name)) return crouchPosition(track);
      return track;
    });
  return copy;
}

export function loadGesture(name: GestureName): Promise<THREE.AnimationClip | null> {
  const already = cache.get(name);
  if (already) return already;

  /**
   * Resolve the path before the loader ever sees it.
   *
   * `FBXLoader` is a plain three loader and knows nothing about `@project/` - that prefix
   * is the engine's, and only the storage provider can turn it into something fetchable.
   * Handing the raw string over produced exactly the failure AGENTS.md warns about for raw
   * HTML: a request for a path that does not exist, an error nobody sees, and a gesture
   * system that loaded, retargeted and blended perfectly against a clip that was never
   * there. Thirty-six frames of a woman standing still.
   *
   * `resolvePath` rather than `resolveAssetPathsInText`, and the difference matters here:
   * that helper matches on `[^"\\s'<>]+`, which stops at a space, and three of these four
   * files have spaces in their names.
   */
  const pending = ENGINE.resolvePath(ENGINE.AssetPath.fromString(GESTURES[name])).then(
    (resolved) =>
      new Promise<THREE.AnimationClip | null>((resolve) => {
        loader.load(
          resolved.getResolvedPath(),
          (group) => {
            /*
             * The longest clip, for the same reason riggedContact takes the longest one
             * out of a character GLB: a Mixamo export can carry a two-frame rest pose
             * alongside the animation, and both are called `mixamo.com`.
             */
            const clip = group.animations.reduce<THREE.AnimationClip | undefined>(
              (best, candidate) =>
                !best || candidate.duration > best.duration ? candidate : best,
              undefined
            );
            if (!clip) {
              console.warn(`[gesture] ${name}: file loaded but carries no animation`);
              resolve(null);
              return;
            }
            devLog(`[gesture] ${name}: ${clip.duration.toFixed(2)}s, ${clip.tracks.length} tracks`);
            resolve(retarget(clip, name));
          },
          undefined,
          (error) => {
            console.warn(`[gesture] ${name} failed to load`, error);
            resolve(null);
          }
        );
      })
  );

  cache.set(name, pending);
  return pending;
}
