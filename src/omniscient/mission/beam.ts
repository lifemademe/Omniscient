/**
 * The torch, and how a real-time beat stays a conversation game.
 *
 * The fourth device, and the one the plan flagged as riskiest: a live aiming beat inside a
 * turn-based game about talking to people. The danger is not difficulty, it is genre - one
 * action sequence in five hours of conversation reads either as a spike of adrenaline or
 * as the moment the game stopped being itself, and the difference is entirely in what is
 * being asked of the player.
 *
 * ## What makes it not an action game
 *
 * The player does not aim. They cannot: OMNISCIENT_ has no hands, and every other request
 * in the game turns on that. What they do is TELL a frightened person which way to point,
 * and the person does it - late, because people are late, and imprecisely, because they
 * are running. The beam swings toward where it was told to go at a human rate.
 *
 * So the skill is not tracking. It is reading where the follower is GOING and calling it
 * early enough that a slow hand gets there in time - which is a prediction problem, and
 * prediction is the thing this machine is for. A player who tries to track will always be
 * behind. A player who leads will hold him.
 *
 * ## Deterministic
 *
 * §123: the follower's path is authored, not random, so the same call at the same moment
 * always produces the same result and the beat can be tested. It is a chase on rails, and
 * the tension comes from the rails being tight rather than from them being unknown.
 */

/** Where things are, along a single line the contact is running down. */
export interface BeamState {
  /** Follower's position, -1 (hard left) to 1 (hard right). */
  follower: number;
  /** Where the beam is actually pointing, same scale. */
  beam: number;
  /** Where the player has told the contact to point it. */
  aim: number;
  /** Seconds the beam has been on the follower, total. */
  held: number;
  /** Seconds elapsed. */
  elapsed: number;
  /** True once the follower has been blinded long enough to break off. */
  blinded: boolean;
  /** True once the contact has been caught. */
  caught: boolean;
}

export interface BeamSpec {
  /** Seconds of accumulated light needed to make the follower give up. */
  holdToBlind: number;
  /** Seconds before he reaches the contact if never blinded. */
  patience: number;
  /** How fast the beam swings toward the aim, in units per second. */
  swing: number;
  /** How wide the beam is - the follower is lit within this distance of it. */
  width: number;
  /** Deterministic path, sampled by time (§123). */
  path: Array<{ at: number; to: number }>;
}

export function initialBeam(): BeamState {
  return {
    follower: -0.7,
    beam: 0,
    aim: 0,
    held: 0,
    elapsed: 0,
    blinded: false,
    caught: false,
  };
}

/**
 * Where the follower is at a given moment.
 *
 * Linear between authored waypoints, which is enough: what the player is reading is
 * DIRECTION, and a straight line between two points has an unambiguous one. Smoothing it
 * would make the lead harder to judge without making the chase feel any different.
 */
export function followerAt(spec: BeamSpec, time: number): number {
  const path = spec.path;
  if (!path.length) return 0;
  if (time <= path[0].at) return path[0].to;

  for (let i = 1; i < path.length; i++) {
    if (time <= path[i].at) {
      const span = path[i].at - path[i - 1].at || 1;
      const t = (time - path[i - 1].at) / span;
      return path[i - 1].to + (path[i].to - path[i - 1].to) * t;
    }
  }
  return path[path.length - 1].to;
}

/**
 * Advance the chase by one frame.
 *
 * The beam does not jump to the aim - it travels at `swing`, which is the whole mechanic.
 * That lag is the frightened hand, and it is what turns "point at him" into "point where
 * he is about to be".
 */
export function stepBeam(spec: BeamSpec, state: BeamState, deltaTime: number): BeamState {
  if (state.blinded || state.caught) return state;

  const elapsed = state.elapsed + deltaTime;
  const follower = followerAt(spec, elapsed);

  // Move the beam toward where it was told to go, no faster than a hand can swing.
  const gap = state.aim - state.beam;
  const step = Math.min(Math.abs(gap), spec.swing * deltaTime) * Math.sign(gap);
  const beam = state.beam + step;

  /**
   * Continuous, not accumulated - and this is the whole beat.
   *
   * `held` used to keep counting across gaps, so light that landed on him for a second
   * here and a second there eventually added up. That made the chase winnable by DOING
   * NOTHING: leaving the beam at its starting aim of 0 let his authored path wander back
   * and forth through it, and the total passed 1.5s about four seconds in. Watching it run
   * for the first time, the request solved itself while I made no calls at all - which no
   * harness caught, because every test made calls.
   *
   * Resetting on the first frame he is out of the beam changes the ask from "get some
   * light on him" to "KEEP the light on him", which is what the fiction says - he has to
   * believe he has been seen properly - and is the only version that cannot be beaten by
   * standing still.
   */
  const lit = Math.abs(beam - follower) <= spec.width;
  const held = lit ? state.held + deltaTime : 0;

  return {
    ...state,
    elapsed,
    follower,
    beam,
    held,
    blinded: held >= spec.holdToBlind,
    caught: elapsed >= spec.patience,
  };
}

/**
 * Replay a whole chase from the calls the player made.
 *
 * The panel runs the live simulation so the player can see it, but the panel does not get
 * to decide what happened - §157 is explicit that the presentation layer never invents
 * mission truth, and "did he get away" is mission truth. So the console sends up the list
 * of calls it recorded, with the moment each was made, and the runtime replays them.
 *
 * Deterministic and side-effect free, so the harness can walk a chase without a frame loop
 * and the same calls always produce the same ending (§123).
 */
export function replayBeam(
  spec: BeamSpec,
  calls: Array<{ at: number; to: number }>
): BeamState {
  // A fixed step rather than the real frame times: replaying at whatever rate the
  // player's machine happened to run would make the outcome depend on their hardware.
  const STEP = 1 / 60;
  const ordered = [...calls].sort((a, b) => a.at - b.at);

  let state = initialBeam();
  let next = 0;

  while (!state.blinded && !state.caught && state.elapsed < spec.patience + STEP) {
    while (next < ordered.length && ordered[next].at <= state.elapsed) {
      state = { ...state, aim: Math.max(-1, Math.min(1, ordered[next].to)) };
      next += 1;
    }
    state = stepBeam(spec, state, STEP);
  }

  return state;
}
