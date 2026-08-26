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
import { HOLD_FRAMING, OutcomeKind, Tempo, Urgency } from '../mission/types.js';

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
  objective: 'Find out what is killing one side of Adaeze’s seedlings.',
  // Said once, on the first re-contact after a lost attempt. See reopeningSay in types.
  reopeningSay: 'We lost two more trays after last time. The rest are holding on, just.',
  /**
   * Two jobs, and the counter is here because the second one is a surprise.
   *
   * The only request in the game with more than one thing to fix. Every other request has
   * taught the player that a fix ends a call, so somebody who has just dealt with the shade
   * has no reason to think they are not finished - and the console saying 1/2 is the
   * cheapest possible way to say keep looking without anybody having to say it.
   */
  tasks: [
    { beatId: 'light-back', label: 'the shade taken off the failing rows' },
    { beatId: 'solved', label: 'the bank cut back off the bed' },
  ],
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
    /**
     * Rewritten after a playtest: somebody finished this request and still could not say
     * why one side was dying.
     *
     * The hints were all true and all stopped one step short. They said which rows, and
     * when, and that the water was fine - and never once said what a pale seedling is
     * actually short of. §106 says a hint surfaces what is observable, not the diagnosis,
     * and the colour of a leaf IS observable. Naming it is the difference between a
     * player who solves this and a player who guesses it.
     */
    {
      id: 'hint-side',
      summary: 'Only one **side** is dying, and the line is straight',
      detail:
        'The rows on one side are thin and pale. The rows on the other side, in the same '
        + 'soil and on the same water, are fine. The change happens over about a hand’s '
        + 'width, straight down the middle of the tunnel. Nothing that comes up through '
        + 'the ground stops in a straight line.',
      keywords: ['side', 'rows', 'line'],
      cue: 'camera.pan:tunnel-rows',
    },
    {
      id: 'hint-pale',
      summary: 'They are not wilted. They are **pale** and stretched',
      detail:
        'A plant short of water goes limp and browns at the edge. These are none of that '
        + '- they are upright, thin, long between the leaves, and the green has gone out '
        + 'of them. That is what a seedling looks like when it is reaching for **light** '
        + 'it cannot find.',
      keywords: ['pale', 'light'],
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
      summary: 'A **tree** stands over the wall on the failing side',
      detail:
        'Its crown reaches out over the tunnel, and its shade lies along the dying rows '
        + 'and stops where they stop. The edge of the shade and the edge of the damage '
        + 'are the same line. **Cut** the low limbs back and the light lands on those '
        + 'rows again.',
      keywords: ['tree', 'shade', 'cut'],
      cue: 'prop.highlight:neighbour-tree',
      // Only visible once somebody has looked outside rather than at the equipment.
      revealedBy: 'pattern-found',
    },
    {
      /**
       * The ground, planted early and cashed late.
       *
       * Available as soon as the player has seen which side is failing, and deliberately
       * NOT presented as a cause. It is an observation about the same side, and it sits in
       * the console doing nothing until the shade is dealt with - at which point it is the
       * only thing left between the seedlings and the light they have just been given, and
       * the player has already read it.
       *
       * That ordering is the whole design. A second act the player has never heard of
       * arrives as a chore; one they noticed forty seconds ago and could not act on
       * arrives as the other shoe dropping.
       */
      id: 'hint-ground',
      summary: 'The ground on the failing side has **gone over**',
      detail:
        'The strip between that bank and the boundary is knee-deep - grass gone to seed, '
        + 'and thick weed right up against the boards. The other side is walked flat. '
        + 'Whatever else is wrong with those rows, they are also competing for what little '
        + 'reaches them.',
      keywords: ['ground', 'grass', 'weeds', 'overgrown'],
      cue: 'camera.pan:the-bank',
      revealedBy: 'pattern-found',
    },
    {
      /**
       * The machine, in the console, before it is offered.
       *
       * §187 asks that the world contain what the player needs rather than the dialogue
       * announcing it, and a machine that only exists in the sentence which hands it over
       * is announced. Read here it is a fact about her smallholding - there is a mower, it
       * has a radio in it - and the player can be turning that over long before the
       * request needs it.
       */
      id: 'hint-mower',
      summary: 'There is a machine on the network here',
      detail:
        'A small grounds unit is parked at the end of the row with a radio set into the '
        + 'housing - an old conversion, and still answering. It is hers, it is on her '
        + 'ground, and it is reachable from here.',
      keywords: ['mower', 'machine', 'unit', 'network'],
      cue: 'prop.highlight:mower',
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
        // 'line', 'pale' and 'thin' are here because the hints bold them. A hint that
        // emphasises a word is telling the player it is vocabulary the game understands,
        // so the intent has to actually understand it - the harness enforces the pair.
        ['side', 'rows', 'row', 'pattern', 'half', 'which', 'dying', 'failing', 'line',
         'pale', 'thin'],
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
      /** Feeding them: the other reasonable wrong answer once the light is dealt with. */
      id: 'FEED_THEM',
      requires: [
        ['feed', 'fertilise', 'fertilize', 'compost', 'manure', 'nutrient', 'nutrients'],
      ],
      priority: 3,
    },
    {
      /**
       * The glasshouse, which is a lead and not a clue.
       *
       * §159 is firm that a wrong turn has to teach something, and this one does. A player
       * who suspects the water, the feed or the power is suspecting something SHARED, and
       * the other place her supply reaches is the fastest test of a shared cause. It is
       * fine in there. That does not name the tree, but it kills every systemic
       * explanation at once and leaves something local to one side of one tunnel - which
       * is the shape of the real answer.
       *
       * So it misleads the way a real investigation misleads: by being a reasonable thing
       * to check that happens not to be it.
       */
      id: 'CHECK_GLASS',
      requires: [
        [...TERMS.inspect, ...TERMS.describe, 'check', 'try'],
        ['glasshouse', 'greenhouse', 'glass', 'seedhouse'],
      ],
      priority: 3,
    },
    {
      /**
       * Asking about the ground on the dark side.
       *
       * Reachable but not signposted until she has said the light is back, which is the
       * point at which it becomes a sensible question rather than a random one - a player
       * who asks about weeds before the shade is dealt with is guessing, and the beat they
       * would land on does not exist yet.
       */
      id: 'CLEAR_GROUND',
      /**
       * Widened, because the chip that reaches it is now a question and not an order.
       *
       * "mow the bank" was wrong twice over. The player does the mowing, so telling Adaeze
       * to do it is the wrong speaker - and it named the answer, which is exactly what this
       * beat had to stop doing. The chip asks what is around the bed; the intent accepts
       * that and any of the direct phrasings somebody might type once they have worked it
       * out for themselves.
       */
      requires: [
        [...TERMS.inspect, ...TERMS.describe, 'cut', 'clear', 'mow', 'mower', 'machine',
          'unit', 'around', 'beside', 'next', 'what', 'edge'],
        ['weeds', 'weed', 'grass', 'bank', 'ground', 'growth', 'overgrown', 'bed', 'boards'],
      ],
      /*
       * 4, one above LOOK_OUTSIDE, because the chip "what is around that bed" scores both
       * equally - 'what'+'around' satisfy either group pair - and a tie makes the machine
       * ask a clarifying question about its own suggestion. When a sentence names the bed
       * or the ground, the ground is what it is about.
       */
      priority: 4,
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
        ASK_PATTERN: { to: 'pattern-found', environment: 'camera.pan:tunnel-rows,prop.point:contact' },
        CHECK_WATER: { to: 'water-fine', environment: 'prop.point:contact' },
        CHECK_POWER: { to: 'power-fine', environment: 'prop.point:contact' },
        CHECK_GLASS: { to: 'glasshouse' },
        LOOK_OUTSIDE: { to: 'outside', environment: 'prop.point:contact' },
        ADMIT_UNCERTAINTY: { to: 'uncertain', environment: 'prop.point:contact' },
      },
      onUnrecognised: { to: 'clarify' },
      onAmbiguous: { to: 'clarify' },
    },

    {
      id: 'clarify',
      framing: HOLD_FRAMING,
      tempo: Tempo.Respond,
      say: 'Say that again - I am kneeling in the dirt with the phone on a crate.',
      suggest: ['which rows are dying', 'look outside the tunnel', 'check the water'],
      on: {
        ASK_PATTERN: { to: 'pattern-found', environment: 'camera.pan:tunnel-rows' },
        CHECK_WATER: { to: 'water-fine' },
        CHECK_POWER: { to: 'power-fine' },
        CHECK_GLASS: { to: 'glasshouse' },
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
        CHECK_GLASS: { to: 'glasshouse' },
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
      framing: 'camera.pan:tunnel-rows',
      tempo: Tempo.Think,
      learn: [FACT_EQUIPMENT_FINE],
      say:
        'Water is fine. The drip line runs wet to the last row and the soil is damp on both ' +
        'sides - I checked that first, it is always the water. Only it is not, this time.',
      suggest: ['which rows are dying', 'check the glasshouse', 'look outside the tunnel'],
      on: {
        ASK_PATTERN: { to: 'pattern-found', environment: 'camera.pan:tunnel-rows' },
        CHECK_POWER: { to: 'power-fine' },
        CHECK_GLASS: { to: 'glasshouse' },
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
        CHECK_GLASS: { to: 'glasshouse' },
        LOOK_OUTSIDE: { to: 'outside' },
      },
      onUnrecognised: { to: 'clarify' },
    },

    {
      /** The turn. Not an answer - a shape. */
      id: 'pattern-found',
      framing: 'camera.pan:tunnel-rows',
      tempo: Tempo.Think,
      learn: [FACT_SHADE_LINE],
      say:
        'The eastern side. Every row on that side is thin, every row on the other side is ' +
        'fine, and the line between them is straight - it runs right down the middle of the ' +
        'tunnel. Same soil. Same water. Same seed, same day.',
      suggest: ['look outside the tunnel', 'check the water'],
      on: {
        LOOK_OUTSIDE: { to: 'outside', environment: 'prop.highlight:shade' },
        CHECK_WATER: { to: 'water-fine' },
        CHECK_POWER: { to: 'power-fine' },
        CHECK_GLASS: { to: 'glasshouse' },
        CUT_BACK: { to: 'outside', environment: 'prop.highlight:neighbour-tree' },
        MOVE_SEEDLINGS: { to: 'lost' },
      },
      onUnrecognised: { to: 'clarify' },
    },

    {
      /**
       * The other growing space, and it is fine.
       *
       * The trap in §163 is that two consecutive electrical faults have trained the player
       * to look for a broken device. This is the version of that trap for a player who has
       * got past it and is now looking for a broken SYSTEM - the supply, the feed, the
       * water - which is a smarter wrong answer and deserves a better refusal than "no".
       *
       * She checks and reports, and what she reports quietly does the player a favour.
       * Everything shared between the two buildings is working, so whatever is wrong is
       * not shared: it is local to one side of one tunnel. That is most of the way to a
       * shadow, and the player got there by being wrong.
       *
       * No fact is learned. It rules things out rather than establishing one, and putting
       * an entry on the tree for "the glasshouse is fine" would be recording the absence
       * of a problem as knowledge.
       */
      id: 'glasshouse',
      framing: 'camera.pan:glasshouse',
      tempo: Tempo.Respond,
      say:
        'The glasshouse? It is doing better than the tunnel is, if I am honest. Same water, '
        + 'same feed, same hands - and the tomatoes in there are away.\n\n'
        + 'Which I suppose tells you something. If it were the supply it would be both.',
      suggest: ['which rows are dying', 'look outside the tunnel'],
      on: {
        ASK_PATTERN: { to: 'pattern-found', environment: 'camera.pan:tunnel-rows' },
        LOOK_OUTSIDE: { to: 'outside' },
        CHECK_WATER: { to: 'water-fine' },
        CHECK_POWER: { to: 'power-fine' },
        MOVE_SEEDLINGS: { to: 'lost' },
      },
      onUnrecognised: { to: 'clarify' },
    },

    {
      id: 'outside',
      gesture: 'prop.surprised:contact',
      framing: 'camera.push-in:neighbour-tree',
      tempo: Tempo.Respond,
      learn: [FACT_TREE_GREW],
      say:
        'Outside? ... Oh. Oh, the mango. It was a stick when my father planted it. It is over ' +
        'the roof now - the whole crown leans across the eastern side. That is the shadow. ' +
        'It has been getting a little longer every week and I have walked under it every day.',
      suggest: ['cut the branches back'],
      affirmIntent: 'CUT_BACK',
      on: {
        CUT_BACK: { to: 'light-back', environment: 'prop.clear:neighbour-tree' },
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
      /*
       * The fold. "I should not have done it. I knew and I did it because you said so."
       *
       * That is not a recoil, it is somebody stopping. She is not reacting to the seedlings;
       * she is folding under having been the one who lifted them. F11.
       */
      gesture: 'prop.slump:contact',
      framing: 'camera.pan:tunnel-rows',
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
      /**
       * The light is back, and the row is still losing.
       *
       * This used to be the end of the request, and the request was three questions long -
       * the thinnest in the game. It is now the hinge between two acts, and the second act
       * exists because the first one left something behind that the player can SEE: the
       * shade is gone off the failing bank and the bank is still a foot deep in grass that
       * nobody has cut since the spring, for the same reason it was shaded, which is that
       * she stopped going down the dark side.
       *
       * So the diagnosis has not changed and nothing already written is wrong. The tree
       * was the cause of the shade and the shade was the cause of the neglect, and the
       * neglect is standing right there competing with her seedlings for what the tree has
       * just handed back.
       */
      id: 'light-back',
      gesture: 'prop.nod:contact',
      framing: 'camera.pan:tunnel-rows',
      tempo: Tempo.Respond,
      say:
        'I have the saw... there. The low limbs are off and the light is on those rows for ' +
        'the first time in weeks - you can see the line where the shadow was.\n\n' +
        'So that is the shade dealt with. But I am looking at them and they are still not ' +
        'right - still thin, still stretched. It is like they are not getting the whole of ' +
        'it even now.',
      /*
       * She reports and does not diagnose, which was the note.
       *
       * This used to name the grass outright - "look at the ground on that side, it has
       * closed right over" - and hand over a single chip saying clear it. So the second act
       * had no act in it: the player was told the answer and given one button, immediately
       * after being told the first answer and given one button.
       *
       * What she says now is what somebody standing in a tunnel would say - the light is
       * back and the rows are still not right - and that is genuinely puzzling, because the
       * shade WAS the cause and dealing with it should have been enough. The ground is in
       * the console as `hint-ground` and has been since they worked out which side was
       * failing, so the information is there and the connection is not made for them.
       *
       * Three chips and only one is it. The other two are the reasonable things to try when
       * a plant is not thriving and the light is already fixed, and both come back with her
       * explaining why they are not the problem - the same shape as the pump and the water
       * in the first act. §163: the wrong moves resolve, they are not punished, they teach.
       */
      suggest: ['feed them', 'check the water', 'what is around that bed'],
      /*
       * CHECK_WATER goes to a SECOND-ACT answer, not back to `water-fine`.
       *
       * The audit found this as an infinite loop and it was a design fault, not a typo.
       * Routing a post-cut question back into a pre-cut beat reopens the first act:
       * water-fine offers the glasshouse, the glasshouse offers looking outside, outside
       * ends at light-back, and round it goes forever. Anything asked after the branches
       * are off has to be answered by somebody who knows the branches are off.
       */
      on: {
        FEED_THEM: { to: 'feed-fine' },
        CHECK_WATER: { to: 'water-again' },
        CLEAR_GROUND: { to: 'the-unit' },
        MOVE_SEEDLINGS: { to: 'lost' },
      },
      onUnrecognised: { to: 'light-back' },
    },

    {
      /**
       * Feeding them, which is not it, and the refusal has to be worth hearing.
       *
       * The same job the pump and the water do in the first act: a reasonable move that
       * resolves, is not punished, and narrows things. Her answer rules out the soil - she
       * fed both banks out of the same bucket and only one bank is failing - which leaves
       * whatever is different about that ONE SIDE, and by this point the player has already
       * fixed the only difference they knew about. That is the nudge to go looking for
       * another one.
       */
      id: 'feed-fine',
      framing: HOLD_FRAMING,
      tempo: Tempo.Respond,
      say:
        'They were fed a fortnight ago - both banks, same bucket, same afternoon. If it were '
        + 'the feed the whole tunnel would be sulking, and the other side has never looked '
        + 'better.',
      /*
       * One chip, and it points forward.
       *
       * Offering the OTHER wrong answer here is what turned this into a loop the second
       * time: feed sends you to water, water sends you back to feed. A wrong answer should
       * not hand the player another wrong answer on a plate - it should say why it is wrong
       * and leave the way on visible. Anything else they want to try, they can still type.
       */
      suggest: ['what is around that bed'],
      on: {
        CLEAR_GROUND: { to: 'the-unit' },
        CHECK_WATER: { to: 'water-again' },
        MOVE_SEEDLINGS: { to: 'lost' },
      },
      onUnrecognised: { to: 'light-back' },
    },

    {
      /**
       * The water, asked again after the cut, and answered by somebody who has just checked.
       *
       * `water-fine` already exists and cannot be reused - see the note on light-back's `on`
       * map. This is the same fact in the second act's mouth, and it does one more thing
       * than the first-act version: she says she looked at it AGAIN, with the saw in her
       * hand, which quietly tells the player that re-treading old ground is not where this
       * is going.
       */
      id: 'water-again',
      framing: HOLD_FRAMING,
      tempo: Tempo.Respond,
      say:
        'I checked it again while I had the saw out. The drip line is wet the whole length '
        + 'and both banks are on the same run - they always have been. It is not the water.',
      suggest: ['what is around that bed'],
      on: {
        CLEAR_GROUND: { to: 'the-unit' },
        FEED_THEM: { to: 'feed-fine' },
        MOVE_SEEDLINGS: { to: 'lost' },
      },
      onUnrecognised: { to: 'light-back' },
    },

    {
      /**
       * The machine, offered.
       *
       * §187 is the whole reason this beat can exist. OMNISCIENT_ has no hands and this is
       * not a pair of hands - it is a groundskeeping unit sitting on her smallholding with
       * a receiver in it, and signing into equipment that is already on the network is
       * what the player has been doing to a municipal camera system in District 07 since
       * that request was written. The machine does not touch the grass. It logs in to the
       * thing that does.
       *
       * She has to say she cannot do it herself, and the reason has to be good, or the
       * device is a minigame with a excuse taped to it. Hers is that she is one person, it
       * is the end of the day, and the light she has just won back is on a clock.
       */
      id: 'the-unit',
      framing: 'camera.pan:tunnel-rows',
      tempo: Tempo.Respond,
      /**
       * She answers the question that was asked, and THEN the machine comes up.
       *
       * This said "it is the green one, by the corner post" - which is an answer to "where
       * is the mower?", and the player got here by asking what is around the bed. So the
       * one beat where their deduction pays off had her replying to a question nobody had
       * put, and the second act's whole premise arrived as a non-sequitur.
       *
       * The order matters more than the words. OMNISCIENT_ works it out, she CONFIRMS it -
       * which is the shape of every diagnosis in this game, and the only moment in this
       * request where the player gets told they were right about something they were not led
       * to - and only then does the question of who is going to deal with it come up. She
       * cannot, and there is a machine that can.
       */
      say:
        'Around it? ... Ah. Yes. Yes, look at it - the whole strip between that bank and the '
        + 'boundary has closed over. It is up past the boards.\n\n'
        + 'I have not been down that side since the spring. Why would I, nothing was growing. '
        + 'So it has had the whole season to itself, and now I have given those seedlings '
        + 'their light back it is going to drink it first.',
      device: {
        kind: 'unit',
        prompt:
          'And I cannot do that bank by hand tonight and have anything left for the picking.\n\n'
          + 'There is the little mower, though - the green one by the corner post. My father '
          + 'put a radio in it years ago so it could be run from the house. Nobody has called '
          + 'it in a long time, but the switch on the handle is still over. It might still '
          + 'work. Check the connection and see.',
        take: 'unit.take',
        accept: 'TAKE THE UNIT',
        wrongSay: '',
        onSolved: { to: 'solved' },
        onWrong: { to: 'solved' },
      },
      /*
       * A chip as well as the button, and the stuck-checker was right to insist.
       *
       * This beat loops to itself on anything it does not recognise, which is correct - the
       * machine is on offer and nothing else is happening until it is taken - but it left
       * the beat with no way forward that the audit could SEE. The audit cannot see a
       * device button, and it should not have to: a player who types something the parser
       * misses while a board is up gets a beat with no chips on it, and "the answer is over
       * there in the console" is exactly the kind of thing that is obvious to whoever wrote
       * it and to nobody else.
       */
      suggest: ['mow the bank'],
      on: {
        CLEAR_GROUND: { to: 'the-unit' },
      },
      onUnrecognised: { to: 'the-unit' },
    },

    {
      id: 'solved',
      gesture: 'prop.recover:rows-failing,prop.nod:contact',
      framing: 'camera.pan:tunnel-rows',
      tempo: Tempo.Respond,
      say:
        'It is down. All of it, right up to the boards - I can see the soil on that side for ' +
        'the first time since the spring.\n\n' +
        'They will come back now. Thin for a fortnight, and then they will come back. There ' +
        'was never anything wrong with them. Nothing was broken. It just grew.',
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
