/**
 * The globe - Earth as OMNISCIENT_ sees it.
 *
 * Rendered as pixel art inside the CRT rather than as a 3D Earth. §9 puts the interface
 * in CRT/handheld-pixel language while the human world stays painterly, and §10 makes
 * that split deliberate: a wireframe globe on a phosphor screen is what a machine's own
 * map of humanity looks like. It also shares the PixelSurface contract with the Knowledge
 * Tree, so it renders headlessly and costs nothing at runtime.
 *
 * §99: this is not a static level-select. Signals appear, pulse, and go quiet, and §52
 * asks the globe to keep teasing the next request without revealing everything.
 */

import { COASTLINES } from './coastlines.js';

import type { PixelSurface } from './PixelSurface.js';

export interface Signal {
  id: string;
  /** Degrees, -90..90. */
  latitude: number;
  /** Degrees, -180..180. */
  longitude: number;
  /** Short label shown when selected, e.g. "PORTU VECH - it worked yesterday". */
  label: string;
  /** Who is calling. Shown against the point on the globe. */
  name: string;
  state: SignalState;
  /**
   * Seconds until a failed request can be attempted again (§31 mission cooldowns).
   * Counts down while the globe is up; the point is red and unopenable until it hits
   * zero. §98: this makes failure cost something without creating a dead end.
   */
  cooldown?: number;
}

export enum SignalState {
  /** Available to open. Green, pulsing. */
  Waiting = 'waiting',
  /** Currently open. Steady and bright. */
  Active = 'active',
  /** Failed, and cooling down. Red, with a countdown (§31). */
  Cooldown = 'cooldown',
  /** Finished. Dim, still visible - the world remembers (§163). */
  Resolved = 'resolved',
  /**
   * Present, but not asking yet.
   *
   * Looks exactly like Resolved and means the opposite. Tomas and Adaeze were seeded as
   * Resolved because it gave the dim steady dot a contact should have before its turn,
   * and everything that reasoned about Resolved then believed them - the tooltip told the
   * player "you helped here already" about somebody they had never spoken to, and the
   * margin readout said two answered before the game had begun. Same pixel, separate
   * meaning, so the two can never be confused again.
   */
  Dormant = 'dormant',
  /**
   * Present but not openable, and never explained. §52 teases the next request;
   * §169 seeds anomalies that mostly have mundane explanations - until they do not.
   */
  Unknown = 'unknown',
}

const PALETTE = {
  /** Cold cyan = data / scanning (§9). */
  // Dimmed. The graticule is scaffolding, and at full strength it competed with the
  // coastlines and the signals, which are the two things the player is actually reading.
  grid: '#153845',
  gridBright: '#26607a',
  /** Land. The brightest thing on the globe except the signals themselves. */
  land: '#3f8fa8',
  waiting: '#7fe08a',
  active: '#d8ffb0',
  resolved: '#2f6b3a',
  /** Dirty red = a request that went wrong and is not yet reachable again. */
  cooldown: '#c2483a',
  /** Fainter red. The signal that should not be there. */
  unknown: '#8f3f4a',
  terminator: '#0f2430',
};

const DEG = Math.PI / 180;

interface Projected {
  x: number;
  y: number;
  /** True when the point is on the near hemisphere. */
  visible: boolean;
}

export class GlobeView {
  private rotation = 0;

  constructor(
    private readonly surface: PixelSurface,
    private signals: Signal[] = []
  ) {}

  public setSignals(signals: Signal[]): void {
    this.signals = signals;
  }

  /** Radians per second. Slow - §54 warns against constant motion for its own sake. */
  public advance(deltaTime: number, speed = 0.16): void {
    this.rotation = (this.rotation + deltaTime * speed) % (Math.PI * 2);
  }

  /**
   * Where each signal currently sits on screen.
   *
   * The globe is drawn to a canvas, so hit-testing and name labels are done in canvas
   * space by the presentation layer rather than by raycasting a texture on a mesh -
   * which is the whole reason the globe is its own screen rather than a 3D object.
   */
  public getProjectedSignals(): Array<{ signal: Signal; x: number; y: number; visible: boolean }> {
    return this.signals.map((signal) => {
      const point = this.project(signal.latitude, signal.longitude);
      return { signal, x: point.x, y: point.y, visible: point.visible };
    });
  }

  private get centreX(): number {
    return this.surface.width / 2;
  }

  private get centreY(): number {
    return this.surface.height / 2 + 2;
  }

  private get radius(): number {
    return Math.min(this.surface.width, this.surface.height) * 0.42;
  }

  /** Orthographic projection of a lat/lon onto the screen. */
  private project(latitude: number, longitude: number): Projected {
    const lat = latitude * DEG;
    const lon = longitude * DEG + this.rotation;

    const x = Math.cos(lat) * Math.sin(lon);
    const y = Math.sin(lat);
    const z = Math.cos(lat) * Math.cos(lon);

    return {
      x: this.centreX + x * this.radius,
      y: this.centreY - y * this.radius,
      visible: z >= 0,
    };
  }

