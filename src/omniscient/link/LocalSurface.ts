/**
 * LocalSurface - the on-screen phone.
 *
 * The always-available implementation of §222's intervention surface. Ships regardless
 * of whether the paired-device experiment succeeds, so it is the baseline rather than a
 * fallback.
 *
 * DELIBERATE DEVIATION from the project rule preferring BaseUIComponent widgets: this is
 * authored HTML/CSS. §103 requires important UI to feel like part of the machine rather
 * than "a layer of generic rectangular buttons", and §113 requires it to read as
 * unmistakably OMNISCIENT_. The shipped widgets carry their own visual identity, which
 * is the wrong one here. The project rule explicitly permits raw HTML for a custom look.
 *
 * This is also where §221's CRT treatment lives now that RetroEffect is unavailable on
 * WebGL: scanlines, vignette and phosphor glow are CSS, which composites over the DOM
 * and costs nothing.
 *
 * SAFE UI: every dynamic string goes through textContent. Nothing here uses innerHTML
 * with content, because on a remote surface these strings arrive over the network.
 */

import type {
  InterventionSurface,
  PlayerMessage,
  SurfaceState,
  TranscriptEntry,
} from './surface.js';

const STYLE_ID = 'omniscient-terminal-styles';

/** Exported so the preview tool renders the shipping styles rather than a copy. */
export const TERMINAL_CSS = `
.omni-terminal {
  position: absolute;
  right: 2.5vmin;
  bottom: 2.5vmin;
  width: min(34vw, 420px);
  height: min(62vh, 640px);
  display: flex;
  flex-direction: column;
  background: #0a1710;
  border: 2px solid #2b3b30;
  border-radius: 10px;
  box-shadow: 0 0 0 3px #0d0f0d, 0 18px 44px rgba(0, 0, 0, 0.55);
  font-family: "Courier New", ui-monospace, monospace;
  color: #7fe08a;
  overflow: hidden;
  isolation: isolate;
}
.omni-terminal__head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 10px 12px 8px;
  border-bottom: 1px solid #23422c;
  letter-spacing: 0.08em;
  font-size: 12px;
  color: #4f9a5e;
  text-transform: uppercase;
}
.omni-terminal__contact { color: #d8ffb0; }
.omni-terminal__log {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 13px;
  line-height: 1.45;
  scrollbar-width: thin;
  scrollbar-color: #2b5c39 transparent;
}
.omni-line__who {
  display: block;
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  margin-bottom: 2px;
  opacity: 0.75;
}
.omni-line--contact { color: #cfe6c4; }
.omni-line--contact .omni-line__who { color: #8fbe93; }
.omni-line--omniscient { color: #7fe08a; }
.omni-line--omniscient .omni-line__who { color: #4f9a5e; }
.omni-line--system {
  color: #c9a227;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.omni-terminal__foot {
  border-top: 1px solid #23422c;
  padding: 8px 10px 10px;
}
.omni-terminal__hint {
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #4f9a5e;
  margin-bottom: 6px;
  min-height: 12px;
}
.omni-terminal__entry { display: flex; align-items: center; gap: 6px; }
.omni-terminal__caret { color: #4f9a5e; }
.omni-terminal__input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #d8ffb0;
  font: inherit;
  font-size: 13px;
  caret-color: #7fe08a;
}
.omni-terminal__input::placeholder { color: #3f6b48; }
.omni-terminal__input:disabled { opacity: 0.4; }
/* CRT treatment - §221. Post-process is unavailable on WebGL, so this does the work. */
.omni-terminal::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0) 0px,
    rgba(0, 0, 0, 0) 1px,
    rgba(0, 0, 0, 0.22) 2px,
    rgba(0, 0, 0, 0.22) 3px
  );
  mix-blend-mode: multiply;
}
.omni-terminal::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0) 55%, rgba(0, 0, 0, 0.5) 100%);
}
`;

export class LocalSurface implements InterventionSurface {
  public readonly kind = 'local' as const;

