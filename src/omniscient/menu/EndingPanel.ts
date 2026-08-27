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
.omni-end__report {
  margin: 10px 0 16px;
  padding: 12px 0;
  border-top: 1px solid rgba(127, 224, 138, 0.22);
  border-bottom: 1px solid rgba(127, 224, 138, 0.22);
}
.omni-end__row {
  display: flex;
  justify-content: space-between;
  font-size: calc(14px + var(--omni-font-boost, 0px));
  letter-spacing: 0.08em;
  line-height: 2.0;
  opacity: 0;
  transition: opacity 0.5s ease;
}
.omni-end__row--on { opacity: 1; }
.omni-end__row b { color: ${ACCENT.amber}; font-weight: normal; }
.omni-end__weave {
  position: relative;
  height: 104px;
  margin: 8px 0 12px;
  border: 1px solid rgba(127, 224, 138, 0.16);
  background: linear-gradient(180deg, rgba(8, 20, 12, 0.8), rgba(3, 10, 6, 0.7));
  overflow: hidden;
}
.omni-end__weave::before {
  content: 'ANSWER RELAY MAP';
  position: absolute;
  left: 9px;
  top: 7px;
  z-index: 1;
  color: #557b60;
  font-size: calc(9px + var(--omni-font-boost, 0px));
  letter-spacing: 0.15em;
}
.omni-end__weave svg { width: 100%; height: 100%; display: block; }
.omni-end__route {
  fill: none;
  stroke: rgba(127, 224, 138, 0.62);
  stroke-width: 1.2;
  stroke-dasharray: 150;
  stroke-dashoffset: 150;
  transition: stroke-dashoffset 780ms cubic-bezier(.2,.7,.2,1);
}
.omni-end__route--on { stroke-dashoffset: 0; }
.omni-end__node {
  fill: #173420;
  stroke: #4f855b;
  stroke-width: 1;
  opacity: 0.45;
  transition: fill 220ms ease, opacity 220ms ease, filter 220ms ease;
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
  .omni-end__weave { height: 82px; }
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
    ): void => {
      for (const text of lines) {
        const line = document.createElement('div');
        line.className = 'omni-end__line';
        into.appendChild(line);
        this.steps.push({ kind: 'line', into: line, text, movement: movementNumber });
      }
    };

    queueLines(TRANSMISSION_OPEN, statement, 1);

    const recordMovement = movement(2, 'CALLER RECORD');
    recordMovement.appendChild(this.buildWeave(resolved));
    const report = document.createElement('div');
    report.className = 'omni-end__report';
    recordMovement.appendChild(report);
    for (const row of buildEndingReport(knowledge, resolved, queued)) {
      const element = document.createElement('div');
      element.className = 'omni-end__row';
      const label = document.createElement('span');
      label.textContent = row.label;
      const value = document.createElement('b');
      value.textContent = row.value;
      element.append(label, value);
      report.appendChild(element);
      this.steps.push({ kind: 'row', element, movement: 2 });
    }

    const observation = movement(3, 'OBSERVATION');
    queueLines(TRANSMISSION_CLOSE, observation, 3);

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

  /** A compact constellation of answered callers, illuminated one relay at a time. */
  private buildWeave(resolved: number): HTMLElement {
    const host = document.createElement('div');
    host.className = 'omni-end__weave';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 640 104');
    svg.setAttribute('preserveAspectRatio', 'none');

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
    const count = Math.max(1, Math.min(points.length, resolved));

    for (let index = 0; index < count; index++) {
      const [x, y] = points[index];
      if (index > 0) {
        const [px, py] = points[index - 1];
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const bend = Math.min(py, y) - 20 - (index % 2) * 9;
        path.setAttribute('d', `M ${px} ${py} Q ${(px + x) / 2} ${bend} ${x} ${y}`);
        path.setAttribute('class', 'omni-end__route');
        svg.appendChild(path);
        this.routeSegments.push(path);
      }

      const node = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      node.setAttribute('cx', String(x));
      node.setAttribute('cy', String(y));
      node.setAttribute('r', index === count - 1 ? '4.2' : '3.2');
      node.setAttribute('class', 'omni-end__node');
      svg.appendChild(node);
      this.routeNodes.push(node);
    }

    host.appendChild(svg);
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
