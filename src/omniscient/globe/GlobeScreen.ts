/**
 * The globe screen - the dashboard where the player picks who to help.
 *
 * §5: "Dashboard = manage humanity." §99: not a static level-select, a picture of human
 * need. §52: it should always look like more people want help than can be answered.
 *
 * Presented as its own screen rather than as a texture on the CRT. The camera pushes into
 * the machine until the screen fills the frame and then this takes over, so it still
 * reads as looking *through* OMNISCIENT_'s own display - but the points are large enough
 * to click, the names are legible, and hit-testing is a DOM problem rather than a
 * raycast against a mesh.
 *
 * SAFE UI: contact names go through textContent.
 */

import * as ENGINE from '@gnsx/genesys.js';
import { saveM4ssStage } from '../session/persistence.js';

import { injectConsoleChrome } from '../link/console-chrome.js';
import { audio } from '../audio/ConsoleAudio.js';

import { GlobeView, SignalState } from '../crt/GlobeView.js';

import type { PixelSurface } from '../crt/PixelSurface.js';
import type { Signal } from '../crt/GlobeView.js';

const STYLE_ID = 'omniscient-globe-styles';

/** One margin readout. Same shape as the Contact View's, deliberately. */
interface GlobeCard {
  card: HTMLDivElement;
  meter: HTMLDivElement;
  value: HTMLSpanElement;
  sub: HTMLSpanElement;
}

/**
 * The remaining wait, as a clock.
 *
 * A bare "60s" is a fact; m:ss visibly counting down is a wait you can feel ending, which
 * is the whole point of §31 - the player is supposed to watch the door reopen rather than
 * check back and discover it happened. Seconds are floored so it reads 1:00, 0:59, 0:58
 * and lands on 0:00 exactly as the request returns.
 */
/**
 * Advance every blocked request's countdown, and report the ones that have come back.
 *
 * A free function rather than a method so it can be exercised without a DOM - this is the
 * part that silently broke. It used to set the state to Waiting and stop, which left the
 * contact out of the openable set: the point went green, the tooltip fell through to its
 * last branch and told the player "no longer waiting" about somebody who had just become
 * reachable, with no Answer button and no way in. A cooldown that never ends is not a
 * cooldown.
 *
 * The caller decides whether the request actually still exists; this only reports that
 * the wait is over.
 */
export function tickCooldowns(
  deltaTime: number,
  signals: Signal[],
  onEnded?: (signalId: string) => void
): void {
  for (const signal of signals) {
    if (signal.state !== SignalState.Cooldown || signal.cooldown === undefined) continue;

    signal.cooldown = Math.max(0, signal.cooldown - deltaTime);
    if (signal.cooldown > 0) continue;

    signal.state = SignalState.Waiting;
    signal.cooldown = undefined;
    onEnded?.(signal.id);
  }
}

/**
 * Place the name labels so none of them draws on top of another.
 *
 * Mirela and Tomas are siblings in one small town - 44.2N 28.6E and 44.9N 29.4E, less than
 * a degree apart. On a globe this size that is the same pixel, so their names drew over
 * one another and only the nearer one could ever be clicked. Moving them apart
 * geographically would be a lie: they really are in the same place.
 *
 * So the dots stay honest and the labels move. Sorted top-down, the highest keeps its true
 * position and anything colliding is pushed down a row - which reads correctly, because
 * two people stacked at one spot is exactly what is true.
 *
 * A free function so it can be checked without a DOM. The returned positions are also the
 * hit-test targets: the label is what the player is aiming at.
 */
export function layoutLabels(
  projections: ReadonlyArray<{ x: number; y: number; signal: Signal }>
): Map<string, { x: number; y: number }> {
  const layout = new Map<string, { x: number; y: number }>();
  const placed: Array<{ x: number; y: number; width: number }> = [];

  for (const projected of [...projections].sort((a, b) => a.y - b.y)) {
    const width = Math.max(LABEL_GAP_X, projected.signal.name.length * 3.8 + 12);
    const x = projected.signal.offworld ? projected.x : Math.max(8, Math.min(CANVAS_W - width - 8, projected.x));
    let y = projected.y;
    // Search neighbouring rows in both directions. Geographic dots never move.
    for (let row = 0; row <= projections.length * 2; row++) {
      const offset = Math.ceil(row / 2) * LABEL_GAP_Y * (row % 2 ? 1 : -1);
      y = Math.max(14, Math.min(CANVAS_H - 14, projected.y + offset));
      const clash = placed.some((other) =>
        x < other.x + other.width && x + width > other.x && Math.abs(other.y - y) < LABEL_GAP_Y
      );
      if (!clash) break;
    }

    const spot = { x, y };
    placed.push({ ...spot, width });
    layout.set(projected.signal.id, spot);
  }

  return layout;
}

function formatWait(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `unreachable - ${minutes}:${String(rest).padStart(2, '0')}`;
}
/** Canvas resolution. Small on purpose - this is a machine's display (§9). */
/**
 * What the dev jump list offers. Ids only - the labels are for a human reading a strip of
 * ten buttons at 10px, so they are the shortest thing that still identifies the mission.
 */
const DEV_JUMP_TARGETS: ReadonlyArray<readonly [string, string]> = [
  ['mirela', '1 mirela'],
  ['tomas', '2 tomas'],
  ['adaeze', '3 adaeze'],
  ['ileana', '4 ileana'],
  ['vasile', '5 vasile'],
  ['dorin', '6 dorin'],
  ['sanda', '7 sanda'],
  ['lucian', '8 lucian'],
  // M4SS starts at whatever stage the save says, and a stage is only reachable by playing
  // the ones before it - which needs a keyboard, and synthetic keys do not reach this
  // window. Three entries that write the saved stage first are the only way stage two and
  // stage three can be looked at at all. See buildJumpList.
  ['m4ss', 'M4SS'],
  ['m4ss@1', 'M4SS s2'],
  ['m4ss@2', 'M4SS s3'],
  ['warehouse-07', 'warehouse'],
  ['anomaly', 'anomaly'],
  // The ending exists only after a full playthrough, so it has never been looked at.
  // Intercepted in OmniscientRig's globe callback rather than routed through openSignal.
  ['ending', 'ENDING'],
];

const CANVAS_W = 320;
const CANVAS_H = 240;
/**
 * How close a click has to land, in canvas pixels.
 *
 * Generous on purpose. These are names on a turning globe, not buttons on a form, and a
 * near miss should open the contact rather than deselect everything.
 */
const HIT_RADIUS = 16;

/**
 * How close two labels may sit before one is pushed down a row, in canvas pixels.
 *
 * X is generous because names are wide and overlap sideways long before they touch
 * vertically; Y only needs to clear one line of text.
 */
const LABEL_GAP_X = 34;
const LABEL_GAP_Y = 13;

