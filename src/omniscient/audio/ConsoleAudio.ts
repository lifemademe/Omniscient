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
const MASTER = 0.68;
const AMBIENCE_LEVEL = 0.72;

export interface SharedAudioBus {
  ctx: AudioContext;
  master: GainNode;
  critical: GainNode;
  ui: GainNode;
  ambience: GainNode;
  gameplay: GainNode;
  music: GainNode;
  noise: AudioBuffer;
}

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
  | 'failed'
  /**
   * The machine's own three notes. The nearest thing this game has to a theme.
   *
   * Deliberately not a jingle and deliberately not often - it plays at the boot, when a
   * request resolves, and at the ending, and nowhere else. Three uses is what makes three
   * notes a motif; a fourth would make it a sound effect.
   */
  | 'motif';

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
  /**
   * 392, 523, 587 - G, C, D. A rising fourth then a step.
   *
   * It resolves upward and then does NOT arrive: the third note is the second of the key it
   * implies, so the phrase leans forward and stops. That is the machine - something that has
   * got somewhere and is still listening - and it is why the interval is not the rising
   * fifth the `solved` cue already owns. Two confident resolutions in the same instrument
   * would make one of them meaningless.
   *
   * Long and quiet. 0.42s a note against 0.16 for everything else here, at a third of the
   * level, because this is the only cue in the game that is allowed to be MUSIC and music
   * that arrives at the volume of a button click is a notification.
   */
  motif: [
    { hz: 392, length: 0.42, level: 0.05, type: 'sine' },
    { hz: 523, length: 0.42, level: 0.045, type: 'sine', delay: 0.3 },
    { hz: 587, to: 584, length: 0.9, level: 0.04, type: 'sine', delay: 0.62 },
    // A fifth under the last note, barely there. It is what stops three sines reading as a
    // test tone - the same trick the carrier bed uses to sound like a room rather than a
    // frequency.
    { hz: 196, length: 1.1, level: 0.022, type: 'sine', delay: 0.62 },
  ],
  /**
   * 0.34, not 0.5, and the reason is the SPREAD rather than this cue.
   *
   * Measured against the room tone in a capture, `connect` landed 23dB over the bed while
   * `tap` and `receive` - the two the player hears hundreds of times an hour - landed 2-6dB
   * over it, and half the clicks in a 58 second session produced nothing detectable at all.
   * A 17dB gap between the loudest cue and the most frequent one is not a mix, it is two
   * mixes.
   *
   * Closing it from both ends: the bed moves down out of the click band (see RoomTone), the
   * quiet cues come up a little below, and the one sting that was shouting comes down. The
   * target is every UI cue 10-14dB over its room - loud enough that a click is unambiguous
   * feedback, quiet enough that a thousand of them are not an assault.
   */
  connect: [
    { hz: null, band: 1800, length: 0.09, level: 0.34 },
    { hz: 520, to: 660, length: 0.16, level: 0.13, type: 'sine', delay: 0.05 },
  ],
  disconnect: [
    { hz: 660, to: 380, length: 0.14, level: 0.14, type: 'sine' },
    { hz: null, band: 1200, length: 0.07, level: 0.3, delay: 0.08 },
  ],
  /*
   * Soft, low and short. It fires once per line of speech and must survive being heard a few
   * hundred times an hour, which rules out anything with a character of its own.
   *
   * 0.10 rather than 0.075 - a third up, not doubled. The note above is right and the fix for
   * "the player cannot tell their click registered" is mostly the bed getting out of the way,
   * not this getting louder. A cue that has to shout over its own room is the wrong cue.
   */
  receive: [{ hz: 430, to: 468, length: 0.075, level: 0.1, type: 'sine' }],
  transmit: [
    { hz: 700, length: 0.045, level: 0.1, type: 'square' },
    { hz: 940, length: 0.06, level: 0.085, type: 'square', delay: 0.045 },
  ],
  // Barely there. A keyer you can hear properly is a keyer you will mute. Still barely
  // there at 0.14: it is 14 milliseconds of narrow noise, and the reason it needed any lift
  // is that it was competing with a room tone centred on the same band.
  key: [{ hz: null, band: 2600, length: 0.014, level: 0.14 }],
  // The click under a pointer. Of every cue in this table it is the one the player is most
  // likely to be waiting on, and it measured 6dB over the bed - which is not feedback.
  tap: [{ hz: 880, length: 0.028, level: 0.1, type: 'triangle' }],
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
  private limiter: DynamicsCompressorNode | null = null;
  private critical: GainNode | null = null;
  private ui: GainNode | null = null;
  private ambience: GainNode | null = null;
  private gameplay: GainNode | null = null;
  private music: GainNode | null = null;
  private duckTimer: number | null = null;
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
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.14;
    master.connect(limiter).connect(ctx.destination);

    const makeBus = (level: number): GainNode => {
      const bus = ctx.createGain();
      bus.gain.value = level;
      bus.connect(master);
      return bus;
    };
    const critical = makeBus(1.15);
    const ui = makeBus(1.05);
    const ambience = makeBus(AMBIENCE_LEVEL);
    const gameplay = makeBus(1);
    const music = makeBus(1);

    this.ctx = ctx;
    this.master = master;
    this.limiter = limiter;
    this.critical = critical;
    this.ui = ui;
    this.ambience = ambience;
    this.gameplay = gameplay;
    this.music = music;
    this.noise = this.buildNoise(ctx);
    this.buildCarrier(ctx, ambience);
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

  /**
   * The shared context, noise bed and master ceiling, for sibling instruments.
   *
   * Exists for exactly one caller: the slime. M4SS needs a voice of its own - wet,
   * pitch-bent, nothing like the valve set - but "its own" must not mean its own
   * AudioContext, because two contexts is two carriers, and two carriers beating against
   * each other is the most audible bug this system can have (see the class comment).
   * A sibling gets the plumbing and brings its own cue table; the master gain stays the
   * one ceiling nothing may bypass.
   */
  public bus(): SharedAudioBus | null {
    return this.ctx &&
      this.master &&
      this.critical &&
      this.ui &&
      this.ambience &&
      this.gameplay &&
      this.music &&
      this.noise
      ? {
          ctx: this.ctx,
          master: this.master,
          critical: this.critical,
          ui: this.ui,
          ambience: this.ambience,
          gameplay: this.gameplay,
          music: this.music,
          noise: this.noise,
        }
      : null;
  }

  public play(cue: Cue): void {
    const ctx = this.ctx;
    const out = cue === 'motif' ? this.music : this.isCritical(cue) ? this.critical : this.ui;
    if (!ctx || !out || !this.enabled) return;
    if (ctx.state === 'suspended') void ctx.resume();

    if (this.isCritical(cue)) this.duckAmbience(0.38, cue === 'solved' || cue === 'failed' ? 0.8 : 0.42);

    for (const voice of CUES[cue]) {
      this.voice(ctx, out, voice);
    }
  }

  /**
   * Let the room complete before the machine congratulates itself.
   *
   * These are short procedural material cues, not another UI vocabulary. The returned
   * delay tells the caller when the machine may acknowledge what the room is still doing;
   * `null` means this scene has no authored material payoff.
  */
  public playContactPayoff(sceneId: string): number | null {
    let voices: Voice[] | null = null;
    let acknowledgementDelayMs = 360;
    switch (sceneId) {
      case 'scene-repair-shop':
        voices = [
          { hz: null, band: 680, length: 0.055, level: 0.12 },
          { hz: 310, to: 430, length: 0.55, level: 0.04, type: 'triangle', delay: 0.08 },
          { hz: null, band: 2100, length: 0.16, level: 0.035, delay: 0.22 },
        ];
        break;
      case 'scene-cleared-house':
        acknowledgementDelayMs = 1200;
        voices = [
          ...[0, 0.12, 0.24, 0.36, 0.48].map<Voice>((delay) => ({
            hz: null,
            band: 2600,
            length: 0.055,
            level: 0.045,
            delay,
          })),
          { hz: null, band: 420, length: 0.13, level: 0.11, delay: 1.0 },
        ];
        break;
      case 'scene-seedling-tunnel':
        acknowledgementDelayMs = 720;
        voices = [
          { hz: null, band: 1900, length: 0.42, level: 0.045 },
          { hz: 294, to: 330, length: 0.9, level: 0.028, type: 'sine', delay: 0.12 },
        ];
        break;
      case 'scene-station-desk':
        acknowledgementDelayMs = 820;
        voices = [0, 0.08, 0.16, 0.28, 0.4, 0.52].map<Voice>((delay, i) => ({
          hz: i % 2 === 0 ? 1320 : 1760,
          length: 0.025,
          level: 0.055,
          type: 'square',
          delay,
        }));
        voices.push({ hz: 98, to: 72, length: 0.28, level: 0.05, type: 'sine', delay: 0.62 });
        break;
      case 'scene-beacon-mast':
        acknowledgementDelayMs = 3160;
        voices = [
          { hz: null, band: 1150, length: 0.045, level: 0.085, delay: 2.72 },
          { hz: 82, to: 96, length: 0.72, level: 0.042, type: 'triangle', delay: 2.8 },
          { hz: 392, to: 398, length: 0.8, level: 0.026, type: 'sine', delay: 2.86 },
        ];
        break;
      case 'scene-flooded-cellar':
        acknowledgementDelayMs = 1800;
        voices = [
          { hz: null, band: 520, length: 1.25, level: 0.055, delay: 0.16 },
          { hz: null, band: 880, length: 0.07, level: 0.11, delay: 1.02 },
          { hz: null, band: 1450, length: 0.8, level: 0.07, delay: 1.34 },
          { hz: 110, to: 92, length: 0.55, level: 0.035, type: 'triangle', delay: 1.38 },
        ];
        break;
      case 'scene-night-door':
        acknowledgementDelayMs = 2750;
        voices = [
          ...[0.2, 0.7, 1.12, 1.56].map<Voice>((delay, i) => ({
            hz: null,
            band: 1900 + i * 180,
            length: 0.026,
            level: 0.072,
            delay,
          })),
          { hz: null, band: 620, length: 0.09, level: 0.13, delay: 1.92 },
          { hz: null, band: 360, length: 0.62, level: 0.055, delay: 2.2 },
        ];
        break;
      case 'scene-wire-city':
        acknowledgementDelayMs = 4100;
        voices = [
          { hz: 440, length: 0.06, level: 0.04, type: 'sine', delay: 2.9 },
          { hz: 554, length: 0.06, level: 0.045, type: 'sine', delay: 3.24 },
          { hz: 659, length: 0.07, level: 0.05, type: 'sine', delay: 3.56 },
          { hz: null, band: 1750, length: 0.09, level: 0.075, delay: 3.82 },
          { hz: 220, to: 330, length: 0.62, level: 0.032, type: 'triangle', delay: 3.86 },
        ];
        break;
    }
    if (!voices) return null;

    /* Visual timing is authored even when audio is muted or not yet available. */
    if (!this.enabled) return acknowledgementDelayMs;
    const bus = this.bus();
    if (!bus) return acknowledgementDelayMs;

    const tail = Math.max(...voices.map((voice) => (voice.delay ?? 0) + voice.length));
    this.duckAmbience(0.46, Math.max(1.35, tail + 0.35));
    for (const voice of voices) this.voice(bus.ctx, bus.gameplay, voice);
    return acknowledgementDelayMs;
  }

  public dispose(): void {
    if (this.duckTimer !== null) window.clearTimeout(this.duckTimer);
    this.duckTimer = null;
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
    this.limiter = null;
    this.critical = null;
    this.ui = null;
    this.ambience = null;
    this.gameplay = null;
    this.music = null;
    this.carrier = null;
  }

  // -- internals -------------------------------------------------------------

  private isCritical(cue: Cue): boolean {
    return (
      cue === 'connect' ||
      cue === 'disconnect' ||
      cue === 'learn' ||
      cue === 'resolve' ||
      cue === 'seat' ||
      cue === 'reject' ||
      cue === 'solved' ||
      cue === 'failed'
    );
  }

  /** Make verdicts and mechanical commits legible without making their gains shout. */
  private duckAmbience(level: number, seconds: number): void {
    const ctx = this.ctx;
    const ambience = this.ambience;
    if (!ctx || !ambience) return;
    if (this.duckTimer !== null) window.clearTimeout(this.duckTimer);
    ambience.gain.cancelScheduledValues(ctx.currentTime);
    ambience.gain.setTargetAtTime(level, ctx.currentTime, 0.025);
    this.duckTimer = window.setTimeout(() => {
      this.duckTimer = null;
      if (!this.ctx || !this.ambience) return;
      this.ambience.gain.setTargetAtTime(AMBIENCE_LEVEL, this.ctx.currentTime, 0.12);
    }, seconds * 1000);
  }

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

