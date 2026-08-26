/**
 * The main menu - OMNISCIENT_ coming home to its own mind.
 *
 * §183: an old CRT containing a living pixel organism made from everything the player has
 * learned, surrounded by the machine that runs it. §103: menu functions are physical
 * hardware modules, and the cursor is a connector cable that plugs into the one you pick.
 *
 * The CRT shows the TREE and only the tree here. The globe is somewhere you go, not the
 * resting state (§174).
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { audio } from '../audio/ConsoleAudio.js';
import { decorMesh } from '../art/mesh.js';
import { ACCENT, MAT } from '../art/palette.js';
import { createModule, MODULE_PLATE } from '../geometry/modules.js';

import { DESK_SHIFT } from '../geometry/room.js';

import { CableCursor } from './CableCursor.js';
import { createLabelMaterial } from './labels.js';

import type { Picker } from '../input/Picker.js';
import type { ModuleKind } from '../geometry/modules.js';

export type MenuAction = 'new-game' | 'continue' | 'night-shift' | 'settings' | 'credits' | 'shutdown';

interface ModuleSpec {
  id: MenuAction;
  kind: ModuleKind;
  title: string;
  subtitle: string;
  accent: string;
  /** Present but not selectable - lit dimly, no cable, no action. */
  disabled?: boolean;
}

/**
 * A main menu, in §103's module language: "RESTORE (Continue), INITIALIZE (New Game),
 * CONFIGURATION, SHUT DOWN".
 *
 * The hardware is chosen so the physical act matches the function - you seat a fresh
 * cartridge to start over, you spool a tape to pick up where you left off. That is the
 * point of making the menu a machine rather than a list.
 */
const MODULES: ModuleSpec[] = [
  {
    id: 'new-game',
    kind: 'cartridge',
    title: 'New game',
    subtitle: 'Initialize.',
    accent: ACCENT.knowledge,
  },
  {
    id: 'continue',
    kind: 'tape',
    title: 'Continue',
    subtitle: 'Restore from memory.',
    accent: ACCENT.amber,
    /*
     * Cold until the rig warms it. There is a save system now; what stays true is that a
     * machine with nothing on the tape should not offer to play the tape - the rig calls
     * setModuleEnabled('continue', true) at boot if persistence has something to restore.
     */
    disabled: true,
  },
  {
    id: 'night-shift',
    kind: 'card',
    title: 'Night shift',
    subtitle: 'Warehouse 07 archive.',
    accent: ACCENT.warning,
    disabled: true,
  },
  {
    id: 'settings',
    kind: 'dial',
    title: 'Settings',
    subtitle: 'Audio, display, controls.',
    accent: ACCENT.data,
  },
  {
    id: 'credits',
    kind: 'card',
    title: 'Credits',
    subtitle: 'Who built this.',
    accent: ACCENT.amber,
  },
  {
    id: 'shutdown',
    kind: 'power',
    title: 'Shut down',
    subtitle: 'Rest for now.',
    accent: ACCENT.warning,
  },
];

/** Vertical pitch of the stack. */
const PITCH = 0.193;
/**
 * Where the stack sits relative to the workstation origin - left of the CRT, on the desk.
 *
 * Moved further left and forward: sitting at x=-1.5 and behind the machine in z, the
 * stack was partly occluded by the CRT from the home shot. Squaring the camera fixed most
 * of it; giving the plates some clearance and bringing them nearer the player fixes the
 * rest, and having them stand in front of the machine rather than behind it is the more
 * honest read anyway - these are the controls, not scenery.
 */
// z follows DESK_SHIFT: the plates hover over the desk, so leaving them put while the
// desk moved back would strand them in the middle of the room.
/**
 * Where the plate stack hangs.
 *
 * Lowered and brought in with the plates themselves (see PLATE_W). The bottom plate now
 * sits at y 0.44 - six centimetres clear of the desk lamp, which tops out at 0.38 and has
 * already had to be moved once for occupying the same space as SHUT DOWN.
 */
