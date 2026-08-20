/**
 * The creature's shape while it is on a rope: a teardrop pointing where it will leave.
 *
 * ## Why this is a module and not four lines in the rig
 *
 * It is pure arithmetic on a list of points, and the rig cannot be loaded outside the engine -
 * so anything living there can only ever be judged by looking at a screenshot. This can be
 * driven from the harness instead, which matters more than usual here: the whole feature is a
 * claim about a SHAPE, and "is it actually narrower at the front than the back" is a question
 * with a numeric answer that no amount of squinting at a capture settles.
 *
 * ## What it is for
 *
 * "Which way will I go when I release?" is the one question a player cannot answer during a
 * 360, and the honest place to answer it is the creature rather than a piece of UI. A blob
 * held on a rope at nine radians a second is not a ball: it is dragged into a teardrop with
 * the blunt end trailing and the point leading, and that point is exactly the direction it
 * will leave in. So the shape IS the indicator. It costs no screen furniture, needs no
 * explaining, and scales honestly - a lazy swing stays round, and only a committed one turns
 * into a comet.
 *
 * Applied to the DRAWN points and never to the simulation. The physics of the swing were
 * measured and retuned over several passes; none of it should move because the creature is
 * being drawn more expressively.
 */

/** How far it stretches along the arc at full drive, as a fraction of its own length. */
export const SWING_STRETCH = 0.55;
/** How much it narrows across the arc at full drive. The volume has to go somewhere. */
export const SWING_PINCH = 0.3;
/**
 * How much the LEADING half narrows again on top of that.
 *
 * This term is the whole difference between a sausage and a drop. Stretching and pinching
 * alone give a symmetrical ellipse, which points both ways at once - worse than not pointing
 * at all, because it looks like information and is not.
 */
export const SWING_TAPER = 0.42;

export interface ShapePoint {
  x: number;
  y: number;
}

/**
 * Pull `points` into a teardrop along (vx, vy). Mutates in place.
 *
 * `drive` is 0 to 1: how hard the swing is going, measured elsewhere against what the swing
 * is allowed to reach, so that a full comet means a full-energy revolution on any rope in the
 * game rather than one particular speed.
 */
export function teardrop(points: ShapePoint[], vx: number, vy: number, drive: number): void {
  const speed = Math.hypot(vx, vy);
  if (points.length < 2 || speed < 1 || drive <= 0) return;

  // Along the direction of travel, and across it.
  const ux = vx / speed;
  const uy = vy / speed;
  const nx = -uy;
  const ny = ux;

  let cx = 0;
  let cy = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
  }
  cx /= points.length;
  cy /= points.length;

  // The half-length along the arc, so the taper can be a fraction of the body's own reach
  // rather than a number of pixels that would mean different things at different masses.
  let reach = 1;
  for (const p of points) {
    reach = Math.max(reach, Math.abs((p.x - cx) * ux + (p.y - cy) * uy));
  }

  const k = Math.min(1, Math.max(0, drive));
  for (const p of points) {
    const rx = p.x - cx;
    const ry = p.y - cy;
    const along = rx * ux + ry * uy;
    const across = rx * nx + ry * ny;
    const lead = Math.max(0, along) / reach;
    const outAlong = along * (1 + SWING_STRETCH * k);
    const outAcross = across * (1 - SWING_PINCH * k) * (1 - SWING_TAPER * k * lead);
    p.x = cx + ux * outAlong + nx * outAcross;
    p.y = cy + uy * outAlong + ny * outAcross;
  }
}
