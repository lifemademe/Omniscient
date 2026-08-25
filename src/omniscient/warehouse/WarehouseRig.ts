import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { TUNED_BLOOM } from '../art/postTuning.js';

import { adaptiveScore } from '../audio/AdaptiveScore.js';
import { getAccessibilityPreferences } from '../accessibility/preferences.js';
import { setCursorVisible, setPointerLockAllowed } from '../art/cursor.js';
import { setRoomTone } from '../audio/RoomTone.js';
import { seedFrom } from '../core/rng.js';

import { WarehouseEnvironment } from './art.js';
import { captureWarehouseFrame, warehouseArchiveKey } from './archive.js';
import { CASE_DECK, STORY_MOVEMENTS, TOOL_UNLOCK_STAGE, WAREHOUSE_DECK_VERSION, storyQuestNumber } from './content.js';
import { WarehouseDirector } from './director.js';
import { createWarehouseVisitor, WarehouseCargoNode, WarehouseWorkerNode } from './entities.js';
import { loadWarehouseSave, updateWarehouseSave } from './persistence.js';
import { WarehouseAudio } from './WarehouseAudio.js';
import { WarehouseCelStyle } from './WarehouseCelStyle.js';
import { DroneCargoRope } from './DroneCargoRope.js';
import { WarehouseDroneFeedback } from './WarehouseDroneFeedback.js';
import { WarehouseHUD } from './WarehouseHUD.js';
import { WarehousePursuit } from './WarehousePursuit.js';
import { WAREHOUSE_DOORS, WAREHOUSE_DOOR_IDS } from './WarehouseServiceDoors.js';
import { WarehouseContainmentResponse } from './WarehouseContainmentResponse.js';
import { WarehouseIntruderNode } from './WarehouseIntruder.js';
import {
  createInboundAuditSnapshot,
  INBOUND_AUDIT_DELIVERIES,
  INBOUND_FUGITIVE_ROUTE,
  type InboundAuditSnapshot,
} from './WarehouseInboundAudit.js';
import {
  WAREHOUSE_LAYOUT,
  WAREHOUSE_SECURITY_ZONE_IDS,
  WAREHOUSE_SECURITY_ZONES,
  warehouseZoneLabel,
} from './WarehouseLayout.js';

import type { MouseButton } from '@gnsx/genesys.js';
import type { WarehouseVisitor } from './entities.js';
import type { WarehouseChatReply } from './WarehouseOpsPanel.js';
import type {
  GeneratedWarehouseCase,
  WarehouseConsoleAction,
  WarehouseDecision,
  WarehouseDoorId,
  WarehouseDockSnapshot,
  WarehouseDoorSnapshot,
  WarehouseDoorStatus,
  WarehouseEvidenceState,
  WarehouseIntrusionSnapshot,
  WarehouseMode,
  WarehouseRunConfig,
  WarehouseRunResult,
  WarehouseTool,
  WarehouseSecurityZoneId,
  WarehouseSecurityZoneSnapshot,
  WarehouseSecurityZoneStatus,
} from './types.js';

export interface WarehouseRigOptions extends ENGINE.SceneNodeOptions {
  mode: WarehouseMode;
  seed?: string;
}

type WarehouseView = 'drone' | 'cctv' | 'console';
type DronePerspective = 'first' | 'third';

const CAMERA_MATRIX = new THREE.Matrix4();
const DRONE_START = WAREHOUSE_LAYOUT.drone.start;
const ALTITUDES = [1.8, 3.2, 6.8] as const;
const THIRD_PERSON_ARM = 2.8;
const THIRD_PERSON_HEIGHT = 1.25;
const THIRD_PERSON_DISTANCE = Math.hypot(THIRD_PERSON_ARM, THIRD_PERSON_HEIGHT);
const TIGHT_CAMERA_THRESHOLD = 0.34;
const DRONE_CRUISE_SPEED = 5.2;
const DRONE_WORKER_SPEED = 2.4;
const DRONE_ACCELERATION = 8.2;
const DRONE_BRAKING = 11.5;
const DRONE_CRUISE_VFX_THRESHOLD = 0.94;
/**
 * How long each door camera holds during the opening sweep.
 *
 * 1.6s is chosen so a shot can be read rather than merely registered: the eye needs roughly
 * a third of a second to land, and the caption underneath is four words. The old intro ran
 * two of its three shots at 1.3s and 1.1s, which is why the middle one could be a featureless
 * brown wall for a week without anybody being able to say what it had shown them.
 */
const INTRO_BEAT_SECONDS = 1.6;
const INTRO_HANDOFF_SECONDS = INTRO_BEAT_SECONDS * WAREHOUSE_DOOR_IDS.length;
/** Fallback billboard facing for the feedback rings before the camera exists. */
const FEEDBACK_FACING = new THREE.Quaternion();
/** Scratch axes for the lens kick, so the recoil allocates nothing per frame. */
const KICK_RIGHT = new THREE.Vector3();
const KICK_UP = new THREE.Vector3();
const CAMERA_PROBE_OFFSETS = [
  [0, 0],
  [-0.26, 0],
  [0.26, 0],
  [0, -0.22],
  [0, 0.22],
  [-0.2, -0.18],
  [0.2, -0.18],
  [-0.2, 0.18],
  [0.2, 0.18],
] as const;
const DRONE_ROTOR_POSITIONS = [
  [-0.55, -0.42],
  [0.55, -0.42],
  [-0.55, 0.42],
  [0.55, 0.42],
] as const;
const WORKER_VESTS = ['#c9a934', '#d66f2f', '#7b9d3c', '#d6bd45', '#c05f32', '#9bb23c'] as const;
const RANK_ORDER = ['TRAINEE', 'OPERATOR', 'INSPECTOR', 'CONTROLLER', 'OVERSEER', 'OMNISCIENT'] as const;

function emptyEvidence(): WarehouseEvidenceState {
  return { located: false, visitor: false, cargo: false, action: false, authorization: false, tamper: false };
}

function isTextEntry(target: EventTarget | null): target is HTMLElement {
  return target instanceof HTMLElement && (
    target.matches('input, textarea, select') || target.isContentEditable
  );
}

function isUIControl(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('button, input, textarea, select, [contenteditable=true]') !== null;
}

class WarehouseInput extends ENGINE.BaseInputHandler {
  private readonly held = new Set<string>();
  private gamepadMoveX = 0;
  private gamepadMoveY = 0;
  private gamepadLookX = 0;
  private gamepadLookY = 0;

  public constructor(private readonly rig: WarehouseRig) {
    super();
  }

  public override handleKeyDown(event: KeyboardEvent): boolean {
    if (isTextEntry(event.target)) {
      /*
       * Typing owns the keyboard, with two exceptions, and they are the two keys that mean
       * "stop typing".
       *
       * TAB is the mode key now, so having the transmit field eat it made the console a
       * room with the door painted on: click the field to reply, and the one key that gets
       * you back to the drone silently does nothing. Reported as TAB being unreliable, and
       * it was - but only after the player had done the thing the console exists for.
       *
       * ESCAPE steps out of the field rather than out of the mission. A second press, now
       * that focus is back on the game, exits as it always did.
       */
      if (event.code === 'Tab') {
        event.preventDefault();
        event.target.blur();
        this.rig.toggleConsole();
        return true;
      }
      if (event.code === 'Escape') {
        event.target.blur();
        return true;
      }
      return false;
    }
    // Q and E join the repeat list: they nudge a continuous height now rather than stepping
    // between three bands, so holding one should climb rather than move you 85cm and stop.
    if (event.repeat && !['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'].includes(event.code)) return false;
    this.held.add(event.code);
    switch (event.code) {
      case 'Escape': this.rig.requestExit(); return true;
      case 'Tab': event.preventDefault(); this.rig.toggleConsole(); return true;
      case 'KeyC': this.rig.cycleDoor(1); return true;
      case 'KeyF': this.rig.toggleGrip(); return true;
      case 'KeyR': this.rig.recover(); return true;
      case 'KeyQ': this.rig.changeAltitude(-1); return true;
      case 'KeyE': this.rig.changeAltitude(1); return true;
      case 'Digit1': this.rig.activateNumber(0); return true;
      case 'Digit2': this.rig.activateNumber(1); return true;
      case 'Digit3': this.rig.activateNumber(2); return true;
      case 'Digit4': this.rig.activateNumber(3); return true;
      case 'Digit5': this.rig.tryDecision('hold'); return true;
      case 'Digit6': this.rig.tryDecision('verify'); return true;
      case 'Space': this.rig.scanFromOpticalInput(); return true;
      default: return ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code);
    }
  }

  public override handleKeyUp(event: KeyboardEvent): boolean {
    if (isTextEntry(event.target)) return false;
    this.held.delete(event.code);
    return ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code);
  }

  public override handleMouseMove(event: MouseEvent): boolean {
    if (this.inputManager?.isPointerLocked()) {
      this.rig.look(event.movementX, event.movementY);
      return true;
    }
    return false;
  }

  public override handleMouseDown(button: MouseButton, event: MouseEvent): boolean {
    if (isUIControl(event.target)) return false;
    if (button === ENGINE.MouseButton.Right) {
      event.preventDefault();
      if (!this.rig.setOpticalAim(true)) return false;
      if (this.rig.shouldCapturePointer()) this.inputManager?.requestPointerLock({ unadjustedMovement: true });
      return true;
    }
    if (button !== ENGINE.MouseButton.Left) return false;
    if (this.rig.shouldCapturePointer()) this.inputManager?.requestPointerLock({ unadjustedMovement: true });
    this.rig.scanFromOpticalInput();
    return true;
  }

  public override handleMouseUp(button: MouseButton, event: MouseEvent): boolean {
    if (button !== ENGINE.MouseButton.Right) return false;
    event.preventDefault();
    this.rig.setOpticalAim(false);
    return true;
  }

  public override handleMouseWheel(event: WheelEvent): boolean {
    this.rig.changeAltitude(event.deltaY > 0 ? -1 : 1);
    return true;
  }

  public override handleGamepadAxisChange(_gamepadIndex: number, axisIndex: number, value: number): boolean {
    const clean = Math.abs(value) < 0.16 ? 0 : value;
    if (axisIndex === 0) this.gamepadMoveX = clean;
    else if (axisIndex === 1) this.gamepadMoveY = clean;
    else if (axisIndex === 2) this.gamepadLookX = clean;
    else if (axisIndex === 3) this.gamepadLookY = clean;
    else return false;
    return true;
  }

  public override handleGamepadButtonDown(_gamepadIndex: number, buttonIndex: number): boolean {
    if (buttonIndex === 0) this.rig.scan();
    else if (buttonIndex === 1) this.rig.toggleGrip();
    else if (buttonIndex === 3) this.rig.toggleConsole();
    else if (buttonIndex === 2) this.rig.recover();
    else if (buttonIndex === 4) this.rig.changeAltitude(-1);
    else if (buttonIndex === 5) this.rig.changeAltitude(1);
    else if (buttonIndex === 6) this.rig.scan();
    else if (buttonIndex === 7) this.rig.toggleGrip();
    else if (buttonIndex === 8) this.rig.cycleTool(1);
    else if (buttonIndex === 9) this.rig.requestExit();
    else if (buttonIndex === 12) this.rig.controllerDecision('up');
    else if (buttonIndex === 13) this.rig.controllerDecision('down');
    else if (buttonIndex === 14) this.rig.controllerDecision('left');
    else if (buttonIndex === 15) this.rig.controllerDecision('right');
    else return false;
    return true;
  }

  public tick(deltaTime: number): void {
    const keyboardX = Number(this.held.has('KeyD')) - Number(this.held.has('KeyA'));
    const keyboardY = Number(this.held.has('KeyS')) - Number(this.held.has('KeyW'));
    this.rig.drive(
      Math.max(-1, Math.min(1, keyboardX + this.gamepadMoveX)),
      Math.max(-1, Math.min(1, keyboardY + this.gamepadMoveY)),
      deltaTime
    );
    if (this.gamepadLookX || this.gamepadLookY) {
      this.rig.look(this.gamepadLookX * 75 * deltaTime, this.gamepadLookY * 75 * deltaTime);
    }
  }
}

@ENGINE.GameClass()
export class WarehouseRig extends ENGINE.SceneNode {
  public onExit: ((result: WarehouseRunResult | null) => void) | null = null;
  public onStoryCompleted: (() => void) | null = null;

  private mode: WarehouseMode = 'story';
  private seed = 'story-warehouse-07';
  private director: WarehouseDirector | null = null;
  private environment = new WarehouseEnvironment();
  private readonly celStyle = new WarehouseCelStyle();
  private celVisualsEnabled = true;
  private camera: ENGINE.ViewTargetCameraNode | null = null;
  private drone = ENGINE.SceneNode.create({ name: 'WarehouseDrone', position: DRONE_START.clone() });
  private droneVisual = ENGINE.SceneNode.create({ name: 'WarehouseDroneVisual' });
  /** World-space acknowledgement for scan and grip. See WarehouseDroneFeedback. */
  private readonly feedback = new WarehouseDroneFeedback();
  private droneRotorBlades: THREE.InstancedMesh | null = null;
  private readonly droneRotorTransform = new THREE.Object3D();
  private droneRotorSpin = 0;
  private droneStatusMaterial: THREE.MeshStandardMaterial | null = null;
  private readonly cargoRope = new DroneCargoRope();
  private readonly ropeAnchor = new THREE.Vector3();
  private readonly desiredCameraPosition = new THREE.Vector3();
  private readonly desiredCameraTarget = new THREE.Vector3();
  private readonly cameraAnchor = new THREE.Vector3();
  private readonly cameraDirection = new THREE.Vector3();
  private readonly cameraProbeOrigin = new THREE.Vector3();
  private readonly cameraProbeRight = new THREE.Vector3();
  private readonly cameraProbeUp = new THREE.Vector3();
  private readonly cameraRaycaster = new THREE.Raycaster();
  private cameraArmDistance = THIRD_PERSON_DISTANCE;
  private readonly previousDroneAudioPosition = DRONE_START.clone();
  private readonly droneVelocity = new THREE.Vector3();
  private readonly desiredDroneVelocity = new THREE.Vector3();
  private readonly droneVelocityDelta = new THREE.Vector3();
  private cameraPosition = DRONE_START.clone();
  private cameraTarget = new THREE.Vector3(0, 2.8, 0);
  private yaw = Math.PI;
  private pitch = -0.04;
  /**
   * Free height, in metres, rather than an index into three bands.
   *
   * The bands were 1.8, 3.2 and 6.8 - low, work, inspection - and they are still what Q and E
   * step between in feel, but a fixed set cannot coexist with flying where you look: any
   * climb would be undone by the next frame's damp back to its band.
   */
  private altitude = 3.2;
  /** Current physical cruise ratio, 0..1. Feeds the FOV breathe in applyCamera. */
  private throttle = 0;
  private chaseFov = 68;
  private view: WarehouseView = 'cctv';
  private perspective: DronePerspective = 'third';
  private opticalAimHeld = false;
  /**
   * Whether the pointer is free rather than locked to the drone.
   *
   * No longer toggleable. It is derived from the VIEW: drone view captures the pointer
   * because the mouse is aiming a camera, and CCTV and console views release it because
   * the mouse is pointing at an interface. See `shouldCapturePointer`.
   *
   * The field survives its own toggle because `syncPointerMode` and the optical guard both
   * read it, and because a later view - a map, a cinematic - may want the pointer free
   * without being either of the three that exist today.
   */
  private cursorControl = false;
  private mounted = false;
  private input: WarehouseInput | null = null;
  private suspendedPlayerController: ENGINE.PlayerController | null = null;
  private hud: WarehouseHUD | null = null;
  private readonly sound = new WarehouseAudio();
  private workers: WarehouseWorkerNode[] = [];
  private inboundAudit: InboundAuditSnapshot | null = null;
  private inboundCargo: WarehouseCargoNode[] = [];
  private inboundIntakeCargo: WarehouseCargoNode | null = null;
  private inboundIntakeElapsed = 0;
  private inboundFugitive: WarehouseWorkerNode | null = null;
  private containmentPurpose: 'breach' | 'inbound' | null = null;
  private visitor: WarehouseVisitor | null = null;
  private cargo: WarehouseCargoNode | null = null;
  private duplicateCargo: WarehouseCargoNode | null = null;
  private carried: WarehouseCargoNode | null = null;
  private readonly dockedCargo: Array<{ node: WarehouseCargoNode; doorId: WarehouseDoorId; slot: number }> = [];
  private readonly scannedCargo = new Set<WarehouseCargoNode>();
  private readonly lastInboundScanSubject = new THREE.Vector3();
  private deliveredCargo: {
    node: WarehouseCargoNode;
    from: THREE.Vector3;
    to: THREE.Vector3;
    elapsed: number;
    duration: number;
  } | null = null;
  private activeCase: GeneratedWarehouseCase | null = null;
  private evidence = emptyEvidence();
  private selectedDoor: WarehouseDoorId = 'service-a';
  private doorStatuses: Record<WarehouseDoorId, WarehouseDoorStatus> = {
    'service-a': 'unseen',
    'service-b': 'unseen',
    'service-c': 'unseen',
  };
  private doorEventAvailable = false;
  private pursuit: WarehousePursuit | null = null;
  private containmentResponse: WarehouseContainmentResponse | null = null;
  private intruder: WarehouseIntruderNode | null = null;
  private pursuitPhase = '';
  private selectedZone: WarehouseSecurityZoneId = 'receiving';
  private zoneStatuses: Record<WarehouseSecurityZoneId, WarehouseSecurityZoneStatus> = {
    receiving: 'unseen',
    'storage-west': 'unseen',
    'storage-east': 'unseen',
    sortation: 'unseen',
  };
  private intrusion: WarehouseIntrusionSnapshot | null = null;
  private breachEntryTimer = -1;
  private breachStarted = false;
  private intrusionHudAccumulator = 0;
  private decisionCommitted = false;
  private visitorVerified = false;
  private freightVerified = false;
  private workerVerificationRequested = false;
  private activeTool: WarehouseTool = 'optical';
  private tools: WarehouseTool[] = ['optical'];
  private integrity = 3;
  private stage = 0;
  private cleanChain = 0;
  private correct = 0;
  private decisions = 0;
  private elapsed = 0;
  private storyMovement = 0;
  private storyCase = 0;
  private inboundTimer = -1;
  private inboundOpened = false;
  private bellReminder = -1;
  private handoff = INTRO_HANDOFF_SECONDS;
  /** Which door of the opening sweep is on screen, or -1 before it starts. */
  private introBeat = -1;
  /** The door selection the sweep borrowed, handed back when control passes to the drone. */
  private introReturnDoor: WarehouseDoorId | null = null;
  private introSweepEnabled = false;
  /**
   * Which shot the last frame was composed from, so a CUT can be told from a MOVE.
   *
   * Not simply `view`: leaving a pursuit or a containment response returns to a view that
   * never changed, and that is still a cut.
   */
  private lastShot = '';
  private finished = false;
  private savedPost: { tone: unknown; bloom: unknown } | null = null;
  /** The engine's default fallback camera, held across the mount. See keepActive. */
  private savedFallbackCamera: THREE.PerspectiveCamera | null = null;
  private readonly blockContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  /**
   * Let go of the optical view, from the window, whatever happened.
   *
   * ## The bug
   *
   * Holding right mouse enters the drone's first-person optical view and releasing it is
   * supposed to come back out. It did not, and the reason is in the engine rather than here:
   * `InputManager.setupEventListeners` binds `keyup` to WINDOW and `mouseup` to
   * `rendererDomElement`. A key release is caught wherever the pointer is; a mouse release
   * is only caught over the canvas.
   *
   * The warehouse has a full-screen DOM console over that canvas. Most of it is
   * `pointer-events: none` and passes clicks through, but the console actions, the tool row,
   * the camera row and the whole operations panel are deliberately `auto` - so releasing the
   * button anywhere over those targets the overlay, `handleMouseUp` never runs, and
   * `opticalAimHeld` stays true forever. The player is stuck in first person with no way out
   * except a key that happens to clear it as a side effect.
   *
   * ## Why this fixes it rather than papering over it
   *
   * A held input has to be released by something that cannot miss. `window` in the capture
   * phase sees the release before any target does, and the guard inside `setOpticalAim`
   * makes a second call harmless - so this and the engine's own `handleMouseUp` can both
   * fire and only the first one does anything.
   *
   * `blur` is here for the same reason and is not hypothetical: alt-tab while holding the
   * button and the release happens to a window that is not this one.
   */
  private readonly releaseOptical = (event?: MouseEvent): void => {
    if (event && event.button !== 2) return;
    this.setOpticalAim(false);
  };

  private readonly releaseOpticalOnBlur = (): void => {
    this.setOpticalAim(false);
  };

  /**
   * And if the pointer lock goes, the hold goes with it.
   *
   * Escape exits pointer lock without producing a mouseup at all - the browser does it, not
   * the page - so a player who presses Escape mid-aim would otherwise keep the optical view
   * and lose the camera control that goes with it.
   */
  private readonly releaseOpticalOnLockChange = (): void => {
    if (!document.pointerLockElement) this.setOpticalAim(false);
  };

  public constructor() {
    super();
    this.isRoot = false;
  }

  public override initialize(options?: WarehouseRigOptions): void {
    super.initialize(options);
    this.mode = options?.mode ?? 'story';
    this.seed = options?.seed ?? (this.mode === 'daily' ? WarehouseDirector.utcDailySeed() : `${this.mode}-${Date.now()}`);
    const save = loadWarehouseSave();
    const savedMovement = STORY_MOVEMENTS.findIndex((movement) => movement.id === save.storyMovementId);
    this.storyMovement = this.mode === 'story' && !save.storyCompleted
      ? Math.max(0, Math.min(STORY_MOVEMENTS.length - 1, savedMovement >= 0 ? savedMovement : save.storyMovement))
      : 0;
    this.tools = [...new Set<WarehouseTool>(['optical', ...save.unlockedTools])];
    if (this.mode === 'daily') this.tools = ['optical', 'history', 'thermal', 'uv', 'xray', 'acoustic'];
    const config: WarehouseRunConfig = { mode: this.mode, seed: this.seed, deckVersion: WAREHOUSE_DECK_VERSION, unlockedTools: this.tools };
    this.director = new WarehouseDirector(config);
    this.environment.build();
    this.add(this.environment.root);
    this.add(this.celStyle.accents);
    this.buildDrone();
    this.add(this.cargoRope.root);
    this.buildCamera();
    this.buildWorkers();
    this.setTickEnabled(true);
  }

  public override beginPlay(): boolean {
    if (!super.beginPlay()) return false;
    this.mount();
    return true;
  }

