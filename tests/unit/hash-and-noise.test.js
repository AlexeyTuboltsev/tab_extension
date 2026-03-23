const { hashString, noise } = require('./helpers');

describe('hashString', () => {
  test('returns a positive number', () => {
    expect(hashString('test')).toBeGreaterThan(0);
  });

  test('is deterministic', () => {
    expect(hashString('firefox-container-10')).toBe(hashString('firefox-container-10'));
  });

  test('different inputs produce different hashes', () => {
    expect(hashString('firefox-container-10')).not.toBe(hashString('firefox-container-11'));
  });

  test('firefox-default produces a hash', () => {
    expect(hashString('firefox-default')).toBeGreaterThan(0);
  });

  test('returns an integer', () => {
    const h = hashString('test');
    expect(h).toBe(Math.floor(h));
  });

  test('handles empty string', () => {
    expect(hashString('')).toBe(5381); // djb2 initial value
  });
});

describe('noise', () => {
  test('is deterministic', () => {
    expect(noise(12345, 0)).toBe(noise(12345, 0));
    expect(noise(12345, 100)).toBe(noise(12345, 100));
  });

  test('different seeds produce different values', () => {
    expect(noise(1, 0)).not.toBe(noise(2, 0));
  });

  test('different indices produce different values', () => {
    expect(noise(12345, 0)).not.toBe(noise(12345, 1));
  });

  test('returns an integer', () => {
    const n = noise(12345, 42);
    expect(n).toBe(Math.floor(n));
  });

  test('LSB varies across indices', () => {
    const bits = new Set();
    for (let i = 0; i < 100; i++) {
      bits.add(noise(12345, i) & 1);
    }
    expect(bits.size).toBe(2); // Should have both 0 and 1
  });

  test('seed 0 still produces output (but extension skips it)', () => {
    expect(typeof noise(0, 0)).toBe('number');
  });

  test('16-bit range used for sub-pixel offset', () => {
    // Canvas transform uses (noise(seed, n) & 0xFFFF) / 0xFFFF * 0.8 + 0.1
    const seed = 12345;
    for (let idx = 1; idx <= 3; idx++) {
      const raw = (noise(seed, idx) & 0xFFFF) / 0xFFFF;
      expect(raw).toBeGreaterThanOrEqual(0);
      expect(raw).toBeLessThanOrEqual(1);
    }
  });
});

describe('canvas sub-pixel offset computation', () => {
  test('offset falls in 0.1–0.9 range', () => {
    const seeds = [111, 222, 333, 12345, 99999];
    for (const seed of seeds) {
      var tx = ((noise(seed, 1) & 0xFFFF) / 0xFFFF) * 0.8 + 0.1;
      var ty = ((noise(seed, 2) & 0xFFFF) / 0xFFFF) * 0.8 + 0.1;
      expect(tx).toBeGreaterThanOrEqual(0.1);
      expect(tx).toBeLessThanOrEqual(0.9);
      expect(ty).toBeGreaterThanOrEqual(0.1);
      expect(ty).toBeLessThanOrEqual(0.9);
    }
  });

  test('rotation angle is small', () => {
    const seeds = [111, 222, 333, 12345, 99999];
    for (const seed of seeds) {
      var angle = ((noise(seed, 3) & 0xFFFF) / 0xFFFF) * 0.002;
      expect(angle).toBeGreaterThanOrEqual(0);
      expect(angle).toBeLessThanOrEqual(0.002);
    }
  });

  test('different seeds produce different offsets', () => {
    const offsets = [111, 222, 333].map(seed => {
      return ((noise(seed, 1) & 0xFFFF) / 0xFFFF) * 0.8 + 0.1;
    });
    const unique = new Set(offsets);
    expect(unique.size).toBe(3);
  });
});

describe('WebGL parameter variation', () => {
  test('MAX_TEXTURE_SIZE reduction is 0-3', () => {
    const seeds = [111, 222, 333, 12345, 99999];
    for (const seed of seeds) {
      const reduction = noise(seed, 10) & 3;
      expect(reduction).toBeGreaterThanOrEqual(0);
      expect(reduction).toBeLessThanOrEqual(3);
    }
  });

  test('different seeds produce different reductions', () => {
    const reductions = new Set();
    for (let seed = 1; seed < 100; seed++) {
      reductions.add(noise(seed, 10) & 3);
    }
    expect(reductions.size).toBeGreaterThan(1);
  });
});

describe('audio compressor variation', () => {
  test('threshold offset is tiny', () => {
    const seeds = [111, 222, 12345, 99999];
    for (const seed of seeds) {
      const offset = ((noise(seed, 30) & 0xFF) - 128) * 0.0001;
      expect(Math.abs(offset)).toBeLessThanOrEqual(0.0128);
    }
  });

  test('knee offset is tiny', () => {
    const seeds = [111, 222, 12345, 99999];
    for (const seed of seeds) {
      const offset = ((noise(seed, 31) & 0xFF) - 128) * 0.00005;
      expect(Math.abs(offset)).toBeLessThanOrEqual(0.0064);
    }
  });

  test('different seeds produce different compressor offsets', () => {
    const offsets = [111, 222, 333].map(seed => {
      return ((noise(seed, 30) & 0xFF) - 128) * 0.0001;
    });
    const unique = new Set(offsets);
    expect(unique.size).toBeGreaterThan(1);
  });
});
