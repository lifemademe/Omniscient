import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { getAccessibilityPreferences } from '../accessibility/preferences.js';

/**
 * The drone's two verbs, made visible in the world.
 *
 * ## Why this exists
 *
 * Scanning and gripping are the most important things the player does in Warehouse 07 and
 * were the only two that produced nothing in the 3D view. Both played a sound and wrote a
 * line into the HUD, so the confirmation arrived in the corner of the screen while the
 * player was looking at the middle of it. The machine did the work and the diorama never
 * acknowledged it, which reads as an input that did not land - the classic reason a correct
 * interaction still feels broken.
 *
 * So every response here is placed at the thing it is about: the pulse lands on the subject,
 * the recoil happens on the gripper, and the lens takes a small kick. Nothing here changes
 * what a verb DOES - it only makes the world admit that it happened.
 *
 * ## The fade is a flipbook, and it has to be
 *
 * Writing material.opacity from the frame loop does not reach the renderer through
 * ENGINE.MeshNode in this project - the value handed in at construction is honoured and
 * later writes are silently dropped. That has already killed three effects across this
 * codebase, each hunted as "the sprite never appears" before the cause was found.
 *
 * Rather than risk a fourth, every ring is built as a stack of meshes whose opacities are
 * fixed at construction and descending, and the fade is done by showing one rung at a time.
 * visible, position, scale and quaternion all work every frame, so the whole module is built
 * out of only those four.
 */

/** Opacities of the fade stack, brightest first. Fixed at construction - see the header. */
const FADE_STEPS = [0.5, 0.34, 0.2, 0.09] as const;

/** Scratch quaternions for rebasing the billboard facing into the rig's space. */
const FACE_WORLD = new THREE.Quaternion();
const FACE_LOCAL = new THREE.Quaternion();

/** One expanding ring, faded by swapping between pre-built rungs. */
class PulseRing {
  public readonly root = ENGINE.SceneNode.create({ name: 'ScanPulseRing' });
  private readonly rungs: ENGINE.MeshNode[] = [];
  private life = 0;
  private duration = 0.5;
  private spread = 1;

  public constructor(
    private readonly colour: string,
    private readonly innerRadius: number,
    private readonly thickness: number
  ) {
    this.root.visible = false;
  }

  /**
   * Meshes are created AND parented here, never in a constructor, and that is load-bearing.
   *
   * These rings first rendered nothing at all. Not a wrong colour or a bad transform: zero
   * pixels, from nodes whose position and visible flag both read back exactly as set. The
   * mechanism test that found it forced a ring permanently on at four times scale two metres
   * in front of the lens and still measured zero teal pixels.
   *
   * What it turned out to be: `add()` called while the rig's own fields are still
   * initialising does not take. A three-way bisect settled it - the same ring geometry and
   * additive material parented to the drone rendered 29k pixels, and a plain box added to
   * THIS module's root at runtime rendered 40k, so neither the material nor the root was at
   * fault. Only the moment of parenting was.
   *
   * WarehouseEnvironment already had the shape of the answer: it creates only its root in a
   * field and does everything else in build(). That is the convention here for a reason.
   */
  public build(): void {
    if (this.rungs.length > 0) return;
    for (const [index, opacity] of FADE_STEPS.entries()) {
      const node = ENGINE.MeshNode.create({
        name: `ScanPulseRung-${index + 1}`,
        geometry: new THREE.RingGeometry(this.innerRadius, this.innerRadius + this.thickness, 40),
        material: new THREE.MeshBasicMaterial({
          color: this.colour,
          transparent: true,
          opacity,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        }),
      });
      node.visible = false;
      this.rungs.push(node);
      this.root.add(node);
    }
    this.root.visible = false;
  }

  public fire(at: THREE.Vector3, duration: number, spread: number): void {
    if (this.rungs.length === 0) return;
    this.root.position.copy(at);
    this.duration = duration;
    this.spread = spread;
    this.life = duration;
    this.root.visible = true;
  }

