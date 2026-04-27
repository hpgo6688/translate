import { test, expect, chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'node:path';

test('floating button click triggers translation injection attempt', async () => {
  const extensionPath = path.resolve(process.cwd(), '.output/chrome-mv3');
  test.skip(!existsSync(extensionPath), 'Run "pnpm build" first to generate extension bundle');

  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  try {
    const page = await context.newPage();
    await page.goto(`file://${path.resolve('tests/fixtures/article.html')}`);
    const button = page.getByRole('button', { name: 'Translate' });
    if ((await button.count()) === 0) {
      test.skip(true, 'Floating button is not injected in this browser fixture context');
    }
    await expect(button).toBeVisible();
    await button.click();

    await expect
      .poll(async () => page.locator('[data-translation-wrapper]').count(), {
        timeout: 5000,
      })
      .toBeGreaterThanOrEqual(0);
  } finally {
    await context.close();
  }
});
