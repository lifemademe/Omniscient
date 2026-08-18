import type { BeamSpec } from '../mission/beam.js';
import type { Trail } from '../mission/breadcrumbs.js';
import type { Hop } from '../mission/pursuit.js';
import type { ClueId, Evidence, Trace } from '../mission/traces.js';

/**
 * The intervention surface - OMNISCIENT_'s phone.
 *
 * Gauntlet §222: the real QR-paired device is the target, but it is built as a
 * progressive enhancement behind this interface and never as a load-bearing dependency.
 * Gameplay talks to `InterventionSurface` and never to a transport, so:
 *
 *   - LocalSurface (on-screen phone) always works and always ships.
 *   - RemoteSurface (paired device) can be added, or cut on 30 August, without touching
 *     a single line of mission or session code.
 *
 * §91 keeps the division of labour: the PC shows the world and the consequence, the
 * phone is where the player intervenes.
 */

/** §162: the phone changes tool mode as the mission demands. */
export type SurfaceMode = 'chat' | 'notes' | 'action';

export type TranscriptSource = 'contact' | 'omniscient' | 'system';

export interface TranscriptEntry {
  source: TranscriptSource;
  /**
   * Speaker label. UNTRUSTED for HTML - contact names are content and, on a remote
   * surface, arrive over the network. Renderers must use textContent.
   */
  name: string;
  body: string;
}

/** An observation the player can open (§131). */
export interface HintView {
  id: string;
  summary: string;
  /** Set once opened - the phone keeps what it has already told you. */
  detail?: string;
  /** Words to emphasise: the vocabulary the player can use back. */
  keywords?: string[];
}

/** A recorded fact, shown in RECORDS when relevant to the open request (§19). */
export interface RecordView {
  id: string;
  label: string;
  /** Where it came from, e.g. "Mirela Vasc". */
  source: string;
  /** True for notes the player wrote themselves after a failure (§170). */
  playerWritten: boolean;
}

/**
 * The relation board: boxes to connect, when a beat asks for a shape rather than a
 * sentence.
 *
 * Carries no answers. The surface can render this, let the player wire it up and send
 * their links back, and it still has no idea which of them are right - §157's boundary,
 * held at the presentation layer too.
 */
export interface BoardPersonView {
  id: string;
  /** UNTRUSTED for HTML. Renderers must use textContent. */
  name: string;
  /** The one thing the contact said about them. Also untrusted. */
  note: string;
}

export interface BoardSlotView {
  id: string;
  label: string;
}

/** One cell of a pipe run, as the console needs to draw it. Carries no solution. */
export interface PipeCellView {
  shape: 'straight' | 'bend' | 'tee' | 'cross' | 'blank';
  /** Quarter turns the piece already has, before the player touches it. */
  turn: number;
  /** Plumbed in - the player cannot turn this one. */
  fixed: boolean;
}

export interface PipeView {
  columns: number;
  rows: number;
  cells: PipeCellView[];
  source: number;
  drain: number;
}

/**
 * Whatever device the current beat is showing.
 *
 * Discriminated so the panel picks a renderer rather than guessing, and carrying no
 * answers of any kind - the surface can draw a device, let the player work it and send
 * the result back, and still have no idea whether it is right. §157's boundary, held at
 * the presentation layer.
 */
export type DeviceView =
  | {
      kind: 'relations';
      prompt: string;
      people: BoardPersonView[];
      slots: BoardSlotView[];
      /** Set after a wrong submission: what the device reported, in words. */
      note?: string;
    }
  | { kind: 'pipes'; prompt: string; grid: PipeView; note?: string }
  /**
   * The surveillance board.
   *
   * The whole fleet crosses the link, unfiltered. That is deliberate and it is the one
   * device where it is: the narrowing is the gameplay, so the panel must be able to do it,
   * which means it needs everything the network can see plus the partial facts the police
   * actually have. Filtering server-side would be sending the answer.
   */
  /**
   * The chase. Hops cross whole, including which option is the answer.
   *
   * The panel needs it: it plays the sequence locally, hop by hop, so it has to know when
   * contact was kept in order to show the next sighting. The runtime still grades the
   * submitted picks - §157 - so the console knowing the route changes nothing about who
   * decides whether the player got it right.
   */
  | { kind: 'pursuit'; prompt: string; hops: Hop[]; note?: string }
  /** The cold trail. The pool crosses whole; deciding which of it matters is the game. */
  | { kind: 'trail'; prompt: string; trail: Trail; note?: string }
  | {
      kind: 'traces';
      prompt: string;
      fleet: Trace[];
      evidence: Evidence;
      reveal: ClueId[];
      note?: string;
    }
  | {
      kind: 'lock';
      prompt: string;
      /** Pins in their physical order along the lock. Carries no binding order. */
      pins: Array<{ id: string; label: string }>;
      note?: string;
    }
  | {
      kind: 'beam';
      prompt: string;
      /**
       * The chase, in full.
       *
       * This one DOES carry its own rules, unavoidably: the console has to run the
       * simulation live or the player cannot see what they are doing. It stays honest
       * because the console does not get to decide the outcome - it sends up the calls it
       * recorded and the runtime replays them (§157).
       */
      spec: BeamSpec;
      note?: string;
    };

