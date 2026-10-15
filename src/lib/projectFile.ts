import { defaultParams } from './generator';
import { DEFAULT_ACCENT } from './presets';
import type {
  ArchObject,
  Composition,
  GeneratorParams,
  LightingModeId,
  LookState,
  MaterialPresetId,
  ObjectKind,
  ProjectFile,
  QualityMode,
  Vec3,
} from '@/types/scene';
import { OBJECT_KINDS } from '@/types/scene';

export const FILE_FORMAT = 'afterform.composition';
export const FILE_VERSION = 1 as const;

export function defaultLook(): LookState {
  return {
    material: 'brutalism',
    lighting: 'dusk',
    keyIntensity: 1,
    accentColor: DEFAULT_ACCENT,
    fogDensity: 0.016,
    gridVisible: true,
    quality: 'high',
  };
}

export type ParseResult = { ok: true; file: ProjectFile; warnings: string[] } | { ok: false; error: string };

const LIMITS = {
  objects: 400,
  size: [-40, 40] as const,
  param: [0, 1] as const,
};

const MATERIAL_IDS: readonly MaterialPresetId[] = ['brutalism', 'glass', 'monolith'];
const LIGHTING_IDS: readonly LightingModeId[] = ['day', 'dusk', 'night'];
const QUALITY_IDS: readonly QualityMode[] = ['high', 'lite'];
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Validates an uploaded composition. Anything unrecognised is dropped instead of throwing the
 * whole file away — a broken element should not cost the user their work.
 */
export function parseProjectFile(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'File is not valid JSON.' };
  }

  if (!isRecord(raw)) return { ok: false, error: 'File root must be an object.' };
  if (raw.format !== FILE_FORMAT) return { ok: false, error: `Unsupported format "${String(raw.format ?? 'missing')}".` };
  if (raw.version !== FILE_VERSION) return { ok: false, error: `Unsupported version "${String(raw.version ?? 'missing')}".` };

  const warnings: string[] = [];
  const composition = parseComposition(raw.composition, warnings);
  if (!composition) return { ok: false, error: 'Composition block is missing or malformed.' };
  const look = parseLook(raw.look);
  if (!look) return { ok: false, error: 'Look block is missing or malformed.' };

  return {
    ok: true,
    warnings,
    file: {
      format: FILE_FORMAT,
      version: FILE_VERSION,
      composition,
      look,
      savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : new Date().toISOString(),
    },
  };
}

function parseComposition(value: unknown, warnings: string[]): Composition | null {
  if (!isRecord(value)) return null;
  const params = parseParams(value.params, warnings);
  const objects = parseObjects(value.objects, warnings);
  const name = typeof value.name === 'string' && value.name.trim().length > 0 ? value.name.trim().slice(0, 64) : 'IMPORTED STUDY';
  const seed = typeof value.seed === 'string' && value.seed.length > 0 ? value.seed.slice(0, 64) : params.seed;

  return { name, seed, params, objects };
}

function parseParams(value: unknown, warnings: string[]): GeneratorParams {
  const base = defaultParams();
  if (!isRecord(value)) {
    warnings.push('Generator parameters missing, defaults applied.');
    return base;
  }
  const read = (key: 'height' | 'density' | 'symmetry' | 'complexity'): number => {
    const raw = value[key];
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return base[key];
    return clamp(raw, LIMITS.param[0], LIMITS.param[1]);
  };
  const seed = typeof value.seed === 'string' && value.seed.length > 0 ? value.seed.slice(0, 64) : base.seed;
  return { height: read('height'), density: read('density'), symmetry: read('symmetry'), complexity: read('complexity'), seed };
}

function parseObjects(value: unknown, warnings: string[]): ArchObject[] {
  if (!Array.isArray(value)) {
    warnings.push('Element list missing, empty composition.');
    return [];
  }
  if (value.length > LIMITS.objects) warnings.push(`File contained more than ${LIMITS.objects} elements, extras dropped.`);
  const objects: ArchObject[] = [];
  const seen = new Set<string>();
  let dropped = 0;
  let renamed = 0;

  for (const entry of value.slice(0, LIMITS.objects)) {
    const object = parseObject(entry, objects.length);
    if (!object) {
      dropped++;
      continue;
    }
    // Selection works by id, so duplicates from a hand edited file have to be broken.
    let id = object.id;
    if (seen.has(id)) {
      renamed++;
      id = `${id}-${seen.size}`;
    }
    seen.add(id);
    objects.push(renamed ? { ...object, id } : object);
  }
  if (dropped > 0) warnings.push(`${dropped} malformed element${dropped === 1 ? '' : 's'} skipped.`);
  if (renamed > 0) warnings.push(`${renamed} duplicate element id${renamed === 1 ? '' : 's'} renamed.`);
  if (objects.length === 0) warnings.push('Composition is empty.');
  return objects;
}

function parseObject(value: unknown, fallbackIndex: number): ArchObject | null {
  if (!isRecord(value)) return null;
  const kind = value.kind;
  if (typeof kind !== 'string' || !OBJECT_KINDS.includes(kind as ObjectKind)) return null;
  const position = parseVec(value.position);
  const size = parseVec(value.size);
  if (!position || !size) return null;
  if (size[0] < 0.02 || size[1] < 0.02 || size[2] < 0.02) return null;

  const id = typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 64 ? value.id : `imported-${fallbackIndex}`;
  return { id: sanitiseId(id, fallbackIndex), kind: kind as ObjectKind, position, size };
}

function parseLook(value: unknown): LookState | null {
  if (!isRecord(value)) return null;
  const base = defaultLook();
  const material = MATERIAL_IDS.includes(value.material as MaterialPresetId) ? (value.material as MaterialPresetId) : base.material;
  const lighting = LIGHTING_IDS.includes(value.lighting as LightingModeId) ? (value.lighting as LightingModeId) : base.lighting;
  const quality = QUALITY_IDS.includes(value.quality as QualityMode) ? (value.quality as QualityMode) : base.quality;
  const accentColor = typeof value.accentColor === 'string' && HEX.test(value.accentColor) ? value.accentColor : base.accentColor;

  return {
    material,
    lighting,
    quality,
    accentColor,
    keyIntensity: readRange(value.keyIntensity, 0, 2, base.keyIntensity),
    fogDensity: readRange(value.fogDensity, 0, 0.08, base.fogDensity),
    gridVisible: typeof value.gridVisible === 'boolean' ? value.gridVisible : base.gridVisible,
  };
}

function readRange(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return clamp(value, min, max);
}

function parseVec(value: unknown): Vec3 | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const out: number[] = [];
  for (const item of value) {
    if (typeof item !== 'number' || !Number.isFinite(item)) return null;
    out.push(clamp(item, LIMITS.size[0], LIMITS.size[1]));
  }
  return out as Vec3;
}

function sanitiseId(id: string, fallbackIndex: number): string {
  return /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : `imported-${fallbackIndex}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function serialiseProjectFile(composition: Composition, look: LookState): string {
  const file: ProjectFile = {
    format: FILE_FORMAT,
    version: FILE_VERSION,
    composition,
    look,
    savedAt: new Date().toISOString(),
  };
  return JSON.stringify(file, null, 2);
}