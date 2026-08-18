/**
 * Driving the mower, and cutting what it drives over.
 *
 * Two things that have to be one file because they are the same loop: the unit moves, and
 * whatever the deck passed over stops standing up. Splitting them would mean the cut lagged
 * the machine by a frame, which on a 0.5m deck at 1.5m/s is visible.
 *
 * ## The cut is instance scale, not geometry
 *
 * The meadow is InstancedMesh - one draw call for tens of thousands of blades, with every
 * blade's transform living in the instance matrix. And `bladeGeometry` is UNIT HEIGHT by
 * construction, which the meadow wrote down for its own reasons: an instance's Y scale IS
 * its height in metres. So cutting a blade is one number. No geometry is rebuilt, nothing
 * is removed from the buffer, the draw call does not change, and a mown strip costs exactly
 * what an unmown one did.
 *
 * That is also why the grass does not disappear when it is cut. It goes to stubble, which
 * is what mown grass is - a lawn is not bare earth. The contrast between 0.42m of unmown
 * bank and 0.04m of stubble is the whole readout of the minigame, and it is legible from
 * the overhead plot as well as from behind the machine.
 *
 * ## Why a grid
 *
 * The bank holds several thousand blades and the mower asks "what is within 0.25m of me"
 * sixty times a second. Testing every blade every frame is a million distance checks a
 * second for a lawnmower, which is absurd when the answer is always the same handful.
 * Bucketing by half-metre cell at setup makes it a lookup of nine cells.
 */

import * as THREE from 'three';

// Type-only: nothing here calls into the engine, it only names its node types. Which also
// means this module loads outside a browser, and the cut can be tested without a scene.
import type * as ENGINE from '@gnsx/genesys.js';

import { CUT_WIDTH, DECK_Y, MOWER_SPEED, MOWER_TURN, MOWER_WIDTH } from '../geometry/mower.js';

import type { GeneratedMower } from '../geometry/mower.js';

/** How short a cut blade is left. Not zero - see the note above. */
const STUBBLE = 0.09;
/** Cell size for the lookup grid, in metres. About half a deck width. */
const CELL = 0.5;

/** Somewhere the mower cannot go: a bed, a trunk, the person standing in the field. */
export interface Obstacle {
  x: number;
  z: number;
  radius: number;
}

export interface FieldBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface Blade {
  mesh: THREE.InstancedMesh;
  index: number;
  x: number;
  z: number;
  cut: boolean;
}

interface Weed {
  node: ENGINE.InstancedModelMeshNode;
  index: number;
  x: number;
  z: number;
  cut: boolean;
}

/**
 * Everything on this set that can be cut, indexed by where it is.
 *
 * Built once from nodes that already exist - the meadow and the scattered weeds - rather
 * than from a parallel list of "mowable things". A blade that is in the field is mowable
 * because it is in the field, which means the bank cannot drift out of sync with the thing
 * the player is looking at.
 */
export class MowingField {
  private readonly blades: Blade[] = [];
  private readonly weeds: Weed[] = [];
  private readonly cells = new Map<string, number[]>();
  private readonly weedCells = new Map<string, number[]>();
  private cutCount = 0;
  private weedCutCount = 0;

  public constructor(private readonly bounds: FieldBounds) {}

  /** Index every grass instance in `node` that stands inside the bank. */
  public addMeadow(node: ENGINE.SceneNode): void {
    const matrix = new THREE.Matrix4();
    const at = new THREE.Vector3();

    node.traverse((object) => {
      const mesh = object as THREE.InstancedMesh;
      if (!mesh.isInstancedMesh) return;

      for (let index = 0; index < mesh.count; index++) {
        mesh.getMatrixAt(index, matrix);
        at.setFromMatrixPosition(matrix);
        // The meadow node may itself be offset, so ask the world where this blade is.
        at.applyMatrix4(mesh.matrixWorld);
        if (!this.inside(at.x, at.z)) continue;
        this.blades.push({ mesh, index, x: at.x, z: at.z, cut: false });
        this.push(this.cells, at.x, at.z, this.blades.length - 1);
      }
    });
  }

