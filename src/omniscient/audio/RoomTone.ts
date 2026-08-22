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

interface Bed {
  /** Steady tones, as [frequency, gain, type]. */
  tones: Array<[number, number, OscillatorType]>;
  /** Filtered noise: [cutoff Hz, Q, gain]. */
  air: [number, number, number] | null;
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
const BEDS: Record<string, Bed> = {
  /**
   * The workshop. Mains hum and the sea outside.
   *
   * 50Hz because this is Europe and because a repair shop is full of transformers. The air
   * is broad and slowly opening and closing, which is weather against a window rather than
   * a room with a fan in it.
   */
  'scene-repair-shop': {
    tones: [
      [50, 0.028, 'sine'],
      [100, 0.008, 'sine'],
    ],
    air: [420, 0.6, 0.02],
    drift: [260, 13],
  },

  /** A cleared house. Emptier than it should be - almost nothing, and a little wind. */
  'scene-cleared-house': {
    tones: [[62, 0.014, 'sine']],
    air: [300, 0.7, 0.016],
    drift: [180, 17],
  },

  /**
   * The mast. Wind with something metal in it.
   *
   * The 190Hz triangle is the guy wire. It is the only bed with a tone above the bass range,
   * because it is the only place where the structure itself is singing.
   */
  'scene-beacon-mast': {
    tones: [
      [44, 0.02, 'sine'],
      [190, 0.006, 'triangle'],
    ],
    air: [700, 1.4, 0.026],
    drift: [480, 9],
  },

  /**
   * The tunnel. Small, hard and close.
   *
   * High Q on a low cutoff is what a narrow space does to noise - it picks a frequency and
   * rings on it. The drift is slow and shallow, because nothing down there moves much.
   */
  'scene-seedling-tunnel': {
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
    tones: [
      [34, 0.026, 'sine'],
      [51, 0.01, 'sine'],
    ],
    air: [240, 2.2, 0.03],
    drift: [150, 5.5],
  },

  /** A door at night. Cold, open, and quiet enough that the conversation carries it. */
  'scene-night-door': {
    tones: [[46, 0.016, 'sine']],
    air: [520, 0.8, 0.018],
    drift: [300, 15],
  },

  /** A road by a mill. Open air, and the low water-driven thump of the wheel. */
  'scene-mill-road': {
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
    tones: [
      [50, 0.02, 'sine'],
      [15700, 0.0022, 'sine'],
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

  return {
    gain,
    stop: () => {
      for (const stop of stops) stop();
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
