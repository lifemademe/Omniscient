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

import { injectConsoleChrome } from './console-chrome.js';
import { audio } from '../audio/ConsoleAudio.js';

import type {
  HintView,
  InterventionSurface,
  PlayerMessage,
  RecordView,
  SurfaceState,
  TranscriptEntry,
} from './surface.js';

import { BoardPanel } from './BoardPanel.js';

const STYLE_ID = 'omniscient-terminal-styles';

/** Exported so the preview tool renders the shipping styles rather than a copy. */
export const TERMINAL_CSS = `
.omni-terminal {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: #0a1710;
  border: 2px solid #2b3b30;
  border-radius: 10px;
  box-shadow: 0 0 0 3px #0d0f0d, 0 18px 44px rgba(0, 0, 0, 0.55);
  font-family: "Courier New", ui-monospace, monospace;
  color: #7fe08a;
  overflow: hidden;
  pointer-events: auto;
  isolation: isolate;
}
.omni-terminal__session {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 8px 12px 0;
  font-size: 9px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #35603f;
}
.omni-terminal__where {
  display: block;
  padding: 0 12px 8px;
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #6a8f72;
  text-align: right;
}
.omni-terminal__head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 4px 12px 8px;
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
/**
 * The conversation sits on the bottom of the panel and grows upward.
 *
 * Top-anchored, an opening line left two thirds of the console empty - a tall dark
 * rectangle between the contact's first sentence and the reply chips, at the exact moment
 * the player is deciding whether this game has anything in it. Every terminal and every
 * messaging app in existence stacks from the bottom for this reason: the newest line is
 * where the eye already is, next to where you type.
 *
 * Done with margin-top on the first child rather than justify-content, because flex-end
 * on a scrolling container puts the overflow out of reach at the top - the messages you
 * scrolled up to find would be the ones you could not reach.
 */
.omni-terminal__log > :first-child {
  margin-top: auto;
}
.omni-line__who {
  display: block;
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  margin-bottom: 2px;
  opacity: 0.75;
}
/**
 * A line arriving.
 *
 * Under 200ms, which is the window where a movement is felt but not watched. Longer and
 * the player is waiting for the interface; shorter and it may as well not be there. The
 * small lift is doing more work than the fade - text that appears at its final position
 * pops, and text that rises into it reads as being placed.
 */
@keyframes omni-line-in {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: none; }
}
.omni-line--arriving {
  /* The both fill-mode matters: without it a line carrying an animation-delay is drawn at
     its FINAL opacity until the delay elapses, which is the one thing the delay exists to
     prevent. */
  animation: omni-line-in 170ms ease-out both;
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
/*
 * A lost request has to announce itself. This used to be a quiet box above the input and
 * a playtester sparked the connector twice without registering that the request had ended
 * - so it now takes the whole panel border, and the surface turns red around it.
 */
.omni-failure {
  padding: 11px;
  border: 1px solid #7d3830;
  border-left: 3px solid #c2483a;
  background: #1a0e0c;
  color: #d99b8f;
  font-size: 12px;
  line-height: 1.45;
}
.omni-terminal--lost {
  border-color: #7d3830;
  box-shadow: 0 0 26px rgba(160, 50, 38, 0.28);
}
.omni-terminal--lost .omni-terminal__hint {
  color: #c2483a;
}
.omni-failure__title {
  display: block;
  color: #c2483a;
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  margin-bottom: 5px;
}
.omni-failure__lesson {
  display: block;
  margin-top: 7px;
  padding-left: 8px;
  border-left: 2px solid #c9a227;
  color: #e0c265;
}
.omni-failure__prompt {
  display: block;
  margin-top: 8px;
  font-size: 10px;
  letter-spacing: 0.06em;
  color: #7a8f80;
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
.omni-suggest {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  margin-bottom: 8px;
}
.omni-suggest__label {
  font-size: 9px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #3f7a4c;
  width: 100%;
  margin-bottom: 1px;
}
.omni-suggest__chip {
  font: inherit;
  font-size: 11px;
  color: #a8f0b6;
  background: rgba(40, 96, 56, 0.4);
  border: 1px solid #2f6b3a;
  border-radius: 11px;
  padding: 3px 9px;
  cursor: pointer;
  text-align: left;
}
.omni-suggest__chip:hover {
  background: rgba(72, 160, 92, 0.55);
  border-color: #7fe08a;
  color: #e6ffe9;
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

/** One readout in the left margin: a label, a segmented meter, a value and a note. */
interface ReadoutCard {
  card: HTMLDivElement;
  meter: HTMLDivElement;
  value: HTMLSpanElement;
  sub: HTMLSpanElement;
}

/**
 * A stable session id for a contact.
 *
 * Derived from the name rather than generated, so it is the same every time that person
 * calls. A number that changes on every reopen is noise pretending to be data.
 */
function sessionIdFor(name: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `CV-${(hash % 0xffff).toString(16).toUpperCase().padStart(4, '0')}`;
}

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
  /** The console frame. Owns the transcript panel rather than the other way round. */
  private shell: HTMLDivElement | null = null;
  private sessionEl: HTMLElement | null = null;
  private whereEl: HTMLElement | null = null;
  private linkCard: ReadoutCard | null = null;
  private trustCard: ReadoutCard | null = null;
  private historyCard: ReadoutCard | null = null;
  private suggestElement: HTMLDivElement | null = null;
  private board: BoardPanel | null = null;
  /** Last rendered suggestion set, so the chips are not rebuilt under the player's cursor. */
  private renderedSuggestKey = '';

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

    const session = document.createElement('div');
    session.className = 'omni-terminal__session';
    const sessionId = document.createElement('span');
    session.appendChild(sessionId);

    const head = document.createElement('div');
    head.className = 'omni-terminal__head';

    // Stepping out of a request. §97: a contact can be left waiting and returned to -
    // the player should never feel trapped in a conversation.
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'omni-back';
    back.textContent = '‹ Close';
    back.addEventListener('click', () => this.dispatch({ kind: 'leave' }));

    const contact = document.createElement('span');
    contact.className = 'omni-terminal__contact';
    head.append(back, contact);

    const where = document.createElement('span');
    where.className = 'omni-terminal__where';

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

    // Example replies. Persistent element rebuilt in place - see renderMarks: replacing
    // clickable children every frame destroys the button between mousedown and mouseup.
    const suggestions = document.createElement('div');
    suggestions.className = 'omni-suggest';

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
    foot.append(suggestions, hint, entry);

    root.append(session, head, where, tabs, log, panel, extra, foot);

    /*
     * The console around the conversation.
     *
     * Built here rather than as a separate widget because it is all one surface: the
     * readouts, the call controls and the transcript are the same instrument, and
     * splitting them would mean two things fighting over the same screen edges.
     */
    const shell = document.createElement('div');
    shell.className = 'omni-cv';

    const top = document.createElement('div');
    top.className = 'omni-cv__top';
    const brand = document.createElement('span');
    brand.className = 'omni-cv__brand';
    brand.textContent = 'Contact View';
    const net = document.createElement('span');
    net.className = 'omni-cv__net';
    const bars = document.createElement('span');
    bars.className = 'omni-cv__bars';
    for (let i = 0; i < 4; i++) bars.appendChild(document.createElement('i'));
    const netName = document.createElement('span');
    netName.textContent = 'Coastal network';
    net.append(bars, netName);
    const secure = document.createElement('span');
    secure.textContent = 'Secure link';
    top.append(brand, net, secure);

    const body = document.createElement('div');
    body.className = 'omni-cv__body';

    const stage = document.createElement('div');
    stage.className = 'omni-cv__stage';

    const readouts = document.createElement('div');
    readouts.className = 'omni-cv__readouts';

    const link = this.buildCard('Connection strength');
    const trust = this.buildCard('Trust level');
    const history = this.buildCard('Completed together');
    readouts.append(link.card, trust.card, history.card);

    const actions = document.createElement('div');
    actions.className = 'omni-cv__actions';
    // Only controls that do something. A row of four looks better than a row of two,
    // and a button that does nothing when pressed is worse than both.
    actions.append(
      this.buildAction('☎', 'End call', 'omni-action--end', () =>
        this.dispatch({ kind: 'leave' })
      ),
      this.buildAction('☷', 'Observations', '', () => {
        this.tab = 'hints';
        if (this.lastState) this.present(this.lastState);
      }),
      this.buildAction('☰', 'Records', '', () => {
        this.tab = 'records';
        if (this.lastState) this.present(this.lastState);
      })
    );

    stage.append(readouts, actions);
    body.append(stage, root);

    const footer = document.createElement('div');
    footer.className = 'omni-cv__foot';
    const version = document.createElement('span');
    version.textContent = 'Omniscient OS';
    const notice = document.createElement('span');
    notice.textContent = 'All conversations are monitored and recorded.';
    const corp = document.createElement('span');
    corp.textContent = 'Omniscient';
    footer.append(version, notice, corp);

    shell.append(top, body, footer);
    this.container.appendChild(shell);

    this.shell = shell;
    this.sessionEl = sessionId;
    this.whereEl = where;
    this.linkCard = link;
    this.trustCard = trust;
    this.historyCard = history;

    // Enter-to-submit. ENGINE.Input has onChange but no submit event, which is one of
    // the reasons this surface is hand-built.
    /**
     * The keyer.
     *
     * The only thing in this game that answers a single keystroke. Typing into a silent
     * box is typing into a form; typing into a box that ticks is transmitting, and the
     * whole conceit of the console rests on the player believing the second thing.
     *
     * Printable keys and backspace only - a click on Shift or on an arrow key is the
     * detail that turns a keyer into a rattle.
     */
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Backspace' || event.key.length === 1) audio.play('key');
      if (event.key !== 'Enter') return;
      const text = input.value.trim();
      if (!text) return;
      audio.play('transmit');
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
    this.suggestElement = suggestions;

    /**
     * The relation board lives NEXT to the extra panel, not inside it.
     *
     * `renderExtra` clears its container on every present, and the session presents on
     * every state change - opening a hint, the contact answering. A board rebuilt on each
     * of those would throw away half-finished wiring for reasons the player cannot see,
     * which is the same shape as the bug that broke the suggestion chips. It is created
     * once and told to update instead.
     */
    this.board = new BoardPanel((message) => this.dispatch(message));
    this.board.element.style.display = 'none';
    extra.parentElement?.insertBefore(this.board.element, extra);
  }

  /** Build one margin readout. Segments are filled later by fillMeter. */
  private buildCard(label: string): ReadoutCard {
    const card = document.createElement('div');
    card.className = 'omni-card';

    const caption = document.createElement('span');
    caption.className = 'omni-card__label';
    caption.textContent = label;

    const meter = document.createElement('div');
    meter.className = 'omni-meter';
    for (let i = 0; i < 8; i++) meter.appendChild(document.createElement('i'));

    const value = document.createElement('span');
    value.className = 'omni-card__value';

    const sub = document.createElement('span');
    sub.className = 'omni-card__sub';

    card.append(caption, meter, value, sub);
    return { card, meter, value, sub };
  }

  private buildAction(
    glyph: string,
    label: string,
    modifier: string,
    onPress: () => void
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `omni-action${modifier ? ` ${modifier}` : ''}`;

    const icon = document.createElement('span');
    icon.className = 'omni-action__glyph';
    icon.textContent = glyph;

    const text = document.createElement('span');
    text.textContent = label;

    button.append(icon, text);
    // mousedown for the same reason the suggestion chips use it - present() can rebuild
    // things mid-click and a click that never completes is a button that does nothing.
    button.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      onPress();
    });
    return button;
  }

  /** Light `filled` of the meter's segments. */
  private fillMeter(meter: HTMLDivElement, filled: number, extraClass = ''): void {
    meter.className = `omni-meter${extraClass ? ` ${extraClass}` : ''}`;
    const segments = meter.children;
    for (let i = 0; i < segments.length; i++) {
      segments[i].className = i < filled ? 'on' : '';
    }
  }

  /**
   * The margin readouts.
   *
   * Every number here is real. Trust is the value MissionOutcome.trust has been awarding
   * since the schema was written and nothing was collecting; jobs and losses are the
   * shared history. Inventing a plausible-looking percentage would have been quicker and
   * would have made the whole console furniture.
   */
  private renderReadouts(state: SurfaceState): void {
    if (this.sessionEl) {
      this.sessionEl.textContent = `Session ${sessionIdFor(state.contactName)}`;
    }
    if (this.whereEl) this.whereEl.textContent = state.contactLocation ?? '';

    if (this.linkCard) {
      // The link is only ever as good as the request is calm - a lost or urgent request
      // is not the moment to claim four bars of nothing-wrong.
      const strong = !state.failure;
      this.fillMeter(this.linkCard.meter, strong ? 7 : 3);
      this.linkCard.value.textContent = strong ? 'Stable' : 'Degraded';
      this.linkCard.sub.textContent = state.failure ? 'contact disengaged' : 'holding';
    }

    const standing = state.standing;
    if (this.trustCard) {
      const trust = standing?.trust ?? 0;
      this.fillMeter(this.trustCard.meter, Math.round(trust * 8), 'omni-meter--trust');
      this.trustCard.value.textContent = `${Math.round(trust * 100)}%`;
      this.trustCard.sub.textContent =
        trust >= 0.7 ? 'they will take your word' : trust >= 0.4 ? 'willing to listen' : 'wary of you';
    }

    if (this.historyCard) {
      const jobs = standing?.jobs ?? 0;
      const lost = standing?.lost ?? 0;
      this.fillMeter(this.historyCard.meter, Math.min(8, jobs));
      this.historyCard.value.textContent = jobs === 1 ? '1 job' : `${jobs} jobs`;
      this.historyCard.sub.textContent = lost > 0 ? `${lost} left unfinished` : 'nothing left unfinished';
    }
  }

  /**
   * Example replies under the input.
   *
   * Rebuilt only when the set of suggestions actually changes. Tapping one puts the text
   * in the input and sends it, so what reaches the runtime is indistinguishable from
   * typing - and the player sees the words appear, which is how they learn the register
   * rather than just clicking through it.
   */
  private renderSuggestions(suggestions: string[] | undefined): void {
    const element = this.suggestElement;
    if (!element) return;

    const key = (suggestions ?? []).join(' ');
    if (key === this.renderedSuggestKey) return;
    this.renderedSuggestKey = key;

    element.replaceChildren();
    if (!suggestions || suggestions.length === 0) {
      element.style.display = 'none';
      return;
    }
    element.style.display = 'flex';

    const label = document.createElement('span');
    label.className = 'omni-suggest__label';
    label.textContent = 'you could say';
    element.appendChild(label);

    for (const text of suggestions) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'omni-suggest__chip';
      chip.textContent = text;

      /**
       * Fires on mousedown, not click.
       *
       * present() runs synchronously inside this handler, and it rebuilds the chip row -
       * so the button is removed from the document between the player pressing and
       * releasing, the click event never completes, and the reply silently does not
       * happen. mousedown lands before anything can be torn out from under it.
       *
       * The text is put in the input first so the player watches it appear there. These
       * are meant to teach what typing looks like, not to be a menu that bypasses it.
       */
      chip.addEventListener('mousedown', (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        if (this.inputElement) this.inputElement.value = text;
        audio.play('tap');
        this.dispatch({ kind: 'text', text });
        if (this.inputElement) this.inputElement.value = '';
      });
      element.appendChild(chip);
    }
  }

  /**
   * Show or hide the terminal.
   *
   * It is the intervention surface - it belongs on screen when there is somebody to
   * intervene with, and nowhere else. On the main menu it is just a green box.
   */
  public setVisible(visible: boolean): void {
    // The whole console, not just the transcript - hiding one and leaving the frame up
    // left an empty operator shell floating over the main menu.
    if (this.shell) this.shell.style.display = visible ? 'grid' : 'none';
  }

  public detach(): void {
    this.shell?.remove();
    this.shell = null;
    this.root = null;
    this.logElement = null;
    this.inputElement = null;
    this.contactElement = null;
    this.hintElement = null;
    this.suggestElement = null;
    this.renderedSuggestKey = '';
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
    this.renderSuggestions(state.suggestions);
    this.renderReadouts(state);
    // The whole panel goes red, not just the notice inside it.
    this.root?.classList.toggle('omni-terminal--lost', state.failure !== undefined);

    // Append only what is new, so the log does not flicker or lose scroll position.
    if (state.transcript.length < this.renderedCount) {
      this.logElement.replaceChildren();
      this.renderedCount = 0;
    }
    /**
     * One blip per line that arrives, and a stagger so they do not all land at once.
     *
     * A beat often adds two or three lines in the same frame - the contact's reply plus a
     * system note. Appending them together and blipping once reads as a single event; the
     * point of the sound is that a PERSON is speaking, one thought at a time, so the lines
     * come in on a short cadence and each one is announced.
     *
     * The stagger is presentation only. The transcript state already contains every line
     * by the time this runs, so nothing downstream waits on it and §157 is untouched - the
     * console is deciding when to draw, not what is true.
     */
    let delay = 0;
    for (let i = this.renderedCount; i < state.transcript.length; i++) {
      const entry = state.transcript[i];
      const element = this.renderLine(entry);

      /**
       * The player's own words echo instantly. Everybody else takes a moment.
       *
       * This is the single largest thing that was wrong with how the game felt. A beat
       * resolves in the same frame the player presses Enter, so the reply from somebody
       * standing on an unlit road twenty metres ahead of a man following her arrived with
       * exactly the latency of a spreadsheet recalculating. It read as a lookup, because
       * that is what zero latency reads as.
       *
       * ANSWER_GAP is not a loading pause and must not become one - it is short enough
       * that a player who is reading has not finished the line above it, and the input
       * field stays live throughout, so nobody is ever waiting on it. It buys the one
       * thing a conversation needs and a database does not, which is a beat.
       */
      const ANSWER_GAP = 340;
      const STAGGER = 150;
      if (entry.source !== 'omniscient') {
        delay = delay === 0 ? ANSWER_GAP : delay + STAGGER;
      }

      if (delay > 0) element.style.animationDelay = `${delay}ms`;
      this.logElement.appendChild(element);

      if (entry.source === 'contact') {
        window.setTimeout(() => audio.play('receive'), delay);
      }
    }
    this.renderedCount = state.transcript.length;

    // A new line arriving means something happened in the conversation - go back to it.
    if (state.transcript.length > 0 && this.tab !== 'chat' && state.confirming) {
      this.tab = 'chat';
    }

    this.renderTabs(state);
    this.renderPanel(state);
    this.renderExtra(state);
    this.board?.update(state.device);

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

      // What would have worked. The player is about to be asked to write this down in
      // their own words, and being asked to record a lesson nobody told them is a test.
      if (state.failure.lesson) {
        const lesson = document.createElement('span');
        lesson.className = 'omni-failure__lesson';
        lesson.textContent = state.failure.lesson;
        box.appendChild(lesson);
      }

      const prompt = document.createElement('span');
      prompt.className = 'omni-failure__prompt';
      prompt.textContent =
        'Write yourself a note below. It will be waiting for you when this request comes back.';
      box.appendChild(prompt);

      this.extraElement.appendChild(box);
    }
  }

  private renderLine(entry: TranscriptEntry): HTMLElement {
    const line = document.createElement('div');
    line.className = `omni-line omni-line--${entry.source} omni-line--arriving`;

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
    injectConsoleChrome();
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = TERMINAL_CSS;
    document.head.appendChild(style);
  }
}
