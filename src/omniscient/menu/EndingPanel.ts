/**
 * The panel that delivers the final transmission.
 *
 * ## The shape of the delivery
 *
 * Three movements, in one frame styled like the system panel so the ending looks like the
 * machine and not like a screen pasted over it:
 *
 *   1. the opening transmission, typed line by line with the receive blip - the same
 *      rhythm every contact's words have arrived with all game, now carrying the
 *      machine's own;
 *   2. the record: the playthrough in the machine's units, revealed row by row;
 *   3. the closing transmission, and a single control - RETURN TO THE MACHINE.
 *
 * It deliberately does not end the program. The last line of content is "somebody will
 * call", and the panel closing back onto the lit machine is that sentence kept: the
 * player leaves OMNISCIENT_ the way they found it. On.
 *
 * ## Keyboard as well as mouse
 *
 * Same policy as SystemPanel, for the same two reasons: it is the accessible thing, and
 * the automated capture cannot click DOM overlays - a panel that only answered the mouse
 * could never be verified again. Enter or Space advances (revealing the current movement
 * instantly, then moving on), Escape closes only once everything has been delivered - an
 * ending that can be dismissed unread by the key the player has been leaning on all game
 * is an ending nobody saw.
 */

import { audio } from '../audio/ConsoleAudio.js';
import { accessibleTextSeconds } from '../accessibility/preferences.js';
import { ACCENT } from '../art/palette.js';
import { setCursorVisible } from '../art/cursor.js';
import {
  TRANSMISSION_CLOSE,
  TRANSMISSION_OPEN,
  buildEndingReport,
} from '../content/ending.js';

import type { KnowledgeStore } from '../knowledge/KnowledgeStore.js';
import type { NavigationCommand } from '../input/FocusNavigator.js';

const STYLE_ID = 'omniscient-ending-panel';

/** Seconds between typed characters. Slow enough to read as keying, not printing. */
const CHAR_SECONDS = 0.022;
/** Dwell after a finished line before the next begins. */
const LINE_DWELL = 0.42;
/** Dwell between report rows - each lands as its own small fact. */
const ROW_DWELL = 0.32;

/**
 * Which rows of the record are not ordinary ledger lines, keyed by the labels
 * content/ending.ts writes.
 *
 * Keying on the label couples the panel to the words, so the default matters more than the
 * entries: an unrecognised label gets the ledger treatment, which is the treatment every row
 * had before. Rewriting a label or adding a row therefore loses an emphasis at worst - it
 * cannot produce an unstyled row, and it cannot throw in the last thirty seconds of the game.
 */
const ROW_TONE: Readonly<Record<string, 'headline' | 'name' | 'loss'>> = {
  'REQUESTS ANSWERED': 'headline',
  'MOST TRUSTING CALLER': 'name',
  'REQUESTS LOST ON THE WAY': 'loss',
};

