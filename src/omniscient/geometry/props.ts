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

  const shell = new THREE.BoxGeometry(width, height, depth);
  shell.translate(0, height / 2, 0);
  body.push(shell);

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

  // Carry handle - reads instantly as "portable set from before things got light".
  const handle = new THREE.TorusGeometry(width * 0.16, 0.012, 4, 10, Math.PI);
  handle.rotateY(Math.PI / 2);
  handle.translate(0, height, -depth * 0.1);
  fittings.push(handle);

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

  const socket = (x: number, radius: number, length: number): void => {
    const shell = new THREE.CylinderGeometry(radius, radius * 0.94, length, 10);
    shell.rotateX(Math.PI / 2);
    shell.translate(x, connectorY, -depth / 2 - length / 2);
    fittings.push(shell);

    // A raised collar at the base, where a socket is screwed to the panel.
    const collar = new THREE.CylinderGeometry(radius * 1.22, radius * 1.22, 0.006, 10);
    collar.rotateX(Math.PI / 2);
    collar.translate(x, connectorY, -depth / 2 - 0.003);
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
    bore.translate(x, connectorY, -depth / 2 - length + length * 0.4 - 0.002);
    recesses.push(bore);
  };

  socket(-width * 0.2, 0.018, 0.05);
  socket(width * 0.16 + jitter(rng, 0.01), 0.032, 0.06);

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
  const VENTS = 6;
  for (let i = 0; i < VENTS; i++) {
    const slot = new THREE.BoxGeometry(width * 0.46 * range(rng, 0.92, 1), 0.005, 0.010);
    slot.translate(jitter(rng, 0.004), height * (0.62 + i * 0.055), -depth / 2 - 0.003);
    recesses.push(slot);
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
    for (const sy of [0.16, 0.84] as const) {
      const screw = new THREE.CylinderGeometry(0.005, 0.005, 0.006, 6);
      screw.rotateX(Math.PI / 2);
      screw.translate(sx * width * 0.44, height * sy, -depth / 2 - 0.002);
      fittings.push(screw);
    }
  }

  return {
    body: mergeGeometries(body, false) ?? shell,
    fittings: mergeGeometries(fittings, false) ?? handle,
    recesses: mergeGeometries(recesses, false) ?? undefined,
    anchors: {
      connectorB: new THREE.Vector3(width * 0.16, connectorY, -depth / 2 - 0.05),
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
      rearPanel: new THREE.Vector3(width * 0.16, connectorY, -depth / 2),
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
