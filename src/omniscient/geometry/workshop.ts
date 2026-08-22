/**
 * Workshop fittings and floor clutter.
 *
 * Split out of `props.ts` rather than added to it, because that file is the HERO kit - the
 * bench, the transmitter, the shelf: things a request is about, built to be looked at
 * closely and to survive the certainty law pulling them around. Everything here is the
 * opposite job. None of it is evidence, none of it is ever named in dialogue, and its
 * entire brief is that Mirela's corner should look like somebody's actual workplace instead
 * of a diorama with three objects in it.
 *
 * ## The rule these are built against
 *
 * §186 - composition before clutter - and §274, which cuts any decoration that does not
 * carry a clue, say who works here, or build depth. Everything below is doing the middle
 * one, and the way it earns its place is SILHOUETTE. At four metres, through a pixelating
 * post-process, on the third of the frame the console panel does not cover, none of this
 * resolves as detail. A compressor is a horizontal cylinder with a box on it and a wheel;
 * that is the whole read, and the gauge on the front is for the two frames the camera comes
 * closer. Anything whose shape is not already legible at a squint has been left out.
 *
 * ## Local space
 *
 * Same contract as `props.ts`: origin at the base, +Z toward the camera, callers position
 * the root. The batten is the exception and says so.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { createRng, jitter, range, seedFrom } from '../core/rng.js';

import type { PropParts } from './props.js';

/** Merge, or hand back a stand-in rather than null - every caller here wants a geometry. */
function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeGeometries(parts, false) ?? new THREE.BoxGeometry(0.02, 0.02, 0.02);
}

export interface BattenParams {
  /** Tube length. 1.3 is a five-foot fitting, which is what a small workshop has. */
  length?: number;
  /** Tube radius. 0.026 is a T8, the tube everybody pictures. */
  radius?: number;
}

/**
 * A fluorescent batten: steel channel, bare tube, end caps, and the conduit feeding it.
 *
 * ## Why a bare tube and not a diffuser
 *
 * A covered fitting is a soft rectangle and reads as a ceiling in an office. Bare tube in a
 * steel channel is what is screwed to the wall of every workshop, garage and outbuilding
 * anybody has ever been in, and it is the one lighting fixture whose silhouette survives
 * being twenty pixels long: a bright line with two dark stops at the ends.
 *
 * The end caps are not decoration. A tube with nothing at its ends is a glowing stick; the
 * two dark blocks are what turn it into a fitting, and they cost four triangles each.
 *
 * ## The conduit
 *
 * Runs from the far end back toward the wall corner, on saddles. It is here because a light
 * with no visible feed is a light that was placed, and because this mission is ABOUT where
 * the power in this building goes - `shared_power_feed` is one of the three facts it can
 * teach. The conduit does not claim a route or answer anything; it says the question is a
 * reasonable one to be asking in this room.
 *
 * ## Local space, and why this one is different
 *
 * Built lying along **+Z** with the wall at **-X**, i.e. already oriented for a fitting on
 * a left-hand wall, origin at the tube's centre rather than at a base. A batten has no base
 * - it hangs off a wall - and giving it a floor-relative origin would mean every caller
 * doing the same subtraction.
 */
