import type { GeneratedWarehouseCase, WarehouseDecision, WarehouseMode, WarehouseTool } from './types.js';

const STYLE_ID = 'warehouse-hud-style';

const CSS = `
.warehouse-hud{position:absolute;inset:0;z-index:1200;pointer-events:none;color:#c9dfd0;font:12px/1.35 monospace;text-shadow:0 1px 3px #000}.warehouse-hud[data-view=cctv]:after{content:'';position:absolute;inset:0;pointer-events:none;opacity:.13;background:repeating-linear-gradient(0deg,transparent 0 3px,rgba(185,214,193,.18) 4px),radial-gradient(ellipse at center,transparent 52%,#000 120%);mix-blend-mode:screen}.warehouse-hud__scanfx{position:absolute;left:16%;right:16%;top:22%;bottom:22%;border:1px solid rgba(127,224,138,.78);opacity:0;transform:scale(.72);transition:opacity .12s,transform .3s}.warehouse-hud__scanfx--shown{opacity:1;transform:scale(1);box-shadow:inset 0 0 45px rgba(98,168,189,.15)}.warehouse-hud__feed{position:absolute;left:50%;top:18px;transform:translateX(-50%);color:#8bb5c0;letter-spacing:.15em}.warehouse-hud__top{position:absolute;left:18px;right:18px;top:16px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.warehouse-hud__card{border:1px solid rgba(98,168,189,.55);background:rgba(3,10,9,.82);box-shadow:inset 0 0 24px rgba(47,115,145,.08);padding:10px 12px;min-width:220px}.warehouse-hud__eyebrow{color:#62a8bd;letter-spacing:.16em}.warehouse-hud__title{color:#d8ffb0;font-size:15px;letter-spacing:.08em;margin-top:3px}.warehouse-hud__objective{color:#9fb3a5;max-width:430px;margin-top:5px}.warehouse-hud__integrity{color:#e0a24c;letter-spacing:.12em}.warehouse-hud__bell{color:#e49a84;margin-top:6px}.warehouse-hud__centre{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:34px;height:34px;border:1px solid rgba(216,255,176,.62);border-radius:50%}.warehouse-hud__centre:before,.warehouse-hud__centre:after{content:'';position:absolute;background:#d8ffb0}.warehouse-hud__centre:before{width:10px;height:1px;left:11px;top:16px}.warehouse-hud__centre:after{height:10px;width:1px;left:16px;top:11px}.warehouse-hud__readout{position:absolute;right:18px;bottom:18px;width:min(390px,43vw)}.warehouse-hud__row{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid rgba(73,123,102,.28);padding:3px 0}.warehouse-hud__bad{color:#e49a84}.warehouse-hud__good{color:#7fe08a}.warehouse-hud__actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px;pointer-events:auto}.warehouse-hud__actions button{font:inherit;color:#d8ffb0;background:#0d2118;border:1px solid #497b66;padding:7px 9px;cursor:pointer}.warehouse-hud__actions button:hover,.warehouse-hud__actions button:focus{border-color:#d8ffb0;outline:none}.warehouse-hud__actions button:disabled{opacity:.32;cursor:default}.warehouse-hud__tools{position:absolute;left:18px;bottom:18px;display:flex;gap:6px;pointer-events:auto}.warehouse-hud__tools button{font:inherit;color:#8bb5c0;background:rgba(3,10,9,.84);border:1px solid #315966;padding:7px;cursor:pointer}.warehouse-hud__tools button[data-active=true]{color:#d8ffb0;border-color:#7fe08a}.warehouse-hud__message{position:absolute;left:50%;top:18%;transform:translateX(-50%);padding:10px 16px;border:1px solid #497b66;background:rgba(3,10,9,.9);color:#d8ffb0;letter-spacing:.1em;opacity:0;transition:opacity .2s}.warehouse-hud__message--shown{opacity:1}.warehouse-hud__controls{position:absolute;left:18px;top:128px;color:#779487}.warehouse-hud__exit,.warehouse-hud__recover{pointer-events:auto;position:absolute;right:18px;font:12px monospace;color:#b9d6c1;background:rgba(3,10,9,.82);border:1px solid #315966;padding:7px 10px;cursor:pointer}.warehouse-hud__exit{top:126px}.warehouse-hud__recover{top:162px}@media(max-width:760px){.warehouse-hud__objective{max-width:240px}.warehouse-hud__readout{width:calc(100vw - 36px)}.warehouse-hud__tools{bottom:230px}}
`;

