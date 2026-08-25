/**
 * The tuning panel. F8.
 *
 * Every art judgement this project has made has cost a source edit, a thirty-second
 * rebuild, a play-mode entry and a screenshot. That loop is why the desk lamp took three
 * passes to stand in the right place and the enamel crackle took four to find its scale -
 * not because the judgements were hard, but because each one cost half a minute to see.
 *
 * This panel is that loop collapsed to zero for anything expressible as a number: drag a
 * slider in play mode, watch the room change, press COPY, and paste the settled values
 * back into source. The clipboard is the output - the panel never persists anything
 * itself, because the source file is the single place a tuned value is allowed to live
 * (§123: the same build must always produce the same picture).
 *
 * Dev-only in behaviour rather than in build: it ships hidden behind F8 and touches
 * nothing until opened. Stripping it entirely would mean a second build configuration,
 * which is more machinery than a jam build wants.
 *
 * ## Keyboard-first, and why
 *
 * F8 opens it; up/down pick a row, left/right nudge it, shift for a fine step, C copies.
 * The mouse also works if it reaches the panel - but in this embedded runtime,
 * synthetically driven clicks that demonstrably land on other overlays never arrived
 * here, and after four cycles of chasing hit-testing through pointer-events, stale style
 * tags and app-region theories, the honest engineering call was to stop depending on the
 * answer. Keys reach the window whenever it has focus, they need no coordinate math to
 * automate, and a tuning tool that cannot be trusted to receive input is not a tool.
 *
 * Safe-UI: every label is textContent. Nothing here renders content from outside the
 * source file, but the rule is the rule.
 */

const STYLE_ID = 'omniscient-tune-styles';

const TUNE_CSS = `
.omni-tune {
  position: absolute;
  top: 10px;
  right: 10px;
  /* The game container is pointer-events none and every overlay opts back in - the same
     convention that once made the globe unclickable when forgotten. Verified by clicking:
     the first build of this panel rendered perfectly and swallowed every drag. */
  pointer-events: auto;
  width: 264px;
  max-height: calc(100% - 20px);
  overflow-y: auto;
  z-index: 80;
  padding: 8px 10px 10px;
  background: rgba(8, 14, 10, 0.94);
  border: 1px solid rgba(127, 224, 138, 0.4);
  border-radius: 4px;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 11px;
  color: #cfe9d2;
}
.omni-tune__head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 6px;
}
.omni-tune__title { letter-spacing: 0.1em; color: #7fe08a; }
.omni-tune__copy {
  padding: 1px 8px;
  border: 1px solid rgba(127, 224, 138, 0.5);
  border-radius: 3px;
  background: transparent;
  color: #cfe9d2;
  font: inherit;
  font-size: 10px;
  cursor: pointer;
}
.omni-tune__copy:hover { border-color: #7fe08a; }
.omni-tune__group { margin: 7px 0 2px; color: #9fd8a8; letter-spacing: 0.08em; }
.omni-tune__row {
  display: grid;
  grid-template-columns: 74px 1fr 44px;
  gap: 6px;
  align-items: center;
  margin: 2px 0;
}
.omni-tune__row label { overflow: hidden; white-space: nowrap; }
.omni-tune__row input[type='range'] { width: 100%; accent-color: #7fe08a; height: 10px; }
.omni-tune__row input[type='color'] {
  width: 100%;
  height: 16px;
  padding: 0;
  border: 1px solid rgba(127, 224, 138, 0.4);
  background: transparent;
}
.omni-tune__value { text-align: right; color: rgba(207, 233, 210, 0.75); }
.omni-tune__row--sel {
  background: rgba(127, 224, 138, 0.14);
  outline: 1px solid rgba(127, 224, 138, 0.4);
}
.omni-tune__hint { margin-top: 6px; font-size: 9px; color: rgba(159, 216, 168, 0.55); }
`;

interface SliderSpec {
  label: string;
  min: number;
  max: number;
  step?: number;
  get: () => number;
  set: (value: number) => void;
}

/** A row the arrow keys can land on. */
interface KeyRow {
  element: HTMLDivElement;
  /** Nudge by direction * (fine ? small : coarse). Absent on rows that only display. */
  adjust?: (direction: 1 | -1, fine: boolean) => void;
}

interface ColorSpec {
  label: string;
  get: () => string;
  set: (hex: string) => void;
}

/** One tuned value, for the clipboard dump. */
type Reading = () => [group: string, label: string, value: number | string];

