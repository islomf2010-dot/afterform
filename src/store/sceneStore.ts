import { create } from 'zustand';
import { computeBounds, defaultParams, generateComposition } from '@/lib/generator';
import { DEFAULT_SIZE } from '@/lib/presets';
import { randomSeed } from '@/lib/rng';
import { useLookStore } from './lookStore';
import type { ArchObject, Bounds, Composition, GeneratorParams, ObjectKind, QualityMode, Vec3 } from '@/types/scene';

export const DEFAULT_SEED = 'AFTERFORM';
const HISTORY_LIMIT = 60;
const MIN_SIZE = 0.08;
const MAX_SIZE = 40;
/** Hard ceiling for manual edits — the same budget the generator respects. */
const MAX_OBJECTS = 200;

/** Element budget follows the active quality profile. */
const budgetFor = (quality: QualityMode): number => (quality === 'lite' ? 96 : 160);

interface SceneState {
  name: string;
  seed: string;
  params: GeneratorParams;
  objects: ArchObject[];
  selection: string | null;
  /** Bumped on every full rebuild so the scene can replay its entrance animation. */
  buildVersion: number;
  /** Bumped on every structural change, used to trigger a re-fit of nothing — cheap invalidation. */
  revision: number;
  past: ArchObject[][];
  future: ArchObject[][];
  /** Set when the composition is replaced, so the camera can re-frame. */
  lastAction: 'generate' | 'load' | 'edit' | null;

  generate: (options?: { params?: Partial<GeneratorParams>; seed?: string }) => void;
  setParams: (patch: Partial<GeneratorParams>) => void;
  reset: () => void;
  addObject: (kind: ObjectKind) => void;
  deleteSelected: () => void;
  updateObject: (id: string, patch: Partial<Pick<ArchObject, 'position' | 'size' | 'kind'>>) => void;
  rename: (name: string) => void;
  select: (id: string | null) => void;
  undo: () => void;
  redo: () => void;
  replaceComposition: (composition: Composition) => void;
  clearHistory: () => void;
}

let manualCounter = 0;
/** Counts fallback placements so a run of additions never stacks on the same spot. */
let spawnIndex = 0;

/** The lab always opens on a real composition — an empty stage is not an introduction. */
const INITIAL_PARAMS = defaultParams();
const INITIAL_COMPOSITION = generateComposition(INITIAL_PARAMS, { maxObjects: budgetFor('high') });

export const useSceneStore = create<SceneState>()((set, get) => ({
  name: INITIAL_COMPOSITION.name,
  seed: INITIAL_COMPOSITION.seed,
  params: INITIAL_PARAMS,
  objects: INITIAL_COMPOSITION.objects,
  selection: null,
  buildVersion: 0,
  revision: 0,
  past: [],
  future: [],
  lastAction: null,

  generate: (options) => {
    const state = get();
    const params: GeneratorParams = { ...state.params, ...options?.params };
    const seed = options?.seed ?? randomSeed();
    const composition = generateComposition({ ...params, seed }, { maxObjects: budgetFor(useLookStore.getState().quality) });

    set({
      name: composition.name,
      seed,
      params: composition.params,
      objects: composition.objects,
      selection: null,
      past: pushHistory(state.past, state.objects),
      future: [],
      buildVersion: state.buildVersion + 1,
      revision: state.revision + 1,
      lastAction: 'generate',
    });
  },

  setParams: (patch) => {
    const state = get();
    const params: GeneratorParams = { ...state.params, ...patch };
    const composition = generateComposition({ ...params, seed: state.seed }, { maxObjects: budgetFor(useLookStore.getState().quality) });
    // Live preview: same seed, new parameters. No history entry and no replay of the
    // entrance animation — otherwise every pixel of a slider drag would rebuild the city.
    set({ params, name: composition.name, objects: composition.objects, revision: state.revision + 1 });
  },

  reset: () => {
    const state = get();
    const params = defaultParams();
    const composition = generateComposition(params, { maxObjects: budgetFor(useLookStore.getState().quality) });
    set({
      name: composition.name,
      seed: composition.seed,
      params,
      objects: composition.objects,
      selection: null,
      past: pushHistory(state.past, state.objects),
      future: [],
      buildVersion: state.buildVersion + 1,
      revision: state.revision + 1,
      lastAction: 'generate',
    });
  },

  addObject: (kind) => {
    const state = get();
    if (state.objects.length >= MAX_OBJECTS) return;
    const size = [...DEFAULT_SIZE[kind]] as Vec3;
    const position = findSpawn(state.objects, size);
    if (!position) return;
    const object: ArchObject = { id: `m${(manualCounter++).toString(36)}-${Date.now().toString(36)}`, kind, position, size };
    set({
      objects: [...state.objects, object],
      selection: object.id,
      past: pushHistory(state.past, state.objects),
      future: [],
      revision: state.revision + 1,
      lastAction: 'edit',
    });
  },

  deleteSelected: () => {
    const state = get();
    if (!state.selection) return;
    const objects = state.objects.filter((o) => o.id !== state.selection);
    set({
      objects,
      selection: null,
      past: pushHistory(state.past, state.objects),
      future: [],
      revision: state.revision + 1,
      lastAction: 'edit',
    });
  },

  updateObject: (id, patch) => {
    const state = get();
    const index = state.objects.findIndex((o) => o.id === id);
    if (index === -1) return;
    const current = state.objects[index];
    const next: ArchObject = {
      ...current,
      kind: patch.kind ?? current.kind,
      position: patch.position ? clampPosition(patch.position, patch.size ?? current.size) : current.position,
      size: patch.size ? clampSize(patch.size) : current.size,
    };
    if (next.kind !== current.kind && !patch.size) {
      next.size = [...DEFAULT_SIZE[next.kind]] as Vec3;
      next.position = clampPosition(next.position, next.size);
    }
    if (sameObject(current, next)) return;

    const objects = state.objects.slice();
    objects[index] = next;
    set({
      objects,
      past: pushHistory(state.past, state.objects),
      future: [],
      revision: state.revision + 1,
      lastAction: 'edit',
    });
  },

  rename: (name) => {
    const trimmed = name.trim().slice(0, 64);
    if (!trimmed || trimmed === get().name) return;
    set({ name: trimmed });
  },

  select: (id) => {
    if (get().selection === id) return;
    set({ selection: id });
  },

  undo: () => {
    const state = get();
    const previous = state.past[state.past.length - 1];
    if (!previous) return;
    set({
      objects: previous,
      past: state.past.slice(0, -1),
      future: [state.objects, ...state.future].slice(0, HISTORY_LIMIT),
      selection: state.selection && previous.some((o) => o.id === state.selection) ? state.selection : null,
      revision: state.revision + 1,
      lastAction: 'edit',
    });
  },

  redo: () => {
    const state = get();
    const [next, ...rest] = state.future;
    if (!next) return;
    set({
      objects: next,
      past: pushHistory(state.past, state.objects),
      future: rest,
      selection: state.selection && next.some((o) => o.id === state.selection) ? state.selection : null,
      revision: state.revision + 1,
      lastAction: 'edit',
    });
  },

  replaceComposition: (composition) => {
    const state = get();
    set({
      name: composition.name,
      seed: composition.seed,
      params: composition.params,
      objects: composition.objects,
      selection: null,
      past: pushHistory(state.past, state.objects),
      future: [],
      buildVersion: state.buildVersion + 1,
      revision: state.revision + 1,
      lastAction: 'load',
    });
  },

  clearHistory: () => set({ past: [], future: [] }),
}));

