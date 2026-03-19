// Per-container canvas/WebGL/AudioContext fingerprint noise
// Runs at document_start to patch prototypes before page scripts execute

(function () {
  'use strict';

  // --- Seed state (updated async, patches applied immediately) ---
  let seed = 0;

  // Request the container seed from the background script
  browser.runtime.sendMessage({ type: 'getSeed' }).then(response => {
    if (response && response.seed) {
      seed = response.seed;
    }
  }).catch(() => {
    // Extension context invalidated or no background — leave seed as 0 (no noise)
  });

  // --- Deterministic hash / noise utilities ---

  // Fast integer hash for per-pixel noise derivation
  function noise(s, index) {
    let h = s ^ index;
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 13), 0x45d9f3b);
    h = h ^ (h >>> 16);
    return h;
  }

  // Apply LSB noise to a pixel data buffer in-place
  function applyPixelNoise(data, s) {
    if (!s) return; // seed 0 = no noise (firefox-default container)
    for (let i = 0; i < data.length; i += 4) {
      // Flip least significant bit of R channel only — minimal visual impact
      data[i] = data[i] ^ (noise(s, i) & 1);
    }
  }

  // --- Canvas 2D: sub-pixel transform injection ---

  const origGetContext = HTMLCanvasElement.prototype.getContext;

  function patchedGetContext(type, attrs) {
    const ctx = origGetContext.call(this, type, attrs);
    if (ctx && type === '2d' && seed) {
      // Sub-pixel translate causes GPU antialiasing to produce different edge pixels
      const offset = ((seed % 1000) / 1000000000);
      ctx.translate(offset, offset);
    }
    return ctx;
  }

  // Use exportFunction to make the patched function visible to page scripts
  HTMLCanvasElement.prototype.getContext = exportFunction(patchedGetContext, window);

  // --- Canvas 2D: readback noise (safety net) ---

  const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;

  function patchedGetImageData(sx, sy, sw, sh, settings) {
    const imageData = origGetImageData.call(this, sx, sy, sw, sh, settings);
    applyPixelNoise(imageData.data, seed);
    return imageData;
  }

  CanvasRenderingContext2D.prototype.getImageData = exportFunction(patchedGetImageData, window);

  const origToDataURL = HTMLCanvasElement.prototype.toDataURL;

  function patchedToDataURL() {
    if (seed && this.width > 0 && this.height > 0) {
      try {
        const ctx = origGetContext.call(this, '2d');
        if (ctx) {
          const imageData = origGetImageData.call(ctx, 0, 0, this.width, this.height);
          applyPixelNoise(imageData.data, seed);
          ctx.putImageData(imageData, 0, 0);
        }
      } catch (e) {
        // Canvas may be tainted or WebGL — ignore
      }
    }
    return origToDataURL.apply(this, arguments);
  }

  HTMLCanvasElement.prototype.toDataURL = exportFunction(patchedToDataURL, window);

  const origToBlob = HTMLCanvasElement.prototype.toBlob;

  function patchedToBlob(callback, mimeType, quality) {
    if (seed && this.width > 0 && this.height > 0) {
      try {
        const ctx = origGetContext.call(this, '2d');
        if (ctx) {
          const imageData = origGetImageData.call(ctx, 0, 0, this.width, this.height);
          applyPixelNoise(imageData.data, seed);
          ctx.putImageData(imageData, 0, 0);
        }
      } catch (e) {
        // Canvas may be tainted or WebGL — ignore
      }
    }
    return origToBlob.call(this, callback, mimeType, quality);
  }

  HTMLCanvasElement.prototype.toBlob = exportFunction(patchedToBlob, window);

  // --- WebGL: readback noise ---

  function patchReadPixels(proto) {
    if (!proto) return;
    const origReadPixels = proto.readPixels;
    if (!origReadPixels) return;

    function patchedReadPixels(x, y, width, height, format, type, pixels) {
      origReadPixels.call(this, x, y, width, height, format, type, pixels);
      if (seed && pixels) {
        for (let i = 0; i < pixels.length; i += 4) {
          pixels[i] = pixels[i] ^ (noise(seed, i) & 1);
        }
      }
    }

    proto.readPixels = exportFunction(patchedReadPixels, window);
  }

  patchReadPixels(WebGLRenderingContext.prototype);
  if (typeof WebGL2RenderingContext !== 'undefined') {
    patchReadPixels(WebGL2RenderingContext.prototype);
  }

  // --- AudioContext: frequency offset noise ---

  if (typeof AudioContext !== 'undefined') {
    const origCreateOscillator = AudioContext.prototype.createOscillator;

    function patchedCreateOscillator() {
      const oscillator = origCreateOscillator.call(this);
      if (seed) {
        // Offset frequency by a tiny amount derived from the seed
        const freqOffset = ((seed % 100) - 50) * 0.001; // +/- 0.05 Hz
        const origFreqValue = oscillator.frequency.value;
        try {
          oscillator.frequency.value = origFreqValue + freqOffset;
        } catch (e) {
          // Some implementations may not allow setting — ignore
        }
      }
      return oscillator;
    }

    AudioContext.prototype.createOscillator = exportFunction(patchedCreateOscillator, window);
  }

  // Patch AnalyserNode.getFloatFrequencyData for analyser-based fingerprinting
  if (typeof AnalyserNode !== 'undefined') {
    const origGetFloatFrequencyData = AnalyserNode.prototype.getFloatFrequencyData;

    function patchedGetFloatFrequencyData(array) {
      origGetFloatFrequencyData.call(this, array);
      if (seed && array) {
        for (let i = 0; i < array.length; i++) {
          // Add tiny deterministic noise to frequency data
          const n = noise(seed, i);
          array[i] += ((n & 0xF) - 8) * 0.0001;
        }
      }
    }

    AnalyserNode.prototype.getFloatFrequencyData = exportFunction(patchedGetFloatFrequencyData, window);
  }

})();
