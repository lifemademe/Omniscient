/**
 * MISSION 03 - "It only dies on one side"
 *
 * The third request, and the first that is not a broken machine.
 *
 * Adaeze's seedlings are failing down one side of her tunnel. Everything the player has
 * learned so far points at equipment - two consecutive electrical faults have trained
 * them to look for a device with something wrong inside it - and there is nothing wrong
 * with any device here. A tree outside the tunnel has grown, and half her crop is now in
 * its shade for most of the day.
 *
 * THE TRAP (§163). The obvious moves - check the pump, check the lights - are available,
 * they resolve, and they come back clean. They are not punished and they are not dead
 * ends; they cost time in a request that has a countdown, and they teach the thing the
 * mission exists to teach: the fault is not always in the thing that broke.
 *
 * THE CONNECTION (§107). Tomas's supply and Adaeze's daylight are the same problem in
 * different substance - two things quietly sharing one resource, invisible until one of
 * them changed. That is the cross-domain bridge this request grafts onto the tree, and it
 * is the first one the player can see coming.
 *
 * Urgency: Timed (§154). Seedlings do not wait, and neither does the light.
 */

import { KnowledgeDomain } from '../knowledge/KnowledgeStore.js';
import { TERMS } from '../mission/intent.js';
import { OutcomeKind, Tempo, Urgency } from '../mission/types.js';

import { ADAEZE } from './contacts.js';
import { FACT_FEED_NEEDS_ISOLATOR } from './mission-02-beacon.js';

import type { MissionDefinition } from '../mission/types.js';

export const FACT_SHADE_LINE = 'tunnel_shade_line';
export const FACT_TREE_GREW = 'neighbour_tree_grew';
export const FACT_EQUIPMENT_FINE = 'tunnel_equipment_sound';

