import { WarehouseOpsPanel } from './WarehouseOpsPanel.js';

import type { WarehouseChatReply } from './WarehouseOpsPanel.js';
import type {
  GeneratedWarehouseCase,
  WarehouseArchiveRecord,
  WarehouseDecision,
  WarehouseDoorId,
  WarehouseDoorSnapshot,
  WarehouseEvidenceState,
  WarehouseIntrusionSnapshot,
  WarehouseMode,
  WarehouseSecurityZoneId,
  WarehouseSecurityZoneSnapshot,
  WarehouseTool,
} from './types.js';

const STYLE_ID = 'warehouse-hud-style';

const CSS = `
.warehouse-hud{position:absolute;inset:0;z-index:1200;pointer-events:none;color:#cfe6c4;font:12px/1.4 "Courier New",ui-monospace,monospace}.warehouse-hud[data-view=cctv]:after{content:'';position:absolute;inset:35px 0 29px;pointer-events:none;opacity:.15;background:repeating-linear-gradient(0deg,transparent 0 2px,rgba(185,214,193,.16) 3px),radial-gradient(ellipse at center,transparent 55%,#000 118%);mix-blend-mode:screen}.warehouse-hud__feed{position:absolute;left:0;right:0;top:0;height:35px;display:flex;align-items:center;justify-content:center;color:#7fe08a;letter-spacing:.16em;text-transform:uppercase;background:linear-gradient(#0d1a12,#060d08);box-shadow:inset 0 1px 0 #2c5a3b,0 1px 0 #040906;border-bottom:1px solid #1d3325}.warehouse-hud__top{position:absolute;left:18px;right:18px;top:50px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.warehouse-hud__card{min-width:250px;padding:9px 11px;background:rgba(9,20,13,.9);box-shadow:inset 1px 1px 0 #3f7a52,inset -1px -1px 0 #040906,0 0 0 1px #0b1a11;backdrop-filter:blur(2px)}.warehouse-hud__eyebrow{color:#4f9a5e;letter-spacing:.18em;text-transform:uppercase}.warehouse-hud__title{color:#d8ffb0;font-size:15px;letter-spacing:.08em;margin-top:4px}.warehouse-hud__objective{color:#8fbe93;max-width:470px;margin-top:5px}.warehouse-hud__integrity{color:#e0c265;letter-spacing:.12em}.warehouse-hud__bell{color:#e8877a;margin-top:6px}.warehouse-hud__scanfx{position:absolute;left:14%;right:38%;top:24%;bottom:23%;border:1px solid rgba(127,224,138,.78);opacity:0;transform:scale(.72);transition:opacity .12s,transform .3s}.warehouse-hud__scanfx:before,.warehouse-hud__scanfx:after{content:'';position:absolute;background:#7fe08a}.warehouse-hud__scanfx:before{left:50%;top:-9%;width:1px;height:118%}.warehouse-hud__scanfx:after{left:-7%;top:50%;width:114%;height:1px}.warehouse-hud__scanfx--shown{opacity:1;transform:scale(1);box-shadow:inset 0 0 58px rgba(127,224,138,.12),0 0 18px rgba(127,224,138,.12)}.warehouse-hud__centre{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:34px;height:34px;border:1px solid rgba(216,255,176,.62);border-radius:50%;transition:opacity .2s}.warehouse-hud:not([data-view=drone]) .warehouse-hud__centre,.warehouse-hud[data-cursor=true] .warehouse-hud__centre{opacity:.22}.warehouse-hud__centre:before,.warehouse-hud__centre:after{content:'';position:absolute;background:#d8ffb0}.warehouse-hud__centre:before{width:10px;height:1px;left:11px;top:16px}.warehouse-hud__centre:after{height:10px;width:1px;left:16px;top:11px}.warehouse-hud__tools{position:absolute;left:18px;bottom:42px;display:flex;gap:5px;pointer-events:auto}.warehouse-hud__tools button,.warehouse-hud__doors button{font:inherit;color:#8fbe93;background:rgba(11,24,15,.94);border:0;padding:7px 10px;box-shadow:inset 1px 1px 0 #3f7a52,inset -1px -1px 0 #040906,0 0 0 1px #0b1a11;cursor:pointer}.warehouse-hud__tools button:hover,.warehouse-hud__doors button:hover{color:#d8ffb0}.warehouse-hud__tools button[data-active=true],.warehouse-hud__doors button[data-selected=true]{color:#d8ffb0;box-shadow:inset 1px 1px 0 #5fb277,inset -1px -1px 0 #040906,0 0 0 1px #17402a}.warehouse-hud__doors{position:absolute;left:32%;bottom:42px;transform:translateX(-50%);display:flex;gap:5px;align-items:center;pointer-events:auto;z-index:4}.warehouse-hud:not([data-view=cctv]) .warehouse-hud__doors{display:none}.warehouse-hud__doors button[data-status=tamper],.warehouse-hud__doors button[data-status=locked]{color:#ff897b;box-shadow:inset 1px 1px 0 #9b443d,inset -1px -1px 0 #210604,0 0 9px rgba(255,66,51,.25)}.warehouse-hud__doors button[data-status=contact]{color:#e0c265}.warehouse-hud__doors button[data-status=clear]{color:#668971}.warehouse-hud__doors button[data-role=replay]{color:#e0c265}.warehouse-hud__doors button[hidden]{display:none}.warehouse-hud__message{position:absolute;left:50%;top:17%;transform:translateX(-50%) translateY(4px);padding:9px 14px;border:1px solid #2b5c39;border-left:3px solid #7fe08a;background:linear-gradient(90deg,rgba(30,74,44,.88),rgba(13,28,20,.88));box-shadow:inset 0 0 22px rgba(0,0,0,.45);color:#d8ffb0;letter-spacing:.1em;opacity:0;transition:opacity .2s,transform .2s}.warehouse-hud__message--shown{opacity:1;transform:translateX(-50%) translateY(0)}.warehouse-hud__controls{position:absolute;left:18px;top:151px;color:#4f9a5e;letter-spacing:.03em}.warehouse-hud__exit,.warehouse-hud__recover,.warehouse-hud__perspective,.warehouse-hud__input{pointer-events:auto;position:absolute;left:18px;font:11px "Courier New",ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;color:#8fbe93;background:rgba(11,24,15,.9);border:0;padding:8px 11px;box-shadow:inset 1px 1px 0 #3f7a52,inset -1px -1px 0 #040906,0 0 0 1px #0b1a11;cursor:pointer}.warehouse-hud__exit{top:184px;color:#e8877a}.warehouse-hud__recover{top:222px}.warehouse-hud__perspective{top:260px;color:#d8ffb0}.warehouse-hud__input{top:298px;color:#7fe08a}.warehouse-hud[data-cursor=true] .warehouse-hud__input{color:#e0c265;box-shadow:inset 1px 1px 0 #927b35,inset -1px -1px 0 #040906,0 0 0 1px #3b2e0d}.warehouse-hud__exit:hover,.warehouse-hud__recover:hover,.warehouse-hud__perspective:hover,.warehouse-hud__input:hover{box-shadow:inset 1px 1px 0 #5fb277,inset -1px -1px 0 #040906,0 0 0 1px #17402a}.warehouse-hud:not([data-view=drone]) .warehouse-hud__perspective,.warehouse-hud:not([data-view=drone]) .warehouse-hud__input{opacity:.58}.warehouse-hud__footer{position:absolute;left:0;right:0;bottom:0;height:29px;display:flex;align-items:center;justify-content:space-between;padding:0 18px;color:#35603f;font-size:10px;letter-spacing:.16em;text-transform:uppercase;background:linear-gradient(#060d08,#0b1710);box-shadow:inset 0 -1px 0 #204631,0 -1px 0 #040906;border-top:1px solid #1d3325}@media(max-width:760px){.warehouse-hud__objective{max-width:240px}.warehouse-hud__card{min-width:180px}.warehouse-hud__tools{bottom:40px}.warehouse-hud__doors{left:50%;bottom:77px}.warehouse-hud__exit,.warehouse-hud__recover,.warehouse-hud__perspective,.warehouse-hud__input{display:none}.warehouse-hud__controls{top:164px}.warehouse-hud__scanfx{right:14%}}
`;

