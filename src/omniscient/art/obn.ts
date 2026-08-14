/**
 * The Omniscient Broadcast Network, on paper.
 *
 * ## Why these are drawn rather than generated
 *
 * §240: legible text is authored canvas decals with real content, never generated
 * lettering. Procedural "writing" - noise shaped into glyph-like marks - fails in a
 * specific and expensive way: it reads as text at a glance, so the player leans in, and
 * then it resolves into nothing and they learn the world does not reward looking. Every
 * word below is a word. It says what it says, and a player who walks up to the pinboard
 * finds out that OMNISCIENT_ lives above a radio station that broadcasts a shipping
 * forecast at six and takes requests at half five, and that somebody logged the harbour
 * beacon going out at 03:40.
 *
 * ## What has to read at fifty pixels
 *
 * The board is roughly 300 x 240 real pixels in the home shot and each note is about a
 * fifth of that. Nothing written here is legible at that size, and pretending otherwise
 * is how you get a wall of grey mush. So every note carries ONE graphic idea that reads
 * as a shape - a ruled timetable, a coastline, a tally grid, a photograph, a circled
 * number - and the text is underneath it for the lean-in. The shapes are the composition;
 * the words are the reward.
 *
 * That also sets the hierarchy: one large sheet (the schedule) anchors the board and the
 * rest are smaller. Seven equal rectangles was the problem the board already had.
 *
 * ## §232, and the one place a contrast budget has to bend
 *
 * Text is local value contrast by definition - that is what makes it text. The budget is
 * therefore stated on the note's MEAN value rather than its range: ink at #3a352c on
 * paper at #c4bda6, with ink coverage under about 12% of any sheet, leaves each note
 * averaging within a few percent of the flat MAT.paper it replaces. So the board still
 * sits in the value group the palette put it in, and only somebody close enough to read
 * it ever sees the range.
 *
 * The ink is deliberately off black and the paper deliberately off white. Either one at
 * its limit would put the strongest value contrast in the room on a note above the desk,
 * where §230 has already decided the strongest value contrast belongs to the window.
 */

import * as THREE from 'three';

import { ACCENT } from './palette.js';
import { createDecal } from './surface.js';
import { createRng, seedFrom } from '../core/rng.js';

import type { Rng } from '../core/rng.js';

/**
 * The stationery, and where its variation is allowed to live.
 *
 * Eight sheets of the same off-white read as eight sheets of the same off-white, which is
 * how the first attempt at this board came out. But §232 will not pay for value variation
 * on eight rectangles in the middle of the frame - so the range is in HUE and saturation
 * instead, which is free. Bond paper, a manila card, a yellowed telex roll and a
 * photographic print are four different colours at the same value, and that is enough to
 * make them four different documents.
 */
const STOCK = {
  /** Matched to MAT.paper, so a note sits exactly where the flat sheet sat. */
  bond: '#c4bda6',
  /** Better paper. What a printed card is on. */
  card: '#cbc3ac',
  /** Telex roll. Yellowed, because it always is. */
  roll: '#c7b78e',
  /** Manila. Warmer and a shade down - the working stock, for forms nobody reprints. */
  manila: '#bcae8c',
  /** Photographic paper, which is the whitest thing on the board and the only cool one. */
  print: '#cec8b4',
} as const;

/** Off black. See the §232 note above. */
const INK = '#3a352c';
const INK_FAINT = 'rgba(58,53,44,0.42)';

const SANS = '"Arial Narrow", "Helvetica Neue", Arial, sans-serif';
const MONO = 'Consolas, "Courier New", monospace';
const HAND = 'Georgia, "Times New Roman", serif';

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

/**
 * Lay down a sheet of paper, then let the caller print on it.
 *
 * The aging is two things and no more: a soft darkening in from the edges, because paper
 * on a board discolours from the outside, and a handful of foxing specks. Deliberately
 * almost nothing - the discipline from `plasterMaps` applies at this scale too, and a
 * heavily distressed note stops being a document and becomes a texture.
 */
