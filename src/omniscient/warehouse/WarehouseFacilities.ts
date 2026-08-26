import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { WAREHOUSE_LAYOUT, WAREHOUSE_SECURITY_ZONES, WAREHOUSE_SECURITY_ZONE_IDS } from './WarehouseLayout.js';

/**
 * The machinery, the mezzanine and the office - the things that make a shed a workplace.
 *
 * ## Why this is a separate module
 *
 * art.ts owns the shell, the racking and the lighting; WarehouseSetDressing owns atmosphere and
 * the small operational props. Neither wanted a forklift, and art.ts is already the longest file
 * in the mission. This holds the large authored objects a working warehouse has and this one did
 * not: vehicles, a mezzanine with stairs, a glazed supervisor's office, and the loose life that
 * accumulates around them.
 *
 * ## Everything merges
 *
 * A forklift is about thirty boxes. Three of them plus a mezzanine plus an office is several
 * hundred meshes if built naively, in a scene that already draws a thousand. So geometry is
 * accumulated into per-material buckets and merged once, exactly as the racking does - the whole
 * module lands in roughly a dozen draw calls regardless of how much is in it.
 *
 * ## Placement rule
 *
 * Nothing here may sit in a rack bay, an aisle the drone flies, or a decision station. Positions
 * are taken from WAREHOUSE_LAYOUT and checked against it rather than typed by eye, because the
 * aisle geometry is fixed and this furniture has to live around it.
 */

/**
 * The mezzanine's solid volume, exported because the drone has to be stopped by it.
 *
 * The flight box reaches x 22.6 and z 27.4, which is straight through this deck - so without
 * a collision entry the player flies through three metres of steel and an office. That is not
 * this project's convention: constrainDrone already blocks the racking and the sortation
 * conveyors, so large solid structures are expected to stop the drone, and a new one that does
 * not is a regression rather than a style.
 *
 * The volume covers the deck and the office only. Under it is a real space a drone can use, and
 * over it is open air below the roof, so both stay flyable - the same reasoning that lets the
 * racking be overflown rather than walled off floor to ceiling.
 */
export const MEZZANINE_BOUNDS = {
  minX: 13.4,
  maxX: 22.6,
  minZ: 21.4,
  maxZ: 28.2,
  minY: 3.3,
  maxY: 6.5,
} as const;

const BODY = new THREE.MeshStandardMaterial({ color: '#a86f24', roughness: 0.62, metalness: 0.22 });
const BODY_DARK = new THREE.MeshStandardMaterial({ color: '#1e1f1f', roughness: 0.74, metalness: 0.34 });
const STEEL = new THREE.MeshStandardMaterial({ color: '#3f4345', roughness: 0.58, metalness: 0.6 });
const RAIL = new THREE.MeshStandardMaterial({ color: '#b39329', roughness: 0.66, metalness: 0.24 });
const DECK = new THREE.MeshStandardMaterial({ color: '#2a2f31', roughness: 0.84, metalness: 0.14 });
const GLASS = new THREE.MeshStandardMaterial({
  color: '#8fb6bd',
  transparent: true,
  opacity: 0.3,
  roughness: 0.16,
  metalness: 0.1,
  depthWrite: false,
});
const OFFICE_WALL = new THREE.MeshStandardMaterial({ color: '#35383c', roughness: 0.86, metalness: 0.08 });
const RUBBER = new THREE.MeshStandardMaterial({ color: '#101413', roughness: 0.95, metalness: 0.04 });

/**
 * One accent per security zone - the whole of §229 in four colours.
 *
 * The four zones were indistinguishable in the picture. They had hanging labels, but all four
 * were the same red, eight metres up and small, so a player asked "where are you?" had to read
 * a sign rather than recognise a place. Somewhere you have been should be identifiable before
 * you can read anything in it.
 *
 * Floor colour is the answer because the floor is the one surface always in frame from a drone
 * and the one thing a warehouse genuinely colour-codes. Kept inside the game's existing range -
 * amber, blue-teal, olive, brick - so this reads as painted concrete rather than as a menu.
 */
const ZONE_ACCENT: Readonly<Record<string, string>> = {
  receiving: '#b5762a',
  'storage-west': '#41707e',
  'storage-east': '#6d8f45',
  sortation: '#a0524a',
};

