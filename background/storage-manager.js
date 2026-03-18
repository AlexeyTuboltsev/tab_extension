const StorageManager = (() => {
  async function load() {
    const data = await browser.storage.local.get({
      [STORAGE_KEYS.EPHEMERAL_CONTAINERS]: {},
      [STORAGE_KEYS.SAVED_CONTAINERS]: {},
      [STORAGE_KEYS.GLOBAL_RULES]: [],
      [STORAGE_KEYS.CONTAINER_RULES]: {},
      [STORAGE_KEYS.EPHEMERAL_COUNTER]: 0,
    });
    return data;
  }

  async function getEphemeralContainers() {
    const data = await browser.storage.local.get(STORAGE_KEYS.EPHEMERAL_CONTAINERS);
    return data[STORAGE_KEYS.EPHEMERAL_CONTAINERS] || {};
  }

  async function setEphemeralContainers(containers) {
    await browser.storage.local.set({ [STORAGE_KEYS.EPHEMERAL_CONTAINERS]: containers });
  }

  async function addEphemeralContainer(cookieStoreId) {
    const containers = await getEphemeralContainers();
    containers[cookieStoreId] = { createdAt: Date.now() };
    await setEphemeralContainers(containers);
  }

  async function removeEphemeralContainer(cookieStoreId) {
    const containers = await getEphemeralContainers();
    delete containers[cookieStoreId];
    await setEphemeralContainers(containers);
  }

  async function getSavedContainers() {
    const data = await browser.storage.local.get(STORAGE_KEYS.SAVED_CONTAINERS);
    return data[STORAGE_KEYS.SAVED_CONTAINERS] || {};
  }

  async function setSavedContainers(containers) {
    await browser.storage.local.set({ [STORAGE_KEYS.SAVED_CONTAINERS]: containers });
  }

  async function addSavedContainer(id, container) {
    const containers = await getSavedContainers();
    containers[id] = container;
    await setSavedContainers(containers);
  }

  async function removeSavedContainer(id) {
    const containers = await getSavedContainers();
    delete containers[id];
    await setSavedContainers(containers);
    const rules = await getContainerRules();
    delete rules[id];
    await setContainerRules(rules);
  }

  async function getGlobalRules() {
    const data = await browser.storage.local.get(STORAGE_KEYS.GLOBAL_RULES);
    return data[STORAGE_KEYS.GLOBAL_RULES] || [];
  }

  async function setGlobalRules(rules) {
    await browser.storage.local.set({ [STORAGE_KEYS.GLOBAL_RULES]: rules });
  }

  async function addGlobalRule(rule) {
    const rules = await getGlobalRules();
    rules.push(rule);
    await setGlobalRules(rules);
  }

  async function removeGlobalRule(ruleId) {
    const rules = await getGlobalRules();
    await setGlobalRules(rules.filter(r => r.id !== ruleId));
  }

  async function getContainerRules() {
    const data = await browser.storage.local.get(STORAGE_KEYS.CONTAINER_RULES);
    return data[STORAGE_KEYS.CONTAINER_RULES] || {};
  }

  async function setContainerRules(rules) {
    await browser.storage.local.set({ [STORAGE_KEYS.CONTAINER_RULES]: rules });
  }

  async function addContainerRule(savedContainerId, rule) {
    const rules = await getContainerRules();
    if (!rules[savedContainerId]) {
      rules[savedContainerId] = [];
    }
    rules[savedContainerId].push(rule);
    await setContainerRules(rules);
  }

  async function removeContainerRule(savedContainerId, ruleId) {
    const rules = await getContainerRules();
    if (rules[savedContainerId]) {
      rules[savedContainerId] = rules[savedContainerId].filter(r => r.id !== ruleId);
      if (rules[savedContainerId].length === 0) {
        delete rules[savedContainerId];
      }
      await setContainerRules(rules);
    }
  }

  async function getNextEphemeralNumber() {
    const data = await browser.storage.local.get(STORAGE_KEYS.EPHEMERAL_COUNTER);
    const num = (data[STORAGE_KEYS.EPHEMERAL_COUNTER] || 0) + 1;
    await browser.storage.local.set({ [STORAGE_KEYS.EPHEMERAL_COUNTER]: num });
    return num;
  }

  return {
    load,
    getEphemeralContainers,
    addEphemeralContainer,
    removeEphemeralContainer,
    getSavedContainers,
    setSavedContainers,
    addSavedContainer,
    removeSavedContainer,
    getGlobalRules,
    setGlobalRules,
    addGlobalRule,
    removeGlobalRule,
    getContainerRules,
    setContainerRules,
    addContainerRule,
    removeContainerRule,
    getNextEphemeralNumber,
  };
})();
