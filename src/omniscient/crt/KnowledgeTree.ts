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

/**
 * Per-stage topology. Tuned so each step is visible at a glance, per §175.
 *
 * `trunk` and `limb` are deliberately separate. They were one number, which coupled the
 * height of the bare stem to the size of the canopy - so every time the tree grew, the
 * trunk grew with it and the branching stayed marooned in the top third of the tube. A
 * tree gets *bushier* as it matures, not stiltier: the trunk barely moves after Sapling
 * and the canopy is what expands.
 */
const STAGE_CONFIG: Record<
  GrowthStage,
  { depth: number; trunk: number; limb: number; spread: number }
> = {
  // Sprout is what a brand-new save shows on the title screen, so it has to read as a
  // living thing rather than as a scratch on the tube - one fork and a pair of leaves,
  // small on purpose, but unmistakably something that has started.
  [GrowthStage.Sprout]: { depth: 2, trunk: 12, limb: 11, spread: 0.62 },
  [GrowthStage.Sapling]: { depth: 3, trunk: 15, limb: 15, spread: 0.58 },
  [GrowthStage.Branching]: { depth: 4, trunk: 18, limb: 20, spread: 0.64 },
  [GrowthStage.Interwoven]: { depth: 5, trunk: 21, limb: 23, spread: 0.7 },
  [GrowthStage.Canopy]: { depth: 6, trunk: 23, limb: 25, spread: 0.74 },
  [GrowthStage.Overgrown]: { depth: 7, trunk: 25, limb: 27, spread: 0.8 },
  [GrowthStage.Transcendent]: { depth: 8, trunk: 26, limb: 28, spread: 0.86 },
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
  /** The line the tree stands on. Dim enough to never compete with growth. */
  ground: '#2a5636',
  groundDim: '#1c3c26',
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

  let order = 0;

  /**
   * The trunk, in three leaning sections rather than one ruler-straight line.
   *
   * A single segment from the base gave every stage the same silhouette: a bare vertical
   * stick with a ball of twigs balanced on top. Sectioning it costs two extra segments
   * and buys a trunk that sways, and splitting the first branches off partway up means
   * the canopy starts low enough to read as a tree instead of as broccoli.
   */
  let trunkX = baseX;
  let trunkY = baseY;
  let trunkAngle = -Math.PI / 2 + jitter(rng, 0.05);
  const sections = 3;

  for (let i = 0; i < sections; i++) {
    const sectionLength = (cfg.trunk / sections) * range(rng, 0.88, 1.12);
    const x1 = trunkX + Math.cos(trunkAngle) * sectionLength;
    const y1 = trunkY + Math.sin(trunkAngle) * sectionLength;
    segments.push({ x0: trunkX, y0: trunkY, x1, y1, depth: 0, order: order++, alien: false });
    trunkX = x1;
    trunkY = y1;
    trunkAngle += jitter(rng, 0.13);
  }

  let frontier: Frontier[] = [
    { x: trunkX, y: trunkY, angle: trunkAngle, length: cfg.limb, depth: 1 },
  ];

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

      /**
       * Splits open wide at the base and tighten as they climb.
       *
       * Apical dominance is real, but applying it from the first fork made the leader
       * carry on almost vertically for several levels - so the tree grew a second, fake
       * trunk above the real one and the canopy ended up marooned at the top of the tube
       * again. Trees fork hardest where the limbs are thickest. Below depth 2 there is no
       * leader at all: it is a genuine fork, and that is what opens the silhouette out
       * across the width of the screen.
       */
      const openness = node.depth <= 1 ? 1.75 : node.depth === 2 ? 1.25 : 1;
      const hasLeader = node.depth >= 2;
      const leader = hasLeader ? Math.floor(rng() * childCount) : -1;

      for (let i = 0; i < childCount; i++) {
        const isLeader = i === leader;
        const offset =
          (i - (childCount - 1) / 2) * cfg.spread * openness * (isLeader ? 0.45 : 1.15);
        next.push({
          x: x1,
          y: y1,
          angle: node.angle + offset + jitter(rng, 0.22),
          length:
            node.length *
            (isLeader ? range(rng, 0.78, 0.92) : range(rng, 0.62, 0.78)),
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
    this.drawGroundline();

    // Trunk and main limbs glow; the fine outer twigs stay hard, so the halo reads as
    // depth in the canopy rather than fogging the whole tree into a green smear.
    for (let i = 0; i < visible; i++) {
      const segment = this.segments[i];
      const color = colorFor(segment, cfg.depth);
      if (segment.depth <= 2 && this.surface.glowLine) {
        this.surface.glowLine(segment.x0, segment.y0, segment.x1, segment.y1, color);
      } else {
        this.surface.line(segment.x0, segment.y0, segment.x1, segment.y1, color);
      }
    }

    this.drawBridges(visible);

    if (pulse >= 0) {
      this.drawPulse(visible, pulse);
    }

    this.surface.applyScanlines();
    this.surface.commit();
  }

  /**
   * A dim line for the tree to stand on.
   *
   * The menu screen shows real progress, which means a new save legitimately shows almost
   * nothing - and a sprout floating in the middle of an empty tube reads as a rendering
   * fault rather than as a beginning. A groundline costs three pixels of height, gives
   * the screen structure before anything has been learned, and makes the first branch
   * land somewhere instead of just appearing.
   */
  private drawGroundline(): void {
    const y = this.surface.height - 5;
    const margin = Math.round(this.surface.width * 0.14);

    this.surface.line(margin, y, this.surface.width - margin, y, PALETTE.ground);
    // Broken second line under it, so the base has a little depth rather than one hard rule.
    for (let x = margin + 4; x < this.surface.width - margin - 4; x += 7) {
      this.surface.line(x, y + 2, x + 3, y + 2, PALETTE.groundDim);
    }
  }

  /**
   * Cross-domain connections bridge separate limbs (§107 / §117).
   * Drawn after the tree so a bridge always reads on top of what it joins.
   */
  private drawBridges(visible: number): void {
    if (this.state.connections <= 0 || visible < 4) return;

    const rng = createRng(this.state.seed ^ 0x9e3779b9);
    const count = Math.min(this.state.connections, 6);

    // Only outer growth is eligible. Picking from the whole tree let a bridge run from a
    // trunk section to the far side of the canopy, which read as a lasso thrown over the
    // top rather than as two limbs finding each other.
    const tips = this.segments.slice(0, visible).filter((s) => s.depth >= 3);
    if (tips.length < 2) return;

    for (let i = 0; i < count; i++) {
      const a = tips[Math.floor(rng() * tips.length)];
      if (!a) continue;

      // The nearest tip that is far enough away to belong to a different limb. Close
      // enough to read as a graft, distant enough not to look like a drawing error.
      let best: Segment | null = null;
      let bestDistance = Infinity;
      for (const b of tips) {
        if (b === a) continue;
        const distance = Math.hypot(b.x1 - a.x1, b.y1 - a.y1);
        if (distance < 14 || distance > 46) continue;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = b;
        }
      }
      if (best) this.surface.line(a.x1, a.y1, best.x1, best.y1, PALETTE.bridge);
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
