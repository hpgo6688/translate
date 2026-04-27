import { test, expect, chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'node:path';

test('loads unpacked extension and opens fixture page', async () => {
  const extensionPath = path.resolve(process.cwd(), '.output/chrome-mv3');
  test.skip(
    !existsSync(extensionPath),
    'Run "pnpm build" first to generate .output/chrome-mv3',
  );

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
    await expect(page.locator('h1')).toHaveText('Fixture Article');

    const background = context.serviceWorkers();
    expect(background.length).toBeGreaterThan(0);
  } finally {
    await context.close();
  }
});
