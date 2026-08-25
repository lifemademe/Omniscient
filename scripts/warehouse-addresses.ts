/**
 * Can every package the game hands out actually be found where it says it is?
 *
 * ## Why this exists
 *
 * A warehouse address in this game is spatial: 2034 is aisle 2, bay 34, and the player is
 * expected to fly there and pick it up. That works only if three separate things agree, and
 * they are declared in three different files:
 *
 *   - the ADDRESS, authored in the audit table or drawn by the director;
 *   - the POSITION, computed from the address by `warehouseBayZ`;
 *   - the empty SLOT cleared in the rack stock, keyed by physical bay index.
 *
 * The rack is continuous in address space and discontinuous in the world - there are
 * uprights, and twenty of the hundred addresses land on one. An address in that gap has no
 * shelf to stand on, and the slot reserved for it can be metres away holding nothing.
 *
 * This has now gone wrong three times: once when packages were placed on the floor beside
 * the rack instead of in it, and twice more when hand-written slot keys drifted from
 * hand-written addresses - deliveries 4088 and 5013 of the inbound audit were both in the
 * gap, so two of five packages in a five-package quest could not be found. Each time it
 * presented as "there is no package there", which reads as a missing object rather than as
 * an arithmetic disagreement between two tables.
 *
 * So the arithmetic is checked here instead of being got right by hand:
 *
 *     pnpm exec tsx scripts/warehouse-addresses.ts
 */
import {
  INBOUND_AUDIT_DELIVERIES,
} from '../src/omniscient/warehouse/WarehouseInboundAudit.js';
import {
  WAREHOUSE_ADDRESSABLE_BAYS,
  WAREHOUSE_AISLE_COUNT,
  WAREHOUSE_BAY_MAX,
  WAREHOUSE_BAY_MIN,
  WAREHOUSE_RACK_BAY_Z,
  WAREHOUSE_RESERVED_ADDRESSES,
  warehouseBayZ,
  warehouseRackBayIndex,
} from '../src/omniscient/warehouse/WarehouseLayout.js';

let failures = 0;

function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` - ${detail}` : ''}`);
}

console.log('--- the addressable set ---');
const gaps: number[] = [];
for (let bay = WAREHOUSE_BAY_MIN; bay <= WAREHOUSE_BAY_MAX; bay++) {
  if (warehouseRackBayIndex(bay) === null) gaps.push(bay);
}
console.log(
  `  ${WAREHOUSE_ADDRESSABLE_BAYS.length} of ${WAREHOUSE_BAY_MAX} bays land in one of `
  + `${WAREHOUSE_RACK_BAY_Z.length} physical bays`
);
console.log(`  on an upright: ${gaps.join(', ')}`);
check(
  'the addressable set and the gap set account for every bay',
  WAREHOUSE_ADDRESSABLE_BAYS.length + gaps.length === WAREHOUSE_BAY_MAX - WAREHOUSE_BAY_MIN + 1
);
check(
  'every addressable bay really resolves to a slot',
  WAREHOUSE_ADDRESSABLE_BAYS.every((bay) => warehouseRackBayIndex(bay) !== null)
);

console.log('\n--- authored addresses ---');
for (const address of WAREHOUSE_RESERVED_ADDRESSES) {
  const index = warehouseRackBayIndex(address.bay);
  const z = warehouseBayZ(address.bay);
  check(
    `${address.note} (aisle ${address.aisle}, bay ${address.bay})`,
    index !== null && address.aisle >= 1 && address.aisle <= WAREHOUSE_AISLE_COUNT,
    index === null
      ? `z ${z.toFixed(2)} is between bays - nothing can stand there`
      : `z ${z.toFixed(2)} -> physical bay ${index}`
  );
}

console.log('\n--- the inbound audit agrees with the reserved list ---');
for (const delivery of INBOUND_AUDIT_DELIVERIES) {
  const reserved = WAREHOUSE_RESERVED_ADDRESSES.some(
    (address) => address.aisle === delivery.aisle && address.bay === delivery.bay
  );
  check(
    `${delivery.packageId} has a reserved slot`,
    reserved,
    reserved ? '' : `aisle ${delivery.aisle} bay ${delivery.bay} is not in WAREHOUSE_RESERVED_ADDRESSES`
  );
  /*
   * The id is the address. A package labelled 4097 that lives at bay 88 is worse than a
   * package in the wrong place, because the manifest, the rack ruler and the carton all
   * disagree and the player is asked to trust all three.
   */
  const expected = `${delivery.aisle}${String(delivery.bay).padStart(3, '0')}`;
  check(
    `${delivery.packageId} reads as its own address`,
    delivery.packageId === expected,
    delivery.packageId === expected ? '' : `aisle ${delivery.aisle} bay ${delivery.bay} spells ${expected}`
  );
}

/*
 * The audit's evidence has to require BOTH tells, and that is a property of the table rather
 * than of any one entry - so it is asserted here rather than trusted to stay true while the
 * table is edited.
 */
console.log('');
console.log('--- the two tells actually require each other ---');
const suspicious = INBOUND_AUDIT_DELIVERIES.filter((d) => d.suspicious);
check('exactly one delivery is the impostor', suspicious.length === 1, `${suspicious.length} marked suspicious`);
for (const impostor of suspicious) {
  check(
    `${impostor.packageId} has an identity contradiction`,
    impostor.packageDelivererName !== impostor.workerName,
    `carton says ${impostor.packageDelivererName}, badge says ${impostor.workerName}`
  );
  check(
    `${impostor.packageId} has no innocent explanation on record`,
    impostor.sealCompromised && !impostor.sealNote
  );
}
/*
 * The decisive one. If every broken seal belonged to the impostor, a player could convict on
 * the seal alone and never read a name - which is the comparison the whole quest is about.
 */
const innocentBrokenSeal = INBOUND_AUDIT_DELIVERIES.filter(
  (d) => !d.suspicious && d.sealCompromised && d.sealNote
);
check(
  'a legitimate delivery also arrives with a broken seal',
  innocentBrokenSeal.length >= 1,
  innocentBrokenSeal.length
    ? innocentBrokenSeal.map((d) => d.packageId).join(', ')
    : 'a broken seal would convict on its own'
);
check(
  'every legitimate broken seal carries its explanation',
  INBOUND_AUDIT_DELIVERIES.every((d) => d.suspicious || !d.sealCompromised || Boolean(d.sealNote))
);
check(
  'no legitimate delivery contradicts its own badge',
  INBOUND_AUDIT_DELIVERIES.every((d) => d.suspicious || d.packageDelivererName === d.workerName)
);

console.log(
  failures === 0
    ? '\nALL CHECKS PASSED'
    : `\n${failures} CHECK${failures === 1 ? '' : 'S'} FAILED`
);
process.exit(failures === 0 ? 0 : 1);
