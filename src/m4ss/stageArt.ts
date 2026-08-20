/**
 * M4SS stage one, drawn rather than lit.
 *
 * The greybox was flat-shaded boxes: purple stone, a green lip, red torus rings. It read as
 * a diagram of a level. The reference this is built from is a painted overgrown
 * greenhouse-laboratory - dark wet stone, moss running down every seam, slime drips, vines,
 * teal haze with light shafts in it - and none of that is achievable by tinting a cube.
 *
 * So the whole stage is textured from procedurally drawn pixel art. Every texture on this
 * page is generated at load into a canvas and mapped onto the geometry that was already
 * there, which means the level's collision, the swing arcs and every number the harness
 * checks are untouched: this is a paint job over a level that already plays.
 *
 * ## Why drawn and not authored
 *
 * A hand-painted tile sheet would look better and cannot be delivered here. What can be
 * delivered is a generator that follows the reference's RULES - dark stone with a lit top
 * edge, moss pooling in every crevice and running downward, slime highlights on the moss,
 * a limited palette, hard pixels and no anti-aliasing - and applies them consistently across
 * every surface in the stage. Consistency is most of what makes a set of art read as one
 * game, and it is the part a generator is actually good at.
 *
 * Everything here draws with `fillRect` on integer coordinates. One anti-aliased curve
 * anywhere in this file and the whole stage stops being pixel art.
 */

import * as THREE from 'three';

import { createRng, range, seedFrom } from '../omniscient/core/rng.js';

import type { Rng } from '../omniscient/core/rng.js';

/**
 * The stage palette, taken off the reference sheets.
 *
 * Nine colours doing all the work. The discipline matters more than the hues: every surface
 * in the stage is built from this list, so a platform, a vine and the far background are
 * automatically in the same world even though nothing coordinates them.
 */
const PAL_RAW = {
  voidDeep: '#0a1412',
  voidMid: '#10201d',
  hazeFar: '#16302c',
  hazeNear: '#1d413a',
  stoneDark: '#1a2220',
  stoneMid: '#28322e',
  stoneLit: '#38443e',
  stoneEdge: '#4a5850',
  mossDark: '#3d5220',
  mossMid: '#5c7a26',
  mossLit: '#8fae3a',
  slime: '#b9d94a',
  slimeGlow: '#d8f26a',
  vineDark: '#2c2418',
  vineMid: '#4a3d24',
  leafDark: '#2f4a26',
  leafMid: '#456b30',
  leafLit: '#6c9a44',
  capDark: '#5a2f52',
  capLit: '#8f4a7e',
  portalCore: '#7fe8c8',
  portalRim: '#2f8f78',
  /*
   * The warm family, and the reason it exists.
   *
   * Three passes moved values, gains and mutes and the palette count would not shift off
   * 52-55 against a reference of 100. It was never a value problem: the quantiser buckets at
   * sixteen levels a channel, and a stage built entirely from one green-teal ramp occupies
   * the same handful of buckets no matter how many steps that ramp has.
   *
   * The reference is not one family. It is green AND rusted iron AND lamplight AND purple
   * caps, and that variety is most of why it reads as a place rather than as a filter. Metal
   * is the natural carrier: there is a lot of it in the midground, it is structurally
   * separate from the flora, and iron in a wet cave is rust.
   */
  /*
   * Bioluminescence: the cold end of the flora.
   *
   * Pass 4 proved that a new hue family is what moves the palette count, and the warm one it
   * added only carries on metal. The flora is still a single green ramp from mossDark to
   * slimeGlow - four steps of one hue over a very large area - so it contributes almost
   * nothing to the count no matter how much of the frame it covers.
   *
   * Cyan is the right second family for living things: it sits opposite the rust on the
   * wheel, it is what the reference uses for its glowing spores and pools, and it reads as
   * "this is alive" rather than "this is lit" in a way warm light cannot.
   */
  /*
   * The specular, kept in the palette although pass 11 reverted the code that used it.
   *
   * The DIAGNOSIS was right and is still the open question on `value range`: nothing in this
   * stage is wet enough to catch light, and the reference sets the top of its range with
   * near-white pips on running water. What failed was the delivery. Speculars were drawn one
   * and two pixels wide, and at the scale these textures are displayed - and at the scale the
   * audit samples - a single pixel does not survive. It never registers as a highlight; it
   * just averages into its neighbours and muddies them, which cost six palette points and
   * moved the highlights DOWN.
   *
   * A specular has to be big enough to survive downsampling. The next attempt should put it
   * on a FEW large wet surfaces - a pool, a sheeting run down a wall, the top of one lit
   * block - rather than scattering pips across every stone.
   */
  spec: '#eafff2',
  bioCyan: '#2f8fa8',
  bioCore: '#7fe0f0',
  rustDark: '#3a2418',
  rustMid: '#6b4020',
  rustLit: '#9c6034',
  lampWarm: '#e8a54a',
  lampCore: '#f8d88a',
} as const;

/**
 * Pre-compensation for a grade this art cannot opt out of.
 *
 * The project's scene file sets ACES tone mapping at exposure 0.5, and on this renderer a
 * material's `toneMapped: false` does not exempt it - measured, by setting the flag on every
 * surface in the stage and finding the audit's numbers unchanged to the decimal. So the
 * curve is a fact of the pipeline, and the only place left to fix it is the source values.
 *
 * The audit put the stage's highlights 47 short of the reference and its value range at 57%
 * of it, which is what a filmic shoulder at half exposure does to art that was already in
 * gamut when it was drawn. `lift` gains each channel and applies a floor, so the darks come
 * up off the crush point and the lights have somewhere to be after the curve has had them.
 *
 * PAL_RAW keeps the reference-matched hues visible in source: those are the colours the
 * stage IS, and this is only the compensation for how it gets displayed.
 *
 * The gain RISES with the value, and that shape was arrived at by measuring, twice.
 *
 * A constant floor was the first attempt: adding 14 to every channel lifted near-black by a
 * far larger fraction than anything else, and the void went from 6 to 45 against a target of
 * 12 while the highlights - which clamp at 255 anyway - barely moved. A flat multiplier was
 * the second: at 2.05 the highlights landed almost exactly on the reference and the darks
 * were still nearly three times too bright.
 *
 * The two ends simply want different numbers. The darks want about 1.15 and the lights about
 * 2.3, because ACES compresses the top of the range hard and leaves the bottom nearly alone,
 * so a shadow needs almost no help and a highlight needs a great deal. Interpolating the
 * gain across the value gives each end what it asked for, and it is still one curve with two
 * numbers rather than a lookup table nobody can reason about.
 */
const GAIN_LOW = 1.15;
const GAIN_HIGH = 2.3;

/**
 * How much of a colour's saturation survives, by the job it does.
 *
 * The audit put the stage at 84 mean saturation against a reference of 34, and looking at the
 * two side by side the difference is not the hue - both are green - it is that the reference
 * MUTES its world and saturates only what it wants looked at. Its stone is grey with a green
 * cast; mine was green. Its haze is nearly neutral; mine was teal. Meanwhile its slime, its
 * lit leaves and its portal are more saturated than anything I had.
 *
 * That is the whole trick behind why a painted scene reads as atmospheric rather than as a
 * poster: a narrow band of saturated colour against a wide muted field. So structure gets
 * pulled hard toward its own grey and accents keep - or gain - their colour. Mean saturation
 * falls because most of the frame is structure, and the things that matter get LOUDER
 * relative to it rather than quieter.
 */
const MUTE: Partial<Record<keyof typeof PAL_RAW, number>> = {
  voidDeep: 0.3,
  voidMid: 0.3,
  hazeFar: 0.32,
  hazeNear: 0.35,
  stoneDark: 0.3,
  stoneMid: 0.32,
  stoneLit: 0.34,
  stoneEdge: 0.36,
  vineDark: 0.45,
  vineMid: 0.45,
  mossDark: 0.5,
  leafDark: 0.5,
  // Accents keep their colour. These are the things the eye is meant to find.
  mossMid: 0.8,
  mossLit: 0.95,
  leafMid: 0.8,
  leafLit: 0.95,
  slime: 1,
  slimeGlow: 1,
  capDark: 0.85,
  capLit: 0.95,
  portalCore: 1,
  portalRim: 0.9,
  // Rust is structure, so it is muted like structure - but not as hard, or it turns brown-grey
  // and stops being a second hue at all, which was the entire point of adding it.
  // Specular keeps nearly all its (very slight) colour and takes the full gain: it is meant
  // to clip at the top of the range, because that is what a highlight IS.
  spec: 0.9,
  bioCyan: 0.95,
  bioCore: 1,
  rustDark: 0.6,
  rustMid: 0.65,
  rustLit: 0.7,
  lampWarm: 1,
  lampCore: 1,
};
const MUTE_DEFAULT = 0.5;

/** Pull a colour toward its own luminance. 1 leaves it alone, 0 makes it grey. */
function mute(ch: number[], keep: number): number[] {
  const y = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  return ch.map((v) => y + (v - y) * keep);
}

function lift(hex: string, keep: number): string {
  const ch = mute(
    [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)),
    keep
  );
  return `#${ch
    .map((v) => {
      const gain = GAIN_LOW + (GAIN_HIGH - GAIN_LOW) * (v / 255);
      return Math.max(0, Math.min(255, Math.round(v * gain)))
        .toString(16)
        .padStart(2, '0');
    })
    .join('')}`;
}

/**
 * The stage palette, taken off the reference sheets and lifted for the pipeline.
 *
 * Twenty-two colours doing all the work. The discipline matters more than the hues: every
 * surface in the stage is built from this list, so a platform, a vine and the far background
 * are automatically in the same world even though nothing coordinates them.
 */
function buildPal(overrides: Partial<Record<keyof typeof PAL_RAW, string>>): Record<keyof typeof PAL_RAW, string> {
  return Object.fromEntries(
    Object.entries({ ...PAL_RAW, ...overrides }).map(([k, v]) => [
      k,
      lift(v, MUTE[k as keyof typeof PAL_RAW] ?? MUTE_DEFAULT),
    ])
  ) as Record<keyof typeof PAL_RAW, string>;
}

export const PAL = buildPal({});

/*
 * The Stack's palette: the same world, with the warmth removed.
 *
 * Stage two is the service shaft under the lab, and the art bible's temperature rule is
 * that the two stages must not be mistakable for each other even in thumbnails. So the
 * whole structural family walks BLUE - stone, haze, void, moss, leaves - the amber service
 * lights become pale cyan (the lab's emergency circuit, not its lamps), and the rust gets
 * heavier because everything down here is wetter. The reserved accents - slime, portal,
 * bio, caps - are untouched: the player and the things the player uses look the same in
 * both worlds, which is exactly what "reserved" means.
 *
 * Only overrides live here; everything absent inherits the Gallery's value.
 */
const STACK_RAW: Partial<Record<keyof typeof PAL_RAW, string>> = {
  voidDeep: '#081012',
  voidMid: '#0e1a20',
  hazeFar: '#142c34',
  hazeNear: '#1a3a44',
  stoneDark: '#161e22',
  stoneMid: '#242e34',
  stoneLit: '#32424a',
  stoneEdge: '#44525c',
  mossDark: '#2b4426',
  mossMid: '#3f6630',
  mossLit: '#5e8a54',
  leafDark: '#26402e',
  leafMid: '#356044',
  leafLit: '#4f8a68',
  vineDark: '#242018',
  vineMid: '#3c3620',
  rustDark: '#3a2014',
  rustMid: '#6e3c1c',
  rustLit: '#a05a28',
  lampWarm: '#7fc8d8',
  lampCore: '#b8ecf8',
};

/**
 * Everything that makes one stage look like ITSELF, in one object.
 *
 * The bible (M4SS-ART-BIBLE.md section 5) specifies the two stages as different places:
 * the Gallery horizontal, warm and overgrown; the Stack vertical, cold and industrial.
 * Before this existed every generator read one module palette and both stages were the
 * same room twice. The rig calls setStageTheme() before building a stage; generators keep
 * reading PAL and get the right world without knowing themes exist.
 */
export interface StageTheme {
  name: 'gallery' | 'stack';
  pal: Record<keyof typeof PAL_RAW, string>;
  /** Where the light falls from: god rays on a diagonal, or shaft light straight down. */
  light: 'diagonal' | 'vertical';
  /** What the midground architecture is: the greenhouse dome, or the pipe stacks. */
  midground: 'dome' | 'pipes';
  /** What hangs into the frame in front of the play plane. */
  occluders: 'leaves' | 'pipes';
  /** Flora density multiplier - the Stack is where the forest thins out. */
  flora: number;
  /** Final (post-grade) colours for the three parallax forest layers, far to near. */
  forest: [string, string, string];
}

export const THEME_GALLERY: StageTheme = {
  name: 'gallery',
  pal: PAL,
  light: 'diagonal',
  midground: 'dome',
  occluders: 'leaves',
  flora: 1,
  forest: ['#22332e', '#18271f', '#0e1a13'],
};

export const THEME_STACK: StageTheme = {
  name: 'stack',
  pal: buildPal(STACK_RAW),
  light: 'vertical',
  midground: 'pipes',
  occluders: 'pipes',
  flora: 0.4,
  forest: ['#20303a', '#141f29', '#0a121a'],
};

let activeTheme: StageTheme = THEME_GALLERY;

/**
 * Point every generator at one stage's world. PAL is mutated in place because every
 * drawing function on this page reads PAL.x at draw time - swapping the values under them
 * re-themes all twenty-plus generators without a single signature changing.
 */
export function setStageTheme(theme: StageTheme): void {
  activeTheme = theme;
  Object.assign(PAL, theme.pal);
}

export function stageTheme(): StageTheme {
  return activeTheme;
}

/** A canvas at exact pixel size, with smoothing off and nothing drawn yet. */
function surface(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  return { c, g };
}

/** Nearest-filtered texture from a canvas. Anything else defeats the point. */
function pixelTexture(c: HTMLCanvasElement, repeatX = 1, repeatY = 1): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  return t;
}

/**
 * The i-th of n steps along a ramp between two colours.
 *
 * Five passes moved hues, gains and mutes and the palette count would not go past ~62 against
 * a reference of 100. The remaining shortfall was never another hue family - it is that each
 * material here had three or four values where a painted tile sheet has eight or ten. A
 * painter does not pick "the dark stone"; they pick from a ramp, and the ramp is most of what
 * makes a surface look worked rather than filled.
 *
 * Deliberately quantised rather than continuous. A smooth interpolation would give every
 * block a slightly different colour, which is a gradient wearing pixel-art clothes and reads
 * as noise; a fixed ladder of N steps is what a palette actually is.
 */
function ramp(a: string, b: string, n: number, i: number): string {
  return mixHex(a, b, n <= 1 ? 0 : Math.max(0, Math.min(n - 1, i)) / (n - 1));
}

/** Hard blob of pixels, used for every organic shape here. */
function blob(
  g: CanvasRenderingContext2D,
  rng: Rng,
  x: number,
  y: number,
  r: number,
  colour: string,
  squash = 1
): void {
  g.fillStyle = colour;
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.sqrt(Math.max(0, r * r - (dy / squash) * (dy / squash)));
    const jitterEdge = Math.round(range(rng, -1, 1));
    const w = Math.round(half) + jitterEdge;
    if (w <= 0) continue;
    g.fillRect(Math.round(x - w), Math.round(y + dy), w * 2, 1);
  }
}

/**
 * Moss growing down from a line, the way it does on every surface in the reference.
 *
 * The rule the reference follows - and it is what makes the stone read as WET rather than
 * as green-tinted - is that moss collects on horizontal ledges, then runs downward in
 * tapering tongues of varying length, and the very tip of each tongue is the brightest
 * thing on the surface. Three passes: a dark bed, a mid body, and a bright drip.
 */
