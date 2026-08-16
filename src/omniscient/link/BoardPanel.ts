/**
 * The relation board - connect-the-boxes, on the console.
 *
 * ## Click, then click
 *
 * Not drag-and-drop. Dragging is what everybody pictures when they hear "connect the
 * boxes", and it is also the interaction most likely to be quietly broken for somebody:
 * it needs pointer capture, it fights the page's own scrolling, it is miserable on a
 * trackpad and impossible without a pointer at all. Click a name, click a relation, and
 * a wire appears - same gesture, none of the failure modes, and it costs nothing to
 * add dragging on top later.
 *
 * The lesson behind that is a real one from this project: the suggestion chips shipped
 * broken because `present()` rebuilt the row between mousedown and mouseup, and no
 * amount of reading the code found it. Interaction that survives being rebuilt underneath
 * itself is worth more than interaction that reads well.
 *
 * ## Safe UI
 *
 * Every name and note here is content - it comes from mission data and, on a remote
 * surface, over the wire. Nothing in this file touches innerHTML. The wires are SVG
 * elements built by hand for the same reason.
 */

import { initialBeam, stepBeam } from '../mission/beam.js';
import { audio } from '../audio/ConsoleAudio.js';

import type { BeamState } from '../mission/beam.js';
import type { DeviceView, PlayerMessage } from './surface.js';

const STYLE_ID = 'omniscient-board-styles';

