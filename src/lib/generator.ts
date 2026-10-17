import { Rng, seedToLabel } from './rng';
import type { ArchObject, Bounds, Composition, GeneratorParams, ObjectKind, Tone, Vec3 } from '@/types/scene';

/** Horizontal module of the site grid. Every dimension snaps to fractions of this. */
export const CELL = 2;
/** Vertical module — one storey. */
export const STOREY = 1.15;
/** Height of the ground plate the whole study stands on. */
export const PLATE_H = 0.12;

const P_MASS = 3;
const P_STRUCTURE = 2;
const P_DETAIL = 1;

/**
 * Element allowances per build stage, before mirroring. They are reserved from the tower
 * stage onwards so that adding articulation detail can never crowd out the composition's
 * organising gestures — the enclosure, the bridges, the gateways, the landmarks.
 */
const PERIMETER_BUDGET = 16;
const BRIDGE_BUDGET = 10;
const GATEWAY_BUDGET = 8;
const LANDMARK_BUDGET = 16;
/** An arch is 2 piers + 7 voussoirs, mirrored up to four ways: the most expensive gesture. */
const ARCH_COST = 9 * 4;

/**
 * Safety clamps on generated sizes. The floor has to sit below the thinnest detail the
 * vocabulary uses — reveal depth (0.07) and the scale figure (0.11) — or the clamp silently
 * fattens every opening in the composition.
 */
const SIZE_LIMITS = { w: [0.06, 14] as const, h: [0.06, 40] as const, d: [0.06, 14] as const };

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

const cellKey = (x: number, z: number): string => `${x}|${z}`;

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export interface GenerateOptions {
  /** Hard ceiling on generated elements — driven by the active quality mode. */
  maxObjects?: number;
}

const COMPOSITION_WORDS = [
  'CLOISTER',
  'FORUM',
  'TERRACE',
  'ARCHIVE',
  'PARAPET',
  'ROTUNDA',
  'ATRIUM',
  'VESTIBULE',
  'CANTILEVER',
  'PLINTH',
] as const;

export function defaultParams(): GeneratorParams {
  return {
    height: 0.55,
    density: 0.5,
    symmetry: 0.5,
    complexity: 0.45,
    seed: 'CLOISTER',
  };
}

export function generateComposition(params: GeneratorParams, options: GenerateOptions = {}): Composition {
  const maxObjects = clampInt(options.maxObjects ?? 160, 24, 220);
  const rng = new Rng(params.seed);

  const maxLevels = clampInt(Math.round(2 + params.height * 9), 2, 11);
  const mirror = symmetryAxis(params.symmetry);
  const courtyard = params.symmetry >= 0.34 && rng.chance(0.35 + params.symmetry * 0.4);
  const radius = 2 + Math.round(params.density * 2);

  const builder = new Builder(seedToLabel(params.seed), maxObjects);
  const cells = planSite(params, rng, mirror, courtyard, maxObjects, radius);

  const ctx: Ctx = {
    params,
    seed: params.seed,
    rng,
    cells,
    occupied: new Set(cells.map((c) => cellKey(c.x, c.z))),
    builder,
    mirror,
    courtyard,
    radius,
    site: { plateW: 0, plateD: 0 },
    podium: null,
  };

  buildSite(ctx);
  /**
   * The budget is spent in order of what makes a composition read as architecture, and every
   * stage keeps the next stage's allowance reserved. Without that reservation the towers
   * swallow the whole budget and the composition quietly loses its arch, stairs and figures —
   * which is exactly the detail that separates a study from a pile of boxes.
   */
  builder.reserve = LANDMARK_BUDGET + PERIMETER_BUDGET + BRIDGE_BUDGET + GATEWAY_BUDGET;
  buildTowers(ctx, maxLevels);

  builder.reserve = LANDMARK_BUDGET + PERIMETER_BUDGET + BRIDGE_BUDGET;
  buildPerimeter(ctx);

  builder.reserve = LANDMARK_BUDGET + BRIDGE_BUDGET;
  buildBridges(ctx);

  builder.reserve = LANDMARK_BUDGET;
  buildGateways(ctx);

  buildLandmarks(ctx);
  builder.reserve = 0;

  return {
    name: `${rng.pick(COMPOSITION_WORDS)} ${seedToLabel(params.seed)}`,
    seed: params.seed,
    params: { ...params },
    objects: builder.objects(),
  };
}

/**
 * Emits a set of drafts through the plan's mirror planes.
 * Towers, stairs, figures and arches all go through here: half a reflection is a lie about
 * the symmetry, so a group that does not fit is dropped whole.
 */
function emitMirrored(ctx: Ctx, drafts: readonly Draft[]): void {
  const { builder } = ctx;
  const signs = mirrorSigns(ctx.mirror);

  let needed = 0;
  for (const draft of drafts) needed += reflectionCount(draft, signs);
  if (!builder.fits(needed)) return;

  for (const draft of drafts) {
    for (const [signX, signZ] of signs) builder.addMirrored(draft, signX, signZ);
  }
}

/** How many copies of a draft a set of mirror signs produces. */
function reflectionCount(draft: Draft, signs: readonly (readonly [number, number])[]): number {
  let count = 0;
  for (const [signX, signZ] of signs) {
    if (signX === -1 && Math.abs(draft.x) < 1e-4) continue;
    if (signZ === -1 && Math.abs(draft.z) < 1e-4) continue;
    count++;
  }
  return count;
}

function buildTowers(ctx: Ctx, maxLevels: number): void {
  for (const cell of canonicalCells(ctx)) {
    // Every tower is built whole or not at all: a mass missing half its levels is a bug.
    const scratch = new Builder('mass', Number.MAX_SAFE_INTEGER);
    buildTower({ ...ctx, builder: scratch }, cell, maxLevels);
    emitMirrored(ctx, scratch.drafts);
  }
}

export function computeBounds(objects: readonly ArchObject[]): Bounds {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const o of objects) {
    for (let axis = 0; axis < 3; axis++) {
      const half = o.size[axis] / 2;
      min[axis] = Math.min(min[axis], o.position[axis] - half);
      max[axis] = Math.max(max[axis], o.position[axis] + half);
    }
  }
  if (!Number.isFinite(min[0])) return { min: [0, 0, 0], max: [0, 0, 0] };
  return { min, max };
}

/* ------------------------------------------------------------------ */
/* Builder                                                             */
/* ------------------------------------------------------------------ */

/** An element before it becomes part of the composition — kept so it can be mirrored. */
interface Draft {
  kind: ObjectKind;
  x: number;
  base: number;
  z: number;
  w: number;
  h: number;
  d: number;
  priority: number;
  tone: Tone;
  rotation: Vec3;
}

