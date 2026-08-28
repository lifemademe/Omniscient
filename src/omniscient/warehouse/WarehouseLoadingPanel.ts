import * as ENGINE from '@gnsx/genesys.js';

export type WarehousePreparationStage = 'facility' | 'personnel' | 'cameras';

const STAGES: readonly WarehousePreparationStage[] = ['facility', 'personnel', 'cameras'];
const TITLE = 'ESTABLISHING WAREHOUSE LINK';
const CSS = `
.warehouse-loading {
  position: absolute; inset: 0; z-index: 1200;
  display: grid; place-items: center; padding: 24px; box-sizing: border-box;
  background: #050d09; color: #cfe6c4; pointer-events: auto;
  font: 14px/1.6 "Courier New", ui-monospace, monospace;
}
.warehouse-loading > .ui-layout { width: min(560px, 100%); }
.warehouse-loading .ui-card {
  background: #0a1710; border: 1px solid #315e3d; border-radius: 2px;
  border-top: 2px solid #7fb98a; padding: 28px; gap: 22px;
  box-shadow: none; font: inherit;
}
.warehouse-loading .ui-card-title, .warehouse-loading__bootstrap {
  color: #d8ffb0; font: inherit; font-size: clamp(16px, 1.4vw, 20px);
  line-height: 1.5; letter-spacing: 0.08em; font-weight: 400;
}
.warehouse-loading .ui-card-subtitle {
  margin-top: 12px; color: #9bbea1; font: inherit; font-size: 13px;
}
.warehouse-loading .ui-card-body {
  color: #cfe6c4; font: inherit; line-height: 2; white-space: pre-line;
}
.warehouse-loading[data-error=true] .ui-card-subtitle { color: #e8ae78; }
.warehouse-loading__actions { display: flex; flex-wrap: wrap; gap: 12px; }
.warehouse-loading__actions [hidden] { display: none; }
.warehouse-loading .ui-button {
  border: 1px solid #48744f; border-radius: 2px; padding: 10px 18px;
  background: #102619; color: #cfe6c4; box-shadow: none;
  font: inherit; font-size: 13px; letter-spacing: 0.08em;
}
.warehouse-loading .ui-button:hover, .warehouse-loading .ui-button:focus-visible {
  background: #193722; border-color: #a8d895; color: #d8ffb0;
}
.warehouse-loading .ui-button:focus-visible { outline: 1px solid #a8d895; outline-offset: 3px; }
.warehouse-loading .ui-button:disabled { opacity: 0.5; }
.warehouse-loading__bootstrap { max-width: 560px; white-space: pre-line; text-align: center; }
`;

/** A cancellable preparation screen composed from the engine's Card and Button widgets. */
export class WarehouseLoadingPanel extends ENGINE.Card {
  private backdrop: HTMLDivElement | null = null;
  private bootstrap: HTMLParagraphElement | null = null;
  private cancelButton: ENGINE.Button | null = null;
  private retryButton: ENGINE.Button | null = null;
  private retrySlot: HTMLDivElement | null = null;
  private stage: WarehousePreparationStage = 'facility';
  private detail = 'Preparing facility';
  private errorMessage: string | null = null;
  private retryHandler: (() => void) | null = null;
  private initialization: Promise<void> | null = null;
  private disposed = false;
  private actionPending = false;
  private previousFocus: HTMLElement | null = null;

  public constructor(private readonly world: ENGINE.World, private readonly onCancel: () => void) {
    super(world.uiManager, { position: 'none', title: TITLE, variant: 'default' });
  }

  public override async initialize(): Promise<void> {
    if (this.disposed) return;
    if (this.initialization) return this.initialization;

    // Paint feedback before fetching widget assets or building any warehouse geometry.
    // This small bootstrap is removed as soon as the composed Card is available.
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'warehouse-loading';
    this.backdrop.tabIndex = -1;
    this.backdrop.setAttribute('role', 'dialog');
    this.backdrop.setAttribute('aria-modal', 'true');
    this.backdrop.setAttribute('aria-label', TITLE);
    this.backdrop.setAttribute('aria-busy', 'true');
    const styles = document.createElement('style');
    styles.textContent = CSS;
    this.bootstrap = document.createElement('p');
    this.bootstrap.className = 'warehouse-loading__bootstrap';
    this.bootstrap.textContent = `${TITLE}\n\nFACILITY // PREPARING\n\nESC // CANCEL`;
    this.backdrop.append(styles, this.bootstrap);
    this.backdrop.addEventListener('contextmenu', event => event.preventDefault());
    for (const event of ['mousedown', 'mouseup', 'click', 'wheel']) {
      this.backdrop.addEventListener(event, event => event.stopPropagation());
    }
    const container = this.world.gameContainer;
    if (!container) throw new Error('Game UI container is unavailable');
    container.appendChild(this.backdrop);
    window.addEventListener('keydown', this.handleKey, true);
    window.addEventListener('keyup', this.handleKey, true);
    this.backdrop.focus({ preventScroll: true });
    this.initialization = this.initializeWidgets();
    return this.initialization;
  }

