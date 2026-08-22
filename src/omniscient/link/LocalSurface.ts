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

import { createPhotographs } from './photographs.js';

import type { PhotoSpec } from './photographs.js';
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
  /* One child now the Close button is gone. Right, to stay over the location line. */
  justify-content: flex-end;
  align-items: baseline;
  padding: 4px 12px 8px;
  border-bottom: 1px solid #23422c;
  letter-spacing: 0.08em;
  font-size: 12px;
  color: #4f9a5e;
  text-transform: uppercase;
}
.omni-terminal__contact { color: #d8ffb0; }
/*
 * The transcript keeps a floor, so a device cannot squeeze it shut.
 *
 * flex:1 next to a panel that can be half the viewport tall means the reply to a
 * device submission arrives in a strip a few pixels high, above the thing the player
 * is looking at. Reported exactly that way: the explanation for a wrong item was
 * appearing behind the bag. It was not behind it - it was in a log that had been
 * flattened to nothing by the bag being open.
 *
 * 108px is about three lines, which is what it takes to see a contact answer.
 */
.omni-terminal__log {
  flex: 1;
  min-height: 108px;
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
/*
 * The request, as the machine understood it.
 *
 * Deliberately not styled as a quest banner. It is a logged line - a dim label and a
 * sentence - sitting where a terminal would put the header of the thing it is currently
 * working on, because that is the only way a permanent goal reads as belonging to a
 * machine rather than to a game overlay.
 */
/* Splits the shell's middle row: the request band, then the two panels under it. */
.omni-cv__middle {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.omni-cv__middle > .omni-cv__body { flex: 1; min-height: 0; }
.omni-objective {
  display: flex;
  gap: 12px;
  align-items: baseline;
  margin: 14px 18px 0;
  padding: 9px 14px;
  border: 1px solid #2b5c39;
  border-left: 3px solid #7fe08a;
  background: linear-gradient(90deg, rgba(30, 74, 44, 0.55), rgba(13, 28, 20, 0.35));
  box-shadow: inset 0 0 22px rgba(0, 0, 0, 0.45);
}
.omni-objective[hidden] { display: none; }
.omni-objective__text {
  color: #d8ffb0;
  font-size: 14px;
  line-height: 1.35;
  letter-spacing: 0.02em;
}
.omni-objective__tag {
  flex: none;
  color: #5f9c6c;
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
/* The observations, over the conversation. Titles; the detail goes into the chat. */
.omni-observed {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  padding: 7px 10px;
  border-bottom: 1px solid #1a2f21;
}
.omni-observed[hidden] { display: none; }
/*
 * The label takes a line of its own, so every observation starts at the same margin.
 *
 * Inline, it pushed the first one in by the width of the word and left the rest
 * flush - so the list read as one odd item and then a list. A heading over a column
 * is what this is.
 */
.omni-observed__tag {
  flex-basis: 100%;
  margin-bottom: 1px;
  color: #35603f;
  font-size: 9px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.omni-observed__item {
  padding: 4px 9px;
  background: #0d1c14;
  border: 1px solid #2b5c39;
  color: #cfe6c4;
  font: inherit;
  font-size: 11px;
  line-height: 1.3;
  text-align: left;
  cursor: pointer;
}
.omni-observed__item:hover { border-color: #7fe08a; color: #d8ffb0; }
/* Read. Dimmed rather than removed - the room still has water on the floor. */
.omni-observed__item--read { opacity: 0.5; }
/* A device is waiting on the console tab. */
/*
 * The live tab, and it now has to carry more weight than a dot.
 *
 * The console no longer steals focus the moment a device arrives - see the note in the
 * present method, which is a reported fault: the sentence explaining WHY the device matters
 * was on the tab the player had just been moved off. So the marker is the only thing telling
 * them there is something to go and do, and a 6px dot pulsing its opacity was not enough
 * for a player who had never seen the console before.
 *
 * Lit background, a border and a ring that expands out of it, so it reads as a thing
 * asking to be pressed rather than as a status light. The dot stays because it is the part
 * that survives peripheral vision.
 */
.omni-tab--live {
  color: #e6ffd0;
  background: rgba(24, 62, 32, 0.95);
  border-color: rgba(127, 224, 138, 0.75);
  animation: omni-tab-wants 1.9s ease-in-out infinite;
}
.omni-tab--live.omni-tab--active { animation: none; }
@keyframes omni-tab-wants {
  0%, 100% { box-shadow: 0 0 0 0 rgba(127, 224, 138, 0.4); }
  60% { box-shadow: 0 0 0 5px rgba(127, 224, 138, 0); }
}
.omni-tab__live {
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-left: 6px;
  border-radius: 50%;
  background: #b6f08a;
  animation: omni-live 1.2s ease-in-out infinite;
}
@keyframes omni-live { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
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

  /*
   * Bounded, and it scrolls.
   *
   * A lost request puts a summary, a lesson and a callout above the input, and on Tomas's
   * the summary is three lines - enough to push the note box to the bottom edge of the
   * console and past it. Which is the one thing that must not happen here, because the
   * box is what the player is being held for.
   */
  max-height: 34vh;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: #7d3830 transparent;
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
/*
 * The note prompt, as a callout rather than a footnote.
 *
 * This was 10px grey text at the bottom of the failure panel, and it was reported missed
 * twice - the second time as "I expected an icon the player cannot miss". It was
 * competing with a red border, a red title and a summary paragraph, all louder than the
 * one line that says what to DO.
 *
 * So it gets the amber, a 26px pen, and the width of the panel. Amber is the player's
 * turn everywhere in this console now: the flag over the input, the input's own text, and
 * this.
 */
/* Pressable, and it says so. See focusNote - this is a control, not a caption. */
.omni-failure__prompt {
  width: 100%;
  text-align: left;
  cursor: pointer;
  font: inherit;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 11px;
  padding: 9px 10px;
  border: 1px solid #6b5518;
  border-left: 3px solid #c9a227;
  background: rgba(201, 162, 39, 0.1);
  color: #e0c265;
  font-size: 12px;
  line-height: 1.5;
  letter-spacing: 0.02em;
}
.omni-failure__prompt:hover {
  background: rgba(201, 162, 39, 0.2);
  border-color: #c9a227;
}
@keyframes omni-called {
  0%, 100% { background: transparent; }
  30% { background: rgba(201, 162, 39, 0.3); }
}
.omni-terminal__input--called { animation: omni-called 900ms ease-out 2; }
.omni-failure__pen {
  flex: none;
  font-size: 22px;
  line-height: 1;
  color: #c9a227;
  animation: omni-note-blink 1.1s steps(1, end) infinite;
}
.omni-failure__prompt strong {
  display: block;
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  margin-bottom: 3px;
  color: #f0d78a;
}
/*
 * And the same panel after the note is written, carrying what happens to the request now.
 *
 * That line started life as a transcript push and was reported as "I did not know where
 * to look" - the log scrolls, and the console closes a few seconds later. Here it is in
 * the place the player is already looking, because it is where they have just typed.
 */
.omni-notice {
  border: 1px solid #2b5c39;
  border-left: 3px solid #4f9a5e;
  background: rgba(79, 154, 94, 0.08);
  padding: 9px 11px;
  color: #a7d8ae;
  font-size: 12px;
  line-height: 1.5;
}
.omni-notice strong {
  display: block;
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  margin-bottom: 4px;
  color: #7fe08a;
}
/*
 * The shoebox, opened.
 *
 * Laid out as a row of prints rather than a list of names, because the point is that
 * they are objects somebody kept - and because a name in a list is the thing the mission
 * is careful NOT to give away for free. You turn one over to read it.
 */
.omni-plates {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 9px;
}
.omni-plate {
  position: relative;
  width: 66px;
  height: 84px;
  padding: 0;
  border: 1px solid #23422c;
  background: #0d160f;
  cursor: pointer;
  /* Sat askew in the box. Nobody stacks photographs square. */
  transition: transform 120ms ease, border-color 120ms ease;
}
.omni-plate:nth-child(2n) { transform: rotate(1.4deg); }
.omni-plate:nth-child(3n) { transform: rotate(-1.8deg); }
.omni-plate:hover { border-color: #4f9a5e; transform: translateY(-2px) rotate(0deg); }
.omni-plate img {
  display: block;
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
}
/* Which way up it is, for anybody who has turned several. */
.omni-plate__face {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 1px 0 2px;
  background: rgba(6, 12, 8, 0.72);
  color: #4f9a5e;
  font-size: 8px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  text-align: center;
}
.omni-plates__note {
  width: 100%;
  margin-top: 2px;
  color: #3f6b48;
  font-size: 10px;
  letter-spacing: 0.08em;
}
.omni-terminal__foot {
  border-top: 1px solid #23422c;
  padding: 8px 10px 10px;
}
/*
 * The note flag - the one thing on screen that says the box below has changed job.
 *
 * A lost request already turns the panel red, changes the placeholder and pushes a line
 * into the log saying a note is wanted, and it was still being missed: the red is around
 * the whole frame, the placeholder is grey text inside an empty field, and the log line
 * scrolls. None of them are AT the input.
 *
 * So this sits directly on top of it, in the amber the failure lesson already uses -
 * green is the machine talking, red is what went wrong, amber is the player's turn.
 */
.omni-note-flag {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 7px;
  padding: 5px 8px;
  border: 1px solid #6b5518;
  border-left: 2px solid #c9a227;
  background: rgba(201, 162, 39, 0.08);
  color: #e0c265;
  font-size: 10px;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}
.omni-note-flag[hidden] { display: none; }
/* A cursor, not a warning triangle. It points at the field rather than at the mistake. */
.omni-note-flag::before {
  content: '';
  width: 7px;
  height: 11px;
  background: #c9a227;
  animation: omni-note-blink 1.1s steps(1, end) infinite;
}
@keyframes omni-note-blink {
  0%, 55% { opacity: 1; }
  56%, 100% { opacity: 0.15; }
}
/*
 * And the field itself, so the flag and the box read as one thing.
 *
 * Colour and caret only. The input is declared border:none twelve lines down, so the
 * obvious border-bottom here would have been a rule that overrides nothing and changes no
 * pixels - the shape of "fix" this project keeps having to un-write.
 *
 * (No backticks in this block, either. It lives inside a template literal, and the pair
 * that used to sit around that border:none ended the string.)
 */
.omni-terminal--note .omni-terminal__input { color: #e0c265; caret-color: #c9a227; }
.omni-terminal--note .omni-terminal__input::placeholder { color: #8a7434; }
.omni-terminal--note .omni-terminal__caret { color: #c9a227; }
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

/**
 * CHAT, CONSOLE, RECORDS.
 *
 * Hints stopped being a tab because they were never a place - they are four sentences
 * about the room, and reading one already pushes it into the conversation. They sit
 * above the transcript now as titles you can open, which is what they always were.
 *
 * The seat they vacated goes to the device, and that is the change that matters. A
 * board, a bag or a lock used to share the transcript's column, which produced three
 * separate faults in a week: the log squeezed to a strip, the send button pushed off
 * the bottom of the screen, and the relation board's wires refusing to scroll with the
 * boxes they connect. All three are one fault - two things that each want a whole
 * column, in one column.
 */
type Tab = 'chat' | 'console' | 'records';

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
  /** Who the log currently belongs to. See the reset in `present`. */
  private talkingTo: string | null = null;
  private tab: Tab = 'chat';
  private lastState: SurfaceState | null = null;
  /**
   * The way out of a request, held so it can be locked.
   *
   * After a lost request, leaving is refused until the note is written - see
   * SessionController, which enforces it because it is the only place that knows. This
   * reference is so the button LOOKS unavailable rather than looking ordinary and
   * declining to work, which is how a player concludes a game is broken.
   */
  private endButton: HTMLElement | null = null;
  private objectiveElement: HTMLDivElement | null = null;
  private objectiveText: HTMLSpanElement | null = null;
  /** What the objective bar is currently showing, so an unchanged one is not retyped. */
  private objectiveShown = '';
  private objectiveTimer: number | null = null;
  /** The amber flag above the input while a lost request is waiting for its note. */
  private noteFlag: HTMLDivElement | null = null;
  private hintsElement: HTMLDivElement | null = null;
  /** Whether a device was up last frame - see the tab switching in present. */
  private hadDevice = false;
  /** Set by `dispatch` when the player took a turn, cleared once acted on. */
  private saidSomething = false;
  /** Pending auto-open of the console. See openConsoleOnceRead. */
  private consoleTimer: number | null = null;
  /** Rebuilt only when the observations change - they are clicked, not re-rendered. */
  private renderedHintKey = '';
  /** Whether the last frame was already waiting on a note - see focusNote. */
  private wasLocked = false;

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

    /*
     * There is exactly one way out of a request, and it is END CALL in the actions column.
     *
     * There used to be two. A "‹ Close" button sat here in the header and dispatched the
     * same `leave` message END CALL does, byte for byte - two differently named controls,
     * in two places, for one action, with nothing in either label to say so. The header
     * position made it worse than a duplicate: a control at the top-left of a panel reads
     * as "collapse this panel", and what this one actually did was hang up on somebody.
     *
     * §97 still holds - a contact can be left waiting and returned to, and the player is
     * never trapped in a conversation. One door is enough to keep that promise, and END
     * CALL is the one that says what it does and sits with the other things a call can do.
     *
     * It also makes the note gate honest. Locking a way out is a claim that it is THE way
     * out; a second door with a different name beside it turns that into a puzzle about
     * which button the game meant.
     */
    const contact = document.createElement('span');
    contact.className = 'omni-terminal__contact';
    head.append(contact);

    const where = document.createElement('span');
    where.className = 'omni-terminal__where';

    const tabs = document.createElement('div');
    tabs.className = 'omni-tabs';

    /*
     * Observations, above the conversation rather than behind a tab.
     *
     * Four sentences about the room is not a place worth navigating to, and putting
     * them behind a tab meant a player had to already suspect there was something to
     * see. Here they are the first thing under the header, and opening one puts what
     * it says into the conversation - which is what opening one already did.
     *
     * Outside the log rather than at the top of it, because the log is anchored to the
     * bottom and grows: inside, they would scroll away and be gone by the third line.
     */
    const hintStrip = document.createElement('div');
    hintStrip.className = 'omni-observed';
    this.hintsElement = hintStrip;

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

    // Sits between the hint and the input, so it is the last thing read before the box.
    const noteFlag = document.createElement('div');
    noteFlag.className = 'omni-note-flag';
    noteFlag.textContent = 'Note required - type it below and send';
    noteFlag.hidden = true;
    this.noteFlag = noteFlag;

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
    foot.append(suggestions, hint, noteFlag, entry);

    root.append(session, head, where, tabs, hintStrip, log, panel, extra, foot);

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
    /*
     * They arrive in the order they mean something.
     *
     * CONNECTION STRENGTH first because it is the one that is literally about the link being
     * made - the machine confirms it has a line before it tells you anything about the
     * person on the other end. Then TRUST, then the history. 90ms apart, which is under the
     * threshold at which it reads as a sequence and over the one at which it reads as
     * simultaneous.
     */
    [link, trust, history].forEach((card, index) => {
      card.card.classList.add('omni-arrive');
      card.card.style.animationDelay = `${String(index * 90)}ms`;
    });
    readouts.append(link.card, trust.card, history.card);

    const actions = document.createElement('div');
    actions.className = 'omni-cv__actions';
    // Only controls that do something. A row of four looks better than a row of two,
    // and a button that does nothing when pressed is worse than both.
    const endCall = this.buildAction('☎', 'End call', 'omni-action--end', () =>
      this.dispatch({ kind: 'leave' })
    );
    this.endButton = endCall;
    /*
     * END CALL alone.
     *
     * OBSERVATIONS and RECORDS sat here as a second way to reach two of the tabs, in
     * the opposite corner of the screen from the tabs themselves - and were reported
     * as never having been noticed at all, which is the worst outcome for a control:
     * it took up room and taught nobody that the tabs existed. The tabs are three
     * words at the top of the panel the player is already reading.
     */
    actions.append(endCall);

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

    /*
     * The request, on its own plate above everything.
     *
     * It started life as a line inside the transcript column, under the caller's
     * location, and was reported lost: that column is a wall of green text and one more
     * line of it is one more line of it. A goal that has to be hunted for is not doing
     * the job the goal was added to do.
     *
     * So it spans the console instead, between the brand bar and the two panels, at a
     * size the transcript never uses. It is the only thing on screen with nothing else
     * beside it, which is the whole point - the eye has somewhere to land that is not the
     * conversation.
     */
    const objective = document.createElement('div');
    objective.className = 'omni-objective';
    objective.hidden = true;
    const objectiveTag = document.createElement('span');
    objectiveTag.className = 'omni-objective__tag';
    objectiveTag.textContent = 'Request';
    const objectiveText = document.createElement('span');
    objectiveText.className = 'omni-objective__text';
    objective.append(objectiveTag, objectiveText);
    this.objectiveElement = objective;
    this.objectiveText = objectiveText;

    /*
     * Wrapped rather than appended as a fourth child of the shell.
     *
     * `.omni-cv` is `grid-template-rows: auto 1fr auto` and the globe screen builds its
     * own shell from the same class - so a fourth child here would hand the 1fr row to
     * the objective, collapse the body to auto, and do it in two places at once. This
     * keeps the shell at exactly three rows and splits the middle one.
     */
    const middle = document.createElement('div');
    middle.className = 'omni-cv__middle';
    middle.append(objective, body);

    shell.append(top, middle, footer);
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
    /*
     * Built, but not placed. renderPanel puts it in the console tab when there is
     * something to work on - it used to sit above the input on every tab, sharing
     * the column with the transcript, which is the arrangement all of this is
     * moving away from.
     */
    this.board = new BoardPanel((message) => this.dispatch(message));
  }

  /** Build one margin readout. Segments are filled later by fillMeter. */
  /**
   * Type the request out rather than printing it.
   *
   * This line is the mission statement - the one sentence saying what the player is here to
   * do - and it appeared complete on the same frame as everything else, which is the fastest
   * way to make the most important text on screen read as furniture.
   *
   * Typed at 18ms a character, which is fast enough that a long objective is finished before
   * anybody has decided to be impatient, and slow enough to be unmistakably a machine
   * writing rather than a label appearing. It is the same idea as the `> transmit...` prompt
   * the player types into: this console writes, it does not render.
   *
   * Guarded on the text so a re-present with an unchanged objective does not retype it -
   * `present()` is called on every state change, and an objective that restarted every time
   * the contact said something would be a tic rather than an arrival.
   */
  private typeObjective(text: string): void {
    const element = this.objectiveText;
    if (!element || text === this.objectiveShown) return;
    this.objectiveShown = text;

    if (this.objectiveTimer !== null) window.clearInterval(this.objectiveTimer);
    this.objectiveTimer = null;
    element.textContent = '';
    if (!text) return;

    /*
     * A block cursor rides the end of the line while it types.
     *
     * Without it the bar reads as text appearing slowly, which is a loading state. With it
     * the same eighteen milliseconds a character read as a machine writing, which is what
     * this console does everywhere else - the transmit field has a cursor, and this is the
     * same instrument talking.
     *
     * Left standing for a beat after the last character, then removed. A cursor that
     * vanishes on the final letter takes the writing with it; one that sits there for half
     * a second is somebody who has finished a sentence.
     */
    let shown = 0;
    this.objectiveTimer = window.setInterval(() => {
      shown += 1;
      element.textContent = `${text.slice(0, shown)}${shown < text.length ? '█' : ''}`;
      if (shown >= text.length && this.objectiveTimer !== null) {
        window.clearInterval(this.objectiveTimer);
        this.objectiveTimer = null;
        element.textContent = `${text}█`;
        window.setTimeout(() => {
          if (this.objectiveText === element && this.objectiveShown === text) {
            element.textContent = text;
          }
        }, 520);
      }
    }, 18);
  }

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

    const key = (suggestions ?? []).join('\u0000');
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
  /**
   * The link dropping, as a thing that takes time.
   *
   * Arriving somewhere got a push-in, a nod and a staggered assembly. Leaving was a cut -
   * and an asymmetric transition is worse than two matching cuts, because the player has
   * been taught this connection means something and then it ends like closing a tab.
   *
   * The chrome goes and the room stays, which is the whole shape of it. The machine's
   * instruments switch off first, the picture holds a moment longer, and the last thing on
   * screen is the person, alone, in a room the console has stopped annotating. That is the
   * correct order for a machine losing a line rather than a director cutting away.
   *
   * Reset by the next `update`, which rebuilds the shell for the next contact - so nothing
   * has to remember to switch it back on.
   */
  public setLeaving(leaving: boolean): void {
    this.shell?.classList.toggle('omni-cv--leaving', leaving);
  }

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
    this.noteFlag = null;
    this.hintsElement = null;
    this.objectiveElement = null;
    if (this.objectiveTimer !== null) window.clearInterval(this.objectiveTimer);
    this.objectiveTimer = null;
    this.objectiveShown = '';
    this.objectiveText = null;
    this.endButton = null;
    this.renderedSuggestKey = '';
    this.handlers.clear();
    this.renderedCount = 0;
    this.talkingTo = null;
  }

  public onMessage(handler: (message: PlayerMessage) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /**
   * How long the newest thing said takes to read, and then the console.
   *
   * Twelve characters a second is a deliberately unhurried reading speed - the measure has
   * to hold for somebody meeting these people for the first time, not for whoever wrote the
   * line. Floored at 1.4s so a curt answer still registers, and ceilinged at 5s because
   * past that the player has stopped reading and started waiting.
   */
  private openConsoleOnceRead(state: SurfaceState): void {
    this.cancelConsoleOpen();

    /*
     * A beat that says ACT NOW does not get to make anybody wait.
     *
     * The reading delay was the right answer to Adaeze's device, where the player asked a
     * QUESTION and the reply is the payoff, and the wrong answer to Dorin's, where they
     * pressed "start on the pins - I will call the order" and then sat through five seconds
     * of nothing. Timing it by how much there was to read got the second case backwards,
     * because the length of the reply is not what decides it - what the player just DID is.
     *
     * And the content already says which is which. Tempo.Act is the beat telling the
     * surface it is a moment for doing rather than talking; it is what puts ACT NOW under
     * the input. A device arriving on one of those is the thing the player just asked to be
     * given, so it is handed over at once.
     */
    if (state.mode === 'action' || state.handsOver === true) {
      this.tab = 'console';
      return;
    }

    const last = state.transcript[state.transcript.length - 1];
    const words = last?.body?.length ?? 0;
    // Nothing gains from more than three seconds; past that they have stopped reading.
    const delay = Math.min(3000, Math.max(1200, words * 62));

    this.consoleTimer = window.setTimeout(() => {
      this.consoleTimer = null;
      // Only if they are still where we left them and there is still something to go to.
      if (this.tab !== 'chat' || !this.hadDevice || !this.lastState) return;
      this.tab = 'console';
      this.present(this.lastState);
    }, delay);
  }

  private cancelConsoleOpen(): void {
    if (this.consoleTimer === null) return;
    window.clearTimeout(this.consoleTimer);
    this.consoleTimer = null;
  }

  private dispatch(message: PlayerMessage): void {
    /*
     * Remember whether the player SPOKE, as opposed to looked something up.
     *
     * The console-on-second-ask rule below needs this and got it wrong first time: it
     * watched the transcript grow, and opening an observation grows the transcript too. So
     * tapping a hint threw the player onto the console tab - the exact opposite of what
     * they asked for, since the reason to open an observation is to read it.
     *
     * A hint is a lookup. It is not a turn, it does not advance a beat, and it must not
     * move the player anywhere.
     */
    this.saidSomething = message.kind === 'text' || message.kind === 'device';
    this.handlers.forEach((handler) => handler(message));
  }

  /**
   * Put the player in the note box and make it obvious that is where they now are.
   *
   * Scrolled into view first, because on a short console the input can be below the fold
   * behind a failure panel - focusing something off screen moves the caret and nothing
   * the player can see.
   */
  private focusNote(): void {
    const input = this.inputElement;
    if (!input) return;
    input.scrollIntoView({ block: 'nearest' });
    input.focus();
    // A flash on the field itself, so the eye is taken there rather than told about it.
    input.classList.remove('omni-terminal__input--called');
    void input.offsetWidth;
    input.classList.add('omni-terminal__input--called');
  }

  public present(state: SurfaceState): void {
    /*
     * The one exit, dimmed and struck through while a lost request is waiting on its note.
     * Left clickable on purpose: the controller answers a blocked `leave` with a line of
     * dialogue saying what is missing, which teaches more than a dead button does.
     */
    const locked = state.awaitingNote === true;
    if (this.endButton) {
      this.endButton.classList.toggle('omni-exit--locked', locked);
      this.endButton.setAttribute('aria-disabled', locked ? 'true' : 'false');
      this.endButton.title = locked ? 'Write your note first' : '';
    }
    if (this.objectiveElement && this.objectiveText) {
      this.typeObjective(state.objective ?? '');
      this.objectiveElement.hidden = !state.objective;
    }
    if (this.noteFlag) this.noteFlag.hidden = !locked;
    /*
     * The caret goes to the box on the frame the request is lost.
     *
     * Every other attempt at this pointed AT the input. Putting the cursor in it is
     * the only version that cannot be missed, because the next key the player presses
     * lands in the right place whether they read anything or not.
     *
     * Once per failure - `wasLocked` - so it does not steal focus back every time the
     * panel re-renders while they are typing.
     */
    if (locked && !this.wasLocked) this.focusNote();
    this.wasLocked = locked;
    this.root?.classList.toggle('omni-terminal--note', locked);

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

    /*
     * Append only what is new, so the log does not flicker or lose scroll position - but
     * start clean whenever the person on the line changes.
     *
     * The old guard inferred a new session from the transcript getting SHORTER, and that
     * misses the case it most needs to catch. Open Dorin, read his opening line, hang up:
     * the log has one entry and `renderedCount` is 1. Open Vasile: his transcript also
     * starts at one entry, `1 < 1` is false, nothing is cleared, and the append loop starts
     * at index 1 of a one-item array - so Dorin's opening stays on screen and Vasile's is
     * never drawn at all. Reported exactly that way.
     *
     * Keyed on WHO is talking rather than on how much they have said. A session is a person
     * on a line; when that changes, everything the last one said belongs to a different
     * conversation. The length check stays underneath it for the case where the same
     * contact is re-opened after a failure.
     */
    const talkingTo = state.contactName;
    if (talkingTo !== this.talkingTo || state.transcript.length < this.renderedCount) {
      this.logElement.replaceChildren();
      this.renderedCount = 0;
    }
    this.talkingTo = talkingTo;
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
    const spoke =
      state.transcript.length > this.renderedCount &&
      state.transcript[state.transcript.length - 1]?.source === 'contact';
    this.renderedCount = state.transcript.length;

    // A new line arriving means something happened in the conversation - go back to it.
    if (state.transcript.length > 0 && this.tab !== 'chat' && state.confirming) {
      this.tab = 'chat';
    }

    /*
     * A device arriving takes the player to it - unless the same beat SAID something.
     *
     * Both halves of the original rule are still needed. Without the switch, the bag opens
     * on a tab nobody is looking at; without the switch back, Tomas raises an objection to a
     * part while the player is staring at the bag, which is the fault that produced 'nothing
     * happens' twice over - the answer was arriving where they were not.
     *
     * The exception is new, and it is a reported fault rather than a refinement. Adaeze's
     * grounds unit arrives on a beat whose whole job is to say why it is needed: she confirms
     * the overgrown strip, explains that it has had the season to itself, and only then
     * offers the machine. Flipping to the console on the same tick threw all of that away -
     * a new player was shown a button marked TAKE THE UNIT with no idea what unit or why,
     * because the sentence explaining it was on the tab they had just been moved off.
     *
     * So a device that comes with words waits. The console tab is already marked live for
     * exactly this - see renderTabs - so nothing is hidden; the player reads the answer to
     * the question they asked and then goes to the thing it is about, which is the order
     * they asked for it in.
     */
    const deviceAppeared = state.device !== undefined && !this.hadDevice;
    this.hadDevice = state.device !== undefined;
    if (deviceAppeared && !spoke) this.tab = 'console';
    else if (spoke && this.tab === 'console') this.tab = 'chat';

    /*
     * A device that arrives with words opens itself once the words have been read.
     *
     * Two opposite complaints landed on the same line of code, which is how it became
     * clear the rule was wrong rather than mistuned. Adaeze's grounds unit arrives on a
     * beat that spends a paragraph explaining what it is and why, and switching instantly
     * threw all of it away. Dorin's lock arrives on "Wrench is in. I am on the pins. Tell
     * me the order" - two lines of instruction - and NOT switching left the player looking
     * at a chat panel wondering where the game was.
     *
     * Neither is a special case: the difference is how much there is to read, so that is
     * what it is timed against. The panel waits out the reading and then opens, which is
     * what the contact themselves is doing - saying their piece and then waiting for an
     * answer.
     *
     * Cancelled if the player gets there first, because an interface that moves a tab under
     * somebody who has already pressed it is worse than one that never moved at all.
     */
    if (deviceAppeared && spoke) this.openConsoleOnceRead(state);

    /*
     * Asked a second time while the same device is up: they have read it, take them to it.
     *
     * The waiting rule above is about the FIRST arrival, when the beat is explaining what
     * the thing is and why. It should not still apply on the next turn - a player who has
     * read Adaeze's answer and then pressed "mow the bank" has said, as plainly as the game
     * lets them, that they want to get on with it. Leaving them on the chat to read the
     * same paragraph again and then hunt for a tab is the interface ignoring an instruction.
     *
     * Keyed on the device being unchanged rather than on any particular mission, so it is
     * the general rule it sounds like: the first mention explains, and asking again opens.
     */
    if (state.device !== undefined && !deviceAppeared && this.tab === 'chat' && this.saidSomething) {
      this.tab = 'console';
    }
    this.saidSomething = false;

    this.renderHints(state);
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

  /**
   * The observations, as a row of titles over the conversation.
   *
   * Titles only. Opening one already pushes what it says into the chat as a line from
   * OMNISCIENT_, so the detail belongs there and not here - and once it has been read the
   * title dims rather than disappearing, because a room does not stop having water on the
   * floor once somebody has mentioned it.
   */
  private renderHints(state: SurfaceState): void {
    const strip = this.hintsElement;
    if (!strip) return;

    const hints = state.hints ?? [];
    const key = hints.map((hint) => `${hint.id}:${hint.detail ? 1 : 0}`).join('|');
    if (key === this.renderedHintKey) return;
    /*
     * Staggered on ARRIVAL only, never on a change.
     *
     * This list rebuilds whenever any hint changes state - opening one re-renders all three
     * - so animating unconditionally would fly the whole strip back in every time the player
     * read something, which is worse than not animating at all. Restricting it to the
     * transition from nothing to something covers the case that matters (the observations
     * landing as the link establishes) and no others.
     */
    const arriving = this.renderedHintKey === '';
    this.renderedHintKey = key;

    strip.replaceChildren();
    if (hints.length === 0) return;

    const label = document.createElement('span');
    label.className = 'omni-observed__tag';
    label.textContent = 'Observed';
    strip.appendChild(label);

    for (const [index, hint] of hints.entries()) {
      const button = document.createElement('button');
      button.type = 'button';
      // `detail` is only set once opened - see SessionController's hint mapping.
      button.className = `omni-observed__item${hint.detail ? ' omni-observed__item--read' : ''}`;
      if (arriving) {
        button.classList.add('omni-arrive');
        // Behind the readout cards, which are still coming in - the machine reports the
        // link before it reports what it can see through it.
        button.style.animationDelay = `${String(320 + index * 110)}ms`;
      }
      this.appendEmphasised(button, hint.summary, hint.keywords);
      button.addEventListener('click', () => this.dispatch({ kind: 'hint', hintId: hint.id }));
      strip.appendChild(button);
    }
  }

  private renderTabs(state: SurfaceState): void {
    if (!this.tabsElement) return;

    const specs: Array<{ id: Tab; label: string; count?: number; live?: boolean }> = [
      { id: 'chat', label: 'Chat' },
      // Marked rather than counted. A device is one thing or nothing, and a live one
      // is the only reason to leave the conversation.
      { id: 'console', label: 'Console', live: state.device !== undefined },
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

      if (spec.live) {
        button.classList.add('omni-tab--live');
        const dot = document.createElement('span');
        dot.className = 'omni-tab__live';
        button.appendChild(dot);
      }

      button.addEventListener('click', () => {
        // They have chosen. Nothing may move a tab after that.
        this.cancelConsoleOpen();
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
    if (this.hintsElement) this.hintsElement.hidden = !showingChat;
    if (showingChat) return;

    this.panelElement.replaceChildren();

    /*
     * The device gets the whole column, which is the point of giving it a tab.
     *
     * It is moved rather than rebuilt - BoardPanel owns its own state, and tearing it
     * down on a tab change would lose a half-wired relation board every time somebody
     * looked at what was said.
     */
    if (this.tab === 'console') {
      if (!state.device) {
        this.panelElement.appendChild(this.renderEmpty('nothing to work on yet'));
        return;
      }
      if (this.board) this.panelElement.appendChild(this.board.element);
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
      if (hint.photographs?.length) item.appendChild(this.renderPlates(hint.photographs));
    } else {
      const meta = document.createElement('span');
      meta.className = 'omni-item__meta';
      meta.textContent = 'open to look closer';
      item.appendChild(meta);
    }

    item.addEventListener('click', () => this.dispatch({ kind: 'hint', hintId: hint.id }));
    return item;
  }

  /**
   * The prints from an opened box, front up, one turn each.
   *
   * Built as buttons inside a button, which is invalid HTML and works, and is still the
   * wrong shape - so the click is stopped from reaching the hint behind it, or turning a
   * photograph would also re-fire the hint's own cue and pulse the box in the room every
   * time somebody read a name.
   *
   * The name is drawn INTO the image rather than written beside it. That is the whole
   * gesture: the back of a photograph is where it is written, and having to turn it over
   * is what makes five names feel like five objects instead of a list. It also keeps this
   * clear of the safe-UI rule by construction - nothing here builds markup from a string.
   */
  private renderPlates(specs: PhotoSpec[]): HTMLElement {
    const strip = document.createElement('div');
    strip.className = 'omni-plates';

    for (const plate of createPhotographs(specs)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'omni-plate';

      const image = document.createElement('img');
      image.src = plate.front;
      // Untrusted-safe: alt is a text attribute, and it is what a screen reader gets.
      image.alt = 'a photograph';

      const face = document.createElement('span');
      face.className = 'omni-plate__face';
      face.textContent = 'turn over';

      let front = true;
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        front = !front;
        image.src = front ? plate.front : plate.back;
        image.alt = front ? 'a photograph' : 'the back of a photograph';
        face.textContent = front ? 'turn over' : 'turn back';
      });

      button.append(image, face);
      strip.appendChild(button);
    }

    const note = document.createElement('span');
    note.className = 'omni-plates__note';
    note.textContent = 'Names on the backs. Nobody wrote down how they are related - only she knows that.';
    strip.appendChild(note);

    return strip;
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

      /*
       * A button, not a paragraph.
       *
       * Reported three times as not noticeable, through a system line, an amber
       * callout and a flag over the input. The fault was never the loudness - it was
       * that all three DESCRIBED where to go and none of them took you there. So this
       * one is pressable, and pressing it puts the caret in the box.
       */
      const prompt = document.createElement('button');
      prompt.type = 'button';
      prompt.className = 'omni-failure__prompt';
      prompt.addEventListener('click', () => this.focusNote());

      // Developer-authored glyph, set as text rather than markup - see AGENTS.md on safe
      // UI. Nothing here comes from the network or from anything the player typed.
      const pen = document.createElement('span');
      pen.className = 'omni-failure__pen';
      pen.textContent = '✎';

      const words = document.createElement('span');
      const heading = document.createElement('strong');
      heading.textContent = 'Write your note';
      const detail = document.createElement('span');
      detail.textContent =
        'Type it in the box below and send. It is waiting for you in Records when this '
        + 'request comes back, and nothing else opens until it is written.';
      words.append(heading, detail);

      prompt.append(pen, words);
      box.appendChild(prompt);

      this.extraElement.appendChild(box);
    }

    /*
     * The notice outlives the failure panel by design.
     *
     * `state.failure` clears the moment the note is recorded, which is also the moment
     * there is something to say about what happens to the request - so this is a separate
     * branch rather than another line inside the box above.
     */
    if (state.notice) {
      const box = document.createElement('div');
      box.className = 'omni-notice';

      const heading = document.createElement('strong');
      heading.textContent = 'Note recorded';
      const detail = document.createElement('span');
      detail.textContent = state.notice;

      box.append(heading, detail);
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
