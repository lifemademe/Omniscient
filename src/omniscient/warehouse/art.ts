import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { createRng, jitter, range, seedFrom } from '../core/rng.js';

const WALL = new THREE.MeshStandardMaterial({ color: '#27302f', roughness: 0.9, metalness: 0.08 });
const STEEL = new THREE.MeshStandardMaterial({ color: '#405153', roughness: 0.64, metalness: 0.62 });
const DARK_STEEL = new THREE.MeshStandardMaterial({ color: '#17201f', roughness: 0.78, metalness: 0.45 });
const FLOOR = new THREE.MeshStandardMaterial({ color: '#303432', roughness: 0.93, metalness: 0.03 });
const AMBER = new THREE.MeshStandardMaterial({ color: '#8d6c31', emissive: '#39250b', emissiveIntensity: 0.55, roughness: 0.58 });
const RED = new THREE.MeshStandardMaterial({ color: '#6e2d2d', emissive: '#2c0909', emissiveIntensity: 0.6, roughness: 0.62 });
const GREEN = new THREE.MeshStandardMaterial({ color: '#315c42', emissive: '#102b18', emissiveIntensity: 0.45, roughness: 0.62 });
const BELT = new THREE.MeshStandardMaterial({ color: '#151a19', roughness: 0.82, metalness: 0.25 });

function mesh(name: string, geometry: THREE.BufferGeometry, material: THREE.Material, position?: THREE.Vector3): ENGINE.MeshNode {
  const node = ENGINE.MeshNode.create({ name, geometry, material, castShadow: true, receiveShadow: true });
  if (position) node.position.copy(position);
  return node;
}

function labelMaterial(text: string, accent = '#d8ffb0', background = '#07100d'): THREE.MeshBasicMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 7;
    ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
    ctx.fillStyle = accent;
    ctx.font = 'bold 104px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return new THREE.MeshBasicMaterial({ map: texture });
}

function boxGeometry(size: THREE.Vector3, position: THREE.Vector3): THREE.BoxGeometry {
  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
  geometry.translate(position.x, position.y, position.z);
  return geometry;
}

function rackGeometry(height = 5.6, length = 17): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = [];
  for (const z of [-length / 2, -length / 6, length / 6, length / 2]) {
    pieces.push(boxGeometry(new THREE.Vector3(0.11, height, 0.11), new THREE.Vector3(-0.72, height / 2, z)));
    pieces.push(boxGeometry(new THREE.Vector3(0.11, height, 0.11), new THREE.Vector3(0.72, height / 2, z)));
  }
  for (const y of [0.18, 1.55, 2.9, 4.25, 5.48]) {
    pieces.push(boxGeometry(new THREE.Vector3(1.58, 0.11, length), new THREE.Vector3(0, y, 0)));
  }
  return mergeGeometries(pieces, false) ?? new THREE.BoxGeometry(1, 1, 1);
}

function buildRain(root: ENGINE.SceneNode): void {
  const rng = createRng(seedFrom('warehouse-07-rain'));
  const positions = new Float32Array(420 * 3);
  for (let i = 0; i < 420; i++) {
    positions[i * 3] = range(rng, -12, 12);
    positions[i * 3 + 1] = range(rng, 0, 12);
    positions[i * 3 + 2] = range(rng, 19, 30);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ color: '#91b2bd', size: 0.035, transparent: true, opacity: 0.45 })
  );
  points.name = 'ExteriorRain';
  root.add(points);
}

export class WarehouseEnvironment {
  public readonly root = ENGINE.SceneNode.create({ name: 'WarehouseEnvironment' });
  public readonly stationPositions: Readonly<Record<'release' | 'quarantine' | 'return' | 'hold', THREE.Vector3>> = {
    release: new THREE.Vector3(-10.5, 0, 14.6),
    quarantine: new THREE.Vector3(0, 0, 14.6),
    return: new THREE.Vector3(10.5, 0, 14.6),
    hold: new THREE.Vector3(14, 0, 8.5),
  };
  public rearDoor: ENGINE.MeshNode | null = null;
  public conveyorRollers: ENGINE.SceneNode[] = [];
  private aisleEightSign: ENGINE.MeshNode | null = null;
  private inboundPackages: ENGINE.MeshNode[] = [];
  private quarantineGate: ENGINE.MeshNode | null = null;
  private outboundDoor: ENGINE.MeshNode | null = null;
  private outboundCycling = false;
  private clock = 0;
  private conveyorRunning = false;

