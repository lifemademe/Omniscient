/**
 * What a municipal camera sees, as characters.
 *
 * ## Why ASCII, and why that is not a style choice
 *
 * `geometry/wireCity.ts` sets out this game's visual thesis in three tiers:
 *
 *   wireframe   - OMNISCIENT observing reality
 *   rendered    - OMNISCIENT talking to somebody through a device
 *   first person - OMNISCIENT inside a system that is connected to it
 *
 * A camera on the municipal network is a device OMNISCIENT is connected to, so looking
 * through one is the third tier - which until now existed nowhere in this project except
 * the comment declaring it. And the same argument that made the city a wireframe makes the
 * feed a glyph grid: drawing brick on the buildings "would be a lie about what it knows".
 * A character reconstruction stays honest that this is a machine inferring a street from a
 * data feed, not a photograph of one.
 *
 * ## Why this file imports nothing
 *
 * It is arithmetic on a district and returns rows of coloured cells. No THREE, no engine,
 * no DOM - so the harness can drive it headlessly and assert things about what the player
 * will actually see. The same discipline as m4ss/swingShape.ts, for the same reason: a
 * claim about a picture deserves a measurement, not a squint at a screenshot.
 *
 * ## The rule that outranks every other decision here
 *
 * THE FEED MUST NOT SHOW THE CAR BEFORE THE PLAYER COMMITS. Mission 08 is won by narrowing
 * rather than searching; a live thumbnail with the suspect in it would collapse the entire
 * deduction into "pick the one with the car". `renderFeed` therefore takes an explicit
 * `suspect` argument that the pre-commit caller passes as null, and there is no other route
 * by which a car can enter the picture.
 */

import type { Block, WireCity } from '../geometry/wireCity.js';

/** One character and the colour it is drawn in. */
export interface FeedCell {
  ch: string;
  colour: string;
}

export type FeedRow = FeedCell[];

/**
 * The console's own palette. NOT the cyberpunk rainbow of the reference art: this feed
 * hangs inside a green-on-dark operator console, and a red-and-yellow skyline would read as
 * a different game embedded in this one.
 */
export const FEED_COLOURS = {
  /** Structure, far. Barely above the background - mass without detail. */
  far: '#16281d',
  /** Structure, near. */
  near: '#1f3b28',
  /** The lit edge of a block, so a silhouette has a top. */
  edge: '#2b5c39',
  /** Ordinary windows. */
  window: '#3f6b4a',
  /** The few windows that are properly lit. */
  windowLit: '#5f9c6c',
  road: '#243028',
  marking: '#33443a',
  /** Ambient traffic - present, unremarkable. */
  traffic: '#8fbf9a',
  /**
   * The suspect. The objective-text colour, used nowhere else in this feed, so the one
   * moment it appears it is the only thing on screen wearing it.
   */
  suspect: '#d8ffb0',
  chrome: '#5f9c6c',
  dim: '#2f4a37',
} as const;

export const FEED_W = 88;
export const FEED_H = 26;

/** Where the horizon sits. Everything below is road, everything above is skyline. */
const HORIZON = 17;

export interface FeedOptions {
  /** Seconds of feed time. Drives traffic, flicker and the scanline. */
  clock: number;
  /**
   * The suspect's position across the frame, 0 to 1, or null for "not in this shot".
   *
   * Null is the pre-commit case and the default. See the header: the puzzle dies if this is
   * ever populated before the player has chosen.
   */
  suspect?: number | null;
  /** Camera identifier, drawn in the header strip. */
  label?: string;
  /** Seconds since the last confirmed sighting, drawn in the header strip. */
  since?: number;
  /** No coverage here: the shot is static and the chrome says so. */
  dead?: boolean;
}

/** Deterministic hash so a given camera always looks like itself, run to run. */
function hash(x: number, y: number, salt = 0): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function blank(): FeedRow[] {
  const rows: FeedRow[] = [];
  for (let y = 0; y < FEED_H; y++) {
    const row: FeedRow = [];
    for (let x = 0; x < FEED_W; x++) row.push({ ch: ' ', colour: FEED_COLOURS.far });
    rows.push(row);
  }
  return rows;
}

function put(rows: FeedRow[], x: number, y: number, ch: string, colour: string): void {
  if (x < 0 || x >= FEED_W || y < 0 || y >= FEED_H) return;
  rows[y][x] = { ch, colour };
}

function text(rows: FeedRow[], x: number, y: number, s: string, colour: string): void {
  for (let i = 0; i < s.length; i++) put(rows, x + i, y, s[i], colour);
}

/**
 * Which way this camera looks.
 *
 * A junction camera points down a street, and WHICH street decides everything about the
 * picture - so it is derived from the cell rather than chosen at random each call, and the
 * same camera therefore always shows the same view. Four cardinal facings, because the
 * roads are a grid and a camera bolted to a pole looks along one of them.
 */
