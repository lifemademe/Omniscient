/**
 * One navigation language for OMNISCIENT_'s physical front door and screen-space console.
 *
 * Pointer input remains native. Keyboard and gamepad input come through Genesys' input
 * manager so they can be consumed before gameplay handlers, then the active screen decides
 * whether a direction means "next plate", "next signal", or spatial DOM focus.
 */

import * as ENGINE from '@gnsx/genesys.js';

export type NavigationMode =
  | 'disabled'
  | 'boot'
  | 'menu'
  | 'globe'
  | 'dom'
  | 'system'
  | 'ending';

export type NavigationDirection = 'up' | 'down' | 'left' | 'right';
export type NavigationCommand = NavigationDirection | 'activate' | 'back';

export interface NavigationHost {
  mode(): NavigationMode;
  command(command: NavigationCommand): boolean;
}

const STYLE_ID = 'omniscient-focus-navigation';
const FOCUS_CLASS = 'omni-nav-focus';
const AXIS_THRESHOLD = 0.58;
const INITIAL_REPEAT = 0.34;
const REPEAT_RATE = 0.12;

const DIRECTION_KEYS = new Map<string, NavigationDirection>([
  ['ArrowUp', 'up'],
  ['ArrowDown', 'down'],
  ['ArrowLeft', 'left'],
  ['ArrowRight', 'right'],
]);

const COMMAND_HINTS: Readonly<Record<Exclude<NavigationMode, 'disabled'>, string>> = {
  boot: 'A  START',
  menu: 'D-PAD  SELECT     A  CONNECT',
  globe: 'D-PAD  SIGNAL     A  ANSWER     B  MACHINE',
  dom: 'D-PAD  MOVE     A  SELECT',
  system: 'D-PAD  ADJUST     A  CONFIRM     B  CLOSE',
  ending: 'A  CONTINUE     B  RETURN',
};

type Focusable = HTMLElement;

function directionForKey(event: KeyboardEvent): NavigationDirection | null {
  return DIRECTION_KEYS.get(event.code) ?? DIRECTION_KEYS.get(event.key) ?? null;
}

function isActivationKey(event: KeyboardEvent): boolean {
  return (
    event.code === 'Enter' ||
    event.code === 'NumpadEnter' ||
    event.code === 'Space' ||
    event.key === 'Enter' ||
    event.key === 'Return' ||
    event.key === ' ' ||
    event.key === 'Space' ||
    event.key === 'Spacebar'
  );
}

function isTextEntry(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element.isContentEditable
  );
}

function isRendered(element: HTMLElement): boolean {
  if (!element.isConnected || element.hidden || element.getAttribute('aria-hidden') === 'true') {
    return false;
  }
  const rect = element.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return false;
  const style = getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function isVisible(element: HTMLElement): boolean {
  return isRendered(element) && getComputedStyle(element).pointerEvents !== 'none';
}

/**
 * Dispatch the event the control was authored for.
 *
 * Some console controls intentionally commit on mousedown because committing rebuilds the
 * row before mouseup. Those handlers prevent the event's default. A normal click-only
 * control does not, so it falls through to click. This lets one keyboard/gamepad action use
 * both kinds without firing a control twice.
 */
function press(element: Focusable): void {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    element.focus({ preventScroll: true });
    return;
  }

  const down = new MouseEvent('mousedown', {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: 1,
    view: window,
  });
  const wantsClick = element.dispatchEvent(down);
  if (wantsClick && element.isConnected) element.click();
}

export class FocusNavigator extends ENGINE.BaseInputHandler {
  private readonly hint: HTMLDivElement;
  private gamepadModality = false;
  private lastMode: NavigationMode = 'disabled';
  private focused: Focusable | null = null;

  /** Direction per physical source (keyboard key, d-pad button, or stick axis). */
  private readonly held = new Map<string, NavigationDirection>();
  /** Key-up must be consumed too, even when key-down changed the active screen. */
  private readonly consumedKeys = new Set<string>();
  private repeatDirection: NavigationDirection | null = null;
  private repeatIn = INITIAL_REPEAT;

