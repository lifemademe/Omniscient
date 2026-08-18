/**
 * Brick, drawn rather than photographed.
 *
 * ## Why a generator and not a texture file
 *
 * Same reason as every other surface in this project: an imported brick photograph would
 * be the one thing in the game that came from a camera, sitting next to seven scenes built
 * out of flat colour and hard edges. It would also tile, and brick is the single worst
 * surface to tile visibly because the eye counts courses.
 *
 * ## What actually makes brick read as brick
 *
 * 1. **The mortar, not the bricks.** A wall is a grid of dark lines with colour between
 *    them. Get the lines right - thin, recessed, unbroken horizontally, staggered
 *    vertically - and almost any colour in the gaps reads as masonry.
 * 2. **Per-brick colour variation, and a lot of it.** Real stock brick runs from pink
 *    through buff to nearly black in the same wall. A single colour with noise over it
 *    reads as a printed pattern; individually tinted bricks read as fired clay.
 * 3. **Half-bond.** Every other course offset by half a brick. Aligned courses are
 *    breeze-block, and the eye knows the difference without being able to name it.
 * 4. **The normal map carries the mortar, the colour map carries the clay.** Recessed
 *    joints are what catch a low light across a wall, and this scene has exactly one low
 *    light. Without a normal map a brick wall lit from the side is a flat photograph of a
 *    brick wall.
 *
 * Returns the same `SurfaceMaps` shape the painted-metal generator does, so it drops into
 * `texturedFrom` and inherits the family's paint banding.
 */

import * as THREE from 'three';

import { createRng, seedFrom } from '../core/rng.js';

import type { SurfaceMaps } from './surface.js';

export interface BrickOptions {
  /** Average brick colour. Individual bricks scatter either side of it. */
  color?: string;
  /** The joint. Nearly always paler than the brick and always duller. */
  mortar?: string;
  /** How far a brick's tint may stray from `color`, 0 to 1. See note 2. */
  variation?: number;
  /** Courses in the tile. More means smaller bricks for the same wall. */
  courses?: number;
  seed?: string;
  size?: number;
}

const CACHE = new Map<string, SurfaceMaps | null>();