function mossRun(
  g: CanvasRenderingContext2D,
  rng: Rng,
  x0: number,
  x1: number,
  y: number,
  depth: number
): void {
  // The bed, in two steps rather than one flat band.
  g.fillStyle = PAL.mossDark;
  g.fillRect(x0, y, x1 - x0, Math.max(2, Math.round(depth * 0.3)));
  g.fillStyle = ramp(PAL.mossDark, PAL.mossMid, 5, 1);
  g.fillRect(x0, y, x1 - x0, 1);

  for (let x = x0; x < x1; x += 1) {
    if (rng() > 0.55) continue;
    const run = Math.round(range(rng, depth * 0.2, depth));
    const w = Math.round(range(rng, 1, 3));
    /*
     * Each tongue of moss is shaded along its own length, off a six-step ramp: darkest at the
     * tip where it hangs into shadow, brightest where it meets the ledge. Previously every
     * tongue was one flat mid-green with an optional brighter half, which is two values doing
     * the work of six.
     */
    const RUNS = 6;
    const top = 2 + Math.floor(rng() * 3);
    for (let seg = 0; seg < 4; seg++) {
      const t = seg / 4;
      g.fillStyle = ramp(PAL.mossDark, PAL.mossLit, RUNS, Math.max(0, top - seg));
      g.fillRect(x, y + Math.round(run * t), w, Math.ceil(run * 0.25) + 1);
    }
    /*
     * The drip: a bright pip hanging off the end. This is the detail that sells wetness -
     * and, one time in four, it is bioluminescent rather than slime. Moss covers more of the
     * frame than anything else in the stage, so it is the cheapest place to spend a second
     * hue: a scattering of cold pips through a warm-green field costs nothing and is what
     * stops the flora reading as one flat colour.
     */
    if (rng() > 0.78) {
      const cold = rng() > 0.75;
      g.fillStyle = cold ? PAL.bioCyan : PAL.slime;
      g.fillRect(x, y + run, 1, Math.round(range(rng, 1, 4)));
      g.fillStyle = cold ? PAL.bioCore : PAL.slimeGlow;
      g.fillRect(x, y + run + Math.round(range(rng, 1, 4)), 1, 1);
    }
    // A purple cap tucked into the seam now and then. Small, and the only warm-cool break in
    // an otherwise green band.
    if (rng() > 0.955) {
      const cy2 = y + Math.round(range(rng, 1, 4));
      g.fillStyle = PAL.capDark;
      g.fillRect(x - 2, cy2, 5, 2);
      g.fillStyle = PAL.capLit;
      g.fillRect(x - 1, cy2 - 1, 3, 2);
    }
    x += Math.round(range(rng, 0, 2));
  }
}

/**
 * A stone slab: irregular blocks, dark mortar, a lit top edge, moss in every seam.
 *
 * Tiles horizontally, so one texture dresses a platform of any length. It does not tile
 * vertically and is not asked to - platforms are drawn with the top of the texture at the
 * top of the platform, which is where all the light and all the moss is.
 */
/**
 * `wall` variant: bigger, darker blocks with vertical water-stain streaks, for the
 * boundary walls and tall masses. Floors and walls used one texture and the playtest saw
 * it immediately: a room where the ground and the walls are the same material has no
 * gravity in its art. Walls read as STACKED (big blocks, dark seams, streaks running
 * down); floors read as WALKED (smaller blocks, lit tops).
 */
export function stoneTexture(
  seed: string,
  w = 128,
  h = 96,
  variant: 'floor' | 'wall' = 'floor'
): THREE.CanvasTexture {
  /*
   * Rewritten to the tile reference (exec-*.png in the reference set), which does three
   * things the old block grid never did:
   *
   *  - The stones are ROUNDED, individually shaded pebbles in courses of mixed sizes, not
   *    square blocks. Rounding is corner cuts on integer pixels - never a curve.
   *  - The ooze lives in the SEAMS. The lab pumped culture medium through this masonry,
   *    and it still seeps: chartreuse pockets at grout junctions, drips running down the
   *    faces below them. Seam colour = player colour, which is the story doing the work.
   *  - The lab is IN the stone: rusted pipe runs with riveted plates weave through the
   *    tilework. Horizontal runs on the floor variant, vertical on the wall variant, both
   *    full-span so the pattern tiles without a visible joint.
   *
   * Both variants share one stone vocabulary at two scales, so walls read as STACKED
   * (bigger stones, wider grout, longer drip stains) and floors read as WALKED (smaller
   * stones, moss crown), while still being one quarry.
   */
  const isWall = variant === 'wall';
  const rng = createRng(seedFrom(seed + (isWall ? '-wall' : '')));
  const { c, g } = surface(w, h);

  // Grout first: the darkest thing in the texture, so every gap reads as depth.
  const grout = mixHex(PAL.voidDeep, '#000000', 0.35);
  g.fillStyle = grout;
  g.fillRect(0, 0, w, h);

  const STEPS = 7;

  /**
   * One PILLOWED stone. The first draft drew flat plates with a one-pixel lip and they
   * read as UI buttons on a black board. The reference's stones are volumes: a lit
   * crown fading through the body to a shadowed foot, rough speckle in the interior,
   * and an inner shadow hugging the bottom-right - all of which happens INSIDE the
   * silhouette, which is what makes a rock a rock and not a rectangle.
   */
  const stone = (x: number, y: number, sw: number, sh: number, pick: number): void => {
    const cut = sh > 14 ? 2 : 1;
    // The body, shaded in thirds: crown value, mid value, foot value.
    const crown = ramp(PAL.stoneDark, PAL.stoneEdge, STEPS, Math.min(STEPS - 1, pick + 2));
    const mid = ramp(PAL.stoneDark, PAL.stoneEdge, STEPS, pick);
    const foot = ramp(PAL.stoneDark, PAL.stoneEdge, STEPS, Math.max(0, pick - 2));
    const topH = Math.max(2, Math.round(sh * 0.3));
    const midH = Math.max(2, Math.round(sh * 0.45));
    g.fillStyle = crown;
    g.fillRect(x + cut, y, sw - cut * 2, sh);
    g.fillRect(x, y + cut, sw, sh - cut * 2);
    g.fillStyle = mid;
    g.fillRect(x, y + topH, sw, sh - topH - cut);
    g.fillRect(x + cut, y + topH, sw - cut * 2, sh - topH);
    g.fillStyle = foot;
    g.fillRect(x, y + topH + midH, sw, Math.max(0, sh - topH - midH - cut));
    g.fillRect(x + cut, y + topH + midH, sw - cut * 2, Math.max(0, sh - topH - midH));
    // The inner shadow, hugging the right edge - the side away from the key light.
    g.fillStyle = foot;
    g.fillRect(x + sw - cut - 2, y + topH, 2, sh - topH - cut);
    // Speckle: a few rough flecks per stone, one step off their band's value.
    const flecks = Math.round((sw * sh) / 160);
    for (let f = 0; f < flecks; f++) {
      const fx = x + Math.round(range(rng, 2, sw - 4));
      const fy = y + Math.round(range(rng, 2, sh - 3));
      const band = fy < y + topH ? pick + 2 : fy < y + topH + midH ? pick : pick - 2;
      g.fillStyle = ramp(
        PAL.stoneDark,
        PAL.stoneEdge,
        STEPS,
        Math.max(0, Math.min(STEPS - 1, band + (rng() > 0.5 ? 1 : -1)))
      );
      g.fillRect(fx, fy, 2, 1);
    }
    // A crack, sparingly.
    if (rng() > 0.8 && sh > 12) {
      g.fillStyle = grout;
      let cx2 = x + Math.round(range(rng, 4, sw - 5));
      for (let cy = y + 2; cy < y + sh - 2; cy++) {
        g.fillRect(cx2, cy, 1, 1);
        cx2 += Math.round(range(rng, -1, 1));
      }
    }
  };

  /*
   * Courses of pebbles, mixed sizes. Junction points (where grout lines meet) are
   * collected as the candidate homes for ooze pockets.
   */
  const junctions: Array<{ x: number; y: number }> = [];
  const rowBase = isWall ? 30 : 20;
  const rowVar = isWall ? 10 : 8;
  const gap = isWall ? 3 : 2;
  let y = -Math.round(range(rng, 0, rowBase / 2));
  while (y < h) {
    const rowH = Math.round(range(rng, rowBase, rowBase + rowVar));
    let x = -Math.round(range(rng, 0, 26));
    while (x < w) {
      const sw = Math.round(range(rng, isWall ? 34 : 24, isWall ? 60 : 46));
      const pick = Math.floor((rng() * 0.6 + rng() * 0.6) * STEPS * (isWall ? 0.7 : 0.83));
      stone(x, y, sw, rowH - gap, pick);
      // The occasional small stone pair instead of one wide one.
      if (rng() > 0.75 && sw > 34) {
        g.fillStyle = grout;
        g.fillRect(x + Math.round(sw / 2) - 1, y, 3, rowH - gap);
        stone(x + Math.round(sw / 2) + 2, y + 2, Math.round(sw / 2) - 2, rowH - gap - 4,
          Math.max(0, pick - 1));
      }
      x += sw + gap;
      if (x > 0 && x < w) junctions.push({ x, y: y + rowH - gap });
    }
    y += rowH;
  }

  /*
   * The pipes, woven through the masonry. Full-span so the texture tiles: a horizontal
   * run wraps in x by construction, a vertical run wraps in y. Rust body, lit top edge,
   * riveted joint plates, and a stain bleeding off the underside.
   */
  /*
   * A pipe is corroded MB-dark metal, not timber: the first draft used the rust ramp as
   * the body colour and the pipe read as a wooden beam. The body is a cold metal mix one
   * step off the stone (so it belongs to the same wet room), rust appears only as PATINA
   * blotches creeping from the joints, and the lit edge is thin and cool.
   */
  const metalDark = mixHex(PAL.stoneDark, PAL.rustDark, 0.35);
  const metalMid = mixHex(PAL.stoneMid, PAL.rustDark, 0.3);
  const metalLit = mixHex(PAL.stoneLit, PAL.rustMid, 0.25);
  const pipe = (at: number): void => {
    const thick = Math.round(range(rng, 5, 7));
    const along = (isWall ? h : w) as number;
    const px = at;
    // Body with a thin lit edge on the light side.
    if (isWall) {
      g.fillStyle = mixHex(metalDark, '#000000', 0.4);
      g.fillRect(px - 1, 0, thick + 2, h);
      g.fillStyle = metalMid;
      g.fillRect(px, 0, thick, h);
      g.fillStyle = metalLit;
      g.fillRect(px, 0, 1, h);
      g.fillStyle = metalDark;
      g.fillRect(px + thick - 2, 0, 2, h);
    } else {
      g.fillStyle = mixHex(metalDark, '#000000', 0.4);
      g.fillRect(0, px - 1, w, thick + 2);
      g.fillStyle = metalMid;
      g.fillRect(0, px, w, thick);
      g.fillStyle = metalLit;
      g.fillRect(0, px, w, 1);
      g.fillStyle = metalDark;
      g.fillRect(0, px + thick - 2, w, 2);
    }
    // Joints: clamp collars every few stones, with rust bleeding away from each.
    for (let j = Math.round(range(rng, 6, 24)); j < along; j += Math.round(range(rng, 30, 48))) {
      if (isWall) {
        g.fillStyle = metalDark;
        g.fillRect(px - 2, j, thick + 4, 5);
        g.fillStyle = metalLit;
        g.fillRect(px - 2, j, thick + 4, 1);
      } else {
        g.fillStyle = metalDark;
        g.fillRect(j, px - 2, 5, thick + 4);
        g.fillStyle = metalLit;
        g.fillRect(j, px - 2, 5, 1);
      }
      // Rust patina creeping from the joint, in blotches that thin with distance.
      for (let b = 0; b < 7; b++) {
        const d = Math.round(range(rng, 1, 14));
        const off = Math.round(range(rng, 0, thick - 1));
        g.fillStyle = b < 3 ? PAL.rustMid : PAL.rustDark;
        if (isWall) g.fillRect(px + off, j + (rng() > 0.5 ? d : -d), 2, 2);
        else g.fillRect(j + (rng() > 0.5 ? d : -d), px + off, 2, 2);
      }
    }
    // The leak stain under a horizontal run.
    if (!isWall) {
      const lx = Math.round(range(rng, 8, w - 10));
      g.fillStyle = mixHex(PAL.stoneDark, '#000000', 0.4);
      const stainLen = Math.round(range(rng, 10, 26));
      for (let d = 0; d < stainLen; d++) {
        if (px + thick + d < h) g.fillRect(lx, px + thick + d, 2, 1);
      }
    }
  };
  // One run per tile; the wall gets a second thin one some of the time.
  pipe(isWall ? Math.round(range(rng, 14, w - 24)) : Math.round(range(rng, h * 0.3, h * 0.75)));
  if (isWall && rng() > 0.55) pipe(Math.round(range(rng, 14, w - 24)));

  /*
   * The ooze: culture medium seeping at grout junctions. Pockets sit IN the seam; drips
   * run DOWN the stone faces below the pocket, shaded along their length; the brightest
   * pips are 2x2 so they survive downsampling (the pass-11 lesson).
   */
  const pockets = isWall ? 4 : 6;
  for (let i2 = 0; i2 < pockets && junctions.length > 0; i2++) {
    const j = junctions[Math.floor(rng() * junctions.length)];
    const px = Math.max(4, Math.min(w - 8, j.x - 1));
    const py = Math.max(2, Math.min(h - 4, j.y));
    /*
     * The channel: the medium FLOODS a run of the horizontal seam, brightest at the
     * junction and darkening toward both ends, so the seam reads as full rather than
     * dotted. The first draft placed six-pixel pips and they vanished at game scale.
     */
    const run = Math.round(range(rng, 10, 26));
    for (let d = -run; d <= run; d++) {
      const t = Math.abs(d) / run;
      const cx3 = px + d;
      if (cx3 < 0 || cx3 >= w) continue;
      g.fillStyle = t < 0.25 ? PAL.mossLit : t < 0.6 ? PAL.mossMid : PAL.mossDark;
      g.fillRect(cx3, py, 1, 2);
    }
    // The bulb at the junction and its drip: a fat head tapering to a thread.
    g.fillStyle = PAL.slime;
    g.fillRect(px - 1, py - 1, 4, 3);
    g.fillStyle = PAL.slimeGlow;
    g.fillRect(px, py, 2, 2);
    const drop = Math.round(range(rng, 8, isWall ? 34 : 18));
    for (let d = 0; d < drop; d++) {
      const t = d / drop;
      g.fillStyle = t < 0.3 ? PAL.slime : t < 0.7 ? PAL.mossLit : PAL.mossMid;
      const dw = t < 0.35 ? 3 : t < 0.75 ? 2 : 1;
      if (py + 2 + d < h) g.fillRect(px + Math.floor((3 - dw) / 2), py + 2 + d, dw, 1);
    }
    // The hanging bead at the tip of a long drip.
    if (drop > 14 && py + 3 + drop < h) {
      g.fillStyle = PAL.slime;
      g.fillRect(px, py + 2 + drop, 2, 2);
    }
  }

  // Moss: the floor wears a crown along its walked edge; the wall only flecks.
  if (isWall) {
    for (let i2 = 0; i2 < 20; i2++) {
      g.fillStyle = rng() > 0.5 ? PAL.mossDark : mixHex(PAL.mossDark, PAL.mossMid, 0.5);
      g.fillRect(Math.round(range(rng, 0, w)), Math.round(range(rng, 0, h)), 2, 1);
    }
  } else {
    mossRun(g, rng, 0, w, 0, 14);
  }

  return pixelTexture(c);
}

/**
 * The stage's backdrop: void, haze, silhouetted structures, hanging growth.
 *
 * One wide texture on one plane a long way back. The reference's depth comes almost entirely
 * from value - near-black at the edges, a pale teal glow in the middle distance, everything
 * between them a silhouette - so this is built in bands from dark to light and back, with
 * shapes cut out of each band rather than drawn on top of it.
 */
/**
 * Where a lantern hangs, as a fraction of the backdrop's own size.
 *
 * Returned rather than kept private because the glow has to become a real object in the
 * scene. Painted into the texture it can only ever light the pixels beside it on the same
 * canvas - not the pipework it hangs from, which is drawn in the same pass, and certainly not
 * anything in front. A lamp that cannot light its own bracket is a picture of a lamp.
 */
export interface LanternAt {
  u: number;
  v: number;
}

