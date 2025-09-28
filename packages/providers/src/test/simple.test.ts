// Simple test to verify Jest configuration
import { describe, it, expect } from '@jest/globals';

describe('Jest Configuration Test', () => {
  it('should run basic tests', () => {
    expect(1 + 1).toBe(2);
  });

  it('should handle async operations', async () => {
    const result = await Promise.resolve('test');
    expect(result).toBe('test');
  });

  it('should have environment variables set', () => {
    expect(process.env.NODE_ENV).toBe('test');
    expect(process.env.EASYPOST_API_KEY).toBe('test_easypost_key');
  });
});