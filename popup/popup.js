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
    contextualIdentities: { get: async (id) => MOCK_CONTAINERS[id] || null, update: async () => {} },
    storage: { local: { get: async (key) => { if (key === 'sharedProviders') return { sharedProviders: ['paypal.*', 'stripe.com', 'klarna.com', 'accounts.google.com'] }; return {}; }, set: async () => {} } },
    runtime: {
      sendMessage: async (msg) => {
        if (msg.type === 'getState') return { containers: [], saved: MOCK_SAVED, globalRules: [{ id: 'gr_1', pattern: 'paypal.com', savedContainerId: 'sc_paypal' }, { id: 'gr_2', pattern: 'rutracker.org', savedContainerId: 'sc_rutracker' }, { id: 'gr_3', pattern: 'amazon.*', savedContainerId: 'sc_amazon' }], containerRules: {} };
        if (msg.type === 'getContainerDomains') return { domains: ['ebay.de'] };
        if (msg.type === 'saveEphemeral') { alert(`Saved "${msg.name}"\nGlobal: ${(msg.globalPatterns||[]).join(', ')}\nBound: ${(msg.boundPatterns||[]).join(', ')}`); return { savedId: 'sc_mock' }; }
        if (msg.type === 'updateContainerRules') { alert(`Update rules for ${msg.savedContainerId}`); return {}; }
        if (msg.type === 'removeSavedContainer') { alert(`Delete ${msg.savedContainerId}`); return {}; }
        return {};
      },
    },
  };
}

let cachedState = null;
let sharedProviders = [];
let currentTab = null;

// --- View switching ---

function showFormView() {
  document.getElementById('form-view').classList.remove('hidden');
  document.getElementById('list-view').classList.add('hidden');
}

function showListView() {
  document.getElementById('form-view').classList.add('hidden');
  document.getElementById('list-view').classList.remove('hidden');
  renderSavedList();
  renderTempList();
  renderProviders();
}

// Collapsible toggles
document.getElementById('toggle-saved').addEventListener('click', () => {
  const body = document.getElementById('saved-body');
  const tri = document.querySelector('#toggle-saved .triangle');
  body.classList.toggle('hidden');
  tri.classList.toggle('collapsed');
});

document.getElementById('toggle-temp').addEventListener('click', () => {
  const body = document.getElementById('temp-body');
  const tri = document.querySelector('#toggle-temp .triangle');
  body.classList.toggle('hidden');
  tri.classList.toggle('collapsed');
});

// Back button in list → return to current tab's form
document.getElementById('btn-back').addEventListener('click', () => {
  showFormView();
  showFormForCurrentTab();
});

// --- Form: render for any container (create or edit) ---

async function showFormForCurrentTab() {
  const formContainer = document.getElementById('form-container');
  const noContainer = document.getElementById('no-container');
  formContainer.replaceChildren();
  noContainer.classList.add('hidden');

  if (!currentTab) return;

  if (currentTab.cookieStoreId === 'firefox-default') {
    noContainer.classList.remove('hidden');
    return;
  }

  let container;
  try {
    container = await browser.contextualIdentities.get(currentTab.cookieStoreId);
  } catch {
    noContainer.classList.remove('hidden');
    return;
  }

  const savedIds = new Set(Object.values(cachedState.saved).map(s => s.cookieStoreId));
  const isEphemeral = !savedIds.has(currentTab.cookieStoreId);

  if (isEphemeral) {
    const domainResult = await browser.runtime.sendMessage({
      type: 'getContainerDomains',
      cookieStoreId: currentTab.cookieStoreId,
    });
    showForm(formContainer, {
      mode: 'create',
      initialName: (() => { try { return new URL(currentTab.url).hostname.replace(/^www\./, ''); } catch { return ''; } })(),
      initialColor: container.color,
      initialIcon: container.icon || 'circle',
      initialGlobalPatterns: domainResult.domains || [],
      onSave: async (data) => {
        await browser.runtime.sendMessage({
          type: 'saveEphemeral',
          cookieStoreId: currentTab.cookieStoreId,
          name: data.name, color: data.color, icon: data.icon,
          globalPatterns: data.globalPatterns, boundPatterns: data.boundPatterns,
        });
        cachedState = await browser.runtime.sendMessage({ type: 'getState' });
        showFormForCurrentTab();
      },
    });
  } else {
    // Current tab is in a saved container — show edit form
    const savedId = Object.entries(cachedState.saved).find(([, sc]) => sc.cookieStoreId === currentTab.cookieStoreId)?.[0];
    if (savedId) {
      showFormForSavedContainer(formContainer, savedId);
    }
  }
}