  /** Index a scattered planting node the same way. */
  public addWeeds(node: ENGINE.InstancedModelMeshNode): void {
    const instances = node.instances ?? [];
    for (let index = 0; index < instances.length; index++) {
      // The engine's instance record types position and scale as optional. A planting
      // without one is not a plant, so it is skipped rather than defaulted to the origin -
      // where it would sit in the middle of the bank as a weed that can never be cut.
      const at = instances[index]?.position;
      if (!at || !this.inside(at.x, at.z)) continue;
      this.weeds.push({ node, index, x: at.x, z: at.z, cut: false });
      this.push(this.weedCells, at.x, at.z, this.weeds.length - 1);
    }
  }

  public get total(): number {
    return this.blades.length + this.weeds.length;
  }

  /** 0 to 1. What the plot draws and what the mission reads to know it is done. */
  public progress(): number {
    if (this.total === 0) return 1;
    return (this.cutCount + this.weedCutCount) / this.total;
  }

  /** How many weeds are still standing - the number Adaeze actually cares about. */
  public weedsLeft(): number {
    return this.weeds.length - this.weedCutCount;
  }

  /**
   * Cut everything within `radius` of a point. Returns how much was newly cut.
   *
   * The return value is what the drive loop listens to: something being cut this frame is
   * what the blade note and the clippings are keyed off, and it is zero the instant the
   * machine is driving over ground it has already done. Which is also the feedback that
   * teaches overlapping passes without a tutorial.
   */
  public cut(x: number, z: number, radius = CUT_WIDTH * 0.5): number {
    let done = 0;
    const rr = radius * radius;
    const reach = Math.ceil(radius / CELL);

    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    for (let ix = cx - reach; ix <= cx + reach; ix++) {
      for (let iz = cz - reach; iz <= cz + reach; iz++) {
        const key = `${ix}:${iz}`;

        for (const index of this.cells.get(key) ?? []) {
          const blade = this.blades[index];
          if (blade.cut) continue;
          const dx = blade.x - x;
          const dz = blade.z - z;
          if (dx * dx + dz * dz > rr) continue;
          this.shorten(blade);
          blade.cut = true;
          this.cutCount++;
          done++;
        }

        for (const index of this.weedCells.get(key) ?? []) {
          const weed = this.weeds[index];
          if (weed.cut) continue;
          const dx = weed.x - x;
          const dz = weed.z - z;
          if (dx * dx + dz * dz > rr) continue;
          this.flatten(weed);
          weed.cut = true;
          this.weedCutCount++;
          done += 3;
        }
      }
    }
    return done;
  }

  /** Put every blade back up, for a scene that is replayed. */
  public reset(): void {
    for (const blade of this.blades) {
      if (!blade.cut) continue;
      this.shorten(blade, 1 / STUBBLE);
      blade.cut = false;
    }
    for (const weed of this.weeds) {
      if (!weed.cut) continue;
      this.flatten(weed, 1 / 0.12);
      weed.cut = false;
    }
    this.cutCount = 0;
    this.weedCutCount = 0;
  }

