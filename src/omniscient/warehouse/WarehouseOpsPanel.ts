import { injectTerminalStyles } from '../link/LocalSurface.js';
import { warehouseArchiveKey } from './archive.js';
import type { InboundAuditSnapshot } from './WarehouseInboundAudit.js';

import type {
  GeneratedWarehouseCase,
  WarehouseArchiveRecord,
  WarehouseConsoleAction,
  WarehouseDockSnapshot,
  WarehouseEvidenceState,
  WarehouseIntrusionSnapshot,
  WarehouseMode,
  WarehouseSecurityZoneId,
} from './types.js';

const STYLE_ID = 'warehouse-ops-style';

const CSS = `
/*
 * The panel FILLS its column; it does not place itself.
 *
 * It used to be position:absolute against the viewport - right:18px, top:146px,
 * bottom:42px - with a top offset chosen to clear a briefing card that no longer
 * exists. It now sits in the console frame's right-hand grid cell, which is the same
 * cell the Contact View's transcript occupies, so the frame decides the width and the
 * margins and this only has to fill what it is given. Two layout systems arguing over
 * one element is how a panel ends up 146 pixels down for a reason nobody remembers.
 */
.warehouse-ops{flex:1;min-height:0;pointer-events:auto}
.warehouse-ops__session-link{color:#4f9a5e}.warehouse-ops__pane{display:none}.warehouse-ops__pane[data-active=true]{display:flex}.warehouse-ops__pane:not(.warehouse-ops__chat)>:first-child{margin-top:0}.warehouse-ops__observed{min-height:48px}.warehouse-ops__chat{overscroll-behavior:contain}.warehouse-ops__readout{display:grid;grid-template-columns:minmax(120px,.8fr) minmax(0,1.2fr);gap:16px;padding:7px 10px;border-bottom:1px solid #1e3a28;color:#cfe6c4}.warehouse-ops__readout:first-of-type{border-top:1px solid #1e3a28}.warehouse-ops__readout-label{color:#4f9a5e;font-size:10px;letter-spacing:.14em;text-transform:uppercase}.warehouse-ops__readout-value{text-align:right}.warehouse-ops__readout-value[data-state=good]{color:#7fe08a}.warehouse-ops__readout-value[data-state=bad]{color:#e8877a}.warehouse-ops__brief{margin-top:9px}.warehouse-ops__actions{margin-top:auto}.warehouse-ops__actions .omni-confirm__row{flex-wrap:wrap}.warehouse-ops__actions .omni-confirm__btn{flex:1;min-width:118px}.warehouse-ops__actions .omni-confirm__btn:disabled{opacity:.32;cursor:not-allowed}.warehouse-ops__record-title{display:block;color:#d8ffb0}.warehouse-ops__record-meta{display:block;margin-top:4px;color:#4f9a5e;font-size:10px;letter-spacing:.1em;text-transform:uppercase}.warehouse-ops__contact-pulse{animation:warehouse-contact-pulse 900ms ease-out}@keyframes warehouse-contact-pulse{from{color:#fff;text-shadow:0 0 12px #7fe08a}to{color:#d8ffb0;text-shadow:none}}@media(max-width:760px){.warehouse-ops .omni-terminal__session{display:none}}
`;

type WarehousePanelTab = 'chat' | 'console' | 'records';

export interface WarehouseChatReply {
  name: string;
  body: string;
  source?: 'visitor' | 'system';
}

export class WarehouseOpsPanel {
  public readonly root: HTMLElement;

  private readonly contact: HTMLElement;
  private readonly location: HTMLElement;
  private readonly observed: HTMLElement;
  private readonly panes = new Map<WarehousePanelTab, HTMLElement>();
  private readonly tabs = new Map<WarehousePanelTab, HTMLButtonElement>();
  private readonly chatLog: HTMLElement;
  private readonly consolePane: HTMLElement;
  private readonly recordsPane: HTMLElement;
  /** The last answer each query produced, so an unchanged repeat can be suppressed. */
  private readonly lastReplies = new Map<string, string>();
  private readonly suggestionChips = new Map<string, HTMLButtonElement>();
  private readonly input: HTMLInputElement;
  private activeCaseKey = '';
  private scanAnnounced = false;
  private contactAnnounced = false;

