/**
 * The sound of a radio console, synthesised.
 *
 * ## Why there are no audio files
 *
 * Every other surface in this project is generated - the meshes, the decals, the textures
 * that were later thrown away, the noise on the CRT. Sound is the last thing that was not,
 * and shipping a folder of .wav files would be the one part of the game that could not be
 * tuned by changing a number. It would also be the wrong sound: what this game needs is
 * not a library of effects but ONE INSTRUMENT - a valve set with a carrier hum, a squelch
 * and a keyer - and an instrument is a small amount of code, not a large amount of data.
 *
 * ## What the sound is for
 *
 * OMNISCIENT_ has no body and no face. Every single thing the player learns arrives as
 * text in a box, and until now it arrived in complete silence, instantly, with no more
 * ceremony than a spreadsheet updating. The fiction is a machine listening to frightened
 * people over a bad link; the experience was a database returning rows.
 *
 * So the sound is doing narrative work, not decoration:
 *
 *   - The CARRIER is always there while a call is up, and its absence between calls is
 *     what makes a call feel like a connection to somewhere rather than a screen change.
 *   - The SQUELCH opening and closing brackets every request. It is the sound of somebody
 *     picking up.
 *   - A RECEIVE blip per incoming line says a person is speaking, one thought at a time.
 *   - The KEYER under the player's typing is the only thing in the game that responds to
 *     an individual keystroke, and it is what makes typing feel like transmitting.
 *
 * ## Rules this file keeps
 *
 * One master gain, so nothing can ever be louder than the ceiling. No sound longer than a
 * second except the carrier bed. Nothing is random per-play except small detunes - §123
 * applies to audio too, and a cue that sounds different every time reads as a glitch.
 */

/** Master ceiling. Everything is mixed under this and nothing may bypass it. */
const MASTER = 0.34;

/**
 * Where the player's volume choice is kept.
 *
 * A setting that does not survive the window closing is not a setting, it is a slider.
 * Volume in particular: somebody who turns a game down has decided something about it, and
 * asking them to decide again every launch is the kind of small rudeness that gets a game
 * muted permanently at the operating system instead.
 */
const VOLUME_KEY = 'omniscient.volume';

function storedVolume(): number {
  try {
    const raw = window.localStorage?.getItem(VOLUME_KEY);
    if (raw === null || raw === undefined) return 1;
    const value = Number(raw);
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
  } catch {
    // Private mode, a sandbox, a host that has no storage - none of which is a reason to
    // start silent or to crash on the way to the menu.
    return 1;
  }
}

/**
 * The named cues. Anything that makes a sound in this game makes one of these.
 *
 * A closed set on purpose: the alternative is call sites inventing frequencies, and within
 * a week the console has forty slightly different clicks and no character at all.
 */
export type Cue =
  /** A request opens. Squelch breaks, carrier comes up. */
  | 'connect'
  /** A request closes, for any reason. Carrier falls away. */
  | 'disconnect'
  /** One incoming line of speech. */
  | 'receive'
  /** The player sends. */
  | 'transmit'
  /** One keystroke in the transmit field. */
  | 'key'
  /** A suggestion chip, or any other soft UI commit. */
  | 'tap'
  /** A fact recorded - the tree grows. The only pleasant sound in the game. */
  | 'learn'
  /** A prop's certainty rises and the sweep crosses it. ART_DIRECTION §3. */
  | 'resolve'
  /** A device accepted a piece: a pin set, a pipe seated, a wire joined. */
  | 'seat'
  /** A device rejected a piece. */
  | 'reject'
  /** The request is solved. */
  | 'solved'
  /** The request failed. */
  | 'failed';

interface Voice {
  /** Oscillator frequency in Hz, or null for a noise burst. */
  hz: number | null;
  /** Frequency at the end of the sound, for a sweep. Defaults to `hz`. */
  to?: number;
  /** Seconds. */
  length: number;
  /** Peak gain, before the master. */
  level: number;
  type?: OscillatorType;
  /** Band-pass centre for noise, in Hz. */
  band?: number;
  /** Seconds to wait before starting - lets a cue be two sounds. */
  delay?: number;
}

/**
 * The whole sound design, as a table.
 *
 * Worth reading as one thing rather than as eleven: the pitches are deliberately related.
 * Everything the machine does is in the 380-760 range and sine-ish, everything mechanical
 * is filtered noise, and the two verdict cues are the only intervals in the game - a
 * rising fifth for solved and a falling tritone for failed, which is about as close to
 * "good" and "bad" as two tones can get without becoming a jingle.
 */
