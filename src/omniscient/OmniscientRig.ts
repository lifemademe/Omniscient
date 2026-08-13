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
import { decorMesh } from './art/mesh.js';
import { LIGHT, MAT } from './art/palette.js';
import { createSignals, MIRELA_SIGNAL } from './content/signals.js';
import { Ease, Tweener } from './core/tween.js';
import { CRTSurface } from './crt/CRTSurface.js';
import { GlobeView, SignalState } from './crt/GlobeView.js';
import { KnowledgeTree } from './crt/KnowledgeTree.js';
import { createCRTTerminal } from './geometry/hardware.js';
import { createWorkstationRoom } from './geometry/room.js';
import { KnowledgeStore } from './knowledge/KnowledgeStore.js';
import { LocalSurface } from './link/LocalSurface.js';
import { GlobeScreen } from './globe/GlobeScreen.js';
import { Picker } from './input/Picker.js';
import { MainMenu } from './menu/MainMenu.js';
import { SessionController } from './session/SessionController.js';
import { VFX_LIBRARY } from './vfx/library.js';
import { buildContactScene } from './view/scenes.js';

import type { Signal } from './crt/GlobeView.js';
import type { MenuAction } from './menu/MainMenu.js';
import type { Contact, MissionDefinition, MissionFailure } from './mission/types.js';
import type { CameraShot, ContactScene } from './view/ContactScene.js';

/** Stable per-playthrough seed. §123: the same knowledge must draw the same tree. */
const PLAYTHROUGH_SEED = 0x0c151e;

/** Seconds to draw new growth in, pixel by pixel (§176). */
const GROWTH_REVEAL_SECONDS = 1.8;

/** Scratch matrix for camera orientation. Reused to avoid per-frame allocation. */
const CAMERA_MATRIX = new THREE.Matrix4();

const meshOf = decorMesh;


interface QueuedRequest {
  mission: MissionDefinition;
  contact: Contact;
}

/**
 * Where the player is. §176's HOME LOOP: the machine is home, a request takes you into
 * somebody's world, and resolving it brings you back to see what you learned.
 */
enum Phase {
  /** At the machine, menu up, tree on the CRT. The resting state (§174). */
  Menu = 'menu',
  /** At the machine after a request, watching the tree grow. */
  Home = 'home',
  /** Pushed into the CRT, globe up, choosing the next request. */
  Choosing = 'choosing',
  Contact = 'contact',
}

/** What the CRT is showing. */
enum Screen {
  Tree = 'tree',
  Globe = 'globe',
}

/** Where the workstation sits, far from the dioramas so shots never overlap. */
const WORKSTATION_ORIGIN = new THREE.Vector3(0, 0, -60);

/**
 * The machine, three-quarter on. §129 wants this to be the shot a player screenshots at
 * the start and again at the end - so the chassis has to read as a physical object, not
 * just as a screen filling the frame.
 */
const HOME_SHOT: CameraShot = {
  position: new THREE.Vector3(2.25, 1.55, -56.5),
  target: new THREE.Vector3(-0.72, 0.86, -60.1),
  duration: 2.0,
};

