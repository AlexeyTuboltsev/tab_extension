// Main entry point — initialize everything

(async () => {
  try {
    // Initialize storage-backed state and runtime tracking
    await ContainerManager.initialize();

    // Migrate old-format patterns (e.g. "paypal.*" → "paypal.com")
    await migratePatterns();

    // Load rules into the rule engine
    await RuleEngine.refresh();

    // Set up tab interception
    TabInterceptor.setup();

    // Set up context menus
    ContextMenu.setup();

    // Set up address bar container indicator
    PageActionIndicator.setup();

    // Refresh rules and indicators when storage changes
    browser.storage.onChanged.addListener((changes) => {
      if (
        changes[STORAGE_KEYS.GLOBAL_RULES] ||
        changes[STORAGE_KEYS.CONTAINER_RULES] ||
        changes[STORAGE_KEYS.SAVED_CONTAINERS]
      ) {
        RuleEngine.refresh();
      }
      if (
        changes[STORAGE_KEYS.SAVED_CONTAINERS] ||
        changes[STORAGE_KEYS.EPHEMERAL_CONTAINERS]
      ) {
        PageActionIndicator.updateAllTabs();
      }
    });

    // Handle messages from popup and options pages
    browser.runtime.onMessage.addListener((message) => {
      return handleMessage(message);
    });

    console.log('Container Tab Manager initialized');
  } catch (e) {
    console.error('Failed to initialize Container Tab Manager:', e);
  }
})();

async function handleMessage(message) {
  switch (message.type) {
    case 'getState': {
      const containers = ContainerManager.getState();
      const saved = await StorageManager.getSavedContainers();
      const globalRules = await StorageManager.getGlobalRules();
      const containerRules = await StorageManager.getContainerRules();
      // Enrich container state with contextualIdentity info
      const identities = await browser.contextualIdentities.query({});
      const identityMap = {};
      for (const id of identities) {
        identityMap[id.cookieStoreId] = id;
      }
      for (const c of containers) {
        const identity = identityMap[c.cookieStoreId];
        if (identity) {
          c.name = identity.name;
          c.color = identity.color;
          c.icon = identity.icon;
        }
      }
      return { containers, saved, globalRules, containerRules };
    }

    case 'getTabsForContainer': {
      const tabIds = ContainerManager.getState()
        .find(c => c.cookieStoreId === message.cookieStoreId)?.tabIds || [];
      const tabs = [];
      for (const tabId of tabIds) {
        try {
          const tab = await browser.tabs.get(tabId);
          tabs.push({ id: tab.id, title: tab.title, url: tab.url, favIconUrl: tab.favIconUrl });
        } catch (e) {
          // Tab may have been closed
        }
      }
      return { tabs };
    }

    case 'saveEphemeral': {
      // Collect domains from tabs in this container BEFORE saving
      const tabIds = ContainerManager.getState()
        .find(c => c.cookieStoreId === message.cookieStoreId)?.tabIds || [];
      const domains = new Set();
      for (const tid of tabIds) {
        try {
          const t = await browser.tabs.get(tid);
          if (t.url && (t.url.startsWith('http:') || t.url.startsWith('https:'))) {
            const hostname = new URL(t.url).hostname;
            domains.add(hostname);
          }
        } catch (e) { /* tab may have closed */ }
      }

      const savedId = await ContainerManager.saveEphemeral(
        message.cookieStoreId, message.name, message.color, message.icon
      );

      // Auto-create global rules for each domain in the container
      const autoRules = [];
      if (savedId) {
        for (const domain of domains) {
          const friendly = MatchPattern.domainToFriendly(domain);
          const ruleId = 'gr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
          await StorageManager.addGlobalRule({
            id: ruleId,
            pattern: friendly,
            savedContainerId: savedId,
          });
          autoRules.push(friendly);
        }
      }

      // Refresh indicator for all tabs in this container
      PageActionIndicator.updateAllTabs();

      return { savedId, autoRules };
    }

    case 'addGlobalRule': {
      const id = 'gr_' + Date.now();
      await StorageManager.addGlobalRule({
        id,
        pattern: message.pattern,
        savedContainerId: message.savedContainerId,
      });
      return { id };
    }

    case 'removeGlobalRule': {
      await StorageManager.removeGlobalRule(message.ruleId);
      return {};
    }

    case 'addContainerRule': {
      const id = 'cr_' + Date.now();
      await StorageManager.addContainerRule(message.savedContainerId, {
        id,
        pattern: message.pattern,
      });
      return { id };
    }

    case 'removeContainerRule': {
      await StorageManager.removeContainerRule(message.savedContainerId, message.ruleId);
      return {};
    }

    case 'removeSavedContainer': {
      await StorageManager.removeSavedContainer(message.savedContainerId);
      return {};
    }

    case 'switchToTab': {
      await browser.tabs.update(message.tabId, { active: true });
      const tab = await browser.tabs.get(message.tabId);
      await browser.windows.update(tab.windowId, { focused: true });
      return {};
    }

    default:
      console.warn('Unknown message type:', message.type);
      return {};
  }
}

/**
 * Migrate old-format patterns that no longer match.
 * e.g., "paypal.*" (wildcard TLD, removed) → "paypal.com"
 * Attempts to fix by looking at tabs currently in the saved container.
 * If no tabs, strips the .* and appends .com as best guess.
 */
async function migratePatterns() {
  const globalRules = await StorageManager.getGlobalRules();
  const saved = await StorageManager.getSavedContainers();
  let changed = false;

  for (const rule of globalRules) {
    if (!MatchPattern.isValid(rule.pattern)) {
      const oldPattern = rule.pattern;
      let newPattern = null;

      // "paypal.*" → try to find actual domain from tabs in the container
      if (oldPattern.endsWith('.*')) {
        const base = oldPattern.slice(0, -2);
        const sc = saved[rule.savedContainerId];
        if (sc) {
          // Look for tabs in this container to get real domain
          const tabs = await browser.tabs.query({ cookieStoreId: sc.cookieStoreId });
          for (const tab of tabs) {
            if (tab.url && tab.url.startsWith('http')) {
              try {
                const hostname = new URL(tab.url).hostname.replace(/^www\d*\./, '');
                if (hostname.startsWith(base + '.')) {
                  newPattern = hostname;
                  break;
                }
              } catch (e) { /* skip */ }
            }
          }
        }
        // Fallback: best guess
        if (!newPattern) {
          newPattern = base + '.com';
        }
      }

      if (newPattern && MatchPattern.isValid(newPattern)) {
        console.log(`[Migration] "${oldPattern}" \u2192 "${newPattern}"`);
        rule.pattern = newPattern;
        changed = true;
      } else {
        console.warn(`[Migration] Could not fix invalid pattern: "${oldPattern}"`);
      }
    }
  }

  if (changed) {
    await StorageManager.setGlobalRules(globalRules);
  }

  // Same for container-bound rules
  const containerRules = await StorageManager.getContainerRules();
  let boundChanged = false;
  for (const [scId, rules] of Object.entries(containerRules)) {
    for (const rule of rules) {
      if (!MatchPattern.isValid(rule.pattern)) {
        const oldPattern = rule.pattern;
        if (oldPattern.endsWith('.*')) {
          rule.pattern = oldPattern.slice(0, -2) + '.com';
          console.log(`[Migration] Bound rule "${oldPattern}" \u2192 "${rule.pattern}"`);
          boundChanged = true;
        }
      }
    }
  }
  if (boundChanged) {
    await StorageManager.setContainerRules(containerRules);
  }
}
