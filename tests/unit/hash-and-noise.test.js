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

  test('LSB varies (used for pixel noise)', () => {
    // Check that noise & 1 isn't always the same
    const bits = new Set();
    for (let i = 0; i < 100; i++) {
      bits.add(noise(12345, i) & 1);
    }
    expect(bits.size).toBe(2); // Should have both 0 and 1
  });

  test('seed 0 still produces output (but extension skips it)', () => {
    expect(typeof noise(0, 0)).toBe('number');
  });
});

describe('pixel noise application', () => {
  function applyPixelNoise(data, s) {
    if (!s) return;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = data[i] ^ (noise(s, i) & 1);
    }
  }

  test('seed 0 does not modify data', () => {
    const data = new Uint8ClampedArray([100, 200, 50, 255, 150, 100, 75, 255]);
    const original = new Uint8ClampedArray(data);
    applyPixelNoise(data, 0);
    expect(data).toEqual(original);
  });

  test('non-zero seed modifies R channel only', () => {
    const data = new Uint8ClampedArray([100, 200, 50, 255, 150, 100, 75, 255]);
    const original = new Uint8ClampedArray(data);
    applyPixelNoise(data, 12345);

    // G, B, A channels should be unchanged
    expect(data[1]).toBe(original[1]); // G
    expect(data[2]).toBe(original[2]); // B
    expect(data[3]).toBe(original[3]); // A
    expect(data[5]).toBe(original[5]); // G pixel 2
    expect(data[6]).toBe(original[6]); // B pixel 2
    expect(data[7]).toBe(original[7]); // A pixel 2
  });

  test('R channel changes by at most 1', () => {
    const data = new Uint8ClampedArray([100, 200, 50, 255]);
    applyPixelNoise(data, 12345);
    expect(Math.abs(data[0] - 100)).toBeLessThanOrEqual(1);
  });

  test('is deterministic', () => {
    const data1 = new Uint8ClampedArray([100, 200, 50, 255, 150, 100, 75, 255]);
    const data2 = new Uint8ClampedArray([100, 200, 50, 255, 150, 100, 75, 255]);
    applyPixelNoise(data1, 12345);
    applyPixelNoise(data2, 12345);
    expect(data1).toEqual(data2);
  });

  test('different seeds produce different results', () => {
    const data1 = new Uint8ClampedArray(400); // 100 pixels
    const data2 = new Uint8ClampedArray(400);
    for (let i = 0; i < 400; i++) data1[i] = data2[i] = i % 256;
    applyPixelNoise(data1, 111);
    applyPixelNoise(data2, 222);

    let diffs = 0;
    for (let i = 0; i < 400; i += 4) {
      if (data1[i] !== data2[i]) diffs++;
    }
    expect(diffs).toBeGreaterThan(0);
  });
});
