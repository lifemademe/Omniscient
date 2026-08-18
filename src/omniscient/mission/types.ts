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
import type { PhotoSpec } from '../link/photographs.js';
import type { BeamSpec } from './beam.js';
import type { LockSpec } from './lock.js';
import type { PipeGrid } from './pipes.js';
import type { Trail } from './breadcrumbs.js';
import type { Hop } from './pursuit.js';
import type { ClueId, Evidence, Trace } from './traces.js';

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

/**
 * Something the player can notice and ask about.
 *
 * §131: the contact's environment must contain usable evidence, and the player should be
 * able to point at it. Hints are that evidence made addressable - a short observation on
 * the phone, which when opened highlights the thing in the Contact View and says more.
 *
 * §106 / §95 ASSOCIATIVE RECALL: hints surface what is *observable*, never the answer.
 * "There is water on the floor" is a hint. "The connector is corroded" is the solution.
 */
export interface MissionHint {
  id: string;
  /** One line, as OMNISCIENT_ would log an observation. */
  summary: string;
  /** What the player learns by opening it. Still observation, not diagnosis. */
  detail: string;
  /**
   * Words to emphasise in the summary and detail - the vocabulary the player can use
   * back. A hint that says "there is water on the floor" is only useful if the player
   * realises "water" is a word the game will understand.
   *
   * Declared as data rather than markup so the renderer keeps building text nodes and
   * the safe-UI rule holds without exception.
   */
  keywords?: string[];
  /** Contact View cue fired when opened, e.g. "prop.highlight:connector-b". */
  cue?: string;
  /**
   * Things in the box, shown as prints the player can turn over.
   *
   * A hint is normally a sentence about something in the room; this is the one that
   * hands the room's contents over. Authored as people rather than as pictures - a name
   * and roughly how old they look - because what a print of them looks like is the
   * console's business, not the mission's. See link/photographs.
   *
   * They carry no relationships and must not. See the same note.
   */
  photographs?: PhotoSpec[];
  /**
   * Hidden until the beat that makes it observable. A hint about the back of the set is
   * not available until somebody has turned the set around.
   */
  revealedBy?: string;
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

/**
 * A person to be placed on the relation board.
 *
 * `answer` is the slot id they actually belong in. Authored, like everything else the
 * runtime checks - §157: the evaluator never decides what is true.
 */
export interface BoardPerson {
  id: string;
  /** Rendered via textContent only. */
  name: string;
  /** The one thing the contact said about them, kept beside the box as a reminder. */
  note: string;
  /** Slot id this person belongs in. */
  answer: string;
}

export interface BoardSlot {
  id: string;
  label: string;
}

/**
 * Anything on the console solved by DOING rather than by saying.
 *
 * The relation board was the first, written as a bespoke beat property with its own
 * runtime method, surface field and player message. That is the right shape for one of
 * something and the wrong shape for three - the plumber, the thief and the torch would
 * each have arrived with a parallel copy of the same four hooks.
 *
 * So a device is a discriminated union with ONE hook at each layer: one beat property,
 * one `submitDevice`, one message kind, one panel that picks a renderer. A fourth device
 * is a new member and a new renderer; nothing else moves. §160 still holds - this is data
 * walked by a shared runtime, not a script.
 */
export type Device =
  | RelationBoard
  | PipeBoard
  | LockBoard
  | BeamBoard
  | TraceBoard
  | PursuitBoard
  | TrailBoard;

export interface DeviceBase {
  /** The question, in the contact's voice. */
  prompt: string;
  onSolved: BeatTransition;
  /**
   * Where a wrong submission goes. Normally back to the same beat - the device stays up
   * and the player tries again. §159: never a failure, always another go.
   */
  onWrong: BeatTransition;
  /** What the contact says on a wrong submission, before whatever the device reports. */
  wrongSay: string;
}

/**
 * Connect-the-boxes: a relationship the contact can describe but cannot assemble.
 *
 * A wrong submission is never a failure (§159). The contact says how many are right and
 * nothing more, so guessing costs attention rather than progress, and the way through is
 * to go back and re-read what she actually said.
 */
export interface RelationBoard extends DeviceBase {
  kind: 'relations';
  people: BoardPerson[];
  /** Every slot offered, including ones nobody belongs in. */
  slots: BoardSlot[];
}

/**
 * A run of pipe to be rotated until it carries water.
 *
 * Graded by flood fill rather than against a stored answer (see mission/pipes.ts). More
 * than one arrangement usually works, and a puzzle that accepts only the author's is one
 * that tells a correct player they are wrong.
 */
export interface PipeBoard extends DeviceBase {
  kind: 'pipes';
  grid: PipeGrid;
}

/**
 * A lock, worked by somebody else's hands.
 *
 * Deduction rather than dexterity - see mission/lock.ts. The player names an order and the
 * contact reports what they feel; the player never touches a pin, because OMNISCIENT_ has
 * no hands and the entire premise is that this is the half it CAN do.
 */
export interface LockBoard extends DeviceBase {
  kind: 'lock';
  lock: LockSpec;
}

/**
 * A torch, aimed by somebody running.
 *
 * The game's one real-time beat. The player does not aim - they CALL, and a frightened
 * hand swings toward it at a human rate, which turns tracking into prediction. See
 * mission/beam.ts for why that distinction is what keeps this a conversation game.
 */
export interface BeamBoard extends DeviceBase {
  kind: 'beam';
  beam: BeamSpec;
}

/**
 * The surveillance board: a district of traffic, and the facts the police have.
 *
 * The only device in the game where the player's answer is an IDENTIFICATION rather than
 * an arrangement. The other four ask for a configuration - which pipes, which order, where
 * to point - and are graded by simulating it. This one asks "which of these is it", and is
 * graded by the same predicate that generated the puzzle, so the device cannot disagree
 * with its own evidence.
 *
 * The fleet is not stored here as an answer. It is stored as data, and mission/traces.ts
 * decides what matches - §157 in its strongest form, since the whole point is that the
 * player is doing the deciding.
 */
export interface TraceBoard extends DeviceBase {
  kind: 'traces';
  fleet: Trace[];
  evidence: Evidence;
  /**
   * The order the officer hands the facts over, which is the order the count collapses in.
   * Authored so the drama is designed rather than incidental - the big drops come first.
   */
  reveal: ClueId[];
}

/**
 * The camera chase: a sequence of hops, played through in one sitting.
 *
 * One device rather than one per hop, which is a real choice. A chase broken into separate
 * beats would put a line of dialogue between every guess and turn a pursuit into a
 * conversation about a pursuit. Here the panel runs the whole thing and submits the picks
 * at the end, the way the beam board plays a chase in real time and reports afterwards.
 */
export interface PursuitBoard extends DeviceBase {
  kind: 'pursuit';
  hops: Hop[];
}

/**
 * The cold trail: a pool of fragments, and the question of which are one car.
 *
 * Carries the whole Trail rather than a list of ids, because the grader works from the
 * reachability rule rather than from a stored answer - see mission/breadcrumbs.ts. The
 * device cannot disagree with its own evidence if it never holds an answer to disagree
 * with.
 */
export interface TrailBoard extends DeviceBase {
  kind: 'trail';
  trail: Trail;
}

/**
 * `Beat.framing` value meaning "whatever is on screen is still right".
 *
 * Not a shot id - it never reaches the Contact View, which would only warn that nothing
 * is registered under that name. See MissionRuntime.framingFor.
 */
export const HOLD_FRAMING = 'hold';

export interface Beat {
  id: string;
  /** What the contact transmits on arrival. */
  say: string;
  tempo: Tempo;
  /**
   * The camera cue this beat is ABOUT, applied on arrival unless the transition in
   * brought its own.
   *
   * Framing used to live only on transitions, which is the wrong owner and shipped a
   * bug the player found: asking Mirela what happened to the set recently pans down to
   * the puddle on the floor, and the next question - about the connectors on the back -
   * carried prop cues but no camera cue. The camera has no opinion of its own, so it sat
   * on the puddle for the rest of the request while the conversation moved on without it.
   *
   * A transition is an edge and there are four ways into most beats; a beat is a subject
   * and there is one. Declaring it here means every route in frames the same thing, and a
   * new route cannot forget. A transition may still override for a move that is about the
   * journey rather than the destination - swinging round to the back of the set is worth
   * seeing happen.
   *
   * Left undeclared, a beat falls back to `camera.pan:default`, so the worst case is the
   * establishing shot rather than a stranded one. `HOLD_FRAMING` opts out entirely. See
   * MissionRuntime.framingFor.
   */
  framing?: string;
  /**
   * The gesture the contact makes on ARRIVING here, as a `prop.<name>:contact` cue.
   *
   * Same argument as `framing`, and it was proved the same way. Authored on transitions
   * first, a recoil had to be repeated on all five routes into the beat where the wall
   * gives way - and on four of those beats the repeat collided with the point that leaves
   * the opening, so two gestures landed on one edge and the second crossfaded over the
   * first. A reaction belongs to the thing being reacted to, which is a beat.
   *
   * `point` is the exception and stays on transitions, because it is the only one that is
   * genuinely about DEPARTURE: the contact showing the player the thing on the way out of
   * the opening, to five different destinations. See mission-01's opening.
   *
   * A transition that carries its own gesture wins, so a route in can still do something
   * different. See MissionRuntime.environmentFor.
   */
  gesture?: string;
  /**
   * Present on a beat that puts a device up instead of asking for a sentence. The text
   * input stays live, so a player can still talk to the contact while it is open.
   */
  device?: Device;
  /**
   * Present on a beat that ends the request badly (§155 / §163).
   *
   * Failure has to be genuinely reachable, or the player never gets to write themselves
   * a note about what went wrong - and the whole learning loop is decorative.
   */
  failure?: MissionFailure;
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
  /**
   * Example replies for this beat, shown under the input.
   *
   * NOT a menu. Each one is sent as ordinary typed text and resolved by the same intent
   * matcher, so they demonstrate the *kind* of thing to say rather than replacing saying
   * it - the player can always type their own words, and these are there for the moment
   * where they have no idea what those words would be.
   *
   * Every beat that expects a reply needs these. Without them the game is a guessing game
   * about vocabulary, which is not the game.
   */
  suggest?: string[];
  /**
   * The intent a bare "yes" means here.
   *
   * Set it on every beat where the contact asks a direct question. Mirela ends a beat
   * with "Do you want me to get at it?" - answering "yes" has to do something, and
   * routing it through an intent id rather than straight to a transition means an unsafe
   * answer still gets confirmed first.
   */
  affirmIntent?: string;
  /** Intent id -> transition. */
  on: Record<string, BeatTransition>;
  /** Where an unmatched message goes. §159: clarify, never show a red X. */
  onUnrecognised?: BeatTransition;
  /** Where a tied match goes. §164: ask what they meant. */
  onAmbiguous?: BeatTransition;
  /** Present only on terminal beats. */
  outcome?: MissionOutcome;
}

/**
 * A lost request.
 *
 * §163: failure generates story and future state. §30: it should teach. The player is
 * shown plainly what went wrong and invited to write themselves a note, which is waiting
 * for them when the request comes off cooldown (§31).
 */
export interface MissionFailure {
  /** What actually happened, stated without blame. */
  summary: string;
  /**
   * The thing to do differently, in one plain sentence.
   *
   * Separate from `summary` because they do different jobs: the summary says what
   * happened, the lesson says what would have worked. Without it the player is told they
   * failed and then asked to write down why, which is a test rather than a lesson - the
   * point of §170 is that they leave knowing something, and the note they write is how
   * they put it in their own words, not how they discover it.
   */
  lesson?: string;
  /** Seconds before the request can be attempted again. */
  cooldownSeconds: number;
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
  /** Observable evidence the player can open on the phone (§131). At least three. */
  hints: MissionHint[];
  /**
   * How to phrase a proposed reading back to the player, per intent.
   *
   * "Do you mean Mirela should take the power off?" - the contact's name in the question
   * keeps it in fiction rather than reading as a parser prompt.
   */
  confirmations?: Record<string, string>;
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
