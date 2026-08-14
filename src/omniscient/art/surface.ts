/**
 * Procedural surface maps.
 *
 * The dioramas have been untextured until now - a flat colour and a roughness number per
 * material - and that was the right place to start, because §187 asks for value structure
 * before detail and detail added early hides a broken value structure rather than fixing
 * it. This is the next step, and it is deliberately narrow.
 *
 * ## The contrast budget
 *
 * The single way a texture pass ruins a painterly scene is by adding value contrast. A
 * surface that swings from 0.2 to 0.9 in albedo stops belonging to its value group, and
 * the careful separation between floor, walls, props and hero prop that the palette exists
 * to protect collapses into noise. So every generator here works inside a stated budget:
 * albedo varies by no more than ±`contrast` around its base colour, and everything else -
 * the detail the eye actually reads as *surface* - is carried by roughness and normal,
 * which cost no value contrast at all.
 *
 * That is the whole discipline. Grain and wear in roughness and normal; hue and value left
 * where the palette put them.
 *
 * ## UV assumption
 *
 * These are built for box geometry, whose faces each map to the full 0..1 UV square. That
 * means the UV border *is* the physical edge of the object, so edge wear can be a function
 * of distance-to-border - which is why the corners of the housing chip and the middle of
 * the panel does not.
 */

import * as THREE from 'three';

import { cellDistance, cellEdges, clamp01, fbm, mix, smoothstep } from './noise.js';
import { seedFrom } from '../core/rng.js';

/**
 * The map set a MeshStandardMaterial wants.
 *
 * Roughness and metalness share one image: three.js reads roughness from the green channel
 * and metalness from the blue, so the two ship as one upload instead of two.
 */
export interface SurfaceMaps {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
  metalnessMap: THREE.Texture;
}

