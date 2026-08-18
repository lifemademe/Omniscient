/**
 * MISSION 02 - "It only goes at night"
 *
 * THE CALLBACK (§214). Tomas's harbour beacon started cutting out today. The cause is
 * that OMNISCIENT_ repaired his sister's transmitter this morning: her shop and his light
 * are on one supply, and a transmitter pulls hard the moment it is keyed - so every time
 * she sends, his light drops out.
 *
 * The player caused this. Nobody tells them. They work it out from a fact Mirela
 * mentioned in passing while they were busy looking at a corroded connector.
 *
 * §163: knowing the fact does not skip the mission, it changes the route through it.
 * §214 forbids a dead end, so a player who never registered the shared supply reaches
 * the same truth the slow way - by having Tomas follow the wire.
 *
 * Urgency: Timed (§154). A harbour beacon that fails at night is a believable emergency,
 * and the timer starts only once the player can act fairly.
 */

import { KnowledgeDomain } from '../knowledge/KnowledgeStore.js';
import { TERMS } from '../mission/intent.js';
import { HOLD_FRAMING, OutcomeKind, Tempo, Urgency } from '../mission/types.js';

import { TOMAS } from './contacts.js';
import { FACT_SHARED_POWER_FEED } from './mission-01-transmitter.js';

import type { MissionDefinition } from '../mission/types.js';

export const FACT_BEACON_DROPS_ON_KEYUP = 'beacon_drops_on_keyup';
export const FACT_FEED_NEEDS_ISOLATOR = 'feed_needs_isolator';

/**
 * What Tomas has on him, and only what he has on him.
 *
 * He is halfway up a mast in the dark. There is no shop, no van, no going back down and
 * up again - the parts in this bag are the only parts in the world for the length of this
 * request. That constraint is what makes the device honest rather than a shopping list.
 *
 * Every wrong item is a real thing a rigger carries and is wrong for a reason worth
 * learning. None of them is filler and none is absurd, because an obviously silly option
 * is not a distractor, it is a hint - the player eliminates it without thinking and the
 * puzzle gets easier by exactly one.
 *
 * NOTHING IS CUT. That is worth saying at the top, because the word "separate" was read
 * as a broken wire needing something conductive to bridge it, by the first person to
 * play this. There is no break anywhere in the request: one supply feeds two households,
 * and the fault is that they share it. Her set pulls hard the moment it is keyed and his
 * light goes out.
 *
 * So the question is never "what fixes a light" but "what gives the light a supply of its
 * own", and every wrong answer here does something else that sounds like fixing:
 * insulate, join, protect, tidy, extend. Joining is the one that is most obviously wrong
 * and hardest to see as wrong, which is why the terminal block is in the bag.
 */
const TOMAS_BAG = [
  {
    id: 'tape',
    name: 'Insulating tape',
    note: 'Half a roll. Always have it.',
    wrong:
      'Tape? That covers a bare wire up. It does not change what is joined to what - ' +
      'and the join down there is meant to be a join, it is just feeding two things.',
  },
  {
    id: 'block',
    name: 'Terminal block',
    note: 'Four ways. For joining a wire to a wire.',
    wrong:
      'That is for putting two wires together. They are already together - that is the ' +
      'whole trouble. It would hold the same fault tighter, that is all.',
  },
  {
    id: 'fuse',
    name: 'Cartridge fuse',
    note: 'A couple of spares in the tin. Fifteen amp.',
    wrong:
      'A fuse waits for something to go badly wrong and then cuts everything. Nothing ' +
      'here is going badly wrong - the light just keeps standing aside for her.',
  },
  {
    id: 'isolator',
    name: 'Isolator switch',
    note: 'Off the last job. Two ways in, two out, a handle on the front.',
  },
  {
    id: 'flex',
    name: 'Three core flex',
    note: 'A few metres of it, coiled on my belt.',
    wrong:
      'More cable on the same supply is more of what I have got. It has to come off ' +
      'that line somewhere or it is the same line.',
  },
  {
    id: 'ties',
    name: 'Cable ties',
    note: 'A handful. They hold everything up here together.',
    wrong: 'They will tidy it. They will not change a thing about where the power goes.',
  },
] as const;

