import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Renders a batch of compositions in the real renderer and writes them to .shots/audit/.
 * Used to judge massing and lighting the way a viewer would see them, not as wireframes.
 */
const url = process.env.URL ?? 'http://127.0.0.1:4174/';
const outDir = resolve(process.cwd(), '.shots/audit');
mkdirSync(outDir, { recursive: true });

/** Enters the studio if the title sequence is up. */
async function enterStudio(page: import('@playwright/test').Page): Promise<void> {
  const gate = page.getByRole('button', { name: /Enter Studio/i });
  if (await gate.isVisible().catch(() => false)) {
    await gate.click();
    await page.waitForTimeout(1000);
  }
}

const seeds = (process.argv[2] ?? 'CLOISTER,PLINTH,FORUM,ATRIUM,TERRACE,VESTIBULE').split(',');
const lighting = (process.argv[3] ?? 'DUSK').toUpperCase();
const material = (process.argv[4] ?? 'BRUTALISM').toUpperCase();

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const problems: string[] = [];
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(m.text());
});
page.on('pageerror', (e) => problems.push(e.message));

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('.canvas-region[data-scene-ready="true"] canvas', { timeout: 60_000 });
await enterStudio(page);
await page.getByRole('button', { name: material, exact: true }).click();
await page.getByRole('button', { name: lighting, exact: true }).click();
await page.waitForTimeout(1200);

const seedField = page.getByLabel('Random seed');
for (const seed of seeds) {
  await seedField.fill(seed);
  await seedField.press('Enter');
  await page.waitForTimeout(2200);
  const box = (await page.locator('canvas').boundingBox())!;
  await page.screenshot({
    path: resolve(outDir, `${seed}-${lighting.toLowerCase()}.png`),
    clip: { x: box.x + 30, y: box.y + 20, width: box.width - 60, height: box.height - 40 },
  });
  const count = await page.locator('.bottombar .readout').first().locator('.readout__value').innerText();
  console.log(`${seed.padEnd(12)} objects=${count}`);
}

console.log('console problems:', problems.length);
for (const problem of problems.slice(0, 6)) console.log('  ', problem);
await browser.close();