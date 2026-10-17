import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const url = process.env.URL ?? 'http://127.0.0.1:4174/';
const outDir = resolve(process.cwd(), '.shots');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
const problems = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') problems.push(`[error] ${msg.text()}`);
});
page.on('pageerror', (error) => problems.push(`[pageerror] ${error.message}`));

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('.canvas-region[data-scene-ready="true"] canvas', { timeout: 60_000 });

// The title sequence is the first thing anyone sees: capture it cold.
await page.waitForSelector('.intro__enter', { timeout: 20_000 });
await page.waitForTimeout(1400);
await page.screenshot({ path: resolve(outDir, 'intro-title.png') });
console.log('shot: intro-title');

await page.getByRole('button', { name: /enter studio/i }).click();
await page.waitForTimeout(1800);
await page.screenshot({ path: resolve(outDir, 'production.png') });
console.log('shot: production');

await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(900);
await page.screenshot({ path: resolve(outDir, 'production-mobile.png') });
console.log('shot: production-mobile');

console.log('console problems:', problems.length);
for (const problem of problems) console.log('  ', problem);
await browser.close();