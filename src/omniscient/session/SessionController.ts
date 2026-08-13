/**
 * Runs one request from open to outcome.
 *
 * Sits between the mission runtime (what is true), the knowledge store (what OMNISCIENT_
 * has learned) and the intervention surface (what the player sees and types). Nothing
 * here knows whether the surface is a local panel or a paired phone - §222.
 *
 * §176 HOME LOOP: MISSION RESOLVED -> KNOWLEDGE UPDATED -> RETURN TO MACHINE -> NEW
 * GROWTH REVEALED. This class owns the first two steps and signals the third.
 */

import { MissionRuntime } from '../mission/MissionRuntime.js';
import { Tempo } from '../mission/types.js';

import type { KnowledgeStore } from '../knowledge/KnowledgeStore.js';
import type {
  HintView,
  InterventionSurface,
  RecordView,
  TranscriptEntry,
} from '../link/surface.js';
import type { MissionStep } from '../mission/MissionRuntime.js';
import type {
  Contact,
  MissionDefinition,
  MissionFailure,
  MissionOutcome,
} from '../mission/types.js';

/** Hooks the presentation layer supplies. All optional - the session runs without them. */
export interface SessionHooks {
  /** Environment cue for the Contact View, e.g. "prop.rotate:transmitter-rear" (§209). */
  onEnvironment?: (cue: string) => void;
  /** VFX library effect name to fire. */
  onVfx?: (effect: string) => void;
  /** Fired when facts were recorded, so the CRT can reveal growth. */
  onKnowledgeGained?: (factIds: string[]) => void;
  /** Fired once the request resolves. */
  onResolved?: (outcome: MissionOutcome, calledBack: boolean) => void;
  /** Fired when the request is lost - the globe puts it on cooldown (§31). */
  onFailed?: (failure: MissionFailure) => void;
  /** Fired when the player steps back out to the globe. */
  onLeave?: () => void;
}

/** Short label under the input telling the player what the game expects (§162). */
const TEMPO_HINT: Record<Tempo, string> = {
  [Tempo.Think]: 'observing - no time pressure',
  [Tempo.Respond]: 'awaiting your response',
  [Tempo.Act]: 'act now',
};

export class SessionController {
  private runtime: MissionRuntime | null = null;
  private contact: Contact | null = null;
  private transcript: TranscriptEntry[] = [];
  private unsubscribe: (() => void) | null = null;
  /** Hints the player has opened - the phone keeps what it has already told them. */
  private opened = new Set<string>();
  private confirming: { intentId: string; question: string } | null = null;
  private failed: MissionFailure | null = null;

  constructor(
    private readonly surface: InterventionSurface,
    private readonly knowledge: KnowledgeStore,
    private readonly hooks: SessionHooks = {}
  ) {}

  /** Open a request. Presents the contact's first transmission. */
  public start(definition: MissionDefinition, contact: Contact): void {
    this.end();

    this.contact = contact;
    this.runtime = new MissionRuntime(definition, this.knowledge);
    this.transcript = [];
    this.opened = new Set();
    this.confirming = null;
    this.failed = null;

    this.unsubscribe = this.surface.onMessage((message) => {
      switch (message.kind) {
        case 'text':
          this.submit(message.text);
          break;
        case 'hint':
          this.openHint(message.hintId);
          break;
        case 'confirm':
          this.answerConfirmation(message.accepted);
          break;
        case 'note':
          this.writeNote(message.text);
          break;
        case 'leave':
          this.hooks.onLeave?.();
          break;
        default:
          break;
      }
    });

    this.push({
      source: 'system',
      name: 'OMNISCIENT_',
      body: `incoming request - ${contact.location}`,
    });

    const opening = this.runtime.open();
    this.push({ source: 'contact', name: contact.name, body: opening.say });

    if (opening.learned.length) {
      this.hooks.onKnowledgeGained?.(opening.learned);
    }

    this.present();
  }

  /** Feed a player response through the runtime. */
  public submit(text: string): void {
    if (!this.runtime || !this.contact || this.runtime.isFinished) return;

    this.push({ source: 'omniscient', name: 'OMNISCIENT_', body: text });
    this.apply(this.runtime.respond(text));
  }