export class WarehouseHUD {
  private root: HTMLElement;
  private title: HTMLElement;
  private objective: HTMLElement;
  private integrity: HTMLElement;
  private bell: HTMLElement;
  private inbound: HTMLElement;
  private feed: HTMLElement;
  private scanFx: HTMLElement;
  private controls: HTMLElement;
  private readout: HTMLElement;
  private message: HTMLElement;
  private actions: HTMLElement;
  private tools: HTMLElement;
  private messageTimer = 0;
  private decisionHandler: ((decision: WarehouseDecision) => void) | null = null;
  private toolHandler: ((tool: WarehouseTool) => void) | null = null;

  public constructor(container: HTMLElement, mode: WarehouseMode, onExit: () => void, onRecover: () => void) {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    const root = document.createElement('section');
    root.className = 'warehouse-hud';
    const top = document.createElement('div');
    top.className = 'warehouse-hud__top';
    const caseCard = document.createElement('div');
    caseCard.className = 'warehouse-hud__card';
    const eyebrow = document.createElement('div');
    eyebrow.className = 'warehouse-hud__eyebrow';
    eyebrow.textContent = mode === 'story' ? 'WAREHOUSE 07 // REMOTE LINK' : `${mode.toUpperCase()} NIGHT SHIFT`;
    this.title = document.createElement('div');
    this.title.className = 'warehouse-hud__title';
    this.objective = document.createElement('div');
    this.objective.className = 'warehouse-hud__objective';
    caseCard.append(eyebrow, this.title, this.objective);
    const statusCard = document.createElement('div');
    statusCard.className = 'warehouse-hud__card';
    this.integrity = document.createElement('div');
    this.integrity.className = 'warehouse-hud__integrity';
    this.bell = document.createElement('div');
    this.bell.className = 'warehouse-hud__bell';
    this.inbound = document.createElement('div');
    this.inbound.className = 'warehouse-hud__eyebrow';
    statusCard.append(this.integrity, this.bell, this.inbound);
    top.append(caseCard, statusCard);
    const centre = document.createElement('div');
    centre.className = 'warehouse-hud__centre';
    this.feed = document.createElement('div');
    this.feed.className = 'warehouse-hud__feed';
    this.scanFx = document.createElement('div');
    this.scanFx.className = 'warehouse-hud__scanfx';
    this.readout = document.createElement('div');
    this.readout.className = 'warehouse-hud__card warehouse-hud__readout';
    this.actions = document.createElement('div');
    this.actions.className = 'warehouse-hud__actions';
    this.readout.appendChild(this.actions);
    this.tools = document.createElement('div');
    this.tools.className = 'warehouse-hud__tools';
    this.message = document.createElement('div');
    this.message.className = 'warehouse-hud__message';
    this.controls = document.createElement('div');
    this.controls.className = 'warehouse-hud__controls';
    this.controls.textContent = 'WASD MOVE  //  Q E ALTITUDE  //  MOUSE AIM  //  CLICK SCAN  //  F GRIP  //  R RECOVER  //  TAB VIEW';
    const exit = document.createElement('button');
    exit.className = 'warehouse-hud__exit';
    exit.type = 'button';
    exit.textContent = 'ESC // RETURN';
    exit.addEventListener('click', onExit);
    const recover = document.createElement('button');
    recover.className = 'warehouse-hud__recover';
    recover.type = 'button';
    recover.textContent = 'R // RECOVER';
    recover.addEventListener('click', onRecover);
    root.append(top, this.feed, this.scanFx, centre, this.readout, this.tools, this.message, this.controls, exit, recover);
    container.appendChild(root);
    this.root = root;
    this.setIntegrity(3, 0, 0);
    this.setBell(false, 0);
    this.setInbound(null);
    this.setView('cctv');
  }

  public onDecision(handler: (decision: WarehouseDecision) => void): void {
    this.decisionHandler = handler;
  }

  public onTool(handler: (tool: WarehouseTool) => void): void {
    this.toolHandler = handler;
  }

  public setCase(title: string, objective: string): void {
    this.title.textContent = title;
    this.objective.textContent = objective;
  }

  public setIntegrity(integrity: number, stage: number, chain: number): void {
    this.integrity.textContent = `INTEGRITY ${'◆'.repeat(Math.max(0, integrity))}${'◇'.repeat(Math.max(0, 3 - integrity))}  //  STAGE ${String(stage).padStart(2, '0')}  //  CHAIN ${chain}`;
  }

  public setBell(waiting: boolean, count: number): void {
    this.bell.textContent = waiting ? `FRONT ENTRY // ${count} VISITOR${count === 1 ? '' : 'S'} WAITING` : 'FRONT ENTRY // CLEAR';
  }

