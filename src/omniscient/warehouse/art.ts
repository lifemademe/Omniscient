import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { createRng, jitter, range, seedFrom } from '../core/rng.js';
import { getAccessibilityPreferences } from '../accessibility/preferences.js';
import { createWarehouseLabelGeometry } from './labelGeometry.js';
import {
  WAREHOUSE_LAYOUT,
  WAREHOUSE_SECURITY_ZONE_IDS,
  WAREHOUSE_SECURITY_ZONES,
  warehouseAisleX,
  warehousePackagePosition,
} from './WarehouseLayout.js';
import { WAREHOUSE_DOOR_IDS, WAREHOUSE_DOORS, WarehouseServiceDoor } from './WarehouseServiceDoors.js';
import { WarehouseAutomation } from './WarehouseAutomation.js';
import { WarehouseDaylight } from './WarehouseDaylight.js';
import { WarehouseSetDressing } from './WarehouseSetDressing.js';

import type {
  WarehouseDoorId,
  WarehouseDoorStatus,
  WarehouseLightingMode,
  WarehouseSecurityZoneId,
} from './types.js';

/**
 * The warehouse palette.
 *
 * ## Everything used to be the same green
 *
 * Wall #33403e, steel #506365, dark steel #202b2a, floor #373d3a - four surfaces inside one
 * narrow desaturated teal band, lit by a cyan hemisphere, a cyan moon and fifteen cyan work
 * lights. The whole room came out as one wash, which is what "nothing reads" looks like when
 * the geometry is actually fine.
 *
 * Neutral now, not green. A neutral grey under a warm lamp goes warm and under the moon goes
 * cool, and that difference is the entire picture; a green-grey stays green under both and
 * throws away the only thing the lighting was doing. Cheapest colour work there is - the hex
 * codes barely move, but they stop fighting every light in the room.
 */
const WALL = new THREE.MeshStandardMaterial({ color: '#3a3937', roughness: 0.88, metalness: 0.1 });
const STEEL = new THREE.MeshStandardMaterial({ color: '#5a5f63', roughness: 0.6, metalness: 0.58 });
const DARK_STEEL = new THREE.MeshStandardMaterial({ color: '#23262a', roughness: 0.76, metalness: 0.42 });
const FLOOR = new THREE.MeshStandardMaterial({ color: '#3d3b38', roughness: 0.91, metalness: 0.04 });
const AMBER = new THREE.MeshStandardMaterial({ color: '#8d6c31', emissive: '#39250b', emissiveIntensity: 0.55, roughness: 0.58 });
const RED = new THREE.MeshStandardMaterial({ color: '#6e2d2d', emissive: '#2c0909', emissiveIntensity: 0.6, roughness: 0.62 });
const GREEN = new THREE.MeshStandardMaterial({ color: '#315c42', emissive: '#102b18', emissiveIntensity: 0.45, roughness: 0.62 });
const BELT = new THREE.MeshStandardMaterial({ color: '#151a19', roughness: 0.82, metalness: 0.25 });
/* Softwood, and darker than the board it carries so a load reads as sitting on something. */
const PALLET = new THREE.MeshStandardMaterial({ color: '#8a7248', roughness: 0.96 });
const TAPE_LIGHT = new THREE.MeshStandardMaterial({ color: '#d8c9a4', roughness: 0.72 });
const TAPE_DARK = new THREE.MeshStandardMaterial({ color: '#c3b085', roughness: 0.72 });
/*
 * Stretch wrap. Nearly clear, slightly cool, and it must not write depth - a dozen
 * transparent boxes that do will sort against each other and flicker as the drone moves.
 */
const WRAP = new THREE.MeshPhysicalMaterial({
  color: '#cfe2dc',
  transparent: true,
  opacity: 0.13,
  roughness: 0.22,
  metalness: 0,
  depthWrite: false,
});
/* The guide rails down a conveyor. The strongest readable line in the sortation bay. */
const GUIDE = new THREE.MeshStandardMaterial({ color: '#c8862e', emissive: '#3a2408', emissiveIntensity: 0.5, roughness: 0.62 });
/* The high-bay shades. Double-sided, because an open cone drawn on one side is a hole. */
const SHADE = new THREE.MeshStandardMaterial({ color: '#23262a', roughness: 0.76, metalness: 0.42, side: THREE.DoubleSide });

function mesh(name: string, geometry: THREE.BufferGeometry, material: THREE.Material, position?: THREE.Vector3): ENGINE.MeshNode {
  const node = ENGINE.MeshNode.create({ name, geometry, material, castShadow: true, receiveShadow: true });
  if (position) node.position.copy(position);
  return node;
}

function labelMaterial(text: string, accent = '#d8ffb0', background = '#07100d'): THREE.MeshBasicMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 7;
    ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
    ctx.fillStyle = accent;
    ctx.font = 'bold 104px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return new THREE.MeshBasicMaterial({ map: texture, side: THREE.FrontSide, toneMapped: false });
}

function readableLabelPanel(
  name: string,
  text: string,
  width: number,
  height: number,
  accent: string,
  position: THREE.Vector3
): { root: ENGINE.SceneNode; faces: [ENGINE.MeshNode, ENGINE.MeshNode] } {
  const root = ENGINE.SceneNode.create({ name, position });
  const material = labelMaterial(text, accent);
  const front = mesh(`${name}-Front`, createWarehouseLabelGeometry(width, height), material, new THREE.Vector3(0, 0, 0.012));
  const back = mesh(`${name}-Back`, createWarehouseLabelGeometry(width, height), material, new THREE.Vector3(0, 0, -0.012));
  back.rotation.y = Math.PI;
  root.add(front, back);
  return { root, faces: [front, back] };
}

function boxGeometry(size: THREE.Vector3, position: THREE.Vector3): THREE.BoxGeometry {
  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
  geometry.translate(position.x, position.y, position.z);
  return geometry;
}

function rackGeometry(height = WAREHOUSE_LAYOUT.rack.height, length = WAREHOUSE_LAYOUT.rack.length): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = [];
  for (const z of [-length / 2, -length / 6, length / 6, length / 2]) {
    pieces.push(boxGeometry(new THREE.Vector3(0.11, height, 0.11), new THREE.Vector3(-0.72, height / 2, z)));
    pieces.push(boxGeometry(new THREE.Vector3(0.11, height, 0.11), new THREE.Vector3(0.72, height / 2, z)));
  }
  for (const y of [0.18, 1.55, 2.9, 4.25, 5.48]) {
    pieces.push(boxGeometry(new THREE.Vector3(1.58, 0.11, length), new THREE.Vector3(0, y, 0)));
  }
  return mergeGeometries(pieces, false) ?? new THREE.BoxGeometry(1, 1, 1);
}

function buildRain(root: ENGINE.SceneNode): void {
  const rng = createRng(seedFrom('warehouse-07-rain'));
  const positions = new Float32Array(720 * 3);
  for (let i = 0; i < 720; i++) {
    const lane = i % 3;
    positions[i * 3] = lane === 0
      ? range(rng, -28, 28)
      : lane === 1
        ? range(rng, -28, -24.25)
        : range(rng, 24.25, 28);
    positions[i * 3 + 1] = range(rng, 0, 14);
    positions[i * 3 + 2] = lane === 0 ? range(rng, 29.4, 35.4) : range(rng, -24, 30);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ color: '#91b2bd', size: 0.035, transparent: true, opacity: 0.45 })
  );
  points.name = 'ExteriorRain';
  root.add(points);
}

