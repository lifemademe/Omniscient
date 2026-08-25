import {
  buildAction,
  buildConsoleFrame,
  buildReadoutCard,
  fillMeter,
} from '../link/console-chrome.js';
import { STORY_QUEST_COUNT } from './content.js';
import { WarehouseOpsPanel } from './WarehouseOpsPanel.js';

import type { ConsoleFrame, ReadoutCard } from '../link/console-chrome.js';

import type { WarehouseChatReply } from './WarehouseOpsPanel.js';
import type { InboundAuditSnapshot } from './WarehouseInboundAudit.js';
import type {
  GeneratedWarehouseCase,
  WarehouseArchiveRecord,
  WarehouseConsoleAction,
  WarehouseDockSnapshot,
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

/*
 * What is left after the console frame took the chrome.
 *
 * This block used to be one minified line carrying a whole second interface: a top strip, a
 * footer, a briefing card, four keyboard-hint buttons and an amber status banner. All of that
 * is `console-chrome` now. What remains is only what a warehouse has and a workshop does not -
 * a crosshair, an optical frame, a scan flash, camera and zone selectors, and a tool row.
 *
 * ## Everything here is scoped inside .omni-cv__stage
 *
 * That is the substantive change and not a tidy-up. These overlays were children of a
 * full-screen layer, positioned with percentages picked by hand to dodge the operations
 * panel - `left:9%;right:34%` for the optical frame, `left:32%` for the camera row. The stage
 * is `position: relative` and is exactly the hole in the frame, so the same elements can now
 * be positioned against the picture they belong to. Nothing has to know where the panel is.
 */
const CSS = `
.omni-cv.warehouse-hud {
  color: #cfe6c4;
}
/* CCTV grain, over the picture only - it used to inset 35px and 29px by hand to miss the
   old top strip and footer, which are gone. */
.warehouse-hud[data-view=cctv] .omni-cv__stage::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.15;
  background:
    repeating-linear-gradient(0deg, transparent 0 2px, rgba(185, 214, 193, 0.16) 3px),
    radial-gradient(ellipse at center, transparent 55%, #000 118%);
  mix-blend-mode: screen;
}

/* The view name, bottom right of the stage - the same slot and the same voice as the
   Contact View's OPTICAL // 01 TRACKED. */
.warehouse-hud__feed {
  position: absolute;
  right: 0;
  bottom: 0;
  padding: 6px 18px 7px;
  text-align: right;
  font-size: calc(9px + var(--omni-font-boost, 0px));
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #4f9a5e;
  background: linear-gradient(90deg, rgba(4, 12, 16, 0), rgba(6, 13, 8, 0.66));
  pointer-events: none;
}

/*
 * Events, top RIGHT of the stage.
 *
 * They were top-left and landed straight on top of the integrity card - both were anchored
 * to the same corner, which is the corner the console frame reserves for its readouts.
 * Right is the only edge of the stage with nothing on it: the panel starts beyond it, so
 * there is no third thing to collide with.
 */
.warehouse-hud__alerts {
  position: absolute;
  right: 0;
  top: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
  /* 18px on the right, not 10: the stage's own inset frame runs along that edge and clipped
     the last glyph of WAITING against it. Measured off a capture, not guessed. */
  padding: 7px 24px;
  pointer-events: none;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  text-align: right;
  font-size: calc(10px + var(--omni-font-boost, 0px));
}
.warehouse-hud__bell { color: #e8877a; }
.warehouse-hud__bell:empty, .warehouse-hud__inbound:empty { display: none; }
.warehouse-hud__inbound { color: #e0c265; }

/*
 * The keymap. One line, centred at the foot of the picture.
 *
 * Bottom LEFT put it directly under the console actions, which sit 13px off the floor and
 * are 68px tall - so the legend rendered behind END LINK, RECOVER DRONE and CURSOR and was
 * unreadable for its whole length. Centre is the one part of the stage floor with nothing
 * in it: the actions own the left, the view name owns the right.
 */
/*
 * Legible over a LIT room, which is what the rest of this game never had to solve.
 *
 * The console's label tones - 35603f here, 4f9a5e elsewhere - were chosen to sit on dark
 * plates, and every contact scene they overlay is a night exterior, so they read. The
 * warehouse is a bright amber interior and the same colours simply vanish into the floor:
 * measured off a capture, this legend was invisible against the aisle behind it.
 *
 * The fix follows what the feed readout in this same file already does rather than inventing
 * a layer - a scrim under the text, and a tone lifted far enough to survive it. Overlay type
 * on a world needs its own ground; overlay type on a plate already has one.
 */
/*
 * Bounded between the call actions and the feed readout, not centred on the stage.
 *
 * Centred, it was ~70 characters wide on a band that already has two occupants: the console
 * actions hold the bottom left and the feed name holds the bottom right, and the legend ran
 * straight through both. Any of the three could be shortened; none of them should have to be,
 * because they are simply three things sharing one edge without a rule about who owns what.
 *
 * So the edge gets divided. Percentages rather than pixels because the stage is a fraction of
 * the window and this has to survive a resize, and the ellipsis is the honest fallback - a
 * legend that cannot fit should truncate visibly rather than overlap the status it is next to.
 */
.warehouse-hud__controls {
  position: absolute;
  left: 25%;
  right: 20%;
  bottom: 0;
  text-align: center;
  padding: 6px 14px 7px;
  color: #7fb98a;
  text-shadow: 0 1px 2px rgba(3, 8, 6, 0.95);
  background: linear-gradient(180deg, rgba(6, 13, 8, 0), rgba(6, 13, 8, 0.72));
  font-size: calc(10px + var(--omni-font-boost, 0px));
  letter-spacing: 0.06em;
  line-height: 1.45;
  text-transform: uppercase;
  /*
   * Wraps rather than truncates. One line of six bindings could not fit the band between the
   * call actions and the feed name at any tracking that stayed readable, and cutting it mid
   * word - WASD ... F GRIP // TA - looked like a bug rather than a legend. Two short lines
   * read faster than one long one anyway, which is why control prompts are grouped in games
   * that ship.
   */
  white-space: normal;
  pointer-events: none;
}
/* Explicit rows. Relying on the wrap put the break after "F" and left GRIP alone on line two,
   because HTML collapses the run of spaces that was standing in for a line break. */
.warehouse-hud__controls span { display: block; }

/*
 * The verdict, felt at the edges of the picture.
 *
 * Committing a decision is the entire mission - the game is a judgement, made once per case -
 * and it produced a sound, a line of text and a meter tick. Nothing happened to the PICTURE,
 * so the most important moment in the loop had less presence than picking up a crate.
 *
 * An edge vignette rather than a full-screen wash: the frame is a remote feed and the player
 * is reading evidence in the middle of it, so the response belongs in the periphery where it
 * cannot cover the thing being judged. Wrong is red, hard and fast. Right is the console's own
 * green, softer and slower - a confirmation should not punch as hard as a mistake, or the
 * player stops being able to tell them apart at a glance.
 */
.warehouse-hud__verdict {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.5s ease-out;
}
.warehouse-hud__verdict--wrong {
  box-shadow: inset 0 0 74px 8px rgba(196, 58, 44, 0.5), inset 0 0 20px 2px rgba(255, 120, 96, 0.42);
  opacity: 1;
  transition: opacity 0.06s ease-in;
}
.warehouse-hud__verdict--right {
  box-shadow: inset 0 0 70px 10px rgba(84, 176, 108, 0.4);
  opacity: 1;
  transition: opacity 0.14s ease-in;
}

/* Third-person cruise streaks, scoped to the world viewport rather than the console UI. */
.warehouse-hud__speed-lines {
  --speed-opacity: 0;
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.24s ease-out;
}
.warehouse-hud[data-view=drone][data-optical=false] .warehouse-hud__speed-lines[data-active=true] {
  opacity: var(--speed-opacity);
}
.warehouse-hud__speed-line {
  position: absolute;
  left: 50%;
  top: 50%;
  width: clamp(64px, 10vw, 170px);
  height: 1px;
  transform-origin: 0 50%;
  background: linear-gradient(90deg, rgba(216, 255, 176, 0), rgba(216, 255, 176, 0.7), rgba(127, 224, 138, 0));
  box-shadow: 0 0 4px rgba(127, 224, 138, 0.3);
  animation: warehouse-speed-streak 0.48s linear infinite;
}
@keyframes warehouse-speed-streak {
  from { transform: rotate(var(--line-angle)) translateX(10vmin) scaleX(0.18); opacity: 0; }
  18% { opacity: 0.85; }
  to { transform: rotate(var(--line-angle)) translateX(72vmax) scaleX(1.45); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .warehouse-hud__speed-lines { display: none; }
}

.warehouse-hud__scanfx {
  position: absolute;
  inset: 18% 16%;
  border: 1px solid rgba(127, 224, 138, 0.78);
  opacity: 0;
  transform: scale(0.72);
  transition: opacity 0.12s, transform 0.3s;
}
.warehouse-hud__scanfx::before, .warehouse-hud__scanfx::after {
  content: '';
  position: absolute;
  background: #7fe08a;
}
.warehouse-hud__scanfx::before { left: 50%; top: -9%; width: 1px; height: 118%; }
.warehouse-hud__scanfx::after { left: -7%; top: 50%; width: 114%; height: 1px; }
.warehouse-hud__scanfx--shown {
  opacity: 1;
  transform: scale(1);
  box-shadow: inset 0 0 58px rgba(127, 224, 138, 0.12), 0 0 18px rgba(127, 224, 138, 0.12);
}

.warehouse-hud__centre {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 34px;
  height: 34px;
  border: 1px solid rgba(216, 255, 176, 0.62);
  border-radius: 50%;
  display: none;
  opacity: 0;
  transition: opacity 0.2s;
}
.warehouse-hud[data-view=drone][data-optical=true] .warehouse-hud__centre {
  display: block;
  opacity: 1;
}
.warehouse-hud__centre::before, .warehouse-hud__centre::after {
  content: '';
  position: absolute;
  background: #d8ffb0;
}
.warehouse-hud__centre::before { width: 10px; height: 1px; left: 11px; top: 16px; }
.warehouse-hud__centre::after { height: 10px; width: 1px; left: 16px; top: 11px; }

/* Tool row and camera row, above the console actions rather than beside them. */
.warehouse-hud__tools, .warehouse-hud__doors {
  position: absolute;
  display: flex;
  gap: 5px;
  align-items: center;
  pointer-events: auto;
}
/*
 * Stacked upward from the console actions, which occupy the floor to about 81px.
 *
 * These were 74px and 108px - the first of them behind the buttons. Measured off a capture:
 * the actions sit 13px off the stage floor and are 68px tall, so anything under 81px is
 * hidden. The gaps are 40px, which is a row plus air.
 */
.warehouse-hud__tools { left: 13px; bottom: 128px; }
.warehouse-hud__doors { left: 13px; bottom: 168px; }
.warehouse-hud:not([data-view=cctv]) .warehouse-hud__doors { display: none; }
.warehouse-hud__tools button, .warehouse-hud__doors button {
  font: inherit;
  font-size: calc(10px + var(--omni-font-boost, 0px));
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #8fbe93;
  background: rgba(11, 24, 15, 0.94);
  border: 0;
  padding: 7px 10px;
  box-shadow: inset 1px 1px 0 #3f7a52, inset -1px -1px 0 #040906, 0 0 0 1px #0b1a11;
  cursor: pointer;
}
.warehouse-hud__tools button:hover, .warehouse-hud__doors button:hover { color: #d8ffb0; }
.warehouse-hud__tools button[data-active=true],
.warehouse-hud__doors button[data-selected=true] {
  color: #d8ffb0;
  box-shadow: inset 1px 1px 0 #5fb277, inset -1px -1px 0 #040906, 0 0 0 1px #17402a;
}
.warehouse-hud__doors button[data-status=tamper],
.warehouse-hud__doors button[data-status=locked] {
  color: #ff897b;
  box-shadow: inset 1px 1px 0 #9b443d, inset -1px -1px 0 #210604, 0 0 9px rgba(255, 66, 51, 0.25);
}
.warehouse-hud__doors button[data-status=motion] {
  color: #e0c265;
  box-shadow: inset 1px 1px 0 #927b35, inset -1px -1px 0 #040906, 0 0 9px rgba(224, 194, 101, 0.22);
}
.warehouse-hud__doors button[data-status=contact] { color: #e0c265; }
.warehouse-hud__doors button[data-status=clear] { color: #668971; }
.warehouse-hud__doors button[data-role=replay] { color: #e0c265; }
.warehouse-hud__doors button[hidden] { display: none; }

/* The same plate the Contact View flashes a line on. */
.warehouse-hud__message {
  position: absolute;
  left: 50%;
  top: 14%;
  transform: translateX(-50%) translateY(4px);
  padding: 9px 14px;
  border: 1px solid #2b5c39;
  border-left: 3px solid #7fe08a;
  background: linear-gradient(90deg, rgba(30, 74, 44, 0.88), rgba(13, 28, 20, 0.88));
  box-shadow: inset 0 0 22px rgba(0, 0, 0, 0.45);
  color: #d8ffb0;
  letter-spacing: 0.1em;
  opacity: 0;
  transition: opacity 0.2s, transform 0.2s;
  pointer-events: none;
}
.warehouse-hud__message--shown { opacity: 1; transform: translateX(-50%) translateY(0); }

/* The optical acquisition frame, drone view only. */
.warehouse-hud__optical {
  display: none;
  position: absolute;
  inset: 8% 10%;
  border: 1px solid rgba(127, 224, 138, 0.34);
  background:
    linear-gradient(90deg, rgba(127, 224, 138, 0.62), rgba(127, 224, 138, 0)) 0 0/18% 1px no-repeat,
    linear-gradient(180deg, rgba(127, 224, 138, 0.62), rgba(127, 224, 138, 0)) 0 0/1px 22% no-repeat,
    linear-gradient(270deg, rgba(127, 224, 138, 0.62), rgba(127, 224, 138, 0)) 100% 100%/18% 1px no-repeat,
    linear-gradient(0deg, rgba(127, 224, 138, 0.62), rgba(127, 224, 138, 0)) 100% 100%/1px 22% no-repeat,
    radial-gradient(ellipse at center, transparent 48%, rgba(2, 10, 7, 0.22) 100%);
  box-shadow: inset 0 0 38px rgba(4, 18, 11, 0.22);
  color: #7fe08a;
  font-size: calc(10px + var(--omni-font-boost, 0px));
  letter-spacing: 0.14em;
  text-transform: uppercase;
  opacity: 0;
  transition: opacity 0.12s;
  pointer-events: none;
}
.warehouse-hud[data-view=drone][data-optical=true] .warehouse-hud__optical {
  display: block;
  opacity: 1;
}
.warehouse-hud__optical::before {
  content: 'Optical acquisition // channel 01';
  position: absolute;
  left: 12px;
  top: 10px;
}
.warehouse-hud__optical::after {
  content: 'RMB held // LMB scan';
  position: absolute;
  right: 12px;
  top: 10px;
  color: #d8ffb0;
}
.warehouse-hud__optical-readout { position: absolute; left: 12px; bottom: 10px; color: #4f9a5e; }
.warehouse-hud__optical-readout span { color: #d8ffb0; }

/*
 * A caption, not a control - and that distinction is the whole edit.
 *
 * This was a bevelled plate with an inset highlight and a dark fill, which is exactly the
 * treatment the tool buttons and the console actions use. Stacked directly above them it read
 * as a fourth button that did not respond, and a dead control is worse than no control: the
 * player learns the panel lies. It is a legend saying which mouse button holds optical.
 *
 * So it keeps the console's label voice - 10px, wide tracking, upper case, the same #4f9a5e
 * as the console's own card label (written bare: a backtick in here closes the CSS template
 * literal, which this project has now been bitten by four times) - and drops every affordance. Nothing bevelled on this margin is
 * un-pressable now, which is the rule the rest of the console already follows.
 */
.warehouse-hud__opticalhint {
  pointer-events: none;
  position: absolute;
  left: 14px;
  bottom: 92px;
  font-size: calc(10px + var(--omni-font-boost, 0px));
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #7fb98a;
  text-shadow: 0 1px 2px rgba(3, 8, 6, 0.95);
}
.warehouse-hud__opticalhint:empty { display: none; }
/* Held: the legend brightens to the console's live-value colour, and still does not become a
   button. State is carried by the tool plate above it, which IS one. */
.warehouse-hud[data-optical=true] .warehouse-hud__opticalhint { color: #d8ffb0; }
.warehouse-hud:not([data-view=drone]) .warehouse-hud__opticalhint { opacity: 0.58; }

@media (max-width: 760px) {
  .warehouse-hud__opticalhint, .warehouse-hud__controls { display: none; }
  .warehouse-hud__optical { inset: 8%; }
  .warehouse-hud__tools { bottom: 88px; }
  .warehouse-hud__doors { bottom: 128px; }
}
`;

/*
 * The control legend, grouped: how you move, then what you can do.
 *
 * Two clauses rather than six items in a row, because a legend is read at a glance and a
 * glance takes groups, not lists. The wrap between them is left to the layout - see the
 * controls rule in the CSS above.
 */
/*
 * TAB and C are named for what they DO, not for the views they touch.
 *
 * The old first line said "TAB view", which is true and useless: it names a key and a noun
 * and leaves the player to discover that the noun cycles three ways. Worse, C appeared only
 * in the intrusion keymap, so in normal play the key that reaches the service cameras was
 * not written down anywhere on screen.
 */
const WAREHOUSE_KEYMAP: readonly [string, string] = [
  'WASD move // QE altitude // TAB console // C cameras',
  'LMB scan // RMB optical // F grip / dock',
];
const WAREHOUSE_KEYMAP_INTRUSION: readonly [string, string] = [
  'WASD move // QE altitude // TAB console // C cameras',
  'LMB tag // RMB optical // F grip',
];

export class WarehouseHUD {
  private root: HTMLElement;
  /**
   * The game's own console frame, rather than a second one.
   *
   * This HUD arrived with a parallel vocabulary - its own top strip, its own footer, a
   * briefing card where the Contact View keeps its three margin readouts, and four keyboard
   * hints in boxes stacked down the left over the scene. The colours were right and nothing
   * else was, so Warehouse 07 read as a different game using this one's palette.
   *
   * Everything structural now comes from `buildConsoleFrame`. What stays here is only what
   * is genuinely about a warehouse: the crosshair, the optical frame, the scan flash, the
   * camera and zone selectors, and the tool row.
   */
  private frame: ConsoleFrame;
  private integrityCard: ReadoutCard;
  private stageCard: ReadoutCard;
  private chainCard: ReadoutCard;
  private title = '';
  private bell: HTMLElement;
  private inbound: HTMLElement;
  private feed: HTMLElement;
  private scanFx: HTMLElement;
  private speedLines: HTMLElement;
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
  private verdict: HTMLDivElement;
  private opticalAim = false;
  private messageTimer = 0;
  private decisionHandler: ((action: WarehouseConsoleAction) => void) | null = null;
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
    private readonly mode: WarehouseMode,
    onExit: () => void,
    onRecover: () => void,
  ) {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    /*
     * The frame first, then everything that belongs over the scene.
     *
     * Order matters for one reason: the stage is `position: relative`, so every absolutely
     * positioned overlay below is measured against THE HOLE IN THE FRAME rather than against
     * the whole window. That is what stops the crosshair, the optical brackets and the scan
     * flash from sliding under the operations panel - they used to be children of a
     * full-screen layer, dodging the panel with percentages chosen by hand.
     */
    const frame = buildConsoleFrame({
      brand: 'Warehouse 07',
      network: mode === 'story' ? 'Remote link' : 'Night shift',
    });
    this.frame = frame;

    const root = frame.shell;
    root.classList.add('warehouse-hud');
    root.style.fontSize = 'calc(12px + var(--omni-font-boost, 0px))';

    /*
     * The three margin readouts, in the Contact View's own shape.
     *
     * Its cards are a label, an eight-segment meter, a value and a lowercase line under it -
     * and the warehouse has exactly three things that fit that shape and were being written
     * as one run-on amber string instead: INTEGRITY (three seals), PROGRESS (story movements
     * or Night Shift stages) and CLEAN CHAIN.
     *
     * The order repeats the Contact View's argument: the machine states the condition of the
     * link before it says anything about the work. Integrity is the warehouse's CONNECTION
     * STRENGTH - the reading that ends the run when it reaches zero.
    */
    this.integrityCard = buildReadoutCard('Integrity');
    this.stageCard = buildReadoutCard(mode === 'story' ? 'Quest' : 'Stage');
    this.chainCard = buildReadoutCard('Clean chain');
    [this.integrityCard, this.stageCard, this.chainCard].forEach((card, index) => {
      card.card.classList.add('omni-arrive');
      card.card.style.animationDelay = `${String(index * 90)}ms`;
    });
    frame.readouts.append(this.integrityCard.card, this.stageCard.card, this.chainCard.card);

    /*
     * END LINK, and it is the same red control as END CALL.
     *
     * It was `ESC // RETURN` at the top of a stack of four keyboard hints in boxes. The
     * Contact View keeps exactly one action in this corner and a long note explaining why:
     * controls that only restate a key took up room and taught nobody they existed.
     *
     * RECOVER survives because it is the one thing here with no equivalent anywhere else in
     * the game - a drone can wedge itself in a rack, and a player who cannot see a way out
     * of that has to restart. CURSOR survives because it toggles what the mouse does, which
     * is not discoverable. The rest of the keymap is one line under the stage.
     */
    const exit = buildAction('\u260E', 'End link', onExit, 'omni-action--end');
    const recover = buildAction('\u21BA', 'Recover drone', onRecover);
    frame.actions.append(exit, recover);

    /*
     * The bell and the inbound clock, over the stage rather than in the margin.
     *
     * They are events, not state. A visitor at a door and a truck on its way are things that
     * HAPPEN, and the Contact View's equivalent - the observation chips - sits over the
     * conversation as a strip rather than among the furniture.
     */
    const alerts = document.createElement('div');
    alerts.className = 'warehouse-hud__alerts';
    this.bell = document.createElement('div');
    this.bell.className = 'warehouse-hud__bell';
    this.inbound = document.createElement('div');
    this.inbound.className = 'warehouse-hud__inbound';
    alerts.append(this.bell, this.inbound);

    const centre = document.createElement('div');
    centre.className = 'warehouse-hud__centre';
    /*
     * The view name, bottom right of the stage - where the Contact View puts
     * OPTICAL // 01 TRACKED and FEED // REMOTE.
     *
     * It was a full-width strip across the very top of the screen reading
     * DRONE 07 // THIRD PERSON // NAVIGATION: the loudest position on the display, given to
     * the least important fact on it. The player knows which view they are in by looking.
     */
    this.feed = document.createElement('div');
    this.feed.className = 'warehouse-hud__feed';
    this.scanFx = document.createElement('div');
    this.scanFx.className = 'warehouse-hud__scanfx';
    this.speedLines = document.createElement('div');
    this.speedLines.className = 'warehouse-hud__speed-lines';
    this.speedLines.dataset.active = 'false';
    for (let index = 0; index < 18; index++) {
      const line = document.createElement('span');
      line.className = 'warehouse-hud__speed-line';
      line.style.setProperty('--line-angle', `${String(index * 20 + (index % 3) * 3)}deg`);
      line.style.animationDelay = `${String(-(index % 6) * 0.08)}s`;
      this.speedLines.appendChild(line);
    }
    this.verdict = document.createElement('div');
    this.verdict.className = 'warehouse-hud__verdict';
    const optical = document.createElement('div');
    optical.className = 'warehouse-hud__optical';
    const opticalReadout = document.createElement('div');
    opticalReadout.className = 'warehouse-hud__optical-readout';
    opticalReadout.append(document.createTextNode('FOCAL 42MM // STABILIZER '));
    const opticalState = document.createElement('span');
    opticalState.textContent = 'locked';
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
    next.textContent = 'C // next feed';
    next.addEventListener('click', () => this.doorCycleHandler?.());
    this.replayButton = document.createElement('button');
    this.replayButton.type = 'button';
    this.replayButton.dataset.role = 'replay';
    this.replayButton.textContent = 'Replay event';
    this.replayButton.hidden = true;
    this.replayButton.addEventListener('click', () => this.replayHandler?.());
    this.skipButton = document.createElement('button');
    this.skipButton.type = 'button';
    this.skipButton.dataset.role = 'replay';
    this.skipButton.textContent = 'ESC // skip';
    this.skipButton.hidden = true;
    this.skipButton.addEventListener('click', () => this.skipHandler?.());
    this.doors.append(next, this.replayButton, this.skipButton);
    this.message = document.createElement('div');
    this.message.className = 'warehouse-hud__message';
    this.controls = document.createElement('div');
    this.controls.className = 'warehouse-hud__controls';
    this.setKeymap(WAREHOUSE_KEYMAP);
    /*
     * The keymap, as one line under the stage.
     *
     * Four of these were buttons stacked down the left over the scene - ESC // RETURN,
     * R // RECOVER, RMB // HOLD: OPTICAL, M // INPUT: DRONE LOOK - which is a control panel
     * made of things that are not controls. Nothing else in this game puts a keyboard legend
     * on screen in a box, and the two of those four that DO something are now proper console
     * actions in the corner where END CALL lives.
     */
    this.opticalHint = document.createElement('div');
    this.opticalHint.className = 'warehouse-hud__opticalhint';
    /*
     * Everything about the warehouse goes INSIDE the stage; the ops panel goes in the column
     * the frame handed back. Nothing is appended to the shell directly any more, which is
     * what guarantees no overlay can cross into the panel again.
     */
    frame.stage.append(
      this.speedLines,
      optical,
      this.scanFx,
      this.verdict,
      centre,
      alerts,
      this.message,
      this.tools,
      this.doors,
      this.opticalHint,
      this.controls,
      this.feed
    );
    frame.column.appendChild(this.ops.root);
    container.appendChild(root);
    this.root = root;
    this.setIntegrity(3, 0, 0);
    this.setBell(false, 0);
    this.setInbound(null);
    this.setOpticalAim(false);
    this.setCursorMode(true);
    this.setView('cctv');
  }

  public onDecision(handler: (action: WarehouseConsoleAction) => void): void {
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

  /**
   * The movement, on the plate the Contact View puts the request on.
   *
   * It used to be a briefing card in the top-left corner over the scene: an eyebrow, a title
   * and a paragraph, in a box the rest of the game does not have. The objective plate spans
   * the console under the top bar, at a size nothing else uses, and its note explains why -
   * a goal that has to be hunted for is not doing the job a goal was added to do.
   *
   * The title becomes the plate's tag, which is exactly the shape it already had: MOVEMENT
   * 01 // COLLECTION in the slot that says REQUEST on every other screen in the game.
   */
  public setCase(title: string, objective: string): void {
    this.title = title;
    this.frame.setObjective(title || 'Shift', objective);
  }

  /**
   * The three readouts.
   *
   * One run-on amber line became three cards, and the meters carry what the text used to
   * spell out. Amber is gone from the resting state on purpose: this game reserves it for
   * an incoming request and for warnings, and a permanent amber banner in the corner spends
   * that meaning on a number that is fine.
   *
   * Integrity turns to the warning meter only when it is actually low, which is the one
   * moment the colour is telling the truth.
   */
  /** Two rows: how you move, then what you can do. See the controls rule in the CSS. */
  private setKeymap(lines: readonly [string, string]): void {
    this.controls.replaceChildren();
    for (const line of lines) {
      const row = document.createElement('span');
      row.textContent = line;
      this.controls.appendChild(row);
    }
  }

  public setIntegrity(integrity: number, stage: number, chain: number): void {
    const seals = Math.max(0, Math.min(3, integrity));
    fillMeter(
      this.integrityCard.meter,
      Math.round((seals / 3) * 8),
      seals <= 1 ? 'omni-meter--warn' : ''
    );
    this.integrityCard.value.textContent = `${seals} of 3`;
    this.integrityCard.sub.textContent =
      seals === 3 ? 'unbroken' : seals === 0 ? 'run over' : 'seal broken';

    /*
     * Story counts individual playable cases (quests), while Night Shift counts procedural
     * stages. The movement/chapter index is intentionally absent from this progress card.
     */
    const total = this.mode === 'story' ? STORY_QUEST_COUNT : 30;
    fillMeter(this.stageCard.meter, Math.max(0, Math.min(8, Math.round((stage / total) * 8))));
    this.stageCard.value.textContent = String(Math.max(0, stage)).padStart(2, '0');
    this.stageCard.sub.textContent = stage >= total
      ? this.mode === 'story' ? 'final quest' : 'final stage'
      : `of ${String(total).padStart(2, '0')}`;

    fillMeter(this.chainCard.meter, Math.max(0, Math.min(8, chain)));
    this.chainCard.value.textContent = String(Math.max(0, chain));
    this.chainCard.sub.textContent = chain === 0 ? 'no clean run yet' : 'consecutive clean';
  }

  public setBell(waiting: boolean, count: number, location?: string): void {
    this.bell.textContent = waiting
      ? location
        ? `Perimeter contact // ${location}`
        : `${count} waiting`
      : '';
  }

  public setSecurityAlert(message: string): void {
    this.bell.textContent = message;
  }

  public setInbound(seconds: number | null): void {
    this.inbound.textContent = seconds === null
      ? ''
      : seconds > 0
        ? `Inbound dock // T−${Math.ceil(seconds)}s`
        : 'Inbound dock // active';
  }

  public setView(view: 'drone' | 'cctv' | 'console'): void {
    this.root.dataset.view = view;
    this.feed.textContent = view === 'cctv'
      ? this.cctvFeedText()
      : view === 'console'
        ? 'Manifest // topology'
        : this.opticalAim
          ? 'Drone 07 // optical'
          : 'Drone 07 // third person';
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
    this.setKeymap(intrusion ? WAREHOUSE_KEYMAP_INTRUSION : WAREHOUSE_KEYMAP);
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
    this.opticalHint.textContent = active ? 'RMB // optical held' : 'RMB // hold optical';
    if (this.root.dataset.view === 'drone') this.setView('drone');
  }

  /**
   * The pointer is free, or it is not.
   *
   * Only a data attribute now - the crosshair reads it, and nothing else has to. There was a
   * CURSOR action beside END LINK that flipped its own label, and it went with the M key:
   * a button that can only be pressed when the pointer is free is a button that cannot be
   * pressed in the state it exists to leave.
   */
  public setCursorMode(cursorVisible: boolean): void {
    this.root.dataset.cursor = String(cursorVisible);
  }

  public setControlsVisible(visible: boolean): void {
    this.controls.style.display = visible ? '' : 'none';
  }

  public showCase(
    data: GeneratedWarehouseCase,
    evidence: WarehouseEvidenceState,
    intrusion: WarehouseIntrusionSnapshot | null = null,
    dock: WarehouseDockSnapshot | null = null,
    inboundAudit: InboundAuditSnapshot | null = null
  ): void {
    this.ops.showCase(data, evidence, intrusion, dock, inboundAudit);
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

  public setSpeedLines(active: boolean, intensity = 1): void {
    const strength = Math.max(0, Math.min(1, intensity));
    this.speedLines.dataset.active = String(active && strength > 0);
    this.speedLines.style.setProperty('--speed-opacity', String(0.18 + strength * 0.42));
  }

  /**
   * Flash the verdict at the edge of the feed. See the verdict rule in the CSS.
   *
   * The class is removed and re-added across a frame so a second decision inside the fade of
   * the first still reads as a second decision - re-adding a class already present does not
   * restart a CSS transition, which would silently swallow exactly the case where the player
   * is making mistakes quickly.
   */
  public flashVerdict(correct: boolean): void {
    const shown = correct ? 'warehouse-hud__verdict--right' : 'warehouse-hud__verdict--wrong';
    this.verdict.classList.remove('warehouse-hud__verdict--right', 'warehouse-hud__verdict--wrong');
    requestAnimationFrame(() => this.verdict.classList.add(shown));
    window.setTimeout(() => this.verdict.classList.remove(shown), correct ? 420 : 620);
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
