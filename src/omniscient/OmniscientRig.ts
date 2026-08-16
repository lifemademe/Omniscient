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
      const bloom = { strength: 0.87, threshold: 0.6, radius: 0.65 };
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
      strength: 0.8,
      threshold: 0.78,
      radius: 0.65,
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
    this.post.configureEffect(ENGINE.PostProcessPass.ObjectOutline, {
      enabled: true,
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

      station.add(decorMesh('FacilityPlate', plate, material));
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
      onKnowledgeGained: () => {
        audio.play('learn');
        this.revealGrowth();
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

    const contactId = this.queue[this.queueIndex - 1]?.mission.contactId;
    if (contactId) {
      this.setSignalState(contactId, SignalState.Waiting);
      this.openable.add(contactId);
      this.queueIndex -= 1;
    }

    audio.play('disconnect');
    audio.setOnAir(false);
    this.post?.clearOutlineSelection();

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

    // Squelch breaks and the carrier comes up. This is the moment a screen change becomes
    // a connection to somewhere.
    audio.play('connect');
    audio.setOnAir(true);

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
    // The carrier falls away as the camera pulls back. Solving a request and leaving one
    // should sound the same from here on: the difference was in the verdict cue, and the
    // link closing is the link closing.
    audio.setOnAir(false);

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

  /** The shared atmosphere, retuned per diorama - see mountScene. */
  private fog: ENGINE.FogNode | null = null;

  /** Swap the diorama. One scene is live at a time - §133 foregrounds a single contact. */
  private mountScene(sceneId: string): void {
    this.scene?.deactivate();

    const next = this.scenes.get(sceneId) ?? null;
    if (!next) {
      console.warn(`[omniscient] no diorama built for "${sceneId}"`);
    }

    this.scene = next;
    this.scene?.activate();

    /**
     * Air, or the absence of it.
     *
     * Pushed out of the way rather than switched off, because the fog node is shared and a
     * scene that turns a global feature off has to be able to turn it back on for the next
     * one - retuning is one number in each direction and cannot leak.
     */
    if (this.fog) {
      const airless = next?.atmosphere === false;
      this.fog.setFogNear(airless ? 4000 : FOG_NEAR).setFogFar(airless ? 8000 : FOG_FAR);
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