  /**
   * The nearest thing still standing, or null when the bank is done.
   *
   * This is the fix for the tail of a mowing game, which is otherwise the worst part of
   * it. The first eighty percent is a pleasant sweep; the last ten is hunting three
   * survivors in a corner because the deck is 0.5m wide and the passes did not quite
   * overlap. That is not difficulty, it is a search task nobody asked for, and it is the
   * exact thing that would make a player put this down two minutes before the payoff.
   *
   * Rings outward from the machine's own cell rather than scanning the bank, so it costs
   * the same whether it finds something in the first ring or the twentieth, and it stops
   * the moment it does.
   */
  public nearestUncut(x: number, z: number): { x: number; z: number } | null {
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    const span = Math.ceil(
      Math.max(this.bounds.maxX - this.bounds.minX, this.bounds.maxZ - this.bounds.minZ) / CELL
    );

    let bestX = 0;
    let bestZ = 0;
    let best = Infinity;

    for (let ring = 0; ring <= span; ring++) {
      /*
       * Do not stop at the first ring that contains something.
       *
       * A ring is a SQUARE shell, so the far corner of ring N is 1.4 cells further out
       * than its near edge - and a blade sitting in the next ring straight ahead can be
       * closer than one found diagonally in this one. Returning early was measurably
       * wrong: against a brute-force scan it picked a blade 0.09m away when one at 0.07m
       * existed. On a chart 192 pixels wide that is not a visible error, which is exactly
       * why it would have survived being looked at.
       *
       * Every point in this shell is at least (ring - 1) cells away, so once that floor
       * passes what has already been found, nothing further out can beat it.
       */
      if (best < Infinity && (ring - 1) * CELL > Math.sqrt(best)) break;

      for (let ix = cx - ring; ix <= cx + ring; ix++) {
        for (let iz = cz - ring; iz <= cz + ring; iz++) {
          // Only the shell of the ring - the inside was searched on the previous pass.
          if (ring > 0 && Math.abs(ix - cx) !== ring && Math.abs(iz - cz) !== ring) continue;
          const key = `${ix}:${iz}`;

          for (const list of [
            { indices: this.cells.get(key), items: this.blades as Array<{ x: number; z: number; cut: boolean }> },
            { indices: this.weedCells.get(key), items: this.weeds as Array<{ x: number; z: number; cut: boolean }> },
          ]) {
            for (const index of list.indices ?? []) {
              const item = list.items[index];
              if (item.cut) continue;
              const distance = (item.x - x) ** 2 + (item.z - z) ** 2;
              if (distance >= best) continue;
              best = distance;
              bestX = item.x;
              bestZ = item.z;
            }
          }
        }
      }

    }

    return best < Infinity ? { x: bestX, z: bestZ } : null;
  }

  /** Every blade position, for the overhead plot to draw as a coverage map. */
  public plotPoints(): ReadonlyArray<{ x: number; z: number; cut: boolean }> {
    return this.blades;
  }

  private inside(x: number, z: number): boolean {
    return (
      x >= this.bounds.minX && x <= this.bounds.maxX && z >= this.bounds.minZ && z <= this.bounds.maxZ
    );
  }

  private push(into: Map<string, number[]>, x: number, z: number, index: number): void {
    const key = `${Math.floor(x / CELL)}:${Math.floor(z / CELL)}`;
    const bucket = into.get(key);
    if (bucket) bucket.push(index);
    else into.set(key, [index]);
  }

  /**
   * Take a blade down, by rewriting the scale of its instance matrix.
   *
   * Decomposed and recomposed rather than scaling a column in place, because a blade is not
   * axis-aligned - the meadow turns every one of them - so multiplying a column would shear
   * the blade rather than shorten it.
   *
   * ## Y AND Z, and this was the bug
   *
   * A blade's vertices are (+/-halfWidth, t, t*t*0.34): it rises in y and LEANS FORWARD in
   * z, and the meadow scales it with `scale.set(width, tall, tall)` - so its height lives
   * in two axes, not one. Scaling y alone did not shorten a blade, it flattened one: 9% of
   * its height and still 100% of its forward reach, which is a full-length blade lying on
   * the ground.
   *
   * Which is exactly how it was reported - the plot said cut and the field did not look
   * cut. The plot reads the `cut` flags, so it was telling the truth about the bookkeeping;
   * the bookkeeping was right and the geometry was doing something else. Any check that
   * counted blades or trusted the chart would have passed.
   */
  private shorten(blade: Blade, factor = STUBBLE): void {
    const matrix = new THREE.Matrix4();
    const at = new THREE.Vector3();
    const turn = new THREE.Quaternion();
    const size = new THREE.Vector3();
    blade.mesh.getMatrixAt(blade.index, matrix);
    matrix.decompose(at, turn, size);
    size.y *= factor;
    size.z *= factor;
    matrix.compose(at, turn, size);
    blade.mesh.setMatrixAt(blade.index, matrix);
    blade.mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Same for a modelled weed, which is a plain instance record rather than a matrix.
   *
   * Flattened harder than the grass and squashed wider, because that is what happens to a
   * thick-stemmed plant under a rotary deck: it does not become short grass, it becomes a
   * mess on the ground.
   */
  private flatten(weed: Weed, factor = 0.12): void {
    const instances = weed.node.instances;
    if (!instances) return;
    const size = instances[weed.index]?.scale;
    if (!size) return;
    size.y *= factor;
    size.x *= factor < 1 ? 1.15 : 1 / 1.15;
    size.z *= factor < 1 ? 1.15 : 1 / 1.15;
    // Reassigned rather than mutated in place: the node uploads on assignment.
    weed.node.instances = instances;
  }
}

export interface DriveInput {
  forward: number;
  turn: number;
}

/**
 * The unit, under control.
 *
 * Deliberately not a physics body. This is a groundskeeping machine on flat ground at
 * walking pace, and a rigidbody would buy nothing but a mower that can be tipped over.
 * Position and heading, integrated, with obstacles as circles it slides along.
 */
export class MowerDrive {
  private heading = 0;
  private readonly at = new THREE.Vector3();
  private spin = 0;
  private beaconPhase = 0;
  private engaged = false;