/*
 * The cold half of the mix, and the number the tick actually uses.
 *
 * Measured before touching it: 82.3% of lit pixels were warm, 2.0% cool, mean R-B bias
 * +46. That is one hue, and one hue is what separates this room from a lit interior that
 * reads as photographed. Nine work lights at intensity 54 were the entire lighting model;
 * the hemisphere meant to answer them sat at 0.6 and could not be seen.
 *
 * Raising it lifts the SHADOWS toward sky colour and leaves the warm key owning everything
 * it actually reaches, which is the ordinary way a warm interior is made to read at night -
 * cool shadow, warm key - rather than desaturating the amber and calling it balance.
 *
 * Named because the first attempt at this edited the constructor and changed nothing at
 * all: the tick below rewrites intensity every frame from its own literal, so the value
 * handed to HemisphereLightNode.create was never live. Two numbers, one of them a lie.
 * There is now one, and the constructor reads it too.
 */
const WAREHOUSE_SKY_FILL = 1.8;

export class WarehouseEnvironment {
  public readonly root = ENGINE.SceneNode.create({ name: 'WarehouseEnvironment' });
  public readonly stationPositions: Readonly<Record<'quarantine' | 'return' | 'hold', THREE.Vector3>> = {
    quarantine: WAREHOUSE_LAYOUT.stations.quarantine.clone(),
    return: WAREHOUSE_LAYOUT.stations.return.clone(),
    hold: WAREHOUSE_LAYOUT.stations.hold.clone(),
  };
  public readonly doorHandoffPositions: Readonly<Record<WarehouseDoorId, THREE.Vector3>> = {
    'service-a': WAREHOUSE_DOORS['service-a'].handoffPosition.clone(),
    'service-b': WAREHOUSE_DOORS['service-b'].handoffPosition.clone(),
    'service-c': WAREHOUSE_DOORS['service-c'].handoffPosition.clone(),
  };
  public rearDoor: ENGINE.MeshNode | null = null;
  public conveyorRollers: ENGINE.SceneNode[] = [];
  private readonly setDressing = new WarehouseSetDressing();
  private readonly daylight = new WarehouseDaylight();
  private readonly automation = new WarehouseAutomation();
  private readonly serviceDoors = new Map<WarehouseDoorId, WarehouseServiceDoor>();
  private duplicateAisleSigns: [ENGINE.MeshNode, ENGINE.MeshNode] | null = null;
  private inboundPackages: ENGINE.MeshNode[] = [];
  private quarantineGate: ENGINE.MeshNode | null = null;
  private readonly securityGates = new Map<WarehouseSecurityZoneId, Array<{ node: ENGINE.MeshNode; openY: number; closedY: number }>>();
  private readonly lockedSecurityZones = new Set<WarehouseSecurityZoneId>();
  private readonly workLights: ENGINE.PointLightNode[] = [];
  private readonly emergencyLights: ENGINE.PointLightNode[] = [];
  private readonly emergencyMaterials: THREE.MeshStandardMaterial[] = [];
  private ambientLight: ENGINE.HemisphereLightNode | null = null;
  private moonLight: ENGINE.DirectionalLightNode | null = null;
  private frontLight: ENGINE.PointLightNode | null = null;
  private fixtureLensMaterial: THREE.MeshStandardMaterial | null = null;
  private lightingMode: WarehouseLightingMode = 'normal';
  private emergencyLevel = 0;
  private rearDoorTarget = 0;
  private clock = 0;
  private conveyorRunning = false;

  public build(): void {
    const { shell } = WAREHOUSE_LAYOUT;
    const floor = mesh('WarehouseFloor', new THREE.BoxGeometry(shell.width, 0.3, shell.length), FLOOR, new THREE.Vector3(0, -0.17, 0));
    this.root.add(floor);

    // Exterior service walks keep CCTV visitors and pursuit actors grounded in the rain.
    this.root.add(
      mesh('WestServiceWalk', new THREE.BoxGeometry(4.2, 0.18, 51), FLOOR, new THREE.Vector3(-26, -0.18, 3.2)),
      mesh('EastServiceWalk', new THREE.BoxGeometry(4.2, 0.18, 51), FLOOR, new THREE.Vector3(26, -0.18, 3.2)),
      mesh('FrontServiceWalk', new THREE.BoxGeometry(52, 0.18, 4.6), FLOOR, new THREE.Vector3(0, -0.18, 31.1))
    );

    // The daylight module owns the wall panels so its clerestory band is a true opening.
    this.daylight.build();
    this.root.add(
      this.daylight.root,
      mesh('Roof', new THREE.BoxGeometry(shell.width, 0.3, shell.length), DARK_STEEL, new THREE.Vector3(0, shell.roofY, 0))
    );

    const rearDoor = mesh('RearLoadingDoor', new THREE.BoxGeometry(11.2, 6, 0.22), STEEL, new THREE.Vector3(0, 3, shell.rearZ + 0.2));
    this.rearDoor = rearDoor;
    this.root.add(rearDoor);

    this.buildRacks();
    this.buildServiceDoors();
    this.buildStations();
    this.buildConveyors();
    this.buildSecurityZones();
    this.buildTruck();
    this.buildLights();
    this.buildFloorWear();
    this.buildDressing();
    this.automation.build();
    this.root.add(this.automation.root);
    this.setDressing.build();
    this.root.add(this.setDressing.root);
    buildRain(this.root);
  }

