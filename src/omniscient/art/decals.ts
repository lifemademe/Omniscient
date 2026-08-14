/**
 * Hand-drawn overlays for specific faces of specific props.
 *
 * A decal exists because box UVs are shared across all six faces: anything that belongs to
 * one face only - a rating plate, a bloom of corrosion around one connector - has to be a
 * separate quad or the housing ends up wearing six of them. That constraint happens to
 * match how these things work in life, where the plate was riveted on after the paint and
 * the corrosion arrived a long time after that.
 */

import * as THREE from 'three';

import { clamp01, fbm, smoothstep } from './noise.js';
import { ACCENT } from './palette.js';
import { createDecal } from './surface.js';
import { seedFrom } from '../core/rng.js';

/**
 * The Kestrel-3's rating plate.
 *
 * §131: the world should carry information rather than the dialogue carrying all of it.
 * The set has a name, a power rating and a serial because real equipment does, and because
 * a player who leans in and reads it learns that this is a specific machine somebody has
 * owned for a long time - which is the entire emotional premise of Mirela's request.
 *
 * The print is eroded by the same noise field that wears the paint, so the plate ages with
 * the housing instead of sitting on it looking freshly printed.
 */
export function createRatingPlate(): THREE.CanvasTexture | null {
  return createDecal(512, 160, (ctx, w, h) => {
    // Plate: brushed alloy, a shade lighter than the housing so it separates without
    // becoming the brightest thing on the object.
    ctx.fillStyle = '#8d8b7e';
    ctx.fillRect(0, 0, w, h);

    // Brushing. Horizontal, faint, and only in value - the plate must not gain hue.
    for (let i = 0; i < 260; i++) {
      const y = (i / 260) * h;
      ctx.fillStyle = `rgba(255,255,255,${0.012 + (i % 3) * 0.01})`;
      ctx.fillRect(0, y, w, 1);
    }

    ctx.strokeStyle = 'rgba(30,28,24,0.55)';
    ctx.lineWidth = 5;
    ctx.strokeRect(4, 4, w - 8, h - 8);

    // Rivets at the corners.
    for (const [rx, ry] of [
      [20, 20],
      [w - 20, 20],
      [20, h - 20],
      [w - 20, h - 20],
    ]) {
      ctx.beginPath();
      ctx.arc(rx, ry, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#5a584e';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(rx - 1.5, ry - 1.5, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(220,216,200,0.6)';
      ctx.fill();
    }

    ctx.fillStyle = '#22201c';
    ctx.textBaseline = 'middle';

    ctx.font = 'bold 52px "Arial Narrow", "Helvetica Neue", Arial, sans-serif';
    ctx.fillText('KESTREL-3', 44, 52);

    ctx.font = '26px "Consolas", "Courier New", monospace';
    ctx.fillText('TRANSMITTER  12W  50R', 44, 100);
    ctx.fillText('SN 4471-C', 44, 132);

    // Erode the print and the plate together.
    const image = ctx.getImageData(0, 0, w, h);
    const seed = seedFrom('kestrel-plate');
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const v = y / h;
        const flake = fbm(seed, u, v, { frequency: 14, octaves: 3 });
        const edge = Math.min(u, 1 - u, v, 1 - v);
        // Lifted at the corners, flaked in patches across the middle.
        const lost = clamp01(
          smoothstep(0.6, 0.86, flake) * 0.9 + (1 - smoothstep(0.0, 0.05, edge)) * 0.5
        );
        const p = (y * w + x) * 4;
        image.data[p + 3] *= 1 - lost * 0.85;
      }
    }
    ctx.putImageData(image, 0, 0);
  });
}

/**
 * A bloom of corrosion, for the panel behind connector B.
 *
 * The corroded connector is the answer to Mission 01, and until now it was a small green
 * cylinder - true, but a fact rather than a sight. Corrosion does not stop at the part; it
 * creeps out onto whatever the part is bolted to, and the stain is the thing that tells
 * you it has been happening for years rather than since Tuesday.
 */