const GLOBE_CSS = `
.omni-globe {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(ellipse at center, #071410 0%, #030806 70%, #000 100%);
  font-family: "Courier New", ui-monospace, monospace;
  overflow: hidden;
}
/*
 * The globe takes clicks. The console frame around it is deliberately click-through so
 * that chrome never eats a press meant for the world - and wrapping the globe in that
 * frame silently made the globe chrome too. Nothing was selectable at all.
 */
/*
 * The globe gets the same viewport brackets the Contact View has, on the element that is
 * actually its viewport. See the note in console-chrome: the shared class means something
 * different on each screen, so the frame has to be applied per screen rather than inherited.
 */
.omni-globe__stage {
  position: relative;
  align-self: center;
  justify-self: center;
  pointer-events: auto;
}
/* The globe screen borrows the console frame; these are the parts specific to it. */
.omni-cv--globe { pointer-events: none; }
.omni-cv__body--globe { grid-template-columns: min(23vw, 260px) 1fr; }
.omni-cv__readouts--globe { width: 100%; }
.omni-cv--globe .omni-card { padding: 9px 11px; margin-bottom: 6px; }
.omni-cv--globe .omni-meter,
.omni-cv--globe .omni-card__sub { display: none; }
.omni-cv--globe .omni-card__value { font-size: 16px; }
.omni-globe__leader {
  position: absolute; height: 1px; transform-origin: left center;
  background: rgba(127,224,138,.35); pointer-events: none;
}
.omni-globe__name--selected { background: #183923; outline: 1px solid #7fe08a; }
.omni-globe__name--muted { opacity: .65; }
.omni-globe__leader--selected { height: 2px; background: #d8ffb0; z-index: 2; }
.omni-globe__completion {
  position: absolute; z-index: 5; top: 9%; left: 50%; transform: translateX(-50%);
  padding: 10px 18px; color: #cfe6c4; background: #09190f;
  border-bottom: 1px solid #7fe08a; font-size: 13px; letter-spacing: .12em;
  text-transform: uppercase; pointer-events: none; white-space: nowrap;
}
.omni-globe__completion[hidden] { display: none; }
/*
 * The record shelf: what the machine has already done, in the order it did it.
 *
 * The globe says "1 answered - the world remembers" and then shows nothing, because a
 * resolved contact loses its point and its name the moment it resolves. So the one place
 * evidence of a whole evening's work could live was a number that said 1.
 *
 * Deliberately NOT replayable, and deliberately not a menu. These requests changed the
 * world and the knowledge tree; re-entering one would either have to not count, which is
 * deflating, or rewind state, which is a save-slot system this game does not have. It is a
 * shelf rather than a rack - a record of what was learned, which is the thing the machine
 * actually keeps.
 */
/*
 * A card marks the moment its number changes.
 *
 * These readouts re-rendered every frame and therefore never announced anything: a request
 * resolving moved "7 waiting" to "6 waiting" and "0 answered" to "1", and both happened
 * invisibly while the player was watching the camera come home. The one screen whose whole
 * job is to say how the world stands was the only one that never said anything had changed.
 *
 * One pulse on the value, and nothing on the meter. The meter is a shape and a shape that
 * flashes reads as an error; the number is the thing that changed.
 */
@keyframes omni-card-changed {
  0% { color: #d8ffb0; text-shadow: 0 0 12px rgba(216, 255, 176, 0.5); }
  100% { color: inherit; text-shadow: none; }
}
.omni-card__value--changed { animation: omni-card-changed 1.1s ease-out; }
.omni-record {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 14px 0 0 13px;
  width: min(23vw, 260px);
}
.omni-record__tag {
  font-size: calc(10px + var(--omni-font-boost, 0px));
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(159, 216, 168, 0.55);
}
.omni-record__row {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  gap: 9px;
  align-items: baseline;
  padding: 4px 8px;
  border-left: 2px solid rgba(127, 224, 138, 0.4);
  background: rgba(10, 24, 15, 0.55);
  font-size: calc(11px + var(--omni-font-boost, 0px));
  color: rgba(159, 216, 168, 0.8);
}
.omni-record__row--recent { border-left-color: #d8ffb0; background: #183923; color: #d8ffb0; }
.omni-record__row > span:not(.omni-record__where) { white-space: nowrap; }
.omni-record__n {
  letter-spacing: 0.14em;
  color: #7fe08a;
}
.omni-record__where {
  grid-column: 2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: calc(10px + var(--omni-font-boost, 0px));
  color: rgba(159, 216, 168, 0.45);
}
.omni-globe__hintline { color: #35603f; }
.omni-globe__canvas {
  display: block;
  image-rendering: pixelated;
  background: transparent;
}
.omni-globe__marks { position: absolute; inset: 0; pointer-events: none; }
/*
 * ## The dev mission list
 *
 * Gated on isPublishedGame, hidden until the pointer is at the right edge, and absent from
 * every screenshot - the same three properties SceneJump has, for the same reason: this
 * project has twice shipped a debug hook by accident and ship-clean now asserts against it.
 *
 * It exists because verifying almost anything in this game needs a SPECIFIC mission moment -
 * a scan, a grip, a verdict, a light beat, a transition - and reaching one meant playing to
 * it or clicking a rotating pin and taking whichever contact came up. Most of the art items
 * that stalled this month stalled on reachability rather than on the work.
 */
.omni-globe__jump {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 0 4px 4px;
  opacity: 0;
  transition: opacity 140ms ease-out;
  pointer-events: none;
  z-index: 10000;
}
.omni-globe__jump button {
  font: 10px/1.6 'Courier New', monospace;
  letter-spacing: 0.08em;
  text-align: right;
  color: #9fd8ec;
  background: rgba(4, 12, 16, 0.92);
  border: 0;
  box-shadow: inset 1px 1px 0 #2f7391, inset -1px -1px 0 #040906;
  padding: 2px 7px;
  cursor: pointer;
}
.omni-globe__jump button:hover { color: #d8ffb0; }
.omni-globe__name {
  position: absolute;
  transform: translate(10px, -50%);
  white-space: nowrap;
  font-size: calc(12px + var(--omni-font-boost, 0px));
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-shadow: 0 0 6px rgba(0, 0, 0, 0.9);
}
/* Off the world, so its name hangs to the LEFT of the dot.
   The anomaly sits outside the sphere near the right edge - 15px of surface remain, and a
   left-aligned label would run off the screen. Everything else keeps the default. */
.omni-globe__name--offworld { transform: translate(calc(-100% - 10px), -50%); }
/*
 * ## A value ladder, because red against green is not a signal
 *
 * These four states carried their whole meaning in hue: unknown #c2483a, waiting #7fe08a,
 * cooldown #c2483a, resolved #4a7355. Desaturated, the ANOMALY sat 7.6 levels from a contact
 * the player had already helped - 106.9 against 99.3 - so for the one man in twelve who
 * cannot separate red from green, the strangest object in the game read as finished
 * business. Cooldown and unknown shared a hex outright and never separated at all, in colour
 * or out of it. ART-MASTER §11 names exactly this: "no mechanic may be carried by hue alone".
 *
 * The four states are now a ladder in VALUE, brightest first, which is also their urgency:
 *
 *   waiting   185   go here now
 *   unknown   132   this is not a person
 *   cooldown  111   closed for the moment
 *   resolved   78   done
 *
 * Every adjacent pair is at least 20 levels apart in greyscale. scripts/law5-states.ts
 * asserts it, so the next person to pick a colour here cannot quietly collapse the ladder.
 *
 * No backticks anywhere in this comment: it lives inside the GLOBE_CSS template literal, and
 * a backtick in here ends the string. That is how it broke the first time.
 */
/*
 * ## Persistence of phosphor, which is an ASYMMETRY and not a fade
 *
 * §4.2's third known gap: "nothing on the tube has persistence-of-phosphor - state changes
 * are instant swaps". A P1 tube does not cross-fade. The beam strikes and the grain is at
 * full brightness within microseconds; when the beam leaves, the grain DECAYS, and the decay
 * is the slow half. Symmetric easing on a colour change is a dissolve, which is a slideshow
 * transition and reads as software.
 *
 * CSS can express the asymmetry exactly, because the transition that runs is the one on the
 * class being moved TO. Brightening states get a near-instant transition; dimming states get
 * a long tail. So a pin going answered fades out over a third of a second, and a pin lighting
 * up snaps on - which is the actual behaviour of the display this game is pretending to be.
 *
 * Not gated on reduced motion, deliberately. The setting exists for movement that provokes
 * discomfort - parallax, shake, scroll - and a colour decaying in place moves nothing. Taking
 * it away would remove a legibility cue from the players most likely to want one.
 */
.omni-globe__name { transition: color 340ms cubic-bezier(0.1, 0.75, 0.25, 1); }
/* Striking, not decaying: these two are states a pin moves INTO by lighting up. */
.omni-globe__name--waiting { transition: color 45ms linear; }
.omni-globe__name--unknown { color: #e0604a; letter-spacing: 0.22em; transition: color 45ms linear; }
/*
 * And the anomaly is bracketed, because §11 asks for a SHAPE difference and C-4 asks for it
 * to read as different in KIND rather than in degree. Value alone would make it a louder
 * contact; brackets make it a different sort of thing. Authored punctuation in CSS content,
 * never the signal's own name, which stays textContent - see the note at the label above.
 */
.omni-globe__name--unknown::before { content: '['; }
.omni-globe__name--unknown::after { content: ']'; }
/*
 * ## The one thing on the globe that will not sit still
 *
 * C-4: "the anomaly does not feel different in kind from a request". Bracketing it and
 * lifting its value made it a distinguishable contact; it was still a name in a list. Seven
 * points on a sphere are people who called, and the eighth is not a person and never called.
 *
 * This game already has the idiom, in art/suspected.ts: a SUSPECTED prop is drawn as the
 * volume the machine is guessing at, and it MOVES, "because a guess should not sit as still
 * as a fact". The same sentence answers this one level up. Every pin the machine can place
 * is static. The one it cannot place does not hold.
 *
 * It is the BRACKETS that move, not the label - the label's transform is doing its
 * positioning, including the offworld variant that flips it to the left, and animating that
 * would fight it. Pseudo-elements carry their own transform and are free.
 *
 * steps(1, end) rather than a glide, and the two brackets run on different delays. A smooth
 * synchronised pulse reads as ATTENTION, which is what a waiting request would want; a snap
 * that is out of step with itself reads as a lock that is not holding, which is the fiction.
 * One pixel, three and a half seconds - findable when looked at, never a distraction.
 *
 * Motion is gated on the container class rather than the media query alone, because
 * accessibility/preferences.ts lets the player force reduced motion in-game and a bare
 * media query would ignore that setting.
 */
@keyframes omni-globe-unlocked {
  0%, 100% { transform: translateX(0);    opacity: 1; }
  17%      { transform: translateX(-1px); opacity: 0.5; }
  41%      { transform: translateX(1px);  opacity: 1; }
  58%      { transform: translateX(0);    opacity: 0.65; }
  79%      { transform: translateX(-1px); opacity: 1; }
}
.omni-globe__name--unknown::before,
.omni-globe__name--unknown::after {
  display: inline-block;
  animation: omni-globe-unlocked 3.7s steps(1, end) infinite;
}
.omni-globe__name--unknown::after { animation-delay: 1.3s; }
.omni-a11y--reduced-motion .omni-globe__name--unknown::before,
.omni-a11y--reduced-motion .omni-globe__name--unknown::after {
  animation: none;
  opacity: 1;
  transform: none;
}
.omni-globe__name--waiting { color: #7fe08a; }
.omni-globe__name--cooldown { color: #a85a4a; }
.omni-globe__name--resolved { color: #3a5a44; }
.omni-globe__head {
  position: absolute;
  top: 18px; left: 24px;
  color: #4f9a5e;
  font-size: calc(12px + var(--omni-font-boost, 0px));
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.omni-globe__hint {
  position: absolute;
  bottom: 46px; right: 26px;
  color: #3f6b48;
  font-size: calc(11px + var(--omni-font-boost, 0px));
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.omni-globe__back {
  position: absolute;
  top: 16px; right: 24px;
  padding: 5px 14px;
  background: transparent;
  border: 1px solid #2b5c39;
  color: #4f9a5e;
  font: inherit;
  font-size: calc(11px + var(--omni-font-boost, 0px));
  letter-spacing: 0.14em;
  text-transform: uppercase;
  cursor: pointer;
}
.omni-globe__back:hover { border-color: #4f9a5e; color: #d8ffb0; }
/* Tooltip on a selected point. */
.omni-globe__tip {
  position: absolute;
  min-width: 210px;
  padding: 10px 12px;
  background: rgba(6, 20, 13, 0.96);
  border: 1px solid #2b5c39;
  color: #cfe6c4;
  font-size: calc(12px + var(--omni-font-boost, 0px));
  line-height: 1.5;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
  transform: translate(14px, -50%);
  pointer-events: auto;
}
.omni-globe__tip-name {
  display: block;
  color: #d8ffb0;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin-bottom: 4px;
}
.omni-globe__tip-label { display: block; color: #8fbe93; margin-bottom: 8px; }
.omni-globe__answer {
  display: inline-block;
  padding: 5px 14px;
  border: 1px solid #4f9a5e;
  background: transparent;
  color: #7fe08a;
  font: inherit;
  font-size: calc(12px + var(--omni-font-boost, 0px));
  letter-spacing: 0.14em;
  text-transform: uppercase;
  cursor: pointer;
}
.omni-globe__answer:hover { background: #14301f; color: #d8ffb0; }
.omni-globe__answer:focus-visible {
  outline: 2px solid #d8ffb0;
  outline-offset: 3px;
}
.omni-globe__wait { color: #c2483a; letter-spacing: 0.1em; text-transform: uppercase; }
/*
 * The full-screen globe shares the page's field. Only the instrument brackets frame it;
 * the physical CRT keeps its own opaque tube treatment in its separate PixelSurface.
 */
.omni-globe__stage::before {
  content: "";
  position: absolute; inset: -10px; pointer-events: none; z-index: 2;
  --bk: 22px;
  --bc: #2f7391;
  background-image:
    linear-gradient(var(--bc), var(--bc)), linear-gradient(var(--bc), var(--bc)),
    linear-gradient(var(--bc), var(--bc)), linear-gradient(var(--bc), var(--bc)),
    linear-gradient(var(--bc), var(--bc)), linear-gradient(var(--bc), var(--bc)),
    linear-gradient(var(--bc), var(--bc)), linear-gradient(var(--bc), var(--bc));
  background-repeat: no-repeat;
  background-size:
    var(--bk) 1px, 1px var(--bk),
    var(--bk) 1px, 1px var(--bk),
    var(--bk) 1px, 1px var(--bk),
    var(--bk) 1px, 1px var(--bk);
  background-position:
    left top, left top,
    right top, right top,
    left bottom, left bottom,
    right bottom, right bottom;
}
`;

