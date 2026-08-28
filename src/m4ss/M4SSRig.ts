/**
 * M4SS, in Sandbox Studio.
 *
 * ## Why it moved here
 *
 * The first greybox was an HTML canvas, chosen for iteration speed on a question that is
 * entirely about feel. Wrong trade twice over: the Beta Jam is explicitly about what can be
 * made in the Studio, so a browser canvas may not even be eligible - and feel does not
 * transfer across renderers and input paths anyway, so the speed bought less than it cost.
 *
 * ## The shape of it
 *
 * A side-on orthographic camera over a flat XY plane at z = 0. 2.5D in the sense the design
 * asked for: the simulation stays two-dimensional and readable, while the world is real
 * geometry that takes the scene's light and can have things in front of and behind it.
 *
 * mass.ts does not know this file exists, and surface.ts only turns particles into a
 * contour. Everything that decides anything lives in the simulation, so what runs here and
 * what the headless harness measures cannot drift apart.
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { decorMesh } from '../omniscient/art/mesh.js';
import { castShadows } from '../omniscient/art/shadows.js';
import {
  accessibleScreenShakeScale,
  getAccessibilityPreferences,
} from '../omniscient/accessibility/preferences.js';
import { buildSurface } from './surface.js';
import { teardrop } from './swingShape.js';
import { freshLab } from './lab.js';
import { freshShaft } from './shaft.js';
import { freshSluice } from './sluice.js';
import { loadM4ssStage, saveM4ssContained, saveM4ssStage } from '../omniscient/session/persistence.js';
import { audio } from '../omniscient/audio/ConsoleAudio.js';
import { SlimeAudio } from './SlimeAudio.js';
import {
  atmosphereTexture,
  backdropTexture,
  canopyTexture,
  acidTexture,
  dirtTexture,
  domeTexture,
  eyeTexture,
  floorMistTexture,
  forestLayer,
  godRayTexture,
  pipeStackTexture,
  markerTexture,
  moteTexture,
  occluderTexture,
  gateTexture,
  glowTexture,
  interiorFadeTexture,
  plateTexture,
  bigShroomTexture,
  bonesTexture,
  deadTreeTexture,
  vesselTexture,
  leafVineTexture,
  pressTexture,
  propTexture,
  ringTexture,
  roofLatticeTexture,
  strikerTexture,
  setStageTheme,
  sporelingSprite,
  SPORELING_H,
  SPORELING_W,
  THEME_GALLERY,
  THEME_SLUICE,
  THEME_STACK,
  vignetteTexture,
  bushTexture,
  PAL,
  portalTexture,
  wallTexture,
  draughtTexture,
  grateTexture,
  intakeTexture,
  sillTexture,
  vineTexture,
  waterTexture,
} from './stageArt.js';

import type { WaterLight } from './stageArt.js';
import {
  TUNING,
  absorbTouching,
  centroid,
  components,
  draftLift,
  draftOn,
  loose,
  makeState,
  mass,
  maxSplit,
  owned,
  crusherRect,
  gateSolid,
  reachOf,
  split,
  step,
} from './mass.js';

import type { Anchor, Button, Critter, Crusher, Gate, MassState, Updraft } from './mass.js';

/**
 * How far the drawn body has to be lifted to stand ON the ground rather than in it.
 *
 * A metaball surface extends past the particles that generate it in every direction - that is
 * what gives the creature its soft outline - and the overshoot is the same at the bottom as
 * at the top. Measured: with the field this rig uses (radius 21, threshold 1.55) a settled
 * body's mesh reaches 9.9px below its lowest particle, and its lowest particle rests exactly
 * on the tile. So a third of the creature was drawn underground, on every surface in both
 * stages, which the playtest read as the mass sitting "a little bit below the ground tile".
 *
 * The lift is applied to the POINTS the surface is built from rather than to the finished
 * meshes, so the body, its rim, its belly, its shine, its eyes and the tendril all move
 * together - a mesh-level offset would have slid the face off the silhouette.
 *
 * The cost is at ceilings, where the creature now draws about ten pixels into whatever it is
 * squeezing under. That is the right trade: the player looks at the ground constantly and at
 * the underside of a gate for the two seconds it takes to crawl through one.
 */
const BLOB_LIFT = 10;

/**
 * The creature's own two colours, named once because two things wear them now.
 *
 * NOT from PAL, and that is the whole point of hoisting them. Every PAL entry is pre-lifted
 * for the tone curve and every stage texture is drawn unlit from those lifted values; the
 * creature is drawn from plain authored hexes through a LIT material instead, because it is
 * the one object in the room that is meant to look like it is standing in the light rather
 * than carrying its own. Building the trail out of PAL.slime made it a different green -
 * paler and yellower than the animal that left it - which was the entire complaint.
 */
const SLIME_FILL = '#a8e85c';
const SLIME_EDGE = '#3f6b1f';
const SLIME_EMISSIVE = '#5c9a2a';

/**
 * The creature's skin, as a material - so anything made of the creature is made the same way.
 *
 * Sharing the COLOUR was not enough, and the frame said so: the body came out #9fb867 on
 * screen and the trail, wearing the same hex through a flat unlit material, came out #588526.
 * The gap is the material, not the colour. The body is lit and carries an emissive, and ACES
 * at exposure 0.5 pulls a flat fill of the same hex a long way down. Two objects that are
 * meant to be the same substance have to go through the same lighting, or matching them is an
 * endless exercise in hand-picking hexes against a tone curve.
 */
function slimeSkin(extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(SLIME_FILL),
    roughness: 0.35,
    metalness: 0.05,
    emissive: new THREE.Color(SLIME_EMISSIVE),
    side: THREE.DoubleSide,
    ...extra,
  });
}

/** How far ahead the flight dots predict, in seconds, and how many there are. */
const DOT_REACH = 0.34;
/** The longer look-ahead used in slow motion - aiming time is what slow motion is for. */
const DOT_REACH_SLOWMO = 0.5;
const DOT_COUNT = 4;

type TutorialAction = 'move' | 'target' | 'split' | 'recall';

/**
 * How far the body travels along the ground between deposits, in px.
 *
 * Set against TRAIL_BLOB and the field threshold rather than by eye: at r 15 and threshold
 * 0.45 the midpoint between two deposits 15px apart sits well above the contour, so the run
 * fuses into one ridge with a visible swell over each deposit. Push the spacing past about
 * 20 and the ridge breaks into beads while the creature is still walking.
 */
const TRAIL_STEP = 15;
/**
 * The field radius of one fresh deposit.
 *
 * At threshold 0.45 an isolated one contours at r * 0.574, so 15 gives a hill about 17px
 * tall - measured, not guessed. Scaled down for a smaller body at the stamp.
 */
const TRAIL_BLOB = 15;
/**
 * The two contours: the bright body of the ridge, and a fatter darker one behind it.
 *
 * The outline is not decoration. Both stages are walked on bright yellow-green turf and the
 * slime is bright yellow-green, so a trail in the creature's own colour laid flat on grass
 * disappears into it - which is exactly what the first two attempts did. The creature itself
 * only reads because it carries its own shading; the trail gets the same treatment.
 */
const TRAIL_FILL = 0.45;
const TRAIL_EDGE = 0.26;
/** Where a contour sits relative to its point, as a fraction of the field radius. */
const TRAIL_SEAT = 0.5;
/**
 * Seconds a deposit lasts.
 *
 * Down from seven. At seven a stage slowly filled in with everywhere the player had ever
 * been, which is a map rather than a trail - and the information a trail actually carries is
 * "I came from THERE, just now". Short enough that what is on screen is always the last few
 * seconds of travel, long enough to still be a tail rather than a flicker.
 */
const TRAIL_LIFE = 2.6;
/** The most deposits kept at once. At this life it is never near the cap; it is a backstop. */
const TRAIL_MAX = 90;

/**
 * The stages, in order. The portal at the end of one loads the next.
 *
 * Each entry is a factory rather than a World, because a World is mutated by play - gates
 * open, buttons latch, growths wake - and replaying a stage has to start from the authored
 * numbers rather than from however the last attempt left them.
 */
const STAGES = [freshLab, freshShaft, freshSluice];

/**
 * One theme per stage, in the same order.
 *
 * A parallel array rather than a field on the world, because a StageTheme is a rig concern -
 * mass.ts has never heard of a colour and should not start. Indexed rather than branched: the
 * line this replaced was `stageIndex === 0 ? GALLERY : STACK`, which would have quietly drawn
 * stage three as stage two rather than failing, and a wrong palette is the one art bug that
 * looks exactly like an intentional decision.
 */
const STAGE_THEMES = [THEME_GALLERY, THEME_STACK, THEME_SLUICE];

/**
 * Level units are pixels; the engine works in metres. One node reconciles them.
 *
 * ## Why this exists
 *
 * The level is authored 1280 x 720 with y DOWN, because that matches every tile editor and
 * every screenshot and is far easier to reason about. The engine is built for rooms a few
 * units across - OmniscientRig's whole workshop is about eight - and at 1280 the camera came
 * out roughly a hundred times too close, with a seven-unit strip of moss filling a quarter
 * of the screen.
 *
 * So everything the level contains hangs off one node scaled by SCALE with a NEGATIVE y,
 * which converts pixels to metres and flips the axis in the same transform. Children are
 * then placed in raw level coordinates and never think about either. The camera lives
 * outside it, in metres, because a camera inside a mirrored parent is a camera that has to
 * be reasoned about twice.
 */
const SCALE = 0.02;

/** World units across the frame. The level is authored in these. */
const VIEW_WIDTH = 1280;
/**
 * A narrow lens a long way back, because ViewTargetCameraNode is perspective-only.
 *
 * A side-on game cannot have parallax between the near and far edge of a platform - it reads
 * as the level being subtly bent. True orthographic is not on offer here, and a 12-degree
 * lens at this distance is close enough that the convergence is under a pixel across the
 * whole room.
 */
const CAMERA_FOV = 12;
const CAMERA_ASPECT = 16 / 9;
const CAMERA_BACK =
  (VIEW_WIDTH * SCALE) / (2 * Math.tan((CAMERA_FOV * Math.PI) / 360) * CAMERA_ASPECT);

/** Level coordinates to world metres. The stage's own transform does this for children. */
function place(x: number, y: number, z = 0): THREE.Vector3 {
  return new THREE.Vector3(x * SCALE, -y * SCALE, z * SCALE);
}

/** Reused, because building a Matrix4 every frame to aim a camera is a frame of garbage. */
const AIM = new THREE.Matrix4();
/** How much of the body is shed per second of held Space. */
const SPLIT_RATE = 0.8;
/**
 * The most one split can give away.
 *
 * Not 100%: `split` refuses to leave fewer than two particles anyway, so a full bar would
 * promise something the simulation will not do, and a bar that lies at its own maximum is
 * worse than a shorter bar. 0.8 is also comfortably past what stage one asks for, so the
 * ceiling is never the thing standing between the player and the gap.
 */
const SPLIT_MAX = 0.8;


@ENGINE.GameClass()
export class M4SSRig extends ENGINE.SceneNode {
  private state: MassState | null = null;
  private camera: ENGINE.ViewTargetCameraNode | null = null;
  /** Everything in level coordinates hangs off this. See SCALE. */
  private stage: ENGINE.SceneNode | null = null;
  /**
   * A readout, because two different camera positions produced pixel-identical frames and
   * no amount of reasoning was going to say why. Numbers on the screen, one capture, done.
   */
  private hud: HTMLElement | null = null;
  private hudMass: HTMLElement | null = null;
  private hudShed: HTMLElement | null = null;
  private hudLabel: HTMLElement | null = null;
  private hudNote: HTMLElement | null = null;
  private containmentMark: HTMLElement | null = null;

  private body: ENGINE.MeshNode | null = null;
  private shine: ENGINE.MeshNode | null = null;
  /** The specimen's eyes: two pupil planes riding the upper body. See paintSlime. */
  private eyes: ENGINE.MeshNode[] = [];
  /** Frames until the next blink starts; blink plays while blinkT > 0. */
  private blinkWait = 400;
  private blinkT = 0;
  /** Where the highlight has leaned to, smoothed. See paintSlime. */
  private shineLean = 0;
  private belly: ENGINE.MeshNode | null = null;
  private rim: ENGINE.MeshNode | null = null;
  private strays: ENGINE.MeshNode | null = null;
  private cord: ENGINE.MeshNode | null = null;
  private readonly anchorNodes = new Map<Anchor, ENGINE.MeshNode>();
  private portal: ENGINE.MeshNode | null = null;
  private slimeGlow: ENGINE.MeshNode | null = null;
  private readonly vineMaps: Array<{ map: THREE.Texture; phase: number }> = [];
  /** Seconds since the stage was built. Drives every idle animation in the scene. */
  private artClock = 0;
  private portalAt: { x: number; y: number } | null = null;
  private portalPhase = 0;
  private lastPortalStep = -1;
  /** Set the frame the player reaches the portal. The stage is over. */
  private cleared = false;
  /**
   * True once the last portal has swallowed the specimen.
   *
   * Hiding the meshes is not enough on its own: paintSlime sets the eyes visible again on
   * every frame it runs, so without this the creature's face comes back and floats in the
   * mouth of the hole that just ate it.
   */
  private swallowed = false;
  /**
   * Called a beat after the LAST portal is reached, if anybody is listening.
   *
   * OmniscientRig sets this to its own exit: M4SS runs inside Keller's contact view, so
   * finishing the specimen hands the screen back to the conversation it interrupted, with
   * her desktop file already flipped to CONTAINED behind it. Left null - the standalone
   * `?game=m4ss` boot - the end state simply holds on screen, which is the right ending
   * for a build with no console to return to.
   */
  /**
   * The player asked to leave. Wired to exitM4SS, which returns them to the globe.
   *
   * Separate from onContained: that fires when the specimen is finished and the file closes
   * itself. This is somebody deciding to stop, which is a different event and must not be
   * mistaken for completing the mission.
   */
  public onQuit: (() => void) | null = null;
  /**
   * True while the pause menu is up. The sim does not step and no input reaches the creature.
   *
   * A pause that only stops the drawing is not a pause - the presses keep cycling, the
   * sporelings keep walking, and a player who steps away comes back to a room that has moved
   * without them. This gates the whole of tickPrePhysics below the HUD.
   */
  private paused = false;
  private pauseVeil: HTMLElement | null = null;
  public onContained: (() => void) | null = null;
  /** Seconds until onContained fires. -1 is disarmed. See contain(). */
  private containedDelay = -1;

  // -- the voice, and the state edges that trigger it -------------------------------------
  private readonly voice = new SlimeAudio();
  /** Last frame's values, so a cue fires on the TRANSITION and never on the state. */
  private wasAttached = false;
  /** 'none' | 'lift' | 'refused' - see the column cues in the per-frame block. */
  private wasDraught: 'none' | 'lift' | 'refused' = 'none';
  private wasSnapped = 0;
  private wasOwned = 0;
  private wasAirborne = false;
  private fallSpeed = 0;
  /** Set by the split handler for one tick, so a split's mass drop is not read as a crush. */
  private justSplit = false;
  /** Absorb ticks are throttled - lumps come home a few grams a frame for seconds. */
  private absorbCooldown = 0;
  /** Buttons and gates already announced, so a pressed state does not re-fire per frame. */
  private readonly heardButtons = new Set<object>();
  private readonly heardGates = new Set<object>();

  // -- juice: bursts, shake, and the warp between stages -----------------------------------
  /**
   * Live burst particles. A burst is eight to fourteen unlit pixel quads thrown from a
   * point, pulled down by half gravity, dead inside half a second. Deliberately the whole
   * particle system: anything fancier starts competing with the spores and the slime for
   * attention, and a burst's job is to mark a POINT for a beat, not to be weather.
   */
  private readonly bursts: Array<{
    node: ENGINE.MeshNode;
    vx: number;
    vy: number;
    life: number;
  }> = [];
  /** Camera kick, seconds remaining. Set by the heavy button; decays in follow(). */
  private shake = 0;
  /**
   * The between-stages warp. `out` pulls the body into the portal behind a rising veil;
   * the swap happens at full white; `in` lifts the veil off the new stage. The sim does
   * not step while this runs - the creature is IN the portal, not standing beside it
   * waiting for a curtain.
   */
  private warp: { t: number; out: boolean; final: boolean } | null = null;
  private warpVeil: HTMLElement | null = null;
  /**
   * Which stage is loaded. The portal advances it.
   *
   * A list rather than a scene graph or a manifest, because there are two of them and the
   * only thing a stage needs to be is a World. When a third arrives it goes on the end.
   */
  private stageIndex = 0;
  /** Where the mouse is, in level coordinates. Drives the hover glow. */
  private pointer: { x: number; y: number } | null = null;
  /** The growth the pointer is over and the body could actually reach, if any. */
  private hovered: Anchor | null = null;
  private crusherNodes: Array<{ node: ENGINE.MeshNode; crusher: Crusher; prevAt: number }> = [];
  /**
   * The air columns, and how brightly each is currently reading.
   *
   * `glow` is eased rather than set, because the thing it is reporting - whether the draught
   * is carrying the body - is a boolean that can flip in one frame when the player steps over
   * the feathered edge, and a column that snaps between two brightnesses reads as a light
   * being switched rather than as air picking something up.
   */
  private draughtNodes: Array<{
    face: ENGINE.MeshNode;
    map: THREE.CanvasTexture;
    draft: Updraft;
    glow: number;
  }> = [];
  /**
   * The trail: where the creature has been, oldest first.
   *
   * Kept by the RIG rather than by the sim, because nothing about it is simulated - no rule
   * reads it, no collision touches it, and a body that has left a trail behaves exactly like
   * one that has not. State that only the renderer consumes belongs to the renderer.
   */
  /**
   * The flight dots: a few frames of where the body would go if it let go now.
   *
   * Four, not a line. At a revolution and a half a second a long dotted arc strobes into
   * unreadability - and four is enough to curve, which is what separates "this is where you
   * would go" from a laser sight pointing somewhere.
   *
   * Each dot owns its own texture with its fade baked IN, so showing and hiding is `visible`
   * and nothing ever writes `material.opacity` from the frame loop - which does not reliably
   * reach the renderer through a MeshNode, and presents as a dot that simply never appears.
   */
  private flightDots: ENGINE.MeshNode[] = [];
  private trail: Array<{ x: number; ground: number; r: number; ry: number; born: number }> = [];
  private trailNode: ENGINE.MeshNode | null = null;
  private trailEdge: ENGINE.MeshNode | null = null;
  private lastStamp: { x: number; y: number } | null = null;
  /** One sprite per critter, each owning the canvas it repaints. See sporelingSprite. */
  private critterNodes: Array<{
    node: ENGINE.MeshNode;
    critter: Critter;
    sprite: ReturnType<typeof sporelingSprite>;
  }> = [];
  /** Both sprites for every growth, so waking one is a texture swap. */
  private readonly growthArt = new Map<Anchor, { live: THREE.Texture; dead: THREE.Texture }>();
  /** The ember halo behind each dead growth; hidden the frame its growth wakes. */
  private readonly emberNodes = new Map<Anchor, ENGINE.MeshNode>();
  /** The constant presence halo behind each LIVE growth. */
  private readonly presenceNodes = new Map<Anchor, ENGINE.MeshNode>();
  /** Up to three chevrons hung over shed lumps. See paintWorld. */
  private readonly shedMarkers: ENGINE.MeshNode[] = [];
  /** A growth clicked from out of reach flashes and says so. {anchor, seconds left}. */
  private denied: { anchor: Anchor; t: number } | null = null;
  /** The halo that sits behind whichever reachable growth the pointer is over. */
  private hoverHalo: ENGINE.MeshNode | null = null;
  /** The frame-closers: canopy across the view top, vignette over the whole view. They
   * follow the camera in follow(), so a scrolling stage stays closed at every height. */
  private canopy: ENGINE.MeshNode | null = null;
  /** The stage's art identity - palette, light direction, midground kind. Set at the top
   * of buildLevel() so every generator call below it draws the right world. */
  private theme = THEME_GALLERY;
  /** Where the backdrop hung its lanterns, in level x. Filled by buildBackdrop, spent by
   * buildLevel's floor pools - light that lands has to know where it came from. */
  private lanternXs: number[] = [];
  /** The tutorial plates, and the world points they are pinned to. See placeSigns. */
  private readonly signLabels: Array<{
    el: HTMLElement;
    x: number;
    y: number;
    action: TutorialAction;
  }> = [];
  private readonly dismissedTutorials = new Set<TutorialAction>();
  /** The pulsing ring over the growth a click would catch. See chooseTarget. */
  private latchRing: ENGINE.MeshNode | null = null;
  /** 1 the frame the tendril grips, decaying - drives the ring's grip flash. */
  private gripFlash = 0;
  /** The slow-motion vignette veil. DOM, like the warp veil, so opacity is per-frame safe. */
  private slowmoVeil: HTMLElement | null = null;
  /** What the world's post-processing looked like before this rig took the screen. */
  private savedPost: { tone: unknown; bloom: unknown } | null = null;
  /** The growth a click would catch right now - nearest live growth within reach. */
  private target: Anchor | null = null;
  /** Flies: small motes orbiting each live growth, animated in the art tick. */
  private readonly flies: Array<{
    node: ENGINE.MeshNode;
    anchor: Anchor;
    radius: number;
    speed: number;
    phase: number;
    squash: number;
  }> = [];
  /** Drifting air motes - a real particle system, not pixels painted into a sheet. */
  private readonly airMotes: Array<{
    node: ENGINE.MeshNode;
    vx: number;
    vy: number;
    wobble: number;
    phase: number;
  }> = [];
  private vignette: ENGINE.MeshNode | null = null;
  /** Smoothed camera height, in level coordinates. See viewCentre. */
  private cameraY = 0;

  private readonly gateNodes: Array<{
    node: ENGINE.MeshNode;
    gate: Gate;
    restY: number;
  }> = [];
  private readonly buttonNodes: Array<{ node: ENGINE.MeshNode; button: Button }> = [];
  /** The chevrons hovering over unpressed plates. See buildLevel. */
  private readonly buttonFlags: Array<{ node: ENGINE.MeshNode; button: Button }> = [];

  private readonly held = new Set<string>();
  private latched: Anchor | null = null;
  private recalling = false;
  private splitHold = 0;
  private growthNoticeUntil = 0;
  private carry = 0;
  private readonly detach: Array<() => void> = [];
  /** Built once, whichever of the two entry points got here first. See mount. */
  private mounted = false;

