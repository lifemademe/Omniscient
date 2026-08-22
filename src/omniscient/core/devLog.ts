/**
 * Console output that does not reach a player.
 *
 * ## Why this exists rather than just deleting the calls
 *
 * Three `console.log`s were reaching a shipped build: one per gesture clip loaded, one per
 * rigged contact mounted, and one measuring how far a contact had to step to reach what she
 * was pointing at. All three are genuinely useful and one of them carries a comment saying
 * so - "the result of this experiment is a number, and a number that only exists inside the
 * running game is a number nobody can act on". That argument is right. It is just an
 * argument about a development build.
 *
 * A judge who opens devtools because a jam entry feels slow should find silence, not a
 * running commentary on somebody's animation retargeting. Deleting the lines would answer
 * that and throw away the instrument; this keeps both.
 *
 * ## What is deliberately NOT routed through here
 *
 * `console.warn` and `console.error`. This project uses them for a scene builder that found
 * nothing to bind, a cue that resolved to no prop, a shader that failed to compile - things
 * that are wrong, that a player might report, and that are worth seeing in any build. Those
 * stay where they are and stay loud.
 */

import * as ENGINE from '@gnsx/genesys.js';

/**
 * Log, unless this is a published build.
 *
 * The gate is the engine's own flag rather than a constant in this project, for the reason
 * given at the SceneJump mount: a constant has to be remembered on the day of the freeze, by
 * somebody who has spent that day doing something else. `scripts/ship-clean.ts` asserts
 * that no bare `console.log` comes back to `src/`.
 */
export function devLog(...parts: unknown[]): void {
  if (ENGINE.isPublishedGame()) return;
   
  console.log(...parts);
}
