/**
 * Headless Knowledge Tree preview.
 *
 * Renders the real production KnowledgeTree code - not a copy - to a PNG contact sheet
 * so growth stages can be reviewed without launching the editor. This matters because
 * editor screenshots are unavailable while play mode is active, so there is otherwise no
 * way to look at the tree at all.
 *
 * Also doubles as the §123 determinism check: the same seed must always produce the same
 * image.
 *
 * Usage:  pnpm exec tsx scripts/preview-tree.ts
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

import { GrowthStage, KnowledgeTree } from '../src/omniscient/crt/KnowledgeTree.js';

import type { PixelSurface } from '../src/omniscient/crt/PixelSurface.js';

const CELL_W = 192;
const CELL_H = 144;
const COLS = 4;
const ROWS = 2;
const GUTTER = 4;
const BACKGROUND: [number, number, number] = [6, 18, 11];

/** RGB pixel buffer implementing the same surface contract as the in-game CRT. */
class BufferSurface implements PixelSurface {
  public readonly data: Uint8Array;

  constructor(
    public readonly width: number,
    public readonly height: number
  ) {
    this.data = new Uint8Array(width * height * 3);
    this.clear();
  }

  public clear(): void {
    for (let i = 0; i < this.width * this.height; i++) {
      this.data[i * 3] = BACKGROUND[0];
      this.data[i * 3 + 1] = BACKGROUND[1];
      this.data[i * 3 + 2] = BACKGROUND[2];
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

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** Minimal PNG encoder - truecolour, 8-bit, no filtering. */
function encodePng(width: number, height: number, rgb: Uint8Array): Buffer {
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

// -- Render the contact sheet -------------------------------------------------------

const SEED = 0x0c151e;
const stages: GrowthStage[] = [
  GrowthStage.Sprout,
  GrowthStage.Sapling,
  GrowthStage.Branching,
  GrowthStage.Interwoven,
  GrowthStage.Canopy,
  GrowthStage.Overgrown,
  GrowthStage.Transcendent,
];

const sheetW = COLS * CELL_W + (COLS + 1) * GUTTER;
const sheetH = ROWS * CELL_H + (ROWS + 1) * GUTTER;
const sheet = new Uint8Array(sheetW * sheetH * 3);

stages.forEach((stage, index) => {
  const surface = new BufferSurface(CELL_W, CELL_H);
  const tree = new KnowledgeTree(surface, {
    seed: SEED,
    stage,
    connections: Math.max(0, stage - GrowthStage.Branching),
    // The alien graft is only legitimate at the final stage (§122).
    alienGraft: stage === GrowthStage.Transcendent,
  });
  tree.draw(1, 0.5);

  const col = index % COLS;
  const row = Math.floor(index / COLS);
  const originX = GUTTER + col * (CELL_W + GUTTER);
  const originY = GUTTER + row * (CELL_H + GUTTER);

  for (let y = 0; y < CELL_H; y++) {
    for (let x = 0; x < CELL_W; x++) {
      const src = (y * CELL_W + x) * 3;
      const dst = ((originY + y) * sheetW + (originX + x)) * 3;
      sheet[dst] = surface.data[src];
      sheet[dst + 1] = surface.data[src + 1];
      sheet[dst + 2] = surface.data[src + 2];
    }
  }

  console.log(`${GrowthStage[stage].padEnd(13)} segments=${tree.segmentCount}`);
});

const outPath = 'assets/screenshots/knowledge-tree-stages.png';
writeFileSync(outPath, encodePng(sheetW, sheetH, sheet));
console.log(`\nWrote ${outPath} (${sheetW}x${sheetH})`);
