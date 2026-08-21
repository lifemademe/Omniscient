/**
 * Renders the camera feed to a standalone page, so it can be LOOKED at.
 *
 * The feed lives three phases into mission 08, behind a chase that has to be solved to
 * reach it - which makes "does this read as a street" an expensive question to ask in the
 * editor and a cheap one to ask here. Same renderer, same colours, same monospace grid.
 */
import { writeFileSync } from 'node:fs';

import { DISTRICT_CITY } from '../../src/omniscient/content/district-07.js';
import { FEED_W, feedToHtml, renderFeed } from '../../src/omniscient/art/asciiFeed.js';

const shots: Array<{ title: string; html: string }> = [];
const cams = DISTRICT_CITY.cameras.slice(0, 3);

for (const [i, cam] of cams.entries()) {
  shots.push({
    title: `CAM ${String(200 + i * 10)} - idle, no suspect (what the player sees before choosing)`,
    html: feedToHtml(renderFeed(DISTRICT_CITY, cam, { clock: 1.5, label: `2${String(i)}0`, since: 6 })),
  });
}
for (const t of [0, 0.35, 0.7, 1]) {
  shots.push({
    title: `REVIEW - the car crossing, ${String(Math.round(t * 100))}% through`,
    html: feedToHtml(
      renderFeed(DISTRICT_CITY, cams[0], { clock: 2 + t, suspect: t, label: '200', since: 6 })
    ),
  });
}
shots.push({
  title: 'NO SIGNAL - past the ring, where coverage runs out',
  html: feedToHtml(renderFeed(DISTRICT_CITY, { x: 0, y: 0 }, { clock: 1, dead: true, label: '--' })),
});

const page = `<!doctype html><meta charset="utf-8"><title>feed</title>
<style>
  body { background:#050a07; color:#3f6b4a; font-family:ui-monospace,Consolas,monospace; padding:18px; }
  h2 { font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:#3f6b4a; margin:22px 0 6px; }
  .box { border:1px solid #1a2f21; background:#070d0a; padding:6px 8px; display:inline-block; }
  pre { margin:0; font-size:15px; line-height:1; letter-spacing:0; white-space:pre; }
</style>
${shots.map((s) => `<h2>${s.title}</h2><div class="box"><pre>${s.html}</pre></div>`).join('\n')}
`;
const out = process.argv[2] ?? 'feed-look.html';
writeFileSync(out, page, 'utf-8');
console.log(`${String(shots.length)} shots, ${String(FEED_W)} columns -> ${out}`);
