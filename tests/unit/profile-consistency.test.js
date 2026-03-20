/**
 * Profile consistency validation.
 * Tests that hardware profile bundles don't have contradictory signals.
 * These rules will be applied when validating real profile data.
 */

// Common screen resolutions (from StatCounter data)
const COMMON_RESOLUTIONS = [
  [1920, 1080], [1366, 768], [1536, 864], [1440, 900], [1280, 720],
  [1600, 900], [2560, 1440], [3840, 2160], [1280, 800], [1280, 1024],
  [1024, 768], [2560, 1600], [1680, 1050], [2880, 1800], [3440, 1440],
];

// macOS-only fonts
const MACOS_FONTS = ['Helvetica Neue', 'Monaco', 'Geneva', 'AppleGothic', 'LUCIDA GRANDE', 'SF Pro'];

// Windows-only fonts
const WINDOWS_FONTS = ['Calibri', 'Cambria', 'Consolas', 'Segoe UI', 'Segoe UI Light',
  'Segoe UI Semibold', 'Segoe UI Symbol', 'Segoe Print', 'Segoe Script',
  'Microsoft Sans Serif', 'MS Gothic', 'MS PGothic', 'MS Outlook',
  'MS Reference Sans Serif', 'MS Sans Serif', 'MS Serif'];

// GPU renderers that indicate specific platforms
const MACOS_GPU_PATTERNS = ['Apple M', 'Apple GPU', 'AMD Radeon Pro'];
const WINDOWS_GPU_PATTERNS = ['ANGLE', 'Direct3D'];

function validateProfile(profile) {
  const errors = [];

  // Platform vs fonts
  if (profile.platform === 'Win32' && profile.fonts) {
    for (const font of MACOS_FONTS) {
      if (profile.fonts[font] === true) {
        errors.push(`Win32 profile has macOS font: ${font}`);
      }
    }
  }
  if (profile.platform === 'MacIntel' && profile.fonts) {
    for (const font of WINDOWS_FONTS) {
      if (profile.fonts[font] === true) {
        errors.push(`macOS profile has Windows font: ${font}`);
      }
    }
  }

  // Platform vs GPU
  if (profile.platform === 'Win32' && profile.webgl_renderer) {
    for (const pattern of MACOS_GPU_PATTERNS) {
      if (profile.webgl_renderer.includes(pattern)) {
        errors.push(`Win32 profile has macOS GPU: ${profile.webgl_renderer}`);
      }
    }
  }
  if (profile.platform === 'MacIntel' && profile.webgl_renderer) {
    for (const pattern of WINDOWS_GPU_PATTERNS) {
      if (profile.webgl_renderer.includes(pattern)) {
        errors.push(`macOS profile has Windows GPU: ${profile.webgl_renderer}`);
      }
    }
  }

  // CPU cores sanity
  if (profile.hardwareConcurrency != null) {
    if (profile.hardwareConcurrency < 1 || profile.hardwareConcurrency > 128) {
      errors.push(`Implausible CPU cores: ${profile.hardwareConcurrency}`);
    }
    if (profile.hardwareConcurrency % 2 !== 0 && profile.hardwareConcurrency !== 1) {
      errors.push(`Odd CPU core count (unusual): ${profile.hardwareConcurrency}`);
    }
  }

  // Device memory sanity
  if (profile.deviceMemory) {
    const validMemory = [1, 2, 4, 8, 16, 32, 64];
    if (!validMemory.includes(profile.deviceMemory)) {
      errors.push(`Invalid deviceMemory: ${profile.deviceMemory} (must be power of 2)`);
    }
  }

  // Screen resolution check
  if (profile.screen) {
    const [w, h] = profile.screen;
    const isCommon = COMMON_RESOLUTIONS.some(([rw, rh]) => rw === w && rh === h);
    if (!isCommon) {
      errors.push(`Uncommon screen resolution: ${w}x${h}`);
    }
  }

  // Pixel ratio sanity
  if (profile.pixelRatio) {
    const validRatios = [1, 1.25, 1.5, 2, 2.5, 3];
    if (!validRatios.includes(profile.pixelRatio)) {
      errors.push(`Unusual pixel ratio: ${profile.pixelRatio}`);
    }
  }

  return errors;
}