const CUES: Record<Cue, Voice[]> = {
  connect: [
    { hz: null, band: 1800, length: 0.09, level: 0.5 },
    { hz: 520, to: 660, length: 0.16, level: 0.16, type: 'sine', delay: 0.05 },
  ],
  disconnect: [
    { hz: 660, to: 380, length: 0.14, level: 0.14, type: 'sine' },
    { hz: null, band: 1200, length: 0.07, level: 0.3, delay: 0.08 },
  ],
  // Soft, low and short. It fires once per line of speech and must survive being heard a
  // few hundred times an hour, which rules out anything with a character of its own.
  receive: [{ hz: 430, to: 468, length: 0.075, level: 0.075, type: 'sine' }],
  transmit: [
    { hz: 700, length: 0.045, level: 0.1, type: 'square' },
    { hz: 940, length: 0.06, level: 0.085, type: 'square', delay: 0.045 },
  ],
  // Barely there. A keyer you can hear properly is a keyer you will mute.
  key: [{ hz: null, band: 2600, length: 0.014, level: 0.11 }],
  tap: [{ hz: 880, length: 0.028, level: 0.07, type: 'triangle' }],
  // The one warm sound. Rising, because it is the only moment in the game where the
  // machine gains something.
  learn: [
    { hz: 587, length: 0.1, level: 0.075, type: 'sine' },
    { hz: 880, length: 0.22, level: 0.06, type: 'sine', delay: 0.07 },
  ],
  /**
   * The resolve sweep landing. ART_DIRECTION §3 asks for one cue, dry and short, and is
   * specific that it must not be a sci-fi swell - so this is deliberately the least
   * musical thing in the table.
   *
   * Two rules from the design above pull in opposite directions here and both are obeyed.
   * A resolve is the machine DOING something, which puts it in the sine range; it is also
   * mechanical, a contact closing on a fact, which asks for filtered noise. So it is both,
   * in that order: the tick is the event and the tone is only there to give it a pitch, at
   * a sixth of the tick's level.
   *
   * No sweep between two frequencies, and that is the whole difference between this and
   * the thing §3 forbids. A rising tone announces; a tick reports. What is on screen is
   * already spending six tenths of a second announcing, and the sound's job is to give
   * that motion a hard edge to start against, not to narrate it a second time.
   *
   * 62ms total, shorter than every cue except the keyer. It fires once per prop, staggered
   * by the same 180ms the sweeps are, so three resolving props read as three ticks rather
   * than as a chord.
   */
  resolve: [
    { hz: null, band: 1900, length: 0.022, level: 0.3 },
    { hz: 698, length: 0.05, level: 0.05, type: 'sine', delay: 0.012 },
  ],
  seat: [{ hz: null, band: 900, length: 0.045, level: 0.42 }],
  reject: [{ hz: 220, to: 180, length: 0.11, level: 0.1, type: 'sawtooth' }],
  solved: [
    { hz: 523, length: 0.16, level: 0.09, type: 'sine' },
    { hz: 784, length: 0.42, level: 0.08, type: 'sine', delay: 0.12 },
  ],
  failed: [
    { hz: 415, length: 0.2, level: 0.09, type: 'sine' },
    { hz: 293, length: 0.5, level: 0.085, type: 'sine', delay: 0.16 },
  ],
};

/**
 * The console's voice.
 *
 * Deliberately a single instance owned by the rig rather than something call sites
 * construct. Two AudioContexts is two carriers, and two carriers beating against each
 * other is the most audible bug this system can have.
 */