/** The push-in: hard onto the CRT face, so the screen fills the frame. */
const SCREEN_SHOT: CameraShot = {
  position: new THREE.Vector3(0, 0.46, -59.05),
  target: new THREE.Vector3(0, 0.46, -59.62),
  duration: 1.6,
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

  private phase: Phase = Phase.Menu;
  private screen: Screen = Screen.Tree;
  private menu: MainMenu | null = null;
  private picker: Picker | null = null;
  private globeScreen: GlobeScreen | null = null;
  /** Seconds until the globe screen takes over from the push-in. */
  private globeHandoff = 0;
  private globe: GlobeView | null = null;
  private signals: Signal[] = createSignals();
  /** Signals that map to a mission still in the queue. */
  private openable = new Set<string>([MIRELA_SIGNAL]);

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

    this.menu = new MainMenu(WORKSTATION_ORIGIN);
    this.add(this.menu.root);
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

    // The room around the machine. §119 wants a physical workstation, not a floating
    // object - the desk, the wall behind it and the clutter are what make the CRT read
    // as somewhere OMNISCIENT_ lives rather than as a prop on a grey plane.
    for (const part of createWorkstationRoom()) {
      station.add(meshOf(part.name, part.geometry, MAT[part.material]));
    }

    station.add(meshOf('Chassis', parts.chassis, MAT.plastic));
    station.add(meshOf('Bezel', parts.bezel, MAT.dark));
    station.add(meshOf('Details', parts.details, MAT.metal));

    this.surface = new CRTSurface({ width: 192, height: 144 });
    this.tree = new KnowledgeTree(this.surface, this.knowledge.toTreeState());
    this.globe = new GlobeView(this.surface, this.signals);
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

    // Dust runs continuously over the diorama - §186's cheap painterly depth.
    const dust = this.vfxNodes.get('DustVFX');
    if (dust) dust.position.set(0, 0, -0.4);
  }

  /**
   * §187: one strong key direction plus controlled practicals, not many weak lights.
   * §186: haze and shafts of light create painterly depth far more cheaply than detail.
   *
   * The key is warm and low - late coastal afternoon through a window. The fill is cold
   * so shadows read as *cold* rather than merely dark, which is what gives a flat-shaded
   * scene its value separation.
   */
  private buildLighting(): void {
    // Restrained: the scene's own Directional Light is still contributing, so a strong
    // key here double-lights everything and blows the highlights flat - which destroys
    // the value separation the whole palette is built around.
    const key = ENGINE.DirectionalLightNode.create({
      name: 'KeyLight',
      position: new THREE.Vector3(3.4, 3.0, 2.6),
      intensity: 2.6,
      color: new THREE.Color(LIGHT.key),
    });
    // Shadows off. The rig spans sixty units - the workstation at one end, the dioramas
    // at the other - so a single directional shadow map cannot cover both, and the set
    // that is not inside its bounds renders entirely shadowed. The value structure here
    // comes from light direction and palette (§187), not from cast shadows.
    key.castShadow = false;
    this.add(key);

    this.add(
      ENGINE.HemisphereLightNode.create({
        name: 'SkyFill',
        intensity: 1.0,
        color: new THREE.Color(LIGHT.fill),
        groundColor: new THREE.Color(LIGHT.bounce),
      })
    );

    // A practical over the desk. §187 asks for one key plus controlled practicals - this
    // is what stops the machine reading as an object on a plane and starts it reading as
    // an object somebody sits at.
    this.add(
      ENGINE.PointLightNode.create({
        name: 'DeskLamp',
        position: new THREE.Vector3(-0.75, 1.35, -59.4),
        intensity: 3.4,
        color: new THREE.Color(LIGHT.key),
        distance: 4.5,
        decay: 1.6,
      })
    );

    // Depth. Near/far are tuned to the diorama, not the world - the workstation sits
    // 60 units away and must not be fogged out of existence.
    this.add(
      ENGINE.FogNode.create({
        name: 'Atmosphere',
        fogMode: ENGINE.FogMode.Linear,
        fogColor: new THREE.Color(LIGHT.haze),
        fogNear: 3.5,
        fogFar: 26,
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
      onFailed: (failure) => this.onRequestLost(failure),
      onLeave: () => this.leaveContact(),
    });

    this.globeScreen = new GlobeScreen(
      container,
      (signalId) => this.openSignal(signalId),
      () => this.returnToMenu()
    );

    this.attachPicker(world, container);

    // Open on the machine at rest: menu up, tree on the CRT (§174, §183).
    this.phase = Phase.Menu;
    this.screen = Screen.Tree;
    this.cutTo(HOME_SHOT);
    this.menu?.setEnabled(true);
    this.phone.setVisible(false);
  }

  private attachPicker(world: ENGINE.World, container: HTMLElement): void {
    this.picker = new Picker(() => this.camera?.getCamera() ?? null, container);
    world.inputManager?.addInputHandler(this.picker);

    this.menu?.attach(this.picker);
    this.menu?.onAction((action) => this.onMenuAction(action));
  }

  private onMenuAction(action: MenuAction): void {
    // Only NEW GAME is wired for the Jam slice. §103 wants the machine to look like it
    // does more than the player currently needs it to.
    if (action !== 'new-game') return;

    this.menu?.setEnabled(false);
    this.showGlobe();
  }

  /**
   * Step back out of a request to the globe.
   *
   * §97: a contact can be left waiting and returned to. The request goes back to
   * available rather than being abandoned - leaving is not failing, and the player should
   * never feel trapped in a conversation they are not ready for.
   */
  private leaveContact(): void {
    if (this.phase !== Phase.Contact) return;

    const contactId = this.queue[this.queueIndex - 1]?.mission.contactId;
    if (contactId) {
      this.setSignalState(contactId, SignalState.Waiting);
      this.openable.add(contactId);
      this.queueIndex -= 1;
    }

    this.session?.end();
    this.scene?.deactivate();
    this.scene = null;
    this.showGlobe();
  }

  /** Back to the machine from the globe. */
  private returnToMenu(): void {
    this.globeScreen?.detach();
    this.phone?.setVisible(false);
    this.globeHandoff = 0;
    this.phase = Phase.Menu;
    this.screen = Screen.Tree;
    this.menu?.setEnabled(true);
    this.moveTo(HOME_SHOT, 1.4);
  }

  /**
   * Push into the machine, then hand over to the globe screen (§5's dashboard).
   *
   * The camera drives into the CRT until the screen fills the frame, and the globe takes
   * over from there - so it still reads as looking through OMNISCIENT_'s own display,
   * while the points stay big enough to click.
   */
  private showGlobe(): void {
    this.phase = Phase.Choosing;
    this.screen = Screen.Globe;
    this.phone?.setVisible(false);

    this.moveTo(SCREEN_SHOT, 1.6);
    // Hand over once the push-in has arrived, not before - the transition is the point.
    this.globeHandoff = 1.5;
  }

  private openSignal(signalId: string): void {
    const index = this.queue.findIndex((request) => request.mission.contactId === signalId);
    if (index < 0 || !this.session) return;

    this.setSignalState(signalId, SignalState.Active);
    this.openable.delete(signalId);
    this.queueIndex = index + 1;

    this.phase = Phase.Contact;
    this.screen = Screen.Tree;
    this.globeScreen?.detach();
    this.phone?.setVisible(true);

    const request = this.queue[index];
    this.mountScene(request.mission.sceneId);
    this.vfxNodes.get('DustVFX')?.startEmitting();
    this.session.start(request.mission, request.contact);
  }

  private setSignalState(signalId: string, state: SignalState): void {
    const signal = this.signals.find((s) => s.id === signalId);
    if (signal) signal.state = state;
  }

  /**
   * §176 HOME LOOP: a request resolves, knowledge updates, and the player comes back to
   * the machine to find something has grown. The growth reveal is already running by the
   * time the camera arrives, so the branch draws itself while they watch.
   */
  /**
   * A lost request. §31: it goes red on the globe with a countdown, and comes back when
   * the countdown expires - by which time the player has hopefully written themselves a
   * note about what went wrong (§170).
   *
   * The player stays in the Contact View until they close it, because the note is written
   * here, while the mistake is still in front of them.
   */
  private onRequestLost(failure: MissionFailure): void {
    const contactId = this.queue[this.queueIndex - 1]?.mission.contactId;
    if (!contactId) return;

    const signal = this.signals.find((s) => s.id === contactId);
    if (signal) {
      signal.state = SignalState.Cooldown;
      signal.cooldown = failure.cooldownSeconds;
    }
    this.openable.delete(contactId);
    // Back in the queue: when the cooldown lapses it can be attempted again.
    this.queueIndex -= 1;

    this.pauseRemaining = HOME_DWELL;
    this.phase = Phase.Home;
  }

  private returnHome(): void {
    this.phase = Phase.Home;
    this.screen = Screen.Tree;
    this.phone?.setVisible(false);
    this.pauseRemaining = HOME_DWELL;
    this.moveTo(HOME_SHOT, HOME_SHOT.duration ?? 2.0);

    // Resolving Mirela's request is what puts Tomas on the globe - §163's consequence
    // chain, visible before the player knows why.
    const resolvedId = this.queue[this.queueIndex - 1]?.mission.contactId;
    if (resolvedId) this.setSignalState(resolvedId, SignalState.Resolved);

    const next = this.queue[this.queueIndex];
    if (next) {
      this.setSignalState(next.mission.contactId, SignalState.Waiting);
      this.openable.add(next.mission.contactId);
    }
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
    if (this.picker) this.menu?.update(deltaTime, this.picker);
    this.globeScreen?.update(deltaTime);

    // Hand over to the globe screen once the camera has arrived inside the CRT.
    if (this.globeHandoff > 0) {
      this.globeHandoff -= deltaTime;
      if (this.globeHandoff <= 0) {
        this.globeScreen?.attach(this.signals, this.openable);
      }
    }

    if (!this.tree) return;

    this.pulse = (this.pulse + deltaTime / 1.6) % 1;

    if (this.screen === Screen.Globe) {
      this.globe?.advance(deltaTime);
      this.globe?.draw(this.pulse);
    } else if (this.revealProgress < 1) {
      this.revealProgress = Math.min(this.revealProgress + deltaTime / GROWTH_REVEAL_SECONDS, 1);
      const reveal = this.revealFrom + (1 - this.revealFrom) * this.revealProgress;
      this.tree.draw(reveal, this.pulse);
    } else {
      this.tree.draw(1, this.pulse);
    }

    // §168: let the growth land at the machine before the globe comes back up.
    if (this.phase === Phase.Home && this.pauseRemaining > 0) {
      this.pauseRemaining -= deltaTime;
      if (this.pauseRemaining <= 0) {
        this.showGlobe();
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
