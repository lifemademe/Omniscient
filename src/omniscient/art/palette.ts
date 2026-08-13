/**
 * The shared palette and material family.
 *
 * §187: prefer a small reusable material family over unique sets per object. §9 gives the
 * semantic colour language and warns off cyan/magenta cyberpunk - neon is an accent, not
 * the palette.
 *
 * The organising principle is VALUE, not hue. Painterly stylisation reads through large
 * separated value groups: a dark floor, mid walls, lighter props, and the hero object
 * lightest of all, so the thing the mission is about is legible before the player has
 * parsed anything else (§187 - hero props must stay legible against the environment).
 * Detail is deliberately absent; light and value do the work.
 */

import * as THREE from 'three';

/**
 * Human world - warm, imperfect, lived in (§9). Ordered dark to light so the value
 * structure is visible in the source rather than hidden in hex codes.
 */
export const HUMAN = {
  /** Deepest shadow value. Floors, undersides, recesses. */
  shadow: '#332a24',
  /** Concrete, worn plaster. The ground plane. */
  ground: '#4a4038',
  /** Walls. Mid value - everything else reads against this. */
  wall: '#6d6154',
  /** Timber. Warm, slightly saturated, the room's character colour. */
  timber: '#9a7248',
  /** Lighter timber for surfaces catching the key. */
  timberLit: '#b98f5c',
  /** Painted metal, brackets, legs. Cool against all the warmth. */
  metal: '#5d6068',
  /**
   * Aged plastic. The lightest thing in the room, but not white - a genuinely light
   * value blows out under any decent key and takes the value structure with it.
   */
  plastic: '#a89c80',
  /** Dark plastic and rubber. Bezels, grommets. */
  dark: '#2b2724',
} as const;

/** §9 semantic accents. Used sparingly - these are punctuation. */
export const ACCENT = {
  /** Acid green = knowledge / AI activity. */
  knowledge: '#7fe08a',
  /** Amber = old technology, human warmth. Practical lights, indicators. */
  amber: '#e0a24c',
  /** Dirty red = warning, contradiction. */
  warning: '#a8402f',
  /** Cold cyan = data, scanning. */
  data: '#2f7391',
  /** Corrosion. The fault Mission 01 turns on, so it has to read instantly. */
  corrosion: '#6f8a4a',
  /** Bright metal, freshly cleaned. Also paper - the highest value, used sparingly. */
  bright: '#c4bda6',
} as const;

/**
 * People. §185 asks for recurring characters identifiable by silhouette before clothing
 * detail, so these are few and clearly separated in value rather than a wide gamut.
 */
export const PERSON = {
  skin: ['#c99a72', '#a8724e', '#8c5a3c', '#e0b48c', '#6f4630'],
  hair: ['#2b211c', '#4a3428', '#7a6a58', '#1d1a19', '#8c6b45'],
  /** Workwear. Faded, practical, nothing bright. */
  garment: ['#4a5a63', '#6d5a44', '#3f4a3a', '#7a5346', '#55504a'],
  /** Aprons, undershirts - the lighter mass that separates torso from arms. */
  underlayer: ['#b3a58a', '#9c937f', '#c2b79c'],
  boot: '#2e2723',
  belt: '#4a3529',
} as const;

/** Warm key light, as through a coastal window late in the day. */
export const LIGHT = {
  key: '#ffd9a8',
  /** Cool sky bounce, so shadows are not merely dark but *cold*. */
  fill: '#8fa8c4',
  /** Bounce off a warm floor. */
  bounce: '#4a3a2c',
  /** Atmosphere colour. Slightly warmer than the fill so depth reads golden. */
  haze: '#7d6f5e',
} as const;

function standard(color: string, roughness: number, metalness = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

/**
 * One family, built once and shared by every diorama.
 *
 * Roughness carries most of the surface variation - §187 asks for selective roughness
 * variation and simplified material response rather than noisy texture detail.
 */
export const MAT = {
  ground: standard(HUMAN.ground, 0.96),
  wall: standard(HUMAN.wall, 0.92),
  timber: standard(HUMAN.timber, 0.85),
  timberLit: standard(HUMAN.timberLit, 0.8),
  metal: standard(HUMAN.metal, 0.45, 0.65),
  plastic: standard(HUMAN.plastic, 0.72, 0.03),
  dark: standard(HUMAN.dark, 0.6, 0.1),
  corroded: standard(ACCENT.corrosion, 0.95),
  clean: standard(ACCENT.bright, 0.28, 0.85),
  /** Unlit - indicator lamps and anything that should read as emitting. */
  lamp: new THREE.MeshBasicMaterial({ color: ACCENT.amber, toneMapped: false }),
  /** The shut-down control. Dirty red, and the only one of its colour on the machine. */
  warningLamp: new THREE.MeshBasicMaterial({ color: ACCENT.warning, toneMapped: false }),
  /** Knowledge green, unlit. The cable's live end and circuit pulses. */
  knowledgeLamp: new THREE.MeshBasicMaterial({ color: ACCENT.knowledge, toneMapped: false }),
} as const;
