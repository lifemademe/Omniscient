import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { WAREHOUSE_LAYOUT } from './WarehouseLayout.js';

const LOWER_WALL = new THREE.MeshStandardMaterial({ color: '#3b4744', roughness: 0.9, metalness: 0.08 });
const UPPER_WALL = new THREE.MeshStandardMaterial({ color: '#263331', roughness: 0.82, metalness: 0.16 });
const FRAME = new THREE.MeshStandardMaterial({ color: '#172321', roughness: 0.58, metalness: 0.72 });
const WALL_RIB = new THREE.MeshStandardMaterial({ color: '#53635f', roughness: 0.62, metalness: 0.5 });
const CEILING = new THREE.MeshStandardMaterial({
  color: '#35423f',
  emissive: '#101816',
  emissiveIntensity: 0.2,
  roughness: 0.84,
  metalness: 0.16,
});

interface WallSegment {
  name: string;
  axis: 'x' | 'z';
  centerX: number;
  centerZ: number;
  length: number;
}

function mesh(
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position = new THREE.Vector3(),
  castShadow = true,
  receiveShadow = true
): ENGINE.MeshNode {
  const node = ENGINE.MeshNode.create({ name, geometry, material, castShadow, receiveShadow });
  node.position.copy(position);
  return node;
}

function orientedBox(axis: 'x' | 'z', length: number, height: number, depth: number): THREE.BoxGeometry {
  return axis === 'x'
    ? new THREE.BoxGeometry(length, height, depth)
    : new THREE.BoxGeometry(depth, height, length);
}

/**
 * Runtime warehouse shell and natural-light layer. The window band is a real opening,
 * not translucent geometry placed over a shadow-casting wall.
 */
export class WarehouseDaylight {
  public readonly root = ENGINE.SceneNode.create({ name: 'WarehouseDaylightArchitecture' });

  private readonly bounceLights: ENGINE.PointLightNode[] = [];
  private readonly shaftMaterials: THREE.MeshBasicMaterial[] = [];
  private readonly windowMaterials: THREE.MeshStandardMaterial[] = [];
  private sunLight: ENGINE.DirectionalLightNode | null = null;
  private clock = 0;

  public build(): void {
    this.buildExteriorContext();
    this.buildClerestoryShell();
    this.buildSunlight();
  }

  public tick(deltaTime: number, emergencyLevel: number, contained: boolean, reducedMotion: boolean): void {
    this.clock += deltaTime;
    const emergency = THREE.MathUtils.clamp(emergencyLevel, 0, 1);
    if (this.sunLight) this.sunLight.intensity = THREE.MathUtils.lerp(2.55, 1.05, emergency);
    for (const light of this.bounceLights) light.intensity = THREE.MathUtils.lerp(7.6, 2.1, emergency);
    const breathing = reducedMotion || contained ? 1 : 0.94 + Math.sin(this.clock * 0.24) * 0.06;
    for (const material of this.shaftMaterials) {
      material.opacity = THREE.MathUtils.lerp(0.036 * breathing, 0.009, emergency);
    }
    for (const material of this.windowMaterials) {
      material.emissiveIntensity = THREE.MathUtils.lerp(0.52, 0.16, emergency);
    }
  }

  private buildExteriorContext(): void {
    const sky = mesh(
      'RainbreakSkyVolume',
      new THREE.BoxGeometry(104, 48, 116),
      new THREE.MeshBasicMaterial({ color: '#607981', side: THREE.BackSide, toneMapped: false }),
      new THREE.Vector3(0, 13, 0),
      false,
      false
    );
    const ground = mesh(
      'ExteriorWetGround',
      new THREE.PlaneGeometry(104, 116),
      new THREE.MeshStandardMaterial({ color: '#1c2929', roughness: 0.38, metalness: 0.12 }),
      new THREE.Vector3(0, -0.285, 0),
      false,
      true
    );
    ground.rotation.x = -Math.PI / 2;
    this.root.add(sky, ground);
  }

