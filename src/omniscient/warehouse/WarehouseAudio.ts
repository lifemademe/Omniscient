import { emitSoundCaption } from '../accessibility/SoundCaptions.js';
import { audio } from '../audio/ConsoleAudio.js';

export type WarehouseCue =
  | 'bell'
  | 'scan'
  | 'grip'
  | 'release'
  | 'reject'
  | 'shutter'
  | 'warning'
  | 'conveyor'
  | 'quarantine'
  | 'resolved'
  | 'anomaly'
  | 'camera'
  | 'tamper'
  | 'lockdown'
  | 'siren'
  | 'power-loss'
  | 'emergency'
  | 'footsteps'
  | 'metal-impact'
  | 'tracking'
  | 'security-gate'
  | 'recovery';

const CAPTIONS: Readonly<Record<WarehouseCue, { text: string; kind: 'machine' | 'world' | 'warning' | 'success' }>> = {
  bell: { text: 'perimeter collection bell rings once', kind: 'world' },
  scan: { text: 'scanner sweeps target', kind: 'machine' },
  grip: { text: 'magnetic gripper locks', kind: 'world' },
  release: { text: 'cargo lock accepts package', kind: 'success' },
  reject: { text: 'verification rejects decision', kind: 'warning' },
  shutter: { text: 'loading shutter rolls open', kind: 'world' },
  warning: { text: 'inbound freight warning', kind: 'warning' },
  conveyor: { text: 'sorting conveyors start together', kind: 'world' },
  quarantine: { text: 'quarantine cage seals', kind: 'success' },
  resolved: { text: 'warehouse case resolved', kind: 'success' },
  anomaly: { text: 'carrier tone bends out of tune', kind: 'warning' },
  camera: { text: 'surveillance relay switches feed', kind: 'machine' },
  tamper: { text: 'secured hatch strains; tamper sensor alarms', kind: 'warning' },
  lockdown: { text: 'security shutter drops and physical bolts drive home', kind: 'warning' },
  siren: { text: 'local response siren approaches through rain', kind: 'world' },
  'power-loss': { text: 'power relay drops; main warehouse lights fade', kind: 'warning' },
  emergency: { text: 'warehouse emergency alarm pulses slowly', kind: 'warning' },
  footsteps: { text: 'running footsteps echo between storage racks', kind: 'world' },
  'metal-impact': { text: 'metal strikes somewhere beyond the active camera', kind: 'world' },
  tracking: { text: 'optical tracking lock confirmed for ten seconds', kind: 'success' },
  'security-gate': { text: 'sector security gates descend and lock', kind: 'warning' },
  recovery: { text: 'warehouse power relays recover normal lighting', kind: 'success' },
};

const PITCH: Readonly<Record<WarehouseCue, readonly [number, number, number]>> = {
  bell: [740, 555, 0.42],
  scan: [920, 1260, 0.18],
  grip: [180, 120, 0.12],
  release: [420, 630, 0.28],
  reject: [180, 92, 0.34],
  shutter: [95, 62, 0.56],
  warning: [260, 260, 0.32],
  conveyor: [74, 92, 0.62],
  quarantine: [125, 58, 0.48],
  resolved: [330, 495, 0.42],
  anomaly: [117, 83, 0.86],
  camera: [780, 620, 0.1],
  tamper: [156, 96, 0.68],
  lockdown: [88, 42, 0.92],
  siren: [420, 690, 0.76],
  'power-loss': [92, 34, 0.82],
  emergency: [232, 174, 0.58],
  footsteps: [78, 56, 0.24],
  'metal-impact': [164, 48, 0.64],
  tracking: [540, 1180, 0.3],
  'security-gate': [112, 38, 0.86],
  recovery: [174, 392, 0.74],
};

