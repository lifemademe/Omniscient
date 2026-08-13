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

import { MIRELA, TOMAS } from './content/contacts.js';
import { MISSION_01 } from './content/mission-01-transmitter.js';
import { MISSION_02 } from './content/mission-02-beacon.js';
import { CRTSurface } from './crt/CRTSurface.js';
import { KnowledgeTree } from './crt/KnowledgeTree.js';
import { createCRTTerminal } from './geometry/hardware.js';
import { KnowledgeStore } from './knowledge/KnowledgeStore.js';
import { LocalSurface } from './link/LocalSurface.js';
import { SessionController } from './session/SessionController.js';
import { VFX_LIBRARY } from './vfx/library.js';
import { buildContactScene } from './view/scenes.js';

import type { Contact, MissionDefinition } from './mission/types.js';
import type { ContactScene } from './view/ContactScene.js';

/** Stable per-playthrough seed. §123: the same knowledge must draw the same tree. */
const PLAYTHROUGH_SEED = 0x0c151e;

/** Seconds to draw new growth in, pixel by pixel (§176). */
const GROWTH_REVEAL_SECONDS = 1.8;

/** Beat between a request resolving and the next signal arriving (§168: quiet matters). */
const INTER_MISSION_PAUSE = 3.5;

const MATERIALS = {
  chassis: new THREE.MeshStandardMaterial({ color: '#b9ad92', roughness: 0.78, metalness: 0.05 }),
  bezel: new THREE.MeshStandardMaterial({ color: '#2a2724', roughness: 0.62, metalness: 0.1 }),
  details: new THREE.MeshStandardMaterial({ color: '#6d6a63', roughness: 0.5, metalness: 0.55 }),
};

interface QueuedRequest {
  mission: MissionDefinition;
  contact: Contact;
}

@ENGINE.GameClass()
export class OmniscientRig extends ENGINE.SceneNode {
  private knowledge = new KnowledgeStore(PLAYTHROUGH_SEED);
  private surface: CRTSurface | null = null;
  private tree: KnowledgeTree | null = null;
  private phone: LocalSurface | null = null;
  private session: SessionController | null = null;
  private vfxNodes = new Map<string, ENGINE.VFXNode>();

