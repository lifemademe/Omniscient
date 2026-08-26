import * as THREE from 'three';

import type { WarehouseSecurityZoneId } from './types.js';

export type InboundAuditPhase =
  | 'scan-worker'
  | 'scan-package'
  | 'sort-ready'
  | 'alarm-ready'
  | 'fugitive-search'
  | 'police-response'
  | 'complete';

export type InboundDeliveryResolution = 'pending' | 'sorted' | 'evidence';

export interface InboundAuditDelivery {
  index: number;
  workerId: string;
  workerName: string;
  packageId: string;
  packageDelivererName: string;
  aisle: number;
  bay: number;
  vest: string;
  helmet: string;
  gloves: string;
  suspicious: boolean;
  sealCompromised: boolean;
  /**
   * Why this seal is broken, when there is an innocent reason on record.
   *
   * The point of the audit is comparing a worker against their paperwork, and the impostor
   * carries two tells - a name that does not match and a seal that is open. With every other
   * delivery sealed, the seal alone convicted: a player could reject the right person for the
   * wrong reason and never once read a name, which is the mechanic the quest is built on.
   *
   * So one legitimate delivery arrives with a broken seal and a logged explanation. A seal
   * now raises a question rather than answering one, and the only tell that separates the
   * impostor from an honest worker having a bad night is the identity comparison. Rejecting
   * on the seal alone is a false alarm against somebody innocent, and costs integrity.
   *
   * Undefined means no explanation exists, which is what makes the third delivery damning.
   */
  sealNote?: string;
  /**
   * Where the worker waits, and it is deliberately the head of their OWN aisle.
   *
   * They stood in a row across the receiving dock at z -17.8, which is behind the racking and
   * roughly forty metres from where the drone spawns. Nothing on screen said so. Every
   * delivery therefore opened with a blind search the length of the building for a figure
   * that is a few pixels tall at that range, and only then began the part the quest is about.
   *
   * At the front of their own aisle they are visible from the launch pad, and scanning the
   * worker and flying to their bay becomes one continuous movement down one aisle instead of
   * two unrelated journeys. It also teaches the relationship the audit runs on - this person
   * and that package belong to the same aisle - by putting them in the same place.
   *
   * Staggered in z rather than aligned, because five deliveries that each park a figure on
   * the identical line read as a spawn point rather than as somebody standing where they
   * happen to be. Racks end at 14.35 either way, so 15.9 to 17.8 clears the end guards.
   *
   * NEGATIVE z: the aisle mouth that faces the freight door, not the far end.
   *
   * They were at +16 to +18 - the closed end of the building, as far from the loading bay as
   * the floor allows - while the console said "unloading complete" and the objective called
   * the spot "the front of Aisle 1". The front of an aisle is the end you walk into it from,
   * and in this building that is the end with the door in it. Five crews who had just carried
   * five packages in off a truck were standing sixty metres past where the truck was.
   *
   * The receiving zone runs to z -14.3, so this row sits inside it with the racks behind them
   * and the open bay behind that - which is also what makes the row read: the freight door is
   * the brightest thing in the room and they are standing in front of it.
   */
  inspectionPosition: THREE.Vector3;
  /** Human-readable station, for the objective line. */
  station: string;
}

export interface InboundAuditSnapshot {
  phase: InboundAuditPhase;
  activeIndex: number;
  resolved: number;
  total: number;
  workerScanned: boolean;
  packageScanned: boolean;
  delivererMatches: boolean | null;
  sealIntact: boolean | null;
  /** Seal either unbroken or broken with a logged reason. See sealNote. */
  sealAccounted: boolean | null;
  resolutions: InboundDeliveryResolution[];
  fugitiveZone: WarehouseSecurityZoneId | null;
  escapeSeconds: number | null;
  /** Where the active worker is standing, for the console to say out loud. */
  station: string;
}

/**
 * The audit is authored rather than shuffled. Its third comparison is the dramatic hinge,
 * so the player gets two clean repetitions before the same grammar produces a contradiction.
 */
