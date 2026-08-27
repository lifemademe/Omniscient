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

/**
 * A weighted-base articulated bench lamp for Mirela's repair table.
 *
 * ## Why this shape
 *
 * The repair shop already has boxes, cylinders and flat panels. Another compact appliance
 * would disappear into that vocabulary, while the long broken line of an anglepoise arm
 * reads as a task lamp at the room camera before its shade resolves. Two parallel struts,
 * three round pivots and a broad open shade are the identifying features; everything else
 * is there to make it feel used rather than staged.
 *
 * ## No light belongs to this asset
 *
 * This builds geometry only. The scene may use an existing practical to light the bench,
 * but the prop owns no LightNode, emissive surface or exposure change. That keeps a dressing
 * request from silently rewriting the room's carefully measured value structure.
 *
 * Local origin is the centre of the weighted base on the table surface. The arm reaches
 * toward -X and +Z so a caller can park it at the rear-right corner of a bench and let the
 * shade lean inward over the work without rotating the whole prop.
 */
export function createBenchLamp(): PropParts {
  const body: THREE.BufferGeometry[] = [];
  const fittings: THREE.BufferGeometry[] = [];
  const recesses: THREE.BufferGeometry[] = [];
  // Split from `body` so the base can cast a shadow while the shade above it does not.
  const pedestal: THREE.BufferGeometry[] = [];

  const UP = new THREE.Vector3(0, 1, 0);
  const DOWN = new THREE.Vector3(0, -1, 0);
  const FORWARD = new THREE.Vector3(0, 0, 1);

  const rodBetween = (
    from: THREE.Vector3,
    to: THREE.Vector3,
    radius: number,
    sides = 7
  ): THREE.BufferGeometry => {
    const direction = to.clone().sub(from);
    const length = direction.length();
    direction.normalize();
    const rod = new THREE.CylinderGeometry(radius, radius, length, sides, 1);
    rod.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, direction));
    rod.translate(
      (from.x + to.x) / 2,
      (from.y + to.y) / 2,
      (from.z + to.z) / 2
    );
    return rod;
  };

  // A low two-step casting: heavy enough to counter the reach, small enough to leave a
  // useful patch of bench around it. The dark rubber pad is proud by 2mm so it does not
  // z-fight the enamel above it.
  const rubberPad = new THREE.CylinderGeometry(0.122, 0.122, 0.008, 14, 1);
  rubberPad.translate(0, 0.004, 0);
  recesses.push(rubberPad);

  const base = new THREE.CylinderGeometry(0.115, 0.128, 0.03, 14, 1);
  base.translate(0, 0.022, 0);
  pedestal.push(base);
  const baseCap = new THREE.CylinderGeometry(0.095, 0.112, 0.025, 14, 1);
  baseCap.translate(0, 0.048, 0);
  pedestal.push(baseCap);

  // A real switch, not a glowing status jewel. It sits where a hand can find it without
  // reaching beneath the shade and stays in the dark material even under the warm key.
  const toggle = new THREE.CylinderGeometry(0.012, 0.012, 0.024, 7, 1);
  toggle.rotateZ(0.24);
  toggle.translate(0.055, 0.071, 0.018);
  recesses.push(toggle);

  const shoulder = new THREE.Vector3(0, 0.095, 0);
  const elbow = new THREE.Vector3(-0.14, 0.36, 0.045);
  const wrist = new THREE.Vector3(-0.45, 0.58, 0.18);
  const neck = new THREE.Vector3(-0.49, 0.6, 0.22);

  // Two struts per section are what makes this an articulated counterbalanced lamp rather
  // than a bent pipe. Their separation survives the pixel pass as a sliver of daylight.
  for (const zOffset of [-0.022, 0.022]) {
    const offset = new THREE.Vector3(0, 0, zOffset);
    fittings.push(
      rodBetween(shoulder.clone().add(offset), elbow.clone().add(offset), 0.009)
    );
    fittings.push(rodBetween(elbow.clone().add(offset), wrist.clone().add(offset), 0.009));
  }
  fittings.push(rodBetween(wrist, neck, 0.014, 8));

  // Circular knuckles hold the arm together and break the four thin bars into a machine.
  for (const [point, radius] of [
    [shoulder, 0.032],
    [elbow, 0.037],
    [wrist, 0.032],
  ] as const) {
    const joint = new THREE.CylinderGeometry(radius, radius, 0.058, 12, 1);
    joint.rotateX(Math.PI / 2);
    joint.translate(point.x, point.y, point.z);
    fittings.push(joint);
  }
  fittings.push(rodBetween(new THREE.Vector3(0, 0.055, 0), shoulder, 0.018, 9));

  // A short exposed tension link follows the lower arm. It is deliberately straight—not
  // a tiny helix whose only result at gameplay distance would be shimmering line noise.
  fittings.push(
    rodBetween(
      shoulder.clone().add(new THREE.Vector3(-0.025, 0.035, 0.034)),
      elbow.clone().add(new THREE.Vector3(0.025, -0.035, 0.034)),
      0.004,
      6
    )
  );

  // The shade is a truncated enamel cone, not a pointed cone. Its axis aims toward the
  // centre of the repair job. A dark inset disc provides readable depth without an emissive
  // bulb or a double-sided bespoke material.
  const shadeDirection = new THREE.Vector3(-0.73, -0.67, 0.09).normalize();
  const shadeLength = 0.155;
  const shadeOpening = neck.clone().add(shadeDirection.clone().multiplyScalar(shadeLength));
  const shadeCentre = neck.clone().add(shadeDirection.clone().multiplyScalar(shadeLength / 2));
  const shadeRotation = new THREE.Quaternion().setFromUnitVectors(DOWN, shadeDirection);

  const shade = new THREE.CylinderGeometry(0.04, 0.108, shadeLength, 14, 1, true);
  shade.applyQuaternion(shadeRotation);
  shade.translate(shadeCentre.x, shadeCentre.y, shadeCentre.z);
  body.push(shade);

  const rearCap = new THREE.CylinderGeometry(0.043, 0.043, 0.03, 12, 1);
  rearCap.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, shadeDirection));
  rearCap.translate(
    neck.x + shadeDirection.x * 0.012,
    neck.y + shadeDirection.y * 0.012,
    neck.z + shadeDirection.z * 0.012
  );
  body.push(rearCap);

  const rim = new THREE.TorusGeometry(0.108, 0.007, 5, 16);
  rim.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(FORWARD, shadeDirection));
  rim.translate(shadeOpening.x, shadeOpening.y, shadeOpening.z);
  fittings.push(rim);

  const interior = new THREE.CircleGeometry(0.092, 14);
  interior.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(FORWARD, shadeDirection));
  const inset = shadeOpening.clone().addScaledVector(shadeDirection, -0.012);
  interior.translate(inset.x, inset.y, inset.z);
  recesses.push(interior);

  // The cloth lead exits behind the base, crosses the last centimetres of the top, then
  // drops out of sight beyond the rear edge. A fixture with no visible feed looks placed;
  // this one belongs to the same compromised electrical shop as the rest of the scene.
  const lead = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.065, 0.018, -0.015),
    new THREE.Vector3(0.11, 0.012, -0.07),
    new THREE.Vector3(0.08, 0.005, -0.145),
    new THREE.Vector3(0.035, -0.11, -0.19),
  ]);
  recesses.push(new THREE.TubeGeometry(lead, 9, 0.006, 5, false));

  return {
    body: merged(body),
    pedestal: merged(pedestal),
    fittings: merged(fittings),
    recesses: merged(recesses),
    anchors: {
      base: new THREE.Vector3(),
      shade: neck.clone(),
      opening: shadeOpening,
    },
  };
}