  private buildRacks(): void {
    const rng = createRng(seedFrom('warehouse-racks'));
    for (const [index, x] of WAREHOUSE_LAYOUT.rack.centers.entries()) {
      const aisle = index + 1;
      const rack = mesh(`Rack-${aisle}`, rackGeometry(), STEEL, new THREE.Vector3(x, 0, WAREHOUSE_LAYOUT.rack.centerZ));
      this.root.add(rack);
      /**
       * 8.55, not 7.2 - the aisle numbers were being eclipsed by the light fittings.
       *
       * Reported as a large dark ceiling panel hiding the numbers from one side, and the
       * geometry checks out exactly: a fixture shade hangs at y 9.35 in the z=20 row, the
       * sign hung at 7.2 at z=15.4, and from a drone at working height mid-aisle the two
       * lie on the same sight line - the shade sat squarely in front of the number for the
       * whole approach from the building's middle. From the other side there is no fixture
       * row in the way, hence "only from one side".
       *
       * Raising the sign steepens its angle faster than the shade's, so the eclipse point
       * retreats to the far rear wall where the fog already owns it. z moves off the
       * fixture row's line for the same reason.
       */
      const signRoot = ENGINE.SceneNode.create({
        name: `AisleSign-${aisle}`,
        position: new THREE.Vector3(x, 8.55, 16.2),
      });
      const frame = mesh(
        'SignFrame',
        new THREE.BoxGeometry(1.58, 0.84, 0.08),
        DARK_STEEL
      );
      const leftHanger = mesh('SignHanger', new THREE.BoxGeometry(0.035, 1.25, 0.035), STEEL, new THREE.Vector3(-0.48, 0.82, 0));
      const rightHanger = mesh('SignHanger', new THREE.BoxGeometry(0.035, 1.25, 0.035), STEEL, new THREE.Vector3(0.48, 0.82, 0));
      const front = mesh(
        'SignFace-Front',
        createWarehouseLabelGeometry(1.45, 0.72),
        labelMaterial(String(aisle), aisle === 5 ? '#e0a24c' : '#d8ffb0'),
        new THREE.Vector3(0, 0, 0.045)
      );
      const back = mesh(
        'SignFace-Back',
        createWarehouseLabelGeometry(1.45, 0.72),
        labelMaterial(String(aisle), aisle === 5 ? '#e0a24c' : '#d8ffb0'),
        new THREE.Vector3(0, 0, -0.045)
      );
      back.rotation.y = Math.PI;
      signRoot.add(frame, front, back, leftHanger, rightHanger);
      if (aisle === 4) this.duplicateAisleSigns = [front, back];
      this.root.add(signRoot);
      /**
       * The rack, loaded like a rack rather than filled like a spreadsheet.
       *
       * It was 24 cartons on a strict four-by-six grid, one per slot, all within a few
       * centimetres of each other in size. Regularity at that scale is the loudest "this was
       * generated" signal a set can send - the eye finds the period immediately, and once it
       * has, every aisle in the building is the same aisle.
       *
       * Four things break it, and each is true of a working warehouse rather than merely
       * random:
       *
       *  - EMPTY BAYS. A warehouse that is completely full is one that has stopped trading.
       *    About one slot in six is bare decking, and the gaps are what let you see through a
       *    rack into the next aisle - most of the depth in any shot of one.
       *  - PALLETS. Nothing sits on steel decking, and the 14cm dark band under every load is
       *    what makes a stack look supported rather than floating.
       *  - VARIED HEIGHT. One, two or three cartons, because loads are whatever the supplier
       *    sent. A level where every load is the same height reads as a shelf of one product.
       *  - SHRINK WRAP on about a quarter of them, which is the detail that says somebody
       *    prepared these for transport.
       *
       * Seeded off the aisle, so a rack is the same rack every run. That matters more here
       * than the usual §123 reasons: the mission asks the player to remember where 2034 was.
       *
       * ## Merged, and this is not an optimisation afterthought
       *
       * Built as individual nodes this is about 450 meshes across five aisles - roughly 90
       * draw calls an aisle for scenery that never moves a millimetre. The implementation
       * plan asks for exactly this ("instance repeated racks, lights, crates and fittings;
       * merge static decoration by material") against a 60 FPS target at 1080p, and the
       * variety above is what makes merging both necessary and free: every carton needs its
       * own size and position, none of them needs its own draw call.
       *
       * Six buckets, one mesh each per aisle. The three carton shades stay separate because
       * they are three materials; everything else collapses.
       */
      const bucket = {
        pallet: [] as THREE.BufferGeometry[],
        wrap: [] as THREE.BufferGeometry[],
        tapeLight: [] as THREE.BufferGeometry[],
        tapeDark: [] as THREE.BufferGeometry[],
        carton: [[], [], []] as THREE.BufferGeometry[][],
      };
      const BAY_Z = [-10.7, -6, -1.3, 3.4, 8.1, 12.8];
      const LEVEL_Y = [0.55, 1.9, 3.25, 4.6];
      for (const [bayIndex, bayZ] of BAY_Z.entries()) {
        for (const [level, levelY] of LEVEL_Y.entries()) {
          // Never the bottom of a bay: a rack with a hole at floor level reads as broken
          // rather than as busy.
          if (level > 0 && rng() < 0.17) continue;

          const side = (bayIndex + level) % 2 ? 0.27 : -0.24;
          const px = x + side * 0.4;
          const pz = bayZ + jitter(rng, 0.1);

          const pallet = new THREE.BoxGeometry(1.18, 0.14, 1.06);
          pallet.translate(px, levelY - 0.14, pz);
          bucket.pallet.push(pallet);

          const load = 1 + Math.floor(rng() * 3);
          const wrapped = rng() < 0.26;
          for (let tier = 0; tier < load; tier++) {
            const height = 0.52 + rng() * 0.26;
            const cx = px + jitter(rng, 0.07);
            const cy = levelY + tier * 0.68 + height * 0.5 - 0.26;
            const cz = pz + jitter(rng, 0.07);
            const depth = 0.6 + rng() * 0.26;

            const carton = new THREE.BoxGeometry(0.66 + rng() * 0.3, height, depth);
            carton.translate(cx, cy, cz);
            bucket.carton[Math.floor(rng() * 3)].push(carton);

            // Tape down the middle, on most of them but not all - a box nobody has opened.
            if (rng() < 0.62) {
              const tape = new THREE.BoxGeometry(0.072, height + 0.012, depth + 0.012);
              tape.translate(cx, cy, cz);
              (rng() < 0.5 ? bucket.tapeLight : bucket.tapeDark).push(tape);
            }
          }
          if (wrapped && load > 1) {
            const wrap = new THREE.BoxGeometry(1.06, load * 0.68 + 0.06, 0.98);
            wrap.translate(px, levelY + (load * 0.68) / 2 - 0.2, pz);
            bucket.wrap.push(wrap);
          }
        }
      }

      const CARTONS = [
        new THREE.MeshStandardMaterial({ color: '#c2a274', roughness: 0.95 }),
        new THREE.MeshStandardMaterial({ color: '#ac9068', roughness: 0.95 }),
        new THREE.MeshStandardMaterial({ color: '#b79b6e', roughness: 0.95 }),
      ];
      const merged: Array<[string, THREE.BufferGeometry[], THREE.Material]> = [
        [`RackPallets-${aisle}`, bucket.pallet, PALLET],
        [`RackTapeLight-${aisle}`, bucket.tapeLight, TAPE_LIGHT],
        [`RackTapeDark-${aisle}`, bucket.tapeDark, TAPE_DARK],
        [`RackWrap-${aisle}`, bucket.wrap, WRAP],
        ...bucket.carton.map(
          (pieces, index) =>
            [`RackCartons-${aisle}-${index}`, pieces, CARTONS[index]] as [string, THREE.BufferGeometry[], THREE.Material]
        ),
      ];
      for (const [name, pieces, material] of merged) {
        if (!pieces.length) continue;
        const geometry = mergeGeometries(pieces, false);
        if (geometry) this.root.add(mesh(name, geometry, material));
      }
      for (const [index, z] of [-10.4, -4.2, 2, 8.2].entries()) {
        const rangeEnd = index === 3 ? 99 : (index + 1) * 25;
        const rangeLabel = `${String(index * 25 + 1).padStart(2, '0')}-${String(rangeEnd).padStart(2, '0')}`;
        for (const side of [-1, 1]) {
          /*
           * Bigger, warmer, and lower.
           *
           * A package address in this mission is spatial - 2034 is aisle 2, bay 34 - so these
           * four panels per aisle are the only thing standing between the player and the
           * whole navigation loop. They were 0.76 by 0.24 metres in a muted green at 2.5m,
           * which is a sticker: unreadable from the aisle mouth, which is exactly where
           * somebody stands when they are deciding which way to fly.
           *
           * 1.34 by 0.42 in the amber this game uses for wayfinding, dropped to 1.95 so it is
           * nearer eye level for a drone. Same information, legible from the end of the run.
           */
          const bay = readableLabelPanel(
            `BayRange-${aisle}-${index + 1}-${side < 0 ? 'L' : 'R'}`,
            rangeLabel,
            1.34,
            0.42,
            '#e0a24c',
            new THREE.Vector3(x + side * 0.79, 1.95, z)
          );
          bay.root.rotation.y = side < 0 ? -Math.PI / 2 : Math.PI / 2;
          this.root.add(bay.root);
        }
      }
      for (const z of [-12.2, 14.2]) {
        const guard = mesh(
          `RackEndGuard-${aisle}`,
          new THREE.BoxGeometry(1.92, 0.42, 0.2),
          AMBER,
          new THREE.Vector3(x, 0.21, z)
        );
        this.root.add(guard);
      }
    }
  }

