import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { placeRigged } from '../../view/riggedContact.js';
import {
  createMirelaProceduralModel,
  MIRELA_POSES,
} from './MirelaProceduralModel.js';

import type {
  MirelaPoseId,
  MirelaProceduralCharacter,
  MirelaProceduralMetrics,
} from './MirelaProceduralModel.js';
import type { RiggedContact } from '../../view/riggedContact.js';

type ReviewMode = 'both' | 'reference' | 'procedural';

interface ReviewCameraSpec {
  azimuthDegrees: number;
  elevationDegrees: number;
  target: [number, number, number];
  distance: number;
  fovDegrees: number;
  near: number;
  far: number;
}

interface Img2ThreeCaptureApi {
  setCamera: (camera: ReviewCameraSpec) => Promise<void>;
  setReferenceMode: (options: { kind: 'glb' | 'procedural' | 'both' }) => Promise<void>;
  capturePass: (options: { passId: string; mode: 'reference' | 'procedural' }) => Promise<{
    ok: true;
    selector: 'canvas';
  }>;
}

declare global {
  interface Window {
    __IMG2THREEJS_READY__?: boolean;
    __IMG2THREEJS_CAPTURE__?: Img2ThreeCaptureApi;
  }
}

interface ObjectMetrics {
  meshes: number;
  triangles: number;
  vertices: number;
  materials: number;
  drawCalls: number;
  geometryBytes: number;
}

const CAMERA_MATRIX = new THREE.Matrix4();
const CAMERA_TARGET = new THREE.Vector3(0, 0.86, 0);
const CAMERA_POSITION = new THREE.Vector3(0, 1.05, 4.3);
const CAMERA_UP = new THREE.Vector3(0, 1, 0);

const REVIEW_CAMERAS: readonly ReviewCameraSpec[] = [
  { azimuthDegrees: 0, elevationDegrees: 3, target: [0, 0.86, 0], distance: 4.3, fovDegrees: 38, near: 0.05, far: 30 },
  { azimuthDegrees: 35, elevationDegrees: 5, target: [0, 0.86, 0], distance: 4.3, fovDegrees: 38, near: 0.05, far: 30 },
  { azimuthDegrees: -35, elevationDegrees: 5, target: [0, 0.86, 0], distance: 4.3, fovDegrees: 38, near: 0.05, far: 30 },
  { azimuthDegrees: 90, elevationDegrees: 4, target: [0, 0.86, 0], distance: 4.3, fovDegrees: 38, near: 0.05, far: 30 },
  { azimuthDegrees: 135, elevationDegrees: 5, target: [0, 0.86, 0], distance: 4.3, fovDegrees: 38, near: 0.05, far: 30 },
  { azimuthDegrees: 180, elevationDegrees: 4, target: [0, 0.86, 0], distance: 4.3, fovDegrees: 38, near: 0.05, far: 30 },
  { azimuthDegrees: 0, elevationDegrees: 2, target: [0, 1.49, 0.02], distance: 1.8, fovDegrees: 32, near: 0.05, far: 30 },
  { azimuthDegrees: 35, elevationDegrees: 4, target: [0, 1.49, 0.02], distance: 1.8, fovDegrees: 32, near: 0.05, far: 30 },
] as const;

function collectMetrics(root: THREE.Object3D): ObjectMetrics {
  let meshes = 0;
  let triangles = 0;
  let vertices = 0;
  let drawCalls = 0;
  let geometryBytes = 0;
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    meshes++;
    const position = mesh.geometry.getAttribute('position');
    vertices += position?.count ?? 0;
    triangles += mesh.geometry.index
      ? mesh.geometry.index.count / 3
      : (position?.count ?? 0) / 3;
    const assigned = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    drawCalls += Math.max(1, mesh.geometry.groups.length || assigned.length);
    for (const attribute of Object.values(mesh.geometry.attributes)) {
      geometryBytes += attribute.array.byteLength;
    }
    if (mesh.geometry.index) geometryBytes += mesh.geometry.index.array.byteLength;
    for (const material of assigned) materials.add(material);
  });
  return {
    meshes,
    triangles: Math.round(triangles),
    vertices,
    materials: materials.size,
    drawCalls,
    geometryBytes,
  };
}

