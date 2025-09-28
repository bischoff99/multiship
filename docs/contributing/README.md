# Contributing Guidelines

We welcome contributions from the community! This document outlines the process for contributing to the Multiship project.

## 🤝 Ways to Contribute

- **🐛 Bug Reports**: Report bugs and issues
- **💡 Feature Requests**: Suggest new features or improvements
- **📝 Documentation**: Improve documentation and examples
- **🔧 Code Contributions**: Submit code changes and fixes
- **🧪 Testing**: Add tests or improve test coverage
- **🎨 UI/UX**: Improve user interface and experience

## 🚀 Getting Started

### 1. Fork and Clone
```bash
# Fork the repository on GitHub
# Clone your fork
git clone https://github.com/your-username/multiship.git
cd multiship

# Add upstream remote
git remote add upstream https://github.com/original-org/multiship.git
```

### 2. Set Up Development Environment
Follow the **[Development Setup Guide](../wiki/development/setup.md)** to configure your environment.

### 3. Create a Feature Branch
```bash
# Create a branch for your feature/fix
git checkout -b feature/your-feature-name
# or
git checkout -b fix/issue-description
```

Branch naming conventions:
- `feature/feature-name` - New features
- `fix/issue-description` - Bug fixes
- `docs/documentation-update` - Documentation changes
- `refactor/component-name` - Code refactoring
- `test/test-description` - Test additions

## 🔧 Development Workflow

### Code Standards

#### TypeScript/JavaScript
- Use **ESLint** and **Prettier** configurations
- Follow the existing code style
- Use meaningful variable and function names
- Add JSDoc comments for public APIs

#### File Organization
- Keep files focused on a single responsibility
- Use consistent file naming (`kebab-case` for files)
- Group related functionality together
- Follow the existing directory structure

#### Commits
```bash
# Use conventional commit format
git commit -m "feat: add new shipment tracking feature"

git commit -m "fix: resolve provider timeout issue"

git commit -m "docs: update API documentation"

git commit -m "test: add unit tests for order service"
```

Commit types:
- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `test:` - Test additions/changes
- `refactor:` - Code refactoring
- `chore:` - Maintenance tasks

### Testing Requirements

#### Unit Tests
- Add tests for new functionality
- Maintain >90% test coverage
- Use descriptive test names
- Mock external dependencies

#### Integration Tests
- Test provider integrations
- Test database operations
- Test API endpoints
- Use test database for isolation

#### Performance Tests
- Test circuit breaker behavior
- Test cache performance
- Test under load conditions

### Documentation Requirements

#### Code Documentation
- Add JSDoc comments for public APIs
- Document complex business logic
- Include usage examples
- Update type definitions

#### Wiki Documentation
- Update relevant Wiki pages
- Add examples and use cases
- Include troubleshooting information
- Keep architecture docs current

## 🔄 Pull Request Process

### 1. Create Pull Request
- Ensure your branch is up to date with main
- All tests pass
- Code follows project standards
- Documentation is updated

### 2. PR Template
Use this template for your pull request:

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update
- [ ] Performance improvement

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing completed
- [ ] All existing tests pass

## Documentation
- [ ] Wiki updated
- [ ] API docs updated
- [ ] Examples added
- [ ] Architecture docs updated

