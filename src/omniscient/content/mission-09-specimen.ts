/**
 * MISSION 09 - "It is outside the tank"
 *
 * The request that is not a repair, and the only contact view in the game with no room in
 * it. Keller does not want OMNISCIENT_ to fix anything - she wants a second pair of eyes on
 * a file, because she has been alone with it for eleven days and has stopped trusting her
 * own reading of it.
 *
 * Structurally this is a corridor rather than a diagnosis: there is no hidden fault and no
 * wrong answer, and every route through the conversation arrives at the same icon on the
 * same desktop. That is deliberate. The mission is a doorway with dialogue attached, and
 * the thing on the other side of it is the whole point - so the writing's job is to make
 * the player WANT to open the file, not to make them deserve it.
 *
 * The launch is `game.launch:m4ss`, intercepted by OmniscientRig before the scene sees it.
 * See applyEnvironmentCue.
 */

import { KnowledgeDomain } from '../knowledge/KnowledgeStore.js';
import { TERMS } from '../mission/intent.js';
import { OutcomeKind, Tempo, Urgency } from '../mission/types.js';

import { KELLER } from './contacts.js';

import type { MissionDefinition } from '../mission/types.js';

export const FACT_SPECIMEN_MASS = 'specimen_m4ss';
export const FACT_STATION_ALONE = 'station_nine_unmanned';

