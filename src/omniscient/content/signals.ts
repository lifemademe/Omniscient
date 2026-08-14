/**
 * The globe's signals.
 *
 * Two are real requests. The rest are §52's tease - the globe should always look like
 * humanity needs more than OMNISCIENT_ can answer, and a judge should be able to see
 * that the world extends past the slice. One of them is not a request at all (§169).
 */

import { SignalState } from '../crt/GlobeView.js';

import type { Signal } from '../crt/GlobeView.js';

/** Signal ids that map to authored missions, in queue order. */
export const MIRELA_SIGNAL = 'mirela';
export const TOMAS_SIGNAL = 'tomas';
export const ADAEZE_SIGNAL = 'adaeze';

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
    },
    // Teases. §52: do not reveal everything, make them curious enough to look.
    {
      id: 'tease-tokyo',
      latitude: 35.7,
      longitude: 139.7,
      name: 'Unknown caller',
      label: 'Tokyo - signal weak.',
      state: SignalState.Waiting,
    },
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
    },
    {
      id: 'tease-toronto',
      latitude: 43.7,
      longitude: -79.4,
      name: 'R. Lindqvist',
      label: '"This is embarrassing..."',
      // Demonstrates §31: this one was attempted and went wrong.
      state: SignalState.Cooldown,
      cooldown: 95,
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
    },
  ];
}