  public build(): void {
    const floor = mesh('WarehouseFloor', new THREE.BoxGeometry(32, 0.3, 40), FLOOR, new THREE.Vector3(0, -0.17, 0));
    this.root.add(floor);

    // Shell with front and rear openings kept physically clear.
    this.root.add(
      mesh('LeftWall', new THREE.BoxGeometry(0.35, 8, 40), WALL, new THREE.Vector3(-16.2, 4, 0)),
      mesh('RightWall', new THREE.BoxGeometry(0.35, 8, 40), WALL, new THREE.Vector3(16.2, 4, 0)),
      mesh('FrontWallLeft', new THREE.BoxGeometry(13.2, 8, 0.35), WALL, new THREE.Vector3(-9.4, 4, 18.2)),
      mesh('FrontWallRight', new THREE.BoxGeometry(13.2, 8, 0.35), WALL, new THREE.Vector3(9.4, 4, 18.2)),
      mesh('FrontLintel', new THREE.BoxGeometry(5.8, 3, 0.35), WALL, new THREE.Vector3(0, 6.5, 18.2)),
      mesh('RearWallLeft', new THREE.BoxGeometry(10.5, 8, 0.35), WALL, new THREE.Vector3(-10.9, 4, -18.2)),
      mesh('RearWallRight', new THREE.BoxGeometry(10.5, 8, 0.35), WALL, new THREE.Vector3(10.9, 4, -18.2)),
      mesh('RearLintel', new THREE.BoxGeometry(11.6, 2, 0.35), WALL, new THREE.Vector3(0, 7, -18.2)),
      mesh('Roof', new THREE.BoxGeometry(32, 0.3, 40), DARK_STEEL, new THREE.Vector3(0, 8.2, 0))
    );

    const rearDoor = mesh('RearLoadingDoor', new THREE.BoxGeometry(11.2, 6, 0.22), STEEL, new THREE.Vector3(0, 3, -18));
    this.rearDoor = rearDoor;
    this.root.add(rearDoor);

    this.buildRacks();
    this.buildStations();
    this.buildConveyors();
    this.buildTruck();
    this.buildLights();
    this.buildFloorWear();
    this.buildDressing();
    buildRain(this.root);
  }

  private buildRacks(): void {
    const rng = createRng(seedFrom('warehouse-racks'));
    for (let aisle = 1; aisle <= 8; aisle++) {
      const x = this.aisleX(aisle);
      const rack = mesh(`Rack-${aisle}`, rackGeometry(), STEEL, new THREE.Vector3(x, 0, -1));
      this.root.add(rack);
      const sign = mesh(
        `AisleSign-${aisle}`,
        new THREE.PlaneGeometry(1.45, 0.72),
        labelMaterial(String(aisle), aisle === 7 ? '#e0a24c' : '#d8ffb0'),
        new THREE.Vector3(x, 6.25, 8.5)
      );
      if (aisle === 8) this.aisleEightSign = sign;
      this.root.add(sign);
      for (let stack = 0; stack < 7; stack++) {
        const y = 0.48 + (stack % 3) * 1.35;
        const z = -7.5 + Math.floor(stack / 3) * 5.2 + jitter(rng, 0.18);
        const carton = mesh(
          `RackCarton-${aisle}-${stack}`,
          new THREE.BoxGeometry(0.82 + jitter(rng, 0.1), 0.72, 0.72),
          new THREE.MeshStandardMaterial({ color: stack % 2 ? '#5c513d' : '#6b5c43', roughness: 0.95 }),
          new THREE.Vector3(x + (stack % 2 ? 0.28 : -0.25), y, z)
        );
        this.root.add(carton);
      }
    }
  }

