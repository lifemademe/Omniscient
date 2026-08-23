import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { createRng, range, seedFrom } from '../core/rng.js';
import { WAREHOUSE_LAYOUT } from './WarehouseLayout.js';

const STRUCTURE = new THREE.MeshStandardMaterial({ color: '#253331', roughness: 0.72, metalness: 0.58 });
const DUCT = new THREE.MeshStandardMaterial({ color: '#51615f', roughness: 0.48, metalness: 0.72 });
const RUBBER = new THREE.MeshStandardMaterial({ color: '#0b0f0e', roughness: 0.92, metalness: 0.08 });
const PALLET = new THREE.MeshStandardMaterial({ color: '#66523a', roughness: 0.96, metalness: 0.01 });
const SAFETY = new THREE.MeshStandardMaterial({ color: '#a77927', emissive: '#382307', emissiveIntensity: 0.32, roughness: 0.72 });
const FIRE = new THREE.MeshStandardMaterial({ color: '#872f28', roughness: 0.62, metalness: 0.28 });

function mesh(
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position = new THREE.Vector3()
): ENGINE.MeshNode {
  const node = ENGINE.MeshNode.create({ name, geometry, material, castShadow: true, receiveShadow: true });
  node.position.copy(position);
  return node;
}

/** Secondary storytelling, structural detail, and atmosphere for the runtime warehouse. */
export class WarehouseSetDressing {
  public readonly root = ENGINE.SceneNode.create({ name: 'WarehouseSetDressing' });

  private readonly fans: ENGINE.SceneNode[] = [];
  private readonly beaconMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly beaconLights: ENGINE.PointLightNode[] = [];
  private readonly fillLights: Array<{ light: ENGINE.PointLightNode; normal: number }> = [];
  private dust: THREE.Points | null = null;
  private clock = 0;
  private emergencyLevel = 0;
  private emergencyContained = false;

  public build(): void {
    this.buildStructure();
    this.buildFloorLanguage();
    this.buildOperationalProps();
    this.buildAtmosphere();
    this.buildLightingAccents();
  }

  public tick(deltaTime: number): void {
    this.clock += deltaTime;
    for (const [index, fan] of this.fans.entries()) {
      fan.rotation.y += deltaTime * (index % 2 ? -1.8 : 1.8);
    }
    const pulse = this.emergencyContained ? 1 : 0.5 + Math.sin(this.clock * 3.2) * 0.5;
    for (const material of this.beaconMaterials) material.emissiveIntensity = 1.1 + pulse * 2.2;
    for (const [index, light] of this.beaconLights.entries()) {
      light.intensity = 3 + pulse * (index === 0 ? 8 : 5) + this.emergencyLevel * (index === 1 ? 8 : 2);
    }
    for (const { light, normal } of this.fillLights) {
      light.intensity = THREE.MathUtils.lerp(normal, normal * 0.22, this.emergencyLevel);
    }
    const positions = this.dust?.geometry.getAttribute('position');
    if (!positions) return;
    for (let index = 0; index < positions.count; index++) {
      const y = positions.getY(index) + deltaTime * (0.018 + (index % 7) * 0.002);
      const x = positions.getX(index) + Math.sin(this.clock * 0.22 + index) * deltaTime * 0.004;
      positions.setXYZ(index, x, y > 7.5 ? 0.2 : y, positions.getZ(index));
    }
    positions.needsUpdate = true;
  }

  public setEmergencyLevel(level: number, contained: boolean): void {
    this.emergencyLevel = Math.max(0, Math.min(1, level));
    this.emergencyContained = contained;
    for (const material of this.beaconMaterials) {
      if (contained) material.emissiveIntensity = 2.8;
    }
  }

