/**
 * Where things meet the flood.
 *
 * ART_DIRECTION §5 gives the cellar one sentence - *everything below the line is another
 * material, reflection does the work* - and the reflection was built first. It is the
 * cheaper half. A reflective sheet on a floor tells you there is water somewhere in the
 * room; what tells you how DEEP it is, and that these particular objects are standing in
 * it, is what happens to them at the line.
 *
 * Nothing had it. Vasile stood on top of his own flood, the boxes sat on the surface like
 * they were on a table, and the water was 6cm deep - a wet floor, not something a man
 * telephones a stranger about at night. The depth and the waterline are the same problem:
 * six centimetres is below the threshold at which any of this is visible, so there was
 * nothing to draw a line against.
 *
 * ## What wet actually looks like
 *
 * Two things, and only two:
 *
 * 1. **Darker.** A wet surface has a film of water filling its pores, so less light
 *    scatters back out. This is the big one and it is worth more than any other cue.
 * 2. **Smoother.** That same film is flat where the surface underneath is not, so it
 *    returns a specular the dry material never had.
 *
 * Both are a function of one number - height against the water level - which is why this
 * is a shader rather than a set of decals. A decal has to be authored per object, drawn at
 * the right height, and re-drawn when the level changes; this is correct on everything at
 * once and follows the level when it moves, which matters because in this room the level
 * moving IS the puzzle resolving.
 *
 * The transition band is deliberately asymmetric: it reaches a little way ABOVE the surface
 * and stops sharply below it. That is capillary rise - water climbing into masonry and
 * timber past where the surface actually is - and it is the detail that stops the line
 * reading as a clean geometric cut, which is the giveaway of a fake.
 */

import * as THREE from 'three';

import { cloneKeepingShader, renderTargetOf } from './certainty.js';

/** How far the wetting climbs above the surface, in metres. Masonry wicks; metal does not. */
const RISE = 0.05;
/** How far below the surface the transition finishes. Short: submerged is submerged. */
const FALL = 0.03;
/** Wet albedo, as a fraction of dry. */
const DARKEN = 0.5;
/** Wet roughness. Not zero - this is a film on a rough surface, not a mirror. */
const WET_ROUGHNESS = 0.16;

interface Wetted {
  waterlineOwned?: boolean;
  waterlineLevel?: { value: number };
}

/**
 * Install the wetting into one material.
 *
 * Chained onto any existing `onBeforeCompile` rather than replacing it - the certainty law
 * and the flood's own ripple both use one, and clobbering either would silently remove a
 * whole effect. See `cloneKeepingShader` in certainty.ts for the other half of keeping
 * these alive.
 *
 * The world height comes in through a varying computed from `transformed`, which is the
 * vertex position after every displacement the standard shader applies. Reusing three's own
 * `vWorldPosition` would be tidier and is not available: it only exists when a define this
 * material has no reason to set happens to be on.
 */
function install(material: THREE.Material, level: { value: number }): void {
  const previous = material.onBeforeCompile?.bind(material);

  material.onBeforeCompile = (shader, renderer) => {
    previous?.(shader, renderer);
    shader.uniforms.uWaterLevel = level;

    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying float vWetY;\nvoid main() {')
      .replace(
        '#include <begin_vertex>',
        ['#include <begin_vertex>', 'vWetY = (modelMatrix * vec4(transformed, 1.0)).y;'].join('\n')
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        'varying float vWetY;\nuniform float uWaterLevel;\nvoid main() {'
      )
      /*
       * After map_fragment, for the same reason the colour law goes there: this has to
       * multiply the albedo AFTER the texture is in it, or it can only dim a flat colour
       * and leaves every textured surface bone dry.
       */
      .replace(
        '#include <map_fragment>',
        [
          '#include <map_fragment>',
          'float wet = smoothstep(uWaterLevel + ' + RISE.toFixed(3) + ', uWaterLevel - ' + FALL.toFixed(3) + ', vWetY);',
          'diffuseColor.rgb *= mix(1.0, ' + DARKEN.toFixed(3) + ', wet);',
        ].join('\n')
      )
      /*
       * Roughness after its own include, which is where roughnessFactor finally holds the
       * authored value times the map. Anything earlier gets overwritten by the include.
       */
      .replace(
        '#include <roughnessmap_fragment>',
        [
          '#include <roughnessmap_fragment>',
          'roughnessFactor = mix(roughnessFactor, ' + WET_ROUGHNESS.toFixed(3) + ', wet);',
        ].join('\n')
      );
  };

  material.needsUpdate = true;
}

/**
 * Wet everything in a subtree that crosses the given world height.
 *
 * Must run AFTER the certainty pass rather than during the scene build, and the reason is
 * the same one that has bitten every material change in this project: MeshNode's material
 * setter finishes asynchronously, so anything assigned during a build is overwritten by a
 * load that was already in flight. ContactScene's finishers exist for exactly this.
 *
 * Materials are cloned before being touched, because the palette shares them across rooms
 * and a waterline installed on `MAT.wall` would put a tide mark on every wall in the game.
 * Idempotent: a material this has already claimed is left alone, so re-running on a scene
 * that re-activates costs a traversal and nothing else.
 *
 * The ordering matters and is load-bearing. Certainty clones first and marks its own; this
 * runs afterwards as a finisher and clones once more, carrying those marks with it. After
 * the first activate both passes recognise their own work and neither clones again, so
 * nothing is ever injected twice. Anything that moves this ahead of the certainty pass has
 * to think about that again.
 *
 * Returns the number of materials wetted, so a caller that expected some and got none finds
 * out immediately rather than by looking at a screenshot a day later.
 */
export function applyWaterline(root: THREE.Object3D, level: number): number {
  let wetted = 0;

  root.traverse((object) => {
    const mesh = renderTargetOf(object);
    if (!mesh) return;

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next: THREE.Material[] = [];

    for (const material of materials) {
      if (!material) continue;

      /*
       * Unlit surfaces have no roughness to change and no lighting to darken meaningfully.
       * Sky, painted distance and the water's own sheet are not things that get wet.
       *
       * Tested for the property rather than for a truthy value: a standard material with
       * roughness exactly 0 is a mirror, not an unlit surface, and treating the two the
       * same would leave the shiniest object in the room the only dry one in the flood.
       */
      if ((material as THREE.MeshStandardMaterial).roughness === undefined) {
        next.push(material);
        continue;
      }

      const marked = material as THREE.Material & Wetted;
      if (marked.waterlineOwned) {
        // Already ours - just follow the level, which is how the drain cue animates.
        if (marked.waterlineLevel) marked.waterlineLevel.value = level;
        next.push(material);
        continue;
      }

      /*
       * The shared clone, which carries the shader AND the certainty bookkeeping. A plain
       * `.clone()` here would hand back a material that has the colour law compiled into it
       * and no record of the fact, and the next certainty pass would inject a second copy
       * into the same shader. See cloneKeepingShader.
       */
      const mine = cloneKeepingShader(material);
      const uniform = { value: level };
      install(mine, uniform);
      const owned = mine as THREE.Material & Wetted;
      owned.waterlineOwned = true;
      owned.waterlineLevel = uniform;
      next.push(mine);
      wetted += 1;
    }

    if (next.length > 0) mesh.material = next.length === 1 ? next[0] : next;
  });

  return wetted;
}
