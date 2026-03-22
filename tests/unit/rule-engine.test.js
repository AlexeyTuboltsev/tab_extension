const { loadIIFE } = require('./helpers');

// Load MatchPattern first (RuleEngine depends on it as a global)
const MatchPattern = loadIIFE('shared/match-pattern.js', 'MatchPattern');
globalThis.MatchPattern = MatchPattern;

// Mock STORAGE_KEYS global (used in RuleEngine.refresh)
globalThis.STORAGE_KEYS = { SHARED_PROVIDERS: 'sharedProviders' };

// Mock ContainerManager global
globalThis.ContainerManager = {
  lookupSavedIdByCookieStore: jest.fn(),
  getTabInfo: jest.fn(),
};

// Mock StorageManager global
globalThis.StorageManager = {
  getGlobalRules: jest.fn().mockResolvedValue([]),
  getContainerRules: jest.fn().mockResolvedValue({}),
  getSavedContainers: jest.fn().mockResolvedValue({}),
};

// Mock browser.storage.local
globalThis.browser = {
  storage: { local: { get: jest.fn().mockResolvedValue({}) } },
};

const RuleEngine = loadIIFE('background/rule-engine.js', 'RuleEngine');

describe('RuleEngine.evaluate', () => {
  beforeEach(async () => {
    // Reset mocks to defaults
    StorageManager.getGlobalRules.mockResolvedValue([]);
    StorageManager.getContainerRules.mockResolvedValue({});
    StorageManager.getSavedContainers.mockResolvedValue({});
    browser.storage.local.get.mockResolvedValue({});
    ContainerManager.lookupSavedIdByCookieStore.mockReturnValue(null);
    ContainerManager.getTabInfo.mockReturnValue(null);

    await RuleEngine.refresh();
  });

  test('non-HTTP URLs are not routed', () => {
    expect(RuleEngine.evaluate('about:blank', null, 'firefox-default')).toEqual({ action: 'ALLOW' });
    expect(RuleEngine.evaluate('moz-extension://foo/bar', null, 'firefox-default')).toEqual({ action: 'ALLOW' });
    expect(RuleEngine.evaluate('ftp://example.com', null, 'firefox-default')).toEqual({ action: 'ALLOW' });
    expect(RuleEngine.evaluate(null, null, 'firefox-default')).toEqual({ action: 'ALLOW' });
    expect(RuleEngine.evaluate('', null, 'firefox-default')).toEqual({ action: 'ALLOW' });
  });

  test('default container with no rules returns NEW_EPHEMERAL', () => {
    const result = RuleEngine.evaluate('https://example.com/', null, 'firefox-default');
    expect(result).toEqual({ action: 'NEW_EPHEMERAL' });
  });

  test('URL matching a global rule returns ROUTE_TO with correct cookieStoreId', async () => {
    StorageManager.getGlobalRules.mockResolvedValue([
      { pattern: 'amazon.com', savedContainerId: 'saved-1' },
    ]);
    StorageManager.getSavedContainers.mockResolvedValue({
      'saved-1': { cookieStoreId: 'firefox-container-5' },
    });
    await RuleEngine.refresh();

    const result = RuleEngine.evaluate('https://www.amazon.com/dp/123', null, 'firefox-default');
    expect(result).toEqual({ action: 'ROUTE_TO', cookieStoreId: 'firefox-container-5' });
  });

  test('URL matching a bound rule on current container returns SHARE_CONTAINER', async () => {
    StorageManager.getContainerRules.mockResolvedValue({
      'saved-1': [{ pattern: 'shop.example.com' }],
    });
    StorageManager.getSavedContainers.mockResolvedValue({
      'saved-1': { cookieStoreId: 'firefox-container-3' },
    });
    ContainerManager.lookupSavedIdByCookieStore.mockReturnValue('saved-1');
    await RuleEngine.refresh();

    const result = RuleEngine.evaluate('https://shop.example.com/cart', null, 'firefox-container-3');
    expect(result).toEqual({ action: 'SHARE_CONTAINER', cookieStoreId: 'firefox-container-3' });
  });

  test('shared provider URL returns SHARE_CONTAINER when in a saved container', async () => {
    StorageManager.getSavedContainers.mockResolvedValue({
      'saved-1': { cookieStoreId: 'firefox-container-3' },
    });
    ContainerManager.lookupSavedIdByCookieStore.mockReturnValue('saved-1');
    // Use default shared providers (paypal.*, stripe.com, etc.)
    browser.storage.local.get.mockResolvedValue({});
    await RuleEngine.refresh();

    const result = RuleEngine.evaluate('https://www.paypal.com/checkout', null, 'firefox-container-3');
    expect(result).toEqual({ action: 'SHARE_CONTAINER', cookieStoreId: 'firefox-container-3' });
  });

  test('shared provider stripe.com returns SHARE_CONTAINER in saved container', async () => {
    StorageManager.getSavedContainers.mockResolvedValue({
      'saved-2': { cookieStoreId: 'firefox-container-7' },
    });
    ContainerManager.lookupSavedIdByCookieStore.mockReturnValue('saved-2');
    browser.storage.local.get.mockResolvedValue({});
    await RuleEngine.refresh();

    const result = RuleEngine.evaluate('https://checkout.stripe.com/pay/cs_test', null, 'firefox-container-7');
    expect(result).toEqual({ action: 'SHARE_CONTAINER', cookieStoreId: 'firefox-container-7' });
  });

  test('non-saved container with no matching rules returns NEW_EPHEMERAL', async () => {
    ContainerManager.lookupSavedIdByCookieStore.mockReturnValue(null);
    await RuleEngine.refresh();

    const result = RuleEngine.evaluate('https://example.com/', null, 'firefox-container-99');
    expect(result).toEqual({ action: 'NEW_EPHEMERAL' });
  });

  test('URL not matching any global rule returns NEW_EPHEMERAL', async () => {
    StorageManager.getGlobalRules.mockResolvedValue([
      { pattern: 'amazon.com', savedContainerId: 'saved-1' },
    ]);
    StorageManager.getSavedContainers.mockResolvedValue({
      'saved-1': { cookieStoreId: 'firefox-container-5' },
    });
    await RuleEngine.refresh();

    const result = RuleEngine.evaluate('https://google.com/', null, 'firefox-default');
    expect(result).toEqual({ action: 'NEW_EPHEMERAL' });
  });
});