/** Minimal canvas-backed PixelSurface. GlobeView draws through this. */
class ScreenSurface implements PixelSurface {
  public readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  constructor(
    public readonly width: number,
    public readonly height: number
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.className = 'omni-globe__canvas';

    const ctx = this.canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('GlobeScreen: 2D canvas context unavailable');
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
  }

  public clear(): void {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  public pixel(x: number, y: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }

  public line(x0: number, y0: number, x1: number, y1: number, color: string): void {
    let px = Math.round(x0);
    let py = Math.round(y0);
    const ex = Math.round(x1);
    const ey = Math.round(y1);
    const dx = Math.abs(ex - px);
    const dy = -Math.abs(ey - py);
    const sx = px < ex ? 1 : -1;
    const sy = py < ey ? 1 : -1;
    let err = dx + dy;

    this.ctx.fillStyle = color;
    for (;;) {
      this.ctx.fillRect(px, py, 1, 1);
      if (px === ex && py === ey) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        px += sx;
      }
      if (e2 <= dx) {
        err += dx;
        py += sy;
      }
    }
  }

  public applyScanlines(strength = 0.16): void {
    // Modulate drawn pixels only: never paint a second rectangular background.
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'source-atop';
    this.ctx.fillStyle = `rgba(0,0,0,${strength})`;
    for (let y = 0; y < this.height; y += 2) {
      this.ctx.fillRect(0, y, this.width, 1);
    }
    this.ctx.restore();
  }