function sheet(seedKey: string, tint: string, draw: Draw): Draw {
  return (ctx, w, h) => {
    const rng: Rng = createRng(seedFrom(seedKey));

    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, w, h);

    // Darker in from every edge.
    const inset = Math.min(w, h) * 0.16;
    for (const [x, y, gw, gh, x1, y1] of [
      [0, 0, inset, h, inset, 0],
      [w - inset, 0, inset, h, w - inset, 0],
      [0, 0, w, inset, 0, inset],
      [0, h - inset, w, inset, 0, h - inset],
    ] as const) {
      const gradient = ctx.createLinearGradient(x, y, x1 || x, y1 || y);
      gradient.addColorStop(0, 'rgba(120,108,84,0.30)');
      gradient.addColorStop(1, 'rgba(120,108,84,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, gw, gh);
    }

    draw(ctx, w, h);

    // Foxing, over the print, because the paper aged after it was written on.
    for (let i = 0; i < 14; i++) {
      const r = 1 + rng() * 2.6;
      ctx.beginPath();
      ctx.arc(rng() * w, rng() * h, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(122,104,72,${0.05 + rng() * 0.09})`;
      ctx.fill();
    }

    // The pin. Drawn rather than modelled: at gameplay distance it is four pixels, and
    // four pixels of geometry costs a draw call to say what four pixels of paint says.
    const px = w * (0.32 + rng() * 0.36);
    const py = h * 0.085;
    ctx.beginPath();
    ctx.arc(px, py, Math.min(w, h) * 0.035, 0, Math.PI * 2);
    ctx.fillStyle = '#6c5f4e';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px - 1.5, py - 1.5, Math.min(w, h) * 0.017, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(226,218,196,0.75)';
    ctx.fill();
  };
}

/** The wordmark. Three letters in a box, which is all a station this size would own. */
function wordmark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.save();
  ctx.fillStyle = INK;
  ctx.fillRect(x, y, size * 2.15, size * 1.15);
  ctx.fillStyle = STOCK.bond;
  ctx.font = `bold ${size * 0.82}px ${SANS}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText('OBN', x + size * 1.075, y + size * 0.62);
  ctx.restore();
}

function rule(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number, weight = 2): void {
  ctx.fillStyle = INK_FAINT;
  ctx.fillRect(x0, y, x1 - x0, weight);
}

/**
 * The broadcast schedule. The anchor of the board and the only sheet big enough to have
 * structure worth reading at distance - five ruled rows is a recognisable shape.
 *
 * 17:30 REQUESTS is the game's own premise sitting on the wall: this is a station where
 * people ring in with problems, which is exactly what the player spends the game doing
 * from the other end of the line.
 */
export function scheduleNote(): THREE.CanvasTexture | null {
  return createDecal(
    512,
    384,
    sheet('obn-schedule', STOCK.bond, (ctx, w, h) => {
      wordmark(ctx, 26, 24, 44);

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = INK;
      ctx.font = `bold 30px ${SANS}`;
      ctx.fillText('BROADCAST', 136, 44);
      ctx.fillText('SCHEDULE', 136, 74);

      rule(ctx, 26, w - 26, 104, 3);

      const rows: ReadonlyArray<readonly [string, string]> = [
        ['06:00', 'SHIPPING FORECAST'],
        ['09:00', 'THE MORNING CALL'],
        ['13:00', 'COAST ROAD REPORT'],
        ['17:30', 'REQUESTS'],
        ['22:00', 'NIGHT SERVICE'],
      ];
      rows.forEach(([time, title], i) => {
        const y = 138 + i * 42;
        ctx.font = `bold 27px ${MONO}`;
        ctx.fillStyle = INK;
        ctx.fillText(time, 30, y);
        ctx.font = `25px ${SANS}`;
        ctx.fillText(title, 148, y);
        if (i < rows.length - 1) rule(ctx, 30, w - 30, y + 20, 1);
      });

      rule(ctx, 26, w - 26, 352, 3);
      ctx.font = `18px ${SANS}`;
      ctx.fillStyle = INK_FAINT;
      ctx.fillText('OMNISCIENT BROADCAST NETWORK', 30, 368);
    })
  );
}

/**
 * The motto card.
 *
 * Printed, centred and letterspaced, because it is the kind of thing an organisation has
 * made up as a card and hands out. It is also the thesis of the whole game stated in four
 * words, which is why it is on the wall of the room the player looks at most.
 */
export function mottoNote(): THREE.CanvasTexture | null {
  return createDecal(
    384,
    204,
    sheet('obn-motto', STOCK.card, (ctx, w, h) => {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      rule(ctx, 44, w - 44, 58, 2);
      ctx.fillStyle = INK;
      ctx.font = `bold 36px ${SANS}`;
      ctx.fillText('T R U S T   B U I L T', w / 2, 96);
      ctx.fillText('O V E R   T I M E', w / 2, 136);
      rule(ctx, 44, w - 44, 166, 2);

      ctx.font = `17px ${SANS}`;
      ctx.fillStyle = INK_FAINT;
      ctx.fillText('OBN', w / 2, 40);
    })
  );
}

/**
 * A telex strip, and the reason it is here.
 *
 * §131 wants the world carrying information. Tomas's harbour beacon goes out for three
 * seconds in every eleven and he rings about it in Mission 02; this is the station log
 * of somebody noticing the same thing at twenty to four in the morning, pinned to a board
 * in a different room. It costs one narrow strip and it makes the four missions look like
 * they happen in one place.
 */
export function telexNote(): THREE.CanvasTexture | null {
  return createDecal(
    448,
    112,
    sheet('obn-telex', STOCK.roll, (ctx, w, h) => {
      // Sprocket holes down both long edges, which is what says teleprinter.
      ctx.fillStyle = 'rgba(70,62,48,0.5)';
      for (let x = 16; x < w - 8; x += 22) {
        for (const y of [9, h - 9]) {
          ctx.beginPath();
          ctx.arc(x, y, 3.1, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = INK;
      ctx.font = `bold 20px ${MONO}`;
      ctx.fillText('OBN 0412  ALL STATIONS', 20, 38);
      ctx.font = `19px ${MONO}`;
      ctx.fillText('HARBOUR LT OUT 0340 +++', 20, 64);
      ctx.fillStyle = INK_FAINT;
      ctx.fillText('NO REPLY FROM KEEPER', 20, 88);
    })
  );
}

/**
 * The relay map.
 *
 * A coastline and three transmitters. Pure shape - it reads as a map from across the
 * room, which is the whole job, and the labels are for whoever gets close. The coast is
 * drawn from a seeded walk rather than a smooth curve, because a hand-inked coastline
 * wanders and a bezier does not.
 */
export function relayMapNote(): THREE.CanvasTexture | null {
  return createDecal(
    320,
    300,
    sheet('obn-map', STOCK.bond, (ctx, w, h) => {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = INK;
      ctx.font = `bold 21px ${SANS}`;
      ctx.fillText('RELAY COVERAGE', 20, 30);
      rule(ctx, 20, w - 20, 44, 2);

      const rng = createRng(seedFrom('obn-map-coast'));
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.beginPath();
      let x = 34;
      let y = 92;
      ctx.moveTo(x, y);
      while (x < w - 26) {
        x += 12 + rng() * 10;
        y += (rng() - 0.42) * 26;
        y = Math.max(70, Math.min(h - 42, y));
        ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Hatching on the seaward side - the map convention for "this bit is water".
      ctx.strokeStyle = INK_FAINT;
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 26; i++) {
        const hx = 30 + i * 11;
        ctx.beginPath();
        ctx.moveTo(hx, h - 34);
        ctx.lineTo(hx + 9, h - 22);
        ctx.stroke();
      }

      // The three relays, and the fact that only two of them work.
      const relays: ReadonlyArray<readonly [number, number, string, boolean]> = [
        [70, 108, 'R1', true],
        [162, 128, 'R2', true],
        [252, 96, 'R3', false],
      ];
      for (const [rx, ry, label, live] of relays) {
        ctx.beginPath();
        ctx.arc(rx, ry, 7, 0, Math.PI * 2);
        ctx.fillStyle = INK;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(rx, ry, 14, 0, Math.PI * 2);
        ctx.strokeStyle = live ? INK : ACCENT.warning;
        ctx.lineWidth = live ? 1.6 : 3.2;
        ctx.stroke();
        ctx.font = `bold 18px ${MONO}`;
        ctx.fillStyle = INK;
        ctx.fillText(label, rx + 20, ry);
      }

      ctx.font = `italic 17px ${HAND}`;
      ctx.fillStyle = ACCENT.warning;
      ctx.fillText('R3 down since spring', 24, h - 60);
    })
  );
}

/**
 * The duty roster. Almost pure texture: a ruled grid with ticks in it reads as a form
 * being kept up, and that is all it needs to do from the desk.
 */
export function rosterNote(): THREE.CanvasTexture | null {
  return createDecal(
    256,
    320,
    sheet('obn-roster', STOCK.manila, (ctx, w, h) => {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = INK;
      ctx.font = `bold 20px ${SANS}`;
      ctx.fillText('DUTY  WK 14', 18, 28);
      rule(ctx, 18, w - 18, 42, 2);

      const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
      const done = [true, true, true, true, false, false, false];
      days.forEach((day, i) => {
        const y = 72 + i * 33;
        ctx.font = `19px ${MONO}`;
        ctx.fillStyle = INK;
        ctx.fillText(day, 20, y);

        ctx.strokeStyle = INK_FAINT;
        ctx.lineWidth = 2;
        ctx.strokeRect(w - 62, y - 12, 24, 24);
        if (done[i]) {
          // A tick, drawn as two strokes rather than a glyph, so it reads as a pen mark.
          ctx.strokeStyle = INK;
          ctx.lineWidth = 3.4;
          ctx.beginPath();
          ctx.moveTo(w - 58, y);
          ctx.lineTo(w - 51, y + 8);
          ctx.lineTo(w - 41, y - 9);
          ctx.stroke();
        }
        rule(ctx, 18, w - 18, y + 16, 1);
      });

      ctx.font = `italic 16px ${HAND}`;
      ctx.fillStyle = INK_FAINT;
      ctx.fillText('nobody for the weekend', 18, h - 20);
    })
  );
}

/**
 * A photograph of the harbour, with the mast in it.
 *
 * The only thing on the board with no words worth reading, and the only warm object -
 * two flat bands and a black upright is enough to be a coast at this size. §241: the
 * board is a value composition before it is a noticeboard, and one small light rectangle
 * with a dark mark in it is what stops the lower half being all text.
 */
export function photoNote(): THREE.CanvasTexture | null {
  return createDecal(
    256,
    224,
    sheet('obn-photo', STOCK.print, (ctx, w, h) => {
      const m = 16;
      const iw = w - m * 2;
      const ih = h - m * 2 - 34;

      // Sky over sea. Both muted: a photograph pinned to a board for years is not vivid.
      const sky = ctx.createLinearGradient(0, m, 0, m + ih * 0.6);
      sky.addColorStop(0, '#9aa7a8');
      sky.addColorStop(1, '#c0bda9');
      ctx.fillStyle = sky;
      ctx.fillRect(m, m, iw, ih * 0.62);
      ctx.fillStyle = '#6f7a76';
      ctx.fillRect(m, m + ih * 0.62, iw, ih * 0.38);

      // The headland, and the mast on it - Tomas's mast, photographed from the town.
      ctx.fillStyle = '#4a4f49';
      ctx.beginPath();
      ctx.moveTo(m, m + ih * 0.66);
      ctx.lineTo(m + iw * 0.34, m + ih * 0.5);
      ctx.lineTo(m + iw * 0.62, m + ih * 0.62);
      ctx.lineTo(m + iw, m + ih * 0.58);
      ctx.lineTo(m + iw, m + ih * 0.62);
      ctx.lineTo(m, m + ih * 0.62);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#33372f';
      ctx.fillRect(m + iw * 0.35, m + ih * 0.16, 4, ih * 0.36);
      ctx.fillRect(m + iw * 0.33, m + ih * 0.14, 9, 6);

      ctx.strokeStyle = 'rgba(60,54,44,0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(m, m, iw, ih);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `italic 21px ${HAND}`;
      ctx.fillStyle = 'rgba(52,46,38,0.8)';
      ctx.fillText('the light, before', w / 2, h - 26);
    })
  );
}

/**
 * The frequency card - and the one red mark on the board.
 *
 * §9 keeps the accents as punctuation. A single ringed number is the eye's entry point
 * into the whole board: it lands there first and then reads outward, which is a cheaper
 * way to compose a wall of paper than arranging the rectangles.
 */
export function frequencyNote(): THREE.CanvasTexture | null {
  return createDecal(
    240,
    264,
    sheet('obn-frequency', STOCK.card, (ctx, w, h) => {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.fillStyle = INK;
      ctx.font = `bold 62px ${SANS}`;
      ctx.fillText('92.4', w / 2, h * 0.42);
      ctx.font = `bold 26px ${SANS}`;
      ctx.fillText('FM', w / 2, h * 0.42 + 46);

      // Ringed by hand, twice round, the way somebody rings something they keep forgetting.
      const rng = createRng(seedFrom('obn-freq-ring'));
      ctx.strokeStyle = ACCENT.warning;
      ctx.lineWidth = 4;
      for (let pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        for (let i = 0; i <= 40; i++) {
          const a = (i / 40) * Math.PI * 2;
          const rx = w * 0.42 + (rng() - 0.5) * 7 + pass * 2;
          const ry = h * 0.24 + (rng() - 0.5) * 6 + pass * 2;
          const px = w / 2 + Math.cos(a) * rx;
          const py = h * 0.46 + Math.sin(a) * ry;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      ctx.fillStyle = INK_FAINT;
      ctx.font = `18px ${SANS}`;
      ctx.fillText('OBN COAST', w / 2, h - 26);
    })
  );
}

/**
 * A torn scrap with a phone number on it. The lowest-information note on the board, and
 * deliberately so - a board where every item is a designed document is a display.
 */
export function scrapNote(): THREE.CanvasTexture | null {
  return createDecal(
    288,
    192,
    sheet('obn-scrap', STOCK.manila, (ctx, w, h) => {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = INK;
      ctx.font = `italic 30px ${HAND}`;
      ctx.fillText('Mirela - sets', 22, 52);
      ctx.font = `bold 34px ${MONO}`;
      ctx.fillText('4471 C', 22, 104);
      ctx.font = `italic 22px ${HAND}`;
      ctx.fillStyle = INK_FAINT;
      ctx.fillText('will look at anything', 22, 150);

      // Torn along the bottom: alpha punched out in a ragged line, so the sheet has one
      // edge that is not a printed rectangle.
      const rng = createRng(seedFrom('obn-scrap-tear'));
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = '#000';
      let x = 0;
      while (x < w) {
        const step = 6 + rng() * 12;
        const bite = 4 + rng() * 13;
        ctx.fillRect(x, h - bite, step + 1, bite);
        x += step;
      }
      ctx.globalCompositeOperation = 'source-over';
    })
  );
}

/**
 * Material for a pinned sheet.
 *
 * NOT `decalMaterial`: that turns depth writing off, which is right for a stain lying on
 * a housing and wrong for eight opaque rectangles overlapping each other - with depth
 * writing off the draw order decides what is on top, and the board turns into a shuffle.
 * These are objects, so they write depth like objects; `alphaTest` handles the torn edges
 * without needing transparency sorting at all, and paper edges are hard anyway.
 */
export function noteMaterial(texture: THREE.CanvasTexture): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.94,
    metalness: 0,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  });
}

/**
 * Where each note is pinned, in board-relative metres. The board is 1.36 x 0.88, so this
 * runs -0.68..0.68 across and -0.44..0.44 up.
 *
 * The first arrangement put four notes along the top and four along the bottom, which
 * from the desk read as two rows with a dark stripe between them - the same spreadsheet
 * failure the hand-placement was written to avoid, achieved a different way. The fix is
 * that things overlap: the schedule runs down past the middle, the frequency card sits
 * dead centre bridging the two clusters, and the corners are left bare because bare
 * corners are what a board looks like and a fully covered one looks like wallpaper.
 *
 * Listed back to front. The big sheet was pinned first and everything else went on top.
 */
export const OBN_NOTES = [
  { id: 'Schedule', texture: scheduleNote, width: 0.44, height: 0.34, at: [-0.4, 0.11] },
  { id: 'RelayMap', texture: relayMapNote, width: 0.28, height: 0.26, at: [0.44, 0.16] },
  { id: 'Motto', texture: mottoNote, width: 0.32, height: 0.17, at: [0.05, 0.3] },
  { id: 'Roster', texture: rosterNote, width: 0.21, height: 0.27, at: [-0.5, -0.24] },
  { id: 'Photo', texture: photoNote, width: 0.24, height: 0.2, at: [-0.22, -0.26] },
  { id: 'Scrap', texture: scrapNote, width: 0.26, height: 0.17, at: [0.42, -0.19] },
  { id: 'Telex', texture: telexNote, width: 0.36, height: 0.09, at: [0.02, 0.14] },
  { id: 'Frequency', texture: frequencyNote, width: 0.19, height: 0.21, at: [0.06, -0.1] },
] as const;
