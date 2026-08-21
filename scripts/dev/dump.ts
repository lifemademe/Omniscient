/**
 * Prints the camera feed as plain text, for judging it.
 *
 * The fastest loop there is for this renderer: the picture is characters, so a terminal
 * shows it at full fidelity with no browser, no screenshot and no scaling. Every
 * composition fault found so far - the ladder of cross-street kerbs, the moire on distant
 * walls, the near wall shouting over the road - was visible here first.
 *
 *   npx tsx scripts/dev/dump.ts [howMany]
 */
import { renderFeed } from '../../src/omniscient/art/asciiFeed.js';
import { DISTRICT_CITY } from '../../src/omniscient/content/district-07.js';

const many = Number(process.argv[2] ?? '2');
for (const [i, cam] of DISTRICT_CITY.cameras.slice(0, many).entries()) {
  console.log(`--- CAM ${String(200 + i * 10)} at ${String(cam.x)},${String(cam.y)} ---`);
  for (const row of renderFeed(DISTRICT_CITY, cam, { clock: 1.5, label: 'CAM', since: 6 })) {
    console.log(row.map((c) => c.ch).join(''));
  }
}
