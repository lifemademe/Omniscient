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
  left: 50%;
  bottom: 18px;
  transform: translateX(-50%);
  width: 208px;
  padding: 8px 8px 6px;
  background: rgba(9, 20, 13, 0.82);
  border: 1px solid rgba(143, 190, 147, 0.45);
  border-radius: 3px;
  box-shadow: 0 0 18px rgba(0, 0, 0, 0.5);
  font-family: 'Courier New', Courier, monospace;
  color: #8fbe93;
  pointer-events: none;
  opacity: 0;
  transition: opacity 260ms ease;
  z-index: 40;
}
.omni-plot--on { opacity: 1; }
.omni-plot__head {
  display: flex;
  justify-content: space-between;
  font-size: 9px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  margin-bottom: 5px;
  opacity: 0.78;
}
.omni-plot__canvas { display: block; width: 192px; height: 132px; }
.omni-plot__keys {
  margin-top: 5px;
  font-size: 9px;
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
};

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
}

export class MowerPlot {
  private readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly progressLabel: HTMLSpanElement;
  private status!: HTMLDivElement;
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
    // Drawn at twice the CSS size so the unit marker and the grid are not mush.
    this.canvas.width = 384;
    this.canvas.height = 264;
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

  public destroy(): void {
    this.root.remove();
  }

  public draw(state: PlotState): void {
    const ctx = this.ctx;
    if (!ctx) return;

    const w = this.canvas.width;
    const h = this.canvas.height;
    const spanX = this.bounds.maxX - this.bounds.minX;
    const spanZ = this.bounds.maxZ - this.bounds.minZ;
    /*
     * One scale for both axes, chosen from whichever is tighter.
     *
     * Fitting x and z independently would stretch the plot to the panel, and a chart of
     * ground whose aspect does not match the ground is worse than no chart - the player
     * uses it to judge whether they can fit down the side of a bed.
     */
    const scale = Math.min((w - 16) / spanX, (h - 16) / spanZ);
    const originX = w / 2 - ((this.bounds.minX + this.bounds.maxX) / 2) * scale;
    // North is -z, which is up the tunnel and away from the camera. Same as the district.
    const originY = h / 2 + ((this.bounds.minZ + this.bounds.maxZ) / 2) * scale;
    const sx = (x: number): number => originX + x * scale;
    const sy = (z: number): number => originY - z * scale;

    ctx.fillStyle = INK.back;
    ctx.fillRect(0, 0, w, h);

    // A metre grid, so the sizes on the chart mean something.
    ctx.strokeStyle = INK.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.ceil(this.bounds.minX); x <= this.bounds.maxX; x++) {
      ctx.moveTo(sx(x), sy(this.bounds.maxZ));
      ctx.lineTo(sx(x), sy(this.bounds.minZ));
    }
    for (let z = Math.ceil(this.bounds.minZ); z <= this.bounds.maxZ; z++) {
      ctx.moveTo(sx(this.bounds.minX), sy(z));
      ctx.lineTo(sx(this.bounds.maxX), sy(z));
    }
    ctx.stroke();

    // What is still standing, and what has been been over.
    const dot = Math.max(1.5, scale * 0.11);
    for (let i = 0; i < state.points.length; i += this.stride) {
      const point = state.points[i];
      ctx.fillStyle = point.cut ? INK.cut : INK.standing;
      ctx.fillRect(sx(point.x) - dot / 2, sy(point.z) - dot / 2, dot, dot);
    }

    // The beds and the trunk: outlines, because they are boundaries and not obstacles to
    // be read as terrain.
    ctx.strokeStyle = INK.keepOut;
    ctx.lineWidth = 2;
    for (const shape of this.shapes) {
      ctx.beginPath();
      ctx.arc(sx(shape.x), sy(shape.z), shape.radius * scale, 0, Math.PI * 2);
      ctx.stroke();
    }

    /*
     * The unit itself: an arrowhead, not a dot.
     *
     * The single most useful thing this chart can tell the player is which way the machine
     * is pointing, because that is what the controls act on and the first-person view can
     * only show them where it is ALREADY going. A dot would make them steer by trial.
     */
    const px = sx(state.x);
    const py = sy(state.z);
    const nose = scale * 0.34;
    const wing = scale * 0.2;
    const dirX = Math.sin(state.heading);
    const dirZ = Math.cos(state.heading);
    ctx.fillStyle = INK.unit;
    ctx.beginPath();
    ctx.moveTo(px + dirX * nose, py - dirZ * nose);
    ctx.lineTo(px - dirX * wing + dirZ * wing, py + dirZ * wing + dirX * wing);
    ctx.lineTo(px - dirX * wing - dirZ * wing, py + dirZ * wing - dirX * wing);
    ctx.closePath();
    ctx.fill();

    /*
     * And where to go next, drawn as a line from the machine rather than as a marker.
     *
     * A dot on a chart is a place; a line from you to it is a direction, and a direction
     * is what somebody steering actually needs. Dashed so it cannot be mistaken for
     * anything on the ground.
     */
    if (state.guide) {
      ctx.strokeStyle = INK.bed;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(sx(state.guide.x), sy(state.guide.z));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = INK.bed;
      ctx.beginPath();
      ctx.arc(sx(state.guide.x), sy(state.guide.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }

    this.progressLabel.textContent = `${Math.round(state.progress * 100)}%`;
    this.status.textContent = statusFor(state.progress, state.guide != null);
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
