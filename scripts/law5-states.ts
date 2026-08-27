/**
 * Law 5, as a gate: no mechanic may be carried by hue alone.
 *
 * ART-MASTER §11 scores accessibility as the review's lowest item and states the rule, and
 * until now the rule had neither a harness nor a critic - §12.7 says a rule belongs in a
 * harness because that is cheaper and stricter than a judgement, and this one had nothing.
 *
 * ## What it actually checks
 *
 * Wherever a game STATE selects a colour, the states must separate once the colour is taken
 * out. Greyscale luma is the test, because that is what a red-green colourblind player is
 * left with in the worst case and what every player is left with at a squint.
 *
 * It found a real fault the day it was written. The globe carried four signal states in hue
 * alone - and desaturated, the ANOMALY sat 7.6 levels from a contact the player had already
 * helped, while `cooldown` and `unknown` shared a hex outright. The strangest object in the
 * game read as finished business.
 *
 * ## What it deliberately does NOT check
 *
 * Sets where the states also differ in something this script cannot see: a mesh appearing,
 * an emissive multiplier, a glyph, a text label. Those are listed as EXEMPT with the reason,
 * because an over-broad rule gets exempted wholesale and the exemption then hides the real
 * case - see ART-MASTER §15.6 rule 3. An exemption here names its non-hue channel.
 */
import { readFileSync } from 'node:fs';

interface StateSet {
  name: string;
  file: string;
  /** Minimum greyscale separation required between any two states, in luma levels. */
  minSeparation: number;
  /** Matches `<state>` and `<hex>` out of the source. */
  pattern: RegExp;
  expect: number;
}

const SETS: StateSet[] = [
  {
    name: 'globe signal states',
    file: 'src/omniscient/globe/GlobeScreen.ts',
    minSeparation: 18,
    pattern: /\.omni-globe__name--(\w+)\s*\{\s*color:\s*(#[0-9a-fA-F]{6})/g,
    expect: 4,
  },
];

/**
 * Sets that carry a mechanic AND a non-hue channel. Each names the channel, so a future
 * reader can check the claim rather than trust the exemption.
 */
const EXEMPT: Array<[string, string]> = [
  ['warehouse zone buttons', 'the status word is printed in the label: "R // RECEIVING // MOTION"'],
  ['warehouse door buttons', 'status printed in the label, and door identity uses shape glyphs a-triangle / b-bars / c-circle'],
  ['warehouse door lamps', 'emissiveIntensity 1.8 / 0.75 / 0.38 separates them by rendered brightness'],
  ['verified intake lamp', 'emissiveIntensity 0.7 vs 1.8, plus the scanner mesh appearing when state !== idle'],
  ['M4SS growths', 'a dead growth shifts 2px ajar and darkens - it reads broken in silhouette'],
  ['certainty tiers', 'geometry and material detail differ per tier: bounding shape, then real shape, then maps'],
];

function luma(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
}

let failed = 0;

for (const set of SETS) {
  const source = readFileSync(set.file, 'utf8');
  const found = new Map<string, string>();
  for (const match of source.matchAll(set.pattern)) found.set(match[1], match[2]);

  /*
   * §15.6 rule 1: a source-reading check must prove it found something. `ship-clean` printed
   * "no credentials in anything tracked" for months while reading two directories, so every
   * scrape here asserts its own yield before it asserts anything about the values.
   */
  if (found.size !== set.expect) {
    console.log(`  [FAIL] ${set.name} - expected ${set.expect} states, scraped ${found.size}. The pattern has gone stale.`);
    failed += 1;
    continue;
  }

  const entries = [...found.entries()].sort((a, b) => luma(b[1]) - luma(a[1]));
  console.log(`\n${set.name} (${set.file})`);
  for (const [state, hex] of entries) {
    console.log(`    ${state.padEnd(10)} ${hex}  luma ${luma(hex).toFixed(1).padStart(6)}`);
  }

  let worst = Number.POSITIVE_INFINITY;
  let worstPair = '';
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const gap = Math.abs(luma(entries[i][1]) - luma(entries[j][1]));
      if (gap < worst) {
        worst = gap;
        worstPair = `${entries[i][0]} vs ${entries[j][0]}`;
      }
    }
  }
  if (worst < set.minSeparation) {
    console.log(`  [FAIL] ${worstPair} are ${worst.toFixed(1)} levels apart in greyscale, under the ${set.minSeparation} floor`);
    console.log('         Desaturate the game and those two states are the same state.');
    failed += 1;
  } else {
    console.log(`  [PASS] closest pair ${worstPair} at ${worst.toFixed(1)} levels, floor is ${set.minSeparation}`);
  }
}

console.log('\nExempt, each with the channel that carries it instead of hue:');
for (const [name, why] of EXEMPT) console.log(`    ${name.padEnd(24)} ${why}`);

console.log(failed === 0 ? '\nNo mechanic is carried by hue alone.' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
