// Per-container timezone spoofing based on IP geolocation
// Runs at document_start to patch Date/Intl prototypes before page scripts execute

(function () {
  'use strict';

  // --- Timezone state (updated async, patches applied immediately) ---
  let spoofedTimezone = null;

  // Save original functions before any patching
  const OrigDate = Date;
  const origGetTimezoneOffset = Date.prototype.getTimezoneOffset;
  const origToString = Date.prototype.toString;
  const origToTimeString = Date.prototype.toTimeString;
  const origToLocaleString = Date.prototype.toLocaleString;
  const origToLocaleDateString = Date.prototype.toLocaleDateString;
  const origToLocaleTimeString = Date.prototype.toLocaleTimeString;
  const OrigDateTimeFormat = Intl.DateTimeFormat;
  const origResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;

  // Compute UTC offset in minutes for a given IANA timezone
  // Returns the value that getTimezoneOffset() should return (UTC - local, in minutes)
  function getOffsetForTimezone(tz) {
    try {
      const now = new OrigDate();
      const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' });
      const tzStr = now.toLocaleString('en-US', { timeZone: tz });
      return (new OrigDate(utcStr) - new OrigDate(tzStr)) / 60000;
    } catch (e) {
      return origGetTimezoneOffset.call(new OrigDate());
    }
  }

  // Get short timezone abbreviation (e.g. "CET", "EST")
  function getTimezoneAbbr(tz) {
    try {
      const fmt = new OrigDateTimeFormat('en-US', {
        timeZone: tz,
        timeZoneName: 'short'
      });
      const parts = fmt.formatToParts(new OrigDate());
      const tzPart = parts.find(p => p.type === 'timeZoneName');
      return tzPart ? tzPart.value : '';
    } catch (e) {
      return '';
    }
  }

  // Get long timezone name (e.g. "Central European Standard Time")
  function getTimezoneLong(tz) {
    try {
      const fmt = new OrigDateTimeFormat('en-US', {
        timeZone: tz,
        timeZoneName: 'long'
      });
      const parts = fmt.formatToParts(new OrigDate());
      const tzPart = parts.find(p => p.type === 'timeZoneName');
      return tzPart ? tzPart.value : '';
    } catch (e) {
      return '';
    }
  }

  // Format offset as +HHMM or -HHMM string
  function formatGMTOffset(offsetMinutes) {
    const sign = offsetMinutes <= 0 ? '+' : '-';
    const abs = Math.abs(offsetMinutes);
    const h = String(Math.floor(abs / 60)).padStart(2, '0');
    const m = String(abs % 60).padStart(2, '0');
    return 'GMT' + sign + h + m;
  }

  // --- Request timezone info from background ---
  browser.runtime.sendMessage({ type: 'getTimezone' }).then(response => {
    if (response && response.timezone) {
      spoofedTimezone = response.timezone;
    }
  }).catch(() => {
    // Extension context invalidated — leave timezone as null (no spoofing)
  });

  // --- Patch Date.prototype.getTimezoneOffset ---
  function patchedGetTimezoneOffset() {
    if (!spoofedTimezone) return origGetTimezoneOffset.call(this);
    return getOffsetForTimezone(spoofedTimezone);
  }
  Date.prototype.getTimezoneOffset = exportFunction(patchedGetTimezoneOffset, window);

  // --- Patch Date.prototype.toString ---
  function patchedToString() {
    if (!spoofedTimezone) return origToString.call(this);
    const str = origToString.call(this);
    // Replace timezone portion: e.g. "GMT+0100 (Central European Standard Time)"
    const gmtStr = formatGMTOffset(getOffsetForTimezone(spoofedTimezone));
    const longName = getTimezoneLong(spoofedTimezone);
    return str.replace(/GMT[+-]\d{4}\s*\([^)]*\)/, gmtStr + ' (' + longName + ')');
  }
  Date.prototype.toString = exportFunction(patchedToString, window);

  // --- Patch Date.prototype.toTimeString ---
  function patchedToTimeString() {
    if (!spoofedTimezone) return origToTimeString.call(this);
    const str = origToTimeString.call(this);
    const gmtStr = formatGMTOffset(getOffsetForTimezone(spoofedTimezone));
    const longName = getTimezoneLong(spoofedTimezone);
    return str.replace(/GMT[+-]\d{4}\s*\([^)]*\)/, gmtStr + ' (' + longName + ')');
  }
  Date.prototype.toTimeString = exportFunction(patchedToTimeString, window);

  // --- Patch Date.prototype.toLocaleString / toLocaleDateString / toLocaleTimeString ---
  function patchedToLocaleString(locales, options) {
    if (!spoofedTimezone) return origToLocaleString.call(this, locales, options);
    const opts = Object.assign({}, options || {});
    if (!opts.timeZone) opts.timeZone = spoofedTimezone;
    return origToLocaleString.call(this, locales, opts);
  }
  Date.prototype.toLocaleString = exportFunction(patchedToLocaleString, window);

  function patchedToLocaleDateString(locales, options) {
    if (!spoofedTimezone) return origToLocaleDateString.call(this, locales, options);
    const opts = Object.assign({}, options || {});
    if (!opts.timeZone) opts.timeZone = spoofedTimezone;
    return origToLocaleDateString.call(this, locales, opts);
  }
  Date.prototype.toLocaleDateString = exportFunction(patchedToLocaleDateString, window);

  function patchedToLocaleTimeString(locales, options) {
    if (!spoofedTimezone) return origToLocaleTimeString.call(this, locales, options);
    const opts = Object.assign({}, options || {});
    if (!opts.timeZone) opts.timeZone = spoofedTimezone;
    return origToLocaleTimeString.call(this, locales, opts);
  }
  Date.prototype.toLocaleTimeString = exportFunction(patchedToLocaleTimeString, window);

  // --- Patch Intl.DateTimeFormat ---
  function PatchedDateTimeFormat(locales, options) {
    const opts = Object.assign({}, options || {});
    if (spoofedTimezone && !opts.timeZone) {
      opts.timeZone = spoofedTimezone;
    }
    // Support both `new Intl.DateTimeFormat()` and `Intl.DateTimeFormat()` calls
    if (new.target) {
      return new OrigDateTimeFormat(locales, opts);
    }
    return OrigDateTimeFormat(locales, opts);
  }

  // Copy static properties and prototype
  PatchedDateTimeFormat.prototype = OrigDateTimeFormat.prototype;
  PatchedDateTimeFormat.supportedLocalesOf = OrigDateTimeFormat.supportedLocalesOf;

  Intl.DateTimeFormat = exportFunction(PatchedDateTimeFormat, window);

  // --- Patch Intl.DateTimeFormat.prototype.resolvedOptions ---
  function patchedResolvedOptions() {
    const resolved = origResolvedOptions.call(this);
    if (spoofedTimezone) {
      resolved.timeZone = spoofedTimezone;
    }
    return resolved;
  }
  Intl.DateTimeFormat.prototype.resolvedOptions = exportFunction(patchedResolvedOptions, window);

})();