  private buildStations(): void {
    const stationData: Array<['quarantine' | 'return' | 'hold', string, THREE.Material, number]> = [
      ['quarantine', 'QUARANTINE', RED, Math.PI],
      ['return', 'RETURN', AMBER, Math.PI],
      ['hold', 'HOLD BAY', AMBER, -Math.PI / 2],
    ];
    for (const [id, label, material, facing] of stationData) {
      const position = this.stationPositions[id];
      const frame = mesh(`Station-${id}`, new THREE.BoxGeometry(id === 'hold' ? 3.4 : 4.2, 0.35, 2.6), material, position.clone().setY(0.15));
      const plate = mesh(`StationLabel-${id}`, createWarehouseLabelGeometry(id === 'hold' ? 2.4 : 3.1, 0.52), labelMaterial(label, id === 'quarantine' ? '#e49a84' : '#d8ffb0'), new THREE.Vector3(position.x, 0.332, position.z));
      plate.rotation.set(-Math.PI / 2, 0, facing);
      this.root.add(frame, plate);
      if (id === 'quarantine') {
        for (const dx of [-2.05, 2.05]) {
          this.root.add(mesh('QuarantinePost', new THREE.BoxGeometry(0.09, 2.8, 0.09), STEEL, new THREE.Vector3(position.x + dx, 1.4, position.z)));
        }
        const gate = mesh('QuarantineGate', new THREE.BoxGeometry(4.1, 0.1, 0.1), RED, new THREE.Vector3(position.x, 2.75, position.z - 1.15));
        gate.scale.x = 0;
        this.quarantineGate = gate;
        this.root.add(gate);
      }
    }
    for (const id of WAREHOUSE_DOOR_IDS) {
      const layout = WAREHOUSE_DOORS[id];
      const position = this.doorHandoffPositions[id];
      const platform = mesh(`DoorHandoff-${layout.letter}`, new THREE.BoxGeometry(3.35, 0.28, 2.5), GREEN, position.clone().setY(0.14));
      const plate = mesh(
        `DoorHandoffLabel-${layout.letter}`,
        createWarehouseLabelGeometry(2.65, 0.5),
        labelMaterial(`${layout.letter} RELEASE`, '#d8ffb0'),
        new THREE.Vector3(position.x, 0.31, position.z)
      );
      const facing = id === 'service-a' ? Math.PI / 2 : id === 'service-b' ? Math.PI : -Math.PI / 2;
      plate.rotation.set(-Math.PI / 2, 0, facing);
      this.root.add(platform, plate);
    }
  }

  private buildServiceDoors(): void {
    for (const id of WAREHOUSE_DOOR_IDS) {
      const serviceDoor = new WarehouseServiceDoor(WAREHOUSE_DOORS[id]);
      this.serviceDoors.set(id, serviceDoor);
      this.root.add(serviceDoor.root);
    }
  }

  private buildConveyors(): void {
    const xs = WAREHOUSE_LAYOUT.sortation.conveyorX;
    const labels = ['LOCAL', 'REGIONAL', 'LONG-HAUL'];
    for (let lane = 0; lane < xs.length; lane++) {
      const laneRoot = ENGINE.SceneNode.create({
        name: `Conveyor-${labels[lane]}`,
        position: new THREE.Vector3(xs[lane], 0, WAREHOUSE_LAYOUT.sortation.centerZ),
      });
      laneRoot.add(mesh('Belt', new THREE.BoxGeometry(1.72, 0.28, WAREHOUSE_LAYOUT.sortation.conveyorLength), BELT, new THREE.Vector3(0, 0.65, 0)));
      for (let roller = 0; roller < 31; roller++) {
        const rollerNode = mesh('Roller', new THREE.CylinderGeometry(0.095, 0.095, 1.58, 10), STEEL, new THREE.Vector3(0, 0.86, -9.65 + roller * 0.645));
        rollerNode.rotation.z = Math.PI / 2;
        laneRoot.add(rollerNode);
        this.conveyorRollers.push(rollerNode);
      }
      /*
       * Guide rails, and they are the reason a conveyor reads as a conveyor.
       *
       * The belt was a dark box with steel rollers on it - correct, and at any distance a
       * dark stripe on a dark floor. Every reference photograph of a sortation bay has the
       * same thing doing the work: a pair of painted rails running the length of the run,
       * catching the light along their whole top edge. It is a continuous line where
       * everything else in the room is a repeated object, which is what makes it read
       * instantly and from anywhere.
       *
       * Amber, because that is this game's colour for a working system, and because the
       * three lanes are a decision the player has to make at a glance.
       */
      for (const rail of [-0.92, 0.92]) {
        laneRoot.add(
          mesh('ConveyorGuide', new THREE.BoxGeometry(0.09, 0.2, WAREHOUSE_LAYOUT.sortation.conveyorLength), GUIDE, new THREE.Vector3(rail, 0.94, 0)),
          mesh('ConveyorGuideFoot', new THREE.BoxGeometry(0.07, 0.36, WAREHOUSE_LAYOUT.sortation.conveyorLength), DARK_STEEL, new THREE.Vector3(rail, 0.68, 0))
        );
      }
      for (const z of [-8.5, -2.8, 2.8, 8.5]) {
        laneRoot.add(
          mesh('ConveyorLeg', new THREE.BoxGeometry(0.1, 0.72, 0.1), STEEL, new THREE.Vector3(-0.72, 0.35, z)),
          mesh('ConveyorLeg', new THREE.BoxGeometry(0.1, 0.72, 0.1), STEEL, new THREE.Vector3(0.72, 0.35, z))
        );
      }
      const label = readableLabelPanel('ConveyorLabel', labels[lane], 1.62, 0.52, '#e0a24c', new THREE.Vector3(0, 1.55, 10.18));
      laneRoot.add(label.root);
      this.root.add(laneRoot);
    }

    // The sorting hall is a destination, not an obstacle immediately inside the dock.
    const fenceMaterial = new THREE.MeshStandardMaterial({ color: '#344a48', roughness: 0.66, metalness: 0.72, wireframe: true });
    this.root.add(
      mesh('SortationFenceWestRear', new THREE.BoxGeometry(0.1, 2.35, 8.2), fenceMaterial, new THREE.Vector3(15.55, 1.18, -9.9)),
      mesh('SortationFenceWestFront', new THREE.BoxGeometry(0.1, 2.35, 8.2), fenceMaterial, new THREE.Vector3(15.55, 1.18, 8.9)),
      mesh('SortationInspectionTable', new THREE.BoxGeometry(5.9, 0.18, 1.7), STEEL, new THREE.Vector3(19.6, 1.05, 12.35)),
      mesh('SortationTableShelf', new THREE.BoxGeometry(5.4, 0.12, 1.35), DARK_STEEL, new THREE.Vector3(19.6, 0.42, 12.35)),
      mesh('SortationCatwalk', new THREE.BoxGeometry(7.6, 0.22, 12), DARK_STEEL, new THREE.Vector3(19.55, 6.4, -1.2))
    );
    for (const z of [-6.3, -1.2, 3.9]) {
      this.root.add(
        mesh('CatwalkSupport', new THREE.BoxGeometry(0.16, 6.3, 0.16), STEEL, new THREE.Vector3(16.05, 3.15, z)),
        mesh('CatwalkSupport', new THREE.BoxGeometry(0.16, 6.3, 0.16), STEEL, new THREE.Vector3(23.05, 3.15, z))
      );
    }
    for (const x of [16.15, 23]) {
      this.root.add(mesh('CatwalkRail', new THREE.BoxGeometry(0.08, 0.08, 12), AMBER, new THREE.Vector3(x, 7.35, -1.2)));
    }
  }

