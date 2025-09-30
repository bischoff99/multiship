# 🚀 Multiship - Quick Start Guide

**5-Minute Setup for New Developers**

---

## 🎯 What is Multiship?

A **provider-agnostic shipping API** that integrates multiple shipping providers (EasyPost, Shippo, Veeqo) with:
- ✨ Circuit breaker for fault tolerance
- ⚡ Multi-layer caching (Memory + Redis)
- 🔒 Type-safe TypeScript implementation
- 🧪 Comprehensive test coverage
- 📊 Health monitoring and metrics

---

## ⚡ Quick Setup

### 1. Prerequisites
```bash
# Required
node --version    # v22.20.0 or higher
pnpm --version    # 10.17.1 or higher

# Optional (for full functionality)
docker --version  # For PostgreSQL + Redis
```

### 2. Clone & Install
```bash
git clone https://github.com/bischoff99/multiship.git
cd multiship
pnpm install
```

### 3. Environment Setup
```bash
cp .env.example .env
# Edit .env with your API keys
```

### 4. Start Development
```bash
# Option A: Full stack (requires Docker)
docker-compose up -d
pnpm dev

# Option B: Just run tests
pnpm --filter @pkg/providers test
```

---

## 📂 Project Structure

```
multiship/
├── apps/
│   ├── api/           # 🚀 Fastify API server
│   └── web/           # 🌐 Next.js web interface
├── packages/
│   ├── db/            # 🗄️ Prisma database layer
│   └── providers/     # 📦 Shipping provider adapters
├── docs/              # 📚 Documentation
└── docker-compose.yml # 🐳 PostgreSQL + Redis
```

---

## 🧪 Testing

### Run Tests
```bash
# All tests
pnpm --filter @pkg/providers test

# Specific test
pnpm --filter @pkg/providers test src/test/simple.test.ts

# Watch mode
pnpm --filter @pkg/providers test:watch

# With coverage
pnpm --filter @pkg/providers test:coverage
```

### Current Status
```
✅ 82/96 tests passing (85.4%)
⚠️ 14 tests need fixes (timer/HTTP mocking)
```

---

## 🔧 Development Commands

```bash
# Build everything
pnpm build

# Check TypeScript
pnpm --filter @pkg/providers exec tsc --noEmit

# Lint code
pnpm lint

# Format code
pnpm format

# Database operations (requires Docker)
pnpm db:push     # Apply schema changes
pnpm db:studio   # Open Prisma Studio
```

---

## 📚 Key Documentation

### Essential Reading
1. **FORWARD_PLAN.md** - 8-week development roadmap
2. **TESTING_STATUS.md** - Current test status & fixes needed
3. **CODE_ANALYSIS_SUMMARY.md** - Project overview & accomplishments

### Architecture
4. **AGENTS.md** - Architecture patterns & guidelines
5. **PRISMA_CONNECTION_ANALYSIS.md** - Database setup

### Setup
6. **SETUP.md** - Cursor IDE configuration
7. **WORKSPACE_SETUP.md** - VS Code workspace setup

---

## 🎯 Common Tasks

### Adding a New Test
```typescript
// packages/providers/src/test/unit/my-feature.test.ts
describe('My Feature', () => {
  it('should do something', () => {
    expect(true).toBe(true);
  });
});
```

### Adding a New Provider Adapter
```typescript
// Use the provider-adapter snippet in Cursor IDE
// or follow existing adapters in src/adapters/
```

### Running Specific Tests
```bash
# Provider errors only
pnpm --filter @pkg/providers test provider-errors

# Circuit breaker only  
pnpm --filter @pkg/providers test circuit-breaker

# All unit tests
pnpm --filter @pkg/providers test:unit
```

---

## ⚠️ Known Issues

### Infrastructure Constraints
- 🚫 **Docker**: May not be available in all environments
- 🚫 **Prisma**: Client generation requires network access
- ✅ **Tests**: Can run without Docker (mocks used)

### Test Failures (14/96)
- ⚠️ **Circuit Breaker**: Timer mocking needs configuration
- ⚠️ **Veeqo Adapter**: HTTP mocking needs setup
- ✅ **Fix Guide**: See TESTING_STATUS.md for solutions

