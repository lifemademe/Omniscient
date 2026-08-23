/**
 * ## §231 AMENDED - POST-PROCESSING IS AVAILABLE ON WEBGL
 *
 * §231 said post-process effects are WebGPU-only and fail silently here. That is wrong,
 * and it cost this project a whole art pass of working around a restriction that does not
 * exist. `render/postprocessing/pipelines/WebGLPipeline.ts` is a complete EffectComposer
 * pipeline; only depth of field, pixelation, retro and SSR extend WebGPUOnlyEffectBase.
 * Bloom had in fact been enabled in this game the entire time.
 *
 * What IS unavailable: colour grading, whose `createWebGLEffect` returns an empty effect
 * list. Grading has to stay in the palette and the lights, which is where it already is.
 *
 * The clause of §231 that stands is shadows: casting really is off across the rig,
 * because sixty units cannot fit one directional shadow map. But SSAO is screen space and
 * does not care - so contact darkening, the thing that makes a prop rest on a surface
 * rather than hover above it, was available all along.
 *
 * ## §230 - WHAT THE CONCEPT ART GIVES US, AND WHAT IT DOES NOT
 *
 * Three reference frames were provided. They are generated concept art, and the whole
 * point of §230 is to decide once what is being taken from them so it stops being
 * relitigated every time somebody looks at them again.
 *
 * **The workstation frame.** Copy: the warm pool of lamp light falling on one corner of a
 * cold room; the wall above the desk as a working surface covered in paper; the machine
 * as the only green light in a brown room. Abandon: the volumetric cone around the lamp,
 * the rain on the glass, the photographic vignette. All three are post-process (§231).
 *
 * **The mast frame.** Copy: the figure as a black silhouette against the only bright thing
 * in the frame; the town as a band of small warm lights at the base of a cold picture;
 * layered depth - rail, figure, sea, light, cloud. Abandon: the lighthouse beam as visible
 * volume, the cloud detail, the wet specular on the sea.
 *
 * **The repair shop frame.** Copy: the pegboard wall as dense mid-value texture behind a
 * light-value hero prop; one hard practical light over the bench; the deliberately blocky
 * figure standing in a detailed room. Abandon: photoreal timber grain, the depth-of-field
 * falloff to the window, the dust in the air.
 *
 * The pattern in all three: take the VALUE STRUCTURE and the LIGHT PLACEMENT, leave the
 * lens. Everything abandoned is something a camera did, not something a room did.
 *
 * ---
 *
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

import { applyPaintBanding } from './painterly.js';
import { skyTexture } from './sky.js';
import { pegboardMaps } from './surface.js';

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
  /**
   * Corrosion. The fault Mission 01 turns on, so it has to read instantly.
   *
   * Blue-green, not yellow-green, and the reason is worth keeping. This was `#6f8a4a`, a
   * moss colour - and the transmitter is `inked`, so by the time the player is looking at
   * the connectors the certainty law has pulled the whole prop warm and boosted its chroma
   * by 60%. That takes a moss green to a vivid lemon: the beads read as sixteen yellow
   * stickers applied to the hero prop, which is both the wrong material and the wrong
   * register - UI stuck onto the world rather than crud grown on it.
   *
   * Verdigris is copper carbonate and it is genuinely blue-green, which is also what
   * Mirela says: "there is green crust on the second connector". Starting this far round
   * the wheel means it arrives at a green after the warm pull rather than at a yellow, so
   * the law can do its job - warm means known - without lying about what the stuff is.
   *
   * Its separation from `HUMAN.leaf` (see the note there) widens rather than narrows: the
   * theme is Overgrown and plant green must never be confused with the fault green.
   */
  corrosion: '#4f8a74',
  /** Bright metal, freshly cleaned. The highest value, used sparingly. */
  bright: '#c4bda6',
} as const;

/**
 * The map, wherever the machine draws one.
 *
 * The globe on the console and the surveillance city in mission 08 are the same act: the
 * machine looking at the world from outside it and rendering what it has been told. They
 * are drawn at wildly different scales - a planet in a CRT and a district at street level -
 * and they have to read as the same instrument, which means the colours cannot be two
 * copies of a hex that drift apart the first time either is adjusted.
 *
 * Cold cyan throughout, per §9: this is data, not a place.
 */
