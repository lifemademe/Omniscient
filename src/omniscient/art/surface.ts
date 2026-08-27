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
import { applyPaintBanding } from './painterly.js';
import { seedFrom } from '../core/rng.js';

/**
 * The map set a MeshStandardMaterial wants.
 *
 * Roughness and metalness share one image: three.js reads roughness from the green channel
 * and metalness from the blue, so the two ship as one upload instead of two.
 */
export interface SurfaceMaps {
  map: THREE.Texture;
  /**
   * Null on a flat generator, and that is the point rather than an omission.
   *
   * A flat surface is not "a textured surface with a weak normal map" - it is a surface
   * with no normal map at all, so the material's own roughness scalar and the light
   * banding do all the work.
   */
  normalMap: THREE.Texture | null;
  roughnessMap: THREE.Texture | null;
  metalnessMap: THREE.Texture | null;
}

export interface PaintedMetalOptions {
  /** Base coat. Should be the colour the material already had - texture is not a repaint. */
  color: string;
  /** Optional material multiplier for seating one lit prop in a scene's value hierarchy. */
  tint?: string;
  /** Bare metal beneath, revealed by wear. */
  worn?: string;
  /** Corrosion or discolouration settling in the lower half. */
  grime?: string;
  seed?: string;
  size?: number;
  /** How far in from each edge the paint has been rubbed off, in UV. */
  wear?: number;
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
 * Flat paint, worn at the edges.
 *
 * This used to generate crackle enamel: a wrinkle-finish cell pattern over the whole
 * body, fine grain in the albedo, and a normal map to give it micro-relief. It was
 * convincing and it was wrong, and the reason is worth writing down because §239 did not
 * make the distinction and cost the project a pass.
 *
 * There are two different things called texture. MATERIAL texture - grain, mottle,
 * crackle - says "this is made of a substance", and it is a realism cue. PAINTERLY
 * texture - visible strokes following form - says "this image was painted", and it is a
 * stylisation cue. The reference frames use the second. This generator was producing the
 * first, which pulls against the style rather than toward it.
 *
 * §232 then made it worse rather than better: the contrast budget correctly held the
 * amplitude low, which left the result too subtle to read as a deliberate surface and too
 * present to read as clean flat colour. It was paying generation cost, memory and visual
 * noise to land in the middle of the two things it could have been.
 *
 * ## What survives, and the rule that decides it
 *
 * Texture earns its place by being EVIDENCE, not by being material. The green body is a
 * surface and is now one flat colour. The bare metal along the arris is an event -
 * something happened there, thirty years of a hand on a carrying handle - so it stays.
 * The grime in the lower half stays as a soft tonal shift because it says the thing has
 * sat somewhere damp. The crackle said nothing except "this is enamel".
 *
 * So wear is authored as a SHAPE rather than a material: a defined band with a ragged but
 * clean boundary, which you can point at and call rubbed. What it must never be is
 * speckled and granular, because that is a photograph of metal again by another route.
 *
 * No normal map. That is the single most important deletion here - micro-relief under six
 * lights is what makes a surface read as physically present more than albedo ever does,
 * and removing it is most of the distance to a flat style on its own. It also lets the
 * §230 light banding read at full strength, because there is no longer any grain
 * competing with the band edges to soften them.
 */
export function paintedMetal(options: PaintedMetalOptions): SurfaceMaps | null {
  const {
    color,
    worn = '#b9b2a4',
    grime = '#3c3a30',
    seed = color,
    size = 256,
    wear = 0.05,
  } = options;

  const key = `flatpaint:${JSON.stringify([color, worn, grime, seed, size, wear])}`;
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
  const albedoCtx = albedoCanvas.getContext('2d');
  if (!albedoCtx) {
    CACHE.set(key, null);
    return null;
  }

  const albedo = albedoCtx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;

      /**
       * Distance to the nearest UV border is distance to a physical edge, because each
       * box face owns the whole 0..1 square. The threshold wanders so the worn band is
       * not a drawn frame - but it wanders SMOOTHLY, at low frequency. High-frequency
       * raggedness is what turns a rubbed edge back into speckle.
       */
      const edge = Math.min(u, 1 - u, v, 1 - v);
      const wander = fbm(noiseSeed + 37, u, v, { frequency: 4, octaves: 2 });
      const band = wear * (0.4 + wander * 1.4);
      // Hard-ish inner boundary: this is a shape with an edge, not a gradient.
      const bare = 1 - smoothstep(band * 0.72, band, edge);

      // Grime as one soft tonal shift toward the bottom of a face. No speckle.
      const settle = smoothstep(0.5, 0.02, v);
      const dirtiness = clamp01(settle * 0.5) * (1 - bare);

      let rgb: Rgb = { ...base };
      rgb = mixRgb(rgb, dirt, dirtiness * 0.45);
      rgb = mixRgb(rgb, metal, bare);

      const p = (y * size + x) * 4;
      albedo.data[p] = clamp01(rgb.r / 255) * 255;
      albedo.data[p + 1] = clamp01(rgb.g / 255) * 255;
      albedo.data[p + 2] = clamp01(rgb.b / 255) * 255;
      albedo.data[p + 3] = 255;
    }
  }

  albedoCtx.putImageData(albedo, 0, 0);

  // Albedo only. No normal, no roughness - the material's own scalars carry those, which
  // is what "flat" means here.
  const map = textureOf(albedoCanvas, true);
  const maps: SurfaceMaps = {
    map,
    normalMap: null,
    roughnessMap: null,
    metalnessMap: null,
  };
  CACHE.set(key, maps);
  return maps;
}

