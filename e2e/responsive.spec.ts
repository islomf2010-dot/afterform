import { expect, test } from '@playwright/test';
import { collectConsoleErrors, openStudio, readObjectCount, waitForScene } from './helpers';

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'phone landscape', width: 844, height: 390 },
  { name: 'tablet', width: 834, height: 1112 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'desktop', width: 1920, height: 1080 },
];

test.describe('responsive shell', () => {
  test.beforeEach(async ({ page }) => {
    // The title is part of the layout: the phone sheet must not appear behind it.
    await page.addInitScript(() => {
      try {
        sessionStorage.setItem('afterform.intro.seen', '1');
      } catch {
        /* ignore */
      }
    });
  });

  for (const viewport of VIEWPORTS) {
    test(`fits without overflow at ${viewport.name}`, async ({ page }) => {
      const errors = collectConsoleErrors(page);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/');
      await waitForScene(page);

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight,
      }));

      expect(overflow.scrollWidth, `horizontal overflow at ${viewport.name}`).toBeLessThanOrEqual(overflow.clientWidth + 1);
      expect(overflow.scrollHeight, `vertical overflow at ${viewport.name}`).toBeLessThanOrEqual(overflow.clientHeight + 1);

      // The chrome must stay inside the viewport on every size.
      const chrome = await page.evaluate(() => {
        const bar = document.querySelector('.topbar')!.getBoundingClientRect();
        const bottom = document.querySelector('.bottombar')!.getBoundingClientRect();
        const canvas = document.querySelector('canvas')!.getBoundingClientRect();
        return { barBottom: bar.bottom, bottomTop: bottom.top, canvasWidth: canvas.width, canvasHeight: canvas.height };
      });
      expect(chrome.barBottom).toBeLessThanOrEqual(viewport.height);
      expect(chrome.bottomTop).toBeGreaterThan(0);
      expect(chrome.canvasWidth).toBeGreaterThan(100);
      expect(chrome.canvasHeight).toBeGreaterThan(100);

      // Nothing inside the panels may be clipped: they scroll internally instead.
      const clipped = await page.evaluate(() => {
        const offenders: string[] = [];
        for (const panel of document.querySelectorAll<HTMLElement>('.panel')) {
          if (panel.hidden) continue;
          if (panel.scrollWidth > panel.clientWidth + 1) offenders.push(`panel ${panel.scrollWidth}>${panel.clientWidth}`);
          for (const child of panel.querySelectorAll<HTMLElement>('*')) {
            const box = child.getBoundingClientRect();
            if (box.width === 0) continue;
            if (box.right > window.innerWidth + 1 || box.left < -1) {
              offenders.push(`${child.className || child.tagName} ${Math.round(box.left)}..${Math.round(box.right)}`);
              break;
            }
          }
        }
        const bar = document.querySelector<HTMLElement>('.topbar')!;
        if (bar.scrollWidth > bar.clientWidth + 1) offenders.push(`topbar ${bar.scrollWidth}>${bar.clientWidth}`);
        return offenders;
      });
      expect(clipped, clipped.join(' | ')).toHaveLength(0);

      // Every main action must stay reachable at this size.
      for (const name of ['Generate', 'Reset', 'Export PNG', 'Save JSON', 'Load JSON']) {
        await expect(page.getByRole('button', { name: new RegExp(name, 'i') })).toBeVisible();
      }

      expect(errors, errors.join('\n')).toHaveLength(0);
    });
  }

  test('keeps the scene usable on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await openStudio(page);

    // Panels become a single sheet; the toggles in the top bar control them.
    const tools = page.locator('.panel--left');
    await expect(tools).toBeVisible();
    await page.getByRole('button', { name: 'Toggle construction tools' }).click();
    await expect(tools).toBeHidden();

    await page.getByRole('button', { name: 'Toggle inspector' }).click();
    await expect(tools).toBeHidden();

    await page.getByRole('button', { name: 'Toggle construction tools' }).click();
    await expect(tools).toBeVisible();

    const before = await readObjectCount(page);
    await page.getByRole('button', { name: 'Add slab' }).click();
    await page.waitForTimeout(250);
    expect(await readObjectCount(page)).toBe(before + 1);
  });

  test('respects reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await openStudio(page);

    const errors = collectConsoleErrors(page);
    const start = Date.now();
    await page.getByRole('button', { name: 'Generate' }).click();
    // Nothing should be animating for long: the camera snaps instead of gliding.
    await page.waitForTimeout(500);
    expect(Date.now() - start).toBeLessThan(15_000);
    expect(await readObjectCount(page)).toBeGreaterThan(4);

    const transitions = await page.evaluate(() => {
      const style = getComputedStyle(document.querySelector('.btn')!);
      return { duration: style.transitionDuration, animation: style.animationDuration };
    });
    expect(Number.parseFloat(transitions.duration)).toBeLessThan(0.01);
    expect(errors, errors.join('\n')).toHaveLength(0);
  });

  test('reports a WebGL fallback instead of a blank screen', async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      // Simulate a machine with no usable GPU.
      HTMLCanvasElement.prototype.getContext = function patched(this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
        return original.call(this, type as never, ...(rest as never[]));
      } as typeof HTMLCanvasElement.prototype.getContext;
    });

    await page.goto('/');
    await expect(page.locator('.fallback__title')).toBeVisible();
    await expect(page.locator('.fallback__card')).toContainText(/WebGL/i);
    // The rest of the studio still works.
    await expect(page.locator('.brand__name')).toHaveText('AFTERFORM');
  });
});