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
import { createRng, seedFrom } from '../core/rng.js';
import { planFleet } from '../mission/traces.js';
import { OutcomeKind, Tempo, Urgency } from '../mission/types.js';

import type { MissionDefinition } from '../mission/types.js';

export const FACT_POLICE_HAVE_ACCESS = 'police-have-access';
export const FACT_COVERAGE_THINS = 'coverage-thins-at-the-edge';
export const FACT_PARTIAL_PLATE = 'partial-plate-district-07';

/**
 * The district, generated once at module load from a fixed seed.
 *
 * §123: deterministic, so the officer's numbers are the same every run and a bug in the
 * puzzle can be reproduced. The evidence comes back from the same call that builds the
 * traffic - see mission/traces.ts for why the two cannot be authored separately.
 */
const DISTRICT = planFleet(createRng(seedFrom('district-07')), 180, 24);

export const MISSION_08: MissionDefinition = {
  id: 'mission-08-district',
  version: 1,
  contactId: 'lucian',
  sceneId: 'scene-wire-city',
  archetype: 'diagnosis',
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
      id: 'found',
      say:
        'That is the one. That is our plate. He is on the ring road heading for the bridge '
        + '- I can be on the bridge before he is.',
      tempo: Tempo.Respond,
      suggest: [],
      on: {},
      outcome: {
        kind: OutcomeKind.Solved,
        say:
          'Target stopped. We have him. One car, one stop, nobody else touched. '
          + '... I did not know your system could do that.',
        trust: 2,
        connects: [
          {
            a: FACT_POLICE_HAVE_ACCESS,
            b: FACT_COVERAGE_THINS,
            label: 'what the machine can see, and who is asking',
          },
        ],
      },
    },
  ],
};
