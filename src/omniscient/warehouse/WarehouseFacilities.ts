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
  /*
   * Sortation's plate is the odd one out, and the floor is why.
   *
   * At (16.4, 7.6) a 3.5m plate spanned x 14.65..18.15 and the near lane occupies 16.39..18.11
   * for the whole run - so the zone's own red marker was painted under a conveyor. Reported as
   * a red floor label under the belt.
   *
   * There is no 3.5m square of clear floor left in this zone: the three lanes take x
   * 16.39..18.11, 18.74..20.46 and 21.09..22.81, the gaps between them are 63cm, and the only
   * open band is z 9.5 to 11.5 between the lane ends and the inspection table. So this one is
   * placed there and drawn smaller, which is honest about the room rather than pretending the
   * space exists.
   */
  sortation: [19.6, 10.45],
};

/** Plate size per zone; see the sortation note in ZONE_MARKER for why one is smaller. */
const ZONE_PLATE_SIZE: Readonly<Record<string, number>> = { sortation: 1.9 };
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

/** The axis a fresh CylinderGeometry points down, for `rod` below. */
const ROD_UP = new THREE.Vector3(0, 1, 0);

/**
 * A cylinder between two points, at whatever angle that turns out to be.
 *
 * Everything sloped in this file was being faked with a fixed rotation and a hand-typed
 * midpoint, which is why the pallet truck's handle ended up twenty centimetres off the top of
 * its own tiller and why the stair had posts but no rail. Given both ends, neither can drift.
 */
