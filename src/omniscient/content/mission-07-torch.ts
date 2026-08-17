/**
 * MISSION 07 - Sanda Petrescu, walking home, and the only request with no time to think.
 *
 * The game's one real-time beat, and the plan flagged it as the riskiest thing in the
 * build. The danger was never difficulty - it is genre. One action sequence in a game
 * about talking to frightened people either lands as a spike of adrenaline or as the
 * moment the game stopped being itself, and the difference is entirely in what the player
 * is asked to do.
 *
 * So the player does not aim. They cannot: OMNISCIENT_ has no hands, which is the premise
 * of every other request in the game and is not suspended here because the scene is
 * urgent. Sanda holds the torch. The player says where to point it, and her hand gets
 * there when a frightened hand gets there - late. That lag turns tracking into
 * PREDICTION, which is the one thing this machine is actually for, and it is why a player
 * who chases him is always behind and a player who reads him holds him.
 *
 * §153: this is the game's only Tempo.Act beat, in its seventh request, after six that
 * have taught the player what the console is. Arriving last is deliberate.
 *
 * ## On what this is not
 *
 * Nobody is caught and nothing is done to anybody. The success state is that a man decides
 * this is more trouble than it is worth and turns down a side street, which is what
 * actually happens and is a better ending than any of the alternatives.
 */

import { KnowledgeDomain } from '../knowledge/KnowledgeStore.js';
import { TERMS } from '../mission/intent.js';
import { HOLD_FRAMING, OutcomeKind, Tempo, Urgency } from '../mission/types.js';

import { FACT_PINS_BIND_BY_TOLERANCE } from './mission-06-lock.js';

import type { BeamSpec } from '../mission/beam.js';
import type { MissionDefinition } from '../mission/types.js';

export const FACT_LIGHT_IS_A_DETERRENT = 'light-is-a-deterrent';
export const FACT_SANDA_ROUTE = 'sanda-walks-the-mill-road';

/**
 * The chase, on rails (§123).
 *
 * Twelve seconds of patience, one and a half of accumulated light to break him off, and a
 * beam that swings at 1.4 units a second against a follower who crosses the full width in
 * about two. He is faster than the hand. That is the entire design: it cannot be won by
 * pointing at him, only by pointing where he is going.
 *
 * The path reverses three times, at 2.4s, 5.1s and 8.0s, each one sooner after the last -
 * he is getting bolder, and a player who has learned the lead has to keep re-earning it.
 */
const FOLLOWING: BeamSpec = {
  holdToBlind: 1.5,
  patience: 12,
  swing: 1.4,
  /**
   * Narrower than it was, and he is quicker.
   *
   * Both numbers exist to make one thing impossible: winning without playing. With a 0.22
   * beam and a follower ambling at 0.4 units a second, a beam left at its starting aim
   * caught him for an unbroken 1.87 seconds - more than the 1.5 he needs - so the request
   * solved itself while the player did nothing. That was invisible to every harness,
   * because a harness that tests the device always makes calls.
   *
   * The dangerous case is not the middle of a leg, it is the TURNING POINTS: a beam parked
   * just inside an extreme catches his whole excursion out and back, which is twice the
   * width divided by his speed. Solved over every parked position from -1 to +1, this
   * path's worst unbroken run is 0.97s against the 1.5 he needs. Standing still cannot
   * win; at 0.8 units a second against a beam that swings at 1.4, leading him can.
   */
  width: 0.16,
  path: [
    { at: 0, to: -0.76 },
    { at: 1.9, to: 0.74 },
    { at: 3.7, to: -0.72 },
    { at: 5.6, to: 0.76 },
    { at: 7.4, to: -0.7 },
    { at: 9.4, to: 0.78 },
    { at: 12, to: -0.74 },
  ],
};

