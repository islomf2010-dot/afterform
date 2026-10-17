import { beforeEach, describe, expect, it } from 'vitest';
import { useSceneStore } from '../store/sceneStore';

import { currentLook } from '../store/lookStore';
import { parseProjectFile, serialiseProjectFile } from '../lib/projectFile';

const store = () => useSceneStore.getState();

beforeEach(() => {
  store().clearHistory();
  store().select(null);
  store().reset();
  store().clearHistory();
});

describe('scene store', () => {
  it('opens on a generated composition', () => {
    expect(store().objects.length).toBeGreaterThan(10);
    expect(store().name.length).toBeGreaterThan(0);
  });

  it('adds each element type and selects it', () => {
    for (const kind of ['block', 'column', 'slab', 'frame'] as const) {
      const before = store().objects.length;
      store().addObject(kind);
      expect(store().objects.length).toBe(before + 1);
      const selected = store().objects.find((o) => o.id === store().selection);
      expect(selected?.kind).toBe(kind);
      store().select(null);
    }
  });

  it('never places a new element on top of an existing one', () => {
    store().reset();
    for (let i = 0; i < 12; i++) store().addObject('block');
    const boxes = store().objects.filter((o) => o.id.startsWith('m'));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const overlap = ['x', 'y', 'z'].every((_axis, index) => Math.abs(a.position[index] - b.position[index]) < (a.size[index] + b.size[index]) / 2 - 0.01);
        expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });

  it('moves and resizes the selection through the store', () => {
    store().addObject('block');
    const id = store().selection!;
    const original = store().objects.find((o) => o.id === id)!;

    store().updateObject(id, { position: [3, 2, -4] });
    const moved = store().objects.find((o) => o.id === id)!;
    expect(moved.position).toEqual([3, 2, -4]);

    store().updateObject(id, { size: [2, 2, 2] });
    expect(store().objects.find((o) => o.id === id)!.size).toEqual([2, 2, 2]);
    expect(original.id).toBe(id);
  });

  it('keeps an element from sinking through the ground', () => {
    store().addObject('column');
    const id = store().selection!;
    store().updateObject(id, { position: [0, -50, 0] });
    const object = store().objects.find((o) => o.id === id)!;
    expect(object.position[1]).toBeGreaterThanOrEqual(object.size[1] / 2);
  });

  it('deletes the selection and restores it with undo', () => {
    store().addObject('slab');
    const id = store().selection!;
    const before = store().objects.length;

    store().deleteSelected();
    expect(store().objects.length).toBe(before - 1);
    expect(store().selection).toBeNull();

    store().undo();
    expect(store().objects.length).toBe(before);
    expect(store().objects.some((o) => o.id === id)).toBe(true);

    store().redo();
    expect(store().objects.length).toBe(before - 1);
  });

  it('undoes a delete of a generated element', () => {
    const before = store().objects;
    const fingerprint = before.map((o) => o.position.join()).join('|');
    store().generate({ seed: 'UNDO' });
    expect(store().objects.map((o) => o.position.join()).join('|')).not.toBe(fingerprint);
    store().undo();
    expect(store().objects.map((o) => o.position.join()).join('|')).toBe(fingerprint);
  });

  it('clears the selection when the selected element disappears through undo', () => {
    store().addObject('frame');
    store().deleteSelected();
    expect(store().selection).toBeNull();
    store().undo();
    expect(store().selection).toBeNull();
  });

  it('keeps the seed when parameters change, and keeps history clean', () => {
    store().generate({ seed: 'STABLE' });
    // Structural fingerprint, not a count: two different compositions can legitimately
    // contain the same number of elements.
    const fingerprint = () => store().objects.map((o) => `${o.position.join()}/${o.size.join()}`).join('|');
    const before = fingerprint();
    const past = store().past.length;

    store().setParams({ height: 0.9 });
    expect(store().seed).toBe('STABLE');
    expect(fingerprint()).not.toBe(before);
    // Live parameter previews are not undo steps — otherwise a slider drag floods the history.
    expect(store().past.length).toBe(past);

    store().setParams({ height: 0.55 });
    expect(fingerprint()).toBe(before);
  });

  it('generates a different composition for a new seed', () => {
    store().generate({ seed: 'ONE' });
    const a = store().objects.map((o) => o.position.join()).join('|');
    store().generate({ seed: 'TWO' });
    const b = store().objects.map((o) => o.position.join()).join('|');
    expect(a).not.toBe(b);
  });

  it('round trips through the project file', () => {
    store().generate({ seed: 'ROUNDTRIP' });
    store().rename('  My Study  ');
    expect(store().name).toBe('My Study');

    const json = serialiseProjectFile({ name: store().name, seed: store().seed, params: store().params, objects: store().objects }, currentLook());
    const parsed = parseProjectFile(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    store().replaceComposition(parsed.file.composition);
    expect(store().name).toBe('My Study');
    expect(store().objects.length).toBe(parsed.file.composition.objects.length);
  });

  it('replaces the composition on import and clears history-safe ids', () => {
    store().replaceComposition({ name: 'IMPORTED', seed: 'X', params: store().params, objects: [{ id: 'x1', kind: 'block', position: [0, 1, 0], size: [1, 2, 1] }] });
    expect(store().objects).toHaveLength(1);
    expect(store().name).toBe('IMPORTED');
    expect(store().buildVersion).toBeGreaterThan(0);
  });
});