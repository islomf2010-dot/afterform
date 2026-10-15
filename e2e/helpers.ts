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