const BOARD_CSS = `
.omni-board {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px 14px;
  border-top: 1px solid rgba(127, 224, 138, 0.22);
  background: rgba(6, 14, 9, 0.5);
}
.omni-board__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.omni-board__prompt {
  font-size: 12px;
  letter-spacing: 0.06em;
  color: #9fd8a8;
  text-transform: uppercase;
}
.omni-board__fold {
  padding: 2px 10px;
  border: 1px solid rgba(127, 224, 138, 0.4);
  border-radius: 3px;
  background: transparent;
  color: rgba(207, 233, 210, 0.85);
  font: inherit;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  white-space: nowrap;
}
.omni-board__fold:hover { border-color: rgba(127, 224, 138, 0.8); }
.omni-board--folded .omni-board__stage,
.omni-board--folded .omni-board__foot { display: none; }
/* The wires are drawn on a layer behind the boxes, sized to the grid. */
.omni-board__stage { position: relative; }
.omni-board__wires {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
}
.omni-board__grid {
  position: relative;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 8px 26px;
  align-items: start;
}
.omni-board__column { display: flex; flex-direction: column; gap: 7px; }
.omni-board__spine {
  width: 1px;
  align-self: stretch;
  background: linear-gradient(
    to bottom,
    transparent,
    rgba(127, 224, 138, 0.28) 12%,
    rgba(127, 224, 138, 0.28) 88%,
    transparent
  );
}
.omni-board__box {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 7px 10px;
  border: 1px solid rgba(127, 224, 138, 0.38);
  border-radius: 3px;
  background: rgba(10, 24, 15, 0.85);
  color: #cfe9d2;
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease;
}
.omni-board__box:hover { border-color: rgba(127, 224, 138, 0.8); }
.omni-board__box--armed {
  border-color: #7fe08a;
  background: rgba(20, 52, 28, 0.95);
  box-shadow: 0 0 0 1px rgba(127, 224, 138, 0.5);
}
.omni-board__box--linked { border-color: rgba(127, 224, 138, 0.7); }
.omni-board__box--slot { font-size: 13px; letter-spacing: 0.04em; }
.omni-board__note {
  font-size: 11px;
  color: rgba(159, 216, 168, 0.72);
  font-style: italic;
}
.omni-board__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.omni-board__status { font-size: 11px; color: rgba(159, 216, 168, 0.8); }
.omni-board__status--score { color: #e0a24c; }
.omni-board__send {
  padding: 5px 16px;
  border: 1px solid rgba(127, 224, 138, 0.6);
  border-radius: 3px;
  background: rgba(16, 40, 22, 0.9);
  color: #cfe9d2;
  font: inherit;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
}
.omni-board__send:disabled { opacity: 0.35; cursor: default; }
/* The pipe run: a grid of pieces, each one a button that turns a quarter on click. */
.omni-board__pipes {
  display: grid;
  gap: 3px;
  justify-content: start;
}
.omni-board__cell {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid rgba(127, 224, 138, 0.28);
  border-radius: 2px;
  background: rgba(10, 24, 15, 0.85);
  color: #7fe08a;
  font: inherit;
  font-size: 17px;
  line-height: 1;
  cursor: pointer;
  transition: transform 120ms ease, border-color 120ms ease;
}
.omni-board__cell:hover { border-color: rgba(127, 224, 138, 0.75); }
/* Fixed pieces are already plumbed in - dimmer, and they do not take a pointer. */
.omni-board__cell--blank {
  border-color: transparent;
  background: transparent;
  cursor: default;
}
.omni-board__cell--fixed {
  cursor: default;
  color: rgba(127, 224, 138, 0.45);
  border-color: rgba(127, 224, 138, 0.14);
}
.omni-board__cell--end {
  border-color: #e0a24c;
  color: #e0a24c;
}
/* The lock: a row of pins, each carrying the position it has been given in the order. */
.omni-board__pins { display: flex; gap: 8px; flex-wrap: wrap; }
.omni-board__pin {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  width: 52px;
  padding: 8px 0 6px;
  border: 1px solid rgba(127, 224, 138, 0.34);
  border-radius: 3px;
  background: rgba(10, 24, 15, 0.85);
  color: #cfe9d2;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.omni-board__pin:hover { border-color: rgba(127, 224, 138, 0.8); }
.omni-board__pin--picked {
  border-color: #7fe08a;
  background: rgba(20, 52, 28, 0.95);
}
/* The number is the whole readout: a pin's place in the order the player is proposing. */
.omni-board__pin-order {
  min-height: 15px;
  font-size: 13px;
  color: #e0a24c;
  letter-spacing: 0.04em;
}
/* The chase: one track, clicked to call. */
.omni-board__track {
  position: relative;
  height: 74px;
  border: 1px solid rgba(127, 224, 138, 0.3);
  border-radius: 3px;
  background: rgba(6, 14, 9, 0.9);
  cursor: crosshair;
  overflow: hidden;
}
/* The beam is a soft wedge, because that is what a torch is. */
.omni-board__beam {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 74px;
  margin-left: -37px;
  background: radial-gradient(
    ellipse at center,
    rgba(255, 226, 160, 0.5),
    rgba(255, 226, 160, 0.12) 55%,
    transparent 72%
  );
  pointer-events: none;
}
.omni-board__follower {
  position: absolute;
  top: 22px;
  width: 14px;
  height: 30px;
  margin-left: -7px;
  border-radius: 2px;
  background: #d8d2c4;
  pointer-events: none;
}
/* Lit: he throws an arm up and stops being a silhouette. */
.omni-board__follower--lit { background: #fff3d4; }
.omni-board__hold {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 3px;
  background: #7fe08a;
  pointer-events: none;
}
`;

export function injectBoardStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = BOARD_CSS;
  document.head.appendChild(style);
}

const SVG_NS = 'http://www.w3.org/2000/svg';

type PipeGridView = Extract<DeviceView, { kind: 'pipes' }>['grid'];

/**
 * Box-drawing characters, indexed by quarter turn.
 *
 * A straight piece has only two distinct orientations and a cross has one, so the tables
 * are short and the modulo does the rest. Using the characters directly means a pipe
 * piece needs no art, and at this size it reads better than a sprite would.
 */
const GLYPHS: Record<string, string[]> = {
  straight: ['\u2503', '\u2501'],
  bend: ['\u2517', '\u250f', '\u2513', '\u251b'],
  tee: ['\u2523', '\u2533', '\u252b', '\u253b'],
  cross: ['\u254b'],
  blank: [' '],
};