  public commit(): void {
    // Drawn straight to the DOM canvas.
  }
}

export class GlobeScreen {
  private readonly surface = new ScreenSurface(CANVAS_W, CANVAS_H);
  private readonly globe: GlobeView;

  private root: HTMLDivElement | null = null;
  private stage: HTMLDivElement | null = null;
  private marks: HTMLDivElement | null = null;

  private signals: Signal[] = [];
  private openable: ReadonlySet<string> = new Set();
  private selectedId: string | null = null;

  /**
   * Where the hand is, while it is on the world.
   *
   * Null when nobody is dragging. Held as the last x rather than a delta so the rotation
   * follows the pointer exactly, including when the mouse leaves the canvas and comes back -
   * a globe that keeps spinning because a mouseup happened somewhere else is the classic
   * version of this bug.
   */
  private dragFrom: number | null = null;
  /** Set once a drag has actually moved, so a click that wobbles is still a click. */
  private dragged = false;
  /**
   * Name labels, created once and repositioned.
   *
   * These must NOT be rebuilt per frame. Replacing the children every tick destroys the
   * tooltip's Answer button between mousedown and mouseup, so the click never completes
   * and the button silently does nothing.
   */
  private nameEls = new Map<string, HTMLSpanElement>();
  /** The open tooltip, rebuilt only when the selection actually changes. */
  private tipEl: HTMLElement | null = null;
  private tipForId: string | null = null;
  /** Which branch of buildTip the open tip is showing, so it rebuilds when that changes. */
  private tipShape = '';
  private waitingCard: GlobeCard | null = null;
  private blockedCard: GlobeCard | null = null;
  private answeredCard: GlobeCard | null = null;
  private recordStrip: HTMLElement | null = null;
  /** Last shelf drawn, so it is not rebuilt every frame. */
  private renderedRecordKey = '';
  private inputEnabled = true;
  /** Contact ids in completion order, from the save. See OmniscientRig.answered. */
  private answeredOrder: readonly string[] = [];
  private recentlyResolved: string | undefined;
  private completionElement: HTMLElement | null = null;
  private completionRemaining = 0;
  private readonly leaderEls = new Map<string, HTMLElement>();
  /** Where each visible label ended up after de-collision. Also the hit-test targets. */
  private readonly layout = new Map<string, { x: number; y: number }>();
  /** The countdown line inside the open tip, rewritten in place each frame. */
  private waitEl: HTMLElement | null = null;
  private pulse = 0;
  /**
   * Display scale from canvas pixels to screen pixels.
   *
   * Dropped from 3 once the console frame went round it: a 960x720 canvas plus a top bar,
   * a footer and a margin column does not fit a 1080-tall window, and what fell off the
   * bottom was the button back to the machine. The globe is still the largest thing on
   * the screen, which is the point - it just no longer pushes its own way out of frame.
   */
  private scale = 2.2;

  constructor(
    private readonly container: HTMLElement,
    private readonly onAnswer: (signalId: string) => void,
    private readonly onBack: () => void,
    /** A blocked request's countdown reached zero - the rig decides if it comes back. */
    private readonly onCooldownEnded?: (signalId: string) => void
  ) {
    this.globe = new GlobeView(this.surface, []);
  }

  public get isSelecting(): boolean {
    return this.selectedId !== null;
  }

  public get canNavigate(): boolean {
    return Boolean(
      this.inputEnabled && this.root && this.root.style.display !== 'none'
    );
  }

