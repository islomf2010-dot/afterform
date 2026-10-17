import type { ArchObject, Tone, Vec3 } from '@/types/scene';

export interface Part {
  /** Centre of the box part in world space. */
  position: Vec3;
  size: Vec3;
  /** Euler angles in radians — identity for the orthogonal bulk of a composition. */
  rotation: Vec3;
  tone: Tone;
}

const MIN_POST = 0.14;
const MAX_POST = 0.5;
const ZERO: Vec3 = [0, 0, 0];

/**
 * Splits an element into axis aligned box parts.
 * Everything in AFTERFORM is made of boxes, which is what makes instancing possible.
 */
export function objectParts(object: ArchObject): Part[] {
  const tone: Tone = object.tone ?? 'mass';
  const rotation = object.rotation ?? ZERO;

  if (object.kind !== 'frame') return [{ position: object.position, size: object.size, rotation, tone }];

  const [cx, cy, cz] = object.position;
  const [w, h, d] = object.size;
  const t = clamp(Math.min(w, d) * 0.3, MIN_POST, MAX_POST);

  return [
    // left post
    { position: [cx - w / 2 + t / 2, cy, cz], size: [t, h, d], rotation, tone },
    // right post
    { position: [cx + w / 2 - t / 2, cy, cz], size: [t, h, d], rotation, tone },
    // lintel
    { position: [cx, cy + h / 2 - t / 2, cz], size: [w, t, d], rotation, tone },
  ];
}

export interface PartInstance extends Part {
  objectId: string;
  /** Index of the part inside its parent object. */
  partIndex: number;
}

/** Flat list of every box part in a composition — the instancing source of truth. */
export function buildPartIndex(objects: readonly ArchObject[]): PartInstance[] {
  const parts: PartInstance[] = [];
  for (const object of objects) {
    objectParts(object).forEach((part, partIndex) => {
      parts.push({ ...part, objectId: object.id, partIndex });
    });
  }
  return parts;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}