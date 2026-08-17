/**
 * The mill road's joke, finally built.
 *
 * ART_DIRECTION §5 gives this scene one sentence and calls it the direction's best joke:
 * *a torch beam is the only volume, everything outside it is tier 1 by diegetic right -
 * she genuinely cannot see it either.* The joke is that the machine's uncertainty and
 * Sanda's are the same uncertainty, and they render identically. Nothing in the room did
 * that. The mill wall, six metres of it, was the palest large mass in the frame - lit,
 * solid, and describing in detail a thing the woman on the phone is walking past in the
 * dark.
 *
 * ## Why this is a shader and not a certainty tier
 *
 * Tier 1 is authored per prop, and this cannot be: what she can see is decided by where
 * she is pointing the torch, and she moves it - the player is the one moving it. A prop is
 * not knowable or unknowable in this room, a PATCH OF THE WORLD is, and the patch changes
 * every time the beam swings. So the boundary between known and guessed has to live where
 * the beam does, which is per pixel.
 *
 * That turns the room's one interaction into its rendering. Aiming the torch does not just
 * light the road; it RESOLVES it, and the set falls back to a guess behind the beam as it
 * passes. §3's resolve is a reward you are given; this is one you hold in your hand.
 *
 * ## What a guess looks like here
 *
 * The same two things tier 1 uses, for the same reasons (see suspected.ts):
 *
 * 1. **The albedo drains toward the tier-1 fill.** Not to black - a region darker than the
 *    night sky behind it reads as a hole rather than as an object, which is the exact
 *    lesson the fill colour in suspected.ts was moved to learn.
 * 2. **A cyan grid in the emissive**, at one metre, laid on the world rather than on the
 *    model. §9 gives cyan to data and scanning, and a grid the geometry does not own is
 *    the machine measuring a space rather than the space having lines painted on it.
 *
 * A wireframe would have been the literal match to tier 1 and is wrong at this scale: the
 * mill wall is two boxes, so its wireframe is four lines thirty metres long, which says
 * the machine is confident. A metre grid says it is measuring.
 *
 * ## Why unlit surfaces are skipped
 *
 * The night plane and the hillside are not things the machine is guessing at - they are
 * the void the set stands against, and a grid on the sky would say the machine believes
 * there is a surface there. They also have no lighting chunks to inject into, so the guard
 * that keeps them out is the same one waterline.ts uses and costs nothing extra.
 */

import * as THREE from 'three';

import { cloneKeepingShader, renderTargetOf } from './certainty.js';
import { ACCENT } from './palette.js';

/** The tier-1 fill, kept in step with suspected.ts on purpose - one guess, one colour. */
const GUESS_FILL = new THREE.Color('#0a141a');
/** How much of the real surface survives the drain. Enough to keep a value difference. */
const GUESS_KEEP = 0.12;
/** Grid pitch in metres. One metre is a stride, which is the unit a person paces a road in. */
const GRID_METRES = 1;

/**
 * How far from the torch everything is known regardless of where it points.
 *
 * She can see her own boots. A cone with nothing around it puts a hard grid right up to
 * the hem of her coat, which reads as the effect starting at her skin rather than at the
 * edge of what she can make out.
 */
const NEAR_KNOWN = 0.7;
const NEAR_FADE = 2.4;

interface Claimed {
  torchlightOwned?: boolean;
}

export interface Torchlight {
  /**
   * Point the beam. World space, called once a frame from the torch's own idle.
   *
   * Takes the direction rather than a target so the caller can hand over the torch node's
   * own axis - a beam aimed at a point and a body aimed down an axis are two numbers that
   * agree until something moves, which is the bug this scene already had once.
   */
  aim(from: THREE.Vector3, direction: THREE.Vector3): void;
  /** Install on everything lit in a subtree. Idempotent; returns how many it claimed. */
  claim(root: THREE.Object3D, options?: { grid?: number }): number;
}

export interface TorchlightOptions {
  /** Half-angle of the guess cone, radians. Wider than the light's, see below. */
  angle: number;
  /** Softness of the cone edge, 0 to 1, matching a SpotLight's penumbra. */
  penumbra: number;
  /** Metres before the guess closes back in. */
  range: number;
}

/**
 * The shared beam.
 *
 * One uniform set across every material in the room, so there is exactly one torch and it
 * cannot drift between surfaces. The vectors are mutated in place rather than replaced,
 * because three reads the uniform object it was handed at compile time.
 */
