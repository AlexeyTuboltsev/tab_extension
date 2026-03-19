const ContainerManager = (() => {
  const containerTabs = new Map();
  const ephemeralSet = new Set();
  const tabInfo = new Map();
  const movingTabs = new Set();
  const managedTabs = new Set();
  let colorIndex = 0;
  function nextColor() { const c = CONTAINER_COLORS[colorIndex % CONTAINER_COLORS.length]; colorIndex++; return c; }
  async function createEphemeral() {
    const num = await StorageManager.getNextEphemeralNumber();
    const container = await browser.contextualIdentities.create({ name: `${EPHEMERAL_PREFIX}-${String(num).padStart(3, '0')}`, color: nextColor(), icon: 'circle' });
    ephemeralSet.add(container.cookieStoreId); containerTabs.set(container.cookieStoreId, new Set());
    await StorageManager.addEphemeralContainer(container.cookieStoreId); return container;
  }
  async function destroyEphemeral(cookieStoreId) {
    if (!ephemeralSet.has(cookieStoreId)) return;
    ephemeralSet.delete(cookieStoreId); containerTabs.delete(cookieStoreId);
    await StorageManager.removeEphemeralContainer(cookieStoreId);
    try { await browser.contextualIdentities.remove(cookieStoreId); } catch (e) { console.warn('Failed to remove container:', cookieStoreId, e); }
  }
  async function moveTabToContainer(oldTab, targetCookieStoreId, url) {
    movingTabs.add(oldTab.id);
    try {
      const newTab = await browser.tabs.create({ url, cookieStoreId: targetCookieStoreId, index: oldTab.index, active: oldTab.active, windowId: oldTab.windowId, pinned: oldTab.pinned });
      managedTabs.add(newTab.id); trackTab(newTab.id, targetCookieStoreId, oldTab.openerTabId, url);
      await browser.tabs.remove(oldTab.id); return newTab;
    } finally { movingTabs.delete(oldTab.id); }
  }
  function trackTab(tabId, cookieStoreId, openerTabId, url) {
    tabInfo.set(tabId, { cookieStoreId, openerTabId, url });
    if (!containerTabs.has(cookieStoreId)) containerTabs.set(cookieStoreId, new Set());
    containerTabs.get(cookieStoreId).add(tabId);
  }
  function untrackTab(tabId) {
    const info = tabInfo.get(tabId); if (!info) return null;
    tabInfo.delete(tabId); const tabs = containerTabs.get(info.cookieStoreId);
    if (tabs) tabs.delete(tabId); return info;
  }
  function getTabInfo(tabId) { return tabInfo.get(tabId) || null; }
  function getContainerTabCount(csId) { const t = containerTabs.get(csId); return t ? t.size : 0; }
  function isEphemeral(csId) { return ephemeralSet.has(csId); }
  function isMoving(tabId) { return movingTabs.has(tabId); }
  function isManaged(tabId) { return managedTabs.has(tabId); }
  function managedAdd(tabId) { managedTabs.add(tabId); }
  function clearManaged(tabId) { managedTabs.delete(tabId); }
  async function saveEphemeral(cookieStoreId, name, color, icon) {
    if (!ephemeralSet.has(cookieStoreId)) return null;
    const savedId = 'sc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    await browser.contextualIdentities.update(cookieStoreId, { name, color, icon });
    ephemeralSet.delete(cookieStoreId); await StorageManager.removeEphemeralContainer(cookieStoreId);
    await StorageManager.addSavedContainer(savedId, { cookieStoreId, name, color, icon }); return savedId;
  }
  function lookupSavedIdByCookieStore(cookieStoreId, savedContainers) {
    for (const [id, sc] of Object.entries(savedContainers)) { if (sc.cookieStoreId === cookieStoreId) return id; } return null;
  }
  async function initialize() {
    const data = await StorageManager.load();
    const ephContainers = data[STORAGE_KEYS.EPHEMERAL_CONTAINERS] || {};
    for (const csId of Object.keys(ephContainers)) ephemeralSet.add(csId);
    const allTabs = await browser.tabs.query({});
    for (const tab of allTabs) trackTab(tab.id, tab.cookieStoreId, tab.openerTabId, tab.url);
    for (const csId of [...ephemeralSet]) { if (getContainerTabCount(csId) === 0) await destroyEphemeral(csId); }
    const saved = data[STORAGE_KEYS.SAVED_CONTAINERS] || {};
    const savedCookieStoreIds = new Set(Object.values(saved).map(s => s.cookieStoreId));
    const allContainers = await browser.contextualIdentities.query({});
    for (const container of allContainers) {
      if (savedCookieStoreIds.has(container.cookieStoreId)) continue;
      if (getContainerTabCount(container.cookieStoreId) > 0) continue;
      try { await browser.contextualIdentities.remove(container.cookieStoreId); console.log('Cleaned up container:', container.name); } catch (e) {}
    }
  }
  function getState() {
    const containers = [];
    for (const [cookieStoreId, tabs] of containerTabs) {
      containers.push({ cookieStoreId, tabCount: tabs.size, tabIds: [...tabs], isEphemeral: ephemeralSet.has(cookieStoreId) });
    }
    return containers;
  }
  return { createEphemeral, destroyEphemeral, moveTabToContainer, trackTab, untrackTab, getTabInfo, getContainerTabCount, isEphemeral, isMoving, isManaged, managedAdd, clearManaged, saveEphemeral, lookupSavedIdByCookieStore, initialize, getState };
})();
