import * as THREE from 'three';

/**
 * Plane geometry for runtime canvas labels in Genesys/WebGPU.
 *
 * The engine uploads project textures with flipY disabled. Reversing the quad's V axis is
 * deterministic at render time and keeps lettering upright.
 *
 * ## `mirrorU`, and why a back face needs it
 *
 * A double-sided sign in this game is two quads: the front, and a second one rotated 180
 * degrees about Y so it faces the other way. That rotation carries the texture with it, and a
 * texture turned to face backwards reads BACKWARDS - so every rear face in the warehouse has
 * been showing its text in mirror writing. Caught on a screen recording where a hanging zone
 * sign read `ƎЯOTƧ`.
 *
 * The fix belongs in the UVs rather than in the transform. A negative scale would cull the
 * quad - the winding reverses - and pre-mirroring the canvas would need a second texture per
 * sign. Reversing U costs nothing, is applied once at build, and cancels the rotation exactly.
 */
export function createWarehouseLabelGeometry(
  width: number,
  height: number,
  mirrorU = false
): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(width, height);
  const uv = geometry.getAttribute('uv');
  for (let index = 0; index < uv.count; index++) {
    uv.setY(index, 1 - uv.getY(index));
    if (mirrorU) uv.setX(index, 1 - uv.getX(index));
  }
  uv.needsUpdate = true;
  return geometry;
}
