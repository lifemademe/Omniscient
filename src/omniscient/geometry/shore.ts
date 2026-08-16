/**
 * Where the water ends and the land begins - as one function, read by four things.
 *
 * ## Why this is its own file
 *
 * A shoreline is not a property of water. It is the agreement between the water, the
 * ground, the sand and the planting about where each of them stops, and the moment any two
 * of them disagree the illusion is over: grass growing into the sea, a foam line that does
 * not follow the beach, sand that ends in a straight cut while the water wanders.
 *
 * So the line is defined once here, in TypeScript for placement and GLSL for shading, and
 * everything else asks it. Same discipline as the meadow's density field and for the same
 * reason - two readings of one truth, never two truths.
 *
 * ## Why it wanders
 *
 * A plane's edge is straight and nothing in a landscape is. The waterline is therefore the
 * base line plus a wandering offset built from two waves at different wavelengths: a long
 * one that makes bays and headlands, and a short one that stops the long one looking like a
 * sine curve. It is deliberately not noise - a shoreline has a grain to it, and smooth
 * sweeping curves read as coast where value noise reads as damage.
 */

/** Base waterline, in world z. Land is toward the camera from here; water is beyond it. */
export const SHORE_Z = -13.5;

/** How far the line wanders either side of the base, in metres. */
export const SHORE_WANDER = 3.4;

/**
 * Signed distance from the waterline, in metres. Positive is out into the water.
 *
 * Exported so the meadow can refuse to plant grass below zero, the ground can decide where
 * it is sand, and the water can find its own foam.
 */
export function shoreDepth(x: number, z: number): number {
  const wander =
    Math.sin(x * 0.085) * 1.0 + Math.sin(x * 0.21 + 1.7) * 0.42 + Math.sin(x * 0.043 - 0.9) * 0.7;
  return SHORE_Z + wander * SHORE_WANDER * 0.5 - z;
}

/** The same line in GLSL. Kept beside its twin so the two cannot drift apart unseen. */
export const SHORE_GLSL = /* glsl */ `
const float SHORE_Z = ${SHORE_Z.toFixed(2)};
const float SHORE_WANDER = ${SHORE_WANDER.toFixed(2)};
float shoreDepth(vec2 p) {
  float wander = sin(p.x * 0.085) * 1.0
               + sin(p.x * 0.21 + 1.7) * 0.42
               + sin(p.x * 0.043 - 0.9) * 0.7;
  return SHORE_Z + wander * SHORE_WANDER * 0.5 - p.y;
}
`;
