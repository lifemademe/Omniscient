import * as THREE from 'three';

/**
 * A pallet, built as a pallet.
 *
 * Every pallet in the building was a single solid box, and there are around a hundred and
 * fifty of them: one under every loaded rack slot on every level of every aisle, plus the
 * loose stacks on the floor. After the racking itself it is the most repeated object in the
 * mission, and it sits at the exact height the drone flies at, one metre from the camera, all
 * the way down a twenty-six metre run.
 *
 * A solid slab is the one thing a pallet is not. What makes one recognisable is that you can
 * SEE THROUGH IT - deck boards with gaps between them, three stringers on edge, and daylight
 * under the whole thing where the tines go. Those gaps are also the only place a hard shadow
 * lands on the shelf below, which is what stops five stacked levels from reading as five
 * identical grey bands.
 *
 * Eleven boxes: five top deck boards, three stringers, three bottom boards. It merges into
 * whatever bucket the caller is already collecting into, so a hundred and fifty of them still
 * cost zero extra draw calls - the same bargain the rack stock is built on.
 */

/** Total height of a pallet, deck top to floor. Callers stand loads on `deckTopY`. */
export const PALLET_HEIGHT = 0.14;

const BOARD_THICKNESS = 0.024;
const STRINGER_HEIGHT = PALLET_HEIGHT - BOARD_THICKNESS * 2;

/**
 * The eleven pieces of one pallet, positioned in world space.
 *
 * `deckTopY` is the surface a load rests on, not the centre - that is the number a caller
 * actually has, and it keeps the pallet hanging below its own deck rather than straddling it.
 */
export function palletGeometries(
  x: number,
  deckTopY: number,
  z: number,
  options: { width?: number; depth?: number; turn?: number } = {}
): THREE.BufferGeometry[] {
  const width = options.width ?? 1.18;
  const depth = options.depth ?? 1.06;
  const turn = options.turn ?? 0;
  const parts: THREE.BufferGeometry[] = [];

  // Top deck: five boards, gaps between them. Built about a local origin at the deck top.
  const topBoard = Math.min(0.155, depth / 6.2);
  for (let i = 0; i < 5; i++) {
    const board = new THREE.BoxGeometry(width, BOARD_THICKNESS, topBoard);
    board.translate(0, -BOARD_THICKNESS / 2, -depth / 2 + topBoard / 2 + (i * (depth - topBoard)) / 4);
    parts.push(board);
  }

  // Stringers, on edge and running the depth. The gaps between them are the fork pockets.
  for (const sx of [-width / 2 + 0.055, 0, width / 2 - 0.055]) {
    const stringer = new THREE.BoxGeometry(0.11, STRINGER_HEIGHT, depth);
    stringer.translate(sx, -BOARD_THICKNESS - STRINGER_HEIGHT / 2, 0);
    parts.push(stringer);
  }

  // Bottom deck: three boards, which is what holds it off the floor.
  const footBoard = Math.min(0.17, depth / 5.6);
  for (const bz of [-depth / 2 + footBoard / 2, 0, depth / 2 - footBoard / 2]) {
    const board = new THREE.BoxGeometry(width, BOARD_THICKNESS, footBoard);
    board.translate(0, -PALLET_HEIGHT + BOARD_THICKNESS / 2, bz);
    parts.push(board);
  }

  for (const part of parts) {
    if (turn) part.rotateY(turn);
    part.translate(x, deckTopY, z);
  }
  return parts;
}
