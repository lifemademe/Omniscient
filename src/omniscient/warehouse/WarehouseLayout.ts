import * as THREE from 'three';

import type { WarehouseSecurityZoneId } from './types.js';

export interface WarehouseBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface WarehouseCameraPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

export interface WarehouseSecurityZoneLayout {
  id: WarehouseSecurityZoneId;
  label: string;
  shortLabel: string;
  bounds: WarehouseBounds;
  camera: WarehouseCameraPose;
  routePosition: THREE.Vector3;
}

const AISLE_CENTERS = [-19, -12, -5, 2, 9] as const;

export const WAREHOUSE_AISLE_COUNT = AISLE_CENTERS.length;

export const WAREHOUSE_SECURITY_ZONE_IDS: readonly WarehouseSecurityZoneId[] = [
  'receiving',
  'storage-west',
  'storage-east',
  'sortation',
];

/**
 * One source of truth for the runtime warehouse. Keeping authored positions here means
 * expanding the shell cannot silently leave a camera, package, worker, or collision wall
 * behind in the old 32 x 40 metre footprint.
 */
export const WAREHOUSE_LAYOUT = {
  shell: {
    width: 48,
    length: 58,
    height: 10.5,
    wallX: 24.2,
    frontZ: 29.2,
    rearZ: -29.2,
    roofY: 10.5,
  },
  rack: {
    centers: AISLE_CENTERS,
    spacing: 7,
    centerZ: 1,
    length: 26,
    height: 6.1,
    halfCollisionX: 1.42,
    minCollisionZ: -12.35,
    maxCollisionZ: 14.35,
  },
  drone: {
    start: new THREE.Vector3(0, 3.2, 22),
    minX: -22.6,
    maxX: 22.6,
    minZ: -27.2,
    maxZ: 27.4,
    maxY: 8.35,
  },
  stations: {
    hold: new THREE.Vector3(20.2, 0, 19),
  },
  cradle: new THREE.Vector3(0, 0, 22),
  truck: new THREE.Vector3(0, 0, -34.2),
  receiving: {
    apronFrontZ: -16.5,
    freightSpawnZ: -27.2,
    freightStageZ: -20.4,
  },
  sortation: {
    centerX: 19.6,
    centerZ: -0.5,
    minX: 15.6,
    maxX: 23.55,
    minZ: -14.2,
    maxZ: 13.2,
    conveyorX: [17.25, 19.6, 21.95] as const,
    conveyorLength: 20,
  },
  service: {
    sideZ: 20,
    handoffInset: 2.5,
  },
  muster: [
    new THREE.Vector3(-20.2, 0, -22.8),
    new THREE.Vector3(-18.2, 0, -22.8),
    new THREE.Vector3(-16.2, 0, -22.8),
    new THREE.Vector3(-14.2, 0, -22.8),
    new THREE.Vector3(-12.2, 0, -22.8),
  ] as readonly THREE.Vector3[],
  workerRoutes: [
    [new THREE.Vector3(-8, 0, -26), new THREE.Vector3(-8, 0, -20), new THREE.Vector3(-15, 0, -15)],
    [new THREE.Vector3(-3, 0, -26), new THREE.Vector3(-2, 0, -20), new THREE.Vector3(-6, 0, -15)],
    [new THREE.Vector3(3, 0, -26), new THREE.Vector3(3, 0, -20), new THREE.Vector3(7, 0, -15)],
    [new THREE.Vector3(8, 0, -26), new THREE.Vector3(9, 0, -20), new THREE.Vector3(13, 0, -15)],
    [new THREE.Vector3(12, 0, -23), new THREE.Vector3(18, 0, -12), new THREE.Vector3(20, 0, 8)],
  ] as readonly (readonly THREE.Vector3[])[],
} as const;

