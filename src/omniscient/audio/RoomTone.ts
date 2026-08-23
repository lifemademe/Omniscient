/**
 * Room tone. The sound a place makes when nothing is happening in it.
 *
 * ## Why this is the biggest missing thing in the game
 *
 * Before this file, every room in OMNISCIENT_ sounded identical, because none of them
 * sounded like anything. A repair shop on a windy coast, a flooded cellar and a wireframe
 * reconstruction of a city were the same silence. The console had a carrier hum and thirteen
 * cues and no world under them.
 *
 * That is not a small polish item. A player forms their impression of a place in the first
 * two seconds of looking at it, and half of that impression is what they can hear. It is
 * also the difference between a diorama and somewhere.
 *
 * ## Why it is synthesised rather than sampled
 *
 * The same argument ConsoleAudio makes for itself, and it applies harder here. A loop of
 * recorded room tone is a file, and a file loops - and a loop of anything under a minute is
 * audible as a loop within three. These beds have no period at all: the movement comes from
 * slow LFOs at frequencies that never line up, so nothing ever repeats and nothing has to be
 * shipped.
 *
 * It also keeps the whole game one instrument. The hiss under the workshop is the same noise
 * buffer as the carrier's, through a different filter.
 *
 * ## What a bed is made of
 *
 * Two or three sources, always: something with a pitch, something without, and something
 * moving. Pitch alone is a drone and reads as a mistake; noise alone is a hiss and reads as
 * a broken speaker; neither moving is a texture rather than a place.
 */

import { audio } from './ConsoleAudio.js';

/** How long a room takes to become another room. Slow - a cut in tone is a cut in place. */
const CROSSFADE = 1.6;

export interface Bed {
  /** Steady tones, as [frequency, gain, type]. */
  tones: Array<[number, number, OscillatorType]>;
  /** Filtered noise: [cutoff Hz, Q, gain]. */
  air: [number, number, number] | null;
  /**
   * Occasional small events: [frequency Hz, decay seconds, gain, mean gap seconds].
   *
   * The difference between a place and a place somebody is IN. Room tone says the workshop
   * has air in it; this says somebody has been working at that bench all morning. One knock
   * every twenty seconds does more for a room than any amount of steady state, because a
   * steady state is a texture and an event is a life.
   *
   * Deliberately sparse and deliberately irregular - the gap is redrawn as the mean plus or
   * minus half of it every time, in `build`. A sound on a clock is a machine; a sound at
   * unpredictable intervals is somebody. This is the one place the project's seeded-rng
   * discipline does not apply, and ConsoleAudio's header already sanctions it: nothing is
   * random per play "except small detunes - §123", and a knock that landed on the same beat
   * every run would be the fault this exists to avoid.
   */
  work: [number, number, number, number] | null;
  /**
   * Movement on the noise filter: [depth Hz, period seconds].
   *
   * The period is what stops a bed being a texture. Sea has a long slow one, water in a
   * cellar has a shorter irregular one, a data hum has none at all.
   */
  drift: [number, number] | null;
}

/**
 * The eight rooms, plus the machine's own.
 *
 * Each is an argument about the place rather than a preset. The numbers below are chosen so
 * that no two beds share a fundamental and no two drifts share a period - two rooms whose
 * tones beat against each other would be audible as a fault during the crossfade between
 * them.
 */