  private queue: QueuedRequest[] = [];
  private queueIndex = 0;
  private pauseRemaining = 0;

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
      { mission: MISSION_02, contact: TOMAS },
    ];

    this.buildScenes();
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

    // TEMP diagnostics: the editor's console store captures errors only, so warn/log
    // from inside play mode is invisible. Remove once the view is confirmed working.
    console.error(`[diag] scenes built=${this.scenes.size} ids=${[...this.scenes.keys()].join(',')}`);
  }

  public override beginPlay(): boolean {
    if (!super.beginPlay()) return false;

    this.configureLook();
    void this.startSession();

    const scene = this.scenes.get('scene-repair-shop');
    const floor = scene?.debugFirstMesh();
    console.error(
      `[diag] rig world=${!!this.getWorld()} parent=${!!this.parent} ` +
        `sceneParent=${!!scene?.parent} floorParent=${!!floor?.parent} ` +
        `floorInScene=${floor ? !!floor.parent?.parent : false}`
    );

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
    const parts = createCRTTerminal({ seed: 'omniscient-home-terminal', wear: 0.5 });

    const station = ENGINE.SceneNode.create({
      name: 'Workstation',
      position: new THREE.Vector3(0, 0, -60),
    });

    station.add(
      ENGINE.MeshNode.create({ name: 'Chassis', geometry: parts.chassis, material: MATERIALS.chassis })
    );
    station.add(
      ENGINE.MeshNode.create({ name: 'Bezel', geometry: parts.bezel, material: MATERIALS.bezel })
    );
    station.add(
      ENGINE.MeshNode.create({ name: 'Details', geometry: parts.details, material: MATERIALS.details })
    );

    this.surface = new CRTSurface({ width: 192, height: 144 });
    this.tree = new KnowledgeTree(this.surface, this.knowledge.toTreeState());
    this.tree.draw(1);

    station.add(
      ENGINE.MeshNode.create({ name: 'Screen', geometry: parts.screen, material: this.surface.material })
    );

    this.add(station);
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
  }

  /**
   * §187: one strong key direction plus controlled practicals beats many weak lights.
   * Warm and low, so the workshop reads as somewhere a person actually works.
   */
  private buildLighting(): void {
    this.add(
      ENGINE.DirectionalLightNode.create({
        name: 'KeyLight',
        position: new THREE.Vector3(2.5, 3.4, 2.2),
        intensity: 2.1,
        color: new THREE.Color('#ffd9a8'),
      })
    );

    this.add(
      ENGINE.HemisphereLightNode.create({
        name: 'Bounce',
        intensity: 0.5,
        color: new THREE.Color('#9fb4c9'),
        groundColor: new THREE.Color('#3a3128'),
      })
    );
  }

  private configureLook(): void {
    const world = this.getWorld();
    if (!world?.postProcessManager) return;

    // §221: RetroEffect is WebGPU-only and the project runs on WebGL for characters.
    // Bloom carries the phosphor bleed; the CRT read comes from the canvas and CSS.
    world.postProcessManager.configureEffect(ENGINE.PostProcessPass.Bloom, {
      enabled: true,
      strength: 0.5,
      threshold: 0.75,
      radius: 0.65,
    });
  }

  // -- Session -----------------------------------------------------------------------

  private async startSession(): Promise<void> {
    const world = this.getWorld();
    const container = world?.gameContainer;
    if (!container) {
      console.warn('[omniscient] no gameContainer - intervention surface not attached');
      return;
    }

    this.phone = new LocalSurface(container);
    await this.phone.attach();

    this.session = new SessionController(this.phone, this.knowledge, {
      onEnvironment: (cue) => this.applyEnvironmentCue(cue),
      onVfx: (effect) => this.fireVfx(effect),
      onKnowledgeGained: () => this.revealGrowth(),
      onResolved: () => {
        this.pauseRemaining = INTER_MISSION_PAUSE;
      },
    });

    this.openNextRequest();
  }

  private openNextRequest(): void {
    const next = this.queue[this.queueIndex];
    if (!next || !this.session) return;
    this.queueIndex += 1;

    this.mountScene(next.mission.sceneId);
    this.session.start(next.mission, next.contact);
  }

  /** Swap the diorama. One scene is live at a time - §133 foregrounds a single contact. */
  private mountScene(sceneId: string): void {
    this.scene?.deactivate();

    const next = this.scenes.get(sceneId) ?? null;
    if (!next) {
      console.warn(`[omniscient] no diorama built for "${sceneId}"`);
    }

    this.scene = next;
    this.scene?.activate();

    console.error(
      `[diag] mount ${sceneId} found=${!!next} visible=${next?.visible} ` +
        `cameraReady=${next?.hasCamera} props=${next?.propCount}`
    );
  }

  /**
   * §209: the world performs the instruction, the contact's body does not. The scene
   * resolves the cue to a camera move or a prop animation and hands back the world
   * position any effect should play at.
   */
  private applyEnvironmentCue(cue: string): void {
    this.pendingEffectPosition = this.scene?.applyCue(cue) ?? null;
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
    if (!this.tree) return;

    this.pulse = (this.pulse + deltaTime / 1.6) % 1;

    if (this.revealProgress < 1) {
      this.revealProgress = Math.min(this.revealProgress + deltaTime / GROWTH_REVEAL_SECONDS, 1);
      const reveal = this.revealFrom + (1 - this.revealFrom) * this.revealProgress;
      this.tree.draw(reveal, this.pulse);
    } else {
      this.tree.draw(1, this.pulse);
    }

    // §168: let the resolution land before the next signal arrives.
    if (this.pauseRemaining > 0) {
      this.pauseRemaining -= deltaTime;
      if (this.pauseRemaining <= 0 && this.session?.isFinished) {
        this.openNextRequest();
      }
    }
  }

  public override endPlay(): boolean {
    this.session?.end();
    this.phone?.detach();
    this.surface?.dispose();
    this.session = null;
    this.phone = null;
    this.surface = null;
    this.scene = null;
    this.scenes.clear();
    return super.endPlay();
  }
}
