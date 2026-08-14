/**
 * MISSION 04 - Ileana Marku, and a family nobody wrote down.
 *
 * The first three requests all resolve by saying the right sentence. That is the right
 * default and it is also the only verb in the game so far, which is how a diagnosis game
 * turns into a vocabulary quiz. This one asks the player to *do* something instead: hold
 * five statements at once and work out the shape they make.
 *
 * Which is, precisely, the thing the fiction has been claiming OMNISCIENT_ is for. Ileana
 * knows every one of these facts. She has known them her whole life. What she cannot do
 * is hold them all in her head at the same time and see the figure they draw - and that
 * is not a failing, it is what people are like. It is the first request where the player
 * is useful for being a machine rather than for being clever.
 *
 * §160: still data, still the shared runtime. The board is a beat property, not a script.
 */

import { KnowledgeDomain } from '../knowledge/KnowledgeStore.js';
import { TERMS } from '../mission/intent.js';
import { OutcomeKind, Tempo, Urgency } from '../mission/types.js';

import type { MissionDefinition } from '../mission/types.js';

export const FACT_FLOOD_TOOK_RECORDS = 'flood-took-the-records';
export const FACT_NAMES_ON_PHOTOGRAPHS = 'names-on-the-photographs';
export const FACT_ILEANA_LINE = 'ileana-marku-family-line';
export const FACT_MEMORY_IS_NOT_A_RECORD = 'memory-is-not-a-record';

/**
 * The five, and the two-hop reasoning each one needs.
 *
 * Nothing here is a trick. Every answer follows from a sentence she says out loud, and
 * every sentence is in the words somebody would actually use - "my mother's sister", not
 * "maternal aunt". §187's rule about not using big words applies to relationships too:
 * the moment the board says "maternal" it stops being about her family and starts being
 * about vocabulary.
 */
const BOARD_PEOPLE = [
  { id: 'petra', name: 'Petra', note: 'my mother’s sister', answer: 'aunt' },
  { id: 'andrei', name: 'Andrei', note: 'Petra’s boy', answer: 'cousin' },
  { id: 'sofia', name: 'Sofia', note: 'my mother’s mother', answer: 'grandmother' },
  { id: 'grigore', name: 'Grigore', note: 'Sofia was married to him', answer: 'grandfather' },
  { id: 'marta', name: 'Marta', note: 'my brother’s girl', answer: 'niece' },
] as const;

/**
 * More slots than people, so the board cannot be solved by elimination.
 *
 * With exactly five slots the last one places itself, which turns the final and most
 * interesting inference - Grigore is only a grandfather because Sofia is a grandmother -
 * into a freebie.
 */
const BOARD_SLOTS = [
  { id: 'mother', label: 'mother' },
  { id: 'father', label: 'father' },
  { id: 'grandmother', label: 'grandmother' },
  { id: 'grandfather', label: 'grandfather' },
  { id: 'aunt', label: 'aunt' },
  { id: 'uncle', label: 'uncle' },
  { id: 'cousin', label: 'cousin' },
  { id: 'niece', label: 'niece' },
  { id: 'nephew', label: 'nephew' },
] as const;