/*
 * z -0.49, twelve centimetres further back than it was.
 *
 * The cable was passing THROUGH the plates. It runs from the machine's shoulder up to
 * whichever module the pointer is over, and the plane its tip flies on was set to
 * STACK_ORIGIN.z + MODULE_PLATE.depth - which is only three centimetres in front of the
 * plate's front face, since the plate is 0.06 deep and that offset is measured from its
 * CENTRE. Any sag in the cable between anchor and tip put it inside the plastic.
 *
 * Two changes open the gap and they have to go together: the stack moves back, and the
 * cable's plane keeps a real clearance in front of it (CABLE_CLEARANCE) rather than
 * riding the plate depth. Moving the stack alone would have done nothing at all, because
 * the tip plane is derived FROM the stack - both would have receded together and the
 * cable would still have crossed them.
 *
 * The wall is at -1.98 and DESK_SHIFT is -0.72, so at -1.21 in world the plates still
 * float three quarters of a metre clear of the wall. The facility plate above them moves
 * with them (see hangFacilityPlate) - they are one composition and the eye reads the
 * title and the list as a single column.
 */
const STACK_ORIGIN = new THREE.Vector3(-0.95, 1.3, -0.49 + DESK_SHIFT);
/**
 * How far in front of the plate stack the cable's loose end flies.
 *
 * Big enough that the cable, which sags on its way across, stays clear of the plastic for
 * its whole length - and bigger than HOVER_PUSH, or the plate the player is reaching for
 * would rise into its own cursor.
 */
const CABLE_CLEARANCE = 0.16;
/** How far a hovered plate pushes out toward the player. */
const HOVER_PUSH = 0.045;

/**
 * A disabled socket is still physically present, but it must read as a refusal rather
 * than an idle connection. The small hot core survives the CRT downsample; the larger
 * additive disc supplies a controlled red halo even when post-process bloom is reduced.
 */
const UNAVAILABLE_SOCKET_CORE = new THREE.MeshBasicMaterial({
  color: new THREE.Color('#ff382e').multiplyScalar(1.35),
  toneMapped: false,
});
const UNAVAILABLE_SOCKET_GLOW = new THREE.MeshBasicMaterial({
  color: '#e32620',
  transparent: true,
  opacity: 0.3,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
});

interface MenuModule {
  spec: ModuleSpec;
  node: ENGINE.SceneNode;
  labelLit: THREE.MeshBasicMaterial;
  labelIdle: THREE.MeshBasicMaterial;
  labelMesh: ENGINE.MeshNode;
  /**
   * The painted face itself, kept rather than added and forgotten.
   *
   * The only thing that reads it is the rig, which projects it every frame so the pixel pass
   * can spare it - see RetroPass.setSharpQuads. Held here because a plate that is hovered
   * pushes toward the player, so where it is on screen is a per-frame fact and the mesh is
   * the only thing that knows it.
   */
  plateMesh: ENGINE.MeshNode;
  socketUnavailableCore: ENGINE.MeshNode;
  socketUnavailableGlow: ENGINE.MeshNode;
  /** Where the socket sits ON the plate. Add the plate's position to place it. */
  socket: THREE.Vector3;
  baseZ: number;
}

export class MainMenu {
  public readonly root: ENGINE.SceneNode;

  private readonly modules = new Map<MenuAction, MenuModule>();
  private readonly cable: CableCursor;
  private readonly cablePlane: THREE.Plane;
  private readonly scratch = new THREE.Vector3();

  private handlers = new Set<(action: MenuAction) => void>();
  private hoverHandlers = new Set<(spec: ModuleSpec | null) => void>();
  private unsubscribe: Array<() => void> = [];
  private enabled = true;
  /** The module a plug is currently travelling toward, if any. */
  private plugTarget: MenuAction | null = null;
  /** The module under the pointer, tracked so a plug can be abandoned when it leaves. */
  private hovered: MenuAction | null = null;
  /** A d-pad owns the loose end until the pointer reaches or clicks a plate. */
  private controllerFocused = false;

