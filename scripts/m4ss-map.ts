/**
 * Draw a stage as a floor plan, so somebody can look at it.
 *
 * The three harnesses next to this one prove that a level's numbers are consistent - that no
 * sweep eats a wall, that the window is shorter than the corridor, that the air carries what
 * it claims to. None of them can answer the question a level designer actually has, which is
 * whether the thing reads as a room. A list of 56 passing assertions is not a picture.
 *
 * So this emits an SVG: tiles, the circle each growth actually sweeps, the stroke of every
 * press, the beat of every creature, both states of a bridge, and the column. It is not a
 * render - the rig owns that, and what the rig shows you is one screen at a time. This is the
 * whole level at once, which is the one view the game itself can never give you.
 *
 * Everything drawn is read from the level file. There is no second copy of the layout here,
 * so a plan that looks wrong is a level that is wrong.
 *
 *     npx tsx scripts/m4ss-map.ts sluice > plan.svg
 */

import { writeFileSync } from 'node:fs';

import { THE_LAB } from '../src/m4ss/lab.js';
import { THE_SHAFT } from '../src/m4ss/shaft.js';
import { THE_SLUICE } from '../src/m4ss/sluice.js';
import { TUNING } from '../src/m4ss/mass.js';

import type { World } from '../src/m4ss/mass.js';

const STAGES: Record<string, World> = { lab: THE_LAB, shaft: THE_SHAFT, sluice: THE_SLUICE };

const name = process.argv[2] ?? 'sluice';
const world = STAGES[name];
if (!world) {
  console.error(`unknown stage "${name}" - one of ${Object.keys(STAGES).join(', ')}`);
  process.exit(1);
}

const out: string[] = [];
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

out.push(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-70 -50 ${world.width + 140} ${world.height + 100}" width="640">`
);
out.push(`<rect x="-70" y="-50" width="${world.width + 140}" height="${world.height + 100}" fill="#0c1210"/>`);

// -- the architecture ---------------------------------------------------------------------
for (const t of world.tiles) {
  out.push(`<rect x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}" fill="#28302c" stroke="#3f4a44" stroke-width="2"/>`);
}

// -- the column, behind everything that moves ----------------------------------------------
for (const d of world.updrafts ?? []) {
  out.push(
    `<rect x="${d.x}" y="${d.y}" width="${d.w}" height="${d.h}" fill="#d8c070" fill-opacity="0.14" stroke="#d8c070" stroke-dasharray="8 6"/>`
  );
  out.push(
    `<text x="${d.x + d.w / 2}" y="${d.y + 40}" fill="#d8c070" font-size="26" text-anchor="middle" font-family="monospace">lift ${d.liftMass}g</text>`
  );
}

/*
 * The sweeps.
 *
 * A growth with no stated rope is drawn at the full 212px of a 40g reach, because that is the
 * widest circle the level has to be able to survive - and on this plan it is also the thing
 * the beat is about, so it is drawn differently: dashed, in the trap's colour, saying "this
 * radius is the player's choice rather than mine".
 */
const MAX_REACH = 40 * TUNING.reachPerMass;
for (const a of world.anchors) {
  const rope = a.rope ?? MAX_REACH;
  const stated = a.rope !== undefined;
  const hue = a.live === false ? '#b04a3a' : stated ? '#6d8034' : '#c08840';
  out.push(
    `<circle cx="${a.x}" cy="${a.y}" r="${rope}" fill="none" stroke="${hue}" stroke-width="2"` +
      `${stated ? '' : ' stroke-dasharray="10 8"'} stroke-opacity="0.7"/>`
  );
  out.push(`<circle cx="${a.x}" cy="${a.y}" r="9" fill="${hue}"/>`);
  out.push(
    `<text x="${a.x + 14}" y="${a.y - 12}" fill="${hue}" font-size="24" font-family="monospace">${esc(a.id ?? '')}</text>`
  );
}

