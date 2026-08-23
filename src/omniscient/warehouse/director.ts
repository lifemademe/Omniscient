import { createRng, pick, seedFrom } from '../core/rng.js';
import { CASE_DECK, WAREHOUSE_DECK_VERSION } from './content.js';

import type {
  GeneratedWarehouseCase,
  WarehouseCaseDefinition,
  WarehouseRank,
  WarehouseRunConfig,
  WarehouseRunResult,
  WarehouseTool,
} from './types.js';

const VISITORS = ['Ana Reis', 'Bruno Tavares', 'Lia Costa', 'Rafael Nunes', 'Maya Wong', 'Alice Varga'] as const;
const WORKERS = ['João Mara', 'Maya Wong', 'Arthur Lewis', 'Dani Bell', 'Camila Sato', 'Rui Alves'] as const;

function supports(definition: WarehouseCaseDefinition, tools: ReadonlySet<WarehouseTool>): boolean {
  return definition.requiredTools.every((tool) => tools.has(tool));
}

function tierFor(stage: number): number {
  if (stage <= 5) return 0;
  if (stage <= 10) return 1;
  if (stage <= 17) return 2;
  if (stage <= 23) return 3;
  return 4;
}

function eligible(definition: WarehouseCaseDefinition, stage: number): boolean {
  if (definition.id === 'package-7018') return stage === 30;
  const tier = tierFor(stage);
  if (tier === 0) return definition.anomaly === 'none' || definition.id === 'wrong-route';
  if (tier === 1) return definition.subjectType !== 'mixed' && definition.anomaly !== 'mass';
  if (tier === 2) return definition.anomaly !== 'mass';
  return true;
}

export class WarehouseDirector {
  public readonly config: WarehouseRunConfig;

  public constructor(config: WarehouseRunConfig) {
    this.config = { ...config, deckVersion: config.deckVersion || WAREHOUSE_DECK_VERSION };
  }

  public caseForStage(stage: number, unlockedTools: readonly WarehouseTool[] = this.config.unlockedTools): GeneratedWarehouseCase {
    const rng = createRng(seedFrom(`${this.config.deckVersion}:${this.config.seed}:${stage}`));
    const tools = new Set<WarehouseTool>(['optical', ...unlockedTools]);
    const candidates = CASE_DECK.filter((entry) => supports(entry, tools) && eligible(entry, stage));
    const definition = stage === 30
      ? CASE_DECK.find((entry) => entry.id === 'package-7018') ?? CASE_DECK[0]
      : pick(rng, candidates.length > 0 ? candidates : CASE_DECK.slice(0, 3));
    const aisle = stage === 30 ? 7 : 1 + Math.floor(rng() * 8);
    const bay = stage === 30 ? 18 : Math.floor(rng() * 100);
    const packageId = stage === 30 ? '7018' : `${aisle}${String(bay).padStart(3, '0')}`;
    const expectedWeight = Math.round((2.5 + rng() * 16) * 10) / 10;
    const mismatch = definition.correctDecision === 'release' ? 0 : 2 + Math.round(rng() * 40) / 10;
    return {
      definition,
      packageId,
      aisle,
      bay,
      visitorName: pick(rng, VISITORS),
      workerName: pick(rng, WORKERS),
      expectedWeight,
      measuredWeight: Math.round((expectedWeight + mismatch) * 10) / 10,
    };
  }

  public static utcDailySeed(date = new Date()): string {
    return `daily-${date.toISOString().slice(0, 10)}-d${WAREHOUSE_DECK_VERSION}`;
  }

  public static rank(result: Omit<WarehouseRunResult, 'rank'>): WarehouseRank {
    if (result.mode === 'story' && result.completed) {
      if (result.integrity === 3 && result.accuracy >= 1) return 'CONTROLLER';
      if (result.accuracy >= 0.9) return 'INSPECTOR';
      return 'OPERATOR';
    }
    if (result.stage >= 30 && result.integrity === 3 && result.accuracy >= 1) return 'OMNISCIENT';
    if (result.stage >= 30 && result.accuracy >= 0.96) return 'OVERSEER';
    if (result.stage >= 24 && result.accuracy >= 0.9) return 'CONTROLLER';
    if (result.stage >= 18 && result.accuracy >= 0.82) return 'INSPECTOR';
    if (result.stage >= 10 && result.accuracy >= 0.72) return 'OPERATOR';
    return 'TRAINEE';
  }
}
