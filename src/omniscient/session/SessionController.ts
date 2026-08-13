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
import type { InterventionSurface, SurfaceState, TranscriptEntry } from '../link/surface.js';
import type { Contact, MissionDefinition, MissionOutcome } from '../mission/types.js';

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

    this.unsubscribe = this.surface.onMessage((message) => {
      if (message.kind === 'text') this.submit(message.text);
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

    const step = this.runtime.respond(text);
    this.push({ source: 'contact', name: this.contact.name, body: step.say });

    if (step.environment) this.hooks.onEnvironment?.(step.environment);
    if (step.vfx) this.hooks.onVfx?.(step.vfx);
    if (step.learned.length) this.hooks.onKnowledgeGained?.(step.learned);

    if (step.outcome) {
      this.push({ source: 'system', name: 'OMNISCIENT_', body: step.outcome.say });
      this.hooks.onResolved?.(step.outcome, this.runtime.calledBack);
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
    if (!this.contact) return;

    const finished = this.runtime?.isFinished ?? true;
    const tempo = this.runtime?.getCurrentBeat().tempo ?? Tempo.Respond;

    const state: SurfaceState = {
      mode: tempo === Tempo.Act ? 'action' : 'chat',
      contactName: this.contact.name,
      transcript: this.transcript,
      awaitingInput: !finished,
      hint: finished ? 'request resolved' : TEMPO_HINT[tempo],
    };

    this.surface.present(state);
  }
}