  /** Answer a proposed reading of the last message. */
  private answerConfirmation(accepted: boolean): void {
    if (!this.runtime || !this.contact) return;

    this.push({
      source: 'omniscient',
      name: 'OMNISCIENT_',
      body: accepted ? 'yes' : 'no',
    });
    this.apply(this.runtime.confirm(accepted));
  }

  /**
   * Open an observation. §131: it says more, and the world shows you where.
   * Reading evidence is not a turn - the contact does not respond to it.
   */
  private openHint(hintId: string): void {
    const hint = this.runtime?.openHint(hintId);
    if (!hint) return;

    this.opened.add(hintId);
    this.push({ source: 'system', name: 'OMNISCIENT_', body: hint.detail });
    if (hint.cue) this.hooks.onEnvironment?.(hint.cue);
    this.present();
  }

  /** §170: the player writes themselves a note after losing a request. */
  private writeNote(text: string): void {
    if (!this.runtime || !this.contact || !text.trim()) return;

    this.knowledge.writeNote(this.runtime.definition.id, this.contact.id, text);
    this.push({ source: 'system', name: 'OMNISCIENT_', body: `recorded: ${text.trim()}` });
    this.failed = null;
    this.present();
  }

  private apply(step: MissionStep): void {
    if (!this.contact) return;

    if (step.confirming) {
      this.confirming = step.confirming;
      this.present();
      return;
    }
    this.confirming = null;

    if (step.say) {
      this.push({ source: 'contact', name: this.contact.name, body: step.say });
    }

    if (step.environment) this.hooks.onEnvironment?.(step.environment);
    if (step.vfx) this.hooks.onVfx?.(step.vfx);
    if (step.learned.length) this.hooks.onKnowledgeGained?.(step.learned);

    if (step.outcome) {
      this.push({ source: 'system', name: 'OMNISCIENT_', body: step.outcome.say });
      this.hooks.onResolved?.(step.outcome, this.runtime?.calledBack ?? false);
    }

    if (step.failure) {
      this.failed = step.failure;
      this.push({ source: 'system', name: 'OMNISCIENT_', body: step.failure.summary });
      this.hooks.onFailed?.(step.failure);
    }

    this.present();
  }

  public get isFinished(): boolean {
    return this.runtime?.isFinished ?? true;
  }

  /** Detach from the surface. Safe to call repeatedly. */
  public end(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.runtime = null;
  }

  private push(entry: TranscriptEntry): void {
    this.transcript.push(entry);
  }

  private present(): void {
    if (!this.contact || !this.runtime) return;

    const finished = this.runtime.isFinished;
    const tempo = this.runtime.getCurrentBeat().tempo;

    const hints: HintView[] = this.runtime.getAvailableHints().map((hint) => ({
      id: hint.id,
      summary: hint.summary,
      detail: this.opened.has(hint.id) ? hint.detail : undefined,
      keywords: hint.keywords,
    }));

    const definition = this.runtime.definition;
    const records: RecordView[] = this.knowledge
      .getRelevantRecords(
        definition.id,
        definition.contactId,
        definition.knowledge.map((entry) => entry.domain)
      )
      .map((fact) => ({
        id: fact.id,
        label: fact.label,
        source: fact.sourceContactId ?? 'observed',
        playerWritten: fact.playerWritten === true,
      }));

    this.surface.present({
      mode: tempo === Tempo.Act ? 'action' : 'chat',
      contactName: this.contact.name,
      transcript: this.transcript,
      // A lost request still takes input - the note the player writes themselves.
      awaitingInput: !finished || this.failed !== null,
      hint: this.failureHint(finished),
      hints,
      records,
      confirming: this.confirming ?? undefined,
      failure: this.failed ? { summary: this.failed.summary } : undefined,
    });
  }

  private failureHint(finished: boolean): string {
    if (this.failed) return 'record a note for next time';
    if (this.confirming) return 'confirm';
    if (finished) return 'request resolved';
    return TEMPO_HINT[this.runtime?.getCurrentBeat().tempo ?? Tempo.Respond];
  }
}
