import type { LightingModeId, MaterialPresetId, ObjectKind, QualityMode, Tone, Vec3 } from '@/types/scene';

/* ------------------------------------------------------------------ */
/* Material presets                                                    */
/* ------------------------------------------------------------------ */

/** One material family inside a preset. */
export interface ToneMaterial {
  color: string;
  roughness: number;
  metalness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  transparent: boolean;
  opacity: number;
  envMapIntensity: number;
}

export interface MaterialPreset {
  id: MaterialPresetId;
  name: string;
  /** Shown in the UI as a technical caption. */
  note: string;
  /**
   * Three families per preset. The value hierarchy between them — dark base, light masses,
   * bright accent — is what gives an image depth; a single material reads as a grey blob.
   */
  tones: Record<Tone, ToneMaterial>;
  /** Line colour of the edge overlay used by transparent families. */
  edge: string;
  edgeOpacity: number;
  ground: {
    color: string;
    roughness: number;
    metalness: number;
  };
  grid: { color: string };
  accentIntensity: number;
}

export const MATERIAL_PRESETS: Record<MaterialPresetId, MaterialPreset> = {
  brutalism: {
    id: 'brutalism',
    name: 'BRUTALISM',
    note: 'MATTE CONCRETE / SIDE LIGHT',
    tones: {
      base: { color: '#4f4d49', roughness: 0.96, metalness: 0, clearcoat: 0, clearcoatRoughness: 0.6, transparent: false, opacity: 1, envMapIntensity: 0.4 },
      mass: { color: '#bab7af', roughness: 0.93, metalness: 0, clearcoat: 0, clearcoatRoughness: 0.6, transparent: false, opacity: 1, envMapIntensity: 0.55 },
      accent: { color: '#dedad2', roughness: 0.6, metalness: 0.05, clearcoat: 0.12, clearcoatRoughness: 0.4, transparent: false, opacity: 1, envMapIntensity: 0.9 },
    },
    edge: '#6f6c66',
    edgeOpacity: 0.35,
    ground: { color: '#b9b6ae', roughness: 0.98, metalness: 0 },
    grid: { color: '#6f6c66' },
    accentIntensity: 0.35,
  },
  glass: {
    id: 'glass',
    name: 'GLASS',
    note: 'TRANSLUCENT / SOFT ENVIRONMENT',
    tones: {
      base: { color: '#8d989e', roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06, transparent: true, opacity: 0.46, envMapIntensity: 1.4 },
      mass: { color: '#c9d6db', roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04, transparent: true, opacity: 0.38, envMapIntensity: 1.75 },
      accent: { color: '#eef3f5', roughness: 0.03, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, transparent: true, opacity: 0.26, envMapIntensity: 2.1 },
    },
    // Mid grey reads against both the white of Day and the black of Night.
    // Kept light: three families each draw their own edges, and a heavier line turns the
    // composition into a wireframe tangle.
    edge: '#4d585e',
    edgeOpacity: 0.34,
    ground: { color: '#cfd4d6', roughness: 0.42, metalness: 0.1 },
    grid: { color: '#8a9499' },
    accentIntensity: 0.7,
  },
  monolith: {
    id: 'monolith',
    name: 'MONOLITH',
    note: 'DARK STONE / DRAMATIC SHADOW',
    tones: {
      base: { color: '#101113', roughness: 0.85, metalness: 0.05, clearcoat: 0, clearcoatRoughness: 0.5, transparent: false, opacity: 1, envMapIntensity: 0.35 },
      mass: { color: '#2c2f33', roughness: 0.38, metalness: 0.18, clearcoat: 0.25, clearcoatRoughness: 0.35, transparent: false, opacity: 1, envMapIntensity: 0.7 },
      accent: { color: '#9aa1a7', roughness: 0.16, metalness: 0.42, clearcoat: 0.4, clearcoatRoughness: 0.2, transparent: false, opacity: 1, envMapIntensity: 1.25 },
    },
    edge: '#9aa0a6',
    edgeOpacity: 0.35,
    ground: { color: '#16181a', roughness: 0.72, metalness: 0.05 },
    grid: { color: '#4c5157' },
    accentIntensity: 1.35,
  },
};

export const MATERIAL_ORDER: readonly MaterialPresetId[] = ['brutalism', 'glass', 'monolith'];

/* ------------------------------------------------------------------ */
/* Lighting modes                                                      */
/* ------------------------------------------------------------------ */