function pipeGlyph(shape: string, turn: number): string {
  const options = GLYPHS[shape] ?? [' '];
  return options[((turn % options.length) + options.length) % options.length];
}

export class BoardPanel {
  public readonly element: HTMLDivElement;

  private readonly stage: HTMLDivElement;
  private readonly wires: SVGSVGElement;
  private readonly grid: HTMLDivElement;
  private readonly status: HTMLSpanElement;
  private readonly send: HTMLButtonElement;

  /** person id -> slot id. The player's answer so far. */
  private links = new Map<string, string>();
  /** The box waiting for its other end, if any. */
  private armed: string | null = null;

  private personButtons = new Map<string, HTMLButtonElement>();
  private slotButtons = new Map<string, HTMLButtonElement>();
  /** Pipe cells, in grid order. */
  private cellButtons: HTMLButtonElement[] = [];
  /** Lock pins, by id. */
  private pinButtons = new Map<string, { button: HTMLButtonElement; order: HTMLSpanElement }>();
  /** The order the player is proposing, pin ids front to back. */
  private order: string[] = [];
  /** Live chase state, while a beam device is up. */
  private chase: BeamState | null = null;
  /** Every call the player has made, with its timestamp. */
  private calls: Array<{ at: number; to: number }> = [];
  private beamParts: {
    track: HTMLDivElement;
    beam: HTMLDivElement;
    follower: HTMLDivElement;
    hold: HTMLDivElement;
  } | null = null;
  private frame: number | null = null;
  private view: DeviceView | null = null;
  /** Player quarter-turns per cell, for a pipe device. */
  private rotations: number[] = [];
  /** Identity of the board currently rendered, so re-presenting does not wipe the work. */
  private renderedKey = '';

  constructor(private readonly dispatch: (message: PlayerMessage) => void) {
    injectBoardStyles();

    this.element = document.createElement('div');
    this.element.className = 'omni-board';

    /**
     * A head row with a fold control.
     *
     * The board had no way to put it down. A playtester could not find one and said so,
     * which is fair: a panel that appears on its own, covers the conversation and offers
     * no way out is a modal dialog pretending not to be one. Folding leaves the wiring
     * exactly where it was - this is getting it out of the way, not cancelling it.
     */
    const head = document.createElement('div');
    head.className = 'omni-board__head';

    const prompt = document.createElement('div');
    prompt.className = 'omni-board__prompt';
    head.appendChild(prompt);

    this.fold = document.createElement('button');
    this.fold.className = 'omni-board__fold';
    this.fold.type = 'button';
    this.fold.addEventListener('mousedown', (event) => {
      event.preventDefault();
      this.folded = !this.folded;
      if (this.view) this.refresh(this.view);
    });
    head.appendChild(this.fold);

    this.element.appendChild(head);

    this.stage = document.createElement('div');
    this.stage.className = 'omni-board__stage';

    this.wires = document.createElementNS(SVG_NS, 'svg');
    this.wires.setAttribute('class', 'omni-board__wires');
    this.stage.appendChild(this.wires);

    this.grid = document.createElement('div');
    this.grid.className = 'omni-board__grid';
    this.stage.appendChild(this.grid);
    this.element.appendChild(this.stage);

    const foot = document.createElement('div');
    foot.className = 'omni-board__foot';

    this.status = document.createElement('span');
    this.status.className = 'omni-board__status';
    foot.appendChild(this.status);

    this.send = document.createElement('button');
    this.send.className = 'omni-board__send';
    this.send.type = 'button';
    /**
     * Neutral, because the panel does not know who it is talking to.
     *
     * It said "Tell her", which was written when Ileana was the only person with a device
     * and read as a bug the moment Vasile got one. A shared panel cannot carry a pronoun.
     */
    this.send.textContent = 'Send it';
    this.send.addEventListener('mousedown', (event) => {
      audio.play('transmit');
      event.preventDefault();
      this.submit();
    });
    foot.appendChild(this.send);

    this.element.appendChild(foot);
    this.promptElement = prompt;
  }