/** Procedural motor and cutting load for the remotely operated mower. */
export class MowerAudio {
  private engine: OscillatorNode | null = null;
  private harmonic: OscillatorNode | null = null;
  private blade: AudioBufferSourceNode | null = null;
  private engineGain: GainNode | null = null;
  private bladeGain: GainNode | null = null;
  private bladeFilter: BiquadFilterNode | null = null;
  private lastImpactAt = -Infinity;

  public start(): void {
    if (this.engine) return;
    const bus = audio.bus();
    if (!bus) return;

    const engineGain = bus.ctx.createGain();
    engineGain.gain.value = 0.0001;
    engineGain.connect(bus.gameplay);

    const engine = bus.ctx.createOscillator();
    engine.type = 'triangle';
    engine.frequency.value = 52;
    engine.connect(engineGain);

    const harmonicGain = bus.ctx.createGain();
    harmonicGain.gain.value = 0.24;
    harmonicGain.connect(engineGain);
    const harmonic = bus.ctx.createOscillator();
    harmonic.type = 'sawtooth';
    harmonic.frequency.value = 104;
    harmonic.connect(harmonicGain);

    const bladeGain = bus.ctx.createGain();
    bladeGain.gain.value = 0.0001;
    bladeGain.connect(bus.gameplay);
    const bladeFilter = bus.ctx.createBiquadFilter();
    bladeFilter.type = 'bandpass';
    bladeFilter.frequency.value = 520;
    bladeFilter.Q.value = 0.75;
    bladeFilter.connect(bladeGain);
    const blade = bus.ctx.createBufferSource();
    blade.buffer = bus.noise;
    blade.loop = true;
    blade.connect(bladeFilter);

    engine.start();
    harmonic.start();
    blade.start();
    engineGain.gain.setTargetAtTime(0.055, bus.ctx.currentTime, 0.08);
    bladeGain.gain.setTargetAtTime(0.018, bus.ctx.currentTime, 0.1);

    this.engine = engine;
    this.harmonic = harmonic;
    this.blade = blade;
    this.engineGain = engineGain;
    this.bladeGain = bladeGain;
    this.bladeFilter = bladeFilter;
    this.lastImpactAt = -Infinity;
  }

