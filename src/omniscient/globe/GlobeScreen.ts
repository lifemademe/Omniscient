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

import { GlobeView, SignalState } from '../crt/GlobeView.js';

import type { PixelSurface } from '../crt/PixelSurface.js';
import type { Signal } from '../crt/GlobeView.js';

const STYLE_ID = 'omniscient-globe-styles';
/** Canvas resolution. Small on purpose - this is a machine's display (§9). */
const CANVAS_W = 320;
const CANVAS_H = 240;
/** How close a click has to land, in canvas pixels. */
const HIT_RADIUS = 9;

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
.omni-globe__stage { position: relative; }
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
  bottom: 18px; left: 24px;
  color: #3f6b48;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
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
.omni-globe__stage::before {
  content: "";
  position: absolute; inset: -2%; pointer-events: none; z-index: 2;
  background: radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.65) 100%);
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
  private pulse = 0;
  /** Display scale from canvas pixels to screen pixels. */
  private scale = 3;

  constructor(
    private readonly container: HTMLElement,
    private readonly onAnswer: (signalId: string) => void
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

    const head = document.createElement('div');
    head.className = 'omni-globe__head';
    head.textContent = 'earth network';

    const hint = document.createElement('div');
    hint.className = 'omni-globe__hint';
    hint.textContent = 'select a signal';

    root.append(stage, head, hint);
    this.container.appendChild(root);

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
    for (const signal of this.signals) {
      if (signal.state !== SignalState.Cooldown || signal.cooldown === undefined) continue;
      signal.cooldown = Math.max(0, signal.cooldown - deltaTime);
      if (signal.cooldown === 0) {
        signal.state = SignalState.Waiting;
      }
    }

    // §99: clicking a point stops the world turning until the player looks away.
    if (!this.selectedId) {
      this.globe.advance(deltaTime);
    }

    this.globe.draw(this.pulse, this.selectedId);
    this.renderMarks();
  }

  private onStageClick(event: MouseEvent): void {
    const rect = this.surface.canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * CANVAS_W;
    const y = ((event.clientY - rect.top) / rect.height) * CANVAS_H;

    let best: { id: string; distance: number } | null = null;
    for (const projected of this.globe.getProjectedSignals()) {
      if (!projected.visible || projected.signal.state === SignalState.Unknown) continue;
      const distance = Math.hypot(projected.x - x, projected.y - y);
      if (distance <= HIT_RADIUS && (!best || distance < best.distance)) {
        best = { id: projected.signal.id, distance };
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

    for (const projected of this.globe.getProjectedSignals()) {
      const { signal } = projected;
      const showing = projected.visible && signal.state !== SignalState.Unknown;

      let name = this.nameEls.get(signal.id);
      if (!name) {
        name = document.createElement('span');
        // Contact names are content - textContent, never innerHTML.
        name.textContent = signal.name;
        this.nameEls.set(signal.id, name);
        this.marks.appendChild(name);
      }

      name.style.display = showing ? 'block' : 'none';
      if (!showing) continue;

      seen.add(signal.id);
      name.className = `omni-globe__name omni-globe__name--${this.stateClass(signal)}`;
      name.style.left = `${projected.x * this.scale}px`;
      name.style.top = `${projected.y * this.scale}px`;

      // Keep the open tooltip pinned to its point. The globe is stopped while a signal
      // is selected, so this is a no-op in practice - but it stays correct if that changes.
      if (signal.id === this.selectedId && this.tipEl) {
        this.tipEl.style.left = `${projected.x * this.scale}px`;
        this.tipEl.style.top = `${projected.y * this.scale}px`;
      }
    }

    this.syncTip(seen);
  }

  /** Build or drop the tooltip, only when the selection changes. */
  private syncTip(visibleIds: Set<string>): void {
    const wanted = this.selectedId && visibleIds.has(this.selectedId) ? this.selectedId : null;
    if (wanted === this.tipForId) return;

    this.tipEl?.remove();
    this.tipEl = null;
    this.tipForId = wanted;

    if (!wanted || !this.marks) return;

    const signal = this.signals.find((s) => s.id === wanted);
    if (!signal) return;

    const projected = this.globe.getProjectedSignals().find((p) => p.signal.id === wanted);
    if (!projected) return;

    this.tipEl = this.buildTip(signal, projected.x * this.scale, projected.y * this.scale);
    this.marks.appendChild(this.tipEl);
  }

  private stateClass(signal: Signal): string {
    if (signal.state === SignalState.Cooldown) return 'cooldown';
    if (signal.state === SignalState.Resolved) return 'resolved';
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

    if (signal.state === SignalState.Cooldown && signal.cooldown !== undefined) {
      const wait = document.createElement('span');
      wait.className = 'omni-globe__wait';
      wait.textContent = `unreachable - ${Math.ceil(signal.cooldown)}s`;
      tip.appendChild(wait);
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
      wait.textContent = 'no longer waiting';
      tip.appendChild(wait);
    }

    return tip;
  }

  private injectStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = GLOBE_CSS;
    document.head.appendChild(style);
  }
}