  private buildStations(): void {
    const stationData: Array<['release' | 'quarantine' | 'return' | 'hold', string, THREE.Material]> = [
      ['release', 'RELEASE', GREEN],
      ['quarantine', 'QUARANTINE', RED],
      ['return', 'RETURN', AMBER],
      ['hold', 'HOLD BAY', AMBER],
    ];
    for (const [id, label, material] of stationData) {
      const position = this.stationPositions[id];
      const frame = mesh(`Station-${id}`, new THREE.BoxGeometry(id === 'hold' ? 3.4 : 4.2, 0.35, 2.6), material, position.clone().setY(0.15));
      const plate = mesh(`StationLabel-${id}`, new THREE.PlaneGeometry(id === 'hold' ? 2.4 : 3.1, 0.52), labelMaterial(label, id === 'quarantine' ? '#e49a84' : '#d8ffb0'), new THREE.Vector3(position.x, 1.0, position.z - 1.31));
      plate.rotation.x = -Math.PI / 2;
      this.root.add(frame, plate);
      if (id === 'quarantine') {
        for (const dx of [-2.05, 2.05]) {
          this.root.add(mesh('QuarantinePost', new THREE.BoxGeometry(0.09, 2.8, 0.09), STEEL, new THREE.Vector3(position.x + dx, 1.4, position.z)));
        }
        const gate = mesh('QuarantineGate', new THREE.BoxGeometry(4.1, 0.1, 0.1), RED, new THREE.Vector3(position.x, 2.75, position.z - 1.15));
        gate.scale.x = 0;
        this.quarantineGate = gate;
        this.root.add(gate);
      }
      if (id === 'release') {
        const door = mesh(
          'OutboundCargoAirlock',
          new THREE.BoxGeometry(4.3, 3.2, 0.18),
          STEEL,
          new THREE.Vector3(position.x, 1.6, 17.96)
        );
        this.outboundDoor = door;
        this.root.add(door);
      }
    }
  }

  private buildConveyors(): void {
    const xs = [-8, 0, 8];
    const labels = ['LOCAL', 'REGIONAL', 'LONG-HAUL'];
    for (let lane = 0; lane < xs.length; lane++) {
      const laneRoot = ENGINE.SceneNode.create({ name: `Conveyor-${labels[lane]}`, position: new THREE.Vector3(xs[lane], 0, -13.5) });
      laneRoot.add(mesh('Belt', new THREE.BoxGeometry(5.8, 0.28, 6), BELT, new THREE.Vector3(0, 0.65, 0)));
      for (let roller = 0; roller < 11; roller++) {
        const rollerNode = mesh('Roller', new THREE.CylinderGeometry(0.12, 0.12, 5.6, 10), STEEL, new THREE.Vector3(0, 0.86, -2.6 + roller * 0.52));
        rollerNode.rotation.z = Math.PI / 2;
        laneRoot.add(rollerNode);
        this.conveyorRollers.push(rollerNode);
      }
      const label = mesh('ConveyorLabel', new THREE.PlaneGeometry(3.4, 0.66), labelMaterial(labels[lane], '#e0a24c'), new THREE.Vector3(0, 1.45, 2.92));
      laneRoot.add(label);
      this.root.add(laneRoot);
    }
  }

  private buildTruck(): void {
    const truck = ENGINE.SceneNode.create({ name: 'InboundTruck', position: new THREE.Vector3(0, 0, -23.2) });
    truck.add(
      mesh('Trailer', new THREE.BoxGeometry(9.5, 5.3, 8.5), new THREE.MeshStandardMaterial({ color: '#273538', roughness: 0.78, metalness: 0.3 }), new THREE.Vector3(0, 3.0, -2.5)),
      mesh('TrailerDark', new THREE.BoxGeometry(8.9, 4.7, 0.15), DARK_STEEL, new THREE.Vector3(0, 3, 1.78))
    );
    for (const x of [-3.4, 3.4]) {
      truck.add(mesh('TruckWheel', new THREE.CylinderGeometry(0.72, 0.72, 0.38, 18), new THREE.MeshStandardMaterial({ color: '#080a09', roughness: 1 }), new THREE.Vector3(x, 0.7, -4.2)));
    }
    this.root.add(truck);
  }

