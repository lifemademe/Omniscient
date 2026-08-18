/**
 * Procedural props for Contact View dioramas.
 *
 * Same doctrine as the hardware kit (§110 / §210): parameterised generators rather than
 * modelled assets. These are the objects the player actually looks at during a
 * diagnosis, so they carry the §187 requirement that hero props stay legible against a
 * painterly environment - shape reads first, detail second.
 *
 * All geometry is local-space with +Z facing the camera and the origin at the base.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { createRng, jitter, range, seedFrom } from '../core/rng.js';

export interface PropParts {
  body: THREE.BufferGeometry;
  /** Secondary material: metal fittings, brackets, cable. */
  fittings: THREE.BufferGeometry;
  /**
   * Optional third part, for anything that has to stay DARK.
   *
   * Two materials were enough while every prop sat at its authored colour. They stopped
   * being enough once the certainty law started pulling `inked` props warm: on the
   * Kestrel-3 the case, the connectors and the ventilation slots all arrive at the same
   * warm brown, and a slot that is the colour of the panel around it is not a slot, it is
   * a bar. A hole reads as a hole because it is darker than everything near it, and the
   * only way to keep that through a hue pull is to start much further down.
   */
  recesses?: THREE.BufferGeometry;
  /** Interior surfaces - dark, but lit, so things can be seen against them. */
  chassis?: THREE.BufferGeometry;
  /**
   * Named anchor points in local space, so cue handlers can attach effects or move
   * sub-objects without hard-coding coordinates in mission content.
   */
  anchors: Record<string, THREE.Vector3>;
}

/** A workbench: top, apron, four legs, and a lower shelf. */
export function createWorkbench(width = 2.4, depth = 0.9, height = 0.78): PropParts {
  const body: THREE.BufferGeometry[] = [];
  const fittings: THREE.BufferGeometry[] = [];

  const top = new THREE.BoxGeometry(width, 0.06, depth);
  top.translate(0, height, 0);
  body.push(top);

  const apron = new THREE.BoxGeometry(width - 0.1, 0.1, 0.05);
  apron.translate(0, height - 0.08, depth / 2 - 0.03);
  body.push(apron);

  for (let sx = -1; sx <= 1; sx += 2) {
    for (let sz = -1; sz <= 1; sz += 2) {
      const leg = new THREE.BoxGeometry(0.08, height, 0.08);
      leg.translate(sx * (width / 2 - 0.1), height / 2, sz * (depth / 2 - 0.1));
      fittings.push(leg);
    }
  }

  const shelf = new THREE.BoxGeometry(width - 0.3, 0.04, depth - 0.24);
  shelf.translate(0, height * 0.28, 0);
  body.push(shelf);

  return {
    body: mergeGeometries(body, false) ?? top,
    fittings: mergeGeometries(fittings, false) ?? top,
    anchors: {
      surface: new THREE.Vector3(0, height + 0.03, 0),
      left: new THREE.Vector3(-width * 0.3, height + 0.03, 0),
    },
  };
}

export interface TransmitterParams {
  seed?: number | string;
  width?: number;
  height?: number;
  depth?: number;
}

/**
 * The Kestrel-3 - Mirela's transmitter, and the object Mission 01 is entirely about.
 *
 * Built so the rear face carries a visible pair of connectors: the whole diagnosis turns
 * on the player asking to see the back of it, so that has to be a real, findable feature
 * rather than a dialogue assertion.
 */
