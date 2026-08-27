/**
 * The specimen's voice, synthesised - the second instrument, not a second radio.
 *
 * ## Where it sits
 *
 * ConsoleAudio's design doc calls for ONE INSTRUMENT, and it is right about the console:
 * the valve set with its carrier, squelch and keyer is the machine the player sits at.
 * M4SS is not that machine - it is a wet creature in a containment feed - and giving it
 * the console's blips would say "user interface" every time a living thing moved.
 *
 * So this is a sibling instrument on the SAME plumbing: it borrows the AudioContext, the
 * seeded noise bed and the master ceiling through `audio.bus()`, and brings only its own
 * cue table and one filter. Two AudioContexts is two carriers beating against each other -
 * ConsoleAudio's comment, and the reason this file cannot own its context is the reason it
 * exists at all.
 *
 * ## The character
 *
 * Everything alive is LOW and WET: bandpassed noise under 900Hz with a downward pitch
 * bend, which is as close as three oscillator parameters get to "moist". Everything the
 * LEVEL does - buttons, gates, presses - is dry, clicky and mid-band, the same physical
 * family as the console's `seat`. The two must never swap: a wet button reads as the slime
 * pressing itself, a clicky slime reads as a machine wearing a costume.
 *
 * ## Slow motion is heard, not just seen
 *
 * Every slime cue routes through one lowpass filter, and the fling's slow motion sweeps
 * its cutoff down to a muffle and back. This is the trick that sells the effect - the
 * timescale change says "slower", the filter says "underwater, held breath, HELD" - and
 * it costs one BiquadFilter. The level cues bypass the filter: time is slowing around the
 * creature, and the room it is in does not get the courtesy.
 *
 * Same rules as the console: one ceiling nothing bypasses, nothing longer than a second,
 * nothing random per-play.
 */

import { audio } from '../omniscient/audio/ConsoleAudio.js';
import { emitSoundCaption } from '../omniscient/accessibility/SoundCaptions.js';

import type { SoundCaptionEvent } from '../omniscient/accessibility/SoundCaptions.js';

export type SlimeCue =
  /** The tendril takes hold. The octopus grabs. */
  | 'latch'
  /** The rope let go on purpose. The fling. */
  | 'release'
  /** The tendril tore - an over-reach, mass lost. */
  | 'snap'
  /** The body divides. */
  | 'split'
  /** Q - calling the shed mass home. */
  | 'recall'
  /** Loose mass rejoins the body. */
  | 'absorb'
  /** A floor button goes down. */
  | 'button'
  /** The heavy button, hit hard enough. The one THUD in the game. */
  | 'heavy'
  /** A lift gate slides up. */
  | 'gate'
  /** The drawbridge falls and lands. */
  | 'bridge'
  /** A press caught some of the body. */
  | 'crush'
  /** The portal takes the specimen. */
  | 'portal'
  /** The final chamber seals around an empty room. */
  | 'contained'
  /** The body lands from a real fall. */
  | 'land'
  /** The updraught takes hold and the body starts to rise. */
  | 'draught'
  /** The column is there and the body is too heavy for it. */
  | 'refused';

interface Voice {
  hz: number | null;
  to?: number;
  length: number;
  level: number;
  type?: OscillatorType;
  band?: number;
  /** Bandpass Q for noise voices - wet sounds want it low, clicks want it high. */
  q?: number;
  delay?: number;
  /** True to skip the slow-motion filter - the room's sounds, not the creature's. */
  dry?: boolean;
}

/**
 * The whole voice, as a table, pitched to stay out of the console's way: the valve set
 * lives at 380-760 sine and 1.2-2.6k noise, so the slime takes under 350 and the level
 * takes 500-1100 noise. When both instruments speak at once - latching mid-conversation
 * beat, say - they read as two sources, not as one confused one.
 */
