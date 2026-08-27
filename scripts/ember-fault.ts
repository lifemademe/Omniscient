/**
 * The ember fault, as a gate: a signal that exists and is too small to reach the screen.
 *
 * ART-MASTER Law 5 has a second failure mode that is not about hue, and it has its own
 * incident. A dead growth in M4SS carried a red coal meaning "this cannot be used yet". It
 * was authored 4x3 pixels on a 160px sprite. The sprite reaches the screen at about half size
 * and then passes through a retro grid at 2.4, so the coal arrived at 0.83 of one device
 * pixel. The playtest report was "the unavailable growths don't have the red centre that they
 * should have". They did. Nobody could see it.
 *
 * That is a whole class of bug, invisible three ways: the source looks correct, a code review
 * sees a fillRect, and a screenshot shows nothing missing because there is nothing there to
 * notice. Only the arithmetic catches it.
 *
 *   device pixels = authored px x DISPLAY_RATIO / RETRO_GRID
 *
 * ## Why a floor of 2 rather than 1
 *
 * One device pixel can be swallowed whole depending on where the feature lands in the grid's
 * sampling. Two survives placement. Three is legible as a shape rather than a dot, which is
 * why anything the player must READ rather than merely notice is held higher.
 *
 * ## Scope
 *
 * Everything is reported; only MECHANIC features fail. An over-broad rule gets exempted
 * wholesale and the exemption then hides the real case - ART-MASTER §15.6 rule 3. Decoration
 * being sub-pixel is a waste, not a bug, and printing its number is enough.
 */
import { readFileSync } from 'node:fs';

/** RETRO_LOOKS.machine.pixel in art/retroShader.ts - the look M4SS runs. */
const RETRO_GRID = 2.4;
/** A 160px sprite reaches the screen at roughly half its authored size. */
const DISPLAY_RATIO = 0.5;
const SPRITE = 160;

const NOTICE_FLOOR = 2.0;
const READ_FLOOR = 3.0;

/**
 * Features that carry a MECHANIC - something the player must act on.
 *
 * Keyed by the VARIABLE NAME, and the first version of this file keyed it by the fraction
 * instead. That version passed its own canary: shrinking the ember back toward the original
 * changed the key, the entry stopped matching, the feature silently reclassified itself as
 * decoration, and the gate reported green on exactly the bug it exists to catch. A check
 * keyed on the value it polices disappears the moment that value is wrong.
 *
 * The names are also asserted present below, so renaming or deleting one fails loudly rather
 * than quietly shrinking what is being checked.
 */
const MECHANIC: Record<string, { what: string; floor: number }> = {
  core: { what: 'dead-growth ember - this growth cannot be used yet', floor: NOTICE_FLOOR },
  /*
   * NOTICE, not READ, and the distinction is the whole calibration. It measures 2.83 device
   * px - above the notice floor, below the read one - so which floor applies decides whether
   * this is a bug. The player never has to READ the pane; they have to notice a growth is
   * dead, and THREE channels say so: the sprite shifts 2px ajar, the whole object darkens,
   * and the ember sits in the pane. The pane is one voice in that chorus, not the sentence.
   *
   * Recorded rather than rounded away: at 2.83 it is close to the line, so anything that
   * shrinks this sprite or coarsens the grid puts it under.
   */
  paneW: { what: 'lantern pane - the dead/live face of a growth', floor: NOTICE_FLOOR },
};

const source = readFileSync('src/m4ss/stageArt.ts', 'utf8');
const pattern = /const (\w+)\s*=[^;]*?size \* (0\.\d+)/g;
const found = [...source.matchAll(pattern)].map((m) => ({ name: m[1], fraction: m[2] }));

/*
 * ART-MASTER §15.6 rule 1: prove the scrape found something. ship-clean reported "no
 * credentials in anything tracked" for months while reading two directories.
 */
if (found.length < 4) {
  console.log(`  [FAIL] scraped only ${found.length} sprite features - the pattern has gone stale`);
  process.exit(1);
}

let failed = 0;

for (const name of Object.keys(MECHANIC)) {
  if (!found.some((f) => f.name === name)) {
    console.log(`  [FAIL] declared mechanic feature "${name}" is no longer in stageArt.ts`);
    console.log('         Either it was renamed and this registry is stale, or the signal is gone.');
    failed += 1;
  }
}

console.log(`M4SS sprite features (sprite ${SPRITE}px, display x${DISPLAY_RATIO}, retro grid ${RETRO_GRID})\n`);

const seen = new Set<string>();
for (const { name, fraction } of found) {
  if (seen.has(name)) continue;
  seen.add(name);
  const authored = SPRITE * Number(fraction);
  const device = (authored * DISPLAY_RATIO) / RETRO_GRID;
  const mech = MECHANIC[name];
  const label = `${name} = size * ${fraction}`.padEnd(26);
  const sizes = `${authored.toFixed(1).padStart(6)}px -> ${device.toFixed(2).padStart(5)} device px`;

  if (!mech) {
    console.log(`    ${label} ${sizes}   decoration`);
    continue;
  }
  if (device < mech.floor) {
    console.log(`  [FAIL] ${label} ${sizes}   ${mech.what}`);
    console.log(`         Floor is ${mech.floor} device px. The signal exists and cannot be seen.`);
    failed += 1;
  } else {
    console.log(`  [PASS] ${label} ${sizes}   ${mech.what} (floor ${mech.floor})`);
  }
}

console.log(`\nFor reference, the original ember: 4.0px -> ${((4 * DISPLAY_RATIO) / RETRO_GRID).toFixed(2)} device px.`);
console.log(failed === 0 ? 'Every mechanic-carrying sprite feature survives the grid.' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
