import * as THREE from 'three';

/**
 * Plane geometry for runtime canvas labels in Genesys/WebGPU.
 *
 * The engine uploads project textures with flipY disabled. Reversing the quad's V axis is
 * deterministic at render time and keeps lettering upright on front and independently
 * rotated rear faces.
 */
export function createWarehouseLabelGeometry(width: number, height: number): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(width, height);
  const uv = geometry.getAttribute('uv');
  for (let index = 0; index < uv.count; index++) {
    uv.setY(index, 1 - uv.getY(index));
  }
  uv.needsUpdate = true;
  return geometry;
}
