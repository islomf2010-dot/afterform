import { Rng, seedToLabel } from './rng';
import type { ArchObject, Bounds, Composition, GeneratorParams, ObjectKind, Vec3 } from '@/types/scene';

/** Horizontal module of the site grid. Every dimension snaps to fractions of this. */
export const CELL = 2;
/** Vertical module — one storey. */
export const STOREY = 1.15;
/** Height of the ground plate the whole study stands on. */
export const PLATE_H = 0.12;

const P_MASS = 3;
const P_STRUCTURE = 2;
const P_DETAIL = 1;

const SIZE_LIMITS = { w: [0.18, 14] as const, h: [0.12, 40] as const, d: [0.18, 14] as const };

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
  };

  buildSite(ctx);
  // The enclosure, the bridges and the frames are what make a plan read as architecture, so
  // they get first claim on the budget. Reserving up front also keeps mirroring intact: a
  // truncated wall would leave one side of the plan without an enclosure.
  builder.reserve = 20;
  buildTowers(ctx, maxLevels);
  builder.reserve = 8;
  buildPerimeter(ctx);
  builder.reserve = 6;
  buildBridges(ctx);
  builder.reserve = 0;
  buildGateways(ctx);

  return {
    name: `${rng.pick(COMPOSITION_WORDS)} ${seedToLabel(params.seed)}`,
    seed: params.seed,
    params: { ...params },
    objects: builder.objects(),
  };
}

/**
 * Only the canonical quadrant is built; the rest of the plan is a true reflection of it.
 * Mirroring the finished elements — rather than re-rolling the same seed per cell — is what
 * makes the Symmetry parameter honest: every offset, cantilever and opening lines up.
 *
 * Towers are emitted whole or not at all: a mass with half of its levels missing is a bug,
 * and half a mirrored mass is a lie about the symmetry.
 */