interface AddOptions {
  priority?: number;
  tone?: Tone;
  /** Euler angles in radians. Identity for everything on the grid. */
  rotation?: Vec3;
}

const NO_ROTATION: Vec3 = [0, 0, 0];

class Builder {
  readonly drafts: Draft[] = [];

  constructor(
    private readonly tag: string,
    private readonly budget: number,
  ) {}

  /** Elements kept free for structures that must always exist (frames, bridges, wall). */
  reserve = 0;

  get used(): number {
    return this.drafts.length;
  }

  get remaining(): number {
    return Math.max(0, this.budget - this.drafts.length - this.reserve);
  }

  /** Detail is the first thing to be dropped when the budget runs out. */
  canAdd(reserve = 0): boolean {
    return this.drafts.length + reserve + this.reserve < this.budget;
  }

  /**
   * True when a whole group can be placed. Used for anything that comes in mirrored sets:
   * half a reflection is worse than no reflection.
   */
  fits(count: number): boolean {
    return this.drafts.length + this.reserve + count + 2 <= this.budget;
  }

  add(kind: ObjectKind, x: number, base: number, z: number, w: number, h: number, d: number, options: AddOptions = {}): boolean {
    const priority = options.priority ?? P_STRUCTURE;
    if (priority === P_DETAIL ? !this.canAdd(2) : !this.canAdd()) return false;
    if (![x, base, z, w, h, d].every(Number.isFinite)) return false;
    this.drafts.push({
      kind,
      x,
      base,
      z,
      w: clamp(w, SIZE_LIMITS.w[0], SIZE_LIMITS.w[1]),
      h: clamp(h, SIZE_LIMITS.h[0], SIZE_LIMITS.h[1]),
      d: clamp(d, SIZE_LIMITS.d[0], SIZE_LIMITS.d[1]),
      priority,
      tone: options.tone ?? 'mass',
      rotation: options.rotation ?? NO_ROTATION,
    });
    return true;
  }

  /** Copies an existing element through the plan's mirror planes. */
  addMirrored(draft: Draft, signX: number, signZ: number): boolean {
    if (signX === 1 && signZ === 1) return this.add(draft.kind, draft.x, draft.base, draft.z, draft.w, draft.h, draft.d, draft);
    // An element sitting exactly on a mirror plane is its own reflection.
    if (signX === -1 && Math.abs(draft.x) < 1e-4) return false;
    if (signZ === -1 && Math.abs(draft.z) < 1e-4) return false;
    // A mirrored rotation keeps the gesture mirrored, not simply copied.
    const rotation: Vec3 = draft.rotation.map((value, axis) => (axis === 0 ? -value : axis === 2 ? -value : value)) as Vec3;
    return this.add(draft.kind, draft.x * signX, draft.base, draft.z * signZ, draft.w, draft.h, draft.d, { ...draft, rotation });
  }

  /** Final elements with stable, sequential ids. */
  objects(): ArchObject[] {
    return this.drafts.map((draft, index) => ({
      id: `${this.tag}-${String(index).padStart(3, '0')}`,
      kind: draft.kind,
      position: [round(draft.x), round(draft.base + draft.h / 2), round(draft.z)],
      size: [round(draft.w), round(draft.h), round(draft.d)],
      tone: draft.tone,
      ...(draft.rotation.some((value) => Math.abs(value) > 1e-6) ? { rotation: draft.rotation.map(round) as Vec3 } : {}),
    }));
  }
}

interface Symmetry {
  x: boolean;
  z: boolean;
}

function symmetryAxis(value: number): Symmetry {
  if (value >= 0.67) return { x: true, z: true };
  if (value >= 0.34) return { x: true, z: false };
  return { x: false, z: false };
}

interface Cell {
  x: number;
  z: number;
  /** Distance from the centre in grid rings — drives the falloff of heights. */
  ring: number;
  isCore: boolean;
  /** Y of the surface this cell stands on (ground plate or podium). */
  base: number;
  /** Storeys planned for this mass. */
  levels: number;
}

interface Ctx {
  params: GeneratorParams;
  seed: string;
  rng: Rng;
  cells: Cell[];
  occupied: Set<string>;
  builder: Builder;
  mirror: Symmetry;
  courtyard: boolean;
  radius: number;
  site: { plateW: number; plateD: number };
  /** Raised podium at the centre of the plan, when the composition has one. */
  podium: { w: number; d: number; h: number } | null;
}

/** Canonical cells — the only ones the plan is generated from; the rest are mirrored copies. */
function canonicalCells(ctx: Ctx): Cell[] {
  return ctx.cells.filter((c) => c.x >= 0 && c.z >= 0);
}

/**
 * Per cell randomness keyed on the absolute grid position, so a cell and its mirror image
 * are built from the identical sequence. Symmetry you can see is the whole point.
 */
function cellRng(ctx: Ctx, cell: Cell): Rng {
  return new Rng(`${ctx.seed}|${Math.abs(cell.x)}:${Math.abs(cell.z)}`);
}

/* ------------------------------------------------------------------ */
/* Site plan                                                           */
/* ------------------------------------------------------------------ */

/**
 * Picks the cells of the plan. The number of masses is derived from the object budget so a
 * composition always finishes inside it — a truncated tower reads as a bug, not as architecture.
 */
