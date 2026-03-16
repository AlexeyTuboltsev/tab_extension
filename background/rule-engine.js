const RuleEngine = (() => {
  // Cached rules — refreshed from storage on changes
  let globalRules = [];
  let containerRules = {};
  let savedContainers = {};

  async function refresh() {
    globalRules = await StorageManager.getGlobalRules();
    containerRules = await StorageManager.getContainerRules();
    savedContainers = await StorageManager.getSavedContainers();
  }

  /**
   * Evaluate rules for a new tab navigation.
   *
   * @param {string} url - The destination URL
   * @param {number|undefined} openerTabId - The tab that opened this one
   * @returns {{ action: string, cookieStoreId?: string }}
   *   action: 'SHARE_CONTAINER' | 'ROUTE_TO' | 'NEW_EPHEMERAL' | 'ALLOW'
   */
  function evaluate(url, openerTabId, currentCookieStoreId) {
    // Skip non-http URLs
    if (!url || (!url.startsWith('http:') && !url.startsWith('https:'))) {
      return { action: 'ALLOW' };
    }

    // 1. Container-bound rules: check if the URL should stay in the
    //    current tab's container OR the opener's container.
    //    This handles both in-page navigation (eBay tab navigates to PayPal)
    //    and new-tab spawns (eBay opens PayPal in new tab).

    // Check current tab's container first (for in-page navigation)
    if (currentCookieStoreId && currentCookieStoreId !== 'firefox-default') {
      const currentSavedId = ContainerManager.lookupSavedIdByCookieStore(
        currentCookieStoreId, savedContainers
      );
      if (currentSavedId && containerRules[currentSavedId]) {
        for (const rule of containerRules[currentSavedId]) {
          if (MatchPattern.matches(url, rule.pattern)) {
            return {
              action: 'SHARE_CONTAINER',
              cookieStoreId: currentCookieStoreId,
            };
          }
        }
      }
    }

    // Check opener's container (for new tab spawns)
    if (openerTabId != null) {
      const openerInfo = ContainerManager.getTabInfo(openerTabId);
      if (openerInfo && openerInfo.cookieStoreId !== currentCookieStoreId) {
        const openerSavedId = ContainerManager.lookupSavedIdByCookieStore(
          openerInfo.cookieStoreId, savedContainers
        );
        if (openerSavedId && containerRules[openerSavedId]) {
          for (const rule of containerRules[openerSavedId]) {
            if (MatchPattern.matches(url, rule.pattern)) {
              return {
                action: 'SHARE_CONTAINER',
                cookieStoreId: openerInfo.cookieStoreId,
              };
            }
          }
        }
      }
    }

    // 2. Global routing rules: route to a specific saved container
    for (const rule of globalRules) {
      if (MatchPattern.matches(url, rule.pattern)) {
        const saved = savedContainers[rule.savedContainerId];
        if (saved) {
          return {
            action: 'ROUTE_TO',
            cookieStoreId: saved.cookieStoreId,
          };
        }
      }
    }

    // 3. Default: isolate in new ephemeral container
    return { action: 'NEW_EPHEMERAL' };
  }

  return { refresh, evaluate };
})();