  private buildClerestoryShell(): void {
    const { shell } = WAREHOUSE_LAYOUT;
    const segments: WallSegment[] = [
      { name: 'WestRear', axis: 'z', centerX: -shell.wallX, centerZ: -5.35, length: 47.7 },
      { name: 'WestFront', axis: 'z', centerX: -shell.wallX, centerZ: 25.35, length: 7.7 },
      { name: 'EastRear', axis: 'z', centerX: shell.wallX, centerZ: -5.35, length: 47.7 },
      { name: 'EastFront', axis: 'z', centerX: shell.wallX, centerZ: 25.35, length: 7.7 },
      { name: 'FrontWest', axis: 'x', centerX: -13.45, centerZ: shell.frontZ, length: 21.1 },
      { name: 'FrontEast', axis: 'x', centerX: 13.45, centerZ: shell.frontZ, length: 21.1 },
      { name: 'RearWest', axis: 'x', centerX: -14.9, centerZ: shell.rearZ, length: 18.2 },
      { name: 'RearEast', axis: 'x', centerX: 14.9, centerZ: shell.rearZ, length: 18.2 },
    ];
    for (const segment of segments) this.root.add(this.createClerestorySegment(segment));

    this.root.add(
      mesh(
        'InteriorCeilingLiner',
        new THREE.BoxGeometry(shell.width - 0.55, 0.07, shell.length - 0.55),
        CEILING,
        new THREE.Vector3(0, shell.roofY - 0.23, 0),
        false,
        true
      ),
      mesh(
        'WestServiceLintel',
        new THREE.BoxGeometry(0.35, 6.8, 3),
        UPPER_WALL,
        new THREE.Vector3(-shell.wallX, 7.1, WAREHOUSE_LAYOUT.service.sideZ)
      ),
      mesh(
        'EastServiceLintel',
        new THREE.BoxGeometry(0.35, 6.8, 3),
        UPPER_WALL,
        new THREE.Vector3(shell.wallX, 7.1, WAREHOUSE_LAYOUT.service.sideZ)
      ),
      mesh('FrontGateLintel', new THREE.BoxGeometry(5.8, 5.5, 0.35), UPPER_WALL, new THREE.Vector3(0, 7.75, shell.frontZ)),
      mesh('RearFreightLintel', new THREE.BoxGeometry(11.6, 4.5, 0.35), UPPER_WALL, new THREE.Vector3(0, 8.25, shell.rearZ))
    );
  }

