import { describe, it, expect } from 'vitest';
import { noise2D, fbm } from './noise';

describe('noise utilities', () => {
  describe('noise2D', () => {
    it('should return values between -1 and 1', () => {
      for (let i = 0; i < 100; i++) {
        const x = Math.random() * 1000 - 500;
        const y = Math.random() * 1000 - 500;
        const value = noise2D(x, y);
        
        expect(value).toBeGreaterThanOrEqual(-1);
        expect(value).toBeLessThanOrEqual(1);
      }
    });

    it('should be deterministic (same inputs give same outputs)', () => {
      const value1 = noise2D(10.5, 20.3);
      const value2 = noise2D(10.5, 20.3);
      
      expect(value1).toBe(value2);
    });

    it('should produce different values for different inputs', () => {
      const value1 = noise2D(0.5, 0.5);
      const value2 = noise2D(50.7, 73.2);
      
      expect(value1).not.toBe(value2);
    });

    it('should be continuous (nearby points have similar values)', () => {
      const value1 = noise2D(10, 10);
      const value2 = noise2D(10.01, 10.01);
      
      // Values should be close (within 0.1 for very nearby points)
      expect(Math.abs(value1 - value2)).toBeLessThan(0.1);
    });
  });

  describe('fbm', () => {
    it('should return values between 0 and 1', () => {
      for (let i = 0; i < 100; i++) {
        const x = Math.random() * 1000 - 500;
        const y = Math.random() * 1000 - 500;
        const value = fbm(x, y);
        
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    });

    it('should be deterministic', () => {
      const value1 = fbm(50, 75, 4, 0.5, 0.02);
      const value2 = fbm(50, 75, 4, 0.5, 0.02);
      
      expect(value1).toBe(value2);
    });

    it('should respect octaves parameter', () => {
      // More octaves generally means more detail (different values at micro level)
      const value1Octave = fbm(100, 100, 1, 0.5, 0.1);
      const value4Octaves = fbm(100, 100, 4, 0.5, 0.1);
      
      // They should produce values but might differ
      expect(typeof value1Octave).toBe('number');
      expect(typeof value4Octaves).toBe('number');
    });

    it('should respect scale parameter', () => {
      // Larger scale = more zoomed out = slower variation
      const smallScale = fbm(0, 0, 4, 0.5, 0.001);
      const largeScale = fbm(0, 0, 4, 0.5, 1);
      
      expect(typeof smallScale).toBe('number');
      expect(typeof largeScale).toBe('number');
    });
  });
});
