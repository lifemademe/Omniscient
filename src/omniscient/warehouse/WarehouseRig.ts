import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { adaptiveScore } from '../audio/AdaptiveScore.js';
import { getAccessibilityPreferences } from '../accessibility/preferences.js';
import { setRoomTone } from '../audio/RoomTone.js';
import { seedFrom } from '../core/rng.js';

import { WarehouseEnvironment } from './art.js';
import { captureWarehouseFrame } from './archive.js';
import { CASE_DECK, STORY_MOVEMENTS, TOOL_UNLOCK_STAGE, WAREHOUSE_DECK_VERSION } from './content.js';
import { WarehouseDirector } from './director.js';
import { createWarehouseVisitor, WarehouseCargoNode, WarehouseWorkerNode } from './entities.js';
import { loadWarehouseSave, updateWarehouseSave } from './persistence.js';
import { WarehouseAudio } from './WarehouseAudio.js';
import { WarehouseHUD } from './WarehouseHUD.js';

import type { MouseButton } from '@gnsx/genesys.js';
import type { WarehouseVisitor } from './entities.js';
import type {
  GeneratedWarehouseCase,
  WarehouseDecision,
  WarehouseMode,
  WarehouseRunConfig,
  WarehouseRunResult,
  WarehouseTool,
} from './types.js';

export interface WarehouseRigOptions extends ENGINE.SceneNodeOptions {
  mode: WarehouseMode;
  seed?: string;
}

type WarehouseView = 'drone' | 'cctv' | 'console';

