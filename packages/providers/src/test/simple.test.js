// Simple test to verify Jest configuration
describe('Jest Configuration Test', () => {
  test('should run basic tests', () => {
    expect(1 + 1).toBe(2);
  });

  test('should handle async operations', async () => {
    const result = await Promise.resolve('test');
    expect(result).toBe('test');
  });

  test('should have environment variables set', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });
});