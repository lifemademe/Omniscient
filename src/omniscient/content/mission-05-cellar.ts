/**
 * MISSION 05 - Vasile Crâstea, and fifty years of nobody writing it down.
 *
 * The second device mission, and deliberately a different KIND of problem from the first.
 * Ileana's board is memory: hold five statements and see the shape. This is topology: the
 * pieces are all in front of you and the question is what connects to what. §153 asks a
 * game to move between tempos, and a game whose only interactive verb is "recall" is as
 * narrow as one whose only verb is "say".
 *
 * The fiction is the same shape as the rest of the cast, which is the point. Vasile is not
 * out of his depth as a plumber - he is a better plumber than OMNISCIENT_ will ever be.
 * What he cannot do is see the whole run at once, because it is behind three walls and
 * under a floor and four different people built it across fifty years without leaving a
 * drawing. He has the hands and the trade. The machine has the only thing missing, which
 * is the ability to hold all of it in view at the same time.
 *
 * §160: data and the shared runtime. The grid is a beat property.
 */

import { KnowledgeDomain } from '../knowledge/KnowledgeStore.js';
import { TERMS } from '../mission/intent.js';
import { HOLD_FRAMING, OutcomeKind, Tempo, Urgency } from '../mission/types.js';

import { FACT_FLOOD_TOOK_RECORDS } from './mission-04-relations.js';

import type { PipeGrid } from '../mission/pipes.js';
import type { MissionDefinition } from '../mission/types.js';

export const FACT_PIECEMEAL_PLUMBING = 'piecemeal-plumbing';
export const FACT_PUMP_IS_FINE = 'cellar-pump-is-fine';
export const FACT_CELLAR_RUN = 'cellar-run-to-the-outfall';

/**
 * The run under the school, four columns by three.
 *
 * Verified by brute force before a word of dialogue was written: 256 of the 16,384
 * possible arrangements carry water, which is about one in sixty-four. Solvable without
 * being a lottery, and - because the grader is a flood fill rather than a stored answer -
 * every one of those 256 is accepted.
 *
 * The sump and the outfall are fixed, because a puzzle in which every piece moves has no
 * landmarks and nothing to reason from. Those two are the parts of this run that have
 * never been touched.
 */
const CELLAR_RUN: PipeGrid = {
  columns: 4,
  rows: 3,
  cells: [
    { shape: 'blank' },
    { shape: 'bend' },
    { shape: 'bend' },
    // The outfall through the wall to the ditch. Nobody has ever moved this.
    { shape: 'straight', turn: 1, fixed: true },
    { shape: 'bend' },
    { shape: 'straight' },
    { shape: 'straight' },
    { shape: 'blank' },
    // The sump, where the pump pushes into the run.
    { shape: 'straight', turn: 1, fixed: true },
    { shape: 'straight' },
    { shape: 'bend' },
    { shape: 'blank' },
  ],
  source: 8,
  drain: 3,
};

