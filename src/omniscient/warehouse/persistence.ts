import { WAREHOUSE_DECK_VERSION } from './content.js';

import type { WarehouseArchiveRecord, WarehouseRank, WarehouseRunResult, WarehouseTool } from './types.js';

const KEY = 'omniscient.warehouse.v1';
const VERSION = 1;

export interface WarehouseSaveData {
  version: number;
  traceResolved: boolean;
  storyUnlocked: boolean;
  storyCompleted: boolean;
  storyMovement: number;
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
    const data = JSON.parse(raw) as Partial<WarehouseSaveData>;
    if (data.version !== VERSION) return fallback;
    return {
      ...fallback,
      ...data,
      unlockedTools: Array.isArray(data.unlockedTools) ? data.unlockedTools : fallback.unlockedTools,
      discoveredCases: Array.isArray(data.discoveredCases) ? data.discoveredCases : [],
      dailyHistory: data.dailyHistory && typeof data.dailyHistory === 'object' ? data.dailyHistory : {},
      archiveRecords: Array.isArray(data.archiveRecords) ? data.archiveRecords : [],
    };
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
