/**
 * The globe's signals.
 *
 * Two are real requests. The rest are §52's tease - the globe should always look like
 * humanity needs more than OMNISCIENT_ can answer, and a judge should be able to see
 * that the world extends past the slice. One of them is not a request at all (§169).
 */

import { SignalState } from '../crt/GlobeView.js';

import type { Signal } from '../crt/GlobeView.js';

/**
 * Signals revealed once the player has finished their first request.
 *
 * The opening globe holds exactly one point, so there is no question about where to go.
 * Everything §52 wants arrives the moment the player has done a thing once and knows what
 * the globe is for.
 *
 * There used to be a tease here as well - a failed request in Toronto, seeded already on
 * cooldown, which existed to make the world look bigger than four contacts and to show
 * §31 on the globe. Five real requests do the first job better than a fake one did, and
 * §96 caps the nameable signals at five, so the fake was the one to go. §31 is left to the
 * real mechanism: losing Mirela puts her on a countdown, which preview-stuck walks end to
 * end.
 */
export const REVEALED_AFTER_FIRST = ['anomaly'];

/** Signal ids that map to authored missions, in queue order. */
export const MIRELA_SIGNAL = 'mirela';
export const TOMAS_SIGNAL = 'tomas';
export const ADAEZE_SIGNAL = 'adaeze';
export const ILEANA_SIGNAL = 'ileana';
export const VASILE_SIGNAL = 'vasile';

/**
 * §96 caps conscious attention at five. The globe honours that: five nameable people at
 * a time, plus the anomaly, which is not a person and cannot be answered.
 */
export function createSignals(): Signal[] {
  return [
    {
      id: MIRELA_SIGNAL,
      latitude: 44.2,
      longitude: 28.6,
      name: 'Mirela Vasc',
      label: '"It worked yesterday."',
      state: SignalState.Waiting,
    },
    {
      /**
       * A long way from the Vascs, and that is geography giving way to clickability for
       * the second time in this file.
       *
       * She wanted to be in Portu Vech - the flood that took her family's records is the
       * flood that left the tide line on Mirela's wall, and having them share a town said
       * that in one stroke. Two signals in one town is one dot you cannot click. So the
       * water stayed in the story and the pin moved, exactly as it did for Tomas.
       */
      id: ILEANA_SIGNAL,
      latitude: 36.1,
      longitude: 17.4,
      name: 'Ileana Marku',
      label: 'There is nobody left who knows.',
      // Arrives once Mirela's request is closed.
      state: SignalState.Dormant,
      hidden: true,
    },
    {
      id: TOMAS_SIGNAL,
      /**
       * Up the coast from his sister, not next door to her.
       *
       * They were 0.7 degrees apart, which on a whole-globe view is the same pixel - the
       * two points drew on top of each other and only one could be reached. Geography had
       * to give, because a globe you cannot click is worse than a headland that is a
       * drive rather than a walk from the town.
       *
       * His dialogue moved with it: he no longer says she is down the hill.
       */
      latitude: 51.4,
      longitude: 41.8,
      name: 'Tomas Vasc',
      label: 'The harbour light keeps going out.',
      // Appears once Mirela's request resolves - because that is what caused it.
      state: SignalState.Dormant,
      hidden: true,
    },
    {
      /**
       * Inland and well clear of the coast the other four share, because five points in
       * one bay is one point on a whole-globe view - a lesson this file has now learned
       * three times.
       */
      id: VASILE_SIGNAL,
      latitude: 40.4,
      longitude: -3.7,
      name: 'Vasile Crâstea',
      label: 'The pump is running and nothing is coming out.',
      state: SignalState.Dormant,
      hidden: true,
    },
    // Tease. §52: do not reveal everything, make them curious enough to look.
    //
    // There used to be a second one, in Tokyo. Ileana took its place rather than joining
    // it, because §96 caps the nameable signals at five and a globe that quietly holds
    // six is a globe where one of them is furniture.
    {
      /**
       * Was a tease, and is now a request. The globe promised her from the first frame of
       * the game, which is the best possible way for a third contact to arrive: not as a
       * new name, but as one the player has already been ignoring.
       */
      id: ADAEZE_SIGNAL,
      latitude: 6.5,
      longitude: 3.4,
      name: 'Adaeze Okafor',
      label: 'Lagos - seedlings failing.',
      // Appears once Tomas is settled. Three requests at once would make the slice a
      // queue rather than a choice.
      state: SignalState.Dormant,
      hidden: true,
    },
    // §169: an origin that should not exist. Visible for a few frames in every hundred,
    // never openable, never explained. Most players will not notice it. That is correct.
    {
      id: 'anomaly',
      latitude: 12.0,
      longitude: -80.0,
      name: '',
      label: 'Unknown source.',
      state: SignalState.Unknown,
      hidden: true,
    },
  ];
}
