/**
 * Brick, PAINTED.
 *
 * ## The art direction, stated, because three passes at this ignored it
 *
 * This project's own law says SHAPED means "flat-shaded, cold, no maps", and surface.ts
 * says in as many words that a flat surface "is not a textured surface with a weak normal
 * map". Everything in this game is flat colour, hard edges and quantised paint banding, and
 * nothing in it casts a shadow. A normal-mapped, per-brick-noise, thirty-one-across brick
 * material is a HERO SURFACE - and this is a wall behind a man picking a lock.
 *
 * So the earlier versions were failing at something they should not have been attempting.
 * They simulated masonry: every brick present, every joint drawn, a normal map for light
 * that has nowhere to come from. That is how you get a wall which measures correctly and
 * reads as tiling, which is exactly what happened, twice - first at the wrong size, then at
 * the right one.
 *
 * ## What a painter does instead
 *
 * Anybody painting a brick wall for a set does four things, and the order is the method:
 *
 * 1. **A flat tone, blotched.** Most of the read is large soft variation across the wall -
 *    damp, sun, sixty years. It is what the eye sees first and it has nothing to do with
 *    bricks.
 * 2. **Courses implied, not drawn.** A BROKEN line at each course. Continuous rules read as
 *    tile; the eye completes a broken line into a course by itself and gets a wall.
 * 3. **A few bricks picked out.** Eight or ten in a hundred, given their own tone. Those are
 *    what say "brick"; the rest are allowed to stay a flat field. Drawing every brick is
 *    what makes a grid.
 * 4. **Almost no perp joints.** The vertical joint is the most repetitive mark on a wall and
 *    the first thing a painter drops. A third of them, short of the bed joints, so they
 *    never close the grid back up.
 *
 * ## No normal map at all
 *
 * Deliberately null, and it is the change that matters most. Shadow casting is off across
 * the whole project and this scene has one lamp, so a normal map here asks a renderer that
 * cannot shade small relief to shade small relief. It cost an upload and bought a faint
 * grid - which is worse than nothing, because a faint grid is still a grid.
 */

import * as THREE from 'three';

import { createRng, range, seedFrom } from '../core/rng.js';

import type { SurfaceMaps } from './surface.js';

export interface BrickOptions {
  /** The wall's tone. Most of the surface stays close to this. */
  color?: string;
  /** The joint. It reads as the gap between bricks, so it is DARKER than the brick. */
  mortar?: string;
  /** How far a picked-out brick may stray, 0 to 1. Only the picked ones move. */
  variation?: number;
  /** Share of bricks given their own tone. Small on purpose - see note 3. */
  picked?: number;
  courses?: number;
  seed?: string;
  size?: number;
}

const CACHE = new Map<string, SurfaceMaps | null>();

