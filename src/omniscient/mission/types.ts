/**
 * Mission authoring schema.
 *
 * Gauntlet §160: DO NOT IMPLEMENT EACH MISSION AS ONE-OFF SCRIPT SPAGHETTI. Missions are
 * data plus a shared runtime. This is what lets the Jam's two missions become §171's
 * eight-to-twelve after the Jam without rewriting anything.
 *
 * §157: hidden truth lives here, authored and deterministic. The language evaluator maps
 * player text onto the intents declared below; it never decides what is true.
 */

import type { KnowledgeDomain } from '../knowledge/KnowledgeStore.js';
import type { IntentDefinition } from './intent.js';

/** §154 urgency classes. Not every request gets a countdown. */
export enum Urgency {
  /** No countdown. Ordinary repairs, context gathering, identification. */
  Calm = 'calm',
  /** No failure timer, but the contact grows impatient and circumstances move. */
  Soft = 'soft',
  /** Visible window because the fiction genuinely requires a decision soon. */
  Timed = 'timed',
  /** Short high-clarity window. Emergencies only. */
  Critical = 'critical',
}

/** §153 interaction tempos. A strong mission moves between them for pacing. */
export enum Tempo {
  Think = 'think',
  Respond = 'respond',
  Act = 'act',
}

/** A fact this mission can teach, declared up front so effects stay auditable. */
export interface MissionKnowledge {
  id: string;
  label: string;
  domain: KnowledgeDomain;
  /** Learned silently in passing rather than as a stated conclusion. */
  incidental?: boolean;
}

/** What happens when an intent is accepted at a beat. */
export interface BeatTransition {
  /** Beat to move to. */
  to: string;
  /** Knowledge ids (from the mission's `knowledge`) recorded on this path. */
  learn?: string[];
  /**
   * What the world does in response - §209: the environment performs the instruction,
   * the contact's body does not. Consumed by the Contact View to drive tween/VFX cues.
   */
  environment?: string;
  /** Fires a VFX library effect by name. */
  vfx?: string;
}

export interface Beat {
  id: string;
  /** What the contact transmits on arrival. */
  say: string;
  tempo: Tempo;
  /**
   * Knowledge recorded simply for having heard this line.
   *
   * Prefer this over transition-level `learn` for anything the contact *says*. Attaching
   * a fact to a transition means a player who phrases something awkwardly, detours
   * through a clarification beat and comes back has silently lost it - which for an
   * incidental callback seed (§214) is an invisible, unrecoverable failure.
   * If they heard it, they know it.
   */
  learn?: string[];
  /** Intent id -> transition. */
  on: Record<string, BeatTransition>;
  /** Where an unmatched message goes. §159: clarify, never show a red X. */
  onUnrecognised?: BeatTransition;
  /** Where a tied match goes. §164: ask what they meant. */
  onAmbiguous?: BeatTransition;
  /** Present only on terminal beats. */
  outcome?: MissionOutcome;
}

/** §163: outcomes are a spectrum, not success/failure. */
export enum OutcomeKind {
  Solved = 'solved',
  PartiallySolved = 'partially-solved',
  Misunderstood = 'misunderstood',
  Deferred = 'deferred',
  Unresolved = 'unresolved',
}

export interface MissionOutcome {
  kind: OutcomeKind;
  /** Closing line from the contact. */
  say: string;
  /** Trust delta for this contact. Behaviour first, meter second (§164). */
  trust: number;
  /**
   * Cross-domain bridges to record on resolution (§107 / §117). These are the events
   * that graft separate limbs of the tree together, so they are authored rather than
   * inferred - §107 forbids generating meaningless combinations to inflate progression.
   */
  connects?: Array<{ a: string; b: string; label: string }>;
}

/**
 * A dependency on something learned earlier - the callback (§214: the highest-value
 * element in the Jam build, protected above everything but the first 90 seconds).
 */
export interface MissionRequirement {
  /** Fact id that must already be known and not disputed. */
  factId: string;
  /**
   * Beat to enter when the player does NOT have it. §163 forbids dead ends: this must
   * be a recovery path that lets the player obtain or work around the missing fact.
   */
  ifMissingBeatId: string;
  /** Beat to enter when they do. */
  ifKnownBeatId: string;
}

export interface MissionDefinition {
  id: string;
  version: number;
  contactId: string;
  /** Contact View scene this mission stages in. */
  sceneId: string;
  archetype: 'diagnosis';
  urgency: Urgency;
  /** Authored ground truth, for QA and for the runtime's own assertions. */
  hiddenTruth: {
    summary: string;
    /** Intents required for a full solve. */
    requiredIntents: string[];
    /** Intents that make things worse. */
    unsafeIntents: string[];
  };
  knowledge: MissionKnowledge[];
  intents: IntentDefinition[];
  beats: Beat[];
  openingBeatId: string;
  /** Present when this mission gates on earlier knowledge. */
  requires?: MissionRequirement;
}

export interface Contact {
  id: string;
  /** Display name. Rendered via textContent only - never innerHTML. */
  name: string;
  /** Where they are, for the globe. */
  location: string;
  /** One line the player sees before opening the request (§164: names gain meaning). */
  teaser: string;
}
