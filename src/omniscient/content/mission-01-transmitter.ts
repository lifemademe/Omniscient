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

  /**
   * §131: observation, never diagnosis. Every one of these is something anybody looking
   * at the room could see. None of them says "the connector is corroded" - that is the
   * conclusion the player has to reach.
   */
  hints: [
    {
      id: 'hint-floor',
      summary: 'There has been water in this room',
      detail:
        'A dark line runs round the bottom of the walls, about a hand off the floor. '
        + 'The room has been flooded, and not just once.',
      keywords: ['water', 'flood'],
      cue: 'camera.pan:workshop-floor',
    },
    {
      id: 'hint-lamp',
      summary: 'The power is fine. Look at the set itself',
      detail:
        'The lamp on the front is lit and steady, so power is getting in. Whatever is '
        + 'wrong is inside the set, not in the wall.',
      // Not 'power' - "power is on" reads as an instruction to switch it on, and the
      // whole point of this observation is that the power is not the problem.
      keywords: ['set'],
      cue: 'camera.push-in:transmitter',
    },
    {
      id: 'hint-aerial',
      summary: 'The aerial wire leaves the building',
      detail:
        'The wire does not stop in this room. It goes out through the wall and keeps '
        + 'going, so this set is not the only thing using it.',
      keywords: ['aerial'],
      cue: 'camera.push-in:transmitter',
    },
    {
      id: 'hint-connectors',
      summary: 'Green stuff on the back of the set',
      detail:
        'One of the connectors on the back has green crust across it. That is what water '
        + 'does to metal, and it is sitting right across the pins.',
      keywords: ['connector', 'green'],
      cue: 'prop.highlight:connector-b',
      // Only observable once the set has been turned around.
      revealedBy: 'connector-found',
    },
  ],

  confirmations: {
    INSPECT_UNIT: 'Do you mean Mirela should describe the set itself?',
    INSPECT_CONNECTOR: 'Do you mean Mirela should look at the connectors on the back?',
    REMOVE_POWER: 'Do you mean Mirela should switch the power off at the wall?',
    CLEAN_CONNECTOR: 'Do you mean Mirela should clean the green crust off the pins?',
    CLEAN_LIVE: 'Do you mean Mirela should clean it now, while the power is still on?',
    ASK_AERIAL: 'Do you mean Mirela should say where the aerial wire goes?',
    ASK_HISTORY: 'Do you mean Mirela should say what happened to it?',
    TEST_TRANSMIT: 'Do you mean Mirela should switch it on and see if it works?',
    ADMIT_UNCERTAINTY: 'Do you want to tell her you are not sure yet?',
  },

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
       * the power is off - not by keyword exclusion, which would misfire on ordinary
       * phrasings like "clean the corrosion off".
       */
      id: 'CLEAN_LIVE',
      requires: [[...TERMS.clean], [...TERMS.connector, ...TERMS.corrosion]],
      priority: 1,
    },
    {
      /**
       * Asking about the aerial. The hint points at it, so there has to be a way to act
       * on it - and this is the route where the shared feed is stated outright rather
       * than mentioned in passing.
       */
      id: 'ASK_AERIAL',
      requires: [
        [...TERMS.inspect, ...TERMS.describe, 'follow', 'trace', 'goes', 'go'],
        // Deliberately not 'lead' - that word belongs to TERMS.connector, and colliding
        // with INSPECT_CONNECTOR would make "look at the lead" ambiguous.
        ['aerial', 'antenna', 'feed', 'mast'],
      ],
      priority: 3,
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
        'It worked yesterday. I switched it on this morning and got nothing at all - no sound, ' +
        'not even a hiss. The lamp on the front still comes on, so it is getting power. ' +
        'I have the back off already.',
      suggest: [
        'look at the back of the set',
        'what happened to it recently',
        'describe the set to me',
      ],
      on: {
        INSPECT_UNIT: {
          to: 'unit-overview',
          environment: 'camera.push-in:transmitter',
        },
        INSPECT_CONNECTOR: {
          to: 'connector-found',
          environment: 'prop.rotate:transmitter-rear',
        },
        ASK_AERIAL: { to: 'aerial', environment: 'camera.push-in:transmitter' },
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
      suggest: [
        'look at the back of the set',
        'turn the power off',
        'what happened to it recently',
      ],
      on: {
        INSPECT_UNIT: { to: 'unit-overview', environment: 'camera.push-in:transmitter' },
        INSPECT_CONNECTOR: { to: 'connector-found', environment: 'prop.rotate:transmitter-rear' },
        ASK_AERIAL: { to: 'aerial' },
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
        'the front of the set, or round the back where the wires go?',
      suggest: ['look at the back of the set', 'describe the set to me', 'what happened to it recently'],
      on: {
        INSPECT_UNIT: { to: 'unit-overview', environment: 'camera.push-in:transmitter' },
        INSPECT_CONNECTOR: { to: 'connector-found', environment: 'prop.rotate:transmitter-rear' },
        ASK_AERIAL: { to: 'aerial' },
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
        'It was my father\'s. The lamp is lit, but the needle does not move when I try to send. ' +
        'The aerial wire runs out through the wall - it feeds the harbour light as well, ' +
        'we split it years ago so we would not need two masts.',
      suggest: ['look at the connectors on the back', 'turn the power off', 'what happened to it recently'],
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
        'And the aerial is shared with the harbour light, if that matters - we split it years ago.',
      suggest: ['look at the connectors on the back', 'turn the power off'],
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
      /**
       * The aerial route. The player followed the hint, so they get the shared feed
       * stated plainly rather than in passing - and it still reads as small talk, because
       * she has no idea it matters either.
       */
      id: 'aerial',
      tempo: Tempo.Think,
      learn: [FACT_SHARED_ANTENNA_FEED],
      say:
        'The wire? Out through the wall and up the hill. It feeds the harbour light too - ' +
        'we split it years ago so we would not need two masts. It has never given us trouble. ' +
        'Whatever is wrong is in here somewhere, I am sure of it.',
      suggest: ['look at the connectors on the back', 'turn the power off'],
      on: {
        INSPECT_CONNECTOR: {
          to: 'connector-found',
          environment: 'prop.rotate:transmitter-rear',
        },
        INSPECT_UNIT: { to: 'unit-overview', environment: 'camera.push-in:transmitter' },
        ASK_HISTORY: { to: 'history' },
        REMOVE_POWER: { to: 'power-off-early', environment: 'prop.toggle:mains-switch' },
      },
      onUnrecognised: { to: 'clarify' },
    },

    {
      id: 'connector-found',
      tempo: Tempo.Think,
      say:
        'Round the back... ah. There is green crust on the second connector, the fat one. ' +
        'It is spread right across the pins. Do you want me to get at it?',
      suggest: [
        'turn the power off first',
        'clean the connector now',
        'what happened to it recently',
      ],
      // She asked a direct question. "Yes" means clean it while it is still live - which
      // is the unsafe intent, so it gets proposed back for confirmation rather than done.
      affirmIntent: 'CLEAN_LIVE',
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
        'Power is off at the wall. The lamp has gone out. Right - what am I looking for?',
      // Only the forward move. Offering "describe the set" here sent the player back to
      // unit-overview, which suggests history, which suggests taking the power off, which
      // lands here again - a three-beat loop a player could tap around indefinitely
      // without the game ever pointing at the connectors.
      suggest: ['look at the connectors on the back'],
      on: {
        INSPECT_CONNECTOR: {
          to: 'connector-found-safe',
          learn: [FACT_SHARED_ANTENNA_FEED],
          environment: 'prop.rotate:transmitter-rear',
        },
        INSPECT_UNIT: { to: 'unit-overview' },
        ASK_AERIAL: { to: 'aerial' },
      },
      onUnrecognised: { to: 'clarify' },
    },

    {
      id: 'connector-found-safe',
      tempo: Tempo.Think,
      say:
        'Green crust on the second connector, right across the pins. The set is dead cold now, ' +
        'so I can touch it.',
      suggest: ['clean the green off the connector'],
      affirmIntent: 'CLEAN_CONNECTOR',
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
      suggest: ['turn the power off'],
      affirmIntent: 'REMOVE_POWER',
      on: {
        REMOVE_POWER: {
          to: 'power-off',
          environment: 'prop.toggle:mains-switch',
        },
        // Telling her to go back in after that ends the request.
        CLEAN_LIVE: {
          to: 'lost',
          environment: 'prop.spark:connector-b',
          vfx: 'SparkVFX',
        },
        INSPECT_CONNECTOR: { to: 'arc-waiting' },
        ADMIT_UNCERTAINTY: { to: 'arc-waiting' },
      },
      /**
       * A message the parser did not understand must NOT shock her again.
       *
       * It used to loop straight back here firing the spark cue, so every typo put another
       * flash across her hand - endlessly, with no consequence and no way out. It read
       * exactly like failing the mission while never actually failing it, which is the
       * worst of both: all of the punishment and none of the resolution.
       */
      onUnrecognised: { to: 'arc-waiting' },
    },

    {
      /**
       * Holding, hurt, waiting to be told the obvious thing. She will not touch it again,
       * so nothing the player says here can hurt her further except telling her to go
       * back in - which ends the request.
       */
      id: 'arc-waiting',
      tempo: Tempo.Act,
      say:
        'I am not touching it again while it is live. Should I switch the power off at the wall?',
      suggest: ['turn the power off'],
      affirmIntent: 'REMOVE_POWER',
      on: {
        REMOVE_POWER: {
          to: 'power-off',
          environment: 'prop.toggle:mains-switch',
        },
        CLEAN_LIVE: {
          to: 'lost',
          environment: 'prop.spark:connector-b',
          vfx: 'SparkVFX',
        },
      },
      onUnrecognised: { to: 'arc-waiting' },
    },

    {
      /**
       * §155: a lost request, not a game over. Nobody is badly hurt - §93 keeps threat
       * non-graphic - but she has stopped listening, and OMNISCIENT_ has to sit with
       * having told her to reach into a live set twice.
       *
       * Mission 01 previously had no reachable failure at all: the arc looped back on
       * itself forever, so a player who set off the spark was stuck sparking with no way
       * to lose and no way out. Losing has to be possible or the note the player writes
       * themselves (§170) is decorative.
       */
      id: 'lost',
      tempo: Tempo.Respond,
      say:
        'No. I am not putting my hand back in there. Look at it - look at my hand. ' +
        'I am going to shut it in the cupboard and ask Tomas in the morning. ' +
        'Thank you, but no.',
      on: {},
      failure: {
        summary:
          'You told Mirela to clean a live connector twice. The second flash was worse than '
          + 'the first and she stopped trusting you. Her transmitter is still dead.',
        lesson:
          'Take the power off a set before anybody touches the inside of it.',
        cooldownSeconds: 90,
      },
    },

    {
      id: 'power-off',
      tempo: Tempo.Think,
      say: 'Power is off at the wall, lamp has gone out. It is cold now - I can get at that crust properly.',
      suggest: ['clean the green off the connector'],
      affirmIntent: 'CLEAN_CONNECTOR',
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
        'Scraped back to bright metal, both pins. Pushed it back on. Shall I switch it on and try?',
      suggest: ['switch it on and try it'],
      affirmIntent: 'TEST_TRANSMIT',
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
        'There it is. The needle is moving. That is my week back. ' +
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

