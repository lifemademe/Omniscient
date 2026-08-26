import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { WAREHOUSE_LAYOUT } from './WarehouseLayout.js';

/**
 * The yard outside the building, which did not exist.
 *
 * The exterior was two objects: a 104 by 116 metre ground plane at #1c2929 and a box around
 * it at #1b2733. Both flat, both nearly black, both featureless.
 *
 * That would be defensible for scenery nobody looks at, and it is the opposite of that. THREE
 * OF THE FOUR camera feeds the player cycles with C point outward at a service door, and the
 * opening sweep is those three feeds in order - so the first thing anybody sees of this
 * mission is a door standing on an empty plane in front of an empty wall. The interior has
 * had four passes; the half of the mission the story is told through had none.
 *
 * What goes in is what a service yard has and what the shot needs, which turn out to be the
 * same list: a lit apron so the door is standing ON something, a kerb and a road edge to give
 * the ground a horizon line, a perimeter fence so the background has depth instead of being a
 * void, lamp columns to explain the light, and enough working clutter that the place reads as
 * used. Everything merges by material - the whole yard is nine draw calls.
 */

const CONCRETE = new THREE.MeshStandardMaterial({ color: '#83837c', roughness: 0.94, metalness: 0.03 });
const KERB = new THREE.MeshStandardMaterial({ color: '#8a8a82', roughness: 0.9, metalness: 0.03 });
const TARMAC = new THREE.MeshStandardMaterial({ color: '#2f3337', roughness: 0.86, metalness: 0.05 });
const PAINT = new THREE.MeshStandardMaterial({ color: '#c8a13c', roughness: 0.72, metalness: 0.02 });
const STEEL = new THREE.MeshStandardMaterial({ color: '#3f5468', roughness: 0.62, metalness: 0.5 });
const DARK = new THREE.MeshStandardMaterial({ color: '#1b2430', roughness: 0.78, metalness: 0.32 });
const TIMBER = new THREE.MeshStandardMaterial({ color: '#6f5530', roughness: 0.95, metalness: 0.01 });
const SKIP = new THREE.MeshStandardMaterial({ color: '#7a5323', roughness: 0.86, metalness: 0.14 });
const LENS = new THREE.MeshStandardMaterial({
  color: '#e8c98d', emissive: '#f0b463', emissiveIntensity: 2.6, roughness: 0.3,
});

/** Ground level outside the slab. The building sits 28cm proud of its own yard. */
const YARD_Y = -0.28;

function box(
  bucket: THREE.BufferGeometry[],
  width: number, height: number, depth: number,
  x: number, y: number, z: number,
  turn = 0
): void {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  if (turn) geometry.rotateY(turn);
  geometry.translate(x, y, z);
  bucket.push(geometry);
}

function merged(name: string, pieces: THREE.BufferGeometry[], material: THREE.Material): ENGINE.MeshNode {
  return ENGINE.MeshNode.create({
    name,
    geometry: mergeGeometries(pieces, false) ?? new THREE.BoxGeometry(0.1, 0.1, 0.1),
    material,
    castShadow: true,
    receiveShadow: true,
  });
}

/** Where the three service doors stand, and which way is "away from the building". */
const DOORS = [
  { x: -WAREHOUSE_LAYOUT.shell.wallX, z: WAREHOUSE_LAYOUT.service.sideZ, out: new THREE.Vector2(-1, 0) },
  { x: 0, z: WAREHOUSE_LAYOUT.shell.frontZ, out: new THREE.Vector2(0, 1) },
  { x: WAREHOUSE_LAYOUT.shell.wallX, z: WAREHOUSE_LAYOUT.service.sideZ, out: new THREE.Vector2(1, 0) },
] as const;

export class WarehouseYard {
  public readonly root = ENGINE.SceneNode.create({ name: 'WarehouseYard' });