function pushHistory(past: ArchObject[][], objects: ArchObject[]): ArchObject[][] {
  const next = [...past, objects];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}

function clampSize(size: Vec3): Vec3 {
  return [clamp(size[0], MIN_SIZE, MAX_SIZE), clamp(size[1], MIN_SIZE, MAX_SIZE), clamp(size[2], MIN_SIZE, MAX_SIZE)];
}

/** Keeps an element from sinking through the ground plate. */
function clampPosition(position: Vec3, size: Vec3): Vec3 {
  return [clamp(position[0], -60, 60), Math.max(size[1] / 2, clamp(position[1], -10, 80)), clamp(position[2], -60, 60)];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sameObject(a: ArchObject, b: ArchObject): boolean {
  return (
    a.kind === b.kind &&
    a.position.every((v, i) => Math.abs(v - b.position[i]) < 1e-4) &&
    a.size.every((v, i) => Math.abs(v - b.size[i]) < 1e-4)
  );
}

/**
 * Finds a free spot for a new element: spiralling out from the centre of the plan,
 * skipping anything that would intersect an existing element.
 */
function findSpawn(objects: readonly ArchObject[], size: Vec3): Vec3 | null {
  const bounds = computeBounds(objects);
  const cx = (bounds.min[0] + bounds.max[0]) / 2;
  const cz = (bounds.min[2] + bounds.max[2]) / 2;
  const step = Math.max(size[0], size[2]) * 0.9 + 0.3;

  for (let ring = 0; ring < 30; ring++) {
    const radius = ring * step;
    const samples = ring === 0 ? 1 : Math.max(8, ring * 6);
    for (let i = 0; i < samples; i++) {
      const angle = (i / samples) * Math.PI * 2 + ring * 0.7;
      const x = round(cx + Math.cos(angle) * radius);
      const z = round(cz + Math.sin(angle) * radius);
      if (isFree(objects, [x, size[1] / 2, z], size)) return [x, round(size[1] / 2), z];
    }
  }

  // Genuinely no room on the plan: park it above the composition, stepping sideways each time
  // so a run of additions still lands on distinct, reachable ground.
  spawnIndex++;
  return [round(cx + (spawnIndex % 4) * 1.9), round(bounds.max[1] + size[1] / 2 + 0.6), round(cz)];
}

function isFree(objects: readonly ArchObject[], position: Vec3, size: Vec3): boolean {
  const [x, y, z] = position;
  const half: Vec3 = [size[0] / 2, size[1] / 2, size[2] / 2];
  return !objects.some((o) => {
    const overlapX = Math.abs(o.position[0] - x) < o.size[0] / 2 + half[0] - 0.02;
    const overlapZ = Math.abs(o.position[2] - z) < o.size[2] / 2 + half[2] - 0.02;
    const overlapY = Math.abs(o.position[1] - y) < o.size[1] / 2 + half[1] - 0.02;
    return overlapX && overlapY && overlapZ;
  });
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/* ------------------------------------------------------------------ */
/* Selectors                                                           */
/* ------------------------------------------------------------------ */

export function selectBounds(objects: readonly ArchObject[]): Bounds {
  return computeBounds(objects);
}

export function toComposition(state: Pick<SceneState, 'name' | 'seed' | 'params' | 'objects'>): Composition {
  return { name: state.name, seed: state.seed, params: state.params, objects: state.objects };
}