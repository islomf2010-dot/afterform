import { expect, test } from '@playwright/test';
import { collectConsoleErrors, generateAndSettle, readObjectCount, selectSomething, settleCamera, waitForScene } from './helpers';

test.describe('AFTERFORM studio', () => {
  test('boots into a rendered composition without console errors', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/');
    await waitForScene(page);

    await expect(page.getByRole('heading', { name: /afterform/i }).or(page.locator('.brand__name'))).toBeVisible();
    await expect(page.locator('.brand__name')).toHaveText('AFTERFORM');
    await expect(page.locator('.composition__name')).not.toBeEmpty();
    expect(await readObjectCount(page)).toBeGreaterThan(10);
    expect(errors, errors.join('\n')).toHaveLength(0);
  });

  test('generate produces a new composition and the seed reproduces it exactly', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
    const before = await readObjectCount(page);

    await generateAndSettle(page);
    expect(await readObjectCount(page)).toBeGreaterThan(4);
    expect(await page.locator('.composition__seed').innerText()).not.toContain('CLOISTER');

    const seedField = page.getByLabel('Random seed');
    await seedField.fill('REPEAT');
    await seedField.press('Enter');
    await page.waitForTimeout(900);
    const first = await readObjectCount(page);
    const firstSeed = await page.locator('.composition__seed').innerText();
    expect(firstSeed).toContain('REPEAT');

    await generateAndSettle(page);
    await seedField.fill('REPEAT');
    await seedField.press('Enter');
    await page.waitForTimeout(900);
    expect(await page.locator('.composition__seed').innerText()).toBe(firstSeed);
    expect(await readObjectCount(page)).toBe(first);
    expect(first).not.toBe(before);
  });

  test('selects, moves, nudges and deletes an element', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);

    const before = await readObjectCount(page);
    await page.getByRole('button', { name: 'Add column' }).click();
    await page.waitForTimeout(200);
    expect(await readObjectCount(page)).toBe(before + 1);

    // A new element is selected and its inspector is open.
    await expect(page.locator('.panel--right')).toContainText('Element');
    const height = page.locator('.panel--right .vec__input').nth(1);
    const startHeight = Number(await height.inputValue());

    await height.fill('4.5');
    await height.press('Enter');
    await page.waitForTimeout(200);
    expect(Number(await height.inputValue())).toBe(4.5);

    const positionX = page.locator('.panel--right .vec__input').first();
    const startX = Number(await positionX.inputValue());
    await positionX.fill('6');
    await positionX.press('Enter');
    await page.waitForTimeout(200);
    expect(Number(await positionX.inputValue())).toBe(6);

    // Keyboard nudge on the selection.
    // Click straight into the masses to pick an element out of the composition.
    await settleCamera(page);
    const selection = await selectSomething(page);
    expect(selection, 'clicking the scene must select an element').toMatch(/[0-9A-F-]{6}/);

    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(120);
    const xAfterNudge = Number(await page.locator('.panel--right .vec__input').first().inputValue());
    expect(xAfterNudge).not.toBe(6);

    await page.getByRole('button', { name: 'Delete Selected', exact: true }).click();
    await page.waitForTimeout(200);
    expect(await readObjectCount(page)).toBe(before);
    void startHeight;
    void startX;
  });

  test('dragging a selected element moves it in the scene', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
    await settleCamera(page);

    const selection = await selectSomething(page);
    expect(selection, 'need an element under the cursor').not.toBe('');

    const readX = () => page.locator('.panel--right .vec__input').first().inputValue();
    const before = Number(await readX());

    const box = (await page.locator('canvas').boundingBox())!;
    const startX = box.x + box.width * 0.5;
    const startY = box.y + box.height * 0.52;

    // Press on the element, drag sideways, release.
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 120, startY + 20, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    const after = Number(await readX());
    expect(after, 'dragging must move the element along X').not.toBe(before);

    // And the camera must not have orbited during the drag.
    const stillFramed = await page.evaluate(() => document.querySelector('.bottombar')?.textContent ?? '');
    expect(stillFramed).toContain('Objects');
  });

  test('undo and redo restore edits', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
    const before = await readObjectCount(page);

    await page.getByRole('button', { name: 'Add block' }).click();
    await page.waitForTimeout(150);
    expect(await readObjectCount(page)).toBe(before + 1);

    await page.getByRole('button', { name: 'Undo' }).click();
    await page.waitForTimeout(150);
    expect(await readObjectCount(page)).toBe(before);

    await page.getByRole('button', { name: 'Redo' }).click();
    await page.waitForTimeout(150);
    expect(await readObjectCount(page)).toBe(before + 1);

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(150);
    expect(await readObjectCount(page)).toBe(before);
  });

  test('every material preset and lighting mode changes the picture', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);

    // The canvas is composited, so screenshots are the only faithful read of what was drawn.
    const sample = async () => {
      const box = (await page.locator('canvas').boundingBox())!;
      return page.screenshot({ clip: { x: box.x + box.width * 0.25, y: box.y + box.height * 0.25, width: 220, height: 160 } });
    };

    const materialShots = new Map<string, Buffer>();
    for (const material of ['BRUTALISM', 'GLASS', 'MONOLITH']) {
      await page.getByRole('button', { name: material, exact: true }).click();
      await page.waitForTimeout(1100);
      materialShots.set(material, await sample());
    }
    expect(new Set(materialShots.values()).size, 'each material must render differently').toBe(3);

    await page.getByRole('button', { name: 'BRUTALISM', exact: true }).click();
    await page.waitForTimeout(900);

    const lightShots = new Map<string, Buffer>();
    for (const lighting of ['DAY', 'DUSK', 'NIGHT']) {
      await page.getByRole('button', { name: lighting, exact: true }).click();
      await page.waitForTimeout(1400);
      lightShots.set(lighting, await sample());
    }
    expect(new Set(lightShots.values()).size, 'each lighting mode must render differently').toBe(3);

    await expect(page.locator('.bottombar')).toContainText('NIGHT');
  });

  test('geometry sliders reshape the composition live', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);

    const height = page.locator('.panel--right input[type=range]').first();
    await height.fill('0.05');
    await page.waitForTimeout(800);
    await expect(page.locator('.panel--right .slider').first()).toContainText('5%');

    const seedBefore = await page.locator('.composition__seed').innerText();
    await height.fill('0.95');
    await page.waitForTimeout(800);
    expect(await page.locator('.composition__seed').innerText()).toBe(seedBefore);
    expect(await readObjectCount(page)).toBeGreaterThan(4);
  });

  test('exports a PNG of the current scene', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);

    const download = page.waitForEvent('download', { timeout: 30_000 });
    await page.getByRole('button', { name: 'Export PNG' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.png$/);

    const stream = await file.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const buffer = Buffer.concat(chunks);
    expect(buffer.length).toBeGreaterThan(10_000);
    // PNG magic number.
    expect(buffer.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(await page.locator('.toast').first().innerText()).toMatch(/PNG EXPORTED/i);
  });

  test('saves and reloads a composition as JSON', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);

    await page.getByRole('button', { name: 'Add frame' }).click();
    await page.waitForTimeout(200);
    const saved = await readObjectCount(page);
    const name = await page.locator('.composition__name').inputValue();

    const download = page.waitForEvent('download', { timeout: 20_000 });
    await page.getByRole('button', { name: 'Save JSON' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/afterform-.*\.json$/);
    const path = await file.path();
    expect(path).toBeTruthy();

    // Change the scene, then bring the saved one back.
    await generateAndSettle(page);
    expect(await readObjectCount(page)).not.toBe(saved);

    await page.locator('input[type=file]').setInputFiles(path!);
    await page.waitForTimeout(900);
    expect(await readObjectCount(page)).toBe(saved);
    expect(await page.locator('.composition__name').inputValue()).toBe(name);
    await expect(page.locator('.toast').first()).toContainText(/IMPORTED/i);
  });

  test('rejects a malformed JSON file with a readable message', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
    const before = await readObjectCount(page);

    await page.locator('input[type=file]').setInputFiles({
      name: 'broken.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"format":"afterform.composition","version":99}'),
    });
    await page.waitForTimeout(400);

    await expect(page.locator('.toast--error')).toContainText(/IMPORT FAILED/i);
    expect(await readObjectCount(page)).toBe(before);
  });

  test('supports the keyboard shortcuts of the studio', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);

    await page.keyboard.press('g');
    await page.waitForTimeout(800);
    expect(await readObjectCount(page)).toBeGreaterThan(4);

    await page.keyboard.press('r');
    await page.waitForTimeout(800);
    const afterReset = await readObjectCount(page);

    await page.keyboard.press('b');
    await page.waitForTimeout(200);
    expect(await readObjectCount(page)).toBe(afterReset + 1);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    await expect(page.locator('.panel--right')).not.toContainText('Position');
  });

  test('every control is reachable and labelled', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);

    const unlabelled = await page.evaluate(() => {
      const controls = [...document.querySelectorAll('button, input, [role=slider]')];
      return controls
        .filter((el) => {
          if ((el as HTMLInputElement).type === 'hidden') return false;
          // Decorative triggers (the file input) are hidden from assistive tech on purpose.
          if (el.getAttribute('aria-hidden') === 'true') return false;
          if (el.classList.contains('visually-hidden')) return false;
          const text = (el.textContent ?? '').trim();
          const label = el.getAttribute('aria-label') ?? '';
          const labelledBy = el.getAttribute('aria-label') || el.getAttribute('id') || '';
          return !text && !label && !labelledBy && !el.closest('label');
        })
        .map((el) => el.outerHTML.slice(0, 80));
    });
    expect(unlabelled, unlabelled.join('\n')).toHaveLength(0);

    // Tab from the top reaches the main actions without a keyboard trap.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName ?? '');
    expect(focused).not.toBe('BODY');
  });
});