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
 * The one signal that is not a person, and when it is allowed to exist.
 *
 * It used to be revealed after the first request, as a quiet §52 tease sitting on the
 * globe for the whole game. It is the FINALE now: hidden until every request is resolved,
 * and revealed by the rig in the beat after the machine's final transmission - the ending
 * says "somebody will call", and this is the something that does. As a tease it was
 * furniture; as the last image of the game it recontextualises, which is what an ending
 * image is for.
 *
 * (An earlier tease - a fake failed request in Toronto - died for §96's five-signal cap.
 * The anomaly earns its slot by being the only point that is not answerable.)
 */
export const ANOMALY_SIGNAL = 'anomaly';
export const WAREHOUSE_SIGNAL = 'warehouse-07';

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
 * The one contact that is not a request and not a person.
 *
 * Kept out of the campaign queue on purpose - it has no beats, no dialogue and no contact
 * card, because opening it does not start a conversation. It starts M4SS. See
 * OmniscientRig.openSignal, which intercepts this id before the queue lookup.
 */
export const M4SS_SIGNAL = 'm4ss';

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
      resolvedLabel: 'Harbour light stabilised.',
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
    /**
     * A station, and the only signal on this globe that is not on land.
     *
     * Everything else here is somebody in a town, and this file has bent geography four
     * times to keep those clickable and ashore - there is a point-in-polygon check against
     * COASTLINES precisely because a pin in the middle of an ocean is a bug. This one is in
     * the middle of an ocean deliberately, which is why it is called out here rather than
     * quietly slipped into the list.
     *
     * 150W 20S is the most isolated point available on this map: 69 degrees of open water to
     * the nearest other signal, in the gap the seven named people leave behind them. A player
     * turning the globe past the last continent finds one light a long way from anywhere,
     * which is the entire pitch for what is inside it. It is also unreachable by any of the
     * reasoning the rest of the game teaches - nobody drove there, nobody's neighbour saw
     * anything - and that is the point too.
     *
     * There IS somebody on the other end, and her name is the first thing about this signal
     * that is out of place. Seven Romanian names and a Nigerian one share this globe; the
     * eighth is an American at a station in the middle of the Pacific, which tells the player
     * where she is not from before she says a word. M4SS is not her name. It is what she
     * called the thing she is watching.
     */
    {
      id: M4SS_SIGNAL,
      latitude: -20.0,
      longitude: -150.0,
      name: 'Dana Keller',
      label: 'Specimen is outside containment.',
      state: SignalState.Dormant,
      hidden: true,
    },
    /**
     * §169: an origin that should not exist, and it is not on the planet.
     *
     * It used to sit in South America with no name, blinking a little slower than everything
     * else - and that is all the strangeness it had, which is a detail almost nobody
     * registers. Off the sphere it needs no explaining: there is a world, and there is
     * something beside it. The latitude and longitude stay because the type wants them and
     * because they are what it would read as if anybody ever put it back.
     *
     * Named now, too. "UNKNOWN" against seven people's names is the whole point - every
     * other signal on the globe is somebody, and this one is a gap where a name goes.
     */
    {
      id: 'anomaly',
      latitude: -11.5,
      longitude: -57.0,
      offworld: true,
      name: 'UNKNOWN',
      label: 'Origin does not resolve.',
      state: SignalState.Unknown,
      hidden: true,
      interaction: 'trace',
      actionLabel: 'Trace',
      projectionLabel: 'PROJECTION −11.5 / −57.0',
    },
    {
      id: WAREHOUSE_SIGNAL,
      latitude: -11.5,
      longitude: -57.0,
      name: 'WAREHOUSE 07',
      label: 'Remote logistics annex. Status: operating.',
      // Temporary early-access path: keep the bonus mission beside Mirela while it is
      // being playtested. The archive gate still controls the anomaly/finale reveal.
      state: SignalState.Waiting,
      hidden: false,
      interaction: 'enter',
      actionLabel: 'Enter',
    },
  ];
}
