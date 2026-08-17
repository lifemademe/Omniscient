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

import { injectConsoleChrome } from '../link/console-chrome.js';

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
  const placed: Array<{ x: number; y: number }> = [];

  for (const projected of [...projections].sort((a, b) => a.y - b.y)) {
    let y = projected.y;

    // Loop rather than test once - three in a cluster need three different rows.
    for (let guard = 0; guard < projections.length; guard++) {
      const clash = placed.find(
        (other) =>
          Math.abs(other.x - projected.x) < LABEL_GAP_X && Math.abs(other.y - y) < LABEL_GAP_Y
      );
      if (!clash) break;
      y = clash.y + LABEL_GAP_Y;
    }

    const spot = { x: projected.x, y };
    placed.push(spot);
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
const LABEL_GAP_Y = 11;

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
.omni-globe__hintline { color: #35603f; }
.omni-globe__canvas {
  display: block;
  image-rendering: pixelated;
  background: #06120b;
}
.omni-globe__marks { position: absolute; inset: 0; pointer-events: none; }
.omni-globe__name {
  position: absolute;
  transform: translate(10px, -50%);
  white-space: nowrap;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-shadow: 0 0 6px rgba(0, 0, 0, 0.9);
}
.omni-globe__name--waiting { color: #7fe08a; }
.omni-globe__name--cooldown { color: #c2483a; }
.omni-globe__name--resolved { color: #4a7355; }
.omni-globe__head {
  position: absolute;
  top: 18px; left: 24px;
  color: #4f9a5e;
  font-size: 12px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.omni-globe__hint {
  position: absolute;
  bottom: 46px; right: 26px;
  color: #3f6b48;
  font-size: 11px;
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
  font-size: 11px;
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
  font-size: 12px;
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
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  cursor: pointer;
}
.omni-globe__answer:hover { background: #14301f; color: #d8ffb0; }
.omni-globe__wait { color: #c2483a; letter-spacing: 0.1em; text-transform: uppercase; }
/* CRT treatment - §221, since RetroEffect is unavailable on WebGL. */
.omni-globe__stage::after {
  content: "";
  position: absolute; inset: 0; pointer-events: none;
  background: repeating-linear-gradient(
    to bottom,
    rgba(0,0,0,0) 0px, rgba(0,0,0,0) 1px,
    rgba(0,0,0,0.20) 2px, rgba(0,0,0,0.20) 3px);
  mix-blend-mode: multiply;
}
/*
 * Vignette and viewport brackets on the same layer, because it is the only one above the
 * canvas.
 *
 * The stage has an opaque canvas filling it, so a background on the stage itself is
 * painted and then covered - the brackets went on there first and were invisible for
 * exactly that reason. Both pseudo-elements are already spoken for (this one and the
 * scanlines), so the frame joins the vignette rather than asking for a third.
 *
 * Bracket layers come first in the list and therefore paint on top of the vignette, which
 * is right: the frame belongs to the instrument and the vignette belongs to the tube.
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
    linear-gradient(var(--bc), var(--bc)), linear-gradient(var(--bc), var(--bc)),
    radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.65) 100%);
  background-repeat: no-repeat;
  background-size:
    var(--bk) 1px, 1px var(--bk),
    var(--bk) 1px, 1px var(--bk),
    var(--bk) 1px, 1px var(--bk),
    var(--bk) 1px, 1px var(--bk),
    100% 100%;
  background-position:
    left top, left top,
    right top, right top,
    left bottom, left bottom,
    right bottom, right bottom,
    center;
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

    const ctx = this.canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('GlobeScreen: 2D canvas context unavailable');
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
  }

  public clear(): void {
    this.ctx.fillStyle = '#06120b';
    this.ctx.fillRect(0, 0, this.width, this.height);
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
    this.ctx.fillStyle = `rgba(0,0,0,${strength})`;
    for (let y = 0; y < this.height; y += 2) {
      this.ctx.fillRect(0, y, this.width, 1);
    }
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

  public attach(signals: Signal[], openable: ReadonlySet<string>): void {
    this.signals = signals;
    this.openable = openable;
    this.globe.setSignals(signals);

    if (this.root) {
      this.root.style.display = 'flex';
      return;
    }

    this.injectStyles();

    const root = document.createElement('div');
    root.className = 'omni-globe';

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

    const column = document.createElement('div');
    column.className = 'omni-cv__stage';
    column.append(readouts, actions);

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

    this.waitingCard = waiting;
    this.blockedCard = blocked;
    this.answeredCard = answered;

    // Clicking the canvas selects a point; clicking anywhere else clears the selection
    // and lets the globe turn again.
    stage.addEventListener('click', (event) => this.onStageClick(event));
    root.addEventListener('click', (event) => {
      if (event.target === root) this.clearSelection();
    });

    this.root = root;
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
  }

  /** Advance rotation, cooldowns and the drawing. */
  public update(deltaTime: number): void {
    if (!this.root || this.root.style.display === 'none') return;

    this.pulse = (this.pulse + deltaTime / 1.4) % 1;

    // §31: cooldowns tick down while the player is looking at the globe, so a failed
    // request visibly becomes available again rather than silently reappearing.
    tickCooldowns(deltaTime, this.signals, this.onCooldownEnded);

    // §99: clicking a point stops the world turning until the player looks away.
    if (!this.selectedId) {
      this.globe.advance(deltaTime);
    }

    this.globe.draw(this.pulse, this.selectedId);
    this.renderMarks();
    this.renderReadouts();
  }


  /** One margin readout, matching the Contact View's. */
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
    card.value.textContent = value;
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

  private onStageClick(event: MouseEvent): void {
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

    this.selectedId = best?.id ?? null;
  }

  private clearSelection(): void {
    this.selectedId = null;
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
      .filter((p) => p.visible && !p.signal.hidden && p.signal.state !== SignalState.Unknown);

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
        name.textContent = signal.name;
        this.nameEls.set(signal.id, name);
        this.marks.appendChild(name);
      }

      name.style.display = spot ? 'block' : 'none';
      if (!spot) continue;

      seen.add(signal.id);
      name.className = `omni-globe__name omni-globe__name--${this.stateClass(signal)}`;
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
    if (signal.state === SignalState.Cooldown) return 'cooldown';
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

    this.waitEl = null;

    if (signal.state === SignalState.Cooldown && signal.cooldown !== undefined) {
      const wait = document.createElement('span');
      wait.className = 'omni-globe__wait omni-globe__wait--counting';
      wait.textContent = formatWait(signal.cooldown);
      tip.appendChild(wait);
      // Held so the countdown can be rewritten each frame without rebuilding the tip.
      this.waitEl = wait;
    } else if (this.openable.has(signal.id)) {
      const button = document.createElement('button');
      button.className = 'omni-globe__answer';
      button.type = 'button';
      button.textContent = 'Answer';
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
      wait.textContent =
        signal.state === SignalState.Resolved
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
