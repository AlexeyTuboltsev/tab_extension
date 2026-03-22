/**
 * Validate all hardware profile bundles in data/profiles.json
 */

const fs = require('fs');
const path = require('path');
const { validateProfile } = require('./profile-consistency.test');

const profilesPath = path.resolve(__dirname, '../../data/profiles.json');
const profilesData = JSON.parse(fs.readFileSync(profilesPath, 'utf8'));
const profiles = profilesData.profiles;

// Required top-level fields for every profile
const REQUIRED_FIELDS = [
  'id', 'region', 'countries', 'platform', 'hardwareConcurrency',
  'deviceMemory', 'screen', 'colorDepth', 'pixelRatio',
  'webgl_vendor', 'webgl_renderer', 'languages', 'fonts'
];

// All 66 commonly fingerprinted fonts that every profile should declare
const FINGERPRINTED_FONTS = [
  'Arial', 'Courier New', 'Georgia', 'Times New Roman', 'Verdana',
  'Calibri', 'Cambria', 'Consolas', 'Segoe UI',
  'Helvetica Neue', 'Monaco', 'Geneva', 'AppleGothic', 'LUCIDA GRANDE',
  'SF Pro', 'Bitstream Vera Sans Mono'
];

// Regions that must have at least one profile
const REQUIRED_REGIONS = ['EU', 'NA', 'APAC', 'LATAM', 'GLOBAL'];

// Countries that should be covered
const KEY_COUNTRIES = ['US', 'DE', 'FR', 'GB', 'JP', 'BR', 'PL', 'AU', 'IN'];

describe('Profile data validation', () => {

  test('profiles.json loads and contains profiles', () => {
    expect(profiles).toBeDefined();
    expect(Array.isArray(profiles)).toBe(true);
    expect(profiles.length).toBeGreaterThanOrEqual(12);
  });

  test('all profile IDs are unique', () => {
    const ids = profiles.map(p => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  describe.each(profiles.map(p => [p.id, p]))('%s', (id, profile) => {

    test('has all required fields', () => {
      for (const field of REQUIRED_FIELDS) {
        expect(profile).toHaveProperty(field);
      }
    });

    test('has valid platform', () => {
      expect(['Win32', 'MacIntel', 'Linux x86_64', 'Linux aarch64']).toContain(profile.platform);
    });

    test('countries is a non-empty array of 2-letter codes', () => {
      expect(Array.isArray(profile.countries)).toBe(true);
      expect(profile.countries.length).toBeGreaterThan(0);
      for (const c of profile.countries) {
        expect(c).toMatch(/^[A-Z]{2}$/);
      }
    });

    test('languages is a non-empty array', () => {
      expect(Array.isArray(profile.languages)).toBe(true);
      expect(profile.languages.length).toBeGreaterThan(0);
      for (const lang of profile.languages) {
        // BCP-47 pattern: xx or xx-XX
        expect(lang).toMatch(/^[a-z]{2}(-[A-Z]{2})?$/);
      }
    });

    test('screen is [width, height] with positive integers', () => {
      expect(Array.isArray(profile.screen)).toBe(true);
      expect(profile.screen.length).toBe(2);
      expect(profile.screen[0]).toBeGreaterThan(0);
      expect(profile.screen[1]).toBeGreaterThan(0);
    });

    test('fonts object has all commonly fingerprinted fonts declared', () => {
      expect(typeof profile.fonts).toBe('object');
      for (const font of FINGERPRINTED_FONTS) {
        expect(profile.fonts).toHaveProperty(font);
        expect(typeof profile.fonts[font]).toBe('boolean');
      }
    });

    test('passes consistency validation (no contradictory signals)', () => {
      const errors = validateProfile(profile);
      if (errors.length > 0) {
        fail(`Profile ${id} has consistency errors:\n  - ${errors.join('\n  - ')}`);
      }
    });

    test('font list is consistent with platform', () => {
      if (profile.platform === 'Win32') {
        // Windows should have Calibri and Segoe UI
        expect(profile.fonts['Calibri']).toBe(true);
        expect(profile.fonts['Segoe UI']).toBe(true);
        // Should NOT have macOS-only fonts
        expect(profile.fonts['Helvetica Neue']).toBe(false);
        expect(profile.fonts['Monaco']).toBe(false);
        expect(profile.fonts['SF Pro']).toBe(false);
      }
      if (profile.platform === 'MacIntel') {
        // macOS should have Helvetica Neue and Monaco
        expect(profile.fonts['Helvetica Neue']).toBe(true);
        expect(profile.fonts['Monaco']).toBe(true);
        // Should NOT have Windows-only fonts
        expect(profile.fonts['Calibri']).toBe(false);
        expect(profile.fonts['Segoe UI']).toBe(false);
        expect(profile.fonts['Consolas']).toBe(false);
      }
      if (profile.platform === 'Linux x86_64') {
        // Linux should NOT have Windows-only or macOS-only fonts
        expect(profile.fonts['Calibri']).toBe(false);
        expect(profile.fonts['Segoe UI']).toBe(false);
        expect(profile.fonts['Helvetica Neue']).toBe(false);
        expect(profile.fonts['Monaco']).toBe(false);
        expect(profile.fonts['SF Pro']).toBe(false);
        // Linux should have Bitstream Vera Sans Mono
        expect(profile.fonts['Bitstream Vera Sans Mono']).toBe(true);
      }
    });
  });

  test('all required regions are covered', () => {
    const regions = new Set(profiles.map(p => p.region));
    for (const region of REQUIRED_REGIONS) {
      expect(regions).toContain(region);
    }
  });

  test('key countries are covered', () => {
    const allCountries = new Set();
    for (const p of profiles) {
      for (const c of p.countries) {
        allCountries.add(c);
      }
    }
    for (const country of KEY_COUNTRIES) {
      expect(allCountries).toContain(country);
    }
  });

  test('has both Windows, macOS, and Linux profiles', () => {
    const platforms = new Set(profiles.map(p => p.platform));
    expect(platforms).toContain('Win32');
    expect(platforms).toContain('MacIntel');
    expect(platforms).toContain('Linux x86_64');
  });
});
