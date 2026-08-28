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
import { CONNECTOR, createMenuPlug } from '../geometry/menuConnector.js';

/** Points along the cable, root to tip. */
const SEGMENTS = 14;
const CABLE_RADIUS = 0.007;

export class CableCursor {
  public readonly root: ENGINE.SceneNode;

  private readonly points: THREE.Vector3[] = [];
  private readonly drawPoints: THREE.Vector3[] = [];
  private readonly velocities: THREE.Vector3[] = [];
  private readonly curve: THREE.CatmullRomCurve3;
  private readonly mesh: ENGINE.MeshNode;
  private readonly plug: ENGINE.SceneNode;
  private readonly tweener = new Tweener();

  /** Where the cable is anchored - it comes out of the machine, not out of nowhere. */
  private readonly anchor = new THREE.Vector3();
  /** Where the tip is being pulled toward. */
  private readonly targetTip = new THREE.Vector3();
  /**
   * Where the loose end lies when nobody is reaching for a module.
   *
   * Public so the menu can send the connector back to it: the cable is slack hanging off
   * the machine until the player approaches the plates, not a cursor with a wire on it.
   */
  public readonly restingTip = new THREE.Vector3();
  /** Set while seated in a socket, so the tip stops following the mouse. */
  private seated: THREE.Vector3 | null = null;
  /** True from the moment a plug starts until it seats or is cancelled. */
  private plugging = false;

  constructor(anchor: THREE.Vector3) {
    this.anchor.copy(anchor);
    // Short slack behind the CRT's left shoulder, clear of the lamp and notebook.
    this.restingTip.copy(anchor).add(new THREE.Vector3(-0.05, -0.17, -0.16));
    this.targetTip.copy(this.restingTip);

    // Spread the initial points along the rest direction. Starting them all coincident
    // produces a degenerate TubeGeometry, which the physics layer then fails to build a
    // collider from and takes the whole game loop down with it.
    for (let i = 0; i < SEGMENTS; i++) {
      const t = i / (SEGMENTS - 1);
      this.points.push(this.anchor.clone().lerp(this.targetTip, t));
      this.drawPoints.push(this.points[i].clone());
      this.velocities.push(new THREE.Vector3());
    }

    this.curve = new THREE.CatmullRomCurve3(this.drawPoints);
    this.curve.curveType = 'catmullrom';
    this.curve.tension = 0.5;

    this.root = ENGINE.SceneNode.create({ name: 'CableCursor' });

    this.mesh = decorMesh(
      'Cable',
      new THREE.TubeGeometry(this.curve, SEGMENTS * 2, CABLE_RADIUS, 5, false),
      MAT.dark
    );
    this.root.add(this.mesh);

    this.plug = ENGINE.SceneNode.create({ name: 'MenuPlug' });
    for (const part of createMenuPlug()) this.plug.add(decorMesh('PlugPart', part.geometry, MAT[part.material]));
    this.root.add(this.plug);
    this.rebuild();
  }

  /** Point the tip should reach for while free. */
  public setTarget(point: THREE.Vector3): void {
    if (this.seated) return;
    this.targetTip.copy(point);
  }

  /**
   * Plug into a socket, and only then hand back.
   *
   * §237: connection precedes power. That is the game's whole thesis expressed as an
   * interaction, and it is the first thing every player touches, so the callback has to
   * fire when the connector is genuinely home rather than when a timer says so.
   *
   * It did not. The tween drove `targetTip`, which the visible tip then CHASED with a
   * damped lerp - so `onComplete` fired at 0.22s with the plug still several centimetres
   * out and travelling, and the menu opened over the top of its own animation. While
   * seated the tip now tracks the tween exactly and the chase is skipped, so what the
   * callback promises and what the screen shows are the same event.
   *
   * The budget is 0.36s, inside §237's 350-450ms. Longer than that and it is a tax on
   * every menu press; shorter and the connection is not read as a connection.
   */
  public plugInto(socket: THREE.Vector3, onSeated?: () => void): void {
    // §237: a second click mid-plug must not fire the action twice.
    if (this.plugging || this.seated) return;

    const from = this.points[SEGMENTS - 1].clone();
    this.seated = socket.clone();
    this.plugging = true;

    this.tweener.add(
      (t) => {
        this.targetTip.lerpVectors(from, socket, t);
      },
      {
        duration: 0.36,
        // Overshoots and settles back, which is what a connector seating actually does.
        easing: Ease.outBack,
        channel: 'plug',
        onComplete: () => {
          this.plugging = false;
          onSeated?.();
        },
      }
    );
  }

  /**
   * Abandon a plug already in flight, without firing its action.
   *
   * §237 asks that moving away mid-plug retracts cleanly. Cancelling the tween on its own
   * channel is what stops the onComplete ever running, so the action cannot arrive after
   * the player has changed their mind.
   */
  public cancelPlug(): void {
    if (!this.plugging) return;
    this.tweener.cancel('plug');
    this.plugging = false;
    this.seated = null;
  }

  /** Release the connector so it follows the pointer again. */
  public unplug(): void {
    this.tweener.cancel('plug');
    this.plugging = false;
    this.seated = null;
  }

  /** True while the connector is travelling into a socket. */
  public get isPlugging(): boolean {
    return this.plugging;
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
    // Seated or seating, the tip IS the tween. Chasing it here is what made the plug
    // arrive after its own callback (§237).
    if (this.seated) {
      this.points[SEGMENTS - 1].copy(this.targetTip);
    } else {
      this.points[SEGMENTS - 1].lerp(this.targetTip, 1 - Math.pow(0.0001, dt));
    }

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

      /**
       * The desk is solid, and the rope did not know that.
       *
       * This is a sag simulation with nothing to sag ONTO: every interior point pulls
       * toward its neighbours' midpoint minus 2cm, so reaching for a low plate let the
       * slack belly downward straight through the desk top - reported as the wire passing
       * through the table.
       *
       * One clamp fixes it, because in this module the desk top IS y = 0 (see room.ts,
       * where the coordinates are desk-space for exactly this kind of reason). Held a
       * cable's radius clear so the tube rests ON the surface rather than half-buried in
       * it, and the downward velocity is killed at the same time - leaving it would let
       * the point fight the clamp and buzz along the desk.
       *
       * Only interior points. The anchor is fixed and the tip is driven to wherever the
       * player is pointing, which may legitimately be below the desk edge.
       */
      const rest = CABLE_RADIUS * 1.5;
      if (point.y < rest) {
        point.y = rest;
        if (velocity.y < 0) velocity.y = 0;
      }
    }

    this.rebuild();
  }

  private rebuild(): void {
    for (let i = 0; i < SEGMENTS; i++) this.drawPoints[i].copy(this.points[i]);
    // The simulated point is the metal nose; rubber cable joins the strain relief behind it.
    this.drawPoints[SEGMENTS - 1].z += CONNECTOR.tail;
    this.drawPoints[SEGMENTS - 2].lerp(this.drawPoints[SEGMENTS - 1], 0.5);
    const geometry = new THREE.TubeGeometry(this.curve, SEGMENTS * 2, CABLE_RADIUS, 5, false);
    this.mesh.geometry.dispose();
    this.mesh.geometry = geometry;

    const tip = this.points[SEGMENTS - 1];
    this.plug.position.copy(tip);
    // All panel sockets face +Z, so the insertion axis stays -Z rather than following sag.
  }

  public dispose(): void {
    this.tweener.clear();
    this.mesh.geometry.dispose();
    this.plug.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) (object as THREE.Mesh).geometry.dispose();
    });
  }
}
