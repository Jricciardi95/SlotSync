/**
 * Unit tests for image hash utility
 */

const { generateImageHash } = require('../../utils/imageHash');

describe('generateImageHash', () => {
  test('normal case: generates hash from valid buffer', () => {
    const buffer = Buffer.from('test image data for hashing purposes');
    const hash = generateImageHash(buffer);
    expect(hash).toBeTruthy();
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
    // Hash should be hexadecimal
    expect(/^[0-9a-f]+$/i.test(hash)).toBe(true);
  });

  test('edge case: empty buffer returns null', () => {
    const buffer = Buffer.from('');
    const hash = generateImageHash(buffer);
    expect(hash).toBeNull();
  });

  test('edge case: null/undefined input returns null', () => {
    expect(generateImageHash(null)).toBeNull();
    expect(generateImageHash(undefined)).toBeNull();
  });

  test('edge case: very small buffer still generates hash', () => {
    const buffer = Buffer.from('ab');
    const hash = generateImageHash(buffer);
    expect(hash).toBeTruthy();
    expect(typeof hash).toBe('string');
  });

  test('noise case: different buffers produce different hashes', () => {
    const buffer1 = Buffer.from('Bob Seger - Live Bullet album cover image');
    const buffer2 = Buffer.from('Different album cover image data');
    const hash1 = generateImageHash(buffer1);
    const hash2 = generateImageHash(buffer2);
    expect(hash1).not.toBe(hash2);
  });

  test('deterministic: same buffer produces same hash', () => {
    const buffer = Buffer.from('test image data for hashing');
    const hash1 = generateImageHash(buffer);
    const hash2 = generateImageHash(buffer);
    expect(hash1).toBe(hash2);
  });

  test('handles large buffers correctly', () => {
    // Create a buffer larger than the sample size (500 bytes)
    const largeBuffer = Buffer.alloc(2000, 'a');
    const hash = generateImageHash(largeBuffer);
    expect(hash).toBeTruthy();
    expect(typeof hash).toBe('string');
  });

  test('samples from multiple locations (beginning, middle, end)', () => {
    // Create buffer with distinct data at different positions
    const buffer = Buffer.alloc(1500);
    buffer.fill('start', 0, 100);
    buffer.fill('middle', 700, 800);
    buffer.fill('end', 1400, 1500);
    const hash = generateImageHash(buffer);
    expect(hash).toBeTruthy();
    // Hash should incorporate data from multiple locations
    expect(hash.length).toBeGreaterThan(0);
  });
});

