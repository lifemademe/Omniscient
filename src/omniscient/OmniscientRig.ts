/**
 * OMNISCIENT_ - the playable rig.
 *
 * Replaces the capability spike. Assembles the workstation, the Knowledge Tree inside
 * its CRT, the intervention surface and the request sequence, then runs the two-mission
 * Jam slice end to end.
 *
 * Structure follows §176's HOME LOOP: a request resolves, knowledge updates, the machine
 * shows new growth, the next signal arrives.
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { MIRELA, TOMAS } from './content/contacts.js';
import { MISSION_01 } from './content/mission-01-transmitter.js';
import { MISSION_02 } from './content/mission-02-beacon.js';
import { Ease, Tweener } from './core/tween.js';
import { CRTSurface } from './crt/CRTSurface.js';
import { KnowledgeTree } from './crt/KnowledgeTree.js';
import { createCRTTerminal } from './geometry/hardware.js';
import { KnowledgeStore } from './knowledge/KnowledgeStore.js';
import { LocalSurface } from './link/LocalSurface.js';
import { BootSequence } from './session/BootSequence.js';
import { SessionController } from './session/SessionController.js';
import { VFX_LIBRARY } from './vfx/library.js';
import { buildContactScene } from './view/scenes.js';

import type { Contact, MissionDefinition } from './mission/types.js';
import type { CameraShot, ContactScene } from './view/ContactScene.js';

/** Stable per-playthrough seed. §123: the same knowledge must draw the same tree. */
const PLAYTHROUGH_SEED = 0x0c151e;

/** Seconds to draw new growth in, pixel by pixel (§176). */
const GROWTH_REVEAL_SECONDS = 1.8;

/** Scratch matrix for camera orientation. Reused to avoid per-frame allocation. */
const CAMERA_MATRIX = new THREE.Matrix4();

const MATERIALS = {
  chassis: new THREE.MeshStandardMaterial({ color: '#b9ad92', roughness: 0.78, metalness: 0.05 }),
  bezel: new THREE.MeshStandardMaterial({ color: '#2a2724', roughness: 0.62, metalness: 0.1 }),
  details: new THREE.MeshStandardMaterial({ color: '#6d6a63', roughness: 0.5, metalness: 0.55 }),
};

interface QueuedRequest {
  mission: MissionDefinition;
  contact: Contact;
}

/**
 * Where the player is. §176's HOME LOOP: the machine is home, a request takes you into
 * somebody's world, and resolving it brings you back to see what you learned.
 */
enum Phase {
  Boot = 'boot',
  Home = 'home',
  Contact = 'contact',
}

/** Where the workstation sits, far from the dioramas so shots never overlap. */
const WORKSTATION_ORIGIN = new THREE.Vector3(0, 0, -60);

/** Framed on the CRT: this is the shot the player should want to screenshot (§129). */
const HOME_SHOT: CameraShot = {
  position: new THREE.Vector3(0.34, 0.72, -58.62),
  target: new THREE.Vector3(0, 0.46, -59.6),
  duration: 2.0,
};

/** Seconds spent at the machine after a request resolves, before the next signal. */
const HOME_DWELL = 5.5;

@ENGINE.GameClass()
export class OmniscientRig extends ENGINE.SceneNode {
  private knowledge = new KnowledgeStore(PLAYTHROUGH_SEED);
  private surface: CRTSurface | null = null;
  private tree: KnowledgeTree | null = null;
  private phone: LocalSurface | null = null;
  private session: SessionController | null = null;
  private vfxNodes = new Map<string, ENGINE.VFXNode>();

  private queue: QueuedRequest[] = [];
  private queueIndex = 0;
  private pauseRemaining = 0;

  private phase: Phase = Phase.Boot;
  private boot: BootSequence | null = null;

