/**
 * The Knowledge Circuit - what OMNISCIENT_ actually knows.
 *
 * Gauntlet §118 / §175: the Circuit and the Knowledge Tree are ONE system with two
 * presentations, and they derive from shared progression data so they cannot drift out
 * of sync. This module is that shared data. The tree renders it; nothing else owns it.
 *
 * §18 makes memory the critical system: facts learned in one mission must be usable in
 * another. §163: a corrected misconception annotates rather than silently disappearing.
 */

import { GrowthStage } from '../crt/KnowledgeTree.js';

import type { KnowledgeState } from '../crt/KnowledgeTree.js';

/** Broad domains. A new domain starts a new major limb on the tree (§117). */
export enum KnowledgeDomain {
  Electronics = 'electronics',
  Signal = 'signal',
  Mechanical = 'mechanical',
  People = 'people',
  Place = 'place',
}

/**
 * How sure OMNISCIENT_ is. §162 separates correctness from confidence: the AI may
 * legitimately know that it does not know.
 */
export enum Certainty {
  /** Heard once, unverified. Can still be acted on, with risk. */
  Reported = 'reported',
  /** Observed directly or confirmed by a test. */
  Verified = 'verified',
  /** Contradicted by later evidence. Retained, not deleted (§163). */
  Disputed = 'disputed',
}

export interface Fact {
  id: string;
  /** Short human-readable statement, as OMNISCIENT_ would record it. */
  label: string;
  domain: KnowledgeDomain;
  /** Who or what taught this. Drives §170 callbacks and tree limb grouping. */
  sourceContactId: string | null;
  sourceMissionId: string | null;
  certainty: Certainty;
  /** Monotonic learn order. Not wall-clock - keeps replays deterministic. */
  sequence: number;
}

export interface Connection {
  id: string;
  a: string;
  b: string;
  label: string;
  sequence: number;
}

/** Emitted when the store changes, so the CRT can react (§176 growth reveal). */
export interface KnowledgeEvent {
  kind: 'fact-learned' | 'fact-disputed' | 'connection-made';
  factId?: string;
  connectionId?: string;
}

/**
 * Thresholds mapping accumulated knowledge onto §121 milestone stages.
 * Deliberately low for the Jam slice: §214 targets visible growth twice inside a
 * 10-12 minute play, which a conventional XP curve would never deliver.
 */
const STAGE_THRESHOLDS: ReadonlyArray<{ stage: GrowthStage; facts: number; connections: number }> = [
  { stage: GrowthStage.Transcendent, facts: 14, connections: 4 },
  { stage: GrowthStage.Overgrown, facts: 10, connections: 3 },
  { stage: GrowthStage.Canopy, facts: 7, connections: 2 },
  { stage: GrowthStage.Interwoven, facts: 5, connections: 1 },
  { stage: GrowthStage.Branching, facts: 3, connections: 0 },
  { stage: GrowthStage.Sapling, facts: 1, connections: 0 },
  { stage: GrowthStage.Sprout, facts: 0, connections: 0 },
];

export class KnowledgeStore {
  private readonly facts = new Map<string, Fact>();
  private readonly connections = new Map<string, Connection>();
  private readonly listeners = new Set<(event: KnowledgeEvent) => void>();
  private sequence = 0;

  constructor(private readonly seed: number) {}

  public onChange(listener: (event: KnowledgeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: KnowledgeEvent): void {
    this.listeners.forEach((listener) => listener(event));
  }

  /**
   * Record a fact. Re-learning an existing fact upgrades its certainty rather than
   * duplicating it - a thing confirmed twice is more trusted, not known twice.
   */
  public learn(
    id: string,
    label: string,
    domain: KnowledgeDomain,
    options: {
      certainty?: Certainty;
      contactId?: string | null;
      missionId?: string | null;
    } = {}
  ): Fact {
    const existing = this.facts.get(id);
    if (existing) {
      if (options.certainty === Certainty.Verified && existing.certainty === Certainty.Reported) {
        existing.certainty = Certainty.Verified;
        this.emit({ kind: 'fact-learned', factId: id });
      }
      return existing;
    }

    const fact: Fact = {
      id,
      label,
      domain,
      sourceContactId: options.contactId ?? null,
      sourceMissionId: options.missionId ?? null,
      certainty: options.certainty ?? Certainty.Reported,
      sequence: this.sequence++,
    };
    this.facts.set(id, fact);
    this.emit({ kind: 'fact-learned', factId: id });
    return fact;
  }

  /**
   * Mark a fact contradicted. §163: the belief is annotated, never erased - the player
   * should be able to see that OMNISCIENT_ was wrong about something.
   */
  public dispute(id: string): void {
    const fact = this.facts.get(id);
    if (!fact || fact.certainty === Certainty.Disputed) return;
    fact.certainty = Certainty.Disputed;
    this.emit({ kind: 'fact-disputed', factId: id });
  }

  /**
   * Bridge two facts. §107: a real cross-domain connection is the most valuable event
   * in the progression, and §117 has it graft separate limbs together on the tree.
   */
  public connect(a: string, b: string, label: string): Connection | null {
    if (a === b || !this.facts.has(a) || !this.facts.has(b)) return null;

    const id = [a, b].sort().join('::');
    const existing = this.connections.get(id);
    if (existing) return existing;

    const connection: Connection = { id, a, b, label, sequence: this.sequence++ };
    this.connections.set(id, connection);
    this.emit({ kind: 'connection-made', connectionId: id });
    return connection;
  }

  public knows(id: string): boolean {
    return this.facts.has(id);
  }

  /** Knows it, and has not since been contradicted. */
  public trusts(id: string): boolean {
    const fact = this.facts.get(id);
    return !!fact && fact.certainty !== Certainty.Disputed;
  }

  public getFact(id: string): Fact | null {
    return this.facts.get(id) ?? null;
  }

  /** Facts in learn order - the order the tree draws them. */
  public getFacts(): Fact[] {
    return [...this.facts.values()].sort((a, b) => a.sequence - b.sequence);
  }

  public getConnections(): Connection[] {
    return [...this.connections.values()].sort((a, b) => a.sequence - b.sequence);
  }

  /** Facts learned from one person - the raw material for §164 callbacks. */
  public getFactsFromContact(contactId: string): Fact[] {
    return this.getFacts().filter((fact) => fact.sourceContactId === contactId);
  }

  public getDomains(): KnowledgeDomain[] {
    return [...new Set(this.getFacts().map((fact) => fact.domain))];
  }

  /** Current milestone stage (§121), derived rather than stored. */
  public getStage(): GrowthStage {
    const factCount = this.facts.size;
    const connectionCount = this.connections.size;
    for (const threshold of STAGE_THRESHOLDS) {
      if (factCount >= threshold.facts && connectionCount >= threshold.connections) {
        return threshold.stage;
      }
    }
    return GrowthStage.Sprout;
  }

  /**
   * Project onto the tree's view of the world. This is the only bridge between the
   * analytical and emotional presentations, which is what keeps §118 honest.
   */
  public toTreeState(alienGraft = false): KnowledgeState {
    return {
      seed: this.seed,
      stage: this.getStage(),
      connections: this.connections.size,
      alienGraft,
    };
  }
}
