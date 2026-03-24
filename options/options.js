// Mock browser API for dev preview
if (typeof browser === 'undefined') {
  const MOCK_SAVED = {
    'sc_paypal': { cookieStoreId: 'firefox-container-10', name: 'paypal', color: 'blue', icon: 'fingerprint' },
    'sc_rutracker': { cookieStoreId: 'firefox-container-11', name: 'rutracker', color: 'green', icon: 'briefcase' },
    'sc_amazon': { cookieStoreId: 'firefox-container-12', name: 'amazon', color: 'orange', icon: 'cart' },
    'sc_ebay': { cookieStoreId: 'firefox-container-13', name: 'eBay', color: 'red', icon: 'dollar' },
  };
  const MOCK_GLOBAL_RULES = [
    { id: 'gr_1', pattern: 'paypal.com', savedContainerId: 'sc_paypal' },
    { id: 'gr_2', pattern: 'rutracker.org', savedContainerId: 'sc_rutracker' },
    { id: 'gr_3', pattern: 'amazon.*', savedContainerId: 'sc_amazon' },
    { id: 'gr_4', pattern: 'ebay.*', savedContainerId: 'sc_ebay' },
  ];
  const MOCK_CONTAINER_RULES = { 'sc_ebay': [{ id: 'cr_1', pattern: 'kleinanzeigen.de' }] };
  window.browser = {
    storage: { local: { get: async (key) => { if (key === 'sharedProviders') return { sharedProviders: ['paypal.*', 'stripe.com', 'klarna.com', 'accounts.google.com'] }; return {}; }, set: async () => {} }, onChanged: { addListener: () => {} } },
    runtime: { sendMessage: async (msg) => {
      if (msg.type === 'getState') return { containers: [], saved: MOCK_SAVED, globalRules: MOCK_GLOBAL_RULES, containerRules: MOCK_CONTAINER_RULES };
      if (msg.type === 'updateContainerRules') { alert(`Update rules for ${msg.savedContainerId}`); return {}; }
      if (msg.type === 'removeSavedContainer') { alert(`Delete container: ${msg.savedContainerId}`); return {}; }
      return {};
    } },
    contextualIdentities: { update: async () => {} },
  };
}

let currentState = null;
let editingContainerId = null;

async function loadState() {
  currentState = await browser.runtime.sendMessage({ type: 'getState' });
  renderSavedContainers();
  renderSharedProviders();
}

function renderSavedContainers() {
  const listEl = document.getElementById('saved-list');
  const noMsg = document.getElementById('no-saved');
  listEl.replaceChildren();
  const entries = Object.entries(currentState.saved);
  noMsg.classList.toggle('hidden', entries.length > 0);
  for (const [id, sc] of entries) {
    const card = document.createElement('div'); card.className = 'container-card';
    const dot = document.createElement('span'); dot.className = `card-dot color-${sc.color}`;
    const name = document.createElement('span'); name.className = 'card-name'; name.textContent = sc.name;
    const globalCount = currentState.globalRules.filter(r => r.savedContainerId === id).length;
    const boundCount = (currentState.containerRules[id] || []).length;
    const rulesInfo = document.createElement('span'); rulesInfo.className = 'card-rules';
    const parts = []; if (globalCount > 0) parts.push(`${globalCount} rule${globalCount !== 1 ? 's' : ''}`); if (boundCount > 0) parts.push(`${boundCount} sharing`);
    rulesInfo.textContent = parts.join(', ') || 'no rules';
    const cog = document.createElement('button'); cog.className = 'card-cog'; cog.textContent = '\u2699'; cog.title = 'Edit container';
    cog.addEventListener('click', () => { if (editingContainerId === id) hideDetail(); else showDetail(id); });
    card.appendChild(dot); card.appendChild(name); card.appendChild(rulesInfo); card.appendChild(cog);
    listEl.appendChild(card);
  }
}

