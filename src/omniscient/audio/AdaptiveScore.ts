/**
 * OMNISCIENT_'s score: a few changing voltages, never wallpaper music.
 *
 * The rooms already have authored air and the console already has a three-note identity.
 * This layer only supplies the long-form relationship between them: the globe gathers
 * harmony as the network grows, physical control adds one restrained pulse, M4SS receives
 * a biological undertone, and the ending briefly lets the contact colours coexist.
 * Contact conversations themselves stay scoreless. A human voice and its room are the
 * music there; the only exception is a short timbral answer when knowledge is recorded.
 *
 * Like RoomTone and SlimeAudio, this borrows ConsoleAudio's shared context and music bus.
 * It therefore cannot bypass mute, the player's volume, or the master limiter, and it can
 * remember a desired state before the browser has allowed WebAudio to start.
 */

import { emitSoundCaption } from '../accessibility/SoundCaptions.js';
import { audio } from './ConsoleAudio.js';

import type { SoundCaptionEvent } from '../accessibility/SoundCaptions.js';

export type ScoreState =
  | 'silent'
  | 'home'
  | 'globe'
  | 'contact'
  | 'action'
  | 'warehouse'
  | 'm4ss'
  | 'resolution'
  | 'ending'
  | 'anomaly';

interface ScoreVoice {
  hz: number;
  level: number;
  type?: OscillatorType;
  detune?: number;
  /** Seconds after the state enters before this colour joins it. */
  delay?: number;
  /** Cycles per second. The score breathes; it does not sequence on a timer. */
  pulseHz?: number;
  /** 0..1 proportion of the voice removed at the bottom of the pulse. */
  pulseDepth?: number;
  /** Slow pitch drift in cents, for organic or unstable sources only. */
  driftCents?: number;
  driftHz?: number;
}

interface ScoreProfile {
  voices: readonly ScoreVoice[];
  filterHz: number;
  fadeIn: number;
  fadeOut: number;
}

interface LiveScore {
  key: string;
  ctx: AudioContext;
  gain: GainNode;
  stopNow: () => void;
}

const STATE_CAPTIONS: Partial<Record<ScoreState, SoundCaptionEvent>> = {
  home: {
    text: 'low machine pulse breathes',
    tier: 'all',
    kind: 'machine',
    key: 'score-home',
  },
  globe: {
    text: 'carrier harmony gathers',
    tier: 'all',
    kind: 'machine',
    key: 'score-globe',
  },
  action: {
    text: 'sparse drive pulse enters',
    tier: 'all',
    kind: 'world',
    key: 'score-action',
  },
  warehouse: {
    text: 'warehouse pulse gathers under the machinery',
    tier: 'all',
    kind: 'world',
    key: 'score-warehouse',
  },
  m4ss: {
    text: 'organic sub-pulse enters',
    tier: 'all',
    kind: 'world',
    key: 'score-m4ss',
  },
  ending: {
    text: 'contact tones gather in the machine',
    tier: 'all',
    kind: 'machine',
    key: 'score-ending',
    durationMs: 3200,
  },
  anomaly: {
    text: 'two carriers beat out of tune',
    tier: 'all',
    kind: 'warning',
    key: 'score-anomaly',
    durationMs: 3200,
  },
};

