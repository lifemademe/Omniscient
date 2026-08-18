/**
 * MISSION 06 - Dorin Apostol, who has done this before and is not doing it now.
 *
 * The brief said "the contact is a thief and asks the player for help". The thing that
 * makes that work in THIS game is the stakes, not the crime. Every other request is
 * somebody in trouble who needs the one thing OMNISCIENT_ can do; a burglary would be the
 * first time the machine's help made a stranger's night worse, and the game has no story
 * to tell about that yet.
 *
 * So Dorin is a thief, and what he is opening is his own mother's front door. He has the
 * skill because of what he used to do, he has not used it in eleven years, and the reason
 * he cannot simply call a locksmith at two in the morning is the reason the whole scene
 * has any weight: she is on the other side of it and has not answered since yesterday.
 * He is exactly the right person to be standing there and it is the last place he wants
 * his hands to be.
 *
 * ## Deduction, not dexterity
 *
 * Every lockpicking minigame is a twitch test. This one cannot be: OMNISCIENT_ has no
 * hands, and the premise of the entire game is that somebody else has them. Dorin works
 * the pins and says what he feels; the player works out the ORDER they bind in. That is a
 * real property of a real lock - pins bind by tolerance, not left to right - and it is
 * precisely the half a machine can do and a man with a pick and a torch cannot.
 *
 * §154: Timed. This is the first request in the game with a genuine clock on it, and it
 * has earned one.
 */

import { KnowledgeDomain } from '../knowledge/KnowledgeStore.js';
import { TERMS } from '../mission/intent.js';
import { HOLD_FRAMING, OutcomeKind, Tempo, Urgency } from '../mission/types.js';

import { FACT_MEMORY_IS_NOT_A_RECORD } from './mission-04-relations.js';

import type { LockSpec } from '../mission/lock.js';
import type { MissionDefinition } from '../mission/types.js';

export const FACT_PINS_BIND_BY_TOLERANCE = 'pins-bind-by-tolerance';
export const FACT_DORIN_HANDS = 'dorin-remembers-the-work';
export const FACT_OLD_LOCK_WORN = 'the-lock-is-older-than-the-door';

/**
 * Five pins, binding in an order the player has to find.
 *
 * Not left to right and not a pattern - 3, 1, 5, 2, 4 - because the whole deduction is
 * that a lock's binding order comes from manufacturing tolerance and wear, which have no
 * relationship to position. A player who assumes the obvious learns that on the first
 * attempt, which is the lesson arriving in the right order.
 *
 * Every `early` line is different. Identical feedback across five pins would make this a
 * five-way guess; distinct feedback makes it a deduction, because "that one is already
 * carrying weight" and "that one is loose, it is not even touching" say opposite things
 * about where in the order a pin sits.
 */
const HER_DOOR: LockSpec = {
  pins: [
    {
      id: 'p1',
      order: 2,
      early: 'First one is tight. Something ahead of it is holding.',
      sets: 'First one goes. I felt it click up.',
    },
    {
      id: 'p2',
      order: 4,
      early: 'Second is stuck solid. Not yet.',
      sets: 'Second is up.',
    },
    {
      id: 'p3',
      order: 1,
      early: 'Third is loose - it is not even touching. It is not this one binding.',
      sets: 'Third. That is the one carrying it all. It has set.',
    },
    {
      id: 'p4',
      order: 5,
      early: 'Fourth will not move at all.',
      sets: 'Fourth is up. That is the last of them.',
    },
    {
      id: 'p5',
      order: 3,
      early: 'Fifth is loose in there. Nothing to push against.',
      sets: 'Fifth is up.',
    },
  ],
};

