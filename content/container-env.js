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
        // Delete the cookie immediately
        document.cookie = '__ctm_env=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
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
  function pageOverrides(cfg) {
    var TZ = cfg ? (cfg.tz || null) : null;
    var TZ_OFFSET = cfg ? (cfg.off != null ? cfg.off : null) : null;
    var GMT_STRING = cfg ? (cfg.gmt || null) : null;
    var TZ_LONG_NAME = cfg ? (cfg.ln || '') : '';
    var seed = cfg ? (cfg.seed || 0) : 0;

    // =============================================
    // TIMEZONE ENVIRONMENT
    // =============================================

    var OrigDate = Date;
    var origGTZO = Date.prototype.getTimezoneOffset;
    var origToStr = Date.prototype.toString;
    var origToTS = Date.prototype.toTimeString;
    var origToLS = Date.prototype.toLocaleString;
    var origToLDS = Date.prototype.toLocaleDateString;
    var origToLTS = Date.prototype.toLocaleTimeString;
    var OrigDTF = Intl.DateTimeFormat;
    var origRO = Intl.DateTimeFormat.prototype.resolvedOptions;

    var RE = /GMT[+-]\d{4}\s*\([^)]*\)/;

    function gmtReplace() {
      return GMT_STRING + ' (' + TZ_LONG_NAME + ')';
    }

    if (TZ !== null) {
      Date.prototype.getTimezoneOffset = function () {
        return TZ_OFFSET;
      };

      Date.prototype.toString = function () {
        return origToStr.call(this).replace(RE, gmtReplace());
      };

      Date.prototype.toTimeString = function () {
        return origToTS.call(this).replace(RE, gmtReplace());
      };

      Date.prototype.toLocaleString = function (l, o) {
        var opts = Object.assign({}, o || {}); if (!opts.timeZone) opts.timeZone = TZ;
        return origToLS.call(this, l, opts);
      };

      Date.prototype.toLocaleDateString = function (l, o) {
        var opts = Object.assign({}, o || {}); if (!opts.timeZone) opts.timeZone = TZ;
        return origToLDS.call(this, l, opts);
      };

      Date.prototype.toLocaleTimeString = function (l, o) {
        var opts = Object.assign({}, o || {}); if (!opts.timeZone) opts.timeZone = TZ;
        return origToLTS.call(this, l, opts);
      };

      var PatchedDTF = function (locales, options) {
        var opts = Object.assign({}, options || {});
        if (!opts.timeZone) opts.timeZone = TZ;
        if (new.target) return new OrigDTF(locales, opts);
        return OrigDTF(locales, opts);
      };
      PatchedDTF.prototype = OrigDTF.prototype;
      PatchedDTF.supportedLocalesOf = OrigDTF.supportedLocalesOf;
      Intl.DateTimeFormat = PatchedDTF;

      Intl.DateTimeFormat.prototype.resolvedOptions = function () {
        var r = origRO.call(this);
        r.timeZone = TZ;
        return r;
      };
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

    function applyPixelNoise(data, s) {
      for (var i = 0; i < data.length; i += 4) {
        data[i] = data[i] ^ (noise(s, i) & 1);
      }
    }

    // --- Canvas 2D: sub-pixel transform injection ---
    var origGetContext = HTMLCanvasElement.prototype.getContext;

    HTMLCanvasElement.prototype.getContext = function (type, attrs) {
      var ctx = origGetContext.call(this, type, attrs);
      if (ctx && type === '2d') {
        var offset = ((seed % 1000) / 1000000000);
        ctx.translate(offset, offset);
      }
      return ctx;
    };

    // --- Canvas 2D: readback noise ---
    var origGetImageData = CanvasRenderingContext2D.prototype.getImageData;

    CanvasRenderingContext2D.prototype.getImageData = function (sx, sy, sw, sh, settings) {
      var imageData = origGetImageData.call(this, sx, sy, sw, sh, settings);
      applyPixelNoise(imageData.data, seed);
      return imageData;
    };

    var origToDataURL = HTMLCanvasElement.prototype.toDataURL;

    HTMLCanvasElement.prototype.toDataURL = function () {
      if (this.width > 0 && this.height > 0) {
        try {
          var ctx = origGetContext.call(this, '2d');
          if (ctx) {
            var imageData = origGetImageData.call(ctx, 0, 0, this.width, this.height);
            applyPixelNoise(imageData.data, seed);
            ctx.putImageData(imageData, 0, 0);
          }
        } catch (e) {}
      }
      return origToDataURL.apply(this, arguments);
    };

    var origToBlob = HTMLCanvasElement.prototype.toBlob;

    HTMLCanvasElement.prototype.toBlob = function (callback, mimeType, quality) {
      if (this.width > 0 && this.height > 0) {
        try {
          var ctx = origGetContext.call(this, '2d');
          if (ctx) {
            var imageData = origGetImageData.call(ctx, 0, 0, this.width, this.height);
            applyPixelNoise(imageData.data, seed);
            ctx.putImageData(imageData, 0, 0);
          }
        } catch (e) {}
      }
      return origToBlob.call(this, callback, mimeType, quality);
    };

    // --- WebGL: readback noise ---
    function patchReadPixels(proto) {
      if (!proto) return;
      var origReadPixels = proto.readPixels;
      if (!origReadPixels) return;

      proto.readPixels = function (x, y, width, height, format, type, pixels) {
        origReadPixels.call(this, x, y, width, height, format, type, pixels);
        if (pixels) {
          for (var i = 0; i < pixels.length; i += 4) {
            pixels[i] = pixels[i] ^ (noise(seed, i) & 1);
          }
        }
      };
    }

    patchReadPixels(WebGLRenderingContext.prototype);
    if (typeof WebGL2RenderingContext !== 'undefined') {
      patchReadPixels(WebGL2RenderingContext.prototype);
    }

    // --- AudioContext: frequency offset noise ---
    if (typeof AudioContext !== 'undefined') {
      var origCreateOscillator = AudioContext.prototype.createOscillator;

      AudioContext.prototype.createOscillator = function () {
        var oscillator = origCreateOscillator.call(this);
        var freqOffset = ((seed % 100) - 50) * 0.001;
        try {
          oscillator.frequency.value = oscillator.frequency.value + freqOffset;
        } catch (e) {}
        return oscillator;
      };
    }

    if (typeof AnalyserNode !== 'undefined') {
      var origGetFloatFrequencyData = AnalyserNode.prototype.getFloatFrequencyData;

      AnalyserNode.prototype.getFloatFrequencyData = function (array) {
        origGetFloatFrequencyData.call(this, array);
        if (array) {
          for (var i = 0; i < array.length; i++) {
            var n = noise(seed, i);
            array[i] += ((n & 0xF) - 8) * 0.0001;
          }
        }
      };
    }
  }

  // --- Synchronous path: config from cookie ---
  if (config) {
    injectPageScript(JSON.stringify(config));
    return;
  }

  // --- Async fallback for tabs not created via interceptor ---
  // Request both seed and timezone, then inject once we have them
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
