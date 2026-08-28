import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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
 * ## The fade is a real fade, and that was worth checking
 *
 * A standing note in this project says per-frame material.opacity writes never reach the
 * renderer through ENGINE.MeshNode, so these rings were first built as a stack of meshes at
 * fixed descending opacities, faded by showing one rung at a time.
 *
 * Measured 2026-08-24, that turns out not to hold here: two probe quads driven by a square
 * wave and compared with a per-pixel diff across frames showed BOTH opacity and
 * emissiveIntensity animating correctly on materials handed to ENGINE.MeshNode.create. The
 * warehouse already leans on that in ten places - the beacon pulses, the god-ray breathing,
 * the door status lamps and the whole emergency lighting ramp - and all of them are live.
 *
 * So the flipbook came out and the ring fades properly. Worth recording how close that came
 * to being "fixed": the first pass at measuring it counted green pixels and concluded the
 * writes were dead, when at high emissive the quad simply blows out to white and stops being
 * green. The count was wrong in both directions at once. The per-pixel diff is the honest
 * instrument here, and it is what the next person should reach for.
 */

/** Peak opacity of a ring at the instant it fires, before the fade takes it down. */
const PEAK_OPACITY = 0.5;

/** Scratch quaternions for rebasing the billboard facing into the rig's space. */
const FACE_WORLD = new THREE.Quaternion();
const FACE_LOCAL = new THREE.Quaternion();

/** One expanding, fading ring. */
class PulseRing {
  public readonly root = ENGINE.SceneNode.create({ name: 'ScanPulseRing' });
  private face: ENGINE.MeshNode | null = null;
  private material: THREE.MeshBasicMaterial | null = null;
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
    if (this.face) return;
    this.material = new THREE.MeshBasicMaterial({
      color: this.colour,
      transparent: true,
      opacity: PEAK_OPACITY,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.face = ENGINE.MeshNode.create({
      name: 'ScanPulseFace',
      geometry: new THREE.RingGeometry(this.innerRadius, this.innerRadius + this.thickness, 40),
      material: this.material,
    });
    this.root.add(this.face);
    this.root.visible = false;
  }

  public fire(at: THREE.Vector3, duration: number, spread: number): void {
    if (!this.face) return;
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
    /*
     * Eased, not linear. A ring expanding at a constant rate is the one motion a physical
     * pulse never makes - a shock leaves fast and slows as it spreads - and linear travel is
     * most of why §9 marks this verb thin. Cubing the remaining distance puts roughly half
     * the growth in the first fifth of the life, so the ring leaves the gripper hard and
     * drifts out rather than sliding out at a constant crawl.
     *
     * The reduced-motion branch is untouched: it does not travel at all, so it has no rate
     * to ease.
     */
    const eased = 1 - (1 - progress) ** 3;
    const scale = still ? this.spread * 0.6 : 0.25 + eased * this.spread;
    this.root.scale.setScalar(Math.max(0.001, scale));
    /*
     * Squared falloff rather than linear: a ring that fades on a straight line reads as a
     * dimmer switch, while one that drops away fast and then lingers reads as a pulse. The
     * expansion is linear, so all the character has to come from the alpha.
     */
    if (this.material) this.material.opacity = PEAK_OPACITY * (1 - progress) * (1 - progress);
    if (this.life <= 0) this.root.visible = false;
  }

  public dispose(): void {
    this.face?.geometry?.dispose();
    this.material?.dispose();
  }
}

/**
 * The scan itself, as a bar of light that travels the subject.
 *
 * A ring says "here"; it does not say "being read". A line sweeping the height of a thing is
 * the universal shorthand for a machine taking a measurement of it, and it is the one moment in
 * this mission where the drone is doing its actual job. It runs DOWN first, because that is the
 * direction a person reads a label and the direction a scanner in a warehouse is pointed.
 *
 * A single bar rather than a lattice of beams: at the resolution the retro pass leaves, several
 * thin lines crossing become noise, and one thick line stays a line.
 */
class ScanSweep {
  public readonly root = ENGINE.SceneNode.create({ name: 'ScanSweep' });
  private bar: ENGINE.MeshNode | null = null;
  private material: THREE.MeshBasicMaterial | null = null;
  private life = 0;
  private duration = 0.52;
  private height = 1.6;

