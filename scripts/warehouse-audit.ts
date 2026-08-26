/**
 * Does anything in the warehouse pass through anything else, or stand on nothing?
 *
 * Every fault this looks for has already shipped at least once, and every one of them was
 * found the same way: by eye, one at a time, usually by the person playing rather than by the
 * person who built it. Two gates and a scan curtain through the conveyors. A buffer tower
 * inside the transfer belt. A hold-bay plinth inside door C's dock, and a pallet stack inside
 * it after that. Every bottom carton in the building nineteen centimetres into its own pallet.
 * A louvre on a letter plate, then a pipe riser on the same plate. Beacons, lock bolts, a
 * tamper sensor and five light fittings mounted to fresh air. A handrail across its own stair.
 *
 * They are three bug classes, not fifteen bugs:
 *
 *   INTERSECTION - two solids occupying the same space.
 *   FLOATING     - a prop with nothing under it and nothing behind it.
 *   BURIED       - a prop inside the surface it is supposed to sit on.
 *
 * ## Why this reads the built scene rather than the source
 *
 * The warehouse is built at runtime from about a dozen files, and the numbers that collide
 * are never in the same file - a belt defined as a CatmullRom curve in WarehouseAutomation
 * against a gate width typed in art.ts, a dock rotated a quarter turn by its door layout
 * against a pallet position in WarehouseSetDressing. No call site can show the collision, so
 * no amount of care at the call site prevents it. The only place the truth exists is the
 * assembled scene graph.
 *
 * So this constructs the real WarehouseEnvironment under a headless three.js, walks it, and
 * measures. It needs no browser and no play mode, which is what makes it something that can
 * run on every change rather than when somebody remembers.
 *
 *     npx tsx scripts/warehouse-audit.ts
 *     npx tsx scripts/warehouse-audit.ts --verbose
 *
 * ## What it deliberately does NOT flag
 *
 * A warehouse is full of things that touch on purpose: a carton on a pallet, a bolt in its
 * housing, a rail in its newel, a roller in its frame. Intersection alone is not a fault -
 * DEEP intersection between things that have no reason to touch is. The exemptions below are
 * therefore part of the test, not holes in it, and each one says why.
 */
import * as THREE from 'three';

/*
 * A canvas that does nothing, because the audit measures geometry and not pixels.
 *
 * Half a dozen props in this building draw their labels to a 2D canvas at construction time -
 * aisle numbers, bay rulers, zone plates, door letters. Under node there is no `document`, and
 * without one the environment cannot be built at all. Every call on the stub is a no-op and
 * the texture it returns is never sampled; all this has to do is let the constructors run.
 *
 * Installed before the module that needs it is imported, which is why the import below is
 * dynamic - a static import would be hoisted above this and evaluate first.
 */
const noop = (): void => {};
const stubContext = new Proxy({} as CanvasRenderingContext2D, {
  get: (_target, key) => (key === 'canvas' ? stubCanvas : key === 'measureText' ? () => ({ width: 0 }) : noop),
  set: () => true,
});
const stubCanvas = { width: 1, height: 1, getContext: () => stubContext } as unknown as HTMLCanvasElement;
(globalThis as { document?: unknown }).document = {
  createElement: (tag: string) => (tag === 'canvas' ? stubCanvas : { style: {}, appendChild: noop }),
};

const { WarehouseEnvironment } = await import('../src/omniscient/warehouse/art.js');

/**
 * Merged buckets, by name, because size alone does not catch them.
 *
 * `FacilityDeck` is every deck-material surface in the building in one mesh - the mezzanine,
 * the office roof, the stair treads - and its extent is 9.2m, under the size threshold. Its
 * bounding box therefore claimed an overlap with the bollards and the dock beneath the
 * mezzanine, which is a fault of the box and not of the scene.
 */
const MERGED_BUCKET = /^(Facility|Rack(Pallets|Cartons|Totes|ToteLids|Drums|DrumBands|Tape|Wrap)|AisleFloor|Yard|FloorPaint|FloorWear|ReceivingTransfer|TrailerRibs|TrailerFrame|TrailerMarkers|RackColumnGuards|RackEndTies)/;

/**
 * Things with no surface, which therefore cannot hold anything up or be passed through.
 *
 * `RainbreakSkyVolume` is a box around the entire building, and as a bulk primitive its
 * bounding box vouched for every object in the level - the floating test reported zero because
 * the sky was holding everything. Atmosphere, weather, light shafts and dust are all in this
 * class: they are drawn, they are not there.
 */