export function createFluorescentBatten(params: BattenParams = {}): PropParts {
  const length = params.length ?? 1.3;
  const radius = params.radius ?? 0.026;

  const fittings: THREE.BufferGeometry[] = [];
  const recesses: THREE.BufferGeometry[] = [];

  // The channel: a shallow steel tray the tube sits under, standing off the wall.
  const channel = new THREE.BoxGeometry(0.052, 0.07, length + 0.12);
  channel.translate(-0.055, 0.045, 0);
  fittings.push(channel);

  /*
   * Two feet holding the channel off the wall.
   *
   * A batten screwed flat to plaster reads as a stripe painted on it. The 3cm gap is what
   * puts a shadow line behind the fitting, and a shadow line is the whole difference
   * between something ON the wall and something IN it.
   */
  for (const sz of [-1, 1]) {
    const foot = new THREE.BoxGeometry(0.03, 0.05, 0.05);
    foot.translate(-0.088, 0.045, sz * (length * 0.34));
    fittings.push(foot);
  }

  // The tube.
  const tube = new THREE.CylinderGeometry(radius, radius, length, 8, 1);
  tube.rotateX(Math.PI / 2);

  // The caps, and they are what make it a fitting rather than a stick.
  for (const sz of [-1, 1]) {
    const cap = new THREE.CylinderGeometry(radius * 1.5, radius * 1.5, 0.055, 8, 1);
    cap.rotateX(Math.PI / 2);
    cap.translate(0, 0, sz * (length / 2 + 0.018));
    recesses.push(cap);
  }

  /*
   * Conduit off the +Z end, on two saddles.
   *
   * 22mm, which is the size that reads as electrical rather than as plumbing, and it stops
   * short rather than reaching anything - it leaves the frame before it has to commit to
   * where the supply comes from, which is the honest position for a room the machine is
   * inferring rather than one it has been shown.
   *
   * It ran the OTHER way for one build, off the -Z end toward the corner, and that version
   * finished two thirds of a metre outside the building. Nothing on screen would have shown
   * it: the back wall stands between that stretch of pipe and every camera in the room, so
   * the fault renders as a conduit that simply ends, which is what it was meant to look like
   * anyway. `scripts/shop-fittings.ts` printed the bounding box and the z reached -2.5 in a
   * room whose back wall is at -1.825.
   *
   * +Z is also the better direction on its own merits. It runs toward the shop door, which
   * is where the light in this room already comes from and the only place a supply could
   * plausibly arrive from, and it leaves frame on the way.
   */
  const RUN = 0.62;
  const START = length / 2 + 0.03;
  const drop = new THREE.CylinderGeometry(0.011, 0.011, 0.09, 6);
  drop.translate(-0.055, 0.09, START);
  fittings.push(drop);

  const run = new THREE.CylinderGeometry(0.011, 0.011, RUN, 6);
  run.rotateX(Math.PI / 2);
  run.translate(-0.055, 0.13, START + RUN / 2);
  fittings.push(run);

  for (const t of [0.3, 0.8]) {
    const saddle = new THREE.BoxGeometry(0.026, 0.03, 0.016);
    saddle.translate(-0.055, 0.13, START + RUN * t);
    fittings.push(saddle);
  }

  return {
    body: tube,
    fittings: merged(fittings),
    recesses: merged(recesses),
    anchors: {
      /*
       * Three sample points along the tube, not one and not two.
       *
       * A tube is a LINE source and a single point in the middle of it is a bulb - the
       * giveaway is the falloff, which arrives as one round pool under the centre where a
       * strip light lays down a long even one. Sampling the line with a few cheap points is
       * the standard dodge, and the only question is how many and how far apart.
       *
       * TWO was wrong, and it was wrong on screen rather than on paper. Points at the
       * quarters, 24cm off the wall, put two round pools on the plaster with a visible dark
       * notch between them - which does not read as a strip light badly approximated, it
       * reads as two spotlights, and two spotlights on a wall are a stranger object than
       * the thing being avoided. Caught in a capture; no amount of arithmetic was going to
       * predict where the pools stopped overlapping.
       *
       * Three at 30% spacing and pushed to 30cm fixes both halves. The extra point fills
       * the notch, and the extra distance widens every pool so they overlap instead of
       * meeting - a pool is about as wide as the light is far from the surface, so moving
       * out is worth more here than adding lamps.
       *
       * That distance is load-bearing in the other direction too. A point light ON the tube
       * is 10cm from the plaster behind it, and at any decay worth using, 10cm means the
       * inverse-square term arrives as a number forty times the room's - a white blowout
       * the size of the fitting, on the one wall the frame has nothing else on. Pushed
       * forward it lights the room the tube is in instead of the surface it is bolted to.
       *
       * Note this is three SAMPLES of one practical, not three practicals. §187 asks for
       * one key and controlled practicals, and the count that matters to that rule is how
       * many things in the room appear to be making light - which is still one.
       */
      lampA: new THREE.Vector3(0.3, 0, -length * 0.3),
      lampB: new THREE.Vector3(0.3, 0, 0),
      lampC: new THREE.Vector3(0.3, 0, length * 0.3),
    },
  };
}

