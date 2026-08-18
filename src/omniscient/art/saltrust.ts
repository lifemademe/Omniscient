/**
 * What the sea does to painted steel.
 *
 * The third of these passes and the same argument as the other two. `waterline` wets what
 * is standing in a flood now; `floodstain` marks a wall the water left a year ago; this
 * one is for a structure that has never been out of the weather at all. Tomas's mast is
 * bolted to a headland above a harbour and has been there long enough for the harbour
 * master to take its light for granted, and on screen it was the same clean blue-grey
 * along its whole height - a mast delivered this morning.
 *
 * ## What weathered coastal steel actually looks like
 *
 * 1. **Runs, not patches.** Water finds a fixing, sits in the joint, and carries rust
 *    DOWN the face below it in a long tapering streak. Steel rusts at its edges and
 *    fastenings first and the flats stay painted for years, so the pattern is vertical
 *    and sparse rather than a uniform grime.
 * 2. **Worse lower down.** Spray reaches the bottom of a structure and not the top, so
 *    there is a gradient - the foot of a mast can be scabbed while the head is sound.
 * 3. **Salt above the rust.** Evaporated spray leaves a pale crystalline bloom, and it is
 *    the thing that says SEA rather than merely old. Rust alone reads as a farmyard.
 * 4. **Rust is warm and dark, salt is cool and pale.** They are opposite moves in value
 *    as well as hue, which is what stops the two reading as one dirty layer.
 *
 * ## Why a shader and not a texture
 *
 * The mast is a lattice: hundreds of thin members merged into one geometry with box UVs
 * that mean nothing across the joins. Any map would tile visibly along every strut. World
 * position does not care how the geometry was assembled, which is the same reason the
 * flood staining is a shader - and it also means the corrosion runs continuously from the
 * mast onto the platform and the rails that meet it, rather than stopping at a seam.
 */

import * as THREE from 'three';

import { cloneKeepingShader, renderTargetOf } from './certainty.js';

/** Rust, warm and dark against painted steel. */
const RUST = 'vec3(0.42, 0.24, 0.13)';
/** Salt, cool and pale. Never white - white on a night scene reads as a blown highlight. */
const SALT = 'vec3(0.72, 0.75, 0.74)';

interface Weathered {
  saltrustOwned?: boolean;
}

/**
 * Noise, keyed to world position so it crosses the joins between merged members.
 *
 * The vertical stretch is the whole trick for streaking: sampling at a coordinate whose
 * y is divided while its x is not turns round blobs into long runs without needing a
 * second noise function or a direction to be passed in.
 */
const NOISE = `
float srHash(vec2 p) {
  return fract(sin(dot(p, vec2(269.5, 183.3))) * 43758.5453123);
}
float srNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(srHash(i), srHash(i + vec2(1.0, 0.0)), u.x),
             mix(srHash(i + vec2(0.0, 1.0)), srHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float srFbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * srNoise(p);
    p *= 2.07;
    a *= 0.5;
  }
  return v;
}
`;

