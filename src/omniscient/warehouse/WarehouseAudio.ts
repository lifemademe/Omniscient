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
  | 'anomaly';

const CAPTIONS: Readonly<Record<WarehouseCue, { text: string; kind: 'machine' | 'world' | 'warning' | 'success' }>> = {
  bell: { text: 'front collection bell rings once', kind: 'world' },
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
};

export class WarehouseAudio {
  private ambience: GainNode | null = null;
  private ambienceSources: AudioScheduledSourceNode[] = [];

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
    this.ambience = gain;
  }

  public play(cue: WarehouseCue): void {
    const caption = CAPTIONS[cue];
    emitSoundCaption({ text: caption.text, tier: cue === 'scan' || cue === 'grip' ? 'all' : 'gameplay', kind: caption.kind });
    const bus = audio.bus();
    if (!bus) return;
    const [from, to, length] = PITCH[cue];
    const at = bus.ctx.currentTime;
    const oscillator = bus.ctx.createOscillator();
    oscillator.type = cue === 'reject' || cue === 'anomaly' ? 'sawtooth' : 'triangle';
    oscillator.frequency.setValueAtTime(from, at);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), at + length);
    const gain = bus.ctx.createGain();
    gain.gain.setValueAtTime(cue === 'bell' ? 0.09 : 0.055, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    oscillator.connect(gain);
    gain.connect(cue === 'warning' || cue === 'reject' ? bus.critical : bus.gameplay);
    oscillator.start(at);
    oscillator.stop(at + length + 0.02);
  }

  public dispose(): void {
    try {
      for (const source of this.ambienceSources) source.stop();
    } catch {
      // Already stopped.
    }
    for (const source of this.ambienceSources) source.disconnect();
    this.ambience?.disconnect();
    this.ambienceSources = [];
    this.ambience = null;
  }
}
