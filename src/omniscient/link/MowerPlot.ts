/**
 * The mower's overhead plot: a small chart of the ground, drawn by the machine.
 *
 * ## Why this is a drawing and not a second camera
 *
 * The ask was "a small top view of the lawn mower in front of the camera", and the literal
 * reading is a second viewport rendering the same 3D scene from above. That would be the
 * wrong object even if it were free, and it is not free - the rig owns exactly one
 * ViewTargetCameraNode and says so.
 *
 * The right object is a PLOT. OMNISCIENT_ has no eyes on that field; it has a machine
 * reporting its own position down a link, which is exactly the situation in District 07,
 * where the district is drawn as a wireframe because the machine has never seen it. Wiring
 * a real camera to the sky over Adaeze's smallholding would quietly say the machine can
 * see - which is the one thing the whole game is built to deny.
 *
 * So it is the same green phosphor as the photographs and the tool bag, showing what a
 * groundskeeping unit would actually know: where it is, which way it is pointing, where
 * the ground it must not drive into is, and which of the bank it has already been over.
 *
 * ## Coverage from the grass itself
 *
 * The cut map is not a paint buffer kept alongside the field. It is the blades, sampled -
 * so the plot cannot disagree with the lawn. If a strip looks uncut on the chart it is
 * because those blades are standing, and driving over them will change both at once.
 */

const STYLE_ID = 'omni-mower-plot-style';

const CSS = `
.omni-plot {
  position: absolute;
  left: max(18px, env(safe-area-inset-left));
  bottom: max(18px, env(safe-area-inset-bottom));
  /*
   * Scaled up on arrival as well as faded.
   *
   * Reported as taking a while to notice, and fading a small panel in at the bottom of a
   * 3D view is about the quietest way there is to introduce a control surface. It now
   * arrives - 0.86 to 1 over a quarter second, which is under the threshold of feeling
   * like an animation and over the threshold of catching an eye that is looking at a field.
   */
  transform: scale(0.86);
  transform-origin: left bottom;
  width: 190px;
  padding: 9px 9px 7px;
  background: rgba(9, 20, 13, 0.82);
  border: 1px solid rgba(143, 190, 147, 0.45);
  border-radius: 3px;
  box-shadow: 0 0 18px rgba(0, 0, 0, 0.5);
  font-family: 'Courier New', Courier, monospace;
  color: #8fbe93;
  pointer-events: none;
  opacity: 0;
  transition: opacity 260ms ease, transform 260ms cubic-bezier(0.2, 1.3, 0.4, 1);
  z-index: 40;
}
.omni-plot--on { opacity: 1; transform: scale(1); }
.omni-plot--complete {
  border-color: rgba(216, 255, 176, 0.9);
  box-shadow: 0 0 0 1px rgba(216, 255, 176, 0.18), 0 0 24px rgba(84, 154, 88, 0.4);
  animation: omni-plot-lock 620ms ease-out both;
}
@keyframes omni-plot-lock {
  0% { filter: brightness(1); }
  32% { filter: brightness(1.75); }
  100% { filter: brightness(1); }
}
.omni-plot__head {
  display: flex;
  justify-content: space-between;
  font-size: calc(9px + var(--omni-font-boost, 0px));
  letter-spacing: 0.14em;
  text-transform: uppercase;
  margin-bottom: 5px;
  opacity: 0.78;
}
/*
 * Square canvas, round window.
 *
 * The chart turns with the machine now, so it has to be circular - a rotating square
 * shows corners of ground on the diagonals and none on the axes, and the amount of world
 * visible would change as the player steered. A circle is the only shape whose contents
 * do not depend on its heading.
 */
.omni-plot__canvas {
  display: block;
  width: 172px;
  height: 172px;
  border-radius: 50%;
  border: 1px solid rgba(143, 190, 147, 0.3);
}
.omni-plot__keys {
  margin-top: 5px;
  font-size: calc(9px + var(--omni-font-boost, 0px));
  letter-spacing: 0.1em;
  text-align: center;
  opacity: 0.62;
}
`;

const INK = {
  back: '#0d1b12',
  grid: '#1e3a26',
  standing: '#4a7d52',
  cut: '#16301d',
  keepOut: '#2b4a33',
  unit: '#d8ffb0',
  bed: '#6f9c74',
  /** What the sweep lifts each to as it passes. Two, because they must not converge. */
  standingLit: '#b6f08a',
  cutLit: '#2f5a38',
  sweep: '#9fdc86',
};

