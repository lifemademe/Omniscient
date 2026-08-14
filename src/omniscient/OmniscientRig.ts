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

import { ADAEZE, ILEANA, MIRELA, TOMAS } from './content/contacts.js';
import { MISSION_01 } from './content/mission-01-transmitter.js';
import { MISSION_02 } from './content/mission-02-beacon.js';
import { MISSION_03 } from './content/mission-03-tunnel.js';
import { MISSION_04 } from './content/mission-04-relations.js';
import { createScreenGlass } from './art/glass.js';
import { PAINT_UNIFORMS } from './art/painterly.js';
import { decorMesh } from './art/mesh.js';
import { ACCENT, LIGHT, MAT } from './art/palette.js';
import { createSignals, MIRELA_SIGNAL, REVEALED_AFTER_FIRST } from './content/signals.js';
import { Ease, Tweener } from './core/tween.js';
import { CRTSurface } from './crt/CRTSurface.js';
import { TunePanel } from './dev/TunePanel.js';
import { GlobeView, SignalState } from './crt/GlobeView.js';
import { KnowledgeTree } from './crt/KnowledgeTree.js';
import { fitSurfaceUvs, readModelParts } from './geometry/model-parts.js';
import { CHAIR_PLACEMENT, createWorkstationRoom, LAMP } from './geometry/room.js';
import { KnowledgeStore } from './knowledge/KnowledgeStore.js';
import { BroadcastTransport } from './link/BroadcastTransport.js';
import { LocalSurface } from './link/LocalSurface.js';
import { RemoteSurface } from './link/RemoteSurface.js';
import { SurfaceGroup } from './link/SurfaceGroup.js';
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
  // Squarer than it was. At x=2.25 the sightline from the camera to the module stack ran
  // straight through the CRT, so the tube stood in front of the menu and hid the buttons
  // the shot exists to let you press. Coming round to x=1.15 clears the chassis while
  // keeping enough angle for the machine to read as a solid object rather than a facade.
  //
  // Also tightened and dropped: the old setup put a fifth of the frame under the desk in
  // unlit floor, and being nearer desk height puts the window behind the machine's
  // shoulder instead of above it, which is what makes the tube sit IN the room.
  // The target sits between the stack and the window rather than on the stack, because
  // the shot has to hold both: aiming at the menu alone swung the machine and the window
  // out to the right and pushed the lower plates off the left edge.
  // Pulled back a touch from the tightest framing on purpose. The camera uses a vertical
  // FOV, so a narrower window crops the sides - and the menu plates live at the left
  // extreme, which makes them the first thing to be cut. The margin is cheap insurance
  // against the player's window not being the shape mine is.
  // Raised once the floor was put at the right depth: level with the desk edge, the new
  // front fascia filled the bottom third of frame and the room lost its floor entirely.
  position: new THREE.Vector3(1.3, 1.62, -56.7),
  target: new THREE.Vector3(-0.3, 0.88, -60.15),
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

/**
 * Seconds the Contact View is held after a request resolves, before the camera leaves.
 *
 * This was zero. `onResolved` called `returnHome()` on the same tick the outcome landed,
 * which hid the console and pulled the camera back to the workstation - so the contact's
 * closing line was on screen for no frames at all, and every environment cue fired into a
 * shot nobody was watching.
 *
 * Adaeze's whole request is built around one moment: the limbs come off and the shade
 * slides off the failing rows. It has a 1.4 second animation. The player was seeing about
 * a third of a second of it, from behind, on the way out. §176's loop is *resolve, see the
 * consequence, go home* - the middle step needs time to happen in.
 */
const RESOLVE_HOLD = 4.6;

@ENGINE.GameClass()
export class OmniscientRig extends ENGINE.SceneNode {
  private knowledge = new KnowledgeStore(PLAYTHROUGH_SEED);
  private surface: CRTSurface | null = null;
  private tree: KnowledgeTree | null = null;
  private phone: LocalSurface | null = null;
  /** The second-screen wire. Open whether or not anything is listening on it. */
  private link: BroadcastTransport | null = null;
  private session: SessionController | null = null;
  private vfxNodes = new Map<string, ENGINE.VFXNode>();
  /** F8. Dev tuning; bindings registered where the lights are built. */
  private tune: TunePanel | null = null;
  /** The workstation lights, kept so the panel can reach them. */
  private lightRig: {
    key: ENGINE.DirectionalLightNode;
    sky: ENGINE.HemisphereLightNode;
    lamp: ENGINE.PointLightNode;
    windowKey: ENGINE.SpotLightNode;
    bounce: ENGINE.PointLightNode;
    glow: ENGINE.PointLightNode;
  } | null = null;

