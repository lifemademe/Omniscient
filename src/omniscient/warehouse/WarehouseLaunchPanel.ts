import { audio } from '../audio/ConsoleAudio.js';

import type { WarehouseMode } from './types.js';

const STYLE_ID = 'warehouse-launch-panel-style';

const CSS = `
.warehouse-launch{position:absolute;inset:0;z-index:1900;display:grid;place-items:center;padding:24px;background:rgba(2,7,7,.9);color:#b9d6c1;font:14px/1.45 monospace}
.warehouse-launch__frame{width:min(720px,94vw);border:1px solid #497b66;background:linear-gradient(180deg,#071611,#030807);box-shadow:0 0 55px #000;padding:26px}
.warehouse-launch__eyebrow{color:#e0a24c;letter-spacing:.2em}.warehouse-launch h1{margin:7px 0;color:#d8ffb0;letter-spacing:.12em}.warehouse-launch__summary{color:#87a394;margin-bottom:20px}
.warehouse-launch__modes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.warehouse-launch__mode{appearance:none;text-align:left;border:1px solid #284f43;background:#09130f;color:#b9d6c1;padding:16px;cursor:pointer;font:inherit}.warehouse-launch__mode:hover,.warehouse-launch__mode:focus{outline:none;border-color:#7fe08a;background:#10271e}.warehouse-launch__mode strong{display:block;color:#d8ffb0;letter-spacing:.1em;margin-bottom:7px}.warehouse-launch__mode span{display:block;color:#87a394;font-size:12px}.warehouse-launch__record{margin-top:17px;color:#62a8bd}.warehouse-launch__back{margin-top:20px;border:1px solid #497b66;background:#0d2118;color:#d8ffb0;padding:9px 15px;font:inherit;cursor:pointer}@media(max-width:700px){.warehouse-launch__modes{grid-template-columns:1fr}}
`;

export interface WarehouseLaunchRecord {
  highestStage: number;
  bestRank: string;
  bestCleanChain: number;
}

export class WarehouseLaunchPanel {
  private root: HTMLElement | null = null;

  public constructor(
    private readonly container: HTMLElement,
    private readonly record: WarehouseLaunchRecord,
    private readonly onLaunch: (mode: WarehouseMode) => void,
    private readonly onClosed: () => void
  ) {}

  public open(): void {
    if (this.root) return;
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    const root = document.createElement('section');
    root.className = 'warehouse-launch';
    root.setAttribute('aria-label', 'Warehouse 07 shift selection');
    const frame = document.createElement('div');
    frame.className = 'warehouse-launch__frame';
    const eyebrow = document.createElement('div');
    eyebrow.className = 'warehouse-launch__eyebrow';
    eyebrow.textContent = 'WAREHOUSE 07 // OPERATOR ARCHIVE';
    const title = document.createElement('h1');
    title.textContent = 'SELECT SHIFT';
    const summary = document.createElement('p');
    summary.className = 'warehouse-launch__summary';
    summary.textContent = 'The facility is still operating. Records change; the rules do not.';
    const modes = document.createElement('div');
    modes.className = 'warehouse-launch__modes';
    this.addMode(modes, 'endless', 'NIGHT SHIFT', 'A seeded escalation run. Tools and case families unlock horizontally.');
    this.addMode(modes, 'daily', 'DAILY SHIFT', 'One UTC seed shared for the day and archived with the current deck version.');
    this.addMode(modes, 'story', 'REPLAY INCIDENT', 'Return to the five-movement Warehouse 07 operation.');
    const record = document.createElement('div');
    record.className = 'warehouse-launch__record';
    record.textContent = `RECORD  ${this.record.bestRank}  //  STAGE ${String(this.record.highestStage).padStart(2, '0')}  //  CLEAN CHAIN ${this.record.bestCleanChain}`;
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'warehouse-launch__back';
    back.textContent = 'RETURN';
    back.addEventListener('click', () => this.close());
    frame.append(eyebrow, title, summary, modes, record, back);
    root.appendChild(frame);
    this.container.appendChild(root);
    this.root = root;
    requestAnimationFrame(() => modes.querySelector<HTMLButtonElement>('button')?.focus());
  }

  private addMode(parent: HTMLElement, mode: WarehouseMode, title: string, detail: string): void {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'warehouse-launch__mode';
    const heading = document.createElement('strong');
    heading.textContent = title;
    const description = document.createElement('span');
    description.textContent = detail;
    button.append(heading, description);
    button.addEventListener('click', () => {
      audio.play('seat');
      this.destroy();
      this.onLaunch(mode);
    });
    parent.appendChild(button);
  }

  private close(): void {
    audio.play('disconnect');
    this.destroy();
    this.onClosed();
  }

  public destroy(): void {
    this.root?.remove();
    this.root = null;
  }
}
