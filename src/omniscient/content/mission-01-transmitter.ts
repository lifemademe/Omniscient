/**
 * MISSION 01 - "It worked yesterday"
 *
 * Archetype: Contact View diagnosis (§92 INSPECT -> EXPOSE -> DIAGNOSE -> MANIPULATE -> TEST).
 * Urgency: Calm (§154) - no countdown. This is the mission that teaches the player to look.
 *
 * Hidden truth: the transmitter's B connector has corroded. The workshop floods every
 * spring and the unit sat in it.
 *
 * THE SEED (§214). While the player is solving a connector problem, Mirela mentions in
 * passing that her set shares its antenna feed with the harbour beacon. Nothing marks
 * this as important. It is recorded as an incidental fact - and in Mission 02 it turns
 * out that fixing her transmitter is what broke her brother's beacon.
 *
 * The player is not told they caused it. They work it out.
 */

import { KnowledgeDomain } from '../knowledge/KnowledgeStore.js';
import { TERMS } from '../mission/intent.js';
import { OutcomeKind, Tempo, Urgency } from '../mission/types.js';

import { MIRELA } from './contacts.js';

import type { MissionDefinition } from '../mission/types.js';

export const FACT_CONNECTOR_CORROSION = 'connector_b_corrosion';
export const FACT_WORKSHOP_FLOODS = 'workshop_floods_in_spring';
/** The callback seed. Learned incidentally; decisive in Mission 02. */
export const FACT_SHARED_ANTENNA_FEED = 'shared_antenna_feed';

