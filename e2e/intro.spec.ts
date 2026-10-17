import { expect, test } from '@playwright/test';
import { changedPixelFraction, collectConsoleErrors, waitForScene } from './helpers';

test.describe('title sequence', () => {
  test('opens on AFTERFORM and enters the studio on Enter', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/');
    await waitForScene(page);

    const gate = page.getByRole('button', { name: /enter studio/i });
    await expect(gate).toBeVisible({ timeout: 15_000 });

    await expect(page.locator('.intro__title')).toHaveText('AFTERFORM');
    await expect(page.locator('.intro__tagline')).toHaveText('Architecture beyond reality.');
    // The studio chrome is withheld until the title is dismissed.
    await expect(page.locator('.topbar')).toHaveCount(0);

    await page.keyboard.press('Enter');
    await expect(page.locator('.topbar')).toBeVisible({ timeout: 10_000 });
    await expect(gate).toHaveCount(0);
    expect(errors, errors.join('\n')).toHaveLength(0);
  });

  test('is skipped by a click anywhere on the title', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
    await expect(page.getByRole('button', { name: /enter studio/i })).toBeVisible({ timeout: 15_000 });

    // Well clear of the button: the whole overlay is the target.
    await page.mouse.click(180, 420);
    await expect(page.locator('.topbar')).toBeVisible({ timeout: 10_000 });
  });

  test('skips instantly on Escape', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
    await expect(page.getByRole('button', { name: /enter studio/i })).toBeVisible({ timeout: 15_000 });

    await page.keyboard.press('Escape');
    await expect(page.locator('.topbar')).toBeVisible({ timeout: 10_000 });
  });

  test('does not return within the same session', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
    const gate = page.getByRole('button', { name: /enter studio/i });
    await gate.waitFor({ state: 'visible', timeout: 15_000 });
    // Enter rather than click: the overlay covers the page, and a click during the
    // cross-fade can land on the canvas underneath.
    await page.keyboard.press('Enter');
    await expect(page.locator('.topbar')).toBeVisible({ timeout: 10_000 });

    // A reload keeps the session, so the studio opens straight away.
    await page.reload();
    await waitForScene(page);
    await expect(page.locator('.topbar')).toBeVisible({ timeout: 10_000 });
    await expect(gate).toHaveCount(0);
  });

  test('studio keys do nothing while the title is up', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
    await expect(page.getByRole('button', { name: /enter studio/i })).toBeVisible({ timeout: 15_000 });

    const before = await page.locator('.canvas-region').isVisible();
    expect(before).toBe(true);
    // The title swallows the shortcut instead of firing a generate behind it.
    await page.keyboard.press('g');
    await page.waitForTimeout(400);
    await expect(page.getByRole('button', { name: /enter studio/i })).toBeVisible();
  });

  test('holds the composition still while the title is up', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
    await expect(page.getByRole('button', { name: /enter studio/i })).toBeVisible({ timeout: 15_000 });
    // Let the title animation and the entrance stagger finish before sampling.
    await page.waitForTimeout(2500);

    // Two stills must show the same pixels: the title is a poster, not a demo reel.
    const first = await page.locator('canvas').screenshot();
    await page.waitForTimeout(1200);
    const second = await page.locator('canvas').screenshot();
    expect(await changedPixelFraction(page, first, second), 'the scene must not move behind the title').toBeLessThan(0.001);
  });

  test('has no motion under prefers-reduced-motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await waitForScene(page);
    await expect(page.getByRole('button', { name: /enter studio/i })).toBeVisible({ timeout: 15_000 });

    const durations = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll<HTMLElement>('.intro, .intro__title, .intro__enter')];
      return nodes.map((node) => getComputedStyle(node).animationDuration);
    });
    for (const duration of durations) expect(Number.parseFloat(duration)).toBeLessThan(0.01);
  });
});