  private readonly onPointer = (): void => this.usePointerOrKeyboard();
  private readonly onKeyboard = (event: KeyboardEvent): void => {
    if (event.isTrusted) this.usePointerOrKeyboard();
  };

  public constructor(
    private readonly container: HTMLElement,
    private readonly host: NavigationHost
  ) {
    super();
    this.injectStyles();

    this.hint = document.createElement('div');
    this.hint.className = 'omni-nav-hint';
    this.hint.setAttribute('aria-hidden', 'true');
    this.container.appendChild(this.hint);

    this.container.addEventListener('pointerdown', this.onPointer, true);
    window.addEventListener('keydown', this.onKeyboard, true);
  }

  public update(deltaTime: number): void {
    const mode = this.host.mode();
    if (mode !== this.lastMode) {
      this.lastMode = mode;
      this.held.clear();
      this.repeatDirection = null;
      this.clearFocus();
    }
    this.paintHint(mode);

    if (!this.repeatDirection || !this.isHeld(this.repeatDirection)) return;
    this.repeatIn -= Math.min(deltaTime, 0.1);
    if (this.repeatIn > 0) return;
    this.dispatchDirection(this.repeatDirection, mode);
    this.repeatIn = REPEAT_RATE;
  }

  public dispose(): void {
    this.container.removeEventListener('pointerdown', this.onPointer, true);
    window.removeEventListener('keydown', this.onKeyboard, true);
    this.clearFocus();
    this.hint.remove();
    this.held.clear();
    this.consumedKeys.clear();
  }

  public override handleKeyDown(event: KeyboardEvent): boolean {
    const mode = this.host.mode();
    if (
      mode === 'disabled' ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      isTextEntry(document.activeElement)
    ) {
      return false;
    }

    let handled = false;
    const direction = directionForKey(event);
    if (mode === 'boot') {
      handled = this.host.command('activate');
    } else if (direction) {
      this.hold(`key:${event.code || event.key}`, direction, mode);
      handled = true;
    } else if (event.key === 'Tab') {
      if (mode === 'dom') this.moveLinear(event.shiftKey ? -1 : 1);
      else handled = this.host.command(event.shiftKey ? 'up' : 'down');
    } else if (isActivationKey(event)) {
      handled = this.dispatchCommand('activate', mode);
    } else if (
      (event.code === 'Escape' || event.key === 'Escape' || event.key === 'Esc') &&
      (mode === 'globe' || mode === 'system' || mode === 'ending')
    ) {
      handled = this.dispatchCommand('back', mode);
    }

    if (!handled) return false;
    this.consumedKeys.add(event.code || event.key);
    this.usePointerOrKeyboard();
    event.preventDefault();
    event.stopImmediatePropagation();
    return true;
  }

  public override handleKeyUp(event: KeyboardEvent): boolean {
    const id = event.code || event.key;
    this.release(`key:${id}`);
    if (!this.consumedKeys.delete(id)) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    return true;
  }

  public override handleGamepadButtonDown(
    gamepadIndex: number,
    buttonIndex: number,
    _value: number
  ): boolean {
    const mode = this.host.mode();
    if (mode === 'disabled') return false;

    this.useGamepad();
    const source = `pad:${gamepadIndex}:button:${buttonIndex}`;
    const direction = this.directionForButton(buttonIndex);
    if (direction) {
      this.hold(source, direction, mode);
      return true;
    }
    if (buttonIndex === ENGINE.GamepadButton.FaceBottom) {
      return this.dispatchCommand('activate', mode);
    }
    if (buttonIndex === ENGINE.GamepadButton.FaceRight) {
      return this.dispatchCommand('back', mode);
    }
    if (buttonIndex === ENGINE.GamepadButton.LeftBumper) {
      this.hold(source, 'left', mode);
      return true;
    }
    if (buttonIndex === ENGINE.GamepadButton.RightBumper) {
      this.hold(source, 'right', mode);
      return true;
    }
    return false;
  }

