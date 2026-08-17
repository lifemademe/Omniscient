/**
 * Certainty, as a rendering dimension. See ART_DIRECTION §1 and §2.
 *
 * ## The law
 *
 * **Warm is known. Cold is inferred.** Every material lerps toward `ACCENT.data` by
 * `(1 - certainty)` and desaturates by the same amount. Nothing else has to encode
 * progress: the player's eye goes to the warmest thing in frame, and the warmest thing in
 * frame is whatever they have earned by talking to somebody.
 *
 * ## What this is actually fixing
 *
 * Mirela's shop, measured: mean saturation 0.58, mean R−B **+56**, 61% of the frame below
 * value 102 and 3% above 178. One hue, no highlight, no cool anywhere. And at a squint the
 * brightest object is a blank white board on the right - the radio, which is the subject of
 * the entire request, reads as a mid-grey box behind it.
 *
 * Both faults have the same cause and the same fix. There is no colour contrast because
 * every surface is the same amber, and there is no focal point because nothing is
 * privileged. Cooling everything the machine has not been told about does both jobs at
 * once: it puts blue in the frame *and* it leaves the subject as the only warm thing in it.
 *
 * That is the argument for this direction in one image. The composition problem and the
 * fiction want exactly the same thing.
 *
 * ## Idempotence
 *
 * Materials are touched repeatedly - a scene remounts, a beat re-runs, certainty rises. So
 * the original colour is stashed in `userData` on first contact and every later call lerps
 * from *that*, never from the current value. Without it the colour walks toward cold a bit
 * more each time and a room slowly turns blue on its own, which is the kind of bug that
 * looks like an art decision for a week.
 *
 * Materials are also shared between props by the palette module, so anything given its own
 * certainty gets its own clone first. Otherwise setting the radio to 1.0 would set every
 * other object sharing `MAT.equipment` to 1.0 with it.
 */

import * as THREE from 'three';

import { ACCENT } from './palette.js';

/** The five tiers, as named values. Use these rather than bare numbers at call sites. */
export const CERTAINTY = {
  /** Not known to exist. Callers should not render it at all. */
  ABSENT: 0,
  /** Something is there. Bounding shape only. */
  SUSPECTED: 0.2,
  /** Shape known. Flat-shaded, cold, no maps. The game's resting state. */
  SHAPED: 0.45,
  /** Described in conversation. Materials arrive. */
  DESCRIBED: 0.75,
  /** The thing being talked about. Fully warm, full detail. */
  KNOWN: 1,
} as const;

const COLD = new THREE.Color(ACCENT.data);

interface Marked {
  certaintyBase?: THREE.Color;
  certaintyOwned?: boolean;
  certainty?: number;
}

/**
 * How far a material is pulled toward cold, and how much saturation it keeps.
 *
 * Not linear. A prop at SHAPED (0.45) should read as clearly *machine* rather than as
 * slightly-off human, so the pull is biased toward cold in the lower half and releases
 * quickly in the upper: the moment somebody describes an object it should visibly warm.
 * `1 - c` alone made 0.45 look merely dull, which reads as bad lighting rather than as
 * missing knowledge - and "looks like a mistake" is the failure mode this whole direction
 * exists to avoid.
 */
function pull(certainty: number): number {
  const c = Math.min(1, Math.max(0, certainty));
  return Math.pow(1 - c, 0.72);
}

