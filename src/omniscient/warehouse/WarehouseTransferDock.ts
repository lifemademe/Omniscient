import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { getAccessibilityPreferences } from '../accessibility/preferences.js';
import { createWarehouseLabelGeometry } from './labelGeometry.js';

import type { WarehouseDoorDockState } from './types.js';
import type { WarehouseDoorLayout } from './WarehouseServiceDoors.js';

const STEEL = new THREE.MeshStandardMaterial({ color: '#50575b', roughness: 0.52, metalness: 0.62 });
const DARK = new THREE.MeshStandardMaterial({ color: '#171c1d', roughness: 0.76, metalness: 0.38 });
const ROLLER = new THREE.MeshStandardMaterial({ color: '#7a8285', roughness: 0.38, metalness: 0.76 });

function mesh(name: string, geometry: THREE.BufferGeometry, material: THREE.Material, position?: THREE.Vector3): ENGINE.MeshNode {
  const node = ENGINE.MeshNode.create({ name, geometry, material, castShadow: true, receiveShadow: true });
  if (position) node.position.copy(position);
  return node;
}

function labelMaterial(text: string, color: string): THREE.MeshBasicMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 144;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = '#08110d';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = color;
    context.lineWidth = 10;
    context.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
    context.fillStyle = color;
    context.font = '700 58px monospace';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, canvas.width / 2, canvas.height / 2 + 3);
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map, toneMapped: false, side: THREE.DoubleSide });
}

/** Runtime-built cargo dock shared by release, quarantine, and return decisions. */
export class WarehouseTransferDock {
  public readonly root: ENGINE.SceneNode;
  private readonly rollers: ENGINE.MeshNode[] = [];
  private readonly slotLights: ENGINE.MeshNode[] = [];
  private readonly cover: ENGINE.SceneNode;
  private readonly stateMaterial = new THREE.MeshStandardMaterial({
    color: '#53715e', emissive: '#173c25', emissiveIntensity: 1.1, roughness: 0.45,
  });
  private state: WarehouseDoorDockState = 'empty';
  private capacity = 1;
  private clock = 0;
  private coverLevel = 0;

  public constructor(public readonly layout: WarehouseDoorLayout) {
    this.root = ENGINE.SceneNode.create({
      name: `SecureTransfer-${layout.letter}`,
      position: layout.handoffPosition.clone(),
      rotation: new THREE.Euler(0, layout.rootRotation, 0),
    });
    this.root.add(
      mesh('DockPlinth', new THREE.BoxGeometry(3.75, 0.26, 2.75), DARK, new THREE.Vector3(0, 0.13, 0)),
      mesh('DockBed', new THREE.BoxGeometry(3.48, 0.14, 2.32), STEEL, new THREE.Vector3(0, 0.31, 0)),
      mesh('StateBar', new THREE.BoxGeometry(3.2, 0.09, 0.09), this.stateMaterial, new THREE.Vector3(0, 0.47, -1.13))
    );
    for (let index = 0; index < 9; index++) {
      const roller = mesh('TransferRoller', new THREE.CylinderGeometry(0.085, 0.085, 3.1, 10), ROLLER, new THREE.Vector3(0, 0.48, -0.86 + index * 0.215));
      roller.rotation.z = Math.PI / 2;
      this.rollers.push(roller);
      this.root.add(roller);
    }
    for (const x of [-0.72, 0.72]) {
      const light = mesh('ClampSlot', new THREE.TorusGeometry(0.45, 0.045, 8, 24), this.stateMaterial, new THREE.Vector3(x, 0.52, 0.06));
      light.rotation.x = Math.PI / 2;
      this.slotLights.push(light);
      this.root.add(light);
    }
    const sign = mesh(
      'TransferLabel',
      createWarehouseLabelGeometry(3.2, 0.5),
      labelMaterial(`${layout.letter} SECURE TRANSFER`, '#d8ffb0'),
      new THREE.Vector3(0, 0.02, 1.42)
    );
    sign.rotation.x = -Math.PI / 2;
    this.root.add(sign);

    this.cover = ENGINE.SceneNode.create({ name: 'ContainmentCover' });
    const coverMaterial = new THREE.MeshStandardMaterial({ color: '#6e2d2d', emissive: '#350808', emissiveIntensity: 0.8, roughness: 0.55, metalness: 0.32 });
    this.cover.add(
      mesh('CoverTop', new THREE.BoxGeometry(3.45, 0.11, 2.2), coverMaterial, new THREE.Vector3(0, 1.62, 0)),
      mesh('CoverWest', new THREE.BoxGeometry(0.1, 1.25, 2.2), coverMaterial, new THREE.Vector3(-1.68, 1.02, 0)),
      mesh('CoverEast', new THREE.BoxGeometry(0.1, 1.25, 2.2), coverMaterial, new THREE.Vector3(1.68, 1.02, 0)),
      mesh('CoverRear', new THREE.BoxGeometry(3.45, 1.25, 0.1), coverMaterial, new THREE.Vector3(0, 1.02, -1.05))
    );
    this.cover.visible = false;
    this.cover.scale.y = 0.02;
    this.root.add(this.cover);
    this.setCapacity(1);
  }

  public getState(): WarehouseDoorDockState { return this.state; }

  public setCapacity(capacity: number): void {
    this.capacity = THREE.MathUtils.clamp(Math.round(capacity), 1, 2);
    this.slotLights[0].position.x = this.capacity === 1 ? 0 : -0.72;
    this.slotLights[1].visible = this.capacity === 2;
  }

  public getCapacity(): number { return this.capacity; }

  public slotPosition(slot: number): THREE.Vector3 {
    const x = this.capacity === 1 ? 0 : slot === 0 ? -0.72 : 0.72;
    return new THREE.Vector3(x, 0.49, 0)
      .applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.layout.rootRotation)
      .add(this.layout.handoffPosition);
  }

  public setState(state: WarehouseDoorDockState): void {
    this.state = state;
    const [color, emissive] = state === 'staged'
      ? ['#9b7a35', '#553006']
      : state === 'quarantined' || state === 'locked'
        ? ['#8f3531', '#5f0b08']
        : state === 'releasing'
          ? ['#438660', '#0c4a25']
          : state === 'returning'
            ? ['#47728c', '#0a3553']
            : ['#53715e', '#173c25'];
    this.stateMaterial.color.set(color);
    this.stateMaterial.emissive.set(emissive);
    this.cover.visible = state === 'quarantined' || state === 'locked';
    if (this.cover.visible && getAccessibilityPreferences().reducedMotion) {
      this.coverLevel = 1;
      this.cover.scale.y = 1;
    }
  }

  public reset(capacity = 1): void {
    this.setCapacity(capacity);
    this.setState('empty');
  }

  public tick(deltaTime: number): void {
    this.clock += deltaTime;
    const coverTarget = this.state === 'quarantined' || this.state === 'locked' ? 1 : 0;
    this.coverLevel = THREE.MathUtils.damp(this.coverLevel, coverTarget, 6.2, deltaTime);
    this.cover.scale.y = Math.max(0.02, this.coverLevel);
    if (coverTarget === 0 && this.coverLevel < 0.025) this.cover.visible = false;
    const direction = this.state === 'returning' ? -1 : this.state === 'releasing' ? 1 : 0;
    for (const roller of this.rollers) roller.rotation.x += direction * deltaTime * 5.2;
    this.stateMaterial.emissiveIntensity = this.state === 'staged' ? 1.2 + Math.sin(this.clock * 2.3) * 0.24 : 1.1;
  }
}
