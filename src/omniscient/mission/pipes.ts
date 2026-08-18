/**
 * The pipe grid, and whether water gets through it.
 *
 * A second kind of device beside the relation board, and the reason it is worth having is
 * that it asks for something the board does not. The board is a memory problem: hold five
 * statements and find the shape. This is a topology problem: rotate the pieces until a
 * path exists. §153 wants a mission to move between tempos, and a game whose only
 * interactive verb is "recall" is as narrow as one whose only verb is "say".
 *
 * Grading is a flood fill from the source, which is worth stating because the tempting
 * alternative - compare against a stored solution - is wrong. There is usually more than
 * one arrangement that carries water, and a puzzle that accepts only the author's is a
 * puzzle that tells a correct player they are wrong. The question is never "did you match
 * my answer", it is "does it flow".
 */

/**
 * Which sides of a cell a piece opens onto, before rotation.
 *
 * Order is north, east, south, west - so a rotation is a rotation of this array, which is
 * what makes the whole thing cheap.
 */
export type PipeShape = 'straight' | 'bend' | 'tee' | 'cross' | 'blank';

const OPENINGS: Record<PipeShape, [boolean, boolean, boolean, boolean]> = {
  // N, E, S, W
  straight: [true, false, true, false],
  bend: [true, true, false, false],
  tee: [true, true, true, false],
  cross: [true, true, true, true],
  blank: [false, false, false, false],
};

export interface PipeCell {
  shape: PipeShape;
  /** Quarter turns clockwise, as authored. The player's rotation is added to this. */
  turn?: number;
  /**
   * Cannot be rotated by the player.
   *
   * Every grid needs some: a puzzle where every cell moves has no landmarks, and the
   * player has nothing to reason from. Fixed pieces are the ones the fiction says are
   * already plumbed in - the riser, the trap under the sink.
   */
  fixed?: boolean;
}

export interface PipeGrid {
  columns: number;
  rows: number;
  /** Row-major, length columns * rows. */
  cells: PipeCell[];
  /** Cell index where water enters, and the side it enters from. */
  source: number;
  /** Cell index where water must leave. */
  drain: number;
}

/** Openings for a cell after its authored turn plus the player's. */
export function openingsOf(cell: PipeCell, playerTurn: number): boolean[] {
  const base = OPENINGS[cell.shape];
  const turn = (((cell.turn ?? 0) + playerTurn) % 4 + 4) % 4;
  // Rotating clockwise by one quarter sends north to east, so the array shifts right.
  return base.map((_, i) => base[(i - turn + 4) % 4]);
}

/**
 * Does water reach the drain?
 *
 * Breadth-first from the source. Two cells are joined only when BOTH open onto the shared
 * edge - a pipe pointing at a wall is not a connection, which is the entire puzzle.
 */
export function flows(grid: PipeGrid, rotations: number[]): boolean {
  const { columns, rows, cells, source, drain } = grid;
  const seen = new Set<number>([source]);
  const queue = [source];

  // N, E, S, W as index deltas, with the opening index each direction uses on the
  // neighbour: north's opposite is south, and so on.
  const steps = [
    { d: -columns, from: 0, to: 2, edge: (i: number): boolean => i >= columns },
    { d: 1, from: 1, to: 3, edge: (i: number): boolean => i % columns !== columns - 1 },
    { d: columns, from: 2, to: 0, edge: (i: number): boolean => i < columns * (rows - 1) },
    { d: -1, from: 3, to: 1, edge: (i: number): boolean => i % columns !== 0 },
  ];

  while (queue.length) {
    const at = queue.shift() as number;
    if (at === drain) return true;

    const here = openingsOf(cells[at], rotations[at] ?? 0);
    for (const step of steps) {
      if (!here[step.from] || !step.edge(at)) continue;
      const next = at + step.d;
      if (seen.has(next) || !cells[next]) continue;
      if (!openingsOf(cells[next], rotations[next] ?? 0)[step.to]) continue;
      seen.add(next);
      queue.push(next);
    }
  }

  return false;
}

/**
 * How far the water actually got, as a fraction of the grid it can reach.
 *
 * §159 says a wrong answer produces a clarification rather than a buzzer, and "no" is not
 * a clarification on a puzzle with sixteen cells. This is what the contact reports instead
 * - it is the plumber's own observation, because a person holding a hose can hear how far
 * down the run the water is getting.
 */
/**
 * Which cells the water actually gets to, from the source, as things stand.
 *
 * Split out of `wetted` so the console can draw it. That is not a leak of the answer
 * (§157): this is a flood fill over the board the player is looking at, using the
 * rotations the player themselves set, and every input to it is already on their screen.
 * It tells them what they have built, not what they should build.
 */
export function reached(grid: PipeGrid, rotations: number[]): Set<number> {
  const { columns, rows, cells, source } = grid;
  const seen = new Set<number>([source]);
  const queue = [source];
  const steps = [
    { d: -columns, from: 0, to: 2, edge: (i: number): boolean => i >= columns },
    { d: 1, from: 1, to: 3, edge: (i: number): boolean => i % columns !== columns - 1 },
    { d: columns, from: 2, to: 0, edge: (i: number): boolean => i < columns * (rows - 1) },
    { d: -1, from: 3, to: 1, edge: (i: number): boolean => i % columns !== 0 },
  ];

  while (queue.length) {
    const at = queue.shift() as number;
    const here = openingsOf(cells[at], rotations[at] ?? 0);
    for (const step of steps) {
      if (!here[step.from] || !step.edge(at)) continue;
      const next = at + step.d;
      if (seen.has(next) || !cells[next]) continue;
      if (!openingsOf(cells[next], rotations[next] ?? 0)[step.to]) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

export function wetted(grid: PipeGrid, rotations: number[]): number {
  const plumbed = grid.cells.filter((cell) => cell.shape !== 'blank').length;
  return plumbed === 0 ? 0 : reached(grid, rotations).size / plumbed;
}