  /** Drive pitch follows throttle; grass contact opens and raises the blade noise. */
  public update(throttle: number, cutting: boolean): void {
    const bus = audio.bus();
    if (!bus || !this.engine || !this.harmonic || !this.engineGain || !this.bladeGain) return;
    const load = Math.min(1, Math.abs(throttle));
    const frequency = 52 + load * 24 - (cutting ? 3 : 0);
    this.engine.frequency.setTargetAtTime(frequency, bus.ctx.currentTime, 0.07);
    this.harmonic.frequency.setTargetAtTime(frequency * 2.03, bus.ctx.currentTime, 0.07);
    this.engineGain.gain.setTargetAtTime(0.05 + load * 0.035, bus.ctx.currentTime, 0.08);
    this.bladeGain.gain.setTargetAtTime(cutting ? 0.062 : 0.018, bus.ctx.currentTime, 0.045);
    this.bladeFilter?.frequency.setTargetAtTime(cutting ? 760 : 500, bus.ctx.currentTime, 0.05);
  }

  /**
   * A physical bumper transient, with material carried by the filter rather than volume.
   *
   * The cooldown belongs here because contact is sampled every frame. Holding a mower
   * against a bed should grind and complain at a mechanical cadence, not synthesize sixty
   * impacts a second. The person keep-out uses a dry interlock chirp instead of a body hit.
   */
  public impact(
    kind: 'boundary' | 'bed' | 'trunk' | 'person',
    strength: number
  ): void {
    const bus = audio.bus();
    if (!bus || bus.ctx.currentTime - this.lastImpactAt < 0.24) return;
    this.lastImpactAt = bus.ctx.currentTime;

    const force = Math.max(0.18, Math.min(1, strength));
    const at = bus.ctx.currentTime;
    const gain = bus.ctx.createGain();
    gain.gain.setValueAtTime((kind === 'person' ? 0.08 : 0.13) * force, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + (kind === 'trunk' ? 0.24 : 0.14));
    gain.connect(bus.gameplay);

    if (kind === 'person') {
      const interlock = bus.ctx.createOscillator();
      interlock.type = 'square';
      interlock.frequency.setValueAtTime(620, at);
      interlock.frequency.exponentialRampToValueAtTime(470, at + 0.12);
      interlock.connect(gain);
      interlock.start(at);
      interlock.stop(at + 0.12);
      return;
    }

    const band = bus.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = kind === 'trunk' ? 310 : kind === 'bed' ? 760 : 1350;
    band.Q.value = kind === 'boundary' ? 2.8 : 0.85;
    const scrape = bus.ctx.createBufferSource();
    scrape.buffer = bus.noise;
    scrape.loop = true;
    scrape.connect(band).connect(gain);
    scrape.start(at);
    scrape.stop(at + (kind === 'trunk' ? 0.24 : 0.14));

    if (kind === 'trunk') {
      const body = bus.ctx.createOscillator();
      body.type = 'sine';
      body.frequency.setValueAtTime(82, at);
      body.frequency.exponentialRampToValueAtTime(52, at + 0.22);
      body.connect(gain);
      body.start(at);
      body.stop(at + 0.22);
    }
  }