const CSS = `
.omni-end {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(circle at 50% 45%, rgba(31, 75, 41, 0.14), transparent 48%),
    rgba(1, 5, 3, 0.88);
  font-family: 'Courier New', Courier, monospace;
  color: #cfe6c4;
  z-index: 44;
  pointer-events: auto;
  opacity: 0;
  transition: opacity 1.4s ease;
}
.omni-end--on { opacity: 1; }
/*
 * The frame does not scroll; its body does.
 *
 * This used to be one scrolling box with the title inside it, and the title was sliced in
 * half in every capture of the ending. The cause is not the padding: the panel contains
 * focusable controls, focusing one makes the browser scroll it into view, and the first
 * thing to leave the top of a scrolling box is whatever sits above the content - here, the
 * words FINAL TRANSMISSION. Nothing in the panel's own code scrolls it, which is why it
 * looked like a layout bug rather than a focus one.
 *
 * A column with a header that cannot shrink and a body that can is the fix, and it is worth
 * preferring over scroll-padding tricks because it also means the title stays put while the
 * report is being read. This is the last thing anybody sees.
 */
.omni-end__frame {
  width: min(700px, 82vw);
  max-height: 84vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(127, 224, 138, 0.5);
  background: linear-gradient(180deg, rgba(8, 26, 15, 0.985), rgba(3, 12, 7, 0.985));
  padding: 28px 34px 24px;
  box-shadow: 0 0 0 1px rgba(127, 224, 138, 0.06), 0 0 62px rgba(0, 0, 0, 0.78);
}
/*
 * ## A vignette, and deliberately NOT a scanline
 *
 * This panel is the one surface in the game with no CRT treatment, and the obvious fix - a
 * repeating-linear-gradient raster over it - is one this codebase has already made and
 * undone. See the note on .omni-terminal in link/LocalSurface.ts: a CSS raster there
 * survived every attempt to switch it off from the render side, because it was never in the
 * renderer, and cost a long hunt through seven post-processing passes before a probe of
 * computed styles found it. It was removed once our own retro pass could do scanlines
 * properly, per view, and switchably - none of which a blend-mode overlay can do.
 *
 * That pass runs on the canvas and cannot reach DOM, so this panel cannot have the real
 * thing. What it can have is the treatment that note explicitly keeps: "the ::before glow
 * below stays; it is a vignette, not a raster." Same idiom, same reason - it darkens toward
 * the corners the way a tube does, and it is one gradient that nothing later will mistake
 * for a rendering artefact.
 */
.omni-end__frame { position: relative; }
.omni-end__frame::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0) 58%, rgba(0, 0, 0, 0.42) 100%);
}
.omni-end__body {
  overflow: hidden auto;
  /* Room above a control that gets focused, so nothing lands hard against the header. */
  scroll-padding-top: 12px;
  min-height: 0;
}
.omni-end__title {
  flex: 0 0 auto;
  font-size: calc(14px + var(--omni-font-boost, 0px));
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: ${ACCENT.knowledge};
  margin-bottom: 20px;
}
.omni-end__movement {
  opacity: 0.18;
  filter: saturate(0.5);
  transition: opacity 700ms ease, filter 700ms ease, transform 700ms ease;
  transform: translateY(2px);
}
.omni-end--movement-1 .omni-end__movement--1,
.omni-end--movement-2 .omni-end__movement--2,
.omni-end--movement-3 .omni-end__movement--3 {
  opacity: 1;
  filter: saturate(1);
  transform: translateY(0);
}
.omni-end__movement-label {
  margin: 8px 0 7px;
  color: #6f9f78;
  font-size: calc(10px + var(--omni-font-boost, 0px));
  letter-spacing: 0.18em;
  text-transform: uppercase;
}
.omni-end__line {
  font-size: calc(16px + var(--omni-font-boost, 0px));
  letter-spacing: 0.045em;
  line-height: 1.65;
  min-height: 1.65em;
  white-space: pre-wrap;
}
/*
 * Two lines out of thirteen are set apart: the machine naming itself, and the last sentence
 * of the game. Everything between them is one even voice, which is what makes those two
 * land - emphasis spent on every line is emphasis spent on none.
 */
.omni-end__line--slug {
  color: ${ACCENT.knowledge};
  letter-spacing: 0.16em;
}
.omni-end__line--final {
  margin-top: 10px;
  color: ${ACCENT.knowledge};
  font-size: calc(19px + var(--omni-font-boost, 0px));
  letter-spacing: 0.1em;
}
/*
 * ## The record is a statement, not a form
 *
 * A form is a stack of identical label/value pairs and it reads as one: nothing in it is
 * more important than anything else, so the eye finds no way in. The record is set as a
 * document instead, and the whole difference is a hierarchy of three registers -
 *
 *   - the headline: how many people got an answer, set as the largest and brightest thing
 *     in the panel because it is the one number the run was about (law 1 - the subject is
 *     the brightest thing in frame, and there is no third option);
 *   - the ledger rows: small dim label, dotted leader, amber value. The leader is what
 *     turns a flex row into a line of a record - it ties label to value across the gap
 *     instead of leaving them stranded at opposite margins;
 *   - the two rows that are not counts: a person's name is set in the machine's own ink
 *     rather than in value-amber, and a loss is set in a lifted red. Both differ from the
 *     numbers because they mean a different kind of thing, which is the only reason type
 *     is ever allowed to differ.
 */
.omni-end__report {
  margin: 10px 0 16px;
  padding: 14px 0 10px;
  border-top: 1px solid rgba(127, 224, 138, 0.34);
  border-bottom: 1px solid rgba(127, 224, 138, 0.16);
}
/*
 * The row wraps rather than overflows. A narrow window puts the frame at 82vw, and the long
 * pairs - GROWTH STAGE / TRANSCENDENT, and any caller with a full name - are wider than that
 * together. Space-between does not shrink text, so before this they ran under the body's
 * scrollbar and the value was simply gone: the row that says who trusted the player most is
 * the worst row in the game to silently truncate. Wrapping drops the value onto its own line,
 * still right-aligned, and the leader keeps a stub so the line still reads as a record.
 */
.omni-end__row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 10px;
  line-height: 1.9;
  opacity: 0;
  transition: opacity 0.5s ease;
}
.omni-end__row--on { opacity: 1; }
.omni-end__label {
  flex: 0 1 auto;
  min-width: 0;
  color: #6f9f78;
  font-size: calc(11px + var(--omni-font-boost, 0px));
  letter-spacing: 0.2em;
  text-transform: uppercase;
}
/* Decorative only - it carries no text, so it is hidden from the reading order. */
.omni-end__lead {
  flex: 1 1 24px;
  align-self: center;
  border-bottom: 1px dotted rgba(127, 224, 138, 0.2);
}
.omni-end__row b {
  flex: 0 0 auto;
  margin-left: auto;
  color: ${ACCENT.amber};
  font-weight: normal;
  font-size: calc(15px + var(--omni-font-boost, 0px));
  letter-spacing: 0.06em;
}
.omni-end__row--headline {
  display: block;
  margin-bottom: 12px;
}
.omni-end__row--headline b {
  display: block;
  margin-top: 1px;
  color: ${ACCENT.knowledge};
  font-size: calc(31px + var(--omni-font-boost, 0px));
  letter-spacing: 0.05em;
  line-height: 1.15;
}
/* A name is not a measurement. Pale ink, wide tracking - the register the machine speaks in. */
.omni-end__row--name b {
  color: #cfe6c4;
  font-size: calc(14px + var(--omni-font-boost, 0px));
  letter-spacing: 0.2em;
}
/*
 * Lifted off ACCENT.warning rather than taken from it: the palette's dirty red is chosen to
 * sit on lit props, and at #a8402f on a near-black panel it reads as a smudge rather than a
 * figure. Same hue, raised value.
 */
.omni-end__row--loss b { color: #c86a52; }
.omni-end__weave {
  position: relative;
  /* min-height, not height: a wrapped note on a narrow frame grows the box instead of
     flattening the plot inside it. */
  min-height: 122px;
  margin: 8px 0 12px;
  padding: 7px 9px 0;
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(127, 224, 138, 0.16);
  background: linear-gradient(180deg, rgba(8, 20, 12, 0.8), rgba(3, 10, 6, 0.7));
  overflow: hidden;
}
.omni-end__weave-head {
  flex: 0 0 auto;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: #557b60;
  font-size: calc(9px + var(--omni-font-boost, 0px));
  letter-spacing: 0.15em;
}
/* A wrapped caption would eat a line of a fixed-height plot. It never wraps. */
.omni-end__weave-head span { white-space: nowrap; }
.omni-end__weave svg { flex: 1 1 auto; width: 100%; min-height: 0; display: block; }
/*
 * The note only appears on a run too thin to draw, and it sits in the empty lower band of
 * the plot rather than replacing it - the eight unlit stations ARE the picture there, and
 * the note says what the picture means so the box is never asked to speak for itself.
 */
.omni-end__weave-note {
  flex: 0 0 auto;
  padding-bottom: 8px;
  text-align: center;
  color: #7d9c84;
  font-size: calc(10px + var(--omni-font-boost, 0px));
  letter-spacing: 0.14em;
}
.omni-end__route {
  fill: none;
  stroke: rgba(127, 224, 138, 0.62);
  stroke-width: 1.2;
  stroke-dasharray: 150;
  stroke-dashoffset: 150;
  transition: stroke-dashoffset 780ms cubic-bezier(.2,.7,.2,1);
}
.omni-end__route--on { stroke-dashoffset: 0; }
/* The relay that was never made. Present, structural, and clearly not lit. */
.omni-end__route--ghost {
  stroke: rgba(127, 224, 138, 0.15);
  stroke-width: 1;
  stroke-dasharray: 3 5;
  stroke-dashoffset: 0;
}
.omni-end__node {
  fill: #173420;
  stroke: #4f855b;
  stroke-width: 1;
  opacity: 0.45;
  transition: fill 220ms ease, opacity 220ms ease, filter 220ms ease;
}
.omni-end__node--ghost {
  fill: #0c1a11;
  stroke: rgba(127, 224, 138, 0.3);
  opacity: 1;
}
.omni-end__node--on {
  fill: ${ACCENT.knowledge};
  opacity: 1;
  filter: drop-shadow(0 0 4px rgba(127,224,138,0.85));
}
.omni-end__return {
  margin-top: 18px;
  padding: 10px 14px;
  border: 1px solid rgba(127, 224, 138, 0.5);
  font-size: calc(12px + var(--omni-font-boost, 0px));
  letter-spacing: 0.18em;
  text-align: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.6s ease;
  pointer-events: none;
  width: 100%;
  color: #cfe6c4;
  background: transparent;
  font-family: inherit;
}
.omni-end__return--on { pointer-events: auto; opacity: 1; }
.omni-end__return:hover { background: rgba(127, 224, 138, 0.1); }
.omni-end__return:focus-visible {
  outline: 2px solid ${ACCENT.knowledge};
  outline-offset: 3px;
  background: rgba(127, 224, 138, 0.12);
}
@media (max-height: 760px) {
  .omni-end__frame { padding-block: 18px; }
  .omni-end__line { font-size: calc(14px + var(--omni-font-boost, 0px)); line-height: 1.45; min-height: 1.45em; }
  .omni-end__line--final { font-size: calc(17px + var(--omni-font-boost, 0px)); margin-top: 7px; }
  .omni-end__weave { min-height: 96px; }
  .omni-end__row { line-height: 1.65; }
  /* The hierarchy has to survive the squeeze, so the headline shrinks by less than the body. */
  .omni-end__row--headline { margin-bottom: 8px; }
  .omni-end__row--headline b { font-size: calc(26px + var(--omni-font-boost, 0px)); }
}
`;