  public build(): void {
    const concrete: THREE.BufferGeometry[] = [];
    const kerb: THREE.BufferGeometry[] = [];
    const tarmac: THREE.BufferGeometry[] = [];
    const paint: THREE.BufferGeometry[] = [];
    const steel: THREE.BufferGeometry[] = [];
    const dark: THREE.BufferGeometry[] = [];
    const timber: THREE.BufferGeometry[] = [];
    const skip: THREE.BufferGeometry[] = [];
    const lens: THREE.BufferGeometry[] = [];

    /*
     * An apron at each door, and it is the single most useful object out here.
     *
     * A door camera frames its door against the ground immediately below it. With nothing
     * there the door hangs over a flat void and the shot has no floor; with a lit slab under
     * it the door is standing somewhere. Raised a centimetre so its edge catches the yard
     * lamp and draws a line, rather than being a colour change with no form.
     */
    for (const door of DOORS) {
      const alongX = door.out.y !== 0;
      const width = alongX ? 15 : 10;
      const depth = alongX ? 10 : 15;
      const cx = door.x + door.out.x * 5.4;
      const cz = door.z + door.out.y * 5.4;
      box(concrete, width, 0.12, depth, cx, YARD_Y + 0.06, cz);

      // Kerb along the outer edge of the apron, with the road beyond it.
      const kx = door.x + door.out.x * 10.6;
      const kz = door.z + door.out.y * 10.6;
      box(kerb, alongX ? 15 : 0.32, 0.26, alongX ? 0.32 : 15, kx, YARD_Y + 0.13, kz);
      box(tarmac, alongX ? 15 : 7, 0.08, alongX ? 7 : 15,
        door.x + door.out.x * 14.6, YARD_Y + 0.04, door.z + door.out.y * 14.6);
      // The road's centre line, dashed, because a solid one reads as a runway.
      for (let i = -3; i <= 3; i++) {
        box(paint, alongX ? 1.5 : 0.14, 0.02, alongX ? 0.14 : 1.5,
          door.x + door.out.x * 14.6 + (alongX ? i * 2.2 : 0), YARD_Y + 0.09,
          door.z + door.out.y * 14.6 + (alongX ? 0 : i * 2.2));
      }
      // A hatched keep-clear box on the apron, directly off the door.
      for (let i = 0; i < 5; i++) {
        const t = -3.2 + i * 1.6;
        box(paint, alongX ? 3.4 : 0.12, 0.02, alongX ? 0.12 : 3.4,
          cx + (alongX ? 0 : t), YARD_Y + 0.13, cz + (alongX ? t : 0));
      }
    }

    /*
     * A perimeter fence, which is what stops the background being a void.
     *
     * The yard reads as outdoors only if something in the distance terminates it. Three runs
     * of posts and rails do that with a horizontal line at a constant height, which is also
     * the thing that makes the ground read as flat and receding rather than as a backdrop.
     */
    const fenceRuns: Array<[number, number, number, number]> = [
      [-40, -40, -40, 44],
      [40, -40, 40, 44],
      [-40, 44, 40, 44],
    ];
    for (const [x0, z0, x1, z1] of fenceRuns) {
      const length = Math.hypot(x1 - x0, z1 - z0);
      const steps = Math.round(length / 3.2);
      const turn = Math.atan2(x1 - x0, z1 - z0);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const px = x0 + (x1 - x0) * t;
        const pz = z0 + (z1 - z0) * t;
        box(steel, 0.11, 2.5, 0.11, px, YARD_Y + 1.25, pz);
      }
      const mx = (x0 + x1) / 2;
      const mz = (z0 + z1) / 2;
      for (const y of [0.35, 1.35, 2.35]) {
        box(steel, 0.06, 0.06, length, mx, YARD_Y + y, mz, turn);
      }
      // A darker infill panel behind the rails: at this resolution a suggestion of mesh
      // reads better than actual mesh, and costs two triangles instead of two hundred.
      box(dark, 0.02, 2.0, length, mx, YARD_Y + 1.35, mz, turn);
    }

