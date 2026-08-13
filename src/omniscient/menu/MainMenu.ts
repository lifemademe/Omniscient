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

import { decorMesh } from '../art/mesh.js';
import { ACCENT, MAT } from '../art/palette.js';
import { createModule, MODULE_PLATE } from '../geometry/modules.js';

import { CableCursor } from './CableCursor.js';
import { createLabelMaterial } from './labels.js';

import type { Picker } from '../input/Picker.js';
import type { ModuleKind } from '../geometry/modules.js';

export type MenuAction = 'new-game' | 'continue' | 'settings' | 'credits' | 'shutdown';

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
    // No save system in the Jam build (§215), so this reads as present but cold.
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
const PITCH = 0.345;
/**
 * Where the stack sits relative to the workstation origin - left of the CRT, on the desk.
 *
 * Moved further left and forward: sitting at x=-1.5 and behind the machine in z, the
 * stack was partly occluded by the CRT from the home shot. Squaring the camera fixed most
 * of it; giving the plates some clearance and bringing them nearer the player fixes the
 * rest, and having them stand in front of the machine rather than behind it is the more
 * honest read anyway - these are the controls, not scenery.
 */
const STACK_ORIGIN = new THREE.Vector3(-1.72, 1.95, -0.35);
/** How far a hovered plate pushes out toward the player. */
const HOVER_PUSH = 0.045;

interface MenuModule {
  spec: ModuleSpec;
  node: ENGINE.SceneNode;
  labelLit: THREE.MeshBasicMaterial;
  labelIdle: THREE.MeshBasicMaterial;
  labelMesh: ENGINE.MeshNode;
  /** World-space socket the cable plugs into. */
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
  private unsubscribe: Array<() => void> = [];
  private enabled = true;

  constructor(origin: THREE.Vector3) {
    this.root = ENGINE.SceneNode.create({ name: 'MainMenu', position: origin.clone() });

    MODULES.forEach((spec, index) => this.buildModule(spec, index));

    // The cable emerges from the machine itself, to the right of the stack, and reaches
    // across to whichever module the player points at.
    const anchor = new THREE.Vector3(-0.62, 0.62, -0.28);
    this.cable = new CableCursor(anchor);
    this.root.add(this.cable.root);

    // Cable tip flies on a plane just in front of the plates.
    this.cablePlane = new THREE.Plane(
      new THREE.Vector3(0, 0, 1),
      -(origin.z + STACK_ORIGIN.z + MODULE_PLATE.depth)
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

    node.add(decorMesh('Plate', build.plate, MAT.plastic));

    for (const part of build.details) {
      node.add(decorMesh('Detail', part.geometry, MAT[part.material]));
    }

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
      // Local to the menu root - the cable's points live in that space too, and mixing
      // the two sends the tip sixty units off into the world.
      socket: node.position.clone().add(build.socket),
      baseZ: node.position.z,
    });
  }

  /** Wire up hover and click. The picker is owned by the rig and shared with the globe. */
  public attach(picker: Picker): void {
    for (const module of this.modules.values()) {
      picker.addTarget(module.spec.id, module.node);
    }

    this.unsubscribe.push(
      picker.onHover((id) => this.setHovered(id as MenuAction | null)),
      picker.onClick((id) => this.onClick(id as MenuAction | null))
    );
  }

  public onAction(handler: (action: MenuAction) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.root.visible = enabled;
    if (!enabled) {
      this.setHovered(null);
      this.cable.unplug();
    }
  }

  private setHovered(id: MenuAction | null): void {
    if (!this.enabled) return;

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

    this.cable.plugInto(module.socket, () => {
      this.handlers.forEach((handler) => handler(id));
    });
  }

  /** Fly the cable tip with the pointer while it is not seated. */
  public update(deltaTime: number, picker: Picker): void {
    if (this.enabled && !this.cable.isSeated) {
      const point = picker.projectOntoPlane(this.cablePlane, this.scratch);
      // The pointer projection is in world space; the cable lives in menu-local space.
      if (point) this.cable.setTarget(point.sub(this.root.position));
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