export class TunePanel {
  private readonly root: HTMLDivElement;
  private readonly readings: Reading[] = [];
  private readonly rows: KeyRow[] = [];
  private readonly refreshers: Array<() => void> = [];
  private selected = 0;
  private currentGroup = '';
  private visible = false;
  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.key === 'F8') {
      this.toggle();
      return;
    }
    if (!this.visible) return;

    switch (event.key) {
      case 'ArrowDown':
        this.select(this.selected + 1);
        break;
      case 'ArrowUp':
        this.select(this.selected - 1);
        break;
      case 'ArrowRight':
        this.rows[this.selected]?.adjust?.(1, event.shiftKey);
        break;
      case 'ArrowLeft':
        this.rows[this.selected]?.adjust?.(-1, event.shiftKey);
        break;
      case 'c':
      case 'C':
        void this.copyAll(this.copyButton);
        break;
      default:
        return;
    }
    event.preventDefault();
  };
  private copyButton!: HTMLButtonElement;

  constructor(container: HTMLElement) {
    this.injectStyles();

    this.root = document.createElement('div');
    this.root.className = 'omni-tune';
    this.root.style.display = 'none';

    const head = document.createElement('div');
    head.className = 'omni-tune__head';

    const title = document.createElement('span');
    title.className = 'omni-tune__title';
    title.textContent = 'TUNE';
    head.appendChild(title);

    const copy = document.createElement('button');
    copy.className = 'omni-tune__copy';
    copy.type = 'button';
    copy.textContent = 'COPY';
    copy.addEventListener('click', () => void this.copyAll(copy));
    this.copyButton = copy;
    head.appendChild(copy);

    this.root.appendChild(head);

    const hint = document.createElement('div');
    hint.className = 'omni-tune__hint';
    hint.textContent = 'arrows: pick + nudge · shift: fine · C: copy';
    this.root.appendChild(hint);

    container.appendChild(this.root);

    window.addEventListener('keydown', this.onKey);
  }

  private select(index: number): void {
    if (!this.rows.length) return;
    const clamped = Math.max(0, Math.min(this.rows.length - 1, index));
    this.rows[this.selected]?.element.classList.remove('omni-tune__row--sel');
    this.selected = clamped;
    const row = this.rows[this.selected];
    row.element.classList.add('omni-tune__row--sel');
    row.element.scrollIntoView({ block: 'nearest' });
  }

  public group(title: string): void {
    this.currentGroup = title;
    const heading = document.createElement('div');
    heading.className = 'omni-tune__group';
    heading.textContent = title;
    this.root.appendChild(heading);
  }

  public slider(spec: SliderSpec): void {
    const group = this.currentGroup;
    const row = document.createElement('div');
    row.className = 'omni-tune__row';

    const label = document.createElement('label');
    label.textContent = spec.label;
    row.appendChild(label);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.step = String(spec.step ?? (spec.max - spec.min) / 200);
    input.value = String(spec.get());
    row.appendChild(input);

    const value = document.createElement('span');
    value.className = 'omni-tune__value';
    const show = (v: number): void => {
      value.textContent = Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2);
    };
    show(spec.get());
    this.refreshers.push(() => {
      const current = spec.get();
      input.value = String(current);
      show(current);
    });

    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      spec.set(v);
      show(v);
    });
    row.appendChild(value);

    this.root.appendChild(row);
    this.readings.push(() => [group, spec.label, spec.get()]);

    const span = spec.max - spec.min;
    this.rows.push({
      element: row,
      adjust: (direction, fine) => {
        const step = span / (fine ? 200 : 40);
        const next = Math.max(spec.min, Math.min(spec.max, spec.get() + direction * step));
        spec.set(next);
        input.value = String(next);
        show(next);
      },
    });
    if (this.rows.length === 1) this.select(0);
  }

  public color(spec: ColorSpec): void {
    const group = this.currentGroup;
    const row = document.createElement('div');
    row.className = 'omni-tune__row';

    const label = document.createElement('label');
    label.textContent = spec.label;
    row.appendChild(label);

    const input = document.createElement('input');
    input.type = 'color';
    input.value = spec.get();
    input.addEventListener('input', () => spec.set(input.value));
    this.refreshers.push(() => (input.value = spec.get()));
    row.appendChild(input);

    const value = document.createElement('span');
    value.className = 'omni-tune__value';
    row.appendChild(value);

    this.root.appendChild(row);
    this.readings.push(() => [group, spec.label, spec.get()]);
    this.rows.push({ element: row });
  }

  public button(label: string, onPress: () => void): void {
    const row = document.createElement('div');
    row.className = 'omni-tune__row';
    row.appendChild(document.createElement('span'));

    const button = document.createElement('button');
    button.className = 'omni-tune__copy';
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', onPress);
    row.appendChild(button);

    this.root.appendChild(row);
  }

  private toggle(): void {
    this.visible = !this.visible;
    if (this.visible) this.refresh();
    this.root.style.display = this.visible ? '' : 'none';
  }

  /** Re-read every control after a preset/reset button changes several values at once. */
  public refresh(): void {
    for (const refresh of this.refreshers) refresh();
  }

  /**
   * Every current value, grouped, onto the clipboard.
   *
   * This is the panel's whole point: the numbers leave through here and land in source.
   * The fallback path exists because the async clipboard API needs a secure context and
   * an embedded runtime does not always grant one.
   */
  private async copyAll(button: HTMLButtonElement): Promise<void> {
    const grouped: Record<string, Record<string, number | string>> = {};
    for (const read of this.readings) {
      const [group, label, value] = read();
      (grouped[group] ??= {})[label] =
        typeof value === 'number' ? Math.round(value * 1000) / 1000 : value;
    }
    const text = JSON.stringify(grouped, null, 2);

    try {
      await navigator.clipboard.writeText(text);
      button.textContent = 'COPIED';
    } catch {
      // No clipboard in this context. The values still have to leave somehow, so they go
      // to the console, which the editor's devtools can reach.
      console.log('[tune]', text);
      button.textContent = 'LOGGED';
    }

    setTimeout(() => {
      button.textContent = 'COPY';
    }, 900);
  }

  /**
   * Always overwrite, never skip.
   *
   * The usual inject-once guard is wrong here, and it cost a debugging cycle: the editor
   * page survives across play sessions, so a skip-if-present check pins whatever CSS the
   * FIRST session of the day injected. The pointer-events fix below this comment shipped,
   * rebuilt, re-entered play - and never applied, because the stale style tag from before
   * the fix was still in document.head and the guard stepped around it.
   */
  private injectStyles(): void {
    const existing = document.getElementById(STYLE_ID);
    if (existing) {
      existing.textContent = TUNE_CSS;
      return;
    }
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = TUNE_CSS;
    document.head.appendChild(style);
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.root.remove();
  }
}