  public mount(): void {
    if (this.mounted) return;
    this.mounted = true;
    const world = this.getWorld();
    const container = world?.gameContainer;
    if (!world || !container) return;
    this.input = new WarehouseInput(this);
    /*
     * The engine's default controller owns WASD, Q and pointer-lock mouse movement before
     * this bespoke rig can see them. OMNISCIENT_ has no movement pawn, so that ownership
     * produces no gameplay; it only starves the drone. Suspend it for this isolated mode
     * and restore it when the facility hands control back.
     */
    this.suspendedPlayerController = world.getPlayerControllerAt(0) ?? null;
    if (this.suspendedPlayerController) {
      world.inputManager?.removeInputHandler(this.suspendedPlayerController);
    }
    world.inputManager?.addInputHandler(this.input);
    /*
     * The warehouse owns the fallback for as long as it is mounted.
     *
     * This is the guarantee, where keepActive is only the repair: whatever happens to the
     * view-target stack - popped, superseded, momentarily empty - the frame the engine
     * falls back to is now THIS camera, so the worst possible failure renders the correct
     * view instead of the void at the world origin. The default is put back on unmount
     * because the workstation owns its own failures.
     */
    this.savedFallbackCamera = world.fallbackCamera;
    if (this.camera) world.fallbackCamera = this.camera.getCamera();

    container.addEventListener('contextmenu', this.blockContextMenu);
    // Capture phase: the release is seen before any overlay target can swallow it.
    window.addEventListener('mouseup', this.releaseOptical, true);
    window.addEventListener('blur', this.releaseOpticalOnBlur);
    document.addEventListener('pointerlockchange', this.releaseOpticalOnLockChange);
    setPointerLockAllowed(true);
    this.hud = new WarehouseHUD(
      container,
      this.mode,
      () => this.requestExit(),
      () => this.recover(),
    );
    this.hud.onDecision((decision) => this.tryDecision(decision));
    this.hud.onTool((tool) => {
      this.activeTool = tool;
      this.hud?.setTools(this.tools, this.activeTool);
      this.hud?.flash(`${tool.toUpperCase()} CHANNEL ACTIVE`, 1.2);
    });
    this.hud.onTransmit((text) => this.replyToOperator(text));
    this.hud.onDoorSelect((door) => this.selectDoor(door));
    this.hud.onDoorCycle(() => this.cycleDoor(1));
    this.hud.onReplay(() => this.replayDoorEvent());
    this.hud.onSkip(() => this.skipPursuit());
    this.hud.onZoneSelect((zone) => this.selectZone(zone));
    this.hud.onZoneContain((zone) => this.tryContainZone(zone));
    this.hud.setTools(this.tools, this.activeTool);
    this.hud.setRecords(loadWarehouseSave().archiveRecords);
    this.hud.setControlsVisible(!loadWarehouseSave().tutorialComplete);
    /*
     * Reduced motion gets no sweep at all, rather than a compressed one. Three cuts in a
     * fifth of a second is worse than none: it is the same three camera jumps, delivered
     * faster, which is exactly the thing the preference asks us not to do.
     */
    this.introSweepEnabled = !getAccessibilityPreferences().reducedMotion;
    this.introBeat = -1;
    this.introReturnDoor = null;
    this.handoff = this.introSweepEnabled ? INTRO_HANDOFF_SECONDS : 0.2;
    this.hud.setView(this.view);
    this.hud.setOpticalAim(false);
    this.syncPointerMode();
    this.sound.start();
    setRoomTone(null);
    adaptiveScore.setState('warehouse', 0);
    this.configurePost();
    this.setCelVisualsEnabled(this.celVisualsEnabled, false);
    this.keepActive();
    this.beginCurrent();
  }

  private configurePost(): void {
    const post = this.getWorld()?.postProcessManager;
    if (!post) return;
    this.savedPost = {
      tone: post.getEffectConfig(ENGINE.PostProcessPass.ToneMapping),
      bloom: post.getEffectConfig(ENGINE.PostProcessPass.Bloom),
    };
    // 0.62, matching the workstation, so the two scenes no longer tone-map differently.
    post.configureEffect(ENGINE.PostProcessPass.ToneMapping, { enabled: true, mode: THREE.ACESFilmicToneMapping, exposure: 0.62 });
    /*
     * Bloom is deliberately limited to a two-level chain in the warehouse.
     *
     * ## The black screen
     *
     * Sweeping the chase camera turned the whole 3D frame to exact zero for seconds while
     * the DOM console stayed alive. Four camera-side fixes each reduced the incidence
     * without ending it, because the camera was never the problem: telemetry printed onto
     * the black frames reads active camera OURS, ordinary pose, drone visible, and the
     * frame is still black. The same strip reads fps 55, dt 17.5ms on those frames, so the
     * renderer is running at full speed and rendering black - not stalling and presenting
     * an unfinished buffer.
     *
     * That leaves a bad pixel spread by bloom's blur. The size of the damage is set by how
     * far the mipmap chain goes, which is what makes it certain:
     *
     *   levels 8 (library default)  entire frame black across a 145-degree arc
     *   levels 4                    one hard-edged ~250px black square, screen-axis-aligned
     *   levels 2                    nothing measurable
     *   bloom off                   nothing
     *
     * The square at levels 4 is the tell. It has vertical and horizontal edges, does not
     * perspective-distort with the scene, and rays fired through it pass clean to the floor
     * 24.8m away - it is not an object, it is one contaminated texel of a coarse mip drawn
     * back over the frame. It is also, almost certainly, the "large dark panel blocking the
     * aisle numbers" reported twice and blamed first on the camera and then on the light
     * fittings. Both of those were wrong; this was always it.
     *
     * ## Why the chain remains capped at levels 2
     *
     * levels 2 measured clean - 88 steps of spin-plus-pitch with no black frame, and a
     * 48px dark-block scan statistically identical to bloom off (worst 1.2 vs 1.0, 46 of
     * 66 frames flagged in both, all of it real scene content). It is tempting.
     *
     * The first safety pass therefore disabled bloom entirely. The later F8 visual pass
     * found a useful treatment at only 0.045 strength and explicitly retained the measured-
     * clean two-level chain. That combination is the authored look below: the user's exact
     * visual values without reintroducing the unsafe deep mip spread.
     *
     * ## And then it was on anyway
     *
     * Everything above was written, argued and then contradicted by the line underneath it,
     * which read `enabled: true ... levels: 4` - the exact row of the table above that
     * produces one hard-edged black square. The comment said OFF and the code said ON, and
     * the code wins, so the square came back and was reported again as "there is a black box
     * when i turn the camera".
     *
     * Re-measured before touching it, because a claim this specific should not be inherited
     * on trust: `scripts/dev/blackbox.py` reproduced it on 11 of 60 spin steps, and the blob
     * is 231 pixels wide in EVERY frame while sliding a uniform 72 pixels per step. Constant
     * size under camera rotation is not something a world object does, and a ray fired
     * through it reports `WarehouseFloor` at 20.9m - it is not an object. Its colour is
     * exactly (0,0,0) across 200 by 200 pixels with no gradient at all. That is a
     * contaminated texel of a coarse mip, drawn back over the frame, exactly as described.
     *
     * The cap below is therefore part of the setting, not an optional quality increase.
     *
     * ## The state it was never proven against, now proven
     *
     * The objection to levels 2 was never that it measured dirty - it measured clean over 88
     * steps. It was that the sweep had only ever visited ORDINARY lighting while the source
     * pixel remained unfound, so nothing covered "containment red, the pursuit rig, the
     * emergency ramp". The inbound audit puts an emergency state on the critical path, so
     * that gap stopped being theoretical.
     *
     * Tested 2026-08-25: lighting mode forced to `emergency`, 90 steps of spin-plus-pitch,
     * 0 dark blobs, worst dark fraction 3.1% against 11.5% when the fault was live. The
     * forced state was confirmed rather than assumed - same drone pose, same build, the
     * emergency frame measured luma 57.5 and R-B -23.5 against normal's 83.5 and -13.7, so
     * the fixtures had genuinely dropped and the cool half had genuinely taken over.
     *
     * Still a blast-radius cap rather than a fix. The pixel has not been found.
     */
    post.configureEffect(ENGINE.PostProcessPass.Bloom, {
      enabled: true,
      ...TUNED_BLOOM,
      // Keep the measured-safe chain depth: deeper mips caused the historical black frame.
      levels: 2,
    });
  }

  private buildDrone(): void {
    /**
     * ## The player's own avatar was the darkest thing on screen
     *
     * Measured off a capture: the drone came out at median luma 23 against a frame median of
     * 24, with its only highlight the teal sensor ball. It sits dead centre of every
     * third-person shot and it read as a silhouette with a bauble.
     *
     * Two causes, both here. The hull was #263d39 - a dark teal at 62% metalness - and
     * metalness that high needs an environment to reflect or it simply goes black; the
     * warehouse has no reflection probe, so it did. And the drone carried no light of its
     * own, which is the odd part for a machine whose entire job is looking at things.
     *
     * Lighter, and a good deal less metallic, so the warm high bays actually land on it.
     */
    /*
     * ## The airframe is black, like its rotors
     *
     * The hull was mid-grey #69707a, and that value was chosen under a room that measured 97%
     * warm with bloom off. Neither is true any more: the warehouse is night-converted and bloom
     * is on, and the first thing that showed was this hull blowing out - it had to be tuned
     * around twice while setting the bloom threshold, which is the picture telling you the
     * value is wrong rather than the effect being wrong.
     *
     * A pale body was originally a fix for the drone reading as "a silhouette with a bauble" at
     * median luma 23 against a frame median of 24. That fix solved the symptom. The cause was
     * that the machine had no light of its own; it now has a landing light, an inspection fill,
     * status lamps and tail lamps, and bloom to carry them. A dark body with lit accents is the
     * stronger answer to the same problem, and it is the idiom the rest of this game already
     * uses - charcoal structure, warm accents.
     *
     * Not flat black, though. Three values a few points apart - chassis, deck, rotors - so the
     * form still separates into parts under the coarse grid the retro pass leaves. A single
     * black would read as one blob, which is the failure mode a dark airframe actually has.
     */
    const hull = new THREE.MeshStandardMaterial({ color: '#16191c', roughness: 0.62, metalness: 0.3 });
    const dark = new THREE.MeshStandardMaterial({ color: '#09110f', roughness: 0.68, metalness: 0.38 });
    const brass = new THREE.MeshStandardMaterial({ color: '#b08a3f', roughness: 0.52, metalness: 0.58 });
    /* Between hull and dark: the spine and nose read as separate components rather than as one
       pale mass, without going so dark that the drone loses the luma a previous pass bought. */
    /* The deck's top face is the one surface aimed straight at the high bays, so it takes the
       least specular of the three - at 0.26 metalness it was catching enough to blow white and
       undo the point of a black airframe. */
    const panel = new THREE.MeshStandardMaterial({ color: '#0d1113', roughness: 0.82, metalness: 0.1 });
    /*
     * ## The redesign, and what was actually wrong with the old one
     *
     * The previous hull was a tapered cylinder rotated onto its side with a hemisphere on
     * top. Read off captures rather than argued about, it had three faults and only one of
     * them was the shape.
     *
     * It had NO HEADING. The player flies this thing from directly behind for the whole
     * mission, and from behind it was a pale egg with two small green dots - symmetrical,
     * with its one distinguishing feature (the sensor) on the far side where the camera never
     * sees it. Steering a machine whose front you cannot locate is a tax on every input.
     *
     * It had NO HIERARCHY. The body, the dome and the four rotor guards were all the same
     * pale hull material, so the guards - four bright rings on the outside of the silhouette -
     * carried as much visual weight as the chassis they were bolted to.
     *
     * And the mass was shapeless. A rotated tapered cylinder is an egg, and an egg reads as a
     * toy however it is lit.
     *
     * ## What replaces it
     *
     * A flat hex chassis with a spine down it and a wedge nose. Flat plates and hard angles
     * read as engineered at any resolution, which matters more than usual here because the
     * retro pass quantises everything to a coarse grid - curvature is the first thing that
     * grid destroys, and a faceted plate survives it intact.
     *
     * The hull KEEPS its mid-grey. A previous pass measured this drone at median luma 23
     * against a frame median of 24 and lightened it to fix exactly that, and going dark again
     * to buy a silhouette would walk straight back into it. The contrast comes from the
     * guards and booms going dark instead - see below - which costs the frame nothing because
     * they are thin.
     */
    /*
     * ## Turntable review, and what the six angles said
     *
     * The first redesign was judged from the chase camera alone, which is the one view that
     * flattered it. Orbited, it fell apart: from three-quarters and from the side it read as a
     * flat PLATE with a plain BRICK on top. The chassis at 10cm deep was a sliver in profile,
     * so the machine had no body - just a disc - and the avionics spine, being the only thing
     * with height, became the whole silhouette and it was a featureless rectangle.
     *
     * Only the rear view worked, because the rear view is carried by the tail lamps rather
     * than by the form.
     *
     * ## A fuselage, in two steps
     *
     * A wide lower hull and a narrower upper deck, stacked and tapered. That gives the drone
     * real depth in profile and a stepped edge that catches light along its length, which is
     * what makes a small object read as machined rather than as a block. Faceted at six sides
     * for the same reason the chassis was: the retro pass quantises hard, and flats survive
     * a coarse grid where curvature turns to mush.
     */
    const shell = ENGINE.MeshNode.create({
      name: 'DroneLowerHull',
      geometry: new THREE.CylinderGeometry(0.44, 0.38, 0.15, 6),
      material: hull,
      castShadow: true,
    });
    shell.rotation.y = Math.PI / 6;
    const dome = ENGINE.MeshNode.create({
      name: 'DroneUpperDeck',
      geometry: new THREE.CylinderGeometry(0.3, 0.42, 0.13, 6),
      material: panel,
      castShadow: true,
    });
    dome.rotation.y = Math.PI / 6;
    dome.position.y = 0.135;
    /*
     * The nose, which is the whole point of the redesign: an asymmetric wedge so the front is
     * identifiable from any angle including the one the player actually uses.
     */
    /*
     * A sensor housing rather than a spike, because the front has to read as a FACE.
     *
     * From dead ahead the old nose was invisible and all the drone showed was a teal ball
     * slung under it - the front view of a machine whose entire job is looking at things had
     * nothing that looked back. A blunt housing with a dark visor slot across it, sensor
     * recessed inside, is the shape every camera drone and every inspection robot converges
     * on, and it is legible at a dozen pixels.
     */
    const nose = ENGINE.MeshNode.create({
      name: 'DroneSensorHousing',
      geometry: new THREE.BoxGeometry(0.32, 0.155, 0.28),
      /*
       * Hull, not panel. In the darker panel grey the housing read as a separate black brick
       * bolted to the nose rather than as part of the airframe - a silhouette with a lump on
       * it. Matching the body makes it structure, and lets the one genuinely dark element up
       * front, the visor slot, be the thing the eye finds.
       */
      material: hull,
      castShadow: true,
    });
    nose.position.set(0, 0.025, -0.4);
    const visor = ENGINE.MeshNode.create({
      name: 'DroneVisor',
      geometry: new THREE.BoxGeometry(0.285, 0.085, 0.04),
      material: dark,
    });
    visor.position.set(0, 0.03, -0.545);
    /*
     * A brass rim line, and the first attempt at it was a mistake worth recording: at 0.455
     * radius by 2.8cm tall against a chassis only 10cm deep, it stopped being a strake and
     * became a gold PLATE - the loudest element on the machine, and an accent that outshouts
     * the thing it is accenting is not an accent. A torus at the rim gives the edge catch that
     * was wanted with about a tenth of the area.
     */
    const strake = ENGINE.MeshNode.create({
      name: 'DroneStrake',
      /* Thicker than it was: a brass line that read as a highlight on a grey hull is the only
         warm thing on a black one, and it is what stops the silhouette being a hole. */
      geometry: new THREE.TorusGeometry(0.43, 0.022, 6, 6),
      material: brass,
    });
    strake.rotation.set(Math.PI / 2, 0, Math.PI / 6);
    strake.position.y = 0.072;
    const eye = ENGINE.MeshNode.create({
      name: 'DroneEye',
      geometry: new THREE.SphereGeometry(0.062, 12, 8),
      material: new THREE.MeshStandardMaterial({ color: '#09100f', emissive: '#315f55', emissiveIntensity: 1.2, roughness: 0.22 }),
    });
    /*
     * Into the nose, not slung under the belly. At 0.16 radius hanging below the chassis it
     * was the largest single feature on the drone and read as a bauble the machine was
     * carrying; a sensor belongs in the housing built for it, where its size says "instrument"
     * rather than "cargo".
     */
    eye.position.set(0, 0.03, -0.558);
    const grip = ENGINE.MeshNode.create({
      name: 'MagneticGripper',
      geometry: new THREE.CylinderGeometry(0.18, 0.24, 0.12, 12),
      material: brass,
    });
    grip.position.set(0, -0.42, 0);

    /**
     * A landing light, and it earns its place three times over.
     *
     * It is true - every inspection drone has one - and it solves the readability problem at
     * the source rather than by turning the hull up: a machine that emits light is legible
     * against any background, because it brings its own.
     *
     * It also does the job the mission is about. The player is flying down unlit aisles
     * looking for a package, and until now the only thing lighting the thing they were
     * peering at was a lamp ten metres above it. A cone in front of the drone means moving
     * closer to something makes it clearer, which is the loop this whole mission runs on.
     *
     * Warm, matching the high bays, so the drone belongs to the building rather than looking
     * like a torch somebody carried in. Angled slightly down, because the interesting things
     * are on shelves and floors and nobody flies a drone looking at the ceiling.
     */
    /**
     * A point light, not the spot this started as.
     *
     * A cone was the better picture and it was the wrong call, and the way it went wrong is
     * worth keeping. This was the only SpotLight in the warehouse - a scene that already runs
     * 36 point lights, two directionals with shadow maps and a hemisphere - and adding the
     * first light of a new TYPE does not cost one light, it adds a whole spot-light block to
     * every lit shader in the room and forces the lot to recompile.
     *
     * The screen started going black while turning, in a build where it never had before, and
     * the diorama went while the DOM console stayed - which is the signature of the lit
     * materials failing rather than of the camera being somewhere empty.
     *
     * A point light at the nose does the job the cone was added for: fly closer to a package
     * and it gets brighter, which is the loop the mission runs on. What it gives up is the
     * shaped pool on the floor ahead, and that is a fair trade against a screen that works.
     */
    const lamp = ENGINE.PointLightNode.create({
      name: 'DroneLandingLight',
      color: '#ffd0a0',
      intensity: 10,
      distance: 11,
      decay: 1.35,
      position: new THREE.Vector3(0, -0.3, -0.5),
    });

    // A hot little glass under the lens, so the source is visible on the drone itself and not
    // only in what it lights. A beam with no lamp at the end of it reads as a bug.
    const lampGlass = ENGINE.MeshNode.create({
      name: 'DroneLandingGlass',
      geometry: new THREE.SphereGeometry(0.07, 10, 8),
      material: new THREE.MeshStandardMaterial({
        color: '#ffe6c4',
        emissive: '#ffc98a',
        /*
         * 1.5, not 3.4. This is a 7cm bulb, and at 3.4 with bloom on it was expanding into the
         * largest bright shape on the machine - a yellow blob under a black airframe, brighter
         * than the sensor it is meant to support. The lamp reads as a lamp at half the value
         * now that the body behind it is dark.
         */
        emissiveIntensity: 1.5,
        roughness: 0.24,
      }),
    });
    lampGlass.position.set(0, -0.1, -0.36);

    this.droneVisual.add(shell, dome, nose, visor, strake, eye, grip, lamp, lampGlass);
    this.feedback.bindGripper(grip);

    /*
     * The booms take a mid value, and this is the cost of a black airframe.
     *
     * With hull, deck, guards and arms all near-black the four rotor rings stopped separating
     * from the mass they are bolted to - the machine read as one dark blob with lights on it.
     * A dark object needs internal value steps to keep its parts, so the arms sit between the
     * body and the guards: light enough to draw the cross that says quadcopter, dark enough
     * that they never compete with the accents.
     */
    const boom = new THREE.MeshStandardMaterial({ color: '#2a3033', roughness: 0.66, metalness: 0.28 });
    const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(0.52, 0.07, 0.08), boom, 4);
    arms.name = 'DroneRotorArms';
    arms.castShadow = true;
    /*
     * Guards go DARK, and this is the hierarchy fix rather than a colour preference.
     *
     * They were the same pale hull as the chassis, which put four bright rings on the outside
     * of the silhouette carrying as much weight as the machine inside them. A rotor guard is a
     * piece of wire mesh; it should be the thinnest, quietest thing on the airframe. Dark and
     * slimmer, it recedes and the chassis becomes the drone.
     */
    const guards = new THREE.InstancedMesh(new THREE.TorusGeometry(0.25, 0.019, 8, 22), dark, 4);
    guards.name = 'DroneRotorGuards';
    guards.castShadow = true;
    const blades = new THREE.InstancedMesh(new THREE.BoxGeometry(0.46, 0.018, 0.055), dark, 4);
    blades.name = 'DroneRotorBlades';
    blades.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (const [index, [x, z]] of DRONE_ROTOR_POSITIONS.entries()) {
      this.droneRotorTransform.position.set(x + (x > 0 ? -0.25 : 0.25), 0.02, z);
      this.droneRotorTransform.rotation.set(0, 0, 0);
      this.droneRotorTransform.updateMatrix();
      arms.setMatrixAt(index, this.droneRotorTransform.matrix);
      this.droneRotorTransform.position.set(x, 0.02, z);
      this.droneRotorTransform.rotation.set(Math.PI / 2, 0, 0);
      this.droneRotorTransform.updateMatrix();
      guards.setMatrixAt(index, this.droneRotorTransform.matrix);
      this.droneRotorTransform.rotation.set(0, 0, 0);
      this.droneRotorTransform.updateMatrix();
      blades.setMatrixAt(index, this.droneRotorTransform.matrix);
    }
    this.droneRotorBlades = blades;
    this.droneVisual.add(arms, guards, blades);