const CAMERA_MATRIX = new THREE.Matrix4();
const DRONE_START = new THREE.Vector3(0, 3.2, 12.2);
const ALTITUDES = [1.8, 3.2, 5.4] as const;
const WORKER_VESTS = ['#c9a934', '#d66f2f', '#7b9d3c', '#d6bd45', '#c05f32', '#9bb23c'] as const;
const RANK_ORDER = ['TRAINEE', 'OPERATOR', 'INSPECTOR', 'CONTROLLER', 'OVERSEER', 'OMNISCIENT'] as const;

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
    if (event.repeat && !['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) return false;
    this.held.add(event.code);
    switch (event.code) {
      case 'Escape': this.rig.requestExit(); return true;
      case 'Tab': event.preventDefault(); this.rig.cycleView(); return true;
      case 'KeyF': this.rig.toggleGrip(); return true;
      case 'KeyR': this.rig.recover(); return true;
      case 'KeyQ': this.rig.changeAltitude(-1); return true;
      case 'KeyE': this.rig.changeAltitude(1); return true;
      case 'Digit1': this.rig.tryDecision('release'); return true;
      case 'Digit2': this.rig.tryDecision('quarantine'); return true;
      case 'Digit3': this.rig.tryDecision('return'); return true;
      case 'Digit4': this.rig.tryDecision('clear'); return true;
      case 'Digit5': this.rig.tryDecision('hold'); return true;
      case 'Digit6': this.rig.tryDecision('verify'); return true;
      case 'Space': this.rig.scan(); return true;
      default: return ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code);
    }
  }

  public override handleKeyUp(event: KeyboardEvent): boolean {
    this.held.delete(event.code);
    return ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code);
  }

  public override handleMouseMove(event: MouseEvent): boolean {
    if (document.pointerLockElement) {
      this.rig.look(event.movementX, event.movementY);
      return true;
    }
    return false;
  }

  public override handleMouseDown(_button: MouseButton, event: MouseEvent): boolean {
    if (!document.pointerLockElement) {
      const canvas = this.rig.getWorld()?.gameContainer?.querySelector('canvas');
      if (canvas && event.target === canvas) void canvas.requestPointerLock?.();
    }
    this.rig.scan();
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
  private cameraPosition = DRONE_START.clone();
  private cameraTarget = new THREE.Vector3(0, 2.8, 0);
  private yaw = Math.PI;
  private pitch = -0.04;
  private altitudeIndex = 1;
  private view: WarehouseView = 'cctv';
  private mounted = false;
  private input: WarehouseInput | null = null;
  private hud: WarehouseHUD | null = null;
  private readonly sound = new WarehouseAudio();
  private workers: WarehouseWorkerNode[] = [];
  private visitor: WarehouseVisitor | null = null;
  private cargo: WarehouseCargoNode | null = null;
  private duplicateCargo: WarehouseCargoNode | null = null;
  private carried: WarehouseCargoNode | null = null;
  private activeCase: GeneratedWarehouseCase | null = null;
  private scanned = false;
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

  public constructor() {
    super();
    this.isRoot = false;
  }

  public override initialize(options?: WarehouseRigOptions): void {
    super.initialize(options);
    this.mode = options?.mode ?? 'story';
    this.seed = options?.seed ?? (this.mode === 'daily' ? WarehouseDirector.utcDailySeed() : `${this.mode}-${Date.now()}`);
    const save = loadWarehouseSave();
    this.storyMovement = this.mode === 'story' && !save.storyCompleted
      ? Math.max(0, Math.min(STORY_MOVEMENTS.length - 1, save.storyMovement))
      : 0;
    this.tools = [...new Set<WarehouseTool>(['optical', ...save.unlockedTools])];
    if (this.mode === 'daily') this.tools = ['optical', 'history', 'thermal', 'uv', 'xray', 'acoustic'];
    const config: WarehouseRunConfig = { mode: this.mode, seed: this.seed, deckVersion: WAREHOUSE_DECK_VERSION, unlockedTools: this.tools };
    this.director = new WarehouseDirector(config);
    this.environment.build();
    this.add(this.environment.root);
    this.buildDrone();
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
    world.inputManager?.addInputHandler(this.input);
    this.hud = new WarehouseHUD(container, this.mode, () => this.requestExit(), () => this.recover());
    this.hud.onDecision((decision) => this.tryDecision(decision));
    this.hud.onTool((tool) => {
      this.activeTool = tool;
      this.hud?.setTools(this.tools, this.activeTool);
      this.hud?.flash(`${tool.toUpperCase()} CHANNEL ACTIVE`, 1.2);
    });
    this.hud.setTools(this.tools, this.activeTool);
    this.hud.setControlsVisible(!loadWarehouseSave().tutorialComplete);
    this.handoff = getAccessibilityPreferences().reducedMotion ? 0.2 : 4.8;
    this.hud.setView(this.view);
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
    post.configureEffect(ENGINE.PostProcessPass.ToneMapping, { enabled: true, mode: THREE.ACESFilmicToneMapping, exposure: 0.9 });
    post.configureEffect(ENGINE.PostProcessPass.Bloom, { enabled: true, strength: 0.22, threshold: 0.82, radius: 0.42 });
  }

  private buildDrone(): void {
    const shell = ENGINE.MeshNode.create({
      name: 'DroneShell',
      geometry: new THREE.CylinderGeometry(0.36, 0.48, 0.24, 12),
      material: new THREE.MeshStandardMaterial({ color: '#273d3a', roughness: 0.48, metalness: 0.56 }),
      castShadow: true,
    });
    shell.rotation.z = Math.PI / 2;
    const eye = ENGINE.MeshNode.create({
      name: 'DroneEye',
      geometry: new THREE.SphereGeometry(0.16, 16, 10),
      material: new THREE.MeshStandardMaterial({ color: '#09100f', emissive: '#315f55', emissiveIntensity: 1.2, roughness: 0.22 }),
    });
    eye.position.set(0, -0.02, -0.42);
    const grip = ENGINE.MeshNode.create({
      name: 'MagneticGripper',
      geometry: new THREE.CylinderGeometry(0.18, 0.24, 0.12, 12),
      material: new THREE.MeshStandardMaterial({ color: '#b08a3f', roughness: 0.55, metalness: 0.5 }),
    });
    grip.position.set(0, -0.42, 0);
    this.drone.add(shell, eye, grip);
    this.add(this.drone);
  }

  private buildCamera(): void {
    const camera = ENGINE.ViewTargetCameraNode.create({ name: 'WarehouseCamera', fov: 68, near: 0.05, far: 180, startActive: true });
    this.add(camera);
    this.camera = camera;
    this.applyCamera();
  }

  private buildWorkers(): void {
    const routes = [
      [new THREE.Vector3(-9, 0, -15), new THREE.Vector3(-8, 0, -10), new THREE.Vector3(-3, 0, -12)],
      [new THREE.Vector3(-3, 0, -15), new THREE.Vector3(0, 0, -10), new THREE.Vector3(2, 0, -13)],
      [new THREE.Vector3(3, 0, -15), new THREE.Vector3(5, 0, -10), new THREE.Vector3(8, 0, -13)],
      [new THREE.Vector3(9, 0, -15), new THREE.Vector3(10, 0, -9), new THREE.Vector3(4, 0, -11)],
      [new THREE.Vector3(0, 0, -16), new THREE.Vector3(12, 0, -7), new THREE.Vector3(14, 0, 8.5)],
    ];
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
      this.spawnCase(this.director?.caseForStage(this.stage, this.tools) ?? null);
      this.hud?.setCase(`STAGE ${String(this.stage).padStart(2, '0')}`, this.activeCase?.definition.briefing ?? 'Await case.');
    }
  }

  private beginStoryMovement(): void {
    const movement = STORY_MOVEMENTS[this.storyMovement];
    // The finale teaches historical comparison before the channel becomes a permanent
    // Night Shift unlock, so the incident loans it for this movement.
    if (movement.finale && !this.tools.includes('history')) {
      this.tools.push('history');
      this.hud?.setTools(this.tools, this.activeTool);
      this.hud?.flash('HISTORICAL CCTV CHANNEL LOANED // INCIDENT COMPARISON REQUIRED', 3.2);
    }
    this.stage = this.storyMovement + 1;
    adaptiveScore.setState('warehouse', movement.finale ? 3 : this.storyMovement >= 2 ? 1 : 0);
    this.storyCase = 0;
    this.hud?.setCase(movement.title, movement.objective);
    this.hud?.flash(movement.objective, 3.6);
    this.inboundTimer = movement.inboundIn ?? -1;
    this.inboundOpened = this.inboundTimer < 0;
    this.hud?.setInbound(this.inboundTimer >= 0 ? this.inboundTimer : null);
    this.setWorkersVisible(false);
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
    }
    if (definition.id === 'package-7018') {
      data.packageId = '7018'; data.aisle = 7; data.bay = 18; data.expectedWeight = 40; data.measuredWeight = 30;
    }
    this.spawnCase(data);
  }

  private spawnCase(data: GeneratedWarehouseCase | null): void {
    if (!data) return;
    this.clearCaseEntities();
    this.activeCase = data;
    this.scanned = false;
    this.visitorVerified = false;
    this.freightVerified = false;
    this.workerVerificationRequested = false;
    const cargo = WarehouseCargoNode.create({ name: `Cargo-${data.packageId}` });
    cargo.configure(data);
    cargo.position.copy(this.environment.packagePosition(data.aisle, data.bay));
    this.add(cargo);
    this.cargo = cargo;
    if (data.definition.id === 'package-7018') {
      const duplicateData: GeneratedWarehouseCase = { ...data, measuredWeight: 50 };
      const duplicate = WarehouseCargoNode.create({ name: 'Cargo-7018-Duplicate' });
      duplicate.configure(duplicateData);
      duplicate.position.copy(this.environment.packagePosition(8, data.bay));
      this.add(duplicate);
      this.duplicateCargo = duplicate;
      this.environment.setDuplicateAisle(true);
    }
    this.visitor = createWarehouseVisitor(seedFrom(data.visitorName), data.visitorName);
    this.add(this.visitor.root);
    this.hud?.showCase(data, false);
    const hasVisitor = data.definition.subjectType !== 'worker' && data.definition.id !== 'freight-sort';
    this.hud?.setBell(hasVisitor, hasVisitor ? 1 : 0);
    this.bellReminder = hasVisitor ? 20 : -1;
    if (hasVisitor) this.sound.play('bell');
    if (data.definition.id === 'package-7018') {
      this.sound.play('anomaly');
      adaptiveScore.setState('warehouse', 3);
    }
  }

  private clearCaseEntities(): void {
    if (this.carried) {
      this.carried.removeFromParent();
      this.carried = null;
    }
    this.cargo?.removeFromParent();
    this.cargo = null;
    this.duplicateCargo?.removeFromParent();
    this.duplicateCargo = null;
    this.environment.setDuplicateAisle(false);
    this.visitor?.root.removeFromParent();
    this.visitor = null;
  }

  public drive(x: number, y: number, deltaTime: number): void {
    if (this.view !== 'drone' || this.handoff > 0 || this.finished) return;
    const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    const desired = forward.multiplyScalar(-y).addScaledVector(right, x);
    if (desired.lengthSq() > 1) desired.normalize();
    const nearWorker = this.workers.some((worker) => worker.visible && worker.position.distanceTo(this.drone.position) < 2.2);
    const speed = nearWorker ? 2.4 : 5.2;
    const previous = this.drone.position.clone();
    this.drone.position.addScaledVector(desired, deltaTime * speed);
    this.drone.position.x = THREE.MathUtils.clamp(this.drone.position.x, -14.8, 14.8);
    this.drone.position.z = THREE.MathUtils.clamp(this.drone.position.z, -16.2, 16.7);
    this.environment.constrainDrone(this.drone.position, previous);
    this.drone.position.y = THREE.MathUtils.damp(this.drone.position.y, ALTITUDES[this.altitudeIndex], 5.5, deltaTime);
    this.drone.rotation.y = this.yaw;
  }

  public look(dx: number, dy: number): void {
    if (this.view !== 'drone' || this.handoff > 0) return;
    this.yaw -= dx * 0.0022;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.0018, -0.72, 0.5);
  }

  public changeAltitude(direction: number): void {
    this.altitudeIndex = THREE.MathUtils.clamp(this.altitudeIndex + Math.sign(direction), 0, ALTITUDES.length - 1);
    this.hud?.flash(`ALTITUDE ${this.altitudeIndex === 0 ? 'LOW' : this.altitudeIndex === 1 ? 'WORK' : 'INSPECTION'}`, 1);
  }

  /** Soft reset for a wedged approach; it costs service time, never integrity. */
  public recover(): void {
    if (this.finished) return;
    if (this.carried) {
      const cargo = this.carried;
      cargo.removeFromParent();
      this.add(cargo);
      cargo.position.copy(this.environment.stationPositions.return).add(new THREE.Vector3(0, 0, -2));
      cargo.carried = false;
      this.carried = null;
    }
    this.drone.position.copy(DRONE_START);
    this.yaw = Math.PI;
    this.pitch = -0.04;
    this.altitudeIndex = 1;
    this.elapsed += 12;
    this.sound.play('warning');
    this.hud?.flash('SERVICE RECOVERY COMPLETE // +12 SECONDS', 2.2);
  }

  public cycleView(): void {
    this.view = this.view === 'drone' ? 'cctv' : this.view === 'cctv' ? 'console' : 'drone';
    this.hud?.setView(this.view);
    this.hud?.flash(`${this.view.toUpperCase()} VIEW`, 1.1);
    if (this.view !== 'drone' && document.pointerLockElement) void document.exitPointerLock?.();
  }

  public cycleTool(direction: number): void {
    if (!this.tools.length) return;
    const current = Math.max(0, this.tools.indexOf(this.activeTool));
    this.activeTool = this.tools[(current + this.tools.length + Math.sign(direction)) % this.tools.length];
    this.hud?.setTools(this.tools, this.activeTool);
    this.hud?.flash(`${this.activeTool.toUpperCase()} CHANNEL ACTIVE`, 1.2);
  }

  public controllerDecision(direction: 'up' | 'down' | 'left' | 'right'): void {
    const active = this.activeCase;
    if (!active) return;
    if (active.definition.id === 'package-7018') {
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

  public scan(): void {
    if (!this.activeCase || this.handoff > 0 || this.finished) return;
    if (this.view === 'console') {
      this.hud?.flash('CONSOLE HOLDS RECORDS // ACQUIRE SUBJECT THROUGH DRONE OR CCTV');
      return;
    }
    if (this.activeCase.definition.subjectType === 'worker') {
      const worker = this.workers.find((entry) => entry.visible && !entry.authorized) ?? this.workers.find((entry) => entry.visible);
      if (!worker) {
        this.hud?.flash('NO PERSONNEL TARGET IN FRAME');
        return;
      }
    } else if (this.view === 'drone' && this.nearestCargoDistance() > 10) {
      this.hud?.flash(`TARGET DISTANT // AISLE ${this.activeCase.aisle} BAY ${String(this.activeCase.bay).padStart(2, '0')}`);
      return;
    }
    this.scanned = true;
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
        updateWarehouseSave((save) => {
          save.archiveRecords = [...save.archiveRecords.filter((entry) => entry.id !== record.id), record].slice(-32);
        });
      });
    }
    if (this.activeCase.definition.id === 'package-7018') {
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
        true
      );
    } else {
      this.hud?.showCase(this.activeCase, true);
    }
    const toolRequired = this.activeCase.definition.requiredTools.find((tool) => !['optical', this.activeTool].includes(tool));
    if (toolRequired && this.activeTool !== toolRequired) this.hud?.flash(`${toolRequired.toUpperCase()} CHANNEL REQUIRED TO COMPLETE COMPARISON`);
    else this.hud?.flash('EVIDENCE RECORDED // COMPARE BEFORE DECISION', 1.6);
  }

  public toggleGrip(): void {
    if (this.view !== 'drone' || this.finished) return;
    if (this.carried) {
      const worldPosition = this.carried.getWorldPosition(new THREE.Vector3()).sub(this.position);
      this.carried.removeFromParent();
      this.add(this.carried);
      this.carried.position.copy(worldPosition).setY(0);
      this.carried.carried = false;
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
    if (cargoAt.distanceTo(droneAt) > 4.2) {
      this.hud?.flash('GRIP TARGET OUT OF RANGE');
      return;
    }
    cargo.removeFromParent();
    this.drone.add(cargo);
    cargo.position.set(0, -0.86, -0.2);
    cargo.carried = true;
    this.carried = cargo;
    this.sound.play('grip');
    this.hud?.flash(`LOAD ${this.activeCase?.packageId ?? ''} SECURED`);
  }

  public tryDecision(decision: WarehouseDecision): void {
    const active = this.activeCase;
    if (!active || !this.scanned || this.finished) {
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
    if (active.definition.id === 'package-7018' && decision === 'verify') {
      this.visitorVerified = true;
      this.sound.play('resolved');
      this.hud?.flash('HUMAN VERIFICATION REQUESTED // FRONT SUBJECT HELD OUTSIDE', 2.8);
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
    if (active.definition.id === 'package-7018' && decision === 'quarantine' && !this.visitorVerified) {
      this.hud?.flash('PRESERVE BOTH RECORDS // REQUEST HUMAN VERIFICATION FOR THE VISITOR');
      return;
    }
    const cargoDecision = active.definition.id !== 'freight-sort' && ['release', 'quarantine', 'return'].includes(decision);
    if (cargoDecision) {
      if (!this.carried) {
        this.hud?.flash('SECURE THE PACKAGE WITH THE GRIPPER');
        return;
      }
      const station = this.environment.stationPositions[decision as 'release' | 'quarantine' | 'return'];
      if (this.drone.position.distanceTo(station) > 4.4) {
        this.hud?.flash(`MOVE LOAD TO ${decision.toUpperCase()} STATION`);
        return;
      }
    }
    this.resolveDecision(decision);
  }

  private resolveDecision(decision: WarehouseDecision): void {
    const active = this.activeCase;
    if (!active) return;
    this.decisions += 1;
    const correct = decision === active.definition.correctDecision;
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
    this.hud?.flash(active.definition.critical ? '7018 QUARANTINED // OUTBOUND LOCK CYCLING EMPTY' : 'CASE RESOLVED', active.definition.critical ? 4 : 1.5);
    if (active.definition.critical) this.sound.play('anomaly');
    if (active.definition.critical) this.environment.sealQuarantine();
    window.setTimeout(() => this.advance(), active.definition.critical ? 3500 : 850);
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
      updateWarehouseSave((save) => { save.storyMovement = this.storyMovement; });
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
    this.sound.play('warning');
    this.sound.play('shutter');
    this.hud?.flash('INBOUND FREIGHT // REAR DOOR OPENING', 2.4);
  }

  private applyCamera(): void {
    if (!this.camera) return;
    if (this.view === 'drone') {
      const forward = new THREE.Vector3(Math.sin(this.yaw), Math.sin(this.pitch), Math.cos(this.yaw)).normalize();
      // The first-person lens sits just beyond the opaque procedural hull.
      this.cameraPosition.copy(this.drone.position).addScaledVector(forward, 0.58).add(new THREE.Vector3(0, 0.1, 0));
      this.cameraTarget.copy(this.cameraPosition).addScaledVector(forward, 10);
    } else if (this.view === 'cctv') {
      if (this.handoff > 2.4 && this.handoff <= 3.5) {
        this.cameraPosition.set(0, 5.2, -14.2);
        this.cameraTarget.set(0, 1.8, -23.2);
      } else {
        this.cameraPosition.set(0, 3.25, 15.7);
        this.cameraTarget.set(0, 1.45, 22.8);
      }
    } else {
      this.cameraPosition.set(0, 17.8, 11.5);
      this.cameraTarget.set(0, 0.2, -1.5);
    }
    this.camera.position.copy(this.cameraPosition);
    CAMERA_MATRIX.lookAt(this.cameraPosition, this.cameraTarget, this.camera.up);
    this.camera.quaternion.setFromRotationMatrix(CAMERA_MATRIX);
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

  private keepActive(): void {
    if (this.mounted && this.camera && !this.camera.isActive()) this.camera.setActive(true);
  }

  public override tickPrePhysics(deltaTime: number): void {
    super.tickPrePhysics(deltaTime);
    if (!this.mounted) return;
    this.elapsed += deltaTime;
    this.input?.tick(deltaTime);
    this.hud?.tick(deltaTime);
    this.environment.tick(deltaTime);
    this.visitor?.rig.idle(deltaTime);
    this.updateInbound(deltaTime);
    if (this.inboundOpened) this.environment.setRearDoorOpen(THREE.MathUtils.damp((this.environment.rearDoor?.position.y ?? 3) / 9.2, 1, 2.2, deltaTime));
    if (this.bellReminder > 0) {
      this.bellReminder -= deltaTime;
      if (this.bellReminder <= 0) this.hud?.flash('FRONT ENTRY REMAINS WAITING // NO REPEATED BELL', 2.4);
    }
    if (this.handoff > 0) {
      this.handoff -= deltaTime;
      if (this.handoff <= 3.5 && this.handoff + deltaTime > 3.5) {
        this.hud?.flash('REAR DOCK CAMERA ACQUIRED', 1.2);
      }
      if (this.handoff <= 2.4 && this.handoff + deltaTime > 2.4) {
        this.view = 'console';
        this.hud?.setView(this.view);
        this.hud?.flash('MANIFESTS SYNCHRONIZED // AISLES MAPPED', 1.2);
      }
      if (this.handoff <= 1.2 && this.handoff + deltaTime > 1.2) this.hud?.flash('DRONE CONTROL PASSED', 1.4);
      if (this.handoff <= 0) {
        this.view = 'drone';
        this.hud?.setView(this.view);
      }
    }
    this.applyCamera();
    this.keepActive();
  }

  public unmount(): void {
    if (!this.mounted) return;
    this.mounted = false;
    const world = this.getWorld();
    if (this.input) world?.inputManager?.removeInputHandler(this.input);
    this.input = null;
    this.hud?.destroy();
    this.hud = null;
    this.sound.dispose();
    this.camera?.setActive(false);
    if (document.pointerLockElement) void document.exitPointerLock?.();
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