  /**
   * Every diorama, built once at construction and kept hidden until its request opens.
   *
   * Attaching a subtree to the rig AFTER beginPlay has run does not render - silently,
   * with nothing in the console. Building up front also removes a construction hitch
   * between requests, which matters for §168 pacing.
   */
  private readonly scenes = new Map<string, ContactScene>();
  /** The diorama currently on view. */
  private scene: ContactScene | null = null;
  /** Position the next VFX burst should play at, set by the cue that implied it. */
  private pendingEffectPosition: THREE.Vector3 | null = null;

  /**
   * The one camera. Owned here rather than per-diorama: ViewTargetCameraNode.setActive
   * pushes its inner THREE camera onto the world's view-target stack, and a camera
   * nested inside a diorama that starts hidden never produced a usable view.
   * One camera, created before beginPlay, that moves to shots the scenes declare.
   */
  private camera: ENGINE.ViewTargetCameraNode | null = null;
  private readonly cameraTweener = new Tweener();
  private readonly cameraPosition = new THREE.Vector3(0.5, 1.35, 1.5);
  private readonly cameraTarget = new THREE.Vector3(0, 0.85, -0.5);

  /** Tree reveal animation state. */
  private revealFrom = 0;
  private revealProgress = 1;
  private pulse = 0;

  constructor() {
    super();
    this.isRoot = true;
  }

  public override initialize(options?: ENGINE.SceneNodeOptions): void {
    super.initialize(options);
    this.setTickEnabled(true);

    this.buildWorkstation();
    this.buildVfx();
    this.buildLighting();

    this.queue = [
      { mission: MISSION_01, contact: MIRELA },
      { mission: MISSION_02, contact: TOMAS },
    ];

    this.buildScenes();
    this.buildCamera();
  }

  /** Created before beginPlay so it is part of the tree the engine initialises normally. */
  private buildCamera(): void {
    this.camera = ENGINE.ViewTargetCameraNode.create({
      name: 'ContactCamera',
      // Wide-ish and slightly long: a fixed cheap camera in somebody's workshop, not a
      // cinematic rig. §187 wants one clear idea per frame, not constant motion.
      fov: 46,
      near: 0.05,
      far: 400,
      startActive: true,
      position: this.cameraPosition.clone(),
    });
    this.add(this.camera);
    this.applyCameraTransform();
  }

  /**
   * Point the camera node at the target.
   *
   * NOT Object3D.lookAt. That branches on `isCamera`, and ViewTargetCameraNode is a
   * SceneNode holding a camera rather than being one - so lookAt applies the *object*
   * convention (+Z toward the target) and the child camera, which looks down -Z, ends up
   * facing exactly backwards. Matrix4.lookAt gives the camera convention directly.
   */
  private applyCameraTransform(): void {
    if (!this.camera) return;
    this.camera.position.copy(this.cameraPosition);
    CAMERA_MATRIX.lookAt(this.cameraPosition, this.cameraTarget, this.camera.up);
    this.camera.quaternion.setFromRotationMatrix(CAMERA_MATRIX);
  }

  /** Frame a shot immediately. */
  private cutTo(shot: CameraShot): void {
    this.cameraPosition.copy(shot.position);
    this.cameraTarget.copy(shot.target);
    this.applyCameraTransform();
  }

  /** Ease to a shot. */
  private moveTo(shot: CameraShot, duration: number): void {
    const fromPosition = this.cameraPosition.clone();
    const fromTarget = this.cameraTarget.clone();

    this.cameraTweener.add(
      (t) => {
        this.cameraPosition.lerpVectors(fromPosition, shot.position, t);
        this.cameraTarget.lerpVectors(fromTarget, shot.target, t);
        this.applyCameraTransform();
      },
      { duration, easing: Ease.inOutCubic, channel: 'camera' }
    );
  }

  /** Construct every diorama the queue needs, hidden, before play begins. */
  private buildScenes(): void {
    for (const request of this.queue) {
      const sceneId = request.mission.sceneId;
      if (this.scenes.has(sceneId)) continue;

      const scene = buildContactScene(sceneId);
      if (!scene) continue;

      scene.visible = false;
      this.scenes.set(sceneId, scene);
      this.add(scene);
    }
  }

  public override beginPlay(): boolean {
    if (!super.beginPlay()) return false;

    this.configureLook();
    void this.startSession();

    return true;
  }