  private root: HTMLDivElement | null = null;
  private logElement: HTMLDivElement | null = null;
  private inputElement: HTMLInputElement | null = null;
  private contactElement: HTMLSpanElement | null = null;
  private hintElement: HTMLDivElement | null = null;

  private readonly handlers = new Set<(message: PlayerMessage) => void>();
  private renderedCount = 0;

  constructor(private readonly container: HTMLElement) {}

  public get connected(): boolean {
    return this.root !== null;
  }

  public async attach(): Promise<void> {
    if (this.root) return;
    this.injectStyles();

    const root = document.createElement('div');
    root.className = 'omni-terminal';

    const head = document.createElement('div');
    head.className = 'omni-terminal__head';
    const title = document.createElement('span');
    title.textContent = 'OMNISCIENT_';
    const contact = document.createElement('span');
    contact.className = 'omni-terminal__contact';
    head.append(title, contact);

    const log = document.createElement('div');
    log.className = 'omni-terminal__log';

    const foot = document.createElement('div');
    foot.className = 'omni-terminal__foot';
    const hint = document.createElement('div');
    hint.className = 'omni-terminal__hint';

    const entry = document.createElement('div');
    entry.className = 'omni-terminal__entry';
    const caret = document.createElement('span');
    caret.className = 'omni-terminal__caret';
    caret.textContent = '>';
    const input = document.createElement('input');
    input.className = 'omni-terminal__input';
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = 'transmit...';
    entry.append(caret, input);
    foot.append(hint, entry);

    root.append(head, log, foot);
    this.container.appendChild(root);

    // Enter-to-submit. ENGINE.Input has onChange but no submit event, which is one of
    // the reasons this surface is hand-built.
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      this.dispatch({ kind: 'text', text });
    });

    this.root = root;
    this.logElement = log;
    this.inputElement = input;
    this.contactElement = contact;
    this.hintElement = hint;
  }

  /**
   * Show or hide the terminal.
   *
   * It is the intervention surface - it belongs on screen when there is somebody to
   * intervene with, and nowhere else. On the main menu it is just a green box.
   */
  public setVisible(visible: boolean): void {
    if (this.root) this.root.style.display = visible ? 'flex' : 'none';
  }

  public detach(): void {
    this.root?.remove();
    this.root = null;
    this.logElement = null;
    this.inputElement = null;
    this.contactElement = null;
    this.hintElement = null;
    this.handlers.clear();
    this.renderedCount = 0;
  }

  public onMessage(handler: (message: PlayerMessage) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private dispatch(message: PlayerMessage): void {
    this.handlers.forEach((handler) => handler(message));
  }

  public present(state: SurfaceState): void {
    if (!this.logElement || !this.contactElement || !this.inputElement || !this.hintElement) {
      return;
    }

    this.contactElement.textContent = state.contactName;
    this.hintElement.textContent = state.hint ?? '';

    // Append only what is new, so the log does not flicker or lose scroll position.
    if (state.transcript.length < this.renderedCount) {
      this.logElement.replaceChildren();
      this.renderedCount = 0;
    }
    for (let i = this.renderedCount; i < state.transcript.length; i++) {
      this.logElement.appendChild(this.renderLine(state.transcript[i]));
    }
    this.renderedCount = state.transcript.length;

    this.inputElement.disabled = !state.awaitingInput;
    this.logElement.scrollTop = this.logElement.scrollHeight;

    if (state.awaitingInput) {
      this.inputElement.focus();
    }
  }

  private renderLine(entry: TranscriptEntry): HTMLElement {
    const line = document.createElement('div');
    line.className = `omni-line omni-line--${entry.source}`;

    if (entry.source !== 'system') {
      const who = document.createElement('span');
      who.className = 'omni-line__who';
      // textContent, never innerHTML - see the file header.
      who.textContent = entry.name;
      line.appendChild(who);
    }

    const body = document.createElement('span');
    body.textContent = entry.body;
    line.appendChild(body);

    return line;
  }

  private injectStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = TERMINAL_CSS;
    document.head.appendChild(style);
  }
}
