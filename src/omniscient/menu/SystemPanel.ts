/**
 * Settings and credits in the machine's own visual language.
 *
 * This remains authored DOM rather than a generic settings widget because it is part of
 * the console fiction. Underneath that skin the rows use focusable native buttons with
 * explicit slider/switch semantics, so mouse, keyboard and assistive technology all edit
 * the same persistent state.
 */

import { ACCENT } from '../art/palette.js';
import { audio } from '../audio/ConsoleAudio.js';
import {
  DISPLAY_FILTERS,
  FLASH_INTENSITIES,
  SCREEN_SHAKES,
  TEXT_SIZES,
  TEXT_SPEEDS,
  getAccessibilityPreferences,
  setAccessibilityPreference,
} from '../accessibility/preferences.js';
import { clearM4ssStage, clearSave } from '../session/persistence.js';

import type {
  DisplayFilter,
  FlashIntensity,
  ScreenShake,
  TextSize,
  TextSpeed,
} from '../accessibility/preferences.js';
import type { NavigationCommand } from '../input/FocusNavigator.js';

const STYLE_ID = 'omniscient-system-panel';
const TITLE_ID = 'omniscient-system-panel-title';

export type SystemScreen = 'settings' | 'credits';

const CSS = `
.omni-sys {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(2, 8, 5, 0.72);
  font-family: 'Courier New', Courier, monospace;
  color: #cfe6c4;
  z-index: 40;
  pointer-events: auto;
}
.omni-sys__frame {
  width: min(640px, 84vw);
  max-height: 86vh;
  overflow: hidden auto;
  border: 1px solid rgba(127, 224, 138, 0.32);
  background: linear-gradient(180deg, rgba(8, 24, 14, 0.97), rgba(4, 14, 9, 0.97));
  padding: 26px 30px 22px;
  box-shadow: 0 0 44px rgba(0, 0, 0, 0.6);
}
.omni-sys__title {
  font-size: calc(13px + var(--omni-font-boost, 0px));
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: ${ACCENT.knowledge};
  margin-bottom: 18px;
}
.omni-sys__row {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  min-height: 48px;
  padding: 10px;
  border: 1px solid transparent;
  color: inherit;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.omni-sys__row--on,
.omni-sys__row:focus-visible {
  outline: none;
  border-color: rgba(127, 224, 138, 0.5);
  background: rgba(127, 224, 138, 0.07);
}
.omni-sys__row:focus-visible {
  box-shadow: inset 3px 0 0 ${ACCENT.knowledge};
}
.omni-sys__label {
  flex: 0 0 184px;
  font-size: calc(12px + var(--omni-font-boost, 0px));
  letter-spacing: 0.1em;
}
.omni-sys__value {
  margin-left: auto;
  min-width: 112px;
  color: ${ACCENT.amber};
  font-size: calc(12px + var(--omni-font-boost, 0px));
  text-align: right;
  text-transform: uppercase;
}
.omni-sys__bar { display: flex; gap: 3px; flex: 1; min-width: 120px; }
.omni-sys__seg {
  flex: 1;
  height: 15px;
  background: rgba(127, 224, 138, 0.12);
  border: 1px solid rgba(127, 224, 138, 0.2);
}
.omni-sys__seg--lit { background: ${ACCENT.knowledge}; border-color: ${ACCENT.knowledge}; }
.omni-sys__note {
  margin-top: 16px;
  font-size: calc(11px + var(--omni-font-boost, 0px));
  line-height: 1.7;
  opacity: 0.68;
}
.omni-sys__credits {
  font-size: calc(12px + var(--omni-font-boost, 0px));
  line-height: 2;
}
.omni-sys__credits b { color: ${ACCENT.knowledge}; font-weight: normal; letter-spacing: 0.1em; }
@media (max-width: 620px) {
  .omni-sys__frame { width: 90vw; padding-inline: 18px; }
  .omni-sys__row { flex-wrap: wrap; gap: 8px 12px; }
  .omni-sys__label { flex-basis: calc(100% - 124px); }
  .omni-sys__bar { order: 3; flex-basis: 100%; }
}
`;

const VOLUME_STEPS = 10;

interface SettingRow {
  element: HTMLButtonElement;
  nudge?: (direction: number) => void;
  activate?: () => void;
  paint: () => void;
}

