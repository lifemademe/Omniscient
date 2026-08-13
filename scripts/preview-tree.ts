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

import { writeFileSync } from 'node:fs';

import { GrowthStage, KnowledgeTree } from '../src/omniscient/crt/KnowledgeTree.js';

import { BufferSurface, encodePng } from './lib/pixel-preview.js';

const CELL_W = 192;
const CELL_H = 144;
const COLS = 4;
const ROWS = 2;
const GUTTER = 4;

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
