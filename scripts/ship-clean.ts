/**
 * Is this build fit to hand to a judge?
 *
 * POLISH-REVIEW §8 has "strip debug overlay from the build" as item 1 - ten minutes, free,
 * and fatal if missed. It stayed item 1 for three weeks, and the reason is instructive: the
 * tool that made it necessary was `dev/SceneJump`, which exists precisely so that nobody has
 * to edit the game to reach a scene, "which has twice shipped a debug hook by accident". It
 * mounted unconditionally. A hover strip of eight numbered tabs at the left edge of the
 * window, in every build, one mouse-move from anybody who brings the pointer to the side of
 * the screen - the third instance of the fault the tool was written to prevent.
 *
 * The fix is `ENGINE.isPublishedGame()` rather than a DEV constant, because a constant has to
 * be remembered on the day of the freeze by somebody who is busy. This file is the other
 * half: a constant can be forgotten and a gate can be deleted, so the gate is asserted.
 *
 * It reads source rather than running the game, and that is the right instrument for this
 * question. There is no frame you can capture that proves a debug panel is ABSENT from a
 * build a judge will run - only that it did not appear in the one you looked at.
 *
 *     npx tsx scripts/ship-clean.ts
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

let failures = 0;

function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures += 1;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` - ${detail}` : ''}`);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (path.endsWith('.ts') || path.endsWith('.tsx')) out.push(path);
  }
  return out;
}

const sources = [...walk('src'), ...walk('scripts')];
const read = new Map(sources.map((path) => [path, readFileSync(path, 'utf8')]));

/* ------------------------------------------------------------------ the dev tools */

console.log('\nthe dev tools are behind the published-game gate');

const rig = read.get(join('src', 'omniscient', 'OmniscientRig.ts')) ?? '';
check('the rig was found', rig.length > 0);

/*
 * The entry point is checked alongside the rig, because a dev ROUTE is the same fault as a
 * dev panel. `?game=mirela-procedural` shipped, so a published build would have handed a
 * judge a character test rig instead of the game if they ever typed it.
 */
const entry = read.get(join('src', 'game.ts')) ?? '';
check('the entry point was found', entry.length > 0);

