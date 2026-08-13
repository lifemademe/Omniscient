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
  /** Per-frame behaviour the world performs on its own. See registerProp. */
  idle?: (deltaTime: number, node: ENGINE.SceneNode) => void;
}

/** Populates a scene with its props, shots and actions. Registered by content modules. */
export type SceneBuilder = (scene: ContactScene) => void;

export interface ContactSceneOptions extends ENGINE.SceneNodeOptions {
  sceneId?: string;
}

/** What a cue resolved to. Camera work is handed back to the rig. */
export interface CueResult {
  /** Set when the cue was a camera move. */
  shot?: CameraShot;
  shotDuration?: number;
  /** Set when a prop action implies an effect at a point in the world. */
  effectPosition?: THREE.Vector3;
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

  /** Show this diorama. The rig owns the camera and frames the shot. */
  public activate(): void {
    this.visible = true;
  }

  /** Hide this diorama. */
  public deactivate(): void {
    this.visible = false;
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
    options: {
      actions?: Record<string, PropAction>;
      anchors?: Record<string, THREE.Vector3>;
      /**
       * Runs every frame while the scene is on view.
       *
       * For behaviour the world does on its own rather than because the player said
       * something. Tomas's beacon is the reason he called: it has to be visibly going out
       * and coming back the whole time the player is talking to him, not waiting politely
       * for a cue. A symptom that only appears when you ask about it is not a symptom.
       */
      idle?: (deltaTime: number, node: ENGINE.SceneNode) => void;
    } = {}
  ): void {
    this.add(node);
    this.props.set(id, {
      node,
      actions: options.actions ?? {},
      anchors: options.anchors ?? {},
      idle: options.idle,
    });
  }

  public registerShot(id: string, shot: CameraShot): void {
    this.shots.set(id, shot);
  }

  /** Look up a registered shot. The rig's camera does the framing. */
  public getShot(id: string): CameraShot | null {
    return this.shots.get(id) ?? null;
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
   *
   * Prop cues are handled here. Camera cues are resolved to a shot and returned, because
   * the camera belongs to the rig - see CameraRig.
   */
  public applyCue(cue: string): CueResult {
    const [head, target] = cue.split(':');
    const [domain, action] = (head ?? '').split('.');

    if (!domain || !action || !target) {
      console.warn(`[contact-view] malformed cue "${cue}"`);
      return {};
    }

    if (domain === 'camera') {
      const shot = this.shots.get(target);
      if (!shot) {
        console.warn(`[contact-view] no shot registered for "${target}"`);
        return {};
      }
      return { shot, shotDuration: shot.duration ?? (action === 'pan' ? 2.2 : 1.4) };
    }

    if (domain === 'prop') {
      return { effectPosition: this.runPropAction(target, action) ?? undefined };
    }

    console.warn(`[contact-view] unknown cue domain "${domain}"`);
    return {};
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
    } else if (actionKey.startsWith('highlight')) {
      // Every prop can be pointed at, whether or not it authored an action for it - a
      // hint that highlights nothing would be worse than no hint (§131).
      this.highlight(prop.node);
    } else {
      console.warn(`[contact-view] prop "${propId}" has no action "${actionKey}"`);
    }

    return this.getAnchorWorldPosition(propId, anchorKey) ?? this.getAnchorWorldPosition(propId, 'default');
  }

  /**
   * Default highlight: three quick pulses of scale.
   *
   * Deliberately motion rather than colour - a tint would fight the palette's value
   * structure, and a thing that *moves* is what the eye finds in a cluttered frame.
   */
  private highlight(node: ENGINE.SceneNode): void {
    const base = node.scale.clone();
    this.tweener.add(
      (t) => {
        const pulse = 1 + Math.sin(t * Math.PI * 6) * 0.14 * (1 - t);
        node.scale.set(base.x * pulse, base.y * pulse, base.z * pulse);
      },
      {
        duration: 1.1,
        easing: Ease.linear,
        channel: `highlight-${node.uuid}`,
        onComplete: () => node.scale.copy(base),
      }
    );
  }

  public override tickPrePhysics(deltaTime: number): void {
    super.tickPrePhysics(deltaTime);
    this.tweener.update(deltaTime);
    for (const prop of this.props.values()) {
      prop.idle?.(deltaTime, prop.node);
    }
  }

  public override endPlay(): boolean {
    this.tweener.clear();
    return super.endPlay();
  }
}
