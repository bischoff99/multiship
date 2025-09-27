// Jest globals are available in test environment

describe('Environment Setup Test', () => {
  it('should verify Jest configuration is working', () => {
    expect(true).toBe(true);
  });

  it('should verify TypeScript compilation', () => {
    const testValue: string = 'Hello, Multiship!';
    expect(testValue).toBe('Hello, Multiship!');
  });

  it('should verify ES modules are working', async () => {
    const module = await import('../types.js');
    expect(module).toBeDefined();
  });
});