---

## 🤝 Contributing

### Before Committing
```bash
# 1. Run tests
pnpm test

# 2. Check types
pnpm build

# 3. Format code
pnpm format

# 4. Commit with conventional commits
git commit -m "feat: add new feature"
```

### Commit Message Format
```
feat: New feature
fix: Bug fix
docs: Documentation
test: Test updates
refactor: Code refactoring
chore: Maintenance
```

---

## 💡 Tips & Tricks

### Cursor IDE Shortcuts
- `Ctrl+Shift+T` - Run all tests
- `Ctrl+Shift+D` - Start development
- `Ctrl+Shift+P` - Push database schema

### Code Snippets (type + Tab)
- `provider-adapter` - New provider adapter
- `test-suite` - New test file
- `circuit-execute` - Circuit breaker pattern
- `cacheable` - Cache decorator

### Debugging Tests
```bash
# Run with debugger
node --inspect node_modules/.bin/jest --runInBand

# Verbose output
pnpm --filter @pkg/providers test --verbose

# Debug specific test
pnpm --filter @pkg/providers test -t "test name"
```

---

## 🆘 Getting Help

### Documentation
1. Check **FORWARD_PLAN.md** for roadmap
2. Check **TESTING_STATUS.md** for test issues
3. Check **CODE_ANALYSIS_SUMMARY.md** for overview

### Troubleshooting
```bash
# Clean install
rm -rf node_modules pnpm-lock.yaml
pnpm install

# Rebuild everything
pnpm build

# Reset database (requires Docker)
docker-compose down -v
docker-compose up -d
pnpm db:push
```

### Common Errors

**Error: Cannot find module '@prisma/client'**
```bash
# Solution: Generate Prisma client
pnpm --filter @pkg/db db:generate
```

**Error: Docker not running**
```bash
# Solution: Start Docker or run tests without database
docker-compose up -d
# OR run tests only (they use mocks)
pnpm --filter @pkg/providers test
```

**Error: Tests timing out**
```bash
# Solution: Increase timeout in jest.config.js
testTimeout: 10000  // 10 seconds
```

---

## 📊 Project Health

### Current Status: 85% Complete ✅

**What's Working:**
- ✅ TypeScript compilation
- ✅ Jest test infrastructure  
- ✅ 82/96 tests passing
- ✅ Provider adapters implemented
- ✅ Error handling complete
- ✅ Caching layer working

**What Needs Work:**
- ⚠️ 14 tests need fixes (clear solutions documented)
- ⚠️ Integration tests need mocking
- ⚠️ Some documentation needs updates

---

## 🎯 Next Steps

### For New Developers
1. ✅ Read this guide
2. ✅ Run `pnpm install`
3. ✅ Run `pnpm test`
4. ✅ Read FORWARD_PLAN.md
5. ✅ Pick a task from the roadmap

### For Contributors
1. Check TESTING_STATUS.md for test fixes needed
2. Pick Priority 1 or Priority 2 items
3. Write tests first (TDD approach)
4. Submit PR with conventional commits
5. Ensure all tests pass

---

## 🌟 Key Features to Explore

### Circuit Breaker Pattern
```typescript
// Automatic fault tolerance
const result = await provider.quote(shipment);
// Fails gracefully if provider is down
```

### Multi-Provider Support
```typescript
// Get quotes from all providers
const quotes = await quoteAll(shipmentInput);
// Automatically selects best provider
```

### Intelligent Caching
```typescript
// Automatic caching with TTL
const cachedResult = await cachedProvider.quote(shipment);
// Second call returns from cache
```

### Error Classification
```typescript
// Errors are automatically classified
try {
  await provider.quote(shipment);
} catch (error) {
  if (error.isRetryable) {
    // Retry logic
  }
}
```

---

## 📞 Support

- 📖 **Documentation**: See docs/ directory
- 🐛 **Issues**: Create GitHub issue
- 💬 **Questions**: Check FORWARD_PLAN.md FAQ
- 🔍 **Architecture**: Read AGENTS.md

---

**Last Updated:** 2024-09-30  
**Version:** 1.0  
**Status:** Development Ready 🚀

**Happy Coding!** 🎉