  public get active(): boolean {
    return this.life > 0;
  }

  /**
   * face billboards the ring at the camera so it reads as a flat pulse from any angle - a
   * world-aligned ring disappears entirely when viewed edge-on, which is precisely the angle
   * a drone hovering over a pallet tends to be at.
   */
  public tick(deltaTime: number, face: THREE.Quaternion, still: boolean): void {
    if (this.life <= 0) return;
    this.life = Math.max(0, this.life - deltaTime);
    const progress = this.duration > 0 ? 1 - this.life / this.duration : 1;
    this.root.quaternion.copy(face);
    // Held near full size for reduced motion: the ring still marks the subject, it just
    // does not travel outward.
    const scale = still ? this.spread * 0.6 : 0.25 + progress * this.spread;
    this.root.scale.setScalar(Math.max(0.001, scale));
    const rung = Math.min(this.rungs.length - 1, Math.floor(progress * this.rungs.length));
    for (const [index, node] of this.rungs.entries()) node.visible = index === rung;
    if (this.life <= 0) {
      this.root.visible = false;
      for (const node of this.rungs) node.visible = false;
    }
  }

  public dispose(): void {
    for (const node of this.rungs) {
      node.geometry?.dispose();
      (node.material as THREE.Material | undefined)?.dispose();
    }
  }
}

/** World-space acknowledgement for scan and grip, plus the lens kick that sells both. */
export class WarehouseDroneFeedback {
  public readonly root = ENGINE.SceneNode.create({ name: 'WarehouseDroneFeedback' });

  private readonly subjectPulse = new PulseRing('#8dfff0', 0.44, 0.1);
  private readonly emitterPulse = new PulseRing('#bff4ea', 0.16, 0.05);
  private readonly gripRing = new PulseRing('#ffcf92', 0.2, 0.06);

  /** The gripper mesh, borrowed so the recoil happens on the part that did the gripping. */
  private gripper: ENGINE.MeshNode | null = null;
  private gripperRest = 0;
  private gripperPunch = 0;

  /** Decaying lens kick, read by the rig while it is composing the camera. */
  private kick = 0;
  private kickPhase = 0;

  /**
   * Create and parent the rings. Must run from the rig's build pass, never from a field
   * initialiser or this constructor - see PulseRing.build for what that costs.
   */
  public build(): void {
    for (const ring of [this.subjectPulse, this.emitterPulse, this.gripRing]) {
      ring.build();
      this.root.add(ring.root);
    }
  }

  /**
   * World in, local out.
   *
   * Every public entry point here takes a WORLD position, because that is what the callers
   * have - `getWorldPosition` off a cargo node, a worker, an intruder. Node `position` is
   * LOCAL to the parent, and the warehouse rig does not sit at the origin: the runtime bonus
   * world is offset roughly 800m up, so the drone reads y 3.2 locally and y 803.2 in world
   * space.
   *
   * Feeding one to the other put every ring 800m above the roof - built, parented, visible,
   * correctly scaled, and in the sky. It looked exactly like "the effect does not render",
   * and cost several builds chasing the engine before the numbers were simply printed on
   * screen: `rungs=4 life=0.15 rootVis=true visRungs=1 sc=2.46 @-10.9,800.0,-2.9`. Every
   * field right except one.
   */
  private toLocal(world: THREE.Vector3): THREE.Vector3 {
    this.root.updateWorldMatrix(true, false);
    return this.root.worldToLocal(world.clone());
  }

  /** Hand the gripper over once it is built; the recoil is a no-op until this is called. */
  public bindGripper(gripper: ENGINE.MeshNode): void {
    this.gripper = gripper;
    this.gripperRest = gripper.position.y;
  }

