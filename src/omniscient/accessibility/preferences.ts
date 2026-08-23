/**
 * Player comfort preferences shared by every OMNISCIENT_ surface.
 *
 * These live outside the settings panel because the panel is only one editor of the
 * values. The boot screen, contact console, camera and CRT pass all have to see the same
 * state before the panel has ever been opened, and they have to update while it is open.
 */

export type TextSize = 'standard' | 'large' | 'largest';
export type DisplayFilter = 'full' | 'soft' | 'off';
export type ScreenShake = 'full' | 'reduced' | 'off';
export type FlashIntensity = 'full' | 'reduced' | 'off';
export type TextSpeed = 'standard' | 'fast' | 'instant';
export type SoundCaptions = 'off' | 'gameplay' | 'all';

export interface AccessibilityPreferences {
  textSize: TextSize;
  displayFilter: DisplayFilter;
  reducedMotion: boolean;
  screenShake: ScreenShake;
  flashIntensity: FlashIntensity;
  textSpeed: TextSpeed;
  soundCaptions: SoundCaptions;
}

const STORAGE_KEY = 'omniscient.accessibility.v1';
const STYLE_ID = 'omniscient-accessibility';

export const TEXT_SIZES: readonly TextSize[] = ['standard', 'large', 'largest'];
export const DISPLAY_FILTERS: readonly DisplayFilter[] = ['full', 'soft', 'off'];
export const SCREEN_SHAKES: readonly ScreenShake[] = ['full', 'reduced', 'off'];
export const FLASH_INTENSITIES: readonly FlashIntensity[] = ['full', 'reduced', 'off'];
export const TEXT_SPEEDS: readonly TextSpeed[] = ['standard', 'fast', 'instant'];
export const SOUND_CAPTIONS: readonly SoundCaptions[] = ['off', 'gameplay', 'all'];

const TEXT_BOOST: Readonly<Record<TextSize, number>> = {
  standard: 0,
  large: 2,
  largest: 4,
};

const SHAKE_SCALE: Readonly<Record<ScreenShake, number>> = {
  full: 1,
  reduced: 0.3,
  off: 0,
};

const TEXT_SPEED_SCALE: Readonly<Record<TextSpeed, number>> = {
  standard: 1,
  fast: 0.42,
  instant: 0,
};

type Listener = (preferences: Readonly<AccessibilityPreferences>) => void;

function systemReducedMotion(): boolean {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}

function defaults(): AccessibilityPreferences {
  return {
    textSize: 'standard',
    displayFilter: 'full',
    reducedMotion: systemReducedMotion(),
    screenShake: systemReducedMotion() ? 'off' : 'full',
    flashIntensity: 'full',
    textSpeed: 'standard',
    soundCaptions: 'off',
  };
}

function load(): AccessibilityPreferences {
  const fallback = defaults();
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return fallback;

    const stored = JSON.parse(raw) as Partial<AccessibilityPreferences>;
    const reducedMotion =
      typeof stored.reducedMotion === 'boolean'
        ? stored.reducedMotion
        : fallback.reducedMotion;
    return {
      textSize: TEXT_SIZES.includes(stored.textSize as TextSize)
        ? (stored.textSize as TextSize)
        : fallback.textSize,
      displayFilter: DISPLAY_FILTERS.includes(stored.displayFilter as DisplayFilter)
        ? (stored.displayFilter as DisplayFilter)
        : fallback.displayFilter,
      reducedMotion,
      screenShake: SCREEN_SHAKES.includes(stored.screenShake as ScreenShake)
        ? (stored.screenShake as ScreenShake)
        : reducedMotion
          ? 'off'
          : fallback.screenShake,
      flashIntensity: FLASH_INTENSITIES.includes(
        stored.flashIntensity as FlashIntensity
      )
        ? (stored.flashIntensity as FlashIntensity)
        : fallback.flashIntensity,
      textSpeed: TEXT_SPEEDS.includes(stored.textSpeed as TextSpeed)
        ? (stored.textSpeed as TextSpeed)
        : fallback.textSpeed,
      soundCaptions: SOUND_CAPTIONS.includes(stored.soundCaptions as SoundCaptions)
        ? (stored.soundCaptions as SoundCaptions)
        : fallback.soundCaptions,
    };
  } catch {
    // Storage can be unavailable in embedded/private contexts. Comfort options should
    // become session-only there, never become a reason the game cannot boot.
    return fallback;
  }
}

