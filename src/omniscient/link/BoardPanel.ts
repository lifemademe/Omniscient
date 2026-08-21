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
import { feedToHtml, renderFeed } from '../art/asciiFeed.js';
import { DISTRICT_CITY } from '../content/district-07.js';

import type { BeamState } from '../mission/beam.js';
import type { Cell, Hop, HopFailure } from '../mission/pursuit.js';
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
/* flex-wrap, so the jump line gets a line. The row is a flex container and the jump span
   asks for flex-basis:100%, which without wrapping just squeezes it onto the same row and
   off the edge of the panel - which is where it was, invisible, on the first attempt. */
.omni-trace__row--wrap { align-items: flex-start; flex-wrap: wrap; }
/* flex:1 keeps the detail beside the plate. Without it, wrapping is triggered by the
   detail's own max-content width and it drops to a line of its own, which costs a row of
   vertical space nine times over for no gain - only the jump line is meant to wrap. */
.omni-trace__row--wrap .omni-trace__detail {
  white-space: normal;
  overflow: visible;
  flex: 1 1 0;
  min-width: 0;
}
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
/*
 * The camera feed. A character grid, so it must be monospace and it must not wrap - a feed
 * that reflows is a feed that stops being a picture. Zero letter-spacing and a line-height
 * of 1 keep the glyph cells square enough that the road's perspective reads.
 */
.omni-feed {
  margin: 6px 0 8px;
  padding: 6px 8px;
  border: 1px solid #1a2f21;
  background: #070d0a;
  overflow: hidden;
}
.omni-feed__screen {
  margin: 0;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 7px;
  line-height: 1;
  letter-spacing: 0;
  white-space: pre;
  color: #2f4a37;
}
.omni-feed--big .omni-feed__screen { font-size: 10px; }
.omni-feed__caption {
  padding-top: 4px;
  font-size: 9px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #3f6b4a;
}
/*
 * The two verdicts. Deliberately not red and green - this console has one accent, and a
 * miss reading as an ERROR would say the player did something wrong when what actually
 * happened is that a camera saw an empty street. Dim for nothing, objective-bright for him.
 */