  public override handleGamepadButtonUp(gamepadIndex: number, buttonIndex: number): boolean {
    this.release(`pad:${gamepadIndex}:button:${buttonIndex}`);
    return false;
  }

  public override handleGamepadAxisChange(
    gamepadIndex: number,
    axisIndex: number,
    value: number
  ): boolean {
    const mode = this.host.mode();
    const horizontal = axisIndex === ENGINE.GamepadAxis.LeftStickX;
    const vertical = axisIndex === ENGINE.GamepadAxis.LeftStickY;
    if (!horizontal && !vertical) return false;

    const source = `pad:${gamepadIndex}:axis:${axisIndex}`;
    if (mode === 'disabled') {
      this.release(source);
      return false;
    }

    const direction =
      Math.abs(value) < AXIS_THRESHOLD
        ? null
        : horizontal
          ? value < 0
            ? 'left'
            : 'right'
          : value < 0
            ? 'up'
            : 'down';

    if (!direction) {
      this.release(source);
      return false;
    }
    this.useGamepad();
    this.hold(source, direction, mode);
    return true;
  }

  private directionForButton(button: number): NavigationDirection | null {
    if (button === ENGINE.GamepadButton.DpadUp) return 'up';
    if (button === ENGINE.GamepadButton.DpadDown) return 'down';
    if (button === ENGINE.GamepadButton.DpadLeft) return 'left';
    if (button === ENGINE.GamepadButton.DpadRight) return 'right';
    return null;
  }

  private hold(source: string, direction: NavigationDirection, mode: NavigationMode): void {
    if (this.held.get(source) === direction) return;
    this.held.set(source, direction);
    this.repeatDirection = direction;
    this.repeatIn = INITIAL_REPEAT;
    this.dispatchDirection(direction, mode);
  }

  private release(source: string): void {
    const direction = this.held.get(source);
    if (!direction) return;
    this.held.delete(source);
    if (this.repeatDirection !== direction || this.isHeld(direction)) return;
    const remaining = Array.from(this.held.values());
    const next = remaining.length ? remaining[remaining.length - 1] : null;
    this.repeatDirection = next;
    this.repeatIn = INITIAL_REPEAT;
  }

  private isHeld(direction: NavigationDirection): boolean {
    return Array.from(this.held.values()).includes(direction);
  }

  private dispatchDirection(direction: NavigationDirection, mode: NavigationMode): boolean {
    if (mode === 'dom') {
      const candidates = this.candidates();
      const active = this.current(candidates);
      const axis = active?.dataset.omniNavAxis;
      const onAxis =
        (axis === 'horizontal' && (direction === 'left' || direction === 'right')) ||
        (axis === 'vertical' && (direction === 'up' || direction === 'down'));
      if (active && onAxis) {
        active.dispatchEvent(
          new CustomEvent<NavigationDirection>('omni-navigate', { detail: direction })
        );
        return true;
      }
      this.moveSpatial(direction);
      return true;
    }
    return this.host.command(direction);
  }

  private dispatchCommand(command: NavigationCommand, mode: NavigationMode): boolean {
    if (mode !== 'dom') return this.host.command(command);
    if (command !== 'activate') return false;

    const candidates = this.candidates();
    const active = this.current(candidates);
    if (!active) {
      this.focus(candidates[0] ?? null);
      return candidates.length > 0;
    }
    if (active.dataset.omniNavAxis) return true;
    press(active);
    return true;
  }

  private moveLinear(direction: number): void {
    const candidates = this.candidates();
    if (!candidates.length) return;
    const current = this.current(candidates);
    const at = current ? candidates.indexOf(current) : direction > 0 ? -1 : 0;
    const next = (at + candidates.length + direction) % candidates.length;
    this.focus(candidates[next]);
  }

