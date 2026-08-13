/**
 * OMNISCIENT_
 *
 * You don't know everything. Yet.
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { OmniscientRig } from './omniscient/OmniscientRig.js';

@ENGINE.GameClass()
class MyGameMode extends ENGINE.GameMode {
  private rig: OmniscientRig | null = null;

  constructor() {
    super();
  }

  public override initialize(options?: ENGINE.GameModeOptions): void {
    super.initialize({
      ...options,
    });
  }

  public override beginPlay(): boolean {
    if (!super.beginPlay()) {
      return false;
    }

    const world = this.getWorld();
    if (world) {
      this.rig = OmniscientRig.create({
        name: 'OmniscientRig',
        position: new THREE.Vector3(0, 0, 0),
      });
      world.add(this.rig);
    }

    return true;
  }

  public override endPlay(): boolean {
    this.rig?.destroy();
    this.rig = null;
    return super.endPlay();
  }
}

class MyGame extends ENGINE.BaseGameLoop {
}

export function main(container: HTMLElement, options?: Partial<ENGINE.BaseGameLoopOptions>): ENGINE.IGameLoop {
  const mergedOptions: Partial<ENGINE.BaseGameLoopOptions> = {
    ...options,
    defaultGameModeClass: MyGameMode,
    rendererOptions: {
      ...options?.rendererOptions,
      // Forced to WebGL while Gauntlet §208a is open: imported glTF character materials
      // resolve to MeshPhongNodeMaterial and fail WGSL compilation under WebGPU.
      rendererType: 'webgl',
    },
  };
  const game = new MyGame(container, mergedOptions);
  return game;
}