export function backdropTexture(
  seed: string,
  w = 1024,
  h = 576
): { texture: THREE.CanvasTexture; lanterns: LanternAt[] } {
  const rng = createRng(seedFrom(seed));
  const { c, g } = surface(w, h);

  /*
   * Vertical haze ramp: sixteen bands, DITHERED across every boundary.
   *
   * Sixteen hard bands left a visible contour line every thirty-six rows. Measured, the steps
   * are only three or four values out of 255 - which sounds like nothing, and is nothing in
   * the midtones, but this ramp spends most of its length near black where a four-value step
   * is a large perceptual one, and it spends it across the widest flat field in the stage.
   * Mach banding does the rest. It read as a black strip bolted across the top of the sky.
   *
   * Adding bands is the wrong fix twice over: smaller steps still band, and every band is a
   * palette entry. The pixel-art answer to a large smooth field has always been to DITHER,
   * and it is better than merely not-banding - it puts texture into the one part of the frame
   * that had none, which is the same complaint the audit has been making about flat area
   * since pass 1.
   *
   * Ordered 4x4 Bayer, so the pattern is stable and regular rather than noisy: a random
   * dither in a still background crawls the moment anything scrolls past it.
   *
   * Written through ImageData rather than fills. The dithered pattern is per-pixel, and
   * 590,000 one-pixel `fillRect` calls to generate one background is not a thing to do at
   * mount time.
   */
  const bands = 16;
  const shades: number[][] = [];
  for (let i = 0; i < bands; i++) {
    const t = i / (bands - 1);
    const col = t < 0.55 ? mixHex(PAL.voidDeep, PAL.hazeFar, t / 0.55) : mixHex(PAL.hazeFar, PAL.hazeNear, (t - 0.55) / 0.45);
    shades.push([1, 3, 5].map((k) => parseInt(col.slice(k, k + 2), 16)));
  }
  const BAYER = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];
  const haze = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    // Where this row sits between two bands. The fraction is what gets dithered.
    const f = (y / h) * (bands - 1);
    const lo = Math.min(bands - 1, Math.floor(f));
    const hi = Math.min(bands - 1, lo + 1);
    const frac = f - lo;
    for (let x = 0; x < w; x++) {
      const pick = frac * 16 > BAYER[y & 3][x & 3] ? shades[hi] : shades[lo];
      const o = (y * w + x) * 4;
      haze.data[o] = pick[0];
      haze.data[o + 1] = pick[1];
      haze.data[o + 2] = pick[2];
      haze.data[o + 3] = 255;
    }
  }
  g.putImageData(haze, 0, 0);

  /*
   * A glow behind the middle of the stage, banded into rings.
   *
   * The reference always has one bright thing far away with everything else reading against
   * it. Without it the backdrop is an even wash and the silhouettes have nothing to be
   * silhouettes against.
   */
  const glowR = 190;
  const gx = Math.round(w * 0.52);
  const gy = Math.round(h * 0.52);
  g.globalCompositeOperation = 'lighter';
  for (let r = glowR; r > 0; r -= 8) {
    /*
     * Banded ELLIPSES, not nested rectangles.
     *
     * This was `fillRect(cx - r, cy - r * 0.6, r * 2, r * 1.2)` for eighteen passes, which
     * makes a stack of boxes: the outermost band is a hard rectangle against the haze, and
     * the thing reads as a flat teal panel bolted to the sky rather than as light. Nothing
     * caught it, because in a game capture it sits behind the platforms at a size where a
     * corner is a few pixels, and the audit measures distributions - a rectangle and an
     * ellipse of the same area and colour score identically on all eight axes.
     *
     * Banded is still right. A smooth radial gradient would be the only true gradient in the
     * whole stage and would cost palette; the reference lights its distances in steps.
     *
     * The bands ADD light rather than mixing toward a colour, which is the second half of the
     * same bug and survived the first fix. Mixing each ring toward `hazeNear` means the
     * outermost ring is painted hazeNear exactly - but the haze behind it is a sixteen-step
     * vertical ramp, so hazeNear only matches the background at one height and is brighter
     * than it everywhere else. The result was a pale ellipse with a crisp rim: rounder than
     * the rectangle, and just as obviously an object rather than light.
     *
     * Under `lighter` each band adds a fixed sliver to WHATEVER is beneath it. The outermost
     * adds one twenty-fourth of the total and is invisible against any background, so the
     * glow has no edge at all, while the overlaps accumulate toward the centre and give the
     * banding for free.
     */
    g.fillStyle = 'rgba(63, 125, 108, 0.022)';
    const ry = r * 0.6;
    for (let dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy++) {
      const half = Math.round(r * Math.sqrt(Math.max(0, 1 - (dy / ry) ** 2)));
      if (half > 0) g.fillRect(gx - half, gy + dy, half * 2, 1);
    }
  }
  g.globalCompositeOperation = 'source-over';

  /*
   * Far structures: domes and towers, as flat silhouettes.
   *
   * Flat is right - they are far away, and giving them interior value would pull them onto the
   * gameplay plane. But a silhouette is ONLY its edge, and these were seven `fillRect`s, which
   * is to say seven straight horizontal lines at seven heights. The reference has nothing
   * straight in its distance: every far shape is bitten into, leaning, or crowned with
   * something growing on it, and that ragged edge is most of what makes it read as a ruin
   * rather than as a chart.
   *
   * So each structure is drawn COLUMN BY COLUMN off a height profile instead of as a
   * rectangle. Same colour, same area, same value - the change is entirely in the edge.
   *
   * Three things shape the profile, in this order:
   *   1. a lean, so the tower is not axis-aligned;
   *   2. bites, so the top has collapsed somewhere;
   *   3. a fringe, so something is growing out of the top.
   *
   * The dome is kept for the ones that have it - this is a greenhouse laboratory - but it now
   * shares the profile, so a bite can take a piece out of the dome too.
   */
  /*
   * Ghosts, not shapes: 35% alpha over the haze gradient. Two colour-matching attempts
   * failed the same way - the haze is a sixteen-step vertical RAMP, so any single flat
   * colour matches it at one height and fights it everywhere else (the towers span a
   * third of that ramp). Transparency is the only match that follows the gradient for
   * free: the towers inherit the haze at their own height and read as things standing IN
   * it. The deepest layer in the frame finally behaves like the deepest layer.
   */
  g.globalAlpha = 0.35;
  g.fillStyle = PAL.voidMid;
  for (let i = 0; i < 7; i++) {
    const bx = Math.round(range(rng, 0, w));
    const bw = Math.round(range(rng, 30, 80));
    const bh = Math.round(range(rng, 40, 110));
    const baseY = Math.round(h * 0.62);
    const domed = rng() > 0.45;
    const domeR = bw * 0.4;

    // 1. Lean: a per-column tilt, at most a few pixels across the whole width. More than that
    //    and a "tower" reads as a wedge.
    const lean = range(rng, -0.14, 0.14);

    // 2. Bites: collapsed sections of the top edge, each a soft cosine notch so the ruin has
    //    crumbled rather than been cut.
    const bites: Array<{ at: number; half: number; deep: number }> = [];
    for (let b = 0, n = 1 + Math.floor(rng() * 3); b < n; b++) {
      bites.push({
        at: range(rng, 0, bw),
        half: range(rng, 3, bw * 0.3),
        deep: range(rng, 3, bh * 0.35),
      });
    }

    for (let x = 0; x < bw; x++) {
      let top = bh + x * lean;
      for (const bite of bites) {
        const d = Math.abs(x - bite.at);
        if (d < bite.half) top -= bite.deep * 0.5 * (1 + Math.cos((d / bite.half) * Math.PI));
      }
      /*
       * The dome goes on AFTER the bites, so it survives them.
       *
       * Applied before, it was simply eaten: a bite reaches 35% of tower height and a dome is
       * 40% of tower WIDTH, so on anything tall the notch swallowed the arc whole and seven
       * greenhouses came out as seven rock spires. The bites are meant to say the tower has
       * collapsed; the dome is the only thing in the distance that says laboratory at all.
       */
      if (domed) {
        const dx = x - bw / 2;
        top += Math.sqrt(Math.max(0, domeR * domeR - dx * dx)) * 1.1;
      }
      // Quantised to 2px so the edge stays pixel art rather than an antialiased curve.
      top = Math.max(4, Math.round(top / 2) * 2);
      g.fillRect(bx + x, baseY - top, 1, top + 40);

      // 3. Fringe: growth on the roofline, one or two pixels of it, on some columns only.
      if (rng() > 0.72) {
        g.fillRect(bx + x, baseY - top - (rng() > 0.6 ? 2 : 1), 1, 2);
      }
    }

    // Lit panes, the only warm thing in the distance. Nearly opaque against the ghost
    // body - a lit window is the one part of a ruin the eye should still find.
    if (rng() > 0.5) {
      g.globalAlpha = 0.8;
      g.fillStyle = '#4a7f5f';
      for (let k = 0; k < 5; k++) {
        g.fillRect(bx + Math.round(range(rng, 3, bw - 6)), baseY - Math.round(range(rng, 6, bh - 6)), 3, 4);
      }
      g.globalAlpha = 0.35;
      g.fillStyle = PAL.voidMid;
    }
  }
  g.globalAlpha = 1;

  /*
   * A midground band of machinery, between the far silhouettes and the level.
   *
   * The audit had a third of the frame as one colour and the palette at half the reference's,
   * and both numbers were saying the same thing: the middle distance is empty. The reference
   * never has a bare wall - there is always a tank, a pipe run, a broken frame or a root mass
   * sitting between you and the far dark, and each of those carries its own value.
   *
   * So this layer exists to be OCCUPIED rather than to be looked at. It sits at values between
   * the far silhouettes and the haze, dark enough to stay behind the gameplay plane and
   * distinct enough that the eye reads depth instead of a flat field.
   */
  const midY = Math.round(h * 0.42);
  /*
   * Five, down from nine: the forest parallax layers occupy the middle distance now, and
   * nine machines fought them for it. What remains is machinery being EATEN - every top
   * edge grown over, strands hanging off the faces - because a clean rectangle among
   * organic silhouettes reads as a sticker, and the pass-25 critique caught exactly that.
   */
  for (let i = 0; i < 5; i++) {
    const bx = Math.round(range(rng, -20, w));
    /*
     * Rusted iron, sitting in the dark band.
     *
     * These were mixed from voidMid and hazeFar - the same green-teal as everything else -
     * which is why nine large structures added area and no colour. Mixing toward rust instead
     * keeps them at background VALUE while putting them in a different hue family, which is
     * the one thing the palette count has been asking for since pass 1.
     *
     * A brighter spread of these was tried in pass 3 and reverted: lightening the midground
     * pushes it toward the values of the gameplay plane, and a background that competes with
     * the foreground is worse than one that is slightly too dark.
     */
    /*
     * Cooled in the redo. The rust dial was set when this band was the only second hue in
     * the frame; the play plane's pipes and patina carry the rust now, and the first live
     * capture of the redo had one of these slabs as the most saturated object on screen -
     * a floating orange platform in a world that had just gone cold. Background structures
     * hold background values in the steel family, warm only faintly.
     */
    const tone = mixHex(
      mixHex(PAL.voidMid, PAL.rustDark, range(rng, 0.25, 0.5)),
      PAL.stoneMid,
      range(rng, 0.2, 0.5)
    );

    if (rng() > 0.5) {
      // A tank: a tall cylinder with banding hoops and a domed cap.
      const tw = Math.round(range(rng, 26, 52));
      const th = Math.round(range(rng, 50, 130));
      g.fillStyle = tone;
      g.fillRect(bx, midY - th, tw, th + 60);
      g.fillStyle = mixHex(tone, PAL.voidDeep, 0.5);
      for (let k = 0; k < 5; k++) {
        g.fillRect(bx, midY - th + Math.round((k / 5) * th), tw, 2);
      }
      // A lit sliver down one side, so the cylinder reads as round - steel light, not rust.
      g.fillStyle = mixHex(tone, PAL.stoneEdge, 0.6);
      g.fillRect(bx + tw - 4, midY - th, 3, th);
      // Contents, faintly.
      if (rng() > 0.55) {
        g.fillStyle = mixHex(PAL.mossDark, tone, 0.4);
        g.fillRect(bx + 3, midY - Math.round(th * 0.45), tw - 8, Math.round(th * 0.4));
      }
    } else {
      // A pipe run with a flange, going somewhere off frame.
      const pw = Math.round(range(rng, 60, 170));
      const py = midY - Math.round(range(rng, 0, 90));
      const ph = Math.round(range(rng, 9, 18));
      g.fillStyle = tone;
      g.fillRect(bx, py, pw, ph);
      g.fillStyle = mixHex(tone, PAL.stoneEdge, 0.55);
      g.fillRect(bx, py, pw, 2);
      g.fillStyle = mixHex(tone, PAL.voidDeep, 0.55);
      for (let k = 0; k < 3; k++) {
        const jx = bx + Math.round(range(rng, 6, pw - 12));
        g.fillRect(jx, py - 2, 7, ph + 4);
      }
      // A drop leg, so the run does not read as a floating bar.
      if (rng() > 0.45) {
        g.fillStyle = tone;
        g.fillRect(bx + Math.round(pw * 0.7), py, ph, Math.round(range(rng, 20, 70)));
      }
    }

    /*
     * The growth takes it back: dark clumps breaking the top line, strands down the face.
     * The clump colour is the forest's, not the machine's - it is the SAME growth that
     * owns the rest of the frame, reaching in from the layer in front.
     */
    const eat = mixHex(PAL.voidMid, PAL.leafDark, 0.55);
    const topY = midY - Math.round(range(rng, 40, 110));
    for (let k = 0; k < 4; k++) {
      blob(g, rng, bx + range(rng, 0, 60), topY + range(rng, -6, 8), range(rng, 7, 16), eat, 1.5);
    }
    for (let k = 0; k < 3; k++) {
      let sx = bx + range(rng, 4, 56);
      const drop = range(rng, 18, 70);
      g.fillStyle = eat;
      for (let d = 0; d < drop; d++) {
        if (d % 7 === 0) sx += range(rng, -1, 1);
        g.fillRect(Math.round(sx), topY + d, 2, 1);
      }
    }
  }

  /*
   * Lamps in the middle distance.
   *
   * The only warm light in a stage lit entirely by cold green, and the reference hangs one
   * every few metres. The first version drew the pool as two concentric SQUARES and it was a
   * disaster on screen: a 36x42 block on a 512-wide backdrop stretched to 1.6x the level is
   * roughly a hundred screen pixels of flat khaki, which reads as a misplaced UI panel rather
   * than as light. Round, small, and drawn under the lamp rather than over it.
   */
  const lanterns: LanternAt[] = [];
  for (let i = 0; i < 9; i++) {
    const lx = Math.round(range(rng, 20, w - 20));
    const ly = Math.round(range(rng, h * 0.22, h * 0.58));
    lanterns.push({ u: lx / w, v: ly / h });
    // The pool first, in three soft steps, so the lamp body sits on top of its own glow.
    // Only the tight core is painted now; the spread is a real additive sprite placed in
    // front of this canvas by the rig, so it can fall on the pipework and the midground.
    blob(g, rng, lx, ly, 12, mixHex(PAL.hazeFar, PAL.lampWarm, 0.18));
    blob(g, rng, lx, ly, 7, mixHex(PAL.hazeFar, PAL.lampWarm, 0.38));
    // The bracket, then the lantern.
    g.fillStyle = PAL.rustDark;
    g.fillRect(lx - 1, ly - 26, 2, 18);
    g.fillStyle = mixHex(PAL.rustDark, PAL.lampWarm, 0.3);
    g.fillRect(lx - 4, ly - 8, 8, 13);
    g.fillStyle = PAL.lampWarm;
    g.fillRect(lx - 2, ly - 6, 5, 9);
    g.fillStyle = PAL.lampCore;
    g.fillRect(lx - 1, ly - 4, 2, 5);
  }

  // Hanging growth along the top: the ceiling of the cavern, coming down into frame.
  g.fillStyle = PAL.voidDeep;
  for (let x = 0; x < w; x += 1) {
    const drop = Math.round(18 + Math.sin(x * 0.06) * 10 + range(rng, 0, 22));
    g.fillRect(x, 0, 1, drop);
  }
  for (let i = 0; i < 90; i++) {
    const x = Math.round(range(rng, 0, w));
    const len = Math.round(range(rng, 10, 60));
    g.fillStyle = i % 3 === 0 ? PAL.vineDark : PAL.voidDeep;
    g.fillRect(x, 0, 1, len);
    if (rng() > 0.7) {
      g.fillStyle = PAL.mossDark;
      g.fillRect(x - 1, len - 4, 3, 4);
    }
  }

  return { texture: pixelTexture(c), lanterns };
}

/**
 * The broken corner where a platform ends.
 *
 * Pass 9 broke the horizontal silhouette with a rubble lip; the vertical one was left alone,
 * so every slab in the stage still terminates in a clean 90-degree cut. That reads as a tile
 * map more strongly than a flat top did, because a pit edge is exactly where the eye goes -
 * it is the thing the player is about to jump off.
 *
 * Built like the lip and for the same reason: the half nearest the platform is solid stone
 * that hides the box's real corner, and the half over the void is empty except for what
 * breaks into it. Chunks calve off the edge, roots trail down past them, and the whole
 * outline steps rather than runs straight.
 *
 * `facing` is +1 for a right-hand end and -1 for a left-hand one; the texture is drawn for a
 * right-hand end and mirrored by the caller, so one generator serves both.
 */