export function createTransmitter(params: TransmitterParams = {}): PropParts {
  const seed = typeof params.seed === 'string' ? seedFrom(params.seed) : params.seed ?? 7;
  const rng = createRng(seed);
  const width = params.width ?? 0.52;
  const height = params.height ?? 0.22;
  const depth = params.depth ?? 0.34;

  const body: THREE.BufferGeometry[] = [];
  const fittings: THREE.BufferGeometry[] = [];

  /**
   * The case, solid, with a hatch-sized recess in the back.
   *
   * The last version opened the WHOLE rear face, which is a case with no back rather than
   * a case with its cover off - and the reference is unambiguous about the difference: a
   * battery compartment is a modest rectangular well let into a panel that is otherwise
   * intact, with a wide flat border all round it. That border is most of what says
   * "something unscrews here".
   *
   * Built as a body that stops short of the back, plus four frame panels bridging the gap
   * around the opening. The body keeps its box UVs so the generated map still lands on one
   * clean volume; only the frame is split, and it is a border rather than a surface, so
   * the per-panel arris wear reads as the edge of a hatch.
   */
  const BAY = { width: width * 0.52, height: height * 0.56, depth: 0.085 };

  const carcass = new THREE.BoxGeometry(width, height, depth - BAY.depth);
  carcass.translate(0, height / 2, BAY.depth / 2);
  body.push(carcass);

  {
    const sideW = (width - BAY.width) / 2;
    const capH = (height - BAY.height) / 2;
    for (const [sx, sy, dx, dy] of [
      [sideW, height, -(width - sideW) / 2, 0],
      [sideW, height, (width - sideW) / 2, 0],
      [BAY.width, capH, 0, (height - capH) / 2],
      [BAY.width, capH, 0, -(height - capH) / 2],
    ] as const) {
      const frame = new THREE.BoxGeometry(sx, sy, BAY.depth);
      frame.translate(dx, height / 2 + dy, -depth / 2 + BAY.depth / 2);
      body.push(frame);
    }
  }

  // Front panel: meter recess plus two control dials.
  const meter = new THREE.BoxGeometry(width * 0.34, height * 0.5, 0.02);
  meter.translate(-width * 0.22, height * 0.55, depth / 2 + 0.005);
  fittings.push(meter);

  for (let i = 0; i < 2; i++) {
    const dial = new THREE.CylinderGeometry(0.022, 0.02, 0.03, 8);
    dial.rotateX(Math.PI / 2);
    dial.translate(width * (0.1 + i * 0.16), height * 0.45, depth / 2 + 0.012);
    fittings.push(dial);
  }

  /**
   * Carry handle: a rectangular strap bail, running along the LONG side.
   *
   * It was a half torus of 12mm round section turned across the depth - a wire loop over
   * the short axis, which is neither how a case handle is made nor which way it goes. A
   * set is carried by its long edge so it hangs level, and the handle is a folded strap
   * with a flat section, not a rod.
   *
   * Three boxes: two stirrups and a grip. Flat stock reads as pressed steel at any size
   * and, unlike a torus, keeps a straight silhouette against the pegboard behind it.
   */
  const handle = new THREE.BoxGeometry(0.03, 0.014, 0.016);
  const bail: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1] as const) {
    const stirrup = new THREE.BoxGeometry(0.016, 0.036, 0.018);
    stirrup.translate(sx * width * 0.26, height + 0.018, -depth * 0.04);
    bail.push(stirrup);
  }
  const grip = new THREE.BoxGeometry(width * 0.52 + 0.016, 0.014, 0.024);
  grip.translate(0, height + 0.0365, -depth * 0.04);
  bail.push(grip);
  fittings.push(...bail);

  /**
   * Rear connectors, and they are sockets rather than pegs.
   *
   * They were two plain eight-sided cylinders standing out of a flat panel: no opening, no
   * collar, nothing electrical about them at all. At the range the mission actually puts
   * the camera - an inspection shot where the set fills a third of the frame - they read as
   * two dowels, while the dialogue asks the player to look at a CONNECTOR and find green
   * crust "spread right across the pins". There were no pins.
   *
   * Three parts each, which is the least that says socket: a shell, a bore that is properly
   * dark all the way in, and pins standing in the bore. Nothing is plugged into either, and
   * that is correct rather than missing - the back is off and the set is on a bench being
   * worked on. An empty socket only looks unfinished when it has no hole.
   */
  const recesses: THREE.BufferGeometry[] = [];
  /**
   * The chassis is dark but not a void.
   *
   * As a `recess` it was MAT.slot - unlit near-black - and the open bay came out as a
   * rectangle of pure nothing. That is right for a slot 5mm wide and wrong for a surface
   * 40cm across that the player is asked to look INTO and find a corroded connector on:
   * the corrosion had no ground to sit against. Its own part, so it can be dark and still
   * be a surface.
   */
  const chassis: THREE.BufferGeometry[] = [];

  /**
   * Connector height, and it is not the middle of the panel any more.
   *
   * At `height * 0.5` connector B's collar reached y 0.149 and the lowest vent sat at
   * 0.136 - so the socket was growing through the louvres, which was reported by eye
   * before it was measured. Dropped to 0.42 the collar tops out at 0.131 and clears the
   * bottom slot by 5mm.
   *
   * Down rather than moving the vents up, because vents belong high on a case - heat
   * rises, and every piece of equipment this is pretending to be puts them above the
   * connectors for that reason.
   */
  const connectorY = height * 0.42;

  /**
   * The back is off, so there is a hole where the back was.
   *
   * Mirela's first line is "I have the back off already" and the set was a closed box with
   * two plugs on the outside of it - the one thing she says about the object before the
   * player says anything was not true of the model. Asked for three times.
   *
   * Built as five thin panels rather than by hollowing the shell, and that is a texturing
   * decision as much as a modelling one: the shell carries a generated map keyed to box
   * UVs where every face owns the whole 0..1 square, so cutting the box into a shell would
   * hand each new panel a full copy of a texture built for a half-metre case and put an
   * arris wear band down every internal corner. The shell stays one clean box; the cavity
   * is a liner that sits inside it.
   *
   * The liner walls are `recesses` - unlit, so the inside of a case reads as an interior
   * rather than as five surfaces the work lamp happens to reach. A hole is dark because it
   * is a hole, and MAT.slot is the material that says so.
   */
  /**
   * The chassis, a little way into the case.
   *
   * Without it the open back looks all the way through to the inside of the front panel,
   * which is a box with a hole in it rather than a radio with its cover off. A dark plate
   * set 14cm in gives the bay a floor at a believable depth, something for the connectors
   * to be mounted through, and a surface for the corrosion to creep across.
   *
   * Unlit, like the vents and the socket bores. The inside of a case is dark because it is
   * inside, and nothing the work lamp does should change that.
   */
  const CAVITY = { depth: BAY.depth };
  {
    /*
     * A millimetre proud of the carcass, and that millimetre is the actual z-fight.
     *
     * Reported twice at the back of the set. The first fix moved the socket collar,
     * which was genuinely coplanar and was genuinely not what the player was looking
     * at: the collar is a 4cm ring, and this is the entire floor of the bay.
     *
     * The carcass stops at -0.0850 - it is the case minus the depth of the well - and
     * this plate was laid at -0.0850 to -0.0790, so its front face and the carcass's
     * rear face were the same plane, both facing the camera, both drawn. Every pixel
     * of the well's floor was a tie between a dark chassis panel and the warm case,
     * which is why it shimmered across the whole opening rather than at one edge.
     *
     * Set proud rather than sunk, because it is a liner dropped into the well and a
     * liner sits on top of what it lines. It also keeps the collar's geometry above
     * valid: that ring now overlaps this plate instead of sharing a face with it.
     */
    const plate = new THREE.BoxGeometry(BAY.width, BAY.height, 0.006);
    plate.translate(0, height / 2, -depth / 2 + BAY.depth - 0.001);
    chassis.push(plate);
  }

  const socket = (x: number, radius: number, length: number): void => {
    /*
     * Mounted on the floor of the bay and standing out of it, rather than bolted to the
     * outside of a closed box. They still reach past the rim - a connector you cannot get
     * a plug onto is no use to anybody - but their bases are now inside the case, which is
     * where the back of a set actually is once its cover is off.
     */
    const mouthZ = -depth / 2 + BAY.depth + 0.006;

    /*
     * The face of the bay floor the sockets stand on.
     *
     * Named, because two things were being placed against it by arithmetic that happened
     * to agree with it and then stopped mentioning it. The plate is 6mm thick, centred
     * 3mm behind this, so this is its outer face - the surface the player is looking at
     * when they look into the open back.
     */
    const plateFace = -depth / 2 + BAY.depth;

    /*
     * A millimetre deeper than it needs to be, and that millimetre is the fix.
     *
     * The shell ended exactly on the plate's inner face at -0.079. Coincident faces are a
     * coin toss for the depth buffer, and the only reason this pair was not visibly
     * fighting is that both happened to be pointing away from the camera and getting
     * culled - which is luck, not construction, and it stops being true the moment the
     * set is turned.
     */
    const shell = new THREE.CylinderGeometry(radius, radius * 0.94, length + 0.002, 10);
    shell.rotateX(Math.PI / 2);
    shell.translate(x, connectorY, mouthZ - length / 2 + 0.001);
    fittings.push(shell);

    /*
     * The collar, standing ON the bay floor rather than inside it.
     *
     * This is the z-fighting reported at the back of the set, on the surface touching the
     * connector, and it was exact: the collar was centred at -0.0820 with a 6mm length,
     * and the bay floor plate is centred at -0.0820 with a 6mm thickness. Two solids in
     * precisely the same slab of space, so every pixel of the collar was a tie.
     *
     * It reads as a raised ring where the socket is screwed through the panel, so it
     * belongs in FRONT of the panel. Sunk half a millimetre into it rather than butted
     * against it, because sharing one plane is the thing that just went wrong - an
     * overlap has no tie to lose.
     */
    const collar = new THREE.CylinderGeometry(radius * 1.22, radius * 1.22, 0.006, 10);
    collar.rotateX(Math.PI / 2);
    collar.translate(x, connectorY, plateFace - 0.0025);
    fittings.push(collar);

    /**
     * The bore: an unlit cylinder sunk into the shell so the socket has a hole in it.
     *
     * The shell is solid, so there is no cavity to see into - what reads as a hole is this
     * dark volume sitting where the opening would be. Sunk rather than a flat disc on the
     * face, because a disc stops being a hole the moment the camera is off-axis and the
     * inspection shot is off-axis.
     *
     * Two attempts at pins were removed rather than kept. Standing them inside this bore
     * put them behind it, and moving the bore back to clear them buried it in the shell and
     * lost the hole entirely - the connectors went back to reading as dowels, which is the
     * fault the whole socket rebuild exists to fix. At 2.2mm across, from where the
     * inspection shot sits, a pin is about one pixel; the hole is worth ten of them.
     *
     * "Green crust spread right across the pins" is carried by the corrosion beads round
     * the socket mouth instead, which is where the player can actually see it.
     */
    const bore = new THREE.CylinderGeometry(radius * 0.72, radius * 0.72, length * 0.8, 10);
    bore.rotateX(Math.PI / 2);
    bore.translate(x, connectorY, mouthZ - length + length * 0.4 - 0.002);
    recesses.push(bore);
  };

  socket(-width * 0.2, 0.018, 0.05);
  socket(width * 0.16 + jitter(rng, 0.01), 0.032, 0.06);

  /**
   * The lead, plugged into the small socket.
   *
   * Two sockets with nothing in either is a photograph of a part, not the back of a set
   * that worked yesterday. A plug seated in one of them is most of what says this is a
   * machine somebody uses: it gives the bay a reason to be open, it puts something in
   * the well at a size the inspection shot can read, and it makes the empty socket
   * beside it look empty ON PURPOSE.
   *
   * The SMALL socket, and that is the whole reason it is not the big one. Connector B is
   * the fault - green crust right across it - and the request turns on the player asking
   * to see it and Mirela scraping it back to bright metal. A lead in the way would have
   * to come out first, and covering the one piece of evidence in the room with an object
   * added for set dressing is the exact §131 failure: the environment carrying decoration
   * instead of information. B stays bare, which now reads as a socket with its lead off
   * rather than as a socket nobody thought about.
   *
   * ## Why the tail is short and stays inside the set's own footprint
   *
   * `prop.rotate:transmitter-rear` turns the whole node 180 degrees about Y to show the
   * back. Anything built as part of this prop turns with it. A mains lead run out to the
   * bench - which is what a real one does, and what I built first - sweeps a 30cm arc
   * through the benchtop and out into the room every time the player asks to see the
   * back, and ends the move lying across the front of the set.
   *
   * So the lead does what a lead does when its far end is unplugged: it comes out of the
   * socket, over the rim of the bay, and hangs down the back of the case. Every point on
   * it is within the case's own silhouette, so the spin carries it round intact. The cut
   * end is parked 2mm inside the bottom frame panel, which hides the open tube - a cable
   * has two ends and only one of them is anybody's business here.
   */
  {
    const plugX = -width * 0.2;
    const socketEnd = -depth / 2 + BAY.depth + 0.006 - 0.05;

    /*
     * The plug is split across two materials because it is made of two things.
     *
     * Barrel and grip ring are `fittings`, which is MAT.metal - painted metal at 0.65
     * metalness, the same as the brackets. The boot and the cable are `chassis`, which is
     * MAT.equipmentBack: 0.92 rough, no metal, effectively matte rubber. Run the whole
     * plug through `fittings` and the lead comes out as chrome pipework bent round the
     * back of the set, which is a plumbing fixture rather than a wire.
     *
     * `chassis` was built for the inside of the bay and this is the second thing in it,
     * which is a stretch of the name and not of the intent - it is the bucket for "dark
     * but lit", and a black lead hanging against a warm brown case is exactly that.
     */
    // Barrel, over the socket rather than butted against it - a plug that meets a socket
    // exactly at the seam reads as two pieces touching, which is what it is.
    const barrel = new THREE.CylinderGeometry(0.021, 0.021, 0.032, 10);
    barrel.rotateX(Math.PI / 2);
    barrel.translate(plugX, connectorY, socketEnd - 0.006);
    fittings.push(barrel);

    // The knurled ring you actually grip. 5mm, and it is the only part of the plug that
    // is a different diameter, which is enough to stop the whole thing reading as a peg.
    const ring = new THREE.CylinderGeometry(0.024, 0.024, 0.005, 10);
    ring.rotateX(Math.PI / 2);
    ring.translate(plugX, connectorY, socketEnd - 0.02);
    fittings.push(ring);

    /*
     * Strain relief, tapering into the cable.
     *
     * Wide end first, because `rotateX(PI / 2)` sends +Y to +Z and the sockets above are
     * built on that same assumption - radiusTop lands on the inner face, radiusBottom on
     * the outer. Written the other way round it is still a cone, still 28mm long, and
     * still passes every check except looking right: a boot that flares as it leaves the
     * plug is a trumpet.
     */
    const boot = new THREE.CylinderGeometry(0.018, 0.008, 0.028, 8);
    boot.rotateX(Math.PI / 2);
    boot.translate(plugX, connectorY, socketEnd - 0.036);
    chassis.push(boot);

    /*
     * The hang. Out past the rim at -0.17, down the back of the case, and in again to
     * finish inside the bottom frame.
     *
     * Checked against the case rather than eyeballed: below the bay opening the frame
     * panel occupies z -0.17 to -0.085, so the two low points sit at -0.190 and -0.176,
     * clear of its face by 20mm and 6mm against a 5mm tube. Sideways it stays between
     * x -0.104 and -0.129, inside the bay's own half-width of 0.135, so it never fouls
     * the side panels either.
     */
    const hang = new THREE.CatmullRomCurve3([
      new THREE.Vector3(plugX, connectorY, -depth / 2),
      new THREE.Vector3(plugX - 0.004, connectorY - 0.009, -0.196),
      new THREE.Vector3(plugX - 0.018, connectorY - 0.032, -0.201),
      new THREE.Vector3(plugX - 0.025, connectorY - 0.060, -0.190),
      new THREE.Vector3(plugX - 0.022, connectorY - 0.080, -0.176),
      new THREE.Vector3(plugX - 0.014, connectorY - 0.086, -0.168),
    ]);
    chassis.push(new THREE.TubeGeometry(hang, 30, 0.005, 7, false));
  }

  /**
   * Ventilation, uneven so the object looks used rather than extruded.
   *
   * These are fittings rather than body, and that is a texturing decision as much as a
   * material one: the shell carries a generated map keyed to box UVs, where each face
   * owns the whole 0..1 square. Merging a 12mm slot into the same geometry would give
   * that slot a full copy of a texture built for a half-metre panel, and the crackle
   * would come out the size of the vent. Kept separate, the shell stays one clean box.
   *
   * ## They were inside the box
   *
   * Built at `-depth/2 + 0.01` and 20mm deep, which puts the outer face exactly coplanar
   * with the shell's rear face and the rest of the slot buried in it. Coplanar faces
   * z-fight, and the depth test settled in favour of the shell, so the only surface detail
   * on the back of the Kestrel-3 has never been drawn. It cost nothing to render and
   * showed nothing, which is why nobody caught it: there is no failure to see.
   *
   * That matters more than it sounds. Two beats into the mission the camera goes to an
   * inspection shot of this exact face - the player is asked to look at the back of the
   * set, and the back of the set was a bare panel with two plugs on it.
   *
   * Now they stand 4mm proud. Proud rather than recessed for the reason the mill road's
   * repairs are laid on top of the tarmac rather than cut into it: this project casts no
   * shadows, and a recess with no shadow in it is not a recess, it is a slightly different
   * colour. In `MAT.metal` against the pale case they read as slots.
   *
   * Moved above the connectors as well. Centred on the panel they ran straight through
   * both plugs - the geometry intersected, so the one feature the mission turns on was
   * growing out of a louvre.
   */
  /**
   * The louvres: raised metal bars, not dark slots, and off the lid.
   *
   * On the top in MAT.slot they were read as "a hole on top of the radio", which is
   * exactly what an unlit black rectangle on an upward face is. A vent is not a hole in a
   * case - it is pressed metal with slits in it, and the metal is the part you see. So
   * these are RAISED bars in the fittings material: lit, catching the lamp along their top
   * edges, with the dark only in the gaps between them.
   *
   * Moved to the rear frame as well, beside the hatch, where a set of this vintage puts
   * them and where the inspection shot already looks. The lid is left clean for the handle,
   * which is the only thing that belongs on top.
   */
  const VENTS = 5;
  for (let i = 0; i < VENTS; i++) {
    const slot = new THREE.BoxGeometry(0.036, 0.006, 0.004);
    slot.translate(
      -width * 0.36 + jitter(rng, 0.002),
      height * 0.28 + i * 0.017,
      -depth / 2 - 0.002
    );
    fittings.push(slot);
  }

  /**
   * The screws the back cover came off with.
   *
   * `set-panel` in the repair shop is that cover, unscrewed and propped against the bench,
   * and Mirela's first line is that she has the back off already. The set it came off had
   * no fixings anywhere on it. Four captive screws at the corners of the rear face is the
   * whole fix, and it does the same job the empty curtain rail does in the cleared house:
   * it makes a thing that is missing legible by showing what it was attached to.
   */
  for (const sx of [-1, 1] as const) {
    for (const sy of [0.12, 0.88] as const) {
      const screw = new THREE.CylinderGeometry(0.005, 0.005, 0.006, 6);
      screw.rotateX(Math.PI / 2);
      // On the rim of the opening - the lip the cover was screwed down onto.
      screw.translate(sx * (width / 2 - 0.011), height * sy, -depth / 2 - 0.002);
      fittings.push(screw);
    }
  }

  return {
    body: mergeGeometries(body, false) ?? handle,
    fittings: mergeGeometries(fittings, false) ?? handle,
    recesses: mergeGeometries(recesses, false) ?? undefined,
    chassis: mergeGeometries(chassis, false) ?? undefined,
    anchors: {
      connectorB: new THREE.Vector3(width * 0.16, connectorY, -depth / 2 - 0.02),
      /** The mouth of the hatch, for anything that has to sit at the opening. */
      bayMouth: new THREE.Vector3(0, height * 0.5, -depth / 2 + 0.004),
      /**
       * The rear panel itself, at connector B's base - a SURFACE, not an aiming point.
       *
       * `connectorB` above is 5cm out in the air in front of the plug, which is what a
       * camera or an effect wants to be pointed at and is the wrong place to put matter.
       * The corrosion beads were parented to it and then pushed a further 14mm out, so
       * sixteen lumps of verdigris were hanging 64mm off the back of the set and 9mm past
       * the end of the connector they were supposed to be growing on.
       *
       * Reported by eye long before it was measured, which is the right way round: it
       * looked like it was floating because it was floating.
       */
      rearPanel: new THREE.Vector3(width * 0.16, connectorY, -depth / 2 + BAY.depth + 0.006),
      meter: new THREE.Vector3(-width * 0.22, height * 0.55, depth / 2 + 0.02),
      front: new THREE.Vector3(0, height * 0.5, depth / 2 + 0.3),
      rear: new THREE.Vector3(0, height * 0.5, -depth / 2 - 0.3),
    },
  };
}

