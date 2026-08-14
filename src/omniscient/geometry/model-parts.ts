/**
 * Reading authored anchors out of a loaded glTF.
 *
 * The project's props have always been generated in code, which meant a generator knew
 * exactly where its own connector was and could hand back a `Vector3`. A model authored
 * elsewhere knows nothing, so the information has to travel inside the asset - as named
 * nodes, placed in Blender against the geometry they belong to.
 *
 * ## The convention
 *
 * | Prefix    | Meaning                                                        |
 * | --------- | -------------------------------------------------------------- |
 * | `SCREEN_` | A quad that becomes a live surface - a CRT, a meter, a display. |
 * | `GLASS_`  | A face over a screen. Reflection only; never lit by the room.    |
 * | `PART_`   | A sub-mesh that must move, glow or change material on its own.   |
 * | `ANCHOR_` | A point with a direction. VFX attach here.                       |
 *
 * The engine ships a `MeshSocket` system that does something similar, but it binds to
 * bones - it scans for `isBone` - so it is built for rigged characters and cannot see a
 * plain empty on a static prop. Hence this, which is twenty lines and reads any named
 * node at all.
 *
 * ## Why an anchor carries a rotation
 *
 * The hand-written anchors were bare positions, so a spark fired along an axis the cue
 * handler guessed. A node authored in Blender brings its orientation with it, which means
 * an effect can finally point the way the surface it sits on faces.
 */

import * as THREE from 'three';

/** A named point on a model, in the model root's local space. */
export interface ModelAnchor {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  /** Bounding size, so an area anchor can tell a surface how big to be. */
  size: THREE.Vector3;
  object: THREE.Object3D;
}

export interface ModelParts {
  /** `SCREEN_*` - quads to mount live surfaces on. */
  screens: Map<string, THREE.Mesh>;
  /** `GLASS_*` - faces over those screens. */
  glass: Map<string, THREE.Mesh>;
  /** `PART_*` - independently addressable sub-meshes. */
  parts: Map<string, THREE.Mesh>;
  /** `ANCHOR_*` - attach points. Also includes every screen and part, by id. */
  anchors: Map<string, ModelAnchor>;
}

/**
 * Blender silently appends `.001` to a name that already exists, and a duplicated object
 * is the single easiest way to end up with `SCREEN_main.001` in an export. Strip it
 * rather than making that a debugging session.
 */
function cleanName(name: string): string {
  return name.replace(/\.\d{3}$/, '');
}

function anchorFrom(object: THREE.Object3D, root: THREE.Object3D): ModelAnchor {
  object.updateWorldMatrix(true, false);

  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  box.getSize(size);

  // Relative to the model root, so the anchor is usable wherever the model is placed.
  const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const local = new THREE.Matrix4().multiplyMatrices(inverse, object.matrixWorld);

  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  local.decompose(position, quaternion, scale);

  // A quad's origin is wherever the author left it; its centre is what a caller wants to
  // mount something on. For a symmetric part these are the same point.
  const centre = new THREE.Vector3();
  box.getCenter(centre);
  root.worldToLocal(centre);

  return { position: centre, quaternion, size, object };
}

/**
 * Rebuild a quad's UVs from its own geometry, so a live surface fills it exactly.
 *
 * A `SCREEN_` or `GLASS_` quad is by definition a full-frame surface, and its authored UVs
 * are almost never that. This one arrived carrying `u: 0.001..0.235, v: 0.113..0.279` -
 * the slice of the model's shared atlas that its material happened to occupy - so the CRT
 * canvas was being sampled from a fifth of one corner of itself and the screen came up
 * nearly blank. Blender's V also runs the other way from `PlaneGeometry`'s, which would
 * have hung the Knowledge Tree upside down by its roots.
 *
 * Deriving from position rather than repairing the authored values fixes both at once and
 * makes the asset's UV layout stop mattering: unwrap it however you like, or not at all.
 */
export function fitSurfaceUvs(mesh: THREE.Mesh): void {
  const position = mesh.geometry.getAttribute('position');
  const normals = mesh.geometry.getAttribute('normal');
  if (!position || !normals) return;

  const normal = new THREE.Vector3(
    normals.getX(0),
    normals.getY(0),
    normals.getZ(0)
  ).normalize();

  // The quad's own up, found by projecting world up onto its plane. A surface lying flat
  // has no such direction, so it falls back to depth.
  const up = new THREE.Vector3(0, 1, 0).projectOnPlane(normal);
  if (up.lengthSq() < 1e-6) up.set(0, 0, 1).projectOnPlane(normal);
  up.normalize();

  // Cross in this order so u runs left-to-right as seen from the front, matching
  // PlaneGeometry - which is the convention CRTSurface's own flip was tuned against.
  const right = new THREE.Vector3().crossVectors(up, normal).normalize();

  const point = new THREE.Vector3();
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;

  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i);
    const u = point.dot(right);
    const v = point.dot(up);
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
    minV = Math.min(minV, v);
    maxV = Math.max(maxV, v);
  }

  const spanU = maxU - minU || 1;
  const spanV = maxV - minV || 1;
  const uv = new Float32Array(position.count * 2);

  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i);
    uv[i * 2] = (point.dot(right) - minU) / spanU;
    uv[i * 2 + 1] = (point.dot(up) - minV) / spanV;
  }

  mesh.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/** Scan a loaded model for everything named to the convention. */
export function readModelParts(root: THREE.Object3D): ModelParts {
  const screens = new Map<string, THREE.Mesh>();
  const glass = new Map<string, THREE.Mesh>();
  const parts = new Map<string, THREE.Mesh>();
  const anchors = new Map<string, ModelAnchor>();

  root.updateWorldMatrix(true, true);

  root.traverse((object) => {
    const name = cleanName(object.name);
    const split = name.indexOf('_');
    if (split < 0) return;

    const prefix = name.slice(0, split);
    const id = name.slice(split + 1);
    if (!id) return;

    const mesh = (object as THREE.Mesh).isMesh ? (object as THREE.Mesh) : null;

    switch (prefix) {
      case 'SCREEN':
        if (mesh) screens.set(id, mesh);
        break;
      case 'GLASS':
        if (mesh) glass.set(id, mesh);
        break;
      case 'PART':
        if (mesh) parts.set(id, mesh);
        break;
      case 'ANCHOR':
        break;
      default:
        return;
    }

    anchors.set(id, anchorFrom(object, root));
  });

  return { screens, glass, parts, anchors };
}
