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
 * ALL FOUR CHECKED AGAINST THE SHIPPING CAMERA.
 *
 * Every value here was originally authored blind, against no camera at all, and two of
 * the four were badly wrong: SparkVFX filled Mirela's whole workshop and ElectricalArcVFX
 * was a lightning strike. Both are `stretchBillboard`, where stretchScale multiplies with
 * particle velocity - so a speed that looks reasonable in the numbers becomes a metre-long
 * streak on screen. The two `billboard` effects, CircuitPulseVFX and DustVFX, were fine as
 * authored.
 *
 * The lesson for anything added later: stretch billboards need looking at, not reading.
 *
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
      // Tuned against the shipping camera, not against a preview.
      //
      // At authored values this filled Mirela's entire workshop with metre-long white
      // streaks - a firework, for what is meant to be a connector letting go under her
      // hand. §93 keeps threat non-graphic and §187 wants it to read at gameplay distance
      // without washing the frame out; it was doing the opposite of both.
      intensity: 3.0,
      renderMode: 'stretchBillboard',
      stretchScale: 2.6,
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
      duration: 0.1,
      nbParticles: 26,
      spawnMode: 'burst',
      particlesLifetime: [0.16, 0.36],
      startPositionMin: [-0.01, -0.01, -0.01],
      startPositionMax: [0.01, 0.01, 0.01],
      directionMin: [-1, 0.1, -1],
      directionMax: [1, 1, 1],
      size: [0.007, 0.017],
      speed: [0.85, 2.1],
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
      // Same overscale as SparkVFX and further past it - stretchScale 9 on a burst
      // travelling at 7 units a second is a lightning strike, not a bracket arcing.
      intensity: 2.6,
      renderMode: 'stretchBillboard',
      stretchScale: 2.4,
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
      nbParticles: 14,
      spawnMode: 'burst',
      particlesLifetime: [0.05, 0.13],
      startPositionMin: [-0.008, -0.008, -0.008],
      startPositionMax: [0.008, 0.008, 0.008],
      directionMin: [-1, -1, -1],
      directionMax: [1, 1, 1],
      size: [0.003, 0.008],
      speed: [0.9, 2.1],
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

/**
 * RotorWashVFX - the floor answering the drone.
 *
 * Four rotors a metre off a concrete slab move air, and the only thing in this game that
 * ever said so was the drone's own shadow. Downwash is what sells altitude: a machine at
 * 0.85m and the same machine at three metres look nearly identical from the chase camera
 * until one of them is kicking dust and the other is not.
 *
 * Built against the rotor wash it depicts rather than as generic dust, which decides every
 * value here:
 *
 *  - It goes OUTWARD and barely upward. `directionMin/Max` is a flat annulus with a slight
 *    lift - air hitting a floor and running sideways. Dust that rises reads as smoke.
 *  - It is SHORT. 0.5 to 1.1 seconds, so the puff dies about where the drone left it and
 *    the trail behind a moving drone stays a trail rather than a fog bank.
 *  - It is DIM and normal-blended. This is a lit interior; additive dust over a pale slab
 *    would glow. DustVFX above is the reference for value - this is a touch lighter than
 *    the floor it comes off, not brighter than the lamps.
 *  - It is BILLBOARD, not stretchBillboard. The library header's own warning: stretch
 *    multiplies with velocity, and these particles are fast at spawn.
 *
 * Emission is driven from WarehouseRig - see updateRotorWash - which parks the node when
 * the drone is too high for it to make sense.
 */
export const RotorWashVFX: VFXDefinitionJSON = {
  version: 1,
  name: 'RotorWashVFX',
  particles: [
    {
      nbParticles: 96,
      intensity: 0.75,
      renderMode: 'billboard',
      fadeSize: [0.0, 0.55],
      fadeAlpha: [0.12, 0.5],
      // Almost none. The wash throws it out, it does not throw it up, and it settles.
      gravity: [0, -0.35, 0],
      appearance: 'circular',
      easeFunction: 'easeOutQuad',
      blendingMode: 'normal',
      depthTest: true,
    },
  ],
  emitters: [
    {
      particlesIndex: 0,
      loop: true,
      duration: 0.5,
      nbParticles: 26,
      spawnMode: 'time',
      particlesLifetime: [0.5, 1.1],
      // A disc on the floor about the width of the airframe, and flat.
      startPositionMin: [-0.34, 0.02, -0.34],
      startPositionMax: [0.34, 0.1, 0.34],
      directionMin: [-1, 0.05, -1],
      directionMax: [1, 0.35, 1],
      size: [0.05, 0.14],
      speed: [0.55, 1.5],
      colorStart: ['#cbbfa6', '#b9ad95'],
      colorEnd: ['#7d7767', '#6a6558'],
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
