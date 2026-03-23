/**
 * Tests that different containers produce different seeds,
 * and that the seed-to-noise pipeline produces distinct fingerprints.
 */

const { hashString, noise } = require('./helpers');

describe('Container seed isolation', () => {
  // Simulate Firefox container cookie store IDs
  const containers = [
    'firefox-container-1',
    'firefox-container-2',
    'firefox-container-10',
    'firefox-container-50',
    'firefox-container-100',
  ];

  test('each container gets a unique seed', () => {
    const seeds = containers.map(c => hashString(c));
    const uniqueSeeds = new Set(seeds);
    expect(uniqueSeeds.size).toBe(containers.length);
  });

  test('firefox-default maps to a seed (extension ignores it at runtime)', () => {
    const seed = hashString('firefox-default');
    expect(seed).toBeGreaterThan(0);
  });

  test('seeds produce different canvas transform values', () => {
    const seeds = containers.map(c => hashString(c));

    const transforms = seeds.map(seed => {
      var tx = ((noise(seed, 1) & 0xFFFF) / 0xFFFF) * 0.8 + 0.1;
      var ty = ((noise(seed, 2) & 0xFFFF) / 0xFFFF) * 0.8 + 0.1;
      return tx.toFixed(8) + ',' + ty.toFixed(8);
    });

    const uniqueTransforms = new Set(transforms);
    expect(uniqueTransforms.size).toBe(containers.length);
  });

  test('same seed always produces same canvas transform', () => {
    const seed = hashString('firefox-container-42');
    var tx1 = ((noise(seed, 1) & 0xFFFF) / 0xFFFF) * 0.8 + 0.1;
    var tx2 = ((noise(seed, 1) & 0xFFFF) / 0xFFFF) * 0.8 + 0.1;
    expect(tx1).toBe(tx2);
  });

  test('sub-pixel offset differs per container', () => {
    const offsets = containers.map(c => {
      const seed = hashString(c);
      return ((noise(seed, 1) & 0xFFFF) / 0xFFFF) * 0.8 + 0.1;
    });
    const uniqueOffsets = new Set(offsets);
    expect(uniqueOffsets.size).toBe(containers.length);
  });

  test('sub-pixel offset is in 0.1–0.9 range', () => {
    for (const c of containers) {
      const seed = hashString(c);
      const tx = ((noise(seed, 1) & 0xFFFF) / 0xFFFF) * 0.8 + 0.1;
      const ty = ((noise(seed, 2) & 0xFFFF) / 0xFFFF) * 0.8 + 0.1;
      expect(tx).toBeGreaterThanOrEqual(0.1);
      expect(tx).toBeLessThanOrEqual(0.9);
      expect(ty).toBeGreaterThanOrEqual(0.1);
      expect(ty).toBeLessThanOrEqual(0.9);
    }
  });

  test('audio compressor offset is tiny', () => {
    for (const c of containers) {
      const seed = hashString(c);
      const thresholdOffset = ((noise(seed, 30) & 0xFF) - 128) * 0.0001;
      expect(Math.abs(thresholdOffset)).toBeLessThanOrEqual(0.0128);
    }
  });

  test('audio compressor offset varies between containers', () => {
    const offsets = containers.map(c => {
      const seed = hashString(c);
      return ((noise(seed, 30) & 0xFF) - 128) * 0.0001;
    });
    const uniqueOffsets = new Set(offsets);
    expect(uniqueOffsets.size).toBeGreaterThan(1);
  });
});
