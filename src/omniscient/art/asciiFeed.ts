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
 * ## This is a 3D renderer, and the first version was not
 *
 * The first attempt PAINTED a street: buildings as stacked rectangles, the road as a
 * hand-drawn trapezoid, everything sorted by hand. It read as a skyline poster rather than
 * as a camera at head height, and no amount of tuning the trapezoid was going to fix that,
 * because the picture had no camera in it - only an artist's impression of one.
 *
 * This version casts a ray per character cell into the actual district: eye at shop-camera
 * height on the kerb, boxes from `city.blocks`, ground plane at zero. Occlusion, parallax,
 * foreshortening and the road's convergence all fall out of the arithmetic instead of being
 * drawn on, and the camera can stand anywhere and look any way without a new special case.
 *
 * A raycast rather than a rasteriser, which is the unusual choice and the right one at this
 * resolution: 88x26 is 2288 rays against a few dozen culled boxes, which is nothing, and in
 * exchange every hard part of a rasteriser - near-plane clipping, depth buffers, which face
 * am I on, where on the wall am I - is either free or a subtraction.
 *
 * ## Why this file imports no engine
 *
 * Arithmetic on a district, returning rows of coloured cells. No THREE, no engine, no DOM -
 * so the harness can drive it headlessly and assert things about what the player will
 * actually see. The same discipline as m4ss/swingShape.ts, for the same reason: a claim
 * about a picture deserves a measurement, not a squint at a screenshot.
 *
 * ## The rule that outranks every other decision here
 *
 * THE FEED MUST NOT SHOW THE CAR BEFORE THE PLAYER COMMITS. Mission 08 is won by narrowing
 * rather than searching; a live thumbnail with the suspect in it would collapse the entire
 * deduction into "pick the one with the car". `renderFeed` therefore takes an explicit
 * `suspect` argument that the pre-commit caller passes as null, and there is no other route
 * by which a car can enter the picture.
 */

import { CELL } from '../geometry/wireCity.js';

import type { Block, WireCity } from '../geometry/wireCity.js';

/** One character and the colour it is drawn in. */
export interface FeedCell {
  ch: string;
  colour: string;
}

export type FeedRow = FeedCell[];

/**
 * The feed's palette. Console greens only.
 *
 * Depth is carried by COLOUR and detail by CHARACTER, which is the split that keeps a
 * one-hue picture legible: a near wall and a far wall can be the same density of glyph and
 * still sit at different distances, because the far one is drawn in a green closer to the
 * background.
 */
