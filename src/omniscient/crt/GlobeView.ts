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

import { MAP } from '../art/palette.js';

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
   * Not on the globe at all yet.
   *
   * Different from Dormant, which is a signal you can see and cannot answer. Hidden is a
   * signal that has not entered the fiction: the first thing a new player sees is one
   * point, because a globe with six dots on it and one answerable is a search task before
   * they have learned what answering even is. §52's tease is still the goal - it just
   * starts after the first request rather than before it.
   */
  hidden?: boolean;
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
  // From the shared map palette - the globe and the surveillance city are one instrument.
  grid: MAP.grid,
  gridBright: MAP.gridBright,
  /** Land. The brightest thing on the globe except the signals themselves. */
  land: MAP.land,
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

/**
 * How far off centre the caller may drift while the globe keeps turning.
 *
 * 0.45rad is about 26 degrees, which on this projection leaves the marker well inside the
 * front of the sphere rather than out on the limb where it is foreshortened to a smear and
 * awkward to hit. Widen it and the sweep is grander and the marker gets harder to click;
 * this is the trade, and clickable wins.
 */
const HOLD_ARC = 0.45;

/** Sweep speed as a fraction of the idle drift. A third: alive, not busy. */
const SWEEP_RATE = 0.34;

interface Projected {
  x: number;
  y: number;
  /** True when the point is on the near hemisphere. */
  visible: boolean;
}

export class GlobeView {
  private rotation = 0;
  /** Which way the attention sweep is currently drifting. See advance. */
  private sweep: 1 | -1 = 1;

  constructor(
    private readonly surface: PixelSurface,
    private signals: Signal[] = []
  ) {}

  public setSignals(signals: Signal[]): void {
    this.signals = signals;
  }

  /**
   * Turn the globe.
   *
   * ## The machine turns to look at whoever is calling
   *
   * It used to drift, always, at a constant 0.16 rad/s - which is a 39 second rotation, so
   * a signal spent about twenty seconds of every turn on the far side of the world. Twenty
   * seconds in which the panel says "1 waiting, answerable now", the footer says SELECT A
   * SIGNAL, and there is nothing on screen to select. Caught it by capturing the globe six
   * times over twenty seconds rather than once: the single frame that started this looked
   * exactly like a missing feature.
   *
   * So when something is waiting, the globe eases that signal round to the front and holds
   * it there. Twice drift speed, along the shorter way round, and it stops when it arrives.
   * Which is also the better fiction: OMNISCIENT_ has no hands and no face, and this is the
   * one gesture it has - somebody starts talking and the machine turns towards them.
   *
   * With nothing waiting it drifts as before. §54 warns against constant motion for its own
   * sake, and an idle globe that never moves at all is a picture rather than an instrument;
   * the difference is that the motion now means something when it stops.
   */
  public advance(deltaTime: number, speed = 0.16): void {
    const attend = this.rotationForWaiting();

    if (attend === null) {
      this.rotation = (this.rotation + deltaTime * speed) % (Math.PI * 2);
      return;
    }

    // Wrapped to [-pi, pi] so it takes the short way round rather than unwinding most of a
    // turn to reach a point a few degrees behind it.
    const gap = Math.atan2(Math.sin(attend - this.rotation), Math.cos(attend - this.rotation));

    /*
     * Outside the window, go and get it. Inside, keep moving.
     *
     * This used to stop dead once the signal reached the front, and stopping was the whole
     * of the bug reported twice as the globe never turning again. Something is waiting
     * almost all the time - resolving a request sets the NEXT one to Waiting on the same
     * tick - so "hold the caller at the front" resolved to "hold still, forever, from the
     * first request onward". §54 warns against motion for its own sake and an instrument
     * that never moves at all is the other failure: it reads as a picture of a globe.
     *
     * So it sweeps. Within a 26-degree window either side of whoever is calling it keeps
     * turning, slowly, and reverses at the edges; beyond that window it eases back at
     * twice drift speed the way it always did. The caller stays where the player can
     * reach them - which was the point - and the world stays alive, which was the cost.
     *
     * It is also the better read of the fiction. The machine is not staring at one town;
     * it is listening to everything and keeping half an ear on the one that is talking.
     */
    if (Math.abs(gap) > HOLD_ARC) {
      const step = Math.sign(gap) * Math.min(Math.abs(gap), speed * 2 * deltaTime);
      this.rotation = (this.rotation + step) % (Math.PI * 2);
      // Head back out the way it came in, rather than snapping to a fixed direction.
      this.sweep = gap > 0 ? -1 : 1;
      return;
    }

    if (gap * this.sweep < -HOLD_ARC * 0.92) this.sweep = -this.sweep as 1 | -1;
    this.rotation = (this.rotation + this.sweep * deltaTime * speed * SWEEP_RATE) % (Math.PI * 2);
  }

  /**
   * The rotation that would put a waiting signal at the front of the globe, or null.
   *
   * Nearest by rotation rather than first in the list: with two waiting the machine should
   * turn to whichever it is already closest to facing, not swing across the Atlantic
   * because that one happens to be earlier in the array.
   *
   * Hidden signals are excluded - they are not in the fiction yet, and turning to look at
   * one would announce a request the player has not been given.
   */
  private rotationForWaiting(): number | null {
    let best: number | null = null;
    let shortest = Infinity;

    for (const signal of this.signals) {
      if (signal.hidden || signal.state !== SignalState.Waiting) continue;
      // project() adds `rotation` to the longitude, so front-centre is where that sums to 0.
      const wanted = -signal.longitude * DEG;
      const gap = Math.abs(Math.atan2(Math.sin(wanted - this.rotation), Math.cos(wanted - this.rotation)));
      if (gap < shortest) {
        shortest = gap;
        best = wanted;
      }
    }

    return best;
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
      if (signal.hidden) continue;
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
      /*
       * Answered, and off the map.
       *
       * These used to sit here dim and permanent, on §163's argument that the world
       * remembers what you did. It does - the count in the margin still rises and the
       * knowledge tree still grows - but the globe is the thing the player SCANS, and
       * every solved contact left on it is one more dot to check and discard on every
       * pass. That gets worse with every request answered, which is precisely
       * backwards: the map should get easier to read as the player gets better, not
       * harder.
       *
       * Null rather than hidden, so they are still in `signals` and still counted
       * under ANSWERED. Taken off the map, not out of the record.
       */
      case SignalState.Resolved:
        return null;
      /*
       * Present, not asking yet - and these DO stay. A dim dot is what makes the
       * globe a world with people on it rather than a list of open tickets, and it
       * is the only thing left promising that there is more coming.
       */
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