export const MISSION_06: MissionDefinition = {
  id: 'm06-lock',
  version: 1,
  contactId: 'dorin',
  sceneId: 'scene-night-door',
  archetype: 'diagnosis',
  objective: 'Get Dorin through his mother’s door without breaking it.',
  urgency: Urgency.Timed,

  hiddenTruth: {
    summary:
      'The pins bind in the order 3, 1, 5, 2, 4 - by tolerance and wear, not by position. ' +
      'Dorin can feel each one but cannot hold the sequence while working; naming the ' +
      'order is the whole of what he needs.',
    requiredIntents: ['WORK_THE_LOCK'],
    unsafeIntents: ['BREAK_GLASS'],
  },

  knowledge: [
    {
      id: FACT_PINS_BIND_BY_TOLERANCE,
      label: 'Pins bind in the order their tolerances put them, never left to right',
      domain: KnowledgeDomain.Mechanical,
    },
    {
      id: FACT_OLD_LOCK_WORN,
      label: 'A lock older than the door it is in wears its pins unevenly',
      domain: KnowledgeDomain.Mechanical,
    },
    {
      id: FACT_DORIN_HANDS,
      label: 'Dorin Apostol still has the hands for work he gave up eleven years ago',
      domain: KnowledgeDomain.People,
    },
  ],

  hints: [
    {
      id: 'hint-lock',
      summary: 'The **lock** is older than the door it is fitted to.',
      detail:
        'Brass gone dark, and a keyway with forty years of wear in it. Every pin in a lock ' +
        'that age has worn a slightly different amount, which is what decides the order ' +
        'they bind in - and it is never the order they are sitting in.',
      keywords: ['lock', 'pins', 'order'],
      cue: 'prop.highlight:lock',
    },
    {
      id: 'hint-window',
      summary: 'A lit **window** upstairs, curtains open.',
      detail:
        'The landing light. It has been on since he got here, which he says means nothing ' +
        'because she leaves it on, and he keeps looking up at it anyway.',
      keywords: ['window', 'light'],
    },
    {
      id: 'hint-hands',
      summary: 'He is holding the pick like somebody who has **done** this.',
      detail:
        'No fumbling, no light needed on the keyway. Whatever he did before he stopped ' +
        'doing it, his hands have not forgotten any of it, and he is not enjoying that.',
      keywords: ['done', 'hands'],
      revealedBy: 'why',
    },
  ],

  confirmations: {
    BREAK_GLASS: 'Do you mean Dorin should put the glass in?',
  },

  intents: [
    {
      id: 'ASK_WHY',
      requires: [
        ['why', 'what', 'who', 'whose'],
        ['door', 'house', 'here', 'happened', 'yours', 'hers', 'wrong', 'matter'],
      ],
      priority: 3,
    },
    {
      id: 'ASK_LOCK',
      requires: [
        [...TERMS.inspect, ...TERMS.describe],
        ['lock', 'pins', 'pin', 'keyway', 'barrel', 'cylinder'],
      ],
      priority: 3,
    },
    {
      /** Raises the lock. */
      id: 'WORK_THE_LOCK',
      requires: [
        ['work', 'pick', 'try', 'set', 'start', 'open', 'go', 'lift'],
        ['lock', 'pins', 'pin', 'it', 'them', 'door'],
      ],
      priority: 4,
    },
    {
      /**
       * Unsafe, and it is the obvious thing. A pane of glass is quicker than five pins and
       * it is a door his mother has to live behind afterwards.
       */
      id: 'BREAK_GLASS',
      requires: [
        ['break', 'smash', 'put', 'kick', 'force'],
        ['glass', 'window', 'pane', 'door', 'in'],
      ],
      priority: 3,
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
      tempo: Tempo.Respond,
      say:
        'I need you to be quick with me. I am outside my mother’s door and she has not ' +
        'picked up since yesterday teatime, and she always picks up. I have not got a key. ' +
        'I have got - other things. I can do this, I just cannot do it and think at the ' +
        'same time, not tonight.',
      suggest: ['whose door is this', 'look at the lock'],
      on: {
        ASK_WHY: { to: 'why', environment: 'prop.point:contact' },
        ASK_LOCK: { to: 'the-lock', environment: 'prop.point:contact', learn: [FACT_OLD_LOCK_WORN] },
        /*
         * Through the description, not past it.
         *
         * The chip is gated to the beat after he has described the lock, but a player can
         * still TYPE "pick it" from the doorstep - and dropping them onto a five-pin board
         * before they have been told the pins bind by wear is dropping them onto a puzzle
         * with nothing to reason from. So the request is honoured and routed through the
         * one thing they need first. He does not refuse; he looks at the lock and tells
         * them what he sees, which is what anybody would do before starting.
         */
        WORK_THE_LOCK: { to: 'the-lock', environment: 'prop.point:contact' },
        BREAK_GLASS: { to: 'glass', environment: 'prop.point:contact' },
      },
      onUnrecognised: { to: 'open-again' },
    },
    {
      id: 'open-again',
      framing: HOLD_FRAMING,
      tempo: Tempo.Respond,
      say:
        'Sorry - say it again. Ask me about the door, or about the lock, or just tell me ' +
        'to start.',
      suggest: ['whose door is this', 'look at the lock'],
      on: {
        ASK_WHY: { to: 'why' },
        ASK_LOCK: { to: 'the-lock', learn: [FACT_OLD_LOCK_WORN] },
        WORK_THE_LOCK: { to: 'the-lock' },
        BREAK_GLASS: { to: 'glass' },
      },
      onUnrecognised: { to: 'open-again' },
    },
    {
      id: 'why',
      tempo: Tempo.Respond,
      learn: [FACT_DORIN_HANDS],
      say:
        'It is my mother’s. I grew up behind it.\n\nAnd yes - I know what it looks like, ' +
        'me standing here with these in my hand. I did eleven months a long time ago and I ' +
        'have not touched a lock since. This is the one door in the world I would have ' +
        'sworn I would never open this way.',
      suggest: ['look at the lock'],
      on: {
        ASK_LOCK: { to: 'the-lock', learn: [FACT_OLD_LOCK_WORN] },
        WORK_THE_LOCK: { to: 'the-lock' },
        BREAK_GLASS: { to: 'glass' },
      },
      onUnrecognised: { to: 'why' },
    },
    {
      id: 'the-lock',
      framing: 'camera.push-in:lock',
      tempo: Tempo.Respond,
      learn: [FACT_PINS_BIND_BY_TOLERANCE],
      say:
        'It is older than the door. Brass gone black, keyway worn soft. Five pins.\n\n' +
        'They will not bind in a row - they never do. Every one of them has worn a ' +
        'different amount over forty years and that is what decides which one is taking the ' +
        'weight. I can feel which is which. I just cannot keep the order in my head and ' +
        'keep my hand still.',
      /*
       * Two changes, both reported.
       *
       * It read "start on the pins", which is what somebody who already knows the puzzle
       * would call it and means nothing to anybody else - it does not say who starts, on
       * what, or what the player will then be doing. This says the arrangement out loud:
       * he picks, and the ordering is the thing being asked of the machine.
       *
       * And it is only offered HERE now. It used to sit on the opening beat, so a player
       * could commit to picking a lock before Dorin had described it, which skips the one
       * observation the puzzle depends on - that the pins bind by wear and not in a row -
       * and drops them onto a five-pin board with nothing to reason from.
       *
       * The first rewrite dropped the word "pins" and the stuck-checker caught it in one
       * run: WORK_THE_LOCK wants a verb AND a thing, and "start picking, I will call the
       * order" has the verb and names nothing. Every chip in this game is a sentence the
       * parser has to accept, so rewording one for clarity is a change to two files.
       */
      suggest: ['start on the pins - I will call the order'],
      on: {
        WORK_THE_LOCK: { to: 'working' },
        ASK_WHY: { to: 'why' },
        BREAK_GLASS: { to: 'glass' },
      },
      onUnrecognised: { to: 'the-lock' },
    },
    {
      /**
       * The device beat.
       *
       * He has the pick in the lock and one hand on the tension wrench. The player has the
       * only thing he is short of, which is the ability to hold a sequence while somebody
       * else's hands are shaking.
       */
      id: 'working',
      framing: 'camera.push-in:lock',
      tempo: Tempo.Act,
      /**
       * The method, said out loud, because it is not guessable.
       *
       * Reported as "I do not understand what I am supposed to do to find the clues", and
       * the player was right to be lost: there are none to find. The order the pins bind in
       * is not written anywhere in the scene and cannot be - it is forty years of uneven
       * wear inside a cylinder, which is exactly why HE cannot see it either. The only
       * source of information in this puzzle is what his fingers report, and the only way
       * to get a report is to name an order and let him work down it.
       *
       * That is a sound puzzle and it was an invisible one, because the beat previously
       * said "if I get one wrong the set drops and we start again, so think first" - which
       * tells the player that attempting is a FAILURE STATE. So the correct move looked
       * like the punished one, and a player doing what they were told - thinking first -
       * had nothing whatsoever to think with.
       *
       * Nothing about the mechanic changed. He now says what he is going to do: go down
       * the order, call out each pin as it lifts, and stop at the one that will not. The
       * dropped set costs nothing but the time, and he says so, because a player who
       * believes a retry is expensive will not make one.
       */
      say:
        'Wrench is in. I am on the pins.\n\nCall them one at a time. If you name the one ' +
        'that is binding it will lift, and you will see the cylinder give - watch the plug, ' +
        'not me. If you name any of the others the whole set drops and we are back to ' +
        'nothing.\n\nThat is the only way either of us finds out which is which. It costs ' +
        'nothing but my knees.',
      // Same dead chip as the cellar's: ASK_LOCK needs an inspect or describe word, and
      // "go back over" carries none of them.
      suggest: ['tell me about the lock again'],
      device: {
        kind: 'lock',
        prompt: 'Name the order the pins bind in.',
        lock: HER_DOOR,
        onSolved: { to: 'solved', environment: 'prop.open:door' },
        onWrong: { to: 'working' },
        /*
         * Points at the report rather than just announcing the failure.
         *
         * `workLock` returns what he felt on the way down and the board prints it - that
         * string is the entire yield of an attempt, and it was arriving with a line over it
         * that read as pure loss. Naming it is what turns a dropped set into a move.
         */
        wrongSay:
          'That is not the one. The whole set has dropped - start me again from the first.',
      },
      on: {
        ASK_LOCK: { to: 'the-lock', learn: [FACT_PINS_BIND_BY_TOLERANCE] },
        BREAK_GLASS: { to: 'glass' },
      },
      onUnrecognised: { to: 'working' },
    },
    {
      id: 'glass',
      gesture: 'prop.reacting:contact',
      tempo: Tempo.Act,
      say:
        'The glass. Right.\n\n...I have done it. I am in, and there is glass all through her ' +
        'hall, and she is upstairs and she is all right, she had fallen and she could not ' +
        'get to the phone.\n\nShe is all right. And now she has got to live behind a door ' +
        'with a board in it and know how her son got through it.',
      failure: {
        summary:
          'You told Dorin to break the glass. He got to her, and she is unhurt - but he ' +
          'went into his mother’s house the way he used to go into other people’s, and ' +
          'they will both be looking at that boarded panel for a long time.',
        lesson:
          'He could feel every pin in that lock. The only thing he could not do was hold ' +
          'the order, and that was the thing you were there for.',
        cooldownSeconds: 150,
      },
      on: {},
    },
    {
      id: 'solved',
      gesture: 'prop.nod:contact',
      tempo: Tempo.Respond,
      say:
        'That is it - that is the whole thing turning. I am in.\n\n...She is on the landing. ' +
        'She is talking to me. She has been down since yesterday and could not reach the ' +
        'phone and she is telling me off for the noise.\n\nI have not used that for eleven ' +
        'years and I have never once been glad of it. Thank you.',
      outcome: {
        kind: OutcomeKind.Solved,
        say: 'Door open, undamaged. She is on her way to hospital talking.',
        trust: 0.35,
        /**
         * §107. Dorin's hands know the work perfectly and cannot hold the order; Ileana
         * knows every relative and cannot hold the shape. Two people with the whole of
         * something in them and no way to see all of it at once - which is the sentence
         * this entire game is about.
         */
        connects: [
          {
            a: FACT_DORIN_HANDS,
            b: FACT_MEMORY_IS_NOT_A_RECORD,
            label: 'Knowing every part of a thing, and not the shape of it',
          },
        ],
      },
      on: {},
    },
  ],

  openingBeatId: 'open',
};
