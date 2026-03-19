// Main entry point

(async () => {
  try {
    await ContainerManager.initialize();
    await migratePatterns();
    await RuleEngine.refresh();
    TabInterceptor.setup();
    ContextMenu.setup();
    PageActionIndicator.setup();
    browser.storage.onChanged.addListener((changes) => {
      if (changes[STORAGE_KEYS.GLOBAL_RULES] || changes[STORAGE_KEYS.CONTAINER_RULES] || changes[STORAGE_KEYS.SAVED_CONTAINERS] || changes[STORAGE_KEYS.SHARED_PROVIDERS]) {
        RuleEngine.refresh();
      }
      if (changes[STORAGE_KEYS.SAVED_CONTAINERS] || changes[STORAGE_KEYS.EPHEMERAL_CONTAINERS]) {
        PageActionIndicator.updateAllTabs();
      }
    });
    browser.runtime.onMessage.addListener((message, sender) => handleMessage(message, sender));
    console.log('Container Tab Manager initialized');
  } catch (e) {
    console.error('Failed to initialize Container Tab Manager:', e);
  }
})();

function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

async function handleMessage(message, sender) {
  switch (message.type) {
    case 'getSeed': {
      if (sender && sender.tab && sender.tab.cookieStoreId) {
        const id = sender.tab.cookieStoreId;
        // No noise for the default (non-container) context
        if (id === 'firefox-default') return { seed: 0 };
        return { seed: hashString(id) };
      }
      return { seed: 0 };
    }
    case 'getState': {
      const containers = ContainerManager.getState();
      const saved = await StorageManager.getSavedContainers();
      const globalRules = await StorageManager.getGlobalRules();
      const containerRules = await StorageManager.getContainerRules();
      const identities = await browser.contextualIdentities.query({});
      const identityMap = {};
      for (const id of identities) identityMap[id.cookieStoreId] = id;
      for (const c of containers) {
        const identity = identityMap[c.cookieStoreId];
        if (identity) { c.name = identity.name; c.color = identity.color; c.icon = identity.icon; }
      }
      return { containers, saved, globalRules, containerRules };
    }
    case 'getTabsForContainer': {
      const tabIds = ContainerManager.getState().find(c => c.cookieStoreId === message.cookieStoreId)?.tabIds || [];
      const tabs = [];
      for (const tabId of tabIds) {
        try { const tab = await browser.tabs.get(tabId); tabs.push({ id: tab.id, title: tab.title, url: tab.url, favIconUrl: tab.favIconUrl }); } catch (e) {}
      }
      return { tabs };
    }
    case 'getContainerDomains': {
      const tabIds = ContainerManager.getState().find(c => c.cookieStoreId === message.cookieStoreId)?.tabIds || [];
      const domains = new Set();
      for (const tid of tabIds) {
        try { const t = await browser.tabs.get(tid); if (t.url && (t.url.startsWith('http:') || t.url.startsWith('https:'))) domains.add(MatchPattern.domainToFriendly(new URL(t.url).hostname)); } catch (e) {}
      }
      return { domains: [...domains] };
    }
    case 'saveEphemeral': {
      const savedId = await ContainerManager.saveEphemeral(message.cookieStoreId, message.name, message.color, message.icon);
      if (savedId) {
        if (message.globalPatterns) {
          for (const pattern of message.globalPatterns) {
            await StorageManager.addGlobalRule({ id: 'gr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), pattern, savedContainerId: savedId });
          }
        }
        if (message.boundPatterns) {
          for (const pattern of message.boundPatterns) {
            await StorageManager.addContainerRule(savedId, { id: 'cr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), pattern });
          }
        }
      }
      PageActionIndicator.updateAllTabs();
      return { savedId };
    }
    case 'addGlobalRule': {
      const id = 'gr_' + Date.now();
      await StorageManager.addGlobalRule({ id, pattern: message.pattern, savedContainerId: message.savedContainerId });
      return { id };
    }
    case 'removeGlobalRule': { await StorageManager.removeGlobalRule(message.ruleId); return {}; }
    case 'addContainerRule': {
      const id = 'cr_' + Date.now();
      await StorageManager.addContainerRule(message.savedContainerId, { id, pattern: message.pattern });
      return { id };
    }
    case 'removeContainerRule': { await StorageManager.removeContainerRule(message.savedContainerId, message.ruleId); return {}; }
    case 'updateContainerRules': {
      const allGlobal = await StorageManager.getGlobalRules();
      const filteredGlobal = allGlobal.filter(r => r.savedContainerId !== message.savedContainerId);
      for (const pattern of (message.globalPatterns || [])) {
        filteredGlobal.push({ id: 'gr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), pattern, savedContainerId: message.savedContainerId });
      }
      await StorageManager.setGlobalRules(filteredGlobal);
      const allBound = await StorageManager.getContainerRules();
      allBound[message.savedContainerId] = (message.boundPatterns || []).map(pattern => ({ id: 'cr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), pattern }));
      if (allBound[message.savedContainerId].length === 0) delete allBound[message.savedContainerId];
      await StorageManager.setContainerRules(allBound);
      if (message.name || message.color || message.icon) {
        const saved = await StorageManager.getSavedContainers();
        if (saved[message.savedContainerId]) {
          if (message.name) saved[message.savedContainerId].name = message.name;
          if (message.color) saved[message.savedContainerId].color = message.color;
          if (message.icon) saved[message.savedContainerId].icon = message.icon;
          await StorageManager.setSavedContainers(saved);
        }
      }
      return {};
    }
    case 'removeSavedContainer': {
      const saved = await StorageManager.getSavedContainers();
      const sc = saved[message.savedContainerId];
      if (sc) {
        const tabs = await browser.tabs.query({ cookieStoreId: sc.cookieStoreId });
        for (const tab of tabs) await browser.tabs.remove(tab.id).catch(() => {});
        if (message.clearData) {
          const cookies = await browser.cookies.getAll({ storeId: sc.cookieStoreId });
          for (const cookie of cookies) {
            const url = `http${cookie.secure ? 's' : ''}://${cookie.domain.replace(/^\./, '')}${cookie.path}`;
            await browser.cookies.remove({ url, name: cookie.name, storeId: sc.cookieStoreId }).catch(() => {});
          }
        }
        await browser.contextualIdentities.remove(sc.cookieStoreId).catch(() => {});
      }
      await StorageManager.removeSavedContainer(message.savedContainerId);
      return {};
    }
    case 'switchToTab': {
      await browser.tabs.update(message.tabId, { active: true });
      const tab = await browser.tabs.get(message.tabId);
      await browser.windows.update(tab.windowId, { focused: true });
      return {};
    }
    default: console.warn('Unknown message type:', message.type); return {};
  }
}

async function migratePatterns() {
  const globalRules = await StorageManager.getGlobalRules();
  const saved = await StorageManager.getSavedContainers();
  let changed = false;
  for (const rule of globalRules) {
    if (!MatchPattern.isValid(rule.pattern)) {
      const oldPattern = rule.pattern;
      let newPattern = null;
      if (oldPattern.endsWith('.*')) {
        const base = oldPattern.slice(0, -2);
        const sc = saved[rule.savedContainerId];
        if (sc) {
          const tabs = await browser.tabs.query({ cookieStoreId: sc.cookieStoreId });
          for (const tab of tabs) {
            if (tab.url && tab.url.startsWith('http')) {
              try { const h = new URL(tab.url).hostname.replace(/^www\d*\./, ''); if (h.startsWith(base + '.')) { newPattern = h; break; } } catch (e) {}
            }
          }
        }
        if (!newPattern) newPattern = base + '.com';
      }
      if (newPattern && MatchPattern.isValid(newPattern)) { console.log(`[Migration] "${oldPattern}" \u2192 "${newPattern}"`); rule.pattern = newPattern; changed = true; }
      else console.warn(`[Migration] Could not fix: "${oldPattern}"`);
    }
  }
  if (changed) await StorageManager.setGlobalRules(globalRules);
  const containerRules = await StorageManager.getContainerRules();
  let boundChanged = false;
  for (const [, rules] of Object.entries(containerRules)) {
    for (const rule of rules) {
      if (!MatchPattern.isValid(rule.pattern) && rule.pattern.endsWith('.*')) {
        rule.pattern = rule.pattern.slice(0, -2) + '.com'; boundChanged = true;
      }
    }
  }
  if (boundChanged) await StorageManager.setContainerRules(containerRules);
}
