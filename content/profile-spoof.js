// Per-container hardware profile spoofing
// Runs at document_start to patch navigator/screen/WebGL/font signals before page scripts execute

(function () {
  'use strict';

  // --- Profile state (updated async, patches applied immediately) ---
  let profile = null;

  // Request the profile from the background script
  browser.runtime.sendMessage({ type: 'getProfile' }).then(response => {
    if (response && response.profile) {
      profile = response.profile;
    }
  }).catch(() => {
    // Extension context invalidated — leave profile as null (no spoofing)
  });

  // --- Navigator property patches ---

  function patchNavigatorProp(prop, getter) {
    try {
      Object.defineProperty(
        window.wrappedJSObject.navigator,
        prop,
        {
          get: exportFunction(getter, window),
          configurable: true,
          enumerable: true
        }
      );
    } catch (e) {
      // Property may not be configurable in some contexts
    }
  }

  // navigator.platform
  patchNavigatorProp('platform', function () {
    return profile ? profile.platform : navigator.wrappedJSObject.__lookupGetter__('platform')?.call(navigator) || 'Win32';
  });

  // navigator.hardwareConcurrency
  patchNavigatorProp('hardwareConcurrency', function () {
    return profile ? profile.hardwareConcurrency : navigator.wrappedJSObject.__lookupGetter__('hardwareConcurrency')?.call(navigator) || 4;
  });

  // navigator.deviceMemory
  patchNavigatorProp('deviceMemory', function () {
    return profile ? profile.deviceMemory : navigator.wrappedJSObject.__lookupGetter__('deviceMemory')?.call(navigator) || 8;
  });

  // navigator.languages
  patchNavigatorProp('languages', function () {
    if (profile && profile.languages) {
      return cloneInto(profile.languages, window);
    }
    return navigator.wrappedJSObject.__lookupGetter__('languages')?.call(navigator) || cloneInto(['en-US'], window);
  });

  // navigator.language
  patchNavigatorProp('language', function () {
    if (profile && profile.languages && profile.languages.length > 0) {
      return profile.languages[0];
    }
    return navigator.wrappedJSObject.__lookupGetter__('language')?.call(navigator) || 'en-US';
  });

  // --- Screen property patches ---

  function patchScreenProp(prop, getter) {
    try {
      Object.defineProperty(
        window.wrappedJSObject.screen,
        prop,
        {
          get: exportFunction(getter, window),
          configurable: true,
          enumerable: true
        }
      );
    } catch (e) {
      // Property may not be configurable
    }
  }

  patchScreenProp('width', function () {
    return profile && profile.screen ? profile.screen[0] : screen.width;
  });

  patchScreenProp('height', function () {
    return profile && profile.screen ? profile.screen[1] : screen.height;
  });

  patchScreenProp('availWidth', function () {
    return profile && profile.screen ? profile.screen[0] : screen.availWidth;
  });

  patchScreenProp('availHeight', function () {
    // Subtract taskbar height estimate for realism
    if (profile && profile.screen) {
      const taskbarOffset = profile.platform === 'MacIntel' ? 25 : 40;
      return profile.screen[1] - taskbarOffset;
    }
    return screen.availHeight;
  });

  patchScreenProp('colorDepth', function () {
    return profile ? (profile.colorDepth || 24) : screen.colorDepth;
  });

  patchScreenProp('pixelDepth', function () {
    return profile ? (profile.colorDepth || 24) : screen.pixelDepth;
  });

  // --- window.devicePixelRatio ---

  try {
    Object.defineProperty(
      window.wrappedJSObject,
      'devicePixelRatio',
      {
        get: exportFunction(function () {
          return profile ? (profile.pixelRatio || 1) : window.devicePixelRatio;
        }, window),
        configurable: true,
        enumerable: true
      }
    );
  } catch (e) {
    // May not be configurable
  }

  // --- WebGL vendor/renderer spoofing ---

  const UNMASKED_VENDOR_WEBGL = 0x9245;
  const UNMASKED_RENDERER_WEBGL = 0x9246;

  function patchGetParameter(proto) {
    if (!proto) return;
    const origGetParameter = proto.getParameter;
    if (!origGetParameter) return;

    function patchedGetParameter(pname) {
      if (profile) {
        // Check if we have the debug extension
        const debugExt = this.getExtension('WEBGL_debug_renderer_info');
        if (debugExt) {
          if (pname === UNMASKED_VENDOR_WEBGL && profile.webgl_vendor) {
            return profile.webgl_vendor;
          }
          if (pname === UNMASKED_RENDERER_WEBGL && profile.webgl_renderer) {
            return profile.webgl_renderer;
          }
        }
      }
      return origGetParameter.call(this, pname);
    }

    proto.getParameter = exportFunction(patchedGetParameter, window);
  }

  patchGetParameter(WebGLRenderingContext.prototype);
  if (typeof WebGL2RenderingContext !== 'undefined') {
    patchGetParameter(WebGL2RenderingContext.prototype);
  }

  // --- Font detection spoofing via document.fonts.check() ---

  if (typeof FontFaceSet !== 'undefined' && FontFaceSet.prototype.check) {
    const origCheck = FontFaceSet.prototype.check;

    function patchedCheck(font, text) {
      if (profile && profile.fonts) {
        // Parse the font family from the CSS font shorthand
        // Format is typically "size family" or "style size family"
        // The family part may contain quoted names like '"Arial", sans-serif'
        const fontFamily = extractFontFamily(font);
        if (fontFamily && fontFamily in profile.fonts) {
          return profile.fonts[fontFamily];
        }
      }
      return origCheck.call(this, font, text);
    }

    FontFaceSet.prototype.check = exportFunction(patchedCheck, window);
  }

  // Extract the primary font family name from a CSS font shorthand string
  function extractFontFamily(fontStr) {
    if (!fontStr) return null;
    // Split on the last space-separated token group that could be a size
    // Common patterns: "12px Arial", "12px \"Arial Black\"", "bold 16px 'Calibri', sans-serif"
    // We want to find the family portion after the size
    const match = fontStr.match(/(?:\d+(?:\.\d+)?(?:px|pt|em|rem|%|ex|ch|vw|vh|cm|mm|in|pc)\s+)(.+)/i);
    if (match) {
      const familyPart = match[1];
      // Get the first family name (before any comma for fallback)
      const firstFamily = familyPart.split(',')[0].trim();
      // Remove quotes
      return firstFamily.replace(/^["']|["']$/g, '');
    }
    return null;
  }

})();
