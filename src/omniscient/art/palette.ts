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
  /** Bright metal, freshly cleaned. The highest value, used sparingly. */
  bright: '#c4bda6',
} as const;

/**
 * Living green. Deliberately separated from ACCENT.corrosion - the theme is Overgrown,
 * and the plant escaping its pot must not read as the same substance as the fault eating
 * Mirela's connector. Cooler and more saturated than the corrosion green.
 */
export const GROWTH = {
  /** Leaf faces catching light. */
  leaf: '#5c7a45',
  /** The shaded mass underneath. Foliage needs two values or it reads as a flat blob. */
  leafDeep: '#38512e',
  /** Stems and tendrils. Woodier, drier. */
  stem: '#6b7248',
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
  /**
   * Atmosphere. Cooled from a warm brown, which was fine over the workstation and wrong
   * everywhere else - on Tomas's headland it painted sixty units of warm haze across a
   * night sea and turned the sky the colour of a dust storm. A neutral cool reads as
   * distance in both places, and lets each scene's own lights carry its temperature.
   */
  haze: '#4c525c',
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
  /**
   * Darker stained timber, for anything in the near foreground. A framing element lit to
   * the same value as the subject stops framing and starts competing - the chair sitting
   * in the front of the home shot has to fall away, not glow.
   */
  timberDark: standard('#5a4430', 0.9),
  timberLit: standard(HUMAN.timberLit, 0.8),
  metal: standard(HUMAN.metal, 0.45, 0.65),
  plastic: standard(HUMAN.plastic, 0.72, 0.03),
  dark: standard(HUMAN.dark, 0.6, 0.1),
  corroded: standard(ACCENT.corrosion, 0.95),
  /**
   * Freshly scraped metal. Metalness this high needs an environment to reflect - it is
   * only ever used on the cleaned connector, which sits under the Contact View key.
   */
  clean: standard(ACCENT.bright, 0.28, 0.85),
  /**
   * Paper. Was sharing `clean`, which made every note and document on the wall a sheet
   * of polished steel - with no envmap in this scene, that renders nearly black.
   */
  paper: standard(ACCENT.bright, 0.94),
  /**
   * The high-water mark left on a wall that floods every spring. Darker and greener than
   * the wall it sits on, the way damp plaster stains - not a painted stripe.
   */
  tideStain: standard('#41453a', 0.98),
  /**
   * Equipment housings - the crackle-finish grey-green of every field radio ever made.
   *
   * §187 requires the hero prop to stay legible against its environment. The transmitter
   * was aged plastic sitting on timber, two warm mid values a shade apart, so the object
   * the entire mission is about had no edge against the bench it stood on. Cool and
   * desaturated against all that warm wood, it separates on hue as well as value.
   */
  equipment: standard('#6a7268', 0.62, 0.15),
  /** Galvanised tube. Dull enough to stand in daylight without becoming the subject. */
  galvanised: standard('#8a8f92', 0.78, 0.2),
  /**
   * Night sea and sky, behind Tomas's mast.
   *
   * Unlit, because they are distance rather than surface - a lit plane out at the horizon
   * picks up the moonlight and reads as a wall thirty metres away instead of as the sea.
   */
  sea: new THREE.MeshBasicMaterial({ color: '#1a2530' }),
  nightSky: new THREE.MeshBasicMaterial({ color: '#28323f' }),
  /** The harbour light, burning. The only warm source on the headland. */
  beaconLit: new THREE.MeshBasicMaterial({ color: '#ffcf7a', toneMapped: false }),
  /** The same lens with nothing behind it. Its whole job is to be conspicuously off. */
  beaconDark: standard('#4a4034', 0.7),
  leaf: standard(GROWTH.leaf, 0.88),
  /**
   * Seedlings that are not getting enough light: paler and yellower than healthy leaf,
   * because that is what starving for light actually looks like. The whole of Adaeze's
   * request is the player noticing that two banks of the same plant are different colours.
   */
  leafPale: standard('#8f9a63', 0.9),
  leafDeep: standard(GROWTH.leafDeep, 0.92),
  stem: standard(GROWTH.stem, 0.9),
  /**
   * Sky through a window. Unlit, so it stays bright regardless of the room's exposure -
   * but NOT pure white. At full value it out-shouted the CRT, which is the one thing in
   * the frame that has to win, so it sits a clear step below the screen's brightest green.
   */
  daylight: new THREE.MeshBasicMaterial({ color: '#d8c49b', toneMapped: false }),
  /**
   * The sea below the horizon. Splitting the glazing in two costs one extra plane and
   * turns a blank rectangle into a view - which is the whole reason these people are on
   * this coast and the reason there is a harbour beacon to fix.
   */
  daylightSea: new THREE.MeshBasicMaterial({ color: '#8f9a8e', toneMapped: false }),
  /** Unlit - indicator lamps and anything that should read as emitting. */
  lamp: new THREE.MeshBasicMaterial({ color: ACCENT.amber, toneMapped: false }),
  /** The shut-down control. Dirty red, and the only one of its colour on the machine. */
  warningLamp: new THREE.MeshBasicMaterial({ color: ACCENT.warning, toneMapped: false }),
  /** Knowledge green, unlit. The cable's live end and circuit pulses. */
  knowledgeLamp: new THREE.MeshBasicMaterial({ color: ACCENT.knowledge, toneMapped: false }),
} as const;
