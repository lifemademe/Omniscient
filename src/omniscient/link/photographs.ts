/**
 * The photographs in Ileana's shoebox, drawn as data URIs for the console.
 *
 * ## Why these exist
 *
 * §131 asks the environment to carry usable evidence, and Ileana's room was the one that
 * did not. The box, the letters and the tide line all say something ABOUT the problem -
 * this house has been flooded, she has stopped, there is no paper left to check her
 * against - and none of them hand the player a single thing they can act on. Reported
 * exactly that way: the shoebox pulses when you open the hint and there is nothing to do
 * with it.
 *
 * So the box gives up its contents. The hint about it already described these in prose -
 * names pencilled on the backs, two different hands, years apart, and neither of them put
 * down how anybody was related - and this turns that paragraph into five objects the
 * player can pick up and turn over.
 *
 * ## The line they must not cross
 *
 * A photograph gives a NAME and a FACE and nothing else. The moment one says
 * "grandmother", Ileana stops being necessary and the request collapses: the whole of it
 * is that the family never wrote the relationships down because they already knew them,
 * and she is the last person who does. The photographs tell you who exists. Only she can
 * tell you how they join up.
 *
 * Age is the one extra thing they carry, and it is carried the way a photograph carries
 * it - in the hair, and only for the two who were old when these were taken. That is
 * atmosphere and a light nudge, not an answer: knowing Sofia was old does not tell you
 * she is the grandmother rather than the great-aunt, and the board offers both.
 *
 * ## Drawn in the console's own light
 *
 * Not photographs of a room - prints seen through a green phosphor screen, because that
 * is where the player is looking. Everything is one hue at different values, which is
 * also what makes the white hair legible as the brightest thing on the card.
 */

import { createRng, seedFrom } from '../core/rng.js';

import type { Rng } from '../core/rng.js';

/** A person in the box. Authored in the mission - see MissionHint.photographs. */
export interface PhotoSpec {
  id: string;
  /** Pencilled on the back. Developer-authored; drawn as text, never as markup. */
  name: string;
  /**
   * Roughly how old they look in the picture, 0 young to 1 old.
   *
   * Only reaches the hair. See the note above on why it must not reach anything else.
   */
  age?: number;
}

/** Both faces of one print, as data URIs ready for an img element. */
export interface PhotoPlate {
  id: string;
  name: string;
  front: string;
  back: string;
}

const W = 132;
const H = 168;

/** Phosphor, at the values the console already uses. */
const INK = {
  card: '#1a2b1f',
  cardEdge: '#2f5738',
  paper: '#22331f',
  figureDark: '#31543a',
  hairDark: '#24402b',
  hairWhite: '#cfe9b4',
  skin: '#7cb082',
  pencil: '#a8d69a',
  smudge: 'rgba(140, 190, 130, 0.16)',
};

