/**
 * OMNISCIENT_
 *
 * You don't know everything. Yet.
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { isPhoneRequested, PhoneClient } from './omniscient/link/PhoneClient.js';
import { M4SSRig } from './m4ss/M4SSRig.js';
import { OmniscientRig } from './omniscient/OmniscientRig.js';

/**
 * Which game this build starts.
 *
 * Two games share one Studio project while it is still an open question which of them goes
 * to the jam. `?game=m4ss` starts the slime; anything else starts OMNISCIENT_, so nothing
 * about the existing game changes by adding the other one.
 *
 * The same shape as the phone surface below - one bundle, one deploy, a query string
 * choosing what it becomes - because that pattern is already load-bearing here and a second
 * mechanism for the same job is a second thing to keep working.
 */
function wantsM4SS(): boolean {
  if (typeof location === 'undefined') return false;
  return new URLSearchParams(location.search).get('game') === 'm4ss';
}

@ENGINE.GameClass()
class MyGameMode extends ENGINE.GameMode {
  private rig: OmniscientRig | M4SSRig | null = null;

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
      this.rig = wantsM4SS()
        ? M4SSRig.create({ name: 'M4SSRig', position: new THREE.Vector3(0, 0, 0) })
        : OmniscientRig.create({ name: 'OmniscientRig', position: new THREE.Vector3(0, 0, 0) });
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

/**
 * Second-screen entry (§222).
 *
 * The same URL with `?surface=phone` becomes the intervention surface instead of the
 * game - which is precisely what a scanned code would open. One bundle, one deploy, and
 * the phone renders with the identical LocalSurface the desktop uses, so the two cannot
 * drift apart.
 *
 * Returns true when it took over, so main() knows not to start a game loop on top of it.
 */
function startSecondScreen(container: HTMLElement): boolean {
  if (!isPhoneRequested()) return false;

  container.style.background = '#05100a';
  void new PhoneClient().start(container);
  return true;
}

export function main(container: HTMLElement, options?: Partial<ENGINE.BaseGameLoopOptions>): ENGINE.IGameLoop {
  startSecondScreen(container);

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