const TEXT_LABELS: Readonly<Record<TextSize, string>> = {
  standard: 'Standard',
  large: 'Large',
  largest: 'Largest',
};

const FILTER_LABELS: Readonly<Record<DisplayFilter, string>> = {
  full: 'Full',
  soft: 'Soft',
  off: 'Off',
};

const TEXT_SPEED_LABELS: Readonly<Record<TextSpeed, string>> = {
  standard: 'Standard',
  fast: 'Fast',
  instant: 'Instant',
};

const SHAKE_LABELS: Readonly<Record<ScreenShake, string>> = {
  full: 'Full',
  reduced: 'Reduced',
  off: 'Off',
};

const FLASH_LABELS: Readonly<Record<FlashIntensity, string>> = {
  full: 'Full',
  reduced: 'Reduced',
  off: 'Off',
};

/** A modal over the menu. Escape always returns focus to wherever the player came from. */
export class SystemPanel {
  private root: HTMLDivElement | null = null;
  private onKey: ((event: KeyboardEvent) => void) | null = null;
  private focused = 0;
  private rows: SettingRow[] = [];
  private previouslyFocused: HTMLElement | null = null;

  public constructor(
    private readonly container: HTMLElement,
    private readonly onClosed?: () => void
  ) {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }
  }

  public get isOpen(): boolean {
    return this.root !== null;
  }

  public open(screen: SystemScreen): void {
    this.close();
    this.previouslyFocused = document.activeElement as HTMLElement | null;

    const root = document.createElement('div');
    root.className = 'omni-sys';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', TITLE_ID);

    const frame = document.createElement('div');
    frame.className = 'omni-sys__frame';

    const title = document.createElement('div');
    title.id = TITLE_ID;
    title.className = 'omni-sys__title';
    title.textContent = screen === 'settings' ? 'Settings' : 'Credits';
    frame.appendChild(title);

    if (screen === 'settings') this.buildSettings(frame);
    else this.buildCredits(frame);

    const note = document.createElement('div');
    note.className = 'omni-sys__note';
    note.textContent =
      screen === 'settings'
        ? 'Up and down select. Left and right adjust. Enter confirms. Escape closes.'
        : 'Escape closes.';
    frame.appendChild(note);

    root.appendChild(frame);
    root.addEventListener('mousedown', (event) => {
      if (event.target === root) this.close();
    });

    this.container.appendChild(root);
    this.root = root;
    this.focused = 0;
    this.paint();

    this.onKey = (event: KeyboardEvent): void => this.handleKey(event);
    window.addEventListener('keydown', this.onKey);

    if (this.rows.length) {
      window.setTimeout(() => this.rows[0]?.element.focus({ preventScroll: true }), 0);
    }
  }

  public close(): void {
    const wasOpen = this.root !== null;
    if (this.onKey) window.removeEventListener('keydown', this.onKey);
    this.onKey = null;
    this.root?.remove();
    this.root = null;
    this.rows = [];
    this.previouslyFocused?.focus?.({ preventScroll: true });
    this.previouslyFocused = null;
    if (wasOpen) this.onClosed?.();
  }

  /** The same row mechanics used by the keyboard, exposed to the shared gamepad router. */
  public handleNavigation(command: NavigationCommand): boolean {
    if (!this.root) return false;
    if (command === 'back') {
      this.close();
      return true;
    }
    if (!this.rows.length) return false;
    if (command === 'up') this.moveFocus(-1);
    else if (command === 'down') this.moveFocus(1);
    else if (command === 'left') this.nudge(-1);
    else if (command === 'right') this.nudge(1);
    else if (command === 'activate') this.activate();
    else return false;
    this.paint();
    return true;
  }

  private handleKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      return;
    }
    if (!this.rows.length) return;

    let handled = true;
    if (event.key === 'Tab') this.moveFocus(event.shiftKey ? -1 : 1);
    else if (event.key === 'ArrowDown') this.moveFocus(1);
    else if (event.key === 'ArrowUp') this.moveFocus(-1);
    else if (event.key === 'ArrowLeft') this.nudge(-1);
    else if (event.key === 'ArrowRight') this.nudge(1);
    else if (
      event.key === 'Enter' ||
      event.key === 'Return' ||
      event.key === ' ' ||
      event.key === 'Spacebar'
    ) this.activate();
    else handled = false;

    if (!handled) return;
    event.preventDefault();
    event.stopPropagation();
    this.paint();
  }

  private moveFocus(direction: number): void {
    this.focused = (this.focused + this.rows.length + direction) % this.rows.length;
    this.rows[this.focused]?.element.focus({ preventScroll: true });
  }

  private focus(index: number): void {
    this.focused = index;
    this.rows[index]?.element.focus({ preventScroll: true });
    this.paint();
  }

  // -- screens ---------------------------------------------------------------

  private buildSettings(frame: HTMLElement): void {
    this.addVolumeRow(frame);
    this.addChoiceRow(
      frame,
      'TEXT SIZE',
      TEXT_SIZES,
      () => getAccessibilityPreferences().textSize,
      (value) => setAccessibilityPreference('textSize', value),
      (value) => TEXT_LABELS[value]
    );
    this.addChoiceRow(
      frame,
      'TEXT SPEED',
      TEXT_SPEEDS,
      () => getAccessibilityPreferences().textSpeed,
      (value) => setAccessibilityPreference('textSpeed', value),
      (value) => TEXT_SPEED_LABELS[value]
    );
    this.addChoiceRow(
      frame,
      'DISPLAY FILTER',
      DISPLAY_FILTERS,
      () => getAccessibilityPreferences().displayFilter,
      (value) => setAccessibilityPreference('displayFilter', value),
      (value) => FILTER_LABELS[value]
    );
    this.addMotionRow(frame);
    this.addChoiceRow(
      frame,
      'SCREEN SHAKE',
      SCREEN_SHAKES,
      () => getAccessibilityPreferences().screenShake,
      (value) => setAccessibilityPreference('screenShake', value),
      (value) => SHAKE_LABELS[value]
    );
    this.addChoiceRow(
      frame,
      'HIGH-INTENSITY FLASHES',
      FLASH_INTENSITIES,
      () => getAccessibilityPreferences().flashIntensity,
      (value) => setAccessibilityPreference('flashIntensity', value),
      (value) => FLASH_LABELS[value]
    );
    this.addResetRow(frame);
  }

  private addVolumeRow(frame: HTMLElement): void {
    const { element, value } = this.rowShell('VOLUME');
    element.setAttribute('role', 'slider');
    element.setAttribute('aria-label', 'Master volume');
    element.setAttribute('aria-valuemin', '0');
    element.setAttribute('aria-valuemax', '100');

    const bar = document.createElement('span');
    bar.className = 'omni-sys__bar';
    for (let i = 0; i < VOLUME_STEPS; i++) {
      const segment = document.createElement('span');
      segment.className = 'omni-sys__seg';
      segment.addEventListener('click', (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        this.focus(this.rows.findIndex((row) => row.element === element));
        audio.setVolume((i + 1) / VOLUME_STEPS);
        audio.play('tap');
        this.paint();
      });
      bar.appendChild(segment);
    }
    element.insertBefore(bar, value);

    const row: SettingRow = {
      element,
      nudge: (direction) => {
        const step = 1 / VOLUME_STEPS;
        audio.setVolume(
          Math.round((audio.getVolume() + direction * step) * VOLUME_STEPS) / VOLUME_STEPS
        );
        audio.play('tap');
      },
      paint: () => {
        const percent = Math.round(audio.getVolume() * 100);
        value.textContent = `${String(percent)}%`;
        element.setAttribute('aria-valuenow', String(percent));
        element.setAttribute('aria-valuetext', `${String(percent)} percent`);
        const lit = Math.round(audio.getVolume() * VOLUME_STEPS);
        bar.querySelectorAll('.omni-sys__seg').forEach((segment, index) => {
          segment.classList.toggle('omni-sys__seg--lit', index < lit);
        });
      },
    };
    this.register(frame, row, () => row.nudge?.(1));
  }

  private addChoiceRow<T extends string>(
    frame: HTMLElement,
    label: string,
    values: readonly T[],
    get: () => T,
    set: (value: T) => void,
    display: (value: T) => string
  ): void {
    const { element, value } = this.rowShell(label);
    element.setAttribute('role', 'slider');
    element.setAttribute('aria-label', label.toLocaleLowerCase());
    element.setAttribute('aria-valuemin', '0');
    element.setAttribute('aria-valuemax', String(values.length - 1));

    const change = (direction: number): void => {
      const at = Math.max(0, values.indexOf(get()));
      const next = (at + values.length + direction) % values.length;
      set(values[next]);
      audio.play('tap');
    };
    const row: SettingRow = {
      element,
      nudge: change,
      paint: () => {
        const selected = get();
        const labelText = display(selected);
        value.textContent = `‹  ${labelText}  ›`;
        element.setAttribute('aria-valuenow', String(values.indexOf(selected)));
        element.setAttribute('aria-valuetext', labelText);
      },
    };
    this.register(frame, row, () => change(1));
  }

  private addMotionRow(frame: HTMLElement): void {
    const { element, value } = this.rowShell('REDUCED MOTION');
    element.setAttribute('role', 'switch');
    element.setAttribute('aria-label', 'Reduced motion');

    const toggle = (): void => {
      setAccessibilityPreference(
        'reducedMotion',
        !getAccessibilityPreferences().reducedMotion
      );
      audio.play('tap');
    };
    const row: SettingRow = {
      element,
      nudge: toggle,
      activate: toggle,
      paint: () => {
        const enabled = getAccessibilityPreferences().reducedMotion;
        value.textContent = enabled ? 'On' : 'Off';
        element.setAttribute('aria-checked', String(enabled));
      },
    };
    this.register(frame, row, toggle);
  }

  private addResetRow(frame: HTMLElement): void {
    const { element, value } = this.rowShell('RESET SAVE');
    value.textContent = 'Erase all progress';
    element.setAttribute('aria-label', 'Reset save data');

    let armed = false;
    const fire = (): void => {
      if (!armed) {
        armed = true;
        value.textContent = 'Sure? Confirm again';
        element.setAttribute('aria-label', 'Confirm reset of all save data');
        audio.play('reject');
        return;
      }
      clearSave();
      clearM4ssStage();
      audio.play('failed');
      window.setTimeout(() => window.location.reload(), 250);
    };
    const row: SettingRow = {
      element,
      activate: fire,
      paint: () => undefined,
    };
    this.register(frame, row, fire);
  }

  private buildCredits(frame: HTMLElement): void {
    const body = document.createElement('div');
    body.className = 'omni-sys__credits';
    for (const [role, who] of [
      ['BUILT BY', 'Paul'],
      ['ENGINE', 'Genesys'],
      ['MADE FOR', 'Beta Creators Game Jam - "Overgrown"'],
      ['EVERY MESH', 'generated, not modelled'],
      ['EVERY SOUND', 'synthesised, no samples'],
    ] as const) {
      const line = document.createElement('div');
      const tag = document.createElement('b');
      tag.textContent = `${role}  `;
      line.appendChild(tag);
      line.appendChild(document.createTextNode(who));
      body.appendChild(line);
    }
    frame.appendChild(body);
    this.rows = [];
  }

  // -- row mechanics ---------------------------------------------------------

  private rowShell(labelText: string): {
    element: HTMLButtonElement;
    value: HTMLSpanElement;
  } {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'omni-sys__row';
    element.tabIndex = -1;

    const label = document.createElement('span');
    label.className = 'omni-sys__label';
    label.textContent = labelText;

    const value = document.createElement('span');
    value.className = 'omni-sys__value';
    element.append(label, value);
    return { element, value };
  }

  private register(frame: HTMLElement, row: SettingRow, onClick: () => void): void {
    const index = this.rows.length;
    this.rows.push(row);
    row.element.addEventListener('click', () => {
      this.focus(index);
      onClick();
      this.paint();
    });
    row.element.addEventListener('focus', () => {
      this.focused = index;
      this.paint();
    });
    frame.appendChild(row.element);
  }

  private nudge(direction: number): void {
    this.rows[this.focused]?.nudge?.(direction);
  }

  private activate(): void {
    const row = this.rows[this.focused];
    if (!row) return;
    if (row.activate) row.activate();
    else row.nudge?.(1);
  }

  private paint(): void {
    this.rows.forEach((row, index) => {
      row.element.classList.toggle('omni-sys__row--on', index === this.focused);
      row.element.tabIndex = index === this.focused ? 0 : -1;
      row.paint();
    });
  }
}
