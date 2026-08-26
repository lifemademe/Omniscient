import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { createRng, range, seedFrom } from '../core/rng.js';
import { palletGeometries } from './palletGeometry.js';
import { WAREHOUSE_LAYOUT } from './WarehouseLayout.js';

/**
 * Roof structure, and it is the reason the ceiling read as a pale band.
 *
 * Eleven trusses run the full 47m width at y 9.74 with braces just under them. Seen from a
 * drone at working height they stack up in perspective, and at 0.58 metalness in a room with
 * no reflection probe they took the high bay light straight back at the camera - so the
 * separate bars merged into one continuous field filling the upper frame, with the deck
 * behind them contributing almost nothing.
 *
 * That field is why three earlier attempts missed. Easing the clerestory lights made the room
 * flatter, halving the window emissive measured as nothing, and darkening the roof DECK did
 * nothing either - because the deck was barely visible behind its own trusses. A ray fired
 * into the band came back RoofTruss at twelve metres, which ended the guessing.
 *
 * Darker and matte. Metalness 0.58 was buying brightness rather than a look: painted
 * structural steel is not polished, and there is nothing in this room for it to reflect.
 */
const STRUCTURE = new THREE.MeshStandardMaterial({ color: '#192129', roughness: 0.9, metalness: 0.08 });
const DUCT = new THREE.MeshStandardMaterial({ color: '#354750', roughness: 0.48, metalness: 0.72 });
const RUBBER = new THREE.MeshStandardMaterial({ color: '#090d11', roughness: 0.92, metalness: 0.08 });
const PALLET = new THREE.MeshStandardMaterial({ color: '#6b522e', roughness: 0.96, metalness: 0.01 });
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
      /*
       * Off the transfer belt. At (10.8, -20.6) this stack spanned x 10.02..11.58 and the belt
       * leaves receiving at (10.2, -20.7) occupying roughly 9.4..11.0 - so a wrapped pallet
       * stood inside the conveyor, its legs and its rails. Found by the audit sweep.
       */
      [7.8, -21.4],
      /*
       * Out of door C's drop point.
       *
       * At (20.7, 18.4) this bare pallet spanned x 19.93..21.48 by z 17.63..19.18, and door
       * C's transfer dock - rotated a quarter turn onto the east wall - occupies 20.33..23.08
       * by 18.13..21.88. Over a metre of overlap on both axes, so the dock stood on it.
       * Reported as an asset clipping inside the drop point.
       *
       * (13.5, 18.6) is open floor between the hold area and the mezzanine's west edge at
       * 13.4, clear of the dock, the fire point, the maintenance drum and the forklift.
       */
      [13.5, 18.6],
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
          // Lifted with the rack cartons. #5d4d36 is 35% grey, which is the mud the whole set
          // was mixed from before the palette pass, and it is cardboard.
          mesh('PalletCarton', new THREE.BoxGeometry(1.35, 0.72, 1.25), new THREE.MeshStandardMaterial({ color: '#b79b6e', roughness: 0.96 }), new THREE.Vector3(0, 0.59, 0)),
          mesh('ShrinkWrap', new THREE.BoxGeometry(1.39, 0.76, 1.29), new THREE.MeshPhysicalMaterial({ color: '#b8d2c8', transparent: true, opacity: 0.08, roughness: 0.2, metalness: 0 }), new THREE.Vector3(0, 0.59, 0))
        );
      }
      pallet.rotation.y = index % 2 ? 0.16 : -0.12;
      this.root.add(pallet);
    }

    /**
     * Pallets in the AISLES, not only round the edges.
     *
     * The four above are at the perimeter - two by the rear muster, one at each far corner -
     * and the aisles themselves were swept clean. A working warehouse is not swept clean; the
     * floor between the racks is where the half-finished jobs live, and it is also the only
     * surface the player looks at for minutes at a time while flying down a run.
     *
     * Set against the rack feet rather than mid-aisle, so nothing here is an obstacle: the
     * middle of every run stays clear for the drone, and these read as things stacked out of
     * the way, which is what they would be. Seeded, so a run is the same run every visit -
     * the mission asks the player to remember where a package was.
     *
     * Merged by material, for the same reason the rack contents are. Twelve loose stacks as
     * individual nodes is another forty draw calls of scenery that never moves.
     */
    const looseRng = createRng(seedFrom('warehouse-aisle-floor'));
    const slats: THREE.BufferGeometry[] = [];
    const boxes: THREE.BufferGeometry[] = [];
    for (const aisleX of [-15.5, -8.5, -1.5, 5.5]) {
      for (const z of [-9.4, -1.2, 7.6]) {
        if (looseRng() < 0.22) continue;
        const side = looseRng() < 0.5 ? -1 : 1;
        const px = aisleX + side * (2.05 + looseRng() * 0.3);
        const pz = z + range(looseRng, -1.1, 1.1);
        /*
         * These were three planks hovering 14cm off the slab with nothing underneath them,
         * and the boxes above them floated another 4cm clear of the top plank. A real pallet
         * now, sitting on the floor, with the stack standing ON it - see palletGeometry.
         */
        // One turn for the pallet AND its load. Rotating only the pallet left a stack of
        // boxes sitting square on a deck lying ten degrees off them, which reads as a
        // mistake rather than as a job left half done.
        const turn = range(looseRng, -0.18, 0.18);
        slats.push(...palletGeometries(px, 0.14, pz, { width: 1.5, depth: 1.32, turn }));
        const stack = Math.floor(looseRng() * 3);
        for (let tier = 0; tier < stack; tier++) {
          const height = 0.5 + looseRng() * 0.24;
          const box = new THREE.BoxGeometry(1.16 + looseRng() * 0.2, height, 1.06 + looseRng() * 0.16);
          // 0.14 is the pallet deck top from palletGeometries above; 0.13 put every bottom
          // box a centimetre inside the pallet it stands on. Same fault as the racks.
          box.translate(range(looseRng, -0.08, 0.08), 0.14 + tier * 0.78 + height * 0.5, 0);
          box.rotateY(turn);
          box.translate(px, 0, pz);
          boxes.push(box);
        }
      }
    }
    if (slats.length) {
      const merged = mergeGeometries(slats, false);
      if (merged) this.root.add(mesh('AisleFloorPallets', merged, PALLET));
    }
    if (boxes.length) {
      const merged = mergeGeometries(boxes, false);
      // Board, at the value the rack cartons were lifted to. These sat at #5d4d36, which is
      // the same 35%-grey mud the racks were mixed from before the palette pass.
      if (merged) this.root.add(mesh('AisleFloorCartons', merged, new THREE.MeshStandardMaterial({ color: '#b79b6e', roughness: 0.95 })));
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

    /*
     * ## The beacons are ON the wall now, not hanging in front of it
     *
     * Reported as a glowing white shape in front of door B, and that is what it was: a bare
     * 22cm emissive cone at (0, 3.3, 24.4) - four and a half metres clear of the front wall,
     * three and a bit up, touching nothing. Emissive amber at 1.5 clips to white through the
     * cel pass's brightness, which is why it read as a pale blob rather than as a lamp; same
     * family as the door lock bolts, and the same cause. An unmounted primitive with a glow on
     * it is not a prop, it is a placeholder.
     *
     * Each one moves back onto the wall of the door it belongs to - the front service door and
     * the rear freight opening - and rises above the head of that opening, which is where a
     * door-active beacon is fitted and the only place it does not foul the shutter. It gets
     * the three parts that make it read: a BACKPLATE screwed to the cladding, an ARM standing
     * it off, and a CAGE over the lens.
     *
     * `standoff` is the inward direction for each: the front wall's inner face is at z 29.02
     * and the rear's at -29.02, so the front beacon hangs at a smaller z and the rear at a
     * larger one.
     */
    /*
     * ## Neither of them is at x 0, and both reasons are the wall
     *
     * FRONT: the door's own interior sign is a 2.2m plate at (0, 4.45, 28.84). A beacon at
     * x 0 and y 4.42 would have landed sixteen centimetres in front of it at the same height -
     * trading one floating prop for one embedded in a sign. Out to 1.9, clear of the plate's
     * 1.1m half-width and still on the side infill panel.
     *
     * REAR: there is no wall at x 0 back there at all. The rear freight opening runs x -5.8
     * to 5.8 - the RearWest and RearEast segments start outside that - so a beacon on the
     * centreline would have been mounted to fresh air, which is the fault being fixed. 7.2
     * puts it on RearEast cladding beside the opening.
     */
    for (const [index, [x, wallZ, standoff, color]] of ([
      [1.9, 29.02, -1, '#e0a24c'],
      [7.2, -29.02, 1, '#d65a42'],
    ] as const).entries()) {
      const material = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 1.5,
        roughness: 0.24,
      });
      // Above the 3.69m door head, under the lintel, on the header cladding.
      const y = 4.42;
      const z = wallZ + standoff * 0.34;
      const beacon = mesh('WarningBeacon', new THREE.CylinderGeometry(0.11, 0.14, 0.22, 12), material, new THREE.Vector3(x, y, z));
      this.root.add(
        mesh('WarningBeaconPlate', new THREE.BoxGeometry(0.34, 0.4, 0.07), DUCT, new THREE.Vector3(x, y - 0.04, wallZ + standoff * 0.035)),
        mesh('WarningBeaconArm', new THREE.BoxGeometry(0.09, 0.09, 0.34), DUCT, new THREE.Vector3(x, y - 0.14, wallZ + standoff * 0.19)),
        mesh('WarningBeaconCap', new THREE.CylinderGeometry(0.13, 0.13, 0.04, 12), DUCT, new THREE.Vector3(x, y + 0.13, z))
      );
      // Three bars over the lens - a beacon in a working building always has a guard.
      for (const bar of [-0.09, 0, 0.09]) {
        this.root.add(mesh(
          'WarningBeaconCage',
          new THREE.BoxGeometry(0.02, 0.26, 0.02),
          DUCT,
          new THREE.Vector3(x + bar, y, z + standoff * 0.13)
        ));
      }
      const light = ENGINE.PointLightNode.create({
        name: `WarningBeaconLight-${index + 1}`,
        color,
        intensity: 5,
        distance: 6,
        decay: 1.8,
        // Off the lens on the room side, so the beacon lights the floor under the door
        // instead of cooking its own housing.
        position: new THREE.Vector3(x, y - 0.1, z + standoff * 0.42),
      });
      this.beaconMaterials.push(material);
      this.beaconLights.push(light);
      this.root.add(beacon, light);
    }
  }
}
