/**
 * Stylised water: flat colour, hard bands, and a path of light coming to the camera.
 *
 * ## Why bands and not reflections
 *
 * The realistic version of water is a normal map, a reflection probe and a fresnel term.
 * This project has none of those and should not get them - it casts no shadows, its
 * lighting is quantised into paint bands on purpose, and everything in it is flat colour
 * and hard edges. Water made of gradients would be the one surface in the game pretending
 * to be something else.
 *
 * So the crests are QUANTISED. A smoothstep with a narrow window turns a smooth wave into a
 * hard-edged band, which is how water is drawn when somebody draws it rather than
 * simulates it, and it sits with the paint banding the rest of the scene already uses.
 *
 * ## The sun path is the whole picture
 *
 * A lake at sunset is not interesting because it is blue. It is interesting because there
 * is a corridor of broken light running from the sun to whoever is looking. That corridor
 * is one exponential falloff around the sun's world X, multiplied into the crests so the
 * light lands ON the waves rather than washing over them - and it is the reason to have
 * water in this scene at all.
 *
 * ## Unlit, like everything else out here
 *
 * The outdoor sun is a PointLight with a 26m range, so anything the size of a lake is
 * outside it. Same bargain the ground plane makes: unlit, unfogged, and coloured to sit
 * against the backdrop.
 */

import * as THREE from 'three';

import { SHORE_GLSL } from './shore.js';

export interface WaterOptions {
  /** Deep water, away from the shore. */
  deep: string;
  /** Shallower, warmer water nearer the near edge. */
  shallow: string;
  /** The crest colour - what the light catches. */
  crest: string;
  /** The colour of the sun's own path across the water. */
  glint: string;
  /** World X the sun sits at, which is where the path of light points. */
  sunX: number;
  /** How wide that path is, in metres. */
  sunWidth?: number;
  /** The wet sand and broken water where it meets the shore. */
  foam: string;
  /** Shared time uniform, so water and grass move on the same clock. */
  time: { value: number };
}

export function stylisedWater(options: WaterOptions): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(options.deep),
    fog: false,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = options.time;
    shader.uniforms.uDeep = { value: new THREE.Color(options.deep) };
    shader.uniforms.uShallow = { value: new THREE.Color(options.shallow) };
    shader.uniforms.uCrest = { value: new THREE.Color(options.crest) };
    shader.uniforms.uGlint = { value: new THREE.Color(options.glint) };
    shader.uniforms.uSunX = { value: options.sunX };
    shader.uniforms.uSunWidth = { value: options.sunWidth ?? 9 };
    shader.uniforms.uFoam = { value: new THREE.Color(options.foam) };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        ['#include <common>', 'varying vec3 vWaterAt;', 'uniform float uTime;', SHORE_GLSL].join(
          '\n'
        )
      )
      .replace(
        '#include <begin_vertex>',
        [
          '#include <begin_vertex>',
          '{',
          /*
           * Real displacement, not only a painted band.
           *
           * The crests were shaded onto a flat sheet, which works looking down at it and
           * falls apart the moment the camera drops - a flat plane seen near edge-on has a
           * dead straight far edge and no silhouette at all. Two crossed swells lift the
           * surface so the horizon line breaks up.
           *
           * Damped to nothing at the shore, because water does not heave where it is an
           * inch deep - and undamped it tore up through the sand.
           */
          '  vec3 preWave = (modelMatrix * vec4(transformed, 1.0)).xyz;',
          '  float deepness = clamp(shoreDepth(preWave.xz) / 12.0, 0.0, 1.0);',
          '  float swell = sin(preWave.x * 0.19 + uTime * 0.7)',
          '              + 0.6 * sin(preWave.z * 0.31 - uTime * 0.95);',
          // The plane is rotated flat, so its local Z is the world up.
          '  transformed.z += swell * 0.17 * deepness;',
          '  vWaterAt = (modelMatrix * vec4(transformed, 1.0)).xyz;',
          '}',
        ].join('\n')
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        [
          '#include <common>',
          'varying vec3 vWaterAt;',
          'uniform float uTime;',
          'uniform vec3 uDeep;',
          'uniform vec3 uShallow;',
          'uniform vec3 uCrest;',
          'uniform vec3 uGlint;',
          'uniform float uSunX;',
          'uniform float uSunWidth;',
          'uniform vec3 uFoam;',
          SHORE_GLSL,
        ].join('\n')
      )
      .replace(
        '#include <color_fragment>',
        [
          '#include <color_fragment>',
          '{',
          '  vec2 p = vWaterAt.xz;',
          // Two waves at different rates and angles. One alone reads as corduroy.
          '  float wave = sin(p.x * 0.21 + p.y * 0.11 + uTime * 0.55)',
          '             + 0.55 * sin(p.x * 0.46 - p.y * 0.29 + uTime * 0.83)',
          '             + 0.3 * sin(p.y * 0.75 + uTime * 1.25);',
          '  wave = wave * 0.5 + 0.5;',
          '',
          /*
           * Depth from the real shoreline, not from a straight z.
           *
           * This used to ramp on p.y alone, which meant the colour banded in flat stripes
           * across the lake while the actual water's edge wandered - two different
           * shorelines in one picture, one of them invisible and wrong. Now shallow water
           * follows the beach.
           */
          '  float depth = shoreDepth(p);',
          '  float toShore = clamp(depth / 16.0, 0.0, 1.0);',
          '  vec3 body = mix(uShallow, uDeep, toShore);',
          '',
          // The crests, quantised hard. This is the whole stylisation in one line.
          '  float crest = smoothstep(0.62, 0.66, wave);',
          '  body = mix(body, uCrest, crest * 0.5);',
          '',
          /*
           * The path of light. An exponential around the sun's X, multiplied INTO the
           * crests rather than added over them - so the sun lights the tops of waves and
           * leaves the troughs alone, which is what makes it read as broken water instead
           * of as a spotlight shining on a floor.
           */
          '  float corridor = exp(-pow((p.x - uSunX) / uSunWidth, 2.0));',
          '  float sparkle = smoothstep(0.52, 0.58, wave) * corridor;',
          '  body = mix(body, uGlint, sparkle * 0.9);',
          '',
          /*
           * The foam, in two parts, because a shoreline has two.
           *
           * There is a permanent band of broken pale water in the shallows, and there is a
           * line of it that RUNS - the edge of the last wave sliding up the sand and back.
           * The moving part is what makes a beach look alive; a static rim reads as a
           * sticker cut round the water.
           *
           * Quantised hard like the crests, because this is drawn water.
           */
          '  float edge = 1.0 - smoothstep(0.0, 2.6, depth);',
          '  float run = sin(p.x * 0.42 + uTime * 0.9) * 0.5 + 0.5;',
          '  float lap = 1.0 - smoothstep(0.0, 0.7 + run * 1.5, depth);',
          '  float foam = max(edge * 0.55, smoothstep(0.35, 0.55, lap));',
          '  body = mix(body, uFoam, clamp(foam, 0.0, 1.0) * 0.92);',
          '',
          '  diffuseColor.rgb = body;',
          // Beyond the waterline there is no water. Discarding rather than shrinking the
          // plane is what lets the edge wander without the geometry having to.
          '  if (depth < 0.0) discard;',
          '}',
        ].join('\n')
      );
  };

  return material;
}
