# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Architecture Patterns
- Provider adapters must implement ProviderAdapter interface with healthCheck() method (packages/providers/src/types.ts)
- Circuit breaker pattern built into ProviderError system - check error.isRetryable flag
- Provider factory singleton manages all shipping provider instances with automatic failover
- Custom cache implementations require namespace support for multi-tenant isolation

## Critical Dependencies
- All packages use "type": "module" - pure ESM setup requires ES module syntax
- Redis cache implementation requires ioredis client with specific connection config
- Provider adapters depend on external APIs with rate limiting and authentication requirements

## Testing Requirements
- Jest runs from packages/providers/src/test/config/jest.config.js with ESM support
- Test database setup requires separate test environment (packages/providers/src/test/setup/test-db.ts)
- Performance tests validate circuit breaker and cache behavior under load

## Database & Infrastructure
- Docker compose services must run before database operations (ports: db:5432, redis:6379)
- Prisma schema changes require manual db push from packages/db/ directory
- Database migrations are forward-only by design - no rollback capability

## Error Handling
- ProviderError hierarchy provides specific error types: NetworkError, RateLimitError, AuthenticationError, CircuitBreakerError
- Error context includes correlationId for distributed tracing across provider calls
- Failed provider calls automatically retried based on error.isRetryable classification