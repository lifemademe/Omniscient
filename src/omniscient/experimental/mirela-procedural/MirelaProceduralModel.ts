import * as THREE from 'three';

import { MIRELA_PROCEDURAL_SPEC } from './MirelaProceduralSpec.js';

export type MirelaPoseId =
  | 'neutral'
  | 'shoulders'
  | 'elbows'
  | 'hips'
  | 'knees'
  | 'full-stress';

export interface MirelaProceduralMetrics {
  meshes: number;
  skinnedMeshes: number;
  triangles: number;
  vertices: number;
  materials: number;
  drawCalls: number;
  geometryBytes: number;
  bones: number;
  constructionMs: number;
}

export interface MirelaProceduralRig {
  bones: Record<string, THREE.Bone>;
  skeleton: THREE.Skeleton;
  boneOrder: readonly string[];
  boneIndex: Readonly<Record<string, number>>;
  bound: boolean;
}

export interface MirelaProceduralCharacter {
  root: THREE.Group;
  rig: MirelaProceduralRig;
  metrics: MirelaProceduralMetrics;
  setPose: (pose: MirelaPoseId) => void;
  updateIdle: (deltaTime: number) => void;
  dispose: () => void;
}

const POSES: readonly MirelaPoseId[] = [
  'neutral',
  'shoulders',
  'elbows',
  'hips',
  'knees',
  'full-stress',
];

export const MIRELA_POSES = POSES;

const UP = new THREE.Vector3(0, 1, 0);

function physicalMaterial(
  color: string,
  roughness: number,
  options: Partial<THREE.MeshPhysicalMaterialParameters> = {}
): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness: 0,
    clearcoat: 0,
    ...options,
  });
}