  private buildSecurityZones(): void {
    const gateMaterial = new THREE.MeshStandardMaterial({ color: '#18211f', roughness: 0.58, metalness: 0.78 });
    const addGate = (zone: WarehouseSecurityZoneId, name: string, width: number, x: number, z: number): void => {
      const node = mesh(name, new THREE.BoxGeometry(width, 5.8, 0.16), gateMaterial, new THREE.Vector3(x, 9.2, z));
      this.root.add(node);
      const gates = this.securityGates.get(zone) ?? [];
      gates.push({ node, openY: 9.2, closedY: 2.9 });
      this.securityGates.set(zone, gates);
    };
    addGate('receiving', 'ReceivingSecurityGate-West', 17.2, -13.5, -14.45);
    addGate('receiving', 'ReceivingSecurityGate-East', 17.2, 5.2, -14.45);
    addGate('storage-west', 'StorageWestSecurityGate-Rear', 19.4, -12.2, -14.15);
    addGate('storage-west', 'StorageWestSecurityGate-Front', 19.4, -12.2, 15.55);
    addGate('storage-east', 'StorageEastSecurityGate-Rear', 16.8, 6.3, -14.15);
    addGate('storage-east', 'StorageEastSecurityGate-Front', 16.8, 6.3, 15.55);
    addGate('sortation', 'SortationSecurityGate-Rear', 7.7, 19.55, -14.25);
    addGate('sortation', 'SortationSecurityGate-Front', 7.7, 19.55, 14.25);

    for (const id of WAREHOUSE_SECURITY_ZONE_IDS) {
      const zone = WAREHOUSE_SECURITY_ZONES[id];
      const label = readableLabelPanel(
        `SecurityZone-${zone.label}`,
        `${zone.shortLabel} // ${zone.label}`,
        3.9,
        0.58,
        '#df6b5c',
        new THREE.Vector3(
          (zone.bounds.minX + zone.bounds.maxX) / 2,
          8.35,
          id === 'receiving' ? -14.25 : zone.bounds.maxZ
        )
      );
      this.root.add(label.root);
    }
  }

  private buildTruck(): void {
    const truck = ENGINE.SceneNode.create({ name: 'InboundTruck', position: WAREHOUSE_LAYOUT.truck.clone() });
    truck.add(
      mesh('Trailer', new THREE.BoxGeometry(9.5, 5.3, 8.5), new THREE.MeshStandardMaterial({ color: '#273538', roughness: 0.78, metalness: 0.3 }), new THREE.Vector3(0, 3.0, -2.5)),
      mesh('TrailerDark', new THREE.BoxGeometry(8.9, 4.7, 0.15), DARK_STEEL, new THREE.Vector3(0, 3, 1.78)),
      mesh('RearBumper', new THREE.BoxGeometry(9.6, 0.32, 0.34), STEEL, new THREE.Vector3(0, 0.45, 1.92)),
      mesh('DockSeal', new THREE.BoxGeometry(10.1, 5.8, 0.26), new THREE.MeshStandardMaterial({ color: '#111615', roughness: 0.98 }), new THREE.Vector3(0, 3.0, 2.0))
    );
    for (const x of [-3.75, 3.75]) {
      for (const z of [-4.8, -2.9]) {
        const wheel = mesh('TruckWheel', new THREE.CylinderGeometry(0.72, 0.72, 0.38, 18), new THREE.MeshStandardMaterial({ color: '#080a09', roughness: 1 }), new THREE.Vector3(x, 0.72, z));
        wheel.rotation.z = Math.PI / 2;
        truck.add(wheel);
      }
      const tail = mesh(
        'TruckTailLamp',
        new THREE.BoxGeometry(0.42, 0.22, 0.06),
        new THREE.MeshStandardMaterial({ color: '#a33e32', emissive: '#6a130d', emissiveIntensity: 2.2, roughness: 0.32 }),
        new THREE.Vector3(x, 1.05, 1.94)
      );
      truck.add(tail);
    }
    this.root.add(truck);
  }

