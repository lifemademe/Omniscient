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
import { MISSION_09 } from './content/mission-09-specimen.js';
import { createScreenGlass } from './art/glass.js';
import { PAINT_UNIFORMS } from './art/painterly.js';
import { TUNED_BLOOM, TUNED_OCCLUSION } from './art/postTuning.js';
import { decorMesh } from './art/mesh.js';
import { ACCENT, LIGHT, MAT } from './art/palette.js';
import { audio, MowerAudio } from './audio/ConsoleAudio.js';
import { adaptiveScore } from './audio/AdaptiveScore.js';
import {
  clearM4ssStage,
  clearSave,
  hasSave,
  isCaptureStorage,
  loadGame,
  loadM4ssStage,
  saveGame,
} from './session/persistence.js';
import { installCursor, setCursorVisible } from './art/cursor.js';
import { getRetroLookName, installRetro, retroAcquire, setRetroLook, setRetroScreenQuad, setRetroSharpQuads } from './art/retro.js';
import { projectScreenQuad } from './art/screenQuad.js';
import { setRoomTone, stopRoomTone } from './audio/RoomTone.js';
import { showBoot } from './link/BootScreen.js';

import type { BootScreen } from './link/BootScreen.js';
import { excludeFromPaintOutline, installPaint, PAINT_LOOKS, setPaintLook, setPaintProtectedQuad, setPaintValues, setPaintView } from './art/paintPass.js';
import type { PaintLook } from './art/paintPass.js';
import type { RetroLookName } from './art/retro.js';
import { ScanTargets } from './link/ScanTargets.js';
import { MowerPlot } from './link/MowerPlot.js';
import { playM4SSHandoff } from './link/M4SSHandoff.js';
import { DriveKeys } from './view/mowing.js';
import { installSceneJump } from './dev/SceneJump.js';
import { playWarp } from './art/warp.js';
import { applyShadowPolicy, castShadows } from './art/shadows.js';
import { SystemPanel } from './menu/SystemPanel.js';
import { createSeaLife } from './geometry/seaLife.js';
import { WINDOW_VIEW } from './geometry/room.js';
import {
  ANOMALY_SIGNAL,
  createSignals,
  M4SS_SIGNAL,
  MIRELA_SIGNAL,
  WAREHOUSE_SIGNAL,
} from './content/signals.js';
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
import { KELLER } from './content/contacts.js';
import { M4SSRig } from '../m4ss/M4SSRig.js';
import { FocusNavigator } from './input/FocusNavigator.js';
import { Picker } from './input/Picker.js';
import { MainMenu } from './menu/MainMenu.js';
import { drawMenuLabel } from './crt/menuLabel.js';
import { EndingPanel } from './menu/EndingPanel.js';
import { SessionController } from './session/SessionController.js';
import {
  accessibleCameraDuration,
  getAccessibilityPreferences,
  installAccessibilityPreferences,
} from './accessibility/preferences.js';
import { installSoundCaptions } from './accessibility/SoundCaptions.js';
import { VFX_LIBRARY } from './vfx/library.js';
import { TracePanel } from './warehouse/TracePanel.js';
import { WarehouseLaunchPanel } from './warehouse/WarehouseLaunchPanel.js';
import { loadWarehouseSave, updateWarehouseSave } from './warehouse/persistence.js';
import { WarehouseDirector } from './warehouse/director.js';
import { WarehouseRig } from './warehouse/WarehouseRig.js';
import { createWarehouseArchiveDisplay } from './warehouse/archiveDisplay.js';

import type { WarehouseMode, WarehouseRunResult } from './warehouse/types.js';

/**
 * Where effects wait.
 *
 * Far enough under the diorama that no camera in the game can frame it, and far enough that
 * a stray particle drifting up from it would die of distance before it arrived.
 */
const VFX_PARKED = new THREE.Vector3(0, -1000, 0);

/**
 * How cleanly the ambient occlusion is sampled - and it is the answer to "why are the
 * shadows grainy".
 *
 * There are no shadow maps in this project. Nothing sets `castShadow` on any light, in any
 * room, so every dark patch under a bench or behind a leaning panel is SSAO. That is a
 * stochastic technique: it fires N rays per pixel through a rotated kernel, and if N is
 * small the result is noise shaped exactly like the occlusion that produced it - dense
 * where a surface is buried, absent in the open. Which is why it looked like grain in the
 * shadows and nowhere else, and why softening the paint banding did nothing for it.
 *
 * It was 12 samples into a HALF-RESOLUTION buffer. Both halves of that mattered: twelve is
 * a low count for SSAO at strength 2.4, and a half-res AO buffer upsampled to the frame
 * turns per-pixel noise into 2x2 blocks - which is the blocky speckle rather than the fine
 * grain, and the reason it survives being looked at closely.
 *
 * 32 is the maximum the engine's config accepts and full resolution removes the upsample
 * entirely. `depthAwareUpsampling` stays on because it costs nothing once the buffer is
 * full-res and still helps at the silhouettes.
 *
 * The cost is real - the AO buffer goes from a quarter of the frame's pixels to all of
 * them, and each pixel does two and a half times the work. This scene renders at 240fps
 * with headroom, but that is a developer machine, and if a judge's laptop struggles the
 * first thing to trade is `resolutionScale` back to 0.75, not the sample count: the blocky
 * upsample was the uglier half of the fault.
 */
const AO_QUALITY = {
  ssaoSamples: 32,
  resolutionScale: 1,
  depthAwareUpsampling: true,
  luminanceInfluence: 0.6,
} as const;
import { buildContactScene } from './view/scenes.js';

import type { RemoteUnit } from './view/ContactScene.js';

import type { Signal } from './crt/GlobeView.js';
import type {
  NavigationCommand,
  NavigationDirection,
  NavigationMode,
} from './input/FocusNavigator.js';
import type { MenuAction } from './menu/MainMenu.js';
import type { Contact, MissionDefinition, MissionFailure } from './mission/types.js';
import { Urgency } from './mission/types.js';
import type { CameraShot, ContactScene } from './view/ContactScene.js';

/** Stable per-playthrough seed. §123: the same knowledge must draw the same tree. */
const PLAYTHROUGH_SEED = 0x0c151e;

/** Seconds to draw new growth in, pixel by pixel (§176). */
const GROWTH_REVEAL_SECONDS = 1.8;

/** Scratch matrix for camera orientation. Reused to avoid per-frame allocation. */
const CAMERA_MATRIX = new THREE.Matrix4();
/** Scratch for the held-shot drift, so the float allocates nothing per frame. */
const DRIFT_EYE = new THREE.Vector3();
const DRIFT_AT = new THREE.Vector3();
const DRIFT_FORWARD = new THREE.Vector3();
const DRIFT_RIGHT = new THREE.Vector3();
const DRIFT_UP = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

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

/** M4SS's own patch of empty world - see enterM4SS. Well clear of every diorama. */
const M4SS_ORIGIN = new THREE.Vector3(0, 400, 0);
/**
 * The bonus facility is a separate runtime world, well outside every authored diorama.
 *
 * ## Why this is 1200 along Z and not 800 up
 *
 * A rigged GLB character will not render in a world that is offset along Y. Not the visitor
 * the mission tells you to find, not the workers, not the intruder - for as long as this
 * constant read `(0, 800, 0)`, every character in Warehouse 07 was invisible, and the mission
 * asked the player to locate somebody who was never drawn.
 *
 * It presents as an art bug and is not one. The node is perfect every time: visible,
 * parented, correctly placed, correctly sized, with a loaded mesh. What goes wrong is one
 * axis of the draw. Measured inside `onBeforeRender`, where three.js has finished updating
 * every matrix in the graph - the only place these numbers can be trusted, as three separate
 * readings taken during the game tick proved by disagreeing with each other - the mesh draws
 * at `(0, 0, 30.9)` while its own root sits at `(0, 800, 30.9)`. X and Z are inherited from
 * the parent. Y is dropped. The character is drawn 800 metres under the building, and then
 * frustum culling correctly removes it, which is why nothing appeared even with culling
 * forced off: it was being drawn, 396 times, in a field below the floor.
 *
 * The root cause is inside the engine's model load path and is not fixed here. What IS fixed
 * is the thing this project controls: the separation between worlds does not have to be
 * vertical. Moving it to Z keeps the bonus facility just as far from every diorama - the
 * workstation is at z -60 and nothing authored reaches a tenth of this - while leaving Y at
 * zero, where there is nothing left to drop. Verified by moving it and watching the GLB
 * appear at the door, twice: once at the origin and once here.
 *
 * If a character ever goes missing again, check this axis before checking the art. And note
 * M4SS_ORIGIN above still sits 400 up: it has no rigged characters today, and the day it
 * gets one it will have this same bug.
 */
const WAREHOUSE_ORIGIN = new THREE.Vector3(0, 0, 1200);
/** Warehouse-interior haze. See enterWarehouse for why it is darker than the walls. */
/*
 * Haze that LIGHTENS with distance, and starts later.
 *
 * At #262b2f the fog was darker than most of the surfaces in it, so the far end of an aisle
 * fell away into a hole - correct for the night interior this used to be and wrong for a
 * high-key look, where depth is carried by things going pale and low-contrast rather than
 * dark. Near pushed out from 15 so the middle distance is unaffected, far pushed to 105 so
 * the whole 58m building sits inside the ramp instead of ending in a wall of it.
 */
/**
 * The cel pass, on. The CRT stays off - see HIDE_CRT_POST below.
 *
 * Seven are in play. Five are the engine's - tone mapping, bloom, ambient occlusion, object
 * outline and colour grading - and two are this project's, registered as custom effects: the
 * painterly/cel conversion at order 70 and the CRT at 80.
 *
 * This hides only the second pair, and it does it by NOT MOUNTING them rather than by
 * disabling them after the fact. That matters because both are driven from a dozen places -
 * every scene mount calls setPaintLook or setRetroLook - and any of those would switch a
 * disabled pass back on. Both installers are the only route into the pipeline, and both
 * setters no-op when their effect was never registered, so skipping the mount is the one
 * point where this can be enforced once.
 *
 * The engine's five are untouched, so the picture still gets ACES, exposure, bloom and
 * occlusion. Nothing is deleted or retuned either - every look, slider and tuning constant
 * is where it was, and flipping this to `false` restores the game as it stands.
 */
const HIDE_CEL_POST = false;

/**
 * The CRT, separately.
 *
 * Split from the cel switch because the two are different decisions and have been asked
 * about separately every time. This one is the raster - scanlines, grille, convergence, the
 * roll bar - and its three registers (clean dioramas, drone link, fixed camera) are intact
 * and tuned; nothing here throws that work away. Flip to false to bring it back.
 */
const HIDE_CRT_POST = false;

const WAREHOUSE_HAZE = '#5d6b77';
const WAREHOUSE_FOG_NEAR = 32;
const WAREHOUSE_FOG_FAR = 120;

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

/**
 * The workstation's daylight, at full strength.
 *
 * Named because they are no longer only defaults: `ContactScene.daylight` scales both per
 * room, and a scene that wants less sun needs something to be a fraction OF.
 */