export const MAP = {
  /** The graticule. Scaffolding, and deliberately dim - it must not compete. */
  grid: '#153845',
  gridBright: '#26607a',
  /** Land, and buildings. The brightest structure the map itself draws. */
  land: '#3f8fa8',
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
  /**
   * Aprons, undershirts - the lighter mass that separates torso from arms.
   *
   * Pulled down from near-white. At the old values an apron was the brightest thing in
   * the frame including the practical lights, so every figure wearing one read as a
   * person holding a sheet of paper. It has to be lighter than the garment and darker
   * than anything that is actually emitting.
   */
  underlayer: ['#948a74', '#8a8270', '#a2977d'],
  boot: '#2e2723',
  /** Eyes. Near-black, so they hold at any distance and in any of these rooms. */
  eye: '#241f1c',
  belt: '#4a3529',
  /** Buckles, goggle rims, buttons. One warm-grey accent, used sparingly. */
  hardware: '#9a9083',
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
  /**
   * Timber that has been outside for years - a fence rail, a gate, a post.
   *
   * Between `timber` (#9a7248, fresh-sawn and pale) and `timberDark` (#5a4430, which is
   * shadowed structural wood). Weathered rail goes grey and loses its warmth without going
   * to bark colour, and at this scene's exposure it lands around 85/255 against grass at
   * 137 - present as a line, not competing as a highlight.
   *
   * Rougher than either, because sun and rain lift the grain on anything left in them.
   */
  timberWeathered: standard('#806348', 0.94),
  /**
   * The top of a bench somebody actually works at.
   *
   * Not a shade of timber for its own sake - a value decision, and the room it exists for
   * is the one §5 calls the proving ground. Measured there: the empty bench directly in
   * front of the Kestrel-3 came out at luma 192, against the set's own face at 177, its
   * body at 148 and Mirela's face at 138. The brightest, largest thing in the frame was
   * the FURNITURE, which inverts the whole colour law - §2 says the eye goes to the warmest
   * thing in frame and that is supposed to be what the player has earned.
   *
   * MAT.timberDark's note already states the rule this breaks: a framing element lit to the
   * same value as the subject stops framing and starts competing. A bench is the most
   * framing thing in a workshop.
   *
   * It is also the true colour. Fresh pine is `MAT.timber`; a bench top that has had thirty
   * years of oil, solder and forearms on it is several steps down from the timber it was
   * cut from, and nobody has ever seen a workbench the colour of a new plank.
   */
  worktop: standard('#6f5335', 0.88),
  timberLit: standard(HUMAN.timberLit, 0.8),
  /**
   * Floorboards - timber at ROOM scale rather than furniture scale.
   *
   * Box UVs hand every face the whole 0..1 square whatever its size, so the family's
   * per-material repeat is the only thing setting physical grain size (see §239 below).
   * A seven-metre floor wearing MAT.timberDark's [2, 1] gets tiles three and a half
   * metres across, which puts knots the size of a dinner plate in the middle of the
   * boards - from the camera they read as cracks in dried mud, not as a floor.
   *
   * A large flat plane is a different physical object from a plank, and it earns a family
   * member rather than a per-object override.
   */
  floorboard: standard('#6a5136', 0.9),
  /** Worked earth. Darker and redder than MAT.ground, which is a track somebody walks on. */
  soil: standard('#5a4028', 0.98),
  /**
   * A raised bed that gets watered every day, which is a different material from dirt.
   *
   * MAT.soil is worked earth in the open - dry on top, half sand on this coastline,
   * and pale enough that seedlings sit ON it rather than in it. A propagation bed is
   * compost: darker, redder, and damp all the way through, which is most of what
   * makes it read as fertile rather than as a box of ground.
   *
   * Its own entry rather than a darker MAT.soil, because MAT.soil is also the track
   * outside and the field beyond it, and neither of those has been watered this
   * morning. Roughness at the ceiling: wet compost has no sheen at all, and any
   * specular on it reads instantly as plastic.
   *
   * ## Raised from #3a2a1c when the tunnel's exposure was corrected
   *
   * That value was chosen against a scene lit six times too brightly, where it rendered
   * around 50/255 and looked like rich damp earth. With the key brought down to something
   * an afternoon actually is, the same colour lands at FOUR - and the failing bank is the
   * shaded one, so the beds the whole request is about would have been two black troughs.
   *
   * A tuned colour is only ever tuned against an exposure. This is the same material at
   * the same job under a light budget that is now correct: 34/255 on the shaded bank and
   * 80 on the sunlit one, against ground outside at 96 - darker than what surrounds it,
   * which is what says worked and watered, and with the two banks still clearly apart.
   */
  bedSoil: standard('#7d5e40', 1),
  /**
   * The sun, seen. Unlit and unfogged - it is 60m out, past everything that lights or hazes,
   * and it has to be the brightest thing in the frame by a clear margin or it reads as a
   * pale moon.
   */
  sunDisc: new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff1c9'), fog: false }),
  /** The bloom around it. Transparent, so the sky keeps showing through the edge. */
  sunHalo: new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ffbe86'),
    transparent: true,
    opacity: 0.42,
    fog: false,
    depthWrite: false,
  }),
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
   * The dried silt at a high-water line - the pale half of a tidemark.
   *
   * `MAT.tideStain` is 32 luma below `MAT.wall` in albedo, which is a real difference on
   * paper and none at all in Mirela's back corner, where the work lamp does not reach and
   * both collapse to near-black. Asked about directly: the camera was finally pointed at
   * the flood evidence and there was still nothing to see.
   *
   * Dark-on-dark cannot be rescued by framing, so the mark gains its other half. A real
   * tidemark is a stain BELOW the line and a crust of dried silt AT it, and the crust is
   * the part that reads: pale against a dark wall works at any light level, which is the
   * whole reason to reach for it rather than for another lamp.
   */
  tideSilt: standard('#c0b49a', 0.99),
  /**
   * Equipment housings - the crackle-finish grey-green of every field radio ever made.
   *
   * §187 requires the hero prop to stay legible against its environment. The transmitter
   * was aged plastic sitting on timber, two warm mid values a shade apart, so the object
   * the entire mission is about had no edge against the bench it stood on. Cool and
   * desaturated against all that warm wood, it separates on hue as well as value.
   */
  /*
   * Grey, not grey-green. The green cast came off at the request of the eye looking at
   * it: 106/114/104 has the middle channel nine above the average of the other two,
   * which on a warm-lit bench reads as olive. 108/110/111 is neutral and a touch cool.
   *
   * The value barely moves - 111.6 to 109.6 out of 255 - so what §187 bought here is
   * intact. The separation from the timber was never the green, it was being cool and
   * desaturated against a room of warm wood, and neutral grey is more of both.
   */
  equipment: standard('#6c6e6f', 0.62, 0.15),
  /**
   * The inside of that housing - a panel that has been taken off and propped up.
   *
   * `MAT.equipment` is the OUTSIDE of a case: sprayed, slightly metallic, made to look
   * like something. The back of the same panel is bare primed steel that nobody has ever
   * seen, and it should not be the second brightest thing in the room.
   *
   * Which it was, twice. The first fix moved the panel out of the shot's way; the second
   * stood it upright to take the lamp at a grazing angle - and that one was reasoned from
   * the wrong model and moved the value by 2.6 out of 163. The light on it is not diffuse,
   * it is the specular lobe of a flat plate at metalness 0.15 and roughness 0.62 turned
   * toward a hard practical. So: no metalness and rough, which removes the lobe rather
   * than aiming it somewhere else.
   *
   * Worth stating plainly because the lesson is not about a panel. Two geometric fixes in a
   * row failed on a problem that was never geometric, and both of them looked reasonable.
   * Measuring the result each time is the only reason it is not still there.
   */
  /*
   * Neutralised to match the case, and the VALUE is deliberately unchanged.
   *
   * Everything above is about how bright this is, twice over. So the hue moved and the
   * brightness did not: 76.9 to 75.6 out of 255, a difference of one and a third, which
   * is inside the noise of the measurements that produced those numbers. The bay floor
   * now reads as the dark inside of the same grey box rather than as a green panel
   * behind a grey one.
   */
  equipmentBack: standard('#4a4c4d', 0.92, 0),
  /**
   * A slot, a louvre, a hole. Unlit on purpose.
   *
   * The Kestrel-3's vents were `MAT.dark` and came out brown, and it was reported as
   * looking like bars rather than slits - correctly. Three warm influences were stacking on
   * them and none of it was the retro pass, whose `world` look has a neutral tint and only
   * lifts saturation. `HUMAN.dark` is `#2b2724`, a WARM near-black; the certainty law pulls
   * anything `inked` warmer still; and the work lamp then lights them, because a slot that
   * stands 4mm proud of the panel is a surface facing the light.
   *
   * That last one is the real fault and it was my own decision. Proud geometry was the
   * right call for a project with no shadows - a recess with no shadow in it is just a
   * different colour - but a proud bar catches the key and a hole never does. Geometry
   * alone cannot say "hole" here.
   *
   * So the material says it instead. Unlit, so no lamp can find it; un-tone-mapped, so it
   * stays exactly this value whatever the exposure does; and neutral rather than warm, so
   * it reads as absence rather than as dark paint. §4.6 allows unlit as a decision, and
   * the mill road's `cut` already uses the same trick for the same reason - one unlit quad
   * that is blacker than the wall around it reads as a gap in the wall.
   */
  slot: new THREE.MeshBasicMaterial({ color: '#15161a', toneMapped: false }),
  /** Corrugated card. Boxes, packing, the substance of a house being emptied. */
  card: standard('#8a7150', 0.96),
  /**
   * Twine. Fully matte, warm, and never metal.
   *
   * The pinboard's string was MAT.metal, and at 8mm a grey bar across a board is a rail or
   * a scratch rather than a length of string - it was reported as "a line across the notice
   * board". Fibre has no specular at all, which is most of what separates string from wire
   * at this distance, so roughness goes to the ceiling.
   */
  twine: standard('#9a8763', 1),
  /**
   * Pegboard, the wall of Mirela's shop.
   *
   * §230's reading of the repair-shop reference asks for "dense mid-value texture behind a
   * light-value hero prop" and that is exactly the value this has to be: a clear step above
   * MAT.wall so the room does not go dark behind the bench, and a clear step below the
   * Kestrel-3 so the object the mission is about still wins. Everything busy about it lives
   * in the normal map, where §232 charges nothing for it.
   */
  pegboard: standard('#7d6a4c', 0.8),
  /**
   * Galvanised tube. Dull enough to stand in daylight without becoming the subject.
   *
   * Darkened again once the tunnel had a sky behind it. Six hoops under a sun bright
   * enough to throw the shadow Mission 03 turns on came out as the brightest lines in the
   * frame, and they run straight across both beds of seedlings - which are the only thing
   * in that scene the player has to compare. §244: nothing out-contrasts the hero, and
   * here the hero is a difference between two patches of green.
   */
  galvanised: standard('#6c7276', 0.82, 0.15),
  /**
   * Standing water in a cellar.
   *
   * Unlit and translucent rather than reflective: there is no environment probe to reflect
   * and a glossy plane with nothing to mirror renders as a black hole. What sells it is
   * being a flat dark sheet at ankle height under a cold uplight - placement and value,
   * not simulation.
   */
  floodwater: new THREE.MeshBasicMaterial({
    color: '#1c2b31',
    transparent: true,
    opacity: 0.82,
    toneMapped: false,
  }),
  /**
   * Night, several shades above black.
   *
   * A pure black background makes a night scene read as an unfinished one - there is
   * nothing for a roofline to be a silhouette against. This is the value that turns dark
   * into distance.
   */
  nightAir: new THREE.MeshBasicMaterial({ color: '#141b26', toneMapped: false, fog: false }),
  /**
   * The mill wall.
   *
   * MAT.wall is an INTERIOR value, chosen so that everything in a lit room reads against
   * it. Outdoors at midnight it made six metres of blank stone the lightest large mass in
   * frame, and the eye went to a wall with nothing on it instead of down the road. This is
   * the same stone several stops down, which is what unlit stone is.
   */
  millStone: standard('#3b352f', 0.95),
  /**
   * Old tarmac, patched more times than it has been resurfaced.
   *
   * Darker and greyer than MAT.ground, which is soil. A road wants to be the lowest value
   * in an outdoor set so that anything standing on it - a kerb, a lamp column, a person -
   * has something to be lighter than.
   */
  tarmac: standard('#494740', 0.97),
  /**
   * A hillside at midnight - one step above the sky and no more.
   *
   * The far layer of a night set has exactly one job, which is to stop the horizon being
   * the same value as the void behind it. Anything lighter and the eye leaves the subject
   * and goes to the distance, which is the opposite of what a scene about somebody being
   * followed wants.
   */
  hillNight: new THREE.MeshBasicMaterial({ color: '#1d2733', toneMapped: false, fog: false }),
  /**
   * Glasshouse glazing, seen from outside on an overcast day.
   *
   * Barely tinted and barely opaque. Glass at this distance is not transparent - it is a
   * pale sheen that hides what is behind it, and painting it clear would make the frame
   * read as a skeleton with nothing on it. Depth writing stays ON, unlike the CRT's glass,
   * because this one is a building rather than a highlight and things really are behind it.
   */
  greenhouseGlass: new THREE.MeshStandardMaterial({
    color: '#cfe0dc',
    roughness: 0.32,
    metalness: 0,
    transparent: true,
    opacity: 0.42,
  }),
  /** Painted glasshouse frame - the pale grey-green of every old horticultural building. */
  greenhouseFrame: standard('#8d9a90', 0.75),
  /**
   * Field stone. Cool and desaturated, so a rock never competes with a crop.
   *
   * Warmer stone was tried and the field turned into a beach: rocks the colour of the soil
   * beside them stop reading as rocks and start reading as lumps in the ground.
   */
  fieldStone: standard('#6f6f68', 0.94),
  /** Worn brass. Dark, because a lock older than its door has stopped being yellow. */
  brass: standard('#8f7a3e', 0.55, 0.6),
  /**
   * The frosted panel in a front door, lit from a hall nobody is standing in.
   *
   * Unlit and dim: the house is dark inside, so this is nearly the same value as the door
   * around it. That is the point - it reads as glass only because it is slightly wrong,
   * which is exactly how a dark house looks from the step.
   */
  doorGlass: new THREE.MeshBasicMaterial({ color: '#2c3138', toneMapped: false }),
  /**
   * The bit of sky a night pane returns, in its top corner.
   *
   * Unlit like the glass under it and only a few levels above it - a reflection you can
   * NAME is a mirror, and this is 4mm float glass in a front door. It exists so the pane is
   * not one flat value, because one flat value is what a hole is.
   */
  doorSheen: new THREE.MeshBasicMaterial({ color: '#3d454f', toneMapped: false }),
  /** The landing light upstairs. The only other lit thing on the street. */
  landingLight: new THREE.MeshBasicMaterial({ color: '#e8d6ad', toneMapped: false }),
  /**
   * Inside the house, seen from the step.
   *
   * Unlit, and darker than anything else in the scene by a distance. A hall at two in the
   * morning with one light on upstairs is not dim, it is BLACK - and the value of that is
   * entirely relative: the doorway has to read as deeper than the night outside it, or the
   * opened door looks like a hole onto the street rather than into a house.
   */
  hallDark: new THREE.MeshBasicMaterial({ color: '#0a0c0f', toneMapped: false }),
  /**
   * A painted front door, and its own entry rather than borrowing `timberDark`.
   *
   * `timberDark` is structural wood - joists, rafters, the inside of a frame - and it is
   * shared by half the game. This is a door somebody painted, and it wants to be readable
   * as ITS OWN object under one porch light while the frame around it stays timber. Dark
   * green, which is what half the front doors in a terrace of this age are, and dark enough
   * to hold the panel shadows that do all the modelling on it.
   */
  doorLeaf: standard('#2f3a30', 0.72),
  /**
   * The sunk panels of that door, and they are a MATERIAL rather than a shape.
   *
   * Shadow casting is off across this whole project - the rig spans sixty units and one
   * shadow map cannot cover both ends - so a panel recessed 24mm into a leaf receives
   * exactly the same light as the framing around it and reads as a painted rectangle. The
   * door was modelled correctly and rendered flat, and no amount of extra relief was going
   * to change that.
   *
   * So the recess is expressed the way flat-shaded games have always expressed it: in
   * VALUE. Same hue, a third of the way to black, which is what the inside of a moulding
   * looks like anyway. It costs one material and it is the only thing that makes the door
   * read as joinery from six metres in a scene with one lamp in it.
   */
  doorPanel: standard('#1f2720', 0.78),
  /**
   * Eyeshine.
   *
   * Unlit, and that is the entire point rather than a shortcut: a tapetum lucidum does not
   * obey the scene's lighting, it throws back whatever hits it, so a lit material would go
   * out every time the cat turned away from the porch lamp - which is exactly backwards.
   * Green-gold, because that is what a cat's is; a dog's is blue and a fox's is red, and
   * the difference is the whole of how anybody identifies an animal in a torch beam.
   */
  /**
   * A grey cat, and it is grey for a measurable reason.
   *
   * The first one was `MAT.dark` at #2b2724, on the reasoning that a cat at two in the
   * morning is a silhouette. Which is true, and a silhouette needs something behind it to
   * be a silhouette AGAINST - and there was nothing there but dark brick. Measured on the
   * sill it rendered at 7/255 against brickwork at 56: not a cat-shaped shadow, just a
   * slightly darker patch of night. Reported, correctly, as no cat.
   *
   * At #8a8174 the same spot reads 86 against that 56 - clearly lighter than the wall it
   * sits on, from any angle, without being a white cat in a dark street. Half the cats in
   * the country are this colour and it is the one that survives being unlit.
   */
  /*
   * RE-MEASURED, and the note above is now history rather than instruction.
   *
   * "At #8a8174 the same spot reads 86 against that 56" was true of the frame it was taken
   * from, and that frame no longer exists: the porch light moved off the facade and its decay
   * slackened, and the default shot pulled back from 3.05m to 4.2m. Under the lighting that
   * came out of those two changes the cat measured median 32.7 against brick at 34.5 - DARKER
   * than the wall it is supposed to stand out from, exactly inverting what this value was
   * chosen for.
   *
   * The lesson is not about cats. A colour picked against one lighting setup is a measurement
   * with an expiry date, and nothing tells you when it expires.
   *
   * Lighter, and neutral. The brick behind it runs R-B +29 - strongly warm - so a warm cat has
   * to win on value alone, against a wall lit by the same lamp it is. A grey cat separates on
   * hue as well, which is the axis that was doing no work at all before, and it picks up the
   * cold sky fill that the warm brick does not.
   */
  catFur: standard('#a8a79c', 0.94),
  /*
   * Eye-shine, and it has to be nearly white.
   *
   * At #c8d67a the eyes measured ZERO pixels in a capture - not dim, absent. Some of that is
   * size (fixed in cat.ts) and some is that a mid yellow-green at four metres, through the
   * pixel grid, lands in the same bucket as the lit brick behind it. A cat's eyes at night are
   * the brightest thing on the animal by a long way, because they are a retroreflector aimed
   * back at the light, and near-white is what that looks like.
   */
  catEye: new THREE.MeshBasicMaterial({ color: '#eaffa8', toneMapped: false }),
  /**
   * The landing light lying on the hall floor at the far end.
   *
   * The same warm as `landingLight` and a third of its value, because this is that lamp
   * arriving round a corner and down a staircase rather than the lamp itself. It is the
   * only thing in the hall and it is what the whole request has been about - he has been
   * looking up at that window since the first line.
   */
  landingSpill: new THREE.MeshBasicMaterial({ color: '#4a4030', toneMapped: false }),
  /** Old copper, gone dull. One of the four hands that built Vasile's run. */
  copper: standard('#8a5a3c', 0.6, 0.35),
  /**
   * Painted structural steel - walkways, rails, anything somebody stands on outdoors.
   *
   * MAT.metal is 0.65 metalness at 0.45 roughness, which is right for a bracket catching
   * a rim and badly wrong for a horizontal plate under a light. With no envmap that
   * metalness kills the diffuse and leaves a tight specular lobe as the only response, so
   * Tomas's service platform - a flat metre and a half directly beneath the beacon - came
   * out as the brightest object on the headland after the beacon itself. In a mission
   * about whether a light is on, the second-brightest thing in frame cannot be the floor.
   *
   * Diffuse-dominant, cool, and a clear step below anything it is meant to sit under.
   */
  steel: standard('#454c55', 0.72, 0.15),

  /**
   * The stopcock's handwheel: red oxide, and it is the only saturated thing in the cellar.
   *
   * Every other object down there is a shade of wet grey between 40 and 90 - that is what
   * makes the room read as a flooded cellar, and it is also what makes finding anything in
   * it hard. A valve wheel is painted red in real life for exactly that reason, so this is
   * not a stylisation, it is the one place where the honest colour and the colour the
   * composition needs are the same. It is the answer to the puzzle; it should be the first
   * thing the eye lands on and the only warm note below the waterline.
   *
   * Matte, not gloss. A shiny red wheel would read as plastic and new; this one has been
   * down there as long as the pipes have.
   */
  valveWheel: standard('#c25c40', 0.82, 0.05),

  /**
   * The valve's actuator. Dark, because MAT.equipment was not.
   *
   * `equipment` is #6c6e6f at roughness 0.62, and under the run wash it rendered near the
   * wall's own value - the housing read as a cardboard box taped to the pipework rather
   * than as the one piece of modern hardware in the room. Machine-grey and well below the
   * wall, so it sits against it instead of dissolving into it.
   */
  actuator: standard('#3a3d41', 0.7, 0.35),

  /**
   * Chalk, for the flood marks - which were `paper` and looked like it.
   *
   * ACCENT.bright is #c4bda6 at roughness 0.94, and against a cellar wall that measures in
   * the fifties it rendered as four bright bars floating in the dark - the user read them as
   * "three floating white ones", which is precisely the failure: they were brighter than
   * anything around them, so they detached from the wall and became objects.
   *
   * A chalk line on damp brick is barely lighter than the brick. This is a small step above
   * the wall rather than a leap off it, so the marks read as something drawn ON the surface,
   * which is what they are and what makes them mean anything.
   */
  chalkMark: standard('#8e8878', 0.97),
  // The night sea and sky used to be flat unlit fills here. They are painted gradients
  // now and live in geometry/backdrop.ts, because a backdrop whose whole content is one
  // authored canvas has nothing to share with a material family (§187, and see RoomPart).
  /** The harbour light, burning. The only warm source on the headland. */
  beaconLit: new THREE.MeshBasicMaterial({ color: '#ffcf7a', toneMapped: false }),
  /** The same lens with nothing behind it. Its whole job is to be conspicuously off. */
  beaconDark: standard('#4a4034', 0.7),
  /**
   * The bloom around the beacon lens, in two shells.
   *
   * Two entries rather than the factory this started as. `MAT` is iterated elsewhere as a map
   * of Materials - MainMenu and OmniscientRig both hand its values straight to code expecting
   * one - so a function in it is a type error two files away from the change that caused it.
   * Worth the note: a lookup table's homogeneity is part of its contract even when nothing
   * says so out loud.
   *
   * Additive, so where the shells overlap they sum and the centre comes out brightest without
   * anybody authoring a gradient. Unlit and unfogged for the same reason `sunDisc` is - this
   * is the light itself rather than a surface receiving light, and letting the atmosphere
   * touch it would grey out the one warm thing in a cold frame. `depthWrite` off so they
   * never occlude each other or the lens inside them.
   */
  beaconHaloInner: new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ffcf7a'),
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: false,
  }),
  beaconHaloOuter: new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ffcf7a'),
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: false,
  }),
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
  /**
   * Sky through a window.
   *
   * Was a single flat colour, which spent the cheapest depth cue in an interior on
   * nothing (§241). Now a banded vertical gradient: cool at the top of the aperture,
   * warm and pale at the horizon - the warm-under-cool every reference frame gets its
   * mood from. Still unlit, still un-tone-mapped, and still a clear step below the CRT's
   * brightest green, which is the one thing in the home shot that has to win.
   */
  daylight: new THREE.MeshBasicMaterial({ color: '#d8c49b', toneMapped: false }),
  /**
   * The sea below the horizon. Splitting the glazing in two costs one extra plane and
   * turns a blank rectangle into a view - which is the whole reason these people are on
   * this coast and the reason there is a harbour beacon to fix.
   */
  daylightSea: new THREE.MeshBasicMaterial({ color: '#8f9a8e', toneMapped: false }),
  /**
   * The view out of the window, in three steps of distance.
   *
   * §241 again: distance is VALUE. Each layer is a little darker and a little less blue
   * than the one behind it, which is the whole of aerial perspective and costs three flat
   * colours. Unlit, so they stay behind the glass rather than picking up the desk lamp.
   */
  viewFar: new THREE.MeshBasicMaterial({ color: '#9fb0bd', toneMapped: false, fog: false }),
  viewNear: new THREE.MeshBasicMaterial({ color: '#7d8b93', toneMapped: false, fog: false }),
  viewTown: new THREE.MeshBasicMaterial({ color: '#5f6a70', toneMapped: false, fog: false }),
  /** Unlit - indicator lamps and anything that should read as emitting. */
  lamp: new THREE.MeshBasicMaterial({ color: ACCENT.amber, toneMapped: false }),
  /**
   * A fluorescent tube. The only cold emitter in the family.
   *
   * Basic and un-tone-mapped for the same reason as `lamp`, and there is a second reason
   * here: `applyCertainty` skips MeshBasicMaterial outright, so a tube keeps the colour it
   * was authored with whatever tier the fitting is registered at. That is the correct
   * behaviour and not a workaround - a lamp does not go cold because nobody has described
   * it. A standard material in this slot would be pulled blue at SHAPED and read as off.
   *
   * NOT #ffffff, and the two points below the top of the range are doing real work.
   *
   * The green is what makes it a fluorescent rather than a light. An old halophosphate tube
   * in a coastal workshop is a touch green, everybody has stood under one, and nobody can
   * name the cue - it is the difference between "there is a lamp" and "that room has strip
   * lighting in it". Warm incandescent is `lamp`; this is the other thing entirely.
   *
   * And it is held BELOW white on purpose. ART_DIRECTION §1 gives the eye to the brightest
   * object in frame, and the Kestrel-3 has to win that: it is what the request is about, and
   * this room has already lost it once to a blank white board (see MAT.equipmentBack). A
   * clipped tube would take it again. What saves this one is area rather than value - a
   * 26mm line at four metres is a lead-in, and the radio is a mass.
   */
  tube: new THREE.MeshBasicMaterial({ color: '#dfeee6', toneMapped: false }),
  /** The shut-down control. Dirty red, and the only one of its colour on the machine. */
  warningLamp: new THREE.MeshBasicMaterial({ color: ACCENT.warning, toneMapped: false }),
  /** Knowledge green, unlit. The cable's live end and circuit pulses. */
  knowledgeLamp: new THREE.MeshBasicMaterial({ color: ACCENT.knowledge, toneMapped: false }),
} as const;