  /** Blades unload, the motor falls to idle, and the unit reports a clean sweep. */
  public complete(): void {
    const bus = audio.bus();
    if (!bus) return;
    const at = bus.ctx.currentTime;
    this.engine?.frequency.setTargetAtTime(44, at, 0.22);
    this.engineGain?.gain.setTargetAtTime(0.035, at, 0.2);
    this.bladeGain?.gain.setTargetAtTime(0.004, at, 0.12);

    for (const [delay, hz] of [[0, 392], [0.16, 587]] as const) {
      const tone = bus.ctx.createOscillator();
      tone.type = 'triangle';
      tone.frequency.value = hz;
      const gain = bus.ctx.createGain();
      gain.gain.setValueAtTime(0.055, at + delay);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + delay + 0.18);
      tone.connect(gain).connect(bus.gameplay);
      tone.start(at + delay);
      tone.stop(at + delay + 0.18);
    }
  }

  public stop(): void {
    const bus = audio.bus();
    const at = bus?.ctx.currentTime ?? 0;
    this.engineGain?.gain.setTargetAtTime(0.0001, at, 0.06);
    this.bladeGain?.gain.setTargetAtTime(0.0001, at, 0.05);
    const engine = this.engine;
    const harmonic = this.harmonic;
    const blade = this.blade;
    window.setTimeout(() => {
      engine?.stop();
      harmonic?.stop();
      blade?.stop();
    }, 240);
    this.engine = null;
    this.harmonic = null;
    this.blade = null;
    this.engineGain = null;
    this.bladeGain = null;
    this.bladeFilter = null;
    this.lastImpactAt = -Infinity;
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