export class WarehouseAudio {
  /** Shared noise source for the transient layers. Built on first use - see noise(). */
  private noiseBuffer: AudioBuffer | null = null;
  private ambience: GainNode | null = null;
  private ambienceSources: AudioScheduledSourceNode[] = [];
  private droneGain: GainNode | null = null;
  private droneVoices: OscillatorNode[] = [];
  private emergencyGain: GainNode | null = null;
  private emergencyDepth: GainNode | null = null;
  private emergencySources: OscillatorNode[] = [];
  private emergencyState: 'off' | 'active' | 'contained' = 'off';

  public start(): void {
    const bus = audio.bus();
    if (!bus || this.ambience) return;
    const gain = bus.ctx.createGain();
    gain.gain.value = 0.018;
    gain.connect(bus.ambience);
    for (const [frequency, level] of [[49, 0.7], [98, 0.18], [2130, 0.025]] as const) {
      const hum = bus.ctx.createOscillator();
      hum.type = frequency > 1000 ? 'sine' : 'triangle';
      hum.frequency.value = frequency;
      const voice = bus.ctx.createGain();
      voice.gain.value = level;
      hum.connect(voice).connect(gain);
      hum.start();
      this.ambienceSources.push(hum);
    }
    // Fixed-seed filtered noise: humid rain and roof ventilation, without a sound asset.
    const buffer = bus.ctx.createBuffer(1, bus.ctx.sampleRate * 2, bus.ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    let state = 0x7018;
    for (let index = 0; index < samples.length; index++) {
      state = (state * 1664525 + 1013904223) >>> 0;
      samples[index] = (state / 0xffffffff) * 2 - 1;
    }
    const rain = bus.ctx.createBufferSource();
    rain.buffer = buffer;
    rain.loop = true;
    const rainFilter = bus.ctx.createBiquadFilter();
    rainFilter.type = 'bandpass';
    rainFilter.frequency.value = 1250;
    rainFilter.Q.value = 0.42;
    const rainGain = bus.ctx.createGain();
    rainGain.gain.value = 0.17;
    rain.connect(rainFilter).connect(rainGain).connect(gain);
    rain.start();
    this.ambienceSources.push(rain);

    const droneGain = bus.ctx.createGain();
    droneGain.gain.value = 0.003;
    droneGain.connect(bus.gameplay);
    for (const [frequency, level, wave] of [
      [78, 0.72, 'triangle'],
      [156, 0.2, 'sine'],
      [312, 0.055, 'sine'],
    ] as const) {
      const rotor = bus.ctx.createOscillator();
      rotor.type = wave;
      rotor.frequency.value = frequency;
      const voice = bus.ctx.createGain();
      voice.gain.value = level;
      rotor.connect(voice).connect(droneGain);
      rotor.start();
      this.ambienceSources.push(rotor);
      this.droneVoices.push(rotor);
    }
    this.droneGain = droneGain;
    this.ambience = gain;
  }

  public setDroneLoad(load: number, active: boolean): void {
    const gain = this.droneGain;
    if (!gain) return;
    const amount = Math.max(0, Math.min(1, load));
    const at = gain.context.currentTime;
    gain.gain.cancelScheduledValues(at);
    gain.gain.linearRampToValueAtTime(active ? 0.008 + amount * 0.014 : 0.0025, at + 0.08);
    for (const [index, voice] of this.droneVoices.entries()) {
      const base = 78 * 2 ** index;
      voice.frequency.cancelScheduledValues(at);
      voice.frequency.linearRampToValueAtTime(base * (1 + amount * 0.24), at + 0.08);
    }
  }

  public setEmergency(active: boolean, contained = false): void {
    const next = active ? (contained ? 'contained' : 'active') : 'off';
    if (next === this.emergencyState) return;
    this.emergencyState = next;
    const bus = audio.bus();
    if (!bus) return;
    if (!active) {
      for (const source of this.emergencySources) {
        try {
          source.stop();
        } catch {
          // The alarm voice may have already stopped with its audio context.
        }
        source.disconnect();
      }
      this.emergencySources = [];
      this.emergencyGain?.disconnect();
      this.emergencyDepth?.disconnect();
      this.emergencyGain = null;
      this.emergencyDepth = null;
      return;
    }
    if (!this.emergencyGain) {
      const gain = bus.ctx.createGain();
      gain.gain.value = 0.0001;
      gain.connect(bus.critical);
      const tone = bus.ctx.createOscillator();
      tone.type = 'triangle';
      tone.frequency.value = 172;
      tone.connect(gain);
      tone.start();
      const pulse = bus.ctx.createOscillator();
      pulse.type = 'sine';
      pulse.frequency.value = 0.42;
      const depth = bus.ctx.createGain();
      depth.gain.value = 0.006;
      pulse.connect(depth).connect(gain.gain);
      pulse.start();
      this.emergencySources = [tone, pulse];
      this.emergencyGain = gain;
      this.emergencyDepth = depth;
      emitSoundCaption({ text: CAPTIONS.emergency.text, tier: 'gameplay', kind: 'warning' });
    }
    const at = bus.ctx.currentTime;
    this.emergencyGain.gain.cancelScheduledValues(at);
    this.emergencyGain.gain.linearRampToValueAtTime(contained ? 0.003 : 0.009, at + 0.3);
    if (this.emergencyDepth) {
      this.emergencyDepth.gain.cancelScheduledValues(at);
      this.emergencyDepth.gain.linearRampToValueAtTime(contained ? 0 : 0.006, at + 0.3);
    }
  }

  public play(cue: WarehouseCue): void {
    const caption = CAPTIONS[cue];
    emitSoundCaption({ text: caption.text, tier: cue === 'scan' || cue === 'grip' ? 'all' : 'gameplay', kind: caption.kind });
    const bus = audio.bus();
    if (!bus) return;
    const [from, to, length] = PITCH[cue];
    const at = bus.ctx.currentTime;
    /*
     * The two verbs the player fires all session get a little detuning.
     *
     * Every cue here is one oscillator on a fixed sweep, which means a scan sounds byte-for-byte
     * identical every time it is pressed - and a repeated identical one-shot is the fastest way
     * to make a good sound tiring. Seven percent is under the threshold where anyone hears a
     * wrong note and over the one where repeats stop phase-locking into a single machine tone.
     *
     * Deliberately not applied to the other cues: a lockdown or a siren fires once at a dramatic
     * beat, and those want to be exactly the same sound every time so they stay recognisable.
     */
    const varied = cue === 'scan' || cue === 'grip';
    const detune = varied ? 1 + (Math.random() - 0.5) * 0.07 : 1;
    const oscillator = bus.ctx.createOscillator();
    oscillator.type = cue === 'reject' || cue === 'anomaly' || cue === 'tamper' || cue === 'siren' || cue === 'metal-impact'
      ? 'sawtooth'
      : 'triangle';
    oscillator.frequency.setValueAtTime(from * detune, at);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to * detune), at + length);
    const gain = bus.ctx.createGain();
    gain.gain.setValueAtTime(cue === 'bell' ? 0.09 : 0.055, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    oscillator.connect(gain);
    gain.connect(cue === 'warning' || cue === 'reject' || cue === 'tamper' || cue === 'lockdown' || cue === 'power-loss' || cue === 'emergency' || cue === 'security-gate'
      ? bus.critical
      : bus.gameplay);
    oscillator.start(at);
    oscillator.stop(at + length + 0.02);
    if (cue === 'scan') this.scanTexture(at);
    else if (cue === 'grip') this.gripTexture(at);
  }