const NOT_A_SOLID = /Sky|Rain|Fog|Haze|Volume|Dust|Shaft|Patch|Glow|Beam|Field|Halo|Speed|Mote/;

/** How far two solids may overlap before it stops being contact and starts being a fault. */
const OVERLAP_TOLERANCE = 0.12;
/** Anything smaller than this in every axis is trim, and trim is allowed to sit in things. */
const TRIM_SIZE = 0.2;
/** A prop whose underside is this far above whatever is below it is standing on nothing. */
const FLOAT_GAP = 0.35;

interface Solid {
  name: string;
  box: THREE.Box3;
  size: THREE.Vector3;
}

/**
 * Names that are allowed to intersect, and the reason.
 *
 * A pair passes if EITHER name matches EITHER pattern - these are things that are supposed to
 * be inside or through one another.
 */
const CONTACT_ALLOWED: ReadonlyArray<readonly [RegExp, string]> = [
  [/Carton|Tote|Drum|Wrap|Tape|Pallet|Crate|Slat|Runner/, 'stock stands on and leans against other stock'],
  [/Bolt|Housing|Keeper|Rail|Hanger|Bracket|Post|Leg|Support|Tie|Guard|Newel|Stringer/, 'structure is fixed to structure'],
  /*
   * The verified intake is a clamp station built ON the end of lane one - that is what an
   * intake is. Its rollers and its guides are inside the belt because the package they hold
   * arrives on the belt, so this is the one conveyor contact that is the machine working.
   */
  [/Roller|Belt|Conveyor|Lane|Intake|Clamp|Guide/, 'a roller sits in the frame that carries it'],
  [/Light|Lamp|Lens|Beacon|Flood|Bulkhead|Pack|Tube|Fixture|Shade/, 'a lamp sits in its own housing'],
  [/Wall|Floor|Deck|Slab|Apron|Pad|Shell|Clerestory|Lintel|Infill|Ceiling|Roof/, 'the building contains everything'],
  [/Sign|Label|Plate|Panel|Display|Letter|Ruler|Glass|Vision|Window/, 'signage is mounted flush to what it names'],
  [/Shaft|Patch|Scan|Field|Dust|Speed|Feedback|Marker|Hatch|Chevron|Paint|Wear|Stain|Puddle|Scuff/, 'decals and light have no volume'],
  /*
   * A vehicle is a nest of overlapping boxes on purpose - a chassis inside a body, a hub
   * inside a wheel, a mast through a counterweight. Flagging those buries the real findings
   * under sixty rows of truck.
   */
  [/Trailer|Truck|Forklift|Agv|Scrubber|Cab|Wheel|Hub|Mast|Fork|Tiller|Seat|Dash|Counterweight|Bumper|Mudflap/, 'a vehicle is built from parts that interlock'],
  [/Portal|Crown|Gantry|Claw|Pincer|Arm|Trolley|Carriage|Cage|Stillage|Condenser|Louvre|Bin|Planter|Hoop|Intercom|Cover|Cabinet|Extinguisher|Buffer|Tower|Shutter|Curtain|Drum/, 'an assembly is fixed to itself'],
  /*
   * A door is a frame with a head across its jambs and a canopy bolted through both. Those
   * joins are the door being built, not the door being wrong - the overlaps are a fifth of a
   * metre and every one is a member meeting the member it is fixed to.
   */
  [/Frame|Canopy|Jamb|Head|Sill|Shoe|Pipe|Duct|Grille|Vent|Batten|Tray|Rung|Catwalk|Stair|Tread|Riser|Landing/, 'a fitting joins the thing it is fitted to'],
  /* Anything bolted to the building is inside the building's own skin by a few centimetres. */
  [/Canopy|Infill|Wall|Lintel|Shell|Clerestory|Cladding|Column|Beam|Truss|Bracket|Mount/, 'a fitting is bolted through the skin it hangs on'],
  /* A camera is a body with a lens in it; a beacon is a housing with a lamp in it. */
  [/Body|Lens|Hub|Shade|Cap|Cowl|Hood|Head|Neck|Nose|Boss/, 'a fitting contains its own optics'],
  /* A trailer reversing onto a dock seal is the dock working, not the dock broken. */
  [/Dock|Seal|Bumper|Leveller|Apron|Plinth|Bed|Cradle/, 'a vehicle meets the dock it is backed onto'],
  /* A shutter winds into its own drum, by design - see the drum note in art.ts. */
  [/Gate|Drum|Shutter|Curtain|Roll/, 'a shutter parks inside the drum that hides it'],
  /* Rainwater goods: a shoe is the fitting on the bottom of a downpipe. */
  [/Pipe|Shoe|Gutter|Hopper|Downpipe|Conduit|Riser|Header|Elbow|Drop/, 'rainwater and refrigerant goods join end to end'],
  /* A wall rib is part of the wall the door frame is set into. */
  [/Rib|Frame|Wall|Purlin|Girt/, 'a rib is part of the wall it stiffens'],
];