  public attach(
    signals: Signal[],
    openable: ReadonlySet<string>,
    answeredOrder: readonly string[] = [],
    recentlyResolved?: string
  ): void {
    this.recentlyResolved = recentlyResolved;
    this.completionRemaining = recentlyResolved ? 8 : 0;
    this.answeredOrder = answeredOrder;
    this.signals = signals;
    this.openable = openable;
    this.globe.setSignals(signals);

    /*
     * Nothing is selected when the globe comes up, and this line is the whole of a bug
     * that survived every request in the game.
     *
     * §99 stops the world turning while a point is selected, so the player can read a
     * tooltip without it sliding away. Selecting is how you answer - click the marker,
     * click Answer - and coming back from a finished request calls attach again, which
     * re-shows the root and returns early. The selection was still Mirela's. So the globe
     * froze the first time the player ever answered anybody and never turned again, with
     * her tooltip pinned open over a request she had already solved.
     *
     * Reported as "after Mirela's mission the globe should start turning as it is
     * supposed to", which is exactly what it is: the drift was never broken, it was being
     * suppressed by a selection nobody had made for several minutes.
     */
    this.clearSelection();

    if (this.root) {
      this.root.style.display = 'flex';
      this.renderCompletion();
      return;
    }

    this.injectStyles();

    const root = document.createElement('div');
    root.className = 'omni-globe';

    const completion = document.createElement('div');
    completion.className = 'omni-globe__completion';
    completion.setAttribute('role', 'status');
    root.appendChild(completion);
    this.completionElement = completion;
    this.renderCompletion();

    const stage = document.createElement('div');
    stage.className = 'omni-globe__stage';
    stage.style.width = `${CANVAS_W * this.scale}px`;
    stage.style.height = `${CANVAS_H * this.scale}px`;
    this.surface.canvas.style.width = `${CANVAS_W * this.scale}px`;
    this.surface.canvas.style.height = `${CANVAS_H * this.scale}px`;
    stage.appendChild(this.surface.canvas);

    const marks = document.createElement('div');
    marks.className = 'omni-globe__marks';
    stage.appendChild(marks);

    /*
     * The same console the Contact View uses.
     *
     * These are two modes of one instrument - the screen you choose a request from and
     * the screen you answer it through - and they had drifted into looking like two
     * different games. The player crosses between them every single request, so the seam
     * was the most visible thing about either.
     */
    const shell = document.createElement('div');
    shell.className = 'omni-cv omni-cv--globe';

    const top = document.createElement('div');
    top.className = 'omni-cv__top';
    const brand = document.createElement('span');
    brand.className = 'omni-cv__brand';
    brand.textContent = 'Global view';
    const net = document.createElement('span');
    net.className = 'omni-cv__net';
    const bars = document.createElement('span');
    bars.className = 'omni-cv__bars';
    for (let i = 0; i < 4; i++) bars.appendChild(document.createElement('i'));
    const netName = document.createElement('span');
    netName.textContent = 'Listening';
    net.append(bars, netName);
    const scanning = document.createElement('span');
    scanning.textContent = 'All bands';
    top.append(brand, net, scanning);

    const body = document.createElement('div');
    body.className = 'omni-cv__body omni-cv__body--globe';

    const readouts = document.createElement('div');
    readouts.className = 'omni-cv__readouts omni-cv__readouts--globe';
    const waiting = this.buildCard('Requests waiting');
    const blocked = this.buildCard('Unreachable');
    const answered = this.buildCard('Answered');
    readouts.append(waiting.card, blocked.card, answered.card);

    const hint = document.createElement('div');
    hint.className = 'omni-globe__hint';
    hint.textContent = 'select a signal';

    // Back to the machine. The globe is a place you go, so it needs a way out.
    const actions = document.createElement('div');
    actions.className = 'omni-cv__actions';
    actions.appendChild(
      this.buildAction('⌂', 'The machine', () => this.onBack())
    );

    const record = document.createElement('div');
    record.className = 'omni-record';
    this.recordStrip = record;

    const column = document.createElement('div');
    column.className = 'omni-cv__stage';
    column.append(readouts, record, actions);

    body.append(column, stage);

    const footer = document.createElement('div');
    footer.className = 'omni-cv__foot';
    const os = document.createElement('span');
    os.textContent = 'Omniscient OS';
    const notice = document.createElement('span');
    notice.className = 'omni-globe__hintline';
    notice.textContent = 'Somebody is always asking.';
    const corp = document.createElement('span');
    corp.textContent = 'Omniscient';
    footer.append(os, notice, corp);

    shell.append(top, body, footer);
    root.append(shell, hint);
    this.container.appendChild(root);
    this.buildJumpList(root);

    this.waitingCard = waiting;
    this.blockedCard = blocked;
    this.answeredCard = answered;

    // Clicking the canvas selects a point; clicking anywhere else clears the selection
    // and lets the globe turn again.
    stage.addEventListener('click', (event) => this.onStageClick(event));

    /*
     * Drag to turn.
     *
     * On the stage rather than the canvas because the canvas is pointer-events:none - the
     * console frame around the globe is deliberately click-through, and the stage is what
     * actually receives the mouse.
     *
     * `dragged` is the whole reason this does not eat clicks: a press that never moves more
     * than a few pixels is a selection, and only a press that travels becomes a turn. Both
     * gestures start identically and there is no other way to tell them apart.
     */
    stage.addEventListener('mousedown', (event) => {
      this.dragFrom = event.clientX;
      this.dragged = false;
    });
    stage.addEventListener('mousemove', (event) => {
      if (this.dragFrom === null) return;
      const moved = event.clientX - this.dragFrom;
      if (Math.abs(moved) < 3 && !this.dragged) return;
      this.dragged = true;
      this.dragFrom = event.clientX;
      /*
       * Half a turn across the width of the stage. Enough that the whole world is reachable
       * without lifting the mouse, and slow enough that a small correction stays small.
       */
      const width = stage.getBoundingClientRect().width || 1;
      this.globe.turnBy((moved / width) * Math.PI);
    });
    const release = (): void => {
      this.dragFrom = null;
    };
    stage.addEventListener('mouseup', release);
    stage.addEventListener('mouseleave', release);
    root.addEventListener('click', (event) => {
      if (event.target === root) this.clearSelection();
    });

    this.root = root;
    root.style.pointerEvents = this.inputEnabled ? 'auto' : 'none';
    this.stage = stage;
    this.marks = marks;
  }

  public detach(): void {
    if (this.root) this.root.style.display = 'none';
    this.clearSelection();
    this.tipEl?.remove();
    this.tipEl = null;
    this.tipForId = null;
  }

  public dispose(): void {
    this.root?.remove();
    this.root = null;
    this.stage = null;
    this.marks = null;
    this.tipEl = null;
    this.tipForId = null;
    this.nameEls.clear();
    this.leaderEls.clear();
    this.completionElement = null;
  }

  /** Advance rotation, cooldowns and the drawing. */
  /** Fire the arrival rings on one signal. See GlobeView.flare. */
  public flareSignal(id: string): void {
    this.globe.flare(id);
  }