export const INBOUND_AUDIT_DELIVERIES: readonly InboundAuditDelivery[] = [
  {
    index: 0,
    workerId: 'WX-1142',
    workerName: 'Joao Mara',
    // 1024: aisle 1, bay 024. It read 1124, which spells bay 124 on a rack that stops at
    // 100 - the manifest, the rack ruler and the carton all disagreed.
    packageId: '1024',
    packageDelivererName: 'Joao Mara',
    aisle: 1,
    bay: 24,
    vest: '#d2a933',
    helmet: '#e4c34b',
    gloves: '#263532',
    suspicious: false,
    sealCompromised: false,
    inspectionPosition: new THREE.Vector3(-18.6, 0, -16.4),
    station: 'the front of Aisle 1',
  },
  {
    index: 1,
    workerId: 'WX-2087',
    workerName: 'Maya Wong',
    packageId: '2046',
    packageDelivererName: 'Maya Wong',
    aisle: 2,
    bay: 46,
    vest: '#cf702f',
    helmet: '#f0d468',
    gloves: '#20383c',
    suspicious: false,
    // Broken, and accounted for. This is the delivery that stops a broken seal from being
    // a verdict on its own - see sealNote.
    sealCompromised: true,
    sealNote: 'RESEAL LOGGED 03:14 // DOCK SUPERVISOR // CARTON RE-TAPED AFTER PALLET SLIP',
    inspectionPosition: new THREE.Vector3(-11.4, 0, -17.8),
    station: 'the front of Aisle 2',
  },
  {
    index: 2,
    workerId: 'WX-3319',
    workerName: 'Rui Alves',
    packageId: '3072',
    packageDelivererName: 'Paulo Silva',
    aisle: 3,
    bay: 72,
    vest: '#91a83b',
    helmet: '#d7ab39',
    gloves: '#182c2d',
    suspicious: true,
    sealCompromised: true,
    inspectionPosition: new THREE.Vector3(-4.6, 0, -15.9),
    station: 'the front of Aisle 3',
  },
  {
    index: 3,
    workerId: 'WX-4461',
    workerName: 'Arthur Lewis',
    // 4097, not 4088: bay 88 lands between two physical rack bays, on an upright, where
    // there is no shelf to stand a carton on. See warehouseRackBayIndex.
    packageId: '4097',
    packageDelivererName: 'Arthur Lewis',
    aisle: 4,
    bay: 97,
    vest: '#d0b744',
    helmet: '#e3c750',
    gloves: '#34403c',
    suspicious: false,
    sealCompromised: false,
    inspectionPosition: new THREE.Vector3(2.6, 0, -17.4),
    station: 'the front of Aisle 4',
  },
  {
    index: 4,
    workerId: 'WX-5198',
    workerName: 'Camila Sato',
    // 5023, not 5013: bay 13 is in the same class of gap as 4088 was.
    packageId: '5023',
    packageDelivererName: 'Camila Sato',
    aisle: 5,
    bay: 23,
    vest: '#b85f37',
    helmet: '#f0cb51',
    gloves: '#243b38',
    suspicious: false,
    sealCompromised: false,
    inspectionPosition: new THREE.Vector3(9.4, 0, -16.2),
    station: 'the front of Aisle 5',
  },
] as const;

export function createInboundAuditSnapshot(resolved = 0): InboundAuditSnapshot {
  const safeResolved = Math.max(0, Math.min(INBOUND_AUDIT_DELIVERIES.length, Math.floor(resolved)));
  return {
    phase: safeResolved >= INBOUND_AUDIT_DELIVERIES.length ? 'complete' : 'scan-worker',
    activeIndex: safeResolved,
    resolved: safeResolved,
    total: INBOUND_AUDIT_DELIVERIES.length,
    workerScanned: false,
    packageScanned: false,
    delivererMatches: null,
    sealIntact: null,
    sealAccounted: null,
    resolutions: INBOUND_AUDIT_DELIVERIES.map((delivery, index) => (
      index < safeResolved ? delivery.suspicious ? 'evidence' : 'sorted' : 'pending'
    )),
    fugitiveZone: null,
    escapeSeconds: null,
    station: INBOUND_AUDIT_DELIVERIES[safeResolved]?.station ?? '',
  };
}

export const INBOUND_FUGITIVE_ROUTE: readonly {
  zone: WarehouseSecurityZoneId;
  position: THREE.Vector3;
  concealed: boolean;
}[] = [
  { zone: 'receiving', position: new THREE.Vector3(-5.4, 0, -21.2), concealed: false },
  { zone: 'storage-west', position: new THREE.Vector3(-20.1, 0, -7.2), concealed: true },
  { zone: 'storage-west', position: new THREE.Vector3(-8.6, 0, 11.8), concealed: true },
  { zone: 'storage-east', position: new THREE.Vector3(4.2, 0, -8.4), concealed: true },
  { zone: 'storage-east', position: new THREE.Vector3(12.1, 0, 10.6), concealed: true },
  { zone: 'sortation', position: new THREE.Vector3(18.2, 0, -7.6), concealed: true },
  { zone: 'sortation', position: new THREE.Vector3(22.1, 0, 8.8), concealed: false },
] as const;

export const INBOUND_SERVICE_C_ESCAPE = new THREE.Vector3(22.2, 0, 20.1);
