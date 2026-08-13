/**
 * The title screen's tree.
 *
 * The main menu shows the Knowledge Tree and nothing else, so on a fresh save it was
 * showing what a fresh save actually has: a fourteen-pixel sprout on a black screen. True,
 * and terrible - the hero object of the game read as a switched-off monitor.
 *
 * So the menu does not display the save state. It displays the whole arc, on a loop:
 * sprout to Transcendent, each stage drawing itself in, then fading back to nothing and
 * starting over. That is honest - it is plainly an attract sequence, not a readout - and
 * it puts the game's actual promise on the title screen. You are watching what you are
 * about to become.
 *
 * §123 still holds: the loop is driven by elapsed time against a fixed seed, so it is the
 * same sequence every time the game is opened.
 */

import { GrowthStage, KnowledgeTree } from './KnowledgeTree.js';

import type { PixelSurface } from './PixelSurface.js';

/** Seconds to draw one stage's new growth in. */
const GROW_SECONDS = 1.5;
/** Seconds to hold a completed stage before the next begins. */
const HOLD_SECONDS = 0.75;
/** Extra seconds to hold the finished tree before the loop restarts. */
const FINAL_HOLD_SECONDS = 3.2;

const STAGES: GrowthStage[] = [
  GrowthStage.Sprout,
  GrowthStage.Sapling,
  GrowthStage.Branching,
  GrowthStage.Interwoven,
  GrowthStage.Canopy,
  GrowthStage.Overgrown,
  GrowthStage.Transcendent,
];

const STEP_SECONDS = GROW_SECONDS + HOLD_SECONDS;
const CYCLE_SECONDS = STAGES.length * STEP_SECONDS + FINAL_HOLD_SECONDS;

export class TreeAttract {
  private readonly tree: KnowledgeTree;
  private elapsed = 0;
  /** Segment count of the previous stage, so growth draws on rather than redrawing. */
  private previousFraction = 0;
  private stageIndex = -1;

  constructor(
    private readonly surface: PixelSurface,
    private readonly seed: number
  ) {
    this.tree = new KnowledgeTree(surface, {
      seed,
      stage: GrowthStage.Sprout,
      connections: 0,
      alienGraft: false,
    });
  }

  /** Restart the loop from bare screen. Called whenever the menu is re-entered. */
  public reset(): void {
    this.elapsed = 0;
    this.stageIndex = -1;
    this.previousFraction = 0;
  }

  public advance(deltaTime: number, pulse: number): void {
    this.elapsed = (this.elapsed + deltaTime) % CYCLE_SECONDS;

    const index = Math.min(STAGES.length - 1, Math.floor(this.elapsed / STEP_SECONDS));
    const withinStep = this.elapsed - index * STEP_SECONDS;

    if (index !== this.stageIndex) {
      // Looping back to the start is a cut, not a graft - reveal the sprout from nothing.
      const wrapped = index < this.stageIndex;
      const before = this.tree.segmentCount;
      this.tree.setState({
        seed: this.seed,
        stage: STAGES[index],
        // Bridges appear late, once the tree is dense enough for them to read as a graft
        // between limbs rather than as a stray line.
        connections: Math.max(0, index - 3),
        alienGraft: index >= STAGES.length - 1,
      });
      this.previousFraction =
        wrapped || this.tree.segmentCount === 0 ? 0 : before / this.tree.segmentCount;
      this.stageIndex = index;
    }

    const growth = Math.min(1, withinStep / GROW_SECONDS);
    const reveal = this.previousFraction + (1 - this.previousFraction) * growth;
    this.tree.draw(reveal, pulse);
  }
}
