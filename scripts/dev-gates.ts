/**
 * Nothing that opens the game up for testing may be reachable in a published build.
 *
 * This project has shipped a debug hook twice. POLISH-REVIEW §8 carried "strip debug overlay
 * from the build" as item one for three weeks; the SceneJump strip written to replace that
 * bad practice then became an instance of it; and the Warehouse 07 pass added an
 * unconditional block exposing the post-game bonus mission on the opening globe, with a
 * comment politely asking whoever came next to remember to take it out.
 *
 * The lesson each time was the same and the fix each time was the same - put it behind
 * `ENGINE.isPublishedGame()`, which nobody has to remember on freeze day. What was missing
 * was anything that noticed when somebody did not.
 *
 * So this greps for the hooks by name and insists each one is guarded. It is a text check
 * rather than a type-level one on purpose: the failure mode is a guard being deleted or a
 * new hook being added without one, and both of those are visible in the source.
 *
 *     npx tsx scripts/dev-gates.ts
 */
import { readFileSync } from 'node:fs';

const RIG = 'src/omniscient/OmniscientRig.ts';

/**
 * Every deliberate way in, and the line that must be near it.
 *
 * `window` is how far EITHER SIDE of the hook the guard may sit, and it has to be both
 * directions: a guard can wrap the hook (`if (!published) install(...)`) or sit just inside
 * it as an early return (`if (published) return;`). The first draft only looked backwards
 * and reported the all-missions reveal as ungated when its guard was on the very next line.
 *
 * Kept tight anyway. A generous window would let a check pass on somebody else's guard
 * further up the file, which is the failure mode where this whole script stops being worth
 * running.
 */
const HOOKS: Array<{ what: string; hook: RegExp; window: number }> = [
  { what: 'the scene-jump strip', hook: /installSceneJump\(/, window: 3 },
  { what: 'the F9 warehouse key', hook: /const openWarehouse = \(/, window: 3 },
  { what: 'the all-missions reveal', hook: /private revealEverythingForTesting\(\): void \{/, window: 3 },
  { what: 'the Warehouse 07 globe bypass', hook: /warehouse\.actionLabel = archive\.storyCompleted/, window: 6 },
];

const GUARD = /isPublishedGame\(\)/;

const source = readFileSync(RIG, 'utf8').split(/\r?\n/);
let failures = 0;

for (const { what, hook, window } of HOOKS) {
  const at = source.findIndex((line) => hook.test(line));
  if (at < 0) {
    failures += 1;
    console.log(`  FAIL  ${what}: not found - has it been renamed, or removed without this entry?`);
    continue;
  }
  const near = source.slice(Math.max(0, at - window), at + window + 1);
  if (!near.some((line) => GUARD.test(line))) {
    failures += 1;
    console.log(`  FAIL  ${what} at ${RIG}:${at + 1} is NOT behind isPublishedGame()`);
    continue;
  }
  console.log(`  ok    ${what} is gated (${RIG}:${at + 1})`);
}

/*
 * And the reveal must not be the thing that decides. It borrows the offer loop's hand-out,
 * so if somebody replaces `setSignalState` with a direct field write the "answerable is two
 * conditions" bug comes straight back - a green point on the globe that cannot be clicked.
 */
const body = readFileSync(RIG, 'utf8');
const reveal = body.slice(body.indexOf('private revealEverythingForTesting'));
const method = reveal.slice(0, reveal.indexOf('\n  }'));
if (!/setSignalState\(/.test(method) || !/openable\.add\(/.test(method)) {
  failures += 1;
  console.log('  FAIL  revealEverythingForTesting no longer sets BOTH state and openable');
} else {
  console.log('  ok    the reveal sets state and answerability together');
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