  private buildStructure(): void {
    for (const z of [-25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25]) {
      this.root.add(mesh('RoofTruss', new THREE.BoxGeometry(47.4, 0.13, 0.18), STRUCTURE, new THREE.Vector3(0, 9.74, z)));
      for (const [index, x] of [-18, -6, 6, 18].entries()) {
        const brace = mesh('TrussBrace', new THREE.BoxGeometry(11.8, 0.08, 0.1), STRUCTURE, new THREE.Vector3(x, 9.32, z));
        brace.rotation.z = index % 2 ? -0.095 : 0.095;
        this.root.add(brace);
      }
    }
    for (const z of [-25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25]) {
      this.root.add(
        mesh('WallRib', new THREE.BoxGeometry(0.15, 9.7, 0.24), STRUCTURE, new THREE.Vector3(-23.96, 4.85, z)),
        mesh('WallRib', new THREE.BoxGeometry(0.15, 9.7, 0.24), STRUCTURE, new THREE.Vector3(23.96, 4.85, z))
      );
    }
    const duct = mesh('VentilationMain', new THREE.BoxGeometry(1.35, 0.74, 45), DUCT, new THREE.Vector3(14.8, 9.1, -1));
    this.root.add(duct);
    for (const z of [-20, -12, -4, 4, 12, 20]) {
      const grille = mesh('VentGrille', new THREE.BoxGeometry(1.05, 0.04, 0.62), RUBBER, new THREE.Vector3(14.8, 8.71, z));
      this.root.add(grille);
    }
    this.root.add(mesh('CableTray', new THREE.BoxGeometry(0.48, 0.08, 49), STRUCTURE, new THREE.Vector3(-21.3, 8.6, -0.5)));
    for (const z of [-23, -18, -13, -8, -3, 2, 7, 12, 17, 22]) {
      this.root.add(mesh('CableTrayRung', new THREE.BoxGeometry(0.72, 0.08, 0.06), DUCT, new THREE.Vector3(-21.3, 8.65, z)));
    }

    for (const [index, x] of [-14, -4.5, 5, 14.5].entries()) {
      const fan = ENGINE.SceneNode.create({ name: `ExtractionFan-${index + 1}`, position: new THREE.Vector3(x, 9.42, -22.8) });
      const hub = mesh('FanHub', new THREE.CylinderGeometry(0.11, 0.11, 0.18, 12), DUCT);
      for (let bladeIndex = 0; bladeIndex < 4; bladeIndex++) {
        const angle = bladeIndex * Math.PI / 2;
        const blade = mesh(
          'FanBlade',
          new THREE.BoxGeometry(0.12, 0.035, 1.25),
          STRUCTURE,
          new THREE.Vector3(Math.sin(angle) * 0.55, 0, Math.cos(angle) * 0.55)
        );
        blade.rotation.y = angle;
        fan.add(blade);
      }
      fan.add(hub);
      this.root.add(fan);
      this.fans.push(fan);
    }
  }

  private buildFloorLanguage(): void {
    const laneMaterial = new THREE.MeshBasicMaterial({ color: '#765b22', transparent: true, opacity: 0.62, toneMapped: false });
    for (const x of WAREHOUSE_LAYOUT.rack.centers) {
      for (const edge of [-1.52, 1.52]) {
        const line = mesh('AisleGuide', new THREE.PlaneGeometry(0.055, 26.4), laneMaterial, new THREE.Vector3(x + edge, 0.011, WAREHOUSE_LAYOUT.rack.centerZ));
        line.rotation.x = -Math.PI / 2;
        this.root.add(line);
      }
    }
    for (const z of [17.2, 18.2, 19.2]) {
      for (const x of [-22, -20.5, -19, 18.5, 20, 21.5]) {
        const chevron = mesh('SafetyChevron', new THREE.PlaneGeometry(0.8, 0.15), laneMaterial, new THREE.Vector3(x, 0.013, z));
        chevron.rotation.set(-Math.PI / 2, 0, x < 0 ? 0.55 : -0.55);
        this.root.add(chevron);
      }
    }

    const rng = createRng(seedFrom('warehouse-floor-patina'));
    for (let index = 0; index < 18; index++) {
      const stain = mesh(
        'FloorPatina',
        new THREE.CircleGeometry(range(rng, 0.18, 0.72), 18),
        new THREE.MeshBasicMaterial({
          color: index % 4 === 0 ? '#202e2b' : '#171c1a',
          transparent: true,
          opacity: range(rng, 0.08, 0.24),
          depthWrite: false,
        }),
        new THREE.Vector3(range(rng, -22.5, 22.5), 0.009, range(rng, -27, 27))
      );
      stain.rotation.x = -Math.PI / 2;
      stain.scale.y = range(rng, 0.35, 1.2);
      this.root.add(stain);
    }
  }

