import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Performance probe for the production build.
 *
 * Counts real GPU submissions rather than requestAnimationFrame ticks: the render loop runs on
 * demand, so the only honest measure of "is it idle" is how many draw calls are issued.
 */
const url = process.env.URL ?? 'http://127.0.0.1:4174/';
const outDir = resolve(process.cwd(), '.shots');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });

await page.addInitScript(() => {
  const stats = { draws: 0 };
  (window as unknown as { __gpu: typeof stats }).__gpu = stats;
  try {
    sessionStorage.setItem('afterform.intro.seen', '1');
  } catch {
    /* ignore */
  }
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function patched(this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
    const context = original.call(this, type as never, ...(rest as never[]));
    if ((type === 'webgl' || type === 'webgl2') && context) {
      const gl = context as WebGL2RenderingContext;
      const drawElements = gl.drawElements.bind(gl);
      const drawArrays = gl.drawArrays.bind(gl);
      gl.drawElements = (...args: Parameters<WebGL2RenderingContext['drawElements']>) => {
        stats.draws++;
        return drawElements(...args);
      };
      gl.drawArrays = (...args: Parameters<WebGL2RenderingContext['drawArrays']>) => {
        stats.draws++;
        return drawArrays(...args);
      };
    }
    return context;
  } as typeof HTMLCanvasElement.prototype.getContext;
});

const problems: string[] = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') problems.push(`[error] ${msg.text()}`);
});
page.on('pageerror', (error) => problems.push(`[pageerror] ${error.message}`));

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('.canvas-region[data-scene-ready="true"] canvas', { timeout: 60_000 });
await page.waitForTimeout(2000);

const readDraws = () => page.evaluate(() => (window as unknown as { __gpu: { draws: number } }).__gpu.draws);

const idleStart = await readDraws();
await page.waitForTimeout(1500);
const idleDraws = (await readDraws()) - idleStart;

const box = (await page.locator('canvas').boundingBox())!;
const orbitStart = await readDraws();
await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.48, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(900);
const orbitDraws = (await readDraws()) - orbitStart;

const generateStart = await readDraws();
await page.getByRole('button', { name: 'Generate' }).click();
await page.waitForTimeout(1800);
const generateDraws = (await readDraws()) - generateStart;

console.log(`idle 1.5s        : ${idleDraws} draw calls`);
console.log(`camera orbit     : ${orbitDraws} draw calls`);
console.log(`generate rebuild : ${generateDraws} draw calls`);
console.log('console problems:', problems.length);
for (const problem of problems) console.log('  ', problem);

await browser.close();