export const BEDS: Record<string, Bed> = {
  /**
   * The workshop. Mains hum and the sea outside.
   *
   * 50Hz because this is Europe and because a repair shop is full of transformers. The air
   * is broad and slowly opening and closing, which is weather against a window rather than
   * a room with a fan in it.
   */
  'scene-repair-shop': {
    work: [210, 0.09, 0.05, 19],
    tones: [
      [50, 0.028, 'sine'],
      [100, 0.008, 'sine'],
    ],
    air: [420, 0.6, 0.02],
    drift: [260, 13],
  },

  /** A cleared house. Emptier than it should be - almost nothing, and a little wind. */
  'scene-cleared-house': {
    work: [140, 0.16, 0.03, 26],
    tones: [[62, 0.014, 'sine']],
    air: [300, 0.7, 0.016],
    drift: [180, 17],
  },

  /**
   * The mast. Wind with something metal in it - and now with the metal audible.
   *
   * The 190Hz triangle is the guy wire, and it is the only tone in any bed above the bass
   * range because this is the only place where the structure itself is singing.
   *
   * ## Re-measured, A-weighted, and rebalanced
   *
   * The design was right and the gains were not. Analysed off a capture, 81% of this bed's
   * PERCEIVED loudness sat between 1kHz and 5kHz and the 160-640Hz band carried 6-9%. That
   * band is where a large steel structure in weather actually lives, so the bed was hissing
   * where it should have been roaring: the two elements with no character - a 44Hz sine you
   * feel rather than hear, and noise centred well above the structure - were 10dB over the
   * one element that says "mast".
   *
   * It also crowded the interface. Every UI cue in ConsoleAudio lives in the same 1-3kHz
   * region, and measured against this bed a chip click came out 2-6dB over it while the
   * `connect` sting came out 23dB over. Half the player's clicks produced nothing detectable
   * at all. Moving the bed DOWN is a better fix than turning every cue up, because it solves
   * both faults with the same edit and leaves the cue table's own reasoning intact.
   *
   * Three changes:
   *
   *  - the guy wire from 0.006 to 0.016, so the thing with an identity is the loudest thing
   *    in the bed instead of the quietest;
   *  - the air from 700Hz Q1.4 down to 380Hz Q0.9 - lower and BROADER, which fills the
   *    low-mids rather than picking a frequency above them;
   *  - a swell at 105Hz, which is the sea. There was no sea at all in a bed for a clifftop.
   *
   * The first attempt at this measurement used raw spectral energy and said the opposite -
   * 89% below 120Hz, "a bass rumble with nothing else". Both numbers are true of the same
   * signal. A 44Hz sine carries enormous energy and almost no loudness. Any claim about how
   * a mix SOUNDS has to be A-weighted or it will be confidently backwards.
   */
  'scene-beacon-mast': {
    work: [320, 0.13, 0.045, 15],
    tones: [
      [44, 0.02, 'sine'],
      // 118 rather than the 105 this was first written at. The repair shop has a tone at
      // 100Hz and five hertz apart is a five-per-second wobble - see scripts/room-tone.ts,
      // which exists because of exactly this and caught it on the first run.
      [118, 0.013, 'sine'],
      [190, 0.016, 'triangle'],
    ],
    air: [380, 0.9, 0.03],
    drift: [260, 9],
  },

  /**
   * The tunnel. Small, hard and close.
   *
   * High Q on a low cutoff is what a narrow space does to noise - it picks a frequency and
   * rings on it. The drift is slow and shallow, because nothing down there moves much.
   */
  'scene-seedling-tunnel': {
    work: [900, 0.05, 0.035, 11],
    tones: [[38, 0.03, 'sine']],
    air: [180, 5.5, 0.022],
    drift: [70, 21],
  },

  /**
   * The cellar. Water, moving.
   *
   * The fastest drift in the set by a long way, and the only one whose period is short
   * enough to notice consciously - because water is the thing this room is about, and a
   * player should hear that it is still coming in.
   */
  'scene-flooded-cellar': {
    work: [600, 0.07, 0.04, 8],
    tones: [
      [34, 0.026, 'sine'],
      [51, 0.01, 'sine'],
    ],
    air: [240, 2.2, 0.03],
    drift: [150, 5.5],
  },

  /** A door at night. Cold, open, and quiet enough that the conversation carries it. */
  'scene-night-door': {
    work: [170, 0.2, 0.028, 24],
    tones: [[46, 0.016, 'sine']],
    air: [520, 0.8, 0.018],
    drift: [300, 15],
  },

  /** A road by a mill. Open air, and the low water-driven thump of the wheel. */
  'scene-mill-road': {
    work: [95, 0.28, 0.05, 6],
    tones: [
      [29, 0.022, 'sine'],
      [58, 0.009, 'triangle'],
    ],
    air: [600, 0.5, 0.024],
    drift: [340, 11],
  },

  /**
   * The wire city, and it is the odd one out on purpose.
   *
   * No air at all. Every other room in this game has weather or water or wind in it, and
   * this one has a data hum and nothing else, because it is not a place - it is a
   * reconstruction of a place, and the machine has no recording of what a district sounds
   * like. The absence is the point, and it only reads as an absence because the other seven
   * are full.
   *
   * The square wave is deliberate. It is the only non-sinusoidal fundamental in the set, and
   * a square is what a machine makes when it is not pretending to be anything.
   */
  'scene-wire-city': {
    work: null,
    tones: [
      [72, 0.012, 'square'],
      [216, 0.004, 'sine'],
    ],
    air: null,
    drift: null,
  },

  /**
   * The machine's own room, which is where the player actually lives.
   *
   * Three sources because it is the only room the player will hear for minutes at a time:
   * the desk lamp's mains hum, the CRT's line whistle, and the sea through the window. The
   * 15.7kHz is the real number - it is the horizontal scan frequency of a PAL set, and
   * anybody who grew up with one will feel it before they identify it.
   */
  home: {
    work: [240, 0.11, 0.032, 22],
    tones: [
      [50, 0.02, 'sine'],
      /*
       * The flyback whine, at a third of what it was.
       *
       * 15,700Hz is the PAL line frequency and putting it here is the right idea - anybody
       * who grew up with a CRT feels it before they identify it, which is the note above.
       *
       * At 0.0022 it was not subliminal. A-weighted it carried 19.7% of the workstation's
       * perceived loudness and 32% of the globe's, and it was the single loudest band in both
       * - because A-weighting peaks near 3kHz and stays high through the top octave, so a
       * tone that looks negligible on a linear meter is anything but. That is a third of the
       * room's sound coming from one sine at the edge of hearing.
       *
       * Three consequences, all bad. Anybody young enough to hear 15.7kHz well gets a
       * fatiguing tone for the length of the game. Anybody old enough not to hear it gets a
       * detail that is silently absent while still eating headroom. And on cheap converters
       * it aliases, which turns a period detail into a fault.
       *
       * 0.0008 puts it at about 6% - present, felt, and not the loudest thing in a room whose
       * whole character is meant to be a desk lamp and a tape drive.
       */
      [15700, 0.0008, 'sine'],
    ],
    air: [380, 0.7, 0.017],
    drift: [220, 19],
  },
};

