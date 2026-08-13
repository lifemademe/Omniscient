/**
 * The drawing surface the CRT content is authored against.
 *
 * Deliberately narrow and free of any THREE or DOM types. CRTSurface implements it on
 * top of a CanvasTexture for the game; a plain pixel buffer implements it for headless
 * rendering, which lets the Knowledge Tree be verified and previewed without launching
 * the editor - useful because screenshots are unavailable while play mode is active.
 */
export interface PixelSurface {
  readonly width: number;
  readonly height: number;

  /** Wipe to the background colour. */
  clear(): void;

  /** Draw a single hard pixel. */
  pixel(x: number, y: number, color: string): void;

  /** Hard-edged line. Implementations must not anti-alias. */
  line(x0: number, y0: number, x1: number, y1: number, color: string): void;

  /** Darken alternate rows. */
  applyScanlines(strength?: number): void;

  /** Publish the frame. No-op for buffers that are read directly. */
  commit(): void;
}