// -- gates, in both states where there are two ---------------------------------------------
for (const g of world.gates) {
  out.push(`<rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" fill="#4a3a5a" stroke="#7a6a8a" stroke-width="2"/>`);
  if (g.span) {
    out.push(
      `<rect x="${g.span.x}" y="${g.span.y}" width="${g.span.w}" height="${g.span.h}" fill="#4a3a5a" fill-opacity="0.4" stroke="#7a6a8a" stroke-dasharray="10 6"/>`
    );
  }
  const label = g.sieve !== undefined ? `${g.id} <=${g.sieve}g` : (g.id ?? '');
  out.push(
    `<text x="${g.x + g.w / 2}" y="${g.y + g.h + 30}" fill="#9a8aaa" font-size="24" text-anchor="middle" font-family="monospace">${esc(label)}</text>`
  );
}

// -- presses: the stroke, then the head at rest --------------------------------------------
for (const c of world.crushers ?? []) {
  const dx = c.axis === 'x' ? c.travel : 0;
  const dy = c.axis === 'x' ? 0 : c.travel;
  out.push(
    `<rect x="${c.x}" y="${c.y}" width="${c.w + dx}" height="${c.h + dy}" fill="#5a6a7a" fill-opacity="0.22" stroke="#5a6a7a" stroke-dasharray="6 6"/>`
  );
  out.push(`<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" fill="#7a8a9a"/>`);
}

// -- buttons -------------------------------------------------------------------------------
for (const b of world.buttons) {
  const hue = b.force ? '#e07a3a' : '#7ad0a0';
  out.push(`<circle cx="${b.x}" cy="${b.y}" r="${b.radius}" fill="${hue}" fill-opacity="0.8"/>`);
  const label = b.force ? `${b.id} ${b.force}px/s` : (b.id ?? '');
  out.push(
    `<text x="${b.x}" y="${b.y - b.radius - 10}" fill="${hue}" font-size="24" text-anchor="middle" font-family="monospace">${esc(label)}</text>`
  );
}

// -- creatures: the beat, and where it starts ----------------------------------------------
for (const c of world.critters ?? []) {
  out.push(
    `<line x1="${c.from}" y1="${c.y - c.h / 2}" x2="${c.to}" y2="${c.y - c.h / 2}" stroke="#e0605a" stroke-width="4"/>`
  );
  out.push(`<rect x="${c.x - c.w / 2}" y="${c.y - c.h}" width="${c.w}" height="${c.h}" fill="#e0605a"/>`);
}

// -- the two fixed points ------------------------------------------------------------------
out.push(`<circle cx="${world.start.x}" cy="${world.start.y}" r="18" fill="#8fd0ff"/>`);
out.push(
  `<text x="${world.start.x}" y="${world.start.y - 28}" fill="#8fd0ff" font-size="26" text-anchor="middle" font-family="monospace">START</text>`
);
out.push(`<circle cx="${world.exit.x}" cy="${world.exit.y}" r="18" fill="#ffe08f"/>`);
out.push(
  `<text x="${world.exit.x}" y="${world.exit.y - 28}" fill="#ffe08f" font-size="26" text-anchor="middle" font-family="monospace">EXIT</text>`
);

/*
 * The screen, drawn where the camera can actually put it.
 *
 * The single most useful line on this plan, because it is the constraint every M4SS level is
 * bent around and the only one that is invisible in a coordinate list: the camera moves in Y
 * and nothing else, so the frame is always the full 1280 wide and 720 tall. A beat that reads
 * beautifully on a plan and spans 900 vertical pixels is a beat the player sees in two halves.
 */
const FRAME_H = Math.round(1280 / (16 / 9));
for (let y = 0; y + FRAME_H <= world.height; y += FRAME_H) {
  out.push(
    `<rect x="0" y="${y}" width="${world.width}" height="${FRAME_H}" fill="none" stroke="#ffffff" stroke-opacity="0.16" stroke-dasharray="20 16"/>`
  );
}

out.push('</svg>');

const path = `plan-${name}.svg`;
writeFileSync(path, out.join('\n'), 'utf8');
console.log(`${path} - ${world.width}x${world.height}, ${world.tiles.length} tiles, ${world.anchors.length} growths`);