  private createClerestorySegment(segment: WallSegment): ENGINE.SceneNode {
    const root = ENGINE.SceneNode.create({ name: `${segment.name}Clerestory` });
    const depth = 0.35;
    const lowerHeight = 7.05;
    const windowBottom = 7.05;
    const windowTop = 9.55;
    const windowHeight = windowTop - windowBottom;
    const upperHeight = WAREHOUSE_LAYOUT.shell.height - windowTop;
    const bayCount = Math.max(1, Math.ceil(segment.length / 5.4));
    const bayLength = segment.length / bayCount;
    const center = new THREE.Vector3(segment.centerX, 0, segment.centerZ);

    root.add(
      mesh(
        `${segment.name}LowerWall`,
        orientedBox(segment.axis, segment.length, lowerHeight, depth),
        LOWER_WALL,
        center.clone().setY(lowerHeight / 2)
      ),
      mesh(
        `${segment.name}UpperWall`,
        orientedBox(segment.axis, segment.length, upperHeight, depth),
        UPPER_WALL,
        center.clone().setY(windowTop + upperHeight / 2)
      ),
      mesh(
        `${segment.name}WindowSill`,
        orientedBox(segment.axis, segment.length, 0.16, 0.48),
        FRAME,
        center.clone().setY(windowBottom + 0.02)
      ),
      mesh(
        `${segment.name}WindowHeader`,
        orientedBox(segment.axis, segment.length, 0.18, 0.48),
        FRAME,
        center.clone().setY(windowTop - 0.03)
      ),
      mesh(
        `${segment.name}WallKick`,
        orientedBox(segment.axis, segment.length, 0.22, 0.41),
        WALL_RIB,
        center.clone().setY(1.12)
      )
    );

    for (let bay = 0; bay < bayCount; bay++) {
      const offset = -segment.length / 2 + bayLength * (bay + 0.5);
      const paneCenter = center.clone().setY(windowBottom + windowHeight / 2);
      if (segment.axis === 'x') paneCenter.x += offset;
      else paneCenter.z += offset;
      const glass = new THREE.MeshStandardMaterial({
        color: bay % 3 === 0 ? '#a6c4c8' : '#789ba2',
        emissive: '#88aeb4',
        emissiveIntensity: 0.52,
        transparent: true,
        opacity: 0.32,
        roughness: 0.2,
        metalness: 0.06,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      this.windowMaterials.push(glass);
      root.add(
        mesh(
          `${segment.name}WindowPane-${bay + 1}`,
          orientedBox(segment.axis, Math.max(0.2, bayLength - 0.2), windowHeight - 0.22, 0.045),
          glass,
          paneCenter,
          false,
          false
        )
      );
      if (bay < bayCount - 1) {
        const pierCenter = center.clone().setY(windowBottom + windowHeight / 2);
        const pierOffset = -segment.length / 2 + bayLength * (bay + 1);
        if (segment.axis === 'x') pierCenter.x += pierOffset;
        else pierCenter.z += pierOffset;
        root.add(
          mesh(
            `${segment.name}WindowMullion-${bay + 1}`,
            orientedBox(segment.axis, 0.16, windowHeight, 0.48),
            FRAME,
            pierCenter
          )
        );
      }
    }
    return root;
  }

  private buildSunlight(): void {
    this.sunLight = ENGINE.DirectionalLightNode.create({
      name: 'WarehouseSunbreak',
      color: '#ffd39a',
      intensity: 2.55,
      position: new THREE.Vector3(-42, 17, 22),
      castShadow: true,
      isSunLight: true,
      shadowMapSize: 2048,
      shadowNear: 1,
      shadowFar: 105,
      shadowCameraLeft: -34,
      shadowCameraRight: 34,
      shadowCameraTop: 38,
      shadowCameraBottom: -38,
      shadowNormalBias: 0.035,
      shadowBias: -0.00035,
      shadowRadius: 2.4,
    });
    this.root.add(this.sunLight);

    for (const [index, z] of [14, 6, -2, -10, -18].entries()) {
      const bounce = ENGINE.PointLightNode.create({
        name: `ClerestoryBounce-${index + 1}`,
        color: index % 2 ? '#f2c58c' : '#e9ba7d',
        intensity: 7.6,
        distance: 16,
        decay: 1.75,
        position: new THREE.Vector3(-21.1, 6.7, z),
      });
      this.bounceLights.push(bounce);
      this.root.add(bounce);

      const material = new THREE.MeshBasicMaterial({
        color: '#ffc77f',
        transparent: true,
        opacity: 0.036,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      this.shaftMaterials.push(material);
      const endZ = z - 7.5;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute([
          -23.85, 9.35, z - 1.1,
          -23.85, 7.25, z + 1.1,
          5.5, 0.06, endZ + 3.1,
          -23.85, 9.35, z - 1.1,
          5.5, 0.06, endZ + 3.1,
          2.5, 0.06, endZ - 2.2,
        ], 3)
      );
      geometry.computeVertexNormals();
      this.root.add(mesh(`SunShaft-${index + 1}`, geometry, material, undefined, false, false));

      const patch = mesh(
        `SunPatch-${index + 1}`,
        new THREE.PlaneGeometry(6.8, 2.15),
        new THREE.MeshBasicMaterial({
          color: '#d9a75f',
          transparent: true,
          opacity: 0.08,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        }),
        new THREE.Vector3(3.8, 0.018, endZ),
        false,
        false
      );
      patch.rotation.set(-Math.PI / 2, 0, -0.24);
      this.root.add(patch);
    }
  }
}
