import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { loadGesture, type GestureName } from '../view/gestures.js';
import { prepareCharacterMap } from '../view/riggedTextures.js';
import { WAREHOUSE_WORKER_TEXTURES } from './workerAppearance.js';

// Workers, all six deterministic visitor choices, local response and intruder.
// Cargo is procedural geometry + canvas labels, with no asynchronous file assets.
const CHARACTER_MODELS = [
  '@project/assets/models/Tomas.glb',
  '@project/assets/models/Mirela.glb',
  '@project/assets/models/Ileana.glb',
  '@project/assets/models/Adaeze.glb',
  '@project/assets/models/Sanda.glb',
  '@project/assets/models/Dorin.glb',
  '@project/assets/models/Vasile.glb',
  '@project/assets/models/Lucian.glb',
] as const;

export const WAREHOUSE_CHARACTER_ANIMATIONS: readonly GestureName[] = [
  'walk', 'run', 'crouchIdle', 'crouchWalk', 'open',
];

export interface WarehouseAssetProgress {
  kind: 'model' | 'texture' | 'animation';
  asset: string;
  completed: number;
  total: number;
}

export interface WarehouseAssetPreparationOptions {
  signal?: AbortSignal;
  onProgress?: (progress: WarehouseAssetProgress) => void;
}

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException('Warehouse preparation cancelled', 'AbortError');
}

/** Abandon this consumer immediately; never cancel the engine's shared asset request. */
function waitForAsset<T>(pending: Promise<T>, signal?: AbortSignal, onTimeout?: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => {
      cleanup();
      reject(signal?.reason ?? new DOMException('Warehouse preparation cancelled', 'AbortError'));
    };
    const timer = setTimeout(() => {
      cleanup();
      onTimeout?.();
      reject(new Error('Warehouse asset preparation timed out'));
    }, 30000);
    const cleanup = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    };
    signal?.addEventListener('abort', abort, { once: true });
    pending.then((value) => {
      cleanup();
      if (signal?.aborted) abort();
      else resolve(value);
    }, (error: unknown) => {
      cleanup();
      reject(error);
    });
    // Attach settlement handlers even when already cancelled: the shared request
    // may still reject later, and must not become an unhandled rejection.
    if (signal?.aborted) abort();
  });
}

/** Cache file assets and CPU texture preparation before any mission clock starts. */
export async function prepareWarehouseAssets(options: WarehouseAssetPreparationOptions = {}): Promise<void> {
  const { signal, onProgress } = options;
  const textureUrls = Object.values(WAREHOUSE_WORKER_TEXTURES).filter((url): url is Exclude<typeof url, undefined> => url !== undefined);
  const total = CHARACTER_MODELS.length + textureUrls.length + WAREHOUSE_CHARACTER_ANIMATIONS.length;
  let completed = 0;
  const next = async (kind: WarehouseAssetProgress['kind'], asset: string): Promise<void> => {
    checkAbort(signal);
    onProgress?.({ kind, asset, completed: ++completed, total });
    // One resource/debake per turn, even when every engine request is cached.
    await waitForAsset(new Promise<void>((resolve) => setTimeout(resolve, 0)), signal);
    checkAbort(signal);
  };

  for (const url of CHARACTER_MODELS) {
    checkAbort(signal);
    const invalidate = (): void => ENGINE.resourceManager.invalidateModelCache(url);
    const loading = ENGINE.resourceManager.loadModel(ENGINE.AssetPath.fromString(url)).then((model) => {
      if (!model) invalidate();
      return model;
    }, (error: unknown) => {
      invalidate();
      throw error;
    });
    const model = await waitForAsset(loading, signal, invalidate);
    checkAbort(signal);
    if (!model) throw new Error(`Warehouse character failed to load: ${url}`);
    const maps = new Set<THREE.Texture>();
    model.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const map = (material as THREE.MeshStandardMaterial).map;
        if (map) maps.add(map);
      }
    });
    for (const map of maps) {
      checkAbort(signal);
      prepareCharacterMap(map);
      await waitForAsset(new Promise<void>((resolve) => setTimeout(resolve, 0)), signal);
    }
    await next('model', url);
  }
  for (const url of textureUrls) {
    checkAbort(signal);
    const invalidate = (): void => ENGINE.resourceManager.invalidateTextureCache(url);
    const loading = ENGINE.resourceManager.loadTexture(ENGINE.AssetPath.fromString(url)).then((texture) => {
      if (!texture) invalidate();
      return texture;
    }, (error: unknown) => {
      invalidate();
      throw error;
    });
    const texture = await waitForAsset(loading, signal, invalidate);
    checkAbort(signal);
    if (!texture) throw new Error(`Warehouse worker texture failed to load: ${url}`);
    prepareCharacterMap(texture);
    await next('texture', url);
  }
  // Use the existing shared retargeted clip cache. Loading FBX through a second
  // loader here would not warm the clips which riggedContact actually consumes.
  for (const name of WAREHOUSE_CHARACTER_ANIMATIONS) {
    checkAbort(signal);
    const clip = await waitForAsset(loadGesture(name), signal);
    checkAbort(signal);
    if (!clip) throw new Error(`Warehouse animation failed to load: ${name}`);
    await next('animation', name);
  }
}
