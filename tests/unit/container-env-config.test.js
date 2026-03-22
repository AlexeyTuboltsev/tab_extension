const { loadIIFE } = require('./helpers');
const ContainerEnv = loadIIFE('background/container-env.js', 'ContainerEnv');

describe('ContainerEnv.buildConfig', () => {
  beforeEach(() => {
    ContainerEnv.updateTimezone(null);
  });

  test('returns null for firefox-default', () => {
    expect(ContainerEnv.buildConfig('firefox-default')).toBeNull();
  });

  test('returns only seed when no timezone is set', () => {
    const config = ContainerEnv.buildConfig('firefox-container-1');
    expect(config).toEqual({ seed: expect.any(Number) });
  });

  test('returns full config after updateTimezone', () => {
    ContainerEnv.updateTimezone('America/New_York');
    const config = ContainerEnv.buildConfig('firefox-container-1');
    expect(config).toHaveProperty('tz', 'America/New_York');
    expect(config).toHaveProperty('off');
    expect(config).toHaveProperty('gmt');
    expect(config).toHaveProperty('ln');
    expect(config).toHaveProperty('seed');
  });

  test('offset for America/New_York is 240 or 300 (DST dependent)', () => {
    ContainerEnv.updateTimezone('America/New_York');
    const config = ContainerEnv.buildConfig('firefox-container-1');
    expect([240, 300]).toContain(config.off);
  });

  test('GMT string format matches GMT[+-]HHMM', () => {
    ContainerEnv.updateTimezone('America/New_York');
    const config = ContainerEnv.buildConfig('firefox-container-1');
    expect(config.gmt).toMatch(/^GMT[+-]\d{4}$/);
  });

  test('seed is deterministic for the same cookieStoreId', () => {
    const config1 = ContainerEnv.buildConfig('firefox-container-5');
    const config2 = ContainerEnv.buildConfig('firefox-container-5');
    expect(config1.seed).toBe(config2.seed);
  });

  test('different cookieStoreIds produce different seeds', () => {
    const config1 = ContainerEnv.buildConfig('firefox-container-1');
    const config2 = ContainerEnv.buildConfig('firefox-container-2');
    expect(config1.seed).not.toBe(config2.seed);
  });
});

describe('ContainerEnv.getTimezone', () => {
  beforeEach(() => {
    ContainerEnv.updateTimezone(null);
  });

  test('returns null initially', () => {
    expect(ContainerEnv.getTimezone()).toBeNull();
  });

  test('returns the timezone after updateTimezone', () => {
    ContainerEnv.updateTimezone('Europe/Berlin');
    expect(ContainerEnv.getTimezone()).toBe('Europe/Berlin');
  });

  test('can be reset to null', () => {
    ContainerEnv.updateTimezone('Asia/Tokyo');
    expect(ContainerEnv.getTimezone()).toBe('Asia/Tokyo');
    ContainerEnv.updateTimezone(null);
    expect(ContainerEnv.getTimezone()).toBeNull();
  });
});