export const MISSION_04: MissionDefinition = {
  id: 'm04-relations',
  version: 1,
  contactId: 'ileana',
  sceneId: 'scene-cleared-house',
  archetype: 'diagnosis',
  // Nothing is on fire and nobody is in danger. §154: not every request gets a countdown,
  // and a request about a funeral is the last one that should have a clock on it.
  urgency: Urgency.Calm,

  hiddenTruth: {
    summary:
      'Ileana knows every relationship in her family and has never had to state them all ' +
      'at once. The records that would have held the shape were pulped in a flood years ' +
      'ago. She needs the figure assembled, not discovered.',
    requiredIntents: ['LIST_NAMES'],
    unsafeIntents: ['WRITE_TO_EVERYONE'],
  },

  knowledge: [
    {
      id: FACT_FLOOD_TOOK_RECORDS,
      label: 'The spring flood pulped the parish records in Vadu Sec',
      domain: KnowledgeDomain.Place,
    },
    {
      id: FACT_NAMES_ON_PHOTOGRAPHS,
      label: 'Names written on the back of photographs outlast the paper that was filed',
      domain: KnowledgeDomain.Place,
      incidental: true,
    },
    {
      id: FACT_ILEANA_LINE,
      label: 'Ileana Marku’s family line, assembled from what she could still say',
      domain: KnowledgeDomain.People,
    },
    {
      id: FACT_MEMORY_IS_NOT_A_RECORD,
      label: 'A person can know every fact and still not hold the shape they make',
      domain: KnowledgeDomain.People,
    },
  ],

  hints: [
    {
      id: 'hint-box',
      summary: 'A shoebox of **photographs** on the table, names pencilled on the backs.',
      detail:
        'Some of the pencil has gone silver with age. The hand changes about halfway ' +
        'through the box - two different people labelled these, years apart, and neither ' +
        'of them wrote down how anybody was related. They already knew.',
      keywords: ['photographs', 'names', 'box'],
      cue: 'prop.highlight:photo-box',
    },
    {
      id: 'hint-tideline',
      summary: 'The same **flood** line on the wall here as in Mirela’s shop.',
      detail:
        'A dark band about a hand off the floor - a different sea, a different spring, ' +
        'and the mark sits at exactly the height it does in a repair shop OMNISCIENT_ ' +
        'has already stood in. Whatever took her floor took this family’s papers.',
      keywords: ['flood', 'water', 'papers'],
    },
    {
      id: 'hint-letters',
      summary: 'A short stack of **letters**, addressed and unsent.',
      detail:
        'Four envelopes, stamped, no names on them yet. She has written the same thing ' +
        'four times and stopped at the part where you put down who it is going to.',
      keywords: ['letters', 'write', 'funeral'],
      revealedBy: 'why',
    },
  ],

  confirmations: {
    WRITE_TO_EVERYONE:
      'Do you mean Ileana should send them to every name in the box, related or not?',
  },

  intents: [
    {
      id: 'ASK_PAPERS',
      requires: [
        [...TERMS.inspect, ...TERMS.describe, 'happened'],
        ['papers', 'paper', 'records', 'record', 'certificate', 'certificates', 'register',
         'documents', 'parish', 'bible'],
      ],
      priority: 3,
    },
    {
      id: 'ASK_WHY',
      requires: [
        ['why', 'what', 'who', 'when'],
        ['matter', 'matters', 'need', 'for', 'now', 'writing', 'write', 'happened',
         'funeral', 'letters', 'urgent'],
      ],
      priority: 2,
    },
    {
      /** The one that opens the board. Deliberately the easiest thing to stumble into. */
      id: 'LIST_NAMES',
      requires: [
        [...TERMS.describe, ...TERMS.inspect, 'read', 'go', 'start', 'list', 'give'],
        ['names', 'name', 'them', 'family', 'people', 'everyone', 'box', 'who', 'through'],
      ],
      priority: 4,
    },
    {
      /**
       * Unsafe, and not one volt is involved. §163 wants failure that generates story:
       * a letter about a death arriving at a house where the person it is addressed to
       * died years ago is a consequence, where a spark she was never going to touch is
       * just a buzzer.
       */
      id: 'WRITE_TO_EVERYONE',
      requires: [
        ['write', 'send', 'post', 'mail'],
        ['everyone', 'everybody', 'all', 'every', 'anyone', 'them'],
      ],
      excludes: ['names', 'name'],
      priority: 3,
    },
    {
      id: 'ADMIT_UNCERTAINTY',
      requires: [
        [...TERMS.uncertain, 'again', 'repeat', 'back', 'sorry', 'lost'],
      ],
      priority: 1,
    },
  ],

  beats: [
    {
      id: 'open',
      tempo: Tempo.Think,
      say:
        'My grandmother died on Tuesday. I am in her house now and I have to write to ' +
        'the family, and I have got as far as the envelopes. I know all of these ' +
        'people. I have known them my whole life. I sit down to put it in order and it ' +
        'comes apart in my hands.',
      learn: [FACT_NAMES_ON_PHOTOGRAPHS],
      suggest: ['tell me the names', 'why does it matter now', 'what happened to the papers'],
      on: {
        LIST_NAMES: { to: 'names' },
        ASK_WHY: { to: 'why' },
        ASK_PAPERS: { to: 'papers', learn: [FACT_FLOOD_TOOK_RECORDS] },
        WRITE_TO_EVERYONE: { to: 'scattergun' },
      },
      onUnrecognised: { to: 'open-again' },
    },
    {
      id: 'open-again',
      tempo: Tempo.Think,
      say:
        'Sorry - say that again? I am not at my best today. Ask me anything you like ' +
        'about them, or just tell me to start reading the names out.',
      suggest: ['tell me the names', 'why does it matter now', 'what happened to the papers'],
      on: {
        LIST_NAMES: { to: 'names' },
        ASK_WHY: { to: 'why' },
        ASK_PAPERS: { to: 'papers', learn: [FACT_FLOOD_TOOK_RECORDS] },
        WRITE_TO_EVERYONE: { to: 'scattergun' },
      },
      onUnrecognised: { to: 'open-again' },
    },
    {
      id: 'papers',
      tempo: Tempo.Think,
      say:
        'Gone. The spring the water came up over the road it got into the parish office ' +
        'and everything on the bottom shelf turned to porridge. Births, marriages, all ' +
        'of it. They dried what they could on the railings and most of it came back ' +
        'blank. So there is no list. There is me, and there is a box of photographs.',
      suggest: ['tell me the names', 'why does it matter now'],
      on: {
        LIST_NAMES: { to: 'names' },
        ASK_WHY: { to: 'why' },
        WRITE_TO_EVERYONE: { to: 'scattergun' },
      },
      onUnrecognised: { to: 'papers' },
    },
    {
      id: 'why',
      tempo: Tempo.Think,
      say:
        'Because somebody has to be told. There is a way it is done here - you write to ' +
        'the family before it is in the paper, so they hear it from a person. I have ' +
        'four envelopes written out and I cannot put a name on one of them without ' +
        'being sure. I would rather send none than send one to the wrong door.',
      /**
       * Only one chip, and that is structural rather than stylistic.
       *
       * This beat and `papers` used to offer each other, which meant a player tapping the
       * same chip position every time walked between the two forever and never reached
       * the board - the harness caught it on the first run. A pair of beats that suggest
       * each other is a loop with no exit for anybody who is not reading.
       *
       * The intent is still live: typing "what happened to the papers" here works. It is
       * the *suggestion* that has to point forward.
       */
      suggest: ['tell me the names'],
      on: {
        LIST_NAMES: { to: 'names' },
        ASK_PAPERS: { to: 'papers', learn: [FACT_FLOOD_TOOK_RECORDS] },
        WRITE_TO_EVERYONE: { to: 'scattergun' },
      },
      onUnrecognised: { to: 'why' },
    },
    {
      /**
       * The one unsafe reading, and it is unsafe in a way that has nothing to do with
       * electricity. Telling her to post to everyone means a letter arrives at a house
       * where somebody has been dead for years - §163 wants consequences that generate
       * story, and there is no story in a spark she was never going to touch.
       */
      id: 'scattergun',
      tempo: Tempo.Respond,
      say:
        'To everyone? Half these people are dead. You want me to put a letter through a ' +
        'door and have it sit on the mat until somebody notices. No. I would rather take ' +
        'a week over it and get it right. Ask me about them properly.',
      suggest: ['tell me the names', 'why does it matter now'],
      on: {
        LIST_NAMES: { to: 'names' },
        ASK_WHY: { to: 'why' },
        ASK_PAPERS: { to: 'papers', learn: [FACT_FLOOD_TOOK_RECORDS] },
      },
      onUnrecognised: { to: 'scattergun' },
    },
    {
      /**
       * Every fact, in one pass, in her own words.
       *
       * Deliberately not spread across five beats. The difficulty this mission is after
       * is holding several things at once - splitting them into five exchanges would let
       * the player solve each one the moment they hear it and never do the holding.
       */
      id: 'names',
      tempo: Tempo.Think,
      say:
        'Right. Petra first - Petra was my mother’s sister. She had one boy, ' +
        'Andrei. Then my mother’s mother, that is Sofia, and Sofia was married to ' +
        'Grigore. And Marta, who is my brother’s girl. That is everybody I have an ' +
        'address for. Now put them where they go, because I cannot.',
      suggest: ['go back over it'],
      board: {
        prompt: 'Put each of them where they belong to Ileana.',
        people: [...BOARD_PEOPLE],
        slots: [...BOARD_SLOTS],
        onSolved: { to: 'solved', learn: [FACT_ILEANA_LINE, FACT_MEMORY_IS_NOT_A_RECORD] },
        onWrong: { to: 'names' },
        wrongSay:
          'No - wait. Read it back to me the way I said it, not the way it looks on the ' +
          'board.',
      },
      on: {
        ADMIT_UNCERTAINTY: { to: 'names' },
      },
      onUnrecognised: { to: 'names' },
    },
    {
      id: 'solved',
      tempo: Tempo.Respond,
      say:
        'That is it. That is them. Say it again - aunt, cousin, grandmother, ' +
        'grandfather, niece. I have been going round that for two days and you have laid ' +
        'it out flat.\n\nAnd there are five. I only wrote four envelopes. I have been ' +
        'forgetting Marta for two days because she is a child, and she is going to be ' +
        'the one who remembers all of this longest.',
      outcome: {
        kind: OutcomeKind.Solved,
        say: 'Ileana has five names and five envelopes.',
        trust: 0.3,
        /**
         * §107: the bridge is authored, never inferred. What Ileana's family has in
         * common with a flooded repair shop is not a metaphor - it is the same water,
         * eleven miles up the same coast, and the Circuit only knows that because these
         * two facts are grafted together here on purpose.
         */
        connects: [
          {
            a: FACT_FLOOD_TOOK_RECORDS,
            b: FACT_MEMORY_IS_NOT_A_RECORD,
            label: 'What the water took, and what it could not',
          },
        ],
      },
      on: {},
    },
  ],

  openingBeatId: 'open',
};