  public setInbound(seconds: number | null): void {
    this.inbound.textContent = seconds === null
      ? ''
      : seconds > 0
        ? `INBOUND DOCK // T−${Math.ceil(seconds)} SEC`
        : 'INBOUND DOCK // ACTIVE';
  }

  public setView(view: 'drone' | 'cctv' | 'console'): void {
    this.root.dataset.view = view;
    this.feed.textContent = view === 'cctv'
      ? `CCTV 04 // ${new Date().toISOString().slice(11, 19)} UTC // LOW BANDWIDTH`
      : view === 'console'
        ? 'WAREHOUSE TOPOLOGY // MANIFEST OVERLAY'
        : 'DRONE 07 // OPTICAL STABILIZED';
  }

  public setControlsVisible(visible: boolean): void {
    this.controls.style.display = visible ? '' : 'none';
  }

  public showCase(data: GeneratedWarehouseCase, scanned: boolean): void {
    while (this.readout.firstChild) this.readout.firstChild.remove();
    const rows: Array<[string, string, boolean | null]> = [
      ['SUBJECT', data.packageId, null],
      ['VISITOR', data.visitorName, null],
      ['LOCATION', `AISLE ${data.aisle} // BAY ${String(data.bay).padStart(2, '0')}`, null],
      ['EXPECTED MASS', `${data.expectedWeight.toFixed(1)} KG`, null],
      ['MEASURED MASS', scanned ? `${data.measuredWeight.toFixed(1)} KG` : 'SCAN REQUIRED', scanned ? Math.abs(data.expectedWeight - data.measuredWeight) < 0.01 : null],
      ['SECURITY', scanned ? (data.definition.anomaly === 'seal' ? 'SEAL DISCONTINUITY' : 'SEAL VALID') : 'SCAN REQUIRED', scanned ? data.definition.anomaly !== 'seal' : null],
      ['CASE', scanned ? data.definition.briefing : 'Acquire optical record.', null],
    ];
    for (const [label, value, match] of rows) {
      const row = document.createElement('div');
      row.className = 'warehouse-hud__row';
      const left = document.createElement('span');
      left.textContent = label;
      const right = document.createElement('span');
      right.textContent = value;
      if (match === true) right.className = 'warehouse-hud__good';
      if (match === false) right.className = 'warehouse-hud__bad';
      row.append(left, right);
      this.readout.appendChild(row);
    }
    this.actions = document.createElement('div');
    this.actions.className = 'warehouse-hud__actions';
    const decisions: readonly WarehouseDecision[] = data.definition.subjectType === 'worker'
      ? ['clear', 'hold', 'verify']
      : data.definition.id === 'freight-sort'
        ? ['verify', 'release']
      : data.definition.id === 'package-7018'
        ? ['verify', 'release', 'quarantine', 'return']
        : ['release', 'quarantine', 'return'];
    const labels: Readonly<Partial<Record<WarehouseDecision, string>>> = {
      hold: 'HOLD BAY',
      verify: 'REQUEST HUMAN VERIFICATION',
      return: 'RETURN TO INBOUND',
    };
    for (const decision of decisions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = data.definition.id === 'freight-sort'
        ? decision === 'verify' ? 'VERIFY LOAD' : 'START SORT'
        : labels[decision] ?? decision.replaceAll('-', ' ').toUpperCase();
      button.disabled = !scanned;
      button.addEventListener('click', () => this.decisionHandler?.(decision));
      this.actions.appendChild(button);
    }
    this.readout.appendChild(this.actions);
  }

  public setTools(available: readonly WarehouseTool[], active: WarehouseTool): void {
    this.tools.replaceChildren();
    for (const tool of available) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = tool.toUpperCase();
      button.dataset.active = String(tool === active);
      button.addEventListener('click', () => this.toolHandler?.(tool));
      this.tools.appendChild(button);
    }
  }

  public flash(text: string, seconds = 2.4): void {
    this.message.textContent = text;
    this.message.classList.add('warehouse-hud__message--shown');
    this.messageTimer = seconds;
  }

  public pulseScan(): void {
    this.scanFx.classList.remove('warehouse-hud__scanfx--shown');
    requestAnimationFrame(() => this.scanFx.classList.add('warehouse-hud__scanfx--shown'));
    window.setTimeout(() => this.scanFx.classList.remove('warehouse-hud__scanfx--shown'), 360);
  }

  public tick(deltaTime: number): void {
    if (this.messageTimer <= 0) return;
    this.messageTimer -= deltaTime;
    if (this.messageTimer <= 0) this.message.classList.remove('warehouse-hud__message--shown');
  }

  public destroy(): void {
    this.root.remove();
  }
}