/** A wall-mounted mains switch with a throwable lever. */
export function createMainsSwitch(): PropParts {
  const box = new THREE.BoxGeometry(0.16, 0.22, 0.08);
  box.translate(0, 0.11, 0);

  const lever = new THREE.BoxGeometry(0.035, 0.1, 0.035);
  lever.translate(0, 0.05, 0);

  return {
    body: box,
    fittings: lever,
    anchors: {
      /** Lever pivot, in the switch's local space. */
      pivot: new THREE.Vector3(0, 0.13, 0.05),
    },
  };
}

/** Shelving with a few crates - background mass for the repair shop (§186). */
export function createShelfStack(seedKey = 'shelf'): PropParts {
  const rng = createRng(seedFrom(seedKey));
  const body: THREE.BufferGeometry[] = [];
  const fittings: THREE.BufferGeometry[] = [];

  const width = 1.6;
  const depth = 0.4;

  for (let level = 0; level < 3; level++) {
    const plank = new THREE.BoxGeometry(width, 0.04, depth);
    plank.translate(0, 0.5 + level * 0.52, 0);
    body.push(plank);

    const crateCount = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < crateCount; i++) {
      const w = range(rng, 0.16, 0.32);
      const h = range(rng, 0.14, 0.26);
      const crate = new THREE.BoxGeometry(w, h, range(rng, 0.2, 0.32));
      crate.translate(
        range(rng, -width / 2 + 0.2, width / 2 - 0.2),
        0.52 + level * 0.52 + h / 2,
        jitter(rng, 0.04)
      );
      crate.rotateY(jitter(rng, 0.12));
      fittings.push(crate);
    }
  }

  for (let sx = -1; sx <= 1; sx += 2) {
    const upright = new THREE.BoxGeometry(0.06, 1.6, 0.06);
    upright.translate(sx * (width / 2 - 0.05), 0.8, 0);
    body.push(upright);
  }

  return {
    body: mergeGeometries(body, false) ?? new THREE.BoxGeometry(0.1, 0.1, 0.1),
    fittings: mergeGeometries(fittings, false) ?? new THREE.BoxGeometry(0.1, 0.1, 0.1),
    anchors: { top: new THREE.Vector3(0, 1.6, 0) },
  };
}