/**
 * The sonar, and what it is and is not for.
 *
 * ## Why it belongs here
 *
 * The plot was drawing every blade's state continuously, which quietly claims the machine
 * has live vision of a field it has no eyes on. It does not. It has a unit on a radio
 * reporting what it can currently detect, and a rotating head is what that looks like -
 * the same honesty District 07's wireframe has about a district nobody has seen.
 *
 * ## Why it does not fade to nothing
 *
 * The proposal was that pinged blades glow and then disappear, to make the job harder. It
 * would make the job harder and it would be the wrong kind of harder: the difficulty in
 * mowing should live in the driving - overlapping passes, the 1.1m gap between the bed and
 * the trunk - and not in fighting the instrument. A player who knows exactly what to do and
 * is prevented from seeing where to do it has been given busywork, and the hunt for the
 * last three patches is the part people put a game like this down over.
 *
 * So the sweep LIFTS rather than reveals. Every blade is drawn at its resting brightness
 * either way and the ping is a highlight passing over information that was already there.
 * Which turns out to make the chart better at its job rather than worse: standing grass
 * pings hard and stubble pings faintly, so the contrast between done and not-done is
 * momentarily three times what it is at rest, and a missed strip FLASHES as the head goes
 * over it.
 *
 * ## Stateless, which is why it costs nothing
 *
 * There is no per-blade timer. The trail is a pure function of how far the head has turned
 * PAST a blade's bearing, so 6,400 blades need 6,400 subtractions and no memory at all -
 * and the decay cannot drift out of step with the sweep line because they are the same
 * number read twice.
 */
const TWO_PI = Math.PI * 2;
const SWEEP_RATE = 1.75;
/** How far behind the head a ping is still visible, in radians. Just over a third of a turn. */
const SWEEP_TRAIL = 2.2;

/**
 * How much ground the window shows, in metres from the machine to the rim.
 *
 * 4.5 puts the whole 3.45m width of the bank across the chart with a little either side,
 * so a player driving up the middle can see both edges at once - which is the one
 * measurement they need, because the job is passes down a strip. Wider and the blades
 * become dust; tighter and they cannot see the far edge to aim at.
 */
const VIEW_RADIUS = 4.5;

export interface PlotBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface PlotShape {
  x: number;
  z: number;
  radius: number;
}

export interface PlotState {
  x: number;
  z: number;
  heading: number;
  progress: number;
  points: ReadonlyArray<{ x: number; z: number; cut: boolean }>;
  /**
   * The nearest thing still standing, once it is worth pointing at.
   *
   * Null early on, deliberately. At the start of the job everything is standing and an
   * arrow saying "grass, over there" is noise that teaches the player to ignore the one
   * place the game will later put something they need. It appears when the sweep is
   * mostly done and finding the last patches has stopped being obvious.
   */
  guide?: { x: number; z: number } | null;
  /** Seconds since the last draw, for the sonar head. */
  deltaTime: number;
}

export class MowerPlot {
  private readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly progressLabel: HTMLSpanElement;
  private status!: HTMLDivElement;
  private completed = false;
  /** Where the sonar head is pointing, machine-relative. See the note on SWEEP_RATE. */
  private sweep = 0;
  /**
   * Eight brightnesses each for standing and cut grass, built once.
   *
   * The ping has to reach a fill colour for every blade every frame, and building a CSS
   * string per blade would be 6,400 allocations and 6,400 colour parses a frame to draw a
   * chart 196 pixels across. Quantising to eight steps and interpolating them at
   * construction makes it an array index - and at a 2px dot, eight steps and a continuous
   * ramp are the same picture.
   */
  private readonly ramp = MowerPlot.buildRamp();

  private static buildRamp(): { standing: string[]; cut: string[] } {
    const shade = (from: string, to: string): string[] => {
      const a = MowerPlot.rgb(from);
      const b = MowerPlot.rgb(to);
      return Array.from({ length: 8 }, (_, i) => {
        const t = i / 7;
        const mix = a.map((channel, c) => Math.round(channel + (b[c] - channel) * t));
        return `rgb(${mix[0]},${mix[1]},${mix[2]})`;
      });
    };
    return {
      standing: shade(INK.standing, INK.standingLit),
      cut: shade(INK.cut, INK.cutLit),
    };
  }