  private queue: QueuedRequest[] = [];
  private queueIndex = 0;
  private pauseRemaining = 0;
  /** Seconds left holding the Contact View after a resolution. Zero when not holding. */
  private resolveHold = 0;

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
      /**
       * Second, and the first request that is not a repair.
       *
       * Coming straight after Mirela is the point. The player has just been rewarded for
       * finding a fault, and there is no fault anywhere in Ileana's request - it is also
       * where the game stops being only about saying the right sentence.
       */
      { mission: MISSION_04, contact: ILEANA },
      { mission: MISSION_02, contact: TOMAS },
      // Adaeze is deliberately last and deliberately elsewhere: by the time the player
      // reaches her they have solved two electrical faults in one small town, which is
      // exactly the habit her request is built to break.
      { mission: MISSION_03, contact: ADAEZE },
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
    const station = ENGINE.SceneNode.create({
      name: 'Workstation',
      position: WORKSTATION_ORIGIN.clone(),
    });

    // The room around the machine. §119 wants a physical workstation, not a floating
    // object - the desk, the wall behind it and the clutter are what make the CRT read
    // as somewhere OMNISCIENT_ lives rather than as a prop on a grey plane.
    for (const part of createWorkstationRoom()) {
      // Almost every part names a member of the shared family; the pinboard's notes each
      // carry their own authored canvas and hand one over directly. See RoomPart.
      const surface = typeof part.material === 'string' ? MAT[part.material] : part.material;
      station.add(meshOf(part.name, part.geometry, surface));
    }

    this.surface = new CRTSurface({ width: 192, height: 144 });
    /**
     * The menu screen shows the REAL knowledge state, at every stage including an empty
     * one. A looping attract sequence was tried here and withdrawn: showing a full canopy
     * on a save that has learned nothing tells the player the screen is decoration, and
     * the screen is the entire premise - it is the picture of what they have made of
     * OMNISCIENT_ so far, and it has to be earned to mean anything.
     */
    this.tree = new KnowledgeTree(this.surface, this.knowledge.toTreeState());
    this.globe = new GlobeView(this.surface, this.signals);
    this.tree.draw(1);

    /**
     * The chair, at the transform the generated one worked out.
     *
     * Its whole job in this shot is silhouette - a dark shape in the near foreground with
     * gaps in it - which is exactly what a modelled chair does better than seven boxes.
     * See CHAIR_PLACEMENT for why it stands where it does.
     */
    const chair = ENGINE.ModelMeshNode.create({
      name: 'Chair',
      modelUrl: '@project/assets/models/Chair.glb',
      position: CHAIR_PLACEMENT.position.clone(),
      rotation: new THREE.Euler(0, CHAIR_PLACEMENT.turn, 0),
      useDynamicMaterials: true,
    });
    station.add(chair);

    /**
     * The machine itself, which is now a modelled asset rather than a generated one.
     *
     * The procedural terminal in `geometry/hardware.ts` built this out of chamfered slabs
     * and did an honest job, but it could not do the thing that actually sells moulded
     * plastic: a small fillet on every single edge. This is the first object in the game
     * where that was worth buying rather than approximating.
     *
     * It drops in at the same local origin the generated one used - base at y = 0, screen
     * facing +Z, a metre wide - so the desk and the room it was built around still fit it
     * without a single number changing.
     */
    /**
     * §238 - the set sits ON the desk, measured rather than eyeballed.
     *
     * The desk top runs z = -1.075 to -0.025 and the model is 0.80 deep about its own
     * centre, so at the station origin it spanned -0.40 to +0.40 and 42cm of it - more
     * than half its depth - hung off the front edge into the air. It read as a set
     * balanced on the lip of a bench, which is not where anybody leaves a television.
     *
     * At z = -0.50 it spans -0.90 to -0.10: 7.5cm of desk in front of it, 17.5cm behind.
     * The base needed nothing; the model's origin is already at its feet and the desk
     * surface is already y = 0.
     */
    const monitor = ENGINE.ModelMeshNode.create({
      name: 'Terminal',
      position: new THREE.Vector3(0, 0, -0.5),
      modelUrl: '@project/assets/models/CRT_TV.glb',
      // The screen, the glass and the lamp each get their own material below, and the
      // model ships with one shared across all four meshes.
      useDynamicMaterials: true,
    });
    monitor.onMeshLoaded.add((_node, root) => this.dressTerminal(root));
    station.add(monitor);