function install(material: THREE.Material, foot: number, head: number, strength: number): void {
  const previous = material.onBeforeCompile?.bind(material);

  material.onBeforeCompile = (shader, renderer) => {
    previous?.(shader, renderer);

    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 vRustAt;\nvoid main() {')
      .replace(
        '#include <begin_vertex>',
        ['#include <begin_vertex>', 'vRustAt = (modelMatrix * vec4(transformed, 1.0)).xyz;'].join('\n')
      );

    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `varying vec3 vRustAt;\n${NOISE}\nvoid main() {`)
      .replace(
        '#include <map_fragment>',
        [
          '#include <map_fragment>',
          // Around the structure rather than along one axis, so a four-sided lattice member
          // is weathered on all four faces instead of two.
          'float srU = vRustAt.x * 0.7 + vRustAt.z * 0.7;',
          `float srH = clamp((vRustAt.y - ${foot.toFixed(3)}) / ${(head - foot).toFixed(3)}, 0.0, 1.0);`,
          '',
          '// 2: spray reaches the foot and not the head.',
          'float srLow = 1.0 - smoothstep(0.0, 0.85, srH);',
          '',
          '// 1: runs. Stretched eight to one, so the noise comes out as streaks down the face.',
          'float srStreak = srFbm(vec2(srU * 5.0, vRustAt.y * 0.62));',
          'float srSeed = srFbm(vec2(srU * 1.3, vRustAt.y * 0.16));',
          '// Sparse: only the top of the noise range rusts, so paint survives in between.',
          'float srRust = smoothstep(0.52, 0.85, srStreak * 0.65 + srSeed * 0.5);',
          `srRust *= (0.25 + 0.9 * srLow) * ${strength.toFixed(3)};`,
          '',
          'diffuseColor.rgb = mix(diffuseColor.rgb, ' + RUST + ', clamp(srRust, 0.0, 0.85));',
          '',
          '// 3: salt, finer and higher up the range than the rust it sits over.',
          'float srGrain = srFbm(vec2(srU * 13.0, vRustAt.y * 9.0));',
          `float srSalt = smoothstep(0.55, 0.95, srGrain) * (0.3 + 0.7 * srLow) * ${(strength * 0.55).toFixed(3)};`,
          'diffuseColor.rgb = mix(diffuseColor.rgb, ' + SALT + ', clamp(srSalt, 0.0, 0.5));',
          '',
          'float srRough = max(srRust * 0.6, srSalt);',
        ].join('\n')
      )
      /*
       * Both raise roughness and neither ever lowers it. Rust is powder and salt is a
       * crust; the one thing corrosion never does is polish the steel it is eating.
       */
      .replace(
        '#include <roughnessmap_fragment>',
        ['#include <roughnessmap_fragment>', 'roughnessFactor = clamp(roughnessFactor + srRough * 0.55, 0.0, 1.0);'].join('\n')
      )
      /*
       * And it kills the metal. A rusted face is an oxide, not a conductor, so leaving
       * metalness up would keep the corroded parts reflecting like the paint around them -
       * which is the single thing that makes fake rust look painted on.
       */
      .replace(
        '#include <metalnessmap_fragment>',
        ['#include <metalnessmap_fragment>', 'metalnessFactor *= 1.0 - clamp(srRust * 0.9, 0.0, 1.0);'].join('\n')
      );
  };

  material.needsUpdate = true;
}

/**
 * Weather every lit surface in a subtree between two heights.
 *
 * `foot` and `head` are world Y: the gradient runs from full at the foot to nearly nothing
 * at the head, so a caller passes the bottom and top of the structure rather than tuning a
 * magic number. Same three rules as the other passes and for the same reasons - run it
 * from a scene finisher so an in-flight material load cannot undo it, clone before
 * touching so the shared palette material is not weathered for the whole game, and skip
 * anything already claimed so re-activating a room does not stack the effect.
 */
export function applySaltRust(
  root: THREE.Object3D,
  options: { foot: number; head: number; strength?: number }
): number {
  const { foot, head, strength = 1 } = options;
  let weathered = 0;

  root.traverse((object) => {
    const mesh = renderTargetOf(object);
    if (!mesh) return;

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next: THREE.Material[] = [];

    for (const material of materials) {
      if (!material) continue;
      // Unlit materials are the sky, the sea glow and the lamp itself - not steel.
      if (material instanceof THREE.MeshBasicMaterial || (material as Weathered).saltrustOwned) {
        next.push(material);
        continue;
      }
      const mine = cloneKeepingShader(material);
      (mine as THREE.Material & Weathered).saltrustOwned = true;
      install(mine, foot, head, strength);
      next.push(mine);
      weathered += 1;
    }

    if (next.length > 0) mesh.material = next.length === 1 ? next[0] : next;
  });

  return weathered;
}
