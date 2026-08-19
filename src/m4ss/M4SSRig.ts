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


@ENGINE.GameClass()
export class M4SSRig extends ENGINE.SceneNode {
  private state: MassState | null = null;
  private camera: ENGINE.ViewTargetCameraNode | null = null;
  /** Everything in level coordinates hangs off this. See SCALE. */
  private stage: ENGINE.SceneNode | null = null;

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

    this.state = makeState(freshLab(), 45);
    const stage = ENGINE.SceneNode.create({ name: 'M4SSStage' });
    stage.scale.set(SCALE, -SCALE, SCALE);
    this.add(stage);
    this.stage = stage;

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
      near: 0.1,
      far: CAMERA_BACK * 4,
      // Without this the node exists and the engine keeps rendering from its own camera -
      // which looks exactly like a broken scene rather than a missing flag.
      startActive: true,
      position: place(world.width / 2, world.height / 2).setZ(CAMERA_BACK),
    });
    this.add(camera);
    this.camera = camera;
    this.aim(
      place(world.width / 2, world.height / 2).setZ(CAMERA_BACK),
      place(world.width / 2, world.height / 2)
    );
  }

  private buildLights(): void {
    const key = ENGINE.DirectionalLightNode.create({
      name: 'M4SSKey',
      position: place(300, 100).setZ(CAMERA_BACK),
      // Bright, because the scene's tone mapping runs at exposure 0.5 and this room has no
      // sky. Tuned by looking at it rather than by reasoning about it.
      intensity: 6.5,
      color: new THREE.Color('#ffe9c9'),
    });
    key.castShadow = false;
    this.add(key);

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
   */
  private buildLevel(): void {
    const world = this.state?.world;
    if (!world) return;

    const stone = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#5b5480'),
      roughness: 0.95,
    });
    const moss = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#77b96a'),
      roughness: 0.9,
    });

    for (const t of world.tiles) {
      const slab = new THREE.BoxGeometry(t.w, t.h, 60);
      const node = decorMesh('Tile', slab, stone);
      node.position.set(t.x + t.w / 2, t.y + t.h / 2, -30);
      this.add(node);

      // A lip of overgrowth on every top face. The theme, doing the level's outlining for it.
      const lip = new THREE.BoxGeometry(t.w, 7, 62);
      const green = decorMesh('Moss', lip, moss);
      green.position.set(t.x + t.w / 2, t.y + 3, -30);
      this.add(green);
    }

    const anchorGeometry = new THREE.TorusGeometry(11, 3, 6, 14);
    for (const a of world.anchors) {
      const node = decorMesh(
        'GrowthPoint',
        anchorGeometry,
        new THREE.MeshBasicMaterial({ color: new THREE.Color('#7fe08a') })
      );
      node.position.set(a.x, a.y, 20);
      this.stage?.add(node);
      this.anchorNodes.set(a, node);
    }

    const biomass = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#e8c15a'),
      roughness: 0.4,
      emissive: new THREE.Color('#4a3a10'),
    });
    world.food.forEach((f, index) => {
      const node = decorMesh('Biomass', new THREE.SphereGeometry(4 + f.mass * 0.14, 8, 6), biomass);
      node.position.set(f.x, f.y, 10);
      this.stage?.add(node);
      this.foodNodes.push({ node, index });
    });
  }

  private buildSlime(): void {
    const empty = new THREE.BufferGeometry();
    this.rim = decorMesh('SlimeRim', empty.clone(), this.rimMaterial);
    this.rim.position.z = -2;
    this.stage?.add(this.rim);

    this.body = decorMesh('Slime', empty.clone(), this.slimeMaterial);
    this.stage?.add(this.body);

    this.strays = decorMesh('Strays', empty.clone(), this.strayMaterial);
    this.strays.position.z = -4;
    this.stage?.add(this.strays);

    this.cord = decorMesh('Tendril', empty.clone(), this.cordMaterial);
    this.cord.position.z = 4;
    this.stage?.add(this.cord);
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
    // Level coordinates: the stage flips and scales them.
    const mine = owned(state).map((p) => ({ x: p.x, y: p.y }));
    this.replace(this.body, buildSurface(mine, { cell: 4 }));
    // A second contour at a lower threshold is a rim: the same shape, slightly fatter.
    this.replace(this.rim, buildSurface(mine, { cell: 5, threshold: 0.72 }));

    const strandedPoints = loose(state).map((p) => ({ x: p.x, y: p.y }));
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
  private follow(): void {
    if (!this.camera || !this.state) return;
    const world = this.state.world;
    this.camera.position.copy(place(world.width / 2, world.height / 2).setZ(CAMERA_BACK));
    this.aim(this.camera.position, place(world.width / 2, world.height / 2));
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