function planSite(params: GeneratorParams, rng: Rng, mirror: Symmetry, courtyard: boolean, maxObjects: number, radius: number): Cell[] {
  const capacity = clampInt(((maxObjects - 28) / 10) * (0.42 + params.density * 0.9), 2, 13);

  const candidates: { x: number; z: number; ring: number; isCore: boolean; weight: number }[] = [];
  for (let x = 0; x <= radius; x++) {
    for (let z = 0; z <= radius; z++) {
      const ring = Math.max(x, z);
      const isCore = x === 0 && z === 0;
      // The courtyard variant keeps the middle empty and builds its walls instead.
      if (courtyard && isCore) continue;
      const centrality = 1 - ring / (radius + 1);
      const weight = isCore ? 3.4 : 0.25 + centrality * 1.35;
      candidates.push({ x, z, ring, isCore, weight });
    }
  }

  const chosen: Cell[] = [];
  const adjacencyRejection = 0.72 - params.density * 0.42;
  const pool = candidates.slice();

  while (chosen.length < capacity && pool.length > 0) {
    let total = 0;
    for (const c of pool) total += c.weight;
    let roll = rng.float() * total;
    let index = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      roll -= pool[i].weight;
      if (roll <= 0) {
        index = i;
        break;
      }
    }
    const pick = pool.splice(index, 1)[0];

    // Keep a little air between the masses: touching is allowed, clumping is not.
    if (!pick.isCore && chosen.some((c) => Math.max(Math.abs(c.x - pick.x), Math.abs(c.z - pick.z)) === 1) && rng.chance(adjacencyRejection)) {
      continue;
    }
    chosen.push({ x: pick.x, z: pick.z, ring: pick.ring, isCore: pick.isCore, base: PLATE_H, levels: 1 });
  }

  if (chosen.length === 0) chosen.push({ x: 0, z: 0, ring: 0, isCore: true, base: PLATE_H, levels: 1 });

  // Mirror the canonical quadrant into the full plan.
  const result: Cell[] = [];
  const seen = new Set<string>();
  const push = (x: number, z: number, source: Cell): void => {
    const key = cellKey(x, z);
    if (seen.has(key)) return;
    seen.add(key);
    result.push({ ...source, x, z });
  };
  for (const cell of chosen) {
    push(cell.x, cell.z, cell);
    if (mirror.x) push(-cell.x, cell.z, cell);
    if (mirror.z) push(cell.x, -cell.z, cell);
    if (mirror.x && mirror.z) push(-cell.x, -cell.z, cell);
  }

  const maxRing = result.reduce((acc, c) => Math.max(acc, c.ring), 1);
  const maxLevels = clampInt(Math.round(2 + params.height * 9), 2, 11);
  const ambition = 0.28 + params.height * 0.95;

  for (const cell of result) {
    const centrality = 1 - cell.ring / (maxRing + 1);
    cell.levels = clampInt(Math.round((ambition * (0.6 + centrality * 3.1) * rng.range(0.72, 1.28)) + 1), 1, maxLevels);
  }

  // One dominant mass: the tallest volume of the plan, always at the centre of gravity.
  // The bonus stays small — a hero that dwarfs the site reads as a landmark, not a study.
  const hero = result.reduce((best, c) => (c.levels > best.levels ? c : best), result[0]);
  hero.levels = Math.min(maxLevels, hero.levels + 1 + Math.round(params.height));
  // The flag follows every mirrored copy, otherwise only one quadrant gets the crown.
  for (const cell of result) {
    if (Math.abs(cell.x) === Math.abs(hero.x) && Math.abs(cell.z) === Math.abs(hero.z)) cell.isCore = true;
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* Site                                                                */
/* ------------------------------------------------------------------ */

function buildSite(ctx: Ctx): void {
  const { rng, params, builder, cells } = ctx;
  if (cells.length === 0) return;

  let extentX = 0;
  let extentZ = 0;
  for (const cell of cells) {
    extentX = Math.max(extentX, Math.abs(cell.x));
    extentZ = Math.max(extentZ, Math.abs(cell.z));
  }

  // The study stands on a thin plate, like a model on a table.
  const plateW = extentX * CELL + CELL * 1.5;
  const plateD = extentZ * CELL + CELL * 1.5;
  ctx.site = { plateW, plateD };
  builder.add('slab', 0, 0, 0, plateW, PLATE_H, plateD, { priority: P_MASS });

  // A raised podium gives the plan a centre and a second hierarchy level.
  if (params.complexity > 0.22) {
    const w = CELL * (1.4 + params.density * 1.1);
    const d = CELL * (1.4 + params.complexity * 0.9);
    const h = 0.18 + params.height * 0.4;
    if (builder.add('slab', 0, PLATE_H, 0, w, h, d, { priority: P_MASS, tone: 'base' })) {
      ctx.podium = { w, d, h };
      for (const cell of cells) {
        if (Math.abs(cell.x) * CELL + CELL * 0.48 <= w / 2 && Math.abs(cell.z) * CELL + CELL * 0.48 <= d / 2) {
          cell.base = PLATE_H + h;
        }
      }
    }
  }

  // A threshold around the podium: it ties the two levels together and stops the podium
  // from reading as a slab dropped on the ground.
  if (ctx.podium && builder.canAdd(6)) {
    const podium = ctx.podium;
    const step = 0.16;
    const ring = 0.42;
    const w = podium.w + ring;
    const d = podium.d + ring;
    for (const [dx, dz, fw, fd] of [
      [0, -d / 2 + step / 2, w, step],
      [0, d / 2 - step / 2, w, step],
      [-w / 2 + step / 2, 0, step, d],
      [w / 2 - step / 2, 0, step, d],
    ] as const) {
      builder.add('slab', dx, PLATE_H, dz, fw, ctx.podium.h * 0.55, fd, { priority: P_DETAIL, tone: 'base' });
    }
  }

  // Courtyard: a sunken court at the centre of the plan reads as a void, not a hole.
  if (ctx.courtyard && builder.canAdd(4)) {
    builder.add('slab', 0, PLATE_H, 0, CELL * 1.05, 0.05, CELL * 1.05, { priority: P_DETAIL, tone: 'accent' });
  }
  void rng;

}

/* ------------------------------------------------------------------ */
/* Towers                                                              */
/* ------------------------------------------------------------------ */

type Archetype = 'massing' | 'pavilion' | 'cantilever' | 'terrace';

function buildTower(ctx: Ctx, cell: Cell, maxLevels: number): void {
  const { params } = ctx;
  // Every cell draws from its own stream keyed on |x|,|z| — that is what makes mirrored
  // cells produce identical buildings instead of merely similar ones.
  const rng = cellRng(ctx, cell);
  const levels = Math.min(cell.levels, maxLevels);

  const archetype: Archetype = cell.isCore
    ? rng.weighted<Archetype>([
        ['massing', 3],
        ['terrace', 2.2],
        ['cantilever', 1.6],
        ['pavilion', 1],
      ])
    : rng.weighted<Archetype>([
        ['massing', 3.4],
        ['terrace', 2],
        ['pavilion', 1.6],
        ['cantilever', 1.4],
      ]);

  switch (archetype) {
    case 'massing':
      // The dominant mass is built around a void: four masses and an opening read as
      // architecture, a single tall stack reads as a chimney.
      if (cell.isCore && params.complexity > 0.3 && levels >= 3 && rng.chance(0.55)) voidTower(ctx, cell, levels, rng);
      else massingTower(ctx, cell, levels, rng);
      break;
    case 'pavilion':
      // A single-storey colonnade under a roof plate: cheap in elements, strong in reading.
      pavilion(ctx, cell, rng);
      break;
    case 'cantilever':
      cantileverTower(ctx, cell, Math.min(levels, 6), rng);
      break;
    case 'terrace':
      terraceTower(ctx, cell, levels, rng);
      break;
  }

  if (cell.isCore && params.complexity > 0.4 && params.height > 0.3) addMast(ctx, cell, rng);
  else if (params.complexity > 0.55 && cell.ring === 1 && rng.chance(0.3)) addCrown(ctx, cell, rng);
}

/**
 * A tower with a hole in it: two piers, a lintel and a cantilevered upper volume. The void is
 * what makes it a building rather than a block — and it gives the silhouette a centre of gravity.
 */
function voidTower(ctx: Ctx, cell: Cell, levels: number, rng: Rng): void {
  const { builder } = ctx;
  const wx = cell.x * CELL;
  const wz = cell.z * CELL;
  const w = CELL * rng.range(0.86, 1.02);
  const d = CELL * rng.range(0.8, 0.96);
  const voidH = Math.min(levels * STOREY * 0.72, levels * STOREY - STOREY * 0.9);
  const pier = w * rng.range(0.24, 0.32);

  let y = cell.base;
  // Plinth: the base sits on the site as one solid volume.
  builder.add('block', wx, y, wz, w + 0.24, STOREY * 0.5, d + 0.24, { priority: P_MASS, tone: 'base' });
  y += STOREY * 0.5;

  // Two piers carry the void.
  for (const side of [-1, 1]) {
    builder.add('block', wx + side * (w - pier) / 2, y, wz, pier, voidH, d, { priority: P_MASS });
  }
  // Lintel across the top of the opening.
  builder.add('block', wx, y + voidH, wz, w, STOREY * 0.42, d, { priority: P_MASS });
  addRevealBand(ctx, wx, wz, w, d, y + voidH, STOREY * 0.42, rng);
  y += voidH + STOREY * 0.42;

  // Upper volume, set back and canted off the opening.
  const remaining = Math.max(1, Math.floor((cell.base + levels * STOREY * 1.5 - y) / STOREY));
  let upperW = w * rng.range(0.82, 1.0);
  let upperD = d * rng.range(0.82, 1.0);
  for (let i = 0; i < remaining; i++) {
    const last = i === remaining - 1;
    const h = STOREY * (last ? rng.range(0.7, 1.0) : rng.range(1.1, 1.7));
    const ox = rng.jitter(CELL * 0.05);
    const oz = rng.jitter(CELL * 0.05);
    builder.add('block', wx + ox, y, wz + oz, upperW, h, upperD, { priority: P_MASS });
    if (!last && i % 2 === 1) addRevealBand(ctx, wx + ox, wz + oz, upperW, upperD, y, h, rng);
    if (!last && rng.chance(0.4)) {
      // Belt slab: the horizontal that stops the upper volume reading as a stack.
      builder.add('slab', wx + ox, y + h - 0.02, wz + oz, upperW + 0.3, 0.1, upperD + 0.3, { priority: P_DETAIL });
    }
    y += h;
  }
  if (builder.canAdd(6)) {
    builder.add('slab', wx, y, wz, upperW + 0.28, 0.12, upperD + 0.28, { priority: P_DETAIL });
    addParapet(ctx, wx, y + 0.12, wz, upperW + 0.28, upperD + 0.28, rng);
  }
}

function massingTower(ctx: Ctx, cell: Cell, levels: number, rng: Rng): void {
  const { params, builder } = ctx;
  const wx = cell.x * CELL;
  const wz = cell.z * CELL;
  let y = cell.base;

  // Proportion is the main tool for scale contrast: a site of similar boxes reads as a model
  // of nothing, a site of one tall pier beside a low wide block reads as architecture.
  // Slender is reserved for short towers — a needle on a tall stack is a spire, not a mass.
  const slender = levels <= 3;
  const proportion = slender
    ? rng.weighted<number>([
        [0.46, 1.5],
        [0.72, 2],
        [0.94, 1.2],
      ])
    : rng.weighted<number>([
        [0.58, 1.6],
        [0.8, 2.4],
        [1.05, 1.5],
      ]);
  let w = CELL * proportion * rng.range(0.86, 1.14);
  let d = CELL * rng.range(0.56, 1.12) * (proportion > 0.7 ? 1 : rng.range(0.76, 1.22));

  for (let level = 0; level < levels; level++) {
    if (builder.remaining <= 0) return;
    const top = level === levels - 1;
    // Set back often enough that the profile clearly steps; a mass that extrudes reads as a slab.
    if (level > 0 && rng.chance(0.58 + params.complexity * 0.3)) {
      const shrink = CELL * rng.range(0.14, 0.3);
      w = Math.max(CELL * 0.32, w - shrink);
      d = Math.max(CELL * 0.32, d - shrink * rng.range(0.6, 1.2));
    }
    const h = STOREY * (top ? rng.range(0.6, 0.95) : rng.range(1.35, 2.15));
    const ox = rng.jitter(CELL * 0.04);
    const oz = rng.jitter(CELL * 0.04);

    if (params.complexity > 0.5 && !top && rng.chance(0.18)) {
      // Twin volumes with a vertical slot between them — light cuts the mass in half.
      const gap = CELL * 0.14;
      const half = (w - gap) / 2;
      builder.add('block', wx + ox - (w - half) / 2, y, wz + oz, half, h, d, { priority: P_MASS });
      builder.add('block', wx + ox + (w - half) / 2, y, wz + oz, half, h, d, { priority: P_MASS });
    } else {
      builder.add('block', wx + ox, y, wz + oz, w, h, d, { priority: P_MASS });
    }
    // Openings: the ground floor stays solid, the upper storeys get cut.
    if (!top && level > 0 && params.complexity > 0.3 && rng.chance(0.55 + params.complexity * 0.35)) {
      addRevealBand(ctx, wx + ox, wz + oz, w, d, y, h, rng);
    }
    y += h;

    // Belt slabs: the horizontal lines that make a stack read as floors, not as a lump.
    if (builder.canAdd(4) && !top && level > 0 && level % 2 === 0 && params.complexity > 0.35) {
      builder.add('slab', wx + ox, y - 0.02, wz + oz, w + 0.34, 0.1, d + 0.34, { priority: P_DETAIL });
    }
  }

  // Roof plate: the horizontal line that closes the silhouette.
  if (builder.canAdd(6) && levels > 1) {
    builder.add('slab', wx, y, wz, w + 0.3, 0.12, d + 0.3, { priority: P_DETAIL });
    // A parapet closes the roof line instead of leaving a bare plate.
    if (params.complexity > 0.4 && levels >= 3) addParapet(ctx, wx, y + 0.12, wz, w + 0.3, d + 0.3, rng);
  }
}

function pavilion(ctx: Ctx, cell: Cell, rng: Rng): void {
  const { params, builder } = ctx;
  const wx = cell.x * CELL;
  const wz = cell.z * CELL;
  const w = CELL * rng.range(0.8, 0.94);
  const d = CELL * rng.range(0.8, 0.94);
  const base = cell.base;
  const plinth = 0.18 + params.complexity * 0.12;
  builder.add('slab', wx, base, wz, w, plinth, d, { priority: P_MASS, tone: 'base' });

  const clear = STOREY * rng.range(1.5, 2.1);
  const post = 0.34 + params.complexity * 0.12;
  const insetX = (w - post) / 2;
  const insetZ = (d - post) / 2;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) builder.add('column', wx + sx * insetX, base + plinth, wz + sz * insetZ, post, clear, post, { priority: P_STRUCTURE, tone: 'accent' });
  }
  // The pavilion always has one wall to stand against.
  builder.add('block', wx, base + plinth, wz + (rng.chance(0.5) ? -1 : 1) * (d / 2 - 0.16), w * 0.99, clear, 0.32, { priority: P_MASS });
  builder.add('slab', wx, base + plinth + clear, wz, w + 0.24, 0.18, d + 0.24, { priority: P_STRUCTURE, tone: 'accent' });
}