  private moveSpatial(direction: NavigationDirection): void {
    const candidates = this.candidates();
    if (!candidates.length) return;
    const current = this.current(candidates);
    if (!current) {
      this.focus(candidates[0]);
      return;
    }

    const from = current.getBoundingClientRect();
    const fx = from.left + from.width / 2;
    const fy = from.top + from.height / 2;
    const vector =
      direction === 'left'
        ? { x: -1, y: 0 }
        : direction === 'right'
          ? { x: 1, y: 0 }
          : direction === 'up'
            ? { x: 0, y: -1 }
            : { x: 0, y: 1 };

    let best: { element: Focusable; score: number } | null = null;
    for (const element of candidates) {
      if (element === current) continue;
      const rect = element.getBoundingClientRect();
      const dx = rect.left + rect.width / 2 - fx;
      const dy = rect.top + rect.height / 2 - fy;
      const forward = dx * vector.x + dy * vector.y;
      if (forward <= 2) continue;
      const cross = Math.abs(dx * vector.y - dy * vector.x);
      const score = forward + cross * 2.35 + Math.hypot(dx, dy) * 0.08;
      if (!best || score < best.score) best = { element, score };
    }

    if (best) this.focus(best.element);
    else this.moveLinear(direction === 'up' || direction === 'left' ? -1 : 1);
  }

  private candidates(): Focusable[] {
    const roots = Array.from(this.container.querySelectorAll<HTMLElement>('.omni-cv'));
    // The console frame is click-through by design; its controls opt back in individually.
    const scope = roots.find((root) => isRendered(root));
    if (!scope) return [];

    const selector = [
      'button:not([disabled])',
      'input:not([disabled]):not([type="hidden"])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');
    return Array.from(scope.querySelectorAll<Focusable>(selector)).filter(isVisible);
  }

  private current(candidates: Focusable[]): Focusable | null {
    const active = document.activeElement;
    if (active instanceof HTMLElement && candidates.includes(active as Focusable)) {
      return active as Focusable;
    }
    if (this.focused && candidates.includes(this.focused)) return this.focused;
    return null;
  }

  private focus(element: Focusable | null): void {
    this.clearFocus();
    if (!element) return;
    this.focused = element;
    element.classList.add(FOCUS_CLASS);
    element.focus({ preventScroll: true });
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  private clearFocus(): void {
    this.focused?.classList.remove(FOCUS_CLASS);
    this.focused = null;
  }

  private useGamepad(): void {
    this.gamepadModality = true;
    this.paintHint(this.host.mode());
  }

  private usePointerOrKeyboard(): void {
    this.gamepadModality = false;
    this.clearFocus();
    this.paintHint(this.host.mode());
  }

  private paintHint(mode: NavigationMode): void {
    const visible = this.gamepadModality && mode !== 'disabled';
    this.hint.textContent = visible ? COMMAND_HINTS[mode] : '';
    this.hint.classList.toggle('omni-nav-hint--on', visible);
  }

  private injectStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
.${FOCUS_CLASS} {
  outline: 2px solid #d8ffb0 !important;
  outline-offset: 3px !important;
  box-shadow: 0 0 0 1px #07100a, 0 0 14px rgba(127, 224, 138, 0.38) !important;
}
.omni-cv button:focus-visible,
.omni-cv input:focus-visible,
.omni-cv select:focus-visible,
.omni-cv textarea:focus-visible {
  outline: 2px solid #d8ffb0;
  outline-offset: 3px;
}
.omni-terminal__input.${FOCUS_CLASS} {
  background: rgba(127, 224, 138, 0.08);
}
.omni-nav-hint {
  position: absolute;
  left: 50%;
  bottom: 12px;
  z-index: 2400;
  max-width: calc(100% - 32px);
  transform: translate(-50%, 8px);
  padding: 5px 10px;
  border: 1px solid rgba(127, 224, 138, 0.28);
  background: rgba(3, 10, 6, 0.88);
  color: #8fbe93;
  font: 10px/1.3 "Courier New", ui-monospace, monospace;
  letter-spacing: 0.14em;
  text-align: center;
  white-space: pre-wrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 120ms linear, transform 120ms ease-out;
}
.omni-nav-hint--on { opacity: 0.86; transform: translate(-50%, 0); }
`;
    document.head.appendChild(style);
  }
}