export const MISSION_03: MissionDefinition = {
  id: 'm03-tunnel',
  version: 1,
  contactId: ADAEZE.id,
  sceneId: 'scene-seedling-tunnel',
  archetype: 'diagnosis',
  urgency: Urgency.Timed,

  hiddenTruth: {
    summary:
      'Nothing is broken. A tree outside has grown across the eastern side of the tunnel ' +
      'and those seedlings are now in shade for most of the day. Cutting it back fixes it.',
    requiredIntents: ['ASK_PATTERN', 'CUT_BACK'],
    // Moving seedlings that are already weak, in the heat of the day, kills them.
    unsafeIntents: ['MOVE_SEEDLINGS'],
  },

  knowledge: [
    {
      id: FACT_SHADE_LINE,
      label: 'Adaeze\'s tunnel: the failing seedlings are all on the shaded side',
      domain: KnowledgeDomain.Growing,
    },
    {
      id: FACT_TREE_GREW,
      label: 'A neighbour\'s tree has grown tall enough to shade the tunnel',
      domain: KnowledgeDomain.Growing,
    },
    {
      id: FACT_EQUIPMENT_FINE,
      label: 'Not every failure is a broken machine - check the thing itself last',
      domain: KnowledgeDomain.Place,
      incidental: true,
    },
  ],

  /**
   * §131: observation, never diagnosis. Two of these point at the answer and one points
   * firmly at the wrong thing, because a request where every observation helps is a
   * request where nobody has to think.
   */
  hints: [
    {
      id: 'hint-side',
      summary: 'Only one side is dying',
      detail:
        'The rows on one side are thin and pale. The rows on the other side, in the same '
        + 'soil and on the same water, are fine. Whatever this is, it stops halfway across.',
      keywords: ['side', 'rows'],
      cue: 'camera.pan:tunnel-rows',
    },
    {
      id: 'hint-time',
      summary: 'It got worse over weeks, not overnight',
      detail:
        'Nothing failed suddenly. The rows have been getting thinner since the dry season '
        + 'ended, a little at a time, and always in the same direction.',
      keywords: ['rows'],
    },
    {
      id: 'hint-water',
      summary: 'The water reaches every row',
      detail:
        'The soil is damp the whole length of both sides, and the drip line is wet all the '
        + 'way to the end. Whatever is wrong, the water is getting there.',
      keywords: ['water'],
    },
    {
      id: 'hint-tree',
      summary: 'There is a tree over the eastern wall',
      detail:
        'A big tree stands just beyond the tunnel on the failing side. Its crown reaches '
        + 'out over the plastic, and its shade lies right along the dying rows.',
      keywords: ['tree', 'shade'],
      cue: 'prop.highlight:neighbour-tree',
      // Only visible once somebody has looked outside rather than at the equipment.
      revealedBy: 'pattern-found',
    },
  ],

  confirmations: {
    ASK_PATTERN: 'Do you mean Adaeze should describe which rows are failing?',
    CHECK_WATER: 'Do you mean Adaeze should check the water?',
    CHECK_POWER: 'Do you mean Adaeze should check the pump and the fan?',
    LOOK_OUTSIDE: 'Do you mean Adaeze should look outside the tunnel?',
    CUT_BACK: 'Do you mean Adaeze should cut the branches back off the tunnel?',
    MOVE_SEEDLINGS: 'Do you mean Adaeze should lift the weak seedlings and move them now?',
    ADMIT_UNCERTAINTY: 'Do you want to tell her you are not sure yet?',
  },

  intents: [
    {
      id: 'ASK_PATTERN',
      requires: [
        [...TERMS.describe, ...TERMS.inspect, 'which'],
        ['side', 'rows', 'row', 'pattern', 'half', 'which', 'dying', 'failing'],
      ],
      priority: 3,
    },
    {
      id: 'CHECK_WATER',
      requires: [[...TERMS.inspect, ...TERMS.describe], [...TERMS.water, 'drip', 'irrigation', 'soil']],
      priority: 2,
    },
    {
      id: 'CHECK_POWER',
      requires: [
        [...TERMS.inspect, ...TERMS.describe],
        [...TERMS.power, 'pump', 'fan', 'timer', 'lights', 'light'],
      ],
      priority: 2,
    },
    {
      id: 'LOOK_OUTSIDE',
      requires: [
        [...TERMS.inspect, ...TERMS.describe, 'go'],
        ['outside', 'out', 'around', 'wall', 'beyond', 'behind'],
      ],
      priority: 3,
    },
    {
      id: 'CUT_BACK',
      requires: [
        ['cut', 'trim', 'prune', 'clear', 'remove', 'take'],
        ['tree', 'branch', 'branches', 'crown', 'shade', 'back', 'it'],
      ],
      priority: 3,
    },
    {
      /**
       * Unsafe: lifting weak seedlings in the heat. §163 - the player is warned first and
       * has to insist, exactly as with Mirela's live connector and Tomas's live supply.
       */
      id: 'MOVE_SEEDLINGS',
      requires: [
        ['move', 'lift', 'shift', 'replant', 'transplant', 'relocate'],
        ['seedlings', 'seedling', 'plants', 'them', 'rows'],
      ],
      priority: 2,
    },
    {
      id: 'ADMIT_UNCERTAINTY',
      requires: [[...TERMS.uncertain]],
      priority: 4,
    },
  ],

  openingBeatId: 'open',

  beats: [
    {
      id: 'open',
      tempo: Tempo.Think,
      say:
        'I am losing them. Half my seedlings have gone thin and pale and I have three weeks ' +
        'until they are meant to go out to the growers. I have checked everything I know how ' +
        'to check. Tell me what I am missing.',
      suggest: [
        'which rows are dying',
        'check the water',
        'check the pump and fan',
      ],
      on: {
        ASK_PATTERN: { to: 'pattern-found', environment: 'camera.pan:tunnel-rows' },
        CHECK_WATER: { to: 'water-fine' },
        CHECK_POWER: { to: 'power-fine' },
        LOOK_OUTSIDE: { to: 'outside' },
        ADMIT_UNCERTAINTY: { to: 'uncertain' },
      },
      onUnrecognised: { to: 'clarify' },
      onAmbiguous: { to: 'clarify' },
    },

    {
      id: 'clarify',
      tempo: Tempo.Respond,
      say: 'Say that again - I am kneeling in the dirt with the phone on a crate.',
      suggest: ['which rows are dying', 'look outside the tunnel', 'check the water'],
      on: {
        ASK_PATTERN: { to: 'pattern-found', environment: 'camera.pan:tunnel-rows' },
        CHECK_WATER: { to: 'water-fine' },
        CHECK_POWER: { to: 'power-fine' },
        LOOK_OUTSIDE: { to: 'outside' },
        ADMIT_UNCERTAINTY: { to: 'uncertain' },
      },
      onUnrecognised: { to: 'clarify' },
    },

    {
      id: 'uncertain',
      tempo: Tempo.Respond,
      // §162 again: not knowing is allowed, and she respects it more than a guess.
      say:
        'At least you say so. The last person told me it was the seed and charged me for ' +
        'more seed. Where do you want to start - the rows themselves, or the kit?',
      suggest: ['which rows are dying', 'check the pump and fan'],
      on: {
        ASK_PATTERN: { to: 'pattern-found', environment: 'camera.pan:tunnel-rows' },
        CHECK_WATER: { to: 'water-fine' },
        CHECK_POWER: { to: 'power-fine' },
      },
      onUnrecognised: { to: 'clarify' },
    },

    {
      /**
       * The first wrong answer, and it comes back clean.
       *
       * §163: not punished, not a dead end. It costs time on a timed request and it
       * removes a suspect, which is what an eliminating move is supposed to do.
       */
      id: 'water-fine',
      tempo: Tempo.Think,
      learn: [FACT_EQUIPMENT_FINE],
      say:
        'Water is fine. The drip line runs wet to the last row and the soil is damp on both ' +
        'sides - I checked that first, it is always the water. Only it is not, this time.',
      suggest: ['which rows are dying', 'check the pump and fan', 'look outside the tunnel'],
      on: {
        ASK_PATTERN: { to: 'pattern-found', environment: 'camera.pan:tunnel-rows' },
        CHECK_POWER: { to: 'power-fine' },
        LOOK_OUTSIDE: { to: 'outside' },
      },
      onUnrecognised: { to: 'clarify' },
    },

    {
      id: 'power-fine',
      tempo: Tempo.Think,
      learn: [FACT_EQUIPMENT_FINE],
      say:
        'Pump runs, fan runs, timer is on the hour like always. Nothing has tripped. ' +
        'I know you have been fixing machines all morning, but there is no machine in this.',
      suggest: ['which rows are dying', 'look outside the tunnel', 'check the water'],
      on: {
        ASK_PATTERN: { to: 'pattern-found', environment: 'camera.pan:tunnel-rows' },
        CHECK_WATER: { to: 'water-fine' },
        LOOK_OUTSIDE: { to: 'outside' },
      },
      onUnrecognised: { to: 'clarify' },
    },

    {
      /** The turn. Not an answer - a shape. */
      id: 'pattern-found',
      tempo: Tempo.Think,
      learn: [FACT_SHADE_LINE],
      say:
        'The eastern side. Every row on that side is thin, every row on the other side is ' +
        'fine, and the line between them is straight - it runs right down the middle of the ' +
        'tunnel. Same soil. Same water. Same seed, same day.',
      suggest: ['look outside the tunnel', 'check the water'],
      on: {
        LOOK_OUTSIDE: { to: 'outside', environment: 'prop.highlight:neighbour-tree' },
        CHECK_WATER: { to: 'water-fine' },
        CHECK_POWER: { to: 'power-fine' },
        CUT_BACK: { to: 'outside', environment: 'prop.highlight:neighbour-tree' },
        MOVE_SEEDLINGS: { to: 'lost' },
      },
      onUnrecognised: { to: 'clarify' },
    },

    {
      id: 'outside',
      tempo: Tempo.Respond,
      learn: [FACT_TREE_GREW],
      say:
        'Outside? ... Oh. Oh, the mango. It was a stick when my father planted it. It is over ' +
        'the roof now - the whole crown leans across the eastern side. That is the shadow. ' +
        'It has been getting a little longer every week and I have walked under it every day.',
      suggest: ['cut the branches back'],
      affirmIntent: 'CUT_BACK',
      on: {
        CUT_BACK: { to: 'solved', environment: 'prop.clear:neighbour-tree' },
        MOVE_SEEDLINGS: { to: 'lost' },
      },
      onUnrecognised: { to: 'clarify' },
    },

    {
      /**
       * Overriding the warning, and the same rule as the other two requests: MOVE_SEEDLINGS
       * is proposed for confirmation before it fires, so by the time this runs the player
       * has been asked whether she should lift them now and has said yes. That
       * confirmation is the second chance; a second warning after it would teach that the
       * first one meant nothing.
       */
      id: 'lost',
      tempo: Tempo.Respond,
      say:
        'They are down. All of them, flat in the barrow by noon and they have not stood back ' +
        'up. I should not have done it. I knew and I did it because you said so.',
      on: {},
      failure: {
        summary:
          'You told Adaeze to lift weak seedlings in thirty-four degree heat. They did not '
          + 'recover, and the shade that was killing them is still there.',
        lesson:
          'Fix what is causing the harm before moving what is being harmed.',
        cooldownSeconds: 90,
      },
    },

    {
      /**
       * The cutting and the result are one beat.
       *
       * They were two, which made the player type one more thing after the work was done
       * purely to be told it had worked. A payoff that needs a filler turn to arrive is a
       * payoff with a hole in front of it.
       */
      id: 'solved',
      tempo: Tempo.Respond,
      say:
        'I have the saw... there. The low limbs are off and the light is on those rows for ' +
        'the first time in weeks - you can see the line where the shadow was. They will come ' +
        'back. Thin for a fortnight, and then they will come back. There was never anything ' +
        'wrong with them. Nothing was broken. It just grew.',
      on: {},
      outcome: {
        kind: OutcomeKind.Solved,
        say: 'Seedlings recovering. Nothing was broken - something grew.',
        trust: 2,
        connects: [
          {
            a: FACT_FEED_NEEDS_ISOLATOR,
            b: FACT_TREE_GREW,
            label: 'two things sharing one thing, unnoticed until one changed',
          },
        ],
      },
    },
  ],
};