.omni-feed__caption--hit { color: #d8ffb0; }
.omni-feed__caption--miss { color: #2f4a37; }
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

/* -- The chase's trail ------------------------------------------------------------------
   Every camera the player has already committed to, kept on screen.

   ## Why it exists

   Reported as picking the right camera and having "the option disappear and nothing
   happen". It had happened - the hop advanced, the trust went up - but the only thing the
   screen did was replace one list of cameras with another, which from the player's side is
   indistinguishable from a row being deleted by a misclick.

   A choice with no acknowledgement is a choice the player cannot tell they made. So each
   confirmed sighting stays, numbered, and the chase visibly grows downward: the answer to
   "did that do anything" is the line that was not there a second ago.

   It also does the job the send button needs. The picks go up in one submission at the end,
   so before pressing it the player should be able to read back the route they have
   assembled - and until now the only record of it was in their memory. */
.omni-hop__trail {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-bottom: 8px;
}
.omni-hop__step {
  display: flex;
  gap: 10px;
  align-items: baseline;
  padding: 3px 8px;
  border-left: 2px solid rgba(127, 224, 138, 0.45);
  background: rgba(10, 24, 15, 0.6);
  font-size: 11px;
  color: rgba(159, 216, 168, 0.75);
}
.omni-hop__step b {
  font-weight: normal;
  letter-spacing: 0.14em;
  color: #7fe08a;
}
/* The one just added. Fades to the others' weight, so the eye is pulled to it once. */
/* The run that lost him. Present enough to read the verdict against, quiet enough that it
   is obviously not the one being built. */
.omni-hop__step--lost {
  border-left-color: rgba(168, 64, 47, 0.5);
  background: rgba(24, 12, 10, 0.5);
  color: rgba(159, 216, 168, 0.34);
}
.omni-hop__step--lost b { color: rgba(168, 96, 80, 0.75); }
.omni-hop__again {
  padding: 4px 2px 2px;
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #a8402f;
}
.omni-hop__step--new {
  border-left-color: #e0a24c;
  background: rgba(38, 30, 12, 0.7);
  animation: omni-hop-settle 900ms ease-out forwards;
}
@keyframes omni-hop-settle {
  from { background: rgba(70, 54, 20, 0.9); }
  to { background: rgba(10, 24, 15, 0.6); }
}

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
  private pursuitParts: {
    trail: HTMLElement;
    sighting: HTMLElement;
    options: HTMLElement;
  } | null = null;

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
    this.pursuitTrail = [];
    this.pursuitLost = [];
    this.pursuitNote = null;

    const panel = document.createElement('div');
    panel.className = 'omni-trace';

    const trail = document.createElement('div');
    trail.className = 'omni-hop__trail';

    const sighting = document.createElement('div');
    sighting.className = 'omni-hop__sighting';

    const options = document.createElement('div');
    options.className = 'omni-hop__options';

    /*
     * The feed sits between the question and the answers, because that is the order the
     * player thinks in: he was there, this is what the cameras can see, which one do I pick.
     */
    const feedBox = document.createElement('div');
    feedBox.className = 'omni-feed';
    const screen = document.createElement('pre');
    screen.className = 'omni-feed__screen';
    const caption = document.createElement('div');
    caption.className = 'omni-feed__caption';
    feedBox.append(screen, caption);
    // Skip. Someone replaying a chase for the fourth time has seen the footage.
    feedBox.addEventListener('mousedown', () => {
      if (this.feedPlay) this.endPlayback();
    });
    this.feedParts = { box: feedBox, screen, caption };

    // Trail above the question: the route reads top to bottom, oldest first, and the thing
    // being decided is always at the bottom where the last answer just landed.
    panel.append(trail, sighting, feedBox, options);
    this.grid.appendChild(panel);
    this.pursuitParts = { trail, sighting, options };
    this.startFeed();
    this.refreshPursuit();
  }

  /**
   * Each sighting the player has committed to, as it will be read back to them.
   *
   * Held as text rather than looked up from the view, because the description of a hop is
   * relative to where the car was AT that hop - once the chase moves on, `hop.from` has
   * moved with it and "five blocks straight ahead" can no longer be recomputed.
   */
  private pursuitTrail: Array<{ cam: string; where: string }> = [];

  /**
   * The run that lost him, kept until the player starts a new one.
   *
   * A wrong chase used to leave the player nowhere to go: the trail was played out, the
   * board said TRAIL ENDS, and the only control on screen was a SEND IT that would post the
   * identical wrong route again. The runtime always intended a retry - `onWrong` returns to
   * the same beat - but the panel is cached by render key, so `build()` never ran and the
   * chase kept its old picks.
   *
   * Throwing the route away the instant it fails is the other wrong answer. The note says
   * WHICH hop went wrong, and that sentence is useless if the thing it refers to has just
   * been deleted. So the failed run stays, greyed, until the first pick of the new one.
   */
  /**
   * The camera feed under the sighting line, and which camera it is pointed at.
   *
   * One screen shared by every option rather than a thumbnail each: three animated grids
   * side by side is three times the reading cost for a panel whose job is to make ONE
   * decision easier, and the hover already says which camera is being considered.
   */
  private feedParts: { box: HTMLElement; screen: HTMLElement; caption: HTMLElement } | null = null;
  private feedCell: { x: number; y: number } | null = null;
  private feedLabel = '';
  private feedSince = 0;
  private feedClock = 0;
  private feedTimer: number | null = null;
  /**
   * The review. Non-null only while the route the player just sent is being played back
   * camera by camera.
   *
   * It hangs off SEND rather than off the verdict coming back, which is the one decision in
   * here worth arguing about. Playing it per-pick would answer each hop the moment it was
   * made, and this chase is deliberately graded as a whole route - `pursuitLost` exists so
   * that a failed run stays on screen next to the new one, and per-hop feedback would turn
   * three hops of deduction into three guesses with a buzzer. Playing it after the verdict
   * would mean it never runs on a WIN, because a correct route moves the beat on and takes
   * this board away with it - and the win is the moment worth watching.
   *
   * So: the player commits, then watches the footage they assembled, then the machine
   * speaks. Which is also the order the fiction wants.
   */
  private feedPlay: {
    steps: Array<{ cell: Cell; label: string; since: number; fails: HopFailure | null }>;
    step: number;
    t: number;
    done: (() => void) | null;
  } | null = null;
  private pursuitLost: Array<{ cam: string; where: string }> = [];
  /** The last verdict shown, so a new one is an edge rather than a state. */
  private pursuitNote: string | null = null;

  /**
   * Drive the feed at eight frames a second.
   *
   * Not requestAnimationFrame: this is a surveillance monitor, and a low, slightly uneven
   * frame rate is most of what makes a picture read as a live feed rather than as an
   * illustration. It is also eighty per cent cheaper for a panel that is only ever a
   * secondary thing on screen.
   */
  private startFeed(): void {
    this.stopFeed();
    this.feedTimer = window.setInterval(() => {
      this.feedClock += 0.125;
      if (this.feedPlay) this.stepPlayback(0.125);
      this.paintFeed();
    }, 125);
  }

  private stopFeed(): void {
    if (this.feedTimer !== null) window.clearInterval(this.feedTimer);
    this.feedTimer = null;
    /*
     * A panel closing mid-review CANCELS the submission rather than completing it. Firing
     * it would grade a route while the player is looking at something else and move the
     * mission on behind their back. Nothing is lost: the picks survive, and refreshPursuit
     * re-enables send the moment the board comes back up.
     */
    if (this.feedPlay) {
      this.feedPlay.done = null;
      this.endPlayback();
    }
  }

  /**
   * Point the feed at a camera.
   *
   * `suspect` is never passed from here and that is deliberate rather than incidental - see
   * asciiFeed's header. This mission is won by narrowing rather than searching, and a feed
   * that showed the car before the player committed would turn three hops of inference into
   * "pick the one with the car in it".
   */
  private aimFeed(cell: { x: number; y: number }, label: string, since: number): void {
    this.feedCell = cell;
    this.feedLabel = label;
    this.feedSince = since;
    this.paintFeed();
  }

  /**
   * How long one camera is held during the review, and what happens inside that window.
   *
   * The car crosses in the middle third rather than immediately, because a street that is
   * empty for a beat first is what makes the crossing land - and on a wrong camera that
   * same empty beat IS the answer, arriving as a picture a second before the caption says
   * it in words.
   */
  private static readonly PLAY_HOLD = 2.5;
  private static readonly PLAY_ENTER = 0.6;
  private static readonly PLAY_CROSS = 1.3;

  /**
   * Play the route the player just sent, then hand control back.
   *
   * Stops on the first camera that saw nothing: that is where he was lost, and continuing
   * past it would be the panel showing footage of a car that, in the fiction, nobody has
   * eyes on any more.
   */
  private playRoute(hops: Hop[], picks: string[], done: () => void): void {
    const steps = picks.map((id, index) => {
      const hop = hops[index];
      const option = hop.options.find((candidate) => candidate.id === id) ?? hop.options[0];
      return {
        cell: option.cell,
        label: `CAM ${String(200 + index * 10 + hop.options.indexOf(option))}`,
        since: hop.seconds,
        fails: option.fails,
      };
    });
    if (steps.length === 0) {
      done();
      return;
    }
    this.feedPlay = { steps, step: 0, t: 0, done };
    // The review is the thing being looked at, so it gets the room to be looked at.
    this.feedParts?.box.classList.add('omni-feed--big');
    this.paintFeed();
  }

  private stepPlayback(dt: number): void {
    const play = this.feedPlay;
    if (!play) return;
    play.t += dt;
    if (play.t < BoardPanel.PLAY_HOLD) return;

    const current = play.steps[play.step];
    // A camera that saw nothing ends the review - see playRoute.
    if (!current || current.fails !== null || play.step + 1 >= play.steps.length) {
      this.endPlayback();
      return;
    }
    play.step += 1;
    play.t = 0;
    audio.play('seat');
  }

  /** Finish the review now - the timer running out, a click to skip, or the panel closing. */
  private endPlayback(): void {
    const play = this.feedPlay;
    if (!play) return;
    this.feedPlay = null;
    this.feedParts?.box.classList.remove('omni-feed--big');
    if (this.feedParts) this.feedParts.caption.className = 'omni-feed__caption';
    const done = play.done;
    play.done = null;
    done?.();
  }

  /**
   * What a camera says once the footage has been watched.
   *
   * Each wrong answer is a SENTENCE, not a buzzer - the same discipline pursuit.ts sets out
   * in its header, where every decoy fails for exactly one nameable reason. The reason is
   * already in the data; this is the first place the player gets to hear it.
   */
  private static readonly PLAY_VERDICT: Record<HopFailure, string> = {
    behind: 'NOTHING. That is back the way he came.',
    unreachable: 'NOTHING. He could not have covered that ground yet.',
    'off-route': 'NOTHING. He would have had to turn, and nobody saw him turn.',
  };

  private paintPlayback(parts: { screen: HTMLElement; caption: HTMLElement }): void {
    const play = this.feedPlay;
    if (!play) return;
    const step = play.steps[play.step];
    const enter = BoardPanel.PLAY_ENTER;
    const cross = BoardPanel.PLAY_CROSS;

    /*
     * The car's position across the frame, or null for an empty street. Only ever non-null
     * on a camera that genuinely picked him up - `fails === null` is the same field the
     * runtime grades against, so the picture cannot disagree with the verdict.
     */
    const during = play.t >= enter && play.t <= enter + cross;
    const suspect = step.fails === null && during ? (play.t - enter) / cross : null;

    const rows = renderFeed(DISTRICT_CITY, step.cell, {
      clock: this.feedClock,
      suspect,
      label: step.label,
      since: step.since,
    });
    parts.screen.innerHTML = feedToHtml(rows);

    const settled = play.t > enter + cross;
    const verdict =
      step.fails === null ? 'THERE HE IS.' : BoardPanel.PLAY_VERDICT[step.fails];
    parts.caption.textContent = settled
      ? `${step.label} - ${verdict}`
      : `${step.label} - REVIEWING ${String(play.step + 1)}/${String(play.steps.length)}`;
    parts.caption.className = settled
      ? `omni-feed__caption omni-feed__caption--${step.fails === null ? 'hit' : 'miss'}`
      : 'omni-feed__caption';
  }

  private paintFeed(): void {
    const parts = this.feedParts;
    if (!parts) return;
    if (this.feedPlay) {
      this.paintPlayback(parts);
      return;
    }
    parts.caption.className = 'omni-feed__caption';
    if (!this.feedCell) {
      parts.screen.textContent = '';
      parts.caption.textContent = 'SELECT A CAMERA TO LOOK THROUGH';
      return;
    }
    const rows = renderFeed(DISTRICT_CITY, this.feedCell, {
      clock: this.feedClock,
      label: this.feedLabel,
      since: this.feedSince,
    });
    // Authored markup only - every character in it came from asciiFeed, which escapes.
    parts.screen.innerHTML = feedToHtml(rows);
    parts.caption.textContent = `${this.feedLabel} - LIVE`;
  }

  private refreshPursuit(): void {
    const view = this.view;
    if (!view || view.kind !== 'pursuit' || !this.pursuitParts) return;

    /*
     * A verdict the player has not seen yet means the run they just sent came back wrong -
     * a right one moves the beat on and this board goes away. Rack the chase up again so
     * there is something to do about it.
     *
     * Edge-triggered on the note's text, because the note stays on the view for as long as
     * the beat does; comparing against the last one shown is what turns "there is a note"
     * into "a new thing just happened".
     */
    if (view.note && view.note !== this.pursuitNote) {
      this.pursuitNote = view.note;
      if (this.pursuitTrail.length > 0) {
        this.pursuitLost = this.pursuitTrail;
        this.pursuitTrail = [];
        this.picks = [];
        this.hopIndex = 0;
      }
    }

    const { trail, sighting, options } = this.pursuitParts;
    for (const child of Array.from(options.children)) child.remove();

    trail.replaceChildren();
    this.pursuitLost.forEach((step, index) => {
      const row = document.createElement('div');
      row.className = 'omni-hop__step omni-hop__step--lost';
      const cam = document.createElement('b');
      cam.textContent = `${index + 1}. ${step.cam}`;
      const where = document.createElement('span');
      where.textContent = step.where;
      row.append(cam, where);
      trail.appendChild(row);
    });
    if (this.pursuitLost.length > 0) {
      const gap = document.createElement('div');
      gap.className = 'omni-hop__again';
      /*
       * Says what actually happens. The chase restarts from the scene, not from the hop
       * that failed - the picks go up as one route and there is nothing in the view that
       * says which hop the runtime disliked except the sentence in the note, so resuming
       * partway would be the panel guessing. Two clicks to redo, on a three-hop chase.
       */
      gap.textContent = 'LOST HIM - picking him up again from the scene';
      trail.appendChild(gap);
    }

    this.pursuitTrail.forEach((step, index) => {
      const row = document.createElement('div');
      const newest = index === this.pursuitTrail.length - 1;
      row.className = `omni-hop__step${newest ? ' omni-hop__step--new' : ''}`;
      const cam = document.createElement('b');
      cam.textContent = `${index + 1}. ${step.cam}`;
      const where = document.createElement('span');
      where.textContent = step.where;
      row.append(cam, where);
      trail.appendChild(row);
    });

    const hop = view.hops[this.hopIndex];
    if (!hop) {
      // Every hop answered. The picks go up and the runtime decides what they were worth.
      sighting.textContent = 'TRAIL ENDS - no camera ahead of him';
      this.send.disabled = false;
      this.status.className = 'omni-board__status';
      this.status.textContent =
        view.note ?? `${this.pursuitTrail.length} sightings - read the route back, then send it`;
      return;
    }

    /**
     * The speed is stated, because otherwise the question is not fair.
     *
     * The player is asked to rule out a junction eleven blocks away on five seconds of
     * travel, which is only a judgement if they know roughly how fast he is going. Without
     * it the first hop is a guess and every hop after it is inference from that guess.
     * A dispatcher would say it, so he says it.
     *
     * ## And the turn is stated, for exactly the same reason
     *
     * "Straight ahead" is relative to the heading on THIS hop, and the car does not keep
     * one heading - the shipped chase runs east, east, then south. The line used to restate
     * the heading flatly every time, so a player who had just followed him two blocks east
     * read "1 block straight ahead" on the third hop and got east, while the board meant
     * south. Reported as: he is going east, then on 3 he is going south, how is that
     * straight ahead?
     *
     * The information was all there and none of it was pointed at. A turn is the single
     * most important thing that can happen between two sightings and it was being delivered
     * in the same tone as everything else, as a subordinate clause. Now it leads.
     */
    const turned = this.hopIndex > 0 && view.hops[this.hopIndex - 1].heading !== hop.heading;
    sighting.textContent = turned
      ? `HE TURNED - ${hop.heading} now, not ${view.hops[this.hopIndex - 1].heading}. That was `
        + `${hop.seconds}s ago, still about a block a second. Ahead means ${hop.heading} from here.`
      : `LAST CONFIRMED - still heading ${hop.heading}, ${hop.seconds}s ago, doing about a `
        + `block a second. Which one picks him up?`;

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
      /*
       * Hovering an option looks through it. Selection is unchanged - the click still picks
       * - so the feed is purely what you consult before deciding, which is the whole point
       * of it existing.
       */
      const look = (): void =>
        this.aimFeed(option.cell, id.textContent ?? 'CAM', hop.seconds);
      row.addEventListener('mouseenter', look);
      row.addEventListener('focus', look);
      row.addEventListener('mousedown', (event) => {
        event.preventDefault();
        audio.play('seat');
        // The new run replaces the failed one the moment it starts. Until then both are on
        // screen, which is what makes "on the 3rd hop" mean anything.
        this.pursuitLost = [];
        // Captured before the hop moves on - see pursuitTrail for why it cannot be
        // recomputed afterwards.
        this.pursuitTrail.push({
          cam: id.textContent ?? '',
          // The heading goes in the record too. Reading back "east, east, south" is how a
          // player sees the shape of the route they built - and the turn they missed.
          where: `${hop.heading} - ${where.textContent ?? ''}`,
        });
        this.picks.push(option.id);
        this.hopIndex++;
        this.refreshPursuit();
      });
      options.appendChild(row);
    }

    // Open on the first option, so the panel is never showing a dead screen.
    if (hop.options.length > 0) {
      this.aimFeed(hop.options[0].cell, `CAM ${String(200 + this.hopIndex * 10)}`, hop.seconds);
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
    const found = this.pursuitTrail.length;
    this.status.textContent =
      view.note ??
      (found === 0
        ? 'he has not turned back, cannot outrun the clock, and is still on his street - one camera is all three'
        : `${found} sighting${found === 1 ? '' : 's'} confirmed - pick the next one up`);
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
       * The drive, in the row, in front of the thing that recorded it.
       *
       * Every number on this row has been misread as the jump at some point, because the
       * jump is the only number the player has been asked to think about. Rather than keep
       * hunting for a phrasing that survives that, the row now carries the jump itself and
       * nothing else - written out by refreshTrail, since it depends on what has been
       * claimed above it.
       */
      what.textContent = fragment.detail;

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

    /**
     * The headline carries the RULE, not just the heading.
     *
     * It used to read "LAST SEEN heading south - 2 of 9 claimed as him", which is a status
     * and not an instruction: the heading is the one fact on this board the player cannot
     * act on, because every row is already described relative to it. So the most prominent
     * line on the panel was spending itself on the only number that does no work.
     *
     * What a player actually needs is the arithmetic, and it is two short facts. Distances
     * are along the streets, so "6 blocks ahead, 1 block to the west" is seven blocks of
     * driving and not the diagonal - and the car does about a block a second, so seven
     * blocks needs about seven seconds. Every decoy in the shipped pool fails that badly
     * enough to see: 22 blocks in 4s, 15 blocks in 5s. Every real one clears it with room -
     * the four jumps are 7 in 8s, 5 in 10s, 7 in 9s, 8 in 11s.
     *
     * Said once, at the top, in the sentence the player reads first.
     */
    /**
     * The whole rule, in one sentence, with no geometry left in it.
     *
     * He does about a block a second. Claim two pings and the board says how far apart they
     * are and how long he had. If the distance is bigger than the seconds, no car did both -
     * and that is the entire test. Nothing here asks the player to hold a direction, add two
     * numbers, or work out which row a figure was measured against.
     */
    /**
     * The rule, and where the numbers come from. Not which rows pass it.
     *
     * "After 7 blocks" is measured from the last ping claimed, and the time is the gap
     * between the two timestamps - which the player reads off the list themselves. Both
     * halves have to be said, because a distance with no stated origin is the thing that
     * caused every misreading in this panel's history.
     */
    this.trailParts.headline.textContent =
      `LAST SEEN heading ${view.trail.heading}, doing about a block a second. Each line is `
      + `the drive from the last ping you claimed - and the clock is on the left. Could he `
      + `have covered that ground in that long? `
      + `${this.claimed.size} of ${view.trail.fragments.length} claimed as him.`;

    const ordered = [...view.trail.fragments].sort((a, b) => a.at - b.at);

    const picked = ordered.filter((fragment) => this.claimed.has(fragment.id));

    /**
     * What every ping would ask of the car, from wherever the chain has got to.
     *
     * Not only the claimed ones. An unclaimed row measured from the last thing the player
     * committed to answers the question they are actually holding - could he get here from
     * where I have got to - before they have to click to find out. Claimed rows come out the
     * same way, because for them the chain end IS the ping before them.
     *
     * `from` names it, because "the one before it" is unambiguous in the code and useless on
     * screen: the previous claimed ping can be several rows up with unclaimed rows between,
     * and a bare number has nothing to attach itself to.
     */
    const jumps = new Map<string, { blocks: number; seconds: number; from: string }>();
    for (const fragment of ordered) {
      const earlier = picked.filter((other) => other.at < fragment.at);
      const anchor = earlier[earlier.length - 1];
      const cell = anchor ? anchor.cell : view.trail.from;
      const when = anchor ? anchor.at : 0;
      jumps.set(fragment.id, {
        blocks: Math.abs(cell.x - fragment.cell.x) + Math.abs(cell.y - fragment.cell.y),
        seconds: fragment.at - when,
        from: anchor ? `the +${anchor.at}s ping` : 'the last camera',
      });
    }

    Array.from(this.trailParts.list.children).forEach((row, i) => {
      const id = ordered[i].id;
      row.classList.toggle('omni-trace__row--picked', this.claimed.has(id));
      const detail = row.querySelector('.omni-trace__detail');
      const step = jumps.get(id);
      if (!detail || !step) return;
      /**
       * The distance, and nothing else.
       *
       * ## What the board does, and what it leaves alone
       *
       * The split is between arithmetic a person cannot do from what is on screen and
       * arithmetic they can. Working out how far apart two pings are needs their positions
       * on a grid, and printing those brought four rounds of misreading - it is the board's
       * job. Working out that +27s is nine seconds after +18s is subtracting two numbers
       * that are both right there in front of them, and comparing that to the distance is
       * the puzzle itself.
       *
       * So the seconds came back off. The row said "after 7 blocks and 9s" and that is the
       * whole question answered on the player's behalf; there was nothing left to decide
       * except to read the colour.
       *
       * The colour is gone with it. A row drawn red is the board saying "not this one",
       * which is the answer, not a tool for finding it - and a board that flags every wrong
       * option is a board being clicked rather than read.
       */
      detail.textContent = `after ${step.blocks} blocks, ${ordered[i].detail}`;
    });

    /*
     * Two is the fewest that can describe a journey, so anything less is not a claim yet.
     *
     * It used to also refuse a claim with an impossible jump in it, which was the red
     * highlight wearing a different hat: a send button that will not press is the board
     * telling the player they are wrong before they have committed to anything. They are
     * allowed to be wrong now. Lucian says so afterwards.
     */
    this.send.disabled = this.claimed.size < 2;

    /**
     * Say what to do, then say how it is going.
     *
     * This wrote the status only when there was a note, so a fresh board carried whatever
     * the last device left there and a player who had not read the prompt had nothing at
     * all. The prompt does state the rule - one car, in time order, about a block a second -
     * but it leaves out the thing that decides the answer: the grader takes the LARGEST
     * coherent set, so a chain that is merely consistent is not enough. That belongs on the
     * line the player is watching.
     */
    this.status.className = view.note
      ? 'omni-board__status omni-board__status--score'
      : 'omni-board__status';
    /*
     * It named the first impossible ping. That is the same hint as the red row, in a
     * sentence - it hands over the finding, which is the part the player came for. What is
     * left is the rule and the count, which are both things they would have to be told
     * regardless.
     */
    this.status.textContent =
      view.note ??
      (this.claimed.size === 0
        ? 'ignore what recorded them - only how far and how long. start with one and add to it'
        : `${this.claimed.size} claimed - could one car really have driven all of that?`);
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
      if (this.feedPlay) return;
      const picks = [...this.picks];
      // Watch the footage, THEN let the machine speak. See feedPlay for why it is here and
      // not on the verdict coming back.
      this.send.disabled = true;
      this.playRoute(view.hops, picks, () => {
        this.dispatch({ kind: 'device', submission: { kind: 'pursuit', picks } });
      });
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