export const MISSION_07: MissionDefinition = {
  id: 'm07-torch',
  version: 1,
  contactId: 'sanda',
  sceneId: 'scene-mill-road',
  archetype: 'diagnosis',
  urgency: Urgency.Critical,

  hiddenTruth: {
    summary:
      'A man has been behind her for three streets. He is not going to be outrun and he ' +
      'is not going to be talked to. He will break off the moment he is lit long enough ' +
      'to believe he has been seen properly - which needs the beam led, not chased.',
    requiredIntents: ['USE_TORCH'],
    unsafeIntents: ['RUN_FOR_IT'],
  },

  knowledge: [
    {
      id: FACT_LIGHT_IS_A_DETERRENT,
      label: 'Somebody following stops when they believe they have been seen properly',
      domain: KnowledgeDomain.People,
    },
    {
      id: FACT_SANDA_ROUTE,
      label: 'The mill road: no houses on one side, and the lights out since spring',
      domain: KnowledgeDomain.Place,
    },
  ],

  hints: [
    {
      id: 'hint-behind',
      summary: 'He has matched her for three **streets**, and twice she has stopped.',
      detail:
        'She has crossed twice and he has crossed twice. That is not somebody walking the ' +
        'same way home - it is the only thing she needed to know and she already knows it.',
      keywords: ['streets', 'following', 'behind'],
    },
    {
      id: 'hint-lights',
      summary: 'The **lights** on the mill road have been out since spring.',
      detail:
        'One side is the wall of the old mill and the other is a hedge, and there is no ' +
        'lit window on either for four hundred metres. Whatever light there is on this ' +
        'road tonight is the one in her hand.',
      keywords: ['lights', 'road', 'torch'],
    },
    {
      id: 'hint-torch',
      summary: 'The **torch** is a good one - her father’s, from the yard.',
      detail:
        'Heavy, and far brighter than a phone. It is also slow to move, because it weighs ' +
        'what a real torch weighs and her hands are not steady. Where it is pointed in a ' +
        'second’s time is decided now.',
      keywords: ['torch', 'light'],
      cue: 'prop.highlight:torch',
    },
  ],

  confirmations: {
    RUN_FOR_IT: 'Do you mean Sanda should run?',
  },

  intents: [
    {
      id: 'ASK_WHO',
      requires: [
        ['who', 'what', 'how', 'where', ...TERMS.describe],
        ['him', 'he', 'behind', 'following', 'man', 'far', 'close'],
      ],
      priority: 3,
    },
    {
      id: 'ASK_ROAD',
      requires: [
        [...TERMS.inspect, ...TERMS.describe],
        ['road', 'street', 'lights', 'houses', 'where', 'around'],
      ],
      priority: 2,
    },
    {
      /** Raises the chase. */
      id: 'USE_TORCH',
      requires: [
        ['use', 'point', 'shine', 'turn', 'put', 'get', 'light'],
        ['torch', 'light', 'lamp', 'beam', 'it', 'him'],
      ],
      priority: 4,
    },
    {
      /**
       * Unsafe, and it is the instinct. Running on an unlit road in front of somebody
       * faster than you is how a bad night becomes a worse one, and she says so.
       */
      id: 'RUN_FOR_IT',
      requires: [
        ['run', 'sprint', 'leg', 'bolt', 'go'],
        ['run', 'it', 'for', 'faster', 'away', 'now'],
      ],
      priority: 2,
    },
    {
      id: 'ADMIT_UNCERTAINTY',
      requires: [[...TERMS.uncertain, 'again', 'repeat', 'sorry']],
      priority: 1,
    },
  ],

  beats: [
    {
      id: 'open',
      tempo: Tempo.Respond,
      say:
        'There is a man behind me. He has been behind me since the square and I have ' +
        'crossed twice and he has crossed twice.\n\nI am on the mill road. There is nobody ' +
        'on it. Tell me what to do - quickly, please.',
      suggest: ['how close is he', 'what is on this road', 'use the torch'],
      // Same three ways in as `open`, and the same two shots answer them.
      on: {
        ASK_WHO: { to: 'how-close', environment: 'camera.push-in:follower' },
        ASK_ROAD: {
          to: 'the-road',
          learn: [FACT_SANDA_ROUTE],
          environment: 'camera.pan:road',
        },
        USE_TORCH: { to: 'chase' },
        RUN_FOR_IT: { to: 'ran' },
      },
      onUnrecognised: { to: 'open-again' },
    },
    {
      id: 'open-again',
      framing: HOLD_FRAMING,
      tempo: Tempo.Respond,
      say: 'What? Tell me something - ask me about him, or about the road, or tell me what to do.',
      suggest: ['how close is he', 'what is on this road', 'use the torch'],
      on: {
        /**
         * §209: she describes and the camera looks.
         *
         * "How close is he" is the only question in the game whose answer is a distance,
         * and a number in dialogue is a worse answer than a shot. The push finds him down
         * the road, at the edge of what the set will show, and stops there.
         */
        ASK_WHO: { to: 'how-close', environment: 'camera.push-in:follower' },
        ASK_ROAD: {
          to: 'the-road',
          learn: [FACT_SANDA_ROUTE],
          // Straight down the corridor, where four dead lamps are the whole answer.
          environment: 'camera.pan:road',
        },
        USE_TORCH: { to: 'chase' },
        RUN_FOR_IT: { to: 'ran' },
      },
      onUnrecognised: { to: 'open-again' },
    },
    {
      id: 'how-close',
      framing: 'camera.push-in:follower',
      tempo: Tempo.Respond,
      learn: [FACT_LIGHT_IS_A_DETERRENT],
      say:
        'Twenty metres. Maybe less now.\n\nHe keeps to the hedge side where it is darkest ' +
        'and when I look he is looking somewhere else. He does not want to be seen. That ' +
        'is the only thing about him I am sure of.',
      suggest: ['use the torch', 'what is on this road'],
      on: {
        USE_TORCH: { to: 'chase' },
        ASK_ROAD: {
          to: 'the-road',
          learn: [FACT_SANDA_ROUTE],
          environment: 'camera.pan:road',
        },
        RUN_FOR_IT: { to: 'ran' },
      },
      onUnrecognised: { to: 'how-close' },
    },
    {
      id: 'the-road',
      framing: 'camera.pan:road',
      tempo: Tempo.Respond,
      learn: [FACT_SANDA_ROUTE],
      say:
        'Mill wall one side, hedge the other, and the lamps have been out since spring. ' +
        'Four hundred metres before there is a lit window.\n\nI have my father’s torch. ' +
        'It is the only light on this road.',
      /**
       * One chip, and it points forward.
       *
       * This beat and `how-close` suggested each other, so a player tapping the same chip
       * position walked between them until the guard tripped - the identical loop Ileana's
       * `why` and `papers` made, caught by the identical check. Two beats that suggest each
       * other are a cycle with no exit for anybody who is not reading, and on a request
       * with somebody twenty metres behind her that is the worst possible place for one.
       *
       * The intent is still live: typing "how close is he" here works.
       */
      suggest: ['use the torch'],
      on: {
        USE_TORCH: { to: 'chase' },
        ASK_WHO: {
          to: 'how-close',
          learn: [FACT_LIGHT_IS_A_DETERRENT],
          environment: 'camera.push-in:follower',
        },
        RUN_FOR_IT: { to: 'ran' },
      },
      onUnrecognised: { to: 'the-road' },
    },
    {
      /**
       * The chase.
       *
       * Everything the beat needs the player to understand is in these two sentences: the
       * torch is heavy, and he is faster than it. A player who reads that and leads will
       * hold him; a player who does not will spend twelve seconds one step behind and
       * learn it the other way.
       */
      id: 'chase',
      framing: 'camera.push-in:follower',
      tempo: Tempo.Act,
      say:
        'I have it out. It is heavy - it does not go where I want it quickly.\n\nHe is ' +
        'moving about. Tell me where to put it and I will get it there as fast as I can.',
      suggest: ['how close is he'],
      device: {
        kind: 'beam',
        prompt: 'Call the light. He is faster than her hand.',
        beam: FOLLOWING,
        onSolved: { to: 'solved', environment: 'prop.clear:follower' },
        onWrong: { to: 'caught' },
        wrongSay: '',
      },
      on: {
        ASK_WHO: { to: 'how-close', environment: 'camera.push-in:follower' },
        RUN_FOR_IT: { to: 'ran' },
      },
      onUnrecognised: { to: 'chase' },
    },
    {
      id: 'ran',
      tempo: Tempo.Act,
      say:
        'I am running - I cannot, I cannot keep - he is right behind me, he is right - \n\n' +
        '...He has gone past. He has gone past me and up the hill and he did not even ' +
        'look. I am sitting down. I am going to sit down for a minute.',
      failure: {
        summary:
          'You told Sanda to run on an unlit road from somebody faster than her. She was ' +
          'not touched - he went past and kept going - and she does not know that until ' +
          'it is over, and neither did you when you said it.',
        lesson:
          'She was holding the only light on that road. Somebody following stops when they ' +
          'believe they have been seen properly, and being seen was the one thing he was ' +
          'avoiding.',
        cooldownSeconds: 180,
      },
      on: {},
    },
    {
      id: 'caught',
      tempo: Tempo.Act,
      say:
        'He is here - he is right here, he is at my - \n\n...He has said sorry. He said ' +
        'sorry and he has walked round me and he is going up the hill.\n\nI do not know ' +
        'what that was. I do not know what that was and I am shaking.',
      failure: {
        summary:
          'The light never stayed on him long enough for him to believe he had been seen. ' +
          'He reached her, said sorry, and walked on - and neither she nor you will ever ' +
          'know what he had decided before that.',
        lesson:
          'The torch is heavy and he is faster than it. Point where he is going rather ' +
          'than where he is, and the light gets there with him.',
        cooldownSeconds: 180,
      },
      on: {},
    },
    {
      id: 'solved',
      framing: 'camera.push-in:follower',
      tempo: Tempo.Respond,
      say:
        'It is on him - it is right on his face and he has got his arm up - \n\n' +
        'He has turned. He has gone into the cut by the mill and he is walking the other ' +
        'way, fast.\n\nHe did not want to be looked at. That was all it took. That was ' +
        'all it took and I have been carrying this thing for a year.',
      outcome: {
        kind: OutcomeKind.Solved,
        say: 'He broke off at the mill. Sanda is on the lit road.',
        trust: 0.4,
        /**
         * §107, and the one this whole arc has been building to. Dorin's lock and this
         * torch are the same problem: a thing in somebody's hands that will only work if
         * it is used in the right ORDER, or at the right MOMENT - and in both the person
         * has the hands, the nerve and the tool, and the machine has the timing.
         */
        connects: [
          {
            a: FACT_LIGHT_IS_A_DETERRENT,
            b: FACT_PINS_BIND_BY_TOLERANCE,
            label: 'Having the tool, and needing to be told when',
          },
        ],
      },
      on: {},
    },
  ],

  openingBeatId: 'open',
};
