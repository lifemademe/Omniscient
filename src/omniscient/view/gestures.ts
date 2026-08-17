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
} as const;

export type GestureName = keyof typeof GESTURES;

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
function retarget(clip: THREE.AnimationClip): THREE.AnimationClip {
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
  copy.tracks = copy.tracks.filter(
    (track) => !track.name.endsWith('.position') && !track.name.includes('Hips')
  );
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
            console.log(`[gesture] ${name}: ${clip.duration.toFixed(2)}s, ${clip.tracks.length} tracks`);
            resolve(retarget(clip));
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