  /** Hold the final acquisition on screen without letting a click dismiss its framing. */
  public setInputEnabled(enabled: boolean): void {
    this.inputEnabled = enabled;
    if (this.root) this.root.style.pointerEvents = enabled ? 'auto' : 'none';
  }

  /** Select and flare a signal as a machine-owned reveal rather than a pointer action. */
  public focusSignal(id: string): void {
    this.selectSignal(id, false, true);
    this.globe.flare(id);
  }

  /** Cycle every unresolved, revealed carrier and turn it into view. */
  public focusNext(direction: number): boolean {
    if (!this.canNavigate) return false;
    const available = this.signals.filter(
      (signal) =>
        !signal.hidden &&
        signal.state !== SignalState.Resolved &&
        signal.state !== SignalState.Dormant
    );
    if (!available.length) return false;

    const at = available.findIndex((signal) => signal.id === this.selectedId);
    const next =
      at < 0
        ? direction < 0
          ? available.length - 1
          : 0
        : (at + available.length + Math.sign(direction)) % available.length;
    this.selectSignal(available[next].id, true, true);
    return true;
  }

  /** Answer the focused carrier, or establish focus on the first one. */
  public activateFocused(): boolean {
    if (!this.canNavigate) return false;
    if (!this.selectedId) return this.focusNext(1);
    const signal = this.signals.find((candidate) => candidate.id === this.selectedId);
    if (!signal || !this.openable.has(signal.id)) return false;
    this.onAnswer(signal.id);
    return true;
  }

  public update(deltaTime: number): void {
    if (this.completionRemaining > 0 && this.root?.style.display !== 'none') {
      this.completionRemaining = Math.max(0, this.completionRemaining - deltaTime);
      if (this.completionRemaining === 0) this.renderCompletion();
    }
    if (!this.root || this.root.style.display === 'none') return;

    this.pulse = (this.pulse + deltaTime / 1.4) % 1;

    // §31: cooldowns tick down while the player is looking at the globe, so a failed
    // request visibly becomes available again rather than silently reappearing.
    tickCooldowns(deltaTime, this.signals, this.onCooldownEnded);

    /*
     * §99: clicking a point stops the world turning until the player looks away - and a hand
     * on it stops it too. Letting go hands it straight back to the drift, with no easing:
     * the machine simply resumes what it was doing, from wherever the player left it.
     */
    if (!this.selectedId && this.dragFrom === null) {
      this.globe.advance(deltaTime);
    }

    this.globe.draw(this.pulse, this.selectedId);
    this.renderMarks();
    this.renderReadouts();
    this.renderRecord();
  }


  /**
   * The shelf, rebuilt only when it changes.
   *
   * Keyed on the id list rather than diffed, because this list only ever grows by one and
   * only at the moment a request resolves - and rebuilding four rows is cheaper than
   * working out which of them is new.
   */
  private renderRecord(): void {
    const strip = this.recordStrip;
    if (!strip) return;
    const key = `${this.answeredOrder.join('|')}:${this.recentlyResolved ?? ''}`;
    if (key === this.renderedRecordKey) return;
    this.renderedRecordKey = key;

    strip.replaceChildren();
    if (this.answeredOrder.length === 0) return;

    const tag = document.createElement('span');
    tag.className = 'omni-record__tag';
    tag.textContent = 'Answered';
    strip.appendChild(tag);

    this.answeredOrder.forEach((id, index) => {
      const signal = this.signals.find((s) => s.id === id);
      if (!signal) return;
      const row = document.createElement('div');
      row.className = 'omni-record__row';
      row.classList.toggle('omni-record__row--recent', id === this.recentlyResolved);

      const n = document.createElement('b');
      n.className = 'omni-record__n';
      n.textContent = String(index + 1).padStart(2, '0');

      const name = document.createElement('span');
      name.textContent = signal.name;

      // Remember the result, not an opening complaint that now contradicts the record.
      const where = document.createElement('span');
      where.className = 'omni-record__where';
      where.textContent = signal.resolvedLabel ?? 'Request resolved.';

      row.append(n, name, where);
      strip.appendChild(row);
    });
  }

  /** One margin readout, matching the Contact View's. */
  private renderCompletion(): void {
    if (!this.completionElement) return;
    const contact = this.signals.find((signal) => signal.id === this.recentlyResolved);
    this.completionElement.hidden = !contact || this.completionRemaining <= 0;
    this.completionElement.textContent = contact ? `Link resolved // ${contact.name}` : '';
  }

