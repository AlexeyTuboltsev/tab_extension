let savingCookieStoreId = null;

document.getElementById('btn-options').addEventListener('click', () => {
  browser.runtime.openOptionsPage();
});

document.getElementById('save-cancel').addEventListener('click', () => {
  document.getElementById('save-dialog').classList.add('hidden');
  savingCookieStoreId = null;
});

document.getElementById('save-confirm').addEventListener('click', async () => {
  if (!savingCookieStoreId) return;
  const name = document.getElementById('save-name').value.trim();
  if (!name) return;
  const color = document.getElementById('save-color').value;
  const icon = document.getElementById('save-icon').value;
  await browser.runtime.sendMessage({
    type: 'saveEphemeral',
    cookieStoreId: savingCookieStoreId,
    name, color, icon,
  });
  document.getElementById('save-dialog').classList.add('hidden');
  savingCookieStoreId = null;
  loadContainers();
});

async function loadContainers() {
  const state = await browser.runtime.sendMessage({ type: 'getState' });
  const list = document.getElementById('container-list');
  list.innerHTML = '';

  if (state.containers.length === 0) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:#888">No active containers</div>';
    return;
  }

  // Sort: saved first, then ephemeral; within each group by name
  const savedIds = new Set(Object.values(state.saved).map(s => s.cookieStoreId));
  state.containers.sort((a, b) => {
    const aSaved = savedIds.has(a.cookieStoreId);
    const bSaved = savedIds.has(b.cookieStoreId);
    if (aSaved !== bSaved) return aSaved ? -1 : 1;
    return (a.name || '').localeCompare(b.name || '');
  });

  for (const container of state.containers) {
    const item = document.createElement('div');
    item.className = 'container-item';

    const header = document.createElement('div');
    header.className = 'container-header';

    const dot = document.createElement('span');
    dot.className = `color-dot color-${container.color || 'toolbar'}`;

    const name = document.createElement('span');
    name.className = 'container-name';
    name.textContent = container.name || container.cookieStoreId;

    const count = document.createElement('span');
    count.className = 'tab-count';
    count.textContent = `${container.tabCount} tab${container.tabCount !== 1 ? 's' : ''}`;

    const actions = document.createElement('span');
    actions.className = 'container-actions';

    if (container.isEphemeral) {
      const saveBtn = document.createElement('button');
      saveBtn.textContent = 'Save';
      saveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        savingCookieStoreId = container.cookieStoreId;
        document.getElementById('save-name').value = '';
        document.getElementById('save-color').value = container.color || 'blue';
        document.getElementById('save-dialog').classList.remove('hidden');
        document.getElementById('save-name').focus();
      });
      actions.appendChild(saveBtn);
    }

    header.appendChild(dot);
    header.appendChild(name);
    header.appendChild(count);
    header.appendChild(actions);

    const tabList = document.createElement('div');
    tabList.className = 'tab-list';

    header.addEventListener('click', async () => {
      const isExpanded = tabList.classList.contains('expanded');
      if (isExpanded) {
        tabList.classList.remove('expanded');
      } else {
        // Load tabs on expand
        const result = await browser.runtime.sendMessage({
          type: 'getTabsForContainer',
          cookieStoreId: container.cookieStoreId,
        });
        tabList.innerHTML = '';
        for (const tab of result.tabs) {
          const entry = document.createElement('div');
          entry.className = 'tab-entry';
          if (tab.favIconUrl) {
            const favicon = document.createElement('img');
            favicon.className = 'tab-favicon';
            favicon.src = tab.favIconUrl;
            favicon.onerror = () => { favicon.style.display = 'none'; };
            entry.appendChild(favicon);
          }
          const title = document.createTextNode(tab.title || tab.url || 'New Tab');
          entry.appendChild(title);
          entry.addEventListener('click', (e) => {
            e.stopPropagation();
            browser.runtime.sendMessage({ type: 'switchToTab', tabId: tab.id });
          });
          tabList.appendChild(entry);
        }
        tabList.classList.add('expanded');
      }
    });

    item.appendChild(header);
    item.appendChild(tabList);
    list.appendChild(item);
  }
}

loadContainers();
