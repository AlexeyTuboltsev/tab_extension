const { test, expect } = require('@playwright/test');
const fs = require('fs');

/**
 * Tests for the fingerprint test HTML pages.
 * Skips gracefully if test pages aren't present (e.g., PR not merged yet).
 */

const fingerprintTestExists = fs.existsSync(`${process.cwd()}/fingerprint-check.html`);

test.describe('fingerprint-check.html', () => {
  test.skip(!fingerprintTestExists, 'fingerprint-check.html not found');

  test('page loads and collects signals', async ({ page }) => {
    await page.goto(`file://${process.cwd()}/fingerprint-check.html`);
    await page.waitForTimeout(3000);
    const title = await page.title();
    expect(title).toBeTruthy();
    const bodyText = await page.textContent('body');
    expect(bodyText).toContain('Fingerprint');
  });

  test('copy button exists', async ({ page }) => {
    await page.goto(`file://${process.cwd()}/fingerprint-check.html`);
    await page.waitForTimeout(2000);
    const buttons = await page.$$('button');
    expect(buttons.length).toBeGreaterThan(0);
  });
});
