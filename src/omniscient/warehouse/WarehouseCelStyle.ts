import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import {
  applyPaintBanding,
  isPaintBanded,
  removePaintBanding,
  setPaintBandingLook,
} from '../art/painterly.js';
import { WAREHOUSE_LAYOUT } from './WarehouseLayout.js';

interface MaterialSnapshot {
  material: THREE.MeshStandardMaterial;
  color: THREE.Color;
  roughness: number;
  metalness: number;
  envMapIntensity: number;
  wasBanded: boolean;
}

function beveledRail(width: number, height: number, length: number): THREE.ExtrudeGeometry {
  const radius = Math.min(width, height) * 0.22;
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth + radius, -halfHeight);
  shape.lineTo(halfWidth - radius, -halfHeight);
  shape.quadraticCurveTo(halfWidth, -halfHeight, halfWidth, -halfHeight + radius);
  shape.lineTo(halfWidth, halfHeight - radius);
  shape.quadraticCurveTo(halfWidth, halfHeight, halfWidth - radius, halfHeight);
  shape.lineTo(-halfWidth + radius, halfHeight);
  shape.quadraticCurveTo(-halfWidth, halfHeight, -halfWidth, halfHeight - radius);
  shape.lineTo(-halfWidth, -halfHeight + radius);
  shape.quadraticCurveTo(-halfWidth, -halfHeight, -halfWidth + radius, -halfHeight);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: length,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.035,
    bevelThickness: 0.035,
  });
  geometry.translate(0, 0, -length / 2);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Warehouse-only material and silhouette treatment.
 *
 * It owns an exact snapshot of every material it touches, which makes the editor F10 A/B
 * meaningful rather than an approximation. Newly streamed character materials are picked
 * up by the inexpensive periodic traversal after their GLB finishes loading.
 */
export class WarehouseCelStyle {
  public readonly accents = ENGINE.SceneNode.create({ name: 'WarehouseCelSilhouetteAccents' });

  private readonly snapshots = new Map<THREE.MeshStandardMaterial, MaterialSnapshot>();
  private enabled = false;
  private refreshClock = 0;

  public constructor() {
    const material = new THREE.MeshStandardMaterial({
      color: '#172020',
      roughness: 0.86,
      metalness: 0.18,
    });
    for (const [index, x] of WAREHOUSE_LAYOUT.rack.centers.entries()) {
      const cap = ENGINE.MeshNode.create({
        name: `CelRackCap-${index + 1}`,
        geometry: beveledRail(2.06, 0.18, WAREHOUSE_LAYOUT.rack.length + 0.34),
        material,
        castShadow: true,
        receiveShadow: true,
      });
      cap.position.set(x, 5.58, WAREHOUSE_LAYOUT.rack.centerZ);
      this.accents.add(cap);
    }
    this.accents.visible = false;
  }

  public setEnabled(root: THREE.Object3D, enabled: boolean): void {
    if (this.enabled === enabled) {
      if (enabled) this.captureNewMaterials(root);
      return;
    }
    this.enabled = enabled;
    this.accents.visible = enabled;
    this.refreshClock = 0;
    if (enabled) {
      setPaintBandingLook('warehouseCel');
      this.captureNewMaterials(root);
    } else {
      this.restoreMaterials();
      setPaintBandingLook('house');
    }
  }

  public tick(root: THREE.Object3D, deltaTime: number): void {
    if (!this.enabled) return;
    this.refreshClock -= deltaTime;
    if (this.refreshClock > 0) return;
    this.refreshClock = 0.75;
    this.captureNewMaterials(root);
  }

  private captureNewMaterials(root: THREE.Object3D): void {
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (!(material instanceof THREE.MeshStandardMaterial) || this.snapshots.has(material)) continue;
        if (material.transparent && material.opacity < 0.92) continue;
        if (material instanceof THREE.MeshPhysicalMaterial && material.transmission > 0.01) continue;

        const snapshot: MaterialSnapshot = {
          material,
          color: material.color.clone(),
          roughness: material.roughness,
          metalness: material.metalness,
          envMapIntensity: material.envMapIntensity,
          wasBanded: isPaintBanded(material),
        };
        this.snapshots.set(material, snapshot);

        const emissiveSignal = material.emissiveIntensity > 0.2 && material.emissive.getHex() !== 0;
        if (!emissiveSignal) {
          const hsl = { h: 0, s: 0, l: 0 };
          material.color.getHSL(hsl);
          material.color.setHSL(hsl.h, hsl.s * 0.8, hsl.l);
        }
        material.roughness = Math.max(material.roughness, material.metalness > 0.45 ? 0.58 : 0.78);
        material.metalness *= 0.72;
        material.envMapIntensity = Math.min(material.envMapIntensity, 0.7);
        if (!snapshot.wasBanded) applyPaintBanding(material);
        material.needsUpdate = true;
      }
    });
  }

  private restoreMaterials(): void {
    for (const snapshot of this.snapshots.values()) {
      const { material } = snapshot;
      material.color.copy(snapshot.color);
      material.roughness = snapshot.roughness;
      material.metalness = snapshot.metalness;
      material.envMapIntensity = snapshot.envMapIntensity;
      if (!snapshot.wasBanded) removePaintBanding(material);
      material.needsUpdate = true;
    }
    this.snapshots.clear();
  }
}