/**
 * BOTH names must match the SAME rule, not either name any rule.
 *
 * The first version passed a pair if either name matched anything, and it reported zero
 * findings on a scene with several known faults still in it - because 'Pallet' appears in one
 * rule, so a pallet standing inside a dock plinth was waved through by the rule that exists to
 * let a pallet hold a carton. An exemption that only one party has to satisfy is not an
 * exemption, it is an off switch.
 *
 * Requiring both keeps every intended contact - a carton and a pallet are both stock, a jamb
 * and a canopy are both parts of a door - and catches every case where something wandered into
 * a category it has no business being in.
 */
/**
 * Two names sharing a long prefix are the same assembly, whatever they are called.
 *
 * `ReceivingTransferRail-L` and `ReceivingTransferRollers` share seventeen characters, and a
 * rail holding a roller is a conveyor being a conveyor. Naming a rule for every such machine
 * would be a list that grows with the set and rots the moment somebody adds one; a shared
 * prefix is the same claim made structurally. Eight characters is long enough that unrelated
 * props do not collide by accident - `Roller` and `SortPumpTank` share none.
 */
const SAME_ASSEMBLY_PREFIX = 8;

function sharedPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

function exempt(a: string, b: string): string | null {
  if (sharedPrefix(a, b) >= SAME_ASSEMBLY_PREFIX) return 'the same assembly, by name';
  for (const [pattern, why] of CONTACT_ALLOWED) {
    if (pattern.test(a) && pattern.test(b)) return why;
  }
  return null;
}

/**
 * Everything the audit can see, split by how useful its bounding box is.
 *
 * `solids` are ordinary parts and their boxes mean what they say. `bulk` are the merged
 * buckets and long runs - a whole aisle of cartons in one mesh, a forty-metre cable tray -
 * whose single AABB spans half the building and would report an intersection with everything
 * it encloses.
 *
 * Those are useless for the intersection test and NECESSARY for the support test, which is
 * the split: a rung on a long tray is held up by the tray, and dropping the tray made ten
 * rungs look like they were hanging in the air. The trade runs the other way too - a merged
 * bucket's box will vouch for something merely inside its extent rather than touching it, so
 * the support test under-reports. Under-reporting is the right failure here: a missed floater
 * costs a look, and seventy false ones cost the habit of reading the output at all.
 */
function collect(root: THREE.Object3D): { solids: Solid[]; bulk: Solid[] } {
  const solids: Solid[] = [];
  const bulk: Solid[] = [];
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    const meshObject = object as THREE.Mesh;
    if (!meshObject.isMesh || !meshObject.geometry) return;
    if (!meshObject.visible) return;
    const box = new THREE.Box3().setFromObject(meshObject);
    if (!Number.isFinite(box.min.x) || box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    if (NOT_A_SOLID.test(meshObject.name)) return;
    const entry = { name: meshObject.name || '(unnamed)', box, size };
    (size.x > 12 || size.z > 12 || MERGED_BUCKET.test(entry.name) ? bulk : solids).push(entry);
  });
  return { solids, bulk };
}

function overlap(a: THREE.Box3, b: THREE.Box3): THREE.Vector3 | null {
  const min = new THREE.Vector3(
    Math.max(a.min.x, b.min.x),
    Math.max(a.min.y, b.min.y),
    Math.max(a.min.z, b.min.z)
  );
  const max = new THREE.Vector3(
    Math.min(a.max.x, b.max.x),
    Math.min(a.max.y, b.max.y),
    Math.min(a.max.z, b.max.z)
  );
  const size = max.sub(min);
  return size.x > 0 && size.y > 0 && size.z > 0 ? size : null;
}

