// Per-container timezone spoofing
// 1. Reads timezone SYNCHRONOUSLY from localStorage (set on previous page load)
// 2. Falls back to async message to background
// 3. Writes timezone to localStorage for next page load on this domain

(function () {
  'use strict';

  const OrigDate = Date;
  const origGTZO = Date.prototype.getTimezoneOffset;
  const origToStr = Date.prototype.toString;
  const origToTS = Date.prototype.toTimeString;
  const origToLS = Date.prototype.toLocaleString;
  const origToLDS = Date.prototype.toLocaleDateString;
  const origToLTS = Date.prototype.toLocaleTimeString;
  const OrigDTF = Intl.DateTimeFormat;
  const origRO = Intl.DateTimeFormat.prototype.resolvedOptions;

  let TZ = null;
  let TZ_OFFSET = null;

  function activate(tz) {
    TZ = tz;
    try {
      const now = new OrigDate();
      const utc = now.toLocaleString('en-US', { timeZone: 'UTC' });
      const loc = now.toLocaleString('en-US', { timeZone: tz });
      TZ_OFFSET = (new OrigDate(utc) - new OrigDate(loc)) / 60000;
    } catch (e) {
      TZ = null;
      TZ_OFFSET = null;
    }
  }

  // --- SYNCHRONOUS: try localStorage first ---
  try {
    const cached = localStorage.getItem('__ctm_tz');
    if (cached) {
      activate(cached);
    }
  } catch (e) {
    // localStorage may be blocked
  }

  // --- ASYNC: get fresh timezone from background, update localStorage ---
  browser.runtime.sendMessage({ type: 'getTimezone' }).then(response => {
    if (response && response.timezone) {
      activate(response.timezone);
      try {
        localStorage.setItem('__ctm_tz', response.timezone);
      } catch (e) {}
    }
  }).catch(() => {});

  // --- Helper functions ---
  function gmtStr() {
    const s = TZ_OFFSET <= 0 ? '+' : '-';
    const a = Math.abs(TZ_OFFSET);
    return 'GMT' + s + String(Math.floor(a / 60)).padStart(2, '0') + String(a % 60).padStart(2, '0');
  }

  function longName() {
    try {
      const f = new OrigDTF('en-US', { timeZone: TZ, timeZoneName: 'long' });
      const p = f.formatToParts(new OrigDate());
      const t = p.find(x => x.type === 'timeZoneName');
      return t ? t.value : '';
    } catch (e) { return ''; }
  }

  // --- PATCHES (always active, check TZ on each call) ---

  Date.prototype.getTimezoneOffset = exportFunction(function () {
    if (TZ === null) return origGTZO.call(this);
    return TZ_OFFSET;
  }, window);

  Date.prototype.toString = exportFunction(function () {
    if (TZ === null) return origToStr.call(this);
    return origToStr.call(this).replace(/GMT[+-]\d{4}\s*\([^)]*\)/, gmtStr() + ' (' + longName() + ')');
  }, window);

  Date.prototype.toTimeString = exportFunction(function () {
    if (TZ === null) return origToTS.call(this);
    return origToTS.call(this).replace(/GMT[+-]\d{4}\s*\([^)]*\)/, gmtStr() + ' (' + longName() + ')');
  }, window);

  Date.prototype.toLocaleString = exportFunction(function (l, o) {
    if (TZ === null) return origToLS.call(this, l, o);
    const opts = Object.assign({}, o || {}); if (!opts.timeZone) opts.timeZone = TZ;
    return origToLS.call(this, l, opts);
  }, window);

  Date.prototype.toLocaleDateString = exportFunction(function (l, o) {
    if (TZ === null) return origToLDS.call(this, l, o);
    const opts = Object.assign({}, o || {}); if (!opts.timeZone) opts.timeZone = TZ;
    return origToLDS.call(this, l, opts);
  }, window);

  Date.prototype.toLocaleTimeString = exportFunction(function (l, o) {
    if (TZ === null) return origToLTS.call(this, l, o);
    const opts = Object.assign({}, o || {}); if (!opts.timeZone) opts.timeZone = TZ;
    return origToLTS.call(this, l, opts);
  }, window);

  const PatchedDTF = exportFunction(function (locales, options) {
    const opts = Object.assign({}, options || {});
    if (TZ && !opts.timeZone) opts.timeZone = TZ;
    if (new.target) return new OrigDTF(locales, opts);
    return OrigDTF(locales, opts);
  }, window);
  PatchedDTF.prototype = OrigDTF.prototype;
  PatchedDTF.supportedLocalesOf = OrigDTF.supportedLocalesOf;
  Intl.DateTimeFormat = PatchedDTF;

  Intl.DateTimeFormat.prototype.resolvedOptions = exportFunction(function () {
    const r = origRO.call(this);
    if (TZ) r.timeZone = TZ;
    return r;
  }, window);

})();