function card(ctx: CanvasRenderingContext2D, rng: Rng): void {
  ctx.fillStyle = INK.card;
  ctx.fillRect(0, 0, W, H);

  // A white border, because every print in a shoebox this old has one.
  ctx.strokeStyle = INK.cardEdge;
  ctx.lineWidth = 7;
  ctx.strokeRect(3.5, 3.5, W - 7, H - 7);

  // Corner wear. Four rounded nibbles, uneven, so no two prints match.
  ctx.fillStyle = INK.card;
  for (const [cx, cy] of [[0, 0], [W, 0], [0, H], [W, H]]) {
    ctx.beginPath();
    ctx.arc(cx, cy, 4 + rng() * 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * The face. Shape first, at the size it will actually be seen.
 *
 * These render about 90 pixels tall on the console, which is the same trap the meter face
 * on the Kestrel-3 fell into twice - detail authored at a size nobody sees. So: a head, a
 * pair of shoulders, a hair mass and two eye marks. Everything else would be mud.
 */
function portrait(ctx: CanvasRenderingContext2D, rng: Rng, age: number): void {
  const cx = W / 2 + (rng() - 0.5) * 6;
  const headY = H * 0.42;
  const headR = 26 + rng() * 3;

  ctx.fillStyle = INK.paper;
  ctx.fillRect(9, 9, W - 18, H - 18);

  // Shoulders, cropped by the lower edge of the print.
  ctx.fillStyle = INK.figureDark;
  ctx.beginPath();
  ctx.ellipse(cx, H * 0.98, headR * 2.1, headR * 1.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = INK.skin;
  ctx.beginPath();
  ctx.ellipse(cx, headY, headR * 0.82, headR, 0, 0, Math.PI * 2);
  ctx.fill();

  /*
   * The hair, and the only thing age touches.
   *
   * Value rather than shape: white hair on a green screen is simply the brightest mass on
   * the card, which is how it reads at a glance and at this size. Below the halfway mark
   * it is the darkest, so the young and the old are separated by the two ends of the
   * range rather than by a gradient nobody could rank.
   */
  ctx.fillStyle = age > 0.5 ? INK.hairWhite : INK.hairDark;
  ctx.beginPath();
  ctx.ellipse(cx, headY - headR * 0.42, headR * 0.94, headR * 0.72, 0, Math.PI, 0);
  ctx.fill();
  if (age > 0.5) {
    // Pulled back, which is what puts it above the face rather than around it.
    ctx.beginPath();
    ctx.ellipse(cx, headY - headR * 0.1, headR * 0.99, headR * 0.5, 0, Math.PI, 0);
    ctx.fill();
  }

  ctx.fillStyle = INK.figureDark;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + side * headR * 0.33, headY + 1, 2.6, 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // The print's own grain, so five cards do not look like five copies of one.
  ctx.fillStyle = INK.smudge;
  for (let i = 0; i < 90; i++) {
    ctx.fillRect(9 + rng() * (W - 18), 9 + rng() * (H - 18), 1, 1);
  }
}

/**
 * The back, which is the half that matters.
 *
 * Two hands, years apart, exactly as the hint says: the age picks a slant and a weight, so
 * the older names sit at a different angle in a paler pencil than the newer ones. It is
 * the only place in the game where the evidence is somebody's handwriting.
 */
function reverse(ctx: CanvasRenderingContext2D, rng: Rng, name: string, age: number): void {
  ctx.fillStyle = INK.paper;
  ctx.fillRect(9, 9, W - 18, H - 18);

  ctx.fillStyle = INK.smudge;
  for (let i = 0; i < 140; i++) {
    ctx.fillRect(9 + rng() * (W - 18), 9 + rng() * (H - 18), 1, 1);
  }

  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate((rng() - 0.5) * 0.16);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${age > 0.5 ? 'italic ' : ''}20px "Courier New", monospace`;
  // Silver on the older ones, as the hint has always said.
  ctx.fillStyle = INK.pencil;
  ctx.globalAlpha = age > 0.5 ? 0.62 : 0.92;
  ctx.fillText(name, 0, 0);

  // The pencil line under it, the way somebody underlines a name on a photograph.
  const half = ctx.measureText(name).width / 2;
  ctx.globalAlpha *= 0.7;
  ctx.beginPath();
  ctx.moveTo(-half - 3, 14);
  ctx.lineTo(half + 3, 13);
  ctx.strokeStyle = INK.pencil;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}

/**
 * Build both faces of every print in a box.
 *
 * Cached per spec set, because the hints panel re-renders whenever the transcript moves,
 * and regenerating ten canvases on every line of dialogue would be ten canvases per line.
 */
const cache = new Map<string, PhotoPlate[]>();

export function createPhotographs(specs: readonly PhotoSpec[]): PhotoPlate[] {
  const key = specs.map((spec) => `${spec.id}:${spec.name}:${spec.age ?? 0}`).join('|');
  const already = cache.get(key);
  if (already) return already;

  const plates = specs.map((spec) => {
    const age = spec.age ?? 0;
    const draw = (paint: (ctx: CanvasRenderingContext2D, rng: Rng) => void): string => {
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) return '';
      // Same seed for both faces of one print, so the card wear lines up front to back.
      const rng = createRng(seedFrom(`photo:${spec.id}`));
      card(ctx, rng);
      paint(ctx, rng);
      return canvas.toDataURL('image/png');
    };

    return {
      id: spec.id,
      name: spec.name,
      front: draw((ctx, rng) => portrait(ctx, rng, age)),
      back: draw((ctx, rng) => reverse(ctx, rng, spec.name, age)),
    };
  });

  cache.set(key, plates);
  return plates;
}
