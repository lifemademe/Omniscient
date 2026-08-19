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

import { PIXEL_FONT } from '../omniscient/view/pixelFont.js';

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
export const PAL = Object.fromEntries(
  Object.entries(PAL_RAW).map(([k, v]) => [
    k,
    lift(v, MUTE[k as keyof typeof PAL_RAW] ?? MUTE_DEFAULT),
  ])
) as Record<keyof typeof PAL_RAW, string>;

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
export function stoneTexture(seed: string, w = 128, h = 96): THREE.CanvasTexture {
  const rng = createRng(seedFrom(seed));
  const { c, g } = surface(w, h);

  g.fillStyle = PAL.stoneDark;
  g.fillRect(0, 0, w, h);

  // Blocks in courses, offset row to row so no vertical seam runs the height of the slab.
  let y = 0;
  let course = 0;
  while (y < h) {
    const rowH = Math.round(range(rng, 16, 26));
    let x = -Math.round(range(rng, 0, 30)) - course * 11;
    while (x < w) {
      const bw = Math.round(range(rng, 22, 40));
      /*
       * Seven steps of stone, not three.
       *
       * Blocks are picked off a ramp from the darkest stone to the lit edge, weighted toward
       * the middle so the wall still reads as one material rather than as a chequerboard.
       * The extra steps cost nothing to draw and are most of what separates a worked surface
       * from a filled rectangle.
       */
      const STEPS = 7;
      const pick = Math.floor((rng() * 0.6 + rng() * 0.6) * STEPS * 0.83);
      const base = ramp(PAL.stoneDark, PAL.stoneEdge, STEPS, pick);
      g.fillStyle = base;
      g.fillRect(x + 1, y + 1, bw - 2, rowH - 2);
      // A lit top lip on each block, one step above the block's own value so the light reads
      // as falling on THAT stone rather than as a constant applied to every stone.
      g.fillStyle = ramp(PAL.stoneDark, PAL.stoneEdge, STEPS, pick + 2);
      g.fillRect(x + 1, y + 1, bw - 2, 1);
      // And a shaded foot, which the previous version had no equivalent of at all.
      g.fillStyle = ramp(PAL.stoneDark, PAL.stoneEdge, STEPS, Math.max(0, pick - 2));
      g.fillRect(x + 1, y + rowH - 3, bw - 2, 1);
      // Cracks, sparingly. Every block having one reads as noise rather than as age.
      if (rng() > 0.78) {
        g.fillStyle = PAL.stoneDark;
        const cx = x + Math.round(range(rng, 4, bw - 6));
        let cy = y + 3;
        let wander = cx;
        while (cy < y + rowH - 3) {
          g.fillRect(wander, cy, 1, 1);
          wander += Math.round(range(rng, -1, 1));
          cy += 1;
        }
      }
      // Moss in the seam under every block.
      if (rng() > 0.35) mossRun(g, rng, x + 1, x + bw - 1, y + rowH - 2, Math.round(range(rng, 3, 10)));
      x += bw;
    }
    y += rowH;
    course += 1;
  }

  // The top surface: where the moss really lives.
  mossRun(g, rng, 0, w, 0, 14);
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

    // Lit panes, the only warm thing in the distance.
    if (rng() > 0.5) {
      g.fillStyle = '#4a7f5f';
      for (let k = 0; k < 5; k++) {
        g.fillRect(bx + Math.round(range(rng, 3, bw - 6)), baseY - Math.round(range(rng, 6, bh - 6)), 3, 4);
      }
      g.fillStyle = PAL.voidMid;
    }
  }

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
  for (let i = 0; i < 9; i++) {
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
    const tone = mixHex(
      mixHex(PAL.voidMid, PAL.rustDark, range(rng, 0.35, 0.9)),
      PAL.rustMid,
      range(rng, 0, 0.45)
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
      // A lit sliver down one side, so the cylinder reads as round.
      g.fillStyle = mixHex(tone, PAL.rustLit, 0.65);
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
      g.fillStyle = mixHex(tone, PAL.rustLit, 0.6);
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
 * A standing pool, for the top of a platform.
 *
 * Pass 11 tried to widen the stage's value range with one and two pixel speculars scattered
 * over every lit stone, and it measured worse than doing nothing: a single pixel is below the
 * resolution of both the screen and any sampling of it, so it never reads as a highlight and
 * merely muddies its neighbours. The finding survived the revert - nothing in this stage is
 * wet enough to catch light, and the reference sets the top of its range on running water -
 * and this is that finding delivered at a size that can actually register.
 *
 * A pool is the right carrier because it is large, flat, horizontal and therefore the one
 * surface in a side-on scene that can plausibly mirror the light source. The bright bands
 * across it are reflections, and they are the brightest pixels in the level by a wide margin.
 */
export function poolTexture(seed: string, w = 128, h = 32): THREE.CanvasTexture {
  const rng = createRng(seedFrom(seed));
  const { c, g } = surface(w, h);
  const midY = Math.round(h * 0.55);

  // The water body: an irregular lens, darker than the stone it sits on.
  for (let x = 0; x < w; x++) {
    const t = x / w;
    // Thickest in the middle, tapering to nothing at both ends, with a wobbling edge.
    const depth = Math.round(
      Math.sin(t * Math.PI) * (h * 0.4) + range(rng, -1.2, 1.2)
    );
    if (depth <= 0) continue;
    for (let dy = -depth; dy <= depth; dy++) {
      const d = Math.abs(dy) / depth;
      g.fillStyle = ramp(PAL.voidDeep, PAL.hazeNear, 5, Math.round((1 - d) * 3));
      g.fillRect(x, midY + dy, 1, 1);
    }
  }

  /*
   * Reflections: two or three horizontal bands of near-white.
   *
   * Horizontal because that is what a flat water surface does with a light above it, and
   * banded rather than a gradient for the same reason everything else here is banded. These
   * are wide - a third of the pool at a time - which is the whole difference between this and
   * the pips that failed.
   */
  for (let i = 0; i < 3; i++) {
    const by = midY + Math.round(range(rng, -h * 0.18, h * 0.22));
    const bx = Math.round(range(rng, w * 0.1, w * 0.5));
    const bw = Math.round(range(rng, w * 0.18, w * 0.4));
    const bright = i === 0 ? PAL.spec : ramp(PAL.hazeNear, PAL.spec, 4, 2);
    g.fillStyle = bright;
    g.fillRect(bx, by, bw, 1);
    if (rng() > 0.4) {
      g.fillStyle = ramp(PAL.hazeNear, PAL.spec, 4, 1);
      g.fillRect(bx - Math.round(bw * 0.2), by + 1, Math.round(bw * 1.2), 1);
    }
  }

  // A wet rim where the water meets the stone, and a few drips over the front edge.
  for (let x = 0; x < w; x++) {
    const t = x / w;
    const depth = Math.round(Math.sin(t * Math.PI) * (h * 0.4));
    if (depth <= 1) continue;
    g.fillStyle = ramp(PAL.mossMid, PAL.spec, 5, 2);
    g.fillRect(x, midY - depth, 1, 1);
    if (rng() > 0.9) {
      g.fillStyle = PAL.slimeGlow;
      g.fillRect(x, midY + depth, 1, Math.round(range(rng, 1, 4)));
    }
  }

  return pixelTexture(c);
}

/**
 * The ragged lip that sits on a platform's top edge.
 *
 * Every platform in this stage is a box, so every platform reads with a dead-straight top and
 * a square-cut end - which is the last strongly "tile map" thing in the frame. The reference
 * never shows a straight edge: there is always rubble, a tuft of growth, or a broken corner
 * poking up out of the line.
 *
 * Drawn on a transparent canvas whose LOWER half is solid platform and whose upper half is
 * empty except for the things breaking upward through it. Straddled over the real edge, the
 * solid half hides the box's own corner and the broken half becomes the silhouette. The
 * collision box underneath is untouched - this is paint over a level that already plays, and
 * the harness would catch it if it were not.
 */
export function lipTexture(seed: string, w = 256, h = 64): THREE.CanvasTexture {
  const rng = createRng(seedFrom(seed));
  const { c, g } = surface(w, h);
  const line = Math.round(h * 0.5);

  /*
   * The solid half: the top of the platform, in stone AND its moss.
   *
   * The first version drew plain stone here and it measurably dimmed the stage - palette fell
   * five points and the highlights with it. The reason is that this band sits exactly over the
   * brightest, most varied strip in the whole level: the moss run along a platform's top edge.
   * Covering that with grey rubble is a straight trade of the stage's best pixels for a
   * broken silhouette, and there is no reason to accept the trade when the lip can simply
   * carry the moss itself.
   */
  for (let x = 0; x < w; x++) {
    const shade = Math.floor(rng() * 4);
    g.fillStyle = ramp(PAL.stoneDark, PAL.stoneEdge, 6, 1 + shade);
    g.fillRect(x, line, 1, h - line);
  }
  mossRun(g, rng, 0, w, line, 16);

  /*
   * Rubble breaking upward through the line.
   *
   * Irregular in height AND in spacing, because evenly spaced bumps read as crenellations.
   * Each lump is drawn as a stack of narrowing rows so its own silhouette is stepped too.
   */
  let x = 0;
  while (x < w) {
    const gap = Math.round(range(rng, 2, 26));
    x += gap;
    if (x >= w) break;
    const lumpW = Math.round(range(rng, 4, 22));
    const lumpH = Math.round(range(rng, 2, line * 0.85));
    for (let i = 0; i < lumpH; i++) {
      const t = i / lumpH;
      const inset = Math.round(t * lumpW * 0.42 + range(rng, 0, 1.4));
      const wide = lumpW - inset * 2;
      if (wide <= 0) break;
      g.fillStyle = ramp(PAL.stoneDark, PAL.stoneEdge, 6, 1 + Math.floor((1 - t) * 3));
      g.fillRect(x + inset, line - i, wide, 1);
    }
    // Moss caps most of them, which is what ties the rubble to the rest of the surface.
    if (rng() > 0.25) {
      const capH = Math.round(range(rng, 1, 4));
      g.fillStyle = ramp(PAL.mossDark, PAL.mossLit, 5, 2 + Math.floor(rng() * 3));
      g.fillRect(x + 1, line - lumpH - capH, Math.max(1, lumpW - 2), capH);
    }
    x += lumpW;
  }

  // Tufts of growth standing proud of the rubble, taller and thinner than the stone.
  for (let i = 0; i < Math.round(w / 14); i++) {
    const tx = Math.round(range(rng, 0, w));
    const th = Math.round(range(rng, 4, line * 0.95));
    g.fillStyle = ramp(PAL.mossDark, PAL.mossMid, 4, 1 + Math.floor(rng() * 2));
    g.fillRect(tx, line - th, 1, th);
    if (rng() > 0.55) {
      g.fillStyle = PAL.mossLit;
      g.fillRect(tx, line - th, 1, 2);
    }
    // A leaf hanging off some of them.
    if (rng() > 0.78) {
      g.fillStyle = PAL.leafMid;
      g.fillRect(tx + (rng() > 0.5 ? 1 : -2), line - th + 2, 2, 2);
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

  // A few motes caught in the near field, so the glow has something in it.
  for (let i = 0; i < 14; i++) {
    const a = range(rng, 0, Math.PI * 2);
    const d = range(rng, size * 0.12, size * 0.42);
    g.fillStyle = colour;
    g.fillRect(Math.round(cx + Math.cos(a) * d), Math.round(cx + Math.sin(a) * d), 2, 2);
  }

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
 * Drifting spores, on their own tiling layer.
 *
 * These used to be painted into the atmosphere texture beside the light shafts, which meant
 * they could never move: scrolling that texture would have dragged the shafts with them, and
 * light does not drift. Separated, the motes can be scrolled and the shafts stay put, which
 * is the only arrangement that is physically sensible and also the only one that looks right.
 *
 * The stage has been a still photograph for fifteen passes - nothing in it moves except the
 * portal's membrane - and a room with no air movement reads as a diorama however well it is
 * painted. This is the cheapest possible fix: one texture, tiled, offset a little every frame.
 *
 * Deliberately WRAPPING and seamless, since it is scrolled forever. Nothing is drawn within a
 * few pixels of an edge, so no mote is ever cut in half at the seam.
 */
export function sporeTexture(seed: string, size = 256, count = 90): THREE.CanvasTexture {
  const rng = createRng(seedFrom(seed));
  const { c, g } = surface(size, size);

  for (let i = 0; i < count; i++) {
    const x = Math.round(range(rng, 4, size - 8));
    const y = Math.round(range(rng, 4, size - 8));
    const roll = rng();
    if (roll > 0.93) {
      // The big ones carry a halo, so a few motes read as genuinely close to the camera.
      g.fillStyle = mixHex(PAL.voidDeep, PAL.bioCyan, 0.45);
      g.fillRect(x - 1, y - 1, 5, 5);
      g.fillStyle = PAL.bioCore;
      g.fillRect(x, y, 3, 3);
    } else if (roll > 0.66) {
      g.fillStyle = mixHex(PAL.bioCyan, PAL.bioCore, 0.5);
      g.fillRect(x, y, 2, 2);
    } else {
      g.fillStyle = roll > 0.4 ? PAL.mossLit : PAL.bioCyan;
      g.fillRect(x, y, 1, 1);
    }
  }

  return pixelTexture(c);
}

/**
 * The bush that stands in front of a growth.
 *
 * The growths were red torus rings - a programmer's marker for "grabbable here". The
 * reference answer is a plant: a clump of broad leaves and fronds with a bright core, drawn
 * once and placed in front of every anchor. The core stays readable as a target because it
 * is the brightest thing in the sprite and the leaves radiate away from it, which is exactly
 * how the reference sheet draws its interactables.
 *
 * Drawn on a transparent canvas so it can sit as a billboard over the level.
 */
export function bushTexture(seed: string, size = 160, dead = false): THREE.CanvasTexture {
  const rng = createRng(seedFrom(seed));
  const { c, g } = surface(size, size);
  const cx = size / 2;
  const cy = size * 0.58;

  /*
   * A dead growth is DRAWN dead, not tinted dead.
   *
   * The obvious implementation is to multiply the live sprite by red at runtime, and the
   * comment on the reach tinting in M4SSRig already says why that fails: a flat ring can be
   * switched green-to-red and stay legible, a painted sprite cannot - multiplying it turns a
   * plant into a stain. It also collides with the tint that means "out of reach", and those
   * two must never be confusable, because telling them apart IS the second clause of stage
   * two.
   *
   * So red is its own palette through the same generator - and its own SILHOUETTE, which is
   * the half that matters more. Hue alone would make stage two unplayable for anyone with
   * red-green colour blindness, which is one player in twelve, and the mechanic these plants
   * carry is the stage's whole second clause. So a dead growth also WILTS: the live plant
   * fans its leaves upward, the dead one's droop level and below, shorter and thinner, with
   * withered strands hanging off the clump. In greyscale - which is the honest test - the
   * two read as different plants at a glance, and the harness measures exactly that.
   *
   * The core stays in the same place at the same size, unlit: the target is visible, so the
   * route stays readable from the floor, which is why red growths exist rather than absent
   * ones. The bioluminescent spores are dropped entirely rather than recoloured - they are
   * the thing that says this plant is alive, and a dead one should not be shedding them.
   */
  const leafDark = dead ? '#5e2b22' : PAL.leafDark;
  const leafMid = dead ? '#8a3a29' : PAL.leafMid;
  const leafLit = dead ? '#b04f31' : PAL.leafLit;
  const capDark = dead ? '#6b2f28' : PAL.capDark;
  const capLit = dead ? '#9c4433' : PAL.capLit;

  // Roots and stems first, so everything else sits on them.
  g.strokeStyle = PAL.vineDark;
  for (let i = 0; i < 14; i++) {
    const a = range(rng, Math.PI * 0.1, Math.PI * 0.9);
    let x = cx;
    let y = cy + 20;
    const len = range(rng, 20, 46);
    g.fillStyle = i % 2 ? PAL.vineDark : PAL.vineMid;
    for (let s = 0; s < len; s++) {
      x += Math.cos(a) * 1.1;
      y += Math.sin(a) * 0.5;
      g.fillRect(Math.round(x), Math.round(y), 2, 2);
    }
  }

  // Broad leaves, radiating. Dark ones first and lit ones last so the clump has depth.
  const leaf = (a: number, len: number, wide: number, colour: string): void => {
    g.fillStyle = colour;
    for (let s = 0; s < len; s++) {
      const t = s / len;
      const half = Math.round(wide * Math.sin(t * Math.PI) * (1 - t * 0.25));
      const x = cx + Math.cos(a) * s;
      const y = cy + Math.sin(a) * s * 0.8;
      if (half <= 0) continue;
      g.fillRect(Math.round(x - half), Math.round(y), half * 2, 2);
    }
  };
  /*
   * Enough leaves to be a bush, at a size that fills the sprite.
   *
   * The first pass drew about twenty short fronds in the middle third of a 128px canvas and
   * the result was a dead spider: at the scale these sit in the level it read as a speck of
   * debris rather than as a plant. The reference clump is DENSE - forty-odd overlapping
   * leaves, the darkest at the back, the whole thing filling its footprint - so the counts
   * and the lengths both roughly doubled, and the arc widened past the horizontal so leaves
   * spill sideways instead of standing straight up.
   */
  // Dead leaves hang at and below the horizontal; live ones fan the full arc upward.
  const arc = (from: number, to: number): number =>
    dead
      ? // Two droops, one each side, none rising past ~20 degrees above level.
        (rng() > 0.5 ? range(rng, Math.PI * 0.82, Math.PI * 1.08) : range(rng, Math.PI * 1.92, Math.PI * 2.18))
      : range(rng, from, to);
  const sag = dead ? 0.72 : 1;
  for (let i = 0; i < 22; i++) {
    leaf(arc(Math.PI * 0.98, Math.PI * 2.02), range(rng, 34, 56) * sag, range(rng, 6, 13) * sag, leafDark);
  }
  for (let i = 0; i < 18; i++) {
    // Off a ramp rather than one flat mid-green, so the clump has internal depth.
    leaf(
      arc(Math.PI * 1.02, Math.PI * 1.98),
      range(rng, 26, 46) * sag,
      range(rng, 5, 11) * sag,
      ramp(leafDark, leafLit, 5, 1 + Math.floor(rng() * 3))
    );
  }
  for (let i = 0; i < 12; i++) {
    leaf(arc(Math.PI * 1.08, Math.PI * 1.92), range(rng, 18, 34) * sag, range(rng, 3, 8) * sag, leafLit);
  }

  /*
   * Caps, and there are five of them because two was decoration.
   *
   * The reference's plant clusters always carry a second colour - purple caps, a pale stem -
   * and it is doing two jobs at once: it breaks the green, and it gives the clump internal
   * contrast so it reads as a tangle of things rather than as one silhouette. At two, small
   * and dark, they were invisible against the leaves.
   */
  for (let i = 0; i < 5; i++) {
    const mx = cx + range(rng, -34, 34);
    const my = cy + range(rng, -10, 12);
    const r = range(rng, 5, 9);
    blob(g, rng, mx, my + 2, r * 0.35, leafDark, 0.5);
    blob(g, rng, mx, my, r, capDark, 1.7);
    blob(g, rng, mx, my - r * 0.35, r * 0.62, capLit, 1.9);
  }

  // Bioluminescent spores drifting off the clump. Cold against the warm green, and the thing
  // that says this plant is alive rather than painted on.
  for (let i = 0; i < (dead ? 0 : 9); i++) {
    const sx = cx + range(rng, -46, 46);
    const sy = cy + range(rng, -40, 16);
    g.fillStyle = PAL.bioCyan;
    g.fillRect(Math.round(sx), Math.round(sy), 2, 2);
    g.fillStyle = PAL.bioCore;
    g.fillRect(Math.round(sx), Math.round(sy), 1, 1);
  }

  if (dead) {
    /*
     * Withered strands, the silhouette's second tell: nothing on the live plant hangs.
     * Slightly wandering verticals off the underside of the clump, in the stem colour,
     * with a curled tip. Length is most of the sprite's lower half, so the droop reads
     * at level scale, not only in close-up.
     */
    for (let i = 0; i < 5; i++) {
      let x = cx + range(rng, -34, 34);
      const drop = range(rng, 26, 44);
      g.fillStyle = i % 2 ? PAL.vineDark : leafDark;
      for (let dy = 0; dy < drop; dy++) {
        g.fillRect(Math.round(x), Math.round(cy + 8 + dy), 2, 1);
        if (dy % 6 === 0) x += range(rng, -1.2, 1.2);
      }
      // The curl at the tip.
      g.fillRect(Math.round(x + 1), Math.round(cy + 8 + drop), 3, 2);
    }
  }

  /*
   * The core: what the player is actually aiming at.
   *
   * On a dead growth it is still THERE - same size, same place - and simply unlit. That is
   * the difference between "you cannot use this yet" and "there is nothing here": the target
   * is visible, so the route is readable from the floor of the room, which is the whole
   * reason red growths exist rather than absent ones.
   */
  if (dead) {
    blob(g, rng, cx, cy - 6, 16, '#4a2018');
    blob(g, rng, cx, cy - 6, 12, '#6d2f21');
    blob(g, rng, cx, cy - 7, 8, '#93412a');
    blob(g, rng, cx, cy - 8, 5, '#bd5c38');
  } else {
    blob(g, rng, cx, cy - 6, 16, PAL.mossDark);
    blob(g, rng, cx, cy - 6, 12, PAL.mossMid);
    blob(g, rng, cx, cy - 7, 8, PAL.slime);
    blob(g, rng, cx, cy - 8, 5, PAL.slimeGlow);
  }

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

  // The arch: two jambs and a head, in stone, with moss on the top edge.
  g.fillStyle = PAL.stoneMid;
  g.fillRect(cx - 44, 18, 12, size - 18);
  g.fillRect(cx + 32, 18, 12, size - 18);
  for (let dy = 0; dy < 34; dy++) {
    const half = Math.round(Math.sqrt(Math.max(0, 44 * 44 - dy * dy)) * 0.95);
    g.fillRect(cx - half, 18 + 34 - dy, half * 2 - Math.max(0, (half - 12) * 2), 2);
  }
  g.fillStyle = PAL.stoneEdge;
  g.fillRect(cx - 44, 18, 12, 2);
  g.fillRect(cx + 32, 18, 12, 2);

  mossRun(g, rng, cx - 46, cx + 46, 16, 12);
  for (let i = 0; i < 5; i++) {
    const vx = cx + range(rng, -46, 46);
    g.fillStyle = PAL.mossDark;
    g.fillRect(Math.round(vx), 20, 1, Math.round(range(rng, 8, 30)));
  }

  return pixelTexture(c);
}

/**
 * A stencilled wall marking, for teaching controls without a tutorial.
 *
 * The judge's first forty seconds with M4SS were going to be spent clicking and finding
 * nothing, because the controls - A/D, hold LMB, hold Space, Q - were stated nowhere in
 * the game. The obvious fix is a HUD overlay, and it is wrong here: this stage has spent
 * twenty-three polish passes becoming a place, and a floating "PRESS SPACE" would cost
 * more atmosphere than it teaches.
 *
 * So the controls are painted ON THE FACILITY, at the point of need, in Pelagic OS's own
 * 3x5 face - the same letterforms as Keller's desktop, because the sim and the desktop
 * are the same operating system. Faded and weathered: a seeded fraction of pixels are
 * dropped and the rest sit at stencil-paint opacity, so they read as markings a
 * technician left years ago, not as UI. The fiction even supports the content - somebody
 * had to run this containment rig before you.
 */
export function signTexture(seed: string, lines: string[], scale = 4): THREE.CanvasTexture {
  const rng = createRng(seedFrom(seed));
  const glyphW = 4 * scale; // 3px face + 1px gap
  const glyphH = 6 * scale;
  const widest = Math.max(...lines.map((line) => line.length));
  const { c, g } = surface(widest * glyphW + scale * 2, lines.length * glyphH + scale * 2);

  /*
   * Stencil paint: a pale moss-grey, brighter than the stone it sits on and dimmer than
   * anything alive. Authored bright like the rest of the palette - the ACES pass at
   * exposure 0.5 takes it back down to "old paint" on screen.
   */
  const INK = '#b8ceb4';
  lines.forEach((line, row) => {
    let x = scale;
    const top = scale + row * glyphH;
    for (const ch of line) {
      const rows = PIXEL_FONT[ch] ?? PIXEL_FONT[ch.toUpperCase()];
      if (rows) {
        rows.forEach((bits, ry) => {
          for (let bx = 0; bx < bits.length; bx++) {
            if (bits[bx] !== '1') continue;
            /*
             * Weathering by FADE, never by dropout. Dropping pixels was tried at two
             * rates and both broke letterforms - on a 3x5 face one pixel is a fifteenth
             * of the glyph, and HOLD read as KOLD at either setting, because the seed is
             * fixed and the same load-bearing pixel flaked every time. Uneven opacity
             * gives the same "old paint" read and cannot change what a letter IS.
             */
            g.globalAlpha = 0.55 + rng() * 0.45;
            g.fillStyle = INK;
            g.fillRect(x + bx * scale, top + ry * scale, scale, scale);
          }
        });
      }
      x += glyphW;
    }
  });

  g.globalAlpha = 1;
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