/** What a thing on a pegboard is. Each one is a different SILHOUETTE, which is the point. */
export type ToolKind =
  | 'spanner'
  | 'screwdriver'
  | 'pliers'
  | 'hacksaw'
  | 'hammer'
  | 'file'
  | 'coil';

export interface ToolSpec {
  /** The peg, in the board's plane. The tool hangs down from here. */
  x: number;
  y: number;
  kind: ToolKind;
  /** Overall length. Left off, each kind takes a sensible one. */
  length?: number;
  /** Bar thickness. Drives every other dimension of the tool. */
  width?: number;
  /** Radians off vertical. Nothing on a pegboard hangs straight. */
  lean?: number;
}

/**
 * The tools on Mirela's wall.
 *
 * ## Why these are worth building properly
 *
 * §131 puts the burden of evidence on the environment, and the note on the pegboard calls
 * this wall the thing the player READS - it is the only statement in the game about what
 * Mirela does with her hands, and it sits directly behind her head in the shot every player
 * sees first. What was there was five rectangles with a small hook on top. Not bad tools:
 * not tools. Five identical dark bars say "there is stuff on that wall" and stop.
 *
 * ## The rule every one of these is built to
 *
 * ONE distinguishing feature, carried by the outline, and nothing else. Projected through
 * the shop's registered shot these are 15 to 25 pixels tall, behind a pixelating
 * post-process. Hatching, jaw serrations and handle grips are all invisible at that size and
 * all cost triangles, so none of them are here. What survives is shape:
 *
 *   spanner      a RING at the top and a fork at the bottom
 *   screwdriver  fat for its top third, thin for the rest
 *   pliers       splayed at the top, pinched in the middle, a point at the bottom
 *   hacksaw      a closed rectangle - the only outline on the wall with a hole in it
 *   hammer       a T
 *   file         a taper, and the only tool with no features at all
 *
 * They are readable apart at a squint, which five bars were not, and that is the whole
 * upgrade. A player never names them; they come away knowing the wall has TOOLS on it rather
 * than shapes, and that is the difference between a workshop and a set dressed like one.
 *
 * ## Local space
 *
 * Built in the XY plane facing +Z, origin AT THE PEG with the tool hanging below it - so a
 * caller places pegs and the tools follow, which is how the wall is actually laid out.
 */
