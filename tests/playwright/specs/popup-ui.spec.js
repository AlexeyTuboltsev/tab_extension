const { test, expect } = require('@playwright/test');
const path = require('path');

/**
 * Popup UI tests.
 * Tests the popup HTML/JS directly (without extension context)
 * by loading popup.html as a file and checking DOM structure.
 *
 * Note: browser.* API calls will fail, but we can test DOM structure
 * and verify the mock data renders correctly.
 */

test.describe('Popup UI structure', () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto(`file://${process.cwd()}/popup/popup.html`);
    await page.waitForTimeout(1000);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('popup loads without errors', async () => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.waitForTimeout(500);
    // Filter out expected errors from mock browser API
    const realErrors = errors.filter(e => !e.includes('browser') && !e.includes('runtime'));
    expect(realErrors).toEqual([]);
  });

  test('form view exists', async () => {
    const formView = await page.$('#form-view');
    expect(formView).not.toBeNull();
  });

  test('list view exists but is hidden', async () => {
    const listView = await page.$('#list-view');
    expect(listView).not.toBeNull();
    const isHidden = await listView.evaluate(el => el.classList.contains('hidden'));
    expect(isHidden).toBe(true);
  });

  test('collapsible sections exist', async () => {
    const savedToggle = await page.$('#toggle-saved');
    const tempToggle = await page.$('#toggle-temp');
    expect(savedToggle).not.toBeNull();
    expect(tempToggle).not.toBeNull();
  });

  test('provider input exists', async () => {
    const input = await page.$('#provider-input');
    const addBtn = await page.$('#btn-add-provider');
    expect(input).not.toBeNull();
    expect(addBtn).not.toBeNull();
  });

  test('back button exists', async () => {
    const backBtn = await page.$('#btn-back');
    expect(backBtn).not.toBeNull();
  });
});

test.describe('Options page structure', () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto(`file://${process.cwd()}/options/options.html`);
    await page.waitForTimeout(1000);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('options page loads', async () => {
    const title = await page.textContent('h1');
    expect(title).toContain('Container Tab Manager');
  });

  test('main view exists', async () => {
    const mainView = await page.$('#main-view');
    expect(mainView).not.toBeNull();
  });

  test('detail view exists but is hidden', async () => {
    const detailView = await page.$('#detail-view');
    expect(detailView).not.toBeNull();
    const isHidden = await detailView.evaluate(el => el.classList.contains('hidden'));
    expect(isHidden).toBe(true);
  });

  test('providers table exists', async () => {
    const table = await page.$('#providers-table');
    expect(table).not.toBeNull();
  });

  test('provider add form exists', async () => {
    const input = await page.$('#provider-pattern');
    const addBtn = await page.$('#add-provider');
    expect(input).not.toBeNull();
    expect(addBtn).not.toBeNull();
  });
});
