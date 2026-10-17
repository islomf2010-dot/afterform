/**
 * AFTERFORM — core domain types.
 * Domain logic must stay free of React and Three.js imports so it can be unit tested.
 */

export type Vec3 = [number, number, number];

/** The four primitives the lab is built from. */
export type ObjectKind = 'block' | 'column' | 'slab' | 'frame';

export const OBJECT_KINDS: readonly ObjectKind[] = ['block', 'column', 'slab', 'frame'];

/**
 * Material family inside a preset. One composition uses all three: a dark base, the main
 * masses, and an accent. That value hierarchy is what gives the image depth.
 */
export type Tone = 'base' | 'mass' | 'accent';

export const TONES: readonly Tone[] = ['base', 'mass', 'accent'];

/**
 * An architectural element.
 * `position` is the centre of the element's bounding box, `size` its extents in world units.
 * `rotation` is in radians and optional — most of a composition stays on the grid, arches and
 * braces are what break it.
 */
export interface ArchObject {
  id: string;
  kind: ObjectKind;
  position: Vec3;
  size: Vec3;
  rotation?: Vec3;
  tone?: Tone;
}

/**
 * The only editing tool today. Clicking picks, dragging an element moves it, dragging empty
 * space orbits — the model stays this way until a second mode earns its place.
 */
export type Tool = 'select';

export interface GeneratorParams {
  /** 0..1 — overall vertical ambition of the composition. */
  height: number;
  /** 0..1 — how many cells of the site are occupied. */
  density: number;
  /** 0..1 — 0 free, ~0.5 mirror on X, 1 mirror on X and Z. */
  symmetry: number;
  /** 0..1 — number of distinct elements and articulated detail. */
  complexity: number;
  /** Reproducible seed. */
  seed: string;
}

export interface Composition {
  name: string;
  seed: string;
  params: GeneratorParams;
  objects: ArchObject[];
}

export type MaterialPresetId = 'brutalism' | 'glass' | 'monolith';

export type LightingModeId = 'day' | 'dusk' | 'night';

export type QualityMode = 'high' | 'lite';

/** Serialised payload used by Export JSON / Import JSON. */
export interface ProjectFile {
  format: 'afterform.composition';
  version: 1;
  composition: Composition;
  look: LookState;
  savedAt: string;
}

export interface LookState {
  material: MaterialPresetId;
  lighting: LightingModeId;
  keyIntensity: number;
  accentColor: string;
  fogDensity: number;
  gridVisible: boolean;
  quality: QualityMode;
}

export interface Bounds {
  min: Vec3;
  max: Vec3;
}