/** One short answer per room, derived from that room's existing procedural instrument. */
const KNOWLEDGE_COLOURS: Readonly<Record<string, readonly [number, number, OscillatorType]>> = {
  'scene-repair-shop': [310, 430, 'triangle'],
  'scene-cleared-house': [262, 330, 'sine'],
  'scene-seedling-tunnel': [294, 330, 'sine'],
  'scene-station-desk': [660, 880, 'square'],
  'scene-beacon-mast': [392, 398, 'sine'],
  'scene-flooded-cellar': [110, 92, 'triangle'],
  'scene-night-door': [247, 196, 'triangle'],
  'scene-wire-city': [440, 554, 'sine'],
  'scene-m4ss-lab': [196, 142, 'sine'],
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * Author the harmonic state in one table-like function.
 *
 * `detail` has deliberately low resolution. On the globe it is answered requests; during
 * an action it is one of five progress bands. Rebuilding on every percentage point would
 * turn a crossfade into zipper noise and make progress sound like a spreadsheet.
 */
function profileFor(state: ScoreState, detail: number): ScoreProfile | null {
  switch (state) {
    case 'silent':
    case 'contact':
      return null;
    case 'home':
      return {
        filterHz: 1400,
        fadeIn: 2.4,
        fadeOut: 1.4,
        voices: [
          { hz: 98, level: 0.018, type: 'sine', pulseHz: 0.115, pulseDepth: 0.88 },
          {
            hz: 146.83,
            level: 0.011,
            type: 'sine',
            delay: 2.6,
            pulseHz: 0.115,
            pulseDepth: 0.9,
          },
          {
            hz: 130.81,
            level: 0.008,
            type: 'triangle',
            delay: 5.2,
            pulseHz: 0.115,
            pulseDepth: 0.92,
          },
        ],
      };
    case 'globe': {
      const depth = Math.min(8, Math.max(0, Math.floor(detail)));
      const voices: ScoreVoice[] = [
        { hz: 73.42, level: 0.02, type: 'sine', pulseHz: 0.14, pulseDepth: 0.82 },
      ];
      if (depth >= 1) voices.push({ hz: 110, level: 0.009, type: 'sine', pulseHz: 0.07, pulseDepth: 0.7 });
      if (depth >= 3) voices.push({ hz: 146.83, level: 0.008, type: 'triangle', pulseHz: 0.047, pulseDepth: 0.76 });
      if (depth >= 5) voices.push({ hz: 196, level: 0.006, type: 'sine', pulseHz: 0.035, pulseDepth: 0.82 });
      if (depth >= 7) voices.push({ hz: 261.63, level: 0.0045, type: 'sine', pulseHz: 0.028, pulseDepth: 0.88 });
      return { voices, filterHz: 1100, fadeIn: 2.0, fadeOut: 1.25 };
    }
    case 'action': {
      const band = Math.min(4, Math.max(0, Math.floor(detail)));
      const voices: ScoreVoice[] = [
        { hz: 98, level: 0.013, type: 'sine', pulseHz: 0.34, pulseDepth: 0.76 },
      ];
      if (band >= 1) voices.push({ hz: 196, level: 0.007, type: 'triangle', pulseHz: 0.17, pulseDepth: 0.84 });
      if (band >= 3) voices.push({ hz: 293.66, level: 0.005, type: 'sine', pulseHz: 0.113, pulseDepth: 0.9 });
      return { voices, filterHz: 1600, fadeIn: 1.5, fadeOut: 0.85 };
    }
    case 'warehouse': {
      // 0 calm, 1 workload, 2 contradiction, 3 finale. The bed thickens without
      // accelerating the player or turning decisions into a countdown.
      const level = Math.min(3, Math.max(0, Math.floor(detail)));
      const voices: ScoreVoice[] = [
        { hz: 65.41, level: 0.014, type: 'sine', pulseHz: 0.18, pulseDepth: 0.84 },
        { hz: 98, level: 0.006, type: 'triangle', pulseHz: 0.09, pulseDepth: 0.9 },
      ];
      if (level >= 1) voices.push({ hz: 130.81, level: 0.006, type: 'sine', pulseHz: 0.24, pulseDepth: 0.88 });
      if (level >= 2) voices.push({ hz: 196, level: 0.004, type: 'triangle', pulseHz: 0.121, pulseDepth: 0.92, detune: 9 });
      if (level >= 3) voices.push({ hz: 611, level: 0.0024, type: 'sine', pulseHz: 0.027, pulseDepth: 0.95, driftCents: 8, driftHz: 0.019 });
      return { voices, filterHz: level >= 2 ? 980 : 1380, fadeIn: 1.8, fadeOut: 1.1 };
    }
    case 'm4ss':
      return {
        filterHz: 360,
        fadeIn: 1.8,
        fadeOut: 1.25,
        voices: [
          {
            hz: 55,
            level: 0.022,
            type: 'sine',
            pulseHz: 0.44,
            pulseDepth: 0.93,
            driftCents: 4,
            driftHz: 0.08,
          },
          {
            hz: 82.41,
            level: 0.009,
            type: 'triangle',
            pulseHz: 0.22,
            pulseDepth: 0.9,
            driftCents: 7,
            driftHz: 0.052,
          },
        ],
      };
    case 'resolution':
      return {
        filterHz: 1050,
        fadeIn: 1.2,
        fadeOut: 1.0,
        voices: [
          { hz: 98, level: 0.011, type: 'sine', pulseHz: 0.09, pulseDepth: 0.55 },
          { hz: 146.83, level: 0.007, type: 'sine', pulseHz: 0.06, pulseDepth: 0.62 },
        ],
      };
    case 'ending':
      return {
        filterHz: 1500,
        fadeIn: 2.8,
        fadeOut: 1.2,
        voices: [
          { hz: 98, level: 0.015, type: 'sine', pulseHz: 0.075, pulseDepth: 0.62 },
          { hz: 130.81, level: 0.008, type: 'sine', delay: 1.8, pulseHz: 0.05, pulseDepth: 0.72 },
          { hz: 146.83, level: 0.008, type: 'triangle', delay: 3.6, pulseHz: 0.04, pulseDepth: 0.78 },
          { hz: 196, level: 0.006, type: 'sine', delay: 5.4, pulseHz: 0.03, pulseDepth: 0.84 },
        ],
      };
    case 'anomaly':
      return {
        filterHz: 900,
        fadeIn: 2.4,
        fadeOut: 1.6,
        voices: [
          { hz: 72.1, level: 0.014, type: 'sine', driftCents: 3, driftHz: 0.031 },
          { hz: 74.7, level: 0.013, type: 'sine', driftCents: 5, driftHz: 0.027 },
          {
            hz: 611,
            level: 0.0028,
            type: 'sine',
            pulseHz: 0.021,
            pulseDepth: 0.94,
            driftCents: 11,
            driftHz: 0.017,
          },
        ],
      };
  }
}

class AdaptiveScore {
  private desiredState: ScoreState = 'silent';
  private desiredDetail = 0;
  private active: LiveScore | null = null;
  private readonly stopTimers = new Set<number>();
  private readonly captionedStates = new Set<ScoreState>();

  /** Select a dramatic state. Safe before WebAudio unlock; update() will realise it later. */
  public setState(state: ScoreState, detail = 0): void {
    this.desiredState = state;
    this.desiredDetail = Number.isFinite(detail) ? detail : 0;
    this.captionState(state);
    this.apply();
  }

  /** Five broad musical steps across an interaction, never a per-frame pitch counter. */
  public setActionProgress(progress: number): void {
    if (this.desiredState !== 'action') return;
    const band = Math.floor(clamp01(progress) * 4.999);
    if (band === this.desiredDetail) return;
    this.desiredDetail = band;
    this.apply();
  }

  /**
   * One room-coloured fragment when a fact crosses into the machine.
   *
   * The console's `learn` cue happens first. This answer begins 180ms later, low enough to
   * read as the room colouring the fact instead of two notifications firing together.
   */
  public accentKnowledge(sceneId: string): void {
    const colour = KNOWLEDGE_COLOURS[sceneId];
    const bus = audio.bus();
    if (!colour || !bus) return;

    const [from, to, type] = colour;
    const now = bus.ctx.currentTime + 0.18;
    const length = 0.82;
    const osc = bus.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), now + length);

    const filter = bus.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = type === 'square' ? 1350 : 1850;
    filter.Q.value = 0.45;

    const gain = bus.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.024, now + 0.07);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + length);
    osc.connect(filter).connect(gain).connect(bus.music);
    osc.start(now);
    osc.stop(now + length + 0.04);
  }

  /** Retry desired state after the gesture-created shared bus becomes available. */
  public update(): void {
    this.apply();
  }

  /** Tear down every oscillator before the shared AudioContext is closed. */
  public dispose(): void {
    for (const timer of this.stopTimers) window.clearTimeout(timer);
    this.stopTimers.clear();
    this.active?.stopNow();
    this.active = null;
    this.desiredState = 'silent';
    this.desiredDetail = 0;
    this.captionedStates.clear();
  }

  private captionState(state: ScoreState): void {
    const caption = STATE_CAPTIONS[state];
    if (!caption || this.captionedStates.has(state)) return;
    this.captionedStates.add(state);
    emitSoundCaption(caption);
  }

  private apply(): void {
    const profile = profileFor(this.desiredState, this.desiredDetail);
    const key = `${this.desiredState}:${String(Math.floor(this.desiredDetail))}`;
    const bus = audio.bus();

    if (!profile) {
      this.fadeOutActive(1.1);
      return;
    }
    if (!bus) return;
    if (bus.ctx.state === 'suspended') void bus.ctx.resume();
    if (this.active?.ctx !== bus.ctx) {
      this.active?.stopNow();
      this.active = null;
    }
    if (this.active?.key === key) return;

    this.fadeOutActive(profile.fadeOut);
    this.active = this.build(bus.ctx, bus.music, key, profile);
  }

  private fadeOutActive(seconds: number): void {
    const outgoing = this.active;
    if (!outgoing) return;
    this.active = null;
    outgoing.gain.gain.cancelScheduledValues(outgoing.ctx.currentTime);
    outgoing.gain.gain.setTargetAtTime(0, outgoing.ctx.currentTime, Math.max(0.03, seconds / 3));
    const timer = window.setTimeout(() => {
      this.stopTimers.delete(timer);
      outgoing.stopNow();
    }, seconds * 1000 + 300);
    this.stopTimers.add(timer);
  }

  private build(ctx: AudioContext, out: GainNode, key: string, profile: ScoreProfile): LiveScore {
    const master = ctx.createGain();
    master.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = profile.filterHz;
    filter.Q.value = 0.35;
    master.connect(filter).connect(out);

    const oscillators: OscillatorNode[] = [];
    const now = ctx.currentTime;
    for (const voice of profile.voices) {
      const start = now + (voice.delay ?? 0);
      const osc = ctx.createOscillator();
      osc.type = voice.type ?? 'sine';
      osc.frequency.value = voice.hz;
      osc.detune.value = voice.detune ?? 0;

      const depth = clamp01(voice.pulseDepth ?? 0);
      const voiceGain = ctx.createGain();
      voiceGain.gain.value = voice.level * (1 - depth / 2);
      osc.connect(voiceGain).connect(master);
      osc.start(start);
      oscillators.push(osc);

      if (voice.pulseHz && depth > 0) {
        const pulse = ctx.createOscillator();
        pulse.type = 'sine';
        pulse.frequency.value = voice.pulseHz;
        const amount = ctx.createGain();
        amount.gain.value = (voice.level * depth) / 2;
        pulse.connect(amount).connect(voiceGain.gain);
        pulse.start(start);
        oscillators.push(pulse);
      }

      if (voice.driftCents && voice.driftHz) {
        const drift = ctx.createOscillator();
        drift.type = 'sine';
        drift.frequency.value = voice.driftHz;
        const amount = ctx.createGain();
        amount.gain.value = voice.driftCents;
        drift.connect(amount).connect(osc.detune);
        drift.start(start);
        oscillators.push(drift);
      }
    }

    master.gain.setTargetAtTime(1, now, Math.max(0.04, profile.fadeIn / 3));
    let stopped = false;
    return {
      key,
      ctx,
      gain: master,
      stopNow: () => {
        if (stopped) return;
        stopped = true;
        for (const osc of oscillators) {
          try {
            osc.stop();
          } catch {
            // Closing a context may have stopped it first. Either state is already quiet.
          }
          osc.disconnect();
        }
        master.disconnect();
        filter.disconnect();
      },
    };
  }
}

/** One score for one console, matching the ownership of ConsoleAudio and RoomTone. */
export const adaptiveScore = new AdaptiveScore();