/** Where each zone's floor marker sits: open floor inside the zone, clear of racks and stations. */
const ZONE_MARKER: Readonly<Record<string, readonly [number, number]>> = {
  // Clear of the inbound truck and its dock seal, which own the middle of receiving.
  receiving: [7.6, -19.4],
  'storage-west': [-15.5, 6.4],
  'storage-east': [5.5, 6.4],
  sortation: [16.4, 7.6],
};
/*
 * Fluorescent tube: the second fixture type this building needed.
 *
 * Every lamp in here was the same hanging high bay. A working warehouse mixes them - high bays
 * over the storage volume where the throw has to be long, and cheap strip fluorescents under
 * anything with a ceiling close overhead, which is exactly what a mezzanine and an office are.
 * The variety is the point; two fixture families reading differently is what stops a ceiling
 * looking stamped out.
 *
 * Emissive AND lit: the tube is the visible source and a real light does the work beside it.
 * An emissive strip alone illuminates nothing, which this project has already been caught by.
 */
const TUBE = new THREE.MeshStandardMaterial({
  color: '#dfeef2',
  emissive: '#bcd8e4',
  emissiveIntensity: 1.4,
  roughness: 0.4,
});

interface Buckets {
  body: THREE.BufferGeometry[];
  bodyDark: THREE.BufferGeometry[];
  steel: THREE.BufferGeometry[];
  rail: THREE.BufferGeometry[];
  deck: THREE.BufferGeometry[];
  glass: THREE.BufferGeometry[];
  wall: THREE.BufferGeometry[];
  rubber: THREE.BufferGeometry[];
  tube: THREE.BufferGeometry[];
}

function box(
  bucket: THREE.BufferGeometry[],
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  rotY = 0
): void {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rotY !== 0) g.applyMatrix4(new THREE.Matrix4().makeRotationY(rotY));
  g.translate(x, y, z);
  bucket.push(g);
}

/** Place a box from an [x, z] pair plus a height, which is how the vehicle parts are authored. */
function boxXZ(
  bucket: THREE.BufferGeometry[],
  w: number,
  h: number,
  d: number,
  xz: readonly [number, number],
  y: number,
  rotY = 0
): void {
  box(bucket, w, h, d, xz[0], y, xz[1], rotY);
}

function cyl(
  bucket: THREE.BufferGeometry[],
  radius: number,
  height: number,
  x: number,
  y: number,
  z: number,
  axis: 'x' | 'y' = 'y',
  segments = 10
): void {
  const g = new THREE.CylinderGeometry(radius, radius, height, segments);
  if (axis === 'x') g.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
  g.translate(x, y, z);
  bucket.push(g);
}

export class WarehouseFacilities {
  public readonly root = ENGINE.SceneNode.create({ name: 'WarehouseFacilities' });