export interface PaintedMetalOptions {
  /** Base coat. Should be the colour the material already had - texture is not a repaint. */
  color: string;
  /** Bare metal beneath, revealed by wear. */
  worn?: string;
  /** Corrosion or discolouration settling in the lower half. */
  grime?: string;
  seed?: string;
  size?: number;
  /** Maximum albedo swing either side of `color`, as a fraction. Keep this small. */
  contrast?: number;
  /** How far in from each edge the paint has been rubbed off, in UV. */
  wear?: number;
  /** Wrinkle-enamel cell count across a face. Higher = finer crackle. */
  crackle?: number;
  /** Normal map strength. */
  relief?: number;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function parseHex(hex: string): Rgb {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return { r: mix(a.r, b.r, t), g: mix(a.g, b.g, t), b: mix(a.b, b.b, t) };
}

/**
 * Are we in a browser?
 *
 * The preview harnesses import mission and scene modules in Node to walk them without a
 * renderer. They must not fall over because a material wanted a 2D canvas.
 */
const CAN_PAINT = typeof document !== 'undefined';

function canvasOf(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function textureOf(canvas: HTMLCanvasElement, srgb: boolean): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/** Generated map sets are shared, not rebuilt per mesh (§187). */
const CACHE = new Map<string, SurfaceMaps | null>();

/**
 * Crackle-finish painted metal, worn at the edges.
 *
 * The look this is after is a piece of field equipment that has been carried by its handle
 * for thirty years: wrinkle enamel over pressed steel, paint polished off every corner and
 * arris, and a tidemark of grime in the lower half where hands and damp have got to it.
 */
export function paintedMetal(options: PaintedMetalOptions): SurfaceMaps | null {
  const {
    color,
    worn = '#b9b2a4',
    grime = '#3c3a30',
    seed = color,
    size = 512,
    contrast = 0.1,
    wear = 0.05,
    crackle = 56,
    relief = 0.3,
  } = options;

  const key = JSON.stringify([color, worn, grime, seed, size, contrast, wear, crackle, relief]);
  const cached = CACHE.get(key);
  if (cached !== undefined) return cached;
  if (!CAN_PAINT) {
    CACHE.set(key, null);
    return null;
  }

  const base = parseHex(color);
  const metal = parseHex(worn);
  const dirt = parseHex(grime);
  const noiseSeed = seedFrom(seed);

  const albedoCanvas = canvasOf(size);
  const ormCanvas = canvasOf(size);
  const normalCanvas = canvasOf(size);

  const albedoCtx = albedoCanvas.getContext('2d');
  const ormCtx = ormCanvas.getContext('2d');
  const normalCtx = normalCanvas.getContext('2d');
  if (!albedoCtx || !ormCtx || !normalCtx) {
    CACHE.set(key, null);
    return null;
  }

  const albedo = albedoCtx.createImageData(size, size);
  const orm = ormCtx.createImageData(size, size);
  const height = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const i = y * size + x;

      // -- Fields ----------------------------------------------------------
      // Wrinkle cells. `cellEdges` is ~0 on a boundary, so this is a sunken web.
      const cell = smoothstep(0.0, 0.085, cellEdges(noiseSeed, u, v, crackle));
      const grain = fbm(noiseSeed + 11, u, v, { frequency: 48, octaves: 3 });
      const drift = fbm(noiseSeed + 23, u, v, { frequency: 6, octaves: 3 });
      const ragged = fbm(noiseSeed + 37, u, v, { frequency: 20, octaves: 2 });

      // -- Wear ------------------------------------------------------------
      // Distance to the nearest UV border is distance to a physical edge, because each
      // box face owns the whole 0..1 square. A ragged threshold keeps the worn band from
      // reading as a drawn frame.
      const edge = Math.min(u, 1 - u, v, 1 - v);
      const band = wear * (0.35 + ragged * 1.5);
      const rubbed = 1 - smoothstep(band * 0.45, band, edge);

      // Chips away from the edges, gated by the large-scale drift so they cluster
      // instead of peppering the panel evenly.
      const chip =
        smoothstep(0.74, 0.88, grain) * smoothstep(0.46, 0.78, drift) * (1 - rubbed);

      const bare = clamp01(rubbed * 0.9 + chip);

      // -- Grime -----------------------------------------------------------
      // v = 0 is the bottom of a box side. Dirt runs down and collects.
      const settle = smoothstep(0.55, 0.02, v) * (0.3 + drift * 0.85);
      const dirtiness = clamp01(settle * 0.75) * (1 - bare * 0.6);

      // -- Albedo, inside the contrast budget -------------------------------
      // Everything except bare metal stays within ±contrast of the base colour. Bare
      // metal is allowed to leave the group: it is a different substance, and that
      // discontinuity is exactly what makes wear read as wear rather than as a stain.
      const shade = 1 + (cell - 0.5) * contrast * 0.55 + (grain - 0.5) * contrast * 0.5;
      let rgb: Rgb = { r: base.r * shade, g: base.g * shade, b: base.b * shade };
      rgb = mixRgb(rgb, dirt, dirtiness * 0.55);
      rgb = mixRgb(rgb, metal, bare);

      const p = i * 4;
      albedo.data[p] = clamp01(rgb.r / 255) * 255;
      albedo.data[p + 1] = clamp01(rgb.g / 255) * 255;
      albedo.data[p + 2] = clamp01(rgb.b / 255) * 255;
      albedo.data[p + 3] = 255;

      // -- Roughness (G) and metalness (B) ----------------------------------
      // This is where the detail budget is actually spent. Wrinkle troughs hold light
      // differently from the cell faces, grime is dead flat, and rubbed metal has been
      // polished by decades of handling.
      let rough = 0.66 - cell * 0.1 + (grain - 0.5) * 0.14;
      rough = mix(rough, 0.88, dirtiness);
      rough = mix(rough, 0.32, bare);
      const metalness = mix(0.06, 0.82, bare);

      orm.data[p] = 255;
      orm.data[p + 1] = clamp01(rough) * 255;
      orm.data[p + 2] = clamp01(metalness) * 255;
      orm.data[p + 3] = 255;

      // -- Height ------------------------------------------------------------
      // Cells stand proud, their borders sink, chips are pits.
      height[i] = cell * 0.3 + grain * 0.12 - chip * 0.7 - rubbed * 0.12;
    }
  }