    /*
     * Lamp columns, and a real light under three of them.
     *
     * The doors were lit by their own canopy fittings and nothing else, so everything past
     * two metres fell away. These are the reason the yard is visible at all, and they put a
     * tall vertical into shots that are otherwise all horizontals.
     */
    const columns: Array<[number, number]> = [
      [-30, 12], [-30, 27], [-12, 36], [12, 36], [30, 27], [30, 12],
    ];
    for (const [x, z] of columns) {
      box(steel, 0.24, 6.2, 0.24, x, YARD_Y + 3.1, z);
      box(steel, 0.2, 0.16, 1.2, x, YARD_Y + 6.15, z + 0.5);
      box(dark, 0.62, 0.24, 0.9, x, YARD_Y + 6.0, z + 1.0);
      box(lens, 0.5, 0.05, 0.72, x, YARD_Y + 5.86, z + 1.0);
      box(steel, 0.7, 0.1, 0.7, x, YARD_Y + 0.05, z);
    }
    for (const [x, z] of [columns[0], columns[2], columns[5]]) {
      const light = ENGINE.PointLightNode.create({
        name: 'YardLamp',
        color: '#f2c489',
        intensity: 58,
        distance: 34,
        decay: 1.35,
        position: new THREE.Vector3(x, YARD_Y + 5.7, z + 1.0),
      });
      this.root.add(light);
    }

    /*
     * The clutter that says somebody works here.
     *
     * Placed clear of the door aprons and of the pursuit routes along the west wall and the
     * front face, so none of it can end up between a camera and the thing that camera exists
     * to show.
     */
    // A skip by the west door, ribbed down its sides.
    for (const [sx, sz, turn] of [[-31.5, 6.5, 0.18], [29.5, 33.5, -0.42]] as const) {
      box(skip, 4.4, 1.7, 2.2, sx, YARD_Y + 0.85, sz, turn);
      box(dark, 4.5, 0.16, 2.3, sx, YARD_Y + 1.72, sz, turn);
      for (let i = -2; i <= 2; i++) {
        box(dark, 0.1, 1.5, 2.26, sx + Math.cos(turn) * i * 0.85, YARD_Y + 0.85, sz - Math.sin(turn) * i * 0.85, turn);
      }
    }
    // Pallet stacks and a few crates.
    for (const [px, pz, count, turn] of [[-33, 24, 6, 0.1], [33, 22, 5, -0.24], [-6, 38, 7, 0.32]] as const) {
      for (let i = 0; i < count; i++) {
        box(timber, 1.5, 0.13, 1.25, px, YARD_Y + 0.07 + i * 0.15, pz, turn);
      }
      box(timber, 1.15, 0.9, 1.0, px + 2.1, YARD_Y + 0.45, pz + 0.4, turn);
      box(timber, 1.0, 0.75, 0.9, px + 2.2, YARD_Y + 1.28, pz + 0.35, turn + 0.2);
    }
    // Crowd barriers, stacked against the fence.
    for (const [bx, bz] of [[-20, 42.4], [8, 42.4]] as const) {
      for (let i = 0; i < 3; i++) {
        box(steel, 2.3, 0.06, 0.06, bx, YARD_Y + 0.4 + i * 0.12, bz + i * 0.09);
        box(steel, 2.3, 0.06, 0.06, bx, YARD_Y + 1.05 + i * 0.12, bz + i * 0.09);
        box(steel, 0.06, 0.75, 0.06, bx - 1.1, YARD_Y + 0.72 + i * 0.12, bz + i * 0.09);
        box(steel, 0.06, 0.75, 0.06, bx + 1.1, YARD_Y + 0.72 + i * 0.12, bz + i * 0.09);
      }
    }

    this.root.add(
      merged('YardApron', concrete, CONCRETE),
      merged('YardKerb', kerb, KERB),
      merged('YardRoad', tarmac, TARMAC),
      merged('YardMarkings', paint, PAINT),
      merged('YardSteel', steel, STEEL),
      merged('YardDark', dark, DARK),
      merged('YardTimber', timber, TIMBER),
      merged('YardSkip', skip, SKIP),
      merged('YardLampLens', lens, LENS)
    );
  }
}