const CUES: Record<SlimeCue, Voice[]> = {
  latch: [
    { hz: null, band: 640, q: 0.9, length: 0.07, level: 0.5 },
    { hz: 210, to: 150, length: 0.12, level: 0.2, type: 'sine', delay: 0.02 },
  ],
  release: [{ hz: 165, to: 245, length: 0.11, level: 0.16, type: 'sine' }],
  // The tear is the failure sound, so it is the least pleasant thing in the table: a
  // sawtooth dropping through its own octave under a burst of low noise.
  snap: [
    { hz: null, band: 480, q: 0.7, length: 0.12, level: 0.55 },
    { hz: 190, to: 95, length: 0.2, level: 0.16, type: 'sawtooth', delay: 0.03 },
  ],
  split: [
    { hz: null, band: 560, q: 0.8, length: 0.09, level: 0.5 },
    { hz: 240, to: 130, length: 0.16, level: 0.17, type: 'sine', delay: 0.04 },
  ],
  recall: [{ hz: 130, to: 200, length: 0.14, level: 0.12, type: 'sine' }],
  // Barely there, like the keyer: it can fire dozens of times as a lump comes home a few
  // grams at a time, and a proud sound heard forty times is a muted game.
  absorb: [{ hz: null, band: 700, q: 1.2, length: 0.03, level: 0.22 }],
  button: [{ hz: null, band: 950, q: 4, length: 0.05, level: 0.5, dry: true }],
  // The only cue allowed near the bottom of the spectrum at full length: the door is
  // heavy, and the sound is the proof the speed requirement existed.
  heavy: [
    { hz: null, band: 500, q: 2, length: 0.06, level: 0.65, dry: true },
    { hz: 70, to: 45, length: 0.5, level: 0.3, type: 'sine', delay: 0.02, dry: true },
  ],
  gate: [
    { hz: null, band: 620, q: 1.5, length: 0.4, level: 0.28, dry: true },
    { hz: 110, to: 140, length: 0.4, level: 0.08, type: 'triangle', dry: true },
  ],
  bridge: [
    // The fall is a creak-sweep; the delayed thud is the landing. The gap between them is
    // the drawbridge's own eased quarter-turn, near enough.
    { hz: 180, to: 90, length: 0.5, level: 0.1, type: 'triangle', dry: true },
    { hz: null, band: 420, q: 1, length: 0.1, level: 0.6, delay: 0.55, dry: true },
    { hz: 60, to: 42, length: 0.35, level: 0.24, type: 'sine', delay: 0.55, dry: true },
  ],
  crush: [
    { hz: null, band: 520, q: 0.8, length: 0.13, level: 0.6 },
    { hz: 200, to: 90, length: 0.22, level: 0.16, type: 'sine', delay: 0.04 },
  ],
  // The one shimmer in the table - the only pleasant thing the level ever does, matching
  // `learn` on the console: an arrival is the machine gaining something too.
  portal: [
    { hz: 220, length: 0.14, level: 0.1, type: 'sine' },
    { hz: 330, length: 0.2, level: 0.09, type: 'sine', delay: 0.1 },
    { hz: 440, length: 0.42, level: 0.08, type: 'sine', delay: 0.22 },
  ],
  /*
   * Not a victory fanfare. The shimmer has already swallowed the specimen; this is the
   * room answering with a descending biological pulse and a dry station latch. It leaves
   * the empty chamber feeling secured rather than celebrated.
   */
  contained: [
    { hz: 196, to: 142, length: 0.46, level: 0.12, type: 'sine' },
    { hz: null, band: 720, q: 3.2, length: 0.07, level: 0.55, delay: 0.34, dry: true },
    { hz: 92, to: 68, length: 0.72, level: 0.11, type: 'triangle', delay: 0.3 },
  ],
  land: [{ hz: null, band: 540, q: 0.9, length: 0.06, level: 0.4 }],
  /*
   * The column, and it is the only RISING sound in the table.
   *
   * §9 marks "ride the column" thin with no sound at all, and everything else here either
   * falls in pitch or is a transient - a snap, a thud, a landing. Air lifting a body is the
   * one event in the game that goes UP and keeps going, so the noise band sweeps upward
   * across a long tail and a soft sine follows it. Low Q on the band because moving air is
   * broad; a tight Q would make it a whistle, which is a kettle rather than a draught.
   *
   * Quiet. It sits under the ride rather than announcing it: the player already knows they
   * are rising because the screen is moving, and the sound's job is to say that the AIR is
   * doing it rather than the rope.
   */
  draught: [
    { hz: null, band: 300, q: 0.6, length: 0.9, level: 0.16 },
    { hz: 150, to: 340, length: 0.85, level: 0.06, type: 'sine' },
  ],
  /*
   * The refusal, and it is deliberately the same voice failing rather than a different one.
   *
   * A body too heavy for the column is IN the draught and being denied by it - mass.ts
   * returns the column with a lift of zero precisely so that case can be told apart. So the
   * sound starts as the draught and gives up: the same band, a third of the length, and the
   * sine sags instead of climbing. It should read as the air trying and not managing, which
   * is exactly what the HUD line says in words.
   */
  refused: [
    { hz: null, band: 300, q: 0.6, length: 0.3, level: 0.13 },
    { hz: 170, to: 110, length: 0.34, level: 0.05, type: 'sine' },
  ],
};

