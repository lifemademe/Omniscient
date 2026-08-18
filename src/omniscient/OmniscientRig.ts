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

import { ADAEZE, DORIN, ILEANA, LUCIAN, MIRELA, SANDA, TOMAS, VASILE } from './content/contacts.js';
import { MISSION_01 } from './content/mission-01-transmitter.js';
import { MISSION_02 } from './content/mission-02-beacon.js';
import { MISSION_03 } from './content/mission-03-tunnel.js';
import { MISSION_04 } from './content/mission-04-relations.js';
import { MISSION_05 } from './content/mission-05-cellar.js';
import { MISSION_06 } from './content/mission-06-lock.js';
import { MISSION_07 } from './content/mission-07-torch.js';
import { MISSION_08 } from './content/mission-08-district.js';
import { createScreenGlass } from './art/glass.js';
import { PAINT_UNIFORMS } from './art/painterly.js';
import { decorMesh } from './art/mesh.js';
import { ACCENT, LIGHT, MAT } from './art/palette.js';
import { audio } from './audio/ConsoleAudio.js';
import { installCursor } from './art/cursor.js';
import { installRetro, setRetroLook } from './art/retro.js';
import { ScanTargets } from './link/ScanTargets.js';
import { MowerPlot } from './link/MowerPlot.js';
import { DriveKeys } from './view/mowing.js';
import { installSceneJump } from './dev/SceneJump.js';
import { playWarp } from './art/warp.js';
import { applyShadowPolicy } from './art/shadows.js';
import { SystemPanel } from './menu/SystemPanel.js';
import { createSeaLife } from './geometry/seaLife.js';
import { WINDOW_VIEW } from './geometry/room.js';
import { createSignals, MIRELA_SIGNAL, REVEALED_AFTER_FIRST } from './content/signals.js';
import { Ease, Tweener } from './core/tween.js';
import { CRTSurface } from './crt/CRTSurface.js';
import { TunePanel } from './dev/TunePanel.js';
import { GlobeView, SignalState } from './crt/GlobeView.js';
import { KnowledgeTree } from './crt/KnowledgeTree.js';
import { fitSurfaceUvs, readModelParts } from './geometry/model-parts.js';
import { CHAIR_PLACEMENT, createWorkstationRoom, DESK_SHIFT, LAMP } from './geometry/room.js';
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

/**
 * Where effects wait.
 *
 * Far enough under the diorama that no camera in the game can frame it, and far enough that
 * a stray particle drifting up from it would die of distance before it arrived.
 */
const VFX_PARKED = new THREE.Vector3(0, -1000, 0);
import { buildContactScene } from './view/scenes.js';

import type { RemoteUnit } from './view/ContactScene.js';

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
  // Follows the desk back (see DESK_SHIFT). The camera keeps its distance from the
  // machine rather than staying put and watching it recede.
  // Brought in with the machine. The subject is 54% of the size it was, so a camera left
  // where it stood would have framed a room with a small television in it. Distance from
  // the target scales with the subject; the angle does not change.
  //
  // Reframed after the rescale, from the content rather than by eye. The shot has to hold
  // the plate stack at x -1.32 and the window at x 2.0 - 3.3 units of width - and a
  // 46-degree vertical lens at 16:9 needs 2.2 units of distance to do it with nothing to
  // spare. At 3.0 there is margin for a window that is not the shape mine is, and the aim
  // sits at the centre of that span rather than left of it, which is what was cropping the
  // window off the right edge.
  //
  // Brought in again, to the reference's framing. At 3.14 units back the shot held the
  // whole room and the two things it is FOR - the menu and the tube - were each about a
  // fifth of frame. Both reference images sit much closer: the CRT is a third of the
  // width on its own and the menu fills the left column. 2.6 units, swung slightly left
  // so the stack is not clipped, and the aim dropped between the stack and the tube.
  //
  // Lower and squarer again. Both references look at this desk from roughly the height of
  // somebody sitting at it, nearly front-on to the back wall; this shot was 1.62 high and
  // swung 1.12 to the right, which is a standing three-quarter. Dropping to 1.30 and
  // halving the swing puts the lens where the chair is, and closes the distance to 2.24.
  position: new THREE.Vector3(0.62, 1.31, -59.2),
  target: new THREE.Vector3(-0.22, 0.92, -61.0),
  duration: 2.0,
};