function showDetail(savedId) {
  editingContainerId = savedId;
  const sc = currentState.saved[savedId]; if (!sc) return;
  document.getElementById('main-view').classList.add('hidden');
  document.getElementById('detail-view').classList.remove('hidden');
  const provData = browser.storage.local.get(STORAGE_KEYS.SHARED_PROVIDERS);
  Promise.resolve(provData).then(data => {
    const sharedProviders = data[STORAGE_KEYS.SHARED_PROVIDERS] || ['paypal.*','stripe.com','klarna.com','adyen.com','accounts.google.com','appleid.apple.com','login.microsoftonline.com'];
    const formEl = document.getElementById('detail-form');
    new ContainerForm(formEl, {
      mode: 'edit', state: currentState, sharedProviders, savedContainerId: savedId,
      onCog: () => hideDetail(),
      onSave: async (data) => {
        await browser.contextualIdentities.update(sc.cookieStoreId, { name: data.name, color: data.color, icon: data.icon });
        await browser.runtime.sendMessage({ type: 'updateContainerRules', savedContainerId: savedId, name: data.name, color: data.color, icon: data.icon, globalPatterns: data.globalPatterns, boundPatterns: data.boundPatterns });
        hideDetail(); loadState();
      },
      onDelete: async ({ clearData }) => {
        await browser.runtime.sendMessage({ type: 'removeSavedContainer', savedContainerId: savedId, clearData });
        hideDetail(); loadState();
      },
    });
  });
}

function hideDetail() {
  document.getElementById('detail-view').classList.add('hidden');
  document.getElementById('main-view').classList.remove('hidden');
  editingContainerId = null;
}

const DEFAULT_PROVIDERS = ['paypal.*', 'stripe.com', 'klarna.com', 'adyen.com', 'accounts.google.com', 'appleid.apple.com', 'login.microsoftonline.com'];
async function getProviders() { const d = await browser.storage.local.get(STORAGE_KEYS.SHARED_PROVIDERS); return d[STORAGE_KEYS.SHARED_PROVIDERS] || DEFAULT_PROVIDERS; }
async function saveProviders(p) { await browser.storage.local.set({ [STORAGE_KEYS.SHARED_PROVIDERS]: p }); }

async function renderSharedProviders() {
  const providers = await getProviders();
  const tbody = document.querySelector('#providers-table tbody'); tbody.replaceChildren();
  for (let i = 0; i < providers.length; i++) {
    const tr = document.createElement('tr');
    const tdP = document.createElement('td'); const code = document.createElement('code'); code.textContent = providers[i]; tdP.appendChild(code);
    const tdA = document.createElement('td'); const btn = document.createElement('button'); btn.className = 'btn-danger'; btn.textContent = 'Remove';
    const idx = i; btn.addEventListener('click', async () => { const c = await getProviders(); c.splice(idx, 1); await saveProviders(c); renderSharedProviders(); });
    tdA.appendChild(btn); tr.appendChild(tdP); tr.appendChild(tdA); tbody.appendChild(tr);
  }
}

document.getElementById('add-provider').addEventListener('click', async () => {
  const input = document.getElementById('provider-pattern'); const errorEl = document.getElementById('provider-error');
  const pattern = input.value.trim(); if (!pattern) return;
  if (!MatchPattern.isValid(pattern)) { errorEl.textContent = 'Invalid pattern.'; errorEl.classList.remove('hidden'); return; }
  errorEl.classList.add('hidden'); const providers = await getProviders(); providers.push(pattern); await saveProviders(providers); input.value = ''; renderSharedProviders();
});

document.getElementById('provider-pattern').addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('add-provider').click(); });

document.getElementById('export-btn').addEventListener('click', async () => {
  const statusEl = document.getElementById('import-export-status');
  try {
    const data = await browser.runtime.sendMessage({ type: 'exportData' });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'ctm-backup.json'; a.click();
    URL.revokeObjectURL(url);
    statusEl.textContent = 'Exported successfully.'; statusEl.className = 'success'; statusEl.classList.remove('hidden');
  } catch (e) {
    statusEl.textContent = 'Export failed: ' + e.message; statusEl.className = 'error'; statusEl.classList.remove('hidden');
  }
});

document.getElementById('import-btn').addEventListener('click', () => {
  document.getElementById('import-file').click();
});

document.getElementById('import-file').addEventListener('change', async (e) => {
  const statusEl = document.getElementById('import-export-status');
  const file = e.target.files[0]; if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data.saved || !data.globalRules) throw new Error('Invalid backup file');
    const result = await browser.runtime.sendMessage({ type: 'importData', data });
    statusEl.textContent = `Imported ${result.imported} containers.`; statusEl.className = 'success'; statusEl.classList.remove('hidden');
    loadState();
  } catch (err) {
    statusEl.textContent = 'Import failed: ' + err.message; statusEl.className = 'error'; statusEl.classList.remove('hidden');
  }
  e.target.value = '';
});

loadState();
