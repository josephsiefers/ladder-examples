/** A seeded pseudo-random source (mulberry32), so every generation from one seed is identical. */
export interface Rng {
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  const index = (length: number) => Math.floor(next() * length);
  return {
    pick<T>(items: readonly T[]): T {
      const item = items[index(items.length)];
      if (item === undefined) throw new Error("Cannot pick from an empty list");
      return item;
    },
    shuffle<T>(items: readonly T[]): T[] {
      const result = [...items];
      for (let i = result.length - 1; i > 0; i--) {
        const j = index(i + 1);
        [result[i], result[j]] = [result[j] as T, result[i] as T];
      }
      return result;
    },
  };
}