  /**
   * Build and parent. Never from a field initialiser - nodes created while the owning rig's
   * fields are still initialising do not render, which cost this project a whole debugging
   * session once already.
   */
  public build(): void {
    const bucket: Buckets = {
      body: [],
      bodyDark: [],
      steel: [],
      rail: [],
      deck: [],
      glass: [],
      wall: [],
      rubber: [],
      tube: [],
    };

    this.buildForklift(bucket, -16.5, 20.4, Math.PI * 0.92, true);
    this.buildForklift(bucket, 12.6, 19.2, -Math.PI * 0.34, false);
    this.buildForklift(bucket, -21.4, -21.6, Math.PI * 0.5, true);
    this.buildPalletTruck(bucket, 4.6, 20.9, 0.22);
    this.buildPalletTruck(bucket, -10.2, -20.4, -0.6);
    this.buildChargingBay(bucket, -22.2, -18.4);
    this.buildMezzanine(bucket);
    this.buildLooseLife(bucket);
    this.buildStripLighting(bucket);
    this.buildZoneIdentity();

    const merged: Array<[string, THREE.BufferGeometry[], THREE.Material]> = [
      ['FacilityBody', bucket.body, BODY],
      ['FacilityBodyDark', bucket.bodyDark, BODY_DARK],
      ['FacilitySteel', bucket.steel, STEEL],
      ['FacilityRail', bucket.rail, RAIL],
      ['FacilityDeck', bucket.deck, DECK],
      ['FacilityGlass', bucket.glass, GLASS],
      ['FacilityWall', bucket.wall, OFFICE_WALL],
      ['FacilityRubber', bucket.rubber, RUBBER],
      ['FacilityTube', bucket.tube, TUBE],
    ];
    for (const [name, pieces, material] of merged) {
      if (pieces.length === 0) continue;
      const geometry = mergeGeometries(pieces, false);
      if (!geometry) continue;
      this.root.add(
        ENGINE.MeshNode.create({ name, geometry, material, castShadow: true, receiveShadow: true })
      );
    }

    /*
     * The office is lit from inside, and that is the point of it.
     *
     * A glazed box on a mezzanine with nothing behind the glass is a dark panel. The one light
     * in here makes it the only warm interior seen through a window in the building, which
     * gives the east wall somewhere to look and tells the player somebody works here.
     */
    this.root.add(
      ENGINE.PointLightNode.create({
        name: 'SupervisorOfficeLight',
        color: '#ffd7a4',
        intensity: 11,
        distance: 12,
        decay: 1.5,
        position: new THREE.Vector3(18.4, 5.15, 24.4),
      })
    );
  }

  /**
   * Give each security zone a face: a painted floor plate carrying its letter, and a colour
   * band at its threshold.
   *
   * Not merged with the rest, because each plate needs its own canvas texture - and four extra
   * draw calls for the thing that makes the building navigable is the best trade in this file.
   */
  private buildZoneIdentity(): void {
    for (const id of WAREHOUSE_SECURITY_ZONE_IDS) {
      const zone = WAREHOUSE_SECURITY_ZONES[id];
      const accent = ZONE_ACCENT[id] ?? '#b5762a';
      const marker = ZONE_MARKER[id] ?? [0, 0];

      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#20211f';
        ctx.fillRect(0, 0, 256, 256);
        ctx.strokeStyle = accent;
        ctx.lineWidth = 14;
        ctx.strokeRect(7, 7, 242, 242);
        /*
         * The lettering is drawn MIRRORED, so that it arrives unmirrored.
         *
         * Chasing this through the texture matrix did not converge: no flip gave mirrored text
         * with the label above the letter, flipping U alone fixed one plate, and flipping both
         * turned out to be a 180 degree rotation - two reflections compose to a rotation - which
         * fixed the vertical order and left the mirroring exactly where it was. Three builds,
         * three different wrong answers.
         *
         * The canvas is the one place in this chain where the transform is unambiguous, so the
         * mirror happens here and repeat/offset only carry the vertical flip. Anyone changing
         * the plate's rotation must re-check this on screen; the derivation is not trustworthy.
         */
        ctx.save();
        ctx.translate(256, 0);
        ctx.scale(-1, 1);
        ctx.fillStyle = accent;
        ctx.font = 'bold 150px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(zone.shortLabel, 128, 116);
        ctx.font = 'bold 27px monospace';
        ctx.fillText(zone.label, 128, 214);
        ctx.restore();
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      /*
       * Both axes flipped, and this was arrived at by looking rather than by reasoning.
       *
       * A PlaneGeometry laid flat by rotating -90 degrees about X, viewed from the drone's
       * usual heading, presents the canvas both mirrored and upside down - measured on screen
       * across two separate plates in two separate builds, reading TSEW EGAROTS with the label
       * above the letter instead of below it. Flipping U alone fixed the mirroring and left the
       * rotation; flipping neither left both. Flipping both is what actually lands.
       *
       * Recorded because the derivation says otherwise: canvas top should map to world -Z and
       * canvas +U to world +X, which would need no flip at all. Something between flipY, the
       * plane's winding and the rotation disagrees with that, and the screen is the authority.
       */
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.repeat.set(-1, -1);
      texture.offset.set(1, 1);
      const plate = ENGINE.MeshNode.create({
        name: `ZoneFloorPlate-${id}`,
        geometry: new THREE.PlaneGeometry(3.5, 3.5),
        material: new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
        receiveShadow: false,
      });
      plate.rotation.x = -Math.PI / 2;
      plate.position.set(marker[0], 0.016, marker[1]);
      this.root.add(plate);

      /*
       * A band across the zone's own width at its near edge. Thin, unlit, and sitting just
       * above the floor paint already there - a threshold you cross rather than a carpet.
       */
      const width = Math.min(zone.bounds.maxX - zone.bounds.minX, 20);
      const band = ENGINE.MeshNode.create({
        name: `ZoneThreshold-${id}`,
        geometry: new THREE.PlaneGeometry(width, 0.42),
        material: new THREE.MeshBasicMaterial({ color: accent, toneMapped: false }),
        receiveShadow: false,
      });
      band.rotation.x = -Math.PI / 2;
      band.position.set((zone.bounds.minX + zone.bounds.maxX) / 2, 0.015, marker[1] + 2.6);
      this.root.add(band);
    }
  }