  /**
   * Draw the globe.
   *
   * @param pulse 0-1 phase driving the waiting-signal blink.
   * @param selectedId signal to mark with a reticle, if any.
   */
  public draw(pulse: number, selectedId: string | null = null): void {
    this.surface.clear();

    this.drawMeridians();
    this.drawParallels();
    this.drawCoastlines();
    this.drawSignals(pulse, selectedId);

    this.surface.applyScanlines();
    this.surface.commit();
  }

  private drawMeridians(): void {
    for (let lon = -180; lon < 180; lon += 30) {
      let previous: Projected | null = null;
      for (let lat = -90; lat <= 90; lat += 6) {
        const point = this.project(lat, lon);
        if (previous && previous.visible && point.visible) {
          this.surface.line(previous.x, previous.y, point.x, point.y, PALETTE.grid);
        }
        previous = point;
      }
    }
  }

  private drawParallels(): void {
    for (let lat = -60; lat <= 60; lat += 30) {
      // The equator reads brighter so the sphere has an axis.
      const color = lat === 0 ? PALETTE.gridBright : PALETTE.grid;
      let previous: Projected | null = null;
      for (let lon = -180; lon <= 180; lon += 6) {
        const point = this.project(lat, lon);
        if (previous && previous.visible && point.visible) {
          this.surface.line(previous.x, previous.y, point.x, point.y, color);
        }
        previous = point;
      }
    }
  }

  /**
   * The land, drawn over the grid.
   *
   * Brighter than the graticule on purpose: the grid is scaffolding and the coast is the
   * thing the player actually navigates by. Segments are dropped when either end is on
   * the far side of the sphere, which is what makes the globe read as solid rather than
   * as a transparent wireframe with continents printed on both sides of it.
   */
  private drawCoastlines(): void {
    for (const ring of COASTLINES) {
      let previous: Projected | null = null;
      for (let i = 0; i <= ring.length; i++) {
        const [lon, lat] = ring[i % ring.length];
        const point = this.project(lat, lon);
        if (previous && previous.visible && point.visible) {
          this.surface.line(previous.x, previous.y, point.x, point.y, PALETTE.land);
        }
        previous = point;
      }
    }
  }

  private drawSignals(pulse: number, selectedId: string | null): void {
    for (const signal of this.signals) {
      const point = this.project(signal.latitude, signal.longitude);
      if (!point.visible) continue;

      const color = this.colorFor(signal, pulse);
      if (!color) continue;

      // Solid 2x2 core with arms. The grid is one pixel wide, so a signal has to be
      // heavier than a grid line or it disappears into the wireframe.
      const core = signal.state === SignalState.Waiting ? PALETTE.active : color;
      this.surface.pixel(point.x, point.y, core);
      this.surface.pixel(point.x + 1, point.y, core);
      this.surface.pixel(point.x, point.y + 1, core);
      this.surface.pixel(point.x + 1, point.y + 1, core);

      this.surface.pixel(point.x - 2, point.y, color);
      this.surface.pixel(point.x + 3, point.y, color);
      this.surface.pixel(point.x, point.y - 2, color);
      this.surface.pixel(point.x, point.y + 3, color);

      if (signal.id === selectedId) {
        this.drawReticle(point, PALETTE.active);
      }
    }
  }

  private colorFor(signal: Signal, pulse: number): string | null {
    switch (signal.state) {
      case SignalState.Active:
        return PALETTE.active;
      case SignalState.Resolved:
      // Deliberately identical: the difference between "done" and "not yet" is not the
      // player's to see on the globe, only in what the tooltip says when they ask.
      case SignalState.Dormant:
        return PALETTE.resolved;
      case SignalState.Waiting:
        // Blink: on for most of the cycle, briefly off. Reads as a heartbeat.
        return pulse < 0.78 ? PALETTE.waiting : PALETTE.terminator;
      case SignalState.Cooldown:
        // Red, and blinking harder than a waiting signal - something went wrong here.
        return pulse < 0.5 ? PALETTE.cooldown : PALETTE.terminator;
      case SignalState.Unknown:
        // Far slower and fainter - easy to miss, which is the point (§169).
        return pulse < 0.12 ? PALETTE.unknown : null;
      default:
        return null;
    }
  }

  /** Corner brackets around the selected signal - a machine framing a target. */
  private drawReticle(point: Projected, color: string): void {
    const r = 6;
    const arm = 3;
    const cx = Math.round(point.x);
    const cy = Math.round(point.y);

    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const x = cx + sx * r;
        const y = cy + sy * r;
        for (let i = 0; i < arm; i++) {
          this.surface.pixel(x - sx * i, y, color);
          this.surface.pixel(x, y - sy * i, color);
        }
      }
    }
  }
}
