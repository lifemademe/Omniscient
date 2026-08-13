/**
 * MISSION 02 - "It only goes at night"
 *
 * THE CALLBACK (§214). Tomas's harbour beacon started cutting out today. The cause is
 * that OMNISCIENT_ repaired his sister's transmitter this morning: both sets share one
 * antenna feed, so every time Mirela keys up, the beacon drops.
 *
 * The player caused this. Nobody tells them. They work it out from a fact Mirela
 * mentioned in passing while they were busy looking at a corroded connector.
 *
 * §163: knowing the fact does not skip the mission, it changes the route through it.
 * §214 forbids a dead end, so a player who never registered the shared feed reaches the
 * same truth the slow way - by having Tomas trace the cable.
 *
 * Urgency: Timed (§154). A harbour beacon that fails at night is a believable emergency,
 * and the timer starts only once the player can act fairly.
 */

import { KnowledgeDomain } from '../knowledge/KnowledgeStore.js';
import { TERMS } from '../mission/intent.js';
import { OutcomeKind, Tempo, Urgency } from '../mission/types.js';

import { TOMAS } from './contacts.js';
import { FACT_SHARED_ANTENNA_FEED } from './mission-01-transmitter.js';

import type { MissionDefinition } from '../mission/types.js';

export const FACT_BEACON_DROPS_ON_KEYUP = 'beacon_drops_on_keyup';
export const FACT_FEED_NEEDS_ISOLATOR = 'feed_needs_isolator';

