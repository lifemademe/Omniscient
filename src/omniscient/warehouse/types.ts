export type WarehouseMode = 'story' | 'endless' | 'daily';

export type WarehouseTool = 'optical' | 'history' | 'thermal' | 'uv' | 'xray' | 'acoustic';

export type CargoDecision = 'release' | 'quarantine';
export type WorkerDecision = 'clear' | 'hold' | 'verify';
export type VisitorDecision = 'deny-lockdown';
export type SecurityDecision = 'sector-lockdown';
export type WarehouseDecision = CargoDecision | WorkerDecision | VisitorDecision | SecurityDecision;
/** A reversible console command, deliberately separate from case verdicts. */
export type WarehouseConsoleAction = WarehouseDecision | 'return';

export type WarehouseDoorId = 'service-a' | 'service-b' | 'service-c';
export type WarehouseDoorStatus = 'unseen' | 'clear' | 'contact' | 'tamper' | 'locked';
export type WarehouseVisitorIntent = 'collection' | 'intrusion';
export type WarehouseInboundStatus = 'valid';
export type WarehouseDoorDockState = 'empty' | 'staged' | 'releasing' | 'quarantined' | 'returning' | 'locked';

export interface WarehouseDockSnapshot {
  doorId: WarehouseDoorId;
  state: WarehouseDoorDockState;
  stagedPackageIds: readonly string[];
  capacity: number;
  requiredCount: number;
}

export type WarehouseSecurityZoneId = 'receiving' | 'storage-west' | 'storage-east' | 'sortation';
export type WarehouseSecurityZoneStatus = 'unseen' | 'clear' | 'motion' | 'contact' | 'locked';
export type WarehouseLightingMode = 'normal' | 'emergency' | 'contained' | 'recovery';
export type WarehouseIntrusionPhase =
  | 'inactive'
  | 'entry'
  | 'search'
  | 'tagged'
  | 'escape-warning'
  | 'contained'
  | 'escaped'
  | 'response';

export interface WarehouseDoorSnapshot {
  id: WarehouseDoorId;
  status: WarehouseDoorStatus;
  selected: boolean;
}

export interface WarehouseSecurityZoneSnapshot {
  id: WarehouseSecurityZoneId;
  status: WarehouseSecurityZoneStatus;
  selected: boolean;
}

export interface WarehouseIntrusionEvidenceState {
  rearHistory: boolean;
  headcount: boolean;
  liveTag: boolean;
}

export interface WarehouseIntrusionSnapshot {
  phase: WarehouseIntrusionPhase;
  currentZone: WarehouseSecurityZoneId;
  lastSeenZone: WarehouseSecurityZoneId | null;
  selectedZone: WarehouseSecurityZoneId;
  tagSeconds: number;
  routeStep: number;
  escapeSeconds: number | null;
  evidence: WarehouseIntrusionEvidenceState;
  containedZone: WarehouseSecurityZoneId | null;
}

export interface WarehouseEvidenceState {
  located: boolean;
  visitor: boolean;
  cargo: boolean;
  action: boolean;
  authorization: boolean;
  tamper: boolean;
}

export type SensorChannel = WarehouseTool | 'weight' | 'seal' | 'identity' | 'manifest' | 'personnel-count';

export interface SensorReading {
  channel: SensorChannel;
  label: string;
  expected: string;
  measured: string;
  matches: boolean;
}

export interface ManifestRecord {
  subjectId: string;
  subjectType: 'cargo' | 'worker' | 'visitor' | 'intruder';
  displayName: string;
  destination?: string;
  expectedWeight?: number;
  authorized?: boolean;
}

export interface WarehouseCaseDefinition {
  id: string;
  title: string;
  briefing: string;
  subjectType: 'cargo' | 'worker' | 'visitor' | 'intruder' | 'mixed';
  requiredTools: readonly WarehouseTool[];
  correctDecision: WarehouseDecision;
  critical?: boolean;
  anomaly?: 'none' | 'identity' | 'mass' | 'camera' | 'thermal' | 'seal' | 'internal' | 'resonance' | 'tamper' | 'breach';
  baseSeconds: number;
}

export interface WarehouseMovementDefinition {
  id: string;
  title: string;
  objective: string;
  caseIds: readonly string[];
  inboundIn?: number;
  tutorial?: boolean;
  finale?: boolean;
}

export interface WarehouseRunConfig {
  mode: WarehouseMode;
  seed: string;
  deckVersion: number;
  unlockedTools: readonly WarehouseTool[];
}

export interface GeneratedWarehouseCase {
  definition: WarehouseCaseDefinition;
  packageId: string;
  aisle: number;
  bay: number;
  visitorName: string;
  workerName: string;
  packageRecipientName: string;
  inboundStatus: WarehouseInboundStatus;
  expectedWeight: number;
  measuredWeight: number;
  assignedDoorId: WarehouseDoorId;
  visitorIntent: WarehouseVisitorIntent;
  doorTamper: boolean;
}

export interface WarehouseRunResult {
  mode: WarehouseMode;
  seed: string;
  stage: number;
  accuracy: number;
  cleanChain: number;
  integrity: number;
  elapsedSeconds: number;
  rank: WarehouseRank;
  completed: boolean;
  shareCode?: string;
}

export interface WarehouseArchiveRecord {
  id: string;
  capturedAt: string;
  caseId: string;
  packageId: string;
  mode: WarehouseMode;
  stage: number;
  channel: WarehouseTool;
  favorite: boolean;
}

export type WarehouseRank =
  | 'TRAINEE'
  | 'OPERATOR'
  | 'INSPECTOR'
  | 'CONTROLLER'
  | 'OVERSEER'
  | 'OMNISCIENT';