function showFormForSavedContainer(formContainer, savedId) {
  const sc = cachedState.saved[savedId];
  if (!sc) return;

  showForm(formContainer, {
    mode: 'edit',
    savedContainerId: savedId,
    onSave: async (data) => {
      await browser.contextualIdentities.update(sc.cookieStoreId, {
        name: data.name, color: data.color, icon: data.icon,
      });
      await browser.runtime.sendMessage({
        type: 'updateContainerRules',
        savedContainerId: savedId,
        name: data.name, color: data.color, icon: data.icon,
        globalPatterns: data.globalPatterns, boundPatterns: data.boundPatterns,
      });
      cachedState = await browser.runtime.sendMessage({ type: 'getState' });
      showFormView();
    },
    onDelete: async ({ clearData }) => {
      await browser.runtime.sendMessage({
        type: 'removeSavedContainer',
        savedContainerId: savedId,
        clearData,
      });
      cachedState = await browser.runtime.sendMessage({ type: 'getState' });
      showListView();
    },
  });
}

function showForm(formContainer, opts) {
  new ContainerForm(formContainer, {
    mode: opts.mode,
    state: cachedState,
    sharedProviders,
    savedContainerId: opts.savedContainerId || null,
    initialName: opts.initialName,
    initialColor: opts.initialColor,
    initialIcon: opts.initialIcon,
    initialGlobalPatterns: opts.initialGlobalPatterns,
    onCog: () => showListView(),
    onSave: opts.onSave,
    onDelete: opts.onDelete,
  });
}

// --- List view ---

function renderSavedList() {
  const listEl = document.getElementById('saved-list');
  const noMsg = document.getElementById('no-saved');
  listEl.replaceChildren();

  const entries = Object.entries(cachedState.saved);
  noMsg.classList.toggle('hidden', entries.length > 0);

  for (const [id, sc] of entries) {
    const card = document.createElement('div');
    card.className = 'container-card';

    const dot = document.createElement('span');
    dot.className = `card-dot color-${sc.color}`;

    const name = document.createElement('span');
    name.className = 'card-name';
    name.textContent = sc.name;

    const globalCount = cachedState.globalRules.filter(r => r.savedContainerId === id).length;
    const boundCount = (cachedState.containerRules[id] || []).length;
    const rulesInfo = document.createElement('span');
    rulesInfo.className = 'card-rules';
    const parts = [];
    if (globalCount > 0) parts.push(`${globalCount} rule${globalCount !== 1 ? 's' : ''}`);
    if (boundCount > 0) parts.push(`${boundCount} sharing`);
    rulesInfo.textContent = parts.join(', ') || 'no rules';

    const cog = document.createElement('button');
    cog.className = 'card-cog';
    cog.textContent = '\u2699';
    cog.title = 'Edit container';
    cog.addEventListener('click', () => {
      showFormView();
      const formContainer = document.getElementById('form-container');
      formContainer.replaceChildren();
      showFormForSavedContainer(formContainer, id);
    });

    card.appendChild(dot);
    card.appendChild(name);
    card.appendChild(rulesInfo);
    card.appendChild(cog);
    listEl.appendChild(card);
  }
}