export function facingOf(cell: { x: number; y: number }): { fx: number; fy: number } {
  const pick = Math.floor(hash(cell.x, cell.y, 9) * 4);
  return [
    { fx: 1, fy: 0 },
    { fx: -1, fy: 0 },
    { fx: 0, fy: 1 },
    { fx: 0, fy: -1 },
  ][pick];
}

/** A block placed in the camera's own frame: how far ahead, how far to the side. */
interface Seen {
  block: Block;
  depth: number;
  lateral: number;
}

/**
 * The blocks inside the view cone, furthest first.
 *
 * The first version of this took a square of blocks around the camera and projected them
 * with a fudge that mixed both axes, which drew every building in the district on top of
 * every other one - a solid wall of glyphs with no sky and no street. A camera has a
 * DIRECTION; blocks behind it are not in shot, and blocks far to the side leave the frame.
 * Painter's order (far first) so near buildings occlude the ones behind them.
 */
function visible(city: WireCity, cx: number, cy: number): Seen[] {
  const { fx, fy } = facingOf({ x: cx, y: cy });
  const out: Seen[] = [];
  for (const block of city.blocks) {
    const rx = block.x - cx;
    const ry = block.y - cy;
    const depth = rx * fx + ry * fy;
    const lateral = rx * -fy + ry * fx;
    if (depth < 0.6 || depth > 9) continue;
    if (Math.abs(lateral) > depth * 1.4 + 1.2) continue;
    out.push({ block, depth, lateral });
  }
  return out.sort((a, b) => b.depth - a.depth);
}

/**
 * Draw one block as a face of windows.
 *
 * Real perspective, in the only two lines of it this renderer needs: everything divides by
 * depth, so a block twice as far away is half as wide and half as tall and sits half as far
 * from the centre of the frame. Window density rises downtown because `Block.downtown` is
 * the same number that decided how tall the building is.
 */
function face(rows: FeedRow[], seen: Seen, clock: number): void {
  const { block, depth, lateral } = seen;
  const screenX = Math.round(FEED_W / 2 + (lateral / depth) * 30);
  const w = Math.max(2, Math.round((block.w / depth) * 1.9));
  const h = Math.max(1, Math.round((block.height / depth) * 1.5));
  const top = Math.max(0, HORIZON - h);
  const body = depth > 4.5 ? FEED_COLOURS.far : FEED_COLOURS.near;
  const half = Math.floor(w / 2);

  for (let x = screenX - half; x <= screenX + half; x++) {
    for (let y = top; y < HORIZON; y++) {
      put(rows, x, y, y === top ? '─' : '▒', y === top ? FEED_COLOURS.edge : body);
    }
  }

  // Windows: a sparse grid inside the face, a few lit, flickering slowly. Skipped entirely
  // on distant blocks - at that size they would be noise on a silhouette.
  if (depth > 6) return;
  for (let x = screenX - half + 1; x < screenX + half; x += 2) {
    for (let y = top + 1; y < HORIZON - 1; y += 2) {
      const seed = hash(block.x * 31 + x, block.y * 17 + y);
      if (seed > 0.3 + block.downtown * 0.25) continue;
      const flicker = hash(x, y, Math.floor(clock * 1.4)) > 0.86;
      const lit = seed < 0.1 + block.downtown * 0.16;
      put(
        rows,
        x,
        y,
        lit ? '▪' : '·',
        flicker ? FEED_COLOURS.windowLit : lit ? FEED_COLOURS.window : FEED_COLOURS.dim
      );
    }
  }
}

/**
 * Render one camera's view.
 *
 * `suspect` defaults to absent, which is the safe default in the sense that matters: a
 * caller that forgets to think about it cannot accidentally give the puzzle away.
 */