function cantileverTower(ctx: Ctx, cell: Cell, levels: number, rng: Rng): void {
  const { params, builder } = ctx;
  const wx = cell.x * CELL;
  const wz = cell.z * CELL;
  const axis: 'x' | 'z' = rng.chance(0.5) ? 'x' : 'z';
  const sign = rng.chance(0.5) ? 1 : -1;
  const roomy = freeTowards(ctx, cell, axis, sign);
  // A pier, never a needle: the core carries the plates, so it has to look like it can.
  const coreW = roomy ? 0.62 + params.complexity * 0.28 : 0.85 + params.complexity * 0.35;
  const totalH = levels * STOREY * rng.range(1.25, 1.6);
  const coreX = axis === 'x' ? wx - sign * (CELL * 0.26 - coreW / 2) : wx + rng.jitter(0.1);
  const coreZ = axis === 'z' ? wz - sign * (CELL * 0.26 - coreW / 2) : wz + rng.jitter(0.1);

  builder.add('column', coreX, cell.base, coreZ, coreW, totalH, coreW, { priority: P_MASS });

  let y = cell.base;
  for (let level = 0; level < levels; level++) {
    if (builder.remaining <= 0) return;
    const h = STOREY * rng.range(0.45, 0.68);
    const reach = roomy ? rng.range(0.7, 0.95) : rng.range(0.5, 0.68);
    const w = axis === 'x' ? coreW + CELL * reach : CELL * rng.range(0.62, 0.86);
    const d = axis === 'x' ? CELL * rng.range(0.62, 0.86) : coreW + CELL * reach;
    const x = axis === 'x' ? coreX + (sign * (w - coreW)) / 2 : wx + rng.jitter(0.05);
    const z = axis === 'z' ? coreZ + (sign * (d - coreW)) / 2 : wz + rng.jitter(0.05);

    builder.add('slab', x, y, z, w, h, d, { priority: P_MASS });
    // The gap between the plates is the point of the type: a rhythm of air.
    y += h + STOREY * rng.range(0.45, 0.75);
  }
}

