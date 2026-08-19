/**
 * Turning a cloud of mass into one continuous slime.
 *
 * ## Why the prototype was wrong
 *
 * The greybox drew every particle as its own circle, which reads as a bag of marbles. The
 * particles are bookkeeping - they are how mass is conserved, split and left behind - and
 * the player should never see one. What they should see is a single wobbling surface that
 * happens to be made of that much stuff.
 *
 * So the particles become a scalar field and the field gets a contour. Each particle
 * contributes a smooth falloff, the field is sampled on a grid, and marching squares walks
 * the grid emitting the polygon of everywhere the field is above the threshold. Two blobs
 * that drift together merge into one outline on their own, with no special case for it,
 * because their fields simply add - which is exactly what slime does and exactly what a
 * pile of circles cannot do.
 *
 * ## Why marching squares and not a texture
 *
 * A metaball field rendered to a canvas and mapped onto a quad is less code and looks fine
 * head-on. It is also flat, cannot be lit, and cannot be extruded - and the reference art is
 * a side-on world with real depth in it. A contour gives actual geometry, so the slime can
 * take the scene's light, sit in front of and behind things, and carry a rim.
 *
 * The grid is the only quality dial. Finer costs squares, not triangles - the contour length
 * is what it is - so it is cheap to make this look better later.
 */

import * as THREE from 'three';

export interface FieldPoint {
  x: number;
  y: number;
}

export interface SurfaceOptions {
  /** World units per grid cell. Smaller is smoother and costs samples, not triangles. */
  cell?: number;
  /** How far one particle's influence reaches. Sets how eagerly blobs merge. */
  radius?: number;
  /** Field value the surface is drawn at. Lower fattens the slime. */
  threshold?: number;
  /** Padding around the particle bounds, so the contour has room to close. */
  pad?: number;
}

const DEFAULTS = {
  cell: 4,
  radius: 15,
  threshold: 1,
  pad: 20,
};

/**
 * The field: a sum of smooth bumps, one per particle.
 *
 * A hard falloff would make the surface boil as particles cross cell boundaries. This is the
 * usual quartic - it is 1 at the centre, 0 at the radius, and flat at both ends, so a
 * particle entering or leaving a sample's neighbourhood does so without a step.
 */
function sample(points: FieldPoint[], x: number, y: number, r2: number): number {
  let total = 0;
  for (const p of points) {
    const dx = x - p.x;
    const dy = y - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r2) continue;
    const t = 1 - d2 / r2;
    total += t * t;
  }
  return total;
}

/** Where the surface crosses between two samples, by linear interpolation. */
function cross(a: number, b: number, threshold: number): number {
  const span = b - a;
  if (Math.abs(span) < 1e-6) return 0.5;
  return Math.max(0, Math.min(1, (threshold - a) / span));
}

/**
 * Build the slime's mesh from its particles.
 *
 * Returns a flat triangulated surface in the XY plane at z = 0. Flat on purpose: the camera
 * is side-on and orthographic, so depth here would cost triangles and show nothing. Rim and
 * body are two calls at different thresholds rather than an extrusion.
 */
export function buildSurface(
  points: FieldPoint[],
  options: SurfaceOptions = {}
): THREE.BufferGeometry {
  const { cell, radius, threshold, pad } = { ...DEFAULTS, ...options };
  const geometry = new THREE.BufferGeometry();
  if (points.length === 0) {
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
    return geometry;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;

  const cols = Math.max(2, Math.ceil((maxX - minX) / cell) + 1);
  const rows = Math.max(2, Math.ceil((maxY - minY) / cell) + 1);
  const r2 = radius * radius;

  /*
   * Sample once per grid point rather than once per cell corner.
   *
   * Four cells share every interior corner, so sampling per cell does the same sum four
   * times - and the sum is over every particle, which is where all the cost is.
   */
  const field = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    const y = minY + j * cell;
    for (let i = 0; i < cols; i++) {
      field[j * cols + i] = sample(points, minX + i * cell, y, r2);
    }
  }

  const vertices: number[] = [];

  /** A convex polygon covering the inside of one cell, as a triangle fan. */
  const emit = (poly: number[][]): void => {
    for (let k = 1; k + 1 < poly.length; k++) {
      vertices.push(poly[0][0], poly[0][1], 0);
      vertices.push(poly[k][0], poly[k][1], 0);
      vertices.push(poly[k + 1][0], poly[k + 1][1], 0);
    }
  };

  for (let j = 0; j + 1 < rows; j++) {
    for (let i = 0; i + 1 < cols; i++) {
      const x0 = minX + i * cell;
      const y0 = minY + j * cell;
      const x1 = x0 + cell;
      const y1 = y0 + cell;

      // Corner values, anticlockwise from bottom-left, matching the case table below.
      const a = field[j * cols + i];
      const b = field[j * cols + i + 1];
      const c = field[(j + 1) * cols + i + 1];
      const d = field[(j + 1) * cols + i];

      const inA = a >= threshold;
      const inB = b >= threshold;
      const inC = c >= threshold;
      const inD = d >= threshold;
      const code = (inA ? 1 : 0) | (inB ? 2 : 0) | (inC ? 4 : 0) | (inD ? 8 : 0);
      if (code === 0) continue;
      if (code === 15) {
        emit([
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y1],
        ]);
        continue;
      }

      // Edge crossings, named for the edge they sit on.
      const bottom = [x0 + cross(a, b, threshold) * cell, y0];
      const right = [x1, y0 + cross(b, c, threshold) * cell];
      const top = [x0 + cross(d, c, threshold) * cell, y1];
      const left = [x0, y0 + cross(a, d, threshold) * cell];

      const A = [x0, y0];
      const B = [x1, y0];
      const C = [x1, y1];
      const D = [x0, y1];

      /*
       * The inside polygon for each case. Ambiguous cases (5 and 10 - two opposite corners
       * in) are resolved by joining them, which keeps a thin neck connected rather than
       * pinching it into two blobs at exactly the moment the player is watching it stretch.
       */
      switch (code) {
        case 1: emit([A, bottom, left]); break;
        case 2: emit([bottom, B, right]); break;
        case 3: emit([A, B, right, left]); break;
        case 4: emit([right, C, top]); break;
        case 5: emit([A, bottom, right, C, top, left]); break;
        case 6: emit([bottom, B, C, top]); break;
        case 7: emit([A, B, C, top, left]); break;
        case 8: emit([left, top, D]); break;
        case 9: emit([A, bottom, top, D]); break;
        case 10: emit([bottom, B, right, top, D, left]); break;
        case 11: emit([A, B, right, top, D]); break;
        case 12: emit([left, right, C, D]); break;
        case 13: emit([A, bottom, right, C, D]); break;
        case 14: emit([bottom, B, C, D, left]); break;
        default: break;
      }
    }
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** How many triangles a surface came out as - used by the harness to watch the cost. */
export function triangleCount(geometry: THREE.BufferGeometry): number {
  const position = geometry.getAttribute('position');
  return position ? position.count / 3 : 0;
}