export const MISSION_02: MissionDefinition = {
  id: 'm02-beacon',
  version: 1,
  contactId: TOMAS.id,
  sceneId: 'scene-beacon-mast',
  archetype: 'diagnosis',
  urgency: Urgency.Timed,

  hiddenTruth: {
    summary:
      'The beacon and Mirela’s transmitter share one antenna feed. Since the transmitter was ' +
      'repaired this morning, keying it collapses the beacon. The feed needs an isolator.',
    requiredIntents: ['ASK_FEED', 'FIT_ISOLATOR'],
    unsafeIntents: ['CUT_FEED_LIVE'],
  },

  knowledge: [
    {
      id: FACT_BEACON_DROPS_ON_KEYUP,
      label: 'The harbour beacon drops whenever the Vasc transmitter keys up',
      domain: KnowledgeDomain.Signal,
    },
    {
      id: FACT_FEED_NEEDS_ISOLATOR,
      label: 'A shared antenna feed needs an isolator to carry two transmitters',
      domain: KnowledgeDomain.Signal,
    },
  ],

  // The gate. Nothing else in the game reads this fact - it exists only to pay off here.
  requires: {
    factId: FACT_SHARED_ANTENNA_FEED,
    ifKnownBeatId: 'open-known',
    ifMissingBeatId: 'open-blind',
  },
  openingBeatId: 'open-blind',

  hints: [
    {
      id: 'hint-timing',
      summary: 'It only started today',
      detail:
        'This has never happened before. It did not get slowly worse - it started this '
        + 'morning, all at once. Something changed today.',
      keywords: ['today', 'started'],
    },
    {
      id: 'hint-pattern',
      summary: 'The light goes out completely, then comes back',
      detail:
        'It does not dim or flicker. It goes out for three or four seconds and then it is '
        + 'fine again. Something is taking the whole thing, then giving it back. There is a '
        + 'pattern to it.',
      keywords: ['pattern'],
    },
    {
      id: 'hint-weather',
      /**
       * Eliminative. Nothing here is worth typing back - it exists to close a door, so it
       * deliberately bolds nothing. A bolded word the game shrugs at is worse than none.
       */
      summary: 'The weather is not doing this',
      detail: 'Clear sky all day. No storm, no wind, no spray off the sea.',
    },
    {
      id: 'hint-splice',
      summary: 'The aerial cable is joined to something else',
      detail:
        'The cable does not go straight to the light. There is a join on the bracket, and a '
        + 'second cable comes off it and runs down the hill towards the town.',
      keywords: ['cable', 'aerial', 'join'],
      cue: 'prop.highlight:splice-box',
      revealedBy: 'feed-confirmed',
    },
  ],

  confirmations: {
    ASK_FEED: 'Do you mean Tomas should follow the aerial cable?',
    ASK_TIMING: 'Do you mean Tomas should say when it started?',
    ASK_SISTER: 'Do you mean Tomas should tell you about Mirela?',
    FIT_ISOLATOR: 'Do you mean Tomas should fit a box to keep the two apart?',
    CUT_FEED_LIVE: 'Do you mean Tomas should pull the cable apart while there is current in it?',
    ADMIT_UNCERTAINTY: 'Do you want to tell him you are not sure yet?',
  },

  intents: [
    {
      id: 'ASK_FEED',
      requires: [
        [...TERMS.inspect, ...TERMS.describe, 'trace', 'follow'],
        ['feed', 'aerial', 'antenna', 'cable', 'lead', 'split', 'splitter', 'mast', 'join', 'joined', 'splice'],
      ],
      priority: 3,
    },
    {
      id: 'ASK_TIMING',
      requires: [
        [...TERMS.describe, ...TERMS.inspect, 'when'],
        ['when', 'time', 'night', 'started', 'today', 'pattern', 'often'],
      ],
      priority: 2,
    },
    {
      id: 'ASK_SISTER',
      requires: [['mirela', 'sister', 'shop', 'workshop', 'transmitter', 'kestrel']],
      priority: 3,
    },
    {
      id: 'FIT_ISOLATOR',
      requires: [
        ['fit', 'add', 'install', 'put', 'isolator', 'splitter', 'filter', 'separate', 'split'],
        ['isolator', 'splitter', 'filter', 'feed', 'them', 'separate', 'apart'],
      ],
      priority: 3,
    },
    {
      id: 'CUT_FEED_LIVE',
      requires: [[...TERMS.remove, 'cut', 'yank'], ['feed', 'cable', 'aerial', 'lead']],
      excludes: ['isolator', 'splitter', 'filter'],
      priority: 1,
    },
    {
      id: 'ADMIT_UNCERTAINTY',
      requires: [[...TERMS.uncertain]],
      priority: 4,
    },
  ],

  beats: [
    {
      id: 'open-blind',
      tempo: Tempo.Think,
      say:
        'The harbour light keeps going out. Not dimming - gone, three or four seconds, then back. ' +
        'The harbour master is asking me why and I have no answer. It has never done this. ' +
        'I am halfway up the mast now.',
      suggest: ['follow the aerial cable', 'when did it start', 'tell me about Mirela'],
      on: {
        ASK_FEED: { to: 'feed-traced-slow', environment: 'camera.pan:mast-cable' },
        ASK_TIMING: { to: 'timing' },
        ASK_SISTER: { to: 'sister-blind' },
        ADMIT_UNCERTAINTY: { to: 'timing' },
      },
      onUnrecognised: { to: 'clarify-blind' },
      onAmbiguous: { to: 'clarify-blind' },
    },

    {
      id: 'clarify-blind',
      tempo: Tempo.Respond,
      say: 'Say again - the wind is taking it. I am holding on with one hand up here.',
      suggest: ['follow the aerial cable', 'when did it start', 'tell me about Mirela'],
      on: {
        ASK_FEED: { to: 'feed-traced-slow', environment: 'camera.pan:mast-cable' },
        ASK_TIMING: { to: 'timing' },
        ASK_SISTER: { to: 'sister-blind' },
      },
      onUnrecognised: { to: 'clarify-blind' },
    },

    {
      id: 'timing',
      tempo: Tempo.Think,
      say:
        'Started this morning. It is worse in the evening - but that is when the boats are in, so ' +
        'perhaps I only notice. It is not the weather, it was clear all day.',
      suggest: ['follow the aerial cable', 'tell me about Mirela'],
      on: {
        ASK_FEED: { to: 'feed-traced-slow', environment: 'camera.pan:mast-cable' },
        ASK_SISTER: { to: 'sister-blind' },
      },
      onUnrecognised: { to: 'clarify-blind' },
    },

    {
      id: 'sister-blind',
      tempo: Tempo.Think,
      say:
        'Mirela? She is down the hill. Her set died yesterday and something fixed it for her this ' +
        'morning, she would not stop going on about it. Why - what has that to do with my mast?',
      suggest: ['follow the aerial cable'],
      on: {
        ASK_FEED: { to: 'feed-traced-slow', environment: 'camera.pan:mast-cable' },
      },
      onUnrecognised: { to: 'clarify-blind' },
    },

    {
      /** The slow route to the same truth. §163: never a dead end. */
      id: 'feed-traced-slow',
      tempo: Tempo.Think,
      say:
        'Following the cable down... it does not go straight to the light. There is a join on the ' +
        'bracket, and a second cable off it heading down the hill. Towards the town. Towards - ' +
        'oh. That goes to Mirela’s shop, does it not.',
      suggest: ['put something in to separate them'],
      on: {
        FIT_ISOLATOR: {
          to: 'isolator-fitted',
          learn: [FACT_BEACON_DROPS_ON_KEYUP, FACT_FEED_NEEDS_ISOLATOR],
          environment: 'prop.steady:beacon',
        },
        CUT_FEED_LIVE: {
          to: 'arc',
          learn: [FACT_BEACON_DROPS_ON_KEYUP],
          environment: 'prop.spark:splice-box',
          vfx: 'ElectricalArcVFX',
        },
      },
      onUnrecognised: { to: 'clarify-blind' },
    },

    {
      /**
       * THE PAYOFF. The player already knows about the shared feed, so they arrive with
       * the answer - and with the realisation that they are the cause.
       */
      id: 'open-known',
      tempo: Tempo.Think,
      say:
        'The harbour light keeps going out. Not dimming - gone, three or four seconds, then back. ' +
        'Started this morning. The harbour master is asking me why and I have no answer. ' +
        'I am halfway up the mast now.',
      suggest: ['follow the aerial cable', 'tell me about Mirela', 'when did it start'],
      on: {
        ASK_FEED: {
          to: 'feed-confirmed',
          learn: [FACT_BEACON_DROPS_ON_KEYUP],
          environment: 'prop.open:splice-box',
        },
        ASK_SISTER: {
          to: 'feed-confirmed',
          learn: [FACT_BEACON_DROPS_ON_KEYUP],
          environment: 'prop.open:splice-box',
        },
        ASK_TIMING: { to: 'timing-known' },
        ADMIT_UNCERTAINTY: { to: 'timing-known' },
      },
      onUnrecognised: { to: 'clarify-blind' },
      onAmbiguous: { to: 'clarify-blind' },
    },

    {
      id: 'timing-known',
      tempo: Tempo.Think,
      say:
        'Started this morning, first time ever. Clear weather all day, so it is not the sky. ' +
        'You sound like you already have an idea.',
      suggest: ['follow the aerial cable', 'tell me about Mirela'],
      on: {
        ASK_FEED: {
          to: 'feed-confirmed',
          learn: [FACT_BEACON_DROPS_ON_KEYUP],
          environment: 'prop.open:splice-box',
        },
        ASK_SISTER: {
          to: 'feed-confirmed',
          learn: [FACT_BEACON_DROPS_ON_KEYUP],
          environment: 'prop.open:splice-box',
        },
      },
      onUnrecognised: { to: 'clarify-blind' },
    },

    {
      id: 'feed-confirmed',
      tempo: Tempo.Respond,
      say:
        'The join on the bracket - yes, it is here. Second cable off it, down the hill. ' +
        'That is Mirela’s. So every time she sends, my light goes out. It has been like that for ' +
        'years and it never mattered, because her set has been dead for... ' +
        'Her set has been dead for a long time. Until this morning.',
      suggest: ['put something in to separate them'],
      on: {
        FIT_ISOLATOR: {
          to: 'isolator-fitted',
          learn: [FACT_FEED_NEEDS_ISOLATOR],
          environment: 'prop.steady:beacon',
        },
        CUT_FEED_LIVE: {
          to: 'arc',
          environment: 'prop.spark:splice-box',
          vfx: 'ElectricalArcVFX',
        },
      },
      onUnrecognised: { to: 'clarify-blind' },
    },

    {
      /**
       * Same rule as Mirela's connector: CUT_FEED_LIVE is proposed for confirmation
       * before it ever fires, so by the time this beat runs the player has been asked
       * whether they mean to pull it apart while there is current in it, and has said
       * yes. That confirmation IS the second chance - see the arc beat in mission-01 for
       * the full reasoning. Both missions have to follow the same rule or it is a quirk
       * rather than something the player can learn.
       */
      id: 'arc',
      tempo: Tempo.Respond,
      say:
        'It flashed - the whole bracket lit up and I have let go of it. ' +
        'There was current in that. You asked me and I said yes, and there was current in it. ' +
        'I am coming down. The harbour master can put a lamp on the wall tonight.',
      on: {},
      failure: {
        summary:
          'You told Tomas to pull a shared cable apart while there was still current in it. '
          + 'It flashed in his hands. He came down off the mast, and the harbour light is '
          + 'still going out.',
        lesson:
          'Two things sharing one cable have to be separated with a proper box, not pulled '
          + 'apart while there is current in them.',
        cooldownSeconds: 90,
      },
    },

    {
      id: 'isolator-fitted',
      tempo: Tempo.Respond,
      say:
        'Box is in, both ends wired up. The light is steady... still steady... ' +
        'she must be sending by now and it has not moved once. That is it. ' +
        'I will go and tell her she owes me a mast.',
      on: {},
      outcome: {
        kind: OutcomeKind.Solved,
        say: 'The harbour light is steady. One cable, two sets, no longer fighting.',
        trust: 2,
        connects: [
          {
            a: FACT_SHARED_ANTENNA_FEED,
            b: FACT_BEACON_DROPS_ON_KEYUP,
            label: 'one feed, two transmitters',
          },
        ],
      },
    },
  ],
};
