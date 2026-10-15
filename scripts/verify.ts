import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const url = process.env.URL ?? 'http://127.0.0.1:4174/';
const outDir = resolve(process.cwd(), '.shots');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });

// Count real GPU submissions: the loop must fall silent when nothing changes.
await page.addInitScript(() => {
  const stats = { draws: 0, frames: 0 };
  (window as unknown as { __gpu: typeof stats }).__gpu = stats;
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
      const requestFrame = gl.requestAnimationFrame ? gl.requestAnimationFrame.bind(gl) : null;
      if (requestFrame) gl.requestAnimationFrame = (cb: FrameRequestCallback) => requestFrame(() => { stats.frames++; cb(performance.now()); });
    }
    return context;
  } as typeof HTMLCanvasElement.prototype.getContext;
});

const problems = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') problems.push(`[error] ${msg.text()}`);
});
page.on('pageerror', (error) => problems.push(`[pageerror] ${error.message}`));

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('.canvas-region[data-scene-ready="true"] canvas', { timeout: 60_000 });
await page.waitForTimeout(1800);

const readGpu = () => page.evaluate(() => (window as unknown as { __gpu: { draws: number; frames: number } }).__gpu);

// Idle: nothing is animating, so the demand loop should not be drawing at all.
const idleStart = await readGpu();
await page.waitForTimeout(1500);
const idleEnd = await readGpu();

// A camera orbit must wake the renderer up.
const canvas = page.locator('canvas');
const box = (await canvas.boundingBox())!;
const activeStart = await readGpu();
await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.48, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(900);
const activeEnd = await readGpu();

// A slider change must wake the renderer up too.
const sliderStart = await readGpu();
await page.evaluate(() => {
  const input = document.querySelector<HTMLInputElement>('.panel--right input[type=range]');
  if (!input) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, '0.85');
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.waitForTimeout(1200);
const sliderEnd = await readGpu();

const renderInfo = await page.evaluate(() => {
  const element = document.querySelector('canvas');
  return { width: element?.width ?? 0, height: element?.height ?? 0 };
});

await page.screenshot({ path: resolve(outDir, 'production.png') });

// Mobile pass on the real build.
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(900);
await page.screenshot({ path: resolve(outDir, 'production-mobile.png') });

const idleDraws = idleEnd.draws - idleStart.draws;
const orbitDraws = activeEnd.draws - activeStart.draws;
const sliderDraws = sliderEnd.draws - sliderStart.draws;

console.log(`idle 1.5s      : ${idleDraws} draw calls, ${idleEnd.frames - idleStart.frames} frames`);
console.log(`camera orbit   : ${orbitDraws} draw calls, ${activeEnd.frames - activeStart.frames} frames`);
console.log(`slider change  : ${sliderDraws} draw calls, ${sliderEnd.frames - sliderStart.frames} frames`);
console.log('canvas buffer:', renderInfo);
console.log('console problems:', problems.length);
for (const problem of problems) console.log('  ', problem);

await browser.close();