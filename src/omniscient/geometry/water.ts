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

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWaterAt;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvWaterAt = (modelMatrix * vec4(transformed, 1.0)).xyz;'
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
          // Depth: nearer the camera side the water is shallower and warmer.
          '  float toShore = clamp((p.y + 34.0) / 26.0, 0.0, 1.0);',
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
          '  diffuseColor.rgb = body;',
          '}',
        ].join('\n')
      );
  };

  return material;
}