function rod(
  bucket: THREE.BufferGeometry[],
  radius: number,
  from: THREE.Vector3,
  to: THREE.Vector3,
  segments = 8
): void {
  const delta = to.clone().sub(from);
  const length = delta.length();
  if (length < 1e-4) return;
  const g = new THREE.CylinderGeometry(radius, radius, length, segments);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(ROD_UP, delta.clone().normalize()));
  g.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
  bucket.push(g);
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
    /*
     * Off the stair. It was parked at (12.6, 19.2) and the flight runs down x 13.13..14.38
     * between z 18.38 and 21.4 - so the machine's overhead guard stood in the treads. Round to
     * the far side of the mezzanine, where it faces the floor it works instead of the wall.
     */
    this.buildForklift(bucket, 9.4, 17.1, -Math.PI * 0.34, false);
    this.buildForklift(bucket, -21.4, -21.6, Math.PI * 0.5, true);
    this.buildPalletTruck(bucket, 4.6, 20.9, 0.22);
    this.buildPalletTruck(bucket, -10.2, -20.4, -0.6);
    this.buildChargingBay(bucket, -22.2, -18.4);
    this.buildMezzanine(bucket);
    this.buildLooseLife(bucket);
    this.buildStripLighting(bucket);
    this.buildHighBays(bucket);
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
        geometry: new THREE.PlaneGeometry(ZONE_PLATE_SIZE[id] ?? 3.5, ZONE_PLATE_SIZE[id] ?? 3.5),
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
  /**
   * ## Twice as many fittings, and every one of them hangs off something
   *
   * Two faults, reported together as "the fluorescent bulbs are not enough to make the
   * warehouse more detailed, and they are hanging from nothing".
   *
   * HANGING FROM NOTHING was literal: a fitting is a housing box and a tube box at a given
   * height and that was the whole assembly. At 3.24m over the dock apron, with a 10.5m roof,
   * each one floated seven metres under a ceiling it had no connection to. Now every fitting
   * drops on a pair of rods from a channel at the roof, so the eye can follow it up.
   *
   * NOT ENOUGH was true as well - five fittings in a building 48 by 55 metres, all of them
   * clustered at the front. The list is now twelve, spread over the rear half, the west run
   * and the sortation floor, and it is deliberately a list of positions rather than a grid:
   * a regular array of lights is the same "this was generated" tell the racking pass had to
   * break up.
   *
   * Only the original five carry a PointLight. The extra seven are geometry, because twelve
   * more point lights in a scene that already runs a fixture row per bay is a frame-rate
   * decision rather than an art one - and the ones that light the floor a player works on
   * were already the ones that had lights.
   */
  /**
   * High bays over the aisles, and the cadence of light and dark they make on the floor.
   *
   * ## The gap this closes, stated by a critic who had not seen the code
   *
   * "There is no lamp visible in the aisle at all - the ceiling is beams and glow, with no
   * fitting, no shade, no stem, nothing casting", and "the floor is one uniform value from
   * foreground to far wall, with no bright-under-lamp, dark-between cadence".
   *
   * Both halves are true and they are one fault. The twelve strip fittings sit at x -19.5, -8,
   * 6, 17.9, 19 and 0 - BETWEEN the aisles, which run at -19, -12, -5, 2 and 9 - and at y 6.4,
   * which is three tenths of a metre above racking that stands 6.1. So they are hidden behind
   * the rack tops from every camera the player has, and they light the gaps rather than the
   * lanes. The room was lit by things nobody could see, in places nobody looks.
   *
   * ## Why this is a rhythm and not a row
   *
   * Every other station carries a lamp. A lamp at every station gives an evenly lit aisle,
   * which is the fault being fixed with extra steps; alternating gives bright, dim, bright
   * down the lane, and that cadence is what carries depth when perspective alone cannot -
   * see Law 3, and the same argument the racking pass had to make about regularity.
   *
   * ## The light budget, which is real
   *
   * buildStripLighting's note is right that a point light per fitting is a frame-rate decision.
   * So the fittings are geometry at every station and only the LIT stations get a light: ten
   * across five aisles. They are short-range on purpose - distance 13 against a 10.5m roof, so
   * the pool has an edge instead of washing into its neighbour.
   */
  private buildHighBays(bucket: Buckets): void {
    const roof = WAREHOUSE_LAYOUT.shell.roofY - 0.28;
    const y = 8.1;
    // Uneven on purpose: a fitting every 9m reads as a grid, which is the "this was generated"
    // tell. These are the four cross-aisle stations, spaced the way a real building lands them.
    const stations = [-21.5, -11.5, -1.5, 9.5, 19.5];
    for (let a = 0; a < WAREHOUSE_LAYOUT.rack.centers.length; a++) {
      const x = WAREHOUSE_LAYOUT.rack.centers[a] + WAREHOUSE_LAYOUT.rack.spacing / 2;
      for (let i = 0; i < stations.length; i++) {
        const z = stations[i];
        // The shade: a squat truncated cone reads as a high bay at this resolution, and the
        // retro pass would turn anything finer into noise.
        box(bucket.bodyDark, 1.15, 0.42, 1.15, x, y, z);
        box(bucket.steel, 0.86, 0.1, 0.86, x, y - 0.24, z);
        // The stem up to the roof, so it hangs off something. A lamp on nothing is the fault
        // this building already shipped once.
        box(bucket.steel, 0.07, roof - y - 0.2, 0.07, x, (y + 0.2 + roof) / 2, z);
        // Alternate down the lane, and offset the phase per aisle so two neighbouring lanes
        // are never bright at the same station - that is what makes the floor read across.
        if ((i + a) % 2 !== 0) continue;
        box(bucket.tube, 0.7, 0.06, 0.7, x, y - 0.3, z);
        this.root.add(
          ENGINE.PointLightNode.create({
            name: 'HighBay',
            color: '#ffd9a6',
            /*
             * 210, from 14.
             *
             * These are the only lamps in the building over the LANES - the old 6x5 fixture
             * grid lights x -20, -4 and 12, which are the racks. At 14 they put 0.22 on the
             * floor against the work lights' 3.4, so they were fittings with a glow rather
             * than a light source, and every aisle was actually being lit sideways by lamps
             * hanging over the shelving next to it. That is why the floor read as one value:
             * nothing was keyed to the space the player moves through.
             *
             * 210 puts them level with the work lights at the floor, which makes the lane
             * the brightest part of its own bay. Their reach already ended (13m, decay 1.9);
             * it was the only thing about them that was right.
             */
            intensity: 210,
            // Short, so the pool has an edge. Long-range lamps overlap into the flat fill this
            // whole item exists to remove.
            distance: 13,
            decay: 1.9,
            // Below the shade, never inside it - see the note in buildStripLighting.
            position: new THREE.Vector3(x, y - 0.42, z),
          })
        );
      }
    }
  }

  private buildStripLighting(bucket: Buckets): void {
    const roof = WAREHOUSE_LAYOUT.shell.roofY - 0.28;
    const strips: Array<[number, number, number, number, boolean]> = [
      [17.9, 3.24, 20.4, 6.6, true],
      [19.0, 6.16, 24.6, 4.4, true],
      [-8, 6.4, 20.6, 7.2, true],
      [6, 6.4, 20.6, 7.2, true],
      [-19.5, 4.2, -20.2, 5.0, true],
      /*
       * The rear half, which had none at all - and these two are LIT now.
       *
       * The note above is right that twelve point lights is a frame-rate decision, and it was
       * right about which floors mattered when it was written. It has been overtaken: the
       * inbound audit stands its workers at z -16 to -18 and unloads them through the freight
       * door at -29, so the rear half is where the player now spends a whole quest. Two lights,
       * not seven - the other five stay geometry.
       */
      [-8, 6.4, -20.6, 7.2, true],
      [6, 6.4, -20.6, 7.2, true],
      [-19.5, 5.8, -6.4, 5.0, false],
      [19.5, 5.8, -6.4, 5.0, false],
      // The west run and the sortation floor.
      [-19.5, 4.2, 12.6, 5.0, false],
      [19.5, 4.6, 6.2, 5.0, false],
      [0, 6.9, 26.4, 8.4, false],
    ];
    for (const [x, y, z, length, lit] of strips) {
      box(bucket.steel, length + 0.2, 0.09, 0.3, x, y + 0.07, z);
      box(bucket.tube, length, 0.06, 0.14, x, y, z);
      /*
       * Two drop rods and the channel they hang from.
       *
       * Inset from the ends by a fifth of the run, which is where a real fitting is picked up
       * - hung from the very ends it sags, and the eye knows that even if it cannot say why.
       */
      const drop = roof - (y + 0.11);
      for (const lx of [-length * 0.3, length * 0.3]) {
        box(bucket.steel, 0.05, drop, 0.05, x + lx, y + 0.11 + drop / 2, z);
      }
      box(bucket.steel, length * 0.6 + 0.2, 0.1, 0.12, x, roof + 0.05, z);
      if (!lit) continue;
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

    /*
     * ## The operator station, which is what was missing
     *
     * The mast, the forks and the overhead guard were all here and the machine still read as
     * an orange block on wheels, because there was nowhere for a driver to be. A forklift is
     * recognisable from the seat outward: the step you climb, the seat you sit in, the wheel
     * you hold and the dash it stands on. None of those existed.
     *
     * Six additions, all in the existing buckets and all inside the footprint already
     * occupied, so nothing here changes where the machine can be parked:
     *
     *  - SEAT pan and back, set into the well behind the mast.
     *  - STEERING COLUMN and WHEEL, canted back the way a truck's is.
     *  - DASH cowl in front of the seat, which is what the wheel comes out of.
     *  - STEP on the left side, the one part of a forklift that is always scuffed.
     *  - LOAD BACKREST on the carriage - the mesh guard the load leans against. Without it a
     *    pallet on the forks looks like it is about to slide into the driver.
     *  - TILT RAMS between the body and the mast, which explains how the mast moves.
     */
    // Seat, in the well behind the mast.
    boxXZ(bucket.bodyDark, 0.52, 0.1, 0.46, at(0, -0.1), 1.08, rotY);
    boxXZ(bucket.bodyDark, 0.52, 0.46, 0.1, at(0, -0.36), 1.32, rotY);
    // Dash cowl, and the column and wheel that come out of it.
    boxXZ(bucket.body, 0.6, 0.34, 0.22, at(0, 0.34), 1.2, rotY);
    boxXZ(bucket.steel, 0.06, 0.3, 0.06, at(0, 0.28), 1.48, rotY);
    const [swx, swz] = at(0, 0.24);
    cyl(bucket.bodyDark, 0.16, 0.04, swx, 1.62, swz, 'y', 12);
    // The step up, on the left flank.
    boxXZ(bucket.steel, 0.1, 0.05, 0.42, at(-0.56, 0.1), 0.42, rotY);
    // Load backrest on the carriage: five uprights and a top rail.
    for (const lx of [-0.4, -0.2, 0, 0.2, 0.4]) {
      boxXZ(bucket.steel, 0.05, 0.72, 0.05, at(lx, 1.06), 0.5, rotY);
    }
    boxXZ(bucket.steel, 0.88, 0.06, 0.06, at(0, 1.06), 0.86, rotY);
    // Tilt rams, body to mast.
    for (const lx of [-0.3, 0.3]) {
      boxXZ(bucket.steel, 0.09, 0.09, 0.6, at(lx, 0.72), 1.0, rotY);
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
    /*
     * ## The floating yellow handle
     *
     * The tiller was a cylinder rotated 0.42 about WORLD x and then dropped at the truck's
     * plan position, while the handle bar was placed at that same plan position 44cm higher.
     * Two things went wrong at once: the lean moved the shaft's top twenty centimetres in z
     * away from the bar, so the bar hung in space beside it - and because the lean ignored
     * rotY, a truck parked at any angle leaned sideways instead of backwards.
     *
     * Both ends of the shaft are now real points in the truck's own frame, and the bar sits on
     * the end of it. See `rod`.
     */
    for (const lx of [-0.24, 0.24]) boxXZ(bucket.bodyDark, 0.16, 0.09, 1.14, at(lx, 0.3), 0.11, rotY);
    boxXZ(bucket.body, 0.56, 0.26, 0.34, at(0, -0.42), 0.25, rotY);
    const [footX, footZ] = at(0, -0.46);
    const [gripX, gripZ] = at(0, -0.9);
    rod(bucket.steel, 0.045, new THREE.Vector3(footX, 0.3, footZ), new THREE.Vector3(gripX, 1.22, gripZ));
    box(bucket.rail, 0.34, 0.05, 0.05, gripX, 1.24, gripZ, rotY);
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
    /*
     * Handrail along the open edge, WITH A GAP WHERE THE STAIR ARRIVES.
     *
     * It ran the full 13.4 to 22.6 at z 21.46, and the stair lands at x 13.75 with a landing
     * spanning 13.13..14.38 - so two yellow rails and a baluster were drawn straight across
     * the top of the flight. Reported as the handrail blocking the stairs, and it was: the
     * one opening in the barrier had a barrier across it.
     *
     * The run starts east of the opening instead. Nothing is needed on the west side because
     * the opening reaches the deck's own west edge, and the stair's newels already close the
     * corner where the two meet.
     *
     * Yellow because every mezzanine edge in a working building is, and because it is the one
     * place a warm accent belongs at height.
     */
    const railStartX = 14.5;
    for (const y of [deckY + 0.55, deckY + 1.05]) {
      box(bucket.rail, x1 - railStartX, 0.05, 0.05, (railStartX + x1) / 2, y, z0 + 0.06);
    }
    for (let px = railStartX + 0.3; px < x1; px += 1.5) {
      box(bucket.rail, 0.05, 1.05, 0.05, px, deckY + 0.62, z0 + 0.06);
    }

    /*
     * ## The stair, finished
     *
     * It was nine treads and nine posts. The posts held nothing - there was no rail between
     * them, so the flight read as a row of yellow sticks beside some floating planks - and the
     * top tread stopped 0.3m short of the deck edge and 0.39m below it, so the stair did not
     * actually arrive anywhere. Reported as incomplete handrails, and it was both halves.
     *
     * What a stair needs to read as one, all of it missing here:
     *
     *  - RISERS. Open treads are a fire escape; a working stair to an office is closed.
     *  - STRINGERS, the two sloped beams the treads sit in. This is what makes a flight a
     *    single object instead of a stack of separate boards.
     *  - A HANDRAIL on both sides, following the pitch, with a mid rail under it - the two
     *    lines that read as "stair" from across a building even when the treads do not.
     *  - NEWELS at top and bottom, so the rails begin and end on something.
     *  - A LANDING closing the gap onto the deck.
     */
    const steps = 9;
    const rise = deckY / steps;
    const going = 0.34;
    const stairX = x0 + 0.35;
    const railX = [stairX - 0.6, stairX + 0.6];
    const topZ = z0 - 0.3;
    const stepAt = (i: number): [number, number] => [deckY - (i + 1) * rise, topZ - i * going];
    for (let i = 0; i < steps; i++) {
      const [y, z] = stepAt(i);
      box(bucket.deck, 1.25, 0.06, going, stairX, y, z);
      // The riser closing the front of each tread.
      box(bucket.bodyDark, 1.25, rise - 0.06, 0.04, stairX, y + rise / 2, z - going / 2);
    }
    const [topY, topStepZ] = stepAt(0);
    const [botY, botStepZ] = stepAt(steps - 1);
    for (const rx of railX) {
      // Stringer: the sloped beam under the treads, from the deck edge to the floor.
      rod(bucket.steel, 0.07, new THREE.Vector3(rx, topY - 0.1, topStepZ + 0.2), new THREE.Vector3(rx, botY - 0.1, botStepZ - 0.2));
      // Newels, then the two rails they carry.
      for (const [ny, nz] of [[topY, topStepZ], [botY, botStepZ]] as const) {
        box(bucket.rail, 0.06, 1.0, 0.06, rx, ny + 0.5, nz);
      }
      for (const lift of [0.98, 0.52]) {
        rod(bucket.rail, 0.035, new THREE.Vector3(rx, topY + lift, topStepZ), new THREE.Vector3(rx, botY + lift, botStepZ));
      }
      // Two intermediate posts, so a four-metre rail is not spanning unsupported.
      for (const i of [3, 6]) {
        const [py, pz] = stepAt(i);
        box(bucket.rail, 0.05, 0.98, 0.05, rx, py + 0.49, pz);
      }
    }
    // The landing that puts the top tread onto the deck it is there to reach.
    box(bucket.deck, 1.25, 0.08, (z0 - topStepZ) + 0.34, stairX, deckY - 0.05, (z0 + topStepZ) / 2 + 0.17);

    // The office: three walls, a glazed front, a roof.
    const oz0 = z0 + 1.6;
    const ox0 = x0 + 2.4;
    box(bucket.wall, 0.14, 2.5, z1 - oz0 - 0.4, ox0, deckY + 1.34, (oz0 + z1) / 2 - 0.2);
    box(bucket.wall, x1 - ox0 - 0.3, 2.5, 0.14, (ox0 + x1) / 2 - 0.15, deckY + 1.34, z1 - 0.3);
    box(bucket.wall, 0.14, 2.5, z1 - oz0 - 0.4, x1 - 0.3, deckY + 1.34, (oz0 + z1) / 2 - 0.2);
    box(bucket.deck, x1 - ox0 - 0.16, 0.12, z1 - oz0 - 0.26, (ox0 + x1) / 2 - 0.08, deckY + 2.65, (oz0 + z1) / 2 - 0.13);
    /*
     * ## The glazed front, and what is behind it
     *
     * The office was five boxes: three walls, a roof and a pane, with a desk slab and an
     * upright behind it "so the lit window has something in it". Through the glass that read
     * as a lit empty room with a plank in it - and this is the only lit interior in the
     * building, at height, facing the whole floor, so it is the thing the eye goes to from
     * anywhere in the front half.
     *
     * A supervisor's office over a warehouse floor is a small, cluttered, over-lit room. What
     * it needs to read as one is a mullion in the glass, a way in, and enough furniture that
     * the silhouette is busy rather than empty.
     */
    const oxMid = (ox0 + x1) / 2;
    const glassW = x1 - ox0 - 0.3;
    /*
     * Glazing in two panes with a mullion, not one sheet.
     *
     * A single 6m pane has no scale - nothing in it tells you how big the room is. Split, the
     * frame reads as window-sized and the office reads as a room rather than a display case.
     */
    for (const half of [-1, 1]) {
      box(bucket.glass, glassW / 2 - 0.05, 1.5, 0.06, oxMid + half * (glassW / 4 + 0.03), deckY + 1.6, oz0);
    }
    box(bucket.steel, 0.09, 1.62, 0.1, oxMid, deckY + 1.6, oz0);
    box(bucket.steel, glassW + 0.1, 0.1, 0.1, oxMid, deckY + 2.42, oz0);
    box(bucket.steel, glassW + 0.1, 0.09, 0.1, oxMid, deckY + 0.82, oz0);

    /*
     * A door, at the west end, opening onto the deck.
     *
     * A room on a mezzanine with no way in is a diorama. It is a plain slab with a handle and
     * a small vision panel, in the wall material so it reads as part of the box.
     */
    const doorX = ox0 + 0.55;
    box(bucket.bodyDark, 0.9, 2.05, 0.08, doorX, deckY + 1.11, oz0 + 0.02);
    box(bucket.glass, 0.34, 0.44, 0.05, doorX, deckY + 1.72, oz0 + 0.04);
    box(bucket.steel, 0.13, 0.04, 0.05, doorX + 0.3, deckY + 1.14, oz0 + 0.07);

    /*
     * The furniture, arranged as a person would use it: desk against the glass so the
     * supervisor faces the floor, screen and keyboard on it, chair pulled out, cabinets and a
     * whiteboard on the blind rear wall where they do not block the window.
     */
    box(bucket.bodyDark, 2.1, 0.07, 0.68, oxMid + 0.6, deckY + 0.85, oz0 + 0.52);
    for (const lx of [-0.95, 0.95]) {
      box(bucket.steel, 0.06, 0.74, 0.6, oxMid + 0.6 + lx, deckY + 0.48, oz0 + 0.52);
    }
    // Screen on a stand, facing into the room, and a keyboard in front of it.
    box(bucket.bodyDark, 0.14, 0.05, 0.22, oxMid + 0.35, deckY + 0.91, oz0 + 0.66);
    box(bucket.bodyDark, 0.08, 0.22, 0.08, oxMid + 0.35, deckY + 1.04, oz0 + 0.66);
    box(bucket.glass, 0.62, 0.4, 0.04, oxMid + 0.35, deckY + 1.34, oz0 + 0.66);
    box(bucket.steel, 0.44, 0.02, 0.16, oxMid + 0.35, deckY + 0.9, oz0 + 0.4);
    // Chair: pedestal, pan, back.
    const chairX = oxMid + 0.75;
    cyl(bucket.steel, 0.24, 0.05, chairX, deckY + 0.11, oz0 + 1.18, 'y', 10);
    cyl(bucket.steel, 0.05, 0.36, chairX, deckY + 0.29, oz0 + 1.18, 'y', 8);
    box(bucket.bodyDark, 0.46, 0.09, 0.44, chairX, deckY + 0.51, oz0 + 1.18);
    box(bucket.bodyDark, 0.44, 0.5, 0.09, chairX, deckY + 0.79, oz0 + 1.4);
    // Two filing cabinets and a whiteboard against the blind rear wall.
    for (const lx of [-0.75, -0.15]) {
      box(bucket.steel, 0.52, 1.28, 0.46, oxMid + lx, deckY + 0.73, z1 - 0.58);
      for (const dy of [0.28, 0.72, 1.16]) {
        box(bucket.bodyDark, 0.46, 0.04, 0.03, oxMid + lx, deckY + dy, z1 - 0.36);
      }
    }
    box(bucket.deck, 1.5, 0.9, 0.05, oxMid + 1.2, deckY + 1.72, z1 - 0.36);
    // Its own ceiling light, which is why the window is lit at all.
    box(bucket.tube, 1.6, 0.06, 0.16, oxMid, deckY + 2.5, (oz0 + z1) / 2 - 0.2);
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

