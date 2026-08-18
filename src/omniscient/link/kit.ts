/**
 * What Tomas has in his bag, drawn.
 *
 * Companion to `photographs`, and the same reasoning: the console can say "terminal
 * block" in text, and a player who does not already know what a terminal block is learns
 * nothing from reading it. Drawing the thing turns the puzzle from vocabulary into
 * looking, which is what it is supposed to be - he can describe every item in the bag and
 * cannot say which one will stop his light going out.
 *
 * Same green phosphor as the photographs, for the same reason: this is a readout of what
 * a man on a mast is holding, relayed down a link at night, not a product catalogue.
 *
 * Shape over detail, hard. These render about 54 pixels square. Anything smaller than a
 * stroke or two is mud at that size - so each item is drawn as its silhouette and the one
 * feature that identifies it, and nothing else.
 */

import { createRng, seedFrom } from '../core/rng.js';

const W = 108;
const H = 108;

const INK = {
  back: '#101d14',
  body: '#3f6b48',
  bright: '#8fbe93',
  hot: '#d8ffb0',
  dark: '#0a140d',
};

type Draw = (ctx: CanvasRenderingContext2D) => void;

/**
 * One drawing per item id.
 *
 * Keyed by id rather than by name so the mission can rename an item - or write it in
 * another voice - without the picture changing underneath it.
 */
const PLATES: Record<string, Draw> = {
  /** A roll of tape, seen at a slight angle: two ellipses and a core. */
  tape: (ctx) => {
    ctx.strokeStyle = INK.bright;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(54, 58, 30, 26, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = INK.dark;
    ctx.beginPath();
    ctx.ellipse(54, 58, 12, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = INK.body;
    ctx.beginPath();
    ctx.ellipse(54, 58, 12, 10, 0, 0, Math.PI * 2);
    ctx.stroke();
    // The loose end, which is the whole reason this reads as tape and not as a washer.
    ctx.strokeStyle = INK.hot;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(83, 52);
    ctx.quadraticCurveTo(96, 62, 88, 78);
    ctx.stroke();
  },

  /** A strip of connector block: a bar with paired holes and screws down it. */
  block: (ctx) => {
    ctx.fillStyle = INK.body;
    ctx.fillRect(18, 42, 72, 30);
    ctx.strokeStyle = INK.bright;
    ctx.lineWidth = 2;
    ctx.strokeRect(18, 42, 72, 30);
    for (let i = 0; i < 4; i++) {
      const x = 27 + i * 18;
      ctx.strokeStyle = INK.hot;
      ctx.beginPath();
      ctx.moveTo(x - 4, 50);
      ctx.lineTo(x + 4, 50);
      ctx.moveTo(x - 4, 64);
      ctx.lineTo(x + 4, 64);
      ctx.stroke();
      ctx.strokeStyle = INK.dark;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, 38);
      ctx.lineTo(x, 42);
      ctx.stroke();
      ctx.lineWidth = 2;
    }
  },

  /** A cartridge fuse: a glass barrel with a metal cap at each end and a thin filament. */
  fuse: (ctx) => {
    ctx.fillStyle = INK.dark;
    ctx.fillRect(30, 46, 48, 22);
    ctx.strokeStyle = INK.bright;
    ctx.lineWidth = 2;
    ctx.strokeRect(30, 46, 48, 22);
    ctx.fillStyle = INK.body;
    ctx.fillRect(18, 44, 14, 26);
    ctx.fillRect(76, 44, 14, 26);
    ctx.strokeStyle = INK.hot;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(32, 57);
    ctx.lineTo(46, 53);
    ctx.lineTo(62, 61);
    ctx.lineTo(76, 57);
    ctx.stroke();
  },

  /** An isolator: a box with a lever, and the lever is the point. */
  isolator: (ctx) => {
    ctx.fillStyle = INK.body;
    ctx.fillRect(26, 34, 56, 48);
    ctx.strokeStyle = INK.bright;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(26, 34, 56, 48);
    // Two terminals, one either side - it SITS BETWEEN two things, which is the job.
    ctx.strokeStyle = INK.bright;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(14, 58);
    ctx.lineTo(26, 58);
    ctx.moveTo(82, 58);
    ctx.lineTo(94, 58);
    ctx.stroke();
    // The handle, thrown to off.
    ctx.strokeStyle = INK.hot;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(54, 62);
    ctx.lineTo(40, 44);
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.fillStyle = INK.dark;
    ctx.beginPath();
    ctx.arc(54, 62, 5, 0, Math.PI * 2);
    ctx.fill();
  },

  /** A hank of flex: three cores, coiled. */
  flex: (ctx) => {
    ctx.strokeStyle = INK.body;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.ellipse(54, 56, 28, 20, 0.3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = INK.bright;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(54, 56, 28, 20, 0.3, 0, Math.PI * 2);
    ctx.stroke();
    // Cut end, three cores showing - what makes it cable rather than rope.
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = i === 1 ? INK.hot : INK.bright;
      ctx.beginPath();
      ctx.moveTo(78, 42 - i * 2);
      ctx.lineTo(92 + i * 2, 30 - i * 6);
      ctx.stroke();
    }
  },

  /** Cable ties: a bundle, one done up. */
  ties: (ctx) => {
    ctx.strokeStyle = INK.body;
    ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(24 + i * 5, 84);
      ctx.lineTo(34 + i * 5, 30);
      ctx.stroke();
    }
    ctx.strokeStyle = INK.hot;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(70, 50, 16, 13, -0.3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = INK.bright;
    ctx.fillRect(58, 58, 10, 8);
  },
};

const cache = new Map<string, string>();

/**
 * A data URI for one item, or null if nothing is drawn for that id.
 *
 * Null rather than a placeholder on purpose: a missing drawing should be a gap the item's
 * name still fills, not a question mark that reads as part of the puzzle.
 */
export function createKitPlate(id: string): string | null {
  const already = cache.get(id);
  if (already !== undefined) return already || null;

  const draw = PLATES[id];
  if (!draw) {
    cache.set(id, '');
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = INK.back;
  ctx.fillRect(0, 0, W, H);
  draw(ctx);

  // The same grain the photographs carry, so the two readouts look like one machine.
  const rng = createRng(seedFrom(`kit:${id}`));
  ctx.fillStyle = 'rgba(140, 190, 130, 0.14)';
  for (let i = 0; i < 90; i++) ctx.fillRect(rng() * W, rng() * H, 1, 1);

  const url = canvas.toDataURL('image/png');
  cache.set(id, url);
  return url;
}