function smoothstep(value: number): number {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function addSkinAttributes(
  geometry: THREE.BufferGeometry,
  start: THREE.Vector3,
  end: THREE.Vector3,
  startBone: number,
  endBone: number
): void {
  const positions = geometry.getAttribute('position');
  const axis = end.clone().sub(start);
  const lengthSq = Math.max(axis.lengthSq(), 1e-6);
  const skinIndices = new Uint16Array(positions.count * 4);
  const skinWeights = new Float32Array(positions.count * 4);
  const vertex = new THREE.Vector3();

  for (let i = 0; i < positions.count; i++) {
    vertex.fromBufferAttribute(positions, i);
    const along = vertex.clone().sub(start).dot(axis) / lengthSq;
    const endWeight = smoothstep(along);
    const offset = i * 4;
    skinIndices[offset] = startBone;
    skinIndices[offset + 1] = endBone;
    skinWeights[offset] = 1 - endWeight;
    skinWeights[offset + 1] = endWeight;
  }

  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
}

function segmentGeometry(
  start: THREE.Vector3,
  end: THREE.Vector3,
  radiusStart: number,
  radiusEnd: number,
  radialSegments = 10,
  heightSegments = 8
): THREE.BufferGeometry {
  const direction = end.clone().sub(start);
  const length = direction.length();
  const geometry = new THREE.CylinderGeometry(
    radiusEnd,
    radiusStart,
    length,
    radialSegments,
    heightSegments,
    false
  );
  const orientation = new THREE.Quaternion().setFromUnitVectors(UP, direction.clone().normalize());
  geometry.applyQuaternion(orientation);
  geometry.translate(
    (start.x + end.x) * 0.5,
    (start.y + end.y) * 0.5,
    (start.z + end.z) * 0.5
  );
  geometry.computeVertexNormals();
  return geometry;
}

function loftGeometry(
  rings: readonly { y: number; width: number; depth: number }[],
  radialSegments = 16
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];

  for (const ring of rings) {
    for (let segment = 0; segment < radialSegments; segment++) {
      const angle = (segment / radialSegments) * Math.PI * 2;
      positions.push(
        Math.cos(angle) * ring.width * 0.5,
        ring.y,
        Math.sin(angle) * ring.depth * 0.5
      );
    }
  }

  for (let ring = 0; ring < rings.length - 1; ring++) {
    for (let segment = 0; segment < radialSegments; segment++) {
      const next = (segment + 1) % radialSegments;
      const a = ring * radialSegments + segment;
      const b = ring * radialSegments + next;
      const c = (ring + 1) * radialSegments + segment;
      const d = (ring + 1) * radialSegments + next;
      indices.push(a, c, b, b, c, d);
    }
  }

  const bottom = positions.length / 3;
  positions.push(0, rings[0].y, 0);
  const top = positions.length / 3;
  positions.push(0, rings[rings.length - 1].y, 0);
  for (let segment = 0; segment < radialSegments; segment++) {
    const next = (segment + 1) % radialSegments;
    indices.push(bottom, next, segment);
    const last = (rings.length - 1) * radialSegments;
    indices.push(top, last + segment, last + next);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function skinnedMesh(
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  skeleton: THREE.Skeleton,
  start: THREE.Vector3,
  end: THREE.Vector3,
  startBone: number,
  endBone: number
): THREE.SkinnedMesh {
  addSkinAttributes(geometry, start, end, startBone, endBone);
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.bind(skeleton);
  return mesh;
}

function rigidMesh(
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  parent: THREE.Object3D,
  position = new THREE.Vector3()
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.copy(position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function collectMetrics(root: THREE.Object3D, constructionMs: number, bones: number): MirelaProceduralMetrics {
  let meshes = 0;
  let skinnedMeshes = 0;
  let triangles = 0;
  let vertices = 0;
  let drawCalls = 0;
  let geometryBytes = 0;
  const materials = new Set<THREE.Material>();

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    meshes++;
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) skinnedMeshes++;
    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position');
    vertices += position?.count ?? 0;
    triangles += geometry.index ? geometry.index.count / 3 : (position?.count ?? 0) / 3;
    const assigned = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    drawCalls += Math.max(1, geometry.groups.length || assigned.length);
    for (const attribute of Object.values(geometry.attributes)) {
      geometryBytes += attribute.array.byteLength;
    }
    if (geometry.index) geometryBytes += geometry.index.array.byteLength;
    for (const material of assigned) materials.add(material);
  });

  return {
    meshes,
    skinnedMeshes,
    triangles: Math.round(triangles),
    vertices,
    materials: materials.size,
    drawCalls,
    geometryBytes,
    bones,
    constructionMs,
  };
}

function resetPose(bones: Record<string, THREE.Bone>): void {
  for (const bone of Object.values(bones)) bone.rotation.set(0, 0, 0);
}

export function createMirelaProceduralModel(): MirelaProceduralCharacter {
  const started = performance.now();
  const spec = MIRELA_PROCEDURAL_SPEC;
  const height = spec.anatomy.height;
  const hipY = height * spec.anatomy.hipHeightRatio;
  const torsoHeight = height * spec.anatomy.torsoHeightRatio;
  const shoulderY = hipY + torsoHeight;
  const headHeight = height * spec.anatomy.headHeightRatio;
  const shoulderWidth = height * spec.anatomy.shoulderWidthRatio;
  const hipWidth = shoulderWidth * spec.anatomy.hipWidthRatio;
  const upperArmLength = torsoHeight * spec.anatomy.upperArmToTorso;
  const forearmLength = torsoHeight * spec.anatomy.forearmToTorso;
  const thighLength = hipY * 0.52;
  const shinLength = hipY * 0.46;

  const root = new THREE.Group();
  root.name = 'Mirela-Procedural';

  const boneOrder = [
    'root',
    'hips',
    'spine',
    'chest',
    'neck',
    'head',
    'leftShoulder',
    'leftElbow',
    'leftWrist',
    'rightShoulder',
    'rightElbow',
    'rightWrist',
    'leftHip',
    'leftKnee',
    'leftAnkle',
    'rightHip',
    'rightKnee',
    'rightAnkle',
  ] as const;
  const bones = Object.fromEntries(boneOrder.map((name) => [name, new THREE.Bone()])) as Record<
    (typeof boneOrder)[number],
    THREE.Bone
  >;
  for (const name of boneOrder) bones[name].name = `mirela-${name}`;

  bones.hips.position.set(0, hipY, 0);
  bones.spine.position.set(0, torsoHeight * 0.36, 0);
  bones.chest.position.set(0, torsoHeight * 0.5, 0);
  bones.neck.position.set(0, torsoHeight * 0.25, 0);
  bones.head.position.set(0, headHeight * 0.47, 0);
  bones.root.add(bones.hips);
  bones.hips.add(bones.spine, bones.leftHip, bones.rightHip);
  bones.spine.add(bones.chest);
  bones.chest.add(bones.neck, bones.leftShoulder, bones.rightShoulder);
  bones.neck.add(bones.head);

  const shoulderX = shoulderWidth * 0.5;
  bones.leftShoulder.position.set(shoulderX, 0, 0);
  bones.leftElbow.position.set(upperArmLength * 0.16, -upperArmLength * 0.98, 0.018);
  bones.leftWrist.position.set(0, -forearmLength, 0.035);
  bones.leftShoulder.add(bones.leftElbow);
  bones.leftElbow.add(bones.leftWrist);
  bones.rightShoulder.position.set(-shoulderX, 0, 0);
  bones.rightElbow.position.set(-upperArmLength * 0.16, -upperArmLength * 0.98, 0.018);
  bones.rightWrist.position.set(0, -forearmLength, 0.035);
  bones.rightShoulder.add(bones.rightElbow);
  bones.rightElbow.add(bones.rightWrist);

  const hipX = hipWidth * 0.26;
  bones.leftHip.position.set(hipX, 0, 0);
  bones.leftKnee.position.set(0.012, -thighLength, 0.012);
  bones.leftAnkle.position.set(-0.006, -shinLength, 0.025);
  bones.leftHip.add(bones.leftKnee);
  bones.leftKnee.add(bones.leftAnkle);
  bones.rightHip.position.set(-hipX, 0, 0);
  bones.rightKnee.position.set(-0.012, -thighLength, 0.012);
  bones.rightAnkle.position.set(0.006, -shinLength, 0.025);
  bones.rightHip.add(bones.rightKnee);
  bones.rightKnee.add(bones.rightAnkle);
  root.add(bones.root);
  root.updateMatrixWorld(true);

  const skeleton = new THREE.Skeleton(boneOrder.map((name) => bones[name]));
  const boneIndex = Object.fromEntries(boneOrder.map((name, index) => [name, index]));
  const worldAt = (name: (typeof boneOrder)[number]): THREE.Vector3 =>
    bones[name].getWorldPosition(new THREE.Vector3());

  const materials = {
    skin: physicalMaterial(spec.palette.skin, 0.78),
    skinShadow: physicalMaterial(spec.palette.skinShadow, 0.82),
    shirt: physicalMaterial(spec.palette.shirt, 0.88, { sheen: 0.12, sheenRoughness: 0.9 }),
    apron: physicalMaterial(spec.palette.apron, 0.82, { sheen: 0.18, sheenRoughness: 0.75 }),
    apronEdge: physicalMaterial(spec.palette.apronEdge, 0.76),
    pants: physicalMaterial(spec.palette.pants, 0.9),
    hair: physicalMaterial(spec.palette.hair, 0.7, { sheen: 0.28, sheenRoughness: 0.6 }),
    hairHighlight: physicalMaterial(spec.palette.hairHighlight, 0.72, { sheen: 0.3, sheenRoughness: 0.58 }),
    headband: physicalMaterial(spec.palette.headband, 0.84),
    boots: physicalMaterial(spec.palette.boots, 0.68, { clearcoat: 0.08, clearcoatRoughness: 0.65 }),
    eyes: physicalMaterial(spec.palette.eyes, 0.22, { clearcoat: 0.6, clearcoatRoughness: 0.18 }),
    lips: physicalMaterial(spec.palette.lips, 0.7),
    metal: physicalMaterial(spec.palette.metal, 0.34, { metalness: 0.72 }),
  };

  const hips = worldAt('hips');
  const chest = worldAt('chest');
  const torso = loftGeometry([
    { y: hipY - torsoHeight * 0.18, width: hipWidth * 1.08, depth: height * 0.145 },
    { y: hipY + torsoHeight * 0.18, width: hipWidth * 0.92, depth: height * 0.14 },
    { y: hipY + torsoHeight * 0.58, width: shoulderWidth * 0.82, depth: height * 0.145 },
    { y: shoulderY, width: shoulderWidth, depth: height * 0.13 },
  ]);
  root.add(
    skinnedMesh('Mirela-Shirt-Torso', torso, materials.shirt, skeleton, hips, chest, boneIndex.hips, boneIndex.chest)
  );

  /*
   * ## The neck, which did not exist
   *
   * There was no geometry at all between the torso's top plane and the head sphere. A critic
   * given this figure beside the GLB said "the pieces are adjacent instead of connected, so
   * it reads as an unassembled kit rather than one exaggerated mass", and located the fault
   * at the shoulder girdle: "the neck peg is visibly narrower than both the head above and
   * the slab below, with unlit gaps on either side". There was no peg. It was seeing the head
   * hovering over the torso with air between them.
   *
   * Both ends deliberately OVERLAP rather than meet. It starts below the torso's top section
   * and ends inside the head sphere, so there is no seam to find at either join - which is
   * the whole difference between a body and a kit. The base is wider than the neck proper, a
   * trapezius flare, so the column grows out of the shoulders instead of being socketed into
   * them.
   */
  root.add(
    skinnedMesh(
      'Mirela-Neck',
      segmentGeometry(
        new THREE.Vector3(0, shoulderY - torsoHeight * 0.16, 0),
        worldAt('head').clone().add(new THREE.Vector3(0, headHeight * 0.12, 0)),
        height * 0.058,
        height * 0.034,
        12,
        6
      ),
      materials.skin,
      skeleton,
      new THREE.Vector3(0, shoulderY, 0),
      worldAt('head'),
      boneIndex.chest,
      boneIndex.head
    )
  );

  const apron = new THREE.BoxGeometry(shoulderWidth * 0.45, torsoHeight * 0.63, height * 0.018, 4, 8, 1);
  apron.translate(0, hipY + torsoHeight * 0.53, height * 0.083);
  root.add(
    skinnedMesh('Mirela-Apron', apron, materials.apron, skeleton, hips, chest, boneIndex.hips, boneIndex.chest)
  );

  const waistApron = new THREE.BoxGeometry(hipWidth * 1.08, torsoHeight * 0.72, height * 0.022, 5, 8, 1);
  waistApron.translate(0, hipY - torsoHeight * 0.16, height * 0.087);
  root.add(
    skinnedMesh(
      'Mirela-Apron-Lap',
      waistApron,
      materials.apron,
      skeleton,
      new THREE.Vector3(0, hipY - torsoHeight * 0.5, 0),
      chest,
      boneIndex.hips,
      boneIndex.chest
    )
  );

  const apronPocket = rigidMesh(
    'Mirela-Apron-Pocket',
    new THREE.BoxGeometry(hipWidth * 0.58, torsoHeight * 0.22, height * 0.012),
    materials.apronEdge,
    bones.hips,
    new THREE.Vector3(0, -torsoHeight * 0.18, height * 0.102)
  );
  apronPocket.rotation.x = -0.025;

  for (const side of [-1, 1]) {
    const strap = rigidMesh(
      `Mirela-Apron-Strap-${side < 0 ? 'Right' : 'Left'}`,
      new THREE.BoxGeometry(height * 0.018, torsoHeight * 0.48, height * 0.014),
      materials.apronEdge,
      bones.chest,
      new THREE.Vector3(side * shoulderWidth * 0.15, torsoHeight * 0.02, height * 0.091)
    );
    strap.rotation.z = side * 0.13;
  }

  for (const side of ['left', 'right'] as const) {
    const shoulderName = `${side}Shoulder` as const;
    const elbowName = `${side}Elbow` as const;
    const wristName = `${side}Wrist` as const;
    const shoulder = worldAt(shoulderName);
    const elbow = worldAt(elbowName);
    const wrist = worldAt(wristName);
    /*
     * ## The deltoid, which also did not exist
     *
     * The upper arm began at the shoulder bone, and the shoulder bone sits exactly ON the
     * torso's top corner - so the arm cylinder started where the slab ended and the two forms
     * merely touched. The critic read that as "the arm cylinders hang outside the shoulder
     * boxes with a dark seam between them, so the arms look hung on the body rather than grown
     * from it".
     *
     * A rounded cap centred on the joint fixes it by overlapping BOTH: it reaches inboard over
     * the torso's corner and down over the top of the sleeve, so the silhouette runs unbroken
     * from collar to elbow. It is parented to the shoulder bone rather than skinned, so it
     * turns with the arm - a deltoid that stayed behind when the arm lifted would be a worse
     * artefact than the gap it replaces.
     */
    rigidMesh(
      `Mirela-${side}-Deltoid`,
      new THREE.SphereGeometry(height * 0.047, 12, 10),
      materials.shirt,
      bones[shoulderName],
      new THREE.Vector3(0, -height * 0.006, 0)
    ).scale.set(0.88, 1.02, 0.94);
    root.add(
      skinnedMesh(
        `Mirela-${side}-UpperArm`,
        segmentGeometry(shoulder, elbow, height * 0.043, height * 0.036),
        materials.shirt,
        skeleton,
        shoulder,
        elbow,
        boneIndex[shoulderName],
        boneIndex[elbowName]
      )
    );
    root.add(
      skinnedMesh(
        `Mirela-${side}-Forearm`,
        segmentGeometry(elbow, wrist, height * 0.035, height * 0.029),
        materials.skin,
        skeleton,
        elbow,
        wrist,
        boneIndex[elbowName],
        boneIndex[wristName]
      )
    );
    rigidMesh(
      `Mirela-${side}-Hand`,
      new THREE.CapsuleGeometry(height * 0.027, height * 0.055, 5, 10),
      materials.skin,
      bones[wristName],
      new THREE.Vector3(0, -height * 0.037, height * 0.016)
    ).scale.set(0.92, 1.08, 0.72);
  }

  for (const side of ['left', 'right'] as const) {
    const hipName = `${side}Hip` as const;
    const kneeName = `${side}Knee` as const;
    const ankleName = `${side}Ankle` as const;
    const hip = worldAt(hipName);
    const knee = worldAt(kneeName);
    const ankle = worldAt(ankleName);
    root.add(
      skinnedMesh(
        `Mirela-${side}-Thigh`,
        segmentGeometry(hip, knee, height * 0.057, height * 0.046, 10, 10),
        materials.pants,
        skeleton,
        hip,
        knee,
        boneIndex[hipName],
        boneIndex[kneeName]
      )
    );
    root.add(
      skinnedMesh(
        `Mirela-${side}-Shin`,
        segmentGeometry(knee, ankle, height * 0.046, height * 0.037, 10, 10),
        materials.shirt,
        skeleton,
        knee,
        ankle,
        boneIndex[kneeName],
        boneIndex[ankleName]
      )
    );
    const boot = rigidMesh(
      `Mirela-${side}-Boot`,
      new THREE.CapsuleGeometry(height * 0.042, height * 0.075, 5, 10),
      materials.boots,
      bones[ankleName],
      new THREE.Vector3(0, -height * 0.043, height * 0.055)
    );
    boot.rotation.x = Math.PI * 0.5;
    boot.scale.set(1.05, 1.34, 0.88);
  }

  const head = rigidMesh(
    'Mirela-Head',
    new THREE.SphereGeometry(headHeight * 0.5, 18, 12),
    materials.skin,
    bones.head,
    new THREE.Vector3(0, headHeight * 0.17, 0)
  );
  head.scale.set(0.7, 1, 0.76);
  rigidMesh(
    'Mirela-Jaw',
    new THREE.SphereGeometry(headHeight * 0.33, 14, 9),
    materials.skinShadow,
    bones.head,
    new THREE.Vector3(0, -headHeight * 0.08, headHeight * 0.035)
  ).scale.set(0.83, 0.72, 0.78);

  const hairCap = rigidMesh(
    'Mirela-Hair-Cap',
    new THREE.SphereGeometry(headHeight * 0.515, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.56),
    materials.hair,
    bones.head,
    new THREE.Vector3(0, headHeight * 0.2, -headHeight * 0.025)
  );
  hairCap.scale.set(0.72, 1, 0.78);
  rigidMesh(
    'Mirela-Hair-Bun',
    new THREE.SphereGeometry(headHeight * 0.18, 12, 8),
    materials.hairHighlight,
    bones.head,
    new THREE.Vector3(0, headHeight * 0.26, -headHeight * 0.36)
  ).scale.set(1.2, 0.9, 0.72);

  for (const side of [-1, 1]) {
    const sideLock = rigidMesh(
      `Mirela-Hair-Lock-${side < 0 ? 'Right' : 'Left'}`,
      new THREE.CapsuleGeometry(headHeight * 0.052, headHeight * 0.2, 5, 8),
      materials.hair,
      bones.head,
      new THREE.Vector3(side * headHeight * 0.285, headHeight * 0.055, -headHeight * 0.02)
    );
    sideLock.rotation.z = side * 0.13;
  }

  rigidMesh(
    'Mirela-Headband-Front',
    new THREE.BoxGeometry(headHeight * 0.55, headHeight * 0.055, headHeight * 0.025),
    materials.headband,
    bones.head,
    new THREE.Vector3(0, headHeight * 0.31, headHeight * 0.355)
  );

  for (const side of [-1, 1]) {
    const eye = rigidMesh(
      `Mirela-Eye-${side < 0 ? 'Right' : 'Left'}`,
      new THREE.SphereGeometry(headHeight * 0.035, 8, 6),
      materials.eyes,
      bones.head,
      new THREE.Vector3(side * headHeight * 0.145, headHeight * 0.13, headHeight * 0.36)
    );
    eye.scale.set(1.0, 0.72, 0.42);
    const brow = rigidMesh(
      `Mirela-Brow-${side < 0 ? 'Right' : 'Left'}`,
      new THREE.BoxGeometry(headHeight * 0.13, headHeight * 0.018, headHeight * 0.018),
      materials.hair,
      bones.head,
      new THREE.Vector3(side * headHeight * 0.145, headHeight * 0.2, headHeight * 0.37)
    );
    brow.rotation.z = side * -0.08;
  }
  const nose = rigidMesh(
    'Mirela-Nose',
    new THREE.ConeGeometry(headHeight * 0.05, headHeight * 0.12, 5),
    materials.skinShadow,
    bones.head,
    new THREE.Vector3(0, headHeight * 0.045, headHeight * 0.39)
  );
  nose.rotation.x = Math.PI * 0.5;

  const mouth = rigidMesh(
    'Mirela-Mouth',
    new THREE.CapsuleGeometry(headHeight * 0.012, headHeight * 0.105, 4, 8),
    materials.lips,
    bones.head,
    new THREE.Vector3(0, -headHeight * 0.105, headHeight * 0.382)
  );
  mouth.rotation.z = Math.PI * 0.5;
  mouth.scale.set(1, 0.6, 0.45);

  const buckle = rigidMesh(
    'Mirela-Apron-Buckle',
    new THREE.TorusGeometry(height * 0.021, height * 0.005, 5, 10),
    materials.metal,
    bones.chest,
    new THREE.Vector3(0, -torsoHeight * 0.08, height * 0.085)
  );
  buckle.rotation.x = Math.PI * 0.5;

  root.updateMatrixWorld(true);
  skeleton.calculateInverses();
  for (const object of root.children) {
    const mesh = object as THREE.SkinnedMesh;
    if (mesh.isSkinnedMesh) mesh.bind(skeleton);
  }

  let currentPose: MirelaPoseId = 'neutral';
  let idleClock = 0;
  const setPose = (pose: MirelaPoseId): void => {
    currentPose = pose;
    resetPose(bones);
    if (pose === 'shoulders' || pose === 'full-stress') {
      bones.leftShoulder.rotation.z = -0.88;
      bones.rightShoulder.rotation.z = 0.88;
    }
    if (pose === 'elbows' || pose === 'full-stress') {
      bones.leftElbow.rotation.x = -1.42;
      bones.rightElbow.rotation.x = -1.42;
    }
    if (pose === 'hips' || pose === 'full-stress') {
      bones.leftHip.rotation.x = -0.56;
      bones.rightHip.rotation.x = 0.28;
    }
    if (pose === 'knees' || pose === 'full-stress') {
      bones.leftKnee.rotation.x = 1.05;
      bones.rightKnee.rotation.x = 0.72;
    }
    if (pose === 'full-stress') {
      bones.chest.rotation.y = 0.32;
      bones.head.rotation.y = -0.24;
    }
    root.updateMatrixWorld(true);
  };

  const updateIdle = (deltaTime: number): void => {
    if (currentPose !== 'neutral') return;
    idleClock += deltaTime;
    const breath = Math.sin(idleClock * 1.35) * 0.012;
    const weightShift = Math.sin(idleClock * 0.47 + 0.8) * 0.008;
    bones.spine.rotation.x = breath;
    bones.chest.rotation.z = weightShift;
    bones.head.rotation.y = Math.sin(idleClock * 0.31 + 1.2) * 0.015;
  };

  const rig: MirelaProceduralRig = {
    bones,
    skeleton,
    boneOrder,
    boneIndex,
    bound: root.children.filter((child) => (child as THREE.SkinnedMesh).isSkinnedMesh)
      .every((child) => (child as THREE.SkinnedMesh).skeleton === skeleton),
  };
  root.userData.rig = rig;
  root.userData.sculptRuntime = {
    sourceHash: spec.source.sha256,
    mode: spec.reconstruction.mode,
    nodes: Object.fromEntries(root.children.map((child) => [child.name, child])),
    sockets: {
      head: bones.head,
      leftHand: bones.leftWrist,
      rightHand: bones.rightWrist,
    },
    colliders: [],
  };

  const metrics = collectMetrics(root, performance.now() - started, boneOrder.length);
  return {
    root,
    rig,
    metrics,
    setPose,
    updateIdle,
    dispose: () => {
      root.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
      });
      for (const material of Object.values(materials)) material.dispose();
      skeleton.dispose();
    },
  };
}
