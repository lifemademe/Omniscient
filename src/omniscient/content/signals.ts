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

export function createSignals(): Signal[] {
  return [
    {
      id: MIRELA_SIGNAL,
      latitude: 44.2,
      longitude: 28.6,
      label: 'PORTU VECH - "it worked yesterday"',
      state: SignalState.Waiting,
    },
    {
      id: TOMAS_SIGNAL,
      latitude: 44.3,
      longitude: 28.7,
      label: 'PORTU VECH - HARBOUR BEACON - INTERMITTENT',
      // Appears once Mirela's request resolves - because that is what caused it.
      state: SignalState.Resolved,
    },
    // Teases. §52: do not reveal everything, make them curious enough to look.
    {
      id: 'tease-tokyo',
      latitude: 35.7,
      longitude: 139.7,
      label: 'TOKYO - UNKNOWN SIGNAL',
      state: SignalState.Waiting,
    },
    {
      id: 'tease-lagos',
      latitude: 6.5,
      longitude: 3.4,
      label: 'LAGOS - URGENT',
      state: SignalState.Waiting,
    },
    {
      id: 'tease-toronto',
      latitude: 43.7,
      longitude: -79.4,
      label: 'TORONTO - "this is embarrassing..."',
      state: SignalState.Waiting,
    },
    // §169: an origin that should not exist. Visible for a few frames in every hundred,
    // never openable, never explained. Most players will not notice it. That is correct.
    {
      id: 'anomaly',
      latitude: 12.0,
      longitude: -80.0,
      label: 'UNKNOWN SOURCE',
      state: SignalState.Unknown,
    },
  ];
}