export function endCapTexture(seed: string, w = 64, h = 128): THREE.CanvasTexture {
  const rng = createRng(seedFrom(seed));
  const { c, g } = surface(w, h);
  const edge = Math.round(w * 0.5);

  // Solid stone on the platform side, in the same ramp as the slab it abuts.
  for (let y = 0; y < h; y++) {
    g.fillStyle = ramp(PAL.stoneDark, PAL.stoneEdge, 6, 1 + Math.floor(rng() * 3));
    g.fillRect(0, y, edge, 1);
  }

  /*
   * Chunks calving off into the void.
   *
   * Bigger near the top where the stone is weathered and the moss has got into it, tapering
   * to almost nothing at the bottom - a broken edge is undercut, not vertical, and that is
   * what stops it reading as a wall with a texture on it.
   */
  let y = 0;
  while (y < h) {
    const band = Math.round(range(rng, 5, 22));
    const bite = Math.round(range(rng, 1, (edge * 0.9) * (1 - y / h) + 3));
    for (let i = 0; i < band && y + i < h; i++) {
      const wob = Math.round(range(rng, -1.5, 1.5));
      const out = Math.max(0, bite + wob);
      if (out <= 0) continue;
      g.fillStyle = ramp(PAL.stoneDark, PAL.stoneEdge, 6, 1 + Math.floor(rng() * 3));
      g.fillRect(edge, y + i, out, 1);
    }
    // Moss on the upper face of each chunk, where it would actually grow.
    if (rng() > 0.4) {
      g.fillStyle = ramp(PAL.mossDark, PAL.mossLit, 5, 2 + Math.floor(rng() * 2));
      g.fillRect(edge, y, Math.max(1, bite), 1);
    }
    y += band;
  }

  // Roots trailing off the corner into the dark. Long, thin, and mostly near the top.
  for (let i = 0; i < 7; i++) {
    let rx = edge + Math.round(range(rng, -4, 8));
    const start = Math.round(range(rng, 0, h * 0.4));
    const len = Math.round(range(rng, 12, h * 0.55));
    for (let k = 0; k < len; k++) {
      const t = k / len;
      g.fillStyle = t < 0.5 ? PAL.vineMid : PAL.vineDark;
      g.fillRect(rx, start + k, 1, 1);
      if (k % 6 === 0) rx += Math.round(range(rng, -1, 1));
    }
    if (rng() > 0.5) {
      g.fillStyle = PAL.mossMid;
      g.fillRect(rx, start + len, 1, 2);
    }
  }

  return pixelTexture(c);
}

/**
 * A glow, for things that emit.
 *
 * The stage has three light sources - the portal, the lanterns and the slime itself - and
 * until now every one of them was a shape that happened to be bright rather than a thing
 * casting light. Lanterns got away with it because their pool is painted into the backdrop;
 * the portal and the player did not, and a glowing creature with a hard edge and no bleed is
 * the single most obvious "this is a sprite on a background" tell there is.
 *
 * Stepped in hard rings rather than smoothly. A real bloom is a soft falloff and a pixel-art
 * one is four or five discrete rings - the banding is the style, and it is also what keeps
 * this readable when it is scaled up over a hundred screen pixels.
 */
export function glowTexture(seed: string, colour: string, size = 128): THREE.CanvasTexture {
  const rng = createRng(seedFrom(seed));
  const { c, g } = surface(size, size);
  const cx = size / 2;

  /*
   * Falloff with the square of the distance, quantised to ten steps and DITHERED between
   * them, reaching exactly zero at the edge of the sprite.
   *
   * It was six hard rings, and both halves of that were wrong. Six is few enough that each
   * boundary is a visible circle, so an additive halo drew a set of concentric hoops around
   * every lantern. And the outermost ring was floored at 4% of the colour rather than at
   * zero, which under additive blending is a faint but perfectly crisp disc edge - a hard
   * circular line in mid-air at the exact radius of the sprite. Nothing found either of them
   * in eighteen passes of game captures, because a lantern halo is small, dim, and sitting
   * in front of a busy backdrop.
   *
   * Ten steps rather than sixty-four: this still has to be pixel art, and the dither is what
   * makes ten enough. Same ordered Bayer as the haze ramp, for the same reason - a random
   * dither in a halo crawls when the thing it is attached to moves.
   */
  const STEPS = 10;
  const BAYER = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];
  const rgb = [1, 3, 5].map((k) => parseInt(colour.slice(k, k + 2), 16));
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = Math.sqrt((x - cx) ** 2 + (y - cx) ** 2) / (size / 2);
      // Zero outside the sprite, and zero AT the edge, so there is no disc to see.
      const fall = u >= 1 ? 0 : (1 - u) ** 2;
      const f = fall * STEPS;
      const step = Math.floor(f) + (f % 1 > BAYER[y & 3][x & 3] / 16 ? 1 : 0);
      const k = Math.min(STEPS, step) / STEPS;
      const o = (y * size + x) * 4;
      img.data[o] = Math.round(rgb[0] * k);
      img.data[o + 1] = Math.round(rgb[1] * k);
      img.data[o + 2] = Math.round(rgb[2] * k);
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);

  /*
   * The motes are GONE, and this is the note that keeps them gone.
   *
   * Fourteen hard 2x2 pips used to be painted into every glow sprite "so the glow has
   * something in it". Every glow sprite: the lanterns, the portal, the growth presences,
   * the hover halo, the embers - and the slime's own 260px halo, which is centred on the
   * creature and therefore carried its fourteen pips AROUND THE PLAYER, at fixed offsets,
   * for ever.
   *
   * That is the "static pixels that follow the mass", reported three times. Twice I read
   * it as loose sim particles and culled those instead, which fixed a real but different
   * thing and left the actual cause untouched: the dots were never particles at all, they
   * were painted into the halo. A sprite scaled from 128px to 260 turns a 2x2 pip into a
   * 4px square with hard edges, in the one place on screen the eye is already looking.
   *
   * The lesson for the next one: when a complaint survives a fix, the fix was aimed at
   * something the complaint was not about. Find the thing that is actually drawn.
   */
  void rng;

  return pixelTexture(c);
}

/**
 * The atmosphere layer: light shafts and drifting spores.
 *
 * The one thing in the reference that has no equivalent here at all. Every reference frame
 * has god rays coming down through the canopy and motes hanging in them, and it is doing more
 * work than it looks: the shafts tie the foreground and the background into one volume of
 * air, and the motes give the scene a sense of scale by being unmistakably CLOSE.
 *
 * Additive and transparent, sitting between the backdrop and the gameplay plane, so it lifts
 * the darks it passes over without touching the values of anything in front of it.
 *
 * Hard-edged, like everything else here. A real light shaft has a soft gradient and a pixel
 * art one has three or four discrete bands - the stepping is the style, and a smooth ramp
 * here would be the one place in the stage that gave the game away as 3D.
 */
export function atmosphereTexture(seed: string, w = 1024, h = 576): THREE.CanvasTexture {
  const rng = createRng(seedFrom(seed));
  const { c, g } = surface(w, h);

  /*
   * Shafts, raked from the upper left.
   *
   * All parallel, because two light sources at different angles reads as a mistake rather
   * than as depth. Each is drawn as a few nested bands rather than a gradient, brightest in
   * the middle, and they fade out toward the floor so they do not sit on the platforms.
   */
  const SLANT = 0.42;
  for (let i = 0; i < 7; i++) {
    const top = range(rng, -140, w * 0.9);
    const width = range(rng, 26, 92);
    const reach = range(rng, h * 0.55, h * 1.02);
    const bands = 4;
    for (let b = bands; b >= 1; b--) {
      const t = b / bands;
      // Wider and dimmer at the outside, tight and bright in the core.
      g.fillStyle = mixHex(PAL.voidDeep, PAL.lampCore, 0.1 * (1 - t) + 0.03);
      const half = (width * t) / 2;
      for (let y = 0; y < reach; y += 2) {
        // Rows rather than a polygon: the stepping down the edge is the pixel-art tell.
        const cx = top + y * SLANT;
        const fade = 1 - y / reach;
        if (fade < 0.12) continue;
        const wide = Math.round(half * (0.6 + fade * 0.7));
        g.fillRect(Math.round(cx - wide), y, wide * 2, 2);
      }
    }
  }

  // The motes moved out to sporeTexture, so they can drift while the shafts hold still.
  return pixelTexture(c);
}

/**
 * The growth, built the way the lantern is built - because the playtest put the two side
 * by side and they were not the same thing at all.
 *
 * The first attempt at "make it the lamp" drew a lamp-SHAPED OBJECT: faceted plates, a
 * dark shell, a lit interior. Next to the real lantern it read as a machined fitting
 * bolted to the air, because the lantern is not an object at all - it is a GLOW with a hot
 * point in it. Its edge is soft, it has no outline, and almost all of its area is light
 * falling off into the dark. That is what has to be copied.
 *
 * So this is a radial falloff, dithered in ten steps exactly like `glowTexture` (same
 * ordered Bayer, for the same reason - a random dither crawls when the thing it is on
 * moves), with the lamp's own filament at the centre: a small upright body, a brighter
 * core, and a near-white heart. No shell, no rim, no hard pixel anywhere on the outside.
 *
 * Dead cultures keep the shape and lose the fire: the same falloff in ember red, at half
 * the reach, with a cooling coal instead of a filament and no white at all.
 */
export function bushTexture(seed: string, size = 160, dead = false): THREE.CanvasTexture {
  /*
   * The lantern, described exactly: a LEMON RECTANGLE with a BROWN OUTLINE, a BROWN ROPE
   * running up from its top, and a glow around the whole thing.
   *
   * Every previous attempt drew a green blob of some kind - dithered, additive, banded,
   * faded - and all of them missed the same point, which is that the reference lamp is
   * not a glow with a core, it is an OBJECT that is lit. It has a made shape (a rectangle
   * with a rim), it is made of something (the rim is brown, the pane is lemon), and it is
   * HUNG (the rope). Those three facts are what the eye reads as a lantern; the glow is
   * the atmosphere around them, and it lives in the additive halo the rig hangs behind
   * this sprite.
   *
   * The pane keeps the slime's family - lemon is the creature's own highlight colour -
   * so the growth still reads as the same substance as the mass, which is both the
   * fiction and the value hierarchy.
   */
  const { c, g } = surface(size, size);
  const cx = Math.round(size / 2);
  const cy = Math.round(size / 2);

  // paneW is a HALF-width, so 0.17 made the lamp sixty wide against forty-four tall - a
  // landscape box, where the reference's lantern is plainly a portrait one.
  const paneW = Math.round(size * 0.085);
  const paneH = Math.round(size * 0.26);
  const rim = Math.max(2, Math.round(size * 0.022));

  const brown = dead ? '#3a2a1e' : '#5a4526';
  const brownLit = dead ? '#4a3626' : '#7a6134';
  /*
   * The pane is lit to the MASS's own values: #a8e85c is the creature's body colour and
   * #e8fbb0 its shine, so the brightest thing inside the lantern is exactly as bright as
   * the brightest thing on the slime. They are the same substance and now they measure
   * the same. The near-white the pane used to carry read as grey against a green room -
   * whiter is not brighter when everything around it is a hue.
   */
  const pane = dead ? '#8f4a2e' : '#c8f07a';
  const paneHot = dead ? '#c4553f' : '#e8fbb0';
  const paneDim = dead ? '#6b3524' : '#a8e85c';

  /*
   * The rope first, so the lamp's collar covers where it lands. Brown, two strands with a
   * lit side, running from the top of the sprite down to the lamp - the rig also hangs a
   * long stalk continuing it up out of the frame, and the two have to meet.
   */
  const ropeX = cx - 1;
  const ropeTop = 0;
  const ropeBottom = cy - Math.round(paneH / 2) - rim;
  g.fillStyle = brown;
  g.fillRect(ropeX, ropeTop, 3, ropeBottom - ropeTop);
  g.fillStyle = brownLit;
  g.fillRect(ropeX, ropeTop, 1, ropeBottom - ropeTop);
  // Twist marks, so it reads as rope rather than as a wire.
  g.fillStyle = dead ? '#2a1e14' : '#40301a';
  for (let y = ropeTop + 4; y < ropeBottom; y += 6) g.fillRect(ropeX, y, 3, 1);

  // The collar the lamp hangs from.
  const collarW = Math.round(paneW * 0.7);
  g.fillStyle = brown;
  g.fillRect(cx - collarW, ropeBottom - 2, collarW * 2, rim + 3);
  g.fillStyle = brownLit;
  g.fillRect(cx - collarW, ropeBottom - 2, collarW * 2, 1);

  /*
   * The lamp: a brown box with a lemon pane in it. Drawn outline-first so the rim is
   * exactly `rim` thick on every side and the pane cannot leak past it.
   */
  const bx = cx - paneW - rim;
  const by = cy - Math.round(paneH / 2) - rim;
  const bw = (paneW + rim) * 2;
  const bh = paneH + rim * 2;
  g.fillStyle = brown;
  g.fillRect(bx, by, bw, bh);
  g.fillStyle = brownLit;
  g.fillRect(bx, by, bw, 1);
  g.fillRect(bx, by, 1, bh);

  // The pane, in three steps out from its hot middle - a lit surface, not a flat fill.
  g.fillStyle = paneDim;
  g.fillRect(bx + rim, by + rim, bw - rim * 2, bh - rim * 2);
  g.fillStyle = pane;
  g.fillRect(bx + rim + 1, by + rim + 1, bw - rim * 2 - 2, bh - rim * 2 - 2);
  g.fillStyle = paneHot;
  g.fillRect(
    cx - Math.round(paneW * 0.45),
    cy - Math.round(paneH * 0.32),
    Math.max(2, Math.round(paneW * 0.9)),
    Math.max(3, Math.round(paneH * 0.64))
  );

  // A foot, so the lamp has a bottom and does not read as a floating card.
  g.fillStyle = brown;
  g.fillRect(cx - Math.round(collarW * 0.8), by + bh, Math.round(collarW * 1.6), rim);

  /*
   * NO painted glow. A first version stamped two faded discs behind the fitting and they
   * did what discs drawn with a radius always do - gave the lamp a visible circular edge,
   * the same ring the banded version was rebuilt to get rid of.
   *
   * The glow belongs to the rig's additive halo, which is a proper dithered falloff with
   * no boundary anywhere in it. One object per job: this sprite is the fitting, that
   * sprite is the light it throws.
   */
  void seed;
  return pixelTexture(c);
}

/**
 * A curtain of vines, hung off a platform edge.
 *
 * Transparent apart from the strands. Every platform in the reference has something growing
 * over its lip and hanging down - it is what stops a platform reading as a floating slab,
 * because the eye gets a soft, irregular boundary instead of a straight line.
 */
export function vineTexture(seed: string, w = 128, h = 96): THREE.CanvasTexture {
  const rng = createRng(seedFrom(seed));
  const { c, g } = surface(w, h);

  for (let x = 0; x < w; x += 1) {
    if (rng() > 0.42) continue;
    const len = Math.round(range(rng, 6, h * 0.9));
    const thick = rng() > 0.75 ? 2 : 1;
    let wander = x;
    for (let y = 0; y < len; y++) {
      const t = y / len;
      g.fillStyle = t < 0.3 ? PAL.mossMid : t < 0.75 ? PAL.mossDark : PAL.vineDark;
      g.fillRect(Math.round(wander), y, thick, 1);
      if (y % 7 === 0) wander += range(rng, -1, 1);
      // Leaves along the strand.
      if (rng() > 0.9) {
        g.fillStyle = PAL.leafMid;
        const side = rng() > 0.5 ? 1 : -1;
        g.fillRect(Math.round(wander + side * 2), y, 3, 2);
      }
    }
    // A bright bead at the tip.
    if (rng() > 0.6) {
      g.fillStyle = PAL.slime;
      g.fillRect(Math.round(wander), len, thick, 2);
    }
    x += Math.round(range(rng, 0, 3));
  }

  return pixelTexture(c);
}

/**
 * The portal at the end of the stage.
 *
 * An arch of worked stone with a bright membrane in it - the one saturated, unambiguous
 * thing in a stage that is otherwise every shade of green. It has to read as "this is the
 * exit" from across the level with no label, so it is the only object here that is allowed
 * to be brighter than the moss.
 *
 * `phase` shifts the membrane's banding so the caller can animate it without redrawing the
 * arch, which is the expensive half.
 */
