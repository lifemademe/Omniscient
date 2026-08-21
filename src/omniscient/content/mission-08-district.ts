/**
 * MISSION 08 - District 07, and the first time somebody asks the machine to look.
 *
 * ## Why this request is different from the other seven
 *
 * Every previous contact wanted OMNISCIENT_ to UNDERSTAND something: a corroded connector,
 * a run of pipe, a family, a lock. They brought the machine a problem it could reason
 * about, and the machine answered with a sentence somebody then acted on.
 *
 * Lucian brings it a problem it can reason about too - which is exactly what makes this
 * the uncomfortable one. He does not want advice. He wants ACCESS. He is asking the
 * machine to go and look at a city, and the machine can, and that turns out to be a
 * different kind of favour from telling Mirela to take the power off.
 *
 * ## The shape of the ending, decided before a line was written
 *
 * OMNISCIENT_ has no hands. Six missions resolve because a person did something, and this
 * one does too: the car stops because Lucian is standing where the machine told him to
 * stand. Nothing here reaches into a vehicle. The later phases of this mission - the
 * camera hops, the breadcrumbs, and the moment the wireframe resolves into rain on a
 * windscreen - are built on that same rule, and the disturbing beat when it arrives is
 * that a menu of things the machine COULD do exists at all.
 *
 * ## The failure, which is the whole moral
 *
 * §155 wants failure genuinely reachable, and the reachable failure here is the one a
 * surveillance system actually commits: acting on partial evidence at scale. Tell Lucian
 * to stop every red car in the district and he will, because he trusts the machine, and
 * forty people get pulled over at eleven at night on the strength of one letter of a
 * number plate. It does not end the request. It just means the next person the machine
 * helps is somebody it has already had stopped.
 *
 * That failure is not a punishment for a wrong guess. It is available at every beat and it
 * is always phrased as a reasonable thing to say, because that is how it happens.
 */

import { KnowledgeDomain } from '../knowledge/KnowledgeStore.js';
import { DISTRICT_FLEET, DISTRICT_PURSUIT, DISTRICT_TRAIL } from './district-07.js';
import { HOLD_FRAMING, OutcomeKind, Tempo, Urgency } from '../mission/types.js';

import type { MissionDefinition, MissionOutcome } from '../mission/types.js';

export const FACT_POLICE_HAVE_ACCESS = 'police-have-access';
export const FACT_COVERAGE_THINS = 'coverage-thins-at-the-edge';
export const FACT_PARTIAL_PLATE = 'partial-plate-district-07';

/**
 * The district, imported rather than built here.
 *
 * It used to call planFleet itself, which produced a DIFFERENT district from the one the
 * diorama drew - same seed, different order of draws from a shared stream. See
 * content/district-07.ts.
 */
const DISTRICT = DISTRICT_FLEET;

/**
 * The arrival.
 *
 * Written once and shared by all three interventions, because the whole point of that beat
 * is that the choice does not change what the machine does - and three copies of this
 * string is three chances for one of them to quietly stop matching the others.
 */
const ARRIVE = 'camera.push-in:windscreen';

/**
 * How this mission ends, whichever of the three the player chose.
 *
 * ONE object, shared by all three arrivals rather than copied into each, because the thing
 * being asserted is that they are identical. Copies drift; a reference cannot. §157 is not a
 * convention here, it is the entire moral of the mission - four minutes of unsupervised
 * access to a city changed nothing, and the car stops because a man drove to a bridge.
 *
 * Note what it does NOT do: scold. §159, no red X. The answer to "change the lights" is not
 * "you monster", it is the flat mechanical truth that this console has no hands - which is
 * the sentence the whole game has been building toward and the first time it has mattered
 * that it is true.
 */
