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

  // Rear connectors. Connector B is the fat one and sits proud of the panel.
  const connectorA = new THREE.CylinderGeometry(0.018, 0.018, 0.05, 8);
  connectorA.rotateX(Math.PI / 2);
  connectorA.translate(-width * 0.2, height * 0.5, -depth / 2 - 0.02);
  fittings.push(connectorA);

  const connectorB = new THREE.CylinderGeometry(0.032, 0.03, 0.06, 8);
  connectorB.rotateX(Math.PI / 2);
  connectorB.translate(width * 0.16 + jitter(rng, 0.01), height * 0.5, -depth / 2 - 0.025);
  fittings.push(connectorB);

  // Ventilation, uneven so the object looks used rather than extruded.
  for (let i = 0; i < 5; i++) {
    const slot = new THREE.BoxGeometry(width * 0.5 * range(rng, 0.9, 1), 0.012, 0.02);
    slot.translate(0, height * (0.2 + i * 0.12), -depth / 2 + 0.01);
    body.push(slot);
  }

  return {
    body: mergeGeometries(body, false) ?? shell,
    fittings: mergeGeometries(fittings, false) ?? connectorB,
    anchors: {
      connectorB: new THREE.Vector3(width * 0.16, height * 0.5, -depth / 2 - 0.05),
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