function parse(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/**
 * One tile of brickwork, as colour, normal and roughness.
 *
 * The tile is square and wraps in both directions, so the caller sets `repeat` to whatever
 * makes the courses the right height on their wall. Nothing here knows how big the wall is.
 */
export function brickwork(options: BrickOptions = {}): SurfaceMaps | null {
  const {
    color = '#8d6a52',
    mortar = '#9a938a',
    variation = 0.22,
    courses = 16,
    seed = 'brick',
    size = 512,
  } = options;

  const key = `brick:${JSON.stringify([color, mortar, variation, courses, seed, size])}`;
  const cached = CACHE.get(key);
  if (cached !== undefined) return cached;
  if (typeof document === 'undefined') {
    CACHE.set(key, null);
    return null;
  }

  const albedo = document.createElement('canvas');
  const normal = document.createElement('canvas');
  const rough = document.createElement('canvas');
  for (const canvas of [albedo, normal, rough]) {
    canvas.width = size;
    canvas.height = size;
  }
  const ac = albedo.getContext('2d');
  const nc = normal.getContext('2d');
  const rc = rough.getContext('2d');
  if (!ac || !nc || !rc) {
    CACHE.set(key, null);
    return null;
  }

  const rng = createRng(seedFrom(seed));
  const base = parse(color);
  const joint = parse(mortar);

  // Mortar everywhere, then bricks laid on top of it. Drawing the joints as gaps between
  // rectangles is what keeps them a consistent width without any line-drawing at all.
  ac.fillStyle = mortar;
  ac.fillRect(0, 0, size, size);
  // Neutral normal is (0.5, 0.5, 1) - flat. The joints are cut into it below.
  nc.fillStyle = '#8080ff';
  nc.fillRect(0, 0, size, size);
  // Mortar is the roughest thing on a wall. White is fully rough.
  rc.fillStyle = '#f0f0f0';
  rc.fillRect(0, 0, size, size);

  const courseHeight = size / courses;
  // Two-to-one is the proportion of a stretcher face, near enough at this scale.
  const brickWidth = courseHeight * 2.1;
  const joint2 = Math.max(2, Math.round(courseHeight * 0.13));

  for (let row = 0; row < courses; row++) {
    const y = row * courseHeight;
    // 3: half bond. Every other course starts half a brick along.
    const offset = row % 2 === 0 ? 0 : -brickWidth / 2;
    for (let x = offset - brickWidth; x < size + brickWidth; x += brickWidth) {
      const bx = x + joint2 / 2;
      const by = y + joint2 / 2;
      const bw = brickWidth - joint2;
      const bh = courseHeight - joint2;

      /*
       * 2: each brick its own colour.
       *
       * Three independent channel offsets rather than one brightness, because a stock
       * brick wall varies in HUE as much as in value - some are pink, some are grey, and a
       * wall where every brick is the same colour at a different brightness reads as a
       * pattern with a gradient over it.
       */
      const shift = (): number => (rng() * 2 - 1) * variation * 255;
      const r = Math.max(0, Math.min(255, base[0] + shift()));
      const g = Math.max(0, Math.min(255, base[1] + shift() * 0.7));
      const b = Math.max(0, Math.min(255, base[2] + shift() * 0.7));
      ac.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
      ac.fillRect(bx, by, bw, bh);

      // A few bricks are noticeably darker - overfired headers, damp, soot. Sparse, so
      // they read as individuals rather than as noise.
      if (rng() < 0.07) {
        ac.fillStyle = `rgba(20, 14, 12, ${0.18 + rng() * 0.22})`;
        ac.fillRect(bx, by, bw, bh);
      }

      /*
       * 4: the face is flat and proud, the joint around it is not.
       *
       * The brick face is painted neutral over the cut joint, so the only thing in the
       * normal map is the step at the edge of each brick - which is exactly what a raking
       * light finds on a real wall.
       */
      nc.fillStyle = '#8080ff';
      nc.fillRect(bx, by, bw, bh);
      // Bricks are smoother than mortar, and vary.
      const smooth = 150 + rng() * 60;
      rc.fillStyle = `rgb(${smooth | 0},${smooth | 0},${smooth | 0})`;
      rc.fillRect(bx, by, bw, bh);
    }
  }

  /*
   * The bevel: a light edge on the top-left of every brick and a dark one on the bottom
   * right, drawn into the normal map's red and green channels.
   *
   * Cheaper and more controllable than deriving a normal map from a height field, and at
   * this tile size the difference is invisible. Drawn after the faces so it survives them.
   */
  nc.globalAlpha = 0.55;
  for (let row = 0; row < courses; row++) {
    const y = row * courseHeight;
    const offset = row % 2 === 0 ? 0 : -brickWidth / 2;
    for (let x = offset - brickWidth; x < size + brickWidth; x += brickWidth) {
      const bx = x + joint2 / 2;
      const by = y + joint2 / 2;
      const bw = brickWidth - joint2;
      const bh = courseHeight - joint2;
      // Facing up-left: normal tilts -x, +y.
      nc.fillStyle = '#5fa0ff';
      nc.fillRect(bx, by, bw, joint2);
      nc.fillRect(bx, by, joint2, bh);
      // Facing down-right.
      nc.fillStyle = '#a060ff';
      nc.fillRect(bx, by + bh - joint2, bw, joint2);
      nc.fillRect(bx + bw - joint2, by, joint2, bh);
    }
  }
  nc.globalAlpha = 1;

  /*
   * Weathering, last and over everything.
   *
   * Streaks running DOWN, because everything on a wall is put there by water. A few broad
   * soft columns rather than noise - a wall is stained under its window sills and below its
   * gutter joints, not evenly.
   */
  ac.globalAlpha = 0.09;
  ac.fillStyle = '#2a2018';
  for (let i = 0; i < 14; i++) {
    const x = rng() * size;
    const w = 8 + rng() * 46;
    const top = rng() * size * 0.6;
    ac.fillRect(x, top, w, size - top);
  }
  ac.globalAlpha = 1;

  const wrap = (canvas: HTMLCanvasElement, srgb: boolean): THREE.CanvasTexture => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  };

  const maps: SurfaceMaps = {
    map: wrap(albedo, true),
    normalMap: wrap(normal, false),
    roughnessMap: wrap(rough, false),
    metalnessMap: null,
  };
  CACHE.set(key, maps);
  return maps;
}