/** The push-in: hard onto the CRT face, so the screen fills the frame. */
const SCREEN_SHOT: CameraShot = {
  // Follows the machine down: the screen centre is at y 0.25 now rather than 0.46, and a
  // push-in aimed at where the tube used to be would frame the desk in front of it.
  position: new THREE.Vector3(0, 0.25, -60.72),
  target: new THREE.Vector3(0, 0.25, -61.05),
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

/**
 * Seconds the Contact View is held after the note is written, before the camera leaves.
 *
 * Longer than RESOLVE_HOLD because there is more to read - the recorded note comes back,
 * and after it a standing panel explaining what now happens to the request - and because
 * a player who has just lost one is being told the rules rather than watching a payoff.
 *
 * A ceiling rather than a wait. The notice is about forty words, which is eleven seconds
 * at a comfortable reading pace, and END CALL skips straight out for anybody who has
 * finished sooner - see leaveContact.
 */
const NOTE_HOLD = 11;

/** The diorama atmosphere. Tuned to a room, not to a world - see mountScene. */
const FOG_NEAR = 3.5;
const FOG_FAR = 26;

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
  /** Held from configureLook so the F8 panel can re-configure effects live. */
  private post: ENGINE.PostProcessManager | null = null;
  /** Settings and credits, over the menu. Built on first use. */
  private systemPanel: SystemPanel | null = null;
  /** Gulls and a boat in the window. Driven from the tick; see createSeaLife. */
  private seaLife: ReturnType<typeof createSeaLife> | null = null;
  /** The workstation lights, kept so the panel can reach them. */
  private lightRig: {
    key: ENGINE.DirectionalLightNode;
    sky: ENGINE.HemisphereLightNode;
    /** A spot since the fixture grew a shade - see buildLighting. */
    lamp: ENGINE.SpotLightNode;
    windowKey: ENGINE.SpotLightNode;
    bounce: ENGINE.PointLightNode;
    glow: ENGINE.PointLightNode;
  } | null = null;

  private queue: QueuedRequest[] = [];
  /**
   * How far down the queue requests have been HANDED OUT.
   *
   * Split from `activeIndex` because those were one number and could not stay one. A
   * single cursor works only while exactly one request is answerable at a time - open
   * it, resolve it, hand out the next - and the globe now offers up to five at once, so
   * the player can answer the third one first and the cursor would release the fourth
   * while the first two were still waiting on it.
   */
  private offered = 1;
  /*
   * One, not zero: the opening hands Mirela out before anything runs, which is what
   * `openable` below is seeded with. They have to agree or the first resolve would
   * deal her out a second time.
   */
  /** Index of the request currently open, or null on the globe. */
  private activeIndex: number | null = null;

  /**
   * How many requests the globe will hold at once.
   *
   * Five. Enough that the map is a place with things happening on it rather than a
   * corridor with one lit door, and few enough that a player can still hold what is
   * waiting in their head - a globe with everything on it at once has the same problem
   * as a globe with one thing, which is that there is no choice being made.
   *
   * The first request is exempt on purpose. Mirela arrives alone, because the opening
   * teaches what the globe IS, and it cannot do that while offering four alternatives.
   */
  private static readonly OPEN_AT_ONCE = 5;
  private pauseRemaining = 0;
  /** Seconds left holding the Contact View after a resolution. Zero when not holding. */
  private resolveHold = 0;
  /** The wordmark at the head of the menu. Only ever visible on the menu itself. */
  private facilityPlate: THREE.Object3D | null = null;
  /** Counting down to leaving a LOST request - see closeLostRequest. */
  private lostHold = 0;
  /** Whether the current room is being looked at from directly above - see toggleOverview. */
  private overhead = false;
  private onOverviewKey: ((event: KeyboardEvent) => void) | null = null;

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
      /**
       * Last, and the second device request.
       *
       * Ileana's board is a memory problem and this is a topology one, so putting them at
       * opposite ends of the queue means the player meets the idea "the console is
       * something you WORK, not only something you type into" twice, with three
       * conversations in between to keep it from reading as a puzzle game.
       */
      { mission: MISSION_05, contact: VASILE },
      /**
       * Last, and the only request with a clock on it.
       *
       * §154 reserves Timed for when the fiction genuinely requires a decision in a
       * window, and five Calm-to-Soft requests have earned the game the right to use it
       * once. It also lands after the player has met two devices, so the third arrives as
       * "another thing the console does" rather than as a new idea under pressure.
       */
      { mission: MISSION_06, contact: DORIN },
      /**
       * Last, and the only beat in the game that runs in real time.
       *
       * §153 wants a game to move between tempos and this is the only Tempo.Act request
       * there is. It arrives seventh on purpose: by now the player has met three devices
       * and knows the console is something you work, so a live one lands as a spike rather
       * than as the game changing genre in front of them.
       */
      { mission: MISSION_07, contact: SANDA },
      /**
       * Eighth, and the only request that is not somebody asking for help.
       *
       * It has to come last for a reason that is about the player rather than about
       * difficulty: seven people have now trusted this machine with a problem, and the
       * eighth arrival is a policeman who has been given a terminal. The unease only works
       * if the player has already spent the whole game being useful.
       */
      { mission: MISSION_08, contact: LUCIAN },
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
      /**
       * Shadow flags applied here, once, for every diorama.
       *
       * Not at the prop call sites: there are several hundred of them and not one had a
       * shadow flag, so opting each in would be several hundred chances to miss one - and
       * the missed prop is the one that floats. See art/shadows.ts for the policy, which is
       * simply that lit materials cast and receive and unlit ones do neither.
       *
       * Rigged contacts arrive from a GLB after this runs, so they re-apply it themselves
       * once their model is in the tree.
       */
      applyShadowPolicy(scene as unknown as THREE.Object3D);
      this.scenes.set(sceneId, scene);
      this.add(scene);
    }
  }

  public override beginPlay(): boolean {
    if (!super.beginPlay()) return false;

    /**
     * Before anything else draws.
     *
     * The pointer is the only thing on this screen that was not made by this game, and it
     * also goes missing the moment the player clicks into the window. Declaring it here
     * covers every screen from the first frame - menu, globe and contact view - rather
     * than waiting for a session that has not started yet.
     */
    installCursor();

    this.configureLook();

    /*
     * The way in to every room. See dev/SceneJump - this replaces the practice of editing
     * the game to reach a scene, which has twice shipped a debug hook by accident.
     */
    const jumpContainer = this.getWorld()?.gameContainer;
    if (jumpContainer) this.disposeSceneJump = installSceneJump(this, jumpContainer);

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

    /**
     * Life outside the window.
     *
     * The player looks at this room more than at any diorama - it is the menu, the home
     * shot, and where the game returns between every request - and until now the view
     * through the window was a still image. A view that never changes stops being a view
     * within about ten seconds and becomes a poster.
     *
     * Nothing out there carries information or can be interacted with, which is the point:
     * it is the only place in the game whose job is to say the world is not waiting for
     * the player. The boat takes four minutes to cross, so noticing it means noticing that
     * time has passed - the only clock in the room, and it has no numbers on it.
     */
    this.seaLife = createSeaLife(WINDOW_VIEW);
    station.add(this.seaLife.root);

    /**
     * The facility plate.
     *
     * The machine's own mark, screwed to the wall under the pinboard, the way any piece of
     * institutional equipment carries the name of the thing that installed it. The wordmark
     * and the motto are already written in the game's own voice - KNOWLEDGE IS CONNECTION,
     * CONNECTION IS POWER is exactly what an organisation that built this would put on a
     * wall, and exactly the sentiment the player spends the game complicating.
     *
     * This is where the mark lives instead of on the CRT. It was a boot sequence on the
     * tube first, which is a better idea and cost the machine its screen: a title that owns
     * the hero object can also break it, and it did - the tube froze on one dark frame and
     * stayed there. On a wall it is static geometry with a texture, it cannot stall a tick,
     * and if the image never loads there is simply nothing hanging there.
     */
    void this.hangFacilityPlate(station);

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
      position: new THREE.Vector3(0, 0, -0.5 + DESK_SHIFT),
      /**
       * 0.54, which is 54cm across.
       *
       * The model is a metre wide as authored, and a CRT of that shape was never bigger
       * than about 50cm - at full size it was a forty-inch tube in a form factor that
       * never existed. It looked plausible only because the menu plates beside it were
       * oversized by the same factor, so the two agreed with each other and disagreed with
       * the chair, the room and the people.
       *
       * Scaling from the node keeps the model's own origin at its feet, so it stays on
       * the desk without a compensating y - and SCREEN_main, the glass and the lamp are
       * children, so the CRT surface and the socket anchors all follow for free.
       */
      scale: new THREE.Vector3(0.54, 0.54, 0.54),
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
      glass.material = createScreenGlass({
        seed: 'omniscient-terminal-glass',
        // Pulled from 0.72. It was tuned before the room had banded light, occlusion or a
        // sky in the window, and against those it reads as paint on the tube rather than
        // as a reflection in it. Glass is most convincing when you are not sure you saw it.
        intensity: 0.3,
      });
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

    /**
     * Post-process, live.
     *
     * configureEffect is a whole-config call rather than a uniform write, so each slider
     * re-sends the effect's settings. That is heavier than writing a uniform and still far
     * cheaper than a thirty-second rebuild, which is the only alternative.
     */
    const post = this.post;
    if (post) {
      // Mirrors the shipped values above, so the panel starts where the game actually is.
      const bloom = { strength: 0.72, threshold: 0.55, radius: 0.82 };
      const pushBloom = (): void =>
        post.configureEffect(ENGINE.PostProcessPass.Bloom, { enabled: true, ...bloom });

      tune.group('bloom');
      tune.slider({
        label: 'strength',
        min: 0,
        max: 3,
        get: () => bloom.strength,
        set: (v) => {
          bloom.strength = v;
          pushBloom();
        },
      });
      tune.slider({
        label: 'threshold',
        min: 0,
        max: 1,
        get: () => bloom.threshold,
        set: (v) => {
          bloom.threshold = v;
          pushBloom();
        },
      });
      tune.slider({
        label: 'radius',
        min: 0.1,
        max: 1,
        get: () => bloom.radius,
        set: (v) => {
          bloom.radius = v;
          pushBloom();
        },
      });

      const ao = { ssaoStrength: 2.4, ssaoRadius: 0.11 };
      const pushAo = (): void =>
        post.configureEffect(ENGINE.PostProcessPass.AO, {
          enabled: true,
          ssaoSamples: 12,
          luminanceInfluence: 0.6,
          resolutionScale: 0.5,
          ...ao,
        });

      tune.group('occlusion');
      tune.slider({
        label: 'strength',
        min: 0,
        max: 4,
        get: () => ao.ssaoStrength,
        set: (v) => {
          ao.ssaoStrength = v;
          pushAo();
        },
      });
      tune.slider({
        label: 'radius',
        min: 0.005,
        max: 0.4,
        get: () => ao.ssaoRadius,
        set: (v) => {
          ao.ssaoRadius = v;
          pushAo();
        },
      });
    }

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
      /**
       * Hidden until it is fired.
       *
       * autoStart is false, but a VFX node that is not emitting is still a node in the
       * scene - and these are all parked at one fixed spot near the origin, which in a
       * diorama is on the floor next to whatever the contact is standing at. That is the
       * green disc under Mirela's bench and the white one on the edge of the transmitter:
       * two effects sitting where they were built, waiting, in full view.
       *
       * Nothing here should be visible until something makes it happen, so they start
       * hidden and fireVfx shows them.
       *
       * ## visible = false was not enough
       *
       * That is the obvious fix and it does not work: the disc under Mirela's bench survived
       * it. A VFXNode owns renderables it manages itself, and clearing the flag on the node
       * does not reliably reach them - so the effect went on drawing while the thing that
       * was supposed to be hiding it reported success.
       *
       * They are PARKED instead, a kilometre under the floor, which no flag and no internal
       * re-show can argue with. The position each one is meant to play at is remembered here
       * and restored at the moment it fires. Belt and braces: the flag is still cleared, so
       * anything that does respect it is hidden twice over.
       */
      node.visible = false;
      this.vfxHome.set(name, node.position.clone());
      node.position.copy(VFX_PARKED);
      this.vfxNodes.set(name, node);
      this.add(node);
    }

    // Dust runs continuously over the diorama - §186's cheap painterly depth.
    this.vfxHome.set('DustVFX', new THREE.Vector3(0, 0, -0.4));
  }

  /** Where each effect plays, held while the node itself waits out of the world. */
  private vfxHome = new Map<string, THREE.Vector3>();

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
    const lampAt = WORKSTATION_ORIGIN.clone().add(
      new THREE.Vector3(LAMP.bulb.x, LAMP.bulb.y + 0.03, LAMP.bulb.z)
    );

    /**
     * A spot, because the fixture has a shade on it.
     *
     * This was a point light, which throws in every direction - including straight up into
     * the menu plates hanging above and behind it. That is not what a lamp with a hood
     * does, and it is why moving the fixture never fully solved the wash: the geometry had
     * a shade and the light did not.
     *
     * Aimed at the desk a little in front of the foot, wide and very soft, so it reads as
     * spill under a hood rather than as a stage light. The plates above it now receive
     * nothing from it at all.
     */
    const lamp = ENGINE.SpotLightNode.create({
        name: 'DeskLamp',
        angle: 1.02,
        penumbra: 0.92,
        // Inside the shade of the fixture that now exists, rather than hanging in the air
        // above the desk with nothing there to be emitting it.
        position: lampAt.clone(),
        // Warmer and tighter than before. It is a bulb under a shade half a metre from
        // the desk, so it should fall off hard and own a small area completely.
        /**
         * Pulled down, because it was clipping.
         *
         * Sampled off the home shot the desk under the shade read (240, 200, 153) - all
         * but blown - against a CRT face at (6, 13, 5). The hero object of the entire game
         * was TWENTY TIMES darker than a patch of empty desk, and the eye goes to the
         * brightest thing in a frame whatever the composition says it should do. Both
         * reference images put the screen at the top of the value range and everything
         * else below it.
         *
         * A lamp is still allowed to be the warmest thing in the room. It is not allowed
         * to be the brightest.
         */
        intensity: 5.4,
        color: new THREE.Color('#ffcf96'),
        distance: 2.4,
        decay: 1.7,
      });
    lamp.castShadow = false;
    lamp.lookAt(lampAt.clone().add(new THREE.Vector3(0.16, -1, 0.22)));
    this.add(lamp);

    /**
     * A little light on the menu itself.
     *
     * The plates hang in the air a metre from the desk lamp, so the bottom two were washed
     * by it and the top three fell away into the wall - five controls at five different
     * legibilities, in the one shot whose entire job is letting somebody read and press
     * them. Neither reference image has that problem, because in both the menu is UI and
     * carries its own light.
     *
     * Cool rather than warm, and weak: enough to lift the labels off the plate faces
     * evenly, not enough to look like a second lamp nobody can see. It sits in front of
     * the stack rather than above it so the plate faces catch it and the room behind does
     * not.
     */
    this.add(
      ENGINE.PointLightNode.create({
        name: 'MenuFill',
        position: WORKSTATION_ORIGIN.clone().add(new THREE.Vector3(-0.72, 1.0, -0.42)),
        intensity: 2.4,
        color: new THREE.Color('#cfe0ee'),
        distance: 1.9,
        decay: 1.6,
      })
    );

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
      // Follows the window down (see WINDOW in room.ts). It used to sit at y 2.2, which
      // was level with the old aperture; leaving it there with the window at 1.7 would put
      // the room's key light above a wall rather than through the glass, and the give-away
      // is a shaft that rakes DOWN the desk instead of across it.
      position: WORKSTATION_ORIGIN.clone().add(new THREE.Vector3(1.16, 1.35, -3.0)),
      // Pulled back from 26: at full strength it lit the side wall as brightly as the
      // desk, turning the left third of frame into a pale field that fought the machine.
      /**
       * Down from 17, because the window came down 1.4 metres.
       *
       * The same light through a lower aperture rakes ACROSS the desk instead of down onto
       * the wall behind it, so the desk top went from bright to clipping - sampled at
       * (227, 194, 152) with the CRT face at (10, 22, 11). Lowering the lamp alone barely
       * moved it, which is the tell that the key and not the practical was doing the
       * damage.
       */
      intensity: 11,
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
    this.fog = ENGINE.FogNode.create({
      name: 'Atmosphere',
      fogMode: ENGINE.FogMode.Linear,
      fogColor: new THREE.Color(LIGHT.haze),
      fogNear: FOG_NEAR,
      fogFar: FOG_FAR,
    });
    this.add(this.fog);
  }

  /**
   * Post-processing, and a correction to §231.
   *
   * §231 has said since it was written that post-process effects are WebGPU-only and fail
   * silently on WebGL. That is wrong, and it has been quietly costing this project the
   * whole time: `.engine/src/render/postprocessing/pipelines/WebGLPipeline.ts` is a full
   * EffectComposer pipeline, and only four effects - depth of field, pixelation, retro and
   * SSR - actually extend WebGPUOnlyEffectBase. Bloom has in fact been running here all
   * along. Colour grading is the one that genuinely is not available: its
   * `createWebGLEffect` returns an empty effect list, so the enum's "WebGPU only for now"
   * comment is accurate even though the method exists.
   *
   * ## Ambient occlusion is the important one
   *
   * This project has NO contact shadows. §231's other clause is true - shadow casting is
   * off across the whole rig, because it spans sixty units and one directional shadow map
   * cannot cover the workstation and the dioramas at once. So nothing in this game has
   * ever had darkening where it meets the thing it stands on, which is the single
   * strongest cue that an object is resting rather than hovering. A playtester reading
   * props as "floating" is exactly the symptom that predicts.
   *
   * SSAO does not care how big the world is - it works in screen space, from the depth
   * buffer, and is completely indifferent to the sixty units that defeat a shadow map.
   * It is the one thing available here that puts a prop back on the surface under it.
   */
  private configureLook(): void {
    const world = this.getWorld();
    if (!world?.postProcessManager) return;
    this.post = world.postProcessManager;

    /**
     * Tone mapping, and it should have been the first thing here.
     *
     * The renderer defaults to NoToneMapping and this project never set anything else, so
     * every scene has been rendering LINEAR: values clip flat at white and there is no
     * headroom above it at all. That is why the light in this game has read as "present"
     * rather than as light. A lit wall and a blazing filament both arrive as 1.0 and
     * therefore both arrive as the same colour.
     *
     * It is also why bloom never did what it was asked to. Bloom takes what is over its
     * threshold and bleeds it - but nothing can GET meaningfully over the threshold when
     * white is a hard ceiling, so it was scraping at whatever happened to sit near the top
     * of the range instead of blooming things that are genuinely bright. Every argument
     * about bloom strength in this file was an argument about the wrong effect.
     *
     * ACES Filmic because it is the one that rolls highlights off warmly - a bright warm
     * source desaturates towards white the way film does, rather than clipping to a flat
     * primary. AgX is flatter and more neutral, which is a fine look and not this one; this
     * game has practical lamps, sunsets and a phosphor screen, and all three want shoulder.
     *
     * Exposure above 1 is the point of doing it. It lets the key lights be genuinely
     * overbright and the tone curve bring them back, which is what puts energy above the
     * bloom threshold and gives the highlights somewhere to go.
     */
    this.post.configureEffect(ENGINE.PostProcessPass.ToneMapping, {
      enabled: true,
      mode: THREE.ACESFilmicToneMapping,
    /**
     * 0.62, and the number was measured rather than picked.
     *
     * At 1.25 every mid-tone in the game roughly doubled - the far hills went 36 to 78, the
     * grass 53 to 104 - because eight scenes had been graded by eye against a linear
     * pipeline, and lighting them properly meant they were all suddenly over-exposed. The
     * evening in Adaeze's field turned into an afternoon.
     *
     * At 0.62 the mid-tones land back within a few values of where they were authored
     * (hills 44, grass 63) while the top end keeps its new shoulder - the sun core
     * compresses from 197 to 208 instead of clipping flat. Night is unaffected: the mill
     * road still reads sky 4, road 9, hedge 3, so nothing has gone milky.
     *
     * That is the whole point of doing this. The scenes look as they were meant to and now
     * have headroom above white, which is what bloom needed all along.
     */
    exposure: 0.62,
    });

    // Bloom carries the phosphor bleed off the CRT and the warm halo round the lamp
    // filament - the halation the reference frames have around every practical.
    this.post.configureEffect(ENGINE.PostProcessPass.Bloom, {
      enabled: true,
      // 0.87 / 0.60, settled on the panel. These predated the whole art pass at 0.5/0.75,
      // which was tuned when the room had no banded light, no occlusion and a flat window
      // - and at that threshold only the CRT ever crossed it. Dropping the threshold lets
      // the lamp filament and the lit sky bleed too, which is the halation every one of
      // the reference frames has around its practicals.
      /**
       * Threshold raised, because bloom was undoing the lighting.
       *
       * The desk under the lamp sampled (240, 200, 153). The lamp came down 40%, the
       * window key came down 35%, and it moved to (226, 195, 155) - almost nothing. That
       * is the signature of a bloom threshold sitting below the value of LIT SURFACES
       * rather than of emitters: every reduction in light was immediately re-added as
       * halo, so the exposure could not be controlled at all from the lights.
       *
       * At 0.78 the desk and the paper fall below the line and stop glowing, while the CRT
       * face, the lamp filament and the window keep the halation the reference frames
       * have. Bloom should be a property of things that EMIT, not of everything the lamp
       * happens to be pointing at.
       */
      /**
       * Retuned after tone mapping, which invalidated every number above.
       *
       * All of that reasoning was correct and was measured on an UNTONEMAPPED image. ACES at
       * exposure 0.62 then pulled the whole range down, and nobody moved the threshold to
       * follow it - so the line stayed where it was while everything it was meant to catch
       * dropped underneath.
       *
       * The proof is Tomas's beacon. Its core measures luma 181, which is 0.71 - below a
       * threshold of 0.78. Twenty pixels outside the lamp the sky reads 15, against a far-sky
       * reference of 16.6: not a weak halo, NO halo, the emitter darker at its own edge than
       * the sky across the map. Every practical in the game was in the same position.
       *
       * At 0.55 the beacon reads 26 against sky at 16.6 and decays to it by 120px, which is
       * light in air. The original concern - lit surfaces glowing - is answered by the tone
       * curve rather than by the threshold: the desk that forced 0.78 was sampling 240 before
       * ACES and sits far below this line after it. Checked, and the bench is lit without
       * glowing; only the paper takes any halation.
       *
       * Radius up as well. The old 0.65 was a tight rim, and a wide low-strength spread is
       * what reads as light in air rather than as an outline traced round the bright thing.
       */
      strength: 0.72,
      threshold: 0.55,
      radius: 0.82,
    });

    /**
     * The outline, and the other half of cel shading.
     *
     * §231's correction did not go far enough. Only four effects are genuinely WebGPU-only
     * - depth of field, pixelation, retro and SSR - and ObjectOutline is not among them:
     * it ships a complete WebGL implementation with its own object-ID pass and edge
     * detection shader. It was written off along with the rest and never tried.
     *
     * That mattered, because this project already had HALF of a toon look and did not know
     * it. `applyPaintBanding` quantises the lighting on every standard material in the
     * game, which is the shading half. What was missing was the line, and it is the line
     * that makes an image read as drawn rather than as rendered - banded shading on its own
     * just looks like a cheap gradient.
     *
     * ## Why the selection is the evidence and NOT the contact
     *
     * It was going to be both. It cannot be, and the reason is worth writing down so it is
     * not attempted again: in this WebGL pipeline the outline does not respect occlusion.
     * The effect renders a scene depth pass and its shader linearises depth to find
     * occlusion seams, but the result on screen is that a selected object's silhouette is
     * inked THROUGH whatever is in front of it. Mirela stands behind a bench, so her legs
     * and boots were drawn as a thin line running down over the bench and looping round a
     * crate on the shelf below - a stray contour in the middle of the frame with no object
     * under it. Confirmed with `useRootGrouping` both on and off; it is not the grouping.
     *
     * Every contact in this game stands at a bench, a table, a run of pipe or a door, so
     * this is not an edge case, it is the normal case. The evidence props do not have the
     * problem: they sit on top of the surfaces they belong to and nothing occludes them.
     *
     * Losing the contact outline costs less than it sounds. The contact is already the
     * focal point of every shot by framing, by lighting and by being the only thing in the
     * room that moves. What the outline adds that nothing else does is pointing at the
     * OBJECT, which has no light on it and does not move - which is exactly what it is
     * still doing.
     *
     * ## Why the selection is evidence and not everything
     *
     * A full-scene outline is the strongest possible style commitment and the wrong one
     * here. Every one of these sets is a room where exactly one or two things matter, and
     * §186 has been about directing the eye to them since the first diorama. An outline is
     * the loudest tool available for that: edging the contact and the thing their request
     * is about, and nothing else, means the two things the player must look at are the two
     * things drawn in ink. Edge the walls as well and that advantage is spent on a floor.
     */
    /**
     * Off. The ink line was the wrong tool for the job it was doing.
     *
     * The reasoning below is still sound in the abstract - edge the two things the player
     * must look at and nothing else - but in practice a dark stroke around a clue reads as
     * a UI decoration laid over the world rather than as something IN it, and it fought the
     * one thing this art direction has going for it, which is that everything is made of
     * flat planes and honest silhouettes. Directing the eye is lighting's job here: the clue
     * gets a practical on it or it sits against a value it separates from. That is what the
     * whole shadow and bloom pass was for.
     */
    this.post.configureEffect(ENGINE.PostProcessPass.ObjectOutline, {
      enabled: false,
      // Thin and dark rather than thick and coloured. A heavy line eats a 1.7m figure at
      // four metres, and a coloured one competes with §9's semantic accents - the acid
      // green means knowledge and must not start meaning "outlined".
      edgeStrength: 3.2,
      edgeThickness: 1.4,
      visibleEdgeColor: 0x141210,
      edgeBlur: 0,
      // Per-actor IDs, so a character built from eleven merged meshes gets one silhouette
      // rather than a line around every glove and boot. Internal edges on a figure this
      // blocky read as cracks.
      useRootGrouping: true,
      resolutionScale: 1,
    });

    /**
     * Colour grading, for saturation the tone curve takes out.
     *
     * ACES is a filmic curve and filmic curves desaturate as they roll off - that is what
     * makes them read as film rather than as a render, and it is also why every colour in
     * this game arrives a little greyer than it was authored. §255 says author for what
     * survives the pipeline; this is the other half of that bargain, putting the chroma back
     * globally instead of hand-correcting several hundred hex values that were right when
     * they were written.
     *
     * Saturation only, and modestly. Contrast and lift are already doing their work in the
     * lights, and a grade that starts moving those is a grade that will quietly undo the
     * balance the shadow pass was measured into.
     */
    /**
     * Left configured, and it does nothing here. Read `art/retro.ts` before touching it.
     *
     * `ColorGradingEffect.createWebGLEffect` returns `{ effects: [] }` - it is WebGPU-only
     * in the same way the retro and pixelation passes are, and §221's list was one entry
     * short. So this saturation has never reached a frame, and every argument about the
     * colour in this game being flat was an argument about a knob that was not connected.
     *
     * The value stays because it is correct for the WebGPU path and costs nothing on this
     * one. The saturation that actually applies lives in the retro pass below.
     */
    this.post.configureEffect(ENGINE.PostProcessPass.ColorGrading, {
      enabled: true,
      saturation: 1.22,
    });

    /**
     * The CRT, and the grade that comes with it.
     *
     * Mounted once and never toggled - the pass is a pure copy at the `world` preset, so
     * leaving it on costs one fullscreen blit and removes the whole class of bug where an
     * effect is enabled from one place and disabled from another. §187 is served by the
     * preset, not by the switch: `mountScene` and `returnHome` decide which of the three
     * contexts we are looking at.
     *
     * It cannot be mounted from here. The pipeline it registers into does not exist until
     * the first frame renders, and `registerEffect` is a no-op with no complaint until it
     * does - so the mount is retried from `tickPrePhysics` until it confirms.
     */

    // Short radius on purpose: this is contact darkening in the crack where two surfaces
    // meet, not a dirt wash in every corner of the room. A long radius reads as grime and
    // costs the §232 value structure exactly what the texture pass was careful not to.
    this.post.configureEffect(ENGINE.PostProcessPass.AO, {
      enabled: true,
      // 2.4 / 0.11, settled with the F8 panel against the home shot. 1.1 / 0.05 - the
      // first guess from the engine defaults - was invisible in a capture; 4.0 / 0.27
      // grounds everything and starts reading as grime in the wall corners.
      ssaoStrength: 2.4,
      ssaoRadius: 0.11,
      ssaoSamples: 12,
      luminanceInfluence: 0.6,
      resolutionScale: 0.5,
    });
  }

  // -- Session -----------------------------------------------------------------------

  /**
   * Load the mark and hang it on the wall. Never throws into the caller.
   *
   * Async because the texture comes off disk, and the room is built synchronously - so the
   * plate appears a frame or two after everything else, which nobody will see and which is
   * the price of not blocking world construction on a file read.
   */
  private async hangFacilityPlate(station: ENGINE.SceneNode): Promise<void> {
    try {
      const texture = await ENGINE.resourceManager.loadTexture(
        ENGINE.AssetPath.fromString('@project/assets/textures/Omniscientlogo.png')
      );
      if (!texture) return;


      // The logo is 2.5:1. Sized to the plate stack it now heads, so the two read as one
      // control panel rather than as a sign near some buttons.
      const WIDTH = 0.86;
      const plate = new THREE.PlaneGeometry(WIDTH, WIDTH / 2.5);

      /**
       * Flip the UVs, not the texture.
       *
       * The engine uploads with flipY OFF, so an image mapped straight onto a quad arrives
       * upside down - the same trap the decals fell into. Setting `texture.flipY = true`
       * after loading does nothing, because by then it is already on the GPU and the flag
       * is only read at upload; that was tried first and changed nothing at all, which is
       * the most misleading possible result.
       *
       * Rewriting v on the geometry cannot be ignored by anything downstream. Worth
       * knowing that a flipped wordmark reads as MIRRORED rather than as upside down,
       * which sends you hunting for a winding-order bug that was never there.
       */
      const uv = plate.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
      uv.needsUpdate = true;

      /**
       * At the head of the menu, not on the wall behind it.
       *
       * It was screwed to the wall under the pinboard, which is where a facility plate
       * would really be and which is compositionally wrong: it sat in the dead centre of
       * frame between the two things the shot is about, so it competed with both. Both
       * reference frames put the wordmark hard top-left with the menu stack directly
       * beneath it, and that is not a coincidence - the eye enters at the title and falls
       * straight down the list.
       *
       * Aligned to STACK_ORIGIN's x and z (see MainMenu) rather than to the wall, so it
       * travels with the plates if they are ever moved again.
       */
      // Left edges flush with the plate stack. The plates are 0.75 wide centred on
      // x -0.95, so their left edge is -1.325; a 0.86-wide logo sharing that edge centres
      // on -0.895. Ragged-left was the single thing making the two read as unrelated.
      plate.translate(-0.895, 1.55, -0.35 + DESK_SHIFT);

      /**
       * Unlit, and slightly under full brightness.
       *
       * The mark is pure acid green on black and the room is warm and dim; lit normally it
       * would sit in shadow and read as a grey smudge, and at full unlit brightness it
       * would out-shout the CRT, which is the one thing in this frame that has to win.
       * Just bright enough to read from the menu shot, and no brighter.
       */
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0.72,
        toneMapped: false,
        depthWrite: false,
      });

      /*
       * Kept, so it can be taken down.
       *
       * The mark belongs to the front door and nowhere else. It is a physical plate at
       * the head of the menu stack, which means the camera flying home from a finished
       * request sweeps back across the workstation and puts the logo through the middle
       * of the transition - a title card in the middle of a game, which is what it reads
       * as and is exactly what it should not.
       *
       * Hidden the moment the menu is left and hung again when it is returned to. See
       * showFacilityPlate.
       */
      this.facilityPlate = decorMesh('FacilityPlate', plate, material);
      this.facilityPlate.visible = this.phase === Phase.Menu;
      station.add(this.facilityPlate);
    } catch (error) {
      console.warn('[omniscient] facility plate not hung', error);
    }
  }

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
      /**
       * A fact recorded is the only moment in the game where the machine GAINS something,
       * and it is also the only pleasant sound in it. That is not a coincidence - the
       * whole progression is the tree, and the tree only moves here.
       */
      // Presentation only, and it never touches mission state - see PlayerMessage's `aim`.
      onAim: (to) => this.scene?.aim(to),
      onKnowledgeGained: (factIds) => {
        audio.play('learn');
        this.revealGrowth();
        /*
         * And the room hears it too.
         *
         * The fact ids were being discarded here. The tree grew, the cue played, and the
         * diorama - the half of the game the whole art direction is about - was told
         * nothing, which is why a room never warmed up in eleven months of it being the
         * stated plan. See ContactScene.learn.
         */
        this.scene?.learn(factIds);
      },
      onResolved: () => {
        audio.play('solved');
        this.holdThenReturnHome();
      },
      onFailed: (failure) => {
        audio.play('failed');
        this.onRequestLost(failure);
      },
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

    // Held so it can be taken off again in endPlay, rather than outliving the rig.
    this.onOverviewKey = (event: KeyboardEvent): void => {
      if (event.key !== 'F2') return;
      event.preventDefault();
      this.toggleOverview();
    };
    window.addEventListener('keydown', this.onOverviewKey);

    // Open on the machine at rest: menu up, tree on the CRT (§174, §183).
    this.setPhase(Phase.Menu);
    this.screen = Screen.Tree;
    this.cutTo(HOME_SHOT);
    this.menu?.setEnabled(true);
    this.phone.setVisible(false);
  }

  /**
   * Change phase, and take the wordmark down with it.
   *
   * A setter rather than six assignments, because the plate has to come down on every
   * route out of the menu and go back up on every route in, and a rule enforced at six
   * call sites is a rule that holds until somebody adds a seventh.
   */
  private setPhase(next: Phase): void {
    this.phase = next;
    if (this.facilityPlate) this.facilityPlate.visible = next === Phase.Menu;
  }

  private attachPicker(world: ENGINE.World, container: HTMLElement): void {
    this.picker = new Picker(() => this.camera?.getCamera() ?? null, container);
    world.inputManager?.addInputHandler(this.picker);

    this.menu?.attach(this.picker);
    this.menu?.onAction((action) => this.onMenuAction(action));
  }

  private onMenuAction(action: MenuAction): void {
    /**
     * Every plate that is lit now does something.
     *
     * CONTINUE is the exception and it is honest about it - it is drawn `disabled`,
     * because there is no save system, so it reads as present and cold rather than as
     * present and broken. The other three were lit and hooked to nothing, which is a
     * different thing entirely: §103 wants the MACHINE to look like it does more than you
     * are using, and that argument does not extend to the front door.
     */
    if (action === 'shutdown') {
      audio.play('disconnect');
      audio.setOnAir(false);
      // Left to settle so the squelch is heard rather than cut off by the window going.
      window.setTimeout(() => this.shutDown(), 420);
      return;
    }

    if (action === 'settings' || action === 'credits') {
      audio.play('tap');
      const world = this.getWorld();
      const container = world?.gameContainer;
      if (!container) return;
      this.systemPanel ??= new SystemPanel(container);
      this.systemPanel.open(action);
      return;
    }

    if (action !== 'new-game') return;

    /**
     * The first gesture the game gets, and therefore the only place audio can start.
     *
     * Browsers refuse to start an AudioContext outside a user gesture, and one created at
     * load sits `suspended` forever while every cue silently does nothing - a failure mode
     * with no symptom except silence, which is indistinguishable from having no audio at
     * all. Hanging it off NEW GAME means it cannot be missed.
     */
    audio.unlock();

    this.menu?.setEnabled(false);
    this.showGlobe();
  }

  /**
   * Put the machine to sleep.
   *
   * Electron closes on `window.close()`; a browser tab mostly will not, because a page
   * that did not open itself is not allowed to close itself. So there is a fallback, and
   * it is deliberately not a blank screen: a game that says SHUT DOWN and then shows
   * nothing looks like it crashed on the way out. The last thing the player sees is the
   * machine agreeing that it has stopped.
   */
  private shutDown(): void {
    try {
      window.close();
    } catch {
      // Nothing to do - the fallback below covers it either way.
    }

    window.setTimeout(() => {
      if (document.hidden) return;
      const body = document.body;
      if (!body) return;
      body.style.background = '#04100a';
      const said = document.createElement('div');
      said.style.cssText =
        'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
        "font-family:'Courier New',monospace;color:#4f9a5e;letter-spacing:0.3em;" +
        'font-size:13px;background:#04100a;z-index:9999;';
      said.textContent = 'OMNISCIENT_ // OFFLINE';
      body.appendChild(said);
    }, 260);
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

    /*
     * A lost request that is already on its way out leaves by the other door.
     *
     * END CALL unlocks the moment the note is written, and the hold that follows keeps the
     * console up for another seven seconds so the note and the line about what happens
     * next can be read - which leaves a window where this method is reachable for a
     * request `onRequestLost` has already put back. Running the body below would decrement
     * `queueIndex` a second time for the same request and hand the player somebody else's
     * mission, and then the expiring hold would call `showGlobe` on top of it.
     *
     * So the click means "I have read it" rather than "leave": drop the hold and take the
     * lost-request exit now.
     */
    if (this.lostHold > 0) {
      this.lostHold = 0;
      this.leaveLostRequest();
      return;
    }

    const contactId = this.activeIndex === null ? undefined : this.queue[this.activeIndex]?.mission.contactId;
    if (contactId) {
      this.setSignalState(contactId, SignalState.Waiting);
      this.openable.add(contactId);
    }
    this.activeIndex = null;

    audio.play('disconnect');
    audio.setOnAir(false);
    this.post?.clearOutlineSelection();

    this.releaseUnit(false);
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
    this.setPhase(Phase.Menu);
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
  /**
   * Back to the globe, and it now leaves the way solving leaves.
   *
   * Reported as ending a call feeling faster than finishing one, and it was: this did a
   * 1.6s move and nothing else, while `returnHome` fires the green warp and blends the CRT
   * curvature back over 2 seconds. Two exits from the same place, one of which was a cut
   * and one a transition - and the one that felt cheap was the one the player takes when
   * they are unsure, which is the worst place in the game to feel like you have been
   * hurried out.
   *
   * The warp is doing real work rather than decorating. The cut from somebody's cellar to
   * a screen sixty units away is the hardest edit here, and green at the edges is what
   * says who is doing the moving. It was written for the other door and there was never a
   * reason it belonged to only one of them.
   */
  private showGlobe(): void {
    const warpContainer = this.getWorld()?.gameContainer;
    if (warpContainer) playWarp(warpContainer);
    setRetroLook('console');

    this.setPhase(Phase.Choosing);
    this.screen = Screen.Globe;
    this.phone?.setVisible(false);

    // Matched to returnHome's 2.0s. The handover still lands just before the move ends, so
    // the globe is under the camera by the time it settles rather than arriving after it.
    this.moveTo(SCREEN_SHOT, 2.0);
    this.globeHandoff = 1.9;
  }

  /**
   * Hand out requests until the globe is holding its quota.
   *
   * Counts what is actually ANSWERABLE rather than what has been handed out: a contact
   * on a countdown after a failure is on the globe but cannot be taken, and so does not
   * fill a slot. Resolved ones do not either. So a player who fails one still has five
   * things they can do, which is the point of the number.
   *
   * Order is preserved. The queue is authored - Mirela teaches looking, Ileana breaks
   * the habit of looking for a fault, Tomas pays off Mirela's shared feed - and this
   * releases along it rather than choosing. What changes is that five doors are open at
   * once instead of one, not which door comes next.
   */
  private topUpGlobe(): void {
    const answerable = (): number =>
      this.signals.filter(
        (signal) =>
          !signal.hidden && signal.state === SignalState.Waiting && this.openable.has(signal.id)
      ).length;

    while (answerable() < OmniscientRig.OPEN_AT_ONCE && this.offered < this.queue.length) {
      const request = this.queue[this.offered];
      this.offered += 1;
      this.setSignalState(request.mission.contactId, SignalState.Waiting);
      this.openable.add(request.mission.contactId);
    }
  }

  private openSignal(signalId: string): void {
    const index = this.queue.findIndex((request) => request.mission.contactId === signalId);
    if (index < 0 || !this.session) return;

    // Squelch breaks and the carrier comes up. This is the moment a screen change becomes
    // a connection to somewhere.
    audio.play('connect');
    audio.setOnAir(true);

    this.setSignalState(signalId, SignalState.Active);
    this.openable.delete(signalId);
    this.activeIndex = index;

    this.setPhase(Phase.Contact);
    // Every room opens on its own establishing shot, whatever the last one was left on.
    this.overhead = false;
    this.screen = Screen.Tree;
    this.globeScreen?.detach();
    this.phone?.setVisible(true);

    const request = this.queue[index];
    this.mountScene(request.mission.sceneId);
    // Dust is the exception - it runs continuously, so it is the one that gets to be seen
    // without being fired.
    const dustNode = this.vfxNodes.get('DustVFX');
    if (dustNode) {
      // Also parked until now, so it needs bringing back like any other effect.
      const home = this.vfxHome.get('DustVFX');
      if (home) dustNode.position.copy(home);
      dustNode.visible = true;
      dustNode.startEmitting();
    }
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
  /**
   * TESTING: every failure countdown, clamped to this many seconds.
   *
   * The authored values are 90 to 180 and they are the right ones - long enough that a
   * lost request is a real setback, short enough to come back inside one sitting. They
   * are also unbearable when what you are testing is the losing.
   *
   * One number in one place so it is one line to take out. Set it to null to give every
   * mission its own cooldown back.
   */
  private static readonly COOLDOWN_OVERRIDE: number | null = 10;

  private onRequestLost(failure: MissionFailure): void {
    const contactId = this.activeIndex === null ? undefined : this.queue[this.activeIndex]?.mission.contactId;
    if (!contactId) return;

    /*
     * A failure may waive its countdown, and the first request does - see its
     * `cooldownSeconds`. Zero means the request goes straight back to answerable rather
     * than red, so the contact is already green by the time the player reaches the globe.
     *
     * Guarded rather than assumed: `signal.cooldown = 0` with the state still set to
     * Cooldown would leave a red marker with no Answer button waiting on a countdown that
     * has already finished, which GlobeScreen's own note calls a cooldown that never ends.
     */
    const signal = this.signals.find((s) => s.id === contactId);
    const authored = failure.cooldownSeconds;
    const seconds =
      OmniscientRig.COOLDOWN_OVERRIDE !== null && authored > 0
        ? OmniscientRig.COOLDOWN_OVERRIDE
        : authored;
    const waits = seconds > 0;
    if (signal) {
      signal.state = waits ? SignalState.Cooldown : SignalState.Waiting;
      signal.cooldown = waits ? seconds : undefined;
    }

    /*
     * ADD, not "skip the delete". This was the bug reported on the first build of the
     * waived countdown: Mirela came back green and unanswerable, the globe read "0
     * waiting - nothing you can take", and her marker said nobody was asking there yet.
     *
     * Answerable is two conditions, not one - GlobeScreen counts a request as waiting
     * only if the state is Waiting AND the id is in `openable`, and the tooltip puts the
     * Answer button on the same test. `openContact` removes the id the moment a request
     * is opened, so by the time a failure lands it is already gone, and declining to
     * remove it again restores nothing. `reopenAfterCooldown` has always had to add it
     * back; the no-countdown path is that same path with the wait taken out.
     */
    if (waits) this.openable.delete(contactId);
    else this.openable.add(contactId);

    // No longer the open request. It goes back on the globe either at once or when
    // its countdown lapses, and both of those are handled above.
    this.activeIndex = null;

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
    // Anything already answered stays answered - a cooldown that outlives its own
    // request would put a solved contact back on the globe asking for help again.
    const signal = this.signals.find((s) => s.id === signalId);
    if (!signal || signal.state === SignalState.Resolved) return;

    this.openable.add(signalId);
    this.setSignalState(signalId, SignalState.Waiting);
  }

  /**
   * The player has written their note. The request is finished with, so go back out to
   * the globe - where the contact they just lost is now red and counting down.
   */
  private closeLostRequest(): void {
    if (this.phase !== Phase.Contact) return;

    /*
     * Not straight out. The note is followed by two more lines - what was recorded, and
     * what now happens to the request - and closing on the same tick showed them for no
     * frames at all. Same fault RESOLVE_HOLD exists to fix at the other end of a request,
     * and the same fix: hold, let it be read, then leave.
     */
    this.lostHold = NOTE_HOLD;
  }

  /** The hold above, expired. */
  private leaveLostRequest(): void {
    if (this.phase !== Phase.Contact) return;

    this.releaseUnit(false);
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
    // The carrier falls away as the camera pulls back. Solving a request and leaving one
    // should sound the same from here on: the difference was in the verdict cue, and the
    // link closing is the link closing.
    audio.setOnAir(false);

    /**
     * The pull back into the machine.
     *
     * Fired here rather than at the outcome, because this is the moment the CAMERA starts
     * moving - the effect is the room rushing past, and it has nothing to be past until
     * the shot begins. Matched to the home move's own duration so the green is gone by the
     * time the workstation settles rather than hanging over it.
     *
     * It also does a job beyond looking good. The cut from somebody's cellar to a desk
     * sixty units away is the hardest edit in the game, and until now it was a straight
     * camera move between two unrelated rooms. Green at the edges says who is doing the
     * moving.
     */
    const warpContainer = this.getWorld()?.gameContainer;
    /**
     * Its own duration, and deliberately longer than the camera move.
     *
     * Matching the shot exactly sounded right and played wrong: two seconds is not long
     * enough to register as an event, so it read as a flash. Running past the end of the
     * move means the machine is still pulling as the desk settles, which is the right way
     * round - the arrival should finish under it rather than the other way about.
     */
    if (warpContainer) playWarp(warpContainer);

    /**
     * The tube closes back over you.
     *
     * Blended rather than snapped, and timed to ride the warp: by the time the desk
     * settles the curvature, the scanlines and the vignette are back, so the arrival home
     * is a change of medium and not just a change of address. Leaving for a diorama is the
     * same move in reverse - see `mountScene`.
     */
    setRetroLook('console');

    /**
     * And the room goes with you.
     *
     * This was missing, and it is the whole of the reported fault: solving a request left
     * the diorama LIVE. `leaveLostRequest` has always deactivated it, `mountScene`
     * deactivates the previous one on the way in - but returning home mounts nothing, so
     * the success path had nowhere the scene was ever put away, and it stayed in the world
     * with everything in it still rendering.
     *
     * Reported against Adaeze because hers is the brightest set in the game and the only
     * one with weather. A directional sun, a skylight and a 62-unit unlit sky shell do not
     * stop existing when the camera is somewhere else: they were lighting the workstation
     * from sixty units away, which is why the console room's walls came back blown to
     * white and its desk to flat saturated blue. Every other room leaked too - it was only
     * visible when the room that leaked had a sun in it.
     *
     * Here rather than after the camera settles, matching the two paths that already did
     * it. The warp is over the top of this and the retro look has just changed on the same
     * tick, so the medium is already announcing the cut.
     */
    this.releaseUnit(false);
    this.post?.clearOutlineSelection();
    this.scene?.deactivate();
    this.scene = null;

    this.setPhase(Phase.Home);
    this.screen = Screen.Tree;
    this.phone?.setVisible(false);
    this.pauseRemaining = HOME_DWELL;
    this.moveTo(HOME_SHOT, HOME_SHOT.duration ?? 2.0);

    // Resolving Mirela's request is what puts Tomas on the globe - §163's consequence
    // chain, visible before the player knows why.
    const resolvedId = this.activeIndex === null ? undefined : this.queue[this.activeIndex]?.mission.contactId;
    if (resolvedId) this.setSignalState(resolvedId, SignalState.Resolved);
    this.activeIndex = null;

    // The world opens up after the first request, not before it. §52 still gets its
    // tease; the player just gets to learn what the globe is for on an empty one first.
    if (this.offered === 1) {
      for (const signal of this.signals) {
        if (REVEALED_AFTER_FIRST.includes(signal.id)) signal.hidden = false;
      }
    }

    this.topUpGlobe();
  }

  /** The shared atmosphere, retuned per diorama - see mountScene. */
  private fog: ENGINE.FogNode | null = null;

  /** False until the retro pass is confirmed registered - see tickPrePhysics. */
  private retroMounted = false;

  private disposeSceneJump: (() => void) | null = null;

  /**
   * Mount a diorama and look at it, with none of the game in front of it.
   *
   * Deliberately not a session: no mission advances, no trust moves, nothing is marked
   * answered. The console is hidden because the point is the room. A beat that only reads
   * when jumped to is not a beat that reads.
   */
  public jumpToScene(sceneId: string): void {
    this.setPhase(Phase.Contact);
    this.globeScreen?.detach();
    this.phone?.setVisible(false);
    this.menu?.setEnabled(false);
    this.mountScene(sceneId);
  }

  /** The machine's own annotations over the diorama. Built on the first request. */
  private scan: ScanTargets | null = null;

  /** Swap the diorama. One scene is live at a time - §133 foregrounds a single contact. */
  private mountScene(sceneId: string): void {
    this.releaseUnit(false);
    this.scene?.deactivate();

    const next = this.scenes.get(sceneId) ?? null;
    if (!next) {
      console.warn(`[omniscient] no diorama built for "${sceneId}"`);
    }

    this.scene = next;
    /*
     * Undo the last attempt before showing it, not after.
     *
     * A diorama survives between requests - it is procedural geometry and rebuilding it
     * would hitch the cut - so a set that was solved is still solved when it is opened
     * again. Reset before `activate` so the first frame the player sees is the room in its
     * unsolved state; the other order shows one frame of the previous ending.
     */
    this.scene?.reset();
    this.scene?.activate();

    /**
     * §187, enforced here rather than trusted to discipline.
     *
     * Seven of these places are real - a repair shop, a field, somebody's flooded cellar -
     * and a scanline crawling over any of them says the player is looking at a screen,
     * which is precisely the premise the game is built to deny. They get the clean camera.
     *
     * The wireframe city is the exception because it is not a place. It is the machine's
     * own reconstruction of a district it has never seen, and it should look like one.
     */
    setRetroLook(sceneId === 'scene-wire-city' ? 'machine' : 'world');

    /**
     * Air, or the absence of it.
     *
     * Pushed out of the way rather than switched off, because the fog node is shared and a
     * scene that turns a global feature off has to be able to turn it back on for the next
     * one - retuning is one number in each direction and cannot leak.
     */
    if (this.fog) {
      const airless = next?.atmosphere === false;
      /**
       * A scene's own air, when it has stated one. See ContactScene.air.
       *
       * Restored to the shared values rather than left where the last scene put them, for
       * the same reason the near/far are pushed instead of switched: the fog node is global
       * and a room that retunes it owes the next room the default back. A scene that sets
       * dark air and then hands over to Mirela's shop must not take the shop's daylight
       * haze with it.
       */
      const air = next?.air ?? null;
      this.fog
        .setFogColor(new THREE.Color(air?.color ?? LIGHT.haze))
        .setFogNear(airless ? 4000 : (air?.near ?? FOG_NEAR))
        .setFogFar(airless ? 8000 : (air?.far ?? FOG_FAR));
    }

    /**
     * Hand the outline pass this room's subject.
     *
     * Rebuilt per mount rather than accumulated: the selection is a set of live nodes, and
     * a diorama that has been deactivated still has nodes. Leaving the previous request's
     * contact in the set would put an outline round somebody who is no longer in the
     * scene, which the effect would happily draw against whatever is at those pixels now.
     */
    this.post?.clearOutlineSelection();
    const inked = next?.inkedProps() ?? [];
    if (inked.length > 0) this.post?.setOutlineSelection(inked);

    /**
     * Point the machine at this room's evidence.
     *
     * Same set of props the outline used to draw, which is the point - the outline is off
     * because a hard black line round every clue read as a cartoon, and that left the one
     * object the request is ABOUT with no treatment at all. The reticles put it back in
     * the observer's layer instead of the world's. See `link/ScanTargets`.
     *
     * Built lazily because the game container does not exist during construction, and
     * rebuilt per mount for the same reason the outline selection is: the previous room's
     * nodes are still alive, and a reticle tracking one of them would sit on screen
     * pointing at a transmitter that is sixty units away in a scene nobody is looking at.
     */
    const container = this.getWorld()?.gameContainer;
    if (container) this.scan ??= new ScanTargets(container);
    this.scan?.setTargets(next?.scanTargets() ?? []);

    const opening = next?.getShot('default');
    if (opening) this.cutTo(opening);
  }

  /**
   * §209: the world performs the instruction, the contact's body does not. The scene
   * resolves the cue to a camera move or a prop animation and hands back the world
   * position any effect should play at.
   */
  /**
   * The overhead view, on F2, for any room that has one.
   *
   * Not a District 07 special case: a scene that registers a shot called `overview` gets
   * the key, and one that does not is untouched. Today that is the wireframe city, whose
   * default shot refuses a plan view for good compositional reasons and whose actual task
   * - following a car across a road network - is a plan-view job. The room should be able
   * to be both without the mission having to script it.
   *
   * F2 rather than a letter, and that is not arbitrary. The player types into the console
   * for the whole of a request, so any key that produces a character is swallowed by the
   * input the moment it has focus - a view toggle on V would work exactly until somebody
   * used it, and then type a v.
   *
   * Contact phase only. On the globe or the menu there is no diorama to look down at.
   */
  private toggleOverview(): void {
    if (this.phase !== Phase.Contact || !this.scene?.hasShot('overview')) return;
    this.overhead = !this.overhead;
    this.applyEnvironmentCue(this.overhead ? 'camera.pan:overview' : 'camera.pan:default');
  }

  /**
   * The machine the player is currently signed into, if any.
   *
   * §187 again, from the other side. Seven of the eight sets are places the machine can
   * only look at; this is the one that has equipment on it with a radio, and driving that
   * equipment is not a new kind of thing for OMNISCIENT_ to do - it is what the player
   * already does to a camera network in District 07. The difference is that a mower
   * changes the world it is in, and a camera does not.
   */
  private driving: RemoteUnit | null = null;
  private readonly driveKeys = new DriveKeys();
  private plot: MowerPlot | null = null;
  /** Seconds to keep driving after the job is done, so the last pass can be watched. */
  private driveHold = 0;
  /** Blades cut since the last score pop, and how long ago that was. */
  private driveScore = 0;
  private driveScoreHold = 0;

  /**
   * Sign into the unit this diorama has parked on it.
   *
   * Deliberately silent if there is nothing to take. A mission that asks a cellar for a
   * mower has made a mistake, but it is not a mistake worth crashing a request over - the
   * beat carries on and the player is simply not handed anything.
   */
  private takeUnit(): void {
    const unit = this.scene?.remoteUnit;
    if (!unit || this.driving) return;

    this.driving = unit;
    this.driveHold = 0;
    unit.drive.engage(true);
    this.driveKeys.attach();

    /*
     * The console goes away, because for the next minute it is not what the player is
     * doing.
     *
     * It is a panel for TALKING to somebody and there is nobody to talk to while the
     * machine is out - Adaeze is forty metres away watching. Leaving it up also leaves the
     * text input focused, which is the practical half: every key the driving needs is a
     * character, and a console with focus swallows all of them.
     */
    this.phone?.setVisible(false);

    const container = this.getWorld()?.gameContainer;
    if (container) this.plot ??= new MowerPlot(container);
    this.plot?.setGround(unit.bounds, unit.shapes, unit.field.total);
    this.plot?.setVisible(true);

    /*
     * Cut to the machine rather than easing to it.
     *
     * Everywhere else in this game the camera moves, because it is a camera being pointed
     * at a place. This is not that: it is a different SET OF EYES coming online, and a
     * two-second glide from a composed shot of a field into the back of a mower says the
     * camera flew there. Signing into a device is instantaneous or it is not signing in.
     */
    this.cameraTweener.clear();
    this.cutTo(unit.drive.shot());
  }

  /**
   * Hand it back, park it, and let the request carry on.
   *
   * `returnCamera` is false on every path that is leaving the diorama anyway. The player
   * can hang up in the middle of a mow, and a release that always pulled the camera back
   * to the room's default shot would start a 1.8s move to a set that is being put away on
   * the same tick - which is the camera going somewhere nobody asked it to on the way out.
   * Signing out of the machine and going home are two different things and only one of
   * them owns the camera.
   */
  private releaseUnit(returnCamera = true): void {
    const unit = this.driving;
    if (!unit) return;

    unit.drive.engage(false);
    this.driveKeys.detach();
    this.plot?.setVisible(false);
    this.plot?.clearPops();
    this.driveScore = 0;
    this.driveScoreHold = 0;
    this.driving = null;
    // And she is back on the line. Only when the request is carrying on - on the way out of
    // the diorama the console is being put away with everything else.
    if (returnCamera) this.phone?.setVisible(true);

    // Back to the room, eased this time - the machine is letting go rather than taking
    // hold, and the shot it returns to is a composed one again.
    const back = returnCamera ? this.scene?.getShot('default') : null;
    if (back) this.moveTo(back, 1.8);
  }

  /**
   * Drive, cut, and draw - in that order, every frame the player has the unit.
   *
   * The camera is set from the machine AFTER it has moved, never before, for the same
   * reason the reticles are re-pinned after the camera: a view derived from a position is
   * a frame stale the moment it is computed first, and at 1.5m/s that is a picture that
   * lags the controls.
   */
  private tickDriving(deltaTime: number): void {
    const unit = this.driving;
    if (!unit) return;

    const cut = unit.drive.update(deltaTime, this.driveKeys.read());
    this.cutTo(unit.drive.shot());

    const progress = unit.field.progress();
    const done = progress / unit.target;
    this.plot?.draw({
      x: unit.drive.position.x,
      z: unit.drive.position.z,
      heading: unit.drive.facing,
      progress: done,
      points: unit.field.plotPoints(),
      /*
       * Only once the easy sweep is behind them.
       *
       * Early on everything is standing and pointing at "some grass" teaches the player
       * that the marker means nothing - which is the worst possible lesson to have taught
       * by the time the marker is the only way to find the last three patches. Held back
       * to 55% so its first appearance is also its first use.
       */
      guide:
        done > 0.55
          ? unit.field.nearestUncut(unit.drive.position.x, unit.drive.position.z)
          : null,
    });

    /*
     * Score pops, off the same number the cut returns.
     *
     * The one piece of arcade in this game and it is here for a reason a serious one would
     * accept: a rotary deck going through long grass gives almost no feedback per blade,
     * because a blade is 2.6cm wide and there are two hundred of them per square metre.
     * The work is legible in aggregate and invisible per moment. A number that leaves the
     * machine every time it eats something makes the moment-to-moment readable, which is
     * the difference between mowing and pushing a camera around a field.
     *
     * Accumulated and flushed rather than one per blade - forty blades a frame would be
     * forty labels, which is a slot machine.
     */
    this.driveScore += cut;
    this.driveScoreHold += deltaTime;
    if (this.driveScore > 0 && this.driveScoreHold > 0.22) {
      this.plot?.pop(this.driveScore);
      this.driveScore = 0;
      this.driveScoreHold = 0;
    }

    if (progress < unit.target) return;

    /*
     * Done, but not done YET.
     *
     * Snatching the camera away on the frame the last blade falls means the player never
     * sees the finished bank from the machine - the reward for the work is a cut. The hold
     * lets the last pass finish under its own steam, and then the room comes back.
     */
    this.driveHold += deltaTime;
    if (this.driveHold < 1.6) return;
    this.releaseUnit();
    /*
     * And tell the request, through the same door the console uses.
     *
     * `cleared: 1` is the second half of the exchange the accept opened - see
     * MissionRuntime.submitDevice. The rig does not decide what that means; it reports
     * that the bank is down and the mission's own onSolved decides what follows.
     */
    this.session?.submitDevice({ kind: 'unit', cleared: 1 });
  }

  /**
   * The one cue the rig answers itself instead of handing to the diorama.
   *
   * `unit.take` is not a camera move or a prop animation - it is a change in what the
   * player IS for the next minute - so a scene that only knows how to point cameras and
   * tween props has nothing useful to do with it. Intercepted here, before dispatch, and
   * everything else falls through untouched.
   *
   * Written as a cue rather than as a new field on Beat because that is how the content
   * already asks for things to happen, and a mission should not have to learn a second
   * vocabulary to say "hand them the mower".
   */
  private applyEnvironmentCue(cue: string): void {
    if (cue.startsWith('unit.take')) {
      this.takeUnit();
      return;
    }

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
    } else {
      // Back from the parking spot under the floor. See buildVfx.
      const home = this.vfxHome.get(effect);
      if (home) node.position.copy(home);
    }
    // Shown only now. See buildVfx for why they are hidden the rest of the time.
    node.visible = true;
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

    /*
     * The post-process pipeline is built lazily on the first render, so the retro pass
     * cannot be mounted from beginPlay - see installRetro, which returns false until it
     * has confirmed the registration took. Retried here rather than hooked because there
     * is no pipeline object to hang a hook on until the pipeline exists.
     */
    if (!this.retroMounted && this.post) {
      this.retroMounted = installRetro(this.post);
      if (this.retroMounted) setRetroLook('console', true);
    }

    this.cameraTweener.update(deltaTime);

    /*
     * Driving, before anything that reads the camera.
     *
     * After the tweener so a move that was still running when the player took the
     * controls loses - the machine is the camera now and a half-finished push-in fighting
     * it for the transform would read as the mower being dragged. Before the reticles and
     * the plot for the reason given on tickDriving: everything downstream is derived from
     * where the camera ended up.
     */
    if (this.driving) this.tickDriving(deltaTime);

    // Re-pin after the camera has moved, never before: the reticles are screen positions
    // derived from it, and updating them first puts every annotation one frame behind the
    // thing it is annotating - which is invisible while the camera is still and reads as
    // the labels sliding off their objects during every push-in.
    this.scan?.setVisible(this.phase === Phase.Contact);
    if (this.phase === Phase.Contact) this.scan?.update(this.camera?.getCamera() ?? null);
    // Runs in every phase, including while the player is inside a request. The world does
    // not stop because somebody is on the line, and coming back from a call to a boat that
    // has moved is most of what the boat is for.
    this.seaLife?.update(deltaTime);
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

    // And the same for a lost one, so the note and what follows it can be read.
    if (this.lostHold > 0) {
      this.lostHold -= deltaTime;
      if (this.lostHold <= 0) {
        this.lostHold = 0;
        this.leaveLostRequest();
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
    if (this.onOverviewKey) window.removeEventListener('keydown', this.onOverviewKey);
    this.onOverviewKey = null;
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
