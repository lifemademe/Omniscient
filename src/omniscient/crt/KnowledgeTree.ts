/**
 * The Living Knowledge Tree - pixel organism inside the CRT.
 *
 * Canonical per Gauntlet §174: a digital pixel-art organism displayed INSIDE the screen,
 * not a physical plant wrapping the hardware (that reading was superseded in v4.6).
 *
 * §175: the tree and the Knowledge Circuit are the same progression data in two
 * presentations. This module owns only the drawing; topology derives from a knowledge
 * state passed in, so the analytical view cannot drift out of sync with the emotional one.
 *
 * §123: generated deterministically from state. The same knowledge always draws the same
 * tree - never a different silhouette on reload.
 */

import { createRng, jitter, range } from '../core/rng.js';

import type { PixelSurface } from './PixelSurface.js';
import type { Rng } from '../core/rng.js';

/** §121 milestone growth states, in order. */
export enum GrowthStage {
  Sprout = 0,
  Sapling = 1,
  Branching = 2,
  Interwoven = 3,
  Canopy = 4,
  Overgrown = 5,
  Transcendent = 6,
}

export interface KnowledgeState {
  /** Stable seed for this playthrough. Same seed + same stage = same tree. */
  seed: number;
  stage: GrowthStage;
  /**
   * Cross-domain connections discovered (§107). Each one grafts a bridge between
   * two limbs rather than adding height.
   */
  connections: number;
  /**
   * Set once genuinely non-Earth knowledge is acquired (§122). Adds one unfamiliar
   * growth with different branching logic and colour. Never true before First Contact.
   */
  alienGraft: boolean;
}

interface Segment {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Recursion depth: 0 is the trunk. */
  depth: number;
  /** Draw order - lower draws first, so growth reads as spreading outward. */
  order: number;
  alien: boolean;
}

/** Per-stage topology. Tuned so each step is visible at a glance, per §175. */
const STAGE_CONFIG: Record<GrowthStage, { depth: number; trunk: number; spread: number }> = {
  [GrowthStage.Sprout]: { depth: 1, trunk: 14, spread: 0.5 },
  [GrowthStage.Sapling]: { depth: 3, trunk: 22, spread: 0.55 },
  [GrowthStage.Branching]: { depth: 4, trunk: 28, spread: 0.6 },
  [GrowthStage.Interwoven]: { depth: 5, trunk: 33, spread: 0.62 },
  [GrowthStage.Canopy]: { depth: 6, trunk: 38, spread: 0.66 },
  [GrowthStage.Overgrown]: { depth: 7, trunk: 44, spread: 0.72 },
  [GrowthStage.Transcendent]: { depth: 8, trunk: 48, spread: 0.78 },
};

const PALETTE = {
  /** Acid green = knowledge / AI activity (§9 colour language). */
  trunk: '#2f6b3a',
  branch: '#47a355',
  tip: '#7fe08a',
  /** Data pulse travelling the veins. */
  pulse: '#d8ffb0',
  /** Cross-domain bridges read warmer - a connection is a human thing. */
  bridge: '#c9a227',
  /** Non-Earth growth: cold, wrong, unexplained (§122 - no popup, let them notice). */
  alien: '#8f6bff',
};

/**
 * Build the full segment list for a knowledge state.
 * Breadth-first so `order` increases outward from the trunk.
 */
function growSegments(state: KnowledgeState, width: number, height: number): Segment[] {
  const cfg = STAGE_CONFIG[state.stage];
  const rng = createRng(state.seed);
  const segments: Segment[] = [];

  interface Frontier {
    x: number;
    y: number;
    angle: number;
    length: number;
    depth: number;
  }

  const baseX = width / 2;
  const baseY = height - 6;

  let frontier: Frontier[] = [
    { x: baseX, y: baseY, angle: -Math.PI / 2, length: cfg.trunk, depth: 0 },
  ];
  let order = 0;

  while (frontier.length > 0) {
    const next: Frontier[] = [];

    for (const node of frontier) {
      const x1 = node.x + Math.cos(node.angle) * node.length;
      const y1 = node.y + Math.sin(node.angle) * node.length;

      segments.push({
        x0: node.x,
        y0: node.y,
        x1,
        y1,
        depth: node.depth,
        order: order++,
        alien: false,
      });

      if (node.depth >= cfg.depth) continue;

      // Two children, occasionally three once the tree is dense enough to carry it.
      const childCount = node.depth > 1 && rng() < 0.22 ? 3 : 2;
      for (let i = 0; i < childCount; i++) {
        const offset = (i - (childCount - 1) / 2) * cfg.spread;
        next.push({
          x: x1,
          y: y1,
          angle: node.angle + offset + jitter(rng, 0.22),
          length: node.length * range(rng, 0.62, 0.78),
          depth: node.depth + 1,
        });
      }
    }

    frontier = next;
  }

  if (state.alienGraft) {
    appendAlienGraft(segments, rng, order);
  }

  return segments;
}

