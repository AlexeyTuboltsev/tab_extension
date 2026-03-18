const ContextMenu = (() => {
  const MENU_NEW_CONTAINER = 'ctm-new-container';
  const MENU_SAME_CONTAINER = 'ctm-same-container';
  const MENU_SUBMENU = 'ctm-container-submenu';
  const MENU_CONTAINER_PREFIX = 'ctm-c-';

  async function build() {
    await browser.menus.removeAll();

    // Default action (same as Ctrl+click)
    browser.menus.create({
      id: MENU_NEW_CONTAINER,
      title: 'Open Link in New Container',
      contexts: ['link'],
    });

    browser.menus.create({
      id: MENU_SAME_CONTAINER,
      title: 'Open Link in Same Container',
      contexts: ['link'],
    });

    // Submenu: "Open Link in Container →"
    browser.menus.create({
      id: MENU_SUBMENU,
      title: 'Open Link in Container',
      contexts: ['link'],
    });

    // Populate submenu with saved containers first, then active ephemerals
    const saved = await StorageManager.getSavedContainers();
    const identities = await browser.contextualIdentities.query({});
    const identityMap = {};
    for (const id of identities) {
      identityMap[id.cookieStoreId] = id;
    }

    // Saved containers
    const savedEntries = Object.entries(saved);
    for (const [id, sc] of savedEntries) {
      const identity = identityMap[sc.cookieStoreId];
      browser.menus.create({
        id: MENU_CONTAINER_PREFIX + sc.cookieStoreId,
        parentId: MENU_SUBMENU,
        title: sc.name,
        icons: identity ? { 16: getContainerIconUrl(identity.icon, identity.color) } : undefined,
        contexts: ['link'],
      });
    }

    // Separator between saved and ephemeral
    const activeContainers = ContainerManager.getState();
    const ephemeralContainers = activeContainers.filter(c => c.isEphemeral && c.tabCount > 0);

    if (savedEntries.length > 0 && ephemeralContainers.length > 0) {
      browser.menus.create({
        id: MENU_CONTAINER_PREFIX + 'sep',
        parentId: MENU_SUBMENU,
        type: 'separator',
        contexts: ['link'],
      });
    }

    // Ephemeral containers (with tab count)
    for (const ec of ephemeralContainers) {
      const identity = identityMap[ec.cookieStoreId];
      const name = identity ? identity.name : ec.cookieStoreId;
      browser.menus.create({
        id: MENU_CONTAINER_PREFIX + ec.cookieStoreId,
        parentId: MENU_SUBMENU,
        title: `${name} (${ec.tabCount} tab${ec.tabCount !== 1 ? 's' : ''})`,
        contexts: ['link'],
      });
    }

    // Empty state
    if (savedEntries.length === 0 && ephemeralContainers.length === 0) {
      browser.menus.create({
        id: MENU_CONTAINER_PREFIX + 'empty',
        parentId: MENU_SUBMENU,
        title: '(no containers)',
        enabled: false,
        contexts: ['link'],
      });
    }
  }

  function getContainerIconUrl(icon, color) {
    // Firefox provides built-in container icon URLs
    return `resource://usercontext-content/${icon}.svg#${color}`;
  }

  async function createExemptTab(url, cookieStoreId, tab) {
    const newTab = await browser.tabs.create({
      url,
      cookieStoreId,
      index: tab.index + 1,
      windowId: tab.windowId,
    });
    ContainerManager.trackTab(newTab.id, cookieStoreId, tab.id, url);
    TabInterceptor.addExemptTab(newTab.id);
    return newTab;
  }

  async function onClick(info, tab) {
    const url = info.linkUrl;
    if (!url) return;

    if (info.menuItemId === MENU_NEW_CONTAINER) {
      const container = await ContainerManager.createEphemeral();
      await createExemptTab(url, container.cookieStoreId, tab);
      return;
    }

    if (info.menuItemId === MENU_SAME_CONTAINER) {
      await createExemptTab(url, tab.cookieStoreId, tab);
      return;
    }

    if (typeof info.menuItemId === 'string' && info.menuItemId.startsWith(MENU_CONTAINER_PREFIX)) {
      const cookieStoreId = info.menuItemId.slice(MENU_CONTAINER_PREFIX.length);
      if (cookieStoreId === 'sep' || cookieStoreId === 'empty') return;
      await createExemptTab(url, cookieStoreId, tab);
    }
  }

  function setup() {
    build();
    browser.menus.onClicked.addListener(onClick);

    // Rebuild when containers change
    browser.storage.onChanged.addListener((changes) => {
      if (changes[STORAGE_KEYS.SAVED_CONTAINERS] || changes[STORAGE_KEYS.EPHEMERAL_CONTAINERS]) {
        build();
      }
    });

    // Rebuild when menu is shown (catches ephemeral container changes)
    browser.menus.onShown.addListener(() => {
      build().then(() => browser.menus.refresh());
    });
  }

  return { setup, build };
})();
