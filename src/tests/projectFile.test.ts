import { describe, expect, it } from 'vitest';
import { defaultLook, parseProjectFile, serialiseProjectFile } from '../lib/projectFile';
import { generateComposition, defaultParams } from '../lib/generator';

const composition = generateComposition({ ...defaultParams(), seed: 'ROUND' });

function file(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    format: 'afterform.composition',
    version: 1,
    composition,
    look: defaultLook(),
    savedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  });
}

describe('project file validation', () => {
  it('accepts a file produced by the exporter', () => {
    const result = parseProjectFile(serialiseProjectFile(composition, defaultLook()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file.composition.objects).toHaveLength(composition.objects.length);
    expect(result.file.look.material).toBe(defaultLook().material);
    expect(result.warnings).toHaveLength(0);
  });

  it('rejects broken json', () => {
    const result = parseProjectFile('{ nope');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/JSON/i);
  });

  it('rejects a foreign format or version', () => {
    expect(parseProjectFile(file({ format: 'something.else' })).ok).toBe(false);
    expect(parseProjectFile(file({ version: 99 })).ok).toBe(false);
    expect(parseProjectFile(JSON.stringify({ format: 'afterform.composition' })).ok).toBe(false);
  });

  it('drops malformed elements but keeps the rest', () => {
    const broken = {
      ...composition,
      objects: [...composition.objects.slice(0, 3), { id: 'x', kind: 'pyramid', position: [0, 0, 0], size: [1, 1, 1] }, { kind: 'block', position: 'nope', size: [1, 1, 1] }],
    };
    const result = parseProjectFile(file({ composition: broken }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file.composition.objects).toHaveLength(3);
    expect(result.warnings.join(' ')).toMatch(/skipped/i);
  });

  it('sanitises numbers instead of trusting the file', () => {
    const hostile = {
      ...composition,
      objects: [
        { id: 'a', kind: 'block', position: [1e9, 1e9, 1e9], size: [1e9, 1e9, 1e9] },
        { id: 'b', kind: 'block', position: [Number.NaN, 0, 0], size: [1, 1, 1] },
        { id: 'c', kind: 'block', position: [0, 0, 0], size: [0, 1, 1] },
        { id: 'd', kind: 'block', position: [0, 0, 0], size: [1, 1, 1] },
      ],
    };
    const result = parseProjectFile(file({ composition: hostile }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const objects = result.file.composition.objects;
    expect(objects.map((o) => o.id)).toEqual(['a', 'd']);
    expect(Math.abs(objects[0].position[0])).toBeLessThanOrEqual(40);
    expect(Math.abs(objects[0].size[0])).toBeLessThanOrEqual(40);
  });

  it('clamps generator parameters into range', () => {
    const result = parseProjectFile(file({ composition: { ...composition, params: { height: 12, density: -3, symmetry: 0.5, complexity: 0.4, seed: 'X' } } }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file.composition.params.height).toBe(1);
    expect(result.file.composition.params.density).toBe(0);
  });

  it('falls back to defaults for an unknown look block', () => {
    const result = parseProjectFile(file({ look: { material: 'chrome', lighting: 'sunrise', accentColor: 'not-a-colour', keyIntensity: 99, fogDensity: 9 } }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file.look.material).toBe(defaultLook().material);
    expect(result.file.look.lighting).toBe(defaultLook().lighting);
    expect(result.file.look.accentColor).toBe(defaultLook().accentColor);
    expect(result.file.look.keyIntensity).toBeLessThanOrEqual(2);
    expect(result.file.look.fogDensity).toBeLessThanOrEqual(0.08);
  });

  it('gives duplicate ids a unique suffix', () => {
    const duplicated = {
      ...composition,
      objects: [
        { id: 'same', kind: 'block', position: [0, 0.5, 0], size: [1, 1, 1] },
        { id: 'same', kind: 'block', position: [3, 0.5, 0], size: [1, 1, 1] },
      ],
    };
    const result = parseProjectFile(file({ composition: duplicated }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.file.composition.objects.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('caps the element count of an oversized file', () => {
    const many = { ...composition, objects: Array.from({ length: 900 }, (_, i) => ({ id: `o${i}`, kind: 'block', position: [i % 20, 0.5, Math.floor(i / 20)], size: [1, 1, 1] })) };
    const result = parseProjectFile(file({ composition: many }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file.composition.objects).toHaveLength(400);
    expect(result.warnings.join(' ')).toMatch(/more than 400/i);
  });
});