  /**
   * Strip fluorescents, and the lights that go with them.
   *
   * Placed where a high bay cannot help: under the mezzanine deck, inside the office, and over
   * the front apron where the drone launches and the handoffs happen. Cool white against the
   * building's amber high bays, which is both what a cheap tube actually looks like and another
   * place for the room's cold half to land.
   */
  private buildStripLighting(bucket: Buckets): void {
    const strips: Array<[number, number, number, number]> = [
      [17.9, 3.24, 20.4, 6.6],
      [19.0, 6.16, 24.6, 4.4],
      [-8, 6.4, 20.6, 7.2],
      [6, 6.4, 20.6, 7.2],
      [-19.5, 4.2, -20.2, 5.0],
    ];
    for (const [x, y, z, length] of strips) {
      box(bucket.steel, length + 0.2, 0.09, 0.3, x, y + 0.07, z);
      box(bucket.tube, length, 0.06, 0.14, x, y, z);
      this.root.add(
        ENGINE.PointLightNode.create({
          name: 'StripFluorescent',
          color: '#cfe6ee',
          intensity: 9,
          distance: 13,
          decay: 1.6,
          // Below the tube, never inside its housing - a light buried in its own fitting is
          // the fault that put a hot spot on every high bay in this building.
          position: new THREE.Vector3(x, y - 0.22, z),
        })
      );
    }
  }

  /**
   * A counterbalance forklift, in about thirty boxes.
   *
   * Built from primitives rather than imported because the whole mission is, and because the
   * retro pass quantises to a coarse grid - a faceted block reads as a forklift at this
   * resolution where a detailed mesh would read as noise. The parts that matter for
   * recognition are the mast, the forks and the overhead guard: take any of those away and it
   * becomes a cart.
   */
  private buildForklift(bucket: Buckets, x: number, z: number, rotY: number, laden: boolean): void {
    const s = Math.sin(rotY);
    const c = Math.cos(rotY);
    const at = (lx: number, lz: number): [number, number] => [x + lx * c + lz * s, z - lx * s + lz * c];

    const [bx, bz] = at(0, 0);
    box(bucket.body, 1.06, 0.62, 1.72, bx, 0.72, bz, rotY);
    boxXZ(bucket.bodyDark, 0.98, 0.34, 0.72, at(0, 0.42), 1.24, rotY);
    // Counterweight at the back - the heavy block that makes it a forklift and not a buggy.
    boxXZ(bucket.bodyDark, 1.02, 0.5, 0.44, at(0, -0.82), 0.72, rotY);

    // Overhead guard: four posts and a slatted roof.
    for (const [px, pz] of [at(-0.46, 0.5), at(0.46, 0.5), at(-0.46, -0.62), at(0.46, -0.62)]) {
      box(bucket.steel, 0.07, 1.28, 0.07, px, 1.66, pz, rotY);
    }
    const [gx, gz] = at(0, -0.06);
    box(bucket.steel, 1.06, 0.06, 1.24, gx, 2.32, gz, rotY);
    for (const lz of [-0.44, -0.15, 0.14, 0.43]) {
      boxXZ(bucket.bodyDark, 0.96, 0.03, 0.07, at(0, lz), 2.36, rotY);
    }

    // Mast: two rails and a carriage.
    for (const lx of [-0.34, 0.34]) {
      boxXZ(bucket.steel, 0.09, 2.34, 0.12, at(lx, 1.02), 1.17, rotY);
    }
    boxXZ(bucket.steel, 0.8, 0.1, 0.1, at(0, 1.02), 1.02, rotY);
    // Forks.
    for (const lx of [-0.26, 0.26]) {
      boxXZ(bucket.bodyDark, 0.14, 0.05, 0.92, at(lx, 1.5), 0.12, rotY);
    }
    if (laden) {
      boxXZ(bucket.body, 0.98, 0.16, 0.86, at(0, 1.46), 0.22, rotY);
    }

    // Wheels.
    for (const [lx, lz, r] of [[-0.5, 0.62, 0.28], [0.5, 0.62, 0.28], [-0.42, -0.72, 0.2], [0.42, -0.72, 0.2]] as const) {
      const [wx, wz] = at(lx, lz);
      cyl(bucket.rubber, r, 0.18, wx, r, wz, 'x', 10);
    }
    // Beacon.
    cyl(bucket.rail, 0.07, 0.14, gx, 2.42, gz, 'y', 8);
  }

