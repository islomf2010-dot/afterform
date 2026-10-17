import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const url = process.env.URL ?? 'http://127.0.0.1:5174/';
const outDir = resolve(process.cwd(), '.shots');
mkdirSync(outDir, { recursive: true });

const shots = [
  { name: 'day-brutalism', setup: async (page) => setLook(page, 'brutalism', 'day') },
  { name: 'dusk-brutalism', setup: async (page) => setLook(page, 'brutalism', 'dusk') },
  { name: 'night-monolith', setup: async (page) => setLook(page, 'monolith', 'night') },
  { name: 'dusk-glass', setup: async (page) => setLook(page, 'glass', 'dusk') },
];

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-lcd-text'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 }, deviceScaleFactor: 1 });

const messages = [];
page.on('console', (msg) => {
  if (msg.type() === 'error' || msg.type() === 'warning') messages.push(`[${msg.type()}] ${msg.text()}`);
});
page.on('pageerror', (err) => messages.push(`[pageerror] ${err.message}`));

await page.goto(url, { waitUntil: 'networkidle' });
// Dismiss the title sequence: these shots are of the studio, not the poster.
const gate = page.getByRole('button', { name: /enter studio/i });
if (await gate.isVisible({ timeout: 8000 }).catch(() => false)) {
  await gate.click();
  await page.locator('.topbar').waitFor({ state: 'visible', timeout: 15_000 });
}
await page.waitForTimeout(2500);

for (const shot of shots) {
  await shot.setup(page);
  await page.waitForTimeout(1400);
  await page.screenshot({ path: resolve(outDir, `${shot.name}.png`) });
  console.log('shot:', shot.name);
}

console.log('console messages:', messages.length);
for (const message of messages.slice(0, 20)) console.log('  ', message);

await browser.close();

async function setLook(page, material, lighting) {
  await page.getByRole('button', { name: material.toUpperCase() }).click();
  await page.getByRole('button', { name: lighting.toUpperCase() }).click();
}