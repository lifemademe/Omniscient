export type WarehouseMode = 'story' | 'endless' | 'daily';

export type WarehouseTool = 'optical' | 'history' | 'thermal' | 'uv' | 'xray' | 'acoustic';

export type CargoDecision = 'release' | 'quarantine' | 'return';
export type WorkerDecision = 'clear' | 'hold' | 'verify';
export type WarehouseDecision = CargoDecision | WorkerDecision;

export type SensorChannel = WarehouseTool | 'weight' | 'seal' | 'identity' | 'manifest';

export interface SensorReading {
  channel: SensorChannel;
  label: string;
  expected: string;
  measured: string;
  matches: boolean;
}

export interface ManifestRecord {
  subjectId: string;
  subjectType: 'cargo' | 'worker' | 'visitor';
  displayName: string;
  destination?: string;
  expectedWeight?: number;
  authorized?: boolean;
}

export interface WarehouseCaseDefinition {
  id: string;
  title: string;
  briefing: string;
  subjectType: 'cargo' | 'worker' | 'visitor' | 'mixed';
  requiredTools: readonly WarehouseTool[];
  correctDecision: WarehouseDecision;
  critical?: boolean;
  anomaly?: 'none' | 'identity' | 'mass' | 'camera' | 'thermal' | 'seal' | 'internal' | 'resonance';
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
  expectedWeight: number;
  measuredWeight: number;
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
