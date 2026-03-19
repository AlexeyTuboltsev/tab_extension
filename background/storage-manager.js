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
  async function getEphemeralContainers() { const d = await browser.storage.local.get(STORAGE_KEYS.EPHEMERAL_CONTAINERS); return d[STORAGE_KEYS.EPHEMERAL_CONTAINERS] || {}; }
  async function setEphemeralContainers(c) { await browser.storage.local.set({ [STORAGE_KEYS.EPHEMERAL_CONTAINERS]: c }); }
  async function addEphemeralContainer(id) { const c = await getEphemeralContainers(); c[id] = { createdAt: Date.now() }; await setEphemeralContainers(c); }
  async function removeEphemeralContainer(id) { const c = await getEphemeralContainers(); delete c[id]; await setEphemeralContainers(c); }
  async function getSavedContainers() { const d = await browser.storage.local.get(STORAGE_KEYS.SAVED_CONTAINERS); return d[STORAGE_KEYS.SAVED_CONTAINERS] || {}; }
  async function setSavedContainers(c) { await browser.storage.local.set({ [STORAGE_KEYS.SAVED_CONTAINERS]: c }); }
  async function addSavedContainer(id, c) { const cs = await getSavedContainers(); cs[id] = c; await setSavedContainers(cs); }
  async function removeSavedContainer(id) { const cs = await getSavedContainers(); delete cs[id]; await setSavedContainers(cs); const r = await getContainerRules(); delete r[id]; await setContainerRules(r); }
  async function getGlobalRules() { const d = await browser.storage.local.get(STORAGE_KEYS.GLOBAL_RULES); return d[STORAGE_KEYS.GLOBAL_RULES] || []; }
  async function setGlobalRules(r) { await browser.storage.local.set({ [STORAGE_KEYS.GLOBAL_RULES]: r }); }
  async function addGlobalRule(r) { const rs = await getGlobalRules(); rs.push(r); await setGlobalRules(rs); }
  async function removeGlobalRule(id) { const rs = await getGlobalRules(); await setGlobalRules(rs.filter(r => r.id !== id)); }
  async function getContainerRules() { const d = await browser.storage.local.get(STORAGE_KEYS.CONTAINER_RULES); return d[STORAGE_KEYS.CONTAINER_RULES] || {}; }
  async function setContainerRules(r) { await browser.storage.local.set({ [STORAGE_KEYS.CONTAINER_RULES]: r }); }
  async function addContainerRule(scId, r) { const rs = await getContainerRules(); if (!rs[scId]) rs[scId] = []; rs[scId].push(r); await setContainerRules(rs); }
  async function removeContainerRule(scId, rId) { const rs = await getContainerRules(); if (rs[scId]) { rs[scId] = rs[scId].filter(r => r.id !== rId); if (rs[scId].length === 0) delete rs[scId]; await setContainerRules(rs); } }
  async function getNextEphemeralNumber() { const d = await browser.storage.local.get(STORAGE_KEYS.EPHEMERAL_COUNTER); const n = (d[STORAGE_KEYS.EPHEMERAL_COUNTER] || 0) + 1; await browser.storage.local.set({ [STORAGE_KEYS.EPHEMERAL_COUNTER]: n }); return n; }
  return { load, getEphemeralContainers, addEphemeralContainer, removeEphemeralContainer, getSavedContainers, setSavedContainers, addSavedContainer, removeSavedContainer, getGlobalRules, setGlobalRules, addGlobalRule, removeGlobalRule, getContainerRules, setContainerRules, addContainerRule, removeContainerRule, getNextEphemeralNumber };
})();
