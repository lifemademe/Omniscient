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

const WALL = new THREE.MeshStandardMaterial({ color: '#33403e', roughness: 0.88, metalness: 0.1 });
const STEEL = new THREE.MeshStandardMaterial({ color: '#506365', roughness: 0.6, metalness: 0.58 });
const DARK_STEEL = new THREE.MeshStandardMaterial({ color: '#202b2a', roughness: 0.76, metalness: 0.42 });
const FLOOR = new THREE.MeshStandardMaterial({ color: '#373d3a', roughness: 0.91, metalness: 0.04 });
const AMBER = new THREE.MeshStandardMaterial({ color: '#8d6c31', emissive: '#39250b', emissiveIntensity: 0.55, roughness: 0.58 });
const RED = new THREE.MeshStandardMaterial({ color: '#6e2d2d', emissive: '#2c0909', emissiveIntensity: 0.6, roughness: 0.62 });
const GREEN = new THREE.MeshStandardMaterial({ color: '#315c42', emissive: '#102b18', emissiveIntensity: 0.45, roughness: 0.62 });
const BELT = new THREE.MeshStandardMaterial({ color: '#151a19', roughness: 0.82, metalness: 0.25 });

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
      const signRoot = ENGINE.SceneNode.create({
        name: `AisleSign-${aisle}`,
        position: new THREE.Vector3(x, 7.2, 15.4),
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
      for (let stack = 0; stack < 24; stack++) {
        const y = 0.55 + (stack % 4) * 1.35;
        const z = -10.7 + Math.floor(stack / 4) * 4.7 + jitter(rng, 0.18);
        const width = 0.72 + jitter(rng, 0.16);
        const carton = mesh(
          `RackCarton-${aisle}-${stack}`,
          new THREE.BoxGeometry(width, 0.68 + (stack % 3) * 0.08, 0.66 + (stack % 2) * 0.12),
          new THREE.MeshStandardMaterial({ color: stack % 3 === 0 ? '#70593b' : stack % 2 ? '#5c513d' : '#6b5c43', roughness: 0.95 }),
          new THREE.Vector3(x + (stack % 2 ? 0.28 : -0.25), y, z)
        );
        this.root.add(carton);
        if (stack % 3 !== 1) {
          const tape = mesh(
            `RackCartonTape-${aisle}-${stack}`,
            new THREE.BoxGeometry(0.075, 0.7 + (stack % 3) * 0.08, 0.69 + (stack % 2) * 0.12),
            new THREE.MeshStandardMaterial({ color: stack % 2 ? '#aa9569' : '#8f7c59', roughness: 0.72 }),
            carton.position.clone()
          );
          this.root.add(tape);
        }
      }
      for (const [index, z] of [-10.4, -4.2, 2, 8.2].entries()) {
        const rangeEnd = index === 3 ? 99 : (index + 1) * 25;
        const rangeLabel = `${String(index * 25 + 1).padStart(2, '0')}-${String(rangeEnd).padStart(2, '0')}`;
        for (const side of [-1, 1]) {
          const bay = readableLabelPanel(
            `BayRange-${aisle}-${index + 1}-${side < 0 ? 'L' : 'R'}`,
            rangeLabel,
            0.76,
            0.24,
            '#8fbe93',
            new THREE.Vector3(x + side * 0.79, 2.5, z)
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
    this.ambientLight = ENGINE.HemisphereLightNode.create({ name: 'WarehouseAmbient', color: '#bad5cf', groundColor: '#28322e', intensity: 1.9 });
    this.moonLight = ENGINE.DirectionalLightNode.create({
      name: 'WarehouseMoon',
      color: '#a9d0d7',
      intensity: 1.35,
      position: new THREE.Vector3(-18, 24, 15),
      castShadow: true,
      shadowMapSize: 2048,
      shadowFar: 95,
      shadowNormalBias: 0.025,
      shadowBias: -0.0004,
    });
    this.root.add(this.ambientLight, this.moonLight);
    const fixtureLens = new THREE.MeshStandardMaterial({
      color: '#a8c8be',
      emissive: '#82aa9e',
      emissiveIntensity: 1.15,
      roughness: 0.38,
      metalness: 0.12,
    });
    this.fixtureLensMaterial = fixtureLens;
    for (const [xIndex, x] of [-20, -12, -4, 4, 12, 20].entries()) {
      for (const [zIndex, z] of [-20, -10, 0, 10, 20].entries()) {
        const housing = mesh('CeilingFixtureHousing', new THREE.BoxGeometry(2.72, 0.15, 0.34), DARK_STEEL, new THREE.Vector3(x, 9.92, z));
        const fixture = mesh('CeilingFixtureLens', new THREE.BoxGeometry(2.48, 0.055, 0.23), fixtureLens, new THREE.Vector3(x, 9.82, z));
        this.root.add(housing, fixture);
        if ((xIndex + zIndex) % 2 === 0) {
          const workLight = ENGINE.PointLightNode.create({
            name: 'WarehouseWorkLight',
            color: '#c4ddd1',
            intensity: 19,
            distance: 17,
            decay: 1.65,
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

  private buildFloorWear(): void {
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
    for (const rackX of WAREHOUSE_LAYOUT.rack.centers) {
      if (position.z < WAREHOUSE_LAYOUT.rack.minCollisionZ || position.z > WAREHOUSE_LAYOUT.rack.maxCollisionZ) continue;
      if (Math.abs(position.x - rackX) >= WAREHOUSE_LAYOUT.rack.halfCollisionX) continue;
      position.copy(previous);
      return true;
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
    if (this.ambientLight) this.ambientLight.intensity = THREE.MathUtils.lerp(1.9, 0.55, emergency);
    if (this.moonLight) this.moonLight.intensity = THREE.MathUtils.lerp(1.35, 0.88, emergency);
    if (this.frontLight) this.frontLight.intensity = THREE.MathUtils.lerp(35, 4, emergency);
    if (this.fixtureLensMaterial) this.fixtureLensMaterial.emissiveIntensity = THREE.MathUtils.lerp(1.15, 0.1, emergency);
    for (const light of this.workLights) light.intensity = THREE.MathUtils.lerp(19, 1.9, emergency);
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