export function portalTexture(seed: string, phase: number, size = 128): THREE.CanvasTexture {
  const rng = createRng(seedFrom(seed));
  const { c, g } = surface(size, size);
  const cx = size / 2;

  /*
   * The membrane, as an IRIS: dark down the throat, brightening outward to a hot rim.
   *
   * It was twenty-two two-pixel rings mixed linearly from core to rim, which is a smooth
   * gradient wearing a ring costume - the steps were far too small and too even to read as
   * steps. Rendered on its own it was a flat mint egg, the only true gradient in a stage that
   * refuses gradients everywhere else, and bright enough to swallow the arch it sits in.
   *
   * Two changes make it a portal instead of an egg:
   *
   *   The bands are FEW and WIDE. Seven, off a fixed ramp, so every edge between them is a
   *   visible step. That is the whole difference between painted and rendered.
   *
   *   The centre is DARK. A portal is a hole, and a hole is dark in the middle - light piled
   *   in the centre is an egg, a pearl, a bubble, anything but a way through. The brightness
   *   goes to the rim, where the membrane meets the stone, which also stops it competing
   *   with the arch and gives the arch something to be silhouetted against.
   *
   * `phase` ripples the band BOUNDARIES rather than their colours - the radius is perturbed
   * by an angular wave before it is quantised, so the rings breathe and wobble like liquid
   * held in a frame. Shifting colours instead just made the whole thing pulse, which reads as
   * a status light.
   */
  const shell = [
    mixHex(PAL.voidDeep, PAL.portalRim, 0.15),
    mixHex(PAL.voidDeep, PAL.portalRim, 0.35),
    mixHex(PAL.voidDeep, PAL.portalRim, 0.62),
    PAL.portalRim,
    mixHex(PAL.portalRim, PAL.portalCore, 0.4),
    mixHex(PAL.portalRim, PAL.portalCore, 0.7),
    PAL.portalCore,
  ];
  const my = size * 0.54;
  const rx = 44 * 0.72;
  const ry = 44;
  for (let dy = -ry; dy <= ry; dy++) {
    for (let dx = -rx; dx <= rx; dx++) {
      const u = Math.sqrt((dx / rx) ** 2 + (dy / ry) ** 2);
      if (u > 1) continue;
      const theta = Math.atan2(dy, dx);
      /*
       * Ripple the boundary, not the colour. Two frequencies so it does not read as a cog.
       *
       * Amplitude has to stay small against the band WIDTH, not against the radius. At 0.05
       * on bands 1/7 wide the wobble was a third of a whole band and the membrane came out
       * as a five-pointed star - the same arithmetic slip as the lamp pools and the spores,
       * a number authored in one space and spent in another. Higher frequencies too: five
       * lobes is a shape, thirteen is a texture.
       */
      const ripple = 0.018 * Math.sin(theta * 7 + phase * 4) + 0.011 * Math.sin(theta * 13 - phase * 7);
      /*
       * Raised to a power so the bands are not evenly spaced: a wide dark throat, then rings
       * that tighten outward to a thin hot rim where the membrane meets the stone. Evenly
       * spaced, the two brightest bands owned two fifths of the sprite and the whole thing
       * read as a pale blob with a hole in it.
       */
      const band = Math.max(0, Math.min(6, Math.floor((u + ripple) ** 3.2 * 7)));
      g.fillStyle = shell[band];
      g.fillRect(Math.round(cx + dx), Math.round(my + dy), 1, 1);
    }
  }

  /*
   * Two jambs, and nothing over them.
   *
   * The arch used to carry a stone head with a moss run and hanging vines along it, and
   * the playtest asked for exactly that to go: "remove the top grass/stone part of the
   * portal". It was the busiest thing in the frame at the one moment the player is
   * supposed to be reading a doorway. What remains is the pair of uprights - enough to say
   * the way through is BUILT, with the membrane itself uninterrupted above.
   */
  g.fillStyle = PAL.stoneMid;
  g.fillRect(cx - 44, 30, 12, size - 30);
  g.fillRect(cx + 32, 30, 12, size - 30);
  g.fillStyle = PAL.stoneEdge;
  g.fillRect(cx - 44, 30, 12, 2);
  g.fillRect(cx + 32, 30, 12, 2);
  void rng;

  return pixelTexture(c);
}

/**
 * A gate: the sliding containment door, drawn instead of tinted.
 *
 * These were flat #8c5a4a boxes - the last two solid-colour primitives in a stage where
 * everything else earned a texture, and they read as greybox left in by mistake, which is
 * exactly what they were. The design language is the facility's: rusted iron plates on the
 * stage's own rust ramp, cross-braces with rivets, a hazard chevron band low down where a
 * door that meets a floor announces itself, and moss claiming the bottom edge - because
 * every man-made thing in this place is losing to the growth, and a door that stayed clean
 * would read as newer than the room it locks.
 */
export function gateTexture(seed: string, w = 40, h = 590): THREE.CanvasTexture {
  /*
   * Repainted off the first live capture of the redo, where the old rust-plate version
   * was the single worst thing in the frame: the tallest, warmest, most saturated shape
   * on screen, reading as a wooden watchtower and out-shouting the player, the growths
   * and the portal at once. The bible's value hierarchy puts a gate THIRD - behind the
   * player and the interactables - so a containment bulkhead is COLD dark steel that
   * holds the wall's own values, with exactly two quiet announcements: a worn warning
   * band at the foot (where the door meets what it shuts on), and one small status lamp.
   * Rust survives only as patina bleeding from the plate seams, same as the stone pipes.
   */
  const rng = createRng(seedFrom(seed));
  const { c, g } = surface(w, h);

  const steelDark = mixHex(PAL.stoneDark, PAL.rustDark, 0.25);
  const steelMid = mixHex(PAL.stoneMid, PAL.rustDark, 0.2);
  const steelLit = mixHex(PAL.stoneLit, PAL.rustMid, 0.15);

  // Plates: tall inset panels of cold steel, each a half-step off its neighbours.
  const plateH = 58;
  for (let y = 0; y < h; y += plateH) {
    g.fillStyle = mixHex(steelDark, steelMid, range(rng, 0.2, 0.7));
    g.fillRect(0, y, w, plateH);
    // The inset: a darker margin, then the panel face one step lighter.
    g.fillStyle = mixHex(steelDark, '#000000', 0.35);
    g.fillRect(0, y, w, 3);
    g.fillRect(0, y, 2, plateH);
    g.fillRect(w - 2, y, 2, plateH);
    g.fillStyle = steelLit;
    g.fillRect(2, y + 3, w - 4, 1);
    // Rust patina creeping from the seam, sparse blotches thinning downward.
    for (let b = 0; b < 5; b++) {
      const bx = Math.round(range(rng, 2, w - 4));
      const by = y + Math.round(range(rng, 3, 14));
      g.fillStyle = b < 2 ? PAL.rustMid : PAL.rustDark;
      g.fillRect(bx, by, 2, Math.round(range(rng, 1, 3)));
    }
  }

  // The warning band at the foot: worn chevrons, muted, half scoured away.
  const bandY = h - 66;
  g.fillStyle = mixHex(PAL.lampWarm, steelDark, 0.55);
  g.fillRect(0, bandY, w, 14);
  g.fillStyle = mixHex(steelDark, '#000000', 0.3);
  for (let x = -14; x < w; x += 10) {
    for (let i = 0; i < 5; i++) {
      g.fillRect(x + i, bandY + i * 3, 5, 3);
    }
  }
  // The scour: strips of the band worn back to steel.
  for (let i = 0; i < 4; i++) {
    g.fillStyle = steelMid;
    g.fillRect(Math.round(range(rng, 0, w - 6)), bandY + Math.round(range(rng, 0, 10)), Math.round(range(rng, 3, 8)), 3);
  }

  // The status lamp: one small lit eye at mid-height - powered, watching, shut.
  const ly = Math.round(h * 0.42);
  g.fillStyle = mixHex(PAL.lampWarm, steelDark, 0.4);
  g.fillRect(Math.round(w / 2) - 3, ly - 1, 6, 6);
  g.fillStyle = PAL.lampWarm;
  g.fillRect(Math.round(w / 2) - 2, ly, 4, 4);
  g.fillStyle = PAL.lampCore;
  g.fillRect(Math.round(w / 2) - 1, ly + 1, 2, 2);

  // Weathering: cold flecks, and wet streaks running from the plate seams.
  for (let i = 0; i < (w * h) / 300; i++) {
    g.fillStyle = mixHex(steelDark, '#000000', range(rng, 0.2, 0.5));
    g.fillRect(Math.round(range(rng, 0, w)), Math.round(range(rng, 0, h)), 2, 1);
  }
  for (let i = 0; i < 4; i++) {
    const sx = Math.round(range(rng, 3, w - 4));
    const sy = Math.round(range(rng, 0, h * 0.7));
    g.fillStyle = mixHex(steelDark, '#000000', 0.4);
    const runLen = Math.round(range(rng, 16, 50));
    for (let d = 0; d < runLen; d++) {
      if (sy + d < h) g.fillRect(sx, sy + d, 1, 1);
    }
  }

  // Moss takes the bottom, same run the platforms wear; ooze seeps one seam.
  mossRun(g, rng, 0, w, h - 12, 12);
  const oy = Math.round(h * 0.62);
  g.fillStyle = PAL.mossMid;
  g.fillRect(0, oy, w, 2);
  g.fillStyle = PAL.mossLit;
  g.fillRect(Math.round(w * 0.3), oy, Math.round(w * 0.3), 1);

  return pixelTexture(c);
}

/**
 * A button: a pressure plate with a lit core, replacing the flat orange cylinder.
 *
 * The read it has to give at distance is "this is warm and it wants weight", so the cap
 * carries the stage's lamp colour - the one hue reserved for man-made light - over a
 * stone anvil that visibly belongs to the floor. Drawn wider than tall; the rig sinks the
 * whole sprite into its socket when pressed, so the art needs no pressed state.
 */
export function plateTexture(seed: string, w = 96, h = 40): THREE.CanvasTexture {
  /*
   * Redrawn in the redo: at game scale the old anvil-and-dome read as a yellow dash on
   * the floor - an interactable with less drawn identity than a mushroom. A power plate
   * is now a small INSTALLATION: a dark socket sunk into the stone, a brass plate with
   * riveted corners sitting proud of it, and the amber indicator dome centred on top -
   * the stage's one reserved artifice colour, on the one thing that asks to be pressed.
   * The rig sinks the whole sprite on press, so the art still needs no second state.
   */
  const rng = createRng(seedFrom(seed));
  const { c, g } = surface(w, h);
  const cx = w / 2;

  // The socket: a dark recess with a lit forward lip, wider than the plate.
  g.fillStyle = mixHex(PAL.voidDeep, '#000000', 0.3);
  g.fillRect(2, h - 10, w - 4, 10);
  g.fillStyle = mixHex(PAL.stoneMid, PAL.stoneLit, 0.5);
  g.fillRect(2, h - 10, w - 4, 2);
  g.fillStyle = PAL.stoneDark;
  g.fillRect(0, h - 4, w, 4);

  // The plate: brass, shaded in three bands, riveted at the corners.
  const plateW = w - 22;
  const plateH = 12;
  const py = h - 8 - plateH;
  /*
   * Round 2 brass. The first mixes leaned on the lamp family and the live capture showed
   * a flat yellow slab with a clipped white chip on top - the lamp colours are authored
   * to clip (that is what a lamp IS) and metal borrowing them clips with them. Brass is
   * now grounded in the metal families with only a breath of lamp, and the dome tops out
   * at lampWarm - the indicator glows amber, never white.
   */
  const brassDark = mixHex(PAL.rustDark, PAL.stoneMid, 0.4);
  const brassMid = mixHex(PAL.rustMid, PAL.stoneLit, 0.35);
  const brassLit = mixHex(PAL.rustLit, PAL.lampWarm, 0.25);
  g.fillStyle = brassDark;
  g.fillRect(Math.round(cx - plateW / 2), py, plateW, plateH);
  g.fillStyle = brassMid;
  g.fillRect(Math.round(cx - plateW / 2) + 1, py + 1, plateW - 2, Math.round(plateH * 0.5));
  g.fillStyle = brassLit;
  g.fillRect(Math.round(cx - plateW / 2) + 1, py + 1, plateW - 2, 2);
  // Rivets, 2x2 so they survive the scale.
  g.fillStyle = mixHex(PAL.rustDark, '#000000', 0.3);
  for (const rx of [cx - plateW / 2 + 3, cx + plateW / 2 - 5]) {
    g.fillRect(Math.round(rx), py + 2, 2, 2);
    g.fillRect(Math.round(rx), py + plateH - 4, 2, 2);
  }

  // The indicator dome: amber, stepped, with a bright heart - "warm, wants weight".
  const capW = Math.round(w * 0.3);
  for (let i2 = 0; i2 < 3; i2++) {
    const inset = i2 * Math.max(2, Math.round(capW * 0.12));
    g.fillStyle = [
      mixHex(PAL.lampWarm, PAL.rustDark, 0.55),
      mixHex(PAL.lampWarm, PAL.rustDark, 0.25),
      PAL.lampWarm,
    ][i2];
    const y2 = py - 4 - i2 * 2;
    g.fillRect(Math.round(cx - capW / 2 + inset), y2, Math.round(capW - inset * 2), py - y2);
  }

  // A dark outline around the whole brass body, so the plate is an OBJECT on the stone
  // rather than a paint stripe - the capture read the outline-less version as a slab.
  g.fillStyle = mixHex(PAL.voidDeep, '#000000', 0.4);
  g.fillRect(Math.round(cx - plateW / 2) - 1, py - 1, plateW + 2, 1);
  g.fillRect(Math.round(cx - plateW / 2) - 1, py, 1, plateH);
  g.fillRect(Math.round(cx + plateW / 2), py, 1, plateH);

  // Wear: two scuffs across the plate where things have landed on it.
  g.fillStyle = brassDark;
  g.fillRect(Math.round(cx + range(rng, -plateW * 0.3, plateW * 0.3)), py + 4, 5, 1);
  g.fillRect(Math.round(cx + range(rng, -plateW * 0.3, plateW * 0.3)), py + 7, 4, 1);

  // Moss creeping onto the socket's edges - everything here is being taken back.
  g.fillStyle = PAL.mossDark;
  g.fillRect(2, h - 10, Math.round(range(rng, 4, 9)), 2);
  g.fillRect(w - 2 - Math.round(range(rng, 4, 9)), h - 10, Math.round(range(rng, 4, 9)), 2);

  return pixelTexture(c);
}

/**
 * A floor prop: a fern or a mushroom cluster, for the empty metres between features.
 *
 * The invention list has carried "scattered decoration between the growths" since pass 17.
 * The platforms read as corridors between the things that matter; the reference fills its
 * walking surfaces with small life that asks for nothing. Two kinds only - a fern (cool,
 * leaf ramp) and a mushroom cluster (the cap accent colours) - because the stage already
 * speaks in those two families and a third would be a new word used once.
 */
export function propTexture(seed: string, kind: 'fern' | 'shroom', size = 48): THREE.CanvasTexture {
  const rng = createRng(seedFrom(seed));
  const { c, g } = surface(size, size);
  const cx = size / 2;
  const base = size - 4;

  if (kind === 'fern') {
    // Five to seven fronds, arcs of stacked pixels thinning toward the tip.
    const fronds = 5 + Math.floor(rng() * 3);
    for (let i = 0; i < fronds; i++) {
      const lean = range(rng, -1.2, 1.2);
      const tall = range(rng, size * 0.4, size * 0.75);
      const shade = ramp(PAL.leafDark, PAL.leafMid, 4, Math.floor(rng() * 4));
      g.fillStyle = shade;
      for (let t = 0; t < tall; t++) {
        const k = t / tall;
        const x = cx + lean * t * 0.45 + Math.sin(k * 3.1) * 2;
        const wide = Math.max(1, Math.round(3 * (1 - k)));
        g.fillRect(Math.round(x - wide / 2), base - t, wide, 1);
      }
    }
    return pixelTexture(c);
  }

  // Mushrooms: two or three, stems then caps, the tallest lit.
  const count = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < count; i++) {
    const mx = cx + range(rng, -size * 0.28, size * 0.28);
    const tall = range(rng, size * 0.18, size * 0.42);
    const capW = range(rng, 8, 14);
    g.fillStyle = mixHex(PAL.stoneLit, PAL.capDark, 0.3);
    g.fillRect(Math.round(mx - 1), Math.round(base - tall), 3, Math.round(tall));
    g.fillStyle = i === count - 1 ? PAL.capLit : PAL.capDark;
    for (let dy = 0; dy < capW * 0.45; dy++) {
      const half = Math.round((capW / 2) * Math.sqrt(Math.max(0, 1 - (dy / (capW * 0.45)) ** 2)));
      g.fillRect(Math.round(mx - half), Math.round(base - tall - dy), half * 2, 1);
    }
    // One glint of spore-light under the lit cap, cold against the warm cap.
    if (i === count - 1) {
      g.fillStyle = PAL.bioCyan;
      g.fillRect(Math.round(mx - 1), Math.round(base - tall + 2), 2, 1);
    }
  }
  return pixelTexture(c);
}

/**
 * DIRT, which is what the playtest asked the floors to become - "change the floor to dirt,
 * the top part should have grass texture at the top, and a second variation of the dirt
 * texture below with only dirt to blend it in".
 *
 * Two variants of one material, so they blend by construction:
 *
 *   'plain' is the body - packed earth in stepped bands, pebbles, root threads and the
 *   occasional buried stone. It tiles in both axes.
 *   'grass' is the same earth with a living crown on top: a moss-green mat, blades
 *   breaking the line upward, and roots trailing down into the dirt so the two variants
 *   meet in a fringe rather than on a seam.
 *
 * Seamlessness is the whole discipline here. Nothing is drawn within a few pixels of an
 * edge unless it is also drawn wrapped around to the other side: every horizontal feature
 * is either full-width or is drawn twice, at x and at x-w, so the pattern continues across
 * the join. The rig then offsets each tile by its WORLD position, so two tiles that touch
 * continue one field of earth.
 */
