/**
 * OMNISCIENT_ reusable VFX library.
 *
 * Gauntlet §192 asks for a small project-level VFX system rather than ad-hoc per-mission
 * effects. §211 settles the implementation: these are ENGINE.VFXNode definitions driving
 * the engine's own particle system. The Elemental Sandbox reference (§191) stays a
 * technique reference - its hand-written GLSL does not port to this engine's WebGPU/TSL
 * node materials, and rewriting it is not justified inside the Jam schedule.
 *
 * §193 performance rules are honoured here: bounded particle counts, burst emission that
 * terminates, and effects sized as punctuation rather than wallpaper.
 *
 * Colour choices follow the §9 semantic palette:
 *   amber  = old technology / human warmth
 *   cyan   = data / scanning
 *   green  = knowledge / AI activity
 */

import type { VFXDefinitionJSON } from '@gnsx/genesys.js';

/**
 * SparkVFX - P0.
 * A corroded connector letting go. Short, hot, gravity-bound, gone in half a second.
 * This is the punctuation on the ACT beat, so it has to read instantly at gameplay
 * camera distance without washing the frame out.
 */
export const SparkVFX: VFXDefinitionJSON = {
  version: 1,
  name: 'SparkVFX',
  particles: [
    {
      nbParticles: 64,
      intensity: 3.2,
      renderMode: 'stretchBillboard',
      stretchScale: 5.0,
      fadeSize: [0.0, 0.7],
      fadeAlpha: [0.0, 0.75],
      gravity: [0, -9.5, 0],
      appearance: 'square',
      easeFunction: 'easeOutQuad',
      blendingMode: 'additive',
      depthTest: true,
    },
  ],
  emitters: [
    {
      particlesIndex: 0,
      loop: false,
      duration: 0.12,
      nbParticles: 36,
      spawnMode: 'burst',
      particlesLifetime: [0.18, 0.5],
      startPositionMin: [-0.015, -0.015, -0.015],
      startPositionMax: [0.015, 0.015, 0.015],
      directionMin: [-1, 0.1, -1],
      directionMax: [1, 1, 1],
      size: [0.008, 0.022],
      speed: [1.6, 4.2],
      colorStart: ['#fff6d8', '#ffd489'],
      colorEnd: ['#c25a12', '#5a1e00'],
    },
  ],
};

/**
 * ElectricalArcVFX - P0.
 * The moment before the spark: current finding a path it should not have. Faster and
 * colder than sparks, no gravity, and it does not persist - an arc that lingers reads
 * as fire rather than electricity.
 */
export const ElectricalArcVFX: VFXDefinitionJSON = {
  version: 1,
  name: 'ElectricalArcVFX',
  particles: [
    {
      nbParticles: 48,
      intensity: 4.0,
      renderMode: 'stretchBillboard',
      stretchScale: 9.0,
      fadeSize: [0.0, 0.4],
      fadeAlpha: [0.05, 0.35],
      gravity: [0, 0, 0],
      appearance: 'square',
      easeFunction: 'easeOutExpo',
      blendingMode: 'additive',
      depthTest: true,
    },
  ],
  emitters: [
    {
      particlesIndex: 0,
      loop: false,
      duration: 0.08,
      nbParticles: 24,
      spawnMode: 'burst',
      particlesLifetime: [0.06, 0.16],
      startPositionMin: [-0.01, -0.01, -0.01],
      startPositionMax: [0.01, 0.01, 0.01],
      directionMin: [-1, -1, -1],
      directionMax: [1, 1, 1],
      size: [0.006, 0.014],
      speed: [3.5, 7.0],
      colorStart: ['#ffffff', '#bfeaff'],
      colorEnd: ['#2f7ad6', '#101a4a'],
    },
  ],
};

/**
 * CircuitPulseVFX - P0.
 * Knowledge moving through the machine. Slow, quiet, acid green - this fires on a
 * learned fact or a cross-domain connection (§107), so it must feel like a reward
 * rather than an alarm. §168: not every second needs noise, and this is one of the
 * few effects the player will see repeatedly.
 */
export const CircuitPulseVFX: VFXDefinitionJSON = {
  version: 1,
  name: 'CircuitPulseVFX',
  particles: [
    {
      nbParticles: 40,
      intensity: 2.0,
      renderMode: 'billboard',
      fadeSize: [0.15, 0.85],
      fadeAlpha: [0.2, 0.8],
      gravity: [0, 0.35, 0],
      appearance: 'circular',
      easeFunction: 'easeInOutSine',
      blendingMode: 'additive',
      depthTest: true,
    },
  ],
  emitters: [
    {
      particlesIndex: 0,
      loop: false,
      duration: 0.6,
      nbParticles: 22,
      spawnMode: 'time',
      particlesLifetime: [0.5, 1.1],
      startPositionMin: [-0.04, 0, -0.04],
      startPositionMax: [0.04, 0.02, 0.04],
      directionMin: [-0.2, 0.6, -0.2],
      directionMax: [0.2, 1, 0.2],
      size: [0.014, 0.032],
      speed: [0.25, 0.7],
      colorStart: ['#d8ffb0', '#7fe08a'],
      colorEnd: ['#2f6b3a', '#0b2413'],
    },
  ],
};

/**
 * DustVFX - P0, and the cheapest atmosphere in the build.
 *
 * §186 asks for haze, dust and shafts of light to create painterly depth economically.
 * Slow motes drifting through a key light do more for "somebody works here" than any
 * amount of modelled clutter. Loops quietly and never draws attention to itself (§168).
 */
export const DustVFX: VFXDefinitionJSON = {
  version: 1,
  name: 'DustVFX',
  particles: [
    {
      nbParticles: 120,
      intensity: 0.9,
      renderMode: 'billboard',
      fadeSize: [0.2, 0.8],
      fadeAlpha: [0.25, 0.75],
      // Barely falling. Dust in still air, not snow.
      gravity: [0.01, -0.012, 0],
      appearance: 'circular',
      easeFunction: 'easeInOutSine',
      blendingMode: 'normal',
      depthTest: true,
    },
  ],
  emitters: [
    {
      particlesIndex: 0,
      loop: true,
      duration: 9,
      nbParticles: 110,
      spawnMode: 'time',
      particlesLifetime: [6, 11],
      // A volume roughly the size of the working half of a room.
      startPositionMin: [-2.2, 0.1, -1.8],
      startPositionMax: [2.2, 2.6, 1.4],
      directionMin: [-0.3, -0.1, -0.3],
      directionMax: [0.3, 0.25, 0.3],
      size: [0.006, 0.018],
      speed: [0.01, 0.05],
      colorStart: ['#efe0c4', '#d8c9ab'],
      colorEnd: ['#8a7f6a', '#6b6152'],
    },
  ],
};

/** Every P0 effect, keyed by name, for registration and lookup. */
export const VFX_LIBRARY = {
  SparkVFX,
  ElectricalArcVFX,
  CircuitPulseVFX,
  DustVFX,
} as const;

export type VFXName = keyof typeof VFX_LIBRARY;
