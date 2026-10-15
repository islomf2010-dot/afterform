import type { LightingModeId, MaterialPresetId, ObjectKind, QualityMode, Vec3 } from '@/types/scene';

/* ------------------------------------------------------------------ */
/* Material presets                                                    */
/* ------------------------------------------------------------------ */

export interface MaterialPreset {
  id: MaterialPresetId;
  name: string;
  /** Shown in the UI as a technical caption. */
  note: string;
  color: string;
  roughness: number;
  metalness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  transparent: boolean;
  opacity: number;
  /** Line colour of the edge overlay used by transparent presets. */
  edge: string;
  edgeOpacity: number;
  /** Extra emissive on the accent light source, not on the geometry. */
  envMapIntensity: number;
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
    color: '#b6b3ac',
    roughness: 0.94,
    metalness: 0.0,
    clearcoat: 0.0,
    clearcoatRoughness: 0.6,
    transparent: false,
    opacity: 1,
    edge: '#6f6c66',
    edgeOpacity: 0.35,
    envMapIntensity: 0.55,
    ground: { color: '#b9b6ae', roughness: 0.98, metalness: 0 },
    grid: { color: '#6f6c66' },
    accentIntensity: 0.35,
  },
  glass: {
    id: 'glass',
    name: 'GLASS',
    note: 'TRANSLUCENT / SOFT ENVIRONMENT',
    color: '#c9d6db',
    roughness: 0.06,
    metalness: 0.0,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    transparent: true,
    opacity: 0.4,
    // Mid grey reads against both the white of Day and the black of Night.
    edge: '#4d585e',
    edgeOpacity: 0.5,
    envMapIntensity: 1.75,
    ground: { color: '#cfd4d6', roughness: 0.42, metalness: 0.1 },
    grid: { color: '#8a9499' },
    accentIntensity: 0.7,
  },
  monolith: {
    id: 'monolith',
    name: 'MONOLITH',
    note: 'DARK STONE / DRAMATIC SHADOW',
    color: '#26282b',
    roughness: 0.38,
    metalness: 0.18,
    clearcoat: 0.25,
    clearcoatRoughness: 0.35,
    transparent: false,
    opacity: 1,
    edge: '#9aa0a6',
    edgeOpacity: 0.35,
    envMapIntensity: 0.7,
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
}

export const LIGHTING_MODES: Record<LightingModeId, LightingMode> = {
  day: {
    id: 'day',
    name: 'DAY',
    note: 'NEUTRAL / HIGH KEY',
    background: '#d8d6d1',
    fogColor: '#d8d6d1',
    exposure: 1.05,
    key: { color: '#fff6e8', intensity: 3.4, position: [9, 14, 7] },
    fill: { color: '#cfe0f2', intensity: 0.85, position: [-11, 7, -6] },
    ambient: { color: '#e9ecef', intensity: 0.62 },
    rim: { color: '#ffffff', intensity: 0.7, position: [-4, 5, -12] },
    envIntensity: 0.85,
    fogScale: 1,
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
    key: { color: '#f2e6d8', intensity: 2.6, position: [13, 4.2, 4] },
    fill: { color: '#7ea0cc', intensity: 0.95, position: [-9, 6, -8] },
    ambient: { color: '#5d6876', intensity: 0.36 },
    rim: { color: '#a8c0dd', intensity: 1.0, position: [-6, 7, -13] },
    envIntensity: 0.7,
    fogScale: 1.15,
  },
  night: {
    id: 'night',
    name: 'NIGHT',
    note: 'MOONLIGHT / DEEP FOG',
    background: '#08090b',
    fogColor: '#0a0c0f',
    exposure: 1.12,
    key: { color: '#b9cfe6', intensity: 1.85, position: [-6, 12, -7] },
    fill: { color: '#2b3a4d', intensity: 0.45, position: [10, 4, 6] },
    ambient: { color: '#414c5a', intensity: 0.3 },
    rim: { color: '#7f97b5', intensity: 0.65, position: [7, 9, 11] },
    envIntensity: 0.42,
    fogScale: 1.35,
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