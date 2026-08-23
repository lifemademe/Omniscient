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
    const oscillator = bus.ctx.createOscillator();
    oscillator.type = cue === 'reject' || cue === 'anomaly' || cue === 'tamper' || cue === 'siren' || cue === 'metal-impact'
      ? 'sawtooth'
      : 'triangle';
    oscillator.frequency.setValueAtTime(from, at);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), at + length);
    const gain = bus.ctx.createGain();
    gain.gain.setValueAtTime(cue === 'bell' ? 0.09 : 0.055, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    oscillator.connect(gain);
    gain.connect(cue === 'warning' || cue === 'reject' || cue === 'tamper' || cue === 'lockdown' || cue === 'power-loss' || cue === 'emergency' || cue === 'security-gate'
      ? bus.critical
      : bus.gameplay);
    oscillator.start(at);
    oscillator.stop(at + length + 0.02);
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
