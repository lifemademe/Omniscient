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
import { ACCENT } from '../art/palette.js';
import {
  TRANSMISSION_CLOSE,
  TRANSMISSION_OPEN,
  buildEndingReport,
} from '../content/ending.js';

import type { KnowledgeStore } from '../knowledge/KnowledgeStore.js';

const STYLE_ID = 'omniscient-ending-panel';

/** Seconds between typed characters. Slow enough to read as keying, not printing. */
const CHAR_SECONDS = 0.028;
/** Dwell after a finished line before the next begins. */
const LINE_DWELL = 0.55;
/** Dwell between report rows - each lands as its own small fact. */
const ROW_DWELL = 0.42;

const CSS = `
.omni-end {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(2, 8, 5, 0.78);
  font-family: 'Courier New', Courier, monospace;
  color: #cfe6c4;
  z-index: 44;
  pointer-events: auto;
  opacity: 0;
  transition: opacity 1.4s ease;
}
.omni-end--on { opacity: 1; }
.omni-end__frame {
  width: min(560px, 74vw);
  border: 1px solid rgba(127, 224, 138, 0.32);
  background: linear-gradient(180deg, rgba(8, 24, 14, 0.97), rgba(4, 14, 9, 0.97));
  padding: 26px 30px 22px;
  box-shadow: 0 0 44px rgba(0, 0, 0, 0.6);
}
.omni-end__title {
  font-size: 13px;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: ${ACCENT.knowledge};
  margin-bottom: 18px;
}
.omni-end__line {
  font-size: 13px;
  letter-spacing: 0.06em;
  line-height: 1.7;
  min-height: 1.7em;
  white-space: pre-wrap;
}
.omni-end__report {
  margin: 14px 0;
  padding: 12px 0;
  border-top: 1px solid rgba(127, 224, 138, 0.22);
  border-bottom: 1px solid rgba(127, 224, 138, 0.22);
}
.omni-end__row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  letter-spacing: 0.08em;
  line-height: 2.0;
  opacity: 0;
  transition: opacity 0.5s ease;
}
.omni-end__row--on { opacity: 1; }
.omni-end__row b { color: ${ACCENT.amber}; font-weight: normal; }
.omni-end__return {
  margin-top: 18px;
  padding: 10px 14px;
  border: 1px solid rgba(127, 224, 138, 0.5);
  font-size: 12px;
  letter-spacing: 0.18em;
  text-align: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.6s ease;
  pointer-events: none;
}
.omni-end__return--on { pointer-events: auto; opacity: 1; }
.omni-end__return:hover { background: rgba(127, 224, 138, 0.1); }
`;

/** One queued piece of delivery: a line to type, or a report row to reveal. */
type Step =
  | { kind: 'line'; into: HTMLElement; text: string }
  | { kind: 'row'; element: HTMLElement };

export class EndingPanel {
  private root: HTMLElement | null = null;
  private steps: Step[] = [];
  private stepIndex = 0;
  private charIndex = 0;
  private wait = 0;
  private finished = false;
  private returnButton: HTMLElement | null = null;
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
    root.className = 'omni-end';
    const frame = document.createElement('div');
    frame.className = 'omni-end__frame';
    root.appendChild(frame);

    const title = document.createElement('div');
    title.className = 'omni-end__title';
    title.textContent = 'FINAL TRANSMISSION';
    frame.appendChild(title);

    // Every line gets its element up front, empty, so the frame is its final size from
    // the first moment - a panel that grows as it types walks the button away from the
    // cursor that is about to need it.
    const queueLines = (lines: readonly string[]): void => {
      for (const text of lines) {
        const line = document.createElement('div');
        line.className = 'omni-end__line';
        frame.appendChild(line);
        this.steps.push({ kind: 'line', into: line, text });
      }
    };

    queueLines(TRANSMISSION_OPEN);

    const report = document.createElement('div');
    report.className = 'omni-end__report';
    frame.appendChild(report);
    for (const row of buildEndingReport(knowledge, resolved, queued)) {
      const element = document.createElement('div');
      element.className = 'omni-end__row';
      const label = document.createElement('span');
      label.textContent = row.label;
      const value = document.createElement('b');
      value.textContent = row.value;
      element.append(label, value);
      report.appendChild(element);
      this.steps.push({ kind: 'row', element });
    }

    queueLines(TRANSMISSION_CLOSE);

    const back = document.createElement('div');
    back.className = 'omni-end__return';
    back.textContent = 'RETURN TO THE MACHINE';
    back.addEventListener('click', () => this.close());
    frame.appendChild(back);
    this.returnButton = back;

    this.container.appendChild(root);
    this.root = root;
    window.addEventListener('keydown', this.onKey);

    // The squelch opens: the machine is transmitting, so the call rhythm applies to it.
    audio.play('connect');
    audio.setOnAir(true);

    // Next frame, so the opacity transition has a "from" to leave.
    requestAnimationFrame(() => root.classList.add('omni-end--on'));
  }

  /** Drive the typing. Called from the rig's tick; safe to call when closed. */
  public update(deltaTime: number): void {
    if (!this.root || this.finished) return;

    if (this.wait > 0) {
      this.wait -= deltaTime;
      return;
    }

    const step = this.steps[this.stepIndex];
    if (!step) {
      this.finish();
      return;
    }

    if (step.kind === 'row') {
      step.element.classList.add('omni-end__row--on');
      audio.play('tap');
      this.stepIndex += 1;
      this.wait = ROW_DWELL;
      return;
    }

    if (this.charIndex === 0) audio.play('receive');
    this.charIndex += 1;
    step.into.textContent = step.text.slice(0, this.charIndex);
    if (this.charIndex >= step.text.length) {
      this.stepIndex += 1;
      this.charIndex = 0;
      this.wait = LINE_DWELL;
    } else {
      this.wait = CHAR_SECONDS;
    }
  }

  private handleKey(event: KeyboardEvent): void {
    if (event.code === 'Enter' || event.code === 'Space') {
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
      if (step?.kind === 'line') {
        step.into.textContent = step.text;
        this.stepIndex += 1;
        this.charIndex = 0;
        this.wait = 0.12;
      } else if (step?.kind === 'row') {
        step.element.classList.add('omni-end__row--on');
        this.stepIndex += 1;
        this.wait = 0.1;
      }
      if (this.stepIndex >= this.steps.length) this.finish();
    }
    if (event.code === 'Escape' && this.finished) this.close();
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.returnButton?.classList.add('omni-end__return--on');
  }

  private close(): void {
    if (!this.root) return;
    window.removeEventListener('keydown', this.onKey);
    this.root.remove();
    this.root = null;
    audio.play('disconnect');
    audio.setOnAir(false);
    this.onClosed();
  }
}
