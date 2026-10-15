import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const url = process.env.URL ?? 'http://127.0.0.1:4174/';
const outDir = resolve(process.cwd(), '.shots');
mkdirSync(outDir, { recursive: true });

const shots = [
  { name: 'look-day', material: 'BRUTALISM', lighting: 'DAY' },
  { name: 'look-dusk', material: 'BRUTALISM', lighting: 'DUSK' },
  { name: 'look-night', material: 'MONOLITH', lighting: 'NIGHT' },
  { name: 'look-glass', material: 'GLASS', lighting: 'DUSK' },
  { name: 'look-glass-day', material: 'GLASS', lighting: 'DAY' },
  { name: 'look-monolith-dusk', material: 'MONOLITH', lighting: 'DUSK' },
];

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
const problems: string[] = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') problems.push(msg.text());
});
page.on('pageerror', (error) => problems.push(error.message));

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('.canvas-region[data-scene-ready="true"] canvas', { timeout: 60_000 });
await page.waitForTimeout(1500);

for (const shot of shots) {
  await page.getByRole('button', { name: shot.material, exact: true }).click();
  await page.getByRole('button', { name: shot.lighting, exact: true }).click();
  await page.waitForTimeout(1500);
  const canvas = page.locator('canvas');
  const box = (await canvas.boundingBox())!;
  // Crop to the composition only: the UI is reviewed separately.
  await page.screenshot({
    path: resolve(outDir, `${shot.name}.png`),
    clip: { x: box.x + 40, y: box.y + 20, width: box.width - 80, height: box.height - 40 },
  });
  console.log('shot:', shot.name);
}

// Lite mode on a phone-sized viewport.
await page.getByRole('button', { name: /Lite/i }).click();
await page.getByRole('button', { name: 'BRUTALISM', exact: true }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: resolve(outDir, 'look-lite.png') });

console.log('console problems:', problems.length);
for (const problem of problems.slice(0, 10)) console.log('  ', problem);
await browser.close();