  public constructor(
    private readonly mower: GeneratedMower,
    private readonly field: MowingField,
    private readonly bounds: FieldBounds,
    private readonly obstacles: readonly Obstacle[]
  ) {}

  public get position(): THREE.Vector3 {
    return this.at;
  }

  public get facing(): number {
    return this.heading;
  }

  /** Park it somewhere and point it. */
  public place(x: number, z: number, heading: number): void {
    this.at.set(x, 0, z);
    this.heading = heading;
    this.apply();
  }

  /** Blades on. The rotor spins and the beacon flashes only while this is true. */
  public engage(on: boolean): void {
    this.engaged = on;
  }

  /**
   * One tick. Returns how much was cut, so the caller can react to contact.
   *
   * Turn before travel, and travel along the heading rather than along the input - a
   * vehicle goes where its wheels point, which is the entire difference between driving
   * something and dragging it around a plane.
   */
  public update(deltaTime: number, input: DriveInput): number {
    const throttle = Math.max(-1, Math.min(1, input.forward));
    const steer = Math.max(-1, Math.min(1, input.turn));

    /*
     * Steering scales with speed, and reverses in reverse.
     *
     * A stationary mower that can spin on the spot at full rate feels like a turret. Tying
     * the rate to how fast it is actually going is what makes it feel like it has wheels -
     * and the sign flip is what makes reversing behave the way anybody who has backed up a
     * trolley expects.
     */
    this.heading -= steer * MOWER_TURN * deltaTime * (throttle < 0 ? -1 : 1) * Math.max(0.25, Math.abs(throttle));

    const step = throttle * MOWER_SPEED * deltaTime;
    const wanted = new THREE.Vector3(
      this.at.x + Math.sin(this.heading) * step,
      0,
      this.at.z + Math.cos(this.heading) * step
    );

    this.slide(wanted);
    this.at.copy(wanted);
    this.apply();

    if (!this.engaged) return 0;

    /*
     * Spin the rotor with the ground speed rather than at a constant rate, so a machine
     * sitting still with its blades on is idling and not pretending to work.
     */
    this.spin += (2.5 + Math.abs(throttle) * 26) * deltaTime;
    this.mower.rotor.rotation.y = this.spin;

    this.beaconPhase = (this.beaconPhase + deltaTime * 3.4) % (Math.PI * 2);
    this.mower.beacon.visible = Math.sin(this.beaconPhase) > -0.35;

    /*
     * Cut along the segment travelled, not at the point arrived at.
     *
     * At 1.5m/s a 30fps frame moves the machine 5cm, which is inside the deck - but a
     * dropped frame moves it 25cm, which is half a deck, and cutting only at the endpoint
     * would leave an uncut band the player never drove round. Sampling the step is what
     * makes the cut frame-rate independent.
     */
    const samples = Math.max(1, Math.ceil(Math.abs(step) / (CUT_WIDTH * 0.4)));
    let done = 0;
    for (let i = 1; i <= samples; i++) {
      const t = i / samples;
      done += this.field.cut(
        this.at.x - Math.sin(this.heading) * step * (1 - t),
        this.at.z - Math.cos(this.heading) * step * (1 - t)
      );
    }
    return done;
  }

