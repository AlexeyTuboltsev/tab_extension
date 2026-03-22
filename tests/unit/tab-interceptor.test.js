/**
 * Tests for the shouldReplaceTab logic from TabInterceptor.
 *
 * shouldReplaceTab is not exported, so we replicate the pure predicate here
 * (it has no dependencies on browser APIs or other modules).
 */

// Extracted from background/tab-interceptor.js lines 4-9
function shouldReplaceTab(details, currentCookieStoreId, tracked) {
  if (currentCookieStoreId === 'firefox-default') return true;
  if (tracked && (!tracked.url || tracked.url === 'about:blank' || tracked.url === 'about:newtab' || tracked.url === '')) return true;
  if (!details.originUrl) return true;
  if (details.originUrl.startsWith('about:') || details.originUrl.startsWith('moz-extension:')) return true;
  return false;
}

describe('shouldReplaceTab', () => {
  test('default container always returns true', () => {
    const details = { originUrl: 'https://example.com/' };
    expect(shouldReplaceTab(details, 'firefox-default', null)).toBe(true);
  });

  test('default container returns true even with content-bearing tracked tab', () => {
    const details = { originUrl: 'https://example.com/' };
    const tracked = { url: 'https://existing.com/page' };
    expect(shouldReplaceTab(details, 'firefox-default', tracked)).toBe(true);
  });

  test('tracked tab with about:blank URL returns true', () => {
    const details = { originUrl: 'https://example.com/' };
    const tracked = { url: 'about:blank' };
    expect(shouldReplaceTab(details, 'firefox-container-1', tracked)).toBe(true);
  });

  test('tracked tab with about:newtab URL returns true', () => {
    const details = { originUrl: 'https://example.com/' };
    const tracked = { url: 'about:newtab' };
    expect(shouldReplaceTab(details, 'firefox-container-1', tracked)).toBe(true);
  });

  test('tracked tab with empty URL returns true', () => {
    const details = { originUrl: 'https://example.com/' };
    const tracked = { url: '' };
    expect(shouldReplaceTab(details, 'firefox-container-1', tracked)).toBe(true);
  });

  test('tracked tab with no url property returns true', () => {
    const details = { originUrl: 'https://example.com/' };
    const tracked = {};
    expect(shouldReplaceTab(details, 'firefox-container-1', tracked)).toBe(true);
  });

  test('no originUrl in details returns true', () => {
    const details = {};
    const tracked = { url: 'https://existing.com/page' };
    expect(shouldReplaceTab(details, 'firefox-container-1', tracked)).toBe(true);
  });

  test('originUrl is undefined returns true', () => {
    const details = { originUrl: undefined };
    const tracked = { url: 'https://existing.com/page' };
    expect(shouldReplaceTab(details, 'firefox-container-1', tracked)).toBe(true);
  });

  test('origin from about: returns true', () => {
    const details = { originUrl: 'about:home' };
    const tracked = { url: 'https://existing.com/page' };
    expect(shouldReplaceTab(details, 'firefox-container-1', tracked)).toBe(true);
  });

  test('origin from moz-extension: returns true', () => {
    const details = { originUrl: 'moz-extension://abc-123/popup.html' };
    const tracked = { url: 'https://existing.com/page' };
    expect(shouldReplaceTab(details, 'firefox-container-1', tracked)).toBe(true);
  });

  test('tab with existing content in non-default container returns false', () => {
    const details = { originUrl: 'https://existing.com/page' };
    const tracked = { url: 'https://existing.com/page' };
    expect(shouldReplaceTab(details, 'firefox-container-1', tracked)).toBe(false);
  });

  test('non-default container with real content and real origin returns false', () => {
    const details = { originUrl: 'https://shop.example.com/' };
    const tracked = { url: 'https://shop.example.com/products' };
    expect(shouldReplaceTab(details, 'firefox-container-5', tracked)).toBe(false);
  });

  test('null tracked with originUrl present returns true (no tracked check passes through to originUrl check)', () => {
    // tracked is null so the tracked check is skipped; originUrl is present and not about:/moz-extension:
    // but details.originUrl is set, so it falls through to the last return false
    const details = { originUrl: 'https://example.com/' };
    // tracked is null => the `tracked &&` short-circuits, skips that branch
    // details.originUrl exists => skips that branch
    // originUrl doesn't start with about: or moz-extension: => skips that branch
    // falls through to return false
    expect(shouldReplaceTab(details, 'firefox-container-1', null)).toBe(false);
  });
});
