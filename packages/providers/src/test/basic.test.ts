describe('Basic Test', () => {
  it('should pass a simple test', () => {
    expect(1 + 1).toBe(2);
  });

  it('should verify TypeScript is working', () => {
    const message: string = 'Hello, Multiship!';
    expect(message).toBe('Hello, Multiship!');
  });
});