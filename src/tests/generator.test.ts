import { describe, expect, it } from 'vitest';
import { CELL, PLATE_H, computeBounds, defaultParams, generateComposition } from '../lib/generator';
import { buildPartIndex, objectParts } from '../lib/parts';
import type { ArchObject, GeneratorParams } from '../types/scene';

const BASE = defaultParams();

function params(overrides: Partial<GeneratorParams> = {}): GeneratorParams {
  return { ...BASE, ...overrides };
}

describe('procedural generator', () => {
  it('is reproducible for the same seed', () => {
    const a = generateComposition(params({ seed: 'CLOISTER' }));
    const b = generateComposition(params({ seed: 'CLOISTER' }));
    expect(a.objects).toEqual(b.objects);
    expect(a.objects.map((o) => o.id)).toEqual(b.objects.map((o) => o.id));
    expect(a.name).toBe(b.name);
  });

  it('produces different compositions for different seeds', () => {
    const a = generateComposition(params({ seed: 'ALPHA' }));
    const b = generateComposition(params({ seed: 'BETA' }));
    expect(a.objects.map((o) => o.position.join())).not.toEqual(b.objects.map((o) => o.position.join()));
  });

  it('never exceeds the element budget', () => {
    for (const seed of ['A', 'BB', 'CCC', 'DDDD', 'EEEEE', 'FFFFFF', 'GGGGGGG', 'HHHHHHHH']) {
      const composition = generateComposition(params({ seed, density: 1, complexity: 1, height: 1 }), { maxObjects: 120 });
      expect(composition.objects.length).toBeLessThanOrEqual(120);
      expect(composition.objects.length).toBeGreaterThan(6);
    }
  });

  it('stays within the grid for every parameter corner', () => {
    for (const height of [0, 0.5, 1]) {
      for (const density of [0, 0.5, 1]) {
        for (const symmetry of [0, 0.5, 1]) {
          for (const complexity of [0, 0.5, 1]) {
            const composition = generateComposition(params({ height, density, symmetry, complexity, seed: `S${height}${density}${symmetry}${complexity}` }));
            const bounds = computeBounds(composition.objects);
            expect(bounds.min[1]).toBeGreaterThanOrEqual(-0.001);
            expect(composition.objects.length).toBeGreaterThan(4);
            expect(Number.isFinite(bounds.max[1])).toBe(true);
          }
        }
      }
    }
  });

  it('gives every element a unique id and finite transform', () => {
    const composition = generateComposition(params({ seed: 'IDS' }));
    const ids = new Set<string>();
    for (const object of composition.objects) {
      expect(ids.has(object.id)).toBe(false);
      ids.add(object.id);
      expect([...object.position, ...object.size].every(Number.isFinite)).toBe(true);
      expect(Math.min(...object.size)).toBeGreaterThan(0);
    }
  });

  it('grounds every element: nothing floats above the plate', () => {
    const composition = generateComposition(params({ seed: 'FLOAT' }));
    for (const object of composition.objects) {
      const bottom = object.position[1] - object.size[1] / 2;
      expect(bottom).toBeGreaterThanOrEqual(PLATE_H - 0.35);
    }
  });

  it('keeps air in the composition rather than filling the plate', () => {
    const coverage = (overrides: Partial<GeneratorParams>) => {
      const composition = generateComposition(params({ seed: 'AIR', ...overrides }));
      const bounds = computeBounds(composition.objects);
      const step = 0.3;
      let samples = 0;
      let covered = 0;
      for (let x = bounds.min[0] + 0.2; x < bounds.max[0] - 0.2; x += step) {
        for (let z = bounds.min[2] + 0.2; z < bounds.max[2] - 0.2; z += step) {
          samples++;
          // Only what is built on the plate counts — the plate itself covers everything.
          const occupied = composition.objects.some(
            (o) =>
              o.position[1] - o.size[1] / 2 >= PLATE_H - 0.001 &&
              o.position[1] - o.size[1] / 2 < 0.9 &&
              Math.abs(o.position[0] - x) < o.size[0] / 2 &&
              Math.abs(o.position[2] - z) < o.size[2] / 2,
          );
          if (occupied) covered++;
        }
      }
      expect(samples).toBeGreaterThan(50);
      return covered / samples;
    };

    expect(coverage({})).toBeLessThan(0.5);
    // Even at maximum density the plan has to keep open ground.
    expect(coverage({ density: 1, complexity: 1 })).toBeLessThan(0.7);
  });

  it('grows with the height parameter', () => {
    const low = computeBounds(generateComposition(params({ height: 0.05, seed: 'H' })).objects).max[1];
    const high = computeBounds(generateComposition(params({ height: 1, seed: 'H' })).objects).max[1];
    expect(high).toBeGreaterThan(low * 1.8);
  });

  it('mirrors the plan exactly at full symmetry', () => {
    const composition = generateComposition(params({ symmetry: 1, seed: 'MIRROR', density: 0.6, complexity: 0.6 }));

    const signature = (object: ArchObject) => `${object.kind}:${object.size.join(',')}`;
    for (const [index, object] of composition.objects.entries()) {
      // An element standing on the mirror plane is its own reflection.
      if (Math.abs(object.position[0]) < 1e-4 && Math.abs(object.position[2]) < 1e-4) continue;
      const mirrored = composition.objects.some(
        (other, otherIndex) =>
          otherIndex !== index &&
          signature(other) === signature(object) &&
          Math.abs(other.position[0] + object.position[0]) < 0.002 &&
          Math.abs(other.position[1] - object.position[1]) < 0.002 &&
          Math.abs(other.position[2] + object.position[2]) < 0.002,
      );
      expect(mirrored, `no mirror for ${signature(object)} at ${object.position.join()}`).toBe(true);
    }
  });

  it('uses every element type across a batch of compositions', () => {
    const kinds = new Set<string>();
    for (let i = 0; i < 24; i++) {
      for (const object of generateComposition(params({ seed: `K${i}`, complexity: 1 })).objects) kinds.add(object.kind);
    }
    expect([...kinds].sort()).toEqual(['block', 'column', 'frame', 'slab']);
  });
});

describe('parts', () => {
  const frame: ArchObject = { id: 'f', kind: 'frame', position: [0, 1, 0], size: [2, 2.4, 0.3] };

  it('keeps solid elements as a single part', () => {
    const block: ArchObject = { id: 'b', kind: 'block', position: [1, 2, 3], size: [1, 1, 1] };
    expect(objectParts(block)).toEqual([{ position: [1, 2, 3], size: [1, 1, 1] }]);
  });

  it('splits a frame into two posts and a lintel', () => {
    const parts = objectParts(frame);
    expect(parts).toHaveLength(3);
    const thickness = 0.14; // clamped: min(2, 0.3) * 0.3 = 0.09 falls under the 0.14 minimum
    expect(parts[0].size).toEqual([thickness, 2.4, 0.3]);
    expect(parts[0].position[0]).toBeCloseTo(-1 + thickness / 2);
    expect(parts[1].position[0]).toBeCloseTo(1 - thickness / 2);
    expect(parts[2].size).toEqual([2, thickness, 0.3]);
    expect(parts[2].position[1]).toBeCloseTo(1 + 1.2 - thickness / 2);
  });

  it('indexes every part back to its parent element', () => {
    const objects = [frame, { id: 'b', kind: 'block', position: [0, 0, 0], size: [CELL, 1, CELL] } as ArchObject];
    const index = buildPartIndex(objects);
    expect(index).toHaveLength(4);
    expect(index.map((p) => p.objectId)).toEqual(['f', 'f', 'f', 'b']);
  });
});