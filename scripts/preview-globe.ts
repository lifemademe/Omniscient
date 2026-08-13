/**
 * Headless render of the globe, for visual review without the editor.
 *
 * Same approach as preview-tree: the real GlobeView drawing against a pixel buffer, so
 * what is rendered here is exactly what the CRT shows in game.
 *
 * Usage:  pnpm exec tsx scripts/preview-globe.ts
 */

import { writeFileSync } from 'node:fs';

import { GlobeView, SignalState } from '../src/omniscient/crt/GlobeView.js';

import { BufferSurface, encodePng } from './lib/pixel-preview.js';

import type { Signal } from '../src/omniscient/crt/GlobeView.js';

const CELL_W = 192;
const CELL_H = 144;
const COLS = 4;
const GUTTER = 4;

/** Portu Vech is fictional; these put it on the Black Sea coast. */
const SIGNALS: Signal[] = [
  {
    id: 'mirela',
    latitude: 44.2,
    longitude: 28.6,
    label: 'PORTU VECH - "it worked yesterday"',
    state: SignalState.Waiting,
  },
  {
    id: 'tomas',
    latitude: 44.3,
    longitude: 28.7,
    label: 'PORTU VECH - HARBOUR BEACON - INTERMITTENT',
    state: SignalState.Waiting,
  },
  // §52: tease requests that are not implemented. They make the world bigger for free.
  { id: 'tease-1', latitude: 35.7, longitude: 139.7, label: 'TOKYO - UNKNOWN SIGNAL', state: SignalState.Waiting },
  { id: 'tease-2', latitude: 6.5, longitude: 3.4, label: 'LAGOS - URGENT', state: SignalState.Waiting },
  { id: 'tease-3', latitude: -33.9, longitude: 151.2, label: 'SYDNEY - ANIMAL PROBLEM', state: SignalState.Resolved },
  // §169: the anomaly. Barely visible, never explained.
  { id: 'anomaly', latitude: 12.0, longitude: -80.0, label: 'UNKNOWN SOURCE', state: SignalState.Unknown },
];

/** Four moments: rotating, with the anomaly caught on its rare frame in the last one. */
const FRAMES: Array<{ rotate: number; pulse: number; selected: string | null }> = [
  { rotate: 0, pulse: 0.3, selected: null },
  { rotate: 2.2, pulse: 0.3, selected: 'mirela' },
  { rotate: 4.4, pulse: 0.9, selected: null },
  { rotate: 6.0, pulse: 0.05, selected: null },
];

const sheetW = COLS * CELL_W + (COLS + 1) * GUTTER;
const sheetH = CELL_H + 2 * GUTTER;
const sheet = new Uint8Array(sheetW * sheetH * 3);

FRAMES.forEach((frame, index) => {
  const surface = new BufferSurface(CELL_W, CELL_H);
  const globe = new GlobeView(surface, SIGNALS);
  globe.advance(frame.rotate, 1);
  globe.draw(frame.pulse, frame.selected);

  const originX = GUTTER + index * (CELL_W + GUTTER);
  for (let y = 0; y < CELL_H; y++) {
    for (let x = 0; x < CELL_W; x++) {
      const src = (y * CELL_W + x) * 3;
      const dst = ((GUTTER + y) * sheetW + (originX + x)) * 3;
      sheet[dst] = surface.data[src];
      sheet[dst + 1] = surface.data[src + 1];
      sheet[dst + 2] = surface.data[src + 2];
    }
  }

  console.log(`frame ${index + 1}: rotation=${frame.rotate} pulse=${frame.pulse} selected=${frame.selected ?? '-'}`);
});

const outPath = 'assets/screenshots/globe-frames.png';
writeFileSync(outPath, encodePng(sheetW, sheetH, sheet));
console.log(`\nWrote ${outPath} (${sheetW}x${sheetH})`);