  constructor(origin: THREE.Vector3) {
    this.root = ENGINE.SceneNode.create({ name: 'MainMenu', position: origin.clone() });

    MODULES.forEach((spec, index) => this.buildModule(spec, index));

    /**
     * The cable emerges from the machine, and now actually does.
     *
     * This was at z -0.28, which was behind the set when the desk stood in the middle of
     * the room and is a metre in FRONT of it since DESK_SHIFT moved the group back to the
     * wall. The anchor was left where it was, so the cable rose out of thin air over the
     * desk edge and looped across the screen - the one thing in this shot that must never
     * be occluded.
     *
     * Level with the machine's right shoulder and slightly behind it: the loose end then
     * rests further back still (see CableCursor's idle target), so at rest the whole cable
     * is behind the tube and only comes forward when the player reaches for a module.
     */
    const anchor = new THREE.Vector3(0.24, 0.2, -0.62 + DESK_SHIFT);
    this.cable = new CableCursor(anchor);
    this.root.add(this.cable.root);

    // Cable tip flies on a plane just in front of the plates.
    this.cablePlane = new THREE.Plane(
      new THREE.Vector3(0, 0, 1),
      -(origin.z + STACK_ORIGIN.z + MODULE_PLATE.depth / 2 + CABLE_CLEARANCE)
    );
  }

  private buildModule(spec: ModuleSpec, index: number): void {
    const build = createModule(spec.kind, `module-${spec.id}`);
    const y = STACK_ORIGIN.y - index * PITCH;

    const node = ENGINE.SceneNode.create({
      name: 'Module',
      position: new THREE.Vector3(STACK_ORIGIN.x, y, STACK_ORIGIN.z),
    });
    node.setName(`Module-${spec.id}`);

    const plateMesh = decorMesh('Plate', build.plate, MAT.plastic);
    node.add(plateMesh);

    for (const part of build.details) {
      node.add(decorMesh('Detail', part.geometry, MAT[part.material]));
    }

    const socketUnavailableGlow = decorMesh(
      'SocketUnavailableGlow',
      new THREE.CircleGeometry(0.038, 20),
      UNAVAILABLE_SOCKET_GLOW
    );
    socketUnavailableGlow.position.copy(build.socket).add(new THREE.Vector3(0, 0, 0.001));
    socketUnavailableGlow.renderOrder = 3;
    const socketUnavailableCore = decorMesh(
      'SocketUnavailableCore',
      new THREE.CircleGeometry(0.015, 16),
      UNAVAILABLE_SOCKET_CORE
    );
    socketUnavailableCore.position.copy(build.socket).add(new THREE.Vector3(0, 0, 0.002));
    socketUnavailableCore.renderOrder = 4;
    socketUnavailableGlow.visible = spec.disabled === true;
    socketUnavailableCore.visible = spec.disabled === true;
    node.add(socketUnavailableGlow, socketUnavailableCore);

    // Label painted on the plate face.
    const labelIdle = createLabelMaterial({ ...spec, lit: false });
    const labelLit = createLabelMaterial({ ...spec, lit: true, accent: spec.accent });
    const labelGeo = new THREE.PlaneGeometry(MODULE_PLATE.width * 0.62, MODULE_PLATE.height * 0.62);
    // Clear of the plate's bevel, which extends past depth/2 - at +0.004 the label was
    // buried inside the front face and invisible.
    labelGeo.translate(0.16, 0.0, MODULE_PLATE.depth / 2 + 0.028);
    const labelMesh = decorMesh('Label', labelGeo, labelIdle);
    node.add(labelMesh);

    this.root.add(node);

    this.modules.set(spec.id, {
      spec,
      node,
      labelIdle,
      labelLit,
      labelMesh,
      plateMesh,
      socketUnavailableCore,
      socketUnavailableGlow,
      /**
       * The socket's offset ON the plate, not its position in the room.
       *
       * It used to be resolved to a position here, once, from where the plate was resting -
       * and hovering pushes the plate 4.5cm towards the player. So by the time anybody
       * clicked, the plate had come forward and its socket had not, and the connector
       * travelled to a point that was now BEHIND the face it was supposed to plug into.
       *
       * Kept as an offset and resolved at plug time instead, so it follows the plate
       * wherever the plate has got to. Local to the menu root, because the cable's points
       * live in that space too and mixing the two sends the tip sixty units into the world.
       */
      socket: build.socket.clone(),
      baseZ: node.position.z,
    });
  }

