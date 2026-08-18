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

import { gradeDevice } from './device.js';
import { workLock } from './lock.js';
import { readsAsYesNo, resolveIntent } from './intent.js';
import { HOLD_FRAMING } from './types.js';

/**
 * A cue that moves the contact's body rather than the room.
 *
 * Only used to answer "did this route already ask for a gesture", so it matches the
 * shape rather than the four names - a fifth clip added to gestures.ts should not have
 * to be added here as well to keep working.
 */
const GESTURE_CUE = /^prop\.(point|surprised|reacting|nod)/;

/** Marks a confirmation that belongs to a device rather than to an intent. */
const DEVICE_PENDING = '__device__';

import type { DeviceSubmission } from './device.js';

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
  /**
   * What the device reported after a submission that did not solve it.
   *
   * A short phrase from the device rather than a list of what is wrong. On the relation
   * board that is a count - naming the wrong links turns it into elimination the player
   * can grind without listening. On the pipe grid it is how far the water got, which is
   * what somebody at the tap can actually hear.
   */
  deviceNote?: string;
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
   * A device answer that has been questioned rather than acted on.
   *
   * Separate from `pendingIntent` because it is not an intent - there is no id to look
   * up in the beat's `on` map, only a submission that has already been graded and found
   * wanting. Both are answered by `confirm`, which checks this one first.
   */
  private pendingDevice: DeviceSubmission | null = null;
  /**
   * How many pins are currently up.
   *
   * Held here rather than in the console because it is a fact about the LOCK, not about
   * the panel - the board is a view of it and a second copy would be a second truth. Also
   * what the surface reads to draw the pins that are already set.
   */
  private lockSet = 0;

  /** For the console: how far the cylinder has turned. */
  public lockProgress(): number {
    return this.lockSet;
  }
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
    /*
     * A questioned device answer is settled here, before any intent is looked at.
     *
     * Yes fits the part and loses the request; no puts the bag back with nothing
     * spent. The submission is cleared either way, so a stale one cannot be applied
     * by the next confirmation the player happens to answer.
     */
    const pending = this.pendingDevice;
    this.pendingDevice = null;
    if (pending) {
      const device = this.getCurrentBeat().device;
      if (!accepted || !device) {
        return { say: 'Right. What else, then?', learned: [], clarifying: true };
      }
      // Graded here rather than when it was picked, so the yes is the moment it counts.
      const graded = gradeDevice(device, pending);
      return this.applyTransition(graded.solved ? device.onSolved : device.onWrong);
    }

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

  /**
   * Submit the relation board.
   *
   * `links` maps person id to the slot the player dropped them in. Anything unlinked is
   * simply wrong rather than an error - a partly filled board is a legitimate guess, and
   * refusing to grade it would be the game telling the player off for trying.
   */
  /**
   * Submit whatever device the current beat is showing.
   *
   * One entry point for every kind: the runtime grades by kind and the transitions are
   * the same shape either way, so a new device is a new case in `gradeDevice` and
   * nothing else.
   */
  /**
   * How many of this request's jobs are done, out of how many there are.
   *
   * Read off `visited`, which the runtime already keeps for hint gating - so nothing new is
   * tracked and the count cannot disagree with where the player has actually been. Null for
   * a request that has not declared any, which is all of them but one.
   */
  public taskProgress(): { done: number; total: number } | null {
    const tasks = this.definition.tasks;
    if (!tasks?.length) return null;
    return {
      done: tasks.filter((task) => this.visited.has(task.beatId)).length,
      total: tasks.length,
    };
  }

  public submitDevice(submission: DeviceSubmission): MissionStep {
    const device = this.getCurrentBeat().device;
    if (this.finished || !device || device.kind !== submission.kind) {
      return { say: '', learned: [], clarifying: false };
    }

    /*
     * The bag asks about EVERY part, right or wrong, and grades only after the answer.
     *
     * It used to grade first and question the failures, which meant being asked was the
     * answer: a player who noticed that never had to read a word Tomas said, and the
     * right part completed the request without them ever choosing it. Now he says what
     * the part does - the same register whichever it is - and asks whether to fit it.
     * Reading him IS the puzzle, and saying yes is the commitment either way.
     *
     * Nothing is decided here, which is the other half. The submission is held and graded
     * in `confirm`, so a yes is what resolves or loses the request and nothing has been
     * spent before it.
     */
    /**
     * Taking the machine is not answering the device.
     *
     * The grounds unit sends twice on one channel: `cleared: 0` when the player presses
     * yes, and the real figure when the rig has finished with it. The first is a request
     * for the controls and must not be graded - grading a submission the moment the
     * player accepts would resolve the request before they had cut a blade.
     *
     * So the accept returns nothing but the cue that hands the machine over, and the beat
     * does not move. The rig fires `take`, the player drives, and the second submission
     * comes back through this same door with something to grade.
     */
    if (device.kind === 'unit' && submission.kind === 'unit' && submission.cleared <= 0) {
      return { say: '', learned: [], clarifying: false, environment: device.take };
    }

    /**
     * The lock is worked one pin at a time, and only a DROP is a wrong answer.
     *
     * ## What changed and why
     *
     * It used to take a whole order and grade it in one go, which made every attempt a
     * submission and every submission a beat transition - so the player composed five picks
     * blind, pressed send, and read a paragraph about what he had felt. All the information
     * in the puzzle arrived after the decision that needed it.
     *
     * Now each press sends the confirmed prefix plus the one pin being tried. Three things
     * follow, and none of them is a change to the mechanic:
     *
     * 1. A pin that SETS is not an answer to be graded. It is progress, so the beat does
     *    not move - he says what he felt in that one pin's own words and the board keeps
     *    the prefix. The `sets` and `early` lines have been authored per pin since this
     *    mission was written and were being concatenated into one status string; they are
     *    what a single press should say, one at a time, and now they do.
     * 2. A pin that DROPS the set is the wrong answer, and that is the only thing that
     *    reaches `onWrong`. The cost is unchanged - everything falls and the order has to
     *    be given again from the top - which is what keeps this a memory puzzle rather than
     *    a search: testing the third position means re-entering the first two.
     * 3. The fifth pin setting IS the solve. There is nothing left to submit, so nothing
     *    has to be pressed to submit it.
     */
    if (device.kind === 'lock' && submission.kind === 'lock') {
      const reading = workLock(device.lock, submission.order);
      if (!reading.solved && reading.correct === submission.order.length) {
        this.lockSet = reading.correct;
        return {
          say: reading.felt[reading.felt.length - 1] ?? '',
          learned: [],
          clarifying: false,
          environment: `prop.set:lock`,
        };
      }
      if (!reading.solved) {
        this.lockSet = 0;
        // The line he says as it drops, then the transition, which carries `wrongSay`.
        const stuck = reading.felt[reading.felt.length - 1];
        const step = this.applyTransition(device.onWrong);
        return {
          ...step,
          say: [stuck, step.say].filter(Boolean).join('\n\n'),
          environment: ['prop.drop:lock', step.environment].filter(Boolean).join(','),
        };
      }
      this.lockSet = 0;
      return this.applyTransition(device.onSolved);
    }

    if (device.kind === 'kit' && submission.kind === 'kit') {
      const picked = device.items.find((item) => item.id === submission.itemId);
      this.pendingDevice = submission;
      return {
        say: [device.wrongSay, picked?.remark].filter(Boolean).join('\n\n'),
        learned: [],
        clarifying: false,
        confirming: {
          intentId: DEVICE_PENDING,
          question: `Have him fit the ${picked?.name.toLowerCase() ?? 'part'}?`,
        },
      };
    }

    const graded = gradeDevice(device, submission);
    if (graded.solved) return this.applyTransition(device.onSolved);

    const step = this.applyTransition(device.onWrong);

    /*
     * Where a wrong answer is explained depends on what the explanation IS.
     *
     * Most devices report a measurement - two of five are right, the water reaches
     * here and stops - and that belongs beside the device, in the status line, where
     * the player is looking when they press send.
     *
     * The bag reports a sentence in the contact's own voice: "that is for putting two
     * wires together, and they are already together, that is the whole trouble". That
     * is dialogue. It belongs in the conversation, and it does not fit in an eleven
     * pixel status line beside a button.
     *
     * It was going to the status line, which ignored it, so a wrong pick produced a
     * bare "No - hold on." in a scrolled transcript and no change anywhere else -
     * reported, reasonably, as the send button not working at all.
     */
    const spoken = device.kind === 'kit' && graded.note
      ? `${device.wrongSay}

${graded.note}`
      : device.wrongSay;

    return {
      ...step,
      say: spoken,
      clarifying: true,
      // Not duplicated into the panel for the bag - it has just been said out loud.
      deviceNote: device.kind === 'kit' ? undefined : graded.note,
    };
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
      environment: this.environmentFor(transition, next),
      vfx: transition.vfx,
      learned,
      outcome: next.outcome,
      failure: next.failure,
      clarifying: false,
    };
  }

  /**
   * Every arrival gets a camera, whether or not the author remembered one.
   *
   * The camera holds its last shot by default, which is right between two beats about the
   * same thing and wrong the moment the subject changes. Across the eight missions, 124
   * of 134 transitions carry no camera cue - so "holds until told otherwise" meant the
   * frame was decided by whichever earlier beat last had an opinion, which is how the
   * player ended up watching a puddle for the back half of a request about a radio.
   *
   * Resolution order, most specific first:
   *
   *   1. a `camera.*` cue on the transition - an authored move for this route in
   *   2. the destination beat's own `framing` - what this beat is about
   *   3. `camera.pan:default` - the establishing shot, which is never wrong, only plain
   *
   * The transition's prop cues survive in all three cases; only the framing is supplied.
   * Camera first in the string to match how these are authored by hand, and because
   * `applyCue` merges results by key - two camera cues would silently fight, and the
   * order decides which one lands.
   *
   * `framing: 'hold'` opts a beat out and keeps whatever shot is up. It exists for the
   * clarify beats: every mission routes `onUnrecognised` and `onAmbiguous` through a
   * transition, so without it, mistyping a word while reading the back of the set would
   * throw the camera back to the establishing shot - punishing the player for the
   * parser's failure, and taking away the thing they were looking at while they retype.
   */
  private environmentFor(transition: BeatTransition, beat: Beat): string {
    const cues = (transition.environment ?? '')
      .split(',')
      .map((cue) => cue.trim())
      .filter(Boolean);

    /*
     * The gesture, and here the DESTINATION wins - which is the opposite of the framing
     * rule below, on purpose.
     *
     * A transition's gesture is `point`: the contact showing the player the thing on the
     * way out of the opening. A beat's is a reaction to what has just happened. Where
     * both apply the reaction is the true one every time - telling Vasile to cut into a
     * live run and arriving at the beat where the wall lets go should not be a man
     * gesturing helpfully at his pipework.
     *
     * So the beat's gesture replaces any the route was carrying, rather than being
     * skipped by it. Getting this backwards is not a crash; it is a point where a recoil
     * should be, on four edges, which is the kind of thing that ships.
     */
    const out = beat.gesture ? cues.filter((cue) => !GESTURE_CUE.test(cue)) : [...cues];
    if (beat.gesture) out.push(beat.gesture);

    if (cues.some((cue) => cue.startsWith('camera.'))) return out.join(',');
    if (beat.framing === HOLD_FRAMING) return out.join(',');

    return [beat.framing ?? 'camera.pan:default', ...out].join(',');
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
