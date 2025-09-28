# Veeqo Integration Verification Guide

This document outlines the comprehensive verification process for the Veeqo API integration in the multiship providers system.

## Overview

The Veeqo integration provides shipping rate quotes and purchase functionality through the Veeqo API. This verification suite ensures the integration works correctly across all components.

## Test Structure

### Unit Tests (`unit/veeqo-adapter.test.ts`)
- **VeeqoAdapter initialization and configuration**
- **Circuit breaker state management**
- **Error handling and classification**
- **Input validation**
- **Response mapping**

### Integration Tests (`integration/veeqo-adapter.test.ts`)
- **Real API connectivity** (requires valid credentials)
- **Request/response format validation**
- **Unit conversion accuracy**
- **Network resilience and retry logic**
- **Error response handling**

### Verification Script (`verify-veeqo-integration.ts`)
- **End-to-end integration verification**
- **Configuration validation**
- **Health check automation**
- **CLI interface for CI/CD integration**

## Verification Checklist

### ✅ Configuration Verification
- [x] Environment variables properly set (`VEEQO_API_KEY`, `VEEQO_API_BASE`)
- [x] API key format validation
- [x] Provider configuration loading
- [x] Circuit breaker configuration

### ✅ Authentication Verification
- [x] API key authentication headers
- [x] Bearer token format
- [x] User-Agent identification
- [x] Request signing (if required)

### ✅ Core Functionality Verification
- [x] Health check endpoint (`/users/me`)
- [x] Allocation package setting (`PUT /allocations/{id}/package`)
- [x] Rate quote retrieval (`GET /allocations/{id}/shipping_rates`)
- [x] Shipment purchase (`POST /shipments`)

### ✅ Data Transformation Verification
- [x] Unit conversions (inches ↔ cm, pounds ↔ ounces)
- [x] Request body formatting
- [x] Response data mapping
- [x] Currency handling

### ✅ Error Handling Verification
- [x] Network error classification
- [x] Rate limit error handling (`429` responses)
- [x] Server error handling (`5xx` responses)
- [x] Authentication error handling (`401` responses)
- [x] Circuit breaker state transitions

### ✅ Resilience Verification
- [x] Retry logic with exponential backoff
- [x] Circuit breaker failure threshold
- [x] Network timeout handling
- [x] Graceful degradation

## Running the Tests

### Prerequisites
1. **Environment Setup**: Ensure `VEEQO_API_KEY` is set in `.env`
2. **Dependencies**: Run `npm install` in the providers package
3. **Test Database**: No database required for Veeqo tests

### Unit Tests
```bash
# Run unit tests only
cd packages/providers
npm test -- src/test/unit/veeqo-adapter.test.ts

# Run with coverage
npm test -- --coverage src/test/unit/veeqo-adapter.test.ts
```

### Integration Tests
```bash
# Run integration tests (requires valid API credentials)
cd packages/providers
npm test -- src/test/integration/veeqo-adapter.test.ts

# Run specific integration test
npm test -- --testNamePattern="should handle allocation package request format"
```

### Verification Script
```bash
# Run all verification tests
cd packages/providers
npm run verify:veeqo

# Health check only (quick verification)
npm run verify:veeqo:health

# Configuration validation only
npm run verify:veeqo:config

# With custom log level
VERIFY_LOG_LEVEL=debug npm run verify:veeqo
```

## Test Environment Setup

### For Development Testing
```bash
# Create test environment file
cp .env .env.test
# Edit .env.test with test API credentials
```

### For CI/CD Integration
```bash
# Set environment variables in CI
export VEEQO_API_KEY="Vqt/test-key"
export VEEQO_API_BASE="https://api.veeqo.com"

# Run verification
npm run verify:veeqo
```

## Manual Testing Steps

### 1. Configuration Test
```typescript
import { VeeqoAdapter } from '../adapters/veeqo-adapter.js';

const adapter = new VeeqoAdapter();
console.log('Enabled:', adapter.enabled);
console.log('Name:', adapter.name);
```

### 2. Health Check Test
```typescript
const adapter = new VeeqoAdapter();
const isHealthy = await adapter.healthCheck();
console.log('Health Check:', isHealthy);
```

### 3. Quote Flow Test
```typescript
const testInput = {
  to: { name: 'Test', street1: '123 St', city: 'City', state: 'ST', zip: '12345', country: 'US' },
  from: { name: 'Test', street1: '456 St', city: 'City', state: 'ST', zip: '12345', country: 'US' },
  parcel: { length: 10, width: 5, height: 5, weight: 1 },
  veeqo: { allocationId: 12345 }
};

const quotes = await adapter.quote(testInput);
console.log('Quotes:', quotes);
```

### 4. Purchase Flow Test
```typescript
const result = await adapter.purchase('rate_123', 'shipment_456', 12345);
console.log('Purchase Result:', result);
```

## Troubleshooting

### Common Issues

#### Authentication Failures
- Verify `VEEQO_API_KEY` is set correctly
- Check API key format (should start with `Vqt/`)
- Ensure API key has necessary permissions

#### Network Timeouts
- Check `VEEQO_API_BASE` URL
- Verify network connectivity
- Review timeout configuration in provider config

#### Circuit Breaker Issues
- Monitor failure threshold (default: 5)
- Check recovery timeout (default: 60000ms)
- Review retry configuration

#### Data Format Issues
- Verify unit conversions for parcels
- Check address format requirements
- Validate allocation ID format

### Debug Mode
```bash
# Enable debug logging
export VERIFY_LOG_LEVEL=debug
npm run verify:veeqo

# Or run individual tests with debug
DEBUG=* npm test src/test/unit/veeqo-adapter.test.ts
```

## Monitoring Integration

### Health Check Endpoint
The adapter provides a `healthCheck()` method that can be integrated into monitoring systems:

```typescript
// For monitoring dashboards
app.get('/health/veeqo', async (req, res) => {
  const adapter = new VeeqoAdapter();
  const isHealthy = await adapter.healthCheck();
  res.json({ service: 'veeqo', healthy: isHealthy });
});
```

### Metrics Collection
Key metrics to monitor:
- Response times
- Error rates
- Circuit breaker state
- Cache hit rates
- Rate limit status

## Security Considerations

### API Key Management
- Store API keys securely (environment variables)
- Rotate keys regularly
- Use test keys for development
- Monitor for key exposure

### Request Security
- Validate all input data
- Implement request rate limiting
- Log security-relevant events
- Use HTTPS for all API calls

## Performance Benchmarks

### Expected Performance
- Health check: < 2 seconds
- Quote generation: < 10 seconds
- Purchase completion: < 5 seconds
- Circuit breaker recovery: < 60 seconds

### Load Testing
```bash
# Performance tests
npm test -- src/test/performance/veeqo-performance.test.ts
```

## Maintenance

### Regular Tasks
- [ ] Update test credentials monthly
- [ ] Review and update API endpoints
- [ ] Monitor Veeqo API changelog
- [ ] Update error handling for new API responses
- [ ] Validate unit conversions against API docs

### Update Procedures
1. Review Veeqo API documentation changes
2. Update test expectations
3. Run full verification suite
4. Update integration documentation
5. Deploy changes

## Support

For issues with the Veeqo integration:
1. Check this verification guide
2. Run the verification script
3. Review test logs for specific errors
4. Check Veeqo API status page
5. Contact Veeqo support if API issues persist