import { WAREHOUSE_DECK_VERSION } from './content.js';

import type { WarehouseArchiveRecord, WarehouseRank, WarehouseRunResult, WarehouseTool } from './types.js';

const KEY = 'omniscient.warehouse.v1';
const VERSION = 3;
const LEGACY_MOVEMENT_IDS = ['orientation', 'judgement', 'freight', 'overlap', 'package-5018'] as const;

function currentCaseId(id: string): string {
  return id === 'package-7018' ? 'package-5018' : id;
}

function currentPackageId(id: string): string {
  return id === '7018' ? '5018' : id;
}

export interface WarehouseSaveData {
  version: number;
  traceResolved: boolean;
  storyUnlocked: boolean;
  storyCompleted: boolean;
  storyMovement: number;
  storyMovementId: string;
  storyMistakes: number;
  tutorialComplete: boolean;
  highestStage: number;
  bestRank: WarehouseRank;
  bestCleanChain: number;
  unlockedTools: WarehouseTool[];
  discoveredCases: string[];
  dailyHistory: Record<string, WarehouseRunResult>;
  totalDecisions: number;
  correctDecisions: number;
  criticalBreaches: number;
  archiveRecords: WarehouseArchiveRecord[];
  deckVersion: number;
}

export function defaultWarehouseSave(): WarehouseSaveData {
  return {
    version: VERSION,
    traceResolved: false,
    storyUnlocked: false,
    storyCompleted: false,
    storyMovement: 0,
    storyMovementId: 'orientation',
    storyMistakes: 0,
    tutorialComplete: false,
    highestStage: 0,
    bestRank: 'TRAINEE',
    bestCleanChain: 0,
    unlockedTools: ['optical'],
    discoveredCases: [],
    dailyHistory: {},
    totalDecisions: 0,
    correctDecisions: 0,
    criticalBreaches: 0,
    archiveRecords: [],
    deckVersion: WAREHOUSE_DECK_VERSION,
  };
}

export function loadWarehouseSave(): WarehouseSaveData {
  const fallback = defaultWarehouseSave();
  try {
    const raw = window.localStorage?.getItem(KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<WarehouseSaveData>;
    if (parsed.version !== VERSION && parsed.version !== 2 && parsed.version !== 1) return fallback;
    const legacyIndex = typeof parsed.storyMovement === 'number'
      ? Math.max(0, Math.min(LEGACY_MOVEMENT_IDS.length - 1, Math.floor(parsed.storyMovement)))
      : 0;
    const savedMovementId = parsed.version === 1
      ? LEGACY_MOVEMENT_IDS[legacyIndex]
      : typeof parsed.storyMovementId === 'string'
        ? parsed.storyMovementId
        : fallback.storyMovementId;
    const storyMovementId = currentCaseId(savedMovementId);
    const discoveredCases = Array.isArray(parsed.discoveredCases)
      ? [...new Set(parsed.discoveredCases.map(currentCaseId))]
      : [];
    const archiveRecords = Array.isArray(parsed.archiveRecords)
      ? parsed.archiveRecords.map((record) => ({
        ...record,
        caseId: currentCaseId(record.caseId),
        packageId: currentPackageId(record.packageId),
      }))
      : [];
    const data: WarehouseSaveData = {
      ...fallback,
      ...parsed,
      version: VERSION,
      storyMovementId,
      deckVersion: WAREHOUSE_DECK_VERSION,
      unlockedTools: Array.isArray(parsed.unlockedTools) ? parsed.unlockedTools : fallback.unlockedTools,
      discoveredCases,
      dailyHistory: parsed.dailyHistory && typeof parsed.dailyHistory === 'object' ? parsed.dailyHistory : {},
      archiveRecords,
    };
    if (parsed.version !== VERSION
      || savedMovementId !== storyMovementId
      || discoveredCases.some((id, index) => id !== parsed.discoveredCases?.[index])
      || archiveRecords.some((record, index) => (
        record.caseId !== parsed.archiveRecords?.[index]?.caseId
        || record.packageId !== parsed.archiveRecords?.[index]?.packageId
      ))) saveWarehouseSave(data);
    return data;
  } catch {
    return fallback;
  }
}

export function saveWarehouseSave(data: WarehouseSaveData): boolean {
  try {
    const payload = JSON.stringify({ ...data, version: VERSION });
    window.localStorage?.setItem(KEY, payload);
    return window.localStorage?.getItem(KEY) === payload;
  } catch {
    return false;
  }
}

export function updateWarehouseSave(change: (data: WarehouseSaveData) => void): WarehouseSaveData {
  const data = loadWarehouseSave();
  change(data);
  saveWarehouseSave(data);
  return data;
}

export function clearWarehouseSave(): void {
  try {
    window.localStorage?.removeItem(KEY);
    window.indexedDB?.deleteDatabase('omniscient.warehouse.archive');
  } catch {
    // Storage failure must never stop a new game.
  }
}