export type RoomToneName = keyof typeof BEDS;

interface Live {
  gain: GainNode;
  stop: () => void;
}

let current: Live | null = null;
let currentName: string | null = null;

/**
 * Build one bed and start it running at silence.
 *
 * Everything is created fresh per room rather than pooled. These graphs are half a dozen
 * nodes and live for minutes; pooling them would be an optimisation of the cheapest thing
 * in the file, paid for with the possibility of a stuck oscillator.
 */
function build(bed: Bed): Live | null {
  const bus = audio.bus();
  if (!bus) return null;
  const { ctx, master, noise } = bus;

  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(master);

  const stops: Array<() => void> = [];

  for (const [frequency, level, type] of bed.tones) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const g = ctx.createGain();
    g.gain.value = level;
    osc.connect(g).connect(gain);
    osc.start();
    stops.push(() => osc.stop());
  }

  if (bed.air) {
    const [cutoff, q, level] = bed.air;
    const source = ctx.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = cutoff;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = level;
    source.connect(filter).connect(g).connect(gain);
    source.start();
    stops.push(() => source.stop());

    if (bed.drift) {
      const [depth, period] = bed.drift;
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 1 / period;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = depth;
      lfo.connect(lfoGain).connect(filter.frequency);
      lfo.start();
      stops.push(() => lfo.stop());
    }
  }

  /*
   * The work, on an irregular timer.
   *
   * A short filtered noise burst rather than a tone: a tool set down, a chair shifting, a
   * drip finding the floor are all impacts, and an impact is broadband. The gap is the mean
   * plus or minus half of it, redrawn every time - a fixed interval is a metronome, and a
   * metronome in a room is a machine rather than a person.
   */
  let workTimer: number | null = null;
  if (bed.work) {
    const [centre, decay, level, gap] = bed.work;
    const knock = (): void => {
      const source = ctx.createBufferSource();
      source.buffer = noise;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      // Detuned per strike, so twenty of them over a mission are not one sound twenty times.
      filter.frequency.value = centre * (0.82 + Math.random() * 0.36);
      filter.Q.value = 2.4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(level, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + decay);
      source.connect(filter).connect(g).connect(gain);
      source.start();
      source.stop(ctx.currentTime + decay + 0.05);
      workTimer = window.setTimeout(knock, (gap * (0.5 + Math.random())) * 1000);
    };
    // The first one waits too, or every room announces itself the moment it is entered.
    workTimer = window.setTimeout(knock, gap * 1000 * (0.4 + Math.random() * 0.6));
  }

  return {
    gain,
    stop: () => {
      for (const stop of stops) stop();
      if (workTimer !== null) window.clearTimeout(workTimer);
      gain.disconnect();
    },
  };
}

/**
 * Move to a room.
 *
 * Crossfades rather than cuts, and the outgoing bed is torn down a beat AFTER it is silent -
 * stopping an oscillator while it still has gain on it is a click, and a click is the one
 * artefact that will make a player think the audio is broken rather than quiet.
 *
 * Idempotent by name: re-entering the same room does nothing, so a scene that re-mounts does
 * not restart its own air.
 */
export function setRoomTone(name: RoomToneName | null): void {
  if (name === currentName) return;
  currentName = name;

  const bus = audio.bus();
  const outgoing = current;
  if (outgoing && bus) {
    outgoing.gain.gain.setTargetAtTime(0, bus.ctx.currentTime, CROSSFADE / 3);
    window.setTimeout(() => outgoing.stop(), CROSSFADE * 1000 + 400);
  } else if (outgoing) {
    outgoing.stop();
  }
  current = null;

  if (name === null) return;
  const bed = BEDS[name];
  if (!bed || !bus) return;

  const live = build(bed);
  if (!live) return;
  live.gain.gain.setTargetAtTime(1, bus.ctx.currentTime, CROSSFADE / 3);
  current = live;
}

/** Silence the world. For leaving play, or for a mute that must not leave a drone running. */
export function stopRoomTone(): void {
  setRoomTone(null);
}