  private buildLights(): void {
    /**
     * ## The hemisphere was the thing flattening the room
     *
     * 1.9 of directionless fill, and an ambient has no direction by definition - so every
     * shadow in the building was lifted to roughly the value of every lit surface. Same fault,
     * same number, same symptom as the beacon mast sitting at `daylight` 1: a scene that looks
     * deliberate and measures flat.
     *
     * 0.6, and the sky term goes properly cold while the ground bounce goes warm. That is what
     * a night interior does - cold light down the roof lights, warm light back off a concrete
     * floor under sodium - and it means the ambient itself now carries a little of the
     * warm/cool split rather than washing it out.
     */
    this.ambientLight = ENGINE.HemisphereLightNode.create({ name: 'WarehouseAmbient', color: '#93b4c6', groundColor: '#38302a', intensity: WAREHOUSE_SKY_FILL });
    this.moonLight = ENGINE.DirectionalLightNode.create({
      name: 'WarehouseMoon',
      color: '#a9d0d7',
      // Up from 1.35: with the hemisphere down by two thirds this is the light doing the
      // silhouette work, and it is the only cold key in the building.
      intensity: 1.7,
      position: new THREE.Vector3(-18, 24, 15),
      castShadow: true,
      shadowMapSize: 2048,
      shadowFar: 95,
      shadowNormalBias: 0.025,
      shadowBias: -0.0004,
    });
    this.root.add(this.ambientLight, this.moonLight);
    /*
     * The fixture has to look like the source of the light under it.
     *
     * It was a pale green lens at 1.15 emissive, which reads as a panel that happens to be
     * slightly brighter than the ceiling. Thirty of them across the roof and not one of them
     * looked switched on. Warm and hot enough to be the brightest thing up there, because a
     * pool on the floor with nothing above it is a decal.
     */
    const fixtureLens = new THREE.MeshStandardMaterial({
      color: '#e8d3ab',
      emissive: '#ffbe72',
      emissiveIntensity: 2.8,
      roughness: 0.38,
      metalness: 0.12,
    });
    this.fixtureLensMaterial = fixtureLens;
    for (const [xIndex, x] of [-20, -12, -4, 4, 12, 20].entries()) {
      for (const [zIndex, z] of [-20, -10, 0, 10, 20].entries()) {
        /**
         * High bays that hang, rather than strips flush with the roof.
         *
         * Measured, the ceiling band came out at median luma 6 - a black void across the top
         * third of every shot - because a 55mm-deep strip pressed against a dark roof ten
         * metres up has no silhouette and no side to catch anything. The reference shots of
         * real warehouses all have the same thing going on up there: a row of deep shades on
         * stems, receding, and it is most of what tells you the building is tall.
         *
         * A stem, a conical shade and a lens under it. The shade is deliberately DARK on the
         * outside and the lens is hot - that pairing is the whole read, because a lamp is a
         * bright thing inside a dark thing, and a fixture that glows all over is a floating
         * rectangle.
         *
         * Hung to 9.05, which is 70cm below the roof and still 70cm above the drone's ceiling
         * at 8.35 - close enough to be objects in the room rather than texture on it, clear
         * enough that nobody flies into one.
         */
        const stem = mesh('CeilingFixtureStem', new THREE.CylinderGeometry(0.045, 0.045, 0.62, 6), DARK_STEEL, new THREE.Vector3(x, 9.9, z));
        /*
         * DoubleSide, because an open-ended cone is a hole from the inside: back faces are not
         * drawn, so a camera in here sees straight through the building and renders black. The
         * clamp in WarehouseRig stops the lens getting in at all; this makes the geometry safe
         * on its own terms as well, on a fault whose symptom is the entire screen going out.
         */
        /*
         * 0.62 rather than 0.86. At 0.86 the thirty shades were the "large dark panels" in
         * the report - from below at a shallow angle an open cone reads as a solid disc
         * nearly two metres wide, and five of them in a row eclipsed whole signs. 0.62
         * keeps the bright-thing-inside-dark-thing read and takes half the silhouette area
         * off it.
         */
        const shade = mesh(
          'CeilingFixtureShade',
          new THREE.CylinderGeometry(0.18, 0.62, 0.4, 12, 1, true),
          SHADE,
          new THREE.Vector3(x, 9.35, z)
        );
        const lens = mesh('CeilingFixtureLens', new THREE.CylinderGeometry(0.56, 0.56, 0.05, 12), fixtureLens, new THREE.Vector3(x, 9.16, z));
        this.root.add(stem, shade, lens);
        /*
         * Nine lamps, not fifteen.
         *
         * The checkerboard put a light under every other fixture on a six-by-five grid. At the
         * old decay of 1.65 that was defensible - each pool was small and they barely met - but
         * at 1.2 over 26 metres they overlap three deep, so most of the fifteen were paying
         * full shader cost to brighten ground another lamp had already covered.
         *
         * Every other row AND column is nine, still 8-10m apart, with the intensity below
         * making up the difference. The room looks the same and every lit material in it
         * compiles a shorter shader - which matters in a scene that also runs ten clerestory
         * lights, six door lights, four zone lights and two shadow-casting directionals.
         */
        if (xIndex % 2 === 0 && zIndex % 2 === 0) {
          /**
           * High bay lamps, and they are WARM.
           *
           * They were #c4ddd1 - the same pale cyan as the hemisphere and the moon. Three
           * light sources of one colour is one light source: nothing in the room could be
           * warm, nothing could be cold, and there was no separation left for anything to
           * read against.
           *
           * Sodium and metal halide are warm, which is both true of a real warehouse at night
           * and the thing this set needs most: warm pools on a neutral floor, cold moonlight
           * through the roof, and the amber floor markings and cardboard finally sitting in
           * light that agrees with them. It is the same split the game already runs on -
           * amber for what is lit and working, cyan for what the machine is looking through.
           */
          const workLight = ENGINE.PointLightNode.create({
            name: 'WarehouseWorkLight',
            color: '#ffbe78',
            /*
             * ## Decay, not intensity, is the lever
             *
             * Measured after the first pass: 55% of the frame was under luma 25 and the floor
             * came out at median 23 - the pools were not reaching the ground the lamps hang
             * over. At decay 1.65 the falloff from 9.45m up is a factor of about 41, so an
             * intensity of 27 arrives as 0.66 at the floor. Turning the number up fixes the
             * floor and blows out the ceiling, because the same curve is steepest where the
             * lamp is.
             *
             * 1.2 flattens the curve: the same lamp arrives at about 2.6 on the floor - four
             * times brighter - while barely changing at head height. That is also what a high
             * bay with a reflector physically does, which is why it looks right rather than
             * merely brighter: the fitting exists to stop the light behaving like a bare bulb.
             */
            intensity: 54,
            distance: 26,
            decay: 1.2,
            position: new THREE.Vector3(x, 9.45, z),
          });
          this.workLights.push(workLight);
          this.root.add(workLight);
        }
      }
    }
    this.frontLight = ENGINE.PointLightNode.create({ name: 'FrontSodium', color: '#e0a24c', intensity: 35, distance: 20, decay: 1.55, position: new THREE.Vector3(0, 5.2, 27) });
    this.root.add(this.frontLight);

    for (const [index, id] of WAREHOUSE_SECURITY_ZONE_IDS.entries()) {
      const zone = WAREHOUSE_SECURITY_ZONES[id];
      const material = new THREE.MeshStandardMaterial({
        color: '#5b1714',
        emissive: '#ff2e24',
        emissiveIntensity: 0,
        roughness: 0.34,
        metalness: 0.18,
      });
      this.emergencyMaterials.push(material);
      const centerX = (zone.bounds.minX + zone.bounds.maxX) / 2;
      const centerZ = (zone.bounds.minZ + zone.bounds.maxZ) / 2;
      for (const offset of [-5.4, 0, 5.4]) {
        const alongX = id === 'receiving';
        const batten = mesh(
          `EmergencyBatten-${zone.label}`,
          new THREE.BoxGeometry(alongX ? 3.1 : 0.38, 0.08, alongX ? 0.38 : 3.1),
          material,
          new THREE.Vector3(alongX ? centerX + offset : centerX, 9.68, alongX ? centerZ : centerZ + offset)
        );
        this.root.add(batten);
      }
      const emergencyLight = ENGINE.PointLightNode.create({
        name: `EmergencyZoneLight-${zone.label}`,
        color: index % 2 ? '#ff352c' : '#e93228',
        intensity: 0,
        distance: 18,
        decay: 1.7,
        position: new THREE.Vector3(centerX, 7.4, centerZ),
      });
      this.emergencyLights.push(emergencyLight);
      this.root.add(emergencyLight);
    }
  }

  /**
   * The floor, which was the largest surface in frame and the emptiest.
   *
   * It was a flat plane with five short stripes near the front door - about two square metres
   * of intent across a 48x58 room. Everything the eye uses to judge the scale of an interior
   * lives on its floor: where traffic goes, where you may not stand, how long the place has
   * been working. None of that was there, so the aisles read as corridors of cardboard with
   * nothing underneath them.
   *
   * ## Painted geometry rather than a floor texture
   *
   * A canvas map is the usual answer and it is the wrong one here. The retro pass quantises
   * the whole picture to a coarse pixel grid, so fine texture detail is destroyed before the
   * player sees it, and a map stretched over 48 metres would be a handful of pixels per metre
   * anyway. Flat quads survive the grid because they are the same shapes the grid is made of -
   * which is also how the drains and the front safety lane in this file were already built.
   *
   * Merged per material, one draw call each, for the same reason the racks are.
   *
   * ## The wear runs cool
   *
   * Polished concrete under traffic is a mirror for whatever is above it, and what is above it
   * here is now the cold clerestory - see CLERESTORY_NIGHT. Making the traffic strips lean
   * cool is both what a worn floor does and a second place for the room's cold half to land,
   * which is what stops the two temperatures reading as a trick done once at the windows.
   */
  private buildFloorWear(): void {
    const rack = WAREHOUSE_LAYOUT.rack;
    const zFrom = rack.centerZ - rack.length / 2 - 1.4;
    const zTo = rack.centerZ + rack.length / 2 + 1.4;
    const runLength = zTo - zFrom;
    const runCentre = (zFrom + zTo) / 2;

    /*
     * Aisle centres, derived from the rack centres rather than written out. The gaps BETWEEN
     * racks are where people walk, plus one outboard run down each wall. Deriving it means a
     * layout change moves the paint with the racking instead of leaving it behind.
     */
    const lanes: number[] = [];
    for (let index = 0; index < rack.centers.length - 1; index++) {
      lanes.push((rack.centers[index]! + rack.centers[index + 1]!) / 2);
    }
    lanes.push(rack.centers[0]! - rack.spacing / 2, rack.centers[rack.centers.length - 1]! + rack.spacing / 2);

    const wear: THREE.BufferGeometry[] = [];
    const paint: THREE.BufferGeometry[] = [];
    for (const x of lanes) {
      const track = new THREE.PlaneGeometry(3.1, runLength);
      track.rotateX(-Math.PI / 2);
      track.translate(x, 0.006, runCentre);
      wear.push(track);
      for (const offset of [-1.72, 1.72]) {
        const line = new THREE.PlaneGeometry(0.14, runLength);
        line.rotateX(-Math.PI / 2);
        line.translate(x + offset, 0.011, runCentre);
        paint.push(line);
      }
    }

    // The cross aisle at the front, where the drone launches and the handoffs happen.
    const cross = new THREE.PlaneGeometry(WAREHOUSE_LAYOUT.shell.width - 4, 3.4);
    cross.rotateX(-Math.PI / 2);
    cross.translate(0, 0.006, 18.6);
    wear.push(cross);
    for (const z of [16.9, 20.3]) {
      const line = new THREE.PlaneGeometry(WAREHOUSE_LAYOUT.shell.width - 4, 0.14);
      line.rotateX(-Math.PI / 2);
      line.translate(0, 0.011, z);
      paint.push(line);
    }

    /*
     * Hatching at the stations: the one floor marking that means "do not put anything here",
     * and the three places in this room where that is true.
     */
    for (const station of [
      WAREHOUSE_LAYOUT.stations.quarantine,
      WAREHOUSE_LAYOUT.stations.return,
      WAREHOUSE_LAYOUT.stations.hold,
    ]) {
      for (let bar = -2; bar <= 2; bar++) {
        const hatch = new THREE.PlaneGeometry(0.16, 2.6);
        hatch.rotateX(-Math.PI / 2);
        hatch.rotateY(Math.PI / 4);
        hatch.translate(station.x + bar * 0.62, 0.01, station.z);
        paint.push(hatch);
      }
    }

    const wearMerged = mergeGeometries(wear, false);
    if (wearMerged) {
      this.root.add(
        mesh(
          'FloorWear',
          wearMerged,
          new THREE.MeshStandardMaterial({ color: '#43464a', roughness: 0.62, metalness: 0.12 })
        )
      );
    }
    const paintMerged = mergeGeometries(paint, false);
    if (paintMerged) {
      this.root.add(
        mesh(
          'FloorPaint',
          paintMerged,
          new THREE.MeshStandardMaterial({ color: '#8a6a2d', roughness: 0.82, metalness: 0.05 })
        )
      );
    }

    // The original front-door stripes, kept: they mark the cradle apron specifically.
    for (const x of [-21.5, -7, 0, 7, 21.5]) {
      const stripe = mesh('SafetyLane', new THREE.PlaneGeometry(4.2, 0.18), new THREE.MeshBasicMaterial({ color: '#8a6a2d' }), new THREE.Vector3(x, 0.012, 22.2));
      stripe.rotation.x = -Math.PI / 2;
      this.root.add(stripe);
    }
  }