    this.droneStatusMaterial = new THREE.MeshStandardMaterial({
      color: '#8fe7c8',
      emissive: '#4fbf99',
      emissiveIntensity: 2.1,
      roughness: 0.2,
    });
    const statusLamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 10, 6), this.droneStatusMaterial, 2);
    statusLamps.name = 'DroneStatusLamps';
    for (const [index, x] of [-0.3, 0.3].entries()) {
      this.droneRotorTransform.position.set(x, 0.14, 0.26);
      this.droneRotorTransform.rotation.set(0, 0, 0);
      this.droneRotorTransform.updateMatrix();
      statusLamps.setMatrixAt(index, this.droneRotorTransform.matrix);
    }
    this.droneVisual.add(statusLamps);

    /*
     * Tail lights, and they are the most useful thing in this whole redesign.
     *
     * The player flies from directly behind for the entire mission, so the view they navigate
     * by is the one view the old drone gave nothing to: symmetrical, pale, front on the far
     * side. Two red lamps at the tail make heading unambiguous from exactly that angle, and
     * they follow the convention every real aircraft uses, so nobody has to be taught it.
     *
     * Red because it is the one hue not already spoken for on this airframe - the sensor is
     * teal, the status lamps green, the strake brass - and because red reads as "this is the
     * back" to anyone who has ever seen a vehicle.
     *
     * Unlit material rather than emissive-on-standard: these are 3cm lamps seen at 3 metres,
     * and MeshBasicMaterial guarantees they hold their colour whatever the warehouse lighting
     * is doing, including the emergency ramp where every standard material in the room dims.
     */
    const tailLamps = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.032, 8, 6),
      new THREE.MeshBasicMaterial({ color: '#ff5d4a', toneMapped: false }),
      2
    );
    tailLamps.name = 'DroneTailLamps';
    for (const [index, x] of [-0.26, 0.26].entries()) {
      this.droneRotorTransform.position.set(x, 0.1, 0.3);
      this.droneRotorTransform.rotation.set(0, 0, 0);
      this.droneRotorTransform.updateMatrix();
      tailLamps.setMatrixAt(index, this.droneRotorTransform.matrix);
    }
    this.droneVisual.add(tailLamps);

    /* A tail fin, so the heading survives even with the lamps behind a rack. */
    const fin = ENGINE.MeshNode.create({
      name: 'DroneTailFin',
      geometry: new THREE.BoxGeometry(0.035, 0.19, 0.22),
      material: dark,
      castShadow: true,
    });
    fin.position.set(0, 0.2, 0.24);
    this.droneVisual.add(fin);
    const inspectionFill = ENGINE.PointLightNode.create({
      name: 'DroneInspectionFill',
      color: '#a8d9c8',
      intensity: 8,
      distance: 6.5,
      decay: 1.85,
      // Clear of the hull. Inside it, the fill was a hot spot on its own airframe - the same
      // fault as the ceiling lamps, at a fifth of the intensity.
      position: new THREE.Vector3(0, 0.3, 0.52),
    });
    this.drone.add(this.droneVisual);
    // The pulses live in world space, not on the drone - a ring parented to the airframe
    // would ride along with it and stop marking the place the scan actually landed.
    this.feedback.build();
    this.add(this.feedback.root);
    this.drone.add(inspectionFill);
    this.add(this.drone);
  }

  private buildCamera(): void {
    const camera = ENGINE.ViewTargetCameraNode.create({ name: 'WarehouseCamera', fov: 68, near: 0.05, far: 180, startActive: true });
    this.add(camera);
    this.camera = camera;
    this.applyCamera();
  }

  private buildWorkers(): void {
    const routes = WAREHOUSE_LAYOUT.workerRoutes;
    for (let i = 0; i < routes.length; i++) {
      const delivery = INBOUND_AUDIT_DELIVERIES[i];
      const worker = WarehouseWorkerNode.create({ name: `WarehouseWorker-${i + 1}` });
      worker.configure(
        delivery?.workerId ?? `W-${4839 + i * 941}`,
        routes[i][0],
        routes[i],
        delivery?.vest ?? WORKER_VESTS[i],
        !delivery?.suspicious,
        delivery ? {
          displayName: delivery.workerName,
          packageId: delivery.packageId,
          helmet: delivery.helmet,
          gloves: delivery.gloves,
          equipmentIndex: i,
        } : { equipmentIndex: i }
      );
      worker.visible = false;
      this.add(worker);
      this.workers.push(worker);
    }
  }

  private beginCurrent(): void {
    if (this.mode === 'story') this.beginStoryMovement();
    else {
      this.stage = Math.max(1, this.stage || 1);
      this.hud?.setIntegrity(this.integrity, this.stage, this.cleanChain);
      this.spawnCase(this.director?.caseForStage(this.stage, this.tools) ?? null);
      this.hud?.setCase(`STAGE ${String(this.stage).padStart(2, '0')}`, this.activeCase?.definition.briefing ?? 'Await case.');
    }
  }

  private beginStoryMovement(): void {
    const movement = STORY_MOVEMENTS[this.storyMovement];
    // The finale teaches historical comparison before the channel becomes a permanent
    // Night Shift unlock, so the incident loans it for this movement.
    if ((movement.id === 'breach' || movement.finale) && !this.tools.includes('history')) {
      this.tools.push('history');
      this.hud?.setTools(this.tools, this.activeTool);
      this.hud?.flash('HISTORICAL CCTV CHANNEL LOANED // INCIDENT COMPARISON REQUIRED', 3.2);
    }
    adaptiveScore.setState('warehouse', movement.finale ? 3 : movement.id === 'breach' ? 2 : this.storyMovement >= 2 ? 1 : 0);
    this.storyCase = 0;
    this.hud?.setCase(movement.title, movement.objective);
    this.hud?.flash(movement.objective, 3.6);
    this.inboundTimer = movement.inboundIn ?? -1;
    this.inboundOpened = this.inboundTimer < 0;
    this.hud?.setInbound(this.inboundTimer >= 0 ? this.inboundTimer : null);
    this.setWorkersVisible(false);
    if (this.inboundTimer >= 0) {
      for (const worker of this.workers) worker.resetToInbound();
    }
    this.spawnStoryCase();
  }

  private spawnStoryCase(): void {
    const movement = STORY_MOVEMENTS[this.storyMovement];
    this.stage = storyQuestNumber(this.storyMovement, this.storyCase);
    this.hud?.setIntegrity(this.integrity, this.stage, this.cleanChain);
    const caseId = movement.caseIds[this.storyCase];
    const definition = CASE_DECK.find((entry) => entry.id === caseId) ?? CASE_DECK[0];
    if (definition.id === 'freight-sort') {
      this.beginInboundAudit();
      return;
    }
    const base = this.director?.caseForStage(this.storyMovement * 5 + this.storyCase + 1, this.tools);
    if (!base) return;
    const data: GeneratedWarehouseCase = { ...base, definition };
    data.packageRecipientName = definition.id === 'door-tamper' || definition.id === 'identity-impostor'
      ? data.visitorName === 'Ana Reis' ? 'Lia Costa' : 'Ana Reis'
      : data.visitorName;
    data.inboundStatus = 'valid';
    data.measuredWeight = definition.id === 'weight-mismatch'
      ? Math.round((data.expectedWeight + 3.2) * 10) / 10
      : data.expectedWeight;
    data.visitorIntent = definition.id === 'door-tamper' || definition.id === 'identity-impostor' ? 'intrusion' : 'collection';
    data.doorTamper = definition.id === 'door-tamper';
    if (definition.id === 'valid-collection' && this.storyMovement === 0) {
      data.packageId = '2034'; data.aisle = 2; data.bay = 34; data.expectedWeight = 8.4; data.measuredWeight = 8.4;
      data.assignedDoorId = 'service-b'; data.packageRecipientName = data.visitorName; data.inboundStatus = 'valid';
      data.visitorIntent = 'collection'; data.doorTamper = false;
    }
    if (definition.id === 'door-tamper') {
      data.assignedDoorId = 'service-a'; data.packageRecipientName = data.visitorName === 'Ana Reis' ? 'Lia Costa' : 'Ana Reis';
      data.visitorIntent = 'intrusion'; data.doorTamper = true;
    }
    if (definition.id === 'package-5018') {
      data.packageId = '5018'; data.aisle = 5; data.bay = 18; data.expectedWeight = 40; data.measuredWeight = 30;
      data.assignedDoorId = 'service-c'; data.packageRecipientName = data.visitorName; data.inboundStatus = 'valid';
      data.visitorIntent = 'collection'; data.doorTamper = false;
    }
    if (definition.id === 'internal-breach') {
      data.packageId = 'UNLISTED'; data.aisle = 1; data.bay = 0; data.expectedWeight = 0; data.measuredWeight = 0;
      data.visitorName = 'UNLISTED PERSON'; data.visitorIntent = 'intrusion'; data.doorTamper = false;
      data.assignedDoorId = 'service-c'; data.packageRecipientName = data.visitorName; data.inboundStatus = 'valid';
    }
    this.spawnCase(data);
  }

  private beginInboundAudit(): void {
    this.clearCaseEntities();
    const definition = CASE_DECK.find((entry) => entry.id === 'freight-sort');
    if (!definition) return;
    const savedResolved = loadWarehouseSave().inboundAuditResolved;
    this.inboundAudit = createInboundAuditSnapshot(savedResolved >= INBOUND_AUDIT_DELIVERIES.length ? 0 : savedResolved);
    this.stage = storyQuestNumber(this.storyMovement, 0);
    this.hud?.setIntegrity(this.integrity, this.stage, this.cleanChain);
    this.hud?.setInbound(null);
    this.hud?.setBell(false, 0);
    this.environment.setRearDoorOpen(0);
    this.environment.setConveyorsRunning(false);
    this.environment.setVerifiedIntakeState('ready');

    for (const delivery of INBOUND_AUDIT_DELIVERIES) {
      const deliveryDefinition = delivery.sealCompromised
        ? { ...definition, anomaly: 'seal' as const, critical: true }
        : definition;
      const data: GeneratedWarehouseCase = {
        definition: deliveryDefinition,
        packageId: delivery.packageId,
        aisle: delivery.aisle,
        bay: delivery.bay,
        visitorName: delivery.workerName,
        workerName: delivery.workerName,
        packageRecipientName: delivery.packageDelivererName,
        inboundStatus: 'valid',
        expectedWeight: Math.round((7.4 + delivery.index * 1.85) * 10) / 10,
        measuredWeight: Math.round((7.4 + delivery.index * 1.85) * 10) / 10,
        assignedDoorId: 'service-c',
        visitorIntent: delivery.suspicious ? 'intrusion' : 'collection',
        doorTamper: false,
      };
      const cargo = WarehouseCargoNode.create({ name: `InboundAuditCargo-${delivery.packageId}` });
      cargo.configure(data);
      cargo.position.copy(this.environment.packagePosition(delivery.aisle, delivery.bay));
      cargo.visible = delivery.index >= this.inboundAudit.resolved;
      this.add(cargo);
      this.inboundCargo.push(cargo);
    }
    for (const [index, worker] of this.workers.entries()) {
      const delivery = INBOUND_AUDIT_DELIVERIES[index];
      if (!delivery) continue;
      worker.setInspectionPosition(delivery.inspectionPosition);
      worker.visible = index >= this.inboundAudit.resolved;
    }
    this.activateInboundDelivery(this.inboundAudit.activeIndex);
    this.hud?.appendSystem(
      'INBOUND CONTROL',
      'Unloading complete. Five worker/package pairs require individual optical comparison before the verified intake will accept them.'
    );
  }

  private activateInboundDelivery(index: number): void {
    const audit = this.inboundAudit;
    const delivery = INBOUND_AUDIT_DELIVERIES[index];
    const cargo = this.inboundCargo[index];
    if (!audit || !delivery || !cargo?.caseData) return;
    audit.activeIndex = index;
    audit.phase = 'scan-worker';
    audit.workerScanned = false;
    audit.packageScanned = false;
    audit.delivererMatches = null;
    audit.sealIntact = null;
    audit.fugitiveZone = null;
    audit.escapeSeconds = null;
    this.activeCase = cargo.caseData;
    this.cargo = cargo;
    const activeWorker = this.workers[index];
    if (activeWorker) {
      activeWorker.setInspectionPosition(delivery.inspectionPosition);
      activeWorker.visible = true;
    }
    this.evidence = emptyEvidence();
    this.scannedCargo.clear();
    this.decisionCommitted = false;
    this.inboundIntakeCargo = null;
    this.inboundIntakeElapsed = 0;
    this.environment.setVerifiedIntakeState('ready');
    this.environment.setConveyorsRunning(false);
    /*
     * The objective line is composed in one place and refreshed at every phase change - see
     * refreshInboundObjective. It used to be written once here and never again, so it said
     * "scan the worker, then inspect the package" for the whole delivery: after the
     * comparison came back the player was told the VERDICT and never the next action, and
     * the banner still described a step they had finished two minutes earlier.
     */
    audit.station = delivery.station;
    this.refreshInboundObjective();
    this.hud?.setSecurityAlert(`DELIVERIES RESOLVED ${audit.resolved}/${audit.total} // ACTIVE BADGE ${delivery.workerId}`);
    this.refreshCaseHud();
  }

  private spawnCase(data: GeneratedWarehouseCase | null): void {
    if (!data) return;
    this.clearCaseEntities();
    this.activeCase = data;
    this.evidence = emptyEvidence();
    this.decisionCommitted = false;
    this.visitorVerified = false;
    this.freightVerified = false;
    this.workerVerificationRequested = false;
    this.dockedCargo.length = 0;
    this.scannedCargo.clear();
    this.environment.resetTransferDocks();
    this.environment.configureTransferDock(data.assignedDoorId, data.definition.id === 'package-5018' ? 2 : 1);
    const internalBreach = data.definition.id === 'internal-breach';
    if (!internalBreach) {
      const cargo = WarehouseCargoNode.create({ name: `Cargo-${data.packageId}` });
      cargo.configure(data);
      cargo.position.copy(this.environment.packagePosition(data.aisle, data.bay));
      this.add(cargo);
      this.cargo = cargo;
    }
    if (data.definition.id === 'package-5018') {
      const duplicateData: GeneratedWarehouseCase = { ...data, measuredWeight: 50 };
      const duplicate = WarehouseCargoNode.create({ name: 'Cargo-5018-Duplicate' });
      duplicate.configure(duplicateData);
      duplicate.position.copy(this.environment.packagePosition(4, data.bay));
      this.add(duplicate);
      this.duplicateCargo = duplicate;
      this.environment.setDuplicateAisle(true);
    }
    const hasVisitor = data.definition.subjectType !== 'worker'
      && data.definition.id !== 'freight-sort'
      && !internalBreach;
    if (hasVisitor) {
      this.visitor = createWarehouseVisitor(seedFrom(data.visitorName), data.visitorName, data.assignedDoorId);
      this.add(this.visitor.root);
    }
    const occupiedIndex = WAREHOUSE_DOOR_IDS.indexOf(data.assignedDoorId);
    this.selectedDoor = WAREHOUSE_DOOR_IDS[(occupiedIndex + 1) % WAREHOUSE_DOOR_IDS.length];
    this.doorStatuses = { 'service-a': 'unseen', 'service-b': 'unseen', 'service-c': 'unseen' };
    this.doorEventAvailable = false;
    this.environment.resetServiceDoors();
    this.hud?.setReplayAvailable(false);
    this.hud?.setPursuit(false);
    this.hud?.setCctvTimestampOffset(0);
    if (internalBreach) {
      if (this.mode !== 'story') {
        this.inboundTimer = 3;
        this.inboundOpened = false;
        this.hud?.setInbound(this.inboundTimer);
      }
      this.prepareBreach();
    }
    else this.hud?.setIntrusion(null);
    this.refreshCaseHud();
    this.syncDoorHud();
    this.hud?.setBell(hasVisitor, hasVisitor ? 1 : 0);
    this.bellReminder = hasVisitor ? 20 : -1;
    if (hasVisitor) this.sound.play('bell');
    if (data.definition.id === 'package-5018') {
      this.sound.play('anomaly');
      adaptiveScore.setState('warehouse', 3);
    }
  }

  private clearCaseEntities(): void {
    if (this.pursuit) {
      this.pursuit.destroy();
      this.pursuit = null;
    }
    if (this.containmentResponse) {
      this.containmentResponse.destroy();
      this.containmentResponse = null;
    }
    this.intruder?.removeFromParent();
    this.intruder = null;
    this.intrusion = null;
    this.breachEntryTimer = -1;
    this.breachStarted = false;
    this.environment.resetSecurityZones();
    this.environment.setLightingMode('normal');
    this.environment.setRearDoorOpen(0);
    this.sound.setEmergency(false);
    for (const worker of this.workers) worker.resumeRoute();
    for (const cargo of this.inboundCargo) cargo.removeFromParent();
    this.inboundCargo.length = 0;
    this.inboundAudit = null;
    this.inboundIntakeCargo = null;
    this.inboundIntakeElapsed = 0;
    this.inboundFugitive = null;
    this.containmentPurpose = null;
    this.environment.setVerifiedIntakeState('idle');
    this.hud?.setIntrusion(null);
    this.environment.setPursuitLights(this.activeCase?.assignedDoorId ?? 'service-a', false);
    this.pursuitPhase = '';
    if (this.carried) {
      this.cargoRope.detach();
      this.carried.removeFromParent();
      this.carried = null;
    }
    this.cargo?.removeFromParent();
    this.cargo = null;
    this.deliveredCargo = null;
    this.duplicateCargo?.removeFromParent();
    this.duplicateCargo = null;
    this.dockedCargo.length = 0;
    this.scannedCargo.clear();
    this.environment.resetTransferDocks();
    this.environment.setDuplicateAisle(false);
    this.visitor?.root.removeFromParent();
    this.visitor = null;
  }

  private prepareBreach(): void {
    this.setWorkersVisible(false);
    for (const worker of this.workers) worker.resetToInbound();
    const intruder = WarehouseIntruderNode.create({ name: 'WarehouseInternalBreachSubject' });
    intruder.configure({
      onZoneChanged: (zone) => {
        if (this.zoneStatuses[zone] === 'unseen') this.zoneStatuses[zone] = 'motion';
        this.sound.play('footsteps');
        this.syncIntrusionHud();
      },
      onEscapeWarning: () => {
        this.sound.play('tamper');
        this.hud?.flash('SERVICE C EXIT TAMPER // 8 SECONDS TO CONTAIN', 3);
        this.syncIntrusionHud();
      },
      onEscaped: () => this.failBreach('CRITICAL BREACH // INTRUDER EXITED THROUGH SERVICE C'),
      onTagExpired: () => {
        this.hud?.flash('LIVE OPTICAL TAG EXPIRED // REACQUIRE SUBJECT', 2.2);
        this.syncIntrusionHud();
      },
    });
    this.add(intruder);
    this.intruder = intruder;
    this.selectedZone = 'receiving';
    this.zoneStatuses = {
      receiving: 'unseen',
      'storage-west': 'unseen',
      'storage-east': 'unseen',
      sortation: 'unseen',
    };
    this.intrusion = {
      phase: 'entry',
      currentZone: 'receiving',
      lastSeenZone: null,
      selectedZone: this.selectedZone,
      tagSeconds: 0,
      routeStep: 0,
      escapeSeconds: null,
      evidence: { rearHistory: false, headcount: false, liveTag: false },
      containedZone: null,
    };
    this.syncIntrusionHud();
    this.hud?.setBell(false, 0);
  }

  /**
   * Fly where you are looking.
   *
   * Movement used to be strictly horizontal - `forward` had its Y zeroed - and height was
   * three fixed bands on Q and E. So the mouse turned the camera and nothing else, and going
   * up meant stopping, tapping a key, and waiting for a damp. Asked for directly: the mouse
   * should move the drone up and down too.
   *
   * The forward vector carries the pitch now, so nosing up and holding W climbs, which is
   * what a drone does and what anybody who has flown one in any other game will try first.
   *
   * The vertical component is deliberately scaled to 0.62. At parity a full-pitch climb is as
   * fast as a full-speed dash down an aisle, which overshoots the rack you were aiming at
   * every time - the room is 26 metres long and 8 metres tall, so the axes are not equal and
   * the control should not pretend they are. Q and E still nudge, for fine height without
   * changing where the camera is pointed.
   */
  public drive(x: number, y: number, deltaTime: number): void {
    if (this.view !== 'drone' || this.handoff > 0 || this.finished || this.isCinematicActive()) {
      this.droneVelocity.set(0, 0, 0);
      this.throttle = 0;
      this.hud?.setSpeedLines(false);
      return;
    }
    const lift = Math.sin(this.pitch);
    const flat = Math.cos(this.pitch);
    const forward = new THREE.Vector3(Math.sin(this.yaw) * flat, lift * 0.62, Math.cos(this.yaw) * flat);
    const right = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const desired = forward.multiplyScalar(-y).addScaledVector(right, x);
    if (desired.lengthSq() > 1) desired.normalize();
    const inputStrength = desired.length();
    const nearWorker = this.workers.some((worker) => worker.visible && worker.position.distanceTo(this.drone.position) < 2.2);
    const speed = nearWorker ? DRONE_WORKER_SPEED : DRONE_CRUISE_SPEED;
    this.desiredDroneVelocity.copy(desired).multiplyScalar(speed);
    this.droneVelocityDelta.subVectors(this.desiredDroneVelocity, this.droneVelocity);
    const velocityDelta = this.droneVelocityDelta.length();
    const acceleration = inputStrength > 0.001 ? DRONE_ACCELERATION : DRONE_BRAKING;
    const maxVelocityChange = acceleration * Math.max(0, deltaTime);
    if (velocityDelta <= maxVelocityChange || velocityDelta < 0.0001) {
      this.droneVelocity.copy(this.desiredDroneVelocity);
    } else {
      this.droneVelocity.addScaledVector(this.droneVelocityDelta, maxVelocityChange / velocityDelta);
    }
    const previous = this.drone.position.clone();
    this.drone.position.addScaledVector(this.droneVelocity, deltaTime);
    this.drone.position.x = THREE.MathUtils.clamp(this.drone.position.x, WAREHOUSE_LAYOUT.drone.minX, WAREHOUSE_LAYOUT.drone.maxX);
    this.drone.position.z = THREE.MathUtils.clamp(this.drone.position.z, WAREHOUSE_LAYOUT.drone.minZ, WAREHOUSE_LAYOUT.drone.maxZ);
    /*
     * Y is clamped HERE, before the collision test, and that ordering is a fix and not a
     * tidiness. `constrainDrone` answers any out-of-bounds position by copying the whole
     * previous position back - x and z included - so a climb that nudged y a centimetre
     * over the ceiling froze the drone dead in the air. Pushing up while flying forward
     * cancelled the flying forward, which is most of what "the drone can't fly over the
     * racks" felt like from the stick.
     */
    this.drone.position.y = THREE.MathUtils.clamp(this.drone.position.y, 0.85, WAREHOUSE_LAYOUT.drone.maxY);
    this.environment.constrainDrone(this.drone.position, previous);
    /*
     * The height the stick asked for becomes the height it holds.
     *
     * It used to damp toward one of three authored bands every frame, which would have fought
     * the climb above and won - the drone would rise while W was held and sink straight back
     * the moment it was released. `altitude` is now a free target that pitched movement writes
     * to and Q/E nudge, and the damp still runs so the drone settles rather than snapping.
     */
    this.altitude = THREE.MathUtils.clamp(
      this.altitude + this.drone.position.y - previous.y,
      0.85,
      WAREHOUSE_LAYOUT.drone.maxY
    );
    this.drone.position.y = THREE.MathUtils.damp(this.drone.position.y, this.altitude, 7.5, deltaTime);
    if (deltaTime > 0) {
      this.droneVelocity.copy(this.drone.position).sub(previous).multiplyScalar(1 / deltaTime);
    }
    const actualSpeed = this.droneVelocity.length();
    this.throttle = Math.min(1, actualSpeed / DRONE_CRUISE_SPEED);
    const directionAligned = actualSpeed > 0.001 && inputStrength > 0.001
      ? this.droneVelocity.dot(desired) / (actualSpeed * inputStrength) > 0.96
      : false;
    const atCruise = !nearWorker
      && inputStrength > 0.95
      && directionAligned
      && this.throttle >= DRONE_CRUISE_VFX_THRESHOLD;
    this.hud?.setSpeedLines(
      atCruise && this.perspective === 'third' && !getAccessibilityPreferences().reducedMotion,
      (this.throttle - DRONE_CRUISE_VFX_THRESHOLD) / (1 - DRONE_CRUISE_VFX_THRESHOLD)
    );
    this.drone.rotation.y = this.yaw;
    this.droneVisual.rotation.z = THREE.MathUtils.damp(this.droneVisual.rotation.z, -x * 0.18, 8, deltaTime);
    /*
     * The body follows the mouse as well as the stick.
     *
     * The tilt used to come from thrust alone, so flying where you look left the hull dead
     * level while the camera pitched - a machine ignoring its own controls. Now the look
     * pitch carries into the airframe at about two thirds, on top of the thrust lean, and
     * the drone visibly noses up and down with the mouse. Two thirds rather than one to one
     * because the full 41 degrees of look range on a hovering quad reads as it falling over.
     *
     * This works because `drive` runs every frame with zeros when idle - the damp is always
     * live, so releasing the mouse settles the body back instead of freezing it mid-tilt.
     */
    this.droneVisual.rotation.x = THREE.MathUtils.damp(
      this.droneVisual.rotation.x,
      y * 0.11 - this.pitch * 0.65,
      8,
      deltaTime
    );
  }

  public look(dx: number, dy: number): void {
    if (this.view !== 'drone' || this.handoff > 0 || this.isCinematicActive()) return;
    this.yaw -= dx * 0.0022;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.0018, -0.72, 0.5);
  }

  public changeAltitude(direction: number): void {
    if (this.isCinematicActive()) return;
    this.altitude = THREE.MathUtils.clamp(
      this.altitude + Math.sign(direction) * 0.85,
      0.85,
      WAREHOUSE_LAYOUT.drone.maxY
    );
    // Metres, not a band name. Three names for a continuous value is a label that is wrong
    // most of the time, and the number is the thing a player navigating by aisle and bay
    // actually wants.
    this.hud?.flash(`ALTITUDE ${this.altitude.toFixed(1)}M`, 0.9);
  }

  public isDroneView(): boolean {
    return this.view === 'drone';
  }

  public shouldCapturePointer(): boolean {
    return this.view === 'drone' && !this.cursorControl;
  }

  /** Soft reset for a wedged approach; it costs service time, never integrity. */
  public recover(): void {
    if (this.finished || this.isCinematicActive()) return;
    if (this.carried) {
      const cargo = this.carried;
      this.cargoRope.detach();
      cargo.position.copy(this.cargoHome(cargo));
      cargo.quaternion.identity();
      cargo.carried = false;
      this.carried = null;
    }
    for (const staged of this.dockedCargo.splice(0)) {
      staged.node.position.copy(this.cargoHome(staged.node));
      staged.node.quaternion.identity();
      staged.node.carried = false;
    }
    this.environment.configureTransferDock(
      this.activeCase?.assignedDoorId ?? 'service-a',
      this.activeCase?.definition.id === 'package-5018' ? 2 : 1
    );
    this.drone.position.copy(DRONE_START);
    this.droneVelocity.set(0, 0, 0);
    this.throttle = 0;
    this.hud?.setSpeedLines(false);
    this.yaw = Math.PI;
    this.pitch = -0.04;
    this.altitude = ALTITUDES[1];
    this.setOpticalAim(false);
    this.perspective = 'third';
    this.cameraArmDistance = THIRD_PERSON_DISTANCE;
    this.elapsed += 12;
    this.sound.play('warning');
    this.hud?.flash('SERVICE RECOVERY COMPLETE // UNCOMMITTED LOADS RESTORED // +12 SECONDS', 2.2);
    this.refreshCaseHud();
  }

  /** Move to a view and bring the HUD and the pointer with it. */
  private applyView(view: WarehouseView): void {
    this.view = view;
    this.hud?.setView(view);
    this.syncPointerMode();
  }

  /**
   * TAB: the console, on or off.
   *
   * ## Why this is a toggle and not a cycle
   *
   * It used to run `drone -> cctv -> console -> drone`, one key for three views, and the
   * cost of that was reported as a question nobody should have to ask: "which button do I
   * press to get back to my drone?" There was no answer, because the answer depended on
   * where you were standing - two presses from the drone to the console, one press back,
   * two presses from a camera. A cycle makes every transition cost a different, invisible
   * number of presses, and the player has to hold the ring in their head to plan a move.
   *
   * There are really two questions being asked, and they are independent: am I flying or
   * talking, and which camera am I watching. So they get a key each. TAB owns the first -
   * one press, either direction, from anywhere. `cycleDoor` owns the second.
   *
   * From a door camera TAB goes to the console rather than the drone, which keeps the rule
   * simple: TAB always means "the console, or away from it". Getting back to the drone from
   * a camera is C's job, because C is the key that put you there.
   */
  public toggleConsole(): void {
    if (this.isCinematicActive()) return;
    this.setOpticalAim(false);
    const next: WarehouseView = this.view === 'console' ? 'drone' : 'console';
    this.applyView(next);
    this.sound.play('camera');
    this.hud?.flash(next === 'console' ? 'CONSOLE // RECORDS AND CHAT' : 'DRONE 07 // LIVE', 1.1);
  }

  /**
   * C: step through the feeds, with the drone as the last stop.
   *
   * The ring is the three service cameras and then the drone - A, B, C, drone, A - so the
   * key that takes you out to the doors is also the key that brings you home, and holding C
   * walks the whole loop back to where it started. Before this it cycled the three cameras
   * forever with no exit, which is why leaving a camera meant reaching for TAB and pressing
   * it a number of times that depended on which view you had left.
   *
   * The drone counts as a position in the ring rather than a special case, so stepping
   * backwards off door A lands on the drone exactly as stepping forwards off door C does.
   * The breach case rings its four security zones the same way.
   */
  public cycleDoor(direction: number): void {
    if (this.isCinematicActive() || this.finished) return;
    const step = Math.sign(direction) || 1;
    const ring = this.isBreachCase() ? WAREHOUSE_SECURITY_ZONE_IDS : WAREHOUSE_DOOR_IDS;
    // Anywhere that is not a camera counts as the drone slot: pressing C from the console
    // should reach the first feed, not do nothing.
    const current = this.view === 'cctv'
      ? Math.max(0, (ring as readonly string[]).indexOf(this.isBreachCase() ? this.selectedZone : this.selectedDoor))
      : ring.length;
    const next = (current + step + ring.length + 1) % (ring.length + 1);
    if (next === ring.length) {
      this.setOpticalAim(false);
      this.applyView('drone');
      this.sound.play('camera');
      this.hud?.flash('DRONE 07 // LIVE', 1.1);
      return;
    }
    if (this.isBreachCase()) {
      this.selectZone(WAREHOUSE_SECURITY_ZONE_IDS[next]);
      return;
    }
    this.selectedDoor = WAREHOUSE_DOOR_IDS[next];
    if (this.view !== 'cctv') this.applyView('cctv');
    this.sound.play('camera');
    this.inspectSelectedDoor();
  }

  public selectDoor(door: WarehouseDoorId): void {
    if (this.isCinematicActive() || this.finished || this.isBreachCase()) return;
    this.selectedDoor = door;
    if (this.view !== 'cctv') {
      this.view = 'cctv';
      this.hud?.setView(this.view);
      this.syncPointerMode();
    }
    this.sound.play('camera');
    this.inspectSelectedDoor();
  }

  public selectZone(zone: WarehouseSecurityZoneId): void {
    if (!this.isBreachCase() || this.isCinematicActive() || this.finished) return;
    this.selectedZone = zone;
    if (this.intrusion) this.intrusion.selectedZone = zone;
    if (this.view !== 'cctv') {
      this.view = 'cctv';
      this.hud?.setView(this.view);
      this.syncPointerMode();
    }
    this.sound.play('camera');
    this.inspectSelectedZone();
  }

  private inspectSelectedZone(): void {
    const intruder = this.intruder;
    if (!intruder || !this.intrusion || !this.breachStarted) {
      this.hud?.flash(`${warehouseZoneLabel(this.selectedZone)} FEED // STANDBY`);
      return;
    }
    if (intruder.currentZone === this.selectedZone && intruder.phase !== 'contained') {
      intruder.observe();
      intruder.lastSeenZone = this.selectedZone;
      this.zoneStatuses[this.selectedZone] = 'contact';
      this.hud?.flash(`${warehouseZoneLabel(this.selectedZone)} // UNLISTED PERSON IN FRAME`, 1.6);
    } else if (this.zoneStatuses[this.selectedZone] === 'unseen' || this.zoneStatuses[this.selectedZone] === 'motion') {
      this.zoneStatuses[this.selectedZone] = 'clear';
      this.hud?.flash(`${warehouseZoneLabel(this.selectedZone)} // CLEAR`, 1.1);
    }
    this.syncIntrusionHud();
  }

  private inspectSelectedDoor(): void {
    const active = this.activeCase;
    if (!active) return;
    const hasVisitor = active.definition.subjectType !== 'worker' && active.definition.id !== 'freight-sort';
    if (!hasVisitor || this.selectedDoor !== active.assignedDoorId) {
      if (this.doorStatuses[this.selectedDoor] === 'unseen') {
        this.doorStatuses[this.selectedDoor] = 'clear';
        this.environment.setServiceDoorStatus(this.selectedDoor, 'clear');
      }
      this.syncDoorHud();
      this.hud?.flash(`${this.doorLabel(this.selectedDoor)} // CLEAR`, 1.1);
      return;
    }
    this.evidence.located = true;
    /*
     * A legitimate service feed includes the door's credential reader, not merely a picture
     * of somebody standing outside. Requiring a second LMB scan after the player has found
     * the correct feed left the console saying VISITOR RECORD REQUIRED while already naming
     * that visitor and their assigned door. The feed inspection is the visitor record.
     *
     * Tamper cases deliberately keep the stronger optical requirement: locating a subject
     * who is forcing a hatch is not the same thing as establishing their credential.
     */
    if (!active.doorTamper) this.evidence.visitor = true;
    const status: WarehouseDoorStatus = active.doorTamper ? 'tamper' : 'contact';
    this.doorStatuses[this.selectedDoor] = status;
    this.environment.setServiceDoorStatus(this.selectedDoor, status);
    this.hud?.setBell(true, 1, this.doorLabel(this.selectedDoor));
    this.bellReminder = -1;
    if (active.doorTamper && !this.doorEventAvailable) {
      // Evidence is authored before animation playback so a missing or incompatible clip
      // can never make the case unwinnable.
      this.evidence.action = true;
      this.doorEventAvailable = true;
      this.visitor?.rig.gesture('open');
      this.sound.play('tamper');
      this.hud?.setReplayAvailable(true);
      this.hud?.flash('PRE-AUTHORIZATION HATCH INTERACTION RECORDED // REPLAY AVAILABLE', 2.6);
    } else {
      this.hud?.flash(`${this.doorLabel(this.selectedDoor)} // CONTACT + CREDENTIAL RECORDED`, 1.8);
    }
    this.syncDoorHud();
    this.refreshCaseHud();
  }

  private replayDoorEvent(): void {
    if (!this.doorEventAvailable || !this.visitor || this.isCinematicActive()) return;
    this.selectedDoor = this.activeCase?.assignedDoorId ?? this.selectedDoor;
    this.view = 'cctv';
    this.visitor.rig.gesture('open');
    this.sound.play('tamper');
    this.syncDoorHud();
    this.hud?.setView(this.view);
    this.hud?.flash('RECORDED EVENT // PRE-AUTHORIZATION HATCH TEST', 2.1);
    this.syncPointerMode();
  }

  /**
   * Step the opening sweep along the chip row.
   *
   * The sweep drives `selectedDoor` rather than holding a camera of its own, so the chip
   * row, the feed caption and the shot all agree without any of them being told about the
   * intro. It deliberately does NOT call `inspectSelectedDoor`: inspecting marks an empty
   * door CLEAR, and an intro that clears two of the three doors on the way past has solved
   * the mission before the player has touched anything.
   */
  private updateIntroSweep(): void {
    if (!this.introSweepEnabled || this.handoff <= 0) return;
    const last = WAREHOUSE_DOOR_IDS.length - 1;
    const index = THREE.MathUtils.clamp(last - Math.floor(this.handoff / INTRO_BEAT_SECONDS), 0, last);
    if (index === this.introBeat) return;
    if (this.introReturnDoor === null) this.introReturnDoor = this.selectedDoor;
    this.introBeat = index;
    this.selectedDoor = WAREHOUSE_DOOR_IDS[index];
    this.syncDoorHud();
    this.sound.play('camera');
    this.hud?.flash(`${this.doorLabel(this.selectedDoor)} // FEED LIVE`, 1.1);
  }

  private syncDoorHud(): void {
    const states: WarehouseDoorSnapshot[] = WAREHOUSE_DOOR_IDS.map((id) => ({
      id,
      status: this.doorStatuses[id],
      selected: id === this.selectedDoor,
    }));
    this.hud?.setDoorStates(states);
  }

  /** Warehouse-only A/B hook; post-processing is switched by the owning Omniscient rig. */
  public setCelVisualsEnabled(enabled: boolean, announce = true): void {
    this.celVisualsEnabled = enabled;
    this.environment.setCelStyleEnabled(enabled);
    this.celStyle.setEnabled(this, enabled);
    if (announce) {
      this.hud?.flash(
        enabled
          ? 'VISUAL PROTOTYPE // CEL SHADE + OCCLUDED INK + SUBTLE CRT'
          : 'VISUAL PROTOTYPE // ORIGINAL WAREHOUSE LOOK',
        2.2
      );
    }
  }

  private dockSnapshot(): WarehouseDockSnapshot | null {
    const active = this.activeCase;
    if (!active || active.definition.subjectType === 'worker' || active.definition.id === 'freight-sort' || active.definition.id === 'internal-breach') return null;
    const staged = this.dockedCargo.filter((entry) => entry.doorId === active.assignedDoorId);
    return {
      doorId: active.assignedDoorId,
      state: this.environment.transferDockState(active.assignedDoorId),
      stagedPackageIds: staged.map((entry) => entry.node.caseData?.packageId ?? active.packageId),
      capacity: this.environment.transferDockCapacity(active.assignedDoorId),
      requiredCount: active.definition.id === 'package-5018' ? 2 : 1,
    };
  }

  private refreshCaseHud(): void {
    if (!this.activeCase) return;
    this.hud?.showCase(this.activeCase, this.evidence, this.intrusion, this.dockSnapshot(), this.inboundAudit);
  }

  private syncIntrusionHud(): void {
    const intruder = this.intruder;
    const intrusion = this.intrusion;
    const active = this.activeCase;
    if (!intruder || !intrusion || !active) return;
    intrusion.phase = this.containmentResponse ? 'response' : intruder.phase;
    intrusion.currentZone = intruder.currentZone;
    intrusion.lastSeenZone = intruder.lastSeenZone;
    intrusion.selectedZone = this.selectedZone;
    intrusion.tagSeconds = intruder.tagSeconds;
    intrusion.routeStep = intruder.routeStep;
    intrusion.escapeSeconds = intruder.escapeSeconds;
    const states: WarehouseSecurityZoneSnapshot[] = WAREHOUSE_SECURITY_ZONE_IDS.map((id) => ({
      id,
      status: this.zoneStatuses[id],
      selected: id === this.selectedZone,
    }));
    this.hud?.setIntrusion(intrusion, states);
    this.refreshCaseHud();
  }

  private isBreachCase(): boolean {
    return this.activeCase?.definition.id === 'internal-breach';
  }

  /**
   * The inbound audit normally keeps the familiar door-camera ring. Once its authored
   * impostor has been contained, however, the response vignette is an interior security
   * feed. Treating it like an ordinary freight case left the camera parked outside a
   * service door while the worker and responding officer performed off-screen.
   */
  private usesInboundResponseCamera(): boolean {
    return this.activeCase?.definition.id === 'freight-sort'
      && this.inboundAudit?.phase === 'police-response';
  }

  private isCinematicActive(): boolean {
    return this.pursuit !== null || this.containmentResponse !== null;
  }

  private doorLabel(id: WarehouseDoorId): string {
    const door = WAREHOUSE_DOORS[id];
    return `SERVICE ${door.letter} // ${door.place}`;
  }

  public setOpticalAim(active: boolean): boolean {
    if (active && (
      this.finished
      || this.isCinematicActive()
      || this.view !== 'drone'
      || this.cursorControl
    )) return false;
    if (this.opticalAimHeld === active) return true;
    this.opticalAimHeld = active;
    this.perspective = active ? 'first' : 'third';
    if (!active) this.cameraArmDistance = THIRD_PERSON_DISTANCE;
    this.hud?.setOpticalAim(active);
    if (active) this.sound.play('camera');
    return true;
  }

  public scanFromOpticalInput(): void {
    if (!this.opticalAimHeld || this.view !== 'drone') {
      this.hud?.flash('HOLD RIGHT MOUSE FOR OPTICAL VIEW // LEFT CLICK TO SCAN', 1.5);
      return;
    }
    this.scan();
  }

  /*
   * `toggleInputMode` and the M binding were removed.
   *
   * It released the mouse cursor so the operations panel could be clicked without leaving
   * drone view, and it was reported as "the key that toggles first and third person" -
   * which it was not, and which is the interesting part. Right mouse enters the optical
   * first-person view and releasing it was supposed to leave; releasing it did nothing,
   * because the engine binds `mouseup` to the renderer canvas while this game puts a
   * console over that canvas. M happened to call `setOpticalAim(false)` on its way past,
   * so it became the only reliable way out of first person, and it got learned as that.
   *
   * Two controls that both half-did the same job, one of them by accident. With the release
   * fixed at the window, TAB covers the rest on its own: drone view captures the pointer
   * because the mouse is aiming a camera, and CCTV and console views release it because the
   * mouse is pointing at an interface. Nobody has to know a key for that.
   *
   * The CURSOR button went with it. It lived in the actions row and was unclickable in the
   * one state where it was needed, because a locked pointer cannot click anything.
   */

  public cycleTool(direction: number): void {
    if (!this.tools.length) return;
    const current = Math.max(0, this.tools.indexOf(this.activeTool));
    this.activeTool = this.tools[(current + this.tools.length + Math.sign(direction)) % this.tools.length];
    this.hud?.setTools(this.tools, this.activeTool);
    this.hud?.flash(`${this.activeTool.toUpperCase()} CHANNEL ACTIVE`, 1.2);
  }

  private replyToOperator(text: string): WarehouseChatReply {
    const active = this.activeCase;
    if (!active) {
      return { name: 'WAREHOUSE 07', body: 'No active manifest is linked.', source: 'system' };
    }
    const query = text.toLowerCase();
    if (active.definition.id === 'internal-breach' && this.intrusion) {
      if (query.includes('history') || query.includes('rear') || query.includes('entry')) {
        this.intrusion.evidence.rearHistory = true;
        this.evidence.action = true;
        this.syncIntrusionHud();
        return {
          name: 'REAR CAMERA ARCHIVE',
          body: 'Inbound replay confirms one unlisted person entering behind the final pallet worker before shutter closure.',
          source: 'system',
        };
      }
      if (query.includes('count') || query.includes('manifest') || query.includes('personnel') || query.includes('beam')) {
        this.intrusion.evidence.headcount = true;
        this.evidence.authorization = true;
        this.syncIntrusionHud();
        return {
          name: 'PERSONNEL CONTROL',
          body: 'Rear beam count: 6 bodies. Authorized inbound roster: 5. MANIFEST MISMATCH // +1 UNLISTED.',
          source: 'system',
        };
      }
      if (query.includes('tag') || query.includes('optical') || query.includes('identity')) {
        return {
          name: 'OPTICAL CONTROL',
          body: this.intruder?.tagSeconds
            ? `Live tag active. Last sector: ${warehouseZoneLabel(this.intruder.lastSeenZone ?? this.intruder.currentZone)}. ${this.intruder.tagSeconds.toFixed(1)} seconds remain.`
            : 'Select the interior feed containing the unlisted person, or acquire them directly with the drone, then scan to create a ten-second live tag.',
          source: 'system',
        };
      }
      if (query.includes('sector') || query.includes('telemetry') || query.includes('zone') || query.includes('door')) {
        return {
          name: 'SECURITY CONTROL',
          body: this.intruder?.lastSeenZone
            ? `Last optical contact: ${warehouseZoneLabel(this.intruder.lastSeenZone)}. Containment requires a currently live tag and all three evidence records.`
            : 'Interior feeds available: Receiving, Storage West, Storage East, and Sortation. Cycle with C.',
          source: 'system',
        };
      }
      return {
        name: 'WAREHOUSE 07',
        body: 'Query rear camera history, personnel count, optical tag, or sector telemetry. Intruder movement pauses while this console is open.',
        source: 'system',
      };
    }
    if (query.includes('help') || query.includes('command')) {
      return {
        name: 'WAREHOUSE 07',
        body: 'Query package, visitor identity, manifest, weight, security seal, or door telemetry. Physical decisions remain on the Console tab.',
        source: 'system',
      };
    }
    if (query.includes('door') || query.includes('camera') || query.includes('entrance') || query.includes('telemetry')) {
      if (!this.evidence.located) {
        return { name: 'PERIMETER CONTROL', body: 'Source unresolved. Inspect Service A, B, and C camera feeds.', source: 'system' };
      }
      if (!this.evidence.visitor) {
        return {
          name: 'PERIMETER CONTROL',
          body: `${this.doorLabel(active.assignedDoorId)} is occupied. Acquire the visitor credential, declared load, and assigned-door record.`,
          source: 'system',
        };
      }
      return {
        name: 'PERIMETER CONTROL',
        body: active.doorTamper && this.evidence.tamper
          ? `${this.doorLabel(active.assignedDoorId)} recorded a credential-reader bypass and cargo-hatch force event.`
          : `${this.doorLabel(active.assignedDoorId)} is occupied. Assigned transfer: ${this.doorLabel(active.assignedDoorId)}.`,
        source: 'system',
      };
    }
    if (query.includes('visitor') || query.includes('identity') || query.includes('name') || query.includes('id')) {
      if (active.definition.subjectType !== 'worker' && !this.evidence.located) {
        return { name: 'WAREHOUSE 07', body: 'Visitor identity withheld until the perimeter source is located.', source: 'system' };
      }
      if (active.definition.subjectType === 'worker') {
        return { name: 'PERSONNEL CONTROL', body: `Active temporary worker: ${active.workerName}. Scan their badge for roster comparison.`, source: 'system' };
      }
      return {
        name: active.visitorName,
        body: active.visitorIntent === 'intrusion'
          ? 'The outside subject does not answer the secure channel.'
          : active.definition.id === 'package-5018'
          ? 'My collection reference is 5018. I will remain outside while you request human verification.'
          : `I am ${active.visitorName}. My collection reference is ${active.packageId}.`,
        source: active.visitorIntent === 'intrusion' ? 'system' : 'visitor',
      };
    }
    if (query.includes('weight') || query.includes('mass')) {
      return {
        name: 'MANIFEST CONTROL',
        body: this.evidence.cargo
          ? `Expected ${active.expectedWeight.toFixed(1)} kilograms. Optical station reports ${active.measuredWeight.toFixed(1)} kilograms.`
          : `Expected mass is ${active.expectedWeight.toFixed(1)} kilograms. Acquire a scan for measured mass.`,
        source: 'system',
      };
    }
    if (query.includes('seal') || query.includes('security')) {
      return {
        name: 'SECURITY CONTROL',
        body: !this.evidence.cargo
          ? 'No current security reading. Acquire an optical scan.'
          : active.definition.anomaly === 'seal'
            ? 'Seal discontinuity detected. Preserve the package and compare the record.'
            : 'Seal record is valid on the active scan.',
        source: 'system',
      };
    }
    if (query.includes('package') || query.includes('manifest') || query.includes('aisle') || query.includes('bay')) {
      return {
        name: 'MANIFEST CONTROL',
        body: this.evidence.cargo
          ? `Package ${active.packageId}; recipient ${active.packageRecipientName}; inbound status ${active.inboundStatus.toUpperCase()}; aisle ${active.aisle}, bay ${String(active.bay).padStart(2, '0')}.`
          : `Package ${active.packageId} is listed at aisle ${active.aisle}, bay ${String(active.bay).padStart(2, '0')}. Scan the carton to reveal recipient and inbound status.`,
        source: 'system',
      };
    }
    return {
      name: 'WAREHOUSE 07',
      body: 'No matching record. Query package, visitor identity, manifest, weight, security seal, door telemetry, or help.',
      source: 'system',
    };
  }

  private syncPointerMode(): void {
    const manager = this.getWorld()?.inputManager;
    const capture = this.shouldCapturePointer();
    if (!capture && this.opticalAimHeld) this.setOpticalAim(false);
    this.hud?.setCursorMode(!capture);
    if (capture) {
      setCursorVisible(false);
      manager?.requestPointerLock({ unadjustedMovement: true });
      return;
    }
    manager?.exitPointerLock();
    setCursorVisible(true);
  }

  public controllerDecision(direction: 'up' | 'down' | 'left' | 'right'): void {
    /*
     * Left and right are the camera ring wherever a camera is the thing on screen, which
     * now includes the drone - otherwise the pad lost its only route out to the doors when
     * Y stopped cycling views. Verdicts keep left and right on the console, which is where
     * a verdict is actually issued, and keep up and down everywhere.
     */
    if (this.view !== 'console' && (direction === 'left' || direction === 'right')) {
      this.cycleDoor(direction === 'right' ? 1 : -1);
      return;
    }
    const active = this.activeCase;
    if (!active) return;
    if (active.definition.id === 'internal-breach') {
      const zones = {
        up: 'receiving',
        left: 'storage-west',
        right: 'storage-east',
        down: 'sortation',
      } as const;
      if (this.view === 'console') this.tryContainZone(zones[direction]);
      else this.selectZone(zones[direction]);
      return;
    }
    if (active.definition.correctDecision === 'deny-lockdown') {
      if (direction === 'left') this.tryDecision('deny-lockdown');
      else if (direction === 'down') this.tryDecision('return');
      else this.tryDecision('release');
      return;
    }
    if (active.definition.id === 'freight-sort') {
      if (direction === 'down') this.tryDecision('return');
      else if (direction === 'left' || direction === 'up') this.tryDecision('deny-lockdown');
      return;
    }
    if (active.definition.id === 'package-5018') {
      const decisions = { left: 'verify', up: 'release', right: 'quarantine', down: 'return' } as const;
      this.tryDecision(decisions[direction]);
      return;
    }
    if (active.definition.subjectType === 'worker') {
      const decisions = { up: 'clear', right: 'hold', down: 'verify', left: 'verify' } as const;
      this.tryDecision(decisions[direction]);
      return;
    }
    const decisions = { up: 'release', right: 'quarantine', down: 'return', left: 'return' } as const;
    this.tryDecision(decisions[direction]);
  }

  public activateNumber(index: number): void {
    if (this.isBreachCase()) {
      const zone = WAREHOUSE_SECURITY_ZONE_IDS[Math.max(0, Math.min(3, index))];
      if (this.view === 'console') this.tryContainZone(zone);
      else this.selectZone(zone);
      return;
    }
    const decisions: readonly WarehouseConsoleAction[] = ['release', 'quarantine', 'return', 'clear', 'hold', 'verify'];
    const decision = decisions[index];
    if (decision) this.tryDecision(decision);
  }

  public scan(): void {
    if (!this.activeCase || this.handoff > 0 || this.finished || this.isCinematicActive()) return;
    if (this.view === 'console') {
      this.hud?.flash('CONSOLE HOLDS RECORDS // ACQUIRE SUBJECT THROUGH DRONE OR CCTV');
      return;
    }
    if (this.activeCase.definition.id === 'internal-breach') {
      this.scanIntruder();
      return;
    }
    if (this.activeCase.definition.subjectType === 'worker') {
      const worker = this.workers.find((entry) => entry.visible && !entry.authorized) ?? this.workers.find((entry) => entry.visible);
      if (!worker) {
        this.hud?.flash('NO PERSONNEL TARGET IN FRAME');
        return;
      }
      this.evidence.visitor = true;
    } else if (this.activeCase.definition.id === 'freight-sort') {
      if (!this.scanInboundAudit()) return;
    } else if (this.view === 'cctv') {
      this.inspectSelectedDoor();
      if (this.selectedDoor !== this.activeCase.assignedDoorId || !this.evidence.located) {
        this.hud?.flash(`${this.doorLabel(this.selectedDoor)} // NO VISITOR TARGET`);
        return;
      }
      this.evidence.visitor = true;
      if (this.activeCase.doorTamper) this.evidence.tamper = true;
    } else {
      if (this.nearestCargoDistance() > 10) {
        this.hud?.flash(`TARGET DISTANT // AISLE ${this.activeCase.aisle} BAY ${String(this.activeCase.bay).padStart(2, '0')}`);
        return;
      }
      const droneAt = this.drone.getWorldPosition(new THREE.Vector3());
      const scanned = [this.cargo, this.duplicateCargo]
        .filter((entry): entry is WarehouseCargoNode => entry !== null)
        .sort((a, b) => a.getWorldPosition(new THREE.Vector3()).distanceTo(droneAt) - b.getWorldPosition(new THREE.Vector3()).distanceTo(droneAt))[0];
      if (scanned) this.scannedCargo.add(scanned);
      this.evidence.cargo = this.activeCase.definition.id === 'package-5018'
        ? this.scannedCargo.size >= 2
        : this.scannedCargo.size >= 1;
    }
    if (this.activeCase.definition.id === 'door-tamper') {
      this.evidence.authorization = this.evidence.visitor && this.evidence.cargo;
    }
    this.sound.play('scan');
    this.hud?.pulseScan();
    this.pulseScanAt(this.scanSubjectPosition());
    const container = this.getWorld()?.gameContainer;
    if (container) {
      void captureWarehouseFrame(container, {
        caseId: this.activeCase.definition.id,
        packageId: this.activeCase.packageId,
        mode: this.mode,
        stage: this.stage,
        channel: this.activeTool,
      }).then((record) => {
        if (!record) return;
        const updated = updateWarehouseSave((save) => {
          const key = warehouseArchiveKey(record);
          save.archiveRecords = [
            ...save.archiveRecords.filter((entry) => warehouseArchiveKey(entry) !== key),
            record,
          ].slice(-32);
        });
        this.hud?.setRecords(updated.archiveRecords);
      });
    }
    if (this.activeCase.definition.id === 'package-5018') {
      const primaryDistance = this.cargo
        ? this.drone.position.distanceTo(this.cargo.position)
        : Number.POSITIVE_INFINITY;
      const duplicateDistance = this.duplicateCargo
        ? this.drone.position.distanceTo(this.duplicateCargo.position)
        : Number.POSITIVE_INFINITY;
      const migration = Math.sin(this.elapsed * 0.7) * 8;
      this.hud?.showCase(
        {
          ...this.activeCase,
          measuredWeight: duplicateDistance < primaryDistance ? 40 - migration : 40 + migration,
        },
        this.evidence,
        this.intrusion,
        this.dockSnapshot()
      );
    } else {
      this.refreshCaseHud();
    }
    const toolRequired = this.activeCase.definition.requiredTools.find((tool) => !['optical', this.activeTool].includes(tool));
    if (toolRequired && this.activeTool !== toolRequired) this.hud?.flash(`${toolRequired.toUpperCase()} CHANNEL REQUIRED TO COMPLETE COMPARISON`);
    else if (this.activeCase.definition.id === 'door-tamper') {
      const count = Number(this.evidence.action) + Number(this.evidence.authorization) + Number(this.evidence.tamper);
      this.hud?.flash(`EVIDENCE STACK ${count} / 3 // ${count === 3 ? 'DENY + LOCKDOWN ENABLED' : 'CONTINUE COMPARISON'}`, 2.2);
    } else if (this.activeCase.definition.id === 'package-5018' && !this.evidence.cargo) {
      this.hud?.flash(`5018 OPTICAL RECORDS ${this.scannedCargo.size}/2 // SCAN BOTH PHYSICAL LOADS`, 2.2);
    } else if (this.evidence.visitor && this.evidence.cargo) {
      this.hud?.flash(`VISITOR + PACKAGE VERIFIED // DOCK AT ${this.doorLabel(this.activeCase.assignedDoorId)}`, 2.1);
    } else {
      this.hud?.flash('EVIDENCE RECORDED // ACQUIRE THE SECOND SUBJECT RECORD', 1.8);
    }
  }

  /**
   * Where the scan just landed, in world space.
   *
   * The rings are placed on the SUBJECT rather than at a fixed distance down the barrel,
   * because the point of the effect is to say which thing the machine read. A pulse that
   * always appears three metres ahead would confirm that a button was pressed and nothing
   * about what it was pressed on.
   *
   * The fallback is the only case where that is not possible - a console or CCTV scan has no
   * subject in the drone's view - and there it sits just ahead of the lens so the verb still
   * registers rather than passing in silence.
   */
  /**
   * What the optical view marks: things the machine has ALREADY established.
   *
   * The rule, and it is a design decision rather than a rendering one: never the unfound
   * target. Outlining the package before the player has located it would delete the search the
   * whole mission is built on - hold the button, see a glowing box, fly to it - which is a
   * worse game bought with a cheaper convenience.
   *
   * So this marks the places the player has been TOLD about and now has to go back to: the
   * three decision stations, the launch cradle, and the active subject only once the evidence
   * says it has been found. It answers "where do I take this" and "where was that again", and
   * never "where is it".
   */
  private opticalTargets(): Array<{ at: THREE.Vector3; scale: number }> {
    const marks: Array<{ at: THREE.Vector3; scale: number }> = [];
    /*
     * Converted to WORLD, because setTargets takes world and these do not start there.
     *
     * stationPositions and the cradle are rig-LOCAL, while scanSubjectPosition below returns
     * world - so a list built from both is a list in two different spaces. The first version
     * did exactly that, and every bracket vanished: the feedback module rebases what it is
     * handed, so the local ones were pushed a further 800m down. Same trap as the scan rings,
     * caught the same way, which is why the whole list is normalised at the source rather than
     * fixed downstream.
     */
    const rig = this as unknown as THREE.Object3D;
    /*
     * Brackets grow with distance so they stay the same size ON SCREEN.
     *
     * At a fixed world size the far stations shrank to a few pixels, which is the opposite of
     * what a tracking aid is for - the thing you most need marked is the thing across the
     * building. Scaling with range is what every reticle does, and the clamp keeps it from
     * swallowing the object when the drone is right on top of it.
     *
     * Distance is measured in LOCAL space against the composed camera, because both live in
     * the rig's frame; only the final position is converted to world, which is what setTargets
     * takes.
     */
    const bracket = (local: THREE.Vector3, base: number): { at: THREE.Vector3; scale: number } => ({
      at: rig.localToWorld(local.clone()),
      scale: THREE.MathUtils.clamp(this.cameraPosition.distanceTo(local) * 0.2, 0.8, 3.4) * base,
    });
    for (const station of Object.values(this.environment.stationPositions)) {
      marks.push(bracket(station.clone().setY(1.35), 1));
    }
    marks.push(bracket(WAREHOUSE_LAYOUT.cradle.clone().setY(0.9), 0.8));

    /*
     * The subject joins the list only after it has been scanned. `evidence.cargo` and
     * `evidence.visitor` are the machine's own record of having identified something, so
     * gating on them means the bracket appears at the moment the mission says the drone knows
     * what it is looking at - which is exactly when a tracking aid stops being a spoiler.
     */
    const found = this.evidence.cargo || this.evidence.visitor;
    if (found) {
      const subject = this.scanSubjectPosition();
      const subjectLocal = rig.worldToLocal(subject.clone()).setY(rig.worldToLocal(subject.clone()).y + 0.6);
      marks.push(bracket(subjectLocal, 0.9));
    }
    return marks;
  }

  private scanSubjectPosition(): THREE.Vector3 {
    const scratch = new THREE.Vector3();
    if (this.activeCase?.definition.id === 'freight-sort' && this.inboundAudit) {
      if (this.inboundAudit.phase === 'fugitive-search' || this.inboundAudit.phase === 'police-response') {
        return this.inboundFugitive?.subjectPosition()
          ?? this.workers[this.inboundAudit.activeIndex]?.subjectPosition()
          ?? this.lastInboundScanSubject.clone();
      }
      return this.lastInboundScanSubject.lengthSq() > 0
        ? this.lastInboundScanSubject.clone()
        : this.workers[this.inboundAudit.activeIndex]?.subjectPosition() ?? scratch;
    }
    if (this.intruder?.visible) return this.intruder.getWorldPosition(scratch);
    if (this.activeCase?.definition.subjectType === 'worker') {
      const worker = this.workers.find((entry) => entry.visible && !entry.authorized)
        ?? this.workers.find((entry) => entry.visible);
      if (worker) return worker.getWorldPosition(scratch);
    }
    const cargo = [this.cargo, this.duplicateCargo].find((entry): entry is WarehouseCargoNode => entry !== null);
    if (cargo) return cargo.getWorldPosition(scratch);
    return this.droneLensPosition().addScaledVector(this.droneForward(), 2.6);
  }

  /** Roughly where the eye sits, so the ping leaves the lens instead of the airframe centre. */
  private droneLensPosition(): THREE.Vector3 {
    return this.drone.getWorldPosition(new THREE.Vector3()).addScaledVector(this.droneForward(), 0.42);
  }

  private droneForward(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  private pulseScanAt(target: THREE.Vector3): void {
    this.feedback.scanPulse(this.droneLensPosition(), target);
  }

  private scanIntruder(): void {
    const intruder = this.intruder;
    const intrusion = this.intrusion;
    if (!intruder || !intrusion || !this.breachStarted) {
      this.hud?.flash('SECURITY SEARCH HAS NOT STARTED');
      return;
    }
    if (this.activeTool === 'history') {
      if (this.view !== 'cctv' || this.selectedZone !== 'receiving') {
        this.hud?.flash('REAR CAMERA HISTORY IS AVAILABLE ON THE RECEIVING FEED');
        return;
      }
      intrusion.evidence.rearHistory = true;
      this.evidence.action = true;
      this.sound.play('scan');
      this.hud?.pulseScan();
      this.pulseScanAt(this.scanSubjectPosition());
      this.hud?.flash('REAR ENTRY HISTORY // UNLISTED PERSON RECORDED', 2.3);
      this.syncIntrusionHud();
      return;
    }
    let acquired = false;
    if (this.view === 'cctv') {
      acquired = intruder.currentZone === this.selectedZone;
    } else {
      const position = intruder.getWorldPosition(new THREE.Vector3());
      const toTarget = position.sub(this.cameraPosition);
      const distance = toTarget.length();
      const forward = this.cameraTarget.clone().sub(this.cameraPosition).normalize();
      const direction = toTarget.normalize();
      this.cameraRaycaster.set(this.cameraPosition, direction);
      this.cameraRaycaster.near = 0.05;
      this.cameraRaycaster.far = distance;
      const blocked = this.cameraRaycaster.intersectObject(this.environment.root, true)
        .some((entry) => entry.distance < distance - 0.3 && this.isCameraBlocker(entry.object));
      acquired = distance <= 16 && direction.dot(forward) >= 0.94 && !blocked;
    }
    if (!acquired) {
      this.hud?.flash(`${warehouseZoneLabel(this.selectedZone)} // NO OPTICAL TARGET`);
      return;
    }
    intruder.observe();
    intruder.tag();
    intrusion.evidence.liveTag = true;
    this.evidence.visitor = true;
    this.zoneStatuses[intruder.currentZone] = 'contact';
    this.sound.play('tracking');
    this.hud?.pulseScan();
    this.hud?.flash(`OPTICAL TAG CONFIRMED // ${warehouseZoneLabel(intruder.currentZone)} // 10 SEC`, 2.2);
    this.syncIntrusionHud();
  }

  public toggleGrip(): void {
    if (this.view !== 'drone' || this.finished || this.decisionCommitted || this.isCinematicActive() || this.isBreachCase()) return;
    if (this.activeCase?.definition.id === 'freight-sort' && this.inboundAudit) {
      this.toggleInboundAuditGrip();
      return;
    }
    if (this.carried) {
      const active = this.activeCase;
      const nearest = this.environment.nearestDoorDock(this.carried.position);
      if (active && nearest.distance <= 2.5) {
        if (nearest.id !== active.assignedDoorId) {
          this.sound.play('reject');
          this.hud?.flash(`DOCK ASSIGNMENT MISMATCH // REQUIRED ${this.doorLabel(active.assignedDoorId)} // LOAD RETAINED`, 2.8);
          return;
        }
        const capacity = this.environment.transferDockCapacity(nearest.id);
        if (this.dockedCargo.length >= capacity) {
          this.hud?.flash(`${this.doorLabel(nearest.id)} // ALL CLAMPS OCCUPIED`, 1.8);
          return;
        }
        const cargo = this.cargoRope.detach() ?? this.carried;
        const occupiedSlots = new Set(this.dockedCargo.filter((entry) => entry.doorId === nearest.id).map((entry) => entry.slot));
        const slot = Array.from({ length: capacity }, (_, index) => index).find((index) => !occupiedSlots.has(index)) ?? 0;
        cargo.position.copy(this.environment.transferDockSlot(nearest.id, slot));
        cargo.quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, WAREHOUSE_DOORS[nearest.id].rootRotation);
        cargo.carried = false;
        this.carried = null;
        this.dockedCargo.push({ node: cargo, doorId: nearest.id, slot });
        /*
         * The secure transfer is an instrumented scale/seal reader. Once its clamp has
         * positively captured a load it has enough information to produce the same package
         * record as a close optical inspection. This also makes physical staging and console
         * state atomic: a load cannot visibly sit in a locked clamp while the console claims
         * no package is present.
         */
        this.scannedCargo.add(cargo);
        this.evidence.cargo = active.definition.id === 'package-5018'
          ? this.scannedCargo.size >= 2
          : true;
        this.environment.setTransferDockState(nearest.id, 'staged');
        this.sound.play('dock');
        this.feedback.gripPulse(cargo.getWorldPosition(new THREE.Vector3()), true);
        const required = active.definition.id === 'package-5018' ? 2 : 1;
        const recordsReady = this.evidence.visitor && this.evidence.cargo;
        this.hud?.flash(
          `TRANSFER CLAMP LOCKED // DOCK SCAN RECORDED // LOADS SECURED ${this.dockedCargo.length}/${required}${recordsReady ? ' // DECISIONS READY' : ' // VISITOR RECORD REQUIRED'}`,
          3
        );
        this.refreshCaseHud();
        return;
      }
      const cargo = this.cargoRope.detach() ?? this.carried;
      cargo.position.y = 0;
      cargo.quaternion.identity();
      cargo.carried = false;
      this.carried = null;
      this.sound.play('grip');
      this.feedback.gripPulse(cargo.getWorldPosition(new THREE.Vector3()), false);
      this.hud?.flash('LOAD RELEASED');
      return;
    }
    const droneAt = this.drone.getWorldPosition(new THREE.Vector3());
    const staged = [...this.dockedCargo]
      .sort((a, b) => a.node.getWorldPosition(new THREE.Vector3()).distanceTo(droneAt) - b.node.getWorldPosition(new THREE.Vector3()).distanceTo(droneAt))[0];
    if (staged && staged.node.getWorldPosition(new THREE.Vector3()).distanceTo(droneAt) <= 3.65) {
      this.dockedCargo.splice(this.dockedCargo.indexOf(staged), 1);
      this.ropeAnchor.copy(this.drone.position).add(new THREE.Vector3(0, -0.48, 0));
      this.cargoRope.attach(staged.node, this, this.ropeAnchor);
      staged.node.carried = true;
      this.carried = staged.node;
      this.environment.setTransferDockState(staged.doorId, this.dockedCargo.length ? 'staged' : 'empty');
      this.sound.play('grip');
      this.hud?.flash(`LOAD ${staged.node.caseData?.packageId ?? ''} RETRIEVED // TRANSFER CLAMP OPEN`, 2);
      this.refreshCaseHud();
      return;
    }
    const cargo = [this.cargo, this.duplicateCargo]
      .filter((entry): entry is WarehouseCargoNode => entry !== null)
      .filter((entry) => !this.dockedCargo.some((stagedEntry) => stagedEntry.node === entry))
      .sort(
        (a, b) =>
          a.getWorldPosition(new THREE.Vector3()).distanceTo(droneAt) -
          b.getWorldPosition(new THREE.Vector3()).distanceTo(droneAt)
      )[0];
    if (!cargo) return;
    const cargoAt = cargo.getWorldPosition(new THREE.Vector3());
    if (cargoAt.distanceTo(droneAt) > 3.65) {
      this.hud?.flash('GRIP TARGET OUT OF RANGE');
      return;
    }
    this.ropeAnchor.copy(this.drone.position).add(new THREE.Vector3(0, -0.48, 0));
    this.cargoRope.attach(cargo, this, this.ropeAnchor);
    cargo.carried = true;
    this.carried = cargo;
    this.sound.play('grip');
    this.feedback.gripPulse(cargoAt, true);
    const active = this.activeCase;
    const route = active ? ` // DOCK ${this.doorLabel(active.assignedDoorId)} // F TO CLAMP` : '';
    this.hud?.flash(`LOAD ${active?.packageId ?? ''} SECURED${route}`, route ? 2.8 : 1.5);
  }

  private toggleInboundAuditGrip(): void {
    const audit = this.inboundAudit;
    const cargo = audit ? this.inboundCargo[audit.activeIndex] : null;
    const delivery = audit ? INBOUND_AUDIT_DELIVERIES[audit.activeIndex] : null;
    if (!audit || !cargo || !delivery || this.inboundIntakeCargo) return;
    if (this.carried) {
      const intakeDistance = this.carried.position.distanceTo(this.environment.verifiedIntakePosition);
      if (intakeDistance <= 2.35) {
        if (!audit.packageScanned || !['sort-ready', 'alarm-ready'].includes(audit.phase)) {
          this.hud?.flash('INTAKE LOCKED // COMPLETE WORKER + PACKAGE COMPARISON', 2.2);
          return;
        }
        const load = this.cargoRope.detach() ?? this.carried;
        load.position.copy(this.environment.verifiedIntakePosition);
        load.quaternion.identity();
        load.carried = false;
        this.carried = null;
        this.inboundIntakeCargo = load;
        this.inboundIntakeElapsed = 0;
        this.environment.setVerifiedIntakeState('processing');
        this.environment.setConveyorsRunning(true);
        this.sound.play('dock');
        this.sound.play('conveyor');
        this.feedback.gripPulse(load.getWorldPosition(new THREE.Vector3()), true);
        this.hud?.flash(`VERIFIED INTAKE CLAMPED // PACKAGE ${delivery.packageId} // SCANNER ACTIVE`, 2.6);
        return;
      }
      const load = this.cargoRope.detach() ?? this.carried;
      load.position.y = 0;
      load.quaternion.identity();
      load.carried = false;
      this.carried = null;
      this.hud?.flash(`LOAD RELEASED // VERIFIED INTAKE ${intakeDistance.toFixed(1)}M`, 1.8);
      return;
    }
    if (!audit.packageScanned || !['sort-ready', 'alarm-ready'].includes(audit.phase)) {
      this.hud?.flash('GRIP LOCKED // SCAN ACTIVE WORKER AND PACKAGE FIRST', 2.2);
      return;
    }
    const droneAt = this.drone.getWorldPosition(new THREE.Vector3());
    const cargoAt = cargo.getWorldPosition(new THREE.Vector3());
    if (cargoAt.distanceTo(droneAt) > 3.65) {
      this.hud?.flash(`PACKAGE ${delivery.packageId} OUT OF RANGE // AISLE ${delivery.aisle} BAY ${String(delivery.bay).padStart(2, '0')}`);
      return;
    }
    this.ropeAnchor.copy(this.drone.position).add(new THREE.Vector3(0, -0.48, 0));
    this.cargoRope.attach(cargo, this, this.ropeAnchor);
    cargo.carried = true;
    this.carried = cargo;
    this.sound.play('grip');
    this.feedback.gripPulse(cargoAt, true);
    this.hud?.flash(`LOAD ${delivery.packageId} SECURED // ROUTE TO VERIFIED INTAKE // F TO CLAMP`, 2.8);
  }

  private worldTargetAcquired(position: THREE.Vector3, maxDistance = 18, threshold = 0.94): boolean {
    const toTarget = position.clone().sub(this.cameraPosition);
    const distance = toTarget.length();
    if (distance < 0.05 || distance > maxDistance) return false;
    const direction = toTarget.multiplyScalar(1 / distance);
    const forward = new THREE.Vector3(Math.sin(this.yaw), Math.sin(this.pitch), Math.cos(this.yaw)).normalize();
    if (direction.dot(forward) < threshold) return false;
    this.cameraRaycaster.set(this.cameraPosition, direction);
    this.cameraRaycaster.near = 0.05;
    this.cameraRaycaster.far = distance;
    return !this.cameraRaycaster.intersectObject(this.environment.root, true)
      .some((entry) => entry.distance < distance - 0.28 && this.isCameraBlocker(entry.object));
  }

  private scanInboundAudit(): boolean {
    const audit = this.inboundAudit;
    const delivery = audit ? INBOUND_AUDIT_DELIVERIES[audit.activeIndex] : null;
    const worker = audit ? this.workers[audit.activeIndex] : null;
    const cargo = audit ? this.inboundCargo[audit.activeIndex] : null;
    if (!audit || !delivery || !worker || !cargo) return false;

    if (audit.phase === 'fugitive-search') {
      const target = worker.subjectPosition();
      if (!this.worldTargetAcquired(target, 19, 0.93)) {
        this.hud?.flash(`${audit.fugitiveZone?.toUpperCase() ?? 'WAREHOUSE'} // NO FUGITIVE INSIDE OPTICAL BRACKETS`, 2);
        return false;
      }
      worker.contain();
      this.lastInboundScanSubject.copy(target);
      this.inboundFugitive = worker;
      audit.phase = 'police-response';
      audit.fugitiveZone = worker.fugitiveZone;
      this.environment.setSecurityZoneLocked(worker.fugitiveZone, true);
      this.environment.setLightingMode('contained');
      this.sound.play('tracking');
      this.sound.play('security-gate');
      this.hud?.setSecurityAlert(`SUBJECT CONTAINED // ${warehouseZoneLabel(worker.fugitiveZone)} LOCKED`);
      this.hud?.flash(`OPTICAL ID CONFIRMED // ${warehouseZoneLabel(worker.fugitiveZone)} SEALED // NO CONTACT`, 3.2);
      window.setTimeout(() => this.beginInboundPoliceResponse(worker.fugitiveZone), getAccessibilityPreferences().reducedMotion ? 250 : 850);
      return true;
    }

    if (!audit.workerScanned) {
      if (!this.worldTargetAcquired(worker.subjectPosition(), 17, 0.94)) {
        this.hud?.flash(`ACTIVE WORKER NOT INSIDE OPTICAL BRACKETS // BADGE ${delivery.workerId}`, 2.2);
        return false;
      }
      audit.workerScanned = true;
      this.lastInboundScanSubject.copy(worker.subjectPosition());
      audit.phase = 'scan-package';
      this.refreshInboundObjective();
      this.evidence.visitor = true;
      this.hud?.appendSystem(
        'OPTICAL PERSONNEL RECORD',
        `${delivery.workerName} // BADGE ${delivery.workerId} // ASSIGNED PACKAGE ${delivery.packageId} // AISLE ${delivery.aisle} BAY ${String(delivery.bay).padStart(2, '0')}`
      );
      this.hud?.flash(`WORKER VERIFIED // PACKAGE ${delivery.packageId} // AISLE ${delivery.aisle} BAY ${String(delivery.bay).padStart(2, '0')}`, 3.1);
      return true;
    }

    const cargoAt = cargo.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.32, 0));
    if (!this.worldTargetAcquired(cargoAt, 17, 0.94)) {
      this.hud?.flash(`PACKAGE ${delivery.packageId} NOT INSIDE OPTICAL BRACKETS // AISLE ${delivery.aisle} BAY ${String(delivery.bay).padStart(2, '0')}`, 2.4);
      return false;
    }
    audit.packageScanned = true;
    this.lastInboundScanSubject.copy(cargoAt);
    audit.delivererMatches = delivery.packageDelivererName === delivery.workerName;
    audit.sealIntact = !delivery.sealCompromised;
    /*
     * A broken seal is a QUESTION, not a verdict.
     *
     * One legitimate delivery arrives with its seal open and a logged reseal against it, so
     * "tampered" no longer separates the impostor from an honest worker who dropped a pallet.
     * What separates them is the name on the carton against the name on the badge. A player
     * who rejects on the seal alone false-alarms somebody innocent and pays an integrity for
     * it, which is the lesson the quest exists to teach and could not teach while the two
     * tells always arrived together.
     */
    const sealExplained = Boolean(delivery.sealNote);
    audit.sealAccounted = audit.sealIntact || sealExplained;
    /*
     * The gate opens on ANY anomaly, including one that turns out to be accounted for.
     *
     * Gating it on `sealAccounted` was tried and is subtly wrong: it makes the console refuse
     * to reject a delivery whose paperwork explains itself, which prevents the mistake
     * instead of teaching it. The player never learns that a broken seal is not a verdict,
     * because the game quietly refuses to let them act on one. Both actions stay available
     * whenever there is something to point at, and being wrong costs an integrity.
     */
    audit.phase = audit.delivererMatches && audit.sealIntact ? 'sort-ready' : 'alarm-ready';
    this.evidence.cargo = true;
    this.evidence.authorization = audit.delivererMatches;
    this.evidence.tamper = !audit.sealIntact && !sealExplained;
    this.scannedCargo.add(cargo);
    if (delivery.sealNote) {
      // Printed BEFORE the verdict, so the explanation is on screen when the judgement is
      // made rather than discoverable afterwards in a records tab.
      this.hud?.appendSystem('SEAL RECORD', `${delivery.packageId} // ${delivery.sealNote}`);
    }
    const comparison = [
      audit.delivererMatches ? 'DELIVERER MATCH' : 'IDENTITY CONTRADICTION',
      audit.sealIntact
        ? 'SEAL INTACT'
        : sealExplained ? 'SEAL OPEN // RESEAL ON RECORD' : 'PACKAGE TAMPERED',
      audit.phase === 'sort-ready' ? 'SORT AUTHORIZED' : 'REJECT + EMERGENCY ENABLED',
    ].join(' // ');
    this.hud?.appendSystem('PACKAGE COMPARISON', `${delivery.packageId} // ${comparison}`);
    this.hud?.flash(comparison, 3.4);
    this.refreshInboundObjective();
    return true;
  }

  /**
   * What to do next, in one sentence, kept current.
   *
   * Every step of this quest happens somewhere else in a 48 by 58 metre building, so the
   * objective has to carry a PLACE and not only a verdict. Each branch names one: the
   * worker's station, the package's aisle and bay, or the intake on the sorting line.
   */
  private refreshInboundObjective(): void {
    const audit = this.inboundAudit;
    if (!audit) return;
    const delivery = INBOUND_AUDIT_DELIVERIES[audit.activeIndex];
    if (!delivery) return;
    const step = `Delivery ${audit.activeIndex + 1} of ${audit.total}`;
    const bay = String(delivery.bay).padStart(2, '0');
    let line: string;
    if (!audit.workerScanned) {
      line = `${step}: scan ${delivery.workerName} at ${delivery.station}, `
        + `then inspect package ${delivery.packageId} in the same aisle at Bay ${bay}.`;
    } else if (!audit.packageScanned) {
      line = `${step}: ${delivery.workerName} logged. Inspect package ${delivery.packageId} `
        + `on the rack at Aisle ${delivery.aisle} // Bay ${bay}.`;
    } else if (audit.phase === 'sort-ready') {
      line = `${step}: records agree. Grip package ${delivery.packageId} with F and carry it `
        + 'to the VERIFIED INTAKE on the sorting line, east side.';
    } else if (audit.phase === 'alarm-ready') {
      line = audit.delivererMatches
        ? `${step}: package ${delivery.packageId} is open, and a reseal is on record against `
          + 'it. Sort it, or reject it from the console and answer for the alarm.'
        : `${step}: the name on package ${delivery.packageId} is not the name on the badge. `
          + 'Reject it from the console, or sort it anyway and answer for it.';
    } else {
      return;
    }
    this.hud?.setCase('QUEST 04 // INBOUND AUDIT', line);
  }

  private cargoHome(cargo: WarehouseCargoNode): THREE.Vector3 {
    const active = cargo.caseData ?? this.activeCase;
    if (!active) return this.drone.position.clone();
    return this.environment.packagePosition(cargo === this.duplicateCargo ? 4 : active.aisle, active.bay);
  }

  public tryContainZone(zone: WarehouseSecurityZoneId): void {
    const intruder = this.intruder;
    const intrusion = this.intrusion;
    const active = this.activeCase;
    if (!intruder || !intrusion || !active || active.definition.id !== 'internal-breach' || this.decisionCommitted) return;
    const ready = intrusion.evidence.rearHistory
      && intrusion.evidence.headcount
      && intrusion.evidence.liveTag
      && intruder.tagSeconds > 0;
    if (!ready) {
      this.hud?.flash('CONTAINMENT LOCKED // COMPLETE 3-CLUE STACK + LIVE TAG', 2.2);
      return;
    }
    this.decisions += 1;
    this.decisionCommitted = true;
    updateWarehouseSave((save) => { save.totalDecisions += 1; });
    if (zone !== intruder.currentZone) {
      this.integrity = Math.max(0, this.integrity - 1);
      this.cleanChain = 0;
      this.sound.play('reject');
      this.hud?.setIntegrity(this.integrity, this.stage, this.cleanChain);
      this.hud?.flash(`WRONG SECTOR // TAG REPORTS ${warehouseZoneLabel(intruder.currentZone)} // RESTORING EMERGENCY CHECKPOINT`, 3);
      updateWarehouseSave((save) => { save.storyMistakes += this.mode === 'story' ? 1 : 0; });
      window.setTimeout(() => this.restartBreachCheckpoint(), 1600);
      return;
    }

    this.correct += 1;
    this.cleanChain += 1;
    intrusion.containedZone = zone;
    intruder.contain();
    this.zoneStatuses[zone] = 'locked';
    this.environment.setSecurityZoneLocked(zone, true);
    this.environment.setLightingMode('contained');
    this.sound.setEmergency(true, true);
    this.sound.play('security-gate');
    this.hud?.setSecurityAlert(`CONTAINED // ${warehouseZoneLabel(zone)} LOCKED // RESPONSE EN ROUTE`);
    this.hud?.setIntegrity(this.integrity, this.stage, this.cleanChain);
    this.hud?.flash(`${warehouseZoneLabel(zone)} CONTAINED // EVIDENCE PRESERVED // NO CONTACT`, 3.2);
    updateWarehouseSave((save) => {
      save.correctDecisions += 1;
      save.bestCleanChain = Math.max(save.bestCleanChain, this.cleanChain);
      if (!save.discoveredCases.includes(active.definition.id)) save.discoveredCases.push(active.definition.id);
    });
    this.syncIntrusionHud();
    window.setTimeout(() => {
      if (this.activeCase === active && this.decisionCommitted) this.beginContainmentResponse(zone);
    }, getAccessibilityPreferences().reducedMotion ? 250 : 1200);
  }

  private restartBreachCheckpoint(): void {
    if (!this.intruder || !this.intrusion || !this.isBreachCase() || this.finished) return;
    this.decisionCommitted = false;
    this.environment.resetSecurityZones();
    this.environment.setLightingMode('emergency');
    this.sound.setEmergency(true);
    this.intruder.resetAtCheckpoint();
    this.intrusion.evidence.liveTag = false;
    this.evidence.visitor = false;
    this.intrusion.containedZone = null;
    this.zoneStatuses = {
      receiving: 'motion',
      'storage-west': 'unseen',
      'storage-east': 'unseen',
      sortation: 'unseen',
    };
    this.selectedZone = 'receiving';
    this.view = 'cctv';
    this.hud?.setView(this.view);
    this.syncPointerMode();
    this.syncIntrusionHud();
  }

  private failBreach(message: string): void {
    if (!this.isBreachCase() || this.decisionCommitted || this.finished) return;
    this.decisionCommitted = true;
    this.decisions += 1;
    this.integrity = Math.max(0, this.integrity - 1);
    this.cleanChain = 0;
    this.sound.play('reject');
    this.sound.setEmergency(false);
    this.hud?.setIntegrity(this.integrity, this.stage, this.cleanChain);
    this.hud?.flash(`${message} // RESTORING EMERGENCY CHECKPOINT`, 3.2);
    updateWarehouseSave((save) => {
      save.totalDecisions += 1;
      save.criticalBreaches += 1;
      save.storyMistakes += this.mode === 'story' ? 1 : 0;
    });
    if (this.mode === 'story') window.setTimeout(() => this.restartBreachCheckpoint(), 1800);
    else this.finish(false);
  }

  private beginContainmentResponse(zone: WarehouseSecurityZoneId): void {
    if (this.containmentResponse || !this.intruder) return;
    this.containmentPurpose = 'breach';
    const response = new WarehouseContainmentResponse(zone);
    this.containmentResponse = response;
    this.add(response.officer.root);
    this.view = 'cctv';
    this.selectedZone = zone;
    this.hud?.setView(this.view);
    this.hud?.setPursuit(true);
    this.hud?.appendSystem(
      'LUCIAN BARBU // REMOTE LIAISON',
      'Evidence integrity confirmed. Forwarding the secured sector to the correct local jurisdiction. Local response ETA 04:28.'
    );
    this.syncIntrusionHud();
    this.syncPointerMode();
  }

  private updateContainmentResponse(deltaTime: number): void {
    const response = this.containmentResponse;
    if (!response) return;
    const frame = response.tick(deltaTime);
    this.hud?.setCctvTimestampOffset(frame.timestampOffsetSeconds);
    if (frame.phaseChanged && frame.phase === 'response') {
      this.sound.play('siren');
      this.hud?.flash('LOCAL UNIT VISUAL // SECURED SECTOR CAMERA', 2.3);
    }
    if (!frame.complete) return;
    this.finishContainmentResponse();
  }

  private finishContainmentResponse(): void {
    if (!this.containmentResponse) return;
    const purpose = this.containmentPurpose;
    this.containmentResponse.destroy();
    this.containmentResponse = null;
    this.containmentPurpose = null;
    this.hud?.setPursuit(false);
    this.hud?.setCctvTimestampOffset(0);
    if (purpose === 'inbound' && this.inboundAudit) {
      this.hud?.appendSystem('LOCAL RESPONSE', 'LOCAL UNIT SECURED SUBJECT // EVIDENCE TRANSFER COMPLETE');
      this.hud?.flash('SUBJECT SECURED // NORMAL OPERATIONS RESUMING', 3.1);
      this.inboundFugitive?.setFugitivePaused(true);
      if (this.inboundFugitive) this.inboundFugitive.visible = false;
      this.environment.setLightingMode('recovery');
      this.environment.resetSecurityZones();
      this.environment.setVerifiedIntakeState('ready');
      this.environment.setConveyorsRunning(true);
      this.sound.setEmergency(false);
      this.sound.play('recovery');
      this.hud?.setSecurityAlert('LOCAL RESPONSE COMPLETE // DELIVERIES RESOLVED 3/5');
      this.view = 'drone';
      this.hud?.setView(this.view);
      this.syncPointerMode();
      window.setTimeout(() => this.completeInboundDelivery('evidence'), getAccessibilityPreferences().reducedMotion ? 250 : 900);
      return;
    }
    this.hud?.appendSystem('LOCAL RESPONSE', 'SECURED SECTOR ENTERED // EVIDENCE TRANSFER COMPLETE // FEED CLOSED BEFORE CONTACT');
    this.hud?.flash('LOCAL RESPONSE COMPLETE // NORMAL POWER RECOVERING', 3);
    this.environment.setLightingMode('recovery');
    this.sound.setEmergency(false);
    this.sound.play('recovery');
    this.hud?.setSecurityAlert('SECURED // LOCAL RESPONSE COMPLETE // POWER RECOVERY');
    window.setTimeout(() => this.advance(), getAccessibilityPreferences().reducedMotion ? 300 : 1100);
  }

  private resolveInboundEmergencyDecision(): void {
    const audit = this.inboundAudit;
    const delivery = audit ? INBOUND_AUDIT_DELIVERIES[audit.activeIndex] : null;
    if (!audit || !delivery || !audit.workerScanned || !audit.packageScanned) {
      this.hud?.flash('REJECTION LOCKED // SCAN ACTIVE WORKER + PACKAGE', 2.2);
      return;
    }
    if (!delivery.suspicious) {
      this.integrity = Math.max(0, this.integrity - 1);
      this.cleanChain = 0;
      this.decisionCommitted = true;
      this.sound.play('reject');
      this.hud?.setIntegrity(this.integrity, this.stage, this.cleanChain);
      this.hud?.flash(
        delivery.sealNote
          ? `FALSE ALARM // ${delivery.packageId} SEAL WAS LOGGED // BADGE AND CARTON AGREE // DELIVERY RESET`
          : `FALSE ALARM // ${delivery.workerName} + ${delivery.packageId} RECORDS AGREE // DELIVERY RESET`,
        3.4
      );
      updateWarehouseSave((save) => {
        save.totalDecisions += 1;
        save.storyMistakes += 1;
      });
      window.setTimeout(() => this.restartInboundDelivery(), 1500);
      return;
    }

    this.decisionCommitted = true;
    audit.phase = 'fugitive-search';
    audit.fugitiveZone = 'receiving';
    const cargo = this.inboundCargo[audit.activeIndex];
    cargo.position.copy(this.environment.packagePosition(delivery.aisle, delivery.bay));
    cargo.carried = false;
    this.carried = null;
    this.cargoRope.detach();
    this.environment.setVerifiedIntakeState('evidence');
    this.environment.setConveyorsRunning(false);
    this.environment.setLightingMode('emergency');
    this.sound.play('power-loss');
    this.sound.setEmergency(true);
    this.sound.play('warning');
    const fugitive = this.workers[audit.activeIndex];
    this.inboundFugitive = fugitive;
    for (const [index, worker] of this.workers.entries()) {
      if (worker === fugitive || index < audit.resolved) continue;
      worker.moveToMuster(WAREHOUSE_LAYOUT.muster[index % WAREHOUSE_LAYOUT.muster.length]);
    }
    fugitive.startFugitive(INBOUND_FUGITIVE_ROUTE, {
      onZoneChanged: (zone) => {
        if (this.inboundAudit) this.inboundAudit.fugitiveZone = zone;
        this.sound.play('footsteps');
      },
      onEscapeWarning: () => {
        this.sound.play('tamper');
        this.hud?.flash('SERVICE C ESCAPE ATTEMPT // 8 SECONDS TO OPTICALLY CONTAIN', 3.2);
      },
      onEscaped: () => this.failInboundEscape(),
    });
    this.hud?.setSecurityAlert('EMERGENCY // CONFIRMED IMPOSTOR // SEARCH ACTIVE');
    this.hud?.appendSystem(
      'SECURITY CONTROL',
      `PACKAGE ${delivery.packageId} LOCKED AS EVIDENCE. ${delivery.workerName} abandoned the verified crew position. Locate and optically identify the same worker.`
    );
    this.hud?.flash('EMERGENCY MODE // IMPOSTOR FLED // SEARCH, SCAN, CONTAIN', 3.8);
    this.refreshCaseHud();
  }

  private failInboundEscape(): void {
    const audit = this.inboundAudit;
    if (!audit || audit.phase !== 'fugitive-search') return;
    this.integrity = Math.max(0, this.integrity - 1);
    this.cleanChain = 0;
    this.sound.play('reject');
    this.hud?.setIntegrity(this.integrity, this.stage, this.cleanChain);
    this.hud?.flash('SUBJECT REACHED SERVICE C // RESTORING EMERGENCY SEARCH AT RECEIVING', 3.2);
    updateWarehouseSave((save) => {
      save.totalDecisions += 1;
      save.storyMistakes += 1;
      save.criticalBreaches += 1;
    });
    window.setTimeout(() => this.restartInboundSearch(), 1600);
  }

  private restartInboundSearch(): void {
    const audit = this.inboundAudit;
    const fugitive = this.inboundFugitive;
    if (!audit || !fugitive) return;
    audit.phase = 'fugitive-search';
    audit.fugitiveZone = 'receiving';
    audit.escapeSeconds = null;
    this.decisionCommitted = true;
    this.environment.resetSecurityZones();
    this.environment.setLightingMode('emergency');
    this.sound.setEmergency(true);
    fugitive.resetFugitiveAtReceiving(INBOUND_FUGITIVE_ROUTE[0].position);
    fugitive.startFugitive(INBOUND_FUGITIVE_ROUTE, {
      onZoneChanged: (zone) => { if (this.inboundAudit) this.inboundAudit.fugitiveZone = zone; },
      onEscapeWarning: () => this.hud?.flash('SERVICE C ESCAPE ATTEMPT // 8 SECONDS', 2.8),
      onEscaped: () => this.failInboundEscape(),
    });
    this.hud?.setSecurityAlert('EMERGENCY SEARCH RESTORED // RECEIVING MOTION');
    this.refreshCaseHud();
  }

  private beginInboundPoliceResponse(zone: WarehouseSecurityZoneId): void {
    if (this.containmentResponse) return;
    this.containmentPurpose = 'inbound';
    const response = new WarehouseContainmentResponse(zone);
    this.containmentResponse = response;
    this.add(response.officer.root);
    this.view = 'cctv';
    this.selectedZone = zone;
    this.hud?.setView(this.view);
    this.hud?.setPursuit(true);
    this.hud?.appendSystem(
      'LUCIAN BARBU // REMOTE LIAISON',
      'Worker and package evidence agree on the impostor event. Forwarding the secured sector to the local unit.'
    );
    this.syncPointerMode();
  }

  public tryDecision(decision: WarehouseConsoleAction): void {
    const active = this.activeCase;
    if (!active || this.finished || this.isCinematicActive() || this.decisionCommitted || active.definition.id === 'internal-breach') return;
    if (decision === 'return') {
      this.returnActiveLoadToOrigin();
      return;
    }
    if (active.definition.id === 'freight-sort') {
      if (decision !== 'deny-lockdown') {
        this.hud?.flash('INBOUND AUDIT // SORT PHYSICALLY AT VERIFIED INTAKE OR REJECT THROUGH CONSOLE');
        return;
      }
      this.resolveInboundEmergencyDecision();
      return;
    }
    const evidenceReady = decision === 'deny-lockdown'
      ? active.definition.id === 'door-tamper'
        ? this.evidence.visitor && this.evidence.action && this.evidence.authorization && this.evidence.tamper
        : this.evidence.visitor && this.evidence.cargo
      : active.definition.subjectType === 'worker'
        ? this.evidence.visitor
        : active.definition.id === 'freight-sort'
          ? this.evidence.cargo
          : decision === 'verify'
            ? this.evidence.visitor && this.evidence.cargo
            : this.evidence.visitor && this.evidence.cargo;
    if (!evidenceReady) {
      if (active.definition.subjectType === 'worker') {
        this.hud?.flash('PERSONNEL RECORD REQUIRED // ACQUIRE AN OPTICAL SCAN', 2.2);
      } else if (active.definition.id === 'freight-sort') {
        this.hud?.flash('FREIGHT RECORD REQUIRED // ACQUIRE AN OPTICAL SCAN', 2.2);
      } else if (!this.evidence.visitor && !this.evidence.cargo) {
        this.hud?.flash('VISITOR + PACKAGE RECORDS REQUIRED // INSPECT CCTV + SCAN OR DOCK LOAD', 2.6);
      } else if (!this.evidence.visitor) {
        this.hud?.flash(`VISITOR RECORD REQUIRED // INSPECT ${this.doorLabel(active.assignedDoorId)} CCTV`, 2.6);
      } else {
        this.hud?.flash('PACKAGE RECORD REQUIRED // RMB + LMB SCAN OR CLAMP LOAD AT THE ASSIGNED DOCK', 2.6);
      }
      return;
    }
    if (!active.definition.requiredTools.every((tool) => this.tools.includes(tool))) {
      this.hud?.flash('REQUIRED INFORMATION CHANNEL UNAVAILABLE');
      return;
    }
    const comparisonTool = active.definition.requiredTools.find((tool) => tool !== 'optical');
    if (comparisonTool && this.activeTool !== comparisonTool) {
      this.hud?.flash(`COMPLETE THE ${comparisonTool.toUpperCase()} COMPARISON BEFORE COMMITTING`);
      return;
    }
    if (active.definition.id === 'package-5018' && decision === 'verify') {
      this.visitorVerified = true;
      this.sound.play('resolved');
      this.hud?.flash(`HUMAN VERIFICATION REQUESTED // ${this.doorLabel(active.assignedDoorId)} HELD`, 2.8);
      return;
    }
    if (active.definition.id === 'temporary-worker' && decision === 'verify') {
      this.workerVerificationRequested = true;
      this.sound.play('resolved');
      this.hud?.flash('DISPATCH: VALID TEMPORARY BADGE // HOLD PENDING CREW FILE UPDATE', 2.8);
      return;
    }
    if (active.definition.id === 'temporary-worker' && decision === 'hold' && !this.workerVerificationRequested) {
      this.hud?.flash('REQUEST HUMAN VERIFICATION BEFORE ASSIGNING THE HOLD BAY');
      return;
    }
    if (active.definition.id === 'package-5018' && decision === 'quarantine' && !this.visitorVerified) {
      this.hud?.flash('PRESERVE BOTH RECORDS // REQUEST HUMAN VERIFICATION FOR THE VISITOR');
      return;
    }
    const cargoDecision = active.definition.id !== 'freight-sort' && (decision === 'release' || decision === 'quarantine');
    if (cargoDecision) {
      const required = active.definition.id === 'package-5018' ? 2 : 1;
      const secured = this.dockedCargo.filter((entry) => entry.doorId === active.assignedDoorId).length;
      if (secured < required) {
        this.hud?.flash(`DOCK REQUIRED AT ${this.doorLabel(active.assignedDoorId)} // LOADS SECURED ${secured}/${required} // F TO CLAMP`, 2.7);
        return;
      }
    }
    this.resolveDecision(decision);
  }

  private resolveDecision(decision: WarehouseDecision): void {
    const active = this.activeCase;
    if (!active) return;
    this.decisionCommitted = true;
    this.decisions += 1;
    const correct = decision === active.definition.correctDecision;
    /*
     * The judgement lands before any of the bookkeeping below it.
     *
     * Committing a decision is the whole mission and it used to produce a cue, a line of text
     * and a meter tick - less presence than picking up a crate, at the moment the player has
     * actually been playing towards. The ring goes at the SUBJECT so the answer is attached to
     * the thing judged, and the edge flash and the lens kick carry the weight. Fired first
     * because everything after this can branch, return early, or reset the case.
     */
    this.feedback.verdictPulse(this.scanSubjectPosition(), correct);
    this.hud?.flashVerdict(correct);
    if (decision === 'release') this.performCargoHandoff();
    else if (decision === 'quarantine') this.environment.setTransferDockState(active.assignedDoorId, 'quarantined');
    if (decision === 'deny-lockdown') {
      this.environment.lockdownServiceDoor(active.assignedDoorId);
      this.environment.setTransferDockState(active.assignedDoorId, 'locked');
      this.doorStatuses[active.assignedDoorId] = 'locked';
      this.syncDoorHud();
      this.sound.play('lockdown');
    }
    this.refreshCaseHud();
    updateWarehouseSave((save) => {
      save.totalDecisions += 1;
      if (correct) save.correctDecisions += 1;
      else if (active.definition.critical) save.criticalBreaches += 1;
    });
    if (!correct) {
      this.integrity -= 1;
      this.cleanChain = 0;
      updateWarehouseSave((save) => { save.storyMistakes += this.mode === 'story' ? 1 : 0; });
      this.sound.play('reject');
      this.hud?.setIntegrity(this.integrity, this.stage, this.cleanChain);
      if (active.definition.critical || this.integrity <= 0) {
        this.hud?.flash(active.definition.critical ? 'CRITICAL BREACH // RESTORING MOVEMENT CHECKPOINT' : 'INTEGRITY LOST // SHIFT TERMINATED', 3);
        if (this.mode === 'story') {
          window.setTimeout(() => { this.integrity = 3; this.beginStoryMovement(); }, 1800);
        } else this.finish(false);
      } else {
        this.hud?.flash('DECISION CONTRADICTS THE RECORD // CASE RESET', 2.2);
        window.setTimeout(() => this.mode === 'story' ? this.spawnStoryCase() : this.spawnCase(this.director?.caseForStage(this.stage, this.tools) ?? null), 900);
      }
      return;
    }

    this.correct += 1;
    this.cleanChain += 1;
    if (decision === 'quarantine') this.sound.play('quarantine');
    else if (decision === 'release') this.sound.play('release');
    else this.sound.play('resolved');
    this.environment.setConveyorsRunning(active.definition.id === 'freight-sort');
    if (active.definition.id === 'freight-sort') this.sound.play('conveyor');
    this.hud?.setIntegrity(this.integrity, this.stage, this.cleanChain);
    updateWarehouseSave((save) => {
      if (!save.discoveredCases.includes(active.definition.id)) save.discoveredCases.push(active.definition.id);
      save.bestCleanChain = Math.max(save.bestCleanChain, this.cleanChain);
      if (this.mode === 'story' && this.storyMovement === 0) save.tutorialComplete = true;
    });
    if (this.mode === 'story' && this.storyMovement === 0) this.hud?.setControlsVisible(false);
    if (decision === 'deny-lockdown') {
      this.hud?.flash('DENIAL CONFIRMED // SERVICE ROUTE LOCKED // EVIDENCE PRESERVED', 3.2);
      this.beginPoliceResponse();
      return;
    }
    const is5018 = active.definition.id === 'package-5018';
    this.hud?.flash(is5018 ? '5018 LOADS SEALED // SERVICE C CONTAINMENT COVER LOCKED' : 'CASE RESOLVED', is5018 ? 4 : 1.5);
    if (is5018) this.sound.play('anomaly');
    const deliveryDelay = decision === 'release'
      ? getAccessibilityPreferences().reducedMotion ? 900 : 5200
      : is5018 ? 3500 : 1200;
    window.setTimeout(() => this.advance(), deliveryDelay);
  }

  private performCargoHandoff(): void {
    const active = this.activeCase;
    if (!active) return;
    const handoffDoor = active.assignedDoorId;
    const staged = this.dockedCargo.filter((entry) => entry.doorId === handoffDoor);
    const cargo = staged[0]?.node;
    if (!cargo) return;
    this.environment.setTransferDockState(handoffDoor, 'releasing');
    cargo.carried = false;
    const reducedMotion = getAccessibilityPreferences().reducedMotion;
    this.deliveredCargo = {
      node: cargo,
      from: cargo.position.clone(),
      to: WAREHOUSE_DOORS[handoffDoor].visitorPosition.clone().add(new THREE.Vector3(0, 0.08, 0)),
      elapsed: 0,
      duration: reducedMotion ? 0.08 : 3.2,
    };
    this.environment.cycleServiceDoor(handoffDoor);
    this.hud?.setBell(false, 0);
    this.selectedDoor = handoffDoor;
    this.view = 'cctv';
    if (handoffDoor === active.assignedDoorId) {
      const receiver = this.visitor;
      receiver?.rig.gesture('open');
      if (receiver && active.visitorIntent === 'collection') {
        const exit = WAREHOUSE_DOORS[handoffDoor].pursuit.officerStart.clone();
        window.setTimeout(() => {
          if (this.activeCase !== active || this.visitor !== receiver || this.pursuit) return;
          receiver.rig.walk(exit, { interrupt: true, locomotion: 'walk', pace: 1.1 });
          cargo.visible = false;
        }, reducedMotion ? 160 : 3400);
      }
    }
    this.syncDoorHud();
    this.hud?.setView(this.view);
    this.syncPointerMode();
  }

  /**
   * Reversible load recovery, not a handling verdict. Evidence and case progress remain intact.
   * Prefer the load in the drone's possession, then the most recently clamped load, then any
   * loose package that has actually moved away from its authored rack slot.
   */
  private returnActiveLoadToOrigin(): void {
    const active = this.activeCase;
    if (!active) return;
    if (active.definition.id === 'freight-sort' && this.inboundAudit) {
      const delivery = INBOUND_AUDIT_DELIVERIES[this.inboundAudit.activeIndex];
      const auditCargo = this.inboundCargo[this.inboundAudit.activeIndex];
      if (!delivery || !auditCargo) return;
      if (this.carried === auditCargo) this.cargoRope.detach();
      this.carried = null;
      this.inboundIntakeCargo = null;
      this.inboundIntakeElapsed = 0;
      auditCargo.position.copy(this.environment.packagePosition(delivery.aisle, delivery.bay));
      auditCargo.quaternion.identity();
      auditCargo.carried = false;
      auditCargo.visible = true;
      this.environment.setConveyorsRunning(false);
      this.environment.setVerifiedIntakeState('ready');
      this.sound.play('return');
      this.hud?.flash(`LOAD ${delivery.packageId} RETURNED // AISLE ${delivery.aisle} // BAY ${String(delivery.bay).padStart(2, '0')} // AUDIT REMAINS OPEN`, 2.8);
      return;
    }
    let cargo = this.carried;
    if (cargo) {
      this.cargoRope.detach();
      this.carried = null;
    } else {
      const staged = this.dockedCargo[this.dockedCargo.length - 1];
      if (staged) {
        cargo = staged.node;
        this.dockedCargo.splice(this.dockedCargo.indexOf(staged), 1);
      }
    }
    if (!cargo) {
      cargo = [this.cargo, this.duplicateCargo]
        .filter((entry): entry is WarehouseCargoNode => entry !== null && entry.visible)
        .find((entry) => entry.position.distanceTo(this.cargoHome(entry)) > 0.08) ?? null;
    }
    if (!cargo) {
      this.sound.play('warning');
      this.hud?.flash('RETURN LOAD // NO MOVED OR STAGED PACKAGE', 1.8);
      return;
    }
    cargo.position.copy(this.cargoHome(cargo));
    cargo.quaternion.identity();
    cargo.carried = false;
    cargo.visible = true;
    const capacity = active.definition.id === 'package-5018' ? 2 : 1;
    this.environment.configureTransferDock(active.assignedDoorId, capacity);
    if (this.dockedCargo.some((entry) => entry.doorId === active.assignedDoorId)) {
      this.environment.setTransferDockState(active.assignedDoorId, 'staged');
    }
    this.sound.play('return');
    const aisle = cargo === this.duplicateCargo ? 4 : active.aisle;
    this.hud?.flash(`LOAD ${active.packageId} RETURNED // AISLE ${aisle} // BAY ${String(active.bay).padStart(2, '0')} // CASE REMAINS OPEN`, 2.8);
    this.refreshCaseHud();
  }

  private beginPoliceResponse(): void {
    const active = this.activeCase;
    if (!active || !this.visitor) {
      window.setTimeout(() => this.advance(), 900);
      return;
    }
    const authored = this.mode === 'story';
    const shortened = seedFrom(`${this.seed}:response:${this.stage}`) % 100 < 15;
    if (!authored && !shortened) {
      this.hud?.appendSystem('LUCIAN BARBU // REMOTE LIAISON', 'Evidence packet verified and forwarded to the correct local jurisdiction. Local response is active.');
      window.setTimeout(() => this.advance(), 1500);
      return;
    }
    this.pursuit = new WarehousePursuit(active.assignedDoorId, this.visitor, authored);
    this.add(this.pursuit.officer.root);
    this.pursuitPhase = 'lockdown';
    this.selectedDoor = active.assignedDoorId;
    this.view = 'cctv';
    this.syncDoorHud();
    this.hud?.setView(this.view);
    this.hud?.setReplayAvailable(false);
    this.hud?.setPursuit(true);
    this.hud?.appendSystem(
      'LUCIAN BARBU // REMOTE LIAISON',
      'Evidence integrity confirmed. Forwarding the event to the correct local jurisdiction. Local response ETA 04:12.'
    );
    this.syncPointerMode();
  }

  private updatePursuit(deltaTime: number): void {
    const pursuit = this.pursuit;
    const active = this.activeCase;
    if (!pursuit || !active) return;
    const frame = pursuit.tick(deltaTime);
    this.hud?.setCctvTimestampOffset(frame.timestampOffsetSeconds);
    if (frame.phaseChanged) {
      this.pursuitPhase = frame.phase;
      if (frame.phase === 'suspect') {
        this.hud?.flash('SURVEILLANCE TIMESTAMP +04:07 // SUBJECT FLEEING', 2.1);
      } else if (frame.phase === 'response') {
        if (!getAccessibilityPreferences().reducedMotion) this.environment.setPursuitLights(active.assignedDoorId, true);
        this.sound.play('siren');
        this.hud?.flash('LOCAL UNIT VISUAL // EXTERIOR CORNER CAMERA', 2.2);
      }
    }
    if (frame.complete) this.finishPoliceResponse();
  }

  private updateDeliveredCargo(deltaTime: number): void {
    const delivery = this.deliveredCargo;
    if (!delivery) return;
    delivery.elapsed += deltaTime;
    const progress = Math.min(1, delivery.elapsed / Math.max(0.01, delivery.duration));
    const eased = progress * progress * (3 - 2 * progress);
    delivery.node.position.lerpVectors(delivery.from, delivery.to, eased);
    delivery.node.position.y += Math.sin(progress * Math.PI) * 0.09;
    if (progress >= 1) this.deliveredCargo = null;
  }

  private finishPoliceResponse(): void {
    const active = this.activeCase;
    if (!this.pursuit || !active) return;
    this.environment.setPursuitLights(active.assignedDoorId, false);
    this.pursuit.destroy();
    this.pursuit = null;
    this.pursuitPhase = '';
    this.hud?.setPursuit(false);
    this.hud?.setCctvTimestampOffset(0);
    this.hud?.appendSystem('LOCAL RESPONSE', 'LOCAL UNIT IN PURSUIT // EVIDENCE TRANSFER COMPLETE');
    this.hud?.flash('LOCAL UNIT IN PURSUIT // EVIDENCE TRANSFER COMPLETE', 3);
    window.setTimeout(() => this.advance(), 900);
  }

  private skipPursuit(): void {
    if (this.containmentResponse) {
      this.containmentResponse.skip();
      this.finishContainmentResponse();
      return;
    }
    if (!this.pursuit) return;
    this.pursuit.skip();
    this.finishPoliceResponse();
  }

  private advance(): void {
    if (this.mode === 'story') {
      const movement = STORY_MOVEMENTS[this.storyMovement];
      this.storyCase += 1;
      if (this.storyCase < movement.caseIds.length) {
        this.spawnStoryCase();
        return;
      }
      this.storyMovement += 1;
      if (this.storyMovement >= STORY_MOVEMENTS.length) {
        this.finish(true);
        return;
      }
      updateWarehouseSave((save) => {
        save.storyMovement = this.storyMovement;
        save.storyMovementId = STORY_MOVEMENTS[this.storyMovement].id;
      });
      this.beginStoryMovement();
      return;
    }

    if (this.stage >= 30) {
      this.finish(true);
      return;
    }
    this.stage += 1;
    adaptiveScore.setState('warehouse', this.stage >= 24 ? 2 : this.stage >= 11 ? 1 : 0);
    this.unlockForStage(this.stage);
    this.spawnCase(this.director?.caseForStage(this.stage, this.tools) ?? null);
    this.hud?.setCase(`STAGE ${String(this.stage).padStart(2, '0')}`, this.activeCase?.definition.briefing ?? 'Await case.');
  }

  private unlockForStage(stage: number): void {
    for (const [tool, at] of Object.entries(TOOL_UNLOCK_STAGE) as Array<[WarehouseTool, number]>) {
      if (stage < at || this.tools.includes(tool)) continue;
      this.tools.push(tool);
      this.hud?.setTools(this.tools, this.activeTool);
      this.hud?.flash(`${tool.toUpperCase()} CHANNEL UNLOCKED // NEW CASE FAMILY ADDED`, 3);
      updateWarehouseSave((save) => {
        if (!save.unlockedTools.includes(tool)) save.unlockedTools.push(tool);
      });
    }
  }

  private finish(completed: boolean): void {
    if (this.finished) return;
    this.finished = true;
    const accuracy = this.decisions > 0 ? this.correct / this.decisions : 0;
    const base = {
      mode: this.mode,
      seed: this.seed,
      stage: this.stage,
      accuracy,
      cleanChain: this.cleanChain,
      integrity: this.integrity,
      elapsedSeconds: this.elapsed,
      completed,
    } as const;
    const shareCode = this.mode === 'daily'
      ? `W07-${seedFrom(`${this.seed}:${this.stage}:${accuracy.toFixed(3)}:${this.cleanChain}`).toString(36).toUpperCase()}`
      : undefined;
    const result: WarehouseRunResult = { ...base, rank: WarehouseDirector.rank(base), shareCode };
    updateWarehouseSave((save) => {
      save.highestStage = Math.max(save.highestStage, this.stage);
      if (RANK_ORDER.indexOf(result.rank) > RANK_ORDER.indexOf(save.bestRank)) save.bestRank = result.rank;
      if (this.mode === 'story' && completed) {
        save.storyCompleted = true;
        save.storyMovement = STORY_MOVEMENTS.length - 1;
        save.storyMovementId = STORY_MOVEMENTS[STORY_MOVEMENTS.length - 1].id;
        if (!save.unlockedTools.includes('history')) save.unlockedTools.push('history');
      }
      if (this.mode === 'daily') save.dailyHistory[this.seed] = result;
    });
    adaptiveScore.setState(completed ? 'resolution' : 'silent');
    const share = result.shareCode ? ` // ${result.shareCode}` : '';
    this.hud?.flash(completed ? `${result.rank} // SHIFT COMPLETE${share} // ESC TO RETURN` : `${result.rank} // SHIFT ENDED${share} // ESC TO RETURN`, 8);
    if (this.mode === 'story' && completed) this.onStoryCompleted?.();
  }

  private setWorkersVisible(visible: boolean): void {
    for (const worker of this.workers) worker.visible = visible;
  }

  public requestExit(): void {
    if (this.isCinematicActive()) {
      this.skipPursuit();
      return;
    }
    const accuracy = this.decisions > 0 ? this.correct / this.decisions : 0;
    const base = { mode: this.mode, seed: this.seed, stage: this.stage, accuracy, cleanChain: this.cleanChain, integrity: this.integrity, elapsedSeconds: this.elapsed, completed: this.finished } as const;
    const result: WarehouseRunResult = { ...base, rank: WarehouseDirector.rank(base) };
    this.onExit?.(this.decisions > 0 ? result : null);
  }

  private updateInbound(deltaTime: number): void {
    if (this.inboundAudit) {
      this.updateInboundAudit(deltaTime);
      return;
    }
    if (this.inboundTimer < 0 || this.inboundOpened) return;
    this.inboundTimer -= deltaTime;
    this.hud?.setInbound(this.inboundTimer);
    if (this.inboundTimer > 0) return;
    this.inboundOpened = true;
    this.hud?.setInbound(0);
    this.setWorkersVisible(true);
    this.environment.spawnInboundFreight();
    this.environment.setRearDoorOpen(1);
    this.sound.play('warning');
    this.sound.play('shutter');
    this.hud?.flash('INBOUND FREIGHT // REAR DOOR OPENING', 2.4);
    if (this.isBreachCase() && this.intruder) {
      this.intruder.startEntry();
      this.breachEntryTimer = getAccessibilityPreferences().reducedMotion ? 1.2 : 4.2;
      this.hud?.appendSystem('INBOUND CONTROL', 'Five authorized workers and incoming pallets recorded. Rear personnel beam remains active.');
    }
  }

  private updateInboundAudit(deltaTime: number): void {
    const audit = this.inboundAudit;
    if (!audit) return;
    if (this.inboundFugitive && audit.phase === 'fugitive-search') {
      this.inboundFugitive.setFugitivePaused(this.view === 'console');
      const clearlyObserved = this.view === 'drone'
        && this.opticalAimHeld
        && this.worldTargetAcquired(this.inboundFugitive.subjectPosition(), 19, 0.955);
      this.inboundFugitive.setClearlyObserved(clearlyObserved, deltaTime);
      audit.fugitiveZone = this.inboundFugitive.fugitiveZone;
      audit.escapeSeconds = this.inboundFugitive.escapeSeconds;
      this.intrusionHudAccumulator += deltaTime;
      if (this.intrusionHudAccumulator >= 0.16) {
        this.intrusionHudAccumulator = 0;
        this.hud?.setSecurityAlert(
          audit.escapeSeconds !== null
            ? `SERVICE C ESCAPE ATTEMPT // ${audit.escapeSeconds.toFixed(1)} SEC`
            : `EMERGENCY SEARCH // LAST MOTION ${warehouseZoneLabel(audit.fugitiveZone)}`
        );
        this.refreshCaseHud();
      }
    }
    const intake = this.inboundIntakeCargo;
    if (!intake) return;
    this.inboundIntakeElapsed += deltaTime;
    intake.position.z -= deltaTime * 1.75;
    if (this.inboundIntakeElapsed < 1.75) return;
    this.inboundIntakeCargo = null;
    const delivery = INBOUND_AUDIT_DELIVERIES[audit.activeIndex];
    if (!delivery) return;
    if (delivery.suspicious) {
      this.failInboundDelivery('CRITICAL BREACH // CONTRADICTORY PACKAGE ENTERED SORTATION');
      return;
    }
    this.completeInboundDelivery('sorted');
  }

  private completeInboundDelivery(resolution: 'sorted' | 'evidence'): void {
    const audit = this.inboundAudit;
    if (!audit) return;
    const index = audit.activeIndex;
    const delivery = INBOUND_AUDIT_DELIVERIES[index];
    const cargo = this.inboundCargo[index];
    const worker = this.workers[index];
    if (!delivery || !cargo || !worker) return;
    audit.resolutions[index] = resolution;
    audit.resolved = Math.max(audit.resolved, index + 1);
    cargo.visible = false;
    worker.visible = false;
    this.correct += 1;
    this.decisions += 1;
    this.cleanChain += 1;
    this.environment.setConveyorsRunning(false);
    this.environment.setVerifiedIntakeState('ready');
    this.sound.play(resolution === 'evidence' ? 'lockdown' : 'resolved');
    this.hud?.setIntegrity(this.integrity, this.stage, this.cleanChain);
    updateWarehouseSave((save) => {
      save.inboundAuditResolved = audit.resolved;
      save.totalDecisions += 1;
      save.correctDecisions += 1;
      save.bestCleanChain = Math.max(save.bestCleanChain, this.cleanChain);
      if (!save.discoveredCases.includes('freight-sort')) save.discoveredCases.push('freight-sort');
    });
    this.hud?.flash(
      resolution === 'evidence'
        ? `DELIVERY ${index + 1}/5 RESOLVED // PACKAGE HELD AS EVIDENCE`
        : `DELIVERY ${index + 1}/5 SORTED // VERIFIED INTAKE ROUTING COMPLETE`,
      2.8
    );
    if (audit.resolved >= audit.total) {
      audit.phase = 'complete';
      this.hud?.setSecurityAlert('DELIVERIES RESOLVED 5/5 // FOUR SORTED // ONE EVIDENCE HOLD');
      window.setTimeout(() => {
        updateWarehouseSave((save) => { save.inboundAuditResolved = 0; });
        this.advance();
      }, 1600);
      return;
    }
    window.setTimeout(() => {
      if (this.inboundAudit === audit) this.activateInboundDelivery(index + 1);
    }, 1100);
  }

  private failInboundDelivery(message: string): void {
    const audit = this.inboundAudit;
    if (!audit || this.decisionCommitted) return;
    this.decisionCommitted = true;
    this.decisions += 1;
    this.integrity = Math.max(0, this.integrity - 1);
    this.cleanChain = 0;
    this.environment.setConveyorsRunning(false);
    this.environment.setVerifiedIntakeState('evidence');
    this.sound.play('reject');
    this.hud?.setIntegrity(this.integrity, this.stage, this.cleanChain);
    this.hud?.flash(`${message} // RESTORING DELIVERY ${audit.activeIndex + 1} CHECKPOINT`, 3.3);
    updateWarehouseSave((save) => {
      save.totalDecisions += 1;
      save.criticalBreaches += 1;
      save.storyMistakes += 1;
    });
    window.setTimeout(() => this.restartInboundDelivery(), 1700);
  }

  private restartInboundDelivery(): void {
    const audit = this.inboundAudit;
    if (!audit) return;
    const index = audit.activeIndex;
    const delivery = INBOUND_AUDIT_DELIVERIES[index];
    const cargo = this.inboundCargo[index];
    const worker = this.workers[index];
    if (!delivery || !cargo || !worker) return;
    if (this.carried) this.cargoRope.detach();
    this.carried = null;
    this.inboundIntakeCargo = null;
    cargo.position.copy(this.environment.packagePosition(delivery.aisle, delivery.bay));
    cargo.visible = true;
    cargo.carried = false;
    worker.setInspectionPosition(delivery.inspectionPosition);
    worker.visible = true;
    this.inboundFugitive = null;
    this.environment.resetSecurityZones();
    this.environment.setLightingMode('normal');
    this.sound.setEmergency(false);
    this.activateInboundDelivery(index);
  }

  private updateBreach(deltaTime: number): void {
    const intruder = this.intruder;
    if (!intruder || !this.intrusion) return;
    if (this.breachEntryTimer > 0) {
      this.breachEntryTimer -= deltaTime;
      if (this.breachEntryTimer <= 0) this.beginEmergencySearch();
      return;
    }
    if (!this.breachStarted) return;
    intruder.setPaused(this.view === 'console');
    this.intrusionHudAccumulator += deltaTime;
    if (this.intrusionHudAccumulator >= 0.12) {
      this.intrusionHudAccumulator = 0;
      this.syncIntrusionHud();
    }
  }

  private beginEmergencySearch(): void {
    if (!this.intruder || !this.intrusion || this.breachStarted) return;
    this.breachStarted = true;
    this.environment.setRearDoorOpen(0);
    this.environment.setLightingMode('emergency');
    this.sound.play('power-loss');
    this.sound.setEmergency(true);
    this.sound.play('metal-impact');
    for (const [index, worker] of this.workers.entries()) {
      worker.moveToMuster(WAREHOUSE_LAYOUT.muster[index % WAREHOUSE_LAYOUT.muster.length]);
    }
    this.intruder.activateSearch();
    this.zoneStatuses.receiving = 'motion';
    this.hud?.setInbound(null);
    this.hud?.setSecurityAlert('EMERGENCY // PERSONNEL COUNT +1 // CONTAINMENT ACTIVE');
    this.hud?.appendSystem(
      'SECURITY CONTROL',
      'PERSONNEL COUNT +1 // WORKERS VERIFIED AT MUSTER // Four interior feeds unlocked. Gather rear history, headcount mismatch, and a live optical tag.'
    );
    this.hud?.flash('EMERGENCY MODE // UNLISTED PERSON INSIDE // NON-COMBAT CONTAINMENT', 3.8);
    this.view = 'cctv';
    this.selectedZone = 'receiving';
    this.hud?.setView(this.view);
    this.syncPointerMode();
    this.syncIntrusionHud();
  }

  /**
   * Keep the lens inside the room it is meant to be looking at.
   *
   * The chase arm has occlusion probes, but they answer "is something between the drone and
   * the camera", which is a different question from "is the camera anywhere useful". A camera
   * that ends up beyond a wall, under the slab or up inside a light fitting passes every
   * probe and renders a black frame, because from in there the only surfaces are back-facing
   * and back faces are not drawn.
   *
   * A hard clamp costs four comparisons and removes the whole category. The ceiling is the
   * one worth stating: the fixtures hang to 9.14 and the drone can reach 8.35, so an arm that
   * adds 1.25m of height puts the lens at 9.6 - inside a shade, looking at the inside of a
   * cone that is drawn from the outside only.
   */
  /**
   * How far the arm may extend before it leaves the building.
   *
   * ## Clamping each axis was the wrong shape of fix
   *
   * The first version clamped x, z and y independently, which stops the lens leaving the
   * shell and does something worse instead: it SLIDES the camera along the wall it hit. Fly
   * into the west aisle and the arm ends up pressed flat against the cladding, 30cm off it,
   * with a dim grey panel filling three quarters of the frame and the warehouse visible past
   * one edge. Reported as a black panel blocking the aisle labels, and it is the wall.
   *
   * A chase camera near an obstacle SHORTENS. It does not step sideways, because the whole
   * point of the arm is that it stays on the line between the lens and the thing being
   * chased - move it off that line and the shot stops being about the drone.
   *
   * So this returns a DISTANCE along the anchor-to-desired ray, the same currency the
   * occlusion probes already return, and the caller takes whichever is smaller. It is a slab
   * test per axis: for each of the six planes, how far along the ray until it is crossed.
   */
  private cameraBoundsDistance(anchor: THREE.Vector3, desired: THREE.Vector3): number {
    const shell = WAREHOUSE_LAYOUT.shell;
    this.cameraDirection.copy(desired).sub(anchor);
    const distance = this.cameraDirection.length();
    if (distance < 0.001 || !Number.isFinite(distance)) return 0;
    this.cameraDirection.multiplyScalar(1 / distance);

    const limits: Array<[number, number, number]> = [
      [anchor.x, this.cameraDirection.x, -shell.wallX + 0.7],
      [anchor.x, this.cameraDirection.x, shell.wallX - 0.7],
      [anchor.z, this.cameraDirection.z, shell.rearZ + 0.7],
      [anchor.z, this.cameraDirection.z, shell.frontZ - 0.7],
      [anchor.y, this.cameraDirection.y, 0.6],
      /*
       * 8.9, and the 20cm above 8.7 matter. At the drone's ceiling of 8.35 the anchor sits
       * at 8.57, and against a plane at 8.7 the arm's climb allowed only 0.32m - under the
       * tight-camera threshold, so flying at max altitude FORCED the first-person fallback
       * every frame. The fixtures hang to 9.14; 8.9 leaves 24cm clear and the arm at 0.81m,
       * which is tight and legal rather than collapsed.
       */
      [anchor.y, this.cameraDirection.y, 8.9],
    ];
    let allowed = distance;
    for (const [origin, direction, plane] of limits) {
      if (Math.abs(direction) < 1e-5) continue;
      const t = (plane - origin) / direction;
      if (t > 0) allowed = Math.min(allowed, t);
    }
    return Math.max(0, allowed);
  }

  private applyCamera(deltaTime = 0): void {
    if (!this.camera) return;
    /*
     * A cut is a cut. The chase camera damps toward its mark, which is right while flying
     * and wrong the instant the shot changes: coming off door C the lens was at x -30,
     * OUTSIDE the west wall, and the first fifth of a second of drone control was spent
     * interpolating across the building - straight through the cladding, which renders as a
     * pale wash filling the frame. Caught on the cut frame of a capture of the opening
     * sweep, and it was never an intro bug: every TAB back to the drone did it, from
     * wherever the camera it left happened to be standing.
     */
    const shot = this.containmentResponse ? 'containment' : this.pursuit ? 'pursuit' : this.view;
    const snap = shot !== this.lastShot;
    this.lastShot = shot;
    if (this.containmentResponse) {
      const pose = WAREHOUSE_SECURITY_ZONES[this.containmentResponse.zone].camera;
      this.droneVisual.visible = true;
      this.cameraPosition.copy(pose.position);
      this.cameraTarget.copy(pose.target);
      if (this.camera.getFOV() !== pose.fov) this.camera.setFOV(pose.fov);
    } else if (this.pursuit) {
      const pose = this.pursuit.currentCamera();
      this.droneVisual.visible = true;
      this.cameraPosition.copy(pose.position);
      this.cameraTarget.copy(pose.target);
      if (this.camera.getFOV() !== pose.fov) this.camera.setFOV(pose.fov);
    } else if (this.view === 'drone') {
      /*
       * The lens breathes with the throttle.
       *
       * A fixed FOV makes 5.2 m/s feel like a slow pan because nothing on screen says
       * "speed" except parallax, and a warehouse aisle is mostly parallel lines that give
       * little of it. Four degrees of widening at full stick is under the threshold where
       * anyone names it and comfortably over the one where they feel it - the standard
       * sprint-kick trick, sized down for a machine that tops out at jogging pace.
       *
       * Damped at 4 rather than snapped so a tap of W does not pulse the lens; only held
       * movement opens it. Reduced-motion players get none of it.
       */
      const fovTarget = 68 + (getAccessibilityPreferences().reducedMotion ? 0 : this.throttle * 4);
      this.chaseFov = THREE.MathUtils.damp(this.chaseFov, fovTarget, 4, deltaTime > 0 ? deltaTime : 1 / 60);
      if (Math.abs(this.camera.getFOV() - this.chaseFov) > 0.01) this.camera.setFOV(this.chaseFov);
      const forward = new THREE.Vector3(Math.sin(this.yaw), Math.sin(this.pitch), Math.cos(this.yaw)).normalize();
      if (this.perspective === 'first') {
        // Hide the body and keep the lens inside the drone's collision envelope. Pushing
        // the lens forward made it enter a rack when the player turned beside shelving.
        this.droneVisual.visible = false;
        this.cameraPosition.copy(this.drone.position).add(new THREE.Vector3(0, 0.1, 0));
        this.cameraTarget.copy(this.cameraPosition).addScaledVector(forward, 10);
      } else {
        this.droneVisual.visible = true;
        const chaseForward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
        this.cameraAnchor.copy(this.drone.position).add(new THREE.Vector3(0, 0.22, 0));
        this.desiredCameraPosition.copy(this.cameraAnchor)
          .addScaledVector(chaseForward, -THIRD_PERSON_ARM)
          .add(new THREE.Vector3(0, THIRD_PERSON_HEIGHT, 0));
        /*
         * Whichever runs out first: something solid in the way, or the building itself.
         * Both are answered as a distance along the same ray, so the arm just takes the
         * smaller and stays on the line between the lens and the drone.
         */
        const availableDistance = Math.min(
          this.cameraClearanceDistance(this.cameraAnchor, this.desiredCameraPosition),
          this.cameraBoundsDistance(this.cameraAnchor, this.desiredCameraPosition)
        );
        if (!Number.isFinite(this.cameraArmDistance) || deltaTime <= 0 || snap) {
          this.cameraArmDistance = availableDistance;
        } else if (this.cameraArmDistance > availableDistance) {
          // Retract immediately; letting interpolation cross a rack is what caused black frames.
          this.cameraArmDistance = availableDistance;
        } else {
          this.cameraArmDistance = THREE.MathUtils.damp(
            this.cameraArmDistance,
            availableDistance,
            5.5,
            Math.min(deltaTime, 1 / 30)
          );
        }
        this.cameraDirection.copy(this.desiredCameraPosition).sub(this.cameraAnchor).normalize();
        this.desiredCameraPosition.copy(this.cameraAnchor).addScaledVector(this.cameraDirection, this.cameraArmDistance);
        this.desiredCameraTarget.copy(this.drone.position).addScaledVector(forward, 2.4).add(new THREE.Vector3(0, -0.15, 0));
        const blend = deltaTime > 0 && !snap ? 1 - Math.exp(-7.5 * deltaTime) : 1;
        this.cameraPosition.lerp(this.desiredCameraPosition, blend);
        // The lerp path can cross a rack even when both endpoints are clear, so clamp the
        // actual rendered position as well as the destination.
        const renderedDistance = this.resolveCameraOcclusion(this.cameraAnchor, this.cameraPosition, this.cameraPosition);
        this.cameraTarget.lerp(this.desiredCameraTarget, blend);
        /*
         * ## Why this threshold got lower
         *
         * At 0.7 the fallback fired constantly. An aisle is seven metres wide with racking on
         * both sides, the arm is 3.06m, and every turn swung it into a rack - so the game
         * dropped to the drone lens, hid the body, and stayed there. Reported as right mouse
         * leaving the camera stuck in first person, and the optical hold was innocent: what
         * the player saw was the chase camera unable to find room to exist.
         *
         * 0.34, which is inside the drone's own hull, so this now means what it was written
         * to mean - the lens is genuinely inside something - rather than merely "close". A
         * short arm is a tight over-the-shoulder shot and that is a perfectly good picture;
         * it does not need rescuing.
         */
        if (Math.min(this.cameraArmDistance, renderedDistance) < TIGHT_CAMERA_THRESHOLD) {
          // Fall back to the collision-safe drone lens instead of rendering from inside a
          // shelf or filling the view with the drone body.
          this.droneVisual.visible = false;
          this.cameraPosition.set(this.drone.position.x, this.drone.position.y + 0.1, this.drone.position.z);
          this.cameraTarget.copy(this.cameraPosition).addScaledVector(forward, 10);
        }
      }
    } else if (this.view === 'cctv') {
      this.droneVisual.visible = true;
      if (this.handoff > 0) {
        /*
         * The opening sweep is the three door cameras, in order, and nothing else.
         *
         * It used to be door A, then a hardcoded pose at the rear dock, then the console.
         * The dock shot was aimed at z -23.2 while the rear door sits at z -29 and the truck
         * beyond that, so it framed six metres of empty apron: a brown expanse with a single
         * beacon in it. It was caught by pulling frames out of a screen recording, and it is
         * the same fault the door cameras themselves once had - a camera named after a thing
         * it is not pointed at.
         *
         * Rather than re-aim a one-off pose, the intro now reuses the door poses themselves.
         * Three things fall out of that. The shots are the ones
         * `scripts/warehouse-cameras.ts` already fails the build over, so the intro cannot
         * drift out of frame without the harness saying so. The player is shown the exact
         * three feeds they spend the mission switching between, in the same order as the
         * chip row underneath them. And there is no bespoke camera left in this file to rot.
         */
        const pose = WAREHOUSE_DOORS[this.selectedDoor].camera;
        this.cameraPosition.copy(pose.position);
        this.cameraTarget.copy(pose.target);
        if (this.camera.getFOV() !== pose.fov) this.camera.setFOV(pose.fov);
      } else if (this.isBreachCase() || this.usesInboundResponseCamera()) {
        const pose = WAREHOUSE_SECURITY_ZONES[this.selectedZone].camera;
        this.cameraPosition.copy(pose.position);
        this.cameraTarget.copy(pose.target);
        if (this.camera.getFOV() !== pose.fov) this.camera.setFOV(pose.fov);
      } else {
        const pose = WAREHOUSE_DOORS[this.selectedDoor].camera;
        this.cameraPosition.copy(pose.position);
        this.cameraTarget.copy(pose.target);
        if (this.camera.getFOV() !== pose.fov) this.camera.setFOV(pose.fov);
      }
    } else {
      if (this.camera.getFOV() !== 60) this.camera.setFOV(60);
      this.cameraPosition.set(-20.5, 8.85, 24.2);
      this.cameraTarget.set(0, 2.25, -2.5);
    }
    /*
     * The kick rides on the composed position rather than the drone, and is applied after
     * the bounds and occlusion work rather than before. Both orderings matter: shaking the
     * airframe would fight the flight model, and kicking before the slab test would let a
     * recoil push the lens through a wall - which is exactly the class of bug that cost this
     * mission its black screen. Two centimetres cannot escape a clamp it is applied after.
     *
     * The look target deliberately does NOT take the kick. Moving both leaves the shot
     * translating with nothing to measure it against, which reads as drift; moving only the
     * eye rotates the view a fraction around the subject, which reads as an impact.
     */
    KICK_RIGHT.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    KICK_UP.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    this.feedback.applyKick(this.cameraPosition, KICK_RIGHT, KICK_UP);
    this.camera.position.copy(this.cameraPosition);
    CAMERA_MATRIX.lookAt(this.cameraPosition, this.cameraTarget, this.camera.up);
    this.camera.quaternion.setFromRotationMatrix(CAMERA_MATRIX);
  }

  private cameraClearanceDistance(anchor: THREE.Vector3, desired: THREE.Vector3): number {
    this.cameraDirection.copy(desired).sub(anchor);
    const distance = this.cameraDirection.length();
    if (distance < 0.001 || !Number.isFinite(distance)) {
      return 0;
    }
    this.cameraDirection.multiplyScalar(1 / distance);
    this.cameraProbeRight.crossVectors(this.cameraDirection, THREE.Object3D.DEFAULT_UP);
    if (this.cameraProbeRight.lengthSq() < 0.001) this.cameraProbeRight.set(1, 0, 0);
    else this.cameraProbeRight.normalize();
    this.cameraProbeUp.crossVectors(this.cameraProbeRight, this.cameraDirection).normalize();
    let safeDistance = distance;
    for (const [right, up] of CAMERA_PROBE_OFFSETS) {
      this.cameraProbeOrigin.copy(anchor)
        .addScaledVector(this.cameraProbeRight, right)
        .addScaledVector(this.cameraProbeUp, up);
      this.cameraRaycaster.set(this.cameraProbeOrigin, this.cameraDirection);
      this.cameraRaycaster.near = 0.04;
      this.cameraRaycaster.far = distance;
      const hit = this.cameraRaycaster.intersectObject(this.environment.root, true)
        .find((entry) => this.isCameraBlocker(entry.object));
      if (hit) safeDistance = Math.min(safeDistance, Math.max(0.18, hit.distance - 0.28));
    }
    return safeDistance;
  }

  /**
   * ## Why the screen still went black after the slab clamp
   *
   * The last fix bounded the DESIRED camera position inside the shell and declared the job
   * done. But the rendered position is not the desired position - it is a lerp toward it,
   * and that lerped point is clamped by THIS function, which until now asked only the
   * raycast. Two reasons the raycast cannot answer "am I still indoors":
   *
   *  - `isCameraBlocker` skips every PlaneGeometry, a rule that exists so floor decals and
   *    label quads never block the arm - and the exterior ground and several wall pieces
   *    ARE planes, so the ray sails through the very surfaces that mark the outside.
   *  - The clerestory band is a true opening, in both senses: the daylight module cuts a
   *    real hole in the wall so its light is honest. A hole blocks nothing. Swing the
   *    camera near the top of a wall and the arm's swept path crosses the gap, the ray
   *    finds no geometry, and the lens exits the building - which renders as the whole
   *    diorama going black behind a live HUD, because outside is back-faced walls and void.
   *
   * So the rendered position takes the SAME slab bound the desired one does. The two are
   * min-ed because they answer different questions - "is something in the way" and "does
   * the building end" - and the arm has to respect whichever comes first.
   */
  private resolveCameraOcclusion(anchor: THREE.Vector3, desired: THREE.Vector3, result: THREE.Vector3): number {
    const safeDistance = Math.min(
      this.cameraClearanceDistance(anchor, desired),
      this.cameraBoundsDistance(anchor, desired)
    );
    this.cameraDirection.copy(desired).sub(anchor);
    const distance = this.cameraDirection.length();
    if (distance < 0.001 || !Number.isFinite(distance)) {
      result.copy(anchor);
      return 0;
    }
    this.cameraDirection.multiplyScalar(1 / distance);
    result.copy(anchor).addScaledVector(this.cameraDirection, safeDistance);
    return safeDistance;
  }

  /**
   * ## The PlaneGeometry exemption was the black screen
   *
   * This used to skip every PlaneGeometry, so decals and markings could never snag the
   * camera arm. But EVERY LABEL in the warehouse is a plane - aisle signs, door signage,
   * bay ranges, station and conveyor plates, via createWarehouseLabelGeometry - and their
   * material is unlit MeshBasicMaterial on a #07100d ground, luma about seven.
   *
   * So the arm was free to park the lens centimetres BEHIND a 1.45-metre near-black plate.
   * A plate that close covers roughly a hundred degrees of view, which is exactly the width
   * of the reported black band - and whether the lens tucks behind one depends on the
   * damped lerp's history, not just the final yaw, which is why the same bearing would go
   * black on a fast turn and render fine approached slowly. Proven live: a scripted
   * full-circle spin hit a fifteen-step black band that a 12px-step retrace of the same
   * arc could not reproduce.
   *
   * The exemption is by NAME now. Floor markings stay exempt because rays from the drone
   * to the camera can graze them at shallow angles and the arm must not jitter on paint;
   * everything else flat - and above all the labels - blocks like the solid signage it
   * visually is.
   */
  private isCameraBlocker(object: THREE.Object3D): boolean {
    if (!(object instanceof THREE.Mesh)) return false;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (materials.every((material) => material.transparent && material.opacity < 0.45)) return false;
    return !/(Lens|Lamp|Status|Beacon|Rain|Dust|Tape|ShrinkWrap|AisleGuide|SafetyChevron|FloorWear|WetGround|Sky)/i.test(object.name);
  }

  private nearestCargoDistance(): number {
    const droneAt = this.drone.getWorldPosition(new THREE.Vector3());
    return [this.cargo, this.duplicateCargo]
      .filter((entry): entry is WarehouseCargoNode => entry !== null)
      .reduce(
        (best, entry) =>
          Math.min(best, entry.getWorldPosition(new THREE.Vector3()).distanceTo(droneAt)),
        Number.POSITIVE_INFINITY
      );
  }

  /**
   * Re-claim the render camera if anything took it - and it is not paranoia, it is the
   * black screen.
   *
   * ## What the black frames actually were
   *
   * Measured off a capture: during the blackouts the diorama region is EXACTLY zero while
   * the DOM console stays live and the post chain keeps presenting - so the scene was being
   * rendered, from somewhere with nothing in it. The engine names the somewhere:
   * `GameLoop.renderFrame` falls back to `world.fallbackCamera` whenever
   * `getActiveCamera()` fails, and that camera is constructed at (0, 5, 10) looking at the
   * origin - which in this game is empty fogged space. Pure black, with scanlines.
   *
   * The view-target stack holds WeakRefs and this method already existed to re-push after
   * something disturbed it, but it is REACTIVE: it repairs on the next warehouse tick, so
   * every disturbance still rendered at least one frame from (0, 5, 10), and a sustained
   * disturbance rendered seconds of them. The flicker in the reports - black, normal,
   * black, half a second apart - is this method and the disturbance taking turns.
   */
  private keepActive(): void {
    if (this.mounted && this.camera && !this.camera.isActive()) this.camera.setActive(true);
  }

  public override tickPrePhysics(deltaTime: number): void {
    super.tickPrePhysics(deltaTime);
    if (!this.mounted) return;
    this.elapsed += deltaTime;
    this.input?.tick(deltaTime);
    const droneSpeed = deltaTime > 0
      ? this.drone.position.distanceTo(this.previousDroneAudioPosition) / deltaTime
      : 0;
    this.sound.setDroneLoad(Math.min(1, droneSpeed / DRONE_CRUISE_SPEED), this.view === 'drone' && this.handoff <= 0);
    this.previousDroneAudioPosition.copy(this.drone.position);
    this.droneRotorSpin += deltaTime * 27;
    if (this.droneRotorBlades) {
      for (const [index, [x, z]] of DRONE_ROTOR_POSITIONS.entries()) {
        this.droneRotorTransform.position.set(x, 0.02, z);
        this.droneRotorTransform.rotation.set(0, this.droneRotorSpin * (index % 2 ? -1 : 1), 0);
        this.droneRotorTransform.updateMatrix();
        this.droneRotorBlades.setMatrixAt(index, this.droneRotorTransform.matrix);
      }
      this.droneRotorBlades.instanceMatrix.needsUpdate = true;
    }
    if (this.droneStatusMaterial) {
      this.droneStatusMaterial.emissiveIntensity = 1.7 + Math.sin(this.elapsed * 4.2) * 0.45;
    }
    this.ropeAnchor.copy(this.drone.position).add(new THREE.Vector3(0, -0.48, 0));
    this.cargoRope.tick(deltaTime, this.ropeAnchor);
    this.feedback.setOpticalHeld(this.opticalAimHeld && this.view === 'drone');
    this.feedback.setTargets(this.opticalAimHeld ? this.opticalTargets() : []);
    this.updateDeliveredCargo(deltaTime);
    this.hud?.tick(deltaTime);
    this.environment.tick(deltaTime);
    this.celStyle.tick(this, deltaTime);
    this.visitor?.rig.idle(deltaTime);
    this.updatePursuit(deltaTime);
    this.updateContainmentResponse(deltaTime);
    this.updateInbound(deltaTime);
    this.updateBreach(deltaTime);
    if (this.bellReminder > 0) {
      this.bellReminder -= deltaTime;
      if (this.bellReminder <= 0) this.hud?.flash('PERIMETER CONTACT REMAINS UNRESOLVED // CHECK SERVICE CAMERAS', 2.4);
    }
    if (this.handoff > 0) {
      this.handoff -= deltaTime;
      this.updateIntroSweep();
      if (this.handoff <= 0) {
        // Hand the operator back the door `beginCurrent` chose. The sweep borrowed the
        // selection to drive the shots, and that choice is load-bearing: it is deliberately
        // NOT the visitor's door, so the player has to look for them. Ending the intro on
        // service C would have quietly answered the mission's first question.
        if (this.introReturnDoor) {
          this.selectedDoor = this.introReturnDoor;
          this.introReturnDoor = null;
          this.syncDoorHud();
        }
        this.applyView('drone');
        this.hud?.flash('THREE FEEDS LIVE // DRONE CONTROL PASSED', 1.6);
      }
    }
    this.applyCamera(deltaTime);
    /*
     * ViewTargetCameraNode owns the rotation while its THREE.Camera child stays at identity.
     * Passing the child's local quaternion left scan rings, sweeps and brackets world-aligned
     * and edge-on after the player turned. Read the composed world rotation only after this
     * frame's camera has been positioned, so the feedback is a true billboard with no yaw lag.
     */
    if (this.camera) this.camera.getCamera().getWorldQuaternion(FEEDBACK_FACING);
    else FEEDBACK_FACING.identity();
    this.feedback.tick(deltaTime, FEEDBACK_FACING);
    this.keepActive();
  }

  public unmount(): void {
    if (!this.mounted) return;
    this.mounted = false;
    const world = this.getWorld();
    if (this.input) world?.inputManager?.removeInputHandler(this.input);
    this.input = null;
    world?.gameContainer?.removeEventListener('contextmenu', this.blockContextMenu);
    window.removeEventListener('mouseup', this.releaseOptical, true);
    window.removeEventListener('blur', this.releaseOpticalOnBlur);
    document.removeEventListener('pointerlockchange', this.releaseOpticalOnLockChange);
    if (this.suspendedPlayerController) {
      world?.inputManager?.addInputHandler(this.suspendedPlayerController);
      this.suspendedPlayerController = null;
    }
    this.hud?.destroy();
    this.hud = null;
    if (this.savedFallbackCamera) {
      const worldNow = this.getWorld();
      if (worldNow) worldNow.fallbackCamera = this.savedFallbackCamera;
      this.savedFallbackCamera = null;
    }
    this.feedback.dispose();
    this.sound.dispose();
    this.camera?.setActive(false);
    world?.inputManager?.exitPointerLock();
    setPointerLockAllowed(false);
    setCursorVisible(true);
    this.celStyle.setEnabled(this, false);
    this.environment.setCelStyleEnabled(false);
    const post = world?.postProcessManager;
    if (post && this.savedPost) {
      if (this.savedPost.tone) post.configureEffect(ENGINE.PostProcessPass.ToneMapping, this.savedPost.tone as Record<string, unknown>);
      if (this.savedPost.bloom) post.configureEffect(ENGINE.PostProcessPass.Bloom, this.savedPost.bloom as Record<string, unknown>);
    }
    this.savedPost = null;
  }

  public override endPlay(): boolean {
    this.unmount();
    this.clearCaseEntities();
    return super.endPlay();
  }
}
