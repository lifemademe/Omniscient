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

import { applyCertainty, CERTAINTY } from '../art/certainty.js';
import { createSuspicion, type Suspicion } from '../art/suspected.js';

/** Seconds between staggered resolves. ART_DIRECTION §3. */
const RESOLVE_STAGGER = 0.18;

import { seedFrom } from '../core/rng.js';
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
  /** Drawn in ink by the outline pass. See registerProp's `inked`. */
  inked?: boolean;
  /** How much the machine knows about this prop. ART_DIRECTION §1. */
  certainty?: number;
  /** Live only below SHAPED: the guess standing in for the prop. ART_DIRECTION §1 tier 1. */
  suspicion?: Suspicion;
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

  /**
   * Has this diorama ever been put on screen? Gates every material change.
   *
   * `visible` was the gate and was the wrong one, in a way that took a magenta test to
   * see. `build()` runs from the constructor, and the rig sets `visible = false` only
   * once the constructor has RETURNED - so throughout the build the scene reports itself
   * visible, every setCertainty applies immediately, and the results are handed to
   * MeshNode material loads that are still in flight. The loads win. Nothing errors, the
   * counts all look healthy, and the room comes out unchanged.
   *
   * This is the same trap the note in setCertainty describes and thought it had closed.
   * It had not: the guard was reading a flag that is true at exactly the wrong moment.
   */
  private live = false;

  /** Show this diorama. The rig owns the camera and frames the shot. */
  public activate(): void {
    this.visible = true;
    this.live = true;
    this.applyCertainties();
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
      /**
       * Draw this prop with an outline.
       *
       * Deliberately opt-in and deliberately rare. The outline pass is the loudest tool
       * this project has for directing the eye, and §186 has been about pointing at the
       * one thing that matters in each room since the first diorama. Ink the contact and
       * the object their request is about; ink a third thing and the first two stop
       * meaning anything.
       *
       * The contact is inked automatically - see `inkedProps`. This flag is for the
       * evidence: the radio, the beacon, the run of pipe, the lock.
       */
      inked?: boolean;
    } = {}
  ): void {
    this.add(node);
    this.props.set(id, {
      node,
      actions: options.actions ?? {},
      anchors: options.anchors ?? {},
      idle: options.idle,
      inked: options.inked,
    });
  }

  /**
   * The nodes this scene wants drawn in ink.
   *
   * Props registered `inked`, and deliberately NOT the contact - see the outline block in
   * OmniscientRig.configureLook for why a person standing behind a bench cannot be
   * outlined in this pipeline. Returned rather than pushed, because the outline effect
   * belongs to the rig's post-process manager and a diorama has no business knowing that a
   * render pipeline exists.
   */
  public inkedProps(): ENGINE.SceneNode[] {
    const out: ENGINE.SceneNode[] = [];
    for (const prop of this.props.values()) {
      if (prop.inked) out.push(prop.node);
    }
    return out;
  }

  /**
   * The same props, with the ids they were registered under.
   *
   * The scan overlay needs to write a name next to each reticle, and `inkedProps` throws
   * that away - it was shaped for the outline pass, which only ever needed the node. Kept
   * as a second method rather than widening the first because the two callers want
   * genuinely different things and one of them is on its way out: the outline is disabled,
   * and the reticles are what replaced it.
   */
  /**
   * Set how much the machine knows about one prop. ART_DIRECTION §1.
   *
   * The scene owns this rather than the rig because certainty is a property of the room's
   * contents, and the rig has no business knowing which prop id is the radio. Missions
   * raise it from their beats; the builder sets the opening state.
   */
  public setCertainty(id: string, certainty: number): void {
    const prop = this.props.get(id);
    if (!prop) {
      console.warn(`[certainty] no prop "${id}" in ${this.sceneId}`);
      return;
    }
    /*
     * Warn on a hit that changed nothing.
     *
     * A mistyped id and a prop whose meshes the traversal cannot reach fail identically -
     * silently - and this project has lost whole afternoons to exactly that shape of
     * nothing-happened. The count makes the difference visible at the moment it occurs.
     */
    /*
     * Recorded, then applied on activate rather than now.
     *
     * MeshNode's material setter routes through `resourceManager.loadGenericMaterial` and
     * assigns the result to the inner mesh when the promise settles - and the constructor
     * has already started that load by the time a builder runs. So a material changed
     * during the build is changed correctly, counted correctly, and then overwritten a
     * moment later by a load that was already in flight. Three cycles measured a mean
     * frame difference of 0.8 with every prop reporting a healthy touch count, because
     * nothing had failed; it had simply been undone.
     *
     * Applying after the room is put on screen is later than any of those loads, and it is
     * also where this needs to happen anyway - certainty rises during a conversation, so
     * the re-apply path is the main path and the builder is just the opening state.
     */
    prop.certainty = certainty;
    if (this.live) this.applyCertainties();
  }

  /**
   * Push every recorded certainty onto its prop. Cheap, idempotent, safe to repeat.
   *
   * Anything a builder has not spoken for gets SHAPED, and anything marked `inked` gets
   * KNOWN. That default is not a shortcut - it is the correct reading. The machine knows
   * the shape of the room it is looking at and almost nothing about the contents, and the
   * one object it has been told about in detail is precisely the one each request is
   * about, which is what `inked` has always meant.
   *
   * It also means the law reaches all eight rooms without eight hand-authored tables,
   * which is the difference between a system and a demo. A builder that knows better -
   * that the shelf is a mystery, that the bench is not - still overrides per prop.
   */
  private applyCertainties(): void {
    let resolved = 0;
    for (const [id, prop] of this.props) {
      const certainty =
        prop.certainty ?? (prop.inked ? CERTAINTY.KNOWN : CERTAINTY.SHAPED);

      /*
       * Below SHAPED the prop is not rendered at all - the machine's guess at it is. That
       * is a different KIND of change from the tiers above, which are all one material
       * doing more or less work, so it is a branch here rather than another parameter
       * inside the colour law.
       *
       * The suspicion is built once and torn down the moment the prop is promoted, which
       * is the resolve moment the whole direction is built around: a black box with lit
       * edges becomes a thing, because somebody said what it was.
       */
      if (certainty < CERTAINTY.SHAPED) {
        prop.suspicion ??=
          createSuspicion(prop.node as unknown as THREE.Object3D, seedFrom(`${this.sceneId}:${id}`)) ??
          undefined;
        continue;
      }

      /*
       * Promoted. This is the resolve moment the whole direction is built to pay, so it
       * sweeps rather than snapping - see ART_DIRECTION §3 and art/suspected.
       *
       * Staggered, because a beat that raises three certainties at once would otherwise
       * fire three identical animations on the same frame, and three of anything in perfect
       * lockstep reads as a glitch rather than as three separate things being learned.
       * §3 puts the ceiling at two at a time and the gap at 180ms.
       *
       * The suspicion is NOT cleared here. It has to keep ticking to drive its own sweep,
       * and it retires itself when the sweep finishes - see the tick.
       */
      if (prop.suspicion && !prop.suspicion.resolving) {
        prop.suspicion.resolve(resolved * RESOLVE_STAGGER);
        resolved += 1;
      }
      applyCertainty(prop.node as unknown as THREE.Object3D, certainty);
    }

    for (const finish of this.finishers) finish();
  }

  /**
   * Work that has to happen after the certainty pass, every time it runs.
   *
   * Two constraints force this to exist. Material changes made during `build()` do not
   * survive - MeshNode's setter finishes asynchronously and a load already in flight puts
   * the original back - so anything touching a material has to wait for activate. And the
   * certainty pass CLONES materials, so anything installed before it would be working on an
   * object that is no longer the one being drawn.
   *
   * A builder that wants a room-wide material effect registers it here and gets both for
   * free. Finishers must be idempotent: this runs on every activate and on every certainty
   * change during a conversation.
   */
  private readonly finishers: Array<() => void> = [];

  public registerFinisher(finish: () => void): void {
    this.finishers.push(finish);
  }

  public scanTargets(): { id: string; node: ENGINE.SceneNode }[] {
    const out: { id: string; node: ENGINE.SceneNode }[] = [];
    for (const [id, prop] of this.props) {
      if (prop.inked) out.push({ id, node: prop.node });
    }
    return out;
  }

  /**
   * A live value the console feeds the world, mid-beat.
   *
   * The cue system is the normal channel and it is the wrong shape for this: a cue is a
   * discrete instruction with a name, fired when a beat changes, and what the chase needs
   * is a continuous number arriving many times a second while one beat is running.
   *
   * Deliberately narrow. A scene may register at most one of these and only mission 07
   * does; if a second real-time beat ever wants one it should say so in its own terms
   * rather than turning this into a general message bus, which is how a clean cue system
   * becomes a soup of untyped strings.
   */
  /**
   * Whether this diorama has air in it.
   *
   * Every scene so far is a place - a shop, a cellar, a road - and the rig's linear fog
   * gives them depth. The surveillance city is not a place; it is a reconstruction from a
   * road network and a camera register, and there is nothing between the camera and it to
   * scatter light. Fog there is not atmosphere, it is a bug: at fogFar 26 against a
   * district 192m across, every line rendered at 100% haze colour and the whole city came
   * out a uniform blue-grey with its brightest pixel at 58 against a background of 30.
   */
  public atmosphere = true;

  private aimHandler: ((to: number) => void) | null = null;

  public onAim(handler: (to: number) => void): void {
    this.aimHandler = handler;
  }

  /** Drive whatever this scene aims. No-op for the six that aim nothing. */
  public aim(to: number): void {
    this.aimHandler?.(to);
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
      // A suspicion retires itself once its sweep has played out. Clearing it here rather
      // than at the moment of promotion is what lets the sweep run at all.
      if (prop.suspicion && !prop.suspicion.update(deltaTime)) prop.suspicion = undefined;
    }
  }

  public override endPlay(): boolean {
    this.tweener.clear();
    return super.endPlay();
  }
}