function buildTowers(ctx: Ctx, maxLevels: number): void {
  const { builder } = ctx;
  const signs = mirrorSigns(ctx.mirror);

  for (const cell of canonicalCells(ctx)) {
    const scratch = new Builder('mass', Number.MAX_SAFE_INTEGER);
    buildTower({ ...ctx, builder: scratch }, cell, maxLevels);

    let needed = 0;
    for (const draft of scratch.drafts) needed += reflectionCount(draft, signs);
    if (!builder.fits(needed)) break;

    for (const draft of scratch.drafts) {
      for (const [signX, signZ] of signs) {
        if (!builder.addMirrored(draft, signX, signZ) && signX === 1 && signZ === 1) break;
      }
    }
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
}

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

  add(kind: ObjectKind, x: number, base: number, z: number, w: number, h: number, d: number, priority: number = P_STRUCTURE): boolean {
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
    });
    return true;
  }

  /** Copies an existing element through the plan's mirror planes. */
  addMirrored(draft: Draft, signX: number, signZ: number): boolean {
    if (signX === 1 && signZ === 1) return this.add(draft.kind, draft.x, draft.base, draft.z, draft.w, draft.h, draft.d, draft.priority);
    // An element sitting exactly on a mirror plane is its own reflection.
    if (signX === -1 && Math.abs(draft.x) < 1e-4) return false;
    if (signZ === -1 && Math.abs(draft.z) < 1e-4) return false;
    return this.add(draft.kind, draft.x * signX, draft.base, draft.z * signZ, draft.w, draft.h, draft.d, draft.priority);
  }

  /** Final elements with stable, sequential ids. */
  objects(): ArchObject[] {
    return this.drafts.map((draft, index) => ({
      id: `${this.tag}-${String(index).padStart(3, '0')}`,
      kind: draft.kind,
      position: [round(draft.x), round(draft.base + draft.h / 2), round(draft.z)],
      size: [round(draft.w), round(draft.h), round(draft.d)],
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
  builder.add('slab', 0, 0, 0, plateW, PLATE_H, plateD, P_MASS);

  // A raised podium gives the plan a centre and a second hierarchy level.
  if (params.complexity > 0.22) {
    const w = CELL * (1.4 + params.density * 1.1);
    const d = CELL * (1.4 + params.complexity * 0.9);
    const h = 0.18 + params.height * 0.4;
    if (builder.add('slab', 0, PLATE_H, 0, w, h, d, P_MASS)) {
      for (const cell of cells) {
        if (Math.abs(cell.x) * CELL + CELL * 0.48 <= w / 2 && Math.abs(cell.z) * CELL + CELL * 0.48 <= d / 2) {
          cell.base = PLATE_H + h;
        }
      }
    }
  }

  // Courtyard: a sunken court at the centre of the plan reads as a void, not a hole.
  if (ctx.courtyard && builder.canAdd(4)) {
    builder.add('slab', 0, PLATE_H, 0, CELL * 1.05, 0.05, CELL * 1.05, P_DETAIL);
    void rng;
  }
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
      massingTower(ctx, cell, levels, rng);
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

  if (cell.isCore && params.complexity > 0.4) addMast(ctx, cell, rng);
  else if (params.complexity > 0.55 && cell.ring === 1 && rng.chance(0.3)) addCrown(ctx, cell, rng);
}

function massingTower(ctx: Ctx, cell: Cell, levels: number, rng: Rng): void {
  const { params, builder } = ctx;
  const wx = cell.x * CELL;
  const wz = cell.z * CELL;
  let y = cell.base;

  // Proportion drives the character of the mass. Slender volumes only work on short towers —
  // a needle on a tall stack reads as a spire, which is a different building altogether.
  const slender = levels <= 4;
  const proportion = slender
    ? rng.weighted<number>([
        [0.5, 1.1],
        [0.76, 2.4],
        [0.96, 1.4],
      ])
    : rng.weighted<number>([
        [0.64, 1.6],
        [0.82, 2.2],
        [1.0, 1.2],
      ]);
  let w = CELL * proportion * rng.range(0.92, 1.08);
  let d = CELL * rng.range(0.62, 1.06) * (proportion > 0.7 ? 1 : rng.range(0.8, 1.15));

  for (let level = 0; level < levels; level++) {
    if (builder.remaining <= 0) return;
    const top = level === levels - 1;
    // Set back every other level so the profile steps instead of extruding.
    if (level > 0 && rng.chance(0.4 + params.complexity * 0.35)) {
      const shrink = CELL * rng.range(0.12, 0.24);
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
      builder.add('block', wx + ox - (w - half) / 2, y, wz + oz, half, h, d, P_MASS);
      builder.add('block', wx + ox + (w - half) / 2, y, wz + oz, half, h, d, P_MASS);
    } else {
      builder.add('block', wx + ox, y, wz + oz, w, h, d, P_MASS);
    }
    y += h;

    // Belt slabs: the horizontal lines that make a stack read as floors, not as a lump.
    if (builder.canAdd(4) && !top && level > 0 && level % 2 === 0 && params.complexity > 0.35) {
      builder.add('slab', wx + ox, y - 0.02, wz + oz, w + 0.34, 0.1, d + 0.34, P_DETAIL);
    }
  }

  // Roof plate: the horizontal line that closes the silhouette.
  if (builder.canAdd(4) && levels > 1) builder.add('slab', wx, y, wz, w + 0.3, 0.12, d + 0.3, P_DETAIL);
}

function pavilion(ctx: Ctx, cell: Cell, rng: Rng): void {
  const { params, builder } = ctx;
  const wx = cell.x * CELL;
  const wz = cell.z * CELL;
  const w = CELL * rng.range(0.8, 0.94);
  const d = CELL * rng.range(0.8, 0.94);
  const base = cell.base;
  const plinth = 0.18 + params.complexity * 0.12;
  builder.add('slab', wx, base, wz, w, plinth, d, P_MASS);

  const clear = STOREY * rng.range(1.5, 2.1);
  const post = 0.34 + params.complexity * 0.12;
  const insetX = (w - post) / 2;
  const insetZ = (d - post) / 2;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) builder.add('column', wx + sx * insetX, base + plinth, wz + sz * insetZ, post, clear, post, P_STRUCTURE);
  }
  // The pavilion always has one wall to stand against.
  builder.add('block', wx, base + plinth, wz + (rng.chance(0.5) ? -1 : 1) * (d / 2 - 0.16), w * 0.99, clear, 0.32, P_MASS);
  builder.add('slab', wx, base + plinth + clear, wz, w + 0.24, 0.18, d + 0.24, P_STRUCTURE);
}

function cantileverTower(ctx: Ctx, cell: Cell, levels: number, rng: Rng): void {
  const { params, builder } = ctx;
  const wx = cell.x * CELL;
  const wz = cell.z * CELL;
  const axis: 'x' | 'z' = rng.chance(0.5) ? 'x' : 'z';
  const sign = rng.chance(0.5) ? 1 : -1;
  const coreW = 0.6 + params.complexity * 0.3;
  const totalH = levels * STOREY * rng.range(1.25, 1.6);
  const coreX = axis === 'x' ? wx - sign * (CELL * 0.26 - coreW / 2) : wx + rng.jitter(0.1);
  const coreZ = axis === 'z' ? wz - sign * (CELL * 0.26 - coreW / 2) : wz + rng.jitter(0.1);

  builder.add('column', coreX, cell.base, coreZ, coreW, totalH, coreW, P_MASS);

  let y = cell.base;
  for (let level = 0; level < levels; level++) {
    if (builder.remaining <= 0) return;
    const h = STOREY * rng.range(0.45, 0.68);
    const reach = freeTowards(ctx, cell, axis, sign) ? rng.range(0.7, 0.95) : rng.range(0.38, 0.56);
    const w = axis === 'x' ? coreW + CELL * reach : CELL * rng.range(0.58, 0.82);
    const d = axis === 'x' ? CELL * rng.range(0.58, 0.82) : coreW + CELL * reach;
    const x = axis === 'x' ? coreX + (sign * (w - coreW)) / 2 : wx + rng.jitter(0.05);
    const z = axis === 'z' ? coreZ + (sign * (d - coreW)) / 2 : wz + rng.jitter(0.05);

    builder.add('slab', x, y, z, w, h, d, P_MASS);
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
    builder.add('block', wx, y, wz, w, h, d, P_MASS);
    y += h;
    const step = CELL * rng.range(0.18, 0.32) * (0.6 + params.complexity * 0.7);
    w = Math.max(CELL * 0.34, w - step);
    d = Math.max(CELL * 0.34, d - step);
    if (w < CELL * 0.42) break;
  }

  if (w > CELL * 0.34 && builder.canAdd(4)) builder.add('slab', wx, y, wz, w + 0.28, 0.12, d + 0.28, P_DETAIL);
}

function topOf(builder: Builder, wx: number, wz: number, radius: number): number {
  let top = 0;
  for (const draft of builder.drafts) {
    if (Math.abs(draft.x - wx) > radius || Math.abs(draft.z - wz) > radius) continue;
    top = Math.max(top, draft.base + draft.h);
  }
  return top;
}

function addMast(ctx: Ctx, cell: Cell, rng: Rng): void {
  const { params, builder } = ctx;
  if (!builder.canAdd(3)) return;
  const wx = cell.x * CELL;
  const wz = cell.z * CELL;
  const top = topOf(builder, wx, wz, CELL * 0.95);
  if (top <= 0) return;
  // A short, solid mast — an antenna that reads as a technical gesture, not a spike.
  builder.add('column', wx + rng.jitter(0.14), top, wz + rng.jitter(0.14), 0.2, rng.range(0.7, 1.5) + params.height * 1.1, 0.2, P_DETAIL);
}

function addCrown(ctx: Ctx, cell: Cell, rng: Rng): void {
  const { builder } = ctx;
  if (!builder.canAdd(4)) return;
  const wx = cell.x * CELL;
  const wz = cell.z * CELL;
  const top = topOf(builder, wx, wz, CELL * 0.9);
  if (top <= 0) return;
  if (rng.chance(0.5)) {
    builder.add('slab', wx, top, wz, CELL * rng.range(0.8, 1.0), 0.12, CELL * rng.range(0.8, 1.0), P_DETAIL);
  } else {
    // Parapet frame on the roof — a piece of open air you can see through.
    builder.add('frame', wx, top, wz, CELL * rng.range(0.46, 0.66), rng.range(0.8, 1.4), 0.24, P_DETAIL);
  }
}

/* ------------------------------------------------------------------ */
/* Structures that tie the plan together                               */
/* ------------------------------------------------------------------ */

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
    // Whole runs only: a wall that stops halfway through its reflection reads as damage.
    if (!builder.fits(segments.length)) return;
    for (const segment of segments) {
      // Mirroring a run also mirrors where its segments sit along it.
      const x = alongX ? segment.centre * signX : signX * fixed;
      const z = alongX ? signZ * fixed : segment.centre * signZ;
      builder.add('block', x, PLATE_H, z, alongX ? segment.length : thickness, segment.height, alongX ? thickness : segment.length, P_DETAIL);
    }
  };

  const runX = planRun(true);
  const runZ = planRun(false);
  // Both runs are placed through the same sign pairs, so the enclosure mirrors exactly.
  for (const [signX, signZ] of mirrorSigns(mirror)) {
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
      if (!builder.fits(copies)) return;
      for (const [signX, signZ] of mirrorSigns(mirror)) {
        if (signX === -1 && Math.abs(centreX) < 1e-4) continue;
        if (signZ === -1 && Math.abs(centreZ) < 1e-4) continue;
        builder.add(
          'slab',
          centreX * signX,
          deck,
          centreZ * signZ,
          alongX ? CELL * 1.02 : CELL * 0.5,
          0.16,
          alongX ? CELL * 0.5 : CELL * 1.02,
          P_DETAIL,
        );
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
    if (!builder.canAdd(3)) break;
    const size = spot.size;
    const width = spot.alongX ? 0.3 : size;
    const depth = spot.alongX ? size : 0.3;
    // Mirrored copies come from the same description, so the frame reads as part of the plan.
    for (const [sx, sz] of mirrorSigns(ctx.mirror)) {
      if (!builder.canAdd(1)) return;
      builder.add('frame', spot.x * sx * CELL, PLATE_H, spot.z * sz * CELL, width, spot.height, depth, P_DETAIL);
    }
    placed++;
  }
  void placed;

  // One long gate across the courtyard — the gesture that organises the whole plan.
  if (ctx.courtyard && rng.chance(0.8) && builder.canAdd(3)) {
    const horizontal = rng.chance(0.5);
    builder.add(
      'frame',
      0,
      PLATE_H,
      0,
      horizontal ? CELL * 1.6 : 0.32,
      2.2 + params.height * 2.4,
      horizontal ? 0.32 : CELL * 1.6,
      P_STRUCTURE,
    );
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