/**
 * §239 REVISED - the flat pass.
 *
 * The family used to be dressed in generated timber grain and plaster mottle. It is not
 * any more, and the deletion is the point rather than a regression.
 *
 * Material texture - grain, mottle, crackle - says "this is made of a substance", which
 * is a realism cue, and the reference frames this project is aiming at are stylised. The
 * generators were producing exactly the kind of surface detail that pulls AWAY from the
 * target. §232's contrast budget then trapped the result in the middle: too subtle to
 * read as a deliberate surface, too present to read as clean flat colour, and paying
 * memory and generation cost for the privilege. On Ileana's walls the plaster mottle did
 * not read as plaster at all - it read as DAMP, and made a dressed room look grimy.
 *
 * What flat costs, and where it is paid: with no grain breaking them up, large planes now
 * need GEOMETRY to break them - skirting, plank seams, panel lines, a dado. That is the
 * real work in this change; deleting the generators was the easy half.
 *
 * What flat buys: the §230 light banding reads at full strength, because nothing is
 * competing with the band edges any more. Flat colour and stepped light are the same
 * look, and they reinforce each other.
 *
 * What still gets a map, by the rule that texture must be EVIDENCE and not material:
 *
 *   - The transmitter, whose worn arris and grime are thirty years of one pair of hands
 *     and whose corrosion is the answer to a mission (§131).
 *   - The pegboard, whose holes are what the object IS - now painted rather than
 *     embossed, so they carry the information without the micro-relief.
 *   - Every decal: the rating plate, the OBN sheets, the box labels, the tide line. Those
 *     are text and evidence, and were never material texture in the first place.
 */