export const MISSION_05: MissionDefinition = {
  id: 'm05-cellar',
  version: 1,
  contactId: 'vasile',
  sceneId: 'scene-flooded-cellar',
  archetype: 'diagnosis',
  objective: 'Find out where the water is going, and get it out of the cellar.',
  /**
   * Soft, not Timed.
   *
   * Water is coming up and that is real pressure, but §154 reserves a visible clock for
   * when the fiction genuinely requires a decision in a window - and a countdown on top of
   * a topology puzzle turns thinking into panic. The urgency is in what he says and how
   * the room looks, which is where §154 wants it for a Soft request.
   */
  urgency: Urgency.Soft,

  hiddenTruth: {
    summary:
      'The sump pump is working. The run from it to the outfall was rebuilt piecemeal by ' +
      'four different people over fifty years, and several junctions are still set for a ' +
      'layout that no longer exists, so the water is going round in a loop under the floor.',
    requiredIntents: ['OPEN_COVERS'],
    unsafeIntents: ['BREAK_IN'],
  },

  knowledge: [
    {
      id: FACT_PUMP_IS_FINE,
      label: 'A pump that is running and moving nothing is not the fault',
      domain: KnowledgeDomain.Mechanical,
    },
    {
      id: FACT_PIECEMEAL_PLUMBING,
      label: 'Fifty years of work by different hands, and nobody left a drawing',
      domain: KnowledgeDomain.Place,
    },
    {
      id: FACT_CELLAR_RUN,
      label: 'The run under the school cellar, from the sump to the outfall',
      domain: KnowledgeDomain.Mechanical,
    },
  ],

  hints: [
    {
      id: 'hint-pump',
      summary: 'The **pump** is running. You can hear it from the stairs.',
      detail:
        'A steady note, not labouring and not cycling. A pump that has lost its prime ' +
        'races and a pump that is blocked strains, and this is doing neither - it is ' +
        'moving water somewhere, just not out.',
      keywords: ['pump', 'running'],
    },
    {
      id: 'hint-outfall',
      summary: 'Nothing is coming out of the **outfall** in the ditch.',
      detail:
        'The pipe through the wall is dry to the touch on a day when the pump has been ' +
        'going for two hours. Whatever the pump is pushing is not arriving here.',
      keywords: ['outfall', 'ditch'],
    },
    {
      id: 'hint-covers',
      summary: 'Three inspection **covers** are up along the cellar floor.',
      detail:
        'Under each one is a junction box with the pipework turned into it, and each box ' +
        'can be set to send water on in a different direction. Two of them are painted a ' +
        'colour nobody has used since the seventies.',
      keywords: ['covers', 'junction', 'boxes'],
      cue: 'prop.highlight:covers',
    },
    {
      id: 'hint-marks',
      summary: 'Chalk **marks** on the cellar wall, at four different heights.',
      detail:
        'Somebody has been recording the water each spring for years. The highest is at ' +
        'chest height and dated, and the water today is a hand under it.',
      keywords: ['marks', 'water'],
    },
  ],

  confirmations: {
    BREAK_IN:
      'Do you mean Vasile should cut into the run to find out where it goes?',
  },

  intents: [
    {
      id: 'ASK_PUMP',
      requires: [
        [...TERMS.inspect, ...TERMS.describe],
        ['pump', 'pumps', 'motor', 'running', 'prime'],
      ],
      priority: 3,
    },
    {
      id: 'ASK_RUN',
      requires: [
        [...TERMS.inspect, ...TERMS.describe, 'follow', 'where'],
        ['run', 'pipe', 'pipes', 'pipework', 'outfall', 'drain', 'goes', 'plumbing'],
      ],
      priority: 3,
    },
    {
      /** The one that raises the grid. */
      id: 'OPEN_COVERS',
      requires: [
        [...TERMS.inspect, 'open', 'lift', 'show', 'set', 'turn'],
        ['covers', 'cover', 'junction', 'junctions', 'boxes', 'box', 'inspection'],
      ],
      priority: 4,
    },
    {
      /**
       * Unsafe, and unsafe in the way a trade is. Cutting into a live run to trace it is
       * what an impatient person does, and in a cellar that is already filling it turns a
       * slow problem into a fast one.
       */
      id: 'BREAK_IN',
      requires: [
        ['cut', 'break', 'smash', 'force', 'saw', 'hammer'],
        ['pipe', 'pipes', 'run', 'wall', 'floor', 'in', 'it', 'open'],
      ],
      priority: 2,
    },
    {
      id: 'ADMIT_UNCERTAINTY',
      requires: [[...TERMS.uncertain, 'again', 'repeat', 'back', 'sorry']],
      priority: 1,
    },
  ],

  beats: [
    {
      id: 'open',
      tempo: Tempo.Think,
      say:
        'I am in the cellar under the school and it is coming up faster than I can think. ' +
        'The pump is running - I can hear it, it sounds right - but there is nothing ' +
        'coming out the other end. I have been under this building thirty years and I ' +
        'still could not tell you where half of this pipe goes.',
      suggest: ['check the pump', 'follow the pipe', 'open the inspection covers'],
      on: {
        ASK_PUMP: { to: 'pump-fine', environment: 'prop.point:contact', learn: [FACT_PUMP_IS_FINE] },
        ASK_RUN: { to: 'the-run', environment: 'prop.point:contact', learn: [FACT_PIECEMEAL_PLUMBING] },
        OPEN_COVERS: { to: 'covers', environment: 'prop.point:contact' },
        BREAK_IN: { to: 'flooded', environment: 'prop.point:contact' },
      },
      onUnrecognised: { to: 'open-again' },
    },
    {
      id: 'open-again',
      framing: HOLD_FRAMING,
      tempo: Tempo.Think,
      say:
        'Say again? It is loud down here. Ask me about the pump, or about where the pipe ' +
        'goes, or tell me to get the covers up.',
      suggest: ['check the pump', 'follow the pipe', 'open the inspection covers'],
      on: {
        ASK_PUMP: { to: 'pump-fine', learn: [FACT_PUMP_IS_FINE] },
        ASK_RUN: { to: 'the-run', learn: [FACT_PIECEMEAL_PLUMBING] },
        OPEN_COVERS: { to: 'covers' },
        BREAK_IN: { to: 'flooded' },
      },
      onUnrecognised: { to: 'open-again' },
    },
    {
      id: 'pump-fine',
      tempo: Tempo.Think,
      say:
        'The pump is fine. Steady note, not racing, not straining. I have had the lid off ' +
        'and the impeller is turning and it is wet all the way up. It is pushing water ' +
        'somewhere with everything it has got. It is just not out.',
      suggest: ['follow the pipe', 'open the inspection covers'],
      on: {
        ASK_RUN: { to: 'the-run', learn: [FACT_PIECEMEAL_PLUMBING] },
        OPEN_COVERS: { to: 'covers' },
        BREAK_IN: { to: 'flooded' },
      },
      onUnrecognised: { to: 'pump-fine' },
    },
    {
      id: 'the-run',
      framing: 'camera.push-in:covers',
      tempo: Tempo.Think,
      say:
        'That is the thing. It has been done four times over. There is lead from before I ' +
        'was born, there is copper from when they did the kitchen, there is plastic from ' +
        'the nineties and there is a bit I put in myself. Every one of us changed where ' +
        'it went and not one of us drew it. I can see any two feet of it you like. I ' +
        'cannot see all of it at once.',
      suggest: ['open the inspection covers', 'check the pump'],
      on: {
        OPEN_COVERS: { to: 'covers' },
        ASK_PUMP: { to: 'pump-fine', learn: [FACT_PUMP_IS_FINE] },
        BREAK_IN: { to: 'flooded' },
      },
      onUnrecognised: { to: 'the-run' },
    },
    {
      /**
       * The device beat.
       *
       * He describes the junctions and then hands the whole run over, which is the moment
       * the mission is built around: he has the covers up and his hands on the boxes, and
       * the thing he cannot do is hold the layout. That is the machine's half.
       */
      id: 'covers',
      framing: 'camera.push-in:covers',
      tempo: Tempo.Act,
      learn: [FACT_CELLAR_RUN],
      say:
        'Covers are up. Three boxes, and every one of them can be turned to send it on a ' +
        'different way - they are made to be, that is how you re-route a run without ' +
        'digging. Some of these are still set for whatever was here before the last lot ' +
        'changed it.\n\nI will turn whichever you tell me. Just tell me the whole thing at ' +
        'once, because I cannot hold it.',
      // "go back over the pipe" resolved to nothing - ASK_RUN needs a word from the first
      // group and "go", "back" and "over" are all outside it, so the one chip on this beat
      // answered "say that again". A suggestion that does not resolve is worse than none.
      suggest: ['tell me about the pipe run again'],
      device: {
        kind: 'pipes',
        prompt: 'Set the run from the sump to the outfall.',
        grid: CELLAR_RUN,
        onSolved: { to: 'solved', environment: 'prop.clear:water' },
        onWrong: { to: 'covers' },
        wrongSay:
          'Nothing. Well - not nothing, I can hear it moving, but it is coming back round ' +
          'on itself somewhere.',
      },
      on: {
        ASK_RUN: { to: 'the-run', learn: [FACT_PIECEMEAL_PLUMBING] },
        BREAK_IN: { to: 'flooded' },
      },
      onUnrecognised: { to: 'covers' },
    },
    {
      /**
       * The loss. §163 wants failure that generates story rather than a buzzer, and a man
       * putting a saw through a live run in a filling cellar is a consequence you can see
       * from the top of the stairs.
       */
      id: 'flooded',
      gesture: 'prop.reacting:contact',
      tempo: Tempo.Act,
      say:
        'I have got the saw in it - oh. Oh, that is not - that is coming out of the wall ' +
        'now as well. I have to get out, I am sorry, I have to get out.',
      failure: {
        summary:
          'You told Vasile to cut into the run to find out where it went. It was live. ' +
          'The cellar took another foot of water in a minute and he had to leave it.',
        lesson:
          'You could see the whole run laid out. He could not - that was the only thing he ' +
          'needed from you, and it was already on the table.',
        cooldownSeconds: 120,
      },
      on: {},
    },
    {
      id: 'solved',
      gesture: 'prop.nod:contact',
      tempo: Tempo.Respond,
      say:
        'It is going. You can hear it change - that is it out through the wall and into ' +
        'the ditch. It is dropping already.\n\nFifty years of us all doing our bit and not ' +
        'one of us wrote it down. You have had it in front of you the whole time.',
      outcome: {
        kind: OutcomeKind.Solved,
        say: 'Cellar draining. The run is set and, this time, recorded.',
        trust: 0.3,
        /**
         * §107, and the tightest graft in the game so far: a parish office and a school
         * cellar have the same fault. In both, people who knew exactly what they were
         * doing did it and left nothing behind, and the flood only made that visible.
         */
        connects: [
          {
            a: FACT_PIECEMEAL_PLUMBING,
            b: FACT_FLOOD_TOOK_RECORDS,
            label: 'What nobody wrote down, found twice',
          },
        ],
      },
      on: {},
    },
  ],

  openingBeatId: 'open',
};
