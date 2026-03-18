let currentState = null;

async function loadState() {
  currentState = await browser.runtime.sendMessage({ type: 'getState' });
  renderSavedContainers();
  populateContainerSelects();
  renderGlobalRules();
  renderBoundRules();
}

function renderSavedContainers() {
  const tbody = document.querySelector('#saved-table tbody');
  const noMsg = document.getElementById('no-saved');
  tbody.innerHTML = '';

  const entries = Object.entries(currentState.saved);
  noMsg.classList.toggle('hidden', entries.length > 0);
  document.getElementById('saved-table').classList.toggle('hidden', entries.length === 0);

  for (const [id, sc] of entries) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(sc.name)}</td>
      <td>${sc.color}</td>
      <td>${sc.icon}</td>
      <td><button class="btn-danger" data-id="${id}">Delete</button></td>
    `;
    tr.querySelector('button').addEventListener('click', async () => {
      await browser.runtime.sendMessage({ type: 'removeSavedContainer', savedContainerId: id });
      loadState();
    });
    tbody.appendChild(tr);
  }
}

function populateContainerSelects() {
  const selects = [
    document.getElementById('global-container'),
    document.getElementById('bound-container-select'),
  ];
  const entries = Object.entries(currentState.saved);

  for (const select of selects) {
    const currentVal = select.value;
    select.innerHTML = '';
    if (entries.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '(no saved containers)';
      select.appendChild(opt);
    }
    for (const [id, sc] of entries) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = sc.name;
      select.appendChild(opt);
    }
    if (currentVal && [...select.options].some(o => o.value === currentVal)) {
      select.value = currentVal;
    }
  }
}

function renderGlobalRules() {
  const tbody = document.querySelector('#global-rules-table tbody');
  const noMsg = document.getElementById('no-global-rules');
  tbody.innerHTML = '';

  const rules = currentState.globalRules;
  noMsg.classList.toggle('hidden', rules.length > 0);
  document.getElementById('global-rules-table').classList.toggle('hidden', rules.length === 0);

  for (const rule of rules) {
    const sc = currentState.saved[rule.savedContainerId];
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code>${escapeHtml(rule.pattern)}</code></td>
      <td>${sc ? escapeHtml(sc.name) : '(deleted)'}</td>
      <td><button class="btn-danger" data-id="${rule.id}">Delete</button></td>
    `;
    tr.querySelector('button').addEventListener('click', async () => {
      await browser.runtime.sendMessage({ type: 'removeGlobalRule', ruleId: rule.id });
      loadState();
    });
    tbody.appendChild(tr);
  }
}

function renderBoundRules() {
  const tbody = document.querySelector('#bound-rules-table tbody');
  const noMsg = document.getElementById('no-bound-rules');
  const selectedId = document.getElementById('bound-container-select').value;
  tbody.innerHTML = '';

  const rules = (currentState.containerRules[selectedId] || []);
  noMsg.classList.toggle('hidden', rules.length > 0);
  document.getElementById('bound-rules-table').classList.toggle('hidden', rules.length === 0);

  for (const rule of rules) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code>${escapeHtml(rule.pattern)}</code></td>
      <td><button class="btn-danger" data-id="${rule.id}">Delete</button></td>
    `;
    tr.querySelector('button').addEventListener('click', async () => {
      await browser.runtime.sendMessage({
        type: 'removeContainerRule',
        savedContainerId: selectedId,
        ruleId: rule.id,
      });
      loadState();
    });
    tbody.appendChild(tr);
  }
}

// Add global rule
document.getElementById('add-global-rule').addEventListener('click', async () => {
  const patternInput = document.getElementById('global-pattern');
  const containerSelect = document.getElementById('global-container');
  const errorEl = document.getElementById('global-error');
  const pattern = patternInput.value.trim();

  if (!pattern) return;
  if (!MatchPattern.isValid(pattern)) {
    errorEl.textContent = 'Invalid pattern. Use a domain like: amazon.com or google.com/maps';
    errorEl.classList.remove('hidden');
    return;
  }
  if (!containerSelect.value) return;

  errorEl.classList.add('hidden');
  await browser.runtime.sendMessage({
    type: 'addGlobalRule',
    pattern,
    savedContainerId: containerSelect.value,
  });
  patternInput.value = '';
  loadState();
});

// Add container-bound rule
document.getElementById('add-bound-rule').addEventListener('click', async () => {
  const patternInput = document.getElementById('bound-pattern');
  const containerSelect = document.getElementById('bound-container-select');
  const errorEl = document.getElementById('bound-error');
  const pattern = patternInput.value.trim();

  if (!pattern) return;
  if (!MatchPattern.isValid(pattern)) {
    errorEl.textContent = 'Invalid pattern. Use a domain like: paypal.com or stripe.com/checkout';
    errorEl.classList.remove('hidden');
    return;
  }
  if (!containerSelect.value) return;

  errorEl.classList.add('hidden');
  await browser.runtime.sendMessage({
    type: 'addContainerRule',
    savedContainerId: containerSelect.value,
    pattern,
  });
  patternInput.value = '';
  loadState();
});

// Reload bound rules when container selection changes
document.getElementById('bound-container-select').addEventListener('change', renderBoundRules);

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

loadState();