function parse(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function brickwork(options: BrickOptions = {}): SurfaceMaps | null {
  const {
    color = '#7d5f4b',
    mortar = '#6f675e',
    variation = 0.14,
    picked = 0.1,
    courses = 32,
    seed = 'brick',
    size = 1024,
  } = options;

  const key = `brick:${JSON.stringify([color, mortar, variation, picked, courses, seed, size])}`;
  const cached = CACHE.get(key);
  if (cached !== undefined) return cached;
  if (typeof document === 'undefined') {
    CACHE.set(key, null);
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    CACHE.set(key, null);
    return null;
  }

  const rng = createRng(seedFrom(seed));
  const base = parse(color);

  // 1: the flat tone.
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);

  /*
   * ...and the blotching, which is most of the finished look.
   *
   * Big, soft, low-contrast: thirty patches up to a third of the tile across at a few per
   * cent alpha. Individually invisible; collectively the thing that stops the wall being a
   * colour swatch. Drawn BEFORE the courses so the joints sit over it and the variation
   * reads as being in the brickwork rather than smeared on top of it.
   */
  for (let i = 0; i < 30; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = range(rng, size * 0.12, size * 0.38);
    const tint = rng() > 0.45 ? '150, 110, 70' : '70, 74, 82';
    const blot = ctx.createRadialGradient(x, y, 0, x, y, r);
    blot.addColorStop(0, `rgba(${tint}, ${range(rng, 0.05, 0.13).toFixed(3)})`);
    blot.addColorStop(1, `rgba(${tint}, 0)`);
    ctx.fillStyle = blot;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  const courseHeight = size / courses;
  // A brick and its joints is 225 x 75mm, which is exactly three to one.
  const brickWidth = courseHeight * 3;
  const joint = Math.max(1, Math.round(courseHeight * 0.11));

  ctx.lineCap = 'butt';

  for (let row = 0; row < courses; row++) {
    const y = row * courseHeight;
    /*
     * Half bond: the one piece of real bricklaying that has to survive stylisation.
     * Aligned courses read as blockwork and everybody knows it without knowing why.
     */
    const offset = row % 2 === 0 ? 0 : -brickWidth / 2;

    /*
     * 3: a few bricks picked out, before the joints so the lines run over them and they
     * sit IN the coursing rather than on it. Each takes its own tint - warmer, cooler,
     * lighter, darker - which is a wall of bricks fired in different parts of a kiln.
     */
    for (let x = offset - brickWidth; x < size + brickWidth; x += brickWidth) {
      if (rng() > picked) continue;
      const shift = (): number => (rng() * 2 - 1) * variation * 255;
      const r = Math.max(0, Math.min(255, base[0] + shift()));
      const g = Math.max(0, Math.min(255, base[1] + shift() * 0.8));
      const b = Math.max(0, Math.min(255, base[2] + shift() * 0.8));
      ctx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},${range(rng, 0.5, 0.9).toFixed(2)})`;
      ctx.fillRect(x + joint, y + joint, brickWidth - joint * 2, courseHeight - joint * 2);
    }

    /*
     * 2: the bed joint, broken.
     *
     * A run of segments with gaps at a varying alpha, never one rule across the tile. A
     * continuous line at every course is a grid, and a grid is what the eye latches onto
     * and then follows all the way to the seam where the tile repeats.
     */
    ctx.strokeStyle = mortar;
    ctx.lineWidth = joint;
    let x = offset - brickWidth;
    while (x < size + brickWidth) {
      const run = range(rng, brickWidth * 0.8, brickWidth * 3.4);
      if (rng() > 0.16) {
        ctx.globalAlpha = range(rng, 0.35, 0.8);
        ctx.beginPath();
        ctx.moveTo(x, y + joint / 2);
        ctx.lineTo(x + run, y + joint / 2);
        ctx.stroke();
      }
      // The gap, and it is short: the course still has to READ as one line, just not be
      // drawn as one.
      x += run + range(rng, brickWidth * 0.06, brickWidth * 0.3);
    }

    /*
     * 4: a third of the perps, stopped short of the bed joints.
     *
     * The short stop is what stops them closing the grid back up. A perp that meets its bed
     * joints at both ends draws a complete rectangle, and a wall of complete rectangles is
     * the thing this whole file exists to avoid.
     */
    for (let bx = offset; bx < size + brickWidth; bx += brickWidth) {
      if (rng() > 0.34) continue;
      ctx.globalAlpha = range(rng, 0.3, 0.65);
      const inset = courseHeight * range(rng, 0.12, 0.3);
      ctx.beginPath();
      ctx.moveTo(bx, y + inset);
      ctx.lineTo(bx, y + courseHeight - inset);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /*
   * And the dirt, last: broad vertical washes.
   *
   * Everything on a wall is put there by water running down it. Wide, very soft, very few -
   * this is the layer that ties the courses back into one surface and stops the picked
   * bricks reading as confetti.
   */
  for (let i = 0; i < 9; i++) {
    const x = rng() * size;
    const w = range(rng, size * 0.05, size * 0.22);
    const wash = ctx.createLinearGradient(x, 0, x + w, 0);
    wash.addColorStop(0, 'rgba(38, 30, 24, 0)');
    wash.addColorStop(0.5, `rgba(38, 30, 24, ${range(rng, 0.05, 0.12).toFixed(3)})`);
    wash.addColorStop(1, 'rgba(38, 30, 24, 0)');
    ctx.fillStyle = wash;
    ctx.fillRect(x, 0, w, size);
  }

  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;

  /*
   * Colour only. See the header: no normal map and no roughness map.
   *
   * The material's own roughness scalar and the project's paint banding do the shading,
   * which is the arrangement every other flat surface in this game already has.
   */
  const maps: SurfaceMaps = {
    map,
    normalMap: null,
    roughnessMap: null,
    metalnessMap: null,
  };
  CACHE.set(key, maps);
  return maps;
}