/** One queued piece of delivery: a line to type, or a report row to reveal. */
type Step =
  | { kind: 'line'; into: HTMLElement; text: string; movement: 1 | 3 }
  | { kind: 'row'; element: HTMLElement; movement: 2 };

export class EndingPanel {
  private root: HTMLElement | null = null;
  private steps: Step[] = [];
  private stepIndex = 0;
  private charIndex = 0;
  private wait = 0;
  private finished = false;
  private movement: 1 | 2 | 3 = 1;
  private returnButton: HTMLButtonElement | null = null;
  private routeNodes: SVGCircleElement[] = [];
  private routeSegments: SVGPathElement[] = [];
  private routeTimers: number[] = [];
  private routesPlayed = false;
  private readonly onKey = (event: KeyboardEvent): void => this.handleKey(event);

  constructor(
    private readonly container: HTMLElement,
    private readonly onClosed: () => void
  ) {}

  public open(knowledge: KnowledgeStore, resolved: number, queued: number): void {
    if (this.root) return;

    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    const root = document.createElement('div');
    root.className = 'omni-end omni-end--movement-1';
    const frame = document.createElement('div');
    frame.className = 'omni-end__frame';
    root.appendChild(frame);

    const title = document.createElement('div');
    title.className = 'omni-end__title';
    title.textContent = 'FINAL TRANSMISSION';
    frame.appendChild(title);

    // Everything except the title scrolls. See .omni-end__frame for why they are separated.
    const body = document.createElement('div');
    body.className = 'omni-end__body';
    frame.appendChild(body);

    const movement = (number: 1 | 2 | 3, labelText: string): HTMLElement => {
      const section = document.createElement('section');
      section.className = `omni-end__movement omni-end__movement--${number}`;
      const label = document.createElement('div');
      label.className = 'omni-end__movement-label';
      label.textContent = `0${number}  //  ${labelText}`;
      section.appendChild(label);
      body.appendChild(section);
      return section;
    };

    const statement = movement(1, 'MACHINE STATEMENT');

    // Every line gets its element up front, empty, so the frame is its final size from
    // the first moment - a panel that grows as it types walks the button away from the
    // cursor that is about to need it.
    const queueLines = (
      lines: readonly string[],
      into: HTMLElement,
      movementNumber: 1 | 3
    ): HTMLElement[] => {
      const elements: HTMLElement[] = [];
      for (const text of lines) {
        const line = document.createElement('div');
        line.className = 'omni-end__line';
        into.appendChild(line);
        elements.push(line);
        this.steps.push({ kind: 'line', into: line, text, movement: movementNumber });
      }
      return elements;
    };

    // The machine naming itself is the transmission's slug line, not another sentence of it.
    queueLines(TRANSMISSION_OPEN, statement, 1)[0]?.classList.add('omni-end__line--slug');

    const recordMovement = movement(2, 'CALLER RECORD');
    recordMovement.appendChild(this.buildWeave(resolved));
    const report = document.createElement('div');
    report.className = 'omni-end__report';
    recordMovement.appendChild(report);
    for (const row of buildEndingReport(knowledge, resolved, queued)) {
      const tone = ROW_TONE[row.label] ?? 'ledger';
      const element = document.createElement('div');
      element.className = `omni-end__row omni-end__row--${tone}`;
      const label = document.createElement('span');
      label.className = 'omni-end__label';
      label.textContent = row.label;
      const value = document.createElement('b');
      value.textContent = row.value;
      element.append(label);
      if (tone !== 'headline') {
        const leader = document.createElement('span');
        leader.className = 'omni-end__lead';
        leader.setAttribute('aria-hidden', 'true');
        element.append(leader);
      }
      element.append(value);
      report.appendChild(element);
      this.steps.push({ kind: 'row', element, movement: 2 });
    }

    const observation = movement(3, 'OBSERVATION');
    const closing = queueLines(TRANSMISSION_CLOSE, observation, 3);
    // The last sentence in the game gets to be a sentence, not the thirteenth line of a list.
    closing[closing.length - 1]?.classList.add('omni-end__line--final');

    const back = document.createElement('button');
    back.type = 'button';
    back.disabled = true;
    back.className = 'omni-end__return';
    back.textContent = 'RETURN TO THE MACHINE  [ENTER]';
    back.addEventListener('click', () => this.close());
    body.appendChild(back);
    this.returnButton = back;

    this.container.appendChild(root);
    this.root = root;
    setCursorVisible(false);
    window.addEventListener('keydown', this.onKey);

    // The squelch opens: the machine is transmitting, so the call rhythm applies to it.
    audio.play('connect');
    audio.setOnAir(true);

    // Next frame, so the opacity transition has a "from" to leave.
    requestAnimationFrame(() => root.classList.add('omni-end--on'));
  }

