/**
 * Every diorama builder may only name its OWN contact.
 *
 * ## The bug this exists for
 *
 * `ContactKey` - variable `ileanaKey` - and the `DoorWash` that went with it were written
 * for the cleared house, with Ileana's coordinates, and were inserted into
 * `buildRepairShop`. The edit was anchored on `registerProp('door-light')`, which only the
 * repair shop contains, and it asserted the anchor appeared exactly once. That assertion
 * passed and proved the wrong thing: that the anchor was UNIQUE, not that it was in the
 * intended function. A uniqueness check cannot tell you which room you are standing in.
 *
 * The cost was paid twice and neither half was legible as this bug. Mirela's room grew two
 * spotlights aimed at a person standing in a different scene, which read on screen as a
 * bright wash on her pegboard that no fixture could account for - four separate probes went
 * looking for its source among her own lights. And the cleared house never received the
 * fixes it was supposed to have, so five rounds of critique measured a room that did not
 * contain them, and every attempt to close those gaps landed somewhere else entirely.
 *
 * ## What this checks
 *
 * The contact-to-scene map is read from `content/mission-*.ts` rather than typed here, so
 * adding or re-casting a mission cannot leave this gate describing an old cast. For each
 * scene builder, any OTHER contact's name appearing as an identifier is an error.
 *
 * It is deliberately a name check and not a coordinate check. Coordinates are the symptom;
 * the cause is an edit that went into the wrong function, and the reliable tell is that the
 * author knew whose light it was and said so in the name.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const CONTENT = 'src/omniscient/content';
const SCENES = 'src/omniscient/view/scenes.ts';

/** scene id -> the one contact who lives in it, read from the missions. */
function castList(): Map<string, string> {
  const cast = new Map<string, string>();
  for (const file of readdirSync(CONTENT)) {
    if (!/^mission-\d+.*\.ts$/.test(file)) continue;
    const src = readFileSync(join(CONTENT, file), 'utf8');
    const contact = /contactId:\s*'?([A-Za-z_]+)'?/.exec(src);
    const scene = /sceneId:\s*'([a-z-]+)'/.exec(src);
    if (contact && scene) cast.set(scene[1], contact[1].toLowerCase());
  }
  return cast;
}

/** builder function name -> scene id, from the registerBuilder calls. */
function builders(src: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /ContactScene\.registerBuilder\('([a-z-]+)',\s*(\w+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) map.set(m[2], m[1]);
  return map;
}

const src = readFileSync(SCENES, 'utf8');
const cast = castList();
const built = builders(src);
const names = [...new Set(cast.values())];

let failed = 0;
let checked = 0;

// Assert the gate can actually see something, before trusting a green run.
if (cast.size < 8 || built.size < 8) {
  console.error(`[FAIL] gate is blind: ${cast.size} missions, ${built.size} builders`);
  process.exit(1);
}

const lines = src.split('\n');
const starts: Array<{ fn: string; line: number }> = [];
lines.forEach((line, i) => {
  const m = /^function (build\w+)\(/.exec(line);
  if (m) starts.push({ fn: m[1], line: i });
});
starts.push({ fn: '<end>', line: lines.length });

for (let i = 0; i < starts.length - 1; i++) {
  const { fn, line } = starts[i];
  const scene = built.get(fn);
  if (!scene) continue;
  const owner = cast.get(scene);
  if (!owner) continue;
  checked += 1;
  const body = lines.slice(line, starts[i + 1].line);
  for (const other of names) {
    if (other === owner) continue;
    body.forEach((text, offset) => {
      // Identifiers only - prose in comments naming another room is legitimate.
      /*
       * Comments are stripped with indexOf, not a regex, for the same reason the name test
       * is: escapes do not survive being written to this file reliably, and a comment
       * stripper that silently fails turns every mention of another room in prose into a
       * failure. "Same trick as Dorin's door" is a legitimate sentence in Sanda's builder.
       */
      const slashes = text.indexOf("//");
      const code = slashes >= 0 ? text.slice(0, slashes) : text;
      const trimmed = text.trimStart();
      if (trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
      if (code.trim() === "") return;
      /*
       * Plain string scanning, deliberately, with no regex escapes anywhere.
       *
       * The first version used a template literal containing a backslash-b for a word
       * boundary. Inside a template literal that is NOT a word boundary - it is the
       * BACKSPACE escape, U+0008 - so the pattern hunted for a control character and matched
       * nothing. The gate then printed ALL CHECKS PASSED over a file with the fault planted
       * in it on purpose. Only the canary run caught it, which is exactly the failure mode
       * ART-MASTER section 0 describes: a green harness proving nothing.
       *
       * Two layers of quoting had to survive for that pattern to reach disk intact, and they
       * did not. Scanning for the name and testing the character before it needs no escapes
       * and cannot be mangled on the way into the file.
       */
      const lower = code.toLowerCase();
      let at = lower.indexOf(other);
      let found = false;
      while (at >= 0 && !found) {
        const before = at === 0 ? " " : lower[at - 1];
        const isWord =
          (before >= "a" && before <= "z") || (before >= "0" && before <= "9") || before === "_";
        if (!isWord) found = true;
        at = lower.indexOf(other, at + 1);
      }
      if (!found) return;
      console.error(
        `[FAIL] ${fn} (${scene}, ${owner}'s room) names ${other} at scenes.ts:${line + offset + 1}\n` +
          `        ${text.trim().slice(0, 100)}`
      );
      failed += 1;
    });
  }
}

console.log(`scene tenants: ${checked} builders checked against ${names.length} contacts`);
if (failed > 0) {
  console.error(`\n${failed} light or prop named for a contact who does not live in that room.`);
  process.exit(1);
}
console.log('ALL CHECKS PASSED');