export const MISSION_09: MissionDefinition = {
  id: 'm09-specimen',
  version: 1,
  contactId: KELLER.id,
  sceneId: 'scene-station-desk',
  archetype: 'diagnosis',
  objective: 'Look at what Dana Keller has been watching, and tell her what you see.',
  // Said once, on the first re-contact after a lost attempt. See reopeningSay in types.
  reopeningSay: 'The feed has not improved since last time. Neither has my patience with it.',
  urgency: Urgency.Calm,

  hiddenTruth: {
    summary:
      'There is no fault. The specimen is doing exactly what it is supposed to do, which ' +
      'is the part Keller cannot bring herself to write down. Opening the file is the ask.',
    requiredIntents: ['OPEN_FILE'],
    unsafeIntents: [],
  },

  knowledge: [
    {
      id: FACT_SPECIMEN_MASS,
      label: 'Station 9 holds a specimen that moves by dividing itself',
      domain: KnowledgeDomain.Signal,
    },
    {
      id: FACT_STATION_ALONE,
      label: 'Pelagic Station 9 has one person on it',
      domain: KnowledgeDomain.Place,
      incidental: true,
    },
  ],

  /**
   * §131: observation, never diagnosis. There is nothing to diagnose here, so these are
   * the three things anybody looking over her shoulder would notice about the SCREEN -
   * which is the only thing there is to look at.
   */
  hints: [
    {
      id: 'hint-desktop',
      summary: 'One file has been left out on the desktop',
      detail:
        'Everything else on this desktop is filed under a date. One folder is not: it sits '
        + 'on its own at the top left, where somebody puts a thing they keep coming back to.',
      keywords: ['file', 'desktop', 'folder', 'screen'],
    },
    {
      id: 'hint-clock',
      summary: 'The station clock is on local time and nothing else is',
      detail:
        'The bar reads local. Every log line underneath it is stamped in a zone eleven '
        + 'hours off. Somebody has been awake on the wrong one of those for a while.',
      keywords: ['clock', 'time', 'log'],
    },
    {
      id: 'hint-breach',
      summary: 'Containment reads BREACHED and nothing is flashing',
      detail:
        'The status line says the specimen is outside its tank. Nothing on the screen is '
        + 'alarming about it. Either the alarm has been silenced, or it has been like this '
        + 'long enough to stop being news.',
      keywords: ['containment', 'breach', 'alarm', 'tank'],
    },
  ],

  intents: [
    {
      id: 'ASK_SPECIMEN',
      requires: [
        [...TERMS.describe, ...TERMS.inspect],
        ['specimen', 'mass', 'm4ss', 'thing', 'it', 'creature', 'sample'],
      ],
    },
    {
      id: 'ASK_STATION',
      requires: [
        [...TERMS.describe],
        ['station', 'there', 'alone', 'crew', 'anyone', 'you', 'nine'],
      ],
    },
    {
      id: 'ASK_CONTAINMENT',
      requires: [
        [...TERMS.describe, ...TERMS.inspect],
        ['containment', 'breach', 'tank', 'loose', 'escaped', 'out'],
      ],
      priority: 2,
    },
    {
      /*
       * The one that matters, and the reason it is priority 3.
       *
       * TERMS.inspect contains "open", and TERMS.describe contains "show" - so "show me the
       * specimen" is legitimately both ASK_SPECIMEN and this. The whole mission is a
       * corridor to this intent, so when a sentence could be either, it should be this one.
       */
      id: 'OPEN_FILE',
      requires: [
        [...TERMS.inspect, 'run', 'play', 'start', 'launch', 'double'],
        ['file', 'folder', 'specimen', 'm4ss', 'feed', 'recording', 'icon'],
      ],
      priority: 3,
    },
  ],

  openingBeatId: 'open',

  beats: [
    {
      id: 'open',
      tempo: Tempo.Think,
      framing: 'camera.push-in:default',
      say:
        'You are the first thing that has answered in nine days, so I am going to skip the '
        + 'introductions. I am Dana Keller, I am the only one on this station, and the thing '
        + 'I am supposed to be keeping in a tank is not in the tank. It has not hurt anything. '
        + 'That is the part I cannot get anyone to take seriously.',
      /*
       * Two chips, both about the thing rather than about her. A player who opens with
       * "are you all right" gets a better answer than the game recommends, which is the
       * correct way round: the suggestions are the safe path, not the best one.
       */
      suggest: ['what is the specimen', 'what is on your screen'],
      on: {
        ASK_SPECIMEN: { to: 'specimen' },
        ASK_CONTAINMENT: { to: 'containment' },
        ASK_STATION: { to: 'station' },
        OPEN_FILE: { to: 'offer-file', environment: 'prop.select:desktop' },
      },
    },

    {
      id: 'specimen',
      tempo: Tempo.Respond,
      say:
        'We logged it as M4SS because the intake form wanted four characters and nobody '
        + 'expected it to still be here. It is about forty units of - I want to say tissue, '
        + 'but it does not have any. It moves by leaving parts of itself behind and going '
        + 'back for them. I have watched it do that two hundred times and I still could not '
        + 'tell you whether it is deciding to.',
      learn: [FACT_SPECIMEN_MASS],
      suggest: ['how did it get out', 'show me the file'],
      on: {
        ASK_CONTAINMENT: { to: 'containment' },
        ASK_STATION: { to: 'station' },
        OPEN_FILE: { to: 'offer-file', environment: 'prop.select:desktop' },
        ASK_SPECIMEN: { to: 'offer-file', environment: 'prop.select:desktop' },
      },
    },

    {
      id: 'containment',
      tempo: Tempo.Respond,
      framing: 'camera.pan:room',
      say:
        'The tank has a gap at the bottom for the drain. Forty units does not fit through a '
        + 'gap that size. Thirty does, if the other ten stays behind - and the other ten was '
        + 'sitting on the floor of the tank when I came down, waiting. It came back for it '
        + 'afterwards. That is when I stopped filing these as incidents.',
      learn: [FACT_SPECIMEN_MASS],
      suggest: ['show me the file', 'are you alone out there'],
      on: {
        ASK_SPECIMEN: { to: 'specimen' },
        ASK_STATION: { to: 'station' },
        OPEN_FILE: { to: 'offer-file', environment: 'prop.select:desktop' },
        ASK_CONTAINMENT: { to: 'offer-file', environment: 'prop.select:desktop' },
      },
    },

    {
      id: 'station',
      tempo: Tempo.Respond,
      framing: 'camera.pan:room',
      say:
        'Nine is a two-person post. It has been a one-person post since March, and the '
        + 'relief window is November. I am fine. I have a feed, I have a log, and I have the '
        + 'thing in the tank, which is better company than that sounds.',
      learn: [FACT_STATION_ALONE],
      suggest: ['what is on your screen', 'show me the file'],
      on: {
        ASK_SPECIMEN: { to: 'specimen' },
        ASK_CONTAINMENT: { to: 'containment' },
        OPEN_FILE: { to: 'offer-file', environment: 'prop.select:desktop' },
        ASK_STATION: { to: 'offer-file', environment: 'prop.select:desktop' },
      },
    },

    /*
     * The doorway. The icon lights and the camera goes to it, but nothing opens yet -
     * there is one more sentence and one more confirmation, because the whole point of
     * this mission is that opening the file is a decision somebody makes rather than a
     * button that appears.
     */
    {
      id: 'offer-file',
      tempo: Tempo.Think,
      framing: 'camera.push-in:file',
      say:
        'Top left. "specimen M4SS". That is eleven days of feed and I have watched all of '
        + 'it, and I am not going to tell you what I think it is doing, because then you '
        + 'will look for that. Open it. Tell me what you see.',
      suggest: ['open the file', 'open specimen M4SS'],
      on: {
        OPEN_FILE: { to: 'watching', environment: 'prop.open:desktop, game.launch:m4ss' },
        ASK_SPECIMEN: { to: 'specimen' },
        ASK_CONTAINMENT: { to: 'containment' },
        ASK_STATION: { to: 'station' },
      },
    },

    /*
     * The launch.
     *
     * The cue rides on the TRANSITION into this beat rather than on the beat itself, which
     * is the only place the format has for it: a beat owns its framing and its gesture, and
     * anything the world does is authored on the path that caused it. Two cues in order -
     * the window grows out of the icon, then the game takes the screen. The rig intercepts
     * `game.launch` before the scene ever sees it (see OmniscientRig.applyEnvironmentCue),
     * and Escape brings the player back here with the window still open behind them.
     */
    {
      id: 'watching',
      tempo: Tempo.Respond,
      say:
        'There. That is the feed, and those are the controls - the same ones I have. Move it '
        + 'about. Take it somewhere. You will see what I mean within about a minute, and then '
        + 'I would like you to tell me I am wrong.',
      learn: [FACT_SPECIMEN_MASS],
      suggest: ['it is deliberate', 'it is only physics'],
      on: {
        ASK_SPECIMEN: { to: 'verdict' },
        ASK_CONTAINMENT: { to: 'verdict' },
        OPEN_FILE: { to: 'verdict' },
        ASK_STATION: { to: 'verdict' },
      },
    },

    {
      id: 'verdict',
      tempo: Tempo.Respond,
      framing: 'camera.pan:default',
      say:
        'Thank you. Genuinely - not for an answer, for looking. I am going to put your '
        + 'session in the log next to mine, and when the relief gets here in November there '
        + 'will be two records instead of one person who spent a winter watching a tank.',
      on: {},
      outcome: {
        kind: OutcomeKind.Solved,
        say: 'Specimen file reviewed. Station 9 logged a second observer.',
        trust: 2,
      },
    },
  ],
};
