/**
 * Non-dialogue sound captions for players who cannot rely on the mix.
 *
 * This is deliberately an event channel rather than a dependency threaded through every
 * audio class. Audio and captions describe the same event, but neither may depend on the
 * other existing: captions must still fire at zero volume and before WebAudio is unlocked.
 */

import { ACCENT } from '../art/palette.js';
import {
  getAccessibilityPreferences,
  onAccessibilityPreferencesChanged,
} from './preferences.js';

export type SoundCaptionTier = 'gameplay' | 'all';
export type SoundCaptionKind = 'machine' | 'world' | 'warning' | 'success';

export interface SoundCaptionEvent {
  /** Short present-tense description without brackets; the rail supplies those. */
  text: string;
  /** Gameplay is essential feedback. All includes expressive and repeated Foley. */
  tier: SoundCaptionTier;
  kind?: SoundCaptionKind;
  /** Stable identity for de-duplicating a sound that can be sampled every frame. */
  key?: string;
  /** Match a delayed sound within an authored procedural sequence. */
  delayMs?: number;
  durationMs?: number;
}

type Listener = (event: Readonly<SoundCaptionEvent>) => void;

const STYLE_ID = 'omniscient-sound-captions';
const MAX_VISIBLE = 2;
const listeners = new Set<Listener>();

const CSS = `
.omni-sound-captions {
  position: absolute;
  top: clamp(58px, 8vh, 76px);
  left: 50%;
  z-index: 60;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  width: min(760px, 88vw);
  transform: translateX(-50%);
  pointer-events: none;
  font-family: 'Courier New', Courier, monospace;
  font-size: calc(12px + var(--omni-font-boost, 0px));
  letter-spacing: 0.07em;
  text-align: center;
}
.omni-sound-caption {
  max-width: 100%;
  padding: 7px 13px 6px;
  border: 1px solid rgba(127, 224, 138, 0.28);
  background: rgba(2, 8, 5, 0.88);
  box-shadow: 0 5px 22px rgba(0, 0, 0, 0.42);
  color: #cfe6c4;
  opacity: 0;
  transform: translateY(-4px);
  transition: opacity 110ms ease-out, transform 150ms ease-out;
}
.omni-sound-caption--shown { opacity: 1; transform: translateY(0); }
.omni-sound-caption--world { border-color: rgba(224, 162, 76, 0.38); color: ${ACCENT.amber}; }
.omni-sound-caption--warning { border-color: rgba(168, 64, 47, 0.58); color: #e49a84; }
.omni-sound-caption--success { border-color: rgba(127, 224, 138, 0.52); color: ${ACCENT.knowledge}; }
`;

/** Publish an audio description without requiring a mounted HUD or an audio context. */
export function emitSoundCaption(event: SoundCaptionEvent): void {
  for (const listener of listeners) listener(event);
}

/** Mount the restrained caption rail for the lifetime of the active game rig. */
export function installSoundCaptions(container: HTMLElement): () => void {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  const root = document.createElement('div');
  root.className = 'omni-sound-captions';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  root.setAttribute('aria-atomic', 'false');
  container.appendChild(root);

  const active = new Map<string, { element: HTMLDivElement; timer: number }>();
  const delayed = new Set<number>();

  const remove = (key: string): void => {
    const entry = active.get(key);
    if (!entry) return;
    window.clearTimeout(entry.timer);
    entry.element.classList.remove('omni-sound-caption--shown');
    window.setTimeout(() => entry.element.remove(), 170);
    active.delete(key);
  };

  const clear = (): void => {
    for (const key of [...active.keys()]) remove(key);
    for (const timer of delayed) window.clearTimeout(timer);
    delayed.clear();
  };

  const allowed = (event: Readonly<SoundCaptionEvent>): boolean => {
    const setting = getAccessibilityPreferences().soundCaptions;
    return setting === 'all' || (setting === 'gameplay' && event.tier === 'gameplay');
  };

  const show = (event: Readonly<SoundCaptionEvent>): void => {
    if (!allowed(event)) return;
    const key = event.key ?? event.text;
    const existing = active.get(key);
    if (existing) {
      window.clearTimeout(existing.timer);
      existing.element.className =
        `omni-sound-caption omni-sound-caption--${event.kind ?? 'machine'} ` +
        'omni-sound-caption--shown';
      existing.element.textContent = `[ ${event.text} ]`;
      existing.timer = window.setTimeout(() => remove(key), event.durationMs ?? 2600);
      return;
    }

    while (active.size >= MAX_VISIBLE) {
      const oldest = active.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      remove(oldest);
    }

    const line = document.createElement('div');
    line.className = `omni-sound-caption omni-sound-caption--${event.kind ?? 'machine'}`;
    line.textContent = `[ ${event.text} ]`;
    root.appendChild(line);
    window.requestAnimationFrame(() => line.classList.add('omni-sound-caption--shown'));

    const timer = window.setTimeout(() => remove(key), event.durationMs ?? 2600);
    active.set(key, { element: line, timer });
  };

  const receive = (event: Readonly<SoundCaptionEvent>): void => {
    if (!allowed(event)) return;
    const delay = Math.max(0, event.delayMs ?? 0);
    if (delay === 0) {
      show(event);
      return;
    }
    const timer = window.setTimeout(() => {
      delayed.delete(timer);
      show(event);
    }, delay);
    delayed.add(timer);
  };

  listeners.add(receive);
  let previousSetting = getAccessibilityPreferences().soundCaptions;
  const unsubscribePreferences = onAccessibilityPreferencesChanged((preferences) => {
    if (preferences.soundCaptions === previousSetting) return;
    previousSetting = preferences.soundCaptions;
    if (preferences.soundCaptions === 'off') {
      clear();
      return;
    }
    show({
      text:
        preferences.soundCaptions === 'gameplay'
          ? 'sound captions: gameplay cues'
          : 'sound captions: all cues',
      tier: 'gameplay',
      kind: 'machine',
      key: 'caption-mode',
      durationMs: 2200,
    });
  });

  return () => {
    listeners.delete(receive);
    unsubscribePreferences();
    clear();
    root.remove();
  };
}