  /**
   * DoubleSide, and it is not optional.
   *
   * The contour is a flat triangle fan per marching-squares cell, and the winding of those
   * fans follows the case table rather than any convention - in a coordinate system that is
   * also y-flipped. So roughly half the slime faces away from the camera, and with the
   * default FrontSide it is simply not drawn. What that looks like is an empty level, which
   * reads as the simulation being broken and is not.
   *
   * Emissive carries most of the colour because the slime should glow slightly in a dark
   * facility, and because it makes the body legible before any light is tuned.
   */
  /*
   * GREEN, not mint. The body used to sit at #79d9b0 - a blue-leaning aqua that read as
   * white against a green room, which is how it kept winning the value test while looking
   * like a bubble rather than like something grown in this lab. The whole creature now
   * lives in the reserved chartreuse family: the same hue as the culture medium in the
   * seams, the ooze in the gates and the live growths, because the fiction is that they
   * are all the same substance. It is still the brightest thing on screen - that is the
   * hierarchy and it has not moved - it is simply the brightest GREEN.
   */
  private readonly slimeMaterial = slimeSkin();
  private readonly rimMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(SLIME_EDGE),
    side: THREE.DoubleSide,
  });
  /*
   * The slime's own shading, in two extra contours.
   *
   * The body was one flat fill with a fatter rim behind it, which was fine when the world was
   * flat-shaded boxes and became the odd one out the moment every other surface in the stage
   * grew a tonal ramp. It is also the object the player looks at continuously, so it is the
   * worst thing in the frame to leave unshaded.
   *
   * Marching squares makes this nearly free. The contour is drawn at a FIELD THRESHOLD, so a
   * higher threshold gives a smaller shape that is automatically nested inside the body and
   * automatically follows every wobble of it. Offset one up and pale for the shine, one down
   * and dark for the belly, and the blob is lit from above with no lighting and no UVs.
   */
  private readonly shineMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#e8fbb0'),
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.5,
    toneMapped: false,
  });
  private readonly bellyMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#6aa832'),
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.55,
    toneMapped: false,
  });
  /*
   * There were bubbles here, and they were removed.
   *
   * Built the way pass 10 prescribed - a third nested contour off the same field, at a small
   * radius on every eleventh particle - and tried twice, at two sizes and two opacities. They
   * never read. The slime renders about seventy pixels wide, the shine and the belly already
   * occupy its interior, and a third internal layer at that scale is a two-point palette cost
   * for something no player will ever consciously see.
   *
   * The technique was right and the target was too small. If the slime ever gets a close-up -
   * a portrait, a title card, a cutscene - this is the first thing to put back.
   */
  private readonly strayMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#71879a'),
    roughness: 0.65,
    emissive: new THREE.Color('#20303c'),
    side: THREE.DoubleSide,
  });
  private readonly cordMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#8fd6e8'),
    side: THREE.DoubleSide,
  });

  public override beginPlay(): boolean {
    if (!super.beginPlay()) return false;
    this.mount();
    return true;
  }

  /**
   * Build the room and take the screen.
   *
   * Split out of beginPlay because M4SS has two ways in. Standalone (`?game=m4ss`) the rig
   * exists before play starts and the engine calls beginPlay for us. Opened from the globe
   * inside OMNISCIENT_ it is added to a live scene, and a node added after play has begun
   * cannot count on beginPlay arriving at all - the same ordering that left this rig's own
   * camera inactive and cost an afternoon. So the caller mounts it explicitly, and beginPlay
   * is just the standalone path calling the same method.
   *
   * Guarded, because both paths can fire for the same node and building the room twice would
   * leave two of everything with one set unreachable.
   */
  public mount(): void {
    if (this.mounted) return;
    this.mounted = true;
    this.setTickEnabled(true);

    /*
     * M4SS owns its look while it owns the screen.
     *
     * The stage's whole palette is pre-lifted for ACES at exposure 0.5 (see stageArt's
     * lift()), but which post config actually ran depended on the door you came in
     * through: standalone got the scene default (0.5, no bloom) and the console handed
     * over its own (0.62, bloom for the CRT) - the same rooms, a quarter brighter, on the
     * path the audience actually plays. Every capture-based judgement to date was made on
     * the standalone look. Configured here and restored on unmount, both doors now lead
     * to the same game.
     *
     * And bloom is ON, deliberately: the palette puts its accents - slime, lanterns,
     * portal, acid - at the top of the range, which is exactly what a threshold bloom
     * feeds on. The glow this stage has been faking with painted halo sprites gets a real
     * optical bleed on top.
     */
    {
      const post = this.getWorld()?.postProcessManager;
      if (post) {
        this.savedPost = {
          tone: post.getEffectConfig(ENGINE.PostProcessPass.ToneMapping),
          bloom: post.getEffectConfig(ENGINE.PostProcessPass.Bloom),
        };
        post.configureEffect(ENGINE.PostProcessPass.ToneMapping, {
          enabled: true,
          mode: THREE.ACESFilmicToneMapping,
          exposure: 0.5,
        });
        post.configureEffect(ENGINE.PostProcessPass.Bloom, {
          enabled: true,
          strength: 0.35,
          threshold: 0.75,
          radius: 0.6,
        });
      }
    }

    /*
     * 40, down from 45, and the size on screen is the reason.
     *
     * The body is a phyllotaxis disc of radius sqrt(count) * rest * 0.62, so mass and
     * silhouette are the same dial - there is no way to make it smaller without making it
     * lighter. 40 reads as a thing you could pick up rather than a puddle, and the reach
     * economy was retuned around it rather than the other way round.
     */
    /*
     * Resume at the saved stage. Clamped rather than trusted - a save written by a build
     * with three stages read by a build with two should land on the last real stage, not
     * on undefined. Progress WITHIN a stage is never saved, matching the console's rule:
     * a refresh costs the attempt, never the game.
     */
    this.stageIndex = Math.min(loadM4ssStage(), STAGES.length - 1);
    this.state = makeState(STAGES[this.stageIndex](), 40);
    this.cameraY =
      this.state.world.height <= VIEW_WIDTH / CAMERA_ASPECT
        ? this.state.world.height / 2
        : this.state.world.height - VIEW_WIDTH / CAMERA_ASPECT / 2;
    const stage = ENGINE.SceneNode.create({ name: 'M4SSStage' });
    stage.scale.set(SCALE, -SCALE, SCALE);
    this.add(stage);
    this.stage = stage;

    this.buildCamera();
    this.buildLights();
    this.buildLevel();
    this.buildPortal(this.state.world);
    this.buildSlimeGlow();
    this.buildSlime();
    this.listen();
    this.buildHud();
  }

  public override endPlay(): boolean {
    this.unmount();
    return super.endPlay();
  }

  /**
   * Give the screen back.
   *
   * Releasing the camera is the part that matters and the part that is easy to forget: this
   * rig re-asserts itself onto the view-target stack every frame, so a host that simply
   * removes the node keeps looking through a camera belonging to something that is no longer
   * there. The host restores its own afterwards; this makes sure there is nothing left
   * fighting it.
   */
  public unmount(): void {
    if (!this.mounted) return;
    this.clearInput();
    this.mounted = false;
    this.setTickEnabled(false);
    this.camera?.setActive(false);
    for (const sign of this.signLabels) sign.el.remove();
    this.signLabels.length = 0;
    for (const off of this.detach) off();
    this.detach.length = 0;
    // Disconnect the instrument from the shared bus. The bus itself belongs to the
    // console and stays up - only the slime's routes through it are ours to tear down.
    this.voice.dispose();
    // Hand the look back the way it was found - the console's CRT bloom is not ours to keep.
    const post = this.getWorld()?.postProcessManager;
    if (post && this.savedPost) {
      if (this.savedPost.tone) {
        post.configureEffect(
          ENGINE.PostProcessPass.ToneMapping,
          this.savedPost.tone as Record<string, unknown>
        );
      }
      if (this.savedPost.bloom) {
        post.configureEffect(
          ENGINE.PostProcessPass.Bloom,
          this.savedPost.bloom as Record<string, unknown>
        );
      }
      this.savedPost = null;
    }
    this.slowmoVeil?.remove();
    this.slowmoVeil = null;
  }

  // -- setup ------------------------------------------------------------------------------

  private buildCamera(): void {
    const world = this.state?.world;
    if (!world) return;
    /*
     * Orthographic and framed on the whole room. A perspective camera on a 2D plane gives
     * parallax between the near and far edges of a platform, which reads as the level being
     * subtly bent - the one artefact a side-on game cannot have.
     */
    const camera = ENGINE.ViewTargetCameraNode.create({
      name: 'M4SSCamera',
      fov: CAMERA_FOV,
      near: 0.1,
      far: CAMERA_BACK * 4,
      /*
       * Without this the node exists and the engine keeps rendering from its own camera -
       * which looks exactly like a broken scene rather than a missing flag. It is not enough
       * on its own though: the flag is read in the node's beginPlay, and a camera built
       * during the RIG's beginPlay is added after that moment has passed for it. So this is
       * a hint, and `keepActive` below is the guarantee.
       */
      startActive: true,
      position: place(world.width / 2, world.height / 2).setZ(CAMERA_BACK),
    });
    this.add(camera);
    this.camera = camera;
    this.keepActive();
    this.aim(
      place(world.width / 2, world.height / 2).setZ(CAMERA_BACK),
      place(world.width / 2, world.height / 2)
    );
  }

  /**
   * Make sure the engine is actually looking through our camera.
   *
   * `setActive` pushes onto the world's view-target stack and needs the node to be in a
   * world, which is not guaranteed at the moment we build it - and a camera that silently
   * fails to activate does not look like a missing camera. It looks like a camera in the
   * wrong place, because the engine quietly falls back to its own, which sits at the world
   * origin with a wider lens. That cost a long time to find: the readout said 12.8, -7.2,
   * 68.5 and was telling the truth about a camera nothing was rendering through.
   *
   * Checked every frame rather than once. It is a pointer comparison, and the alternative is
   * depending on an ordering that already surprised us once.
   */
  private keepActive(): void {
    if (!this.mounted) return;
    if (this.camera && !this.camera.isActive()) this.camera.setActive(true);
  }

  private buildLights(): void {
    const key = ENGINE.DirectionalLightNode.create({
      name: 'M4SSKey',
      /*
       * Position does not aim this light. `lookAt` does.
       *
       * LightNode.updateMatrixWorld builds the target from getWorldDirection() - the node's
       * ROTATION - and ignores where it sits, so an unrotated DirectionalLightNode fires
       * along one fixed axis no matter what you pass as `position`. Ours fired into the backs
       * of the tiles, and the symptom is the least helpful one available: not a wrong-looking
       * light but no light. Raising the intensity tenfold moved not one pixel, and cutting
       * the hemisphere fill to nothing turned the frame black - everything on screen up to
       * that point had been ambient. The engine's own comment on that method spells out that
       * position-then-lookAt is the supported way to aim one.
       *
       * Aimed so the front faces read brightest and the top faces clearly darker. Every tile
       * has had 60 units of depth this whole time and none of it was visible.
       */
      position: new THREE.Vector3(2.8, 1.8, 14.8),
      // Bright, because the scene's tone mapping runs at exposure 0.5 and this room has no
      // sky. Tuned by looking at it rather than by reasoning about it.
      intensity: 6.5,
      color: new THREE.Color('#ffe9c9'),
    });
    /*
     * The key casts now. M4SS is one room 26 units across, so a single orthographic map
     * covers all of it at useful density - the constraint that keeps the workstation key
     * from casting simply is not present here.
     *
     * Generous softness and a large normal bias, because this scene is flat-shaded low-poly
     * with big coplanar faces, which is the worst case for acne. See castShadows.
     */
    castShadows(key as unknown as THREE.Object3D, { extent: 20, mapSize: 2048, radius: 3.5, normalBias: 0.05 });
    this.add(key);
    // Must follow add(): lookAt resolves against the parent, and before it has one there is
    // nothing to resolve against.
    /*
     * lookAt takes a WORLD point, and `place` returns a rig-local one.
     *
     * Identical while the rig sits at the origin, which is where it was for the whole time
     * this light was being debugged. Opened from the globe it is parked well away from the
     * dioramas instead, and the same call would aim the key hundreds of units downwards at
     * nothing - relighting the room differently depending on how the player got into it.
     * The rig carries no rotation or scale of its own, so lifting the target into world
     * space is one addition.
     */
    const room = this.state?.world;
    if (room) {
      const target = this.getWorldPosition(new THREE.Vector3()).add(
        place(room.width / 2, room.height / 2)
      );
      key.lookAt(target);
    }

    this.add(
      ENGINE.HemisphereLightNode.create({
        name: 'M4SSFill',
        intensity: 3.4,
        color: new THREE.Color('#8ea6c8'),
        groundColor: new THREE.Color('#2a2140'),
      })
    );
  }

  /**
   * The room.
   *
   * Every mesh goes through decorMesh, which is not a style preference - it passes
   * `physicsOptions: { enabled: false }`. A MeshNode created without that gets physics by
   * default and falls, so the first version of this built the level correctly and then
   * dropped it out of frame while the camera watched. What that looks like is a dark plane
   * sloping across the screen, which reads as a broken camera and is not one.
   *
   * EVERY mesh here goes on `this.stage`, never on `this` - the stage is what carries SCALE
   * and the y-flip, so a node parented to the rig by mistake is not slightly wrong, it is
   * fifty times too big and upside down. The tiles were, and the result was a wall of colour
   * across the top of the frame that looked like a camera fault for a long time. The camera
   * and the lights are the only things that belong on the rig, because they work in metres.
   */
  /**
   * A stage-art material: unlit AND un-tone-mapped.
   *
   * `toneMapped: false` is the half of "don't light hand-drawn art twice" that got missed.
   * MeshBasicMaterial already skips the lighting model, so the surfaces were unlit - and then
   * every one of them went through the scene's ACES curve at exposure 0.5 anyway, which is a
   * second grade applied to art that was already graded when it was drawn. The audit found it
   * before the eye did: highlights 47 short of the reference and the value range at 57% of
   * it, which is precisely what a filmic shoulder does to art that is already in gamut.
   *
   * CRTSurface has always set this for the same reason. Every drawn surface in the stage now
   * goes through here so the next prop cannot quietly opt out of it.
   */
  private artMaterial(options: THREE.MeshBasicMaterialParameters): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({ toneMapped: false, ...options });
  }

  /**
   * The room, dressed.
   *
   * Every surface here used to be a flat-tinted box, which is what a greybox is for and is
   * not what this stage is any more. The geometry is unchanged - same tiles, same collision,
   * same swing arcs, every number the harness checks untouched - and everything visible is
   * now textured from the pixel-art generators in stageArt.ts.
   *
   * Materials are BASIC rather than standard. The stage has one directional key and a
   * hemisphere fill, tuned when the surfaces were flat colours; hand-drawn art already
   * contains its own light - the reference paints a lit top edge and shaded undersides
   * directly into the stone - and running it through a lighting model a second time only
   * takes the contrast back out. Unlit is how 2D art is meant to be shown.
   */
  private buildLevel(): void {
    const world = this.state?.world;
    if (!world) return;

    /*
     * The theme comes FIRST. Every texture below is drawn against the module palette, and
     * setStageTheme swaps that palette wholesale - so the one rule that keeps the two
     * stages from bleeding into each other is that nothing draws before this line.
     */
    this.theme = STAGE_THEMES[this.stageIndex] ?? THEME_GALLERY;
    setStageTheme(this.theme);

    this.buildBackdrop(world);

    /*
     * One stone texture, repeated per tile by size rather than stretched.
     *
     * A single texture stretched over a 420-wide platform and a 60-wide pillar gives them
     * visibly different stone, which reads as two materials. Setting the repeat from the
     * tile's own dimensions keeps the block size constant across the whole stage, so it all
     * reads as one quarry.
     */
    /*
     * DIRT, not stone, on the playtest's ask. The body of every mass is plain packed
     * earth; walked surfaces get a separate grass crown laid along their top edge (see
     * below), which is what "grass at the top, dirt below to blend it in" asks for and is
     * also far more robust than baking the grass into the tile texture - the crown sits at
     * the top edge whatever the tile's height, instead of being stretched by it.
     *
     * The boundary walls keep the old stone: they are the room's shell, not its ground,
     * and a wall of loose earth reads as a cave-in waiting to happen.
     */
    const dirtMap = dirtTexture(`m4ss-dirt-${this.theme.name}`, 128, 96, 'plain');
    const grassMap = dirtTexture(`m4ss-dirt-${this.theme.name}`, 128, 96, 'grass');
    const wallMap = wallTexture(`m4ss-stone-${this.theme.name}`);

    for (const t of world.tiles) {
      /*
       * WALL or FLOOR is a shape question: boundary slabs and tall masses stack, walked
       * surfaces spread. One texture for both was the playtest's complaint ("the tiles
       * for the ground and the walls are the same") and it was right - a room whose
       * ground and walls share a material has no gravity in its art.
       */
      /*
       * The ceiling counts as wall. It is 1280x60, so the shape test called it a floor and
       * dressed it in walked dirt - round clods hanging upside down over the whole room.
       * Nothing stands on the ceiling; it is shell, and shell wears masonry.
       */
      const isWall = t.h > t.w * 1.6 || t.y <= 0;
      const face = (isWall ? wallMap : dirtMap).clone();
      face.needsUpdate = true;
      /*
       * Repeats read off the TEXTURE rather than written as constants. The wall and the dirt
       * are different sizes now (256x192 against 128x96) and a hardcoded divisor is a silent
       * scale error the moment either changes - it stretches the pattern instead of tiling
       * it, which looks like a texture that is simply worse rather than one being misused.
       */
      const tileW = (face.image as HTMLCanvasElement).width;
      const tileH = (face.image as HTMLCanvasElement).height;
      face.repeat.set(t.w / tileW, t.h / tileH);
      /*
       * WORLD-ALIGNED offsets: the pattern's origin is the world's, not the tile's, so
       * two tiles that touch continue each other's blocks instead of restarting the
       * pattern at their own corner - which was the visible seam the playtest called
       * "not seamless". One texture, offset per tile, globally continuous.
       */
      face.offset.set((t.x % tileW) / tileW, 1 - ((t.y + t.h) % tileH) / tileH);
      /*
       * The slab behind the art is near-black SHADOW, not lit stone: the box's 3D side
       * faces were catching the camera's perspective and reading as "a flat 2D game with
       * a 3D background". Dark sides read as the shadow under an edge - depth without
       * the diorama look.
       */
      const node = decorMesh(
        'Tile',
        new THREE.BoxGeometry(t.w, t.h, 44),
        new THREE.MeshStandardMaterial({ color: new THREE.Color('#08100c'), roughness: 1 })
      );
      node.position.set(t.x + t.w / 2, t.y + t.h / 2, -24);
      const front = decorMesh(
        'TileFace',
        new THREE.PlaneGeometry(t.w, t.h),
        this.artMaterial({ map: face })
      );
      front.position.set(0, 0, 23);
      node.add(front);
      this.stage?.add(node);

      /*
       * The interior fade: lit at the walked edge, falling to dark below. A tall tile
       * repeating one 128x96 stone texture reads as wallpaper; the references light the
       * SURFACE of a mass and let its body go dark, so the eye gets a lit edge on
       * something solid instead of a patterned rectangle. Only tiles deep enough to have
       * an interior get one - a thin ledge is all surface.
       */
      /*
       * The grass crown: one strip of the grass variant along the top of every walked
       * surface, its own height regardless of how deep the mass below it is. Drawn just in
       * front of the tile face so its downward fringe of roots and moss tongues overlaps
       * the dirt and the two variants meet without a seam.
       */
      if (!isWall) {
        const crownH = 52;
        const crown = grassMap.clone();
        crown.needsUpdate = true;
        crown.repeat.set(t.w / 128, crownH / 96);
        // World-aligned in x so neighbouring tiles continue one run of turf; pinned to the
        // texture's own top in y, because the crown IS the top.
        crown.offset.set((t.x % 128) / 128, 1 - crownH / 96);
        const turf = decorMesh(
          'TileCrown',
          new THREE.PlaneGeometry(t.w, crownH),
          this.artMaterial({ map: crown, transparent: true, depthWrite: false })
        );
        /*
         * Lifted, so the wandering moss silhouette sits above the straight earth line rather
         * than being cut off by it - but by three pixels rather than nine.
         *
         * At nine the visible top of the world was nine pixels higher than the surface
         * anything actually stands on, and every creature in the game looked like it had
         * sunk into the turf. Three still gives the silhouette somewhere to wander without
         * moving the ground line the player reads.
         */
        /*
         * z 23.5 local, which is -0.5 in the world: in front of the tile face and BEHIND the
         * two things that now lie on the ground - the sill under a portal, and the creature's
         * trail. The grass used to sit at exactly 0, sharing a plane with the slime, and two
         * transparent surfaces at the same depth are drawn in whatever order they were built.
         */
        turf.position.set(0, -t.h / 2 + crownH / 2 - 3, 23.5);
        node.add(turf);
      }

      if (t.h > 120) {
        const fade = decorMesh(
          'TileFade',
          new THREE.PlaneGeometry(t.w, t.h - 36),
          this.artMaterial({ map: interiorFadeTexture(), transparent: true, depthWrite: false })
        );
        fade.position.set(t.x + t.w / 2, t.y + 36 + (t.h - 36) / 2, 0.4);
        this.stage?.add(fade);
      }

      /*
       * The broken corners are gone.
       *
       * They were meant to be chunks of stone calving off the end of a slab, and they were
       * never once drawn as that. The art is 92px tall and was hung at the slab's own top, so
       * on anything shallower than about 130 it stood proud of both faces and read as a grey
       * striped column bolted to each end - which a playtest called "those grey horizontal
       * lines on the side of the platform", and which a second playtest called by the same
       * name after the height guard was added to fix it.
       *
       * The guard was the mistake. It admitted slabs 92 to 199 deep, and there are exactly two
       * of those in the entire game - both in stage three, neither of them tall enough to
       * contain the cap. Stage one and stage two have none at all, so this decoration has
       * spent its whole life drawing nothing anywhere it was wanted and an artefact everywhere
       * it appeared. Deleting it costs two stages nothing and fixes the third.
       *
       * endCapTexture is left in stageArt: the generator is sound, it is the hanging that was
       * wrong, and a future edge treatment should start from it rather than from scratch.
       */

      /*
       * No vine curtain and no rubble lip any more.
       *
       * Three separate things used to be drawn at every top edge - a 54px curtain of
       * hanging strands, a 34px band of broken rubble, and the grass crown - and stacked
       * they made the dense green-at-the-top, grey-at-the-bottom beard the playtest asked
       * to have removed. One of them has to do the job, and the crown is the right one: it
       * is the only one that says GROUND rather than decoration.
       */
    }

    /*
     * A growth is a plant now, not a torus.
     *
     * The ring was a programmer's marker for "grabbable here" and it was doing two jobs -
     * saying where, and saying whether you can reach it, by turning red. Both survive: the
     * bush is placed at the anchor, and paintWorld tints the whole sprite rather than a ring,
     * so out-of-reach reads as the plant being drained of colour instead of a UI element
     * changing state. The core of the sprite is its brightest point, which keeps the actual
     * target unambiguous at a distance.
     */
    world.anchors.forEach((a, i) => {
      const node = decorMesh(
        'Growth',
        /*
         * NORMAL blending, because this is an OBJECT again.
         *
         * It went additive when the sprite was a soft falloff, and that was the right call
         * then - a glow composited normally paints semi-opaque green over the background
         * instead of adding light to it, which is why the first attempt showed two faint
         * smudges. But additive has no silhouette by construction: it can only ever
         * brighten what is behind it, so the darker outer bands of a banded sprite come
         * out as more light rather than as an edge.
         *
         * The growth is drawn in hard bands now, so it wants the opposite treatment: the
         * BODY composites normally and keeps its edge, and the additive halo hung behind
         * it does the glowing. That is how the backdrop lantern has always been built - a
         * small solid lamp inside a separate soft bloom - and it is why that lamp reads
         * crisp and lit at the same time.
         */
        // 104: a lantern, not a lamp-post. Small enough to be furniture in the room,
        // big enough that its pane is unmistakably the brightest green in it.
        new THREE.PlaneGeometry(104, 104),
        this.artMaterial({
          map: bushTexture(`growth-${i}`, 160, a.live === false),
          transparent: true,
          depthWrite: false,
        })
      );
      node.position.set(a.x, a.y, 20);
      this.stage?.add(node);
      this.anchorNodes.set(a, node);
      /*
       * A live growth carries its own PRESENCE - a dim constant halo in the slime's
       * green, well under the hover halo's brightness. The playtest said the growths
       * were "not noticeable", and it was right: the one thing the player must find to
       * play at all had less light than the decorative lanterns. Every glowing thing in
       * this palette speaks to the player; the growths now speak first.
       */
      /*
       * The halo is the size of the SWING it will give you.
       *
       * It was a fixed 200 across on every growth, and that was the fault behind "why is
       * the second growth's latch point higher". It is not higher - both anchors sit within
       * ten pixels of each other. The ropes differ: 120 on the first, 78 on the second,
       * because that second one is simultaneously fitting its sweep between a wall and a
       * pit, clearing the floor at the bottom of a revolution, and staying 14px out of
       * reach of a split body so the button is worth pressing.
       *
       * Every one of those numbers is defensible and none of them was VISIBLE. Two objects
       * drawn identically behaved differently, and the only way to find out which was which
       * was to hang off both. Sizing the halo to `rope * 2` makes it an honest picture of
       * the circle the body is about to travel - a short-roped growth now looks short before
       * it is committed to, and the ring that already appears in latch range confirms it.
       *
       * Falls back to the old 200 for a growth with no rope of its own, so nothing that
       * relies on the previous look silently loses its halo.
       */
      const halo = a.rope !== undefined ? a.rope * 2 : 200;
      const presence = decorMesh(
        'GrowthPresence',
        new THREE.PlaneGeometry(halo, halo),
        this.artMaterial({
          map: glowTexture('presence-glow', '#b9e86a'),
          transparent: true,
          opacity: a.live === false ? 0 : 0.42,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      presence.position.set(a.x, a.y, 16);
      this.stage?.add(presence);
      this.presenceNodes.set(a, presence);
      // Both sprites are generated up front, so waking a growth is a swap rather than a
      // canvas render in the frame the player presses the button.
      this.growthArt.set(a, {
        live: bushTexture(`growth-${i}`, 160, false),
        dead: bushTexture(`growth-${i}`, 160, true),
      });
      /*
       * A dead growth smoulders. The darker forest and the vignette cost the red plant
       * most of its pop - and it is the one object whose legibility is a MECHANIC (stage
       * two's second clause is telling red from green across a room). A dim ember-red
       * halo, additive, constant: not alive light, a warning light. Removed by the same
       * teardown as everything else, and left in place when the growth wakes because the
       * paintWorld pass hides it the frame `live` flips.
       */
      if (a.live === false) {
        const ember = decorMesh(
          'DeadEmber',
          new THREE.PlaneGeometry(190, 190),
          this.artMaterial({
            map: glowTexture('ember-glow', '#c4553f'),
            transparent: true,
            opacity: 0.4,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        ember.position.set(a.x, a.y, 17);
        this.stage?.add(ember);
        this.emberNodes.set(a, ember);
      }
    });

    /*
     * The gate, and the button that lifts it.
     *
     * Biomass used to be here - yellow pellets that raised your mass when you touched them.
     * They are gone, and with them the idea that mass is something you accumulate. Nothing in
     * this stage can be gained: the mass you finish with is the mass you started with minus
     * whatever the pit tore off, which is what makes leaving some of it behind a decision
     * rather than an errand.
     */
    /*
     * Gates were the last flat-tinted primitives in the stage - a #8c5a4a box that
     * outlived the greybox it came from. Each keeps a dark depth box (the door has
     * thickness, and the sides read while it slides) and wears a DRAWN face: rusted
     * plates on the stage's rust ramp, rivets, a hazard band low down, moss claiming the
     * foot - every man-made thing here is losing to the growth, and a clean door would
     * read newer than the room it locks. The face is a child of the slab, so lift and
     * fall carry the art with them.
     */
    world.gates.forEach((gate, i) => {
      const node = decorMesh(
        'Gate',
        new THREE.BoxGeometry(gate.w, gate.h, 54),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color('#4a3128'),
          roughness: 0.85,
          emissive: new THREE.Color('#140b08'),
        })
      );
      node.position.set(gate.x + gate.w / 2, gate.y + gate.h / 2, -28);
      const face = decorMesh(
        'GateFace',
        new THREE.PlaneGeometry(gate.w, gate.h),
        this.artMaterial({ map: gateTexture(`gate-${i}`, gate.w, gate.h), transparent: true })
      );
      face.position.set(0, 0, 29);
      node.add(face);
      this.stage?.add(node);
      this.gateNodes.push({ node, gate, restY: gate.y + gate.h / 2 });

      /*
       * The grate across a sieve's gap. The fiction says "containment grate" and the HUD
       * says "too big for the gap", but the opening itself was an empty dark rectangle -
       * the rule was enforced invisibly. Three rusted bars say both halves at a glance.
       * Static, and NOT parented to the gate node: the grate belongs to the doorway, and
       * the sim already lets legal bodies pass straight through the bars.
       */
      if (gate.sieve !== undefined) {
        const gapTop = gate.y + gate.h;
        const gapH = world.height - gapTop < 200 ? 30 : 30;
        const grate = decorMesh(
          'SieveGrate',
          new THREE.PlaneGeometry(gate.w, gapH),
          this.artMaterial({
            map: grateTexture(`grate-${gate.id ?? gate.x}`, gate.w, gapH),
            transparent: true,
            depthWrite: false,
          })
        );
        grate.position.set(gate.x + gate.w / 2, gapTop + gapH / 2, -2);
        this.stage?.add(grate);
      }
    });

    /*
     * The presses.
     *
     * Deliberately the least organic thing in either stage: flat, cold, and a hue nothing
     * else in the room uses. Everything here that can be interacted with is a plant or is
     * warm; the one thing that can take mass off you should not look like it grew.
     */
    for (const crusher of world.crushers ?? []) {
      /*
       * The press is DRAWN now, not tinted. It was a flat grey box from the greybox
       * onward - the one object in the room that can take something off the player, and
       * the only one that still looked unfinished. See pressTexture.
       *
       * The body behind the art stays near-black like every other solid here, so its 3D
       * sides never catch the camera; the machine lives on the front plane.
       */
      const node = decorMesh(
        'Crusher',
        new THREE.BoxGeometry(crusher.w, crusher.h, 60),
        new THREE.MeshStandardMaterial({ color: new THREE.Color('#0a0f12'), roughness: 1 })
      );
      const face = decorMesh(
        'CrusherFace',
        new THREE.PlaneGeometry(crusher.w, crusher.h),
        this.artMaterial({
          map: pressTexture(`press-${crusher.x}`, crusher.w, crusher.h),
          transparent: true,
        })
      );
      face.position.set(0, 0, 31);
      node.add(face);
      node.position.set(crusher.x + crusher.w / 2, crusher.y + crusher.h / 2, -20);
      this.stage?.add(node);
      this.crusherNodes.push({ node, crusher, prevAt: crusher.at });
    }

    /*
     * The columns of air.
     *
     * Two pieces, because a force with no source is the fault the warehouse's fluorescents
     * shipped with: an intake plate set into the floor where the air comes from, and the strip
     * of rising motes above it. The strip sits at z -8 - behind the player, in front of the
     * scenery - so the body is IN the column rather than behind a pane of it, and the intake
     * goes at -14 so the plate reads as recessed into the floor rather than stuck onto it.
     *
     * The map repeats vertically at its authored height, which is what lets one 160x320 canvas
     * cover eight hundred pixels of shaft and scroll for ever without a seam.
     */
    for (const draft of world.updrafts ?? []) {
      /*
       * The vent is a FITTING, not a floor panel.
       *
       * It used to be drawn the full width of the column and forty tall - four to one, which
       * is the exact proportion of a door lying on its side, and that is what the playtest
       * called it: "the door for the fan is stretched wide". Ninety by sixty matches the
       * bulkhead and the grate, so the three pieces of machinery in this bay are the same
       * kind of object.
       *
       * Narrower than the column it feeds, deliberately. Air leaves a duct and spreads; a
       * vent as wide as its own plume reads as the floor having a hole in it.
       */
      const intakeW = 90;
      const intakeH = 60;
      const intake = decorMesh(
        'DraughtIntake',
        new THREE.PlaneGeometry(intakeW, intakeH),
        this.artMaterial({
          map: intakeTexture(`intake-${draft.x}`, intakeW, intakeH),
          transparent: true,
        })
      );
      intake.position.set(draft.x + draft.w / 2, draft.y + draft.h - intakeH / 2, -14);
      this.stage?.add(intake);

      const map = draughtTexture(`draught-${draft.x}`, 160, 320);
      map.repeat.set(1, draft.h / 320);
      const face = decorMesh(
        'Draught',
        new THREE.PlaneGeometry(draft.w, draft.h),
        this.artMaterial({
          map,
          transparent: true,
          opacity: 0.7,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      face.position.set(draft.x + draft.w / 2, draft.y + draft.h / 2, -8);
      this.stage?.add(face);
      this.draughtNodes.push({ face, map, draft, glow: 0 });
    }

    /*
     * The critters.
     *
     * z -6 puts the creature BEHIND the player and in front of the scenery. It is the one
     * placement that cannot go wrong in the moment that matters: at the instant of contact
     * the two are overlapping, and a hazard drawn over the top of the player hides the exact
     * thing the player is trying to read.
     *
     * The plane is the sprite's own size, one texel per world pixel, so the creature is
     * drawn at the resolution it was baked at rather than scaled to a guess.
     */
    for (const critter of world.critters ?? []) {
      const sprite = sporelingSprite();
      sprite.draw(0);
      const node = decorMesh(
        'Sporeling',
        new THREE.PlaneGeometry(SPORELING_W, SPORELING_H),
        this.artMaterial({ map: sprite.texture, transparent: true, depthWrite: false })
      );
      node.position.set(critter.x, critter.y - SPORELING_H / 2, -6);
      this.stage?.add(node);
      this.critterNodes.push({ node, critter, sprite });
    }

    /*
     * Floor props: ferns and mushroom clusters scattered on the walkable tops, seeded per
     * stage. The platforms were corridors between the things that matter; the reference
     * fills its walking surfaces with small life that asks for nothing. Placement is
     * derived, not authored: every wide floor top gets a few, spaced by seed, skipping the
     * first metre of each tile so they never crowd a button or a landing lip.
     */
    {
      const rng = ((seed: number) => () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      })(world.width + world.height * 7);
      let planted = 0;
      for (const tile of world.tiles) {
        if (tile.w < 160 || tile.y < 100) continue;
        /*
         * A platform with something living on it gets no scatter.
         *
         * The first capture of the sporeling's ledge had one of these clusters standing a
         * body-width from the creature, in the same accent purple, and at playing size the
         * two were indistinguishable - the decoration read as a second sporeling that never
         * moved. Anywhere the player has to watch a shape to survive, no other shape of that
         * shape's colour may stand.
         */
        if ((world.critters ?? []).some((c) => c.y === tile.y)) continue;
        const count = Math.floor(tile.w / 140);
        for (let i = 0; i < count && planted < 22; i++) {
          const px = tile.x + 40 + ((i + 0.3 + rng() * 0.5) / count) * (tile.w - 80);
          const kind = rng() > 0.45 ? 'fern' : 'shroom';
          // 62px, up from 44: at 44 the playtest could not find them at all. Decoration
          // that needs pointing out is not decorating anything.
          const node = decorMesh(
            'FloorProp',
            new THREE.PlaneGeometry(62, 62),
            this.artMaterial({
              map: propTexture(`prop-${planted}`, kind as 'fern' | 'shroom'),
              transparent: true,
              depthWrite: false,
            })
          );
          node.position.set(px, tile.y - 27, 12);
          this.stage?.add(node);
          planted += 1;
        }
      }
    }

    /*
     * LIGHT THAT LANDS.
     *
     * The single biggest reason the stage read as "a bunch of assets" rather than as a
     * place: every light source in it lit only itself. Lanterns glowed, god rays fell,
     * and the ground under both was exactly as dark as the ground anywhere else - so
     * nothing in the room was related to anything else. In the games this is measured
     * against, light is the thing that ties a frame together: it comes from somewhere,
     * it falls on something, and the floor tells you where the windows are.
     *
     * So every lantern now throws a pool onto the floor below it, and the god rays land
     * in cool pools of their own. Additive ellipses on the walked surface, sized by how
     * far the light has fallen, so a high lantern spreads wide and dim and a low one
     * pools tight and bright.
     */
    {
      const floorY = world.tiles.reduce(
        (best, t) => (t.h < 400 && t.y > 100 && t.y < best ? t.y : best),
        world.height
      );
      const pools: Array<{ x: number; warm: boolean }> = this.lanternXs.map((x) => ({
        x,
        warm: true,
      }));
      // Two cool pools where the shafts come down, placed off the level's own thirds so
      // they never land in the same place as a lantern.
      pools.push({ x: world.width * 0.36, warm: false });
      pools.push({ x: world.width * 0.72, warm: false });

      for (const pool of pools) {
        if (pool.x < -100 || pool.x > world.width + 100) continue;
        // Is there floor under this light at all? A pool hanging over a pit is worse than
        // no pool: it lights the air above a hole.
        const under = world.tiles.find(
          (t) => t.h < 400 && t.y > 100 && pool.x > t.x + 20 && pool.x < t.x + t.w - 20
        );
        if (!under) continue;
        const glow = decorMesh(
          'FloorPool',
          new THREE.PlaneGeometry(pool.warm ? 420 : 340, pool.warm ? 150 : 120),
          this.artMaterial({
            map: glowTexture(pool.warm ? 'pool-warm' : 'pool-cool', pool.warm ? PAL.lampWarm : PAL.hazeNear),
            transparent: true,
            opacity: pool.warm ? 0.3 : 0.22,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        glow.position.set(pool.x, under.y + 4, 7);
        this.stage?.add(glow);
      }
      void floorY;
    }

    /*
     * THE GROWTHS HANG FROM SOMETHING.
     *
     * They used to float at mid-height with nothing above them, which is the other half
     * of the diagram problem: an object with no support is a game token, not a thing in a
     * room. Each one now carries a strand running up out of the top of the frame - the
     * cultivated tendril it grew down from, which is what the fiction says it is anyway.
     * Behind the play plane so it never crosses the player, and dark, so it reads as
     * structure rather than as another glowing thing to look at.
     */
    for (const a of world.anchors) {
      const strand = decorMesh(
        'GrowthStalk',
        new THREE.PlaneGeometry(7, a.y),
        this.artMaterial({
          map: vineTexture(`stalk-${a.x}`),
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
        })
      );
      strand.position.set(a.x, a.y / 2, -12);
      this.stage?.add(strand);
    }

    /*
     * THE FRAME CLOSES AT THE BOTTOM.
     *
     * The top of the view has had a canopy since pass 25 and the corners have had a
     * vignette, but the bottom ran clean off the screen - so the camera sat outside the
     * room looking in at a strip of floor. A dark bank of earth across the very bottom,
     * IN FRONT of the play plane, puts the camera inside the room: the near ground rises
     * between you and the floor, exactly as the references frame their own.
     *
     * It sits below the walk line by construction (the tiles' top edge is the walk line
     * and this starts well beneath it), so it can never hide the player.
     */
    {
      const bankTop = world.height - 46;
      const bank = decorMesh(
        'NearBank',
        new THREE.PlaneGeometry(world.width * 1.4, 120),
        this.artMaterial({
          map: occluderTexture(`bank-${this.theme.name}`, 'leaves', 1280, 120),
          transparent: true,
          depthWrite: false,
        })
      );
      // Flipped, so the ragged edge faces UP out of the bottom of the frame.
      bank.scale.set(1, -1, 1);
      bank.position.set(world.width / 2, bankTop + 60, 68);
      this.stage?.add(bank);
    }

    /*
     * THE DEPTH FOG - and why the first attempt at this was backwards.
     *
     * Separating the background from the play plane was the right goal and a dark scrim
     * was the wrong instrument. Darkening pushes everything toward black, which does
     * reduce the background's contrast, but it also drags the whole frame down and takes
     * the light out of anything glowing behind it - the growths went dull the moment it
     * went in.
     *
     * Distance does not make things darker. It makes them LIGHTER, flatter and closer to
     * the colour of the air, because there is more air in the way scattering light into
     * the line of sight - which is why every distant hill is pale blue and why the
     * reference's greenhouse glows pale teal behind a foreground of near-black stone.
     * That is aerial perspective, and a fog plane is how you buy it: normal blending
     * toward a pale haze colour lifts the background's blacks toward mid-tone while
     * barely touching its highlights, so the layers behind it lose their CONTRAST rather
     * than their light.
     *
     * The play plane keeps its full range and is now the darkest, most saturated thing in
     * the frame - which is exactly the relationship the reference has, and the one that
     * makes a platform read as standable at a glance.
     *
     * At z -50: in front of the rays, the haze, the forest, the architecture and the
     * backdrop; behind the tiles, whose bodies start at -46.
     */
    {
      const fog = decorMesh(
        'DepthFog',
        new THREE.PlaneGeometry(world.width * 2, world.height * 2),
        this.artMaterial({
          color: new THREE.Color(this.theme.fog),
          transparent: true,
          // 0.35: enough haze to sink the background a full step behind the play plane,
          // little enough that the forest keeps its shapes. 0.46 separated the layers and
          // flattened the midground into one wash doing it.
          opacity: 0.35,
          depthWrite: false,
        })
      );
      fog.position.set(world.width / 2, world.height / 2, -50);
      this.stage?.add(fog);
    }

    /*
     * The latch ring, parked off screen until a growth is in range. One sprite reused for
     * whichever growth is currently the target - there is only ever one.
     */
    this.latchRing = decorMesh(
      'LatchRing',
      /*
       * 84 across. The ring is now barely wider than the lantern it marks, which is the
       * point: at every larger size it was drawing a circle in the ROOM, and the eye
       * reads a circle in a room as a place rather than as a label. Hugging the object,
       * it stops being scenery and becomes punctuation.
       *
       * The band thins with it - it is a fraction of the texture, and the texture is
       * being displayed smaller - which is the right direction anyway. A hairline that
       * pulses is easier to ignore until you want it than a stroke that sits there.
       */
      new THREE.PlaneGeometry(84, 84),
      this.artMaterial({
        map: ringTexture(128),
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
      })
    );
    this.latchRing.position.set(-999, -999, 22);
    this.latchRing.visible = false;
    this.stage?.add(this.latchRing);

    /*
     * Flies. Four motes orbiting every live growth on their own ellipse, at their own
     * speed and phase.
     *
     * These are the motes that were deleted from glowTexture, given back their movement.
     * The complaint about them was never that the stage had specks in it - it was that
     * the specks were STATIC, painted into a sprite, stuck to the creature like dirt on
     * the lens. Orbiting a light, they read as the thing insects do around a lamp at
     * night, which is exactly the image the growth is now built from.
     */
    for (const a of world.anchors) {
      for (let i = 0; i < 4; i++) {
        const node = decorMesh(
          'GrowthFly',
          new THREE.PlaneGeometry(5, 5),
          this.artMaterial({
            // Yellow, not yellow-green: these are the flies around a lit lantern, and a
            // warm mote against the lamp's lemon pane reads as an insect catching the
            // light rather than as another piece of the plant.
            map: moteTexture('#f2d75c'),
            transparent: true,
            opacity: 0.85,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        node.position.set(a.x, a.y, 21);
        this.stage?.add(node);
        this.flies.push({
          node,
          anchor: a,
          radius: 26 + i * 7,
          speed: 0.5 + i * 0.23,
          phase: i * 1.7 + a.x * 0.01,
          squash: 0.45 + i * 0.12,
        });
      }
    }

    /*
     * The air, as real particles.
     *
     * Restored on the playtest's ask, and deliberately BEHIND the play plane (z -18) so
     * they can never sit on the creature - that is the whole difference between air and
     * the dead pixels that got deleted twice. Each mote drifts on its own vector with a
     * slow sine wobble across it, and wraps when it leaves the level, so the room always
     * has the same amount of life in it without anything being spawned or destroyed.
     */
    {
      const seedRng = ((seed: number) => () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      })(world.width * 31 + world.height);
      const count = 46;
      const mote = moteTexture(this.theme.mote);
      for (let i = 0; i < count; i++) {
        const size = seedRng() > 0.75 ? 5 : 3;
        const node = decorMesh(
          'AirMote',
          new THREE.PlaneGeometry(size, size),
          this.artMaterial({
            map: mote,
            transparent: true,
            opacity: 0.2 + seedRng() * 0.3,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        node.position.set(seedRng() * world.width, seedRng() * world.height, -18);
        this.stage?.add(node);
        this.airMotes.push({
          node,
          vx: (seedRng() - 0.35) * 9,
          vy: -4 - seedRng() * 9,
          wobble: 4 + seedRng() * 9,
          phase: seedRng() * Math.PI * 2,
        });
      }
    }

    /*
     * SET DRESSING WITH SCALE, and why these four and not more of the small stuff.
     *
     * The stage already had small mushrooms and ferns on its ledges, and the eye walks
     * straight past them - they are texture, not objects. What a room this size was
     * missing is things with SIZE in them, because size is the only way a frame tells you
     * how big the creature is. Everything below is placed from the level's own geometry
     * rather than authored per stage, so it lands correctly in both.
     *
     * Deliberately sparse. Two giant mushrooms, one ribcage, a few vines, three
     * foreground trees: a room with an object in it reads as a place, and a room with
     * twenty reads as a shop.
     */
    {
      const rng = ((seed: number) => () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      })(Math.round(world.width * 13 + world.height * 7));

      // The widest walked surfaces, which is where furniture belongs.
      const floors = world.tiles
        .filter((t) => t.w >= 260 && t.y > 120 && t.h < 400)
        .sort((a, b) => b.w - a.w);

      /*
       * Giant mushrooms, standing on the ground with their caps up in the play space.
       * Placed a third and two thirds along a floor so they never sit under a growth or
       * on top of the spot a swing lands.
       */
      /*
       * A level that has been laid out AROUND a mushroom gets to say where it stands.
       *
       * The derived placement below is right for scenery and wrong the moment a platform is
       * described in relation to one - stage two's ledge is "above and left of the first
       * mushroom", and if that mushroom is chosen by sorting floors on width then the
       * composition depends on a tile-width tie-break. Where landmarks are declared they
       * replace the scatter entirely rather than adding to it.
       */
      const spots = world.landmarks
        ? world.landmarks.map((l) => ({ x: l.x, y: l.y, size: l.size ?? 150 }))
        : floors.slice(0, 2).map((tile, i) => ({
            x: tile.x + tile.w * (i === 0 ? 0.34 : 0.68),
            y: tile.y,
            size: 150 + Math.round(rng() * 40),
          }));
      spots.forEach((spot, i) => {
        const size = spot.size;
        const tile = { x: spot.x, y: spot.y };
        const at = spot.x;
        const shroom = decorMesh(
          'GiantShroom',
          new THREE.PlaneGeometry(size, size * 1.13),
          this.artMaterial({
            map: bigShroomTexture(`shroom-${Math.round(tile.x)}-${i}`),
            transparent: true,
            depthWrite: false,
          })
        );
        // z -16: behind the play plane, in front of the fog, so it is scenery the player
        // walks past rather than scenery the player walks into.
        shroom.position.set(at, tile.y - (size * 1.13) / 2 + 6, -16);
        this.stage?.add(shroom);
      });

      /*
       * The ribcage, half-buried in the widest floor. Bone is nearly the palest thing in
       * the level, so it goes low and behind, where it reads as something the ground has
       * been keeping rather than as a prop set on top of it.
       */
      if (floors.length > 0) {
        const tile = floors[0];
        const bones = decorMesh(
          'Bones',
          new THREE.PlaneGeometry(210, 90),
          this.artMaterial({
            map: bonesTexture(`bones-${tile.x}`),
            transparent: true,
            depthWrite: false,
          })
        );
        bones.position.set(tile.x + tile.w * 0.52, tile.y - 30, -14);
        this.stage?.add(bones);
      }

      /*
       * Containment vessels, standing on the wide floors.
       *
       * M4SS-ART-BIBLE §2 asks for these off both gameplay references and ends the note with
       * "we have no vessels anywhere", which was true of all three stages.
       *
       * All three is where they go, and this block is not stage-gated. The reference draws
       * them as the lab's purpose made visible, which is stage one's job; the Sluice earns
       * them for a different reason, which is that the specimen is forty units of something
       * that was supposed to stay in a tank and this is where it went. A row of tanks it is
       * not in tells that without a line of dialogue.
       *
       * Two spent to one full, deliberately. A facility of intact vessels reads as a working
       * lab; this one stopped working eleven days ago, and the single lit one is there to say
       * what the others used to look like.
       *
       * Same z as the giant mushrooms - behind the play plane, in front of the fog - so they
       * are scenery the player walks PAST. In front of it they would be obstacles the
       * collision map does not know about, which is the worst kind of prop.
       */
      floors.slice(0, 3).forEach((tile, i) => {
        const tall = 96 + Math.round(rng() * 26);
        const vessel = decorMesh(
          'Vessel',
          new THREE.PlaneGeometry(tall * 0.5625, tall),
          this.artMaterial({
            map: vesselTexture(`vessel-${Math.round(tile.x)}-${i}`, i !== 1),
            transparent: true,
            depthWrite: false,
          })
        );
        // Off the tile's centre, and a different fraction each time: three props sharing one
        // offset reads as a repeated stamp however different the textures are.
        vessel.position.set(tile.x + tile.w * (0.18 + i * 0.24), tile.y - tall / 2 + 4, -15);
        this.stage?.add(vessel);
      });

      /*
       * Leafy vines hanging from the undersides of high ledges - the thing the old vine
       * curtain was reaching for before it was cut for being a beard along every edge.
       * Three of them, on the highest surfaces, where they hang into open air.
       */
      const high = world.tiles
        .filter((t) => t.w >= 150 && t.y > 60 && t.y < world.height * 0.75 && t.h < 400)
        .slice(0, 3);
      high.forEach((tile, i) => {
        const vine = decorMesh(
          'LeafVine',
          new THREE.PlaneGeometry(46, 200),
          this.artMaterial({
            map: leafVineTexture(`leafvine-${tile.x}-${i}`),
            transparent: true,
            depthWrite: false,
          })
        );
        vine.position.set(tile.x + tile.w * (0.2 + i * 0.3), tile.y + 100, -10);
        this.stage?.add(vine);
      });

      /*
       * Dead trees in the FOREGROUND, at z 72 - in front of everything, including the
       * player. Near-black silhouettes whose whole job is to frame the shot and to slide
       * across it as the camera moves; bare branches make a broken, legible edge where a
       * leafy crown would make a blob. Kept to the sides so nothing ever stands between
       * the camera and the creature for long.
       */
      const treeAt = [world.width * 0.06, world.width * 0.63, world.width * 0.97];
      treeAt.forEach((x, i) => {
        const tall = 380 + Math.round(rng() * 120);
        const tree = decorMesh(
          'DeadTree',
          new THREE.PlaneGeometry(tall * 0.52, tall),
          this.artMaterial({
            map: deadTreeTexture(`deadtree-${i}`),
            transparent: true,
            depthWrite: false,
          })
        );
        tree.position.set(x, world.height - tall / 2 + 40, 72);
        // Mirror every second tree: with the trunk lean this doubles the silhouette pool.
        if (i % 2 === 1) tree.scale.x = -1;
        this.stage?.add(tree);
      });
    }

    /*
     * The acid at the bottom of every pit.
     *
     * One bath spanning the world, sitting BEHIND the floor masses (z -6, against tile art
     * at about -1), so it is invisible except through the gaps between them - which is
     * exactly where a pit is. The playtest asked for "a layer of green/acidic water in the
     * pit", and it does more than decorate: a hole in the floor now reads as a thing to
     * avoid rather than as an absence of floor. Its own glow sits in front of it so the
     * surface throws light up into the gap.
     *
     * Purely visual. The pit's kill plane is the sim's, far below this, and untouched.
     */
    {
      // The surface sits just under the floor line, so the lit meniscus is the first thing
      // visible in the mouth of a pit and the throat below it goes dark.
      /*
       * DEEPER. At 92 the meniscus sat eight pixels under the floor line and the pits
       * read as bright slabs continuing the ground rather than as holes with something
       * at the bottom of them - the first live capture of the rework showed one unbroken
       * floor across the whole screen. A pit needs dark between its lip and its liquid.
       */
      const surfaceY = world.height - 48;
      const bath = decorMesh(
        'Acid',
        new THREE.PlaneGeometry(world.width * 1.2, 150),
        this.artMaterial({ map: acidTexture(`acid-${this.theme.name}`, 256, 128) })
      );
      bath.position.set(world.width / 2, surfaceY + 62, -6);
      this.stage?.add(bath);

      const fumes = decorMesh(
        'AcidGlow',
        new THREE.PlaneGeometry(world.width * 1.2, 190),
        this.artMaterial({
          map: glowTexture('acid-glow', PAL.mossLit),
          transparent: true,
          opacity: 0.22,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      fumes.position.set(world.width / 2, surfaceY, -5);
      this.stage?.add(fumes);
    }

    /*
     * THE STANDING WATER, AND WHY IT IS TWO PLANES.
     *
     * The bible asks for water because of what water DOES: "standing water reflects each
     * glow as a vertical smear", which doubles the number of light sources in the frame
     * for the price of one plane and without lifting the background a single value. The
     * sump is the one room in the game that has to have it - it is the bottom of a machine
     * that pumped culture medium, and everything that ever leaked ended up here.
     *
     * The sheet's PLACE is derived from the level (the lowest wide walked floor, because
     * that is where water goes) and its DEPTH comes from the theme (see StageTheme.water),
     * which is the split this file already uses for the mushrooms: geometry is the level's
     * business, and how wet the world is, is the place's.
     *
     * Two planes because the doubling has to be real light. The surface is a normal-blended
     * wet film, so the floor's dirt and moss still read through the shallows; the glint is
     * the same reflections additively on top, so a growth hanging over the sump genuinely
     * puts a second green into the frame rather than a painted picture of one.
     *
     * Painted at build time: a growth that wakes later keeps the ember reflection it was
     * given. That is a static sheet's one lie and it is a cheap one - the dead growths in
     * this stage are woken from a plate the player reaches after leaving the sump.
     */
    if (this.theme.water > 0) {
      // The same floor test the lantern pools use, plus a width bound: a sheet of water on
      // a 60px pillar top is a puddle nobody can see, and it would reflect nothing.
      const walked = world.tiles.filter((t) => t.h < 400 && t.y > 100 && t.w > 200);
      const lowest = walked.reduce((deepest, t) => Math.max(deepest, t.y), 0);
      for (const floor of walked) {
        // Within 12px of the deepest floor: water runs downhill, so anything measurably
        // higher than the sump is dry no matter how wide it is.
        if (floor.y < lowest - 12) continue;

        /*
         * What is standing over this sheet. Reach is capped at 760px - a light further up
         * than that is behind the haze and its reflection would be a stripe with no visible
         * parent, which reads as a paint smear rather than as light.
         */
        const lights: WaterLight[] = [];
        const fallOff = (fall: number): number => (1 - fall / 760) ** 0.7;
        const over = (x: number): boolean => x > floor.x - 40 && x < floor.x + floor.w + 40;
        for (const a of world.anchors) {
          const fall = floor.y - a.y;
          if (!over(a.x) || fall <= 0 || fall > 760) continue;
          lights.push({
            u: (a.x - floor.x) / floor.w,
            // A live culture is the stage's green; a dead one is the ember the bible gives
            // it, at well under half strength, because a dormant growth is barely alight.
            colour: a.live === false ? PAL.rustLit : PAL.slime,
            strength: (a.live === false ? 0.4 : 1) * fallOff(fall),
          });
        }
        for (const b of world.buttons) {
          const fall = floor.y - b.y;
          if (!over(b.x) || fall <= 0 || fall > 760) continue;
          lights.push({ u: (b.x - floor.x) / floor.w, colour: PAL.lampWarm, strength: 0.55 * fallOff(fall) });
        }
        // The background lanterns, faintly. They are a long way behind the sheet, so what
        // they contribute is one warm column against a cluster of green ones - which is the
        // only warm/cool break the bottom of this stage has.
        for (const lx of this.lanternXs) {
          if (!over(lx)) continue;
          lights.push({ u: (lx - floor.x) / floor.w, colour: PAL.lampWarm, strength: 0.3 });
        }

        const depth = this.theme.water;
        const texW = Math.max(64, Math.min(1400, Math.round(floor.w)));
        /*
         * The sheet starts 2px below the tile's top edge, and the texture keeps another six
         * clear above its own waterline - so the moss lip along the floor's crown still
         * reads ABOVE the water. Drowning the lit lip would break the one rule the bible
         * repeats about every walkable surface in the stage.
         */
        const surfaceTop = floor.y + 2;
        // z -0.45 and -0.35: in front of the tile face (-1) and its grass crown (-0.5),
        // behind the portal sill, the creature's trail and the creature itself.
        const wet = decorMesh(
          'StandingWater',
          new THREE.PlaneGeometry(floor.w, depth),
          this.artMaterial({
            map: waterTexture(`water-${this.theme.name}-${floor.x}`, lights, texW, depth, 'surface'),
            transparent: true,
            depthWrite: false,
          })
        );
        wet.position.set(floor.x + floor.w / 2, surfaceTop + depth / 2, -0.45);
        this.stage?.add(wet);

        const glints = decorMesh(
          'WaterGlint',
          new THREE.PlaneGeometry(floor.w, depth),
          this.artMaterial({
            map: waterTexture(`water-${this.theme.name}-${floor.x}`, lights, texW, depth, 'glint'),
            transparent: true,
            opacity: 0.55,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        glints.position.set(floor.x + floor.w / 2, surfaceTop + depth / 2, -0.35);
        this.stage?.add(glints);
      }
    }

    /*
     * The hover halo: one additive glow sprite, parked invisible, moved behind whichever
     * reachable growth the pointer is over. The old hover feedback was a tint two steps
     * paler than the in-reach tint and a scale of 1.08 - measurably present, visibly
     * nothing, and reported as "hovering does not glow". A glow is a THING BEHIND the
     * plant, not a property of its pixels: same additive sprite family as the lanterns
     * and the portal bleed, in the slime's own green, so what it says is "yours".
     */
    this.hoverHalo = decorMesh(
      'HoverHalo',
      new THREE.PlaneGeometry(210, 210),
      this.artMaterial({
        map: glowTexture('hover-glow', '#9ff0b0'),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.hoverHalo.position.set(-500, -500, 18);
    this.stage?.add(this.hoverHalo);

    /*
     * The wall stencils. Sized from the texture's own aspect so the pixels stay square -
     * a stretched stencil reads as a decal, a square-pixel one reads as paint.
     */
    /*
     * The tutorial text is DOM now, in the game's own font, on a translucent plate.
     *
     * It used to be a canvas sprite drawn from the console's 3x5 pixel font and mapped
     * onto a plane in the scene. That bought a real thing - the text lived IN the room
     * rather than on Keller's software - and it cost more than it bought: at three pixels
     * wide `M`, `N` and `W` are within one row of each other (W is 101/101/111/111/101 and
     * M is 101/111/111/101/101), so WHEN rendered as something closer to NHEN, and an
     * earlier pass had already reworded signs to dodge the letter M rather than admit the
     * font could not carry them. Instructions are the one thing in a game that must be
     * unambiguous.
     *
     * So the letterforms come from the font the rest of the game is written in, and the
     * plate is a real translucent panel with real rounded corners rather than corner-cut
     * rectangles faked on a canvas. Positioned by projecting the sign's WORLD point into
     * the container every frame (see placeSigns), so it still belongs to the place it is
     * describing and would follow a scrolling camera if stage two ever gets signs.
     */
    const container = this.getWorld()?.gameContainer;
    if (container) {
      (world.signs ?? []).forEach((sign) => {
        const label = document.createElement('div');
        label.style.cssText = [
          'position:absolute',
          'transform:translate(-50%,-50%)',
          'padding:7px 11px',
          'border-radius:9px',
          'background:rgba(7,14,11,0.72)',
          'border:1px solid rgba(150,190,160,0.16)',
          'color:#cbe3c4',
          'font:13px/1.45 "Courier New",monospace',
          'letter-spacing:2px',
          'text-align:center',
          'white-space:pre',
          'pointer-events:none',
          'text-shadow:0 1px 2px rgba(0,0,0,0.75)',
          'z-index:12',
          'transition:opacity 220ms ease,transform 220ms ease',
        ].join(';');
        // textContent, never innerHTML: these strings are authored here today, and the
        // habit is what keeps a player-supplied one from ever becoming markup.
        label.textContent = sign.lines.join('\n');
        container.appendChild(label);
        const words = sign.lines.join(' ').toUpperCase();
        const action: TutorialAction = words.includes('A D')
          ? 'move'
          : words.includes('CLICK')
            ? 'target'
            : words.includes('SPACE')
              ? 'split'
              : 'recall';
        this.signLabels.push({ el: label, x: sign.x, y: sign.y, action });
      });
    }

    /*
     * The button was the other survivor: an orange cylinder. It is a pressure plate now -
     * a stone anvil the floor owns, capped with a dome of the stage's lamp colour, the one
     * hue reserved for man-made light. The read at distance is "warm, wants weight". The
     * press animation sinks the whole sprite into its socket, so the art needs no second
     * state.
     */
    world.buttons.forEach((button, i) => {
      // The decor plane grew with the redraw - the LOGIC radius is untouched, this is
      // the picture of the plate, not its pressure zone.
      /*
       * A wall button is a different object from a floor plate, and drawn as one: a floor
       * plate says STAND ON ME, a striker on a bulkhead says HIT ME, and stage two's last
       * clause is a thing you hit with a flung body.
       */
      const node = button.vertical
        ? decorMesh(
            'Button',
            new THREE.PlaneGeometry(button.radius * 1.5, button.radius * 3.2),
            this.artMaterial({
              map: strikerTexture(`striker-${i}`, 40, 96),
              transparent: true,
              depthWrite: false,
            })
          )
        : decorMesh(
            'Button',
            new THREE.PlaneGeometry(button.radius * 3.2, button.radius * 1.4),
            this.artMaterial({
              map: plateTexture(`plate-${i}`, 96, 40),
              transparent: true,
              depthWrite: false,
            })
          );
      node.position.set(button.x, button.y + (button.vertical ? 0 : 4), 2);
      this.stage?.add(node);
      /*
       * The find-me glow. The squint test measured the Stack's wake plate BELOW the
       * environment mean - an interactable losing to the wallpaper. Every other thing
       * the player can use already carries a halo (growths, portal, hover); the plate
       * gets the same treatment in its own reserved amber, small and low, so at any
       * blur the floor says "something warm here wants weight".
       */
      const buttonGlow = decorMesh(
        'ButtonGlow',
        new THREE.PlaneGeometry(96, 96),
        this.artMaterial({
          map: glowTexture('button-glow', PAL.lampWarm),
          transparent: true,
          opacity: 0.3,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      buttonGlow.position.set(button.x, button.y - 4, 1);
      this.stage?.add(buttonGlow);

      /*
       * A marker over the plate: the same down-pointing chevron the shed lumps wear.
       *
       * Asked for directly, and it earns its place - a plate is a small flat thing lying
       * on a floor full of small flat things, and it is the one object in stage one whose
       * whole job is to be walked to. Reusing the shed marker rather than inventing a
       * second arrow keeps one vocabulary: in this game a hovering chevron means GO HERE,
       * whatever is underneath it. It hides once the plate is down, because an
       * instruction that outlives its task is noise.
       */
      const flag = decorMesh(
        'ButtonMarker',
        new THREE.PlaneGeometry(30, 30),
        this.artMaterial({ map: markerTexture(), transparent: true, depthWrite: false })
      );
      flag.position.set(button.x, button.y - 54, 24);
      this.stage?.add(flag);
      this.buttonFlags.push({ node: flag, button });

      this.buttonNodes.push({ node, button });
    });
  }

  /**
   * The far background: one wide plane, well behind the level.
   *
   * Placed at z -320 in level units so the perspective camera gives it a little natural
   * parallax against the platforms without any scrolling logic - the camera is static in
   * this stage, so a single deep plane is all the depth the scene needs and a full parallax
   * stack would be machinery serving nothing.
   *
   * Sized generously past the level bounds. The camera frames 1280x720 exactly, and a
   * backdrop that ends at the level edge shows the void at the corners the moment anything
   * moves the view.
   */
  private buildBackdrop(world: { width: number; height: number }): void {
    const far = backdropTexture(`m4ss-backdrop-${this.theme.name}`);
    const backdrop = decorMesh(
      'Backdrop',
      new THREE.PlaneGeometry(world.width * 1.6, world.height * 1.6),
      this.artMaterial({ map: far.texture })
    );
    backdrop.position.set(world.width / 2, world.height / 2, -320);
    this.stage?.add(backdrop);

    /*
     * The forest, as three parallax planes between the haze and the play space.
     *
     * The references take their depth from four or five organic layers fading into the
     * haze; the game had one plane with structures painted INTO it, which can neither
     * parallax nor be tuned. Each layer is silhouettes only - a silhouette's job is its
     * edge - and each sits at its own depth, so the perspective camera hands back real
     * parallax in the tall stage for free. Colours walk from just-off-haze to
     * near-foreground dark; the lantern glows at -200 light the middle layer, which is
     * what makes them read as IN the forest rather than stickers on it.
     */
    const layers: Array<{ depth: 0 | 1 | 2; z: number; colour: string; drift: number }> = [
      { depth: 0, z: -280, colour: this.theme.forest[0], drift: 1.0 },
      { depth: 1, z: -210, colour: this.theme.forest[1], drift: 1.0 },
      { depth: 2, z: -120, colour: this.theme.forest[2], drift: 1.0 },
    ];
    for (const layer of layers) {
      const texH = Math.min(900, Math.round(world.height * 0.62));
      const sheet = decorMesh(
        'Forest',
        new THREE.PlaneGeometry(world.width * 1.5, world.height * 1.18),
        this.artMaterial({
          map: forestLayer(
            `forest-${this.theme.name}-${layer.depth}`,
            layer.depth,
            layer.colour,
            1280,
            texH,
            this.theme.flora
          ),
          transparent: true,
          depthWrite: false,
        })
      );
      sheet.position.set(world.width / 2, world.height / 2, layer.z);
      this.stage?.add(sheet);
    }

    /*
     * The occluders: the 120% layer, in front of the play plane at z 70. World-fixed, so
     * the perspective camera slides them across everything behind as it moves - the
     * strongest depth cue in the frame and the one this stage never had. The Gallery
     * hangs foliage into the top of the world; the Stack juts pipe hardware in from both
     * side walls, so the climb reads as squeezing up a serviced shaft.
     */
    if (this.theme.occluders === 'leaves') {
      const occ = decorMesh(
        'Occluder',
        new THREE.PlaneGeometry(world.width * 1.35, 260),
        this.artMaterial({
          map: occluderTexture(`occ-${this.theme.name}`, 'leaves', 1280, 240),
          transparent: true,
          depthWrite: false,
        })
      );
      occ.position.set(world.width / 2, 96, 70);
      this.stage?.add(occ);
    } else {
      const occH = Math.min(900, Math.round(world.height * 0.62));
      (['left', 'right'] as const).forEach((side) => {
        const occ = decorMesh(
          'Occluder',
          new THREE.PlaneGeometry(240, world.height * 1.12),
          this.artMaterial({
            map: occluderTexture(`occ-${this.theme.name}-${side}`, 'pipes', 220, occH, side),
            transparent: true,
            depthWrite: false,
          })
        );
        occ.position.set(side === 'left' ? -30 : world.width + 30, world.height / 2, 70);
        this.stage?.add(occ);
      });
    }

    /*
     * The light, given a direction. Diagonal shafts through the Gallery's broken dome,
     * vertical grate-light columns in the Stack - additive, at -60 so they wash over the
     * whole backdrop stack and stop at the play plane. Uniform haze says "atmosphere";
     * shafts say WHERE THE LIGHT COMES FROM, which is most of what makes the reference
     * frames read as places with an outside.
     */
    const rays = decorMesh(
      'GodRays',
      new THREE.PlaneGeometry(world.width * 1.25, world.height * 1.1),
      this.artMaterial({
        map: godRayTexture(`rays-${this.theme.name}`, this.theme.light),
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    rays.position.set(world.width / 2, world.height / 2 - world.height * 0.05, -60);
    this.stage?.add(rays);

    /*
     * The lost bottom edge: dark vapour swallowing the ground line, in front of the play
     * plane (z 40) but anchored to the world's FOOT - the deep tile bodies and the pits
     * sink into it while the walk line stays clear above. The reference never shows a
     * hard floor line and now neither do we.
     */
    const mist = decorMesh(
      'FloorMist',
      new THREE.PlaneGeometry(world.width * 1.6, 230),
      this.artMaterial({
        map: floorMistTexture(`mist-${this.theme.name}`),
        transparent: true,
        depthWrite: false,
      })
    );
    mist.position.set(world.width / 2, world.height - 100, 40);
    this.stage?.add(mist);

    /*
     * The architecture: what makes the midground a LAB rather than more forest.
     *
     * The bible's P3 says depth reads because the layers are different KINDS of thing,
     * and the reference's midground is structures - the greenhouse dome in the Gallery,
     * the pipe stacks and tanks in the Stack. Placed at -240, between the far forest
     * (-280) and the middle forest (-210), so the trees both frame it and grow through
     * it: the forest is eating the lab, not standing beside it.
     */
    const archMap =
      this.theme.midground === 'dome'
        ? domeTexture(`dome-${this.theme.name}`, 1280, 520)
        : pipeStackTexture(`pipes-${this.theme.name}`, 1280, Math.min(900, Math.round(world.height * 0.6)));
    const archH =
      this.theme.midground === 'dome' ? world.height * 0.52 : world.height * 0.78;
    const arch = decorMesh(
      'Architecture',
      new THREE.PlaneGeometry(world.width * 1.3, archH),
      this.artMaterial({ map: archMap, transparent: true, depthWrite: false })
    );
    /*
     * Anchored to the BOTTOM of the backdrop rather than centred: domes rise from the
     * ground line and pipe stacks stand on it, and centring either leaves it floating in
     * the middle of the sky.
     */
    /*
     * -190, not -240: at -240 the middle forest layer (-210) and the additive haze both
     * sat in front of the dome and ate it - the first live capture showed towers where
     * the greenhouse should be. At -190 the dome stands in front of the middle forest
     * and the lantern glows (-200), behind the near trunks (-120): among the trees, not
     * behind the forest.
     */
    arch.position.set(world.width / 2, world.height - archH / 2 - world.height * 0.04, -190);
    this.stage?.add(arch);

    /*
     * The glass roof over the whole place, for a stage whose theme asks for one.
     *
     * The architecture plane above stands ON the ground and grows upward, which leaves the
     * TOP of the background empty - and in the Sluice, whose forest layers are near-black
     * by design, empty means a flat dark field across the upper third of every frame. The
     * bible's reference study wants that band to be the greenhouse roof, backlit by haze,
     * because it is the one image that says laboratory without a single readable object in
     * it.
     *
     * Hung from the top of the world rather than centred, and pushed down past the level's
     * own ceiling slab (which is 160px deep and opaque at z -2): a roof whose ridge line is
     * behind the ceiling is a roof with no silhouette, and the sawtooth is the whole read.
     *
     * z -205 follows the dome's hard-won lesson rather than repeating its mistake. At -240
     * the middle forest layer and the additive haze ate the dome outright; -205 puts this
     * in front of the middle forest (-210) and a hair behind the lantern glows (-200), so
     * the lamps hanging in the haze light the glass instead of being occluded by it.
     */
    if (this.theme.roof === 'glass') {
      const roofH = Math.min(430, Math.round(world.height * 0.26));
      const roof = decorMesh(
        'GlassRoof',
        new THREE.PlaneGeometry(world.width * 1.3, roofH),
        this.artMaterial({
          map: roofLatticeTexture(`roof-${this.theme.name}`, 1280, 360),
          transparent: true,
          depthWrite: false,
        })
      );
      roof.position.set(world.width / 2, world.height * 0.075 + roofH / 2, -205);
      this.stage?.add(roof);
    }

    /*
     * The frame-closers. Every reference is CLOSED at the top and dark in the corners -
     * leaves hang into the first hundred pixels and a vignette holds the eye in - where
     * the game ran bright to all four edges and read as a diagram of a place. Both follow
     * the camera (see follow()), so the tall stage stays framed at every height.
     */
    /*
     * The canopy map CLAMPS. pixelTexture defaults to RepeatWrapping, and on this one
     * plane that wrap drew a faint full-width hairline across the sky: sampling the
     * texture's bottom edge bled the SOLID TOP ROW around from the other side. Two rounds
     * of clamping the drawn strands could not fix what was never a drawing problem.
     */
    const canopyMap = canopyTexture(`canopy-${this.theme.name}-${world.width}`, 1280, 180);
    canopyMap.wrapS = THREE.ClampToEdgeWrapping;
    canopyMap.wrapT = THREE.ClampToEdgeWrapping;
    this.canopy = decorMesh(
      'Canopy',
      new THREE.PlaneGeometry(VIEW_WIDTH * 1.1, 180),
      this.artMaterial({
        map: canopyMap,
        transparent: true,
        depthWrite: false,
      })
    );
    this.canopy.position.set(world.width / 2, 60, 45);
    this.stage?.add(this.canopy);

    this.vignette = decorMesh(
      'Vignette',
      new THREE.PlaneGeometry(VIEW_WIDTH * 1.06, (VIEW_WIDTH / CAMERA_ASPECT) * 1.08),
      this.artMaterial({ map: vignetteTexture(), transparent: true, depthWrite: false })
    );
    this.vignette.position.set(world.width / 2, world.height / 2, 50);
    this.stage?.add(this.vignette);

    /*
     * Real glow sprites at the lanterns, in front of the backdrop they hang in.
     *
     * The pool used to be painted onto the same canvas as the lamp, which meant it could only
     * light pixels drawn in that same pass - not the pipework the lantern hangs from, and
     * nothing at all in front. A lamp that cannot light its own bracket is a picture of a
     * lamp.
     *
     * At z -200 they sit in front of the far plane and the midground structures painted on it,
     * and still well behind the platforms at -30, which is where light from a background
     * lantern belongs. The canvas is mapped straight through: v runs downward on the canvas
     * and y runs downward in level space, so this is a direct multiply with no flip - the one
     * place in this project where those two conventions happen to agree.
     */
    const spread = glowTexture('lantern-glow', PAL.lampWarm);
    this.lanternXs = far.lanterns.map((l) => world.width / 2 + (l.u - 0.5) * world.width * 1.6);
    for (const lamp of far.lanterns) {
      const halo = decorMesh(
        'LanternGlow',
        new THREE.PlaneGeometry(210, 210),
        this.artMaterial({
          map: spread,
          transparent: true,
          opacity: 0.34,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      halo.position.set(
        world.width / 2 + (lamp.u - 0.5) * world.width * 1.6,
        world.height / 2 + (lamp.v - 0.5) * world.height * 1.6,
        -200
      );
      this.stage?.add(halo);
    }

    /*
     * A near haze pane in front of the backdrop and behind the level.
     *
     * The reference unifies its depth with a wash of coloured fog that everything distant
     * sits inside. A single additive plane does the same job here for one draw call: it
     * lifts the black out of the far darks and gives the platforms something to read
     * against, without touching the values of anything in front of it.
     */
    const haze = decorMesh(
      'Haze',
      new THREE.PlaneGeometry(world.width * 1.6, world.height * 1.6),
      this.artMaterial({
        color: new THREE.Color(PAL.hazeFar),
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    haze.position.set(world.width / 2, world.height / 2, -140);
    this.stage?.add(haze);

    /*
     * The air: light shafts and spores, in FRONT of the level.
     *
     * At z 30 it sits over the platforms and the growths but behind the slime, which is the
     * only ordering that works - shafts that pass behind the geometry read as a painted
     * backdrop rather than as light in the room, and spores that hide the player are worse
     * than no spores at all.
     *
     * Additive, so it can only ever lift what is under it. A transparent overlay that could
     * DARKEN would have to be tuned against every surface in the stage; one that can only add
     * light is safe over anything, which is why every atmosphere pass in this project ends up
     * additive whatever it started as.
     */
    const air = decorMesh(
      'Atmosphere',
      new THREE.PlaneGeometry(world.width * 1.1, world.height * 1.1),
      this.artMaterial({
        map: atmosphereTexture(`m4ss-air-${this.theme.name}`),
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    air.position.set(world.width / 2, world.height / 2, 30);
    this.stage?.add(air);

    /*
     * The spores are GONE, and this note is here so they do not come back by accident.
     *
     * Two drifting sheets of motes used to hang in front of the play plane. The playtest
     * called them twice: "static pixel points decorating around the mass slime", and
     * separately asked what "that blue sphere" was - which was this layer's largest mote,
     * a pale cyan cross scaled up by the near sheet's tiling. Neither reading is wrong.
     * Anything drifting in front of the creature competes with it, and the creature is the
     * one thing on screen that must never have to share attention.
     *
     * The air still moves: god rays, the floor mist, the acid's fumes, the growth halos'
     * breathing and the burst particles. None of those sit between the camera and the
     * player.
     */
  }

  /**
   * The portal, on the last platform. Reaching it is the end of stage one.
   *
   * It sits ON the exit shelf rather than floating above it, because the shelf is what the
   * final swing is aimed at and the player should arrive AT the exit rather than near it.
   * The membrane is re-drawn a few times a second from a phase value - see paintWorld -
   * which is the cheapest animation in the stage and the only moving art in it.
   */
  private buildPortal(world: { exit: { x: number; y: number } }): void {
    /*
     * Where the level says, no cleverness. This method used to INFER the exit shelf from
     * tile shape and the inference broke twice: "right-most tile" picked the boundary wall,
     * the height-filtered version picked nothing at all once the floors were deepened past
     * its threshold - and it crashed on the very first frame of stage two, which, because
     * the slime builds after the portal, presented as "stage two has no player". The World
     * declares `exit` now. A level knows where its own door is.
     */
    this.portalAt = { x: world.exit.x, y: world.exit.y };

    const node = decorMesh(
      'Portal',
      new THREE.PlaneGeometry(176, 176),
      this.artMaterial({
        map: portalTexture('portal', 0),
        transparent: true,
        depthWrite: false,
      })
    );
    /*
     * The portal's bleed, behind the arch itself.
     *
     * Behind rather than in front: a glow drawn OVER the arch washes out the stonework that
     * makes it read as a doorway, and the whole point of the object is that it is a way
     * through something built. Additive, so it only lifts the wall and the moss around it.
     */
    const halo = decorMesh(
      'PortalGlow',
      new THREE.PlaneGeometry(300, 300),
      this.artMaterial({
        map: glowTexture('portal-glow', PAL.portalCore),
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    /*
     * BEHIND the creature, and this is a depth decision rather than a taste one.
     *
     * The portal used to sit at z 8 with the slime at 0, so the doorway drew over the animal:
     * arriving at the exit, the thing the player has spent two stages steering disappeared
     * behind the scenery at the exact moment it mattered. The creature is the subject of every
     * frame in this game and nothing in the room may cover it.
     *
     * The window it drops into is narrow and worth stating. The tile faces are at -1 and the
     * grass crowns at -0.5, so anything further back than that is buried in the ground; the
     * trail lies at -0.16 and -0.1 and the body at 0. -0.35 and -0.3 put the door in front of
     * the floor it stands on, behind the slime it belongs to, and with the turf drawing over
     * its foot - which reads as the portal standing IN the grass rather than on top of it.
     */
    halo.position.set(this.portalAt.x, this.portalAt.y, -0.35);
    this.stage?.add(halo);

    node.position.set(this.portalAt.x, this.portalAt.y, -0.3);
    this.stage?.add(node);
    this.portal = node;

    /*
     * The threshold the door stands on.
     *
     * Stage one's exit is a 75px shelf, and it was wearing the same loose earth as every
     * other surface in the room - odd ground for a working doorway, and the one place where
     * the floor texture showed as an arbitrary crop rather than as a pattern, because 75 is
     * not a multiple of anything. A sill states that this corner was BUILT, which is the
     * right note under the only object in the stage that was manufactured rather than grown.
     *
     * The tile is found rather than authored: the nearest surface below the declared exit
     * that spans it. Both stages get one, and stage two's is inset in a wide shelf while
     * stage one's covers its narrow one, which is the correct difference between a threshold
     * in a doorway and a threshold that IS the ledge.
     */
    const doorway = this.portalAt;
    const under = (this.state?.world.tiles ?? [])
      .filter((t) => t.x <= doorway.x && t.x + t.w >= doorway.x && t.y >= doorway.y)
      .sort((a, b) => a.y - b.y)[0];
    if (under) {
      const sw = Math.min(150, under.w);
      const sh = 30;
      const sx = Math.max(under.x + sw / 2, Math.min(under.x + under.w - sw / 2, doorway.x));
      const sill = decorMesh(
        'PortalSill',
        new THREE.PlaneGeometry(sw, sh),
        this.artMaterial({
          map: sillTexture(`sill-${Math.round(under.x)}`, Math.round(sw), sh),
          transparent: true,
          depthWrite: false,
        })
      );
      // Its top edge on the walked surface, and in front of the turf so the threshold is
      // stone rather than stone with grass growing over it.
      sill.position.set(sx, under.y + sh / 2, -0.2);
      this.stage?.add(sill);
    }
  }

  /**
   * The slime's own bleed, which follows it.
   *
   * The player is the brightest object in the stage and was the only bright object with a
   * hard edge and nothing around it - a glowing creature that does not light what it is
   * standing next to reads as a sprite pasted onto a background, which is exactly what the
   * last seven passes of environment work were spent making the stage NOT look like.
   *
   * Sized from the mass each frame, so splitting visibly dims you and reuniting visibly does
   * not. That is the one piece of feedback in this game that the HUD bar states and nothing
   * in the world showed.
   */
  private buildSlimeGlow(): void {
    const halo = decorMesh(
      'SlimeGlow',
      new THREE.PlaneGeometry(260, 260),
      this.artMaterial({
        map: glowTexture('slime-glow', '#b9e86a'),
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    halo.position.set(0, 0, 3);
    this.stage?.add(halo);
    this.slimeGlow = halo;
  }

  /**
   * The trail: two metaball contours over the deposits, rebuilt every frame.
   *
   * Built from the SAME field the creature's own body is built from, and that is the whole
   * argument for doing it this way. Sprites can only ever overlap - two stamped mounds sitting
   * on each other give a scalloped edge and a doubled alpha seam where they cross. Points in a
   * shared field FUSE: a run of deposits becomes one continuous ridge that swells where they
   * pile up and pinches where the creature was moving fastest, and there is no seam anywhere
   * because there are no two things to seam.
   *
   * It also makes "the same colour as the mass" structural rather than a matching exercise.
   * The trail is made of the creature, drawn by the creature's own contour builder.
   *
   * Two contours: a fatter dark one behind, a brighter one in front. See TRAIL_EDGE for why
   * the outline is load-bearing rather than decorative.
   */
  private buildTrail(): void {
    /*
     * DOUBLE-SIDED, and this is not belt and braces - it is why the first trail was invisible.
     *
     * The stage node is scaled (SCALE, -SCALE, SCALE) to turn level space, which is y-down,
     * into world space, which is y-up. A negative scale on one axis REVERSES triangle winding,
     * so geometry built here faces away from the camera and is culled - silently, with no
     * error and nothing on screen, which is the most expensive kind of wrong.
     */
    this.trailEdge = decorMesh(
      'SlimeTrailEdge',
      new THREE.BufferGeometry(),
      this.artMaterial({
        color: new THREE.Color(SLIME_EDGE),
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        side: THREE.DoubleSide,
        /*
         * TONE MAPPED, unlike every other material this rig makes.
         *
         * artMaterial turns tone mapping off because the stage textures are painted from the
         * pre-lifted palette - they have already had the curve applied by hand, and running
         * them through it twice would take it back out. The creature has not: its colours are
         * plain authored hexes going through a lit material, and the trail is made of the
         * creature. Left unmapped alongside them the trail came out pale, washed and yellow,
         * which is exactly what it looked like on screen.
         */
        toneMapped: true,
      })
    );
    this.trailEdge.position.z = -0.16;
    this.stage?.add(this.trailEdge);

    this.trailNode = decorMesh(
      'SlimeTrail',
      new THREE.BufferGeometry(),
      // The creature's own skin, lit the same way the creature is - see slimeSkin.
      slimeSkin({ transparent: true, opacity: 0.95, depthWrite: false })
    );
    // In front of the ground and its turf, behind the creature. A trail drawn over the body
    // would put a smear on the animal that made it.
    this.trailNode.position.z = -0.1;
    this.stage?.add(this.trailNode);
  }

  /**
   * Lay a blot if the body has moved far enough along the ground, and rebuild the strip.
   *
   * Stamped by DISTANCE rather than by time, which is the difference between a trail and a
   * puddle: a creature standing still has already marked where it is standing, and adding to
   * that mark every frame just makes one bright spot that says nothing. Only grounded
   * particles count, so a swing leaves no trail in mid-air - the mark is contact.
   */
  private paintTrail(state: MassState): void {
    if (!this.trailNode || !this.trailEdge) return;

    const mine = owned(state);
    let sumX = 0;
    let low = -Infinity;
    let touching = 0;
    for (const p of mine) {
      if (!p.grounded) continue;
      touching += 1;
      sumX += p.x;
      if (p.y > low) low = p.y;
    }
    if (touching >= 2) {
      const at = { x: sumX / touching, y: low };
      const moved =
        this.lastStamp === null ||
        Math.hypot(at.x - this.lastStamp.x, at.y - this.lastStamp.y) > TRAIL_STEP;
      if (moved) {
        this.lastStamp = at;
        // Sized from the body, so a split creature leaves a thinner ridge than a whole one -
        // the same feedback the glow gives, written on the floor.
        const scale = 0.6 + Math.min(0.4, mine.length * 0.01);
        /*
         * Width and HEIGHT jittered independently, which is the difference between a row of
         * beads and a smear.
         *
         * A round deposit can only be as tall as it is wide, so varying one radius varies both
         * together and the ridge comes out as a string of equal-ish lumps. Slime dragged along
         * a floor does not do that: it is wider than it is tall everywhere, and its height
         * wanders along its length for reasons that have nothing to do with its width - a thin
         * spot here, a thick pool where the creature paused there.
         *
         * So the deposit is an ellipse, and a FLAT one: half again as wide as the nominal
         * radius, and between a fifth and half of it tall. Roughly three to one, which is the
         * number that matters here - at the first ratio, nearer three to two, the ridge still
         * read as a row of hills sitting on the floor rather than as something smeared along
         * it. Height is what says whether slime was dragged or dropped.
         *
         * Both are derived from the position it was laid at, using different constants, so the
         * two vary independently and the same walk still leaves the same trail without a
         * seeded generator up here.
         */
        const jx = Math.abs(Math.sin(at.x * 12.9898 + at.y * 78.233)) % 1;
        const jy = Math.abs(Math.sin(at.x * 39.3468 + at.y * 11.135)) % 1;
        const r = TRAIL_BLOB * scale * (1.02 + jx * 0.44);
        const ry = TRAIL_BLOB * scale * (0.19 + jy * 0.33);
        this.trail.push({ x: at.x, ground: at.y, r, ry, born: state.time });
        if (this.trail.length > TRAIL_MAX) this.trail.splice(0, this.trail.length - TRAIL_MAX);
      }
    }

    /*
     * Age is spent on RADIUS rather than on opacity.
     *
     * A trail that fades out is a decal dissolving; a trail that shrinks is a slime settling.
     * It also gives the tail a shape it could not have otherwise: as the oldest deposits
     * thin, the ridge behind the creature narrows, pinches, and finally breaks into separate
     * beads before it goes - which is what the field does on its own once neighbouring points
     * stop reaching each other, with nothing to author.
     *
     * Held near full for the first third so a fresh mark is a mark, not an entrance.
     */
    const points: Array<{ x: number; y: number; r: number; ry: number }> = [];
    for (const blob of this.trail) {
      const age = state.time - blob.born;
      if (age > TRAIL_LIFE) continue;
      const k = Math.min(1, (1 - age / TRAIL_LIFE) * 1.5);
      const r = blob.r * k;
      const ry = blob.ry * k;
      // Culled small, not tall: a flat deposit starts at a few pixels of height, so the old
      // floor of 2 would have taken half of them off the floor before they had aged at all.
      if (ry < 1.1) continue;
      /*
       * Seated on the ground, and it is the HEIGHT that decides where the centre goes now.
       *
       * The contour reaches out about 0.574 of a radius, so a centre parked TRAIL_SEAT of the
       * vertical radius above the floor leaves the blob's underside just into the turf however
       * tall it happens to be - and it rides up as the deposit shrinks, so the ridge stays on
       * the floor instead of lifting off it.
       */
      points.push({ x: blob.x, y: blob.ground - ry * TRAIL_SEAT, r, ry });
    }

    this.replace(this.trailEdge, buildSurface(points, { cell: 4, threshold: TRAIL_EDGE }));
    this.replace(this.trailNode, buildSurface(points, { cell: 4, threshold: TRAIL_FILL }));
  }

  /**
   * The dots, built once and moved every frame.
   *
   * Drawn in the creature's own colour so they read as ITS trajectory rather than as an
   * overlay, and sized down along the run so the arc has a direction even when it is short.
   */
  private buildFlightDots(): void {
    for (let i = 0; i < DOT_COUNT; i++) {
      const fade = 1 - i / DOT_COUNT;
      /*
       * 22 down to 13, roughly doubled from the first build - which was verified invisible:
       * twelve frames of committed 360 in the review recording, zero dots on screen. Seven
       * to thirteen pixels of faint additive green over teal is below the read threshold of
       * a moving frame.
       */
      const size = 22 - i * 3;
      const dot = decorMesh(
        `FlightDot${i}`,
        new THREE.PlaneGeometry(size, size),
        this.artMaterial({
          map: glowTexture(`flight-dot-${i}`, SLIME_FILL, 32),
          transparent: true,
          opacity: 0.5 + fade * 0.4,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      dot.visible = false;
      // In front of the creature: this is the one thing that has to be legible over it.
      dot.position.z = 4;
      this.stage?.add(dot);
      this.flightDots.push(dot);
    }
  }

  /**
   * Pull the drawn body into a teardrop along its arc, and lay the flight dots ahead of it.
   *
   * Both answer the same question - which way am I going to leave - and both are driven by the
   * same number, the body's speed against the swing ceiling, so they agree with each other by
   * construction. At a hang the creature is round and there are no dots; at a committed
   * revolution it is a comet with its point on the tangent and four dots curving off it.
   */
  private paintSwingShape(state: MassState, mine: Array<{ x: number; y: number }>): void {
    const anchor = this.latched;
    let speed = 0;
    let vx = 0;
    let vy = 0;
    if (mine.length > 0) {
      for (const p of owned(state)) {
        vx += p.x - p.px;
        vy += p.y - p.py;
      }
      vx = vx / mine.length / TUNING.dt;
      vy = vy / mine.length / TUNING.dt;
      speed = Math.hypot(vx, vy);
    }

    /*
     * Measured against what the swing is ALLOWED to reach, not against a constant, so the
     * shape means the same thing on every rope in the game - full comet is a full-energy
     * revolution wherever it happens.
     */
    const rope = state.swingRadius || 0;
    const ceiling = rope > 0 ? Math.sqrt(2 * TUNING.swingEnergy * TUNING.gravity * rope) : 0;
    const drive = state.attached && ceiling > 0 ? Math.min(1, Math.max(0, speed / ceiling)) : 0;

    // The shape itself - see swingShape.ts, which is a module precisely so this claim can
    // be measured rather than squinted at.
    if (anchor && drive > 0.12) teardrop(mine, vx, vy, drive);

    /*
     * The dots - and they are strongest at the moment that used to have none.
     *
     * The first build gated them on `attached && drive > 0.45`, which meant they flickered
     * on only near the bottom of a committed arc and vanished entirely at release - the
     * single moment the player is actually AIMING, in slow motion, was the one moment with
     * no aim line. Now: on the rope they appear from drive 0.2 and grow with it; off the
     * rope they run whenever slow motion is live, reading further ahead (half a second
     * against a third), because aiming time is what slow motion IS.
     *
     * Scaled by aim rather than faded - material opacity written per frame does not
     * reliably reach the renderer through a MeshNode, but node scale does.
     */
    const aiming = state.attached ? Math.max(0, (drive - 0.2) / 0.8) : state.slowmo;
    const show = mine.length > 0 && aiming > 0.05;
    const reach = state.attached ? DOT_REACH : DOT_REACH_SLOWMO;
    this.flightDots.forEach((dot, i) => {
      dot.visible = show;
      if (!show) return;
      const at = ((i + 1) / DOT_COUNT) * reach;
      const c = centroid(owned(state));
      dot.position.x = c.x + vx * at;
      dot.position.y = c.y - BLOB_LIFT + vy * at + 0.5 * TUNING.gravity * at * at;
      dot.scale.setScalar(0.55 + 0.65 * Math.min(1, aiming));
    });
  }

  private buildSlime(): void {
    const empty = new THREE.BufferGeometry();
    this.buildTrail();
    this.buildFlightDots();
    this.rim = decorMesh('SlimeRim', empty.clone(), this.rimMaterial);
    this.rim.position.z = -2;
    this.stage?.add(this.rim);

    this.body = decorMesh('Slime', empty.clone(), this.slimeMaterial);
    this.stage?.add(this.body);

    // Drawn over the body, so both sit in front of it. Belly first, shine on top.
    this.belly = decorMesh('SlimeBelly', empty.clone(), this.bellyMaterial);
    this.belly.position.z = 1;
    this.stage?.add(this.belly);

    this.shine = decorMesh('SlimeShine', empty.clone(), this.shineMaterial);
    this.shine.position.z = 2;
    this.stage?.add(this.shine);

    this.strays = decorMesh('Strays', empty.clone(), this.strayMaterial);
    this.strays.position.z = -4;
    this.stage?.add(this.strays);

    this.cord = decorMesh('Tendril', empty.clone(), this.cordMaterial);
    this.cord.position.z = 4;
    this.stage?.add(this.cord);

    /*
     * The eyes. Two pupils, not a face rig: they ride the upper third of the owned body,
     * lean into the direction of travel with the same smoothed value as the shine, and
     * blink on a timer. Everything the reference slime's charm needs and nothing more.
     */
    this.eyes = [0, 1].map(() => {
      const eye = decorMesh(
        'SlimeEye',
        new THREE.PlaneGeometry(9, 13),
        this.artMaterial({ map: eyeTexture(), transparent: true, depthWrite: false })
      );
      eye.position.z = 5;
      this.stage?.add(eye);
      return eye;
    });
  }

  /**
   * Two bars and a word.
   *
   * It was six lines of numbers, which is the right readout for finding out why the camera is
   * in the wrong place and the wrong one for playing. The player needs to know two things and
   * both are quantities, so both are bars: how much of you there is, and - while Space is
   * down - how much of that you are about to put on the floor.
   *
   * The split bar is drawn INSIDE the mass bar, filling from the right, because the thing it
   * measures is a piece of the thing it sits in. A separate gauge somewhere else would make
   * the player do the subtraction.
   */
  private buildHud(): void {
    const container = this.getWorld()?.gameContainer;
    if (!container) return;
    /*
     * Styled as a Pelagic OS window, because that is what it IS in the fiction: M4SS is a
     * containment sim running on Keller's machine, and the player is watching its live
     * feed. The old HUD was green-on-black console chrome - the OTHER game's aesthetic -
     * which put two operating systems on screen at once. The palette here is lifted
     * straight from stationDesk's C table: same title-bar blue, same panel, same warn
     * orange, so the file on her desktop and the window over the feed are visibly the
     * same software.
     */
    const hud = document.createElement('div');
    hud.style.cssText = [
      'position:absolute',
      'left:22px',
      // Safe area belongs to the game. Development telemetry must never dictate layout.
      'top:22px',
      'z-index:20',
      'width:240px',
      'background:rgba(27,35,49,0.88)', // stationDesk C.panel
      'border:1px solid #2f5f8f',
      'box-shadow:0 2px 12px rgba(0,0,0,0.45)',
      'color:#e6ecf4', // C.label
      'font:11px/1.5 "Courier New",monospace',
      'pointer-events:none',
    ].join(';');
    hud.innerHTML = [
      // The title bar, straight off the specimen window on her desktop.
      // Right padding leaves this row space for the PAUSE button, which is positioned
      // absolutely over it - without it the button sits on top of the LIVE indicator.
      '<div style="background:#2f5f8f;color:#ffffff;padding:3px 58px 3px 8px;font-size:10px;',
      'letter-spacing:1px;display:flex;justify-content:space-between">',
      '<span>specimen M4SS</span><span style="color:#8fe0a2">LIVE</span></div>',
      '<div style="padding:8px 10px 10px">',
      '<div style="display:flex;align-items:center;gap:7px">',
      // The specimen glyph: a green blob with its own glow, the HUD's one piece of the
      // creature. A gauge with a face on it reads as a creature meter, not a fuel bar.
      // The same face the creature wears in the feed: two pupils, nothing more. A gauge
      // with the specimen's own face reads as a live reading OF it.
      '<div style="width:13px;height:11px;border-radius:52% 48% 55% 45%;background:#8fe8a8;',
      'box-shadow:0 0 7px #4fae6e;position:relative">',
      '<i style="position:absolute;left:3px;top:4px;width:2px;height:3px;background:#0d1a14"></i>',
      '<i style="position:absolute;right:3px;top:4px;width:2px;height:3px;background:#0d1a14"></i>',
      '</div>',
      '<div data-role="label" style="letter-spacing:2px;opacity:0.85;font-size:10px">MASS</div>',
      '</div>',
      '<div style="position:relative;height:13px;margin-top:5px;background:#0b0e12;',
      'border:1px solid #3a4d6b">',
      '<div data-role="mass" style="position:absolute;left:0;top:0;bottom:0;width:0%;',
      'background:linear-gradient(180deg,#a5f0bc,#5fc98f)"></div>',
      '<div data-role="shed" style="position:absolute;right:0;top:0;bottom:0;width:0%;',
      'background:linear-gradient(180deg,#f4a05c,#d8703c)"></div>',
      // Segment ticks over both fills: a specimen gauge, calibrated, not a paint bar.
      '<div style="position:absolute;inset:0;background:repeating-linear-gradient(90deg,',
      'transparent 0 9px,rgba(11,14,18,0.85) 9px 11px)"></div>',
      '</div>',
      '<div data-role="note" style="margin-top:6px;opacity:0.75;font-size:10px">&nbsp;</div>',
      '</div>',
    ].join('');
    /*
     * The slow-motion veil: the one visual answer to the game's signature moment.
     *
     * Slow motion scaled time and audio and changed nothing on screen - the release-and-aim
     * beat looked identical to ordinary falling. A DOM radial vignette (same pattern as the
     * warp veil, because DOM opacity is per-frame safe where MeshNode material opacity is
     * not) plus a four-percent camera push-in (see the camera block) reads as the world
     * holding its breath, for about thirty lines.
     */
    const veil = document.createElement('div');
    veil.style.cssText = [
      'position:absolute;inset:0;pointer-events:none;z-index:20;opacity:0;',
      'background:radial-gradient(ellipse at center,',
      'rgba(0,0,0,0) 44%, rgba(6,12,16,0.28) 74%, rgba(4,8,12,0.55) 100%)',
    ].join('');
    container.appendChild(veil);
    this.slowmoVeil = veil;
    this.detach.push(() => veil.remove());

    /*
     * A way OUT, on the title bar where an OS window keeps one.
     *
     * The header above argues there is no room for an on-screen control because M4SS owns
     * the keyboard and the mouse, and that was true of a control sitting in the play area. A
     * title-bar button on a window that is already drawn is a different proposition: it costs
     * no new furniture, it is where anyone would look for it, and it is DISCOVERABLE, which
     * Escape is not. A player who does not know the key exists is a player who cannot leave.
     *
     * pointer-events are re-enabled for this one element - the panel stays transparent to the
     * mouse - and the press is stopped dead, so the click that leaves the game does not also
     * tell the specimen to latch on the way out.
     */
    const quit = document.createElement('button');
    quit.type = 'button';
    quit.textContent = 'PAUSE';
    quit.setAttribute('aria-label', 'Pause');
    quit.style.cssText = [
      'position:absolute',
      'right:4px',
      'top:2px',
      'padding:0 7px',
      'height:15px',
      'background:#1b2331',
      'border:1px solid #7fb2e0',
      'color:#dce8f6',
      'font:9px/13px "Courier New",monospace',
      'letter-spacing:1px',
      'cursor:pointer',
      'pointer-events:auto',
    ].join(';');
    const swallow = (event: Event): void => {
      event.preventDefault();
      event.stopPropagation();
    };
    quit.addEventListener('pointerdown', swallow);
    quit.addEventListener('mousedown', swallow);
    quit.addEventListener('click', (event) => {
      swallow(event);
      this.setPaused(true);
    });
    hud.appendChild(quit);
    this.buildPauseMenu(container, swallow);

    container.appendChild(hud);
    this.hud = hud;
    this.hudMass = hud.querySelector('[data-role="mass"]');
    this.hudShed = hud.querySelector('[data-role="shed"]');
    this.hudLabel = hud.querySelector('[data-role="label"]');
    this.hudNote = hud.querySelector('[data-role="note"]');
    this.detach.push(() => hud.remove());
  }

  /**
   * The pause menu, and why PAUSE stopped being a synonym for QUIT.
   *
   * The button said PAUSE and left the game. That is a defensible shorthand right up until the
   * thing you return to is a conversation with state in it - and it is: leaving M4SS puts the
   * player back in the middle of Dana Keller's request, where every chip used to be read as an
   * answer. So the one control the game offers for "hang on a moment" was spending the mission.
   *
   * Two choices, stated plainly, because they are genuinely different things to want. RESUME
   * is the default and comes first. BACK TO DANA names the person rather than the screen,
   * which is what the player is actually going back to.
   *
   * Built once with the HUD and parked at display:none rather than created on demand - the
   * frame this opens on is a frame in which the world stops, and building a panel in it is the
   * one moment in the run when a hitch is guaranteed to be noticed.
   */
  private buildPauseMenu(container: HTMLElement, swallow: (event: Event) => void): void {
    const veil = document.createElement('div');
    veil.style.cssText = [
      'position:absolute',
      'inset:0',
      'display:none',
      'align-items:center',
      'justify-content:center',
      // The stage is transparent to the mouse; this one thing is not, and it takes the lot -
      // a click that lands on the canvas behind an open menu tells the specimen to latch.
      'pointer-events:auto',
      'background:rgba(6,10,14,0.72)',
      'z-index:40',
    ].join(';');
    veil.addEventListener('pointerdown', swallow);
    veil.addEventListener('mousedown', swallow);

    const panel = document.createElement('div');
    panel.style.cssText = [
      'min-width:210px',
      'padding:16px 18px 14px',
      'background:#101823',
      'border:1px solid #7fb2e0',
      'box-shadow:0 0 0 1px rgba(0,0,0,0.6)',
      'font:11px/16px "Courier New",monospace',
      'color:#dce8f6',
      'text-align:center',
    ].join(';');

    const title = document.createElement('div');
    title.textContent = 'PAUSED';
    title.style.cssText = 'letter-spacing:3px;margin-bottom:12px;color:#7fb2e0';
    panel.appendChild(title);

    const make = (label: string, onPick: () => void): HTMLButtonElement => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.style.cssText = [
        'display:block',
        'width:100%',
        'margin:0 0 8px',
        'padding:7px 10px',
        'background:#1b2331',
        'border:1px solid #46617e',
        'color:#dce8f6',
        'font:11px/14px "Courier New",monospace',
        'letter-spacing:2px',
        'cursor:pointer',
        'pointer-events:auto',
      ].join(';');
      button.addEventListener('pointerdown', swallow);
      button.addEventListener('mousedown', swallow);
      button.addEventListener('click', (event) => {
        swallow(event);
        onPick();
      });
      button.addEventListener('mouseenter', () => {
        button.style.background = '#26374b';
      });
      button.addEventListener('mouseleave', () => {
        button.style.background = '#1b2331';
      });
      panel.appendChild(button);
      return button;
    };

    make('RESUME', () => this.setPaused(false));
    make('BACK TO DANA', () => {
      // Unpause FIRST. The rig is torn down by what onQuit does, and a flag left true on a
      // dead object is a flag that outlives the thing it was describing.
      this.setPaused(false);
      this.onQuit?.();
    });

    veil.appendChild(panel);
    container.appendChild(veil);
    this.pauseVeil = veil;
    this.detach.push(() => veil.remove());
  }

  /**
   * Open or close the pause menu.
   *
   * `held` is cleared on the way in, and that is not tidiness: the keys are tracked by keydown
   * and keyup, and a keyup that happens while the menu is up still arrives, but a key held
   * across the pause would otherwise have the creature crawling the instant play resumes,
   * driven by a press the player made before they stopped.
   */
  public setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    if (this.pauseVeil) this.pauseVeil.style.display = paused ? 'flex' : 'none';
    this.clearInput();
  }

  private clearInput(): void {
    this.held.clear();
    this.recalling = false;
    this.latched = null;
    this.splitHold = 0;
  }

  public isPaused(): boolean {
    return this.paused;
  }

  /** What the bar is promising, and what release will actually hand over. One source. */
  private splitFraction(): number {
    return Math.min(SPLIT_MAX, this.splitHold);
  }

  private paintHud(): void {
    const state = this.state;
    if (!this.hud || !state) return;
    if (this.slowmoVeil) this.slowmoVeil.style.opacity = String(state.slowmo * 0.9);

    /*
     * The bar is a fraction of the mass you STARTED with, not of the mass you have.
     *
     * Normalised to the current mass it would always be full, which is the one reading that
     * tells the player nothing - a slime that has left half of itself behind a wall would sit
     * at 100% while it did so.
     */
    const held = mass(state);
    const away = loose(state).length;
    const total = Math.max(1, held + away);
    const heldPct = (held / total) * 100;
    const shedPct = this.splitHold > 0 ? Math.min(heldPct, heldPct * this.splitFraction()) : 0;

    if (this.hudMass) this.hudMass.style.width = `${heldPct - shedPct}%`;
    if (this.hudShed) this.hudShed.style.width = `${shedPct}%`;
    if (this.hudLabel) {
      const reach = reachOf(state);
      const reachBand = reach < 80 ? 'SHORT' : reach < 150 ? 'NOMINAL' : 'EXTENDED';
      this.hudLabel.textContent =
        this.splitHold > 0
          ? `SPLIT  ${Math.round(this.splitFraction() * 100)}%`
          : `MASS  ${held}    REACH ${reachBand}`;
    }
    if (this.hudNote) {
      /*
       * The sieve says why it stopped you. An over-mass body pressed against a shut gap
       * was an invisible wall - the playtest read it as the level breaking. The gap's
       * rule (grams, not geometry) is invisible by nature, so the HUD carries it at the
       * moment it binds and at no other time.
       */
      let note = away > 0 ? `${away} left behind - hold Q to call it back` : String.fromCharCode(160);
      const at = owned(state).length > 0 ? centroid(owned(state)) : null;
      if (at) {
        for (const gate of state.world.gates) {
          if (gate.open || gate.sieve === undefined) continue;
          const nearGap = Math.abs(at.x - (gate.x + gate.w / 2)) < 90 && at.y > gate.y + gate.h - 80;
          if (nearGap && owned(state).length > gate.sieve) {
            note = `too big for the gap - hold SPACE to shed below ${gate.sieve + 1}`;
            break;
          }
        }
        /*
         * And the column says its number the same way, for the same reason.
         *
         * A mass ceiling is invisible by nature - a body standing in a draught that will not
         * carry it looks exactly like a body standing in a draught that is broken. The sieve
         * learned this the hard way and the line above is the fix; the air needs its own or it
         * ships the identical fault one stage later.
         *
         * `draftOn` returns the column WITH a lift of zero when the body is too heavy, which
         * is the whole reason it returns the pair rather than a boolean: this is the only
         * caller that needs to tell "not in the draught" from "in it and being refused".
         */
        const draught = draftOn(state);
        if (draught && draught.lift === 0) {
          note = `too heavy for the draught - hold SPACE to shed below ${draught.draft.liftMass + 1}`;
        }
      }
      if (state.time < this.growthNoticeUntil) {
        note = 'Growth feed restored — return route active.';
      }
      this.hudNote.textContent = note;
    }
  }

  // -- input ------------------------------------------------------------------------------

  private listen(): void {
    const down = (e: KeyboardEvent): void => {
      if (this.paused || document.hidden || !document.hasFocus()) return;
      // A held key surviving a pause/focus change is not a new command.
      if (e.repeat && !this.held.has(e.code)) return;
      /*
       * The standalone boot has no menu, so the first keystroke is the first gesture the
       * browser will accept an AudioContext from. Inside the console this is a no-op
       * resume - unlock() is idempotent - so the two boots share one line.
       */
      audio.unlock();
      this.held.add(e.code);
      if (e.code === 'KeyA' || e.code === 'KeyD' || e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        this.dismissTutorial('move');
      }
      if (e.code === 'KeyQ' && !e.repeat) this.voice.play('recall');
      if (e.code === 'KeyQ') {
        this.recalling = true;
        this.dismissTutorial('recall');
      }
      if (e.code === 'Space') e.preventDefault();
    };
    const up = (e: KeyboardEvent): void => {
      const wasHeld = this.held.delete(e.code);
      if (e.code === 'KeyQ') this.recalling = false;
      if (e.code === 'Space' && wasHeld && !this.paused && this.state) {
        const shed = split(this.state, this.splitFraction());
        if (shed > 0) {
          this.voice.play('split');
          this.justSplit = true;
          this.dismissTutorial('split');
        }
        this.splitHold = 0;
      }
    };
    const press = (e: MouseEvent): void => {
      if (this.paused || document.hidden) return;
      audio.unlock();
      this.grab(e);
    };
    const hover = (e: MouseEvent): void => {
      this.pointer = this.toLevel(e);
    };
    const release = (): void => {
      this.latched = null;
    };
    const loseFocus = (): void => this.setPaused(true);
    const visibility = (): void => { if (document.hidden) loseFocus(); };

    addEventListener('blur', loseFocus);
    document.addEventListener('visibilitychange', visibility);
    addEventListener('keydown', down);
    addEventListener('keyup', up);
    addEventListener('mousedown', press);
    addEventListener('mouseup', release);
    addEventListener('mousemove', hover);
    this.detach.push(
      () => removeEventListener('blur', loseFocus),
      () => document.removeEventListener('visibilitychange', visibility),
      () => removeEventListener('mousemove', hover),
      () => removeEventListener('keydown', down),
      () => removeEventListener('keyup', up),
      () => removeEventListener('mousedown', press),
      () => removeEventListener('mouseup', release)
    );
  }

  /**
   * Latch onto the growth point nearest the click.
   *
   * Generous, and deliberately so: this is a test of whether reaching feels good, and a
   * player who misses a 22px ring learns nothing about that.
   */
  /**
   * Screen to level coordinates.
   *
   * Pulled out of grab() when the hover glow needed the same arithmetic. It is measured
   * against the CAMERA's centre rather than the world's, because the camera follows in a
   * stage taller than the screen - reading it off the world centre worked perfectly in stage
   * one and would put every click hundreds of pixels out in stage two.
   */
  private toLevel(event: MouseEvent): { x: number; y: number } | null {
    const world = this.state?.world;
    if (!world) return null;
    const target = event.target as HTMLElement | null;
    const rect = target?.getBoundingClientRect?.();
    if (!rect || rect.width === 0) return null;

    const height = (VIEW_WIDTH * rect.height) / rect.width;
    const centre = this.viewCentre();
    return {
      x: centre.x + ((event.clientX - rect.left) / rect.width - 0.5) * VIEW_WIDTH,
      y: centre.y + ((event.clientY - rect.top) / rect.height - 0.5) * height,
    };
  }

  /**
   * Latch onto whatever the ring is on.
   *
   * The old rule was POINT AND CLICK: the growth nearest the cursor, within ninety pixels
   * of it, and within reach. Two things were wrong with it. It asked the player to aim at
   * a small target with the same hand that has to time a release, in a game whose actual
   * skill is the swing; and it stayed silent until the click, so the answer to "can I
   * reach that yet" arrived only after getting it wrong.
   *
   * Now the world answers first. Any live growth inside the body's reach is a candidate,
   * the nearest one to the body wears a pulsing white ring (see chooseTarget), and the
   * click simply takes it. Aim disappears as a skill and nothing is lost, because there
   * was never a moment in either stage where the interesting choice was WHICH growth -
   * the interesting choice is when to let go.
   *
   * The event is still taken because the browser hands it over and because the mouse is
   * still what presses the button; it just no longer decides anything.
   */
  private grab(_event: MouseEvent): void {
    if (!this.state) return;
    /*
     * Out of reach is ANSWERED, not swallowed. If there is no target at all, say why -
     * the reach economy is the game and it should never be silent about itself. The
     * nearest live growth beyond reach is the one the player was probably going for.
     */
    if (!this.target) {
      const world = this.state.world;
      const bodyAt = centroid(owned(this.state));
      let nearest: Anchor | null = null;
      let nearestD = Infinity;
      for (const a of world.anchors) {
        if (a.live === false) continue;
        const d = Math.hypot(a.x - bodyAt.x, a.y - bodyAt.y);
        if (d < nearestD) {
          nearestD = d;
          nearest = a;
        }
      }
      if (nearest) {
        this.denied = { anchor: nearest, t: 0.6 };
        if (this.hudNote) this.hudNote.textContent = 'out of reach - grow closer or shed less';
      }
      this.latched = null;
      return;
    }
    this.latched = this.target;
    this.dismissTutorial('target');
  }

  /** Fade a lesson once the player has demonstrated it; learned verbs stop being signage. */
  private dismissTutorial(action: TutorialAction): void {
    if (this.dismissedTutorials.has(action)) return;
    this.dismissedTutorials.add(action);
    for (const sign of this.signLabels) {
      if (sign.action !== action) continue;
      sign.el.style.opacity = '0';
      sign.el.style.transform = 'translate(-50%,-50%) translateY(-4px)';
      window.setTimeout(() => sign.el.remove(), 240);
    }
  }

  /**
   * Which growth a click would catch, and the ring that says so.
   *
   * Nearest live growth to the BODY, inside reach. Nearest to the body rather than to the
   * pointer because the body is what has to get there - with two growths pulsing, the one
   * you can hold onto longest is the near one, and that is the one the player means.
   *
   * The ring pulses rather than sitting still, because a static ring is indistinguishable
   * from art at a glance and this has to read as an OFFER. It breathes about once a
   * second and tightens as it brightens.
   */
  private chooseTarget(): void {
    const state = this.state;
    if (!state) {
      this.target = null;
      return;
    }
    // While hanging, the ring belongs to the growth being held - it is still the answer to
    // "what is the click doing", and moving it to a neighbour mid-swing is a lie.
    if (state.attached && this.latched) {
      this.target = this.latched;
    } else {
      const bodyAt = centroid(owned(state));
      const limit = reachOf(state);
      let best: Anchor | null = null;
      let bestD = Infinity;
      for (const a of state.world.anchors) {
        if (a.live === false) continue;
        const d = Math.hypot(a.x - bodyAt.x, a.y - bodyAt.y);
        if (d > limit || d >= bestD) continue;
        bestD = d;
        best = a;
      }
      this.target = best;
    }

    /*
     * The pulse is a TRANSFORM, and the show/hide is `visible`.
     *
     * The first version animated the material's opacity, and the ring never appeared on
     * screen once - while the flies created three lines later, animated by position, were
     * visible immediately. Whatever the engine does with a material handed to
     * MeshNode.create, writing opacity through it from the frame loop does not reach the
     * renderer here. Node transforms and node visibility demonstrably do, so the pulse
     * rides the scale instead: it breathes about two thirds of a second, tightening as it
     * grows. Same read, on a path that is proven every frame by everything else moving.
     */
    if (this.state?.justGripped) this.gripFlash = 1;
    this.gripFlash = Math.max(0, this.gripFlash - 1 / 24);
    const ring = this.latchRing;
    if (!ring) return;
    /*
     * The grip flash: the ring kicks out a third and snaps back over a quarter second when
     * the tendril takes hold, and it stays visible on the LATCHED growth while it does -
     * the ring was purely a target affordance before, so the single most tactile event in
     * the game (the clunk of connection) had no visual event at all.
     */
    const flashing = this.gripFlash > 0 && this.latched;
    const aim = this.target ?? (flashing ? this.latched : null);
    if (!aim) {
      ring.visible = false;
      ring.position.set(-999, -999, 22);
      return;
    }
    const pulse = (Math.sin(this.artClock * 4.2) + 1) / 2;
    const scale = (1.14 - pulse * 0.14) * (1 + 0.35 * this.gripFlash);
    ring.visible = true;
    ring.position.set(aim.x, aim.y, 22);
    ring.scale.set(scale, scale, 1);
  }

  // -- frame ------------------------------------------------------------------------------

  public override tickPrePhysics(deltaTime: number): void {
    super.tickPrePhysics(deltaTime);
    const state = this.state;
    if (!state) return;
    /*
     * Everything below this line is the world moving, so pausing is one return.
     *
     * Above it is only the engine's own tick. The camera is deliberately NOT re-asserted while
     * paused either - it is re-asserted from here - which is safe because nothing else claims
     * the view-target stack while M4SS is mounted, and it means the frame behind the menu is
     * the frame the player stopped on rather than one that keeps drifting.
     */
    if (this.paused) return;

    if (this.held.has('Space')) {
      this.splitHold = Math.min(SPLIT_MAX, this.splitHold + deltaTime * SPLIT_RATE);
    }

    const right = this.held.has('KeyD') || this.held.has('ArrowRight');
    const left = this.held.has('KeyA') || this.held.has('ArrowLeft');
    const move: -1 | 0 | 1 = right === left ? 0 : right ? 1 : -1;

    /*
     * Fixed step, the same one the harness uses, with the leftover carried. A simulation that
     * takes the frame's delta gives a different answer on a different machine, and every
     * number measured about the reach would be true only on mine.
     */
    /*
     * Slow motion, applied to REAL time rather than to the timestep.
     *
     * The step stays 1/120 for ever - every number measured about the reach, the swing and
     * the pit is only true at that step, and a variable one would make them true on my
     * machine and nowhere else. What slows is how many steps a wall-clock second buys.
     *
     * It exists for the shaft. A release at the top of one growth's circle reaches the next
     * one in about a third of a second, which is not an aiming window, it is a reflex test.
     * At 0.35 the same flight lasts most of a second and the player can look, decide, and
     * click. The sim raises the flag on a fast release and decays it; all this does is spend
     * it.
     */
    const scale = 1 - (1 - TUNING.slowmoScale) * state.slowmo;
    if (this.containedDelay > 0) {
      this.containedDelay -= deltaTime;
      if (this.containedDelay <= 0) this.onContained?.();
    }
    const warping = this.tickWarp(deltaTime);
    this.carry = Math.min(this.carry + deltaTime * scale, 0.25);
    while (this.carry >= TUNING.dt) {
      if (!warping) step(state, { move, anchor: this.latched, recall: this.recalling });
      this.carry -= TUNING.dt;
    }
    this.tickBursts(deltaTime);
    if (this.recalling) {
      const came = absorbTouching(state);
      if (came > 0 && this.absorbCooldown <= 0) {
        this.voice.play('absorb');
        this.absorbCooldown = 0.09;
      }
    }
    this.absorbCooldown -= deltaTime;

    this.hearWorld();
    this.paintSlime();
    this.paintWorld(deltaTime);
    this.follow();
    this.paintHud();
  }

  /**
   * The portal was reached, so load the next stage.
   *
   * Everything is torn down and rebuilt from the stage factory rather than patched, because
   * a World is mutated by play and half the scene is generated from it - growth sprites are
   * placed per anchor, gate meshes per gate, presses per crusher. Reusing the nodes would
   * mean reconciling two lists for no gain; there are two stages and a rebuild costs one
   * frame that the player spends looking at a portal flash anyway.
   *
   * On the last stage there is nowhere to go, so the portal simply stays flared. That is a
   * placeholder for an ending rather than an ending, and it is better than looping the
   * player back to stage one without a word.
   */
  /**
   * The last portal. The specimen is contained, and the file knows it.
   *
   * The flag is written IMMEDIATELY, before the dwell - if the tab dies during the pause,
   * the containment still happened. The dwell exists so the player sees the words over the
   * flared portal before the screen is taken away; handing back to Keller on the same
   * frame as the arrival made the whole ending subliminal.
   */
  /**
   * Take the creature off the board, after the last portal has swallowed it.
   *
   * Everything the specimen is made of, including the marks it left: a trail still lying on
   * the floor of a room whose occupant has just been contained is a loose end, and the last
   * image of the mission should be the room without it. The nodes are hidden rather than
   * destroyed - the rig is about to be unmounted wholesale and there is no sense racing it.
   */
  private vanish(): void {
    this.swallowed = true;
    for (const node of [
      this.body,
      this.rim,
      this.belly,
      this.shine,
      this.strays,
      this.cord,
      this.slimeGlow,
      this.trailNode,
      this.trailEdge,
      ...this.eyes,
      ...this.flightDots,
    ]) {
      if (node) node.visible = false;
    }
  }

  private contain(): void {
    saveM4ssContained();
    if (this.hudLabel) this.hudLabel.textContent = 'SPECIMEN CONTAINED';
    if (this.hudNote) this.hudNote.textContent = this.onContained ? 'returning to the feed' : 'the record is closed';
    this.voice.play('contained');
    this.showContainmentMark();
    this.containedDelay = 3.4;
  }

  /**
   * The station, not the game, certifies the empty chamber.
   *
   * One centred acquisition mark holds after the portal veil lifts. It has no score,
   * confetti or celebratory language: the unsettling image is an empty room, a living
   * residual portal, and an institution calmly stamping the record closed.
   */
  private showContainmentMark(): void {
    if (this.containmentMark) return;
    const container = this.getWorld()?.gameContainer;
    if (!container) return;

    const mark = document.createElement('div');
    mark.setAttribute('aria-hidden', 'true');
    mark.style.cssText = [
      'position:absolute',
      'left:50%',
      'top:54%',
      'transform:translate(-50%,-50%) scale(1.08)',
      'z-index:31',
      'min-width:280px',
      'padding:14px 20px 12px',
      'border:1px solid rgba(143,224,162,0.72)',
      'background:rgba(12,19,28,0.78)',
      'box-shadow:0 0 0 1px rgba(47,95,143,0.55),0 0 34px rgba(79,174,110,0.22)',
      'color:#dff5e5',
      'font:11px/1.45 "Courier New",monospace',
      'letter-spacing:2px',
      'text-align:center',
      'pointer-events:none',
      'opacity:0',
      'transition:opacity 420ms ease,transform 620ms cubic-bezier(.18,.9,.22,1)',
    ].join(';');

    const title = document.createElement('div');
    title.textContent = 'CONTAINMENT LOCK  //  CLOSED';
    const sub = document.createElement('div');
    sub.textContent = 'SPECIMEN M4SS  ·  CHAMBER 02  ·  MASS ACCOUNTED';
    sub.style.cssText = 'margin-top:5px;color:#8fe0a2;font-size:9px;letter-spacing:1.3px';
    mark.append(title, sub);
    container.appendChild(mark);
    this.containmentMark = mark;
    this.detach.push(() => {
      mark.remove();
      if (this.containmentMark === mark) this.containmentMark = null;
    });

    requestAnimationFrame(() => {
      if (this.containmentMark !== mark) return;
      mark.style.opacity = '1';
      mark.style.transform = 'translate(-50%,-50%) scale(1)';
    });
  }

  /**
   * Start the between-stages transition. The swap itself still happens in advance() -
   * this only decides WHEN the player is allowed to see it: behind a veil, after the
   * body has visibly gone somewhere. The previous version advanced on the same frame the
   * portal was touched, which made finishing a stage feel like a level-select, not an
   * arrival.
   */
  private beginWarp(final = false): void {
    if (this.warp) return;
    const container = this.getWorld()?.gameContainer;
    if (container) {
      const veil = document.createElement('div');
      /*
       * Preserve the occlusion the stage swap needs without forcing a bright full-frame
       * event. Reduced uses the portal's midtone; off becomes a dark iris. Both still hide
       * the rebuild, so the comfort setting never exposes a one-frame level pop.
       */
      const flash = getAccessibilityPreferences().flashIntensity;
      const veilColour =
        flash === 'full' ? '#bff2e4' : flash === 'reduced' ? '#52766d' : '#06100d';
      veil.style.cssText = `position:absolute;inset:0;background:${veilColour};opacity:0;pointer-events:none;z-index:30`;
      container.appendChild(veil);
      this.warpVeil = veil;
    }
    this.warp = { t: 0, out: true, final };
  }

  /** Drive the warp. Returns true while it owns the frame - the sim does not step under it. */
  private tickWarp(deltaTime: number): boolean {
    const warp = this.warp;
    const state = this.state;
    if (!warp || !state) return false;
    warp.t += deltaTime;

    if (warp.out) {
      /*
       * The body is drawn INTO the portal: every particle closes 14% of its remaining
       * distance per tick, which is an exponential ease nobody has to author. The sim is
       * frozen, so these writes are animation, not physics - by the time the sim runs
       * again this body has been rebuilt for the next stage anyway.
       */
      /*
       * The wormhole.
       *
       * It used to be a straight pull - every particle closing 14% of its remaining
       * distance to the portal per tick - which is an exponential ease and reads as the
       * slime being deleted toward a point. A wormhole is not a vacuum cleaner: what
       * makes one legible is that the thing going in ORBITS while it falls, faster and
       * faster as it gets closer, so the body draws a spiral rather than a line.
       *
       * So each particle is moved in polar coordinates around the portal: the radius
       * closes at a steady fraction, and the angle advances at a rate that RISES as the
       * radius shrinks - the same reason a skater speeds up pulling their arms in, and
       * the reason the last few frames whip.
       *
       * The sim is frozen while this runs, so these writes are animation rather than
       * physics; by the time the sim steps again the body has been rebuilt for stage two.
       */
      const at = this.portalAt;
      if (at) {
        for (const q of owned(state)) {
          const dx = q.x - at.x;
          const dy = q.y - at.y;
          const r = Math.hypot(dx, dy);
          if (r < 1.5) {
            q.x = at.x;
            q.y = at.y;
          } else {
            // How far in the fall has come, 0 at the lip and 1 at the throat.
            const closeness = Math.max(0, Math.min(1, 1 - r / 190));
            const spin = 0.16 + closeness * closeness * 1.5;
            const theta = Math.atan2(dy, dx) + spin;
            const pulled = r * 0.9 - 1.6;
            q.x = at.x + Math.cos(theta) * pulled;
            q.y = at.y + Math.sin(theta) * pulled;
          }
          q.px = q.x;
          q.py = q.y;
        }
      }
      // The portal spins up to meet it, and the veil holds off until the body is well in -
      // there is no point animating a swallow nobody can see.
      this.portalPhase += deltaTime * (6 + warp.t * 14);
      if (this.warpVeil) {
        this.warpVeil.style.opacity = String(Math.max(0, Math.min(1, (warp.t - 0.45) / 0.4)));
      }
      if (warp.t >= 0.95) {
        /*
         * A middle portal swaps the stage behind the veil. The LAST one has nothing to swap
         * to, so it records the containment and takes the creature off the board instead -
         * and the difference matters, because the stage is not rebuilt afterwards. Left
         * alone, forty particles all sitting on one point would spring apart the instant the
         * sim ran again and the specimen would burst back out of the hole that just ate it.
         */
        if (warp.final) {
          this.contain();
          this.vanish();
        } else {
          this.advance();
        }
        warp.out = false;
        warp.t = 0;
      }
      return true;
    }

    if (this.warpVeil) this.warpVeil.style.opacity = String(Math.max(0, 1 - warp.t / 0.7));
    if (warp.t >= 0.75) {
      this.warpVeil?.remove();
      this.warpVeil = null;
      // A middle warp hands the frame back. The final one holds it: the room the veil lifts
      // off is empty, the readout says CONTAINED, and nothing should move in it again until
      // the console takes the screen back.
      if (!warp.final) this.warp = null;
    }
    // The veil is lifting off a live stage: let the sim run underneath it.
    return warp.final;
  }

  private advance(): void {
    if (this.stageIndex + 1 >= STAGES.length) return;
    this.stageIndex += 1;
    saveM4ssStage(this.stageIndex);

    /*
     * The whole stage node goes, and everything in it is built again.
     *
     * The camera and the lights are children of the RIG rather than of the stage, so they
     * survive - which is what makes this cheap enough to be worth doing the blunt way.
     * Everything else is generated from the World: a sprite per growth, a slab per gate, a
     * press per crusher, a curtain per vine. Reconciling two of those lists against each
     * other would be real machinery in service of saving one frame, and the frame in question
     * is the one where the portal flares.
     */
    this.stage?.destroy();
    this.stage = null;
    this.anchorNodes.clear();
    this.gateNodes.length = 0;
    this.buttonNodes.length = 0;
    this.buttonFlags.length = 0;
    this.crusherNodes = [];
    this.draughtNodes = [];
    this.critterNodes = [];
    this.trail.length = 0;
    this.trailNode = null;
    this.trailEdge = null;
    this.flightDots.length = 0;
    this.lastStamp = null;
    this.growthArt.clear();
    this.emberNodes.clear();
    this.presenceNodes.clear();
    this.shedMarkers.length = 0;
    this.denied = null;
    this.vineMaps.length = 0;
    this.body = null;
    this.shine = null;
    this.belly = null;
    this.rim = null;
    this.strays = null;
    this.cord = null;
    this.portal = null;
    this.slimeGlow = null;
    this.portalAt = null;
    this.hoverHalo = null;
    // The plates are DOM, so destroying the stage node does not take them with it.
    for (const sign of this.signLabels) sign.el.remove();
    this.signLabels.length = 0;
    this.latchRing = null;
    this.target = null;
    this.flies.length = 0;
    this.airMotes.length = 0;
    this.canopy = null;
    this.vignette = null;

    this.state = makeState(STAGES[this.stageIndex](), 40);
    this.clearInput();
    this.growthNoticeUntil = 0;
    this.cleared = false;
    this.swallowed = false;
    this.latched = null;
    this.hovered = null;
    this.splitHold = 0;
    this.carry = 0;
    this.heardButtons.clear();
    this.heardGates.clear();
    this.wasOwned = 0;
    for (const b of this.bursts) b.node.destroy();
    this.bursts.length = 0;
    // Start looking at the bottom of the room, which is where the player is standing.
    this.cameraY = this.state.world.height - VIEW_WIDTH / CAMERA_ASPECT / 2;

    const stage = ENGINE.SceneNode.create({ name: 'M4SSStage' });
    stage.scale.set(SCALE, -SCALE, SCALE);
    this.add(stage);
    this.stage = stage;

    this.buildLevel();
    this.buildPortal(this.state.world);
    this.buildSlimeGlow();
    this.buildSlime();
  }

  /**
   * Turn state TRANSITIONS into cues, once per frame, after the sim has stepped.
   *
   * Everything here is an edge detector, and that is the whole design: the sim owns what
   * happened, the rig only notices that it changed. No cue fires from a state being true -
   * a body that stays attached is holding on, not latching sixty times a second.
   */
  private hearWorld(): void {
    const state = this.state;
    if (!state) return;
    const world = state.world;
    const mine = owned(state);

    // The creature's filter follows the fling's slow motion. Heard, not just seen.
    this.voice.setSlowmo(state.slowmo);

    /*
     * The column, on entry and on refusal, and each only once.
     *
     * draftOn returns the column WITH a lift of zero when the body is too heavy, which is why
     * it hands back the pair rather than a boolean - and it is the reason there are two cues
     * here rather than one. Rising and being refused are different events and the player
     * needs to tell them apart without reading the HUD line.
     *
     * Edge-triggered on both. A draught is a place, not an impulse: the body is inside it for
     * seconds at a time, and playing on every frame it is in there would be a buzz rather
     * than a sound. The state is remembered so the cue fires when the body ENTERS the column
     * and again only if it leaves and comes back.
     */
    const inDraught = draftOn(state);
    const draughtNow = inDraught ? (inDraught.lift > 0 ? 'lift' : 'refused') : 'none';
    if (draughtNow !== this.wasDraught) {
      if (draughtNow === 'lift') this.voice.play('draught');
      else if (draughtNow === 'refused') this.voice.play('refused');
      this.wasDraught = draughtNow;
    }

    // Latch, snap, release. Snap wins over release: both drop `attached` in one frame,
    // and the tear is the one the player needs to hear.
    if (state.attached && !this.wasAttached) this.voice.play('latch');
    if (state.snapped > this.wasSnapped) {
      this.voice.play('snap');
    } else if (!state.attached && this.wasAttached && this.latched === null) {
      this.voice.play('release');
    }

    /*
     * A crush is a mass drop the player did not ask for. The split handler flags its own
     * drops and the snap already sounded above, so whatever ownership loss remains this
     * frame was a press closing on the body.
     */
    if (!this.justSplit && state.snapped === this.wasSnapped && mine.length < this.wasOwned) {
      this.voice.play('crush');
      /*
       * The crush is the one event allowed to borrow the fling's slow motion. Half a
       * second at half depth: enough that the player SEES what the press took - the
       * moment costs mass, and a cost nobody witnessed is a bug report - without the
       * full held-breath treatment the fling earns.
       */
      state.slowmo = Math.max(state.slowmo, 0.5);
      const at = centroid(mine.length > 0 ? mine : state.particles);
      this.burst(at.x, at.y, '#4e7a52', 14, 260);
    }
    this.justSplit = false;

    // Landing: airborne last frame, grounded now, and the fall was a real one. The
    // threshold keeps the crawl's constant micro-hops silent.
    let grounded = 0;
    let vy = 0;
    for (const q of mine) {
      if (q.grounded) grounded += 1;
      vy += (q.y - q.py) / TUNING.dt;
    }
    const airborne = mine.length > 0 && grounded / mine.length < 0.2;
    if (airborne) this.fallSpeed = vy / Math.max(1, mine.length);
    if (this.wasAirborne && !airborne && this.fallSpeed > 260) {
      this.voice.play('land');
      // Dust at the body's underside, scaled by how hard the fall was.
      const at = centroid(mine);
      let low = 0;
      for (const q of mine) low = Math.max(low, q.y);
      this.burst(at.x, low, '#6b7a6b', this.fallSpeed > 500 ? 10 : 6, 150);
    }

    // The level's own machinery announces its transitions.
    for (const button of world.buttons) {
      if (button.pressed && !this.heardButtons.has(button)) {
        this.heardButtons.add(button);
        if (this.stageIndex === 2 && button.activates?.length) {
          this.growthNoticeUntil = state.time + 4;
        }
        this.voice.play(button.force !== undefined ? 'heavy' : 'button');
        this.burst(button.x, button.y - 6, '#ffd27a', 8, 190);
        // The heavy button is the one place the camera itself flinches. See follow().
        if (button.force !== undefined) this.shake = 0.35;
      }
    }
    for (const gate of world.gates) {
      if (gate.open && !this.heardGates.has(gate)) {
        this.heardGates.add(gate);
        this.voice.play(gate.mode === 'bridge' ? 'bridge' : 'gate');
      }
    }

    this.wasAttached = state.attached;
    this.wasSnapped = state.snapped;
    this.wasOwned = mine.length;
    this.wasAirborne = airborne;
  }

  private replace(node: ENGINE.MeshNode | null, geometry: THREE.BufferGeometry): void {
    if (!node) return;
    const mesh = node as unknown as { geometry?: THREE.BufferGeometry };
    mesh.geometry?.dispose();
    mesh.geometry = geometry;
  }

  private paintSlime(): void {
    const state = this.state;
    if (!state) return;
    // Contained. There is nothing left to draw, and drawing it would put it back.
    if (this.swallowed) return;

    // The level is y-down and the world is y-up, so the contour is built flipped.
    // Level coordinates: the stage flips and scales them.
    this.paintTrail(state);
    const mine = owned(state).map((p) => ({ x: p.x, y: p.y - BLOB_LIFT }));
    this.paintSwingShape(state, mine);

    /*
     * While hanging, the body and the growth are one shape.
     *
     * The physics keeps the body on the rope, but nothing about the RENDER said so - the
     * slime swung through the air with a visible gap between it and the thing it was holding,
     * which reads as magnetism, not grip. So while attached, a chain of field points runs
     * from the body's nearest edge up to the growth, into the same metaball surface the body
     * is drawn from. Marching squares merges them, and the swing becomes an octopus arm: one
     * silhouette, thin where it holds on, pooled below.
     *
     * The points shrink toward the growth (via `r`, the per-point field radius) so the arm
     * tapers instead of being a sausage of body-width all the way up.
     */
    /*
     * Lone particles are CULLED from the draw, not from the sim. A particle knocked a
     * body-width clear of everyone else renders as a single 4px island popping around the
     * creature - the playtest's "static pixels that follow it". The physics still owns
     * the particle and cohesion pulls it home within a few frames; the render just
     * declines to advertise the excursion. Pairs and better still draw, because a real
     * shed lump must never be invisible.
     */
    const isLone = (q: { x: number; y: number }, group: Array<{ x: number; y: number }>): boolean => {
      for (const o of group) {
        if (o === q) continue;
        if (Math.hypot(o.x - q.x, o.y - q.y) < 24) return false;
      }
      return true;
    };
    const drawn: Array<{ x: number; y: number; r?: number }> = mine.filter(
      (q) => mine.length <= 3 || !isLone(q, mine)
    );
    if (state.attached && this.latched && mine.length > 0) {
      const grip = this.latched;
      let near = mine[0];
      let best = Infinity;
      for (const q of mine) {
        const d = Math.hypot(q.x - grip.x, q.y - grip.y);
        if (d < best) {
          best = d;
          near = q;
        }
      }
      const links = Math.max(2, Math.ceil(best / 6));
      for (let i = 1; i <= links; i++) {
        const t = i / links;
        drawn.push({
          x: near.x + (grip.x - near.x) * t,
          y: near.y + (grip.y - near.y) * t,
          // Full body-field at the shoulder, slim at the growth.
          r: 15 * (1 - t * 0.6),
        });
      }
    }
    /*
     * ROUNDER, per the playtest - and done here, in the drawing, rather than in the sim.
     *
     * The obvious lever was the physics: `roundness` sets the radius inside which surface
     * tension leaves a particle alone, and tightening it from 0.5 to 0.44 did give a
     * rounder creature. It also cost the swing most of its energy - the measured top of a
     * pumped arc fell from 2.3 rad/s to 0.8, because a tighter skin is a stronger internal
     * damper - and the swing is the entire game. So the sim keeps its slack and the
     * RENDER does the rounding, which is free and touches nothing the player can feel.
     *
     * A bigger field radius per particle with a matching threshold rise fills the crevices
     * between particles without inflating the silhouette: the blob is the same size, its
     * outline is smoother, and small internal dents stop showing.
     */
    this.replace(this.body, buildSurface(drawn, { cell: 3, radius: 21, threshold: 1.55 }));
    // A second contour at a lower threshold is a rim: the same shape, slightly fatter.
    this.replace(this.rim, buildSurface(drawn, { cell: 4, radius: 21, threshold: 1.2 }));

    /*
     * Shading, from two more contours at HIGHER thresholds - see shineMaterial.
     *
     * The field is sampled from the same points, so both shapes are nested inside the body
     * and follow every deformation of it for free. The offsets are applied to the SOURCE
     * POINTS rather than to the mesh: shifting the finished geometry would slide the highlight
     * off the silhouette on a fast-moving blob, whereas shifting the field keeps it inside.
     *
     * y is negative-up in level space, so -7 lifts the shine and +6 drops the belly.
     *
     * ## The shine leans into the direction of travel
     *
     * A highlight pinned to the top of the body is a highlight painted ON the slime; a real
     * one sits where the surface faces the light, and on something this soft the surface
     * facing up-and-forward is whichever way the mass is piling as it moves. So the shine's
     * offset carries a horizontal component taken from the body's own velocity, smoothed hard
     * - the raw value is jittery enough to make the highlight buzz, and a highlight that
     * buzzes is worse than one that never moves.
     *
     * Clamped, because a fast swing would otherwise throw the shine clean off the silhouette
     * and leave a bright crescent floating beside the creature.
     */
    let vx = 0;
    for (const q of owned(state)) vx += q.x - q.px;
    const drift = mine.length > 0 ? vx / mine.length / TUNING.dt : 0;
    this.shineLean += (Math.max(-9, Math.min(9, drift * 0.02)) - this.shineLean) * 0.06;

    const lifted = mine.map((q) => ({ x: q.x + this.shineLean, y: q.y - 7 }));
    const dropped = mine.map((q) => ({ x: q.x - this.shineLean * 0.4, y: q.y + 6 }));
    // Belly and shine ride the same fatter field, so they stay nested inside the rounder
    // body rather than poking through the places its outline just filled in.
    this.replace(this.belly, buildSurface(dropped, { cell: 4, radius: 21, threshold: 2.15 }));
    this.replace(this.shine, buildSurface(lifted, { cell: 4, radius: 21, threshold: 3.1 }));
    // Same lone-pixel rule as the body: a shed LUMP draws, a shed CRUMB of one particle
    // mid-flight does not - it reads as a stray pixel, and it lands and clusters soon.
    const strandedAll = loose(state).map((p) => ({ x: p.x, y: p.y - BLOB_LIFT }));
    const strandedPoints = strandedAll.filter(
      (q) => strandedAll.length <= 2 || !isLone(q, strandedAll)
    );
    this.replace(this.strays, buildSurface(strandedPoints, { cell: 4, radius: 21, threshold: 1.55 }));

    /*
     * The reaching cord is not drawn.
     *
     * A pale blue line from the body to the tip, shown while the button is held and the
     * tendril has not landed. Asked for it to go, and it is the right call: it is the only
     * thing in this stage wearing a colour from outside the palette - everything else is the
     * slime's greens, the lantern's lemon or the room's browns - so a hard cyan stroke over
     * the top of it read as UI drawn on the world rather than as part of the creature.
     *
     * What is lost is a feedback channel: it was the confirmation that a hold had been
     * registered before the tendril landed. The grip flash and the ring around a growth in
     * range both still say that, which is why this can go without replacing it - but if
     * reaching starts to feel unresponsive, this is the thing that was carrying it, and the
     * fix is a version of it in the slime's own colour rather than the return of this one.
     *
     * Nothing is done here at all. The node is created empty in mount() and never filled,
     * so clearing it per frame would allocate a BufferGeometry every frame to say the same
     * nothing - which is what the first version of this hiding did.
     */

    /*
     * The eyes, last, so they know where the body ended up this frame.
     *
     * Anchored at the 25th percentile of the body's own y (its upper shoulder) rather
     * than its bounding top: while hanging, the shape runs all the way up the tendril,
     * and eyes at the bounding top would sit on the arm. The percentile stays on the
     * pooled bulb wherever the mass actually is. Hidden during a fast spin - a face that
     * stays upright through a 360 reads as a sticker, and motion is allowed to blur.
     */
    const spinning = Math.abs(state.spin) > 2.5;
    if (mine.length === 0 || spinning) {
      for (const eye of this.eyes) eye.visible = false;
    } else {
      const ys = mine.map((q) => q.y).sort((a, b) => a - b);
      const xs = mine.map((q) => q.x);
      const cx = xs.reduce((a, b) => a + b, 0) / xs.length + this.shineLean * 1.4;
      const top = ys[Math.floor(ys.length * 0.25)];
      const k = Math.max(0.7, Math.min(1.3, Math.sqrt(mine.length / 40)));
      // The blink: a long wait, then twelve frames of squash.
      this.blinkWait -= 1;
      if (this.blinkWait <= 0) {
        this.blinkT = 12;
        this.blinkWait = 500 + Math.floor(Math.random() * 400);
      }
      if (this.blinkT > 0) this.blinkT -= 1;
      const squash = this.blinkT > 0 ? 0.15 : 1;
      this.eyes.forEach((eye, i) => {
        eye.visible = true;
        eye.position.x = cx + (i === 0 ? -5.5 : 5.5) * k;
        eye.position.y = top + 9 * k;
        eye.scale.set(k, k * squash, 1);
      });
    }
  }

  /** A quad from the body to wherever the tendril has got to, thinning as it goes. */
  /**
   * Kept, and currently unused - see the reaching cord in paintBody.
   *
   * Deliberately not deleted. The cord was hidden for its COLOUR rather than its existence,
   * and the note there says the likely successor is this same ribbon in the slime's own
   * green. Deleting the builder would make that a rewrite instead of a one-line change, and
   * this is the kind of geometry that took several passes to stop looking like a wire.
   */
  private cordGeometry(
    from: { x: number; y: number },
    to: { x: number; y: number },
    straining: boolean
  ): THREE.BufferGeometry {
    const ax = from.x;
    const ay = from.y;
    const bx = to.x;
    const by = to.y;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const wide = straining ? 3 : 7;
    const thin = 2.5;
    const v = [
      ax + nx * wide, ay + ny * wide, 0,
      ax - nx * wide, ay - ny * wide, 0,
      bx - nx * thin, by - ny * thin, 0,
      ax + nx * wide, ay + ny * wide, 0,
      bx - nx * thin, by - ny * thin, 0,
      bx + nx * thin, by + ny * thin, 0,
    ];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.computeVertexNormals();
    return g;
  }

  /**
   * Everything the world does on its own, once a frame.
   *
   * Takes the frame's real delta rather than the simulation's fixed step, and that is the
   * correct choice here even though the physics deliberately does the opposite: the physics
   * is fixed-step so a measurement taken headlessly and a session played on somebody's machine
   * cannot disagree. Nothing on this page is measured. It is drift and glow, and drift wants
   * to look the same speed at 60fps as at 240.
   */
  private paintWorld(deltaTime: number): void {
    const state = this.state;
    if (!state) return;

    /*
     * The flora sways.
     *
     * Two different motions for two different things, because a plant rooted in stone and a
     * curtain of vines hanging off a ledge do not move alike. The bushes ROTATE, slowly and by
     * about a degree and a half, each on its own phase taken from its x position so no two are
     * ever in step - a stand of plants moving in unison reads as a single object wobbling. The
     * vine curtains DRIFT sideways instead, via a texture offset, because they are wide flat
     * planes and rotating one visibly swings its far end through the platform it hangs from.
     *
     * The amplitudes are deliberately small. This is air moving through a sealed cavern, not
     * wind, and anything large enough to notice consciously is too large.
     */
    this.artClock += deltaTime;
    for (const [anchor, node] of this.anchorNodes) {
      const phase = anchor.x * 0.021;
      node.rotation.z = Math.sin(this.artClock * 0.55 + phase) * 0.026;
    }
    for (const vine of this.vineMaps) {
      vine.map.offset.x = Math.sin(this.artClock * 0.34 + vine.phase) * 0.006;
    }


    /*
     * The portal breathes, and notices when you arrive.
     *
     * Re-drawn at about eight frames a second rather than every frame: the membrane is a
     * hundred and fifty concentric bands and regenerating it at 240Hz is real cost for an
     * animation nobody can see moving that fast. Eight is enough to read as alive.
     */
    if (this.portal && this.portalAt) {
      this.portalPhase += 1 / 120;
      const step = Math.floor(this.portalPhase * 8);
      if (step !== this.lastPortalStep) {
        this.lastPortalStep = step;
        const material = this.portal.material as THREE.MeshBasicMaterial;
        material.map?.dispose();
        material.map = portalTexture('portal', this.portalPhase);
        material.needsUpdate = true;
      }

      /*
       * Stage one ends when the body reaches the portal - not when it touches the shelf.
       * Landing on the exit and stopping short of the arch is a landing, not an arrival.
       */
      const body = owned(state);
      if (!this.cleared && body.length > 0) {
        const at = centroid(body);
        const d = Math.hypot(at.x - this.portalAt.x, at.y - this.portalAt.y);
        if (d < 70) {
          this.cleared = true;
          this.portal.scale.set(1.25, 1.25, 1.25);
          this.voice.play('portal');
          /*
           * Both portals swallow. The last one used to skip straight to contain().
           *
           * The wormhole was written as a BETWEEN-stages transition, so it only ran when
           * there was a next stage to go to - and the final portal, the one that ends the
           * whole mission, was the single place in the game where the creature simply
           * stopped existing instead of being drawn in. That is the last thing the player
           * sees of it, and it was the only arrival with no arrival.
           */
          this.beginWarp(this.stageIndex + 1 >= STAGES.length);
        }
      }
    }

    /*
     * The gate slides up out of its own doorway.
     *
     * Cosmetic only - collision flipped the moment the button went down. A gate whose
     * collision followed the animation is a gate that can close on a slime halfway through
     * it, and there is no frame of that which is not a bug.
     */
    for (const { node, gate, restY } of this.gateNodes) {
      if (gate.mode === 'bridge') {
        /*
         * A drawbridge falls rather than lifts, and the animation is the whole point of it.
         *
         * Collision flipped the instant the button went down, exactly as it does for a lift
         * gate - what is animated here is only what the player watches. And they must watch
         * it: the button is a hundred and fifty pixels above the slab and eighty to the west,
         * which is where it is precisely so the fall happens in view. A bridge that is simply
         * already down when you look back is a door.
         *
         * Rotated about the hinge at its foot, so it sweeps through the arc rather than
         * fading between two states. The position is interpolated toward where the fallen
         * span sits, because the slab pivots about its base and its CENTRE therefore travels.
         *
         * ## The sign, which was wrong from the day this was written
         *
         * `downY` negated the span's centre. Everything else in this file places children in
         * raw LEVEL coordinates - y positive, downward - because the stage node is scaled with
         * a negative y and does the flip once for all of them (see SCALE). `restY` two lines
         * up is positive for exactly that reason. So a bridge did not fall: it travelled from
         * +945 to -1065 and left the world through the ceiling, and the deck stayed solid the
         * whole time because collision never reads the mesh.
         *
         * It survived because no stage had ever set `mode: 'bridge'`. Dead code does not have
         * bugs; it has bugs the first time somebody uses it, and the report was "I managed to
         * activate the button, but I can just move over nothing to the other side".
         */
        const t = gate.lift;
        const eased = t * t * (3 - 2 * t);
        node.rotation.z = eased * (Math.PI / 2);
        const span = gate.span;
        if (span) {
          const downX = span.x + span.w / 2;
          const downY = span.y + span.h / 2;
          node.position.x = (gate.x + gate.w / 2) + (downX - (gate.x + gate.w / 2)) * eased;
          node.position.y = restY + (downY - restY) * eased;
        }
      } else {
        node.position.y = restY - gate.lift * (gate.h + 4);
      }
    }
    for (const { node, button } of this.buttonNodes) {
      const material = node.material as THREE.MeshBasicMaterial;
      material.color.set(button.pressed ? '#7fe08a' : '#d8703c');
      node.position.y = button.y + (button.pressed ? 2 : 6);
    }

    /*
     * The slime's glow follows the body and scales with what is left of it.
     *
     * Radius from the square root of the mass, because that is how the body's own radius
     * grows - a glow that scaled linearly would outrun the creature as it got bigger and be
     * swallowed by it as it shrank.
     */
    if (this.slimeGlow) {
      const body = owned(state);
      if (body.length > 0) {
        const at = centroid(body);
        this.slimeGlow.position.set(at.x, at.y, 3);
        const k = Math.sqrt(body.length / Math.max(1, state.startMass));
        this.slimeGlow.scale.set(0.55 + k * 0.75, 0.55 + k * 0.75, 1);
        this.slimeGlow.visible = true;
      } else {
        this.slimeGlow.visible = false;
      }
    }

    /*
     * Growths go red when they are out of reach.
     *
     * The one piece of help the greybox gives, and it is here so the TEST works: a player
     * who cannot see what is in range cannot tell a mechanic from a bug in the two minutes
     * they will spend with this.
     */
    for (const entry of this.crusherNodes) {
      const { node, crusher } = entry;
      const at = crusherRect(crusher);
      node.position.set(at.x + at.w / 2, at.y + at.h / 2, -20);
      /*
       * The slam. The winch-hang-drop profile accelerates the head into the floor and used
       * to land it in silence - all that anticipation, no punctuation. Dust bursts off both
       * edges of the striking face and the camera takes a kick smaller than the heavy
       * door's (0.22 against 0.35): the door is a story beat, the press is weather.
       */
      const slammed = crusher.at >= crusher.travel - 1 && entry.prevAt < crusher.travel - 6;
      if (slammed) {
        const floorY = crusher.y + crusher.at + crusher.h;
        this.burst(crusher.x - 4, floorY - 4, '#6b7a6b', 7, 210);
        this.burst(crusher.x + crusher.w + 4, floorY - 4, '#6b7a6b', 7, 210);
        this.shake = Math.max(this.shake, 0.22);
      }
      entry.prevAt = crusher.at;
    }

    /*
     * The columns scroll, and brighten while they are carrying something.
     *
     * The scroll is in TEXTURE space, so the speed on screen is the same whatever height the
     * level gave the shaft - offset is in repeats, and one repeat is 320 level pixels. 0.9
     * repeats a second is roughly 290px/s, which is the rise the column actually delivers
     * (measured at 674px in 2.5s); air that moves slower than the thing it is lifting reads
     * as the body being winched rather than blown.
     *
     * MINUS, and the sign is not obvious. Raising a texture's offset shifts the sampled
     * coordinate up, which moves the image DOWN - and then the stage node's negative y scale
     * flips it again. Two inversions that cancel to "the obvious sign is wrong", which is why
     * the column shipped blowing downwards. There is no reasoning about this that is faster
     * than looking at it.
     *
     * The brightness asks the SIM whether the draught is doing anything, through the same
     * `draftLift` the force block uses. A column that looks like it is lifting you and is not
     * would be worse than no art at all - it is the one thing here the player has to be able
     * to trust, because the rule it is reporting has no other visible form.
     */
    if (this.draughtNodes.length > 0 && this.state) {
      const body = owned(this.state);
      const at = body.length > 0 ? centroid(body) : null;
      for (const entry of this.draughtNodes) {
        entry.map.offset.y -= deltaTime * 0.9;
        if (entry.map.offset.y < 0) entry.map.offset.y += 1;
        const lifting = at ? draftLift(entry.draft, at, body.length) : 0;
        entry.glow += (lifting - entry.glow) * Math.min(1, deltaTime * 6);
        const mat = entry.face.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.62 + entry.glow * 0.34;
      }
    }

    /*
     * The critters walk, and stand still when they are not walking.
     *
     * `phase` only advances in the sim while the creature is actually moving, so the pause at
     * each end of the beat is a real pause rather than a walk cycle playing on the spot -
     * which is the tell that separates a creature from a texture on rails. 10fps is the rate
     * the frames were generated for; anything faster turns a waddle into a scurry.
     *
     * The sprite is drawn facing west, so a negative x scale is what "walking east" means.
     */
    for (const { node, critter, sprite } of this.critterNodes) {
      node.position.x = critter.x;
      node.position.y = critter.y - SPORELING_H / 2;
      node.scale.x = critter.facing === 1 ? -1 : 1;
      sprite.draw(Math.floor(critter.phase * 10));
    }

    // Pressed buttons sit down into their sockets. Eased, so the press reads as travel
    // rather than as a swap; level space is y-down, so +y is into the floor.
    for (const { node, button } of this.buttonNodes) {
      /*
       * A floor plate sinks into its socket when pressed. A wall striker does not sink
       * DOWN - it is hit sideways, and it rides its gate upward the moment it fires, so
       * its y belongs to the sim and the rig must not fight it for it.
       */
      if (button.vertical) {
        node.position.y = button.y;
        node.position.x = button.x + (button.pressed ? 5 : 0);
        continue;
      }
      const target = button.y + 6 + (button.pressed ? 7 : 0);
      node.position.y += (target - node.position.y) * 0.25;
    }
    // The chevron bobs while its plate is up, and goes out when the plate goes down.
    for (const { node, button } of this.buttonFlags) {
      /*
       * The chevron is a nearby hint, not a permanent fixture. Hung in mid-air with no
       * tether it read as a floating pickup from across the room; inside ~500px it is
       * doing its actual job - "this plate, here" - and past that it goes out. Visibility
       * rather than opacity, because per-frame material opacity does not survive MeshNode.
       */
      const me = this.state ? centroid(owned(this.state)) : null;
      const near = me ? Math.hypot(me.x - button.x, me.y - button.y) < 520 : true;
      node.visible = !button.pressed && near;
      if (!button.pressed) {
        node.position.x = button.x;
        node.position.y = button.y - 54 + Math.sin(this.artClock * 3.4 + button.x) * 5;
      }
    }

    const mine = owned(state);
    if (mine.length === 0) return;
    const home = centroid(mine);
    const limit = reachOf(state);

    /*
     * Which growth the pointer is over, and whether it is worth lighting.
     *
     * Resolved here rather than on mousemove because it depends on the body's reach, which
     * changes every frame as mass is shed and recovered. A hover computed at pointer-move
     * time would go stale the moment the player split.
     */
    /*
     * The hover highlight follows the TARGET now, not the pointer. The growth that would
     * be caught is the growth that should look catchable, and since the ring already says
     * which one that is, the two have to agree - a plant lit as reachable while the ring
     * sits on its neighbour is worse than no feedback at all.
     */
    this.chooseTarget();
    this.hovered = this.target;
    void limit;

    /*
     * The flies orbit, and the air drifts. Both are animated here rather than baked into a
     * texture, which is the entire distinction between motes that read as life and motes
     * that read as dead pixels stuck to the screen.
     */
    for (const fly of this.flies) {
      const dead = fly.anchor.live === false;
      fly.node.visible = !dead;
      if (dead) continue;
      const t = this.artClock * fly.speed + fly.phase;
      fly.node.position.x = fly.anchor.x + Math.cos(t) * fly.radius;
      fly.node.position.y = fly.anchor.y + Math.sin(t * 1.3) * fly.radius * fly.squash;
    }
    {
      const w = state.world.width;
      const h = state.world.height;
      for (const mote of this.airMotes) {
        const at = mote.node.position;
        at.x += (mote.vx + Math.sin(this.artClock * 0.7 + mote.phase) * mote.wobble) * deltaTime;
        at.y += mote.vy * deltaTime;
        // Wrap rather than respawn: the room keeps exactly the amount of air it started
        // with, and nothing ever pops into existence in front of the player.
        if (at.y < -20) {
          at.y = h + 20;
          at.x = Math.random() * w;
        }
        if (at.x < -20) at.x = w + 20;
        if (at.x > w + 20) at.x = -20;
      }
    }

    /*
     * Shed-mass markers: a chevron over each lump left behind, up to three, bobbing.
     * The HUD counts what is missing; these say WHERE - the half of the question a
     * count cannot answer, and the playtest asked for exactly this.
     */
    {
      const clusters = components(loose(state))
        .filter((cluster) => cluster.length >= 2)
        .sort((a, b) => b.length - a.length)
        .slice(0, 3);
      while (this.shedMarkers.length < clusters.length) {
        const marker = decorMesh(
          'ShedMarker',
          new THREE.PlaneGeometry(26, 26),
          this.artMaterial({ map: markerTexture(), transparent: true, depthWrite: false })
        );
        marker.position.set(-999, -999, 34);
        this.stage?.add(marker);
        this.shedMarkers.push(marker);
      }
      this.shedMarkers.forEach((marker, i) => {
        const cluster = clusters[i];
        marker.visible = Boolean(cluster);
        if (!cluster) return;
        const c = centroid(cluster);
        marker.position.x = c.x;
        marker.position.y = c.y - 34 + Math.sin(this.artClock * 3 + i) * 4;
      });
    }

    // A growth clicked from beyond reach flashes warm and the HUD says why. Without this
    // the tendril reaches, falls short, and retracts - which reads as a dropped click.
    if (this.denied) {
      this.denied.t -= 1 / 60;
      const node = this.anchorNodes.get(this.denied.anchor);
      if (node) {
        const material = node.material as THREE.MeshBasicMaterial;
        if (this.denied.t > 0) material.color.set('#e0a060');
        else this.denied = null;
      } else {
        this.denied = null;
      }
    }

    /*
     * The halo follows the hover, breathing so it reads as live rather than painted.
     *
     * Shown with `visible` and sized with `scale`, NOT by fading the material's opacity -
     * the latch ring proved that opacity written from the frame loop never reaches the
     * renderer through a MeshNode here. This halo has been faded in and out since the pass
     * that added it and has therefore never once appeared on screen, which is a fair part
     * of why the playtest kept saying growths did not respond to the pointer. The fade is
     * gone; it snaps on, and the breathe carries the life.
     */
    if (this.hoverHalo) {
      if (this.hovered) {
        this.hoverHalo.visible = true;
        this.hoverHalo.position.x = this.hovered.x;
        this.hoverHalo.position.y = this.hovered.y;
        const breathe = 1 + Math.sin(this.artClock * 5) * 0.06;
        this.hoverHalo.scale.set(breathe, breathe, 1);
      } else {
        this.hoverHalo.visible = false;
      }
    }
    for (const [anchor, node] of this.anchorNodes) {
      const within = Math.hypot(anchor.x - home.x, anchor.y - home.y) <= limit;
      /*
       * The bush is TINTED, not recoloured.
       *
       * A flat ring could be switched green-to-red and stay legible. A painted sprite cannot:
       * multiplying it by red turns a plant into a stain. So in-reach is full colour, out of
       * reach is a cold desaturated blue-grey - the plant reading as "not lit, not yours" -
       * and the one you are hanging from goes bright. That is a value change rather than a
       * hue change, which is how the reference sheet distinguishes its interactables.
       */
      const material = node.material as THREE.MeshBasicMaterial;
      /*
       * Four states, and they are ordered by what the player most needs to know.
       *
       * DEAD comes first and overrides everything. A red growth is not a growth you cannot
       * quite reach, it is one that does not work, and the two must never be confusable -
       * the whole second clause of stage two is the player learning to tell them apart from
       * across a room. So it is a hue change where every other state here is a value change:
       * red is the only warm thing in a green stage and it reads instantly.
       *
       * Then HELD, then HOVERED, then merely in reach. Hovering only lights a growth the
       * body could actually get to, which makes the pointer a rangefinder rather than a
       * cursor - sweeping it across the room answers "what can I do from here" without a
       * single line of UI.
       */
      const dead = anchor.live === false;
      const ember = this.emberNodes.get(anchor);
      if (ember) ember.visible = dead;
      /*
       * The presence halo breathes on its SCALE, and hides with `visible`. Its opacity
       * was being written every frame and never reaching the renderer (see the latch
       * ring), so a dead growth's halo was not actually going out - it just kept the
       * opacity it was created with. On a stage whose second clause is telling a live
       * growth from a dead one, that is a mechanic leaking, not a decoration.
       */
      const presence = this.presenceNodes.get(anchor);
      if (presence) {
        presence.visible = !dead;
        const breathe = 1 + Math.sin(this.artClock * 2.2 + anchor.x) * 0.07;
        presence.scale.set(breathe, breathe, 1);
      }
      const art = this.growthArt.get(anchor);
      const wanted = art ? (dead ? art.dead : art.live) : null;
      if (wanted && material.map !== wanted) {
        /*
         * Waking is a moment now. The texture used to swap silently - the stage's biggest
         * state change (the shaft going from impossible to open) happened with less
         * fanfare than a button press. Ash floods to lemon AND the lantern throws sparks.
         */
        if (!dead && material.map === art?.dead) {
          this.burst(anchor.x, anchor.y, '#d8f26a', 12, 240);
          this.shake = Math.max(this.shake, 0.12);
        }
        material.map = wanted;
        material.needsUpdate = true;
      }
      const hovered = !dead && anchor === this.hovered;
      if (this.denied && this.denied.anchor === anchor && this.denied.t > 0) continue;
      /*
       * The tint is nearly gone, and this is why.
       *
       * Multiplying the sprite by #5a6f78 when out of reach was draining a cold blue-grey
       * over it, and since a body standing anywhere but right underneath is out of reach
       * most of the time, that WAS the growth's normal appearance - dark, desaturated and
       * nothing like the creature it is made of. It looked like the fog had it; the fog
       * was seventy units behind it and innocent.
       *
       * That tint was also doing a job the game now does better elsewhere. It existed to
       * answer "can I get to that", and the pulsing ring answers it outright, on the one
       * growth the click would actually take. So reachability drops to a whisper here - a
       * slight dim, still green, still plainly the same substance as the mass - and the
       * ring carries the message.
       *
       * DEAD still overrides everything as a hue change rather than a value one: red is
       * the only warm thing in a green stage and the whole second clause of stage two is
       * telling the two apart across a room.
       */
      /*
       * NO TINT AT ALL any more, in any state.
       *
       * The last version still multiplied out-of-reach growths by #c2d8bc, and that was
       * the reason the pane could never match the mass: a body standing anywhere but
       * directly underneath is out of reach, so four fifths brightness WAS the lantern's
       * normal appearance, and no amount of brightening the texture could show through a
       * multiply applied on the way to the screen.
       *
       * Nothing is lost by dropping it. Reachability is answered by the pulsing ring, on
       * the one growth a click would actually take, which is both more precise than a
       * tint and legible at a glance. Dead growths are already a different SPRITE - ember
       * red, no filament - so they never needed the tint either.
       */
      material.color.set('#ffffff');
      // A growth you are hanging from is doing something, so it reads as bigger. A hovered
      // one leans toward that without arriving, so the two never look the same.
      const scale = anchor === this.latched ? 1.16 : hovered ? 1.1 : 1;
      node.scale.set(scale, scale, scale);
    }
  }

  /**
   * The whole room, held still.
   *
   * It followed the body, and that was wrong for this level before it was wrong for any
   * other reason: the slime lives on the floor, so centring on it puts half the frame below
   * the ground and the ledge the whole test is about off the top. One room that fits on one
   * screen needs no camera work at all, and a greybox with a moving camera is a greybox with
   * two things that can be wrong.
   *
   * Following comes back when there is more level than screen, which is a real problem to
   * solve later and not one to invent now.
   */
  /**
   * Where the camera is looking, in level coordinates.
   *
   * The view is exactly VIEW_WIDTH across and VIEW_WIDTH/aspect tall. A stage that fits in
   * that is framed whole and the camera never moves, which is what stage one wants: the
   * slime lives on the floor, so centring on it puts half the frame underground.
   *
   * A stage taller than the view has to follow, and it follows only in Y. Following in X as
   * well would mean the room drifting under the player on a level that is exactly as wide as
   * the screen, for no gain. Clamped to the level's own bounds so the void never shows.
   *
   * Smoothed, and the smoothing is the part that matters: the body's centroid jumps around
   * during a swing, and a camera locked to it makes the whole room shake at swing frequency.
   */
  private viewCentre(): { x: number; y: number } {
    const world = this.state?.world;
    if (!world) return { x: 0, y: 0 };
    const viewHeight = VIEW_WIDTH / CAMERA_ASPECT;
    if (world.height <= viewHeight) return { x: world.width / 2, y: world.height / 2 };
    const body = this.state ? owned(this.state) : [];
    const wanted =
      body.length > 0
        ? Math.max(viewHeight / 2, Math.min(world.height - viewHeight / 2, centroid(body).y))
        : world.height - viewHeight / 2;
    this.cameraY += (wanted - this.cameraY) * 0.08;
    return { x: world.width / 2, y: this.cameraY };
  }

  /**
   * Put each tutorial plate where its world point is on screen.
   *
   * Percentages rather than pixels, so the labels survive the container being any size -
   * the projection is (world - viewLeft) / viewWidth, which is exactly what the camera
   * does, expressed as a fraction. Called from follow(), which already has the view
   * centre and already runs every frame.
   */
  private placeSigns(at: { x: number; y: number }): void {
    if (this.signLabels.length === 0) return;
    const viewHeight = VIEW_WIDTH / CAMERA_ASPECT;
    for (const sign of this.signLabels) {
      const u = (sign.x - (at.x - VIEW_WIDTH / 2)) / VIEW_WIDTH;
      const v = (sign.y - (at.y - viewHeight / 2)) / viewHeight;
      sign.el.style.left = `${(u * 100).toFixed(3)}%`;
      sign.el.style.top = `${(v * 100).toFixed(3)}%`;
    }
  }

  private follow(): void {
    if (!this.camera || !this.state) return;
    this.keepActive();
    const at = this.viewCentre();
    this.placeSigns(at);
    // Keep the frame closed wherever the camera is: canopy pinned to the view top,
    // vignette centred on the view. Both live in level space, so this is a reposition,
    // not a reparent.
    if (this.canopy) {
      this.canopy.position.x = at.x;
      this.canopy.position.y = at.y - VIEW_WIDTH / CAMERA_ASPECT / 2 + 62;
    }
    if (this.vignette) {
      this.vignette.position.x = at.x;
      this.vignette.position.y = at.y;
    }
    /*
     * The kick: a fast decaying wobble, position only, never the aim. 5px at its hardest
     * - the point is that the DOOR was heavy, not that the camera operator was shot.
     * Deterministic (a sine, not a random walk), so captures are reproducible.
     */
    const shakeScale = accessibleScreenShakeScale();
    if (this.shake > 0 && shakeScale > 0) {
      const k = this.shake / 0.35;
      at.x += Math.sin(this.shake * 70) * 5 * k * shakeScale;
      at.y += Math.cos(this.shake * 55) * 3 * k * shakeScale;
    }
    /*
     * Slow motion pushes the camera in four percent. Together with the veil it is the
     * difference between "the clock changed" and "the world is holding its breath" - and it
     * eases with slowmo's own decay, so the release breathes back out on its own.
     */
    const push = 1 - 0.04 * (this.state?.slowmo ?? 0);
    this.camera.position.copy(place(at.x, at.y).setZ(CAMERA_BACK * push));
    this.aim(this.camera.position, place(at.x, at.y));
  }

  /** Throw a burst of pixel quads from a point. See the bursts field for the philosophy. */
  private burst(x: number, y: number, colour: string, count = 10, speed = 220): void {
    for (let i = 0; i < count; i++) {
      // Fanned by index, not by random - same burst every time, like everything else here.
      const a = (i / count) * Math.PI * 2 + 0.4;
      const v = speed * (0.55 + 0.45 * ((i * 7) % 5) / 4);
      const size = 3 + ((i * 3) % 3) * 2;
      const node = decorMesh(
        'Burst',
        new THREE.PlaneGeometry(size, size),
        this.artMaterial({ color: new THREE.Color(colour), transparent: true, depthWrite: false })
      );
      node.position.set(x, y, 26);
      this.stage?.add(node);
      this.bursts.push({
        node,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v * 0.8 - 120,
        life: 0.45,
      });
    }
  }

  /** Advance and cull the bursts. Level space is y-down; gravity pulls positive. */
  private tickBursts(deltaTime: number): void {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.life -= deltaTime;
      if (b.life <= 0) {
        b.node.destroy();
        this.bursts.splice(i, 1);
        continue;
      }
      b.vy += 750 * deltaTime;
      b.node.position.x += b.vx * deltaTime;
      b.node.position.y -= b.vy * deltaTime;
      const material = b.node.material as THREE.MeshBasicMaterial;
      material.opacity = Math.min(1, b.life / 0.2);
    }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - deltaTime);
  }

  /**
   * Point the camera node at a target.
   *
   * NOT Object3D.lookAt - the same trap OmniscientRig documents. ViewTargetCameraNode is a
   * SceneNode HOLDING a camera rather than being one, so lookAt applies the object
   * convention (+Z toward the target) and the child camera, which looks down -Z, ends up
   * facing exactly backwards.
   */
  private aim(from: THREE.Vector3, at: THREE.Vector3): void {
    if (!this.camera) return;
    AIM.lookAt(from, at, this.camera.up);
    this.camera.quaternion.setFromRotationMatrix(AIM);
  }

  /** Mass, reach, and how much has been left behind - for the readout. */
  public readout(): { mass: number; reach: number; stranded: number } {
    const state = this.state;
    if (!state) return { mass: 0, reach: 0, stranded: 0 };
    return {
      mass: mass(state),
      reach: Math.round(reachOf(state)),
      stranded: loose(state).length,
    };
  }
}