export interface PegboardOptions {
  color: string;
  /** Hole colour. Near-black; a pegboard hole is a hole. */
  hole?: string;
  seed?: string;
  size?: number;
  /** Holes across the tile. */
  pitch?: number;
  repeat?: [number, number];
}

/**
 * Pegboard, and the one case where a repeating pattern survives the flat pass.
 *
 * The rule is that texture earns its place by being evidence rather than material, and a
 * pegboard's holes are neither exactly - they are what the OBJECT IS. Take them away and
 * it is a brown wall; a workshop with tools hanging on a brown wall has lost the thing
 * that says the tools hang there.
 *
 * So it stays, but it changes register. It used to put all its busyness in a normal map,
 * which is precisely the micro-relief the flat pass exists to remove - the holes read as
 * physically drilled under six lights. Now they are painted: flat dark dots in the albedo,
 * no relief, no roughness. Same information, none of the realism.
 */
export function pegboardMaps(options: PegboardOptions): SurfaceMaps | null {
  const {
    color,
    hole = '#2a2018',
    seed = color,
    size = 256,
    pitch = 16,
    repeat = [8.5, 4],
  } = options;

  const key = `flatpeg:${JSON.stringify([color, hole, seed, size, pitch, repeat])}`;
  const cached = CACHE.get(key);
  if (cached !== undefined) return cached;
  if (!CAN_PAINT) {
    CACHE.set(key, null);
    return null;
  }

  const canvas = canvasOf(size);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    CACHE.set(key, null);
    return null;
  }

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);

  // Radius from the pitch rather than a constant, so changing the pitch does not silently
  // change how much of the board is hole.
  const step = size / pitch;
  const radius = step * 0.17;
  ctx.fillStyle = hole;
  for (let row = 0; row < pitch; row++) {
    for (let col = 0; col < pitch; col++) {
      ctx.beginPath();
      ctx.arc((col + 0.5) * step, (row + 0.5) * step, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const map = textureOf(canvas, true);
  map.repeat.set(repeat[0], repeat[1]);
  map.needsUpdate = true;

  const maps: SurfaceMaps = { map, normalMap: null, roughnessMap: null, metalnessMap: null };
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

  // clone() drops onBeforeCompile, so the family's paint banding has to be re-applied
  // to the copy - without this, every textured hero prop would be the one smooth-lit
  // object in a banded room.
  const material = applyPaintBanding(fallback.clone());
  material.map = maps.map;
  material.normalMap = maps.normalMap;
  material.roughnessMap = maps.roughnessMap;
  material.metalnessMap = maps.metalnessMap;
  // The maps carry the variation now; the scalars become multipliers and must be 1 or
  // they scale the whole map down. Colour is white by default because it tints `map`, but
  // a hero prop may deliberately use a multiplier to sit below a person or practical in a
  // scene's value hierarchy without repainting its generated wear map.
  material.color = new THREE.Color(options.tint ?? '#ffffff');
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
