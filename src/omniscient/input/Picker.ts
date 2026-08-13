/**
 * Mouse picking against 3D objects.
 *
 * The engine exposes mouse position and raw MouseEvents through IInputHandler, and
 * registers THREE.Raycaster, but has no object-picking helper - so this is that helper.
 *
 * Needed by everything the player points at: §103's hardware menu modules, and the
 * globe's contact points.
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

export interface PickTarget {
  id: string;
  /** Object tested by the raycaster. Descendants count as hits. */
  object: THREE.Object3D;
}

export type PickHandler = (id: string | null) => void;

export class Picker implements ENGINE.IInputHandler {
  private readonly targets: PickTarget[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();

  private hovered: string | null = null;
  private hoverHandlers = new Set<PickHandler>();
  private clickHandlers = new Set<PickHandler>();
  private manager: ENGINE.InputManager | null = null;
  private enabled = true;

  constructor(
    private readonly getCamera: () => THREE.Camera | null,
    private readonly container: HTMLElement
  ) {}

  public addTarget(id: string, object: THREE.Object3D): void {
    this.targets.push({ id, object });
  }

  public clearTargets(): void {
    this.targets.length = 0;
    this.setHovered(null);
  }

  /** Stop picking without unregistering - used when the menu is not on screen. */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.setHovered(null);
  }

  public onHover(handler: PickHandler): () => void {
    this.hoverHandlers.add(handler);
    return () => this.hoverHandlers.delete(handler);
  }

  public onClick(handler: PickHandler): () => void {
    this.clickHandlers.add(handler);
    return () => this.clickHandlers.delete(handler);
  }

  public get hoveredId(): string | null {
    return this.hovered;
  }

  /** Latest pointer position in normalised device coordinates. */
  public getPointer(): THREE.Vector2 {
    return this.pointer.clone();
  }

  /** Where the pointer ray crosses a plane. Used to fly the cable tip with the mouse. */
  public projectOntoPlane(plane: THREE.Plane, out = new THREE.Vector3()): THREE.Vector3 | null {
    const camera = this.getCamera();
    if (!camera) return null;
    this.raycaster.setFromCamera(this.pointer, camera);
    return this.raycaster.ray.intersectPlane(plane, out);
  }

  /**
   * Normalised device coordinates from a mouse event.
   *
   * Measured against the canvas rect rather than the window: the game canvas does not
   * necessarily fill the page, and being wrong here makes picking drift by exactly the
   * offset, which is maddening to debug from a screenshot.
   */
  private updatePointer(event: MouseEvent): boolean {
    const canvas = this.container.querySelector('canvas');
    const rect = (canvas ?? this.container).getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;

    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    return true;
  }

  private pick(): string | null {
    const camera = this.getCamera();
    if (!camera || this.targets.length === 0) return null;

    this.raycaster.setFromCamera(this.pointer, camera);

    let closest: { id: string; distance: number } | null = null;
    for (const target of this.targets) {
      const hits = this.raycaster.intersectObject(target.object, true);
      if (hits.length === 0) continue;
      if (!closest || hits[0].distance < closest.distance) {
        closest = { id: target.id, distance: hits[0].distance };
      }
    }
    return closest?.id ?? null;
  }

  private setHovered(id: string | null): void {
    if (this.hovered === id) return;
    this.hovered = id;
    this.hoverHandlers.forEach((handler) => handler(id));
  }

  // -- IInputHandler -------------------------------------------------------------------

  public handleMouseMove(event: MouseEvent): boolean {
    if (!this.enabled || !this.updatePointer(event)) return false;
    this.setHovered(this.pick());
    // Never consume the event - other systems still want the move.
    return false;
  }

  public handleMouseClick(_button: ENGINE.MouseButton, event: MouseEvent): boolean {
    if (!this.enabled || !this.updatePointer(event)) return false;

    const id = this.pick();
    this.setHovered(id);
    this.clickHandlers.forEach((handler) => handler(id));
    // Consume only when something was actually hit.
    return id !== null;
  }

  public handleKeyDown(): boolean {
    return false;
  }

  public handleKeyUp(): boolean {
    return false;
  }

  public handleMouseDown(): boolean {
    return false;
  }

  public handleMouseUp(): boolean {
    return false;
  }

  public setInputManager(manager: ENGINE.InputManager | null): void {
    this.manager = manager;
  }

  public getInputManager(): ENGINE.InputManager | null {
    return this.manager;
  }
}