export function dirtTexture(
  seed: string,
  w = 128,
  h = 96,
  variant: 'plain' | 'grass' = 'plain'
): THREE.CanvasTexture {
  /*
   * Round 2, and the fault it fixes is the one the playtest named: "the ground texture
   * does not make sense".
   *
   * The first version graded itself from light at the top to dark at the bottom, which is
   * correct for ONE slab of earth and catastrophic for a texture that repeats. A 300-tall
   * platform tiles this three times over, so the ground came out as three stacked strata
   * with a hard light/dark seam at every join - stripes across the dirt, exactly what
   * "seamless" was supposed to have ruled out.
   *
   * So the material is now FLAT in the vertical: no gradient, no top, no bottom, just
   * earth. Depth comes from the interior-fade plane the rig already lays over deep tiles,
   * which is where a depth cue belongs - one gradient over the whole mass rather than one
   * per repeat.
   *
   * What gives it structure instead is compaction: clumps of packed soil in a few values,
   * embedded stones, grit and root threads, all wrapped at BOTH edges so every feature
   * continues across every join in both axes.
   */
  const rng = createRng(seedFrom(seed + variant));
  const { c, g } = surface(w, h);

  const earth = [
    mixHex(PAL.vineDark, PAL.voidDeep, 0.35),
    PAL.vineDark,
    mixHex(PAL.vineDark, PAL.vineMid, 0.5),
    PAL.vineMid,
    mixHex(PAL.vineMid, PAL.rustMid, 0.28),
  ];

  /** Draw at x, and at its wraps, so nothing is ever cut by an edge. */
  const wrapped = (x: number, y: number, fw: number, fh: number, fill: string): void => {
    g.fillStyle = fill;
    for (const ox of [0, -w, w]) {
      for (const oy of [0, -h, h]) {
        g.fillRect(Math.round(x + ox), Math.round(y + oy), fw, fh);
      }
    }
  };

  // The base: the middle of the ramp, so clumps can go both lighter and darker.
  g.fillStyle = earth[2];
  g.fillRect(0, 0, w, h);

  /*
   * Clumps of compacted soil: soft-edged patches a step either side of the base. Drawn as
   * rows of varying width rather than as circles, which keeps them irregular - earth has
   * no round shapes in it.
   */
  for (let i = 0; i < 26; i++) {
    const cx2 = range(rng, 0, w);
    const cy2 = range(rng, 0, h);
    const cr = range(rng, 5, 15);
    const fill = earth[rng() > 0.5 ? 3 : 1];
    for (let dy = -cr; dy <= cr; dy++) {
      const half = Math.sqrt(Math.max(0, cr * cr - dy * dy)) * range(rng, 0.7, 1.15);
      if (half < 1) continue;
      wrapped(cx2 - half, cy2 + dy, Math.round(half * 2), 1, fill);
    }
  }

  // Grit: two-pixel flecks across the full range, dense enough to read as soil at a glance.
  for (let i = 0; i < (w * h) / 42; i++) {
    const idx = Math.floor(range(rng, 0, earth.length));
    wrapped(range(rng, 0, w), range(rng, 0, h), 2, 1, earth[Math.min(earth.length - 1, idx)]);
  }

  /*
   * Stones buried in the earth: a dark body with a lit crown, since even in a cross
   * section the eye wants a light direction. These are the only hard shapes in the
   * material and they are what stops it reading as noise.
   */
  for (let i = 0; i < 9; i++) {
    const sx = range(rng, 0, w);
    const sy = range(rng, 0, h);
    const sr = range(rng, 3, 8);
    // Lighter than the earth around them, not darker: the first pass mixed these off
    // stoneDark and they read as HOLES punched in the ground rather than as stones
    // sitting in it. A buried stone catches more light than the soil, never less.
    const body = mixHex(PAL.stoneMid, PAL.vineMid, 0.45);
    const crown = mixHex(PAL.stoneLit, PAL.vineMid, 0.3);
    for (let dy = -sr; dy <= sr; dy++) {
      const half = Math.round(Math.sqrt(Math.max(0, sr * sr - dy * dy)));
      if (half <= 0) continue;
      wrapped(sx - half, sy + dy, half * 2, 1, dy < -sr * 0.35 ? crown : body);
    }
    // The shadow the stone sits in.
    wrapped(sx - sr, sy + sr, sr * 2, 1, earth[0]);
  }

  /*
   * Roots threading through. One step off the base rather than the darkest step, and one
   * pixel wide: at 2px in the darkest earth they came out as hard black scratches ruled
   * across the soil, which is the same fault the strata had - a graphic line where the
   * material wants a texture.
   */
  for (let i = 0; i < 5; i++) {
    let x = range(rng, 0, w);
    const y0 = range(rng, 0, h);
    const len = range(rng, h * 0.3, h * 0.9);
    for (let d = 0; d < len; d++) {
      if (d % 5 === 0) x += range(rng, -1.3, 1.3);
      wrapped(x, y0 + d, 1, 1, earth[1]);
    }
  }

  if (variant === 'grass') {
    /*
     * The crown, cut back hard. It used to hang a fringe of moss tongues and roots down
     * into the dirt, and with the vine curtain and the rubble lip also drawn at that
     * edge the ground grew a dense green-to-grey beard that the playtest asked to have
     * removed. What is left is what a grass line actually needs: a dark root band, a lit
     * mat, and short blades breaking the top - and NOTHING hanging below it.
     */
    /*
     * The crest: the ground's silhouette WANDERS.
     *
     * The single most artificial thing left in the frame was that the top of the world
     * was a ruled line from one edge to the other - 1280 pixels of perfectly straight
     * ground, which no cave and no game with a sense of place has ever had. The top rows
     * of the texture are cleared so the plane above the tile is transparent, and the mat
     * is drawn per column at a wandering height: the earth line underneath stays straight
     * (it is collision, and it is honest about that), while the moss riding it rises and
     * falls a few pixels the way real ground cover does.
     *
     * Low frequency on purpose. A per-column random reads as noise; a drift that takes
     * twenty or thirty pixels to travel reads as terrain.
     */
    const crest = 9;
    g.clearRect(0, 0, w, crest);
    const matH = Math.max(5, Math.round(h * 0.1));
    let rise = crest * 0.5;
    // Start and end at the same height so the crest tiles without a step.
    const seam = rise;
    for (let x = 0; x < w; x++) {
      if (x % 7 === 0) rise += range(rng, -1.6, 1.6);
      const blend = x > w - 24 ? (x - (w - 24)) / 24 : 0;
      const hereRaw = rise * (1 - blend) + seam * blend;
      const here = Math.max(0, Math.min(crest, Math.round(hereRaw)));
      const top = crest - here;
      // Dark root band under everything, then the mat, then the lit crown.
      g.fillStyle = mixHex(PAL.mossDark, PAL.vineDark, 0.45);
      g.fillRect(x, top, 1, crest + matH + 3 - top);
      g.fillStyle = PAL.mossDark;
      g.fillRect(x, top, 1, crest + matH - top);
      g.fillStyle = PAL.mossMid;
      g.fillRect(x, top, 1, Math.max(2, Math.round((crest + matH - top) * 0.5)));
      g.fillStyle = PAL.mossLit;
      g.fillRect(x, top, 1, 2);
    }
    // Blades: short, sparse, standing out of the crest.
    for (let i = 0; i < w / 9; i++) {
      const bx = Math.round(range(rng, 0, w));
      const bh = Math.round(range(rng, 2, 6));
      for (let d = 0; d < bh; d++) {
        const y = crest - 1 - d;
        if (y < 0) break;
        g.fillStyle = d > bh * 0.5 ? PAL.mossLit : PAL.mossMid;
        for (const ox of [0, -w, w]) g.fillRect(bx + ox, y, 1, 1);
      }
    }
  }

  return pixelTexture(c);
}

/**
 * The latch ring: a white circle that pulses around whichever growth the player would
 * catch if they clicked now.
 *
 * Drawn as a ring rather than a disc, and in white rather than in any of the stage's
 * families, because it is the one piece of pure UI left in the frame and it should not
 * pretend otherwise - the growth says "I am alive", the ring says "I am the one". Two
 * thicknesses so it survives being scaled: an inner hard ring and an outer soft one.
 */
export function ringTexture(size = 128): THREE.CanvasTexture {
  const { c, g } = surface(size, size);
  const cx = size / 2;
  const outer = size / 2 - 2;
  // A THIN band: 0.028 of the sprite rather than 0.055. A ring is a pointer, and a fat
  // one competes with the thing it is pointing at - which on this stage is the one object
  // that must never share attention.
  const inner = outer - Math.max(2, Math.round(size * 0.028));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - cx + 0.5, y - cx + 0.5);
      if (d > outer || d < inner) continue;
      // Soft at both edges of the band, solid through its middle.
      const t = (d - inner) / (outer - inner);
      const edge = Math.min(t, 1 - t) * 2;
      g.fillStyle = edge > 0.55 ? '#ffffff' : edge > 0.25 ? '#dfeee8' : '#9fc4b6';
      g.fillRect(x, y, 1, 1);
    }
  }
  return pixelTexture(c);
}

/**
 * One drifting mote, as a sprite rather than as a pixel painted into a sheet.
 *
 * The distinction is the whole point. Static motes baked into a texture were removed
 * twice for reading as dead pixels stuck to the screen; the same motes MOVING read as
 * air, insects, spores - as the room being alive. So this is a tiny sprite the rig
 * animates: a soft two-step body so it never has a hard edge at any scale.
 */
export function moteTexture(colour: string, size = 8): THREE.CanvasTexture {
  const { c, g } = surface(size, size);
  const cx = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - cx + 0.5, y - cx + 0.5) / (size / 2);
      if (d > 1) continue;
      g.fillStyle = d < 0.4 ? colour : mixHex(colour, '#000000', 0.55);
      g.fillRect(x, y, 1, 1);
    }
  }
  return pixelTexture(c);
}

/**
 * The acid: what actually lies at the bottom of a pit.
 *
 * The pits were empty black, which asks the player to fear a colour. Now they hold a bath
 * of the lab's own spent medium - the brightest, most saturated green in the level, banded
 * like the pools but far more toxic - so a gap in the floor reads as a THING rather than
 * an absence. Tiles horizontally: the surface line and every band run the full width.
 */
export function acidTexture(seed: string, w = 256, h = 128): THREE.CanvasTexture {
  /*
   * Round 2: the first draft was four solid horizontal slabs and read as a flag rather
   * than as liquid. What makes a fluid legible is that its boundaries UNDULATE - the
   * surface rides a wave, and every band below follows it - so the whole thing is drawn
   * per column now, off two sine terms, with the bright meniscus tracking the wave.
   * Horizontal periods divide the texture width exactly, so it still tiles.
   */
  const rng = createRng(seedFrom(seed));
  const { c, g } = surface(w, h);

  /*
   * Round 3, off the first live capture: in the game the pit came out as a flat tan slab,
   * because five of the six bands were bright and the pit only ever shows a slice of the
   * texture. Depth is the whole read here - a bath you can see the bottom of is a puddle.
   * So the light lives in the top tenth and everything under it falls away fast to a
   * near-black throat, which also puts the pit back under the bible's rule that the
   * environment holds the dark: the acid's MENISCUS is bright, the acid is not.
   */
  const bands = [
    mixHex(PAL.mossLit, PAL.slimeGlow, 0.7),
    PAL.mossLit,
    mixHex(PAL.mossMid, PAL.mossDark, 0.35),
    mixHex(PAL.mossDark, PAL.voidDeep, 0.55),
    mixHex(PAL.voidDeep, '#000000', 0.35),
    '#000000',
  ];
  const baseY = h * 0.1;

  for (let x = 0; x < w; x++) {
    const wave =
      Math.sin((x / w) * Math.PI * 4) * 3 +
      Math.sin((x / w) * Math.PI * 10 + 1.2) * 1.6;
    const top = Math.round(baseY + wave);

    // The body, in bands that follow the surface down - squared so the fall-off is fast
    // near the top and the throat is black for most of the depth.
    for (let y = top; y < h; y++) {
      const t = (y - top) / (h - top);
      const idx = Math.min(bands.length - 1, 1 + Math.floor(Math.sqrt(t) * (bands.length - 1)));
      g.fillStyle = bands[idx];
      g.fillRect(x, y, 1, 1);
    }
    // The meniscus: the hot line where acid meets air, two rows thick.
    g.fillStyle = bands[0];
    g.fillRect(x, top, 1, 2);
  }

  // Broken highlights riding the crests - the brightest pixels in the level.
  g.fillStyle = mixHex(PAL.slimeGlow, '#ffffff', 0.35);
  for (let x = 0; x < w; x += Math.round(range(rng, 7, 18))) {
    const wave =
      Math.sin((x / w) * Math.PI * 4) * 3 + Math.sin((x / w) * Math.PI * 10 + 1.2) * 1.6;
    g.fillRect(x, Math.round(baseY + wave) - 1, Math.round(range(rng, 3, 9)), 1);
  }

  // Bubbles rising, and fumes coming off the top.
  for (let i = 0; i < 12; i++) {
    const bx = Math.round(range(rng, 0, w));
    const by = Math.round(range(rng, baseY + 6, baseY + h * 0.22));
    g.fillStyle = bands[0];
    g.fillRect(bx, by, 2, 2);
  }
  for (let i = 0; i < 16; i++) {
    const fx = Math.round(range(rng, 0, w));
    const fy = Math.round(range(rng, baseY - 14, baseY - 2));
    g.fillStyle = mixHex(PAL.mossLit, PAL.voidDeep, range(rng, 0.4, 0.75));
    g.fillRect(fx, fy, 2, 2);
  }

  return pixelTexture(c);
}

/**
 * A foreground occluder sheet: the layer the parallax spec puts at 120%, and the one the
 * stage never had. Near-black shapes IN FRONT of the play plane - the camera moves and
 * they slide across the world faster than anything behind them, which is the strongest
 * depth cue a 2D frame can buy.
 *
 * 'leaves' hangs foliage masses into the top of the sheet (the Gallery - the forest
 * pressing in over the glass). 'pipes' juts service hardware in from one side (the Stack -
 * the shaft is TIGHT, and the machinery does not care where the camera wants to look).
 * Shapes keep to the sheet's own edge; the middle stays clear, because an occluder that
 * covers gameplay is a bug with good intentions.
 */
export function occluderTexture(
  seed: string,
  kind: 'leaves' | 'pipes',
  w = 1280,
  h = 240,
  side: 'left' | 'right' = 'left'
): THREE.CanvasTexture {
  const rng = createRng(seedFrom(seed));
  const { c, g } = surface(w, h);
  const ink = kind === 'leaves' ? '#050a07' : '#04070a';
  g.fillStyle = ink;

  if (kind === 'leaves') {
    // A broken mass along the top: big blob clusters, then strands hanging off them.
    let edge = h * 0.22;
    for (let x = 0; x < w; x++) {
      if (x % 9 === 0) edge += range(rng, -7, 7);
      edge = Math.max(h * 0.06, Math.min(h * 0.42, edge));
      g.fillRect(x, 0, 1, Math.round(edge));
    }
    for (let i = 0; i < w / 60; i++) {
      const bx = range(rng, 0, w);
      blob(g, rng, bx, range(rng, h * 0.2, h * 0.5), range(rng, 16, 38), ink, 1.7);
    }
    for (let i = 0; i < w / 90; i++) {
      let x = range(rng, 0, w);
      const drop = range(rng, h * 0.35, h * 0.85);
      for (let d = 0; d < drop; d++) {
        if (d % 8 === 0) x += range(rng, -1.3, 1.3);
        g.fillRect(Math.round(x), Math.round(d), 3, 1);
      }
      blob(g, rng, x + 1, drop, range(rng, 5, 11), ink, 1.5);
    }
  } else {
    // Hardware from one side: a vertical run hugging the edge, stubs reaching inward.
    const atLeft = side === 'left';
    const edgeX = atLeft ? 0 : w;
    const dir = atLeft ? 1 : -1;
    // The wall run itself.
    g.fillRect(atLeft ? 0 : w - 26, 0, 26, h);
    // Stubs: pipes with flanges, a valve wheel on one.
    const stubs = Math.round(h / 150);
    for (let i = 0; i < stubs; i++) {
      const sy = Math.round(((i + range(rng, 0.2, 0.8)) / stubs) * h);
      const len = Math.round(range(rng, 50, 150));
      const thick = Math.round(range(rng, 10, 22));
      g.fillRect(atLeft ? 0 : w - len, sy, len, thick);
      // The flange at the mouth.
      g.fillRect(edgeX + dir * (len - 6) - (atLeft ? 0 : 8), sy - 4, 8, thick + 8);
      // A drip of ooze off one stub in three.
      if (rng() > 0.66) {
        const dx = edgeX + dir * Math.round(len * range(rng, 0.4, 0.85));
        const drop = Math.round(range(rng, 14, 44));
        for (let d = 0; d < drop; d++) g.fillRect(dx, sy + thick + d, 2, 1);
      }
      // A valve wheel silhouette on one stub per sheet, roughly.
      if (i === Math.floor(stubs / 2)) {
        const vx = edgeX + dir * Math.round(len * 0.55);
        const vy = sy + Math.round(thick / 2);
        const r = 14;
        for (let a = 0; a < 24; a++) {
          const th = (a / 24) * Math.PI * 2;
          g.fillRect(
            Math.round(vx + Math.cos(th) * r),
            Math.round(vy + Math.sin(th) * r),
            2,
            2
          );
        }
        g.fillRect(vx - 2, vy - r, 4, r * 2);
        g.fillRect(vx - r, vy - 2, r * 2, 4);
      }
    }
  }

  return pixelTexture(c);
}