  /**
   * Shared white noise, generated once and looped by the burst layers.
   *
   * Deterministic rather than Math.random so the grain of the noise is identical every time -
   * the variation between one grip and the next should come from the envelope and the detune,
   * which are tuned, and not from the sample content, which is not.
   */
  private noise(ctx: BaseAudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) return this.noiseBuffer;
    const frames = Math.floor(ctx.sampleRate * 0.25);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 0x9e3779b9;
    for (let index = 0; index < frames; index++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[index] = (seed / 0xffffffff) * 2 - 1;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  /**
   * A filtered noise burst - the transient that a pure oscillator cannot produce.
   *
   * Machines do not start at a pitch; they start with a hit and then ring. Every cue in this
   * file was an oscillator with an instant-on gain, which gives an onset but no CONTENT at the
   * onset, and reads as thin and synthetic however the sweep is tuned. Four milliseconds of
   * attack rather than zero because a true instant start adds a broadband click of its own that
   * the filter cannot shape.
   */
  private burst(at: number, frequency: number, q: number, peak: number, length: number): void {
    const bus = audio.bus();
    if (!bus) return;
    const source = bus.ctx.createBufferSource();
    source.buffer = this.noise(bus.ctx);
    source.loop = true;
    const filter = bus.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(frequency, at);
    filter.Q.value = q;
    const gain = bus.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(bus.gameplay);
    source.start(at);
    source.stop(at + length + 0.02);
  }

  /** A tick at the head of the sweep, so the scan reads as struck rather than faded in. */
  private scanTexture(at: number): void {
    this.burst(at, 3200, 6, 0.03, 0.03);
  }

  /**
   * A magnetic clamp: the clack of the plates meeting, then the mass it just took.
   *
   * The cue was a 180-120Hz triangle, which is a soft blip and reads as a UI acknowledgement
   * rather than a piece of hardware closing on a crate. The clack carries the mechanism and the
   * thump carries the weight; either alone sounds like half a machine.
   */
  private gripTexture(at: number): void {
    /*
     * The clack carries this cue, and the levels here are measured rather than guessed.
     *
     * Captured off the running game through a loopback recorder and A-weighted, because
     * unweighted energy answers the wrong question for a cue that lives this low - a thump
     * under 200Hz can dominate the spectrum and still be inaudible on the laptop speakers
     * most players will use. As mixed: grip 0.0056 A-rms with a 3.5ms attack and 35-75% of
     * its energy above 1kHz, which puts it level with a scan (0.0058) and comfortably under
     * the bell (0.0131). That is the balance intended - grip and scan are the two verbs the
     * player fires constantly and neither should out-shout a story beat.
     *
     * The thump stays because on speakers that CAN reproduce it, it is the difference between
     * a click and a mass being caught. It simply is not allowed to be the whole cue.
     *
     * A warning for whoever measures this next: the warehouse ambience contains a periodic
     * low rumble - about 166Hz, 0.00047 A-rms, zero attack - that recurs roughly every 11
     * seconds. It looks exactly like a soft cue in an onset list and it cost this pass a
     * wrong diagnosis, because grip was read as 12x too quiet when what was being measured
     * was the room. Separate cues into their own firing windows and check the spacing before
     * trusting any onset.
     */
    this.burst(at, 1800, 1.2, 0.14, 0.06);
    this.burst(at, 3600, 2, 0.05, 0.022);
    const bus = audio.bus();
    if (!bus) return;
    const thump = bus.ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(150, at);
    thump.frequency.exponentialRampToValueAtTime(58, at + 0.11);
    const gain = bus.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.05, at + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
    thump.connect(gain);
    gain.connect(bus.gameplay);
    thump.start(at);
    thump.stop(at + 0.14);
  }

  public dispose(): void {
    this.setEmergency(false);
    try {
      for (const source of this.ambienceSources) source.stop();
    } catch {
      // Already stopped.
    }
    for (const source of this.ambienceSources) source.disconnect();
    this.ambience?.disconnect();
    this.droneGain?.disconnect();
    this.ambienceSources = [];
    this.droneVoices = [];
    this.ambience = null;
    this.droneGain = null;
  }
}