  private readonly promptElement: HTMLDivElement;
  private readonly fold: HTMLButtonElement;
  private folded = false;

  /**
   * Render a board.
   *
   * Re-presenting the same board leaves the player's wiring alone. The session calls
   * `present()` on every state change - opening a hint, the contact saying something -
   * and half-finished work being wiped by an unrelated redraw is precisely the class of
   * bug that shipped in the suggestion chips.
   */
  public update(view: DeviceView | undefined): void {
    this.view = view ?? null;
    if (!view) {
      this.element.style.display = 'none';
      return;
    }
    this.element.style.display = '';

    const key =
      view.kind === 'relations'
        ? `relations|${view.prompt}|${view.people.map((p) => p.id).join(',')}`
        : view.kind === 'pipes'
          ? `pipes|${view.prompt}|${view.grid.cells.length}`
          : view.kind === 'lock'
            ? `lock|${view.prompt}|${view.pins.length}`
            : `beam|${view.prompt}|${view.spec.patience}`;
    if (key !== this.renderedKey) {
      this.renderedKey = key;
      this.links.clear();
      this.armed = null;
      this.rotations = view.kind === 'pipes' ? view.grid.cells.map(() => 0) : [];
      this.order = [];
      this.pinButtons.clear();
      if (this.frame !== null) {
        cancelAnimationFrame(this.frame);
        this.frame = null;
      }
      this.chase = null;
      this.beamParts = null;
      this.build(view);
    }

    this.promptElement.textContent = view.prompt;
    this.refresh(view);
  }

  private build(view: DeviceView): void {
    this.grid.replaceChildren();
    this.personButtons.clear();
    this.slotButtons.clear();
    this.cellButtons = [];

    if (view.kind === 'pipes') {
      this.buildPipes(view.grid);
      return;
    }

    if (view.kind === 'lock') {
      this.buildLock(view.pins);
      return;
    }

    if (view.kind === 'beam') {
      this.buildBeam();
      return;
    }

    const people = document.createElement('div');
    people.className = 'omni-board__column';
    for (const person of view.people) {
      const box = document.createElement('button');
      box.className = 'omni-board__box';
      box.type = 'button';

      const name = document.createElement('span');
      name.textContent = person.name;
      box.appendChild(name);

      const note = document.createElement('span');
      note.className = 'omni-board__note';
      note.textContent = person.note;
      box.appendChild(note);

      // mousedown, not click: a redraw between press and release swallows a click.
      box.addEventListener('mousedown', (event) => {
        event.preventDefault();
        audio.play('tap');
        this.tapPerson(person.id);
      });

      this.personButtons.set(person.id, box);
      people.appendChild(box);
    }
    this.grid.appendChild(people);

    const spine = document.createElement('div');
    spine.className = 'omni-board__spine';
    this.grid.appendChild(spine);

    const slots = document.createElement('div');
    slots.className = 'omni-board__column';
    for (const slot of view.slots) {
      const box = document.createElement('button');
      box.className = 'omni-board__box omni-board__box--slot';
      box.type = 'button';
      box.textContent = slot.label;
      box.addEventListener('mousedown', (event) => {
        event.preventDefault();
        audio.play('seat');
        this.tapSlot(slot.id);
      });
      this.slotButtons.set(slot.id, box);
      slots.appendChild(box);
    }
    this.grid.appendChild(slots);
  }

