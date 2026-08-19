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
import { buildSurface } from './surface.js';
import { freshLab } from './lab.js';
import { freshShaft } from './shaft.js';
import { loadM4ssStage, saveM4ssContained, saveM4ssStage } from '../omniscient/session/persistence.js';
import { audio } from '../omniscient/audio/ConsoleAudio.js';
import { SlimeAudio } from './SlimeAudio.js';
import {
  atmosphereTexture,
  backdropTexture,
  endCapTexture,
  canopyTexture,
  domeTexture,
  forestLayer,
  pipeStackTexture,
  markerTexture,
  gateTexture,
  glowTexture,
  interiorFadeTexture,
  plateTexture,
  propTexture,
  setStageTheme,
  THEME_GALLERY,
  THEME_STACK,
  vignetteTexture,
  lipTexture,
  poolTexture,
  sporeTexture,
  bushTexture,
  PAL,
  portalTexture,
  signTexture,
  stoneTexture,
  vineTexture,
} from './stageArt.js';
import {
  TUNING,
  absorbTouching,
  centroid,
  components,
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

import type { Anchor, Button, Crusher, Gate, MassState } from './mass.js';

/**
 * The stages, in order. The portal at the end of one loads the next.
 *
 * Each entry is a factory rather than a World, because a World is mutated by play - gates
 * open, buttons latch, growths wake - and replaying a stage has to start from the authored
 * numbers rather than from however the last attempt left them.
 */
const STAGES = [freshLab, freshShaft];

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

  private body: ENGINE.MeshNode | null = null;
  private shine: ENGINE.MeshNode | null = null;
  /** Where the highlight has leaned to, smoothed. See paintSlime. */
  private shineLean = 0;
  private belly: ENGINE.MeshNode | null = null;
  private rim: ENGINE.MeshNode | null = null;
  private strays: ENGINE.MeshNode | null = null;
  private cord: ENGINE.MeshNode | null = null;
  private readonly anchorNodes = new Map<Anchor, ENGINE.MeshNode>();
  private portal: ENGINE.MeshNode | null = null;
  private slimeGlow: ENGINE.MeshNode | null = null;
  private readonly sporeLayers: Array<{ map: THREE.Texture; speed: number }> = [];
  private readonly vineMaps: Array<{ map: THREE.Texture; phase: number }> = [];
  /** Seconds since the stage was built. Drives every idle animation in the scene. */
  private artClock = 0;
  private portalAt: { x: number; y: number } | null = null;
  private portalPhase = 0;
  private lastPortalStep = -1;
  /** Set the frame the player reaches the portal. The stage is over. */
  private cleared = false;
  /**
   * Called a beat after the LAST portal is reached, if anybody is listening.
   *
   * OmniscientRig sets this to its own exit: M4SS runs inside Keller's contact view, so
   * finishing the specimen hands the screen back to the conversation it interrupted, with
   * her desktop file already flipped to CONTAINED behind it. Left null - the standalone
   * `?game=m4ss` boot - the end state simply holds on screen, which is the right ending
   * for a build with no console to return to.
   */
  public onContained: (() => void) | null = null;
  /** Seconds until onContained fires. -1 is disarmed. See contain(). */
  private containedDelay = -1;

  // -- the voice, and the state edges that trigger it -------------------------------------
  private readonly voice = new SlimeAudio();
  /** Last frame's values, so a cue fires on the TRANSITION and never on the state. */
  private wasAttached = false;
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
  private warp: { t: number; out: boolean } | null = null;
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
  private crusherNodes: Array<{ node: ENGINE.MeshNode; crusher: Crusher }> = [];
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
  private vignette: ENGINE.MeshNode | null = null;
  /** Smoothed camera height, in level coordinates. See viewCentre. */
  private cameraY = 0;

  private readonly gateNodes: Array<{
    node: ENGINE.MeshNode;
    gate: Gate;
    restY: number;
  }> = [];
  private readonly buttonNodes: Array<{ node: ENGINE.MeshNode; button: Button }> = [];

  private readonly held = new Set<string>();
  private latched: Anchor | null = null;
  private recalling = false;
  private splitHold = 0;
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
  private readonly slimeMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#79d9b0'),
    roughness: 0.35,
    metalness: 0.05,
    emissive: new THREE.Color('#2f9a74'),
    side: THREE.DoubleSide,
  });
  private readonly rimMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#2f6b57'),
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
    color: new THREE.Color('#cdf5e0'),
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.5,
    toneMapped: false,
  });
  private readonly bellyMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#3f9a7c'),
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
    this.mounted = false;
    this.setTickEnabled(false);
    this.camera?.setActive(false);
    for (const off of this.detach) off();
    this.detach.length = 0;
    // Disconnect the instrument from the shared bus. The bus itself belongs to the
    // console and stays up - only the slime's routes through it are ours to tear down.
    this.voice.dispose();
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
    key.castShadow = false;
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
    this.theme = this.stageIndex === 0 ? THEME_GALLERY : THEME_STACK;
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
    const stoneMap = stoneTexture(`m4ss-stone-${this.theme.name}`);
    const wallMap = stoneTexture(`m4ss-stone-${this.theme.name}`, 128, 96, 'wall');

    for (const t of world.tiles) {
      /*
       * WALL or FLOOR is a shape question: boundary slabs and tall masses stack, walked
       * surfaces spread. One texture for both was the playtest's complaint ("the tiles
       * for the ground and the walls are the same") and it was right - a room whose
       * ground and walls share a material has no gravity in its art.
       */
      const isWall = t.h > t.w * 1.6;
      const face = (isWall ? wallMap : stoneMap).clone();
      face.needsUpdate = true;
      face.repeat.set(t.w / 128, t.h / 96);
      /*
       * WORLD-ALIGNED offsets: the pattern's origin is the world's, not the tile's, so
       * two tiles that touch continue each other's blocks instead of restarting the
       * pattern at their own corner - which was the visible seam the playtest called
       * "not seamless". One texture, offset per tile, globally continuous.
       */
      face.offset.set((t.x % 128) / 128, 1 - ((t.y + t.h) % 96) / 96);
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
       * A vine curtain over every top edge.
       *
       * This replaces the flat green lip. The lip was doing a real job - outlining the
       * playable surface - and a hard 7px band does it in the most graphic way possible. A
       * ragged curtain of hanging strands outlines the same edge with an irregular boundary,
       * which is what stops a platform reading as a floating slab.
       */
      const vines = vineTexture(`vine-${t.x}-${t.y}`);
      vines.repeat.set(Math.max(1, t.w / 128), 1);
      const curtain = decorMesh(
        'Vines',
        new THREE.PlaneGeometry(t.w, 54),
        this.artMaterial({ map: vines, transparent: true, depthWrite: false })
      );
      curtain.position.set(t.x + t.w / 2, t.y + 22, 2);
      this.stage?.add(curtain);
      this.vineMaps.push({ map: vines, phase: t.x * 0.013 });

      /*
       * The ragged lip, straddling the top edge.
       *
       * Centred ON the edge, so its solid lower half covers the box's own square corner and
       * its broken upper half becomes the silhouette. 34 tall against a 64px texture whose
       * midline is the edge, which puts about 17 units of rubble above the platform - enough
       * to break the line, not enough to look like a wall.
       *
       * Only tiles wide enough to be platforms get one. The boundary walls are 60 wide and
       * 720 tall, and a rubble fringe along the top of a wall that runs off the top of the
       * frame is decoration nobody will ever see.
       */
      /*
       * Standing water, on the wider platforms only.
       *
       * Two per platform at most and never on a ledge narrower than 200, because a pool needs
       * room to read as a pool rather than as a bright smear. Sat at z 5 - above the lip's
       * rubble, below the vines - so the growth at the platform edge still overlaps it and it
       * looks like water lying ON the stone rather than a decal floating over it.
       *
       * These are the brightest pixels in the level and they exist for that reason: eleven
       * passes left `value range` the most stubborn axis in the run, with the whole gap at the
       * top of the range. See poolTexture.
       */
      if (t.w >= 200) {
        const pools = t.w > 340 ? 2 : 1;
        for (let i = 0; i < pools; i++) {
          const pw = Math.round(Math.min(210, t.w * 0.32));
          const px = t.x + t.w * (pools === 1 ? 0.5 : 0.28 + i * 0.44);
          const pond = decorMesh(
            'Pool',
            new THREE.PlaneGeometry(pw, 30),
            this.artMaterial({
              map: poolTexture(`pool-${t.x}-${i}`),
              transparent: true,
              depthWrite: false,
            })
          );
          pond.position.set(px, t.y + 9, 5);
          this.stage?.add(pond);
        }
      }

      /*
       * Broken corners at both ends of every standable slab.
       *
       * Only on tiles that are platforms rather than boundary walls, and only on the ends
       * that face open space - a cap over a corner the player can never see is geometry
       * nobody will ever look at. Mirrored on the left by negating the scale, so one
       * generator serves both sides. See endCapTexture.
       */
      if (t.w >= 120 && t.h < 200) {
        for (const side of [-1, 1] as const) {
          const cap = decorMesh(
            'EndCap',
            new THREE.PlaneGeometry(46, 92),
            this.artMaterial({
              map: endCapTexture(`cap-${t.x}-${side}`),
              transparent: true,
              depthWrite: false,
            })
          );
          const at = side === 1 ? t.x + t.w : t.x;
          cap.position.set(at, t.y + 34, 6);
          cap.scale.set(side, 1, 1);
          this.stage?.add(cap);
        }
      }

      if (t.w >= 120) {
        const lip = lipTexture(`lip-${t.x}-${t.y}`);
        lip.repeat.set(Math.max(1, t.w / 256), 1);
        const fringe = decorMesh(
          'Lip',
          new THREE.PlaneGeometry(t.w, 34),
          this.artMaterial({ map: lip, transparent: true, depthWrite: false })
        );
        fringe.position.set(t.x + t.w / 2, t.y, 4);
        this.stage?.add(fringe);
      }
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
        new THREE.PlaneGeometry(176, 176),
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
      const presence = decorMesh(
        'GrowthPresence',
        new THREE.PlaneGeometry(230, 230),
        this.artMaterial({
          map: glowTexture('presence-glow', '#7fe0a0'),
          transparent: true,
          opacity: a.live === false ? 0 : 0.22,
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
    });

    /*
     * The presses.
     *
     * Deliberately the least organic thing in either stage: flat, cold, and a hue nothing
     * else in the room uses. Everything here that can be interacted with is a plant or is
     * warm; the one thing that can take mass off you should not look like it grew.
     */
    const crusherMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#5c6672'),
      roughness: 0.55,
      metalness: 0.35,
      emissive: new THREE.Color('#0e1418'),
    });
    for (const crusher of world.crushers ?? []) {
      const node = decorMesh(
        'Crusher',
        new THREE.BoxGeometry(crusher.w, crusher.h, 60),
        crusherMaterial
      );
      node.position.set(crusher.x + crusher.w / 2, crusher.y + crusher.h / 2, -20);
      this.stage?.add(node);
      this.crusherNodes.push({ node, crusher });
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
    (world.signs ?? []).forEach((sign, i) => {
      const map = signTexture(`sign-${i}`, sign.lines, sign.scale ?? 4);
      const image = map.image as { width: number; height: number };
      const wide = image.width * 0.55;
      const node = decorMesh(
        'Stencil',
        new THREE.PlaneGeometry(wide, wide * (image.height / image.width)),
        this.artMaterial({ map, transparent: true, opacity: 0.8, depthWrite: false })
      );
      node.position.set(sign.x, sign.y, 3);
      this.stage?.add(node);
    });

    /*
     * The button was the other survivor: an orange cylinder. It is a pressure plate now -
     * a stone anvil the floor owns, capped with a dome of the stage's lamp colour, the one
     * hue reserved for man-made light. The read at distance is "warm, wants weight". The
     * press animation sinks the whole sprite into its socket, so the art needs no second
     * state.
     */
    world.buttons.forEach((button, i) => {
      const node = decorMesh(
        'Button',
        new THREE.PlaneGeometry(button.radius * 2.6, button.radius),
        this.artMaterial({
          map: plateTexture(`plate-${i}`, 72, 26),
          transparent: true,
          depthWrite: false,
        })
      );
      node.position.set(button.x, button.y + 6, 2);
      this.stage?.add(node);
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
    arch.position.set(world.width / 2, world.height - archH / 2 - world.height * 0.04, -240);
    this.stage?.add(arch);

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
     * Two spore layers at different depths and speeds.
     *
     * One would drift; two make PARALLAX, and parallax out of two textures is the cheapest
     * depth cue there is. The near layer is bigger, faster and thinner on the ground; the far
     * one is small, slow and dense. Between them the air in front of the level acquires a
     * front and a back, which a single sheet of motes cannot suggest however many are on it.
     *
     * Both tile, so the scroll never ends and never seams. See sporeTexture.
     */
    /*
     * Counts are PER TILE, and the tile repeats - so the number on screen is count times the
     * repeat squared.
     *
     * The first attempt asked for 120 and 70 at repeats of 3.2 and 1.7, which is about
     * fourteen hundred motes in frame. It snowed. The static layer this replaced had 220 in
     * total and that was the right density, so the counts below are chosen to land near it:
     * 12 x 3.2^2 is 123, and 30 x 1.7^2 is 87.
     *
     * Same arithmetic slip as the lamp squares in pass 4 - a number that looks reasonable in
     * the space it is authored in, multiplied by something on the way to the screen.
     */
    const drifts: Array<{ z: number; tile: number; speed: number; opacity: number; count: number }> = [
      { z: 24, tile: 3.2, speed: 0.013, opacity: 0.45, count: 12 },
      { z: 40, tile: 1.7, speed: 0.031, opacity: 0.6, count: 30 },
    ];
    for (const [i, layer] of drifts.entries()) {
      const map = sporeTexture(`spores-${i}`, 256, layer.count);
      map.repeat.set(layer.tile, layer.tile);
      const sheet = decorMesh(
        'Spores',
        new THREE.PlaneGeometry(world.width * 1.2, world.height * 1.2),
        this.artMaterial({
          map,
          transparent: true,
          opacity: layer.opacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      sheet.position.set(world.width / 2, world.height / 2, layer.z);
      this.stage?.add(sheet);
      this.sporeLayers.push({ map, speed: layer.speed });
    }
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
    halo.position.set(this.portalAt.x, this.portalAt.y, 6);
    this.stage?.add(halo);

    node.position.set(this.portalAt.x, this.portalAt.y, 8);
    this.stage?.add(node);
    this.portal = node;
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
        map: glowTexture('slime-glow', '#9ff0c8'),
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    halo.position.set(0, 0, 3);
    this.stage?.add(halo);
    this.slimeGlow = halo;
  }

  private buildSlime(): void {
    const empty = new THREE.BufferGeometry();
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
      // Below the engine's FPS overlay, which owns the top-left corner and wins.
      'top:64px',
      'z-index:20',
      'width:260px',
      'background:rgba(27,35,49,0.88)', // stationDesk C.panel
      'border:1px solid #2f5f8f',
      'box-shadow:0 2px 12px rgba(0,0,0,0.45)',
      'color:#e6ecf4', // C.label
      'font:11px/1.5 "Courier New",monospace',
      'pointer-events:none',
    ].join(';');
    hud.innerHTML = [
      // The title bar, straight off the specimen window on her desktop.
      '<div style="background:#2f5f8f;color:#ffffff;padding:3px 8px;font-size:10px;',
      'letter-spacing:1px;display:flex;justify-content:space-between">',
      '<span>specimen M4SS</span><span style="color:#8fe0a2">LIVE</span></div>',
      '<div style="padding:8px 10px 10px">',
      '<div style="display:flex;align-items:center;gap:7px">',
      // The specimen glyph: a green blob with its own glow, the HUD's one piece of the
      // creature. A gauge with a face on it reads as a creature meter, not a fuel bar.
      '<div style="width:13px;height:11px;border-radius:52% 48% 55% 45%;background:#8fe8a8;',
      'box-shadow:0 0 7px #4fae6e"></div>',
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
    container.appendChild(hud);
    this.hud = hud;
    this.hudMass = hud.querySelector('[data-role="mass"]');
    this.hudShed = hud.querySelector('[data-role="shed"]');
    this.hudLabel = hud.querySelector('[data-role="label"]');
    this.hudNote = hud.querySelector('[data-role="note"]');
    this.detach.push(() => hud.remove());
  }

  /** What the bar is promising, and what release will actually hand over. One source. */
  private splitFraction(): number {
    return Math.min(SPLIT_MAX, this.splitHold);
  }

  private paintHud(): void {
    const state = this.state;
    if (!this.hud || !state) return;

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
      this.hudLabel.textContent =
        this.splitHold > 0
          ? `SPLIT  ${Math.round(this.splitFraction() * 100)}%`
          : `MASS  ${held}    REACH ${Math.round(reachOf(state))}px`;
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
      }
      this.hudNote.textContent = note;
    }
  }

  // -- input ------------------------------------------------------------------------------

  private listen(): void {
    const down = (e: KeyboardEvent): void => {
      /*
       * The standalone boot has no menu, so the first keystroke is the first gesture the
       * browser will accept an AudioContext from. Inside the console this is a no-op
       * resume - unlock() is idempotent - so the two boots share one line.
       */
      audio.unlock();
      this.held.add(e.code);
      if (e.code === 'KeyQ' && !e.repeat) this.voice.play('recall');
      if (e.code === 'KeyQ') this.recalling = true;
      if (e.code === 'Space') e.preventDefault();
    };
    const up = (e: KeyboardEvent): void => {
      this.held.delete(e.code);
      if (e.code === 'KeyQ') this.recalling = false;
      if (e.code === 'Space' && this.state) {
        const shed = split(this.state, this.splitFraction());
        if (shed > 0) {
          this.voice.play('split');
          this.justSplit = true;
        }
        this.splitHold = 0;
      }
    };
    const press = (e: MouseEvent): void => {
      audio.unlock();
      this.grab(e);
    };
    const hover = (e: MouseEvent): void => {
      this.pointer = this.toLevel(e);
    };
    const release = (): void => {
      this.latched = null;
    };

    addEventListener('keydown', down);
    addEventListener('keyup', up);
    addEventListener('mousedown', press);
    addEventListener('mouseup', release);
    addEventListener('mousemove', hover);
    this.detach.push(
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

  private grab(event: MouseEvent): void {
    const world = this.state?.world;
    if (!world) return;
    const at = this.toLevel(event);
    if (!at) return;
    const wx = at.x;
    const wy = at.y;

    let best: Anchor | null = null;
    let bestD = 90;
    for (const a of world.anchors) {
      // Dead growths are not targets. step() refuses them anyway, but latching onto one and
      // watching nothing happen reads as the click being lost rather than as the plant being
      // dead, and this is the stage where telling those apart is the puzzle.
      if (a.live === false) continue;
      const d = Math.hypot(a.x - wx, a.y - wy);
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    /*
     * Out of reach is ANSWERED, not swallowed. The old behaviour latched the intent, sent
     * the tendril, and let it fall short - which reads as a dropped click, and the
     * playtest asked for "a reasonable distance the mass should be from a growth". The
     * distance already exists (reach = mass times REACH_PER_MASS, it is the game's whole
     * economy); what was missing was the game SAYING so at the moment of the click.
     */
    if (best && this.state) {
      const bodyAt = centroid(owned(this.state));
      const span = Math.hypot(best.x - bodyAt.x, best.y - bodyAt.y);
      if (span > reachOf(this.state)) {
        this.denied = { anchor: best, t: 0.6 };
        if (this.hudNote) this.hudNote.textContent = 'out of reach - grow closer or shed less';
        this.latched = null;
        return;
      }
    }
    this.latched = best;
  }

  // -- frame ------------------------------------------------------------------------------

  public override tickPrePhysics(deltaTime: number): void {
    super.tickPrePhysics(deltaTime);
    const state = this.state;
    if (!state) return;

    if (this.held.has('Space')) {
      this.splitHold = Math.min(SPLIT_MAX, this.splitHold + deltaTime * SPLIT_RATE);
    }

    const move: -1 | 0 | 1 = this.held.has('KeyD')
      ? 1
      : this.held.has('KeyA')
        ? -1
        : 0;

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
  private contain(): void {
    saveM4ssContained();
    if (this.hudLabel) this.hudLabel.textContent = 'SPECIMEN CONTAINED';
    if (this.hudNote) this.hudNote.textContent = this.onContained ? 'returning to the feed' : 'the record is closed';
    this.containedDelay = 2.8;
  }

  /**
   * Start the between-stages transition. The swap itself still happens in advance() -
   * this only decides WHEN the player is allowed to see it: behind a veil, after the
   * body has visibly gone somewhere. The previous version advanced on the same frame the
   * portal was touched, which made finishing a stage feel like a level-select, not an
   * arrival.
   */
  private beginWarp(): void {
    if (this.warp) return;
    const container = this.getWorld()?.gameContainer;
    if (container) {
      const veil = document.createElement('div');
      // The portal's own colour, not white: a white flash reads as a screenshot being
      // taken. This reads as being inside the thing you just entered.
      veil.style.cssText =
        'position:absolute;inset:0;background:#bff2e4;opacity:0;pointer-events:none;z-index:30';
      container.appendChild(veil);
      this.warpVeil = veil;
    }
    this.warp = { t: 0, out: true };
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
      const at = this.portalAt;
      if (at) {
        for (const q of owned(state)) {
          q.x += (at.x - q.x) * 0.14;
          q.y += (at.y - q.y) * 0.14;
          q.px = q.x;
          q.py = q.y;
        }
      }
      this.portalPhase += deltaTime * 5;
      if (this.warpVeil) this.warpVeil.style.opacity = String(Math.min(1, warp.t / 0.55));
      if (warp.t >= 0.6) {
        this.advance();
        warp.out = false;
        warp.t = 0;
      }
      return true;
    }

    if (this.warpVeil) this.warpVeil.style.opacity = String(Math.max(0, 1 - warp.t / 0.7));
    if (warp.t >= 0.75) {
      this.warpVeil?.remove();
      this.warpVeil = null;
      this.warp = null;
    }
    // The veil is lifting off a live stage: let the sim run underneath it.
    return false;
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
    this.crusherNodes = [];
    this.growthArt.clear();
    this.emberNodes.clear();
    this.presenceNodes.clear();
    this.shedMarkers.length = 0;
    this.denied = null;
    this.sporeLayers.length = 0;
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
    this.canopy = null;
    this.vignette = null;

    this.state = makeState(STAGES[this.stageIndex](), 40);
    this.cleared = false;
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

    // The level is y-down and the world is y-up, so the contour is built flipped.
    // Level coordinates: the stage flips and scales them.
    const mine = owned(state).map((p) => ({ x: p.x, y: p.y }));

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
    this.replace(this.body, buildSurface(drawn, { cell: 4 }));
    // A second contour at a lower threshold is a rim: the same shape, slightly fatter.
    this.replace(this.rim, buildSurface(drawn, { cell: 5, threshold: 0.72 }));

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
    this.replace(this.belly, buildSurface(dropped, { cell: 5, threshold: 1.45 }));
    this.replace(this.shine, buildSurface(lifted, { cell: 5, threshold: 2.1 }));
    // Same lone-pixel rule as the body: a shed LUMP draws, a shed CRUMB of one particle
    // mid-flight does not - it reads as a stray pixel, and it lands and clusters soon.
    const strandedAll = loose(state).map((p) => ({ x: p.x, y: p.y }));
    const strandedPoints = strandedAll.filter(
      (q) => strandedAll.length <= 2 || !isLone(q, strandedAll)
    );
    this.replace(this.strays, buildSurface(strandedPoints, { cell: 5 }));

    if (state.tip && !state.attached && mine.length > 0) {
      const home = centroid(owned(state));
      this.replace(this.cord, this.cordGeometry(home, state.tip, state.strain > 0));
    } else {
      this.replace(this.cord, new THREE.BufferGeometry());
    }
  }

  /** A quad from the body to wherever the tendril has got to, thinning as it goes. */
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
     * The spores drift: up, and slightly across.
     *
     * Upward because they are buoyant and because a downward drift reads as falling debris,
     * which is a different and much bleaker room. The sideways component is a fraction of the
     * vertical one and differs per layer, so the two sheets separate over time instead of
     * moving as one sheet - the whole point of having two.
     *
     * Texture offsets rather than moved geometry: the sheets are enormous and the wrap is
     * free, so this is two number updates a frame for the only continuous motion in the stage.
     */
    for (const [i, layer] of this.sporeLayers.entries()) {
      layer.map.offset.y -= layer.speed * deltaTime;
      layer.map.offset.x += layer.speed * (i === 0 ? 0.22 : -0.15) * deltaTime;
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
          if (this.stageIndex + 1 < STAGES.length) this.beginWarp();
          else this.contain();
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
         */
        const t = gate.lift;
        const eased = t * t * (3 - 2 * t);
        node.rotation.z = eased * (Math.PI / 2);
        const span = gate.span;
        if (span) {
          const downX = span.x + span.w / 2;
          const downY = -(span.y + span.h / 2);
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
    for (const { node, crusher } of this.crusherNodes) {
      const at = crusherRect(crusher);
      node.position.set(at.x + at.w / 2, at.y + at.h / 2, -20);
    }

    // Pressed buttons sit down into their sockets. Eased, so the press reads as travel
    // rather than as a swap; level space is y-down, so +y is into the floor.
    for (const { node, button } of this.buttonNodes) {
      const target = button.y + 6 + (button.pressed ? 7 : 0);
      node.position.y += (target - node.position.y) * 0.25;
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
    this.hovered = null;
    if (this.pointer) {
      let best: Anchor | null = null;
      let bestD = 80;
      for (const a of state.world.anchors) {
        if (a.live === false) continue;
        if (Math.hypot(a.x - home.x, a.y - home.y) > limit) continue;
        const d = Math.hypot(a.x - this.pointer.x, a.y - this.pointer.y);
        if (d < bestD) {
          bestD = d;
          best = a;
        }
      }
      this.hovered = best;
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

    // The halo follows the hover, breathing slightly so it reads as live, not painted.
    if (this.hoverHalo) {
      const material = this.hoverHalo.material as THREE.MeshBasicMaterial;
      if (this.hovered) {
        this.hoverHalo.position.x = this.hovered.x;
        this.hoverHalo.position.y = this.hovered.y;
        const breathe = 1 + Math.sin(this.artClock * 5) * 0.06;
        this.hoverHalo.scale.set(breathe, breathe, 1);
        material.opacity = Math.min(0.55, material.opacity + 0.08);
      } else {
        material.opacity = Math.max(0, material.opacity - 0.12);
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
      const presence = this.presenceNodes.get(anchor);
      if (presence) {
        (presence.material as THREE.MeshBasicMaterial).opacity = dead
          ? 0
          : 0.18 + Math.sin(this.artClock * 2.2 + anchor.x) * 0.05;
      }
      const art = this.growthArt.get(anchor);
      const wanted = art ? (dead ? art.dead : art.live) : null;
      if (wanted && material.map !== wanted) {
        material.map = wanted;
        material.needsUpdate = true;
      }
      const hovered = !dead && anchor === this.hovered;
      if (this.denied && this.denied.anchor === anchor && this.denied.t > 0) continue;
      material.color.set(
        dead
          ? '#ffffff'
          : anchor === this.latched
            ? '#ffffff'
            : hovered
              ? '#ffffff'
              : within
                ? '#cfe8b4'
                : '#5a6f78'
      );
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

  private follow(): void {
    if (!this.camera || !this.state) return;
    this.keepActive();
    const at = this.viewCentre();
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
    if (this.shake > 0) {
      const k = this.shake / 0.35;
      at.x += Math.sin(this.shake * 70) * 5 * k;
      at.y += Math.cos(this.shake * 55) * 3 * k;
    }
    this.camera.position.copy(place(at.x, at.y).setZ(CAMERA_BACK));
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