  /**
   * Keep it on the grass and out of the beds.
   *
   * Pushed out of an obstacle along the line from its centre rather than stopped dead,
   * which is what makes a bumper feel like a bumper: the machine grazes the bed frame and
   * carries on down the side of it instead of sticking to it. Stopping on contact is the
   * version where the player fights the controls in a 1.1m gap.
   */
  private slide(wanted: THREE.Vector3): void {
    // Derived, not typed. This was 0.31 sitting next to a MOWER_WIDTH of 0.62, and widening
    // the machine without it would leave the body overhanging every boundary by 4cm.
    const half = MOWER_WIDTH / 2;
    wanted.x = Math.min(this.bounds.maxX - half, Math.max(this.bounds.minX + half, wanted.x));
    wanted.z = Math.min(this.bounds.maxZ - half, Math.max(this.bounds.minZ + half, wanted.z));

    for (const obstacle of this.obstacles) {
      const dx = wanted.x - obstacle.x;
      const dz = wanted.z - obstacle.z;
      const clear = obstacle.radius + half;
      const distance = Math.hypot(dx, dz);
      if (distance >= clear || distance < 1e-5) continue;
      wanted.x = obstacle.x + (dx / distance) * clear;
      wanted.z = obstacle.z + (dz / distance) * clear;
    }
  }

  private apply(): void {
    this.mower.root.position.set(this.at.x, 0, this.at.z);
    this.mower.root.rotation.set(0, this.heading, 0);
  }

  /**
   * Where the camera goes.
   *
   * Over and behind the deck, looking at the ground ahead of the machine rather than at
   * the machine - so the player sees what they are about to cut, which is the only
   * information the game is asking them to act on. A chase camera aimed at the vehicle
   * puts the vehicle in the middle of the frame and the work at the edges.
   *
   * Low, at 0.72m. This is a knee-high machine and a camera at head height would look down
   * on a lawn; from just above the housing the unmown bank stands up against the horizon
   * and you can see where you have been.
   */
  public shot(): { position: THREE.Vector3; target: THREE.Vector3 } {
    const back = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    return {
      position: new THREE.Vector3(
        this.at.x - back.x * 1.15,
        DECK_Y + 0.55,
        this.at.z - back.z * 1.15
      ),
      target: new THREE.Vector3(this.at.x + back.x * 2.2, 0.12, this.at.z + back.z * 2.2),
    };
  }
}

/**
 * Keyboard, held rather than pressed.
 *
 * A key repeat is not a control input - holding W has to mean "still going", and the
 * browser's own repeat rate would make it mean "going, going, going" with gaps. So this
 * tracks the down/up edges and the drive loop reads the state.
 */
export class DriveKeys {
  private readonly held = new Set<string>();
  private readonly onDown = (event: KeyboardEvent): void => {
    if (!KEYS.has(event.key)) return;
    // Arrows scroll the console behind the game if they are not claimed.
    event.preventDefault();
    this.held.add(event.key);
  };
  private readonly onUp = (event: KeyboardEvent): void => {
    this.held.delete(event.key);
  };

  public attach(): void {
    window.addEventListener('keydown', this.onDown);
    window.addEventListener('keyup', this.onUp);
  }

  public detach(): void {
    window.removeEventListener('keydown', this.onDown);
    window.removeEventListener('keyup', this.onUp);
    this.held.clear();
  }

  public read(): DriveInput {
    const down = (...keys: string[]): number => (keys.some((key) => this.held.has(key)) ? 1 : 0);
    return {
      forward: down('w', 'W', 'ArrowUp') - down('s', 'S', 'ArrowDown'),
      turn: down('d', 'D', 'ArrowRight') - down('a', 'A', 'ArrowLeft'),
    };
  }
}

const KEYS = new Set([
  'w',
  'W',
  'a',
  'A',
  's',
  'S',
  'd',
  'D',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);
