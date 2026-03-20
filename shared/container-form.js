const FORM_COLORS = {
  blue: '#37adff', turquoise: '#00c79a', green: '#51cd00', yellow: '#ffcb00',
  orange: '#ff9f00', red: '#ff613d', pink: '#ff4bda', purple: '#af51f5',
};

const FORM_ICONS = [
  'fingerprint', 'briefcase', 'dollar', 'cart', 'circle',
  'gift', 'vacation', 'food', 'fruit', 'pet', 'tree', 'chill', 'fence',
];

class ContainerForm {
  constructor(containerEl, opts) {
    this.el = containerEl;
    this.mode = opts.mode;
    this.state = opts.state;
    this.sharedProviders = opts.sharedProviders || [];
    this.onSave = opts.onSave;
    this.onDelete = opts.onDelete;
    this.onCog = opts.onCog || null;
    this.savedContainerId = opts.savedContainerId || null;
    this.selectedColor = opts.initialColor || 'blue';
    this.selectedIcon = opts.initialIcon || 'fingerprint';
    this.globalPatterns = [...(opts.initialGlobalPatterns || [])];
    this.boundPatterns = [...(opts.initialBoundPatterns || [])];
    this.initialName = opts.initialName || '';
    if (this.mode === 'edit' && this.savedContainerId) {
      const sc = this.state.saved[this.savedContainerId];
      if (sc) { this.selectedColor = sc.color; this.selectedIcon = sc.icon; this.initialName = sc.name; }
      this.globalPatterns = this.state.globalRules.filter(r => r.savedContainerId === this.savedContainerId).map(r => r.pattern);
      this.boundPatterns = (this.state.containerRules[this.savedContainerId] || []).map(r => r.pattern);
    }
    this.render();
  }
  render() {
    this.el.replaceChildren();
    this.el.classList.add('cf-form');
    this._addNameField();
    this._addColorField();
    this._addIconField();
    this._addRulesSection('global', 'Global Rules', 'URLs always opened in this container', this.globalPatterns, 'e.g. amazon.* or site.com');
    this._addRulesSection('bound', 'Context Sharing Rules', 'URLs that share cookies when opened from this container', this.boundPatterns, 'e.g. paypal.* or auth.site.com');
    this._addProvidersSection();
    const btn = document.createElement('button'); btn.className = 'cf-btn-primary';
    btn.textContent = this.mode === 'create' ? 'Save Container' : 'Save Changes';
    btn.addEventListener('click', () => this._handleSave()); this._saveBtn = btn; this.el.appendChild(btn);
    if (this.mode === 'edit' && this.onDelete) {
      const ds = document.createElement('div'); ds.className = 'cf-danger-section';
      const dr = document.createElement('div'); dr.className = 'cf-danger-row';
      const db = document.createElement('button'); db.className = 'cf-btn-danger'; db.textContent = 'Delete Container';
      const cl = document.createElement('label'); cl.className = 'cf-check-label';
      const cb = document.createElement('input'); cb.type = 'checkbox';
      cl.appendChild(cb); cl.appendChild(document.createTextNode(' also clear cookies & data'));
      dr.appendChild(db); dr.appendChild(cl); ds.appendChild(dr);
      db.addEventListener('click', () => {
        const clearData = cb.checked;
        const msg = clearData ? `Delete "${this.initialName}", rules, and all cookies/data?` : `Delete "${this.initialName}" and rules? Cookies kept.`;
        if (confirm(msg)) this.onDelete({ clearData });
      });
      this.el.appendChild(ds);
    }
    this._validate();
  }
  _addNameField() {
    const row = document.createElement('div');
    row.className = 'cf-name-row';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = this.initialName;
    input.placeholder = 'Container name';
    input.addEventListener('input', () => this._validate());
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') this._handleSave(); });
    this._nameInput = input;
    row.appendChild(input);
    if (this.onCog) {
      const cog = document.createElement('button');
      cog.className = 'cf-cog';
      cog.textContent = '\u2699';
      cog.title = 'Container list';
      cog.addEventListener('click', () => this.onCog());
      row.appendChild(cog);
    }
    this.el.appendChild(row);
    const err = document.createElement('p'); err.className = 'cf-error cf-hidden'; this._nameError = err; this.el.appendChild(err);
  }
  _addColorField() {
    const label = document.createElement('label');
    const span = document.createElement('span'); span.className = 'cf-label'; span.textContent = 'Color'; label.appendChild(span);
    const row = document.createElement('div'); row.className = 'cf-color-row';
    for (const [name, hex] of Object.entries(FORM_COLORS)) {
      const swatch = document.createElement('div');
      swatch.className = 'cf-color-swatch' + (name === this.selectedColor ? ' selected' : '');
      swatch.style.background = hex; swatch.title = name;
      swatch.addEventListener('click', () => {
        row.querySelectorAll('.cf-color-swatch').forEach(s => s.classList.remove('selected'));
        swatch.classList.add('selected'); this.selectedColor = name;
      });
      row.appendChild(swatch);
    }
    label.appendChild(row); this.el.appendChild(label);
  }
  _addIconField() {
    const label = document.createElement('label');
    const span = document.createElement('span'); span.className = 'cf-label'; span.textContent = 'Icon'; label.appendChild(span);
    const row = document.createElement('div'); row.className = 'cf-icon-row';
    for (const icon of FORM_ICONS) {
      const opt = document.createElement('div');
      opt.className = 'cf-icon-option' + (icon === this.selectedIcon ? ' selected' : '');
      opt.textContent = icon;
      opt.addEventListener('click', () => {
        row.querySelectorAll('.cf-icon-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected'); this.selectedIcon = icon;
      });
      row.appendChild(opt);
    }
    label.appendChild(row); this.el.appendChild(label);
  }
  _addRulesSection(type, title, hint, patterns, placeholder) {
    const section = document.createElement('div'); section.className = 'cf-rules-section';
    const label = document.createElement('span'); label.className = 'cf-label'; label.textContent = title + ' ';
    const hs = document.createElement('span'); hs.className = 'cf-label-hint'; hs.textContent = hint; label.appendChild(hs); section.appendChild(label);
    if (type === 'global') {
      const help = document.createElement('div'); help.className = 'cf-pattern-help';
      const c1 = document.createElement('code'); c1.textContent = 'amazon.com';
      const c2 = document.createElement('code'); c2.textContent = 'amazon.*';
      const c3 = document.createElement('code'); c3.textContent = 'site.com/path';
      help.appendChild(c1); help.appendChild(document.createTextNode(' \u2014 + subdomains | '));
      help.appendChild(c2); help.appendChild(document.createTextNode(' \u2014 any TLD | '));
      help.appendChild(c3); help.appendChild(document.createTextNode(' \u2014 + subpages'));
      section.appendChild(help);
    }
    const listEl = document.createElement('div'); listEl.className = 'cf-rules-list'; listEl.dataset.type = type; section.appendChild(listEl);
    const addRow = document.createElement('div'); addRow.className = 'cf-rule-add';
    const input = document.createElement('input'); input.type = 'text'; input.placeholder = placeholder;
    const addBtn = document.createElement('button'); addBtn.className = 'cf-btn-add'; addBtn.textContent = '+';
    const errEl = document.createElement('p'); errEl.className = 'cf-error cf-hidden';
    const doAdd = () => {
      const val = input.value.trim(); if (!val) return;
      if (!MatchPattern.isValid(val)) { errEl.textContent = 'Invalid pattern.'; errEl.classList.remove('cf-hidden'); return; }
      errEl.classList.add('cf-hidden'); if (!patterns.includes(val)) patterns.push(val);
      input.value = ''; this._renderChips(listEl, patterns, type); this._validate();
    };
    addBtn.addEventListener('click', doAdd); input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });
    addRow.appendChild(input); addRow.appendChild(addBtn); section.appendChild(addRow); section.appendChild(errEl);
    this.el.appendChild(section); this._renderChips(listEl, patterns, type);
  }
  _addProvidersSection() {
    const section = document.createElement('div'); section.className = 'cf-rules-section';
    const label = document.createElement('span'); label.className = 'cf-label'; label.textContent = 'Shared Providers ';
    const hint = document.createElement('span'); hint.className = 'cf-label-hint'; hint.textContent = 'auto-applied to all saved containers';
    label.appendChild(hint); section.appendChild(label);
    const listEl = document.createElement('div'); listEl.className = 'cf-rules-list readonly';
    for (const p of this.sharedProviders) {
      const chip = document.createElement('span'); chip.className = 'cf-chip';
      const code = document.createElement('code'); code.textContent = p; chip.appendChild(code); listEl.appendChild(chip);
    }
    section.appendChild(listEl); this.el.appendChild(section);
  }
  _renderChips(listEl, patterns, type) {
    listEl.replaceChildren();
    for (let i = 0; i < patterns.length; i++) {
      const chip = document.createElement('span'); chip.className = 'cf-chip';
      if (type === 'global') {
        const conflict = this._findConflict(patterns[i]);
        if (conflict) { chip.classList.add('conflict'); chip.title = `Conflicts with "${conflict.pattern}" in "${conflict.containerName}"`; }
      }
      const code = document.createElement('code'); code.textContent = patterns[i]; chip.appendChild(code);
      const rb = document.createElement('button'); rb.className = 'cf-remove'; rb.textContent = '\u00d7';
      const idx = i; rb.addEventListener('click', () => { patterns.splice(idx, 1); this._renderChips(listEl, patterns, type); this._validate(); });
      chip.appendChild(rb); listEl.appendChild(chip);
    }
  }
  _findConflict(pattern) {
    for (const rule of this.state.globalRules) {
      if (this.savedContainerId && rule.savedContainerId === this.savedContainerId) continue;
      if (MatchPattern.patternsOverlap(pattern, rule.pattern)) {
        const sc = this.state.saved[rule.savedContainerId]; return { pattern: rule.pattern, containerName: sc ? sc.name : '(unknown)' };
      }
    }
    return null;
  }
  _hasAnyConflict() { for (const p of this.globalPatterns) { if (this._findConflict(p)) return true; } return false; }
  _validate() {
    let valid = true;
    if (this._nameInput) {
      const name = this._nameInput.value.trim();
      if (!name) { this._nameError.textContent = 'Name is required.'; this._nameError.classList.remove('cf-hidden'); valid = false; }
      else {
        const dup = Object.entries(this.state.saved).some(([id, s]) => {
          if (this.savedContainerId && id === this.savedContainerId) return false;
          return s.name.toLowerCase() === name.toLowerCase();
        });
        if (dup) { this._nameError.textContent = `"${name}" is already used.`; this._nameError.classList.remove('cf-hidden'); valid = false; }
        else { this._nameError.classList.add('cf-hidden'); }
      }
    }
    if (this._hasAnyConflict()) valid = false;
    if (this._saveBtn) this._saveBtn.disabled = !valid;
    return valid;
  }
  async _handleSave() {
    if (!this._validate()) return; if (!this.onSave) return;
    const data = { color: this.selectedColor, icon: this.selectedIcon, globalPatterns: this.globalPatterns, boundPatterns: this.boundPatterns };
    if (this._nameInput) data.name = this._nameInput.value.trim();
    await this.onSave(data);
  }
}