function dress(
  material: THREE.MeshStandardMaterial,
  maps: ReturnType<typeof pegboardMaps>
): void {
  if (!maps) return;
  material.map = maps.map;
  material.normalMap = maps.normalMap;
  material.roughnessMap = maps.roughnessMap;
  // The map carries the colour now, so the scalar must be neutral or it tints its own
  // texture. Roughness stays on the material, which is what makes this flat.
  material.color = new THREE.Color('#ffffff');
  material.needsUpdate = true;
}

/**
 * The painterly conversion, applied to the family rather than to objects (§187).
 *
 * Banded direct light on every standard material in the game at once. Unlit materials -
 * the sea, the sky, the lamps, the screens - are exactly the ones that must NOT band,
 * and they select themselves out by not being MeshStandardMaterial.
 */
for (const material of Object.values(MAT)) {
  if (material instanceof THREE.MeshStandardMaterial) applyPaintBanding(material);
}

dress(
  MAT.pegboard,
  pegboardMaps({ color: '#7d6a4c', seed: 'pegboard', repeat: [8.5, 4], pitch: 16 })
);

/**
 * The sky, onto the glazing.
 *
 * Applied by mutation for the same reason as the pegboard: the family reads as a list of
 * colours and the maps are an overlay on it. Banded to five steps so the window matches
 * the stepped light on every lit surface - a smooth gradient in a banded room reads as a
 * hole in the wall rather than as a view through it.
 */
{
  /*
   * Evening, not afternoon - and the value is the point rather than the hour.
   *
   * These were tuned against the HOME shot, where the note above says the window must sit a
   * clear step below the CRT's brightest green because the CRT is the thing that has to win.
   * Correct there. But this material is used in exactly one place, and it is not that shot:
   * it is the cleared house, where there is no CRT, and the thing that has to win is the
   * box on the table.
   *
   * Measured, it was not close. The pane came out at mean 165 against the box at 121 - a
   * large flat slab forty-four values above the subject, in a room whose own builder comment
   * says the window is high and behind "so the table under it is the lit thing in the room".
   * Unlit and un-tone-mapped, it was rendering at its full authored brightness while every
   * lit surface in the room went through the tone curve.
   *
   * Down to roughly the box's own value, which also settles a small lie the room was
   * telling: the pendant is ON. A bare bulb burning under an afternoon sky is somebody who
   * forgot; under a sky this colour it is the reason the fitting is there at all.
   *
   * The light through the window is deliberately NOT re-tinted to match. It stays the cool
   * `#cfe0f0` skylight, which is what a window still gives after the sun is off it, and it
   * keeps the cool-window/warm-bulb split this room's composition is built on.
   */
  const sky = skyTexture({ zenith: '#54677d', horizon: '#a08d6e', bands: 5 });
  if (sky) {
    MAT.daylight.map = sky;
    MAT.daylight.color = new THREE.Color('#ffffff');
    MAT.daylight.needsUpdate = true;
  }
}