  /** Wire up hover and click. The picker is owned by the rig and shared with the globe. */
  /**
   * The flat faces the pixel grid is asked to leave alone, plate and painted label per module.
   *
   * Both, because they are not the same rectangle: the label is drawn on a plane that overhangs
   * its plate by about two centimetres and stands six in front of it, so the plate's silhouette
   * does not contain it and a plate-only exemption would grid the ends of the longest words -
   * which is the two that most needed the help. Twelve quads for six modules.
   *
   * Order is not meaningful; the shader tests them all.
   */
  public sharpFaces(): ENGINE.MeshNode[] {
    const faces: ENGINE.MeshNode[] = [];
    for (const module of this.modules.values()) {
      faces.push(module.plateMesh, module.labelMesh);
    }
    return faces;
  }

  /**
   * Be told which plate is under the pointer, or null for none and for a disabled one.
   *
   * Exists because the plate labels are no longer legible at the game's pixel size and the
   * name has to arrive somewhere else - see MenuReadout for the whole argument.
   */
  public onHoverChange(handler: (spec: ModuleSpec | null) => void): () => void {
    this.hoverHandlers.add(handler);
    return () => this.hoverHandlers.delete(handler);
  }

  public attach(picker: Picker): void {
    for (const module of this.modules.values()) {
      picker.addTarget(module.spec.id, module.node);
    }

    this.unsubscribe.push(
      picker.onHover((id) => {
        this.controllerFocused = false;
        this.setHovered(id as MenuAction | null);
      }),
      picker.onClick((id) => {
        this.controllerFocused = false;
        this.onClick(id as MenuAction | null);
      })
    );
  }

  /**
   * Wake or cool one module at runtime.
   *
   * Two callers now, and they are the same call: the front door is a PAIR. CONTINUE ships
   * authored as disabled - "present but cold" - and the rig warms it at boot when a save
   * exists, at which moment NEW GAME goes cold, because from then on it is the only button
   * in the game that can destroy several hours of somebody's evening and it sits directly
   * above the one they want.
   *
   * Flipping the spec is enough; hover and click both read `spec.disabled` live, so there
   * is no lit state to rebuild.
   */
  public setModuleEnabled(id: MenuAction, enabled: boolean): void {
    const module = this.modules.get(id);
    if (!module) return;
    module.spec.disabled = !enabled;
    module.socketUnavailableCore.visible = !enabled;
    module.socketUnavailableGlow.visible = !enabled;
  }