export function createCorrosionBloom(seedKey = 'connector-b-bloom'): THREE.CanvasTexture | null {
  return createDecal(256, 256, (ctx, w, h) => {
    const image = ctx.createImageData(w, h);
    const seed = seedFrom(seedKey);

    const crust = { r: 0x9c, g: 0xa4, b: 0x84 };
    const deep = { r: 0x4c, g: 0x60, b: 0x38 };

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const v = y / h;

        // A radius warped by low-frequency noise, so the edge is lobed the way a real
        // stain spreads along whatever the moisture followed.
        const dx = u - 0.5;
        const dy = v - 0.5;
        const warp = fbm(seed, u, v, { frequency: 4, octaves: 3 }) - 0.5;
        const radius = Math.hypot(dx, dy) + warp * 0.16;

        const body = 1 - smoothstep(0.14, 0.42, radius);
        // Speckle: corrosion is granular, never a smooth wash.
        const speck = fbm(seed + 5, u, v, { frequency: 26, octaves: 3 });
        const alpha = clamp01(body * (0.35 + speck * 1.1) - 0.08);

        const mixT = clamp01(speck * 1.3 - 0.15);
        const p = (y * w + x) * 4;
        image.data[p] = deep.r + (crust.r - deep.r) * mixT;
        image.data[p + 1] = deep.g + (crust.g - deep.g) * mixT;
        image.data[p + 2] = deep.b + (crust.b - deep.b) * mixT;
        image.data[p + 3] = alpha * 195;
      }
    }

    ctx.putImageData(image, 0, 0);
  });
}

/** The corrosion colour the bloom is keyed to, so callers can tint matching geometry. */
export const BLOOM_TINT = ACCENT.corrosion;

/**
 * Marker pen on the side of a packing box.
 *
 * §240 wants real content, and a house being cleared is the one place in this game where
 * two words carry more than a paragraph of dialogue could. Ileana is emptying a dead
 * relative's house and sorting photographs of people nobody can name any more; the boxes
 * say KITCHEN and BOOKS and KEEP, and one of them says WHO?, which is her entire request
 * written on cardboard in the corner of the room.
 *
 * Drawn rather than typed onto a texture atlas because each box needs its own word and
 * box UVs are shared by all six faces - a label baked into the material would appear on
 * every side of every box, which is not how anybody has ever packed anything.
 *
 * §232: ink and tape only, over transparent. The card's own value comes from MAT.card and
 * is not touched, so a labelled box sits in exactly the same value group as a blank one.
 */
export function createBoxLabel(text: string, seedKey = text): THREE.CanvasTexture | null {
  return createDecal(256, 128, (ctx, w, h) => {
    const seed = seedFrom(`box-label-${seedKey}`);

    // A strip of parcel tape under the writing, slightly off square. Most of what makes a
    // box read as packed rather than as a crate is the tape, and it costs one rectangle.
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-0.035 + (seed % 1000) / 40000);
    ctx.fillStyle = 'rgba(206,188,150,0.34)';
    ctx.fillRect(-w * 0.46, -h * 0.3, w * 0.92, h * 0.6);
    ctx.strokeStyle = 'rgba(150,132,98,0.3)';
    ctx.lineWidth = 2;
    ctx.strokeRect(-w * 0.46, -h * 0.3, w * 0.92, h * 0.6);
    ctx.restore();

    // The hand. A wide marker nib and a slight tilt: nobody letters a box neatly.
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-0.045);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(34,29,24,0.86)';
    ctx.font = `bold ${text.length > 6 ? 46 : 60}px "Arial Narrow", Arial, sans-serif`;
    ctx.fillText(text, 0, 4);
    ctx.restore();

    // Wear the ink, using the same field that ages everything else in this file.
    const image = ctx.getImageData(0, 0, w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const scuff = fbm(seed + 3, x / w, y / h, { frequency: 18, octaves: 3 });
        const p = (y * w + x) * 4;
        image.data[p + 3] *= 1 - clamp01(smoothstep(0.58, 0.86, scuff)) * 0.55;
      }
    }
    ctx.putImageData(image, 0, 0);
  });
}
