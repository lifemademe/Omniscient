/**
 * Where a flat mesh lands on the frame, as four corners.
 *
 * Written for one caller: the CRT's face has to be exempt from the pixel grid, and a
 * full-screen shader can only know which fragments belong to it if somebody hands it the
 * shape. See the note in retroShader for why the screen is exempt at all.
 *
 * ## Why four corners and not a rectangle
 *
 * The tube is a physical object standing on a desk and the camera looks at it from the side.
 * Its screen is a trapezium on the frame, not a rectangle, and the bounding rectangle of that
 * trapezium includes a wedge of desk along one edge and a wedge of wall along another. Those
 * wedges would come out sharp in a coarse room, which is exactly the artefact this is trying
 * to avoid - a hard-edged patch of high resolution reads as a rendering fault, and it reads
 * as one whichever direction the mistake goes.
 *
 * ## Why the bounding box and not the vertices
 *
 * Because the mesh comes out of a Blender export and nothing guarantees it is four vertices
 * in a helpful order. The local bounding box of a flat quad is degenerate on one axis; the
 * other two give the four corners, and taking them in the fixed order below produces a ring
 * rather than a bowtie. That holds for any orientation and any vertex count.
 */

import * as THREE from 'three';

const local = new THREE.Vector3();
const corners = [
  new THREE.Vector2(),
  new THREE.Vector2(),
  new THREE.Vector2(),
  new THREE.Vector2(),
];

/**
 * Project a flat mesh's four corners into normalised device coordinates.
 *
 * Returns null when there is nothing to project, and - importantly - when any corner is
 * behind the camera. A point behind the lens projects to a mirrored position in front of it,
 * so a quad with one corner behind comes back turned inside out, and a point-in-quad test
 * against an inside-out quad answers confidently and wrongly: it would exempt most of the
 * room and grid the screen. Refusing is the only safe answer, and the case is real - the
 * camera flies past the tube on its way home from a call.
 *
 * The returned vectors are reused between calls unless `out` is given. Copy them, or pass an
 * `out`, if they need to outlive the frame - which is exactly what projecting SEVERAL quads in
 * one frame needs, since the second call would otherwise overwrite the first's answer.
 */
export function projectScreenQuad(
  mesh: THREE.Object3D | null | undefined,
  camera: THREE.Camera | null | undefined,
  out?: THREE.Vector2[]
): readonly THREE.Vector2[] | null {
  if (!mesh || !camera || mesh.visible === false) return null;

  const geometry = (mesh as THREE.Mesh).geometry;
  if (!geometry) return null;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return null;

  const size = box.getSize(new THREE.Vector3());
  // The flat axis is the smallest one. The other two carry the face.
  const flat = size.x <= size.y && size.x <= size.z ? 0 : size.y <= size.z ? 1 : 2;
  const [u, v] = flat === 0 ? [1, 2] : flat === 1 ? [0, 2] : [0, 1];

  const min = [box.min.x, box.min.y, box.min.z];
  const max = [box.max.x, box.max.y, box.max.z];
  const mid = (min[flat] + max[flat]) / 2;

  // Round the ring, not across it: (min,min) (max,min) (max,max) (min,max).
  const ring: Array<[number, number]> = [
    [min[u], min[v]],
    [max[u], min[v]],
    [max[u], max[v]],
    [min[u], max[v]],
  ];

  mesh.updateWorldMatrix(true, false);

  for (let i = 0; i < 4; i++) {
    const xyz = [0, 0, 0];
    xyz[flat] = mid;
    xyz[u] = ring[i][0];
    xyz[v] = ring[i][1];
    local.set(xyz[0], xyz[1], xyz[2]).applyMatrix4(mesh.matrixWorld).project(camera);
    // Behind the lens. See the note above - an inverted quad is worse than no quad.
    if (local.z > 1) return null;
    (out ?? corners)[i].set(local.x, local.y);
  }

  return out ?? corners;
}