  private buildCard(label: string): GlobeCard {
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

  private buildAction(glyph: string, label: string, onPress: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'omni-action';

    const icon = document.createElement('span');
    icon.className = 'omni-action__glyph';
    icon.textContent = glyph;

    const text = document.createElement('span');
    text.textContent = label;

    button.append(icon, text);
    button.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      onPress();
    });
    return button;
  }

  private fill(card: GlobeCard | null, count: number, value: string, sub: string): void {
    if (!card) return;
    const segments = card.meter.children;
    for (let i = 0; i < segments.length; i++) {
      segments[i].className = i < Math.min(8, count) ? 'on' : '';
    }
    /*
     * Restarted rather than added, because these render every frame.
     *
     * Adding the class when it is already there does nothing at all - the animation is
     * already running or already finished - so a second change inside the same second would
     * be silent. Removing it, forcing a reflow by reading offsetWidth, and adding it again
     * is the standard way to make a CSS animation fire twice, and it is worth the reflow on
     * three elements that change a handful of times an evening.
     *
     * Guarded on the text actually differing. Without that this would flash on every frame
     * of every draw, which is the opposite of marking a change.
     */
    if (card.value.textContent !== value) {
      card.value.textContent = value;
      card.value.classList.remove('omni-card__value--changed');
      void card.value.offsetWidth;
      card.value.classList.add('omni-card__value--changed');
    }
    card.sub.textContent = sub;
  }

  /**
   * The margin readouts, from the signal list itself.
   *
   * Counts rather than percentages, because that is what the player is deciding between:
   * how many people are asking, how many they have shut out, and how many they have
   * already helped. §52 wants the globe to keep saying humanity needs more than
   * OMNISCIENT_ can answer, and a number is the bluntest way to say it.
   */
  private renderReadouts(): void {
    // Hidden signals are not in the fiction yet, so they cannot be counted in it either.
    const shown = this.signals.filter((s) => !s.hidden);
    const waiting = shown.filter(
      (s) => s.state === SignalState.Waiting && this.openable.has(s.id)
    ).length;
    const blocked = shown.filter((s) => s.state === SignalState.Cooldown).length;
    const answered = shown.filter((s) => s.state === SignalState.Resolved).length;

    this.fill(
      this.waitingCard,
      waiting,
      waiting === 1 ? '1 waiting' : `${waiting} waiting`,
      waiting > 0 ? 'answerable now' : 'nothing you can take'
    );
    this.fill(
      this.blockedCard,
      blocked,
      blocked === 1 ? '1 blocked' : `${blocked} blocked`,
      blocked > 0 ? 'they will call back' : 'nobody shut out'
    );
    this.fill(
      this.answeredCard,
      answered,
      answered === 1 ? '1 answered' : `${answered} answered`,
      'the world remembers'
    );
  }

  /**
   * Every mission, one click away. Editor only.
   *
   * Verifying art in this game almost always needs a SPECIFIC moment - a scan, a grip, a
   * verdict, a light beat firing, a transition playing - and until now reaching one meant
   * either playing to it or clicking a rotating pin and accepting whichever contact came up.
   * Several items on the art board stalled on that rather than on the work itself.
   *
   * Gated on `isPublishedGame` and not merely hidden, which is the rule SceneJump and the
   * character review route are both held to and `ship-clean` asserts. Revealed only when the
   * pointer is near the right edge, so it is absent from every capture and from normal play.
   *
   * It calls the SAME onAnswer the pins call, so it cannot drift from the real entry path -
   * anything special about opening a signal (the anomaly's trace, the warehouse's two modes)
   * is handled inside openSignal and this gets it for free.
   */
  private buildJumpList(root: HTMLElement): void {
    if (ENGINE.isPublishedGame()) return;

    const strip = document.createElement('div');
    strip.className = 'omni-globe__jump';
    for (const [id, label] of DEV_JUMP_TARGETS) {
      const button = document.createElement('button');
      button.type = 'button';
      // A signal id, not player text - but textContent regardless, per the safe-UI rule.
      button.textContent = label;
      button.title = id;
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        /*
         * `id@n` writes the M4SS stage before opening it.
         *
         * M4SS reads its starting stage from the save, and the only way to advance that in
         * normal play is to finish the stage before - which needs a keyboard, and keys sent
         * from outside this process are swallowed. Without this, stages two and three
         * cannot be rendered at all, and an art pass on a stage nobody can look at is the
         * one thing ART-MASTER is most explicit about not doing.
         *
         * Split rather than given its own array so the list stays one flat set of buttons,
         * and gated by the same isPublishedGame check as everything else here.
         */
        const at = id.indexOf('@');
        if (at < 0) {
          this.onAnswer(id);
          return;
        }
        saveM4ssStage(Number(id.slice(at + 1)));
        this.onAnswer(id.slice(0, at));
      });
      strip.appendChild(button);
    }

    const onMove = (event: MouseEvent): void => {
      const rect = this.container.getBoundingClientRect();
      const near = rect.right - event.clientX < 150;
      strip.style.opacity = near ? '1' : '0';
      strip.style.pointerEvents = near ? 'auto' : 'none';
    };
    window.addEventListener('mousemove', onMove);
    this.disposeJumpList = () => window.removeEventListener('mousemove', onMove);

    root.appendChild(strip);
  }

  private disposeJumpList: (() => void) | null = null;

  private onStageClick(event: MouseEvent): void {
    // A press that travelled was a turn, not a selection. Consumed here rather than by
    // suppressing the click, because the browser fires it either way.
    if (this.dragged) {
      this.dragged = false;
      return;
    }
    const rect = this.surface.canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * CANVAS_W;
    const y = ((event.clientY - rect.top) / rect.height) * CANVAS_H;

    /**
     * Hit-test against the laid-out LABEL positions, not the raw projected dots.
     *
     * Two contacts in the same town project to the same pixel, so testing the dots meant
     * the nearer one always won and the other could never be selected at all. The label
     * is what the player is aiming at anyway - it is the thing they can see and read.
     */
    let best: { id: string; distance: number } | null = null;
    for (const [id, spot] of this.layout) {
      const distance = Math.hypot(spot.x - x, spot.y - y);
      if (distance <= HIT_RADIUS && (!best || distance < best.distance)) {
        best = { id, distance };
      }
    }

    this.selectSignal(best?.id ?? null, true);
  }

  private clearSelection(): void {
    this.selectedId = null;
  }

  private selectSignal(id: string | null, acknowledge = false, face = false): void {
    if (this.selectedId === id) return;
    this.selectedId = id;
    if (!id) return;
    if (face) this.globe.faceSignal(id);
    if (acknowledge) audio.play('tap');
  }

  /**
   * Names and the tooltip, positioned over the canvas.
   *
   * Elements persist across frames and are only moved. See nameEls - rebuilding them per
   * frame breaks clicking entirely.
   */
  private renderMarks(): void {
    if (!this.marks) return;

    const seen = new Set<string>();
    const showing = this.globe
      .getProjectedSignals()
      .filter(
        (p) =>
          p.visible &&
          !p.signal.hidden &&
          (p.signal.state !== SignalState.Unknown || p.signal.offworld === true) &&
          // Answered contacts have no dot on the globe any more, so they must not keep a
          // label either - see GlobeView.colorFor. A name hanging off nothing is worse
          // than the dot was.
          p.signal.state !== SignalState.Resolved
      );

    /**
     * Spread labels that land on top of each other.
     *
     * Mirela and Tomas are siblings in one small town - 44.2N 28.6E and 44.9N 29.4E, less
     * than a degree apart. On a globe this size that is the same pixel, so their names
     * drew over one another and only one of them could ever be clicked. Moving them
     * apart geographically would be a lie: they really are in the same place.
     *
     * So the dots stay honest and the LABELS move. Nearest to the viewer keeps its true
     * position and anything colliding is pushed down a row, which reads correctly - two
     * people stacked at one location is exactly what is true.
     */
    this.layout.clear();
    for (const [id, spot] of layoutLabels(showing)) this.layout.set(id, spot);

    for (const projected of this.globe.getProjectedSignals()) {
      const { signal } = projected;
      const spot = this.layout.get(signal.id);

      let name = this.nameEls.get(signal.id);
      if (!name) {
        name = document.createElement('span');
        // Contact names are content - textContent, never innerHTML.
        name.textContent = signal.offworld
          ? `${signal.name}  //  OUTSIDE SPHERE`
          : signal.name;
        this.nameEls.set(signal.id, name);
        this.marks.appendChild(name);
      }

      name.style.display = spot ? 'block' : 'none';
      let leader = this.leaderEls.get(signal.id);
      if (!leader) {
        leader = document.createElement('span');
        leader.className = 'omni-globe__leader';
        this.marks.prepend(leader);
        this.leaderEls.set(signal.id, leader);
      }
      leader.hidden = !spot || signal.offworld === true || Math.hypot(spot.x - projected.x, spot.y - projected.y) < 2;
      leader.classList.toggle('omni-globe__leader--selected', signal.id === this.selectedId);
      if (!spot) continue;

      const dx = (spot.x - projected.x) * this.scale + 8;
      const dy = (spot.y - projected.y) * this.scale;
      leader.style.left = `${projected.x * this.scale}px`;
      leader.style.top = `${projected.y * this.scale}px`;
      leader.style.width = `${Math.hypot(dx, dy)}px`;
      leader.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;

      seen.add(signal.id);
      name.className =
        `omni-globe__name omni-globe__name--${this.stateClass(signal)}` +
        (signal.offworld ? ' omni-globe__name--offworld' : '');
      name.classList.toggle('omni-globe__name--selected', signal.id === this.selectedId);
      name.classList.toggle('omni-globe__name--muted', this.selectedId !== null && signal.id !== this.selectedId);
      name.style.left = `${spot.x * this.scale}px`;
      name.style.top = `${spot.y * this.scale}px`;

      // The tooltip follows the label rather than the dot, so a displaced name and its
      // tooltip stay together and the player is always pointing at the same thing.
      if (signal.id === this.selectedId && this.tipEl) {
        this.tipEl.style.left = `${spot.x * this.scale}px`;
        this.tipEl.style.top = `${spot.y * this.scale}px`;
      }
    }

    this.syncTip(seen);
  }

  /**
   * Build, update or drop the tooltip.
   *
   * Rebuilt only when the selection or the signal's *shape* changes - which is what stops
   * the Answer button being destroyed under the player's cursor between mousedown and
   * mouseup. Within one shape, the countdown text is rewritten in place every frame, so a
   * blocked contact shows a number actually ticking down rather than a snapshot of
   * whatever it was when the point was clicked.
   */
  private syncTip(visibleIds: Set<string>): void {
    const wanted = this.selectedId && visibleIds.has(this.selectedId) ? this.selectedId : null;
    const signal = wanted ? this.signals.find((s) => s.id === wanted) : undefined;

    // The shape of the tip: which of the three branches buildTip will take. When this
    // changes - most importantly the moment a cooldown reaches zero - the tip is rebuilt,
    // so the Answer button appears immediately without the player reselecting the point.
    const shape = signal
      ? `${signal.state}|${this.openable.has(signal.id) ? 'open' : 'shut'}`
      : '';

    if (wanted === this.tipForId && shape === this.tipShape) {
      this.updateTipCountdown(signal);
      return;
    }

    this.tipEl?.remove();
    this.tipEl = null;
    this.tipForId = wanted;
    this.tipShape = shape;

    if (!wanted || !signal || !this.marks) return;

    const projected = this.globe.getProjectedSignals().find((p) => p.signal.id === wanted);
    if (!projected) return;

    this.tipEl = this.buildTip(signal, projected.x * this.scale, projected.y * this.scale);
    this.marks.appendChild(this.tipEl);
  }

  /** Rewrite just the remaining time, leaving every other node alone. */
  private updateTipCountdown(signal: Signal | undefined): void {
    if (!signal || !this.waitEl) return;
    if (signal.state !== SignalState.Cooldown || signal.cooldown === undefined) return;
    this.waitEl.textContent = formatWait(signal.cooldown);
  }

  private stateClass(signal: Signal): string {
    // Its own colour, because it is not a person and must not read as one waiting to be
    // answered. Red against seven greens is the whole statement.
    if (signal.state === SignalState.Unknown) return 'unknown';
    if (signal.state === SignalState.Cooldown) return 'cooldown';
    /*
     * ACTIVE is the request the player is inside RIGHT NOW, and it fell through to the
     * openable test below - which strips an active contact of answerability by design -
     * so the one person the player is currently talking to rendered in the dim resolved
     * green. Dana Keller vanished from the globe the moment her file launched M4SS,
     * because entering the game marked her Active and nothing ever told this method that
     * active means PRESENT. Bright, always: you cannot lose the person you are with.
     */
    if (signal.state === SignalState.Active) return 'waiting';
    if (signal.state === SignalState.Resolved || signal.state === SignalState.Dormant) {
      return 'resolved';
    }
    return this.openable.has(signal.id) ? 'waiting' : 'resolved';
  }

  private buildTip(signal: Signal, left: number, top: number): HTMLElement {
    const tip = document.createElement('div');
    tip.className = 'omni-globe__tip';
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;

    const name = document.createElement('span');
    name.className = 'omni-globe__tip-name';
    name.textContent = signal.name;

    const label = document.createElement('span');
    label.className = 'omni-globe__tip-label';
    label.textContent = signal.label;

    tip.append(name, label);

    if (signal.projectionLabel) {
      const projection = document.createElement('span');
      projection.className = 'omni-globe__wait';
      projection.textContent = signal.projectionLabel;
      tip.appendChild(projection);
    }

    this.waitEl = null;

    if (signal.state === SignalState.Cooldown && signal.cooldown !== undefined) {
      const wait = document.createElement('span');
      wait.className = 'omni-globe__wait omni-globe__wait--counting';
      wait.textContent = formatWait(signal.cooldown);
      tip.appendChild(wait);
      // Held so the countdown can be rewritten each frame without rebuilding the tip.
      this.waitEl = wait;
    } else if (this.openable.has(signal.id) || signal.state === SignalState.Active) {
      const button = document.createElement('button');
      button.className = 'omni-globe__answer';
      button.type = 'button';
      button.textContent = signal.actionLabel ?? 'Answer';
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        this.onAnswer(signal.id);
      });
      tip.appendChild(button);
    } else {
      const wait = document.createElement('span');
      wait.className = 'omni-globe__wait';
      // "no longer waiting" said nothing useful and read as an error - it was the branch
      // an expired cooldown wrongly fell into, and even where it was correct the player
      // could not tell whether they had missed something or nothing was there.
      /*
       * Active is answerable, and the second condition above is a net rather than a feature.
       *
       * A signal is only Active while the player is inside it, and the globe is not drawn
       * then - so in a correct run this never fires. It fires when something has stranded a
       * request: opened, left by a route that did not restore it, and now sitting on the map
       * saying "nobody is asking here yet" about a conversation in progress, with the pin as
       * the only door and no way to open it.
       *
       * The rig closes that hole at source (see showGlobe). This is here because the cost of
       * being wrong is asymmetric: an extra Answer button on a pin is a click that reopens
       * something openable, and a missing one is a save the player cannot continue.
       */
      wait.textContent =
        signal.state === SignalState.Unknown
          ? 'carrier origin does not resolve'
          : signal.state === SignalState.Resolved
          ? 'you helped here already'
          : 'nobody is asking here yet';

      tip.appendChild(wait);
    }

    return tip;
  }

  private injectStyles(): void {
    injectConsoleChrome();
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = GLOBE_CSS;
    document.head.appendChild(style);
  }
}