export function createTorchlight(options: TorchlightOptions): Torchlight {
  const uBeamFrom = { value: new THREE.Vector3() };
  const uBeamDir = { value: new THREE.Vector3(0, 0, -1) };
  /**
   * Outer and inner cosines, as a spot light computes them.
   *
   * The outer angle is deliberately a little WIDER than the torch light's own. If the two
   * matched exactly, the grid would begin at the precise pixel the light ends and draw a
   * hard ring round the pool - two effects landing on the same edge read as one badly
   * drawn effect. Letting the guess start outside the lit area leaves a band that is
   * neither, which is what the edge of a torch beam actually looks like.
   */
  const outer = Math.cos(options.angle);
  const inner = Math.cos(options.angle * (1 - options.penumbra));
  const uBeamCos = { value: new THREE.Vector2(outer, inner) };
  const uBeamRange = { value: options.range };
  const uGuessFill = { value: GUESS_FILL };
  const uGuessLine = { value: new THREE.Color(ACCENT.data) };

  function install(material: THREE.Material, grid: number): void {
    const previous = material.onBeforeCompile?.bind(material);

    material.onBeforeCompile = (shader, renderer) => {
      previous?.(shader, renderer);
      shader.uniforms.uBeamFrom = uBeamFrom;
      shader.uniforms.uBeamDir = uBeamDir;
      shader.uniforms.uBeamCos = uBeamCos;
      shader.uniforms.uBeamRange = uBeamRange;
      shader.uniforms.uGuessFill = uGuessFill;
      shader.uniforms.uGuessLine = uGuessLine;

      /*
       * World position and world normal, carried across by hand.
       *
       * ## Why after project_vertex and not after begin_vertex
       *
       * Because `transformed` is not finished at begin_vertex. Three's vertex chunk order
       * runs begin_vertex, then morphing, then SKINNING, then displacement, and only then
       * project_vertex - so a varying computed at the top of that list is the BIND POSE.
       * Every static box in this room would have been correct and the one rigged character
       * would have been graded at wherever the artist happened to leave his T-pose, which
       * is the sort of wrong that looks like the effect merely not reaching him.
       *
       * ## Why the instancing branch is still needed here
       *
       * Instancing is the other way round: three never touches `transformed` with it at
       * all, it multiplies `mvPosition` inside project_vertex. So `modelMatrix *
       * transformed` on an InstancedMesh is the prototype blade at the origin, and the
       * whole verge would grade as one point. Both corrections are needed and neither
       * implies the other.
       */
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          ['#include <common>', 'varying vec3 vGuessAt;', 'varying vec3 vGuessN;'].join('\n')
        )
        .replace(
          '#include <project_vertex>',
          [
            '#include <project_vertex>',
            '#ifdef USE_INSTANCING',
            '  vGuessAt = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;',
            '  vGuessN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);',
            '#else',
            '  vGuessAt = (modelMatrix * vec4(transformed, 1.0)).xyz;',
            '  vGuessN = normalize(mat3(modelMatrix) * objectNormal);',
            '#endif',
          ].join('\n')
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          [
            '#include <common>',
            'varying vec3 vGuessAt;',
            'varying vec3 vGuessN;',
            'uniform vec3 uBeamFrom;',
            'uniform vec3 uBeamDir;',
            'uniform vec2 uBeamCos;',
            'uniform float uBeamRange;',
            'uniform vec3 uGuessFill;',
            'uniform vec3 uGuessLine;',
            /*
             * How much of this pixel she can actually see, 0 to 1.
             *
             * Declared up here rather than inline because it is needed twice - once to
             * drain the albedo before lighting and once to hold the grid back after it -
             * and the two must be the same number or the grid appears over lit ground.
             */
            'float mrSeen(vec3 at) {',
            '  vec3 toward = at - uBeamFrom;',
            '  float away = length(toward);',
            '  float cosA = dot(toward / max(away, 1e-4), uBeamDir);',
            '  float cone = smoothstep(uBeamCos.x, uBeamCos.y, cosA);',
            // The beam does not stop, it runs out. Held at full for the first half so the
            // pool has a body rather than being a gradient the whole way.
            '  float reach = 1.0 - smoothstep(uBeamRange * 0.55, uBeamRange, away);',
            `  float near = 1.0 - smoothstep(${NEAR_KNOWN.toFixed(2)}, ${NEAR_FADE.toFixed(2)}, away);`,
            '  return clamp(max(cone * reach, near), 0.0, 1.0);',
            '}',
            /*
             * One grid line, at constant screen width.
             *
             * Divided by fwidth so a line a kilometre away is still a line rather than a
             * pixel of aliasing crawling across the frame - which on a road that recedes
             * thirty metres is not a nicety, it is the difference between a grid and a
             * field of sparkle.
             */
            'float mrLine(vec2 p) {',
            '  vec2 g = abs(fract(p - 0.5) - 0.5) / max(fwidth(p), vec2(1e-5));',
            '  return 1.0 - min(min(g.x, g.y), 1.0);',
            '}',
          ].join('\n')
        )
        /*
         * The drain, after map_fragment for the reason the colour law is: this multiplies
         * the albedo once the texture is in it. Before lighting, so a guessed surface also
         * bounces less light rather than merely looking darker.
         */
        .replace(
          '#include <map_fragment>',
          [
            '#include <map_fragment>',
            'float mrKnown = mrSeen(vGuessAt);',
            `diffuseColor.rgb = mix(mix(uGuessFill, diffuseColor.rgb, ${GUESS_KEEP.toFixed(2)}), diffuseColor.rgb, mrKnown);`,
          ].join('\n')
        )
        /*
         * The grid goes into emissive rather than into the albedo, which is what keeps it
         * from being a painted-on pattern: emissive is added after lighting, so the lines
         * are the same brightness on the near verge and on the far wall. A guess does not
         * get dimmer with distance from the lamp, because there is no lamp - the machine is
         * drawing it.
         *
         * It DOES get dimmer with distance from the CAMERA, and that is a different thing:
         * a one metre grid thirty metres out is finer than a pixel, and left alone it packs
         * into a solid cyan sheet exactly where the road should be receding into nothing.
         */
        .replace(
          '#include <emissivemap_fragment>',
          [
            '#include <emissivemap_fragment>',
            '{',
            '  vec3 n = abs(normalize(vGuessN));',
            '  vec3 w = n / max(n.x + n.y + n.z, 1e-4);',
            `  vec3 q = vGuessAt / ${GRID_METRES.toFixed(1)};`,
            '  float grid = mrLine(q.zy) * w.x + mrLine(q.xz) * w.y + mrLine(q.xy) * w.z;',
            '  float haze = 1.0 - smoothstep(14.0, 34.0, length(vGuessAt - cameraPosition));',
            /*
             * And it thins going up.
             *
             * Without this the mill wall carries a full-strength grid six metres into the
             * air and out of the top of the frame, which is the largest single element in
             * the shot - so the picture reads as graph paper first and as a road with a
             * torch on it second. §3's warning about the resolve applies to this too: an
             * effect that covers everything has stopped being an effect.
             *
             * Falling off above head height is also the honest version. What the machine
             * has been told about is a road, a wall beside it and a man on it - all of that
             * is below about two metres. It has no account of the top of the wall at all,
             * and drawing less there says so.
             */
            '  float low = 1.0 - smoothstep(1.7, 5.2, vGuessAt.y);',
            `  totalEmissiveRadiance += uGuessLine * grid * haze * low * (1.0 - mrSeen(vGuessAt)) * ${grid.toFixed(2)};`,
            '}',
          ].join('\n')
        );
    };

    material.needsUpdate = true;
  }

  return {
    aim(from: THREE.Vector3, direction: THREE.Vector3): void {
      uBeamFrom.value.copy(from);
      uBeamDir.value.copy(direction).normalize();
    },

    claim(root: THREE.Object3D, claimOptions: { grid?: number } = {}): number {
      const grid = claimOptions.grid ?? 1;
      let claimed = 0;

      root.traverse((object) => {
        const mesh = renderTargetOf(object);
        if (!mesh) return;

        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const next: THREE.Material[] = [];

        for (const material of materials) {
          if (!material) continue;

          // Unlit: the sky and the horizon. See the header - not things being guessed at,
          // and with no lighting chunks to inject into either way.
          if ((material as THREE.MeshStandardMaterial).roughness === undefined) {
            next.push(material);
            continue;
          }

          const marked = material as THREE.Material & Claimed;
          if (marked.torchlightOwned) {
            next.push(material);
            continue;
          }

          // Carries the certainty law's shader AND its bookkeeping across the copy. A plain
          // clone() would drop the colour law and let the next certainty pass inject a
          // second copy of it into the same program.
          const mine = cloneKeepingShader(material);
          install(mine, grid);
          (mine as THREE.Material & Claimed).torchlightOwned = true;
          next.push(mine);
          claimed += 1;
        }

        if (next.length > 0) mesh.material = next.length === 1 ? next[0] : next;
      });

      return claimed;
    },
  };
}
