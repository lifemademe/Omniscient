/**
 * CRTSurface - a low-resolution pixel canvas mapped onto a 3D screen mesh.
 *
 * Gauntlet §213: the Knowledge Tree and every other in-world screen live *inside* the
 * CRT as pixel art, not as a DOM overlay drawn on top of the world. ENGINE.UI3DNode
 * only projects a world position into screen space for DOM UI, so in-world screen
 * content has to go through THREE.CanvasTexture instead.
 *
 * Resolution is deliberately tiny (§9 INTERFACE AESTHETIC - Game Boy-like economy).
 * Nearest filtering keeps pixels hard-edged when the camera pushes in.
 */

import * as THREE from 'three';

import type { PixelSurface } from './PixelSurface.js';

export interface CRTSurfaceOptions {
  /** Canvas width in pixels. Keep small - this is the art style, not a limitation. */
  width?: number;
  height?: number;
  /** Screen background, seen wherever nothing is drawn. */
  background?: string;
  /** Phosphor tint multiplied over the whole surface. */
  tint?: THREE.ColorRepresentation;
}

const DEFAULTS: Required<CRTSurfaceOptions> = {
  width: 192,
  height: 144,
  background: '#08180e',
  tint: 0xffffff,
};

/** Four-neighbour spread for the phosphor halo. Diagonals would fatten the traces too much. */
const GLOW_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export class CRTSurface implements PixelSurface {
  public readonly canvas: HTMLCanvasElement;
  public readonly ctx: CanvasRenderingContext2D;
  public readonly texture: THREE.CanvasTexture;
  public readonly material: THREE.MeshBasicMaterial;

  private readonly options: Required<CRTSurfaceOptions>;

  constructor(options: CRTSurfaceOptions = {}) {
    this.options = { ...DEFAULTS, ...options };

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.options.width;
    this.canvas.height = this.options.height;

    const ctx = this.canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new Error('CRTSurface: 2D canvas context unavailable');
    }
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = THREE.SRGBColorSpace;

    /**
     * No vertical flip.
     *
     * There used to be one here - `repeat.set(1, -1)`, `offset.set(0, 1)` - added when the
     * Knowledge Tree first came up sprouting downward with its roots in the air. It was
     * correcting for the UVs of the generated `PlaneGeometry` the screen used to be.
     *
     * The screen is now an authored quad in CRT_TV.glb, and `fitSurfaceUvs` rebuilds its
     * UVs from its own geometry with v running up the way the world does. That already
     * lands canvas row 0 at the top, so the old correction became a second flip and hung
     * the tree from the ceiling again - the same symptom, from the opposite cause.
     *
     * Measured both ways rather than reasoned about, because this pipeline has three
     * places that can flip a texture and they do not agree with each other.
     */
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;

    // Unlit: a screen emits, it is not lit by the room.
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      toneMapped: false,
      color: this.options.tint,
    });

    this.clear();
  }

  public get width(): number {
    return this.options.width;
  }

  public get height(): number {
    return this.options.height;
  }

  /**
   * Wipe to the background colour. Does not upload - call commit().
   *
   * The wash is not flat. A powered CRT has a visible raster - the phosphor glows even
   * where nothing is drawn, brightest at the centre of the tube and falling off into the
   * corners. Filling flat black made the screen read as a dead panel in an unlit room,
   * which is fatal when the screen is the hero object of the whole game.
   */
  public clear(): void {
    const { width, height } = this.options;
    this.ctx.fillStyle = this.options.background;
    this.ctx.fillRect(0, 0, width, height);

    const glow = this.ctx.createRadialGradient(
      width / 2,
      height * 0.56,
      0,
      width / 2,
      height * 0.56,
      Math.max(width, height) * 0.62
    );
    glow.addColorStop(0, 'rgba(90, 190, 120, 0.30)');
    glow.addColorStop(0.55, 'rgba(50, 130, 78, 0.13)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    this.ctx.fillStyle = glow;
    this.ctx.fillRect(0, 0, width, height);
  }

  /**
   * A line with a halo around it.
   *
   * At 192x144 mapped onto a screen a few hundred pixels across, single-pixel traces
   * disappear entirely - the tree was technically drawing and visually absent. Real
   * phosphor bleeds into its neighbours, so each trace gets a dim spread pass before the
   * bright core, which both fixes the legibility and is what a CRT actually does.
   */
  public glowLine(x0: number, y0: number, x1: number, y1: number, color: string): void {
    const previous = this.ctx.globalAlpha;
    this.ctx.globalAlpha = 0.24;
    for (const [ox, oy] of GLOW_OFFSETS) {
      this.line(x0 + ox, y0 + oy, x1 + ox, y1 + oy, color);
    }
    this.ctx.globalAlpha = previous;
    this.line(x0, y0, x1, y1, color);
  }

  /** Draw a single hard pixel. */
  public pixel(x: number, y: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }

  /**
   * Bresenham line in hard pixels. Canvas strokes anti-alias, which destroys the
   * pixel-art read at this resolution, so lines are plotted by hand.
   */
  public line(x0: number, y0: number, x1: number, y1: number, color: string): void {
    let px = Math.round(x0);
    let py = Math.round(y0);
    const ex = Math.round(x1);
    const ey = Math.round(y1);

    const dx = Math.abs(ex - px);
    const dy = -Math.abs(ey - py);
    const sx = px < ex ? 1 : -1;
    const sy = py < ey ? 1 : -1;
    let err = dx + dy;

    this.ctx.fillStyle = color;
    for (;;) {
      this.ctx.fillRect(px, py, 1, 1);
      if (px === ex && py === ey) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        px += sx;
      }
      if (e2 <= dx) {
        err += dx;
        py += sy;
      }
    }
  }

  /** Horizontal scanline darkening, baked into the canvas itself. */
  public applyScanlines(strength = 0.18): void {
    this.ctx.fillStyle = `rgba(0, 0, 0, ${strength})`;
    for (let y = 0; y < this.options.height; y += 2) {
      this.ctx.fillRect(0, y, this.options.width, 1);
    }
  }

  /** Push canvas changes to the GPU. Call once per frame at most. */
  public commit(): void {
    this.texture.needsUpdate = true;
  }

  public dispose(): void {
    this.texture.dispose();
    this.material.dispose();
  }
}
