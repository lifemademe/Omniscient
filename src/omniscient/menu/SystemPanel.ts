/**
 * The three menu plates that did nothing.
 *
 * ## Why this is worth the file
 *
 * SETTINGS, CREDITS and SHUT DOWN have been on the wall since the first build, lit and
 * labelled and hooked to nothing. `onMenuAction` said so in a comment: "Only NEW GAME is
 * wired for the Jam slice. §103 wants the machine to look like it does more than the
 * player currently needs it to."
 *
 * §103 is right about the MACHINE - a console should look like it does more than you are
 * using. It is not right about the front door. A player who presses SHUT DOWN and gets
 * nothing has not found a machine with depth, they have found a broken game, and the same
 * goes for somebody reaching for a volume control because the carrier hum is louder than
 * they want at one in the morning. Muting at the operating system is what happens next,
 * and that mute never comes back off.
 *
 * ## Why it is one panel and not three
 *
 * They share everything: the same frame, the same way in and out, the same escape key, the
 * same restoration of the menu underneath. Three files would be three chances for those to
 * drift apart.
 *
 * ## Keyboard as well as mouse
 *
 * Every control here answers arrow keys and Escape, which is worth the few extra lines for
 * two reasons. It is the accessible thing to do. And this project's automated capture
 * cannot click DOM overlays at all - the harness can reach the 3D picker and nothing else
 * - so a settings panel that only answered the mouse would be a panel nobody could ever
 * verify again.
 */

import { audio } from '../audio/ConsoleAudio.js';
import { ACCENT } from '../art/palette.js';

const STYLE_ID = 'omniscient-system-panel';

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
  width: min(560px, 74vw);
  border: 1px solid rgba(127, 224, 138, 0.32);
  background: linear-gradient(180deg, rgba(8, 24, 14, 0.97), rgba(4, 14, 9, 0.97));
  padding: 26px 30px 22px;
  box-shadow: 0 0 44px rgba(0, 0, 0, 0.6);
}
.omni-sys__title {
  font-size: 13px;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: ${ACCENT.knowledge};
  margin-bottom: 18px;
}
.omni-sys__row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 11px 10px;
  border: 1px solid transparent;
}
/* The focused row, which is how the keyboard path stays legible. */
.omni-sys__row--on {
  border-color: rgba(127, 224, 138, 0.5);
  background: rgba(127, 224, 138, 0.07);
}
.omni-sys__label { flex: 0 0 132px; font-size: 12px; letter-spacing: 0.1em; }
.omni-sys__value { font-size: 12px; color: ${ACCENT.amber}; min-width: 52px; }
/* The level, drawn as blocks rather than as a native slider - a chrome slider in this
   frame would be the one control that came from somewhere else. */
.omni-sys__bar { display: flex; gap: 3px; flex: 1; cursor: pointer; }
.omni-sys__seg {
  flex: 1;
  height: 15px;
  background: rgba(127, 224, 138, 0.12);
  border: 1px solid rgba(127, 224, 138, 0.2);
}
.omni-sys__seg--lit { background: ${ACCENT.knowledge}; border-color: ${ACCENT.knowledge}; }
.omni-sys__note {
  margin-top: 16px;
  font-size: 11px;
  line-height: 1.7;
  opacity: 0.62;
}
.omni-sys__credits { font-size: 12px; line-height: 2; }
.omni-sys__credits b { color: ${ACCENT.knowledge}; font-weight: normal; letter-spacing: 0.1em; }
`;

const STEPS = 10;

/**
 * A modal over the menu. One at a time, and Escape always closes it.
 */
export class SystemPanel {
  private root: HTMLDivElement | null = null;
  private onKey: ((event: KeyboardEvent) => void) | null = null;
  private focused = 0;
  private rows: HTMLElement[] = [];

  public constructor(private readonly container: HTMLElement) {
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

    const root = document.createElement('div');
    root.className = 'omni-sys';

    const frame = document.createElement('div');
    frame.className = 'omni-sys__frame';

    const title = document.createElement('div');
    title.className = 'omni-sys__title';
    title.textContent = screen === 'settings' ? 'Settings' : 'Credits';
    frame.appendChild(title);

    if (screen === 'settings') this.buildSettings(frame);
    else this.buildCredits(frame);

    const note = document.createElement('div');
    note.className = 'omni-sys__note';
    note.textContent =
      screen === 'settings'
        ? 'Left and right adjust. Escape closes.'
        : 'Escape closes.';
    frame.appendChild(note);

    root.appendChild(frame);
    // Clicking the darkness outside the frame closes, which is what everybody tries first.
    root.addEventListener('mousedown', (event) => {
      if (event.target === root) this.close();
    });

    this.container.appendChild(root);
    this.root = root;
    this.focused = 0;
    this.paint();

    this.onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        this.close();
        return;
      }
      if (!this.rows.length) return;
      if (event.key === 'ArrowDown') this.focused = (this.focused + 1) % this.rows.length;
      if (event.key === 'ArrowUp') {
        this.focused = (this.focused + this.rows.length - 1) % this.rows.length;
      }
      if (event.key === 'ArrowLeft') this.nudge(-1);
      if (event.key === 'ArrowRight') this.nudge(1);
      this.paint();
    };
    window.addEventListener('keydown', this.onKey);
  }

  public close(): void {
    if (this.onKey) window.removeEventListener('keydown', this.onKey);
    this.onKey = null;
    this.root?.remove();
    this.root = null;
    this.rows = [];
  }

  // -- screens ---------------------------------------------------------------

  private buildSettings(frame: HTMLElement): void {
    const row = document.createElement('div');
    row.className = 'omni-sys__row';

    const label = document.createElement('div');
    label.className = 'omni-sys__label';
    label.textContent = 'VOLUME';

    const bar = document.createElement('div');
    bar.className = 'omni-sys__bar';

    const value = document.createElement('div');
    value.className = 'omni-sys__value';

    for (let i = 0; i < STEPS; i++) {
      const seg = document.createElement('div');
      seg.className = 'omni-sys__seg';
      seg.addEventListener('mousedown', (event) => {
        event.preventDefault();
        audio.setVolume((i + 1) / STEPS);
        audio.play('tap');
        this.paint();
      });
      bar.appendChild(seg);
    }

    row.append(label, bar, value);
    frame.appendChild(row);
    this.rows = [row];
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
      // textContent throughout - see the Safe UI note in the console surface.
      line.appendChild(document.createTextNode(who));
      body.appendChild(line);
    }
    frame.appendChild(body);
    this.rows = [];
  }

  // -- state -----------------------------------------------------------------

  private nudge(direction: number): void {
    if (!this.rows.length) return;
    const step = 1 / STEPS;
    audio.setVolume(Math.round((audio.getVolume() + direction * step) * STEPS) / STEPS);
    audio.play('tap');
  }

  private paint(): void {
    this.rows.forEach((row, i) => {
      row.classList.toggle('omni-sys__row--on', i === this.focused);
    });
    if (!this.root) return;

    const lit = Math.round(audio.getVolume() * STEPS);
    this.root.querySelectorAll('.omni-sys__seg').forEach((seg, i) => {
      seg.classList.toggle('omni-sys__seg--lit', i < lit);
    });
    const value = this.root.querySelector('.omni-sys__value');
    // From the volume, not from the segment count. `lit * STEPS` happens to be right while
    // STEPS is 10 and would silently start lying the moment anybody changed it.
    if (value) value.textContent = `${Math.round(audio.getVolume() * 100)}%`;
  }
}