    this.add(station);
  }

  /**
   * Mount the live parts of the terminal onto the authored anchors.
   *
   * Everything here is addressed by the name it was given in Blender rather than by a
   * coordinate typed into this file, which is the whole point of the convention: the
   * model can be re-exported, re-scaled or replaced entirely, and as long as the names
   * survive, the screen still lands on the screen.
   */
  private dressTerminal(root: THREE.Object3D): void {
    const model = readModelParts(root);

    const screen = model.screens.get('main');
    if (screen && this.surface) {
      fitSurfaceUvs(screen);
      screen.material = this.surface.material;
    }

    const glass = model.glass.get('screen');
    if (glass) {
      fitSurfaceUvs(glass);
      glass.material = createScreenGlass({ seed: 'omniscient-terminal-glass', intensity: 0.72 });
      // After the picture, always. The tube is opaque and the glass is a highlight on
      // top of it, so sorting it behind would make the sheen vanish at some angles.
      glass.renderOrder = 2;
    }

    /**
     * The power lamp, lit because the machine is running.
     *
     * Real bloom is a post-process effect and those are WebGPU-only here, so the halo is
     * done the old way: an unlit surface at full value plus a small point light that
     * spills onto the surrounding plastic. The spill does more work than the lamp - a
     * bright dot with no light around it reads as a painted circle.
     */
    const lamp = model.parts.get('powerLamp');
    if (lamp) {
      lamp.material = MAT.warningLamp;

      const at = model.anchors.get('powerLamp');
      if (at) {
        const glow = ENGINE.PointLightNode.create({
          name: 'LampGlow',
          position: at.position.clone().add(new THREE.Vector3(0, 0, 0.02)),
          intensity: 0.32,
          color: new THREE.Color(ACCENT.warning),
          distance: 0.34,
          decay: 1.4,
        });
        root.parent?.add(glow);
      }
    }
  }

  /**
   * What the F8 panel can reach.
   *
   * Lights and the home shot, which between them are nearly every number that has been
   * hand-tuned through a rebuild so far. Sliders write straight onto the live objects;
   * COPY puts the settled values on the clipboard to be pasted back into source, which
   * is the only place they persist.
   */
  private registerTuning(): void {
    const tune = this.tune;
    const rig = this.lightRig;
    if (!tune || !rig) return;

    const hex = (light: { color: THREE.Color }): string => `#${light.color.getHexString()}`;

    tune.group('painterly');
    tune.slider({
      label: 'bands',
      min: 2,
      max: 8,
      step: 1,
      get: () => PAINT_UNIFORMS.uPaintBands.value,
      set: (v) => (PAINT_UNIFORMS.uPaintBands.value = Math.round(v)),
    });
    tune.slider({
      label: 'softness',
      min: 0.02,
      max: 0.9,
      get: () => PAINT_UNIFORMS.uPaintSoft.value,
      set: (v) => (PAINT_UNIFORMS.uPaintSoft.value = v),
    });

    tune.group('key + sky');
    tune.slider({ label: 'key', min: 0, max: 6, get: () => rig.key.intensity, set: (v) => (rig.key.intensity = v) });
    tune.slider({ label: 'sky', min: 0, max: 4, get: () => rig.sky.intensity, set: (v) => (rig.sky.intensity = v) });

    tune.group('desk lamp');
    tune.slider({ label: 'intensity', min: 0, max: 12, get: () => rig.lamp.intensity, set: (v) => (rig.lamp.intensity = v) });
    tune.slider({ label: 'distance', min: 0.5, max: 6, get: () => rig.lamp.distance, set: (v) => (rig.lamp.distance = v) });
    tune.slider({ label: 'decay', min: 0.5, max: 3, get: () => rig.lamp.decay, set: (v) => (rig.lamp.decay = v) });
    tune.color({ label: 'color', get: () => hex(rig.lamp), set: (v) => rig.lamp.color.set(v) });

    tune.group('window key');
    tune.slider({ label: 'intensity', min: 0, max: 40, get: () => rig.windowKey.intensity, set: (v) => (rig.windowKey.intensity = v) });
    tune.slider({ label: 'angle', min: 0.1, max: 1.4, get: () => rig.windowKey.angle, set: (v) => (rig.windowKey.angle = v) });
    tune.slider({ label: 'penumbra', min: 0, max: 1, get: () => rig.windowKey.penumbra, set: (v) => (rig.windowKey.penumbra = v) });

    tune.group('bounce + glow');
    tune.slider({ label: 'bounce', min: 0, max: 5, get: () => rig.bounce.intensity, set: (v) => (rig.bounce.intensity = v) });
    tune.slider({ label: 'glow', min: 0, max: 6, get: () => rig.glow.intensity, set: (v) => (rig.glow.intensity = v) });

    tune.group('home shot');
    const axes = ['x', 'y', 'z'] as const;
    for (const axis of axes) {
      tune.slider({
        label: `pos ${axis}`,
        min: HOME_SHOT.position[axis] - 2,
        max: HOME_SHOT.position[axis] + 2,
        get: () => HOME_SHOT.position[axis],
        set: (v) => {
          HOME_SHOT.position[axis] = v;
          if (this.phase === Phase.Menu) this.cutTo(HOME_SHOT);
        },
      });
    }
    for (const axis of axes) {
      tune.slider({
        label: `aim ${axis}`,
        min: HOME_SHOT.target[axis] - 2,
        max: HOME_SHOT.target[axis] + 2,
        get: () => HOME_SHOT.target[axis],
        set: (v) => {
          HOME_SHOT.target[axis] = v;
          if (this.phase === Phase.Menu) this.cutTo(HOME_SHOT);
        },
      });
    }
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
      // Pulled from 2.6. §230's reading of all three reference frames is a warm pool on
      // a corner of a COLD room, and a warm global key of that strength makes the whole
      // room warm - which leaves the lamp with nothing to be warm against.
      intensity: 1.9,
      color: new THREE.Color(LIGHT.key),
    });
    // Shadows off. The rig spans sixty units - the workstation at one end, the dioramas
    // at the other - so a single directional shadow map cannot cover both, and the set
    // that is not inside its bounds renders entirely shadowed. The value structure here
    // comes from light direction and palette (§187), not from cast shadows.
    key.castShadow = false;
    this.add(key);

    const sky = ENGINE.HemisphereLightNode.create({
        name: 'SkyFill',
        // Raised as the key came down, so the room does not simply get darker - §243
        // counts a scene that lost value as a regression however good the reason was.
        // The trade is warm-everywhere for cold-everywhere-except-the-pool.
        intensity: 1.35,
        color: new THREE.Color(LIGHT.fill),
        groundColor: new THREE.Color(LIGHT.bounce),
      });
    this.add(sky);

    // A practical over the desk. §187 asks for one key plus controlled practicals - this
    // is what stops the machine reading as an object on a plane and starts it reading as
    // an object somebody sits at.
    const lamp = ENGINE.PointLightNode.create({
        name: 'DeskLamp',
        // Inside the shade of the fixture that now exists, rather than hanging in the air
        // above the desk with nothing there to be emitting it.
        position: WORKSTATION_ORIGIN.clone().add(
          new THREE.Vector3(LAMP.bulb.x, LAMP.bulb.y + 0.03, LAMP.bulb.z)
        ),
        // Warmer and tighter than before. It is a bulb under a shade half a metre from
        // the desk, so it should fall off hard and own a small area completely.
        intensity: 4.2,
        color: new THREE.Color('#ffcf96'),
        distance: 2.6,
        decay: 1.7,
      });
    this.add(lamp);

    /**
     * Daylight through the workstation window.
     *
     * The global key comes from front-right, which is right for the Contact View dioramas
     * at the far end of the rig but wrong here - it would light the wall around the
     * window from the opposite side to the window itself, and a blown-out aperture lit
     * from in front reads as a mistake rather than as a window.
     *
     * So the workstation gets its own key: a spot placed outside the glazing, aimed into
     * the room. It is distance-limited, so the dioramas sixty units away never see it,
     * and it rakes across the desk right to left - which is what puts a lit edge on the
     * plant, the mug and the machine's near corner instead of flat frontal light, and
     * lets the light fall off into the darker side where the menu modules live.
     */
    const windowKey = ENGINE.SpotLightNode.create({
      name: 'WindowKey',
      position: WORKSTATION_ORIGIN.clone().add(new THREE.Vector3(1.16, 2.2, -3.0)),
      // Pulled back from 26: at full strength it lit the side wall as brightly as the
      // desk, turning the left third of frame into a pale field that fought the machine.
      intensity: 17,
      color: new THREE.Color(LIGHT.key),
      // Wide and very soft. A hard-edged pool on the floor would read as a stage light;
      // the penumbra is doing the work of a window's diffuse spill.
      angle: 0.8,
      penumbra: 0.9,
      distance: 8,
      decay: 1.25,
    });
    windowKey.castShadow = false;
    // Aim across the desk rather than straight at the wall opposite, so the beam travels
    // along the desk surface and the near clutter picks up a rim.
    windowKey.lookAt(WORKSTATION_ORIGIN.clone().add(new THREE.Vector3(-0.6, 0.1, 0.2)));
    this.add(windowKey);

    /**
     * The screen lights the room.
     *
     * This is the most valuable light in the scene for two reasons. Compositionally it
     * completes the pair: warm daylight from the window on the left, cold green from the
     * tube on the right, so every object in between has a warm edge and a cool edge and
     * the room stops reading as flat. Narratively it is the point of the whole game -
     * OMNISCIENT_ is not an object sitting in the room, it is the thing illuminating it,
     * and the light it casts is the colour of its own growth.
     *
     * Tight distance so the spill dies before the wall behind: this is a glow off a
     * screen, not a green floodlight.
     */
    /**
     * Warm bounce off the floor, in front of the desk.
     *
     * Without it the desk top was a bright warm quad with absolute black beneath - so it
     * read as a rug lying on the floor rather than as a surface with an edge and legs.
     * Everything the key hits should throw something back; this is that return, and it is
     * what gives the desk its front edge, the chassis its lower corner, and the side wall
     * enough value to stop the shelf floating in a void.
     */
    const bounce = ENGINE.PointLightNode.create({
        name: 'FloorBounce',
        position: WORKSTATION_ORIGIN.clone().add(new THREE.Vector3(0.6, -0.55, 0.5)),
        intensity: 1.6,
        color: new THREE.Color(LIGHT.bounce),
        distance: 4.2,
        decay: 1.4,
      });
    this.add(bounce);

    const glow = ENGINE.PointLightNode.create({
        name: 'ScreenGlow',
        position: WORKSTATION_ORIGIN.clone().add(new THREE.Vector3(0, 0.42, 0.34)),
        intensity: 2.2,
        color: new THREE.Color(ACCENT.knowledge),
        distance: 2.1,
        decay: 1.8,
      });
    this.add(glow);

    this.lightRig = { key, sky, lamp, windowKey, bounce, glow };

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

    /**
     * §222: the conversation appears on the desktop AND on any paired second screen.
     *
     * Pairing adds a surface rather than moving one. If the phone were the only place the
     * player could answer, losing it mid-request would strand them inside a conversation
     * with no way out - and the desktop still has to show the transcript to anybody
     * watching over their shoulder, which for a jam being judged is most of the point.
     *
     * The transport here reaches another window of the same origin and no further. That
     * is the honest limit of what can be built without hosting: see BroadcastTransport.
     */
    this.link = new BroadcastTransport();
    const remote = new RemoteSurface(this.link);
    const surfaces = new SurfaceGroup([this.phone, remote]);
    await surfaces.attach();

    this.session = new SessionController(surfaces, this.knowledge, {
      onEnvironment: (cue) => this.applyEnvironmentCue(cue),
      onVfx: (effect) => this.fireVfx(effect),
      onKnowledgeGained: () => this.revealGrowth(),
      onResolved: () => this.holdThenReturnHome(),
      onFailed: (failure) => this.onRequestLost(failure),
      onNoteRecorded: () => this.closeLostRequest(),
      onLeave: () => this.leaveContact(),
    });

    this.tune = new TunePanel(container);
    this.registerTuning();

    this.globeScreen = new GlobeScreen(
      container,
      (signalId) => this.openSignal(signalId),
      () => this.returnToMenu(),
      (signalId) => this.reopenAfterCooldown(signalId)
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

  /**
   * Move a signal to a new state, and put it on the globe if it was not there yet.
   *
   * A signal being given a state is the moment it enters the fiction, so un-hiding here
   * rather than at each call site means a future request cannot be added and then be
   * invisible because somebody forgot the second line.
   */
  private setSignalState(signalId: string, state: SignalState): void {
    const signal = this.signals.find((s) => s.id === signalId);
    if (!signal) return;
    signal.state = state;
    signal.hidden = false;
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

    // Deliberately NOT leaving the Contact View here. The globe is already updating
    // behind us, but the player is still looking at what went wrong and is being asked to
    // write themselves a note about it - starting the return now took the Contact View
    // away mid-sentence and made §170's note unreachable. The exit is onNoteRecorded.
  }

  /**
   * A blocked request's countdown reached zero.
   *
   * §31: the request comes back, and the note the player wrote themselves is waiting for
   * them in Records when it does. The globe cannot decide this on its own - it does not
   * know whether a mission is still queued - so it asks, and only a contact whose request
   * is genuinely still pending becomes answerable again.
   *
   * Without this the countdown expired into nothing: the point went green, the contact
   * stayed out of `openable`, and the tooltip said "no longer waiting" with no way in.
   */
  private reopenAfterCooldown(signalId: string): void {
    const pending = this.queue
      .slice(this.queueIndex)
      .some((request) => request.mission.contactId === signalId);
    if (!pending) return;

    this.openable.add(signalId);
    this.setSignalState(signalId, SignalState.Waiting);
  }

  /**
   * The player has written their note. The request is finished with, so go back out to
   * the globe - where the contact they just lost is now red and counting down.
   */
  private closeLostRequest(): void {
    if (this.phase !== Phase.Contact) return;

    this.session?.end();
    this.scene?.deactivate();
    this.scene = null;
    this.showGlobe();
  }

  /**
   * Stay a moment before leaving.
   *
   * The console keeps the closing line up and the diorama keeps playing whatever the
   * resolution set going, and then the camera goes home.
   */
  private holdThenReturnHome(): void {
    this.resolveHold = RESOLVE_HOLD;
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

    // The world opens up after the first request, not before it. §52 still gets its
    // tease; the player just gets to learn what the globe is for on an empty one first.
    if (this.queueIndex === 1) {
      for (const signal of this.signals) {
        if (REVEALED_AFTER_FIRST.includes(signal.id)) signal.hidden = false;
      }
    }

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
      // Everything past where the old tree ended burns bright while it draws, so the
      // player sees WHAT they earned rather than being handed two similar trees to diff.
      this.tree.draw(reveal, this.pulse, this.revealFrom);
    } else {
      this.tree.draw(1, this.pulse);
    }

    // Let the resolution finish being watched before the camera leaves it.
    if (this.resolveHold > 0) {
      this.resolveHold -= deltaTime;
      if (this.resolveHold <= 0) {
        this.resolveHold = 0;
        this.returnHome();
      }
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
    this.tune?.dispose();
    this.tune = null;
    this.session?.end();
    this.phone?.detach();
    this.surface?.dispose();
    this.link?.close();
    this.link = null;
    this.session = null;
    this.phone = null;
    this.surface = null;
    this.scene = null;
    this.scenes.clear();
    return super.endPlay();
  }
}