  public constructor(
    mode: WarehouseMode,
    private readonly decide: (action: WarehouseConsoleAction) => void,
    private readonly transmit: (text: string) => WarehouseChatReply | null,
    private readonly contain: (zone: WarehouseSecurityZoneId) => void
  ) {
    injectTerminalStyles();
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    const root = document.createElement('section');
    root.className = 'omni-terminal warehouse-ops';

    const session = document.createElement('div');
    session.className = 'omni-terminal__session';
    const sessionId = document.createElement('span');
    sessionId.textContent = mode === 'story' ? 'SESSION W07-STORY' : `SESSION W07-${mode.toUpperCase()}`;
    const link = document.createElement('span');
    link.className = 'warehouse-ops__session-link';
    link.textContent = 'SECURE REMOTE LINK';
    session.append(sessionId, link);

    const head = document.createElement('div');
    head.className = 'omni-terminal__head';
    this.contact = document.createElement('span');
    this.contact.className = 'omni-terminal__contact';
    head.appendChild(this.contact);

    this.location = document.createElement('span');
    this.location.className = 'omni-terminal__where';

    const tabs = document.createElement('div');
    tabs.className = 'omni-tabs';
    for (const [id, label] of [
      ['chat', 'CHAT'],
      ['console', 'CONSOLE'],
      ['records', 'RECORDS 0'],
    ] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'omni-tab';
      button.textContent = label;
      button.addEventListener('click', () => this.setTab(id));
      tabs.appendChild(button);
      this.tabs.set(id, button);
    }

    this.observed = document.createElement('div');
    this.observed.className = 'omni-observed warehouse-ops__observed';

    this.chatLog = document.createElement('div');
    this.chatLog.className = 'omni-terminal__log warehouse-ops__pane warehouse-ops__chat';
    this.consolePane = document.createElement('div');
    this.consolePane.className = 'omni-terminal__log warehouse-ops__pane';
    this.recordsPane = document.createElement('div');
    this.recordsPane.className = 'omni-terminal__log warehouse-ops__pane';
    this.panes.set('chat', this.chatLog);
    this.panes.set('console', this.consolePane);
    this.panes.set('records', this.recordsPane);

    const foot = document.createElement('div');
    foot.className = 'omni-terminal__foot';
    const suggestions = document.createElement('div');
    suggestions.className = 'omni-suggest';
    const suggestionLabel = document.createElement('span');
    suggestionLabel.className = 'omni-suggest__label';
    suggestionLabel.textContent = 'YOU COULD SAY';
    suggestions.appendChild(suggestionLabel);
    for (const query of ['package', 'visitor identity', 'door telemetry', 'help']) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'omni-suggest__chip';
      button.textContent = query;
      button.addEventListener('click', () => this.send(query));
      this.suggestionChips.set(query, button);
      suggestions.appendChild(button);
    }
    const hint = document.createElement('div');
    hint.className = 'omni-terminal__hint';
    hint.textContent = 'WAREHOUSE LINK // NO TIME PRESSURE DURING CHAT';
    const entry = document.createElement('div');
    entry.className = 'omni-terminal__entry';
    const caret = document.createElement('span');
    caret.className = 'omni-terminal__caret';
    caret.textContent = '>';
    this.input = document.createElement('input');
    this.input.className = 'omni-terminal__input';
    this.input.type = 'text';
    this.input.autocomplete = 'off';
    this.input.spellcheck = false;
    this.input.placeholder = 'transmit...';
    this.input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key !== 'Enter') return;
      const text = this.input.value.trim();
      if (!text) return;
      this.input.value = '';
      this.send(text);
    });
    this.input.addEventListener('keyup', (event) => event.stopPropagation());
    entry.append(caret, this.input);
    foot.append(suggestions, hint, entry);

    root.append(
      session,
      head,
      this.location,
      tabs,
      this.observed,
      this.chatLog,
      this.consolePane,
      this.recordsPane,
      foot
    );
    this.root = root;
    this.setTab('chat');
  }

  public showCase(
    data: GeneratedWarehouseCase,
    evidence: WarehouseEvidenceState,
    intrusion: WarehouseIntrusionSnapshot | null = null,
    dock: WarehouseDockSnapshot | null = null,
    inboundAudit: InboundAuditSnapshot | null = null
  ): void {
    const caseKey = `${data.definition.id}:${data.packageId}:${data.visitorName}:${data.assignedDoorId}`;
    const newCase = caseKey !== this.activeCaseKey;
    const internalCase = data.definition.id === 'internal-breach';
    const perimeterCase = data.definition.subjectType !== 'worker' && data.definition.id !== 'freight-sort' && !internalCase;
    this.contact.textContent = internalCase
      ? 'UNLISTED PERSON'
      : data.definition.subjectType === 'worker'
      ? data.workerName
      : perimeterCase && !evidence.located
        ? 'PERIMETER CONTACT'
        : data.visitorName;
    this.location.textContent = internalCase
      ? `WAREHOUSE 07 // ${intrusion ? this.zoneName(intrusion.lastSeenZone ?? intrusion.currentZone) : 'SECURITY LINK'}`
      : data.definition.subjectType === 'worker'
      ? 'WAREHOUSE 07 // PERSONNEL CHANNEL'
      : data.definition.id === 'freight-sort'
        ? 'WAREHOUSE 07 // INBOUND AUDIT'
        : evidence.located
          ? `WAREHOUSE 07 // ${this.doorName(data.assignedDoorId)}`
          : 'WAREHOUSE 07 // SOURCE UNRESOLVED';
    this.renderObserved(data, evidence, intrusion, inboundAudit);

    if (newCase) {
      this.activeCaseKey = caseKey;
      this.scanAnnounced = false;
      this.contactAnnounced = false;
      /*
       * The log is about to be emptied, so every answer that was standing in it is gone and
       * every chip is worth asking again. Forgetting this is how a dedupe becomes a bug: the
       * chips would stay dim into a case they have never answered, and clicking one would do
       * nothing because its reply from the PREVIOUS visitor still matched.
       */
      this.lastReplies.clear();
      for (const query of this.suggestionChips.keys()) this.markChipSpent(query, false);
      this.chatLog.replaceChildren();
      this.appendChat(
        'system',
        'WAREHOUSE 07',
        internalCase
          ? 'PERSONNEL COUNT MISMATCH // Reconstruct the rear entry, locate the unlisted person, and preserve optical evidence.'
          : perimeterCase
            ? 'PERIMETER CONTACT // SOURCE UNRESOLVED. Locate the caller through the service cameras.'
            : 'Incoming request linked to the active manifest.'
      );
      if (data.definition.subjectType === 'worker') {
        this.appendChat('visitor', data.workerName, 'Temporary shift credentials submitted for clearance.');
      } else if (data.definition.id === 'freight-sort') {
        this.appendChat('system', 'INBOUND CONTROL', `Delivery ${inboundAudit ? inboundAudit.activeIndex + 1 : 1} of 5 is active. Scan the named worker, then compare the package on their rack.`);
      }
      this.contact.classList.remove('warehouse-ops__contact-pulse');
      requestAnimationFrame(() => this.contact.classList.add('warehouse-ops__contact-pulse'));
      this.setTab('chat');
    }

    if (perimeterCase && evidence.located && !this.contactAnnounced) {
      this.contactAnnounced = true;
      this.appendChat(
        'visitor',
        data.visitorName,
        data.visitorIntent === 'intrusion'
          ? 'No response. The subject continues testing the secured cargo hatch.'
          : `Collection request submitted for package ${data.packageId} at ${this.doorName(data.assignedDoorId)}.`
      );
    }

    this.renderConsole(data, evidence, intrusion, dock, inboundAudit);
    if ((evidence.visitor || evidence.cargo) && !this.scanAnnounced) {
      this.scanAnnounced = true;
      this.appendChat('system', 'WAREHOUSE 07', 'Optical evidence recorded. Console comparison is ready.');
      this.tabs.get('console')?.classList.add('omni-tab--live');
    }
  }

  public setRecords(records: readonly WarehouseArchiveRecord[]): void {
    const unique = [...new Map(records.map((record) => [warehouseArchiveKey(record), record])).values()];
    const tab = this.tabs.get('records');
    if (tab) tab.textContent = `RECORDS ${unique.length}`;
    this.recordsPane.replaceChildren();
    if (!unique.length) {
      const empty = document.createElement('div');
      empty.className = 'omni-empty';
      empty.textContent = 'NO EVIDENCE CAPTURED';
      this.recordsPane.appendChild(empty);
      return;
    }
    for (const record of [...unique].reverse().slice(0, 16)) {
      const row = document.createElement('div');
      row.className = 'omni-item omni-item--static';
      const title = document.createElement('strong');
      title.className = 'warehouse-ops__record-title';
      title.textContent = `${record.packageId} // ${record.channel.toUpperCase()}`;
      const detail = document.createElement('span');
      detail.className = 'warehouse-ops__record-meta';
      const progressLabel = record.mode === 'story' ? 'QUEST' : 'STAGE';
      detail.textContent = `${record.caseId.toUpperCase()} // ${progressLabel} ${record.stage} // ${new Date(record.capturedAt).toLocaleString()}`;
      row.append(title, detail);
      this.recordsPane.appendChild(row);
    }
  }

  public appendSystem(name: string, body: string): void {
    this.appendChat('system', name, body);
    this.tabs.get('chat')?.classList.add('omni-tab--live');
  }

  private renderObserved(
    data: GeneratedWarehouseCase,
    evidence: WarehouseEvidenceState,
    intrusion: WarehouseIntrusionSnapshot | null,
    inboundAudit: InboundAuditSnapshot | null
  ): void {
    this.observed.replaceChildren();
    const tag = document.createElement('span');
    tag.className = 'omni-observed__tag';
    tag.textContent = 'OBSERVED';
    this.observed.appendChild(tag);
    const observations: Array<[string, string, boolean]> = data.definition.id === 'internal-breach' && intrusion
      ? [
        [intrusion.evidence.rearHistory ? 'Rear entry history acquired' : 'Rear entry history required', 'rear camera history', intrusion.evidence.rearHistory],
        [intrusion.evidence.headcount ? 'Personnel mismatch confirmed' : 'Personnel count required', 'personnel count', intrusion.evidence.headcount],
        [intrusion.evidence.liveTag ? 'Live optical tag acquired' : 'Live optical tag required', 'optical tag', intrusion.evidence.liveTag],
      ]
      : data.definition.id === 'freight-sort' && inboundAudit
        ? [
          [
            inboundAudit.workerScanned
              ? `Worker ${data.workerName} scanned`
              // Says WHERE, because a name alone sent the player looking down a 58m building.
              : `Scan ${data.workerName} // ${inboundAudit.station}`,
            'visitor identity',
            inboundAudit.workerScanned,
          ],
          [inboundAudit.packageScanned ? `Package ${data.packageId} scanned` : `Package ${data.packageId} // Aisle ${data.aisle} Bay ${String(data.bay).padStart(2, '0')}`, 'package', inboundAudit.packageScanned],
          [`Deliveries resolved ${inboundAudit.resolved}/${inboundAudit.total}`, 'manifest', inboundAudit.resolved >= inboundAudit.total],
        ]
      : data.definition.subjectType === 'worker'
      ? [
        [`Worker ${data.workerName}`, 'visitor identity', evidence.visitor],
        [evidence.visitor ? 'Identity record acquired' : 'Identity record required', 'manifest', evidence.visitor],
      ]
      : data.definition.id === 'freight-sort'
        ? [
          ['Rear freight manifest', 'manifest', evidence.cargo],
          [evidence.cargo ? 'Load record acquired' : 'Load record required', 'package', evidence.cargo],
        ]
        : [
          [evidence.located ? this.doorName(data.assignedDoorId) : 'Entrance source unresolved', 'door telemetry', evidence.located],
          [`Package ${data.packageId}`, 'package', evidence.cargo],
          [evidence.visitor ? 'Visitor record acquired' : 'Visitor record required', 'visitor identity', evidence.visitor],
        ];
    for (const [label, query, complete] of observations) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `omni-observed__item${complete ? ' omni-observed__item--read' : ''}`;
      button.textContent = label;
      button.addEventListener('click', () => this.send(query));
      this.observed.appendChild(button);
    }
  }

  private renderConsole(
    data: GeneratedWarehouseCase,
    evidence: WarehouseEvidenceState,
    intrusion: WarehouseIntrusionSnapshot | null,
    dock: WarehouseDockSnapshot | null,
    inboundAudit: InboundAuditSnapshot | null
  ): void {
    this.consolePane.replaceChildren();
    const heading = document.createElement('div');
    heading.className = 'omni-empty';
    heading.textContent = 'ACTIVE MANIFEST // EVIDENCE COMPARISON';
    this.consolePane.appendChild(heading);
    const rows = this.consoleRows(data, evidence, intrusion, dock, inboundAudit);
    for (const [label, value, state] of rows) {
      const row = document.createElement('div');
      row.className = 'warehouse-ops__readout';
      const left = document.createElement('span');
      left.className = 'warehouse-ops__readout-label';
      left.textContent = label;
      const right = document.createElement('span');
      right.className = 'warehouse-ops__readout-value';
      right.textContent = value;
      if (state) right.dataset.state = state;
      row.append(left, right);
      this.consolePane.appendChild(row);
    }

    const brief = document.createElement('div');
    brief.className = 'omni-item omni-item--static warehouse-ops__brief';
    const briefLabel = document.createElement('span');
    briefLabel.className = 'omni-item__meta';
    briefLabel.textContent = 'CASE ASSESSMENT';
    const briefText = document.createElement('span');
    briefText.className = 'omni-item__detail';
    briefText.textContent = data.definition.id === 'freight-sort' && inboundAudit
      ? inboundAudit.phase === 'fugitive-search'
        ? 'Locate and scan the same worker who supplied the contradictory package. The drone records and contains; it never confronts.'
        : 'Compare the active worker badge with the package deliverer and seal. Carry clean loads to VERIFIED INTAKE.'
      : data.definition.id === 'internal-breach'
      ? 'Contain the tagged person inside the matching security sector. The drone never confronts the subject.'
      : evidence.visitor && evidence.cargo
      ? data.definition.briefing
      : data.definition.subjectType === 'worker' || data.definition.id === 'freight-sort'
        ? 'Acquire an optical record before committing a decision.'
        : 'Locate the perimeter contact, then compare visitor and package evidence.';
    brief.append(briefLabel, briefText);
    this.consolePane.appendChild(brief);

    const actions = document.createElement('div');
    actions.className = 'omni-confirm warehouse-ops__actions';
    const prompt = document.createElement('span');
    prompt.className = 'omni-confirm__q';
    const staged = dock?.stagedPackageIds.length ?? 0;
    const required = dock?.requiredCount ?? 0;
    const evidenceReady = evidence.visitor && evidence.cargo;
    const dockCommitted = dock && dock.state !== 'empty' && dock.state !== 'staged';
    prompt.textContent = data.definition.id === 'freight-sort' && inboundAudit
      ? inboundAudit.phase === 'alarm-ready'
        ? 'CONTRADICTION CONFIRMED // REJECT + EMERGENCY AVAILABLE'
        : inboundAudit.phase === 'sort-ready'
          ? 'SORT AUTHORIZED // CARRY LOAD TO VERIFIED INTAKE // FALSE ALARM REMAINS POSSIBLE'
          : inboundAudit.phase === 'fugitive-search'
            ? `EMERGENCY SEARCH // LAST SEEN ${inboundAudit.fugitiveZone?.toUpperCase() ?? 'RECEIVING'}`
            : 'SCAN ACTIVE WORKER + PACKAGE // RETURN LOAD AVAILABLE'
      : dockCommitted
      ? `TRANSFER COMMITTED // ${dock.state.toUpperCase()}`
      : data.definition.id === 'door-tamper'
      ? evidence.action && evidence.authorization && evidence.tamper
        ? 'IDENTITY + TAMPER STACK CONFIRMED // DENY REQUIRES NO CARGO STAGING'
        : 'VERDICTS LOCKED // COMPLETE ACTION, IDENTITY, AND TAMPER EVIDENCE // RETURN LOAD AVAILABLE'
      : data.definition.correctDecision === 'deny-lockdown' && evidenceReady
        ? 'RECIPIENT IDENTITY MISMATCH // DENY REQUIRES NO CARGO STAGING'
        : !evidenceReady && dock
          ? data.definition.id === 'package-5018'
            ? 'VERDICTS LOCKED // INSPECT VISITOR FEED + SCAN OR DOCK BOTH 5018 LOADS // RETURN AVAILABLE'
            : !evidence.visitor && !evidence.cargo
              ? 'VERDICTS LOCKED // INSPECT VISITOR FEED + SCAN OR DOCK PACKAGE // RETURN LOAD AVAILABLE'
              : !evidence.visitor
                ? `VISITOR RECORD REQUIRED // INSPECT ${this.doorName(data.assignedDoorId)} FEED`
                : 'PACKAGE RECORD REQUIRED // RMB + LMB SCAN OR F // DOCK LOAD'
          : dock && staged < required
            ? `STAGE LOAD AT ${this.doorName(dock.doorId)} // LOADS SECURED ${staged}/${required}`
            : dock && staged > 0
              ? `LOADS SECURED ${staged}/${required} // F // RETRIEVE LOAD BEFORE COMMITMENT`
              : 'Commit handling decision';
    const actionRow = document.createElement('div');
    actionRow.className = 'omni-confirm__row';
    if (data.definition.id === 'internal-breach' && intrusion) {
      prompt.textContent = 'Commit sector containment';
      const ready = intrusion.evidence.rearHistory
        && intrusion.evidence.headcount
        && intrusion.evidence.liveTag
        && intrusion.tagSeconds > 0;
      for (const zone of ['receiving', 'storage-west', 'storage-east', 'sortation'] as const) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'omni-confirm__btn';
        button.textContent = `LOCK ${this.zoneName(zone)}`;
        button.disabled = !ready || intrusion.phase === 'contained' || intrusion.phase === 'response';
        button.addEventListener('click', () => this.contain(zone));
        actionRow.appendChild(button);
      }
      actions.append(prompt, actionRow);
      this.consolePane.appendChild(actions);
      return;
    }
    const decisions: readonly WarehouseConsoleAction[] = data.definition.subjectType === 'worker'
      ? ['clear', 'hold', 'verify']
      : data.definition.id === 'freight-sort'
        ? ['deny-lockdown', 'return']
        : data.definition.id === 'door-tamper'
          ? ['deny-lockdown', 'release', 'return']
        : data.definition.id === 'package-5018'
          ? ['verify', 'release', 'quarantine', 'return']
          : ['release', 'quarantine', 'return', 'deny-lockdown'];
    const labels: Readonly<Partial<Record<WarehouseConsoleAction, string>>> = {
      hold: 'HOLD BAY',
      verify: 'REQUEST VERIFICATION',
      return: 'RETURN LOAD',
      'deny-lockdown': 'DENY + LOCKDOWN',
    };
    for (const decision of decisions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'omni-confirm__btn';
      button.textContent = data.definition.id === 'freight-sort'
        ? decision === 'deny-lockdown' ? 'REJECT + EMERGENCY' : 'RETURN LOAD'
        : labels[decision] ?? decision.toUpperCase();
      if (decision === 'return') {
        button.title = 'Send the current carried or docked load back to its original rack position.';
      }
      button.disabled = !this.decisionReady(data, evidence, decision, dock, inboundAudit);
      button.addEventListener('click', () => this.decide(decision));
      actionRow.appendChild(button);
    }
    actions.append(prompt, actionRow);
    this.consolePane.appendChild(actions);
  }

  private consoleRows(
    data: GeneratedWarehouseCase,
    evidence: WarehouseEvidenceState,
    intrusion: WarehouseIntrusionSnapshot | null,
    dock: WarehouseDockSnapshot | null,
    inboundAudit: InboundAuditSnapshot | null
  ): Array<[string, string, 'good' | 'bad' | null]> {
    if (data.definition.id === 'internal-breach' && intrusion) {
      const evidenceCount = Number(intrusion.evidence.rearHistory)
        + Number(intrusion.evidence.headcount)
        + Number(intrusion.evidence.liveTag);
      return [
        ['SUBJECT', 'UNLISTED PERSON', null],
        ['REAR HISTORY', intrusion.evidence.rearHistory ? 'ENTRY RECORDED' : 'QUERY REQUIRED', intrusion.evidence.rearHistory ? 'good' : null],
        ['PERSONNEL COUNT', intrusion.evidence.headcount ? 'MANIFEST +1 BODY' : 'QUERY REQUIRED', intrusion.evidence.headcount ? 'bad' : null],
        ['OPTICAL TAG', intrusion.tagSeconds > 0 ? `${intrusion.tagSeconds.toFixed(1)} SEC // LIVE` : intrusion.evidence.liveTag ? 'EXPIRED // REACQUIRE' : 'SCAN REQUIRED', intrusion.tagSeconds > 0 ? 'good' : intrusion.evidence.liveTag ? 'bad' : null],
        ['LAST SEEN', intrusion.lastSeenZone ? this.zoneName(intrusion.lastSeenZone) : 'UNKNOWN', intrusion.lastSeenZone ? 'good' : null],
        ['EVIDENCE STACK', `${evidenceCount} / 3 CONFIRMED`, evidenceCount === 3 ? 'good' : null],
      ];
    }
    if (data.definition.id === 'freight-sort' && inboundAudit) {
      const deliverer = inboundAudit.delivererMatches;
      const seal = inboundAudit.sealIntact;
      return [
        ['DELIVERY', `${inboundAudit.activeIndex + 1} / ${inboundAudit.total}`, null],
        ['WORKER', inboundAudit.workerScanned ? `${data.workerName} // ${data.workerName === 'Rui Alves' ? 'WX-3319' : 'BADGE VERIFIED'}` : 'OPTICAL SCAN REQUIRED', inboundAudit.workerScanned ? 'good' : null],
        ['ASSIGNED PACKAGE', `${data.packageId} // AISLE ${data.aisle} // BAY ${String(data.bay).padStart(2, '0')}`, null],
        ['PACKAGE DELIVERER', inboundAudit.packageScanned ? data.packageRecipientName : 'PACKAGE SCAN REQUIRED', deliverer === null ? null : deliverer ? 'good' : 'bad'],
        ['DELIVERER MATCH', deliverer === null ? 'COMPARISON REQUIRED' : deliverer ? 'CONFIRMED' : 'IDENTITY CONTRADICTION', deliverer === null ? null : deliverer ? 'good' : 'bad'],
        ['SECURITY SEAL', seal === null ? 'PACKAGE SCAN REQUIRED' : seal ? 'INTACT' : 'PACKAGE TAMPERED', seal === null ? null : seal ? 'good' : 'bad'],
        ['SORT CONTROL', inboundAudit.phase === 'sort-ready' ? 'AUTHORIZED' : inboundAudit.phase === 'alarm-ready' ? 'REJECT AUTHORIZED' : inboundAudit.phase === 'fugitive-search' ? 'EMERGENCY HOLD' : 'LOCKED', inboundAudit.phase === 'sort-ready' ? 'good' : inboundAudit.phase === 'alarm-ready' ? 'bad' : null],
        ['DELIVERIES RESOLVED', `${inboundAudit.resolved} / ${inboundAudit.total}`, inboundAudit.resolved >= inboundAudit.total ? 'good' : null],
      ];
    }
    if (data.definition.subjectType === 'worker') {
      return [
        ['SUBJECT', data.workerName, null],
        ['IDENTITY', evidence.visitor ? (data.definition.anomaly === 'identity' ? 'ROSTER MISMATCH' : 'ROSTER MATCH') : 'SCAN REQUIRED', evidence.visitor ? data.definition.anomaly === 'identity' ? 'bad' : 'good' : null],
        ['CLEARANCE', evidence.visitor ? (data.definition.correctDecision === 'clear' ? 'VALID' : 'SECONDARY CHECK') : 'SCAN REQUIRED', evidence.visitor ? data.definition.correctDecision === 'clear' ? 'good' : 'bad' : null],
      ];
    }
    if (data.definition.id === 'freight-sort') {
      return [
        ['SUBJECT', 'REAR FREIGHT LOAD', null],
        ['MANIFEST', evidence.cargo ? 'LOAD ACCOUNTED FOR' : 'SCAN REQUIRED', evidence.cargo ? 'good' : null],
        ['SORT CONTROL', evidence.cargo ? 'READY' : 'LOCKED', evidence.cargo ? 'good' : null],
      ];
    }
    if (data.definition.id === 'door-tamper') {
      return [
        ['SUBJECT', evidence.located ? data.visitorName : 'SOURCE UNRESOLVED', null],
        ['ASSIGNED DOOR', evidence.located ? this.doorName(data.assignedDoorId) : 'CAMERA SEARCH REQUIRED', evidence.located ? 'good' : null],
        ['ACTION TIMING', evidence.action ? 'PRE-AUTHORIZATION HATCH TEST' : 'REPLAY EVENT REQUIRED', evidence.action ? 'bad' : null],
        ['PACKAGE RECIPIENT', evidence.authorization ? `${data.packageRecipientName} // VISITOR MISMATCH` : 'SCAN VISITOR + PACKAGE', evidence.authorization ? 'bad' : null],
        ['TAMPER TELEMETRY', evidence.tamper ? 'RECORDED // SENSOR TRIPPED' : 'TELEMETRY REQUIRED', evidence.tamper ? 'bad' : null],
        ['EVIDENCE STACK', evidence.action && evidence.authorization && evidence.tamper ? '3 / 3 CONFIRMED' : `${Number(evidence.action) + Number(evidence.authorization) + Number(evidence.tamper)} / 3`, evidence.action && evidence.authorization && evidence.tamper ? 'good' : null],
      ];
    }
    const massMatch = Math.abs(data.expectedWeight - data.measuredWeight) < 0.01;
    const identityMatch = data.packageRecipientName === data.visitorName;
    const inboundValid = data.inboundStatus === 'valid';
    const secured = dock?.stagedPackageIds.length ?? 0;
    const required = dock?.requiredCount ?? 1;
    return [
      ['SUBJECT', data.packageId, null],
      ['VISITOR', evidence.located ? data.visitorName : 'SOURCE UNRESOLVED', null],
      ['ASSIGNED DOOR', evidence.visitor ? this.doorName(data.assignedDoorId) : 'VISITOR SCAN REQUIRED', evidence.visitor ? 'good' : null],
      ['PACKAGE RECIPIENT', evidence.cargo ? data.packageRecipientName : 'PACKAGE SCAN REQUIRED', evidence.cargo ? identityMatch ? 'good' : 'bad' : null],
      ['INBOUND RECORD', evidence.cargo ? data.inboundStatus.toUpperCase() : 'PACKAGE SCAN REQUIRED', evidence.cargo ? inboundValid ? 'good' : 'bad' : null],
      ['LOCATION', data.definition.id === 'package-5018'
        ? `TWO PHYSICAL AISLE 5 CLAIMS // BAY ${String(data.bay).padStart(2, '0')}`
        : `AISLE ${data.aisle} // BAY ${String(data.bay).padStart(2, '0')}`, data.definition.id === 'package-5018' ? 'bad' : null],
      ['DECLARED MASS', evidence.visitor ? `${data.expectedWeight.toFixed(1)} KG` : 'VISITOR SCAN REQUIRED', null],
      ['MEASURED MASS', evidence.cargo
        ? data.definition.id === 'package-5018' ? '30.0 + 50.0 = 80.0 KG // ONE 40.0 KG RECORD' : `${data.measuredWeight.toFixed(1)} KG`
        : data.definition.id === 'package-5018' ? 'SCAN BOTH PHYSICAL LOADS' : 'PACKAGE SCAN REQUIRED', evidence.cargo ? data.definition.id === 'package-5018' ? 'bad' : massMatch ? 'good' : 'bad' : null],
      ['SECURITY', evidence.cargo ? (data.definition.anomaly === 'seal' ? 'SEAL DISCONTINUITY' : 'SEAL VALID') : 'PACKAGE SCAN REQUIRED', evidence.cargo ? data.definition.anomaly !== 'seal' ? 'good' : 'bad' : null],
      ['SECURE TRANSFER', dock ? `${this.doorName(dock.doorId)} // ${dock.state.toUpperCase()} // LOADS ${secured}/${required}` : 'NOT REQUIRED', dock && secured >= required ? 'good' : null],
      ['DOCK CONTROL', dock && dock.state === 'staged' ? 'F // RETRIEVE LOAD' : dock && dock.state !== 'empty' ? 'COMMITMENT LOCKED' : `F // DOCK AT ${data.assignedDoorId.slice(-1).toUpperCase()}`, null],
    ];
  }

  private decisionReady(
    data: GeneratedWarehouseCase,
    evidence: WarehouseEvidenceState,
    decision: WarehouseConsoleAction,
    dock: WarehouseDockSnapshot | null,
    inboundAudit: InboundAuditSnapshot | null
  ): boolean {
    if (decision === 'return') return !dock || dock.state === 'empty' || dock.state === 'staged';
    if (dock && dock.state !== 'empty' && dock.state !== 'staged') return false;
    if (decision === 'deny-lockdown') {
      if (data.definition.id === 'freight-sort') {
        return !!inboundAudit && inboundAudit.workerScanned && inboundAudit.packageScanned
          && !['fugitive-search', 'police-response', 'complete'].includes(inboundAudit.phase);
      }
      return data.definition.id === 'door-tamper'
        ? evidence.visitor && evidence.action && evidence.authorization && evidence.tamper
        : evidence.visitor && evidence.cargo;
    }
    if (data.definition.subjectType === 'worker') return evidence.visitor;
    if (data.definition.id === 'freight-sort') return !!inboundAudit && inboundAudit.workerScanned && inboundAudit.packageScanned;
    if (decision === 'verify') return evidence.visitor || evidence.cargo;
    const cargoDecision = decision === 'release' || decision === 'quarantine';
    const staged = dock?.stagedPackageIds.length ?? 0;
    const required = dock?.requiredCount ?? 1;
    return evidence.visitor && evidence.cargo && (!cargoDecision || staged >= required);
  }

  private doorName(id: GeneratedWarehouseCase['assignedDoorId']): string {
    if (id === 'service-a') return 'SERVICE A // WEST // TRIANGLE';
    if (id === 'service-b') return 'SERVICE B // FRONT // DOUBLE BAR';
    return 'SERVICE C // EAST // CIRCLE';
  }

  private zoneName(id: WarehouseSecurityZoneId): string {
    if (id === 'receiving') return 'RECEIVING';
    if (id === 'storage-west') return 'STORAGE WEST';
    if (id === 'storage-east') return 'STORAGE EAST';
    return 'SORTATION';
  }

  private setTab(tab: WarehousePanelTab): void {
    for (const [id, button] of this.tabs) {
      button.classList.toggle('omni-tab--active', id === tab);
      if (id === tab) button.classList.remove('omni-tab--live');
    }
    for (const [id, pane] of this.panes) pane.dataset.active = String(id === tab);
  }

  /**
   * Ask, but do not ask the same question twice for the same answer.
   *
   * Reported as the hint chips pasting their details into the chat over and over: they called
   * `send` unconditionally, so four chips could fill the log with four repeating paragraphs
   * and push the actual conversation off the top. The log is the mission's evidence trail and
   * a duplicate in it is worse than noise, because a second identical reply reads like a
   * second confirmation.
   *
   * Suppressing by QUERY alone would be wrong: several of these answers change as the case
   * advances - door telemetry says something different once a door has been observed - and a
   * chip that silently stops working is its own bug. So the test is the ANSWER. Ask again and
   * you get the reply only if it differs from the one already standing; otherwise the chip
   * marks itself spent and the existing line is pulsed, which points at the answer already on
   * screen rather than pretending nothing happened.
   */
  private send(text: string): void {
    const key = text.trim().toLowerCase();
    const reply = this.transmit(text);
    const body = reply ? `${reply.name}::${reply.body}` : '';
    if (body && this.lastReplies.get(key) === body) {
      this.pulseLastReply();
      return;
    }
    this.appendChat('operator', 'OMNISCIENT_', text);
    if (reply) this.appendChat(reply.source ?? 'system', reply.name, reply.body);
    if (body) this.lastReplies.set(key, body);
    this.markChipSpent(key, Boolean(body));
  }

  /**
   * Dim the chip whose answer is now in the log.
   *
   * Cosmetic only - the chip stays clickable. A control that vanishes when you use it teaches
   * the player they broke something, and these questions can become worth asking again as the
   * case advances, at which point `send` un-dims this on its own by producing a new answer.
   */
  private markChipSpent(key: string, spent: boolean): void {
    const chip = this.suggestionChips.get(key);
    if (!chip) return;
    if (spent) chip.dataset.spent = 'true';
    else delete chip.dataset.spent;
  }

  /** Draw the eye to the reply that is already there, so a suppressed repeat is not silence. */
  private pulseLastReply(): void {
    const last = this.chatLog.lastElementChild as HTMLElement | null;
    if (!last) return;
    last.classList.remove('omni-line--arriving');
    // Reading offsetWidth restarts the animation; without it a second click does nothing at
    // all, which is the very complaint this method exists to answer.
    void last.offsetWidth;
    last.classList.add('omni-line--arriving');
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
  }

  private appendChat(source: 'visitor' | 'operator' | 'system', name: string, body: string): void {
    const line = document.createElement('div');
    line.className = `omni-line--${source === 'visitor' ? 'contact' : source === 'operator' ? 'omniscient' : 'system'} omni-line--arriving`;
    const speaker = document.createElement('span');
    speaker.className = 'omni-line__who';
    speaker.textContent = name;
    const message = document.createElement('span');
    message.textContent = body;
    line.append(speaker, message);
    this.chatLog.appendChild(line);
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
  }
}
