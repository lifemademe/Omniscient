/**
 * Every cue a mission fires must land on something.
 *
 * ## Why this exists
 *
 * `applyCue` warns to the console and returns `{}` when a cue names a prop, an action or a
 * shot that was never registered. That is the right runtime behaviour - a missing gesture
 * should not take the game down mid-call - and it is exactly why these are invisible: the
 * mission plays, the beat advances, the line is said, and the thing the player was supposed
 * to WATCH simply does not happen. Nobody notices until somebody plays that one branch and
 * wonders why nothing moved.
 *
 * The failure mode is a typo, and it is one edit away at all times. Adding a valve to the
 * cellar this session meant writing `prop.turn:valve` in a mission file and `registerProp
 * ('valve', ...)` in a scene file, which are 3,700 lines apart in different directories,
 * and nothing but care connects the two strings.
 *
 * ## Why it reads source rather than running the game
 *
 * The scene builders need a WebGL context, a document and the engine's asset pipeline. This
 * check has to run in CI and on a shell, so it parses instead: it pulls every cue out of
 * `content/`, every registration out of `view/scenes.ts`, and crosses them.
 *
 * That makes it a LINT, not a proof - it cannot see a prop registered through a computed
 * name. Every registration in the project is a literal, and if that ever stops being true
 * this will say so loudly rather than quietly passing, which is the correct direction to
 * fail in.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const CONTENT = join('src', 'omniscient', 'content');
const SCENES = join('src', 'omniscient', 'view', 'scenes.ts');
const GESTURES = join('src', 'omniscient', 'view', 'gestures.ts');

const scenes = readFileSync(SCENES, 'utf8');
const gestures = readFileSync(GESTURES, 'utf8');

/** `scene.registerProp('lids', ...)` and `scene.registerShot('covers', {`. */
function literalIds(source: string, call: string): Set<string> {
  const found = new Set<string>();
  const pattern = new RegExp(`${call}\\(\\s*'([^']+)'`, 'g');
  for (const match of source.matchAll(pattern)) found.add(match[1]);
  return found;
}

/**
 * Ids built from a template - `run-${material}`, `edging-${side}`.
 *
 * Six of these exist, all of them a literal prefix followed by one interpolation over a
 * small fixed set. Resolving the set means parsing the enclosing loop, which is more
 * machinery than this check is worth; instead the PREFIX is collected, and a cue whose
 * target starts with one is accepted.
 *
 * That is a stated hole - `prop.x:run-banana` would pass - and it is still worth having,
 * because the prefix is the half that gets renamed, while the suffix comes from an array
 * three lines away that the author is looking at while they write the cue.
 */
function templatePrefixes(source: string, call: string): string[] {
  const found: string[] = [];
  const pattern = new RegExp(call + '\\(\\s*`([a-z0-9-]+-)\\$\\{', 'g');
  for (const match of source.matchAll(pattern)) found.push(match[1]);
  return found;
}

const props = literalIds(scenes, 'scene\\.registerProp');
/*
 * Lighting beats, registered the same way props and shots are.
 *
 * Added with the `light` domain - and added HERE at the same time, because the header of this
 * file says a new verb in the grammar has to be taught to the checker in the same change. A
 * verb the harness does not know is a verb it silently passes.
 */
const lightBeats = literalIds(scenes, 'scene\\.registerLightBeat');
const shots = literalIds(scenes, 'scene\\.registerShot');
const propPrefixes = templatePrefixes(scenes, 'scene\\.registerProp');

/**
 * Action names, per prop, are harder: they are keys of an `actions` object that follows the
 * registration. Rather than parse TypeScript, collect every action key declared anywhere and
 * check the cue's action against that set - so a cue naming an action no scene implements is
 * caught, while a cue naming a real action on the wrong prop is not.
 *
 * That is a deliberate limit and it is where the value is: typos are the failure, and a typo
 * produces a name that exists nowhere.
 */
const actions = new Set<string>(['highlight', 'point']);
/*
 * The contact gestures come from their own list, not from the syntax.
 *
 * Every rigged contact used to register these as four literal keys, which this file scraped
 * with the pattern below - and the moment they were built from CONTACT_GESTURES instead, the
 * scrape found nothing and thirty-odd `prop.nod:contact` cues across seven missions reported
 * as missing. The harness was reading the SHAPE of the code rather than the fact it encodes.
 *
 * Reading the list is both more robust and more correct: a gesture is playable because it is
 * in CONTACT_GESTURES, which is exactly what this now checks.
 */
for (const match of gestures.matchAll(/^export const CONTACT_GESTURES = \[([^\]]*)\]/gm)) {
  for (const name of match[1].matchAll(/'([a-z][a-zA-Z0-9-]*)'/g)) actions.add(name[1]);
}
/*
 * Any parameter list, not just `(tweener`. The first version of this required the first
 * parameter to be named `tweener` and reported `closer: (_tweener, node) =>` as missing -
 * a false alarm on the very first run, which is exactly how a check like this loses its
 * authority. Match the shape of the declaration, never the author's naming.
 */
