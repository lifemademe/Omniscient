/**
 * Deterministic pseudo-random number generation.
 *
 * Gauntlet §123 requires that procedural content regenerates identically from the same
 * state. Nothing in OMNISCIENT_ may use Math.random() for anything the player can see
 * more than once - hardware silhouettes, tree topology and scatter must all be seeded.
 */

/** A seeded generator returning values in [0, 1). */
export type Rng = () => number;

/**
 * mulberry32 - small, fast, well-distributed 32-bit PRNG.
 * Same seed always produces the same sequence.
 */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash an arbitrary string into a seed, so content can be keyed by name. */
export function seedFrom(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Uniform value in [min, max). */
export function range(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

/**
 * Symmetric jitter around zero, scaled by amount.
 * Used to break mathematical perfection - see Gauntlet §187 / PAINTERLY SURFACE TREATMENT:
 * procedural output must read as authored, not as sterile primitives.
 */
export function jitter(rng: Rng, amount: number): number {
  return (rng() * 2 - 1) * amount;
}

/** Pick a random element. */
export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length) % items.length];
}
