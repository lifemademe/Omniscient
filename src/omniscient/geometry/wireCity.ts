/**
 * A city as OMNISCIENT_ sees it: outlines, and nothing it has not been told.
 *
 * ## Why wireframe is the honest choice rather than the stylish one
 *
 * The other six missions look at a real place through somebody's eyes - a bench, a cellar,
 * a road at midnight. This one is the machine looking at a city directly, and the machine
 * does not have eyes. It has a road network, a camera register and a stream of vehicle
 * pings. Drawing that as buildings with brick on them would be a lie about what it knows;
 * drawing it as edges and paths is a picture of the actual data.
 *
 * That also sets up the mission's whole visual argument, which is worth stating because
 * every later decision in this file follows from it:
 *
 *   wireframe   - OMNISCIENT observing reality
 *   rendered    - OMNISCIENT talking to somebody through a device
 *   first person - OMNISCIENT inside a system that is connected to it
 *
 * ## Why it is built from lines rather than from thin boxes
 *
 * A wireframe made of shaded geometry is not a wireframe, it is a model of one - it picks
 * up lighting, it occludes, and it costs a hundred times as much for a worse read. These
 * are LineSegments with an unlit material, which is also the reason a city of this size is
 * affordable at all: the whole grid is three draw calls.
 *
 * ## The join with the puzzle
 *
 * `cellToWorld` is the only place that decides where a grid cell is. The trace device in
 * mission/traces.ts stores positions as cells and knows nothing about metres; this file
 * turns cells into metres and knows nothing about evidence. Two systems, one conversion,
 * so a car cannot be in a different place on the map than it is in the data.
 */

import * as THREE from 'three';

import { range } from '../core/rng.js';

import type { Rng } from '../core/rng.js';

/** Metres per grid cell - a city block plus its road. */
export const CELL = 8;

export interface CityOptions {
  /** Cells per side. The trace device uses the same number. */
  size: number;
  /** Fraction of blocks left empty - yards, parks, lots. */
  gaps?: number;
}

export interface WireCity {
  size: number;
  /** Building edges. The skyline. */
  towers: THREE.BufferGeometry;
  /** The road network, at ground level. */
  roads: THREE.BufferGeometry;
  /** A faint ground lattice under everything, so the plane reads as a plane. */
  lattice: THREE.BufferGeometry;
  /** Where the network has cameras, as grid cells. */
  cameras: Array<{ x: number; y: number }>;
}

/**
 * The one conversion between the puzzle's coordinates and the world's.
 *
 * Centred on the origin so the city can be orbited without the camera having to know how
 * big it is, and so `size` can change without every shot in the scene moving.
 */
export function cellToWorld(size: number, x: number, y: number, height = 0): THREE.Vector3 {
  const half = (size * CELL) / 2;
  return new THREE.Vector3(x * CELL - half + CELL / 2, height, y * CELL - half + CELL / 2);
}

/** Push one line segment, as six floats. */
function segment(out: number[], a: THREE.Vector3, b: THREE.Vector3): void {
  out.push(a.x, a.y, a.z, b.x, b.y, b.z);
}

/**
 * The twelve edges of a box.
 *
 * Written out rather than taken from EdgesGeometry because EdgesGeometry needs a real
 * BoxGeometry built and thrown away for every single building, which for a city of six
 * hundred is a lot of allocation to produce twelve lines somebody could just write down.
 */
function boxEdges(out: number[], centre: THREE.Vector3, w: number, h: number, d: number): void {
  const x0 = centre.x - w / 2;
  const x1 = centre.x + w / 2;
  const z0 = centre.z - d / 2;
  const z1 = centre.z + d / 2;
  const y0 = centre.y;
  const y1 = centre.y + h;

  const corner = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

  for (const y of [y0, y1]) {
    segment(out, corner(x0, y, z0), corner(x1, y, z0));
    segment(out, corner(x1, y, z0), corner(x1, y, z1));
    segment(out, corner(x1, y, z1), corner(x0, y, z1));
    segment(out, corner(x0, y, z1), corner(x0, y, z0));
  }
  for (const [x, z] of [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ] as const) {
    segment(out, corner(x, y0, z), corner(x, y1, z));
  }
}

function lines(points: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return geometry;
}

/**
 * Generate the district.
 *
 * Heights fall off from the centre, which is the cheapest way to get a skyline that reads
 * as a city rather than as a field of identical posts - the eye finds the middle without
 * being told where to look, and the mission can put its first camera there.
 *
 * Deterministic, from the caller's seeded rng: §123. The same district every run means a
 * bug in the puzzle is reproducible, and it means the officer's directions can refer to
 * places that are actually there.
 */
export function wireCity(rng: Rng, options: CityOptions): WireCity {
  const { size } = options;
  const gaps = options.gaps ?? 0.16;

  const towerPoints: number[] = [];
  const roadPoints: number[] = [];
  const latticePoints: number[] = [];
  const cameras: Array<{ x: number; y: number }> = [];

  const half = (size * CELL) / 2;
  const middle = (size - 1) / 2;

  // Roads: one line down every street, both ways. The network the cars actually move on.
  for (let i = 0; i < size; i++) {
    const at = i * CELL - half;
    segment(roadPoints, new THREE.Vector3(at, 0.02, -half), new THREE.Vector3(at, 0.02, half));
    segment(roadPoints, new THREE.Vector3(-half, 0.02, at), new THREE.Vector3(half, 0.02, at));
  }

  // A coarser lattice below, so the ground is a surface rather than an absence.
  for (let i = 0; i <= size; i += 4) {
    const at = i * CELL - half;
    segment(latticePoints, new THREE.Vector3(at, 0, -half), new THREE.Vector3(at, 0, half));
    segment(latticePoints, new THREE.Vector3(-half, 0, at), new THREE.Vector3(half, 0, at));
  }

  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      if (rng() < gaps) continue;

      // 1 at the middle of the district, 0 at its edge.
      const toCentre = Math.hypot(x - middle, y - middle) / middle;
      const downtown = Math.max(0, 1 - toCentre);
      const height = range(rng, 3, 7) + downtown * downtown * range(rng, 8, 34);

      // Footprint inset from the cell so there is a street between buildings.
      const w = CELL * range(rng, 0.5, 0.72);
      const d = CELL * range(rng, 0.5, 0.72);
      boxEdges(towerPoints, cellToWorld(size, x, y), w, height, d);

      /**
       * Cameras on junctions, thinning out towards the edge.
       *
       * Not scattered evenly: the mission's second phase is hopping between them and
       * losing the car where they run out, so the DISTRIBUTION is the level design. A
       * dense middle and a sparse edge means driving out of town is how you disappear,
       * which the player works out by watching it happen rather than by being told.
       */
      if (rng() < 0.05 + downtown * 0.16) cameras.push({ x, y });
    }
  }

  return {
    size,
    towers: lines(towerPoints),
    roads: lines(roadPoints),
    lattice: lines(latticePoints),
    cameras,
  };
}
