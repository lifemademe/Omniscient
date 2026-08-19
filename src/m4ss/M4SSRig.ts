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

import { buildSurface } from './surface.js';
import { freshLab } from './lab.js';
import {
  TUNING,
  absorbTouching,
  centroid,
  loose,
  makeState,
  mass,
  owned,
  reachOf,
  split,
  step,
} from './mass.js';

import type { Anchor, MassState } from './mass.js';

/** World units across the frame. The level is authored in these. */
const VIEW_WIDTH = 1000;
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
const CAMERA_BACK = VIEW_WIDTH / (2 * Math.tan((CAMERA_FOV * Math.PI) / 360) * CAMERA_ASPECT);

/** Reused, because building a Matrix4 every frame to aim a camera is a frame of garbage. */
const AIM = new THREE.Matrix4();
/** How much of the body is shed per second of held Space. */
const SPLIT_RATE = 0.8;

/**
 * y is DOWN in the level data and up in three.
 *
 * Authoring a side-on level with y down matches every tile editor and every screenshot, so
 * the whole simulation works that way and exactly one function flips it. Doing it in more
 * than one place is how a platform ends up above the ceiling.
 */
function flip(x: number, y: number, z = 0): THREE.Vector3 {
  return new THREE.Vector3(x, -y, z);
}

@ENGINE.GameClass()
export class M4SSRig extends ENGINE.SceneNode {
  private state: MassState | null = null;
  private camera: ENGINE.ViewTargetCameraNode | null = null;

  private body: ENGINE.MeshNode | null = null;
  private rim: ENGINE.MeshNode | null = null;
  private strays: ENGINE.MeshNode | null = null;
  private cord: ENGINE.MeshNode | null = null;
  private readonly anchorNodes = new Map<Anchor, ENGINE.MeshNode>();
  private readonly foodNodes: Array<{ node: ENGINE.MeshNode; index: number }> = [];

  private readonly held = new Set<string>();
  private latched: Anchor | null = null;
  private recalling = false;
  private splitHold = 0;
  private carry = 0;
  private readonly detach: Array<() => void> = [];