  /**
   * A ping leaves the lens and lands on the subject.
   *
   * Two rings rather than one because a single ring at the target says "that thing is
   * important" while a pair says "this machine did that" - the causal read is what makes a
   * scan feel like an action instead of an annotation appearing.
   */
  public scanPulse(from: THREE.Vector3, to: THREE.Vector3): void {
    const still = getAccessibilityPreferences().reducedMotion;
    this.emitterPulse.fire(this.toLocal(from), still ? 0.5 : 0.26, 1.5);
    this.subjectPulse.fire(this.toLocal(to), still ? 0.75 : 0.52, 3.1);
    if (!still) {
      this.kick = Math.max(this.kick, 0.035);
      this.kickPhase = 0;
    }
  }

  /**
   * The gripper takes the load.
   *
   * Securing punches harder than releasing: picking a crate up is the moment with
   * consequence, and letting one go should not feel like the same event played twice.
   */
  public gripPulse(at: THREE.Vector3, secured: boolean): void {
    const still = getAccessibilityPreferences().reducedMotion;
    this.gripRing.fire(this.toLocal(at), still ? 0.6 : 0.38, secured ? 2.2 : 1.6);
    if (still) return;
    this.gripperPunch = secured ? 1 : 0.6;
    this.kick = Math.max(this.kick, secured ? 0.05 : 0.03);
    this.kickPhase = 0;
  }

  public tick(deltaTime: number, face: THREE.Quaternion): void {
    const still = getAccessibilityPreferences().reducedMotion;
    /*
     * The camera's quaternion is a world rotation and the rings are children, so it has to
     * be rebased the same way the positions are - otherwise any yaw on the rig would tilt
     * every pulse off the lens axis. It happens to be identity today; relying on that would
     * be a trap for whoever first rotates this world.
     */
    this.root.updateWorldMatrix(true, false);
    FACE_WORLD.setFromRotationMatrix(this.root.matrixWorld).invert();
    FACE_LOCAL.copy(FACE_WORLD).multiply(face);
    this.subjectPulse.tick(deltaTime, FACE_LOCAL, still);
    this.emitterPulse.tick(deltaTime, FACE_LOCAL, still);
    this.gripRing.tick(deltaTime, FACE_LOCAL, still);

    /*
     * The gripper drops and springs back rather than easing home, because a magnetic clamp
     * that returns smoothly reads as a servo and one that overshoots reads as something
     * being caught. The overshoot is the whole effect; damping it out would leave a part
     * that merely moved.
     */
    if (this.gripper) {
      this.gripperPunch = Math.max(0, this.gripperPunch - deltaTime * 3.4);
      const swing = Math.sin(this.gripperPunch * Math.PI * 2.1) * this.gripperPunch;
      this.gripper.position.y = this.gripperRest - swing * 0.06;
      this.gripper.scale.set(
        1 + this.gripperPunch * 0.18,
        1 - this.gripperPunch * 0.2,
        1 + this.gripperPunch * 0.18
      );
    }

    this.kickPhase += deltaTime * 34;
    this.kick = Math.max(0, this.kick - deltaTime * 0.19);
  }

  /**
   * Offset the composed camera position by the current kick.
   *
   * Deliberately applied to the lens and not the drone: shaking the airframe would fight the
   * flight model and leave the machine drifting off where the player left it. The camera owns
   * the recoil, the drone owns its position, and neither has to know about the other.
   */
  public applyKick(target: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3): void {
    if (this.kick <= 0) return;
    const decay = this.kick;
    target.addScaledVector(up, Math.sin(this.kickPhase) * decay);
    target.addScaledVector(right, Math.cos(this.kickPhase * 0.7) * decay * 0.55);
  }

  public dispose(): void {
    this.subjectPulse.dispose();
    this.emitterPulse.dispose();
    this.gripRing.dispose();
    if (this.gripper) {
      this.gripper.position.y = this.gripperRest;
      this.gripper.scale.setScalar(1);
    }
  }
}
