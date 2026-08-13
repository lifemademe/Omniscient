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
      latitude: 44.9,
      longitude: 29.4,
      name: 'Tomas Vasc',
      label: 'Harbour beacon - intermittent.',
      // Appears once Mirela's request resolves - because that is what caused it.
      state: SignalState.Resolved,
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
      id: 'tease-lagos',
      latitude: 6.5,
      longitude: 3.4,
      name: 'Adaeze O.',
      label: 'Lagos - urgent.',
      state: SignalState.Waiting,
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
