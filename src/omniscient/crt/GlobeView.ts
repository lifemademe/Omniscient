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
   * Not on the planet.
   *
   * A signal with a latitude and longitude is a place, and the whole point of the anomaly is
   * that it is not one. Sitting on the sphere it read as a town nobody had named - the
   * strangeness was carried entirely by it blinking slower than everything else, which is a
   * detail most players will never consciously register.
   *
   * Off the sphere it needs no explaining. There is a world, and there is something beside
   * it, and the eye does the rest. It also stops rotating out of view, so it is always there
   * when the player looks - which is worse for them and better for the game.
   */
  offworld?: boolean;

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
  /**
   * Blink-rate multiplier while Waiting. 1 is the resting heartbeat; an urgent request
   * beats faster. Set by the rig from the mission's authored urgency - the globe knows
   * nothing about missions, it just blinks at the pace it is told. This is the field
   * that finally READS `urgency`: the value was authored on every mission since the
   * start and consumed by nothing, which §157 would call a promise the pipeline breaks
   * silently.
   */
  pace?: number;
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
 * The globe turns all the way round, always, and the RATE is what carries the attention.
 *
 * ## What was here before, and why it never completed a turn
 *
 * Two fixes had been stacked on this. The first eased a waiting caller round to the front
 * and stopped, which read as the globe never turning again - because something is waiting
 * almost all the time, so "hold the caller at the front" resolved to "hold still, forever".
 * The second replaced the stop with a sweep: keep moving, but only within 26 degrees either
 * side of the caller, reversing at the edges.
 *
 * That is a 52-degree wobble. The globe never showed the other 308 degrees of itself again
 * after the first request arrived, which is what "it is supposed to rotate 360 degrees"
 * means and it is a fair description of a planet the player was only ever shown one face of.
 *
 * ## One direction, always, with the speed doing the work
 *
 * The requirement was never "keep the caller centred", it was "let the player reach the
 * caller". Those come apart the moment you are allowed to vary the rate: the globe turns
 * continuously in one direction and completes every revolution, but it CRAWLS while the
 * caller is across the front of the sphere and hurries across the empty back.
 *
 * Integrated over a full turn at 1/240s steps, that gives:
 *
 *   - a revolution in 29.6s, so the world is a world again
 *   - 10.6s of every turn with the caller within 35 degrees of front-centre, where the
 *     marker is big and square-on and easy to hit - up from 7.6s under plain drift
 *   - only 5.2s beyond 120 degrees, so the far side is somewhere it passes through rather
 *     than somewhere it sits
 *
 * It is also the better fiction, and closer to what the sweep was reaching for. The machine
 * is not staring at one town and it is not idly spinning; it is going round the whole world
 * and slowing down over the person who is talking.
 */
/** Rate at the very front, in rad/s. Slower than the old idle drift, on purpose. */
const ATTEND_SLOW = 0.1;
/** Rate at the very back. Five times the front, which is what buys the revolution back. */
const ATTEND_FAST = 0.5;
/**
 * How sharply the rate falls off approaching the front.
 *
 * Above 1 so the slow band is WIDE and the transition is gentle: at 1.0 the rate is linear
 * in the angle and the globe visibly changes pace, which reads as a stutter. 1.4 spends
 * most of the deceleration far from the front, where nobody is looking at the speed.
 */
const ATTEND_FALLOFF = 1.4;

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

  /**
   * How far round the globe has turned, wrapped to [0, 2pi).
   *
   * Exposed so preview-stuck can assert the thing this class has now got wrong twice: that
   * a revolution actually completes while somebody is waiting. Read-only, and nothing in
   * the game reads it - if the harness cannot see the state, the harness cannot hold it.
   */
  public get heading(): number {
    return this.rotation;
  }

  /**
   * Turn the world by hand.
   *
   * The globe has always turned on its own and never for the player, which makes it a
   * display rather than an instrument - the one thing on this screen you cannot touch. A
   * drag is the oldest gesture there is for a globe, and it costs one number.
   *
   * Nothing is clamped or eased here on purpose. The hand should feel directly connected to
   * the world, and any smoothing between the mouse and the rotation is felt as lag by
   * everybody who has ever spun one.
   */
  public turnBy(radians: number): void {
    this.rotation = (this.rotation + radians) % (Math.PI * 2);
  }

  public setSignals(signals: Signal[]): void {
    this.signals = signals;
  }

  /**
   * Turn the globe. Always the same way, always all the way round.
   *
   * With nothing waiting it drifts at the caller's rate, as it always has. With somebody
   * waiting the rate varies instead of the direction: see the note on ATTEND_SLOW for the
   * measured shape of it, and for the two earlier attempts that traded the revolution away
   * to keep the caller reachable.
   *
   * The direction never changes and the rate never reaches zero, which together are the
   * whole guarantee - every signal on the globe comes round to the front, on its own, in
   * under half a minute, without the player having to do anything.
   */
  public advance(deltaTime: number, speed = 0.16): void {
    const attend = this.rotationForWaiting();

    if (attend === null) {
      this.rotation = (this.rotation + deltaTime * speed) % (Math.PI * 2);
      return;
    }

    // Wrapped to [-pi, pi]: how far the caller still is from front-centre, signed. Only its
    // MAGNITUDE is used - the sign used to pick a direction, and picking a direction is
    // exactly what stopped the globe completing a turn.
    const gap = Math.atan2(Math.sin(attend - this.rotation), Math.cos(attend - this.rotation));
    const away = Math.min(1, Math.abs(gap) / Math.PI);
    const rate = ATTEND_SLOW + (ATTEND_FAST - ATTEND_SLOW) * away ** ATTEND_FALLOFF;

    this.rotation = (this.rotation + rate * deltaTime) % (Math.PI * 2);
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
      const point = signal.offworld
        ? this.projectOffworld()
        : this.project(signal.latitude, signal.longitude);
      return { signal, x: point.x, y: point.y, visible: point.visible };
    });
  }

  /** Always visible, and never anywhere the world can rotate it to. */
  private projectOffworld(): Projected {
    return {
      x: this.centreX + GlobeView.OFFWORLD.x * this.radius,
      y: this.centreY + GlobeView.OFFWORLD.y * this.radius,
      visible: true,
    };
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

  /**
   * Where an off-world signal sits, in radii from the globe's centre.
   *
   * Beyond 1, so it is outside the sphere and never occluded by it, and high on the right
   * where the panel furniture is thinnest. It does not turn with the world because it is not
   * part of it.
   */
  private static readonly OFFWORLD = { x: 1.34, y: -0.72 };

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
      const point = signal.offworld
        ? this.projectOffworld()
        : this.project(signal.latitude, signal.longitude);
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
      case SignalState.Waiting: {
        // Blink: on for most of the cycle, briefly off. Reads as a heartbeat - and an
        // urgent one beats faster, which is how urgency reaches the player's eye before
        // any text does. See Signal.pace.
        const phase = (pulse * (signal.pace ?? 1)) % 1;
        return phase < 0.78 ? PALETTE.waiting : PALETTE.terminator;
      }
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