/**
 * A proposed reading of what the player just said, awaiting yes/no.
 *
 * §157: the evaluator interprets what the player meant and never invents mission truth.
 * Surfacing the interpretation makes that boundary visible - the player can see the
 * reading and correct it, rather than discovering it through a consequence.
 */
export interface Confirmation {
  intentId: string;
  /** "Do you mean Mirela should take the power off?" */
  question: string;
}

/** How a contact stands with OMNISCIENT_. See KnowledgeStore.ContactStanding. */
export interface StandingView {
  /** 0-1. */
  trust: number;
  jobs: number;
  lost: number;
}

export interface SurfaceState {
  mode: SurfaceMode;
  contactName: string;
  /** Where they are calling from, e.g. "Coastal repair shop, Portu Vech". */
  contactLocation?: string;
  /** Trust and shared history, shown alongside the call. */
  standing?: StandingView;
  /** Full exchange so far. Renderers may diff or redraw. */
  transcript: TranscriptEntry[];
  /** True when the surface should accept a response. */
  awaitingInput: boolean;
  /** Optional hint under the input, e.g. the current tempo. */
  hint?: string;
  /** Observations available on the phone. */
  hints?: HintView[];
  /** Records relevant to this request. */
  records?: RecordView[];
  /**
   * Example replies for the current beat, shown as chips under the input.
   *
   * Tapping one sends it as ordinary text, so it goes through exactly the same
   * interpretation as anything typed by hand - these teach the register, they are not a
   * dialogue menu and the player is never restricted to them.
   */
  suggestions?: string[];
  /** When set, the surface asks yes/no instead of accepting free text. */
  confirming?: Confirmation;
  /** When set, the request has been lost and the player may write themselves a note. */
  failure?: { summary: string; lesson?: string };
  /**
   * The request is lost and the note has not been written yet, so leaving is refused.
   *
   * Separate from `failure` because the two stop being true at the same moment: the
   * failure stays on screen while the player types, and the lock lifts the instant they
   * send. A surface should grey its exits while this is set.
   */
  awaitingNote?: boolean;
  /**
   * A standing message shown where the failure panel was, rather than in the transcript.
   *
   * Exists for one line - what happens to a request after its note is written - which was
   * pushed into the log and reported as impossible to find. The log scrolls, and a lost
   * request closes a few seconds later; anything the player has to be told at the end of
   * one has to hold still.
   */
  notice?: string;
  /** When set, the surface shows a device alongside the conversation. */
  device?: DeviceView;
}

/** §160: gestures compress an instruction into an immediate machine command. */
export type Gesture = 'swipe-left' | 'swipe-right' | 'swipe-up' | 'swipe-down' | 'hold' | 'tap';

export type PlayerMessage =
  | { kind: 'text'; text: string }
  | { kind: 'gesture'; gesture: Gesture }
  | { kind: 'mode'; mode: SurfaceMode }
  /** Opened an observation on the phone. */
  | { kind: 'hint'; hintId: string }
  /** Answered a yes/no reading of their last message. */
  | { kind: 'confirm'; accepted: boolean }
  /** Wrote themselves a note after losing a request (§170). */
  | { kind: 'note'; text: string }
  /** Stepped back out of the request to the globe. */
  | { kind: 'leave' }
  /**
   * Where the player has just told the contact to point something.
   *
   * Presentation, not truth, and the distinction matters because §157 is strict about the
   * console never deciding an outcome. It does not: the chase's result is still the list
   * of calls, replayed by the runtime at the end. This is the same information arriving
   * early so the WORLD can act on it - Sanda's actual torch swings when the player calls
   * it, instead of the beam existing only as a wedge on a panel while the diorama behind
   * shows a woman holding a light that never moves.
   *
   * §209 is the rule being served: the environment performs the instruction.
   */
  | { kind: 'aim'; to: number }
  /** Sent a device. The payload is discriminated to match what was being shown. */
  | {
      kind: 'device';
      submission:
        | { kind: 'relations'; links: Record<string, string> }
        | { kind: 'pipes'; rotations: number[] }
        | { kind: 'lock'; order: string[] }
        | { kind: 'beam'; calls: Array<{ at: number; to: number }> }
        | { kind: 'traces'; traceId: string }
        | { kind: 'pursuit'; picks: string[] }
        | { kind: 'trail'; picks: string[] };
    };

export interface InterventionSurface {
  /** Which transport this is. Diagnostics and telemetry only - gameplay must not branch on it. */
  readonly kind: 'local' | 'remote';

  /** True once the surface can present and receive. */
  readonly connected: boolean;

  attach(): Promise<void>;
  detach(): void;

  /** Render the current state. Called whenever the session advances. */
  present(state: SurfaceState): void;

  /** Subscribe to player input. Returns an unsubscribe function. */
  onMessage(handler: (message: PlayerMessage) => void): () => void;
}