function terraceTower(ctx: Ctx, cell: Cell, levels: number, rng: Rng): void {
  const { params, builder } = ctx;
  const wx = cell.x * CELL;
  const wz = cell.z * CELL;
  let y = cell.base;
  let w = CELL * rng.range(0.84, 0.94);
  let d = CELL * rng.range(0.84, 0.94);

  for (let level = 0; level < levels; level++) {
    if (builder.remaining <= 1) return;
    const h = STOREY * rng.range(0.8, 1.2);
    builder.add('block', wx, y, wz, w, h, d, { priority: P_MASS });
    y += h;
    const step = CELL * rng.range(0.18, 0.32) * (0.6 + params.complexity * 0.7);
    w = Math.max(CELL * 0.34, w - step);
    d = Math.max(CELL * 0.34, d - step);
    if (w < CELL * 0.42) break;
  }

  if (w > CELL * 0.34 && builder.canAdd(6)) {
    builder.add('slab', wx, y, wz, w + 0.28, 0.12, d + 0.28, { priority: P_DETAIL });
    if (params.complexity > 0.4 && levels >= 3) addParapet(ctx, wx, y + 0.12, wz, w + 0.28, d + 0.28, rng);
  }
}

function topOf(builder: Builder, wx: number, wz: number, radius: number): number {
  let top = 0;
  for (const draft of builder.drafts) {
    if (Math.abs(draft.x - wx) > radius || Math.abs(draft.z - wz) > radius) continue;
    top = Math.max(top, draft.base + draft.h);
  }
  return top;
}

/**
 * The crown on the tallest mass.
 *
 * A plain stick reads as a chimney. A tapered pier with a cross-head and a small service
 * platform reads as the thing that actually crowns a building — and it gives the skyline
 * a finish instead of an accident.
 */
function addMast(ctx: Ctx, cell: Cell, rng: Rng): void {
  const { params, builder } = ctx;
  const parts = 5;
  if (!builder.canAdd(parts + 1)) return;
  const wx = cell.x * CELL + rng.jitter(0.12);
  const wz = cell.z * CELL + rng.jitter(0.12);
  const top = topOf(builder, wx, wz, CELL * 0.95);
  if (top <= 0) return;

  const height = rng.range(0.9, 1.5) + params.height * 1.2;
  const shaft = Math.max(0.14, 0.26 - params.height * 0.06);

  // The shaft, tapered by stepping it once rather than by scaling a box.
  builder.add('column', wx, top, wz, shaft, height, shaft, { priority: P_DETAIL, tone: 'accent' });
  const mid = top + height * rng.range(0.42, 0.58);
  builder.add('column', wx, mid, wz, shaft * 1.5, height * 0.16, shaft * 1.5, { priority: P_DETAIL, tone: 'accent' });

  // Service platform: a small plate the mast appears to stand on.
  builder.add('slab', wx, top + height * 0.16, wz, shaft * 5, 0.1, shaft * 5, { priority: P_DETAIL, tone: 'accent' });

  // Cross-head, the gesture that stops the silhouette from ending in a point.
  const arm = rng.chance(0.5);
  const armLength = rng.range(0.5, 0.95);
  builder.add(
    'block',
    wx,
    top + height * rng.range(0.72, 0.86),
    wz,
    arm ? armLength : shaft * 1.1,
    shaft * 1.1,
    arm ? shaft * 1.1 : armLength,
    { priority: P_DETAIL, tone: 'accent' },
  );
}

function addCrown(ctx: Ctx, cell: Cell, rng: Rng): void {
  const { builder } = ctx;
  if (!builder.canAdd(4)) return;
  const wx = cell.x * CELL;
  const wz = cell.z * CELL;
  const top = topOf(builder, wx, wz, CELL * 0.9);
  if (top <= 0) return;
  if (rng.chance(0.5)) {
    builder.add('slab', wx, top, wz, CELL * rng.range(0.8, 1.0), 0.12, CELL * rng.range(0.8, 1.0), { priority: P_DETAIL, tone: 'accent' });
  } else {
    // Parapet frame on the roof — a piece of open air you can see through.
    builder.add('frame', wx, top, wz, CELL * rng.range(0.46, 0.66), rng.range(0.8, 1.4), 0.24, { priority: P_DETAIL, tone: 'accent' });
  }
}