const CAPTIONS: Readonly<Record<SlimeCue, SoundCaptionEvent>> = {
  draught: { text: 'updraught lifts the body', tier: 'all', kind: 'world', key: 'slime-draught' },
  refused: { text: 'updraught cannot lift this mass', tier: 'all', kind: 'world', key: 'slime-refused' },
  latch: { text: 'tendril grips anchor', tier: 'all', kind: 'world', key: 'slime-latch' },
  release: { text: 'tendril releases', tier: 'all', kind: 'world', key: 'slime-release' },
  snap: {
    text: 'tendril tears; mass lost',
    tier: 'gameplay',
    kind: 'warning',
    key: 'slime-snap',
  },
  split: { text: 'body mass separates', tier: 'gameplay', kind: 'world' },
  recall: { text: 'loose mass answers recall', tier: 'gameplay', kind: 'world' },
  absorb: { text: 'loose mass rejoins body', tier: 'all', kind: 'world', key: 'slime-absorb' },
  button: { text: 'floor switch clicks down', tier: 'gameplay', kind: 'world' },
  heavy: { text: 'heavy plate slams down', tier: 'gameplay', kind: 'world' },
  gate: { text: 'lift gate grinds upward', tier: 'gameplay', kind: 'world' },
  bridge: {
    text: 'drawbridge creaks, then lands',
    tier: 'gameplay',
    kind: 'world',
    durationMs: 3000,
  },
  crush: { text: 'press crushes body mass', tier: 'gameplay', kind: 'warning' },
  portal: { text: 'portal takes the specimen', tier: 'gameplay', kind: 'success' },
  contained: {
    text: 'containment chamber seals',
    tier: 'gameplay',
    kind: 'success',
    durationMs: 3200,
  },
  land: { text: 'body mass lands', tier: 'all', kind: 'world', key: 'slime-land' },
};

/** Cutoff fully open. Just under Nyquist-for-anything-audible; effectively bypass. */
const FILTER_OPEN = 16000;
/** Cutoff at full slow motion. Underwater, but the cues stay audible. */
const FILTER_HELD = 650;

export class SlimeAudio {
  private wet: BiquadFilterNode | null = null;
  private dry: GainNode | null = null;

  /**
   * Build the two routes on the shared bus, lazily - the bus does not exist until the
   * console's audio is unlocked by a user gesture, and M4SS can be mounted before that.
   */
  private route(): { ctx: AudioContext; noise: AudioBuffer } | null {
    const bus = audio.bus();
    if (!bus) return null;
    if (!this.wet || !this.dry) {
      const filter = bus.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = FILTER_OPEN;
      filter.Q.value = 0.4;
      filter.connect(bus.gameplay);
      this.wet = filter;

      const dry = bus.ctx.createGain();
      dry.gain.value = 1;
      dry.connect(bus.gameplay);
      this.dry = dry;
    }
    return { ctx: bus.ctx, noise: bus.noise };
  }

  /** Feed the slow-motion amount, 0..1, once per frame. Sweeps the creature's filter. */
  public setSlowmo(amount: number): void {
    const bus = audio.bus();
    if (!bus || !this.wet) return;
    // Exponential between the two cutoffs, so the sweep spends its time where hearing is.
    const target = FILTER_OPEN * (FILTER_HELD / FILTER_OPEN) ** Math.min(1, Math.max(0, amount));
    this.wet.frequency.setTargetAtTime(target, bus.ctx.currentTime, 0.06);
  }

  public play(cue: SlimeCue): void {
    emitSoundCaption(CAPTIONS[cue]);
    const route = this.route();
    if (!route) return;
    for (const voice of CUES[cue]) {
      this.voice(route.ctx, route.noise, voice);
    }
  }

  public dispose(): void {
    this.wet?.disconnect();
    this.dry?.disconnect();
    this.wet = null;
    this.dry = null;
  }

  // Same percussive envelope as the console's voice(): full level at once, exponential
  // decay. The only structural difference is the choice of output route per voice.
  private voice(ctx: AudioContext, noise: AudioBuffer, v: Voice): void {
    const out = v.dry ? this.dry : this.wet;
    if (!out) return;
    const at = ctx.currentTime + (v.delay ?? 0);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(v.level, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + v.length);
    gain.connect(out);

    if (v.hz === null) {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = v.band ?? 700;
      band.Q.value = v.q ?? 1.1;
      src.connect(band).connect(gain);
      src.start(at);
      src.stop(at + v.length);
      return;
    }

    const osc = ctx.createOscillator();
    osc.type = v.type ?? 'sine';
    osc.frequency.setValueAtTime(v.hz, at);
    if (v.to !== undefined && v.to !== v.hz) {
      osc.frequency.exponentialRampToValueAtTime(v.to, at + v.length);
    }
    osc.connect(gain);
    osc.start(at);
    osc.stop(at + v.length);
  }
}