  albedoCtx.putImageData(albedo, 0, 0);
  ormCtx.putImageData(orm, 0, 0);

  // -- Normals from height, by Sobel ---------------------------------------
  // Sampling wraps, so the normal map tiles with everything else.
  const normal = normalCtx.createImageData(size, size);
  const at = (x: number, y: number): number =>
    height[((y + size) % size) * size + ((x + size) % size)];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx =
        at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) -
        (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const dy =
        at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) -
        (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));

      // Green-up (OpenGL) convention, which is what three.js expects.
      const nx = -dx * relief;
      const ny = -dy * relief;
      const len = Math.hypot(nx, ny, 1);

      const p = (y * size + x) * 4;
      normal.data[p] = (nx / len * 0.5 + 0.5) * 255;
      normal.data[p + 1] = (ny / len * 0.5 + 0.5) * 255;
      normal.data[p + 2] = (1 / len * 0.5 + 0.5) * 255;
      normal.data[p + 3] = 255;
    }
  }
  normalCtx.putImageData(normal, 0, 0);

  const maps: SurfaceMaps = {
    map: textureOf(albedoCanvas, true),
    normalMap: textureOf(normalCanvas, false),
    roughnessMap: textureOf(ormCanvas, false),
    metalnessMap: textureOf(ormCanvas, false),
  };
  CACHE.set(key, maps);
  return maps;
}

/**
 * One pixel of a generated surface.
 *
 * `shade` is a multiplier on the base colour and is the only thing that costs value
 * contrast (§232), so generators keep it near 1. Everything else is free detail.
 */
export interface SurfaceSample {
  /** Multiplier on the base colour. 1 is the base. */
  shade: number;
  /** 0 smooth, 1 completely diffuse. */
  rough: number;
  /** Height for the normal pass. Relative units; only gradients matter. */
  height: number;
  /** Optional tint to blend toward, and how much. */
  tint?: { color: Rgb; amount: number };
}

/**
 * Build a map set from a per-pixel sampler.
 *
 * Extracted so timber, plaster and anything after them do not each re-implement the
 * packing, the Sobel and the tiling wrap. `paintedMetal` predates this and is left alone -
 * it earns its own loop by also carrying metalness and edge-distance wear.
 */
function buildMaps(
  size: number,
  base: Rgb,
  relief: number,
  sample: (u: number, v: number) => SurfaceSample
): SurfaceMaps | null {
  if (!CAN_PAINT) return null;

  const albedoCanvas = canvasOf(size);
  const ormCanvas = canvasOf(size);
  const normalCanvas = canvasOf(size);
  const albedoCtx = albedoCanvas.getContext('2d');
  const ormCtx = ormCanvas.getContext('2d');
  const normalCtx = normalCanvas.getContext('2d');
  if (!albedoCtx || !ormCtx || !normalCtx) return null;

  const albedo = albedoCtx.createImageData(size, size);
  const orm = ormCtx.createImageData(size, size);
  const height = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const i = y * size + x;
      const s = sample(u, v);

      let rgb: Rgb = { r: base.r * s.shade, g: base.g * s.shade, b: base.b * s.shade };
      if (s.tint) rgb = mixRgb(rgb, s.tint.color, s.tint.amount);

      const p = i * 4;
      albedo.data[p] = clamp01(rgb.r / 255) * 255;
      albedo.data[p + 1] = clamp01(rgb.g / 255) * 255;
      albedo.data[p + 2] = clamp01(rgb.b / 255) * 255;
      albedo.data[p + 3] = 255;

      orm.data[p] = 255;
      orm.data[p + 1] = clamp01(s.rough) * 255;
      orm.data[p + 2] = 0;
      orm.data[p + 3] = 255;

      height[i] = s.height;
    }
  }

  albedoCtx.putImageData(albedo, 0, 0);
  ormCtx.putImageData(orm, 0, 0);

  const normal = normalCtx.createImageData(size, size);
  const at = (x: number, y: number): number =>
    height[((y + size) % size) * size + ((x + size) % size)];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx =
        at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) -
        (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const dy =
        at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) -
        (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));

      const nx = -dx * relief;
      const ny = -dy * relief;
      const len = Math.hypot(nx, ny, 1);

      const p = (y * size + x) * 4;
      normal.data[p] = (nx / len * 0.5 + 0.5) * 255;
      normal.data[p + 1] = (ny / len * 0.5 + 0.5) * 255;
      normal.data[p + 2] = (1 / len * 0.5 + 0.5) * 255;
      normal.data[p + 3] = 255;
    }
  }
  normalCtx.putImageData(normal, 0, 0);

  return {
    map: textureOf(albedoCanvas, true),
    normalMap: textureOf(normalCanvas, false),
    roughnessMap: textureOf(ormCanvas, false),
    metalnessMap: textureOf(ormCanvas, false),
  };
}