  private buildLights(): void {
    this.root.add(
      ENGINE.HemisphereLightNode.create({ name: 'WarehouseAmbient', color: '#9bb7b9', groundColor: '#1b211f', intensity: 2.1 }),
      ENGINE.DirectionalLightNode.create({ name: 'WarehouseMoon', color: '#9fc8d2', intensity: 2.6, position: new THREE.Vector3(-12, 18, 10), castShadow: true, shadowMapSize: 2048, shadowFar: 70 })
    );
    for (const x of [-10, -5, 0, 5, 10]) {
      for (const z of [-10, 0, 10]) {
        const fixture = mesh('CeilingFixture', new THREE.BoxGeometry(2.2, 0.1, 0.22), new THREE.MeshBasicMaterial({ color: '#b8d2c8' }), new THREE.Vector3(x, 7.7, z));
        this.root.add(fixture);
        if ((x + z) % 10 === 0) {
          this.root.add(ENGINE.PointLightNode.create({ name: 'WarehouseWorkLight', color: '#c4ddd1', intensity: 32, distance: 15, decay: 1.45, position: new THREE.Vector3(x, 7.4, z) }));
        }
      }
    }
    this.root.add(ENGINE.PointLightNode.create({ name: 'FrontSodium', color: '#e0a24c', intensity: 42, distance: 17, decay: 1.5, position: new THREE.Vector3(0, 4.5, 19.5) }));
  }

  private buildFloorWear(): void {
    for (const x of [-10.5, 0, 10.5]) {
      const stripe = mesh('SafetyLane', new THREE.PlaneGeometry(3.7, 0.18), new THREE.MeshBasicMaterial({ color: '#8a6a2d' }), new THREE.Vector3(x, 0.012, 12.9));
      stripe.rotation.x = -Math.PI / 2;
      this.root.add(stripe);
    }
  }

  private buildDressing(): void {
    // A readable functional silhouette: cradle at the front, surveillance in all corners,
    // and safety hardware around the loading routes.
    const cradle = ENGINE.SceneNode.create({ name: 'DroneCradle', position: new THREE.Vector3(0, 0, 12.2) });
    cradle.add(
      mesh('CradleBase', new THREE.CylinderGeometry(0.75, 0.9, 0.24, 12), DARK_STEEL, new THREE.Vector3(0, 0.12, 0)),
      mesh('CradleRing', new THREE.TorusGeometry(0.58, 0.07, 8, 18), AMBER, new THREE.Vector3(0, 0.34, 0))
    );
    cradle.getObjectByName('CradleRing')?.rotateX(Math.PI / 2);
    this.root.add(cradle);

    for (const [index, [x, z, turn]] of [
      [-14.8, 16.8, Math.PI * 0.76],
      [14.8, 16.8, -Math.PI * 0.76],
      [-14.8, -16.8, Math.PI * 0.24],
      [14.8, -16.8, -Math.PI * 0.24],
    ].entries()) {
      const camera = ENGINE.SceneNode.create({ name: `CCTV-${index + 1}`, position: new THREE.Vector3(x, 6.8, z), rotation: new THREE.Euler(0, turn, 0) });
      camera.add(
        mesh('CCTVArm', new THREE.BoxGeometry(0.12, 0.12, 0.58), STEEL, new THREE.Vector3(0, 0, 0.22)),
        mesh('CCTVBody', new THREE.BoxGeometry(0.42, 0.28, 0.62), WALL, new THREE.Vector3(0, -0.08, 0.6)),
        mesh('CCTVLens', new THREE.CylinderGeometry(0.11, 0.11, 0.05, 14), new THREE.MeshBasicMaterial({ color: '#8dc7b3' }), new THREE.Vector3(0, -0.08, 0.93))
      );
      camera.getObjectByName('CCTVLens')?.rotateX(Math.PI / 2);
      this.root.add(camera);
    }

    for (const x of [-13.8, -11.8, 11.8, 13.8]) {
      this.root.add(mesh('SafetyBollard', new THREE.CylinderGeometry(0.14, 0.14, 1.2, 10), AMBER, new THREE.Vector3(x, 0.6, 13.3)));
    }
    for (const x of [-9, -3, 3, 9]) {
      const drain = mesh('FloorDrain', new THREE.PlaneGeometry(1.8, 0.22), DARK_STEEL, new THREE.Vector3(x, 0.008, 5.5));
      drain.rotation.x = -Math.PI / 2;
      this.root.add(drain);
    }
    const compactor = ENGINE.SceneNode.create({ name: 'CertifiedWasteCompactor', position: new THREE.Vector3(13.7, 0, 4.2) });
    compactor.add(
      mesh('CompactorBody', new THREE.BoxGeometry(3.2, 2.8, 2.4), WALL, new THREE.Vector3(0, 1.4, 0)),
      mesh('CompactorMouth', new THREE.BoxGeometry(2.4, 1.2, 0.12), DARK_STEEL, new THREE.Vector3(0, 1.65, 1.22)),
      mesh('CompactorBeacon', new THREE.CylinderGeometry(0.12, 0.12, 0.18, 10), RED, new THREE.Vector3(1.2, 2.9, 0))
    );
    this.root.add(compactor);
  }