  private readonly slimeMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#79d9b0'),
    roughness: 0.35,
    metalness: 0.1,
    emissive: new THREE.Color('#0f3a2c'),
  });
  private readonly rimMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#2f6b57'),
  });
  private readonly strayMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#71879a'),
    roughness: 0.65,
  });
  private readonly cordMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#8fd6e8'),
  });

  public override beginPlay(): boolean {
    if (!super.beginPlay()) return false;

    this.state = makeState(freshLab(), 45);
    this.buildCamera();
    this.buildLights();
    this.buildLevel();
    this.buildSlime();
    this.listen();
    return true;
  }

  public override endPlay(): boolean {
    for (const off of this.detach) off();
    this.detach.length = 0;
    return super.endPlay();
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
      near: 1,
      far: CAMERA_BACK * 2,
      // Without this the node exists and the engine keeps rendering from its own camera -
      // which looks exactly like a broken scene rather than a missing flag.
      startActive: true,
      position: flip(world.width / 2, world.height / 2, CAMERA_BACK),
    });
    this.add(camera);
    this.camera = camera;
    this.aim(flip(world.width / 2, world.height / 2, CAMERA_BACK), flip(world.width / 2, world.height / 2));
  }

  private buildLights(): void {
    const key = ENGINE.DirectionalLightNode.create({
      name: 'M4SSKey',
      position: flip(300, 100, 700),
      intensity: 2.1,
      color: new THREE.Color('#ffe9c9'),
    });
    key.castShadow = false;
    this.add(key);

    this.add(
      ENGINE.HemisphereLightNode.create({
        name: 'M4SSFill',
        intensity: 1.1,
        color: new THREE.Color('#8ea6c8'),
        groundColor: new THREE.Color('#2a2140'),
      })
    );
  }

  private buildLevel(): void {
    const world = this.state?.world;
    if (!world) return;

    const stone = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#3a3654'),
      roughness: 0.95,
    });
    const moss = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#4d7a45'),
      roughness: 0.9,
    });

    for (const t of world.tiles) {
      const slab = new THREE.BoxGeometry(t.w, t.h, 60);
      const node = ENGINE.MeshNode.create({ name: 'Tile', geometry: slab, material: stone });
      node.position.copy(flip(t.x + t.w / 2, t.y + t.h / 2, -30));
      this.add(node);

      // A lip of overgrowth on every top face. The theme, doing the level's outlining for it.
      const lip = new THREE.BoxGeometry(t.w, 7, 62);
      const green = ENGINE.MeshNode.create({ name: 'Moss', geometry: lip, material: moss });
      green.position.copy(flip(t.x + t.w / 2, t.y + 3, -30));
      this.add(green);
    }

    const anchorGeometry = new THREE.TorusGeometry(11, 3, 6, 14);
    for (const a of world.anchors) {
      const node = ENGINE.MeshNode.create({
        name: 'GrowthPoint',
        geometry: anchorGeometry,
        material: new THREE.MeshBasicMaterial({ color: new THREE.Color('#7fe08a') }),
      });
      node.position.copy(flip(a.x, a.y, 20));
      this.add(node);
      this.anchorNodes.set(a, node);
    }

    const biomass = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#e8c15a'),
      roughness: 0.4,
      emissive: new THREE.Color('#4a3a10'),
    });
    world.food.forEach((f, index) => {
      const node = ENGINE.MeshNode.create({
        name: 'Biomass',
        geometry: new THREE.SphereGeometry(4 + f.mass * 0.14, 8, 6),
        material: biomass,
      });
      node.position.copy(flip(f.x, f.y, 10));
      this.add(node);
      this.foodNodes.push({ node, index });
    });
  }

  private buildSlime(): void {
    const empty = new THREE.BufferGeometry();
    this.rim = ENGINE.MeshNode.create({ name: 'SlimeRim', geometry: empty.clone(), material: this.rimMaterial });
    this.rim.position.z = -2;
    this.add(this.rim);

    this.body = ENGINE.MeshNode.create({ name: 'Slime', geometry: empty.clone(), material: this.slimeMaterial });
    this.add(this.body);

    this.strays = ENGINE.MeshNode.create({ name: 'Strays', geometry: empty.clone(), material: this.strayMaterial });
    this.strays.position.z = -4;
    this.add(this.strays);

    this.cord = ENGINE.MeshNode.create({ name: 'Tendril', geometry: empty.clone(), material: this.cordMaterial });
    this.cord.position.z = 4;
    this.add(this.cord);
  }

  // -- input ------------------------------------------------------------------------------

  private listen(): void {
    const down = (e: KeyboardEvent): void => {
      this.held.add(e.code);
      if (e.code === 'KeyQ') this.recalling = true;
      if (e.code === 'Space') e.preventDefault();
    };
    const up = (e: KeyboardEvent): void => {
      this.held.delete(e.code);
      if (e.code === 'KeyQ') this.recalling = false;
      if (e.code === 'Space' && this.state) {
        split(this.state, this.splitHold);
        this.splitHold = 0;
      }
    };
    const press = (e: MouseEvent): void => this.grab(e);
    const release = (): void => {
      this.latched = null;
    };

    addEventListener('keydown', down);
    addEventListener('keyup', up);
    addEventListener('mousedown', press);
    addEventListener('mouseup', release);
    this.detach.push(
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
  private grab(event: MouseEvent): void {
    const world = this.state?.world;
    if (!world) return;
    const target = event.target as HTMLElement | null;
    const rect = target?.getBoundingClientRect?.();
    if (!rect || rect.width === 0) return;

    const height = (VIEW_WIDTH * rect.height) / rect.width;
    const wx = world.width / 2 + ((event.clientX - rect.left) / rect.width - 0.5) * VIEW_WIDTH;
    const wy = world.height / 2 + ((event.clientY - rect.top) / rect.height - 0.5) * height;

    let best: Anchor | null = null;
    let bestD = 90;
    for (const a of world.anchors) {
      const d = Math.hypot(a.x - wx, a.y - wy);
      if (d < bestD) {
        bestD = d;
        best = a;
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
      this.splitHold = Math.min(1, this.splitHold + deltaTime * SPLIT_RATE);
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
    this.carry = Math.min(this.carry + deltaTime, 0.25);
    while (this.carry >= TUNING.dt) {
      step(state, { move, anchor: this.latched, recall: this.recalling });
      this.carry -= TUNING.dt;
    }
    if (this.recalling) absorbTouching(state);

    this.paintSlime();
    this.paintWorld();
    this.follow();
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
    const mine = owned(state).map((p) => ({ x: p.x, y: -p.y }));
    this.replace(this.body, buildSurface(mine, { cell: 4 }));
    // A second contour at a lower threshold is a rim: the same shape, slightly fatter.
    this.replace(this.rim, buildSurface(mine, { cell: 5, threshold: 0.72 }));

    const strandedPoints = loose(state).map((p) => ({ x: p.x, y: -p.y }));
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
    const ay = -from.y;
    const bx = to.x;
    const by = -to.y;
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

  private paintWorld(): void {
    const state = this.state;
    if (!state) return;

    for (const { node, index } of this.foodNodes) {
      node.visible = !state.world.food[index].eaten;
    }

    /*
     * Growth points go red when they are out of reach.
     *
     * The one piece of help the greybox gives, and it is here so the TEST works: a player
     * who cannot see what is in range cannot tell a mechanic from a bug in the two minutes
     * they will spend with this.
     */
    const mine = owned(state);
    if (mine.length === 0) return;
    const home = centroid(mine);
    const limit = reachOf(state);
    for (const [anchor, node] of this.anchorNodes) {
      const within = Math.hypot(anchor.x - home.x, anchor.y - home.y) <= limit;
      const material = node.material as THREE.MeshBasicMaterial;
      material.color.set(anchor === this.latched ? '#ffffff' : within ? '#7fe08a' : '#a8402f');
    }
  }

  /** The camera drifts after the body rather than tracking it, so small wobbles do not swim. */
  private follow(): void {
    const state = this.state;
    if (!state || !this.camera) return;
    const mine = owned(state);
    if (mine.length === 0) return;
    const home = centroid(mine);
    this.camera.position.lerp(flip(home.x, home.y, CAMERA_BACK), 0.06);
    this.aim(this.camera.position, flip(home.x, home.y));
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