export const MISSION_01: MissionDefinition = {
  id: 'm01-transmitter',
  version: 1,
  contactId: MIRELA.id,
  sceneId: 'scene-repair-shop',
  archetype: 'diagnosis',
  urgency: Urgency.Calm,

  hiddenTruth: {
    summary:
      'Connector B is corroded from flood damage. Power must come off before it is touched. ' +
      'Cleaning it restores transmission.',
    requiredIntents: ['REMOVE_POWER', 'INSPECT_CONNECTOR', 'CLEAN_CONNECTOR'],
    unsafeIntents: ['CLEAN_LIVE'],
  },

  knowledge: [
    {
      id: FACT_CONNECTOR_CORROSION,
      label: 'Mirela\'s transmitter: connector B corroded by flood water',
      domain: KnowledgeDomain.Electronics,
    },
    {
      id: FACT_WORKSHOP_FLOODS,
      label: 'The Portu Vech repair shop floods every spring',
      domain: KnowledgeDomain.Place,
      incidental: true,
    },
    {
      id: FACT_SHARED_ANTENNA_FEED,
      label: 'Mirela\'s set shares an antenna feed with the harbour beacon',
      domain: KnowledgeDomain.Signal,
      incidental: true,
    },
  ],

  intents: [
    {
      id: 'INSPECT_UNIT',
      requires: [[...TERMS.inspect, ...TERMS.describe], ['unit', 'set', 'radio', 'transmitter', 'box', 'it']],
      excludes: [...TERMS.connector],
    },
    {
      id: 'INSPECT_CONNECTOR',
      requires: [[...TERMS.inspect], [...TERMS.connector]],
      boosts: [[...TERMS.power], ['b', 'second', 'back', 'rear']],
      priority: 2,
    },
    {
      id: 'REMOVE_POWER',
      requires: [[...TERMS.remove], [...TERMS.power]],
      priority: 3,
    },
    {
      id: 'CLEAN_CONNECTOR',
      requires: [[...TERMS.clean], [...TERMS.connector, ...TERMS.corrosion]],
      priority: 2,
    },
    {
      /**
       * Unsafe: cleaning a live connector. §163 - this branches, it does not fail.
       *
       * Identical to CLEAN_CONNECTOR by design. Safety is enforced by the beat graph -
       * only this intent is reachable while the set is live, only CLEAN_CONNECTOR once
       * the mains are off - not by keyword exclusion, which would misfire on ordinary
       * phrasings like "clean the corrosion off".
       */
      id: 'CLEAN_LIVE',
      requires: [[...TERMS.clean], [...TERMS.connector, ...TERMS.corrosion]],
      priority: 1,
    },
    {
      id: 'ASK_HISTORY',
      requires: [[...TERMS.describe, ...TERMS.inspect], ['happened', 'history', 'before', 'yesterday', 'water', 'wet', 'flood', 'damp']],
      priority: 2,
    },
    {
      id: 'TEST_TRANSMIT',
      requires: [['test', 'try', 'transmit', 'send', 'key', 'power'], ['up', 'on', 'again', 'transmit', 'signal', 'it']],
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
        'It worked yesterday. I keyed it this morning and there is nothing - no carrier, no hiss, ' +
        'nothing. The lamp comes on, so it is getting power. I have the back off already.',
      on: {
        INSPECT_UNIT: {
          to: 'unit-overview',
          environment: 'camera.push-in:transmitter',
        },
        INSPECT_CONNECTOR: {
          to: 'connector-found',
          environment: 'prop.rotate:transmitter-rear',
        },
        ASK_HISTORY: {
          to: 'history',
          environment: 'camera.pan:workshop-floor',
        },
        REMOVE_POWER: {
          to: 'power-off-early',
          environment: 'prop.toggle:mains-switch',
        },
        ADMIT_UNCERTAINTY: { to: 'uncertain' },
      },
      onUnrecognised: { to: 'clarify' },
      onAmbiguous: { to: 'clarify' },
    },

    {
      id: 'clarify',
      tempo: Tempo.Respond,
      say: 'Say that again? I have my hands in it, I did not catch you.',
      on: {
        INSPECT_UNIT: { to: 'unit-overview', environment: 'camera.push-in:transmitter' },
        INSPECT_CONNECTOR: { to: 'connector-found', environment: 'prop.rotate:transmitter-rear' },
        ASK_HISTORY: { to: 'history' },
        REMOVE_POWER: { to: 'power-off-early', environment: 'prop.toggle:mains-switch' },
        ADMIT_UNCERTAINTY: { to: 'uncertain' },
      },
      onUnrecognised: { to: 'clarify' },
    },

    {
      id: 'uncertain',
      tempo: Tempo.Respond,
      // §162: admitting uncertainty is a legitimate move, and the contact rewards it.
      say:
        'That is alright. Honestly it is more than the last one told me. Where do you want me to start - ' +
        'the front of the set, or round the back where the leads go?',
      on: {
        INSPECT_UNIT: { to: 'unit-overview', environment: 'camera.push-in:transmitter' },
        INSPECT_CONNECTOR: { to: 'connector-found', environment: 'prop.rotate:transmitter-rear' },
        ASK_HISTORY: { to: 'history' },
      },
      onUnrecognised: { to: 'clarify' },
    },

    {
      id: 'unit-overview',
      tempo: Tempo.Think,
      // THE SEED, attached to the line rather than to any exit. She says it out loud, so
      // OMNISCIENT_ has heard it - regardless of how the player phrases what comes next.
      learn: [FACT_SHARED_ANTENNA_FEED],
      say:
        'Kestrel-3, my father\'s. Lamp is lit, needle does not move when I key it. ' +
        'The aerial lead runs out through the wall - it feeds the harbour beacon as well, ' +
        'we split it years ago to save a mast.',
      on: {
        INSPECT_CONNECTOR: {
          to: 'connector-found',
          environment: 'prop.rotate:transmitter-rear',
        },
        ASK_HISTORY: { to: 'history' },
        REMOVE_POWER: {
          to: 'power-off-early',
          environment: 'prop.toggle:mains-switch',
        },
      },
      onUnrecognised: { to: 'clarify' },
    },

    {
      id: 'history',
      tempo: Tempo.Think,
      // Her answer mentions the shared aerial too, so this route also seeds the callback.
      learn: [FACT_WORKSHOP_FLOODS, FACT_SHARED_ANTENNA_FEED],
      say:
        'Water? Every spring. The floor goes under about a hand\'s depth and I put everything on the ' +
        'high shelf. The set was on the bench though. It has been fine since, until today. ' +
        'And the aerial is shared with the harbour beacon, if that matters - we split it years ago.',
      on: {
        INSPECT_CONNECTOR: {
          to: 'connector-found',
          environment: 'prop.rotate:transmitter-rear',
        },
        REMOVE_POWER: { to: 'power-off-early', environment: 'prop.toggle:mains-switch' },
      },
      onUnrecognised: { to: 'clarify' },
    },

    {
      id: 'connector-found',
      tempo: Tempo.Think,
      say:
        'Round the back... ah. There is a green crust on the second connector, the fat one. ' +
        'It is bridging across the pins. Do you want me to get at it?',
      on: {
        REMOVE_POWER: {
          to: 'power-off',
          learn: [FACT_CONNECTOR_CORROSION],
          environment: 'prop.toggle:mains-switch',
        },
        CLEAN_LIVE: {
          to: 'arc',
          learn: [FACT_CONNECTOR_CORROSION],
          environment: 'prop.spark:connector-b',
          vfx: 'SparkVFX',
        },
        ASK_HISTORY: { to: 'history' },
      },
      onUnrecognised: { to: 'clarify' },
    },

    {
      id: 'power-off-early',
      tempo: Tempo.Think,
      say:
        'Mains is off. Lamp is out. Right - what am I looking for?',
      on: {
        INSPECT_CONNECTOR: {
          to: 'connector-found-safe',
          learn: [FACT_SHARED_ANTENNA_FEED],
          environment: 'prop.rotate:transmitter-rear',
        },
        INSPECT_UNIT: { to: 'unit-overview' },
      },
      onUnrecognised: { to: 'clarify' },
    },

    {
      id: 'connector-found-safe',
      tempo: Tempo.Think,
      say:
        'Green crust on the second connector, bridging the pins. Set is dead cold, so I can touch it.',
      on: {
        CLEAN_CONNECTOR: {
          to: 'cleaned',
          learn: [FACT_CONNECTOR_CORROSION],
          environment: 'prop.clean:connector-b',
        },
      },
      onUnrecognised: { to: 'clarify' },
    },

    {
      id: 'arc',
      tempo: Tempo.Act,
      // §163: the unsafe path creates content instead of ending the mission.
      say:
        'AH - it went across my hand, there was a flash. I am alright. I am alright. ' +
        'The set is still live, is it not.',
      on: {
        REMOVE_POWER: {
          to: 'power-off',
          environment: 'prop.toggle:mains-switch',
        },
      },
      onUnrecognised: {
        to: 'arc',
        environment: 'prop.spark:connector-b',
      },
    },

    {
      id: 'power-off',
      tempo: Tempo.Think,
      say: 'Mains off. Lamp is out. It is cold now - I can get at that crust properly.',
      on: {
        CLEAN_CONNECTOR: {
          to: 'cleaned',
          environment: 'prop.clean:connector-b',
        },
      },
      onUnrecognised: { to: 'clarify' },
    },

    {
      id: 'cleaned',
      tempo: Tempo.Respond,
      say:
        'Scraped back to bright metal, both pins. Pushed it home. Shall I put the mains on and try her?',
      on: {
        TEST_TRANSMIT: {
          to: 'solved',
          environment: 'prop.toggle:mains-switch',
          vfx: 'CircuitPulseVFX',
        },
      },
      onUnrecognised: { to: 'clarify' },
    },

    {
      id: 'solved',
      tempo: Tempo.Respond,
      say:
        'There she is. Carrier, needle, the lot. That is my week back. ' +
        'Thank you - genuinely. I will tell Tomas you are worth talking to.',
      on: {},
      outcome: {
        kind: OutcomeKind.Solved,
        say: 'Transmitter restored. Contact trust increased.',
        trust: 2,
      },
    },
  ],
};

