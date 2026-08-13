/**
 * A minimal tween runner.
 *
 * Gauntlet §209 puts the entire Contact View performance on moving objects and cameras
 * rather than on character rigs, so tweening is load-bearing presentation code. It is
 * implemented here rather than pulled from @tweenjs/tween.js so that everything advances
 * off the node's own deltaTime - one clock, no global group to forget to update, and
 * deterministic under a fixed timestep.
 */

export type Easing = (t: number) => number;

export const Ease = {
  linear: (t: number) => t,
  /** Default for camera moves - starts and ends soft, never mechanical. */
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  /** For things a hand did - a switch thrown, a panel pushed. */
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
} satisfies Record<string, Easing>;

interface ActiveTween {
  elapsed: number;
  duration: number;
  delay: number;
  easing: Easing;
  onUpdate: (t: number) => void;
  onComplete?: () => void;
  /** Tweens sharing a channel replace one another, so cues cannot fight. */
  channel: string | null;
}

export interface TweenOptions {
  duration: number;
  easing?: Easing;
  delay?: number;
  onComplete?: () => void;
  /**
   * Optional channel key. Starting a tween on a channel cancels any running tween on
   * the same channel - e.g. two camera cues in quick succession must not blend into a
   * meaningless average.
   */
  channel?: string;
}

export class Tweener {
  private tweens: ActiveTween[] = [];

  /** @param onUpdate receives eased progress in [0, 1]. */
  public add(onUpdate: (t: number) => void, options: TweenOptions): void {
    if (options.channel) {
      this.tweens = this.tweens.filter((tween) => tween.channel !== options.channel);
    }

    this.tweens.push({
      elapsed: 0,
      duration: Math.max(options.duration, 0.0001),
      delay: options.delay ?? 0,
      easing: options.easing ?? Ease.inOutCubic,
      onUpdate,
      onComplete: options.onComplete,
      channel: options.channel ?? null,
    });
  }

  public update(deltaTime: number): void {
    if (this.tweens.length === 0) return;

    const finished: ActiveTween[] = [];

    for (const tween of this.tweens) {
      if (tween.delay > 0) {
        tween.delay -= deltaTime;
        continue;
      }

      tween.elapsed += deltaTime;
      const raw = Math.min(tween.elapsed / tween.duration, 1);
      tween.onUpdate(tween.easing(raw));
      if (raw >= 1) finished.push(tween);
    }

    if (finished.length === 0) return;
    this.tweens = this.tweens.filter((tween) => !finished.includes(tween));
    finished.forEach((tween) => tween.onComplete?.());
  }

  public clear(): void {
    this.tweens = [];
  }

  public get activeCount(): number {
    return this.tweens.length;
  }
}