export function renderFeed(
  city: WireCity,
  cell: { x: number; y: number },
  options: FeedOptions
): FeedRow[] {
  const rows = blank();
  const { clock, suspect = null, label, since, dead = false } = options;

  if (dead) {
    // No coverage. The header still reports, because a camera that is not there is a fact
    // the machine knows rather than an absence of information.
    for (let y = 0; y < FEED_H; y++) {
      for (let x = 0; x < FEED_W; x++) {
        if (hash(x, y, Math.floor(clock * 8)) > 0.986) put(rows, x, y, '·', FEED_COLOURS.dim);
      }
    }
    text(rows, 2, 1, `CAM ${label ?? '--'}`, FEED_COLOURS.dim);
    text(rows, Math.floor(FEED_W / 2) - 5, Math.floor(FEED_H / 2), 'NO SIGNAL', FEED_COLOURS.chrome);
    return rows;
  }

  for (const seen of visible(city, cell.x, cell.y)) face(rows, seen, clock);

  /*
   * The road, drawn as a corridor that converges on the vanishing point.
   *
   * The centre line is what makes a flat band of characters read as a surface going away
   * from you: it narrows to nothing at the horizon and opens to the full width of the frame
   * at the player's feet, and the dashes along it lengthen as they approach, which is the
   * whole of the perspective cue.
   */
  const vanish = Math.floor(FEED_W / 2);
  put(rows, vanish, HORIZON, '┼', FEED_COLOURS.edge);
  for (let y = HORIZON + 1; y < FEED_H - 2; y++) {
    const t = (y - HORIZON) / (FEED_H - 2 - HORIZON);
    const halfWidth = Math.round(2 + t * (FEED_W / 2));
    /*
     * The surface has to be DRAWN, not merely bounded.
     *
     * The first pass filled the corridor with spaces and put kerbs down each side, which
     * renders as two lines of floating pipes with a void between them - the road was
     * defined and invisible at the same time. Tarmac gets a faint grain that thins with
     * distance, so the near road reads as a surface and the far road stays a suggestion.
     */
    for (let x = 0; x < FEED_W; x++) {
      const inRoad = x >= vanish - halfWidth && x <= vanish + halfWidth;
      if (inRoad) {
        const grain = hash(x, y, 3) < 0.10 + t * 0.16;
        put(rows, x, y, grain ? '░' : ' ', FEED_COLOURS.road);
      } else {
        // Pavement either side, darker still - it is not where anything happens.
        put(rows, x, y, hash(x, y, 5) < 0.07 ? '·' : ' ', FEED_COLOURS.far);
      }
    }
    put(rows, vanish - halfWidth, y, '│', FEED_COLOURS.marking);
    put(rows, vanish + halfWidth, y, '│', FEED_COLOURS.marking);
    // The dashed centre line, its dashes lengthening as they approach.
    const period = Math.max(2, Math.round(6 - t * 3));
    if ((Math.floor(y * 2 + clock * 2) % period) < period / 2) {
      put(rows, vanish, y, '║', FEED_COLOURS.marking);
    }
  }

  /*
   * Ambient traffic. Two cars on loops of different length so the street is never empty and
   * never metronomic - the point is that an ordinary road looks busy, which is exactly what
   * makes the suspect's absence readable when a wrong camera is chosen.
   */
  for (let i = 0; i < 2; i++) {
    const period = 9 + i * 5;
    const t = ((clock + i * 4.3) % period) / period;
    // Coming towards the camera: it starts at the vanishing point, small, and arrives wide.
    const approach = i === 0 ? t : 1 - t;
    const y = HORIZON + 1 + Math.round(approach * (FEED_H - 4 - HORIZON));
    const spread = Math.round(2 + approach * (FEED_W / 2));
    const x = vanish + Math.round((i === 0 ? -0.45 : 0.45) * spread);
    text(rows, x, y, approach > 0.55 ? '▬▬' : '▬', FEED_COLOURS.traffic);
  }

  /*
   * The suspect, when the caller has earned the right to show it. Wider and brighter than
   * ambient traffic and wearing a colour nothing else in this feed uses, because the whole
   * point of the moment is that you know it the instant it enters frame.
   */
  if (suspect !== null) {
    const y = HORIZON + 1 + Math.round(suspect * (FEED_H - 4 - HORIZON));
    const spread = Math.round(2 + suspect * (FEED_W / 2));
    const x = vanish + Math.round(0.4 * spread) - 1;
    text(rows, x, y, suspect > 0.5 ? '▬▬▬' : '▬▬', FEED_COLOURS.suspect);
  }

  // A scanline, sweeping. Cheapest possible "this is a live feed and not a picture".
  const scan = Math.floor((clock * 6) % FEED_H);
  for (let x = 0; x < FEED_W; x += 3) {
    const at = rows[scan][x];
    if (at.ch === ' ') put(rows, x, scan, '·', FEED_COLOURS.dim);
  }

  // Chrome.
  text(rows, 2, 1, `CAM ${label ?? '--'}`, FEED_COLOURS.chrome);
  if (since !== undefined) {
    const stamp = `T+${since.toFixed(0)}s`;
    text(rows, FEED_W - stamp.length - 2, 1, stamp, FEED_COLOURS.chrome);
  }
  text(rows, 2, FEED_H - 2, `${cell.x},${cell.y}`, FEED_COLOURS.dim);

  return rows;
}

/** Rows to HTML, for the DOM panels. Text only - never innerHTML from network data. */
export function feedToHtml(rows: FeedRow[]): string {
  return rows
    .map((row) => {
      let out = '';
      let run = '';
      let colour = '';
      const flush = (): void => {
        if (!run) return;
        const safe = run.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        out += `<span style="color:${colour}">${safe}</span>`;
        run = '';
      };
      for (const cell of row) {
        if (cell.colour !== colour) {
          flush();
          colour = cell.colour;
        }
        run += cell.ch;
      }
      flush();
      return out;
    })
    .join('\n');
}
