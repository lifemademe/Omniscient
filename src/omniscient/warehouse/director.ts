import { createRng, pick, seedFrom } from '../core/rng.js';
import { CASE_DECK, WAREHOUSE_DECK_VERSION } from './content.js';
import { WAREHOUSE_ADDRESSABLE_BAYS, WAREHOUSE_AISLE_COUNT } from './WarehouseLayout.js';

import type {
  GeneratedWarehouseCase,
  WarehouseCaseDefinition,
  WarehouseRank,
  WarehouseRunConfig,
  WarehouseRunResult,
  WarehouseDoorId,
  WarehouseTool,
} from './types.js';

const VISITORS = ['Ana Reis', 'Bruno Tavares', 'Lia Costa', 'Rafael Nunes', 'Maya Wong', 'Alice Varga'] as const;
const WORKERS = ['João Mara', 'Maya Wong', 'Arthur Lewis', 'Dani Bell', 'Camila Sato', 'Rui Alves'] as const;
const DOORS: readonly WarehouseDoorId[] = ['service-a', 'service-b', 'service-c'];

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
  if (definition.id === 'package-5018') return stage === 30;
  if (definition.id === 'internal-breach') return false;
  if (definition.id === 'door-tamper') return stage >= 6;
  if (definition.id === 'identity-impostor') return stage >= 11;
  const tier = tierFor(stage);
  if (tier === 0) return definition.anomaly === 'none';
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
    const breachRoll = seedFrom(`${this.config.deckVersion}:${this.config.seed}:breach:${stage}`) % 100;
    const previousBreachRoll = seedFrom(`${this.config.deckVersion}:${this.config.seed}:breach:${stage - 1}`) % 100;
    const shouldBreach = stage >= 18 && stage < 30 && breachRoll < 12 && previousBreachRoll >= 12;
    const definition = stage === 30
      ? CASE_DECK.find((entry) => entry.id === 'package-5018') ?? CASE_DECK[0]
      : shouldBreach
        ? CASE_DECK.find((entry) => entry.id === 'internal-breach') ?? CASE_DECK[0]
        : pick(rng, candidates.length > 0 ? candidates : CASE_DECK.slice(0, 3));
    const aisle = stage === 30 ? 5 : 1 + Math.floor(rng() * WAREHOUSE_AISLE_COUNT);
    /*
     * Drawn from the ADDRESSABLE bays, not from 1..100.
     *
     * Twenty of the hundred addresses fall between physical rack bays, onto an upright, where
     * a package has no shelf to stand on - so one generated case in five sent the player to
     * an address that could not hold anything. The authored cases were fixed by hand twice
     * before it was worth asking why the numbers kept being wrong; the answer is that a fifth
     * of them always were.
     *
     * 1..100 rather than 0..99 for the older reason: bay zero has no marker on the rack and
     * no meaning to a picker, and the id it produced (`2000`) reads as a rounder number than
     * it is.
     */
    const bay = stage === 30
      ? 18
      : WAREHOUSE_ADDRESSABLE_BAYS[Math.floor(rng() * WAREHOUSE_ADDRESSABLE_BAYS.length)];
    const packageId = definition.id === 'internal-breach'
      ? 'UNLISTED'
      : stage === 30
        ? '5018'
        : `${aisle}${String(bay).padStart(3, '0')}`;
    const expectedWeight = Math.round((2.5 + rng() * 16) * 10) / 10;
    const mismatch = definition.id === 'weight-mismatch' ? 2 + Math.round(rng() * 40) / 10 : 0;
    const assignedDoorId = stage === 30 || definition.id === 'internal-breach' ? 'service-c' : pick(rng, DOORS);
    const visitorName = pick(rng, VISITORS);
    const packageRecipientName = definition.id === 'door-tamper' || definition.id === 'identity-impostor'
      ? pick(rng, VISITORS.filter((name) => name !== visitorName))
      : visitorName;
    return {
      definition,
      packageId,
      aisle,
      bay,
      visitorName,
      workerName: pick(rng, WORKERS),
      packageRecipientName,
      inboundStatus: 'valid',
      expectedWeight,
      measuredWeight: Math.round((expectedWeight + mismatch) * 10) / 10,
      assignedDoorId,
      visitorIntent: definition.id === 'door-tamper' || definition.id === 'identity-impostor' || definition.id === 'internal-breach' ? 'intrusion' : 'collection',
      doorTamper: definition.id === 'door-tamper',
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
