/**
 * Screen glass.
 *
 * What makes a CRT face read as thick glass is not transparency - there is nothing behind
 * it but a dark tube - it is the reflection: a soft window-shaped highlight stretched by
 * the curvature of the tube, sitting in front of the picture rather than mixed into it.
 *
 * ## Why this is painted rather than reflected
 *
 * Real refraction lives in the engine's node materials, which are WebGPU-only - the same
 * category as the post-process effects that fail silently under the forced WebGL renderer.
 * A true environment reflection needs a PMREM-processed cubemap, which needs a renderer
 * instance at build time.
 *
 * Neither is worth reaching for here, because the menu camera does not move. HOME_SHOT is
 * a fixed bracket, so a highlight painted for that one angle is indistinguishable from a
 * computed one and costs a single texture. The moment a scene needs the camera to orbit
 * this glass, this is the thing that has to change - which is why it says so here.
 *
 * ## Why it is a separate surface
 *
 * The sheen must not dim when the picture does. A highlight that switches off with the
 * CRT is instantly wrong, and that is what folding it into the screen material would do.
 */

import * as THREE from 'three';

import { clamp01, fbm, smoothstep } from './noise.js';
import { seedFrom } from '../core/rng.js';

const CAN_PAINT = typeof document !== 'undefined';

export interface ScreenGlassOptions {
  /** Where the reflected window sits, in UV. Default is high and left. */
  highlight?: { x: number; y: number };
  /** Overall strength. The glass should suggest a window, not become one. */
  intensity?: number;
  seed?: string;
  size?: number;
}

/**
 * The reflection map: black where the glass shows the picture through, bright where it
 * shows the room. Additively blended, so black costs nothing.
 */
function reflectionTexture(options: Required<ScreenGlassOptions>): THREE.CanvasTexture | null {
  if (!CAN_PAINT) return null;

  const { size, seed, highlight, intensity } = options;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const image = ctx.createImageData(size, size);
  const noiseSeed = seedFrom(seed);

  for (let y = 0; y < size; y++) {
    const v = 1 - (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;

      /**
       * The window, with its glazing bars.
       *
       * A soft blob in roughly the right place reads as a fingerprint, not a reflection.
       * What makes the eye accept it instantly is structure: the workstation window is a
       * two-by-two pane, and reflecting that grid says "this screen is in that room"
       * without anybody having to work it out.
       *
       * Sheared into a parallelogram, because a rectangular pane reflected in a curved
       * face is never a rectangle - the curvature is doing the shearing, and this is the
       * one place the tube's shape becomes visible.
       */
      const sheared = u + (v - highlight.y) * 0.42;
      const paneU = sheared - highlight.x;
      const paneV = v - highlight.y;

      const pane =
        smoothstep(0.085, 0.045, Math.abs(paneU)) *
        smoothstep(0.15, 0.085, Math.abs(paneV));

      // The cross of glazing bars, dark against the sky behind them.
      const bars =
        1 -
        0.82 *
          Math.max(
            smoothstep(0.014, 0.004, Math.abs(paneU)),
            smoothstep(0.014, 0.004, Math.abs(paneV))
          );

      const inPane = pane * bars;

      // A broad wash down the whole face, so the glass has body between highlights
      // instead of one bright shape floating on nothing.
      const wash = smoothstep(0.0, 1.1, v) * 0.16;

      // Grime. A screen in a room like this is never clean, and a faint dusty film is
      // what stops the reflection reading as a decal.
      const dust = fbm(noiseSeed, u, v, { frequency: 7, octaves: 3 });

      // Falloff at the rim: the glass meets the bezel in shadow, never in highlight.
      const rim =
        smoothstep(0.0, 0.11, u) *
        smoothstep(1.0, 0.89, u) *
        smoothstep(0.0, 0.11, v) *
        smoothstep(1.0, 0.89, v);

      const level = clamp01((inPane * 0.85 + wash) * (0.72 + dust * 0.5) * rim * intensity);

      // Slightly cool: daylight off a coastal window, against a warm room.
      const p = (y * size + x) * 4;
      image.data[p] = level * 214;
      image.data[p + 1] = level * 226;
      image.data[p + 2] = level * 236;
      image.data[p + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/**
 * A glass face for a `GLASS_*` quad.
 *
 * Unlit and additive: the room's lights must not touch it, because it is already a
 * picture of the room. Additive blending means the black areas vanish completely and the
 * picture behind shows through untouched.
 */
export function createScreenGlass(options: ScreenGlassOptions = {}): THREE.Material {
  const resolved: Required<ScreenGlassOptions> = {
    highlight: options.highlight ?? { x: 0.3, y: 0.74 },
    intensity: options.intensity ?? 1,
    seed: options.seed ?? 'screen-glass',
    size: options.size ?? 256,
  };

  const map = reflectionTexture(resolved);

  return new THREE.MeshBasicMaterial({
    map: map ?? undefined,
    color: map ? '#ffffff' : '#1a1e22',
    transparent: true,
    blending: THREE.AdditiveBlending,
    // Additive over the picture: never occlude it, never sort in front of it by writing
    // depth, and never disappear because the tube behind is darker.
    depthWrite: false,
    toneMapped: false,
    side: THREE.FrontSide,
  });
}