/**
 * God rays: broad shafts of light with a DIRECTION, which is the one thing the old
 * uniform haze never had. Background1 in the reference set builds its whole value
 * structure out of them - the light says where the surface is, and everything is judged
 * against it.
 *
 * Meant for one additive plane: diagonal shafts falling from the upper-left for the
 * Gallery (morning through the broken dome), vertical columns for the Stack (grate light
 * from the world above). Drawn as stepped bands, never gradients - three nested
 * intensities per shaft, brightest core last.
 */
export function godRayTexture(
  seed: string,
  angle: 'diagonal' | 'vertical',
  w = 1024,
  h = 576
): THREE.CanvasTexture {
  /*
   * Round 2: the fade is nested SOLID bands, not row dithering. The first draft faded
   * each shaft by skipping every second then third row, and the live Stack capture read
   * the columns as digital rain - stacked dashes, a glitch effect, not light. Light does
   * not perforate: a shaft is now three nested solid strips (wide dim, mid, narrow core)
   * and the lengthwise fade is three segments of falling alpha with soft-stepped ends,
   * which keeps the banded language without turning the air into a screen effect.
   */
  const rng = createRng(seedFrom(seed));
  const { c, g } = surface(w, h);

  const tint =
    angle === 'diagonal'
      ? [mixHex(PAL.hazeNear, PAL.mossMid, 0.25), mixHex(PAL.hazeNear, PAL.mossMid, 0.45)]
      : [mixHex(PAL.hazeNear, PAL.bioCyan, 0.3), mixHex(PAL.hazeNear, PAL.bioCyan, 0.55)];

  const shafts = angle === 'diagonal' ? 4 : 5;
  const slope = angle === 'diagonal' ? 0.42 : 0;
  for (let i = 0; i < shafts; i++) {
    const x0 =
      ((i + range(rng, 0.1, 0.6)) / shafts) * w - (angle === 'diagonal' ? h * slope * 0.5 : 0);
    const w0 = range(rng, 40, 90) * (angle === 'diagonal' ? 1.4 : 1);
    const reach = h * range(rng, 0.75, 1);
    // Three nested strips; each fades over its own length in three alpha segments.
    const strips = [
      { bw: w0, a: 0.1, colour: tint[0] },
      { bw: w0 * 0.62, a: 0.12, colour: tint[0] },
      { bw: w0 * 0.3, a: 0.16, colour: tint[1] },
    ];
    for (const strip of strips) {
      g.fillStyle = strip.colour;
      const segs = 3;
      for (let sgi = 0; sgi < segs; sgi++) {
        const y0 = Math.round((sgi / segs) * reach);
        const y1 = Math.round(((sgi + 1) / segs) * reach);
        g.globalAlpha = strip.a * (1 - sgi * 0.32);
        if (angle === 'diagonal') {
          // Diagonals march down in short solid slabs so the slope stays pixelated.
          for (let y = y0; y < y1; y += 4) {
            const x2 = x0 + y * slope + (w0 - strip.bw) / 2;
            g.fillRect(Math.round(x2), y, Math.round(strip.bw), 4);
          }
        } else {
          const x2 = x0 + (w0 - strip.bw) / 2;
          g.fillRect(Math.round(x2), y0, Math.round(strip.bw), y1 - y0);
        }
      }
    }
    g.globalAlpha = 1;
  }

  return pixelTexture(c);
}

/**
 * The floor mist: the reference loses its ground line in dark vapour, and this is that -
 * transparent at the top, near-black at the foot, with wisps breaking the boundary so it
 * reads as vapour rather than as a gradient bar. One plane hugging the bottom of the
 * world, IN FRONT of the play plane: the deep tile bodies sink into it, pits fall into
 * mystery, and the walk line stays clear above it.
 */
export function floorMistTexture(seed: string, w = 512, h = 128): THREE.CanvasTexture {
  const rng = createRng(seedFrom(seed));
  const { c, g } = surface(w, h);
  const ink = mixHex(PAL.voidDeep, '#000000', 0.45);

  // The body: stepped rows, alpha rising toward the foot.
  for (let y = 0; y < h; y++) {
    const t = y / h;
    const a = Math.min(0.62, Math.floor(t * 9) / 9) * 0.72;
    if (a <= 0) continue;
    g.globalAlpha = a;
    g.fillStyle = ink;
    g.fillRect(0, y, w, 1);
  }
  g.globalAlpha = 1;

  // Wisps riding the boundary: soft humps of the same ink at the mist's own top alpha.
  for (let i = 0; i < 14; i++) {
    const wx = Math.round(range(rng, 0, w));
    const wy = Math.round(range(rng, h * 0.12, h * 0.4));
    const ww = Math.round(range(rng, 20, 60));
    g.globalAlpha = 0.14;
    g.fillStyle = ink;
    for (let dy = 0; dy < 8; dy++) {
      const half = Math.round((ww / 2) * Math.sqrt(Math.max(0, 1 - (dy / 8) ** 2)));
      g.fillRect(wx - half, wy - dy, half * 2, 1);
    }
  }
  g.globalAlpha = 1;

  return pixelTexture(c);
}

/**
 * The greenhouse dome: the Gallery's midground, and the single image that says "lab".
 *
 * Every reference that reads as a laboratory earns it here - a glass lattice dome, backlit
 * by the haze, filling the upper background. Ribs are drawn dark against panes one step
 * brighter than the haze; a few panes are BROKEN (the lattice shows the sky through a
 * darker gap, with a hanging shard); moss rides the horizontal ribs; and a handful of
 * panes glow warm from inside - the lab's lights, still on, with nobody left to need them.
 *
 * A silhouette sheet, transparent everywhere the dome is not, meant for a plane between
 * the far forest and the middle forest layer.
 */
export function domeTexture(seed: string, w = 1280, h = 520): THREE.CanvasTexture {
  const rng = createRng(seedFrom(seed));
  const { c, g } = surface(w, h);

  /*
   * Round 2 values. The first draft graded the panes in two flat bands - a bright ring at
   * the crown over a near-void body - and the dome read as a flying saucer. Everything
   * here now lives inside the haze family on a SMOOTH four-step ramp (glass in front of
   * hazy light is just haze, slightly organised), and the ribs sit one step darker than
   * whatever pane they cross, never black.
   */
  const paneRamp = [
    mixHex(PAL.hazeNear, PAL.bioCyan, 0.35),
    mixHex(PAL.hazeNear, PAL.bioCyan, 0.18),
    mixHex(PAL.hazeFar, PAL.hazeNear, 0.85),
    mixHex(PAL.hazeFar, PAL.hazeNear, 0.55),
  ];
  const rib = mixHex(PAL.hazeFar, PAL.voidMid, 0.55);
  const ribLit = mixHex(rib, PAL.hazeNear, 0.5);

  /** One dome: a stepped pixel arc of panes inside a ribbed lattice. */
  const dome = (cx: number, baseY: number, radius: number, squash: number): void => {
    const rows = Math.round(radius * squash);
    // Panes first: horizontal bands of glass, brighter toward the crown where the
    // backlight is strongest.
    for (let dy = 0; dy < rows; dy++) {
      const t = dy / rows;
      const half = Math.round(radius * Math.sqrt(Math.max(0, 1 - (1 - t) ** 2)));
      const y2 = baseY - rows + dy;
      if (y2 < 0 || y2 >= h) continue;
      const band = paneRamp[Math.min(paneRamp.length - 1, Math.floor(t * paneRamp.length))];
      // The glass has a CENTRE: flanks fall a step toward the haze, so the pane grid
      // stops reading as one uniform wall of tiles across the whole frame.
      g.fillStyle = band;
      g.fillRect(cx - Math.round(half * 0.7), y2, Math.round(half * 1.4), 1);
      g.fillStyle = mixHex(band, PAL.hazeFar, 0.45);
      g.fillRect(cx - half, y2, Math.round(half * 0.32), 1);
      g.fillRect(cx + half - Math.round(half * 0.32), y2, Math.round(half * 0.32), 1);
    }
    // Vertical ribs: meridians converging on the crown.
    const meridians = Math.max(5, Math.round(radius / 34));
    for (let m = 0; m <= meridians; m++) {
      const k = m / meridians;
      const topX = cx + Math.round((k - 0.5) * radius * 0.5);
      const botX = cx + Math.round((k - 0.5) * 2 * radius);
      for (let dy = 0; dy < rows; dy++) {
        const t = dy / rows;
        const x2 = Math.round(topX + (botX - topX) * t);
        const y2 = baseY - rows + dy;
        if (y2 < 0 || y2 >= h) continue;
        g.fillStyle = rib;
        g.fillRect(x2, y2, 2, 1);
      }
    }
    // Horizontal rib rings, with moss riding the lower ones.
    for (let ring = 1; ring <= 4; ring++) {
      const t = ring / 4.6;
      const y2 = baseY - rows + Math.round(rows * t);
      const half = Math.round(radius * Math.sqrt(Math.max(0, 1 - (1 - t) ** 2)));
      g.fillStyle = ring < 3 ? rib : ribLit;
      g.fillRect(cx - half, y2, half * 2, 2);
      if (ring >= 3) {
        for (let x2 = cx - half; x2 < cx + half; x2 += Math.round(range(rng, 6, 16))) {
          g.fillStyle = PAL.mossDark;
          g.fillRect(x2, y2 + 2, Math.round(range(rng, 2, 5)), Math.round(range(rng, 1, 3)));
        }
      }
    }
    // Broken panes: gaps torn in the glass, one shard hanging.
    for (let b = 0; b < 3; b++) {
      const t = range(rng, 0.15, 0.75);
      const half = Math.round(radius * Math.sqrt(Math.max(0, 1 - (1 - t) ** 2)));
      const bx = cx + Math.round(range(rng, -half * 0.8, half * 0.8));
      const by = baseY - rows + Math.round(rows * t);
      const bw = Math.round(range(rng, 8, 20));
      const bh = Math.round(range(rng, 5, 12));
      g.clearRect(bx, by, bw, bh);
      g.fillStyle = rib;
      g.fillRect(bx, by, 1, Math.round(bh * 0.6));
      g.fillRect(bx + bw - 1, by, 1, Math.round(bh * 0.4));
    }
    // The lights left on: whole PANES glowing warm, low in the dome, bounded by their
    // own ribs - a lit window, not a pixel. Sized off the radius so every dome carries
    // lights that survive the display scale.
    /*
     * Round 3: dimmed INTO the glass. At radius*0.09 with a lampCore chip these rendered
     * as crisp yellow cards floating on the midground - two capture rounds were spent
     * hunting them as "mystery buttons". A window seen through a hundred metres of haze
     * is a warm BLUR in the glass: small, borderless, mixed well toward the pane it
     * lives in, and never carrying the clipping core colour.
     */
    for (let l = 0; l < 3; l++) {
      const t = range(rng, 0.5, 0.8);
      const half = Math.round(radius * Math.sqrt(Math.max(0, 1 - (1 - t) ** 2)));
      const lw = Math.min(12, Math.max(6, Math.round(radius * 0.05)));
      const lh = Math.min(8, Math.max(4, Math.round(radius * 0.032)));
      const lx = cx + Math.round(range(rng, -half * 0.7, half * 0.7 - lw));
      const ly = baseY - rows + Math.round(rows * t);
      g.fillStyle = mixHex(PAL.lampWarm, paneRamp[2], 0.55);
      g.fillRect(lx - 2, ly - 1, lw + 4, lh + 2);
      g.fillStyle = mixHex(PAL.lampWarm, paneRamp[2], 0.3);
      g.fillRect(lx, ly, lw, lh);
    }

    /*
     * The drum: a walled base under the glass, so the dome is a BUILDING standing on the
     * ground rather than a hemisphere floating over it. Vertical panelling one step
     * darker than the glass, a lit cornice where drum meets dome, and a tall doorway.
     */
    const drumH = Math.round(radius * 0.28);
    const drumHalf = Math.round(radius * 0.94);
    g.fillStyle = paneRamp[3];
    g.fillRect(cx - drumHalf, baseY, drumHalf * 2, drumH);
    g.fillStyle = ribLit;
    g.fillRect(cx - drumHalf, baseY, drumHalf * 2, 2);
    // Panelling every 24px at low contrast: at 14px and full rib value the live capture
    // read the drum as chain-link noise behind the platform signs.
    g.fillStyle = mixHex(paneRamp[3], rib, 0.5);
    for (let px2 = cx - drumHalf; px2 <= cx + drumHalf; px2 += 24) {
      g.fillRect(px2, baseY, 2, drumH);
    }
    // The doorway, dark, with a warm interior sliver on one side.
    const doorW = Math.max(8, Math.round(radius * 0.08));
    const doorX = cx + Math.round(range(rng, -drumHalf * 0.5, drumHalf * 0.5));
    g.fillStyle = mixHex(PAL.voidDeep, '#000000', 0.3);
    g.fillRect(doorX, baseY + Math.round(drumH * 0.25), doorW, Math.round(drumH * 0.75));
    g.fillStyle = mixHex(PAL.lampWarm, PAL.voidDeep, 0.5);
    g.fillRect(doorX + doorW - 2, baseY + Math.round(drumH * 0.35), 2, Math.round(drumH * 0.6));

    /*
     * The forest takes it back. The pass-40 capture showed the drum ending in two hard
     * straight lines - a cornice stripe and a base stripe - cutting clean across the
     * frame, and a structure with clean edges among organic silhouettes reads as a
     * sticker (the machinery band learned this in pass 26). So: growth clumps breaking
     * the cornice, strands hanging down the glass, moss beards under the base, and the
     * drum's foot dissolving into dark rather than stopping on a line.
     */
    const eat = mixHex(PAL.voidMid, PAL.leafDark, 0.5);
    // Clumps riding the cornice, biggest at the drum's corners.
    for (let k = 0; k < Math.max(4, Math.round(drumHalf / 40)); k++) {
      const ex = cx + Math.round(range(rng, -drumHalf, drumHalf));
      blob(g, rng, ex, baseY + range(rng, -4, 4), range(rng, 7, 16), eat, 1.6);
    }
    blob(g, rng, cx - drumHalf, baseY, range(rng, 12, 20), eat, 1.7);
    blob(g, rng, cx + drumHalf, baseY, range(rng, 12, 20), eat, 1.7);
    // Strands down the glass, sparse, hanging from the lower rib ring.
    for (let k = 0; k < 5; k++) {
      let sx = cx + Math.round(range(rng, -radius * 0.8, radius * 0.8));
      const sy = baseY - Math.round(rows * range(rng, 0.1, 0.3));
      const drop = range(rng, 14, 46);
      g.fillStyle = eat;
      for (let d = 0; d < drop; d++) {
        if (d % 7 === 0) sx += range(rng, -1, 1);
        g.fillRect(Math.round(sx), sy + d, 2, 1);
      }
    }
    // The glass's bottom rows get their own nibble of growth, so the pane grid never
    // ends on a straight line even where the drum hides behind a trunk.
    for (let k = 0; k < Math.max(5, Math.round(drumHalf / 34)); k++) {
      const ex = cx + Math.round(range(rng, -radius * 0.9, radius * 0.9));
      blob(g, rng, ex, baseY - Math.round(range(rng, 0, rows * 0.08)), range(rng, 5, 12), eat, 1.5);
    }

    // The foot dissolves: stepped dark rows swallowing the drum's last quarter.
    const sink = mixHex(PAL.voidDeep, '#000000', 0.2);
    for (let d = 0; d < Math.round(drumH * 0.45); d++) {
      const t = d / (drumH * 0.45);
      g.globalAlpha = 0.25 + Math.floor(t * 5) / 5 * 0.75;
      g.fillStyle = sink;
      g.fillRect(cx - drumHalf - 6, baseY + drumH - d, drumHalf * 2 + 12, 1);
    }
    g.globalAlpha = 1;
    // Moss beard under the cornice lip.
    mossRun(g, rng, cx - drumHalf, cx + drumHalf, baseY + 2, 8);
  };

  // One grand dome off-centre and two smaller flanks - a facility, not a monument. Base
  // lines sit high enough that each drum still fits inside the canvas.
  dome(Math.round(w * range(rng, 0.42, 0.58)), h - 90, Math.round(range(rng, 240, 300)), 0.72);
  dome(Math.round(w * range(rng, 0.12, 0.2)), h - 50, Math.round(range(rng, 120, 160)), 0.66);
  dome(Math.round(w * range(rng, 0.78, 0.88)), h - 55, Math.round(range(rng, 100, 150)), 0.7);

  return pixelTexture(c);
}