export class ConsoleAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** The carrier bed: hum plus hiss, running whenever a call is up. */
  private carrier: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private enabled = true;
  /** 0 to 1, the player's own setting. Multiplies the master ceiling. */
  private volume = storedVolume();

  /**
   * Start the audio context.
   *
   * Must be called from a real user gesture - browsers refuse to start one otherwise, and
   * an AudioContext created at load sits in `suspended` forever while every cue silently
   * does nothing. The main menu's NEW GAME is the first gesture the game gets, so that is
   * where this is called from.
   */
  public unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }

    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = MASTER * this.volume;
    master.connect(ctx.destination);

    this.ctx = ctx;
    this.master = master;
    this.noise = this.buildNoise(ctx);
    this.buildCarrier(ctx, master);
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.applyGain();
  }

  public getVolume(): number {
    return this.volume;
  }

  /**
   * Set and remember the player's level.
   *
   * Ramped rather than assigned: a gain node written directly mid-tone clicks, and the
   * carrier bed is a continuous tone by definition - so dragging a slider on a silent
   * build is fine and dragging it while a call is up would pop on every pixel of travel.
   */
  public setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    try {
      window.localStorage?.setItem(VOLUME_KEY, String(this.volume));
    } catch {
      // Not being able to remember it is not a reason to refuse to set it.
    }
    this.applyGain();
  }

  private applyGain(): void {
    if (!this.master || !this.ctx) return;
    const target = this.enabled ? MASTER * this.volume : 0;
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
  }

  /**
   * Raise or drop the carrier bed.
   *
   * Slow on purpose - 0.4s up, 0.7s down. A carrier that snaps on is a switch; a carrier
   * that swells is a link establishing, and the difference is most of what makes opening a
   * request feel like reaching somebody.
   */
  public setOnAir(live: boolean): void {
    if (!this.ctx || !this.carrier) return;
    this.carrier.gain.setTargetAtTime(live ? 0.16 : 0, this.ctx.currentTime, live ? 0.4 : 0.7);
  }

  public play(cue: Cue): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || !this.enabled) return;
    if (ctx.state === 'suspended') void ctx.resume();

    for (const voice of CUES[cue]) {
      this.voice(ctx, master, voice);
    }
  }

  public dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
    this.carrier = null;
  }

  // -- internals -------------------------------------------------------------

  private voice(ctx: AudioContext, out: GainNode, v: Voice): void {
    const at = ctx.currentTime + (v.delay ?? 0);
    const gain = ctx.createGain();

    /**
     * A percussive envelope, and why there is no attack stage.
     *
     * Every cue here is a transient - a click, a blip, a squelch. Ramping up over even
     * 10ms softens exactly the edge that makes a short sound feel like an EVENT rather
     * than a tone, and at these lengths the ramp is a noticeable fraction of the sound.
     * So: full level immediately, exponential decay to silence.
     */
    gain.gain.setValueAtTime(v.level, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + v.length);
    gain.connect(out);

    if (v.hz === null) {
      if (!this.noise) return;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = v.band ?? 1500;
      band.Q.value = 1.1;
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

  /** Two seconds of white noise, looped. Long enough that the loop point is inaudible. */
  private buildNoise(ctx: AudioContext): AudioBuffer {
    const frames = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Seeded rather than Math.random (§123). Audio noise does not need to be reproducible
    // between runs, but nothing else in this project rolls an unseeded die and this file
    // is not going to be the exception that makes the rule negotiable.
    let state = 0x9e3779b9;
    for (let i = 0; i < frames; i++) {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      data[i] = ((t ^ (t >>> 14)) >>> 0) / 2147483648 - 1;
    }
    return buffer;
  }

  /**
   * The bed: mains hum and band-limited hiss.
   *
   * 50Hz because this is a Black Sea coast in a country on 50Hz mains, and the second
   * harmonic at 100 is what actually makes it read as electrical rather than as a note.
   * The hiss is rolled off hard at both ends - full-band white noise reads as rain, and a
   * narrow band around 1.2k reads as a receiver with nobody talking, which is the point.
   */
  private buildCarrier(ctx: AudioContext, out: GainNode): void {
    const bed = ctx.createGain();
    bed.gain.value = 0;
    bed.connect(out);

    for (const [hz, level] of [
      [50, 0.5],
      [100, 0.22],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = hz;
      const g = ctx.createGain();
      g.gain.value = level;
      osc.connect(g).connect(bed);
      osc.start();
    }

    if (this.noise) {
      const hiss = ctx.createBufferSource();
      hiss.buffer = this.noise;
      hiss.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 1250;
      band.Q.value = 0.6;
      const g = ctx.createGain();
      g.gain.value = 0.13;
      hiss.connect(band).connect(g).connect(bed);
      hiss.start();
    }

    this.carrier = bed;
  }
}

/**
 * The one instance.
 *
 * A module-level singleton rather than something threaded through twelve constructors:
 * the console's voice is a property of the machine the player is sitting at, not of any
 * particular panel, and every panel that wants to make a noise would otherwise need a
 * reference passed down through layers that have no other reason to know about audio.
 */
export const audio = new ConsoleAudio();