## Checklist
- [ ] Code follows project style
- [ ] Tests pass
- [ ] Linting passes
- [ ] Type checking passes
- [ ] Security review completed (if needed)
```

### 3. Code Review
- All PRs require at least one approval
- Address review feedback promptly
- Update PR description if needed
- Squash commits if requested

### 4. Merge Process
- PR will be merged by maintainers
- Delete your feature branch after merge
- Update any related issues

## 📦 Provider Integration Contributions

### Adding New Providers

1. **Create Provider Adapter**
   ```typescript
   // packages/providers/src/adapters/new-provider-adapter.ts
   import { ProviderAdapter } from '../types';

   export class NewProviderAdapter implements ProviderAdapter {
     async quote(request: QuoteRequest): Promise<QuoteResponse> {
       // Implementation
     }

     async purchase(request: PurchaseRequest): Promise<PurchaseResponse> {
       // Implementation
     }

     async healthCheck(): Promise<boolean> {
       // Implementation
       return true;
     }
   }
   ```

2. **Add to Provider Factory**
   ```typescript
   // packages/providers/src/factory.ts
   import { NewProviderAdapter } from './adapters/new-provider-adapter';

   export class ProviderFactory {
     static getProvider(providerName: string): ProviderAdapter {
       switch (providerName) {
         case 'newprovider':
           return new NewProviderAdapter();
         // ... existing providers
       }
     }
   }
   ```

3. **Add Configuration**
   ```typescript
   // Add environment variables
   NEW_PROVIDER_API_KEY=your-api-key
   NEW_PROVIDER_BASE_URL=https://api.newprovider.com
   ```

4. **Add Tests**
   - Unit tests for the adapter
   - Integration tests with real API
   - Error handling tests

5. **Update Documentation**
   - Add provider-specific Wiki page
   - Update API documentation
   - Add setup instructions

### Provider Integration Checklist
- [ ] Provider adapter implements `ProviderAdapter` interface
- [ ] Both `quote()` and `purchase()` methods implemented
- [ ] Health check method returns boolean
- [ ] Error handling follows project patterns
- [ ] Configuration variables documented
- [ ] Unit tests added
- [ ] Integration tests added
- [ ] Documentation updated
- [ ] Security review completed

## 🧪 Testing Guidelines

### Running Tests
```bash
# Run all tests
pnpm test

# Run tests for specific package
pnpm --filter @multiship/providers test

# Run with coverage
pnpm test:coverage

# Run specific test file
pnpm test path/to/test-file.test.ts
```

### Writing Tests

#### Unit Tests
```typescript
describe('OrderService', () => {
  it('should create order successfully', async () => {
    // Arrange
    const orderData = { /* test data */ };

    // Act
    const result = await orderService.create(orderData);

    // Assert
    expect(result).toBeDefined();
    expect(result.status).toBe('pending');
  });
});
```

#### Integration Tests
```typescript
describe('Provider Integration', () => {
  it('should handle provider timeout', async () => {
    // Test circuit breaker behavior
    const provider = providerFactory.getProvider('easypost');

    // Mock slow response
    jest.spyOn(provider, 'quote').mockImplementation(() =>
      new Promise(resolve => setTimeout(resolve, 10000))
    );

    await expect(provider.quote(mockRequest)).rejects.toThrow();
  });
});
```

## 🔒 Security Considerations

### API Security
- Validate all input data
- Implement rate limiting
- Use secure authentication
- Encrypt sensitive data

### Provider Security
- Store API keys securely
- Rotate credentials regularly
- Monitor for unauthorized access
- Validate provider responses

### Code Security
- Use dependency scanning
- Keep dependencies updated
- Follow security best practices
- Regular security audits

## 📝 Documentation Contributions

### Wiki Updates
- Keep information accurate and current
- Use clear, concise language
- Include practical examples
- Add screenshots for UI changes

### API Documentation
- Document all endpoints
- Include request/response examples
- Document error codes
- Keep authentication info current

## 🚨 Reporting Issues

### Bug Reports
1. Use the **Bug Report** template
2. Include detailed reproduction steps
3. Add system information
4. Include error messages and logs
5. Specify expected vs actual behavior

### Feature Requests
1. Use the **Feature Request** template
2. Explain the use case
3. Provide implementation suggestions
4. Consider alternatives

## 🏆 Recognition

Contributors are recognized for:
- Quality code contributions
- Helpful bug reports
- Documentation improvements
- Community support

## 📞 Getting Help

### Development Questions
1. Check existing documentation
2. Search GitHub issues
3. Ask in development discussions
4. Create new issue if needed

### Code Review
- Be respectful and constructive
- Focus on code, not people
- Suggest improvements with reasoning
- Accept different approaches

## 🔄 Keeping Up to Date

### Syncing with Upstream
```bash
# Fetch upstream changes
git fetch upstream

# Merge upstream changes
git checkout main
git merge upstream/main

# Push to your fork
git push origin main
```

### Rebasing Your Branch
```bash
# Rebase your feature branch
git checkout feature/your-feature
git rebase main

# Force push if needed
git push --force-with-lease origin feature/your-feature
```

---

*Thank you for contributing to Multiship! Your contributions help make the platform better for everyone.*