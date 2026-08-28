import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import {
  applyPaintBanding,
  setPaintHeightGradient,
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

/**
 * How much chroma the cel look adds to every non-emissive material it captures.
 *
 * Kept as a named constant because it is the one number that answers "the colours do not
 * pop": a toon ramp flattens value, so hue is left carrying the picture on its own.
 */
const CEL_CHROMA_GAIN = 1.18;

/**
 * How much darker the base of the building is than the top of it.
 *
 * 0.20, and the first number tried was 0.34 - measured, that took the frame's median from 99
 * to 60 and the mid-band from 49% to 22%. Right direction, twice as far as wanted: most of the
 * pixels in a drone shot are at LOW height, so a tint anchored at the floor line darkens the
 * majority of the picture rather than separating it.
 *
 * The ramp is also wider now, -1.5 to 5.5 rather than -0.6 to 4.5, so the floor sits a fifth
 * of the way up it instead of at the very bottom. Rack courses at 0.55, 1.9, 3.25 and 4.6 land
 * on four distinguishable steps of it, which is the job; the floor comes down 16% rather than
 * 30%, which keeps the ground the lightest large surface.
 */
const CEL_HEIGHT_TINT = 0.2;

/**
 * The roughness floor for a surface that is allowed to keep a sheen, and why there is one.
 *
 * `captureNewMaterials` clamps every MeshStandardMaterial in the building to roughness 0.78,
 * and the cel branch is the branch that ships - so no surface in Warehouse 07 has been able
 * to show a specular highlight of a lamp for as long as the look has existed. That clamp is
 * right for the racking, the cladding and the stock; it is wrong for the floor, and it cost
 * W-1 several rounds. §4.4 asks for "wet concrete" by name, and a sealed slab returning a
 * lamp's reflection is the main way a real high bay announces itself on a floor: the diffuse
 * term under an overhead lamp is almost flat across the whole pool once `paintBand` has
 * quantised N·L, so the sheen is the only lamp-locked, high-contrast mark left available.
 *
 * 0.5 rather than something glossier. At 0.5 a dielectric slab (F0 0.04) returns a soft
 * satin lobe roughly four times the peak of the 0.78 clamp and much more localised - a
 * visible mark under each fitting, nowhere near a mirror. If a critic reports a hot streak
 * on the floor this number is the first thing to move, and it moves in one place.
 */
export const CEL_SHEEN_ROUGHNESS = 0.5;

/** `userData` key checked by the capture pass. Set it through `keepCelSheen`, not by hand. */
const CEL_SHEEN_FLAG = 'warehouseCelSheen';

/**
 * Exempt one material from the cel roughness clamp.
 *
 * Deliberately opt-in and deliberately narrow: the clamp is what keeps the toon ramp from
 * fighting a hundred specular highlights, so this is for surfaces whose whole job is to
 * catch a lamp. Today that is the floor slab and the traffic tracks on it.
 */
export function keepCelSheen<T extends THREE.Material>(material: T): T {
  material.userData[CEL_SHEEN_FLAG] = true;
  return material;
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
      /*
       * The height gradient, scoped to this building.
       *
       * The centre is read off the root rather than written down, because the mission has
       * already been moved once - it used to sit 800 units UP and now sits 1200 along z -
       * and a hardcoded number would have quietly stopped matching without failing.
       */
      const centre = new THREE.Vector3();
      root.getWorldPosition(centre);
      setPaintHeightGradient(CEL_HEIGHT_TINT, centre.z, 140, -1.5, 5.5);
      this.captureNewMaterials(root);
    } else {
      this.restoreMaterials();
      // Cel banding is now the global house treatment; only restore warehouse material edits.
      setPaintBandingLook('warehouseCel');
      setPaintHeightGradient(0);
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

        /*
         * Chroma UP, where it used to go down.
         *
         * This multiplied every non-emissive colour by 0.8, which is a fifth of the chroma
         * off every surface in the building at the exact moment the cel look is switched on.
         * It was a defensible call when the materials underneath were saturated and the
         * banding was fighting them; it is the wrong call now, because the base palette was
         * measured at 52 of 128 colours below 0.20 saturation and the complaint about this
         * look is that the colours do not pop.
         *
         * A toon ramp quantises VALUE and leaves hue alone, so flat bands only read as
         * colour if there is colour in them to begin with - the flatter the shading, the
         * more of the picture each surface's own hue has to carry. Boosting here rather than
         * in the source materials keeps the un-celled image honest, which is what makes the
         * F10 A/B worth looking at.
         */
        const emissiveSignal = material.emissiveIntensity > 0.2 && material.emissive.getHex() !== 0;
        if (!emissiveSignal) {
          const hsl = { h: 0, s: 0, l: 0 };
          material.color.getHSL(hsl);
          material.color.setHSL(hsl.h, Math.min(1, hsl.s * CEL_CHROMA_GAIN), hsl.l);
        }
        const sheen = material.userData[CEL_SHEEN_FLAG] === true;
        material.roughness = Math.max(
          material.roughness,
          sheen ? CEL_SHEEN_ROUGHNESS : material.metalness > 0.45 ? 0.58 : 0.78
        );
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
