/**
 * What is left on a wall a year after the water went down.
 *
 * `waterline` is the other half of this and solves a different problem: it wets what is
 * standing in a flood RIGHT NOW, darker and smoother below the surface, following the
 * level as it moves. Vasile's cellar needs that. Mirela's workshop and Ileana's front room
 * need the opposite - water that came up one spring, sat for a week and dried out, and
 * has not been back since.
 *
 * Both rooms said so and neither showed it. The dialogue and the hints do the work: a dark
 * line round the bottom of the wall about a hand off the floor, the same mark you find on
 * any wall down here, and it is the reason there is no paper left to check her against. On
 * screen it was a flat band 2cm tall, the same value all the way along, which reads as a
 * painted dado rail rather than as damage.
 *
 * ## What old flood damage actually looks like, in the order the eye reads it
 *
 * 1. **The tide line.** The single darkest thing, and narrow. Suspended silt collects at
 *    the surface and is left behind as a deposit when the level drops. It is never dead
 *    level, because the water was never still.
 * 2. **Salt bloom above it.** As the wall dried, water wicked upward and evaporated,
 *    leaving the salts it carried behind as a pale chalky haze. This is the detail that
 *    separates old damage from wet - a wet wall has nothing pale on it anywhere - and it
 *    is the one most often left out.
 * 3. **Staining below.** Not uniform and not a gradient: blotchy, following whatever the
 *    wall is made of, heaviest just under the line where the deposit is thickest.
 * 4. **Runs.** Vertical streaks descending from the line where the water drained down the
 *    face, which is what stops the whole thing reading as a horizontal stripe.
 * 5. **The earlier years.** This room floods every spring. There is more than one line,
 *    and the others are fainter.
 *
 * Both rooms already carry 1 and 5 as geometry - thin quads standing off the wall, in the
 * right places - so what this adds is 2, 3 and 4, which is everything AROUND the lines.
 * That is the half that was missing and the reason two good marks were reading as a
 * painted dado: nothing happened to the wall on either side of them.
 *
 * All five are a function of height against one level plus noise, which is why this is a
 * shader and not a decal - a decal would have to be drawn per wall, at the right height,
 * for every room, and would tile visibly along a seven metre wall.
 */

import * as THREE from 'three';

import { cloneKeepingShader, renderTargetOf } from './certainty.js';

/** Height of the deposit band, metres. Narrow: the line is the sharpest thing here. */
const LINE = 0.035;
/** How far the salt bloom reaches above the line. */
const BLOOM = 0.09;
/** The colour staining pulls toward - a cold silt grey, against warm timber and plaster. */
const SILT = 'vec3(0.40, 0.43, 0.38)';

interface Stained {
  floodstainOwned?: boolean;
}

/**
 * Noise, in the shader, keyed to world position.
 *
 * Value noise rather than anything cleverer, because it is being asked for blotches on
 * plaster at four octaves and the difference would not survive the CRT pass. Keyed to
 * world XZ+Y so the pattern belongs to the ROOM: two walls meeting in a corner continue
 * each other's staining instead of each restarting at zero, which is the tell that gives
 * away per-object noise every time.
 */
const NOISE = `
float fsHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float fsNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(fsHash(i), fsHash(i + vec2(1.0, 0.0)), u.x),
             mix(fsHash(i + vec2(0.0, 1.0)), fsHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fsFbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * fsNoise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}
`;