  /**
   * The pipe run.
   *
   * Every piece is a button that turns a quarter clockwise, which is the whole verb. No
   * drag, no selection state, nothing to learn - the same reasoning as the relation
   * board's click-then-click, and here it is even simpler because a piece has only one
   * thing it can do.
   *
   * Glyphs rather than sprites: box-drawing characters already ARE pipe pieces, they
   * rotate by picking a different character, and they cost no texture and no atlas. The
   * grid is small enough that a 17px glyph reads perfectly.
   */
  private buildPipes(grid: PipeGridView): void {
    const board = document.createElement('div');
    board.className = 'omni-board__pipes';
    board.style.gridTemplateColumns = `repeat(${grid.columns}, 34px)`;

    grid.cells.forEach((cell, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      const ends = index === grid.source || index === grid.drain;
      button.className = [
        'omni-board__cell',
        cell.fixed ? 'omni-board__cell--fixed' : '',
        cell.shape === 'blank' ? 'omni-board__cell--blank' : '',
        ends ? 'omni-board__cell--end' : '',
      ]
        .filter(Boolean)
        .join(' ');

      if (!cell.fixed && cell.shape !== 'blank') {
        button.addEventListener('mousedown', (event) => {
          event.preventDefault();
          audio.play('seat');
          this.rotations[index] = (this.rotations[index] + 1) % 4;
          if (this.view) this.refresh(this.view);
        });
      }

      this.cellButtons.push(button);
      board.appendChild(button);
    });

    this.grid.appendChild(board);
  }

  /**
   * The chase.
   *
   * One track. Click where you want the light and the beam swings there at the speed a
   * frightened hand can move it, which is the entire mechanic - a player who clicks ON the
   * follower is always behind him, and a player who clicks where he is GOING holds him.
   *
   * The loop runs here because a live beat needs frames and the runtime does not have any.
   * It does not decide anything: every click is recorded with its timestamp and the whole
   * list goes up at the end for the runtime to replay (§157).
   */
  private buildBeam(): void {
    const track = document.createElement('div');
    track.className = 'omni-board__track';

    const beam = document.createElement('div');
    beam.className = 'omni-board__beam';
    track.appendChild(beam);

    const follower = document.createElement('div');
    follower.className = 'omni-board__follower';
    track.appendChild(follower);

    const hold = document.createElement('div');
    hold.className = 'omni-board__hold';
    track.appendChild(hold);

    track.addEventListener('mousedown', (event) => {
      event.preventDefault();
      if (!this.chase || this.chase.blinded || this.chase.caught) return;
      const rect = track.getBoundingClientRect();
      const to = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      audio.play('tap');
      // Straight up to the world as well as into the local simulation, so the torch in the
      // diorama swings at the same moment the wedge on this panel does.
      this.dispatch({ kind: 'aim', to: Math.max(-1, Math.min(1, to)) });
      this.calls.push({ at: this.chase.elapsed, to });
      this.chase = { ...this.chase, aim: Math.max(-1, Math.min(1, to)) };
    });

    this.grid.appendChild(track);
    this.beamParts = { track, beam, follower, hold };
    this.chase = initialBeam();
    this.calls = [];
    this.startChase();
  }

  /**
   * Drive the chase until somebody wins, then submit.
   *
   * Frame time is clamped: a stall - a rebuild, a dropped frame, the window losing focus -
   * must not hand the follower half a second of free movement, which would lose a chase
   * the player was winning for reasons on nobody's screen.
   */
  private startChase(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    let last = performance.now();

    const tick = (now: number): void => {
      const view = this.view;
      const state = this.chase;
      if (!view || view.kind !== 'beam' || !state) return;

      const delta = Math.min((now - last) / 1000, 1 / 20);
      last = now;

      const next = stepBeam(view.spec, state, delta);
      this.chase = next;
      this.paintChase(view.spec.holdToBlind, view.spec.width);

      if (next.blinded || next.caught) {
        this.frame = null;
        this.dispatch({ kind: 'device', submission: { kind: 'beam', calls: this.calls } });
        return;
      }
      this.frame = requestAnimationFrame(tick);
    };

    this.frame = requestAnimationFrame(tick);
  }

