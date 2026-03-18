const PageActionIndicator = (() => {
  const COLOR_HEX = { blue: '#37adff', turquoise: '#00c79a', green: '#51cd00', yellow: '#ffcb00', orange: '#ff9f00', red: '#ff613d', pink: '#ff4bda', purple: '#af51f5', toolbar: '#7c7c7d' };
  const DEFAULT_COLOR = '#888888';
  const iconCache = new Map();
  const pendingUpdates = new Map();
  function generateIcon(hexColor, size, saved) {
    const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d'); const center = size / 2; const radius = size / 2 - 1;
    if (saved) { ctx.beginPath(); ctx.arc(center, center, radius, 0, Math.PI * 2); ctx.fillStyle = hexColor; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(center, center, radius - 1.5, 0, Math.PI * 2); ctx.strokeStyle = hexColor; ctx.lineWidth = 3; ctx.stroke(); }
    return ctx.getImageData(0, 0, size, size);
  }
  function getIconData(colorName, saved) {
    const key = `${colorName}-${saved ? 's' : 'e'}`;
    if (iconCache.has(key)) return iconCache.get(key);
    const hex = COLOR_HEX[colorName] || DEFAULT_COLOR;
    const data = { 16: generateIcon(hex, 16, saved), 32: generateIcon(hex, 32, saved) };
    iconCache.set(key, data); return data;
  }
  function updateTab(tabId) {
    const existing = pendingUpdates.get(tabId); if (existing) clearTimeout(existing);
    const timeoutId = setTimeout(() => { pendingUpdates.delete(tabId); _doUpdate(tabId); }, 100);
    pendingUpdates.set(tabId, timeoutId);
  }
  async function _doUpdate(tabId) {
    try {
      const tab = await browser.tabs.get(tabId);
      let color = 'toolbar'; let saved = false; let label = 'No container';
      if (tab.cookieStoreId !== 'firefox-default') {
        try { const c = await browser.contextualIdentities.get(tab.cookieStoreId); color = c.color; saved = !ContainerManager.isEphemeral(tab.cookieStoreId); label = saved ? c.name : `${c.name} (ephemeral)`; } catch { return; }
      }
      const iconData = getIconData(color, saved);
      await browser.browserAction.setIcon({ tabId, imageData: iconData });
      await browser.browserAction.setTitle({ tabId, title: `Container: ${label}` });
    } catch {}
  }
  async function updateAllTabs() { const tabs = await browser.tabs.query({}); for (const tab of tabs) updateTab(tab.id); }
  function setup() {
    browser.tabs.onActivated.addListener((ai) => { updateTab(ai.tabId); });
    browser.tabs.onUpdated.addListener((tabId, ci) => { if (ci.status === 'complete' || ci.url) updateTab(tabId); });
    updateAllTabs();
  }
  return { setup, updateTab, updateAllTabs };
})();