/**
 * The pipe stacks: the Stack's midground. Vertical runs, tanks and valve hardware in
 * silhouette, with the lab's emergency circuit - pale cyan pilot lights - instead of the
 * Gallery's warm panes. Same job as domeTexture: say what this place IS from the back of
 * the frame.
 */
export function pipeStackTexture(seed: string, w = 1280, h = 760): THREE.CanvasTexture {
  const rng = createRng(seedFrom(seed));
  const { c, g } = surface(w, h);

  /*
   * Round 2 values: the first draft mixed the bodies off voidMid and the whole sheet was
   * black-on-black. Midground silhouettes read against the haze BEHIND them, so their
   * values come from the haze family - dark enough to silhouette, never darker than the
   * frame's own corners.
   */
  const body = mixHex(PAL.hazeFar, PAL.hazeNear, 0.3);
  const lit = mixHex(PAL.hazeNear, PAL.bioCyan, 0.12);
  const shade = mixHex(PAL.hazeFar, PAL.voidMid, 0.45);

  // Vertical pipe runs from floor to out-of-frame, in loose groups.
  const groups = 4;
  for (let gi = 0; gi < groups; gi++) {
    const gx = ((gi + 0.25 + rng() * 0.5) / groups) * w;
    const count = Math.round(range(rng, 2, 4));
    for (let pi = 0; pi < count; pi++) {
      const px = Math.round(gx + pi * range(rng, 14, 26));
      const pw = Math.round(range(rng, 10, 20));
      const top = Math.round(range(rng, 0, h * 0.3));
      g.fillStyle = body;
      g.fillRect(px, top, pw, h - top);
      g.fillStyle = lit;
      g.fillRect(px, top, 2, h - top);
      g.fillStyle = shade;
      g.fillRect(px + pw - 3, top, 3, h - top);
      // Flanges.
      for (let fy = top + 20; fy < h; fy += Math.round(range(rng, 60, 120))) {
        g.fillStyle = body;
        g.fillRect(px - 3, fy, pw + 6, 6);
        g.fillStyle = lit;
        g.fillRect(px - 3, fy, pw + 6, 1);
      }
      // An elbow near the top of the shorter runs.
      if (top > 40 && rng() > 0.5) {
        const reach = Math.round(range(rng, 30, 80));
        const dir = rng() > 0.5 ? 1 : -1;
        g.fillStyle = body;
        g.fillRect(dir > 0 ? px : px - reach, top, reach + pw, pw);
        g.fillStyle = lit;
        g.fillRect(dir > 0 ? px : px - reach, top, reach + pw, 1);
      }
    }
    // A tank at some groups' feet: a fat rounded vessel with a pilot light.
    if (rng() > 0.4) {
      const tw = Math.round(range(rng, 60, 110));
      const th = Math.round(range(rng, 70, 120));
      const tx = Math.round(gx - tw / 2 + range(rng, -20, 20));
      const ty = h - th;
      g.fillStyle = body;
      g.fillRect(tx + 3, ty, tw - 6, th);
      g.fillRect(tx, ty + 4, tw, th - 4);
      g.fillStyle = lit;
      g.fillRect(tx + 3, ty, tw - 6, 2);
      // Weld seams.
      g.fillStyle = mixHex(body, '#000000', 0.3);
      g.fillRect(tx, ty + Math.round(th * 0.4), tw, 2);
      /*
       * The pilot light, DIMMED to its depth. The first version panelled it in lampCore,
       * which the Stack's palette lifts to clipping white - and since most tank bodies
       * hide behind the level's floor tiles, the live capture showed the gauges alone,
       * peeking through gaps as context-free white chips floating beside the gate. A
       * midground light must never out-value the play plane: the panel now sits mixed
       * well toward the tank's own body, no core pip, and reads as a distant service
       * light whether or not its tank is visible.
       */
      const gw = Math.max(8, Math.round(tw * 0.16));
      const gh = Math.max(6, Math.round(th * 0.12));
      const gx2 = tx + Math.round(tw * 0.62);
      const gy2 = ty + Math.round(th * 0.28);
      g.fillStyle = mixHex(PAL.lampWarm, body, 0.75);
      g.fillRect(gx2 - 1, gy2 - 1, gw + 2, gh + 2);
      g.fillStyle = mixHex(PAL.lampWarm, body, 0.5);
      g.fillRect(gx2, gy2, gw, gh);
    }
  }

  // Grated catwalk lines crossing between groups, sparse.
  for (let i = 0; i < 3; i++) {
    const cy = Math.round(range(rng, h * 0.25, h * 0.8));
    const x0 = Math.round(range(rng, 0, w * 0.5));
    const len = Math.round(range(rng, w * 0.2, w * 0.45));
    g.fillStyle = body;
    g.fillRect(x0, cy, len, 4);
    g.fillStyle = lit;
    g.fillRect(x0, cy, len, 1);
    for (let x2 = x0; x2 < x0 + len; x2 += 9) {
      g.fillStyle = body;
      g.fillRect(x2, cy + 4, 2, 8);
    }
  }

  return pixelTexture(c);
}

/**
 * One parallax layer of overgrowth, as pure silhouette.
 *
 * The reference frames get their depth from four or five planes of organic shapes fading
 * into the haze - trunks, canopies, root masses, hanging moss - and the game had ONE
 * backdrop plane with structures painted into it. Painted-in depth cannot parallax and
 * cannot be tuned; planes can do both. Each layer is a transparent sheet of silhouettes
 * in a single colour, because a silhouette's whole job is its EDGE - interior detail at
 * these depths would fight the gameplay plane for attention and lose the depth read that
 * flatness buys.
 *
 * depth 0 is the faintest and simplest (canopy masses, thin trunks), 2 the boldest
 * (gnarled trunks with root flares and hanging strands). The caller picks the colour so
 * each stage can pull the forest toward its own haze.
 */
export function forestLayer(
  seed: string,
  depth: 0 | 1 | 2,
  colour: string,
  w = 1280,
  h = 760,
  density = 1
): THREE.CanvasTexture {
  const rng = createRng(seedFrom(seed));
  const { c, g } = surface(w, h);
  g.fillStyle = colour;

  // Density scales the trunk count: the Stack keeps a thinner forest than the Gallery.
  const trunks = Math.max(2, Math.round([4, 5, 6][depth] * density));
  const baseY = h;

  for (let i = 0; i < trunks; i++) {
    const tx = ((i + 0.2 + rng() * 0.6) / trunks) * w;
    const trunkW = [18, 26, 40][depth] * range(rng, 0.7, 1.3);
    const trunkH = h * range(rng, 0.55, 0.95);
    const lean = range(rng, -0.16, 0.16);

    /*
     * The trunk: a wandering column, drawn as rows so the profile can breathe. Width
     * tapers with height and the wander is low-frequency - a trunk that jitters per-row
     * reads as static, one that drifts reads as grown.
     */
    let cx = tx;
    let drift = 0;
    const knots = range(rng, 0.02, 0.045);
    const knotPhase = range(rng, 0, Math.PI * 2);
    for (let y = 0; y < trunkH; y++) {
      const k = y / trunkH;
      if (y % 9 === 0) drift = range(rng, -1.4, 1.4);
      cx += lean * 0.7 + drift * 0.12;
      /*
       * Gnarl: a low-frequency bulge riding the taper, plus a root flare over the first
       * 150 rows. The first draft flared only the bottom 30 - which the floor tiles then
       * covered entirely - and tapered linearly, and the pass-25 capture showed exactly
       * what that buys: parallel poles. A trunk is a muscle, not a bar.
       */
      const bulge = 1 + Math.sin(y * knots + knotPhase) * 0.22;
      const flare = y < 150 ? 1 + ((150 - y) / 150) ** 2 * 1.6 : 1;
      const wHere = trunkW * (1 - k * 0.55) * bulge * flare;
      g.fillRect(Math.round(cx - wHere / 2), baseY - y, Math.round(wHere), 1);

      // Branches: sparse, arcing away and thinning to nothing.
      if (depth > 0 && k > 0.35 && rng() < 0.045) {
        const dir = rng() > 0.5 ? 1 : -1;
        let bx = cx;
        let by = baseY - y;
        const blen = range(rng, 30, 90) * (1 - k * 0.4);
        for (let b = 0; b < blen; b++) {
          const bk = b / blen;
          bx += dir * (1.2 - bk * 0.5);
          by -= 0.55 + bk * 0.35;
          const bw = Math.max(1, Math.round(5 * (1 - bk)));
          g.fillRect(Math.round(bx - bw / 2), Math.round(by), bw, 1);
        }
        // A canopy clump at the branch tip, on the two nearer depths.
        if (depth > 0) {
          blob(g, rng, bx, by, range(rng, 10, 22) * (depth === 2 ? 1.2 : 1), colour, 1.6);
        }
      }
    }

    /*
     * The canopy mass over the trunk head - CONNECTED to it. The first draft scattered
     * clumps up to 1.6 trunk-widths sideways from a head that had tapered nearly to a
     * point, and the live capture showed the result: dark slabs floating beside their
     * trees. A canopy is a pyramid standing on its trunk: the biggest clump sits ON the
     * head, and each further clump is smaller, closer in value to the last, and OVERLAPS
     * the previous one - grown out of it, not placed near it.
     */
    const headY = baseY - trunkH;
    let clumpX = cx;
    let clumpY = headY + 6;
    blob(g, rng, clumpX, clumpY, range(rng, 20, 30), colour, 1.6);
    for (let cl = 0; cl < 2 + depth; cl++) {
      clumpX += range(rng, -trunkW * 0.7, trunkW * 0.7);
      clumpY += range(rng, -12, 4);
      blob(g, rng, clumpX, clumpY, range(rng, 12, 22), colour, 1.6);
    }

    // Hanging strands off the canopy, nearest layer only - moss needs to be close to read.
    if (depth === 2) {
      for (let m = 0; m < 4; m++) {
        let mx = cx + range(rng, -trunkW * 1.8, trunkW * 1.8);
        const drop = range(rng, 26, 90);
        for (let d = 0; d < drop; d++) {
          if (d % 8 === 0) mx += range(rng, -1, 1);
          g.fillRect(Math.round(mx), Math.round(headY + d), 2, 1);
        }
      }
    }
  }

  return pixelTexture(c);
}

/**
 * The canopy overhang: near-black foliage hanging into the top of the frame.
 *
 * Every reference frame is CLOSED at the top - leaves, branches and moss hang into the
 * first hundred pixels, so the bright playfield sits inside a dark surround instead of
 * running off the screen edge. The game's frame was open on all four sides, which is a
 * large part of why the references read as places and the stage read as a diagram.
 */
export function canopyTexture(seed: string, w = 1280, h = 180): THREE.CanvasTexture {
  const rng = createRng(seedFrom(seed));
  const { c, g } = surface(w, h);
  const ink = '#0a120e';
  g.fillStyle = ink;

  // The solid mass along the top, its lower boundary wandering.
  let edge = h * 0.32;
  for (let x = 0; x < w; x++) {
    if (x % 7 === 0) edge += range(rng, -6, 6);
    edge = Math.max(h * 0.14, Math.min(h * 0.55, edge));
    g.fillRect(x, 0, 1, Math.round(edge));
  }

  // Leaf clumps breaking the boundary.
  for (let i = 0; i < w / 26; i++) {
    const x = range(rng, 0, w);
    blob(g, rng, x, range(rng, h * 0.25, h * 0.6), range(rng, 10, 26), ink, 1.6);
  }

  /*
   * Hanging strands, some with a leaf tip - none allowed within 14 rows of the texture's
   * bottom. A strand (or its tip blob) that touches the last row bleeds at the plane
   * boundary and draws a faint FULL-WIDTH hairline across the sky, which is exactly what
   * the live capture showed at the canopy's edge. The clamp costs nothing visible; the
   * longest strands already read as long.
   */
  for (let i = 0; i < w / 40; i++) {
    let x = range(rng, 0, w);
    const drop = Math.min(h - 24, range(rng, h * 0.3, h * 0.9));
    for (let d = 0; d < drop; d++) {
      if (d % 9 === 0) x += range(rng, -1.2, 1.2);
      g.fillRect(Math.round(x), Math.round(d), 2, 1);
    }
    if (rng() > 0.4) blob(g, rng, x, Math.min(h - 14, drop), range(rng, 4, 9), ink, 1.4);
  }

  return pixelTexture(c);
}

/**
 * The vignette: a soft dark surround, drawn once, stretched over the view.
 *
 * Rendered as coarse concentric steps rather than a smooth radial so it stays in the
 * stage's banded language. The corners take most of the weight; the centre is untouched.
 */
export function vignetteTexture(size = 256): THREE.CanvasTexture {
  const { c, g } = surface(size, size);
  const cx = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - cx) / cx;
      const dy = (y - cx) / cx;
      const d = Math.sqrt(dx * dx + dy * dy);
      const a = Math.max(0, (d - 0.62) / 0.55);
      const stepped = Math.min(0.5, Math.floor(a * 7) / 7) * 0.55;
      if (stepped <= 0) continue;
      g.fillStyle = `rgba(4, 10, 8, ${stepped.toFixed(3)})`;
      g.fillRect(x, y, 1, 1);
    }
  }
  return pixelTexture(c);
}

/**
 * A vertical depth fade for tile interiors: transparent at the top, dark at the bottom.
 *
 * Large stone expanses repeated one 128x96 texture and read as wallpaper - the reference
 * (and every top-tier 2D platformer) lights the SURFACE of a mass and lets its interior
 * fall to dark, so the eye reads a lit edge on a solid body instead of a patterned
 * rectangle. One 8x64 gradient, stretched per tile; the steps keep it banded.
 */
export function interiorFadeTexture(): THREE.CanvasTexture {
  const { c, g } = surface(8, 64);
  for (let y = 0; y < 64; y++) {
    const k = y / 63;
    const a = Math.min(0.62, Math.floor(k * 8) / 8) * 0.72;
    if (a <= 0) continue;
    g.fillStyle = `rgba(5, 9, 7, ${a.toFixed(3)})`;
    g.fillRect(0, y, 8, 1);
  }
  return pixelTexture(c);
}

/**
 * One eye for the specimen: a dark pupil with a catch-light.
 *
 * Every creature on the reference design sheet - the player slime in all five poses, every
 * enemy - has two dot eyes with a light in them, and that is most of where the charm lives.
 * Ours was an eyeless mass: technically a blob, emotionally a puddle. The pupil is the
 * darkest green in the world rather than black so it still belongs to the body it sits on,
 * and the catch-light is 2x2 - big enough to survive the display scale (the pass-11 rule).
 */
export function eyeTexture(w = 10, h = 14): THREE.CanvasTexture {
  const { c, g } = surface(w, h);
  const cx = w / 2;
  const cy = h / 2;
  g.fillStyle = mixHex(PAL.voidDeep, '#000000', 0.5);
  for (let y = 0; y < h; y++) {
    const t = (y - cy) / (h / 2 - 1);
    const half = Math.round((w / 2 - 1) * Math.sqrt(Math.max(0, 1 - t * t)));
    if (half > 0) g.fillRect(Math.round(cx - half), y, half * 2, 1);
  }
  g.fillStyle = '#ffffff';
  g.fillRect(Math.round(cx), Math.round(cy - h * 0.22), 2, 2);
  return pixelTexture(c);
}

/**
 * The shed-mass marker: a small down-chevron in the shed bar's own orange, hung above a
 * lump the player left behind. The HUD already counts what is missing; this says WHERE,
 * which is the half of the question a count cannot answer.
 */
export function markerTexture(size = 26): THREE.CanvasTexture {
  const { c, g } = surface(size, size);
  const cx = size / 2;
  for (let row = 0; row < 7; row++) {
    const half = 9 - row;
    if (half <= 0) break;
    g.fillStyle = row < 2 ? '#f4a05c' : '#d8703c';
    g.fillRect(Math.round(cx - half), size - 10 + row - 6, half * 2, 2);
  }
  return pixelTexture(c);
}

/** Blend two hex colours. Banding and shading only - never for smoothing an edge. */
function mixHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const k = Math.max(0, Math.min(1, t));
  return `#${pa
    .map((v, i) => Math.round(v + (pb[i] - v) * k).toString(16).padStart(2, '0'))
    .join('')}`;
}
