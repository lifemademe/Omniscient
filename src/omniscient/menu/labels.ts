/**
 * Module labels, drawn to canvas textures.
 *
 * The engine's TextNode would give 3D text, but these are painted-on plates - the label
 * belongs to the surface, not floating above it. Canvas keeps the chunky stencil look
 * §9 asks for in the interface layer, and lets a hovered plate light its own lettering.
 */

import * as THREE from 'three';

import { ACCENT } from '../art/palette.js';

/**
 * Supersampled 2x, then filtered down by the GPU.
 *
 * At 512 the plate's lettering measured a conservative contrast of 3.14:1 after the ink was
 * darkened - over the line, but the strokes were being thinned by antialiasing into the
 * plate rather than by the colour choice. A Courier stem at 44px on a texture this size is
 * about two texels wide by the time it reaches the screen, and half of each stem is a blend
 * with the background.
 *
 * Drawing at twice the size and letting the mip chain do the reduction costs one megabyte
 * of texture for the whole menu and gives a letter with an actual solid core. Every metric
 * below is expressed off SCALE so the layout cannot drift from the canvas.
 */
const SCALE = 2;
const WIDTH = 512 * SCALE;
const HEIGHT = 116 * SCALE;

export interface LabelOptions {
  title: string;
  subtitle: string;
  /** Lit labels use the module's accent; unlit are worn paint. */
  lit?: boolean;
  accent?: string;
}

/**
 * Draw a module label. Transparent background so it sits on the plate's own material
 * rather than covering it with a rectangle.
 */
export function createLabelTexture(options: LabelOptions): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('label: 2D canvas context unavailable');

  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.textBaseline = 'alphabetic';

  /**
   * Dark ink, on both states.
   *
   * These were cream (`#cdbfa2`) on a cream plate, and measured at a contrast ratio of
   * **1.21:1** against it - text at median luma 140 against a plate at 147, seven values
   * apart. WCAG asks 3:1 for large type and this is the first screen of the game, so NEW
   * GAME was effectively unlabelled in the shot a store page would lead with.
   *
   * The fix is not brighter text, it is darker: every real piece of equipment in this room
   * is stencilled dark on pale metal, because that is what survives being read across a
   * workshop. It is the authentic answer and the legible one at the same time.
   *
   * Lit does not change the ink - it puts the accent BEHIND the letters as a glow, which
   * reads as the plate backlighting from within and keeps the same reading contrast in
   * both states. Swapping ink to the accent on hover, which is what it used to do, made
   * the selected item the hardest one on the panel to read.
   */
  const accent = options.accent ?? ACCENT.amber;
  // Dark values barely move under ACES (§255), so these arrive close to as authored.
  const title = '#2b2620';
  const subtitle = '#5a5147';

  ctx.font = `bold ${44 * SCALE}px "Courier New", monospace`;
  if (options.lit) {
    ctx.shadowColor = accent;
    ctx.shadowBlur = 18 * SCALE;
    /*
     * Laid down twice. A shadow is drawn per fill, so painting the glow pass first and
     * then the ink on top gives a solid letter sitting in its own halo rather than a
     * letter with the halo washing over it.
     */
    ctx.fillStyle = accent;
    ctx.fillText(options.title.toUpperCase(), 12 * SCALE, 52 * SCALE);
  }
  ctx.shadowBlur = 0;
  ctx.fillStyle = title;
  ctx.fillText(options.title.toUpperCase(), 12 * SCALE, 52 * SCALE);

  ctx.font = `${24 * SCALE}px "Courier New", monospace`;
  ctx.fillStyle = subtitle;
  ctx.fillText(options.subtitle, 14 * SCALE, 90 * SCALE);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  // Flip vertically only.
  //
  // As mapped onto the plate the label arrived upside down. Inverting both axes fixed
  // the vertical but left the words running backwards, so the horizontal was correct all
  // along - the plate quad is wound such that we read the texture the right way round.
  // Determined by looking at it, twice; the maths here is not worth deriving.
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, -1);
  texture.offset.set(0, 1);

  return texture;
}

export function createLabelMaterial(options: LabelOptions): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map: createLabelTexture(options),
    transparent: true,
    toneMapped: false,
    depthWrite: false,
    // The plate is opaque behind it, so drawing both faces costs nothing and removes
    // any dependence on which way the quad happens to be wound.
    side: THREE.DoubleSide,
  });
}
