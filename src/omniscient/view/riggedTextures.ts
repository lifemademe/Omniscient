import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { capHighlights, debakeHighlights } from '../art/debake.js';

// Templates never enter a material or upload to the GPU. Instances own their texture
// objects, sharing only the immutable prepared pixels, not the engine's mutable source.
const prepared = new WeakMap<THREE.Texture, THREE.Texture>();
const overrides = new WeakMap<THREE.Texture, Map<string, Promise<THREE.Texture>>>();

function prepare(source: THREE.Texture): THREE.Texture {
  const cached = prepared.get(source);
  if (cached) return cached;
  const result = source.clone();
  result.source = new THREE.Source(source.image);
  debakeHighlights(result, { threshold: 0.07, strength: 1, blur: 32 });
  capHighlights(result, 0.62);
  prepared.set(source, result);
  return result;
}

export function clonePreparedCharacterMap(source: THREE.Texture): THREE.Texture {
  return prepare(source).clone();
}

/** Populate only immutable CPU pixels; do not allocate an instance/GPU texture. */
export function prepareCharacterMap(source: THREE.Texture): void {
  prepare(source);
}

export async function loadCharacterMapOverride(url: string, original: THREE.Texture): Promise<THREE.Texture> {
  let variants = overrides.get(original);
  if (!variants) {
    variants = new Map();
    overrides.set(original, variants);
  }
  let pending = variants.get(url);
  if (!pending) {
    pending = ENGINE.resourceManager.loadTexture(ENGINE.AssetPath.fromString(url)).then((loaded) => {
      if (!loaded) {
        ENGINE.resourceManager.invalidateTextureCache(url);
        throw new Error(`Character texture failed to load: ${url}`);
      }
      const result = prepare(loaded).clone();
      // GLTF UV orientation differs from a standalone image. Retain the model's
      // authored transform, colour interpretation and nearest-neighbour sampling.
      result.flipY = original.flipY;
      result.colorSpace = original.colorSpace;
      result.channel = original.channel;
      result.wrapS = original.wrapS;
      result.wrapT = original.wrapT;
      result.offset.copy(original.offset);
      result.repeat.copy(original.repeat);
      result.center.copy(original.center);
      result.rotation = original.rotation;
      result.magFilter = original.magFilter;
      result.minFilter = original.minFilter;
      result.generateMipmaps = original.generateMipmaps;
      result.anisotropy = original.anisotropy;
      result.updateMatrix();
      return result;
    });
    variants.set(url, pending);
    // A rejected preparation must remain retryable and never become an unhandled
    // rejection while the caller is still constructing the rest of the facility.
    void pending.catch(() => {
      if (variants?.get(url) === pending) {
        variants.delete(url);
        ENGINE.resourceManager.invalidateTextureCache(url);
      }
    });
  }
  return (await pending).clone();
}
