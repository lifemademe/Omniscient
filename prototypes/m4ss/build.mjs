/**
 * Inline everything into one HTML file you can double-click.
 *
 * ES modules are blocked over file:// by every browser's CORS rules, so a play.html that
 * imported sim.mjs would fail to load for anybody who opened it the obvious way - which is
 * how a prototype gets judged as broken when it is only unserved.
 *
 * The simulation stays a real module for verify.mjs to import. This strips the export
 * keywords and concatenates, so there is still exactly one copy of the physics and no way
 * for the played version and the measured version to disagree.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const here = (name) => new URL(`./${name}`, import.meta.url);
const read = (name) => readFileSync(here(name), 'utf8');

/** `export function x` -> `function x`, `export const X` -> `const X`, and drop imports. */
function flatten(source) {
  return source
    .replace(/^import[^;]+;\s*$/gm, '')
    .replace(/^export (function|const|class|let)\b/gm, '$1')
    .replace(/^export \{[^}]*\};?\s*$/gm, '');
}

const html = `<!doctype html>
<meta charset="utf-8">
<title>M4SS - reach prototype</title>
<style>
  html, body {
    margin: 0;
    height: 100%;
    background: #0c0a14;
    color: #cfe9d2;
    font: 13px/1.5 "Courier New", monospace;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
  }
  canvas { border: 1px solid #2c2a3f; image-rendering: pixelated; max-width: 98vw; }
  p { margin: 0; opacity: 0.65; max-width: 1280px; }
</style>
<canvas id="screen" width="1280" height="720"></canvas>
<p>
  Reach a growth point you cannot afford and the tendril parts, and whatever was strung
  along it stays there. Eat the yellow biomass to buy more reach. Green rings are in range,
  red ones are not.
</p>
<script>
${flatten(read('sim.mjs'))}
${flatten(read('level.mjs'))}
${flatten(read('game.js'))}
</script>
`;

writeFileSync(here('play.html'), html);
console.log('  play.html written - open it in a browser');