  public aisleX(aisle: number): number {
    return -12.25 + (Math.max(1, Math.min(8, aisle)) - 1) * 3.5;
  }

  public packagePosition(aisle: number, bay: number): THREE.Vector3 {
    const z = -8 + (Math.max(0, Math.min(99, bay)) / 99) * 16;
    return new THREE.Vector3(this.aisleX(aisle) + 0.95, 0, z);
  }

  /** Conservative rack collision used by the assisted drone; aisles remain generous. */
  public constrainDrone(position: THREE.Vector3, previous: THREE.Vector3): boolean {
    if (position.z < -9.9 || position.z > 7.9 || position.y > 5.75) return false;
    for (let aisle = 1; aisle <= 8; aisle++) {
      if (Math.abs(position.x - this.aisleX(aisle)) >= 1.12) continue;
      position.copy(previous);
      return true;
    }
    return false;
  }

  public setRearDoorOpen(amount: number): void {
    if (!this.rearDoor) return;
    this.rearDoor.position.y = 3 + Math.max(0, Math.min(1, amount)) * 6.2;
  }

  public setConveyorsRunning(running: boolean): void {
    this.conveyorRunning = running;
  }

  public setDuplicateAisle(active: boolean): void {
    if (!this.aisleEightSign) return;
    this.aisleEightSign.material = labelMaterial(active ? '7' : '8', active ? '#e49a84' : '#d8ffb0');
    this.aisleEightSign.setName(active ? 'AisleSign-7-Duplicate' : 'AisleSign-8');
  }

  public spawnInboundFreight(): void {
    if (this.inboundPackages.length) return;
    for (let i = 0; i < 8; i++) {
      const carton = mesh(
        `InboundFreight-${i + 1}`,
        new THREE.BoxGeometry(0.9 + (i % 3) * 0.12, 0.66 + (i % 2) * 0.12, 0.8),
        new THREE.MeshStandardMaterial({ color: i % 2 ? '#705e41' : '#5d503b', roughness: 0.94 }),
        new THREE.Vector3(-3.2 + (i % 4) * 2.1, 0.4 + Math.floor(i / 4) * 0.78, -17.2 - Math.floor(i / 4) * 0.35)
      );
      this.inboundPackages.push(carton);
      this.root.add(carton);
    }
  }

  public sealQuarantine(): void {
    if (this.quarantineGate) this.quarantineGate.scale.x = 1;
    this.outboundCycling = true;
  }

  public tick(deltaTime: number): void {
    this.clock += deltaTime;
    if (this.conveyorRunning) {
      for (const roller of this.conveyorRollers) roller.rotation.x -= deltaTime * 4.5;
    }
    for (const carton of this.inboundPackages) {
      carton.position.z = THREE.MathUtils.damp(carton.position.z, -14.9, 1.35, deltaTime);
    }
    if (this.outboundCycling && this.outboundDoor) {
      this.outboundDoor.position.y = THREE.MathUtils.damp(this.outboundDoor.position.y, 5.7, 1.8, deltaTime);
    }
    const rain = this.root.getObjectByName('ExteriorRain') as THREE.Points | undefined;
    const position = rain?.geometry.getAttribute('position');
    if (position) {
      for (let i = 0; i < position.count; i++) {
        const y = position.getY(i) - deltaTime * 8;
        position.setY(i, y < 0 ? 12 : y);
      }
      position.needsUpdate = true;
    }
  }
}