/**
 * One unfamiliar growth grafted into the existing tree (§122).
 * Deliberately different branching logic - straight, radial, too regular - so it reads
 * as not belonging without ever being labelled.
 */
function appendAlienGraft(segments: Segment[], rng: Rng, startOrder: number): void {
  if (segments.length === 0) return;

  const host = segments[Math.floor(rng() * segments.length * 0.6) + Math.floor(segments.length * 0.3)];
  if (!host) return;

  const arms = 5;
  const armLength = 9;
  for (let i = 0; i < arms; i++) {
    const angle = (i / arms) * Math.PI * 2;
    segments.push({
      x0: host.x1,
      y0: host.y1,
      x1: host.x1 + Math.cos(angle) * armLength,
      y1: host.y1 + Math.sin(angle) * armLength,
      depth: host.depth + 1,
      order: startOrder + i,
      alien: true,
    });
  }
}

/** Colour a segment by depth so the silhouette reads without any outline. */
function colorFor(segment: Segment, maxDepth: number): string {
  if (segment.alien) return PALETTE.alien;
  if (segment.depth === 0) return PALETTE.trunk;
  return segment.depth >= maxDepth - 1 ? PALETTE.tip : PALETTE.branch;
}

export class KnowledgeTree {
  private segments: Segment[] = [];
  private state: KnowledgeState;

  constructor(
    private readonly surface: PixelSurface,
    state: KnowledgeState
  ) {
    this.state = state;
    this.rebuild();
  }

  public getState(): Readonly<KnowledgeState> {
    return this.state;
  }

  /** Replace the knowledge state and regenerate topology. */
  public setState(state: KnowledgeState): void {
    this.state = state;
    this.rebuild();
  }

  private rebuild(): void {
    this.segments = growSegments(this.state, this.surface.width, this.surface.height);
  }

  /** Total segments at the current stage - the denominator for a reveal. */
  public get segmentCount(): number {
    return this.segments.length;
  }

  /**
   * Draw the tree.
   *
   * @param reveal 0-1 fraction of segments drawn, in growth order. Animate this from
   *   the previous stage's fraction to 1 for the §176 "new branch drawing itself
   *   pixel-by-pixel" return-to-home reveal.
   * @param pulse  0-1 phase of a data pulse travelling the veins. Purely decorative.
   */
  public draw(reveal = 1, pulse = -1): void {
    const cfg = STAGE_CONFIG[this.state.stage];
    const visible = Math.floor(this.segments.length * Math.min(Math.max(reveal, 0), 1));

    this.surface.clear();

    for (let i = 0; i < visible; i++) {
      const segment = this.segments[i];
      this.surface.line(segment.x0, segment.y0, segment.x1, segment.y1, colorFor(segment, cfg.depth));
    }

    this.drawBridges(visible);

    if (pulse >= 0) {
      this.drawPulse(visible, pulse);
    }

    this.surface.applyScanlines();
    this.surface.commit();
  }

  /**
   * Cross-domain connections bridge separate limbs (§107 / §117).
   * Drawn after the tree so a bridge always reads on top of what it joins.
   */
  private drawBridges(visible: number): void {
    if (this.state.connections <= 0 || visible < 4) return;

    const rng = createRng(this.state.seed ^ 0x9e3779b9);
    const count = Math.min(this.state.connections, 6);

    for (let i = 0; i < count; i++) {
      const a = this.segments[Math.floor(rng() * visible)];
      const b = this.segments[Math.floor(rng() * visible)];
      if (!a || !b || a === b) continue;
      this.surface.line(a.x1, a.y1, b.x1, b.y1, PALETTE.bridge);
    }
  }

  /** A single bright pixel running the trunk-to-tip path. */
  private drawPulse(visible: number, phase: number): void {
    if (visible === 0) return;
    const index = Math.min(Math.floor(phase * visible), visible - 1);
    const segment = this.segments[index];
    this.surface.pixel(segment.x1, segment.y1, PALETTE.pulse);
  }
}