  private buildOperationalProps(): void {
    for (const [index, [x, z]] of [
      [-20.8, -20.8],
      [-14.5, -21.4],
      [10.8, -20.6],
      [20.7, 18.4],
    ].entries()) {
      const pallet = ENGINE.SceneNode.create({ name: `PalletStack-${index + 1}`, position: new THREE.Vector3(x, 0, z) });
      for (const offset of [-0.55, 0, 0.55]) {
        pallet.add(mesh('PalletSlat', new THREE.BoxGeometry(1.55, 0.08, 0.28), PALLET, new THREE.Vector3(0, 0.18, offset)));
      }
      for (const offset of [-0.55, 0.55]) {
        pallet.add(mesh('PalletRunner', new THREE.BoxGeometry(0.18, 0.16, 1.55), PALLET, new THREE.Vector3(offset, 0.08, 0)));
      }
      if (index < 3) {
        pallet.add(
          mesh('PalletCarton', new THREE.BoxGeometry(1.35, 0.72, 1.25), new THREE.MeshStandardMaterial({ color: '#5d4d36', roughness: 0.96 }), new THREE.Vector3(0, 0.59, 0)),
          mesh('ShrinkWrap', new THREE.BoxGeometry(1.39, 0.76, 1.29), new THREE.MeshPhysicalMaterial({ color: '#b8d2c8', transparent: true, opacity: 0.08, roughness: 0.2, metalness: 0 }), new THREE.Vector3(0, 0.59, 0))
        );
      }
      pallet.rotation.y = index % 2 ? 0.16 : -0.12;
      this.root.add(pallet);
    }

    for (const [index, [x, z]] of [[-22.5, -7.2], [-22.5, -6.1], [22.4, 16.2]].entries()) {
      const drum = mesh(
        `MaintenanceDrum-${index + 1}`,
        new THREE.CylinderGeometry(0.34, 0.34, 0.92, 18),
        index === 2 ? SAFETY : DUCT,
        new THREE.Vector3(x, 0.46, z)
      );
      this.root.add(drum);
    }

    const cabinet = ENGINE.SceneNode.create({ name: 'ElectricalCabinet', position: new THREE.Vector3(-23.72, 2.2, 4.4) });
    cabinet.add(
      mesh('CabinetBody', new THREE.BoxGeometry(0.28, 1.9, 1.25), DUCT),
      mesh('CabinetHazard', new THREE.PlaneGeometry(0.48, 0.48), SAFETY, new THREE.Vector3(0.145, 0.1, 0))
    );
    cabinet.rotation.y = Math.PI / 2;
    this.root.add(cabinet);

    const extinguisher = ENGINE.SceneNode.create({ name: 'FirePoint', position: new THREE.Vector3(23.5, 0, 18.6) });
    extinguisher.add(
      mesh('ExtinguisherTank', new THREE.CylinderGeometry(0.16, 0.18, 0.72, 14), FIRE, new THREE.Vector3(0, 0.62, 0)),
      mesh('ExtinguisherHandle', new THREE.BoxGeometry(0.2, 0.08, 0.08), RUBBER, new THREE.Vector3(0, 1.02, 0))
    );
    this.root.add(extinguisher);
  }

  private buildAtmosphere(): void {
    const rng = createRng(seedFrom('warehouse-interior-dust'));
    const positions = new Float32Array(420 * 3);
    for (let index = 0; index < 420; index++) {
      positions[index * 3] = range(rng, -22.8, 22.8);
      positions[index * 3 + 1] = range(rng, 0.2, 9.2);
      positions[index * 3 + 2] = range(rng, -27.2, 27.2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.dust = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({ color: '#b9d8c8', size: 0.022, transparent: true, opacity: 0.18, depthWrite: false })
    );
    this.dust.name = 'InteriorDust';
    this.root.add(this.dust);
  }

  private buildLightingAccents(): void {
    for (const [index, [x, z, color]] of ([
      [-17.5, 19.5, '#86b7b0'],
      [-5.5, 19.5, '#d0b06a'],
      [6.5, 19.5, '#86b7b0'],
      [18.5, 19.5, '#86b7b0'],
      [-17.5, 1, '#86aeb7'],
      [-5.5, 1, '#86aeb7'],
      [6.5, 1, '#86aeb7'],
      [18.5, 1, '#86aeb7'],
      [-17.5, -19.5, '#86aeb7'],
      [-5.5, -19.5, '#86aeb7'],
      [6.5, -19.5, '#86aeb7'],
      [18.5, -19.5, '#86aeb7'],
    ] as const).entries()) {
      const normal = index < 4 ? 12 : 8;
      const light = ENGINE.PointLightNode.create({
        name: `WarehouseFill-${index + 1}`,
        color,
        intensity: normal,
        distance: 12,
        decay: 1.65,
        position: new THREE.Vector3(x, 4.2, z),
      });
      this.fillLights.push({ light, normal });
      this.root.add(light);
    }

    for (const [index, [x, z, color]] of ([
      [0, 24.4, '#e0a24c'],
      [0, -26.4, '#d65a42'],
    ] as const).entries()) {
      const material = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 1.5,
        roughness: 0.24,
      });
      const beacon = mesh('WarningBeacon', new THREE.CylinderGeometry(0.11, 0.14, 0.22, 12), material, new THREE.Vector3(x, 3.3, z));
      const light = ENGINE.PointLightNode.create({
        name: `WarningBeaconLight-${index + 1}`,
        color,
        intensity: 5,
        distance: 6,
        decay: 1.8,
        position: new THREE.Vector3(x, 3.3, z),
      });
      this.beaconMaterials.push(material);
      this.beaconLights.push(light);
      this.root.add(beacon, light);
    }
  }
}