export function createHandTools(specs: readonly ToolSpec[], seedKey = 'tools'): PropParts {
  const rng = createRng(seedFrom(seedKey));
  const body: THREE.BufferGeometry[] = [];
  const fittings: THREE.BufferGeometry[] = [];

  for (const spec of specs) {
    const w = spec.width ?? 0.032;
    const L = spec.length ?? 0.32;
    const d = w * 0.7;
    const lean = spec.lean ?? jitter(rng, 0.08);
    const parts: THREE.BufferGeometry[] = [];

    /** A box hanging in the tool's own space: centre at (x, y), y measured DOWN from the peg. */
    const bar = (bx: number, down: number, bw: number, bh: number, bd = d): THREE.BufferGeometry => {
      const g = new THREE.BoxGeometry(bw, bh, bd);
      g.translate(bx, -down, 0);
      return g;
    };

    switch (spec.kind) {
      case 'spanner': {
        /*
         * Hung by its ring, which is both how a combination spanner lives on a board and the
         * only reason this shape survives being twenty pixels tall: a circle at the top of a
         * stick is unmistakable, and nothing else on this wall has one.
         */
        const ring = new THREE.TorusGeometry(w * 0.92, w * 0.3, 4, 12);
        ring.translate(0, -w * 0.92, 0);
        parts.push(ring);
        parts.push(bar(0, L * 0.55, w * 0.6, L - w * 2.6));
        /*
         * The open end. The GAP is the feature, and the first version did not have one: a
         * stub w*1.9 wide with prongs at ±w*0.62 left about a third of a prong of daylight
         * between them, which at this size is no daylight at all - it rendered as a solid
         * rectangle and the tool read as a lollipop. Prongs further out and a shallower stub
         * open a slot as wide as a prong, which is what survives the distance.
         */
        parts.push(bar(0, L - w * 0.55, w * 2.1, w * 0.5));
        for (const sx of [-1, 1]) parts.push(bar(sx * w * 0.8, L - w * 1.55, w * 0.5, w * 1.4));
        break;
      }

      case 'screwdriver': {
        // Fat top third, thin below. The proportion IS the tool.
        const handle = new THREE.CylinderGeometry(w * 1.05, w * 0.82, L * 0.28, 8);
        handle.translate(0, -L * 0.14, 0);
        parts.push(handle);
        /*
         * A third of the length rather than a third and a bit, and fatter for it. At L*0.34
         * the handle was long enough to read as a bottle; the proportion that says
         * screwdriver is a stubby grip and a long thin blade, and the ratio matters more
         * than either number.
         */
        const shaft = new THREE.CylinderGeometry(w * 0.19, w * 0.19, L * 0.62, 6);
        shaft.translate(0, -L * 0.6, 0);
        parts.push(shaft);
        parts.push(bar(0, L * 0.94, w * 0.55, L * 0.09, d * 0.5));
        break;
      }

      case 'pliers': {
        /*
         * Splayed handles, a pivot, converging jaws. Hung by one handle, so the pair is a
         * little off vertical on its own before the lean is applied - which is exactly what
         * a pair of pliers on a peg looks like.
         */
        for (const sx of [-1, 1]) {
          const handle = new THREE.BoxGeometry(w * 0.5, L * 0.5, d);
          handle.rotateZ(sx * 0.13);
          handle.translate(sx * w * 0.5, -L * 0.25, 0);
          parts.push(handle);
        }
        const pivot = new THREE.CylinderGeometry(w * 0.62, w * 0.62, d * 1.3, 8);
        pivot.rotateX(Math.PI / 2);
        pivot.translate(0, -L * 0.53, 0);
        parts.push(pivot);
        for (const sx of [-1, 1]) {
          const jaw = new THREE.BoxGeometry(w * 0.42, L * 0.42, d * 0.8);
          jaw.rotateZ(-sx * 0.16);
          jaw.translate(sx * w * 0.22, -L * 0.77, 0);
          parts.push(jaw);
        }
        break;
      }

      case 'hacksaw': {
        /*
         * The only closed outline on the wall. A shape with a hole through it reads at any
         * size, because the pegboard behind shows through it and nothing else here does that.
         */
        parts.push(bar(0, w * 0.4, w * 3.4, w * 0.55));
        for (const sx of [-1, 1]) parts.push(bar(sx * w * 1.5, L * 0.5, w * 0.45, L * 0.9));
        // The blade, thinner than the frame so the two do not read as one slab.
        parts.push(bar(0, L * 0.94, w * 3.4, w * 0.3, d * 0.45));
        break;
      }

      case 'hammer': {
        /*
         * Head across the top, claw curving DOWN off one end, shaft below. A T.
         *
         * The first version had a narrow head and a claw angled up-and-left, and the two
         * together read as a hook rather than a hammer - the eye takes the widest horizontal
         * as the head, and there was not enough of one. Wider, thicker, and the claw turned
         * over so it hangs below the head line, which is the way a claw actually sits and
         * also stops it competing with the head for the top edge.
         */
        parts.push(bar(0, w * 0.6, w * 3.0, w * 1.2, d * 1.6));
        const claw = new THREE.BoxGeometry(w * 1.1, w * 0.5, d * 1.3);
        claw.rotateZ(-0.55);
        claw.translate(-w * 1.6, -w * 1.35, 0);
        parts.push(claw);
        // Offset toward the face end, because a claw hammer's shaft is not on its centre.
        parts.push(bar(w * 0.3, L * 0.6, w * 0.55, L * 0.82));
        break;
      }

      case 'file': {
        /*
         * A taper and a tang, and deliberately the plainest thing on the board. A wall where
         * every object has a feature is a display case; one plain shape among five is what
         * makes the other five read as chosen.
         */
        parts.push(bar(0, L * 0.11, w * 0.95, L * 0.22));
        /*
         * FLAT, not diamond. A four-sided cylinder turned 45 degrees points a corner at the
         * camera, and a long tapering diamond is a spearhead - which is what this looked
         * like on the wall. Left square-on and squashed in Z it is a flat bar that narrows,
         * which is a file and nothing else.
         */
        const blade = new THREE.CylinderGeometry(w * 0.66, w * 0.22, L * 0.78, 4);
        blade.scale(1, 1, 0.42);
        blade.translate(0, -L * 0.6, 0);
        parts.push(blade);
        break;
      }

      case 'coil': {
        // Cable or tape on a peg. Kept from the original wall - it was the one that worked.
        const ring = new THREE.TorusGeometry(L * 0.5, w * 0.5, 5, 12);
        ring.translate(0, -L * 0.5, 0);
        parts.push(ring);
        break;
      }
    }

    for (const part of parts) {
      part.rotateZ(lean);
      part.translate(spec.x, spec.y, 0);
      body.push(part);
    }

    // The peg it hangs on, standing proud of the board.
    const peg = new THREE.CylinderGeometry(0.008, 0.008, 0.055, 5);
    peg.rotateX(Math.PI / 2);
    peg.translate(spec.x, spec.y + 0.008, -0.03);
    fittings.push(peg);
  }

  return {
    body: merged(body),
    fittings: merged(fittings),
    anchors: { origin: new THREE.Vector3() },
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
