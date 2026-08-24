import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { adaptiveScore } from '../audio/AdaptiveScore.js';
import { getAccessibilityPreferences } from '../accessibility/preferences.js';
import { setCursorVisible, setPointerLockAllowed } from '../art/cursor.js';
import { setRoomTone } from '../audio/RoomTone.js';
import { seedFrom } from '../core/rng.js';

import { WarehouseEnvironment } from './art.js';
import { captureWarehouseFrame } from './archive.js';
import { CASE_DECK, STORY_MOVEMENTS, TOOL_UNLOCK_STAGE, WAREHOUSE_DECK_VERSION } from './content.js';
import { WarehouseDirector } from './director.js';
import { createWarehouseVisitor, WarehouseCargoNode, WarehouseWorkerNode } from './entities.js';
import { loadWarehouseSave, updateWarehouseSave } from './persistence.js';
import { WarehouseAudio } from './WarehouseAudio.js';
import { DroneCargoRope } from './DroneCargoRope.js';
import { WarehouseHUD } from './WarehouseHUD.js';
import { WarehousePursuit } from './WarehousePursuit.js';
import { WAREHOUSE_DOORS, WAREHOUSE_DOOR_IDS } from './WarehouseServiceDoors.js';
import { WarehouseContainmentResponse } from './WarehouseContainmentResponse.js';
import { WarehouseIntruderNode } from './WarehouseIntruder.js';
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
  WarehouseDecision,
  WarehouseDoorId,
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

