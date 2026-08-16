/**
 * District 07, built once, and the only place it is built.
 *
 * ## Why this file exists
 *
 * Three things need to agree about this district: the diorama that draws it, the mission
 * that sets a puzzle in it, and the chase that follows a car across it. Each of them was
 * generating its own copy from the same seed, which sounds identical and is not - the
 * generators draw from a shared random stream, so calling them in a different ORDER
 * produces a different district. The scene built the city and then the traffic; the
 * mission built only the traffic. The suspect was consequently in one place on the map and
 * another in the evidence, and nothing said so because the diorama draws every trace the
 * same and never points at the guilty one.
 *
 * That is the same class of bug as two copies of a colour or a hand-retyped coordinate,
 * and it has bitten this project three times now. So: one seed, one order, one district,
 * imported by everybody.
 *
 * ## Why it is content rather than geometry
 *
 * Because the arrangement is authored. The size, the traffic count and the fact that the
 * chase starts where the evidence says the car was last seen are decisions about a
 * mission, not properties of a city generator - and the generator stays reusable for the
 * next district precisely because those choices live here instead of inside it.
 */

import { createRng, seedFrom } from '../core/rng.js';
import { wireCity } from '../geometry/wireCity.js';
import { planTrail } from '../mission/breadcrumbs.js';
import { planPursuit } from '../mission/pursuit.js';
import { planFleet } from '../mission/traces.js';

/** Cells per side. The trace device, the city and the chase all use this number. */
export const DISTRICT_SIZE = 24;

/** How much traffic the network is carrying. Enough to be a crowd, few enough to draw. */
const TRAFFIC = 180;

/**
 * One stream, drawn in a fixed order.
 *
 * City first, because the chase needs its cameras; then the traffic, which places the
 * suspect; then the chase, which starts where the suspect was last seen. Changing this
 * order changes the district, so it is written down rather than left to whoever edits
 * next.
 */
const rng = createRng(seedFrom('district-07'));

export const DISTRICT_CITY = wireCity(rng, { size: DISTRICT_SIZE });

export const DISTRICT_FLEET = planFleet(rng, TRAFFIC, DISTRICT_SIZE);

/**
 * The chase, starting from the suspect's own last known position.
 *
 * Read off the fleet rather than retyped - the audit script learned that the hard way,
 * having gone on reporting zero hops against a coordinate the game had stopped using.
 */
export const DISTRICT_PURSUIT: ReturnType<typeof planPursuit> = planPursuit(rng, {
  cameras: DISTRICT_CITY.cameras,
  start: DISTRICT_FLEET.suspect.cell,
  heading: DISTRICT_FLEET.evidence.heading ?? 'east',
  size: DISTRICT_SIZE,
});

/**
 * The cold trail, starting exactly where the cameras gave out.
 *
 * Phase three is not a new situation, it is the consequence of phase two - so its starting
 * point is read off the pursuit rather than authored beside it. If the chase ever ends
 * somewhere else, the breadcrumbs move with it and cannot be left describing a corner of
 * the district the car never reached.
 */
export const DISTRICT_TRAIL = planTrail(rng, {
  from: DISTRICT_PURSUIT.lost,
  heading: DISTRICT_PURSUIT.lostHeading,
  size: DISTRICT_SIZE,
});
