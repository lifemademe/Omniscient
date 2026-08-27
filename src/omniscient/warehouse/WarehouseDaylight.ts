import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { WAREHOUSE_LAYOUT } from './WarehouseLayout.js';
import { WarehouseYard } from './WarehouseYard.js';
import { WAREHOUSE_SERVICE_DOOR_FRAME } from './WarehouseServiceDoors.js';

const LOWER_WALL = new THREE.MeshStandardMaterial({ color: '#2e3835', roughness: 0.9, metalness: 0.08 });
const UPPER_WALL = new THREE.MeshStandardMaterial({ color: '#1e2927', roughness: 0.82, metalness: 0.16 });
const FRAME = new THREE.MeshStandardMaterial({ color: '#121c1a', roughness: 0.58, metalness: 0.72 });
const WALL_RIB = new THREE.MeshStandardMaterial({ color: '#3c4845', roughness: 0.62, metalness: 0.5 });
const CEILING = new THREE.MeshStandardMaterial({
  color: '#242d2b',
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
/*
 * How hard the windows push back against nine amber work lights.
 *
 * Measured before this pass: 82.3% of lit pixels warm, 2.0% cool, mean R-B bias +46 - one
 * hue across the whole room. Tripling the hemisphere fill moved the bias by four points,
 * because a global ambient cannot compete with nine point lights at 54 and only lifts the
 * floor it is trying to contrast with.
 *
 * Cold light placed AT the windows does compete, because it lands where the warm lamps
 * are weakest - the upper walls, the tops of the racking, the far ends of the aisles - so
 * the contrast arrives as rim and depth rather than as a wash over everything.
 */
const CLERESTORY_NIGHT = 34;

/**
 * A light shaft as a grid with soft edges, from its four corners.
 *
 * `window0`/`window1` are the two corners at the source and `floor1`/`floor0` the two it
 * lands on - ordered so window0-floor0 is one side and window1-floor1 the other. Alpha is
 * `sin(pi u)` across, which is zero on both side edges and one down the middle, times a
 * falloff along the run so the shaft is strongest at the window and gone before the slab.
 *
 * Colour is white so `material.color` decides the hue; only the alpha channel varies. Three
 * reads a four-component `color` attribute as RGBA, which is what carries the taper.
 */
function softShaftGeometry(
  window0: THREE.Vector3,
  window1: THREE.Vector3,
  floor1: THREE.Vector3,
  floor0: THREE.Vector3
): THREE.BufferGeometry {
  const across = 7;
  const along = 9;
  const positions: number[] = [];
  const colours: number[] = [];
  const indices: number[] = [];
  const top = new THREE.Vector3();
  const bottom = new THREE.Vector3();
  const point = new THREE.Vector3();
  for (let iv = 0; iv <= along; iv++) {
    const v = iv / along;
    for (let iu = 0; iu <= across; iu++) {
      const u = iu / across;
      top.copy(window0).lerp(window1, u);
      bottom.copy(floor0).lerp(floor1, u);
      point.copy(top).lerp(bottom, v);
      positions.push(point.x, point.y, point.z);
      colours.push(1, 1, 1, Math.sin(Math.PI * u) * Math.pow(1 - v, 1.15));
    }
  }
  for (let iv = 0; iv < along; iv++) {
    for (let iu = 0; iu < across; iu++) {
      const a = iv * (across + 1) + iu;
      const b = a + 1;
      const c = a + across + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 4));
  geometry.setIndex(indices);
  return geometry;
}

export class WarehouseDaylight {
  public readonly root = ENGINE.SceneNode.create({ name: 'WarehouseDaylightArchitecture' });

  private readonly bounceLights: ENGINE.PointLightNode[] = [];
  /**
   * The cold clerestory, kept apart from the warm one.
   *
   * They very nearly shared `bounceLights`, and the emergency ramp below drives that whole
   * array to a single lerp - so on the first tick every cool light would have been reset to
   * the warm one's 7.6 and the split this exists to create would have closed itself. Two
   * intensities need two lists.
   */
  private readonly nightLights: ENGINE.PointLightNode[] = [];
  private readonly yard = new WarehouseYard();
  private readonly shaftMaterials: THREE.MeshBasicMaterial[] = [];
  private readonly windowMaterials: THREE.MeshStandardMaterial[] = [];
  private sunLight: ENGINE.DirectionalLightNode | null = null;
  private clock = 0;
  private celStyleEnabled = false;

  public build(): void {
    this.buildExteriorContext();
    this.buildClerestoryShell();
    this.buildSunlight();
  }

  public setCelStyleEnabled(enabled: boolean): void {
    this.celStyleEnabled = enabled;
  }

  public tick(deltaTime: number, emergencyLevel: number, contained: boolean, reducedMotion: boolean): void {
    this.clock += deltaTime;
    const emergency = THREE.MathUtils.clamp(emergencyLevel, 0, 1);
    // Pushed together with the hemisphere fill - see WAREHOUSE_SKY_FILL in art.ts for why
    // the fill leads and these follow rather than the other way round.
    // Key up, bounce down: the ratio between them is the modelling, and pushing both
    // together was the reason the room went flat while getting brighter.
    // The cel branch is the one that ships - see the long note in art.ts. Its sun was 2.8
    // against the other branch's 0.9, which is a three-times-brighter night, and between that
    // and a hemisphere at 2.2 the interior read as an overcast afternoon: pale walls the
    // materials here author as near-black, and a blue sky sitting in the clerestory.
    const sun = this.celStyleEnabled ? 1.1 : 0.9;
    const bounce = this.celStyleEnabled ? 3.4 : 4.6;
    /*
     * Do NOT reach for these to darken the ceiling. Measured: dropping them from 28 to 19 made
     * the room FLATTER, not deeper - top 99 to 97 while the bottom fell 110 to 107 and the
     * working plane lost four levels. Despite sitting at the glazing they are mostly a floor
     * light, so leaning on them dims the part of the picture the player works in and barely
     * touches the roof. The bright band up there is the glazing itself; see windowMaterials.
     */
    const night = this.celStyleEnabled ? 30 : CLERESTORY_NIGHT;
    if (this.sunLight) this.sunLight.intensity = THREE.MathUtils.lerp(sun, 0.52, emergency);
    for (const light of this.bounceLights) light.intensity = THREE.MathUtils.lerp(bounce, 1.45, emergency);
    // The night side barely dims. When the work lights drop it is most of what is left, and
    // an emergency that goes black is a scene the player cannot act in.
    for (const light of this.nightLights) light.intensity = THREE.MathUtils.lerp(night, 14, emergency);
    const breathing = reducedMotion || contained ? 1 : 0.94 + Math.sin(this.clock * 0.24) * 0.06;
    for (const material of this.shaftMaterials) {
      const normalOpacity = this.celStyleEnabled ? 0.028 : 0.036;
      material.opacity = THREE.MathUtils.lerp(normalOpacity * breathing, 0.009, emergency);
    }
    for (const material of this.windowMaterials) {
      // Halving this to 0.06 was tried against the bright upper band and measured as nothing
      // at all - the changed pixels were animation variance. The band is the roof deck.
      material.emissiveIntensity = THREE.MathUtils.lerp(0.12, 0.05, emergency);
    }
  }

  /**
   * The world outside, which was a dark box and a dark plane.
   *
   * Both values were chosen for a night interior nobody looked out of. Three of the four
   * camera feeds point straight at this, so it is lifted to sit under the same high-key
   * grade as the room - a sky that reads as overcast rather than as an absence, and a yard
   * surface a working value below the aprons laid on it. The yard itself is
   * WarehouseYard: aprons, kerbs, road, fence, lamp columns and clutter.
   */
  private buildExteriorContext(): void {
    const sky = mesh(
      'RainbreakSkyVolume',
      new THREE.BoxGeometry(104, 48, 116),
      new THREE.MeshBasicMaterial({ color: '#7c93a6', side: THREE.BackSide, toneMapped: false }),
      new THREE.Vector3(0, 13, 0),
      false,
      false
    );
    const ground = mesh(
      'ExteriorWetGround',
      new THREE.PlaneGeometry(104, 116),
      new THREE.MeshStandardMaterial({ color: '#414a4c', roughness: 0.62, metalness: 0.08 }),
      new THREE.Vector3(0, -0.285, 0),
      false,
      true
    );
    ground.rotation.x = -Math.PI / 2;
    this.root.add(sky, ground);
    this.yard.build();
    this.root.add(this.yard.root);
  }

  private buildClerestoryShell(): void {
    const { shell } = WAREHOUSE_LAYOUT;
    const frontCutoutWidth = 5.8;
    const frontCutoutTop = 5;
    const frontSideInfillWidth = (frontCutoutWidth - WAREHOUSE_SERVICE_DOOR_FRAME.width) / 2;
    const frontSideInfillX = WAREHOUSE_SERVICE_DOOR_FRAME.width / 2 + frontSideInfillWidth / 2;
    const frontHeaderHeight = frontCutoutTop - WAREHOUSE_SERVICE_DOOR_FRAME.height;
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
      /*
       * The front shell is split around a 5.8m construction cutout, while Service B's real
       * outer frame is only 2.94m wide and 3.69m high. Leaving the remainder empty exposed
       * the exterior sky on both sides and above the door. These three panels close the
       * cladding exactly to the frame instead of disguising the gap with another prop.
       */
      mesh(
        'FrontServiceWestInfill',
        new THREE.BoxGeometry(frontSideInfillWidth, frontCutoutTop, 0.35),
        LOWER_WALL,
        new THREE.Vector3(-frontSideInfillX, frontCutoutTop / 2, shell.frontZ)
      ),
      mesh(
        'FrontServiceEastInfill',
        new THREE.BoxGeometry(frontSideInfillWidth, frontCutoutTop, 0.35),
        LOWER_WALL,
        new THREE.Vector3(frontSideInfillX, frontCutoutTop / 2, shell.frontZ)
      ),
      mesh(
        'FrontServiceHeaderInfill',
        new THREE.BoxGeometry(WAREHOUSE_SERVICE_DOOR_FRAME.width, frontHeaderHeight, 0.35),
        LOWER_WALL,
        new THREE.Vector3(0, WAREHOUSE_SERVICE_DOOR_FRAME.height + frontHeaderHeight / 2, shell.frontZ)
      ),
      mesh('FrontGateLintel', new THREE.BoxGeometry(frontCutoutWidth, 5.5, 0.35), UPPER_WALL, new THREE.Vector3(0, 7.75, shell.frontZ)),
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
        /*
         * Glass, not a lamp. At 0.52 these panes GLOWED - emissive ignores scene lighting, so
         * they read as bright daylight at midnight and were most of why the interior looked
         * like noon while the yard looked like night. Down to a value that reads as night sky
         * caught in glass, which is what a clerestory does after dark.
         */
        emissive: '#5f7f96',
        emissiveIntensity: 0.12,
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
      /*
       * ## This was a sun in a mission that happens at night
       *
       * The objective line reads "receive the NIGHT truck". The exterior ground, the moon,
       * the door cameras and the whole security-shift fiction are night. A warm 2.55 sunbreak
       * was the one element arguing for daytime, and it was arguing badly: it was never
       * aimed, so it contributed almost nothing and the daylight the player actually saw came
       * from emissive window panes and five warm point lights faking spill.
       *
       * The apparatus is kept and re-tempered rather than deleted. The same key light, the
       * same shadow rig, the same clerestory geometry now carry moonlight: cold, a third of
       * the strength, and pointed at the floor it is supposed to be lighting. One story.
       */
      color: '#b9d2e2',
      intensity: 0.9,
      position: new THREE.Vector3(-42, 26, 22),
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
    // Aimed after add() - see the note on the moon in art.ts. position does not point a
    // directional; rotation does, and this one had none.
    this.sunLight.lookAt(new THREE.Vector3(-4, 0, 0));

    for (const [index, z] of [14, 6, -2, -10, -18].entries()) {
      const bounce = ENGINE.PointLightNode.create({
        name: `ClerestoryBounce-${index + 1}`,
        /* Was warm sun spill through the west clerestory. Night: the same spill, moonlit. */
        color: index % 2 ? '#9dc0dc' : '#8fb2d0',
        intensity: 4.6,
        distance: 16,
        decay: 1.75,
        position: new THREE.Vector3(-21.1, 6.7, z),
      });
      this.bounceLights.push(bounce);
      this.root.add(bounce);

      /**
       * And the cold side, opposite.
       *
       * Measured after the warm pass: 40% of the frame was warm and 2.1% was cool. That is
       * not a warm/cool split, it is warm on black - and the reason is that the only cold
       * light in the building is a directional outside a roof that casts shadows, so it never
       * gets in at all.
       *
       * The warm bounce above is the sunbreak coming through the WEST clerestory. This is the
       * night sky coming through the east one: same row, same heights, opposite wall,
       * opposite colour, a third of the strength. It costs five point lights and it is the
       * difference between a room lit by lamps and a room that has an outside.
       *
       * Weak on purpose. It is not competing with the high bays for the floor; it is there so
       * that the tops of the east racks and the upper wall have something that is not amber,
       * and so a silhouette in the middle distance has two colours behind it.
       */
      /*
       * Both walls now, not just the east one.
       *
       * A single cold side lights one row of rack tops and leaves the opposite wall entirely
       * amber, so the room still reads as one hue from every angle that does not happen to
       * face east. Windows exist on both elevations; the light should too.
       */
      for (const wallX of [17.4, -17.4]) {
      const nightSide = ENGINE.PointLightNode.create({
        name: `ClerestoryNight-${index + 1}-${wallX > 0 ? 'E' : 'W'}`,
        color: index % 2 ? '#7fb4d8' : '#8ec3e0',
        /*
         * 12, not 4.4, and further in.
         *
         * Measured after it was added: cool pixels went from 2.1% to 0.7%, so at 4.4 against
         * nine warm high bays at 54 it was not merely losing, it was inaudible. It also sat at
         * x 21.1 - hard against the east wall, behind the racking from every angle the player
         * flies down an aisle.
         *
         * Still deliberately weak next to the lamps. Its job is to put something that is not
         * amber on the tops of the east racks and the upper wall, not to light the floor.
         */
        intensity: 12,
        distance: 30,
        decay: 1.25,
        position: new THREE.Vector3(wallX, 7.6, z),
      });
      this.nightLights.push(nightSide);
      this.root.add(nightSide);
      }

      /*
       * ## The shaft had a HARD EDGE, and a hard edge is not a light
       *
       * Reported twice as a wireframe or glass rectangle passing through the conveyor belt,
       * and both times it was this. The shaft was two triangles: a single flat quad running
       * from the clerestory at x -23.85 down to the floor at x 5.5 - twenty-nine metres wide,
       * nine metres tall, additive, double-sided, depthWrite off. Three things followed from
       * that and all three are what the player was seeing:
       *
       *  - ITS RIM READ AS A DRAWN LINE. Additive alpha accumulates along a silhouette, so the
       *    one part of a flat translucent polygon you always see is its edge. From the drone
       *    that is a bright cyan line ruled across the building - the "wireframe".
       *  - IT PASSED THROUGH EVERYTHING. A sheet from the roof to the floor crosses the racks,
       *    the transfer belt and the sortation lanes on the way down, and with depthWrite off
       *    and additive blending it draws OVER them rather than being hidden by them.
       *  - IT ENDED AT THE SLAB. The floor end sat at y 0.06 at full strength, so the sheet
       *    terminated in a hard line where it met the concrete.
       *
       * A shaft of light has no edges at all - it fades out in every direction. So it is built
       * as a grid now with per-vertex alpha rather than as a quad with uniform alpha: zero
       * across both side edges, peaking down the middle, and fading to nothing before it
       * reaches the floor. There is no rim left to read as a line, and where it crosses the
       * conveyors it is already transparent.
       *
       * The four corners are unchanged, so the shaft lands exactly where it did and the floor
       * patch below still marks where it arrives. `material.opacity` stays the global
       * multiplier the day/night driver animates; the vertex alpha is a 0-1 shape on top.
       */
      const material = new THREE.MeshBasicMaterial({
        color: '#a9c8e4',
        transparent: true,
        opacity: 0.036,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        vertexColors: true,
      });
      this.shaftMaterials.push(material);
      const endZ = z - 7.5;
      this.root.add(mesh(
        `SunShaft-${index + 1}`,
        softShaftGeometry(
          new THREE.Vector3(-23.85, 9.35, z - 1.1),
          new THREE.Vector3(-23.85, 7.25, z + 1.1),
          new THREE.Vector3(5.5, 0.06, endZ + 3.1),
          new THREE.Vector3(2.5, 0.06, endZ - 2.2)
        ),
        material,
        undefined,
        false,
        false
      ));

      const patch = mesh(
        `SunPatch-${index + 1}`,
        new THREE.PlaneGeometry(6.8, 2.15),
        new THREE.MeshBasicMaterial({
          color: '#93b4cc',
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