  /**
   * A compact constellation of answered callers, illuminated one relay at a time.
   *
   * ## Why every station is drawn, lit or not
   *
   * This used to draw only the answered callers, which meant a run that answered one - or
   * none, since the count was floored at one and lit a station nobody had called - handed
   * the player a large empty rectangle as the centrepiece of the last screen they will ever
   * see of this game. An empty box is not a statement, it is a missing one.
   *
   * All eight stations are plotted now and only the answered ones are lit, so the picture is
   * the same picture at every score and it is the run that changes: a full run is a lit
   * chain, a thin run is a chain that mostly did not happen, and the unmade relays are
   * present as dotted ghosts. Law 4 - a machine's picture is allowed to fail, and reporting
   * a thin run honestly is in character in a way a blank frame is not. Law 1 does the rest:
   * lit and unlit are separated by value, not by hue, so the answered stations are the
   * brightest thing in the box at a glance.
   *
   * Below two lit stations there is genuinely no relay to show - a relay needs somewhere to
   * go - so the box says so in words rather than leaving the reader to infer it from an
   * absence.
   */
  private buildWeave(resolved: number): HTMLElement {
    const host = document.createElement('div');
    host.className = 'omni-end__weave';

    const points = [
      [38, 70],
      [116, 34],
      [196, 72],
      [278, 28],
      [360, 68],
      [442, 31],
      [522, 74],
      [602, 39],
    ] as const;
    const lit = Math.max(0, Math.min(points.length, Math.floor(resolved)));

    const head = document.createElement('div');
    head.className = 'omni-end__weave-head';
    const title = document.createElement('span');
    title.textContent = 'ANSWER RELAY MAP';
    const count = document.createElement('span');
    count.textContent = `${lit} OF ${points.length} LIT`;
    head.append(title, count);
    host.appendChild(head);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 640 104');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');

