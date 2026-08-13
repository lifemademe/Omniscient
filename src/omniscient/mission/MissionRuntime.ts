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

import { readsAsYesNo, resolveIntent } from './intent.js';

import type { KnowledgeStore } from '../knowledge/KnowledgeStore.js';
import type {
  Beat,
  BeatTransition,
  MissionDefinition,
  MissionFailure,
  MissionHint,
  MissionOutcome,
} from './types.js';

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
  /** Set once the mission has ended well. */
  outcome?: MissionOutcome;
  /** Set once the request has been lost. */
  failure?: MissionFailure;
  /** True when the runtime asked the player to rephrase rather than advancing. */
  clarifying: boolean;
  /**
   * Set when the reading was uncertain: the runtime is proposing an interpretation and
   * waiting for yes/no rather than acting on a guess.
   */
  confirming?: { intentId: string; question: string };
}

export class MissionRuntime {
  private currentBeatId: string;
  private finished = false;
  private readonly beats: Map<string, Beat>;
  /** Beats the player has actually reached - gates which hints are observable yet. */
  private readonly visited = new Set<string>();
  /** Intent awaiting a yes/no from the player. */
  private pendingIntent: string | null = null;
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
    this.visited.add(this.currentBeatId);
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

  /**
   * Evidence the player could plausibly have noticed by now.
   *
   * A hint about the back of the set is not available until somebody has turned the set
   * around - otherwise the phone would be reporting things nobody can see, which breaks
   * §131's contract that the environment is what carries the information.
   */
  public getAvailableHints(): MissionHint[] {
    return this.definition.hints.filter(
      (hint) => !hint.revealedBy || this.visited.has(hint.revealedBy)
    );
  }

  /** Open a hint. Returns null if it is not observable yet. */
  public openHint(hintId: string): MissionHint | null {
    return this.getAvailableHints().find((hint) => hint.id === hintId) ?? null;
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

  /**
   * Submit a free-text player response and advance.
   *
   * A clear, safe reading acts immediately. Two cases stop and ask first:
   *
   *   - the reading is ambiguous, so acting would be a guess
   *   - the reading is something the mission declares unsafe
   *
   * Confirming on *every* message would be a second click every turn, which §113 warns
   * against. Confirming on these two makes the question itself informative: if the game
   * is asking, either you were vague or you just told somebody to do something dangerous.
   */
  public respond(text: string): MissionStep {
    if (this.finished) {
      return { say: '', learned: [], clarifying: false };
    }

    const beat = this.getCurrentBeat();

    /**
     * A typed yes or no while a reading is pending answers the reading.
     *
     * The surface shows buttons for this, but nothing stops the player from typing the
     * answer instead - and when they did, it fell through to intent matching, missed, and
     * left the proposal hanging forever with no way to clear it.
     */
    if (this.pendingIntent) {
      const answer = readsAsYesNo(text);
      if (answer) return this.confirm(answer === 'yes');
    }

    // A direct question deserves a direct answer. See Beat.affirmIntent.
    if (beat.affirmIntent && beat.on[beat.affirmIntent]) {
      const answer = readsAsYesNo(text);
      if (answer === 'yes') {
        return this.definition.hiddenTruth.unsafeIntents.includes(beat.affirmIntent)
          ? this.propose(beat.affirmIntent)
          : this.applyTransition(beat.on[beat.affirmIntent]);
      }
      if (answer === 'no') {
        return {
          say: 'Alright - not that, then. What do you want me to do?',
          learned: [],
          clarifying: true,
        };
      }
    }

    const allowed = this.definition.intents.filter((intent) => intent.id in beat.on);
    const resolution = resolveIntent(text, allowed);

    if (resolution.kind === 'matched') {
      if (this.definition.hiddenTruth.unsafeIntents.includes(resolution.intentId)) {
        return this.propose(resolution.intentId);
      }
      return this.applyTransition(beat.on[resolution.intentId]);
    }

    // A tie between readings is exactly the case worth asking about.
    if (resolution.kind === 'ambiguous' && resolution.candidates.length > 0) {
      return this.propose(resolution.candidates[0].intentId);
    }

    // §159 / §164: non-recognition is an in-fiction clarification request.
    if (beat.onUnrecognised) {
      return { ...this.applyTransition(beat.onUnrecognised), clarifying: true };
    }

    return {
      say: 'Sorry - say that again? I did not follow.',
      learned: [],
      clarifying: true,
    };
  }

  /** Ask the player to confirm a reading before acting on it. */
  private propose(intentId: string): MissionStep {
    this.pendingIntent = intentId;
    const question = this.definition.confirmations?.[intentId];

    return {
      say: '',
      learned: [],
      clarifying: false,
      confirming: {
        intentId,
        question: question ?? 'Is that what you meant?',
      },
    };
  }

  /** Answer a proposed reading. */
  public confirm(accepted: boolean): MissionStep {
    const intentId = this.pendingIntent;
    this.pendingIntent = null;

    if (!accepted || !intentId) {
      return {
        say: 'Right - tell me again, then.',
        learned: [],
        clarifying: true,
      };
    }

    const beat = this.getCurrentBeat();
    const transition = beat.on[intentId];
    if (!transition) {
      return { say: 'Right - tell me again, then.', learned: [], clarifying: true };
    }
    return this.applyTransition(transition);
  }

  public get isConfirming(): boolean {
    return this.pendingIntent !== null;
  }

  private applyTransition(transition: BeatTransition): MissionStep {
    // Knowledge from the action taken...
    const learned = this.recordKnowledge(transition.learn ?? []);

    this.currentBeatId = transition.to;
    this.visited.add(this.currentBeatId);
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

    if (next.failure) {
      this.finished = true;
    }

    return {
      say: next.say,
      environment: transition.environment,
      vfx: transition.vfx,
      learned,
      outcome: next.outcome,
      failure: next.failure,
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
