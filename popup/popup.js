// Mock browser API for dev preview
if (typeof browser === 'undefined') {
  const MOCK_SAVED = {
    'sc_paypal': { cookieStoreId: 'firefox-container-10', name: 'paypal', color: 'blue', icon: 'fingerprint' },
    'sc_rutracker': { cookieStoreId: 'firefox-container-11', name: 'rutracker', color: 'green', icon: 'briefcase' },
    'sc_amazon': { cookieStoreId: 'firefox-container-12', name: 'amazon', color: 'orange', icon: 'cart' },
  };
  const MOCK_CONTAINERS = {
    'firefox-container-10': { cookieStoreId: 'firefox-container-10', name: 'paypal', color: 'blue', icon: 'fingerprint' },
    'firefox-container-11': { cookieStoreId: 'firefox-container-11', name: 'rutracker', color: 'green', icon: 'briefcase' },
    'firefox-container-12': { cookieStoreId: 'firefox-container-12', name: 'amazon', color: 'orange', icon: 'cart' },
    'firefox-container-20': { cookieStoreId: 'firefox-container-20', name: 'Tmp-042', color: 'pink', icon: 'circle' },
  };
  window.browser = {
    tabs: { query: async () => [{ id: 3, cookieStoreId: 'firefox-container-20', url: 'https://www.ebay.de/shopping' }] },
    contextualIdentities: { get: async (id) => MOCK_CONTAINERS[id] || null },
    storage: { local: { get: async (key) => { if (key === 'sharedProviders') return { sharedProviders: ['paypal.*', 'stripe.com', 'klarna.com', 'accounts.google.com'] }; return {}; } } },
    runtime: {
      sendMessage: async (msg) => {
        if (msg.type === 'getState') return { containers: [], saved: MOCK_SAVED, globalRules: [{ id: 'gr_1', pattern: 'paypal.com', savedContainerId: 'sc_paypal' }, { id: 'gr_2', pattern: 'rutracker.org', savedContainerId: 'sc_rutracker' }, { id: 'gr_3', pattern: 'amazon.*', savedContainerId: 'sc_amazon' }], containerRules: {} };
        if (msg.type === 'getContainerDomains') return { domains: ['ebay.de'] };
        if (msg.type === 'saveEphemeral') { alert(`Saved "${msg.name}"\nGlobal: ${(msg.globalPatterns||[]).join(', ')}\nBound: ${(msg.boundPatterns||[]).join(', ')}`); return { savedId: 'sc_mock' }; }
        return {};
      },
      openOptionsPage: () => { alert('Would open options page'); },
    },
  };
}

document.getElementById('btn-options').addEventListener('click', () => { browser.runtime.openOptionsPage(); });

async function init() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const currentTab = tabs[0];
  if (!currentTab) return;
  const state = await browser.runtime.sendMessage({ type: 'getState' });
  const provData = await browser.storage.local.get(STORAGE_KEYS.SHARED_PROVIDERS);
  const sharedProviders = provData[STORAGE_KEYS.SHARED_PROVIDERS] || ['paypal.*','stripe.com','klarna.com','adyen.com','accounts.google.com','appleid.apple.com','login.microsoftonline.com'];
  const statusEl = document.getElementById('container-status');
  statusEl.replaceChildren();
  const formContainer = document.getElementById('form-container');
  const savedInfo = document.getElementById('saved-info');
  const noContainer = document.getElementById('no-container');
  formContainer.replaceChildren(); savedInfo.classList.add('hidden'); noContainer.classList.add('hidden');
  if (currentTab.cookieStoreId === 'firefox-default') { statusEl.textContent = 'No container'; noContainer.classList.remove('hidden'); return; }
  let container;
  try { container = await browser.contextualIdentities.get(currentTab.cookieStoreId); } catch { statusEl.textContent = 'Unknown container'; return; }
  const dot = document.createElement('span'); dot.className = `status-dot color-${container.color}`;
  const nameSpan = document.createElement('span'); nameSpan.textContent = container.name;
  statusEl.appendChild(dot); statusEl.appendChild(nameSpan);
  const savedIds = new Set(Object.values(state.saved).map(s => s.cookieStoreId));
  const isEphemeral = !savedIds.has(currentTab.cookieStoreId);
  if (isEphemeral) {
    const domainResult = await browser.runtime.sendMessage({ type: 'getContainerDomains', cookieStoreId: currentTab.cookieStoreId });
    new ContainerForm(formContainer, {
      mode: 'create', state, sharedProviders,
      initialName: (() => { try { return new URL(currentTab.url).hostname.replace(/^www\./, ''); } catch { return ''; } })(),
      initialColor: container.color, initialIcon: container.icon || 'circle',
      initialGlobalPatterns: domainResult.domains || [],
      onSave: async (data) => {
        await browser.runtime.sendMessage({ type: 'saveEphemeral', cookieStoreId: currentTab.cookieStoreId, name: data.name, color: data.color, icon: data.icon, globalPatterns: data.globalPatterns, boundPatterns: data.boundPatterns });
        init();
      },
    });
  } else { savedInfo.classList.remove('hidden'); }
}

init();