export interface TinSpec {
  /** Base centre, in the cluster's local space. */
  at: THREE.Vector3;
  radius?: number;
  height?: number;
  /** Lying on its side, rolled to this heading in radians. `null` for upright. */
  tipped?: number | null;
  /** A wire bail, which is what makes a cylinder read as a paint tin rather than a can. */
  handle?: boolean;
  /** Lid off and lying beside it. Only meaningful upright. */
  openLid?: boolean;
}

/**
 * Tins.
 *
 * ## Why they are worth the triangles
 *
 * A cylinder the size of a fist is the cheapest object in this game that a player will name
 * without being told. That matters more than it sounds: everything else on this side of the
 * room is a box, a plank or a shelf, and a floor of boxes reads as a placeholder however
 * carefully it is lit. One recognisable everyday object turns the same corner into a place.
 *
 * ## The rims are the whole thing
 *
 * A bare cylinder is a can only if you already believe it. What identifies a tin is the
 * rolled rim standing slightly proud at each end, because that is the only part of it that
 * catches a light differently from the body. Two rings, each three per cent wider than the
 * can - that read survives all the way down to eight pixels, and without them these are
 * pegs.
 *
 * ## One of them is lying down
 *
 * Deliberate, and it is the reason to have a `tipped` field at all. Objects that are all
 * upright read as arranged; one on its side reads as dropped, and dropped is what says
 * somebody uses this floor rather than dresses it. In Mirela's corner it does a second job,
 * because the floor there floods - a tin lying in the water is the flood having moved
 * something, which is a stronger statement than the stain on the wall and is made by an
 * object the player already understands.
 */
export function createTins(specs: readonly TinSpec[], seedKey = 'tins'): PropParts {
  const rng = createRng(seedFrom(seedKey));
  const body: THREE.BufferGeometry[] = [];
  const fittings: THREE.BufferGeometry[] = [];

  for (const spec of specs) {
    const r = spec.radius ?? 0.045;
    const h = spec.height ?? 0.11;
    const tipped = spec.tipped ?? null;

    const can = new THREE.CylinderGeometry(r, r, h, 10, 1);
    can.translate(0, h / 2, 0);
    const rings: THREE.BufferGeometry[] = [];
    for (const t of [0.012, h - 0.012]) {
      const rim = new THREE.CylinderGeometry(r * 1.03, r * 1.03, 0.012, 10, 1);
      rim.translate(0, t, 0);
      rings.push(rim);
    }

    if (spec.handle) {
      /*
       * The bail, as a half torus across the top. A tin with a handle is a paint or
       * solvent tin rather than a food can, which is the right object for a workshop -
       * and it is the one piece of detail here that changes what the thing IS rather
       * than how well it reads.
       */
      const bail = new THREE.TorusGeometry(r * 0.94, 0.004, 4, 10, Math.PI);
      bail.rotateY(jitter(rng, 0.5));
      bail.translate(0, h + 0.002, 0);
      rings.push(bail);
    }

    const place = (geometry: THREE.BufferGeometry): THREE.BufferGeometry => {
      if (tipped !== null) {
        // Onto its side, then rolled - so the seam is not in the same place on every tin.
        geometry.translate(0, -h / 2, 0);
        geometry.rotateZ(Math.PI / 2);
        geometry.rotateY(tipped);
        geometry.translate(0, r, 0);
      }
      geometry.translate(spec.at.x, spec.at.y, spec.at.z);
      return geometry;
    };

    body.push(place(can));
    for (const ring of rings) fittings.push(place(ring));

    if (spec.openLid === true && tipped === null) {
      // Off, and lying flat where it was put down, which is never quite beside the tin.
      const lid = new THREE.CylinderGeometry(r * 1.04, r * 1.04, 0.008, 10, 1);
      lid.rotateX(jitter(rng, 0.06));
      lid.translate(
        spec.at.x + range(rng, 0.07, 0.13) * (rng() < 0.5 ? -1 : 1),
        spec.at.y + 0.004,
        spec.at.z + jitter(rng, 0.08)
      );
      fittings.push(lid);
    }
  }

  return {
    body: merged(body),
    fittings: merged(fittings),
    anchors: { origin: new THREE.Vector3() },
  };
}