  private buildDressing(): void {
    // A readable functional silhouette: cradle at the front, surveillance in all corners,
    // and safety hardware around the loading routes.
    const cradle = ENGINE.SceneNode.create({ name: 'DroneCradle', position: WAREHOUSE_LAYOUT.cradle.clone() });
    cradle.add(
      mesh('CradleBase', new THREE.CylinderGeometry(0.75, 0.9, 0.24, 12), DARK_STEEL, new THREE.Vector3(0, 0.12, 0)),
      mesh('CradleRing', new THREE.TorusGeometry(0.58, 0.07, 8, 18), AMBER, new THREE.Vector3(0, 0.34, 0))
    );
    cradle.getObjectByName('CradleRing')?.rotateX(Math.PI / 2);
    this.root.add(cradle);

    for (const [index, [x, z, turn]] of [
      [-22.4, 27.2, Math.PI * 0.76],
      [22.4, 27.2, -Math.PI * 0.76],
      [-22.4, -27.2, Math.PI * 0.24],
      [22.4, -27.2, -Math.PI * 0.24],
    ].entries()) {
      const camera = ENGINE.SceneNode.create({ name: `CCTV-${index + 1}`, position: new THREE.Vector3(x, 9.1, z), rotation: new THREE.Euler(0, turn, 0) });
      camera.add(
        mesh('CCTVArm', new THREE.BoxGeometry(0.12, 0.12, 0.58), STEEL, new THREE.Vector3(0, 0, 0.22)),
        mesh('CCTVBody', new THREE.BoxGeometry(0.42, 0.28, 0.62), WALL, new THREE.Vector3(0, -0.08, 0.6)),
        mesh('CCTVLens', new THREE.CylinderGeometry(0.11, 0.11, 0.05, 14), new THREE.MeshBasicMaterial({ color: '#8dc7b3' }), new THREE.Vector3(0, -0.08, 0.93))
      );
      camera.getObjectByName('CCTVLens')?.rotateX(Math.PI / 2);
      this.root.add(camera);
    }

    for (const x of [-22, -19.8, 19.8, 22]) {
      this.root.add(mesh('SafetyBollard', new THREE.CylinderGeometry(0.14, 0.14, 1.2, 10), AMBER, new THREE.Vector3(x, 0.6, 22.1)));
    }
    for (const x of [-18, -10, -2, 6, 14, 21]) {
      const drain = mesh('FloorDrain', new THREE.PlaneGeometry(1.8, 0.22), DARK_STEEL, new THREE.Vector3(x, 0.008, 17.1));
      drain.rotation.x = -Math.PI / 2;
      this.root.add(drain);
    }
    const compactor = ENGINE.SceneNode.create({ name: 'CertifiedWasteCompactor', position: new THREE.Vector3(-22, 0, 8.2) });
    compactor.add(
      mesh('CompactorBody', new THREE.BoxGeometry(3.2, 2.8, 2.4), WALL, new THREE.Vector3(0, 1.4, 0)),
      mesh('CompactorMouth', new THREE.BoxGeometry(2.4, 1.2, 0.12), DARK_STEEL, new THREE.Vector3(0, 1.65, 1.22)),
      mesh('CompactorBeacon', new THREE.CylinderGeometry(0.12, 0.12, 0.18, 10), RED, new THREE.Vector3(1.2, 2.9, 0))
    );
    this.root.add(compactor);
  }

  public aisleX(aisle: number): number {
    return warehouseAisleX(aisle);
  }

  public packagePosition(aisle: number, bay: number): THREE.Vector3 {
    return warehousePackagePosition(aisle, bay);
  }

  /**
   * Drone-volume collision, expanded beyond the camera lens. The old point test let the
   * hull enter a rack at its front edge, which exposed black backfaces when the lens turned.
   */
  public constrainDrone(position: THREE.Vector3, previous: THREE.Vector3): boolean {
    const drone = WAREHOUSE_LAYOUT.drone;
    if (position.x < drone.minX || position.x > drone.maxX || position.z < drone.minZ || position.z > drone.maxZ || position.y > drone.maxY) {
      position.copy(previous);
      return true;
    }
    /*
     * The racks are 6.1m tall and the drone's ceiling is 8.35 - there are two clear metres
     * of air above every rack, and this test used to ignore Y entirely, so the collision
     * wall ran floor to roof and the building was five corridors. Reported directly as
     * "the drone can't fly over the racks", and flying over them is half the point of
     * being a drone.
     *
     * 6.55 is the rack top plus enough for the hull, so skimming the cartons stays an
     * honest collision while clearing them becomes flight.
     */
    if (position.y < 6.55) {
      for (const rackX of WAREHOUSE_LAYOUT.rack.centers) {
        if (position.z < WAREHOUSE_LAYOUT.rack.minCollisionZ || position.z > WAREHOUSE_LAYOUT.rack.maxCollisionZ) continue;
        if (Math.abs(position.x - rackX) >= WAREHOUSE_LAYOUT.rack.halfCollisionX) continue;
        position.copy(previous);
        return true;
      }
    }
    if (
      position.y < 2.25 &&
      position.x > WAREHOUSE_LAYOUT.sortation.minX - 0.7 &&
      position.x < WAREHOUSE_LAYOUT.sortation.maxX + 0.25 &&
      position.z > WAREHOUSE_LAYOUT.sortation.minZ &&
      position.z < WAREHOUSE_LAYOUT.sortation.maxZ
    ) {
      position.copy(previous);
      return true;
    }
    if (position.y < 2.15) {
      for (const station of Object.values(this.stationPositions)) {
        const dx = position.x - station.x;
        const dz = position.z - station.z;
        if (dx * dx + dz * dz >= 2.4) continue;
        position.copy(previous);
        return true;
      }
    }
    for (const id of this.lockedSecurityZones) {
      for (const gate of this.securityGates.get(id) ?? []) {
        gate.node.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(gate.node).expandByScalar(0.7);
        if (!bounds.containsPoint(position)) continue;
        position.copy(previous);
        return true;
      }
    }
    return false;
  }