function install(material: THREE.Material, level: number, strength: number): void {
  const previous = material.onBeforeCompile?.bind(material);

  material.onBeforeCompile = (shader, renderer) => {
    previous?.(shader, renderer);

    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 vStainAt;\nvoid main() {')
      .replace(
        '#include <begin_vertex>',
        ['#include <begin_vertex>', 'vStainAt = (modelMatrix * vec4(transformed, 1.0)).xyz;'].join('\n')
      );

    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `varying vec3 vStainAt;\n${NOISE}\nvoid main() {`)
      .replace(
        '#include <map_fragment>',
        [
          '#include <map_fragment>',
          // One horizontal coordinate that varies along a wall on either axis, so a back
          // wall and a side wall are both striped along their own length.
          'vec2 fsUv = vec2(vStainAt.x + vStainAt.z, vStainAt.y);',
          'float fsCoarse = fsFbm(fsUv * 1.6);',
          'float fsGrain = fsFbm(fsUv * 7.0);',
          // The line was never still. Wobbling it is most of what stops this reading as
          // a painted stripe.
          `float fsH = vStainAt.y - ${level.toFixed(3)} - (fsCoarse - 0.5) * 0.045;`,
          // Runs, drawn as a per-column value so they are vertical rather than blobby.
          'float fsRun = fsFbm(vec2(fsUv.x * 5.5, 0.0));',
          '',
          '// 3 + 4: blotchy staining below, streaked, heaviest just under the line.',
          'float fsSoak = smoothstep(0.012, -0.03, fsH);',
          'float fsFade = mix(1.0, 0.45, smoothstep(0.0, -0.55, fsH));',
          'float fsDirt = fsSoak * fsFade * (0.45 + 0.75 * fsCoarse) * (0.55 + 0.9 * fsRun);',
          '',
          /*
           * 1 and 5 are already in the room, as geometry.
           *
           * Both rooms carry their tide lines as thin quads standing 2cm off the wall -
           * two of them, because a room that floods every spring has more than one mark -
           * and those are good: crisp, dark, and exactly where the dialogue says. Drawing
           * a second line here would double every one of them.
           *
           * So this contributes a quarter of one instead, which is not a line but the
           * softening either side of the ones that are there. A painted band with a hard
           * top and a hard bottom is what those quads look like on their own, and it is
           * why the wall read as a dado rail rather than as damage.
           */
          `fsDirt += exp(-pow(fsH / ${LINE.toFixed(3)}, 2.0)) * 0.26 * (0.5 + 0.5 * fsGrain);`,
          '',
          `fsDirt = clamp(fsDirt, 0.0, 1.0) * ${strength.toFixed(3)};`,
          `diffuseColor.rgb *= mix(vec3(1.0), ${SILT}, fsDirt);`,
          // Dirt is not just darker, it is less itself. Pulling toward luma keeps the
          // stain from reading as a coloured wash over a colour it never had.
          'float fsLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));',
          'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(fsLuma), fsDirt * 0.35);',
          '',
          '// 2: salt bloom, above the line and only above it.',
          `float fsSalt = exp(-pow((fsH - ${(BLOOM * 0.55).toFixed(3)}) / ${BLOOM.toFixed(3)}, 2.0))`,
          `  * step(0.0, fsH) * (0.3 + 0.7 * fsGrain) * ${strength.toFixed(3)};`,
          'diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.72 + vec3(0.58, 0.59, 0.55) * 0.5, fsSalt * 0.55);',
          '',
          'float fsRough = max(fsDirt * 0.45, fsSalt * 0.8);',
        ].join('\n')
      )
      /*
       * Roughness after its own include, where roughnessFactor finally holds the authored
       * value. Both halves raise it and for opposite reasons: silt is matte because it is
       * loose dust, and salt bloom is matte because it is a crystal crust. Nothing about
       * old flood damage is ever shinier than the wall it is on.
       */
      .replace(
        '#include <roughnessmap_fragment>',
        ['#include <roughnessmap_fragment>', 'roughnessFactor = mix(roughnessFactor, 1.0, fsRough);'].join('\n')
      );
  };

  material.needsUpdate = true;
}

/**
 * Stain every surface in a subtree that the water reached.
 *
 * Same rules as `applyWaterline`, for the same reasons, and they are not optional:
 *
 *   - run it from a scene FINISHER, not during the build, or MeshNode's in-flight material
 *     load lands afterwards and quietly puts the clean material back;
 *   - clone before touching, or a stain installed on the shared `MAT.wall` puts a tide
 *     mark on every wall in the game;
 *   - carry the certainty marks through the clone, and skip anything already claimed, so
 *     re-activating a room does not inject twice.
 *
 * `strength` is the one dial worth having per room. Mirela's shop floods every spring and
 * has been lived with; Ileana's front room went under once, badly, and was cleaned by
 * somebody who cared. Returns the number of materials stained so a caller that expected
 * some and got none finds out now rather than from a screenshot tomorrow.
 */
export function applyFloodstain(root: THREE.Object3D, level: number, strength = 1): number {
  let stained = 0;

  root.traverse((object) => {
    const mesh = renderTargetOf(object);
    if (!mesh) return;

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next: THREE.Material[] = [];

    for (const material of materials) {
      if (!material) continue;
      // Unlit materials are backdrop and sky - not things the water got into.
      if (material instanceof THREE.MeshBasicMaterial || (material as Stained).floodstainOwned) {
        next.push(material);
        continue;
      }
      const mine = cloneKeepingShader(material);
      (mine as THREE.Material & Stained).floodstainOwned = true;
      install(mine, level, strength);
      next.push(mine);
      stained += 1;
    }

    if (next.length > 0) mesh.material = next.length === 1 ? next[0] : next;
  });

  return stained;
}