function metricsLine(label: string, metrics: ObjectMetrics | MirelaProceduralMetrics): string {
  const geometryKb = (metrics.geometryBytes / 1024).toFixed(0);
  const construction = 'constructionMs' in metrics
    ? ` // ${metrics.constructionMs.toFixed(2)} ms build`
    : '';
  return `${label}: ${metrics.triangles.toLocaleString()} tri // ${metrics.vertices.toLocaleString()} vert // ${metrics.drawCalls} draw // ${geometryKb} KB geo${construction}`;
}

@ENGINE.GameClass()
export class MirelaProceduralTestRig extends ENGINE.SceneNode {
  private camera: ENGINE.ViewTargetCameraNode | null = null;
  private reference: RiggedContact | null = null;
  private procedural: MirelaProceduralCharacter | null = null;
  private mode: ReviewMode = 'both';
  private pose: MirelaPoseId = 'neutral';
  private cameraIndex = 0;
  private referenceReady = false;
  private controls: ENGINE.ControlsPanel | null = null;
  private referenceBadge: ENGINE.Badge | null = null;
  private proceduralBadge: ENGINE.Badge | null = null;
  private statusCard: ENGINE.Card | null = null;
  private keyHandler: ((event: KeyboardEvent) => void) | null = null;

  constructor() {
    super();
    this.isRoot = true;
  }

  public override initialize(options?: ENGINE.SceneNodeOptions): void {
    super.initialize(options);
    this.buildStage();
    this.buildSubjects();
    this.buildCamera();
    this.buildLights();
  }

  public override beginPlay(): boolean {
    if (!super.beginPlay()) return false;
    this.camera?.setActive(true);
    this.installInput();
    this.installCaptureApi();
    void this.buildUi();
    return true;
  }

  public override tickPrePhysics(deltaTime: number): void {
    super.tickPrePhysics(deltaTime);
    if (this.camera && !this.camera.isActive()) this.camera.setActive(true);
    this.reference?.idle(deltaTime);
    this.procedural?.updateIdle(deltaTime);

    if (!this.referenceReady && this.reference && Object.keys(this.reference.bones).length > 0) {
      this.referenceReady = true;
      window.__IMG2THREEJS_READY__ = true;
      this.refreshStatus();
    }
  }

  public override endPlay(): boolean {
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.keyHandler = null;
    this.controls?.destroy();
    this.referenceBadge?.destroy();
    this.proceduralBadge?.destroy();
    this.statusCard?.destroy();
    this.controls = null;
    this.referenceBadge = null;
    this.proceduralBadge = null;
    this.statusCard = null;
    this.procedural?.dispose();
    this.procedural = null;
    delete window.__IMG2THREEJS_CAPTURE__;
    delete window.__IMG2THREEJS_READY__;
    return super.endPlay();
  }

