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
  inspectionPosition: THREE.Vector3;
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
  resolutions: InboundDeliveryResolution[];
  fugitiveZone: WarehouseSecurityZoneId | null;
  escapeSeconds: number | null;
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
    inspectionPosition: new THREE.Vector3(-18.2, 0, -17.8),
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
    sealCompromised: false,
    inspectionPosition: new THREE.Vector3(-10.8, 0, -17.8),
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
    inspectionPosition: new THREE.Vector3(-3.8, 0, -17.8),
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
    inspectionPosition: new THREE.Vector3(3.2, 0, -17.8),
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
    inspectionPosition: new THREE.Vector3(10.2, 0, -17.8),
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
    resolutions: INBOUND_AUDIT_DELIVERIES.map((delivery, index) => (
      index < safeResolved ? delivery.suspicious ? 'evidence' : 'sorted' : 'pending'
    )),
    fugitiveZone: null,
    escapeSeconds: null,
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
