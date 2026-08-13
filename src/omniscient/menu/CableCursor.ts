/**
 * The connector cable - OMNISCIENT_'s cursor.
 *
 * §103: "Mouse movement may control a physical connector/cable. Hovering a module wakes
 * its socket... Clicking physically plugs the connector into the selected module with
 * cable slack/inertia, a CLACK, electrical pulse."
 *
 * This is the signature interaction of the menu, and the reason the menu is a machine
 * rather than a list of buttons. The player is not moving a pointer; they are handling
 * the AI's own connector.
 *
 * §113 warns the cable must stay responsive and not become annoying after repeated use,
 * so the plug is quick and the slack is damped rather than bouncy.
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { decorMesh } from '../art/mesh.js';
import { MAT } from '../art/palette.js';
import { Ease, Tweener } from '../core/tween.js';

/** Points along the cable, root to tip. */
const SEGMENTS = 14;
const CABLE_RADIUS = 0.012;

export class CableCursor {
  public readonly root: ENGINE.SceneNode;

  private readonly points: THREE.Vector3[] = [];
  private readonly velocities: THREE.Vector3[] = [];
  private readonly curve: THREE.CatmullRomCurve3;
  private readonly mesh: ENGINE.MeshNode;
  private readonly plug: ENGINE.MeshNode;
  private readonly tweener = new Tweener();

  /** Where the cable is anchored - it comes out of the machine, not out of nowhere. */
  private readonly anchor = new THREE.Vector3();
  /** Where the tip is being pulled toward. */
  private readonly targetTip = new THREE.Vector3();
  /** Set while seated in a socket, so the tip stops following the mouse. */
  private seated: THREE.Vector3 | null = null;

  constructor(anchor: THREE.Vector3) {
    this.anchor.copy(anchor);
    this.targetTip.copy(anchor).add(new THREE.Vector3(0.3, -0.1, 0.2));

    // Spread the initial points along the rest direction. Starting them all coincident
    // produces a degenerate TubeGeometry, which the physics layer then fails to build a
    // collider from and takes the whole game loop down with it.
    for (let i = 0; i < SEGMENTS; i++) {
      const t = i / (SEGMENTS - 1);
      this.points.push(this.anchor.clone().lerp(this.targetTip, t));
      this.velocities.push(new THREE.Vector3());
    }

    this.curve = new THREE.CatmullRomCurve3(this.points);
    this.curve.curveType = 'catmullrom';
    this.curve.tension = 0.5;

    this.root = ENGINE.SceneNode.create({ name: 'CableCursor' });

    this.mesh = decorMesh(
      'Cable',
      new THREE.TubeGeometry(this.curve, SEGMENTS * 2, CABLE_RADIUS, 5, false),
      MAT.dark
    );
    this.root.add(this.mesh);

    // The live end. Knowledge green so the cable reads as carrying the AI itself.
    this.plug = decorMesh(
      'Plug',
      new THREE.CylinderGeometry(0.022, 0.026, 0.055, 8),
      MAT.knowledgeLamp
    );
    this.root.add(this.plug);
  }

  /** Point the tip should reach for while free. */
  public setTarget(point: THREE.Vector3): void {
    if (this.seated) return;
    this.targetTip.copy(point);
  }

  /**
   * Plug into a socket. The tip snaps home and stays until released - §103's "clicking
   * physically plugs the connector into the selected module".
   */
  public plugInto(socket: THREE.Vector3, onSeated?: () => void): void {
    const from = this.points[SEGMENTS - 1].clone();
    this.seated = socket.clone();

    this.tweener.add(
      (t) => {
        this.targetTip.lerpVectors(from, socket, t);
      },
      { duration: 0.22, easing: Ease.outBack, channel: 'plug', onComplete: onSeated }
    );
  }

  /** Release the connector so it follows the pointer again. */
  public unplug(): void {
    this.seated = null;
  }

  public get isSeated(): boolean {
    return this.seated !== null;
  }

  /**
   * Damped follow. Each point chases the one ahead of it, which gives cable slack and
   * inertia without a physics solver - and stays predictable, which §113 asks for.
   */
  public update(deltaTime: number): void {
    this.tweener.update(deltaTime);

    const dt = Math.min(deltaTime, 1 / 30);
    this.points[0].copy(this.anchor);
    this.points[SEGMENTS - 1].lerp(this.targetTip, 1 - Math.pow(0.0001, dt));

    for (let i = 1; i < SEGMENTS - 1; i++) {
      const previous = this.points[i - 1];
      const next = this.points[i + 1];
      const point = this.points[i];
      const velocity = this.velocities[i];

      // Pull toward the midpoint of the neighbours, plus a little sag.
      const targetX = (previous.x + next.x) * 0.5;
      const targetY = (previous.y + next.y) * 0.5 - 0.02;
      const targetZ = (previous.z + next.z) * 0.5;

      velocity.x += (targetX - point.x) * 60 * dt;
      velocity.y += (targetY - point.y) * 60 * dt;
      velocity.z += (targetZ - point.z) * 60 * dt;
      velocity.multiplyScalar(Math.pow(0.02, dt));
      point.addScaledVector(velocity, dt);
    }

    this.rebuild();
  }

  private rebuild(): void {
    this.curve.points = this.points;
    const geometry = new THREE.TubeGeometry(this.curve, SEGMENTS * 2, CABLE_RADIUS, 5, false);
    this.mesh.geometry.dispose();
    this.mesh.geometry = geometry;

    const tip = this.points[SEGMENTS - 1];
    const before = this.points[SEGMENTS - 2];
    this.plug.position.copy(tip);
    this.plug.lookAt(before);
    this.plug.rotateX(Math.PI / 2);
  }

  public dispose(): void {
    this.tweener.clear();
    this.mesh.geometry.dispose();
  }
}
