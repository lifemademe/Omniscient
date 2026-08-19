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
  /**
   * Things that grow. Added for the third request, and the first domain in the game whose
   * faults are not faults at all - a plant doing exactly what plants do is still the
   * reason somebody's crop is dying.
   */
  Growing = 'growing',
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
  /**
   * True for notes the player typed themselves after losing a request (§170).
   *
   * These are the most interesting records in the store: everything else is what the
   * world told OMNISCIENT_, and this is what OMNISCIENT_ decided to tell itself.
   */
  playerWritten?: boolean;
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
 *
 * Deliberately low for the Jam slice: §214 wants growth the player can SEE inside a short
 * play, which a conventional XP curve would never deliver. Retuned when the third request
 * landed - at the old numbers a direct run through all three finished on six facts and two
 * connections, which was still Interwoven, so Adaeze's request grew the tree by nothing at
 * all. A request that changes the machine and does not change the picture of the machine
 * has had its reward quietly taken away.
 *
 * The rule these have to satisfy: every request moves the tree exactly one stage on a
 * direct route. Sprout, Branching, Interwoven, Canopy.
 */
const STAGE_THRESHOLDS: ReadonlyArray<{ stage: GrowthStage; facts: number; connections: number }> = [
  { stage: GrowthStage.Transcendent, facts: 14, connections: 4 },
  { stage: GrowthStage.Overgrown, facts: 10, connections: 3 },
  { stage: GrowthStage.Canopy, facts: 6, connections: 2 },
  { stage: GrowthStage.Interwoven, facts: 5, connections: 1 },
  { stage: GrowthStage.Branching, facts: 3, connections: 0 },
  { stage: GrowthStage.Sapling, facts: 1, connections: 0 },
  { stage: GrowthStage.Sprout, facts: 0, connections: 0 },
];

/**
 * What a contact thinks of OMNISCIENT_, and how much history they have together.
 *
 * `MissionOutcome.trust` has been declared since the schema was written and nothing ever
 * consumed it - solving a request awarded a number into the void. It matters because it
 * is the only thing in the game that measures the relationship rather than the knowledge:
 * the tree records what you learned, this records what it cost the people who taught you.
 */
export interface ContactStanding {
  /** 0-1. Starts at a working stranger's benefit of the doubt. */
  trust: number;
  /** Requests resolved together. */
  jobs: number;
  /** Requests lost. Not hidden from the player - it is part of the history. */
  lost: number;
}

/** Where a new contact starts: willing to talk, not yet willing to be told anything. */
const INITIAL_TRUST = 0.45;

export class KnowledgeStore {
  private readonly facts = new Map<string, Fact>();
  private readonly connections = new Map<string, Connection>();
  private readonly listeners = new Set<(event: KnowledgeEvent) => void>();
  private readonly standings = new Map<string, ContactStanding>();
  private sequence = 0;

  constructor(private readonly seed: number) {}

  /** A contact's standing, created at the default if they are new. */
  public getStanding(contactId: string): ContactStanding {
    const existing = this.standings.get(contactId);
    if (existing) return existing;

    const fresh: ContactStanding = { trust: INITIAL_TRUST, jobs: 0, lost: 0 };
    this.standings.set(contactId, fresh);
    return fresh;
  }

  /**
   * Record how a request went.
   *
   * `trust` is the mission's own award, in the same units the content already uses (a
   * solve is worth 2), scaled down into 0-1 here so content does not have to think in
   * fractions. A loss costs more than a solve gains, which is how trust works.
   */
  public recordOutcome(contactId: string, solved: boolean, trustAward = 0): void {
    const standing = this.getStanding(contactId);

    if (solved) {
      standing.jobs += 1;
      standing.trust = Math.min(1, standing.trust + trustAward * 0.09);
    } else {
      standing.lost += 1;
      standing.trust = Math.max(0, standing.trust - 0.22);
    }
  }

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
      playerWritten?: boolean;
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
      playerWritten: options.playerWritten,
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

  /** Everything the save file needs to rebuild this store. Copies, not references. */
  public serialize(): {
    facts: Fact[];
    connections: Connection[];
    standings: Array<{ contactId: string; standing: ContactStanding }>;
    sequence: number;
  } {
    return {
      facts: [...this.facts.values()].map((f) => ({ ...f })),
      connections: [...this.connections.values()].map((c) => ({ ...c })),
      standings: [...this.standings.entries()].map(([contactId, standing]) => ({
        contactId,
        standing: { ...standing },
      })),
      sequence: this.sequence,
    };
  }

  /**
   * Rebuild the store from a save. Replaces everything; emits nothing.
   *
   * Silent on purpose: restore runs at boot, before the tree or any listener exists, and
   * a listener that DID exist would see fourteen fact-learned events fire in one frame -
   * the growth reveal animating a whole playthrough of learning as if it happened now.
   * The tree is rebuilt from toTreeState() after this returns, which is the same path a
   * fresh boot takes.
   */
  public restore(data: {
    facts: Fact[];
    connections: Connection[];
    standings: Array<{ contactId: string; standing: ContactStanding }>;
    sequence: number;
  }): void {
    this.facts.clear();
    this.connections.clear();
    this.standings.clear();
    for (const fact of data.facts) this.facts.set(fact.id, { ...fact });
    for (const connection of data.connections) this.connections.set(connection.id, { ...connection });
    for (const { contactId, standing } of data.standings) this.standings.set(contactId, { ...standing });
    this.sequence = data.sequence;
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

  /**
   * A note the player wrote for themselves after losing a request (§170).
   *
   * Stored as an ordinary fact so it shows up in RECORDS, grows the tree, and can be
   * recalled in any later mission - the player's own words become part of what the
   * intelligence knows.
   */
  public writeNote(missionId: string, contactId: string, text: string): Fact {
    const trimmed = text.trim().slice(0, 240);
    return this.learn(
      `note:${missionId}:${this.sequence}`,
      trimmed,
      KnowledgeDomain.People,
      { certainty: Certainty.Reported, contactId, missionId, playerWritten: true }
    );
  }

  /**
   * Records worth showing during a request (§19 contextual recall).
   *
   * Anything learned from this contact, anything the player wrote about this mission, and
   * anything in a domain the mission touches. §95 is explicit that recall surfaces
   * relevant memories *without revealing the answer*, which is why this filters by
   * provenance rather than by usefulness.
   */
  public getRelevantRecords(missionId: string, contactId: string, domains: KnowledgeDomain[]): Fact[] {
    const wanted = new Set(domains);
    return this.getFacts().filter(
      (fact) =>
        fact.sourceContactId === contactId ||
        fact.sourceMissionId === missionId ||
        wanted.has(fact.domain)
    );
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