const KEY_INTENSITY = 1.139;
const SKY_INTENSITY = 0.352;

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
  /** Modal trace and shift selector presented over the globe. */
  private tracePanel: TracePanel | null = null;
  private warehouseLaunchPanel: WarehouseLaunchPanel | null = null;
  /** Removes the preference listener and container attributes when editor play stops. */
  private disposeAccessibility: (() => void) | null = null;
  /** Removes the live non-dialogue caption rail and its pending authored cues. */
  private disposeSoundCaptions: (() => void) | null = null;
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
   * it, resolve it, hand out the next - and the globe now offers up to two at once, so
   * the player can answer the second one first and the cursor still has to release the next
   * while the earlier request is waiting on it.
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
   * Two. Enough that the map offers a real choice without turning the authored campaign
   * into a mission-select screen or letting late-game requests arrive before their setup.
   *
   * The first request is exempt on purpose. Mirela arrives alone, because the opening
   * teaches what the globe IS, and it cannot do that while offering four alternatives.
   */
  private static readonly OPEN_AT_ONCE = 2;
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
  /** Up until the first keypress. Held so endPlay can take it down. */
  private boot: BootScreen | null = null;
  /** Contact ids in the order their requests were answered. Drives the record strip. */
  private answered: string[] = [];
  /** True while the departure sequence is running - see leaveContact. */
  private leaving = false;
  private screen: Screen = Screen.Tree;
  private menu: MainMenu | null = null;
  private picker: Picker | null = null;
  private navigator: FocusNavigator | null = null;
  private globeScreen: GlobeScreen | null = null;
  /** Seconds until the globe screen takes over from the push-in. */
  private globeHandoff = 0;
  private globe: GlobeView | null = null;
  private signals: Signal[] = createSignals();
  /** Signals that map to a mission still in the queue. */
  private openable = new Set<string>([MIRELA_SIGNAL, WAREHOUSE_SIGNAL]);
  /**
   * The ending, armed and delivered.
   *
   * `endingDelay` counts down from the moment the LAST request resolves, so the growth
   * reveal and the walk home land before the machine speaks - an ending that interrupts
   * the reveal it is celebrating would step on its own moment. -1 is disarmed. The shown
   * flag exists because "all resolved" stays true forever afterwards, and the transmission
   * is a thing that happens once, on the transition, never on a restored save.
   */
  private endingPanel: EndingPanel | null = null;
  private endingDelay = -1;
  private endingShown = false;
  /** The contact most recently opened. Saved so CONTINUE can return to the scene. */
  private lastPlayedContactId: string | null = null;
  /** Seconds until the anomaly arrives on the globe. -1 disarmed. See the ending panel. */
  private anomalyDelay = -1;

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
  /**
   * Its own clock for delayed environment cues, and it is separate from the camera's on
   * purpose.
   *
   * `cameraTweener.clear()` is called whenever the player takes a unit, because a glide from
   * a composed shot into the back of a mower is wrong. A cue waiting to fire is a different
   * kind of thing and must not be collected by that; it should die when the SCENE goes, which
   * is what `mountScene` and `returnHome` clear it on.
   */
  private readonly cueTweener = new Tweener();

  /**
   * M4SS, while it is running.
   *
   * Null the rest of the time - the room is built on entry and thrown away on exit rather
   * than parked, because it takes the camera and the keyboard for as long as it exists and a
   * dormant copy of it holding either would be a very confusing bug in the game around it.
   */
  private m4ss: M4SSRig | null = null;
  private onM4SSKey: ((event: KeyboardEvent) => void) | null = null;
  /** The fog range to put back when M4SS closes - see enterM4SS. */
  private m4ssFog: { near: number; far: number } | null = null;
  /** The desk and the room around it, held for the outline prepass. See buildWorkstation. */
  private workstation: ENGINE.SceneNode | null = null;
  private warehouse: WarehouseRig | null = null;
  private warehouseFog: { near: number; far: number } | null = null;
  private warehouseArchiveDisplay: ENGINE.SceneNode | null = null;
  private warehouseCelEnabled = true;
  private warehouseCelTuning: PaintLook = {
    ...PAINT_LOOKS.warehouseCel,
    inkColor: [...PAINT_LOOKS.warehouseCel.inkColor],
  };
  private warehousePreviousRetroLook: RetroLookName = 'console';
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
    this.refreshWarehouseArchiveDisplay();
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
      /*
       * Sanda is CUT from this build.
       *
       * Hers is the only beat that runs in real time - Tempo.Act, a live request where the
       * answer is when rather than what - and it is the one that is not ready. Left in the
       * queue it would be offered, so it is removed from the queue rather than hidden on the
       * globe: the globe is the only place a request can be opened, and a signal that is
       * queued but undrawable is a mission the player is told about and cannot reach.
       *
       * Nothing else is deleted. mission-07-torch.ts, her contact record, her scene and her
       * signal entry all stay exactly where they are, and putting the line below back is the
       * whole of restoring her.
       *
       * SETTLED 2026-08-26: she stays cut for this release, by decision rather than by
       * schedule. GAME-REVIEW.md item 17 is marked declined and restoring her now sits among
       * the scope traps. Nothing about the code changes - this is a queue entry, not a
       * deletion, and everything it points at stays exactly where it is.
       */
      // { mission: MISSION_07, contact: SANDA },
      /**
       * Eighth, and the only request that is not somebody asking for help.
       *
       * It has to come last for a reason that is about the player rather than about
       * difficulty: seven people have now trusted this machine with a problem, and the
       * eighth arrival is a policeman who has been given a terminal. The unease only works
       * if the player has already spent the whole game being useful.
       */
      { mission: MISSION_08, contact: LUCIAN },
      /**
       * Ninth, and the only request from outside the world the other eight share.
       *
       * It is last for the same reason Lucian is second-to-last: the player has spent the
       * whole game being useful to people who had a fault, and Keller does not have one.
       * Arriving here first would make it a curiosity; arriving here after eight repairs
       * makes it the request that does not fit, which is what it is.
       */
      { mission: MISSION_09, contact: KELLER },
    ];

    /*
     * Hand each signal its blink pace from the mission's authored urgency. Done once -
     * the queue is fixed, so a contact's urgency never changes - and here rather than at
     * offer time so no offer path can forget it.
     */
    for (const { mission } of this.queue) {
      const signal = this.signals.find((s) => s.id === mission.contactId);
      if (!signal) continue;
      signal.pace =
        mission.urgency === Urgency.Critical ? 3 : mission.urgency === Urgency.Timed ? 2 : 1;
    }

    // Here rather than earlier: the queue has to exist to be dealt out, and the pace loop
    // above is the last thing that populates it.
    this.revealEverythingForTesting();

    this.buildScenes();
    this.buildCamera();

    this.menu = new MainMenu(WORKSTATION_ORIGIN);
    this.add(this.menu.root);
    /*
     * The two front-door plates are a pair, and only one of them is ever the right answer.
     *
     * CONTINUE ships cold and warms when there is something on the tape. NEW GAME ships
     * warm and goes cold at the same moment, because from then on it is not an option - it
     * is the only button in the game that can destroy several hours of somebody's evening,
     * sitting directly above the one they actually want, with no confirmation on it.
     *
     * COLD rather than removed, which is a deliberate departure from "hide it". These are
     * physical plates in a rack: taking one out leaves a hole in the stack, and a gap where
     * a control used to be reads as a fault rather than as a decision. The menu already has
     * a word for "this exists and is not available" - it is what CONTINUE has been saying
     * since the first boot - so NEW GAME says it back.
     *
     * Keyed on the save existing rather than on Mirela specifically, and that difference
     * matters in one case: a player who LOST her request has a save with nothing resolved
     * in it. Gating on "first mission complete" would strand them - no CONTINUE, and the
     * only way forward a NEW GAME that throws away the failure and the note they wrote
     * about it. A save is a save.
     */
    this.refreshFrontDoor();
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
  /**
   * Write the composed camera, plus whatever drift the held shot asks for.
   *
   * The drift is added HERE and never accumulated into `cameraPosition`, which stays the
   * authored value. That matters for two reasons: a tween lerping toward a shot would
   * otherwise fight an offset that keeps moving under it, and every framing assertion in
   * scripts/dev/probe-mast.ts is written against the authored numbers. Drift is a thing that
   * happens to the lens, not a change to where the shot is.
   *
   * Two sinusoids at deliberately incommensurate periods, so the float never returns to the
   * same place and never reads as a loop. The eye moves across frame and the target moves a
   * third as far in the opposite sense - the small parallax between them is what sells it as
   * air rather than as a pan.
   */
  /** Metres of float on the shot currently held. 0 locks the frame off. */
  private shotDrift = 0;
  /** Seconds since this shot was taken, which is what the drift is a function of. */
  private shotClock = 0;

  private applyCameraTransform(): void {
    if (!this.camera) return;
    DRIFT_EYE.copy(this.cameraPosition);
    DRIFT_AT.copy(this.cameraTarget);
    if (this.shotDrift > 0 && !getAccessibilityPreferences().reducedMotion) {
      DRIFT_FORWARD.copy(this.cameraTarget).sub(this.cameraPosition);
      if (DRIFT_FORWARD.lengthSq() > 1e-6) {
        DRIFT_FORWARD.normalize();
        DRIFT_RIGHT.crossVectors(DRIFT_FORWARD, WORLD_UP);
        if (DRIFT_RIGHT.lengthSq() < 1e-6) DRIFT_RIGHT.set(1, 0, 0);
        DRIFT_RIGHT.normalize();
        DRIFT_UP.crossVectors(DRIFT_RIGHT, DRIFT_FORWARD).normalize();
        const swayX = Math.sin(this.shotClock * 0.21) * this.shotDrift;
        const swayY = Math.sin(this.shotClock * 0.134 + 1.7) * this.shotDrift * 0.62;
        DRIFT_EYE.addScaledVector(DRIFT_RIGHT, swayX).addScaledVector(DRIFT_UP, swayY);
        DRIFT_AT.addScaledVector(DRIFT_RIGHT, -swayX * 0.33).addScaledVector(DRIFT_UP, -swayY * 0.33);
      }
    }
    this.camera.position.copy(DRIFT_EYE);
    CAMERA_MATRIX.lookAt(DRIFT_EYE, DRIFT_AT, this.camera.up);
    this.camera.quaternion.setFromRotationMatrix(CAMERA_MATRIX);
  }

  /** Frame a shot immediately. */
  private cutTo(shot: CameraShot): void {
    this.cameraPosition.copy(shot.position);
    this.cameraTarget.copy(shot.target);
    this.takeShotDrift(shot);
    this.applyCameraTransform();
  }

  /*
   * The clock restarts on every shot so a cut always begins at zero offset - otherwise the
   * new frame would open mid-sway, which lands as a bump on the cut rather than as air.
   */
  private takeShotDrift(shot: CameraShot): void {
    this.shotDrift = shot.drift ?? 0;
    this.shotClock = 0;
  }

  /** Ease to a shot. */
  private moveTo(shot: CameraShot, duration: number): void {
    const fromPosition = this.cameraPosition.clone();
    const fromTarget = this.cameraTarget.clone();
    this.takeShotDrift(shot);

    this.cameraTweener.add(
      (t) => {
        this.cameraPosition.lerpVectors(fromPosition, shot.position, t);
        this.cameraTarget.lerpVectors(fromTarget, shot.target, t);
        this.applyCameraTransform();
      },
      { duration: accessibleCameraDuration(duration), easing: Ease.inOutCubic, channel: 'camera' }
    );
  }

  /**
   * TESTING: hand out the whole queue at once, so every mission is one click away.
   *
   * The authored globe is a two-signal frontier - `OPEN_AT_ONCE`, and the long note on it
   * explains why. That is correct for a player and slow for anybody who needs to look at
   * mission seven. This deals the entire queue in one go, and it does it through exactly the
   * hand-out the offer loop uses - `setSignalState` to Waiting, which also unhides, plus
   * membership in `openable` - rather than reaching into signal fields directly. Two
   * conditions make a signal answerable, and this codebase's oldest documented bug is
   * setting one of them without the other.
   *
   * ## `isPublishedGame`, and that is the whole point of the method
   *
   * There was already an unconditional block in `synchronizeWarehouseSignals` exposing
   * Warehouse 07 on the opening globe, carrying its own comment asking for its own removal
   * "when the post-game gate is restored". That is how a debug hook ships, and this project
   * has done it twice: POLISH-REVIEW §8 had "strip debug overlay from the build" as item one
   * for three weeks, and the tool written to replace that bad practice quietly became an
   * instance of it.
   *
   * So the gate is the engine's own flag rather than a constant anybody has to remember. A
   * DEV boolean has to be turned off on the day of the freeze, by somebody who has spent
   * that day doing something else. This cannot be forgotten, because nobody has to do
   * anything: the editor gets every mission, a published build gets the authored campaign,
   * and the difference costs one condition.
   *
   * To take it out for good, delete the method and its two call sites. Nothing else refers
   * to it, and the offer loop it borrows from is untouched.
   */
  private revealEverythingForTesting(): void {
    if (ENGINE.isPublishedGame()) return;

    for (const request of this.queue) {
      this.setSignalState(request.mission.contactId, SignalState.Waiting);
      this.openable.add(request.mission.contactId);
    }
    /*
     * And move the cursor past the end.
     *
     * `offered` is how far down the queue requests have been HANDED OUT, and the offer loop
     * resumes from it after every resolve. Leaving it at 1 with the whole globe already open
     * would deal the same contacts a second time on the first resolution - which does not
     * crash, it silently re-opens a request the player has finished.
     */
    this.offered = this.queue.length;
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

    const accessibilityContainer = this.getWorld()?.gameContainer;
    if (accessibilityContainer) {
      this.disposeAccessibility?.();
      this.disposeAccessibility = installAccessibilityPreferences(accessibilityContainer);
      this.disposeSoundCaptions?.();
      this.disposeSoundCaptions = installSoundCaptions(accessibilityContainer);
    }

    this.configureLook();

    /*
     * The way in to every room. See dev/SceneJump - this replaces the practice of editing
     * the game to reach a scene, which has twice shipped a debug hook by accident.
     *
     * And it was about to be the third time. This mounted unconditionally: a hover strip of
     * eight numbered tabs at the left edge of the game container, in every build, one
     * mouse-move away from a judge who happens to bring the pointer to the side of the
     * window. POLISH-REVIEW §8 has "strip debug overlay from the build" as item 1 - ten
     * minutes, free, and fatal if missed - and it was still item 1 three weeks later,
     * because the tool that replaced the bad practice quietly became an instance of it.
     *
     * `isPublishedGame` is the engine's own flag rather than a constant in this file, and
     * that is the entire point. A DEV boolean has to be remembered on the day of the freeze,
     * by somebody who has spent that day doing something else; this cannot be forgotten,
     * because nobody has to do anything. It stays on in the editor, so verification loops
     * are unaffected.
     */
    const jumpContainer = ENGINE.isPublishedGame() ? null : this.getWorld()?.gameContainer;
    if (jumpContainer) this.disposeSceneJump = installSceneJump(this, jumpContainer);
    if (!ENGINE.isPublishedGame()) {
      const openWarehouse = (event: KeyboardEvent): void => {
        if (event.code !== 'F9' || this.warehouse) return;
        event.preventDefault();
        audio.unlock();
        this.boot?.dispose();
        this.boot = null;
        this.enterWarehouse('story');
      };
      window.addEventListener('keydown', openWarehouse);
      this.onWarehouseDevKey = openWarehouse;
      const toggleWarehouseCel = (event: KeyboardEvent): void => {
        if (event.code !== 'F10' || !this.warehouse) return;
        event.preventDefault();
        this.setWarehouseCelPrototypeEnabled(!this.warehouseCelEnabled);
      };
      window.addEventListener('keydown', toggleWarehouseCel);
      this.onWarehouseCelKey = toggleWarehouseCel;
      /*
       * Any click in an editor session starts the audio context.
       *
       * ConsoleAudio.unlock() has to run from a real user gesture, and the only place that
       * normally happens is the main menu's NEW GAME. Every dev route into a scene - F9, the
       * jump strip, a scripted auto-open - skips the menu, so the context is never created,
       * bus() returns null, and every cue in the game silently does nothing.
       *
       * That is not a shipping bug (players come through the menu) and is exactly why it is
       * worth handling: it presents as "the warehouse has no sound", which is indistinguishable
       * from a broken mix and sends you looking in the wrong file. It cost a loopback recording
       * of pure silence to notice. Published builds never register this.
       */
      const unlockOnGesture = (): void => audio.unlock();
      window.addEventListener('pointerdown', unlockOnGesture);
      this.onDevAudioUnlock = unlockOnGesture;

    }

    void this.startSession();

    return true;
  }

  /** Editor-only deterministic route used by the first-five-minute visual gauntlet. */
  public playFirstFiveCapture(): void {
    if (ENGINE.isPublishedGame() || !isCaptureStorage()) return;
    this.onMenuAction('new-game');
    window.setTimeout(() => {
      if (this.openable.has(MIRELA_SIGNAL)) this.openSignal(MIRELA_SIGNAL);
    }, 3200);
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
    // Held so the cel pass can keep this room out of its outline prepass while a mission
    // is mounted - see excludeFromPaintOutline.
    this.workstation = station;

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

  private refreshWarehouseArchiveDisplay(): void {
    this.warehouseArchiveDisplay?.removeFromParent();
    this.warehouseArchiveDisplay = null;
    const archive = loadWarehouseSave();
    if (!archive.storyCompleted) return;
    const display = createWarehouseArchiveDisplay(archive);
    display.position.copy(WORKSTATION_ORIGIN);
    this.add(display);
    this.warehouseArchiveDisplay = display;
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
      /*
       * Kept, because the pixel grid has to know where this face is on the frame.
       *
       * It is the one surface in the game that is already a raster display, and a second
       * unaligned grid over it double-quantises - see the note in retroShader. The mask
       * needs the mesh every frame, and the mesh only exists once the model has loaded and
       * been walked, which is here.
       */
      this.screenMesh = screen;
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
      const bloom: { strength: number; threshold: number; radius: number } = {
        ...TUNED_BLOOM,
      };
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

      /*
       * The quality numbers come from AO_QUALITY rather than being written again here.
       *
       * They were written twice, with the same values, and that is a bug with a delay on
       * it: this panel re-pushes the whole effect config on every slider move, so a fix
       * applied to the real configuration would be silently undone the first time anybody
       * touched the occlusion strength. Only the two values the sliders own live here.
       */
      const ao: { ssaoStrength: number; ssaoRadius: number } = {
        ...TUNED_OCCLUSION,
      };
      const pushAo = (): void =>
        post.configureEffect(ENGINE.PostProcessPass.AO, {
          enabled: true,
          ...AO_QUALITY,
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

      /*
       * Exposure, which is the OTHER brightness and worth keeping separate from the cel one.
       *
       * This drives the tone mapper, so it lifts the whole image including the parts the cel
       * pass never touches, and it is what to reach for when the room is simply too dark.
       * `PaintLook.brightness` below lifts only the shaded image inside the cel pass and
       * leaves ink alone, which is what to reach for when the LOOK is too dark.
       *
       * Read live from the pipeline rather than cached, because the warehouse reconfigures
       * tone mapping on mount - a cached seed would show the menu's exposure while the slider
       * silently drove the warehouse's.
       */
      const exposureOf = (): number => {
        const config = post.getEffectConfig(ENGINE.PostProcessPass.ToneMapping) as
          | { exposure?: number }
          | null
          | undefined;
        return config?.exposure ?? 1;
      };
      tune.group('tone');
      tune.slider({
        label: 'exposure',
        min: 0.2,
        max: 3,
        step: 0.01,
        get: exposureOf,
        set: (v) => post.configureEffect(ENGINE.PostProcessPass.ToneMapping, {
          enabled: true,
          mode: THREE.ACESFilmicToneMapping,
          exposure: v,
        }),
      });
    }

    tune.group('global cel // material');
    tune.slider({
      label: 'bands',
      min: 2,
      max: 6,
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

    const applyCelTuning = (): void => {
      if (!this.warehouse || this.warehouseCelEnabled) {
        setPaintValues(this.warehouseCelTuning, true);
      }
    };
    const celSlider = (
      label: string,
      key: Exclude<keyof PaintLook, 'inkColor'>,
      min: number,
      max: number,
      step?: number
    ): void => {
      tune.slider({
        label,
        min,
        max,
        step,
        get: () => this.warehouseCelTuning[key],
        set: (value) => {
          this.warehouseCelTuning[key] = value;
          applyCelTuning();
        },
      });
    };

    tune.group('global cel // post');
    celSlider('filter px', 'radius', 0, 3, 0.05);
    celSlider('filter mix', 'strength', 0, 1, 0.01);
    celSlider('luma ink', 'ink', 0, 1, 0.01);
    celSlider('warm/cool', 'tint', 0, 1, 0.01);
    celSlider('surface', 'tooth', 0, 0.25, 0.005);
    celSlider('outline px', 'outlineWidth', 0.25, 6, 0.05);
    celSlider('depth edge', 'depthInk', 0, 2, 0.02);
    celSlider('normal edge', 'normalInk', 0, 2, 0.02);
    celSlider('outline mix', 'outlineStrength', 0, 1, 0.01);
    celSlider('ink near m', 'outlineFadeStart', 2, 60, 1);
    celSlider('ink far m', 'outlineFadeEnd', 4, 120, 1);
    celSlider('outline res', 'normalScale', 0.25, 1, 0.01);
    celSlider('signal keep', 'protectSignals', 0, 1, 0.01);
    celSlider('brightness', 'brightness', 0.3, 2.5, 0.01);
    celSlider('value steps', 'posterize', 0, 8, 1);
    celSlider('step edge', 'posterizeSoft', 0, 0.6, 0.01);
    celSlider('shadow gate', 'posterizeGate', 0, 0.08, 0.001);
    celSlider('saturation', 'saturation', 0.4, 2.2, 0.01);
    tune.color({
      label: 'ink colour',
      get: () => {
        const [r, g, b] = this.warehouseCelTuning.inkColor;
        return `#${new THREE.Color(r, g, b).getHexString()}`;
      },
      set: (value) => {
        const colour = new THREE.Color(value);
        this.warehouseCelTuning.inkColor = [colour.r, colour.g, colour.b];
        applyCelTuning();
      },
    });
    tune.button('A // CEL', () => this.setWarehouseCelPrototypeEnabled(true, true));
    tune.button('B // ORIGINAL', () => this.setWarehouseCelPrototypeEnabled(false, true));
    tune.button('RESET CEL', () => {
      this.warehouseCelTuning = {
        ...PAINT_LOOKS.warehouseCel,
        inkColor: [...PAINT_LOOKS.warehouseCel.inkColor],
      };
      PAINT_UNIFORMS.uPaintBands.value = 3;
      PAINT_UNIFORMS.uPaintSoft.value = 0.32;
      if (!this.warehouse || this.warehouseCelEnabled) this.applyCelPost(true);
      tune.refresh();
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
      intensity: KEY_INTENSITY,
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
        intensity: SKY_INTENSITY,
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
        intensity: 4.38,
        color: new THREE.Color('#ffcf96'),
        distance: 2.4,
        decay: 1.7,
      });
    /*
     * ## Shadows go on the SPOTS, not on the key
     *
     * The key above cannot cast: this rig spans sixty units, workstation at one end and
     * dioramas at the other, and one orthographic shadow map cannot cover both - whichever
     * set falls outside its bounds renders fully shadowed. That reasoning is still correct
     * and the key stays off.
     *
     * It does not apply to a spot light. A spot's shadow camera is a perspective frustum
     * bounded by its own cone and range, so this one covers the half-metre of desk it lights
     * and nothing else - no span problem to have. And the desk is exactly where a shadow
     * earns its cost: the home shot is a close-up of clutter under a shade, and contact
     * shadows are most of what makes small objects sit ON a surface rather than float above
     * it.
     *
     * Small map, because the cone is small. 1024 across half a metre is finer than 2048
     * across the warehouse.
     */
    castShadows(lamp as unknown as THREE.Object3D, { mapSize: 1024, radius: 3, normalBias: 0.02, bias: -0.0004 });
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
      // Back to 11.6 at the panel: with the tone mapper at 0.62 the sill has the headroom
      // it did not have at 3.2, and the window is the workstation's only exterior light.
      intensity: 11.6,
      color: new THREE.Color(LIGHT.key),
      // Wide and very soft. A hard-edged pool on the floor would read as a stage light;
      // the penumbra is doing the work of a window's diffuse spill.
      angle: 0.828,
      penumbra: 1,
      distance: 8,
      decay: 1.25,
    });
    /*
     * The window casts too, softly. Same argument as the lamp - a spot is self-bounding -
     * and this is the light that puts the frame's shape across the desk. A window that
     * throws no bar of shadow is a bright patch, not a window.
     */
    castShadows(windowKey as unknown as THREE.Object3D, { mapSize: 1024, radius: 4.5, normalBias: 0.03, bias: -0.0005 });
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
        intensity: 1.575,
        color: new THREE.Color(LIGHT.bounce),
        distance: 4.2,
        decay: 1.4,
      });
    this.add(bounce);

    const glow = ENGINE.PointLightNode.create({
        name: 'ScreenGlow',
        position: WORKSTATION_ORIGIN.clone().add(new THREE.Vector3(0, 0.42, 0.34)),
        intensity: 1.8,
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
       * The final low-energy values now come from the user's warehouse cel-shading pass;
       * TUNED_BLOOM is shared with the live panel so a restart reproduces that frame.
       */
      ...TUNED_BLOOM,
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
      // 1.98 / 0.153, settled with the F8 panel against the cel-shaded build. 1.1 / 0.05 - the
      // first guess from the engine defaults - was invisible in a capture; 4.0 / 0.27
      // grounds everything and starts reading as grime in the wall corners.
      ...TUNED_OCCLUSION,
      ...AO_QUALITY,
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
      // z tracks STACK_ORIGIN (see MainMenu): the plates moved back twelve centimetres to
      // get out of the cable's way, and the title has to travel with them or the column
      // stops reading as one object.
      /*
       * The offset lives in the GEOMETRY, not on the node.
       *
       * Worth knowing, and it cost a build to learn: it means this node's own world
       * position is the station's origin down by the desk, so anything that asks the
       * wordmark where it is gets an honest answer to a different question. A hover readout
       * anchored to it was projected into the dark before the idea was replaced by one that
       * did not need a position at all - see crt/menuLabel.
       */
      plate.translate(-0.895, 1.55, -0.49 + DESK_SHIFT);

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
        adaptiveScore.accentKnowledge(this.scene?.sceneId ?? '');
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
        adaptiveScore.setState('resolution');
        const acknowledgementDelay = audio.playContactPayoff(this.scene?.sceneId ?? '') ?? 0;
        window.setTimeout(() => audio.play('solved'), acknowledgementDelay);
        /*
         * And the machine's own three notes, under the verdict.
         *
         * Delayed so it starts as the `solved` fifth is dying rather than on top of it -
         * two musical cues on the same frame is a chord neither of them meant. This is one
         * of exactly three places the motif is allowed to play; see the cue table.
         */
        window.setTimeout(() => audio.play('motif'), acknowledgementDelay + 420);
        this.holdThenReturnHome(acknowledgementDelay);
      },
      onFailed: (failure) => {
        adaptiveScore.setState('contact');
        audio.play('failed');
        this.onRequestLost(failure);
      },
      onNoteRecorded: () => this.closeLostRequest(),
      onLeave: () => this.leaveContact(),
    });

    /*
     * The F8 tuning panel, on the same gate and for the same reason as SceneJump above.
     *
     * Less exposed - it needs a keypress rather than a mouse-move - but a jam judge pressing
     * function keys is not a strange thing to imagine, and a live slider panel over a game
     * says prototype louder than anything else on screen.
     */
    if (!ENGINE.isPublishedGame()) {
      this.tune = new TunePanel(container);
      this.registerTuning();
    }

    this.globeScreen = new GlobeScreen(
      container,
      (signalId) => this.openSignal(signalId),
      () => this.returnToMenu(),
      (signalId) => this.reopenAfterCooldown(signalId)
    );

    this.attachPicker(world, container);
    this.navigator = new FocusNavigator(container, {
      mode: () => this.navigationMode(),
      command: (command) => this.handleNavigation(command),
    });
    world.inputManager?.addInputHandler(this.navigator);

    // Held so it can be taken off again in endPlay, rather than outliving the rig.
    this.onOverviewKey = (event: KeyboardEvent): void => {
      if (event.key !== 'F2') return;
      event.preventDefault();
      this.toggleOverview();
    };
    window.addEventListener('keydown', this.onOverviewKey);

    /*
     * Open INSIDE the CRT, not on the room.
     *
     * The boot screen is the tube's own face, so the camera starts where the tube fills the
     * frame and pulls back on the first keypress - which is the whole reveal. SCREEN_SHOT
     * already exists and is already this exact framing; it is what the globe pushes into,
     * run backwards.
     */
    this.setPhase(Phase.Menu);
    this.screen = Screen.Tree;
    this.cutTo(SCREEN_SHOT);

    const bootContainer = world.gameContainer;
    if (bootContainer) {
      // Nothing under the boot screen is interactive, and nothing under it should be
      // visible either - see the note on its background.
      this.menu?.setEnabled(false);
      this.boot = showBoot(bootContainer, () => {
        this.boot = null;
        /*
         * Everything that needs a user gesture happens here, on the same press.
         *
         * A browser will not let an AudioContext make a sound before one, so this press is
         * literally what gives the machine its voice. Room tone first so the hum is already
         * under the motif rather than arriving after it.
         */
        audio.unlock();
        setRoomTone('home');
        adaptiveScore.setState('home');
        audio.play('motif');
        // 2.6s rather than SCREEN_SHOT's own 1.6 - this is the reveal, and it is the only
        // time this move is the point rather than a way of getting somewhere.
        this.moveTo(HOME_SHOT, 2.6);
        this.cameraTweener.add(() => undefined, {
          duration: 0.01,
          delay: 2.2,
          channel: 'boot-input',
          onComplete: () => {
            if (this.phase !== Phase.Menu) return;
            this.menu?.setEnabled(true);
            setCursorVisible(true);
          },
        });
      });
    } else {
      // No container to hang it on: skip the ceremony rather than start inside the tube
      // with no way out of it.
      this.cutTo(HOME_SHOT);
      this.menu?.setEnabled(true);
      setCursorVisible(true);
    }
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

  /** Which interaction language owns directions and confirm on this frame. */
  private navigationMode(): NavigationMode {
    if (this.boot) return 'boot';
    if (this.systemPanel?.isOpen) return 'system';
    if (this.endingPanel) return 'ending';
    if (
      this.m4ss ||
      this.warehouse ||
      this.tracePanel ||
      this.warehouseLaunchPanel ||
      this.driving ||
      this.leaving
    ) {
      return 'disabled';
    }
    if (this.phase === Phase.Menu) return this.menu?.canNavigate ? 'menu' : 'disabled';
    if (this.phase === Phase.Choosing) {
      return this.globeScreen?.canNavigate ? 'globe' : 'disabled';
    }
    if (this.phase === Phase.Contact && this.phone?.connected) return 'dom';
    return 'disabled';
  }

  /** Screen-specific meaning; DOM spatial movement is handled inside FocusNavigator. */
  private handleNavigation(command: NavigationCommand): boolean {
    const mode = this.navigationMode();
    if (mode === 'boot') {
      if (command !== 'activate') return false;
      this.boot?.begin();
      return true;
    }
    if (mode === 'system') return this.systemPanel?.handleNavigation(command) ?? false;
    if (mode === 'ending') return this.endingPanel?.handleNavigation(command) ?? false;

    if (mode === 'menu') {
      if (command === 'activate') return this.menu?.activateFocused() ?? false;
      if (this.isDirection(command)) {
        const direction = command === 'up' || command === 'left' ? -1 : 1;
        return this.menu?.focusNext(direction) ?? false;
      }
      return false;
    }

    if (mode === 'globe') {
      if (command === 'back') {
        this.returnToMenu();
        return true;
      }
      if (command === 'activate') return this.globeScreen?.activateFocused() ?? false;
      if (this.isDirection(command)) {
        const direction = command === 'up' || command === 'left' ? -1 : 1;
        return this.globeScreen?.focusNext(direction) ?? false;
      }
    }
    return false;
  }

  private isDirection(command: NavigationCommand): command is NavigationDirection {
    return command === 'up' || command === 'down' || command === 'left' || command === 'right';
  }

  private attachPicker(world: ENGINE.World, container: HTMLElement): void {
    this.picker = new Picker(() => this.camera?.getCamera() ?? null, container);
    world.inputManager?.addInputHandler(this.picker);

    this.menu?.attach(this.picker);
    this.menu?.onAction((action) => this.onMenuAction(action));

    /*
     * Hovering a plate makes the machine say what it is, on its own screen.
     *
     * Only the name is recorded here; the drawing happens in the CRT's own redraw, because
     * the tree clears that canvas every frame and anything painted outside that order is
     * erased before it is seen.
     */
    this.menu?.onHoverChange((spec) => {
      this.menuLabel = spec ? spec.title : null;
    });
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
      this.systemPanel ??= new SystemPanel(container, () => this.menu?.releaseFocus());
      this.systemPanel.open(action);
      return;
    }

    if (action === 'night-shift') {
      audio.unlock();
      this.openWarehouseLaunch();
      return;
    }

    if (action !== 'new-game' && action !== 'continue') return;

    /*
     * The cartridge wipes the tape. Choosing NEW GAME with a save present is a decision,
     * and the machine should honour it rather than quietly resuming - a fresh start that
     * is not fresh is the save system at its most confusing. The specimen resets too:
     * OMNISCIENT_ and M4SS are one fiction, and a new operator gets a new containment file.
     */
    let resume: string | null = null;
    if (action === 'new-game') {
      clearSave();
      clearM4ssStage();
      this.refreshWarehouseArchiveDisplay();
    } else {
      resume = this.restoreSave();
    }

    /**
     * The first gesture the game gets, and therefore the only place audio can start.
     *
     * Browsers refuse to start an AudioContext outside a user gesture, and one created at
     * load sits `suspended` forever while every cue silently does nothing - a failure mode
     * with no symptom except silence, which is indistinguishable from having no audio at
     * all. Hanging it off the front-door actions means it cannot be missed.
     */
    audio.unlock();

    this.menu?.setEnabled(false);
    this.showGlobe();

    /*
     * CONTINUE, continued: if the tape knows which request the player was inside when
     * they left, take them back to it - the contact's view, the room, the objective, the
     * conversation reopened from the top (with the lost-attempt line if there was one).
     * The globe stays underneath, exactly as if they had clicked the signal themselves,
     * which is also what makes this safe: it IS that click, replayed.
     */
    if (resume && this.openable.has(resume)) {
      this.openSignal(resume);
    }
  }

  /**
   * Write the whole game state that matters. Called when a request resolves or is lost -
   * the two moments the world durably changes. Mid-mission progress is deliberately not
   * saved (see persistence.ts): a refresh mid-request costs the attempt, never the game.
   */
  /**
   * The save receipt: a low-right line during the mission-complete transition. DOM rather
   * than CRT because it must be legible over whatever the camera is doing, and gone in
   * three seconds. Same typographic voice as the console chrome.
   */
  /**
   * Say that the save happened, and say what is IN it.
   *
   * Reported as "I don't think the game is saving". It was - persist() runs on every
   * resolve and the save round-trips; a session earlier the same day loaded back at one
   * answered. What failed was the telling: twelve pixels at 0.85 opacity in the extreme
   * bottom corner, during the ride home, which is exactly when the camera is moving and the
   * eye is following it. A save note nobody sees is a save nobody believes in.
   *
   * Three changes, and the third is the one that answers the actual question.
   *
   * It is BIGGER and it is bracketed like the rest of the console's chrome, so it reads as
   * the machine reporting rather than as a caption. It sits above the desk rather than in
   * the corner of the window, which is where the shot is taking the eye anyway.
   *
   * It TICKS. `seat` is the cue this console already uses for a thing accepted by a
   * mechanism - a pin set, a pipe seated - and a tape taking a write is the same event. A
   * player looking the wrong way still hears it.
   *
   * And it COUNTS. "TAPE WRITTEN - 3 ANSWERED" is the difference between an animation that
   * claims something happened and a receipt for the thing that happened. Somebody who
   * doubts the save can read what is on it, which is the only reassurance that survives
   * scepticism.
   */
  private flashSaveNote(written: boolean): void {
    const container = this.getWorld()?.gameContainer;
    if (!container) return;

    const answered = this.signals.filter((s) => s.state === SignalState.Resolved).length;
    const note = document.createElement('div');
    note.style.cssText = [
      'position:absolute',
      /*
       * 27%, not 50%, and the reasoning above survives the change intact.
       *
       * "It sits above the desk rather than in the corner of the window, which is where the
       * shot is taking the eye anyway" is right, and it is right for a reason that makes
       * centring wrong: the eye is at the middle of that shot BECAUSE THE TUBE IS THERE. So a
       * centred note lands on the CRT and covers the knowledge tree - which has just grown by
       * one branch, which is the reward the whole mission was for. The receipt was printed
       * over the thing it is a receipt for.
       *
       * 27% puts it in the desk lamp's pool, which is lit, empty, on the same surface, and on
       * the way the eye is already travelling. Off the tube by about five per cent of the
       * frame at the settled shot.
       */
      'left:27%',
      'bottom:12%',
      'transform:translateX(-50%)',
      'z-index:30',
      'padding:10px 22px',
      'border:1px solid rgba(127,224,138,0.30)',
      'background:rgba(6,14,9,0.72)',
      'color:#7fe08a',
      'font:15px "Courier New",monospace',
      'letter-spacing:0.24em',
      'opacity:0',
      'transition:opacity 0.5s ease',
      'pointer-events:none',
    ].join(';');
    note.textContent = 'WRITING TO TAPE';
    container.appendChild(note);

    // A tape does not write instantly and should not claim to. Three dots, then the receipt.
    let dots = 0;
    const ticking = window.setInterval(() => {
      dots = (dots + 1) % 4;
      note.textContent = `WRITING TO TAPE${'.'.repeat(dots)}`;
    }, 260);

    requestAnimationFrame(() => (note.style.opacity = '1'));
    window.setTimeout(() => {
      window.clearInterval(ticking);
      /*
       * The truth, whichever it is.
       *
       * A failed write is rare - it means storage is full, blocked, or absent - and it is
       * precisely the case where the player most needs to be told, because the alternative
       * is them finding out by losing four hours. `reject` rather than `seat`: this console
       * already has a sound for a mechanism refusing a piece.
       */
      audio.play(written ? 'seat' : 'reject');
      note.textContent = written
        ? answered === 1
          ? 'TAPE WRITTEN - 1 ANSWERED'
          : `TAPE WRITTEN - ${String(answered)} ANSWERED`
        : 'TAPE WILL NOT WRITE - PROGRESS NOT SAVED';
      note.style.color = written ? '#d8ffb0' : '#c2483a';
    }, 1500);
    // Held a good while afterwards. This is the one moment in the game where the player is
    // being asked to trust something they cannot see, so it stays until they have read it.
    window.setTimeout(() => (note.style.opacity = '0'), 4200);
    window.setTimeout(() => note.remove(), 4900);
  }

  private persist(): boolean {
    /*
     * "Last played" only counts while it is unfinished. A resolved request writes null -
     * a finished story has no "where was I", and CONTINUE should land on the globe.
     */
    const last =
      this.lastPlayedContactId &&
      this.signals.find((s) => s.id === this.lastPlayedContactId)?.state !== SignalState.Resolved
        ? this.lastPlayedContactId
        : null;
    return saveGame({
      ...this.knowledge.serialize(),
      signals: this.signals.map((s) => ({ id: s.id, state: s.state, hidden: s.hidden ?? false })),
      offered: this.offered,
      openable: [...this.openable],
      m4ssStage: loadM4ssStage(),
      lastPlayedContactId: last,
      answered: [...this.answered],
    });
  }

  /**
   * Rebuild the world from the tape. Runs before showGlobe, on the CONTINUE action.
   * Returns the contact to reopen, if the save was taken mid-story.
   */
  private restoreSave(): string | null {
    const save = loadGame();
    if (!save) return null;

    this.knowledge.restore(save);

    for (const signal of this.signals) {
      const saved = save.signals.find((r) => r.id === signal.id);
      if (!saved) continue;
      /*
       * Cooldown and Active both coerce to Waiting. Cooldown because deadlines are not
       * serialised (persistence.ts says why); Active because a save is written the moment a
       * request is OPENED - openSignal marks it Active, records it as the last played
       * contact and persists, so CONTINUE knows where the player was. An Active state in a
       * save file is therefore routine rather than corruption, and it means "the player was
       * inside this when they left". Either way the reading is the same and is the generous
       * one: still waiting to be answered, and answerable.
       *
       * The comment here used to say persist() only ever runs with no request open. It has
       * not been true since CONTINUE learned to reopen a contact, and a stale claim about
       * when a state is IMPOSSIBLE is the kind that stops the next person checking.
       */
      const state =
        saved.state === SignalState.Cooldown || saved.state === SignalState.Active
          ? SignalState.Waiting
          : saved.state;
      signal.state = state;
      signal.hidden = saved.hidden;
      signal.cooldown = undefined;
    }

    this.offered = save.offered;
    this.openable = new Set(save.openable);
    /*
     * Rebuilt from the save where it has one, and DERIVED where it does not.
     *
     * A save written before this field existed still knows which signals are resolved; it
     * just does not know what order they happened in. Falling back to the queue's authored
     * order is not the truth, but it is the same set in a defensible sequence, and an empty
     * shelf for somebody six missions in would be a worse lie than an approximate one.
     */
    this.answered =
      save.answered ??
      this.queue
        .map((request) => request.mission.contactId)
        .filter((id) => this.signals.find((s) => s.id === id)?.state === SignalState.Resolved);
    /*
     * Every coercion to Waiting must also restore answerability. Answerable is two
     * conditions - state AND membership in `openable` - and the save was written at a
     * moment when Active and Cooldown signals were legitimately NOT openable. Coerce the
     * state without the set and the restored globe shows a green point that cannot be
     * clicked, which is this codebase's oldest documented bug wearing a new entrance.
     */
    for (const signal of this.signals) {
      const saved = save.signals.find((rec) => rec.id === signal.id);
      if (!saved) continue;
      const coerced = saved.state === SignalState.Cooldown || saved.state === SignalState.Active;
      if (coerced && signal.state === SignalState.Waiting) this.openable.add(signal.id);
    }

    this.synchronizeWarehouseSignals();

    // After the save, not before: `applySave` replaces `openable` wholesale, so a reveal
    // applied at construction is gone the moment somebody presses CONTINUE.
    this.revealEverythingForTesting();

    // The menu screen is the tree, and it is already on. Redraw it as the restored
    // knowledge, the same derive-from-state path a fresh boot takes.
    this.tree?.setState(this.knowledge.toTreeState());
    this.tree?.draw(1, this.pulse);

    this.lastPlayedContactId = save.lastPlayedContactId ?? null;
    return this.lastPlayedContactId;
  }

  /** Rebuild the post-game trace/warehouse door from its separately versioned archive. */
  private synchronizeWarehouseSignals(): void {
    const archive = loadWarehouseSave();
    const anomaly = this.signals.find((signal) => signal.id === ANOMALY_SIGNAL);
    const warehouse = this.signals.find((signal) => signal.id === WAREHOUSE_SIGNAL);
    /*
     * Playtest access to Warehouse 07, on the same flag as everything else in
     * `revealEverythingForTesting` and for the same reason.
     *
     * This block used to run unconditionally, with a comment asking whoever came next to
     * remember to remove it. It exposed the post-game bonus mission on the opening globe of
     * a shipped build, against the first acceptance requirement in
     * WAREHOUSE_07_IMPLEMENTATION_PLAN.md - "Warehouse 07 stays inaccessible before campaign
     * completion" - and it would have gone out that way, because a comment is not a
     * mechanism.
     *
     * The trace-resolved branch below is untouched and remains the canonical release path:
     * in a published build the warehouse appears when the player traces the red signal, and
     * not before.
     */
    if (warehouse && !ENGINE.isPublishedGame()) {
      warehouse.hidden = false;
      warehouse.state = SignalState.Waiting;
      warehouse.actionLabel = archive.storyCompleted ? 'Select shift' : 'Enter';
      this.openable.add(WAREHOUSE_SIGNAL);
    }
    if (archive.traceResolved) {
      if (anomaly) {
        anomaly.hidden = true;
        anomaly.state = SignalState.Resolved;
      }
      this.openable.delete(ANOMALY_SIGNAL);
      return;
    }
    if (anomaly && !anomaly.hidden) this.openable.add(ANOMALY_SIGNAL);
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

    /*
     * The link drops over six tenths of a second rather than in one frame.
     *
     * Arriving somewhere has a push-in, a nod and a staggered assembly; leaving had none of
     * it, and an asymmetric transition is worse than two matching cuts. The player has been
     * taught this connection means something, and then it ended like closing a tab.
     *
     * The order is the point. The squelch goes and the carrier falls at once, because that
     * is the link and the link is what just went. The chrome follows over 220ms, card by
     * card, in the same order it arrived. The ROOM is untouched and the camera drifts a
     * little further out - so the last thing on screen for a beat is the person, alone, in
     * a picture the console has stopped annotating.
     *
     * Guarded, because END CALL is a button and a button can be pressed twice.
     */
    if (this.leaving) return;
    this.leaving = true;
    setCursorVisible(false);

    audio.play('disconnect');
    audio.setOnAir(false);
    this.phone?.setLeaving(true);
    this.post?.clearOutlineSelection();

    const drift = this.cameraPosition.clone().lerp(this.cameraTarget, -0.06);
    this.moveTo({ position: drift, target: this.cameraTarget.clone() }, 0.62);

    this.cameraTweener.add(() => undefined, {
      duration: 0.01,
      delay: 0.62,
      channel: 'leave-contact',
      onComplete: () => {
        this.leaving = false;
        const contactId =
          this.activeIndex === null ? undefined : this.queue[this.activeIndex]?.mission.contactId;
        if (contactId) {
          this.setSignalState(contactId, SignalState.Waiting);
          this.openable.add(contactId);
        }
        this.activeIndex = null;

        this.phone?.setLeaving(false);
        this.releaseUnit(false);
        this.session?.end();
        this.cueTweener.clear();
        this.scene?.deactivate();
        this.scene = null;
        this.showGlobe();
      },
    });
  }

  /** Back to the machine from the globe. */
  /**
   * Warm the plate that is the right answer, and cool the one that is not.
   *
   * Called every time the player is put back in front of the menu rather than once at
   * construction, which is the bug this fixes. It ran at build time only, so on a fresh
   * install it decided CONTINUE was cold and NEW GAME was warm - and then a player finished
   * Mirela's request in that same session, wrote a save, came back to the machine, and found
   * exactly the state that was decided before the save existed. CONTINUE dead, NEW GAME
   * live, and the only working button the one that throws the evening away.
   *
   * A menu that reads state has to read it when the state can have changed, and the moment
   * it can have changed is the moment the player walks back up to it.
   */
  private refreshFrontDoor(): void {
    if (!this.menu) return;
    const saved = hasSave();
    this.menu.setModuleEnabled('continue', saved);
    this.menu.setModuleEnabled('new-game', !saved);
    this.menu.setModuleEnabled('night-shift', loadWarehouseSave().storyCompleted);
  }

  private returnToMenu(): void {
    this.globeScreen?.detach();
    this.phone?.setVisible(false);
    this.globeHandoff = 0;
    this.setPhase(Phase.Menu);
    setCursorVisible(false);
    this.screen = Screen.Tree;
    adaptiveScore.setState('home');
    this.menu?.setEnabled(true);
    this.refreshFrontDoor();
    this.moveTo(HOME_SHOT, 1.4);
    this.cameraTweener.add(() => undefined, {
      duration: 0.01,
      delay: 1.2,
      channel: 'menu-input',
      onComplete: () => {
        if (this.phase === Phase.Menu) setCursorVisible(true);
      },
    });
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
    // Whatever brought us here, the departure is over. A latch that only clears on its own
    // happy path is a latch that eventually sticks - and a stuck one makes END CALL dead.
    this.leaving = false;

    /*
     * Nobody is inside a contact. This IS the globe, so say so about every signal.
     *
     * Opening a request marks it Active and takes it out of `openable`, and the leave
     * sequence puts both back - from inside a tweener callback 0.62s after the player asked
     * to go. Any route to the globe that does not run that callback leaves a signal Active
     * and unanswerable, and the tooltip then says "nobody is asking here yet" about a
     * conversation the player is halfway through. There is no way back in: the pin is the
     * only door and it has been quietly locked.
     *
     * restoreSave already carries this exact reconciliation, and its comment calls it "this
     * codebase's oldest documented bug wearing a new entrance" - a green point that cannot
     * be clicked. It was written for the load path and the same hole was open at runtime.
     *
     * Stated as an invariant rather than as a fix for whichever route caused it: while the
     * globe is up, Active is not a state any signal can be in. That holds however the player
     * got here, including from routes nobody has written yet.
     */
    for (const signal of this.signals) {
      if (signal.state !== SignalState.Active) continue;
      this.setSignalState(signal.id, SignalState.Waiting);
      this.openable.add(signal.id);
    }
    const warpContainer = this.getWorld()?.gameContainer;
    if (warpContainer) playWarp(warpContainer);
    setRetroLook('console');
    // Home. The desk lamp's hum, the CRT's line whistle and the sea through the window -
    // the only room the player hears for minutes at a time.
    setRoomTone('home');

    const anomaly = this.signals.find((signal) => signal.id === ANOMALY_SIGNAL);
    if (this.endingShown && anomaly?.hidden) adaptiveScore.setState('silent');
    else if (anomaly && !anomaly.hidden) adaptiveScore.setState('anomaly');
    else adaptiveScore.setState('globe', this.answered.length);

    this.setPhase(Phase.Choosing);
    setCursorVisible(false);
    this.globeScreen?.setInputEnabled(true);
    this.screen = Screen.Globe;
    this.phone?.setVisible(false);

    // Matched to returnHome's 2.0s. The handover still lands just before the move ends, so
    // the globe is under the camera by the time it settles rather than arriving after it.
    this.moveTo(SCREEN_SHOT, 2.0);
    this.globeHandoff = 1.9;
    this.cameraTweener.add(() => undefined, {
      duration: 0.01,
      delay: 1.75,
      channel: 'globe-input',
      onComplete: () => {
        if (this.phase === Phase.Choosing) setCursorVisible(true);
      },
    });
  }

  /**
   * Hand out requests until the globe is holding its quota.
   *
   * Counts what is actually ANSWERABLE rather than what has been handed out: a contact
   * on a countdown after a failure is on the globe but cannot be taken, and so does not
   * fill a slot. Resolved ones do not either. So a player who fails one still has another
   * live request instead of being trapped on a cooldown.
   *
   * Order is preserved. The queue is authored - Mirela teaches looking, Ileana breaks
   * the habit of looking for a fault, Tomas pays off Mirela's shared feed - and this
   * releases along it rather than choosing. Two adjacent doors stay open: enough agency to
   * avoid a corridor, not enough to erase the campaign's escalation.
   */
  private topUpGlobe(): void {
    const answerable = (): number =>
      this.signals.filter(
        (signal) =>
          !signal.hidden && signal.state === SignalState.Waiting && this.openable.has(signal.id)
      ).length;

    /*
     * Mirela still arrives alone; this method is first called after her resolution. From
     * then on it maintains a two-signal frontier through the authored queue. The globe feels
     * alive and the player can defer a contact, while setup/payoff pairs remain in order and
     * the finale cannot appear beside mission two.
     */
    /*
     * The station is handed out by the loop below like every other request now - it has a
     * mission, a contact and an outcome, so the special case that used to sit here is gone.
     */
    const quota = OmniscientRig.OPEN_AT_ONCE;
    while (answerable() < quota && this.offered < this.queue.length) {
      const request = this.queue[this.offered];
      this.offered += 1;
      this.setSignalState(request.mission.contactId, SignalState.Waiting);
      this.openable.add(request.mission.contactId);
    }
  }

  private openSignal(signalId: string): void {
    if (signalId === ANOMALY_SIGNAL) {
      this.openWarehouseTrace();
      return;
    }
    if (signalId === WAREHOUSE_SIGNAL) {
      const archive = loadWarehouseSave();
      if (archive.storyCompleted) this.openWarehouseLaunch();
      else this.enterWarehouse('story');
      return;
    }

    /*
     * The station used to be intercepted here and dropped the player straight into M4SS.
     * It is a proper request now - Keller, a scene, and a conversation that ends at an icon
     * - so it goes through the queue like everybody else, and the game is launched from a
     * beat cue rather than from the globe. See MISSION_09.
     */
    const index = this.queue.findIndex((request) => request.mission.contactId === signalId);
    if (index < 0 || !this.session) return;

    // Squelch breaks and the carrier comes up. This is the moment a screen change becomes
    // a connection to somewhere.
    audio.play('connect');
    audio.setOnAir(true);
    adaptiveScore.setState('contact');
    setCursorVisible(false);

    this.setSignalState(signalId, SignalState.Active);
    this.openable.delete(signalId);
    this.activeIndex = index;
    /*
     * Remember where the player is, on disk, from the moment they walk in. Written now
     * rather than at resolve/loss so a tab closed mid-first-attempt still knows where the
     * player was - the attempt is gone (mid-mission state is never saved), but the PLACE
     * is not, and CONTINUE reopens this contact fresh.
     */
    this.lastPlayedContactId = signalId;
    this.persist();

    this.setPhase(Phase.Contact);
    // Every room opens on its own establishing shot, whatever the last one was left on.
    this.overhead = false;
    this.screen = Screen.Tree;
    this.globeScreen?.detach();
    this.phone?.beginConnection();
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
    this.cameraTweener.add(() => undefined, {
      duration: 0.01,
      delay: 0.94,
      channel: 'contact-input',
      onComplete: () => {
        if (this.phase === Phase.Contact) setCursorVisible(true);
      },
    });
  }

  /** Turn the finale's impossible carrier into a terrestrial place through evidence. */
  private openWarehouseTrace(): void {
    if (this.tracePanel || loadWarehouseSave().traceResolved) return;
    const container = this.getWorld()?.gameContainer;
    if (!container) return;
    this.globeScreen?.setInputEnabled(false);
    setCursorVisible(true);
    const close = (): void => {
      this.tracePanel = null;
      if (this.phase === Phase.Choosing) this.globeScreen?.setInputEnabled(true);
    };
    this.tracePanel = new TracePanel(
      container,
      () => {
        updateWarehouseSave((save) => {
          save.traceResolved = true;
          save.storyUnlocked = true;
        });
        this.synchronizeWarehouseSignals();
        this.persist();
        audio.play('connect');
        this.globeScreen?.focusSignal(WAREHOUSE_SIGNAL);
        close();
      },
      close
    );
    this.tracePanel.open();
  }

  /** Offer deterministic post-story variants without hiding them behind a key chord. */
  private openWarehouseLaunch(): void {
    if (this.warehouseLaunchPanel || this.warehouse) return;
    const container = this.getWorld()?.gameContainer;
    if (!container) return;
    const archive = loadWarehouseSave();
    if (!archive.storyCompleted) {
      this.enterWarehouse('story');
      return;
    }
    this.synchronizeWarehouseSignals();
    this.globeScreen?.setInputEnabled(false);
    this.menu?.setEnabled(false);
    setCursorVisible(true);
    const close = (): void => {
      this.warehouseLaunchPanel = null;
      if (this.phase === Phase.Menu) {
        this.menu?.setEnabled(true);
        this.refreshFrontDoor();
      } else if (this.phase === Phase.Choosing) {
        this.globeScreen?.setInputEnabled(true);
      }
    };
    this.warehouseLaunchPanel = new WarehouseLaunchPanel(
      container,
      archive,
      (mode) => {
        this.warehouseLaunchPanel = null;
        this.enterWarehouse(mode);
      },
      close
    );
    this.warehouseLaunchPanel.open();
  }

  /** Apply the authored cel conversion to the current 3D scene. */
  private applyCelPost(immediate = false): void {
    setPaintLook('contactCel', immediate);
  }

  /** Warehouse A/B can still temporarily disable the otherwise global post treatment. */
  private applyWarehouseCelPost(immediate = false): void {
    if (!this.warehouseCelEnabled) {
      setPaintLook('off', immediate);
      return;
    }
    this.applyCelPost(immediate);
  }

  /** Shared by F10 and the F8 A/B buttons, preserving slider values between views. */
  private setWarehouseCelPrototypeEnabled(enabled: boolean, immediate = false): void {
    this.warehouseCelEnabled = enabled;
    if (!this.warehouse) return;
    this.warehouse.setCelVisualsEnabled(enabled);
    this.applyWarehouseCelPost(immediate);
    setRetroLook(enabled ? 'warehouseCel' : this.warehousePreviousRetroLook, immediate);
  }

  /** Hand the active camera, input, atmosphere, and score to the runtime facility. */
  private enterWarehouse(mode: WarehouseMode): void {
    if (this.warehouse) return;
    this.tracePanel?.destroy();
    this.tracePanel = null;
    this.warehouseLaunchPanel?.destroy();
    this.warehouseLaunchPanel = null;
    this.globeScreen?.detach();
    this.phone?.setVisible(false);
    this.menu?.setEnabled(false);
    setCursorVisible(false);
    audio.play('connect');
    audio.setOnAir(true);
    this.warehousePreviousRetroLook = getRetroLookName();

    this.warehouseFog = this.fog
      ? { near: this.fog.getFogNear(), far: this.fog.getFogFar() }
      : null;
    /*
     * The warehouse gets its OWN haze rather than none at all.
     *
     * Fog was pushed to a million units here, which switches it off, and the room paid for it
     * in depth: measured down an aisle, the far wall came out at luma 109 against the near
     * racking's 107. Distance cost nothing at all, so a twenty-six metre aisle terminated in a
     * flat grey plate at exactly the value of the shelf beside the camera - reported as a fog
     * wall, and it was the opposite, an absence of one.
     *
     * DARKER than the surfaces, which is the part that is easy to get backwards. Haze in
     * daylight is bright because it scatters sun; a night interior has no sun to scatter, so
     * distance means less light reaching the lens and the far end of a building goes down, not
     * up. A pale fog here would have washed the far wall further into the near racking.
     *
     * Near 15 keeps the working volume completely clear - the drone's own aisle, the rack the
     * package is on, the worker being scanned. Far 72 puts the rear wall, about 41m from
     * mid-aisle, at roughly 46% haze: enough to sit behind the racking rather than in line
     * with it, not enough to hide anything the mission asks the player to read.
     */
    this.fog?.setFogColor(new THREE.Color(WAREHOUSE_HAZE));
    this.fog?.setFogNear(WAREHOUSE_FOG_NEAR);
    this.fog?.setFogFar(WAREHOUSE_FOG_FAR);

    const seed = mode === 'daily' ? WarehouseDirector.utcDailySeed() : undefined;
    const rig = WarehouseRig.create({
      name: 'Warehouse07Runtime',
      position: WAREHOUSE_ORIGIN,
      mode,
      seed,
    });
    rig.onStoryCompleted = () => {
      this.synchronizeWarehouseSignals();
      this.persist();
      this.refreshFrontDoor();
      this.refreshWarehouseArchiveDisplay();
    };
    rig.onExit = (result) => this.exitWarehouse(result);
    this.add(rig);
    this.warehouse = rig;
    rig.setCelVisualsEnabled(this.warehouseCelEnabled, false);
    this.applyWarehouseCelPost(true);
    setRetroLook(this.warehouseCelEnabled ? 'warehouseCel' : this.warehousePreviousRetroLook, true);
    rig.mount();
  }

  /** Return from the bonus world and reconstitute the globe's post-game state. */
  private exitWarehouse(_result: WarehouseRunResult | null): void {
    if (!this.warehouse) return;
    this.warehouse.unmount();
    this.warehouse.removeFromParent();
    this.warehouse = null;
    this.applyCelPost();
    setRetroLook(this.warehousePreviousRetroLook);
    if (this.warehouseFog && this.fog) {
      // Colour too, not just the distances - see mountScene: a room that retunes the global
      // fog owes the next room every part of it back, and the colour was the part this
      // forgot. Left set, it would have tinted the workstation on the way home.
      this.fog.setFogColor(new THREE.Color(LIGHT.haze));
      this.fog.setFogNear(this.warehouseFog.near);
      this.fog.setFogFar(this.warehouseFog.far);
    }
    this.warehouseFog = null;
    this.camera?.setActive(true);
    audio.setOnAir(false);
    this.synchronizeWarehouseSignals();
    this.persist();
    this.refreshWarehouseArchiveDisplay();
    this.showGlobe();
  }

  /**
   * Open the station: hand the whole screen to M4SS.
   *
   * A clean swap rather than a diorama. Every other contact is a room this rig builds, lights
   * and points its one camera at - M4SS is a different game with its own camera, its own
   * lighting and its own idea of what a metre is, and trying to host it as a set would mean
   * reconciling all three. Handing over the view-target stack costs nothing and reconciles
   * none of it.
   *
   * Built far enough out that nothing here is behind it. The workstation is at z -60 and the
   * dioramas are further along again; M4SS gets its own patch of empty world, because its
   * camera looks along -Z at a room 26 units wide and would happily frame somebody's cellar.
   */
  private enterM4SS(): void {
    if (this.m4ss) return;

    const container = this.getWorld()?.gameContainer;
    if (container) playM4SSHandoff(container, 'opening');

    audio.play('connect');
    audio.setOnAir(true);
    adaptiveScore.setState('m4ss');
    this.setSignalState(M4SS_SIGNAL, SignalState.Active);

    this.globeScreen?.detach();
    this.phone?.setVisible(false);
    this.menu?.setEnabled(false);

    /*
     * Push the fog out of the way first.
     *
     * FOG_FAR is 26, tuned so a diorama a few units across has depth and the workstation at
     * z -60 is not fogged out of existence. M4SS's camera sits 68.5 units back from a room
     * 26 wide, so every single surface in it is past the far plane: the first build of this
     * handover came up as a flat blue-grey silhouette with the geometry and the HUD both
     * perfectly correct, which reads as a broken shader rather than as depth cue doing
     * exactly what it was asked to. There is no "off" on FogNode, so the range goes far
     * enough away to be nothing, and comes back on exit.
     */
    this.m4ssFog = this.fog
      ? { near: this.fog.getFogNear(), far: this.fog.getFogFar() }
      : null;
    /**
     * The warehouse gets its OWN fog rather than none at all.
     *
     * These were 1e6 and 1e7 - fog effectively switched off - because the workstation's values
     * are tuned to a diorama a few metres across and would have swallowed a building. Off is
     * the wrong answer to that: a 48 by 58 metre shed with no atmosphere in it reads as a
     * small room with distant walls, because the far end of an aisle is exactly as crisp as
     * the crate in front of the lens and the eye has nothing to judge distance by.
     *
     * 22 to 82 metres, which puts the near racks clean, the far end of an aisle softening,
     * and the back wall well into haze. It is also the cheapest depth cue available: no
     * geometry, no light, one pair of numbers, and it is most of why the reference shots of
     * real warehouses look enormous.
     */
    /**
     * ## The warm/cool split is a DISTANCE, not a second set of lamps
     *
     * A cold clerestory was added on the east wall to answer a measured 2.1% cool share, and
     * after it the frame measured 0.7% - worse. Nine high bays at 54 simply out-shout five
     * wall bounces at 4.4, and the wall they are on is behind the racks from every angle the
     * player flies.
     *
     * Fog does it for nothing, and it is what the reference photographs are actually doing:
     * warm lamps near, cold air far, and the transition happening across a single aisle. The
     * near plane was the whole problem at 22 metres - an aisle is 26m long and the drone sits
     * in the middle of one, so essentially everything on screen was inside the near plane and
     * no fog was applied to any of it.
     *
     * 9 to 62. The crate in front of the lens is clean, the far end of the run is about half
     * fogged and reads cold, and the back wall is gone. It costs two numbers, it cannot fail
     * to reach anything, and unlike a lamp it gets stronger exactly where the room is emptiest.
     */
    /*
     * ## M4SS wants NO fog, and for a while it was getting the warehouse's
     *
     * The three lines that used to be here set near 9, far 62 and the warehouse haze colour,
     * under a comment about aisles, high bays and the drone. They arrived in b3cea29 - a
     * warehouse lighting change - and landed in this method instead of, or as well as,
     * enterWarehouse. Nothing caught it: both methods configure the same shared FogNode, and
     * the warehouse looked right because it sets its own values on the way in.
     *
     * The effect on M4SS is total. Its camera sits 68.5 units back from a room 26 wide, so
     * every surface in the level is past a far plane of 62 and takes the fog colour at full
     * strength - geometry correct, HUD correct, and the entire world a flat blue-grey
     * silhouette. That is verbatim the failure the comment at the top of this method already
     * describes and already solved once.
     *
     * Back to what it was. There is no "off" on FogNode, so the range goes far enough away
     * to be nothing, and exitM4SS restores the caller's values from m4ssFog.
     */
    this.fog?.setFogNear(1e6);
    this.fog?.setFogFar(1e7);

    const rig = M4SSRig.create({ name: 'M4SSRig', position: M4SS_ORIGIN });
    this.add(rig);
    rig.mount();
    /*
     * Finishing the specimen hands the screen back by itself. Escape remains the way OUT
     * of an unfinished run; containment is the way THROUGH, and it returns to the same
     * place - Keller's conversation - with the desktop file flipped to CONTAINED behind
     * it, because the flag was written before the handback.
     */
    // The title-bar PAUSE button. Same destination as Escape, but discoverable.
    rig.onQuit = () => this.exitM4SS();
    rig.onContained = () => {
      this.exitM4SS();
      /*
       * Containing the specimen IS the answer to Keller's request. The mission advances
       * to its `contained` beat through the same machinery a typed intent uses, so her
       * reaction, the outcome and the resolve chain all land exactly as if the player had
       * said something - because they did something better.
       */
      this.session?.event('contained');
    };
    this.m4ss = rig;

    /*
     * Escape opens the pause menu, and closes it again.
     *
     * It used to leave outright, which was the same mistake the PAUSE button made and worse
     * for being a reflex: Escape is the key people press when they want a game to stop, not
     * when they want to end a conversation with somebody. It now does what the button does,
     * and the menu is where the decision gets made.
     *
     * Held on window so it fires wherever the focus went - M4SS owns the keyboard and the
     * mouse while it runs, so there is nowhere else for a key to land.
     */
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      const m4ss = this.m4ss;
      if (m4ss) m4ss.setPaused(!m4ss.isPaused());
    };
    window.addEventListener('keydown', onKey);
    this.onM4SSKey = onKey;
  }

  /**
   * Come back to the machine.
   *
   * Order matters: unmount first so M4SS stops re-asserting its camera every frame, THEN take
   * the view-target stack back. Reversed, this rig activates its camera and M4SS immediately
   * takes it again on the next tick, and the screen never returns.
   */
  private exitM4SS(): void {
    if (!this.m4ss) return;

    const container = this.getWorld()?.gameContainer;
    if (container) playM4SSHandoff(container, 'returning');

    if (this.onM4SSKey) window.removeEventListener('keydown', this.onM4SSKey);
    this.onM4SSKey = null;

    this.m4ss.unmount();
    this.m4ss.removeFromParent();
    this.m4ss = null;

    if (this.m4ssFog && this.fog) {
      this.fog.setFogNear(this.m4ssFog.near);
      this.fog.setFogFar(this.m4ssFog.far);
    }
    this.m4ssFog = null;

    this.camera?.setActive(true);
    audio.setOnAir(false);
    adaptiveScore.setState('contact');

    /*
     * Back to Keller, not to the globe.
     *
     * M4SS is opened from inside her contact view now, so closing it has to put the player
     * back in the conversation they left - with the file window still open on the desktop
     * behind them and a beat waiting on what they thought. Returning to the globe here
     * would end the request the moment the player looked at the thing it was about.
     */
    this.phone?.setVisible(true);
    this.setPhase(Phase.Contact);
    this.screen = Screen.Tree;
    const shot = this.scene?.getShot('default');
    if (shot) this.moveTo(shot, 1.6);
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
    /*
     * A mission with no signal cannot be reached, and this used to say nothing about it.
     *
     * Lucian shipped like that: the eighth request was queued, offered and marked openable,
     * and then died here because createSignals had no entry for him. The globe is the only
     * place a request can be clicked, so the final mission of the game was unreachable and
     * the only symptom was a player saying they could not see it.
     */
    if (!signal) {
      console.warn(`[omniscient] no globe signal for "${signalId}" - this request cannot be opened`);
      return;
    }
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
  private static readonly COOLDOWN_OVERRIDE: number | null = null;

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

    // A loss changes the world - trust, the countdown, the openable set - so it is one of
    // the two moments worth writing to the tape.
    this.persist();
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
    this.cueTweener.clear();
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
  private holdThenReturnHome(acknowledgementDelayMs = 0): void {
    setCursorVisible(false);
    this.phone?.beginResolution();

    /*
     * Let the authored result shot land first, then breathe a fraction closer into it.
     *
     * Outcome transitions frequently start a 1.4-2.2 second prop/camera cue on the same
     * frame as this hook. Moving immediately would cancel the very payoff this hold exists
     * to show. At 2.35 seconds those moves are settled; a 3.5% push that preserves the
     * current target reads as attention, not as a new shot, and finishes before departure.
     */
    const resolvedScene = this.scene;
    const settleDelay = Math.max(2.35, acknowledgementDelayMs / 1000 + 0.25);
    this.cameraTweener.add(() => undefined, {
      duration: 0.01,
      delay: settleDelay,
      channel: 'resolve-settle',
      onComplete: () => {
        if (this.phase !== Phase.Contact || this.scene !== resolvedScene) return;
        const settle: CameraShot = {
          position: this.cameraPosition.clone().lerp(this.cameraTarget, 0.035),
          target: this.cameraTarget.clone(),
        };
        this.moveTo(settle, 1.35);
      },
    });
    this.resolveHold = Math.max(RESOLVE_HOLD, acknowledgementDelayMs / 1000 + 1.35);
  }

  private returnHome(): void {
    // The carrier falls away as the camera pulls back. Solving a request and leaving one
    // should sound the same from here on: the difference was in the verdict cue, and the
    // link closing is the link closing.
    audio.setOnAir(false);
    setCursorVisible(false);

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
    // The room's air comes home with the picture. Both halves of "a change of medium".
    setRoomTone('home');
    adaptiveScore.setState('home');

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
    // Anything a beat asked the world to do later is not going to happen now.
    this.cueTweener.clear();

    /**
     * The room is held for the first half second of the move home, and this is a two-frame
     * change that fixes the hardest edit in the game.
     *
     * It used to run here, on the same tick `moveTo(HOME_SHOT)` starts. Frame-stepped at
     * 30fps that reads as: one frame of the porch at mean luminance 28.6, the next at 1.4,
     * and then a 2.2 second fade up into the workstation. A hard cut out and a slow fade in.
     *
     * An asymmetric transition is the shape of a LEVEL LOAD. A symmetric one is the shape of
     * a move, and the whole fiction here is that the machine is pulling back through its own
     * link rather than that the game is changing scene. The warp overlay cannot cover for it:
     * it is deliberately edge-weighted, so during the cut the middle of the frame - which is
     * where the room was - has nothing in it at all.
     *
     * 0.45s, which is a fifth of the home move. Long enough that the camera has visibly left
     * before the room goes, short enough that a scene with a sun in it is not lighting the
     * workstation for any length of time - the leak this deactivate was added to fix.
     *
     * Guarded on identity rather than on a flag: if anything mounts another scene inside that
     * half second, the one this closure is holding is already gone and deactivating it twice
     * would be the fault in the other direction.
     */
    const leaving = this.scene;
    this.scene = null;
    this.cameraTweener.add(() => undefined, {
      duration: 0.01,
      delay: 0.45,
      channel: 'scene-teardown',
      onComplete: () => leaving?.deactivate(),
    });

    this.setPhase(Phase.Home);
    this.screen = Screen.Tree;
    this.phone?.setVisible(false);
    this.pauseRemaining = HOME_DWELL;
    this.moveTo(HOME_SHOT, HOME_SHOT.duration ?? 2.0);

    /*
     * Lean toward the tube while the branch draws, then sit back.
     *
     * Phase.Home is documented as "watching the tree grow" and HOME_DWELL gives it five and
     * a half seconds - so the beat was authored long before I looked at it. What was missing
     * is that the camera spends those seconds at HOME_SHOT, where the CRT is a small shape
     * across a room, and the game therefore holds for five seconds on something the player
     * cannot read.
     *
     * A PARTIAL push, deliberately. Going all the way to SCREEN_SHOT is the full-face
     * framing the globe uses, and arriving there would read as entering the globe rather
     * than as looking at the tree - the same move meaning two different things is how a
     * camera language stops being one. A push that stops short says "look at this"; one that
     * arrives says "we are going in".
     *
     * Timed inside the dwell rather than replacing it: it starts once the home move has
     * settled and is back before the dwell expires, so nothing downstream has to know this
     * happened.
     */
    const lean = {
      position: HOME_SHOT.position.clone().lerp(SCREEN_SHOT.position, 0.34),
      target: HOME_SHOT.target.clone().lerp(SCREEN_SHOT.target, 0.34),
    };
    this.cameraTweener.add(() => undefined, {
      duration: 0.01,
      delay: 2.2,
      channel: 'tree-lean',
      onComplete: () => {
        if (this.phase !== Phase.Home) return;
        this.moveTo(lean, 1.5);
        this.cameraTweener.add(() => undefined, {
          duration: 0.01,
          /*
           * Back before the dwell expires, not after.
           *
           * HOME_DWELL is 5.5s. The lean starts at 2.2 and takes 1.5, so sitting back at 1.8
           * after it puts the camera home at 5.2 - a beat of stillness before whatever comes
           * next takes the shot. At 2.6 the return was still in flight when the dwell ended
           * and got cancelled by the next camera move, which is not a fault anybody would
           * see but is a move that never finishes.
           */
          delay: 1.8,
          channel: 'tree-sit-back',
          onComplete: () => {
            if (this.phase === Phase.Home) this.moveTo(HOME_SHOT, 1.2);
          },
        });
      },
    });

    // Resolving Mirela's request is what puts Tomas on the globe - §163's consequence
    // chain, visible before the player knows why.
    const resolvedId = this.activeIndex === null ? undefined : this.queue[this.activeIndex]?.mission.contactId;
    if (resolvedId) {
      this.setSignalState(resolvedId, SignalState.Resolved);
      // Appended rather than sorted: this list IS the order, and it is the only place the
      // order exists.
      if (!this.answered.includes(resolvedId)) this.answered.push(resolvedId);
    }
    this.activeIndex = null;

    this.topUpGlobe();
    const written = this.persist();
    /*
     * Say that the save happened, where the eye is not. "Progress saves" is a promise a
     * player cannot verify without quitting, so a small diegetic line - WRITING TO TAPE -
     * sits in the lower right through the ride home and fades. The persist() above is the
     * fact; this is the receipt.
     */
    this.flashSaveNote(written);

    /*
     * The last answer arms the ending. Everything in the queue resolved - not merely
     * offered, RESOLVED - is the one condition; a lost request in cooldown keeps the
     * machine honestly unfinished until it is answered too.
     */
    const allResolved = this.queue.every(
      (request) =>
        this.signals.find((signal) => signal.id === request.mission.contactId)?.state ===
        SignalState.Resolved
    );
    if (allResolved && !this.endingShown) this.endingDelay = 7.0;
  }

  /**
   * The anomaly arrives: unhidden, hurried, ringed, and on the record.
   *
   * The squelch plays - the sound every CALL opens with, which is the point: after the
   * machine said somebody will call, the sound of somebody calling. The pace makes the
   * Unknown flash arrive three times as often as its easy-to-miss resting rate, and the
   * persist means a player who closes the tab here still owns the reveal.
   */
  private revealAnomaly(): void {
    const anomaly = this.signals.find((s) => s.id === ANOMALY_SIGNAL);
    if (!anomaly || !anomaly.hidden) return;
    anomaly.hidden = false;
    anomaly.pace = 3;
    // The finale used to be view-only. It is now the traceable door to the bonus mission.
    this.openable.add(ANOMALY_SIGNAL);
    // The workstation bed disappearing is the negative space around the new caller. The
    // connect squelch is the only sound left, so a compressed capture cannot mistake the
    // flare for an ordinary globe pulse.
    setRoomTone(null);
    adaptiveScore.setState('anomaly');
    audio.play('connect');
    this.globeScreen?.focusSignal(ANOMALY_SIGNAL);
    this.persist();
  }

  /**
   * The machine's own transmission. See EndingPanel for the delivery and content/ending
   * for the words; what belongs to the rig is the camera and the once-ness.
   *
   * The camera pulls slowly back and slightly up from the home shot - the machine seen
   * whole, at the distance of somebody standing up from the chair after a long shift.
   * Twelve seconds, so it is still finishing as the first lines type; the pull IS the
   * ending's establishing move, not a transition into it.
   */
  private openEnding(): void {
    if (this.endingShown) return;
    this.endingShown = true;
    adaptiveScore.setState('ending');
    // The third and last time the motif plays. Nothing follows it.
    audio.play('motif');

    const container = this.getWorld()?.gameContainer;
    if (!container) return;

    const away = HOME_SHOT.position.clone().sub(HOME_SHOT.target).multiplyScalar(1.85);
    const pullback: CameraShot = {
      position: HOME_SHOT.target.clone().add(away).add(new THREE.Vector3(0, 0.55, 0)),
      target: HOME_SHOT.target.clone(),
    };
    this.moveTo(pullback, 12.0);

    const resolved = this.queue.filter(
      (request) =>
        this.signals.find((signal) => signal.id === request.mission.contactId)?.state ===
        SignalState.Resolved
    ).length;

    this.endingPanel = new EndingPanel(container, () => {
      this.endingPanel = null;
      /*
       * "SOMEBODY WILL CALL" is the transmission's last line, and this is that somebody.
       *
       * The panel closes, the camera pushes back into the CRT on its own, and once the
       * globe has the screen the one signal the player has never seen arrives - red,
       * off-world, origin unresolved. The reveal is gated on the WHOLE game being
       * finished rather than on the first request (where it used to sit as a quiet
       * tease), because as the final image it recontextualises: eight people were
       * answered, and something that is not a person was listening the entire time.
       */
      const anomaly = this.signals.find((s) => s.id === ANOMALY_SIGNAL);
      if (anomaly?.hidden) {
        this.showGlobe();
        this.globeScreen?.setInputEnabled(false);
        this.anomalyDelay = 3.5;
        /*
         * Replace showGlobe's ordinary 1.75s input handoff. The screen belongs to the
         * machine until the off-world acquisition has flared and held as a final image.
         */
        this.cameraTweener.add(() => undefined, {
          duration: 0.01,
          delay: 5.4,
          channel: 'globe-input',
          onComplete: () => {
            if (this.phase !== Phase.Choosing) return;
            this.globeScreen?.setInputEnabled(true);
            setCursorVisible(true);
          },
        });
      } else {
        // The player leaves the machine the way they found it: on, at the desk.
        this.moveTo(HOME_SHOT, HOME_SHOT.duration ?? 2.0);
        this.cameraTweener.add(() => undefined, {
          duration: 0.01,
          delay: 2.1,
          channel: 'globe-input',
          onComplete: () => setCursorVisible(true),
        });
      }
    });
    this.endingPanel.open(this.knowledge, resolved, this.queue.length);
  }

  /** The shared atmosphere, retuned per diorama - see mountScene. */
  private fog: ENGINE.FogNode | null = null;

  /** False until the retro pass is confirmed registered - see tickPrePhysics. */
  private retroMounted = false;
  /** Same, for the painterly pass. Mounted ahead of the CRT - see paintPass's header. */
  private paintMounted = false;

  private disposeSceneJump: (() => void) | null = null;
  /** Editor-only F9 route to the runtime bonus world; never registered in published builds. */
  private onWarehouseDevKey: ((event: KeyboardEvent) => void) | null = null;
  /** Editor-only F10 A/B for the warehouse cel-shaded prototype. */
  private onWarehouseCelKey: ((event: KeyboardEvent) => void) | null = null;
  /** Editor-only: starts the audio context on the first click. See where it is registered. */
  private onDevAudioUnlock: (() => void) | null = null;

  /**
   * The menu plate under the pointer, drawn on the CRT because the plates cannot name
   * themselves any more.
   *
   * Their labels are world geometry and the game renders at a three-pixel grid, which turns
   * small text into texture. See crt/menuLabel for why the tube is the right place for the
   * name and an overlay on the wall was not.
   */
  private menuLabel: string | null = null;
  /**
   * Reusable corner buffers for the menu plates' screen quads, one per face.
   *
   * Allocated on first use and never again: this is projected every frame for the whole time
   * the menu is up, and twelve fresh Vector2s a frame is twelve fresh Vector2s a frame.
   */
  private readonly sharpQuadPool: THREE.Vector2[][] = [];

  /**
   * The CRT's face, once the terminal model has been dressed.
   *
   * Held so the retro pass can be told where it lands on screen each frame. See dressTerminal
   * and art/screenQuad.
   */
  private screenMesh: THREE.Mesh | null = null;

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

  /** Editor art-direction route for the runtime facility, paired with the scene strip. */
  public jumpToWarehouse(): void {
    this.boot?.dispose();
    this.boot = null;
    this.enterWarehouse('story');
  }

  /** The machine's own annotations over the diorama. Built on the first request. */
  private scan: ScanTargets | null = null;

  /** Swap the diorama. One scene is live at a time - §133 foregrounds a single contact. */
  private mountScene(sceneId: string): void {
    this.releaseUnit(false);
    // A delayed cue belongs to the room that asked for it. Nothing here should fire into
    // the next one, and a `prop.` cue naming a prop the new scene does not have is silent.
    this.cueTweener.clear();
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
    /*
     * And the room resolves rather than appearing.
     *
     * After activate, not inside it: activate runs applyCertainties, which resolves any
     * suspicion a prop already has. Wrapping the room before that would hand the entrance's
     * own boxes straight to the promotion pass and sweep them all on frame one.
     */
    this.scene?.openAsUnknown();

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
    /*
     * And the room arrives as a signal rather than as a fact.
     *
     * Ordered after setRetroLook deliberately: the acquire ladder is built from whatever look
     * is active, so it has to know which one this room wants before it starts stepping down
     * onto it. See retroAcquire for why the resolution steps instead of easing.
     */
    retroAcquire();
    /*
     * And the room's air, switched from the same line for the same reason.
     *
     * Every scene id has a bed - see RoomTone. The wire city's is the odd one, having no air
     * in it at all, and that absence only reads BECAUSE the other seven are full: a
     * reconstruction of a district should sound like a machine's guess at one, and a
     * machine has no recording of what a street sounds like.
     */
    setRoomTone(sceneId);
    adaptiveScore.setState('contact');

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
     * How much of the rig's afternoon this room gets. See ContactScene.daylight.
     *
     * Applied here rather than in the scene builder because the key and the fill belong to
     * the workstation, not to any diorama - a room reaching into the rig to turn the sun
     * down would leave it down for whichever room came next.
     */
    if (this.lightRig) {
      const daylight = next?.daylight ?? 1;
      this.lightRig.key.intensity = KEY_INTENSITY * daylight;
      this.lightRig.sky.intensity = SKY_INTENSITY * daylight;
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

    /*
     * The connection, and it used to be a CUT.
     *
     * Measured off a capture at six frames a second: one frame the globe, the next a
     * complete contact view - room, person, three readout cards, chat panel, observed
     * lines, chips. Everything arrived simultaneously and fully formed. This is the game's
     * core verb, done nine times, and the moment the fiction is strongest - a machine
     * reaching down a wire into a stranger's room - and it had less ceremony than opening a
     * menu.
     *
     * Now it arrives wide and settles. The camera starts 24% further out along its own view
     * axis and pushes to the framed shot over 1.05s, which is a machine's picture stabilising
     * rather than a director cutting. Derived from the shot rather than authored per scene,
     * so all eight rooms get it and a new room cannot forget.
     *
     * 1.05 seconds is short on purpose. The player does this nine times; anything with real
     * weight is a delay by the third request. The intent is that they never consciously see
     * it and would notice at once if it went.
     */
    const opening = next?.getShot('default');
    if (opening) {
      const wide = {
        position: opening.position.clone().lerp(opening.target, -0.24),
        target: opening.target.clone(),
      };
      this.cutTo(wide);
      this.moveTo(opening, 1.05);
    }

    /*
     * And she notices you.
     *
     * The single highest-value frame in the whole entrance, and it costs one cue. Nobody was
     * firing anything on arrival, so the player connected to somebody who did not know they
     * were there.
     *
     * A NOD, and the first version got this wrong. It fired `reacting`, which gestures.ts
     * describes as recoiling - Sanda when the follower moves, Vasile when the water rises.
     * On connection that is a person being startled by the machine, and it reads as one: she
     * called THEM, she has been waiting, and somebody picking up is not a shock. A nod is
     * "the cheapest way to make somebody feel listened to", which is exactly the transaction
     * at that moment and the opposite of a recoil.
     *
     * Delayed until the push-in has nearly landed, because a reaction that starts while the
     * camera is still moving reads as part of the move. It has to be a separate event, and
     * the person has to be the one who causes it.
     */
    this.cameraTweener.add(() => undefined, {
      duration: 0.01,
      delay: 0.78,
      channel: 'arrival-notice',
      onComplete: () => {
        if (this.phase === Phase.Contact) this.applyEnvironmentCue('prop.nod:contact');
      },
    });
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
  private readonly mowerAudio = new MowerAudio();
  /** Seconds to keep driving after the job is done, so the last pass can be watched. */
  private driveHold = 0;

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
    setCursorVisible(false);
    unit.drive.engage(true);
    this.driveKeys.attach();
    this.mowerAudio.start();
    adaptiveScore.setState('action', 0);

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
    this.plot?.reset();
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
    this.mowerAudio.stop();
    this.plot?.setVisible(false);
    this.driving = null;
    // And she is back on the line. Only when the request is carrying on - on the way out of
    // the diorama the console is being put away with everything else.
    if (returnCamera) {
      this.phone?.setVisible(true);
      setCursorVisible(true);
      adaptiveScore.setState('contact');
    }

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

    const input = this.driveKeys.read();
    const cut = unit.drive.update(deltaTime, input);
    this.mowerAudio.update(input.forward, cut > 0);
    const collision = unit.drive.collision;
    if (collision) this.mowerAudio.impact(collision.kind, collision.force);
    this.cutTo(unit.drive.shot());

    const progress = unit.field.progress();
    const done = progress / unit.target;
    adaptiveScore.setActionProgress(done);
    this.plot?.draw({
      x: unit.drive.position.x,
      z: unit.drive.position.z,
      heading: unit.drive.facing,
      progress: done,
      deltaTime,
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

    if (progress < unit.target) return;

    /*
     * Done, but not done YET.
     *
     * Snatching the camera away on the frame the last blade falls means the player never
     * sees the finished bank from the machine - the reward for the work is a cut. The hold
     * lets the last pass finish under its own steam, and then the room comes back.
     */
    if (this.driveHold === 0) {
      this.plot?.complete();
      this.mowerAudio.complete();
    }
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
    /*
     * SPLIT FIRST. The cue grammar is comma-separated and ContactScene.applyCue splits
     * internally - which meant the rig's own intercepts below only fired when their cue
     * happened to be FIRST in the string. Mission 09 launched M4SS with
     * 'prop.open:desktop, game.launch:m4ss': startsWith saw 'prop.open', the scene
     * dutifully opened the desktop window and dropped the launch cue it does not know,
     * and the player sat in a conversation about a game that never started. The whole
     * class of bug dies here: every part is inspected for rig-level cues, and only the
     * remainder is handed to the scene, rejoined so its own splitting still applies.
     */
    const parts = cue.split(',').map((part) => part.trim()).filter(Boolean);
    const forScene: string[] = [];
    for (const raw of parts) {
      /**
       * `prop.steady:beacon@2.8` - the same cue, two point eight seconds later.
       *
       * Added for one beat and it is general because the problem is. Mission 03's climax is
       * the harbour light coming back on, and it was firing on the transition that ALSO
       * starts a 2.2 second camera move to look at it - so the light came on while the
       * camera was still travelling, and arrived already lit. Measured off a capture: the
       * beacon is at full brightness by t=42.3 and the shot does not settle until 42.8. The
       * player never sees the moment the mission is about.
       *
       * A transition can only carry one `environment` string and it fires all at once, so
       * there was no way to say "and then this". The alternative was a new field on Beat,
       * which is a bigger change to the content contract than a suffix on a cue - and
       * "camera first, world second" is a thing every mission will want eventually.
       *
       * It rides the tweener rather than `setTimeout` for two reasons: it runs on the game's
       * own clock, so a paused or slow frame does not desynchronise it from the camera move
       * it is waiting for; and it is cancellable by channel, so a second delayed cue on the
       * same prop replaces the first instead of both landing.
       */
      const timed = /^(.*)@([\d.]+)$/.exec(raw);
      if (timed) {
        const [, inner, seconds] = timed;
        const scene = this.scene;
        this.cueTweener.add(() => undefined, {
          duration: 0.01,
          delay: Number(seconds),
          channel: `cue:${inner}`,
          onComplete: () => {
            // The room may have gone in the meantime - a hang-up, a failure, an ending.
            if (this.scene !== scene || !scene) return;
            this.applyEnvironmentCue(inner);
          },
        });
        continue;
      }
      const part = raw;
      if (part.startsWith('unit.take')) {
        this.takeUnit();
        continue;
      }
      /*
       * `game.launch:m4ss` - a beat handing the screen to another game. Intercepted here,
       * beside unit.take: the scene has no business knowing this exists. From the
       * diorama's point of view the file simply opened; everything after that is the
       * rig's problem.
       */
      if (part.startsWith('game.launch')) {
        this.enterM4SS();
        continue;
      }
      forScene.push(part);
    }
    if (forScene.length === 0) return;

    const result = this.scene?.applyCue(forScene.join(', '));
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
    this.navigator?.update(deltaTime);
    adaptiveScore.update();

    /*
     * A held shot is re-written every frame only when it has drift to apply. Without this
     * the camera is set once per cue and never touched again, which is exactly the stillness
     * TOMAS-REVIEW measured; with it, an unattended shot keeps breathing.
     */
    if (this.shotDrift > 0) {
      this.shotClock += deltaTime;
      this.applyCameraTransform();
    }

    /*
     * The post-process pipeline is built lazily on the first render, so the retro pass
     * cannot be mounted from beginPlay - see installRetro, which returns false until it
     * has confirmed the registration took. Retried here rather than hooked because there
     * is no pipeline object to hang a hook on until the pipeline exists.
     */
    if (!HIDE_CRT_POST && !this.retroMounted && this.post) {
      this.retroMounted = installRetro(this.post);
      /*
       * The motif used to fire here as well, and now fires only from the boot screen.
       *
       * This was the right hook when the alternative was beginPlay - the pipeline is built
       * lazily, so this is the first frame there is a picture to announce. It stopped being
       * right the moment there was a keypress to hang it on instead: that press is a
       * guaranteed user gesture, which is what an AudioContext needs, and it is the player
       * switching the machine on rather than the renderer finishing its setup.
       *
       * Two of them was two motifs a few hundred milliseconds apart, which is not a motif.
       */
      if (this.retroMounted) setRetroLook('console', true);
    }
    /* Global cel treatment. DOM UI is outside the composer; the CRT face is masked below. */
    const PAINT_PASS = true;
    if (PAINT_PASS && !HIDE_CEL_POST && !this.paintMounted && this.post) {
      this.paintMounted = installPaint(this.post);
      if (this.paintMounted) {
        if (this.warehouse) this.applyWarehouseCelPost(true);
        else this.applyCelPost(true);
      }
    }
    /*
     * The pass cannot see the scene unless something shows it to it.
     *
     * The engine hands mainScene and mainCamera to its own built-in render pass and to
     * nothing else, so a custom effect registered through registerEffect gets neither - and
     * the paint pass needs both to run the normal/depth prepass its contour is drawn from.
     * Without this line the outline branch is unreachable. See setPaintView.
     *
     * Every frame, because the active camera changes with the shot.
     */
    if (this.paintMounted) {
      // The mission root, so the contour cannot ink a scene the beauty pass has dropped.
      /*
       * The MISSION's camera, not this rig's.
       *
       * The warehouse builds and activates its own ViewTargetCameraNode while this rig goes
       * on holding the workstation's, so handing the pass `this.camera` pointed the outline
       * prepass at the desk - 1260 units from the mission it was supposed to be inking.
       * The contour it produced was a wireframe of the workstation drawn over the aisle,
       * and the racks were never in the prepass at all, which is why widening the outline
       * changed nothing. Found by tinting the ink magenta and measuring where it landed:
       * 14.5% of the lower third of the frame, 1.5% everywhere else.
       */
      const lens = this.warehouse?.activeCamera() ?? this.camera?.getCamera() ?? null;
      setPaintView(this.getWorld() ?? null, lens);
      // The desk is not in the warehouse, but the contour prepass draws it anyway. See
      // PaintPass.prepassExclude for what was tried before naming it outright.
      excludeFromPaintOutline(this.workstation);
    }

    this.cameraTweener.update(deltaTime);
    this.cueTweener.update(deltaTime);

    // The ending: armed by the last resolve, delivered after the reveal has landed.
    if (this.endingDelay > 0) {
      this.endingDelay -= deltaTime;
      if (this.endingDelay <= 0) this.openEnding();
    }
    this.endingPanel?.update(deltaTime);

    // The last arrival. Timed so the camera's push into the CRT has landed first.
    if (this.anomalyDelay > 0) {
      this.anomalyDelay -= deltaTime;
      if (this.anomalyDelay <= 0) this.revealAnomaly();
    }

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

    /*
     * Hand the pixel grid the tube's outline, every frame.
     *
     * Per frame and not once, because the tube is an object in a room and the camera moves
     * around it constantly - the boot reveal pulls back from inside it, the globe pushes into
     * it, and every call ends by flying home past it. A quad computed once would be right for
     * one shot and wrong for the rest.
     *
     * Null is a perfectly good answer and happens often: no terminal in a contact scene, and
     * any frame where a corner of the screen is behind the lens. `projectScreenQuad` explains
     * why the second of those has to refuse rather than guess.
     */
    const protectedScreen =
      this.warehouse || this.m4ss || this.driving || this.phase === Phase.Contact
        ? null
        : projectScreenQuad(this.screenMesh, this.camera?.getCamera());
    setRetroScreenQuad(protectedScreen);
    setPaintProtectedQuad(protectedScreen);

    /*
     * The main menu's plates keep their own resolution.
     *
     * Only in the menu, and only while it is on screen: this is a per-frame projection of six
     * physical objects that move (a hovered plate pushes 4.5cm toward the player), so it cannot
     * be set once at build time. Everywhere else the list is cleared, or the exemption would
     * outlive the plates and leave twelve sharp holes in whatever the camera looked at next.
     *
     * `projectScreenQuad` refuses a quad with a corner behind the lens rather than guessing,
     * and an inverted quad here would exempt most of the room - so a refusal drops that plate
     * from the list and the rest keep working, which is the right failure.
     *
     * See RetroPass.setSharpQuads for what this is for and for the argument it overrules.
     */
    if (this.phase === Phase.Menu && this.menu) {
      const camera = this.camera?.getCamera();
      const quads: THREE.Vector2[][] = [];
      const faces = this.menu.sharpFaces();
      for (let i = 0; i < faces.length; i++) {
        // One buffer per slot, allocated once and reused - this runs every frame.
        let slot = this.sharpQuadPool[i];
        if (!slot) {
          slot = [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()];
          this.sharpQuadPool[i] = slot;
        }
        if (projectScreenQuad(faces[i], camera, slot)) quads.push(slot);
      }
      setRetroSharpQuads(quads);
    } else {
      setRetroSharpQuads(null);
    }


    this.globeScreen?.update(deltaTime);

    // Hand over to the globe screen once the camera has arrived inside the CRT.
    if (this.globeHandoff > 0) {
      this.globeHandoff -= deltaTime;
      if (this.globeHandoff <= 0) {
        this.globeScreen?.attach(this.signals, this.openable, this.answered);
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

    /*
     * The plate name, over the tree, on the frame the tree just drew.
     *
     * After `draw` and not before: the tree clears this canvas every frame and re-commits
     * it, so anything written earlier is gone before it reaches the GPU. `commit` only sets
     * `needsUpdate`, so raising the flag a second time in one frame costs nothing.
     *
     * Menu only. The tube shows the knowledge tree everywhere else and a plate name over a
     * mission's growth would be the front door talking during a call.
     */
    if (this.menuLabel && this.surface && this.phase === Phase.Menu && this.screen === Screen.Tree) {
      drawMenuLabel(this.surface, this.menuLabel);
      this.surface.commit();
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
    if (this.navigator) {
      this.getWorld()?.inputManager?.removeInputHandler(this.navigator);
      this.navigator.dispose();
      this.navigator = null;
    }
    if (this.onOverviewKey) window.removeEventListener('keydown', this.onOverviewKey);
    this.onOverviewKey = null;
    if (this.onM4SSKey) window.removeEventListener('keydown', this.onM4SSKey);
    this.onM4SSKey = null;
    if (this.onWarehouseDevKey) window.removeEventListener('keydown', this.onWarehouseDevKey);
    this.onWarehouseDevKey = null;
    if (this.onWarehouseCelKey) window.removeEventListener('keydown', this.onWarehouseCelKey);
    this.onWarehouseCelKey = null;
    if (this.onDevAudioUnlock) window.removeEventListener('pointerdown', this.onDevAudioUnlock);
    this.onDevAudioUnlock = null;
    /*
     * The boot screen owns two window listeners and a fistful of timers.
     *
     * Leaving play with it still up would leave both attached to a rig that no longer
     * exists - and in the editor, where play mode is entered and left dozens of times an
     * hour, that is a keydown handler per session all firing into dead closures.
     */
    this.boot?.dispose();
    this.boot = null;
    this.tracePanel?.destroy();
    this.tracePanel = null;
    this.warehouseLaunchPanel?.destroy();
    this.warehouseLaunchPanel = null;
    this.systemPanel?.close();
    this.systemPanel = null;
    this.disposeSoundCaptions?.();
    this.disposeSoundCaptions = null;
    this.disposeAccessibility?.();
    this.disposeAccessibility = null;
    this.tune?.dispose();
    this.tune = null;
    this.releaseUnit(false);
    this.m4ss?.unmount();
    this.m4ss = null;
    this.warehouse?.unmount();
    this.warehouse = null;
    adaptiveScore.dispose();
    stopRoomTone();
    audio.setOnAir(false);
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