  public build(): void {
    if (this.bar) return;
    this.material = new THREE.MeshBasicMaterial({
      color: '#9dffe4',
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.bar = ENGINE.MeshNode.create({
      name: 'ScanSweepBar',
      geometry: new THREE.PlaneGeometry(1.5, 0.055),
      material: this.material,
    });
    this.root.add(this.bar);
    this.root.visible = false;
  }

  public fire(duration: number, height: number): void {
    if (!this.bar) return;
    this.duration = duration;
    this.height = height;
    this.life = duration;
    this.root.visible = true;
  }

  public tick(deltaTime: number, face: THREE.Quaternion, still: boolean): void {
    if (this.life <= 0 || !this.bar || !this.material) return;
    this.life = Math.max(0, this.life - deltaTime);
    const t = this.duration > 0 ? 1 - this.life / this.duration : 1;
    this.root.quaternion.copy(face);
    /*
     * Down over the first two thirds, back up over the last third. The return is faster than
     * the pass because a scanner confirming is quicker than a scanner reading, and because a
     * symmetric bounce reads as an animation rather than as an instrument.
     */
    const travel = t < 0.66 ? 1 - t / 0.66 : (t - 0.66) / 0.34;
    this.bar.position.y = still ? this.height * 0.5 : this.height * travel;
    this.material.opacity = 0.85 * (1 - t * t);
    if (this.life <= 0) this.root.visible = false;
  }

  public dispose(): void {
    this.bar?.geometry?.dispose();
    this.material?.dispose();
  }
}

/**
 * A corner bracket around something the machine has already identified.
 *
 * Deliberately NOT a locator. It marks the delivery stations, the service doors, the cradle and
 * the active subject once it has been found - things the player has been told about and now has
 * to go back to. Outlining the target before it is located would delete the search this whole
 * mission is built on, which is a worse game for a cheaper convenience.
 *
 * Four corners rather than a full box: a closed rectangle around an object reads as a UI window
 * sitting in the world, while corners read as a reticle placed ON it. Chunky quads rather than
 * lines, because the retro pass eats anything a pixel wide.
 */
class TargetMark {
  public readonly root = ENGINE.SceneNode.create({ name: 'TargetMark' });
  private built = false;

  public build(): void {
    if (this.built) return;
    this.built = true;
    const material = new THREE.MeshBasicMaterial({
      color: '#7fe0d0',
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const arm = 0.3;
    const thick = 0.055;
    const half = 0.62;
    const pieces: THREE.BufferGeometry[] = [];
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const h = new THREE.PlaneGeometry(arm, thick);
        h.translate(sx * (half - arm / 2), sy * half, 0);
        pieces.push(h);
        const v = new THREE.PlaneGeometry(thick, arm);
        v.translate(sx * half, sy * (half - arm / 2), 0);
        pieces.push(v);
      }
    }
    const merged = mergeGeometries(pieces, false);
    if (!merged) return;
    this.root.add(ENGINE.MeshNode.create({ name: 'TargetMarkBracket', geometry: merged, material }));
    this.root.visible = false;
  }

  public place(at: THREE.Vector3, face: THREE.Quaternion, scale: number): void {
    this.root.visible = true;
    this.root.position.copy(at);
    this.root.quaternion.copy(face);
    this.root.scale.setScalar(scale);
  }

  public hide(): void {
    this.root.visible = false;
  }
}

/** World-space acknowledgement for scan and grip, plus the lens kick that sells both. */
export class WarehouseDroneFeedback {
  public readonly root = ENGINE.SceneNode.create({ name: 'WarehouseDroneFeedback' });

  private readonly subjectPulse = new PulseRing('#8dfff0', 0.44, 0.1);
  private readonly emitterPulse = new PulseRing('#bff4ea', 0.16, 0.05);
  private readonly gripRing = new PulseRing('#ffcf92', 0.2, 0.06);
  /* Two rings rather than one whose colour is rewritten: a verdict is two different events,
     and the material for each can then be built once and never touched. */
  private readonly verdictGood = new PulseRing('#8dffc0', 0.5, 0.1);
  private readonly verdictBad = new PulseRing('#ff8f78', 0.5, 0.13);
  private readonly sweep = new ScanSweep();
  /** A small fixed pool: the stations, the doors, the cradle and the active subject. */
  private readonly marks = Array.from({ length: 8 }, () => new TargetMark());
  private opticalHeld = false;
  private targets: Array<{ at: THREE.Vector3; scale: number }> = [];

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
    for (const ring of [this.subjectPulse, this.emitterPulse, this.gripRing, this.verdictGood, this.verdictBad]) {
      ring.build();
      this.root.add(ring.root);
    }
    this.sweep.build();
    this.root.add(this.sweep.root);
    for (const mark of this.marks) {
      mark.build();
      this.root.add(mark.root);
    }
  }

  /** Expose pooled effects only behind the loading screen, then restore eligibility. */
  public prepareVisibility(): () => void {
    const nodes: Array<[THREE.Object3D, boolean]> = [];
    this.root.traverse(node => { nodes.push([node, node.visible]); node.visible = true; });
    return () => { for (const [node, visible] of nodes) node.visible = visible; };
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
    // The bar travels the subject, anchored at its feet. See ScanSweep.
    this.sweep.root.position.copy(this.toLocal(to)).setY(this.toLocal(to).y - 0.2);
    this.sweep.fire(still ? 0.8 : 0.52, 1.7);
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

  /**
   * The judgement, at the thing being judged.
   *
   * A wrong call kicks nearly three times as hard as a right one and rings wider. That
   * asymmetry is the point: a confirmation and a mistake must be distinguishable before the
   * player has read a word of the text that explains which it was, and the body knows the
   * difference between a nod and a knock long before the eye finishes reading.
   */
  public verdictPulse(at: THREE.Vector3, correct: boolean): void {
    const still = getAccessibilityPreferences().reducedMotion;
    const ring = correct ? this.verdictGood : this.verdictBad;
    ring.fire(this.toLocal(at), still ? 0.8 : correct ? 0.5 : 0.66, correct ? 2.4 : 3.6);
    if (still) return;
    this.kick = Math.max(this.kick, correct ? 0.035 : 0.095);
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
    this.verdictGood.tick(deltaTime, FACE_LOCAL, still);
    this.verdictBad.tick(deltaTime, FACE_LOCAL, still);
    this.sweep.tick(deltaTime, FACE_LOCAL, still);

    /*
     * Brackets follow the optical trigger, not a toggle. They exist only while the player is
     * actually looking through the machine's own lens, which is what makes them read as the
     * drone's annotation rather than as a permanent HUD layer bolted over the world.
     */
    for (const [index, mark] of this.marks.entries()) {
      const target = this.opticalHeld ? this.targets[index] : undefined;
      if (!target) { mark.hide(); continue; }
      mark.place(this.toLocal(target.at), FACE_LOCAL, target.scale);
    }

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
  /**
   * What the optical view is allowed to mark, in WORLD positions.
   *
   * The caller decides what qualifies; this only draws. That split matters because the rule -
   * only things already established, never the unfound target - is a design decision about the
   * mission rather than a rendering one, and it belongs where the mission state lives.
   */
  public setTargets(targets: Array<{ at: THREE.Vector3; scale: number }>): void {
    this.targets = targets.slice(0, this.marks.length);
  }

  public setOpticalHeld(held: boolean): void {
    this.opticalHeld = held;
  }

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
    this.verdictGood.dispose();
    this.verdictBad.dispose();
    this.sweep.dispose();
    if (this.gripper) {
      this.gripper.position.y = this.gripperRest;
      this.gripper.scale.setScalar(1);
    }
  }
}
