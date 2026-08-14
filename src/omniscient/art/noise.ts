/**
 * Deterministic 2D noise for surface generation.
 *
 * Separate from `core/rng` on purpose. An Rng is a *sequence* - ask for the next value and
 * the state moves on - which is exactly wrong for texturing, where the same pixel must
 * return the same value no matter what order the image is walked in. These are pure
 * functions of (seed, x, y), so a texture can be generated in any order, at any
 * resolution, and come out identical (§123).
 *
 * Every field here is tileable: the lattice wraps at the frequency, so a texture built
 * from these can repeat across a wall without a visible seam.
 */

/** Integer hash to [0, 1). The lattice value at a grid corner. */
function hash2(seed: number, x: number, y: number): number {
  let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Positive modulo, so the lattice wraps cleanly at negative coordinates. */
function wrap(value: number, period: number): number {
  return ((value % period) + period) % period;
}

/** Hermite fade. Smoother than linear, cheaper than a quintic and good enough here. */
function fade(t: number): number {
  return t * t * (3 - 2 * t);
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Value noise on a wrapping lattice.
 *
 * `period` is the lattice size in cells; pass the same number the coordinates were scaled
 * by and the field tiles over [0, 1].
 */
export function valueNoise(seed: number, x: number, y: number, period: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = fade(x - xi);
  const v = fade(y - yi);

  const x0 = wrap(xi, period);
  const x1 = wrap(xi + 1, period);
  const y0 = wrap(yi, period);
  const y1 = wrap(yi + 1, period);

  const top = mix(hash2(seed, x0, y0), hash2(seed, x1, y0), u);
  const bottom = mix(hash2(seed, x0, y1), hash2(seed, x1, y1), u);
  return mix(top, bottom, v);
}

export interface FbmOptions {
  /** Lattice cells across the unit square at the first octave. Keep integral to tile. */
  frequency?: number;
  octaves?: number;
  /** Amplitude falloff per octave. 0.5 is the usual pink-ish spectrum. */
  gain?: number;
}

/**
 * Fractal sum of value noise, normalised to [0, 1].
 *
 * Lacunarity is fixed at 2 so every octave lands on an integer frequency and the whole
 * stack stays tileable - the one thing that most often gets lost when fbm is made
 * configurable, and the reason repeating textures show grid seams.
 */
export function fbm(seed: number, x: number, y: number, options: FbmOptions = {}): number {
  const { frequency = 8, octaves = 4, gain = 0.5 } = options;

  let sum = 0;
  let norm = 0;
  let amplitude = 1;
  let freq = frequency;

  for (let o = 0; o < octaves; o++) {
    sum += amplitude * valueNoise(seed + o * 1013904223, x * freq, y * freq, freq);
    norm += amplitude;
    amplitude *= gain;
    freq *= 2;
  }

  return sum / norm;
}

/**
 * Worley F2-F1: near zero along the boundaries between cells, rising toward their centres.
 *
 * This is the crackle. Wrinkle-finish enamel - the paint on every field radio, meter box
 * and instrument case built before about 1985 - dries into exactly this pattern of
 * irregular cells with sunken borders, and no amount of fbm will produce it because fbm
 * has no edges. It is worth the nine-cell neighbourhood.
 */
/**
 * Worley F1: distance to the nearest feature point, in cell widths.
 *
 * Near zero AT a cell's centre, rising toward its boundaries - the exact opposite shape to
 * `cellEdges`, and the one you want for anything that is a scattered BLOB rather than a
 * network. Knots in timber are blobs.
 *
 * Worth spelling out because the confusion between these two cost the whole project a
 * visible artefact for two commits: `timberMaps` asked `cellEdges` for its knots, which
 * put the dark mark along every cell boundary instead of at every cell centre, so every
 * timber surface in the game - the desk, the workbench, Ileana's table and floor, the
 * chairs - wore a network of thin dark lines that read as cracks in dried mud. It was
 * visible in every capture and looked like a floor problem, a table problem and a bench
 * problem before it turned out to be one character in one call.
 */
export function cellDistance(seed: number, x: number, y: number, frequency: number): number {
  const px = x * frequency;
  const py = y * frequency;
  const xi = Math.floor(px);
  const yi = Math.floor(py);

  let nearest = Infinity;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = xi + dx;
      const cy = yi + dy;
      const wx = wrap(cx, frequency);
      const wy = wrap(cy, frequency);
      const fx = cx + hash2(seed, wx, wy);
      const fy = cy + hash2(seed + 7919, wx, wy);
      nearest = Math.min(nearest, Math.hypot(fx - px, fy - py));
    }
  }
  return nearest;
}

export function cellEdges(seed: number, x: number, y: number, frequency: number): number {
  const px = x * frequency;
  const py = y * frequency;
  const xi = Math.floor(px);
  const yi = Math.floor(py);

  let nearest = Infinity;
  let second = Infinity;

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = xi + dx;
      const cy = yi + dy;
      // Feature points are placed from the WRAPPED cell id, so the far edge of the
      // texture sees the same points as the near edge and the pattern tiles.
      const wx = wrap(cx, frequency);
      const wy = wrap(cy, frequency);
      const fx = cx + hash2(seed, wx, wy);
      const fy = cy + hash2(seed + 7919, wx, wy);
      const d = Math.hypot(fx - px, fy - py);

      if (d < nearest) {
        second = nearest;
        nearest = d;
      } else if (d < second) {
        second = d;
      }
    }
  }

  return second - nearest;
}
