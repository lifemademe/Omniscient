/**
 * Renders the intervention terminal to a standalone HTML file for visual review.
 *
 * Uses the shipping TERMINAL_CSS and a real SessionController playthrough, so the
 * preview cannot drift from the game: the styles are the same constant and the dialogue
 * is whatever the mission actually produces.
 *
 * Exists because editor screenshots are unavailable while play mode is active (§208),
 * and the terminal only exists at runtime.
 *
 * Usage:  pnpm exec tsx scripts/preview-terminal.ts
 */

import { writeFileSync } from 'node:fs';

import { MIRELA } from '../src/omniscient/content/contacts.js';
import { MISSION_01 } from '../src/omniscient/content/mission-01-transmitter.js';
import { KnowledgeStore } from '../src/omniscient/knowledge/KnowledgeStore.js';
import { TERMINAL_CSS } from '../src/omniscient/link/LocalSurface.js';
import { SessionController } from '../src/omniscient/session/SessionController.js';

import type {
  InterventionSurface,
  PlayerMessage,
  SurfaceState,
} from '../src/omniscient/link/surface.js';

/** Minimal HTML escaping. The game itself uses textContent and never needs this. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// -- Drive a real session -------------------------------------------------------------

let handler: ((message: PlayerMessage) => void) | null = null;
let latest: SurfaceState | null = null;

const surface: InterventionSurface = {
  kind: 'local',
  connected: true,
  attach: async () => {},
  detach: () => {},
  present: (state) => {
    latest = state;
  },
  onMessage: (h) => {
    handler = h;
    return () => {
      handler = null;
    };
  },
};

const session = new SessionController(surface, new KnowledgeStore(0x0c151e));
session.start(MISSION_01, MIRELA);

const type = (text: string): void => {
  if (!handler) throw new Error('surface handler was never registered');
  handler({ kind: 'text', text });
};

['show me the unit', 'take the power off', 'look at the connectors'].forEach(type);

const state: SurfaceState = latest!;

// -- Emit the page --------------------------------------------------------------------

const lines = state.transcript
  .map((entry) => {
    const who =
      entry.source === 'system'
        ? ''
        : `<span class="omni-line__who">${escapeHtml(entry.name)}</span>`;
    return `      <div class="omni-line omni-line--${entry.source}">${who}<span>${escapeHtml(entry.body)}</span></div>`;
  })
  .join('\n');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>OMNISCIENT_ terminal</title>
<style>
  html, body { margin: 0; background: #0b0c0a; }
  /*
   * Fixed 1280x720 stage. The terminal sizes itself in viewport units against the game
   * canvas, so previewing it in an arbitrary pane would misrepresent the layout.
   */
  .stage {
    position: relative;
    width: 520px;
    height: 660px;
    overflow: hidden;
    background:
      radial-gradient(ellipse at 32% 30%, #4a4636 0%, #24261f 55%, #14150f 100%);
  }
${TERMINAL_CSS}
  /* Preview only: sized against the fixed stage rather than the real viewport. */
  .omni-terminal { right: 20px; bottom: 20px; top: 20px; left: 20px; width: auto; height: auto; }
</style>
</head>
<body>
  <div class="stage">
    <div class="omni-terminal">
      <div class="omni-terminal__head">
        <span>OMNISCIENT_</span>
        <span class="omni-terminal__contact">${escapeHtml(state.contactName)}</span>
      </div>
      <div class="omni-terminal__log">
${lines}
      </div>
      <div class="omni-terminal__foot">
        <div class="omni-terminal__hint">${escapeHtml(state.hint ?? '')}</div>
        <div class="omni-terminal__entry">
          <span class="omni-terminal__caret">&gt;</span>
          <input class="omni-terminal__input" type="text" placeholder="transmit..." value="clean the corrosion off the pins">
        </div>
      </div>
    </div>
  </div>
</body>
</html>
`;

const outPath = 'assets/screenshots/terminal-preview.html';
writeFileSync(outPath, html, 'utf8');
console.log(`Wrote ${outPath} (${state.transcript.length} transcript lines)`);