/* ------------------------------------------------------------------ */
/* Structures that tie the plan together                               */
/* ------------------------------------------------------------------ */

/** Thin posts and a top rail: the detail that makes a deck read as a walkway. */
function addRailings(ctx: Ctx, x: number, deck: number, z: number, alongX: boolean, length: number, width: number): void {
  const { builder } = ctx;
  const railH = 0.34;
  const railT = 0.06;
  const along = alongX ? length : width;
  const across = alongX ? width : length;
  const railLength = along - 0.16;
  for (const side of [-1, 1]) {
    const rx = alongX ? x : x + (side * across) / 2;
    const rz = alongX ? z + (side * across) / 2 : z;
    builder.add('slab', rx, deck + railH, rz, alongX ? railLength : railT, 0.07, alongX ? railT : railLength, { priority: P_DETAIL, tone: 'accent' });
  }
  // Posts at the ends only — four per bridge is plenty at this scale.
  for (const end of [-1, 1]) {
    for (const side of [-1, 1]) {
      const px = alongX ? x + (end * railLength) / 2 : x + (side * across) / 2;
      const pz = alongX ? z + (side * across) / 2 : z + (end * railLength) / 2;
      builder.add('column', px, deck, pz, 0.07, railH, 0.07, { priority: P_DETAIL, tone: 'accent' });
    }
  }
}

/** A low wall around a roof plate: the roof stops being a bare rectangle. */
function addParapet(ctx: Ctx, cx: number, base: number, cz: number, w: number, d: number, rng: Rng): void {
  const { builder } = ctx;
  const t = 0.12;
  const h = rng.range(0.3, 0.62);
  const faces: readonly [number, number, number, number][] = [
    [0, -d / 2 + t / 2, w, t],
    [0, d / 2 - t / 2, w, t],
    [-w / 2 + t / 2, 0, t, d - t * 2],
    [w / 2 - t / 2, 0, t, d - t * 2],
  ];
  for (const [dx, dz, fw, fd] of faces) builder.add('block', cx + dx, base, cz + dz, fw, h, fd, { priority: P_DETAIL });
}

/**
 * A recessed opening cut into one storey of a mass. A blank box reads as a placeholder; a band
 * of dark reveals reads as a building — this is the cheapest move towards looking designed.
 */
function addRevealBand(ctx: Ctx, wx: number, wz: number, w: number, d: number, base: number, height: number, rng: Rng): void {
  const { builder } = ctx;
  if (height < 0.5 || Math.min(w, d) < 0.85) return;
  const depth = 0.07;
  // Thin, but scaled to the storey: a reveal is a shadow line, not a belt course.
  // Fixed height reads as a printed stripe across a tall mass.
  const bandHeight = clamp(height * 0.3, 0.16, 0.46);
  if (!builder.fits(2)) return;

  const alongX = w >= d;
  const span = alongX ? w : d;
  const offset = (alongX ? d : w) / 2 - depth / 2;
  // A vertical break in the band keeps it from reading as a printed stripe.
  const inset = rng.chance(0.45) ? span * rng.range(0.12, 0.24) : span * 0.05;
  const width = Math.max(0.32, span - inset * 2);

  for (const side of [-1, 1]) {
    const x = alongX ? wx : wx + side * offset;
    const z = alongX ? wz + side * offset : wz;
    builder.add('block', x, base + height * 0.4, z, alongX ? width : depth, bandHeight, alongX ? depth : width, { priority: P_DETAIL, tone: 'base' });
  }
}

/**
 * A voussoir arch: two piers and a fan of rotated blocks. The only genuinely curved gesture
 * in the vocabulary — it earns its element budget.
 */
function addArch(ctx: Ctx, x: number, base: number, z: number, span: number, height: number, depth: number, alongX: boolean): void {
  const { builder } = ctx;
  const pierW = 0.28;
  const blocks = 7;
  const rise = Math.min(height - pierW, span * 0.42);
  if (rise < 0.5) return;
  if (!builder.fits(2 + blocks)) return;

  const radius = rise;
  for (const side of [-1, 1]) {
    const offset = alongX ? side * (span - pierW) / 2 : 0;
    const across = alongX ? 0 : side * (span - pierW) / 2;
    builder.add('block', x + offset, base, z + across, alongX ? pierW : depth, rise, alongX ? depth : pierW, { priority: P_MASS, tone: 'accent' });
  }

  const blockW = (Math.PI * radius) / blocks / 1.15;
  for (let i = 0; i < blocks; i++) {
    const angle = Math.PI - ((i + 0.5) / blocks) * Math.PI;
    const bx = Math.cos(angle) * (radius - blockW / 2);
    const by = Math.sin(angle) * (radius - blockW / 2);
    const px = alongX ? x + bx : x;
    const pz = alongX ? z : z + bx;
    builder.add('block', px, base + rise + by, pz, alongX ? blockW : depth, blockW, alongX ? depth : blockW, {
      priority: P_MASS,
      // Voussoirs are the accent family: the arch is the one gesture that is meant to read.
      tone: 'accent',
      rotation: alongX ? [0, -angle + Math.PI / 2, 0] : [angle - Math.PI / 2, 0, 0],
    });
  }
}

/** A run of treads. Cheap, and it ties two levels of the plan together. */
function addStairs(ctx: Ctx, x: number, base: number, z: number, width: number, rise: number, steps: number, alongX: boolean, up: boolean): void {
  const { builder } = ctx;
  if (steps < 2 || rise <= 0) return;
  if (!builder.fits(steps)) return;
  const run = 0.28;
  const stepRise = rise / steps;
  for (let i = 0; i < steps; i++) {
    const offset = (i + 0.5) * run * (up ? 1 : -1);
    const sx = alongX ? x + offset : x;
    const sz = alongX ? z : z + offset;
    builder.add('block', sx, base, sz, alongX ? run : width, stepRise * (i + 1), alongX ? width : run, { priority: P_DETAIL, tone: 'base' });
  }
}

/**
 * Human scale. A 1.8 unit figure next to a 14 unit tower is what tells the eye how big the
 * architecture is — without it everything reads as a toy.
 */
