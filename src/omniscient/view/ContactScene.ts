/**
 * Contact View - the world OMNISCIENT_ sees through the contact's camera.
 *
 * §209 is the governing constraint: the environment performs the instruction, the
 * contact's body does not. Every cue a mission emits resolves to a camera move, a prop
 * animation or an effect - never to a character animation, because the clips for that do
 * not exist.
 *
 * §131 makes the environment carry information rather than decoration: the connector the
 * player asks about has to be a real, findable feature of a real prop.
 *
 * Cue grammar, authored in mission content as `domain.action:target`:
 *   camera.push-in:transmitter     move to a registered shot
 *   camera.pan:workshop-floor      as above, slower and wider
 *   prop.rotate:transmitter-rear   run a prop's registered action
 *   prop.spark:connector-b         resolve an anchor for VFX (handled by the caller)
 *
 * Unknown cues are logged and ignored. A missing cue must never break a mission - the
 * player is mid-conversation and a thrown error would end the request.
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { Ease, Tweener } from '../core/tween.js';

export interface CameraShot {
  position: THREE.Vector3;
  target: THREE.Vector3;
  /** Seconds. Pans are slower than push-ins by default. */
  duration?: number;
}

/** A prop action: an authored animation the scene can run on demand. */
export type PropAction = (tweener: Tweener, node: ENGINE.SceneNode) => void;

export interface RegisteredProp {
  node: ENGINE.SceneNode;
  actions: Record<string, PropAction>;
  /** Local-space points of interest, e.g. where sparks should appear. */
  anchors: Record<string, THREE.Vector3>;
}

/** Populates a scene with its props, shots and actions. Registered by content modules. */
export type SceneBuilder = (scene: ContactScene) => void;

export interface ContactSceneOptions extends ENGINE.SceneNodeOptions {
  sceneId?: string;
}

@ENGINE.GameClass()
export class ContactScene extends ENGINE.SceneNode {
  /**
   * Builder registry, populated by view/scenes.ts at module load.
   *
   * Indirection rather than a direct import so that ContactScene does not depend on the
   * content that depends on it. It also means a diorama can be dropped into the editor
   * scene as a node and will populate itself, which is the only way to look at one -
   * play mode blocks screenshots (§208).
   */
  private static readonly builders = new Map<string, SceneBuilder>();

  public static registerBuilder(sceneId: string, builder: SceneBuilder): void {
    ContactScene.builders.set(sceneId, builder);
  }

  public static hasBuilder(sceneId: string): boolean {
    return ContactScene.builders.has(sceneId);
  }

  /** Which diorama this node represents. Settable from the editor. */
  @ENGINE.property()
  public sceneId: string = '';

  private readonly props = new Map<string, RegisteredProp>();
  private readonly shots = new Map<string, CameraShot>();
  private readonly tweener = new Tweener();

  private camera: ENGINE.ViewTargetCameraNode | null = null;
  private readonly cameraPosition = new THREE.Vector3(0, 1.4, 2.2);
  private readonly cameraTarget = new THREE.Vector3(0, 0.9, 0);
  private built = false;

  /**
   * Note: deliberately NOT setting `isRoot = true`.
   *
   * `isRoot` promotes a SceneNode subclass to an "actor" in the editor's class registry,
   * and the editor's actor factory cannot construct this class - action_node.add fails
   * with "Component could not be created" and nothing in the console. As a plain
   * component the diorama can be placed in the scene and inspected in edit mode, which
   * is the only way to see it at all given screenshots are unavailable in play mode.
   */
  public override initialize(options?: ContactSceneOptions): void {
    super.initialize(options);
    this.setTickEnabled(true);

    // Build only on the runtime path, where sceneId arrives through options. A node
    // deserialised by the editor receives sceneId as a property instead and is left
    // empty on purpose - see build().
    if (options?.sceneId) {
      this.sceneId = options.sceneId;
      this.build();
    }
  }

  public override beginPlay(): boolean {
    if (!super.beginPlay()) return false;

    this.camera = ENGINE.ViewTargetCameraNode.create({
      name: 'ContactCamera',
      // Wide-ish and slightly long: a fixed cheap camera in somebody's workshop, not a
      // cinematic rig. §187 wants one clear idea per frame, not constant motion.
      fov: 46,
      near: 0.05,
      far: 400,
      // Every diorama exists from startup, so cameras must not fight over the view.
      // The rig activates exactly one via activate().
      startActive: false,
      position: this.cameraPosition.clone(),
    });
    this.add(this.camera);
    this.applyCameraTransform();

    return true;
  }

  /** True once beginPlay has created the view camera. */
  public get hasCamera(): boolean {
    return this.camera !== null;
  }

  /** How many props the builder registered. Diagnostics. */
  public get propCount(): number {
    return this.props.size;
  }

  /** First registered prop node. Diagnostics only. */
  public debugFirstMesh(): ENGINE.SceneNode | null {
    for (const prop of this.props.values()) return prop.node;
    return null;
  }

  /** Make this diorama the live view. */
  public activate(): void {
    this.visible = true;
    this.camera?.setActive(true);
    this.cutTo('default');
  }

  /** Hide this diorama and release the view. */
  public deactivate(): void {
    this.visible = false;
    this.camera?.setActive(false);
  }

