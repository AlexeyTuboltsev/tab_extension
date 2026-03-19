const TabInterceptor = (() => {
  const exemptTabs = new Set();
  const processingTabs = new Set();
  function shouldReplaceTab(details, currentCookieStoreId, tracked) {
    if (currentCookieStoreId === 'firefox-default') return true;
    if (tracked && (!tracked.url || tracked.url === 'about:blank' || tracked.url === 'about:newtab' || tracked.url === '')) return true;
    if (!details.originUrl) return true;
    if (details.originUrl.startsWith('about:') || details.originUrl.startsWith('moz-extension:')) return true;
    return false;
  }
  function onBeforeRequest(details) {
    if (details.tabId === -1) return {};
    if (exemptTabs.has(details.tabId)) { exemptTabs.delete(details.tabId); return {}; }
    if (processingTabs.has(details.tabId)) return {};
    const url = details.url;
    if (!url || (!url.startsWith('http:') && !url.startsWith('https:'))) return {};
    const tracked = ContainerManager.getTabInfo(details.tabId);
    const currentCookieStoreId = tracked ? tracked.cookieStoreId : 'firefox-default';
    const openerTabId = tracked ? tracked.openerTabId : undefined;
    const decision = RuleEngine.evaluate(url, openerTabId, currentCookieStoreId);
    if (decision.action === 'ROUTE_TO' || decision.action === 'SHARE_CONTAINER') {
      if (currentCookieStoreId === decision.cookieStoreId) { if (tracked) tracked.url = url; return {}; }
      const replace = shouldReplaceTab(details, currentCookieStoreId, tracked);
      openInContainer(details.tabId, decision.cookieStoreId, url, replace);
      return { cancel: true };
    }
    if (decision.action === 'NEW_EPHEMERAL') {
      if (currentCookieStoreId !== 'firefox-default' && ContainerManager.isEphemeral(currentCookieStoreId) && ContainerManager.getContainerTabCount(currentCookieStoreId) <= 1) {
        if (tracked) tracked.url = url; return {};
      }
      const replace = shouldReplaceTab(details, currentCookieStoreId, tracked);
      openInNewEphemeral(details.tabId, url, replace);
      return { cancel: true };
    }
    return {};
  }
  async function openInContainer(tabId, targetCookieStoreId, url, replaceOldTab) {
    processingTabs.add(tabId);
    try {
      const tab = await browser.tabs.get(tabId);
      const newTab = await browser.tabs.create({ url, cookieStoreId: targetCookieStoreId, index: replaceOldTab ? tab.index : tab.index + 1, active: true, windowId: tab.windowId });
      ContainerManager.trackTab(newTab.id, targetCookieStoreId, tab.id, url);
      if (replaceOldTab) await browser.tabs.remove(tabId).catch(() => {});
    } catch (e) {} finally { processingTabs.delete(tabId); }
  }
  async function openInNewEphemeral(tabId, url, replaceOldTab) {
    processingTabs.add(tabId);
    try {
      const tab = await browser.tabs.get(tabId);
      const container = await ContainerManager.createEphemeral();
      const newTab = await browser.tabs.create({ url, cookieStoreId: container.cookieStoreId, index: replaceOldTab ? tab.index : tab.index + 1, active: true, windowId: tab.windowId });
      ContainerManager.trackTab(newTab.id, container.cookieStoreId, tab.id, url);
      if (replaceOldTab) await browser.tabs.remove(tabId).catch(() => {});
    } catch (e) {} finally { processingTabs.delete(tabId); }
  }
  function onTabCreated(tab) {
    if (ContainerManager.isMoving(tab.id) || ContainerManager.isManaged(tab.id)) { ContainerManager.clearManaged(tab.id); return; }
    ContainerManager.trackTab(tab.id, tab.cookieStoreId, tab.openerTabId, tab.url || '');
  }
  async function onTabRemoved(tabId) {
    exemptTabs.delete(tabId);
    const info = ContainerManager.untrackTab(tabId);
    if (info && ContainerManager.isEphemeral(info.cookieStoreId)) {
      if (ContainerManager.getContainerTabCount(info.cookieStoreId) === 0) await ContainerManager.destroyEphemeral(info.cookieStoreId);
    }
  }
  function onTabUpdated(tabId, changeInfo) { if (!changeInfo.url) return; const info = ContainerManager.getTabInfo(tabId); if (info) info.url = changeInfo.url; }
  function extractDomain(url) {
    try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
  }
  function isDifferentDomain(urlA, urlB) {
    const a = extractDomain(urlA);
    const b = extractDomain(urlB);
    if (!a || !b) return false;
    return a !== b;
  }
  function onBeforeSendHeaders(details) {
    const url = details.url;
    const originUrl = details.originUrl;
    if (!url || !originUrl) return {};
    if (!RuleEngine.isSharedProvider(url)) return {};
    if (!isDifferentDomain(url, originUrl)) return {};
    const headers = details.requestHeaders.filter(
      h => h.name.toLowerCase() !== 'referer'
    );
    return { requestHeaders: headers };
  }
  function onHeadersReceived(details) {
    const url = details.url;
    if (!url || !RuleEngine.isSharedProvider(url)) return {};
    const headers = details.responseHeaders.filter(
      h => h.name.toLowerCase() !== 'referrer-policy'
    );
    headers.push({ name: 'Referrer-Policy', value: 'no-referrer' });
    return { responseHeaders: headers };
  }
  function addExemptTab(tabId) { exemptTabs.add(tabId); }
  function setup() {
    browser.tabs.onCreated.addListener(onTabCreated);
    browser.tabs.onRemoved.addListener(onTabRemoved);
    browser.tabs.onUpdated.addListener(onTabUpdated);
    browser.webRequest.onBeforeRequest.addListener(onBeforeRequest, { urls: ['<all_urls>'], types: ['main_frame'] }, ['blocking']);
    browser.webRequest.onBeforeSendHeaders.addListener(onBeforeSendHeaders, { urls: ['<all_urls>'], types: ['main_frame'] }, ['blocking', 'requestHeaders']);
    browser.webRequest.onHeadersReceived.addListener(onHeadersReceived, { urls: ['<all_urls>'], types: ['main_frame'] }, ['blocking', 'responseHeaders']);
  }
  return { setup, addExemptTab };
})();