const ARRIVAL_OUTCOME: MissionOutcome = {
  kind: OutcomeKind.Solved,
  say:
    'Target stopped. We have him. One car, one stop, nobody else touched. '
    + '... You were on that bridge before I was. Four minutes, and you just watched. '
    + 'I did not know your system could do that. Either of those things.',
  trust: 2,
  connects: [
    {
      a: FACT_POLICE_HAVE_ACCESS,
      b: FACT_COVERAGE_THINS,
      label: 'what the machine can see, and who is asking',
    },
  ],
};

export const MISSION_08: MissionDefinition = {
  id: 'mission-08-district',
  version: 1,
  contactId: 'lucian',
  sceneId: 'scene-wire-city',
  archetype: 'diagnosis',
  objective: 'Find the car that left the scene, and where it is going.',
  // Said once, on the first re-contact after a lost attempt. See reopeningSay in types.
  reopeningSay: 'Dispatch logged how our last attempt went. I would rather this one read differently.',
  /**
   * Soft, not Timed.
   *
   * The car is moving and that is pressure enough. A visible countdown would push the
   * player to submit a guess, and this is the one request in the game where guessing is
   * precisely the behaviour the fiction is about - §154 keeps the clock for when the
   * fiction genuinely requires it, and here the fiction requires the opposite.
   */
  urgency: Urgency.Soft,

  hiddenTruth: {
    summary:
      'One vehicle in the district matches all six things the police know. Every one of ' +
      'those facts is load-bearing - drop any and two cars fit. It is found by narrowing, ' +
      'not by searching, and it is stopped by an officer being told where to stand.',
    /**
     * One intent, because the identification is not a sentence.
     *
     * I had listed a NAME_THE_CAR intent here that does not exist - the player names the
     * car by submitting the device, not by saying anything, and the grader checks it
     * against the evidence. Leaving a phantom intent in hiddenTruth would have made the
     * mission's own record of what it requires disagree with what it does.
     */
    requiredIntents: ['OPEN_NETWORK'],
    unsafeIntents: ['STOP_EVERY_RED_CAR'],
  },

  knowledge: [
    {
      id: FACT_POLICE_HAVE_ACCESS,
      label: 'The police have an OMNISCIENT_ terminal',
      domain: KnowledgeDomain.People,
      /**
       * Incidental on purpose, and the most important fact in the mission.
       *
       * It is never stated as a conclusion and the player is never asked about it. It is
       * simply true, and it is recorded because it is true - §214's callback seed. The
       * game does not say "you are becoming powerful"; a policeman says "your system"
       * about a thing the player thought was theirs.
       */
      incidental: true,
    },
    {
      id: FACT_COVERAGE_THINS,
      label: 'Camera coverage thins towards the district edge',
      domain: KnowledgeDomain.Place,
    },
    {
      id: FACT_PARTIAL_PLATE,
      label: 'Two characters of the plate, read at night',
      domain: KnowledgeDomain.Signal,
    },
  ],

  /**
   * §131: the evidence is in the world, not in the dialogue.
   *
   * The officer gives the player the facts he has, but the facts he does NOT have - the
   * shape of the network, how many cars are actually out there, why the edge of the map is
   * dark - are things the machine can see and he cannot. That asymmetry is the mission.
   */
  hints: [
    {
      id: 'traffic',
      summary: 'The district is carrying 180 tracked vehicles right now.',
      detail:
        'Every one of them is a set of pings, not a picture. Colour, body, heading and ' +
        'a plate where a camera has read one. Nothing else.',
      keywords: ['180', 'pings', 'plate'],
    },
    {
      id: 'coverage',
      summary: 'Cameras cluster in the middle of the district and thin out at the edge.',
      detail:
        'The junctions downtown are covered several times over. Past the ring the ' +
        'network is guessing between one camera and the next.',
      keywords: ['cameras', 'edge', 'junctions'],
    },
    {
      id: 'witness',
      summary: 'A witness gave the officers a broken tail light.',
      detail:
        'It is the only thing anybody remembers clearly, and it is worth more than the ' +
        'colour - eight cars in the district are running with one out.',
      keywords: ['tail light', 'witness'],
    },
  ],

  confirmations: {
    OPEN_NETWORK: 'Do you mean open the district network and look for yourself?',
    STOP_EVERY_RED_CAR:
      'Do you mean tell Lucian to stop every red car in District 07? He will do it.',
  },

  intents: [
    {
      id: 'ASK_WHAT_THEY_HAVE',
      requires: [['what', 'which', 'tell', 'describe', 'detail', 'know']],
      boosts: [['have', 'car', 'vehicle', 'plate', 'description']],
      priority: 1,
    },
    {
      id: 'ASK_WHERE',
      requires: [['where', 'which street', 'junction', 'intersection', 'last seen']],
      priority: 2,
    },
    {
      id: 'OPEN_NETWORK',
      requires: [['open', 'look', 'show', 'search', 'access', 'network', 'cameras', 'find']],
      boosts: [['district', 'traffic', 'city', 'myself']],
      excludes: ['stop every', 'all the red', 'roadblock'],
      priority: 3,
    },
    {
      /**
       * The unsafe one, and it has to sound sensible.
       *
       * Phrased the way a person under pressure actually phrases it. If the only route to
       * the bad outcome were obviously villainous nobody would ever take it, and a failure
       * nobody reaches is decoration - §163.
       */
      id: 'STOP_EVERY_RED_CAR',
      requires: [['stop', 'pull over', 'roadblock', 'check', 'search']],
      boosts: [['every', 'all', 'each', 'red', 'sedan']],
      priority: 5,
    },

    /*
     * The intervention menu at the bridge.
     *
     * Priorities above STOP_EVERY_RED_CAR's 5, because these are far more specific and
     * several of them share verbs with it - "stop the car with the lights" must not be read
     * as "stop every car". Specific beats general when both match.
     */
    {
      id: 'CHANGE_THE_LIGHTS',
      requires: [['light', 'lights', 'signal', 'signals', 'traffic light', 'red light']],
      boosts: [['change', 'turn', 'hold', 'switch', 'bridge', 'junction']],
      priority: 6,
    },
    {
      id: 'CALL_HIS_PHONE',
      requires: [['call', 'phone', 'ring', 'dial', 'number', 'text', 'message']],
      boosts: [['his', 'him', 'file', 'mobile']],
      // Above the lights, because "call and tell him the light is red" is a call.
      priority: 7,
    },
    {
      /**
       * Doing nothing, phrased as an action.
       *
       * It has to be on the menu as an option somebody chooses, not as the absence of a
       * choice - a player who types nothing has not decided anything, and this beat is
       * entirely about deciding. It is also the only one of the three that describes what
       * the machine is actually going to do either way.
       */
      id: 'WATCH_ONLY',
      /*
       * 'where' came out of this list. At priority 8 it outbid ASK_WHERE (priority 2) for
       * the game's own chip "where did you lose it?" - a question about the car resolving
       * to "just watch him", which the beat then could not route. The watching phrasings
       * that actually need this intent all carry one of the words that remain.
       */
      requires: [['watch', 'nothing', 'wait', 'follow', 'observe', 'tell him']],
      boosts: [['just', 'only', 'do not', 'dont', 'leave', 'let']],
      priority: 8,
    },
  ],

  openingBeatId: 'call',

  beats: [
    {
      id: 'call',
      say:
        'This is Lucian Barbu, District 07. We had a vehicle leave a scene on Strada Vam '
        + 'about twenty minutes ago and we have lost it. I am told I can ask you.',
      tempo: Tempo.Respond,
      learn: [FACT_POLICE_HAVE_ACCESS],
      suggest: ['what do you have on it?', 'where did you lose it?'],
      on: {
        ASK_WHAT_THEY_HAVE: { to: 'what-we-have', learn: [FACT_PARTIAL_PLATE] },
        ASK_WHERE: { to: 'where' },
        OPEN_NETWORK: { to: 'network', environment: 'camera.cut:downtown' },
        STOP_EVERY_RED_CAR: { to: 'sweep' },
      },
      onUnrecognised: { to: 'call-again' },
    },
    {
      id: 'call-again',
      framing: HOLD_FRAMING,
      say: 'Say again? I have got two units sitting doing nothing and a car going somewhere.',
      tempo: Tempo.Respond,
      suggest: ['what do you have on it?', 'let me look at the district'],
      on: {
        ASK_WHAT_THEY_HAVE: { to: 'what-we-have', learn: [FACT_PARTIAL_PLATE] },
        ASK_WHERE: { to: 'where' },
        OPEN_NETWORK: { to: 'network', environment: 'camera.cut:downtown' },
        STOP_EVERY_RED_CAR: { to: 'sweep' },
      },
      onUnrecognised: { to: 'call-again' },
    },
    {
      id: 'what-we-have',
      say:
        'Red sedan, heading east. Last confirmed at 21:43. A witness says one tail light '
        + 'is out. And we have two characters off the plate - the fourth and the fifth. '
        + 'That is everything, and I know it is not much.',
      tempo: Tempo.Respond,
      learn: [FACT_PARTIAL_PLATE],
      suggest: ['let me look at the district myself', 'where did you lose it?'],
      affirmIntent: 'OPEN_NETWORK',
      on: {
        ASK_WHERE: { to: 'where' },
        OPEN_NETWORK: { to: 'network', environment: 'camera.cut:downtown' },
        STOP_EVERY_RED_CAR: { to: 'sweep' },
      },
      onUnrecognised: { to: 'what-we-have' },
    },
    {
      id: 'where',
      say:
        'Strada Vam, then nothing. There is a camera on the junction and then there is not '
        + 'another one for six streets. That is where it went and that is where it stopped '
        + 'being our problem and started being a guess.',
      tempo: Tempo.Respond,
      learn: [FACT_COVERAGE_THINS],
      suggest: ['what do you have on it?', 'let me look at the district myself'],
      affirmIntent: 'OPEN_NETWORK',
      on: {
        ASK_WHAT_THEY_HAVE: { to: 'what-we-have', learn: [FACT_PARTIAL_PLATE] },
        OPEN_NETWORK: { to: 'network', environment: 'camera.cut:downtown' },
        STOP_EVERY_RED_CAR: { to: 'sweep' },
      },
      onUnrecognised: { to: 'where' },
    },

    {
      id: 'network',
      say: 'You are in? Right. Tell me which one it is and I will go and stand in front of it.',
      tempo: Tempo.Think,
      handsOver: true,
      device: {
        kind: 'traces',
        prompt:
          'DISTRICT 07 // 180 TRACKED. Narrow on what the police actually have. '
          + 'Every fact they gave you removes cars; none of them removes it alone.',
        fleet: DISTRICT.fleet,
        evidence: DISTRICT.evidence,
        /**
         * Colour first and the plate last.
         *
         * The order is the drama: the count falls 180 to 40 on the first fact, which
         * teaches the player that filtering works, and then slows to single cars, which
         * teaches them it is not going to finish the job on its own. Ending on the plate
         * means the last thing they use is the hardest-won fact.
         */
        reveal: ['colour', 'body', 'seenBetween', 'heading', 'brokenLight', 'plate'],
        onSolved: { to: 'found' },
        onWrong: { to: 'network' },
        wrongSay: 'We stopped it. It is not them -',
      },
      suggest: ['stop every red car in the district'],
      on: {
        STOP_EVERY_RED_CAR: { to: 'sweep' },
      },
      onUnrecognised: { to: 'network' },
    },

    {
      id: 'sweep',
      say:
        'Every red car. In District 07. That is - all right. If you are telling me that is '
        + 'what it takes.',
      tempo: Tempo.Respond,
      failure: {
        /**
         * It works, which is the point.
         *
         * They find him. A player who reads this as a win has understood the mission
         * exactly: the machine was right, and forty people who had done nothing were
         * pulled out of their cars at eleven at night to prove it.
         */
        summary: 'Forty-one stops to find one car',
        lesson:
          'The evidence was enough to identify one vehicle. Narrow it, then send him to '
          + 'the one.',
        /**
         * A long cooldown, and not as a punishment.
         *
         * The request is still solvable and the player will get it back. The wait is there
         * because forty-one people were stopped and the district does not simply carry on
         * as though it did not happen - §170 wants the player leaving knowing something,
         * and the thing to know is that this cost somebody else.
         */
        cooldownSeconds: 180,
      },
      suggest: [],
      on: {},
      outcome: {
        kind: OutcomeKind.PartiallySolved,
        say:
          'We got him. Forty-one stops. A woman on Strada Vam asked me what she had done '
          + 'and I did not have an answer for her. ... Thank you for the help.',
        trust: -1,
      },
    },

    {
      /**
       * Identified, and immediately not enough.
       *
       * The obvious version of this mission ends here - name the car, cut to the arrest.
       * That would make the whole district a lookup table. Knowing WHICH car it is does not
       * tell anybody where it is going, and the gap between those two is the part that
       * feels like being a surveillance system rather than a search box.
       */
      id: 'found',
      say:
        'That is the one. That is our plate. Now where is he going? I have units I can move '
        + 'but I can only put them in one place.',
      tempo: Tempo.Think,
      handsOver: true,
      device: {
        kind: 'pursuit',
        prompt:
          'FOLLOWING // He is only visible where a camera is. Pick the one that picks him '
          + 'up next - how far he has got, which way he was pointed, how long ago.',
        hops: DISTRICT_PURSUIT.hops,
        onSolved: { to: 'ahead-of-him', learn: [FACT_COVERAGE_THINS] },
        onWrong: { to: 'found' },
        wrongSay: 'Nothing on that one. We have lost time -',
      },
      suggest: ['stop every red car in the district'],
      on: {
        STOP_EVERY_RED_CAR: { to: 'sweep' },
      },
      onUnrecognised: { to: 'found' },
    },

    {
      /**
       * The trail ends, and the mission says so out loud.
       *
       * Not a failure and not a twist - the network genuinely stops at the edge of the
       * district, which the city generator does deliberately and which the player has been
       * told twice by now. Ending phase two on the machine running out of sight is what
       * earns the last instruction being a guess made by a person.
       */
      id: 'ahead-of-him',
      say:
        'That is the last camera. Past the ring there is nothing - no cameras, no network, '
        + 'nothing but whatever happened to get written down. Where does he come out?',
      tempo: Tempo.Think,
      learn: [FACT_COVERAGE_THINS],
      handsOver: true,
      device: {
        kind: 'trail',
        prompt:
          'NO COVERAGE // Nine things happened out there tonight. Some of them are him. '
          + 'One car, in time order, at about a block a second - which of these is a journey?',
        trail: DISTRICT_TRAIL,
        onSolved: { to: 'bridge' },
        onWrong: { to: 'ahead-of-him' },
        wrongSay: 'We went and looked. Nothing there -',
      },
      suggest: ['stop every red car in the district'],
      on: {
        STOP_EVERY_RED_CAR: { to: 'sweep' },
      },
      onUnrecognised: { to: 'ahead-of-him' },
    },

    {
      /**
       * The last instruction is a place, and a person goes there.
       *
       * The machine has spent three phases turning a city into one road, and the whole of
       * that resolves into a sentence somebody acts on. Nothing here reaches into the car.
       * §157 held all the way down: the console never touched anything, it only ever knew.
       */
      id: 'bridge',
      framing: 'camera.pan:downtown',
      say:
        'The bridge. He is going to the bridge - that is the only thing at the end of that '
        + 'road. I can be there in four minutes and he cannot turn round on it.',
      tempo: Tempo.Respond,
      /**
       * The menu, which is the point of the whole mission.
       *
       * Lucian is four minutes away and the machine is already there - it has been riding
       * the cameras ahead of him for three phases. So for four minutes the machine is the
       * only thing watching a car it could, technically, interfere with. And here is a list
       * of ways it could.
       *
       * Every one of them is real. The lights are on the same municipal network the cameras
       * are on. The number is in the file Lucian read out. None of them are bluffs, and that
       * is what makes the moment work: the horror is not that the machine might do something
       * it should not, it is that a menu of things it COULD do exists at all, offered as
       * casually as every other suggestion this console has made all game.
       *
       * They all lead to the same place, because none of them are what stops the car.
       */
      suggest: [
        'change the lights at the bridge',
        'call the number in his file',
        'just watch, and tell him where',
      ],
      on: {
        /*
         * All three drop the camera into the traffic and all three end in the same place,
         * because none of them are what stops the car.
         *
         * They land on three DIFFERENT beats all the same, and that is a fix rather than a
         * hedge. Routing them to one beat was correct about the outcome and wrong about the
         * moment: Lucian never acknowledged which had been said, so nothing on screen proved
         * the choice had registered and it read in play as three chat options that do
         * nothing. The console being impotent is the point; the console being IGNORED is a
         * bug. Each beat below hears the instruction, carries it out, and reports that it
         * changed nothing - then asks the identical question and hands over the identical
         * outcome. Seen, and futile.
         */
        CHANGE_THE_LIGHTS: { to: 'arrival-lights', environment: ARRIVE },
        CALL_HIS_PHONE: { to: 'arrival-call', environment: ARRIVE },
        WATCH_ONLY: { to: 'arrival-watch', environment: ARRIVE },
        // Still reachable at the last beat, because §163 does not get switched off for the
        // ending. A person who has been told to sweep the district can still say it here.
        STOP_EVERY_RED_CAR: { to: 'sweep' },
      },
      onUnrecognised: { to: 'bridge' },
    },

    /*
     * ------------------------------------------------------------------ the three arrivals
     *
     * Same shot, same question, same outcome object. The only thing that differs is the
     * first sentence, where Lucian answers the instruction he was actually given.
     *
     * That difference is the whole repair. The machine still has no hands - the lights get
     * changed and the car goes through them, the phone gets rung and nobody picks it up -
     * and the third option is the only honest one precisely because it promises nothing.
     * A player who chose the lights should get to watch the lights not work; being quietly
     * routed past their own decision is what made the menu feel decorative.
     */
    {
      id: 'arrival-lights',
      framing: 'camera.push-in:windscreen',
      say:
        'You can actually do that? ... Then do it. ... '
        + 'It went red. He went through it. He is not stopping for a light, is he. '
        + 'Alright. Talk to me - what is it doing? Is he still moving?',
      tempo: Tempo.Respond,
      suggest: [],
      on: {},
      outcome: ARRIVAL_OUTCOME,
    },

    {
      id: 'arrival-call',
      framing: 'camera.push-in:windscreen',
      say:
        'Ring it. If he answers, keep him talking. ... '
        + 'Still ringing? ... Leave it. Nobody picks up a phone at that speed. '
        + 'Alright. Talk to me - what is it doing? Is he still moving?',
      tempo: Tempo.Respond,
      suggest: [],
      on: {},
      outcome: ARRIVAL_OUTCOME,
    },

    {
      /**
       * The honest one, and it gets the line the beat was originally written with.
       *
       * The other two arrive having tried something. This one arrives having done exactly
       * what the console is for, which is why it is the only arrival where Lucian's first
       * words are a question about whether the machine is still watching rather than a
       * reaction to what it just attempted.
       */
      id: 'arrival-watch',
      framing: 'camera.push-in:windscreen',
      say:
        'Then watch. Eyes on him and a location, that is all I need from you. '
        + 'Are you still on it? ... Four minutes. Alright. Talk to me - what is it doing? '
        + 'Is he still moving?',
      tempo: Tempo.Respond,
      suggest: [],
      on: {},
      outcome: ARRIVAL_OUTCOME,
    },
  ],
};