  public onAction(handler: (action: MenuAction) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  public get canNavigate(): boolean {
    return this.enabled && this.root.visible;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.root.visible = enabled;
    if (!enabled) {
      this.controllerFocused = false;
      this.setHovered(null);
      this.plugTarget = null;
      this.cable.unplug();
    }
  }

  /** Move the physical cable focus without pretending a gamepad has a screen-space cursor. */
  public focusNext(direction: number): boolean {
    if (!this.enabled) return false;
    const available = MODULES.filter((spec) => this.modules.get(spec.id)?.spec.disabled !== true);
    if (!available.length) return false;

    const at = available.findIndex((spec) => spec.id === this.hovered);
    const next =
      at < 0
        ? direction < 0
          ? available.length - 1
          : 0
        : (at + available.length + Math.sign(direction)) % available.length;
    const module = this.modules.get(available[next].id);
    this.controllerFocused = true;
    this.setHovered(available[next].id);
    if (module) this.cable.setTarget(module.node.position.clone().add(module.socket));
    return true;
  }

  /** Seat the cable in the currently focused module. */
  public activateFocused(): boolean {
    if (!this.enabled || !this.hovered) return false;
    const module = this.modules.get(this.hovered);
    if (!module || module.spec.disabled) return false;
    this.onClick(this.hovered);
    return true;
  }

  /** Release a modal's cable connection when control returns to the front door. */
  public releaseFocus(): void {
    this.controllerFocused = false;
    this.plugTarget = null;
    this.cable.unplug();
    this.setHovered(null);
  }

  private setHovered(id: MenuAction | null): void {
    // Clearing is always allowed, including while setEnabled(false) is taking the menu down.
    if (!this.enabled && id !== null) return;
    /*
     * The plate answers when the pointer reaches it.
     *
     * These were the loudest silent objects in the game: five physical plates that push
     * toward you and light their label when hovered, and made no sound doing it. The move
     * was already there and only half of it was landing.
     *
     * `tap` is the console's own cue for a soft commit - a suggestion chip, a UI press - and
     * it is the right one here for the reason it is right there: this is a surface
     * acknowledging a hand, not a mechanism accepting a part. `seat` belongs to the CLICK,
     * where a cable goes into a socket, and it already fires there.
     *
     * Only on ENTERING a plate, and only a plate that can be used. Firing on every call
     * would tick continuously while the pointer sat still, and a disabled plate that clicks
     * back is a plate promising something it will not do - CONTINUE before there is a save,
     * or NEW GAME after there is one.
     */
    const entering = id !== null && id !== this.hovered;
    this.hovered = id;
    if (entering && this.modules.get(id)?.spec.disabled !== true) audio.play('tap');

    /*
     * And tell whoever is listening what the plate is called.
     *
     * The names left the world when the game got a pixel grid - see MenuReadout - so this
     * is now the only way a player learns which socket is which. A disabled plate reports
     * null rather than its name: CONTINUE before there is a save is not a thing you can
     * reach for, and naming it would be the menu offering something it will refuse.
     */
    const named = id !== null ? this.modules.get(id) : undefined;
    const spec = named && named.spec.disabled !== true ? named.spec : null;
    for (const handler of this.hoverHandlers) handler(spec);

    for (const [key, module] of this.modules) {
      const hovered = key === id && !module.spec.disabled;
      module.labelMesh.material = hovered ? module.labelLit : module.labelIdle;
      // Plate pushes toward the player - §103's "hovering a module wakes its socket".
      module.node.position.setZ(module.baseZ + (hovered ? HOVER_PUSH : 0));
    }
  }

  private onClick(id: MenuAction | null): void {
    if (!this.enabled) return;

    if (!id) {
      this.cable.unplug();
      return;
    }

    const module = this.modules.get(id);
    if (!module || module.spec.disabled) return;

    this.plugTarget = id;
    // Resolved now, against where the plate actually is - it is pushed forward while
    // hovered, and it is always hovered at the moment it is clicked.
    const socketAt = module.node.position.clone().add(module.socket);
    this.cable.plugInto(socketAt, () => {
      this.plugTarget = null;
      this.handlers.forEach((handler) => handler(id));
    });
  }

  /** Fly the cable tip with the pointer while it is not seated. */
  public update(deltaTime: number, picker: Picker): void {
    /**
     * §237: moving off the plate mid-plug retracts rather than completing.
     *
     * Without this the player can start a connection, change their mind, and have the
     * menu open anyway a third of a second later - which is the same class of surprise as
     * an action firing before its animation, just in the other direction.
     */
    if (this.plugTarget && this.cable.isPlugging && this.hovered !== this.plugTarget) {
      this.cable.cancelPlug();
      this.plugTarget = null;
    }

    /**
     * The connector reaches for the plates, and coils at the machine otherwise.
     *
     * It used to follow the pointer anywhere in the room, which meant the loose end spent
     * most of its life somewhere nobody had asked it to be - hanging in the air over the
     * desk, or looped across the front of the screen, depending on where the mouse
     * happened to be resting. A cable that goes wherever the cursor goes is a cursor with
     * a cable drawn on it; a cable that reaches out when you approach the plates and falls
     * back when you leave is a cable.
     *
     * The reach zone is the plate stack's own bounds with a margin, so it turns on exactly
     * where the thing it can plug into is.
     */
    if (this.enabled && !this.controllerFocused && !this.cable.isSeated) {
      const point = picker.projectOntoPlane(this.cablePlane, this.scratch);
      if (point) {
        const local = point.sub(this.root.position);
        const nearPlates =
          local.x < STACK_ORIGIN.x + MODULE_PLATE.width * 0.9 &&
          local.y > STACK_ORIGIN.y - PITCH * (MODULES.length - 1) - MODULE_PLATE.height &&
          local.y < STACK_ORIGIN.y + MODULE_PLATE.height;
        this.cable.setTarget(nearPlates ? local : this.cable.restingTip);
      }
    }
    this.cable.update(deltaTime);
  }

  public dispose(): void {
    this.unsubscribe.forEach((off) => off());
    this.unsubscribe = [];
    this.handlers.clear();
    this.cable.dispose();
  }
}