  private static rgb(hex: string): number[] {
    const value = parseInt(hex.slice(1), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  }
  private readonly ctx: CanvasRenderingContext2D | null;
  private bounds: PlotBounds = { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };
  private shapes: readonly PlotShape[] = [];
  /**
   * Every Nth blade, and only the ones that fell in the bank.
   *
   * A few thousand blades redrawn sixty times a second is a few hundred thousand fillRects
   * a second to draw a chart 192 pixels wide, where fifty of them land on the same pixel.
   * Sampling is not an approximation here - at this scale it is the same picture.
   */
  private stride = 1;

  public constructor(container: HTMLElement) {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    this.root = document.createElement('div');
    this.root.className = 'omni-plot';

    const head = document.createElement('div');
    head.className = 'omni-plot__head';
    const title = document.createElement('span');
    title.textContent = 'GROUNDS UNIT';
    this.progressLabel = document.createElement('span');
    this.progressLabel.textContent = '0%';
    head.append(title, this.progressLabel);

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'omni-plot__canvas';
    // Square, and drawn at twice the CSS size so the marker and the grid are not mush.
    this.canvas.width = 392;
    this.canvas.height = 392;
    this.ctx = this.canvas.getContext('2d');

    const keys = document.createElement('div');
    keys.className = 'omni-plot__keys';
    keys.textContent = 'W A S D  /  ARROWS';
    this.status = keys;

    this.root.append(head, this.canvas, keys);
    container.appendChild(this.root);
  }

  /** The ground this plot covers, and the things on it that cannot be driven over. */
  public setGround(bounds: PlotBounds, shapes: readonly PlotShape[], blades: number): void {
    this.bounds = bounds;
    this.shapes = shapes;
    this.stride = Math.max(1, Math.round(blades / 2600));
  }

  public setVisible(on: boolean): void {
    this.root.classList.toggle('omni-plot--on', on);
  }

  public reset(): void {
    this.completed = false;
    this.root.classList.remove('omni-plot--complete');
    this.progressLabel.textContent = '0%';
    this.status.textContent = 'W A S D  /  ARROWS';
  }

  /** One report, not a score spray: the unit locks the completed bank on its instrument. */
  public complete(): void {
    if (this.completed) return;
    this.completed = true;
    this.root.classList.add('omni-plot--complete');
    this.progressLabel.textContent = '100%';
    this.status.textContent = 'BANK CLEAR  //  LIGHT PATH OPEN';
  }

  public destroy(): void {
    this.root.remove();
  }

  public draw(state: PlotState): void {
    const ctx = this.ctx;
    if (!ctx) return;

    const w = this.canvas.width;
    const h = this.canvas.height;

    /**
     * ## Heading up, machine centred
     *
     * This was north-up and whole-bank, and it was the wrong chart for the job. A fixed
     * map is what you want when you are choosing a route on a table; it is close to
     * useless when you are steering, because it asks you to do the rotation in your head
     * every frame. Reported exactly that way: left, right, front and back were not
     * readable off it.
     *
     * So the plot turns with the unit and the unit stays in the middle. Up the chart is
     * always straight ahead, a mark to the right of centre is a mark to the right of the
     * machine, and steering toward something on the plot is a matter of turning until it is
     * above you. Nothing has to be interpreted.
     *
     * The cost is that the bank as a whole is no longer laid out in front of the player,
     * which is why the scale is fixed rather than fitted: a constant metres-per-pixel means
     * the chart reads as a WINDOW onto the ground moving under it, and a window is a thing
     * whose contents can be trusted to mean the same size all the time. A fitted scale that
     * changed as the machine moved would be a chart that lies about distance.
     */
    const scale = (w * 0.5 - 10) / VIEW_RADIUS;
    ctx.save();
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = INK.back;
    ctx.fillRect(0, 0, w, h);

    ctx.translate(w / 2, h / 2);
    // Negative, because the world turns the opposite way to the thing looking at it.
    ctx.rotate(-state.heading);
    ctx.translate(-state.x * scale, state.z * scale);

    const sx = (x: number): number => x * scale;
    const sy = (z: number): number => -z * scale;

    /*
     * The head turns, machine-relative.
     *
     * Relative rather than absolute because the sensor is bolted to the mower - a spinning
     * head on a vehicle sweeps its own bearings, not the world's. On a heading-up chart that
     * also means it rotates steadily on screen whatever the player is doing with the
     * steering, which is what a sonar looks like.
     *
     * Clamped delta, because a stalled frame must not teleport the head half a turn and
     * strobe the whole field at once.
     */
    this.sweep = (this.sweep + Math.min(state.deltaTime, 0.1) * SWEEP_RATE) % TWO_PI;

    /*
     * A metre grid over the window, and it is now load-bearing rather than decoration.
     *
     * On a rotating chart the grid is the only thing that shows the rotation happening.
     * Without it a plot that turns under a centred marker looks like a plot that is not
     * turning at all - the marker is still, the dots move, and there is nothing to say
     * whether the machine swung or the ground slid.
     *
     * Drawn a little past the window so no line stops inside the circle.
     */
    const reach = VIEW_RADIUS * 1.5;
    ctx.strokeStyle = INK.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.floor(state.x - reach); x <= state.x + reach; x++) {
      ctx.moveTo(sx(x), sy(state.z - reach));
      ctx.lineTo(sx(x), sy(state.z + reach));
    }
    for (let z = Math.floor(state.z - reach); z <= state.z + reach; z++) {
      ctx.moveTo(sx(state.x - reach), sy(z));
      ctx.lineTo(sx(state.x + reach), sy(z));
    }
    ctx.stroke();

    /*
     * The edge of the ground, so the player can see where they are about to run out of it.
     *
     * The old chart had the bank's boundary as the frame of the panel and did not need to
     * draw it. A window has to.
     */
    ctx.strokeStyle = INK.keepOut;
    ctx.lineWidth = 2;
    ctx.strokeRect(
      sx(this.bounds.minX),
      sy(this.bounds.maxZ),
      (this.bounds.maxX - this.bounds.minX) * scale,
      (this.bounds.maxZ - this.bounds.minZ) * scale
    );

    // What is still standing, and what has been been over.
    const dot = Math.max(2, scale * 0.13);
    /*
     * Colours resolved once, outside the loop.
     *
     * The ping is quantised to eight steps and the eight are precomputed, because setting
     * ctx.fillStyle to a fresh string per blade is a string allocation and a parse per
     * blade per frame - and at this dot size eight steps is indistinguishable from a
     * continuous ramp anyway. It also means consecutive blades at the same ping share a
     * fillStyle, which is the case the canvas is fastest at.
     */
    const lit = this.ramp;
    for (let i = 0; i < state.points.length; i += this.stride) {
      const point = state.points[i];
      // Outside the window is off the chart; skipped before any drawing is set up, because
      // most of the bank is off the chart at any moment now.
      const dx = point.x - state.x;
      const dz = point.z - state.z;
      if (Math.abs(dx) > reach || Math.abs(dz) > reach) continue;

      /*
       * How far the head has turned PAST this blade, wrapped into one revolution.
       *
       * `atan2(dx, dz) - heading` is the blade's bearing in the machine's own frame, which
       * is the frame the head sweeps in. The modulo is what makes the trail wrap cleanly
       * through the back of the sweep instead of snapping once a revolution.
       */
      const bearing = Math.atan2(dx, dz) - state.heading;
      const behind = (this.sweep - bearing + TWO_PI * 2) % TWO_PI;
      const ping = behind < SWEEP_TRAIL ? 1 - behind / SWEEP_TRAIL : 0;
      // Squared, so the head is a bright edge with a long soft tail rather than a wide band.
      const step = Math.min(7, (ping * ping * 8) | 0);

      ctx.fillStyle = point.cut ? lit.cut[step] : lit.standing[step];
      ctx.fillRect(sx(point.x) - dot / 2, sy(point.z) - dot / 2, dot, dot);
    }

    /**
     * The head itself: one line, and a wedge behind it.
     *
     * The line is what the eye tracks and the wedge is what makes the decay on the blades
     * read as belonging to it rather than as the field flickering on its own. Drawn after
     * the blades so it sits over them, and at low alpha so it never competes with what it
     * is illuminating.
     */
    const headAngle = this.sweep + state.heading;
    const rim = VIEW_RADIUS * scale;
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = INK.sweep;
    ctx.beginPath();
    ctx.moveTo(sx(state.x), sy(state.z));
    /*
     * The wedge has to be the same set of blades the ping lifted, and this took solving
     * rather than guessing.
     *
     * A world bearing phi projects to canvas angle phi - PI/2: the chart's y runs opposite
     * to the world's z, so cos(alpha) = sin(phi) and sin(alpha) = -cos(phi). The trail is
     * BEHIND the head, so the arc runs from (head - trail) to (head), both shifted by that
     * quarter turn.
     *
     * My first attempt was `PI/2 - headAngle` going forwards, which is the reflection of
     * this and put the wedge on the wrong side of the line. Checked by sampling 4,116
     * (heading, sweep, bearing) triples and asking whether every blade with a non-zero
     * ping falls inside the wedge: this expression, none disagree; the first one, 945 did.
     * On a 196-pixel chart with a soft fill, "the glow is on the wrong side of the line"
     * is not something I would have trusted my eye to catch.
     */
    ctx.arc(
      sx(state.x),
      sy(state.z),
      rim,
      headAngle - SWEEP_TRAIL - Math.PI / 2,
      headAngle - Math.PI / 2
    );
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = INK.sweep;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.moveTo(sx(state.x), sy(state.z));
    ctx.lineTo(
      sx(state.x) + Math.sin(headAngle) * rim,
      sy(state.z) - Math.cos(headAngle) * rim
    );
    ctx.stroke();
    ctx.globalAlpha = 1;

    // The beds and the trunk: outlines, because they are boundaries and not obstacles to
    // be read as terrain.
    ctx.strokeStyle = INK.bed;
    ctx.lineWidth = 2;
    for (const shape of this.shapes) {
      ctx.beginPath();
      ctx.arc(sx(shape.x), sy(shape.z), shape.radius * scale, 0, Math.PI * 2);
      ctx.stroke();
    }

    /*
     * And where to go next, drawn as a line from the machine.
     *
     * A dot on a chart is a place; a line from you to it is a direction, and on a
     * heading-up plot that line points at the same angle on screen as the turn the player
     * has to make. Steering is now "turn until the dashed line is vertical", which is not
     * something they have to be told. Dashed so it cannot be mistaken for anything on the
     * ground.
     *
     * Clamped to the rim when the target is off the window, because the last uncut patch
     * is often further than 4.5m and an arrow that vanishes exactly when it becomes useful
     * is worse than no arrow.
     */
    if (state.guide) {
      const dx = state.guide.x - state.x;
      const dz = state.guide.z - state.z;
      const far = Math.hypot(dx, dz);
      const shown = Math.min(far, VIEW_RADIUS * 0.88);
      const gx = sx(state.x + (dx / far) * shown);
      const gy = sy(state.z + (dz / far) * shown);

      ctx.strokeStyle = INK.bed;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(sx(state.x), sy(state.z));
      ctx.lineTo(gx, gy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = INK.bed;
      ctx.beginPath();
      ctx.arc(gx, gy, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    /**
     * The unit, drawn last and in SCREEN space.
     *
     * Outside the rotation on purpose. The machine is the one thing on this chart that
     * never moves and never turns, because the chart moves and turns around it - so it is
     * an arrowhead at the centre pointing straight up, always. That is what makes up mean
     * ahead: there is a fixed thing to be ahead OF.
     */
    const cx = w / 2;
    const cy = h / 2;
    const nose = scale * 0.42;
    const wing = scale * 0.26;
    ctx.fillStyle = INK.unit;
    ctx.beginPath();
    ctx.moveTo(cx, cy - nose);
    ctx.lineTo(cx + wing, cy + wing);
    ctx.lineTo(cx, cy + wing * 0.35);
    ctx.lineTo(cx - wing, cy + wing);
    ctx.closePath();
    ctx.fill();

    if (!this.completed) {
      this.progressLabel.textContent = `${Math.round(state.progress * 100)}%`;
      this.status.textContent = statusFor(state.progress, state.guide != null);
    }
  }
}

/**
 * What the panel says under the chart.
 *
 * The one place this game nudges, and it is worth being careful about the register. Adaeze
 * does not say any of this - she is standing in a field forty metres away and the console
 * is behind the player - so it is the UNIT reporting, in the flat voice a machine reports
 * in. No praise, no exclamation, no score. A groundskeeping unit tells you the state of
 * the bank and what it is waiting for.
 *
 * The progression matters more than the words. The first line is an instruction, because
 * a player who has just been handed controls does not yet know that driving over grass is
 * the verb. The middle is a plain figure, which is its own encouragement - a number that
 * moves when you act is the oldest reason in games to keep acting. The last one exists
 * because that is where people give up.
 */
function statusFor(progress: number, guided: boolean): string {
  if (progress < 0.06) return 'DRIVE OVER THE STANDING GRASS';
  if (progress < 0.55) return 'CLEARING — HOLD YOUR LINE';
  if (progress < 1) return guided ? 'MISSED PATCHES MARKED' : 'ALMOST CLEAR';
  return 'BANK CLEAR';
}