function applyToMaterial(material: THREE.Material, certainty: number): void {
  const standard = material as THREE.MeshStandardMaterial & Marked;
  if (!standard.color) return;

  standard.certaintyBase ??= standard.color.clone();
  const base = standard.certaintyBase;
  const amount = pull(certainty);

  /*
   * Desaturate first, then cool. The other order pulls toward cold and then bleeds the
   * blue back out of it, so a fully-unknown object lands grey rather than cyan and the
   * whole language stops reading.
   */
  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);
  standard.color.setHSL(hsl.h, hsl.s * (1 - amount * 0.8), hsl.l);
  standard.color.lerp(COLD, amount * 0.55);

  /*
   * Unknown things are matte. A specular highlight is information about a surface, and an
   * object nobody has described has no surface yet - leaving the roughness alone let the
   * white boxes on the shelf catch the bench lamp and read as *polished*, which is the
   * most specific a shape can look while meaning nothing.
   */
  if (standard.roughness !== undefined) {
    standard.roughness = Math.min(1, standard.roughness + amount * 0.35);
  }
  if (standard.metalness !== undefined) {
    standard.metalness *= 1 - amount;
  }

  /*
   * The subject lifts itself.
   *
   * ART_DIRECTION §1 gives tier 4 "a practical light or a bounce if the object plausibly
   * catches one", and the reason is measured: with the colour law alone the radio read at
   * luma 81 against a blank white board at 155. Warm is not the same as bright, and the
   * eye goes to the brightest thing before it goes to the warmest one - so the one object
   * the whole request is about was still losing to a piece of scenery.
   *
   * A small emissive in the material's own colour rather than a light: it costs nothing,
   * it cannot miss its target, and it survives a prop being moved or re-parented. It is
   * deliberately weak - this should read as the object being *attended to*, not as it
   * glowing, and anything stronger turns evidence into a power-up.
   */
  if (standard.emissive) {
    const lift = Math.max(0, (certainty - 0.9) / 0.1) * 0.16;
    standard.emissive.copy(base).multiplyScalar(lift);
  }

  /* Flat shading below SHAPED: this is the 90s CG tier and it should look like it. */
  const flat = certainty < CERTAINTY.SHAPED;
  if (standard.flatShading !== flat) {
    standard.flatShading = flat;
    standard.needsUpdate = true;
  }

  standard.certainty = certainty;
}


/**
 * The THREE.Mesh that actually draws, which on this engine is not the node you traversed.
 *
 * `MeshNode` sets `isMesh = true` on **itself** and, under COLLAPSE_MESH_COMPONENT, never
 * adds its inner `THREE.Mesh` to the scene graph. So a traversal finds the node, the node
 * answers `isMesh`, and everything downstream looks correct - while the object being
 * rendered is somewhere else entirely.
 *
 * It gets worse. The node keeps two materials: `_material`, which is whatever you passed to
 * create(), and `_mesh.material`, which is what the renderer draws - and they are different
 * objects, because the setter routes through `resourceManager.loadGenericMaterial` and
 * assigns the *result*. The public getter returns the rendered one only while
 * `isRenderingScene` is true, and returns `_material` at every other moment, including the
 * one where a scene builder wants to change how something looks.
 *
 * So reading `node.material` outside a render, changing it, and writing it back is three
 * operations on the wrong object, and all three succeed. Two full build-capture-measure
 * cycles showed a mean frame difference of 0.7 - indistinguishable from noise - with no
 * warning anywhere, because nothing had failed.
 *
 * Reaching `_mesh` is poking at a private, and it is still the honest option: it is the
 * only reference to the thing on screen.
 */
function renderTargetOf(object: THREE.Object3D): THREE.Mesh | null {
  const inner = (object as { _mesh?: THREE.Mesh })._mesh;
  if (inner?.isMesh) return inner;
  const mesh = object as THREE.Mesh;
  return mesh.isMesh && mesh.material !== undefined ? mesh : null;
}

/**
 * Set a subtree's certainty.
 *
 * Safe to call every frame and safe to call twice with the same value - see the note on
 * idempotence above. Unlit materials are skipped entirely: sky, sea, backdrop and painted
 * distance are not objects the machine is uncertain about, they are the edge of its model,
 * and cooling them would tint the whole world.
 */
export function applyCertainty(root: THREE.Object3D, certainty: number): number {
  let touched = 0;
  root.traverse((object) => {
    const mesh = renderTargetOf(object);
    if (!mesh) return;

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next: THREE.Material[] = [];

    for (const material of materials) {
      if (!material) continue;
      if (material instanceof THREE.MeshBasicMaterial) {
        next.push(material);
        continue;
      }

      // Own it before changing it, or every prop sharing this material comes with us.
      const marked = material as THREE.Material & Marked;
      const mine = marked.certaintyOwned ? material : material.clone();
      (mine as THREE.Material & Marked).certaintyOwned = true;
      applyToMaterial(mine, certainty);
      next.push(mine);
      touched += 1;
    }

    if (next.length > 0) mesh.material = next.length === 1 ? next[0] : next;
  });
  return touched;
}
