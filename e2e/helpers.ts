import { type Locator, type Page } from '@playwright/test';

/**
 * Waits until the renderer has drawn its first frame.
 * A WebGL canvas cannot be sampled from the page (no preserved drawing buffer), so the app
 * exposes the signal itself on the canvas wrapper.
 */
export async function waitForScene(page: Page): Promise<void> {
  await page.waitForSelector('.canvas-region[data-scene-ready="true"] canvas', { timeout: 45_000 });
  await page.waitForTimeout(500);
}

/** Clicks through the title sequence when it is on screen. */
export async function enterStudio(page: Page): Promise<void> {
  const gate = page.getByRole('button', { name: /enter studio/i });
  const visible = await gate
    .waitFor({ state: 'visible', timeout: 4000 })
    .then(() => true)
    .catch(() => false);
  if (!visible) return;
  await gate.click();
  // Wait for the chrome to mount rather than guessing at the cross-fade length.
  await page.locator('.topbar').waitFor({ state: 'visible', timeout: 10_000 });
}

/**
 * Waits until the studio is actually usable.
 * The title sequence gates the whole interface on a first visit, so tests enter it first
 * rather than assuming the chrome is already there.
 */
export async function openStudio(page: Page): Promise<void> {
  await waitForScene(page);
  await enterStudio(page);
}

/**
 * Counts real GPU submissions over a window of time.
 *
 * The render loop runs on demand, so draw calls — not animation frames — are the honest
 * measure of whether the scene is doing any work. Pair with {@link installDrawCounter}.
 */
export async function installDrawCounter(page: Page): Promise<void> {
  // Must run before the first navigation: the renderer acquires its WebGL context at mount,
  // so patching getContext afterwards would never observe a call.
  await page.addInitScript(() => {
    const stats = { draws: 0 };
    (window as unknown as { __gpu?: typeof stats }).__gpu = stats;
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
}

export async function countDrawsWhile(page: Page, ms: number): Promise<number> {
  await page.evaluate(() => {
    const gpu = (window as unknown as { __gpu?: { draws: number } }).__gpu;
    if (gpu) gpu.draws = 0;
  });
  await page.waitForTimeout(ms);
  return page.evaluate(() => (window as unknown as { __gpu?: { draws: number } }).__gpu?.draws ?? -1);
}

/**
 * Whether two screenshots differ in pixels rather than in encoding.
 *
 * Comparing PNG buffers byte-for-byte is not an image comparison: the same pixels re-encoded
 * differ in size and in almost every byte. Both buffers are decoded in the page and compared
 * per pixel, and the differing fraction is returned so a test can allow a small tolerance.
 */
export async function changedPixelFraction(page: Page, a: Buffer, b: Buffer): Promise<number> {
  return page.evaluate(
    async ([first, second]) => {
      const decode = async (bytes: number[]) => {
        const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(bitmap, 0, 0);
        return { data: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data, width: bitmap.width, height: bitmap.height };
      };

      const one = await decode(first);
      const two = await decode(second);
      if (one.width !== two.width || one.height !== two.height) return 1;

      let changed = 0;
      for (let i = 0; i < one.data.length; i += 4) {
        if (
          one.data[i] !== two.data[i] ||
          one.data[i + 1] !== two.data[i + 1] ||
          one.data[i + 2] !== two.data[i + 2] ||
          one.data[i + 3] !== two.data[i + 3]
        ) {
          changed++;
        }
      }
      return changed / (one.data.length / 4);
    },
    [[...a], [...b]],
  );
}

/**
 * Waits until the render loop has gone quiet — no frames being submitted.
 * Saves every later test from racing the entrance stagger on a slow machine.
 */
export async function waitForQuietScene(page: Page, timeout = 20_000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if ((await countDrawsWhile(page, 400)) < 10) return;
  }
  throw new Error('the scene never stopped rendering');
}

/** Zeroes the draw counter without waiting. */
export async function resetDrawCount(page: Page): Promise<void> {
  await page.evaluate(() => {
    const gpu = (window as unknown as { __gpu?: { draws: number } }).__gpu;
    if (gpu) gpu.draws = 0;
  });
}

/** Reads the draw counter as it stands. */
export async function readDrawCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __gpu?: { draws: number } }).__gpu?.draws ?? -1);
}

export function objectCount(page: Page): Locator {
  return page.locator('.bottombar .readout').first().locator('.readout__value');
}

export async function readObjectCount(page: Page): Promise<number> {
  const text = await objectCount(page).innerText();
  return Number(text.replace(/\D/g, ''));
}

export async function generateAndSettle(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Generate' }).click();
  await page.waitForTimeout(1400);
}

/** Clicks somewhere in the middle of the composition, where the masses are. */
export async function clickScene(page: Page, x = 0.5, y = 0.52): Promise<void> {
  const canvas = page.locator('canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
  await page.waitForTimeout(200);
}

/** Waits out the camera glide that follows a rebuild. */
export async function settleCamera(page: Page): Promise<void> {
  await page.waitForTimeout(1200);
}

/**
 * Clicks a few points of the composition until an element is picked.
 * Picking depends on what the camera happens to frame, so the test aims, not guesses.
 */
export async function selectSomething(page: Page): Promise<string> {
  const spots = [
    [0.5, 0.52],
    [0.46, 0.6],
    [0.55, 0.45],
    [0.5, 0.65],
    [0.42, 0.5],
  ];
  for (const [x, y] of spots) {
    await clickScene(page, x, y);
    const label = await page.locator('.bottombar .readout').nth(3).innerText();
    if (!label.includes('—')) return label;
  }
  return '';
}

export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}