function renderTempList() {
  const listEl = document.getElementById('temp-list');
  const noMsg = document.getElementById('no-temp');
  listEl.replaceChildren();

  const ephemeralContainers = cachedState.containers.filter(c => c.isEphemeral && c.tabCount > 0);
  noMsg.classList.toggle('hidden', ephemeralContainers.length > 0);

  for (const ec of ephemeralContainers) {
    const card = document.createElement('div');
    card.className = 'container-card';

    const dot = document.createElement('span');
    dot.className = `card-dot color-${ec.color || 'toolbar'}`;

    const name = document.createElement('span');
    name.className = 'card-name';
    name.textContent = ec.name || ec.cookieStoreId;

    const count = document.createElement('span');
    count.className = 'card-rules';
    count.textContent = `${ec.tabCount} tab${ec.tabCount !== 1 ? 's' : ''}`;

    const cog = document.createElement('button');
    cog.className = 'card-cog';
    cog.textContent = '\u2699';
    cog.title = 'Save container';
    cog.addEventListener('click', () => {
      showFormView();
      const formContainer = document.getElementById('form-container');
      formContainer.replaceChildren();
      showForm(formContainer, {
        mode: 'create',
        initialName: ec.name || '',
        initialColor: ec.color || 'blue',
        initialIcon: 'circle',
        initialGlobalPatterns: [],
        cookieStoreId: ec.cookieStoreId,
        onSave: async (data) => {
          await browser.runtime.sendMessage({
            type: 'saveEphemeral',
            cookieStoreId: ec.cookieStoreId,
            name: data.name, color: data.color, icon: data.icon,
            globalPatterns: data.globalPatterns, boundPatterns: data.boundPatterns,
          });
          cachedState = await browser.runtime.sendMessage({ type: 'getState' });
          showFormForCurrentTab();
        },
      });
    });

    card.appendChild(dot);
    card.appendChild(name);
    card.appendChild(count);
    card.appendChild(cog);
    listEl.appendChild(card);
  }
}

function renderProviders() {
  const listEl = document.getElementById('provider-list');
  listEl.replaceChildren();
  for (let i = 0; i < sharedProviders.length; i++) {
    const chip = document.createElement('span');
    chip.className = 'provider-chip';
    const code = document.createElement('code');
    code.textContent = sharedProviders[i];
    chip.appendChild(code);
    const removeBtn = document.createElement('button');
    removeBtn.className = 'provider-remove';
    removeBtn.textContent = '\u00d7';
    const idx = i;
    removeBtn.addEventListener('click', async () => {
      sharedProviders.splice(idx, 1);
      await browser.storage.local.set({ [STORAGE_KEYS.SHARED_PROVIDERS]: sharedProviders });
      renderProviders();
    });
    chip.appendChild(removeBtn);
    listEl.appendChild(chip);
  }
}

document.getElementById('btn-add-provider').addEventListener('click', addProvider);
document.getElementById('provider-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addProvider();
});

async function addProvider() {
  const input = document.getElementById('provider-input');
  const pattern = input.value.trim();
  if (!pattern || !MatchPattern.isValid(pattern)) return;
  if (!sharedProviders.includes(pattern)) {
    sharedProviders.push(pattern);
    await browser.storage.local.set({ [STORAGE_KEYS.SHARED_PROVIDERS]: sharedProviders });
  }
  input.value = '';
  renderProviders();
}

// --- Init ---

async function init() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  currentTab = tabs[0];
  if (!currentTab) return;

  cachedState = await browser.runtime.sendMessage({ type: 'getState' });

  const provData = await browser.storage.local.get(STORAGE_KEYS.SHARED_PROVIDERS);
  sharedProviders = provData[STORAGE_KEYS.SHARED_PROVIDERS] ||
    ['paypal.*','stripe.com','klarna.com','adyen.com','accounts.google.com','appleid.apple.com','login.microsoftonline.com'];

  showFormForCurrentTab();

  const manifest = browser.runtime.getManifest();
  document.getElementById('version').textContent = 'v' + manifest.version;
}

init();
