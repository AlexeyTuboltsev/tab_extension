// Unified per-container environment: timezone + fingerprint profile
// Reads config synchronously from cookie at document_start, then injects
// overrides into the page context via <script> tag (exportFunction broke in FF 148+).

(function () {
  'use strict';

  // --- Read config from cookie synchronously ---
  let config = null;
  try {
    const cookies = document.cookie.split(';');
    for (const c of cookies) {
      const trimmed = c.trim();
      if (trimmed.startsWith('__ctm_env=')) {
        const raw = trimmed.slice('__ctm_env='.length);
        config = JSON.parse(decodeURIComponent(raw));
        // Delay cookie deletion so iframes can also read it
        setTimeout(function () {
          document.cookie = '__ctm_env=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
        }, 3000);
        break;
      }
    }
  } catch (e) {
    // Cookie parse failed — fall through to async
  }

  // --- Inject overrides into page context via <script> tag ---
  function injectPageScript(configJSON) {
    const script = document.createElement('script');
    script.textContent = `(${pageOverrides.toString()})(${configJSON});`;
    (document.documentElement || document.head || document.body).appendChild(script);
    script.remove();
  }

  // This function runs in the PAGE context (not content script).
  // It receives the config object as its argument.
  // Uses method shorthand for non-constructable methods that pass CreepJS lie detection.
  function pageOverrides(cfg) {
    var TZ = cfg ? (cfg.tz || null) : null;
    var TZ_OFFSET = cfg ? (cfg.off != null ? cfg.off : null) : null;
    var GMT_STRING = cfg ? (cfg.gmt || null) : null;
    var TZ_LONG_NAME = cfg ? (cfg.ln || '') : '';
    var seed = cfg ? (cfg.seed || 0) : 0;

    // =============================================
    // LIE DETECTION EVASION
    // =============================================
    // CreepJS checks: toString(), property descriptors, 'prototype' in fn,
    // new fn() TypeError, class extends TypeError, own property keys.
    // Method shorthand creates non-constructable functions without .prototype.
    // Object.defineProperty with enumerable:false matches native descriptors.

    var nativeFns = new Map();
    var origToString = Function.prototype.toString;
    // Cross-realm symbol: Symbol.for() returns the SAME symbol in every realm,
    // so toString can identify patched functions even across iframe boundaries.
    var CTM_NATIVE = Symbol.for('__ctm_n');

    // Helper: install a method on a prototype, matching native property descriptors
    function defMethod(obj, name, fn) {
      Object.defineProperty(obj, name, {
        value: fn,
        writable: true,
        configurable: true,
        enumerable: false
      });
      nativeFns.set(fn, name);
      // Mark function with cross-realm symbol for cross-iframe toString calls
      try { Object.defineProperty(fn, CTM_NATIVE, { value: name, configurable: false, enumerable: false }); } catch (e) {}
    }

    // Patch Function.prototype.toString (method shorthand = non-constructable)
    defMethod(Function.prototype, 'toString', {
      toString() {
        if (nativeFns.has(this)) {
          return 'function ' + nativeFns.get(this) + '() {\n    [native code]\n}';
        }
        // Cross-realm fallback: check for the global symbol marker
        var crossName = this[CTM_NATIVE];
        if (crossName) {
          return 'function ' + crossName + '() {\n    [native code]\n}';
        }
        return origToString.call(this);
      }
    }.toString);

    // Firefox-specific toSource
    if (typeof Function.prototype.toSource === 'function') {
      var origToSource = Function.prototype.toSource;
      defMethod(Function.prototype, 'toSource', {
        toSource() {
          if (nativeFns.has(this)) {
            return 'function ' + nativeFns.get(this) + '() {\n    [native code]\n}';
          }
          var crossName = this[CTM_NATIVE];
          if (crossName) {
            return 'function ' + crossName + '() {\n    [native code]\n}';
          }
          return origToSource.call(this);
        }
      }.toSource);
    }

    // =============================================
    // TIMEZONE ENVIRONMENT
    // =============================================

    var OrigDate = Date;
    var origToLS = Date.prototype.toLocaleString;
    var origToLDS = Date.prototype.toLocaleDateString;
    var origToLTS = Date.prototype.toLocaleTimeString;
    var OrigDTF = Intl.DateTimeFormat;
    var origRO = Intl.DateTimeFormat.prototype.resolvedOptions;

    if (TZ !== null) {
      // --- Date constructor wrapper ---
      // Compute real system offset (in ms) for Date.parse adjustment.
      // Date.parse interprets ambiguous strings with real TZ; we need to shift to spoofed TZ.
      var origParse = OrigDate.parse;
      var REAL_OFFSET_MS = origParse('2026-01-15T00:00:00') - origParse('2026-01-15T00:00:00Z');
      var SPOOF_OFFSET_MS = TZ_OFFSET * 60000;
      var PARSE_ADJUST = SPOOF_OFFSET_MS - REAL_OFFSET_MS;
      // Regex: string has explicit timezone → no adjustment needed
      var HAS_TZ_RE = /[Zz]$|[+-]\d{2}:?\d{2}$|\sGMT|\sUTC/;
      // ISO date-only strings (e.g. "2026-03-23") are UTC per ECMA spec — no local component
      var ISO_DATE_ONLY = /^\d{4}(-\d{2}(-\d{2})?)?$/;

      function adjustedParse(str) {
        var result = origParse(str);
        if (typeof str === 'string' && !isNaN(result) && !HAS_TZ_RE.test(str) && !ISO_DATE_ONLY.test(str)) {
          result += PARSE_ADJUST;
        }
        return result;
      }

      Date = function () {
        var d;
        if (!(this instanceof Date) && !new.target) {
          return new OrigDate().toString();
        }
        var a = arguments;
        if (a.length === 0) {
          d = new OrigDate();
        } else if (a.length === 1) {
          // String args go through adjustedParse to fix timezone interpretation
          if (typeof a[0] === 'string') {
            d = new OrigDate(adjustedParse(a[0]));
          } else {
            d = new OrigDate(a[0]);
          }
        } else {
          d = new OrigDate(OrigDate.UTC(
            a[0], a[1], a[2] || 1, a[3] || 0, a[4] || 0, a[5] || 0, a[6] || 0
          ) + TZ_OFFSET * 60000);
        }
        return d;
      };
      Date.prototype = OrigDate.prototype;
      Date.prototype.constructor = Date;
      Date.now = OrigDate.now;
      Date.parse = adjustedParse;
      Date.UTC = OrigDate.UTC;
      // Native Date.length is 7
      Object.defineProperty(Date, 'length', { value: 7, configurable: true });
      nativeFns.set(Date, 'Date');

      // Shared helpers for string formatting
      var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
      var dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      var monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      // All Date prototype methods as method shorthand (non-constructable, no .prototype)
      // Setter params match native .length values
      var tzMethods = {
        getTimezoneOffset() { return TZ_OFFSET; },
        toString() {
          var utc = this.getTime();
          var local = new OrigDate(utc - TZ_OFFSET * 60000);
          return dayNames[local.getUTCDay()] + ' ' + monthNames[local.getUTCMonth()] + ' ' +
            pad(local.getUTCDate()) + ' ' + local.getUTCFullYear() + ' ' +
            pad(local.getUTCHours()) + ':' + pad(local.getUTCMinutes()) + ':' +
            pad(local.getUTCSeconds()) + ' ' + GMT_STRING + ' (' + TZ_LONG_NAME + ')';
        },
        toTimeString() {
          var local = new OrigDate(this.getTime() - TZ_OFFSET * 60000);
          return pad(local.getUTCHours()) + ':' + pad(local.getUTCMinutes()) + ':' +
            pad(local.getUTCSeconds()) + ' ' + GMT_STRING + ' (' + TZ_LONG_NAME + ')';
        },
        toDateString() {
          var local = new OrigDate(this.getTime() - TZ_OFFSET * 60000);
          return dayNames[local.getUTCDay()] + ' ' + monthNames[local.getUTCMonth()] + ' ' +
            pad(local.getUTCDate()) + ' ' + local.getUTCFullYear();
        },
        getFullYear() { return new OrigDate(this.getTime() - TZ_OFFSET * 60000).getUTCFullYear(); },
        getMonth() { return new OrigDate(this.getTime() - TZ_OFFSET * 60000).getUTCMonth(); },
        getDate() { return new OrigDate(this.getTime() - TZ_OFFSET * 60000).getUTCDate(); },
        getDay() { return new OrigDate(this.getTime() - TZ_OFFSET * 60000).getUTCDay(); },
        getHours() { return new OrigDate(this.getTime() - TZ_OFFSET * 60000).getUTCHours(); },
        getMinutes() { return new OrigDate(this.getTime() - TZ_OFFSET * 60000).getUTCMinutes(); },
        getSeconds() { return new OrigDate(this.getTime() - TZ_OFFSET * 60000).getUTCSeconds(); },
        getMilliseconds() { return new OrigDate(this.getTime() - TZ_OFFSET * 60000).getUTCMilliseconds(); },
        setFullYear(y, m, d) { var l = new OrigDate(this.getTime() - TZ_OFFSET * 60000); l.setUTCFullYear.apply(l, arguments); this.setTime(l.getTime() + TZ_OFFSET * 60000); return this.getTime(); },
        setMonth(m, d) { var l = new OrigDate(this.getTime() - TZ_OFFSET * 60000); l.setUTCMonth.apply(l, arguments); this.setTime(l.getTime() + TZ_OFFSET * 60000); return this.getTime(); },
        setDate(d) { var l = new OrigDate(this.getTime() - TZ_OFFSET * 60000); l.setUTCDate(d); this.setTime(l.getTime() + TZ_OFFSET * 60000); return this.getTime(); },
        setHours(h, m, s, ms) { var l = new OrigDate(this.getTime() - TZ_OFFSET * 60000); l.setUTCHours.apply(l, arguments); this.setTime(l.getTime() + TZ_OFFSET * 60000); return this.getTime(); },
        setMinutes(m, s, ms) { var l = new OrigDate(this.getTime() - TZ_OFFSET * 60000); l.setUTCMinutes.apply(l, arguments); this.setTime(l.getTime() + TZ_OFFSET * 60000); return this.getTime(); },
        setSeconds(s, ms) { var l = new OrigDate(this.getTime() - TZ_OFFSET * 60000); l.setUTCSeconds.apply(l, arguments); this.setTime(l.getTime() + TZ_OFFSET * 60000); return this.getTime(); },
        setMilliseconds(ms) { var l = new OrigDate(this.getTime() - TZ_OFFSET * 60000); l.setUTCMilliseconds(ms); this.setTime(l.getTime() + TZ_OFFSET * 60000); return this.getTime(); },
        toLocaleString() { var l = arguments[0], o = arguments[1]; var opts = Object.assign({}, o || {}); if (!opts.timeZone) opts.timeZone = TZ; return origToLS.call(this, l, opts); },
        toLocaleDateString() { var l = arguments[0], o = arguments[1]; var opts = Object.assign({}, o || {}); if (!opts.timeZone) opts.timeZone = TZ; return origToLDS.call(this, l, opts); },
        toLocaleTimeString() { var l = arguments[0], o = arguments[1]; var opts = Object.assign({}, o || {}); if (!opts.timeZone) opts.timeZone = TZ; return origToLTS.call(this, l, opts); },
      };
      Object.keys(tzMethods).forEach(function (name) {
        defMethod(Date.prototype, name, tzMethods[name]);
      });

      // Intl.DateTimeFormat wrapper (constructor — needs .prototype)
      var PatchedDTF = function (locales, options) {
        var opts = Object.assign({}, options || {});
        if (!opts.timeZone) opts.timeZone = TZ;
        if (new.target) return new OrigDTF(locales, opts);
        return OrigDTF(locales, opts);
      };
      PatchedDTF.prototype = OrigDTF.prototype;
      PatchedDTF.supportedLocalesOf = OrigDTF.supportedLocalesOf;
      Object.defineProperty(PatchedDTF, 'length', { value: 0, configurable: true });
      Intl.DateTimeFormat = PatchedDTF;
      nativeFns.set(Intl.DateTimeFormat, 'DateTimeFormat');

      defMethod(Intl.DateTimeFormat.prototype, 'resolvedOptions', {
        resolvedOptions() {
          var r = origRO.call(this);
          r.timeZone = TZ;
          return r;
        }
      }.resolvedOptions);

      // --- Worker timezone propagation ---
      function workerTzPatch(TZ, TZ_OFFSET, GMT_STRING, TZ_LONG_NAME) {
        var wNativeFns = new Map();
        var wOrigToString = Function.prototype.toString;
        function wDefMethod(obj, name, fn) {
          Object.defineProperty(obj, name, { value: fn, writable: true, configurable: true, enumerable: false });
          wNativeFns.set(fn, name);
        }
        wDefMethod(Function.prototype, 'toString', {
          toString() {
            if (wNativeFns.has(this)) return 'function ' + wNativeFns.get(this) + '() {\n    [native code]\n}';
            return wOrigToString.call(this);
          }
        }.toString);

        var OrigDate = Date;
        var origToLS = Date.prototype.toLocaleString;
        var origToLDS = Date.prototype.toLocaleDateString;
        var origToLTS = Date.prototype.toLocaleTimeString;
        var OrigDTF = Intl.DateTimeFormat;
        var origRO = OrigDTF.prototype.resolvedOptions;
        var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
        var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        var wOrigParse = OrigDate.parse;
        var wRealOffMs = wOrigParse('2026-01-15T00:00:00') - wOrigParse('2026-01-15T00:00:00Z');
        var wParseAdj = TZ_OFFSET * 60000 - wRealOffMs;
        var wHasTz = /[Zz]$|[+-]\d{2}:?\d{2}$|\sGMT|\sUTC/;
        var wIsoDateOnly = /^\d{4}(-\d{2}(-\d{2})?)?$/;
        function wAdjParse(str) {
          var r = wOrigParse(str);
          if (typeof str === 'string' && !isNaN(r) && !wHasTz.test(str) && !wIsoDateOnly.test(str)) r += wParseAdj;
          return r;
        }

        Date = function () {
          if (!(this instanceof Date) && !new.target) {
            return new OrigDate().toString();
          }
          var a = arguments;
          if (a.length === 0) return new OrigDate();
          if (a.length === 1) {
            if (typeof a[0] === 'string') return new OrigDate(wAdjParse(a[0]));
            return new OrigDate(a[0]);
          }
          return new OrigDate(OrigDate.UTC(a[0], a[1], a[2]||1, a[3]||0, a[4]||0, a[5]||0, a[6]||0) + TZ_OFFSET * 60000);
        };
        Date.prototype = OrigDate.prototype;
        Date.prototype.constructor = Date;
        Date.now = OrigDate.now;
        Date.parse = wAdjParse;
        Date.UTC = OrigDate.UTC;
        Object.defineProperty(Date, 'length', { value: 7, configurable: true });
        wNativeFns.set(Date, 'Date');

        var wMethods = {
          getTimezoneOffset() { return TZ_OFFSET; },
          getFullYear() { return new OrigDate(this.getTime() - TZ_OFFSET * 60000).getUTCFullYear(); },
          getMonth() { return new OrigDate(this.getTime() - TZ_OFFSET * 60000).getUTCMonth(); },
          getDate() { return new OrigDate(this.getTime() - TZ_OFFSET * 60000).getUTCDate(); },
          getDay() { return new OrigDate(this.getTime() - TZ_OFFSET * 60000).getUTCDay(); },
          getHours() { return new OrigDate(this.getTime() - TZ_OFFSET * 60000).getUTCHours(); },
          getMinutes() { return new OrigDate(this.getTime() - TZ_OFFSET * 60000).getUTCMinutes(); },
          getSeconds() { return new OrigDate(this.getTime() - TZ_OFFSET * 60000).getUTCSeconds(); },
          getMilliseconds() { return new OrigDate(this.getTime() - TZ_OFFSET * 60000).getUTCMilliseconds(); },
          toString() {
            var local = new OrigDate(this.getTime() - TZ_OFFSET * 60000);
            return days[local.getUTCDay()] + ' ' + months[local.getUTCMonth()] + ' ' +
              pad(local.getUTCDate()) + ' ' + local.getUTCFullYear() + ' ' +
              pad(local.getUTCHours()) + ':' + pad(local.getUTCMinutes()) + ':' +
              pad(local.getUTCSeconds()) + ' ' + GMT_STRING + ' (' + TZ_LONG_NAME + ')';
          },
          toTimeString() {
            var local = new OrigDate(this.getTime() - TZ_OFFSET * 60000);
            return pad(local.getUTCHours()) + ':' + pad(local.getUTCMinutes()) + ':' +
              pad(local.getUTCSeconds()) + ' ' + GMT_STRING + ' (' + TZ_LONG_NAME + ')';
          },
          toDateString() {
            var local = new OrigDate(this.getTime() - TZ_OFFSET * 60000);
            return days[local.getUTCDay()] + ' ' + months[local.getUTCMonth()] + ' ' +
              pad(local.getUTCDate()) + ' ' + local.getUTCFullYear();
          },
          toLocaleString() { var l = arguments[0], o = arguments[1]; var opts = Object.assign({}, o || {}); if (!opts.timeZone) opts.timeZone = TZ; return origToLS.call(this, l, opts); },
          toLocaleDateString() { var l = arguments[0], o = arguments[1]; var opts = Object.assign({}, o || {}); if (!opts.timeZone) opts.timeZone = TZ; return origToLDS.call(this, l, opts); },
          toLocaleTimeString() { var l = arguments[0], o = arguments[1]; var opts = Object.assign({}, o || {}); if (!opts.timeZone) opts.timeZone = TZ; return origToLTS.call(this, l, opts); },
        };
        Object.keys(wMethods).forEach(function (name) { wDefMethod(Date.prototype, name, wMethods[name]); });

        var P = function (locales, options) { var opts = Object.assign({}, options || {}); if (!opts.timeZone) opts.timeZone = TZ; if (new.target) return new OrigDTF(locales, opts); return OrigDTF(locales, opts); };
        P.prototype = OrigDTF.prototype;
        P.supportedLocalesOf = OrigDTF.supportedLocalesOf;
        Intl.DateTimeFormat = P;
        wNativeFns.set(Intl.DateTimeFormat, 'DateTimeFormat');
        wDefMethod(Intl.DateTimeFormat.prototype, 'resolvedOptions', {
          resolvedOptions() { var r = origRO.call(this); r.timeZone = TZ; return r; }
        }.resolvedOptions);
      }

      var tzPatchCode = '(' + workerTzPatch.toString() + ')(' +
        JSON.stringify(TZ) + ',' + TZ_OFFSET + ',' +
        JSON.stringify(GMT_STRING) + ',' + JSON.stringify(TZ_LONG_NAME) + ');\n';

      // Build preamble that fakes self.location in blob Workers to match original URL
      function locationPreamble(href) {
        return '(function(){try{var u=new URL(' + JSON.stringify(href) + ');' +
          'Object.defineProperty(self,"location",{value:{' +
          'href:u.href,origin:u.origin,protocol:u.protocol,' +
          'host:u.host,hostname:u.hostname,port:u.port,' +
          'pathname:u.pathname,search:u.search,hash:u.hash,' +
          'toString:function(){return u.href}},configurable:true})}catch(e){}})();\n';
      }

      var OrigWorker = Worker;
      Worker = function (url, opts) {
        var scriptURL = (typeof url === 'object' && url.href) ? url.href : String(url);
        // Resolve relative URLs to absolute — blob Workers have opaque origin
        // so importScripts("relative.js") would fail without this
        if (scriptURL && !scriptURL.startsWith('blob:') && !scriptURL.startsWith('data:') &&
            !scriptURL.startsWith('http:') && !scriptURL.startsWith('https:')) {
          try { scriptURL = new URL(scriptURL, location.href).href; } catch (e) {}
        }
        var locPre = locationPreamble(scriptURL);
        try {
          if (scriptURL.startsWith('blob:')) {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', scriptURL, false);
            xhr.send();
            if (xhr.status === 200 || xhr.status === 0) {
              var blob = new Blob([locPre + tzPatchCode + xhr.responseText], { type: 'text/javascript' });
              return new OrigWorker(URL.createObjectURL(blob), opts);
            }
          }
          if (opts && opts.type === 'module') {
            var mBlob = new Blob([locPre + tzPatchCode + 'import "' + scriptURL + '";'], { type: 'text/javascript' });
            return new OrigWorker(URL.createObjectURL(mBlob), opts);
          }
          var blob2 = new Blob([locPre + tzPatchCode + 'importScripts("' + scriptURL + '");'], { type: 'text/javascript' });
          return new OrigWorker(URL.createObjectURL(blob2));
        } catch (e) {
          return new OrigWorker(url, opts);
        }
      };
      Worker.prototype = OrigWorker.prototype;
      nativeFns.set(Worker, 'Worker');

      if (typeof SharedWorker !== 'undefined') {
        var OrigSharedWorker = SharedWorker;
        SharedWorker = function (url, opts) {
          var scriptURL = (typeof url === 'object' && url.href) ? url.href : String(url);
          if (scriptURL && !scriptURL.startsWith('blob:') && !scriptURL.startsWith('data:') &&
              !scriptURL.startsWith('http:') && !scriptURL.startsWith('https:')) {
            try { scriptURL = new URL(scriptURL, location.href).href; } catch (e) {}
          }
          var locPre = locationPreamble(scriptURL);
          try {
            if (scriptURL.startsWith('blob:')) {
              var xhr = new XMLHttpRequest();
              xhr.open('GET', scriptURL, false);
              xhr.send();
              if (xhr.status === 200 || xhr.status === 0) {
                var blob = new Blob([locPre + tzPatchCode + xhr.responseText], { type: 'text/javascript' });
                return new OrigSharedWorker(URL.createObjectURL(blob), opts);
              }
            }
            var blob2 = new Blob([locPre + tzPatchCode + 'importScripts("' + scriptURL + '");'], { type: 'text/javascript' });
            return new OrigSharedWorker(URL.createObjectURL(blob2), opts);
          } catch (e) {
            return new OrigSharedWorker(url, opts);
          }
        };
        SharedWorker.prototype = OrigSharedWorker.prototype;
        nativeFns.set(SharedWorker, 'SharedWorker');
      }

      // Block ServiceWorker registration — we cannot patch SW scripts from
      // content script context (SWs don't accept blob: URLs and run in their
      // own global). By rejecting register(), fingerprinters like CreepJS fall
      // back to SharedWorker/Worker which we already patch above.
      if (typeof ServiceWorkerContainer !== 'undefined') {
        defMethod(ServiceWorkerContainer.prototype, 'register', {
          register() {
            return Promise.reject(new DOMException('', 'SecurityError'));
          }
        }.register);
      }
    }

    // =============================================
    // FINGERPRINT PROFILE ENVIRONMENT
    // =============================================

    if (!seed) return;

    function noise(s, index) {
      var h = s ^ index;
      h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
      h = Math.imul(h ^ (h >>> 13), 0x45d9f3b);
      h = h ^ (h >>> 16);
      return h;
    }

    // --- Canvas 2D: sub-pixel transform on text rendering only ---
    // CreepJS detects global transforms via a pixel-exact comparison test:
    // fill 1x1 rects → readback → compare. A global sub-pixel translate shifts
    // integer-coordinate fills to fractional positions, causing anti-aliased readback
    // differences → "rgba noise" detection.
    //
    // Instead, only apply transform around text-rendering calls (fillText/strokeText).
    // Text rendering is the primary fingerprintable signal. save/restore ensures
    // the transform doesn't leak into subsequent non-text operations.
    var cTx = ((noise(seed, 1) & 0xFFFF) / 0xFFFF) * 0.8 + 0.1;
    var cTy = ((noise(seed, 2) & 0xFFFF) / 0xFFFF) * 0.8 + 0.1;
    var cAngle = ((noise(seed, 3) & 0xFFFF) / 0xFFFF) * 0.002;

    var origFillText = CanvasRenderingContext2D.prototype.fillText;
    defMethod(CanvasRenderingContext2D.prototype, 'fillText', {
      fillText(text, x, y, maxWidth) {
        this.save();
        this.translate(cTx, cTy);
        this.rotate(cAngle);
        if (arguments.length > 3) {
          origFillText.call(this, text, x, y, maxWidth);
        } else {
          origFillText.call(this, text, x, y);
        }
        this.restore();
      }
    }.fillText);

    var origStrokeText = CanvasRenderingContext2D.prototype.strokeText;
    defMethod(CanvasRenderingContext2D.prototype, 'strokeText', {
      strokeText(text, x, y, maxWidth) {
        this.save();
        this.translate(cTx, cTy);
        this.rotate(cAngle);
        if (arguments.length > 3) {
          origStrokeText.call(this, text, x, y, maxWidth);
        } else {
          origStrokeText.call(this, text, x, y);
        }
        this.restore();
      }
    }.strokeText);

    if (typeof OffscreenCanvas !== 'undefined' && typeof OffscreenCanvasRenderingContext2D !== 'undefined') {
      var origOCFillText = OffscreenCanvasRenderingContext2D.prototype.fillText;
      defMethod(OffscreenCanvasRenderingContext2D.prototype, 'fillText', {
        fillText(text, x, y, maxWidth) {
          this.save();
          this.translate(cTx, cTy);
          this.rotate(cAngle);
          if (arguments.length > 3) {
            origOCFillText.call(this, text, x, y, maxWidth);
          } else {
            origOCFillText.call(this, text, x, y);
          }
          this.restore();
        }
      }.fillText);

      var origOCStrokeText = OffscreenCanvasRenderingContext2D.prototype.strokeText;
      defMethod(OffscreenCanvasRenderingContext2D.prototype, 'strokeText', {
        strokeText(text, x, y, maxWidth) {
          this.save();
          this.translate(cTx, cTy);
          this.rotate(cAngle);
          if (arguments.length > 3) {
            origOCStrokeText.call(this, text, x, y, maxWidth);
          } else {
            origOCStrokeText.call(this, text, x, y);
          }
          this.restore();
        }
      }.strokeText);
    }

    // --- Audio: DynamicsCompressor parameter variation ---
    // Only vary compressor params (threshold/knee/ratio). Do NOT patch
    // getChannelData — CreepJS traps it by comparing with copyFromChannel.
    if (typeof AudioContext !== 'undefined') {
      var origCreateComp = AudioContext.prototype.createDynamicsCompressor;

      defMethod(AudioContext.prototype, 'createDynamicsCompressor', {
        createDynamicsCompressor() {
          var comp = origCreateComp.call(this);
          try {
            comp.threshold.value += ((noise(seed, 30) & 0xFF) - 128) * 0.0001;
            comp.knee.value += ((noise(seed, 31) & 0xFF) - 128) * 0.00005;
            comp.ratio.value += ((noise(seed, 32) & 0xFF) - 128) * 0.0001;
          } catch (e) {}
          return comp;
        }
      }.createDynamicsCompressor);
    }

    // =============================================
    // HARDWARE PROFILE SPOOFING
    // =============================================
    // Per-container navigator, screen, WebGL, and font spoofing.
    // Profile data arrives via the cfg.prof object from the cookie.

    var prof = cfg ? cfg.prof : null;
    if (prof) {
      // Helper: install a getter on a prototype, matching native accessor descriptors
      function defGetter(obj, name, getterFn) {
        Object.defineProperty(obj, name, {
          get: getterFn, set: undefined, configurable: true, enumerable: true
        });
        var label = 'get ' + name;
        nativeFns.set(getterFn, label);
        try { Object.defineProperty(getterFn, CTM_NATIVE, { value: label, configurable: false, enumerable: false }); } catch (e) {}
      }

      // --- Navigator properties ---
      var navProto = Object.getPrototypeOf(navigator);

      if (prof.platform) {
        var platVal = prof.platform;
        defGetter(navProto, 'platform', function() { return platVal; });
      }
      if (prof.hardwareConcurrency) {
        var hcVal = prof.hardwareConcurrency;
        defGetter(navProto, 'hardwareConcurrency', function() { return hcVal; });
      }
      if (prof.deviceMemory) {
        var dmVal = prof.deviceMemory;
        defGetter(navProto, 'deviceMemory', function() { return dmVal; });
      }
      if (prof.languages) {
        var langVal = prof.languages;
        var langFirst = langVal[0] || 'en-US';
        defGetter(navProto, 'languages', function() { return Object.freeze(langVal.slice()); });
        defGetter(navProto, 'language', function() { return langFirst; });
      }

      // --- Screen properties ---
      var screenProto = Object.getPrototypeOf(screen);

      if (prof.screen) {
        var sw = prof.screen[0], sh = prof.screen[1];
        var taskbar = prof.platform === 'MacIntel' ? 25 : 40;
        var ah = sh - taskbar;
        defGetter(screenProto, 'width', function() { return sw; });
        defGetter(screenProto, 'height', function() { return sh; });
        defGetter(screenProto, 'availWidth', function() { return sw; });
        defGetter(screenProto, 'availHeight', function() { return ah; });
      }
      if (prof.colorDepth) {
        var cdVal = prof.colorDepth;
        defGetter(screenProto, 'colorDepth', function() { return cdVal; });
        defGetter(screenProto, 'pixelDepth', function() { return cdVal; });
      }

      // --- window.devicePixelRatio ---
      if (prof.pixelRatio) {
        var dprVal = prof.pixelRatio;
        defGetter(window, 'devicePixelRatio', function() { return dprVal; });
      }

      // NOTE: WebGL vendor/renderer spoofing removed — it creates a detectable
      // mismatch between the claimed GPU and the actual WebGL parameter values.

      // --- Font detection spoofing ---
      if (prof.fonts && typeof FontFaceSet !== 'undefined' && FontFaceSet.prototype.check) {
        var origFontCheck = FontFaceSet.prototype.check;
        var profFonts = prof.fonts;

        defMethod(FontFaceSet.prototype, 'check', {
          check(font, text) {
            if (font) {
              var match = font.match(/(?:\d+(?:\.\d+)?(?:px|pt|em|rem|%|ex|ch|vw|vh|cm|mm|in|pc)\s+)(.+)/i);
              if (match) {
                var family = match[1].split(',')[0].trim().replace(/^["']|["']$/g, '');
                if (family in profFonts) return profFonts[family];
              }
            }
            return origFontCheck.call(this, font, text);
          }
        }.check);
      }
    }

    // =============================================
    // IFRAME PATCHING (phantom iframe defense)
    // =============================================
    // CreepJS creates about:blank iframes and compares their built-in
    // prototypes against the main window. Each iframe has its own realm
    // with separate prototypes, so we must re-apply patches to every
    // same-origin iframe that gets created.

    var patchSrc = '(' + pageOverrides.toString() + ')(' + JSON.stringify(cfg) + ')';

    function patchIframe(iframe) {
      try {
        var win = iframe.contentWindow;
        if (!win || !win.document || win._ctm_patched) return;
        win._ctm_patched = true;
        var doc = win.document;
        var s = doc.createElement('script');
        s.textContent = patchSrc;
        (doc.documentElement || doc.head || doc).appendChild(s);
        s.remove();
      } catch (e) {} // cross-origin iframes will throw
    }

    // Check if a node or its descendants contain iframes and patch them
    function checkAndPatchIframes(node) {
      if (!node) return;
      if (node.tagName === 'IFRAME') patchIframe(node);
      if (node.querySelectorAll) {
        var nested = node.querySelectorAll('iframe');
        for (var ni = 0; ni < nested.length; ni++) patchIframe(nested[ni]);
      }
    }

    // Patch any existing iframes
    var existingIframes = document.querySelectorAll('iframe');
    for (var ei = 0; ei < existingIframes.length; ei++) patchIframe(existingIframes[ei]);

    // Synchronous interception: patch appendChild/insertBefore so iframes
    // get patched BEFORE the calling script can read their contentWindow.
    // MutationObserver is async and fires too late.
    var origAppendChild = Node.prototype.appendChild;
    var origInsertBefore = Node.prototype.insertBefore;

    defMethod(Node.prototype, 'appendChild', {
      appendChild(child) {
        var result = origAppendChild.call(this, child);
        checkAndPatchIframes(child);
        return result;
      }
    }.appendChild);

    defMethod(Node.prototype, 'insertBefore', {
      insertBefore(child, ref) {
        var result = origInsertBefore.call(this, child, ref);
        checkAndPatchIframes(child);
        return result;
      }
    }.insertBefore);

    if (typeof Element.prototype.append === 'function') {
      var origAppend = Element.prototype.append;
      defMethod(Element.prototype, 'append', {
        append() {
          origAppend.apply(this, arguments);
          for (var i = 0; i < arguments.length; i++) {
            if (arguments[i] && arguments[i].nodeType) checkAndPatchIframes(arguments[i]);
          }
        }
      }.append);
    }
  }

  // --- Synchronous path: config from cookie ---
  if (config) {
    injectPageScript(JSON.stringify(config));
    return;
  }

  // --- Async fallback for tabs not created via interceptor ---
  Promise.all([
    browser.runtime.sendMessage({ type: 'getSeed' }).catch(() => ({})),
    browser.runtime.sendMessage({ type: 'getTimezone' }).catch(() => ({})),
  ]).then(([seedResp, tzResp]) => {
    const asyncConfig = {};
    if (seedResp && seedResp.seed) asyncConfig.seed = seedResp.seed;
    if (tzResp && tzResp.timezone) {
      const tz = tzResp.timezone;
      asyncConfig.tz = tz;
      try {
        const now = new Date();
        const utc = now.toLocaleString('en-US', { timeZone: 'UTC' });
        const loc = now.toLocaleString('en-US', { timeZone: tz });
        asyncConfig.off = (new Date(utc) - new Date(loc)) / 60000;
        const sign = asyncConfig.off <= 0 ? '+' : '-';
        const absOff = Math.abs(asyncConfig.off);
        asyncConfig.gmt = 'GMT' + sign + String(Math.floor(absOff / 60)).padStart(2, '0') + String(absOff % 60).padStart(2, '0');
        const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'long' });
        const parts = fmt.formatToParts(new Date());
        const tzPart = parts.find(p => p.type === 'timeZoneName');
        asyncConfig.ln = tzPart ? tzPart.value : '';
      } catch (e) {}
    }
    if (asyncConfig.tz || asyncConfig.seed) {
      injectPageScript(JSON.stringify(asyncConfig));
    }
  });

})();