  // -- Workstation -------------------------------------------------------------------

  /**
   * OMNISCIENT_'s own machine. Parked well away from the Contact View dioramas: the
   * home screen and a contact's world are two different places, and the §176 home loop
   * cuts between them. Until that cut exists the contact camera is active, so the
   * workstation is simply off-shot rather than intersecting the set.
   */
  private buildWorkstation(): void {
    const parts = createCRTTerminal({ seed: 'omniscient-home-terminal', wear: 0.5 });

    const station = ENGINE.SceneNode.create({
      name: 'Workstation',
      position: WORKSTATION_ORIGIN.clone(),
    });

    station.add(
      ENGINE.MeshNode.create({ name: 'Chassis', geometry: parts.chassis, material: MATERIALS.chassis })
    );
    station.add(
      ENGINE.MeshNode.create({ name: 'Bezel', geometry: parts.bezel, material: MATERIALS.bezel })
    );
    station.add(
      ENGINE.MeshNode.create({ name: 'Details', geometry: parts.details, material: MATERIALS.details })
    );

    this.surface = new CRTSurface({ width: 192, height: 144 });
    this.tree = new KnowledgeTree(this.surface, this.knowledge.toTreeState());
    this.tree.draw(1);

    station.add(
      ENGINE.MeshNode.create({ name: 'Screen', geometry: parts.screen, material: this.surface.material })
    );

    this.add(station);
  }

  private buildVfx(): void {
    for (const [name, definition] of Object.entries(VFX_LIBRARY)) {
      // The node name is set after construction: the editor's default-subobject lint
      // requires a string literal at the create() call site, which a loop cannot give.
      const node = ENGINE.VFXNode.create({
        name: 'Effect',
        vfxDefinition: ENGINE.VFXDefinition.fromJSON(definition),
        autoStart: false,
        position: new THREE.Vector3(0.36, 0.11, 0.46),
      });
      node.setName(name);
      this.vfxNodes.set(name, node);
      this.add(node);
    }
  }

  /**
   * §187: one strong key direction plus controlled practicals beats many weak lights.
   * Warm and low, so the workshop reads as somewhere a person actually works.
   */
  private buildLighting(): void {
    this.add(
      ENGINE.DirectionalLightNode.create({
        name: 'KeyLight',
        position: new THREE.Vector3(2.5, 3.4, 2.2),
        intensity: 2.1,
        color: new THREE.Color('#ffd9a8'),
      })
    );

    this.add(
      ENGINE.HemisphereLightNode.create({
        name: 'Bounce',
        intensity: 0.5,
        color: new THREE.Color('#9fb4c9'),
        groundColor: new THREE.Color('#3a3128'),
      })
    );
  }

  private configureLook(): void {
    const world = this.getWorld();
    if (!world?.postProcessManager) return;

    // §221: RetroEffect is WebGPU-only and the project runs on WebGL for characters.
    // Bloom carries the phosphor bleed; the CRT read comes from the canvas and CSS.
    world.postProcessManager.configureEffect(ENGINE.PostProcessPass.Bloom, {
      enabled: true,
      strength: 0.5,
      threshold: 0.75,
      radius: 0.65,
    });
  }

  // -- Session -----------------------------------------------------------------------

  private async startSession(): Promise<void> {
    const world = this.getWorld();
    const container = world?.gameContainer;
    if (!container) {
      console.warn('[omniscient] no gameContainer - intervention surface not attached');
      return;
    }

    this.phone = new LocalSurface(container);
    await this.phone.attach();

    this.session = new SessionController(this.phone, this.knowledge, {
      onEnvironment: (cue) => this.applyEnvironmentCue(cue),
      onVfx: (effect) => this.fireVfx(effect),
      onKnowledgeGained: () => this.revealGrowth(),
      onResolved: () => this.returnHome(),
    });

    // §7: open on the machine, cold, with nothing on the screen but a sprout.
    this.phase = Phase.Boot;
    this.cutTo(HOME_SHOT);
    this.boot = new BootSequence(this.phone, () => this.openNextRequest());
    this.boot.start();
  }