let current = load();
const listeners = new Set<Listener>();

export function getAccessibilityPreferences(): Readonly<AccessibilityPreferences> {
  return current;
}

export function setAccessibilityPreference<K extends keyof AccessibilityPreferences>(
  key: K,
  value: AccessibilityPreferences[K]
): void {
  if (current[key] === value) return;
  current = { ...current, [key]: value };
  try {
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // The live session still changes even when persistence is unavailable.
  }
  for (const listener of listeners) listener(current);
}

export function onAccessibilityPreferencesChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Apply DOM-facing preferences to the game's own container.
 *
 * Font sizes use a pixel boost instead of CSS multiplication. The shipped Chromium
 * accepts multiplied lengths, but published WebViews have historically lagged CSS Values
 * Level 4; addition in calc() is the reliable form everywhere this game runs.
 */
export function installAccessibilityPreferences(container: HTMLElement): () => void {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
.omni-a11y--reduced-motion *,
.omni-a11y--reduced-motion *::before,
.omni-a11y--reduced-motion *::after {
  scroll-behavior: auto !important;
  animation-duration: 1ms !important;
  animation-delay: 0ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 1ms !important;
  transition-delay: 0ms !important;
}
.omni-a11y--flash-reduced .omni-terminal__input--called {
  animation-iteration-count: 1 !important;
}
.omni-a11y--flash-reduced .omni-plot--complete {
  animation: none !important;
  filter: brightness(1.14);
}
.omni-a11y--flash-off .omni-terminal__input--called,
.omni-a11y--flash-off .omni-card__value--changed,
.omni-a11y--flash-off .omni-plot--complete,
.omni-a11y--flash-off .omni-tab__live,
.omni-a11y--flash-off .omni-note-flag::before {
  animation: none !important;
  filter: none !important;
}
`;
    document.head.appendChild(style);
  }

  const apply = (preferences: Readonly<AccessibilityPreferences>): void => {
    container.style.setProperty(
      '--omni-font-boost',
      `${String(TEXT_BOOST[preferences.textSize])}px`
    );
    container.classList.toggle('omni-a11y--reduced-motion', preferences.reducedMotion);
    container.classList.toggle(
      'omni-a11y--flash-reduced',
      preferences.flashIntensity === 'reduced'
    );
    container.classList.toggle(
      'omni-a11y--flash-off',
      preferences.flashIntensity === 'off'
    );
    container.dataset.omniTextSize = preferences.textSize;
    container.dataset.omniDisplayFilter = preferences.displayFilter;
    container.dataset.omniScreenShake = preferences.screenShake;
    container.dataset.omniFlashIntensity = preferences.flashIntensity;
    container.dataset.omniTextSpeed = preferences.textSpeed;
    container.dataset.omniSoundCaptions = preferences.soundCaptions;
  };

  apply(current);
  const unsubscribe = onAccessibilityPreferencesChanged(apply);
  return () => {
    unsubscribe();
    container.style.removeProperty('--omni-font-boost');
    container.classList.remove('omni-a11y--reduced-motion');
    container.classList.remove('omni-a11y--flash-reduced', 'omni-a11y--flash-off');
    delete container.dataset.omniTextSize;
    delete container.dataset.omniDisplayFilter;
    delete container.dataset.omniScreenShake;
    delete container.dataset.omniFlashIntensity;
    delete container.dataset.omniTextSpeed;
    delete container.dataset.omniSoundCaptions;
  };
}

/** Keep necessary camera reframing, but remove the sustained travel that causes discomfort. */
export function accessibleCameraDuration(seconds: number): number {
  return current.reducedMotion ? Math.min(seconds, 0.12) : seconds;
}

/** Scale only camera displacement. World recoil and material motion remain informative. */
export function accessibleScreenShakeScale(): number {
  return SHAKE_SCALE[current.screenShake];
}

/** Scale authored typewriter intervals and their reading dwells without changing copy. */
export function accessibleTextSeconds(seconds: number): number {
  return seconds * TEXT_SPEED_SCALE[current.textSpeed];
}

/** Millisecond counterpart for DOM timers. Zero deliberately means reveal immediately. */
export function accessibleTextMilliseconds(milliseconds: number): number {
  return Math.round(milliseconds * TEXT_SPEED_SCALE[current.textSpeed]);
}