/**
 * Is anything on the surface of a merged run inside this box?
 *
 * A merged bucket's bounding box is half the building, so asking "does the probe touch its
 * box" answers yes for everything and the support test reports nothing. Its VERTICES are
 * exact, though, so they go into a half-metre spatial hash once and each candidate then checks
 * the handful of cells its probe covers. That is what makes "a rung is held up by its tray"
 * true while "a beacon is four metres from anything" stays false.
 */
const CELL = 0.5;
const occupied = new Set<string>();
const cellKey = (x: number, y: number, z: number): string =>
  `${Math.floor(x / CELL)}|${Math.floor(y / CELL)}|${Math.floor(z / CELL)}`;

/**
 * A LONG BOX is not a merged bucket, and hashing its vertices was the bug.
 *
 * A twenty-metre conveyor belt is one BoxGeometry: twenty-four vertices, all of them at its
 * corners. Hashing those puts eight cells at each end of it and nothing along the middle, so
 * fifty-two rollers sitting on the middle of that belt were reported as hanging in the air.
 * The rollers were fine; the test was measuring the wrong thing.
 *
 * A long PRIMITIVE has an honest bounding box - it fills it - so its box is used directly. A
 * merged BUCKET does not, so its vertices are hashed. Sixty-four is the split: a box is
 * twenty-four, a cylinder a little more, and anything a bucket holds is thousands.
 */
const BULK_PRIMITIVE_VERTICES = 64;
const bulkBoxes: THREE.Box3[] = [];

function indexBulk(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const point = new THREE.Vector3();
  root.traverse((object) => {
    const meshObject = object as THREE.Mesh;
    if (!meshObject.isMesh || !meshObject.geometry || !meshObject.visible) return;
    if (NOT_A_SOLID.test(meshObject.name)) return;
    const box = new THREE.Box3().setFromObject(meshObject);
    const size = box.getSize(new THREE.Vector3());
    if (size.x <= 12 && size.z <= 12 && !MERGED_BUCKET.test(meshObject.name)) return;
    const position = meshObject.geometry.getAttribute('position');
    if (!position) return;
    if (position.count <= BULK_PRIMITIVE_VERTICES) {
      bulkBoxes.push(box);
      return;
    }
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position as THREE.BufferAttribute, i).applyMatrix4(meshObject.matrixWorld);
      occupied.add(cellKey(point.x, point.y, point.z));
    }
  });
}

function nearBulkSurface(probe: THREE.Box3): boolean {
  if (bulkBoxes.some((box) => probe.intersectsBox(box))) return true;
  for (let x = Math.floor(probe.min.x / CELL); x <= Math.floor(probe.max.x / CELL); x++) {
    for (let y = Math.floor(probe.min.y / CELL); y <= Math.floor(probe.max.y / CELL); y++) {
      for (let z = Math.floor(probe.min.z / CELL); z <= Math.floor(probe.max.z / CELL); z++) {
        if (occupied.has(`${x}|${y}|${z}`)) return true;
      }
    }
  }
  return false;
}

/**
 * ## Can this test still fail?
 *
 * It reported zero twice while known faults were still in the scene, both times because an
 * exemption or a bounding box had quietly swallowed everything - and a zero from a broken
 * audit looks exactly like a zero from a clean one. So before it reports anything it proves it
 * can still catch the two things it exists to catch, using objects placed to be caught.
 *
 * If either canary passes unnoticed the harness fails loudly instead of congratulating itself.
 */
function selfTest(parts: Solid[], nearBulk: (probe: THREE.Box3) => boolean): string[] {
  const failures: string[] = [];

  // A slab in clear air, halfway up the middle of the building.
  const airBox = new THREE.Box3(new THREE.Vector3(-1, 5.4, 4), new THREE.Vector3(0, 5.9, 5));
  const airProbe = airBox.clone().expandByScalar(FLOAT_GAP);
  if (parts.some((other) => airProbe.intersectsBox(other.box)) || nearBulk(airProbe)) {
    failures.push('the FLOATING canary was reported as supported - it is not in clear air any more');
  }

  // Two unrelated names, deeply overlapped.
  const a = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1));
  const b = new THREE.Box3(new THREE.Vector3(0.5, 0.5, 0.5), new THREE.Vector3(1.5, 1.5, 1.5));
  const shared = overlap(a, b);
  if (!shared || Math.min(shared.x, shared.y, shared.z) <= OVERLAP_TOLERANCE) {
    failures.push('the INTERSECTION canary did not overlap - the measurement is wrong');
  }
  if (exempt('CanaryWidget', 'CanaryGizmo')) {
    failures.push('the INTERSECTION canary was exempted - the exemption list matches everything');
  }
  return failures;
}