export interface NaturalOptions {
  color: string;
  seed?: string;
  size?: number;
  /** Maximum albedo swing either side of `color`, as a fraction (§232). */
  contrast?: number;
  relief?: number;
  /**
   * How many times the tile repeats across one 0..1 UV square.
   *
   * §239 asks every generator to declare its scale, and this is where that is declared.
   * Box UVs give every face the whole square whatever its size, so a wall and a mug
   * receive identical texture coordinates - the repeat is the only thing standing between
   * plank-sized grain on a coffee cup and thread-sized grain on a wall.
   */
  repeat?: [number, number];
}

function applyRepeat(maps: SurfaceMaps | null, repeat: [number, number]): SurfaceMaps | null {
  if (!maps) return null;
  for (const texture of [maps.map, maps.normalMap, maps.roughnessMap]) {
    texture.repeat.set(repeat[0], repeat[1]);
    texture.needsUpdate = true;
  }
  return maps;
}

/**
 * Sawn timber.
 *
 * Grain is fbm stretched hard along one axis - about twenty to one - which is the whole
 * trick: the same noise that reads as cloud at 1:1 reads as wood the moment it is pulled
 * out sideways. Knots are sparse Worley centres, and they are what stop a plank looking
 * like a smear.
 */
export function timberMaps(options: NaturalOptions): SurfaceMaps | null {
  const {
    color,
    seed = color,
    size = 256,
    contrast = 0.13,
    relief = 0.22,
    repeat = [2, 1],
  } = options;

  const key = `timber:${JSON.stringify([color, seed, size, contrast, relief, repeat])}`;
  const cached = CACHE.get(key);
  if (cached !== undefined) return cached;

  const noiseSeed = seedFrom(seed);
  const dark = parseHex('#2a1d12');

  const maps = applyRepeat(
    buildMaps(size, parseHex(color), relief, (u, v) => {
      // Stretched along u: the grain runs the length of the board.
      const grain = fbm(noiseSeed, u * 0.06, v * 3.2, { frequency: 8, octaves: 4 });
      // Fine fibre on top, so the boundaries between grain bands are not smooth curves.
      const fibre = fbm(noiseSeed + 31, u * 0.3, v * 9, { frequency: 16, octaves: 2 });
      /**
       * Knots, sparse and dark - and a blob, not a line.
       *
       * This asked `cellEdges` for years' worth of captures, which is F2 - F1 and is near
       * zero along cell BOUNDARIES. So the dark mark landed on the web between the cells
       * instead of at their centres, and every timber surface in the game wore a network
       * of thin dark lines. It read as cracks in dried mud, and it was diagnosed as a
       * floor problem and a bench problem before it was diagnosed as this.
       *
       * `cellDistance` is F1, which is zero AT the centre. A knot is now a round dark
       * mark of a stated size - 0.22 cell widths at three cells across the tile, so about
       * seven per cent of a tile - and the grain BENDS round it, which is what a knot
       * actually does to a board and is most of what makes one read as a knot rather than
       * as a stain.
       */
      const knotCore = 1 - smoothstep(0.0, 0.22, cellDistance(noiseSeed + 7, u, v, 3));
      const knotMask =
        knotCore *
        smoothstep(0.5, 0.78, fbm(noiseSeed + 13, u, v, { frequency: 2, octaves: 2 }));

      // Rings: the banding that makes it read as cut through growth rather than painted.
      // Fewer, wider rings, and the fibre pushed hard into the phase rather than added
      // on top. Evenly spaced bands read as corduroy; wood is irregular, and the
      // irregularity has to be inside the ring spacing, not sprinkled over it.
      const rings = Math.abs(Math.sin((grain * 2.6 + fibre * 0.9 + knotMask * 1.7) * Math.PI));

      const band = rings * 0.7 + fibre * 0.3;
      return {
        shade: 1 + (band - 0.5) * contrast * 2,
        // Dense late-growth bands take polish differently from the soft wood between.
        rough: 0.82 - band * 0.16 + knotMask * 0.1,
        height: band * 0.2 - knotMask * 0.45,
        tint: { color: dark, amount: knotMask * 0.55 },
      };
    }),
    repeat
  );

  CACHE.set(key, maps);
  return maps;
}