  /** A hand pallet truck: a tiller, two tines, and the pallet it is under. */
  private buildPalletTruck(bucket: Buckets, x: number, z: number, rotY: number): void {
    const s = Math.sin(rotY);
    const c = Math.cos(rotY);
    const at = (lx: number, lz: number): [number, number] => [x + lx * c + lz * s, z - lx * s + lz * c];
    for (const lx of [-0.24, 0.24]) boxXZ(bucket.bodyDark, 0.16, 0.09, 1.14, at(lx, 0.3), 0.11, rotY);
    boxXZ(bucket.body, 0.56, 0.26, 0.34, at(0, -0.42), 0.25, rotY);
    const [tx, tz] = at(0, -0.5);
    const tiller = new THREE.CylinderGeometry(0.045, 0.045, 1.02, 8);
    tiller.applyMatrix4(new THREE.Matrix4().makeRotationX(0.42));
    tiller.translate(tx, 0.76, tz);
    bucket.steel.push(tiller);
    box(bucket.rail, 0.34, 0.05, 0.05, tx, 1.2, tz, rotY);
  }

  /** Where the trucks live overnight, which is the reason there are batteries in a warehouse. */
  private buildChargingBay(bucket: Buckets, x: number, z: number): void {
    for (const [index, dz] of [-1.5, 0, 1.5].entries()) {
      box(bucket.wall, 0.5, 1.3, 0.72, x, 0.66, z + dz);
      box(bucket.bodyDark, 0.12, 0.2, 0.5, x + 0.3, 1.06, z + dz);
      // The cable, slung to the floor.
      cyl(bucket.rubber, 0.03, 0.9, x + 0.42, 0.5, z + dz + (index % 2 ? 0.2 : -0.2), 'y', 6);
    }
    box(bucket.rail, 1.9, 0.02, 0.02, x + 0.42, 0.02, z);
  }