/**
 * A small workshop compressor: horizontal receiver, motor, pulley, handle, wheels.
 *
 * ## Why a compressor and not any other machine
 *
 * It has to be identifiable in silhouette from four metres, and it has to belong to a person
 * who repairs radios. A compressor passes both. Its outline - a lying-down cylinder with a
 * box on top and a wheel at one end - is unlike anything else in this game, so it never gets
 * confused with the crates and the bench; and compressed air is what an electronics bench
 * actually uses, to blow dust out of a set before you can see what is wrong with it. It is
 * the machine that would be here.
 *
 * A lathe or a pillar drill would read as a different trade. A generator would be a claim
 * about the power supply, and the power supply is the thing the player is supposed to be
 * working out.
 *
 * ## What is load-bearing
 *
 * The tank, the motor and the flywheel, in that order. The gauge, the feet and the outlet
 * exist for the two seconds the `workshop-floor` camera is nearer, and if any of them were
 * cut the machine would still read. The handle is the exception to that: it is a thin bent
 * bar with the wall behind it, and thin bars against a flat field are most of what stops a
 * dark object becoming a blob.
 */
export function createCompressor(): PropParts {
  const body: THREE.BufferGeometry[] = [];
  const fittings: THREE.BufferGeometry[] = [];
  const recesses: THREE.BufferGeometry[] = [];

  const TANK_R = 0.13;
  const TANK_L = 0.66;
  const AXIS = 0.2;

  // The receiver, lying along Z with domed ends.
  const tank = new THREE.CylinderGeometry(TANK_R, TANK_R, TANK_L, 12, 1);
  tank.rotateX(Math.PI / 2);
  tank.translate(0, AXIS, 0);
  body.push(tank);
  for (const sz of [-1, 1]) {
    const dome = new THREE.SphereGeometry(TANK_R, 10, 6);
    dome.scale(1, 1, 0.5);
    dome.translate(0, AXIS, sz * (TANK_L / 2));
    body.push(dome);
  }

  // Saddle feet, so it stands on the floor instead of hovering over it.
  for (const sz of [-1, 1]) {
    const foot = new THREE.BoxGeometry(0.2, AXIS - TANK_R + 0.01, 0.05);
    foot.translate(0, (AXIS - TANK_R) / 2, sz * (TANK_L * 0.32));
    recesses.push(foot);
  }

  // The motor, sitting on top and offset toward one end, as they always are.
  const motor = new THREE.BoxGeometry(0.19, 0.16, 0.22);
  motor.translate(0, AXIS + TANK_R + 0.08, -0.08);
  body.push(motor);
  const canister = new THREE.CylinderGeometry(0.075, 0.075, 0.19, 10, 1);
  canister.rotateZ(Math.PI / 2);
  canister.translate(0, AXIS + TANK_R + 0.08, 0.1);
  body.push(canister);

  /*
   * The flywheel, proud of the motor on the room side.
   *
   * The single most identifying part after the tank, and the reason it faces +X is that the
   * wall is at -X: a wheel pointing into a wall is a disc nobody can see, and a disc is the
   * only shape on this machine that is not a box or a cylinder.
   */
  const wheel = new THREE.CylinderGeometry(0.105, 0.105, 0.022, 14, 1);
  wheel.rotateZ(Math.PI / 2);
  wheel.translate(0.115, AXIS + TANK_R + 0.08, -0.08);
  fittings.push(wheel);
  const hub = new THREE.CylinderGeometry(0.03, 0.03, 0.045, 8, 1);
  hub.rotateZ(Math.PI / 2);
  hub.translate(0.125, AXIS + TANK_R + 0.08, -0.08);
  fittings.push(hub);

  // Gauge and outlet, on the end that faces the room.
  const gauge = new THREE.CylinderGeometry(0.028, 0.028, 0.02, 10, 1);
  gauge.rotateX(Math.PI / 2);
  gauge.translate(0.045, AXIS + TANK_R + 0.01, TANK_L / 2 + 0.02);
  fittings.push(gauge);
  const outlet = new THREE.CylinderGeometry(0.012, 0.012, 0.07, 6, 1);
  outlet.rotateX(Math.PI / 2);
  outlet.translate(-0.04, AXIS + TANK_R * 0.4, TANK_L / 2 + 0.04);
  fittings.push(outlet);

  /*
   * The handle: two uprights and a bar, hooping over the motor.
   *
   * Reads at any distance because it is the only part of the machine with the wall showing
   * through it rather than behind it.
   */
  for (const sx of [-1, 1]) {
    const post = new THREE.CylinderGeometry(0.009, 0.009, 0.24, 6);
    post.translate(sx * 0.085, AXIS + TANK_R + 0.06, -0.24);
    fittings.push(post);
  }
  const bar = new THREE.CylinderGeometry(0.009, 0.009, 0.17, 6);
  bar.rotateZ(Math.PI / 2);
  bar.translate(0, AXIS + TANK_R + 0.18, -0.24);
  fittings.push(bar);

  // Two small wheels at the handle end, which is how these are actually moved.
  for (const sx of [-1, 1]) {
    const roller = new THREE.CylinderGeometry(0.055, 0.055, 0.03, 10, 1);
    roller.rotateZ(Math.PI / 2);
    roller.translate(sx * 0.11, 0.055, -TANK_L * 0.34);
    recesses.push(roller);
  }

  return {
    body: merged(body),
    fittings: merged(fittings),
    recesses: merged(recesses),
    anchors: { outlet: new THREE.Vector3(-0.04, AXIS + TANK_R * 0.4, TANK_L / 2 + 0.07) },
  };
}

