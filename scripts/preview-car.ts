/**
 * Is the car a place, or a diorama?
 *
 * This set is looked at for a few seconds at the end of the game's longest mission, and
 * every fault it can have is a fault of PROPORTION - a windscreen at the wrong distance
 * reads as wrong long before anybody can say why, and by then it is a feeling about the
 * ending rather than a bug anybody files. So the claims get measured instead.
 *
 * Runs headlessly: carInterior.ts imports THREE and nothing else.
 *
 *     npx tsx scripts/preview-car.ts
 */

import { EYE, carInterior } from '../src/omniscient/geometry/carInterior.js';

let failed = 0;
function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failed += 1;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` - ${detail}` : ''}`);
}

console.log('=== THE CAR ===');
const car = carInterior();

/** Every vertex of a part, as [x,y,z] triples. */
function points(geometry: { getAttribute: (n: string) => { count: number; getX: (i: number) => number; getY: (i: number) => number; getZ: (i: number) => number } }): Array<[number, number, number]> {
  const position = geometry.getAttribute('position');
  const out: Array<[number, number, number]> = [];
  for (let i = 0; i < position.count; i++) out.push([position.getX(i), position.getY(i), position.getZ(i)]);
  return out;
}

for (const [name, part] of Object.entries(car)) {
  if (name === 'anchors') continue;
  check(`${name} has surfaces`, points(part as never).length >= 6, `${String(points(part as never).length)} vertices`);
}

/*
 * The one measurement that decides whether this feels like a car.
 *
 * Closer than about 0.7m and the glass reads as a helmet visor; past a metre and it reads
 * as a bus. Both are still "a windscreen" and neither is "somebody is driving this".
 */
const glass = points(car.windscreen as never);
check('rain has UVs on every windscreen vertex', car.windscreen.getAttribute('uv')?.count === glass.length);
const near = Math.min(...glass.map((p) => Math.abs(p[2])));
const far = Math.max(...glass.map((p) => Math.abs(p[2])));
check('the glass is at driving distance', near > 0.7 && far < 1.25, `${near.toFixed(2)}m to ${far.toFixed(2)}m`);
check('the glass rakes away from the eye', glass.some((p) => p[1] > 0.2 && Math.abs(p[2]) > 1));

// Everything is in FRONT of the eye or beside it. A vertex behind the head is a modelling
// slip that only shows up as a stray surface in one framing out of three.
const all = [car.cabin, car.windscreen, car.wipers, car.phone, car.glasses].flatMap((g) => points(g as never));
check('nothing is built behind the driver', all.every((p) => p[2] < 0.55), `furthest back ${Math.max(...all.map((p) => p[2])).toFixed(2)}m`);

// The phone has to be reachable and OFF the eye line - the call ending is about something
// happening beside a person who is not looking at it.
const phone = car.anchors.phone;
check('the phone is within reach', phone.distanceTo(EYE) < 0.85, `${phone.distanceTo(EYE).toFixed(2)}m`);
check('the phone is off the eye line', Math.abs(phone.x) > 0.25 && phone.y < -0.1, `x ${phone.x.toFixed(2)}, y ${phone.y.toFixed(2)}`);

// The spectacle frame must sit inside the glass, or it is an object in the room rather
// than something being worn.
const rim = points(car.glasses as never);
check(
  'the glasses are worn, not parked on the dash',
  Math.max(...rim.map((p) => Math.abs(p[2]))) < 0.3,
  `furthest ${Math.max(...rim.map((p) => Math.abs(p[2]))).toFixed(2)}m from the eye`
);

console.log(failed === 0 ? '\nALL CHECKS PASSED' : `\n${String(failed)} CHECK(S) FAILED`);
process.exitCode = failed === 0 ? 0 : 1;