export const WAREHOUSE_SECURITY_ZONES: Readonly<Record<WarehouseSecurityZoneId, WarehouseSecurityZoneLayout>> = {
  receiving: {
    id: 'receiving',
    label: 'RECEIVING',
    shortLabel: 'R',
    bounds: { minX: -22.6, maxX: 15.2, minZ: -27.2, maxZ: -14.3 },
    camera: {
      position: new THREE.Vector3(-14.8, 9.2, -26.2),
      target: new THREE.Vector3(0, 1.1, -20.2),
      fov: 52,
    },
    routePosition: new THREE.Vector3(-5.5, 0, -19.5),
  },
  'storage-west': {
    id: 'storage-west',
    label: 'STORAGE WEST',
    shortLabel: 'W',
    bounds: { minX: -22.6, maxX: -1.5, minZ: -13.8, maxZ: 15.3 },
    camera: {
      position: new THREE.Vector3(-21.3, 9.1, 15.8),
      target: new THREE.Vector3(-8.5, 1.25, 0.5),
      fov: 50,
    },
    routePosition: new THREE.Vector3(-8.5, 0, -4.5),
  },
  'storage-east': {
    id: 'storage-east',
    label: 'STORAGE EAST',
    shortLabel: 'E',
    bounds: { minX: -1.5, maxX: 15.25, minZ: -13.8, maxZ: 15.3 },
    camera: {
      position: new THREE.Vector3(14.4, 9.2, 16),
      target: new THREE.Vector3(5.5, 1.2, 1.5),
      fov: 50,
    },
    routePosition: new THREE.Vector3(5.5, 0, 5.5),
  },
  sortation: {
    id: 'sortation',
    label: 'SORTATION',
    shortLabel: 'S',
    bounds: { minX: 15.25, maxX: 23.55, minZ: -14.2, maxZ: 14.2 },
    camera: {
      position: new THREE.Vector3(22.7, 9.35, 12.2),
      target: new THREE.Vector3(19.5, 1.15, -1.2),
      fov: 48,
    },
    routePosition: new THREE.Vector3(19.2, 0, 4.2),
  },
};

export function warehouseAisleX(aisle: number): number {
  return AISLE_CENTERS[Math.max(0, Math.min(AISLE_CENTERS.length - 1, Math.round(aisle) - 1))];
}

/** The rear end of the bay run, and how far it reaches. The label strip shares both. */
export const WAREHOUSE_BAY_Z0 = -11.4;
export const WAREHOUSE_BAY_RUN = 24.8;
/** Bays are numbered from 1, so a package id reads 2001..2100 rather than 2000..2099. */
export const WAREHOUSE_BAY_MIN = 1;
export const WAREHOUSE_BAY_MAX = 100;

/**
 * Where an address lives, in metres.
 *
 * The address is the whole navigation loop of this mission: 2034 is aisle 2, bay 34, and the
 * player is expected to fly to it. So this and the label strip drawn along the rack have to
 * be the same function - if they drift, every sign in the building is lying, and the failure
 * is a player searching an aisle that genuinely does not contain the package.
 *
 * Bay 1 sits at the rear end of the run and bay 100 at the front, evenly spaced.
 */
export function warehousePackagePosition(aisle: number, bay: number): THREE.Vector3 {
  return new THREE.Vector3(warehouseAisleX(aisle) + 1.12, 0, warehouseBayZ(bay));
}

export function warehouseBayZ(bay: number): number {
  const clamped = Math.max(WAREHOUSE_BAY_MIN, Math.min(WAREHOUSE_BAY_MAX, bay));
  return WAREHOUSE_BAY_Z0 + ((clamped - WAREHOUSE_BAY_MIN) / (WAREHOUSE_BAY_MAX - WAREHOUSE_BAY_MIN)) * WAREHOUSE_BAY_RUN;
}

export function warehouseZoneLabel(id: WarehouseSecurityZoneId): string {
  return WAREHOUSE_SECURITY_ZONES[id].label;
}
