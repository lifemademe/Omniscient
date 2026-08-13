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
  HintView,
  InterventionSurface,
  PlayerMessage,
  RecordView,
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
/* Tabs: CHAT / HINTS / RECORDS. §162 - the phone changes tool mode as the mission asks. */
.omni-tabs {
  display: flex;
  border-bottom: 1px solid #23422c;
}
.omni-tab {
  flex: 1;
  padding: 7px 4px;
  background: transparent;
  border: none;
  border-right: 1px solid #1a2f21;
  color: #4f9a5e;
  font: inherit;
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  cursor: pointer;
}
.omni-tab:last-child { border-right: none; }
.omni-tab:hover { color: #7fe08a; }
.omni-tab--active { color: #d8ffb0; background: #10251a; }
.omni-tab__count { opacity: 0.6; }
/* Hint and record rows. */
.omni-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  margin-bottom: 6px;
  background: #0d1c14;
  border: 1px solid #23422c;
  color: #cfe6c4;
  font: inherit;
  font-size: 12px;
  line-height: 1.4;
  cursor: pointer;
}
.omni-item:hover { border-color: #4f9a5e; color: #d8ffb0; }
.omni-item--static { cursor: default; }
.omni-item--static:hover { border-color: #23422c; color: #cfe6c4; }
.omni-item__meta {
  display: block;
  font-size: 9px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #4f9a5e;
  margin-top: 4px;
}
.omni-item__detail {
  display: block;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid #1e3a28;
  color: #8fbe93;
}
.omni-item--mine { border-left: 2px solid #c9a227; }
/* Words the player can use back. Bright enough to notice while skimming. */
.omni-key { color: #d8ffb0; font-weight: bold; }
/* Leave the request / back to the machine. */
.omni-back {
  background: transparent;
  border: 1px solid #2b5c39;
  color: #4f9a5e;
  font: inherit;
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 3px 10px;
  cursor: pointer;
}
.omni-back:hover { border-color: #4f9a5e; color: #d8ffb0; }
.omni-empty {
  color: #3f6b48;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 10px;
}
/* Confirmation and failure. */
.omni-confirm { padding: 10px; border-top: 1px solid #23422c; }
.omni-confirm__q { display: block; color: #d8ffb0; font-size: 13px; margin-bottom: 8px; }
.omni-confirm__row { display: flex; gap: 8px; }
.omni-confirm__btn {
  padding: 5px 18px;
  background: transparent;
  border: 1px solid #4f9a5e;
  color: #7fe08a;
  font: inherit;
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
}
.omni-confirm__btn:hover { background: #14301f; color: #d8ffb0; }
.omni-failure {
  padding: 10px;
  border-top: 1px solid #6b2f28;
  background: #1a0e0c;
  color: #d99b8f;
  font-size: 12px;
  line-height: 1.45;
}
.omni-failure__title {
  display: block;
  color: #c2483a;
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  margin-bottom: 5px;
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

type Tab = 'chat' | 'hints' | 'records';

export class LocalSurface implements InterventionSurface {
  public readonly kind = 'local' as const;

  private root: HTMLDivElement | null = null;
  private logElement: HTMLDivElement | null = null;
  private inputElement: HTMLInputElement | null = null;
  private contactElement: HTMLSpanElement | null = null;
  private hintElement: HTMLDivElement | null = null;
  private tabsElement: HTMLDivElement | null = null;
  private panelElement: HTMLDivElement | null = null;
  private extraElement: HTMLDivElement | null = null;

  private readonly handlers = new Set<(message: PlayerMessage) => void>();
  private renderedCount = 0;
  private tab: Tab = 'chat';
  private lastState: SurfaceState | null = null;

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

    // Stepping out of a request. §97: a contact can be left waiting and returned to -
    // the player should never feel trapped in a conversation.
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'omni-back';
    back.textContent = '‹ Globe';
    back.addEventListener('click', () => this.dispatch({ kind: 'leave' }));

    const contact = document.createElement('span');
    contact.className = 'omni-terminal__contact';
    head.append(back, contact);

    const tabs = document.createElement('div');
    tabs.className = 'omni-tabs';

    const log = document.createElement('div');
    log.className = 'omni-terminal__log';

    // HINTS and RECORDS render here; the chat log is hidden while they are open.
    const panel = document.createElement('div');
    panel.className = 'omni-terminal__log';
    panel.style.display = 'none';

    // Confirmation prompt or failure notice, above the input.
    const extra = document.createElement('div');

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

    root.append(head, tabs, log, panel, extra, foot);
    this.container.appendChild(root);

    // Enter-to-submit. ENGINE.Input has onChange but no submit event, which is one of
    // the reasons this surface is hand-built.
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      // After a loss the field is for the player's own note, not for the contact.
      this.dispatch(
        this.lastState?.failure ? { kind: 'note', text } : { kind: 'text', text }
      );
    });

    this.root = root;
    this.logElement = log;
    this.inputElement = input;
    this.contactElement = contact;
    this.hintElement = hint;
    this.tabsElement = tabs;
    this.panelElement = panel;
    this.extraElement = extra;
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
    this.lastState = state;

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

    // A new line arriving means something happened in the conversation - go back to it.
    if (state.transcript.length > 0 && this.tab !== 'chat' && state.confirming) {
      this.tab = 'chat';
    }

    this.renderTabs(state);
    this.renderPanel(state);
    this.renderExtra(state);

    // While confirming or writing a note, the free-text field is not the way in.
    const typing = state.awaitingInput && !state.confirming;
    this.inputElement.disabled = !typing;
    this.inputElement.placeholder = state.failure ? 'write yourself a note...' : 'transmit...';

    this.logElement.scrollTop = this.logElement.scrollHeight;
    if (typing) this.inputElement.focus();
  }

  private renderTabs(state: SurfaceState): void {
    if (!this.tabsElement) return;

    const specs: Array<{ id: Tab; label: string; count?: number }> = [
      { id: 'chat', label: 'Chat' },
      { id: 'hints', label: 'Hints', count: state.hints?.length ?? 0 },
      { id: 'records', label: 'Records', count: state.records?.length ?? 0 },
    ];

    this.tabsElement.replaceChildren();
    for (const spec of specs) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `omni-tab${this.tab === spec.id ? ' omni-tab--active' : ''}`;
      button.textContent = spec.label;

      if (spec.count !== undefined) {
        const count = document.createElement('span');
        count.className = 'omni-tab__count';
        count.textContent = ` ${spec.count}`;
        button.appendChild(count);
      }

      button.addEventListener('click', () => {
        this.tab = spec.id;
        if (this.lastState) this.present(this.lastState);
      });
      this.tabsElement.appendChild(button);
    }
  }

  private renderPanel(state: SurfaceState): void {
    if (!this.panelElement || !this.logElement) return;

    const showingChat = this.tab === 'chat';
    this.logElement.style.display = showingChat ? 'flex' : 'none';
    this.panelElement.style.display = showingChat ? 'none' : 'flex';
    if (showingChat) return;

    this.panelElement.replaceChildren();

    if (this.tab === 'hints') {
      const hints = state.hints ?? [];
      if (hints.length === 0) {
        this.panelElement.appendChild(this.renderEmpty('nothing observed yet'));
        return;
      }
      for (const hint of hints) {
        this.panelElement.appendChild(this.renderHint(hint));
      }
      return;
    }

    const records = state.records ?? [];
    if (records.length === 0) {
      this.panelElement.appendChild(this.renderEmpty('no records for this contact'));
      return;
    }
    for (const record of records) {
      this.panelElement.appendChild(this.renderRecord(record));
    }
  }

  /**
   * Write text into a parent, emphasising the words the player can use back.
   *
   * Builds text nodes and <strong> elements rather than assigning innerHTML, so the
   * safe-UI rule holds with no exception carved out for "trusted" content.
   */
  private appendEmphasised(parent: HTMLElement, text: string, keywords?: string[]): void {
    if (!keywords || keywords.length === 0) {
      parent.appendChild(document.createTextNode(text));
      return;
    }

    // Longest first, so "aerial lead" wins over "aerial" when both are listed.
    const ordered = [...keywords].sort((a, b) => b.length - a.length);
    let rest = text;

    while (rest.length > 0) {
      let bestIndex = -1;
      let bestWord = '';

      for (const word of ordered) {
        const index = rest.toLowerCase().indexOf(word.toLowerCase());
        if (index >= 0 && (bestIndex === -1 || index < bestIndex)) {
          bestIndex = index;
          bestWord = word;
        }
      }

      if (bestIndex === -1) {
        parent.appendChild(document.createTextNode(rest));
        return;
      }

      if (bestIndex > 0) {
        parent.appendChild(document.createTextNode(rest.slice(0, bestIndex)));
      }
      const mark = document.createElement('strong');
      mark.className = 'omni-key';
      mark.textContent = rest.slice(bestIndex, bestIndex + bestWord.length);
      parent.appendChild(mark);

      rest = rest.slice(bestIndex + bestWord.length);
    }
  }

  private renderHint(hint: HintView): HTMLElement {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'omni-item';

    const summary = document.createElement('span');
    this.appendEmphasised(summary, hint.summary, hint.keywords);
    item.appendChild(summary);

    if (hint.detail) {
      const detail = document.createElement('span');
      detail.className = 'omni-item__detail';
      this.appendEmphasised(detail, hint.detail, hint.keywords);
      item.appendChild(detail);
    } else {
      const meta = document.createElement('span');
      meta.className = 'omni-item__meta';
      meta.textContent = 'open to look closer';
      item.appendChild(meta);
    }

    item.addEventListener('click', () => this.dispatch({ kind: 'hint', hintId: hint.id }));
    return item;
  }

  private renderRecord(record: RecordView): HTMLElement {
    const item = document.createElement('div');
    item.className = `omni-item omni-item--static${record.playerWritten ? ' omni-item--mine' : ''}`;

    const label = document.createElement('span');
    label.textContent = record.label;
    item.appendChild(label);

    const meta = document.createElement('span');
    meta.className = 'omni-item__meta';
    meta.textContent = record.playerWritten ? 'your note' : record.source;
    item.appendChild(meta);

    return item;
  }

  private renderEmpty(text: string): HTMLElement {
    const empty = document.createElement('div');
    empty.className = 'omni-empty';
    empty.textContent = text;
    return empty;
  }

  private renderExtra(state: SurfaceState): void {
    if (!this.extraElement) return;
    this.extraElement.replaceChildren();

    if (state.confirming) {
      const box = document.createElement('div');
      box.className = 'omni-confirm';

      const question = document.createElement('span');
      question.className = 'omni-confirm__q';
      question.textContent = state.confirming.question;
      box.appendChild(question);

      const row = document.createElement('div');
      row.className = 'omni-confirm__row';
      for (const [label, accepted] of [
        ['Yes', true],
        ['No', false],
      ] as const) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'omni-confirm__btn';
        button.textContent = label;
        button.addEventListener('click', () => this.dispatch({ kind: 'confirm', accepted }));
        row.appendChild(button);
      }
      box.appendChild(row);
      this.extraElement.appendChild(box);
      return;
    }

    if (state.failure) {
      const box = document.createElement('div');
      box.className = 'omni-failure';

      const title = document.createElement('span');
      title.className = 'omni-failure__title';
      title.textContent = 'request lost';

      const body = document.createElement('span');
      body.textContent = state.failure.summary;

      box.append(title, body);
      this.extraElement.appendChild(box);
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
