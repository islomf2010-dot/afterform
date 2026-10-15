/**
 * Deterministic pseudo random utilities.
 * Every composition must be reproducible from its seed, so no Math.random() anywhere.
 */

/** xmur3 string hash -> 32bit seed. */
export function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** mulberry32 — small, fast, good enough distribution for procedural work. */
export function mulberry32(a: number): () => number {
  let t = a >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private readonly next: () => number;

  constructor(seed: string | number) {
    this.next = mulberry32(typeof seed === 'number' ? seed : hashSeed(seed));
  }

  /** [0, 1) */
  float(): number {
    return this.next();
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1));
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.min(items.length - 1, Math.floor(this.next() * items.length))];
  }

  /** Weighted pick. Weights do not need to sum to 1. */
  weighted<T>(entries: readonly (readonly [T, number])[]): T {
    let total = 0;
    for (const [, weight] of entries) total += weight;
    let roll = this.next() * total;
    for (const [value, weight] of entries) {
      roll -= weight;
      if (roll <= 0) return value;
    }
    return entries[entries.length - 1][0];
  }

  /** Signed jitter in [-amount, amount]. */
  jitter(amount: number): number {
    return (this.next() * 2 - 1) * amount;
  }
}

/** Human readable seed from an existing one, e.g. "AF-3F9C". */
export function seedToLabel(seed: string): string {
  return hashSeed(seed).toString(16).toUpperCase().padStart(8, '0').slice(0, 4);
}

const SEED_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Random seed string for the Generate button (the only place randomness is allowed). */
export function randomSeed(): string {
  let out = '';
  const bytes = new Uint32Array(4);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
    for (let i = 0; i < 4; i++) {
      out += SEED_ALPHABET[bytes[i] % SEED_ALPHABET.length];
    }
    return out;
  }
  for (let i = 0; i < 4; i++) out += SEED_ALPHABET[Math.floor(Math.random() * SEED_ALPHABET.length)];
  return out;
}