  private paintChase(holdToBlind: number, width: number): void {
    const parts = this.beamParts;
    const state = this.chase;
    if (!parts || !state) return;

    const place = (value: number): string => `${((value + 1) / 2) * 100}%`;
    parts.beam.style.left = place(state.beam);
    parts.follower.style.left = place(state.follower);
    parts.follower.classList.toggle(
      'omni-board__follower--lit',
      Math.abs(state.beam - state.follower) <= width
    );
    parts.hold.style.width = `${Math.min(1, state.held / holdToBlind) * 100}%`;

    this.status.className = 'omni-board__status';
    this.status.textContent = state.blinded
      ? 'he has turned away'
      : state.caught
        ? 'he has reached her'
        : 'click where the light should go';
  }

  /**
   * The lock: a row of pins, tapped into an order.
   *
   * Tap a pin to add it to the sequence, tap it again to take it and everything after it
   * back off - because a lock is worked in order and undoing the third pin necessarily
   * undoes the fourth and fifth. Making the control behave the way the mechanism behaves
   * is cheaper to learn than any label explaining it would be.
   */
  private buildLock(pins: Array<{ id: string; label: string }>): void {
    const row = document.createElement('div');
    row.className = 'omni-board__pins';

    for (const pin of pins) {
      const button = document.createElement('button');
      button.className = 'omni-board__pin';
      button.type = 'button';

      const order = document.createElement('span');
      order.className = 'omni-board__pin-order';
      button.appendChild(order);

      const label = document.createElement('span');
      label.textContent = pin.label;
      button.appendChild(label);

      button.addEventListener('mousedown', (event) => {
        event.preventDefault();
        const at = this.order.indexOf(pin.id);
        // Un-setting a pin is not the same gesture as setting one, and the lock is the one
        // device where the player is listening for a difference.
        audio.play(at >= 0 ? 'reject' : 'seat');
        if (at >= 0) this.order.length = at;
        else this.order.push(pin.id);
        if (this.view) this.refresh(this.view);
      });

      this.pinButtons.set(pin.id, { button, order });
      row.appendChild(button);
    }

    this.grid.appendChild(row);
  }

  /**
   * Tapping a person: arm it, or unlink it if it already has a wire.
   *
   * Making a linked box unlink on tap means there is no separate delete gesture to find.
   * The way to change your mind is the same as the way you made the link.
   */
  private tapPerson(personId: string): void {
    if (this.links.has(personId)) {
      this.links.delete(personId);
      this.armed = personId;
    } else {
      this.armed = this.armed === personId ? null : personId;
    }
    if (this.view) this.refresh(this.view);
  }

  private tapSlot(slotId: string): void {
    if (!this.armed) return;
    this.links.set(this.armed, slotId);
    this.armed = null;
    if (this.view) this.refresh(this.view);
  }

  private submit(): void {
    const view = this.view;
    if (!view) return;

    if (view.kind === 'lock') {
      if (!this.order.length) return;
      this.dispatch({
        kind: 'device',
        submission: { kind: 'lock', order: [...this.order] },
      });
      return;
    }

    if (view.kind === 'relations') {
      if (this.links.size < view.people.length) return;
      this.dispatch({
        kind: 'device',
        submission: { kind: 'relations', links: Object.fromEntries(this.links) },
      });
      return;
    }

    this.dispatch({
      kind: 'device',
      submission: { kind: 'pipes', rotations: [...this.rotations] },
    });
  }