for (const match of scenes.matchAll(/^\s{4,8}'?([a-z][a-z0-9-]*)'?:\s*\([^)]*\)\s*=>/gm)) {
  actions.add(match[1]);
}

interface Problem {
  file: string;
  cue: string;
  why: string;
}

const problems: Problem[] = [];
let checked = 0;

for (const name of readdirSync(CONTENT).filter((f) => f.endsWith('.ts'))) {
  const source = readFileSync(join(CONTENT, name), 'utf8');
  /*
   * Cues live in `environment:`, `framing:` and `gesture:` fields, sometimes built by
   * concatenation across lines. Pulling every single-quoted string that looks like a cue
   * catches them all without having to know which field it came from.
   */
  for (const match of source.matchAll(
    /'((?:camera|prop|light)\.[a-z-]+:[a-z0-9-]+(?:@[\d.]+)?(?:\s*,\s*[a-z]+\.[a-z-]+:[a-z0-9-]+(?:@[\d.]+)?)*)'/g
  )) {
    for (const raw of match[1].split(',').map((c) => c.trim())) {
      checked += 1;
      /*
       * `prop.steady:beacon@2.8` - the delay suffix, stripped before resolution.
       *
       * Worth more than a line of code. The pattern above used to end at `[a-z0-9-]+`, and a
       * quoted string is matched WHOLE - so the first cue in the game to carry a delay did
       * not fail this check, it vanished from it. The harness went on reporting 191 cues
       * checked and green, having quietly stopped looking at the one that had just changed.
       *
       * A validator that skips what it does not understand is worse than one that rejects
       * it, because the output looks identical to success. Any future addition to the cue
       * grammar has to be added here at the same time.
       */
      const cue = raw.replace(/@[\d.]+$/, '');
      const [head, target] = cue.split(':');
      const [domain, action] = head.split('.');

      if (domain === 'camera') {
        if (!shots.has(target)) problems.push({ file: name, cue, why: `no shot '${target}'` });
        continue;
      }

      /*
       * Cues the RIG answers, which never reach a scene and therefore have no prop.
       *
       * `applyEnvironmentCue` intercepts these by prefix before handing the remainder over -
       * `unit.take` hands the player a vehicle, `game.launch` hands the screen to M4SS - and
       * its own comment explains why the interception has to happen before the scene sees
       * anything. This check knew none of that and had been reporting `game.launch:m4ss` as
       * "no prop 'm4ss'" for as long as mission 09 has existed.
       *
       * A standing failure on a green-or-red harness is the same disease as a skipped cue:
       * everybody learns the output is noisy and stops reading it. Either the harness knows
       * about a thing or it should not be checking it.
       */
      if (domain === 'unit' || domain === 'game') continue;

      /*
       * `light.<action>:<id>` - the room's own light, moved by a beat. The action is not
       * checked because ContactScene does not read it either: it is there so the call site
       * reads as English, and the id is what dispatches.
       */
      if (domain === 'light') {
        if (!lightBeats.has(target)) {
          problems.push({ file: name, cue, why: `no light beat '${target}'` });
        }
        continue;
      }

      /*
       * Props are addressed as `propId` or `propId-actionSuffix` - `runPropAction` falls
       * back to splitting on the last hyphen. Accept either resolution, the same way the
       * runtime does, or the check would reject every suffixed cue in the game.
       */
      const split = target.lastIndexOf('-');
      const base = split > 0 ? target.slice(0, split) : '';
      const templated = propPrefixes.some((prefix) => target.startsWith(prefix));
      if (templated) continue;
      if (!props.has(target) && !(base && props.has(base))) {
        problems.push({ file: name, cue, why: `no prop '${target}'` });
        continue;
      }
      const suffix = split > 0 ? target.slice(split + 1) : '';
      const direct = props.has(target);
      const wanted = direct ? action : `${action}-${suffix}`;
      if (!actions.has(wanted) && !wanted.startsWith('highlight')) {
        problems.push({ file: name, cue, why: `no action '${wanted}' on any prop` });
      }
    }
  }
}

console.log('\n=== CUES RESOLVE ===');
console.log(`  ${props.size} props, ${shots.size} shots, ${actions.size} action names`);
console.log(`  ${checked} cues checked across ${readdirSync(CONTENT).filter((f) => f.endsWith('.ts')).length} content files`);

console.log(
  `  ${propPrefixes.length} templated id(s) matched by prefix only: ${propPrefixes.join(', ')}`
);

for (const problem of problems) {
  console.log(`  [FAIL] ${problem.file}: "${problem.cue}" - ${problem.why}`);
}

if (problems.length === 0) {
  console.log('  [PASS] every cue lands on a registered prop, action or shot');
  process.exit(0);
}
process.exit(1);
