/**
 * Core interception logic.
 *
 * Universal rule: EVERY main_frame navigation is evaluated.
 *
 * When a container change is needed:
 *   - Link click (originUrl present): old tab stays, new tab opens next to it
 *   - Typed URL / bookmark (no originUrl): old tab is replaced
 *   - firefox-default tabs: always replaced (no useful state)
 */

const TabInterceptor = (() => {
  const exemptTabs = new Set();
  const processingTabs = new Set(); // tabs currently being moved — prevent double-fire

  /**
   * Should we close the old tab when switching containers?
   *   - firefox-default: always yes (no useful state)
   *   - Typed URL / bookmark (no originUrl): yes (user is navigating away)
   *   - Link click (has originUrl from a page): no (keep history)
   */
  function shouldReplaceTab(details, currentCookieStoreId, tracked) {
    if (currentCookieStoreId === 'firefox-default') return true;
    // Fresh tab with no content (e.g., Ctrl+click spawned tab still at about:blank)
    if (tracked && (!tracked.url || tracked.url === 'about:blank' || tracked.url === 'about:newtab' || tracked.url === '')) return true;
    // Typed URL / bookmark (no originUrl): user is navigating away
    if (!details.originUrl) return true;
    if (details.originUrl.startsWith('about:') || details.originUrl.startsWith('moz-extension:')) return true;
    return false;
  }

  function onBeforeRequest(details) {
    if (details.tabId === -1) return {};

    if (exemptTabs.has(details.tabId)) {
      exemptTabs.delete(details.tabId);
      return {};
    }

    // Already being processed (e.g., redirect fired a second onBeforeRequest)
    if (processingTabs.has(details.tabId)) return {};

    const url = details.url;
    if (!url || (!url.startsWith('http:') && !url.startsWith('https:'))) {
      return {};
    }

    const tracked = ContainerManager.getTabInfo(details.tabId);
    const currentCookieStoreId = tracked ? tracked.cookieStoreId : 'firefox-default';
    const openerTabId = tracked ? tracked.openerTabId : undefined;

    const decision = RuleEngine.evaluate(url, openerTabId, currentCookieStoreId);

    // Already in the correct container — allow navigation
    if (decision.action === 'ROUTE_TO' || decision.action === 'SHARE_CONTAINER') {
      if (currentCookieStoreId === decision.cookieStoreId) {
        if (tracked) tracked.url = url;
        return {};
      }
      const replace = shouldReplaceTab(details, currentCookieStoreId, tracked);
      openInContainer(details.tabId, decision.cookieStoreId, url, replace);
      return { cancel: true };
    }

    if (decision.action === 'NEW_EPHEMERAL') {
      // Already in a single-tab ephemeral — reuse, no switch needed
      if (
        currentCookieStoreId !== 'firefox-default' &&
        ContainerManager.isEphemeral(currentCookieStoreId) &&
        ContainerManager.getContainerTabCount(currentCookieStoreId) <= 1
      ) {
        if (tracked) tracked.url = url;
        return {};
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
      const newTab = await browser.tabs.create({
        url,
        cookieStoreId: targetCookieStoreId,
        index: replaceOldTab ? tab.index : tab.index + 1,
        active: true,
        windowId: tab.windowId,
      });
      ContainerManager.trackTab(newTab.id, targetCookieStoreId, tab.id, url);
      if (replaceOldTab) {
        await browser.tabs.remove(tabId).catch(() => {});
      }
    } catch (e) {
      // Tab may have been closed by a concurrent move — not an error
    } finally {
      processingTabs.delete(tabId);
    }
  }

  async function openInNewEphemeral(tabId, url, replaceOldTab) {
    processingTabs.add(tabId);
    try {
      const tab = await browser.tabs.get(tabId);
      const container = await ContainerManager.createEphemeral();
      const newTab = await browser.tabs.create({
        url,
        cookieStoreId: container.cookieStoreId,
        index: replaceOldTab ? tab.index : tab.index + 1,
        active: true,
        windowId: tab.windowId,
      });
      ContainerManager.trackTab(newTab.id, container.cookieStoreId, tab.id, url);
      if (replaceOldTab) {
        await browser.tabs.remove(tabId).catch(() => {});
      }
    } catch (e) {
      // Tab may have been closed by a concurrent move — not an error
    } finally {
      processingTabs.delete(tabId);
    }
  }

  function onTabCreated(tab) {
    if (ContainerManager.isMoving(tab.id) || ContainerManager.isManaged(tab.id)) {
      ContainerManager.clearManaged(tab.id);
      return;
    }
    ContainerManager.trackTab(tab.id, tab.cookieStoreId, tab.openerTabId, tab.url || '');
  }

  async function onTabRemoved(tabId) {
    exemptTabs.delete(tabId);
    const info = ContainerManager.untrackTab(tabId);
    if (info && ContainerManager.isEphemeral(info.cookieStoreId)) {
      if (ContainerManager.getContainerTabCount(info.cookieStoreId) === 0) {
        await ContainerManager.destroyEphemeral(info.cookieStoreId);
      }
    }
  }

  function onTabUpdated(tabId, changeInfo) {
    if (!changeInfo.url) return;
    const info = ContainerManager.getTabInfo(tabId);
    if (info) {
      info.url = changeInfo.url;
    }
  }

  function addExemptTab(tabId) {
    exemptTabs.add(tabId);
  }

  function setup() {
    browser.tabs.onCreated.addListener(onTabCreated);
    browser.tabs.onRemoved.addListener(onTabRemoved);
    browser.tabs.onUpdated.addListener(onTabUpdated);

    browser.webRequest.onBeforeRequest.addListener(
      onBeforeRequest,
      { urls: ['<all_urls>'], types: ['main_frame'] },
      ['blocking']
    );
  }

  return { setup, addExemptTab };
})();
