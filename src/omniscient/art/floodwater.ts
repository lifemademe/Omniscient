/**
 * Standing water in a dark room.
 *
 * ART_DIRECTION §5 gives the flooded cellar one sentence: *everything below the line is
 * another material, reflection does the work.* It was not doing any work at all. The water
 * was a `MeshBasicMaterial` - unlit by definition, so it could not reflect the lamp, or
 * anything else, ever. A flat dark sheet across the floor of a room reads as a floor.
 *
 * Which it did. Vasile stood on a painted rectangle in a cellar with no flood in it, in the
 * one scene whose entire premise is the flood.
 *
 * ## What actually makes water read
 *
 * Not blue, and not transparency. In a dark interior the whole effect is **one bright thing
 * reflected in something that should be solid**. The cellar has a single warm lamp on the
 * back wall; the moment that lamp appears again below the floor line, the floor stops being
 * a floor. Everything else here is in service of that one highlight.
 *
 * So: lit, dark, and smooth enough to return a specular. Roughness is the whole dial.
 * Mirror-smooth gives a hard dot that reads as plastic; too rough and the lamp smears into
 * nothing. 0.18 was measured first and overshot the other way - the highlight clipped at
 * 251 and read as a lamp lying *in* the water rather than as one reflected in it. 0.31 with
 * the metalness pulled back to 0.30 spreads it into something with a soft edge and a long
 * tail, which is what a disturbed surface actually returns.
 *
 * ## The ripple
 *
 * Perturbing the normal rather than the geometry. Displacing vertices would need normals
 * recomputed every frame for the lighting to notice, which is the expensive way to get an
 * effect the fragment shader can produce for free - and the plane is flat enough that
 * nothing would read the silhouette change anyway.
 *
 * Two crossed wave sets at different rates, deliberately not harmonically related, so the
 * pattern never visibly repeats. Slow: this is a cellar that has been filling for days, not
 * open water. A dedicated varying carries the plane UV: the engine's optional `vUv`
 * is not available on every mapless standard-material shader variant.
 */

import * as THREE from 'three';

export interface Floodwater {
  material: THREE.MeshStandardMaterial;
  /** Advance the ripple. Call from the prop's idle. */
  update(deltaTime: number): void;
}

export function createFloodwater(color = '#131f24'): Floodwater {
  const time = { value: 0 };

  const material = new THREE.MeshStandardMaterial({
    color,
    /*
     * Transparent, but only just. Enough that the floor's tone shows through and the water
     * has a depth rather than a colour; not so much that it stops being a surface. The
     * previous 0.82 was hiding the fact that there was nothing underneath worth seeing.
     */
    transparent: true,
    opacity: 0.9,
    roughness: 0.31,
    /*
     * Metalness on water is physically wrong and visually right. A dielectric at grazing
     * incidence is nearly a mirror, which is exactly the look this needs and exactly what a
     * direct-lit renderer with no environment map will not give without help. Half-metal
     * buys the reflection back without turning the surface into chrome.
     */
    metalness: 0.30,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWaterTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec2 vFloodUv;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFloodUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float uWaterTime;\nvarying vec2 vFloodUv;\nvoid main() {')
      .replace(
        '#include <normal_fragment_maps>',
        [
          '#include <normal_fragment_maps>',
          '{',
          '  vec2 wp = vFloodUv * 9.0;',
          '  float t = uWaterTime;',
          '  float nx = sin(wp.x * 3.1 + t * 0.55) * 0.5',
          '           + sin(wp.x * 1.7 - wp.y * 2.3 + t * 0.31) * 0.5;',
          '  float nz = cos(wp.y * 2.7 - t * 0.44) * 0.5',
          '           + sin(wp.x * 2.1 + wp.y * 1.3 + t * 0.23) * 0.5;',
          '  normal = normalize(normal + vec3(nx, 0.0, nz) * 0.10);',
          '}',
        ].join('\n')
      );
  };

  return {
    material,
    update(deltaTime: number): void {
      time.value += deltaTime;
    },
  };
}