  /**
   * Populate from the registered builder. Safe to call more than once.
   *
   * DO NOT call this during editor scene load. Generated children are ordinary nodes and
   * the editor serialises them into the .genesys-scene document: building on load baked
   * ~9,200 lines of procedural geometry into the scene file and left the editor unable
   * to load its world at all. Recovering meant restoring the file from git.
   *
   * Making dioramas editor-inspectable therefore needs the generated subtree marked
   * non-serialising first. Until then this runs at play time only.
   */
  public build(): void {
    if (this.built || !this.sceneId) return;

    const builder = ContactScene.builders.get(this.sceneId);
    if (!builder) {
      console.warn(`[contact-view] no builder registered for "${this.sceneId}"`);
      return;
    }

    builder(this);
    this.built = true;
    this.cutTo('default');
  }

  /** Drop everything the builder made, keeping the camera. */
  private clearBuilt(): void {
    for (const prop of this.props.values()) {
      prop.node.destroy();
    }
    this.props.clear();
    this.shots.clear();
    this.tweener.clear();
    this.built = false;
  }

  // -- Registration ------------------------------------------------------------------

  public registerProp(
    id: string,
    node: ENGINE.SceneNode,
    options: { actions?: Record<string, PropAction>; anchors?: Record<string, THREE.Vector3> } = {}
  ): void {
    this.add(node);
    this.props.set(id, {
      node,
      actions: options.actions ?? {},
      anchors: options.anchors ?? {},
    });
  }

  public registerShot(id: string, shot: CameraShot): void {
    this.shots.set(id, shot);
  }

  /** Immediately frame a shot without animating. Used when the request opens. */
  public cutTo(id: string): void {
    const shot = this.shots.get(id);
    if (!shot) return;
    this.cameraPosition.copy(shot.position);
    this.cameraTarget.copy(shot.target);
    this.applyCameraTransform();
  }

  /** World-space position of a prop anchor, for placing effects. */
  public getAnchorWorldPosition(propId: string, anchorId: string): THREE.Vector3 | null {
    const prop = this.props.get(propId);
    const local = prop?.anchors[anchorId];
    if (!prop || !local) return null;
    return prop.node.localToWorld(local.clone());
  }

  // -- Cues ---------------------------------------------------------------------------

  /**
   * Run a mission cue.
   * @returns the world position an effect should play at, when the cue implies one.
   */
  public applyCue(cue: string): THREE.Vector3 | null {
    const [head, target] = cue.split(':');
    const [domain, action] = (head ?? '').split('.');

    if (!domain || !action || !target) {
      console.warn(`[contact-view] malformed cue "${cue}"`);
      return null;
    }

    if (domain === 'camera') {
      this.moveCamera(target, action);
      return null;
    }

    if (domain === 'prop') {
      return this.runPropAction(target, action);
    }

    console.warn(`[contact-view] unknown cue domain "${domain}"`);
    return null;
  }

  private moveCamera(shotId: string, action: string): void {
    const shot = this.shots.get(shotId);
    if (!shot) {
      console.warn(`[contact-view] no shot registered for "${shotId}"`);
      return;
    }

    const fromPosition = this.cameraPosition.clone();
    const fromTarget = this.cameraTarget.clone();
    const duration = shot.duration ?? (action === 'pan' ? 2.2 : 1.4);

    this.tweener.add(
      (t) => {
        this.cameraPosition.lerpVectors(fromPosition, shot.position, t);
        this.cameraTarget.lerpVectors(fromTarget, shot.target, t);
        this.applyCameraTransform();
      },
      { duration, easing: Ease.inOutCubic, channel: 'camera' }
    );
  }

  /**
   * Props are addressed as `propId` or `propId-actionSuffix`, so a mission can write
   * `prop.rotate:transmitter-rear` and the scene resolves it to the transmitter's
   * "rear" action without missions knowing about node names.
   */
  private runPropAction(target: string, action: string): THREE.Vector3 | null {
    const direct = this.props.get(target);
    if (direct) {
      return this.invoke(target, direct, action, action);
    }

    const split = target.lastIndexOf('-');
    if (split > 0) {
      const propId = target.slice(0, split);
      const suffix = target.slice(split + 1);
      const prop = this.props.get(propId);
      if (prop) {
        return this.invoke(propId, prop, `${action}-${suffix}`, suffix);
      }
    }

    console.warn(`[contact-view] no prop registered for "${target}"`);
    return null;
  }

  private invoke(
    propId: string,
    prop: RegisteredProp,
    actionKey: string,
    anchorKey: string
  ): THREE.Vector3 | null {
    const run = prop.actions[actionKey];
    if (run) {
      run(this.tweener, prop.node);
    } else {
      console.warn(`[contact-view] prop "${propId}" has no action "${actionKey}"`);
    }

    return this.getAnchorWorldPosition(propId, anchorKey) ?? this.getAnchorWorldPosition(propId, 'default');
  }

  private applyCameraTransform(): void {
    if (!this.camera) return;
    this.camera.position.copy(this.cameraPosition);
    this.camera.lookAt(this.cameraTarget);
  }

  public override tickPrePhysics(deltaTime: number): void {
    super.tickPrePhysics(deltaTime);
    this.tweener.update(deltaTime);
  }

  public override endPlay(): boolean {
    this.tweener.clear();
    return super.endPlay();
  }
}
