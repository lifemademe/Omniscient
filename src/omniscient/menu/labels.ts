/**
 * Module labels, drawn to canvas textures.
 *
 * The engine's TextNode would give 3D text, but these are painted-on plates - the label
 * belongs to the surface, not floating above it. Canvas keeps the chunky stencil look
 * §9 asks for in the interface layer, and lets a hovered plate light its own lettering.
 */

import * as THREE from 'three';

import { ACCENT } from '../art/palette.js';

const WIDTH = 512;
const HEIGHT = 116;

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

  const accent = options.accent ?? ACCENT.amber;
  const title = options.lit ? accent : '#cdbfa2';
  const subtitle = options.lit ? '#d8cbb0' : '#8d8069';

  ctx.font = 'bold 44px "Courier New", monospace';
  ctx.fillStyle = title;
  if (options.lit) {
    ctx.shadowColor = accent;
    ctx.shadowBlur = 18;
  }
  ctx.fillText(options.title.toUpperCase(), 12, 52);

  ctx.shadowBlur = 0;
  ctx.font = '24px "Courier New", monospace';
  ctx.fillStyle = subtitle;
  ctx.fillText(options.subtitle, 14, 90);

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
