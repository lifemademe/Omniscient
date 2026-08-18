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
import { HOLD_FRAMING, OutcomeKind, Tempo, Urgency } from '../mission/types.js';

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
  objective: 'Work out how Ileana’s family are related, so she can address the letters.',
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

  /**
   * Hints, rewritten after a playtest.
   *
   * The first set had one that talked about Mirela's shop - true, and completely useless
   * here. §106 is explicit that a hint surfaces what is *observable*, and §131 that the
   * environment carries the information the request needs. A hint that tells you about a
   * different request tells you nothing about this one, and the player is left holding a
   * fact with nowhere to put it.
   *
   * These are the things in this room that bear on this problem, and the last of them is
   * the one that matters: while the board is up, the player needs to re-read what she
   * actually said, and scrollback is not a place you can look things up.
   */
  hints: [
    {
      id: 'hint-box',
      summary: 'A shoebox of **photographs**, names pencilled on the backs.',
      detail:
        'The pencil has gone silver on the older ones. Two different hands wrote these, ' +
        'years apart, and neither of them put down how anybody was related. They did not ' +
        'need to. They already knew.',
      keywords: ['photographs', 'names', 'box'],
      cue: 'prop.highlight:photo-box',
      /*
       * The box gives up what is in it.
       *
       * Reported as the room having nothing to act on: the shoebox pulses when this
       * hint is opened and there is no way to tell what to do with it. Everything the
       * player needed came from Ileana, and §131 asks the environment to carry usable
       * evidence rather than atmosphere about the evidence.
       *
       * Names and faces only. No relationship appears on any of these and none ever
       * can: the request IS that nobody wrote the relationships down because they all
       * already knew them, and she is the last one who does. A print saying
       * 'grandmother' would end the mission on the spot.
       *
       * `age` reaches the hair and nothing else - see link/photographs. Sofia and
       * Grigore were old when these were taken, which the player can see and which
       * settles nothing on its own: the board offers grandmother AND aunt, and being
       * old is no help in choosing between them without what Ileana says.
       */
      photographs: [
        { id: 'petra', name: 'Petra', age: 0.3 },
        { id: 'andrei', name: 'Andrei', age: 0.1 },
        { id: 'sofia', name: 'Sofia', age: 0.9 },
        { id: 'grigore', name: 'Grigore', age: 0.8 },
        { id: 'marta', name: 'Marta', age: 0.1 },
      ],
    },
    {
      id: 'hint-tideline',
      summary: 'A dark line runs round the wall, about a hand off the floor.',
      detail:
        'The **water** has been in this house. It is the same mark you find on any wall ' +
        'down here, and it is the reason there is no **paper** left to check her against ' +
        '- what was on the bottom shelf of the parish office went the same way.',
      keywords: ['water', 'paper', 'flood'],
    },
    {
      id: 'hint-letters',
      summary: 'Four **letters**, stamped, with nowhere to send them.',
      detail:
        'She has written the same thing out four times and stopped at the line where the ' +
        'name goes. Four envelopes for a family she has not finished counting.',
      keywords: ['letters', 'write', 'family'],
      revealedBy: 'why',
    },
    {
      /**
       * The working note. Everything she said about each name, in one place.
       *
       * This exists because of what the board asks for. Holding five statements at once is
       * the puzzle, but hunting for them in the scrollback is not - that is a chore
       * wearing the puzzle's coat, and it is what makes a good problem feel unfair.
       */
      id: 'hint-said',
      summary: 'What Ileana has said about each **name**.',
      detail:
        'Petra - her mother’s sister.\n' +
        'Andrei - Petra’s boy.\n' +
        'Sofia - her mother’s mother.\n' +
        'Grigore - Sofia was married to him.\n' +
        'Marta - her brother’s girl.',
      keywords: ['name', 'names'],
      revealedBy: 'names',
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
      /**
       * She talks. She does not compose.
       *
       * The first pass at this had her saying things like "it comes apart in my hands",
       * which is a line from a novel and not a thing a tired woman says on a bad phone
       * line. Grief in plain words is flatter and shorter than grief in good ones, and
       * every mission in this game is under the same rule: short words, no images.
       */
      say:
        'My grandmother died on Tuesday. I am at her house and I have to write to the ' +
        'family before it goes in the paper. I have the envelopes ready. But I keep ' +
        'getting the names wrong, because I have never had to sit down and say out loud ' +
        'how we are all joined up. I know these people. I just cannot get them in order.',
      learn: [FACT_NAMES_ON_PHOTOGRAPHS],
      suggest: ['tell me the names', 'why does it matter now', 'what happened to the papers'],
      /*
       * She nods rather than points, and she is the only one who does.
       *
       * Everybody else shows the player the thing on the way out of their opening -
       * Mirela has a radio on a bench and can turn to it. Ileana is behind a table with
       * both hands flat on the near edge, framed from across it, and the point clip turns
       * her: it carries spine rotation, so she swings out of the one composition the shot
       * is built on. Reported as the papers question rotating her a little.
       *
       * It got worse the moment gestures started playing at full strength - it was there
       * all along at half, averaged into the breathing loop and too weak to notice.
       *
       * A nod is the right gesture for her anyway. She is not showing anybody anything;
       * she is a tired woman at a table answering a question. And a nod is a head, so it
       * leaves her hands where the scene put them - see riggedContact.
       */
      on: {
        LIST_NAMES: { to: 'names', environment: 'prop.nod:contact' },
        ASK_WHY: { to: 'why', environment: 'prop.nod:contact' },
        ASK_PAPERS: { to: 'papers', environment: 'prop.nod:contact', learn: [FACT_FLOOD_TOOK_RECORDS] },
        WRITE_TO_EVERYONE: { to: 'scattergun', environment: 'prop.nod:contact' },
      },
      onUnrecognised: { to: 'open-again' },
    },
    {
      id: 'open-again',
      framing: HOLD_FRAMING,
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
        'Gone. The water came up over the road one spring and got into the parish office. ' +
        'Everything on the bottom shelf was ruined - births, marriages, all of it. So ' +
        'there is no list anywhere to check me against. There is me, and there is a box ' +
        'of photographs with names on the back.',
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
        'Because they have to be told properly. Here you write to the family first, so ' +
        'they hear it from a person and not off the front page. I have four envelopes ' +
        'ready. I am not putting a name on one until I am sure. A letter like that at ' +
        'the wrong door is a horrible thing to do to somebody.',
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
      gesture: 'prop.reacting:contact',
      tempo: Tempo.Respond,
      say:
        'To everyone? Half these people are dead. You want me to put a letter through a ' +
        'door and leave it lying on the mat. No. I will take a week over it and get it ' +
        'right. Ask me about them properly.',
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
      framing: 'camera.push-in:photo-box',
      tempo: Tempo.Think,
      say:
        'Right. Petra first. Petra was my mother’s sister. She had one boy, Andrei. ' +
        'Then my mother’s mother, that is Sofia, and Sofia was married to Grigore. And ' +
        'Marta, who is my brother’s girl. That is everybody I have an address for.\n\n' +
        'Now put them where they go, because I cannot. If you lose track, ask me again ' +
        'and I will read them back.',
      suggest: ['go back over it'],
      device: {
        kind: 'relations',
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
      gesture: 'prop.nod:contact',
      tempo: Tempo.Respond,
      say:
        'That is it. That is them. Aunt, cousin, grandmother, grandfather, niece. Two ' +
        'days I have been going round and round that.\n\nAnd there are five. I only ' +
        'wrote four envelopes. I kept leaving Marta out because she is a child - and she ' +
        'will be the one who remembers all this the longest.',
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