  private refresh(view: DeviceView): void {
    this.element.classList.toggle('omni-board--folded', this.folded);
    this.fold.textContent = this.folded ? 'Show' : 'Hide';
    if (this.folded) return;

    if (view.kind === 'beam') {
      // The frame loop owns this one; refresh must not fight it.
      this.send.disabled = true;
      this.paintChase(view.spec.holdToBlind, view.spec.width);
      this.wires.replaceChildren();
      return;
    }

    if (view.kind === 'lock') {
      for (const [id, parts] of this.pinButtons) {
        const at = this.order.indexOf(id);
        parts.button.classList.toggle('omni-board__pin--picked', at >= 0);
        parts.order.textContent = at >= 0 ? String(at + 1) : '';
      }
      this.send.disabled = this.order.length === 0;
      this.status.className = view.note
        ? 'omni-board__status omni-board__status--score'
        : 'omni-board__status';
      this.status.textContent =
        view.note ?? 'name the order they should be set in';
      this.wires.replaceChildren();
      return;
    }

    if (view.kind === 'pipes') {
      view.grid.cells.forEach((cell, index) => {
        const button = this.cellButtons[index];
        if (button) button.textContent = pipeGlyph(cell.shape, cell.turn + this.rotations[index]);
      });
      this.send.disabled = false;
      this.status.className = view.note
        ? 'omni-board__status omni-board__status--score'
        : 'omni-board__status';
      this.status.textContent = view.note ?? 'turn the pieces until it runs';
      this.wires.replaceChildren();
      return;
    }

    for (const [id, button] of this.personButtons) {
      button.classList.toggle('omni-board__box--armed', this.armed === id);
      button.classList.toggle('omni-board__box--linked', this.links.has(id));
    }

    const used = new Set(this.links.values());
    for (const [id, button] of this.slotButtons) {
      button.classList.toggle('omni-board__box--linked', used.has(id));
    }

    const placed = this.links.size;
    const total = view.people.length;
    this.send.disabled = placed < total;

    if (view.note && placed === total) {
      this.status.className = 'omni-board__status omni-board__status--score';
      this.status.textContent = view.note;
    } else if (this.armed) {
      const name = view.people.find((person) => person.id === this.armed)?.name ?? '';
      this.status.className = 'omni-board__status';
      this.status.textContent = `${name} is their... (pick one on the right)`;
    } else {
      this.status.className = 'omni-board__status';
      // Says what to do next rather than reporting a score. A disabled button with
      // "3 of 5 placed" beside it does not tell anybody what the button is waiting for.
      this.status.textContent =
        placed === 0
          ? 'pick a name, then pick what they are to her'
          : placed < total
            ? `${total - placed} still to place`
            : 'ready - send it';
    }

    this.drawWires();
  }

  /**
   * Draw a wire per link.
   *
   * Measured from the live layout rather than from anything assumed about the grid, so
   * the wires follow whatever the boxes actually did - which matters because the boxes
   * are text and text reflows.
   */
  private drawWires(): void {
    this.wires.replaceChildren();

    const frame = this.stage.getBoundingClientRect();
    if (frame.width === 0) return;

    this.wires.setAttribute('viewBox', `0 0 ${frame.width} ${frame.height}`);

    for (const [personId, slotId] of this.links) {
      const from = this.personButtons.get(personId)?.getBoundingClientRect();
      const to = this.slotButtons.get(slotId)?.getBoundingClientRect();
      if (!from || !to) continue;

      const x1 = from.right - frame.left;
      const y1 = from.top + from.height / 2 - frame.top;
      const x2 = to.left - frame.left;
      const y2 = to.top + to.height / 2 - frame.top;
      // Horizontal control points: the wire leaves and arrives level, the way a patched
      // cable hangs, instead of cutting the diagonal like a diagram.
      const bend = Math.max(18, (x2 - x1) * 0.45);

      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute(
        'd',
        `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`
      );
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', '#7fe08a');
      path.setAttribute('stroke-width', '1.4');
      path.setAttribute('stroke-opacity', '0.75');
      this.wires.appendChild(path);

      for (const [cx, cy] of [
        [x1, y1],
        [x2, y2],
      ]) {
        const dot = document.createElementNS(SVG_NS, 'circle');
        dot.setAttribute('cx', String(cx));
        dot.setAttribute('cy', String(cy));
        dot.setAttribute('r', '2.4');
        dot.setAttribute('fill', '#7fe08a');
        this.wires.appendChild(dot);
      }
    }
  }
}
