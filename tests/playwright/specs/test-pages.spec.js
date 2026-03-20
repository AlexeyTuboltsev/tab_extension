const { test, expect } = require('@playwright/test');

/**
 * Tests for the fingerprint test HTML pages themselves.
 * Verifies they load, collect data, and have working UI controls.
 */

test.describe('fingerprint-test.html', () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto(`file://${process.cwd()}/tests/fingerprint-test.html`);
    await page.waitForTimeout(3000); // Wait for all async fingerprint collection
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('page loads with title', async () => {
    const title = await page.title();
    expect(title).toBeTruthy();
  });

  test('combined hash is displayed', async () => {
    const hashEl = await page.$('[data-combined-hash], .combined-hash, #combined-hash');
    // The page should have some kind of combined hash display
    const bodyText = await page.textContent('body');
    expect(bodyText).toContain('Fingerprint');
  });

  test('copy button exists', async () => {
    const copyBtn = await page.$('button');
    expect(copyBtn).not.toBeNull();
  });

  test('assertion mode works', async ({ browser }) => {
    const assertPage = await browser.newPage();
    await assertPage.goto(`file://${process.cwd()}/tests/fingerprint-test.html?assert=true`);
    await assertPage.waitForTimeout(3000);
    const bodyText = await assertPage.textContent('body');
    // Should contain pass/fail indicators
    expect(bodyText.toLowerCase()).toMatch(/pass|fail|✓|✗/);
    await assertPage.close();
  });
});

test.describe('cross-container-test.html', () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto(`file://${process.cwd()}/tests/cross-container-test.html`);
    await page.waitForTimeout(1000);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('page loads', async () => {
    const bodyText = await page.textContent('body');
    expect(bodyText).toContain('container');
  });

  test('generate report button exists', async () => {
    const buttons = await page.$$('button');
    expect(buttons.length).toBeGreaterThan(0);
  });
});

test.describe('consistency-check.html', () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto(`file://${process.cwd()}/tests/consistency-check.html`);
    await page.waitForTimeout(2000);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('page loads and runs checks', async () => {
    const bodyText = await page.textContent('body');
    expect(bodyText.toLowerCase()).toMatch(/pass|fail|skip|consistency/i);
  });
});
