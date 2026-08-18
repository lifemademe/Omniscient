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
export const DORIN_SIGNAL = 'dorin';
export const SANDA_SIGNAL = 'sanda';
export const LUCIAN_SIGNAL = 'lucian';

/**
 * §96 caps conscious attention at five. The globe honours that: five nameable people at
 * a time, plus the anomaly, which is not a person and cannot be answered.
 *
 * ## Where they are, and why it is not where they live
 *
 * The pins used to sit inside 122 degrees of longitude, and the seven named people inside
 * 54 of it - a single wedge, with 238 degrees of empty planet behind them. That was fine
 * while the globe only ever showed one face; it is not fine now that it turns all the way
 * round, because most of a revolution had nothing on it.
 *
 * They span 224 degrees now, across four landmasses, with no two closer than 12 degrees.
 * Checked against COASTLINES by point-in-polygon rather than by eye - a marker in the
 * middle of an ocean is a bug you only notice from one angle.
 *
 * This file has bent geography for legibility three times already, and each of those notes
 * is still below. This is the fourth and the largest: the towns in the story have not
 * moved, and the location strings on the contacts are unchanged. What moved is where
 * OMNISCIENT_ draws them, which is a schematic on a 192x144 CRT and never was a survey -
 * a globe you cannot click is worse than a headland in the wrong hemisphere.
 *
 * Mirela and Tomas stay neighbours, because they are family and share a town. Adaeze stays
 * on Lagos, because that one is real and the label says so.
 */
export function createSignals(): Signal[] {
  return [
    {
      id: MIRELA_SIGNAL,
      latitude: 44.2,
      longitude: 26.0,
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
      latitude: 41.5,
      longitude: 61.0,
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
      latitude: 50.4,
      longitude: 38.0,
      name: 'Tomas Vasc',
      label: 'The harbour light keeps going out.',
      // Appears once Mirela's request resolves - because that is what caused it.
      state: SignalState.Dormant,
      hidden: true,
    },
    {
      /**
       * Inland and well clear of the coast the others share, because five points in one
       * bay is one point on a whole-globe view - a lesson this file has now learned four
       * times. See the note at the top for the fourth and largest.
       */
      id: VASILE_SIGNAL,
      latitude: 35.5,
      longitude: 95.0,
      name: 'Vasile Crâstea',
      label: 'The pump is running and nothing is coming out.',
      state: SignalState.Dormant,
      hidden: true,
    },
    {
      /**
       * North and inland, clear of the other five. Six signals now share this globe and
       * the spacing check in preview-callback is the only reason none of them collide -
       * it has caught this three times.
       */
      id: DORIN_SIGNAL,
      latitude: 43.5,
      longitude: 127.0,
      name: 'Dorin Apostol',
      label: 'She always picks up.',
      state: SignalState.Dormant,
      hidden: true,
    },
    {
      /** South and west of everything else, clear of the other six. */
      id: SANDA_SIGNAL,
      latitude: 39.5,
      longitude: -97.0,
      name: 'Sanda Petrescu',
      label: 'There is a man behind me.',
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
    {
      /**
       * Lucian, who had a contact, a mission, a model and no signal.
       *
       * ## The eighth request could not be started
       *
       * `LUCIAN_SIGNAL` was exported from this file and never used. The campaign queue
       * offers his request like any other - `topUpGlobe` advances past it and adds 'lucian'
       * to `openable` - and then `setSignalState` looks for a signal with that id, finds
       * nothing, and returns. Silently. So the final mission of the game was offered,
       * marked answerable, and never drawn on the globe, which is the only place it can be
       * clicked.
       *
       * Reported as simply not seeing it, which is exactly what it looked like from
       * outside: nothing failed, nothing warned, the count in the panel was right. That
       * silent `return` now warns, and preview-stuck holds every queued mission to having a
       * signal to arrive on.
       *
       * ## Why he is on his own continent
       *
       * The one request that is not somebody asking for help. Seven people have trusted the
       * machine with a problem and the eighth arrival is a policeman who has been given a
       * terminal - so he comes from the emptiest part of the globe, a long way from the
       * coast the rest of them share, and the player watches him come round.
       */
      id: LUCIAN_SIGNAL,
      latitude: -25.0,
      longitude: 141.0,
      name: 'Lucian Barbu',
      label: 'District 07 - routine audit.',
      // Last, and only after Sanda. See the queue in OmniscientRig.
      state: SignalState.Dormant,
      hidden: true,
    },
    // §169: an origin that should not exist. Visible for a few frames in every hundred,
    // never openable, never explained. Most players will not notice it. That is correct.
    {
      id: 'anomaly',
      latitude: -11.5,
      longitude: -57.0,
      name: '',
      label: 'Unknown source.',
      state: SignalState.Unknown,
      hidden: true,
    },
  ];
}