function addScaleFigures(ctx: Ctx, count: number, rng: Rng): void {
  const { builder, cells, site } = ctx;
  if (cells.length === 0) return;
  // The canonical quadrant only: the mirrored emission handles the rest of the plan.
  const canonical = cells.filter((c) => c.x >= 0 && c.z >= 0);
  if (canonical.length === 0) return;

  let placed = 0;
  for (let attempt = 0; attempt < count * 6 && placed < count; attempt++) {
    const cell = rng.pick(canonical);
    // Along the open edges of a cell, where a figure would actually stand.
    const side = rng.int(0, 3);
    const along = rng.range(-0.36, 0.36);
    const off = CELL * 0.46;
    const x = round(cell.x * CELL + (side < 2 ? (side === 0 ? -off : off) : along * CELL));
    const z = round(cell.z * CELL + (side >= 2 ? (side === 2 ? -off : off) : along * CELL));

    if (!onSite(x, z, site)) continue;
    // A figure needs clear ground: never inside a mass, never on the podium.
    const blocked = builder.drafts.some(
      (d) => Math.abs(d.x - x) < d.w / 2 + 0.22 && Math.abs(d.z - z) < d.d / 2 + 0.22 && d.base < PLATE_H + 1.95,
    );
    if (blocked) continue;

    builder.add('column', x, PLATE_H, z, 0.11, 1.75, 0.11, { priority: P_DETAIL, tone: 'accent' });
    placed++;
  }
}

/** A figure may stand anywhere on the plate, but not off the edge of the site. */
function onSite(x: number, z: number, site: { plateW: number; plateD: number }): boolean {
  return Math.abs(x) <= site.plateW / 2 - 0.6 && Math.abs(z) <= site.plateD / 2 - 0.6;
}

/**
 * A low enclosing wall around the site. The single cheapest gesture that turns a cluster of
 * masses into architecture: it gives the composition a base line and a sense of enclosure.
 */
function buildPerimeter(ctx: Ctx): void {
  const { rng, params, builder, mirror, site, cells } = ctx;
  if (params.complexity < 0.18) return;

  const thickness = 0.24 + params.complexity * 0.08;
  const inset = 0.5;
  // The wall is a base line, never a second skyline: it scales with the masses it encloses.
  const tallest = cells.reduce((acc, c) => Math.max(acc, c.levels), 1) * STOREY * 1.8;
  const wallHeight = () => clamp(tallest * rng.range(0.26, 0.5), 0.9, 2.6);

  /** One run of wall, described so it can be mirrored instead of re-rolled. */
  const planRun = (alongX: boolean): { centre: number; length: number; height: number }[] => {
    const span = (alongX ? site.plateW : site.plateD) / 2 - inset;
    const segments: { centre: number; length: number; height: number }[] = [];
    if (span <= 0.5) return segments;
    const openingAt = rng.range(-0.35, 0.35) * span; // one main entrance, off centre
    let cursor = -span;
    while (cursor < span - 0.8) {
      const remaining = span - cursor;
      const segment = Math.min(rng.range(2.2, 4.6), remaining);
      const centre = cursor + segment / 2;
      const isEntrance = Math.abs(centre - openingAt) < rng.range(0.8, 1.4);
      if (!isEntrance) segments.push({ centre, length: segment, height: wallHeight() });
      cursor += segment + (isEntrance ? rng.range(1.4, 2.6) : rng.range(0.5, 1.4));
    }
    return segments;
  };

  const place = (segments: readonly { centre: number; length: number; height: number }[], alongX: boolean, signX: number, signZ: number) => {
    const fixed = (alongX ? site.plateD : site.plateW) / 2 - inset;
    if (fixed <= 0) return;
    for (const segment of segments) {
      // Mirroring a run also mirrors where its segments sit along it.
      const x = alongX ? segment.centre * signX : signX * fixed;
      const z = alongX ? signZ * fixed : segment.centre * signZ;
      // The wall is enclosure, not shadow: it belongs to the mass family, and the openings
    // carry the dark note. A black slab around the site fights the composition it contains.
    builder.add('block', x, PLATE_H, z, alongX ? segment.length : thickness, segment.height, alongX ? thickness : segment.length, { priority: P_DETAIL });
    }
  };

  const runX = planRun(true);
  const runZ = planRun(false);
  const signs = mirrorSigns(mirror);

  // All sides or none. A wall that survives on one side but loses its reflection reads as
  // damage, not as an opening — and this is how a mirrored plan stopped mirroring.
  let needed = 0;
  for (let i = 0; i < signs.length; i++) needed += runX.length + runZ.length;
  if (!builder.fits(needed)) return;

  for (const [signX, signZ] of signs) {
    place(runX, true, signX, signZ);
    place(runZ, false, signX, signZ);
  }
}

function buildBridges(ctx: Ctx): void {
  const { params, builder, mirror } = ctx;
  const rng = new Rng(`${ctx.seed}|bridges`);
  const index = new Map(ctx.cells.map((c) => [cellKey(c.x, c.z), c]));

  for (const cell of canonicalCells(ctx)) {
    if (!builder.canAdd(3)) break;
    if (!rng.chance(0.1 + params.complexity * 0.3)) continue;

    // Only the +x / +z edge of a canonical cell, then reflected — so both halves of the plan
    // get the same bridges instead of two independently rolled patterns.
    const edges: readonly (readonly [number, number])[] = [
      [1, 0],
      [0, 1],
    ];

    for (const [dx, dz] of edges) {
      const other = index.get(cellKey(cell.x + dx, cell.z + dz));
      if (!other) continue;
      // A bridge lands below the shorter of the two towers, so it never looks glued on top.
      const deck = Math.min(towerTopEstimate(cell), towerTopEstimate(other)) - STOREY * rng.range(0.35, 0.9);
      if (deck <= cell.base + 0.6) continue;
      const alongX = dx !== 0;
      const centreX = (cell.x + cell.x + dx) * CELL * 0.5;
      const centreZ = (cell.z + cell.z + dz) * CELL * 0.5;
      let copies = 0;

      for (const [signX, signZ] of mirrorSigns(mirror)) {
        if (signX === -1 && Math.abs(centreX) < 1e-4) continue;
        if (signZ === -1 && Math.abs(centreZ) < 1e-4) continue;
        copies++;
      }
      // A bridge that lost its reflection would hang in mid air on one side of the plan.
      // Deck plus, above complexity, two rails and four posts — count them before placing them.
      const perCopy = params.complexity > 0.4 ? 7 : 1;
      if (!builder.fits(copies * perCopy)) return;
      for (const [signX, signZ] of mirrorSigns(mirror)) {
        if (signX === -1 && Math.abs(centreX) < 1e-4) continue;
        if (signZ === -1 && Math.abs(centreZ) < 1e-4) continue;
        const x = centreX * signX;
        const z = centreZ * signZ;
        const length = CELL * 1.02;
        const width = CELL * 0.5;
        builder.add('slab', x, deck, z, alongX ? length : width, 0.16, alongX ? width : length, { priority: P_DETAIL, tone: 'accent' });
        if (perCopy > 1) addRailings(ctx, x, deck + 0.16, z, alongX, length, width);
      }
      break;
    }
  }
}