    /** Both layers share one arc, so a lit relay lands exactly on the ghost it replaces. */
    const arc = (index: number): SVGPathElement => {
      const [px, py] = points[index - 1];
      const [x, y] = points[index];
      const bend = Math.min(py, y) - 20 - (index % 2) * 9;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${px} ${py} Q ${(px + x) / 2} ${bend} ${x} ${y}`);
      return path;
    };

    // The ghost layer goes down first so the live one draws over it.
    for (let index = 1; index < points.length; index++) {
      if (index < lit) continue;
      const path = arc(index);
      path.setAttribute('class', 'omni-end__route omni-end__route--ghost');
      svg.appendChild(path);
    }
    for (let index = lit; index < points.length; index++) {
      const [x, y] = points[index];
      const ghost = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      ghost.setAttribute('cx', String(x));
      ghost.setAttribute('cy', String(y));
      ghost.setAttribute('r', '2.6');
      ghost.setAttribute('class', 'omni-end__node omni-end__node--ghost');
      svg.appendChild(ghost);
    }

    for (let index = 0; index < lit; index++) {
      const [x, y] = points[index];
      if (index > 0) {
        const path = arc(index);
        path.setAttribute('class', 'omni-end__route');
        svg.appendChild(path);
        this.routeSegments.push(path);
      }

      const node = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      node.setAttribute('cx', String(x));
      node.setAttribute('cy', String(y));
      node.setAttribute('r', index === lit - 1 ? '4.2' : '3.2');
      node.setAttribute('class', 'omni-end__node');
      svg.appendChild(node);
      this.routeNodes.push(node);
    }

    host.appendChild(svg);

    if (lit < 2) {
      const note = document.createElement('div');
      note.className = 'omni-end__weave-note';
      note.textContent =
        lit === 0
          ? 'NO STATION LIT. NOTHING PASSED BETWEEN THEM.'
          : 'ONE STATION LIT. A RELAY NEEDS TWO.';
      host.appendChild(note);
    }

    return host;
  }

  private activateMovement(next: 1 | 2 | 3): void {
    if (!this.root || this.movement === next) {
      if (next === 2) this.playRoutes();
      return;
    }
    this.movement = next;
    this.root.classList.remove(
      'omni-end--movement-1',
      'omni-end--movement-2',
      'omni-end--movement-3'
    );
    this.root.classList.add(`omni-end--movement-${next}`);
    const active = this.root.querySelector<HTMLElement>(`.omni-end__movement--${next}`);
    active?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (next === 2) this.playRoutes();
  }

  private playRoutes(): void {
    if (this.routesPlayed) return;
    this.routesPlayed = true;
    this.routeNodes[0]?.classList.add('omni-end__node--on');
    this.routeNodes.slice(1).forEach((node, index) => {
      const timer = window.setTimeout(() => {
        this.routeSegments[index]?.classList.add('omni-end__route--on');
        node.classList.add('omni-end__node--on');
        audio.play('receive');
      }, 150 + index * 180);
      this.routeTimers.push(timer);
    });
  }

  /** Drive the typing. Called from the rig's tick; safe to call when closed. */
  public update(deltaTime: number): void {
    if (!this.root || this.finished) return;

    if (accessibleTextSeconds(1) === 0) {
      for (const step of this.steps.slice(this.stepIndex)) {
        this.activateMovement(step.movement);
        if (step.kind === 'line') step.into.textContent = step.text;
        else step.element.classList.add('omni-end__row--on');
      }
      this.stepIndex = this.steps.length;
      audio.play('receive');
      this.finish();
      return;
    }

    this.wait -= deltaTime;
    let budget = 512;
    while (this.wait <= 0 && budget > 0) {
      budget -= 1;
      const step = this.steps[this.stepIndex];
      if (!step) {
        this.finish();
        return;
      }
      this.activateMovement(step.movement);

      if (step.kind === 'row') {
        step.element.classList.add('omni-end__row--on');
        audio.play('tap');
        this.stepIndex += 1;
        this.wait += accessibleTextSeconds(ROW_DWELL);
        continue;
      }

      if (this.charIndex === 0) audio.play('receive');
      this.charIndex += 1;
      step.into.textContent = step.text.slice(0, this.charIndex);
      if (this.charIndex >= step.text.length) {
        this.stepIndex += 1;
        this.charIndex = 0;
        this.wait += accessibleTextSeconds(LINE_DWELL);
      } else {
        this.wait += accessibleTextSeconds(CHAR_SECONDS);
      }
    }
  }

  /** Route a controller through the ending's existing, deliberately skippable delivery. */
  public handleNavigation(command: NavigationCommand): boolean {
    if (!this.root) return false;
    if (command === 'activate') {
      this.handleKey(new KeyboardEvent('keydown', { code: 'Enter' }));
      return true;
    }
    if (command === 'back') {
      this.handleKey(new KeyboardEvent('keydown', { code: 'Escape' }));
      return true;
    }
    return false;
  }

  private handleKey(event: KeyboardEvent): void {
    if (
      event.code === 'Enter' ||
      event.code === 'Space' ||
      event.key === 'Enter' ||
      event.key === 'Return' ||
      event.key === ' ' ||
      event.key === 'Spacebar'
    ) {
      event.preventDefault();
      if (this.finished) {
        this.close();
        return;
      }
      /*
       * Advance = land everything up to and including the current step, instantly. A
       * reader faster than the keyer should not be punished with a per-line vigil, and a
       * skip that jumps clean to the end throws away the report reveal the game exists
       * to show. One press per movement is the compromise.
       */
      const step = this.steps[this.stepIndex];
      if (step) {
        this.activateMovement(step.movement);
        const currentMovement = step.movement;
        while (this.steps[this.stepIndex]?.movement === currentMovement) {
          const reveal = this.steps[this.stepIndex];
          if (reveal.kind === 'line') reveal.into.textContent = reveal.text;
          else reveal.element.classList.add('omni-end__row--on');
          this.stepIndex += 1;
        }
        this.charIndex = 0;
        this.wait = 0.16;
        audio.play('tap');
      }
      if (this.stepIndex >= this.steps.length) this.finish();
    }
    if (event.code === 'Escape' && this.finished) this.close();
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.activateMovement(3);
    setCursorVisible(true);
    if (this.returnButton) this.returnButton.disabled = false;
    this.returnButton?.classList.add('omni-end__return--on');
    this.returnButton?.focus();
    this.returnButton?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  private close(): void {
    if (!this.root) return;
    window.removeEventListener('keydown', this.onKey);
    for (const timer of this.routeTimers) window.clearTimeout(timer);
    this.routeTimers.length = 0;
    setCursorVisible(false);
    this.root.remove();
    this.root = null;
    audio.play('disconnect');
    audio.setOnAir(false);
    this.onClosed();
  }
}