/**
 * Plaster, or any painted masonry wall.
 *
 * Two scales of mottle and nothing else. A wall is the largest surface in most of these
 * frames and therefore the one where §232 bites hardest: anything with structure at this
 * size becomes a pattern, and a patterned wall pulls the eye off whatever is standing in
 * front of it. This is deliberately almost nothing - it exists to stop a flat fill
 * reading as a flat fill, and it is finished the moment it does.
 */
export function plasterMaps(options: NaturalOptions): SurfaceMaps | null {
  const {
    color,
    seed = color,
    size = 256,
    contrast = 0.075,
    relief = 0.28,
    repeat = [2, 2],
  } = options;

  const key = `plaster:${JSON.stringify([color, seed, size, contrast, relief, repeat])}`;
  const cached = CACHE.get(key);
  if (cached !== undefined) return cached;

  const noiseSeed = seedFrom(seed);

  const maps = applyRepeat(
    buildMaps(size, parseHex(color), relief, (u, v) => {
      const broad = fbm(noiseSeed, u, v, { frequency: 3, octaves: 3 });
      const fine = fbm(noiseSeed + 17, u, v, { frequency: 24, octaves: 3 });
      // A faint trowel direction, so the mottle has a hand in it rather than being noise.
      const sweep = fbm(noiseSeed + 41, u * 0.35, v * 2.4, { frequency: 6, octaves: 2 });

      const value = broad * 0.55 + sweep * 0.3 + fine * 0.15;
      return {
        shade: 1 + (value - 0.5) * contrast * 2,
        rough: 0.9 + (fine - 0.5) * 0.08,
        height: fine * 0.22 + sweep * 0.3,
      };
    }),
    repeat
  );

  CACHE.set(key, maps);
  return maps;
}

/**
 * Perforated hardboard - pegboard.
 *
 * §230's note on the repair-shop reference is "the pegboard wall as dense mid-value texture
 * behind a light-value hero prop", and that phrase is a specification: the board's job is
 * to be BUSY and to stay in one value band, so that the Kestrel-3 in front of it separates
 * on value without the wall having to be dark.
 *
 * Which makes this the strictest §232 case in the file. A hole is a hard dark disc, and a
 * grid of hard dark discs is pure value contrast at the exact frequency the eye is most
 * sensitive to. Two things keep it inside the budget: the holes are drawn mostly into the
 * NORMAL and roughness - a real pegboard hole is a shadow, and there are no shadows here,
 * so a shallow albedo dip plus a deep normal dimple is the honest substitute - and the dip
 * itself is capped at `contrast`. At gameplay distance the grid resolves to about four
 * pixels a hole and reads as tooth rather than as dots, which is the intent.
 */