export const MISSION_02: MissionDefinition = {
  id: 'm02-beacon',
  version: 1,
  contactId: TOMAS.id,
  sceneId: 'scene-beacon-mast',
  archetype: 'diagnosis',
  objective: 'Find out why the harbour light keeps going out, and make it hold.',
  urgency: Urgency.Timed,

  hiddenTruth: {
    summary:
      'The light and Mirela’s shop are on one supply. Since her set was repaired this ' +
      'morning, sending pulls enough current to drop the light. The two need separating.',
    requiredIntents: ['ASK_FEED', 'FIT_ISOLATOR'],
    unsafeIntents: ['CUT_FEED_LIVE'],
  },

  knowledge: [
    {
      id: FACT_BEACON_DROPS_ON_KEYUP,
      label: 'The harbour light drops whenever Mirela’s set transmits',
      domain: KnowledgeDomain.Signal,
    },
    {
      id: FACT_FEED_NEEDS_ISOLATOR,
      label: 'One supply cannot carry the light and a transmitter without separating them',
      domain: KnowledgeDomain.Signal,
    },
  ],

  // The gate. Nothing else in the game reads this fact - it exists only to pay off here.
  requires: {
    factId: FACT_SHARED_POWER_FEED,
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
      summary: 'The supply is joined to something else',
      detail:
        'The wire does not go straight to the light. There is a join on the bracket, and a '
        + 'second wire comes off it and runs down the hill towards the town. Whatever is on '
        + 'the end of that is drawing off the same supply.',
      keywords: ['wire', 'join'],
      cue: 'prop.highlight:splice-box',
      revealedBy: 'feed-confirmed',
    },
  ],

  confirmations: {
    ASK_FEED: 'Do you mean Tomas should follow the supply wire?',
    ASK_TIMING: 'Do you mean Tomas should say when it started?',
    ASK_SISTER: 'Do you mean Tomas should tell you about Mirela?',
    FIT_ISOLATOR: 'Do you mean Tomas should give the light its own supply?',
    CUT_FEED_LIVE: 'Do you mean Tomas should pull the cable apart while there is current in it?',
    ADMIT_UNCERTAINTY: 'Do you want to tell him you are not sure yet?',
  },

  intents: [
    {
      id: 'ASK_FEED',
      requires: [
        [...TERMS.inspect, ...TERMS.describe, 'trace', 'follow'],
        ['supply', 'wire', 'line', 'cable', 'lead', 'split', 'splitter', 'mast', 'join', 'joined', 'splice'],
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
      requires: [[...TERMS.remove, 'cut', 'yank'], ['feed', 'cable', 'supply', 'wire', 'lead']],
      excludes: ['isolator', 'splitter', 'filter'],
      priority: 1,
    },
    {
      /**
       * Asking what he has got, which is the route into the bag.
       *
       * Kept separate from FIT_ISOLATOR, but both now land in the same place. Asking
       * what he has opens the bag; saying "put something in to separate them" also
       * opens the bag, with Tomas agreeing on the way in. Two ways to arrive at the
       * choice, and no way past it - §163 is about never dead-ending, not about
       * letting the one interesting decision be skipped.
       */
      id: 'ASK_KIT',
      requires: [
        [...TERMS.inspect, ...TERMS.describe, 'got', 'have', 'carrying', 'bag', 'kit'],
        ['bag', 'kit', 'tools', 'got', 'have', 'carrying', 'parts', 'spares', 'anything'],
      ],
      priority: 3,
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
      suggest: ['follow the supply wire', 'when did it start', 'tell me about Mirela'],
      on: {
        ASK_FEED: { to: 'feed-traced-slow', environment: 'camera.pan:mast-cable,prop.point:contact' },
        ASK_TIMING: { to: 'timing', environment: 'prop.point:contact' },
        ASK_SISTER: { to: 'sister-blind', environment: 'prop.point:contact' },
        ADMIT_UNCERTAINTY: { to: 'timing', environment: 'prop.point:contact' },
      },
      onUnrecognised: { to: 'clarify-blind' },
      onAmbiguous: { to: 'clarify-blind' },
    },

    {
      id: 'clarify-blind',
      framing: HOLD_FRAMING,
      tempo: Tempo.Respond,
      say: 'Say again - the wind is taking it. I am holding on with one hand up here.',
      suggest: ['follow the supply wire', 'when did it start', 'tell me about Mirela'],
      on: {
        ASK_FEED: { to: 'feed-traced-slow', environment: 'camera.pan:mast-cable' },
        ASK_TIMING: { to: 'timing' },
        ASK_SISTER: { to: 'sister-blind' },
      },
      onUnrecognised: { to: 'clarify-blind' },
    },

    {
      id: 'timing',
      framing: 'camera.push-in:beacon',
      tempo: Tempo.Think,
      say:
        'Started this morning. It is worse in the evening - but that is when the boats are in, so ' +
        'perhaps I only notice. It is not the weather, it was clear all day.',
      suggest: ['follow the supply wire', 'tell me about Mirela'],
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
        'Mirela? She is down the coast at Portu Vech. Her set died yesterday and something fixed it for her this ' +
        'morning, she would not stop going on about it. Why - what has that to do with my mast?',
      suggest: ['follow the supply wire'],
      on: {
        ASK_FEED: { to: 'feed-traced-slow', environment: 'camera.pan:mast-cable' },
      },
      onUnrecognised: { to: 'clarify-blind' },
    },

    {
      /** The slow route to the same truth. §163: never a dead end. */
      id: 'feed-traced-slow',
      framing: 'camera.pan:mast-cable',
      tempo: Tempo.Think,
      say:
        'Following the wire down... it does not go straight to the light. There is a join on ' +
        'the bracket, and a second wire off it heading down the hill. Towards the town. So the ' +
        'light and whatever is down there are pulling off the one supply. Towards - oh. That ' +
        'goes to Mirela’s shop, does it not.',
      suggest: ['what have you got in your bag', 'put something in to separate them'],
      on: {
        ASK_KIT: { to: 'the-bag' },
        /*
         * Into the bag, not past it.
         *
         * This used to finish the request on its own, which meant the one sentence a
         * player is most likely to type - it is offered as a chip - skipped the device
         * entirely. Reported, and rightly: a mission whose gameplay is optional does
         * not have gameplay.
         *
         * Saying it is still worth something and still lands as a diagnosis. Tomas
         * agrees, opens the bag and asks which one, and the player who worked it out
         * in words finds the item they already have in mind waiting for them. The
         * sentence is the reasoning; the pick is the act. He is the one with hands.
         */
        FIT_ISOLATOR: { to: 'the-bag', learn: [FACT_BEACON_DROPS_ON_KEYUP] },
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
      suggest: ['follow the supply wire', 'tell me about Mirela', 'when did it start'],
      on: {
        ASK_FEED: {
          to: 'feed-confirmed',
          learn: [FACT_BEACON_DROPS_ON_KEYUP],
          environment: 'prop.open:splice-box,prop.point:contact',
        },
        /*
         * He is asked about his sister, so the shot stays on him.
         *
         * This landed on `feed-confirmed`, whose framing is the join on the bracket -
         * correct for the beat and wrong for this route into it. Asking a man about
         * his sister and being shown a junction box is the camera answering a
         * different question, and it was reported as exactly that.
         *
         * The box still opens. That is the world responding to what he has just
         * worked out, and it is waiting for the player the moment they look. What
         * changes is that the callback lands on his face rather than on a cable.
         */
        ASK_SISTER: {
          to: 'feed-confirmed',
          learn: [FACT_BEACON_DROPS_ON_KEYUP],
          environment: 'camera.pan:default,prop.open:splice-box,prop.point:contact',
        },
        ASK_TIMING: { to: 'timing-known', environment: 'prop.point:contact' },
        ADMIT_UNCERTAINTY: { to: 'timing-known', environment: 'prop.point:contact' },
      },
      onUnrecognised: { to: 'clarify-blind' },
      onAmbiguous: { to: 'clarify-blind' },
    },

    {
      id: 'timing-known',
      framing: 'camera.push-in:beacon',
      tempo: Tempo.Think,
      say:
        'Started this morning, first time ever. Clear weather all day, so it is not the sky. ' +
        'You sound like you already have an idea.',
      suggest: ['follow the supply wire', 'tell me about Mirela'],
      on: {
        ASK_FEED: {
          to: 'feed-confirmed',
          learn: [FACT_BEACON_DROPS_ON_KEYUP],
          environment: 'prop.open:splice-box',
        },
        /*
         * He is asked about his sister, so the shot stays on him.
         *
         * This landed on `feed-confirmed`, whose framing is the join on the bracket -
         * correct for the beat and wrong for this route into it. Asking a man about
         * his sister and being shown a junction box is the camera answering a
         * different question, and it was reported as exactly that.
         *
         * The box still opens. That is the world responding to what he has just
         * worked out, and it is waiting for the player the moment they look. What
         * changes is that the callback lands on his face rather than on a cable.
         */
        ASK_SISTER: {
          to: 'feed-confirmed',
          learn: [FACT_BEACON_DROPS_ON_KEYUP],
          environment: 'camera.pan:default,prop.open:splice-box',
        },
      },
      onUnrecognised: { to: 'clarify-blind' },
    },

    {
      id: 'feed-confirmed',
      framing: 'camera.pan:mast-cable',
      tempo: Tempo.Respond,
      say:
        'The join on the bracket - yes, it is here. Second wire off it, down the hill. That is ' +
        'Mirela’s. One supply, the both of us. And a set like hers pulls hard the moment she ' +
        'keys it - hard enough to take my light with it. It has been that way for years and it ' +
        'never mattered, because her set has been dead for... ' +
        'Her set has been dead for a long time. Until this morning.',
      suggest: ['what have you got in your bag', 'put something in to separate them'],
      on: {
        ASK_KIT: { to: 'the-bag' },
        FIT_ISOLATOR: { to: 'the-bag' },
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
      gesture: 'prop.reacting:contact',
      tempo: Tempo.Respond,
      say:
        'It flashed - the whole bracket lit up and I have let go of it. ' +
        'There was current in that. You asked me and I said yes, and there was current in it. ' +
        'I am coming down. The harbour master can put a lamp on the wall tonight.',
      on: {},
      failure: {
        summary:
          'You told Tomas to pull a shared supply apart while there was still current in it. '
          + 'It flashed in his hands. He came down off the mast, and the harbour light is '
          + 'still going out.',
        lesson:
          'Two things sharing one supply have to be separated properly, not pulled apart '
          + 'while there is current in them.',
        cooldownSeconds: 90,
      },
    },

    {
      /**
       * The bag, open.
       *
       * The one device in the game that asks the player to KNOW something rather than to
       * arrange something, which is why it belongs to this request in particular. Tomas
       * can describe every item in his bag and cannot say which one will stop his light
       * going out; OMNISCIENT_ has never held any of them and knows exactly what they do.
       * That is the division of labour the whole game is built on, finally as a verb.
       */
      id: 'the-bag',
      framing: 'camera.pan:mast-cable',
      tempo: Tempo.Act,
      say:
        'Right - hold on.\n\n' +
        'That is everything I have got on me. I am not going down and ' +
        'up again tonight, so if it is not in here it does not exist. Tell me which one and ' +
        'I will put it in.',
      suggest: ['go back over the join'],
      device: {
        kind: 'kit',
        /*
         * The prompt states the PROBLEM, not just the action.
         *
         * It read "Pick what will separate the two feeds", which is accurate and was
         * still misread - as a cut wire needing something conductive to bridge it.
         * That is a fair reading of the word separate in isolation, and nothing is cut
         * anywhere in this request: one supply feeds two households and the fix is to
         * stop them sharing it.
         *
         * A prompt that names the fault cannot be read backwards. This one says there
         * is one supply and two things on it before it asks for anything.
         */
        prompt: 'One supply, feeding her shop and the light. Pick what gives the light its own.',
        items: [...TOMAS_BAG],
        answer: 'isolator',
        onSolved: {
          to: 'isolator-fitted',
          learn: [FACT_FEED_NEEDS_ISOLATOR],
          // The beacon holds. It follows the isolator going in, so it belongs here
          // rather than on the sentence that proposes one.
          environment: 'prop.steady:beacon',
        },
        // Back to the bag. A wrong pick costs the item's own explanation and nothing else.
        onWrong: { to: 'the-bag' },
        wrongSay: 'No - hold on.',
      },
      on: {
        ASK_FEED: { to: 'the-bag' },
      },
      onUnrecognised: { to: 'the-bag' },
    },
    {
      id: 'isolator-fitted',
      gesture: 'prop.nod:contact',
      framing: 'camera.push-in:beacon',
      tempo: Tempo.Respond,
      say:
        'Box is in, the light is on its own feed now. Steady... still steady... she must be ' +
        'sending by now and it has not moved once. That is it. ' +
        'I will go and tell her she owes me a mast.',
      on: {},
      outcome: {
        kind: OutcomeKind.Solved,
        say: 'The harbour light is steady. One supply, two households, no longer fighting.',
        trust: 2,
        connects: [
          {
            a: FACT_SHARED_POWER_FEED,
            b: FACT_BEACON_DROPS_ON_KEYUP,
            label: 'one supply, two households',
          },
        ],
      },
    },
  ],
};
