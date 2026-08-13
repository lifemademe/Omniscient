/**
 * Executes a MissionDefinition against the player's knowledge.
 *
 * One runtime, every mission (§160 / §165). The runtime owns no content: it walks the
 * authored beat graph, resolves player text to declared intents, applies knowledge
 * effects and reports what the world should do.
 *
 * §157: the runtime validates intents against authored state. It cannot be argued into
 * a different answer.
 * §159: a rejected message produces a clarification beat, never CORRECT / INCORRECT.
 */

import { Certainty } from '../knowledge/KnowledgeStore.js';

import { resolveIntent } from './intent.js';

import type { KnowledgeStore } from '../knowledge/KnowledgeStore.js';
import type { Beat, BeatTransition, MissionDefinition, MissionOutcome } from './types.js';

/** Everything the presentation layer needs after one player message. */
export interface MissionStep {
  /** Line the contact transmits. */
  say: string;
  /** Environment cue for the Contact View (§209). */
  environment?: string;
  /** VFX library effect to fire. */
  vfx?: string;
  /** Facts recorded by this step, for the growth reveal. */
  learned: string[];
  /** Set once the mission has ended. */
  outcome?: MissionOutcome;
  /** True when the runtime asked the player to rephrase rather than advancing. */
  clarifying: boolean;
}

export class MissionRuntime {
  private currentBeatId: string;
  private finished = false;
  private readonly beats: Map<string, Beat>;
  /**
   * Latched at construction. Reading it off the current beat would report false the
   * moment the mission advanced past its opening.
   */
  private readonly _calledBack: boolean;

  constructor(
    public readonly definition: MissionDefinition,
    private readonly knowledge: KnowledgeStore
  ) {
    this.beats = new Map(definition.beats.map((beat) => [beat.id, beat]));
    this.currentBeatId = this.resolveOpeningBeat();
    this._calledBack =
      !!definition.requires && this.currentBeatId === definition.requires.ifKnownBeatId;
  }

  /**
   * Pick the entry beat. When the mission declares a requirement, this is where the
   * callback either pays off or routes to its recovery path (§214 / §163 - a missing
   * fact must never dead-end).
   */
  private resolveOpeningBeat(): string {
    const requirement = this.definition.requires;
    if (!requirement) return this.definition.openingBeatId;

    return this.knowledge.trusts(requirement.factId)
      ? requirement.ifKnownBeatId
      : requirement.ifMissingBeatId;
  }

  /** True when the callback fired - i.e. the player arrived already knowing. */
  public get calledBack(): boolean {
    return this._calledBack;
  }

  public get isFinished(): boolean {
    return this.finished;
  }

  public getCurrentBeat(): Beat {
    const beat = this.beats.get(this.currentBeatId);
    if (!beat) {
      throw new Error(`Mission ${this.definition.id}: unknown beat "${this.currentBeatId}"`);
    }
    return beat;
  }

  /** The opening transmission, before the player has said anything. */
  public open(): MissionStep {
    const beat = this.getCurrentBeat();
    return {
      say: beat.say,
      learned: this.recordKnowledge(beat.learn ?? []),
      clarifying: false,
      outcome: beat.outcome,
    };
  }

  /** Submit a free-text player response and advance. */
  public respond(text: string): MissionStep {
    if (this.finished) {
      return { say: '', learned: [], clarifying: false };
    }

    const beat = this.getCurrentBeat();
    const allowed = this.definition.intents.filter((intent) => intent.id in beat.on);
    const resolution = resolveIntent(text, allowed);

    if (resolution.kind === 'matched') {
      return this.applyTransition(beat.on[resolution.intentId]);
    }

    // §159 / §164: ambiguity and non-recognition are in-fiction clarification requests.
    const fallback = resolution.kind === 'ambiguous' ? beat.onAmbiguous : beat.onUnrecognised;
    if (fallback) {
      return { ...this.applyTransition(fallback), clarifying: true };
    }

    return {
      say: 'Sorry - say that again? I did not follow.',
      learned: [],
      clarifying: true,
    };
  }

  private applyTransition(transition: BeatTransition): MissionStep {
    // Knowledge from the action taken...
    const learned = this.recordKnowledge(transition.learn ?? []);

    this.currentBeatId = transition.to;
    const next = this.getCurrentBeat();

    // ...and from whatever the contact says on arrival.
    learned.push(...this.recordKnowledge(next.learn ?? []));

    if (next.outcome) {
      this.finished = true;
      // Authored cross-domain bridges land at resolution (§107).
      for (const link of next.outcome.connects ?? []) {
        this.knowledge.connect(link.a, link.b, link.label);
      }
    }

    return {
      say: next.say,
      environment: transition.environment,
      vfx: transition.vfx,
      learned,
      outcome: next.outcome,
      clarifying: false,
    };
  }

  /**
   * Commit facts to the Circuit. Only ids the mission declared can be learned, so a
   * typo in authoring fails loudly here rather than silently producing a phantom fact.
   */
  private recordKnowledge(ids: string[]): string[] {
    const learned: string[] = [];

    for (const id of ids) {
      const entry = this.definition.knowledge.find((k) => k.id === id);
      if (!entry) {
        throw new Error(`Mission ${this.definition.id}: undeclared knowledge id "${id}"`);
      }
      if (this.knowledge.knows(id)) continue;

      this.knowledge.learn(entry.id, entry.label, entry.domain, {
        certainty: Certainty.Verified,
        contactId: this.definition.contactId,
        missionId: this.definition.id,
      });
      learned.push(id);
    }

    return learned;
  }
}