  public setRearDoorOpen(amount: number): void {
    this.rearDoorTarget = Math.max(0, Math.min(1, amount));
  }

  public setConveyorsRunning(running: boolean): void {
    this.conveyorRunning = running;
  }

  public setServiceDoorStatus(id: WarehouseDoorId, status: WarehouseDoorStatus): void {
    this.serviceDoors.get(id)?.setStatus(status);
  }

  public cycleServiceDoor(id: WarehouseDoorId): void {
    this.serviceDoors.get(id)?.cycleCargo();
  }

  public lockdownServiceDoor(id: WarehouseDoorId): void {
    this.serviceDoors.get(id)?.lockdown();
  }

  public resetServiceDoors(): void {
    for (const door of this.serviceDoors.values()) door.reset();
  }

  public setPursuitLights(id: WarehouseDoorId, active: boolean): void {
    for (const [doorId, door] of this.serviceDoors) door.setPursuitLights(active && doorId === id);
  }

  public setLightingMode(mode: WarehouseLightingMode): void {
    this.lightingMode = mode;
    if (getAccessibilityPreferences().reducedMotion) {
      this.emergencyLevel = mode === 'normal' || mode === 'recovery' ? 0 : 1;
    }
  }

  public getLightingMode(): WarehouseLightingMode {
    return this.lightingMode;
  }

  public setSecurityZoneLocked(id: WarehouseSecurityZoneId, locked: boolean): void {
    if (locked) this.lockedSecurityZones.add(id);
    else this.lockedSecurityZones.delete(id);
  }

  public resetSecurityZones(): void {
    this.lockedSecurityZones.clear();
  }

  public nearestDoorHandoff(position: THREE.Vector3): { id: WarehouseDoorId; distance: number } {
    let nearest: { id: WarehouseDoorId; distance: number } = {
      id: WAREHOUSE_DOOR_IDS[0],
      distance: Number.POSITIVE_INFINITY,
    };
    for (const id of WAREHOUSE_DOOR_IDS) {
      const distance = position.distanceTo(this.doorHandoffPositions[id]);
      if (distance < nearest.distance) nearest = { id, distance };
    }
    return nearest;
  }

  public setDuplicateAisle(active: boolean): void {
    if (!this.duplicateAisleSigns) return;
    for (const [index, sign] of this.duplicateAisleSigns.entries()) {
      sign.material = labelMaterial(active ? '5' : '4', active ? '#e49a84' : '#d8ffb0');
      sign.setName(`${active ? 'AisleSign-5-Duplicate' : 'AisleSign-4'}-${index === 0 ? 'Front' : 'Back'}`);
    }
  }

  public spawnInboundFreight(): void {
    if (this.inboundPackages.length) return;
    for (let i = 0; i < 8; i++) {
      const carton = mesh(
        `InboundFreight-${i + 1}`,
        new THREE.BoxGeometry(0.9 + (i % 3) * 0.12, 0.66 + (i % 2) * 0.12, 0.8),
        new THREE.MeshStandardMaterial({ color: i % 2 ? '#705e41' : '#5d503b', roughness: 0.94 }),
        new THREE.Vector3(
          -3.2 + (i % 4) * 2.1,
          0.4 + Math.floor(i / 4) * 0.78,
          WAREHOUSE_LAYOUT.receiving.freightSpawnZ - Math.floor(i / 4) * 0.35
        )
      );
      this.inboundPackages.push(carton);
      this.root.add(carton);
    }
  }

  public sealQuarantine(): void {
    if (this.quarantineGate) this.quarantineGate.scale.x = 1;
  }

  public tick(deltaTime: number): void {
    this.clock += deltaTime;
    const targetEmergency = this.lightingMode === 'normal' || this.lightingMode === 'recovery' ? 0 : 1;
    this.emergencyLevel = THREE.MathUtils.damp(this.emergencyLevel, targetEmergency, 2.8, deltaTime);
    const emergency = this.emergencyLevel;
    const contained = this.lightingMode === 'contained';
    const reducedMotion = getAccessibilityPreferences().reducedMotion;
    const basePulse = contained || reducedMotion ? 1 : 0.64 + Math.sin(this.clock * 4.1) * 0.22;
    // Rebased on the new rig. The ratios are what the emergency mode is about, not the
    // absolute numbers, so both ends move together.
    if (this.ambientLight) this.ambientLight.intensity = THREE.MathUtils.lerp(WAREHOUSE_SKY_FILL, 0.5, emergency);
    if (this.moonLight) this.moonLight.intensity = THREE.MathUtils.lerp(1.7, 1.05, emergency);
    if (this.frontLight) this.frontLight.intensity = THREE.MathUtils.lerp(35, 4, emergency);
    if (this.fixtureLensMaterial) this.fixtureLensMaterial.emissiveIntensity = THREE.MathUtils.lerp(1.15, 0.1, emergency);
    for (const light of this.workLights) light.intensity = THREE.MathUtils.lerp(54, 4.6, emergency);
    for (const [index, material] of this.emergencyMaterials.entries()) {
      const sequence = contained || reducedMotion ? 1 : 0.72 + Math.sin(this.clock * 2.5 - index * 0.8) * 0.28;
      material.emissiveIntensity = emergency * (1.2 + sequence * 3.8);
    }
    for (const [index, light] of this.emergencyLights.entries()) {
      const sequence = contained || reducedMotion ? 1 : Math.max(0.35, Math.sin(this.clock * 2.5 - index * 0.8) * 0.5 + 0.5);
      light.intensity = emergency * (7 + 12 * basePulse * sequence);
    }
    if (this.lightingMode === 'recovery' && emergency < 0.02) this.lightingMode = 'normal';
    this.setDressing.setEmergencyLevel(emergency, contained);
    this.setDressing.tick(deltaTime);
    this.daylight.tick(deltaTime, emergency, contained, reducedMotion);
    this.automation.tick(deltaTime, this.conveyorRunning, emergency, contained, reducedMotion);
    for (const door of this.serviceDoors.values()) door.tick(deltaTime);
    if (this.rearDoor) {
      this.rearDoor.position.y = THREE.MathUtils.damp(this.rearDoor.position.y, 3 + this.rearDoorTarget * 6.2, 2.6, deltaTime);
    }
    for (const [id, gates] of this.securityGates) {
      const locked = this.lockedSecurityZones.has(id);
      for (const gate of gates) gate.node.position.y = THREE.MathUtils.damp(gate.node.position.y, locked ? gate.closedY : gate.openY, 5.2, deltaTime);
    }
    if (this.conveyorRunning) {
      for (const roller of this.conveyorRollers) roller.rotation.x -= deltaTime * 4.5;
    }
    for (const carton of this.inboundPackages) {
      carton.position.z = THREE.MathUtils.damp(carton.position.z, WAREHOUSE_LAYOUT.receiving.freightStageZ, 1.35, deltaTime);
    }
    const rain = this.root.getObjectByName('ExteriorRain') as THREE.Points | undefined;
    const position = rain?.geometry.getAttribute('position');
    if (position) {
      for (let i = 0; i < position.count; i++) {
        const y = position.getY(i) - deltaTime * 8;
        position.setY(i, y < 0 ? 14 : y);
      }
      position.needsUpdate = true;
    }
  }
}