export interface LightingMode {
  id: LightingModeId;
  name: string;
  note: string;
  background: string;
  fogColor: string;
  exposure: number;
  key: { color: string; intensity: number; position: Vec3 };
  fill: { color: string; intensity: number; position: Vec3 };
  ambient: { color: string; intensity: number };
  rim: { color: string; intensity: number; position: Vec3 };
  envIntensity: number;
  /** Scale applied to the scene fog density coming from the environment controls. */
  fogScale: number;
  /**
   * Vertical gradient behind the composition. Three stops, sampled top to bottom.
   * A flat background reads as an empty buffer; a gradient reads as air.
   */
  sky: { top: string; middle: string; bottom: string };
  /** Strength of the contact shadow directly under each mass, 0 disables it. */
  contactStrength: number;
}

export const LIGHTING_MODES: Record<LightingModeId, LightingMode> = {
  day: {
    id: 'day',
    name: 'DAY',
    note: 'NEUTRAL / HIGH KEY',
    background: '#d8d6d1',
    fogColor: '#d8d6d1',
    exposure: 1.05,
    key: { color: '#fff4e2', intensity: 4.2, position: [9, 14, 7] },
    fill: { color: '#bcd4ee', intensity: 0.55, position: [-11, 7, -6] },
    // Day ambient stays low: the sky is bright, the shadows are still deep.
    ambient: { color: '#dfe6ec', intensity: 0.4 },
    rim: { color: '#ffffff', intensity: 0.85, position: [-4, 5, -12] },
    envIntensity: 0.85,
    fogScale: 1,
    sky: { top: '#a8b6c4', middle: '#d5d9dc', bottom: '#c9c4bb' },
    contactStrength: 0.55,
  },
  dusk: {
    id: 'dusk',
    name: 'DUSK',
    note: 'LOW SUN / LONG SHADOWS',
    background: '#17181c',
    fogColor: '#1d1e23',
    exposure: 0.96,
    // Warm but restrained: concrete has to stay concrete. The dusk reading comes from the
    // contrast with the cold ambient and the low angle, not from an orange filter.
    key: { color: '#ffe3c0', intensity: 3.6, position: [13, 3.4, 4] },
    fill: { color: '#6d90c4', intensity: 0.7, position: [-9, 6, -8] },
    ambient: { color: '#4c5866', intensity: 0.24 },
    rim: { color: '#a8c0dd', intensity: 1.5, position: [-6, 7, -13] },
    envIntensity: 0.7,
    fogScale: 1.15,
    sky: { top: '#141821', middle: '#2c2a2a', bottom: '#6b5a49' },
    contactStrength: 0.8,
  },
  night: {
    id: 'night',
    name: 'NIGHT',
    note: 'MOONLIGHT / DEEP FOG',
    background: '#08090b',
    fogColor: '#0a0c0f',
    exposure: 1.12,
    key: { color: '#cfe0f2', intensity: 2.6, position: [-6, 12, -7] },
    fill: { color: '#26364a', intensity: 0.4, position: [10, 4, 6] },
    ambient: { color: '#33404f', intensity: 0.22 },
    // A bright back light is what makes stone read against a black sky.
    rim: { color: '#8fabd0', intensity: 1.3, position: [7, 9, 11] },
    envIntensity: 0.42,
    fogScale: 1.35,
    sky: { top: '#05070c', middle: '#0b1018', bottom: '#171c24' },
    contactStrength: 0.95,
  },
};

export const LIGHTING_ORDER: readonly LightingModeId[] = ['day', 'dusk', 'night'];

/* ------------------------------------------------------------------ */
/* Quality                                                             */
/* ------------------------------------------------------------------ */

export interface QualityProfile {
  id: QualityMode;
  name: string;
  maxObjects: number;
  maxPixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  environmentResolution: number;
  environmentFrames: number;
  gridSegments: number;
}

export const QUALITY_PROFILES: Record<QualityMode, QualityProfile> = {
  high: {
    id: 'high',
    name: 'HIGH',
    maxObjects: 160,
    maxPixelRatio: 1.6,
    shadows: true,
    shadowMapSize: 2048,
    environmentResolution: 128,
    environmentFrames: 1,
    gridSegments: 120,
  },
  lite: {
    id: 'lite',
    name: 'LITE',
    maxObjects: 96,
    maxPixelRatio: 1,
    shadows: false,
    shadowMapSize: 512,
    environmentResolution: 32,
    environmentFrames: 1,
    gridSegments: 60,
  },
};

/* ------------------------------------------------------------------ */
/* Defaults for new objects                                            */
/* ------------------------------------------------------------------ */

export const DEFAULT_SIZE: Record<ObjectKind, Vec3> = {
  block: [1.6, 1.6, 1.6],
  column: [0.5, 2.6, 0.5],
  slab: [2.6, 0.24, 2.6],
  frame: [1.8, 2.2, 0.3],
};

export const KIND_LABEL: Record<ObjectKind, string> = {
  block: 'Block',
  column: 'Column',
  slab: 'Slab',
  frame: 'Frame',
};

/** Default accent — the single saturated colour allowed in the whole scene. */
export const DEFAULT_ACCENT = '#ff6a3d';