const verbose = process.argv.includes('--verbose');
const environment = new WarehouseEnvironment();
environment.build();
const { solids, bulk } = collect(environment.root as unknown as THREE.Object3D);
indexBulk(environment.root as unknown as THREE.Object3D);
console.log(`--- warehouse audit: ${solids.length} solids, ${bulk.length} merged runs ---\n`);

/*
 * Intersections, by a sweep on x rather than every pair against every other.
 *
 * Sorted by their minimum x, a solid can only meet those whose min x is below its own max -
 * so the inner loop breaks as soon as it passes that, and a scene of several thousand parts
 * measures in a second rather than a minute.
 */
const sorted = [...solids].sort((a, b) => a.box.min.x - b.box.min.x);
interface Finding { text: string; depth: number }
const clashes: Finding[] = [];
/* Counted and printed, because a silent exemption list is how an audit stops auditing. */
let suppressed = 0;
for (let i = 0; i < sorted.length; i++) {
  const a = sorted[i];
  const trimA = a.size.x < TRIM_SIZE && a.size.y < TRIM_SIZE && a.size.z < TRIM_SIZE;
  for (let j = i + 1; j < sorted.length; j++) {
    const b = sorted[j];
    if (b.box.min.x > a.box.max.x) break;
    if (trimA && b.size.x < TRIM_SIZE && b.size.y < TRIM_SIZE && b.size.z < TRIM_SIZE) continue;
    const shared = overlap(a.box, b.box);
    if (!shared) continue;
    // The shallowest axis is how far one has actually been pushed into the other.
    const depth = Math.min(shared.x, shared.y, shared.z);
    if (depth <= OVERLAP_TOLERANCE) continue;
    if (exempt(a.name, b.name)) { suppressed += 1; continue; }
    clashes.push({
      text: `  ${a.name} <-> ${b.name}  overlap ${depth.toFixed(2)}m` +
        `  at (${a.box.getCenter(new THREE.Vector3()).x.toFixed(1)}, ${a.box.getCenter(new THREE.Vector3()).z.toFixed(1)})`,
      depth,
    });
  }
}
clashes.sort((a, b) => b.depth - a.depth);
console.log(`INTERSECTIONS: ${clashes.length}  (${suppressed} intended contacts exempted)`);
for (const clash of (verbose ? clashes : clashes.slice(0, 25))) console.log(clash.text);
if (!verbose && clashes.length > 25) console.log(`  ... and ${clashes.length - 25} more (--verbose)`);

/*
 * Floating props: nothing under them within FLOAT_GAP, and nothing beside them either.
 *
 * "Beside" matters as much as "under" - a wall pack is supported by the cladding behind it,
 * not by the floor. So a solid passes if anything at all is within the gap of it in ANY
 * direction, and only fails when it is alone in a bubble.
 */
const floaters: Finding[] = [];
for (const solid of solids) {
  if (solid.box.min.y <= FLOAT_GAP) continue;
  const probe = solid.box.clone().expandByScalar(FLOAT_GAP);
  const supported =
    solids.some((other) => other !== solid && probe.intersectsBox(other.box)) || nearBulkSurface(probe);
  if (supported) continue;
  const centre = solid.box.getCenter(new THREE.Vector3());
  floaters.push({
    text: `  ${solid.name}  at (${centre.x.toFixed(1)}, ${centre.y.toFixed(1)}, ${centre.z.toFixed(1)})` +
      `  nothing within ${FLOAT_GAP}m`,
    depth: solid.box.min.y,
  });
}
floaters.sort((a, b) => b.depth - a.depth);
console.log(`\nFLOATING: ${floaters.length}`);
for (const floater of (verbose ? floaters : floaters.slice(0, 25))) console.log(floater.text);
if (!verbose && floaters.length > 25) console.log(`  ... and ${floaters.length - 25} more (--verbose)`);

const canaries = selfTest(solids, nearBulkSurface);
if (canaries.length) {
  console.log('\nSELF TEST FAILED - this run proves nothing:');
  for (const failure of canaries) console.log(`  ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    clashes.length || floaters.length
      ? `\n${clashes.length} intersection(s), ${floaters.length} floater(s).`
      : '\nNothing passes through anything, and nothing stands on nothing. (self test passed)'
  );
}
