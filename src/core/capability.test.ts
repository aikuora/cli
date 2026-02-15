import { describe, expect, it } from 'vitest';

import { describeCapabilities, isHybrid } from './capability.js';

describe('Capability Detector', () => {
  describe('isHybrid', () => {
    it('should return true for hybrid tools', () => {
      const capabilities = { linkable: true, scaffoldable: true };
      expect(isHybrid(capabilities)).toBe(true);
    });

    it('should return false for linkable-only tools', () => {
      const capabilities = { linkable: true, scaffoldable: false };
      expect(isHybrid(capabilities)).toBe(false);
    });

    it('should return false for scaffoldable-only tools', () => {
      const capabilities = { linkable: false, scaffoldable: true };
      expect(isHybrid(capabilities)).toBe(false);
    });
  });

  describe('describeCapabilities', () => {
    it('should describe hybrid tools', () => {
      const capabilities = { linkable: true, scaffoldable: true };
      expect(describeCapabilities(capabilities)).toBe('hybrid (linkable + scaffoldable)');
    });

    it('should describe linkable tools', () => {
      const capabilities = { linkable: true, scaffoldable: false };
      expect(describeCapabilities(capabilities)).toBe('linkable');
    });

    it('should describe scaffoldable tools', () => {
      const capabilities = { linkable: false, scaffoldable: true };
      expect(describeCapabilities(capabilities)).toBe('scaffoldable');
    });

    it('should describe tools with no capabilities', () => {
      const capabilities = { linkable: false, scaffoldable: false };
      expect(describeCapabilities(capabilities)).toBe('none');
    });
  });
});