const SECURITY_CSS = `
.warehouse-hud__doors button[data-status=motion]{color:#e0c265;box-shadow:inset 1px 1px 0 #927b35,inset -1px -1px 0 #040906,0 0 9px rgba(224,194,101,.22)}
.warehouse-hud__centre{display:none;opacity:0}.warehouse-hud[data-view=drone][data-optical=true] .warehouse-hud__centre{display:block;opacity:1}
.warehouse-hud__optical{display:none;position:absolute;left:9%;right:34%;top:19%;bottom:14%;border:1px solid rgba(127,224,138,.34);background:linear-gradient(90deg,rgba(127,224,138,.62),rgba(127,224,138,0)) 0 0/18% 1px no-repeat,linear-gradient(180deg,rgba(127,224,138,.62),rgba(127,224,138,0)) 0 0/1px 22% no-repeat,linear-gradient(270deg,rgba(127,224,138,.62),rgba(127,224,138,0)) 100% 100%/18% 1px no-repeat,linear-gradient(0deg,rgba(127,224,138,.62),rgba(127,224,138,0)) 100% 100%/1px 22% no-repeat,radial-gradient(ellipse at center,transparent 48%,rgba(2,10,7,.22) 100%);box-shadow:inset 0 0 38px rgba(4,18,11,.22);color:#7fe08a;letter-spacing:.14em;text-transform:uppercase;opacity:0;transition:opacity .12s}
.warehouse-hud[data-view=drone][data-optical=true] .warehouse-hud__optical{display:block;opacity:1}.warehouse-hud__optical:before{content:'OPTICAL ACQUISITION // CHANNEL 01';position:absolute;left:12px;top:10px}.warehouse-hud__optical:after{content:'RMB HELD // LMB SCAN';position:absolute;right:12px;top:10px;color:#d8ffb0}.warehouse-hud__optical-readout{position:absolute;left:12px;bottom:10px;color:#4f9a5e}.warehouse-hud__optical-readout span{color:#d8ffb0}.warehouse-hud__opticalhint{pointer-events:none;position:absolute;left:18px;top:260px;font:11px "Courier New",ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;color:#8fbe93;background:rgba(11,24,15,.9);padding:8px 11px;box-shadow:inset 1px 1px 0 #3f7a52,inset -1px -1px 0 #040906,0 0 0 1px #0b1a11}.warehouse-hud[data-optical=true] .warehouse-hud__opticalhint{color:#d8ffb0;box-shadow:inset 1px 1px 0 #5fb277,inset -1px -1px 0 #040906,0 0 0 1px #17402a}.warehouse-hud:not([data-view=drone]) .warehouse-hud__opticalhint{opacity:.58}
@media(max-width:760px){.warehouse-hud__opticalhint{display:none}.warehouse-hud__optical{left:8%;right:8%}}
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
  private message: HTMLElement;
  private tools: HTMLElement;
  private doors: HTMLElement;
  private doorButtons = new Map<WarehouseDoorId, HTMLButtonElement>();
  private zoneButtons = new Map<WarehouseSecurityZoneId, HTMLButtonElement>();
  private replayButton: HTMLButtonElement;
  private skipButton: HTMLButtonElement;
  private ops: WarehouseOpsPanel;
  private opticalHint: HTMLElement;
  private inputButton: HTMLButtonElement;
  private opticalAim = false;
  private messageTimer = 0;
  private decisionHandler: ((decision: WarehouseDecision) => void) | null = null;
  private toolHandler: ((tool: WarehouseTool) => void) | null = null;
  private transmitHandler: ((text: string) => WarehouseChatReply | null) | null = null;
  private doorSelectHandler: ((door: WarehouseDoorId) => void) | null = null;
  private doorCycleHandler: (() => void) | null = null;
  private replayHandler: (() => void) | null = null;
  private skipHandler: (() => void) | null = null;
  private zoneSelectHandler: ((zone: WarehouseSecurityZoneId) => void) | null = null;
  private zoneContainHandler: ((zone: WarehouseSecurityZoneId) => void) | null = null;
  private selectedDoor: WarehouseDoorId = 'service-a';
  private selectedDoorStatus = 'unseen';
  private cctvTimestampOffset = 0;
  private intrusion: WarehouseIntrusionSnapshot | null = null;
  private selectedZoneStatus = 'unseen';

  public constructor(
    container: HTMLElement,
    mode: WarehouseMode,
    onExit: () => void,
    onRecover: () => void,
    onInputMode: () => void
  ) {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `${CSS}${SECURITY_CSS}`;
      document.head.appendChild(style);
    }
    const root = document.createElement('section');
    root.className = 'warehouse-hud';
    root.style.fontSize = 'calc(12px + var(--omni-font-boost, 0px))';
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
    const optical = document.createElement('div');
    optical.className = 'warehouse-hud__optical';
    const opticalReadout = document.createElement('div');
    opticalReadout.className = 'warehouse-hud__optical-readout';
    opticalReadout.append(document.createTextNode('FOCAL 42MM // STABILIZER '));
    const opticalState = document.createElement('span');
    opticalState.textContent = 'LOCKED';
    opticalReadout.append(opticalState);
    optical.append(opticalReadout);
    this.ops = new WarehouseOpsPanel(
      mode,
      (decision) => this.decisionHandler?.(decision),
      (text) => this.transmitHandler?.(text) ?? { name: 'WAREHOUSE 07', body: 'Channel is not ready.', source: 'system' },
      (zone) => this.zoneContainHandler?.(zone)
    );
    this.tools = document.createElement('div');
    this.tools.className = 'warehouse-hud__tools';
    this.doors = document.createElement('div');
    this.doors.className = 'warehouse-hud__doors';
    for (const [id, label] of [
      ['service-a', 'A △'],
      ['service-b', 'B ‖'],
      ['service-c', 'C ○'],
    ] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${label} // UNSEEN`;
      button.addEventListener('click', () => this.doorSelectHandler?.(id));
      this.doorButtons.set(id, button);
      this.doors.appendChild(button);
    }
    for (const [id, label] of [
      ['receiving', 'R // RECEIVING'],
      ['storage-west', 'W // STORAGE WEST'],
      ['storage-east', 'E // STORAGE EAST'],
      ['sortation', 'S // SORTATION'],
    ] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.hidden = true;
      button.dataset.role = 'zone';
      button.textContent = `${label} // UNSEEN`;
      button.addEventListener('click', () => this.zoneSelectHandler?.(id));
      this.zoneButtons.set(id, button);
      this.doors.appendChild(button);
    }
    const next = document.createElement('button');
    next.type = 'button';
    next.textContent = 'C // NEXT FEED';
    next.addEventListener('click', () => this.doorCycleHandler?.());
    this.replayButton = document.createElement('button');
    this.replayButton.type = 'button';
    this.replayButton.dataset.role = 'replay';
    this.replayButton.textContent = 'REPLAY EVENT';
    this.replayButton.hidden = true;
    this.replayButton.addEventListener('click', () => this.replayHandler?.());
    this.skipButton = document.createElement('button');
    this.skipButton.type = 'button';
    this.skipButton.dataset.role = 'replay';
    this.skipButton.textContent = 'ESC // SKIP RESPONSE';
    this.skipButton.hidden = true;
    this.skipButton.addEventListener('click', () => this.skipHandler?.());
    this.doors.append(next, this.replayButton, this.skipButton);
    this.message = document.createElement('div');
    this.message.className = 'warehouse-hud__message';
    this.controls = document.createElement('div');
    this.controls.className = 'warehouse-hud__controls';
    this.controls.textContent = 'WASD MOVE  //  Q E ALTITUDE  //  RMB HOLD OPTICAL  //  LMB SCAN  //  M CURSOR  //  F GRIP  //  TAB VIEW';
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
    this.opticalHint = document.createElement('div');
    this.opticalHint.className = 'warehouse-hud__opticalhint';
    this.inputButton = document.createElement('button');
    this.inputButton.className = 'warehouse-hud__input';
    this.inputButton.type = 'button';
    this.inputButton.addEventListener('click', onInputMode);
    const footer = document.createElement('div');
    footer.className = 'warehouse-hud__footer';
    const version = document.createElement('span');
    version.textContent = 'OMNISCIENT OS // WAREHOUSE CONTROL';
    const notice = document.createElement('span');
    notice.textContent = 'ALL HANDLING DECISIONS ARE MONITORED AND RECORDED.';
    const linkState = document.createElement('span');
    linkState.textContent = 'REMOTE LINK 07';
    footer.append(version, notice, linkState);
    root.append(top, this.feed, optical, this.scanFx, centre, this.ops.root, this.tools, this.doors, this.message, this.controls, exit, recover, this.opticalHint, this.inputButton, footer);
    container.appendChild(root);
    this.root = root;
    this.setIntegrity(3, 0, 0);
    this.setBell(false, 0);
    this.setInbound(null);
    this.setOpticalAim(false);
    this.setCursorMode(true);
    this.setView('cctv');
  }

  public onDecision(handler: (decision: WarehouseDecision) => void): void {
    this.decisionHandler = handler;
  }

  public onTool(handler: (tool: WarehouseTool) => void): void {
    this.toolHandler = handler;
  }

  public onTransmit(handler: (text: string) => WarehouseChatReply | null): void {
    this.transmitHandler = handler;
  }

  public onDoorSelect(handler: (door: WarehouseDoorId) => void): void {
    this.doorSelectHandler = handler;
  }

  public onDoorCycle(handler: () => void): void {
    this.doorCycleHandler = handler;
  }

  public onReplay(handler: () => void): void {
    this.replayHandler = handler;
  }

  public onSkip(handler: () => void): void {
    this.skipHandler = handler;
  }

  public onZoneSelect(handler: (zone: WarehouseSecurityZoneId) => void): void {
    this.zoneSelectHandler = handler;
  }

  public onZoneContain(handler: (zone: WarehouseSecurityZoneId) => void): void {
    this.zoneContainHandler = handler;
  }

  public setCase(title: string, objective: string): void {
    this.title.textContent = title;
    this.objective.textContent = objective;
  }

  public setIntegrity(integrity: number, stage: number, chain: number): void {
    this.integrity.textContent = `INTEGRITY ${'◆'.repeat(Math.max(0, integrity))}${'◇'.repeat(Math.max(0, 3 - integrity))}  //  STAGE ${String(stage).padStart(2, '0')}  //  CHAIN ${chain}`;
  }

  public setBell(waiting: boolean, count: number, location?: string): void {
    this.bell.textContent = waiting
      ? location
        ? `PERIMETER CONTACT // ${location}`
        : `PERIMETER CONTACT // SOURCE UNRESOLVED // ${count} SIGNAL${count === 1 ? '' : 'S'}`
      : 'PERIMETER // CLEAR';
  }

  public setSecurityAlert(message: string): void {
    this.bell.textContent = message;
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
      ? this.cctvFeedText()
      : view === 'console'
        ? 'WAREHOUSE TOPOLOGY // MANIFEST OVERLAY'
        : this.opticalAim
          ? 'DRONE 07 // FIRST PERSON // OPTICAL ACQUISITION'
          : 'DRONE 07 // THIRD PERSON // NAVIGATION';
  }

  public setDoorStates(states: readonly WarehouseDoorSnapshot[]): void {
    for (const state of states) {
      const button = this.doorButtons.get(state.id);
      if (!button) continue;
      const label = state.id === 'service-a' ? 'A △' : state.id === 'service-b' ? 'B ‖' : 'C ○';
      button.textContent = `${label} // ${state.status.toUpperCase()}`;
      button.dataset.status = state.status;
      button.dataset.selected = String(state.selected);
      if (state.selected) {
        this.selectedDoor = state.id;
        this.selectedDoorStatus = state.status;
      }
    }
    if (this.root.dataset.view === 'cctv') this.feed.textContent = this.cctvFeedText();
  }

  public setIntrusion(
    intrusion: WarehouseIntrusionSnapshot | null,
    states: readonly WarehouseSecurityZoneSnapshot[] = []
  ): void {
    this.intrusion = intrusion;
    for (const button of this.doorButtons.values()) button.hidden = intrusion !== null;
    for (const button of this.zoneButtons.values()) button.hidden = intrusion === null;
    this.controls.textContent = intrusion
      ? 'WASD MOVE  //  Q E ALTITUDE  //  RMB HOLD OPTICAL  //  LMB TAG  //  M CURSOR  //  C NEXT INTERNAL FEED  //  TAB VIEW'
      : 'WASD MOVE  //  Q E ALTITUDE  //  RMB HOLD OPTICAL  //  LMB SCAN  //  M CURSOR  //  F GRIP  //  TAB VIEW';
    for (const state of states) {
      const button = this.zoneButtons.get(state.id);
      if (!button) continue;
      const label = state.id === 'receiving'
        ? 'R // RECEIVING'
        : state.id === 'storage-west'
          ? 'W // STORAGE WEST'
          : state.id === 'storage-east'
            ? 'E // STORAGE EAST'
            : 'S // SORTATION';
      button.textContent = `${label} // ${state.status.toUpperCase()}`;
      button.dataset.status = state.status;
      button.dataset.selected = String(state.selected);
      if (state.selected) this.selectedZoneStatus = state.status;
    }
    if (this.root.dataset.view === 'cctv') this.feed.textContent = this.cctvFeedText();
  }

  public setReplayAvailable(available: boolean): void {
    this.replayButton.hidden = !available;
  }

  public setPursuit(active: boolean): void {
    this.skipButton.hidden = !active;
    for (const button of this.doorButtons.values()) button.disabled = active;
    for (const button of this.zoneButtons.values()) button.disabled = active;
    this.replayButton.hidden = active || this.replayButton.hidden;
  }

  public setCctvTimestampOffset(seconds: number): void {
    this.cctvTimestampOffset = seconds;
    if (this.root.dataset.view === 'cctv') this.feed.textContent = this.cctvFeedText();
  }

  public setOpticalAim(active: boolean): void {
    this.opticalAim = active;
    this.root.dataset.optical = String(active);
    this.opticalHint.textContent = active
      ? 'RMB // OPTICAL: ACTIVE'
      : 'RMB // HOLD: OPTICAL';
    if (this.root.dataset.view === 'drone') this.setView('drone');
  }

  public setCursorMode(cursorVisible: boolean): void {
    this.root.dataset.cursor = String(cursorVisible);
    this.inputButton.textContent = cursorVisible
      ? 'M // INPUT: CURSOR'
      : 'M // INPUT: DRONE LOOK';
    this.inputButton.setAttribute('aria-pressed', String(cursorVisible));
  }

  public setControlsVisible(visible: boolean): void {
    this.controls.style.display = visible ? '' : 'none';
  }

  public showCase(
    data: GeneratedWarehouseCase,
    evidence: WarehouseEvidenceState,
    intrusion: WarehouseIntrusionSnapshot | null = null
  ): void {
    this.ops.showCase(data, evidence, intrusion);
  }

  public appendSystem(name: string, body: string): void {
    this.ops.appendSystem(name, body);
  }

  public setRecords(records: readonly WarehouseArchiveRecord[]): void {
    this.ops.setRecords(records);
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

  private cctvFeedText(): string {
    if (this.intrusion) {
      const zone = this.intrusion.selectedZone === 'receiving'
        ? 'CCTV R // RECEIVING'
        : this.intrusion.selectedZone === 'storage-west'
          ? 'CCTV W // STORAGE WEST'
          : this.intrusion.selectedZone === 'storage-east'
            ? 'CCTV E // STORAGE EAST'
            : 'CCTV S // SORTATION';
      const time = new Date(Date.now() + this.cctvTimestampOffset * 1000).toISOString().slice(11, 19);
      return `${zone} // ${time} UTC // ${this.selectedZoneStatus.toUpperCase()} // EMERGENCY RECORD`;
    }
    const door = this.selectedDoor === 'service-a'
      ? 'CCTV A // WEST'
      : this.selectedDoor === 'service-b'
        ? 'CCTV B // FRONT'
        : 'CCTV C // EAST';
    const time = new Date(Date.now() + this.cctvTimestampOffset * 1000).toISOString().slice(11, 19);
    return `${door} // ${time} UTC // ${this.selectedDoorStatus.toUpperCase()} // LOW BANDWIDTH`;
  }
}