  private buildStage(): void {
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: '#31383a',
      roughness: 0.9,
      metalness: 0,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 5), floorMaterial);
    floor.name = 'NeutralReviewFloor';
    floor.rotation.x = -Math.PI * 0.5;
    floor.receiveShadow = true;
    this.add(floor);

    const backdropMaterial = new THREE.MeshStandardMaterial({
      color: '#344249',
      roughness: 0.96,
      metalness: 0,
    });
    const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(8, 4), backdropMaterial);
    backdrop.name = 'NeutralReviewBackdrop';
    backdrop.position.set(0, 1.8, -1.05);
    this.add(backdrop);

    const grid = new THREE.GridHelper(6, 24, '#78908d', '#414f4f');
    grid.name = 'MeasurementGrid';
    grid.position.y = 0.003;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.26;
    this.add(grid);
  }

  private buildSubjects(): void {
    this.reference = placeRigged('Mirela-Reference', {
      modelUrl: '@project/assets/models/Mirela.glb',
      position: new THREE.Vector3(-0.76, 0, 0),
      height: 1.66,
      clip: true,
      settleWrists: 0.7,
    });
    this.add(this.reference.root);

    this.procedural = createMirelaProceduralModel();
    this.procedural.root.position.set(0.76, 0, 0);
    this.add(this.procedural.root);
  }

  private buildCamera(): void {
    this.camera = ENGINE.ViewTargetCameraNode.create({
      name: 'MirelaProceduralReviewCamera',
      fov: REVIEW_CAMERAS[0].fovDegrees,
      near: REVIEW_CAMERAS[0].near,
      far: REVIEW_CAMERAS[0].far,
      startActive: true,
      position: CAMERA_POSITION.clone(),
    });
    this.add(this.camera);
    this.applyCamera(REVIEW_CAMERAS[0]);
  }

  private buildLights(): void {
    const key = ENGINE.DirectionalLightNode.create({
      name: 'MirelaReviewKey',
      color: '#ffe3c1',
      intensity: 3.15,
      position: new THREE.Vector3(-3.2, 4.8, 4.2),
      castShadow: true,
      shadowMapSize: 2048,
      shadowFar: 16,
      shadowBias: -0.00025,
      shadowNormalBias: 0.018,
    });
    this.add(key);
    key.lookAt(new THREE.Vector3(0, 0.85, 0));
    this.add(
      ENGINE.HemisphereLightNode.create({
        name: 'MirelaReviewFill',
        color: '#9fc4ce',
        groundColor: '#3c2f2a',
        intensity: 1.35,
      })
    );
    const cameraFill = ENGINE.DirectionalLightNode.create({
      name: 'MirelaReviewCameraFill',
      color: '#d8edf0',
      intensity: 1.25,
      position: new THREE.Vector3(3.8, 2.7, 5.2),
      castShadow: false,
    });
    this.add(cameraFill);
    cameraFill.lookAt(new THREE.Vector3(0, 0.95, 0));
  }

  private applyCamera(spec: ReviewCameraSpec): void {
    if (!this.camera) return;
    const azimuth = THREE.MathUtils.degToRad(spec.azimuthDegrees);
    const elevation = THREE.MathUtils.degToRad(spec.elevationDegrees);
    CAMERA_TARGET.fromArray(spec.target);
    const horizontal = Math.cos(elevation) * spec.distance;
    CAMERA_POSITION.set(
      CAMERA_TARGET.x + Math.sin(azimuth) * horizontal,
      CAMERA_TARGET.y + Math.sin(elevation) * spec.distance,
      CAMERA_TARGET.z + Math.cos(azimuth) * horizontal
    );
    this.camera.position.copy(CAMERA_POSITION);
    this.camera.setFOV(spec.fovDegrees);
    this.camera.setNear(spec.near);
    this.camera.setFar(spec.far);
    CAMERA_MATRIX.lookAt(CAMERA_POSITION, CAMERA_TARGET, CAMERA_UP);
    this.camera.quaternion.setFromRotationMatrix(CAMERA_MATRIX);
  }

  private setMode(mode: ReviewMode): void {
    this.mode = mode;
    if (!this.reference || !this.procedural) return;
    this.reference.root.visible = mode !== 'procedural';
    this.procedural.root.visible = mode !== 'reference';
    this.reference.root.position.x = mode === 'both' ? -0.76 : 0;
    this.procedural.root.position.x = mode === 'both' ? 0.76 : 0;
    this.referenceBadge?.setColor(mode === 'procedural' ? 'red' : 'orange');
    this.proceduralBadge?.setColor(mode === 'reference' ? 'red' : 'green');
    this.refreshStatus();
  }

  private cycleMode(): void {
    const modes: readonly ReviewMode[] = ['both', 'reference', 'procedural'];
    this.setMode(modes[(modes.indexOf(this.mode) + 1) % modes.length]);
  }

  private cyclePose(): void {
    const index = (MIRELA_POSES.indexOf(this.pose) + 1) % MIRELA_POSES.length;
    this.pose = MIRELA_POSES[index];
    this.procedural?.setPose(this.pose);
    this.refreshStatus();
  }

  private installInput(): void {
    this.keyHandler = (event: KeyboardEvent): void => {
      if (/^Digit[1-8]$/.test(event.code)) {
        this.cameraIndex = Number(event.code.slice(-1)) - 1;
        this.applyCamera(REVIEW_CAMERAS[this.cameraIndex]);
        this.refreshStatus();
        return;
      }
      if (event.code === 'KeyP') this.cyclePose();
      if (event.code === 'KeyR') this.cycleMode();
      if (event.code === 'KeyN') {
        this.pose = 'neutral';
        this.procedural?.setPose('neutral');
        this.refreshStatus();
      }
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  private async buildUi(): Promise<void> {
    const world = this.getWorld();
    if (!world) return;
    this.controls = new ENGINE.ControlsPanel(world.uiManager, {
      title: 'MIRELA // PROCEDURAL REVIEW',
      position: 'bottom-left',
      controls: [
        { key: '1-6', description: 'Full-body review cameras' },
        { key: '7-8', description: 'Head review cameras' },
        { key: 'P', description: 'Cycle deformation pose' },
        { key: 'N', description: 'Return to neutral idle' },
        { key: 'R', description: 'Both / GLB / procedural' },
      ],
    });
    this.referenceBadge = new ENGINE.Badge(world.uiManager, {
      label: 'REFERENCE // MIRELA.GLB',
      color: 'orange',
      size: 'large',
      dot: true,
      position: 'top-left',
    });
    this.proceduralBadge = new ENGINE.Badge(world.uiManager, {
      label: 'CODE-ONLY // PROCEDURAL',
      color: 'green',
      size: 'large',
      dot: true,
      position: 'top-right',
    });
    this.statusCard = new ENGINE.Card(world.uiManager, {
      title: 'IMG2THREEJS 1.5.1 // MIRELA TEST',
      subtitle: 'Shared camera, lighting, scale and post-processing',
      body: 'Loading GLB baseline…',
      variant: 'glass',
      position: 'top-center',
    });
    await Promise.all([
      this.controls.initialize(),
      this.referenceBadge.initialize(),
      this.proceduralBadge.initialize(),
      this.statusCard.initialize(),
    ]);
    this.refreshStatus();
  }

  private refreshStatus(): void {
    if (!this.statusCard || !this.procedural) return;
    const procedural = metricsLine('PROC', this.procedural.metrics);
    const reference = this.referenceReady && this.reference
      ? metricsLine('GLB', collectMetrics(this.reference.root))
      : 'GLB: loading baseline…';
    this.statusCard.setBody(
      `${reference}\n${procedural}\nPOSE ${this.pose.toUpperCase()} // VIEW ${this.cameraIndex + 1} // MODE ${this.mode.toUpperCase()} // RIG ${this.procedural.rig.bound ? 'BOUND' : 'FAILED'}`
    );
  }

  private installCaptureApi(): void {
    window.__IMG2THREEJS_READY__ = false;
    window.__IMG2THREEJS_CAPTURE__ = {
      setCamera: async (spec) => {
        this.applyCamera(spec);
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      },
      setReferenceMode: async ({ kind }) => {
        this.setMode(kind === 'glb' ? 'reference' : kind);
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      },
      capturePass: async ({ passId, mode }) => {
        if (passId !== 'beauty') {
          throw new Error(`Unsupported Mirela review pass: ${passId}`);
        }
        this.setMode(mode);
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        return { ok: true, selector: 'canvas' };
      },
    };
  }
}