  /**
   * §176 HOME LOOP: a request resolves, knowledge updates, and the player comes back to
   * the machine to find something has grown. The growth reveal is already running by the
   * time the camera arrives, so the branch draws itself while they watch.
   */
  private returnHome(): void {
    this.phase = Phase.Home;
    this.pauseRemaining = HOME_DWELL;
    this.moveTo(HOME_SHOT, HOME_SHOT.duration ?? 2.0);
  }

  private openNextRequest(): void {
    const next = this.queue[this.queueIndex];
    if (!next || !this.session) {
      // Nothing left. Stay at the machine - §168, the quiet is the ending.
      this.phase = Phase.Home;
      return;
    }
    this.queueIndex += 1;

    this.phase = Phase.Contact;
    this.mountScene(next.mission.sceneId);
    this.session.start(next.mission, next.contact);
  }

  /** Swap the diorama. One scene is live at a time - §133 foregrounds a single contact. */
  private mountScene(sceneId: string): void {
    this.scene?.deactivate();

    const next = this.scenes.get(sceneId) ?? null;
    if (!next) {
      console.warn(`[omniscient] no diorama built for "${sceneId}"`);
    }

    this.scene = next;
    this.scene?.activate();

    const opening = next?.getShot('default');
    if (opening) this.cutTo(opening);
  }

  /**
   * §209: the world performs the instruction, the contact's body does not. The scene
   * resolves the cue to a camera move or a prop animation and hands back the world
   * position any effect should play at.
   */
  private applyEnvironmentCue(cue: string): void {
    const result = this.scene?.applyCue(cue);
    if (!result) return;

    if (result.shot) {
      this.moveTo(result.shot, result.shotDuration ?? 1.4);
    }
    this.pendingEffectPosition = result.effectPosition ?? null;
  }

  private fireVfx(effect: string): void {
    const node = this.vfxNodes.get(effect);
    if (!node) return;

    // Play the burst where the cue said it happened, not at a fixed point on the rig.
    if (this.pendingEffectPosition) {
      node.position.copy(this.pendingEffectPosition);
      this.pendingEffectPosition = null;
    }
    node.startEmitting();
  }

  // -- Growth ------------------------------------------------------------------------

  /**
   * Re-derive the tree and animate the new branches in from where the old ones ended.
   * §175: growth events are visible and earned, never a percentage bar.
   */
  private revealGrowth(): void {
    if (!this.tree) return;

    const before = this.tree.segmentCount;
    this.tree.setState(this.knowledge.toTreeState());
    const after = this.tree.segmentCount;

    if (after <= before) {
      this.tree.draw(1, this.pulse);
      return;
    }

    this.revealFrom = before / after;
    this.revealProgress = 0;
  }

  public override tickPrePhysics(deltaTime: number): void {
    super.tickPrePhysics(deltaTime);
    this.cameraTweener.update(deltaTime);
    this.boot?.update(deltaTime);
    if (!this.tree) return;

    this.pulse = (this.pulse + deltaTime / 1.6) % 1;

    if (this.revealProgress < 1) {
      this.revealProgress = Math.min(this.revealProgress + deltaTime / GROWTH_REVEAL_SECONDS, 1);
      const reveal = this.revealFrom + (1 - this.revealFrom) * this.revealProgress;
      this.tree.draw(reveal, this.pulse);
    } else {
      this.tree.draw(1, this.pulse);
    }

    // §168: let the resolution land at the machine before the next signal arrives.
    if (this.phase === Phase.Home && this.pauseRemaining > 0) {
      this.pauseRemaining -= deltaTime;
      if (this.pauseRemaining <= 0) {
        this.openNextRequest();
      }
    }
  }

  public override endPlay(): boolean {
    this.session?.end();
    this.phone?.detach();
    this.surface?.dispose();
    this.session = null;
    this.phone = null;
    this.surface = null;
    this.scene = null;
    this.scenes.clear();
    return super.endPlay();
  }
}
