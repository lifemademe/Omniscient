/**
 * Sky, as seen through a window.
 *
 * §241 says backgrounds are value and layers rather than props, and both interiors have
 * been failing it in the same way: their windows were a single flat colour. A window is
 * the cheapest depth cue this project has - it is the only place in an interior where the
 * eye is told there is a world past the wall - and a flat rectangle spends that for
 * nothing. It also throws away the one thing every reference frame gets its mood from,
 * which is a warm horizon under a cool zenith.
 *
 * ## Why this is a gradient and not a photograph
 *
 * The flat pass established the rule: texture that says "this is made of a substance" is
 * out, and texture that carries information stays. A sky is neither - it is pure VALUE,
 * which is exactly what §241 asks a background to be. A gradient is not material detail;
 * it is the light in the room, drawn.
 *
 * Deliberately no cloud shapes. Painted clouds in a 1.5-metre aperture read as wallpaper,
 * and the reference frames' clouds are doing work at a scale this window does not have.
 * Banding instead: a handful of soft horizontal steps, which matches the light banding on
 * every surface in the game and reads as deliberate rather than as a missing sky.
 */

import * as THREE from 'three';

const CAN_PAINT = typeof document !== 'undefined';

export interface SkyOptions {
  /** Colour at the top of the aperture. */
  zenith: string;
  /** Colour at the horizon. Warmer and paler than the zenith, always. */
  horizon: string;
  /** Soft steps between them, to match the light banding. 0 for a smooth ramp. */
  bands?: number;
  height?: number;
}

const CACHE = new Map<string, THREE.CanvasTexture | null>();

/**
 * A vertical sky gradient.
 *
 * One pixel wide: a gradient has no horizontal information, so a 1xN texture stretched
 * across the pane is the whole thing, and costs nothing.
 */
export function skyTexture(options: SkyOptions): THREE.CanvasTexture | null {
  const { zenith, horizon, bands = 5, height = 128 } = options;

  const key = JSON.stringify([zenith, horizon, bands, height]);
  const cached = CACHE.get(key);
  if (cached !== undefined) return cached;
  if (!CAN_PAINT) {
    CACHE.set(key, null);
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    CACHE.set(key, null);
    return null;
  }

  /**
   * Drawn upside down on purpose.
   *
   * The engine uploads with flipY off, so canvas row 0 lands at v = 0, which is the
   * BOTTOM of the pane. Sky at the top of the image would therefore come out under the
   * sill. Painting the horizon first is the same correction `createDecal` makes, done
   * inline because a one-pixel-wide gradient does not need a canvas transform.
   */
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, horizon);
  gradient.addColorStop(1, zenith);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1, height);

  if (bands > 0) {
    // Quantise into soft steps by sampling the ramp and re-filling. The read has to match
    // the banded light on every lit surface, or the window is the one smooth thing in a
    // stepped room and reads as a hole rather than as a view.
    const image = ctx.getImageData(0, 0, 1, height);
    const step = height / bands;
    for (let i = 0; i < bands; i++) {
      const sample = Math.min(height - 1, Math.floor(i * step + step * 0.5));
      const p = sample * 4;
      const [r, g, b] = [image.data[p], image.data[p + 1], image.data[p + 2]];
      // Soft edges: blend the last few rows of each band into the next.
      const from = Math.floor(i * step);
      const to = Math.floor((i + 1) * step);
      for (let y = from; y < to; y++) {
        const edge = Math.min(1, (to - y) / (step * 0.35));
        const q = y * 4;
        image.data[q] = image.data[q] * (1 - edge) + r * edge;
        image.data[q + 1] = image.data[q + 1] * (1 - edge) + g * edge;
        image.data[q + 2] = image.data[q + 2] * (1 - edge) + b * edge;
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;

  CACHE.set(key, texture);
  return texture;
}

/**
 * An unlit material carrying a sky.
 *
 * Unlit and un-tone-mapped for the same reason the flat colour it replaces was: a window
 * is a light source in the frame, not a surface the room's lamps fall on. Tone mapping it
 * would drag the brightest thing in the shot down to the exposure of the darkest.
 */
export function skyMaterial(options: SkyOptions): THREE.MeshBasicMaterial {
  const map = skyTexture(options);
  return new THREE.MeshBasicMaterial({
    map: map ?? undefined,
    color: map ? '#ffffff' : options.horizon,
    toneMapped: false,
    fog: false,
  });
}
