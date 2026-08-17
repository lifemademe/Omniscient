/**
 * Shadows, applied as a policy rather than a per-prop decision.
 *
 * ## Why a traversal and not an option on every mesh
 *
 * There are several hundred props across eight dioramas and not one of them sets a shadow
 * flag. Adding `castShadow: true` to each call site would be several hundred chances to
 * forget one, and the forgotten prop would be the one floating - §254's rule about a value
 * having one home applies here exactly. The scene declares its geometry; this decides what
 * shadows do; the two never disagree because only one of them has an opinion.
 *
 * ## The rule
 *
 * Lit materials cast and receive. Unlit ones do neither, and that is not an optimisation -
 * it is a correctness requirement. A MeshBasicMaterial ignores lighting by definition, so
 * it cannot show a shadow falling on it; if it were allowed to CAST one, the sky shell and
 * the cloud layer would drop a hard shadow over the entire world, because they are the
 * biggest objects in the scene and they sit between the sun and everything else.
 *
 * That single check does all the work: sky, sea, backdrop, clouds, water and the painted
 * distances are all MeshBasicMaterial for reasons set out in their own modules, and they
 * are exactly the set that must be excluded.
 *
 * ## Ground is the exception that has to be handled by hand
 *
 * See `meadowGround`. It is unlit for a historical reason - the sun used to be a point
 * light with a 26m range and the field went black past the ring - and it is the one surface
 * in the game that MUST receive shadows, because a tree with no shadow under it is a tree
 * standing on nothing. Converting it is the caller's job, not this function's.
 */

import * as THREE from 'three';

/** How soft, how precise, and how much of the world is covered. */
export interface ShadowQuality {
  /** Square shadow map resolution. 2048 is the practical ceiling before it costs frames. */
  mapSize?: number;
  /**
   * Half-width of the orthographic shadow frustum, in metres.
   *
   * The whole budget of a directional shadow map is spent across this box, so it should be
   * the smallest box that contains everything the camera can see cast a shadow. Doubling it
   * quarters the effective resolution.
   */
  extent?: number;
  /** Pulls the shadow off the surface that casts it. Too little acnes, too much peters. */
  bias?: number;
  normalBias?: number;
  /** Edge softness, in shadow-map texels. */
  radius?: number;
  far?: number;
}

/**
 * Turn a directional light into a shadow caster.
 *
 * Bias defaults are the ones that survived a faceted low-poly scene: flat-shaded geometry
 * has large coplanar faces, which is the worst case for shadow acne, and a normal bias does
 * far more for it than a depth bias does because it moves the sample along the surface
 * normal rather than pushing the whole map away from the light.
 */
export function castShadows(light: THREE.Object3D, quality: ShadowQuality = {}): void {
  const l = light as unknown as {
    castShadow?: boolean;
    shadow?: THREE.DirectionalLightShadow;
  };
  const mapSize = quality.mapSize ?? 2048;
  const extent = quality.extent ?? 24;

  l.castShadow = true;
  if (!l.shadow) return;

  l.shadow.mapSize.set(mapSize, mapSize);
  l.shadow.bias = quality.bias ?? -0.0006;
  l.shadow.normalBias = quality.normalBias ?? 0.035;
  l.shadow.radius = quality.radius ?? 2.4;

  const cam = l.shadow.camera;
  if (cam instanceof THREE.OrthographicCamera) {
    cam.left = -extent;
    cam.right = extent;
    cam.top = extent;
    cam.bottom = -extent;
    cam.near = 0.5;
    cam.far = quality.far ?? extent * 4;
    cam.updateProjectionMatrix();
  }
}

/**
 * Apply the cast/receive policy across a subtree.
 *
 * Safe to run more than once - it only ever sets flags, so a scene that is mounted twice
 * gets the same answer both times.
 */
export function applyShadowPolicy(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    /*
     * Unlit if ANY material on it is unlit. A mesh with a mixed material array is rare and
     * the conservative answer - leave it out of the shadow pass - is much cheaper to look
     * at than a sky that casts.
     */
    const unlit = materials.some(
      (m) => m instanceof THREE.MeshBasicMaterial || (m as THREE.Material)?.type === 'MeshBasicMaterial'
    );

    mesh.castShadow = !unlit;
    mesh.receiveShadow = !unlit;
  });
}