/** Cheap height estimate used to place bridges without measuring every element. */
function towerTopEstimate(cell: Cell): number {
  const STOREYS = 1.55;
  return cell.base + cell.levels * STOREYS;
}

/**
 * The three gestures that read at a glance: an arch you can walk through, a stair that
 * connects the levels, and figures that give the whole thing a size.
 * Built into a scratch builder and emitted mirrored, like everything else in the plan.
 */
function buildLandmarks(ctx: Ctx): void {
  const { rng, params, cells, site } = ctx;
  if (cells.length === 0) return;

  /**
   * Landmarks are emitted one gesture at a time, in order of importance. A composition that
   * has run out of budget should lose its figures before it loses its arch.
   */
  const emit = (build: (scratchCtx: Ctx) => void): boolean => {
    const scratch = new Builder('mark', Number.MAX_SAFE_INTEGER);
    build({ ...ctx, builder: scratch });
    if (scratch.drafts.length === 0) return false;
    const needed = reflectionTotal(scratch.drafts, mirrorSigns(ctx.mirror));
    if (!ctx.builder.fits(needed)) return false;
    emitMirrored(ctx, scratch.drafts);
    return true;
  };

  /**
   * 1. An arch on the approach axis — the one curved gesture in the composition.
   * It costs nine elements and a rotation, so it is placed before the stairs and figures
   * and gets its own allowance rather than competing with them.
   */
  if (params.complexity > 0.3 && rng.chance(0.65 + params.complexity * 0.3)) {
    const span = CELL * rng.range(1.1, 1.5);
    const alongX = rng.chance(0.5);
    const x = alongX ? 0 : rng.range(-1, 1) * span * 0.2;
    const z = alongX ? rng.range(-1, 1) * span * 0.2 : 0;
    const saved = ctx.builder.reserve;
    // Mirror copies double an arch, so it may spend into the reserve — but only its own.
    ctx.builder.reserve = Math.max(0, saved - ARCH_COST);
    emit((scratchCtx) => addArch(scratchCtx, round(x), PLATE_H, round(z), span, span * 0.62, 0.42, alongX));
    ctx.builder.reserve = saved;
  }

  // 2. Stairs from the plate up onto the podium, on a face that is not occupied.
  if (ctx.podium) {
    const top = PLATE_H + ctx.podium.h;
    const alongX = rng.chance(0.5);
    const steps = Math.max(3, Math.round(ctx.podium.h / 0.16));
    emit((scratchCtx) => addStairs(scratchCtx, alongX ? 0 : site.plateW * 0.32, PLATE_H, alongX ? site.plateD * 0.32 : 0, 0.8, top - PLATE_H, steps, alongX, true));
  }

  // 3. Figures last and one at a time: they are the least expensive and the most plentiful,
  // so whatever budget survives the structural gestures goes here.

  // 3. Human figures: the cheapest way to make a fourteen unit tower read as architecture.
  // Placed one at a time so a tight budget still yields a few rather than dropping the gesture.
  ctx.builder.reserve = 0;
  const wanted = 2 + Math.round(params.density * 4);
  for (let i = 0; i < wanted; i++) {
    if (!emit((scratchCtx) => addScaleFigures(scratchCtx, 1, rng))) break;
  }
}

/** Total element count a set of drafts costs once mirrored. */
function reflectionTotal(drafts: readonly Draft[], signs: readonly (readonly [number, number])[]): number {
  let total = 0;
  for (const draft of drafts) total += reflectionCount(draft, signs);
  return total;
}

function buildGateways(ctx: Ctx): void {
  const { rng, params, builder } = ctx;
  if (builder.remaining <= 0) return;

  // Every composition needs at least a couple of frames — they give the mass a scale and a rhythm.
  const desired = 2 + Math.round(params.complexity * 3);
  const candidates: { x: number; z: number; alongX: boolean; size: number; height: number }[] = [];
  for (const cell of canonicalCells(ctx)) {
    const faces: readonly (readonly [number, number])[] = [
      [cell.x, cell.z + 1],
      [cell.x, cell.z - 1],
      [cell.x + 1, cell.z],
      [cell.x - 1, cell.z],
    ];
    // Faces that look outside the site are free too — that is where a symmetric plan opens up.
    const free = faces.filter(([fx, fz]) => !ctx.occupied.has(cellKey(fx, fz)) && Math.max(Math.abs(fx), Math.abs(fz)) <= ctx.radius + 1);
    if (free.length === 0) continue;
    const [fx, fz] = rng.pick(free);
    candidates.push({
      x: fx,
      z: fz,
      alongX: fx !== cell.x,
      size: CELL * rng.range(0.55, 0.72),
      height: rng.range(1.7, 2.4) * (0.7 + params.height * 0.6),
    });
  }

  // Shuffle, then take as many as the budget allows.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  let placed = 0;
  for (const spot of candidates.slice(0, desired)) {
    const size = spot.size;
    const width = spot.alongX ? 0.3 : size;
    const depth = spot.alongX ? size : 0.3;
    // Mirrored copies come from the same description, so the frame reads as part of the plan.
    const signs = mirrorSigns(ctx.mirror);
    if (!builder.fits(signs.length)) break;
    for (const [sx, sz] of signs) {
      builder.add('frame', spot.x * sx * CELL, PLATE_H, spot.z * sz * CELL, width, spot.height, depth, { priority: P_DETAIL, tone: 'accent' });
    }
    placed++;
  }
  void placed;

  // One long gate across the courtyard — the gesture that organises the whole plan.
  if (ctx.courtyard && rng.chance(0.8) && builder.canAdd(3)) {
    const horizontal = rng.chance(0.5);
    builder.add('frame', 0, PLATE_H, 0, horizontal ? CELL * 1.6 : 0.32, 2.2 + params.height * 2.4, horizontal ? 0.32 : CELL * 1.6, {
      priority: P_STRUCTURE,
      tone: 'accent',
    });
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function freeTowards(ctx: Ctx, cell: Cell, axis: 'x' | 'z', sign: number): boolean {
  for (let i = 1; i <= 2; i++) {
    const x = cell.x + (axis === 'x' ? sign * i : 0);
    const z = cell.z + (axis === 'z' ? sign * i : 0);
    if (ctx.occupied.has(cellKey(x, z))) return false;
  }
  return true;
}

/** The sign pairs a feature has to be mirrored into, given the plan symmetry. */
function mirrorSigns(mirror: Symmetry): readonly (readonly [number, number])[] {
  if (mirror.x && mirror.z) return [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ];
  if (mirror.x) return [
    [1, 1],
    [-1, 1],
  ];
  if (mirror.z) return [
    [1, 1],
    [1, -1],
  ];
  return [[1, 1]];
}