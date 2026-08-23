import { audio } from '../audio/ConsoleAudio.js';

const STYLE_ID = 'warehouse-trace-panel-style';

interface TraceRecord {
  id: string;
  layer: string;
  title: string;
  detail: string;
  correct: boolean;
}
const RECORDS: readonly TraceRecord[] = [
  { id: 'carrier', layer: 'CARRIER PARALLAX', title: 'Projection −11.5 / −57.0', detail: 'The off-world bearing intersects Earth at an otherwise empty coordinate.', correct: true },
  { id: 'traffic', layer: 'TRAFFIC COVERAGE', title: 'Unaccounted freight gap', detail: 'Four trucks leave road coverage and return 11.2 km later without recorded stops.', correct: true },
  { id: 'power', layer: 'INFRASTRUCTURE LOAD', title: '4.8 MW // no customer', detail: 'Industrial demand repeats nightly inside the same unmapped rectangle.', correct: true },
  { id: 'weather', layer: 'WEATHER', title: 'Convective band', detail: 'Ordinary storm activity moving east. No fixed relationship to the carrier.', correct: false },
  { id: 'civil', layer: 'CIVIL RECORD', title: 'No registered structure', detail: 'Public land and company records show undeveloped forest.', correct: false },
  { id: 'radio', layer: 'RADIO TRAFFIC', title: 'Repeater noise', detail: 'A licensed agricultural repeater six hundred kilometres south.', correct: false },
] as const;

const CSS = `
.warehouse-trace{position:absolute;inset:0;z-index:1900;background:rgba(2,7,7,.94);color:#b9d6c1;font:14px/1.45 monospace;display:grid;place-items:center;padding:28px}
.warehouse-trace__frame{width:min(960px,96vw);max-height:92vh;overflow:auto;border:1px solid #2f7391;background:linear-gradient(180deg,#071211,#030807);box-shadow:0 0 50px #000,inset 0 0 45px rgba(47,115,145,.08);padding:24px}
.warehouse-trace__eyebrow{color:#8f3f4a;letter-spacing:.24em}.warehouse-trace h1{font-size:24px;color:#d8ffb0;letter-spacing:.12em;margin:8px 0}.warehouse-trace__coord{color:#e0a24c;margin-bottom:18px}
.warehouse-trace__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.warehouse-trace__record{appearance:none;text-align:left;color:inherit;border:1px solid #23443c;background:#07100d;padding:14px;cursor:pointer}.warehouse-trace__record:hover,.warehouse-trace__record:focus{border-color:#7fe08a;outline:none}.warehouse-trace__record--selected{background:#10271e;border-color:#d8ffb0}.warehouse-trace__layer{display:block;color:#62a8bd;font-size:11px;letter-spacing:.16em}.warehouse-trace__title{display:block;color:#d8ffb0;margin:5px 0}.warehouse-trace__detail{display:block;color:#87a394}
.warehouse-trace__footer{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:18px}.warehouse-trace__status{min-height:2.8em;color:#e0a24c}.warehouse-trace__actions{display:flex;gap:10px}.warehouse-trace button.warehouse-trace__action{font:inherit;letter-spacing:.1em;border:1px solid #497b66;background:#0d2118;color:#d8ffb0;padding:10px 16px;cursor:pointer}.warehouse-trace button:disabled{opacity:.35;cursor:default}@media(max-width:700px){.warehouse-trace__grid{grid-template-columns:1fr}.warehouse-trace__footer{align-items:stretch;flex-direction:column}}
`;

export class TracePanel {
  private root: HTMLElement | null = null;
  private selected = new Set<string>();
  private status: HTMLElement | null = null;
  private confirm: HTMLButtonElement | null = null;

  public constructor(
    private readonly container: HTMLElement,
    private readonly onResolved: () => void,
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
    root.className = 'warehouse-trace';
    root.setAttribute('aria-label', 'Warehouse 07 trace console');
    const frame = document.createElement('div');
    frame.className = 'warehouse-trace__frame';
    const eyebrow = document.createElement('div');
    eyebrow.className = 'warehouse-trace__eyebrow';
    eyebrow.textContent = 'UNKNOWN CARRIER // TRACE';
    const heading = document.createElement('h1');
    heading.textContent = 'ORIGIN DOES NOT RESOLVE';
    const coord = document.createElement('div');
    coord.className = 'warehouse-trace__coord';
    coord.textContent = 'TERRESTRIAL PROJECTION  −11.5 / −57.0  //  ORDINARY MAP: EMPTY';
    const grid = document.createElement('div');
    grid.className = 'warehouse-trace__grid';
    for (const record of RECORDS) {
      const button = document.createElement('button');
      button.className = 'warehouse-trace__record';
      button.type = 'button';
      button.dataset.recordId = record.id;
      for (const [className, value] of [
        ['warehouse-trace__layer', record.layer],
        ['warehouse-trace__title', record.title],
        ['warehouse-trace__detail', record.detail],
      ] as const) {
        const line = document.createElement('span');
        line.className = className;
        line.textContent = value;
        button.appendChild(line);
      }
      button.addEventListener('click', () => this.toggle(record.id, button));
      grid.appendChild(button);
    }
    const footer = document.createElement('div');
    footer.className = 'warehouse-trace__footer';
    const status = document.createElement('div');
    status.className = 'warehouse-trace__status';
    status.textContent = 'Select three records whose position and timing describe the same absence.';
    this.status = status;
    const actions = document.createElement('div');
    actions.className = 'warehouse-trace__actions';
    const back = document.createElement('button');
    back.className = 'warehouse-trace__action';
    back.type = 'button';
    back.textContent = 'RETURN';
    back.addEventListener('click', () => this.close(false));
    const confirm = document.createElement('button');
    confirm.className = 'warehouse-trace__action';
    confirm.type = 'button';
    confirm.textContent = 'CROSS-CHECK';
    confirm.disabled = true;
    confirm.addEventListener('click', () => this.submit());
    this.confirm = confirm;
    actions.append(back, confirm);
    footer.append(status, actions);
    frame.append(eyebrow, heading, coord, grid, footer);
    root.appendChild(frame);
    this.container.appendChild(root);
    this.root = root;
    requestAnimationFrame(() => grid.querySelector<HTMLButtonElement>('button')?.focus());
  }

  private toggle(id: string, button: HTMLButtonElement): void {
    if (this.selected.has(id)) this.selected.delete(id);
    else {
      if (this.selected.size >= 3) return;
      this.selected.add(id);
    }
    button.classList.toggle('warehouse-trace__record--selected', this.selected.has(id));
    if (this.confirm) this.confirm.disabled = this.selected.size !== 3;
    if (this.status) this.status.textContent = `${this.selected.size} OF 3 LAYERS HELD`;
    audio.play('tap');
  }

  private submit(): void {
    const chosen = RECORDS.filter((record) => this.selected.has(record.id));
    if (!chosen.every((record) => record.correct)) {
      if (this.status) this.status.textContent = 'NO COMMON FOOTPRINT // one or more records describe another system';
      audio.play('reject');
      return;
    }
    if (this.status) this.status.textContent = 'FOOTPRINT RESOLVED // WAREHOUSE 07 // STATUS: OPERATING';
    if (this.confirm) this.confirm.disabled = true;
    audio.play('seat');
    window.setTimeout(() => this.close(true), 1300);
  }

  private close(resolved: boolean): void {
    this.root?.remove();
    this.root = null;
    if (resolved) this.onResolved();
    else this.onClosed();
  }

  public destroy(): void {
    this.root?.remove();
    this.root = null;
  }
}
