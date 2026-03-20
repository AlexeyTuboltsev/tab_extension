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

  test('seeds produce different canvas noise patterns', () => {
    const seeds = containers.map(c => hashString(c));

    // Simulate 100-pixel canvas, collect R-channel noise for each seed
    const patterns = seeds.map(seed => {
      const result = [];
      for (let i = 0; i < 400; i += 4) {
        result.push(noise(seed, i) & 1);
      }
      return result.join('');
    });

    const uniquePatterns = new Set(patterns);
    expect(uniquePatterns.size).toBe(containers.length);
  });

  test('same seed always produces same noise pattern', () => {
    const seed = hashString('firefox-container-42');
    const pattern1 = [];
    const pattern2 = [];
    for (let i = 0; i < 1000; i += 4) {
      pattern1.push(noise(seed, i) & 1);
      pattern2.push(noise(seed, i) & 1);
    }
    expect(pattern1).toEqual(pattern2);
  });

  test('sub-pixel offset differs per container', () => {
    const offsets = containers.map(c => {
      const seed = hashString(c);
      return (seed % 1000) / 1000000000;
    });
    const uniqueOffsets = new Set(offsets);
    expect(uniqueOffsets.size).toBe(containers.length);
  });

  test('sub-pixel offset is very small (invisible)', () => {
    for (const c of containers) {
      const seed = hashString(c);
      const offset = (seed % 1000) / 1000000000;
      expect(offset).toBeLessThan(0.000001);
      expect(offset).toBeGreaterThanOrEqual(0);
    }
  });

  test('audio frequency offset is tiny', () => {
    for (const c of containers) {
      const seed = hashString(c);
      const freqOffset = ((seed % 100) - 50) * 0.001;
      expect(Math.abs(freqOffset)).toBeLessThanOrEqual(0.05);
    }
  });

  test('audio frequency offset varies between containers', () => {
    const offsets = containers.map(c => {
      const seed = hashString(c);
      return ((seed % 100) - 50) * 0.001;
    });
    const uniqueOffsets = new Set(offsets);
    expect(uniqueOffsets.size).toBeGreaterThan(1);
  });
});