/**
 * A hank of cable hung on a nail.
 *
 * ## This was a cable drum, and the drum lost on measurement
 *
 * The first version was a floor-standing drum, and its argument still holds: the left of
 * this frame is a wall, a floor and three rectangles, and one big CIRCLE does more to stop
 * that corner reading as a stack of boxes than three more boxes would. What killed it was
 * where it had to stand. Projecting the shop's default shot leaves about 85cm of visible
 * floor between the tins and the left edge of frame, the compressor wants 66 of it, and a
 * 64cm drum pushed anywhere else landed off frame at every aspect ratio from 4:3 to 21:9 -
 * a well-built object nobody would ever see.
 *
 * The circle was the point, not the drum. Hung on the wall it costs no floor at all, and it
 * lands on the one part of this frame that genuinely had nothing in it: the blank metre of
 * plaster between the batten and the floor.
 *
 * ## Why it is not round
 *
 * A coil hanging on a nail sags into a teardrop, and that is most of what says HANGING
 * rather than painted on. Three turns rather than one, at slightly different radii and
 * offsets, because a single ring is a hoop - the turns crossing each other are what make it
 * cable.
 *
 * Built in the YZ plane with its normal on +X, i.e. already oriented for a left-hand wall,
 * origin AT THE NAIL. A hung object has no base, and the nail is the thing a caller is
 * actually placing.
 */
export function createCableCoil(seedKey = 'coil', radius = 0.17): PropParts {
  const rng = createRng(seedFrom(seedKey));
  const body: THREE.BufferGeometry[] = [];
  const fittings: THREE.BufferGeometry[] = [];

  for (let i = 0; i < 3; i++) {
    const r = radius * (1 - i * 0.11);
    const turn = new THREE.TorusGeometry(r, 0.016, 5, 14);
    // Into the wall plane, then stretched downward into the sag.
    turn.rotateY(Math.PI / 2);
    turn.scale(1, 1.18, 1);
    turn.translate(jitter(rng, 0.012), -r * 1.18 + jitter(rng, 0.01), jitter(rng, 0.035));
    body.push(turn);
  }

  /*
   * A tail off the bottom of the hank, so it is not a closed shape.
   *
   * In `body` with the turns rather than in `fittings`, because it is the same cable and
   * the two lists are two MATERIALS, not two levels of importance. The only thing in
   * `fittings` here is the nail, which is the one part of this that is steel.
   */
  const tail = new THREE.TorusGeometry(0.075, 0.014, 5, 10, Math.PI * 0.8);
  tail.rotateY(Math.PI / 2);
  tail.rotateX(Math.PI * 0.25);
  tail.translate(0.01, -radius * 2.3, 0.05);
  body.push(tail);

  const nail = new THREE.CylinderGeometry(0.007, 0.007, 0.05, 6);
  nail.rotateZ(Math.PI / 2);
  nail.translate(-0.02, 0, 0);
  fittings.push(nail);

  return {
    body: merged(body),
    fittings: merged(fittings),
    anchors: { nail: new THREE.Vector3() },
  };
}