describe('Profile consistency rules', () => {
  test('valid Windows profile passes', () => {
    const profile = {
      platform: 'Win32',
      hardwareConcurrency: 8,
      deviceMemory: 8,
      screen: [1920, 1080],
      pixelRatio: 1,
      webgl_renderer: 'ANGLE (Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0)',
      fonts: {
        'Arial': true, 'Calibri': true, 'Segoe UI': true,
        'Helvetica Neue': false, 'Monaco': false, 'AppleGothic': false,
      },
    };
    expect(validateProfile(profile)).toEqual([]);
  });

  test('valid macOS profile passes', () => {
    const profile = {
      platform: 'MacIntel',
      hardwareConcurrency: 8,
      deviceMemory: 16,
      screen: [2560, 1600],
      pixelRatio: 2,
      webgl_renderer: 'Apple M1 Pro',
      fonts: {
        'Arial': true, 'Helvetica Neue': true, 'Monaco': true,
        'Calibri': false, 'Segoe UI': false,
      },
    };
    expect(validateProfile(profile)).toEqual([]);
  });

  test('detects macOS font on Windows', () => {
    const profile = {
      platform: 'Win32',
      fonts: { 'Helvetica Neue': true },
    };
    const errors = validateProfile(profile);
    expect(errors).toContainEqual(expect.stringContaining('macOS font'));
  });

  test('detects Windows font on macOS', () => {
    const profile = {
      platform: 'MacIntel',
      fonts: { 'Calibri': true },
    };
    const errors = validateProfile(profile);
    expect(errors).toContainEqual(expect.stringContaining('Windows font'));
  });

  test('detects macOS GPU on Windows', () => {
    const profile = {
      platform: 'Win32',
      webgl_renderer: 'Apple M1',
    };
    const errors = validateProfile(profile);
    expect(errors).toContainEqual(expect.stringContaining('macOS GPU'));
  });

  test('detects Windows GPU on macOS', () => {
    const profile = {
      platform: 'MacIntel',
      webgl_renderer: 'ANGLE (Intel Direct3D11)',
    };
    const errors = validateProfile(profile);
    expect(errors).toContainEqual(expect.stringContaining('Windows GPU'));
  });

  test('detects implausible CPU cores', () => {
    expect(validateProfile({ hardwareConcurrency: 0 })).toContainEqual(expect.stringContaining('Implausible'));
    expect(validateProfile({ hardwareConcurrency: 256 })).toContainEqual(expect.stringContaining('Implausible'));
    expect(validateProfile({ hardwareConcurrency: 3 })).toContainEqual(expect.stringContaining('Odd'));
  });

  test('detects invalid device memory', () => {
    expect(validateProfile({ deviceMemory: 3 })).toContainEqual(expect.stringContaining('Invalid deviceMemory'));
    expect(validateProfile({ deviceMemory: 6 })).toContainEqual(expect.stringContaining('Invalid deviceMemory'));
  });

  test('detects uncommon screen resolution', () => {
    expect(validateProfile({ screen: [1234, 567] })).toContainEqual(expect.stringContaining('Uncommon'));
  });

  test('detects unusual pixel ratio', () => {
    expect(validateProfile({ pixelRatio: 1.33 })).toContainEqual(expect.stringContaining('Unusual pixel ratio'));
  });

  test('common resolutions pass', () => {
    for (const [w, h] of COMMON_RESOLUTIONS) {
      expect(validateProfile({ screen: [w, h] })).toEqual([]);
    }
  });
});

// Export for reuse when validating actual profile data files
module.exports = { validateProfile, MACOS_FONTS, WINDOWS_FONTS, COMMON_RESOLUTIONS };