export const FEED_COLOURS = {
  /** Structure, far. Barely above the background - mass without detail. */
  far: '#16281d',
  /** Structure, mid. */
  near: '#24462f',
  /** Structure, near. The wall you could touch. */
  close: '#31603f',
  /** The lit edge of a block, so a silhouette has a top. */
  edge: '#2b5c39',
  /** Ordinary windows. */
  window: '#3f6b4a',
  /** The few windows that are properly lit. */
  windowLit: '#5f9c6c',
  road: '#1b241e',
  /** Kerbs and lane markings - the geometry that says "this is a street". */
  marking: '#5c9068',
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

/**
 * Density ramp, sparse to solid.
 *
 * Sparse-first matters more than the exact glyphs: a surface turned away from the camera
 * has to thin towards nothing rather than switch to a different character of the same
 * weight, or the shading reads as pattern instead of as light.
 */
const RAMP = ' .:-=+*#%@';

/**
 * How lit each wall orientation is, indexed by the face the slab test reports.
 *
 * A single low sun somewhere off to one side. Four constants rather than a light vector
 * because there are only ever four wall orientations in a grid city, and the only thing the
 * shading has to achieve is that two walls meeting at a corner are different tones.
 *
 * The SPREAD between them is what is being tuned, not the average. Halving these to quieten
 * a wall that was shouting also collapsed the range: at a peak of 0.3 the four orientations
 * landed on two adjacent ramp steps, so every building in the district was one of two flat
 * tones and a corner stopped reading as a corner. The wall was never the problem - the
 * problem was lit windows the size of a third of the frame, which is fixed where they are
 * drawn. These are back up, with a wide gap between the key faces and the shaded ones.
 */
const KEY = [0.58, 0.26, 0.43, 0.17, 0.62, 0.62];

/**
 * Eye height and tilt.
 *
 * Raised from 3.4m and tilted harder after seeing it in the console. At head height on a
 * three-metre street the flanking walls fill the frame edge to edge - there is no sky, no
 * horizon, and nothing but wall to orient on, so the picture reads as texture rather than
 * as a place. A junction camera is mounted above the lights and angled down at the road,
 * which puts the carriageway in the middle of the shot where the thing being watched
 * actually is, and lets the walls fall away to the sides.
 */
const EYE = 4.8;
const PITCH = -0.27;
/** Past this the district is fog and the renderer stops paying for it. */
const FAR = 150;
/**
 * Where the fog finishes the job.
 *
 * Separate from FAR, and shorter, because the two do different work: FAR is a budget and
 * this is composition. Shading that only reached zero at the cull distance meant the far
 * end of every street was a full field of dim glyphs out to the top of the frame - the
 * whole picture covered, with no dark to read the near structure against. Surfaces now fade
 * to nothing well inside the district, so distance ends in darkness.
 */
const FADE = 85;

export interface FeedOptions {
  /** Seconds. Drives traffic, window flicker and the scanline. */
  clock: number;
  /**
   * The suspect's position across the frame, 0 to 1, or null for "not in this shot".
   *
   * Read the file header before passing anything but null from a new caller.
   */
  suspect?: number | null;
  /** Camera id for the header strip. */
  label?: string;
  /** Seconds since the last confirmed sighting, drawn in the header strip. */
  since?: number;
  /** No coverage here - draw the dead-channel state instead of a street. */
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
 * same camera therefore always shows the same view. Two cardinal facings to choose from,
 * because the roads are a grid and a camera on a pole looks along one of them.
 *
 * It always looks INWARDS, and that is not a nicety. A free choice of four sent cameras
 * near the district edge staring out of it: two cells of street, then the wall of the last
 * building filling a third of the frame and open nothing beyond. Half the chase happens out
 * where coverage thins - that is the whole design of phase three - so the cameras most
 * likely to be pointed at emptiness are exactly the ones the player spends longest looking
 * at. Facing the middle guarantees every one of them has a street to look down.
 *
 * The hash still chooses WHICH axis, so the views stay varied and each camera still always
 * shows the same one.
 */
export function facingOf(cell: { x: number; y: number }, size: number): { fx: number; fy: number } {
  const middle = (size - 1) / 2;
  const dx = middle - cell.x;
  const dz = middle - cell.y;
  // A camera already on the centre line has no inward direction on that axis, so it takes
  // the other one rather than picking a sign at random.
  let useX = hash(cell.x, cell.y, 11) > 0.5;
  if (Math.abs(useX ? dx : dz) < 1) useX = !useX;
  if (useX) return { fx: dx >= 0 ? 1 : -1, fy: 0 };
  return { fx: 0, fy: dz >= 0 ? 1 : -1 };
}

/** Grid cell to metres. The same conversion wireCity uses, so both draw one district. */
function metres(size: number, x: number, y: number): { wx: number; wz: number } {
  const half = (size * CELL) / 2;
  return { wx: x * CELL - half + CELL / 2, wz: y * CELL - half + CELL / 2 };
}

interface Box {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  top: number;
  block: Block;
}

/**
 * The boxes worth casting against.
 *
 * Everything behind the camera or beyond the fog is dropped before a single ray is fired,
 * which turns a district of a few hundred blocks into a few dozen and is the whole reason a
 * per-cell raycast is affordable here.
 */
function culled(city: WireCity, eyeX: number, eyeZ: number, fx: number, fz: number): Box[] {
  const out: Box[] = [];
  for (const block of city.blocks) {
    const { wx, wz } = metres(city.size, block.x, block.y);
    const dx = wx - eyeX;
    const dz = wz - eyeZ;
    // Behind the camera, with a cell of slack so a block level with the lens still draws
    // the sliver of wall that would genuinely be in shot.
    if (dx * fx + dz * fz < -CELL) continue;
    if (Math.hypot(dx, dz) > FAR) continue;
    out.push({
      x0: wx - block.w / 2,
      x1: wx + block.w / 2,
      z0: wz - block.d / 2,
      z1: wz + block.d / 2,
      top: block.height,
      block,
    });
  }
  return out;
}

interface Hit {
  t: number;
  /** 0/1 a wall square to x, 2/3 a wall square to z, 4 the roof. */
  face: number;
  box: Box;
}

/**
 * Nearest box along a ray, by slab test.
 *
 * Returns which face was struck as well as the distance, because the face decides how
 * bright the surface is and which way its window grid runs - and the slab test knows it for
 * free, having just worked out which slab was the last one entered.
 */
function castBoxes(
  boxes: Box[],
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  limit: number
): Hit | null {
  let best: Hit | null = null;
  for (const box of boxes) {
    let near = 0.05;
    let far = best ? best.t : limit;
    let face = 4;
    let miss = false;

    if (Math.abs(dx) < 1e-6) {
      if (ox < box.x0 || ox > box.x1) continue;
    } else {
      let t0 = (box.x0 - ox) / dx;
      let t1 = (box.x1 - ox) / dx;
      const low = t0 < t1;
      if (!low) {
        const swap = t0;
        t0 = t1;
        t1 = swap;
      }
      if (t0 > near) {
        near = t0;
        face = low ? 0 : 1;
      }
      if (t1 < far) far = t1;
      if (near > far) continue;
    }

    if (Math.abs(dy) < 1e-6) {
      if (oy < 0 || oy > box.top) continue;
    } else {
      let t0 = (0 - oy) / dy;
      let t1 = (box.top - oy) / dy;
      const roofFirst = t1 < t0;
      if (roofFirst) {
        const swap = t0;
        t0 = t1;
        t1 = swap;
      }
      if (t0 > near) {
        near = t0;
        face = roofFirst ? 4 : 5;
      }
      if (t1 < far) far = t1;
      if (near > far) continue;
    }

    if (Math.abs(dz) < 1e-6) {
      if (oz < box.z0 || oz > box.z1) miss = true;
    } else {
      let t0 = (box.z0 - oz) / dz;
      let t1 = (box.z1 - oz) / dz;
      const low = t0 < t1;
      if (!low) {
        const swap = t0;
        t0 = t1;
        t1 = swap;
      }
      if (t0 > near) {
        near = t0;
        face = low ? 2 : 3;
      }
      if (t1 < far) far = t1;
      if (near > far) miss = true;
    }
    if (miss) continue;

    if (near > 0.05 && (!best || near < best.t)) best = { t: near, face, box };
  }
  return best;
}

/** Distance to a colour band. Depth is carried by hue, detail by glyph. */
function depthColour(t: number): string {
  if (t < 22) return FEED_COLOURS.close;
  if (t < 55) return FEED_COLOURS.near;
  return FEED_COLOURS.far;
}

function ramp(level: number): string {
  const i = Math.max(0, Math.min(RAMP.length - 1, Math.round(level * (RAMP.length - 1))));
  return RAMP[i];
}

/**
 * The ground, where a ray misses everything and drops below the horizon.
 *
 * The markings are derived from the SAME grid the buildings stand on rather than drawn as a
 * converging trapezoid: a point is carriageway when it falls in the gap between footprints,
 * and a lane marking when it is near the line running down the middle of that gap. Doing it
 * in world space is what makes the markings converge correctly at any camera angle, and it
 * is also less code than faking it was.
 */
function ground(
  city: WireCity,
  wx: number,
  wz: number,
  t: number,
  clock: number,
  facing: { fx: number; fy: number }
): { ch: string; colour: string } {
  const half = (city.size * CELL) / 2;
  // Position within this cell, 0..1 on each axis. The street is the outer margin.
  const u = ((((wx + half) / CELL) % 1) + 1) % 1;
  const v = ((((wz + half) / CELL) % 1) + 1) % 1;

  /*
   * Markings belong to the street the camera is looking DOWN, not to both axes.
   *
   * Testing each axis independently painted the entire grid, cross-streets included - and a
   * kerb running left to right across the shot lands on one row of the frame as a bar of
   * pipes the full width of the picture. Three of those were on screen at once and the
   * street read as a ladder. Only the perpendicular offset decides a kerb now, and only the
   * along-street distance advances the centre line.
   */
  const across = facing.fx !== 0 ? v : u;
  const along = facing.fx !== 0 ? wx : wz;
  const edge = Math.min(across, 1 - across);
  const kerb = 0.16;

  if (edge < 0.03 && t < 70) {
    // Dashed, and the dashes walk towards the camera so the surface reads as moving past.
    if (Math.floor(along * 0.45 - clock * 2.5) % 2 === 0) {
      return { ch: '─', colour: FEED_COLOURS.marking };
    }
  }
  if (Math.abs(edge - kerb) < 0.022 && t < 90) return { ch: '│', colour: FEED_COLOURS.marking };

  // Tarmac. Grain that thins with distance, so the near road is a surface and the far road
  // a suggestion - and never dense enough to compete with the markings.
  const grain = hash(Math.round(wx * 2), Math.round(wz * 2), 3);
  const density = t < 18 ? 0.3 : t < 45 ? 0.16 : 0.06;
  if (grain < density) return { ch: ramp(0.12 + grain), colour: FEED_COLOURS.road };
  return { ch: ' ', colour: FEED_COLOURS.road };
}

interface Basis {
  eyeX: number;
  eyeZ: number;
  facing: { fx: number; fy: number };
  fwd: { x: number; y: number; z: number };
  right: { x: number; y: number; z: number };
  up: { x: number; y: number; z: number };
  fx: number;
  fy: number;
  boxes: Box[];
}

/**
 * A car, placed in world metres and projected through the same camera as the district.
 *
 * Projected rather than plotted in screen space, so it shrinks correctly with distance, sits
 * on the road at any camera angle, and - the part that matters - is HIDDEN when a building
 * is between it and the lens. A car that shone through a wall would tell the player the
 * machine can see round corners, which is the one thing this mission is about not being able
 * to do.
 */
function drawCar(
  rows: FeedRow[],
  b: Basis,
  along: number,
  lane: number,
  colour: string,
  wide = false
): void {
  const wx = b.eyeX + b.facing.fx * along - b.facing.fy * lane;
  const wz = b.eyeZ + b.facing.fy * along + b.facing.fx * lane;

  const rx = wx - b.eyeX;
  const ry = 0.7 - EYE;
  const rz = wz - b.eyeZ;
  const z = rx * b.fwd.x + ry * b.fwd.y + rz * b.fwd.z;
  if (z < 1.5) return;

  const dist = Math.hypot(rx, ry, rz);
  const blocked = castBoxes(b.boxes, b.eyeX, EYE, b.eyeZ, rx / dist, ry / dist, rz / dist, dist);
  if (blocked) return;

  const sx = rx * b.right.x + ry * b.right.y + rz * b.right.z;
  const sy = rx * b.up.x + ry * b.up.y + rz * b.up.z;
  const px = Math.round(FEED_W / 2 + (sx / z) * b.fx - 0.5);
  const py = Math.round(FEED_H / 2 - (sy / z) * b.fy - 0.5);

  // Width in characters from the real width of a car, so it grows as it arrives.
  const cells = Math.max(1, Math.min(14, Math.round(((wide ? 2.6 : 1.9) / z) * b.fx)));
  for (let i = 0; i < cells; i++) put(rows, px - Math.floor(cells / 2) + i, py, '▬', colour);
}

/**
 * Render one camera's view.
 *
 * `suspect` defaults to absent, which is the safe default in the sense that matters: a
 * caller that forgets it cannot leak the answer - see the file header.
 */
export function renderFeed(
  city: WireCity,
  cell: { x: number; y: number },
  options: FeedOptions
): FeedRow[] {
  const rows = blank();
  const { clock, suspect = null, label, since, dead = false } = options;

  if (dead) {
    for (let y = 0; y < FEED_H; y++) {
      for (let x = 0; x < FEED_W; x++) {
        if (hash(x, y, Math.floor(clock * 8)) > 0.986) put(rows, x, y, '·', FEED_COLOURS.dim);
      }
    }
    text(rows, Math.floor(FEED_W / 2) - 4, Math.floor(FEED_H / 2), 'NO SIGNAL', FEED_COLOURS.dim);
    const id = label ?? 'CAM --';
    text(rows, FEED_W - id.length - 2, 1, id, FEED_COLOURS.dim);
    return rows;
  }

  /*
   * The camera, at the JUNCTION - the corner of the cell, where two roads cross.
   *
   * A cell's centre is where its BUILDING is, so an eye there is inside a wall. The first
   * fix stepped half a cell sideways, which put it in the carriageway and produced a
   * picture of two walls: this district's footprints are 0.5-0.72 of an 8m cell, so its
   * streets are about three metres wide and standing in one is standing in an alley.
   *
   * The corner is where a camera goes anyway - "cameras on junctions" is what the generator
   * says - and it is also the only place with any air in it. Four blocks corner onto the
   * point, so the two cross-streets open a gap in each wall, and looking along the road
   * gives a corridor punched with those gaps marching away to the vanishing point. That
   * repetition is what sells the depth; a smooth wall has nothing to measure distance by.
   */
  const facing = facingOf(cell, city.size);
  const { wx, wz } = metres(city.size, cell.x, cell.y);
  const eyeX = wx + CELL * 0.5;
  const eyeZ = wz + CELL * 0.5;

  const cosP = Math.cos(PITCH);
  const sinP = Math.sin(PITCH);
  const fwd = { x: facing.fx * cosP, y: sinP, z: facing.fy * cosP };
  const right = { x: -facing.fy, y: 0, z: facing.fx };
  const up = { x: -facing.fx * sinP, y: cosP, z: -facing.fy * sinP };

  /*
   * Focal lengths in character cells, and they are not equal.
   *
   * A monospace cell is about twice as tall as it is wide, so an unadjusted projection
   * stretches the picture vertically by two and every building comes out a chimney whatever
   * its real proportions. Halving the vertical focal length is that correction.
   *
   * The horizontal angle is about fifty degrees rather than a wide seventy. Wide put most
   * of the frame on the two walls immediately beside the lens and left the street itself a
   * slot up the middle - and the street is the only part of this picture anything happens
   * in. Longer glass trades the near walls for depth down the road, which is the trade a
   * camera watching traffic would actually be set up to make.
   */
  const fx = FEED_W / 2 / Math.tan(0.44);
  const fy = fx * 0.5;

  const boxes = culled(city, eyeX, eyeZ, fwd.x, fwd.z);
  const basis: Basis = { eyeX, eyeZ, facing, fwd, right, up, fx, fy, boxes };

  for (let py = 0; py < FEED_H; py++) {
    for (let px = 0; px < FEED_W; px++) {
      const sx = (px - FEED_W / 2 + 0.5) / fx;
      const sy = (FEED_H / 2 - py - 0.5) / fy;
      let dx = fwd.x + right.x * sx + up.x * sy;
      let dy = fwd.y + right.y * sx + up.y * sy;
      let dz = fwd.z + right.z * sx + up.z * sy;
      const len = Math.hypot(dx, dy, dz);
      dx /= len;
      dy /= len;
      dz /= len;

      const hit = castBoxes(boxes, eyeX, EYE, eyeZ, dx, dy, dz, FAR);
      const groundT = dy < -1e-6 ? -EYE / dy : Infinity;

      if (hit && hit.t <= groundT) {
        const { t, face, box } = hit;
        const hx = eyeX + dx * t;
        const hy = EYE + dy * t;
        const hz = eyeZ + dz * t;

        if (face === 4) {
          // The roof, which at this eye height is only ever the top edge of a near block -
          // and a hard top edge is what gives a silhouette its shoulder.
          put(rows, px, py, '─', FEED_COLOURS.edge);
          continue;
        }

        /*
         * Windows, placed on the actual wall.
         *
         * From the hit's position on the face, so they hold still as the district moves and
         * stay square as the wall recedes - which a screen-space pattern cannot do, and
         * which is most of what separates a building from a hatched rectangle.
         */
        /*
         * Windows exist in a BAND of distance, and nowhere else.
         *
         * A window is 2.2m by 2.6m. At eight metres through this lens that is twenty-six
         * columns across, so one lit window became a bright block a third of the frame wide
         * and a near building came out as a barcode. Past eighty metres the same window is
         * under two rows tall and the grid samples faster than it can be drawn, which is
         * moire. Between those the grid is worth having and outside them the wall is a
         * plain graded surface - which is also just true: standing under a building you see
         * wall, not a facade.
         */
        const rowsPerFloor = (2.6 / t) * fy;
        const gridded = rowsPerFloor > 1.5 && rowsPerFloor < 7;

        const along = face < 2 ? hz : hx;
        const gw = Math.floor(along / 2.2);
        const gh = Math.floor(hy / 2.6);
        const lit = hash(gw, gh, box.block.x * 7 + box.block.y) > 0.81 - box.block.downtown * 0.22;
        const paneU = ((((along / 2.2) % 1) + 1) % 1);
        const paneV = ((((hy / 2.6) % 1) + 1) % 1);
        const inPane = paneU > 0.26 && paneU < 0.94 && paneV > 0.28 && paneV < 0.92;
        /*
         * A pane has a frame and a core, and only the core is bright.
         *
         * Filling the whole pane with the lit colour is perspective-correct and reads
         * terribly: a window two metres across at eight metres covers a dozen character
         * cells, so the near walls came out as slabs of the brightest green on screen with
         * the street a dark slot between them. Bright at the middle and stepped down at the
         * edges keeps the recession honest - near windows are large and framed, far ones
         * collapse to a single pip - without any one of them shouting.
         */
        const core = paneU > 0.42 && paneU < 0.78 && paneV > 0.42 && paneV < 0.8;
        /*
         * The joints between bays and between storeys.
         *
         * On a wall too close for windows this is all the detail there is, and it is enough:
         * a building a few metres away shows you its mullions and its floor lines, not a
         * facade. Filled panes at that range are a third of the frame each - the slab of
         * bright glyphs down one side that this whole band exists to prevent - but the
         * LINES between them stay one character wide however close they get, so the wall
         * keeps its scale instead of going flat.
         */
        const joint = paneU < 0.05 || paneU > 0.95 || paneV < 0.06 || paneV > 0.94;

        if (gridded && lit && inPane) {
          // A few flicker, on their own slow clocks. Nothing in a city is static.
          const flicker = hash(gw, gh, Math.floor(clock * 0.7)) > 0.9;
          if (core && !flicker) put(rows, px, py, '■', FEED_COLOURS.windowLit);
          else put(rows, px, py, flicker ? ':' : '▪', FEED_COLOURS.window);
          continue;
        }

        /*
         * Plain wall, lit by face rather than by viewing angle.
         *
         * Shading on how square-on the ray was is what a raytracer does to a mirror, and on
         * a street it is exactly wrong: the wall running along beside the camera is met
         * nearly head-on at the edges of frame, so it came out as the brightest thing in
         * the shot - a solid slab of glyphs down both sides with the street a slot between
         * them. A fixed key direction instead gives the four wall orientations four
         * constant tones, so a corner reads as a corner and distance is the only other
         * thing changing.
         *
         * And it wears the window grid whether the windows are lit or not. Only lit panes
         * had any structure before, so an unlit building was a flat field of one character
         * and mid-distance collapsed into forty columns of identical dots with nothing to
         * read scale or depth against. A lattice on EVERY wall gives each one storeys and
         * bays, and because it is placed from the hit position it converges with the wall -
         * so it doubles as the perspective cue a smooth surface cannot provide.
         */
        const fog = Math.max(0, 1 - t / FADE);
        const detail = gridded
          ? // In the band: panes and the wall between them.
            inPane
            ? 1.3
            : 0.65
          : rowsPerFloor >= 7
            ? // Too close for panes: a dark wall carrying its joints.
              joint
              ? 1.15
              : 0.26
            : // Too far for either: let it simply fade.
              1;
        put(rows, px, py, ramp(KEY[face] * detail * Math.pow(fog, 1.4)), depthColour(t));
        continue;
      }

      if (groundT < FAR) {
        const g = ground(city, eyeX + dx * groundT, eyeZ + dz * groundT, groundT, clock, facing);
        put(rows, px, py, g.ch, g.colour);
        continue;
      }

      // Sky. Empty, but for the few marks that stop it reading as a dead panel.
      if (hash(px, py, 9) > 0.993) put(rows, px, py, '·', FEED_COLOURS.dim);
    }
  }

  /*
   * Ambient traffic. Two cars on loops of different length so the street is never empty and
   * never metronomic - the point is that an ordinary road looks busy, which is exactly what
   * makes the suspect's absence readable when a wrong camera is chosen.
   */
  for (let i = 0; i < 2; i++) {
    const period = 11 + i * 6;
    const phase = ((clock + i * 5.1) % period) / period;
    const along = (i === 0 ? phase : 1 - phase) * 80 + 7;
    drawCar(rows, basis, along, i === 0 ? 1.1 : -1.1, FEED_COLOURS.traffic);
  }

  /*
   * The suspect, when the caller has earned the right to show it. Same projection, brighter
   * colour, wider mark - the point of the moment is that you know it the instant it enters
   * frame. It drives towards the camera, so `suspect` runs 0 far to 1 near.
   *
   * Lane offsets are about a metre, not two. This district's streets are three metres wide
   * - see the camera placement above - so a car on a two metre offset is driving through
   * the shopfronts, and at the near end of the run it swung right out of the corridor and
   * across the pavement.
   */
  if (suspect !== null) {
    drawCar(rows, basis, 70 - suspect * 57, -1.1, FEED_COLOURS.suspect, true);
  }

  // A scanline, sweeping. Cheapest possible "this is a live feed and not a picture".
  const scan = Math.floor((clock * 6) % FEED_H);
  for (let x = 0; x < FEED_W; x += 3) {
    if (rows[scan][x].ch === ' ') put(rows, x, scan, '·', FEED_COLOURS.dim);
  }

  /*
   * Chrome, stacked on the RIGHT.
   *
   * The camera id sat at top left, which is exactly where the Contact View keeps its
   * connection and trust cards - and those are bevelled panels that paint over the feed, so
   * the one piece of text saying which camera this is was behind them. The right edge of
   * the stage is clear.
   *
   * The label is drawn verbatim: it arrives as "CAM 203", and a `CAM ` prefix here put
   * "CAM CAM 203" on screen.
   */
  const id = label ?? 'CAM --';
  text(rows, FEED_W - id.length - 2, 1, id, FEED_COLOURS.chrome);
  if (since !== undefined) {
    const stamp = `T+${since.toFixed(0)}s`;
    text(rows, FEED_W - stamp.length - 2, 2, stamp, FEED_COLOURS.chrome);
  }
  // Labelled, because two bare numbers in the corner of a screen read as debug output.
  text(rows, 2, FEED_H - 2, `GRID ${String(cell.x)},${String(cell.y)}`, FEED_COLOURS.dim);

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
