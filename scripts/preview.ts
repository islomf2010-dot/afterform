/**
 * Offline composition previewer.
 *
 *   npm run preview:svg            -> writes .shots/composition.svg for the default params
 *   npm run preview:svg -- 7ABC 1  -> seed, and 12 sampled compositions
 *
 * Renders generated compositions with a painter's algorithm axonometric projection so the
 * massing can be judged without booting the browser.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateComposition, computeBounds, CELL, defaultParams } from '../src/lib/generator';
import type { ArchObject, Vec3 } from '../src/types/scene';

const base = defaultParams();
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, '../.shots');

const AZIMUTH = (48 * Math.PI) / 180;
const ELEVATION = (28 * Math.PI) / 180;

interface Face {
  points: [number, number][];
  shade: number;
  depth: number;
}

function project(p: Vec3): { x: number; y: number; depth: number } {
  const rx = p[0] * Math.cos(AZIMUTH) + p[2] * Math.sin(AZIMUTH);
  const rz = -p[0] * Math.sin(AZIMUTH) + p[2] * Math.cos(AZIMUTH);
  return {
    x: rx,
    y: rz * Math.sin(ELEVATION) - p[1] * Math.cos(ELEVATION),
    depth: rz * Math.cos(ELEVATION) + p[1] * Math.sin(ELEVATION),
  };
}

function boxFaces(o: ArchObject): Face[] {
  const [cx, cy, cz] = o.position;
  const hx = o.size[0] / 2;
  const hy = o.size[1] / 2;
  const hz = o.size[2] / 2;
  const corner = (sx: number, sy: number, sz: number): Vec3 => [cx + sx * hx, cy + sy * hy, cz + sz * hz];

  const faces: Face[] = [
    // top
    { pts: [corner(-1, 1, -1), corner(1, 1, -1), corner(1, 1, 1), corner(-1, 1, 1)], shade: 1.0 },
    // front (+Z)
    { pts: [corner(-1, -1, 1), corner(1, -1, 1), corner(1, 1, 1), corner(-1, 1, 1)], shade: 0.78 },
    // right (+X)
    { pts: [corner(1, -1, -1), corner(1, -1, 1), corner(1, 1, 1), corner(1, 1, -1)], shade: 0.58 },
  ];

  const projected = faces.map((f) => {
    const pts = f.pts.map(project);
    return {
      points: pts.map((p) => [p.x, p.y] as [number, number]),
      shade: f.shade,
      depth: pts.reduce((acc, p) => acc + p.depth, 0) / pts.length,
    };
  });

  // A frame is an outline, so punch the hole out of the silhouette.
  if (o.kind === 'frame') return frameFaces(o);

  return projected;
}

function frameFaces(o: ArchObject): Face[] {
  const [cx, cy, cz] = o.position;
  const hx = o.size[0] / 2;
  const hy = o.size[1] / 2;
  const hz = o.size[2] / 2;
  const t = Math.min(hx, hz) * 0.62;
  const parts: ArchObject[] = [
    { id: 'a', kind: 'block', position: [cx - hx + t / 2, cy, cz], size: [t, o.size[1], o.size[2]] },
    { id: 'b', kind: 'block', position: [cx + hx - t / 2, cy, cz], size: [t, o.size[1], o.size[2]] },
    { id: 'c', kind: 'block', position: [cx, cy + hy - t / 2, cz], size: [o.size[0], t, o.size[2]] },
  ];
  return parts.flatMap(boxFaces);
}

function renderToSvg(objects: readonly ArchObject[], width = 1400, height = 1000): string {
  const faces = objects.flatMap(boxFaces).sort((a, b) => a.depth - b.depth);
  const bounds = computeBounds(objects);

  // Ground grid for scale reference.
  const gridLines: string[] = [];
  const span = Math.max(bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2]) + CELL * 2;
  for (let g = -Math.ceil(span / CELL); g <= Math.ceil(span / CELL); g++) {
    const a = project([g * CELL, 0, -Math.ceil(span / CELL) * CELL]);
    const b = project([g * CELL, 0, Math.ceil(span / CELL) * CELL]);
    gridLines.push(`<line x1="${a.x.toFixed(2)}" y1="${a.y.toFixed(2)}" x2="${b.x.toFixed(2)}" y2="${b.y.toFixed(2)}" stroke="#c9c6c0" stroke-width="1" vector-effect="non-scaling-stroke"/>`);
    const c = project([-Math.ceil(span / CELL) * CELL, 0, g * CELL]);
    const d = project([Math.ceil(span / CELL) * CELL, 0, g * CELL]);
    gridLines.push(`<line x1="${c.x.toFixed(2)}" y1="${c.y.toFixed(2)}" x2="${d.x.toFixed(2)}" y2="${d.y.toFixed(2)}" stroke="#c9c6c0" stroke-width="1" vector-effect="non-scaling-stroke"/>`);
  }

  const polys = faces
    .map((f) => {
      const d = f.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' ') + ' Z';
      const tone = Math.round(226 * f.shade);
      return `<path d="${d}" fill="rgb(${tone},${tone},${tone})" stroke="#141414" stroke-width="0.6" stroke-opacity="0.55" vector-effect="non-scaling-stroke"/>`;
    })
    .join('\n');

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const f of faces) {
    for (const [x, y] of f.points) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  const scale = Math.min(width / (maxX - minX + 8), height / (maxY - minY + 8));
  const tx = width / 2 - ((minX + maxX) / 2) * scale;
  const ty = height / 2 - ((minY + maxY) / 2) * scale;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#f2f0ec"/>
  <g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(4)}) translate(${-((minX + maxX) / 2).toFixed(3)} ${-((minY + maxY) / 2).toFixed(3)})">
    ${gridLines.join('\n')}
    ${polys}
  </g>
</svg>`;
}

function contactSheet(svgs: { label: string; svg: string }[]): string {
  const cols = 3;
  const cellW = 560;
  const cellH = 420;
  const rows = Math.ceil(svgs.length / cols);
  const body = svgs
    .map((entry, i) => {
      const x = (i % cols) * cellW;
      const y = Math.floor(i / cols) * cellH;
      return `<g transform="translate(${x} ${y})">
  <svg width="${cellW - 8}" height="${cellH - 34}" viewBox="0 0 ${cellW - 8} ${cellH - 34}" preserveAspectRatio="xMidYMid meet">${entry.svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</svg>
  <text x="10" y="${cellH - 10}" font-family="ui-monospace, monospace" font-size="12" fill="#111">${entry.label}</text>
</g>`;
    })
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * cellW}" height="${rows * cellH}"><rect width="100%" height="100%" fill="#dcdad5"/>${body}</svg>`;
}

const args = process.argv.slice(2);
const mode = args[0] ?? 'single';

mkdirSync(OUT_DIR, { recursive: true });

if (mode === 'sweep') {
  // Every corner of the parameter space, three seeds each: catches degenerate output.
  const corners: { label: string; p: Partial<typeof defaultParams> }[] = [];
  for (const height of [0, 0.5, 1]) {
    for (const density of [0, 0.5, 1]) {
      corners.push({ label: `h${height} d${density} s0.5 c0.45`, p: { height, density, symmetry: 0.5, complexity: 0.45 } });
    }
  }
  for (const symmetry of [0, 0.5, 1]) {
    for (const complexity of [0, 0.5, 1]) {
      corners.push({ label: `h0.5 d0.5 s${symmetry} c${complexity}`, p: { height: 0.5, density: 0.5, symmetry, complexity } });
    }
  }

  const entries: { label: string; svg: string }[] = [];
  let worst = 0;
  for (const corner of corners) {
    for (const seed of ['AAA', 'K7X2', 'ZZ9Q']) {
      const composition = generateComposition({ ...base, ...corner.p, seed });
      const b = computeBounds(composition.objects);
      const kinds = [...new Set(composition.objects.map((o) => o.kind))].sort().join(',');
      const stats = `n=${String(composition.objects.length).padStart(3)} h=${(b.max[1] - b.min[1]).toFixed(1)} w=${(b.max[0] - b.min[0]).toFixed(1)} d=${(b.max[2] - b.min[2]).toFixed(1)}`;
      worst = Math.max(worst, composition.objects.length);
      if (composition.objects.length < 6) console.log(`  !! thin composition: ${corner.label} ${seed} -> ${stats}`);
      if (!kinds.includes('frame')) console.log(`  -- no frames: ${corner.label} ${seed} [${kinds}]`);
      if (mode === 'sweep' && corner.p.height === 0.5 && corner.p.density === 0.5 && corner.p.symmetry === 0.5 && corner.p.complexity === 0.45) {
        entries.push({ label: `${corner.label} ${seed}  ${stats}`, svg: renderToSvg(composition.objects, cellW(), cellH()) });
      }
    }
  }
  const file = resolve(OUT_DIR, 'sweep.svg');
  writeFileSync(file, contactSheet(entries));
  console.log(`swept ${corners.length * 3} compositions, max objects = ${worst}`);
  console.log(file);
} else if (mode === 'contact') {
  const count = Number(args[1] ?? 9);
  const entries = Array.from({ length: count }, (_, i) => {
    const seed = `${args[2] ?? 'SEED'}-${i}`;
    const composition = generateComposition({
      height: 0.2 + ((i * 0.19) % 0.8),
      density: 0.28 + ((i * 0.31) % 0.62),
      symmetry: [0, 0.5, 1][i % 3],
      complexity: 0.25 + ((i * 0.43) % 0.65),
      seed,
    });
    const b = computeBounds(composition.objects);
    console.log(
      `${composition.name.padEnd(16)} objects=${String(composition.objects.length).padStart(3)}  ` +
        `w=${(b.max[0] - b.min[0]).toFixed(1)} h=${(b.max[1] - b.min[1]).toFixed(1)} d=${(b.max[2] - b.min[2]).toFixed(1)}  ` +
        `kinds=${[...new Set(composition.objects.map((o) => o.kind))].join(',')}`,
    );
    return {
      label: `${composition.name} n=${composition.objects.length} h=${(b.max[1] - b.min[1]).toFixed(1)}`,
      svg: renderToSvg(composition.objects, cellW(), cellH()),
    };
  });
  const file = resolve(OUT_DIR, 'contact-sheet.svg');
  writeFileSync(file, contactSheet(entries));
  console.log(file);
} else {
  const composition = generateComposition({ ...base, seed: args[0] ?? base.seed });
  const svg = renderToSvg(composition.objects);
  const file = resolve(OUT_DIR, 'composition.svg');
  writeFileSync(file, svg);
  const b = computeBounds(composition.objects);
  console.log(
    `${composition.name}  objects=${composition.objects.length}  ` +
      `size=${(b.max[0] - b.min[0]).toFixed(1)}x${(b.max[1] - b.min[1]).toFixed(1)}x${(b.max[2] - b.min[2]).toFixed(1)}`,
  );
  console.log(file);
}

function cellW(): number {
  return 520;
}
function cellH(): number {
  return 400;
}