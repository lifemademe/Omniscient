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
import { describe } from '../mission/pursuit.js';
import { reached } from '../mission/pipes.js';
import { narrow } from '../mission/traces.js';
import { audio } from '../audio/ConsoleAudio.js';

import type { BeamState } from '../mission/beam.js';
import type { ClueId, Evidence } from '../mission/traces.js';
import { createKitPlate } from './kit.js';
import type { DeviceView, PlayerMessage } from './surface.js';

const STYLE_ID = 'omniscient-board-styles';

const BOARD_CSS = `
/*
 * The panel bounds ITSELF, and the working area is what gives way.
 *
 * Reported as the send button being unclickable after picking from the bag, which it
 * was - by being off the bottom of the screen. The panel sits in the console column
 * above the input, its height was whatever its contents came to, and six items two
 * across is tall enough to push its own foot past the edge. The button was enabled
 * the whole time and simply not in the room.
 *
 * So: a ceiling on the panel, the head and the foot fixed, and the grid taking
 * whatever is left and scrolling inside it. The send button cannot leave the screen
 * now however many things a contact has in their bag, which is the property worth
 * having - a device the player can see and not reach is worse than no device.
 */
.omni-board {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px 14px;
  border-top: 1px solid rgba(127, 224, 138, 0.22);
  background: rgba(6, 14, 9, 0.5);
}
.omni-board__head, .omni-board__foot { flex: none; }
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
/* The wires are drawn on a layer behind the boxes, sized to the grid. */
/*
 * Natural height, and the TAB scrolls it.
 *
 * Not the grid. The wires are an absolutely positioned SVG over this stage and the
 * boxes they join are inside the grid, so anything that scrolls one and not the
 * other separates them - which is exactly what happened. Letting the whole board
 * be as tall as it needs and giving the panel around it the scroll keeps head,
 * boxes, wires and foot in one moving piece.
 */
.omni-board__stage { position: relative; display: flex; }
.omni-board__wires {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
}
/*
 * The working area, and it scrolls.
 *
 * The console column is a fixed height and this panel sits inside it above the
 * input, so a device taller than the room left simply ran off the bottom of the
 * screen - reported on the six-item bag, where the last two could not be reached at
 * all. Bounding it here rather than on the panel keeps the prompt and the send
 * button pinned, which is what you want when the thing you are scrolling is the
 * choice you are about to make.
 */
.omni-board__grid {
  position: relative;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 8px 26px;
  align-items: start;
  width: 100%;
  /*
   * NOT a scroll container, and that is the fix for the relation board's wires.
   *
   * They are an absolutely positioned SVG over the stage while the boxes they join
   * live in here, so scrolling this moved the boxes and left every wire behind -
   * reported as the connectors not scrolling with the inventory. Two coordinate
   * spaces, one of which moved.
   *
   * The scroll was only ever here because the panel was sharing a column with the
   * transcript and had a few hundred pixels to fit into. It has its own tab now, so
   * it has the height it needs and nothing has to slide.
   */
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

/*
 * The bag. A shelf of things rather than a list of names - the player is meant to look
 * at an object and decide what it does, which is a different act from reading a label.
 */
.omni-kit {
  /*
   * Across all three columns of the board grid, then two per row inside that.
   *
   * Without the span this lands in the first 1fr of a layout built for the
   * relation board - boxes, spine, slots - and comes out as one narrow column down
   * the left with two thirds of the panel empty beside it. That is what a six item
   * bag looked like: a list, and a long one.
   */
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  width: 100%;
}
.omni-kit__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 8px 6px 9px;
  background: #0d1c14;
  border: 1px solid #23422c;
  color: #cfe6c4;
  font: inherit;
  cursor: pointer;
  transition: border-color 120ms ease, transform 120ms ease;
}
.omni-kit__item:hover { border-color: #4f9a5e; transform: translateY(-2px); }
.omni-kit__item--held {
  border-color: #d8ffb0;
  background: #14301f;
  box-shadow: inset 0 0 18px rgba(127, 224, 138, 0.16);
}
.omni-kit__item img { width: 54px; height: 54px; image-rendering: pixelated; }
.omni-kit__name {
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #d8ffb0;
}
.omni-kit__note {
  font-size: 10px;
  line-height: 1.35;
  text-align: center;
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

/* -- The surveillance board -----------------------------------------------------------
   The count is deliberately the largest element on the panel. It is the only number in
   this game that the player watches fall, and the mission is that fall. */
.omni-trace {
  display: flex;
  flex-direction: column;
  /* The board grid is grid-template-columns: 1fr auto 1fr, built for the relations board's
     two columns and a spine. Left alone this panel sat in the first 1fr - a third of the
     width - which wrapped the switches one per line and ellipsed every row. It is not a
     two-column device, so it spans all three.
     (No backticks in here - this whole block is a template literal, and one closes it.) */
  grid-column: 1 / -1;
  min-width: 0;
}
.omni-trace__head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 10px;
}
.omni-trace__count {
  font-size: 40px;
  line-height: 1;
  letter-spacing: 0.04em;
  color: #7fe08a;
}
.omni-trace__caption { font-size: 11px; color: rgba(159, 216, 168, 0.72); }
.omni-trace__facts {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 9px;
}
/* Off by default and visibly so: an unapplied fact is something the player has been given
   and has not used yet, which is exactly the state the puzzle wants them thinking about. */
.omni-trace__fact {
  padding: 4px 9px;
  border: 1px solid rgba(127, 224, 138, 0.28);
  border-radius: 3px;
  background: transparent;
  color: rgba(159, 216, 168, 0.65);
  font: inherit;
  font-size: 11px;
  letter-spacing: 0.08em;
  cursor: pointer;
}
.omni-trace__fact:hover { border-color: rgba(127, 224, 138, 0.6); }
.omni-trace__fact--on {
  border-color: #7fe08a;
  background: rgba(127, 224, 138, 0.14);
  color: #cfe9d2;
}
.omni-trace__list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-height: 260px;
  overflow-y: auto;
}
.omni-trace__row {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 5px 9px;
  border: 1px solid transparent;
  border-radius: 3px;
  background: rgba(10, 24, 15, 0.7);
  color: #cfe9d2;
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.omni-trace__row:hover { border-color: rgba(127, 224, 138, 0.5); }
.omni-trace__row--picked {
  border-color: #7fe08a;
  background: rgba(127, 224, 138, 0.16);
}
.omni-trace__plate { letter-spacing: 0.16em; color: #e0a24c; }
.omni-trace__row--wrap { align-items: flex-start; }
.omni-trace__row--wrap .omni-trace__detail { white-space: normal; overflow: visible; }
.omni-trace__row--wrap .omni-trace__plate { flex: 0 0 auto; }
.omni-trace__detail {
  color: rgba(159, 216, 168, 0.78);
  font-size: 11px;
  /* One line. The rows are a list to scan, and a row that reflows to four lines when the
     panel narrows stops being scannable at exactly the moment there are most of them. */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.omni-hop__sighting {
  margin-bottom: 10px;
  font-size: 12px;
  letter-spacing: 0.06em;
  color: #e0a24c;
}
.omni-hop__options { display: flex; flex-direction: column; gap: 4px; }
.omni-hop__option {
  display: flex;
  align-items: baseline;
  gap: 14px;
  padding: 8px 10px;
  border: 1px solid rgba(127, 224, 138, 0.32);
  border-radius: 3px;
  background: rgba(10, 24, 15, 0.7);
  color: #cfe9d2;
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.omni-hop__option:hover { border-color: rgba(127, 224, 138, 0.75); }
.omni-trace__more {
  padding: 5px 9px;
  font-size: 11px;
  color: rgba(159, 216, 168, 0.6);
}
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
/* No stray brace here. The one that used to be on this line was never opened, and
   CSS recovery does not just ignore it: the parser takes it as the start of the
   NEXT rule's selector, so the prelude became "} .omni-board__pipes", which is not
   a selector, so that entire rule was DROPPED. The .omni-board__pipes rule is what makes
   the pipe run a grid - without it the board fell back to block layout and the
   cells, which are display:flex and therefore block-level, stacked into a single
   column. Vasile's four-by-three run rendered as twelve tiles in a line.

   One character, invisible in review, and it only breaks the one rule that
   happens to follow it. See scripts/css-balanced.ts. */
/* -- The pipe run ---------------------------------------------------------------------
   A grid of pieces, each one a button that turns a quarter on click.

   ## Why the board shows the water

   Asked, in as many words: "how am I supposed to solve this?" - and the honest answer was
   that you were not, really. Nine box-drawing glyphs at 17px, no indication of which of the
   two orange cells was the sump, no feedback of any kind until you pressed SEND IT and a man
   told you it had come back on itself somewhere. That is not a topology puzzle, it is a
   1-in-32 guess with a flavour text loss screen, and the only way to actually reason it out
   was to run a flood fill in your head over a grid you could barely read.

   So the run is WET. Every rotation floods from the sump and the pieces the water reaches
   light up, so the player can see their own partial run growing and where it stops. That is
   the whole difference between guessing and solving: you stop asking "is this right" and
   start asking "why does it stop HERE", which is a question the board can answer.

   It does not leak the answer and does not cross §157's boundary. The fill runs on the
   board the player is looking at, using the rotations the player set, and every input to it
   is already on their screen. It reports what they have built, not what they should. */
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

/*
 * A blank is a slot with no pipe in it, NOT an absence.
 *
 * These were fully transparent, and the player read the first row as "shifted". It is not
 * shifted - cell 0 of Vasile's run is blank, so row 0's leftmost slot is empty - but with
 * the slot invisible there is nothing to say so. The board's own rectangle vanishes, and
 * with it the frame of reference the whole puzzle is reasoned against: you cannot see that
 * the run is four wide, so a row starting further right looks like a mistake.
 *
 * Drawn as a recessed socket instead. Dashed and very low contrast so it never competes
 * with a piece or invites a click, dark enough to read as a hole in the board rather than a
 * tile on it - and present, so the grid is a grid.
 */
.omni-board__cell--blank {
  border-style: dashed;
  border-color: rgba(127, 224, 138, 0.16);
  background: rgba(3, 9, 5, 0.6);
  cursor: default;
}
.omni-board__cell--fixed {
  cursor: default;
  color: rgba(127, 224, 138, 0.45);
  border-color: rgba(127, 224, 138, 0.14);
}
/*
 * ## These come after --fixed on purpose
 *
 * The .omni-board__cell--fixed rule sets its own colour and border-color, and both ends of the run
 * are fixed pieces. Declared earlier, every one of these lost the cascade to it at equal
 * specificity and the ends rendered as plain greyed-out tiles - which was the bug they were
 * added to solve.
 *
 * The order is the strength of the statement: fixed is the weakest thing a cell can say
 * about itself, which end of the run it is beats that, and having water in it beats
 * everything, because that is the one thing the player is actively watching change.
 *
 * (--end, which used to live here and painted both ends the same amber, is gone: an end
 * that does not say WHICH end is most of why the board could not be reasoned about.)
 *
 * No backticks anywhere in this block. The whole stylesheet is a template literal and one
 * backtick closes it - the same trap the .omni-trace comment above already records, and it
 * caught me again two hundred lines further down.
 */
/* Water in the pipe. Brighter and warmer-edged than a dry piece, so a partial run reads as
   a line growing out of the sump rather than as a scatter of selected tiles. */
.omni-board__cell--wet {
  border-color: rgba(143, 214, 232, 0.85);
  background: rgba(20, 58, 74, 0.9);
  color: #bfe6f4;
}
/* The two ends, told apart. They were both the same orange, so nothing on the board said
   which one the water starts at - and the prompt names them in an order the board does not
   repeat. Cool for the sump, because that is where water arrives from; amber for the
   outfall, because that is the one the whole request is trying to reach. */
.omni-board__cell--source {
  border-color: rgba(143, 214, 232, 0.9);
  color: #8fd6e8;
}
.omni-board__cell--drain {
  border-color: rgba(224, 162, 76, 0.9);
  color: #e0a24c;
}
.omni-board__legend {
  display: flex;
  gap: 14px;
  align-items: center;
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(159, 216, 168, 0.62);
}
.omni-board__legend b { font-weight: normal; }
.omni-board__legend .sump { color: #8fd6e8; }
.omni-board__legend .outfall { color: #e0a24c; }
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

/** Minutes past midnight as a clock reading. */
function clock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * A fact, as the police would say it out loud.
 *
 * Returns null for anything the officer does not have, so the panel draws switches for
 * what he actually gave the player rather than for every field the type allows.
 */
function clueLabel(clue: ClueId, evidence: Evidence): string | null {
  switch (clue) {
    case 'colour':
      return evidence.colour ? evidence.colour.toUpperCase() : null;
    case 'body':
      return evidence.body ? evidence.body.toUpperCase() : null;
    case 'heading':
      return evidence.heading ? `HEADING ${evidence.heading.toUpperCase()}` : null;
    case 'brokenLight':
      return evidence.brokenLight === undefined
        ? null
        : evidence.brokenLight
          ? 'ONE LIGHT OUT'
          : 'LIGHTS OK';
    case 'seenBetween':
      return evidence.seenBetween
        ? `${clock(evidence.seenBetween[0])}-${clock(evidence.seenBetween[1])}`
        : null;
    case 'plate':
      // Dots where the camera read nothing, so the shape of what they have is visible.
      return evidence.plate
        ? `PLATE ${evidence.plate.map((ch) => ch ?? '·').join('')}`
        : null;
  }
}

/**
 * What the commit button says when nothing has renamed it.
 *
 * A constant because two places write it now - the build and every refresh - and a literal
 * in both is a pair of strings waiting to disagree.
 */
const SEND_LABEL = 'Send it';

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
  /** The one thing out of the bag the player has hold of. */
  private held: string | null = null;
  /** The pin pressed since the last refresh, so a rising count can be attributed. */
  private tried: string | null = null;
  private kitButtons = new Map<string, HTMLButtonElement>();
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

    /*
     * No fold control. The device has its own tab now, and CHAT is two words away -
     * a second way to put it aside, inside the thing being put aside, is a control
     * whose whole job the tab bar already does better.
     */

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
    this.send.textContent = SEND_LABEL;
    /*
     * `click`, and the submit goes first.
     *
     * This was on `mousedown` with `audio.play` ahead of the submit, which is two ways
     * for a press to come to nothing and no reason for either. It is the only control
     * in the console on mousedown - the item buttons, the tabs, the chips are all on
     * click, and those demonstrably work in play mode - so if anything in the engine's
     * input handling swallows a mousedown over the overlay, this button and only this
     * button stops responding.
     *
     * Reported three times as the send button doing nothing. Twice it was something
     * else and this was ruled out by measurement, which is exactly why it is worth
     * removing now rather than defending: it costs nothing and it is one fewer thing
     * that can be true.
     *
     * The sound moved after the dispatch for the same reason. A press that made a
     * noise and did nothing would be the worst version of this.
     */
    this.send.addEventListener('click', (event) => {
      event.preventDefault();
      this.submit();
      audio.play('transmit');
    });
    foot.appendChild(this.send);

    this.element.appendChild(foot);
    this.promptElement = prompt;
  }

  /** Which of the officer's facts the player has applied. The narrowing IS the puzzle. */
  private traceFilters = new Set<ClueId>();
  /** The trace the player is pointing at, if any. */
  private picked: string | null = null;
  private traceParts: { count: HTMLElement; caption: HTMLElement; list: HTMLElement } | null =
    null;

  /** The chase, hop by hop: which one we are on and what has been picked so far. */
  private hopIndex = 0;
  private picks: string[] = [];
  private pursuitParts: { sighting: HTMLElement; options: HTMLElement } | null = null;

  /** Which fragments the player is claiming are the same car. */
  private claimed = new Set<string>();
  private trailParts: { headline: HTMLElement; list: HTMLElement } | null = null;

  private readonly promptElement: HTMLDivElement;

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
            : view.kind === 'beam'
              ? `beam|${view.prompt}|${view.spec.patience}`
              : view.kind === 'traces'
                ? `traces|${view.prompt}|${view.fleet.length}`
                : view.kind === 'pursuit'
                  ? `pursuit|${view.prompt}|${view.hops.length}`
                  : view.kind === 'trail'
                    ? `trail|${view.prompt}|${view.trail.fragments.length}`
                    : view.kind === 'unit'
                      ? `unit|${view.prompt}`
                      : `kit|${view.prompt}|${view.items.map((i) => i.id).join(',')}`;
    if (key !== this.renderedKey) {
      this.renderedKey = key;
      this.links.clear();
      this.armed = null;
      this.rotations = view.kind === 'pipes' ? view.grid.cells.map(() => 0) : [];
      this.order = [];
      this.held = null;
      this.kitButtons.clear();
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

    if (view.kind === 'traces') {
      this.buildTraces(view.fleet.length, view.evidence, view.reveal);
      return;
    }

    if (view.kind === 'pursuit') {
      this.buildPursuit();
      return;
    }

    if (view.kind === 'trail') {
      this.buildTrail();
      return;
    }

    if (view.kind === 'kit') {
      this.buildKit(view.items);
      return;
    }

    // The unit draws nothing here. Its only control is the footer's commit button, which
    // `refresh` renames - see the note where buildUnit used to be.
    if (view.kind === 'unit') return;

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
      button.className = [
        'omni-board__cell',
        cell.fixed ? 'omni-board__cell--fixed' : '',
        cell.shape === 'blank' ? 'omni-board__cell--blank' : '',
        index === grid.source ? 'omni-board__cell--source' : '',
        index === grid.drain ? 'omni-board__cell--drain' : '',
      ]
        .filter(Boolean)
        .join(' ');

      if (!cell.fixed && cell.shape !== 'blank') {
        button.addEventListener('mousedown', (event) => {
          event.preventDefault();
          audio.play('seat');
          this.rotations[index] = (this.rotations[index] + 1) % 4;
          this.paintFlow(grid);
          if (this.view) this.refresh(this.view);
        });
      }

      this.cellButtons.push(button);
      board.appendChild(button);
    });

    this.grid.appendChild(board);

    /*
     * The legend, because the prompt names the sump and the outfall and the board never did.
     * Two words and two colours - the cheapest possible way to turn "two orange squares"
     * into "this end and that end".
     */
    const legend = document.createElement('div');
    legend.className = 'omni-board__legend';
    const sump = document.createElement('span');
    sump.innerHTML = '<b class="sump">&#9633;</b> sump';
    const outfall = document.createElement('span');
    outfall.innerHTML = '<b class="outfall">&#9633;</b> outfall';
    legend.append(sump, outfall);
    this.grid.appendChild(legend);

    this.paintFlow(grid);
  }

  /**
   * Light the pieces the water currently reaches.
   *
   * Called on build and after every turn. The fill is nine cells - there is no reason to be
   * clever about when it runs, and running it every time is what makes it feel live.
   */
  private paintFlow(grid: PipeGridView): void {
    const wet = reached(grid, this.rotations);
    this.cellButtons.forEach((button, index) => {
      button.classList.toggle('omni-board__cell--wet', wet.has(index));
    });
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
  /**
   * The surveillance board: six switches and a number falling.
   *
   * ## Why the count is the biggest thing on the panel
   *
   * The mission is not "spot the car", it is "watch a city become one car". That only
   * lands if the number is the loudest element - a player who flips COLOUR and sees 180
   * become 40 has learned the whole verb in one click, without a tutorial line. Everything
   * else on this panel is subordinate to that readout.
   *
   * ## Why the facts are switches rather than applied automatically
   *
   * Because turning one OFF is how you understand it. The property this puzzle is built on
   * is that every clue is load-bearing - drop any one and two cars fit - and the only way
   * to feel that rather than be told it is to drop one and watch the count refuse to reach
   * 1. The switches make the design of the puzzle playable.
   *
   * ## Safe UI
   *
   * textContent throughout. Plates, colours and body types all come off the wire, and this
   * panel follows the same rule as every other: no innerHTML, ever.
   */
  private buildTraces(total: number, evidence: Evidence, reveal: ClueId[]): void {
    this.traceFilters = new Set();
    this.picked = null;

    /**
     * Its own column, because the shared board grid is a row.
     *
     * The relations board puts two columns of boxes side by side and the grid is built for
     * that. Appending the head, the switches and the list straight into it laid them out
     * horizontally and squeezed the caption into a one-word-wide sliver down the side of
     * the count. A device whose layout is vertical has to bring its own container.
     */
    const panel = document.createElement('div');
    panel.className = 'omni-trace';

    const head = document.createElement('div');
    head.className = 'omni-trace__head';

    const count = document.createElement('div');
    count.className = 'omni-trace__count';
    count.textContent = String(total);

    const caption = document.createElement('div');
    caption.className = 'omni-trace__caption';
    caption.textContent = `of ${total} tracked`;

    head.append(count, caption);
    panel.appendChild(head);

    /**
     * One switch per fact the police actually have.
     *
     * Driven by `reveal` rather than by iterating the evidence object, because the ORDER
     * is authored - the big drops come first so the player learns that filtering works
     * before they hit the part where it stops being enough.
     */
    const facts = document.createElement('div');
    facts.className = 'omni-trace__facts';
    for (const clue of reveal) {
      const label = clueLabel(clue, evidence);
      if (!label) continue;

      const toggle = document.createElement('button');
      toggle.className = 'omni-trace__fact';
      toggle.type = 'button';
      toggle.textContent = label;
      toggle.addEventListener('mousedown', (event) => {
        event.preventDefault();
        audio.play('tap');
        if (this.traceFilters.has(clue)) this.traceFilters.delete(clue);
        else this.traceFilters.add(clue);
        // Narrowing can remove the car the player had selected, and a selection that is no
        // longer on screen would submit something they cannot see.
        this.picked = null;
        this.refreshTraces();
      });
      facts.appendChild(toggle);
    }
    panel.appendChild(facts);

    const list = document.createElement('div');
    list.className = 'omni-trace__list';
    panel.appendChild(list);
    this.grid.appendChild(panel);

    this.traceParts = { count, caption, list };
    this.refreshTraces();
  }

  /** The number of survivors the panel is allowed to draw before it asks for more filters. */
  private static readonly TRACE_PAGE = 36;

  /**
   * Recompute the survivors and redraw.
   *
   * The list is capped and SAYS SO. A silent truncation would read as "these are all the
   * cars that fit", which is the one lie this panel must not tell - a player who picks
   * from a list they believe is complete has been cheated by the interface rather than
   * beaten by the puzzle.
   */
  private refreshTraces(): void {
    const view = this.view;
    if (!view || view.kind !== 'traces' || !this.traceParts) return;

    const applied = [...this.traceFilters];
    const survivors = narrow(view.fleet, view.evidence, applied);
    const { count, caption, list } = this.traceParts;

    count.textContent = String(survivors.length);
    caption.textContent =
      applied.length === 0
        ? `of ${view.fleet.length} tracked`
        : `of ${view.fleet.length} tracked, on ${applied.length} of ${view.reveal.length} facts`;

    // The switches carry state too - a fact that is on has to look on, or the player
    // cannot tell which of the officer's facts they have actually spent.
    const toggles = this.grid.querySelectorAll('.omni-trace__fact');
    view.reveal
      .filter((clue) => clueLabel(clue, view.evidence) !== null)
      .forEach((clue, i) => {
        toggles[i]?.classList.toggle('omni-trace__fact--on', this.traceFilters.has(clue));
      });

    for (const button of Array.from(list.children)) button.remove();

    const shown = survivors.slice(0, BoardPanel.TRACE_PAGE);
    for (const trace of shown) {
      const row = document.createElement('button');
      row.className = 'omni-trace__row';
      row.type = 'button';
      if (trace.id === this.picked) row.classList.add('omni-trace__row--picked');

      const plate = document.createElement('span');
      plate.className = 'omni-trace__plate';
      plate.textContent = trace.plate;

      const detail = document.createElement('span');
      detail.className = 'omni-trace__detail';
      // Everything the network knows about it, in the order the officer listed things.
      detail.textContent = [
        trace.colour,
        trace.body,
        clock(trace.lastSeen),
        trace.heading,
        trace.brokenLight ? 'one light out' : 'lights ok',
      ].join('  ');

      row.append(plate, detail);
      row.addEventListener('mousedown', (event) => {
        event.preventDefault();
        audio.play('seat');
        this.picked = trace.id;
        this.refreshTraces();
      });
      list.appendChild(row);
    }

    if (survivors.length > shown.length) {
      const more = document.createElement('div');
      more.className = 'omni-trace__more';
      more.textContent = `${survivors.length - shown.length} more - keep narrowing`;
      list.appendChild(more);
    }

    if (survivors.length === 0) {
      const none = document.createElement('div');
      none.className = 'omni-trace__more';
      // Reachable: the facts are consistent, but a player can switch on a filter set the
      // panel has already narrowed past. Says what to do rather than reporting an error.
      none.textContent = 'nothing matches all of that - take a fact back off';
      list.appendChild(none);
    }

    this.send.disabled = this.picked === null;
    if (view.note) {
      this.status.className = 'omni-board__status omni-board__status--score';
      this.status.textContent = view.note;
    }
  }

  /**
   * The chase: one sighting, and the junctions it could reach.
   *
   * Played locally rather than a beat per hop. A chase interrupted by a line of dialogue
   * between every guess is a conversation ABOUT a pursuit; this runs the sequence and
   * reports at the end, the way the beam board does.
   *
   * The options are described in words - "four blocks straight ahead", "two blocks back the
   * way he came" - because the player is judging whether a junction is plausibly where the
   * car has got to, and coordinates would turn that into a subtraction problem. It does not
   * hide the geometry on purpose: a player who reads "back the way he came" and rules it out
   * has understood the mechanic, and the difficulty is meant to live in weighing three facts
   * at once rather than in decoding the panel.
   */
  private buildPursuit(): void {
    this.hopIndex = 0;
    this.picks = [];

    const panel = document.createElement('div');
    panel.className = 'omni-trace';

    const sighting = document.createElement('div');
    sighting.className = 'omni-hop__sighting';

    const options = document.createElement('div');
    options.className = 'omni-hop__options';

    panel.append(sighting, options);
    this.grid.appendChild(panel);
    this.pursuitParts = { sighting, options };
    this.refreshPursuit();
  }

  private refreshPursuit(): void {
    const view = this.view;
    if (!view || view.kind !== 'pursuit' || !this.pursuitParts) return;

    const { sighting, options } = this.pursuitParts;
    for (const child of Array.from(options.children)) child.remove();

    const hop = view.hops[this.hopIndex];
    if (!hop) {
      // Every hop answered. The picks go up and the runtime decides what they were worth.
      sighting.textContent = 'TRAIL ENDS - no camera ahead of him';
      this.send.disabled = false;
      this.status.className = 'omni-board__status';
      this.status.textContent = view.note ?? 'that is the whole trail - send it';
      return;
    }

    /**
     * The speed is stated, because otherwise the question is not fair.
     *
     * The player is asked to rule out a junction eleven blocks away on five seconds of
     * travel, which is only a judgement if they know roughly how fast he is going. Without
     * it the first hop is a guess and every hop after it is inference from that guess.
     * A dispatcher would say it, so he says it.
     */
    sighting.textContent =
      `LAST CONFIRMED - heading ${hop.heading}, ${hop.seconds}s ago, doing about a block a `
      + `second. Which one picks him up?`;

    for (const option of hop.options) {
      const row = document.createElement('button');
      row.className = 'omni-hop__option';
      row.type = 'button';

      const id = document.createElement('span');
      id.className = 'omni-trace__plate';
      // Stable per hop, so a player can refer to one out loud while thinking.
      id.textContent = `CAM ${String(200 + this.hopIndex * 10 + hop.options.indexOf(option))}`;

      const where = document.createElement('span');
      where.className = 'omni-trace__detail';
      where.textContent = describe(hop.from, hop.heading, option.cell);

      row.append(id, where);
      row.addEventListener('mousedown', (event) => {
        event.preventDefault();
        audio.play('seat');
        this.picks.push(option.id);
        this.hopIndex++;
        this.refreshPursuit();
      });
      options.appendChild(row);
    }

    // Nothing to send until the chase has been played out.
    this.send.disabled = true;

    /**
     * What makes a camera the right one, said out loud.
     *
     * Asked, about this exact board: "how am I supposed to solve this?" - and there was no
     * answer on screen, because the only line that could have carried one was showing a
     * hint from another mission entirely.
     *
     * The rule is three tests and `classify` applies them in this order: he cannot have
     * gone backwards, he cannot have got further than the elapsed time allows, and he has
     * not left his street. Every wrong option in a hop fails exactly one of them, so naming
     * the three is enough - it turns four distances into a process of elimination without
     * pointing at the answer.
     *
     * The sighting line above already gives the two numbers it needs: which way he was
     * pointed and how long ago.
     */
    this.status.className = view.note
      ? 'omni-board__status omni-board__status--score'
      : 'omni-board__status';
    this.status.textContent =
      view.note ??
      'he has not turned back, cannot outrun the clock, and is still on his street - one camera is all three';
  }

  /**
   * The cold trail: everything the network caught, and a question about which of it matters.
   *
   * A checklist rather than a sequence, because the player is not being asked to order
   * anything - time already orders it. They are being asked which of nine things that
   * happened in the same corner of the night are the same vehicle, and that is a judgement
   * made by looking at all of them at once.
   *
   * Sorted by time, always. It is the axis the reasoning runs along: a fragment only means
   * anything relative to the one before it, and a list in any other order would force the
   * player to do the sorting in their head before they could start.
   */
  /**
   * The contact's bag, laid out.
   *
   * A grid of what he has on him, each with his own words underneath it, and one of them
   * gets picked. Deliberately NOT a list of names: the player is meant to look at a thing
   * and decide what it does, which is a different act from reading a label - and it is the
   * one the whole request turns on.
   *
   * The panel has no idea which is right. It never receives the answer or the reasons -
   * see SessionController, which rebuilds these field by field on the way out.
   */
  /**
   * A machine offered builds NOTHING in the grid.
   *
   * It had its own oversized button in the board's body, which put two controls on one panel
   * for one action: a big one in the middle saying TAKE THE UNIT, and the footer's Send it
   * underneath it greyed out and doing nothing. The disabled one was the one every other
   * device has trained the player to press.
   *
   * So the unit uses the SEND BUTTON, which is where this panel's commit has always lived.
   * See `refresh`, which relabels it, and `submit`, which handles the payload. There is
   * nothing else to draw - no grid of parts, no photographs, no wires - just the prompt
   * above and the commit below, which is this panel with everything unnecessary removed
   * rather than a special case bolted onto it.
   */
  private buildKit(items: Array<{ id: string; name: string; note: string }>): void {
    const shelf = document.createElement('div');
    shelf.className = 'omni-kit';

    for (const item of items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'omni-kit__item';

      const plate = createKitPlate(item.id);
      if (plate) {
        const image = document.createElement('img');
        image.src = plate;
        image.alt = '';
        button.appendChild(image);
      }

      const name = document.createElement('span');
      name.className = 'omni-kit__name';
      name.textContent = item.name;

      const note = document.createElement('span');
      note.className = 'omni-kit__note';
      note.textContent = item.note;

      button.append(name, note);
      button.addEventListener('click', () => {
        this.held = this.held === item.id ? null : item.id;
        for (const [id, other] of this.kitButtons) {
          other.classList.toggle('omni-kit__item--held', id === this.held);
        }
        this.refreshKit();
      });

      this.kitButtons.set(item.id, button);
      shelf.appendChild(button);
    }

    this.grid.appendChild(shelf);
  }

  private refreshKit(): void {
    this.send.disabled = !this.held;
    /*
     * Clear the pick after it has been sent.
     *
     * A wrong answer left the item selected and the status still reading "ready to
     * tell him", so pressing send again did the same thing with no sign anything had
     * happened - which is what made a working button feel broken. Letting go of it
     * makes the panel ask the question again, which is what it is doing.
     */
    this.status.textContent = this.held
      ? 'ready to tell him'
      : 'pick what will do the job';
  }

  /** Drop the pick, so the bag reads as a fresh question after a wrong one. */
  private clearKit(): void {
    this.held = null;
    for (const button of this.kitButtons.values()) {
      button.classList.remove('omni-kit__item--held');
    }
    this.refreshKit();
  }

  private buildTrail(): void {
    const view = this.view;
    if (!view || view.kind !== 'trail') return;
    this.claimed = new Set();

    const panel = document.createElement('div');
    panel.className = 'omni-trace';

    const headline = document.createElement('div');
    headline.className = 'omni-hop__sighting';

    const list = document.createElement('div');
    list.className = 'omni-trace__list';

    const ordered = [...view.trail.fragments].sort((a, b) => a.at - b.at);
    for (const fragment of ordered) {
      const row = document.createElement('button');
      // --wrap: these rows carry a position AND a source, and one line ellipsed the source
      // away entirely - which threw out the only writing that gives this phase its texture
      // while keeping the arithmetic. Both fit if the row is allowed two lines.
      row.className = 'omni-trace__row omni-trace__row--wrap';
      row.type = 'button';

      const when = document.createElement('span');
      when.className = 'omni-trace__plate';
      when.textContent = `+${fragment.at}s`;

      const what = document.createElement('span');
      what.className = 'omni-trace__detail';
      /**
       * WHERE, not only what.
       *
       * The rule the player is applying is whether a car could have got from one of these
       * to the next in the time between them - and the first version of this panel printed
       * the time and the source and nothing else, which makes that question unanswerable.
       * A list of nine things with no positions is not a deduction, it is nine coin flips
       * with atmosphere.
       *
       * Described relative to where the cameras lost him, in the same words the chase uses,
       * because it is the same reasoning continued past the edge of the network.
       */
      what.textContent =
        `${describe(view.trail.from, view.trail.heading, fragment.cell)}  -  ${fragment.detail}`;

      row.append(when, what);
      row.addEventListener('mousedown', (event) => {
        event.preventDefault();
        audio.play('tap');
        if (this.claimed.has(fragment.id)) this.claimed.delete(fragment.id);
        else this.claimed.add(fragment.id);
        this.refreshTrail();
      });
      list.appendChild(row);
    }

    panel.append(headline, list);
    this.grid.appendChild(panel);
    this.trailParts = { headline, list };
    this.refreshTrail();
  }

  private refreshTrail(): void {
    const view = this.view;
    if (!view || view.kind !== 'trail' || !this.trailParts) return;

    this.trailParts.headline.textContent =
      `LAST SEEN heading ${view.trail.heading} - ${this.claimed.size} of `
      + `${view.trail.fragments.length} claimed as him`;

    const ordered = [...view.trail.fragments].sort((a, b) => a.at - b.at);
    Array.from(this.trailParts.list.children).forEach((row, i) => {
      row.classList.toggle('omni-trace__row--picked', this.claimed.has(ordered[i].id));
    });

    // Two is the fewest that can describe a journey, so anything less is not a claim yet.
    this.send.disabled = this.claimed.size < 2;
    if (view.note) {
      this.status.className = 'omni-board__status omni-board__status--score';
      this.status.textContent = view.note;
    }
  }

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

      /**
       * Press a pin and it is TRIED, immediately.
       *
       * This used to compose an order locally and wait for Send, so the player made five
       * blind choices and then found out about all of them at once - every piece of
       * information in the puzzle arrived after the decisions that needed it. Now each
       * press asks the lock, and the lock answers in the only terms it has: the pin lifts
       * and the cylinder turns a little, or the whole set drops.
       *
       * `click`, and the dispatch before the sound - the same fix the Send button needed.
       * A press that made a noise and did nothing is the worst version of this.
       */
      button.addEventListener('click', (event) => {
        event.preventDefault();
        if (this.view?.kind !== 'lock') return;
        /*
         * `tried` is set BEFORE the dispatch, and that is not tidiness.
         *
         * `dispatch` is synchronous all the way down: it runs the session, which grades
         * the press and calls `present`, which calls `refresh` - so the reconcile happens
         * INSIDE this line, before anything written after it exists. With the assignment
         * below the dispatch, refresh always saw a null `tried` and recorded nothing, and
         * the next press reconciled against the pin before it. Reported as pressing pin 3
         * and watching a different pin light up, which is exactly what a one-press lag
         * looks like from the outside.
         *
         * Simulated both orders against the real reconcile: after the dispatch the board
         * ends up holding [] having played the whole correct sequence; before it, it holds
         * the sequence.
         *
         * The same shape as the Send button's `mousedown` fix and the one on the mower's
         * take. Anything a synchronous dispatch will read has to be true before it is
         * called, because there is no "after" until it returns.
         */
        this.tried = pin.id;
        this.dispatch({
          kind: 'device',
          // Everything already up, plus the one being tried. The runtime holds the truth
          // about how many are up; this only ever appends to what it last reported.
          submission: { kind: 'lock', order: [...this.order.slice(0, this.view.set), pin.id] },
        });
        audio.play('seat');
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

    if (view.kind === 'unit') {
      // `cleared: 0` asks for the controls; the rig reports the real figure once the bank is
      // done. Both halves travel this one channel - see MissionRuntime.submitDevice.
      this.dispatch({ kind: 'device', submission: { kind: 'unit', cleared: 0 } });
      return;
    }

    if (view.kind === 'lock') {
      if (!this.order.length) return;
      this.dispatch({
        kind: 'device',
        submission: { kind: 'lock', order: [...this.order] },
      });
      return;
    }

    if (view.kind === 'trail') {
      if (this.claimed.size < 2) return;
      this.dispatch({ kind: 'device', submission: { kind: 'trail', picks: [...this.claimed] } });
      return;
    }

    if (view.kind === 'pursuit') {
      if (this.picks.length !== view.hops.length) return;
      this.dispatch({ kind: 'device', submission: { kind: 'pursuit', picks: [...this.picks] } });
      return;
    }

    if (view.kind === 'kit') {
      if (!this.held) return;
      this.dispatch({ kind: 'device', submission: { kind: 'kit', itemId: this.held } });
      this.clearKit();
      return;
    }

    if (view.kind === 'traces') {
      if (!this.picked) return;
      this.dispatch({ kind: 'device', submission: { kind: 'traces', traceId: this.picked } });
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
    /**
     * The commit button, named and enabled for the board that is actually up.
     *
     * On every refresh rather than once at build, and that is the whole lesson of the bug
     * this replaces. A board is cached by its render key, so its DOM outlives the device
     * that configured it - the unit's own button kept a `disabled` from one playthrough into
     * the next and could not be pressed on a second visit. Anything that depends on the
     * CURRENT device has to be written every present, not on whichever build happened first.
     *
     * The label is restored for every other board because this button is shared. A panel
     * that forgot to put "Send it" back would offer Tomas his bag under a heading about
     * taking a mower.
     */
    if (view.kind === 'unit') {
      this.send.textContent = view.accept;
      // Nothing to choose, so nothing to wait for. Every other board gates this on a pick.
      this.send.disabled = false;
    } else {
      this.send.textContent = SEND_LABEL;
    }

    /**
     * The status line, written from scratch every time, before any board gets to speak.
     *
     * The panel is shared and cached, so its DOM outlives the device that configured it -
     * the same fact the note above records about the send button, and the status line had
     * the same hole. Only three of the eight boards ever wrote this element, and the
     * pursuit board wrote it only when it had a score to report, so a fresh chase inherited
     * whatever the last device had left there.
     *
     * Which is how Vasile's "lit pieces have water in them - turn the rest until it reaches
     * the outfall" ended up under Lucian's camera list, in a mission with no pipes in it.
     * Reported by the player, and the giveaway is that it read as perfectly sensible advice
     * about the wrong game.
     *
     * A default here means a board that forgets to write its own hint shows nothing, which
     * is a missing sentence rather than a lie.
     */
    this.status.className = view.note
      ? 'omni-board__status omni-board__status--score'
      : 'omni-board__status';
    this.status.textContent = view.note ?? '';

    if (view.kind === 'kit') {
      this.refreshKit();
      this.wires.replaceChildren();
      return;
    }

    if (view.kind === 'beam') {
      // The frame loop owns this one; refresh must not fight it.
      this.send.disabled = true;
      this.paintChase(view.spec.holdToBlind, view.spec.width);
      this.wires.replaceChildren();
      return;
    }

    /*
     * The chase had no branch here at all - it fell through to `if (view.kind !==
     * 'relations') return`, so every present() left the pursuit board untouched and its
     * hint unwritten. It is refreshed on build and on each pick, and now on present too,
     * which is what makes the default above reach it.
     */
    if (view.kind === 'pursuit') {
      this.refreshPursuit();
      this.wires.replaceChildren();
      return;
    }

    if (view.kind === 'lock') {
      /*
       * Follow the lock, do not keep a second copy of it.
       *
       * The runtime says how many pins are up and this reconciles to that number. The board
       * knows which pin it last pressed, so a count that has gone up by one means that pin
       * set; a count of zero means the set dropped and everything is on the floor. Nothing
       * here decides anything - if the two ever disagree the lock wins, because the lock is
       * what the player can see turning.
       */
      if (view.set === 0) this.order.length = 0;
      else if (view.set === this.order.length + 1 && this.tried) this.order.push(this.tried);
      else if (view.set < this.order.length) this.order.length = view.set;
      this.tried = null;

      for (const [id, parts] of this.pinButtons) {
        const at = this.order.indexOf(id);
        parts.button.classList.toggle('omni-board__pin--picked', at >= 0);
        parts.order.textContent = at >= 0 ? String(at + 1) : '';
      }

      /*
       * No Send. The fifth pin setting IS the solve, so there is nothing left to commit -
       * and a button that only ever means "I have finished doing the thing you watched me
       * do" is a button asking to be pressed for no reason.
       */
      this.send.style.display = 'none';

      this.status.className = view.note
        ? 'omni-board__status omni-board__status--score'
        : 'omni-board__status';
      this.status.textContent =
        view.note ??
        (this.order.length === 0
          ? 'press a pin to try it'
          : `${this.order.length} up - press the next one`);
      this.wires.replaceChildren();
      return;
    }
    // Every other board commits with the button, so it has to come back.
    this.send.style.display = '';

    if (view.kind === 'pipes') {
      view.grid.cells.forEach((cell, index) => {
        const button = this.cellButtons[index];
        if (button) button.textContent = pipeGlyph(cell.shape, cell.turn + this.rotations[index]);
      });
      this.send.disabled = false;
      this.status.className = view.note
        ? 'omni-board__status omni-board__status--score'
        : 'omni-board__status';
      /*
       * The hint says what the lit cells MEAN. Feedback nobody has been told how to read is
       * decoration, and this is the sentence that turns it into an instrument.
       */
      this.status.textContent =
        view.note ?? 'lit pieces have water in them - turn the rest until it reaches the outfall';
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

    if (view.kind !== 'relations') return;

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
