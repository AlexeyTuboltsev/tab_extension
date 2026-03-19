const RuleEngine = (() => {
  let globalRules = [];
  let containerRules = {};
  let savedContainers = {};
  let sharedProviders = [];
  async function refresh() {
    globalRules = await StorageManager.getGlobalRules();
    containerRules = await StorageManager.getContainerRules();
    savedContainers = await StorageManager.getSavedContainers();
    const data = await browser.storage.local.get(STORAGE_KEYS.SHARED_PROVIDERS);
    sharedProviders = data[STORAGE_KEYS.SHARED_PROVIDERS] || [
      'paypal.*', 'stripe.com', 'klarna.com', 'adyen.com',
      'accounts.google.com', 'appleid.apple.com', 'login.microsoftonline.com',
    ];
  }
  function matchesSharedProvider(url) {
    for (const pattern of sharedProviders) { if (MatchPattern.matches(url, pattern)) return true; }
    return false;
  }
  function evaluate(url, openerTabId, currentCookieStoreId) {
    if (!url || (!url.startsWith('http:') && !url.startsWith('https:'))) return { action: 'ALLOW' };
    if (currentCookieStoreId && currentCookieStoreId !== 'firefox-default') {
      const currentSavedId = ContainerManager.lookupSavedIdByCookieStore(currentCookieStoreId, savedContainers);
      if (currentSavedId) {
        if (containerRules[currentSavedId]) {
          for (const rule of containerRules[currentSavedId]) {
            if (MatchPattern.matches(url, rule.pattern)) return { action: 'SHARE_CONTAINER', cookieStoreId: currentCookieStoreId };
          }
        }
        if (matchesSharedProvider(url)) return { action: 'SHARE_CONTAINER', cookieStoreId: currentCookieStoreId };
      }
    }
    if (openerTabId != null) {
      const openerInfo = ContainerManager.getTabInfo(openerTabId);
      if (openerInfo && openerInfo.cookieStoreId !== currentCookieStoreId) {
        const openerSavedId = ContainerManager.lookupSavedIdByCookieStore(openerInfo.cookieStoreId, savedContainers);
        if (openerSavedId) {
          if (containerRules[openerSavedId]) {
            for (const rule of containerRules[openerSavedId]) {
              if (MatchPattern.matches(url, rule.pattern)) return { action: 'SHARE_CONTAINER', cookieStoreId: openerInfo.cookieStoreId };
            }
          }
          if (matchesSharedProvider(url)) return { action: 'SHARE_CONTAINER', cookieStoreId: openerInfo.cookieStoreId };
        }
      }
    }
    for (const rule of globalRules) {
      if (MatchPattern.matches(url, rule.pattern)) {
        const saved = savedContainers[rule.savedContainerId];
        if (saved) return { action: 'ROUTE_TO', cookieStoreId: saved.cookieStoreId };
      }
    }
    return { action: 'NEW_EPHEMERAL' };
  }
  function isSharedProvider(url) {
    return matchesSharedProvider(url);
  }
  return { refresh, evaluate, isSharedProvider };
})();