export function pegboardMaps(
  options: NaturalOptions & { /** Holes across one tile. */ pitch?: number }
): SurfaceMaps | null {
  const {
    color,
    seed = color,
    size = 256,
    contrast = 0.16,
    relief = 0.5,
    repeat = [6, 3],
    pitch = 16,
  } = options;

  const key = `pegboard:${JSON.stringify([color, seed, size, contrast, relief, repeat, pitch])}`;
  const cached = CACHE.get(key);
  if (cached !== undefined) return cached;

  const noiseSeed = seedFrom(seed);

  const maps = applyRepeat(
    buildMaps(size, parseHex(color), relief, (u, v) => {
      // Distance to the nearest hole centre, in hole widths. The grid is regular because
      // pegboard is a manufactured product - this is the one surface in the game where
      // mathematical perfection is correct.
      const gx = u * pitch;
      const gy = v * pitch;
      const dx = gx - Math.floor(gx) - 0.5;
      const dy = gy - Math.floor(gy) - 0.5;
      const hole = 1 - smoothstep(0.15, 0.26, Math.hypot(dx, dy));

      // Hardboard itself: fine, dense, directionless.
      const fibre = fbm(noiseSeed, u, v, { frequency: 42, octaves: 3 });
      const stain = fbm(noiseSeed + 19, u, v, { frequency: 4, octaves: 3 });

      return {
        shade: 1 - hole * contrast * 2.4 + (fibre - 0.5) * 0.05 + (stain - 0.5) * contrast * 0.5,
        // Board is smooth from handling, the holes' inner edges are not.
        rough: 0.74 + hole * 0.16 + (fibre - 0.5) * 0.1,
        // Where the budget is actually spent. The hole is a pit, and a deep one.
        height: -hole * 1.0 + fibre * 0.05,
      };
    }),
    repeat
  );

  CACHE.set(key, maps);
  return maps;
}

/**
 * A MeshStandardMaterial wearing a generated map set.
 *
 * Falls back to the flat material it was given when there is no canvas to paint on, so
 * headless callers get something valid rather than an exception.
 */
export function texturedFrom(
  fallback: THREE.MeshStandardMaterial,
  options: PaintedMetalOptions
): THREE.MeshStandardMaterial {
  const maps = paintedMetal(options);
  if (!maps) return fallback;

  const material = fallback.clone();
  material.map = maps.map;
  material.normalMap = maps.normalMap;
  material.roughnessMap = maps.roughnessMap;
  material.metalnessMap = maps.metalnessMap;
  // The maps carry the variation now; the scalars become multipliers and must be 1 or
  // they scale the whole map down. Colour stays white for the same reason - it tints
  // `map`, and the base coat is already in there.
  material.color = new THREE.Color('#ffffff');
  material.roughness = 1;
  material.metalness = 1;
  material.normalScale = new THREE.Vector2(1, 1);
  material.needsUpdate = true;
  return material;
}

/**
 * A transparent overlay drawn by hand: stencilled labels, corrosion blooms, tidemarks.
 *
 * Anything that belongs to ONE face of an object has to be a decal, because box UVs are
 * shared by all six faces - paint a serial number into the map and the housing wears six
 * of them. A decal is also how it works in life: the plate was applied after the paint.
 */
export function createDecal(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
): THREE.CanvasTexture | null {
  if (!CAN_PAINT) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  /**
   * Flip the drawing vertically before handing the context over.
   *
   * The engine uploads textures with flipY disabled, so canvas row 0 - the top - lands at
   * v = 0, which is the bottom of the quad. A plate drawn the natural way came out upside
   * down on the housing; correcting it once here means every caller gets to draw in
   * ordinary canvas coordinates with the origin at the top left.
   *
   * Worth stating plainly because it cost a cycle to get right: the first attempt read
   * the upside-down text as mirrored as well and applied a half turn, which fixed the
   * vertical and introduced a horizontal mirror that was never there. Flipped text is
   * easy to misread as mirrored text.
   */
  ctx.translate(0, height);
  ctx.scale(1, -1);

  draw(ctx, width, height);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/** Material for a decal quad: unlit-ish, alpha-blended, and never z-fighting its host. */
export function decalMaterial(
  texture: THREE.CanvasTexture,
  roughness = 0.7
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: texture,
    transparent: true,
    roughness,
    metalness: 0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}
