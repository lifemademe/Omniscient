/**
 * Every embedded stylesheet's braces must balance.
 *
 * ## The bug this exists to catch
 *
 * A single stray `}` sat in BoardPanel's stylesheet for as long as the pipe puzzle has
 * existed, and it silently deleted the rule that made Vasile's pipe run a grid. His
 * four-by-three board rendered as twelve tiles in one vertical column, and the console
 * looked like that in play for weeks.
 *
 * What makes it worth a check is HOW it fails. A stray `}` at the top level is not skipped:
 * the CSS parser reads it as the beginning of the next rule's prelude, so the selector
 * becomes `} .omni-board__pipes`, which is not a selector, so the whole rule is thrown away.
 * The stylesheet still loads. Every other rule still applies. Exactly one rule vanishes -
 * whichever one had the bad luck to come next - and nothing anywhere reports it.
 *
 * TypeScript cannot see it: the CSS is a template literal. The linter cannot see it. It does
 * not throw, it does not warn, and the only symptom is a layout that looks like somebody
 * wrote the layout badly. It took a screenshot from the player to find.
 *
 * ## Why braces and not a real CSS parse
 *
 * Pulling in a CSS parser to check hand-written strings is more dependency than the problem
 * deserves. Unbalanced braces are the failure mode that actually happens when a stylesheet
 * is edited inside a template literal, and counting them catches it exactly.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Where stylesheets live in this project: `const SOMETHING_CSS = ` + backtick. */
const DECLARATION = /const\s+([A-Z0-9_]*CSS)\s*=\s*`/g;

interface Problem {
  file: string;
  sheet: string;
  line: number;
  why: string;
}

const problems: Problem[] = [];
let sheets = 0;

function scan(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      scan(path);
      continue;
    }
    if (!entry.name.endsWith('.ts')) continue;

    const source = readFileSync(path, 'utf8');
    for (const match of source.matchAll(DECLARATION)) {
      const from = match.index + match[0].length;
      const to = source.indexOf('`;', from);
      if (to < 0) continue;
      sheets += 1;

      // Comments can hold braces that are not structure - `/* } */` is text.
      const css = source.slice(from, to).replace(/\/\*[\s\S]*?\*\//g, '');
      const startLine = source.slice(0, from).split('\n').length;

      let depth = 0;
      let line = startLine;
      for (const ch of css) {
        if (ch === '\n') line += 1;
        else if (ch === '{') depth += 1;
        else if (ch === '}') {
          depth -= 1;
          if (depth < 0) {
            problems.push({
              file: path,
              sheet: match[1],
              line,
              why: 'stray "}" - it will be eaten by the NEXT rule\'s selector and delete it',
            });
            depth = 0;
          }
        }
      }
      if (depth > 0) {
        problems.push({
          file: path,
          sheet: match[1],
          line,
          why: `${depth} rule(s) left open at the end of the sheet`,
        });
      }
    }
  }
}

scan(join('src'));

console.log('\n=== CSS BALANCED ===');
console.log(`  ${sheets} embedded stylesheet(s) checked`);
for (const problem of problems) {
  console.log(`  [FAIL] ${problem.file}:${problem.line} (${problem.sheet}) - ${problem.why}`);
}
if (problems.length === 0) {
  console.log('  [PASS] every embedded stylesheet balances');
  process.exit(0);
}
process.exit(1);
