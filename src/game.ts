/**
 * Empty game template - minimal starting point for custom game development.
 */

import * as ENGINE from '@gnsx/genesys.js';

@ENGINE.GameClass()
class MyGameMode extends ENGINE.GameMode {
  constructor() {
    super();
  }

  public override initialize(options?: ENGINE.GameModeOptions): void {
    super.initialize({
      ...options,
    });
  }
}

class MyGame extends ENGINE.BaseGameLoop {
}

export function main(container: HTMLElement, options?: Partial<ENGINE.BaseGameLoopOptions>): ENGINE.IGameLoop {
  const mergedOptions: Partial<ENGINE.BaseGameLoopOptions> = {
    ...options,
    defaultGameModeClass: MyGameMode,
  };
  const game = new MyGame(container, mergedOptions);
  return game;
}
