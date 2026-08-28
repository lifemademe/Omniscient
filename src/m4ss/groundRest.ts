import type { Particle, World } from './mass.js';

/** Floor contacts support a centroid, not a percentage of an entire soft body. */
export function floorSupported(body: Particle[], world: World): boolean {
  if (body.length === 0) return false;
  const cx = body.reduce((sum, p) => sum + p.x, 0) / body.length;
  const contacts = body.filter(p => p.grounded && world.tiles.some(tile =>
    Math.abs(p.y - tile.y) < 0.5 && p.x > tile.x + 1 && p.x < tile.x + tile.w - 1));
  if (contacts.length < Math.max(2, Math.ceil(body.length * 0.08))) return false;
  // A centroid beyond the actual support span must still tip/fall off a ledge.
  return cx >= Math.min(...contacts.map(p => p.x)) && cx <= Math.max(...contacts.map(p => p.x));
}

/** Remove only grounded translation; leave relative particle motion and gravity alone. */
export function settleGround(
  body: Particle[], beforeX: number, dt: number,
  obstructed: (p: Particle) => boolean
): void {
  const cx = body.reduce((sum, p) => sum + p.x, 0) / body.length;
  const vx = body.reduce((sum, p) => sum + p.x - p.px, 0) / body.length;
  const keep = Math.exp(-32 * dt);
  // Cancel the solver's residual centre drift as well as stored Verlet velocity.
  const travel = cx - beforeX;
  const settledTravel = Math.abs(travel / dt) < 3 ? 0 : travel * keep;
  const shift = settledTravel - travel;
  const settledVelocity = Math.abs(vx / dt) < 3 ? 0 : vx * keep;
  // Never slide a resting body into a wall to correct a solver bias.
  if (body.some(p => obstructed({ ...p, x: p.x + shift }))) return;
  for (const p of body) {
    p.x += shift;
    p.px += shift + vx - settledVelocity;
  }
}