  private async initializeWidgets(): Promise<void> {
    try {
      await super.initialize();
      if (this.disposed) {
        super.destroy();
        return;
      }
      this.bootstrap?.remove();
      this.bootstrap = null;
      this.refresh();
      this.backdrop?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    } catch (error) {
      // BaseUIComponent marks initialization at the end; clean partial children on failure too.
      this.isInitialized = true;
      super.destroy();
      if (this.bootstrap) this.bootstrap.textContent = `${TITLE}\n\nLINK UNAVAILABLE\nESC // RETURN TO GLOBE`;
      throw error;
    }
  }

  protected override async onInitialize(): Promise<void> {
    await super.onInitialize();
    const wrapper = this.getElement()?.element;
    const card = wrapper?.querySelector<HTMLElement>('[data-card]');
    if (!wrapper || !card || this.disposed) return;
    this.backdrop?.appendChild(wrapper);
    this.layout?.querySelector('[data-card-body]')?.setAttribute('aria-live', 'polite');
    const actions = document.createElement('div');
    actions.className = 'warehouse-loading__actions';
    const cancelSlot = document.createElement('div');
    this.retrySlot = document.createElement('div');
    this.retrySlot.hidden = true;
    actions.append(cancelSlot, this.retrySlot);
    card.appendChild(actions);
    this.cancelButton = await this.mountChild(ENGINE.Button, {
      label: 'CANCEL LINK', variant: 'outline', onClick: () => this.cancel(),
    }, cancelSlot);
    if (this.disposed) return;
    this.retryButton = await this.mountChild(ENGINE.Button, {
      label: 'RETRY LINK', variant: 'outline', onClick: () => {
        if (this.actionPending || !this.retryHandler) return;
        this.actionPending = true;
        this.retryButton?.setDisabled(true);
        this.retryHandler();
      },
    }, this.retrySlot);
  }

  public setStage(stage: WarehousePreparationStage, detail?: string): void {
    if (this.disposed) return;
    this.stage = stage;
    this.detail = detail ?? `Preparing ${stage}`;
    this.errorMessage = null;
    this.retryHandler = null;
    this.actionPending = false;
    this.refresh();
  }

  public setError(message: string, onRetry: () => void): void {
    if (this.disposed) return;
    this.errorMessage = message;
    this.retryHandler = onRetry;
    this.actionPending = false;
    this.refresh();
  }

  private refresh(): void {
    const current = STAGES.indexOf(this.stage);
    this.setSubtitle(this.errorMessage ?? this.detail);
    this.setBody(STAGES.map((stage, index) => {
      const state = index < current ? 'READY' : index > current ? 'WAITING' : this.errorMessage ? 'INTERRUPTED' : 'PREPARING';
      return `${stage.toUpperCase()} // ${state}`;
    }).join('\n') + '\n\nMission time starts when the link is ready.');
    this.backdrop?.setAttribute('aria-busy', String(!this.errorMessage));
    if (this.backdrop) this.backdrop.dataset.error = String(!!this.errorMessage);
    if (this.retrySlot) this.retrySlot.hidden = !this.errorMessage;
    this.cancelButton?.setLabel(this.errorMessage ? 'RETURN TO GLOBE' : 'CANCEL LINK');
    this.cancelButton?.setDisabled(false);
    this.retryButton?.setDisabled(false);
  }

  private cancel(): void {
    if (this.disposed || this.actionPending) return;
    this.actionPending = true;
    this.cancelButton?.setDisabled(true);
    this.onCancel();
  }

  private readonly handleKey = (event: KeyboardEvent): void => {
    if (this.disposed) return;
    event.stopImmediatePropagation();
    if (event.type !== 'keydown') return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancel();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      const buttons = Array.from(this.backdrop?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
        .filter(button => !button.closest('[hidden]'));
      const current = buttons.findIndex(button => button === document.activeElement);
      const next = (current + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
      buttons[next]?.focus({ preventScroll: true });
    }
  };

  public override destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('keydown', this.handleKey, true);
    window.removeEventListener('keyup', this.handleKey, true);
    super.destroy();
    this.backdrop?.remove();
    this.backdrop = null;
    this.bootstrap = null;
    if (this.previousFocus?.isConnected) this.previousFocus.focus({ preventScroll: true });
    this.previousFocus = null;
  }
}
