/**
 * Headless rendering support for anything drawn against PixelSurface.
 *
 * The CRT content - Knowledge Tree, globe - is authored against a narrow surface
 * contract precisely so it can be rendered without a GPU, an editor or a play session.
 * This module provides the buffer implementation and a minimal PNG encoder.
 */

import { deflateSync } from 'node:zlib';

import type { PixelSurface } from '../../src/omniscient/crt/PixelSurface.js';

const BACKGROUND: [number, number, number] = [6, 18, 11];

/** RGB pixel buffer implementing the same surface contract as the in-game CRT. */
export class BufferSurface implements PixelSurface {
  public readonly data: Uint8Array;

  constructor(
    public readonly width: number,
    public readonly height: number
  ) {
    this.data = new Uint8Array(width * height * 3);
    this.clear();
  }

  /**
   * Wipe to background, with the same centre-weighted phosphor wash CRTSurface paints.
   * Mirrored so the preview is a fair picture of the shipping screen rather than a
   * cleaner one - the flat black version hid exactly the problem it should have shown.
   */
  public clear(): void {
    const cx = this.width / 2;
    const cy = this.height * 0.56;
    const radius = Math.max(this.width, this.height) * 0.62;

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const t = Math.min(1, Math.hypot(x - cx, y - cy) / radius);
        // Matches the two-stop gradient in CRTSurface.clear closely enough to judge by.
        const strength = t < 0.55 ? 0.3 + (0.13 - 0.3) * (t / 0.55) : 0.13 * (1 - (t - 0.55) / 0.45);
        const offset = (y * this.width + x) * 3;
        this.data[offset] = BACKGROUND[0] + Math.round((90 - BACKGROUND[0]) * strength);
        this.data[offset + 1] = BACKGROUND[1] + Math.round((190 - BACKGROUND[1]) * strength);
        this.data[offset + 2] = BACKGROUND[2] + Math.round((120 - BACKGROUND[2]) * strength);
      }
    }
  }

  public pixel(x: number, y: number, color: string): void {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= this.width || py >= this.height) return;

    const [r, g, b] = hexToRgb(color);
    const offset = (py * this.width + px) * 3;
    this.data[offset] = r;
    this.data[offset + 1] = g;
    this.data[offset + 2] = b;
  }

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

    for (;;) {
      this.pixel(px, py, color);
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

  /**
   * Phosphor halo, matching CRTSurface. Mirrored here rather than skipped so the headless
   * preview shows what the game shows - a preview that renders a different image from the
   * one shipping is worse than no preview.
   */
  public glowLine(x0: number, y0: number, x1: number, y1: number, color: string): void {
    const [r, g, b] = hexToRgb(color);
    for (const [ox, oy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      this.blendLine(x0 + ox, y0 + oy, x1 + ox, y1 + oy, r, g, b, 0.24);
    }
    this.line(x0, y0, x1, y1, color);
  }

  /** Walk a line blending each pixel toward a colour rather than replacing it. */
  private blendLine(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    r: number,
    g: number,
    b: number,
    alpha: number
  ): void {
    let px = Math.round(x0);
    let py = Math.round(y0);
    const ex = Math.round(x1);
    const ey = Math.round(y1);

    const dx = Math.abs(ex - px);
    const dy = -Math.abs(ey - py);
    const sx = px < ex ? 1 : -1;
    const sy = py < ey ? 1 : -1;
    let err = dx + dy;

    for (;;) {
      if (px >= 0 && py >= 0 && px < this.width && py < this.height) {
        const offset = (py * this.width + px) * 3;
        this.data[offset] += Math.round((r - this.data[offset]) * alpha);
        this.data[offset + 1] += Math.round((g - this.data[offset + 1]) * alpha);
        this.data[offset + 2] += Math.round((b - this.data[offset + 2]) * alpha);
      }
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

  public applyScanlines(strength = 0.18): void {
    const keep = 1 - strength;
    for (let y = 0; y < this.height; y += 2) {
      for (let x = 0; x < this.width; x++) {
        const offset = (y * this.width + x) * 3;
        this.data[offset] = Math.round(this.data[offset] * keep);
        this.data[offset + 1] = Math.round(this.data[offset + 1] * keep);
        this.data[offset + 2] = Math.round(this.data[offset + 2] * keep);
      }
    }
  }

  public commit(): void {
    // Buffer is read directly.
  }
}

export function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** Minimal PNG encoder - truecolour, 8-bit, no filtering. */
export function encodePng(width: number, height: number, rgb: Uint8Array): Buffer {
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 3 + 1);
    raw[rowStart] = 0; // filter type: none
    Buffer.from(rgb.subarray(y * width * 3, (y + 1) * width * 3)).copy(raw, rowStart + 1);
  }

  const chunk = (type: string, payload: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(payload.length, 0);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), payload]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([length, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}