function isTextEntry(target: EventTarget | null): boolean {
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
    if (isTextEntry(event.target)) return false;
    // Q and E join the repeat list: they nudge a continuous height now rather than stepping
    // between three bands, so holding one should climb rather than move you 85cm and stop.
    if (event.repeat && !['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'].includes(event.code)) return false;
    this.held.add(event.code);
    switch (event.code) {
      case 'Escape': this.rig.requestExit(); return true;
      case 'Tab': event.preventDefault(); this.rig.cycleView(); return true;
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
    else if (buttonIndex === 3) this.rig.cycleView();
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
  private camera: ENGINE.ViewTargetCameraNode | null = null;
  private drone = ENGINE.SceneNode.create({ name: 'WarehouseDrone', position: DRONE_START.clone() });
  private droneVisual = ENGINE.SceneNode.create({ name: 'WarehouseDroneVisual' });
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
  /** How much stick the player is holding, 0..1. Feeds the FOV breathe in applyCamera. */
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
  private visitor: WarehouseVisitor | null = null;
  private cargo: WarehouseCargoNode | null = null;
  private duplicateCargo: WarehouseCargoNode | null = null;
  private carried: WarehouseCargoNode | null = null;
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
  private handoff = 4.8;
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
    this.handoff = getAccessibilityPreferences().reducedMotion ? 0.2 : 4.8;
    this.hud.setView(this.view);
    this.hud.setOpticalAim(false);
    this.syncPointerMode();
    this.sound.start();
    setRoomTone(null);
    adaptiveScore.setState('warehouse', 0);
    this.configurePost();
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
    post.configureEffect(ENGINE.PostProcessPass.ToneMapping, { enabled: true, mode: THREE.ACESFilmicToneMapping, exposure: 1.08 });
    post.configureEffect(ENGINE.PostProcessPass.Bloom, { enabled: true, strength: 0.2, threshold: 0.86, radius: 0.4 });
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
    const hull = new THREE.MeshStandardMaterial({ color: '#69707a', roughness: 0.5, metalness: 0.22 });
    const dark = new THREE.MeshStandardMaterial({ color: '#09110f', roughness: 0.68, metalness: 0.38 });
    const brass = new THREE.MeshStandardMaterial({ color: '#b08a3f', roughness: 0.52, metalness: 0.58 });
    const shell = ENGINE.MeshNode.create({
      name: 'DroneShell',
      geometry: new THREE.CylinderGeometry(0.36, 0.48, 0.24, 12),
      material: hull,
      castShadow: true,
    });
    shell.rotation.z = Math.PI / 2;
    const dome = ENGINE.MeshNode.create({
      name: 'DroneAvionicsDome',
      geometry: new THREE.SphereGeometry(0.32, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.56),
      material: hull,
      castShadow: true,
    });
    dome.position.y = 0.08;
    const eye = ENGINE.MeshNode.create({
      name: 'DroneEye',
      geometry: new THREE.SphereGeometry(0.16, 16, 10),
      material: new THREE.MeshStandardMaterial({ color: '#09100f', emissive: '#315f55', emissiveIntensity: 1.2, roughness: 0.22 }),
    });
    eye.position.set(0, -0.02, -0.42);
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
      intensity: 15,
      distance: 11,
      decay: 1.35,
      position: new THREE.Vector3(0, -0.16, -0.44),
    });

    // A hot little glass under the lens, so the source is visible on the drone itself and not
    // only in what it lights. A beam with no lamp at the end of it reads as a bug.
    const lampGlass = ENGINE.MeshNode.create({
      name: 'DroneLandingGlass',
      geometry: new THREE.SphereGeometry(0.07, 10, 8),
      material: new THREE.MeshStandardMaterial({
        color: '#ffe6c4',
        emissive: '#ffc98a',
        emissiveIntensity: 3.4,
        roughness: 0.24,
      }),
    });
    lampGlass.position.set(0, -0.1, -0.36);

    this.droneVisual.add(shell, dome, eye, grip, lamp, lampGlass);

    const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(0.52, 0.07, 0.08), dark, 4);
    arms.name = 'DroneRotorArms';
    arms.castShadow = true;
    const guards = new THREE.InstancedMesh(new THREE.TorusGeometry(0.25, 0.025, 8, 22), hull, 4);
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
    const inspectionFill = ENGINE.PointLightNode.create({
      name: 'DroneInspectionFill',
      color: '#a8d9c8',
      intensity: 8,
      distance: 6.5,
      decay: 1.85,
      position: new THREE.Vector3(0, 0.05, 0.34),
    });
    this.drone.add(this.droneVisual);
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
      const worker = WarehouseWorkerNode.create({ name: `WarehouseWorker-${i + 1}` });
      worker.configure(`W-${4839 + i * 941}`, routes[i][0], routes[i], WORKER_VESTS[i], i < 4);
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
    this.stage = this.storyMovement + 1;
    this.hud?.setIntegrity(this.integrity, this.stage, this.cleanChain);
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
    const caseId = movement.caseIds[this.storyCase];
    const definition = CASE_DECK.find((entry) => entry.id === caseId) ?? CASE_DECK[0];
    const base = this.director?.caseForStage(this.storyMovement * 5 + this.storyCase + 1, this.tools);
    if (!base) return;
    const data: GeneratedWarehouseCase = { ...base, definition };
    if (definition.id === 'valid-collection' && this.storyMovement === 0) {
      data.packageId = '2034'; data.aisle = 2; data.bay = 34; data.expectedWeight = 8.4; data.measuredWeight = 8.4;
      data.visitorDoorId = 'service-b'; data.authorizedDoorId = 'service-b';
      data.visitorIntent = 'collection'; data.doorTamper = false;
    }
    if (definition.id === 'door-tamper') {
      data.visitorDoorId = 'service-a'; data.authorizedDoorId = 'service-c';
      data.visitorIntent = 'intrusion'; data.doorTamper = true;
    }
    if (definition.id === 'package-5018') {
      data.packageId = '5018'; data.aisle = 5; data.bay = 18; data.expectedWeight = 40; data.measuredWeight = 30;
      data.visitorDoorId = 'service-c'; data.authorizedDoorId = 'service-c';
      data.visitorIntent = 'collection'; data.doorTamper = false;
    }
    if (definition.id === 'internal-breach') {
      data.packageId = 'UNLISTED'; data.aisle = 1; data.bay = 0; data.expectedWeight = 0; data.measuredWeight = 0;
      data.visitorName = 'UNLISTED PERSON'; data.visitorIntent = 'intrusion'; data.doorTamper = false;
      data.visitorDoorId = 'service-c'; data.authorizedDoorId = 'service-c';
    }
    this.spawnCase(data);
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
      this.visitor = createWarehouseVisitor(seedFrom(data.visitorName), data.visitorName, data.visitorDoorId);
      this.add(this.visitor.root);
    }
    const occupiedIndex = WAREHOUSE_DOOR_IDS.indexOf(data.visitorDoorId);
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
    this.hud?.showCase(data, this.evidence, this.intrusion);
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
    this.hud?.setIntrusion(null);
    this.environment.setPursuitLights(this.activeCase?.visitorDoorId ?? 'service-a', false);
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
    if (this.view !== 'drone' || this.handoff > 0 || this.finished || this.isCinematicActive()) return;
    const lift = Math.sin(this.pitch);
    const flat = Math.cos(this.pitch);
    const forward = new THREE.Vector3(Math.sin(this.yaw) * flat, lift * 0.62, Math.cos(this.yaw) * flat);
    const right = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const desired = forward.multiplyScalar(-y).addScaledVector(right, x);
    if (desired.lengthSq() > 1) desired.normalize();
    this.throttle = desired.length();
    const nearWorker = this.workers.some((worker) => worker.visible && worker.position.distanceTo(this.drone.position) < 2.2);
    const speed = nearWorker ? 2.4 : 5.2;
    const previous = this.drone.position.clone();
    this.drone.position.addScaledVector(desired, deltaTime * speed);
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
      cargo.position.copy(this.environment.stationPositions.return).add(new THREE.Vector3(0, 0, -2));
      cargo.quaternion.identity();
      cargo.carried = false;
      this.carried = null;
    }
    this.drone.position.copy(DRONE_START);
    this.yaw = Math.PI;
    this.pitch = -0.04;
    this.altitude = ALTITUDES[1];
    this.setOpticalAim(false);
    this.perspective = 'third';
    this.cameraArmDistance = THIRD_PERSON_DISTANCE;
    this.elapsed += 12;
    this.sound.play('warning');
    this.hud?.flash('SERVICE RECOVERY COMPLETE // +12 SECONDS', 2.2);
  }

  public cycleView(): void {
    if (this.isCinematicActive()) return;
    this.setOpticalAim(false);
    this.view = this.view === 'drone' ? 'cctv' : this.view === 'cctv' ? 'console' : 'drone';
    this.hud?.setView(this.view);
    this.hud?.flash(`${this.view.toUpperCase()} VIEW`, 1.1);
    this.syncPointerMode();
    if (this.view === 'cctv') {
      if (this.isBreachCase()) this.inspectSelectedZone();
      else this.inspectSelectedDoor();
    }
  }

  public cycleDoor(direction: number): void {
    if (this.isCinematicActive() || this.finished) return;
    if (this.isBreachCase()) {
      const current = Math.max(0, WAREHOUSE_SECURITY_ZONE_IDS.indexOf(this.selectedZone));
      const step = Math.sign(direction) || 1;
      this.selectZone(
        WAREHOUSE_SECURITY_ZONE_IDS[(current + WAREHOUSE_SECURITY_ZONE_IDS.length + step) % WAREHOUSE_SECURITY_ZONE_IDS.length]
      );
      return;
    }
    if (this.view !== 'cctv') {
      this.view = 'cctv';
      this.hud?.setView(this.view);
      this.syncPointerMode();
    }
    const current = Math.max(0, WAREHOUSE_DOOR_IDS.indexOf(this.selectedDoor));
    const step = Math.sign(direction) || 1;
    this.selectedDoor = WAREHOUSE_DOOR_IDS[(current + WAREHOUSE_DOOR_IDS.length + step) % WAREHOUSE_DOOR_IDS.length];
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
    if (!hasVisitor || this.selectedDoor !== active.visitorDoorId) {
      if (this.doorStatuses[this.selectedDoor] === 'unseen') {
        this.doorStatuses[this.selectedDoor] = 'clear';
        this.environment.setServiceDoorStatus(this.selectedDoor, 'clear');
      }
      this.syncDoorHud();
      this.hud?.flash(`${this.doorLabel(this.selectedDoor)} // CLEAR`, 1.1);
      return;
    }
    this.evidence.located = true;
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
      this.hud?.flash(`${this.doorLabel(this.selectedDoor)} // CONTACT LOCATED`, 1.4);
    }
    this.syncDoorHud();
    this.hud?.showCase(active, this.evidence);
  }

  private replayDoorEvent(): void {
    if (!this.doorEventAvailable || !this.visitor || this.isCinematicActive()) return;
    this.selectedDoor = this.activeCase?.visitorDoorId ?? this.selectedDoor;
    this.view = 'cctv';
    this.visitor.rig.gesture('open');
    this.sound.play('tamper');
    this.syncDoorHud();
    this.hud?.setView(this.view);
    this.hud?.flash('RECORDED EVENT // PRE-AUTHORIZATION HATCH TEST', 2.1);
    this.syncPointerMode();
  }

  private syncDoorHud(): void {
    const states: WarehouseDoorSnapshot[] = WAREHOUSE_DOOR_IDS.map((id) => ({
      id,
      status: this.doorStatuses[id],
      selected: id === this.selectedDoor,
    }));
    this.hud?.setDoorStates(states);
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
    this.hud?.showCase(active, this.evidence, intrusion);
  }

  private isBreachCase(): boolean {
    return this.activeCase?.definition.id === 'internal-breach';
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
          body: `${this.doorLabel(active.visitorDoorId)} is occupied. Acquire the visitor credential and entrance telemetry before comparing authorization.`,
          source: 'system',
        };
      }
      return {
        name: 'PERIMETER CONTROL',
        body: active.doorTamper && this.evidence.tamper
          ? `${this.doorLabel(active.visitorDoorId)} recorded a credential-reader bypass and cargo-hatch force event.`
          : `${this.doorLabel(active.visitorDoorId)} is occupied. Authorized destination: ${this.doorLabel(active.authorizedDoorId)}.`,
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
        body: `Package ${active.packageId} is listed at aisle ${active.aisle}, bay ${String(active.bay).padStart(2, '0')}. Expected mass ${active.expectedWeight.toFixed(1)} kilograms.`,
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
    if (this.view === 'cctv' && (direction === 'left' || direction === 'right')) {
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
    if (active.definition.id === 'door-tamper') {
      if (direction === 'left' || direction === 'down') this.tryDecision('deny-lockdown');
      else this.tryDecision('release');
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
    const decisions: readonly WarehouseDecision[] = ['release', 'quarantine', 'return', 'clear', 'hold', 'verify'];
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
      if (!this.inboundOpened) {
        this.hud?.flash('REAR FREIGHT LOAD HAS NOT ARRIVED');
        return;
      }
      this.evidence.cargo = true;
    } else if (this.view === 'cctv') {
      this.inspectSelectedDoor();
      if (this.selectedDoor !== this.activeCase.visitorDoorId || !this.evidence.located) {
        this.hud?.flash(`${this.doorLabel(this.selectedDoor)} // NO VISITOR TARGET`);
        return;
      }
      this.evidence.visitor = true;
      this.evidence.authorization = true;
      if (this.activeCase.doorTamper) this.evidence.tamper = true;
    } else {
      if (this.nearestCargoDistance() > 10) {
        this.hud?.flash(`TARGET DISTANT // AISLE ${this.activeCase.aisle} BAY ${String(this.activeCase.bay).padStart(2, '0')}`);
        return;
      }
      this.evidence.cargo = true;
    }
    this.sound.play('scan');
    this.hud?.pulseScan();
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
          save.archiveRecords = [...save.archiveRecords.filter((entry) => entry.id !== record.id), record].slice(-32);
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
        this.evidence
      );
    } else {
      this.hud?.showCase(this.activeCase, this.evidence);
    }
    const toolRequired = this.activeCase.definition.requiredTools.find((tool) => !['optical', this.activeTool].includes(tool));
    if (toolRequired && this.activeTool !== toolRequired) this.hud?.flash(`${toolRequired.toUpperCase()} CHANNEL REQUIRED TO COMPLETE COMPARISON`);
    else if (this.activeCase.definition.id === 'door-tamper') {
      const count = Number(this.evidence.action) + Number(this.evidence.authorization) + Number(this.evidence.tamper);
      this.hud?.flash(`EVIDENCE STACK ${count} / 3 // ${count === 3 ? 'DENY + LOCKDOWN ENABLED' : 'CONTINUE COMPARISON'}`, 2.2);
    } else if (this.evidence.visitor && this.evidence.cargo) {
      this.hud?.flash(`VISITOR + PACKAGE VERIFIED // ROUTE TO ${this.doorLabel(this.activeCase.authorizedDoorId)}`, 2.1);
    } else {
      this.hud?.flash('EVIDENCE RECORDED // ACQUIRE THE SECOND SUBJECT RECORD', 1.8);
    }
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
    if (this.view !== 'drone' || this.finished || this.isCinematicActive() || this.isBreachCase()) return;
    if (this.carried) {
      const cargo = this.cargoRope.detach() ?? this.carried;
      cargo.position.y = 0;
      cargo.quaternion.identity();
      cargo.carried = false;
      this.carried = null;
      this.sound.play('grip');
      this.hud?.flash('LOAD RELEASED');
      return;
    }
    const droneAt = this.drone.getWorldPosition(new THREE.Vector3());
    const cargo = [this.cargo, this.duplicateCargo]
      .filter((entry): entry is WarehouseCargoNode => entry !== null)
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
    this.hud?.flash(`LOAD ${this.activeCase?.packageId ?? ''} SECURED`);
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
    this.containmentResponse.destroy();
    this.containmentResponse = null;
    this.hud?.setPursuit(false);
    this.hud?.setCctvTimestampOffset(0);
    this.hud?.appendSystem('LOCAL RESPONSE', 'SECURED SECTOR ENTERED // EVIDENCE TRANSFER COMPLETE // FEED CLOSED BEFORE CONTACT');
    this.hud?.flash('LOCAL RESPONSE COMPLETE // NORMAL POWER RECOVERING', 3);
    this.environment.setLightingMode('recovery');
    this.sound.setEmergency(false);
    this.sound.play('recovery');
    this.hud?.setSecurityAlert('SECURED // LOCAL RESPONSE COMPLETE // POWER RECOVERY');
    window.setTimeout(() => this.advance(), getAccessibilityPreferences().reducedMotion ? 300 : 1100);
  }

  public tryDecision(decision: WarehouseDecision): void {
    const active = this.activeCase;
    if (!active || this.finished || this.isCinematicActive() || this.decisionCommitted || active.definition.id === 'internal-breach') return;
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
      this.hud?.flash('SCAN AND CROSS-CHECK BEFORE DECISION');
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
      this.hud?.flash(`HUMAN VERIFICATION REQUESTED // ${this.doorLabel(active.visitorDoorId)} HELD`, 2.8);
      return;
    }
    if (active.definition.id === 'freight-sort' && !this.inboundOpened) {
      this.hud?.flash('INBOUND LOAD NOT PRESENT // HOLD FOR DOCK COUNTDOWN');
      return;
    }
    if (active.definition.id === 'freight-sort' && decision === 'verify') {
      this.freightVerified = true;
      this.sound.play('scan');
      this.hud?.flash('EIGHT LOADS VERIFIED // THREE ROUTES READY', 2.2);
      return;
    }
    if (active.definition.id === 'freight-sort' && decision === 'release' && !this.freightVerified) {
      this.hud?.flash('VERIFY THE COMPLETE LOAD BEFORE STARTING SORT');
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
    const cargoDecision = active.definition.id !== 'freight-sort' && ['release', 'quarantine', 'return'].includes(decision);
    if (cargoDecision) {
      if (!this.carried) {
        this.hud?.flash('SECURE THE PACKAGE WITH THE GRIPPER');
        return;
      }
      if (decision === 'release') {
        const nearest = this.environment.nearestDoorHandoff(this.drone.position);
        const requiredDoor = active.visitorIntent === 'intrusion' ? active.visitorDoorId : active.authorizedDoorId;
        if (nearest.distance > 4.4) {
          this.hud?.flash(`MOVE LOAD TO ${this.doorLabel(requiredDoor)} CARGO HANDOFF`);
          return;
        }
        if (nearest.id !== requiredDoor) {
          this.sound.play('reject');
          this.elapsed += 3;
          this.hud?.flash(`DESTINATION LOCK MISMATCH // AUTHORIZED ${this.doorLabel(requiredDoor)} // LOAD RETAINED`, 2.7);
          return;
        }
      } else {
        const station = this.environment.stationPositions[decision as 'quarantine' | 'return'];
        if (this.drone.position.distanceTo(station) > 4.4) {
          this.hud?.flash(`MOVE LOAD TO ${decision.toUpperCase()} STATION`);
          return;
        }
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
    if (decision === 'release') this.performCargoHandoff();
    if (decision === 'deny-lockdown') {
      this.environment.lockdownServiceDoor(active.visitorDoorId);
      this.doorStatuses[active.visitorDoorId] = 'locked';
      this.syncDoorHud();
      this.sound.play('lockdown');
    }
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
    this.hud?.flash(is5018 ? '5018 QUARANTINED // OUTBOUND LOCK CYCLING EMPTY' : 'CASE RESOLVED', is5018 ? 4 : 1.5);
    if (is5018) this.sound.play('anomaly');
    if (decision === 'quarantine') this.environment.sealQuarantine();
    const deliveryDelay = decision === 'release'
      ? getAccessibilityPreferences().reducedMotion ? 900 : 5200
      : is5018 ? 3500 : 850;
    window.setTimeout(() => this.advance(), deliveryDelay);
  }

  private performCargoHandoff(): void {
    const active = this.activeCase;
    const cargo = this.cargoRope.detach() ?? this.carried;
    if (!active || !cargo) return;
    const nearest = this.environment.nearestDoorHandoff(this.drone.position);
    cargo.carried = false;
    cargo.position.copy(WAREHOUSE_DOORS[nearest.id].handoffPosition);
    cargo.position.y = 0;
    cargo.quaternion.identity();
    const reducedMotion = getAccessibilityPreferences().reducedMotion;
    this.deliveredCargo = {
      node: cargo,
      from: cargo.position.clone(),
      to: WAREHOUSE_DOORS[nearest.id].visitorPosition.clone().add(new THREE.Vector3(0, 0.08, 0)),
      elapsed: 0,
      duration: reducedMotion ? 0.08 : 3.2,
    };
    this.carried = null;
    this.environment.cycleServiceDoor(nearest.id);
    this.hud?.setBell(false, 0);
    this.selectedDoor = nearest.id;
    this.view = 'cctv';
    if (nearest.id === active.visitorDoorId) {
      const receiver = this.visitor;
      receiver?.rig.gesture('open');
      if (receiver && active.visitorIntent === 'collection') {
        const exit = WAREHOUSE_DOORS[nearest.id].pursuit.officerStart.clone();
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
    this.pursuit = new WarehousePursuit(active.visitorDoorId, this.visitor, authored);
    this.add(this.pursuit.officer.root);
    this.pursuitPhase = 'lockdown';
    this.selectedDoor = active.visitorDoorId;
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
        if (!getAccessibilityPreferences().reducedMotion) this.environment.setPursuitLights(active.visitorDoorId, true);
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
    this.environment.setPursuitLights(active.visitorDoorId, false);
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
        if (!Number.isFinite(this.cameraArmDistance) || deltaTime <= 0) {
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
        const blend = deltaTime > 0 ? 1 - Math.exp(-7.5 * deltaTime) : 1;
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
      if (this.handoff > 2.4 && this.handoff <= 3.5) {
        this.cameraPosition.set(0, 5.2, -14.2);
        this.cameraTarget.set(0, 1.8, -23.2);
      } else if (this.isBreachCase()) {
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
    this.sound.setDroneLoad(Math.min(1, droneSpeed / 5.2), this.view === 'drone' && this.handoff <= 0);
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
    this.updateDeliveredCargo(deltaTime);
    this.hud?.tick(deltaTime);
    this.environment.tick(deltaTime);
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
      if (this.handoff <= 3.5 && this.handoff + deltaTime > 3.5) {
        this.hud?.flash('REAR DOCK CAMERA ACQUIRED', 1.2);
      }
      if (this.handoff <= 2.4 && this.handoff + deltaTime > 2.4) {
        this.view = 'console';
        this.hud?.setView(this.view);
        this.syncPointerMode();
        this.hud?.flash('MANIFESTS SYNCHRONIZED // AISLES MAPPED', 1.2);
      }
      if (this.handoff <= 1.2 && this.handoff + deltaTime > 1.2) this.hud?.flash('DRONE CONTROL PASSED', 1.4);
      if (this.handoff <= 0) {
        this.view = 'drone';
        this.hud?.setView(this.view);
        this.syncPointerMode();
      }
    }
    this.applyCamera(deltaTime);
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
    this.sound.dispose();
    this.camera?.setActive(false);
    world?.inputManager?.exitPointerLock();
    setPointerLockAllowed(false);
    setCursorVisible(true);
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