for (const [what, pattern, source] of [
  ['SceneJump', /installSceneJump\(/, rig],
  ['the tuning panel', /new TunePanel\(/, rig],
  ['the procedural character route', /function wantsMirelaProceduralTest/, entry],
] as [string, RegExp, string][]) {
  const match = pattern.exec(source);
  if (!match) {
    // Removed entirely is also a pass. The requirement is "not in a player's build".
    check(`${what} is gated or gone`, true, 'not mounted at all');
    continue;
  }
  /*
   * The gate has to be NEAR the mount, not merely somewhere in a 3500-line file. Six
   * hundred characters is about twenty lines, which comfortably covers a guard, its comment
   * and the call - and is far too short to be satisfied by an unrelated mention elsewhere.
   */
  const window = source.slice(Math.max(0, match.index - 600), match.index + 400);
  check(`${what} is behind isPublishedGame`, /isPublishedGame\(\)/.test(window));
}

/* ----------------------------------------------------------- temporary edits and noise */

console.log('\nnothing temporary is still in the tree');

// Skipping this file, which necessarily contains the marker it is looking for.
const marker = ['TEMP', 'VERIFY'].join('-');
const temp = [...read].filter(([path, text]) => !path.includes('ship-clean') && text.includes(marker));
check('no TEMP-VERIFY markers', temp.length === 0, temp.map(([p]) => p).join(', '));

/*
 * console.log in shipped code, which is a different question from console.warn.
 *
 * `warn` and `error` are how this project reports a scene builder that found nothing or a
 * cue that resolved to no prop - they are meant to be there and they are meant to be seen.
 * A bare `log` is somebody's debugging, and a judge who opens the console to see why the
 * game is slow should not find a running commentary.
 *
 * `scripts/` is exempt: printing IS what a harness does.
 */
const chatty: string[] = [];
for (const [path, text] of read) {
  if (!path.startsWith('src')) continue;
  /*
   * `src/omniscient/dev/` is exempt, and only because everything in it is behind the
   * published-game gate asserted at the top of this file. If that gate ever goes, this
   * exemption is wrong - which is why the two checks live in one harness.
   */
  if (path.includes(join('omniscient', 'dev'))) continue;
  /*
   * And devLog itself, which is the one legitimate call site: it wraps console.log in the
   * same published-game gate and exists so the three logs that WERE reaching a player's
   * console can keep working for whoever is building the game.
   */
  if (path.includes('devLog')) continue;
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (/(?<!\/\/\s*)console\.log\(/.test(line) && !line.trimStart().startsWith('*')) {
      chatty.push(`${path}:${i + 1}`);
    }
  });
}
check('no console.log left in src', chatty.length === 0, chatty.slice(0, 6).join(', '));

/* --------------------------------------------------------------------- secrets */

console.log('\nno credentials in anything tracked');

/*
 * Cheap and worth it. This repository is public, an API key has passed through this
 * project's conversation before, and the cost of finding out after a push is not
 * recoverable - a key in git history is a key that has to be rotated, whatever is done to
 * the branch afterwards.
 *
 * ## It said "anything tracked" and read two directories
 *
 * This check passed for months while a live bearer token sat in a tracked file, and it did
 * so for two independent reasons, either of which was enough:
 *
 *   1. It read `read`, which is src/ and scripts/ filtered to .ts and .tsx. The token was in
 *      `.codex/config.toml` - not either root, not either extension.
 *   2. Its pattern wanted the word BEARER in the NAME: `SOMETHING_BEARER = "..."`. The line
 *      was `Authorization = "Bearer fc37..."`, where the word is in the VALUE. So even
 *      pointed at the file it would have found nothing.
 *
 * The heading claimed the whole tracked tree and the code checked a fraction of it, which is
 * the worst kind of green: it is not that nobody looked, it is that something reported having
 * looked. So the list now comes from `git ls-files` - the actual definition of "tracked" -
 * and the patterns match the shapes a credential takes in a value rather than in a name.
 */
const tracked = execSync('git ls-files', { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean)
  // Binaries cannot hold a pasted token in a form this would find, and reading the asset
  // tree as UTF-8 is slow enough to make people delete the check.
  .filter((path) => !/\.(png|jpg|jpeg|webp|gif|fbx|glb|gltf|mp3|wav|ogg|ttf|otf|woff2?|ktx2|bin|zip)$/i.test(path));

const secrets: string[] = [];
for (const path of tracked) {
  if (path.includes('ship-clean')) continue;
  let text = '';
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    continue;
  }
  if (/\bsk_[a-f0-9]{24,}/i.test(text)) secrets.push(`${path} (sk_ token)`);
  /*
   * A credential in the NAME: SOMETHING_API_KEY = "...".
   *
   * The value has to look like a secret and not like source. A regex character class is the
   * commonest false positive by a distance - `const PATH_TOKEN_CHARACTER = '[A-Za-z0-9_./-]'`
   * matched the first version of this - so anything carrying regex or path punctuation is not
   * a key. A real one is letters, digits, dashes and underscores.
   */
  if (/[A-Za-z_]*(?:API_KEY|SECRET|BEARER|TOKEN|PASSWORD)[A-Za-z_]*\s*[:=]\s*['"][A-Za-z0-9_-]{16,}['"]/i.test(text)) {
    secrets.push(`${path} (inline key)`);
  }
  // A credential in the VALUE: Authorization = "Bearer ...", or a bare UUID against any
  // authorisation-shaped key. This is the shape that got through.
  if (/["'\s]Bearer\s+[A-Za-z0-9._-]{16,}/i.test(text)) secrets.push(`${path} (bearer value)`);
  if (/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(text)
    && /author|token|secret|key|credential/i.test(text)) {
    secrets.push(`${path} (uuid beside an auth word)`);
  }
}
check(
  'no keys or tokens in any tracked file',
  secrets.length === 0,
  [...new Set(secrets)].join(', ')
);

console.log(failures === 0 ? '\nALL CHECKS PASSED\n' : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