  /**
   * The mezzanine, the stair to it, and the office on it.
   *
   * Placed over the front apron on the east side rather than anywhere over the racking: the
   * aisles are the drone's airspace and the layout is fixed, so the only honest place for
   * three metres of steel deck is where nothing flies. It also puts the one lit window in the
   * building where the player looks when they turn around at the launch cradle.
   */
  private buildMezzanine(bucket: Buckets): void {
    const deckY = 3.5;
    const x0 = 13.4;
    const x1 = 22.6;
    const z0 = 21.4;
    const z1 = 28.2;
    const midX = (x0 + x1) / 2;
    const midZ = (z0 + z1) / 2;

    box(bucket.deck, x1 - x0, 0.18, z1 - z0, midX, deckY, midZ);
    for (const [px, pz] of [[x0 + 0.4, z0 + 0.4], [x1 - 0.4, z0 + 0.4], [x0 + 0.4, z1 - 0.4], [x1 - 0.4, z1 - 0.4], [midX, z0 + 0.4]] as const) {
      box(bucket.steel, 0.16, deckY, 0.16, px, deckY / 2, pz);
    }
    // Handrail along the open edge. Yellow, because every mezzanine edge in a working
    // building is, and because it is the one place a warm accent belongs at height.
    for (const y of [deckY + 0.55, deckY + 1.05]) {
      box(bucket.rail, x1 - x0, 0.05, 0.05, midX, y, z0 + 0.06);
    }
    for (let px = x0 + 0.3; px < x1; px += 1.5) {
      box(bucket.rail, 0.05, 1.05, 0.05, px, deckY + 0.62, z0 + 0.06);
    }

    // Stair down to the apron, west end, with its own rail.
    const steps = 9;
    for (let i = 0; i < steps; i++) {
      const y = deckY - (i + 1) * (deckY / steps);
      const z = z0 - 0.3 - i * 0.34;
      box(bucket.deck, 1.25, 0.06, 0.34, x0 + 0.35, y, z);
      box(bucket.rail, 0.05, 0.9, 0.05, x0 + 0.95, y + 0.5, z);
    }

    // The office: three walls, a glazed front, a roof.
    const oz0 = z0 + 1.6;
    const ox0 = x0 + 2.4;
    box(bucket.wall, 0.14, 2.5, z1 - oz0 - 0.4, ox0, deckY + 1.34, (oz0 + z1) / 2 - 0.2);
    box(bucket.wall, x1 - ox0 - 0.3, 2.5, 0.14, (ox0 + x1) / 2 - 0.15, deckY + 1.34, z1 - 0.3);
    box(bucket.wall, 0.14, 2.5, z1 - oz0 - 0.4, x1 - 0.3, deckY + 1.34, (oz0 + z1) / 2 - 0.2);
    box(bucket.deck, x1 - ox0 - 0.16, 0.12, z1 - oz0 - 0.26, (ox0 + x1) / 2 - 0.08, deckY + 2.65, (oz0 + z1) / 2 - 0.13);
    box(bucket.glass, x1 - ox0 - 0.3, 1.5, 0.06, (ox0 + x1) / 2 - 0.15, deckY + 1.6, oz0);
    // A desk behind the glass, so the lit window has something in it.
    box(bucket.bodyDark, 1.5, 0.07, 0.62, (ox0 + x1) / 2, deckY + 0.85, oz0 + 0.75);
    box(bucket.steel, 0.5, 0.42, 0.06, (ox0 + x1) / 2 - 0.3, deckY + 1.16, oz0 + 0.95);
  }

  /**
   * The things that accumulate: empty pallets, drums, a scrubber, banding.
   *
   * A warehouse is never tidy at the edges, and the edges are where the eye goes when the
   * middle is repetitive. All of it sits against walls and out of the flight box.
   */
  private buildLooseLife(bucket: Buckets): void {
    const wall = WAREHOUSE_LAYOUT.shell.wallX;
    for (const [x, z, count] of [[-wall + 1.3, 12.5, 7], [-wall + 1.3, 8.6, 5], [wall - 1.4, -8.2, 6]] as const) {
      for (let i = 0; i < count; i++) {
        box(bucket.bodyDark, 1.16, 0.05, 1.02, x, 0.05 + i * 0.16, z);
        for (const lx of [-0.44, 0, 0.44]) box(bucket.bodyDark, 0.12, 0.1, 1.0, x + lx, 0.11 + i * 0.16, z);
      }
    }
    for (const [x, z] of [[-wall + 1.6, 3.4], [-wall + 2.3, 3.6], [wall - 1.8, 4.2]] as const) {
      cyl(bucket.body, 0.28, 0.86, x, 0.43, z, 'y', 12);
      cyl(bucket.steel, 0.285, 0.06, x, 0.62, z, 'y', 12);
    }
    // A floor scrubber, parked nose-in against the rear wall.
    box(bucket.body, 0.86, 0.62, 1.24, 6.4, 0.5, -25.4);
    box(bucket.bodyDark, 0.9, 0.16, 0.5, 6.4, 0.14, -24.9);
    box(bucket.steel, 0.06, 0.66, 0.06, 6.1, 1.06, -25.9);
    box(bucket.steel, 0.06, 0.66, 0.06, 6.7, 1.06, -25.9);
    box(bucket.rail, 0.66, 0.05, 0.05, 6.4, 1.38, -25.9);
  }
}

